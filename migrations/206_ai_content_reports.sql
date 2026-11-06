-- 206_ai_content_reports.sql
--
-- Purpose: "Report this AI response" for every generative AI answer in the
-- product (Microsoft Store policy 11.16, Live Generative AI Content).
--   * Triplem AI (signed-in workspace assistant) answers.
--   * Aziz / Triplem VIP AI Assistant answers in the live chat (signed-in
--     users and visitors).
-- A report stores the reason, the reported AI text, the question that led to
-- it and an optional comment, and notifies the administrators (bell + push)
-- through the existing app_notify_admins helper. Admins can list reports and
-- mark them reviewed.
--
-- Change: ADDITIVE ONLY.
--   New table: app_ai_content_reports (direct access denied; RPCs only).
--   New functions: app_report_ai_content, app_admin_list_ai_content_reports,
--   app_admin_set_ai_content_report_status.
--   No existing table, column, constraint, index, policy, trigger, function
--   or row is altered or deleted. Safe to run more than once.
--
-- Rollback (if ever needed):
--   drop function if exists public.app_report_ai_content(text,text,text,text,text,jsonb),
--     public.app_admin_list_ai_content_reports(text,integer),
--     public.app_admin_set_ai_content_report_status(uuid,text,text);
--   drop table if exists public.app_ai_content_reports;

begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.app_ai_content_reports (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('triplem_ai', 'aziz', 'live_chat_ai')),
  reason text not null check (reason in ('offensive', 'harmful', 'sexual', 'inaccurate', 'privacy', 'other')),
  details text not null default '' check (char_length(details) <= 1000),
  ai_content text not null check (char_length(ai_content) between 1 and 8000),
  prompt text not null default '' check (char_length(prompt) <= 2000),
  context jsonb not null default '{}'::jsonb,
  content_hash text not null,
  reporter_id uuid references public.app_users(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  admin_note text not null default '' check (char_length(admin_note) <= 1000),
  reviewed_at timestamptz,
  reviewed_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists app_ai_content_reports_status_idx
  on public.app_ai_content_reports(status, created_at desc);
create index if not exists app_ai_content_reports_reporter_idx
  on public.app_ai_content_reports(reporter_id, created_at desc);
create index if not exists app_ai_content_reports_created_idx
  on public.app_ai_content_reports(created_at desc);

alter table public.app_ai_content_reports enable row level security;
drop policy if exists app_ai_content_reports_deny_all on public.app_ai_content_reports;
create policy app_ai_content_reports_deny_all
  on public.app_ai_content_reports for all to anon, authenticated
  using (false) with check (false);
revoke all on table public.app_ai_content_reports from anon, authenticated;

-- Anyone who can see an AI answer can report it (Aziz also answers visitors).
-- Signed-in reports are linked to the account. Limits: 20 reports per hour per
-- account, 60 per hour for all visitors together; the same text reported twice
-- by the same reporter within a day is accepted once.
create or replace function public.app_report_ai_content(
  p_source text,
  p_reason text,
  p_ai_content text,
  p_prompt text default '',
  p_details text default '',
  p_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  uid uuid := public.current_app_user_id();
  src text := lower(trim(coalesce(p_source, '')));
  why text := lower(trim(coalesce(p_reason, '')));
  body text := left(trim(coalesce(p_ai_content, '')), 8000);
  ask text := left(trim(coalesce(p_prompt, '')), 2000);
  note text := left(trim(coalesce(p_details, '')), 1000);
  ctx jsonb := '{}'::jsonb;
  hash text;
  recent integer;
  rid uuid;
  who text := 'A visitor';
  reason_label text;
  source_label text;
begin
  if src not in ('triplem_ai', 'aziz', 'live_chat_ai') then raise exception 'Unsupported AI source'; end if;
  if why not in ('offensive', 'harmful', 'sexual', 'inaccurate', 'privacy', 'other') then raise exception 'Choose a reason'; end if;
  if body = '' then raise exception 'Nothing to report'; end if;
  if why = 'other' and note = '' then raise exception 'Please describe the problem'; end if;

  -- Keep only small, known context keys (no free-form objects).
  if jsonb_typeof(p_context) = 'object' then
    select coalesce(jsonb_object_agg(k, left(v, 200)), '{}'::jsonb) into ctx
    from (
      select key as k, p_context->>key as v
      from jsonb_object_keys(p_context) as key
      where key in ('session_id', 'message_id', 'model', 'surface', 'app', 'message_at')
        and jsonb_typeof(p_context->key) in ('string', 'number')
    ) s;
  end if;

  if uid is not null then
    if not exists (select 1 from public.app_users where id = uid and is_active) then uid := null; end if;
  end if;

  hash := encode(extensions.digest(src || '|' || body, 'sha256'), 'hex');

  if uid is not null then
    if exists (select 1 from public.app_ai_content_reports
               where reporter_id = uid and content_hash = hash and created_at > now() - interval '1 day') then
      return jsonb_build_object('ok', true, 'duplicate', true);
    end if;
    select count(*) into recent from public.app_ai_content_reports
      where reporter_id = uid and created_at > now() - interval '1 hour';
    if recent >= 20 then raise exception 'Too many reports. Please try again later.'; end if;
  else
    if exists (select 1 from public.app_ai_content_reports
               where reporter_id is null and content_hash = hash and created_at > now() - interval '1 day'
                 and coalesce(context->>'session_id', '') = coalesce(ctx->>'session_id', '')) then
      return jsonb_build_object('ok', true, 'duplicate', true);
    end if;
    select count(*) into recent from public.app_ai_content_reports
      where reporter_id is null and created_at > now() - interval '1 hour';
    if recent >= 60 then raise exception 'Too many reports. Please try again later.'; end if;
  end if;

  insert into public.app_ai_content_reports(source, reason, details, ai_content, prompt, context, content_hash, reporter_id)
  values (src, why, note, body, ask, ctx, hash, uid)
  returning id into rid;

  if uid is not null then
    select coalesce(nullif(trim(display_name), ''), username, 'A user') into who from public.app_users where id = uid;
  end if;
  reason_label := case why
    when 'offensive' then 'Offensive or hateful'
    when 'harmful' then 'Harmful or dangerous'
    when 'sexual' then 'Sexual content'
    when 'inaccurate' then 'Inaccurate or misleading'
    when 'privacy' then 'Privacy concern'
    else 'Other' end;
  source_label := case src when 'triplem_ai' then 'Triplem AI' when 'aziz' then 'Aziz' else 'Live chat AI' end;

  begin
    perform public.app_notify_admins(
      'system',
      'AI response reported',
      format('%s reported an answer from %s (%s): "%s"', who, source_label, reason_label, left(regexp_replace(body, '\s+', ' ', 'g'), 180)),
      uid,
      null,
      jsonb_build_object('type', 'ai_content_report', 'report_id', rid, 'source', src, 'reason', why)
    );
  exception when others then
    -- The report is stored even if the notification cannot be created.
    null;
  end;

  return jsonb_build_object('ok', true, 'report_id', rid);
end
$fn$;
revoke all on function public.app_report_ai_content(text,text,text,text,text,jsonb) from public;
grant execute on function public.app_report_ai_content(text,text,text,text,text,jsonb) to anon, authenticated, service_role;

create or replace function public.app_admin_list_ai_content_reports(p_status text default 'open', p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  admin public.app_users := public.app_require_admin_comms();
  st text := lower(trim(coalesce(p_status, 'open')));
  lim integer := greatest(1, least(coalesce(p_limit, 100), 500));
  items jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc), '[]'::jsonb) into items
  from (
    select r.id, r.source, r.reason, r.details, r.ai_content, r.prompt, r.context, r.status,
           r.admin_note, r.created_at, r.reviewed_at, r.reporter_id,
           u.username as reporter_username,
           coalesce(nullif(trim(u.display_name), ''), u.username) as reporter_name
    from public.app_ai_content_reports r
    left join public.app_users u on u.id = r.reporter_id
    where st = 'all' or r.status = st
    order by r.created_at desc
    limit lim
  ) x;
  return jsonb_build_object('items', items);
end
$fn$;
revoke all on function public.app_admin_list_ai_content_reports(text,integer) from public;
grant execute on function public.app_admin_list_ai_content_reports(text,integer) to anon, authenticated;

create or replace function public.app_admin_set_ai_content_report_status(p_id uuid, p_status text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  admin public.app_users := public.app_require_admin_comms();
  st text := lower(trim(coalesce(p_status, '')));
begin
  if st not in ('open', 'reviewed', 'dismissed') then raise exception 'Invalid status'; end if;
  update public.app_ai_content_reports
     set status = st,
         admin_note = case when p_note is null then admin_note else left(trim(p_note), 1000) end,
         reviewed_at = case when st = 'open' then null else now() end,
         reviewed_by = case when st = 'open' then null else admin.id end
   where id = p_id;
  if not found then raise exception 'Report not found'; end if;
  return jsonb_build_object('ok', true);
end
$fn$;
revoke all on function public.app_admin_set_ai_content_report_status(uuid,text,text) from public;
grant execute on function public.app_admin_set_ai_content_report_status(uuid,text,text) to anon, authenticated;

commit;

notify pgrst, 'reload schema';
