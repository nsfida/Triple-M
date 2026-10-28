-- KMR-S3 marathon results and race control
-- Public pages have read-only access; every result/race-state write must pass an admin-verified RPC.
-- Safe to re-run. Does not alter registration or funds records.
begin;

create table if not exists public.marathon_race_control (
  id boolean primary key default true check (id = true),
  race_status text not null default 'scheduled' check (race_status in ('scheduled','in_progress','completed')),
  scheduled_at timestamptz not null default '2026-11-15 16:00:00+05'::timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  public_message text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.marathon_race_control (id, race_status, scheduled_at, public_message)
values (true, 'scheduled', '2026-11-15 16:00:00+05'::timestamptz, '')
on conflict (id) do nothing;

create table if not exists public.marathon_results (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique references public.registrations(id) on delete restrict,
  bib_number text,
  status text not null default 'registered' check (status in ('registered','running','finished','dnf','dsq')),
  finish_time_seconds integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marathon_results_finish_time_valid check (
    (status = 'finished' and finish_time_seconds is not null and finish_time_seconds between 1 and 172800)
    or (status <> 'finished' and finish_time_seconds is null)
  ),
  constraint marathon_results_bib_length check (bib_number is null or char_length(trim(bib_number)) between 1 and 20)
);
create unique index if not exists marathon_results_bib_number_unique
  on public.marathon_results (bib_number) where bib_number is not null;
create index if not exists marathon_results_status_time_idx
  on public.marathon_results (status, finish_time_seconds, updated_at);

alter table public.marathon_race_control enable row level security;
alter table public.marathon_results enable row level security;

-- These two tables contain only information intended for the public results board.
-- Remove direct write privileges; writes happen through verified SECURITY DEFINER RPCs only.
revoke all on public.marathon_race_control from public, anon, authenticated;
revoke all on public.marathon_results from public, anon, authenticated;
grant select on public.marathon_race_control to anon, authenticated;
grant select on public.marathon_results to anon, authenticated;

drop policy if exists "public read race control" on public.marathon_race_control;
drop policy if exists "public read marathon results" on public.marathon_results;
create policy "public read race control" on public.marathon_race_control
  for select to anon, authenticated using (true);
create policy "public read marathon results" on public.marathon_results
  for select to anon, authenticated using (true);

-- Narrow public view. Private registration fields (CNIC, phone, email, address, documents) are never exposed.
create or replace view public.public_marathon_results as
with ranked as (
  select
    mr.id as result_id,
    mr.registration_id,
    coalesce(nullif(trim(mr.bib_number), ''), r.reg_no) as bib_number,
    r.reg_no,
    r.name as runner_name,
    r.photo_path,
    mr.status,
    mr.finish_time_seconds,
    mr.created_at,
    mr.updated_at,
    case when mr.status = 'finished' and mr.finish_time_seconds is not null then
      row_number() over (
        partition by (mr.status = 'finished' and mr.finish_time_seconds is not null)
        order by mr.finish_time_seconds asc nulls last, r.reg_no asc, mr.id asc
      )
    end as computed_place
  from public.marathon_results mr
  join public.registrations r on r.id = mr.registration_id
  where r.status = 'confirmed' and coalesce(r.is_cancelled, false) = false
)
select result_id, registration_id, bib_number, reg_no, runner_name, photo_path, status,
       finish_time_seconds, computed_place as place, created_at, updated_at
from ranked;
revoke all on public.public_marathon_results from public, anon, authenticated;
grant select on public.public_marathon_results to anon, authenticated;

create or replace function public.admin_upsert_marathon_result(
  p_registration_id uuid,
  p_bib_number text default null,
  p_status text default 'registered',
  p_finish_time_seconds integer default null
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_registration_status text;
  v_cancelled boolean;
  v_result_id uuid;
  v_bib text;
begin
  if public.jwt_email() not in ('waseemfida@khawrai.app','nsfida@khawrai.app') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_registration_id is null then raise exception 'Select a registered runner.'; end if;
  if p_status not in ('registered','running','finished','dnf','dsq') then
    raise exception 'Invalid runner result status.';
  end if;
  v_bib := nullif(trim(coalesce(p_bib_number, '')), '');
  if v_bib is not null and char_length(v_bib) > 20 then raise exception 'Bib number must be 20 characters or fewer.'; end if;
  if p_status = 'finished' then
    if p_finish_time_seconds is null or p_finish_time_seconds < 1 or p_finish_time_seconds > 172800 then
      raise exception 'Enter a valid finish time between 00:00:01 and 48:00:00.';
    end if;
  else
    p_finish_time_seconds := null;
  end if;

  select status, coalesce(is_cancelled, false)
    into v_registration_status, v_cancelled
    from public.registrations where id = p_registration_id;
  if not found then raise exception 'Runner registration was not found.'; end if;
  if v_registration_status <> 'confirmed' or v_cancelled then
    raise exception 'Only confirmed, non-cancelled runners can appear in official results.';
  end if;

  insert into public.marathon_results (registration_id, bib_number, status, finish_time_seconds, updated_at)
  values (p_registration_id, v_bib, p_status, p_finish_time_seconds, now())
  on conflict (registration_id) do update
    set bib_number = excluded.bib_number,
        status = excluded.status,
        finish_time_seconds = excluded.finish_time_seconds,
        updated_at = now()
  returning id into v_result_id;
  return v_result_id;
exception when unique_violation then
  raise exception 'That bib number is already assigned to another runner.' using errcode = '23505';
end;
$$;
revoke all on function public.admin_upsert_marathon_result(uuid, text, text, integer) from public, anon;
grant execute on function public.admin_upsert_marathon_result(uuid, text, text, integer) to authenticated;

create or replace function public.admin_delete_marathon_result(p_result_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if public.jwt_email() not in ('waseemfida@khawrai.app','nsfida@khawrai.app') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  delete from public.marathon_results where id = p_result_id;
  if not found then raise exception 'Result entry was not found.'; end if;
end;
$$;
revoke all on function public.admin_delete_marathon_result(uuid) from public, anon;
grant execute on function public.admin_delete_marathon_result(uuid) to authenticated;

create or replace function public.admin_update_race_control(
  p_race_status text,
  p_public_message text default ''
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_message text := trim(coalesce(p_public_message, ''));
begin
  if public.jwt_email() not in ('waseemfida@khawrai.app','nsfida@khawrai.app') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_race_status not in ('scheduled','in_progress','completed') then
    raise exception 'Choose a valid race state.';
  end if;
  if char_length(v_message) > 300 then raise exception 'Public race announcement must be 300 characters or fewer.'; end if;

  insert into public.marathon_race_control as existing_control (id, race_status, scheduled_at, started_at, ended_at, public_message, updated_at)
  values (
    true,
    p_race_status,
    '2026-11-15 16:00:00+05'::timestamptz,
    case when p_race_status in ('in_progress','completed') then now() else null end,
    case when p_race_status = 'completed' then now() else null end,
    v_message,
    now()
  )
  on conflict (id) do update set
    race_status = excluded.race_status,
    started_at = case
      when excluded.race_status = 'scheduled' then null
      when excluded.race_status = 'in_progress' then
        case when existing_control.race_status = 'in_progress'
          then existing_control.started_at else now() end
      else coalesce(existing_control.started_at, now())
    end,
    ended_at = case
      when excluded.race_status = 'completed' then
        case when existing_control.race_status = 'completed'
          then existing_control.ended_at else now() end
      else null
    end,
    public_message = excluded.public_message,
    updated_at = now();
end;
$$;
revoke all on function public.admin_update_race_control(text, text) from public, anon;
grant execute on function public.admin_update_race_control(text, text) to authenticated;

-- Add both public-read tables to Supabase Realtime when that publication is available.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'marathon_results') then
      execute 'alter publication supabase_realtime add table public.marathon_results';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'marathon_race_control') then
      execute 'alter publication supabase_realtime add table public.marathon_race_control';
    end if;
  end if;
end $$;

comment on table public.marathon_results is 'Public-safe marathon result data; writes restricted to authenticated admin RPCs.';
comment on table public.marathon_race_control is 'Public race status and schedule; updates restricted to authenticated admin RPC.';
comment on view public.public_marathon_results is 'Narrow read-only leaderboard view with computed positions, excluding unconfirmed and cancelled runners.';

commit;
