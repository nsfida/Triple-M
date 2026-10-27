-- KMR-S3 migration 20261027_004
-- Adds a reversible cancellation flag and a separate expenses ledger.
-- Existing registrations and receiving entries are preserved; no existing rows are deleted or rewritten.

begin;

-- Cancellation is deliberately separate from payment status so a cancelled runner keeps
-- their original Pending/Confirmed state and any associated receiving record.
alter table public.registrations
  add column if not exists is_cancelled boolean not null default false,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by text;

create or replace function public.set_registration_cancelled(p_id uuid, p_cancelled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.jwt_email() not in ('waseemfida@khawrai.app','nsfida@khawrai.app') then
    raise exception 'Not allowed';
  end if;
  if p_cancelled is null then
    raise exception 'Cancellation state is required';
  end if;

  update public.registrations
     set is_cancelled = p_cancelled,
         cancelled_at = case when p_cancelled then now() else null end,
         cancelled_by = case when p_cancelled then split_part(public.jwt_email(), '@', 1) else null end
   where id = p_id;

  if not found then raise exception 'Registration not found'; end if;
end;
$$;
revoke all on function public.set_registration_cancelled(uuid, boolean) from public, anon;
grant execute on function public.set_registration_cancelled(uuid, boolean) to authenticated;

-- Separate expenses ledger. This does not alter the existing public.funds table.
create table if not exists public.expenses (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  expense_date     date not null default current_date,
  category         text not null check (char_length(trim(category)) between 2 and 80),
  description      text not null check (char_length(trim(description)) between 2 and 240),
  paid_to          text not null default '' check (char_length(trim(paid_to)) <= 120),
  amount           numeric(12,0) not null check (amount > 0),
  payment_method   text not null default 'Cash' check (payment_method in ('Cash','Bank transfer','Mobile wallet','Other')),
  receipt_reference text,
  recorded_by      text not null default split_part(public.jwt_email(), '@', 1)
);

create index if not exists expenses_expense_date_idx on public.expenses (expense_date, created_at);
alter table public.expenses enable row level security;
revoke all on public.expenses from anon, authenticated;
grant select, insert, update, delete on public.expenses to authenticated;

drop policy if exists "admins read expenses" on public.expenses;
drop policy if exists "admins insert expenses" on public.expenses;
drop policy if exists "admins update expenses" on public.expenses;
drop policy if exists "admins delete expenses" on public.expenses;
create policy "admins read expenses" on public.expenses for select to authenticated
  using (public.jwt_email() in ('waseemfida@khawrai.app','nsfida@khawrai.app'));
create policy "admins insert expenses" on public.expenses for insert to authenticated
  with check (public.jwt_email() in ('waseemfida@khawrai.app','nsfida@khawrai.app'));
create policy "admins update expenses" on public.expenses for update to authenticated
  using (public.jwt_email() in ('waseemfida@khawrai.app','nsfida@khawrai.app'))
  with check (public.jwt_email() in ('waseemfida@khawrai.app','nsfida@khawrai.app'));
create policy "admins delete expenses" on public.expenses for delete to authenticated
  using (public.jwt_email() in ('waseemfida@khawrai.app','nsfida@khawrai.app'));

-- Public read-only views support the existing transparent public Project Funds page.
create or replace view public.public_expenses as
  select id, created_at, expense_date, category, description, paid_to, amount, payment_method, receipt_reference
  from public.expenses;
grant select on public.public_expenses to anon, authenticated;

-- Append the cancellation flag to the established view without removing or reordering its columns.
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
  district_tehsil,
  is_cancelled
from public.registrations;
grant select on public.public_participants to anon, authenticated;

comment on table public.expenses is 'Project expenses ledger; kept separate from receiving records.';
comment on view public.public_expenses is 'Read-only public view of recorded project expenses.';

commit;
