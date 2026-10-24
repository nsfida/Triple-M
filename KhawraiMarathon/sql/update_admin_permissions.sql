-- For a database that already ran the old schema.sql: lets waseemfida confirm, edit and delete too.
drop policy if exists "main admin update" on public.registrations;
drop policy if exists "main admin delete" on public.registrations;
drop policy if exists "admins update" on public.registrations;
drop policy if exists "admins delete" on public.registrations;
create policy "admins update" on public.registrations for update to authenticated
  using (public.jwt_email() in ('waseemfida@khawrai.app','nsfida@khawrai.app'))
  with check (public.jwt_email() in ('waseemfida@khawrai.app','nsfida@khawrai.app'));
create policy "admins delete" on public.registrations for delete to authenticated
  using (public.jwt_email() in ('waseemfida@khawrai.app','nsfida@khawrai.app'));

create or replace function public.trg_registration_status() returns trigger language plpgsql as $$
begin
  if new.status = 'confirmed' and old.status <> 'confirmed' then
    new.confirmed_at := now(); new.confirmed_by := split_part(public.jwt_email(), '@', 1);
  elsif new.status = 'pending' then
    new.confirmed_at := null; new.confirmed_by := null;
  end if;
  return new;
end $$;

drop policy if exists "kmr main admin update" on storage.objects;
drop policy if exists "kmr main admin delete" on storage.objects;
drop policy if exists "kmr admins update" on storage.objects;
drop policy if exists "kmr admins delete" on storage.objects;
create policy "kmr admins update" on storage.objects for update to authenticated
  using (bucket_id in ('documents','photos') and public.jwt_email() in ('waseemfida@khawrai.app','nsfida@khawrai.app'));
create policy "kmr admins delete" on storage.objects for delete to authenticated
  using (bucket_id in ('documents','photos') and public.jwt_email() in ('waseemfida@khawrai.app','nsfida@khawrai.app'));
