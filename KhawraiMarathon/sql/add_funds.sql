-- =====================================================================
-- Project fund collection. Run once in the SQL Editor (also appended to schema.sql for new installs).
-- Public: read-only list (name, mohallah, amount).  Admins (waseemfida, nsfida): record, delete.
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
