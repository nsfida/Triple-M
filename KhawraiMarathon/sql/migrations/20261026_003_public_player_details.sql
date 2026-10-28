-- KMR-S3 migration 20261026_003
-- Public player-detail overlay: append only the details explicitly requested for display.
-- Existing view columns and their order are preserved; no table data is changed or deleted.
-- Note: address is intentionally exposed on the public participant detail overlay as requested.

begin;

create or replace view public.public_participants as
select
  id,
  reg_no,
  name,
  extract(year from age(dob))::int as age,
  photo_path,
  status,
  created_at,
  gender,
  address,
  district_tehsil
from public.registrations;

grant select on public.public_participants to anon, authenticated;
comment on view public.public_participants is
  'Public Season Three runner directory. Includes name, age, photo, status, gender and registered address for the public player-detail overlay; excludes CNIC, phone, email, device and location coordinates.';

commit;
