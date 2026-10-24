-- =====================================================================
-- Khawrai Marathon Season Three - database schema, security and storage
-- Run this whole file once in: Supabase Dashboard > SQL Editor
-- Admin accounts (emails):  waseemfida@khawrai.app 
--                           nsfida@khawrai.app     (both admins can confirm / edit / delete)
-- =====================================================================
create extension if not exists pgcrypto;

create sequence if not exists public.registration_seq start 1;

create table if not exists public.registrations (
  id                    uuid primary key default gen_random_uuid(),
  reg_no                text unique not null default ('KMR3-' || lpad(nextval('public.registration_seq')::text, 4, '0')),
  created_at            timestamptz not null default now(),
  -- 1. personal information
  name                  text not null check (char_length(name) between 2 and 100),
  father_name           text not null check (char_length(father_name) between 2 and 100),
  cnic                  text not null unique check (cnic ~ '^[0-9]{13}$'),
  mobile                text not null check (mobile ~ '^[0-9]{11}$'),
  email                 text,
  gender                text not null check (gender in ('Male','Female')),
  dob                   date not null check (dob between date '1920-01-01' and current_date),
  address               text not null,
  district_tehsil       text not null,
  -- 2. sports information
  sport                 text not null,
  association           text,
  player_level          text check (player_level in ('District','Regional','Provincial','National')),
  years_experience      text,
  education             text,
  -- 3. official sports participation
  official_participation boolean not null default false,
  event_name            text,
  event_date            text,
  event_level           text check (event_level in ('District','Regional','Provincial','National','International')),
  event_org             text,
  -- 4. documents (storage paths)
  photo_path            text not null,
  cnic_front_path       text not null,
  cnic_back_path        text not null,
  certificate_path      text,
  other_doc_path        text,
  -- 5. declaration
  declaration_accepted  boolean not null check (declaration_accepted),
  signature_name        text not null,
  signature_path        text not null,
  -- payment (Rs. 500) - only the two admins can change it
  payment_ref           text,
  status                text not null default 'pending' check (status in ('pending','confirmed')),
  confirmed_at          timestamptz,
  confirmed_by          text
);

alter table public.registrations enable row level security;

-- Nobody (including anon) can touch the table directly; reset any default grants.
revoke all on public.registrations from anon, authenticated;
revoke all on sequence public.registration_seq from anon, authenticated;
grant select, update, delete on public.registrations to authenticated;   -- narrowed by the policies below

-- Helper: who is calling?
create or replace function public.jwt_email() returns text language sql stable as
$$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

-- Read / Update / Delete: both admins.   Insert: nobody directly (see submit_registration).
drop policy if exists "admins read"        on public.registrations;
drop policy if exists "admins update"  on public.registrations;
drop policy if exists "admins delete"  on public.registrations;
create policy "admins read" on public.registrations for select to authenticated
  using (public.jwt_email() in ('waseemfida@khawrai.app','nsfida@khawrai.app'));
create policy "admins update" on public.registrations for update to authenticated
  using (public.jwt_email() in ('waseemfida@khawrai.app','nsfida@khawrai.app')) with check (public.jwt_email() in ('waseemfida@khawrai.app','nsfida@khawrai.app'));
create policy "admins delete" on public.registrations for delete to authenticated
  using (public.jwt_email() in ('waseemfida@khawrai.app','nsfida@khawrai.app'));

-- Keep confirmation metadata consistent
create or replace function public.trg_registration_status() returns trigger language plpgsql as $$
begin
  if new.status = 'confirmed' and old.status <> 'confirmed' then
    new.confirmed_at := now(); new.confirmed_by := split_part(public.jwt_email(), '@', 1);
  elsif new.status = 'pending' then
    new.confirmed_at := null; new.confirmed_by := null;
  end if;
  return new;
end $$;
drop trigger if exists registration_status on public.registrations;
create trigger registration_status before update on public.registrations for each row execute function public.trg_registration_status();

