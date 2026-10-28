-- =====================================================================
-- Migration 20261028_005 - enforce the public registration deadline server-side
--
-- Deadline: 05 November 2026, 11:59 PM Pakistan Standard Time (UTC+05:00).
-- New public registrations are rejected from 06 November 2026 00:00:00 PKT.
-- The database verifies the authenticated admin JWT; client-side flags are not trusted.
-- This migration does not delete or rewrite any existing registrations or funds rows.
-- Run after 20261027_004_cancellations_expenses.sql.
-- Safe to re-run.
-- =====================================================================
begin;

create or replace function public.submit_registration(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.registrations;
  v_email text := public.jwt_email();
  v_admin boolean := public.jwt_email() in ('waseemfida@khawrai.app','nsfida@khawrai.app');
  v_id uuid := (p->>'id')::uuid;
  v_cnic text := regexp_replace(coalesce(p->>'cnic',''), '\D','','g');
begin
  -- Safe retry: if this exact registration already committed before the deadline,
  -- return its existing number instead of creating a duplicate.
  select * into r from public.registrations where id = v_id;
  if found then
    if r.cnic <> v_cnic then raise exception 'Registration retry does not match the original record'; end if;
    return jsonb_build_object('reg_no', r.reg_no);
  end if;

  -- The timestamp is evaluated by PostgreSQL itself. The frontend countdown is not trusted.
  if not v_admin and clock_timestamp() >= timestamptz '2026-11-06 00:00:00+05:00' then
    raise exception 'Registration has closed';
  end if;

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
  values (v_id, trim(p->>'name'), trim(p->>'father_name'), v_cnic,
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
  on conflict (id) do nothing
  returning * into r;

  -- Handles a simultaneous retry of the same UUID without duplicating a row.
  if not found then
    select * into r from public.registrations where id = v_id;
    if not found or r.cnic <> v_cnic then raise exception 'Registration retry could not be reconciled safely'; end if;
  end if;
  return jsonb_build_object('reg_no', r.reg_no);
end $$;
revoke all on function public.submit_registration(jsonb) from public;
grant execute on function public.submit_registration(jsonb) to anon, authenticated;

-- Stop public uploads after the deadline as well, while keeping post-deadline
-- uploads available to verified admins registering runners from the admin workflow.
drop policy if exists "kmr upload photos" on storage.objects;
create policy "kmr upload photos" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'photos' and (
    public.jwt_email() in ('waseemfida@khawrai.app','nsfida@khawrai.app')
    or clock_timestamp() < timestamptz '2026-11-06 00:00:00+05:00'
  ));

drop policy if exists "kmr upload documents" on storage.objects;
create policy "kmr upload documents" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'documents' and (
    public.jwt_email() in ('waseemfida@khawrai.app','nsfida@khawrai.app')
    or clock_timestamp() < timestamptz '2026-11-06 00:00:00+05:00'
  ));

drop policy if exists "kmr upload originals" on storage.objects;
create policy "kmr upload originals" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'originals' and (
    public.jwt_email() in ('waseemfida@khawrai.app','nsfida@khawrai.app')
    or clock_timestamp() < timestamptz '2026-11-06 00:00:00+05:00'
  ));

commit;
