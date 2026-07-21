-- NSF Loan Ledger — normalized domain tables plus unified read view.
--
-- Apply on empty Supabase: paste this WHOLE file into SQL Editor and Run once.
-- FK targets must reference UNIQUE/PK columns: loans / installment_plans / goods_items
-- use UNIQUE(group_id), matching expense_accounts(group_id UNIQUE).
--
-- Tables (purpose):
-- loans ........................ Principal amounts for ordinary given/taken loans (no goods/expense/installment tags).
-- loan_payments ................ Partial/full repayments for ordinary loans linked by group_id to loans.
-- installment_plans ............ Taken principals tagged as installments in notes/metadata.
-- installment_payments ......... Installment repayment rows tied to installment_plans.group_id.
-- goods_items .................. Purchased inventory (bought totals, qty, pricing).
-- goods_sales .................. Sales lines linked to goods_items.group_id.
-- expense_accounts ............. Wallet / bank / cash principals (EXPENSE_ACCOUNT tag in legacy notes).
-- expense_topups ............... Top-ups and mirrored transfer-in rows for wallets.
-- expense_entries .............. Spend lines including outbound transfers encoded in notes/metadata.
-- expense_transfers ............ Optional explicit cross-wallet transfer ledger (paired with notes in entries/topups).

create extension if not exists pgcrypto;

-- Tear-down (legacy + new) for repeatable migration.
-- Do NOT use "drop trigger ... on public.loans" here: on an empty DB the table does not
-- exist yet and PostgreSQL errors (42P01). DROP TABLE ... CASCADE removes triggers.

drop view if exists public.v_loan_ledger_unified;

drop table if exists public.expense_transfers cascade;
drop table if exists public.expense_entries cascade;
drop table if exists public.expense_topups cascade;
drop table if exists public.expense_accounts cascade;
drop table if exists public.goods_sales cascade;
drop table if exists public.goods_items cascade;
drop table if exists public.installment_payments cascade;
drop table if exists public.installment_plans cascade;
drop table if exists public.loan_payments cascade;
drop table if exists public.loans cascade;
drop table if exists public.loan_ledger_entries cascade;

drop function if exists public.set_updated_at();