-- Public registration: the ONLY way for visitors to add data. Status is always forced to 'pending'.
create or replace function public.submit_registration(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.registrations;
begin
  insert into public.registrations (id, name, father_name, cnic, mobile, email, gender, dob, address, district_tehsil,
    sport, association, player_level, years_experience, education,
    official_participation, event_name, event_date, event_level, event_org,
    photo_path, cnic_front_path, cnic_back_path, certificate_path, other_doc_path,
    declaration_accepted, signature_name, signature_path, payment_ref, status)
  values ((p->>'id')::uuid, trim(p->>'name'), trim(p->>'father_name'), regexp_replace(p->>'cnic','\D','','g'),
    regexp_replace(p->>'mobile','\D','','g'), nullif(trim(p->>'email'),''), p->>'gender', (p->>'dob')::date,
    trim(p->>'address'), trim(p->>'district_tehsil'),
    trim(p->>'sport'), nullif(trim(p->>'association'),''), nullif(p->>'player_level',''), nullif(trim(p->>'years_experience'),''), nullif(trim(p->>'education'),''),
    coalesce((p->>'official_participation')::boolean,false), nullif(trim(p->>'event_name'),''), nullif(trim(p->>'event_date'),''),
    nullif(p->>'event_level',''), nullif(trim(p->>'event_org'),''),
    p->>'photo_path', p->>'cnic_front_path', p->>'cnic_back_path', nullif(p->>'certificate_path',''), nullif(p->>'other_doc_path',''),
    coalesce((p->>'declaration_accepted')::boolean,false), trim(p->>'signature_name'), p->>'signature_path',
    nullif(trim(p->>'payment_ref'),''), 'pending')
  returning * into r;
  return jsonb_build_object('reg_no', r.reg_no);
end $$;
revoke all on function public.submit_registration(jsonb) from public;
grant execute on function public.submit_registration(jsonb) to anon, authenticated;

-- Public list: only name, age, photo and status are exposed (no CNIC, phone, address...).
create or replace view public.public_participants as
  select id, reg_no, name,
         extract(year from age(dob))::int as age,
         photo_path, status, created_at
  from public.registrations;
grant select on public.public_participants to anon, authenticated;

-- ---------------------------------------------------------------------
-- Storage: photos (public, shown on the list) and documents (private, admins only)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('photos',    'photos',    true,  3145728, array['image/jpeg','image/png']),
  ('documents', 'documents', false, 3145728, array['image/jpeg','image/png'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "kmr upload photos"      on storage.objects;
drop policy if exists "kmr upload documents"   on storage.objects;
drop policy if exists "kmr admins read docs"   on storage.objects;
drop policy if exists "kmr admins update"  on storage.objects;
drop policy if exists "kmr admins delete"  on storage.objects;
create policy "kmr upload photos"    on storage.objects for insert to anon, authenticated with check (bucket_id = 'photos');
create policy "kmr upload documents" on storage.objects for insert to anon, authenticated with check (bucket_id = 'documents');
create policy "kmr admins read docs" on storage.objects for select to authenticated
  using (bucket_id in ('documents','photos') and public.jwt_email() in ('waseemfida@khawrai.app','nsfida@khawrai.app'));
create policy "kmr admins update" on storage.objects for update to authenticated
  using (bucket_id in ('documents','photos') and public.jwt_email() in ('waseemfida@khawrai.app','nsfida@khawrai.app'));
create policy "kmr admins delete" on storage.objects for delete to authenticated
  using (bucket_id in ('documents','photos') and public.jwt_email() in ('waseemfida@khawrai.app','nsfida@khawrai.app'));

-- ---------------------------------------------------------------------
-- Schema access (fixes "permission denied for schema public")
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant execute on function public.jwt_email() to anon, authenticated;
grant execute on function public.submit_registration(jsonb) to anon, authenticated;
grant select on public.public_participants to anon, authenticated;

-- ---------------------------------------------------------------------
-- Project funds
-- ---------------------------------------------------------------------
-- =====================================================================
create table if not exists public.funds (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  donor_name      text not null check (char_length(trim(donor_name)) between 2 and 100),
  mohallah        text not null check (char_length(trim(mohallah)) between 1 and 100),
  amount          numeric(12,0) not null check (amount > 0),
  source          text not null default 'donation' check (source in ('donation','registration')),
  reference       text,                                     -- e.g. KMR3-0007 for registration fees
  registration_id uuid references public.registrations(id) on delete set null,
  recorded_by     text not null default split_part(public.jwt_email(), '@', 1)
);
alter table public.funds enable row level security;
revoke all on public.funds from anon, authenticated;
grant select, insert, update, delete on public.funds to authenticated;   -- narrowed by policies

drop policy if exists "admins read funds"   on public.funds;
drop policy if exists "admins insert funds" on public.funds;
drop policy if exists "admins update funds" on public.funds;
drop policy if exists "admins delete funds" on public.funds;
create policy "admins read funds"   on public.funds for select to authenticated using (public.jwt_email() in ('waseemfida@khawrai.app','nsfida@khawrai.app'));
create policy "admins insert funds" on public.funds for insert to authenticated with check (public.jwt_email() in ('waseemfida@khawrai.app','nsfida@khawrai.app'));
create policy "admins update funds" on public.funds for update to authenticated using (public.jwt_email() in ('waseemfida@khawrai.app','nsfida@khawrai.app')) with check (public.jwt_email() in ('waseemfida@khawrai.app','nsfida@khawrai.app'));
create policy "admins delete funds" on public.funds for delete to authenticated using (public.jwt_email() in ('waseemfida@khawrai.app','nsfida@khawrai.app'));

-- Public read-only list
create or replace view public.public_funds as
  select id, created_at, donor_name, mohallah, amount, source, reference from public.funds;
grant select on public.public_funds to anon, authenticated;

-- Confirm a registration fee: records the amount received and the player's fund entry together.
create or replace function public.confirm_payment(p_id uuid, p_amount numeric, p_mohallah text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.registrations;
begin
  if public.jwt_email() not in ('waseemfida@khawrai.app','nsfida@khawrai.app') then raise exception 'Not allowed'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter the amount received'; end if;
  select * into r from public.registrations where id = p_id for update;
  if not found then raise exception 'Registration not found'; end if;
  if r.status = 'confirmed' then raise exception 'Already confirmed'; end if;
  update public.registrations set status = 'confirmed' where id = p_id;
  insert into public.funds (donor_name, mohallah, amount, source, reference, registration_id)
  values (r.name, coalesce(nullif(trim(p_mohallah), ''), r.district_tehsil), round(p_amount), 'registration', r.reg_no, r.id);
end $$;

-- Undo a confirmation: back to pending and the fee record is removed.
create or replace function public.unconfirm_payment(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.jwt_email() not in ('waseemfida@khawrai.app','nsfida@khawrai.app') then raise exception 'Not allowed'; end if;
  delete from public.funds where registration_id = p_id and source = 'registration';
  update public.registrations set status = 'pending' where id = p_id;
end $$;

revoke all on function public.confirm_payment(uuid, numeric, text) from public, anon;
revoke all on function public.unconfirm_payment(uuid) from public, anon;
grant execute on function public.confirm_payment(uuid, numeric, text) to authenticated;
grant execute on function public.unconfirm_payment(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- One registration per device, location, original images
-- ---------------------------------------------------------------------
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
