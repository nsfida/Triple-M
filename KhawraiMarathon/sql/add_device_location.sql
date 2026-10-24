-- =====================================================================
-- One registration per device + device ID + Google Maps location + original-quality images.
-- Run once in the SQL Editor (also appended to schema.sql for new installs). Safe to re-run.
-- =====================================================================
alter table public.registrations
  add column if not exists device_id   text,
  add column if not exists fingerprint text,
  add column if not exists lat double precision check (lat between -90 and 90),
  add column if not exists lng double precision check (lng between -180 and 180),
  add column if not exists location_accuracy numeric,
  add column if not exists location_at timestamptz,
  add column if not exists user_agent  text,
  add column if not exists photo_original_path      text,
  add column if not exists cnic_front_original_path text,
  add column if not exists cnic_back_original_path  text;

-- The database itself refuses a second registration from the same device.
create unique index if not exists registrations_device_id_key on public.registrations (device_id) where device_id is not null;
create index if not exists registrations_fingerprint_idx on public.registrations (fingerprint);

-- Lets the form check a device BEFORE the person fills it in (returns only true/false).
create or replace function public.device_registered(p_device text) returns boolean
language sql security definer set search_path = public as
$$ select exists (select 1 from public.registrations where device_id = p_device) $$;
revoke all on function public.device_registered(text) from public;
grant execute on function public.device_registered(text) to anon, authenticated;

create or replace function public.submit_registration(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.registrations;
begin
  if coalesce(length(p->>'device_id'), 0) < 16 then raise exception 'Device ID missing'; end if;
  if (p->>'lat') is null or (p->>'lng') is null then raise exception 'Location permission is required'; end if;
  insert into public.registrations (id, name, father_name, cnic, mobile, email, gender, dob, address, district_tehsil,
    sport, association, player_level, years_experience, education,
    official_participation, event_name, event_date, event_level, event_org,
    photo_path, cnic_front_path, cnic_back_path, certificate_path, other_doc_path,
    photo_original_path, cnic_front_original_path, cnic_back_original_path,
    declaration_accepted, signature_name, signature_path, payment_ref, status,
    device_id, fingerprint, lat, lng, location_accuracy, location_at, user_agent)
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
    p->>'device_id', nullif(p->>'fingerprint',''), (p->>'lat')::double precision, (p->>'lng')::double precision,
    nullif(p->>'accuracy','')::numeric, now(),
    left(coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json ->> 'user-agent', 300))
  returning * into r;
  return jsonb_build_object('reg_no', r.reg_no);
end $$;
revoke all on function public.submit_registration(jsonb) from public;
grant execute on function public.submit_registration(jsonb) to anon, authenticated;

-- Private bucket for the untouched originals (photo, CNIC front/back): visitors upload, only admins read.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('originals', 'originals', false, 26214400, array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "kmr upload originals"  on storage.objects;
drop policy if exists "kmr admins originals read"   on storage.objects;
drop policy if exists "kmr admins originals update" on storage.objects;
drop policy if exists "kmr admins originals delete" on storage.objects;
create policy "kmr upload originals" on storage.objects for insert to anon, authenticated with check (bucket_id = 'originals');
create policy "kmr admins originals read" on storage.objects for select to authenticated
  using (bucket_id = 'originals' and public.jwt_email() in ('waseemfida@khawrai.app','nsfida@khawrai.app'));
create policy "kmr admins originals update" on storage.objects for update to authenticated
  using (bucket_id = 'originals' and public.jwt_email() in ('waseemfida@khawrai.app','nsfida@khawrai.app'));
create policy "kmr admins originals delete" on storage.objects for delete to authenticated
  using (bucket_id = 'originals' and public.jwt_email() in ('waseemfida@khawrai.app','nsfida@khawrai.app'));