-- ── Shared trigger function ────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Normalized tables ────────────────────────────────────────────────────────
create table public.loans (
  id uuid primary key default gen_random_uuid(),
  -- One principal row per loan group (required for FK from loan_payments.group_id)
  group_id uuid not null unique,
  direction text not null check (direction in ('given', 'taken')),
  person_name text not null,
  currency text not null check (currency in ('AED', 'SAR', 'PKR', 'USD', 'BTC')),
  principal_amount numeric(18,8) not null,
  loan_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.loan_payments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.loans(group_id) on delete cascade,
  direction text not null check (direction in ('given', 'taken')),
  person_name text not null,
  currency text not null check (currency in ('AED', 'SAR', 'PKR', 'USD', 'BTC')),
  payment_kind text not null check (payment_kind in ('partial', 'full')),
  payment_amount numeric(18,8) not null,
  payment_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.installment_plans (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null unique,
  person_name text not null,
  currency text not null check (currency in ('AED', 'SAR', 'PKR', 'USD', 'BTC')),
  principal_amount numeric(18,8) not null,
  loan_date date not null,
  installment_amount numeric(18,8),
  frequency text check (frequency in ('weekly','monthly','custom')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.installment_payments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.installment_plans(group_id) on delete cascade,
  person_name text not null,
  currency text not null check (currency in ('AED', 'SAR', 'PKR', 'USD', 'BTC')),
  payment_kind text not null check (payment_kind in ('partial', 'full')),
  payment_amount numeric(18,8) not null,
  payment_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.goods_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null unique,
  item_name text not null,
  currency text not null check (currency in ('AED', 'SAR', 'PKR', 'USD', 'BTC')),
  unit_actual_price numeric(18,8) not null,
  bought_qty integer not null default 1,
  total_actual_price numeric(18,8) not null,
  bought_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.goods_sales (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.goods_items(group_id) on delete cascade,
  item_name text not null,
  currency text not null check (currency in ('AED', 'SAR', 'PKR', 'USD', 'BTC')),
  unit_sold_price numeric(18,8) not null,
  sold_qty integer not null default 1,
  total_sold_price numeric(18,8) not null,
  sold_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.expense_accounts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null unique,
  account_name text not null,
  account_type text not null check (account_type in ('Bank Account','Cash Account')),
  currency text not null check (currency in ('AED', 'SAR', 'PKR', 'USD', 'BTC')),
  opening_balance numeric(18,8) not null default 0,
  account_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.expense_topups (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.expense_accounts(group_id) on delete cascade,
  account_name text not null,
  currency text not null check (currency in ('AED', 'SAR', 'PKR', 'USD', 'BTC')),
  amount numeric(18,8) not null,
  topup_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.expense_entries (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.expense_accounts(group_id) on delete cascade,
  account_name text not null,
  currency text not null check (currency in ('AED', 'SAR', 'PKR', 'USD', 'BTC')),
  item_name text not null,
  expense_type text not null default 'Other',
  amount numeric(18,8) not null,
  expense_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.expense_transfers (
  id uuid primary key default gen_random_uuid(),
  from_group_id uuid not null references public.expense_accounts(group_id) on delete cascade,
  to_group_id uuid not null references public.expense_accounts(group_id) on delete cascade,
  from_account_name text not null,
  to_account_name text not null,
  from_currency text not null check (from_currency in ('AED', 'SAR', 'PKR', 'USD', 'BTC')),
  to_currency text not null check (to_currency in ('AED', 'SAR', 'PKR', 'USD', 'BTC')),
  from_amount numeric(18,8) not null,
  to_amount numeric(18,8) not null,
  conversion_rate numeric(18,8) not null default 1,
  transfer_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Compatibility flat ledger (SPA write target; same columns as legacy app) ─
create table public.loan_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  direction text not null check (direction in ('given','taken','goods')),
  entry_kind text not null check (entry_kind in ('principal','partial','full')),
  person_name text not null,
  currency text not null check (currency in ('AED','SAR','PKR','USD','BTC')),
  principal_amount numeric(18,8),
  action_amount numeric(18,8),
  loan_date date not null,
  action_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint principal_row_amounts_chk check (
    (entry_kind = 'principal' and principal_amount is not null and action_amount is null)
    or
    (entry_kind in ('partial','full') and principal_amount is null and action_amount is not null and action_date is not null)
  )
);

-- ── updated_at triggers ───────────────────────────────────────────────────────
create trigger trg_set_loans_updated_at before update on public.loans for each row execute function public.set_updated_at();
create trigger trg_set_loan_payments_updated_at before update on public.loan_payments for each row execute function public.set_updated_at();
create trigger trg_set_installment_plans_updated_at before update on public.installment_plans for each row execute function public.set_updated_at();
create trigger trg_set_installment_payments_updated_at before update on public.installment_payments for each row execute function public.set_updated_at();
create trigger trg_set_goods_items_updated_at before update on public.goods_items for each row execute function public.set_updated_at();
create trigger trg_set_goods_sales_updated_at before update on public.goods_sales for each row execute function public.set_updated_at();
create trigger trg_set_expense_accounts_updated_at before update on public.expense_accounts for each row execute function public.set_updated_at();
create trigger trg_set_expense_topups_updated_at before update on public.expense_topups for each row execute function public.set_updated_at();
create trigger trg_set_expense_entries_updated_at before update on public.expense_entries for each row execute function public.set_updated_at();
create trigger trg_set_expense_transfers_updated_at before update on public.expense_transfers for each row execute function public.set_updated_at();
create trigger trg_set_loan_ledger_entries_updated_at before update on public.loan_ledger_entries for each row execute function public.set_updated_at();

-- ── Indexes ──────────────────────────────────────────────────────────────────
create index loans_currency_idx on public.loans(currency);
create index loans_loan_date_idx on public.loans(loan_date);
create index loans_created_idx on public.loans(created_at desc);

create index loan_payments_group_idx on public.loan_payments(group_id);
create index loan_payments_currency_idx on public.loan_payments(currency);
create index loan_payments_payment_date_idx on public.loan_payments(payment_date);
create index loan_payments_created_idx on public.loan_payments(created_at desc);

create index installment_plans_currency_idx on public.installment_plans(currency);
create index installment_plans_loan_date_idx on public.installment_plans(loan_date);

create index installment_payments_group_idx on public.installment_payments(group_id);

create index goods_sales_group_idx on public.goods_sales(group_id);

create index expense_accounts_group_idx on public.expense_accounts(group_id);
create index expense_topups_group_idx on public.expense_topups(group_id);
create index expense_entries_group_idx on public.expense_entries(group_id);
create index expense_transfers_from_idx on public.expense_transfers(from_group_id);
create index expense_transfers_to_idx on public.expense_transfers(to_group_id);
create index expense_transfers_date_idx on public.expense_transfers(transfer_date);

create index ledger_group_idx on public.loan_ledger_entries(group_id);
create index ledger_direction_idx on public.loan_ledger_entries(direction);
create index ledger_currency_idx on public.loan_ledger_entries(currency);
create index ledger_created_idx on public.loan_ledger_entries(created_at desc);

-- ── Row Level Security (public policies, same openness as legacy) ────────────
alter table public.loans enable row level security;
alter table public.loan_payments enable row level security;
alter table public.installment_plans enable row level security;
alter table public.installment_payments enable row level security;
alter table public.goods_items enable row level security;
alter table public.goods_sales enable row level security;
alter table public.expense_accounts enable row level security;
alter table public.expense_topups enable row level security;
alter table public.expense_entries enable row level security;
alter table public.expense_transfers enable row level security;
alter table public.loan_ledger_entries enable row level security;

-- loans
drop policy if exists loan_read_all on public.loans;
drop policy if exists loan_write_all on public.loans;
create policy loan_read_all on public.loans for select to anon, authenticated using (true);
create policy loan_write_ins on public.loans for insert to anon, authenticated with check (true);
create policy loan_write_upd on public.loans for update to anon, authenticated using (true) with check (true);
create policy loan_write_del on public.loans for delete to anon, authenticated using (true);

-- loan_payments
drop policy if exists loan_pay_read_all on public.loan_payments;
create policy loan_pay_read_all on public.loan_payments for select to anon, authenticated using (true);
create policy loan_pay_ins on public.loan_payments for insert to anon, authenticated with check (true);
create policy loan_pay_upd on public.loan_payments for update to anon, authenticated using (true) with check (true);
create policy loan_pay_del on public.loan_payments for delete to anon, authenticated using (true);

-- installment_plans / payments
drop policy if exists ip_read on public.installment_plans;
create policy ip_read on public.installment_plans for select to anon, authenticated using (true);
create policy ip_mut on public.installment_plans for all to anon, authenticated using (true) with check (true);
drop policy if exists ipp_read on public.installment_payments;
create policy ipp_read on public.installment_payments for select to anon, authenticated using (true);
create policy ipp_mut on public.installment_payments for all to anon, authenticated using (true) with check (true);

-- goods
drop policy if exists gi_read on public.goods_items;
create policy gi_read on public.goods_items for select to anon, authenticated using (true);
create policy gi_mut on public.goods_items for all to anon, authenticated using (true) with check (true);
drop policy if exists gs_read on public.goods_sales;
create policy gs_read on public.goods_sales for select to anon, authenticated using (true);
create policy gs_mut on public.goods_sales for all to anon, authenticated using (true) with check (true);

-- expenses
drop policy if exists ea_read on public.expense_accounts;
create policy ea_read on public.expense_accounts for select to anon, authenticated using (true);
create policy ea_mut on public.expense_accounts for all to anon, authenticated using (true) with check (true);
drop policy if exists et_read on public.expense_topups;
create policy et_read on public.expense_topups for select to anon, authenticated using (true);
create policy et_mut on public.expense_topups for all to anon, authenticated using (true) with check (true);
drop policy if exists ee_read on public.expense_entries;
create policy ee_read on public.expense_entries for select to anon, authenticated using (true);
create policy ee_mut on public.expense_entries for all to anon, authenticated using (true) with check (true);
drop policy if exists ex_read on public.expense_transfers;
create policy ex_read on public.expense_transfers for select to anon, authenticated using (true);
create policy ex_mut on public.expense_transfers for all to anon, authenticated using (true) with check (true);

-- flat ledger compat
drop policy if exists lle_read on public.loan_ledger_entries;
create policy lle_read on public.loan_ledger_entries for select to anon, authenticated using (true);
create policy lle_mut on public.loan_ledger_entries for all to anon, authenticated using (true) with check (true);

-- ── Migration view: UNION ALL canonical flat rows ────────────────────────────
create or replace view public.v_loan_ledger_unified as
select
  l.id, l.group_id, l.direction, 'principal'::text as entry_kind, l.person_name, l.currency,
  l.principal_amount, null::numeric(18,8) as action_amount, l.loan_date, null::date as action_date, l.notes, l.created_at
from public.loans l
union all
select
  lp.id, lp.group_id, lp.direction,
  case when lp.payment_kind = 'partial' then 'partial' else 'full' end::text as entry_kind,
  lp.person_name, lp.currency, null::numeric(18,8), lp.payment_amount, ln.loan_date, lp.payment_date, lp.notes, lp.created_at
from public.loan_payments lp
join public.loans ln on ln.group_id = lp.group_id
union all
select
  ip.id, ip.group_id, 'taken'::text, 'principal'::text, ip.person_name, ip.currency,
  ip.principal_amount, null::numeric(18,8), ip.loan_date, null::date, ip.notes, ip.created_at
from public.installment_plans ip
union all
select
  ipp.id, ipp.group_id, 'taken'::text,
  case when ipp.payment_kind = 'partial' then 'partial' else 'full' end::text,
  ipp.person_name, ipp.currency, null::numeric(18,8), ipp.payment_amount, pl.loan_date, ipp.payment_date, ipp.notes, ipp.created_at
from public.installment_payments ipp
join public.installment_plans pl on pl.group_id = ipp.group_id
union all
select
  g.id, g.group_id,
  'taken'::text,
  'principal'::text, g.item_name, g.currency,
  g.total_actual_price,
  null::numeric(18,8),
  g.bought_date, null::date,
  case
    when coalesce(trim(g.notes), '') <> '' and position('[GOODS]' in g.notes) > 0 then g.notes
    else concat('[GOODS]', case when trim(coalesce(g.notes,'')) <> '' then ' ' || nullif(trim(g.notes),'') else '' end)
  end,
  g.created_at
from public.goods_items g
union all
select
  gs.id, gs.group_id,
  'taken'::text,
  'full'::text,
  gs.item_name, gs.currency,
  null::numeric(18,8), gs.total_sold_price, gi.bought_date, gs.sold_date,
  case
    when coalesce(trim(gs.notes), '') <> '' and position('[GOODS]' in gs.notes) > 0 then gs.notes
    else concat('[GOODS]', case when trim(coalesce(gs.notes,'')) <> '' then ' ' || nullif(trim(gs.notes),'') else '' end)
  end,
  gs.created_at
from public.goods_sales gs
join public.goods_items gi on gi.group_id = gs.group_id
union all
select
  ea.id, ea.group_id, 'taken'::text, 'principal'::text, ea.account_name, ea.currency,
  ea.opening_balance,
  null::numeric(18,8),
  ea.account_date,
  null::date,
  case
    when ea.notes is not null and position('[EXPENSE_ACCOUNT]' in ea.notes) > 0 then ea.notes
    else trim(
      concat(
        '[EXPENSE_ACCOUNT]',
        concat(' ', '[ATYPE:', ea.account_type, ']'),
        case when trim(coalesce(ea.notes,'')) <> '' then concat(' ', trim(ea.notes)) else '' end
      )
    )
  end,
  ea.created_at
from public.expense_accounts ea
union all
select
  et.id, et.group_id, 'taken'::text, 'partial'::text,
  ea.account_name, et.currency,
  null::numeric(18,8), et.amount, ea.account_date, et.topup_date, et.notes, et.created_at
from public.expense_topups et
join public.expense_accounts ea on ea.group_id = et.group_id
union all
select
  ee.id, ee.group_id, 'taken'::text, 'partial'::text,
  ee.account_name, ee.currency, null::numeric(18,8), ee.amount, ea.account_date, ee.expense_date, ee.notes, ee.created_at
from public.expense_entries ee
join public.expense_accounts ea on ea.group_id = ee.group_id
union all
select
  e.id, e.group_id, e.direction, e.entry_kind, e.person_name, e.currency,
  e.principal_amount, e.action_amount, e.loan_date, e.action_date, e.notes, e.created_at
from public.loan_ledger_entries e;
