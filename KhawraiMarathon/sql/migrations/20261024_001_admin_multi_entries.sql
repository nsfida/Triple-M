-- =====================================================================
-- Migration 20261024_001 - admins can record unlimited registrations
-- ---------------------------------------------------------------------
-- What it does
--   1. Adds registrations.entered_by (NULL = public self-registration,
--      otherwise the admin username who recorded the entry).
--   2. Limits the "one registration per device" rule to PUBLIC entries only.
--   3. submit_registration(): when the caller is a signed-in admin the device
--      ID and location are optional and are not used for the device rule.
--   4. device_registered(): ignores admin-entered rows.
--
-- Safety
--   * Additive and idempotent: safe to run more than once.
--   * No rows are deleted or rewritten. Existing registrations keep
--     entered_by = NULL, so they behave exactly as before.
--   * The new unique index is created BEFORE the old one is dropped,
--     all inside one transaction (all-or-nothing).
--   * Undo with 20261024_001_admin_multi_entries.rollback.sql
-- Run in: Supabase Dashboard > SQL Editor (after schema.sql).
-- =====================================================================
begin;

-- 1. who recorded the entry (NULL for public self-registrations)
alter table public.registrations add column if not exists entered_by text;

-- 2. one registration per device - public entries only
create unique index if not exists registrations_device_id_public_key
  on public.registrations (device_id)
  where device_id is not null and entered_by is null;
drop index if exists public.registrations_device_id_key;

-- 3. the pre-check used by the public form ignores admin entries
create or replace function public.device_registered(p_device text) returns boolean
language sql security definer set search_path = public as
$$ select exists (select 1 from public.registrations where device_id = p_device and entered_by is null) $$;
revoke all on function public.device_registered(text) from public;
grant execute on function public.device_registered(text) to anon, authenticated;

-- 4. registration RPC: admin-aware (admin identity comes from the verified JWT, it cannot be faked by the client)
create or replace function public.submit_registration(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.registrations;
  v_email text := public.jwt_email();
  v_admin boolean := public.jwt_email() in ('waseemfida@khawrai.app','nsfida@khawrai.app');
begin
  if not v_admin then
    if coalesce(length(p->>'device_id'), 0) < 16 then raise exception 'Device ID missing'; end if;
    if (p->>'lat') is null or (p->>'lng') is null then raise exception 'Location permission is required'; end if;
  end if;
  insert into public.registrations (id, name, father_name, cnic, mobile, email, gender, dob, address, district_tehsil,
    sport, association, player_level, years_experience, education,
    official_participation, event_name, event_date, event_level, event_org,
    photo_path, cnic_front_path, cnic_back_path, certificate_path, other_doc_path,
    photo_original_path, cnic_front_original_path, cnic_back_original_path,
    declaration_accepted, signature_name, signature_path, payment_ref, status,
    device_id, fingerprint, lat, lng, location_accuracy, location_at, user_agent, entered_by)
  values ((p->>'id')::uuid, trim(p->>'name'), trim(p->>'father_name'), regexp_replace(p->>'cnic','\D','','g'),
    regexp_replace(p->>'mobile','\D','','g'), nullif(trim(p->>'email'),''), p->>'gender', (p->>'dob')::date,
    trim(p->>'address'), trim(p->>'district_tehsil'),
    trim(p->>'sport'), nullif(trim(p->>'association'),''), nullif(p->>'player_level',''), nullif(trim(p->>'years_experience'),''), nullif(trim(p->>'education'),''),
    coalesce((p->>'official_participation')::boolean,false), nullif(trim(p->>'event_name'),''), nullif(trim(p->>'event_date'),''),
    nullif(p->>'event_level',''), nullif(trim(p->>'event_org'),''),
    p->>'photo_path', p->>'cnic_front_path', p->>'cnic_back_path', nullif(p->>'certificate_path',''), nullif(p->>'other_doc_path',''),
    nullif(p->>'photo_original_path',''), nullif(p->>'cnic_front_original_path',''), nullif(p->>'cnic_back_original_path',''),
    coalesce((p->>'declaration_accepted')::boolean,false), trim(p->>'signature_name'), p->>'signature_path',
    nullif(trim(p->>'payment_ref'),''), 'pending',
    case when v_admin then null else p->>'device_id' end,
    case when v_admin then null else nullif(p->>'fingerprint','') end,
    nullif(p->>'lat','')::double precision, nullif(p->>'lng','')::double precision,
    nullif(p->>'accuracy','')::numeric, case when nullif(p->>'lat','') is not null then now() end,
    left(coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json ->> 'user-agent', 300),
    case when v_admin then split_part(v_email, '@', 1) end)
  returning * into r;
  return jsonb_build_object('reg_no', r.reg_no);
end $$;
revoke all on function public.submit_registration(jsonb) from public;
grant execute on function public.submit_registration(jsonb) to anon, authenticated;

commit;

-- ---------------------------------------------------------------------
-- Optional checks (run separately):
--   select indexname from pg_indexes where tablename = 'registrations' and indexname like 'registrations_device_id%';
--   select count(*) filter (where entered_by is null) as public_entries, count(*) filter (where entered_by is not null) as admin_entries from public.registrations;
-- ---------------------------------------------------------------------
