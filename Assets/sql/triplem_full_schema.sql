-- ============================================================================
-- Triple-M FULL SCHEMA (DDL only — no ledger/user data inserts)
-- ============================================================================
-- HOW TO USE
--   1. Open Supabase → SQL Editor on the TARGET project.
--   2. Paste this ENTIRE file and Run once.
--   3. This script CLEARS Triple-M app objects in public, then recreates
--      tables, indexes, RLS, RPCs, and grants to match production structure.
--   4. After schema is applied, restore DATA via Admin → Upload Backup
--      (JSON or CSV). Do not expect user/ledger rows from this SQL file.
--
-- SAFETY
--   • Drops only known Triple-M public tables/views and app_* / related RPCs.
--   • Does NOT drop auth, storage, realtime, or other Supabase system schemas.
--   • Re-running is intentional: reset → schema.sql → migrations 001…latest.
--
-- SOURCE ORDER (bundled below)
--   01. migrations/schema.sql
--   02. migrations/001_multi_user_auth.sql
--   03. migrations/001a_fix_pgcrypto_extensions.sql
--   04. migrations/002_admin_user_management.sql
--   05. migrations/003_fix_profile_overload_and_company_branding.sql
--   06. migrations/004_fix_app_user_public_profile_unique.sql
--   07. migrations/005_fix_admin_data_visibility_and_owner_backfill.sql
--   08. migrations/006_smart_pin_and_admin_password_visibility.sql
--   09. migrations/007_company_contact_details.sql
--   10. migrations/008_strict_owner_isolation.sql
--   11. migrations/009_trial_signup_and_access_plans.sql
--   12. migrations/010_trial_signup_contact_details.sql
--   13. migrations/011_fix_admin_delete_user_reassign.sql
--   14. migrations/012_fix_admin_delete_user_cascade.sql
--   15. migrations/013_fix_admin_delete_user_no_replication_role.sql
--   16. migrations/014_admin_notifications_and_inquiries.sql
--   17. migrations/015_inquiry_conversations_and_public_request.sql
--   18. migrations/016_admin_start_conversation.sql
--   19. migrations/017_fix_tab_permission_enforcement.sql
--   20. migrations/018_admin_raw_user_ledger.sql
--   21. migrations/019_messaging_live_sync.sql
--   22. migrations/020_domain_tables_owner_rls.sql
--   23. migrations/021_domain_migrate_rpcs.sql
--   24. migrations/022_admin_raw_domain_tables.sql
--   25. migrations/023_admin_dual_store_delete.sql
--   26. migrations/024_fix_admin_session_preserve_and_extend_access.sql
--   27. migrations/025_app_update_own_profile.sql
--   28. migrations/026_access_period_grace_and_renewal.sql
--   29. migrations/027_access_until_date_extension.sql
--   30. migrations/028_admin_access_extension_history.sql
--   31. migrations/029_installment_plan_schedule.sql
--   32. migrations/030_company_team_members_and_activity.sql
--   33. migrations/031_team_branding_sync_and_member_limits.sql
--   34. migrations/032_activity_log_owner_only.sql
--   35. migrations/033_admin_visible_smart_pin.sql
--   36. migrations/034_admin_backup_restore.sql
--   37. migrations/035_fix_admin_backup_safeupdate_delete.sql
--   38. migrations/036_fix_admin_backup_username_remap.sql
--   39. migrations/037_fix_admin_backup_session_preserve.sql
--   40. migrations/038_expense_account_custom_logo.sql
--   41. migrations/039_production_security_hardening.sql
--   42. migrations/040_note_reminders.sql
--   43. migrations/041_installment_due_notifications.sql
--   44. migrations/042_restore_protected_admin_capabilities.sql
--   45. migrations/043_note_reminder_live_update.sql
--   46. migrations/044_note_reminder_client_now.sql
--   47. migrations/045_installment_manual_reminders.sql
--   48. migrations/046_expense_account_types_expand.sql
--   49. migrations/047_expense_account_type_crypto_wallet.sql
--   50. migrations/048_expense_lazy_queries.sql
--   51. migrations/049_inventory_brands_variants_lazy.sql
--   52. migrations/050_inventory_sales_customers_list.sql
--   53. migrations/051_inventory_category_product_lines.sql
--   54. migrations/052_inventory_product_line_summary_fix.sql
--   55. migrations/053_inventory_product_line_variant_safe_upsert.sql
--   56. migrations/054_inventory_upsert_goods_item_rpc.sql
--   57. migrations/055_inventory_catalog_edit_delete.sql
--   58. migrations/056_inventory_item_detail_rpc_restore.sql
--   59. migrations/057_inventory_cascade_delete_catalog.sql
--   60. migrations/058_inventory_sales_upsert_and_owner_fix.sql
--   61. migrations/059_password_policy.sql
--   62. migrations/060_fix_category_rename_admin_domain_edit.sql
--   63. migrations/061_inventory_sub_brand_variant_attrs.sql
--   64. migrations/062_inventory_category_hard_purge.sql
--   65. migrations/063_inventory_sell_by_volume_or_bottle.sql
--   66. migrations/064_remember_me_and_grace_lock_disable.sql
--   67. migrations/065_inventory_summary_sell_by_fields.sql
--   68. migrations/066_inventory_category_hard_purge_owner_fix.sql
--   69. migrations/067_inventory_category_visibility_and_tombstones.sql
--   70. migrations/068_books_taxonomy_and_product_line_delete_fix.sql
--   71. migrations/069_installment_down_payment.sql
--   72. migrations/070_inventory_category_taxonomy_meta.sql
--   73. migrations/071_admin_backup_table_coverage.sql
--   74. migrations/072_fix_backup_restore_password_and_reminder_fk.sql
-- ============================================================================

-- ============================================================================
-- RESET: clear existing Triple-M app objects (clean slate)
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- Views first (depend on tables)
drop view if exists public.v_loan_ledger_unified cascade;

-- Domain / ledger / messaging / team / inventory catalog / reminder tables
-- (dependency-safe via CASCADE; children listed before parents for clarity)
drop table if exists public.app_inquiry_messages cascade;
drop table if exists public.app_inquiries cascade;
drop table if exists public.app_admin_notifications cascade;
drop table if exists public.app_access_extensions cascade;
drop table if exists public.app_plan_renewal_requests cascade;
drop table if exists public.app_activity_log cascade;
drop table if exists public.app_team_permissions cascade;
drop table if exists public.app_permissions cascade;
drop table if exists public.app_sessions cascade;
drop table if exists public.app_note_reminders cascade;
drop table if exists public.app_user_notifications cascade;
drop table if exists public.app_installment_due_notices cascade;
drop table if exists public.app_user_prefs cascade;
drop table if exists public.app_notes cascade;
drop table if exists public.bitcoin_wallets cascade;
drop table if exists public.goods_brand_variants cascade;
drop table if exists public.goods_product_lines cascade;
drop table if exists public.goods_sub_brands cascade;
drop table if exists public.goods_brands cascade;
drop table if exists public.goods_category_config cascade;
drop table if exists public.goods_events cascade;
drop table if exists public.goods_sales cascade;
drop table if exists public.goods_items cascade;
drop table if exists public.expense_transfers cascade;
drop table if exists public.expense_entries cascade;
drop table if exists public.expense_topups cascade;
drop table if exists public.expense_accounts cascade;
drop table if exists public.installment_payments cascade;
drop table if exists public.installment_plans cascade;
drop table if exists public.loan_payments cascade;
drop table if exists public.loans cascade;
drop table if exists public.loan_ledger_entries cascade;
drop table if exists public.app_users cascade;
drop table if exists public.app_organizations cascade;

-- Drop Triple-M RPCs / helpers in public (all overloads), keep unrelated public functions
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        p.proname like 'app\_%' escape '\'
        or p.proname like 'current\_app\_%' escape '\'
        or p.proname like 'current\_session\_%' escape '\'
        or p.proname in (
          'is_app_admin',
          'enforce_owner_id',
          'set_updated_at'
        )
      )
  loop
    execute format('drop function if exists %s cascade', r.sig);
  end loop;
end $$;

-- ============================================================================
-- RECREATE: schema.sql + migrations (001 … latest)
-- ============================================================================


-- ############################################################################
-- BEGIN migrations/schema.sql
-- ############################################################################

-- NSF Loan Ledger — normalized domain tables plus unified read view.
--
-- Apply on empty Supabase: paste this WHOLE file into SQL Editor and Run once.
-- For multi-user auth / RLS isolation on an existing or new database, ALSO run:
--   migrations/001_multi_user_auth.sql
-- (additive migration — does not destroy loan_ledger_entries data).
--
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
  account_type text not null default 'Bank Account' check (account_type in (
    'Bank Account',
    'Cash Account',
    'Travel Card',
    'Prepaid Card',
    'Credit Card',
    'Debit Card',
    'Cheque Account',
    'Savings Account',
    'Digital Wallet',
    'Crypto Wallet',
    'Other'
  )),
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

-- ############################################################################
-- END migrations/schema.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/001_multi_user_auth.sql
-- ############################################################################

-- ============================================================================
-- Triple-M multi-user auth & data isolation migration
-- Additive only: does NOT drop existing ledger data.
-- Apply once in Supabase SQL Editor after schema.sql (or on an existing DB).
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- Ensure shared updated_at trigger exists (also defined in schema.sql)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Organizations (future multi-business scaffold) ───────────────────────────
create table if not exists public.app_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- ── Users ────────────────────────────────────────────────────────────────────
create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.app_organizations(id) on delete set null,
  username text not null,
  password_hash text not null,
  display_name text not null default '',
  role text not null default 'user' check (role in ('admin', 'user')),
  is_protected boolean not null default false,
  is_active boolean not null default true,
  must_change_password boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  constraint app_users_username_format check (username ~ '^[a-zA-Z0-9_-]+$'),
  constraint app_users_username_lower unique (username)
);

create unique index if not exists app_users_username_ci_idx
  on public.app_users (lower(username));

create index if not exists app_users_org_idx on public.app_users(organization_id);
create index if not exists app_users_active_idx on public.app_users(is_active);

drop trigger if exists trg_set_app_users_updated_at on public.app_users;
create trigger trg_set_app_users_updated_at
  before update on public.app_users
  for each row execute function public.set_updated_at();

-- ── Sessions ─────────────────────────────────────────────────────────────────
create table if not exists public.app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  user_agent text,
  ip_text text
);

create index if not exists app_sessions_user_idx on public.app_sessions(user_id);
create index if not exists app_sessions_expires_idx on public.app_sessions(expires_at);

-- ── Permissions ──────────────────────────────────────────────────────────────
create table if not exists public.app_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  module text not null,
  action text not null,
  allowed boolean not null default true,
  created_at timestamptz not null default now(),
  constraint app_permissions_module_chk check (module in (
    'dashboard','expenses','wallets','inventory','loans','installments',
    'bitcoin','notes','customers','reports','pdf_export','currency_settings',
    'settings','admin_panel'
  )),
  constraint app_permissions_action_chk check (action in (
    'view','create','edit','delete','export','import'
  )),
  constraint app_permissions_unique unique (user_id, module, action)
);

create index if not exists app_permissions_user_idx on public.app_permissions(user_id);

-- ── owner_id on data tables ──────────────────────────────────────────────────
do $$
declare
  tbl text;
  tables text[] := array[
    'loan_ledger_entries','loans','loan_payments','installment_plans',
    'installment_payments','goods_items','goods_sales','expense_accounts',
    'expense_topups','expense_entries','expense_transfers'
  ];
begin
  foreach tbl in array tables loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = tbl
    ) and not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = tbl and column_name = 'owner_id'
    ) then
      execute format('alter table public.%I add column owner_id uuid', tbl);
      execute format('create index if not exists %I on public.%I(owner_id)', tbl || '_owner_idx', tbl);
    end if;
  end loop;
end $$;

-- ── Seed default org + protected admin ───────────────────────────────────────
do $$
declare
  v_org_id uuid;
  v_admin_id uuid;
  v_mod text;
  v_act text;
  modules text[] := array[
    'dashboard','expenses','wallets','inventory','loans','installments',
    'bitcoin','notes','customers','reports','pdf_export','currency_settings',
    'settings','admin_panel'
  ];
  actions text[] := array['view','create','edit','delete','export','import'];
begin
  select id into v_org_id from public.app_organizations where name = 'Default Organization' limit 1;
  if v_org_id is null then
    insert into public.app_organizations (name) values ('Default Organization')
    returning id into v_org_id;
  end if;

  select id into v_admin_id from public.app_users where lower(username) = 'nsfida' limit 1;
  if v_admin_id is null then
    insert into public.app_users (
      organization_id, username, password_hash, display_name,
      role, is_protected, is_active, must_change_password, settings
    ) values (
      v_org_id,
      'nsfida',
      extensions.crypt('35642502', extensions.gen_salt('bf')),
      'NSF Admin',
      'admin',
      true,
      true,
      false,
      jsonb_build_object(
        'Company', 'Triple M by NSF',
        'TRN', '',
        'Currency', jsonb_build_array('AED','SAR','PKR','USD','BTC'),
        'logo', ''
      )
    )
    returning id into v_admin_id;
  else
    update public.app_users set
      role = 'admin',
      is_protected = true,
      is_active = true,
      password_hash = case
        when password_hash is null or password_hash = '' then extensions.crypt('35642502', extensions.gen_salt('bf'))
        else password_hash
      end,
      updated_at = now()
    where id = v_admin_id;
  end if;

  foreach v_mod in array modules loop
    foreach v_act in array actions loop
      insert into public.app_permissions (user_id, module, action, allowed)
      values (v_admin_id, v_mod, v_act, true)
      on conflict (user_id, module, action) do update set allowed = true;
    end loop;
  end loop;

  -- Backfill owner_id to admin for all existing rows
  update public.loan_ledger_entries set owner_id = v_admin_id where owner_id is null;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='loans') then
    update public.loans set owner_id = v_admin_id where owner_id is null;
    update public.loan_payments set owner_id = v_admin_id where owner_id is null;
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='installment_plans') then
    update public.installment_plans set owner_id = v_admin_id where owner_id is null;
    update public.installment_payments set owner_id = v_admin_id where owner_id is null;
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='goods_items') then
    update public.goods_items set owner_id = v_admin_id where owner_id is null;
    update public.goods_sales set owner_id = v_admin_id where owner_id is null;
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='expense_accounts') then
    update public.expense_accounts set owner_id = v_admin_id where owner_id is null;
    update public.expense_topups set owner_id = v_admin_id where owner_id is null;
    update public.expense_entries set owner_id = v_admin_id where owner_id is null;
    update public.expense_transfers set owner_id = v_admin_id where owner_id is null;
  end if;
end $$;

-- Set NOT NULL on owner_id where column exists and all rows are filled
do $$
declare
  tbl text;
  tables text[] := array[
    'loan_ledger_entries','loans','loan_payments','installment_plans',
    'installment_payments','goods_items','goods_sales','expense_accounts',
    'expense_topups','expense_entries','expense_transfers'
  ];
  null_count bigint;
begin
  foreach tbl in array tables loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = tbl and column_name = 'owner_id'
    ) then
      execute format('select count(*) from public.%I where owner_id is null', tbl) into null_count;
      if null_count = 0 then
        begin
          execute format('alter table public.%I alter column owner_id set not null', tbl);
        exception when others then
          raise notice 'Could not set NOT NULL on %.owner_id: %', tbl, sqlerrm;
        end;
        begin
          execute format(
            'alter table public.%I drop constraint if exists %I',
            tbl, tbl || '_owner_fk'
          );
          execute format(
            'alter table public.%I add constraint %I foreign key (owner_id) references public.app_users(id)',
            tbl, tbl || '_owner_fk'
          );
        exception when others then
          raise notice 'Could not add FK on %.owner_id: %', tbl, sqlerrm;
        end;
      end if;
    end if;
  end loop;
end $$;

-- ── Session / auth helpers ───────────────────────────────────────────────────
create or replace function public.app_hash_token(p_token text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

create or replace function public.current_session_token()
returns text
language plpgsql
stable
as $$
declare
  headers json;
  token text;
begin
  begin
    headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    headers := null;
  end;
  if headers is not null then
    token := coalesce(
      headers->>'x-session-token',
      headers->>'X-Session-Token'
    );
  end if;
  if token is null or token = '' then
    begin
      token := nullif(current_setting('request.header.x-session-token', true), '');
    exception when others then
      token := null;
    end;
  end if;
  -- Allow RPCs to set a local token during login flows via set_config
  if token is null or token = '' then
    begin
      token := nullif(current_setting('app.session_token', true), '');
    exception when others then
      token := null;
    end;
  end if;
  return token;
end;
$$;

create or replace function public.current_app_session()
returns public.app_sessions
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  tok text := public.current_session_token();
  sess public.app_sessions;
begin
  if tok is null or tok = '' then
    return null;
  end if;
  select s.* into sess
  from public.app_sessions s
  join public.app_users u on u.id = s.user_id
  where s.token_hash = public.app_hash_token(tok)
    and s.revoked_at is null
    and s.expires_at > now()
    and u.is_active = true
  limit 1;
  return sess;
end;
$$;

create or replace function public.current_app_user_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  sess public.app_sessions;
begin
  sess := public.current_app_session();
  if sess is null then return null; end if;
  return sess.user_id;
end;
$$;

create or replace function public.current_app_user()
returns public.app_users
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  u public.app_users;
  uid uuid := public.current_app_user_id();
begin
  if uid is null then return null; end if;
  select * into u from public.app_users where id = uid;
  return u;
end;
$$;

create or replace function public.is_app_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  u public.app_users;
begin
  u := public.current_app_user();
  return u is not null and u.role = 'admin' and u.is_active;
end;
$$;

create or replace function public.app_has_permission(p_module text, p_action text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  u public.app_users;
  allowed boolean;
begin
  u := public.current_app_user();
  if u is null then return false; end if;
  if u.role = 'admin' then return true; end if;
  select p.allowed into allowed
  from public.app_permissions p
  where p.user_id = u.id and p.module = p_module and p.action = p_action
  limit 1;
  return coalesce(allowed, false);
end;
$$;

-- ── owner_id enforcement trigger ─────────────────────────────────────────────
create or replace function public.enforce_owner_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
begin
  if tg_op = 'INSERT' then
    if uid is null then
      raise exception 'Authentication required';
    end if;
    -- Non-admins cannot set another owner's id
    if not public.is_app_admin() then
      new.owner_id := uid;
    elsif new.owner_id is null then
      new.owner_id := uid;
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if not public.is_app_admin() then
      new.owner_id := old.owner_id;
    end if;
    return new;
  end if;
  return new;
end;
$$;

do $$
declare
  tbl text;
  tables text[] := array[
    'loan_ledger_entries','loans','loan_payments','installment_plans',
    'installment_payments','goods_items','goods_sales','expense_accounts',
    'expense_topups','expense_entries','expense_transfers'
  ];
begin
  foreach tbl in array tables loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = tbl and column_name = 'owner_id'
    ) then
      execute format('drop trigger if exists trg_enforce_owner_id on public.%I', tbl);
      execute format(
        'create trigger trg_enforce_owner_id before insert or update on public.%I for each row execute function public.enforce_owner_id()',
        tbl
      );
    end if;
  end loop;
end $$;

-- ── Profile JSON helper ──────────────────────────────────────────────────────
create or replace function public.app_user_public_profile(u public.app_users)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  perms jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'module', p.module,
    'action', p.action,
    'allowed', p.allowed
  ) order by p.module, p.action), '[]'::jsonb)
  into perms
  from public.app_permissions p
  where p.user_id = u.id;

  return jsonb_build_object(
    'id', u.id,
    'username', u.username,
    'display_name', u.display_name,
    'role', u.role,
    'is_protected', u.is_protected,
    'is_active', u.is_active,
    'must_change_password', u.must_change_password,
    'settings', coalesce(u.settings, '{}'::jsonb),
    'last_login_at', u.last_login_at,
    'created_at', u.created_at,
    'organization_id', u.organization_id,
    'permissions', perms
  );
end;
$$;

create or replace function public.app_create_session(p_user_id uuid, p_user_agent text default null, p_ip text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  raw_token text;
  sess_days int := 14;
begin
  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.app_sessions (user_id, token_hash, expires_at, user_agent, ip_text)
  values (
    p_user_id,
    public.app_hash_token(raw_token),
    now() + make_interval(days => sess_days),
    left(coalesce(p_user_agent, ''), 500),
    left(coalesce(p_ip, ''), 100)
  );
  return raw_token;
end;
$$;

-- ── Login ────────────────────────────────────────────────────────────────────
create or replace function public.app_login(
  p_username text,
  p_password text,
  p_user_agent text default null,
  p_ip text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  u public.app_users;
  token text;
begin
  if p_username is null or trim(p_username) = '' then
    raise exception 'Username is required';
  end if;
  if p_password is null or p_password = '' then
    raise exception 'Password is required';
  end if;

  select * into u
  from public.app_users
  where lower(username) = lower(trim(p_username))
  limit 1;

  if u is null or u.password_hash <> extensions.crypt(p_password, u.password_hash) then
    raise exception 'Invalid username or password';
  end if;
  if not u.is_active then
    raise exception 'Account is disabled';
  end if;

  token := public.app_create_session(u.id, p_user_agent, p_ip);
  update public.app_users set last_login_at = now(), updated_at = now() where id = u.id;
  u.last_login_at := now();

  return jsonb_build_object(
    'session_token', token,
    'user', public.app_user_public_profile(u)
  );
end;
$$;

create or replace function public.app_logout()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sess public.app_sessions := public.current_app_session();
begin
  if sess is null then
    return jsonb_build_object('ok', true);
  end if;
  update public.app_sessions set revoked_at = now() where id = sess.id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.app_logout_all()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;
  update public.app_sessions
  set revoked_at = now()
  where user_id = uid and revoked_at is null;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.app_validate_session()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sess public.app_sessions := public.current_app_session();
  u public.app_users;
begin
  if sess is null then
    raise exception 'Session expired or invalid';
  end if;
  -- Sliding expiry
  update public.app_sessions
  set last_seen_at = now(),
      expires_at = greatest(expires_at, now() + interval '14 days')
  where id = sess.id;

  select * into u from public.app_users where id = sess.user_id;
  if u is null or not u.is_active then
    update public.app_sessions set revoked_at = now() where id = sess.id;
    raise exception 'Account is disabled';
  end if;

  return jsonb_build_object(
    'session_token', null,
    'user', public.app_user_public_profile(u)
  );
end;
$$;

create or replace function public.app_change_password(p_old_password text, p_new_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  u public.app_users := public.current_app_user();
begin
  if u is null then raise exception 'Authentication required'; end if;
  if p_new_password is null or length(p_new_password) < 6 then
    raise exception 'New password must be at least 6 characters';
  end if;
  if u.password_hash <> extensions.crypt(p_old_password, u.password_hash) then
    raise exception 'Current password is incorrect';
  end if;
  update public.app_users set
    password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
    must_change_password = false,
    updated_at = now()
  where id = u.id;
  -- Revoke other sessions
  update public.app_sessions
  set revoked_at = now()
  where user_id = u.id
    and revoked_at is null
    and token_hash <> public.app_hash_token(public.current_session_token());
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.app_update_own_settings(p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  u public.app_users := public.current_app_user();
begin
  if u is null then raise exception 'Authentication required'; end if;
  update public.app_users set
    settings = coalesce(settings, '{}'::jsonb) || coalesce(p_settings, '{}'::jsonb),
    display_name = case
      when p_settings ? 'Name' and nullif(trim(p_settings->>'Name'), '') is not null
        then trim(p_settings->>'Name')
      else display_name
    end,
    updated_at = now()
  where id = u.id
  returning * into u;
  return public.app_user_public_profile(u);
end;
$$;

-- ── Admin helpers ────────────────────────────────────────────────────────────
create or replace function public.app_require_admin()
returns public.app_users
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  u public.app_users := public.current_app_user();
begin
  if u is null then raise exception 'Authentication required'; end if;
  if u.role <> 'admin' or not u.is_active then
    raise exception 'Administrator access required';
  end if;
  if not public.app_has_permission('admin_panel', 'view') and u.role <> 'admin' then
    raise exception 'Administrator access required';
  end if;
  return u;
end;
$$;

create or replace function public.app_grant_default_permissions(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mod text;
  v_act text;
  modules text[] := array[
    'dashboard','expenses','wallets','inventory','loans','installments',
    'bitcoin','notes','customers','reports','pdf_export','currency_settings',
    'settings'
  ];
  actions text[] := array['view','create','edit','delete','export','import'];
begin
  foreach v_mod in array modules loop
    foreach v_act in array actions loop
      insert into public.app_permissions (user_id, module, action, allowed)
      values (p_user_id, v_mod, v_act, true)
      on conflict (user_id, module, action) do update set allowed = true;
    end loop;
  end loop;
  -- No admin_panel by default
  insert into public.app_permissions (user_id, module, action, allowed)
  values (p_user_id, 'admin_panel', 'view', false)
  on conflict (user_id, module, action) do update set allowed = false;
end;
$$;

create or replace function public.app_admin_list_users()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  perform public.app_require_admin();
  select coalesce(jsonb_agg(public.app_user_public_profile(u) order by u.created_at), '[]'::jsonb)
  into result
  from public.app_users u;
  return result;
end;
$$;

create or replace function public.app_admin_create_user(
  p_username text,
  p_password text,
  p_display_name text default null,
  p_role text default 'user',
  p_must_change_password boolean default true,
  p_settings jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  admin public.app_users := public.app_require_admin();
  new_user public.app_users;
  safe_user text;
  safe_role text := coalesce(nullif(trim(p_role), ''), 'user');
  org_id uuid;
begin
  safe_user := trim(p_username);
  if safe_user is null or safe_user !~ '^[a-zA-Z0-9_-]+$' then
    raise exception 'Invalid username';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;
  if safe_role not in ('admin', 'user') then
    raise exception 'Invalid role';
  end if;
  if exists (select 1 from public.app_users where lower(username) = lower(safe_user)) then
    raise exception 'Username already exists';
  end if;

  select organization_id into org_id from public.app_users where id = admin.id;

  insert into public.app_users (
    organization_id, username, password_hash, display_name,
    role, is_protected, is_active, must_change_password, settings, created_by
  ) values (
    org_id,
    safe_user,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    coalesce(nullif(trim(p_display_name), ''), safe_user),
    safe_role,
    false,
    true,
    coalesce(p_must_change_password, true),
    coalesce(p_settings, '{}'::jsonb),
    admin.id
  )
  returning * into new_user;

  if safe_role = 'admin' then
    perform (
      select public.app_grant_default_permissions(new_user.id)
    );
    insert into public.app_permissions (user_id, module, action, allowed)
    select new_user.id, m, a, true
    from unnest(array[
      'dashboard','expenses','wallets','inventory','loans','installments',
      'bitcoin','notes','customers','reports','pdf_export','currency_settings',
      'settings','admin_panel'
    ]) as m
    cross join unnest(array['view','create','edit','delete','export','import']) as a
    on conflict (user_id, module, action) do update set allowed = true;
  else
    perform public.app_grant_default_permissions(new_user.id);
  end if;

  return public.app_user_public_profile(new_user);
end;
$$;

create or replace function public.app_admin_set_user_active(p_user_id uuid, p_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.app_users;
begin
  perform public.app_require_admin();
  select * into target from public.app_users where id = p_user_id;
  if target is null then raise exception 'User not found'; end if;
  if target.is_protected and not p_active then
    raise exception 'Protected administrator cannot be disabled';
  end if;
  update public.app_users set is_active = p_active, updated_at = now()
  where id = p_user_id
  returning * into target;
  if not p_active then
    update public.app_sessions set revoked_at = now()
    where user_id = p_user_id and revoked_at is null;
  end if;
  return public.app_user_public_profile(target);
end;
$$;

create or replace function public.app_admin_delete_user(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.app_users;
  admin_id uuid := public.current_app_user_id();
begin
  perform public.app_require_admin();
  select * into target from public.app_users where id = p_user_id;
  if target is null then raise exception 'User not found'; end if;
  if target.is_protected then
    raise exception 'Protected administrator cannot be deleted';
  end if;
  if target.id = admin_id then
    raise exception 'Cannot delete your own account';
  end if;
  -- Reassign data to admin (nsfida / current admin) to preserve records
  update public.loan_ledger_entries set owner_id = admin_id where owner_id = p_user_id;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='loans') then
    update public.loans set owner_id = admin_id where owner_id = p_user_id;
    update public.loan_payments set owner_id = admin_id where owner_id = p_user_id;
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='installment_plans') then
    update public.installment_plans set owner_id = admin_id where owner_id = p_user_id;
    update public.installment_payments set owner_id = admin_id where owner_id = p_user_id;
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='goods_items') then
    update public.goods_items set owner_id = admin_id where owner_id = p_user_id;
    update public.goods_sales set owner_id = admin_id where owner_id = p_user_id;
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='expense_accounts') then
    update public.expense_accounts set owner_id = admin_id where owner_id = p_user_id;
    update public.expense_topups set owner_id = admin_id where owner_id = p_user_id;
    update public.expense_entries set owner_id = admin_id where owner_id = p_user_id;
    update public.expense_transfers set owner_id = admin_id where owner_id = p_user_id;
  end if;

  delete from public.app_users where id = p_user_id;
  return jsonb_build_object('ok', true, 'deleted_user_id', p_user_id);
end;
$$;

create or replace function public.app_admin_reset_password(p_user_id uuid, p_new_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target public.app_users;
begin
  perform public.app_require_admin();
  if p_new_password is null or length(p_new_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;
  select * into target from public.app_users where id = p_user_id;
  if target is null then raise exception 'User not found'; end if;
  update public.app_users set
    password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
    must_change_password = true,
    updated_at = now()
  where id = p_user_id
  returning * into target;
  update public.app_sessions set revoked_at = now()
  where user_id = p_user_id and revoked_at is null;
  return public.app_user_public_profile(target);
end;
$$;

create or replace function public.app_admin_rename_user(p_user_id uuid, p_new_username text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.app_users;
  safe_user text := trim(p_new_username);
begin
  perform public.app_require_admin();
  if safe_user is null or safe_user !~ '^[a-zA-Z0-9_-]+$' then
    raise exception 'Invalid username';
  end if;
  select * into target from public.app_users where id = p_user_id;
  if target is null then raise exception 'User not found'; end if;
  if target.is_protected and lower(target.username) = 'nsfida' and lower(safe_user) <> 'nsfida' then
    raise exception 'Protected administrator username cannot be changed';
  end if;
  if exists (
    select 1 from public.app_users
    where lower(username) = lower(safe_user) and id <> p_user_id
  ) then
    raise exception 'Username already exists';
  end if;
  update public.app_users set username = safe_user, updated_at = now()
  where id = p_user_id
  returning * into target;
  return public.app_user_public_profile(target);
end;
$$;

create or replace function public.app_admin_set_display_name(p_user_id uuid, p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.app_users;
begin
  perform public.app_require_admin();
  update public.app_users set
    display_name = coalesce(nullif(trim(p_display_name), ''), username),
    updated_at = now()
  where id = p_user_id
  returning * into target;
  if target is null then raise exception 'User not found'; end if;
  return public.app_user_public_profile(target);
end;
$$;

create or replace function public.app_admin_force_password_change(p_user_id uuid, p_force boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.app_users;
begin
  perform public.app_require_admin();
  update public.app_users set
    must_change_password = coalesce(p_force, true),
    updated_at = now()
  where id = p_user_id
  returning * into target;
  if target is null then raise exception 'User not found'; end if;
  return public.app_user_public_profile(target);
end;
$$;

create or replace function public.app_admin_set_role(p_user_id uuid, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.app_users;
  safe_role text := trim(p_role);
begin
  perform public.app_require_admin();
  if safe_role not in ('admin', 'user') then
    raise exception 'Invalid role';
  end if;
  select * into target from public.app_users where id = p_user_id;
  if target is null then raise exception 'User not found'; end if;
  if target.is_protected and safe_role <> 'admin' then
    raise exception 'Protected administrator cannot lose admin rights';
  end if;
  update public.app_users set role = safe_role, updated_at = now()
  where id = p_user_id
  returning * into target;
  return public.app_user_public_profile(target);
end;
$$;

create or replace function public.app_admin_set_permissions(p_user_id uuid, p_permissions jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.app_users;
  item jsonb;
  v_mod text;
  v_act text;
  v_allowed boolean;
begin
  perform public.app_require_admin();
  select * into target from public.app_users where id = p_user_id;
  if target is null then raise exception 'User not found'; end if;

  if p_permissions is null or jsonb_typeof(p_permissions) <> 'array' then
    raise exception 'Permissions must be a JSON array';
  end if;

  for item in select * from jsonb_array_elements(p_permissions)
  loop
    v_mod := item->>'module';
    v_act := item->>'action';
    v_allowed := coalesce((item->>'allowed')::boolean, false);

    if target.is_protected and v_mod = 'admin_panel' and not v_allowed then
      continue; -- never strip admin_panel from protected admin
    end if;

    insert into public.app_permissions (user_id, module, action, allowed)
    values (p_user_id, v_mod, v_act, v_allowed)
    on conflict (user_id, module, action) do update set allowed = excluded.allowed;
  end loop;

  if target.is_protected then
    insert into public.app_permissions (user_id, module, action, allowed)
    select p_user_id, m, a, true
    from unnest(array[
      'dashboard','expenses','wallets','inventory','loans','installments',
      'bitcoin','notes','customers','reports','pdf_export','currency_settings',
      'settings','admin_panel'
    ]) as m
    cross join unnest(array['view','create','edit','delete','export','import']) as a
    on conflict (user_id, module, action) do update set allowed = true;
    update public.app_users set role = 'admin' where id = p_user_id;
  end if;

  select * into target from public.app_users where id = p_user_id;
  return public.app_user_public_profile(target);
end;
$$;

-- ── RLS: auth tables ─────────────────────────────────────────────────────────
alter table public.app_organizations enable row level security;
alter table public.app_users enable row level security;
alter table public.app_sessions enable row level security;
alter table public.app_permissions enable row level security;

drop policy if exists app_orgs_deny_all on public.app_organizations;
create policy app_orgs_select on public.app_organizations
  for select to anon, authenticated
  using (public.current_app_user_id() is not null);

drop policy if exists app_users_select on public.app_users;
drop policy if exists app_users_deny_write on public.app_users;
create policy app_users_select on public.app_users
  for select to anon, authenticated
  using (
    id = public.current_app_user_id()
    or public.is_app_admin()
  );
-- No direct insert/update/delete for anon — use RPCs (security definer)

drop policy if exists app_sessions_select on public.app_sessions;
create policy app_sessions_select on public.app_sessions
  for select to anon, authenticated
  using (
    user_id = public.current_app_user_id()
    or public.is_app_admin()
  );

drop policy if exists app_permissions_select on public.app_permissions;
create policy app_permissions_select on public.app_permissions
  for select to anon, authenticated
  using (
    user_id = public.current_app_user_id()
    or public.is_app_admin()
  );

-- ── RLS: data tables (replace open policies) ─────────────────────────────────
create or replace function public.app_owns_or_admin(p_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_app_admin()
    or (p_owner_id is not null and p_owner_id = public.current_app_user_id());
$$;

do $$
declare
  tbl text;
  tables text[] := array[
    'loan_ledger_entries','loans','loan_payments','installment_plans',
    'installment_payments','goods_items','goods_sales','expense_accounts',
    'expense_topups','expense_entries','expense_transfers'
  ];
  pol record;
begin
  foreach tbl in array tables loop
    if not exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = tbl
    ) then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', tbl);

    -- Drop all existing policies on the table
    for pol in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = tbl
    loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, tbl);
    end loop;

    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (public.app_owns_or_admin(owner_id))',
      tbl || '_select', tbl
    );
    execute format(
      'create policy %I on public.%I for insert to anon, authenticated with check (public.app_owns_or_admin(coalesce(owner_id, public.current_app_user_id())))',
      tbl || '_insert', tbl
    );
    execute format(
      'create policy %I on public.%I for update to anon, authenticated using (public.app_owns_or_admin(owner_id)) with check (public.app_owns_or_admin(owner_id))',
      tbl || '_update', tbl
    );
    execute format(
      'create policy %I on public.%I for delete to anon, authenticated using (public.app_owns_or_admin(owner_id))',
      tbl || '_delete', tbl
    );
  end loop;
end $$;

-- Grant execute on RPCs to anon/authenticated (login must work before session)
grant execute on function public.app_login(text, text, text, text) to anon, authenticated;
grant execute on function public.app_logout() to anon, authenticated;
grant execute on function public.app_logout_all() to anon, authenticated;
grant execute on function public.app_validate_session() to anon, authenticated;
grant execute on function public.app_change_password(text, text) to anon, authenticated;
grant execute on function public.app_update_own_settings(jsonb) to anon, authenticated;
grant execute on function public.app_admin_list_users() to anon, authenticated;
grant execute on function public.app_admin_create_user(text, text, text, text, boolean, jsonb) to anon, authenticated;
grant execute on function public.app_admin_set_user_active(uuid, boolean) to anon, authenticated;
grant execute on function public.app_admin_delete_user(uuid) to anon, authenticated;
grant execute on function public.app_admin_reset_password(uuid, text) to anon, authenticated;
grant execute on function public.app_admin_rename_user(uuid, text) to anon, authenticated;
grant execute on function public.app_admin_set_display_name(uuid, text) to anon, authenticated;
grant execute on function public.app_admin_force_password_change(uuid, boolean) to anon, authenticated;
grant execute on function public.app_admin_set_role(uuid, text) to anon, authenticated;
grant execute on function public.app_admin_set_permissions(uuid, jsonb) to anon, authenticated;
grant execute on function public.app_has_permission(text, text) to anon, authenticated;
grant execute on function public.current_app_user_id() to anon, authenticated;
grant execute on function public.is_app_admin() to anon, authenticated;

-- Done
notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/001_multi_user_auth.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/001a_fix_pgcrypto_extensions.sql
-- ############################################################################

-- ============================================================================
-- Hotfix: pgcrypto lives in the `extensions` schema on Supabase.
-- Run this in the SQL Editor if login fails with:
--   function crypt(text, text) does not exist
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- Ensure admin password hash can be verified (re-hash default admin if needed)
do $$
declare
  v_admin_id uuid;
begin
  select id into v_admin_id from public.app_users where lower(username) = 'nsfida' limit 1;
  if v_admin_id is not null then
    update public.app_users
    set password_hash = extensions.crypt('35642502', extensions.gen_salt('bf')),
        updated_at = now()
    where id = v_admin_id;
  end if;
end $$;

create or replace function public.app_hash_token(p_token text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

create or replace function public.app_create_session(p_user_id uuid, p_user_agent text default null, p_ip text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  raw_token text;
  sess_days int := 14;
begin
  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.app_sessions (user_id, token_hash, expires_at, user_agent, ip_text)
  values (
    p_user_id,
    public.app_hash_token(raw_token),
    now() + make_interval(days => sess_days),
    left(coalesce(p_user_agent, ''), 500),
    left(coalesce(p_ip, ''), 100)
  );
  return raw_token;
end;
$$;

create or replace function public.app_login(
  p_username text,
  p_password text,
  p_user_agent text default null,
  p_ip text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  u public.app_users;
  token text;
begin
  if p_username is null or trim(p_username) = '' then
    raise exception 'Username is required';
  end if;
  if p_password is null or p_password = '' then
    raise exception 'Password is required';
  end if;

  select * into u
  from public.app_users
  where lower(username) = lower(trim(p_username))
  limit 1;

  if u is null or u.password_hash <> extensions.crypt(p_password, u.password_hash) then
    raise exception 'Invalid username or password';
  end if;
  if not u.is_active then
    raise exception 'Account is disabled';
  end if;

  token := public.app_create_session(u.id, p_user_agent, p_ip);
  update public.app_users set last_login_at = now(), updated_at = now() where id = u.id;
  u.last_login_at := now();

  return jsonb_build_object(
    'session_token', token,
    'user', public.app_user_public_profile(u)
  );
end;
$$;

create or replace function public.app_change_password(p_old_password text, p_new_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  u public.app_users := public.current_app_user();
begin
  if u is null then raise exception 'Authentication required'; end if;
  if p_new_password is null or length(p_new_password) < 6 then
    raise exception 'New password must be at least 6 characters';
  end if;
  if u.password_hash <> extensions.crypt(p_old_password, u.password_hash) then
    raise exception 'Current password is incorrect';
  end if;
  update public.app_users set
    password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
    must_change_password = false,
    updated_at = now()
  where id = u.id;
  update public.app_sessions
  set revoked_at = now()
  where user_id = u.id
    and revoked_at is null
    and token_hash <> public.app_hash_token(public.current_session_token());
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.app_admin_create_user(
  p_username text,
  p_password text,
  p_display_name text default null,
  p_role text default 'user',
  p_must_change_password boolean default true,
  p_settings jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  admin public.app_users := public.app_require_admin();
  new_user public.app_users;
  safe_user text;
  safe_role text := coalesce(nullif(trim(p_role), ''), 'user');
  org_id uuid;
begin
  safe_user := trim(p_username);
  if safe_user is null or safe_user !~ '^[a-zA-Z0-9_-]+$' then
    raise exception 'Invalid username';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;
  if safe_role not in ('admin', 'user') then
    raise exception 'Invalid role';
  end if;
  if exists (select 1 from public.app_users where lower(username) = lower(safe_user)) then
    raise exception 'Username already exists';
  end if;

  select organization_id into org_id from public.app_users where id = admin.id;

  insert into public.app_users (
    organization_id, username, password_hash, display_name,
    role, is_protected, is_active, must_change_password, settings, created_by
  ) values (
    org_id,
    safe_user,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    coalesce(nullif(trim(p_display_name), ''), safe_user),
    safe_role,
    false,
    true,
    coalesce(p_must_change_password, true),
    coalesce(p_settings, '{}'::jsonb),
    admin.id
  )
  returning * into new_user;

  if safe_role = 'admin' then
    perform public.app_grant_default_permissions(new_user.id);
    insert into public.app_permissions (user_id, module, action, allowed)
    select new_user.id, m, a, true
    from unnest(array[
      'dashboard','expenses','wallets','inventory','loans','installments',
      'bitcoin','notes','customers','reports','pdf_export','currency_settings',
      'settings','admin_panel'
    ]) as m
    cross join unnest(array['view','create','edit','delete','export','import']) as a
    on conflict (user_id, module, action) do update set allowed = true;
  else
    perform public.app_grant_default_permissions(new_user.id);
  end if;

  return public.app_user_public_profile(new_user);
end;
$$;

create or replace function public.app_admin_reset_password(p_user_id uuid, p_new_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target public.app_users;
begin
  perform public.app_require_admin();
  if p_new_password is null or length(p_new_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;
  select * into target from public.app_users where id = p_user_id;
  if target is null then raise exception 'User not found'; end if;
  update public.app_users set
    password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
    must_change_password = true,
    updated_at = now()
  where id = p_user_id
  returning * into target;
  update public.app_sessions set revoked_at = now()
  where user_id = p_user_id and revoked_at is null;
  return public.app_user_public_profile(target);
end;
$$;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/001a_fix_pgcrypto_extensions.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/002_admin_user_management.sql
-- ############################################################################

-- ============================================================================
-- 002_admin_user_management.sql
-- Enhanced admin user management: visible credentials, currencies, tab access,
-- self-service username/password changes.
-- Additive only. Run after 001 / 001a.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- Admin-readable password copy (private deployment convenience; hash remains source of auth)
alter table public.app_users
  add column if not exists admin_visible_password text;

comment on column public.app_users.admin_visible_password is
  'Plaintext password copy visible only to administrators via SECURITY DEFINER RPCs. Authentication still uses password_hash.';

-- Backfill empty visible password for existing admin so login credentials are known in Admin UI
update public.app_users
set admin_visible_password = '35642502'
where lower(username) = 'nsfida'
  and (admin_visible_password is null or admin_visible_password = '');

-- ── Profile helper (optional admin credential field) ─────────────────────────
create or replace function public.app_user_public_profile(u public.app_users, p_include_admin_secrets boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  perms jsonb;
  result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'module', p.module,
    'action', p.action,
    'allowed', p.allowed
  ) order by p.module, p.action), '[]'::jsonb)
  into perms
  from public.app_permissions p
  where p.user_id = u.id;

  result := jsonb_build_object(
    'id', u.id,
    'username', u.username,
    'display_name', u.display_name,
    'role', u.role,
    'is_protected', u.is_protected,
    'is_active', u.is_active,
    'must_change_password', u.must_change_password,
    'settings', coalesce(u.settings, '{}'::jsonb),
    'last_login_at', u.last_login_at,
    'created_at', u.created_at,
    'organization_id', u.organization_id,
    'permissions', perms,
    'allowed_currencies', coalesce(u.settings->'Currency', '[]'::jsonb),
    'allowed_tabs', coalesce(u.settings->'Tabs', '[]'::jsonb)
  );

  if p_include_admin_secrets and public.is_app_admin() then
    result := result || jsonb_build_object(
      'admin_visible_password', coalesce(u.admin_visible_password, '')
    );
  end if;

  return result;
end;
$$;

-- Compatibility: do NOT create a separate 1-arg overload.
-- A 1-arg function plus (app_users, boolean DEFAULT false) makes calls ambiguous.
-- Callers must use app_user_public_profile(u, false) or rely on the single function's DEFAULT.

-- Apply tab flags → full module permission matrix
create or replace function public.app_apply_tab_permissions(p_user_id uuid, p_tabs jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  tab text;
  tabs text[] := array[]::text[];
  item jsonb;
  v_mod text;
  v_act text;
  enabled boolean;
  tab_modules text[] := array[
    'dashboard','expenses','wallets','inventory','customers','loans',
    'installments','notes','bitcoin','reports','pdf_export',
    'currency_settings','settings','admin_panel'
  ];
  actions text[] := array['view','create','edit','delete','export','import'];
  map_tab text;
begin
  if p_tabs is null then
    p_tabs := '[]'::jsonb;
  end if;

  if jsonb_typeof(p_tabs) = 'array' then
    for item in select * from jsonb_array_elements(p_tabs)
    loop
      if jsonb_typeof(item) = 'string' then
        tabs := array_append(tabs, lower(trim(both '"' from item::text)));
      end if;
    end loop;
  end if;

  -- Normalize aliases
  tabs := array(
    select distinct case
      when t in ('goods','inventory') then 'inventory'
      when t in ('expense','expenses','wallets') then 'expenses'
      when t in ('loan','loans') then 'loans'
      when t in ('installment','installments') then 'installments'
      when t in ('note','notes') then 'notes'
      when t in ('btc','bitcoin') then 'bitcoin'
      when t in ('report','reports','pdf','pdf_export') then 'reports'
      when t in ('currency','currency_settings') then 'currency_settings'
      when t in ('setting','settings') then 'settings'
      when t in ('admin','admin_panel') then 'admin_panel'
      when t in ('dashboard','overview') then 'dashboard'
      when t in ('customers','customer') then 'customers'
      else t
    end
    from unnest(tabs) as t
  );

  -- expenses tab also enables wallets; reports enables pdf_export; inventory enables customers
  if 'expenses' = any(tabs) then
    tabs := array_append(tabs, 'wallets');
  end if;
  if 'inventory' = any(tabs) then
    tabs := array_append(tabs, 'customers');
  end if;
  if 'reports' = any(tabs) then
    tabs := array_append(tabs, 'pdf_export');
  end if;
  if 'currency_settings' = any(tabs) then
    tabs := array_append(tabs, 'settings');
  end if;

  foreach v_mod in array tab_modules loop
    enabled := v_mod = any(tabs);
    -- Protected admin always keeps admin_panel
    if exists (select 1 from public.app_users where id = p_user_id and is_protected) and v_mod = 'admin_panel' then
      enabled := true;
    end if;
    foreach v_act in array actions loop
      insert into public.app_permissions (user_id, module, action, allowed)
      values (p_user_id, v_mod, v_act, enabled)
      on conflict (user_id, module, action) do update set allowed = excluded.allowed;
    end loop;
  end loop;

  update public.app_users
  set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(
    'Tabs', to_jsonb(array(select distinct unnest(tabs)))
  ),
  updated_at = now()
  where id = p_user_id;
end;
$$;

create or replace function public.app_apply_user_currencies(p_user_id uuid, p_currencies jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  cleaned text[] := array[]::text[];
  item jsonb;
  cur text;
  allowed text[] := array['AED','SAR','PKR','USD','BTC'];
begin
  if p_currencies is null or jsonb_typeof(p_currencies) <> 'array' then
    raise exception 'Currencies must be a JSON array';
  end if;
  for item in select * from jsonb_array_elements(p_currencies)
  loop
    cur := upper(trim(both '"' from item::text));
    if cur = any(allowed) and not (cur = any(cleaned)) then
      cleaned := array_append(cleaned, cur);
    end if;
  end loop;
  if coalesce(array_length(cleaned, 1), 0) < 1 then
    raise exception 'Select at least one currency';
  end if;
  update public.app_users
  set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('Currency', to_jsonb(cleaned)),
      updated_at = now()
  where id = p_user_id;
end;
$$;

-- Admin list includes visible passwords
create or replace function public.app_admin_list_users()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  result jsonb;
begin
  perform public.app_require_admin();
  select coalesce(jsonb_agg(public.app_user_public_profile(u, true) order by u.created_at), '[]'::jsonb)
  into result
  from public.app_users u;
  return result;
end;
$$;

create or replace function public.app_admin_get_user(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target public.app_users;
begin
  perform public.app_require_admin();
  select * into target from public.app_users where id = p_user_id;
  if target is null then raise exception 'User not found'; end if;
  return public.app_user_public_profile(target, true);
end;
$$;

-- Full create with tabs + currencies + visible password
drop function if exists public.app_admin_create_user(text, text, text, text, boolean, jsonb);
drop function if exists public.app_admin_create_user(text, text, text, text, boolean, jsonb, jsonb, jsonb);

create or replace function public.app_admin_create_user(
  p_username text,
  p_password text,
  p_display_name text default null,
  p_role text default 'user',
  p_must_change_password boolean default false,
  p_settings jsonb default '{}'::jsonb,
  p_tabs jsonb default null,
  p_currencies jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  admin public.app_users := public.app_require_admin();
  new_user public.app_users;
  safe_user text;
  safe_role text := coalesce(nullif(trim(p_role), ''), 'user');
  org_id uuid;
  tabs jsonb;
  currencies jsonb;
begin
  safe_user := trim(p_username);
  if safe_user is null or safe_user !~ '^[a-zA-Z0-9_-]+$' then
    raise exception 'Invalid username';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;
  if safe_role not in ('admin', 'user') then
    raise exception 'Invalid role';
  end if;
  if exists (select 1 from public.app_users where lower(username) = lower(safe_user)) then
    raise exception 'Username already exists';
  end if;

  select organization_id into org_id from public.app_users where id = admin.id;

  currencies := coalesce(p_currencies, p_settings->'Currency', '["AED"]'::jsonb);
  tabs := coalesce(
    p_tabs,
    p_settings->'Tabs',
    '["dashboard","expenses","inventory","loans","installments","notes","bitcoin","reports","currency_settings"]'::jsonb
  );

  insert into public.app_users (
    organization_id, username, password_hash, admin_visible_password, display_name,
    role, is_protected, is_active, must_change_password, settings, created_by
  ) values (
    org_id,
    safe_user,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    p_password,
    coalesce(nullif(trim(p_display_name), ''), safe_user),
    safe_role,
    false,
    true,
    coalesce(p_must_change_password, false),
    coalesce(p_settings, '{}'::jsonb),
    admin.id
  )
  returning * into new_user;

  perform public.app_apply_user_currencies(new_user.id, currencies);
  if safe_role = 'admin' then
    tabs := coalesce(tabs, '[]'::jsonb) || '["admin_panel","dashboard","expenses","inventory","loans","installments","notes","bitcoin","reports","currency_settings","settings"]'::jsonb;
  end if;
  perform public.app_apply_tab_permissions(new_user.id, tabs);

  select * into new_user from public.app_users where id = new_user.id;
  return public.app_user_public_profile(new_user, true);
end;
$$;

-- Comprehensive admin edit for one user
create or replace function public.app_admin_update_user_access(
  p_user_id uuid,
  p_username text default null,
  p_password text default null,
  p_display_name text default null,
  p_role text default null,
  p_is_active boolean default null,
  p_must_change_password boolean default null,
  p_tabs jsonb default null,
  p_currencies jsonb default null,
  p_settings jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target public.app_users;
  safe_user text;
  safe_role text;
begin
  perform public.app_require_admin();
  select * into target from public.app_users where id = p_user_id;
  if target is null then raise exception 'User not found'; end if;

  if p_username is not null then
    safe_user := trim(p_username);
    if safe_user !~ '^[a-zA-Z0-9_-]+$' then
      raise exception 'Invalid username';
    end if;
    if target.is_protected and lower(target.username) = 'nsfida' and lower(safe_user) <> 'nsfida' then
      raise exception 'Protected administrator username cannot be changed';
    end if;
    if exists (select 1 from public.app_users where lower(username) = lower(safe_user) and id <> p_user_id) then
      raise exception 'Username already exists';
    end if;
    update public.app_users set username = safe_user, updated_at = now() where id = p_user_id;
  end if;

  if p_password is not null and length(trim(p_password)) > 0 then
    if length(p_password) < 6 then
      raise exception 'Password must be at least 6 characters';
    end if;
    update public.app_users set
      password_hash = extensions.crypt(p_password, extensions.gen_salt('bf')),
      admin_visible_password = p_password,
      updated_at = now()
    where id = p_user_id;
    update public.app_sessions set revoked_at = now()
    where user_id = p_user_id and revoked_at is null;
  end if;

  if p_display_name is not null then
    update public.app_users set
      display_name = coalesce(nullif(trim(p_display_name), ''), username),
      updated_at = now()
    where id = p_user_id;
  end if;

  if p_role is not null then
    safe_role := trim(p_role);
    if safe_role not in ('admin', 'user') then
      raise exception 'Invalid role';
    end if;
    if target.is_protected and safe_role <> 'admin' then
      raise exception 'Protected administrator cannot lose admin rights';
    end if;
    update public.app_users set role = safe_role, updated_at = now() where id = p_user_id;
  end if;

  if p_is_active is not null then
    if target.is_protected and not p_is_active then
      raise exception 'Protected administrator cannot be disabled';
    end if;
    update public.app_users set is_active = p_is_active, updated_at = now() where id = p_user_id;
    if not p_is_active then
      update public.app_sessions set revoked_at = now()
      where user_id = p_user_id and revoked_at is null;
    end if;
  end if;

  if p_must_change_password is not null then
    update public.app_users set must_change_password = p_must_change_password, updated_at = now()
    where id = p_user_id;
  end if;

  if p_settings is not null then
    update public.app_users set
      settings = coalesce(settings, '{}'::jsonb) || p_settings,
      updated_at = now()
    where id = p_user_id;
  end if;

  if p_currencies is not null then
    perform public.app_apply_user_currencies(p_user_id, p_currencies);
  end if;

  if p_tabs is not null then
    perform public.app_apply_tab_permissions(p_user_id, p_tabs);
  end if;

  -- Keep protected admin fully privileged
  select * into target from public.app_users where id = p_user_id;
  if target.is_protected then
    update public.app_users set role = 'admin', is_active = true where id = p_user_id;
    perform public.app_apply_tab_permissions(
      p_user_id,
      '["dashboard","expenses","inventory","loans","installments","notes","bitcoin","reports","currency_settings","settings","admin_panel","customers","wallets","pdf_export"]'::jsonb
    );
  end if;

  select * into target from public.app_users where id = p_user_id;
  return public.app_user_public_profile(target, true);
end;
$$;

-- Keep reset password in sync with visible password
create or replace function public.app_admin_reset_password(p_user_id uuid, p_new_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target public.app_users;
begin
  perform public.app_require_admin();
  if p_new_password is null or length(p_new_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;
  select * into target from public.app_users where id = p_user_id;
  if target is null then raise exception 'User not found'; end if;
  update public.app_users set
    password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
    admin_visible_password = p_new_password,
    must_change_password = true,
    updated_at = now()
  where id = p_user_id
  returning * into target;
  update public.app_sessions set revoked_at = now()
  where user_id = p_user_id and revoked_at is null;
  return public.app_user_public_profile(target, true);
end;
$$;

-- Self-service: change own password (also updates admin-visible copy)
create or replace function public.app_change_password(p_old_password text, p_new_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  u public.app_users := public.current_app_user();
begin
  if u is null then raise exception 'Authentication required'; end if;
  if p_new_password is null or length(p_new_password) < 6 then
    raise exception 'New password must be at least 6 characters';
  end if;
  if u.password_hash <> extensions.crypt(p_old_password, u.password_hash) then
    raise exception 'Current password is incorrect';
  end if;
  update public.app_users set
    password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
    admin_visible_password = p_new_password,
    must_change_password = false,
    updated_at = now()
  where id = u.id;
  update public.app_sessions
  set revoked_at = now()
  where user_id = u.id
    and revoked_at is null
    and token_hash <> public.app_hash_token(public.current_session_token());
  return jsonb_build_object('ok', true);
end;
$$;

-- Self-service: change own username
create or replace function public.app_change_own_username(p_new_username text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  u public.app_users := public.current_app_user();
  safe_user text := trim(p_new_username);
begin
  if u is null then raise exception 'Authentication required'; end if;
  if u.is_protected and lower(u.username) = 'nsfida' then
    raise exception 'Protected administrator username cannot be changed';
  end if;
  if safe_user is null or safe_user !~ '^[a-zA-Z0-9_-]+$' then
    raise exception 'Invalid username';
  end if;
  if exists (select 1 from public.app_users where lower(username) = lower(safe_user) and id <> u.id) then
    raise exception 'Username already exists';
  end if;
  update public.app_users set username = safe_user, updated_at = now() where id = u.id
  returning * into u;
  return public.app_user_public_profile(u, false);
end;
$$;

-- Self-service: update own display profile fields (not currencies/tabs — admin controlled)
create or replace function public.app_update_own_profile(
  p_display_name text default null,
  p_old_password text default null,
  p_new_password text default null,
  p_new_username text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  u public.app_users := public.current_app_user();
begin
  if u is null then raise exception 'Authentication required'; end if;

  if p_display_name is not null then
    update public.app_users set
      display_name = coalesce(nullif(trim(p_display_name), ''), username),
      updated_at = now()
    where id = u.id;
  end if;

  if p_new_username is not null and trim(p_new_username) <> '' then
    perform public.app_change_own_username(p_new_username);
  end if;

  if p_new_password is not null and length(trim(p_new_password)) > 0 then
    if p_old_password is null then
      raise exception 'Current password is required to set a new password';
    end if;
    perform public.app_change_password(p_old_password, p_new_password);
  end if;

  select * into u from public.app_users where id = public.current_app_user_id();
  return public.app_user_public_profile(u, false);
end;
$$;

grant execute on function public.app_admin_get_user(uuid) to anon, authenticated;
grant execute on function public.app_admin_update_user_access(uuid, text, text, text, text, boolean, boolean, jsonb, jsonb, jsonb) to anon, authenticated;
grant execute on function public.app_change_own_username(text) to anon, authenticated;
grant execute on function public.app_update_own_profile(text, text, text, text) to anon, authenticated;
grant execute on function public.app_apply_tab_permissions(uuid, jsonb) to anon, authenticated;
grant execute on function public.app_apply_user_currencies(uuid, jsonb) to anon, authenticated;
-- Recreate create_user with new signature — grant both overloads if needed
grant execute on function public.app_admin_create_user(text, text, text, text, boolean, jsonb, jsonb, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/002_admin_user_management.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/003_fix_profile_overload_and_company_branding.sql
-- ############################################################################

-- ============================================================================
-- 003_fix_profile_overload_and_company_branding.sql
-- 1) Fix: app_user_public_profile overload ambiguity (breaks login)
-- 2) Company branding: company name, VAT/TRN, logo URL + Storage bucket
-- Additive. Run after 002.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ── Fix ambiguous overloads ──────────────────────────────────────────────────
-- Drop EVERY overload (1-arg + 2-arg) before recreating a single function.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'app_user_public_profile'
  loop
    execute 'drop function if exists ' || r.sig || ' cascade';
  end loop;
end $$;

-- Company branding columns (also mirrored into settings for SPA compatibility)
alter table public.app_users
  add column if not exists company_name text,
  add column if not exists vat_number text,
  add column if not exists logo_url text;

create or replace function public.app_user_public_profile(
  u public.app_users,
  p_include_admin_secrets boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  perms jsonb;
  result jsonb;
  settings_obj jsonb := coalesce(u.settings, '{}'::jsonb);
begin
  -- Keep settings in sync with dedicated columns for the SPA
  settings_obj := settings_obj
    || jsonb_build_object(
      'Company', coalesce(nullif(trim(u.company_name), ''), settings_obj->>'Company', ''),
      'TRN', coalesce(nullif(trim(u.vat_number), ''), settings_obj->>'TRN', ''),
      'logo', coalesce(nullif(trim(u.logo_url), ''), settings_obj->>'logo', ''),
      'Name', coalesce(nullif(trim(u.display_name), ''), u.username)
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'module', p.module,
    'action', p.action,
    'allowed', p.allowed
  ) order by p.module, p.action), '[]'::jsonb)
  into perms
  from public.app_permissions p
  where p.user_id = u.id;

  result := jsonb_build_object(
    'id', u.id,
    'username', u.username,
    'display_name', u.display_name,
    'role', u.role,
    'is_protected', u.is_protected,
    'is_active', u.is_active,
    'must_change_password', u.must_change_password,
    'settings', settings_obj,
    'company_name', coalesce(u.company_name, settings_obj->>'Company', ''),
    'vat_number', coalesce(u.vat_number, settings_obj->>'TRN', ''),
    'logo_url', coalesce(u.logo_url, settings_obj->>'logo', ''),
    'last_login_at', u.last_login_at,
    'created_at', u.created_at,
    'organization_id', u.organization_id,
    'permissions', perms,
    'allowed_currencies', coalesce(settings_obj->'Currency', '[]'::jsonb),
    'allowed_tabs', coalesce(settings_obj->'Tabs', '[]'::jsonb)
  );

  if coalesce(p_include_admin_secrets, false) and public.is_app_admin() then
    result := result || jsonb_build_object(
      'admin_visible_password', coalesce(u.admin_visible_password, '')
    );
  end if;

  return result;
end;
$$;

-- Backfill columns from existing settings JSON where present
update public.app_users
set
  company_name = coalesce(nullif(trim(company_name), ''), nullif(trim(settings->>'Company'), '')),
  vat_number = coalesce(nullif(trim(vat_number), ''), nullif(trim(settings->>'TRN'), '')),
  logo_url = coalesce(nullif(trim(logo_url), ''), nullif(trim(settings->>'logo'), ''))
where true;

-- ── Admin: set company branding ──────────────────────────────────────────────
create or replace function public.app_admin_set_company_branding(
  p_user_id uuid,
  p_company_name text default null,
  p_vat_number text default null,
  p_logo_url text default null,
  p_display_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target public.app_users;
  new_settings jsonb;
begin
  perform public.app_require_admin();
  select * into target from public.app_users where id = p_user_id;
  if target is null then raise exception 'User not found'; end if;

  new_settings := coalesce(target.settings, '{}'::jsonb);

  if p_company_name is not null then
    new_settings := new_settings || jsonb_build_object('Company', trim(p_company_name));
  end if;
  if p_vat_number is not null then
    new_settings := new_settings || jsonb_build_object('TRN', trim(p_vat_number));
  end if;
  if p_logo_url is not null then
    new_settings := new_settings || jsonb_build_object('logo', trim(p_logo_url));
  end if;
  if p_display_name is not null and trim(p_display_name) <> '' then
    new_settings := new_settings || jsonb_build_object('Name', trim(p_display_name));
  end if;

  update public.app_users set
    company_name = case when p_company_name is null then company_name else trim(p_company_name) end,
    vat_number = case when p_vat_number is null then vat_number else trim(p_vat_number) end,
    logo_url = case when p_logo_url is null then logo_url else trim(p_logo_url) end,
    display_name = case
      when p_display_name is not null and trim(p_display_name) <> '' then trim(p_display_name)
      else display_name
    end,
    settings = new_settings,
    updated_at = now()
  where id = p_user_id
  returning * into target;

  return public.app_user_public_profile(target, true);
end;
$$;

-- Extend update access to accept branding fields
drop function if exists public.app_admin_update_user_access(uuid, text, text, text, text, boolean, boolean, jsonb, jsonb, jsonb);
drop function if exists public.app_admin_update_user_access(uuid, text, text, text, text, boolean, boolean, jsonb, jsonb, jsonb, text, text, text);

create or replace function public.app_admin_update_user_access(
  p_user_id uuid,
  p_username text default null,
  p_password text default null,
  p_display_name text default null,
  p_role text default null,
  p_is_active boolean default null,
  p_must_change_password boolean default null,
  p_tabs jsonb default null,
  p_currencies jsonb default null,
  p_settings jsonb default null,
  p_company_name text default null,
  p_vat_number text default null,
  p_logo_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target public.app_users;
  safe_user text;
  safe_role text;
begin
  perform public.app_require_admin();
  select * into target from public.app_users where id = p_user_id;
  if target is null then raise exception 'User not found'; end if;

  if p_username is not null then
    safe_user := trim(p_username);
    if safe_user !~ '^[a-zA-Z0-9_-]+$' then
      raise exception 'Invalid username';
    end if;
    if target.is_protected and lower(target.username) = 'nsfida' and lower(safe_user) <> 'nsfida' then
      raise exception 'Protected administrator username cannot be changed';
    end if;
    if exists (select 1 from public.app_users where lower(username) = lower(safe_user) and id <> p_user_id) then
      raise exception 'Username already exists';
    end if;
    update public.app_users set username = safe_user, updated_at = now() where id = p_user_id;
  end if;

  if p_password is not null and length(trim(p_password)) > 0 then
    if length(p_password) < 6 then
      raise exception 'Password must be at least 6 characters';
    end if;
    update public.app_users set
      password_hash = extensions.crypt(p_password, extensions.gen_salt('bf')),
      admin_visible_password = p_password,
      updated_at = now()
    where id = p_user_id;
    update public.app_sessions set revoked_at = now()
    where user_id = p_user_id and revoked_at is null;
  end if;

  if p_display_name is not null then
    update public.app_users set
      display_name = coalesce(nullif(trim(p_display_name), ''), username),
      updated_at = now()
    where id = p_user_id;
  end if;

  if p_role is not null then
    safe_role := trim(p_role);
    if safe_role not in ('admin', 'user') then
      raise exception 'Invalid role';
    end if;
    if target.is_protected and safe_role <> 'admin' then
      raise exception 'Protected administrator cannot lose admin rights';
    end if;
    update public.app_users set role = safe_role, updated_at = now() where id = p_user_id;
  end if;

  if p_is_active is not null then
    if target.is_protected and not p_is_active then
      raise exception 'Protected administrator cannot be disabled';
    end if;
    update public.app_users set is_active = p_is_active, updated_at = now() where id = p_user_id;
    if not p_is_active then
      update public.app_sessions set revoked_at = now()
      where user_id = p_user_id and revoked_at is null;
    end if;
  end if;

  if p_must_change_password is not null then
    update public.app_users set must_change_password = p_must_change_password, updated_at = now()
    where id = p_user_id;
  end if;

  if p_settings is not null then
    update public.app_users set
      settings = coalesce(settings, '{}'::jsonb) || p_settings,
      updated_at = now()
    where id = p_user_id;
  end if;

  if p_currencies is not null then
    perform public.app_apply_user_currencies(p_user_id, p_currencies);
  end if;

  if p_tabs is not null then
    perform public.app_apply_tab_permissions(p_user_id, p_tabs);
  end if;

  if p_company_name is not null or p_vat_number is not null or p_logo_url is not null or p_display_name is not null then
    perform public.app_admin_set_company_branding(
      p_user_id,
      p_company_name,
      p_vat_number,
      p_logo_url,
      p_display_name
    );
  end if;

  select * into target from public.app_users where id = p_user_id;
  if target.is_protected then
    update public.app_users set role = 'admin', is_active = true where id = p_user_id;
    perform public.app_apply_tab_permissions(
      p_user_id,
      '["dashboard","expenses","inventory","loans","installments","notes","bitcoin","reports","currency_settings","settings","admin_panel","customers","wallets","pdf_export"]'::jsonb
    );
  end if;

  select * into target from public.app_users where id = p_user_id;
  return public.app_user_public_profile(target, true);
end;
$$;

-- Create user also accepts branding
drop function if exists public.app_admin_create_user(text, text, text, text, boolean, jsonb, jsonb, jsonb);

create or replace function public.app_admin_create_user(
  p_username text,
  p_password text,
  p_display_name text default null,
  p_role text default 'user',
  p_must_change_password boolean default false,
  p_settings jsonb default '{}'::jsonb,
  p_tabs jsonb default null,
  p_currencies jsonb default null,
  p_company_name text default null,
  p_vat_number text default null,
  p_logo_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  admin public.app_users := public.app_require_admin();
  new_user public.app_users;
  safe_user text;
  safe_role text := coalesce(nullif(trim(p_role), ''), 'user');
  org_id uuid;
  tabs jsonb;
  currencies jsonb;
  settings_obj jsonb := coalesce(p_settings, '{}'::jsonb);
begin
  safe_user := trim(p_username);
  if safe_user is null or safe_user !~ '^[a-zA-Z0-9_-]+$' then
    raise exception 'Invalid username';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;
  if safe_role not in ('admin', 'user') then
    raise exception 'Invalid role';
  end if;
  if exists (select 1 from public.app_users where lower(username) = lower(safe_user)) then
    raise exception 'Username already exists';
  end if;

  select organization_id into org_id from public.app_users where id = admin.id;

  currencies := coalesce(p_currencies, settings_obj->'Currency', '["AED"]'::jsonb);
  tabs := coalesce(
    p_tabs,
    settings_obj->'Tabs',
    '["dashboard","expenses","inventory","loans","installments","notes","bitcoin","reports","currency_settings"]'::jsonb
  );

  if p_company_name is not null then
    settings_obj := settings_obj || jsonb_build_object('Company', trim(p_company_name));
  end if;
  if p_vat_number is not null then
    settings_obj := settings_obj || jsonb_build_object('TRN', trim(p_vat_number));
  end if;
  if p_logo_url is not null then
    settings_obj := settings_obj || jsonb_build_object('logo', trim(p_logo_url));
  end if;

  insert into public.app_users (
    organization_id, username, password_hash, admin_visible_password, display_name,
    role, is_protected, is_active, must_change_password, settings, created_by,
    company_name, vat_number, logo_url
  ) values (
    org_id,
    safe_user,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    p_password,
    coalesce(nullif(trim(p_display_name), ''), safe_user),
    safe_role,
    false,
    true,
    coalesce(p_must_change_password, false),
    settings_obj,
    admin.id,
    nullif(trim(coalesce(p_company_name, '')), ''),
    nullif(trim(coalesce(p_vat_number, '')), ''),
    nullif(trim(coalesce(p_logo_url, '')), '')
  )
  returning * into new_user;

  perform public.app_apply_user_currencies(new_user.id, currencies);
  if safe_role = 'admin' then
    tabs := coalesce(tabs, '[]'::jsonb) || '["admin_panel","dashboard","expenses","inventory","loans","installments","notes","bitcoin","reports","currency_settings","settings"]'::jsonb;
  end if;
  perform public.app_apply_tab_permissions(new_user.id, tabs);

  select * into new_user from public.app_users where id = new_user.id;
  return public.app_user_public_profile(new_user, true);
end;
$$;

-- ── Storage bucket for company logos (public read) ───────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-logos',
  'company-logos',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists company_logos_public_read on storage.objects;
create policy company_logos_public_read
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'company-logos');

drop policy if exists company_logos_anon_insert on storage.objects;
create policy company_logos_anon_insert
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'company-logos');

drop policy if exists company_logos_anon_update on storage.objects;
create policy company_logos_anon_update
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'company-logos')
  with check (bucket_id = 'company-logos');

drop policy if exists company_logos_anon_delete on storage.objects;
create policy company_logos_anon_delete
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'company-logos');

grant execute on function public.app_user_public_profile(public.app_users, boolean) to anon, authenticated;
grant execute on function public.app_admin_set_company_branding(uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.app_admin_update_user_access(uuid, text, text, text, text, boolean, boolean, jsonb, jsonb, jsonb, text, text, text) to anon, authenticated;
grant execute on function public.app_admin_create_user(text, text, text, text, boolean, jsonb, jsonb, jsonb, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/003_fix_profile_overload_and_company_branding.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/004_fix_app_user_public_profile_unique.sql
-- ############################################################################

-- ============================================================================
-- 004_fix_app_user_public_profile_unique.sql
-- Fixes: function public.app_user_public_profile(app_users) is not unique
--
-- Cause: multiple overloads exist (1-arg + 2-arg with DEFAULT).
-- This script drops EVERY public.app_user_public_profile variant, then
-- recreates exactly ONE function.
--
-- Safe to re-run. Does not touch ledger data.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- Drop ALL overloads of app_user_public_profile in public schema
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'app_user_public_profile'
  loop
    execute 'drop function if exists ' || r.sig || ' cascade';
  end loop;
end $$;

-- Ensure branding columns exist (no-op if already added by 003)
alter table public.app_users
  add column if not exists company_name text,
  add column if not exists vat_number text,
  add column if not exists logo_url text,
  add column if not exists admin_visible_password text;

-- Single canonical profile function (ONLY this one must exist)
create or replace function public.app_user_public_profile(
  u public.app_users,
  p_include_admin_secrets boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  perms jsonb;
  result jsonb;
  settings_obj jsonb := coalesce(u.settings, '{}'::jsonb);
begin
  settings_obj := settings_obj || jsonb_build_object(
    'Company', coalesce(nullif(trim(u.company_name), ''), settings_obj->>'Company', ''),
    'TRN', coalesce(nullif(trim(u.vat_number), ''), settings_obj->>'TRN', ''),
    'logo', coalesce(nullif(trim(u.logo_url), ''), settings_obj->>'logo', ''),
    'Name', coalesce(nullif(trim(u.display_name), ''), u.username)
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'module', p.module,
    'action', p.action,
    'allowed', p.allowed
  ) order by p.module, p.action), '[]'::jsonb)
  into perms
  from public.app_permissions p
  where p.user_id = u.id;

  result := jsonb_build_object(
    'id', u.id,
    'username', u.username,
    'display_name', u.display_name,
    'role', u.role,
    'is_protected', u.is_protected,
    'is_active', u.is_active,
    'must_change_password', u.must_change_password,
    'settings', settings_obj,
    'company_name', coalesce(u.company_name, settings_obj->>'Company', ''),
    'vat_number', coalesce(u.vat_number, settings_obj->>'TRN', ''),
    'logo_url', coalesce(u.logo_url, settings_obj->>'logo', ''),
    'last_login_at', u.last_login_at,
    'created_at', u.created_at,
    'organization_id', u.organization_id,
    'permissions', perms,
    'allowed_currencies', coalesce(settings_obj->'Currency', '[]'::jsonb),
    'allowed_tabs', coalesce(settings_obj->'Tabs', '[]'::jsonb)
  );

  if coalesce(p_include_admin_secrets, false) then
    begin
      if public.is_app_admin() then
        result := result || jsonb_build_object(
          'admin_visible_password', coalesce(u.admin_visible_password, '')
        );
      end if;
    exception when others then
      -- During login there may be no session yet; skip secrets
      null;
    end;
  end if;

  return result;
end;
$$;

-- Recreate login/validate to call profile with EXPLICIT second argument
-- (avoids any residual overload ambiguity during resolution)
create or replace function public.app_login(
  p_username text,
  p_password text,
  p_user_agent text default null,
  p_ip text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  u public.app_users;
  token text;
begin
  if p_username is null or trim(p_username) = '' then
    raise exception 'Username is required';
  end if;
  if p_password is null or p_password = '' then
    raise exception 'Password is required';
  end if;

  select * into u
  from public.app_users
  where lower(username) = lower(trim(p_username))
  limit 1;

  if u is null or u.password_hash <> extensions.crypt(p_password, u.password_hash) then
    raise exception 'Invalid username or password';
  end if;
  if not u.is_active then
    raise exception 'Account is disabled';
  end if;

  token := public.app_create_session(u.id, p_user_agent, p_ip);
  update public.app_users set last_login_at = now(), updated_at = now() where id = u.id;
  u.last_login_at := now();

  return jsonb_build_object(
    'session_token', token,
    'user', public.app_user_public_profile(u, false)
  );
end;
$$;

create or replace function public.app_validate_session()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  sess public.app_sessions := public.current_app_session();
  u public.app_users;
begin
  if sess is null then
    raise exception 'Session expired or invalid';
  end if;

  update public.app_sessions
  set last_seen_at = now(),
      expires_at = greatest(expires_at, now() + interval '14 days')
  where id = sess.id;

  select * into u from public.app_users where id = sess.user_id;
  if u is null or not u.is_active then
    update public.app_sessions set revoked_at = now() where id = sess.id;
    raise exception 'Account is disabled';
  end if;

  return jsonb_build_object(
    'session_token', null,
    'user', public.app_user_public_profile(u, false)
  );
end;
$$;

create or replace function public.app_update_own_settings(p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  u public.app_users := public.current_app_user();
begin
  if u is null then raise exception 'Authentication required'; end if;
  update public.app_users set
    settings = coalesce(settings, '{}'::jsonb) || coalesce(p_settings, '{}'::jsonb),
    display_name = case
      when p_settings ? 'Name' and nullif(trim(p_settings->>'Name'), '') is not null
        then trim(p_settings->>'Name')
      else display_name
    end,
    updated_at = now()
  where id = u.id
  returning * into u;
  return public.app_user_public_profile(u, false);
end;
$$;

create or replace function public.app_admin_list_users()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  result jsonb;
begin
  perform public.app_require_admin();
  select coalesce(jsonb_agg(public.app_user_public_profile(u, true) order by u.created_at), '[]'::jsonb)
  into result
  from public.app_users u;
  return result;
end;
$$;

-- Verify only one overload remains
do $$
declare
  cnt int;
begin
  select count(*) into cnt
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'app_user_public_profile';

  if cnt <> 1 then
    raise exception 'Expected exactly 1 app_user_public_profile function, found %', cnt;
  end if;
end $$;

grant execute on function public.app_user_public_profile(public.app_users, boolean) to anon, authenticated;
grant execute on function public.app_login(text, text, text, text) to anon, authenticated;
grant execute on function public.app_validate_session() to anon, authenticated;
grant execute on function public.app_admin_list_users() to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/004_fix_app_user_public_profile_unique.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/005_fix_admin_data_visibility_and_owner_backfill.sql
-- ############################################################################

-- ============================================================================
-- 005_fix_admin_data_visibility_and_owner_backfill.sql
-- Ensures admin can always read all ledger rows, and orphan/null owner_id
-- rows are reassigned to the protected admin (nsfida).
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- Stronger access helper (role check + session user)
create or replace function public.app_owns_or_admin(p_owner_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  uid uuid;
  urole text;
begin
  uid := public.current_app_user_id();
  if uid is null then
    return false;
  end if;

  select role into urole
  from public.app_users
  where id = uid and is_active = true
  limit 1;

  if urole = 'admin' then
    return true;
  end if;

  return p_owner_id is not null and p_owner_id = uid;
end;
$$;

-- Re-backfill any null owner_id to protected admin
do $$
declare
  v_admin_id uuid;
begin
  select id into v_admin_id
  from public.app_users
  where lower(username) = 'nsfida' and is_protected = true
  limit 1;

  if v_admin_id is null then
    select id into v_admin_id
    from public.app_users
    where role = 'admin'
    order by created_at
    limit 1;
  end if;

  if v_admin_id is null then
    raise notice 'No admin user found for owner backfill';
    return;
  end if;

  update public.loan_ledger_entries set owner_id = v_admin_id where owner_id is null;

  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='loans') then
    update public.loans set owner_id = v_admin_id where owner_id is null;
    update public.loan_payments set owner_id = v_admin_id where owner_id is null;
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='installment_plans') then
    update public.installment_plans set owner_id = v_admin_id where owner_id is null;
    update public.installment_payments set owner_id = v_admin_id where owner_id is null;
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='goods_items') then
    update public.goods_items set owner_id = v_admin_id where owner_id is null;
    update public.goods_sales set owner_id = v_admin_id where owner_id is null;
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='expense_accounts') then
    update public.expense_accounts set owner_id = v_admin_id where owner_id is null;
    update public.expense_topups set owner_id = v_admin_id where owner_id is null;
    update public.expense_entries set owner_id = v_admin_id where owner_id is null;
    update public.expense_transfers set owner_id = v_admin_id where owner_id is null;
  end if;
end $$;

-- Prefer own preference rows: helper for "is this my row"
create or replace function public.app_is_own_row(p_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select p_owner_id is not null and p_owner_id = public.current_app_user_id();
$$;

grant execute on function public.app_owns_or_admin(uuid) to anon, authenticated;
grant execute on function public.app_is_own_row(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/005_fix_admin_data_visibility_and_owner_backfill.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/006_smart_pin_and_admin_password_visibility.sql
-- ############################################################################

-- ============================================================================
-- 006_smart_pin_and_admin_password_visibility.sql
-- 1) Store Smart Pin hash on app_users (DB-backed, works on every device)
-- 2) Always expose admin_visible_password from admin-only list/get RPCs
-- 3) Keep password change paths writing admin_visible_password
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ── Smart Pin column ─────────────────────────────────────────────────────────
alter table public.app_users
  add column if not exists smart_pin_hash text;

comment on column public.app_users.smart_pin_hash is
  'SHA-256 hex of Triple-M-by-NSF:secret-pin:v1:<lower(username)>:<pin>. Empty/null = disabled.';

-- Match the browser WebCrypto hash used by the app
create or replace function public.app_hash_smart_pin(p_username text, p_pin text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(
    extensions.digest(
      'Triple-M-by-NSF:secret-pin:v1:' || lower(trim(coalesce(p_username, ''))) || ':' || trim(coalesce(p_pin, '')),
      'sha256'
    ),
    'hex'
  );
$$;

-- Migrate any existing ledger SYSTEM Smart Pin rows onto app_users
update public.app_users u
set smart_pin_hash = sub.pin_hash
from (
  select distinct on (e.owner_id)
    e.owner_id,
    lower(substring(e.notes from '\[SECRET_PIN_HASH:([a-f0-9]{64})\]')) as pin_hash
  from public.loan_ledger_entries e
  where e.person_name = 'SYSTEM'
    and e.owner_id is not null
    and e.notes ~* '\[SECRET_PIN_HASH:[a-f0-9]{64}\]'
    and e.notes !~* '\[SMART_PIN_DISABLED:1\]'
  order by e.owner_id, e.created_at desc
) sub
where u.id = sub.owner_id
  and (u.smart_pin_hash is null or u.smart_pin_hash = '')
  and sub.pin_hash is not null
  and sub.pin_hash <> '';

-- ── Profile: include smart_pin_hash; admin secrets without nested is_app_admin ─
-- Admin list/get already call app_require_admin(); the nested is_app_admin() check
-- was silently swallowing secrets when session context looked odd.
create or replace function public.app_user_public_profile(
  u public.app_users,
  p_include_admin_secrets boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  perms jsonb;
  result jsonb;
  settings_obj jsonb := coalesce(u.settings, '{}'::jsonb);
begin
  settings_obj := settings_obj || jsonb_build_object(
    'Company', coalesce(nullif(trim(u.company_name), ''), settings_obj->>'Company', ''),
    'TRN', coalesce(nullif(trim(u.vat_number), ''), settings_obj->>'TRN', ''),
    'logo', coalesce(nullif(trim(u.logo_url), ''), settings_obj->>'logo', ''),
    'Name', coalesce(nullif(trim(u.display_name), ''), u.username)
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'module', p.module,
    'action', p.action,
    'allowed', p.allowed
  ) order by p.module, p.action), '[]'::jsonb)
  into perms
  from public.app_permissions p
  where p.user_id = u.id;

  result := jsonb_build_object(
    'id', u.id,
    'username', u.username,
    'display_name', u.display_name,
    'role', u.role,
    'is_protected', u.is_protected,
    'is_active', u.is_active,
    'must_change_password', u.must_change_password,
    'settings', settings_obj,
    'company_name', coalesce(u.company_name, settings_obj->>'Company', ''),
    'vat_number', coalesce(u.vat_number, settings_obj->>'TRN', ''),
    'logo_url', coalesce(u.logo_url, settings_obj->>'logo', ''),
    'last_login_at', u.last_login_at,
    'created_at', u.created_at,
    'organization_id', u.organization_id,
    'permissions', perms,
    'allowed_currencies', coalesce(settings_obj->'Currency', '[]'::jsonb),
    'allowed_tabs', coalesce(settings_obj->'Tabs', '[]'::jsonb),
    'smart_pin_hash', coalesce(u.smart_pin_hash, ''),
    'smart_pin_enabled', coalesce(u.smart_pin_hash, '') <> ''
  );

  -- Caller must be an admin-only RPC when this flag is true.
  if coalesce(p_include_admin_secrets, false) then
    result := result || jsonb_build_object(
      'admin_visible_password', coalesce(u.admin_visible_password, '')
    );
  end if;

  return result;
end;
$$;

-- Explicit admin list (belt-and-suspenders password field)
create or replace function public.app_admin_list_users()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  result jsonb;
begin
  perform public.app_require_admin();
  select coalesce(
    jsonb_agg(
      public.app_user_public_profile(u, true)
      || jsonb_build_object('admin_visible_password', coalesce(u.admin_visible_password, ''))
      order by u.created_at
    ),
    '[]'::jsonb
  )
  into result
  from public.app_users u;
  return result;
end;
$$;

create or replace function public.app_admin_get_user(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target public.app_users;
begin
  perform public.app_require_admin();
  select * into target from public.app_users where id = p_user_id;
  if target is null then
    raise exception 'User not found';
  end if;
  return public.app_user_public_profile(target, true)
    || jsonb_build_object('admin_visible_password', coalesce(target.admin_visible_password, ''));
end;
$$;

-- ── Smart Pin RPCs ───────────────────────────────────────────────────────────
create or replace function public.app_get_smart_pin_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  u public.app_users := public.current_app_user();
begin
  if u is null then
    raise exception 'Authentication required';
  end if;
  return jsonb_build_object(
    'enabled', coalesce(u.smart_pin_hash, '') <> '',
    'smart_pin_hash', coalesce(u.smart_pin_hash, '')
  );
end;
$$;

create or replace function public.app_set_smart_pin(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  u public.app_users := public.current_app_user();
  pin text := trim(coalesce(p_pin, ''));
  hash text;
begin
  if u is null then
    raise exception 'Authentication required';
  end if;
  if pin !~ '^\d{4}$' and pin !~ '^\d{6}$' then
    raise exception 'Smart Pin must be exactly 4 or 6 digits';
  end if;
  hash := public.app_hash_smart_pin(u.username, pin);
  update public.app_users
  set smart_pin_hash = hash, updated_at = now()
  where id = u.id;
  return jsonb_build_object('ok', true, 'smart_pin_hash', hash, 'enabled', true);
end;
$$;

create or replace function public.app_clear_smart_pin(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  u public.app_users := public.current_app_user();
  pin text := trim(coalesce(p_pin, ''));
begin
  if u is null then
    raise exception 'Authentication required';
  end if;
  if coalesce(u.smart_pin_hash, '') = '' then
    return jsonb_build_object('ok', true, 'smart_pin_hash', '', 'enabled', false);
  end if;
  if pin !~ '^\d{4}$' and pin !~ '^\d{6}$' then
    raise exception 'Smart Pin must be exactly 4 or 6 digits';
  end if;
  if public.app_hash_smart_pin(u.username, pin) <> u.smart_pin_hash then
    raise exception 'Smart Pin is incorrect';
  end if;
  update public.app_users
  set smart_pin_hash = null, updated_at = now()
  where id = u.id;
  return jsonb_build_object('ok', true, 'smart_pin_hash', '', 'enabled', false);
end;
$$;

-- Keep self-service password change writing the admin-visible copy
create or replace function public.app_change_password(p_old_password text, p_new_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  u public.app_users := public.current_app_user();
begin
  if u is null then raise exception 'Authentication required'; end if;
  if p_new_password is null or length(p_new_password) < 6 then
    raise exception 'New password must be at least 6 characters';
  end if;
  if u.password_hash <> extensions.crypt(p_old_password, u.password_hash) then
    raise exception 'Current password is incorrect';
  end if;
  update public.app_users set
    password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
    admin_visible_password = p_new_password,
    must_change_password = false,
    updated_at = now()
  where id = u.id;
  update public.app_sessions
  set revoked_at = now()
  where user_id = u.id
    and revoked_at is null
    and token_hash <> public.app_hash_token(public.current_session_token());
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.app_hash_smart_pin(text, text) to anon, authenticated;
grant execute on function public.app_get_smart_pin_status() to anon, authenticated;
grant execute on function public.app_set_smart_pin(text) to anon, authenticated;
grant execute on function public.app_clear_smart_pin(text) to anon, authenticated;
grant execute on function public.app_user_public_profile(public.app_users, boolean) to anon, authenticated;
grant execute on function public.app_admin_list_users() to anon, authenticated;
grant execute on function public.app_admin_get_user(uuid) to anon, authenticated;
grant execute on function public.app_change_password(text, text) to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/006_smart_pin_and_admin_password_visibility.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/007_company_contact_details.sql
-- ############################################################################

-- ============================================================================
-- 007_company_contact_details.sql
-- Adds company email, phone, and address for per-user branding on PDFs.
-- Safe to re-run. Does not touch ledger data.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

alter table public.app_users
  add column if not exists company_email text,
  add column if not exists company_phone text,
  add column if not exists company_address text;

comment on column public.app_users.company_email is 'Company contact email shown on PDFs';
comment on column public.app_users.company_phone is 'Company contact phone shown on PDFs';
comment on column public.app_users.company_address is 'Company address shown on PDFs';

-- Backfill from settings JSON if previously stored there
update public.app_users set
  company_email = coalesce(nullif(trim(company_email), ''), nullif(trim(settings->>'email'), ''), nullif(trim(settings->>'Email'), '')),
  company_phone = coalesce(nullif(trim(company_phone), ''), nullif(trim(settings->>'Mobile'), ''), nullif(trim(settings->>'Phone'), ''), nullif(trim(settings->>'phone'), '')),
  company_address = coalesce(nullif(trim(company_address), ''), nullif(trim(settings->>'Address'), ''), nullif(trim(settings->>'address'), ''))
where true;

-- Profile includes contact fields
create or replace function public.app_user_public_profile(
  u public.app_users,
  p_include_admin_secrets boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  perms jsonb;
  result jsonb;
  settings_obj jsonb := coalesce(u.settings, '{}'::jsonb);
  v_email text := coalesce(nullif(trim(u.company_email), ''), settings_obj->>'email', settings_obj->>'Email', '');
  v_phone text := coalesce(nullif(trim(u.company_phone), ''), settings_obj->>'Mobile', settings_obj->>'Phone', settings_obj->>'phone', '');
  v_address text := coalesce(nullif(trim(u.company_address), ''), settings_obj->>'Address', settings_obj->>'address', '');
begin
  settings_obj := settings_obj || jsonb_build_object(
    'Company', coalesce(nullif(trim(u.company_name), ''), settings_obj->>'Company', ''),
    'TRN', coalesce(nullif(trim(u.vat_number), ''), settings_obj->>'TRN', ''),
    'logo', coalesce(nullif(trim(u.logo_url), ''), settings_obj->>'logo', ''),
    'Name', coalesce(nullif(trim(u.display_name), ''), u.username),
    'email', v_email,
    'Email', v_email,
    'Mobile', v_phone,
    'Phone', v_phone,
    'Address', v_address,
    'address', v_address
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'module', p.module,
    'action', p.action,
    'allowed', p.allowed
  ) order by p.module, p.action), '[]'::jsonb)
  into perms
  from public.app_permissions p
  where p.user_id = u.id;

  result := jsonb_build_object(
    'id', u.id,
    'username', u.username,
    'display_name', u.display_name,
    'role', u.role,
    'is_protected', u.is_protected,
    'is_active', u.is_active,
    'must_change_password', u.must_change_password,
    'settings', settings_obj,
    'company_name', coalesce(u.company_name, settings_obj->>'Company', ''),
    'vat_number', coalesce(u.vat_number, settings_obj->>'TRN', ''),
    'logo_url', coalesce(u.logo_url, settings_obj->>'logo', ''),
    'company_email', v_email,
    'company_phone', v_phone,
    'company_address', v_address,
    'last_login_at', u.last_login_at,
    'created_at', u.created_at,
    'organization_id', u.organization_id,
    'permissions', perms,
    'allowed_currencies', coalesce(settings_obj->'Currency', '[]'::jsonb),
    'allowed_tabs', coalesce(settings_obj->'Tabs', '[]'::jsonb),
    'smart_pin_hash', coalesce(u.smart_pin_hash, ''),
    'smart_pin_enabled', coalesce(u.smart_pin_hash, '') <> ''
  );

  if coalesce(p_include_admin_secrets, false) then
    result := result || jsonb_build_object(
      'admin_visible_password', coalesce(u.admin_visible_password, '')
    );
  end if;

  return result;
end;
$$;

-- Branding setter with contact fields
drop function if exists public.app_admin_set_company_branding(uuid, text, text, text, text);
drop function if exists public.app_admin_set_company_branding(uuid, text, text, text, text, text, text, text);

create or replace function public.app_admin_set_company_branding(
  p_user_id uuid,
  p_company_name text default null,
  p_vat_number text default null,
  p_logo_url text default null,
  p_display_name text default null,
  p_company_email text default null,
  p_company_phone text default null,
  p_company_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target public.app_users;
  new_settings jsonb;
begin
  perform public.app_require_admin();
  select * into target from public.app_users where id = p_user_id;
  if target is null then raise exception 'User not found'; end if;

  new_settings := coalesce(target.settings, '{}'::jsonb);

  if p_company_name is not null then
    new_settings := new_settings || jsonb_build_object('Company', trim(p_company_name));
  end if;
  if p_vat_number is not null then
    new_settings := new_settings || jsonb_build_object('TRN', trim(p_vat_number));
  end if;
  if p_logo_url is not null then
    new_settings := new_settings || jsonb_build_object('logo', trim(p_logo_url));
  end if;
  if p_company_email is not null then
    new_settings := new_settings || jsonb_build_object('email', trim(p_company_email), 'Email', trim(p_company_email));
  end if;
  if p_company_phone is not null then
    new_settings := new_settings || jsonb_build_object('Mobile', trim(p_company_phone), 'Phone', trim(p_company_phone));
  end if;
  if p_company_address is not null then
    new_settings := new_settings || jsonb_build_object('Address', trim(p_company_address), 'address', trim(p_company_address));
  end if;
  if p_display_name is not null and trim(p_display_name) <> '' then
    new_settings := new_settings || jsonb_build_object('Name', trim(p_display_name));
  end if;

  update public.app_users set
    company_name = case when p_company_name is null then company_name else trim(p_company_name) end,
    vat_number = case when p_vat_number is null then vat_number else trim(p_vat_number) end,
    logo_url = case when p_logo_url is null then logo_url else trim(p_logo_url) end,
    company_email = case when p_company_email is null then company_email else trim(p_company_email) end,
    company_phone = case when p_company_phone is null then company_phone else trim(p_company_phone) end,
    company_address = case when p_company_address is null then company_address else trim(p_company_address) end,
    display_name = case
      when p_display_name is not null and trim(p_display_name) <> '' then trim(p_display_name)
      else display_name
    end,
    settings = new_settings,
    updated_at = now()
  where id = p_user_id
  returning * into target;

  return public.app_user_public_profile(target, true);
end;
$$;

-- Update access with contact fields
drop function if exists public.app_admin_update_user_access(uuid, text, text, text, text, boolean, boolean, jsonb, jsonb, jsonb);
drop function if exists public.app_admin_update_user_access(uuid, text, text, text, text, boolean, boolean, jsonb, jsonb, jsonb, text, text, text);
drop function if exists public.app_admin_update_user_access(uuid, text, text, text, text, boolean, boolean, jsonb, jsonb, jsonb, text, text, text, text, text, text);

create or replace function public.app_admin_update_user_access(
  p_user_id uuid,
  p_username text default null,
  p_password text default null,
  p_display_name text default null,
  p_role text default null,
  p_is_active boolean default null,
  p_must_change_password boolean default null,
  p_tabs jsonb default null,
  p_currencies jsonb default null,
  p_settings jsonb default null,
  p_company_name text default null,
  p_vat_number text default null,
  p_logo_url text default null,
  p_company_email text default null,
  p_company_phone text default null,
  p_company_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target public.app_users;
  safe_user text;
  safe_role text;
begin
  perform public.app_require_admin();
  select * into target from public.app_users where id = p_user_id;
  if target is null then raise exception 'User not found'; end if;

  if p_username is not null then
    safe_user := trim(p_username);
    if safe_user !~ '^[a-zA-Z0-9_-]+$' then
      raise exception 'Invalid username';
    end if;
    if target.is_protected and lower(target.username) = 'nsfida' and lower(safe_user) <> 'nsfida' then
      raise exception 'Protected administrator username cannot be changed';
    end if;
    if exists (select 1 from public.app_users where lower(username) = lower(safe_user) and id <> p_user_id) then
      raise exception 'Username already exists';
    end if;
    update public.app_users set username = safe_user, updated_at = now() where id = p_user_id;
  end if;

  if p_password is not null and length(trim(p_password)) > 0 then
    if length(p_password) < 6 then
      raise exception 'Password must be at least 6 characters';
    end if;
    update public.app_users set
      password_hash = extensions.crypt(p_password, extensions.gen_salt('bf')),
      admin_visible_password = p_password,
      updated_at = now()
    where id = p_user_id;
    update public.app_sessions set revoked_at = now()
    where user_id = p_user_id and revoked_at is null;
  end if;

  if p_display_name is not null then
    update public.app_users set
      display_name = coalesce(nullif(trim(p_display_name), ''), username),
      updated_at = now()
    where id = p_user_id;
  end if;

  if p_role is not null then
    safe_role := trim(p_role);
    if safe_role not in ('admin', 'user') then
      raise exception 'Invalid role';
    end if;
    if target.is_protected and safe_role <> 'admin' then
      raise exception 'Protected administrator cannot lose admin rights';
    end if;
    update public.app_users set role = safe_role, updated_at = now() where id = p_user_id;
  end if;

  if p_is_active is not null then
    if target.is_protected and not p_is_active then
      raise exception 'Protected administrator cannot be disabled';
    end if;
    update public.app_users set is_active = p_is_active, updated_at = now() where id = p_user_id;
    if not p_is_active then
      update public.app_sessions set revoked_at = now()
      where user_id = p_user_id and revoked_at is null;
    end if;
  end if;

  if p_must_change_password is not null then
    update public.app_users set must_change_password = p_must_change_password, updated_at = now()
    where id = p_user_id;
  end if;

  if p_settings is not null then
    update public.app_users set
      settings = coalesce(settings, '{}'::jsonb) || p_settings,
      updated_at = now()
    where id = p_user_id;
  end if;

  if p_currencies is not null then
    perform public.app_apply_user_currencies(p_user_id, p_currencies);
  end if;

  if p_tabs is not null then
    perform public.app_apply_tab_permissions(p_user_id, p_tabs);
  end if;

  if p_company_name is not null
     or p_vat_number is not null
     or p_logo_url is not null
     or p_display_name is not null
     or p_company_email is not null
     or p_company_phone is not null
     or p_company_address is not null then
    perform public.app_admin_set_company_branding(
      p_user_id,
      p_company_name,
      p_vat_number,
      p_logo_url,
      p_display_name,
      p_company_email,
      p_company_phone,
      p_company_address
    );
  end if;

  select * into target from public.app_users where id = p_user_id;
  if target.is_protected then
    update public.app_users set role = 'admin', is_active = true where id = p_user_id;
    perform public.app_apply_tab_permissions(
      p_user_id,
      '["dashboard","expenses","inventory","loans","installments","notes","bitcoin","reports","currency_settings","settings","admin_panel","customers","wallets","pdf_export"]'::jsonb
    );
  end if;

  select * into target from public.app_users where id = p_user_id;
  return public.app_user_public_profile(target, true);
end;
$$;

-- Create user with contact fields
drop function if exists public.app_admin_create_user(text, text, text, text, boolean, jsonb, jsonb, jsonb);
drop function if exists public.app_admin_create_user(text, text, text, text, boolean, jsonb, jsonb, jsonb, text, text, text);
drop function if exists public.app_admin_create_user(text, text, text, text, boolean, jsonb, jsonb, jsonb, text, text, text, text, text, text);

create or replace function public.app_admin_create_user(
  p_username text,
  p_password text,
  p_display_name text default null,
  p_role text default 'user',
  p_must_change_password boolean default false,
  p_settings jsonb default '{}'::jsonb,
  p_tabs jsonb default null,
  p_currencies jsonb default null,
  p_company_name text default null,
  p_vat_number text default null,
  p_logo_url text default null,
  p_company_email text default null,
  p_company_phone text default null,
  p_company_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  admin public.app_users := public.app_require_admin();
  new_user public.app_users;
  safe_user text;
  safe_role text := coalesce(nullif(trim(p_role), ''), 'user');
  org_id uuid;
  tabs jsonb;
  currencies jsonb;
  settings_obj jsonb := coalesce(p_settings, '{}'::jsonb);
  v_email text := nullif(trim(coalesce(p_company_email, '')), '');
  v_phone text := nullif(trim(coalesce(p_company_phone, '')), '');
  v_address text := nullif(trim(coalesce(p_company_address, '')), '');
begin
  safe_user := trim(p_username);
  if safe_user is null or safe_user !~ '^[a-zA-Z0-9_-]+$' then
    raise exception 'Invalid username';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;
  if safe_role not in ('admin', 'user') then
    raise exception 'Invalid role';
  end if;
  if exists (select 1 from public.app_users where lower(username) = lower(safe_user)) then
    raise exception 'Username already exists';
  end if;

  select organization_id into org_id from public.app_users where id = admin.id;

  currencies := coalesce(p_currencies, settings_obj->'Currency', '["AED"]'::jsonb);
  tabs := coalesce(
    p_tabs,
    settings_obj->'Tabs',
    '["dashboard","expenses","loans","notes"]'::jsonb
  );

  if p_company_name is not null then
    settings_obj := settings_obj || jsonb_build_object('Company', trim(p_company_name));
  end if;
  if p_vat_number is not null then
    settings_obj := settings_obj || jsonb_build_object('TRN', trim(p_vat_number));
  end if;
  if p_logo_url is not null then
    settings_obj := settings_obj || jsonb_build_object('logo', trim(p_logo_url));
  end if;
  if v_email is not null then
    settings_obj := settings_obj || jsonb_build_object('email', v_email, 'Email', v_email);
  end if;
  if v_phone is not null then
    settings_obj := settings_obj || jsonb_build_object('Mobile', v_phone, 'Phone', v_phone);
  end if;
  if v_address is not null then
    settings_obj := settings_obj || jsonb_build_object('Address', v_address, 'address', v_address);
  end if;
  settings_obj := settings_obj || jsonb_build_object('Currency', currencies, 'Tabs', tabs);

  insert into public.app_users (
    organization_id, username, password_hash, admin_visible_password, display_name,
    role, is_protected, is_active, must_change_password, settings, created_by,
    company_name, vat_number, logo_url, company_email, company_phone, company_address
  ) values (
    org_id,
    safe_user,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    p_password,
    coalesce(nullif(trim(p_display_name), ''), safe_user),
    safe_role,
    false,
    true,
    coalesce(p_must_change_password, false),
    settings_obj,
    admin.id,
    nullif(trim(coalesce(p_company_name, '')), ''),
    nullif(trim(coalesce(p_vat_number, '')), ''),
    nullif(trim(coalesce(p_logo_url, '')), ''),
    v_email,
    v_phone,
    v_address
  )
  returning * into new_user;

  perform public.app_apply_user_currencies(new_user.id, currencies);
  if safe_role = 'admin' then
    tabs := coalesce(tabs, '[]'::jsonb) || '["admin_panel","dashboard","expenses","inventory","loans","installments","notes","bitcoin","reports","currency_settings","settings"]'::jsonb;
  end if;
  perform public.app_apply_tab_permissions(new_user.id, tabs);

  select * into new_user from public.app_users where id = new_user.id;
  return public.app_user_public_profile(new_user, true);
end;
$$;

grant execute on function public.app_user_public_profile(public.app_users, boolean) to anon, authenticated;
grant execute on function public.app_admin_set_company_branding(uuid, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.app_admin_update_user_access(uuid, text, text, text, text, boolean, boolean, jsonb, jsonb, jsonb, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.app_admin_create_user(text, text, text, text, boolean, jsonb, jsonb, jsonb, text, text, text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/007_company_contact_details.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/008_strict_owner_isolation.sql
-- ############################################################################

-- ============================================================================
-- 008_strict_owner_isolation.sql
-- Admins must NOT see other users' ledger/wallet data in the app.
-- Each signed-in account only SELECTs/UPDATEs/DELETEs its own owner_id rows.
-- Admin user-management RPCs remain security definer and can still reassign data.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- Own-row only (no admin bypass on table RLS)
create or replace function public.app_owns_or_admin(p_owner_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  uid uuid;
begin
  uid := public.current_app_user_id();
  if uid is null then
    return false;
  end if;
  -- Strict isolation: even admins only access their own ledger rows via REST/RLS.
  return p_owner_id is not null and p_owner_id = uid;
end;
$$;

-- Keep helper in sync
create or replace function public.app_is_own_row(p_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select p_owner_id is not null and p_owner_id = public.current_app_user_id();
$$;

grant execute on function public.app_owns_or_admin(uuid) to anon, authenticated;
grant execute on function public.app_is_own_row(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/008_strict_owner_isolation.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/009_trial_signup_and_access_plans.sql
-- ############################################################################

-- ============================================================================
-- 009_trial_signup_and_access_plans.sql
-- Self-serve 14-day trial signup, access plans, and admin grant-full-access.
-- Safe to re-run. Does not touch ledger data.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ── Columns ──────────────────────────────────────────────────────────────────
alter table public.app_users
  add column if not exists access_plan text,
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_expires_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'app_users_access_plan_check'
  ) then
    alter table public.app_users
      add constraint app_users_access_plan_check
      check (access_plan is null or access_plan in ('full', 'trial'));
  end if;
end $$;

comment on column public.app_users.access_plan is
  'full = paid/pro access; trial = 14-day self-serve trial';
comment on column public.app_users.trial_started_at is 'When the trial started';
comment on column public.app_users.trial_expires_at is 'When trial access locks (login still works)';

-- Existing accounts become full (including protected admin)
update public.app_users
set access_plan = 'full'
where access_plan is null;

alter table public.app_users
  alter column access_plan set default 'full';

-- ── Access status helper ─────────────────────────────────────────────────────
create or replace function public.app_user_access_flags(u public.app_users)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  plan text := coalesce(nullif(trim(u.access_plan), ''), 'full');
  expired boolean := false;
  active_trial boolean := false;
  days_left numeric := null;
begin
  if plan = 'trial' then
    if u.trial_expires_at is null or u.trial_expires_at <= now() then
      expired := true;
    else
      active_trial := true;
      days_left := greatest(0, ceil(extract(epoch from (u.trial_expires_at - now())) / 86400.0));
    end if;
  end if;

  return jsonb_build_object(
    'access_plan', plan,
    'trial_started_at', u.trial_started_at,
    'trial_expires_at', u.trial_expires_at,
    'is_trial', plan = 'trial',
    'trial_active', active_trial,
    'trial_expired', expired,
    'trial_days_remaining', days_left,
    'data_access_allowed', plan = 'full' or active_trial
  );
end;
$$;

-- ── Profile includes access flags ────────────────────────────────────────────
create or replace function public.app_user_public_profile(
  u public.app_users,
  p_include_admin_secrets boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  perms jsonb;
  result jsonb;
  settings_obj jsonb := coalesce(u.settings, '{}'::jsonb);
  v_email text := coalesce(nullif(trim(u.company_email), ''), settings_obj->>'email', settings_obj->>'Email', '');
  v_phone text := coalesce(nullif(trim(u.company_phone), ''), settings_obj->>'Mobile', settings_obj->>'Phone', settings_obj->>'phone', '');
  v_address text := coalesce(nullif(trim(u.company_address), ''), settings_obj->>'Address', settings_obj->>'address', '');
  access_flags jsonb := public.app_user_access_flags(u);
begin
  settings_obj := settings_obj || jsonb_build_object(
    'Company', coalesce(nullif(trim(u.company_name), ''), settings_obj->>'Company', ''),
    'TRN', coalesce(nullif(trim(u.vat_number), ''), settings_obj->>'TRN', ''),
    'logo', coalesce(nullif(trim(u.logo_url), ''), settings_obj->>'logo', ''),
    'Name', coalesce(nullif(trim(u.display_name), ''), u.username),
    'email', v_email,
    'Email', v_email,
    'Mobile', v_phone,
    'Phone', v_phone,
    'Address', v_address,
    'address', v_address
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'module', p.module,
    'action', p.action,
    'allowed', p.allowed
  ) order by p.module, p.action), '[]'::jsonb)
  into perms
  from public.app_permissions p
  where p.user_id = u.id
    and (
      coalesce(u.access_plan, 'full') <> 'trial'
      or p.module <> 'admin_panel'
    );

  result := jsonb_build_object(
    'id', u.id,
    'username', u.username,
    'display_name', u.display_name,
    'role', u.role,
    'is_protected', u.is_protected,
    'is_active', u.is_active,
    'must_change_password', u.must_change_password,
    'settings', settings_obj,
    'company_name', coalesce(u.company_name, settings_obj->>'Company', ''),
    'vat_number', coalesce(u.vat_number, settings_obj->>'TRN', ''),
    'logo_url', coalesce(u.logo_url, settings_obj->>'logo', ''),
    'company_email', v_email,
    'company_phone', v_phone,
    'company_address', v_address,
    'last_login_at', u.last_login_at,
    'created_at', u.created_at,
    'organization_id', u.organization_id,
    'permissions', coalesce(perms, '[]'::jsonb),
    'allowed_currencies', coalesce(settings_obj->'Currency', '[]'::jsonb),
    'allowed_tabs', coalesce(settings_obj->'Tabs', '[]'::jsonb),
    'smart_pin_hash', coalesce(u.smart_pin_hash, ''),
    'smart_pin_enabled', coalesce(u.smart_pin_hash, '') <> ''
  ) || access_flags;

  if coalesce(p_include_admin_secrets, false) then
    result := result || jsonb_build_object(
      'admin_visible_password', coalesce(u.admin_visible_password, '')
    );
  end if;

  return result;
end;
$$;

-- ── Self-serve trial signup (no admin session required) ──────────────────────
create or replace function public.app_trial_signup(
  p_username text,
  p_password text,
  p_display_name text default null,
  p_company_name text default null,
  p_user_agent text default null,
  p_ip text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  new_user public.app_users;
  safe_user text;
  org_id uuid;
  token text;
  settings_obj jsonb;
  tabs jsonb := '["dashboard","expenses","inventory","loans","installments","notes","bitcoin","reports","currency_settings"]'::jsonb;
  currencies jsonb := '["AED","SAR","PKR","USD","BTC"]'::jsonb;
  started_at timestamptz := now();
  expires_at timestamptz := now() + interval '14 days';
begin
  safe_user := trim(p_username);
  if safe_user is null or safe_user !~ '^[a-zA-Z0-9_-]+$' then
    raise exception 'Invalid username. Use letters, numbers, underscores, or hyphens.';
  end if;
  if length(safe_user) < 3 then
    raise exception 'Username must be at least 3 characters';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;
  if exists (select 1 from public.app_users where lower(username) = lower(safe_user)) then
    raise exception 'Username already exists. Please choose another.';
  end if;

  -- Attach to the protected admin's organization when available
  select organization_id into org_id
  from public.app_users
  where is_protected = true
  order by created_at
  limit 1;

  if org_id is null then
    select organization_id into org_id
    from public.app_users
    where role = 'admin'
    order by created_at
    limit 1;
  end if;

  if org_id is null then
    insert into public.app_organizations (name)
    values ('Triple M')
    returning id into org_id;
  end if;

  settings_obj := jsonb_build_object(
    'Currency', currencies,
    'Tabs', tabs,
    'Company', coalesce(nullif(trim(p_company_name), ''), ''),
    'Name', coalesce(nullif(trim(p_display_name), ''), safe_user)
  );

  insert into public.app_users (
    organization_id, username, password_hash, admin_visible_password, display_name,
    role, is_protected, is_active, must_change_password, settings,
    company_name, access_plan, trial_started_at, trial_expires_at
  ) values (
    org_id,
    safe_user,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    p_password,
    coalesce(nullif(trim(p_display_name), ''), safe_user),
    'user',
    false,
    true,
    false,
    settings_obj,
    nullif(trim(coalesce(p_company_name, '')), ''),
    'trial',
    started_at,
    expires_at
  )
  returning * into new_user;

  perform public.app_apply_user_currencies(new_user.id, currencies);
  perform public.app_apply_tab_permissions(new_user.id, tabs);

  -- Hard-ensure no admin_panel for trial accounts
  update public.app_permissions
  set allowed = false
  where user_id = new_user.id and module = 'admin_panel';

  token := public.app_create_session(new_user.id, p_user_agent, p_ip);
  update public.app_users set last_login_at = now(), updated_at = now() where id = new_user.id;
  new_user.last_login_at := now();

  return jsonb_build_object(
    'session_token', token,
    'user', public.app_user_public_profile(new_user, false)
  );
end;
$$;

-- ── Admin: grant full / pro access ───────────────────────────────────────────
create or replace function public.app_admin_grant_full_access(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target public.app_users;
begin
  perform public.app_require_admin();
  select * into target from public.app_users where id = p_user_id;
  if target is null then raise exception 'User not found'; end if;

  update public.app_users set
    access_plan = 'full',
    updated_at = now()
  where id = p_user_id
  returning * into target;

  return public.app_user_public_profile(target, true);
end;
$$;

-- ── Admin: start / reset a 14-day trial on an account ─────────────────────────
create or replace function public.app_admin_start_trial(p_user_id uuid, p_days integer default 14)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target public.app_users;
  days int := greatest(1, coalesce(p_days, 14));
begin
  perform public.app_require_admin();
  select * into target from public.app_users where id = p_user_id;
  if target is null then raise exception 'User not found'; end if;
  if target.is_protected then
    raise exception 'Protected administrator cannot be set to trial';
  end if;
  if target.role = 'admin' then
    raise exception 'Admin accounts cannot be trial accounts';
  end if;

  update public.app_users set
    access_plan = 'trial',
    role = 'user',
    trial_started_at = now(),
    trial_expires_at = now() + make_interval(days => days),
    updated_at = now()
  where id = p_user_id
  returning * into target;

  update public.app_permissions
  set allowed = false
  where user_id = p_user_id and module = 'admin_panel';

  return public.app_user_public_profile(target, true);
end;
$$;

-- Extend update access to accept access_plan changes
drop function if exists public.app_admin_update_user_access(uuid, text, text, text, text, boolean, boolean, jsonb, jsonb, jsonb, text, text, text, text, text, text);
drop function if exists public.app_admin_update_user_access(uuid, text, text, text, text, boolean, boolean, jsonb, jsonb, jsonb, text, text, text, text, text, text, text);

create or replace function public.app_admin_update_user_access(
  p_user_id uuid,
  p_username text default null,
  p_password text default null,
  p_display_name text default null,
  p_role text default null,
  p_is_active boolean default null,
  p_must_change_password boolean default null,
  p_tabs jsonb default null,
  p_currencies jsonb default null,
  p_settings jsonb default null,
  p_company_name text default null,
  p_vat_number text default null,
  p_logo_url text default null,
  p_company_email text default null,
  p_company_phone text default null,
  p_company_address text default null,
  p_access_plan text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target public.app_users;
  safe_user text;
  safe_role text;
  plan text;
begin
  perform public.app_require_admin();
  select * into target from public.app_users where id = p_user_id;
  if target is null then raise exception 'User not found'; end if;

  if p_username is not null then
    safe_user := trim(p_username);
    if safe_user !~ '^[a-zA-Z0-9_-]+$' then
      raise exception 'Invalid username';
    end if;
    if target.is_protected and lower(target.username) = 'nsfida' and lower(safe_user) <> 'nsfida' then
      raise exception 'Protected administrator username cannot be changed';
    end if;
    if exists (select 1 from public.app_users where lower(username) = lower(safe_user) and id <> p_user_id) then
      raise exception 'Username already exists';
    end if;
    update public.app_users set username = safe_user, updated_at = now() where id = p_user_id;
  end if;

  if p_password is not null and length(trim(p_password)) > 0 then
    if length(p_password) < 6 then
      raise exception 'Password must be at least 6 characters';
    end if;
    update public.app_users set
      password_hash = extensions.crypt(p_password, extensions.gen_salt('bf')),
      admin_visible_password = p_password,
      updated_at = now()
    where id = p_user_id;
    update public.app_sessions set revoked_at = now()
    where user_id = p_user_id and revoked_at is null;
  end if;

  if p_display_name is not null then
    update public.app_users set
      display_name = coalesce(nullif(trim(p_display_name), ''), username),
      updated_at = now()
    where id = p_user_id;
  end if;

  if p_role is not null then
    safe_role := trim(p_role);
    if safe_role not in ('admin', 'user') then
      raise exception 'Invalid role';
    end if;
    if target.is_protected and safe_role <> 'admin' then
      raise exception 'Protected administrator cannot lose admin rights';
    end if;
    -- Trial accounts cannot be admins
    if coalesce(nullif(trim(p_access_plan), ''), target.access_plan, 'full') = 'trial' and safe_role = 'admin' then
      raise exception 'Trial accounts cannot have admin role';
    end if;
    update public.app_users set role = safe_role, updated_at = now() where id = p_user_id;
  end if;

  if p_is_active is not null then
    if target.is_protected and not p_is_active then
      raise exception 'Protected administrator cannot be disabled';
    end if;
    update public.app_users set is_active = p_is_active, updated_at = now() where id = p_user_id;
    if not p_is_active then
      update public.app_sessions set revoked_at = now()
      where user_id = p_user_id and revoked_at is null;
    end if;
  end if;

  if p_must_change_password is not null then
    update public.app_users set must_change_password = p_must_change_password, updated_at = now()
    where id = p_user_id;
  end if;

  if p_settings is not null then
    update public.app_users set
      settings = coalesce(settings, '{}'::jsonb) || p_settings,
      updated_at = now()
    where id = p_user_id;
  end if;

  if p_currencies is not null then
    perform public.app_apply_user_currencies(p_user_id, p_currencies);
  end if;

  if p_tabs is not null then
    -- Strip admin_panel from trial users
    if coalesce(nullif(trim(p_access_plan), ''), (select access_plan from public.app_users where id = p_user_id), 'full') = 'trial' then
      perform public.app_apply_tab_permissions(
        p_user_id,
        coalesce(
          (select jsonb_agg(value) from jsonb_array_elements_text(p_tabs) value where lower(value) <> 'admin_panel'),
          '[]'::jsonb
        )
      );
    else
      perform public.app_apply_tab_permissions(p_user_id, p_tabs);
    end if;
  end if;

  if p_company_name is not null
     or p_vat_number is not null
     or p_logo_url is not null
     or p_display_name is not null
     or p_company_email is not null
     or p_company_phone is not null
     or p_company_address is not null then
    perform public.app_admin_set_company_branding(
      p_user_id,
      p_company_name,
      p_vat_number,
      p_logo_url,
      p_display_name,
      p_company_email,
      p_company_phone,
      p_company_address
    );
  end if;

  if p_access_plan is not null then
    plan := lower(trim(p_access_plan));
    if plan not in ('full', 'trial') then
      raise exception 'Access plan must be full or trial';
    end if;
    if target.is_protected and plan <> 'full' then
      raise exception 'Protected administrator must remain on full access';
    end if;
    if plan = 'trial' then
      update public.app_users set
        access_plan = 'trial',
        role = 'user',
        trial_started_at = coalesce(trial_started_at, now()),
        trial_expires_at = case
          when trial_expires_at is null or trial_expires_at <= now() then now() + interval '14 days'
          else trial_expires_at
        end,
        updated_at = now()
      where id = p_user_id;
      update public.app_permissions
      set allowed = false
      where user_id = p_user_id and module = 'admin_panel';
    else
      update public.app_users set
        access_plan = 'full',
        updated_at = now()
      where id = p_user_id;
    end if;
  end if;

  select * into target from public.app_users where id = p_user_id;
  if target.is_protected then
    update public.app_users set role = 'admin', is_active = true, access_plan = 'full' where id = p_user_id;
    perform public.app_apply_tab_permissions(
      p_user_id,
      '["dashboard","expenses","inventory","loans","installments","notes","bitcoin","reports","currency_settings","settings","admin_panel","customers","wallets","pdf_export"]'::jsonb
    );
  end if;

  select * into target from public.app_users where id = p_user_id;
  return public.app_user_public_profile(target, true);
end;
$$;

grant execute on function public.app_user_access_flags(public.app_users) to anon, authenticated;
grant execute on function public.app_user_public_profile(public.app_users, boolean) to anon, authenticated;
grant execute on function public.app_trial_signup(text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.app_admin_grant_full_access(uuid) to anon, authenticated;
grant execute on function public.app_admin_start_trial(uuid, integer) to anon, authenticated;
grant execute on function public.app_admin_update_user_access(uuid, text, text, text, text, boolean, boolean, jsonb, jsonb, jsonb, text, text, text, text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/009_trial_signup_and_access_plans.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/010_trial_signup_contact_details.sql
-- ############################################################################

-- ============================================================================
-- 010_trial_signup_contact_details.sql
-- Trial signup collects email, mobile, address (required) plus optional
-- company name, TRN, and logo for PDFs. Also requires ≥1 currency choice.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

drop function if exists public.app_trial_signup(text, text, text, text, text, text);
drop function if exists public.app_trial_signup(text, text, text, text, text, text, text, text, text, text);
drop function if exists public.app_trial_signup(text, text, text, text, text, text, text, text, text, text, text);
drop function if exists public.app_trial_signup(text, text, text, text, text, text, text, text, text, jsonb, text, text);

create or replace function public.app_trial_signup(
  p_username text,
  p_password text,
  p_display_name text default null,
  p_company_name text default null,
  p_company_email text default null,
  p_company_phone text default null,
  p_company_address text default null,
  p_vat_number text default null,
  p_logo_url text default null,
  p_currencies jsonb default null,
  p_user_agent text default null,
  p_ip text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  new_user public.app_users;
  safe_user text;
  org_id uuid;
  token text;
  settings_obj jsonb;
  tabs jsonb := '["dashboard","expenses","inventory","loans","installments","notes","bitcoin","reports","currency_settings"]'::jsonb;
  currencies jsonb;
  cleaned text[] := array[]::text[];
  item jsonb;
  cur text;
  allowed text[] := array['AED','SAR','PKR','USD','BTC'];
  started_at timestamptz := now();
  expires_at timestamptz := now() + interval '14 days';
  v_email text := nullif(trim(coalesce(p_company_email, '')), '');
  v_phone text := nullif(trim(coalesce(p_company_phone, '')), '');
  v_address text := nullif(trim(coalesce(p_company_address, '')), '');
  v_company text := nullif(trim(coalesce(p_company_name, '')), '');
  v_vat text := nullif(trim(coalesce(p_vat_number, '')), '');
  v_logo text := nullif(trim(coalesce(p_logo_url, '')), '');
begin
  safe_user := trim(p_username);
  if safe_user is null or safe_user !~ '^[a-zA-Z0-9_-]+$' then
    raise exception 'Invalid username. Use letters, numbers, underscores, or hyphens.';
  end if;
  if length(safe_user) < 3 then
    raise exception 'Username must be at least 3 characters';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;
  if v_email is null or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'A valid email address is required';
  end if;
  if v_phone is null or length(v_phone) < 6 then
    raise exception 'A valid contact number is required';
  end if;
  if v_address is null or length(v_address) < 4 then
    raise exception 'Address is required for your PDFs';
  end if;

  if p_currencies is null or jsonb_typeof(p_currencies) <> 'array' then
    raise exception 'Select at least one currency';
  end if;
  for item in select * from jsonb_array_elements(p_currencies)
  loop
    cur := upper(trim(both '"' from item::text));
    if cur = any(allowed) and not (cur = any(cleaned)) then
      cleaned := array_append(cleaned, cur);
    end if;
  end loop;
  if coalesce(array_length(cleaned, 1), 0) < 1 then
    raise exception 'Select at least one currency';
  end if;
  currencies := to_jsonb(cleaned);

  if exists (select 1 from public.app_users where lower(username) = lower(safe_user)) then
    raise exception 'Username already exists. Please choose another.';
  end if;

  select organization_id into org_id
  from public.app_users
  where is_protected = true
  order by created_at
  limit 1;

  if org_id is null then
    select organization_id into org_id
    from public.app_users
    where role = 'admin'
    order by created_at
    limit 1;
  end if;

  if org_id is null then
    insert into public.app_organizations (name)
    values ('Triple M')
    returning id into org_id;
  end if;

  settings_obj := jsonb_build_object(
    'Currency', currencies,
    'Tabs', tabs,
    'Company', coalesce(v_company, ''),
    'TRN', coalesce(v_vat, ''),
    'logo', coalesce(v_logo, ''),
    'email', v_email,
    'Email', v_email,
    'Mobile', v_phone,
    'Phone', v_phone,
    'Address', v_address,
    'address', v_address,
    'Name', coalesce(nullif(trim(p_display_name), ''), safe_user)
  );

  insert into public.app_users (
    organization_id, username, password_hash, admin_visible_password, display_name,
    role, is_protected, is_active, must_change_password, settings,
    company_name, vat_number, logo_url,
    company_email, company_phone, company_address,
    access_plan, trial_started_at, trial_expires_at
  ) values (
    org_id,
    safe_user,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    p_password,
    coalesce(nullif(trim(p_display_name), ''), safe_user),
    'user',
    false,
    true,
    false,
    settings_obj,
    v_company,
    v_vat,
    v_logo,
    v_email,
    v_phone,
    v_address,
    'trial',
    started_at,
    expires_at
  )
  returning * into new_user;

  perform public.app_apply_user_currencies(new_user.id, currencies);
  perform public.app_apply_tab_permissions(new_user.id, tabs);

  update public.app_permissions
  set allowed = false
  where user_id = new_user.id and module = 'admin_panel';

  token := public.app_create_session(new_user.id, p_user_agent, p_ip);
  update public.app_users set last_login_at = now(), updated_at = now() where id = new_user.id;
  new_user.last_login_at := now();

  return jsonb_build_object(
    'session_token', token,
    'user', public.app_user_public_profile(new_user, false)
  );
end;
$$;

-- Allow newly signed-in trial users to attach a logo after signup
create or replace function public.app_update_own_company_branding(
  p_company_name text default null,
  p_vat_number text default null,
  p_logo_url text default null,
  p_company_email text default null,
  p_company_phone text default null,
  p_company_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  u public.app_users := public.current_app_user();
  new_settings jsonb;
begin
  if u is null then raise exception 'Authentication required'; end if;
  new_settings := coalesce(u.settings, '{}'::jsonb);

  if p_company_name is not null then
    new_settings := new_settings || jsonb_build_object('Company', trim(p_company_name));
  end if;
  if p_vat_number is not null then
    new_settings := new_settings || jsonb_build_object('TRN', trim(p_vat_number));
  end if;
  if p_logo_url is not null then
    new_settings := new_settings || jsonb_build_object('logo', trim(p_logo_url));
  end if;
  if p_company_email is not null then
    new_settings := new_settings || jsonb_build_object('email', trim(p_company_email), 'Email', trim(p_company_email));
  end if;
  if p_company_phone is not null then
    new_settings := new_settings || jsonb_build_object('Mobile', trim(p_company_phone), 'Phone', trim(p_company_phone));
  end if;
  if p_company_address is not null then
    new_settings := new_settings || jsonb_build_object('Address', trim(p_company_address), 'address', trim(p_company_address));
  end if;

  update public.app_users set
    company_name = case when p_company_name is null then company_name else nullif(trim(p_company_name), '') end,
    vat_number = case when p_vat_number is null then vat_number else nullif(trim(p_vat_number), '') end,
    logo_url = case when p_logo_url is null then logo_url else nullif(trim(p_logo_url), '') end,
    company_email = case when p_company_email is null then company_email else nullif(trim(p_company_email), '') end,
    company_phone = case when p_company_phone is null then company_phone else nullif(trim(p_company_phone), '') end,
    company_address = case when p_company_address is null then company_address else nullif(trim(p_company_address), '') end,
    settings = new_settings,
    updated_at = now()
  where id = u.id
  returning * into u;

  return public.app_user_public_profile(u, false);
end;
$$;

grant execute on function public.app_trial_signup(text, text, text, text, text, text, text, text, text, jsonb, text, text) to anon, authenticated;
grant execute on function public.app_update_own_company_branding(text, text, text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/010_trial_signup_contact_details.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/011_fix_admin_delete_user_reassign.sql
-- ############################################################################

-- ============================================================================
-- 011_fix_admin_delete_user_reassign.sql
-- Fixes: delete user fails with loan_ledger_entries_owner_fk because RLS blocked
-- reassignment of the deleted user's rows to the admin.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

create or replace function public.app_admin_delete_user(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target public.app_users;
  admin_id uuid;
  tbl text;
  tables text[] := array[
    'loan_ledger_entries','loans','loan_payments','installment_plans',
    'installment_payments','goods_items','goods_sales','expense_accounts',
    'expense_topups','expense_entries','expense_transfers'
  ];
begin
  perform public.app_require_admin();

  admin_id := public.current_app_user_id();
  if admin_id is null then
    raise exception 'Authentication required';
  end if;

  select * into target from public.app_users where id = p_user_id;
  if target is null then raise exception 'User not found'; end if;
  if target.is_protected then
    raise exception 'Protected administrator cannot be deleted';
  end if;
  if target.id = admin_id then
    raise exception 'Cannot delete your own account';
  end if;

  -- Critical: bypass RLS so we can reassign another user's ledger rows
  perform set_config('row_security', 'off', true);

  -- Prefer protected admin as data owner when available
  if exists (
    select 1 from public.app_users
    where id = admin_id and role = 'admin' and is_active = true
  ) then
    null; -- keep admin_id
  else
    select id into admin_id
    from public.app_users
    where is_protected = true
    order by created_at
    limit 1;
  end if;

  if admin_id is null or admin_id = p_user_id then
    raise exception 'No administrator available to receive reassigned data';
  end if;

  foreach tbl in array tables loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = tbl and column_name = 'owner_id'
    ) then
      execute format(
        'update public.%I set owner_id = $1 where owner_id = $2',
        tbl
      ) using admin_id, p_user_id;
    end if;
  end loop;

  -- Clear self-references that could block delete
  update public.app_users set created_by = null where created_by = p_user_id;

  -- Sessions / permissions cascade, but revoke explicitly first
  update public.app_sessions set revoked_at = now()
  where user_id = p_user_id and revoked_at is null;
  delete from public.app_permissions where user_id = p_user_id;
  delete from public.app_sessions where user_id = p_user_id;

  delete from public.app_users where id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'deleted_user_id', p_user_id,
    'reassigned_to', admin_id
  );
end;
$$;

grant execute on function public.app_admin_delete_user(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/011_fix_admin_delete_user_reassign.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/012_fix_admin_delete_user_cascade.sql
-- ############################################################################

-- ============================================================================
-- 012_fix_admin_delete_user_cascade.sql
-- Fixes: deleting a company/user fails with
--   loan_ledger_entries_owner_fk (and similar owner FKs)
--
-- Root cause: after strict owner isolation, reassignment UPDATEs either
-- hit 0 rows (RLS) or are undone by enforce_owner_id, so DELETE app_users
-- still sees FK references.
--
-- Fix:
-- 1) Recreate owner_id FKs as ON DELETE CASCADE
-- 2) Rewrite app_admin_delete_user to wipe that user's ledger rows first
--    (with triggers/RLS bypassed), then delete the user
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ── 1) owner_id → app_users: ON DELETE CASCADE ───────────────────────────────
do $$
declare
  r record;
  new_name text;
begin
  for r in
    select
      c.conname,
      rel.relname as table_name,
      a.attname as column_name
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    join lateral unnest(c.conkey) with ordinality as ck(attnum, ord) on true
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = ck.attnum
    where nsp.nspname = 'public'
      and c.contype = 'f'
      and c.confrelid = 'public.app_users'::regclass
      and a.attname = 'owner_id'
  loop
    new_name := r.table_name || '_owner_fk';
    execute format('alter table public.%I drop constraint %I', r.table_name, r.conname);
    begin
      execute format(
        'alter table public.%I add constraint %I foreign key (owner_id) references public.app_users(id) on delete cascade',
        r.table_name,
        new_name
      );
    exception when duplicate_object then
      -- constraint name already exists after a partial previous run
      execute format(
        'alter table public.%I add constraint %I foreign key (owner_id) references public.app_users(id) on delete cascade',
        r.table_name,
        new_name || '_' || substr(md5(random()::text), 1, 6)
      );
    end;
  end loop;
end;
$$;

-- ── 2) Delete user: wipe owned data, then remove account ─────────────────────
create or replace function public.app_admin_delete_user(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target public.app_users;
  admin_id uuid;
  tbl text;
  tables text[] := array[
    -- children / leaf tables first where possible
    'loan_payments',
    'installment_payments',
    'expense_transfers',
    'expense_entries',
    'expense_topups',
    'goods_sales',
    'loans',
    'installment_plans',
    'goods_items',
    'expense_accounts',
    'loan_ledger_entries'
  ];
  r record;
  deleted_rows bigint := 0;
  n bigint;
begin
  perform public.app_require_admin();

  admin_id := public.current_app_user_id();
  if admin_id is null then
    raise exception 'Authentication required';
  end if;

  select * into target from public.app_users where id = p_user_id;
  if target is null then raise exception 'User not found'; end if;
  if target.is_protected then
    raise exception 'Protected administrator cannot be deleted';
  end if;
  if target.id = admin_id then
    raise exception 'Cannot delete your own account';
  end if;

  -- Bypass RLS + user triggers (enforce_owner_id) during cleanup
  perform set_config('row_security', 'off', true);
  perform set_config('session_replication_role', 'replica', true);

  -- Known ledger tables
  foreach tbl in array tables loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = tbl and column_name = 'owner_id'
    ) then
      execute format('delete from public.%I where owner_id = $1', tbl)
        using p_user_id;
      get diagnostics n = row_count;
      deleted_rows := deleted_rows + coalesce(n, 0);
    end if;
  end loop;

  -- Any other public table with owner_id (future-proof)
  for r in
    select c.table_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.column_name = 'owner_id'
      and c.table_name <> all (tables)
      and exists (
        select 1 from information_schema.tables t
        where t.table_schema = 'public'
          and t.table_name = c.table_name
          and t.table_type = 'BASE TABLE'
      )
  loop
    begin
      execute format('delete from public.%I where owner_id = $1', r.table_name)
        using p_user_id;
      get diagnostics n = row_count;
      deleted_rows := deleted_rows + coalesce(n, 0);
    exception when others then
      raise notice 'Could not delete from %.%: %', r.table_name, 'owner_id', sqlerrm;
    end;
  end loop;

  -- Clear self-references that could block delete
  update public.app_users set created_by = null where created_by = p_user_id;

  update public.app_sessions set revoked_at = now()
  where user_id = p_user_id and revoked_at is null;
  delete from public.app_permissions where user_id = p_user_id;
  delete from public.app_sessions where user_id = p_user_id;

  delete from public.app_users where id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'deleted_user_id', p_user_id,
    'ledger_rows_removed', deleted_rows
  );
end;
$$;

grant execute on function public.app_admin_delete_user(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/012_fix_admin_delete_user_cascade.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/013_fix_admin_delete_user_no_replication_role.sql
-- ############################################################################

-- ============================================================================
-- 013_fix_admin_delete_user_no_replication_role.sql
-- Fixes runtime error:
--   permission denied to set parameter "session_replication_role"
--
-- Supabase does not allow non-superusers to set session_replication_role.
-- DELETE of owner rows does not need that (enforce_owner_id is INSERT/UPDATE only).
-- Relies on ON DELETE CASCADE from migration 012 when present.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

create or replace function public.app_admin_delete_user(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target public.app_users;
  admin_id uuid;
  tbl text;
  tables text[] := array[
    'loan_payments',
    'installment_payments',
    'expense_transfers',
    'expense_entries',
    'expense_topups',
    'goods_sales',
    'loans',
    'installment_plans',
    'goods_items',
    'expense_accounts',
    'loan_ledger_entries'
  ];
  r record;
  deleted_rows bigint := 0;
  n bigint;
begin
  perform public.app_require_admin();

  admin_id := public.current_app_user_id();
  if admin_id is null then
    raise exception 'Authentication required';
  end if;

  select * into target from public.app_users where id = p_user_id;
  if target is null then raise exception 'User not found'; end if;
  if target.is_protected then
    raise exception 'Protected administrator cannot be deleted';
  end if;
  if target.id = admin_id then
    raise exception 'Cannot delete your own account';
  end if;

  -- Known ledger tables (DELETE is not blocked by enforce_owner_id)
  foreach tbl in array tables loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = tbl and column_name = 'owner_id'
    ) then
      execute format('delete from public.%I where owner_id = $1', tbl)
        using p_user_id;
      get diagnostics n = row_count;
      deleted_rows := deleted_rows + coalesce(n, 0);
    end if;
  end loop;

  -- Any other public table with owner_id
  for r in
    select c.table_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.column_name = 'owner_id'
      and c.table_name <> all (tables)
      and exists (
        select 1 from information_schema.tables t
        where t.table_schema = 'public'
          and t.table_name = c.table_name
          and t.table_type = 'BASE TABLE'
      )
  loop
    begin
      execute format('delete from public.%I where owner_id = $1', r.table_name)
        using p_user_id;
      get diagnostics n = row_count;
      deleted_rows := deleted_rows + coalesce(n, 0);
    exception when others then
      raise notice 'Could not delete from %: %', r.table_name, sqlerrm;
    end;
  end loop;

  update public.app_users set created_by = null where created_by = p_user_id;

  update public.app_sessions set revoked_at = now()
  where user_id = p_user_id and revoked_at is null;
  delete from public.app_permissions where user_id = p_user_id;
  delete from public.app_sessions where user_id = p_user_id;

  -- CASCADE FKs (from 012) also clear any remaining owner_id rows
  delete from public.app_users where id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'deleted_user_id', p_user_id,
    'ledger_rows_removed', deleted_rows
  );
end;
$$;

grant execute on function public.app_admin_delete_user(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/013_fix_admin_delete_user_no_replication_role.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/014_admin_notifications_and_inquiries.sql
-- ############################################################################

-- ============================================================================
-- 014_admin_notifications_and_inquiries.sql
-- Admin bell notifications (new trial accounts) + in-app inquiries
-- users can send to admin, with full admin delete / read management.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ── Tables ───────────────────────────────────────────────────────────────────

create table if not exists public.app_inquiries (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.app_users(id) on delete cascade,
  subject text not null,
  body text not null,
  status text not null default 'open'
    check (status in ('open', 'read', 'archived')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  read_at timestamptz,
  read_by uuid references public.app_users(id) on delete set null
);

create index if not exists app_inquiries_sender_idx on public.app_inquiries(sender_id);
create index if not exists app_inquiries_status_created_idx on public.app_inquiries(status, created_at desc);
create index if not exists app_inquiries_created_idx on public.app_inquiries(created_at desc);

create table if not exists public.app_admin_notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null
    check (kind in ('trial_signup', 'inquiry', 'system')),
  title text not null,
  body text not null default '',
  related_user_id uuid references public.app_users(id) on delete set null,
  related_inquiry_id uuid references public.app_inquiries(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  read_at timestamptz,
  read_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists app_admin_notifications_unread_idx
  on public.app_admin_notifications(is_read, created_at desc);
create index if not exists app_admin_notifications_kind_idx
  on public.app_admin_notifications(kind, created_at desc);

alter table public.app_inquiries enable row level security;
alter table public.app_admin_notifications enable row level security;

-- Direct table access blocked — use RPCs only
drop policy if exists app_inquiries_deny_all on public.app_inquiries;
create policy app_inquiries_deny_all
  on public.app_inquiries for all to anon, authenticated
  using (false) with check (false);

drop policy if exists app_admin_notifications_deny_all on public.app_admin_notifications;
create policy app_admin_notifications_deny_all
  on public.app_admin_notifications for all to anon, authenticated
  using (false) with check (false);

-- ── Helpers ──────────────────────────────────────────────────────────────────

create or replace function public.app_notify_admins(
  p_kind text,
  p_title text,
  p_body text default '',
  p_related_user_id uuid default null,
  p_related_inquiry_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  nid uuid;
begin
  insert into public.app_admin_notifications (
    kind, title, body, related_user_id, related_inquiry_id, payload
  ) values (
    p_kind,
    coalesce(nullif(trim(p_title), ''), 'Notification'),
    coalesce(p_body, ''),
    p_related_user_id,
    p_related_inquiry_id,
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id into nid;
  return nid;
end;
$$;

create or replace function public.app_on_trial_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT'
     and coalesce(new.access_plan, '') = 'trial'
     and coalesce(new.role, 'user') <> 'admin' then
    perform public.app_notify_admins(
      'trial_signup',
      'New trial account',
      format(
        'User "%s"%s started a 14-day free trial.',
        coalesce(new.username, 'unknown'),
        case
          when nullif(trim(coalesce(new.display_name, '')), '') is not null
            and trim(new.display_name) <> coalesce(new.username, '')
          then format(' (%s)', trim(new.display_name))
          else ''
        end
      ),
      new.id,
      null,
      jsonb_build_object(
        'username', new.username,
        'display_name', new.display_name,
        'company_name', new.company_name,
        'company_email', new.company_email,
        'company_phone', new.company_phone,
        'trial_expires_at', new.trial_expires_at
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_app_on_trial_user_created on public.app_users;
create trigger trg_app_on_trial_user_created
  after insert on public.app_users
  for each row
  execute function public.app_on_trial_user_created();

create or replace function public.app_inquiry_public_row(i public.app_inquiries)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  sender public.app_users;
begin
  select * into sender from public.app_users where id = i.sender_id;
  return jsonb_build_object(
    'id', i.id,
    'sender_id', i.sender_id,
    'sender_username', coalesce(sender.username, ''),
    'sender_display_name', coalesce(sender.display_name, sender.username, ''),
    'sender_email', coalesce(sender.company_email, ''),
    'sender_phone', coalesce(sender.company_phone, ''),
    'sender_company', coalesce(sender.company_name, ''),
    'subject', i.subject,
    'body', i.body,
    'status', i.status,
    'admin_note', coalesce(i.admin_note, ''),
    'created_at', i.created_at,
    'updated_at', i.updated_at,
    'read_at', i.read_at
  );
end;
$$;

create or replace function public.app_notification_public_row(n public.app_admin_notifications)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', n.id,
    'kind', n.kind,
    'title', n.title,
    'body', n.body,
    'related_user_id', n.related_user_id,
    'related_inquiry_id', n.related_inquiry_id,
    'payload', coalesce(n.payload, '{}'::jsonb),
    'is_read', n.is_read,
    'read_at', n.read_at,
    'created_at', n.created_at
  );
$$;

-- ── User: submit + list own inquiries ────────────────────────────────────────

create or replace function public.app_submit_inquiry(
  p_subject text,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  u public.app_users;
  subj text := trim(coalesce(p_subject, ''));
  msg text := trim(coalesce(p_body, ''));
  row public.app_inquiries;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select * into u from public.app_users where id = uid;
  if u is null or not u.is_active then raise exception 'Authentication required'; end if;
  if char_length(subj) < 3 then raise exception 'Subject must be at least 3 characters'; end if;
  if char_length(subj) > 160 then raise exception 'Subject is too long (max 160 characters)'; end if;
  if char_length(msg) < 10 then raise exception 'Message must be at least 10 characters'; end if;
  if char_length(msg) > 4000 then raise exception 'Message is too long (max 4000 characters)'; end if;

  insert into public.app_inquiries (sender_id, subject, body, status)
  values (uid, subj, msg, 'open')
  returning * into row;

  perform public.app_notify_admins(
    'inquiry',
    'New inquiry',
    format('"%s" from %s', subj, coalesce(u.display_name, u.username)),
    uid,
    row.id,
    jsonb_build_object(
      'subject', subj,
      'username', u.username,
      'display_name', u.display_name
    )
  );

  return public.app_inquiry_public_row(row);
end;
$$;

create or replace function public.app_list_my_inquiries()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  items jsonb := '[]'::jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;

  select coalesce(jsonb_agg(public.app_inquiry_public_row(i) order by i.created_at desc), '[]'::jsonb)
  into items
  from public.app_inquiries i
  where i.sender_id = uid;

  return jsonb_build_object('items', items);
end;
$$;

create or replace function public.app_delete_my_inquiry(p_inquiry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  row public.app_inquiries;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select * into row from public.app_inquiries where id = p_inquiry_id;
  if row is null then raise exception 'Inquiry not found'; end if;
  if row.sender_id <> uid then raise exception 'You can only delete your own inquiries'; end if;
  if row.status <> 'open' then
    raise exception 'Only unanswered inquiries can be deleted. Contact admin if you need help.';
  end if;
  delete from public.app_inquiries where id = p_inquiry_id;
  return jsonb_build_object('ok', true, 'deleted_id', p_inquiry_id);
end;
$$;

-- ── Admin: inquiries ─────────────────────────────────────────────────────────

create or replace function public.app_admin_list_inquiries(
  p_status text default null,
  p_limit int default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  items jsonb := '[]'::jsonb;
  lim int := greatest(1, least(coalesce(p_limit, 100), 300));
  st text := nullif(trim(coalesce(p_status, '')), '');
begin
  perform public.app_require_admin();

  select coalesce(jsonb_agg(public.app_inquiry_public_row(i) order by i.created_at desc), '[]'::jsonb)
  into items
  from (
    select *
    from public.app_inquiries
    where st is null or status = st
    order by created_at desc
    limit lim
  ) i;

  return jsonb_build_object('items', items);
end;
$$;

create or replace function public.app_admin_set_inquiry_status(
  p_inquiry_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_id uuid := public.current_app_user_id();
  row public.app_inquiries;
  st text := lower(trim(coalesce(p_status, '')));
begin
  perform public.app_require_admin();
  if st not in ('open', 'read', 'archived') then
    raise exception 'Invalid status';
  end if;

  select * into row from public.app_inquiries where id = p_inquiry_id;
  if row is null then raise exception 'Inquiry not found'; end if;

  update public.app_inquiries
  set
    status = st,
    updated_at = now(),
    read_at = case when st = 'read' then coalesce(read_at, now()) else read_at end,
    read_by = case when st = 'read' then coalesce(read_by, admin_id) else read_by end
  where id = p_inquiry_id
  returning * into row;

  -- Mark linked notification read when inquiry is opened
  if st = 'read' then
    update public.app_admin_notifications
    set is_read = true, read_at = coalesce(read_at, now()), read_by = admin_id
    where related_inquiry_id = p_inquiry_id and is_read = false;
  end if;

  return public.app_inquiry_public_row(row);
end;
$$;

create or replace function public.app_admin_delete_inquiry(p_inquiry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.app_require_admin();
  if not exists (select 1 from public.app_inquiries where id = p_inquiry_id) then
    raise exception 'Inquiry not found';
  end if;
  delete from public.app_inquiries where id = p_inquiry_id;
  return jsonb_build_object('ok', true, 'deleted_id', p_inquiry_id);
end;
$$;

-- ── Admin: notifications ─────────────────────────────────────────────────────

create or replace function public.app_admin_list_notifications(p_limit int default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  items jsonb := '[]'::jsonb;
  lim int := greatest(1, least(coalesce(p_limit, 50), 200));
begin
  perform public.app_require_admin();

  select coalesce(jsonb_agg(public.app_notification_public_row(n) order by n.created_at desc), '[]'::jsonb)
  into items
  from (
    select *
    from public.app_admin_notifications
    order by created_at desc
    limit lim
  ) n;

  return jsonb_build_object('items', items);
end;
$$;

create or replace function public.app_admin_mark_notification_read(p_notification_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_id uuid := public.current_app_user_id();
  row public.app_admin_notifications;
begin
  perform public.app_require_admin();
  update public.app_admin_notifications
  set is_read = true, read_at = coalesce(read_at, now()), read_by = admin_id
  where id = p_notification_id
  returning * into row;
  if row is null then raise exception 'Notification not found'; end if;
  return public.app_notification_public_row(row);
end;
$$;

create or replace function public.app_admin_mark_all_notifications_read()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_id uuid := public.current_app_user_id();
  n int := 0;
begin
  perform public.app_require_admin();
  update public.app_admin_notifications
  set is_read = true, read_at = coalesce(read_at, now()), read_by = admin_id
  where is_read = false;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'marked', n);
end;
$$;

create or replace function public.app_admin_delete_notification(p_notification_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.app_require_admin();
  if not exists (select 1 from public.app_admin_notifications where id = p_notification_id) then
    raise exception 'Notification not found';
  end if;
  delete from public.app_admin_notifications where id = p_notification_id;
  return jsonb_build_object('ok', true, 'deleted_id', p_notification_id);
end;
$$;

create or replace function public.app_admin_unread_counts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  notif_count int := 0;
  inquiry_count int := 0;
begin
  perform public.app_require_admin();
  select count(*)::int into notif_count
  from public.app_admin_notifications where is_read = false;
  select count(*)::int into inquiry_count
  from public.app_inquiries where status = 'open';
  return jsonb_build_object(
    'notifications', notif_count,
    'inquiries', inquiry_count,
    'total', notif_count + inquiry_count
  );
end;
$$;

-- Grants (app_notify_admins stays internal — called only by other security definer routines)
revoke all on function public.app_notify_admins(text, text, text, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.app_submit_inquiry(text, text) to anon, authenticated;
grant execute on function public.app_list_my_inquiries() to anon, authenticated;
grant execute on function public.app_delete_my_inquiry(uuid) to anon, authenticated;
grant execute on function public.app_admin_list_inquiries(text, int) to anon, authenticated;
grant execute on function public.app_admin_set_inquiry_status(uuid, text) to anon, authenticated;
grant execute on function public.app_admin_delete_inquiry(uuid) to anon, authenticated;
grant execute on function public.app_admin_list_notifications(int) to anon, authenticated;
grant execute on function public.app_admin_mark_notification_read(uuid) to anon, authenticated;
grant execute on function public.app_admin_mark_all_notifications_read() to anon, authenticated;
grant execute on function public.app_admin_delete_notification(uuid) to anon, authenticated;
grant execute on function public.app_admin_unread_counts() to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/014_admin_notifications_and_inquiries.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/015_inquiry_conversations_and_public_request.sql
-- ############################################################################

-- ============================================================================
-- 015_inquiry_conversations_and_public_request.sql
-- 1) Public "Request Access" → admin Messages inbox
-- 2) Threaded replies between users and admin
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ── Extend inquiries for guests + conversation metadata ──────────────────────
alter table public.app_inquiries
  alter column sender_id drop not null;

alter table public.app_inquiries
  add column if not exists guest_name text,
  add column if not exists guest_email text,
  add column if not exists guest_phone text,
  add column if not exists source text not null default 'app',
  add column if not exists last_message_at timestamptz,
  add column if not exists user_last_read_at timestamptz,
  add column if not exists admin_last_read_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'app_inquiries_source_check'
  ) then
    alter table public.app_inquiries
      add constraint app_inquiries_source_check
      check (source in ('app', 'landing'));
  end if;
end;
$$;

update public.app_inquiries
set last_message_at = coalesce(last_message_at, updated_at, created_at)
where last_message_at is null;

-- ── Messages / conversation thread ───────────────────────────────────────────
create table if not exists public.app_inquiry_messages (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.app_inquiries(id) on delete cascade,
  sender_role text not null
    check (sender_role in ('user', 'admin', 'guest')),
  sender_id uuid references public.app_users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists app_inquiry_messages_inquiry_idx
  on public.app_inquiry_messages(inquiry_id, created_at);

alter table public.app_inquiry_messages enable row level security;

drop policy if exists app_inquiry_messages_deny_all on public.app_inquiry_messages;
create policy app_inquiry_messages_deny_all
  on public.app_inquiry_messages for all to anon, authenticated
  using (false) with check (false);

-- Backfill first message from legacy body
insert into public.app_inquiry_messages (inquiry_id, sender_role, sender_id, body, created_at)
select
  i.id,
  case
    when i.sender_id is null then 'guest'
    else 'user'
  end,
  i.sender_id,
  i.body,
  i.created_at
from public.app_inquiries i
where not exists (
  select 1 from public.app_inquiry_messages m where m.inquiry_id = i.id
)
and coalesce(nullif(trim(i.body), ''), '') <> '';

-- ── Row serializers ──────────────────────────────────────────────────────────

create or replace function public.app_message_public_row(m public.app_inquiry_messages)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  sender public.app_users;
  label text;
begin
  if m.sender_id is not null then
    select * into sender from public.app_users where id = m.sender_id;
  end if;
  label := case m.sender_role
    when 'admin' then coalesce(sender.display_name, sender.username, 'Administrator')
    when 'guest' then 'Guest'
    else coalesce(sender.display_name, sender.username, 'User')
  end;
  return jsonb_build_object(
    'id', m.id,
    'inquiry_id', m.inquiry_id,
    'sender_role', m.sender_role,
    'sender_id', m.sender_id,
    'sender_label', label,
    'body', m.body,
    'created_at', m.created_at
  );
end;
$$;

create or replace function public.app_inquiry_public_row(i public.app_inquiries)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  sender public.app_users;
  msg_count int := 0;
  last_preview text := '';
  last_role text := null;
  unread_admin int := 0;
  unread_user int := 0;
begin
  if i.sender_id is not null then
    select * into sender from public.app_users where id = i.sender_id;
  end if;

  select count(*)::int into msg_count
  from public.app_inquiry_messages m where m.inquiry_id = i.id;

  select m.body, m.sender_role
  into last_preview, last_role
  from public.app_inquiry_messages m
  where m.inquiry_id = i.id
  order by m.created_at desc
  limit 1;

  if last_preview is null then
    last_preview := i.body;
  end if;

  select count(*)::int into unread_admin
  from public.app_inquiry_messages m
  where m.inquiry_id = i.id
    and m.sender_role in ('user', 'guest')
    and (i.admin_last_read_at is null or m.created_at > i.admin_last_read_at);

  select count(*)::int into unread_user
  from public.app_inquiry_messages m
  where m.inquiry_id = i.id
    and m.sender_role = 'admin'
    and (i.user_last_read_at is null or m.created_at > i.user_last_read_at);

  return jsonb_build_object(
    'id', i.id,
    'sender_id', i.sender_id,
    'sender_username', coalesce(sender.username, ''),
    'sender_display_name', coalesce(
      nullif(trim(coalesce(i.guest_name, '')), ''),
      sender.display_name,
      sender.username,
      'Guest'
    ),
    'sender_email', coalesce(
      nullif(trim(coalesce(i.guest_email, '')), ''),
      sender.company_email,
      ''
    ),
    'sender_phone', coalesce(
      nullif(trim(coalesce(i.guest_phone, '')), ''),
      sender.company_phone,
      ''
    ),
    'sender_company', coalesce(sender.company_name, ''),
    'guest_name', coalesce(i.guest_name, ''),
    'guest_email', coalesce(i.guest_email, ''),
    'guest_phone', coalesce(i.guest_phone, ''),
    'source', coalesce(i.source, 'app'),
    'subject', i.subject,
    'body', i.body,
    'status', i.status,
    'admin_note', coalesce(i.admin_note, ''),
    'message_count', msg_count,
    'last_message_preview', left(coalesce(last_preview, ''), 180),
    'last_message_role', last_role,
    'last_message_at', coalesce(i.last_message_at, i.updated_at, i.created_at),
    'unread_for_admin', unread_admin,
    'unread_for_user', unread_user,
    'created_at', i.created_at,
    'updated_at', i.updated_at,
    'read_at', i.read_at
  );
end;
$$;

-- ── Public Request Access (landing page, no login) ───────────────────────────

create or replace function public.app_public_request_access(
  p_name text,
  p_mobile text,
  p_email text,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_mobile text := trim(coalesce(p_mobile, ''));
  v_email text := lower(trim(coalesce(p_email, '')));
  v_msg text := trim(coalesce(p_message, ''));
  row public.app_inquiries;
  first_msg public.app_inquiry_messages;
begin
  if char_length(v_name) < 2 then raise exception 'Please enter your full name'; end if;
  if char_length(v_mobile) < 6 then raise exception 'Please enter a valid mobile / WhatsApp number'; end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'Please enter a valid email address'; end if;
  if char_length(v_msg) < 10 then raise exception 'Message must be at least 10 characters'; end if;
  if char_length(v_msg) > 4000 then raise exception 'Message is too long'; end if;

  insert into public.app_inquiries (
    sender_id, subject, body, status, source,
    guest_name, guest_email, guest_phone,
    last_message_at
  ) values (
    null,
    'Request Access',
    v_msg,
    'open',
    'landing',
    v_name,
    v_email,
    v_mobile,
    now()
  )
  returning * into row;

  insert into public.app_inquiry_messages (inquiry_id, sender_role, sender_id, body)
  values (row.id, 'guest', null, v_msg)
  returning * into first_msg;

  perform public.app_notify_admins(
    'inquiry',
    'New access request',
    format('%s (%s) requested access', v_name, v_email),
    null,
    row.id,
    jsonb_build_object(
      'source', 'landing',
      'guest_name', v_name,
      'guest_email', v_email,
      'guest_phone', v_mobile
    )
  );

  return jsonb_build_object(
    'ok', true,
    'inquiry_id', row.id,
    'message', 'Your request was sent to the administrator.'
  );
end;
$$;

-- ── Authenticated submit (creates thread + first message) ────────────────────

create or replace function public.app_submit_inquiry(
  p_subject text,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  u public.app_users;
  subj text := trim(coalesce(p_subject, ''));
  msg text := trim(coalesce(p_body, ''));
  row public.app_inquiries;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select * into u from public.app_users where id = uid;
  if u is null or not u.is_active then raise exception 'Authentication required'; end if;
  if char_length(subj) < 3 then raise exception 'Subject must be at least 3 characters'; end if;
  if char_length(subj) > 160 then raise exception 'Subject is too long (max 160 characters)'; end if;
  if char_length(msg) < 10 then raise exception 'Message must be at least 10 characters'; end if;
  if char_length(msg) > 4000 then raise exception 'Message is too long (max 4000 characters)'; end if;

  insert into public.app_inquiries (
    sender_id, subject, body, status, source,
    guest_name, guest_email, guest_phone,
    last_message_at, user_last_read_at
  ) values (
    uid, subj, msg, 'open', 'app',
    coalesce(u.display_name, u.username),
    u.company_email,
    u.company_phone,
    now(),
    now()
  )
  returning * into row;

  insert into public.app_inquiry_messages (inquiry_id, sender_role, sender_id, body)
  values (row.id, 'user', uid, msg);

  perform public.app_notify_admins(
    'inquiry',
    'New inquiry',
    format('"%s" from %s', subj, coalesce(u.display_name, u.username)),
    uid,
    row.id,
    jsonb_build_object(
      'subject', subj,
      'username', u.username,
      'display_name', u.display_name,
      'source', 'app'
    )
  );

  return public.app_inquiry_public_row(row);
end;
$$;

-- ── List / thread / reply ────────────────────────────────────────────────────

create or replace function public.app_list_my_inquiries()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  items jsonb := '[]'::jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;

  select coalesce(
    jsonb_agg(public.app_inquiry_public_row(i) order by coalesce(i.last_message_at, i.created_at) desc),
    '[]'::jsonb
  )
  into items
  from public.app_inquiries i
  where i.sender_id = uid;

  return jsonb_build_object('items', items);
end;
$$;

create or replace function public.app_admin_list_inquiries(
  p_status text default null,
  p_limit int default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  items jsonb := '[]'::jsonb;
  lim int := greatest(1, least(coalesce(p_limit, 100), 300));
  st text := nullif(trim(coalesce(p_status, '')), '');
begin
  perform public.app_require_admin();

  select coalesce(
    jsonb_agg(public.app_inquiry_public_row(i) order by coalesce(i.last_message_at, i.created_at) desc),
    '[]'::jsonb
  )
  into items
  from (
    select *
    from public.app_inquiries
    where st is null or status = st
    order by coalesce(last_message_at, created_at) desc
    limit lim
  ) i;

  return jsonb_build_object('items', items);
end;
$$;

create or replace function public.app_get_inquiry_thread(p_inquiry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  u public.app_users;
  row public.app_inquiries;
  msgs jsonb := '[]'::jsonb;
  is_admin boolean := false;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select * into u from public.app_users where id = uid;
  if u is null then raise exception 'Authentication required'; end if;
  is_admin := (u.role = 'admin' and u.is_active);

  select * into row from public.app_inquiries where id = p_inquiry_id;
  if row is null then raise exception 'Conversation not found'; end if;

  if not is_admin and row.sender_id is distinct from uid then
    raise exception 'Access denied';
  end if;

  -- Mark read for this side
  if is_admin then
    update public.app_inquiries
    set
      admin_last_read_at = now(),
      status = case when status = 'open' then 'read' else status end,
      read_at = coalesce(read_at, now()),
      read_by = coalesce(read_by, uid),
      updated_at = now()
    where id = p_inquiry_id
    returning * into row;

    update public.app_admin_notifications
    set is_read = true, read_at = coalesce(read_at, now()), read_by = uid
    where related_inquiry_id = p_inquiry_id and is_read = false;
  else
    update public.app_inquiries
    set user_last_read_at = now(), updated_at = now()
    where id = p_inquiry_id
    returning * into row;
  end if;

  select coalesce(
    jsonb_agg(public.app_message_public_row(m) order by m.created_at asc),
    '[]'::jsonb
  )
  into msgs
  from public.app_inquiry_messages m
  where m.inquiry_id = p_inquiry_id;

  return jsonb_build_object(
    'inquiry', public.app_inquiry_public_row(row),
    'messages', msgs,
    'can_reply', (
      is_admin
      or (row.sender_id = uid and row.source = 'app' and row.status <> 'archived')
    )
  );
end;
$$;

create or replace function public.app_reply_inquiry(
  p_inquiry_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  u public.app_users;
  row public.app_inquiries;
  msg text := trim(coalesce(p_body, ''));
  new_msg public.app_inquiry_messages;
  role text;
  is_admin boolean := false;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select * into u from public.app_users where id = uid;
  if u is null or not u.is_active then raise exception 'Authentication required'; end if;
  is_admin := (u.role = 'admin');

  if char_length(msg) < 1 then raise exception 'Please write a reply'; end if;
  if char_length(msg) > 4000 then raise exception 'Reply is too long'; end if;

  select * into row from public.app_inquiries where id = p_inquiry_id;
  if row is null then raise exception 'Conversation not found'; end if;

  if is_admin then
    role := 'admin';
  elsif row.sender_id = uid and row.source = 'app' then
    role := 'user';
  else
    raise exception 'You cannot reply to this conversation';
  end if;

  if row.status = 'archived' and not is_admin then
    raise exception 'This conversation is closed';
  end if;

  -- Landing guests have no account — only admin can continue those threads
  if row.sender_id is null and not is_admin then
    raise exception 'Access denied';
  end if;

  insert into public.app_inquiry_messages (inquiry_id, sender_role, sender_id, body)
  values (p_inquiry_id, role, uid, msg)
  returning * into new_msg;

  update public.app_inquiries
  set
    last_message_at = now(),
    updated_at = now(),
    status = case
      when is_admin and status = 'archived' then status
      when is_admin then 'read'
      else 'open'
    end,
    admin_last_read_at = case when is_admin then now() else admin_last_read_at end,
    user_last_read_at = case when not is_admin then now() else user_last_read_at end,
    body = case when role in ('user', 'guest') then msg else body end
  where id = p_inquiry_id
  returning * into row;

  if is_admin then
    -- optional: could notify user later; unread_for_user covers in-app badge
    null;
  else
    perform public.app_notify_admins(
      'inquiry',
      'New reply',
      format('Reply on "%s" from %s', row.subject, coalesce(u.display_name, u.username)),
      uid,
      row.id,
      jsonb_build_object('subject', row.subject, 'reply', true)
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'message', public.app_message_public_row(new_msg),
    'inquiry', public.app_inquiry_public_row(row)
  );
end;
$$;

-- Allow users to delete only if admin never replied
create or replace function public.app_delete_my_inquiry(p_inquiry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  row public.app_inquiries;
  admin_replies int := 0;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select * into row from public.app_inquiries where id = p_inquiry_id;
  if row is null then raise exception 'Inquiry not found'; end if;
  if row.sender_id is distinct from uid then
    raise exception 'You can only delete your own conversations';
  end if;

  select count(*)::int into admin_replies
  from public.app_inquiry_messages
  where inquiry_id = p_inquiry_id and sender_role = 'admin';

  if admin_replies > 0 then
    raise exception 'This conversation has admin replies and cannot be deleted.';
  end if;

  delete from public.app_inquiries where id = p_inquiry_id;
  return jsonb_build_object('ok', true, 'deleted_id', p_inquiry_id);
end;
$$;

create or replace function public.app_admin_unread_counts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  notif_count int := 0;
  inquiry_count int := 0;
begin
  perform public.app_require_admin();
  select count(*)::int into notif_count
  from public.app_admin_notifications where is_read = false;

  select count(*)::int into inquiry_count
  from public.app_inquiries i
  where exists (
    select 1 from public.app_inquiry_messages m
    where m.inquiry_id = i.id
      and m.sender_role in ('user', 'guest')
      and (i.admin_last_read_at is null or m.created_at > i.admin_last_read_at)
  )
  or i.status = 'open';

  return jsonb_build_object(
    'notifications', notif_count,
    'inquiries', inquiry_count,
    'total', notif_count + inquiry_count
  );
end;
$$;

grant execute on function public.app_public_request_access(text, text, text, text) to anon, authenticated;
grant execute on function public.app_get_inquiry_thread(uuid) to anon, authenticated;
grant execute on function public.app_reply_inquiry(uuid, text) to anon, authenticated;
grant execute on function public.app_submit_inquiry(text, text) to anon, authenticated;
grant execute on function public.app_list_my_inquiries() to anon, authenticated;
grant execute on function public.app_delete_my_inquiry(uuid) to anon, authenticated;
grant execute on function public.app_admin_list_inquiries(text, int) to anon, authenticated;
grant execute on function public.app_admin_unread_counts() to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/015_inquiry_conversations_and_public_request.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/016_admin_start_conversation.sql
-- ############################################################################

-- ============================================================================
-- 016_admin_start_conversation.sql
-- Lets administrators open a new Messages thread with an existing user.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

create or replace function public.app_admin_start_conversation(
  p_user_id uuid,
  p_subject text,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_id uuid := public.current_app_user_id();
  admin_u public.app_users;
  target public.app_users;
  subj text := trim(coalesce(p_subject, ''));
  msg text := trim(coalesce(p_body, ''));
  row public.app_inquiries;
begin
  perform public.app_require_admin();

  if admin_id is null then
    raise exception 'Authentication required';
  end if;

  select * into admin_u from public.app_users where id = admin_id;
  if admin_u is null then
    raise exception 'Authentication required';
  end if;

  if p_user_id is null then
    raise exception 'Please select a user';
  end if;

  if p_user_id = admin_id then
    raise exception 'Choose another account — you cannot message yourself';
  end if;

  select * into target from public.app_users where id = p_user_id;
  if target is null then
    raise exception 'User not found';
  end if;
  if not target.is_active then
    raise exception 'That user account is disabled';
  end if;

  if char_length(subj) < 3 then
    raise exception 'Subject must be at least 3 characters';
  end if;
  if char_length(subj) > 160 then
    raise exception 'Subject is too long (max 160 characters)';
  end if;
  if char_length(msg) < 1 then
    raise exception 'Please write a message';
  end if;
  if char_length(msg) > 4000 then
    raise exception 'Message is too long (max 4000 characters)';
  end if;

  -- Thread belongs to the target user so it appears in their Messages inbox
  insert into public.app_inquiries (
    sender_id, subject, body, status, source,
    guest_name, guest_email, guest_phone,
    last_message_at, admin_last_read_at, user_last_read_at
  ) values (
    target.id,
    subj,
    msg,
    'open',
    'app',
    coalesce(target.display_name, target.username),
    target.company_email,
    target.company_phone,
    now(),
    now(),
    null
  )
  returning * into row;

  insert into public.app_inquiry_messages (
    inquiry_id, sender_role, sender_id, body
  ) values (
    row.id, 'admin', admin_id, msg
  );

  return public.app_inquiry_public_row(row);
end;
$$;

grant execute on function public.app_admin_start_conversation(uuid, text, text)
  to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/016_admin_start_conversation.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/017_fix_tab_permission_enforcement.sql
-- ############################################################################

-- ============================================================================
-- 017_fix_tab_permission_enforcement.sql
-- Ensures admin-selected tabs are applied exactly (no silent “all tabs”
-- expansion for normal admin/user accounts). Protected admin still keeps full access.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- Exact tab → permission sync (selected modules on, all others off)
create or replace function public.app_apply_tab_permissions(p_user_id uuid, p_tabs jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  tabs text[] := array[]::text[];
  item text;
  v_mod text;
  v_act text;
  enabled boolean;
  tab_modules text[] := array[
    'dashboard','expenses','wallets','inventory','customers','loans',
    'installments','notes','bitcoin','reports','pdf_export',
    'currency_settings','settings','admin_panel'
  ];
  actions text[] := array['view','create','edit','delete','export','import'];
begin
  if p_tabs is null then
    p_tabs := '[]'::jsonb;
  end if;

  if jsonb_typeof(p_tabs) = 'array' then
    for item in select jsonb_array_elements_text(p_tabs)
    loop
      tabs := array_append(tabs, lower(trim(item)));
    end loop;
  end if;

  -- Normalize aliases
  tabs := array(
    select distinct case
      when t in ('goods','inventory') then 'inventory'
      when t in ('expense','expenses','wallets') then 'expenses'
      when t in ('loan','loans') then 'loans'
      when t in ('installment','installments') then 'installments'
      when t in ('note','notes') then 'notes'
      when t in ('btc','bitcoin') then 'bitcoin'
      when t in ('report','reports','pdf','pdf_export') then 'reports'
      when t in ('currency','currency_settings') then 'currency_settings'
      when t in ('setting','settings') then 'settings'
      when t in ('admin','admin_panel') then 'admin_panel'
      when t in ('dashboard','overview') then 'dashboard'
      when t in ('customers','customer') then 'customers'
      else t
    end
    from unnest(tabs) as t
    where nullif(trim(t), '') is not null
  );

  -- Companion modules
  if 'expenses' = any(tabs) then
    tabs := array_append(tabs, 'wallets');
  end if;
  if 'inventory' = any(tabs) then
    tabs := array_append(tabs, 'customers');
  end if;
  if 'reports' = any(tabs) then
    tabs := array_append(tabs, 'pdf_export');
  end if;
  if 'currency_settings' = any(tabs) then
    tabs := array_append(tabs, 'settings');
  end if;

  -- Deduplicate after companion appends
  tabs := array(select distinct unnest(tabs));

  foreach v_mod in array tab_modules loop
    enabled := v_mod = any(tabs);
    -- Protected administrator always retains admin_panel
    if exists (
      select 1 from public.app_users
      where id = p_user_id and is_protected = true
    ) and v_mod = 'admin_panel' then
      enabled := true;
    end if;
    foreach v_act in array actions loop
      insert into public.app_permissions (user_id, module, action, allowed)
      values (p_user_id, v_mod, v_act, enabled)
      on conflict (user_id, module, action) do update
        set allowed = excluded.allowed;
    end loop;
  end loop;

  update public.app_users
  set
    settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(
      'Tabs', to_jsonb(array(select distinct unnest(tabs)))
    ),
    updated_at = now()
  where id = p_user_id;
end;
$$;

-- Create user: respect selected tabs; admin role only adds admin_panel (not every module)
create or replace function public.app_admin_create_user(
  p_username text,
  p_password text,
  p_display_name text default null,
  p_role text default 'user',
  p_must_change_password boolean default false,
  p_settings jsonb default '{}'::jsonb,
  p_tabs jsonb default null,
  p_currencies jsonb default null,
  p_company_name text default null,
  p_vat_number text default null,
  p_logo_url text default null,
  p_company_email text default null,
  p_company_phone text default null,
  p_company_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  admin public.app_users := public.app_require_admin();
  new_user public.app_users;
  safe_user text;
  safe_role text := coalesce(nullif(trim(p_role), ''), 'user');
  org_id uuid;
  tabs jsonb;
  currencies jsonb;
  settings_obj jsonb := coalesce(p_settings, '{}'::jsonb);
  v_email text := nullif(trim(coalesce(p_company_email, '')), '');
  v_phone text := nullif(trim(coalesce(p_company_phone, '')), '');
  v_address text := nullif(trim(coalesce(p_company_address, '')), '');
begin
  safe_user := trim(p_username);
  if safe_user is null or safe_user !~ '^[a-zA-Z0-9_-]+$' then
    raise exception 'Invalid username';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;
  if safe_role not in ('admin', 'user') then
    raise exception 'Invalid role';
  end if;
  if exists (select 1 from public.app_users where lower(username) = lower(safe_user)) then
    raise exception 'Username already exists';
  end if;

  select organization_id into org_id from public.app_users where id = admin.id;

  currencies := coalesce(p_currencies, settings_obj->'Currency', '["AED"]'::jsonb);
  tabs := coalesce(
    p_tabs,
    settings_obj->'Tabs',
    '["dashboard","expenses","loans","notes"]'::jsonb
  );

  if jsonb_typeof(tabs) <> 'array' or jsonb_array_length(tabs) = 0 then
    raise exception 'Select at least one tab';
  end if;

  if p_company_name is not null then
    settings_obj := settings_obj || jsonb_build_object('Company', trim(p_company_name));
  end if;
  if p_vat_number is not null then
    settings_obj := settings_obj || jsonb_build_object('TRN', trim(p_vat_number));
  end if;
  if p_logo_url is not null then
    settings_obj := settings_obj || jsonb_build_object('logo', trim(p_logo_url));
  end if;
  if v_email is not null then
    settings_obj := settings_obj || jsonb_build_object('email', v_email, 'Email', v_email);
  end if;
  if v_phone is not null then
    settings_obj := settings_obj || jsonb_build_object('Mobile', v_phone, 'Phone', v_phone);
  end if;
  if v_address is not null then
    settings_obj := settings_obj || jsonb_build_object('Address', v_address, 'address', v_address);
  end if;
  settings_obj := settings_obj || jsonb_build_object('Currency', currencies, 'Tabs', tabs);

  insert into public.app_users (
    organization_id, username, password_hash, admin_visible_password, display_name,
    role, is_protected, is_active, must_change_password, settings, created_by,
    company_name, vat_number, logo_url, company_email, company_phone, company_address
  ) values (
    org_id,
    safe_user,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    p_password,
    coalesce(nullif(trim(p_display_name), ''), safe_user),
    safe_role,
    false,
    true,
    coalesce(p_must_change_password, false),
    settings_obj,
    admin.id,
    nullif(trim(coalesce(p_company_name, '')), ''),
    nullif(trim(coalesce(p_vat_number, '')), ''),
    nullif(trim(coalesce(p_logo_url, '')), ''),
    v_email,
    v_phone,
    v_address
  )
  returning * into new_user;

  perform public.app_apply_user_currencies(new_user.id, currencies);

  -- Admin role needs admin_panel; do NOT auto-grant every module
  if safe_role = 'admin' then
    tabs := coalesce(tabs, '[]'::jsonb) || '["admin_panel"]'::jsonb;
  end if;

  perform public.app_apply_tab_permissions(new_user.id, tabs);

  select * into new_user from public.app_users where id = new_user.id;
  return public.app_user_public_profile(new_user, true);
end;
$$;

grant execute on function public.app_apply_tab_permissions(uuid, jsonb) to anon, authenticated;
grant execute on function public.app_admin_create_user(text, text, text, text, boolean, jsonb, jsonb, jsonb, text, text, text, text, text, text) to anon, authenticated;

-- Re-sync existing accounts from their stored Tabs list (repairs drifted permissions)
do $$
declare
  r record;
begin
  for r in
    select id, coalesce(settings->'Tabs', '[]'::jsonb) as tabs
    from public.app_users
  loop
    if jsonb_typeof(r.tabs) = 'array' and jsonb_array_length(r.tabs) > 0 then
      perform public.app_apply_tab_permissions(r.id, r.tabs);
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/017_fix_tab_permission_enforcement.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/018_admin_raw_user_ledger.sql
-- ############################################################################

-- ============================================================================
-- 018_admin_raw_user_ledger.sql
-- Admin-only Raw Data: list / update / delete any user's loan_ledger_entries
-- via security definer RPCs (does not change normal user RLS isolation).
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

create or replace function public.app_admin_classify_ledger_entry(
  p_direction text,
  p_person_name text,
  p_notes text
)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_notes, '') ilike '%[EXPENSE_ACCOUNT]%' then 'expenses'
    when coalesce(p_notes, '') ilike '%[GOODS]%'
      or coalesce(p_direction, '') = 'goods' then 'inventory'
    when coalesce(p_notes, '') ilike '%[INSTALLMENT]%' then 'installments'
    when coalesce(p_person_name, '') = 'SYSTEM'
      and (
        coalesce(p_notes, '') ilike '%BITCOIN_WALLET%'
        or coalesce(p_notes, '') ilike '%"rowType":"BITCOIN_WALLET"%'
      ) then 'bitcoin'
    when coalesce(p_person_name, '') = 'SYSTEM'
      and (
        coalesce(p_notes, '') ilike '%"rowType":"NOTE"%'
        or coalesce(p_notes, '') ilike '%"NOTE"%'
      ) then 'notes'
    when coalesce(p_person_name, '') = 'SYSTEM' then 'system'
    when coalesce(p_direction, '') in ('given', 'taken') then 'loans'
    else 'other'
  end;
$$;

create or replace function public.app_admin_ledger_entry_row(e public.loan_ledger_entries)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', e.id,
    'group_id', e.group_id,
    'owner_id', e.owner_id,
    'direction', e.direction,
    'entry_kind', e.entry_kind,
    'person_name', e.person_name,
    'currency', e.currency,
    'principal_amount', e.principal_amount,
    'action_amount', e.action_amount,
    'loan_date', e.loan_date,
    'action_date', e.action_date,
    'notes', e.notes,
    'created_at', e.created_at,
    'updated_at', e.updated_at,
    'section', public.app_admin_classify_ledger_entry(e.direction, e.person_name, e.notes),
    'is_deleted', coalesce(e.notes, '') ilike '%[DELETED]%'
  );
$$;

create or replace function public.app_admin_list_user_ledger(
  p_user_id uuid,
  p_section text default null,
  p_search text default null,
  p_limit int default 200,
  p_offset int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.app_users;
  lim int := greatest(1, least(coalesce(p_limit, 200), 500));
  off int := greatest(0, coalesce(p_offset, 0));
  sec text := nullif(lower(trim(coalesce(p_section, ''))), '');
  q text := nullif(lower(trim(coalesce(p_search, ''))), '');
  items jsonb := '[]'::jsonb;
  total_count int := 0;
  section_counts jsonb := '{}'::jsonb;
begin
  perform public.app_require_admin();

  select * into target from public.app_users where id = p_user_id;
  if target is null then
    raise exception 'User not found';
  end if;

  if sec is not null and sec not in (
    'all','expenses','inventory','installments','loans','bitcoin','notes','system','other'
  ) then
    raise exception 'Invalid section filter';
  end if;
  if sec = 'all' then sec := null; end if;

  select coalesce(jsonb_object_agg(section, cnt), '{}'::jsonb)
  into section_counts
  from (
    select public.app_admin_classify_ledger_entry(direction, person_name, notes) as section,
           count(*)::int as cnt
    from public.loan_ledger_entries
    where owner_id = p_user_id
    group by 1
  ) s;

  select count(*)::int into total_count
  from public.loan_ledger_entries e
  where e.owner_id = p_user_id
    and (
      sec is null
      or public.app_admin_classify_ledger_entry(e.direction, e.person_name, e.notes) = sec
    )
    and (
      q is null
      or lower(coalesce(e.person_name, '')) like '%' || q || '%'
      or lower(coalesce(e.notes, '')) like '%' || q || '%'
      or lower(coalesce(e.currency, '')) like '%' || q || '%'
      or lower(coalesce(e.direction, '')) like '%' || q || '%'
      or lower(coalesce(e.entry_kind, '')) like '%' || q || '%'
      or lower(e.id::text) like '%' || q || '%'
      or lower(e.group_id::text) like '%' || q || '%'
    );

  select coalesce(jsonb_agg(public.app_admin_ledger_entry_row(e) order by e.created_at desc), '[]'::jsonb)
  into items
  from (
    select *
    from public.loan_ledger_entries e
    where e.owner_id = p_user_id
      and (
        sec is null
        or public.app_admin_classify_ledger_entry(e.direction, e.person_name, e.notes) = sec
      )
      and (
        q is null
        or lower(coalesce(e.person_name, '')) like '%' || q || '%'
        or lower(coalesce(e.notes, '')) like '%' || q || '%'
        or lower(coalesce(e.currency, '')) like '%' || q || '%'
        or lower(coalesce(e.direction, '')) like '%' || q || '%'
        or lower(coalesce(e.entry_kind, '')) like '%' || q || '%'
        or lower(e.id::text) like '%' || q || '%'
        or lower(e.group_id::text) like '%' || q || '%'
      )
    order by e.created_at desc
    limit lim offset off
  ) e;

  return jsonb_build_object(
    'user', jsonb_build_object(
      'id', target.id,
      'username', target.username,
      'display_name', target.display_name,
      'role', target.role,
      'is_protected', target.is_protected
    ),
    'total', total_count,
    'limit', lim,
    'offset', off,
    'section_counts', section_counts,
    'items', items
  );
end;
$$;

create or replace function public.app_admin_update_ledger_entry(
  p_entry_id uuid,
  p_group_id uuid default null,
  p_direction text default null,
  p_entry_kind text default null,
  p_person_name text default null,
  p_currency text default null,
  p_principal_amount numeric default null,
  p_action_amount numeric default null,
  p_loan_date date default null,
  p_action_date date default null,
  p_notes text default null,
  p_clear_principal boolean default false,
  p_clear_action boolean default false,
  p_clear_action_date boolean default false,
  p_clear_notes boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.loan_ledger_entries;
  new_direction text;
  new_kind text;
  new_principal numeric;
  new_action numeric;
  new_action_date date;
  new_notes text;
begin
  perform public.app_require_admin();

  select * into row from public.loan_ledger_entries where id = p_entry_id;
  if row is null then
    raise exception 'Entry not found';
  end if;

  new_direction := coalesce(nullif(trim(p_direction), ''), row.direction);
  new_kind := coalesce(nullif(trim(p_entry_kind), ''), row.entry_kind);

  if new_direction not in ('given', 'taken', 'goods') then
    raise exception 'Invalid direction';
  end if;
  if new_kind not in ('principal', 'partial', 'full') then
    raise exception 'Invalid entry_kind';
  end if;

  if p_clear_principal then
    new_principal := null;
  else
    new_principal := coalesce(p_principal_amount, row.principal_amount);
  end if;

  if p_clear_action then
    new_action := null;
  else
    new_action := coalesce(p_action_amount, row.action_amount);
  end if;

  if p_clear_action_date then
    new_action_date := null;
  else
    new_action_date := coalesce(p_action_date, row.action_date);
  end if;

  if p_clear_notes then
    new_notes := null;
  elsif p_notes is not null then
    new_notes := p_notes;
  else
    new_notes := row.notes;
  end if;

  -- Enforce amount rules to match table constraints
  if new_kind = 'principal' then
    if new_principal is null then
      raise exception 'Principal entries require principal_amount';
    end if;
    new_action := null;
    new_action_date := null;
  else
    if new_action is null then
      raise exception 'Partial/full entries require action_amount';
    end if;
    if new_action_date is null then
      raise exception 'Partial/full entries require action_date';
    end if;
    new_principal := null;
  end if;

  update public.loan_ledger_entries set
    group_id = coalesce(p_group_id, group_id),
    direction = new_direction,
    entry_kind = new_kind,
    person_name = coalesce(nullif(trim(p_person_name), ''), person_name),
    currency = coalesce(nullif(trim(p_currency), ''), currency),
    principal_amount = new_principal,
    action_amount = new_action,
    loan_date = coalesce(p_loan_date, loan_date),
    action_date = new_action_date,
    notes = new_notes,
    updated_at = now()
  where id = p_entry_id
  returning * into row;

  return public.app_admin_ledger_entry_row(row);
end;
$$;

create or replace function public.app_admin_delete_ledger_entry(
  p_entry_id uuid,
  p_hard_delete boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.loan_ledger_entries;
begin
  perform public.app_require_admin();

  select * into row from public.loan_ledger_entries where id = p_entry_id;
  if row is null then
    raise exception 'Entry not found';
  end if;

  if coalesce(p_hard_delete, false) then
    delete from public.loan_ledger_entries where id = p_entry_id;
    return jsonb_build_object('ok', true, 'deleted_id', p_entry_id, 'hard', true);
  end if;

  if coalesce(row.notes, '') ilike '%[DELETED]%' then
    return public.app_admin_ledger_entry_row(row);
  end if;

  update public.loan_ledger_entries
  set
    notes = trim(both from concat(coalesce(notes, ''), ' [DELETED]')),
    updated_at = now()
  where id = p_entry_id
  returning * into row;

  return public.app_admin_ledger_entry_row(row);
end;
$$;

grant execute on function public.app_admin_classify_ledger_entry(text, text, text) to anon, authenticated;
grant execute on function public.app_admin_list_user_ledger(uuid, text, text, int, int) to anon, authenticated;
grant execute on function public.app_admin_update_ledger_entry(uuid, uuid, text, text, text, text, numeric, numeric, date, date, text, boolean, boolean, boolean, boolean) to anon, authenticated;
grant execute on function public.app_admin_delete_ledger_entry(uuid, boolean) to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/018_admin_raw_user_ledger.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/019_messaging_live_sync.sql
-- ############################################################################

-- ============================================================================
-- 019_messaging_live_sync.sql
-- Lightweight sync fingerprint for near-realtime Messages / inquiries UI.
--
-- Why not Supabase Realtime (postgres_changes)?
--   • app_inquiries / app_inquiry_messages / app_admin_notifications use deny-all RLS
--   • Auth is custom app_sessions via X-Session-Token (not Supabase Auth JWTs)
--   • Opening SELECT policies for Realtime would risk cross-user message leakage
--
-- This migration is additive only: one SECURITY DEFINER RPC used by the SPA poller.
-- It does NOT alter existing tables, RLS, or message RPCs.
-- ============================================================================

create or replace function public.app_messaging_sync_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  u public.app_users;
  is_admin boolean := false;
  notif_count int := 0;
  inquiry_unread int := 0;
  user_unread int := 0;
  inquiry_count int := 0;
  open_count int := 0;
  message_total bigint := 0;
  latest_msg_at timestamptz;
  latest_updated_at timestamptz;
  latest_notif_at timestamptz;
  fp text;
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;

  select * into u from public.app_users where id = uid;
  if u is null or not u.is_active then
    raise exception 'Authentication required';
  end if;

  -- Match client isAppAdminSession(): role admin, not trial
  is_admin := (
    u.role = 'admin'
    and coalesce(u.access_plan, 'full') <> 'trial'
  );

  if is_admin then
    select count(*)::int into notif_count
    from public.app_admin_notifications
    where is_read = false;

    select max(created_at) into latest_notif_at
    from public.app_admin_notifications;

    select count(*)::int into inquiry_unread
    from public.app_inquiries i
    where exists (
      select 1
      from public.app_inquiry_messages m
      where m.inquiry_id = i.id
        and m.sender_role in ('user', 'guest')
        and (i.admin_last_read_at is null or m.created_at > i.admin_last_read_at)
    )
    or i.status = 'open';

    select
      count(*)::int,
      count(*) filter (where status = 'open')::int,
      max(coalesce(last_message_at, updated_at, created_at)),
      max(updated_at)
    into inquiry_count, open_count, latest_msg_at, latest_updated_at
    from public.app_inquiries;

    select count(*)::bigint into message_total
    from public.app_inquiry_messages;

    fp := format(
      'a|%s|%s|%s|%s|%s|%s|%s|%s',
      notif_count,
      inquiry_unread,
      inquiry_count,
      open_count,
      coalesce(message_total, 0),
      coalesce(extract(epoch from latest_msg_at)::bigint, 0),
      coalesce(extract(epoch from latest_updated_at)::bigint, 0),
      coalesce(extract(epoch from latest_notif_at)::bigint, 0)
    );

    return jsonb_build_object(
      'role', 'admin',
      'fingerprint', fp,
      'notifications', notif_count,
      'inquiries', inquiry_unread,
      'inquiry_count', inquiry_count,
      'open_count', open_count,
      'message_total', coalesce(message_total, 0),
      'latest_message_at', latest_msg_at,
      'latest_notification_at', latest_notif_at
    );
  end if;

  -- Regular user (or trial): only own conversations
  select
    count(*)::int,
    max(coalesce(i.last_message_at, i.updated_at, i.created_at)),
    max(i.updated_at)
  into inquiry_count, latest_msg_at, latest_updated_at
  from public.app_inquiries i
  where i.sender_id = uid;

  select count(*)::bigint into message_total
  from public.app_inquiry_messages m
  join public.app_inquiries i on i.id = m.inquiry_id
  where i.sender_id = uid;

  select coalesce(sum(sub.c), 0)::int into user_unread
  from public.app_inquiries i
  cross join lateral (
    select count(*)::int as c
    from public.app_inquiry_messages m
    where m.inquiry_id = i.id
      and m.sender_role = 'admin'
      and (i.user_last_read_at is null or m.created_at > i.user_last_read_at)
  ) sub
  where i.sender_id = uid;

  fp := format(
    'u|%s|%s|%s|%s|%s',
    user_unread,
    inquiry_count,
    coalesce(message_total, 0),
    coalesce(extract(epoch from latest_msg_at)::bigint, 0),
    coalesce(extract(epoch from latest_updated_at)::bigint, 0)
  );

  return jsonb_build_object(
    'role', 'user',
    'fingerprint', fp,
    'notifications', 0,
    'inquiries', 0,
    'user_unread', user_unread,
    'inquiry_count', inquiry_count,
    'message_total', coalesce(message_total, 0),
    'latest_message_at', latest_msg_at
  );
end;
$$;

grant execute on function public.app_messaging_sync_state() to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/019_messaging_live_sync.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/020_domain_tables_owner_rls.sql
-- ############################################################################

-- ============================================================================
-- 020_domain_tables_owner_rls.sql
-- Additive: ensure per-section domain tables exist with owner_id, meta, is_deleted,
-- strict RLS, and bitcoin_wallets / app_notes / app_user_prefs.
-- Does NOT drop loan_ledger_entries or migrate data (see 021).
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Helpers: add column if missing ───────────────────────────────────────────
create or replace function public.app_add_column_if_missing(
  p_table text,
  p_column text,
  p_type text
)
returns void
language plpgsql
as $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = p_table
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = p_table and column_name = p_column
  ) then
    execute format('alter table public.%I add column %I %s', p_table, p_column, p_type);
  end if;
end;
$$;

-- ── Core domain tables (IF NOT EXISTS) ───────────────────────────────────────
create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
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

create table if not exists public.loan_payments (
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

create table if not exists public.installment_plans (
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

create table if not exists public.installment_payments (
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

create table if not exists public.goods_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null unique,
  item_name text not null,
  currency text not null check (currency in ('AED', 'SAR', 'PKR', 'USD', 'BTC')),
  unit_actual_price numeric(18,8) not null default 0,
  bought_qty numeric(18,8) not null default 1,
  total_actual_price numeric(18,8) not null default 0,
  bought_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.goods_sales (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  item_name text not null,
  currency text not null check (currency in ('AED', 'SAR', 'PKR', 'USD', 'BTC')),
  unit_sold_price numeric(18,8) not null default 0,
  sold_qty numeric(18,8) not null default 1,
  total_sold_price numeric(18,8) not null default 0,
  sold_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Allow goods_sales without FK if goods_items missing for CUSTOMER-only groups;
-- add FK only when safe (skip if orphans would break). Prefer soft link via group_id.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'goods_sales_group_id_fkey'
  ) and exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'goods_items'
  ) then
    begin
      alter table public.goods_sales
        add constraint goods_sales_group_id_fkey
        foreign key (group_id) references public.goods_items(group_id) on delete cascade;
    exception when others then
      -- Keep without FK when legacy shapes prevent it
      null;
    end;
  end if;
end $$;

create table if not exists public.expense_accounts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null unique,
  account_name text not null,
  account_type text not null default 'Bank Account',
  currency text not null check (currency in ('AED', 'SAR', 'PKR', 'USD', 'BTC')),
  opening_balance numeric(18,8) not null default 0,
  account_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expense_topups (
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

create table if not exists public.expense_entries (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.expense_accounts(group_id) on delete cascade,
  account_name text not null,
  currency text not null check (currency in ('AED', 'SAR', 'PKR', 'USD', 'BTC')),
  item_name text not null default '',
  expense_type text not null default 'Other',
  amount numeric(18,8) not null,
  expense_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expense_transfers (
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

create table if not exists public.bitcoin_wallets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.app_users(id) on delete cascade,
  label text not null default '',
  address text not null default '',
  network text not null default 'mainnet',
  is_watch_only boolean not null default true,
  currency text not null default 'BTC',
  notes text,
  meta jsonb not null default '{}'::jsonb,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.app_users(id) on delete cascade,
  content text not null default '',
  notes text,
  meta jsonb not null default '{}'::jsonb,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_user_prefs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.app_users(id) on delete cascade,
  pref_key text not null,
  pref_value text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, pref_key)
);

-- Generic activity rows for inventory events that are not simple item/sale
-- (PURCHASE restock, SETTLEMENT, CUSTOMER-only, etc.)
create table if not exists public.goods_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  owner_id uuid references public.app_users(id) on delete cascade,
  tx_type text not null default 'ITEM',
  item_name text not null default '',
  currency text not null check (currency in ('AED', 'SAR', 'PKR', 'USD', 'BTC')),
  entry_kind text not null default 'partial' check (entry_kind in ('principal', 'partial', 'full')),
  direction text not null default 'taken',
  amount numeric(18,8),
  qty numeric(18,8),
  event_date date not null,
  notes text,
  meta jsonb not null default '{}'::jsonb,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Shared columns on all domain tables ──────────────────────────────────────
do $$
declare
  t text;
  tables text[] := array[
    'loans','loan_payments','installment_plans','installment_payments',
    'goods_items','goods_sales','goods_events',
    'expense_accounts','expense_topups','expense_entries','expense_transfers',
    'bitcoin_wallets','app_notes','app_user_prefs'
  ];
begin
  foreach t in array tables loop
    perform public.app_add_column_if_missing(t, 'owner_id', 'uuid');
    perform public.app_add_column_if_missing(t, 'meta', 'jsonb not null default ''{}''::jsonb');
    perform public.app_add_column_if_missing(t, 'is_deleted', 'boolean not null default false');
    perform public.app_add_column_if_missing(t, 'created_at', 'timestamptz not null default now()');
    perform public.app_add_column_if_missing(t, 'updated_at', 'timestamptz not null default now()');
  end loop;
end $$;

-- Extra inventory / expense columns
select public.app_add_column_if_missing('goods_items', 'tx_type', 'text default ''ITEM''');
select public.app_add_column_if_missing('goods_items', 'item_code', 'text');
select public.app_add_column_if_missing('goods_sales', 'tx_type', 'text default ''SALE''');
select public.app_add_column_if_missing('expense_accounts', 'btc_address', 'text');
select public.app_add_column_if_missing('expense_accounts', 'btc_network', 'text');
select public.app_add_column_if_missing('expense_entries', 'item_meta', 'jsonb not null default ''{}''::jsonb');

-- FK owner_id → app_users where missing
do $$
declare
  t text;
  tables text[] := array[
    'loans','loan_payments','installment_plans','installment_payments',
    'goods_items','goods_sales','goods_events',
    'expense_accounts','expense_topups','expense_entries','expense_transfers',
    'bitcoin_wallets','app_notes'
  ];
begin
  foreach t in array tables loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'owner_id'
    ) and not exists (
      select 1 from pg_constraint
      where conname = t || '_owner_id_fkey'
    ) then
      begin
        execute format(
          'alter table public.%I add constraint %I foreign key (owner_id) references public.app_users(id) on delete cascade',
          t, t || '_owner_id_fkey'
        );
      exception when others then
        null;
      end;
    end if;
  end loop;
end $$;

-- updated_at triggers
do $$
declare
  t text;
  tables text[] := array[
    'loans','loan_payments','installment_plans','installment_payments',
    'goods_items','goods_sales','goods_events',
    'expense_accounts','expense_topups','expense_entries','expense_transfers',
    'bitcoin_wallets','app_notes','app_user_prefs'
  ];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists trg_set_%s_updated_at on public.%I', t, t);
    execute format(
      'create trigger trg_set_%s_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      t, t
    );
  end loop;
end $$;

-- enforce_owner_id triggers
do $$
declare
  t text;
  tables text[] := array[
    'loans','loan_payments','installment_plans','installment_payments',
    'goods_items','goods_sales','goods_events',
    'expense_accounts','expense_topups','expense_entries','expense_transfers',
    'bitcoin_wallets','app_notes','app_user_prefs'
  ];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists trg_enforce_owner_id on public.%I', t);
    execute format(
      'create trigger trg_enforce_owner_id before insert or update on public.%I for each row execute function public.enforce_owner_id()',
      t
    );
  end loop;
end $$;

-- Strict own-row RLS
do $$
declare
  t text;
  tables text[] := array[
    'loans','loan_payments','installment_plans','installment_payments',
    'goods_items','goods_sales','goods_events',
    'expense_accounts','expense_topups','expense_entries','expense_transfers',
    'bitcoin_wallets','app_notes','app_user_prefs'
  ];
  pol record;
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);
    for pol in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, t);
    end loop;
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (public.app_owns_or_admin(owner_id))',
      t || '_select', t
    );
    execute format(
      'create policy %I on public.%I for insert to anon, authenticated with check (public.app_owns_or_admin(coalesce(owner_id, public.current_app_user_id())))',
      t || '_insert', t
    );
    execute format(
      'create policy %I on public.%I for update to anon, authenticated using (public.app_owns_or_admin(owner_id)) with check (public.app_owns_or_admin(owner_id))',
      t || '_update', t
    );
    execute format(
      'create policy %I on public.%I for delete to anon, authenticated using (public.app_owns_or_admin(owner_id))',
      t || '_delete', t
    );
  end loop;
end $$;

create index if not exists loans_owner_idx on public.loans(owner_id);
create index if not exists loan_payments_owner_idx on public.loan_payments(owner_id);
create index if not exists installment_plans_owner_idx on public.installment_plans(owner_id);
create index if not exists goods_items_owner_idx on public.goods_items(owner_id);
create index if not exists goods_events_group_idx on public.goods_events(group_id);
create index if not exists goods_events_owner_idx on public.goods_events(owner_id);
create index if not exists expense_accounts_owner_idx on public.expense_accounts(owner_id);
create index if not exists bitcoin_wallets_owner_idx on public.bitcoin_wallets(owner_id);
create index if not exists app_notes_owner_idx on public.app_notes(owner_id);
create index if not exists app_user_prefs_owner_idx on public.app_user_prefs(owner_id);

grant select, insert, update, delete on
  public.loans, public.loan_payments,
  public.installment_plans, public.installment_payments,
  public.goods_items, public.goods_sales, public.goods_events,
  public.expense_accounts, public.expense_topups, public.expense_entries, public.expense_transfers,
  public.bitcoin_wallets, public.app_notes, public.app_user_prefs
to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/020_domain_tables_owner_rls.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/021_domain_migrate_rpcs.sql
-- ############################################################################

-- ============================================================================
-- 021_domain_migrate_rpcs.sql
-- Migrate legacy loan_ledger_entries (meta tags) → domain tables, then DELETE
-- the ledger row(s) in the same transaction. User-triggered only.
-- Requires 020_domain_tables_owner_rls.sql
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

create or replace function public.app_classify_ledger_section(
  p_direction text,
  p_person_name text,
  p_notes text
)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_notes, '') ilike '%[PAGE_CURRENCY:%'
      or coalesce(p_notes, '') ilike '%[VAT_SETTINGS:%'
      or coalesce(p_notes, '') ilike '%[SECRET_PIN_HASH:%'
      or coalesce(p_notes, '') ilike '%[SMART_PIN_DISABLED:%'
      then 'system_prefs'
    when coalesce(p_notes, '') ilike '%[EXPENSE_ACCOUNT]%' then 'expenses'
    when coalesce(p_notes, '') ilike '%[GOODS]%'
      or coalesce(p_direction, '') = 'goods' then 'inventory'
    when coalesce(p_notes, '') ilike '%[INSTALLMENT]%' then 'installments'
    when coalesce(p_person_name, '') = 'SYSTEM'
      and (
        coalesce(p_notes, '') ilike '%BITCOIN_WALLET%'
        or coalesce(p_notes, '') ilike '%"rowType":"BITCOIN_WALLET"%'
      ) then 'bitcoin'
    when coalesce(p_person_name, '') = 'SYSTEM'
      and (
        coalesce(p_notes, '') ilike '%"rowType":"NOTE"%'
        or coalesce(p_notes, '') ilike '%"NOTE"%'
      ) then 'notes'
    when coalesce(p_person_name, '') = 'SYSTEM' then 'system_prefs'
    when coalesce(p_direction, '') = 'given' then 'loans_given'
    when coalesce(p_direction, '') = 'taken' then 'loans_taken'
    else 'other'
  end;
$$;

create or replace function public.app_note_meta_value(p_notes text, p_key text)
returns text
language plpgsql
immutable
as $$
declare
  m text[];
begin
  m := regexp_match(coalesce(p_notes, ''), '\[' || p_key || ':([^\]]*)\]');
  if m is null then
    return null;
  end if;
  return m[1];
end;
$$;

create or replace function public.app_migrate_ledger_group(
  p_group_id uuid,
  p_section text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_app_user_id();
  sec text;
  r public.loan_ledger_entries;
  principal public.loan_ledger_entries;
  migrated int := 0;
  deleted_ids uuid[] := '{}';
  etype text;
  account_type text;
  item_name text;
  expense_type text;
  btc_json jsonb;
  note_json jsonb;
  pref_key text;
  content text;
  tx text;
  qty numeric;
  uap numeric;
  usp numeric;
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;
  if p_group_id is null then
    raise exception 'group_id required';
  end if;

  select * into principal
  from public.loan_ledger_entries
  where group_id = p_group_id
    and owner_id = uid
    and entry_kind = 'principal'
  order by created_at asc
  limit 1;

  if principal is null then
    select * into principal
    from public.loan_ledger_entries
    where group_id = p_group_id and owner_id = uid
    order by created_at asc
    limit 1;
  end if;

  if principal is null then
    raise exception 'No ledger rows found for this group';
  end if;

  sec := coalesce(
    nullif(lower(trim(coalesce(p_section, ''))), ''),
    public.app_classify_ledger_section(principal.direction, principal.person_name, principal.notes)
  );

  if sec in ('loans_given', 'loans_taken', 'loans') then
    if not exists (select 1 from public.loans where group_id = p_group_id and owner_id = uid) then
      if principal.entry_kind <> 'principal' then
        raise exception 'Loan group is missing a principal row';
      end if;
      insert into public.loans (
        id, group_id, owner_id, direction, person_name, currency,
        principal_amount, loan_date, notes, meta, is_deleted
      ) values (
        principal.id, principal.group_id, uid, principal.direction, principal.person_name, principal.currency,
        coalesce(principal.principal_amount, 0), principal.loan_date, principal.notes,
        jsonb_build_object('migrated_from', 'loan_ledger_entries'),
        coalesce(principal.notes, '') ilike '%[DELETED]%'
      );
      migrated := migrated + 1;
      deleted_ids := array_append(deleted_ids, principal.id);
    end if;

    for r in
      select * from public.loan_ledger_entries
      where group_id = p_group_id and owner_id = uid and entry_kind in ('partial', 'full')
    loop
      if not exists (select 1 from public.loan_payments where id = r.id) then
        insert into public.loan_payments (
          id, group_id, owner_id, direction, person_name, currency,
          payment_kind, payment_amount, payment_date, notes, meta, is_deleted
        ) values (
          r.id, r.group_id, uid, r.direction, r.person_name, r.currency,
          r.entry_kind, coalesce(r.action_amount, 0), coalesce(r.action_date, r.loan_date),
          r.notes, jsonb_build_object('migrated_from', 'loan_ledger_entries'),
          coalesce(r.notes, '') ilike '%[DELETED]%'
        );
        migrated := migrated + 1;
      end if;
      deleted_ids := array_append(deleted_ids, r.id);
    end loop;

  elsif sec = 'installments' then
    if not exists (select 1 from public.installment_plans where group_id = p_group_id and owner_id = uid) then
      if principal.entry_kind <> 'principal' then
        raise exception 'Installment group is missing a principal row';
      end if;
      insert into public.installment_plans (
        id, group_id, owner_id, person_name, currency, principal_amount, loan_date, notes, meta, is_deleted
      ) values (
        principal.id, principal.group_id, uid, principal.person_name, principal.currency,
        coalesce(principal.principal_amount, 0), principal.loan_date, principal.notes,
        jsonb_build_object('migrated_from', 'loan_ledger_entries'),
        coalesce(principal.notes, '') ilike '%[DELETED]%'
      );
      migrated := migrated + 1;
      deleted_ids := array_append(deleted_ids, principal.id);
    end if;

    for r in
      select * from public.loan_ledger_entries
      where group_id = p_group_id and owner_id = uid and entry_kind in ('partial', 'full')
    loop
      if not exists (select 1 from public.installment_payments where id = r.id) then
        insert into public.installment_payments (
          id, group_id, owner_id, person_name, currency,
          payment_kind, payment_amount, payment_date, notes, meta, is_deleted
        ) values (
          r.id, r.group_id, uid, r.person_name, r.currency,
          r.entry_kind, coalesce(r.action_amount, 0), coalesce(r.action_date, r.loan_date),
          r.notes, jsonb_build_object('migrated_from', 'loan_ledger_entries'),
          coalesce(r.notes, '') ilike '%[DELETED]%'
        );
        migrated := migrated + 1;
      end if;
      deleted_ids := array_append(deleted_ids, r.id);
    end loop;

  elsif sec = 'expenses' then
    -- Ensure account exists from principal ACCOUNT row (or first principal)
    if not exists (select 1 from public.expense_accounts where group_id = p_group_id and owner_id = uid) then
      select * into r from public.loan_ledger_entries
      where group_id = p_group_id and owner_id = uid and entry_kind = 'principal'
      order by created_at asc limit 1;
      if r is null then
        raise exception 'Expense group is missing an account principal';
      end if;
      account_type := coalesce(nullif(public.app_note_meta_value(r.notes, 'ATYPE'), ''), 'Bank Account');
      insert into public.expense_accounts (
        id, group_id, owner_id, account_name, account_type, currency,
        opening_balance, account_date, notes, btc_address, btc_network, meta, is_deleted
      ) values (
        r.id, r.group_id, uid, r.person_name, account_type, r.currency,
        coalesce(r.principal_amount, 0), r.loan_date, r.notes,
        public.app_note_meta_value(r.notes, 'BADDR'),
        public.app_note_meta_value(r.notes, 'BNET'),
        jsonb_build_object('migrated_from', 'loan_ledger_entries', 'etype', 'ACCOUNT'),
        coalesce(r.notes, '') ilike '%[DELETED]%'
      );
      migrated := migrated + 1;
      deleted_ids := array_append(deleted_ids, r.id);
    end if;

    for r in
      select * from public.loan_ledger_entries
      where group_id = p_group_id and owner_id = uid
        and id <> all (deleted_ids)
    loop
      etype := upper(coalesce(nullif(public.app_note_meta_value(r.notes, 'ETYPE'), ''), ''));
      if r.entry_kind = 'principal' and (etype = '' or etype = 'ACCOUNT') then
        deleted_ids := array_append(deleted_ids, r.id);
        continue;
      end if;
      if etype = 'TOPUP' or (etype = '' and r.entry_kind in ('partial', 'full') and coalesce(r.notes, '') ilike '%Transfer from%') then
        if not exists (select 1 from public.expense_topups where id = r.id) then
          insert into public.expense_topups (
            id, group_id, owner_id, account_name, currency, amount, topup_date, notes, meta, is_deleted
          ) values (
            r.id, r.group_id, uid, r.person_name, r.currency,
            coalesce(r.action_amount, r.principal_amount, 0),
            coalesce(r.action_date, r.loan_date), r.notes,
            jsonb_build_object('migrated_from', 'loan_ledger_entries', 'etype', 'TOPUP'),
            coalesce(r.notes, '') ilike '%[DELETED]%'
          );
          migrated := migrated + 1;
        end if;
        deleted_ids := array_append(deleted_ids, r.id);
      else
        item_name := coalesce(nullif(public.app_note_meta_value(r.notes, 'ITEM'), ''), r.person_name, 'Expense');
        expense_type := coalesce(nullif(public.app_note_meta_value(r.notes, 'XTYPE'), ''), 'Other');
        if not exists (select 1 from public.expense_entries where id = r.id) then
          insert into public.expense_entries (
            id, group_id, owner_id, account_name, currency, item_name, expense_type,
            amount, expense_date, notes, meta, is_deleted
          ) values (
            r.id, r.group_id, uid, r.person_name, r.currency, item_name, expense_type,
            coalesce(r.action_amount, r.principal_amount, 0),
            coalesce(r.action_date, r.loan_date), r.notes,
            jsonb_build_object('migrated_from', 'loan_ledger_entries', 'etype', 'EXPENSE'),
            coalesce(r.notes, '') ilike '%[DELETED]%'
          );
          migrated := migrated + 1;
        end if;
        deleted_ids := array_append(deleted_ids, r.id);
      end if;
    end loop;

  elsif sec = 'inventory' then
    for r in
      select * from public.loan_ledger_entries
      where group_id = p_group_id and owner_id = uid
      order by created_at asc
    loop
      tx := upper(coalesce(nullif(public.app_note_meta_value(r.notes, 'TX'), ''),
        case when r.entry_kind = 'principal' then 'ITEM' else 'SALE' end));
      qty := nullif(public.app_note_meta_value(r.notes, 'BQTY'), '')::numeric;
      if qty is null then
        qty := nullif(public.app_note_meta_value(r.notes, 'SQTY'), '')::numeric;
      end if;
      uap := nullif(public.app_note_meta_value(r.notes, 'UAP'), '')::numeric;
      usp := nullif(public.app_note_meta_value(r.notes, 'USP'), '')::numeric;

      if r.entry_kind = 'principal' and tx in ('ITEM', 'PURCHASE', '') then
        if not exists (select 1 from public.goods_items where group_id = p_group_id and owner_id = uid) then
          insert into public.goods_items (
            id, group_id, owner_id, item_name, currency, unit_actual_price, bought_qty,
            total_actual_price, bought_date, notes, tx_type, item_code, meta, is_deleted
          ) values (
            r.id, r.group_id, uid, r.person_name, r.currency,
            coalesce(uap, r.principal_amount, 0),
            coalesce(qty, 1),
            coalesce(r.principal_amount, 0),
            r.loan_date, r.notes, coalesce(nullif(tx, ''), 'ITEM'),
            public.app_note_meta_value(r.notes, 'ICODE'),
            jsonb_build_object('migrated_from', 'loan_ledger_entries', 'ledger_shape', to_jsonb(r)),
            coalesce(r.notes, '') ilike '%[DELETED]%'
          );
          migrated := migrated + 1;
        end if;
      elsif tx = 'SALE' then
        if not exists (select 1 from public.goods_sales where id = r.id) then
          insert into public.goods_sales (
            id, group_id, owner_id, item_name, currency, unit_sold_price, sold_qty,
            total_sold_price, sold_date, notes, tx_type, meta, is_deleted
          ) values (
            r.id, r.group_id, uid, r.person_name, r.currency,
            coalesce(usp, r.action_amount, 0),
            coalesce(qty, 1),
            coalesce(r.action_amount, r.principal_amount, 0),
            coalesce(r.action_date, r.loan_date), r.notes, 'SALE',
            jsonb_build_object('migrated_from', 'loan_ledger_entries', 'ledger_shape', to_jsonb(r)),
            coalesce(r.notes, '') ilike '%[DELETED]%'
          );
          migrated := migrated + 1;
        end if;
      else
        if not exists (select 1 from public.goods_events where id = r.id) then
          insert into public.goods_events (
            id, group_id, owner_id, tx_type, item_name, currency, entry_kind, direction,
            amount, qty, event_date, notes, meta, is_deleted
          ) values (
            r.id, r.group_id, uid, coalesce(nullif(tx, ''), 'EVENT'), r.person_name, r.currency,
            r.entry_kind, r.direction,
            coalesce(r.action_amount, r.principal_amount),
            qty, coalesce(r.action_date, r.loan_date), r.notes,
            jsonb_build_object('migrated_from', 'loan_ledger_entries', 'ledger_shape', to_jsonb(r)),
            coalesce(r.notes, '') ilike '%[DELETED]%'
          );
          migrated := migrated + 1;
        end if;
      end if;
      deleted_ids := array_append(deleted_ids, r.id);
    end loop;

  else
    raise exception 'Group migrate does not support section %', sec;
  end if;

  delete from public.loan_ledger_entries
  where owner_id = uid
    and group_id = p_group_id
    and id = any (deleted_ids);

  -- Also delete any remaining rows in the group for this owner (fully migrated)
  delete from public.loan_ledger_entries
  where owner_id = uid and group_id = p_group_id;

  return jsonb_build_object(
    'ok', true,
    'section', sec,
    'group_id', p_group_id,
    'migrated', migrated,
    'deleted', coalesce(array_length(deleted_ids, 1), 0)
  );
end;
$$;

create or replace function public.app_migrate_ledger_entry(p_entry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_app_user_id();
  r public.loan_ledger_entries;
  sec text;
  btc_json jsonb;
  note_json jsonb;
  pref_key text;
  pref_val text;
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;

  select * into r from public.loan_ledger_entries where id = p_entry_id and owner_id = uid;
  if r is null then
    raise exception 'Entry not found';
  end if;

  sec := public.app_classify_ledger_section(r.direction, r.person_name, r.notes);

  if sec in ('loans_given', 'loans_taken', 'installments', 'expenses', 'inventory') then
    return public.app_migrate_ledger_group(r.group_id, sec);
  end if;

  if sec = 'bitcoin' then
    begin
      btc_json := r.notes::jsonb;
    exception when others then
      btc_json := '{}'::jsonb;
    end;
    insert into public.bitcoin_wallets (
      id, owner_id, label, address, network, is_watch_only, currency, notes, meta, is_deleted
    ) values (
      r.id, uid,
      coalesce(btc_json->>'label', ''),
      coalesce(btc_json->>'address', ''),
      coalesce(btc_json->>'network', 'mainnet'),
      coalesce((btc_json->>'is_watch_only')::boolean, true),
      'BTC', r.notes,
      jsonb_build_object('migrated_from', 'loan_ledger_entries', 'row', btc_json),
      coalesce(r.notes, '') ilike '%[DELETED]%'
    )
    on conflict (id) do nothing;
    delete from public.loan_ledger_entries where id = r.id and owner_id = uid;
    return jsonb_build_object('ok', true, 'section', 'bitcoin', 'id', r.id);

  elsif sec = 'notes' then
    begin
      note_json := r.notes::jsonb;
    exception when others then
      note_json := jsonb_build_object('content', coalesce(r.notes, ''));
    end;
    insert into public.app_notes (
      id, owner_id, content, notes, meta, is_deleted
    ) values (
      r.id, uid,
      coalesce(note_json->>'content', r.notes, ''),
      r.notes,
      jsonb_build_object('migrated_from', 'loan_ledger_entries', 'row', note_json),
      false
    )
    on conflict (id) do nothing;
    delete from public.loan_ledger_entries where id = r.id and owner_id = uid;
    return jsonb_build_object('ok', true, 'section', 'notes', 'id', r.id);

  elsif sec = 'system_prefs' then
    if coalesce(r.notes, '') ilike '%[PAGE_CURRENCY:%' then
      pref_key := 'page_currency';
      pref_val := public.app_note_meta_value(r.notes, 'PAGE_CURRENCY');
    elsif coalesce(r.notes, '') ilike '%[VAT_SETTINGS:%' then
      pref_key := 'vat_settings';
      pref_val := public.app_note_meta_value(r.notes, 'VAT_SETTINGS');
    else
      pref_key := 'system_' || r.id::text;
      pref_val := r.notes;
    end if;
    insert into public.app_user_prefs (owner_id, pref_key, pref_value, meta)
    values (uid, pref_key, pref_val, jsonb_build_object('migrated_from', 'loan_ledger_entries', 'legacy_id', r.id))
    on conflict (owner_id, pref_key) do update
      set pref_value = excluded.pref_value,
          meta = excluded.meta,
          updated_at = now();
    delete from public.loan_ledger_entries where id = r.id and owner_id = uid;
    return jsonb_build_object('ok', true, 'section', 'system_prefs', 'pref_key', pref_key);
  end if;

  raise exception 'Unsupported section for migrate: %', sec;
end;
$$;

create or replace function public.app_migrate_section_batch(
  p_section text,
  p_limit int default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_app_user_id();
  lim int := greatest(1, least(coalesce(p_limit, 50), 200));
  sec text := lower(trim(coalesce(p_section, '')));
  g uuid;
  e uuid;
  done int := 0;
  errors jsonb := '[]'::jsonb;
  res jsonb;
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;

  if sec in ('loans', 'loans_given', 'loans_taken', 'installments', 'expenses', 'inventory') then
    for g in
      select distinct l.group_id
      from public.loan_ledger_entries l
      where l.owner_id = uid
        and (
          (sec = 'loans' and public.app_classify_ledger_section(l.direction, l.person_name, l.notes) in ('loans_given', 'loans_taken'))
          or (sec <> 'loans' and public.app_classify_ledger_section(l.direction, l.person_name, l.notes) = sec)
        )
      limit lim
    loop
      begin
        res := public.app_migrate_ledger_group(g, case when sec = 'loans' then null else sec end);
        done := done + 1;
      exception when others then
        errors := errors || jsonb_build_array(jsonb_build_object('group_id', g, 'error', SQLERRM));
      end;
    end loop;
  elsif sec in ('bitcoin', 'notes', 'system_prefs') then
    for e in
      select l.id
      from public.loan_ledger_entries l
      where l.owner_id = uid
        and public.app_classify_ledger_section(l.direction, l.person_name, l.notes) = sec
      limit lim
    loop
      begin
        res := public.app_migrate_ledger_entry(e);
        done := done + 1;
      exception when others then
        errors := errors || jsonb_build_array(jsonb_build_object('id', e, 'error', SQLERRM));
      end;
    end loop;
  else
    raise exception 'Invalid section for batch migrate';
  end if;

  return jsonb_build_object('ok', true, 'section', sec, 'migrated_groups_or_rows', done, 'errors', errors);
end;
$$;

grant execute on function public.app_classify_ledger_section(text, text, text) to anon, authenticated;
grant execute on function public.app_migrate_ledger_entry(uuid) to anon, authenticated;
grant execute on function public.app_migrate_ledger_group(uuid, text) to anon, authenticated;
grant execute on function public.app_migrate_section_batch(text, int) to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/021_domain_migrate_rpcs.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/022_admin_raw_domain_tables.sql
-- ############################################################################

-- ============================================================================
-- 022_admin_raw_domain_tables.sql
-- Extend Admin Raw list so leftover ledger rows AND domain-table rows appear.
-- Domain rows are returned as synthetic ledger-shaped items with source = table name.
-- Soft/hard delete RPCs also understand domain rows (is_deleted / DELETE).
-- Requires 018 + 020.
-- ============================================================================

create or replace function public.app_admin_domain_row_as_ledger(
  p_source text,
  p_id uuid,
  p_group_id uuid,
  p_owner_id uuid,
  p_direction text,
  p_entry_kind text,
  p_person_name text,
  p_currency text,
  p_principal_amount numeric,
  p_action_amount numeric,
  p_loan_date date,
  p_action_date date,
  p_notes text,
  p_created_at timestamptz,
  p_updated_at timestamptz,
  p_is_deleted boolean,
  p_section text
)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', p_id,
    'group_id', coalesce(p_group_id, p_id),
    'owner_id', p_owner_id,
    'direction', coalesce(p_direction, 'taken'),
    'entry_kind', coalesce(p_entry_kind, 'principal'),
    'person_name', coalesce(p_person_name, ''),
    'currency', coalesce(p_currency, 'AED'),
    'principal_amount', p_principal_amount,
    'action_amount', p_action_amount,
    'loan_date', p_loan_date,
    'action_date', p_action_date,
    'notes', p_notes,
    'created_at', p_created_at,
    'updated_at', p_updated_at,
    'section', coalesce(p_section, 'other'),
    'is_deleted', coalesce(p_is_deleted, false),
    'source', p_source
  );
$$;

create or replace function public.app_admin_list_user_ledger(
  p_user_id uuid,
  p_section text default null,
  p_search text default null,
  p_limit int default 200,
  p_offset int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.app_users;
  lim int := greatest(1, least(coalesce(p_limit, 200), 500));
  off int := greatest(0, coalesce(p_offset, 0));
  sec text := nullif(lower(trim(coalesce(p_section, ''))), '');
  q text := nullif(lower(trim(coalesce(p_search, ''))), '');
  items jsonb := '[]'::jsonb;
  total_count int := 0;
  section_counts jsonb := '{}'::jsonb;
  domain_count int := 0;
begin
  perform public.app_require_admin();

  select * into target from public.app_users where id = p_user_id;
  if target is null then
    raise exception 'User not found';
  end if;

  if sec is not null and sec not in (
    'all','expenses','inventory','installments','loans','bitcoin','notes','system','other'
  ) then
    raise exception 'Invalid section filter';
  end if;
  if sec = 'all' then sec := null; end if;

  create temporary table if not exists _admin_raw_unified (
    id uuid,
    group_id uuid,
    owner_id uuid,
    direction text,
    entry_kind text,
    person_name text,
    currency text,
    principal_amount numeric,
    action_amount numeric,
    loan_date date,
    action_date date,
    notes text,
    created_at timestamptz,
    updated_at timestamptz,
    section text,
    is_deleted boolean,
    source text
  ) on commit drop;
  truncate _admin_raw_unified;

  insert into _admin_raw_unified
  select
    e.id, e.group_id, e.owner_id, e.direction, e.entry_kind, e.person_name, e.currency,
    e.principal_amount, e.action_amount, e.loan_date, e.action_date, e.notes,
    e.created_at, e.updated_at,
    public.app_admin_classify_ledger_entry(e.direction, e.person_name, e.notes),
    (coalesce(e.notes, '') ilike '%[DELETED]%'),
    'loan_ledger_entries'
  from public.loan_ledger_entries e
  where e.owner_id = p_user_id;

  -- Domain tables (ignore if missing)
  begin
    insert into _admin_raw_unified
    select l.id, l.group_id, l.owner_id, l.direction, 'principal', l.person_name, l.currency,
           l.principal_amount, null, l.loan_date, null, l.notes, l.created_at, l.updated_at,
           'loans', coalesce(l.is_deleted, false), 'loans'
    from public.loans l where l.owner_id = p_user_id;
    insert into _admin_raw_unified
    select p.id, p.group_id, p.owner_id, p.direction, p.payment_kind, p.person_name, p.currency,
           null, p.payment_amount, p.payment_date, p.payment_date, p.notes, p.created_at, p.updated_at,
           'loans', coalesce(p.is_deleted, false), 'loan_payments'
    from public.loan_payments p where p.owner_id = p_user_id;
    insert into _admin_raw_unified
    select ip.id, ip.group_id, ip.owner_id, 'taken', 'principal', ip.person_name, ip.currency,
           ip.principal_amount, null, ip.loan_date, null, ip.notes, ip.created_at, ip.updated_at,
           'installments', coalesce(ip.is_deleted, false), 'installment_plans'
    from public.installment_plans ip where ip.owner_id = p_user_id;
    insert into _admin_raw_unified
    select ipp.id, ipp.group_id, ipp.owner_id, 'taken', ipp.payment_kind, ipp.person_name, ipp.currency,
           null, ipp.payment_amount, ipp.payment_date, ipp.payment_date, ipp.notes, ipp.created_at, ipp.updated_at,
           'installments', coalesce(ipp.is_deleted, false), 'installment_payments'
    from public.installment_payments ipp where ipp.owner_id = p_user_id;
    insert into _admin_raw_unified
    select ea.id, ea.group_id, ea.owner_id, 'taken', 'principal', ea.account_name, ea.currency,
           ea.opening_balance, null, ea.account_date, null, ea.notes, ea.created_at, ea.updated_at,
           'expenses', coalesce(ea.is_deleted, false), 'expense_accounts'
    from public.expense_accounts ea where ea.owner_id = p_user_id;
    insert into _admin_raw_unified
    select et.id, et.group_id, et.owner_id, 'taken', 'partial', et.account_name, et.currency,
           null, et.amount, et.topup_date, et.topup_date, et.notes, et.created_at, et.updated_at,
           'expenses', coalesce(et.is_deleted, false), 'expense_topups'
    from public.expense_topups et where et.owner_id = p_user_id;
    insert into _admin_raw_unified
    select ee.id, ee.group_id, ee.owner_id, 'taken', 'partial', ee.account_name, ee.currency,
           null, ee.amount, ee.expense_date, ee.expense_date, ee.notes, ee.created_at, ee.updated_at,
           'expenses', coalesce(ee.is_deleted, false), 'expense_entries'
    from public.expense_entries ee where ee.owner_id = p_user_id;
    insert into _admin_raw_unified
    select g.id, g.group_id, g.owner_id, 'taken', 'principal', g.item_name, g.currency,
           g.total_actual_price, null, g.bought_date, null, g.notes, g.created_at, g.updated_at,
           'inventory', coalesce(g.is_deleted, false), 'goods_items'
    from public.goods_items g where g.owner_id = p_user_id;
    insert into _admin_raw_unified
    select gs.id, gs.group_id, gs.owner_id, 'taken', 'partial', gs.item_name, gs.currency,
           null, gs.total_sold_price, gs.sold_date, gs.sold_date, gs.notes, gs.created_at, gs.updated_at,
           'inventory', coalesce(gs.is_deleted, false), 'goods_sales'
    from public.goods_sales gs where gs.owner_id = p_user_id;
    insert into _admin_raw_unified
    select ge.id, ge.group_id, ge.owner_id, coalesce(ge.direction, 'taken'), coalesce(ge.entry_kind, 'partial'),
           ge.item_name, ge.currency,
           case when ge.entry_kind = 'principal' then ge.amount else null end,
           case when ge.entry_kind = 'principal' then null else ge.amount end,
           ge.event_date, ge.event_date, ge.notes, ge.created_at, ge.updated_at,
           'inventory', coalesce(ge.is_deleted, false), 'goods_events'
    from public.goods_events ge where ge.owner_id = p_user_id;
    insert into _admin_raw_unified
    select b.id, b.id, b.owner_id, 'taken', 'principal', 'SYSTEM', coalesce(b.currency, 'BTC'),
           0, null, (b.created_at)::date, (b.created_at)::date, b.notes, b.created_at, b.updated_at,
           'bitcoin', coalesce(b.is_deleted, false), 'bitcoin_wallets'
    from public.bitcoin_wallets b where b.owner_id = p_user_id;
    insert into _admin_raw_unified
    select n.id, n.id, n.owner_id, 'taken', 'principal', 'SYSTEM', 'AED',
           0, null, (n.created_at)::date, (n.created_at)::date, coalesce(n.notes, n.content),
           n.created_at, n.updated_at, 'notes', coalesce(n.is_deleted, false), 'app_notes'
    from public.app_notes n where n.owner_id = p_user_id;
  exception when undefined_table then
    -- Domain migration 020 not applied yet
    null;
  end;

  delete from _admin_raw_unified u
  where (sec is not null and u.section <> sec)
     or (
       q is not null
       and not (
         lower(coalesce(u.person_name, '')) like '%' || q || '%'
         or lower(coalesce(u.notes, '')) like '%' || q || '%'
         or lower(coalesce(u.currency, '')) like '%' || q || '%'
         or lower(coalesce(u.direction, '')) like '%' || q || '%'
         or lower(coalesce(u.entry_kind, '')) like '%' || q || '%'
         or lower(coalesce(u.source, '')) like '%' || q || '%'
         or lower(u.id::text) like '%' || q || '%'
         or lower(u.group_id::text) like '%' || q || '%'
       )
     );

  select count(*)::int, count(*) filter (where source <> 'loan_ledger_entries')::int
  into total_count, domain_count
  from _admin_raw_unified;

  select coalesce(jsonb_object_agg(section, cnt), '{}'::jsonb)
  into section_counts
  from (
    select section, count(*)::int as cnt
    from _admin_raw_unified
    group by 1
  ) s;

  select coalesce(jsonb_agg(
    public.app_admin_domain_row_as_ledger(
      f.source, f.id, f.group_id, f.owner_id, f.direction, f.entry_kind, f.person_name,
      f.currency, f.principal_amount, f.action_amount, f.loan_date, f.action_date,
      f.notes, f.created_at, f.updated_at, f.is_deleted, f.section
    ) order by f.created_at desc
  ), '[]'::jsonb)
  into items
  from (
    select *
    from _admin_raw_unified
    order by created_at desc
    limit lim offset off
  ) f;

  return jsonb_build_object(
    'user', jsonb_build_object(
      'id', target.id,
      'username', target.username,
      'display_name', target.display_name,
      'role', target.role,
      'is_protected', target.is_protected
    ),
    'total', total_count,
    'domain_row_count', domain_count,
    'limit', lim,
    'offset', off,
    'section_counts', section_counts,
    'items', items
  );
end;
$$;

create or replace function public.app_admin_delete_ledger_entry(
  p_entry_id uuid,
  p_hard_delete boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.loan_ledger_entries;
  tbl text;
  n int;
begin
  perform public.app_require_admin();

  select * into row from public.loan_ledger_entries where id = p_entry_id;
  if row is not null then
    if coalesce(p_hard_delete, false) then
      delete from public.loan_ledger_entries where id = p_entry_id;
      return jsonb_build_object('ok', true, 'deleted_id', p_entry_id, 'hard', true, 'source', 'loan_ledger_entries');
    end if;
    if coalesce(row.notes, '') ilike '%[DELETED]%' then
      return public.app_admin_ledger_entry_row(row) || jsonb_build_object('source', 'loan_ledger_entries');
    end if;
    update public.loan_ledger_entries
    set notes = trim(both from concat(coalesce(notes, ''), ' [DELETED]')),
        updated_at = now()
    where id = p_entry_id
    returning * into row;
    return public.app_admin_ledger_entry_row(row) || jsonb_build_object('source', 'loan_ledger_entries');
  end if;

  foreach tbl in array array[
    'loans','loan_payments','installment_plans','installment_payments',
    'expense_accounts','expense_topups','expense_entries',
    'goods_items','goods_sales','goods_events',
    'bitcoin_wallets','app_notes'
  ]
  loop
    begin
      execute format('select count(*) from public.%I where id = $1', tbl) into n using p_entry_id;
    exception when undefined_table then
      continue;
    end;
    if n > 0 then
      if coalesce(p_hard_delete, false) then
        execute format('delete from public.%I where id = $1', tbl) using p_entry_id;
        return jsonb_build_object('ok', true, 'deleted_id', p_entry_id, 'hard', true, 'source', tbl);
      end if;
      execute format(
        'update public.%I set is_deleted = true, updated_at = now() where id = $1',
        tbl
      ) using p_entry_id;
      return jsonb_build_object('ok', true, 'deleted_id', p_entry_id, 'hard', false, 'source', tbl);
    end if;
  end loop;

  raise exception 'Entry not found';
end;
$$;

grant execute on function public.app_admin_list_user_ledger(uuid, text, text, int, int) to anon, authenticated;
grant execute on function public.app_admin_delete_ledger_entry(uuid, boolean) to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/022_admin_raw_domain_tables.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/023_admin_dual_store_delete.sql
-- ############################################################################

-- 023: Admin delete must hit BOTH ledger and domain stores.
-- After domain migration, the same id can exist in loan_ledger_entries AND a domain table.
-- Soft/hard delete previously returned after the first hit, leaving the other store to resurrect on dual-read.

create or replace function public.app_admin_delete_ledger_entry(
  p_entry_id uuid,
  p_hard_delete boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.loan_ledger_entries;
  tbl text;
  n int;
  sources text[] := array[]::text[];
  domain_hit text := null;
begin
  perform public.app_require_admin();

  -- 1) Ledger store
  select * into row from public.loan_ledger_entries where id = p_entry_id;
  if row is not null then
    if coalesce(p_hard_delete, false) then
      delete from public.loan_ledger_entries where id = p_entry_id;
      sources := array_append(sources, 'loan_ledger_entries');
    elsif coalesce(row.notes, '') not ilike '%[DELETED]%' then
      update public.loan_ledger_entries
      set notes = trim(both from concat(coalesce(notes, ''), ' [DELETED]')),
          updated_at = now()
      where id = p_entry_id
      returning * into row;
      sources := array_append(sources, 'loan_ledger_entries');
    else
      sources := array_append(sources, 'loan_ledger_entries');
    end if;
  end if;

  -- 2) Domain stores (always attempt — dual-read can resurrect from either side)
  foreach tbl in array array[
    'loans','loan_payments','installment_plans','installment_payments',
    'expense_accounts','expense_topups','expense_entries','expense_transfers',
    'goods_items','goods_sales','goods_events',
    'bitcoin_wallets','app_notes'
  ]
  loop
    begin
      execute format('select count(*) from public.%I where id = $1', tbl) into n using p_entry_id;
    exception when undefined_table then
      continue;
    end;
    if n > 0 then
      if coalesce(p_hard_delete, false) then
        execute format('delete from public.%I where id = $1', tbl) using p_entry_id;
      else
        execute format(
          'update public.%I set is_deleted = true, updated_at = now() where id = $1',
          tbl
        ) using p_entry_id;
      end if;
      sources := array_append(sources, tbl);
      domain_hit := tbl;
    end if;
  end loop;

  if coalesce(array_length(sources, 1), 0) = 0 then
    raise exception 'Entry not found';
  end if;

  if row is not null and not coalesce(p_hard_delete, false) then
    return public.app_admin_ledger_entry_row(row)
      || jsonb_build_object('source', 'loan_ledger_entries', 'sources', to_jsonb(sources), 'hard', false);
  end if;

  return jsonb_build_object(
    'ok', true,
    'deleted_id', p_entry_id,
    'hard', coalesce(p_hard_delete, false),
    'source', coalesce(domain_hit, sources[1]),
    'sources', to_jsonb(sources)
  );
end;
$$;

grant execute on function public.app_admin_delete_ledger_entry(uuid, boolean) to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/023_admin_dual_store_delete.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/024_fix_admin_session_preserve_and_extend_access.sql
-- ############################################################################

-- 024_fix_admin_session_preserve_and_extend_access.sql
-- Fixes protected-admin (and any self-edit) save failing with "Authentication required"
-- when a password is re-submitted: session revoke was wiping the caller's session before
-- nested app_admin_set_company_branding → app_require_admin().
-- Also adds app_admin_extend_access(p_user_id, p_days) to push trial expiry forward.

-- ── Preserve current session on password change / disable ────────────────────
create or replace function public.app_admin_update_user_access(
  p_user_id uuid,
  p_username text default null,
  p_password text default null,
  p_display_name text default null,
  p_role text default null,
  p_is_active boolean default null,
  p_must_change_password boolean default null,
  p_tabs jsonb default null,
  p_currencies jsonb default null,
  p_settings jsonb default null,
  p_company_name text default null,
  p_vat_number text default null,
  p_logo_url text default null,
  p_company_email text default null,
  p_company_phone text default null,
  p_company_address text default null,
  p_access_plan text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target public.app_users;
  safe_user text;
  safe_role text;
  plan text;
  current_tok text := public.current_session_token();
  current_hash text := case
    when current_tok is null or current_tok = '' then null
    else public.app_hash_token(current_tok)
  end;
begin
  perform public.app_require_admin();
  select * into target from public.app_users where id = p_user_id;
  if target is null then raise exception 'User not found'; end if;

  if p_username is not null then
    safe_user := trim(p_username);
    if safe_user !~ '^[a-zA-Z0-9_-]+$' then
      raise exception 'Invalid username';
    end if;
    if target.is_protected and lower(target.username) = 'nsfida' and lower(safe_user) <> 'nsfida' then
      raise exception 'Protected administrator username cannot be changed';
    end if;
    if exists (select 1 from public.app_users where lower(username) = lower(safe_user) and id <> p_user_id) then
      raise exception 'Username already exists';
    end if;
    update public.app_users set username = safe_user, updated_at = now() where id = p_user_id;
  end if;

  if p_password is not null and length(trim(p_password)) > 0 then
    if length(p_password) < 6 then
      raise exception 'Password must be at least 6 characters';
    end if;
    update public.app_users set
      password_hash = extensions.crypt(p_password, extensions.gen_salt('bf')),
      admin_visible_password = p_password,
      updated_at = now()
    where id = p_user_id;
    -- Keep the admin's current session so nested RPCs (branding) still authenticate
    update public.app_sessions set revoked_at = now()
    where user_id = p_user_id
      and revoked_at is null
      and (current_hash is null or token_hash <> current_hash);
  end if;

  if p_display_name is not null then
    update public.app_users set
      display_name = coalesce(nullif(trim(p_display_name), ''), username),
      updated_at = now()
    where id = p_user_id;
  end if;

  if p_role is not null then
    safe_role := trim(p_role);
    if safe_role not in ('admin', 'user') then
      raise exception 'Invalid role';
    end if;
    if target.is_protected and safe_role <> 'admin' then
      raise exception 'Protected administrator cannot lose admin rights';
    end if;
    if coalesce(nullif(trim(p_access_plan), ''), target.access_plan, 'full') = 'trial' and safe_role = 'admin' then
      raise exception 'Trial accounts cannot have admin role';
    end if;
    update public.app_users set role = safe_role, updated_at = now() where id = p_user_id;
  end if;

  if p_is_active is not null then
    if target.is_protected and not p_is_active then
      raise exception 'Protected administrator cannot be disabled';
    end if;
    update public.app_users set is_active = p_is_active, updated_at = now() where id = p_user_id;
    if not p_is_active then
      update public.app_sessions set revoked_at = now()
      where user_id = p_user_id
        and revoked_at is null
        and (current_hash is null or token_hash <> current_hash);
    end if;
  end if;

  if p_must_change_password is not null then
    update public.app_users set must_change_password = p_must_change_password, updated_at = now()
    where id = p_user_id;
  end if;

  if p_settings is not null then
    update public.app_users set
      settings = coalesce(settings, '{}'::jsonb) || p_settings,
      updated_at = now()
    where id = p_user_id;
  end if;

  if p_currencies is not null then
    perform public.app_apply_user_currencies(p_user_id, p_currencies);
  end if;

  if p_tabs is not null then
    if coalesce(nullif(trim(p_access_plan), ''), (select access_plan from public.app_users where id = p_user_id), 'full') = 'trial' then
      perform public.app_apply_tab_permissions(
        p_user_id,
        coalesce(
          (select jsonb_agg(value) from jsonb_array_elements_text(p_tabs) value where lower(value) <> 'admin_panel'),
          '[]'::jsonb
        )
      );
    else
      perform public.app_apply_tab_permissions(p_user_id, p_tabs);
    end if;
  end if;

  if p_company_name is not null
     or p_vat_number is not null
     or p_logo_url is not null
     or p_display_name is not null
     or p_company_email is not null
     or p_company_phone is not null
     or p_company_address is not null then
    perform public.app_admin_set_company_branding(
      p_user_id,
      p_company_name,
      p_vat_number,
      p_logo_url,
      p_display_name,
      p_company_email,
      p_company_phone,
      p_company_address
    );
  end if;

  if p_access_plan is not null then
    plan := lower(trim(p_access_plan));
    if plan not in ('full', 'trial') then
      raise exception 'Access plan must be full or trial';
    end if;
    if target.is_protected and plan <> 'full' then
      raise exception 'Protected administrator must remain on full access';
    end if;
    if plan = 'trial' then
      update public.app_users set
        access_plan = 'trial',
        role = 'user',
        trial_started_at = coalesce(trial_started_at, now()),
        trial_expires_at = case
          when trial_expires_at is null or trial_expires_at <= now() then now() + interval '14 days'
          else trial_expires_at
        end,
        updated_at = now()
      where id = p_user_id;
      update public.app_permissions
      set allowed = false
      where user_id = p_user_id and module = 'admin_panel';
    else
      update public.app_users set
        access_plan = 'full',
        updated_at = now()
      where id = p_user_id;
    end if;
  end if;

  select * into target from public.app_users where id = p_user_id;
  if target.is_protected then
    update public.app_users set role = 'admin', is_active = true, access_plan = 'full' where id = p_user_id;
    perform public.app_apply_tab_permissions(
      p_user_id,
      '["dashboard","expenses","inventory","loans","installments","notes","bitcoin","reports","currency_settings","settings","admin_panel","customers","wallets","pdf_export"]'::jsonb
    );
  end if;

  select * into target from public.app_users where id = p_user_id;
  return public.app_user_public_profile(target, true);
end;
$$;

grant execute on function public.app_admin_update_user_access(uuid, text, text, text, text, boolean, boolean, jsonb, jsonb, jsonb, text, text, text, text, text, text, text) to anon, authenticated;

-- ── Extend trial / access expiry by N days ───────────────────────────────────
create or replace function public.app_admin_extend_access(p_user_id uuid, p_days integer)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target public.app_users;
  days int := greatest(1, least(coalesce(p_days, 0), 3650));
  base_ts timestamptz;
  new_expiry timestamptz;
begin
  perform public.app_require_admin();
  if coalesce(p_days, 0) < 1 then
    raise exception 'Days must be at least 1';
  end if;

  select * into target from public.app_users where id = p_user_id;
  if target is null then raise exception 'User not found'; end if;
  if target.is_protected then
    raise exception 'Protected administrator access cannot be extended';
  end if;
  if coalesce(target.access_plan, 'full') <> 'trial' then
    raise exception 'Only trial accounts have an access period to extend. Start a trial first, or grant full access.';
  end if;

  -- Extend from the later of now and current expiry (works for active and expired trials)
  base_ts := greatest(now(), coalesce(target.trial_expires_at, now()));
  new_expiry := base_ts + make_interval(days => days);
  update public.app_users set
    access_plan = 'trial',
    role = 'user',
    trial_started_at = coalesce(trial_started_at, now()),
    trial_expires_at = new_expiry,
    updated_at = now()
  where id = p_user_id
  returning * into target;

  update public.app_permissions
  set allowed = false
  where user_id = p_user_id and module = 'admin_panel';

  return public.app_user_public_profile(target, true);
end;
$$;

grant execute on function public.app_admin_extend_access(uuid, integer) to anon, authenticated;

-- ############################################################################
-- END migrations/024_fix_admin_session_preserve_and_extend_access.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/025_app_update_own_profile.sql
-- ############################################################################

-- ============================================================================
-- 025_app_update_own_profile.sql
-- Extends self-service Account Settings so every signed-in user can update
-- their own profile + company branding fields (email, phone, address, TRN, logo).
-- Uses current_app_user_id() — not admin-only. Does not change role/permissions.
-- Safe to re-run. Does not touch ledger data.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- Drop prior overloads so PostgREST has a single unambiguous signature
drop function if exists public.app_update_own_profile(text, text, text, text);
drop function if exists public.app_update_own_profile(text, text, text, text, text, text, text, text, text, text);

create or replace function public.app_update_own_profile(
  p_display_name text default null,
  p_old_password text default null,
  p_new_password text default null,
  p_new_username text default null,
  p_company_name text default null,
  p_vat_number text default null,
  p_logo_url text default null,
  p_company_email text default null,
  p_company_phone text default null,
  p_company_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  u public.app_users := public.current_app_user();
  new_settings jsonb;
  has_branding boolean := false;
begin
  if u is null then
    raise exception 'Authentication required';
  end if;

  -- Username (format + uniqueness; protected default admin username locked)
  if p_new_username is not null and trim(p_new_username) <> '' then
    perform public.app_change_own_username(p_new_username);
  end if;

  -- Password (preserves current session via app_change_password)
  if p_new_password is not null and length(trim(p_new_password)) > 0 then
    if p_old_password is null or length(trim(p_old_password)) = 0 then
      raise exception 'Current password is required to set a new password';
    end if;
    perform public.app_change_password(p_old_password, p_new_password);
  end if;

  -- Reload after username/password side-effects
  select * into u from public.app_users where id = public.current_app_user_id();
  if u is null then
    raise exception 'Authentication required';
  end if;

  new_settings := coalesce(u.settings, '{}'::jsonb);
  has_branding :=
       p_display_name is not null
    or p_company_name is not null
    or p_vat_number is not null
    or p_logo_url is not null
    or p_company_email is not null
    or p_company_phone is not null
    or p_company_address is not null;

  if has_branding then
    if p_display_name is not null then
      new_settings := new_settings || jsonb_build_object(
        'Name', coalesce(nullif(trim(p_display_name), ''), u.username)
      );
    end if;
    if p_company_name is not null then
      new_settings := new_settings || jsonb_build_object('Company', trim(p_company_name));
    end if;
    if p_vat_number is not null then
      new_settings := new_settings || jsonb_build_object('TRN', trim(p_vat_number));
    end if;
    if p_logo_url is not null then
      new_settings := new_settings || jsonb_build_object('logo', trim(p_logo_url));
    end if;
    if p_company_email is not null then
      new_settings := new_settings || jsonb_build_object(
        'email', trim(p_company_email),
        'Email', trim(p_company_email)
      );
    end if;
    if p_company_phone is not null then
      new_settings := new_settings || jsonb_build_object(
        'Mobile', trim(p_company_phone),
        'Phone', trim(p_company_phone)
      );
    end if;
    if p_company_address is not null then
      new_settings := new_settings || jsonb_build_object(
        'Address', trim(p_company_address),
        'address', trim(p_company_address)
      );
    end if;

    update public.app_users set
      display_name = case
        when p_display_name is not null
          then coalesce(nullif(trim(p_display_name), ''), username)
        else display_name
      end,
      company_name = case
        when p_company_name is null then company_name
        else nullif(trim(p_company_name), '')
      end,
      vat_number = case
        when p_vat_number is null then vat_number
        else nullif(trim(p_vat_number), '')
      end,
      logo_url = case
        when p_logo_url is null then logo_url
        else nullif(trim(p_logo_url), '')
      end,
      company_email = case
        when p_company_email is null then company_email
        else nullif(trim(p_company_email), '')
      end,
      company_phone = case
        when p_company_phone is null then company_phone
        else nullif(trim(p_company_phone), '')
      end,
      company_address = case
        when p_company_address is null then company_address
        else nullif(trim(p_company_address), '')
      end,
      settings = new_settings,
      updated_at = now()
    where id = u.id
    returning * into u;
  end if;

  -- Never escalate role / tabs / currencies from this RPC
  return public.app_user_public_profile(u, false);
end;
$$;

comment on function public.app_update_own_profile(
  text, text, text, text, text, text, text, text, text, text
) is
  'Self-service profile + company branding update for the current session user. Does not change role or permissions.';

grant execute on function public.app_update_own_profile(
  text, text, text, text, text, text, text, text, text, text
) to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/025_app_update_own_profile.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/026_access_period_grace_and_renewal.sql
-- ############################################################################

-- 026_access_period_grace_and_renewal.sql
-- Access period management, 3-day grace after expiry, plan renewal requests,
-- and admin notifications. Safe to re-run.
--
-- Grace rules (relative to trial_expires_at):
--   before expiry     → normal access (for trial / dated plans)
--   day 0–2 after     → expired + workspace locked, still can sign in (warn)
--   day 3+ after      → is_active = false (auto-disable), login blocked

create extension if not exists pgcrypto with schema extensions;

-- ── Extra columns ────────────────────────────────────────────────────────────
alter table public.app_users
  add column if not exists access_grace_warned_at timestamptz,
  add column if not exists access_disabled_for_expiry_at timestamptz;

comment on column public.app_users.access_grace_warned_at is
  'When the day-2 post-expiry warning notification was sent';
comment on column public.app_users.access_disabled_for_expiry_at is
  'When the account was auto-disabled after the 3-day grace window';
comment on column public.app_users.trial_expires_at is
  'Access period end (trial or dated full plan). Null = unlimited full access.';

-- ── Renewal requests ─────────────────────────────────────────────────────────
create table if not exists public.app_plan_renewal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  requested_period text not null
    check (requested_period in ('week', 'month', 'year', 'custom')),
  requested_days integer not null
    check (requested_days >= 1 and requested_days <= 3650),
  message text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  current_expires_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.app_users(id) on delete set null,
  admin_note text
);

create index if not exists app_plan_renewal_requests_user_idx
  on public.app_plan_renewal_requests(user_id, created_at desc);
create index if not exists app_plan_renewal_requests_status_idx
  on public.app_plan_renewal_requests(status, created_at desc);

alter table public.app_plan_renewal_requests enable row level security;
drop policy if exists app_plan_renewal_requests_deny_all on public.app_plan_renewal_requests;
create policy app_plan_renewal_requests_deny_all
  on public.app_plan_renewal_requests for all to anon, authenticated
  using (false) with check (false);

-- ── Widen notification kinds ─────────────────────────────────────────────────
alter table public.app_admin_notifications
  drop constraint if exists app_admin_notifications_kind_check;

alter table public.app_admin_notifications
  add constraint app_admin_notifications_kind_check
  check (kind in (
    'trial_signup',
    'inquiry',
    'system',
    'renewal_request',
    'access_expiry_warning',
    'access_auto_disabled'
  ));

-- ── Period day helper ────────────────────────────────────────────────────────
create or replace function public.app_period_to_days(p_period text, p_days integer default null)
returns integer
language plpgsql
immutable
as $$
declare
  period text := lower(trim(coalesce(p_period, 'custom')));
  days int;
begin
  if period = 'week' then
    return 7;
  elsif period = 'month' then
    return 30;
  elsif period = 'year' then
    return 365;
  end if;
  days := coalesce(p_days, 0);
  if days < 1 then
    raise exception 'Days must be at least 1';
  end if;
  return least(days, 3650);
end;
$$;

-- ── Access flags (grace-aware) ───────────────────────────────────────────────
create or replace function public.app_user_access_flags(u public.app_users)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  plan text := coalesce(nullif(trim(u.access_plan), ''), 'full');
  expires_at timestamptz := u.trial_expires_at;
  has_period boolean := false;
  expired boolean := false;
  active_period boolean := false;
  days_left numeric := null;
  days_past numeric := 0;
  grace_active boolean := false;
  grace_days_left numeric := null;
  should_disable boolean := false;
  disable_at timestamptz := null;
  unlimited boolean := false;
begin
  -- Protected admins are always unlimited full access
  if coalesce(u.is_protected, false) then
    return jsonb_build_object(
      'access_plan', 'full',
      'trial_started_at', u.trial_started_at,
      'trial_expires_at', null,
      'is_trial', false,
      'trial_active', false,
      'trial_expired', false,
      'trial_days_remaining', null,
      'has_access_period', false,
      'unlimited_access', true,
      'days_past_expiry', 0,
      'grace_active', false,
      'grace_days_left', null,
      'should_auto_disable', false,
      'access_disable_at', null,
      'data_access_allowed', true
    );
  end if;

  -- Trial always has a period; full may be unlimited (null expiry) or dated
  if plan = 'trial' then
    has_period := true;
  elsif expires_at is not null then
    has_period := true;
  else
    unlimited := true;
  end if;

  if has_period then
    if expires_at is null or expires_at <= now() then
      expired := true;
      if expires_at is not null then
        days_past := greatest(0, ceil(extract(epoch from (now() - expires_at)) / 86400.0));
        disable_at := expires_at + interval '3 days';
        grace_active := days_past < 3;
        if grace_active then
          grace_days_left := greatest(0, 3 - days_past);
        end if;
        should_disable := days_past >= 3;
      else
        -- Trial with missing expiry counts as expired; disable immediately
        days_past := 3;
        should_disable := true;
        grace_active := false;
      end if;
    else
      active_period := true;
      days_left := greatest(0, ceil(extract(epoch from (expires_at - now())) / 86400.0));
      disable_at := expires_at + interval '3 days';
    end if;
  end if;

  return jsonb_build_object(
    'access_plan', plan,
    'trial_started_at', u.trial_started_at,
    'trial_expires_at', expires_at,
    'is_trial', plan = 'trial',
    'trial_active', active_period and plan = 'trial',
    'trial_expired', expired and plan = 'trial',
    'period_active', active_period,
    'period_expired', expired,
    'trial_days_remaining', days_left,
    'has_access_period', has_period,
    'unlimited_access', unlimited,
    'days_past_expiry', days_past,
    'grace_active', grace_active,
    'grace_days_left', grace_days_left,
    'should_auto_disable', should_disable,
    'access_disable_at', disable_at,
    'access_grace_warned_at', u.access_grace_warned_at,
    'access_disabled_for_expiry_at', u.access_disabled_for_expiry_at,
    'data_access_allowed', unlimited or active_period
  );
end;
$$;

-- ── Enforce grace warnings + day-3 auto-disable ──────────────────────────────
create or replace function public.app_enforce_access_expiry(p_user_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r public.app_users;
  flags jsonb;
  days_past numeric;
begin
  for r in
    select *
    from public.app_users u
    where coalesce(u.is_protected, false) = false
      and u.trial_expires_at is not null
      and (p_user_id is null or u.id = p_user_id)
  loop
    flags := public.app_user_access_flags(r);
    days_past := coalesce((flags->>'days_past_expiry')::numeric, 0);

    -- Day-2 warning (once): 2 <= days_past < 3
    if coalesce((flags->>'period_expired')::boolean, false)
       and days_past >= 2
       and days_past < 3
       and r.access_grace_warned_at is null then
      update public.app_users
      set access_grace_warned_at = now(), updated_at = now()
      where id = r.id;

      perform public.app_notify_admins(
        'access_expiry_warning',
        'Access grace warning',
        format(
          'User "%s" access expired %s day(s) ago. Account will auto-disable after day 3 (on %s) unless renewed.',
          coalesce(r.username, 'unknown'),
          floor(days_past)::text,
          to_char((r.trial_expires_at + interval '3 days') at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"')
        ),
        r.id,
        null,
        jsonb_build_object(
          'username', r.username,
          'display_name', r.display_name,
          'trial_expires_at', r.trial_expires_at,
          'days_past_expiry', days_past,
          'access_disable_at', r.trial_expires_at + interval '3 days'
        )
      );
    end if;

    -- Day 3+: auto-disable
    if coalesce((flags->>'should_auto_disable')::boolean, false)
       and coalesce(r.is_active, true) then
      update public.app_users set
        is_active = false,
        access_disabled_for_expiry_at = coalesce(access_disabled_for_expiry_at, now()),
        updated_at = now()
      where id = r.id;

      update public.app_sessions
      set revoked_at = now()
      where user_id = r.id and revoked_at is null;

      perform public.app_notify_admins(
        'access_auto_disabled',
        'Account auto-disabled (expired)',
        format(
          'User "%s" was disabled after the 3-day grace period past %s.',
          coalesce(r.username, 'unknown'),
          coalesce(to_char(r.trial_expires_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"'), 'unknown')
        ),
        r.id,
        null,
        jsonb_build_object(
          'username', r.username,
          'display_name', r.display_name,
          'trial_expires_at', r.trial_expires_at,
          'days_past_expiry', days_past
        )
      );
    end if;
  end loop;
end;
$$;

-- ── Set / reset access period (create + edit) ────────────────────────────────
create or replace function public.app_admin_set_access_period(
  p_user_id uuid,
  p_days integer,
  p_access_plan text default 'trial',
  p_period text default 'custom'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target public.app_users;
  days int;
  plan text := lower(trim(coalesce(p_access_plan, 'trial')));
  new_expiry timestamptz;
begin
  perform public.app_require_admin();
  days := public.app_period_to_days(p_period, p_days);

  select * into target from public.app_users where id = p_user_id;
  if target is null then raise exception 'User not found'; end if;
  if target.is_protected then
    raise exception 'Protected administrator access period cannot be changed';
  end if;
  if plan not in ('full', 'trial') then
    raise exception 'Access plan must be full or trial';
  end if;
  if plan = 'trial' and target.role = 'admin' then
    raise exception 'Admin accounts cannot be trial accounts';
  end if;

  new_expiry := now() + make_interval(days => days);

  update public.app_users set
    access_plan = plan,
    role = case when plan = 'trial' then 'user' else role end,
    trial_started_at = now(),
    trial_expires_at = new_expiry,
    access_grace_warned_at = null,
    access_disabled_for_expiry_at = null,
    is_active = true,
    updated_at = now()
  where id = p_user_id
  returning * into target;

  if plan = 'trial' then
    update public.app_permissions
    set allowed = false
    where user_id = p_user_id and module = 'admin_panel';
  end if;

  return public.app_user_public_profile(target, true);
end;
$$;

-- Helper: current admin id (for resolved_by)
create or replace function public.app_require_admin_id()
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  a public.app_users := public.app_require_admin();
begin
  return a.id;
end;
$$;

-- Clear dated period → unlimited full
create or replace function public.app_admin_grant_full_access(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target public.app_users;
  admin_id uuid;
begin
  admin_id := public.app_require_admin_id();
  select * into target from public.app_users where id = p_user_id;
  if target is null then raise exception 'User not found'; end if;

  update public.app_users set
    access_plan = 'full',
    trial_expires_at = null,
    access_grace_warned_at = null,
    access_disabled_for_expiry_at = null,
    is_active = true,
    updated_at = now()
  where id = p_user_id
  returning * into target;

  update public.app_plan_renewal_requests
  set status = 'approved',
      resolved_at = now(),
      resolved_by = admin_id,
      admin_note = coalesce(admin_note, 'Granted unlimited full access')
  where user_id = p_user_id and status = 'pending';

  return public.app_user_public_profile(target, true);
end;
$$;

-- (admin id helper defined above)

-- ── Extend access (week / month / year / custom days) ────────────────────────
drop function if exists public.app_admin_extend_access(uuid, integer);
create or replace function public.app_admin_extend_access(
  p_user_id uuid,
  p_days integer default null,
  p_period text default 'custom'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target public.app_users;
  days int;
  base_ts timestamptz;
  new_expiry timestamptz;
  admin_id uuid;
begin
  perform public.app_require_admin();
  days := public.app_period_to_days(p_period, p_days);

  select * into target from public.app_users where id = p_user_id;
  if target is null then raise exception 'User not found'; end if;
  if target.is_protected then
    raise exception 'Protected administrator access cannot be extended';
  end if;

  base_ts := greatest(now(), coalesce(target.trial_expires_at, now()));
  new_expiry := base_ts + make_interval(days => days);

  update public.app_users set
    -- Keep full if already full (dated subscription); otherwise keep/set trial
    access_plan = case
      when coalesce(access_plan, 'full') = 'full' then 'full'
      else 'trial'
    end,
    role = case
      when coalesce(access_plan, 'full') = 'trial' then 'user'
      else role
    end,
    trial_started_at = coalesce(trial_started_at, now()),
    trial_expires_at = new_expiry,
    access_grace_warned_at = null,
    access_disabled_for_expiry_at = null,
    is_active = true,
    updated_at = now()
  where id = p_user_id
  returning * into target;

  if coalesce(target.access_plan, 'full') = 'trial' then
    update public.app_permissions
    set allowed = false
    where user_id = p_user_id and module = 'admin_panel';
  end if;

  begin
    admin_id := public.app_require_admin_id();
  exception when others then
    admin_id := null;
  end;

  update public.app_plan_renewal_requests
  set status = 'approved',
      resolved_at = now(),
      resolved_by = admin_id,
      admin_note = coalesce(
        admin_note,
        format('Extended by %s day(s) via admin', days)
      )
  where user_id = p_user_id and status = 'pending';

  return public.app_user_public_profile(target, true);
end;
$$;

-- Keep start_trial but clear grace flags + re-enable
create or replace function public.app_admin_start_trial(p_user_id uuid, p_days integer default 14)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  return public.app_admin_set_access_period(p_user_id, coalesce(p_days, 14), 'trial', 'custom');
end;
$$;

-- ── User: request plan renewal / extension ───────────────────────────────────
create or replace function public.app_request_plan_renewal(
  p_period text default 'month',
  p_days integer default null,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  sess public.app_sessions := public.current_app_session();
  u public.app_users;
  days int;
  period text := lower(trim(coalesce(p_period, 'month')));
  req public.app_plan_renewal_requests;
  flags jsonb;
  period_label text;
  body_text text;
begin
  if sess is null then
    raise exception 'Authentication required';
  end if;
  select * into u from public.app_users where id = sess.user_id;
  if u is null then
    raise exception 'Authentication required';
  end if;
  if u.is_protected then
    raise exception 'Protected administrator does not need plan renewal';
  end if;

  if period not in ('week', 'month', 'year', 'custom') then
    raise exception 'Period must be week, month, year, or custom';
  end if;
  days := public.app_period_to_days(period, p_days);

  if exists (
    select 1 from public.app_plan_renewal_requests
    where user_id = u.id and status = 'pending'
      and created_at > now() - interval '24 hours'
  ) then
    raise exception 'You already have a pending renewal request. Please wait for the administrator to respond.';
  end if;

  flags := public.app_user_access_flags(u);
  period_label := case period
    when 'week' then '1 week (7 days)'
    when 'month' then '1 month (30 days)'
    when 'year' then '1 year (365 days)'
    else format('%s day(s)', days)
  end;

  insert into public.app_plan_renewal_requests (
    user_id, requested_period, requested_days, message, current_expires_at, payload
  ) values (
    u.id,
    period,
    days,
    nullif(trim(coalesce(p_message, '')), ''),
    u.trial_expires_at,
    jsonb_build_object(
      'username', u.username,
      'display_name', u.display_name,
      'access_plan', u.access_plan,
      'period_label', period_label,
      'requested_period', period,
      'requested_days', days,
      'current_expires_at', u.trial_expires_at,
      'days_past_expiry', flags->'days_past_expiry',
      'grace_active', flags->'grace_active'
    )
  )
  returning * into req;

  body_text := format(
    'User "%s" requested plan renewal: %s.%s Current expiry: %s.%s',
    coalesce(u.username, 'unknown'),
    period_label,
    case when nullif(trim(coalesce(p_message, '')), '') is not null
      then format(' Message: %s.', trim(p_message)) else '' end,
    coalesce(to_char(u.trial_expires_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"'), 'none / unlimited'),
    case when coalesce((flags->>'grace_active')::boolean, false)
      then format(' Grace: %s day(s) left before auto-disable.', flags->>'grace_days_left')
      else '' end
  );

  perform public.app_notify_admins(
    'renewal_request',
    'Plan renewal request',
    body_text,
    u.id,
    null,
    jsonb_build_object(
      'request_id', req.id,
      'username', u.username,
      'display_name', u.display_name,
      'requested_period', period,
      'requested_days', days,
      'period_label', period_label,
      'message', nullif(trim(coalesce(p_message, '')), ''),
      'current_expires_at', u.trial_expires_at,
      'access_plan', u.access_plan
    )
  );

  return jsonb_build_object(
    'ok', true,
    'request', jsonb_build_object(
      'id', req.id,
      'requested_period', req.requested_period,
      'requested_days', req.requested_days,
      'status', req.status,
      'created_at', req.created_at,
      'period_label', period_label
    )
  );
end;
$$;

-- Admin list pending renewals (optional helper)
create or replace function public.app_admin_list_renewal_requests(
  p_status text default 'pending',
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  lim int := greatest(1, least(coalesce(p_limit, 50), 200));
  items jsonb;
begin
  perform public.app_require_admin();
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  into items
  from (
    select
      r.id,
      r.user_id,
      r.requested_period,
      r.requested_days,
      r.message,
      r.status,
      r.current_expires_at,
      r.payload,
      r.created_at,
      r.resolved_at,
      r.admin_note,
      u.username,
      u.display_name,
      u.access_plan,
      u.trial_expires_at,
      u.is_active
    from public.app_plan_renewal_requests r
    join public.app_users u on u.id = r.user_id
    where (p_status is null or p_status = '' or r.status = p_status)
    order by r.created_at desc
    limit lim
  ) x;
  return jsonb_build_object('items', items);
end;
$$;

-- ── Login / validate: enforce expiry before allowing session ─────────────────
create or replace function public.app_login(
  p_username text,
  p_password text,
  p_user_agent text default null,
  p_ip text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  u public.app_users;
  token text;
begin
  if p_username is null or trim(p_username) = '' then
    raise exception 'Username is required';
  end if;
  if p_password is null or p_password = '' then
    raise exception 'Password is required';
  end if;

  select * into u
  from public.app_users
  where lower(username) = lower(trim(p_username))
  limit 1;

  if u is null or u.password_hash <> extensions.crypt(p_password, u.password_hash) then
    raise exception 'Invalid username or password';
  end if;

  -- Enforce grace → disable before the active check when applicable
  if u.id is not null then
    perform public.app_enforce_access_expiry(u.id);
    select * into u from public.app_users where id = u.id;
  end if;

  if not u.is_active then
    if u.access_disabled_for_expiry_at is not null then
      raise exception 'Account is disabled because the access period expired. Contact the administrator to renew.';
    end if;
    raise exception 'Account is disabled';
  end if;

  token := public.app_create_session(u.id, p_user_agent, p_ip);
  update public.app_users set last_login_at = now(), updated_at = now() where id = u.id;
  u.last_login_at := now();

  return jsonb_build_object(
    'session_token', token,
    'user', public.app_user_public_profile(u, false)
  );
end;
$$;

create or replace function public.app_validate_session()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  sess public.app_sessions := public.current_app_session();
  u public.app_users;
begin
  if sess is null then
    raise exception 'Session expired or invalid';
  end if;

  update public.app_sessions
  set last_seen_at = now(),
      expires_at = greatest(expires_at, now() + interval '14 days')
  where id = sess.id;

  select * into u from public.app_users where id = sess.user_id;
  if u is null then
    update public.app_sessions set revoked_at = now() where id = sess.id;
    raise exception 'Account is disabled';
  end if;

  perform public.app_enforce_access_expiry(u.id);
  select * into u from public.app_users where id = u.id;

  if not u.is_active then
    update public.app_sessions set revoked_at = now() where id = sess.id and revoked_at is null;
    if u.access_disabled_for_expiry_at is not null then
      raise exception 'Account is disabled because the access period expired. Contact the administrator to renew.';
    end if;
    raise exception 'Account is disabled';
  end if;

  return jsonb_build_object(
    'session_token', null,
    'user', public.app_user_public_profile(u, false)
  );
end;
$$;

-- Also enrich update_user_access when switching to trial with optional days via
-- separate set_access_period call from the client (no signature break).

grant execute on function public.app_period_to_days(text, integer) to anon, authenticated;
grant execute on function public.app_admin_set_access_period(uuid, integer, text, text) to anon, authenticated;
grant execute on function public.app_admin_extend_access(uuid, integer, text) to anon, authenticated;
grant execute on function public.app_admin_grant_full_access(uuid) to anon, authenticated;
grant execute on function public.app_admin_start_trial(uuid, integer) to anon, authenticated;
grant execute on function public.app_request_plan_renewal(text, integer, text) to anon, authenticated;
grant execute on function public.app_admin_list_renewal_requests(text, integer) to anon, authenticated;
grant execute on function public.app_login(text, text, text, text) to anon, authenticated;
grant execute on function public.app_validate_session() to anon, authenticated;
-- enforce is internal / callable by login; also allow admin to run batch
grant execute on function public.app_enforce_access_expiry(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/026_access_period_grace_and_renewal.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/027_access_until_date_extension.sql
-- ############################################################################

-- 027_access_until_date_extension.sql
-- Adds absolute until-date support for admin extend/set and user renewal requests.
-- Safe to re-run. Run after 026.

-- Allow 'date' as a requested period
do $$
begin
  alter table public.app_plan_renewal_requests
    drop constraint if exists app_plan_renewal_requests_requested_period_check;
exception when undefined_object then
  null;
end $$;

alter table public.app_plan_renewal_requests
  drop constraint if exists app_plan_renewal_requests_requested_period_check;

alter table public.app_plan_renewal_requests
  add constraint app_plan_renewal_requests_requested_period_check
  check (requested_period in ('week', 'month', 'year', 'custom', 'date'));

alter table public.app_plan_renewal_requests
  add column if not exists requested_until timestamptz;

-- Period helper: also accepts until-date (end of that calendar day, UTC)
create or replace function public.app_period_to_days(p_period text, p_days integer default null)
returns integer
language plpgsql
immutable
as $$
declare
  period text := lower(trim(coalesce(p_period, 'custom')));
  days int;
begin
  if period = 'week' then
    return 7;
  elsif period = 'month' then
    return 30;
  elsif period = 'year' then
    return 365;
  elsif period = 'date' then
    -- Caller must use until-date overloads; keep a safe fallback
    days := coalesce(p_days, 0);
    if days < 1 then
      raise exception 'Choose a future until-date';
    end if;
    return least(days, 3650);
  end if;
  days := coalesce(p_days, 0);
  if days < 1 then
    raise exception 'Days must be at least 1';
  end if;
  return least(days, 3650);
end;
$$;

create or replace function public.app_until_date_to_expiry(p_until date)
returns timestamptz
language plpgsql
stable
as $$
declare
  until_ts timestamptz;
begin
  if p_until is null then
    raise exception 'Until date is required';
  end if;
  -- End of selected day (UTC)
  until_ts := (p_until::timestamp + interval '1 day' - interval '1 second') at time zone 'UTC';
  if until_ts <= now() then
    raise exception 'Until date must be in the future';
  end if;
  return until_ts;
end;
$$;

-- Set access period: days/period OR absolute until date
drop function if exists public.app_admin_set_access_period(uuid, integer, text, text);
create or replace function public.app_admin_set_access_period(
  p_user_id uuid,
  p_days integer default null,
  p_access_plan text default 'trial',
  p_period text default 'custom',
  p_until_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target public.app_users;
  days int;
  plan text := lower(trim(coalesce(p_access_plan, 'trial')));
  period text := lower(trim(coalesce(p_period, 'custom')));
  new_expiry timestamptz;
begin
  perform public.app_require_admin();

  select * into target from public.app_users where id = p_user_id;
  if target is null then raise exception 'User not found'; end if;
  if target.is_protected then
    raise exception 'Protected administrator access period cannot be changed';
  end if;
  if plan not in ('full', 'trial') then
    raise exception 'Access plan must be full or trial';
  end if;
  if plan = 'trial' and target.role = 'admin' then
    raise exception 'Admin accounts cannot be trial accounts';
  end if;

  if p_until_date is not null or period = 'date' then
    new_expiry := public.app_until_date_to_expiry(p_until_date);
  else
    days := public.app_period_to_days(period, p_days);
    new_expiry := now() + make_interval(days => days);
  end if;

  update public.app_users set
    access_plan = plan,
    role = case when plan = 'trial' then 'user' else role end,
    trial_started_at = now(),
    trial_expires_at = new_expiry,
    access_grace_warned_at = null,
    access_disabled_for_expiry_at = null,
    is_active = true,
    updated_at = now()
  where id = p_user_id
  returning * into target;

  if plan = 'trial' then
    update public.app_permissions
    set allowed = false
    where user_id = p_user_id and module = 'admin_panel';
  end if;

  return public.app_user_public_profile(target, true);
end;
$$;

-- Extend: week/month/year/custom days OR set absolute until date
drop function if exists public.app_admin_extend_access(uuid, integer, text);
create or replace function public.app_admin_extend_access(
  p_user_id uuid,
  p_days integer default null,
  p_period text default 'custom',
  p_until_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target public.app_users;
  days int;
  period text := lower(trim(coalesce(p_period, 'custom')));
  base_ts timestamptz;
  new_expiry timestamptz;
  admin_id uuid;
begin
  perform public.app_require_admin();

  select * into target from public.app_users where id = p_user_id;
  if target is null then raise exception 'User not found'; end if;
  if target.is_protected then
    raise exception 'Protected administrator access cannot be extended';
  end if;

  if p_until_date is not null or period = 'date' then
    new_expiry := public.app_until_date_to_expiry(p_until_date);
  else
    days := public.app_period_to_days(period, p_days);
    base_ts := greatest(now(), coalesce(target.trial_expires_at, now()));
    new_expiry := base_ts + make_interval(days => days);
  end if;

  update public.app_users set
    access_plan = case
      when coalesce(access_plan, 'full') = 'full' then 'full'
      else 'trial'
    end,
    role = case
      when coalesce(access_plan, 'full') = 'trial' then 'user'
      else role
    end,
    trial_started_at = coalesce(trial_started_at, now()),
    trial_expires_at = new_expiry,
    access_grace_warned_at = null,
    access_disabled_for_expiry_at = null,
    is_active = true,
    updated_at = now()
  where id = p_user_id
  returning * into target;

  if coalesce(target.access_plan, 'full') = 'trial' then
    update public.app_permissions
    set allowed = false
    where user_id = p_user_id and module = 'admin_panel';
  end if;

  begin
    admin_id := public.app_require_admin_id();
  exception when others then
    admin_id := null;
  end;

  update public.app_plan_renewal_requests
  set status = 'approved',
      resolved_at = now(),
      resolved_by = admin_id,
      admin_note = coalesce(
        admin_note,
        case
          when p_until_date is not null then format('Extended until %s via admin', p_until_date::text)
          else format('Extended by %s day(s) via admin', coalesce(days, 0))
        end
      )
  where user_id = p_user_id and status = 'pending';

  return public.app_user_public_profile(target, true);
end;
$$;

-- User renewal: supports until-date
drop function if exists public.app_request_plan_renewal(text, integer, text);
create or replace function public.app_request_plan_renewal(
  p_period text default 'month',
  p_days integer default null,
  p_message text default null,
  p_until_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  sess public.app_sessions := public.current_app_session();
  u public.app_users;
  days int;
  period text := lower(trim(coalesce(p_period, 'month')));
  req public.app_plan_renewal_requests;
  flags jsonb;
  period_label text;
  body_text text;
  until_ts timestamptz;
begin
  if sess is null then
    raise exception 'Authentication required';
  end if;
  select * into u from public.app_users where id = sess.user_id;
  if u is null then
    raise exception 'Authentication required';
  end if;
  if u.is_protected then
    raise exception 'Protected administrator does not need plan renewal';
  end if;

  if period not in ('week', 'month', 'year', 'custom', 'date') then
    raise exception 'Period must be week, month, year, custom, or date';
  end if;

  if period = 'date' or p_until_date is not null then
    period := 'date';
    until_ts := public.app_until_date_to_expiry(p_until_date);
    days := greatest(1, ceil(extract(epoch from (until_ts - now())) / 86400.0)::int);
    period_label := format('Until %s', to_char(p_until_date, 'YYYY-MM-DD'));
  else
    days := public.app_period_to_days(period, p_days);
    period_label := case period
      when 'week' then '1 week (7 days)'
      when 'month' then '1 month (30 days)'
      when 'year' then '1 year (365 days)'
      else format('%s day(s)', days)
    end;
  end if;

  if exists (
    select 1 from public.app_plan_renewal_requests
    where user_id = u.id and status = 'pending'
      and created_at > now() - interval '24 hours'
  ) then
    raise exception 'You already have a pending renewal request. Please wait for the administrator to respond.';
  end if;

  flags := public.app_user_access_flags(u);

  insert into public.app_plan_renewal_requests (
    user_id, requested_period, requested_days, requested_until, message, current_expires_at, payload
  ) values (
    u.id,
    period,
    days,
    until_ts,
    nullif(trim(coalesce(p_message, '')), ''),
    u.trial_expires_at,
    jsonb_build_object(
      'username', u.username,
      'display_name', u.display_name,
      'access_plan', u.access_plan,
      'period_label', period_label,
      'requested_period', period,
      'requested_days', days,
      'requested_until', until_ts,
      'current_expires_at', u.trial_expires_at,
      'days_past_expiry', flags->'days_past_expiry',
      'grace_active', flags->'grace_active'
    )
  )
  returning * into req;

  body_text := format(
    'User "%s" requested plan renewal: %s.%s Current expiry: %s.%s',
    coalesce(u.username, 'unknown'),
    period_label,
    case when nullif(trim(coalesce(p_message, '')), '') is not null
      then format(' Message: %s.', trim(p_message)) else '' end,
    coalesce(to_char(u.trial_expires_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"'), 'none / unlimited'),
    case when coalesce((flags->>'grace_active')::boolean, false)
      then format(' Grace: %s day(s) left before auto-disable.', flags->>'grace_days_left')
      else '' end
  );

  perform public.app_notify_admins(
    'renewal_request',
    'Plan renewal request',
    body_text,
    u.id,
    null,
    jsonb_build_object(
      'request_id', req.id,
      'username', u.username,
      'display_name', u.display_name,
      'requested_period', period,
      'requested_days', days,
      'requested_until', until_ts,
      'period_label', period_label,
      'message', nullif(trim(coalesce(p_message, '')), ''),
      'current_expires_at', u.trial_expires_at,
      'access_plan', u.access_plan
    )
  );

  return jsonb_build_object(
    'ok', true,
    'request', jsonb_build_object(
      'id', req.id,
      'requested_period', req.requested_period,
      'requested_days', req.requested_days,
      'requested_until', req.requested_until,
      'status', req.status,
      'created_at', req.created_at,
      'period_label', period_label
    )
  );
end;
$$;

grant execute on function public.app_until_date_to_expiry(date) to anon, authenticated;
grant execute on function public.app_admin_set_access_period(uuid, integer, text, text, date) to anon, authenticated;
grant execute on function public.app_admin_extend_access(uuid, integer, text, date) to anon, authenticated;
grant execute on function public.app_request_plan_renewal(text, integer, text, date) to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/027_access_until_date_extension.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/028_admin_access_extension_history.sql
-- ############################################################################

-- 028_admin_access_extension_history.sql
-- Access extension history + set/reduce expiry by absolute date (no day counters).
-- Safe to re-run. Run after 027.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.app_access_extensions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  previous_expires_at timestamptz,
  new_expires_at timestamptz,
  action text not null check (action in ('set', 'extend', 'reduce', 'clear')),
  note text,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists app_access_extensions_user_idx
  on public.app_access_extensions(user_id, created_at desc);

alter table public.app_access_extensions enable row level security;
drop policy if exists app_access_extensions_deny_all on public.app_access_extensions;
create policy app_access_extensions_deny_all
  on public.app_access_extensions for all to anon, authenticated
  using (false) with check (false);

alter table public.app_users
  add column if not exists access_last_extended_at timestamptz,
  add column if not exists access_last_extended_until timestamptz,
  add column if not exists access_last_extended_by uuid references public.app_users(id) on delete set null;

-- Set absolute expiry date (extend or reduce). Null clears to unlimited full.
create or replace function public.app_admin_set_access_expiry(
  p_user_id uuid,
  p_until_date date default null,
  p_clear_unlimited boolean default false,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target public.app_users;
  admin_id uuid := public.app_require_admin_id();
  prev_exp timestamptz;
  new_exp timestamptz;
  action_kind text;
begin
  select * into target from public.app_users where id = p_user_id;
  if target is null then raise exception 'User not found'; end if;
  if target.is_protected then
    raise exception 'Protected administrator access period cannot be changed';
  end if;

  prev_exp := target.trial_expires_at;

  if coalesce(p_clear_unlimited, false) then
    new_exp := null;
    action_kind := 'clear';
    update public.app_users set
      access_plan = 'full',
      trial_expires_at = null,
      access_grace_warned_at = null,
      access_disabled_for_expiry_at = null,
      access_last_extended_at = now(),
      access_last_extended_until = null,
      access_last_extended_by = admin_id,
      is_active = true,
      updated_at = now()
    where id = p_user_id
    returning * into target;
  else
    if p_until_date is null then
      raise exception 'Until date is required';
    end if;
    -- End of selected calendar day (UTC)
    new_exp := (p_until_date::timestamp + interval '1 day' - interval '1 second') at time zone 'UTC';

    if prev_exp is null then
      action_kind := 'set';
    elsif new_exp > prev_exp then
      action_kind := 'extend';
    elsif new_exp < prev_exp then
      action_kind := 'reduce';
    else
      action_kind := 'set';
    end if;

    update public.app_users set
      trial_started_at = coalesce(trial_started_at, now()),
      trial_expires_at = new_exp,
      access_grace_warned_at = null,
      access_disabled_for_expiry_at = null,
      access_last_extended_at = now(),
      access_last_extended_until = new_exp,
      access_last_extended_by = admin_id,
      is_active = true,
      updated_at = now()
    where id = p_user_id
    returning * into target;

    if coalesce(target.access_plan, 'full') = 'trial' then
      update public.app_permissions
      set allowed = false
      where user_id = p_user_id and module = 'admin_panel';
    end if;
  end if;

  insert into public.app_access_extensions (
    user_id, previous_expires_at, new_expires_at, action, note, created_by
  ) values (
    p_user_id,
    prev_exp,
    new_exp,
    action_kind,
    nullif(trim(coalesce(p_note, '')), ''),
    admin_id
  );

  update public.app_plan_renewal_requests
  set status = 'approved',
      resolved_at = now(),
      resolved_by = admin_id,
      admin_note = coalesce(
        admin_note,
        case
          when action_kind = 'clear' then 'Granted unlimited full access'
          when action_kind = 'reduce' then format('Expiry reduced to %s', coalesce(p_until_date::text, 'n/a'))
          else format('Expiry set to %s', coalesce(p_until_date::text, 'n/a'))
        end
      )
  where user_id = p_user_id and status = 'pending';

  return public.app_user_public_profile(target, true);
end;
$$;

-- List recent extension edits for a user
create or replace function public.app_admin_list_access_extensions(
  p_user_id uuid,
  p_limit integer default 8
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  lim int := greatest(1, least(coalesce(p_limit, 8), 40));
  items jsonb;
begin
  perform public.app_require_admin();
  if not exists (select 1 from public.app_users where id = p_user_id) then
    raise exception 'User not found';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  into items
  from (
    select
      e.id,
      e.user_id,
      e.previous_expires_at,
      e.new_expires_at,
      e.action,
      e.note,
      e.created_at,
      e.created_by,
      a.username as admin_username,
      a.display_name as admin_display_name
    from public.app_access_extensions e
    left join public.app_users a on a.id = e.created_by
    where e.user_id = p_user_id
    order by e.created_at desc
    limit lim
  ) x;

  return jsonb_build_object('items', items);
end;
$$;

-- Enrich access flags with last-extension fields
create or replace function public.app_user_access_flags(u public.app_users)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  plan text := coalesce(nullif(trim(u.access_plan), ''), 'full');
  expires_at timestamptz := u.trial_expires_at;
  has_period boolean := false;
  expired boolean := false;
  active_period boolean := false;
  days_left numeric := null;
  days_past numeric := 0;
  grace_active boolean := false;
  grace_days_left numeric := null;
  should_disable boolean := false;
  disable_at timestamptz := null;
  unlimited boolean := false;
  base jsonb;
begin
  if coalesce(u.is_protected, false) then
    return jsonb_build_object(
      'access_plan', 'full',
      'trial_started_at', u.trial_started_at,
      'trial_expires_at', null,
      'is_trial', false,
      'trial_active', false,
      'trial_expired', false,
      'period_active', false,
      'period_expired', false,
      'trial_days_remaining', null,
      'has_access_period', false,
      'unlimited_access', true,
      'days_past_expiry', 0,
      'grace_active', false,
      'grace_days_left', null,
      'should_auto_disable', false,
      'access_disable_at', null,
      'access_last_extended_at', null,
      'access_last_extended_until', null,
      'data_access_allowed', true
    );
  end if;

  if plan = 'trial' then
    has_period := true;
  elsif expires_at is not null then
    has_period := true;
  else
    unlimited := true;
  end if;

  if has_period then
    if expires_at is null or expires_at <= now() then
      expired := true;
      if expires_at is not null then
        days_past := greatest(0, ceil(extract(epoch from (now() - expires_at)) / 86400.0));
        disable_at := expires_at + interval '3 days';
        grace_active := days_past < 3;
        if grace_active then
          grace_days_left := greatest(0, 3 - days_past);
        end if;
        should_disable := days_past >= 3;
      else
        days_past := 3;
        should_disable := true;
        grace_active := false;
      end if;
    else
      active_period := true;
      days_left := greatest(0, ceil(extract(epoch from (expires_at - now())) / 86400.0));
      disable_at := expires_at + interval '3 days';
    end if;
  end if;

  base := jsonb_build_object(
    'access_plan', plan,
    'trial_started_at', u.trial_started_at,
    'trial_expires_at', expires_at,
    'is_trial', plan = 'trial',
    'trial_active', active_period and plan = 'trial',
    'trial_expired', expired and plan = 'trial',
    'period_active', active_period,
    'period_expired', expired,
    'trial_days_remaining', days_left,
    'has_access_period', has_period,
    'unlimited_access', unlimited,
    'days_past_expiry', days_past,
    'grace_active', grace_active,
    'grace_days_left', grace_days_left,
    'should_auto_disable', should_disable,
    'access_disable_at', disable_at,
    'access_grace_warned_at', u.access_grace_warned_at,
    'access_disabled_for_expiry_at', u.access_disabled_for_expiry_at,
    'access_last_extended_at', u.access_last_extended_at,
    'access_last_extended_until', u.access_last_extended_until,
    'data_access_allowed', unlimited or active_period
  );
  return base;
end;
$$;

grant execute on function public.app_admin_set_access_expiry(uuid, date, boolean, text) to anon, authenticated;
grant execute on function public.app_admin_list_access_extensions(uuid, integer) to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/028_admin_access_extension_history.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/029_installment_plan_schedule.sql
-- ############################################################################

-- 029_installment_plan_schedule.sql
-- Add schedule fields for N-month installment plans.
-- Safe to re-run.

alter table public.installment_plans
  add column if not exists installment_count integer;

comment on column public.installment_plans.installment_count is
  'Number of monthly installments in the plan schedule';

comment on column public.installment_plans.installment_amount is
  'Base monthly installment amount (slots 1..N-1); last slot may differ for rounding';

comment on column public.installment_plans.frequency is
  'Schedule frequency; app currently writes monthly';

comment on column public.installment_plans.meta is
  'JSON schedule extras: scheduleStart, lastAmount, etc.';

-- ############################################################################
-- END migrations/029_installment_plan_schedule.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/030_company_team_members_and_activity.sql
-- ############################################################################

-- ============================================================================
-- 030_company_team_members_and_activity.sql
-- Company "team members" (sub-user accounts sharing one company's data) +
-- an activity log. Platform admin enables the feature per owner account;
-- the owner (or a member with can_manage_team) can then invite/manage
-- members and view a shared activity feed.
--
-- Additive only. Does NOT drop any table. Safe to re-run.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── 1) Columns on app_users ──────────────────────────────────────────────────
alter table public.app_users
  add column if not exists allow_team_members boolean not null default false,
  add column if not exists team_owner_id uuid references public.app_users(id) on delete cascade;

comment on column public.app_users.allow_team_members is
  'Platform-admin toggle: allows this (owner) account to invite and manage team member sub-accounts.';
comment on column public.app_users.team_owner_id is
  'Set for a team member sub-account; points at the company owner account. NULL for owners/solo accounts.';

create index if not exists app_users_team_owner_idx on public.app_users(team_owner_id);
create index if not exists app_users_allow_team_members_idx on public.app_users(allow_team_members);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'app_users_team_member_not_owner_chk'
  ) then
    alter table public.app_users
      add constraint app_users_team_member_not_owner_chk
      check (not (team_owner_id is not null and allow_team_members));
  end if;
end $$;

-- ── 2) Team member permissions ───────────────────────────────────────────────
create table if not exists public.app_team_permissions (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  team_owner_id uuid not null references public.app_users(id) on delete cascade,
  can_edit_entries boolean not null default true,
  can_delete_entries boolean not null default false,
  can_edit_invoices boolean not null default true,
  can_delete_invoices boolean not null default false,
  can_manage_team boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_team_permissions_owner_idx
  on public.app_team_permissions(team_owner_id);

drop trigger if exists trg_set_app_team_permissions_updated_at on public.app_team_permissions;
create trigger trg_set_app_team_permissions_updated_at
  before update on public.app_team_permissions
  for each row execute function public.set_updated_at();

alter table public.app_team_permissions enable row level security;
drop policy if exists app_team_permissions_deny_all on public.app_team_permissions;
create policy app_team_permissions_deny_all
  on public.app_team_permissions for all to anon, authenticated
  using (false) with check (false);

-- ── 3) Shared activity log ────────────────────────────────────────────────────
create table if not exists public.app_activity_log (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.app_users(id) on delete cascade,
  actor_user_id uuid not null references public.app_users(id) on delete cascade,
  actor_username text,
  action text not null,
  module text,
  entity_type text,
  entity_id text,
  summary text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists app_activity_log_owner_created_idx
  on public.app_activity_log(owner_id, created_at desc);
create index if not exists app_activity_log_actor_idx
  on public.app_activity_log(actor_user_id);

alter table public.app_activity_log enable row level security;
drop policy if exists app_activity_log_deny_all on public.app_activity_log;
create policy app_activity_log_deny_all
  on public.app_activity_log for all to anon, authenticated
  using (false) with check (false);

-- ── 4) Helpers ────────────────────────────────────────────────────────────────

-- The account whose data the current session should read/write: the team
-- owner's id for a team member, otherwise the signed-in user's own id.
create or replace function public.app_data_owner_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  u public.app_users;
begin
  if uid is null then
    return null;
  end if;
  select * into u from public.app_users where id = uid;
  if u is null then
    return null;
  end if;
  return coalesce(u.team_owner_id, u.id);
end;
$$;

-- REPLACE: reinstates an admin bypass and adds team-member access so a
-- member can read/write their company owner's rows via the same owner_id
-- RLS policies used across every domain table.
create or replace function public.app_owns_or_admin(p_owner_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
begin
  if uid is null or p_owner_id is null then
    return false;
  end if;
  return public.is_app_admin()
    or p_owner_id = uid
    or p_owner_id = public.app_data_owner_id();
end;
$$;

-- Keep helper in sync (used elsewhere as a stricter own-row-only check)
create or replace function public.app_is_own_row(p_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select p_owner_id is not null and p_owner_id = public.current_app_user_id();
$$;

-- REPLACE: non-admin inserts now land on the caller's *data* owner (their
-- team owner when they are a team member) instead of always their own id,
-- so shared company data actually lands under one owner_id.
create or replace function public.enforce_owner_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  data_owner uuid;
begin
  if tg_op = 'INSERT' then
    if public.current_app_user_id() is null then
      raise exception 'Authentication required';
    end if;
    data_owner := public.app_data_owner_id();
    if not public.is_app_admin() then
      new.owner_id := data_owner;
    elsif new.owner_id is null then
      new.owner_id := data_owner;
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if not public.is_app_admin() then
      new.owner_id := old.owner_id;
    end if;
    return new;
  end if;
  return new;
end;
$$;

-- Caller must be the team owner (allow_team_members = true, no team_owner_id)
-- or a team member with can_manage_team. Returns the owner id being managed.
create or replace function public.app_team_require_manage_context()
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  u public.app_users := public.current_app_user();
  v_owner_id uuid;
  v_can_manage boolean;
begin
  if u is null then
    raise exception 'Authentication required';
  end if;

  if u.team_owner_id is null then
    return u.id;
  end if;

  v_owner_id := u.team_owner_id;
  select can_manage_team into v_can_manage
  from public.app_team_permissions
  where user_id = u.id;

  if not coalesce(v_can_manage, false) then
    raise exception 'You do not have permission to manage the team';
  end if;

  return v_owner_id;
end;
$$;

-- ── 5) Profile: team fields (based on the 009 profile shape) ────────────────
create or replace function public.app_user_public_profile(
  u public.app_users,
  p_include_admin_secrets boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  perms jsonb;
  result jsonb;
  settings_obj jsonb := coalesce(u.settings, '{}'::jsonb);
  v_email text := coalesce(nullif(trim(u.company_email), ''), settings_obj->>'email', settings_obj->>'Email', '');
  v_phone text := coalesce(nullif(trim(u.company_phone), ''), settings_obj->>'Mobile', settings_obj->>'Phone', settings_obj->>'phone', '');
  v_address text := coalesce(nullif(trim(u.company_address), ''), settings_obj->>'Address', settings_obj->>'address', '');
  access_flags jsonb := public.app_user_access_flags(u);
  v_is_team_member boolean := u.team_owner_id is not null;
  v_is_team_owner boolean := coalesce(u.allow_team_members, false) and u.team_owner_id is null;
  v_team_perms jsonb;
  v_team_owner public.app_users;
begin
  settings_obj := settings_obj || jsonb_build_object(
    'Company', coalesce(nullif(trim(u.company_name), ''), settings_obj->>'Company', ''),
    'TRN', coalesce(nullif(trim(u.vat_number), ''), settings_obj->>'TRN', ''),
    'logo', coalesce(nullif(trim(u.logo_url), ''), settings_obj->>'logo', ''),
    'Name', coalesce(nullif(trim(u.display_name), ''), u.username),
    'email', v_email,
    'Email', v_email,
    'Mobile', v_phone,
    'Phone', v_phone,
    'Address', v_address,
    'address', v_address
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'module', p.module,
    'action', p.action,
    'allowed', p.allowed
  ) order by p.module, p.action), '[]'::jsonb)
  into perms
  from public.app_permissions p
  where p.user_id = u.id
    and (
      coalesce(u.access_plan, 'full') <> 'trial'
      or p.module <> 'admin_panel'
    );

  if v_is_team_member then
    select jsonb_build_object(
      'can_edit_entries', coalesce(tp.can_edit_entries, true),
      'can_delete_entries', coalesce(tp.can_delete_entries, false),
      'can_edit_invoices', coalesce(tp.can_edit_invoices, true),
      'can_delete_invoices', coalesce(tp.can_delete_invoices, false),
      'can_manage_team', coalesce(tp.can_manage_team, false)
    )
    into v_team_perms
    from public.app_team_permissions tp
    where tp.user_id = u.id;

    if v_team_perms is null then
      v_team_perms := jsonb_build_object(
        'can_edit_entries', true,
        'can_delete_entries', false,
        'can_edit_invoices', true,
        'can_delete_invoices', false,
        'can_manage_team', false
      );
    end if;

    select * into v_team_owner from public.app_users where id = u.team_owner_id;
  else
    -- Owners / solo accounts are unrestricted on their own data
    v_team_perms := jsonb_build_object(
      'can_edit_entries', true,
      'can_delete_entries', true,
      'can_edit_invoices', true,
      'can_delete_invoices', true,
      'can_manage_team', true
    );
  end if;

  result := jsonb_build_object(
    'id', u.id,
    'username', u.username,
    'display_name', u.display_name,
    'role', u.role,
    'is_protected', u.is_protected,
    'is_active', u.is_active,
    'must_change_password', u.must_change_password,
    'settings', settings_obj,
    'company_name', coalesce(u.company_name, settings_obj->>'Company', ''),
    'vat_number', coalesce(u.vat_number, settings_obj->>'TRN', ''),
    'logo_url', coalesce(u.logo_url, settings_obj->>'logo', ''),
    'company_email', v_email,
    'company_phone', v_phone,
    'company_address', v_address,
    'last_login_at', u.last_login_at,
    'created_at', u.created_at,
    'organization_id', u.organization_id,
    'permissions', coalesce(perms, '[]'::jsonb),
    'allowed_currencies', coalesce(settings_obj->'Currency', '[]'::jsonb),
    'allowed_tabs', coalesce(settings_obj->'Tabs', '[]'::jsonb),
    'smart_pin_hash', coalesce(u.smart_pin_hash, ''),
    'smart_pin_enabled', coalesce(u.smart_pin_hash, '') <> '',
    'allow_team_members', coalesce(u.allow_team_members, false),
    'team_owner_id', u.team_owner_id,
    'is_team_member', v_is_team_member,
    'is_team_owner', v_is_team_owner,
    'team_permissions', v_team_perms,
    'team_owner_username', coalesce(v_team_owner.username, ''),
    'team_owner_display_name', coalesce(v_team_owner.display_name, '')
  ) || access_flags;

  if coalesce(p_include_admin_secrets, false) then
    result := result || jsonb_build_object(
      'admin_visible_password', coalesce(u.admin_visible_password, '')
    );
  end if;

  return result;
end;
$$;

-- ── 6) Admin: create user (+ allow_team_members) / toggle team feature ──────
drop function if exists public.app_admin_create_user(text, text, text, text, boolean, jsonb, jsonb, jsonb, text, text, text, text, text, text);

create or replace function public.app_admin_create_user(
  p_username text,
  p_password text,
  p_display_name text default null,
  p_role text default 'user',
  p_must_change_password boolean default false,
  p_settings jsonb default '{}'::jsonb,
  p_tabs jsonb default null,
  p_currencies jsonb default null,
  p_company_name text default null,
  p_vat_number text default null,
  p_logo_url text default null,
  p_company_email text default null,
  p_company_phone text default null,
  p_company_address text default null,
  p_allow_team_members boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  admin public.app_users := public.app_require_admin();
  new_user public.app_users;
  safe_user text;
  safe_role text := coalesce(nullif(trim(p_role), ''), 'user');
  org_id uuid;
  tabs jsonb;
  currencies jsonb;
  settings_obj jsonb := coalesce(p_settings, '{}'::jsonb);
  v_email text := nullif(trim(coalesce(p_company_email, '')), '');
  v_phone text := nullif(trim(coalesce(p_company_phone, '')), '');
  v_address text := nullif(trim(coalesce(p_company_address, '')), '');
  v_allow_team boolean := coalesce(p_allow_team_members, false);
begin
  safe_user := trim(p_username);
  if safe_user is null or safe_user !~ '^[a-zA-Z0-9_-]+$' then
    raise exception 'Invalid username';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;
  if safe_role not in ('admin', 'user') then
    raise exception 'Invalid role';
  end if;
  if exists (select 1 from public.app_users where lower(username) = lower(safe_user)) then
    raise exception 'Username already exists';
  end if;

  -- Only plain "user" accounts can host their own team; admins never do
  if safe_role <> 'user' then
    v_allow_team := false;
  end if;

  select organization_id into org_id from public.app_users where id = admin.id;

  currencies := coalesce(p_currencies, settings_obj->'Currency', '["AED"]'::jsonb);
  tabs := coalesce(
    p_tabs,
    settings_obj->'Tabs',
    '["dashboard","expenses","loans","notes"]'::jsonb
  );

  if jsonb_typeof(tabs) <> 'array' or jsonb_array_length(tabs) = 0 then
    raise exception 'Select at least one tab';
  end if;

  if p_company_name is not null then
    settings_obj := settings_obj || jsonb_build_object('Company', trim(p_company_name));
  end if;
  if p_vat_number is not null then
    settings_obj := settings_obj || jsonb_build_object('TRN', trim(p_vat_number));
  end if;
  if p_logo_url is not null then
    settings_obj := settings_obj || jsonb_build_object('logo', trim(p_logo_url));
  end if;
  if v_email is not null then
    settings_obj := settings_obj || jsonb_build_object('email', v_email, 'Email', v_email);
  end if;
  if v_phone is not null then
    settings_obj := settings_obj || jsonb_build_object('Mobile', v_phone, 'Phone', v_phone);
  end if;
  if v_address is not null then
    settings_obj := settings_obj || jsonb_build_object('Address', v_address, 'address', v_address);
  end if;
  settings_obj := settings_obj || jsonb_build_object('Currency', currencies, 'Tabs', tabs);

  insert into public.app_users (
    organization_id, username, password_hash, admin_visible_password, display_name,
    role, is_protected, is_active, must_change_password, settings, created_by,
    company_name, vat_number, logo_url, company_email, company_phone, company_address,
    allow_team_members
  ) values (
    org_id,
    safe_user,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    p_password,
    coalesce(nullif(trim(p_display_name), ''), safe_user),
    safe_role,
    false,
    true,
    coalesce(p_must_change_password, false),
    settings_obj,
    admin.id,
    nullif(trim(coalesce(p_company_name, '')), ''),
    nullif(trim(coalesce(p_vat_number, '')), ''),
    nullif(trim(coalesce(p_logo_url, '')), ''),
    v_email,
    v_phone,
    v_address,
    v_allow_team
  )
  returning * into new_user;

  perform public.app_apply_user_currencies(new_user.id, currencies);

  -- Admin role needs admin_panel; do NOT auto-grant every module
  if safe_role = 'admin' then
    tabs := coalesce(tabs, '[]'::jsonb) || '["admin_panel"]'::jsonb;
  end if;

  perform public.app_apply_tab_permissions(new_user.id, tabs);

  select * into new_user from public.app_users where id = new_user.id;
  return public.app_user_public_profile(new_user, true);
end;
$$;

-- Admin-only: enable/disable the team-members feature for an owner account.
create or replace function public.app_admin_set_allow_team_members(
  p_user_id uuid,
  p_allow boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target public.app_users;
  v_allow boolean := coalesce(p_allow, false);
begin
  perform public.app_require_admin();
  select * into target from public.app_users where id = p_user_id;
  if target is null then raise exception 'User not found'; end if;

  if v_allow then
    if target.team_owner_id is not null then
      raise exception 'A team member account cannot host its own sub-team';
    end if;
    if target.role <> 'user' then
      raise exception 'Only standard user accounts can host a team';
    end if;
    if target.is_protected then
      raise exception 'Protected administrator cannot host team members';
    end if;
  end if;

  -- Clearing the flag does NOT remove existing members; it only blocks
  -- new invites via app_team_create_member going forward.
  update public.app_users set
    allow_team_members = v_allow,
    updated_at = now()
  where id = p_user_id
  returning * into target;

  return public.app_user_public_profile(target, true);
end;
$$;

-- ── 7) Team RPCs ──────────────────────────────────────────────────────────────

-- Records one activity row under the caller's data owner.
create or replace function public.app_team_log_activity(
  p_action text,
  p_module text,
  p_summary text,
  p_entity_type text default null,
  p_entity_id text default null,
  p_meta jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  u public.app_users := public.current_app_user();
  v_owner_id uuid;
  v_log_id uuid;
  v_summary text := coalesce(nullif(trim(p_summary), ''), nullif(trim(p_action), ''), 'Activity');
begin
  if u is null then
    raise exception 'Authentication required';
  end if;
  v_owner_id := coalesce(u.team_owner_id, u.id);

  insert into public.app_activity_log (
    owner_id, actor_user_id, actor_username, action, module,
    entity_type, entity_id, summary, meta
  ) values (
    v_owner_id,
    u.id,
    u.username,
    coalesce(nullif(trim(p_action), ''), 'activity'),
    nullif(trim(coalesce(p_module, '')), ''),
    nullif(trim(coalesce(p_entity_type, '')), ''),
    nullif(trim(coalesce(p_entity_id, '')), ''),
    v_summary,
    coalesce(p_meta, '{}'::jsonb)
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;

-- Paginated shared activity feed for the caller's data owner (team-wide).
create or replace function public.app_team_list_activity(
  p_limit int default 100,
  p_offset int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  u public.app_users := public.current_app_user();
  v_owner_id uuid;
  lim int := greatest(1, least(coalesce(p_limit, 100), 500));
  off int := greatest(0, coalesce(p_offset, 0));
  items jsonb;
  total int;
begin
  if u is null then
    raise exception 'Authentication required';
  end if;
  v_owner_id := coalesce(u.team_owner_id, u.id);

  select count(*)::int into total
  from public.app_activity_log a
  where a.owner_id = v_owner_id;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  into items
  from (
    select
      a.id, a.owner_id, a.actor_user_id, a.actor_username, a.action,
      a.module, a.entity_type, a.entity_id, a.summary, a.meta, a.created_at
    from public.app_activity_log a
    where a.owner_id = v_owner_id
    order by a.created_at desc
    limit lim offset off
  ) x;

  return jsonb_build_object('items', coalesce(items, '[]'::jsonb), 'total', coalesce(total, 0), 'limit', lim, 'offset', off);
end;
$$;

-- List every team member (+ permissions) under the caller's data owner.
create or replace function public.app_team_list_members()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  u public.app_users := public.current_app_user();
  v_owner_id uuid;
  items jsonb;
begin
  if u is null then
    raise exception 'Authentication required';
  end if;
  v_owner_id := coalesce(u.team_owner_id, u.id);

  select coalesce(jsonb_agg(
    public.app_user_public_profile(m, false) order by m.created_at
  ), '[]'::jsonb)
  into items
  from public.app_users m
  where m.team_owner_id = v_owner_id;

  return items;
end;
$$;

-- Invite a new team member under the caller's team owner.
create or replace function public.app_team_create_member(
  p_username text,
  p_password text,
  p_display_name text default null,
  p_permissions jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_owner_id uuid := public.app_team_require_manage_context();
  owner public.app_users;
  new_user public.app_users;
  safe_user text := trim(coalesce(p_username, ''));
  settings_obj jsonb;
  currencies jsonb;
  tabs jsonb;
  perms jsonb := coalesce(p_permissions, '{}'::jsonb);
begin
  select * into owner from public.app_users where id = v_owner_id;
  if owner is null then
    raise exception 'Team owner account not found';
  end if;
  if not coalesce(owner.allow_team_members, false) then
    raise exception 'Team members are not enabled for this account';
  end if;

  if safe_user = '' or safe_user !~ '^[a-zA-Z0-9_-]+$' then
    raise exception 'Invalid username';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;
  if exists (select 1 from public.app_users where lower(username) = lower(safe_user)) then
    raise exception 'Username already exists';
  end if;

  settings_obj := coalesce(owner.settings, '{}'::jsonb);
  currencies := coalesce(settings_obj->'Currency', '["AED"]'::jsonb);
  tabs := coalesce(settings_obj->'Tabs', '["dashboard","expenses","loans","notes"]'::jsonb);

  insert into public.app_users (
    organization_id, username, password_hash, admin_visible_password, display_name,
    role, is_protected, is_active, must_change_password, settings, created_by,
    team_owner_id, access_plan, trial_started_at, trial_expires_at
  ) values (
    owner.organization_id,
    safe_user,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    p_password,
    coalesce(nullif(trim(p_display_name), ''), safe_user),
    'user',
    false,
    true,
    false,
    jsonb_build_object(
      'Currency', currencies,
      'Tabs', tabs,
      'Name', coalesce(nullif(trim(p_display_name), ''), safe_user)
    ),
    public.current_app_user_id(),
    v_owner_id,
    owner.access_plan,
    owner.trial_started_at,
    owner.trial_expires_at
  )
  returning * into new_user;

  perform public.app_apply_user_currencies(new_user.id, currencies);
  perform public.app_apply_tab_permissions(new_user.id, tabs);

  insert into public.app_team_permissions (
    user_id, team_owner_id, can_edit_entries, can_delete_entries,
    can_edit_invoices, can_delete_invoices, can_manage_team
  ) values (
    new_user.id,
    v_owner_id,
    coalesce((perms->>'can_edit_entries')::boolean, true),
    coalesce((perms->>'can_delete_entries')::boolean, false),
    coalesce((perms->>'can_edit_invoices')::boolean, true),
    coalesce((perms->>'can_delete_invoices')::boolean, false),
    coalesce((perms->>'can_manage_team')::boolean, false)
  )
  on conflict (user_id) do update set
    can_edit_entries = excluded.can_edit_entries,
    can_delete_entries = excluded.can_delete_entries,
    can_edit_invoices = excluded.can_edit_invoices,
    can_delete_invoices = excluded.can_delete_invoices,
    can_manage_team = excluded.can_manage_team,
    updated_at = now();

  select * into new_user from public.app_users where id = new_user.id;

  perform public.app_team_log_activity(
    'team_member_created',
    'team',
    format('Added team member "%s"', safe_user),
    'app_users',
    new_user.id::text,
    jsonb_build_object('username', safe_user, 'display_name', new_user.display_name)
  );

  return public.app_user_public_profile(new_user, false);
end;
$$;

-- Update a team member's granular permissions.
create or replace function public.app_team_update_member_permissions(
  p_user_id uuid,
  p_permissions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_owner_id uuid := public.app_team_require_manage_context();
  member public.app_users;
  perms jsonb := coalesce(p_permissions, '{}'::jsonb);
  perm_row public.app_team_permissions;
begin
  select * into member from public.app_users where id = p_user_id;
  if member is null or member.team_owner_id is distinct from v_owner_id then
    raise exception 'Team member not found';
  end if;

  insert into public.app_team_permissions (
    user_id, team_owner_id, can_edit_entries, can_delete_entries,
    can_edit_invoices, can_delete_invoices, can_manage_team
  ) values (
    p_user_id,
    v_owner_id,
    coalesce((perms->>'can_edit_entries')::boolean, true),
    coalesce((perms->>'can_delete_entries')::boolean, false),
    coalesce((perms->>'can_edit_invoices')::boolean, true),
    coalesce((perms->>'can_delete_invoices')::boolean, false),
    coalesce((perms->>'can_manage_team')::boolean, false)
  )
  on conflict (user_id) do update set
    can_edit_entries = coalesce((perms->>'can_edit_entries')::boolean, can_edit_entries),
    can_delete_entries = coalesce((perms->>'can_delete_entries')::boolean, can_delete_entries),
    can_edit_invoices = coalesce((perms->>'can_edit_invoices')::boolean, can_edit_invoices),
    can_delete_invoices = coalesce((perms->>'can_delete_invoices')::boolean, can_delete_invoices),
    can_manage_team = coalesce((perms->>'can_manage_team')::boolean, can_manage_team),
    updated_at = now()
  returning * into perm_row;

  perform public.app_team_log_activity(
    'team_permissions_updated',
    'team',
    format('Updated permissions for "%s"', member.username),
    'app_users',
    p_user_id::text,
    to_jsonb(perm_row)
  );

  select * into member from public.app_users where id = p_user_id;
  return public.app_user_public_profile(member, false);
end;
$$;

-- Activate / deactivate a team member (also revokes sessions when disabling).
create or replace function public.app_team_set_member_active(
  p_user_id uuid,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_owner_id uuid := public.app_team_require_manage_context();
  member public.app_users;
  v_active boolean := coalesce(p_active, true);
begin
  select * into member from public.app_users where id = p_user_id;
  if member is null or member.team_owner_id is distinct from v_owner_id then
    raise exception 'Team member not found';
  end if;

  update public.app_users set
    is_active = v_active,
    updated_at = now()
  where id = p_user_id
  returning * into member;

  if not v_active then
    update public.app_sessions set revoked_at = now()
    where user_id = p_user_id and revoked_at is null;
  end if;

  perform public.app_team_log_activity(
    case when v_active then 'team_member_activated' else 'team_member_deactivated' end,
    'team',
    format('%s team member "%s"', case when v_active then 'Activated' else 'Deactivated' end, member.username),
    'app_users',
    p_user_id::text,
    jsonb_build_object('is_active', v_active)
  );

  return public.app_user_public_profile(member, false);
end;
$$;

-- Remove a team member. Soft-delete only: deactivate + revoke sessions.
-- Company data stays intact (it lives under the owner's owner_id already).
create or replace function public.app_team_delete_member(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_owner_id uuid := public.app_team_require_manage_context();
  member public.app_users;
begin
  select * into member from public.app_users where id = p_user_id;
  if member is null or member.team_owner_id is distinct from v_owner_id then
    raise exception 'Team member not found';
  end if;

  update public.app_users set
    is_active = false,
    updated_at = now()
  where id = p_user_id
  returning * into member;

  update public.app_sessions set revoked_at = now()
  where user_id = p_user_id and revoked_at is null;

  perform public.app_team_log_activity(
    'team_member_removed',
    'team',
    format('Removed team member "%s"', member.username),
    'app_users',
    p_user_id::text,
    jsonb_build_object('username', member.username)
  );

  return jsonb_build_object('ok', true, 'deactivated_user_id', p_user_id);
end;
$$;

-- ── 8) Grants ─────────────────────────────────────────────────────────────────
grant execute on function public.app_data_owner_id() to anon, authenticated;
grant execute on function public.app_owns_or_admin(uuid) to anon, authenticated;
grant execute on function public.app_is_own_row(uuid) to anon, authenticated;
grant execute on function public.app_user_public_profile(public.app_users, boolean) to anon, authenticated;
grant execute on function public.app_admin_create_user(text, text, text, text, boolean, jsonb, jsonb, jsonb, text, text, text, text, text, text, boolean) to anon, authenticated;
grant execute on function public.app_admin_set_allow_team_members(uuid, boolean) to anon, authenticated;
grant execute on function public.app_team_require_manage_context() to anon, authenticated;
grant execute on function public.app_team_log_activity(text, text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.app_team_list_activity(int, int) to anon, authenticated;
grant execute on function public.app_team_list_members() to anon, authenticated;
grant execute on function public.app_team_create_member(text, text, text, jsonb) to anon, authenticated;
grant execute on function public.app_team_update_member_permissions(uuid, jsonb) to anon, authenticated;
grant execute on function public.app_team_set_member_active(uuid, boolean) to anon, authenticated;
grant execute on function public.app_team_delete_member(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/030_company_team_members_and_activity.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/031_team_branding_sync_and_member_limits.sql
-- ############################################################################

-- ============================================================================
-- 031_team_branding_sync_and_member_limits.sql
-- Fixes company-team follow-ups on top of 030:
--   1) Team members must see the company OWNER's branding (logo, company
--      name, TRN, email, phone, address) instead of Triple-M defaults or
--      their own (usually empty) branding columns.
--   2) Only the main company account may edit branding; sub-users are
--      blocked server-side even if they call the profile-update RPC directly.
--   3) Admin-configurable seat limit for team members (max_team_members),
--      enforced when inviting new members.
--
-- Additive only. Does NOT drop any table. Safe to re-run.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ── 1) Seat limit column ─────────────────────────────────────────────────────
alter table public.app_users
  add column if not exists max_team_members integer default 3;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'app_users_max_team_members_range_chk'
  ) then
    alter table public.app_users
      add constraint app_users_max_team_members_range_chk
      check (max_team_members is null or (max_team_members between 1 and 50));
  end if;
end $$;

comment on column public.app_users.max_team_members is
  'Admin-configured seat limit for this owner''s company team members (1-50, default 3). Only enforced while allow_team_members is true.';

-- ── 2) Profile: mirror owner branding onto team members ─────────────────────
-- REPLACE: for a team-member account (team_owner_id set), every branding
-- field (company name, VAT/TRN, logo, email, phone, address) — plus their
-- settings mirrors — now comes from the company OWNER row. The member's own
-- username/display_name/permissions/team_permissions are untouched.
create or replace function public.app_user_public_profile(
  u public.app_users,
  p_include_admin_secrets boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  perms jsonb;
  result jsonb;
  own_settings_obj jsonb := coalesce(u.settings, '{}'::jsonb);
  settings_obj jsonb;
  access_flags jsonb := public.app_user_access_flags(u);
  v_is_team_member boolean := u.team_owner_id is not null;
  v_is_team_owner boolean := coalesce(u.allow_team_members, false) and u.team_owner_id is null;
  v_team_perms jsonb;
  v_team_owner public.app_users;
  v_brand public.app_users;
  v_brand_settings jsonb;
  v_company text;
  v_vat text;
  v_logo text;
  v_email text;
  v_phone text;
  v_address text;
  v_max_team int;
begin
  if v_is_team_member then
    select * into v_team_owner from public.app_users where id = u.team_owner_id;
  end if;

  -- Branding source: the company owner for team members, otherwise self.
  if v_is_team_member and v_team_owner.id is not null then
    v_brand := v_team_owner;
  else
    v_brand := u;
  end if;
  v_brand_settings := coalesce(v_brand.settings, '{}'::jsonb);

  v_company := coalesce(nullif(trim(v_brand.company_name), ''), v_brand_settings->>'Company', '');
  v_vat := coalesce(nullif(trim(v_brand.vat_number), ''), v_brand_settings->>'TRN', '');
  v_logo := coalesce(nullif(trim(v_brand.logo_url), ''), v_brand_settings->>'logo', '');
  v_email := coalesce(nullif(trim(v_brand.company_email), ''), v_brand_settings->>'email', v_brand_settings->>'Email', '');
  v_phone := coalesce(nullif(trim(v_brand.company_phone), ''), v_brand_settings->>'Mobile', v_brand_settings->>'Phone', v_brand_settings->>'phone', '');
  v_address := coalesce(nullif(trim(v_brand.company_address), ''), v_brand_settings->>'Address', v_brand_settings->>'address', '');

  -- Member keeps their own settings (Tabs/Currency/etc.) but the branding
  -- mirrors inside `settings` always reflect the resolved brand (owner-or-self).
  settings_obj := own_settings_obj || jsonb_build_object(
    'Company', v_company,
    'TRN', v_vat,
    'logo', v_logo,
    'Name', coalesce(nullif(trim(u.display_name), ''), u.username),
    'email', v_email,
    'Email', v_email,
    'Mobile', v_phone,
    'Phone', v_phone,
    'Address', v_address,
    'address', v_address
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'module', p.module,
    'action', p.action,
    'allowed', p.allowed
  ) order by p.module, p.action), '[]'::jsonb)
  into perms
  from public.app_permissions p
  where p.user_id = u.id
    and (
      coalesce(u.access_plan, 'full') <> 'trial'
      or p.module <> 'admin_panel'
    );

  if v_is_team_member then
    select jsonb_build_object(
      'can_edit_entries', coalesce(tp.can_edit_entries, true),
      'can_delete_entries', coalesce(tp.can_delete_entries, false),
      'can_edit_invoices', coalesce(tp.can_edit_invoices, true),
      'can_delete_invoices', coalesce(tp.can_delete_invoices, false),
      'can_manage_team', coalesce(tp.can_manage_team, false)
    )
    into v_team_perms
    from public.app_team_permissions tp
    where tp.user_id = u.id;

    if v_team_perms is null then
      v_team_perms := jsonb_build_object(
        'can_edit_entries', true,
        'can_delete_entries', false,
        'can_edit_invoices', true,
        'can_delete_invoices', false,
        'can_manage_team', false
      );
    end if;
  else
    -- Owners / solo accounts are unrestricted on their own data
    v_team_perms := jsonb_build_object(
      'can_edit_entries', true,
      'can_delete_entries', true,
      'can_edit_invoices', true,
      'can_delete_invoices', true,
      'can_manage_team', true
    );
  end if;

  v_max_team := coalesce(v_brand.max_team_members, 3);

  result := jsonb_build_object(
    'id', u.id,
    'username', u.username,
    'display_name', u.display_name,
    'role', u.role,
    'is_protected', u.is_protected,
    'is_active', u.is_active,
    'must_change_password', u.must_change_password,
    'settings', settings_obj,
    'company_name', v_company,
    'vat_number', v_vat,
    'logo_url', v_logo,
    'company_email', v_email,
    'company_phone', v_phone,
    'company_address', v_address,
    'last_login_at', u.last_login_at,
    'created_at', u.created_at,
    'organization_id', u.organization_id,
    'permissions', coalesce(perms, '[]'::jsonb),
    'allowed_currencies', coalesce(own_settings_obj->'Currency', '[]'::jsonb),
    'allowed_tabs', coalesce(own_settings_obj->'Tabs', '[]'::jsonb),
    'smart_pin_hash', coalesce(u.smart_pin_hash, ''),
    'smart_pin_enabled', coalesce(u.smart_pin_hash, '') <> '',
    'allow_team_members', coalesce(u.allow_team_members, false),
    'team_owner_id', u.team_owner_id,
    'is_team_member', v_is_team_member,
    'is_team_owner', v_is_team_owner,
    'team_permissions', v_team_perms,
    'team_owner_username', coalesce(v_team_owner.username, ''),
    'team_owner_display_name', coalesce(v_team_owner.display_name, ''),
    'max_team_members', v_max_team
  ) || access_flags;

  if coalesce(p_include_admin_secrets, false) then
    result := result || jsonb_build_object(
      'admin_visible_password', coalesce(u.admin_visible_password, '')
    );
  end if;

  return result;
end;
$$;

-- ── 3) Block team members from editing company branding server-side ────────
-- REPLACE (same 10-arg signature as 025): a team member calling this RPC can
-- still change their own display name / username / password, but any
-- attempt to change branding fields is rejected — branding is resolved from
-- the owner in app_user_public_profile regardless of what's stored here.
create or replace function public.app_update_own_profile(
  p_display_name text default null,
  p_old_password text default null,
  p_new_password text default null,
  p_new_username text default null,
  p_company_name text default null,
  p_vat_number text default null,
  p_logo_url text default null,
  p_company_email text default null,
  p_company_phone text default null,
  p_company_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  u public.app_users := public.current_app_user();
  new_settings jsonb;
  has_branding boolean := false;
  v_is_team_member boolean;
begin
  if u is null then
    raise exception 'Authentication required';
  end if;
  v_is_team_member := u.team_owner_id is not null;

  if v_is_team_member and (
    p_company_name is not null or p_vat_number is not null or p_logo_url is not null
    or p_company_email is not null or p_company_phone is not null or p_company_address is not null
  ) then
    raise exception 'Company branding is managed by the company main account';
  end if;

  -- Username (format + uniqueness; protected default admin username locked)
  if p_new_username is not null and trim(p_new_username) <> '' then
    perform public.app_change_own_username(p_new_username);
  end if;

  -- Password (preserves current session via app_change_password)
  if p_new_password is not null and length(trim(p_new_password)) > 0 then
    if p_old_password is null or length(trim(p_old_password)) = 0 then
      raise exception 'Current password is required to set a new password';
    end if;
    perform public.app_change_password(p_old_password, p_new_password);
  end if;

  -- Reload after username/password side-effects
  select * into u from public.app_users where id = public.current_app_user_id();
  if u is null then
    raise exception 'Authentication required';
  end if;

  new_settings := coalesce(u.settings, '{}'::jsonb);
  has_branding :=
       p_display_name is not null
    or (not v_is_team_member and (
         p_company_name is not null
      or p_vat_number is not null
      or p_logo_url is not null
      or p_company_email is not null
      or p_company_phone is not null
      or p_company_address is not null
    ));

  if has_branding then
    if p_display_name is not null then
      new_settings := new_settings || jsonb_build_object(
        'Name', coalesce(nullif(trim(p_display_name), ''), u.username)
      );
    end if;
    if not v_is_team_member and p_company_name is not null then
      new_settings := new_settings || jsonb_build_object('Company', trim(p_company_name));
    end if;
    if not v_is_team_member and p_vat_number is not null then
      new_settings := new_settings || jsonb_build_object('TRN', trim(p_vat_number));
    end if;
    if not v_is_team_member and p_logo_url is not null then
      new_settings := new_settings || jsonb_build_object('logo', trim(p_logo_url));
    end if;
    if not v_is_team_member and p_company_email is not null then
      new_settings := new_settings || jsonb_build_object(
        'email', trim(p_company_email),
        'Email', trim(p_company_email)
      );
    end if;
    if not v_is_team_member and p_company_phone is not null then
      new_settings := new_settings || jsonb_build_object(
        'Mobile', trim(p_company_phone),
        'Phone', trim(p_company_phone)
      );
    end if;
    if not v_is_team_member and p_company_address is not null then
      new_settings := new_settings || jsonb_build_object(
        'Address', trim(p_company_address),
        'address', trim(p_company_address)
      );
    end if;

    update public.app_users set
      display_name = case
        when p_display_name is not null
          then coalesce(nullif(trim(p_display_name), ''), username)
        else display_name
      end,
      company_name = case
        when v_is_team_member or p_company_name is null then company_name
        else nullif(trim(p_company_name), '')
      end,
      vat_number = case
        when v_is_team_member or p_vat_number is null then vat_number
        else nullif(trim(p_vat_number), '')
      end,
      logo_url = case
        when v_is_team_member or p_logo_url is null then logo_url
        else nullif(trim(p_logo_url), '')
      end,
      company_email = case
        when v_is_team_member or p_company_email is null then company_email
        else nullif(trim(p_company_email), '')
      end,
      company_phone = case
        when v_is_team_member or p_company_phone is null then company_phone
        else nullif(trim(p_company_phone), '')
      end,
      company_address = case
        when v_is_team_member or p_company_address is null then company_address
        else nullif(trim(p_company_address), '')
      end,
      settings = new_settings,
      updated_at = now()
    where id = u.id
    returning * into u;
  end if;

  -- Never escalate role / tabs / currencies from this RPC
  return public.app_user_public_profile(u, false);
end;
$$;

-- ── 4) Admin: create user with a seat limit ─────────────────────────────────
drop function if exists public.app_admin_create_user(text, text, text, text, boolean, jsonb, jsonb, jsonb, text, text, text, text, text, text, boolean);

create or replace function public.app_admin_create_user(
  p_username text,
  p_password text,
  p_display_name text default null,
  p_role text default 'user',
  p_must_change_password boolean default false,
  p_settings jsonb default '{}'::jsonb,
  p_tabs jsonb default null,
  p_currencies jsonb default null,
  p_company_name text default null,
  p_vat_number text default null,
  p_logo_url text default null,
  p_company_email text default null,
  p_company_phone text default null,
  p_company_address text default null,
  p_allow_team_members boolean default false,
  p_max_team_members int default 3
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  admin public.app_users := public.app_require_admin();
  new_user public.app_users;
  safe_user text;
  safe_role text := coalesce(nullif(trim(p_role), ''), 'user');
  org_id uuid;
  tabs jsonb;
  currencies jsonb;
  settings_obj jsonb := coalesce(p_settings, '{}'::jsonb);
  v_email text := nullif(trim(coalesce(p_company_email, '')), '');
  v_phone text := nullif(trim(coalesce(p_company_phone, '')), '');
  v_address text := nullif(trim(coalesce(p_company_address, '')), '');
  v_allow_team boolean := coalesce(p_allow_team_members, false);
  v_max_team int := greatest(1, least(coalesce(p_max_team_members, 3), 50));
begin
  safe_user := trim(p_username);
  if safe_user is null or safe_user !~ '^[a-zA-Z0-9_-]+$' then
    raise exception 'Invalid username';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;
  if safe_role not in ('admin', 'user') then
    raise exception 'Invalid role';
  end if;
  if exists (select 1 from public.app_users where lower(username) = lower(safe_user)) then
    raise exception 'Username already exists';
  end if;

  -- Only plain "user" accounts can host their own team; admins never do
  if safe_role <> 'user' then
    v_allow_team := false;
  end if;

  select organization_id into org_id from public.app_users where id = admin.id;

  currencies := coalesce(p_currencies, settings_obj->'Currency', '["AED"]'::jsonb);
  tabs := coalesce(
    p_tabs,
    settings_obj->'Tabs',
    '["dashboard","expenses","loans","notes"]'::jsonb
  );

  if jsonb_typeof(tabs) <> 'array' or jsonb_array_length(tabs) = 0 then
    raise exception 'Select at least one tab';
  end if;

  if p_company_name is not null then
    settings_obj := settings_obj || jsonb_build_object('Company', trim(p_company_name));
  end if;
  if p_vat_number is not null then
    settings_obj := settings_obj || jsonb_build_object('TRN', trim(p_vat_number));
  end if;
  if p_logo_url is not null then
    settings_obj := settings_obj || jsonb_build_object('logo', trim(p_logo_url));
  end if;
  if v_email is not null then
    settings_obj := settings_obj || jsonb_build_object('email', v_email, 'Email', v_email);
  end if;
  if v_phone is not null then
    settings_obj := settings_obj || jsonb_build_object('Mobile', v_phone, 'Phone', v_phone);
  end if;
  if v_address is not null then
    settings_obj := settings_obj || jsonb_build_object('Address', v_address, 'address', v_address);
  end if;
  settings_obj := settings_obj || jsonb_build_object('Currency', currencies, 'Tabs', tabs);

  insert into public.app_users (
    organization_id, username, password_hash, admin_visible_password, display_name,
    role, is_protected, is_active, must_change_password, settings, created_by,
    company_name, vat_number, logo_url, company_email, company_phone, company_address,
    allow_team_members, max_team_members
  ) values (
    org_id,
    safe_user,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    p_password,
    coalesce(nullif(trim(p_display_name), ''), safe_user),
    safe_role,
    false,
    true,
    coalesce(p_must_change_password, false),
    settings_obj,
    admin.id,
    nullif(trim(coalesce(p_company_name, '')), ''),
    nullif(trim(coalesce(p_vat_number, '')), ''),
    nullif(trim(coalesce(p_logo_url, '')), ''),
    v_email,
    v_phone,
    v_address,
    v_allow_team,
    v_max_team
  )
  returning * into new_user;

  perform public.app_apply_user_currencies(new_user.id, currencies);

  -- Admin role needs admin_panel; do NOT auto-grant every module
  if safe_role = 'admin' then
    tabs := coalesce(tabs, '[]'::jsonb) || '["admin_panel"]'::jsonb;
  end if;

  perform public.app_apply_tab_permissions(new_user.id, tabs);

  select * into new_user from public.app_users where id = new_user.id;
  return public.app_user_public_profile(new_user, true);
end;
$$;

-- ── 5) Admin: set allow + seat limit together ───────────────────────────────
create or replace function public.app_admin_set_team_limits(
  p_user_id uuid,
  p_allow boolean,
  p_max_team_members int default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target public.app_users;
  v_allow boolean := coalesce(p_allow, false);
  v_max int;
begin
  perform public.app_require_admin();
  select * into target from public.app_users where id = p_user_id;
  if target is null then raise exception 'User not found'; end if;

  if v_allow then
    if target.team_owner_id is not null then
      raise exception 'A team member account cannot host its own sub-team';
    end if;
    if target.role <> 'user' then
      raise exception 'Only standard user accounts can host a team';
    end if;
    if target.is_protected then
      raise exception 'Protected administrator cannot host team members';
    end if;
  end if;

  if p_max_team_members is not null then
    if p_max_team_members < 1 or p_max_team_members > 50 then
      raise exception 'Max team members must be between 1 and 50';
    end if;
    v_max := p_max_team_members;
  else
    v_max := coalesce(target.max_team_members, 3);
  end if;

  -- Clearing the flag does NOT remove existing members; it only blocks
  -- new invites via app_team_create_member going forward.
  update public.app_users set
    allow_team_members = v_allow,
    max_team_members = v_max,
    updated_at = now()
  where id = p_user_id
  returning * into target;

  return public.app_user_public_profile(target, true);
end;
$$;

-- Kept for backward compatibility; now delegates to app_admin_set_team_limits
-- without touching the existing seat limit.
create or replace function public.app_admin_set_allow_team_members(
  p_user_id uuid,
  p_allow boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.app_require_admin();
  return public.app_admin_set_team_limits(p_user_id, p_allow, null);
end;
$$;

-- ── 6) Enforce the seat limit when inviting a team member ───────────────────
create or replace function public.app_team_create_member(
  p_username text,
  p_password text,
  p_display_name text default null,
  p_permissions jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_owner_id uuid := public.app_team_require_manage_context();
  owner public.app_users;
  new_user public.app_users;
  safe_user text := trim(coalesce(p_username, ''));
  settings_obj jsonb;
  currencies jsonb;
  tabs jsonb;
  perms jsonb := coalesce(p_permissions, '{}'::jsonb);
  v_active_count int;
  v_max int;
begin
  select * into owner from public.app_users where id = v_owner_id;
  if owner is null then
    raise exception 'Team owner account not found';
  end if;
  if not coalesce(owner.allow_team_members, false) then
    raise exception 'Team members are not enabled for this account';
  end if;

  v_max := coalesce(owner.max_team_members, 3);
  select count(*) into v_active_count
  from public.app_users
  where team_owner_id = v_owner_id and is_active = true;
  if v_active_count >= v_max then
    raise exception 'Team member limit reached (max %s active member(s)). Ask the platform admin to increase the limit.', v_max;
  end if;

  if safe_user = '' or safe_user !~ '^[a-zA-Z0-9_-]+$' then
    raise exception 'Invalid username';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;
  if exists (select 1 from public.app_users where lower(username) = lower(safe_user)) then
    raise exception 'Username already exists';
  end if;

  settings_obj := coalesce(owner.settings, '{}'::jsonb);
  currencies := coalesce(settings_obj->'Currency', '["AED"]'::jsonb);
  tabs := coalesce(settings_obj->'Tabs', '["dashboard","expenses","loans","notes"]'::jsonb);

  insert into public.app_users (
    organization_id, username, password_hash, admin_visible_password, display_name,
    role, is_protected, is_active, must_change_password, settings, created_by,
    team_owner_id, access_plan, trial_started_at, trial_expires_at
  ) values (
    owner.organization_id,
    safe_user,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    p_password,
    coalesce(nullif(trim(p_display_name), ''), safe_user),
    'user',
    false,
    true,
    false,
    jsonb_build_object(
      'Currency', currencies,
      'Tabs', tabs,
      'Name', coalesce(nullif(trim(p_display_name), ''), safe_user)
    ),
    public.current_app_user_id(),
    v_owner_id,
    owner.access_plan,
    owner.trial_started_at,
    owner.trial_expires_at
  )
  returning * into new_user;

  perform public.app_apply_user_currencies(new_user.id, currencies);
  perform public.app_apply_tab_permissions(new_user.id, tabs);

  insert into public.app_team_permissions (
    user_id, team_owner_id, can_edit_entries, can_delete_entries,
    can_edit_invoices, can_delete_invoices, can_manage_team
  ) values (
    new_user.id,
    v_owner_id,
    coalesce((perms->>'can_edit_entries')::boolean, true),
    coalesce((perms->>'can_delete_entries')::boolean, false),
    coalesce((perms->>'can_edit_invoices')::boolean, true),
    coalesce((perms->>'can_delete_invoices')::boolean, false),
    coalesce((perms->>'can_manage_team')::boolean, false)
  )
  on conflict (user_id) do update set
    can_edit_entries = excluded.can_edit_entries,
    can_delete_entries = excluded.can_delete_entries,
    can_edit_invoices = excluded.can_edit_invoices,
    can_delete_invoices = excluded.can_delete_invoices,
    can_manage_team = excluded.can_manage_team,
    updated_at = now();

  select * into new_user from public.app_users where id = new_user.id;

  perform public.app_team_log_activity(
    'team_member_created',
    'team',
    format('Added team member "%s"', safe_user),
    'app_users',
    new_user.id::text,
    jsonb_build_object('username', safe_user, 'display_name', new_user.display_name)
  );

  return public.app_user_public_profile(new_user, false);
end;
$$;

-- ── 7) Grants ─────────────────────────────────────────────────────────────────
grant execute on function public.app_admin_create_user(text, text, text, text, boolean, jsonb, jsonb, jsonb, text, text, text, text, text, text, boolean, int) to anon, authenticated;
grant execute on function public.app_admin_set_team_limits(uuid, boolean, int) to anon, authenticated;
grant execute on function public.app_admin_set_allow_team_members(uuid, boolean) to anon, authenticated;
grant execute on function public.app_team_create_member(text, text, text, jsonb) to anon, authenticated;
grant execute on function public.app_update_own_profile(text, text, text, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.app_user_public_profile(public.app_users, boolean) to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/031_team_branding_sync_and_member_limits.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/032_activity_log_owner_only.sql
-- ############################################################################

-- ============================================================================
-- 032_activity_log_owner_only.sql
-- Only the company main account (allow_team_members, no team_owner_id)
-- may list the shared activity feed. Members can still write logs via
-- app_team_log_activity (already stamps owner_id = team owner).
-- Additive. Safe to re-run.
-- ============================================================================

create or replace function public.app_team_list_activity(
  p_limit int default 50,
  p_offset int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  u public.app_users := public.current_app_user();
  v_owner_id uuid;
  lim int := greatest(1, least(coalesce(p_limit, 50), 100));
  off int := greatest(0, coalesce(p_offset, 0));
  items jsonb;
  total int;
begin
  if u is null then
    raise exception 'Authentication required';
  end if;

  -- Owner-only: main company account, not team members (even with can_manage_team)
  if coalesce(u.allow_team_members, false) is not true or u.team_owner_id is not null then
    raise exception 'Only the company main account can view the activity log.';
  end if;

  v_owner_id := u.id;

  select count(*)::int into total
  from public.app_activity_log a
  where a.owner_id = v_owner_id;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  into items
  from (
    select
      a.id, a.owner_id, a.actor_user_id, a.actor_username, a.action,
      a.module, a.entity_type, a.entity_id, a.summary, a.meta, a.created_at
    from public.app_activity_log a
    where a.owner_id = v_owner_id
    order by a.created_at desc
    limit lim offset off
  ) x;

  return jsonb_build_object(
    'items', coalesce(items, '[]'::jsonb),
    'total', coalesce(total, 0),
    'limit', lim,
    'offset', off
  );
end;
$$;

grant execute on function public.app_team_list_activity(int, int) to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/032_activity_log_owner_only.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/033_admin_visible_smart_pin.sql
-- ############################################################################

-- ============================================================================
-- 033_admin_visible_smart_pin.sql
-- Store plaintext Smart Pin for admin visibility (same pattern as
-- admin_visible_password). Only returned from admin-secret profile paths.
-- Existing pins set before this migration cannot be recovered from hash —
-- users must set/change their pin once for the admin copy to appear.
-- Additive. Safe to re-run.
-- ============================================================================

alter table public.app_users
  add column if not exists admin_visible_smart_pin text;

comment on column public.app_users.admin_visible_smart_pin is
  'Plaintext Smart Pin for admin recovery UI only. Never returned to non-admin callers.';

-- ── Set / clear pin: keep admin-visible copy in sync ───────────────────────
create or replace function public.app_set_smart_pin(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  u public.app_users := public.current_app_user();
  pin text := trim(coalesce(p_pin, ''));
  hash text;
begin
  if u is null then
    raise exception 'Authentication required';
  end if;
  if pin !~ '^\d{4}$' and pin !~ '^\d{6}$' then
    raise exception 'Smart Pin must be exactly 4 or 6 digits';
  end if;
  hash := public.app_hash_smart_pin(u.username, pin);
  update public.app_users
  set
    smart_pin_hash = hash,
    admin_visible_smart_pin = pin,
    updated_at = now()
  where id = u.id;
  return jsonb_build_object('ok', true, 'smart_pin_hash', hash, 'enabled', true);
end;
$$;

create or replace function public.app_clear_smart_pin(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  u public.app_users := public.current_app_user();
  pin text := trim(coalesce(p_pin, ''));
begin
  if u is null then
    raise exception 'Authentication required';
  end if;
  if coalesce(u.smart_pin_hash, '') = '' then
    update public.app_users
    set admin_visible_smart_pin = null, updated_at = now()
    where id = u.id;
    return jsonb_build_object('ok', true, 'smart_pin_hash', '', 'enabled', false);
  end if;
  if pin !~ '^\d{4}$' and pin !~ '^\d{6}$' then
    raise exception 'Smart Pin must be exactly 4 or 6 digits';
  end if;
  if public.app_hash_smart_pin(u.username, pin) <> u.smart_pin_hash then
    raise exception 'Smart Pin is incorrect';
  end if;
  update public.app_users
  set
    smart_pin_hash = null,
    admin_visible_smart_pin = null,
    updated_at = now()
  where id = u.id;
  return jsonb_build_object('ok', true, 'smart_pin_hash', '', 'enabled', false);
end;
$$;

-- ── Profile: include admin_visible_smart_pin with admin secrets ────────────
-- Body matches 031 + smart pin secret. Keep in sync with team branding fields.
create or replace function public.app_user_public_profile(
  u public.app_users,
  p_include_admin_secrets boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  perms jsonb;
  result jsonb;
  own_settings_obj jsonb := coalesce(u.settings, '{}'::jsonb);
  settings_obj jsonb;
  access_flags jsonb := public.app_user_access_flags(u);
  v_is_team_member boolean := u.team_owner_id is not null;
  v_is_team_owner boolean := coalesce(u.allow_team_members, false) and u.team_owner_id is null;
  v_team_perms jsonb;
  v_team_owner public.app_users;
  v_brand public.app_users;
  v_brand_settings jsonb;
  v_company text;
  v_vat text;
  v_logo text;
  v_email text;
  v_phone text;
  v_address text;
  v_max_team int;
begin
  if v_is_team_member then
    select * into v_team_owner from public.app_users where id = u.team_owner_id;
  end if;

  if v_is_team_member and v_team_owner.id is not null then
    v_brand := v_team_owner;
  else
    v_brand := u;
  end if;
  v_brand_settings := coalesce(v_brand.settings, '{}'::jsonb);

  v_company := coalesce(nullif(trim(v_brand.company_name), ''), v_brand_settings->>'Company', '');
  v_vat := coalesce(nullif(trim(v_brand.vat_number), ''), v_brand_settings->>'TRN', '');
  v_logo := coalesce(nullif(trim(v_brand.logo_url), ''), v_brand_settings->>'logo', '');
  v_email := coalesce(nullif(trim(v_brand.company_email), ''), v_brand_settings->>'email', v_brand_settings->>'Email', '');
  v_phone := coalesce(nullif(trim(v_brand.company_phone), ''), v_brand_settings->>'Mobile', v_brand_settings->>'Phone', v_brand_settings->>'phone', '');
  v_address := coalesce(nullif(trim(v_brand.company_address), ''), v_brand_settings->>'Address', v_brand_settings->>'address', '');

  settings_obj := own_settings_obj || jsonb_build_object(
    'Company', v_company,
    'TRN', v_vat,
    'logo', v_logo,
    'Name', coalesce(nullif(trim(u.display_name), ''), u.username),
    'email', v_email,
    'Email', v_email,
    'Mobile', v_phone,
    'Phone', v_phone,
    'Address', v_address,
    'address', v_address
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'module', p.module,
    'action', p.action,
    'allowed', p.allowed
  ) order by p.module, p.action), '[]'::jsonb)
  into perms
  from public.app_permissions p
  where p.user_id = u.id
    and (
      coalesce(u.access_plan, 'full') <> 'trial'
      or p.module <> 'admin_panel'
    );

  if v_is_team_member then
    select jsonb_build_object(
      'can_edit_entries', coalesce(tp.can_edit_entries, true),
      'can_delete_entries', coalesce(tp.can_delete_entries, false),
      'can_edit_invoices', coalesce(tp.can_edit_invoices, true),
      'can_delete_invoices', coalesce(tp.can_delete_invoices, false),
      'can_manage_team', coalesce(tp.can_manage_team, false)
    )
    into v_team_perms
    from public.app_team_permissions tp
    where tp.user_id = u.id;

    if v_team_perms is null then
      v_team_perms := jsonb_build_object(
        'can_edit_entries', true,
        'can_delete_entries', false,
        'can_edit_invoices', true,
        'can_delete_invoices', false,
        'can_manage_team', false
      );
    end if;
  else
    v_team_perms := jsonb_build_object(
      'can_edit_entries', true,
      'can_delete_entries', true,
      'can_edit_invoices', true,
      'can_delete_invoices', true,
      'can_manage_team', true
    );
  end if;

  v_max_team := coalesce(v_brand.max_team_members, 3);

  result := jsonb_build_object(
    'id', u.id,
    'username', u.username,
    'display_name', u.display_name,
    'role', u.role,
    'is_protected', u.is_protected,
    'is_active', u.is_active,
    'must_change_password', u.must_change_password,
    'settings', settings_obj,
    'company_name', v_company,
    'vat_number', v_vat,
    'logo_url', v_logo,
    'company_email', v_email,
    'company_phone', v_phone,
    'company_address', v_address,
    'last_login_at', u.last_login_at,
    'created_at', u.created_at,
    'organization_id', u.organization_id,
    'permissions', coalesce(perms, '[]'::jsonb),
    'allowed_currencies', coalesce(own_settings_obj->'Currency', '[]'::jsonb),
    'allowed_tabs', coalesce(own_settings_obj->'Tabs', '[]'::jsonb),
    'smart_pin_hash', coalesce(u.smart_pin_hash, ''),
    'smart_pin_enabled', coalesce(u.smart_pin_hash, '') <> '',
    'allow_team_members', coalesce(u.allow_team_members, false),
    'team_owner_id', u.team_owner_id,
    'is_team_member', v_is_team_member,
    'is_team_owner', v_is_team_owner,
    'team_permissions', v_team_perms,
    'team_owner_username', coalesce(v_team_owner.username, ''),
    'team_owner_display_name', coalesce(v_team_owner.display_name, ''),
    'max_team_members', v_max_team
  ) || access_flags;

  if coalesce(p_include_admin_secrets, false) then
    result := result || jsonb_build_object(
      'admin_visible_password', coalesce(u.admin_visible_password, ''),
      'admin_visible_smart_pin', coalesce(u.admin_visible_smart_pin, '')
    );
  end if;

  return result;
end;
$$;

create or replace function public.app_admin_list_users()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  result jsonb;
begin
  perform public.app_require_admin();
  select coalesce(
    jsonb_agg(
      public.app_user_public_profile(u, true)
      || jsonb_build_object(
        'admin_visible_password', coalesce(u.admin_visible_password, ''),
        'admin_visible_smart_pin', coalesce(u.admin_visible_smart_pin, '')
      )
      order by u.created_at
    ),
    '[]'::jsonb
  )
  into result
  from public.app_users u;
  return result;
end;
$$;

create or replace function public.app_admin_get_user(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target public.app_users;
begin
  perform public.app_require_admin();
  select * into target from public.app_users where id = p_user_id;
  if target is null then
    raise exception 'User not found';
  end if;
  return public.app_user_public_profile(target, true)
    || jsonb_build_object(
      'admin_visible_password', coalesce(target.admin_visible_password, ''),
      'admin_visible_smart_pin', coalesce(target.admin_visible_smart_pin, '')
    );
end;
$$;

grant execute on function public.app_set_smart_pin(text) to anon, authenticated;
grant execute on function public.app_clear_smart_pin(text) to anon, authenticated;
grant execute on function public.app_user_public_profile(public.app_users, boolean) to anon, authenticated;
grant execute on function public.app_admin_list_users() to anon, authenticated;
grant execute on function public.app_admin_get_user(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/033_admin_visible_smart_pin.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/034_admin_backup_restore.sql
-- ############################################################################

-- ============================================================================
-- 034_admin_backup_restore.sql
-- Full-database backup / restore RPCs for the protected main administrator only
-- (is_protected = true AND role = admin). Company owners / normal admins cannot
-- call these. Safe to re-run.
--
-- Note: Admin UI "Download SQL" is schema/setup only (client-side). Full row
-- dumps use Download Backup JSON/CSV + these export/import RPCs.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ── Protected-admin gate ─────────────────────────────────────────────────────
create or replace function public.app_require_protected_admin()
returns public.app_users
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  u public.app_users := public.current_app_user();
begin
  if u is null then
    raise exception 'Authentication required';
  end if;
  if u.role <> 'admin' or not u.is_active or coalesce(u.is_protected, false) is not true then
    raise exception 'Protected administrator access required';
  end if;
  return u;
end;
$$;

-- Tables included in full backup (order used for SQL insert hints)
create or replace function public.app_admin_backup_table_list()
returns text[]
language sql
immutable
as $$
  select array[
    'app_organizations',
    'app_users',
    'app_permissions',
    'app_team_permissions',
    'loan_ledger_entries',
    'loans',
    'loan_payments',
    'installment_plans',
    'installment_payments',
    'goods_items',
    'goods_sales',
    'goods_events',
    'expense_accounts',
    'expense_topups',
    'expense_entries',
    'expense_transfers',
    'bitcoin_wallets',
    'app_notes',
    'app_user_prefs',
    'app_inquiries',
    'app_inquiry_messages',
    'app_admin_notifications',
    'app_access_extensions',
    'app_plan_renewal_requests',
    'app_activity_log'
  ]::text[];
$$;

create or replace function public.app_admin_backup_table_exists(p_table text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = p_table
  );
$$;

create or replace function public.app_admin_backup_dump_table(p_table text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if p_table is null or p_table !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'Invalid table name';
  end if;
  if not public.app_admin_backup_table_exists(p_table) then
    return '[]'::jsonb;
  end if;
  if not (p_table = any (public.app_admin_backup_table_list())) then
    raise exception 'Table not allowed in backup: %', p_table;
  end if;
  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t',
    p_table
  ) into result;
  return coalesce(result, '[]'::jsonb);
end;
$$;

-- Full export: version stamp + per-table arrays (includes password hashes /
-- admin_visible_password / smart pin fields as stored on app_users).
create or replace function public.app_admin_export_full_backup()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  admin public.app_users := public.app_require_protected_admin();
  tbl text;
  tables_obj jsonb := '{}'::jsonb;
  counts jsonb := '{}'::jsonb;
  rows jsonb;
  n int;
begin
  foreach tbl in array public.app_admin_backup_table_list() loop
    rows := public.app_admin_backup_dump_table(tbl);
    tables_obj := tables_obj || jsonb_build_object(tbl, rows);
    n := coalesce(jsonb_array_length(rows), 0);
    counts := counts || jsonb_build_object(tbl, n);
  end loop;

  return jsonb_build_object(
    'format', 'triple-m-admin-backup',
    'version', 1,
    'exportedAt', now(),
    'exportedBy', jsonb_build_object(
      'id', admin.id,
      'username', admin.username
    ),
    'excluded', jsonb_build_array('app_sessions'),
    'notes', jsonb_build_array(
      'Supabase Auth users are not used; app auth lives in app_users/app_sessions.',
      'Live sessions (app_sessions) are excluded from export/restore; users must re-login after restore.',
      'Password hashes, admin_visible_password, smart_pin_hash, and admin_visible_smart_pin are included when present.'
    ),
    'tableOrder', to_jsonb(public.app_admin_backup_table_list()),
    'counts', counts,
    'tables', tables_obj
  );
end;
$$;

create or replace function public.app_admin_backup_clear_table(p_table text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.app_admin_backup_table_exists(p_table) then
    return;
  end if;
  if not (p_table = any (public.app_admin_backup_table_list())) then
    raise exception 'Table not allowed: %', p_table;
  end if;
  -- WHERE true: Supabase loads pg-safeupdate, which rejects DELETE without a WHERE.
  execute format('delete from public.%I where true', p_table);
end;
$$;

create or replace function public.app_admin_backup_insert_rows(p_table text, p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted int := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    return 0;
  end if;
  if not public.app_admin_backup_table_exists(p_table) then
    return 0;
  end if;
  if not (p_table = any (public.app_admin_backup_table_list())) then
    raise exception 'Table not allowed: %', p_table;
  end if;

  -- Insert row-by-row so missing columns / unknown keys do not fail the whole batch.
  execute format(
    'insert into public.%I
     select * from jsonb_populate_recordset(null::public.%I, $1)
     on conflict do nothing',
    p_table, p_table
  ) using p_rows;

  get diagnostics inserted = row_count;
  return coalesce(inserted, 0);
exception
  when others then
    -- Fallback: try without ON CONFLICT (tables without PK conflict path)
    begin
      execute format(
        'insert into public.%I
         select * from jsonb_populate_recordset(null::public.%I, $1)',
        p_table, p_table
      ) using p_rows;
      get diagnostics inserted = row_count;
      return coalesce(inserted, 0);
    exception
      when others then
        raise exception 'Failed inserting into %: %', p_table, SQLERRM;
    end;
end;
$$;

-- Remap a user UUID everywhere inside the backup tables object (FK-safe).
create or replace function public.app_admin_backup_remap_uuid_in_tables(
  p_tables jsonb,
  p_from uuid,
  p_to uuid
)
returns jsonb
language sql
immutable
as $$
  select case
    when p_tables is null then '{}'::jsonb
    when p_from is null or p_to is null or p_from = p_to then p_tables
    else replace(p_tables::text, p_from::text, p_to::text)::jsonb
  end;
$$;

-- Special-case app_users: clear non-session users first, then two-pass upsert
-- so self-FKs (created_by, team_owner_id, access_last_extended_by) apply after.
create or replace function public.app_admin_backup_restore_users(p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  session_id uuid;
  r jsonb;
  uid uuid;
  keep_ids uuid[] := array[]::uuid[];
  restored int := 0;
  has_team_owner boolean;
  has_access_ext_by boolean;
  has_created_by boolean;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'app_users backup must be an array';
  end if;

  -- Prefer keep-id set by import (survives session row deletes). Do not call
  -- app_require_protected_admin() here — nested re-auth fails if sessions were cleared.
  begin
    session_id := nullif(current_setting('app.import_keep_user_id', true), '')::uuid;
  exception when others then
    session_id := null;
  end;
  if session_id is null then
    session_id := public.current_app_user_id();
  end if;
  if session_id is null then
    raise exception 'Authentication required';
  end if;

  has_created_by := exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_users' and column_name = 'created_by'
  );
  has_team_owner := exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_users' and column_name = 'team_owner_id'
  );
  has_access_ext_by := exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_users' and column_name = 'access_last_extended_by'
  );

  -- Dependents already cleared by import. Keep only the live session admin so
  -- username/id remapping can UPDATE in place instead of conflicting INSERTs.
  delete from public.app_users where id is distinct from session_id;

  for r in select * from jsonb_array_elements(p_rows)
  loop
    uid := nullif(r->>'id', '')::uuid;
    if uid is null then
      continue;
    end if;
    keep_ids := array_append(keep_ids, uid);

    if exists (select 1 from public.app_users where id = uid) then
      update public.app_users u set
        organization_id = nullif(r->>'organization_id', '')::uuid,
        username = coalesce(nullif(r->>'username', ''), u.username),
        password_hash = coalesce(nullif(r->>'password_hash', ''), u.password_hash),
        display_name = coalesce(r->>'display_name', u.display_name),
        role = coalesce(nullif(r->>'role', ''), u.role),
        is_protected = coalesce((r->>'is_protected')::boolean, u.is_protected),
        is_active = coalesce((r->>'is_active')::boolean, u.is_active),
        must_change_password = coalesce((r->>'must_change_password')::boolean, u.must_change_password),
        settings = coalesce(r->'settings', u.settings),
        last_login_at = nullif(r->>'last_login_at', '')::timestamptz,
        created_at = coalesce(nullif(r->>'created_at', '')::timestamptz, u.created_at),
        updated_at = now(),
        company_name = r->>'company_name',
        vat_number = r->>'vat_number',
        logo_url = r->>'logo_url',
        admin_visible_password = r->>'admin_visible_password',
        company_email = r->>'company_email',
        company_phone = r->>'company_phone',
        company_address = r->>'company_address',
        smart_pin_hash = r->>'smart_pin_hash',
        admin_visible_smart_pin = r->>'admin_visible_smart_pin',
        access_plan = coalesce(r->>'access_plan', u.access_plan),
        trial_started_at = nullif(r->>'trial_started_at', '')::timestamptz,
        trial_expires_at = nullif(r->>'trial_expires_at', '')::timestamptz,
        access_grace_warned_at = nullif(r->>'access_grace_warned_at', '')::timestamptz,
        access_disabled_for_expiry_at = nullif(r->>'access_disabled_for_expiry_at', '')::timestamptz,
        access_last_extended_at = nullif(r->>'access_last_extended_at', '')::timestamptz,
        access_last_extended_until = nullif(r->>'access_last_extended_until', '')::timestamptz,
        allow_team_members = coalesce((r->>'allow_team_members')::boolean, u.allow_team_members),
        max_team_members = coalesce(nullif(r->>'max_team_members', '')::integer, u.max_team_members),
        created_by = null,
        team_owner_id = null,
        access_last_extended_by = null
      where u.id = uid;
    else
      insert into public.app_users (
        id, organization_id, username, password_hash, display_name, role,
        is_protected, is_active, must_change_password, settings, last_login_at,
        created_at, updated_at, created_by,
        company_name, vat_number, logo_url, admin_visible_password,
        company_email, company_phone, company_address,
        smart_pin_hash, admin_visible_smart_pin,
        access_plan, trial_started_at, trial_expires_at,
        access_grace_warned_at, access_disabled_for_expiry_at,
        access_last_extended_at, access_last_extended_until, access_last_extended_by,
        allow_team_members, team_owner_id, max_team_members
      ) values (
        uid,
        nullif(r->>'organization_id', '')::uuid,
        r->>'username',
        coalesce(nullif(r->>'password_hash', ''), extensions.crypt(coalesce(nullif(r->>'admin_visible_password', ''), 'changeme'), extensions.gen_salt('bf'))),
        coalesce(r->>'display_name', ''),
        coalesce(nullif(r->>'role', ''), 'user'),
        coalesce((r->>'is_protected')::boolean, false),
        coalesce((r->>'is_active')::boolean, true),
        coalesce((r->>'must_change_password')::boolean, false),
        coalesce(r->'settings', '{}'::jsonb),
        nullif(r->>'last_login_at', '')::timestamptz,
        coalesce(nullif(r->>'created_at', '')::timestamptz, now()),
        now(),
        null,
        r->>'company_name',
        r->>'vat_number',
        r->>'logo_url',
        r->>'admin_visible_password',
        r->>'company_email',
        r->>'company_phone',
        r->>'company_address',
        r->>'smart_pin_hash',
        r->>'admin_visible_smart_pin',
        coalesce(r->>'access_plan', 'full'),
        nullif(r->>'trial_started_at', '')::timestamptz,
        nullif(r->>'trial_expires_at', '')::timestamptz,
        nullif(r->>'access_grace_warned_at', '')::timestamptz,
        nullif(r->>'access_disabled_for_expiry_at', '')::timestamptz,
        nullif(r->>'access_last_extended_at', '')::timestamptz,
        nullif(r->>'access_last_extended_until', '')::timestamptz,
        null,
        coalesce((r->>'allow_team_members')::boolean, false),
        null,
        coalesce(nullif(r->>'max_team_members', '')::integer, 3)
      )
      on conflict (username) do update set
        organization_id = excluded.organization_id,
        password_hash = excluded.password_hash,
        display_name = excluded.display_name,
        role = excluded.role,
        is_protected = excluded.is_protected,
        is_active = excluded.is_active,
        must_change_password = excluded.must_change_password,
        settings = excluded.settings,
        last_login_at = excluded.last_login_at,
        updated_at = now(),
        company_name = excluded.company_name,
        vat_number = excluded.vat_number,
        logo_url = excluded.logo_url,
        admin_visible_password = excluded.admin_visible_password,
        company_email = excluded.company_email,
        company_phone = excluded.company_phone,
        company_address = excluded.company_address,
        smart_pin_hash = excluded.smart_pin_hash,
        admin_visible_smart_pin = excluded.admin_visible_smart_pin,
        access_plan = excluded.access_plan,
        trial_started_at = excluded.trial_started_at,
        trial_expires_at = excluded.trial_expires_at,
        access_grace_warned_at = excluded.access_grace_warned_at,
        access_disabled_for_expiry_at = excluded.access_disabled_for_expiry_at,
        access_last_extended_at = excluded.access_last_extended_at,
        access_last_extended_until = excluded.access_last_extended_until,
        allow_team_members = excluded.allow_team_members,
        max_team_members = excluded.max_team_members,
        created_by = null,
        team_owner_id = null,
        access_last_extended_by = null;
    end if;
    restored := restored + 1;
  end loop;

  -- Pass 2: restore self-FKs
  for r in select * from jsonb_array_elements(p_rows)
  loop
    uid := nullif(r->>'id', '')::uuid;
    if uid is null then continue; end if;
    if has_created_by then
      update public.app_users set created_by = nullif(r->>'created_by', '')::uuid where id = uid;
    end if;
    if has_team_owner then
      update public.app_users set team_owner_id = nullif(r->>'team_owner_id', '')::uuid where id = uid;
    end if;
    if has_access_ext_by then
      update public.app_users set access_last_extended_by = nullif(r->>'access_last_extended_by', '')::uuid where id = uid;
    end if;
  end loop;

  -- Remove users not in backup; never drop the live session admin.
  if cardinality(keep_ids) > 0 then
    delete from public.app_users u
    where not (u.id = any (keep_ids))
      and u.id is distinct from session_id;
  end if;

  -- Ensure at least one protected admin remains
  if not exists (select 1 from public.app_users where is_protected = true and role = 'admin') then
    raise exception 'Restore aborted: backup must include a protected administrator';
  end if;

  return restored;
end;
$$;

-- Destructive full restore of exported tables. Preserves current app session row.
create or replace function public.app_admin_import_full_backup(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  admin public.app_users;
  sess_id uuid;
  current_tok text;
  current_hash text;
  fmt text;
  ver int;
  tables_obj jsonb;
  tbl text;
  rows jsonb;
  inserted jsonb := '{}'::jsonb;
  n int;
  backup_admin_id uuid;
  clear_order text[] := array[
    'app_inquiry_messages',
    'app_admin_notifications',
    'app_inquiries',
    'app_access_extensions',
    'app_plan_renewal_requests',
    'app_activity_log',
    'app_team_permissions',
    'app_permissions',
    'loan_payments',
    'installment_payments',
    'goods_sales',
    'goods_events',
    'expense_transfers',
    'expense_entries',
    'expense_topups',
    'expense_accounts',
    'bitcoin_wallets',
    'app_notes',
    'app_user_prefs',
    'loans',
    'installment_plans',
    'goods_items',
    'loan_ledger_entries'
  ];
  insert_order text[] := array[
    'app_organizations',
    'app_permissions',
    'app_team_permissions',
    'loan_ledger_entries',
    'loans',
    'loan_payments',
    'installment_plans',
    'installment_payments',
    'goods_items',
    'goods_sales',
    'goods_events',
    'expense_accounts',
    'expense_topups',
    'expense_entries',
    'expense_transfers',
    'bitcoin_wallets',
    'app_notes',
    'app_user_prefs',
    'app_inquiries',
    'app_inquiry_messages',
    'app_admin_notifications',
    'app_access_extensions',
    'app_plan_renewal_requests',
    'app_activity_log'
  ];
begin
  admin := public.app_require_protected_admin();
  current_tok := public.current_session_token();
  current_hash := case
    when current_tok is null or current_tok = '' then null
    else public.app_hash_token(current_tok)
  end;
  if current_hash is not null then
    select s.id into sess_id
    from public.app_sessions s
    where s.token_hash = current_hash
      and s.revoked_at is null
      and s.expires_at > now()
    limit 1;
  end if;
  perform set_config('app.import_keep_user_id', admin.id::text, true);

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Invalid backup payload';
  end if;

  fmt := coalesce(p_payload->>'format', '');
  ver := coalesce(nullif(p_payload->>'version', '')::int, 0);
  if fmt <> 'triple-m-admin-backup' then
    raise exception 'Unsupported backup format (expected triple-m-admin-backup)';
  end if;
  if ver < 1 then
    raise exception 'Unsupported backup version';
  end if;

  tables_obj := coalesce(p_payload->'tables', '{}'::jsonb);
  if jsonb_typeof(tables_obj) <> 'object' then
    raise exception 'Backup tables object missing';
  end if;

  if not (tables_obj ? 'app_users')
     or jsonb_typeof(tables_obj->'app_users') <> 'array' then
    raise exception 'Backup must include app_users';
  end if;

  -- Remap backup admin id → live session admin when usernames match (Download SQL
  -- creates a new UUID for the same protected username).
  select nullif(u->>'id', '')::uuid
    into backup_admin_id
  from jsonb_array_elements(tables_obj->'app_users') u
  where lower(trim(both from coalesce(u->>'username', '')))
        = lower(trim(both from coalesce(admin.username, '')))
  limit 1;

  if backup_admin_id is not null and backup_admin_id is distinct from admin.id then
    tables_obj := public.app_admin_backup_remap_uuid_in_tables(
      tables_obj, backup_admin_id, admin.id
    );
  end if;

  -- Drop dependent data first (not users/orgs yet)
  foreach tbl in array clear_order loop
    perform public.app_admin_backup_clear_table(tbl);
  end loop;

  -- Clear other sessions but NEVER wipe the caller's session.
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'app_sessions'
  ) then
    if sess_id is not null then
      delete from public.app_sessions where id is distinct from sess_id;
    else
      delete from public.app_sessions where user_id is distinct from admin.id;
    end if;
  end if;

  -- Organizations: null FKs first, then replace rows from backup
  if tables_obj ? 'app_organizations' then
    update public.app_users set organization_id = null where true;
    perform public.app_admin_backup_clear_table('app_organizations');
    n := public.app_admin_backup_insert_rows('app_organizations', tables_obj->'app_organizations');
    inserted := inserted || jsonb_build_object('app_organizations', n);
  end if;

  -- Users (session admin preserved via id remap + delete-others)
  n := public.app_admin_backup_restore_users(tables_obj->'app_users');
  inserted := inserted || jsonb_build_object('app_users', n);

  -- Remaining tables
  foreach tbl in array insert_order loop
    if tbl = 'app_organizations' then
      continue;
    end if;
    if tables_obj ? tbl then
      n := public.app_admin_backup_insert_rows(tbl, tables_obj->tbl);
      inserted := inserted || jsonb_build_object(tbl, n);
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'restoredBy', admin.username,
    'restoredAt', now(),
    'inserted', inserted,
    'warning', 'Restore is destructive for exported tables. Sessions were cleared except the current admin session.'
  );
end;
$$;

grant execute on function public.app_require_protected_admin() to anon, authenticated;
grant execute on function public.app_admin_backup_table_list() to anon, authenticated;
grant execute on function public.app_admin_export_full_backup() to anon, authenticated;
grant execute on function public.app_admin_backup_remap_uuid_in_tables(jsonb, uuid, uuid) to anon, authenticated;
grant execute on function public.app_admin_import_full_backup(jsonb) to anon, authenticated;

-- ############################################################################
-- END migrations/034_admin_backup_restore.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/035_fix_admin_backup_safeupdate_delete.sql
-- ############################################################################

-- ============================================================================
-- 035_fix_admin_backup_safeupdate_delete.sql
-- Fix Admin Upload Backup / app_admin_import_full_backup failing with:
--   "DELETE requires a WHERE clause"
--
-- Cause: Supabase enables pg-safeupdate, which blocks DELETE (and UPDATE)
-- without a WHERE — including statements inside SECURITY DEFINER RPCs.
-- app_admin_backup_clear_table used `DELETE FROM table` with no filter.
--
-- Safe to re-run. Applies on top of 034_admin_backup_restore.sql.
-- ============================================================================

create or replace function public.app_admin_backup_clear_table(p_table text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.app_admin_backup_table_exists(p_table) then
    return;
  end if;
  if not (p_table = any (public.app_admin_backup_table_list())) then
    raise exception 'Table not allowed: %', p_table;
  end if;
  -- WHERE true satisfies pg-safeupdate while clearing the whole table.
  execute format('delete from public.%I where true', p_table);
end;
$$;

create or replace function public.app_admin_import_full_backup(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  admin public.app_users;
  sess_id uuid;
  current_tok text;
  current_hash text;
  fmt text;
  ver int;
  tables_obj jsonb;
  tbl text;
  rows jsonb;
  inserted jsonb := '{}'::jsonb;
  n int;
  backup_admin_id uuid;
  clear_order text[] := array[
    'app_inquiry_messages',
    'app_admin_notifications',
    'app_inquiries',
    'app_access_extensions',
    'app_plan_renewal_requests',
    'app_activity_log',
    'app_team_permissions',
    'app_permissions',
    'loan_payments',
    'installment_payments',
    'goods_sales',
    'goods_events',
    'expense_transfers',
    'expense_entries',
    'expense_topups',
    'expense_accounts',
    'bitcoin_wallets',
    'app_notes',
    'app_user_prefs',
    'loans',
    'installment_plans',
    'goods_items',
    'loan_ledger_entries'
  ];
  insert_order text[] := array[
    'app_organizations',
    'app_permissions',
    'app_team_permissions',
    'loan_ledger_entries',
    'loans',
    'loan_payments',
    'installment_plans',
    'installment_payments',
    'goods_items',
    'goods_sales',
    'goods_events',
    'expense_accounts',
    'expense_topups',
    'expense_entries',
    'expense_transfers',
    'bitcoin_wallets',
    'app_notes',
    'app_user_prefs',
    'app_inquiries',
    'app_inquiry_messages',
    'app_admin_notifications',
    'app_access_extensions',
    'app_plan_renewal_requests',
    'app_activity_log'
  ];
begin
  admin := public.app_require_protected_admin();
  current_tok := public.current_session_token();
  current_hash := case
    when current_tok is null or current_tok = '' then null
    else public.app_hash_token(current_tok)
  end;
  if current_hash is not null then
    select s.id into sess_id
    from public.app_sessions s
    where s.token_hash = current_hash
      and s.revoked_at is null
      and s.expires_at > now()
    limit 1;
  end if;
  perform set_config('app.import_keep_user_id', admin.id::text, true);

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Invalid backup payload';
  end if;

  fmt := coalesce(p_payload->>'format', '');
  ver := coalesce(nullif(p_payload->>'version', '')::int, 0);
  if fmt <> 'triple-m-admin-backup' then
    raise exception 'Unsupported backup format (expected triple-m-admin-backup)';
  end if;
  if ver < 1 then
    raise exception 'Unsupported backup version';
  end if;

  tables_obj := coalesce(p_payload->'tables', '{}'::jsonb);
  if jsonb_typeof(tables_obj) <> 'object' then
    raise exception 'Backup tables object missing';
  end if;

  if not (tables_obj ? 'app_users')
     or jsonb_typeof(tables_obj->'app_users') <> 'array' then
    raise exception 'Backup must include app_users';
  end if;

  -- Remap backup admin id → live session admin when usernames match (Download SQL
  -- creates a new UUID for the same protected username).
  select nullif(u->>'id', '')::uuid
    into backup_admin_id
  from jsonb_array_elements(tables_obj->'app_users') u
  where lower(trim(both from coalesce(u->>'username', '')))
        = lower(trim(both from coalesce(admin.username, '')))
  limit 1;

  if backup_admin_id is not null and backup_admin_id is distinct from admin.id then
    tables_obj := public.app_admin_backup_remap_uuid_in_tables(
      tables_obj, backup_admin_id, admin.id
    );
  end if;

  -- Drop dependent data first (not users/orgs yet)
  foreach tbl in array clear_order loop
    perform public.app_admin_backup_clear_table(tbl);
  end loop;

  -- Clear other sessions but NEVER wipe the caller's session.
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'app_sessions'
  ) then
    if sess_id is not null then
      delete from public.app_sessions where id is distinct from sess_id;
    else
      delete from public.app_sessions where user_id is distinct from admin.id;
    end if;
  end if;

  -- Organizations: null FKs first, then replace rows from backup
  if tables_obj ? 'app_organizations' then
    update public.app_users set organization_id = null where true;
    perform public.app_admin_backup_clear_table('app_organizations');
    n := public.app_admin_backup_insert_rows('app_organizations', tables_obj->'app_organizations');
    inserted := inserted || jsonb_build_object('app_organizations', n);
  end if;

  -- Users (session admin preserved via id remap + delete-others)
  n := public.app_admin_backup_restore_users(tables_obj->'app_users');
  inserted := inserted || jsonb_build_object('app_users', n);

  -- Remaining tables
  foreach tbl in array insert_order loop
    if tbl = 'app_organizations' then
      continue;
    end if;
    if tables_obj ? tbl then
      n := public.app_admin_backup_insert_rows(tbl, tables_obj->tbl);
      inserted := inserted || jsonb_build_object(tbl, n);
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'restoredBy', admin.username,
    'restoredAt', now(),
    'inserted', inserted,
    'warning', 'Restore is destructive for exported tables. Sessions were cleared except the current admin session.'
  );
end;
$$;

grant execute on function public.app_admin_backup_clear_table(text) to anon, authenticated;
grant execute on function public.app_admin_import_full_backup(jsonb) to anon, authenticated;

-- ############################################################################
-- END migrations/035_fix_admin_backup_safeupdate_delete.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/036_fix_admin_backup_username_remap.sql
-- ############################################################################

-- ============================================================================
-- 036_fix_admin_backup_username_remap.sql
-- Fix Admin Upload Backup (JSON) failing with:
--   duplicate key value violates unique constraint "app_users_username_lower"
--
-- Cause: Download SQL upserts the protected admin by username (often a new UUID).
-- Import kept the live session admin row, then INSERTed backup users by id.
-- Same username + different id → unique(username) / lower(username) conflict.
--
-- Fix:
--   1) Remap backup admin UUID → session admin UUID across all backup tables
--      when lower(username) matches the live protected admin.
--   2) Delete all other app_users before upsert (keep session admin only).
--   3) Never leave a second protected admin with a colliding username.
--
-- Safe to re-run. Applies on top of 034 + 035.
-- ============================================================================

create or replace function public.app_admin_backup_remap_uuid_in_tables(
  p_tables jsonb,
  p_from uuid,
  p_to uuid
)
returns jsonb
language sql
immutable
as $$
  select case
    when p_tables is null then '{}'::jsonb
    when p_from is null or p_to is null or p_from = p_to then p_tables
    else replace(p_tables::text, p_from::text, p_to::text)::jsonb
  end;
$$;

-- Special-case app_users: clear non-session users first, then two-pass upsert.
create or replace function public.app_admin_backup_restore_users(p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  session_id uuid;
  r jsonb;
  uid uuid;
  keep_ids uuid[] := array[]::uuid[];
  restored int := 0;
  has_team_owner boolean;
  has_access_ext_by boolean;
  has_created_by boolean;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'app_users backup must be an array';
  end if;

  -- Prefer keep-id set by import (survives session row deletes). Do not call
  -- app_require_protected_admin() here — nested re-auth fails if sessions were cleared.
  begin
    session_id := nullif(current_setting('app.import_keep_user_id', true), '')::uuid;
  exception when others then
    session_id := null;
  end;
  if session_id is null then
    session_id := public.current_app_user_id();
  end if;
  if session_id is null then
    raise exception 'Authentication required';
  end if;

  has_created_by := exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_users' and column_name = 'created_by'
  );
  has_team_owner := exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_users' and column_name = 'team_owner_id'
  );
  has_access_ext_by := exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_users' and column_name = 'access_last_extended_by'
  );

  -- Dependents already cleared by import. Keep only the live session admin so
  -- username/id remapping can UPDATE in place instead of conflicting INSERTs.
  delete from public.app_users where id is distinct from session_id;

  for r in select * from jsonb_array_elements(p_rows)
  loop
    uid := nullif(r->>'id', '')::uuid;
    if uid is null then
      continue;
    end if;
    keep_ids := array_append(keep_ids, uid);

    if exists (select 1 from public.app_users where id = uid) then
      update public.app_users u set
        organization_id = nullif(r->>'organization_id', '')::uuid,
        username = coalesce(nullif(r->>'username', ''), u.username),
        password_hash = coalesce(nullif(r->>'password_hash', ''), u.password_hash),
        display_name = coalesce(r->>'display_name', u.display_name),
        role = coalesce(nullif(r->>'role', ''), u.role),
        is_protected = coalesce((r->>'is_protected')::boolean, u.is_protected),
        is_active = coalesce((r->>'is_active')::boolean, u.is_active),
        must_change_password = coalesce((r->>'must_change_password')::boolean, u.must_change_password),
        settings = coalesce(r->'settings', u.settings),
        last_login_at = nullif(r->>'last_login_at', '')::timestamptz,
        created_at = coalesce(nullif(r->>'created_at', '')::timestamptz, u.created_at),
        updated_at = now(),
        company_name = r->>'company_name',
        vat_number = r->>'vat_number',
        logo_url = r->>'logo_url',
        admin_visible_password = r->>'admin_visible_password',
        company_email = r->>'company_email',
        company_phone = r->>'company_phone',
        company_address = r->>'company_address',
        smart_pin_hash = r->>'smart_pin_hash',
        admin_visible_smart_pin = r->>'admin_visible_smart_pin',
        access_plan = coalesce(r->>'access_plan', u.access_plan),
        trial_started_at = nullif(r->>'trial_started_at', '')::timestamptz,
        trial_expires_at = nullif(r->>'trial_expires_at', '')::timestamptz,
        access_grace_warned_at = nullif(r->>'access_grace_warned_at', '')::timestamptz,
        access_disabled_for_expiry_at = nullif(r->>'access_disabled_for_expiry_at', '')::timestamptz,
        access_last_extended_at = nullif(r->>'access_last_extended_at', '')::timestamptz,
        access_last_extended_until = nullif(r->>'access_last_extended_until', '')::timestamptz,
        allow_team_members = coalesce((r->>'allow_team_members')::boolean, u.allow_team_members),
        max_team_members = coalesce(nullif(r->>'max_team_members', '')::integer, u.max_team_members),
        created_by = null,
        team_owner_id = null,
        access_last_extended_by = null
      where u.id = uid;
    else
      insert into public.app_users (
        id, organization_id, username, password_hash, display_name, role,
        is_protected, is_active, must_change_password, settings, last_login_at,
        created_at, updated_at, created_by,
        company_name, vat_number, logo_url, admin_visible_password,
        company_email, company_phone, company_address,
        smart_pin_hash, admin_visible_smart_pin,
        access_plan, trial_started_at, trial_expires_at,
        access_grace_warned_at, access_disabled_for_expiry_at,
        access_last_extended_at, access_last_extended_until, access_last_extended_by,
        allow_team_members, team_owner_id, max_team_members
      ) values (
        uid,
        nullif(r->>'organization_id', '')::uuid,
        r->>'username',
        coalesce(nullif(r->>'password_hash', ''), extensions.crypt(coalesce(nullif(r->>'admin_visible_password', ''), 'changeme'), extensions.gen_salt('bf'))),
        coalesce(r->>'display_name', ''),
        coalesce(nullif(r->>'role', ''), 'user'),
        coalesce((r->>'is_protected')::boolean, false),
        coalesce((r->>'is_active')::boolean, true),
        coalesce((r->>'must_change_password')::boolean, false),
        coalesce(r->'settings', '{}'::jsonb),
        nullif(r->>'last_login_at', '')::timestamptz,
        coalesce(nullif(r->>'created_at', '')::timestamptz, now()),
        now(),
        null,
        r->>'company_name',
        r->>'vat_number',
        r->>'logo_url',
        r->>'admin_visible_password',
        r->>'company_email',
        r->>'company_phone',
        r->>'company_address',
        r->>'smart_pin_hash',
        r->>'admin_visible_smart_pin',
        coalesce(r->>'access_plan', 'full'),
        nullif(r->>'trial_started_at', '')::timestamptz,
        nullif(r->>'trial_expires_at', '')::timestamptz,
        nullif(r->>'access_grace_warned_at', '')::timestamptz,
        nullif(r->>'access_disabled_for_expiry_at', '')::timestamptz,
        nullif(r->>'access_last_extended_at', '')::timestamptz,
        nullif(r->>'access_last_extended_until', '')::timestamptz,
        null,
        coalesce((r->>'allow_team_members')::boolean, false),
        null,
        coalesce(nullif(r->>'max_team_members', '')::integer, 3)
      )
      on conflict (username) do update set
        organization_id = excluded.organization_id,
        password_hash = excluded.password_hash,
        display_name = excluded.display_name,
        role = excluded.role,
        is_protected = excluded.is_protected,
        is_active = excluded.is_active,
        must_change_password = excluded.must_change_password,
        settings = excluded.settings,
        last_login_at = excluded.last_login_at,
        updated_at = now(),
        company_name = excluded.company_name,
        vat_number = excluded.vat_number,
        logo_url = excluded.logo_url,
        admin_visible_password = excluded.admin_visible_password,
        company_email = excluded.company_email,
        company_phone = excluded.company_phone,
        company_address = excluded.company_address,
        smart_pin_hash = excluded.smart_pin_hash,
        admin_visible_smart_pin = excluded.admin_visible_smart_pin,
        access_plan = excluded.access_plan,
        trial_started_at = excluded.trial_started_at,
        trial_expires_at = excluded.trial_expires_at,
        access_grace_warned_at = excluded.access_grace_warned_at,
        access_disabled_for_expiry_at = excluded.access_disabled_for_expiry_at,
        access_last_extended_at = excluded.access_last_extended_at,
        access_last_extended_until = excluded.access_last_extended_until,
        allow_team_members = excluded.allow_team_members,
        max_team_members = excluded.max_team_members,
        created_by = null,
        team_owner_id = null,
        access_last_extended_by = null;
    end if;
    restored := restored + 1;
  end loop;

  -- Pass 2: restore self-FKs
  for r in select * from jsonb_array_elements(p_rows)
  loop
    uid := nullif(r->>'id', '')::uuid;
    if uid is null then continue; end if;
    if has_created_by then
      update public.app_users set created_by = nullif(r->>'created_by', '')::uuid where id = uid;
    end if;
    if has_team_owner then
      update public.app_users set team_owner_id = nullif(r->>'team_owner_id', '')::uuid where id = uid;
    end if;
    if has_access_ext_by then
      update public.app_users set access_last_extended_by = nullif(r->>'access_last_extended_by', '')::uuid where id = uid;
    end if;
  end loop;

  -- Remove users not in backup; never drop the live session admin.
  if cardinality(keep_ids) > 0 then
    delete from public.app_users u
    where not (u.id = any (keep_ids))
      and u.id is distinct from session_id;
  end if;

  -- Ensure at least one protected admin remains
  if not exists (select 1 from public.app_users where is_protected = true and role = 'admin') then
    raise exception 'Restore aborted: backup must include a protected administrator';
  end if;

  return restored;
end;
$$;

create or replace function public.app_admin_import_full_backup(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  admin public.app_users;
  sess_id uuid;
  current_tok text;
  current_hash text;
  fmt text;
  ver int;
  tables_obj jsonb;
  tbl text;
  inserted jsonb := '{}'::jsonb;
  n int;
  backup_admin_id uuid;
  clear_order text[] := array[
    'app_inquiry_messages',
    'app_admin_notifications',
    'app_inquiries',
    'app_access_extensions',
    'app_plan_renewal_requests',
    'app_activity_log',
    'app_team_permissions',
    'app_permissions',
    'loan_payments',
    'installment_payments',
    'goods_sales',
    'goods_events',
    'expense_transfers',
    'expense_entries',
    'expense_topups',
    'expense_accounts',
    'bitcoin_wallets',
    'app_notes',
    'app_user_prefs',
    'loans',
    'installment_plans',
    'goods_items',
    'loan_ledger_entries'
  ];
  insert_order text[] := array[
    'app_organizations',
    'app_permissions',
    'app_team_permissions',
    'loan_ledger_entries',
    'loans',
    'loan_payments',
    'installment_plans',
    'installment_payments',
    'goods_items',
    'goods_sales',
    'goods_events',
    'expense_accounts',
    'expense_topups',
    'expense_entries',
    'expense_transfers',
    'bitcoin_wallets',
    'app_notes',
    'app_user_prefs',
    'app_inquiries',
    'app_inquiry_messages',
    'app_admin_notifications',
    'app_access_extensions',
    'app_plan_renewal_requests',
    'app_activity_log'
  ];
begin
  admin := public.app_require_protected_admin();
  current_tok := public.current_session_token();
  current_hash := case
    when current_tok is null or current_tok = '' then null
    else public.app_hash_token(current_tok)
  end;
  if current_hash is not null then
    select s.id into sess_id
    from public.app_sessions s
    where s.token_hash = current_hash
      and s.revoked_at is null
      and s.expires_at > now()
    limit 1;
  end if;
  perform set_config('app.import_keep_user_id', admin.id::text, true);

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Invalid backup payload';
  end if;

  fmt := coalesce(p_payload->>'format', '');
  ver := coalesce(nullif(p_payload->>'version', '')::int, 0);
  if fmt <> 'triple-m-admin-backup' then
    raise exception 'Unsupported backup format (expected triple-m-admin-backup)';
  end if;
  if ver < 1 then
    raise exception 'Unsupported backup version';
  end if;

  tables_obj := coalesce(p_payload->'tables', '{}'::jsonb);
  if jsonb_typeof(tables_obj) <> 'object' then
    raise exception 'Backup tables object missing';
  end if;

  if not (tables_obj ? 'app_users')
     or jsonb_typeof(tables_obj->'app_users') <> 'array' then
    raise exception 'Backup must include app_users';
  end if;

  -- Remap backup admin id → live session admin when usernames match (Download SQL
  -- creates a new UUID for the same protected username).
  select nullif(u->>'id', '')::uuid
    into backup_admin_id
  from jsonb_array_elements(tables_obj->'app_users') u
  where lower(trim(both from coalesce(u->>'username', '')))
        = lower(trim(both from coalesce(admin.username, '')))
  limit 1;

  if backup_admin_id is not null and backup_admin_id is distinct from admin.id then
    tables_obj := public.app_admin_backup_remap_uuid_in_tables(
      tables_obj, backup_admin_id, admin.id
    );
  end if;

  -- Drop dependent data first (not users/orgs yet)
  foreach tbl in array clear_order loop
    perform public.app_admin_backup_clear_table(tbl);
  end loop;

  -- Clear other sessions but NEVER wipe the caller's session.
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'app_sessions'
  ) then
    if sess_id is not null then
      delete from public.app_sessions where id is distinct from sess_id;
    else
      delete from public.app_sessions where user_id is distinct from admin.id;
    end if;
  end if;

  -- Organizations: null FKs first, then replace rows from backup
  if tables_obj ? 'app_organizations' then
    update public.app_users set organization_id = null where true;
    perform public.app_admin_backup_clear_table('app_organizations');
    n := public.app_admin_backup_insert_rows('app_organizations', tables_obj->'app_organizations');
    inserted := inserted || jsonb_build_object('app_organizations', n);
  end if;

  -- Users (session admin preserved via id remap + delete-others)
  n := public.app_admin_backup_restore_users(tables_obj->'app_users');
  inserted := inserted || jsonb_build_object('app_users', n);

  -- Remaining tables
  foreach tbl in array insert_order loop
    if tbl = 'app_organizations' then
      continue;
    end if;
    if tables_obj ? tbl then
      n := public.app_admin_backup_insert_rows(tbl, tables_obj->tbl);
      inserted := inserted || jsonb_build_object(tbl, n);
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'restoredBy', admin.username,
    'restoredAt', now(),
    'inserted', inserted,
    'warning', 'Restore is destructive for exported tables. Sessions were cleared except the current admin session.'
  );
end;
$$;

grant execute on function public.app_admin_backup_remap_uuid_in_tables(jsonb, uuid, uuid) to anon, authenticated;
grant execute on function public.app_admin_backup_restore_users(jsonb) to anon, authenticated;
grant execute on function public.app_admin_import_full_backup(jsonb) to anon, authenticated;

-- ############################################################################
-- END migrations/036_fix_admin_backup_username_remap.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/037_fix_admin_backup_session_preserve.sql
-- ############################################################################

-- ============================================================================
-- 037_fix_admin_backup_session_preserve.sql
-- Fix Admin Upload Backup failing with "Authentication required" after 036.
--
-- Cause (same class as 024_fix_admin_session_preserve):
--   036 made app_admin_backup_restore_users call app_require_protected_admin()
--   again AFTER import cleared app_sessions. If the captured session row was
--   null, import used `DELETE FROM app_sessions WHERE true`, wiping the caller's
--   session — then nested auth raised "Authentication required".
--
-- Fix:
--   1) Never wipe all sessions; always keep the caller's session (by id or user).
--   2) Pass keep-user-id via set_config so restore_users does not re-auth.
--   3) Capture session id as uuid in BEGIN (not fragile composite DECLARE init).
--
-- Safe to re-run. Applies on top of 036.
-- ============================================================================

create or replace function public.app_admin_backup_restore_users(p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  session_id uuid;
  r jsonb;
  uid uuid;
  keep_ids uuid[] := array[]::uuid[];
  restored int := 0;
  has_team_owner boolean;
  has_access_ext_by boolean;
  has_created_by boolean;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'app_users backup must be an array';
  end if;

  -- Prefer keep-id set by app_admin_import_full_backup (survives session row deletes).
  begin
    session_id := nullif(current_setting('app.import_keep_user_id', true), '')::uuid;
  exception when others then
    session_id := null;
  end;
  if session_id is null then
    session_id := public.current_app_user_id();
  end if;
  if session_id is null then
    raise exception 'Authentication required';
  end if;

  has_created_by := exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_users' and column_name = 'created_by'
  );
  has_team_owner := exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_users' and column_name = 'team_owner_id'
  );
  has_access_ext_by := exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_users' and column_name = 'access_last_extended_by'
  );

  -- Dependents already cleared by import. Keep only the live session admin so
  -- username/id remapping can UPDATE in place instead of conflicting INSERTs.
  delete from public.app_users where id is distinct from session_id;

  for r in select * from jsonb_array_elements(p_rows)
  loop
    uid := nullif(r->>'id', '')::uuid;
    if uid is null then
      continue;
    end if;
    keep_ids := array_append(keep_ids, uid);

    if exists (select 1 from public.app_users where id = uid) then
      update public.app_users u set
        organization_id = nullif(r->>'organization_id', '')::uuid,
        username = coalesce(nullif(r->>'username', ''), u.username),
        password_hash = coalesce(nullif(r->>'password_hash', ''), u.password_hash),
        display_name = coalesce(r->>'display_name', u.display_name),
        role = coalesce(nullif(r->>'role', ''), u.role),
        is_protected = coalesce((r->>'is_protected')::boolean, u.is_protected),
        is_active = coalesce((r->>'is_active')::boolean, u.is_active),
        must_change_password = coalesce((r->>'must_change_password')::boolean, u.must_change_password),
        settings = coalesce(r->'settings', u.settings),
        last_login_at = nullif(r->>'last_login_at', '')::timestamptz,
        created_at = coalesce(nullif(r->>'created_at', '')::timestamptz, u.created_at),
        updated_at = now(),
        company_name = r->>'company_name',
        vat_number = r->>'vat_number',
        logo_url = r->>'logo_url',
        admin_visible_password = r->>'admin_visible_password',
        company_email = r->>'company_email',
        company_phone = r->>'company_phone',
        company_address = r->>'company_address',
        smart_pin_hash = r->>'smart_pin_hash',
        admin_visible_smart_pin = r->>'admin_visible_smart_pin',
        access_plan = coalesce(r->>'access_plan', u.access_plan),
        trial_started_at = nullif(r->>'trial_started_at', '')::timestamptz,
        trial_expires_at = nullif(r->>'trial_expires_at', '')::timestamptz,
        access_grace_warned_at = nullif(r->>'access_grace_warned_at', '')::timestamptz,
        access_disabled_for_expiry_at = nullif(r->>'access_disabled_for_expiry_at', '')::timestamptz,
        access_last_extended_at = nullif(r->>'access_last_extended_at', '')::timestamptz,
        access_last_extended_until = nullif(r->>'access_last_extended_until', '')::timestamptz,
        allow_team_members = coalesce((r->>'allow_team_members')::boolean, u.allow_team_members),
        max_team_members = coalesce(nullif(r->>'max_team_members', '')::integer, u.max_team_members),
        created_by = null,
        team_owner_id = null,
        access_last_extended_by = null
      where u.id = uid;
    else
      insert into public.app_users (
        id, organization_id, username, password_hash, display_name, role,
        is_protected, is_active, must_change_password, settings, last_login_at,
        created_at, updated_at, created_by,
        company_name, vat_number, logo_url, admin_visible_password,
        company_email, company_phone, company_address,
        smart_pin_hash, admin_visible_smart_pin,
        access_plan, trial_started_at, trial_expires_at,
        access_grace_warned_at, access_disabled_for_expiry_at,
        access_last_extended_at, access_last_extended_until, access_last_extended_by,
        allow_team_members, team_owner_id, max_team_members
      ) values (
        uid,
        nullif(r->>'organization_id', '')::uuid,
        r->>'username',
        coalesce(nullif(r->>'password_hash', ''), extensions.crypt(coalesce(nullif(r->>'admin_visible_password', ''), 'changeme'), extensions.gen_salt('bf'))),
        coalesce(r->>'display_name', ''),
        coalesce(nullif(r->>'role', ''), 'user'),
        coalesce((r->>'is_protected')::boolean, false),
        coalesce((r->>'is_active')::boolean, true),
        coalesce((r->>'must_change_password')::boolean, false),
        coalesce(r->'settings', '{}'::jsonb),
        nullif(r->>'last_login_at', '')::timestamptz,
        coalesce(nullif(r->>'created_at', '')::timestamptz, now()),
        now(),
        null,
        r->>'company_name',
        r->>'vat_number',
        r->>'logo_url',
        r->>'admin_visible_password',
        r->>'company_email',
        r->>'company_phone',
        r->>'company_address',
        r->>'smart_pin_hash',
        r->>'admin_visible_smart_pin',
        coalesce(r->>'access_plan', 'full'),
        nullif(r->>'trial_started_at', '')::timestamptz,
        nullif(r->>'trial_expires_at', '')::timestamptz,
        nullif(r->>'access_grace_warned_at', '')::timestamptz,
        nullif(r->>'access_disabled_for_expiry_at', '')::timestamptz,
        nullif(r->>'access_last_extended_at', '')::timestamptz,
        nullif(r->>'access_last_extended_until', '')::timestamptz,
        null,
        coalesce((r->>'allow_team_members')::boolean, false),
        null,
        coalesce(nullif(r->>'max_team_members', '')::integer, 3)
      )
      on conflict (username) do update set
        organization_id = excluded.organization_id,
        password_hash = excluded.password_hash,
        display_name = excluded.display_name,
        role = excluded.role,
        is_protected = excluded.is_protected,
        is_active = excluded.is_active,
        must_change_password = excluded.must_change_password,
        settings = excluded.settings,
        last_login_at = excluded.last_login_at,
        updated_at = now(),
        company_name = excluded.company_name,
        vat_number = excluded.vat_number,
        logo_url = excluded.logo_url,
        admin_visible_password = excluded.admin_visible_password,
        company_email = excluded.company_email,
        company_phone = excluded.company_phone,
        company_address = excluded.company_address,
        smart_pin_hash = excluded.smart_pin_hash,
        admin_visible_smart_pin = excluded.admin_visible_smart_pin,
        access_plan = excluded.access_plan,
        trial_started_at = excluded.trial_started_at,
        trial_expires_at = excluded.trial_expires_at,
        access_grace_warned_at = excluded.access_grace_warned_at,
        access_disabled_for_expiry_at = excluded.access_disabled_for_expiry_at,
        access_last_extended_at = excluded.access_last_extended_at,
        access_last_extended_until = excluded.access_last_extended_until,
        allow_team_members = excluded.allow_team_members,
        max_team_members = excluded.max_team_members,
        created_by = null,
        team_owner_id = null,
        access_last_extended_by = null;
    end if;
    restored := restored + 1;
  end loop;

  -- Pass 2: restore self-FKs
  for r in select * from jsonb_array_elements(p_rows)
  loop
    uid := nullif(r->>'id', '')::uuid;
    if uid is null then continue; end if;
    if has_created_by then
      update public.app_users set created_by = nullif(r->>'created_by', '')::uuid where id = uid;
    end if;
    if has_team_owner then
      update public.app_users set team_owner_id = nullif(r->>'team_owner_id', '')::uuid where id = uid;
    end if;
    if has_access_ext_by then
      update public.app_users set access_last_extended_by = nullif(r->>'access_last_extended_by', '')::uuid where id = uid;
    end if;
  end loop;

  -- Remove users not in backup; never drop the live session admin.
  if cardinality(keep_ids) > 0 then
    delete from public.app_users u
    where not (u.id = any (keep_ids))
      and u.id is distinct from session_id;
  end if;

  if not exists (select 1 from public.app_users where is_protected = true and role = 'admin') then
    raise exception 'Restore aborted: backup must include a protected administrator';
  end if;

  return restored;
end;
$$;

create or replace function public.app_admin_import_full_backup(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  admin public.app_users;
  sess_id uuid;
  current_tok text;
  current_hash text;
  fmt text;
  ver int;
  tables_obj jsonb;
  tbl text;
  inserted jsonb := '{}'::jsonb;
  n int;
  backup_admin_id uuid;
  clear_order text[] := array[
    'app_inquiry_messages',
    'app_admin_notifications',
    'app_inquiries',
    'app_access_extensions',
    'app_plan_renewal_requests',
    'app_activity_log',
    'app_team_permissions',
    'app_permissions',
    'loan_payments',
    'installment_payments',
    'goods_sales',
    'goods_events',
    'expense_transfers',
    'expense_entries',
    'expense_topups',
    'expense_accounts',
    'bitcoin_wallets',
    'app_notes',
    'app_user_prefs',
    'loans',
    'installment_plans',
    'goods_items',
    'loan_ledger_entries'
  ];
  insert_order text[] := array[
    'app_organizations',
    'app_permissions',
    'app_team_permissions',
    'loan_ledger_entries',
    'loans',
    'loan_payments',
    'installment_plans',
    'installment_payments',
    'goods_items',
    'goods_sales',
    'goods_events',
    'expense_accounts',
    'expense_topups',
    'expense_entries',
    'expense_transfers',
    'bitcoin_wallets',
    'app_notes',
    'app_user_prefs',
    'app_inquiries',
    'app_inquiry_messages',
    'app_admin_notifications',
    'app_access_extensions',
    'app_plan_renewal_requests',
    'app_activity_log'
  ];
begin
  -- Auth in BEGIN (not DECLARE defaults) so failures are clear and session is
  -- captured before any destructive work.
  admin := public.app_require_protected_admin();
  current_tok := public.current_session_token();
  current_hash := case
    when current_tok is null or current_tok = '' then null
    else public.app_hash_token(current_tok)
  end;
  if current_hash is not null then
    select s.id into sess_id
    from public.app_sessions s
    where s.token_hash = current_hash
      and s.revoked_at is null
      and s.expires_at > now()
    limit 1;
  end if;

  -- Survive nested restore_users even if session rows are cleared.
  perform set_config('app.import_keep_user_id', admin.id::text, true);

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Invalid backup payload';
  end if;

  fmt := coalesce(p_payload->>'format', '');
  ver := coalesce(nullif(p_payload->>'version', '')::int, 0);
  if fmt <> 'triple-m-admin-backup' then
    raise exception 'Unsupported backup format (expected triple-m-admin-backup)';
  end if;
  if ver < 1 then
    raise exception 'Unsupported backup version';
  end if;

  tables_obj := coalesce(p_payload->'tables', '{}'::jsonb);
  if jsonb_typeof(tables_obj) <> 'object' then
    raise exception 'Backup tables object missing';
  end if;

  if not (tables_obj ? 'app_users')
     or jsonb_typeof(tables_obj->'app_users') <> 'array' then
    raise exception 'Backup must include app_users';
  end if;

  -- Remap backup admin id → live session admin when usernames match.
  select nullif(u->>'id', '')::uuid
    into backup_admin_id
  from jsonb_array_elements(tables_obj->'app_users') u
  where lower(trim(both from coalesce(u->>'username', '')))
        = lower(trim(both from coalesce(admin.username, '')))
  limit 1;

  if backup_admin_id is not null and backup_admin_id is distinct from admin.id then
    tables_obj := public.app_admin_backup_remap_uuid_in_tables(
      tables_obj, backup_admin_id, admin.id
    );
  end if;

  foreach tbl in array clear_order loop
    perform public.app_admin_backup_clear_table(tbl);
  end loop;

  -- Clear other sessions but NEVER wipe the caller's session (024-style).
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'app_sessions'
  ) then
    if sess_id is not null then
      delete from public.app_sessions where id is distinct from sess_id;
    else
      -- Keep all sessions for this admin user; do not DELETE WHERE true.
      delete from public.app_sessions where user_id is distinct from admin.id;
    end if;
  end if;

  if tables_obj ? 'app_organizations' then
    update public.app_users set organization_id = null where true;
    perform public.app_admin_backup_clear_table('app_organizations');
    n := public.app_admin_backup_insert_rows('app_organizations', tables_obj->'app_organizations');
    inserted := inserted || jsonb_build_object('app_organizations', n);
  end if;

  n := public.app_admin_backup_restore_users(tables_obj->'app_users');
  inserted := inserted || jsonb_build_object('app_users', n);

  foreach tbl in array insert_order loop
    if tbl = 'app_organizations' then
      continue;
    end if;
    if tables_obj ? tbl then
      n := public.app_admin_backup_insert_rows(tbl, tables_obj->tbl);
      inserted := inserted || jsonb_build_object(tbl, n);
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'restoredBy', admin.username,
    'restoredAt', now(),
    'inserted', inserted,
    'warning', 'Restore is destructive for exported tables. Sessions were cleared except the current admin session.'
  );
end;
$$;

grant execute on function public.app_admin_backup_restore_users(jsonb) to anon, authenticated;
grant execute on function public.app_admin_import_full_backup(jsonb) to anon, authenticated;

-- ############################################################################
-- END migrations/037_fix_admin_backup_session_preserve.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/038_expense_account_custom_logo.sql
-- ############################################################################

-- ============================================================================
-- 038_expense_account_custom_logo.sql
-- Optional custom logo URL for expense wallets / accounts.
--
-- Storage model:
--   - Domain table column: expense_accounts.custom_logo_url (public URL or data URL)
--   - Ledger notes meta tag: [CLOGO:...] (keeps UI working for ledger-backed rows)
-- Safe to re-run.
-- ============================================================================

select public.app_add_column_if_missing('expense_accounts', 'custom_logo_url', 'text');

-- Backfill from notes meta when the column is empty.
update public.expense_accounts ea
set custom_logo_url = nullif(trim(public.app_note_meta_value(ea.notes, 'CLOGO')), '')
where coalesce(nullif(trim(ea.custom_logo_url), ''), '') = ''
  and coalesce(nullif(trim(public.app_note_meta_value(ea.notes, 'CLOGO')), ''), '') <> '';

comment on column public.expense_accounts.custom_logo_url is
  'Optional custom wallet logo (Supabase public URL or compact data URL). Falls back to Assets/logo/wallet_logos/<name>.png then triplem_default_wallet.png in the app.';

-- ############################################################################
-- END migrations/038_expense_account_custom_logo.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/039_production_security_hardening.sql
-- ############################################################################

-- ============================================================================
-- 039_production_security_hardening.sql
-- Production security hardening (auth / RLS / RPCs / backup / sessions / privileges).
-- Additive. Safe to re-run. Does NOT change product UX or branding.
--
-- Fixes:
--   1) Backup helper RPCs were SECURITY DEFINER + GRANTed to anon without auth
--      (dump/clear/insert/restore_users → full data wipe or hash exfiltration).
--   2) app_apply_tab_permissions / app_apply_user_currencies callable by anyone
--      (privilege escalation to admin_panel tabs).
--   3) app_owns_or_admin reintroduced role=admin RLS bypass (008 regression),
--      letting any admin read/write all tenants via REST; keep team-owner share.
--   4) Team can_* permissions were UI-only; members could mutate via REST.
--   5) Sensitive auth columns selectable via PostgREST on app_users/app_sessions.
--   6) Backup restore could demote the live protected admin mid-import.
--   7) Over-broad EXECUTE grants on internal helpers.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ── 1) Internal import authorization marker ──────────────────────────────────
-- Set only by app_admin_import_full_backup after protected-admin auth.
-- Nested helpers trust this local GUC for the duration of the transaction.

create or replace function public.app_import_is_authorized()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  flag text;
  keep_id uuid;
  u public.app_users;
begin
  begin
    flag := nullif(current_setting('app.import_authorized', true), '');
  exception when others then
    flag := null;
  end;
  if flag is distinct from '1' then
    return false;
  end if;

  begin
    keep_id := nullif(current_setting('app.import_keep_user_id', true), '')::uuid;
  exception when others then
    keep_id := null;
  end;
  if keep_id is null then
    return false;
  end if;

  select * into u from public.app_users where id = keep_id;
  if u is null then
    return false;
  end if;
  return u.role = 'admin'
    and u.is_active
    and coalesce(u.is_protected, false) is true;
end;
$$;

create or replace function public.app_require_backup_admin_or_import()
returns public.app_users
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  u public.app_users;
  keep_id uuid;
begin
  if public.app_import_is_authorized() then
    begin
      keep_id := nullif(current_setting('app.import_keep_user_id', true), '')::uuid;
    exception when others then
      keep_id := null;
    end;
    select * into u from public.app_users where id = keep_id;
    if u is not null then
      return u;
    end if;
  end if;
  return public.app_require_protected_admin();
end;
$$;

-- ── 2) Strict ownership helper (no admin REST bypass; team share kept) ───────
-- Admins manage other tenants only via SECURITY DEFINER RPCs (018/022/023).
create or replace function public.app_owns_or_admin(p_owner_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
begin
  if uid is null or p_owner_id is null then
    return false;
  end if;
  return p_owner_id = uid
    or p_owner_id = public.app_data_owner_id();
end;
$$;

create or replace function public.app_is_own_row(p_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_owner_id is not null and p_owner_id = public.current_app_user_id();
$$;

-- ── 3) Team capability enforcement (defense in depth for REST mutations) ─────
create or replace function public.app_team_table_kind(p_table text)
returns text
language sql
immutable
as $$
  select case
    when p_table in ('goods_items', 'goods_sales', 'goods_events') then 'invoices'
    else 'entries'
  end;
$$;

create or replace function public.app_team_assert_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  u public.app_users;
  tp public.app_team_permissions;
  kind text;
  can_edit boolean;
  can_delete boolean;
begin
  -- Backup import / SECURITY DEFINER nested paths may clear sessions briefly.
  if public.app_import_is_authorized() then
    return coalesce(new, old);
  end if;

  u := public.current_app_user();
  if u is null then
    raise exception 'Authentication required';
  end if;

  -- Company owners / solo accounts: unrestricted on their own data (RLS applies).
  if u.team_owner_id is null then
    return coalesce(new, old);
  end if;

  select * into tp from public.app_team_permissions where user_id = u.id;
  kind := public.app_team_table_kind(tg_table_name);

  if kind = 'invoices' then
    can_edit := coalesce(tp.can_edit_invoices, true);
    can_delete := coalesce(tp.can_delete_invoices, false);
  else
    can_edit := coalesce(tp.can_edit_entries, true);
    can_delete := coalesce(tp.can_delete_entries, false);
  end if;

  if tg_op = 'DELETE' then
    if not can_delete then
      raise exception 'You do not have permission to delete %', kind;
    end if;
    return old;
  end if;

  if not can_edit then
    raise exception 'You do not have permission to edit %', kind;
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
  tables text[] := array[
    'loan_ledger_entries',
    'loans', 'loan_payments',
    'installment_plans', 'installment_payments',
    'goods_items', 'goods_sales', 'goods_events',
    'expense_accounts', 'expense_topups', 'expense_entries', 'expense_transfers',
    'bitcoin_wallets', 'app_notes', 'app_user_prefs'
  ];
begin
  foreach t in array tables loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format('drop trigger if exists trg_app_team_assert_mutation on public.%I', t);
      execute format(
        'create trigger trg_app_team_assert_mutation
           before insert or update or delete on public.%I
           for each row execute function public.app_team_assert_mutation()',
        t
      );
    end if;
  end loop;
end $$;

-- ── 4) Lock tab/currency helpers (were privilege-escalation RPCs) ─────────────
create or replace function public.app_apply_tab_permissions(p_user_id uuid, p_tabs jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  tabs text[] := array[]::text[];
  item text;
  v_mod text;
  v_act text;
  enabled boolean;
  caller uuid := public.current_app_user_id();
  tab_modules text[] := array[
    'dashboard','expenses','wallets','inventory','customers','loans',
    'installments','notes','bitcoin','reports','pdf_export',
    'currency_settings','settings','admin_panel'
  ];
  actions text[] := array['view','create','edit','delete','export','import'];
begin
  -- Direct client calls are blocked by REVOKE EXECUTE below.
  -- Nested SECURITY DEFINER callers (admin create, trial signup, team invite,
  -- backup import) must still work:
  --   • admin session → ok
  --   • app.allow_apply_permissions=1 (team invite) → ok
  --   • authorized backup import → ok
  --   • no session yet (public trial signup) → ok
  --   • logged-in non-admin without trust GUC → denied
  if not public.app_import_is_authorized() then
    if public.is_app_admin() then
      null;
    elsif nullif(current_setting('app.allow_apply_permissions', true), '') = '1' then
      null;
    elsif caller is null then
      null;
    else
      raise exception 'Administrator access required';
    end if;
  end if;

  if p_tabs is null then
    p_tabs := '[]'::jsonb;
  end if;

  if jsonb_typeof(p_tabs) = 'array' then
    for item in select jsonb_array_elements_text(p_tabs)
    loop
      tabs := array_append(tabs, lower(trim(item)));
    end loop;
  end if;

  tabs := array(
    select distinct case
      when t in ('goods','inventory') then 'inventory'
      when t in ('expense','expenses','wallets') then 'expenses'
      when t in ('loan','loans') then 'loans'
      when t in ('installment','installments') then 'installments'
      when t in ('note','notes') then 'notes'
      when t in ('btc','bitcoin') then 'bitcoin'
      when t in ('report','reports','pdf','pdf_export') then 'reports'
      when t in ('currency','currency_settings') then 'currency_settings'
      when t in ('setting','settings') then 'settings'
      when t in ('admin','admin_panel') then 'admin_panel'
      when t in ('dashboard','overview') then 'dashboard'
      when t in ('customers','customer') then 'customers'
      else t
    end
    from unnest(tabs) as t
    where nullif(trim(t), '') is not null
  );

  if 'expenses' = any(tabs) then
    tabs := array_append(tabs, 'wallets');
  end if;
  if 'inventory' = any(tabs) then
    tabs := array_append(tabs, 'customers');
  end if;
  if 'reports' = any(tabs) then
    tabs := array_append(tabs, 'pdf_export');
  end if;
  if 'currency_settings' = any(tabs) then
    tabs := array_append(tabs, 'settings');
  end if;

  tabs := array(select distinct unnest(tabs));

  -- Non-admins (team invite path) may never grant admin_panel
  if not public.is_app_admin() and not public.app_import_is_authorized() then
    tabs := array(select unnest(tabs) except select 'admin_panel');
  end if;

  foreach v_mod in array tab_modules loop
    enabled := v_mod = any(tabs);
    if exists (
      select 1 from public.app_users
      where id = p_user_id and is_protected = true
    ) and v_mod = 'admin_panel' then
      enabled := true;
    end if;
    foreach v_act in array actions loop
      insert into public.app_permissions (user_id, module, action, allowed)
      values (p_user_id, v_mod, v_act, enabled)
      on conflict (user_id, module, action) do update
        set allowed = excluded.allowed;
    end loop;
  end loop;

  update public.app_users
  set
    settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(
      'Tabs', to_jsonb(array(select distinct unnest(tabs)))
    ),
    updated_at = now()
  where id = p_user_id;
end;
$$;

create or replace function public.app_apply_user_currencies(p_user_id uuid, p_currencies jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  cleaned text[] := array[]::text[];
  item jsonb;
  cur text;
  allowed text[] := array['AED','SAR','PKR','USD','BTC'];
  caller uuid := public.current_app_user_id();
begin
  if not public.app_import_is_authorized() then
    if public.is_app_admin() then
      null;
    elsif nullif(current_setting('app.allow_apply_permissions', true), '') = '1' then
      null;
    elsif caller is null then
      null;
    else
      raise exception 'Administrator access required';
    end if;
  end if;

  if p_currencies is null or jsonb_typeof(p_currencies) <> 'array' then
    raise exception 'Currencies must be a JSON array';
  end if;
  for item in select * from jsonb_array_elements(p_currencies)
  loop
    cur := upper(trim(both '"' from item::text));
    if cur = any(allowed) and not (cur = any(cleaned)) then
      cleaned := array_append(cleaned, cur);
    end if;
  end loop;
  if coalesce(array_length(cleaned, 1), 0) < 1 then
    raise exception 'Select at least one currency';
  end if;
  update public.app_users
  set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('Currency', to_jsonb(cleaned)),
      updated_at = now()
  where id = p_user_id;
end;
$$;

-- Wrap team create so nested apply_* is authorized without exposing helpers.
create or replace function public.app_team_create_member(
  p_username text,
  p_password text,
  p_display_name text default null,
  p_permissions jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_owner_id uuid := public.app_team_require_manage_context();
  owner public.app_users;
  new_user public.app_users;
  safe_user text := trim(coalesce(p_username, ''));
  settings_obj jsonb;
  currencies jsonb;
  tabs jsonb;
  perms jsonb := coalesce(p_permissions, '{}'::jsonb);
  v_active_count int;
  v_max int;
begin
  select * into owner from public.app_users where id = v_owner_id;
  if owner is null then
    raise exception 'Team owner account not found';
  end if;
  if not coalesce(owner.allow_team_members, false) then
    raise exception 'Team members are not enabled for this account';
  end if;

  v_max := coalesce(owner.max_team_members, 3);
  select count(*) into v_active_count
  from public.app_users
  where team_owner_id = v_owner_id and is_active = true;
  if v_active_count >= v_max then
    raise exception 'Team member limit reached (max %s active member(s)). Ask the platform admin to increase the limit.', v_max;
  end if;

  if safe_user = '' or safe_user !~ '^[a-zA-Z0-9_-]+$' then
    raise exception 'Invalid username';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;
  if exists (select 1 from public.app_users where lower(username) = lower(safe_user)) then
    raise exception 'Username already exists';
  end if;

  settings_obj := coalesce(owner.settings, '{}'::jsonb);
  currencies := coalesce(settings_obj->'Currency', '["AED"]'::jsonb);
  tabs := coalesce(settings_obj->'Tabs', '["dashboard","expenses","loans","notes"]'::jsonb);

  insert into public.app_users (
    organization_id, username, password_hash, admin_visible_password, display_name,
    role, is_protected, is_active, must_change_password, settings, created_by,
    team_owner_id, access_plan, trial_started_at, trial_expires_at
  ) values (
    owner.organization_id,
    safe_user,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    p_password,
    coalesce(nullif(trim(p_display_name), ''), safe_user),
    'user',
    false,
    true,
    false,
    jsonb_build_object(
      'Currency', currencies,
      'Tabs', tabs,
      'Name', coalesce(nullif(trim(p_display_name), ''), safe_user)
    ),
    public.current_app_user_id(),
    v_owner_id,
    owner.access_plan,
    owner.trial_started_at,
    owner.trial_expires_at
  )
  returning * into new_user;

  perform set_config('app.allow_apply_permissions', '1', true);
  perform public.app_apply_user_currencies(new_user.id, currencies);
  perform public.app_apply_tab_permissions(new_user.id, tabs);
  perform set_config('app.allow_apply_permissions', '', true);

  insert into public.app_team_permissions (
    user_id, team_owner_id, can_edit_entries, can_delete_entries,
    can_edit_invoices, can_delete_invoices, can_manage_team
  ) values (
    new_user.id,
    v_owner_id,
    coalesce((perms->>'can_edit_entries')::boolean, true),
    coalesce((perms->>'can_delete_entries')::boolean, false),
    coalesce((perms->>'can_edit_invoices')::boolean, true),
    coalesce((perms->>'can_delete_invoices')::boolean, false),
    coalesce((perms->>'can_manage_team')::boolean, false)
  )
  on conflict (user_id) do update set
    can_edit_entries = excluded.can_edit_entries,
    can_delete_entries = excluded.can_delete_entries,
    can_edit_invoices = excluded.can_edit_invoices,
    can_delete_invoices = excluded.can_delete_invoices,
    can_manage_team = excluded.can_manage_team,
    updated_at = now();

  select * into new_user from public.app_users where id = new_user.id;

  perform public.app_team_log_activity(
    'team_member_created',
    'team',
    format('Added team member "%s"', safe_user),
    'app_users',
    new_user.id::text,
    jsonb_build_object('username', safe_user, 'display_name', new_user.display_name)
  );

  return public.app_user_public_profile(new_user, false);
end;
$$;

-- ── 5) Backup helpers: require protected admin (or authorized import) ────────
create or replace function public.app_admin_backup_dump_table(p_table text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  perform public.app_require_backup_admin_or_import();
  if p_table is null or p_table !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'Invalid table name';
  end if;
  if not public.app_admin_backup_table_exists(p_table) then
    return '[]'::jsonb;
  end if;
  if not (p_table = any (public.app_admin_backup_table_list())) then
    raise exception 'Table not allowed in backup: %', p_table;
  end if;
  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t',
    p_table
  ) into result;
  return coalesce(result, '[]'::jsonb);
end;
$$;

create or replace function public.app_admin_backup_clear_table(p_table text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.app_require_backup_admin_or_import();
  if not public.app_admin_backup_table_exists(p_table) then
    return;
  end if;
  if not (p_table = any (public.app_admin_backup_table_list())) then
    raise exception 'Table not allowed: %', p_table;
  end if;
  execute format('delete from public.%I where true', p_table);
end;
$$;

create or replace function public.app_admin_backup_insert_rows(p_table text, p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted int := 0;
begin
  perform public.app_require_backup_admin_or_import();
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    return 0;
  end if;
  if not public.app_admin_backup_table_exists(p_table) then
    return 0;
  end if;
  if not (p_table = any (public.app_admin_backup_table_list())) then
    raise exception 'Table not allowed: %', p_table;
  end if;

  execute format(
    'insert into public.%I
     select * from jsonb_populate_recordset(null::public.%I, $1)
     on conflict do nothing',
    p_table, p_table
  ) using p_rows;

  get diagnostics inserted = row_count;
  return coalesce(inserted, 0);
exception
  when others then
    begin
      execute format(
        'insert into public.%I
         select * from jsonb_populate_recordset(null::public.%I, $1)',
        p_table, p_table
      ) using p_rows;
      get diagnostics inserted = row_count;
      return coalesce(inserted, 0);
    exception
      when others then
        raise exception 'Failed inserting into %: %', p_table, SQLERRM;
    end;
end;
$$;

create or replace function public.app_admin_backup_restore_users(p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  session_id uuid;
  admin public.app_users;
  r jsonb;
  uid uuid;
  keep_ids uuid[] := array[]::uuid[];
  restored int := 0;
  has_team_owner boolean;
  has_access_ext_by boolean;
  has_created_by boolean;
  v_is_protected boolean;
  v_role text;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'app_users backup must be an array';
  end if;

  -- Prefer authorized import keep-id; otherwise require live protected admin.
  if public.app_import_is_authorized() then
    begin
      session_id := nullif(current_setting('app.import_keep_user_id', true), '')::uuid;
    exception when others then
      session_id := null;
    end;
  end if;
  if session_id is null then
    admin := public.app_require_protected_admin();
    session_id := admin.id;
  end if;
  if session_id is null then
    raise exception 'Authentication required';
  end if;

  has_created_by := exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_users' and column_name = 'created_by'
  );
  has_team_owner := exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_users' and column_name = 'team_owner_id'
  );
  has_access_ext_by := exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_users' and column_name = 'access_last_extended_by'
  );

  delete from public.app_users where id is distinct from session_id;

  for r in select * from jsonb_array_elements(p_rows)
  loop
    uid := nullif(r->>'id', '')::uuid;
    if uid is null then
      continue;
    end if;
    keep_ids := array_append(keep_ids, uid);

    -- Never import extra protected-admins; only the live session admin stays protected.
    v_is_protected := case
      when uid = session_id then true
      else false
    end;
    v_role := case
      when uid = session_id then 'admin'
      else coalesce(nullif(r->>'role', ''), 'user')
    end;
    if v_role not in ('admin', 'user') then
      v_role := 'user';
    end if;

    if exists (select 1 from public.app_users where id = uid) then
      update public.app_users u set
        organization_id = nullif(r->>'organization_id', '')::uuid,
        username = coalesce(nullif(r->>'username', ''), u.username),
        password_hash = coalesce(nullif(r->>'password_hash', ''), u.password_hash),
        display_name = coalesce(r->>'display_name', u.display_name),
        role = v_role,
        is_protected = v_is_protected,
        is_active = case when uid = session_id then true else coalesce((r->>'is_active')::boolean, u.is_active) end,
        must_change_password = coalesce((r->>'must_change_password')::boolean, u.must_change_password),
        settings = coalesce(r->'settings', u.settings),
        last_login_at = nullif(r->>'last_login_at', '')::timestamptz,
        created_at = coalesce(nullif(r->>'created_at', '')::timestamptz, u.created_at),
        updated_at = now(),
        company_name = r->>'company_name',
        vat_number = r->>'vat_number',
        logo_url = r->>'logo_url',
        admin_visible_password = r->>'admin_visible_password',
        company_email = r->>'company_email',
        company_phone = r->>'company_phone',
        company_address = r->>'company_address',
        smart_pin_hash = r->>'smart_pin_hash',
        admin_visible_smart_pin = r->>'admin_visible_smart_pin',
        access_plan = coalesce(r->>'access_plan', u.access_plan),
        trial_started_at = nullif(r->>'trial_started_at', '')::timestamptz,
        trial_expires_at = nullif(r->>'trial_expires_at', '')::timestamptz,
        access_grace_warned_at = nullif(r->>'access_grace_warned_at', '')::timestamptz,
        access_disabled_for_expiry_at = nullif(r->>'access_disabled_for_expiry_at', '')::timestamptz,
        access_last_extended_at = nullif(r->>'access_last_extended_at', '')::timestamptz,
        access_last_extended_until = nullif(r->>'access_last_extended_until', '')::timestamptz,
        allow_team_members = coalesce((r->>'allow_team_members')::boolean, u.allow_team_members),
        max_team_members = coalesce(nullif(r->>'max_team_members', '')::integer, u.max_team_members),
        created_by = null,
        team_owner_id = null,
        access_last_extended_by = null
      where u.id = uid;
    else
      insert into public.app_users (
        id, organization_id, username, password_hash, display_name, role,
        is_protected, is_active, must_change_password, settings, last_login_at,
        created_at, updated_at, created_by,
        company_name, vat_number, logo_url, admin_visible_password,
        company_email, company_phone, company_address,
        smart_pin_hash, admin_visible_smart_pin,
        access_plan, trial_started_at, trial_expires_at,
        access_grace_warned_at, access_disabled_for_expiry_at,
        access_last_extended_at, access_last_extended_until, access_last_extended_by,
        allow_team_members, team_owner_id, max_team_members
      ) values (
        uid,
        nullif(r->>'organization_id', '')::uuid,
        r->>'username',
        coalesce(nullif(r->>'password_hash', ''), extensions.crypt(coalesce(nullif(r->>'admin_visible_password', ''), 'changeme'), extensions.gen_salt('bf'))),
        coalesce(r->>'display_name', ''),
        v_role,
        v_is_protected,
        case when uid = session_id then true else coalesce((r->>'is_active')::boolean, true) end,
        coalesce((r->>'must_change_password')::boolean, false),
        coalesce(r->'settings', '{}'::jsonb),
        nullif(r->>'last_login_at', '')::timestamptz,
        coalesce(nullif(r->>'created_at', '')::timestamptz, now()),
        now(),
        null,
        r->>'company_name',
        r->>'vat_number',
        r->>'logo_url',
        r->>'admin_visible_password',
        r->>'company_email',
        r->>'company_phone',
        r->>'company_address',
        r->>'smart_pin_hash',
        r->>'admin_visible_smart_pin',
        coalesce(r->>'access_plan', 'full'),
        nullif(r->>'trial_started_at', '')::timestamptz,
        nullif(r->>'trial_expires_at', '')::timestamptz,
        nullif(r->>'access_grace_warned_at', '')::timestamptz,
        nullif(r->>'access_disabled_for_expiry_at', '')::timestamptz,
        nullif(r->>'access_last_extended_at', '')::timestamptz,
        nullif(r->>'access_last_extended_until', '')::timestamptz,
        null,
        coalesce((r->>'allow_team_members')::boolean, false),
        null,
        coalesce(nullif(r->>'max_team_members', '')::integer, 3)
      )
      on conflict (username) do update set
        organization_id = excluded.organization_id,
        password_hash = excluded.password_hash,
        display_name = excluded.display_name,
        role = excluded.role,
        is_protected = excluded.is_protected,
        is_active = excluded.is_active,
        must_change_password = excluded.must_change_password,
        settings = excluded.settings,
        last_login_at = excluded.last_login_at,
        updated_at = now(),
        company_name = excluded.company_name,
        vat_number = excluded.vat_number,
        logo_url = excluded.logo_url,
        admin_visible_password = excluded.admin_visible_password,
        company_email = excluded.company_email,
        company_phone = excluded.company_phone,
        company_address = excluded.company_address,
        smart_pin_hash = excluded.smart_pin_hash,
        admin_visible_smart_pin = excluded.admin_visible_smart_pin,
        access_plan = excluded.access_plan,
        trial_started_at = excluded.trial_started_at,
        trial_expires_at = excluded.trial_expires_at,
        access_grace_warned_at = excluded.access_grace_warned_at,
        access_disabled_for_expiry_at = excluded.access_disabled_for_expiry_at,
        access_last_extended_at = excluded.access_last_extended_at,
        access_last_extended_until = excluded.access_last_extended_until,
        allow_team_members = excluded.allow_team_members,
        max_team_members = excluded.max_team_members,
        created_by = null,
        team_owner_id = null,
        access_last_extended_by = null;
    end if;
    restored := restored + 1;
  end loop;

  for r in select * from jsonb_array_elements(p_rows)
  loop
    uid := nullif(r->>'id', '')::uuid;
    if uid is null then continue; end if;
    if has_created_by then
      update public.app_users set created_by = nullif(r->>'created_by', '')::uuid where id = uid;
    end if;
    if has_team_owner then
      update public.app_users set team_owner_id = nullif(r->>'team_owner_id', '')::uuid where id = uid;
    end if;
    if has_access_ext_by then
      update public.app_users set access_last_extended_by = nullif(r->>'access_last_extended_by', '')::uuid where id = uid;
    end if;
  end loop;

  -- Live session admin must remain the sole protected admin after restore.
  update public.app_users set
    role = 'admin',
    is_protected = true,
    is_active = true,
    team_owner_id = null,
    updated_at = now()
  where id = session_id;

  update public.app_users set
    is_protected = false,
    updated_at = now()
  where id is distinct from session_id
    and coalesce(is_protected, false) is true;

  if cardinality(keep_ids) > 0 then
    delete from public.app_users u
    where not (u.id = any (keep_ids))
      and u.id is distinct from session_id;
  end if;

  if not exists (
    select 1 from public.app_users
    where id = session_id and is_protected = true and role = 'admin' and is_active
  ) then
    raise exception 'Restore aborted: live protected administrator must remain intact';
  end if;

  return restored;
end;
$$;

create or replace function public.app_admin_import_full_backup(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  admin public.app_users;
  sess_id uuid;
  current_tok text;
  current_hash text;
  fmt text;
  ver int;
  tables_obj jsonb;
  tbl text;
  inserted jsonb := '{}'::jsonb;
  n int;
  backup_admin_id uuid;
  clear_order text[] := array[
    'app_inquiry_messages',
    'app_admin_notifications',
    'app_inquiries',
    'app_access_extensions',
    'app_plan_renewal_requests',
    'app_activity_log',
    'app_team_permissions',
    'app_permissions',
    'loan_payments',
    'installment_payments',
    'goods_sales',
    'goods_events',
    'expense_transfers',
    'expense_entries',
    'expense_topups',
    'expense_accounts',
    'bitcoin_wallets',
    'app_notes',
    'app_user_prefs',
    'loans',
    'installment_plans',
    'goods_items',
    'loan_ledger_entries'
  ];
  insert_order text[] := array[
    'app_organizations',
    'app_permissions',
    'app_team_permissions',
    'loan_ledger_entries',
    'loans',
    'loan_payments',
    'installment_plans',
    'installment_payments',
    'goods_items',
    'goods_sales',
    'goods_events',
    'expense_accounts',
    'expense_topups',
    'expense_entries',
    'expense_transfers',
    'bitcoin_wallets',
    'app_notes',
    'app_user_prefs',
    'app_inquiries',
    'app_inquiry_messages',
    'app_admin_notifications',
    'app_access_extensions',
    'app_plan_renewal_requests',
    'app_activity_log'
  ];
begin
  admin := public.app_require_protected_admin();
  current_tok := public.current_session_token();
  current_hash := case
    when current_tok is null or current_tok = '' then null
    else public.app_hash_token(current_tok)
  end;
  if current_hash is not null then
    select s.id into sess_id
    from public.app_sessions s
    where s.token_hash = current_hash
      and s.revoked_at is null
      and s.expires_at > now()
    limit 1;
  end if;

  -- Authorize nested helpers for this transaction only.
  perform set_config('app.import_keep_user_id', admin.id::text, true);
  perform set_config('app.import_authorized', '1', true);

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Invalid backup payload';
  end if;

  fmt := coalesce(p_payload->>'format', '');
  ver := coalesce(nullif(p_payload->>'version', '')::int, 0);
  if fmt <> 'triple-m-admin-backup' then
    raise exception 'Unsupported backup format (expected triple-m-admin-backup)';
  end if;
  if ver < 1 then
    raise exception 'Unsupported backup version';
  end if;

  tables_obj := coalesce(p_payload->'tables', '{}'::jsonb);
  if jsonb_typeof(tables_obj) <> 'object' then
    raise exception 'Backup tables object missing';
  end if;

  if not (tables_obj ? 'app_users')
     or jsonb_typeof(tables_obj->'app_users') <> 'array' then
    raise exception 'Backup must include app_users';
  end if;

  select nullif(u->>'id', '')::uuid
    into backup_admin_id
  from jsonb_array_elements(tables_obj->'app_users') u
  where lower(trim(both from coalesce(u->>'username', '')))
        = lower(trim(both from coalesce(admin.username, '')))
  limit 1;

  if backup_admin_id is not null and backup_admin_id is distinct from admin.id then
    tables_obj := public.app_admin_backup_remap_uuid_in_tables(
      tables_obj, backup_admin_id, admin.id
    );
  end if;

  foreach tbl in array clear_order loop
    perform public.app_admin_backup_clear_table(tbl);
  end loop;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'app_sessions'
  ) then
    if sess_id is not null then
      delete from public.app_sessions where id is distinct from sess_id;
    else
      delete from public.app_sessions where user_id is distinct from admin.id;
    end if;
  end if;

  if tables_obj ? 'app_organizations' then
    update public.app_users set organization_id = null where true;
    perform public.app_admin_backup_clear_table('app_organizations');
    n := public.app_admin_backup_insert_rows('app_organizations', tables_obj->'app_organizations');
    inserted := inserted || jsonb_build_object('app_organizations', n);
  end if;

  n := public.app_admin_backup_restore_users(tables_obj->'app_users');
  inserted := inserted || jsonb_build_object('app_users', n);

  foreach tbl in array insert_order loop
    if tbl = 'app_organizations' then
      continue;
    end if;
    if tables_obj ? tbl then
      n := public.app_admin_backup_insert_rows(tbl, tables_obj->tbl);
      inserted := inserted || jsonb_build_object(tbl, n);
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'restoredBy', admin.username,
    'restoredAt', now(),
    'inserted', inserted,
    'warning', 'Restore is destructive for exported tables. Sessions were cleared except the current admin session. Extra is_protected flags from the backup were stripped.'
  );
end;
$$;

-- Credentials for Download SQL (replaces direct PostgREST select of password_hash).
create or replace function public.app_admin_export_self_credentials()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  admin public.app_users := public.app_require_protected_admin();
  org jsonb := null;
begin
  if admin.organization_id is not null then
    select jsonb_build_object('id', o.id, 'name', o.name)
      into org
    from public.app_organizations o
    where o.id = admin.organization_id;
  end if;

  return jsonb_build_object(
    'admin', jsonb_build_object(
      'id', admin.id,
      'organization_id', admin.organization_id,
      'username', admin.username,
      'password_hash', admin.password_hash,
      'admin_visible_password', coalesce(admin.admin_visible_password, ''),
      'display_name', admin.display_name,
      'role', admin.role,
      'is_protected', admin.is_protected,
      'is_active', admin.is_active,
      'must_change_password', admin.must_change_password,
      'smart_pin_hash', coalesce(admin.smart_pin_hash, ''),
      'admin_visible_smart_pin', coalesce(admin.admin_visible_smart_pin, '')
    ),
    'org', org
  );
end;
$$;

-- ── 6) Column privileges: hide secrets from PostgREST roles ──────────────────
do $$
declare
  secret_cols text[] := array[
    'password_hash', 'admin_visible_password', 'smart_pin_hash', 'admin_visible_smart_pin'
  ];
  c text;
  safe_cols text;
begin
  -- Prefer precise secret-column revoke (works even when table-level SELECT remains).
  foreach c in array secret_cols loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'app_users' and column_name = c
    ) then
      begin
        execute format(
          'revoke select (%I) on table public.app_users from anon, authenticated',
          c
        );
      exception when others then
        null;
      end;
    end if;
  end loop;

  -- Rebuild safe column SELECT grant (excludes secrets).
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into safe_cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'app_users'
    and column_name <> all (secret_cols);

  if safe_cols is not null and length(safe_cols) > 0 then
    revoke select on table public.app_users from anon, authenticated;
    execute format(
      'grant select (%s) on table public.app_users to anon, authenticated',
      safe_cols
    );
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'app_sessions'
  ) then
    begin
      revoke select (token_hash) on table public.app_sessions from anon, authenticated;
    exception when others then
      null;
    end;

    select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
      into safe_cols
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'app_sessions'
      and column_name <> 'token_hash';

    if safe_cols is not null and length(safe_cols) > 0 then
      revoke select on table public.app_sessions from anon, authenticated;
      execute format(
        'grant select (%s) on table public.app_sessions to anon, authenticated',
        safe_cols
      );
    end if;
  end if;
end $$;

-- ── 7) Grants / revokes ──────────────────────────────────────────────────────
-- Public entry points only. Helpers stay callable by SECURITY DEFINER owners.
revoke all on function public.app_admin_backup_dump_table(text) from public, anon, authenticated;
revoke all on function public.app_admin_backup_clear_table(text) from public, anon, authenticated;
revoke all on function public.app_admin_backup_insert_rows(text, jsonb) from public, anon, authenticated;
revoke all on function public.app_admin_backup_restore_users(jsonb) from public, anon, authenticated;
revoke all on function public.app_admin_backup_table_exists(text) from public, anon, authenticated;
revoke all on function public.app_admin_backup_remap_uuid_in_tables(jsonb, uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_admin_backup_table_list() from public, anon, authenticated;
revoke all on function public.app_apply_tab_permissions(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.app_apply_user_currencies(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.app_team_require_manage_context() from public, anon, authenticated;
revoke all on function public.app_import_is_authorized() from public, anon, authenticated;
revoke all on function public.app_require_backup_admin_or_import() from public, anon, authenticated;
revoke all on function public.app_user_public_profile(public.app_users, boolean) from public, anon, authenticated;

grant execute on function public.app_require_protected_admin() to anon, authenticated;
grant execute on function public.app_admin_export_full_backup() to anon, authenticated;
grant execute on function public.app_admin_import_full_backup(jsonb) to anon, authenticated;
grant execute on function public.app_admin_export_self_credentials() to anon, authenticated;
grant execute on function public.app_owns_or_admin(uuid) to anon, authenticated;
grant execute on function public.app_is_own_row(uuid) to anon, authenticated;
grant execute on function public.app_data_owner_id() to anon, authenticated;
grant execute on function public.app_team_create_member(text, text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/039_production_security_hardening.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/040_note_reminders.sql
-- ############################################################################

-- ============================================================================
-- 040_note_reminders.sql
-- Note reminders + personal user notifications (reminders, installment dues, etc.)
-- Polled by the SPA (same pattern as messaging live sync — no Realtime).
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ── Personal notifications (all logged-in users, including admin) ─────────────

create table if not exists public.app_user_notifications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.app_users(id) on delete cascade,
  kind text not null
    check (kind in ('note_reminder', 'installment_due', 'system')),
  title text not null,
  body text not null default '',
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text,
  related_note_id uuid,
  related_reminder_id uuid,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists app_user_notifications_owner_dedupe_uidx
  on public.app_user_notifications(owner_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists app_user_notifications_owner_unread_idx
  on public.app_user_notifications(owner_id, is_read, created_at desc);

create index if not exists app_user_notifications_owner_created_idx
  on public.app_user_notifications(owner_id, created_at desc);

alter table public.app_user_notifications enable row level security;

drop policy if exists app_user_notifications_deny_all on public.app_user_notifications;
create policy app_user_notifications_deny_all
  on public.app_user_notifications for all to anon, authenticated
  using (false) with check (false);

-- ── Note reminders ───────────────────────────────────────────────────────────

create table if not exists public.app_note_reminders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.app_users(id) on delete cascade,
  note_id uuid,
  note_preview text not null default '',
  remind_at timestamptz not null,
  message text not null default '',
  is_delivered boolean not null default false,
  delivered_at timestamptz,
  notification_id uuid references public.app_user_notifications(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_note_reminders_owner_due_idx
  on public.app_note_reminders(owner_id, is_delivered, remind_at);

create index if not exists app_note_reminders_note_idx
  on public.app_note_reminders(note_id);

alter table public.app_note_reminders enable row level security;

drop policy if exists app_note_reminders_deny_all on public.app_note_reminders;
create policy app_note_reminders_deny_all
  on public.app_note_reminders for all to anon, authenticated
  using (false) with check (false);

do $$
begin
  if to_regclass('public.app_notes') is not null
     and not exists (
       select 1 from pg_constraint
       where conname = 'app_note_reminders_note_id_fkey'
     ) then
    alter table public.app_note_reminders
      add constraint app_note_reminders_note_id_fkey
      foreign key (note_id) references public.app_notes(id) on delete cascade;
  end if;
exception when others then
  null;
end $$;

-- ── Helpers / RPCs ───────────────────────────────────────────────────────────

create or replace function public.app_user_notification_public_row(n public.app_user_notifications)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', n.id,
    'kind', n.kind,
    'title', n.title,
    'body', n.body,
    'payload', coalesce(n.payload, '{}'::jsonb),
    'related_note_id', n.related_note_id,
    'related_reminder_id', n.related_reminder_id,
    'is_read', n.is_read,
    'read_at', n.read_at,
    'created_at', n.created_at,
    'source', 'user'
  );
$$;

create or replace function public.app_create_user_notification(
  p_kind text,
  p_title text,
  p_body text default '',
  p_payload jsonb default '{}'::jsonb,
  p_dedupe_key text default null,
  p_related_note_id uuid default null,
  p_related_reminder_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  row public.app_user_notifications;
  kind text := lower(trim(coalesce(p_kind, '')));
  dedupe text := nullif(trim(coalesce(p_dedupe_key, '')), '');
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if kind not in ('note_reminder', 'installment_due', 'system') then
    raise exception 'Invalid notification kind';
  end if;

  if dedupe is not null then
    select * into row
    from public.app_user_notifications
    where owner_id = uid and dedupe_key = dedupe
    limit 1;
    if found then
      return public.app_user_notification_public_row(row);
    end if;
  end if;

  begin
    insert into public.app_user_notifications (
      owner_id, kind, title, body, payload, dedupe_key, related_note_id, related_reminder_id
    ) values (
      uid,
      kind,
      coalesce(nullif(trim(p_title), ''), 'Notification'),
      coalesce(p_body, ''),
      coalesce(p_payload, '{}'::jsonb),
      dedupe,
      p_related_note_id,
      p_related_reminder_id
    )
    returning * into row;
  exception when unique_violation then
    select * into row
    from public.app_user_notifications
    where owner_id = uid and dedupe_key = dedupe
    limit 1;
  end;

  return public.app_user_notification_public_row(row);
end;
$$;

create or replace function public.app_list_my_notifications(p_limit int default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  items jsonb := '[]'::jsonb;
  lim int := greatest(1, least(coalesce(p_limit, 50), 200));
  unread int := 0;
begin
  if uid is null then raise exception 'Authentication required'; end if;

  select count(*)::int into unread
  from public.app_user_notifications
  where owner_id = uid and is_read = false;

  select coalesce(jsonb_agg(public.app_user_notification_public_row(n) order by n.created_at desc), '[]'::jsonb)
  into items
  from (
    select *
    from public.app_user_notifications
    where owner_id = uid
    order by created_at desc
    limit lim
  ) n;

  return jsonb_build_object('items', items, 'unread', unread);
end;
$$;

create or replace function public.app_mark_my_notification_read(p_notification_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  row public.app_user_notifications;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  update public.app_user_notifications
  set is_read = true, read_at = coalesce(read_at, now())
  where id = p_notification_id and owner_id = uid
  returning * into row;
  if row.id is null then raise exception 'Notification not found'; end if;
  return public.app_user_notification_public_row(row);
end;
$$;

create or replace function public.app_mark_all_my_notifications_read()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  n int := 0;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  update public.app_user_notifications
  set is_read = true, read_at = coalesce(read_at, now())
  where owner_id = uid and is_read = false;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'marked', n);
end;
$$;

create or replace function public.app_delete_my_notification(p_notification_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  deleted_id uuid;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  delete from public.app_user_notifications
  where id = p_notification_id and owner_id = uid
  returning id into deleted_id;
  if deleted_id is null then raise exception 'Notification not found'; end if;
  return jsonb_build_object('ok', true, 'deleted_id', deleted_id);
end;
$$;

create or replace function public.app_create_note_reminder(
  p_note_id uuid,
  p_remind_at timestamptz,
  p_message text default '',
  p_note_preview text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  row public.app_note_reminders;
  preview text := left(trim(coalesce(p_note_preview, '')), 240);
  msg text := left(trim(coalesce(p_message, '')), 400);
  note_owner uuid;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_remind_at is null then raise exception 'Reminder time is required'; end if;
  if p_remind_at <= (now() - interval '1 minute') then
    raise exception 'Reminder time must be in the future';
  end if;

  if p_note_id is not null and to_regclass('public.app_notes') is not null then
    select n.owner_id into note_owner
    from public.app_notes n
    where n.id = p_note_id and n.is_deleted = false;
    if note_owner is not null and note_owner <> uid then
      if not exists (
        select 1 from public.app_users u
        where u.id = uid
          and (u.id = note_owner or u.team_owner_id = note_owner)
      ) then
        raise exception 'Note not found';
      end if;
    end if;
  end if;

  insert into public.app_note_reminders (
    owner_id, note_id, note_preview, remind_at, message
  ) values (
    uid, p_note_id, preview, p_remind_at, msg
  )
  returning * into row;

  return jsonb_build_object(
    'id', row.id,
    'note_id', row.note_id,
    'remind_at', row.remind_at,
    'message', row.message,
    'note_preview', row.note_preview,
    'is_delivered', row.is_delivered,
    'created_at', row.created_at
  );
end;
$$;

create or replace function public.app_list_my_note_reminders(p_note_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  items jsonb := '[]'::jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'note_id', r.note_id,
    'remind_at', r.remind_at,
    'message', r.message,
    'note_preview', r.note_preview,
    'is_delivered', r.is_delivered,
    'delivered_at', r.delivered_at,
    'created_at', r.created_at
  ) order by r.remind_at asc), '[]'::jsonb)
  into items
  from public.app_note_reminders r
  where r.owner_id = uid
    and (p_note_id is null or r.note_id = p_note_id)
    and r.is_delivered = false;

  return jsonb_build_object('items', items);
end;
$$;

create or replace function public.app_delete_note_reminder(p_reminder_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  deleted_id uuid;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  delete from public.app_note_reminders
  where id = p_reminder_id and owner_id = uid
  returning id into deleted_id;
  if deleted_id is null then raise exception 'Reminder not found'; end if;
  return jsonb_build_object('ok', true, 'deleted_id', deleted_id);
end;
$$;

create or replace function public.app_dispatch_due_note_reminders()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  r public.app_note_reminders;
  notif_id uuid;
  delivered int := 0;
  body text;
  dedupe text;
begin
  if uid is null then raise exception 'Authentication required'; end if;

  for r in
    select *
    from public.app_note_reminders
    where owner_id = uid
      and is_delivered = false
      and remind_at <= now()
    order by remind_at asc
    limit 50
  loop
    body := coalesce(nullif(trim(r.message), ''), nullif(trim(r.note_preview), ''), 'Reminder for your note');
    dedupe := 'note_reminder:' || r.id::text;

    select id into notif_id
    from public.app_user_notifications
    where owner_id = uid and dedupe_key = dedupe
    limit 1;

    if notif_id is null then
      insert into public.app_user_notifications (
        owner_id, kind, title, body, payload, dedupe_key, related_note_id, related_reminder_id
      ) values (
        uid,
        'note_reminder',
        'Note reminder',
        body,
        jsonb_build_object(
          'note_id', r.note_id,
          'remind_at', r.remind_at,
          'message', r.message,
          'note_preview', r.note_preview
        ),
        dedupe,
        r.note_id,
        r.id
      )
      returning id into notif_id;
    end if;

    update public.app_note_reminders
    set
      is_delivered = true,
      delivered_at = now(),
      notification_id = coalesce(notif_id, notification_id),
      updated_at = now()
    where id = r.id;

    delivered := delivered + 1;
  end loop;

  return jsonb_build_object('ok', true, 'delivered', delivered);
end;
$$;

grant execute on function public.app_create_user_notification(text, text, text, jsonb, text, uuid, uuid) to anon, authenticated;
grant execute on function public.app_list_my_notifications(int) to anon, authenticated;
grant execute on function public.app_mark_my_notification_read(uuid) to anon, authenticated;
grant execute on function public.app_mark_all_my_notifications_read() to anon, authenticated;
grant execute on function public.app_delete_my_notification(uuid) to anon, authenticated;
grant execute on function public.app_create_note_reminder(uuid, timestamptz, text, text) to anon, authenticated;
grant execute on function public.app_list_my_note_reminders(uuid) to anon, authenticated;
grant execute on function public.app_delete_note_reminder(uuid) to anon, authenticated;
grant execute on function public.app_dispatch_due_note_reminders() to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/040_note_reminders.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/041_installment_due_notifications.sql
-- ############################################################################

-- ============================================================================
-- 041_installment_due_notifications.sql
-- Track sent installment due alerts (5d / 3d / same-day) + extend messaging sync
-- fingerprint so the notification panel updates near-real-time for all users.
-- ============================================================================

create table if not exists public.app_installment_due_notices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.app_users(id) on delete cascade,
  plan_group_id text not null,
  slot_index int not null check (slot_index > 0),
  due_date date not null,
  offset_days int not null check (offset_days in (0, 3, 5)),
  person_name text not null default '',
  notification_id uuid references public.app_user_notifications(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (owner_id, plan_group_id, slot_index, due_date, offset_days)
);

create index if not exists app_installment_due_notices_owner_idx
  on public.app_installment_due_notices(owner_id, created_at desc);

alter table public.app_installment_due_notices enable row level security;

drop policy if exists app_installment_due_notices_deny_all on public.app_installment_due_notices;
create policy app_installment_due_notices_deny_all
  on public.app_installment_due_notices for all to anon, authenticated
  using (false) with check (false);

-- Client scans schedules; this RPC records + creates the notification once.
create or replace function public.app_ensure_installment_due_notice(
  p_plan_group_id text,
  p_slot_index int,
  p_due_date date,
  p_offset_days int,
  p_person_name text default '',
  p_amount_label text default '',
  p_currency text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  existing public.app_installment_due_notices;
  notif public.app_user_notifications;
  gid text := nullif(trim(coalesce(p_plan_group_id, '')), '');
  offset_d int := coalesce(p_offset_days, -1);
  title text;
  body text;
  when_label text;
  dedupe text;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if gid is null then raise exception 'Plan id is required'; end if;
  if coalesce(p_slot_index, 0) <= 0 then raise exception 'Invalid installment index'; end if;
  if p_due_date is null then raise exception 'Due date is required'; end if;
  if offset_d not in (0, 3, 5) then raise exception 'offset_days must be 0, 3, or 5'; end if;

  select * into existing
  from public.app_installment_due_notices
  where owner_id = uid
    and plan_group_id = gid
    and slot_index = p_slot_index
    and due_date = p_due_date
    and offset_days = offset_d
  limit 1;

  if existing.id is not null then
    return jsonb_build_object(
      'ok', true,
      'created', false,
      'notice_id', existing.id,
      'notification_id', existing.notification_id
    );
  end if;

  when_label := case offset_d
    when 0 then 'due today'
    when 3 then 'due in 3 days'
    else 'due in 5 days'
  end;

  title := 'Installment ' || when_label;
  body := trim(format(
    '%s · #%s · %s%s',
    coalesce(nullif(trim(p_person_name), ''), 'Installment plan'),
    p_slot_index,
    to_char(p_due_date, 'YYYY-MM-DD'),
    case
      when nullif(trim(coalesce(p_amount_label, '')), '') is not null
        then ' · ' || trim(p_amount_label)
      else ''
    end
  ));

  dedupe := format(
    'installment_due:%s:%s:%s:%s',
    gid, p_slot_index, p_due_date::text, offset_d
  );

  select * into notif
  from public.app_user_notifications
  where owner_id = uid and dedupe_key = dedupe
  limit 1;

  if notif.id is null then
    insert into public.app_user_notifications (
      owner_id, kind, title, body, payload, dedupe_key
    ) values (
      uid,
      'installment_due',
      title,
      body,
      jsonb_build_object(
        'plan_group_id', gid,
        'slot_index', p_slot_index,
        'due_date', p_due_date,
        'offset_days', offset_d,
        'person_name', coalesce(p_person_name, ''),
        'amount_label', coalesce(p_amount_label, ''),
        'currency', coalesce(p_currency, '')
      ),
      dedupe
    )
    returning * into notif;
  end if;

  begin
    insert into public.app_installment_due_notices (
      owner_id, plan_group_id, slot_index, due_date, offset_days, person_name, notification_id
    ) values (
      uid, gid, p_slot_index, p_due_date, offset_d, coalesce(p_person_name, ''), notif.id
    )
    returning * into existing;
  exception when unique_violation then
    select * into existing
    from public.app_installment_due_notices
    where owner_id = uid
      and plan_group_id = gid
      and slot_index = p_slot_index
      and due_date = p_due_date
      and offset_days = offset_d
    limit 1;
  end;

  return jsonb_build_object(
    'ok', true,
    'created', true,
    'notice_id', existing.id,
    'notification_id', coalesce(existing.notification_id, notif.id)
  );
end;
$$;

-- Extend sync fingerprint with personal notification unread + latest timestamps
create or replace function public.app_messaging_sync_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  u public.app_users;
  is_admin boolean := false;
  notif_count int := 0;
  inquiry_unread int := 0;
  user_unread int := 0;
  user_notif_unread int := 0;
  inquiry_count int := 0;
  open_count int := 0;
  message_total bigint := 0;
  latest_msg_at timestamptz;
  latest_updated_at timestamptz;
  latest_notif_at timestamptz;
  latest_user_notif_at timestamptz;
  fp text;
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;

  select * into u from public.app_users where id = uid;
  if u is null or not u.is_active then
    raise exception 'Authentication required';
  end if;

  is_admin := (
    u.role = 'admin'
    and coalesce(u.access_plan, 'full') <> 'trial'
  );

  select count(*)::int, max(created_at)
  into user_notif_unread, latest_user_notif_at
  from public.app_user_notifications
  where owner_id = uid and is_read = false;

  if latest_user_notif_at is null then
    select max(created_at) into latest_user_notif_at
    from public.app_user_notifications
    where owner_id = uid;
  end if;

  if is_admin then
    select count(*)::int into notif_count
    from public.app_admin_notifications
    where is_read = false;

    select max(created_at) into latest_notif_at
    from public.app_admin_notifications;

    select count(*)::int into inquiry_unread
    from public.app_inquiries i
    where exists (
      select 1
      from public.app_inquiry_messages m
      where m.inquiry_id = i.id
        and m.sender_role in ('user', 'guest')
        and (i.admin_last_read_at is null or m.created_at > i.admin_last_read_at)
    )
    or i.status = 'open';

    select
      count(*)::int,
      count(*) filter (where status = 'open')::int,
      max(coalesce(last_message_at, updated_at, created_at)),
      max(updated_at)
    into inquiry_count, open_count, latest_msg_at, latest_updated_at
    from public.app_inquiries;

    select count(*)::bigint into message_total
    from public.app_inquiry_messages;

    fp := format(
      'a|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s',
      notif_count,
      inquiry_unread,
      inquiry_count,
      open_count,
      coalesce(message_total, 0),
      coalesce(extract(epoch from latest_msg_at)::bigint, 0),
      coalesce(extract(epoch from latest_updated_at)::bigint, 0),
      coalesce(extract(epoch from latest_notif_at)::bigint, 0),
      user_notif_unread,
      coalesce(extract(epoch from latest_user_notif_at)::bigint, 0)
    );

    return jsonb_build_object(
      'role', 'admin',
      'fingerprint', fp,
      'notifications', notif_count + user_notif_unread,
      'admin_notifications', notif_count,
      'user_notifications', user_notif_unread,
      'inquiries', inquiry_unread,
      'inquiry_count', inquiry_count,
      'open_count', open_count,
      'message_total', coalesce(message_total, 0),
      'latest_message_at', latest_msg_at,
      'latest_notification_at', greatest(latest_notif_at, latest_user_notif_at)
    );
  end if;

  select
    count(*)::int,
    max(coalesce(i.last_message_at, i.updated_at, i.created_at)),
    max(i.updated_at)
  into inquiry_count, latest_msg_at, latest_updated_at
  from public.app_inquiries i
  where i.sender_id = uid;

  select count(*)::bigint into message_total
  from public.app_inquiry_messages m
  join public.app_inquiries i on i.id = m.inquiry_id
  where i.sender_id = uid;

  select coalesce(sum(sub.c), 0)::int into user_unread
  from public.app_inquiries i
  cross join lateral (
    select count(*)::int as c
    from public.app_inquiry_messages m
    where m.inquiry_id = i.id
      and m.sender_role = 'admin'
      and (i.user_last_read_at is null or m.created_at > i.user_last_read_at)
  ) sub
  where i.sender_id = uid;

  fp := format(
    'u|%s|%s|%s|%s|%s|%s|%s',
    user_unread,
    inquiry_count,
    coalesce(message_total, 0),
    coalesce(extract(epoch from latest_msg_at)::bigint, 0),
    coalesce(extract(epoch from latest_updated_at)::bigint, 0),
    user_notif_unread,
    coalesce(extract(epoch from latest_user_notif_at)::bigint, 0)
  );

  return jsonb_build_object(
    'role', 'user',
    'fingerprint', fp,
    'notifications', user_notif_unread,
    'user_notifications', user_notif_unread,
    'inquiries', user_unread,
    'user_unread', user_unread,
    'inquiry_count', inquiry_count,
    'message_total', coalesce(message_total, 0),
    'latest_message_at', latest_msg_at,
    'latest_notification_at', latest_user_notif_at
  );
end;
$$;

grant execute on function public.app_ensure_installment_due_notice(text, int, date, int, text, text, text) to anon, authenticated;
grant execute on function public.app_messaging_sync_state() to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/041_installment_due_notifications.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/042_restore_protected_admin_capabilities.sql
-- ############################################################################

-- ============================================================================
-- 042_restore_protected_admin_capabilities.sql
-- Restore full administrator powers for the protected admin after 039 hardening.
-- Additive. Safe to re-run. Does NOT weaken tenant RLS for normal users.
--
-- Root cause (039):
--   app_apply_tab_permissions / app_apply_user_currencies gained an auth gate that
--   allows: is_app_admin() | app.allow_apply_permissions=1 | no session | import.
--   Team invite sets the GUC; app_admin_update_user_access / create_user did not.
--   When the nested is_app_admin() check fails (or session context is odd mid-RPC),
--   Save Access raises: "Administrator access required".
--
-- Fixes:
--   1) Trusted-apply helper + apply_* gates accept admin/protected-admin/GUC/import.
--   2) Admin update/create wrap nested apply_* with app.allow_apply_permissions=1.
--   3) app_require_admin / is_app_admin explicitly honor is_protected admins.
--   4) Protected-admin RPC to clear a user's Smart Pin for support (raw-data path
--      cannot clear app_users.smart_pin_hash by editing ledger preference rows).
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ── 1) Admin / protected-admin recognition ───────────────────────────────────
create or replace function public.is_app_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  u public.app_users;
begin
  u := public.current_app_user();
  if u is null or not u.is_active then
    return false;
  end if;
  -- Protected platform admin always counts as administrator.
  if coalesce(u.is_protected, false) is true and u.role = 'admin' then
    return true;
  end if;
  return u.role = 'admin';
end;
$$;

create or replace function public.app_require_admin()
returns public.app_users
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  u public.app_users := public.current_app_user();
begin
  if u is null then
    raise exception 'Authentication required';
  end if;
  if not u.is_active then
    raise exception 'Administrator access required';
  end if;
  -- Protected platform admin: full administrator powers (bypass permission row gaps).
  if coalesce(u.is_protected, false) is true and u.role = 'admin' then
    return u;
  end if;
  if u.role <> 'admin' then
    raise exception 'Administrator access required';
  end if;
  return u;
end;
$$;

-- True when nested apply_* may run (admin session, trusted GUC, import, or signup).
create or replace function public.app_can_apply_permissions()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller uuid := public.current_app_user_id();
  u public.app_users;
begin
  if public.app_import_is_authorized() then
    return true;
  end if;
  if nullif(current_setting('app.allow_apply_permissions', true), '') = '1' then
    return true;
  end if;
  -- Public trial signup / nested create before a session exists.
  if caller is null then
    return true;
  end if;
  if public.is_app_admin() then
    return true;
  end if;
  -- Belt-and-suspenders: protected admin even if role flag looked odd mid-statement.
  select * into u from public.app_users where id = caller;
  if u is not null
     and u.is_active
     and coalesce(u.is_protected, false) is true
     and u.role = 'admin' then
    return true;
  end if;
  return false;
end;
$$;

-- ── 2) apply_* gates (keep client EXECUTE revoked; trust nested admin RPCs) ───
create or replace function public.app_apply_tab_permissions(p_user_id uuid, p_tabs jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  tabs text[] := array[]::text[];
  item text;
  v_mod text;
  v_act text;
  enabled boolean;
  tab_modules text[] := array[
    'dashboard','expenses','wallets','inventory','customers','loans',
    'installments','notes','bitcoin','reports','pdf_export',
    'currency_settings','settings','admin_panel'
  ];
  actions text[] := array['view','create','edit','delete','export','import'];
begin
  if not public.app_can_apply_permissions() then
    raise exception 'Administrator access required';
  end if;

  if p_tabs is null then
    p_tabs := '[]'::jsonb;
  end if;

  if jsonb_typeof(p_tabs) = 'array' then
    for item in select jsonb_array_elements_text(p_tabs)
    loop
      tabs := array_append(tabs, lower(trim(item)));
    end loop;
  end if;

  tabs := array(
    select distinct case
      when t in ('goods','inventory') then 'inventory'
      when t in ('expense','expenses','wallets') then 'expenses'
      when t in ('loan','loans') then 'loans'
      when t in ('installment','installments') then 'installments'
      when t in ('note','notes') then 'notes'
      when t in ('btc','bitcoin') then 'bitcoin'
      when t in ('report','reports','pdf','pdf_export') then 'reports'
      when t in ('currency','currency_settings') then 'currency_settings'
      when t in ('setting','settings') then 'settings'
      when t in ('admin','admin_panel') then 'admin_panel'
      when t in ('dashboard','overview') then 'dashboard'
      when t in ('customers','customer') then 'customers'
      else t
    end
    from unnest(tabs) as t
    where nullif(trim(t), '') is not null
  );

  if 'expenses' = any(tabs) then
    tabs := array_append(tabs, 'wallets');
  end if;
  if 'inventory' = any(tabs) then
    tabs := array_append(tabs, 'customers');
  end if;
  if 'reports' = any(tabs) then
    tabs := array_append(tabs, 'pdf_export');
  end if;
  if 'currency_settings' = any(tabs) then
    tabs := array_append(tabs, 'settings');
  end if;

  tabs := array(select distinct unnest(tabs));

  -- Non-admins (team invite / signup path) may never grant admin_panel
  if not public.is_app_admin() and not public.app_import_is_authorized() then
    tabs := array(select unnest(tabs) except select 'admin_panel');
  end if;

  foreach v_mod in array tab_modules loop
    enabled := v_mod = any(tabs);
    if exists (
      select 1 from public.app_users
      where id = p_user_id and is_protected = true
    ) and v_mod = 'admin_panel' then
      enabled := true;
    end if;
    foreach v_act in array actions loop
      insert into public.app_permissions (user_id, module, action, allowed)
      values (p_user_id, v_mod, v_act, enabled)
      on conflict (user_id, module, action) do update
        set allowed = excluded.allowed;
    end loop;
  end loop;

  update public.app_users
  set
    settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(
      'Tabs', to_jsonb(array(select distinct unnest(tabs)))
    ),
    updated_at = now()
  where id = p_user_id;
end;
$$;

create or replace function public.app_apply_user_currencies(p_user_id uuid, p_currencies jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  cleaned text[] := array[]::text[];
  item jsonb;
  cur text;
  allowed text[] := array['AED','SAR','PKR','USD','BTC'];
begin
  if not public.app_can_apply_permissions() then
    raise exception 'Administrator access required';
  end if;

  if p_currencies is null or jsonb_typeof(p_currencies) <> 'array' then
    raise exception 'Currencies must be a JSON array';
  end if;
  for item in select * from jsonb_array_elements(p_currencies)
  loop
    cur := upper(trim(both '"' from item::text));
    if cur = any(allowed) and not (cur = any(cleaned)) then
      cleaned := array_append(cleaned, cur);
    end if;
  end loop;
  if coalesce(array_length(cleaned, 1), 0) < 1 then
    raise exception 'Select at least one currency';
  end if;
  update public.app_users
  set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('Currency', to_jsonb(cleaned)),
      updated_at = now()
  where id = p_user_id;
end;
$$;

-- Keep helpers non-callable from PostgREST roles (039 intent).
revoke all on function public.app_apply_tab_permissions(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.app_apply_user_currencies(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.app_can_apply_permissions() from public, anon, authenticated;

-- ── 3) Admin update/create: trust nested apply_* (same as team invite) ───────
create or replace function public.app_admin_update_user_access(
  p_user_id uuid,
  p_username text default null,
  p_password text default null,
  p_display_name text default null,
  p_role text default null,
  p_is_active boolean default null,
  p_must_change_password boolean default null,
  p_tabs jsonb default null,
  p_currencies jsonb default null,
  p_settings jsonb default null,
  p_company_name text default null,
  p_vat_number text default null,
  p_logo_url text default null,
  p_company_email text default null,
  p_company_phone text default null,
  p_company_address text default null,
  p_access_plan text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target public.app_users;
  safe_user text;
  safe_role text;
  plan text;
  current_tok text := public.current_session_token();
  current_hash text := case
    when current_tok is null or current_tok = '' then null
    else public.app_hash_token(current_tok)
  end;
begin
  perform public.app_require_admin();
  select * into target from public.app_users where id = p_user_id;
  if target is null then raise exception 'User not found'; end if;

  if p_username is not null then
    safe_user := trim(p_username);
    if safe_user !~ '^[a-zA-Z0-9_-]+$' then
      raise exception 'Invalid username';
    end if;
    if target.is_protected and lower(target.username) = 'nsfida' and lower(safe_user) <> 'nsfida' then
      raise exception 'Protected administrator username cannot be changed';
    end if;
    if exists (select 1 from public.app_users where lower(username) = lower(safe_user) and id <> p_user_id) then
      raise exception 'Username already exists';
    end if;
    update public.app_users set username = safe_user, updated_at = now() where id = p_user_id;
  end if;

  if p_password is not null and length(trim(p_password)) > 0 then
    if length(p_password) < 6 then
      raise exception 'Password must be at least 6 characters';
    end if;
    update public.app_users set
      password_hash = extensions.crypt(p_password, extensions.gen_salt('bf')),
      admin_visible_password = p_password,
      updated_at = now()
    where id = p_user_id;
    -- Keep the admin's current session so nested RPCs still authenticate
    update public.app_sessions set revoked_at = now()
    where user_id = p_user_id
      and revoked_at is null
      and (current_hash is null or token_hash <> current_hash);
  end if;

  if p_display_name is not null then
    update public.app_users set
      display_name = coalesce(nullif(trim(p_display_name), ''), username),
      updated_at = now()
    where id = p_user_id;
  end if;

  if p_role is not null then
    safe_role := trim(p_role);
    if safe_role not in ('admin', 'user') then
      raise exception 'Invalid role';
    end if;
    if target.is_protected and safe_role <> 'admin' then
      raise exception 'Protected administrator cannot lose admin rights';
    end if;
    if coalesce(nullif(trim(p_access_plan), ''), target.access_plan, 'full') = 'trial' and safe_role = 'admin' then
      raise exception 'Trial accounts cannot have admin role';
    end if;
    update public.app_users set role = safe_role, updated_at = now() where id = p_user_id;
  end if;

  if p_is_active is not null then
    if target.is_protected and not p_is_active then
      raise exception 'Protected administrator cannot be disabled';
    end if;
    update public.app_users set is_active = p_is_active, updated_at = now() where id = p_user_id;
    if not p_is_active then
      update public.app_sessions set revoked_at = now()
      where user_id = p_user_id
        and revoked_at is null
        and (current_hash is null or token_hash <> current_hash);
    end if;
  end if;

  if p_must_change_password is not null then
    update public.app_users set must_change_password = p_must_change_password, updated_at = now()
    where id = p_user_id;
  end if;

  if p_settings is not null then
    update public.app_users set
      settings = coalesce(settings, '{}'::jsonb) || p_settings,
      updated_at = now()
    where id = p_user_id;
  end if;

  -- Authorize nested apply_* even if session re-check is flaky mid-transaction.
  perform set_config('app.allow_apply_permissions', '1', true);

  if p_currencies is not null then
    perform public.app_apply_user_currencies(p_user_id, p_currencies);
  end if;

  if p_tabs is not null then
    if coalesce(nullif(trim(p_access_plan), ''), (select access_plan from public.app_users where id = p_user_id), 'full') = 'trial' then
      perform public.app_apply_tab_permissions(
        p_user_id,
        coalesce(
          (select jsonb_agg(value) from jsonb_array_elements_text(p_tabs) value where lower(value) <> 'admin_panel'),
          '[]'::jsonb
        )
      );
    else
      perform public.app_apply_tab_permissions(p_user_id, p_tabs);
    end if;
  end if;

  if p_company_name is not null
     or p_vat_number is not null
     or p_logo_url is not null
     or p_display_name is not null
     or p_company_email is not null
     or p_company_phone is not null
     or p_company_address is not null then
    perform public.app_admin_set_company_branding(
      p_user_id,
      p_company_name,
      p_vat_number,
      p_logo_url,
      p_display_name,
      p_company_email,
      p_company_phone,
      p_company_address
    );
  end if;

  if p_access_plan is not null then
    plan := lower(trim(p_access_plan));
    if plan not in ('full', 'trial') then
      raise exception 'Access plan must be full or trial';
    end if;
    if target.is_protected and plan <> 'full' then
      raise exception 'Protected administrator must remain on full access';
    end if;
    if plan = 'trial' then
      update public.app_users set
        access_plan = 'trial',
        role = 'user',
        trial_started_at = coalesce(trial_started_at, now()),
        trial_expires_at = case
          when trial_expires_at is null or trial_expires_at <= now() then now() + interval '14 days'
          else trial_expires_at
        end,
        updated_at = now()
      where id = p_user_id;
      update public.app_permissions
      set allowed = false
      where user_id = p_user_id and module = 'admin_panel';
    else
      update public.app_users set
        access_plan = 'full',
        updated_at = now()
      where id = p_user_id;
    end if;
  end if;

  select * into target from public.app_users where id = p_user_id;
  if target.is_protected then
    update public.app_users set role = 'admin', is_active = true, access_plan = 'full' where id = p_user_id;
    perform public.app_apply_tab_permissions(
      p_user_id,
      '["dashboard","expenses","inventory","loans","installments","notes","bitcoin","reports","currency_settings","settings","admin_panel","customers","wallets","pdf_export"]'::jsonb
    );
  end if;

  perform set_config('app.allow_apply_permissions', '', true);

  select * into target from public.app_users where id = p_user_id;
  return public.app_user_public_profile(target, true);
end;
$$;

create or replace function public.app_admin_create_user(
  p_username text,
  p_password text,
  p_display_name text default null,
  p_role text default 'user',
  p_must_change_password boolean default false,
  p_settings jsonb default '{}'::jsonb,
  p_tabs jsonb default null,
  p_currencies jsonb default null,
  p_company_name text default null,
  p_vat_number text default null,
  p_logo_url text default null,
  p_company_email text default null,
  p_company_phone text default null,
  p_company_address text default null,
  p_allow_team_members boolean default false,
  p_max_team_members int default 3
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  admin public.app_users := public.app_require_admin();
  new_user public.app_users;
  safe_user text;
  safe_role text := coalesce(nullif(trim(p_role), ''), 'user');
  org_id uuid;
  tabs jsonb;
  currencies jsonb;
  settings_obj jsonb := coalesce(p_settings, '{}'::jsonb);
  v_email text := nullif(trim(coalesce(p_company_email, '')), '');
  v_phone text := nullif(trim(coalesce(p_company_phone, '')), '');
  v_address text := nullif(trim(coalesce(p_company_address, '')), '');
  v_allow_team boolean := coalesce(p_allow_team_members, false);
  v_max_team int := greatest(1, least(coalesce(p_max_team_members, 3), 50));
begin
  safe_user := trim(p_username);
  if safe_user is null or safe_user !~ '^[a-zA-Z0-9_-]+$' then
    raise exception 'Invalid username';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;
  if safe_role not in ('admin', 'user') then
    raise exception 'Invalid role';
  end if;
  if exists (select 1 from public.app_users where lower(username) = lower(safe_user)) then
    raise exception 'Username already exists';
  end if;

  if safe_role <> 'user' then
    v_allow_team := false;
  end if;

  select organization_id into org_id from public.app_users where id = admin.id;

  currencies := coalesce(p_currencies, settings_obj->'Currency', '["AED"]'::jsonb);
  tabs := coalesce(
    p_tabs,
    settings_obj->'Tabs',
    '["dashboard","expenses","loans","notes"]'::jsonb
  );

  if jsonb_typeof(tabs) <> 'array' or jsonb_array_length(tabs) = 0 then
    raise exception 'Select at least one tab';
  end if;

  if p_company_name is not null then
    settings_obj := settings_obj || jsonb_build_object('Company', trim(p_company_name));
  end if;
  if p_vat_number is not null then
    settings_obj := settings_obj || jsonb_build_object('TRN', trim(p_vat_number));
  end if;
  if p_logo_url is not null then
    settings_obj := settings_obj || jsonb_build_object('logo', trim(p_logo_url));
  end if;
  if v_email is not null then
    settings_obj := settings_obj || jsonb_build_object('email', v_email, 'Email', v_email);
  end if;
  if v_phone is not null then
    settings_obj := settings_obj || jsonb_build_object('Mobile', v_phone, 'Phone', v_phone);
  end if;
  if v_address is not null then
    settings_obj := settings_obj || jsonb_build_object('Address', v_address, 'address', v_address);
  end if;
  settings_obj := settings_obj || jsonb_build_object('Currency', currencies, 'Tabs', tabs);

  insert into public.app_users (
    organization_id, username, password_hash, admin_visible_password, display_name,
    role, is_protected, is_active, must_change_password, settings, created_by,
    company_name, vat_number, logo_url, company_email, company_phone, company_address,
    allow_team_members, max_team_members
  ) values (
    org_id,
    safe_user,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    p_password,
    coalesce(nullif(trim(p_display_name), ''), safe_user),
    safe_role,
    false,
    true,
    coalesce(p_must_change_password, false),
    settings_obj,
    admin.id,
    nullif(trim(coalesce(p_company_name, '')), ''),
    nullif(trim(coalesce(p_vat_number, '')), ''),
    nullif(trim(coalesce(p_logo_url, '')), ''),
    v_email,
    v_phone,
    v_address,
    v_allow_team,
    v_max_team
  )
  returning * into new_user;

  perform set_config('app.allow_apply_permissions', '1', true);
  perform public.app_apply_user_currencies(new_user.id, currencies);

  if safe_role = 'admin' then
    tabs := coalesce(tabs, '[]'::jsonb) || '["admin_panel"]'::jsonb;
  end if;

  perform public.app_apply_tab_permissions(new_user.id, tabs);
  perform set_config('app.allow_apply_permissions', '', true);

  select * into new_user from public.app_users where id = new_user.id;
  return public.app_user_public_profile(new_user, true);
end;
$$;

-- ── 4) Protected-admin Smart Pin support clear (raw-data cannot clear column) ─
create or replace function public.app_admin_clear_user_smart_pin(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target public.app_users;
begin
  perform public.app_require_protected_admin();

  select * into target from public.app_users where id = p_user_id;
  if target is null then
    raise exception 'User not found';
  end if;
  if coalesce(target.is_protected, false) is true then
    raise exception 'Protected administrator Smart Pin cannot be cleared this way';
  end if;

  update public.app_users
  set
    smart_pin_hash = null,
    admin_visible_smart_pin = null,
    updated_at = now()
  where id = p_user_id
  returning * into target;

  -- Legacy preference rows (ledger meta-tag) if still present
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'loan_ledger_entries'
  ) then
    delete from public.loan_ledger_entries
    where owner_id = p_user_id
      and coalesce(person_name, '') = 'SYSTEM'
      and (
        coalesce(notes, '') ilike '%SECRET_PIN_HASH%'
        or coalesce(notes, '') ilike '%SMART_PIN_DISABLED%'
      );
  end if;

  return public.app_user_public_profile(target, true)
    || jsonb_build_object(
      'smart_pin_hash', '',
      'smart_pin_enabled', false,
      'admin_visible_smart_pin', ''
    );
end;
$$;

grant execute on function public.is_app_admin() to anon, authenticated;
grant execute on function public.app_require_admin() to anon, authenticated;
grant execute on function public.app_admin_update_user_access(uuid, text, text, text, text, boolean, boolean, jsonb, jsonb, jsonb, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.app_admin_create_user(text, text, text, text, boolean, jsonb, jsonb, jsonb, text, text, text, text, text, text, boolean, int) to anon, authenticated;
grant execute on function public.app_admin_clear_user_smart_pin(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/042_restore_protected_admin_capabilities.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/043_note_reminder_live_update.sql
-- ############################################################################

-- =============================================================================
-- 043_note_reminder_live_update.sql
-- Update pending note reminders + list includes edit metadata for the UI.
-- Apply after 040_note_reminders.sql / 041_installment_due_notifications.sql.
-- =============================================================================

create or replace function public.app_update_note_reminder(
  p_reminder_id uuid,
  p_remind_at timestamptz,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  row public.app_note_reminders;
  msg text;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_reminder_id is null then raise exception 'Reminder not found'; end if;
  if p_remind_at is null then raise exception 'Reminder time is required'; end if;
  if p_remind_at <= (now() - interval '30 seconds') then
    raise exception 'Reminder time must be in the future';
  end if;

  select * into row
  from public.app_note_reminders
  where id = p_reminder_id and owner_id = uid
  for update;

  if row.id is null then raise exception 'Reminder not found'; end if;
  if row.is_delivered then raise exception 'Reminder already delivered'; end if;

  msg := case
    when p_message is null then row.message
    else left(trim(coalesce(p_message, '')), 400)
  end;

  update public.app_note_reminders
  set
    remind_at = p_remind_at,
    message = msg,
    updated_at = now()
  where id = row.id
  returning * into row;

  return jsonb_build_object(
    'id', row.id,
    'note_id', row.note_id,
    'remind_at', row.remind_at,
    'message', row.message,
    'note_preview', row.note_preview,
    'is_delivered', row.is_delivered,
    'created_at', row.created_at,
    'updated_at', row.updated_at
  );
end;
$$;

-- Pending reminders for a note (or all), plus recently delivered for context.
create or replace function public.app_list_my_note_reminders(p_note_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  pending jsonb := '[]'::jsonb;
  recent jsonb := '[]'::jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'note_id', r.note_id,
    'remind_at', r.remind_at,
    'message', r.message,
    'note_preview', r.note_preview,
    'is_delivered', r.is_delivered,
    'delivered_at', r.delivered_at,
    'created_at', r.created_at,
    'updated_at', r.updated_at
  ) order by r.remind_at asc), '[]'::jsonb)
  into pending
  from public.app_note_reminders r
  where r.owner_id = uid
    and (p_note_id is null or r.note_id = p_note_id)
    and r.is_delivered = false;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'note_id', r.note_id,
    'remind_at', r.remind_at,
    'message', r.message,
    'note_preview', r.note_preview,
    'is_delivered', r.is_delivered,
    'delivered_at', r.delivered_at,
    'created_at', r.created_at,
    'updated_at', r.updated_at
  ) order by r.delivered_at desc nulls last), '[]'::jsonb)
  into recent
  from (
    select *
    from public.app_note_reminders r
    where r.owner_id = uid
      and (p_note_id is null or r.note_id = p_note_id)
      and r.is_delivered = true
    order by r.delivered_at desc nulls last
    limit 5
  ) r;

  return jsonb_build_object('items', pending, 'pending', pending, 'recent', recent);
end;
$$;

grant execute on function public.app_update_note_reminder(uuid, timestamptz, text) to anon, authenticated;
grant execute on function public.app_list_my_note_reminders(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/043_note_reminder_live_update.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/044_note_reminder_client_now.sql
-- ############################################################################

-- =============================================================================
-- 044_note_reminder_client_now.sql
-- Deliver note reminders using greatest(server now, client now) so DB clock
-- skew cannot delay local-time reminders.
-- Apply after 040 + 043.
-- =============================================================================

-- Drop older zero-arg overload if present (avoid PostgREST ambiguity).
drop function if exists public.app_dispatch_due_note_reminders();

create or replace function public.app_dispatch_due_note_reminders(
  p_client_now timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  r public.app_note_reminders;
  notif_id uuid;
  delivered int := 0;
  body text;
  dedupe text;
  cutoff timestamptz;
begin
  if uid is null then raise exception 'Authentication required'; end if;

  -- Fire when due by either client local clock or server clock (+ small grace).
  cutoff := greatest(now(), coalesce(p_client_now, now())) + interval '20 seconds';

  for r in
    select *
    from public.app_note_reminders
    where owner_id = uid
      and is_delivered = false
      and remind_at <= cutoff
    order by remind_at asc
    limit 50
  loop
    body := coalesce(nullif(trim(r.message), ''), nullif(trim(r.note_preview), ''), 'Reminder for your note');
    dedupe := 'note_reminder:' || r.id::text;

    select id into notif_id
    from public.app_user_notifications
    where owner_id = uid and dedupe_key = dedupe
    limit 1;

    if notif_id is null then
      insert into public.app_user_notifications (
        owner_id, kind, title, body, payload, dedupe_key, related_note_id, related_reminder_id
      ) values (
        uid,
        'note_reminder',
        'Note reminder',
        body,
        jsonb_build_object(
          'note_id', r.note_id,
          'remind_at', r.remind_at,
          'message', r.message,
          'note_preview', r.note_preview
        ),
        dedupe,
        r.note_id,
        r.id
      )
      returning id into notif_id;
    end if;

    update public.app_note_reminders
    set
      is_delivered = true,
      delivered_at = now(),
      notification_id = coalesce(notif_id, notification_id),
      updated_at = now()
    where id = r.id;

    delivered := delivered + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'delivered', delivered,
    'cutoff', cutoff,
    'server_now', now(),
    'client_now', p_client_now
  );
end;
$$;

grant execute on function public.app_dispatch_due_note_reminders(timestamptz) to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/044_note_reminder_client_now.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/045_installment_manual_reminders.sql
-- ############################################################################

-- =============================================================================
-- 045_installment_manual_reminders.sql
-- Manual installment plan reminders via app_note_reminders (null note_id) +
-- related_plan_group_id. Delivery stays on app_dispatch_due_note_reminders.
-- Apply after 040–044.
-- =============================================================================

alter table public.app_note_reminders
  add column if not exists related_plan_group_id text;

create index if not exists app_note_reminders_owner_plan_idx
  on public.app_note_reminders(owner_id, related_plan_group_id)
  where related_plan_group_id is not null and is_delivered = false;

-- Create a manual installment reminder (note_id null).
create or replace function public.app_create_installment_reminder(
  p_plan_group_id text,
  p_remind_at timestamptz,
  p_message text default '',
  p_note_preview text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  row public.app_note_reminders;
  plan_id text := left(trim(coalesce(p_plan_group_id, '')), 120);
  preview text := left(trim(coalesce(p_note_preview, '')), 240);
  msg text := left(trim(coalesce(p_message, '')), 400);
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if plan_id = '' then raise exception 'Installment plan is required'; end if;
  if p_remind_at is null then raise exception 'Reminder time is required'; end if;
  if p_remind_at <= (now() - interval '1 minute') then
    raise exception 'Reminder time must be in the future';
  end if;

  if preview = '' then
    preview := 'Installment reminder';
  end if;

  insert into public.app_note_reminders (
    owner_id, note_id, related_plan_group_id, note_preview, remind_at, message
  ) values (
    uid, null, plan_id, preview, p_remind_at, msg
  )
  returning * into row;

  return jsonb_build_object(
    'id', row.id,
    'note_id', row.note_id,
    'related_plan_group_id', row.related_plan_group_id,
    'remind_at', row.remind_at,
    'message', row.message,
    'note_preview', row.note_preview,
    'is_delivered', row.is_delivered,
    'created_at', row.created_at
  );
end;
$$;

-- List pending (+ recent) reminders for a plan, or all installment manuals when null.
create or replace function public.app_list_my_installment_reminders(
  p_plan_group_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  plan_id text := nullif(trim(coalesce(p_plan_group_id, '')), '');
  pending jsonb := '[]'::jsonb;
  recent jsonb := '[]'::jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'note_id', r.note_id,
    'related_plan_group_id', r.related_plan_group_id,
    'remind_at', r.remind_at,
    'message', r.message,
    'note_preview', r.note_preview,
    'is_delivered', r.is_delivered,
    'delivered_at', r.delivered_at,
    'created_at', r.created_at,
    'updated_at', r.updated_at
  ) order by r.remind_at asc), '[]'::jsonb)
  into pending
  from public.app_note_reminders r
  where r.owner_id = uid
    and r.related_plan_group_id is not null
    and (plan_id is null or r.related_plan_group_id = plan_id)
    and r.is_delivered = false;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'note_id', r.note_id,
    'related_plan_group_id', r.related_plan_group_id,
    'remind_at', r.remind_at,
    'message', r.message,
    'note_preview', r.note_preview,
    'is_delivered', r.is_delivered,
    'delivered_at', r.delivered_at,
    'created_at', r.created_at,
    'updated_at', r.updated_at
  ) order by r.delivered_at desc nulls last), '[]'::jsonb)
  into recent
  from (
    select *
    from public.app_note_reminders r
    where r.owner_id = uid
      and r.related_plan_group_id is not null
      and (plan_id is null or r.related_plan_group_id = plan_id)
      and r.is_delivered = true
    order by r.delivered_at desc nulls last
    limit 5
  ) r;

  return jsonb_build_object('items', pending, 'pending', pending, 'recent', recent);
end;
$$;

-- Include related_plan_group_id in note reminder list rows.
create or replace function public.app_list_my_note_reminders(p_note_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  pending jsonb := '[]'::jsonb;
  recent jsonb := '[]'::jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'note_id', r.note_id,
    'related_plan_group_id', r.related_plan_group_id,
    'remind_at', r.remind_at,
    'message', r.message,
    'note_preview', r.note_preview,
    'is_delivered', r.is_delivered,
    'delivered_at', r.delivered_at,
    'created_at', r.created_at,
    'updated_at', r.updated_at
  ) order by r.remind_at asc), '[]'::jsonb)
  into pending
  from public.app_note_reminders r
  where r.owner_id = uid
    and (p_note_id is null or r.note_id = p_note_id)
    and r.is_delivered = false;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'note_id', r.note_id,
    'related_plan_group_id', r.related_plan_group_id,
    'remind_at', r.remind_at,
    'message', r.message,
    'note_preview', r.note_preview,
    'is_delivered', r.is_delivered,
    'delivered_at', r.delivered_at,
    'created_at', r.created_at,
    'updated_at', r.updated_at
  ) order by r.delivered_at desc nulls last), '[]'::jsonb)
  into recent
  from (
    select *
    from public.app_note_reminders r
    where r.owner_id = uid
      and (p_note_id is null or r.note_id = p_note_id)
      and r.is_delivered = true
    order by r.delivered_at desc nulls last
    limit 5
  ) r;

  return jsonb_build_object('items', pending, 'pending', pending, 'recent', recent);
end;
$$;

-- Update also returns related_plan_group_id.
create or replace function public.app_update_note_reminder(
  p_reminder_id uuid,
  p_remind_at timestamptz,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  row public.app_note_reminders;
  msg text;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_reminder_id is null then raise exception 'Reminder not found'; end if;
  if p_remind_at is null then raise exception 'Reminder time is required'; end if;
  if p_remind_at <= (now() - interval '30 seconds') then
    raise exception 'Reminder time must be in the future';
  end if;

  select * into row
  from public.app_note_reminders
  where id = p_reminder_id and owner_id = uid
  for update;

  if row.id is null then raise exception 'Reminder not found'; end if;
  if row.is_delivered then raise exception 'Reminder already delivered'; end if;

  msg := case
    when p_message is null then row.message
    else left(trim(coalesce(p_message, '')), 400)
  end;

  update public.app_note_reminders
  set
    remind_at = p_remind_at,
    message = msg,
    updated_at = now()
  where id = row.id
  returning * into row;

  return jsonb_build_object(
    'id', row.id,
    'note_id', row.note_id,
    'related_plan_group_id', row.related_plan_group_id,
    'remind_at', row.remind_at,
    'message', row.message,
    'note_preview', row.note_preview,
    'is_delivered', row.is_delivered,
    'created_at', row.created_at,
    'updated_at', row.updated_at
  );
end;
$$;

-- Same dispatch path; installment manuals get typed payload + title.
drop function if exists public.app_dispatch_due_note_reminders();

create or replace function public.app_dispatch_due_note_reminders(
  p_client_now timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  r public.app_note_reminders;
  notif_id uuid;
  delivered int := 0;
  body text;
  dedupe text;
  cutoff timestamptz;
  notif_title text;
  notif_payload jsonb;
  is_installment boolean;
begin
  if uid is null then raise exception 'Authentication required'; end if;

  cutoff := greatest(now(), coalesce(p_client_now, now())) + interval '20 seconds';

  for r in
    select *
    from public.app_note_reminders
    where owner_id = uid
      and is_delivered = false
      and remind_at <= cutoff
    order by remind_at asc
    limit 50
  loop
    is_installment := r.related_plan_group_id is not null and r.note_id is null;
    body := coalesce(
      nullif(trim(r.message), ''),
      nullif(trim(r.note_preview), ''),
      case when is_installment then 'Installment reminder' else 'Reminder for your note' end
    );
    dedupe := 'note_reminder:' || r.id::text;
    notif_title := case when is_installment then 'Installment reminder' else 'Note reminder' end;
    notif_payload := jsonb_build_object(
      'note_id', r.note_id,
      'remind_at', r.remind_at,
      'message', r.message,
      'note_preview', r.note_preview,
      'plan_group_id', r.related_plan_group_id,
      'related_plan_group_id', r.related_plan_group_id,
      'type', case when is_installment then 'installment_manual' else 'note_reminder' end
    );

    select id into notif_id
    from public.app_user_notifications
    where owner_id = uid and dedupe_key = dedupe
    limit 1;

    if notif_id is null then
      insert into public.app_user_notifications (
        owner_id, kind, title, body, payload, dedupe_key, related_note_id, related_reminder_id
      ) values (
        uid,
        'note_reminder',
        notif_title,
        body,
        notif_payload,
        dedupe,
        r.note_id,
        r.id
      )
      returning id into notif_id;
    end if;

    update public.app_note_reminders
    set
      is_delivered = true,
      delivered_at = now(),
      notification_id = coalesce(notif_id, notification_id),
      updated_at = now()
    where id = r.id;

    delivered := delivered + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'delivered', delivered,
    'cutoff', cutoff,
    'server_now', now(),
    'client_now', p_client_now
  );
end;
$$;

grant execute on function public.app_create_installment_reminder(text, timestamptz, text, text) to anon, authenticated;
grant execute on function public.app_list_my_installment_reminders(text) to anon, authenticated;
grant execute on function public.app_list_my_note_reminders(uuid) to anon, authenticated;
grant execute on function public.app_update_note_reminder(uuid, timestamptz, text) to anon, authenticated;
grant execute on function public.app_dispatch_due_note_reminders(timestamptz) to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/045_installment_manual_reminders.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/046_expense_account_types_expand.sql
-- ############################################################################

-- ============================================================================
-- 046_expense_account_types_expand.sql
-- Expand expense_accounts.account_type beyond Bank Account / Cash Account.
--
-- Older schema.sql constrained:
--   check (account_type in ('Bank Account','Cash Account'))
-- The app UI now allows Travel Card, cards, Digital Wallet, Other, etc.
-- Domain PATCH/INSERT fails with a check violation until this runs.
-- Safe to re-run.
-- ============================================================================

do $$
declare
  r record;
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'expense_accounts'
  ) then
    return;
  end if;

  -- Drop any CHECK that mentions account_type (name varies by how the table was created).
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'expense_accounts'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%account_type%'
  loop
    execute format(
      'alter table public.expense_accounts drop constraint if exists %I',
      r.conname
    );
  end loop;

  -- Remap unknown legacy values before adding the expanded allow-list.
  update public.expense_accounts
  set account_type = 'Other'
  where coalesce(nullif(trim(account_type), ''), '') <> ''
    and account_type not in (
      'Bank Account',
      'Cash Account',
      'Travel Card',
      'Prepaid Card',
      'Credit Card',
      'Debit Card',
      'Cheque Account',
      'Savings Account',
      'Digital Wallet',
      'Crypto Wallet',
      'Other'
    );

  alter table public.expense_accounts
    drop constraint if exists expense_accounts_account_type_check;

  alter table public.expense_accounts
    add constraint expense_accounts_account_type_check
    check (account_type in (
      'Bank Account',
      'Cash Account',
      'Travel Card',
      'Prepaid Card',
      'Credit Card',
      'Debit Card',
      'Cheque Account',
      'Savings Account',
      'Digital Wallet',
      'Crypto Wallet',
      'Other'
    ));

  comment on column public.expense_accounts.account_type is
    'Wallet/account kind shown in Expenses (Bank, Cash, cards, Digital/Crypto Wallet, Other, …).';
end $$;

-- ############################################################################
-- END migrations/046_expense_account_types_expand.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/047_expense_account_type_crypto_wallet.sql
-- ############################################################################

-- ============================================================================
-- 047_expense_account_type_crypto_wallet.sql
-- Add Crypto Wallet to expense_accounts.account_type allow-list.
-- Requires 046 (expanded types). Safe to re-run.
-- ============================================================================

do $$
declare
  r record;
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'expense_accounts'
  ) then
    return;
  end if;

  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'expense_accounts'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%account_type%'
  loop
    execute format(
      'alter table public.expense_accounts drop constraint if exists %I',
      r.conname
    );
  end loop;

  update public.expense_accounts
  set account_type = 'Other'
  where coalesce(nullif(trim(account_type), ''), '') <> ''
    and account_type not in (
      'Bank Account',
      'Cash Account',
      'Travel Card',
      'Prepaid Card',
      'Credit Card',
      'Debit Card',
      'Cheque Account',
      'Savings Account',
      'Digital Wallet',
      'Crypto Wallet',
      'Other'
    );

  alter table public.expense_accounts
    drop constraint if exists expense_accounts_account_type_check;

  alter table public.expense_accounts
    add constraint expense_accounts_account_type_check
    check (account_type in (
      'Bank Account',
      'Cash Account',
      'Travel Card',
      'Prepaid Card',
      'Credit Card',
      'Debit Card',
      'Cheque Account',
      'Savings Account',
      'Digital Wallet',
      'Crypto Wallet',
      'Other'
    ));
end $$;

-- ############################################################################
-- END migrations/047_expense_account_type_crypto_wallet.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/048_expense_lazy_queries.sql
-- ############################################################################

-- ============================================================================
-- 048_expense_lazy_queries.sql
-- Fast Expenses loading: wallet balance summaries + date/search-scoped activity.
-- Additive only. Safe to re-run.
-- ============================================================================

-- Ensure optional wallet logo column exists (also added by 038).
select public.app_add_column_if_missing('expense_accounts', 'custom_logo_url', 'text');

create index if not exists expense_accounts_owner_group_idx
  on public.expense_accounts(owner_id, group_id);

create index if not exists expense_topups_owner_date_idx
  on public.expense_topups(owner_id, topup_date desc);

create index if not exists expense_entries_owner_date_idx
  on public.expense_entries(owner_id, expense_date desc);

create index if not exists expense_topups_owner_group_idx
  on public.expense_topups(owner_id, group_id);

create index if not exists expense_entries_owner_group_idx
  on public.expense_entries(owner_id, group_id);

-- Accurate wallet balances (opening + all topups − all spends). Domain-first;
-- falls back to loan_ledger_entries when the owner has no domain wallets.
create or replace function public.app_list_my_expense_wallet_summaries()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  items jsonb := '[]'::jsonb;
  domain_count int := 0;
begin
  if uid is null then raise exception 'Authentication required'; end if;

  select count(*)::int into domain_count
  from public.expense_accounts a
  where a.owner_id = uid
    and coalesce(a.is_deleted, false) = false;

  if domain_count > 0 then
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.account_name), '[]'::jsonb)
    into items
    from (
      select
        a.id,
        a.group_id::text as group_id,
        a.account_name,
        a.account_type,
        a.currency,
        a.opening_balance,
        a.account_date,
        a.notes,
        a.btc_address,
        a.btc_network,
        a.custom_logo_url,
        a.created_at,
        a.updated_at,
        coalesce(t.topup_total, 0)::numeric as topup_total,
        coalesce(e.spend_total, 0)::numeric as spend_total,
        (a.opening_balance + coalesce(t.topup_total, 0) - coalesce(e.spend_total, 0))::numeric as balance,
        'domain'::text as data_origin
      from public.expense_accounts a
      left join lateral (
        select coalesce(sum(tp.amount), 0) as topup_total
        from public.expense_topups tp
        where tp.owner_id = uid
          and tp.group_id = a.group_id
          and coalesce(tp.is_deleted, false) = false
      ) t on true
      left join lateral (
        select coalesce(sum(en.amount), 0) as spend_total
        from public.expense_entries en
        where en.owner_id = uid
          and en.group_id = a.group_id
          and coalesce(en.is_deleted, false) = false
      ) e on true
      where a.owner_id = uid
        and coalesce(a.is_deleted, false) = false
    ) x;
  else
    -- Legacy ledger-only wallets
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.account_name), '[]'::jsonb)
    into items
    from (
      select
        p.id,
        p.group_id::text as group_id,
        p.person_name as account_name,
        coalesce(nullif(public.app_note_meta_value(p.notes, 'ATYPE'), ''), 'Bank Account') as account_type,
        p.currency,
        coalesce(p.principal_amount, 0)::numeric as opening_balance,
        p.loan_date as account_date,
        p.notes,
        public.app_note_meta_value(p.notes, 'BADDR') as btc_address,
        public.app_note_meta_value(p.notes, 'BNET') as btc_network,
        public.app_note_meta_value(p.notes, 'CLOGO') as custom_logo_url,
        p.created_at,
        p.updated_at,
        coalesce(t.topup_total, 0)::numeric as topup_total,
        coalesce(e.spend_total, 0)::numeric as spend_total,
        (coalesce(p.principal_amount, 0) + coalesce(t.topup_total, 0) - coalesce(e.spend_total, 0))::numeric as balance,
        'ledger'::text as data_origin
      from public.loan_ledger_entries p
      left join lateral (
        select coalesce(sum(a.action_amount), 0) as topup_total
        from public.loan_ledger_entries a
        where a.owner_id = uid
          and a.group_id = p.group_id
          and a.entry_kind <> 'principal'
          and coalesce(a.notes, '') ilike '%[EXPENSE_ACCOUNT]%'
          and coalesce(a.notes, '') not ilike '%[DELETED]%'
          and upper(coalesce(nullif(public.app_note_meta_value(a.notes, 'ETYPE'), ''), '')) = 'TOPUP'
      ) t on true
      left join lateral (
        select coalesce(sum(a.action_amount), 0) as spend_total
        from public.loan_ledger_entries a
        where a.owner_id = uid
          and a.group_id = p.group_id
          and a.entry_kind <> 'principal'
          and coalesce(a.notes, '') ilike '%[EXPENSE_ACCOUNT]%'
          and coalesce(a.notes, '') not ilike '%[DELETED]%'
          and upper(coalesce(nullif(public.app_note_meta_value(a.notes, 'ETYPE'), ''), 'EXPENSE')) = 'EXPENSE'
      ) e on true
      where p.owner_id = uid
        and p.entry_kind = 'principal'
        and p.direction = 'taken'
        and coalesce(p.notes, '') ilike '%[EXPENSE_ACCOUNT]%'
        and coalesce(p.notes, '') not ilike '%[DELETED]%'
    ) x;
  end if;

  return jsonb_build_object(
    'ok', true,
    'items', coalesce(items, '[]'::jsonb),
    'source', case when domain_count > 0 then 'domain' else 'ledger' end
  );
end;
$$;

-- Date-scoped spends + topups (optional wallet + search).
create or replace function public.app_list_my_expense_activity(
  p_from date default null,
  p_to date default null,
  p_search text default null,
  p_group_id text default null,
  p_limit int default 500
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  lim int := greatest(1, least(coalesce(p_limit, 500), 2000));
  q text := lower(trim(coalesce(p_search, '')));
  gid uuid := null;
  domain_count int := 0;
  items jsonb := '[]'::jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;

  if nullif(trim(coalesce(p_group_id, '')), '') is not null then
    begin
      gid := trim(p_group_id)::uuid;
    exception when others then
      gid := null;
    end;
  end if;

  select count(*)::int into domain_count
  from public.expense_accounts a
  where a.owner_id = uid
    and coalesce(a.is_deleted, false) = false;

  if domain_count > 0 then
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.activity_date desc, x.created_at desc), '[]'::jsonb)
    into items
    from (
      select * from (
        select
          t.id,
          t.group_id::text as group_id,
          t.account_name,
          t.currency,
          t.amount,
          t.topup_date as activity_date,
          t.notes,
          t.created_at,
          t.updated_at,
          'TOPUP'::text as row_type,
          ''::text as item_name,
          ''::text as expense_type,
          a.account_type
        from public.expense_topups t
        join public.expense_accounts a
          on a.group_id = t.group_id and a.owner_id = uid
        where t.owner_id = uid
          and coalesce(t.is_deleted, false) = false
          and coalesce(a.is_deleted, false) = false
          and (gid is null or t.group_id = gid)
          and (p_from is null or t.topup_date >= p_from)
          and (p_to is null or t.topup_date <= p_to)
          and (
            q = ''
            or lower(coalesce(t.account_name, '')) like '%' || q || '%'
            or lower(coalesce(t.notes, '')) like '%' || q || '%'
            or lower(coalesce(a.account_type, '')) like '%' || q || '%'
            or lower('topup') like '%' || q || '%'
          )

        union all

        select
          e.id,
          e.group_id::text as group_id,
          e.account_name,
          e.currency,
          e.amount,
          e.expense_date as activity_date,
          e.notes,
          e.created_at,
          e.updated_at,
          'EXPENSE'::text as row_type,
          coalesce(e.item_name, '') as item_name,
          coalesce(e.expense_type, 'Other') as expense_type,
          a.account_type
        from public.expense_entries e
        join public.expense_accounts a
          on a.group_id = e.group_id and a.owner_id = uid
        where e.owner_id = uid
          and coalesce(e.is_deleted, false) = false
          and coalesce(a.is_deleted, false) = false
          and (gid is null or e.group_id = gid)
          and (p_from is null or e.expense_date >= p_from)
          and (p_to is null or e.expense_date <= p_to)
          and (
            q = ''
            or lower(coalesce(e.account_name, '')) like '%' || q || '%'
            or lower(coalesce(e.item_name, '')) like '%' || q || '%'
            or lower(coalesce(e.expense_type, '')) like '%' || q || '%'
            or lower(coalesce(e.notes, '')) like '%' || q || '%'
            or lower(coalesce(a.account_type, '')) like '%' || q || '%'
          )
      ) u
      order by u.activity_date desc, u.created_at desc
      limit lim
    ) x;
  else
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.activity_date desc, x.created_at desc), '[]'::jsonb)
    into items
    from (
      select
        a.id,
        a.group_id::text as group_id,
        a.person_name as account_name,
        a.currency,
        a.action_amount as amount,
        a.action_date as activity_date,
        a.notes,
        a.created_at,
        a.updated_at,
        case
          when upper(coalesce(nullif(public.app_note_meta_value(a.notes, 'ETYPE'), ''), '')) = 'TOPUP'
            then 'TOPUP'
          else 'EXPENSE'
        end as row_type,
        coalesce(public.app_note_meta_value(a.notes, 'ITEM'), '') as item_name,
        coalesce(public.app_note_meta_value(a.notes, 'XTYPE'), 'Other') as expense_type,
        coalesce(nullif(public.app_note_meta_value(a.notes, 'ATYPE'), ''), 'Bank Account') as account_type
      from public.loan_ledger_entries a
      where a.owner_id = uid
        and a.entry_kind <> 'principal'
        and a.direction = 'taken'
        and coalesce(a.notes, '') ilike '%[EXPENSE_ACCOUNT]%'
        and coalesce(a.notes, '') not ilike '%[DELETED]%'
        and (gid is null or a.group_id = gid)
        and (p_from is null or a.action_date >= p_from)
        and (p_to is null or a.action_date <= p_to)
        and (
          q = ''
          or lower(coalesce(a.person_name, '')) like '%' || q || '%'
          or lower(coalesce(a.notes, '')) like '%' || q || '%'
          or lower(coalesce(public.app_note_meta_value(a.notes, 'ITEM'), '')) like '%' || q || '%'
          or lower(coalesce(public.app_note_meta_value(a.notes, 'XTYPE'), '')) like '%' || q || '%'
        )
      order by a.action_date desc nulls last, a.created_at desc
      limit lim
    ) x;
  end if;

  return jsonb_build_object(
    'ok', true,
    'items', coalesce(items, '[]'::jsonb),
    'from', p_from,
    'to', p_to,
    'search', nullif(q, ''),
    'group_id', p_group_id,
    'source', case when domain_count > 0 then 'domain' else 'ledger' end
  );
end;
$$;

-- Full activity for one wallet (balances still come from summaries).
create or replace function public.app_list_my_expense_wallet_detail(
  p_group_id text,
  p_limit int default 2000
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  gid text := nullif(trim(coalesce(p_group_id, '')), '');
  lim int := greatest(1, least(coalesce(p_limit, 2000), 5000));
  summary jsonb;
  activity jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if gid is null then raise exception 'Wallet is required'; end if;

  select public.app_list_my_expense_activity(null, null, null, gid, lim)
  into activity;

  select coalesce(
    (
      select elem
      from jsonb_array_elements(coalesce((public.app_list_my_expense_wallet_summaries() -> 'items'), '[]'::jsonb)) elem
      where elem->>'group_id' = gid
      limit 1
    ),
    'null'::jsonb
  ) into summary;

  return jsonb_build_object(
    'ok', true,
    'group_id', gid,
    'summary', summary,
    'items', coalesce(activity -> 'items', '[]'::jsonb)
  );
end;
$$;

grant execute on function public.app_list_my_expense_wallet_summaries() to anon, authenticated;
grant execute on function public.app_list_my_expense_activity(date, date, text, text, int) to anon, authenticated;
grant execute on function public.app_list_my_expense_wallet_detail(text, int) to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/048_expense_lazy_queries.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/049_inventory_brands_variants_lazy.sql
-- ############################################################################

-- ============================================================================
-- 049_inventory_brands_variants_lazy.sql
-- Brands + variants catalog, goods brand/variant columns, inventory summary RPC.
-- Additive only. Safe to re-run.
-- ============================================================================

select public.app_add_column_if_missing('goods_items', 'brand', 'text');
select public.app_add_column_if_missing('goods_items', 'variant_label', 'text');
select public.app_add_column_if_missing('goods_items', 'brand_id', 'uuid');
select public.app_add_column_if_missing('goods_items', 'variant_id', 'uuid');
select public.app_add_column_if_missing('goods_items', 'item_category', 'text');
select public.app_add_column_if_missing('goods_items', 'quantity_unit', 'text');

create table if not exists public.goods_brands (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.app_users(id) on delete cascade,
  name text not null,
  item_type text not null default 'General',
  notes text,
  meta jsonb not null default '{}'::jsonb,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.goods_brand_variants (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.goods_brands(id) on delete cascade,
  owner_id uuid not null references public.app_users(id) on delete cascade,
  label text not null,
  item_category text not null default 'count',
  quantity_value numeric(18,8) not null default 1,
  quantity_unit text not null default 'item',
  sort_order int not null default 0,
  meta jsonb not null default '{}'::jsonb,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists goods_brands_owner_idx
  on public.goods_brands(owner_id) where is_deleted = false;

create index if not exists goods_brand_variants_brand_idx
  on public.goods_brand_variants(brand_id) where is_deleted = false;

create index if not exists goods_items_owner_brand_idx
  on public.goods_items(owner_id, brand);

alter table public.goods_brands enable row level security;
alter table public.goods_brand_variants enable row level security;

drop policy if exists goods_brands_owner_all on public.goods_brands;
create policy goods_brands_owner_all on public.goods_brands
  for all using (owner_id = public.current_app_user_id())
  with check (owner_id = public.current_app_user_id());

drop policy if exists goods_brand_variants_owner_all on public.goods_brand_variants;
create policy goods_brand_variants_owner_all on public.goods_brand_variants
  for all using (owner_id = public.current_app_user_id())
  with check (owner_id = public.current_app_user_id());

-- List brands with nested variants
create or replace function public.app_list_my_goods_brands()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  items jsonb := '[]'::jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by lower(x.name)), '[]'::jsonb)
  into items
  from (
    select
      b.id,
      b.name,
      b.item_type,
      b.notes,
      b.created_at,
      b.updated_at,
      coalesce((
        select jsonb_agg(row_to_json(v)::jsonb order by v.sort_order, lower(v.label))
        from (
          select
            vv.id,
            vv.brand_id,
            vv.label,
            vv.item_category,
            vv.quantity_value,
            vv.quantity_unit,
            vv.sort_order,
            vv.created_at,
            vv.updated_at
          from public.goods_brand_variants vv
          where vv.brand_id = b.id
            and vv.owner_id = uid
            and coalesce(vv.is_deleted, false) = false
        ) v
      ), '[]'::jsonb) as variants
    from public.goods_brands b
    where b.owner_id = uid
      and coalesce(b.is_deleted, false) = false
  ) x;

  return jsonb_build_object('ok', true, 'items', coalesce(items, '[]'::jsonb));
end;
$$;

create or replace function public.app_upsert_goods_brand(
  p_id uuid default null,
  p_name text default '',
  p_item_type text default 'General',
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  nm text := left(trim(coalesce(p_name, '')), 120);
  typ text := left(trim(coalesce(p_item_type, 'General')), 80);
  row public.goods_brands;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if nm = '' then raise exception 'Brand name is required'; end if;
  if typ = '' then typ := 'General'; end if;

  if p_id is null then
    insert into public.goods_brands (owner_id, name, item_type, notes)
    values (uid, nm, typ, nullif(trim(coalesce(p_notes, '')), ''))
    returning * into row;
  else
    update public.goods_brands
    set
      name = nm,
      item_type = typ,
      notes = nullif(trim(coalesce(p_notes, '')), ''),
      updated_at = now()
    where id = p_id and owner_id = uid and coalesce(is_deleted, false) = false
    returning * into row;
    if row.id is null then raise exception 'Brand not found'; end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', row.id,
    'name', row.name,
    'item_type', row.item_type,
    'notes', row.notes
  );
end;
$$;

create or replace function public.app_delete_goods_brand(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_id is null then raise exception 'Brand is required'; end if;

  update public.goods_brand_variants
  set is_deleted = true, updated_at = now()
  where brand_id = p_id and owner_id = uid;

  update public.goods_brands
  set is_deleted = true, updated_at = now()
  where id = p_id and owner_id = uid;

  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;

create or replace function public.app_upsert_goods_brand_variant(
  p_id uuid default null,
  p_brand_id uuid default null,
  p_label text default '',
  p_item_category text default 'count',
  p_quantity_value numeric default 1,
  p_quantity_unit text default 'item',
  p_sort_order int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  label text := left(trim(coalesce(p_label, '')), 120);
  cat text := lower(trim(coalesce(p_item_category, 'count')));
  unit text := lower(trim(coalesce(p_quantity_unit, 'item')));
  qty numeric := coalesce(p_quantity_value, 1);
  row public.goods_brand_variants;
  brand_ok boolean := false;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_brand_id is null then raise exception 'Brand is required'; end if;
  if label = '' then raise exception 'Variant label is required'; end if;
  if qty <= 0 then raise exception 'Variant quantity must be positive'; end if;
  if cat not in ('count', 'weight', 'length', 'volume') then cat := 'count'; end if;

  select exists(
    select 1 from public.goods_brands b
    where b.id = p_brand_id and b.owner_id = uid and coalesce(b.is_deleted, false) = false
  ) into brand_ok;
  if not brand_ok then raise exception 'Brand not found'; end if;

  if p_id is null then
    insert into public.goods_brand_variants (
      brand_id, owner_id, label, item_category, quantity_value, quantity_unit, sort_order
    ) values (
      p_brand_id, uid, label, cat, qty, unit, coalesce(p_sort_order, 0)
    )
    returning * into row;
  else
    update public.goods_brand_variants
    set
      label = label,
      item_category = cat,
      quantity_value = qty,
      quantity_unit = unit,
      sort_order = coalesce(p_sort_order, sort_order),
      updated_at = now()
    where id = p_id and owner_id = uid and brand_id = p_brand_id and coalesce(is_deleted, false) = false
    returning * into row;
    if row.id is null then raise exception 'Variant not found'; end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', row.id,
    'brand_id', row.brand_id,
    'label', row.label,
    'item_category', row.item_category,
    'quantity_value', row.quantity_value,
    'quantity_unit', row.quantity_unit,
    'sort_order', row.sort_order
  );
end;
$$;

create or replace function public.app_delete_goods_brand_variant(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
begin
  if uid is null then raise exception 'Authentication required'; end if;
  update public.goods_brand_variants
  set is_deleted = true, updated_at = now()
  where id = p_id and owner_id = uid;
  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;

-- Fast inventory stock summaries (balances accurate; detail on demand).
create or replace function public.app_list_my_inventory_summaries(
  p_search text default null,
  p_brand text default null,
  p_item_type text default null,
  p_status text default null,
  p_limit int default 500
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  lim int := greatest(1, least(coalesce(p_limit, 500), 2000));
  q text := lower(trim(coalesce(p_search, '')));
  brand_q text := lower(trim(coalesce(p_brand, '')));
  type_q text := lower(trim(coalesce(p_item_type, '')));
  status_q text := lower(trim(coalesce(p_status, '')));
  items jsonb := '[]'::jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.bought_date desc nulls last, x.item_name), '[]'::jsonb)
  into items
  from (
    select
      gi.id,
      gi.group_id::text as group_id,
      gi.item_name,
      gi.currency,
      gi.unit_actual_price,
      gi.bought_qty,
      gi.total_actual_price,
      gi.bought_date,
      gi.item_code,
      gi.notes,
      gi.brand,
      gi.variant_label,
      gi.brand_id,
      gi.variant_id,
      coalesce(nullif(gi.item_category, ''), public.app_note_meta_value(gi.notes, 'UCAT'), 'count') as item_category,
      coalesce(nullif(gi.quantity_unit, ''), public.app_note_meta_value(gi.notes, 'UOM'), 'item') as quantity_unit,
      coalesce(nullif(public.app_note_meta_value(gi.notes, 'ITYPE'), ''), 'General') as item_type,
      coalesce(nullif(public.app_note_meta_value(gi.notes, 'IDESC'), ''), '') as item_description,
      coalesce(nullif(public.app_note_meta_value(gi.notes, 'USP'), '')::numeric, 0) as unit_sold_price,
      coalesce(s.sold_qty, 0)::numeric as sold_qty,
      coalesce(s.sold_total, 0)::numeric as sold_total,
      greatest(gi.bought_qty - coalesce(s.sold_qty, 0), 0)::numeric as remaining_qty,
      case
        when greatest(gi.bought_qty - coalesce(s.sold_qty, 0), 0) <= 0.00000001 then 'Sold'
        when coalesce(s.sold_qty, 0) > 0 then 'Partial'
        else 'In Stock'
      end as stock_status,
      gi.created_at,
      gi.updated_at
    from public.goods_items gi
    left join lateral (
      select
        coalesce(sum(gs.sold_qty), 0) as sold_qty,
        coalesce(sum(gs.total_sold_price), 0) as sold_total
      from public.goods_sales gs
      where gs.owner_id = uid
        and gs.group_id = gi.group_id
        and coalesce(gs.is_deleted, false) = false
    ) s on true
    where gi.owner_id = uid
      and coalesce(gi.is_deleted, false) = false
      and (
        q = ''
        or lower(coalesce(gi.item_name, '')) like '%' || q || '%'
        or lower(coalesce(gi.brand, '')) like '%' || q || '%'
        or lower(coalesce(gi.variant_label, '')) like '%' || q || '%'
        or lower(coalesce(gi.item_code, '')) like '%' || q || '%'
        or lower(coalesce(gi.notes, '')) like '%' || q || '%'
        or lower(coalesce(public.app_note_meta_value(gi.notes, 'ITYPE'), '')) like '%' || q || '%'
      )
      and (brand_q = '' or brand_q = 'all' or lower(coalesce(gi.brand, '')) = brand_q)
      and (type_q = '' or type_q = 'all' or lower(coalesce(public.app_note_meta_value(gi.notes, 'ITYPE'), 'general')) = type_q)
      and (
        status_q = '' or status_q = 'all'
        or (status_q in ('open', 'in stock', 'instock') and greatest(gi.bought_qty - coalesce(s.sold_qty, 0), 0) > 0.00000001)
        or (status_q in ('closed', 'sold') and greatest(gi.bought_qty - coalesce(s.sold_qty, 0), 0) <= 0.00000001)
        or (
          status_q in ('lowstock', 'low stock')
          and greatest(gi.bought_qty - coalesce(s.sold_qty, 0), 0) > 0.00000001
          and gi.bought_qty > 0
          and (greatest(gi.bought_qty - coalesce(s.sold_qty, 0), 0) / gi.bought_qty) <= 0.15
        )
      )
    order by gi.bought_date desc nulls last, gi.item_name
    limit lim
  ) x;

  return jsonb_build_object('ok', true, 'items', coalesce(items, '[]'::jsonb));
end;
$$;

-- One item's sales + events (restocks / settlements) for expand/detail.
create or replace function public.app_list_my_inventory_item_detail(
  p_group_id uuid,
  p_limit int default 2000
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  lim int := greatest(1, least(coalesce(p_limit, 2000), 5000));
  item jsonb := null;
  sales jsonb := '[]'::jsonb;
  events jsonb := '[]'::jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_group_id is null then raise exception 'group_id required'; end if;

  select row_to_json(x)::jsonb
  into item
  from (
    select
      gi.id,
      gi.group_id::text as group_id,
      gi.item_name,
      gi.currency,
      gi.unit_actual_price,
      gi.bought_qty,
      gi.total_actual_price,
      gi.bought_date,
      gi.item_code,
      gi.notes,
      gi.brand,
      gi.variant_label,
      gi.brand_id,
      gi.variant_id,
      coalesce(nullif(gi.item_category, ''), public.app_note_meta_value(gi.notes, 'UCAT'), 'count') as item_category,
      coalesce(nullif(gi.quantity_unit, ''), public.app_note_meta_value(gi.notes, 'UOM'), 'item') as quantity_unit,
      coalesce(nullif(public.app_note_meta_value(gi.notes, 'ITYPE'), ''), 'General') as item_type,
      gi.created_at,
      gi.updated_at
    from public.goods_items gi
    where gi.owner_id = uid
      and gi.group_id = p_group_id
      and coalesce(gi.is_deleted, false) = false
    limit 1
  ) x;

  select coalesce(jsonb_agg(row_to_json(s)::jsonb order by s.sold_date desc, s.created_at desc), '[]'::jsonb)
  into sales
  from (
    select
      gs.id,
      gs.group_id::text as group_id,
      gs.item_name,
      gs.currency,
      gs.unit_sold_price,
      gs.sold_qty,
      gs.total_sold_price,
      gs.sold_date,
      gs.notes,
      gs.created_at,
      gs.updated_at
    from public.goods_sales gs
    where gs.owner_id = uid
      and gs.group_id = p_group_id
      and coalesce(gs.is_deleted, false) = false
    order by gs.sold_date desc, gs.created_at desc
    limit lim
  ) s;

  select coalesce(jsonb_agg(row_to_json(e)::jsonb order by e.event_date desc, e.created_at desc), '[]'::jsonb)
  into events
  from (
    select
      ge.id,
      ge.group_id::text as group_id,
      ge.tx_type,
      ge.item_name,
      ge.currency,
      ge.entry_kind,
      ge.direction,
      ge.amount,
      ge.qty,
      ge.event_date,
      ge.notes,
      ge.created_at,
      ge.updated_at
    from public.goods_events ge
    where ge.owner_id = uid
      and ge.group_id = p_group_id
      and coalesce(ge.is_deleted, false) = false
    order by ge.event_date desc, ge.created_at desc
    limit lim
  ) e;

  return jsonb_build_object(
    'ok', true,
    'item', item,
    'sales', coalesce(sales, '[]'::jsonb),
    'events', coalesce(events, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.app_list_my_goods_brands() to anon, authenticated;
grant execute on function public.app_upsert_goods_brand(uuid, text, text, text) to anon, authenticated;
grant execute on function public.app_delete_goods_brand(uuid) to anon, authenticated;
grant execute on function public.app_upsert_goods_brand_variant(uuid, uuid, text, text, numeric, text, int) to anon, authenticated;
grant execute on function public.app_delete_goods_brand_variant(uuid) to anon, authenticated;
grant execute on function public.app_list_my_inventory_summaries(text, text, text, text, int) to anon, authenticated;
grant execute on function public.app_list_my_inventory_item_detail(uuid, int) to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/049_inventory_brands_variants_lazy.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/050_inventory_sales_customers_list.sql
-- ############################################################################

-- ============================================================================
-- 050_inventory_sales_customers_list.sql
-- List all inventory sales + customer-only events for Customers/Invoices view.
-- Additive only. Safe to re-run.
-- ============================================================================

create or replace function public.app_list_my_inventory_sales(
  p_limit int default 2000
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  lim int := greatest(1, least(coalesce(p_limit, 2000), 5000));
  sales jsonb := '[]'::jsonb;
  events jsonb := '[]'::jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;

  select coalesce(jsonb_agg(row_to_json(s)::jsonb order by s.sold_date desc, s.created_at desc), '[]'::jsonb)
  into sales
  from (
    select
      gs.id,
      gs.group_id::text as group_id,
      gs.item_name,
      gs.currency,
      gs.unit_sold_price,
      gs.sold_qty,
      gs.total_sold_price,
      gs.sold_date,
      gs.notes,
      gs.created_at,
      gs.updated_at,
      'SALE'::text as row_kind
    from public.goods_sales gs
    where gs.owner_id = uid
      and coalesce(gs.is_deleted, false) = false
    order by gs.sold_date desc, gs.created_at desc
    limit lim
  ) s;

  select coalesce(jsonb_agg(row_to_json(e)::jsonb order by e.event_date desc, e.created_at desc), '[]'::jsonb)
  into events
  from (
    select
      ge.id,
      ge.group_id::text as group_id,
      ge.tx_type,
      ge.item_name,
      ge.currency,
      ge.entry_kind,
      ge.direction,
      ge.amount,
      ge.qty,
      ge.event_date,
      ge.notes,
      ge.created_at,
      ge.updated_at,
      'EVENT'::text as row_kind
    from public.goods_events ge
    where ge.owner_id = uid
      and coalesce(ge.is_deleted, false) = false
      and upper(coalesce(ge.tx_type, '')) in ('CUSTOMER', 'SETTLEMENT', 'SALE', 'PURCHASE')
    order by ge.event_date desc, ge.created_at desc
    limit lim
  ) e;

  return jsonb_build_object(
    'ok', true,
    'sales', coalesce(sales, '[]'::jsonb),
    'events', coalesce(events, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.app_list_my_inventory_sales(int) to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/050_inventory_sales_customers_list.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/051_inventory_category_product_lines.sql
-- ############################################################################

-- ============================================================================
-- 051_inventory_category_product_lines.sql
-- Category config + product lines (type under brand) + variant/product_line links.
-- Additive only. Safe to re-run. Does NOT wipe inventory data.
-- ============================================================================

-- Item columns for product line
select public.app_add_column_if_missing('goods_items', 'product_line', 'text');
select public.app_add_column_if_missing('goods_items', 'product_line_id', 'uuid');
select public.app_add_column_if_missing('goods_items', 'category_slug', 'text');

-- Category configuration (per owner)
create table if not exists public.goods_category_config (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.app_users(id) on delete cascade,
  name text not null,
  slug text not null,
  uses_brands boolean not null default true,
  uses_product_lines boolean not null default true,
  uses_variants boolean not null default true,
  qty_pattern text not null default 'count',
  sort_order int not null default 0,
  hint text,
  meta jsonb not null default '{}'::jsonb,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goods_category_config_qty_chk
    check (qty_pattern in ('count', 'weight', 'length', 'volume'))
);

create unique index if not exists goods_category_config_owner_slug_uq
  on public.goods_category_config(owner_id, lower(slug))
  where is_deleted = false;

create index if not exists goods_category_config_owner_idx
  on public.goods_category_config(owner_id)
  where is_deleted = false;

-- Product lines (type) under a brand, e.g. Apple → iPhone
create table if not exists public.goods_product_lines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.app_users(id) on delete cascade,
  brand_id uuid not null references public.goods_brands(id) on delete cascade,
  category_name text not null default 'General',
  name text not null,
  sort_order int not null default 0,
  meta jsonb not null default '{}'::jsonb,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists goods_product_lines_brand_idx
  on public.goods_product_lines(brand_id)
  where is_deleted = false;

create index if not exists goods_product_lines_owner_idx
  on public.goods_product_lines(owner_id)
  where is_deleted = false;

-- Link variants to product lines (nullable for back-compat)
select public.app_add_column_if_missing('goods_brand_variants', 'product_line_id', 'uuid');

alter table public.goods_category_config enable row level security;
alter table public.goods_product_lines enable row level security;

drop policy if exists goods_category_config_owner_all on public.goods_category_config;
create policy goods_category_config_owner_all on public.goods_category_config
  for all using (owner_id = public.current_app_user_id())
  with check (owner_id = public.current_app_user_id());

drop policy if exists goods_product_lines_owner_all on public.goods_product_lines;
create policy goods_product_lines_owner_all on public.goods_product_lines
  for all using (owner_id = public.current_app_user_id())
  with check (owner_id = public.current_app_user_id());

-- Seed default categories for every active app user (idempotent)
insert into public.goods_category_config (
  owner_id, name, slug, uses_brands, uses_product_lines, uses_variants, qty_pattern, sort_order, hint
)
select
  u.id,
  c.name,
  c.slug,
  c.uses_brands,
  c.uses_product_lines,
  c.uses_variants,
  c.qty_pattern,
  c.sort_order,
  c.hint
from public.app_users u
cross join (
  values
    ('Electronics', 'electronics', true, true, true, 'count', 10, 'Brand → Type (iPhone) → Variant (512 GB Black)'),
    ('Perfumes', 'perfumes', true, true, true, 'volume', 20, 'Brand → Fragrance → Size (3 ml)'),
    ('Liquids', 'liquids', true, true, true, 'volume', 30, 'Brand → Product → Volume'),
    ('Food & Grocery', 'food-grocery', true, false, true, 'weight', 40, 'Brand → Pack / weight'),
    ('Clothing', 'clothing', true, true, true, 'count', 50, 'Brand → Style → Size/Color'),
    ('Hardware', 'hardware', true, true, true, 'count', 60, 'Brand → Product → Spec'),
    ('Tools', 'tools', true, true, true, 'count', 70, 'Brand → Tool → Spec'),
    ('Stationery', 'stationery', true, false, true, 'count', 80, 'Brand → Item'),
    ('Furniture', 'furniture', true, true, true, 'count', 90, 'Brand → Piece → Finish'),
    ('Cables & Pipes', 'cables-pipes', true, true, true, 'length', 100, 'Brand → Type → Length'),
    ('General', 'general', false, false, false, 'count', 999, 'Simple item with quantity')
) as c(name, slug, uses_brands, uses_product_lines, uses_variants, qty_pattern, sort_order, hint)
where coalesce(u.is_active, true) = true
  and not exists (
    select 1 from public.goods_category_config g
    where g.owner_id = u.id
      and lower(g.slug) = lower(c.slug)
      and coalesce(g.is_deleted, false) = false
  );

-- Backfill: one default product line per brand from existing variants (name = brand item_type or "Items")
insert into public.goods_product_lines (owner_id, brand_id, category_name, name, sort_order)
select
  b.owner_id,
  b.id,
  coalesce(nullif(trim(b.item_type), ''), 'General'),
  case
    when coalesce(nullif(trim(b.item_type), ''), 'General') in ('General', 'Perfumes', 'Electronics')
      then 'Items'
    else coalesce(nullif(trim(b.item_type), ''), 'Items')
  end,
  0
from public.goods_brands b
where coalesce(b.is_deleted, false) = false
  and not exists (
    select 1 from public.goods_product_lines pl
    where pl.brand_id = b.id
      and coalesce(pl.is_deleted, false) = false
  );

-- Attach orphan variants to the brand's first product line
update public.goods_brand_variants v
set product_line_id = pl.id,
    updated_at = now()
from public.goods_product_lines pl
where v.brand_id = pl.brand_id
  and v.owner_id = pl.owner_id
  and coalesce(v.is_deleted, false) = false
  and coalesce(pl.is_deleted, false) = false
  and v.product_line_id is null
  and pl.id = (
    select p2.id from public.goods_product_lines p2
    where p2.brand_id = v.brand_id
      and coalesce(p2.is_deleted, false) = false
    order by p2.sort_order, p2.created_at
    limit 1
  );

-- List categories
create or replace function public.app_list_my_goods_categories()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  items jsonb := '[]'::jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;

  -- Ensure defaults exist for this user
  insert into public.goods_category_config (
    owner_id, name, slug, uses_brands, uses_product_lines, uses_variants, qty_pattern, sort_order, hint
  )
  select
    uid, c.name, c.slug, c.uses_brands, c.uses_product_lines, c.uses_variants, c.qty_pattern, c.sort_order, c.hint
  from (
    values
      ('Electronics', 'electronics', true, true, true, 'count', 10, 'Brand → Type → Variant'),
      ('Perfumes', 'perfumes', true, true, true, 'volume', 20, 'Brand → Fragrance → Size'),
      ('Liquids', 'liquids', true, true, true, 'volume', 30, 'Brand → Product → Volume'),
      ('Food & Grocery', 'food-grocery', true, false, true, 'weight', 40, 'Brand → Pack / weight'),
      ('Clothing', 'clothing', true, true, true, 'count', 50, 'Brand → Style → Size/Color'),
      ('Hardware', 'hardware', true, true, true, 'count', 60, 'Brand → Product → Spec'),
      ('Tools', 'tools', true, true, true, 'count', 70, 'Brand → Tool → Spec'),
      ('Stationery', 'stationery', true, false, true, 'count', 80, 'Brand → Item'),
      ('Furniture', 'furniture', true, true, true, 'count', 90, 'Brand → Piece → Finish'),
      ('Cables & Pipes', 'cables-pipes', true, true, true, 'length', 100, 'Brand → Type → Length'),
      ('General', 'general', false, false, false, 'count', 999, 'Simple item')
  ) as c(name, slug, uses_brands, uses_product_lines, uses_variants, qty_pattern, sort_order, hint)
  where not exists (
    select 1 from public.goods_category_config g
    where g.owner_id = uid and lower(g.slug) = lower(c.slug) and coalesce(g.is_deleted, false) = false
  );

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.sort_order, lower(x.name)), '[]'::jsonb)
  into items
  from (
    select
      id, name, slug, uses_brands, uses_product_lines, uses_variants,
      qty_pattern, sort_order, hint, created_at, updated_at
    from public.goods_category_config
    where owner_id = uid and coalesce(is_deleted, false) = false
  ) x;

  return jsonb_build_object('ok', true, 'items', coalesce(items, '[]'::jsonb));
end;
$$;

create or replace function public.app_upsert_goods_category(
  p_id uuid default null,
  p_name text default '',
  p_slug text default '',
  p_uses_brands boolean default true,
  p_uses_product_lines boolean default true,
  p_uses_variants boolean default true,
  p_qty_pattern text default 'count',
  p_sort_order int default 0,
  p_hint text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  nm text := left(trim(coalesce(p_name, '')), 80);
  sl text := left(trim(coalesce(nullif(p_slug, ''), lower(regexp_replace(nm, '[^a-zA-Z0-9]+', '-', 'g')))), 80);
  pattern text := lower(trim(coalesce(p_qty_pattern, 'count')));
  row public.goods_category_config;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if nm = '' then raise exception 'Category name is required'; end if;
  if pattern not in ('count', 'weight', 'length', 'volume') then pattern := 'count'; end if;
  if sl = '' then sl := 'general'; end if;

  if p_id is null then
    insert into public.goods_category_config (
      owner_id, name, slug, uses_brands, uses_product_lines, uses_variants, qty_pattern, sort_order, hint
    ) values (
      uid, nm, sl, coalesce(p_uses_brands, true), coalesce(p_uses_product_lines, true),
      coalesce(p_uses_variants, true), pattern, coalesce(p_sort_order, 0), nullif(trim(coalesce(p_hint, '')), '')
    )
    returning * into row;
  else
    update public.goods_category_config
    set
      name = nm,
      slug = sl,
      uses_brands = coalesce(p_uses_brands, uses_brands),
      uses_product_lines = coalesce(p_uses_product_lines, uses_product_lines),
      uses_variants = coalesce(p_uses_variants, uses_variants),
      qty_pattern = pattern,
      sort_order = coalesce(p_sort_order, sort_order),
      hint = nullif(trim(coalesce(p_hint, '')), ''),
      updated_at = now()
    where id = p_id and owner_id = uid and coalesce(is_deleted, false) = false
    returning * into row;
    if row.id is null then raise exception 'Category not found'; end if;
  end if;

  return jsonb_build_object('ok', true, 'item', row_to_json(row)::jsonb);
end;
$$;

create or replace function public.app_list_my_goods_product_lines(p_brand_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  items jsonb := '[]'::jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.sort_order, lower(x.name)), '[]'::jsonb)
  into items
  from (
    select
      pl.id,
      pl.brand_id,
      pl.category_name,
      pl.name,
      pl.sort_order,
      pl.created_at,
      pl.updated_at,
      b.name as brand_name,
      coalesce((
        select jsonb_agg(row_to_json(v)::jsonb order by v.sort_order, lower(v.label))
        from (
          select vv.id, vv.brand_id, vv.product_line_id, vv.label, vv.item_category,
                 vv.quantity_value, vv.quantity_unit, vv.sort_order
          from public.goods_brand_variants vv
          where vv.product_line_id = pl.id
            and vv.owner_id = uid
            and coalesce(vv.is_deleted, false) = false
        ) v
      ), '[]'::jsonb) as variants
    from public.goods_product_lines pl
    join public.goods_brands b on b.id = pl.brand_id
    where pl.owner_id = uid
      and coalesce(pl.is_deleted, false) = false
      and coalesce(b.is_deleted, false) = false
      and (p_brand_id is null or pl.brand_id = p_brand_id)
  ) x;

  return jsonb_build_object('ok', true, 'items', coalesce(items, '[]'::jsonb));
end;
$$;

create or replace function public.app_upsert_goods_product_line(
  p_id uuid default null,
  p_brand_id uuid default null,
  p_name text default '',
  p_category_name text default 'General',
  p_sort_order int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  nm text := left(trim(coalesce(p_name, '')), 120);
  cat text := left(trim(coalesce(p_category_name, 'General')), 80);
  brand public.goods_brands;
  row public.goods_product_lines;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if nm = '' then raise exception 'Product type name is required'; end if;
  if p_brand_id is null then raise exception 'Brand is required'; end if;

  select * into brand
  from public.goods_brands
  where id = p_brand_id and owner_id = uid and coalesce(is_deleted, false) = false;
  if brand.id is null then raise exception 'Brand not found'; end if;

  if p_id is null then
    insert into public.goods_product_lines (owner_id, brand_id, category_name, name, sort_order)
    values (uid, p_brand_id, coalesce(nullif(cat, ''), brand.item_type, 'General'), nm, coalesce(p_sort_order, 0))
    returning * into row;
  else
    update public.goods_product_lines
    set
      name = nm,
      category_name = coalesce(nullif(cat, ''), category_name),
      sort_order = coalesce(p_sort_order, sort_order),
      updated_at = now()
    where id = p_id and owner_id = uid and coalesce(is_deleted, false) = false
    returning * into row;
    if row.id is null then raise exception 'Product type not found'; end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', row.id,
    'brand_id', row.brand_id,
    'name', row.name,
    'category_name', row.category_name
  );
end;
$$;

create or replace function public.app_delete_goods_product_line(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_id is null then raise exception 'Product type is required'; end if;

  update public.goods_brand_variants
  set product_line_id = null, updated_at = now()
  where product_line_id = p_id and owner_id = uid;

  update public.goods_product_lines
  set is_deleted = true, updated_at = now()
  where id = p_id and owner_id = uid;

  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;

-- Extend brand list to include product_lines nesting
create or replace function public.app_list_my_goods_brands()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  items jsonb := '[]'::jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by lower(x.name)), '[]'::jsonb)
  into items
  from (
    select
      b.id,
      b.name,
      b.item_type,
      b.notes,
      b.created_at,
      b.updated_at,
      coalesce((
        select jsonb_agg(row_to_json(pl)::jsonb order by pl.sort_order, lower(pl.name))
        from (
          select
            p.id,
            p.brand_id,
            p.category_name,
            p.name,
            p.sort_order,
            coalesce((
              select jsonb_agg(row_to_json(v)::jsonb order by v.sort_order, lower(v.label))
              from (
                select
                  vv.id, vv.brand_id, vv.product_line_id, vv.label, vv.item_category,
                  vv.quantity_value, vv.quantity_unit, vv.sort_order
                from public.goods_brand_variants vv
                where vv.product_line_id = p.id
                  and vv.owner_id = uid
                  and coalesce(vv.is_deleted, false) = false
              ) v
            ), '[]'::jsonb) as variants
          from public.goods_product_lines p
          where p.brand_id = b.id
            and p.owner_id = uid
            and coalesce(p.is_deleted, false) = false
        ) pl
      ), '[]'::jsonb) as product_lines,
      coalesce((
        select jsonb_agg(row_to_json(v)::jsonb order by v.sort_order, lower(v.label))
        from (
          select
            vv.id, vv.brand_id, vv.product_line_id, vv.label, vv.item_category,
            vv.quantity_value, vv.quantity_unit, vv.sort_order
          from public.goods_brand_variants vv
          where vv.brand_id = b.id
            and vv.owner_id = uid
            and coalesce(vv.is_deleted, false) = false
        ) v
      ), '[]'::jsonb) as variants
    from public.goods_brands b
    where b.owner_id = uid
      and coalesce(b.is_deleted, false) = false
  ) x;

  return jsonb_build_object('ok', true, 'items', coalesce(items, '[]'::jsonb));
end;
$$;

-- Extend variant upsert with product_line_id
create or replace function public.app_upsert_goods_brand_variant(
  p_id uuid default null,
  p_brand_id uuid default null,
  p_label text default '',
  p_item_category text default 'count',
  p_quantity_value numeric default 1,
  p_quantity_unit text default 'item',
  p_sort_order int default 0,
  p_product_line_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  nm text := left(trim(coalesce(p_label, '')), 120);
  cat text := lower(trim(coalesce(p_item_category, 'count')));
  unit text := lower(trim(coalesce(p_quantity_unit, 'item')));
  qty numeric := coalesce(p_quantity_value, 1);
  line_id uuid := p_product_line_id;
  brand public.goods_brands;
  row public.goods_brand_variants;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if nm = '' then raise exception 'Variant label is required'; end if;
  if cat not in ('count', 'weight', 'length', 'volume') then cat := 'count'; end if;
  if qty <= 0 then qty := 1; end if;

  if p_brand_id is null and line_id is not null then
    select brand_id into p_brand_id from public.goods_product_lines
    where id = line_id and owner_id = uid and coalesce(is_deleted, false) = false;
  end if;
  if p_brand_id is null then raise exception 'Brand is required'; end if;

  select * into brand from public.goods_brands
  where id = p_brand_id and owner_id = uid and coalesce(is_deleted, false) = false;
  if brand.id is null then raise exception 'Brand not found'; end if;

  if line_id is null then
    select id into line_id from public.goods_product_lines
    where brand_id = p_brand_id and owner_id = uid and coalesce(is_deleted, false) = false
    order by sort_order, created_at limit 1;
  end if;

  if p_id is null then
    insert into public.goods_brand_variants (
      brand_id, owner_id, label, item_category, quantity_value, quantity_unit, sort_order, product_line_id
    ) values (
      p_brand_id, uid, nm, cat, qty, unit, coalesce(p_sort_order, 0), line_id
    )
    returning * into row;
  else
    update public.goods_brand_variants
    set
      label = nm,
      item_category = cat,
      quantity_value = qty,
      quantity_unit = unit,
      sort_order = coalesce(p_sort_order, sort_order),
      product_line_id = coalesce(line_id, product_line_id),
      updated_at = now()
    where id = p_id and owner_id = uid and coalesce(is_deleted, false) = false
    returning * into row;
    if row.id is null then raise exception 'Variant not found'; end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', row.id,
    'brand_id', row.brand_id,
    'product_line_id', row.product_line_id,
    'label', row.label,
    'item_category', row.item_category,
    'quantity_value', row.quantity_value,
    'quantity_unit', row.quantity_unit
  );
end;
$$;

grant execute on function public.app_list_my_goods_categories() to authenticated, anon;
grant execute on function public.app_upsert_goods_category(uuid, text, text, boolean, boolean, boolean, text, int, text) to authenticated, anon;
grant execute on function public.app_list_my_goods_product_lines(uuid) to authenticated, anon;
grant execute on function public.app_upsert_goods_product_line(uuid, uuid, text, text, int) to authenticated, anon;
grant execute on function public.app_delete_goods_product_line(uuid) to authenticated, anon;

-- ############################################################################
-- END migrations/051_inventory_category_product_lines.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/052_inventory_product_line_summary_fix.sql
-- ############################################################################

-- ============================================================================
-- 052_inventory_product_line_summary_fix.sql
-- Expose product_line on inventory summaries; keep catalog types stable.
-- Additive only. Safe to re-run. Does NOT wipe data.
-- ============================================================================

select public.app_add_column_if_missing('goods_items', 'product_line', 'text');
select public.app_add_column_if_missing('goods_items', 'product_line_id', 'uuid');
select public.app_add_column_if_missing('goods_items', 'category_slug', 'text');
select public.app_add_column_if_missing('goods_brand_variants', 'product_line_id', 'uuid');

-- Faster lookup by product line
create index if not exists goods_items_owner_product_line_idx
  on public.goods_items(owner_id, product_line)
  where coalesce(is_deleted, false) = false;

create index if not exists goods_brand_variants_product_line_idx
  on public.goods_brand_variants(product_line_id)
  where coalesce(is_deleted, false) = false;

-- Summaries include product_line so UI types (9PM, 9PM Rebel, …) never collapse after refresh
create or replace function public.app_list_my_inventory_summaries(
  p_search text default null,
  p_brand text default null,
  p_item_type text default null,
  p_status text default null,
  p_limit int default 500
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  lim int := greatest(1, least(coalesce(p_limit, 500), 2000));
  q text := lower(trim(coalesce(p_search, '')));
  brand_q text := lower(trim(coalesce(p_brand, '')));
  type_q text := lower(trim(coalesce(p_item_type, '')));
  status_q text := lower(trim(coalesce(p_status, '')));
  items jsonb := '[]'::jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.bought_date desc nulls last, x.item_name), '[]'::jsonb)
  into items
  from (
    select
      gi.id,
      gi.group_id::text as group_id,
      gi.item_name,
      gi.currency,
      gi.unit_actual_price,
      gi.bought_qty,
      gi.total_actual_price,
      gi.bought_date,
      gi.item_code,
      gi.notes,
      gi.brand,
      gi.variant_label,
      gi.brand_id,
      gi.variant_id,
      coalesce(nullif(gi.product_line, ''), public.app_note_meta_value(gi.notes, 'PLINE'), '') as product_line,
      gi.product_line_id,
      coalesce(nullif(gi.category_slug, ''), public.app_note_meta_value(gi.notes, 'CSLUG'), '') as category_slug,
      coalesce(nullif(gi.item_category, ''), public.app_note_meta_value(gi.notes, 'UCAT'), 'count') as item_category,
      coalesce(nullif(gi.quantity_unit, ''), public.app_note_meta_value(gi.notes, 'UOM'), 'item') as quantity_unit,
      coalesce(nullif(public.app_note_meta_value(gi.notes, 'ITYPE'), ''), 'General') as item_type,
      coalesce(nullif(public.app_note_meta_value(gi.notes, 'IDESC'), ''), '') as item_description,
      coalesce(nullif(public.app_note_meta_value(gi.notes, 'USP'), '')::numeric, 0) as unit_sold_price,
      coalesce(s.sold_qty, 0)::numeric as sold_qty,
      coalesce(s.sold_total, 0)::numeric as sold_total,
      greatest(gi.bought_qty - coalesce(s.sold_qty, 0), 0)::numeric as remaining_qty,
      case
        when greatest(gi.bought_qty - coalesce(s.sold_qty, 0), 0) <= 0.00000001 then 'Sold'
        when coalesce(s.sold_qty, 0) > 0 then 'Partial'
        else 'In Stock'
      end as stock_status,
      gi.created_at,
      gi.updated_at
    from public.goods_items gi
    left join lateral (
      select
        coalesce(sum(gs.sold_qty), 0) as sold_qty,
        coalesce(sum(gs.total_sold_price), 0) as sold_total
      from public.goods_sales gs
      where gs.owner_id = uid
        and gs.group_id = gi.group_id
        and coalesce(gs.is_deleted, false) = false
    ) s on true
    where gi.owner_id = uid
      and coalesce(gi.is_deleted, false) = false
      and (
        q = ''
        or lower(coalesce(gi.item_name, '')) like '%' || q || '%'
        or lower(coalesce(gi.brand, '')) like '%' || q || '%'
        or lower(coalesce(gi.variant_label, '')) like '%' || q || '%'
        or lower(coalesce(gi.product_line, '')) like '%' || q || '%'
        or lower(coalesce(gi.item_code, '')) like '%' || q || '%'
        or lower(coalesce(gi.notes, '')) like '%' || q || '%'
        or lower(coalesce(public.app_note_meta_value(gi.notes, 'ITYPE'), '')) like '%' || q || '%'
        or lower(coalesce(public.app_note_meta_value(gi.notes, 'PLINE'), '')) like '%' || q || '%'
      )
      and (brand_q = '' or brand_q = 'all' or lower(coalesce(gi.brand, '')) = brand_q)
      and (type_q = '' or type_q = 'all' or lower(coalesce(public.app_note_meta_value(gi.notes, 'ITYPE'), 'general')) = type_q)
      and (
        status_q = '' or status_q = 'all'
        or (status_q in ('open', 'in stock', 'instock') and greatest(gi.bought_qty - coalesce(s.sold_qty, 0), 0) > 0.00000001)
        or (status_q in ('closed', 'sold') and greatest(gi.bought_qty - coalesce(s.sold_qty, 0), 0) <= 0.00000001)
        or (
          status_q in ('lowstock', 'low stock')
          and greatest(gi.bought_qty - coalesce(s.sold_qty, 0), 0) > 0.00000001
          and gi.bought_qty > 0
          and (greatest(gi.bought_qty - coalesce(s.sold_qty, 0), 0) / gi.bought_qty) <= 0.15
        )
      )
    order by gi.bought_date desc nulls last, gi.item_name
    limit lim
  ) x;

  return jsonb_build_object('ok', true, 'items', coalesce(items, '[]'::jsonb));
end;
$$;

grant execute on function public.app_list_my_inventory_summaries(text, text, text, text, int) to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/052_inventory_product_line_summary_fix.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/053_inventory_product_line_variant_safe_upsert.sql
-- ############################################################################

-- ============================================================================
-- 053_inventory_product_line_variant_safe_upsert.sql
-- Keep product types distinct (9PM vs 9PM Rebel); stop variants stealing the first type;
-- backfill product_line from notes; faster find-or-create upserts.
-- Additive only. Safe to re-run. Does NOT wipe data.
-- ============================================================================

select public.app_add_column_if_missing('goods_items', 'product_line', 'text');
select public.app_add_column_if_missing('goods_items', 'product_line_id', 'uuid');
select public.app_add_column_if_missing('goods_brand_variants', 'product_line_id', 'uuid');

-- Soft-delete duplicate product types (keep oldest per brand + lower(name))
with ranked as (
  select
    id,
    brand_id,
    lower(name) as name_key,
    row_number() over (
      partition by brand_id, lower(name)
      order by created_at asc nulls last, id asc
    ) as rn,
    first_value(id) over (
      partition by brand_id, lower(name)
      order by created_at asc nulls last, id asc
    ) as keep_id
  from public.goods_product_lines
  where coalesce(is_deleted, false) = false
),
dups as (
  select id, keep_id from ranked where rn > 1
)
update public.goods_brand_variants v
set product_line_id = d.keep_id, updated_at = now()
from dups d
where v.product_line_id = d.id
  and coalesce(v.is_deleted, false) = false;

with ranked as (
  select
    id,
    row_number() over (
      partition by brand_id, lower(name)
      order by created_at asc nulls last, id asc
    ) as rn
  from public.goods_product_lines
  where coalesce(is_deleted, false) = false
)
update public.goods_product_lines pl
set is_deleted = true, updated_at = now()
from ranked r
where pl.id = r.id
  and r.rn > 1
  and coalesce(pl.is_deleted, false) = false;

-- Soft-delete duplicate variants (keep oldest per brand + line + lower(label))
with ranked as (
  select
    id,
    row_number() over (
      partition by brand_id, coalesce(product_line_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(label)
      order by created_at asc nulls last, id asc
    ) as rn,
    first_value(id) over (
      partition by brand_id, coalesce(product_line_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(label)
      order by created_at asc nulls last, id asc
    ) as keep_id
  from public.goods_brand_variants
  where coalesce(is_deleted, false) = false
),
dups as (
  select id, keep_id from ranked where rn > 1
)
update public.goods_items gi
set variant_id = d.keep_id, updated_at = now()
from dups d
where gi.variant_id = d.id
  and coalesce(gi.is_deleted, false) = false;

with ranked as (
  select
    id,
    row_number() over (
      partition by brand_id, coalesce(product_line_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(label)
      order by created_at asc nulls last, id asc
    ) as rn
  from public.goods_brand_variants
  where coalesce(is_deleted, false) = false
)
update public.goods_brand_variants v
set is_deleted = true, updated_at = now()
from ranked r
where v.id = r.id
  and r.rn > 1
  and coalesce(v.is_deleted, false) = false;

-- Unique active product type name per brand (case-insensitive)
create unique index if not exists goods_product_lines_brand_name_uidx
  on public.goods_product_lines (brand_id, lower(name))
  where coalesce(is_deleted, false) = false;

-- Unique active variant label per brand + product line
create unique index if not exists goods_brand_variants_line_label_uidx
  on public.goods_brand_variants (brand_id, coalesce(product_line_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(label))
  where coalesce(is_deleted, false) = false;

-- Backfill product_line text/id on stock items from notes / linked variants
update public.goods_items gi
set
  product_line = coalesce(
    nullif(trim(gi.product_line), ''),
    nullif(public.app_note_meta_value(gi.notes, 'PLINE'), ''),
    nullif(trim(pl.name), '')
  ),
  product_line_id = coalesce(
    gi.product_line_id,
    case
      when public.app_note_meta_value(gi.notes, 'PLINEID') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.app_note_meta_value(gi.notes, 'PLINEID')::uuid
      else null
    end,
    pl.id
  ),
  updated_at = now()
from public.goods_brand_variants v
left join public.goods_product_lines pl
  on pl.id = v.product_line_id
 and coalesce(pl.is_deleted, false) = false
where v.id = gi.variant_id
  and gi.owner_id = v.owner_id
  and coalesce(gi.is_deleted, false) = false
  and (
    coalesce(nullif(trim(gi.product_line), ''), '') = ''
    or gi.product_line_id is null
  );

update public.goods_items gi
set
  product_line = nullif(public.app_note_meta_value(gi.notes, 'PLINE'), ''),
  product_line_id = case
    when public.app_note_meta_value(gi.notes, 'PLINEID') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.app_note_meta_value(gi.notes, 'PLINEID')::uuid
    else gi.product_line_id
  end,
  updated_at = now()
where coalesce(gi.is_deleted, false) = false
  and coalesce(nullif(trim(gi.product_line), ''), '') = ''
  and coalesce(nullif(public.app_note_meta_value(gi.notes, 'PLINE'), ''), '') <> '';

-- Find-or-create product type (never rename a different type when p_id is null)
create or replace function public.app_upsert_goods_product_line(
  p_id uuid default null,
  p_brand_id uuid default null,
  p_name text default '',
  p_category_name text default 'General',
  p_sort_order int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  nm text := left(trim(coalesce(p_name, '')), 120);
  cat text := left(trim(coalesce(p_category_name, 'General')), 80);
  brand public.goods_brands;
  row public.goods_product_lines;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if nm = '' then raise exception 'Product type name is required'; end if;
  if p_brand_id is null then raise exception 'Brand is required'; end if;

  select * into brand
  from public.goods_brands
  where id = p_brand_id and owner_id = uid and coalesce(is_deleted, false) = false;
  if brand.id is null then raise exception 'Brand not found'; end if;

  if p_id is null then
    select * into row
    from public.goods_product_lines
    where brand_id = p_brand_id
      and owner_id = uid
      and coalesce(is_deleted, false) = false
      and lower(name) = lower(nm)
    limit 1;

    if row.id is null then
      begin
        insert into public.goods_product_lines (owner_id, brand_id, category_name, name, sort_order)
        values (uid, p_brand_id, coalesce(nullif(cat, ''), brand.item_type, 'General'), nm, coalesce(p_sort_order, 0))
        returning * into row;
      exception when unique_violation then
        select * into row
        from public.goods_product_lines
        where brand_id = p_brand_id
          and owner_id = uid
          and coalesce(is_deleted, false) = false
          and lower(name) = lower(nm)
        limit 1;
      end;
    end if;
  else
    update public.goods_product_lines
    set
      name = nm,
      category_name = coalesce(nullif(cat, ''), category_name),
      sort_order = coalesce(p_sort_order, sort_order),
      updated_at = now()
    where id = p_id and owner_id = uid and coalesce(is_deleted, false) = false
    returning * into row;
    if row.id is null then raise exception 'Product type not found'; end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', row.id,
    'brand_id', row.brand_id,
    'name', row.name,
    'category_name', row.category_name
  );
end;
$$;

-- Variant upsert: never auto-attach to the first product type; find-or-create by label+line
create or replace function public.app_upsert_goods_brand_variant(
  p_id uuid default null,
  p_brand_id uuid default null,
  p_label text default '',
  p_item_category text default 'count',
  p_quantity_value numeric default 1,
  p_quantity_unit text default 'item',
  p_sort_order int default 0,
  p_product_line_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  nm text := left(trim(coalesce(p_label, '')), 120);
  cat text := lower(trim(coalesce(p_item_category, 'count')));
  unit text := lower(trim(coalesce(p_quantity_unit, 'item')));
  qty numeric := coalesce(p_quantity_value, 1);
  line_id uuid := p_product_line_id;
  brand public.goods_brands;
  row public.goods_brand_variants;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if nm = '' then raise exception 'Variant label is required'; end if;
  if cat not in ('count', 'weight', 'length', 'volume') then cat := 'count'; end if;
  if qty <= 0 then qty := 1; end if;

  if p_brand_id is null and line_id is not null then
    select brand_id into p_brand_id from public.goods_product_lines
    where id = line_id and owner_id = uid and coalesce(is_deleted, false) = false;
  end if;
  if p_brand_id is null then raise exception 'Brand is required'; end if;

  select * into brand from public.goods_brands
  where id = p_brand_id and owner_id = uid and coalesce(is_deleted, false) = false;
  if brand.id is null then raise exception 'Brand not found'; end if;

  if line_id is not null then
    if not exists (
      select 1 from public.goods_product_lines
      where id = line_id and brand_id = p_brand_id and owner_id = uid
        and coalesce(is_deleted, false) = false
    ) then
      raise exception 'Product type not found for this brand';
    end if;
  end if;

  if p_id is null then
    select * into row
    from public.goods_brand_variants
    where brand_id = p_brand_id
      and owner_id = uid
      and coalesce(is_deleted, false) = false
      and lower(label) = lower(nm)
      and (
        (line_id is null and product_line_id is null)
        or product_line_id is not distinct from line_id
      )
    limit 1;

    if row.id is null then
      insert into public.goods_brand_variants (
        brand_id, owner_id, label, item_category, quantity_value, quantity_unit, sort_order, product_line_id
      ) values (
        p_brand_id, uid, nm, cat, qty, unit, coalesce(p_sort_order, 0), line_id
      )
      returning * into row;
    else
      update public.goods_brand_variants
      set
        item_category = cat,
        quantity_value = qty,
        quantity_unit = unit,
        sort_order = coalesce(p_sort_order, sort_order),
        product_line_id = coalesce(line_id, product_line_id),
        updated_at = now()
      where id = row.id
      returning * into row;
    end if;
  else
    update public.goods_brand_variants
    set
      label = nm,
      item_category = cat,
      quantity_value = qty,
      quantity_unit = unit,
      sort_order = coalesce(p_sort_order, sort_order),
      product_line_id = coalesce(line_id, product_line_id),
      updated_at = now()
    where id = p_id and owner_id = uid and coalesce(is_deleted, false) = false
    returning * into row;
    if row.id is null then raise exception 'Variant not found'; end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', row.id,
    'brand_id', row.brand_id,
    'product_line_id', row.product_line_id,
    'label', row.label,
    'item_category', row.item_category,
    'quantity_value', row.quantity_value,
    'quantity_unit', row.quantity_unit
  );
end;
$$;

grant execute on function public.app_upsert_goods_product_line(uuid, uuid, text, text, int) to authenticated, anon;
grant execute on function public.app_upsert_goods_brand_variant(uuid, uuid, text, text, numeric, text, int, uuid) to authenticated, anon;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/053_inventory_product_line_variant_safe_upsert.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/054_inventory_upsert_goods_item_rpc.sql
-- ############################################################################

-- ============================================================================
-- 054_inventory_upsert_goods_item_rpc.sql
-- Reliable SECURITY DEFINER upsert for inventory stock items (bypasses REST
-- representation / RLS edge-cases that break direct goods_items inserts).
-- Additive only. Safe to re-run. Does NOT wipe data.
-- ============================================================================

select public.app_add_column_if_missing('goods_items', 'brand', 'text');
select public.app_add_column_if_missing('goods_items', 'variant_label', 'text');
select public.app_add_column_if_missing('goods_items', 'brand_id', 'uuid');
select public.app_add_column_if_missing('goods_items', 'variant_id', 'uuid');
select public.app_add_column_if_missing('goods_items', 'item_category', 'text');
select public.app_add_column_if_missing('goods_items', 'quantity_unit', 'text');
select public.app_add_column_if_missing('goods_items', 'product_line', 'text');
select public.app_add_column_if_missing('goods_items', 'product_line_id', 'uuid');
select public.app_add_column_if_missing('goods_items', 'category_slug', 'text');
select public.app_add_column_if_missing('goods_items', 'item_code', 'text');
select public.app_add_column_if_missing('goods_items', 'tx_type', 'text default ''ITEM''');

create or replace function public.app_upsert_goods_item(
  p_id uuid default null,
  p_group_id uuid default null,
  p_item_name text default '',
  p_currency text default 'AED',
  p_unit_actual_price numeric default 0,
  p_bought_qty numeric default 1,
  p_total_actual_price numeric default 0,
  p_bought_date date default null,
  p_notes text default null,
  p_item_code text default null,
  p_brand text default null,
  p_variant_label text default null,
  p_brand_id uuid default null,
  p_variant_id uuid default null,
  p_product_line text default null,
  p_product_line_id uuid default null,
  p_category_slug text default null,
  p_item_category text default 'count',
  p_quantity_unit text default 'item'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  data_owner uuid;
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_group_id uuid := coalesce(p_group_id, gen_random_uuid());
  nm text := left(trim(coalesce(p_item_name, '')), 200);
  cur text := upper(trim(coalesce(p_currency, 'AED')));
  qty numeric := coalesce(p_bought_qty, 1);
  unit_cost numeric := coalesce(p_unit_actual_price, 0);
  total_cost numeric := coalesce(p_total_actual_price, 0);
  bought date := coalesce(p_bought_date, current_date);
  cat text := lower(trim(coalesce(p_item_category, 'count')));
  unit text := lower(trim(coalesce(p_quantity_unit, 'item')));
  v_brand_id uuid := p_brand_id;
  v_variant_id uuid := p_variant_id;
  v_product_line_id uuid := p_product_line_id;
  row public.goods_items;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  data_owner := coalesce(public.app_data_owner_id(), uid);
  if nm = '' then raise exception 'Item name is required'; end if;
  if cur = '' then cur := 'AED'; end if;
  -- Keep currency compatible with common goods_items checks.
  if cur not in ('AED', 'SAR', 'PKR', 'USD', 'BTC') then
    cur := 'AED';
  end if;
  if qty <= 0 then raise exception 'Quantity must be greater than zero'; end if;
  if unit_cost < 0 then unit_cost := 0; end if;
  if total_cost <= 0 then total_cost := unit_cost * qty; end if;
  if cat not in ('count', 'weight', 'length', 'volume') then cat := 'count'; end if;
  if unit = '' then unit := 'item'; end if;

  -- Keep brand/variant/product-line ids only when they belong to this owner.
  if v_brand_id is not null and not exists (
    select 1 from public.goods_brands b
    where b.id = v_brand_id and b.owner_id = data_owner and coalesce(b.is_deleted, false) = false
  ) then
    v_brand_id := null;
  end if;
  if v_variant_id is not null and not exists (
    select 1 from public.goods_brand_variants v
    where v.id = v_variant_id and v.owner_id = data_owner and coalesce(v.is_deleted, false) = false
  ) then
    v_variant_id := null;
  end if;
  if v_product_line_id is not null and not exists (
    select 1 from public.goods_product_lines pl
    where pl.id = v_product_line_id and pl.owner_id = data_owner and coalesce(pl.is_deleted, false) = false
  ) then
    v_product_line_id := null;
  end if;

  select gi.* into row
  from public.goods_items gi
  where gi.id = v_id
     or (gi.group_id = v_group_id and gi.owner_id = data_owner)
  order by case when gi.id = v_id then 0 else 1 end
  limit 1;

  if row.id is null then
    insert into public.goods_items (
      id, group_id, owner_id, item_name, currency,
      unit_actual_price, bought_qty, total_actual_price, bought_date, notes,
      tx_type, item_code, brand, variant_label, brand_id, variant_id,
      product_line, product_line_id, category_slug, item_category, quantity_unit,
      meta, is_deleted
    ) values (
      v_id, v_group_id, data_owner, nm, cur,
      unit_cost, qty, total_cost, bought, p_notes,
      'ITEM', nullif(trim(coalesce(p_item_code, '')), ''),
      nullif(trim(coalesce(p_brand, '')), ''),
      nullif(trim(coalesce(p_variant_label, '')), ''),
      v_brand_id, v_variant_id,
      nullif(trim(coalesce(p_product_line, '')), ''),
      v_product_line_id,
      nullif(trim(coalesce(p_category_slug, '')), ''),
      cat, unit,
      jsonb_build_object('source', 'app_upsert_goods_item'),
      false
    )
    returning * into row;
  else
    update public.goods_items gi
    set
      item_name = nm,
      currency = cur,
      unit_actual_price = unit_cost,
      bought_qty = qty,
      total_actual_price = total_cost,
      bought_date = bought,
      notes = coalesce(p_notes, gi.notes),
      item_code = coalesce(nullif(trim(coalesce(p_item_code, '')), ''), gi.item_code),
      brand = coalesce(nullif(trim(coalesce(p_brand, '')), ''), gi.brand),
      variant_label = coalesce(nullif(trim(coalesce(p_variant_label, '')), ''), gi.variant_label),
      brand_id = coalesce(v_brand_id, gi.brand_id),
      variant_id = coalesce(v_variant_id, gi.variant_id),
      product_line = coalesce(nullif(trim(coalesce(p_product_line, '')), ''), gi.product_line),
      product_line_id = coalesce(v_product_line_id, gi.product_line_id),
      category_slug = coalesce(nullif(trim(coalesce(p_category_slug, '')), ''), gi.category_slug),
      item_category = cat,
      quantity_unit = unit,
      is_deleted = false,
      updated_at = now()
    where gi.id = row.id
    returning * into row;
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', row.id,
    'group_id', row.group_id,
    'item_name', row.item_name,
    'currency', row.currency,
    'bought_qty', row.bought_qty,
    'product_line', row.product_line,
    'variant_label', row.variant_label
  );
end;
$$;

grant execute on function public.app_upsert_goods_item(
  uuid, uuid, text, text, numeric, numeric, numeric, date, text,
  text, text, text, uuid, uuid, text, uuid, text, text, text
) to authenticated, anon;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/054_inventory_upsert_goods_item_rpc.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/055_inventory_catalog_edit_delete.sql
-- ############################################################################

-- Additive: category soft-delete RPC + brand delete also soft-deletes product lines.
-- Safe on live DB (no DROP TABLE / TRUNCATE).

create or replace function public.app_delete_goods_category(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_id is null then raise exception 'Category is required'; end if;

  update public.goods_category_config
  set is_deleted = true, updated_at = now()
  where id = p_id and owner_id = uid and coalesce(is_deleted, false) = false;

  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;

revoke all on function public.app_delete_goods_category(uuid) from public;
grant execute on function public.app_delete_goods_category(uuid) to authenticated, service_role;

-- Keep brand delete cascading to product lines (variants already soft-deleted in 049).
create or replace function public.app_delete_goods_brand(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_id is null then raise exception 'Brand is required'; end if;

  update public.goods_brand_variants
  set is_deleted = true, updated_at = now()
  where brand_id = p_id and owner_id = uid;

  update public.goods_product_lines
  set is_deleted = true, updated_at = now()
  where brand_id = p_id and owner_id = uid;

  update public.goods_brands
  set is_deleted = true, updated_at = now()
  where id = p_id and owner_id = uid;

  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;

-- ############################################################################
-- END migrations/055_inventory_catalog_edit_delete.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/056_inventory_item_detail_rpc_restore.sql
-- ############################################################################

-- Additive: restore / ensure inventory item detail RPC used by Invoices expand.
-- Safe on live DB (CREATE OR REPLACE only; no DROP TABLE / TRUNCATE).

create or replace function public.app_list_my_inventory_item_detail(
  p_group_id uuid,
  p_limit int default 2000
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  lim int := greatest(1, least(coalesce(p_limit, 2000), 5000));
  item jsonb := null;
  sales jsonb := '[]'::jsonb;
  events jsonb := '[]'::jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_group_id is null then raise exception 'group_id required'; end if;

  select row_to_json(x)::jsonb
  into item
  from (
    select
      gi.id,
      gi.group_id::text as group_id,
      gi.item_name,
      gi.currency,
      gi.unit_actual_price,
      gi.bought_qty,
      gi.total_actual_price,
      gi.bought_date,
      gi.item_code,
      gi.notes,
      gi.brand,
      gi.variant_label,
      gi.brand_id,
      gi.variant_id,
      coalesce(nullif(gi.item_category, ''), public.app_note_meta_value(gi.notes, 'UCAT'), 'count') as item_category,
      coalesce(nullif(gi.quantity_unit, ''), public.app_note_meta_value(gi.notes, 'UOM'), 'item') as quantity_unit,
      coalesce(nullif(public.app_note_meta_value(gi.notes, 'ITYPE'), ''), 'General') as item_type,
      gi.created_at,
      gi.updated_at
    from public.goods_items gi
    where gi.owner_id = uid
      and gi.group_id = p_group_id
      and coalesce(gi.is_deleted, false) = false
    limit 1
  ) x;

  select coalesce(jsonb_agg(row_to_json(s)::jsonb order by s.sold_date desc, s.created_at desc), '[]'::jsonb)
  into sales
  from (
    select
      gs.id,
      gs.group_id::text as group_id,
      gs.item_name,
      gs.currency,
      gs.unit_sold_price,
      gs.sold_qty,
      gs.total_sold_price,
      gs.sold_date,
      gs.notes,
      gs.created_at,
      gs.updated_at
    from public.goods_sales gs
    where gs.owner_id = uid
      and gs.group_id = p_group_id
      and coalesce(gs.is_deleted, false) = false
    order by gs.sold_date desc, gs.created_at desc
    limit lim
  ) s;

  select coalesce(jsonb_agg(row_to_json(e)::jsonb order by e.event_date desc, e.created_at desc), '[]'::jsonb)
  into events
  from (
    select
      ge.id,
      ge.group_id::text as group_id,
      ge.tx_type,
      ge.item_name,
      ge.currency,
      ge.entry_kind,
      ge.direction,
      ge.amount,
      ge.qty,
      ge.event_date,
      ge.notes,
      ge.created_at,
      ge.updated_at
    from public.goods_events ge
    where ge.owner_id = uid
      and ge.group_id = p_group_id
      and coalesce(ge.is_deleted, false) = false
    order by ge.event_date desc, ge.created_at desc
    limit lim
  ) e;

  return jsonb_build_object(
    'ok', true,
    'item', item,
    'sales', coalesce(sales, '[]'::jsonb),
    'events', coalesce(events, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.app_list_my_inventory_item_detail(uuid, int) from public;
grant execute on function public.app_list_my_inventory_item_detail(uuid, int) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/056_inventory_item_detail_rpc_restore.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/057_inventory_cascade_delete_catalog.sql
-- ############################################################################

-- Additive: cascade soft-delete stock + sales/events when deleting brand / category / product line.
-- Safe on live DB (CREATE OR REPLACE only; no DROP TABLE / TRUNCATE).

create or replace function public.app_soft_delete_goods_groups(
  p_group_ids uuid[]
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  n int := 0;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_group_ids is null or cardinality(p_group_ids) = 0 then
    return 0;
  end if;

  update public.goods_sales
  set is_deleted = true, updated_at = now()
  where owner_id = uid
    and coalesce(is_deleted, false) = false
    and group_id = any(p_group_ids);

  update public.goods_events
  set is_deleted = true, updated_at = now()
  where owner_id = uid
    and coalesce(is_deleted, false) = false
    and group_id = any(p_group_ids);

  update public.goods_items
  set is_deleted = true, updated_at = now()
  where owner_id = uid
    and coalesce(is_deleted, false) = false
    and group_id = any(p_group_ids);

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.app_soft_delete_goods_groups(uuid[]) from public;
grant execute on function public.app_soft_delete_goods_groups(uuid[]) to authenticated, service_role;

create or replace function public.app_delete_goods_brand(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  brand_name text := '';
  item_type text := '';
  gids uuid[] := '{}';
  deleted_items int := 0;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_id is null then raise exception 'Brand is required'; end if;

  select b.name, b.item_type
  into brand_name, item_type
  from public.goods_brands b
  where b.id = p_id and b.owner_id = uid and coalesce(b.is_deleted, false) = false;

  if brand_name is null then
    return jsonb_build_object('ok', true, 'id', p_id, 'deleted_items', 0);
  end if;

  select coalesce(array_agg(distinct gi.group_id), '{}')
  into gids
  from public.goods_items gi
  where gi.owner_id = uid
    and coalesce(gi.is_deleted, false) = false
    and (
      gi.brand_id = p_id
      or lower(trim(coalesce(gi.brand, ''))) = lower(trim(brand_name))
      or lower(trim(coalesce(public.app_note_meta_value(gi.notes, 'BRAND'), ''))) = lower(trim(brand_name))
    );

  deleted_items := public.app_soft_delete_goods_groups(gids);

  update public.goods_brand_variants
  set is_deleted = true, updated_at = now()
  where brand_id = p_id and owner_id = uid and coalesce(is_deleted, false) = false;

  update public.goods_product_lines
  set is_deleted = true, updated_at = now()
  where brand_id = p_id and owner_id = uid and coalesce(is_deleted, false) = false;

  update public.goods_brands
  set is_deleted = true, updated_at = now()
  where id = p_id and owner_id = uid and coalesce(is_deleted, false) = false;

  return jsonb_build_object(
    'ok', true,
    'id', p_id,
    'name', brand_name,
    'item_type', item_type,
    'deleted_items', deleted_items
  );
end;
$$;

revoke all on function public.app_delete_goods_brand(uuid) from public;
grant execute on function public.app_delete_goods_brand(uuid) to authenticated, service_role;

create or replace function public.app_delete_goods_category(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  cat_name text := '';
  cat_slug text := '';
  gids uuid[] := '{}';
  brand_ids uuid[] := '{}';
  deleted_items int := 0;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_id is null then raise exception 'Category is required'; end if;

  select c.name, c.slug
  into cat_name, cat_slug
  from public.goods_category_config c
  where c.id = p_id and c.owner_id = uid and coalesce(c.is_deleted, false) = false;

  if cat_name is null then
    return jsonb_build_object('ok', true, 'id', p_id, 'deleted_items', 0);
  end if;

  select coalesce(array_agg(distinct b.id), '{}')
  into brand_ids
  from public.goods_brands b
  where b.owner_id = uid
    and coalesce(b.is_deleted, false) = false
    and (
      lower(trim(coalesce(b.item_type, ''))) = lower(trim(cat_name))
      or lower(trim(coalesce(b.item_type, ''))) = lower(trim(cat_slug))
    );

  select coalesce(array_agg(distinct gi.group_id), '{}')
  into gids
  from public.goods_items gi
  where gi.owner_id = uid
    and coalesce(gi.is_deleted, false) = false
    and (
      gi.brand_id = any(brand_ids)
      or lower(trim(coalesce(gi.category_slug, ''))) = lower(trim(cat_slug))
      or lower(trim(coalesce(public.app_note_meta_value(gi.notes, 'ITYPE'), ''))) = lower(trim(cat_name))
      or lower(trim(coalesce(public.app_note_meta_value(gi.notes, 'CSLUG'), ''))) = lower(trim(cat_slug))
    );

  deleted_items := public.app_soft_delete_goods_groups(gids);

  if cardinality(brand_ids) > 0 then
    update public.goods_brand_variants
    set is_deleted = true, updated_at = now()
    where owner_id = uid
      and brand_id = any(brand_ids)
      and coalesce(is_deleted, false) = false;

    update public.goods_product_lines
    set is_deleted = true, updated_at = now()
    where owner_id = uid
      and brand_id = any(brand_ids)
      and coalesce(is_deleted, false) = false;

    update public.goods_brands
    set is_deleted = true, updated_at = now()
    where owner_id = uid
      and id = any(brand_ids)
      and coalesce(is_deleted, false) = false;
  end if;

  update public.goods_category_config
  set is_deleted = true, updated_at = now()
  where id = p_id and owner_id = uid and coalesce(is_deleted, false) = false;

  return jsonb_build_object(
    'ok', true,
    'id', p_id,
    'name', cat_name,
    'slug', cat_slug,
    'deleted_items', deleted_items
  );
end;
$$;

revoke all on function public.app_delete_goods_category(uuid) from public;
grant execute on function public.app_delete_goods_category(uuid) to authenticated, service_role;

create or replace function public.app_delete_goods_product_line(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  line_name text := '';
  brand_id uuid;
  gids uuid[] := '{}';
  deleted_items int := 0;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_id is null then raise exception 'Product type is required'; end if;

  select pl.name, pl.brand_id
  into line_name, brand_id
  from public.goods_product_lines pl
  where pl.id = p_id and pl.owner_id = uid and coalesce(pl.is_deleted, false) = false;

  if line_name is null then
    return jsonb_build_object('ok', true, 'id', p_id, 'deleted_items', 0);
  end if;

  select coalesce(array_agg(distinct gi.group_id), '{}')
  into gids
  from public.goods_items gi
  where gi.owner_id = uid
    and coalesce(gi.is_deleted, false) = false
    and (
      gi.product_line_id = p_id
      or (
        brand_id is not null
        and gi.brand_id = brand_id
        and lower(trim(coalesce(gi.product_line, ''))) = lower(trim(line_name))
      )
      or lower(trim(coalesce(public.app_note_meta_value(gi.notes, 'PLINEID'), ''))) = lower(p_id::text)
      or lower(trim(coalesce(public.app_note_meta_value(gi.notes, 'PLINE'), ''))) = lower(trim(line_name))
    );

  deleted_items := public.app_soft_delete_goods_groups(gids);

  update public.goods_brand_variants
  set is_deleted = true, updated_at = now()
  where owner_id = uid
    and product_line_id = p_id
    and coalesce(is_deleted, false) = false;

  update public.goods_product_lines
  set is_deleted = true, updated_at = now()
  where id = p_id and owner_id = uid and coalesce(is_deleted, false) = false;

  return jsonb_build_object(
    'ok', true,
    'id', p_id,
    'name', line_name,
    'deleted_items', deleted_items
  );
end;
$$;

revoke all on function public.app_delete_goods_product_line(uuid) from public;
grant execute on function public.app_delete_goods_product_line(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/057_inventory_cascade_delete_catalog.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/058_inventory_sales_upsert_and_owner_fix.sql
-- ############################################################################

-- ============================================================================
-- 058_inventory_sales_upsert_and_owner_fix.sql
-- Fixes sales vanishing after refresh:
--   1) Reliable SECURITY DEFINER upsert for goods_sales (like items RPC)
--   2) Inventory list/detail RPCs filter by app_data_owner_id() (team owner)
--   3) Soft-link sales↔group_id (drop hard FK when present)
--   4) Repair ledger-only SALE rows into goods_sales
-- Additive only. Safe to re-run. Does NOT wipe data.
-- ============================================================================

-- Ensure required columns exist on older projects
select public.app_add_column_if_missing('goods_sales', 'owner_id', 'uuid');
select public.app_add_column_if_missing('goods_sales', 'tx_type', 'text default ''SALE''');
select public.app_add_column_if_missing('goods_sales', 'meta', 'jsonb default ''{}''::jsonb');
select public.app_add_column_if_missing('goods_sales', 'is_deleted', 'boolean default false');
select public.app_add_column_if_missing('goods_events', 'owner_id', 'uuid');
select public.app_add_column_if_missing('goods_events', 'tx_type', 'text');
select public.app_add_column_if_missing('goods_events', 'meta', 'jsonb default ''{}''::jsonb');
select public.app_add_column_if_missing('goods_events', 'is_deleted', 'boolean default false');

-- Perfume pours store fractional liters; coerce integer sold_qty if present
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'goods_sales'
      and column_name = 'sold_qty'
      and data_type in ('integer', 'bigint', 'smallint')
  ) then
    alter table public.goods_sales
      alter column sold_qty type numeric(18,8)
      using sold_qty::numeric;
  end if;
exception when others then
  null;
end $$;

-- Prefer soft group_id link — hard FK causes SALE inserts to fail when the
-- parent item row is briefly missing / ledger-only / owner mismatch.
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'goods_sales_group_id_fkey'
  ) then
    alter table public.goods_sales drop constraint goods_sales_group_id_fkey;
  end if;
exception when others then
  null;
end $$;

create index if not exists goods_sales_owner_sold_idx
  on public.goods_sales (owner_id, sold_date desc, created_at desc);

create index if not exists goods_sales_owner_group_idx
  on public.goods_sales (owner_id, group_id);

-- --------------------------------------------------------------------------
-- Upsert a sale line (SECURITY DEFINER — reliable under team/owner RLS)
-- --------------------------------------------------------------------------
create or replace function public.app_upsert_goods_sale(
  p_id uuid default null,
  p_group_id uuid default null,
  p_item_name text default '',
  p_currency text default 'AED',
  p_unit_sold_price numeric default 0,
  p_sold_qty numeric default 1,
  p_total_sold_price numeric default 0,
  p_sold_date date default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  data_owner uuid;
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_group_id uuid := coalesce(p_group_id, gen_random_uuid());
  nm text := left(trim(coalesce(p_item_name, '')), 200);
  cur text := upper(trim(coalesce(p_currency, 'AED')));
  qty numeric := coalesce(p_sold_qty, 1);
  unit_price numeric := coalesce(p_unit_sold_price, 0);
  total_price numeric := coalesce(p_total_sold_price, 0);
  sold date := coalesce(p_sold_date, current_date);
  row public.goods_sales;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  data_owner := coalesce(public.app_data_owner_id(), uid);
  if nm = '' then nm := 'Item'; end if;
  if cur = '' then cur := 'AED'; end if;
  if cur not in ('AED', 'SAR', 'PKR', 'USD', 'BTC') then
    cur := 'AED';
  end if;
  if qty <= 0 then raise exception 'Sold quantity must be greater than zero'; end if;
  if unit_price < 0 then unit_price := 0; end if;
  if total_price < 0 then total_price := 0; end if;
  if total_price = 0 and unit_price > 0 then
    total_price := unit_price * qty;
  end if;

  select gs.* into row
  from public.goods_sales gs
  where gs.id = v_id
  limit 1;

  if row.id is null then
    insert into public.goods_sales (
      id, group_id, owner_id, item_name, currency,
      unit_sold_price, sold_qty, total_sold_price, sold_date, notes,
      tx_type, meta, is_deleted
    ) values (
      v_id, v_group_id, data_owner, nm, cur,
      unit_price, qty, total_price, sold, p_notes,
      'SALE',
      jsonb_build_object('via', 'app_upsert_goods_sale'),
      false
    )
    returning * into row;
  else
    update public.goods_sales gs
    set
      group_id = v_group_id,
      owner_id = data_owner,
      item_name = nm,
      currency = cur,
      unit_sold_price = unit_price,
      sold_qty = qty,
      total_sold_price = total_price,
      sold_date = sold,
      notes = p_notes,
      tx_type = 'SALE',
      is_deleted = false,
      updated_at = now()
    where gs.id = row.id
    returning * into row;
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', row.id,
    'group_id', row.group_id,
    'owner_id', row.owner_id
  );
end;
$$;

revoke all on function public.app_upsert_goods_sale(
  uuid, uuid, text, text, numeric, numeric, numeric, date, text
) from public;
grant execute on function public.app_upsert_goods_sale(
  uuid, uuid, text, text, numeric, numeric, numeric, date, text
) to anon, authenticated, service_role;

-- --------------------------------------------------------------------------
-- Repair: copy ledger-only SALE rows into goods_sales for current data owner
-- --------------------------------------------------------------------------
create or replace function public.app_repair_my_ledger_goods_sales(
  p_limit int default 2000
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  data_owner uuid;
  lim int := greatest(1, least(coalesce(p_limit, 2000), 5000));
  repaired int := 0;
  r record;
  qty numeric;
  usp numeric;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  data_owner := coalesce(public.app_data_owner_id(), uid);

  for r in
    select l.*
    from public.loan_ledger_entries l
    where l.owner_id in (data_owner, uid)
      and coalesce(l.notes, '') ilike '%[GOODS]%'
      and (
        coalesce(l.notes, '') ilike '%[TX:SALE]%'
        or (
          l.entry_kind in ('partial', 'full')
          and coalesce(l.notes, '') not ilike '%[TX:SETTLEMENT]%'
          and coalesce(l.notes, '') not ilike '%[TX:CUSTOMER]%'
          and coalesce(l.notes, '') not ilike '%[TX:PURCHASE]%'
          and coalesce(l.notes, '') not ilike '%[TX:ITEM]%'
        )
      )
      and not exists (
        select 1 from public.goods_sales gs
        where gs.id = l.id
      )
    order by l.created_at desc nulls last
    limit lim
  loop
    qty := nullif(public.app_note_meta_value(r.notes, 'SQTY'), '')::numeric;
    usp := nullif(public.app_note_meta_value(r.notes, 'USP'), '')::numeric;
    begin
      insert into public.goods_sales (
        id, group_id, owner_id, item_name, currency,
        unit_sold_price, sold_qty, total_sold_price, sold_date, notes,
        tx_type, meta, is_deleted, created_at
      ) values (
        r.id,
        coalesce(r.group_id, gen_random_uuid()),
        data_owner,
        coalesce(nullif(trim(r.person_name), ''), 'Item'),
        coalesce(nullif(upper(trim(r.currency)), ''), 'AED'),
        coalesce(usp, r.action_amount, 0),
        coalesce(qty, 1),
        coalesce(r.action_amount, r.principal_amount, 0),
        coalesce(r.action_date, r.loan_date, current_date),
        r.notes,
        'SALE',
        jsonb_build_object('repaired_from', 'loan_ledger_entries'),
        coalesce(r.notes, '') ilike '%[DELETED]%',
        coalesce(r.created_at, now())
      );
      repaired := repaired + 1;
    exception when others then
      -- Skip bad rows; continue repairing the rest
      null;
    end;
  end loop;

  return jsonb_build_object('ok', true, 'repaired', repaired);
end;
$$;

revoke all on function public.app_repair_my_ledger_goods_sales(int) from public;
grant execute on function public.app_repair_my_ledger_goods_sales(int) to anon, authenticated, service_role;

-- --------------------------------------------------------------------------
-- List RPCs: use data owner (team members see company inventory/sales)
-- --------------------------------------------------------------------------
create or replace function public.app_list_my_inventory_sales(
  p_limit int default 2000
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  data_owner uuid;
  lim int := greatest(1, least(coalesce(p_limit, 2000), 5000));
  sales jsonb := '[]'::jsonb;
  events jsonb := '[]'::jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  data_owner := coalesce(public.app_data_owner_id(), uid);

  select coalesce(jsonb_agg(row_to_json(s)::jsonb order by s.sold_date desc, s.created_at desc), '[]'::jsonb)
  into sales
  from (
    select
      gs.id,
      gs.group_id::text as group_id,
      gs.item_name,
      gs.currency,
      gs.unit_sold_price,
      gs.sold_qty,
      gs.total_sold_price,
      gs.sold_date,
      gs.notes,
      gs.created_at,
      gs.updated_at,
      'SALE'::text as row_kind
    from public.goods_sales gs
    where gs.owner_id = data_owner
      and coalesce(gs.is_deleted, false) = false
    order by gs.sold_date desc, gs.created_at desc
    limit lim
  ) s;

  select coalesce(jsonb_agg(row_to_json(e)::jsonb order by e.event_date desc, e.created_at desc), '[]'::jsonb)
  into events
  from (
    select
      ge.id,
      ge.group_id::text as group_id,
      ge.tx_type,
      ge.item_name,
      ge.currency,
      ge.entry_kind,
      ge.direction,
      ge.amount,
      ge.qty,
      ge.event_date,
      ge.notes,
      ge.created_at,
      ge.updated_at,
      'EVENT'::text as row_kind
    from public.goods_events ge
    where ge.owner_id = data_owner
      and coalesce(ge.is_deleted, false) = false
      and upper(coalesce(ge.tx_type, '')) in ('CUSTOMER', 'SETTLEMENT', 'SALE', 'PURCHASE')
    order by ge.event_date desc, ge.created_at desc
    limit lim
  ) e;

  return jsonb_build_object(
    'ok', true,
    'sales', coalesce(sales, '[]'::jsonb),
    'events', coalesce(events, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.app_list_my_inventory_sales(int) to anon, authenticated, service_role;

create or replace function public.app_list_my_inventory_item_detail(
  p_group_id uuid,
  p_limit int default 2000
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  data_owner uuid;
  lim int := greatest(1, least(coalesce(p_limit, 2000), 5000));
  item jsonb := null;
  sales jsonb := '[]'::jsonb;
  events jsonb := '[]'::jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_group_id is null then raise exception 'group_id required'; end if;
  data_owner := coalesce(public.app_data_owner_id(), uid);

  select row_to_json(x)::jsonb
  into item
  from (
    select
      gi.id,
      gi.group_id::text as group_id,
      gi.item_name,
      gi.currency,
      gi.unit_actual_price,
      gi.bought_qty,
      gi.total_actual_price,
      gi.bought_date,
      gi.item_code,
      gi.notes,
      gi.brand,
      gi.variant_label,
      gi.brand_id,
      gi.variant_id,
      coalesce(nullif(gi.item_category, ''), public.app_note_meta_value(gi.notes, 'UCAT'), 'count') as item_category,
      coalesce(nullif(gi.quantity_unit, ''), public.app_note_meta_value(gi.notes, 'UOM'), 'item') as quantity_unit,
      coalesce(nullif(public.app_note_meta_value(gi.notes, 'ITYPE'), ''), 'General') as item_type,
      gi.created_at,
      gi.updated_at
    from public.goods_items gi
    where gi.owner_id = data_owner
      and gi.group_id = p_group_id
      and coalesce(gi.is_deleted, false) = false
    limit 1
  ) x;

  select coalesce(jsonb_agg(row_to_json(s)::jsonb order by s.sold_date desc, s.created_at desc), '[]'::jsonb)
  into sales
  from (
    select
      gs.id,
      gs.group_id::text as group_id,
      gs.item_name,
      gs.currency,
      gs.unit_sold_price,
      gs.sold_qty,
      gs.total_sold_price,
      gs.sold_date,
      gs.notes,
      gs.created_at,
      gs.updated_at
    from public.goods_sales gs
    where gs.owner_id = data_owner
      and gs.group_id = p_group_id
      and coalesce(gs.is_deleted, false) = false
    order by gs.sold_date desc, gs.created_at desc
    limit lim
  ) s;

  select coalesce(jsonb_agg(row_to_json(e)::jsonb order by e.event_date desc, e.created_at desc), '[]'::jsonb)
  into events
  from (
    select
      ge.id,
      ge.group_id::text as group_id,
      ge.tx_type,
      ge.item_name,
      ge.currency,
      ge.entry_kind,
      ge.direction,
      ge.amount,
      ge.qty,
      ge.event_date,
      ge.notes,
      ge.created_at,
      ge.updated_at
    from public.goods_events ge
    where ge.owner_id = data_owner
      and ge.group_id = p_group_id
      and coalesce(ge.is_deleted, false) = false
    order by ge.event_date desc, ge.created_at desc
    limit lim
  ) e;

  return jsonb_build_object(
    'ok', true,
    'item', item,
    'sales', coalesce(sales, '[]'::jsonb),
    'events', coalesce(events, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.app_list_my_inventory_item_detail(uuid, int) from public;
grant execute on function public.app_list_my_inventory_item_detail(uuid, int) to anon, authenticated, service_role;

create or replace function public.app_list_my_inventory_summaries(
  p_search text default null,
  p_brand text default null,
  p_item_type text default null,
  p_status text default null,
  p_limit int default 500
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  data_owner uuid;
  lim int := greatest(1, least(coalesce(p_limit, 500), 2000));
  q text := lower(trim(coalesce(p_search, '')));
  brand_q text := lower(trim(coalesce(p_brand, '')));
  type_q text := lower(trim(coalesce(p_item_type, '')));
  status_q text := lower(trim(coalesce(p_status, '')));
  items jsonb := '[]'::jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  data_owner := coalesce(public.app_data_owner_id(), uid);

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.bought_date desc nulls last, x.item_name), '[]'::jsonb)
  into items
  from (
    select
      gi.id,
      gi.group_id::text as group_id,
      gi.item_name,
      gi.currency,
      gi.unit_actual_price,
      gi.bought_qty,
      gi.total_actual_price,
      gi.bought_date,
      gi.item_code,
      gi.notes,
      gi.brand,
      gi.variant_label,
      gi.brand_id,
      gi.variant_id,
      coalesce(nullif(gi.product_line, ''), public.app_note_meta_value(gi.notes, 'PLINE'), '') as product_line,
      gi.product_line_id,
      coalesce(nullif(gi.category_slug, ''), public.app_note_meta_value(gi.notes, 'CSLUG'), '') as category_slug,
      coalesce(nullif(gi.item_category, ''), public.app_note_meta_value(gi.notes, 'UCAT'), 'count') as item_category,
      coalesce(nullif(gi.quantity_unit, ''), public.app_note_meta_value(gi.notes, 'UOM'), 'item') as quantity_unit,
      coalesce(nullif(public.app_note_meta_value(gi.notes, 'ITYPE'), ''), 'General') as item_type,
      coalesce(nullif(public.app_note_meta_value(gi.notes, 'IDESC'), ''), '') as item_description,
      coalesce(nullif(public.app_note_meta_value(gi.notes, 'USP'), '')::numeric, 0) as unit_sold_price,
      coalesce(s.sold_qty, 0)::numeric as sold_qty,
      coalesce(s.sold_total, 0)::numeric as sold_total,
      greatest(gi.bought_qty - coalesce(s.sold_qty, 0), 0)::numeric as remaining_qty,
      case
        when greatest(gi.bought_qty - coalesce(s.sold_qty, 0), 0) <= 0.00000001 then 'Sold'
        when coalesce(s.sold_qty, 0) > 0 then 'Partial'
        else 'In Stock'
      end as stock_status,
      gi.created_at,
      gi.updated_at
    from public.goods_items gi
    left join lateral (
      select
        coalesce(sum(gs.sold_qty), 0) as sold_qty,
        coalesce(sum(gs.total_sold_price), 0) as sold_total
      from public.goods_sales gs
      where gs.owner_id = data_owner
        and gs.group_id = gi.group_id
        and coalesce(gs.is_deleted, false) = false
    ) s on true
    where gi.owner_id = data_owner
      and coalesce(gi.is_deleted, false) = false
      and (
        q = ''
        or lower(coalesce(gi.item_name, '')) like '%' || q || '%'
        or lower(coalesce(gi.brand, '')) like '%' || q || '%'
        or lower(coalesce(gi.variant_label, '')) like '%' || q || '%'
        or lower(coalesce(gi.product_line, '')) like '%' || q || '%'
        or lower(coalesce(gi.item_code, '')) like '%' || q || '%'
        or lower(coalesce(gi.notes, '')) like '%' || q || '%'
        or lower(coalesce(public.app_note_meta_value(gi.notes, 'ITYPE'), '')) like '%' || q || '%'
        or lower(coalesce(public.app_note_meta_value(gi.notes, 'PLINE'), '')) like '%' || q || '%'
      )
      and (brand_q = '' or brand_q = 'all' or lower(coalesce(gi.brand, '')) = brand_q)
      and (type_q = '' or type_q = 'all' or lower(coalesce(public.app_note_meta_value(gi.notes, 'ITYPE'), 'general')) = type_q)
      and (
        status_q = '' or status_q = 'all'
        or (status_q in ('open', 'in stock', 'instock') and greatest(gi.bought_qty - coalesce(s.sold_qty, 0), 0) > 0.00000001)
        or (status_q in ('closed', 'sold') and greatest(gi.bought_qty - coalesce(s.sold_qty, 0), 0) <= 0.00000001)
        or (
          status_q in ('lowstock', 'low stock')
          and greatest(gi.bought_qty - coalesce(s.sold_qty, 0), 0) > 0.00000001
          and gi.bought_qty > 0
          and (greatest(gi.bought_qty - coalesce(s.sold_qty, 0), 0) / gi.bought_qty) <= 0.15
        )
      )
    order by gi.bought_date desc nulls last, gi.item_name
    limit lim
  ) x;

  return jsonb_build_object('ok', true, 'items', coalesce(items, '[]'::jsonb));
end;
$$;

grant execute on function public.app_list_my_inventory_summaries(text, text, text, text, int)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/058_inventory_sales_upsert_and_owner_fix.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/059_password_policy.sql
-- ############################################################################

-- ============================================================================
-- 059_password_policy.sql
-- Password rules: ≥8 chars, 1 uppercase, 1 lowercase, 1 number.
-- Enforced on create / password change. Existing weak passwords keep working
-- until changed; those users get password_is_weak=true for a soft banner.
-- Additive only. Safe to re-run. Does NOT wipe data.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

alter table public.app_users
  add column if not exists password_is_weak boolean not null default false;

comment on column public.app_users.password_is_weak is
  'True when the known password fails the ≥8 / upper / lower / digit policy. Used for a soft UI banner only — never blocks login.';

create or replace function public.app_password_meets_policy(p_password text)
returns boolean
language sql
immutable
as $$
  select
    p_password is not null
    and length(p_password) >= 8
    and p_password ~ '[A-Z]'
    and p_password ~ '[a-z]'
    and p_password ~ '[0-9]';
$$;

create or replace function public.app_assert_password_policy(p_password text)
returns void
language plpgsql
immutable
as $$
begin
  if not public.app_password_meets_policy(p_password) then
    raise exception 'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, and a number';
  end if;
end;
$$;

-- Backfill from admin-visible plaintext where available (no effect on hashes).
update public.app_users
set password_is_weak = not public.app_password_meets_policy(admin_visible_password)
where admin_visible_password is not null
  and length(trim(admin_visible_password)) > 0;

-- Enforce policy only when a password is newly set/changed (via admin_visible_password).
-- Existing weak passwords remain usable until the user/admin changes them.
create or replace function public.app_users_password_policy_trg()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if tg_op = 'INSERT'
     or (tg_op = 'UPDATE' and new.admin_visible_password is distinct from old.admin_visible_password)
  then
    if new.admin_visible_password is not null and length(trim(new.admin_visible_password)) > 0 then
      perform public.app_assert_password_policy(new.admin_visible_password);
      new.password_is_weak := false;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_app_users_password_policy on public.app_users;
create trigger trg_app_users_password_policy
before insert or update of admin_visible_password on public.app_users
for each row
execute function public.app_users_password_policy_trg();

-- Change-password RPC (settings / forced change)
create or replace function public.app_change_password(p_old_password text, p_new_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  u public.app_users := public.current_app_user();
begin
  if u is null then raise exception 'Authentication required'; end if;
  perform public.app_assert_password_policy(p_new_password);
  if u.password_hash <> extensions.crypt(p_old_password, u.password_hash) then
    raise exception 'Current password is incorrect';
  end if;
  update public.app_users set
    password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
    admin_visible_password = p_new_password,
    password_is_weak = false,
    must_change_password = false,
    updated_at = now()
  where id = u.id;
  update public.app_sessions
  set revoked_at = now()
  where user_id = u.id
    and revoked_at is null
    and token_hash <> public.app_hash_token(public.current_session_token());
  return jsonb_build_object('ok', true, 'password_is_weak', false);
end;
$$;

-- Login: never block weak passwords; mark flag from the plaintext they typed
create or replace function public.app_login(
  p_username text,
  p_password text,
  p_user_agent text default null,
  p_ip text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  u public.app_users;
  token text;
  weak boolean;
begin
  if p_username is null or trim(p_username) = '' then
    raise exception 'Username is required';
  end if;
  if p_password is null or p_password = '' then
    raise exception 'Password is required';
  end if;

  select * into u
  from public.app_users
  where lower(username) = lower(trim(p_username))
  limit 1;

  if u is null or u.password_hash <> extensions.crypt(p_password, u.password_hash) then
    raise exception 'Invalid username or password';
  end if;

  if u.id is not null then
    perform public.app_enforce_access_expiry(u.id);
    select * into u from public.app_users where id = u.id;
  end if;

  if not u.is_active then
    if u.access_disabled_for_expiry_at is not null then
      raise exception 'Account is disabled because the access period expired. Contact the administrator to renew.';
    end if;
    raise exception 'Account is disabled';
  end if;

  weak := not public.app_password_meets_policy(p_password);

  token := public.app_create_session(u.id, p_user_agent, p_ip);
  -- Update weakness flag only — do NOT write admin_visible_password here
  -- (that would fire the policy trigger and block weak existing logins).
  update public.app_users
  set
    last_login_at = now(),
    updated_at = now(),
    password_is_weak = weak
  where id = u.id;

  select * into u from public.app_users where id = u.id;
  u.last_login_at := now();

  return jsonb_build_object(
    'session_token', token,
    'user', public.app_user_public_profile(u, false)
  );
end;
$$;

-- Expose password_is_weak on public profile (patch latest definition)
do $patch$
declare
  def text;
  oid oid;
begin
  select p.oid into oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'app_user_public_profile'
    and pg_get_function_identity_arguments(p.oid) = 'u app_users, p_include_admin_secrets boolean'
  limit 1;

  if oid is null then
    raise notice 'app_user_public_profile(app_users, boolean) not found — skip profile patch';
    return;
  end if;

  def := pg_get_functiondef(oid);
  if def ilike '%password_is_weak%' then
    raise notice 'app_user_public_profile already exposes password_is_weak';
    return;
  end if;

  if position('''must_change_password'', u.must_change_password' in def) = 0 then
    raise exception 'Could not patch app_user_public_profile — unexpected definition';
  end if;

  def := replace(
    def,
    '''must_change_password'', u.must_change_password',
    '''must_change_password'', u.must_change_password, ''password_is_weak'', coalesce(u.password_is_weak, false)'
  );
  execute def;
end;
$patch$;

-- Explicit asserts in trial signup (trigger also enforces)
do $patch$
declare
  def text;
  oid oid;
begin
  select p.oid into oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'app_trial_signup'
  order by p.pronargs desc
  limit 1;

  if oid is null then
    raise notice 'app_trial_signup not found — skip';
    return;
  end if;

  def := pg_get_functiondef(oid);
  def := regexp_replace(
    def,
    'if p_password is null or length\(p_password\) < 6 then\s*raise exception ''Password must be at least 6 characters'';\s*end if;',
    'perform public.app_assert_password_policy(p_password);',
    'n'
  );
  execute def;
end;
$patch$;

do $patch$
declare
  def text;
  oid oid;
begin
  select p.oid into oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'app_admin_create_user'
  order by p.pronargs desc
  limit 1;

  if oid is null then return; end if;
  def := pg_get_functiondef(oid);
  def := regexp_replace(
    def,
    'if p_password is null or length\(p_password\) < 6 then\s*raise exception ''Password must be at least 6 characters'';\s*end if;',
    'perform public.app_assert_password_policy(p_password);',
    'n'
  );
  execute def;
end;
$patch$;

do $patch$
declare
  def text;
  oid oid;
begin
  select p.oid into oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'app_admin_update_user_access'
  order by p.pronargs desc
  limit 1;

  if oid is null then return; end if;
  def := pg_get_functiondef(oid);
  def := regexp_replace(
    def,
    'if length\(p_password\) < 6 then\s*raise exception ''Password must be at least 6 characters'';\s*end if;',
    'perform public.app_assert_password_policy(p_password);',
    'n'
  );
  execute def;
end;
$patch$;

-- Team member + admin reset password (related create/reset paths)
do $patch$
declare
  def text;
  oid oid;
  fname text;
begin
  foreach fname in array array['app_team_create_member', 'app_admin_reset_password']
  loop
    select p.oid into oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = fname
    order by p.pronargs desc
    limit 1;
    if oid is null then continue; end if;
    def := pg_get_functiondef(oid);
    def := regexp_replace(
      def,
      'if p_password is null or length\(p_password\) < 6 then\s*raise exception ''Password must be at least 6 characters'';\s*end if;',
      'perform public.app_assert_password_policy(p_password);',
      'n'
    );
    def := regexp_replace(
      def,
      'if length\(p_password\) < 6 then\s*raise exception ''Password must be at least 6 characters'';\s*end if;',
      'perform public.app_assert_password_policy(p_password);',
      'n'
    );
    begin
      execute def;
    exception when others then
      raise notice 'Could not patch %: %', fname, sqlerrm;
    end;
  end loop;
end;
$patch$;

grant execute on function public.app_password_meets_policy(text) to anon, authenticated, service_role;
grant execute on function public.app_assert_password_policy(text) to anon, authenticated, service_role;
grant execute on function public.app_change_password(text, text) to anon, authenticated, service_role;
grant execute on function public.app_login(text, text, text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/059_password_policy.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/060_fix_category_rename_admin_domain_edit.sql
-- ############################################################################

-- ============================================================================
-- 060_fix_category_rename_admin_domain_edit.sql
-- Additive: category rename cascades to items/brands/lines; admin RAW edit
-- works on domain rows (not only loan_ledger_entries).
-- Safe on live DB (no DROP TABLE / TRUNCATE).
-- ============================================================================

-- Replace / upsert a [KEY:value] tag inside a notes string.
create or replace function public.app_note_meta_set(p_notes text, p_key text, p_value text)
returns text
language plpgsql
immutable
as $$
declare
  key text := upper(trim(coalesce(p_key, '')));
  val text := replace(coalesce(p_value, ''), ']', '');
  notes text := coalesce(p_notes, '');
  tag text;
  pattern text;
begin
  if key = '' then
    return notes;
  end if;
  tag := '[' || key || ':' || val || ']';
  pattern := '\[' || key || ':[^\]]*\]';
  if notes ~* pattern then
    return regexp_replace(notes, pattern, tag, 'gi');
  end if;
  if trim(notes) = '' then
    return tag;
  end if;
  return trim(notes) || ' ' || tag;
end;
$$;

revoke all on function public.app_note_meta_set(text, text, text) from public;
grant execute on function public.app_note_meta_set(text, text, text) to authenticated, anon, service_role;

-- Category upsert: update-by-id (or resolve existing), cascade rename to linked data.
create or replace function public.app_upsert_goods_category(
  p_id uuid default null,
  p_name text default '',
  p_slug text default '',
  p_uses_brands boolean default true,
  p_uses_product_lines boolean default true,
  p_uses_variants boolean default true,
  p_qty_pattern text default 'count',
  p_sort_order int default 0,
  p_hint text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  nm text := left(trim(coalesce(p_name, '')), 80);
  sl text := left(trim(coalesce(nullif(p_slug, ''), lower(regexp_replace(nm, '[^a-zA-Z0-9]+', '-', 'g')))), 80);
  pattern text := lower(trim(coalesce(p_qty_pattern, 'count')));
  row public.goods_category_config;
  old_name text;
  old_slug text;
  target_id uuid := p_id;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if nm = '' then raise exception 'Category name is required'; end if;
  if pattern not in ('count', 'weight', 'length', 'volume') then pattern := 'count'; end if;
  if sl = '' then sl := 'general'; end if;
  sl := lower(regexp_replace(sl, '[^a-z0-9]+', '-', 'g'));
  sl := trim(both '-' from sl);
  if sl = '' then sl := 'general'; end if;

  -- Prefer updating an existing active row (by id, then by name/slug) to avoid unique-slug inserts.
  if target_id is not null then
    select * into row
    from public.goods_category_config
    where id = target_id and owner_id = uid and coalesce(is_deleted, false) = false;
    if row.id is null then
      target_id := null;
    end if;
  end if;

  if target_id is null then
    select c.id into target_id
    from public.goods_category_config c
    where c.owner_id = uid
      and coalesce(c.is_deleted, false) = false
      and (
        lower(c.name) = lower(nm)
        or lower(c.slug) = lower(sl)
      )
    order by c.updated_at desc nulls last
    limit 1;
  end if;

  if target_id is null then
    insert into public.goods_category_config (
      owner_id, name, slug, uses_brands, uses_product_lines, uses_variants, qty_pattern, sort_order, hint
    ) values (
      uid, nm, sl, coalesce(p_uses_brands, true), coalesce(p_uses_product_lines, true),
      coalesce(p_uses_variants, true), pattern, coalesce(p_sort_order, 0), nullif(trim(coalesce(p_hint, '')), '')
    )
    returning * into row;
  else
    select * into row
    from public.goods_category_config
    where id = target_id and owner_id = uid and coalesce(is_deleted, false) = false
    for update;
    if row.id is null then raise exception 'Category not found'; end if;

    old_name := row.name;
    old_slug := row.slug;

    -- If another active category already owns the target slug, keep current slug
    -- when name-only rename would collide; otherwise fail clearly.
    if exists (
      select 1 from public.goods_category_config c
      where c.owner_id = uid
        and coalesce(c.is_deleted, false) = false
        and c.id <> row.id
        and lower(c.slug) = lower(sl)
    ) then
      if lower(coalesce(old_slug, '')) = lower(sl) then
        null; -- same slug, fine
      else
        raise exception 'Category slug "%" is already in use. Choose a different name.', sl;
      end if;
    end if;

    update public.goods_category_config
    set
      name = nm,
      slug = sl,
      uses_brands = coalesce(p_uses_brands, uses_brands),
      uses_product_lines = coalesce(p_uses_product_lines, uses_product_lines),
      uses_variants = coalesce(p_uses_variants, uses_variants),
      qty_pattern = pattern,
      sort_order = coalesce(p_sort_order, sort_order),
      hint = nullif(trim(coalesce(p_hint, '')), ''),
      updated_at = now()
    where id = row.id
    returning * into row;

    -- Cascade rename so stock stays linked to the renamed category.
    if old_name is distinct from nm or old_slug is distinct from sl then
      update public.goods_items gi
      set
        category_slug = sl,
        notes = public.app_note_meta_set(
          public.app_note_meta_set(gi.notes, 'ITYPE', nm),
          'CSLUG',
          sl
        ),
        updated_at = now()
      where gi.owner_id = uid
        and coalesce(gi.is_deleted, false) = false
        and (
          lower(coalesce(gi.category_slug, '')) = lower(coalesce(old_slug, ''))
          or lower(coalesce(public.app_note_meta_value(gi.notes, 'CSLUG'), '')) = lower(coalesce(old_slug, ''))
          or lower(coalesce(public.app_note_meta_value(gi.notes, 'ITYPE'), '')) = lower(coalesce(old_name, ''))
        );

      update public.goods_brands b
      set
        item_type = nm,
        updated_at = now()
      where b.owner_id = uid
        and coalesce(b.is_deleted, false) = false
        and lower(coalesce(b.item_type, '')) = lower(coalesce(old_name, ''));

      update public.goods_product_lines pl
      set
        category_name = nm,
        updated_at = now()
      where pl.owner_id = uid
        and coalesce(pl.is_deleted, false) = false
        and lower(coalesce(pl.category_name, '')) = lower(coalesce(old_name, ''));

      -- Legacy ledger rows that still carry inventory meta tags.
      update public.loan_ledger_entries e
      set
        notes = public.app_note_meta_set(
          public.app_note_meta_set(e.notes, 'ITYPE', nm),
          'CSLUG',
          sl
        ),
        updated_at = now()
      where e.owner_id = uid
        and coalesce(e.notes, '') ilike '%[GOODS]%'
        and (
          lower(coalesce(public.app_note_meta_value(e.notes, 'CSLUG'), '')) = lower(coalesce(old_slug, ''))
          or lower(coalesce(public.app_note_meta_value(e.notes, 'ITYPE'), '')) = lower(coalesce(old_name, ''))
        );
    end if;
  end if;

  return jsonb_build_object('ok', true, 'item', row_to_json(row)::jsonb);
end;
$$;

revoke all on function public.app_upsert_goods_category(uuid, text, text, boolean, boolean, boolean, text, int, text) from public;
grant execute on function public.app_upsert_goods_category(uuid, text, text, boolean, boolean, boolean, text, int, text) to authenticated, anon, service_role;

-- Admin RAW edit: update ledger AND/OR domain tables (same dual-store idea as delete).
create or replace function public.app_admin_update_ledger_entry(
  p_entry_id uuid,
  p_group_id uuid default null,
  p_direction text default null,
  p_entry_kind text default null,
  p_person_name text default null,
  p_currency text default null,
  p_principal_amount numeric default null,
  p_action_amount numeric default null,
  p_loan_date date default null,
  p_action_date date default null,
  p_notes text default null,
  p_clear_principal boolean default false,
  p_clear_action boolean default false,
  p_clear_action_date boolean default false,
  p_clear_notes boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.loan_ledger_entries;
  new_direction text;
  new_kind text;
  new_principal numeric;
  new_action numeric;
  new_action_date date;
  new_notes text;
  new_person text;
  new_currency text;
  new_group uuid;
  new_loan_date date;
  sources text[] := array[]::text[];
  domain_hit text := null;
  n int;
  tbl text;
begin
  perform public.app_require_admin();

  -- 1) Legacy ledger (if present)
  select * into row from public.loan_ledger_entries where id = p_entry_id;
  if row is not null then
    new_direction := coalesce(nullif(trim(p_direction), ''), row.direction);
    new_kind := coalesce(nullif(trim(p_entry_kind), ''), row.entry_kind);
    new_person := coalesce(nullif(trim(p_person_name), ''), row.person_name);
    new_currency := coalesce(nullif(trim(p_currency), ''), row.currency);
    new_group := coalesce(p_group_id, row.group_id);
    new_loan_date := coalesce(p_loan_date, row.loan_date);

    if new_direction not in ('given', 'taken', 'goods') then
      raise exception 'Invalid direction';
    end if;
    if new_kind not in ('principal', 'partial', 'full') then
      raise exception 'Invalid entry_kind';
    end if;

    if p_clear_principal then
      new_principal := null;
    else
      new_principal := coalesce(p_principal_amount, row.principal_amount);
    end if;

    if p_clear_action then
      new_action := null;
    else
      new_action := coalesce(p_action_amount, row.action_amount);
    end if;

    if p_clear_action_date then
      new_action_date := null;
    else
      new_action_date := coalesce(p_action_date, row.action_date);
    end if;

    if p_clear_notes then
      new_notes := null;
    elsif p_notes is not null then
      new_notes := p_notes;
    else
      new_notes := row.notes;
    end if;

    if new_kind = 'principal' then
      if new_principal is null then
        raise exception 'Principal entries require principal_amount';
      end if;
      new_action := null;
      new_action_date := null;
    else
      if new_action is null then
        raise exception 'Partial/full entries require action_amount';
      end if;
      if new_action_date is null then
        raise exception 'Partial/full entries require action_date';
      end if;
      new_principal := null;
    end if;

    update public.loan_ledger_entries set
      group_id = new_group,
      direction = new_direction,
      entry_kind = new_kind,
      person_name = new_person,
      currency = new_currency,
      principal_amount = new_principal,
      action_amount = new_action,
      loan_date = new_loan_date,
      action_date = new_action_date,
      notes = new_notes,
      updated_at = now()
    where id = p_entry_id
    returning * into row;

    sources := array_append(sources, 'loan_ledger_entries');
  end if;

  -- Resolve effective field values for domain updates (from params / ledger row).
  if row is not null then
    new_direction := coalesce(nullif(trim(p_direction), ''), row.direction, 'taken');
    new_kind := coalesce(nullif(trim(p_entry_kind), ''), row.entry_kind, 'principal');
    new_person := coalesce(nullif(trim(p_person_name), ''), row.person_name, '');
    new_currency := coalesce(nullif(trim(p_currency), ''), row.currency, 'AED');
    new_group := coalesce(p_group_id, row.group_id, p_entry_id);
    new_loan_date := coalesce(p_loan_date, row.loan_date);
    if p_clear_principal then new_principal := null;
    else new_principal := coalesce(p_principal_amount, row.principal_amount);
    end if;
    if p_clear_action then new_action := null;
    else new_action := coalesce(p_action_amount, row.action_amount);
    end if;
    if p_clear_action_date then new_action_date := null;
    else new_action_date := coalesce(p_action_date, row.action_date);
    end if;
    if p_clear_notes then new_notes := null;
    elsif p_notes is not null then new_notes := p_notes;
    else new_notes := row.notes;
    end if;
  else
    new_direction := coalesce(nullif(trim(p_direction), ''), 'taken');
    new_kind := coalesce(nullif(trim(p_entry_kind), ''), 'principal');
    new_person := coalesce(nullif(trim(p_person_name), ''), '');
    new_currency := coalesce(nullif(trim(p_currency), ''), 'AED');
    new_group := coalesce(p_group_id, p_entry_id);
    new_loan_date := p_loan_date;
    new_principal := case when p_clear_principal then null else p_principal_amount end;
    new_action := case when p_clear_action then null else p_action_amount end;
    new_action_date := case when p_clear_action_date then null else p_action_date end;
    new_notes := case when p_clear_notes then null else p_notes end;
  end if;

  -- 2) Domain stores
  foreach tbl in array array[
    'loans','loan_payments','installment_plans','installment_payments',
    'expense_accounts','expense_topups','expense_entries','expense_transfers',
    'goods_items','goods_sales','goods_events',
    'bitcoin_wallets','app_notes'
  ]
  loop
    begin
      execute format('select count(*) from public.%I where id = $1', tbl) into n using p_entry_id;
    exception when undefined_table then
      continue;
    end;
    if n > 0 then
      domain_hit := tbl;
      if tbl = 'loans' then
        update public.loans set
          group_id = coalesce(new_group, group_id),
          direction = case when new_direction in ('given', 'taken') then new_direction else direction end,
          person_name = coalesce(nullif(new_person, ''), person_name),
          currency = coalesce(nullif(new_currency, ''), currency),
          principal_amount = coalesce(new_principal, principal_amount),
          loan_date = coalesce(new_loan_date, loan_date),
          notes = case when p_clear_notes then null when p_notes is not null then new_notes else notes end,
          updated_at = now()
        where id = p_entry_id;
      elsif tbl = 'loan_payments' then
        update public.loan_payments set
          group_id = coalesce(new_group, group_id),
          direction = case when new_direction in ('given', 'taken') then new_direction else direction end,
          payment_kind = case when new_kind in ('partial', 'full') then new_kind else payment_kind end,
          person_name = coalesce(nullif(new_person, ''), person_name),
          currency = coalesce(nullif(new_currency, ''), currency),
          payment_amount = coalesce(new_action, payment_amount),
          payment_date = coalesce(new_action_date, payment_date),
          notes = case when p_clear_notes then null when p_notes is not null then new_notes else notes end,
          updated_at = now()
        where id = p_entry_id;
      elsif tbl = 'installment_plans' then
        update public.installment_plans set
          group_id = coalesce(new_group, group_id),
          person_name = coalesce(nullif(new_person, ''), person_name),
          currency = coalesce(nullif(new_currency, ''), currency),
          principal_amount = coalesce(new_principal, principal_amount),
          loan_date = coalesce(new_loan_date, loan_date),
          notes = case when p_clear_notes then null when p_notes is not null then new_notes else notes end,
          updated_at = now()
        where id = p_entry_id;
      elsif tbl = 'installment_payments' then
        update public.installment_payments set
          group_id = coalesce(new_group, group_id),
          payment_kind = case when new_kind in ('partial', 'full') then new_kind else payment_kind end,
          person_name = coalesce(nullif(new_person, ''), person_name),
          currency = coalesce(nullif(new_currency, ''), currency),
          payment_amount = coalesce(new_action, payment_amount),
          payment_date = coalesce(new_action_date, payment_date),
          notes = case when p_clear_notes then null when p_notes is not null then new_notes else notes end,
          updated_at = now()
        where id = p_entry_id;
      elsif tbl = 'expense_accounts' then
        update public.expense_accounts set
          group_id = coalesce(new_group, group_id),
          account_name = coalesce(nullif(new_person, ''), account_name),
          currency = coalesce(nullif(new_currency, ''), currency),
          opening_balance = coalesce(new_principal, opening_balance),
          account_date = coalesce(new_loan_date, account_date),
          notes = case when p_clear_notes then null when p_notes is not null then new_notes else notes end,
          updated_at = now()
        where id = p_entry_id;
      elsif tbl = 'expense_topups' then
        update public.expense_topups set
          group_id = coalesce(new_group, group_id),
          account_name = coalesce(nullif(new_person, ''), account_name),
          currency = coalesce(nullif(new_currency, ''), currency),
          amount = coalesce(new_action, amount),
          topup_date = coalesce(new_action_date, topup_date),
          notes = case when p_clear_notes then null when p_notes is not null then new_notes else notes end,
          updated_at = now()
        where id = p_entry_id;
      elsif tbl = 'expense_entries' then
        update public.expense_entries set
          group_id = coalesce(new_group, group_id),
          account_name = coalesce(nullif(new_person, ''), account_name),
          currency = coalesce(nullif(new_currency, ''), currency),
          amount = coalesce(new_action, amount),
          expense_date = coalesce(new_action_date, expense_date),
          notes = case when p_clear_notes then null when p_notes is not null then new_notes else notes end,
          updated_at = now()
        where id = p_entry_id;
      elsif tbl = 'expense_transfers' then
        update public.expense_transfers set
          notes = case when p_clear_notes then null when p_notes is not null then new_notes else notes end,
          updated_at = now()
        where id = p_entry_id;
      elsif tbl = 'goods_items' then
        update public.goods_items set
          group_id = coalesce(new_group, group_id),
          item_name = coalesce(nullif(new_person, ''), item_name),
          currency = coalesce(nullif(new_currency, ''), currency),
          total_actual_price = coalesce(new_principal, total_actual_price),
          bought_date = coalesce(new_loan_date, bought_date),
          category_slug = coalesce(
            nullif(public.app_note_meta_value(coalesce(new_notes, notes), 'CSLUG'), ''),
            category_slug
          ),
          notes = case when p_clear_notes then null when p_notes is not null then new_notes else notes end,
          updated_at = now()
        where id = p_entry_id;
      elsif tbl = 'goods_sales' then
        update public.goods_sales set
          group_id = coalesce(new_group, group_id),
          item_name = coalesce(nullif(new_person, ''), item_name),
          currency = coalesce(nullif(new_currency, ''), currency),
          total_sold_price = coalesce(new_action, total_sold_price),
          sold_date = coalesce(new_action_date, sold_date),
          notes = case when p_clear_notes then null when p_notes is not null then new_notes else notes end,
          updated_at = now()
        where id = p_entry_id;
      elsif tbl = 'goods_events' then
        update public.goods_events set
          group_id = coalesce(new_group, group_id),
          direction = coalesce(nullif(new_direction, ''), direction),
          entry_kind = coalesce(nullif(new_kind, ''), entry_kind),
          item_name = coalesce(nullif(new_person, ''), item_name),
          currency = coalesce(nullif(new_currency, ''), currency),
          amount = coalesce(new_action, new_principal, amount),
          event_date = coalesce(new_action_date, new_loan_date, event_date),
          notes = case when p_clear_notes then null when p_notes is not null then new_notes else notes end,
          updated_at = now()
        where id = p_entry_id;
      elsif tbl = 'bitcoin_wallets' then
        update public.bitcoin_wallets set
          notes = case when p_clear_notes then null when p_notes is not null then new_notes else notes end,
          updated_at = now()
        where id = p_entry_id;
      elsif tbl = 'app_notes' then
        update public.app_notes set
          notes = case when p_clear_notes then null when p_notes is not null then new_notes else notes end,
          content = case
            when p_clear_notes then content
            when p_notes is not null then coalesce(nullif(trim(p_notes), ''), content)
            else content
          end,
          updated_at = now()
        where id = p_entry_id;
      end if;
      sources := array_append(sources, tbl);
    end if;
  end loop;

  if coalesce(array_length(sources, 1), 0) = 0 then
    raise exception 'Entry not found';
  end if;

  if row is not null then
    return public.app_admin_ledger_entry_row(row)
      || jsonb_build_object('source', 'loan_ledger_entries', 'sources', to_jsonb(sources));
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', p_entry_id,
    'source', coalesce(domain_hit, sources[1]),
    'sources', to_jsonb(sources)
  );
end;
$$;

revoke all on function public.app_admin_update_ledger_entry(uuid, uuid, text, text, text, text, numeric, numeric, date, date, text, boolean, boolean, boolean, boolean) from public;
grant execute on function public.app_admin_update_ledger_entry(uuid, uuid, text, text, text, text, numeric, numeric, date, date, text, boolean, boolean, boolean, boolean) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/060_fix_category_rename_admin_domain_edit.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/061_inventory_sub_brand_variant_attrs.sql
-- ############################################################################

-- ============================================================================
-- 061_inventory_sub_brand_variant_attrs.sql
-- Additive: sub-brands under brands, variant storage/color attrs, cascade
-- deletes include sub-brands. Safe on live DB (no DROP TABLE / TRUNCATE).
-- ============================================================================

-- Columns
select public.app_add_column_if_missing('goods_product_lines', 'sub_brand_id', 'uuid');
select public.app_add_column_if_missing('goods_items', 'sub_brand', 'text');
select public.app_add_column_if_missing('goods_items', 'sub_brand_id', 'uuid');
select public.app_add_column_if_missing('goods_items', 'variant_storage', 'text');
select public.app_add_column_if_missing('goods_items', 'variant_color', 'text');

-- Sub-brands table
create table if not exists public.goods_sub_brands (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.app_users(id) on delete cascade,
  brand_id uuid not null references public.goods_brands(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  meta jsonb not null default '{}'::jsonb,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists goods_sub_brands_brand_name_uq
  on public.goods_sub_brands(brand_id, lower(name))
  where coalesce(is_deleted, false) = false;

create index if not exists goods_sub_brands_owner_idx
  on public.goods_sub_brands(owner_id)
  where coalesce(is_deleted, false) = false;

create index if not exists goods_sub_brands_brand_idx
  on public.goods_sub_brands(brand_id)
  where coalesce(is_deleted, false) = false;

alter table public.goods_sub_brands enable row level security;

drop policy if exists goods_sub_brands_owner_all on public.goods_sub_brands;
create policy goods_sub_brands_owner_all on public.goods_sub_brands
  for all
  using (owner_id = public.current_app_user_id())
  with check (owner_id = public.current_app_user_id());

grant select, insert, update, delete on public.goods_sub_brands to authenticated, anon, service_role;

-- FK for product_lines.sub_brand_id (additive; ignore if already present)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'goods_product_lines_sub_brand_id_fkey'
  ) then
    begin
      alter table public.goods_product_lines
        add constraint goods_product_lines_sub_brand_id_fkey
        foreign key (sub_brand_id) references public.goods_sub_brands(id) on delete set null;
    exception when others then
      null;
    end;
  end if;
end $$;

-- ── List / upsert / delete sub-brands ────────────────────────────────────────

create or replace function public.app_list_my_goods_sub_brands(p_brand_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  items jsonb := '[]'::jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.sort_order, lower(x.name)), '[]'::jsonb)
  into items
  from (
    select
      sb.id,
      sb.brand_id,
      sb.name,
      sb.sort_order,
      sb.meta,
      sb.created_at,
      sb.updated_at,
      b.name as brand_name,
      b.item_type
    from public.goods_sub_brands sb
    join public.goods_brands b on b.id = sb.brand_id
    where sb.owner_id = uid
      and coalesce(sb.is_deleted, false) = false
      and coalesce(b.is_deleted, false) = false
      and (p_brand_id is null or sb.brand_id = p_brand_id)
  ) x;

  return jsonb_build_object('ok', true, 'items', coalesce(items, '[]'::jsonb));
end;
$$;

create or replace function public.app_upsert_goods_sub_brand(
  p_id uuid default null,
  p_brand_id uuid default null,
  p_name text default '',
  p_sort_order int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  nm text := left(trim(coalesce(p_name, '')), 120);
  brand public.goods_brands;
  row public.goods_sub_brands;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if nm = '' then raise exception 'Sub-brand name is required'; end if;
  if p_brand_id is null then raise exception 'Brand is required'; end if;

  select * into brand
  from public.goods_brands
  where id = p_brand_id and owner_id = uid and coalesce(is_deleted, false) = false;
  if brand.id is null then raise exception 'Brand not found'; end if;

  if p_id is null then
    select * into row
    from public.goods_sub_brands
    where brand_id = p_brand_id
      and owner_id = uid
      and coalesce(is_deleted, false) = false
      and lower(name) = lower(nm)
    limit 1;

    if row.id is null then
      begin
        insert into public.goods_sub_brands (owner_id, brand_id, name, sort_order)
        values (uid, p_brand_id, nm, coalesce(p_sort_order, 0))
        returning * into row;
      exception when unique_violation then
        select * into row
        from public.goods_sub_brands
        where brand_id = p_brand_id
          and owner_id = uid
          and coalesce(is_deleted, false) = false
          and lower(name) = lower(nm)
        limit 1;
      end;
    end if;
  else
    update public.goods_sub_brands
    set
      name = nm,
      sort_order = coalesce(p_sort_order, sort_order),
      updated_at = now()
    where id = p_id and owner_id = uid and coalesce(is_deleted, false) = false
    returning * into row;
    if row.id is null then raise exception 'Sub-brand not found'; end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', row.id,
    'brand_id', row.brand_id,
    'name', row.name,
    'item', row_to_json(row)::jsonb
  );
end;
$$;

create or replace function public.app_delete_goods_sub_brand(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  sb_name text := '';
  brand_id uuid;
  gids uuid[] := '{}';
  line_ids uuid[] := '{}';
  deleted_items int := 0;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_id is null then raise exception 'Sub-brand is required'; end if;

  select sb.name, sb.brand_id
  into sb_name, brand_id
  from public.goods_sub_brands sb
  where sb.id = p_id and sb.owner_id = uid and coalesce(sb.is_deleted, false) = false;

  if sb_name is null then
    return jsonb_build_object('ok', true, 'id', p_id, 'deleted_items', 0);
  end if;

  select coalesce(array_agg(distinct pl.id), '{}')
  into line_ids
  from public.goods_product_lines pl
  where pl.owner_id = uid
    and coalesce(pl.is_deleted, false) = false
    and pl.sub_brand_id = p_id;

  select coalesce(array_agg(distinct gi.group_id), '{}')
  into gids
  from public.goods_items gi
  where gi.owner_id = uid
    and coalesce(gi.is_deleted, false) = false
    and (
      gi.sub_brand_id = p_id
      or gi.product_line_id = any(line_ids)
      or lower(trim(coalesce(gi.sub_brand, ''))) = lower(trim(sb_name))
      or lower(trim(coalesce(public.app_note_meta_value(gi.notes, 'SBRANDID'), ''))) = lower(p_id::text)
      or lower(trim(coalesce(public.app_note_meta_value(gi.notes, 'SBRAND'), ''))) = lower(trim(sb_name))
    );

  deleted_items := public.app_soft_delete_goods_groups(gids);

  if cardinality(line_ids) > 0 then
    update public.goods_brand_variants
    set is_deleted = true, updated_at = now()
    where owner_id = uid
      and product_line_id = any(line_ids)
      and coalesce(is_deleted, false) = false;

    update public.goods_product_lines
    set is_deleted = true, updated_at = now()
    where owner_id = uid
      and id = any(line_ids)
      and coalesce(is_deleted, false) = false;
  end if;

  update public.goods_sub_brands
  set is_deleted = true, updated_at = now()
  where id = p_id and owner_id = uid and coalesce(is_deleted, false) = false;

  return jsonb_build_object(
    'ok', true,
    'id', p_id,
    'name', sb_name,
    'deleted_items', deleted_items
  );
end;
$$;

-- Allow same type name under different sub-brands
drop index if exists public.goods_product_lines_brand_name_uidx;
create unique index if not exists goods_product_lines_brand_sub_name_uidx
  on public.goods_product_lines (
    brand_id,
    coalesce(sub_brand_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(name)
  )
  where coalesce(is_deleted, false) = false;

-- Product line upsert with optional sub_brand_id (replace prior signature)
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'app_upsert_goods_product_line'
  loop
    execute 'drop function if exists ' || r.sig;
  end loop;
end $$;

create or replace function public.app_upsert_goods_product_line(
  p_id uuid default null,
  p_brand_id uuid default null,
  p_name text default '',
  p_category_name text default 'General',
  p_sort_order int default 0,
  p_sub_brand_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  nm text := left(trim(coalesce(p_name, '')), 120);
  cat text := left(trim(coalesce(p_category_name, 'General')), 80);
  brand public.goods_brands;
  v_sub uuid := p_sub_brand_id;
  row public.goods_product_lines;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if nm = '' then raise exception 'Product type name is required'; end if;
  if p_brand_id is null then raise exception 'Brand is required'; end if;

  select * into brand
  from public.goods_brands
  where id = p_brand_id and owner_id = uid and coalesce(is_deleted, false) = false;
  if brand.id is null then raise exception 'Brand not found'; end if;

  if v_sub is not null and not exists (
    select 1 from public.goods_sub_brands sb
    where sb.id = v_sub and sb.brand_id = p_brand_id and sb.owner_id = uid
      and coalesce(sb.is_deleted, false) = false
  ) then
    v_sub := null;
  end if;

  if p_id is null then
    select * into row
    from public.goods_product_lines
    where brand_id = p_brand_id
      and owner_id = uid
      and coalesce(is_deleted, false) = false
      and lower(name) = lower(nm)
      and (
        (v_sub is null and sub_brand_id is null)
        or sub_brand_id = v_sub
      )
    limit 1;

    if row.id is null then
      begin
        insert into public.goods_product_lines (owner_id, brand_id, category_name, name, sort_order, sub_brand_id)
        values (uid, p_brand_id, coalesce(nullif(cat, ''), brand.item_type, 'General'), nm, coalesce(p_sort_order, 0), v_sub)
        returning * into row;
      exception when unique_violation then
        select * into row
        from public.goods_product_lines
        where brand_id = p_brand_id
          and owner_id = uid
          and coalesce(is_deleted, false) = false
          and lower(name) = lower(nm)
        limit 1;
      end;
    end if;
  else
    update public.goods_product_lines
    set
      name = nm,
      category_name = coalesce(nullif(cat, ''), category_name),
      sort_order = coalesce(p_sort_order, sort_order),
      sub_brand_id = coalesce(v_sub, sub_brand_id),
      updated_at = now()
    where id = p_id and owner_id = uid and coalesce(is_deleted, false) = false
    returning * into row;
    if row.id is null then raise exception 'Product type not found'; end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', row.id,
    'brand_id', row.brand_id,
    'sub_brand_id', row.sub_brand_id,
    'name', row.name,
    'category_name', row.category_name
  );
end;
$$;

-- Variant upsert with storage/color/other in meta
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'app_upsert_goods_brand_variant'
  loop
    execute 'drop function if exists ' || r.sig;
  end loop;
end $$;

create or replace function public.app_upsert_goods_brand_variant(
  p_id uuid default null,
  p_brand_id uuid default null,
  p_label text default '',
  p_item_category text default 'count',
  p_quantity_value numeric default 1,
  p_quantity_unit text default 'item',
  p_sort_order int default 0,
  p_product_line_id uuid default null,
  p_storage text default null,
  p_color text default null,
  p_other text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  nm text := left(trim(coalesce(p_label, '')), 120);
  cat text := lower(trim(coalesce(p_item_category, 'count')));
  unit text := lower(trim(coalesce(p_quantity_unit, 'item')));
  qty numeric := coalesce(p_quantity_value, 1);
  line_id uuid := p_product_line_id;
  brand public.goods_brands;
  row public.goods_brand_variants;
  attr jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if nm = '' then raise exception 'Variant label is required'; end if;
  if cat not in ('count', 'weight', 'length', 'volume') then cat := 'count'; end if;
  if qty <= 0 then qty := 1; end if;

  if p_brand_id is null and line_id is not null then
    select brand_id into p_brand_id from public.goods_product_lines
    where id = line_id and owner_id = uid and coalesce(is_deleted, false) = false;
  end if;
  if p_brand_id is null then raise exception 'Brand is required'; end if;

  select * into brand from public.goods_brands
  where id = p_brand_id and owner_id = uid and coalesce(is_deleted, false) = false;
  if brand.id is null then raise exception 'Brand not found'; end if;

  if line_id is not null then
    if not exists (
      select 1 from public.goods_product_lines
      where id = line_id and brand_id = p_brand_id and owner_id = uid
        and coalesce(is_deleted, false) = false
    ) then
      line_id := null;
    end if;
  end if;

  attr := jsonb_strip_nulls(jsonb_build_object(
    'storage', nullif(trim(coalesce(p_storage, '')), ''),
    'color', nullif(trim(coalesce(p_color, '')), ''),
    'other', nullif(trim(coalesce(p_other, '')), '')
  ));

  if p_id is null then
    select * into row
    from public.goods_brand_variants
    where brand_id = p_brand_id
      and owner_id = uid
      and coalesce(is_deleted, false) = false
      and lower(label) = lower(nm)
      and (
        (line_id is null and product_line_id is null)
        or product_line_id = line_id
      )
    limit 1;

    if row.id is null then
      insert into public.goods_brand_variants (
        owner_id, brand_id, label, item_category, quantity_value, quantity_unit, sort_order, product_line_id, meta
      ) values (
        uid, p_brand_id, nm, cat, qty, unit, coalesce(p_sort_order, 0), line_id,
        case when attr = '{}'::jsonb then '{}'::jsonb else attr end
      )
      returning * into row;
    else
      update public.goods_brand_variants
      set
        meta = coalesce(meta, '{}'::jsonb) || attr,
        item_category = cat,
        quantity_value = qty,
        quantity_unit = unit,
        sort_order = coalesce(p_sort_order, sort_order),
        product_line_id = coalesce(line_id, product_line_id),
        updated_at = now()
      where id = row.id
      returning * into row;
    end if;
  else
    update public.goods_brand_variants
    set
      label = nm,
      item_category = cat,
      quantity_value = qty,
      quantity_unit = unit,
      sort_order = coalesce(p_sort_order, sort_order),
      product_line_id = coalesce(line_id, product_line_id),
      meta = coalesce(meta, '{}'::jsonb) || attr,
      updated_at = now()
    where id = p_id and owner_id = uid and coalesce(is_deleted, false) = false
    returning * into row;
    if row.id is null then raise exception 'Variant not found'; end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', row.id,
    'brand_id', row.brand_id,
    'product_line_id', row.product_line_id,
    'label', row.label,
    'meta', row.meta
  );
end;
$$;

-- Goods item upsert with sub-brand + variant attrs
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'app_upsert_goods_item'
  loop
    execute 'drop function if exists ' || r.sig;
  end loop;
end $$;

create or replace function public.app_upsert_goods_item(
  p_id uuid default null,
  p_group_id uuid default null,
  p_item_name text default '',
  p_currency text default 'AED',
  p_unit_actual_price numeric default 0,
  p_bought_qty numeric default 1,
  p_total_actual_price numeric default 0,
  p_bought_date date default null,
  p_notes text default null,
  p_item_code text default null,
  p_brand text default null,
  p_variant_label text default null,
  p_brand_id uuid default null,
  p_variant_id uuid default null,
  p_product_line text default null,
  p_product_line_id uuid default null,
  p_category_slug text default null,
  p_item_category text default 'count',
  p_quantity_unit text default 'item',
  p_sub_brand text default null,
  p_sub_brand_id uuid default null,
  p_variant_storage text default null,
  p_variant_color text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  data_owner uuid;
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_group_id uuid := coalesce(p_group_id, gen_random_uuid());
  nm text := left(trim(coalesce(p_item_name, '')), 200);
  cur text := upper(trim(coalesce(p_currency, 'AED')));
  qty numeric := coalesce(p_bought_qty, 1);
  unit_cost numeric := coalesce(p_unit_actual_price, 0);
  total_cost numeric := coalesce(p_total_actual_price, 0);
  bought date := coalesce(p_bought_date, current_date);
  cat text := lower(trim(coalesce(p_item_category, 'count')));
  unit text := lower(trim(coalesce(p_quantity_unit, 'item')));
  v_brand_id uuid := p_brand_id;
  v_variant_id uuid := p_variant_id;
  v_product_line_id uuid := p_product_line_id;
  v_sub_brand_id uuid := p_sub_brand_id;
  row public.goods_items;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  data_owner := coalesce(public.app_data_owner_id(), uid);
  if nm = '' then raise exception 'Item name is required'; end if;
  if cur = '' then cur := 'AED'; end if;
  if cur not in ('AED', 'SAR', 'PKR', 'USD', 'BTC') then cur := 'AED'; end if;
  if qty <= 0 then raise exception 'Quantity must be greater than zero'; end if;
  if unit_cost < 0 then unit_cost := 0; end if;
  if total_cost <= 0 then total_cost := unit_cost * qty; end if;
  if cat not in ('count', 'weight', 'length', 'volume') then cat := 'count'; end if;
  if unit = '' then unit := 'item'; end if;

  if v_brand_id is not null and not exists (
    select 1 from public.goods_brands b
    where b.id = v_brand_id and b.owner_id = data_owner and coalesce(b.is_deleted, false) = false
  ) then v_brand_id := null; end if;
  if v_variant_id is not null and not exists (
    select 1 from public.goods_brand_variants v
    where v.id = v_variant_id and v.owner_id = data_owner and coalesce(v.is_deleted, false) = false
  ) then v_variant_id := null; end if;
  if v_product_line_id is not null and not exists (
    select 1 from public.goods_product_lines pl
    where pl.id = v_product_line_id and pl.owner_id = data_owner and coalesce(pl.is_deleted, false) = false
  ) then v_product_line_id := null; end if;
  if v_sub_brand_id is not null and not exists (
    select 1 from public.goods_sub_brands sb
    where sb.id = v_sub_brand_id and sb.owner_id = data_owner and coalesce(sb.is_deleted, false) = false
  ) then v_sub_brand_id := null; end if;

  select gi.* into row from public.goods_items gi where gi.id = v_id;

  if row.id is null then
    insert into public.goods_items (
      id, group_id, owner_id, item_name, currency,
      unit_actual_price, bought_qty, total_actual_price, bought_date, notes,
      item_code, brand, variant_label, brand_id, variant_id,
      product_line, product_line_id, category_slug, item_category, quantity_unit,
      sub_brand, sub_brand_id, variant_storage, variant_color, tx_type, meta, is_deleted
    ) values (
      v_id, v_group_id, data_owner, nm, cur,
      unit_cost, qty, total_cost, bought, p_notes,
      nullif(trim(coalesce(p_item_code, '')), ''),
      nullif(trim(coalesce(p_brand, '')), ''),
      nullif(trim(coalesce(p_variant_label, '')), ''),
      v_brand_id, v_variant_id,
      nullif(trim(coalesce(p_product_line, '')), ''),
      v_product_line_id,
      nullif(trim(coalesce(p_category_slug, '')), ''),
      cat, unit,
      nullif(trim(coalesce(p_sub_brand, '')), ''),
      v_sub_brand_id,
      nullif(trim(coalesce(p_variant_storage, '')), ''),
      nullif(trim(coalesce(p_variant_color, '')), ''),
      'ITEM',
      jsonb_build_object('source', 'app_upsert_goods_item'),
      false
    )
    returning * into row;
  else
    update public.goods_items set
      item_name = nm,
      currency = cur,
      unit_actual_price = unit_cost,
      bought_qty = qty,
      total_actual_price = total_cost,
      bought_date = bought,
      notes = coalesce(p_notes, notes),
      item_code = coalesce(nullif(trim(coalesce(p_item_code, '')), ''), item_code),
      brand = coalesce(nullif(trim(coalesce(p_brand, '')), ''), brand),
      variant_label = coalesce(nullif(trim(coalesce(p_variant_label, '')), ''), variant_label),
      brand_id = coalesce(v_brand_id, brand_id),
      variant_id = coalesce(v_variant_id, variant_id),
      product_line = coalesce(nullif(trim(coalesce(p_product_line, '')), ''), product_line),
      product_line_id = coalesce(v_product_line_id, product_line_id),
      category_slug = coalesce(nullif(trim(coalesce(p_category_slug, '')), ''), category_slug),
      item_category = cat,
      quantity_unit = unit,
      sub_brand = coalesce(nullif(trim(coalesce(p_sub_brand, '')), ''), sub_brand),
      sub_brand_id = coalesce(v_sub_brand_id, sub_brand_id),
      variant_storage = coalesce(nullif(trim(coalesce(p_variant_storage, '')), ''), variant_storage),
      variant_color = coalesce(nullif(trim(coalesce(p_variant_color, '')), ''), variant_color),
      updated_at = now(),
      is_deleted = false
    where id = v_id
    returning * into row;
  end if;

  return jsonb_build_object('ok', true, 'item', row_to_json(row)::jsonb);
end;
$$;

-- Category delete: also soft-delete sub-brands under affected brands
create or replace function public.app_delete_goods_category(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  cat_name text := '';
  cat_slug text := '';
  gids uuid[] := '{}';
  brand_ids uuid[] := '{}';
  deleted_items int := 0;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_id is null then raise exception 'Category is required'; end if;

  select c.name, c.slug
  into cat_name, cat_slug
  from public.goods_category_config c
  where c.id = p_id and c.owner_id = uid and coalesce(c.is_deleted, false) = false;

  if cat_name is null then
    return jsonb_build_object('ok', true, 'id', p_id, 'deleted_items', 0);
  end if;

  select coalesce(array_agg(distinct b.id), '{}')
  into brand_ids
  from public.goods_brands b
  where b.owner_id = uid
    and coalesce(b.is_deleted, false) = false
    and (
      lower(trim(coalesce(b.item_type, ''))) = lower(trim(cat_name))
      or lower(trim(coalesce(b.item_type, ''))) = lower(trim(cat_slug))
    );

  select coalesce(array_agg(distinct gi.group_id), '{}')
  into gids
  from public.goods_items gi
  where gi.owner_id = uid
    and coalesce(gi.is_deleted, false) = false
    and (
      gi.brand_id = any(brand_ids)
      or lower(trim(coalesce(gi.category_slug, ''))) = lower(trim(cat_slug))
      or lower(trim(coalesce(public.app_note_meta_value(gi.notes, 'ITYPE'), ''))) = lower(trim(cat_name))
      or lower(trim(coalesce(public.app_note_meta_value(gi.notes, 'CSLUG'), ''))) = lower(trim(cat_slug))
    );

  deleted_items := public.app_soft_delete_goods_groups(gids);

  if cardinality(brand_ids) > 0 then
    update public.goods_brand_variants
    set is_deleted = true, updated_at = now()
    where owner_id = uid
      and brand_id = any(brand_ids)
      and coalesce(is_deleted, false) = false;

    update public.goods_product_lines
    set is_deleted = true, updated_at = now()
    where owner_id = uid
      and brand_id = any(brand_ids)
      and coalesce(is_deleted, false) = false;

    update public.goods_sub_brands
    set is_deleted = true, updated_at = now()
    where owner_id = uid
      and brand_id = any(brand_ids)
      and coalesce(is_deleted, false) = false;

    update public.goods_brands
    set is_deleted = true, updated_at = now()
    where owner_id = uid
      and id = any(brand_ids)
      and coalesce(is_deleted, false) = false;
  end if;

  update public.goods_category_config
  set is_deleted = true, updated_at = now()
  where id = p_id and owner_id = uid and coalesce(is_deleted, false) = false;

  return jsonb_build_object(
    'ok', true,
    'id', p_id,
    'name', cat_name,
    'slug', cat_slug,
    'deleted_items', deleted_items
  );
end;
$$;

-- Brand delete: also soft-delete sub-brands
create or replace function public.app_delete_goods_brand(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  brand_name text := '';
  item_type text := '';
  gids uuid[] := '{}';
  deleted_items int := 0;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_id is null then raise exception 'Brand is required'; end if;

  select b.name, b.item_type
  into brand_name, item_type
  from public.goods_brands b
  where b.id = p_id and b.owner_id = uid and coalesce(b.is_deleted, false) = false;

  if brand_name is null then
    return jsonb_build_object('ok', true, 'id', p_id, 'deleted_items', 0);
  end if;

  select coalesce(array_agg(distinct gi.group_id), '{}')
  into gids
  from public.goods_items gi
  where gi.owner_id = uid
    and coalesce(gi.is_deleted, false) = false
    and (
      gi.brand_id = p_id
      or lower(trim(coalesce(gi.brand, ''))) = lower(trim(brand_name))
      or lower(trim(coalesce(public.app_note_meta_value(gi.notes, 'BRAND'), ''))) = lower(trim(brand_name))
    );

  deleted_items := public.app_soft_delete_goods_groups(gids);

  update public.goods_brand_variants
  set is_deleted = true, updated_at = now()
  where brand_id = p_id and owner_id = uid and coalesce(is_deleted, false) = false;

  update public.goods_product_lines
  set is_deleted = true, updated_at = now()
  where brand_id = p_id and owner_id = uid and coalesce(is_deleted, false) = false;

  update public.goods_sub_brands
  set is_deleted = true, updated_at = now()
  where brand_id = p_id and owner_id = uid and coalesce(is_deleted, false) = false;

  update public.goods_brands
  set is_deleted = true, updated_at = now()
  where id = p_id and owner_id = uid and coalesce(is_deleted, false) = false;

  return jsonb_build_object(
    'ok', true,
    'id', p_id,
    'name', brand_name,
    'item_type', item_type,
    'deleted_items', deleted_items
  );
end;
$$;

-- Brand list nests sub_brands + includes sub_brand_id / variant meta
create or replace function public.app_list_my_goods_brands()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  items jsonb := '[]'::jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by lower(x.name)), '[]'::jsonb)
  into items
  from (
    select
      b.id,
      b.name,
      b.item_type,
      b.notes,
      b.created_at,
      b.updated_at,
      coalesce((
        select jsonb_agg(row_to_json(sb)::jsonb order by sb.sort_order, lower(sb.name))
        from (
          select s.id, s.brand_id, s.name, s.sort_order, s.meta
          from public.goods_sub_brands s
          where s.brand_id = b.id
            and s.owner_id = uid
            and coalesce(s.is_deleted, false) = false
        ) sb
      ), '[]'::jsonb) as sub_brands,
      coalesce((
        select jsonb_agg(row_to_json(pl)::jsonb order by pl.sort_order, lower(pl.name))
        from (
          select
            p.id,
            p.brand_id,
            p.sub_brand_id,
            p.category_name,
            p.name,
            p.sort_order,
            coalesce((
              select jsonb_agg(row_to_json(v)::jsonb order by v.sort_order, lower(v.label))
              from (
                select
                  vv.id, vv.brand_id, vv.product_line_id, vv.label, vv.item_category,
                  vv.quantity_value, vv.quantity_unit, vv.sort_order, vv.meta
                from public.goods_brand_variants vv
                where vv.product_line_id = p.id
                  and vv.owner_id = uid
                  and coalesce(vv.is_deleted, false) = false
              ) v
            ), '[]'::jsonb) as variants
          from public.goods_product_lines p
          where p.brand_id = b.id
            and p.owner_id = uid
            and coalesce(p.is_deleted, false) = false
        ) pl
      ), '[]'::jsonb) as product_lines,
      coalesce((
        select jsonb_agg(row_to_json(v)::jsonb order by v.sort_order, lower(v.label))
        from (
          select
            vv.id, vv.brand_id, vv.product_line_id, vv.label, vv.item_category,
            vv.quantity_value, vv.quantity_unit, vv.sort_order, vv.meta
          from public.goods_brand_variants vv
          where vv.brand_id = b.id
            and vv.owner_id = uid
            and coalesce(vv.is_deleted, false) = false
        ) v
      ), '[]'::jsonb) as variants
    from public.goods_brands b
    where b.owner_id = uid
      and coalesce(b.is_deleted, false) = false
  ) x;

  return jsonb_build_object('ok', true, 'items', coalesce(items, '[]'::jsonb));
end;
$$;

revoke all on function public.app_list_my_goods_sub_brands(uuid) from public;
revoke all on function public.app_upsert_goods_sub_brand(uuid, uuid, text, int) from public;
revoke all on function public.app_delete_goods_sub_brand(uuid) from public;
revoke all on function public.app_upsert_goods_product_line(uuid, uuid, text, text, int, uuid) from public;
revoke all on function public.app_upsert_goods_brand_variant(uuid, uuid, text, text, numeric, text, int, uuid, text, text, text) from public;
revoke all on function public.app_upsert_goods_item(uuid, uuid, text, text, numeric, numeric, numeric, date, text, text, text, text, uuid, uuid, text, uuid, text, text, text, text, uuid, text, text) from public;

grant execute on function public.app_list_my_goods_sub_brands(uuid) to authenticated, anon, service_role;
grant execute on function public.app_upsert_goods_sub_brand(uuid, uuid, text, int) to authenticated, anon, service_role;
grant execute on function public.app_delete_goods_sub_brand(uuid) to authenticated, anon, service_role;
grant execute on function public.app_upsert_goods_product_line(uuid, uuid, text, text, int, uuid) to authenticated, anon, service_role;
grant execute on function public.app_upsert_goods_brand_variant(uuid, uuid, text, text, numeric, text, int, uuid, text, text, text) to authenticated, anon, service_role;
grant execute on function public.app_upsert_goods_item(uuid, uuid, text, text, numeric, numeric, numeric, date, text, text, text, text, uuid, uuid, text, uuid, text, text, text, text, uuid, text, text) to authenticated, anon, service_role;
grant execute on function public.app_delete_goods_category(uuid) to authenticated, service_role;
grant execute on function public.app_delete_goods_brand(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/061_inventory_sub_brand_variant_attrs.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/062_inventory_category_hard_purge.sql
-- ############################################################################

-- ============================================================================
-- 062_inventory_category_hard_purge.sql
-- Additive: hard-purge category cascade so deleted grids leave no nested rows.
-- Safe on live DB (CREATE OR REPLACE only; no DROP TABLE / TRUNCATE of unrelated data).
-- ============================================================================

create or replace function public.app_hard_delete_goods_groups(p_group_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  n int := 0;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_group_ids is null or cardinality(p_group_ids) = 0 then
    return 0;
  end if;

  delete from public.goods_sales
  where owner_id = uid and group_id = any(p_group_ids);

  delete from public.goods_events
  where owner_id = uid and group_id = any(p_group_ids);

  delete from public.goods_items
  where owner_id = uid and group_id = any(p_group_ids);

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.app_hard_delete_goods_groups(uuid[]) from public;
grant execute on function public.app_hard_delete_goods_groups(uuid[]) to authenticated, service_role;

-- Replace category delete with a hard purge of all nested catalog + stock.
create or replace function public.app_delete_goods_category(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  cat_name text := '';
  cat_slug text := '';
  gids uuid[] := '{}';
  brand_ids uuid[] := '{}';
  deleted_items int := 0;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_id is null then raise exception 'Category is required'; end if;

  select c.name, c.slug
  into cat_name, cat_slug
  from public.goods_category_config c
  where c.id = p_id and c.owner_id = uid;

  if cat_name is null then
    return jsonb_build_object('ok', true, 'id', p_id, 'deleted_items', 0);
  end if;

  -- Brands tied by item_type name/slug (active or already soft-deleted).
  select coalesce(array_agg(distinct b.id), '{}')
  into brand_ids
  from public.goods_brands b
  where b.owner_id = uid
    and (
      lower(trim(coalesce(b.item_type, ''))) = lower(trim(cat_name))
      or lower(trim(coalesce(b.item_type, ''))) = lower(trim(cat_slug))
    );

  -- Stock groups: by brand, category slug, ITYPE/CSLUG notes, or denorm columns.
  select coalesce(array_agg(distinct gi.group_id), '{}')
  into gids
  from public.goods_items gi
  where gi.owner_id = uid
    and (
      (cardinality(brand_ids) > 0 and gi.brand_id = any(brand_ids))
      or lower(trim(coalesce(gi.category_slug, ''))) = lower(trim(cat_slug))
      or lower(trim(coalesce(public.app_note_meta_value(gi.notes, 'ITYPE'), ''))) = lower(trim(cat_name))
      or lower(trim(coalesce(public.app_note_meta_value(gi.notes, 'CSLUG'), ''))) = lower(trim(cat_slug))
      or lower(trim(coalesce(public.app_note_meta_value(gi.notes, 'ITYPE'), ''))) = lower(trim(cat_slug))
    );

  -- Also collect brands that only appear via stock rows in this category.
  select coalesce(array_agg(distinct x.id), brand_ids)
  into brand_ids
  from (
    select unnest(brand_ids) as id
    union
    select distinct gi.brand_id
    from public.goods_items gi
    where gi.owner_id = uid
      and gi.brand_id is not null
      and gi.group_id = any(gids)
  ) x
  where x.id is not null;

  deleted_items := public.app_hard_delete_goods_groups(gids);

  if cardinality(brand_ids) > 0 then
    delete from public.goods_brand_variants
    where owner_id = uid and brand_id = any(brand_ids);

    delete from public.goods_product_lines
    where owner_id = uid and brand_id = any(brand_ids);

    delete from public.goods_sub_brands
    where owner_id = uid and brand_id = any(brand_ids);

    delete from public.goods_brands
    where owner_id = uid and id = any(brand_ids);
  end if;

  delete from public.goods_category_config
  where id = p_id and owner_id = uid;

  return jsonb_build_object(
    'ok', true,
    'id', p_id,
    'name', cat_name,
    'slug', cat_slug,
    'deleted_items', deleted_items,
    'hard_purge', true
  );
end;
$$;

revoke all on function public.app_delete_goods_category(uuid) from public;
grant execute on function public.app_delete_goods_category(uuid) to authenticated, service_role;

-- Brand delete: hard purge nested catalog + stock for that brand
create or replace function public.app_delete_goods_brand(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  brand_name text := '';
  item_type text := '';
  gids uuid[] := '{}';
  deleted_items int := 0;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_id is null then raise exception 'Brand is required'; end if;

  select b.name, b.item_type
  into brand_name, item_type
  from public.goods_brands b
  where b.id = p_id and b.owner_id = uid;

  if brand_name is null then
    return jsonb_build_object('ok', true, 'id', p_id, 'deleted_items', 0);
  end if;

  select coalesce(array_agg(distinct gi.group_id), '{}')
  into gids
  from public.goods_items gi
  where gi.owner_id = uid
    and (
      gi.brand_id = p_id
      or lower(trim(coalesce(gi.brand, ''))) = lower(trim(brand_name))
      or lower(trim(coalesce(public.app_note_meta_value(gi.notes, 'BRAND'), ''))) = lower(trim(brand_name))
      or lower(trim(coalesce(public.app_note_meta_value(gi.notes, 'BRANDID'), ''))) = lower(p_id::text)
    );

  deleted_items := public.app_hard_delete_goods_groups(gids);

  delete from public.goods_brand_variants
  where brand_id = p_id and owner_id = uid;

  delete from public.goods_product_lines
  where brand_id = p_id and owner_id = uid;

  delete from public.goods_sub_brands
  where brand_id = p_id and owner_id = uid;

  delete from public.goods_brands
  where id = p_id and owner_id = uid;

  return jsonb_build_object(
    'ok', true,
    'id', p_id,
    'name', brand_name,
    'item_type', item_type,
    'deleted_items', deleted_items,
    'hard_purge', true
  );
end;
$$;

revoke all on function public.app_delete_goods_brand(uuid) from public;
grant execute on function public.app_delete_goods_brand(uuid) to authenticated, service_role;

-- Sub-brand delete: hard purge
create or replace function public.app_delete_goods_sub_brand(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  sb_name text := '';
  brand_id uuid;
  gids uuid[] := '{}';
  line_ids uuid[] := '{}';
  deleted_items int := 0;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_id is null then raise exception 'Sub-brand is required'; end if;

  select sb.name, sb.brand_id
  into sb_name, brand_id
  from public.goods_sub_brands sb
  where sb.id = p_id and sb.owner_id = uid;

  if sb_name is null then
    return jsonb_build_object('ok', true, 'id', p_id, 'deleted_items', 0);
  end if;

  select coalesce(array_agg(distinct pl.id), '{}')
  into line_ids
  from public.goods_product_lines pl
  where pl.owner_id = uid and pl.sub_brand_id = p_id;

  select coalesce(array_agg(distinct gi.group_id), '{}')
  into gids
  from public.goods_items gi
  where gi.owner_id = uid
    and (
      gi.sub_brand_id = p_id
      or (cardinality(line_ids) > 0 and gi.product_line_id = any(line_ids))
      or lower(trim(coalesce(gi.sub_brand, ''))) = lower(trim(sb_name))
      or lower(trim(coalesce(public.app_note_meta_value(gi.notes, 'SBRANDID'), ''))) = lower(p_id::text)
      or lower(trim(coalesce(public.app_note_meta_value(gi.notes, 'SBRAND'), ''))) = lower(trim(sb_name))
    );

  deleted_items := public.app_hard_delete_goods_groups(gids);

  if cardinality(line_ids) > 0 then
    delete from public.goods_brand_variants
    where owner_id = uid and product_line_id = any(line_ids);

    delete from public.goods_product_lines
    where owner_id = uid and id = any(line_ids);
  end if;

  delete from public.goods_sub_brands
  where id = p_id and owner_id = uid;

  return jsonb_build_object(
    'ok', true,
    'id', p_id,
    'name', sb_name,
    'deleted_items', deleted_items,
    'hard_purge', true
  );
end;
$$;

revoke all on function public.app_delete_goods_sub_brand(uuid) from public;
grant execute on function public.app_delete_goods_sub_brand(uuid) to authenticated, service_role;

-- Product line delete: hard purge
create or replace function public.app_delete_goods_product_line(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  line_name text := '';
  brand_id uuid;
  gids uuid[] := '{}';
  deleted_items int := 0;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_id is null then raise exception 'Product type is required'; end if;

  select pl.name, pl.brand_id
  into line_name, brand_id
  from public.goods_product_lines pl
  where pl.id = p_id and pl.owner_id = uid;

  if line_name is null then
    return jsonb_build_object('ok', true, 'id', p_id, 'deleted_items', 0);
  end if;

  select coalesce(array_agg(distinct gi.group_id), '{}')
  into gids
  from public.goods_items gi
  where gi.owner_id = uid
    and (
      gi.product_line_id = p_id
      or (
        brand_id is not null
        and gi.brand_id = brand_id
        and lower(trim(coalesce(gi.product_line, ''))) = lower(trim(line_name))
      )
      or lower(trim(coalesce(public.app_note_meta_value(gi.notes, 'PLINEID'), ''))) = lower(p_id::text)
      or lower(trim(coalesce(public.app_note_meta_value(gi.notes, 'PLINE'), ''))) = lower(trim(line_name))
    );

  deleted_items := public.app_hard_delete_goods_groups(gids);

  delete from public.goods_brand_variants
  where owner_id = uid and product_line_id = p_id;

  delete from public.goods_product_lines
  where id = p_id and owner_id = uid;

  return jsonb_build_object(
    'ok', true,
    'id', p_id,
    'name', line_name,
    'deleted_items', deleted_items,
    'hard_purge', true
  );
end;
$$;

revoke all on function public.app_delete_goods_product_line(uuid) from public;
grant execute on function public.app_delete_goods_product_line(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/062_inventory_category_hard_purge.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/063_inventory_sell_by_volume_or_bottle.sql
-- ############################################################################

-- ============================================================================
-- 063_inventory_sell_by_volume_or_bottle.sql
-- Additive: sell_by + bottle size columns for volume items (perfume pours vs whole bottles).
-- Safe on live DB (no DROP TABLE / TRUNCATE).
-- ============================================================================

select public.app_add_column_if_missing('goods_items', 'sell_by', 'text');
select public.app_add_column_if_missing('goods_items', 'bottle_size_qty', 'numeric');
select public.app_add_column_if_missing('goods_items', 'bottle_size_unit', 'text');

-- Extend goods item upsert with sell_by / bottle size (replace prior signature safely)
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'app_upsert_goods_item'
  loop
    execute 'drop function if exists ' || r.sig;
  end loop;
end $$;

create or replace function public.app_upsert_goods_item(
  p_id uuid default null,
  p_group_id uuid default null,
  p_item_name text default '',
  p_currency text default 'AED',
  p_unit_actual_price numeric default 0,
  p_bought_qty numeric default 1,
  p_total_actual_price numeric default 0,
  p_bought_date date default null,
  p_notes text default null,
  p_item_code text default null,
  p_brand text default null,
  p_variant_label text default null,
  p_brand_id uuid default null,
  p_variant_id uuid default null,
  p_product_line text default null,
  p_product_line_id uuid default null,
  p_category_slug text default null,
  p_item_category text default 'count',
  p_quantity_unit text default 'item',
  p_sub_brand text default null,
  p_sub_brand_id uuid default null,
  p_variant_storage text default null,
  p_variant_color text default null,
  p_sell_by text default null,
  p_bottle_size_qty numeric default null,
  p_bottle_size_unit text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  data_owner uuid;
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_group_id uuid := coalesce(p_group_id, gen_random_uuid());
  nm text := left(trim(coalesce(p_item_name, '')), 200);
  cur text := upper(trim(coalesce(p_currency, 'AED')));
  qty numeric := coalesce(p_bought_qty, 1);
  unit_cost numeric := coalesce(p_unit_actual_price, 0);
  total_cost numeric := coalesce(p_total_actual_price, 0);
  bought date := coalesce(p_bought_date, current_date);
  cat text := lower(trim(coalesce(p_item_category, 'count')));
  unit text := lower(trim(coalesce(p_quantity_unit, 'item')));
  v_brand_id uuid := p_brand_id;
  v_variant_id uuid := p_variant_id;
  v_product_line_id uuid := p_product_line_id;
  v_sub_brand_id uuid := p_sub_brand_id;
  v_sell_by text := lower(trim(coalesce(p_sell_by, '')));
  v_bottle_unit text := lower(trim(coalesce(p_bottle_size_unit, '')));
  row public.goods_items;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  data_owner := coalesce(public.app_data_owner_id(), uid);
  if nm = '' then raise exception 'Item name is required'; end if;
  if cur = '' then cur := 'AED'; end if;
  if cur not in ('AED', 'SAR', 'PKR', 'USD', 'BTC') then cur := 'AED'; end if;
  if qty <= 0 then raise exception 'Quantity must be greater than zero'; end if;
  if unit_cost < 0 then unit_cost := 0; end if;
  if total_cost <= 0 then total_cost := unit_cost * qty; end if;
  if cat not in ('count', 'weight', 'length', 'volume') then cat := 'count'; end if;
  if unit = '' then unit := 'item'; end if;
  if v_sell_by not in ('volume', 'bottle') then v_sell_by := null; end if;
  if v_bottle_unit not in ('ml', 'l') then v_bottle_unit := null; end if;

  if v_brand_id is not null and not exists (
    select 1 from public.goods_brands b
    where b.id = v_brand_id and b.owner_id = data_owner and coalesce(b.is_deleted, false) = false
  ) then v_brand_id := null; end if;
  if v_variant_id is not null and not exists (
    select 1 from public.goods_brand_variants v
    where v.id = v_variant_id and v.owner_id = data_owner and coalesce(v.is_deleted, false) = false
  ) then v_variant_id := null; end if;
  if v_product_line_id is not null and not exists (
    select 1 from public.goods_product_lines pl
    where pl.id = v_product_line_id and pl.owner_id = data_owner and coalesce(pl.is_deleted, false) = false
  ) then v_product_line_id := null; end if;
  if v_sub_brand_id is not null and not exists (
    select 1 from public.goods_sub_brands sb
    where sb.id = v_sub_brand_id and sb.owner_id = data_owner and coalesce(sb.is_deleted, false) = false
  ) then v_sub_brand_id := null; end if;

  select gi.* into row from public.goods_items gi where gi.id = v_id;

  if row.id is null then
    insert into public.goods_items (
      id, group_id, owner_id, item_name, currency,
      unit_actual_price, bought_qty, total_actual_price, bought_date, notes,
      item_code, brand, variant_label, brand_id, variant_id,
      product_line, product_line_id, category_slug, item_category, quantity_unit,
      sub_brand, sub_brand_id, variant_storage, variant_color,
      sell_by, bottle_size_qty, bottle_size_unit,
      tx_type, meta, is_deleted
    ) values (
      v_id, v_group_id, data_owner, nm, cur,
      unit_cost, qty, total_cost, bought, p_notes,
      nullif(trim(coalesce(p_item_code, '')), ''),
      nullif(trim(coalesce(p_brand, '')), ''),
      nullif(trim(coalesce(p_variant_label, '')), ''),
      v_brand_id, v_variant_id,
      nullif(trim(coalesce(p_product_line, '')), ''),
      v_product_line_id,
      nullif(trim(coalesce(p_category_slug, '')), ''),
      cat, unit,
      nullif(trim(coalesce(p_sub_brand, '')), ''),
      v_sub_brand_id,
      nullif(trim(coalesce(p_variant_storage, '')), ''),
      nullif(trim(coalesce(p_variant_color, '')), ''),
      v_sell_by,
      case when p_bottle_size_qty is not null and p_bottle_size_qty > 0 then p_bottle_size_qty else null end,
      v_bottle_unit,
      'ITEM',
      jsonb_build_object('source', 'app_upsert_goods_item'),
      false
    )
    returning * into row;
  else
    update public.goods_items set
      item_name = nm,
      currency = cur,
      unit_actual_price = unit_cost,
      bought_qty = qty,
      total_actual_price = total_cost,
      bought_date = bought,
      notes = coalesce(p_notes, notes),
      item_code = coalesce(nullif(trim(coalesce(p_item_code, '')), ''), item_code),
      brand = coalesce(nullif(trim(coalesce(p_brand, '')), ''), brand),
      variant_label = coalesce(nullif(trim(coalesce(p_variant_label, '')), ''), variant_label),
      brand_id = coalesce(v_brand_id, brand_id),
      variant_id = coalesce(v_variant_id, variant_id),
      product_line = coalesce(nullif(trim(coalesce(p_product_line, '')), ''), product_line),
      product_line_id = coalesce(v_product_line_id, product_line_id),
      category_slug = coalesce(nullif(trim(coalesce(p_category_slug, '')), ''), category_slug),
      item_category = cat,
      quantity_unit = unit,
      sub_brand = coalesce(nullif(trim(coalesce(p_sub_brand, '')), ''), sub_brand),
      sub_brand_id = coalesce(v_sub_brand_id, sub_brand_id),
      variant_storage = coalesce(nullif(trim(coalesce(p_variant_storage, '')), ''), variant_storage),
      variant_color = coalesce(nullif(trim(coalesce(p_variant_color, '')), ''), variant_color),
      sell_by = coalesce(v_sell_by, sell_by),
      bottle_size_qty = coalesce(
        case when p_bottle_size_qty is not null and p_bottle_size_qty > 0 then p_bottle_size_qty else null end,
        bottle_size_qty
      ),
      bottle_size_unit = coalesce(v_bottle_unit, bottle_size_unit),
      updated_at = now(),
      is_deleted = false
    where id = v_id
    returning * into row;
  end if;

  return jsonb_build_object('ok', true, 'item', row_to_json(row)::jsonb);
end;
$$;

revoke all on function public.app_upsert_goods_item(
  uuid, uuid, text, text, numeric, numeric, numeric, date, text,
  text, text, text, uuid, uuid, text, uuid, text, text, text,
  text, uuid, text, text, text, numeric, text
) from public;

grant execute on function public.app_upsert_goods_item(
  uuid, uuid, text, text, numeric, numeric, numeric, date, text,
  text, text, text, uuid, uuid, text, uuid, text, text, text,
  text, uuid, text, text, text, numeric, text
) to authenticated, anon, service_role;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/063_inventory_sell_by_volume_or_bottle.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/064_remember_me_and_grace_lock_disable.sql
-- ############################################################################

-- ============================================================================
-- 064_remember_me_and_grace_lock_disable.sql
-- Additive: Remember Me session TTL + grace (full access) → 1-day lock → auto-disable.
-- Safe on live DB (no DROP TABLE / TRUNCATE of user data).
-- Protected admins remain unlimited and are never auto-disabled.
-- ============================================================================

-- Persistent vs browser-session login sessions
select public.app_add_column_if_missing('app_sessions', 'is_persistent', 'boolean default true');

update public.app_sessions
set is_persistent = true
where is_persistent is null;

alter table public.app_sessions
  alter column is_persistent set default true;

alter table public.app_sessions
  alter column is_persistent set not null;

comment on column public.app_sessions.is_persistent is
  'true = Remember Me (long-lived, sliding). false = browser session only (short TTL, no long slide).';

-- ── Access flags: grace (writable) → lock (1 day) → disable ─────────────────
-- Timeline after trial_expires_at:
--   days 0–2  (grace, 3 days): full data access, not locked
--   day 3     (lock, 1 day):   workspace locked, still able to sign in / renew
--   day 4+                     auto-disable (is_active = false)
create or replace function public.app_user_access_flags(u public.app_users)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  plan text := coalesce(nullif(trim(u.access_plan), ''), 'full');
  expires_at timestamptz := u.trial_expires_at;
  has_period boolean := false;
  expired boolean := false;
  active_period boolean := false;
  days_left numeric := null;
  days_past numeric := 0;
  grace_active boolean := false;
  grace_days_left numeric := null;
  lock_active boolean := false;
  lock_days_left numeric := null;
  should_disable boolean := false;
  disable_at timestamptz := null;
  lock_at timestamptz := null;
  unlimited boolean := false;
  grace_days constant numeric := 3;
  lock_days constant numeric := 1;
begin
  -- Protected admins are always unlimited full access
  if coalesce(u.is_protected, false) then
    return jsonb_build_object(
      'access_plan', 'full',
      'trial_started_at', u.trial_started_at,
      'trial_expires_at', null,
      'is_trial', false,
      'trial_active', false,
      'trial_expired', false,
      'period_active', false,
      'period_expired', false,
      'trial_days_remaining', null,
      'has_access_period', false,
      'unlimited_access', true,
      'days_past_expiry', 0,
      'grace_active', false,
      'grace_days_left', null,
      'lock_active', false,
      'lock_days_left', null,
      'lock_starts_at', null,
      'should_auto_disable', false,
      'access_disable_at', null,
      'access_grace_warned_at', u.access_grace_warned_at,
      'access_disabled_for_expiry_at', u.access_disabled_for_expiry_at,
      'data_access_allowed', true
    );
  end if;

  if plan = 'trial' then
    has_period := true;
  elsif expires_at is not null then
    has_period := true;
  else
    unlimited := true;
  end if;

  if has_period then
    if expires_at is null or expires_at <= now() then
      expired := true;
      if expires_at is not null then
        days_past := greatest(0, ceil(extract(epoch from (now() - expires_at)) / 86400.0));
        lock_at := expires_at + make_interval(days => grace_days::int);
        disable_at := expires_at + make_interval(days => (grace_days + lock_days)::int);
        grace_active := days_past < grace_days;
        if grace_active then
          grace_days_left := greatest(0, grace_days - days_past);
        end if;
        lock_active := (not grace_active) and days_past < (grace_days + lock_days);
        if lock_active then
          lock_days_left := greatest(0, (grace_days + lock_days) - days_past);
        end if;
        should_disable := days_past >= (grace_days + lock_days);
      else
        days_past := grace_days + lock_days;
        should_disable := true;
        grace_active := false;
        lock_active := false;
      end if;
    else
      active_period := true;
      days_left := greatest(0, ceil(extract(epoch from (expires_at - now())) / 86400.0));
      lock_at := expires_at + make_interval(days => grace_days::int);
      disable_at := expires_at + make_interval(days => (grace_days + lock_days)::int);
    end if;
  end if;

  return jsonb_build_object(
    'access_plan', plan,
    'trial_started_at', u.trial_started_at,
    'trial_expires_at', expires_at,
    'is_trial', plan = 'trial',
    'trial_active', active_period and plan = 'trial',
    'trial_expired', expired and plan = 'trial',
    'period_active', active_period,
    'period_expired', expired,
    'trial_days_remaining', days_left,
    'has_access_period', has_period,
    'unlimited_access', unlimited,
    'days_past_expiry', days_past,
    'grace_active', grace_active,
    'grace_days_left', grace_days_left,
    'lock_active', lock_active,
    'lock_days_left', lock_days_left,
    'lock_starts_at', lock_at,
    'should_auto_disable', should_disable,
    'access_disable_at', disable_at,
    'access_grace_warned_at', u.access_grace_warned_at,
    'access_disabled_for_expiry_at', u.access_disabled_for_expiry_at,
    -- Grace keeps normal workspace access; lock/disable revoke data access
    'data_access_allowed', unlimited or active_period or grace_active
  );
end;
$$;

-- ── Enforce: warn near end of grace, disable after grace + 1-day lock ────────
create or replace function public.app_enforce_access_expiry(p_user_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r public.app_users;
  flags jsonb;
  days_past numeric;
begin
  for r in
    select *
    from public.app_users u
    where coalesce(u.is_protected, false) = false
      and u.trial_expires_at is not null
      and (p_user_id is null or u.id = p_user_id)
  loop
    flags := public.app_user_access_flags(r);
    days_past := coalesce((flags->>'days_past_expiry')::numeric, 0);

    -- Once near end of grace (day 2): warn admins once
    if coalesce((flags->>'period_expired')::boolean, false)
       and coalesce((flags->>'grace_active')::boolean, false)
       and days_past >= 2
       and r.access_grace_warned_at is null then
      update public.app_users
      set access_grace_warned_at = now(), updated_at = now()
      where id = r.id;

      perform public.app_notify_admins(
        'access_expiry_warning',
        'Access grace warning',
        format(
          'User "%s" access expired %s day(s) ago. After the grace period a 1-day lock applies, then auto-disable on %s unless renewed.',
          coalesce(r.username, 'unknown'),
          floor(days_past)::text,
          to_char((r.trial_expires_at + interval '4 days') at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"')
        ),
        r.id,
        null,
        jsonb_build_object(
          'username', r.username,
          'display_name', r.display_name,
          'trial_expires_at', r.trial_expires_at,
          'days_past_expiry', days_past,
          'lock_starts_at', r.trial_expires_at + interval '3 days',
          'access_disable_at', r.trial_expires_at + interval '4 days'
        )
      );
    end if;

    -- After grace + 1-day lock: auto-disable (never touches protected admins)
    if coalesce((flags->>'should_auto_disable')::boolean, false)
       and coalesce(r.is_active, true) then
      update public.app_users set
        is_active = false,
        access_disabled_for_expiry_at = coalesce(access_disabled_for_expiry_at, now()),
        updated_at = now()
      where id = r.id
        and coalesce(is_protected, false) = false;

      update public.app_sessions
      set revoked_at = now()
      where user_id = r.id and revoked_at is null;

      perform public.app_notify_admins(
        'access_auto_disabled',
        'Account auto-disabled (expired)',
        format(
          'User "%s" was disabled after the grace period and 1-day lock past %s.',
          coalesce(r.username, 'unknown'),
          coalesce(to_char(r.trial_expires_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"'), 'unknown')
        ),
        r.id,
        null,
        jsonb_build_object(
          'username', r.username,
          'display_name', r.display_name,
          'trial_expires_at', r.trial_expires_at,
          'days_past_expiry', days_past
        )
      );
    end if;
  end loop;
end;
$$;

-- ── Session create with Remember Me TTL ─────────────────────────────────────
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'app_create_session'
  loop
    execute 'drop function if exists ' || r.sig;
  end loop;
end $$;

create or replace function public.app_create_session(
  p_user_id uuid,
  p_user_agent text default null,
  p_ip text default null,
  p_remember boolean default true
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  raw_token text;
  persistent boolean := coalesce(p_remember, true);
  sess_ttl interval := case when coalesce(p_remember, true)
    then interval '14 days'
    else interval '12 hours'
  end;
begin
  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.app_sessions (
    user_id, token_hash, expires_at, user_agent, ip_text, is_persistent
  )
  values (
    p_user_id,
    public.app_hash_token(raw_token),
    now() + sess_ttl,
    left(coalesce(p_user_agent, ''), 500),
    left(coalesce(p_ip, ''), 100),
    persistent
  );
  return raw_token;
end;
$$;

-- ── Login with optional Remember Me ─────────────────────────────────────────
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'app_login'
  loop
    execute 'drop function if exists ' || r.sig;
  end loop;
end $$;

create or replace function public.app_login(
  p_username text,
  p_password text,
  p_user_agent text default null,
  p_ip text default null,
  p_remember boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  u public.app_users;
  token text;
  weak boolean;
begin
  if p_username is null or trim(p_username) = '' then
    raise exception 'Username is required';
  end if;
  if p_password is null or p_password = '' then
    raise exception 'Password is required';
  end if;

  select * into u
  from public.app_users
  where lower(username) = lower(trim(p_username))
  limit 1;

  if u is null or u.password_hash <> extensions.crypt(p_password, u.password_hash) then
    raise exception 'Invalid username or password';
  end if;

  if u.id is not null then
    perform public.app_enforce_access_expiry(u.id);
    select * into u from public.app_users where id = u.id;
  end if;

  if not u.is_active then
    if u.access_disabled_for_expiry_at is not null then
      raise exception 'Account is disabled because the access period expired. Contact the administrator to renew.';
    end if;
    raise exception 'Account is disabled';
  end if;

  weak := not public.app_password_meets_policy(p_password);

  token := public.app_create_session(u.id, p_user_agent, p_ip, coalesce(p_remember, true));

  update public.app_users
  set
    last_login_at = now(),
    updated_at = now(),
    password_is_weak = weak
  where id = u.id;

  select * into u from public.app_users where id = u.id;
  u.last_login_at := now();

  return jsonb_build_object(
    'session_token', token,
    'user', public.app_user_public_profile(u, false)
  );
end;
$$;

-- ── Validate: slide long sessions only when Remember Me ─────────────────────
create or replace function public.app_validate_session()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  sess public.app_sessions := public.current_app_session();
  u public.app_users;
begin
  if sess is null then
    raise exception 'Session expired or invalid';
  end if;

  if coalesce(sess.is_persistent, true) then
    update public.app_sessions
    set last_seen_at = now(),
        expires_at = greatest(expires_at, now() + interval '14 days')
    where id = sess.id;
  else
    -- Browser session: touch last_seen only; do not extend past original short TTL
    update public.app_sessions
    set last_seen_at = now()
    where id = sess.id;
  end if;

  select * into u from public.app_users where id = sess.user_id;
  if u is null then
    update public.app_sessions set revoked_at = now() where id = sess.id;
    raise exception 'Account is disabled';
  end if;

  perform public.app_enforce_access_expiry(u.id);
  select * into u from public.app_users where id = u.id;

  if not u.is_active then
    update public.app_sessions set revoked_at = now() where id = sess.id and revoked_at is null;
    if u.access_disabled_for_expiry_at is not null then
      raise exception 'Account is disabled because the access period expired. Contact the administrator to renew.';
    end if;
    raise exception 'Account is disabled';
  end if;

  return jsonb_build_object(
    'session_token', null,
    'user', public.app_user_public_profile(u, false)
  );
end;
$$;

revoke all on function public.app_create_session(uuid, text, text, boolean) from public;
grant execute on function public.app_create_session(uuid, text, text, boolean)
  to authenticated, anon, service_role;

revoke all on function public.app_login(text, text, text, text, boolean) from public;
grant execute on function public.app_login(text, text, text, text, boolean)
  to authenticated, anon, service_role;

revoke all on function public.app_validate_session() from public;
grant execute on function public.app_validate_session() to authenticated, anon, service_role;

revoke all on function public.app_user_access_flags(public.app_users) from public;
grant execute on function public.app_user_access_flags(public.app_users)
  to authenticated, anon, service_role;

revoke all on function public.app_enforce_access_expiry(uuid) from public;
grant execute on function public.app_enforce_access_expiry(uuid)
  to authenticated, anon, service_role;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/064_remember_me_and_grace_lock_disable.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/065_inventory_summary_sell_by_fields.sql
-- ############################################################################

-- ============================================================================
-- 065_inventory_summary_sell_by_fields.sql
-- Additive: expose sell_by + bottle size on inventory summary RPC (cart bottle vs pour).
-- Safe on live DB (no DROP TABLE / TRUNCATE).
-- ============================================================================

create or replace function public.app_list_my_inventory_summaries(
  p_search text default null,
  p_brand text default null,
  p_item_type text default null,
  p_status text default null,
  p_limit int default 500
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  data_owner uuid;
  lim int := greatest(1, least(coalesce(p_limit, 500), 2000));
  q text := lower(trim(coalesce(p_search, '')));
  brand_q text := lower(trim(coalesce(p_brand, '')));
  type_q text := lower(trim(coalesce(p_item_type, '')));
  status_q text := lower(trim(coalesce(p_status, '')));
  items jsonb := '[]'::jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  data_owner := coalesce(public.app_data_owner_id(), uid);

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.bought_date desc nulls last, x.item_name), '[]'::jsonb)
  into items
  from (
    select
      gi.id,
      gi.group_id::text as group_id,
      gi.item_name,
      gi.currency,
      gi.unit_actual_price,
      gi.bought_qty,
      gi.total_actual_price,
      gi.bought_date,
      gi.item_code,
      gi.notes,
      gi.brand,
      gi.variant_label,
      gi.brand_id,
      gi.variant_id,
      coalesce(nullif(gi.product_line, ''), public.app_note_meta_value(gi.notes, 'PLINE'), '') as product_line,
      gi.product_line_id,
      coalesce(nullif(gi.category_slug, ''), public.app_note_meta_value(gi.notes, 'CSLUG'), '') as category_slug,
      coalesce(nullif(gi.item_category, ''), public.app_note_meta_value(gi.notes, 'UCAT'), 'count') as item_category,
      coalesce(nullif(gi.quantity_unit, ''), public.app_note_meta_value(gi.notes, 'UOM'), 'item') as quantity_unit,
      coalesce(
        nullif(gi.sell_by, ''),
        nullif(public.app_note_meta_value(gi.notes, 'SELLBY'), '')
      ) as sell_by,
      coalesce(
        gi.bottle_size_qty,
        nullif(public.app_note_meta_value(gi.notes, 'BSIZE'), '')::numeric
      ) as bottle_size_qty,
      coalesce(
        nullif(gi.bottle_size_unit, ''),
        nullif(public.app_note_meta_value(gi.notes, 'BUNIT'), '')
      ) as bottle_size_unit,
      coalesce(nullif(public.app_note_meta_value(gi.notes, 'ITYPE'), ''), 'General') as item_type,
      coalesce(nullif(public.app_note_meta_value(gi.notes, 'IDESC'), ''), '') as item_description,
      coalesce(nullif(public.app_note_meta_value(gi.notes, 'USP'), '')::numeric, 0) as unit_sold_price,
      coalesce(s.sold_qty, 0)::numeric as sold_qty,
      coalesce(s.sold_total, 0)::numeric as sold_total,
      greatest(gi.bought_qty - coalesce(s.sold_qty, 0), 0)::numeric as remaining_qty,
      case
        when greatest(gi.bought_qty - coalesce(s.sold_qty, 0), 0) <= 0.00000001 then 'Sold'
        when coalesce(s.sold_qty, 0) > 0 then 'Partial'
        else 'In Stock'
      end as stock_status,
      gi.created_at,
      gi.updated_at
    from public.goods_items gi
    left join lateral (
      select
        coalesce(sum(gs.sold_qty), 0) as sold_qty,
        coalesce(sum(gs.total_sold_price), 0) as sold_total
      from public.goods_sales gs
      where gs.owner_id = data_owner
        and gs.group_id = gi.group_id
        and coalesce(gs.is_deleted, false) = false
    ) s on true
    where gi.owner_id = data_owner
      and coalesce(gi.is_deleted, false) = false
      and (
        q = ''
        or lower(coalesce(gi.item_name, '')) like '%' || q || '%'
        or lower(coalesce(gi.brand, '')) like '%' || q || '%'
        or lower(coalesce(gi.variant_label, '')) like '%' || q || '%'
        or lower(coalesce(gi.product_line, '')) like '%' || q || '%'
        or lower(coalesce(gi.item_code, '')) like '%' || q || '%'
        or lower(coalesce(gi.notes, '')) like '%' || q || '%'
        or lower(coalesce(public.app_note_meta_value(gi.notes, 'ITYPE'), '')) like '%' || q || '%'
        or lower(coalesce(public.app_note_meta_value(gi.notes, 'PLINE'), '')) like '%' || q || '%'
      )
      and (brand_q = '' or brand_q = 'all' or lower(coalesce(gi.brand, '')) = brand_q)
      and (type_q = '' or type_q = 'all' or lower(coalesce(public.app_note_meta_value(gi.notes, 'ITYPE'), 'general')) = type_q)
      and (
        status_q = '' or status_q = 'all'
        or (status_q in ('open', 'in stock', 'instock') and greatest(gi.bought_qty - coalesce(s.sold_qty, 0), 0) > 0.00000001)
        or (status_q in ('closed', 'sold') and greatest(gi.bought_qty - coalesce(s.sold_qty, 0), 0) <= 0.00000001)
        or (
          status_q in ('lowstock', 'low stock')
          and greatest(gi.bought_qty - coalesce(s.sold_qty, 0), 0) > 0.00000001
          and gi.bought_qty > 0
          and (greatest(gi.bought_qty - coalesce(s.sold_qty, 0), 0) / gi.bought_qty) <= 0.15
        )
      )
    order by gi.bought_date desc nulls last, gi.item_name
    limit lim
  ) x;

  return jsonb_build_object('ok', true, 'items', coalesce(items, '[]'::jsonb));
end;
$$;

revoke all on function public.app_list_my_inventory_summaries(text, text, text, text, int) from public;
grant execute on function public.app_list_my_inventory_summaries(text, text, text, text, int)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/065_inventory_summary_sell_by_fields.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/066_inventory_category_hard_purge_owner_fix.sql
-- ############################################################################

-- ============================================================================
-- 066_inventory_category_hard_purge_owner_fix.sql
-- Additive: harden category hard-purge to use data-owner scope and wipe all nested rows.
-- Safe on live DB (CREATE OR REPLACE only; no DROP TABLE / TRUNCATE).
-- ============================================================================

create or replace function public.app_hard_delete_goods_groups(p_group_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  data_owner uuid;
  n int := 0;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  data_owner := coalesce(public.app_data_owner_id(), uid);
  if p_group_ids is null or cardinality(p_group_ids) = 0 then
    return 0;
  end if;

  delete from public.goods_sales
  where owner_id = data_owner and group_id = any(p_group_ids);

  delete from public.goods_events
  where owner_id = data_owner and group_id = any(p_group_ids);

  delete from public.goods_items
  where owner_id = data_owner and group_id = any(p_group_ids);

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.app_hard_delete_goods_groups(uuid[]) from public;
grant execute on function public.app_hard_delete_goods_groups(uuid[]) to authenticated, service_role;

create or replace function public.app_delete_goods_category(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  data_owner uuid;
  cat_name text := '';
  cat_slug text := '';
  gids uuid[] := '{}';
  brand_ids uuid[] := '{}';
  line_ids uuid[] := '{}';
  deleted_items int := 0;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_id is null then raise exception 'Category is required'; end if;
  data_owner := coalesce(public.app_data_owner_id(), uid);

  select c.name, c.slug
  into cat_name, cat_slug
  from public.goods_category_config c
  where c.id = p_id and c.owner_id = data_owner;

  -- Fallback: row owned by session user (solo accounts)
  if cat_name is null then
    select c.name, c.slug
    into cat_name, cat_slug
    from public.goods_category_config c
    where c.id = p_id and c.owner_id = uid;
  end if;

  if cat_name is null then
    return jsonb_build_object('ok', true, 'id', p_id, 'deleted_items', 0);
  end if;

  -- Brands tied by item_type name/slug (active or already soft-deleted).
  select coalesce(array_agg(distinct b.id), '{}')
  into brand_ids
  from public.goods_brands b
  where b.owner_id = data_owner
    and (
      lower(trim(coalesce(b.item_type, ''))) = lower(trim(cat_name))
      or lower(trim(coalesce(b.item_type, ''))) = lower(trim(cat_slug))
    );

  -- Stock groups: by brand, category slug, ITYPE/CSLUG notes, or denorm columns.
  select coalesce(array_agg(distinct gi.group_id), '{}')
  into gids
  from public.goods_items gi
  where gi.owner_id = data_owner
    and (
      (cardinality(brand_ids) > 0 and gi.brand_id = any(brand_ids))
      or lower(trim(coalesce(gi.category_slug, ''))) = lower(trim(cat_slug))
      or lower(trim(coalesce(public.app_note_meta_value(gi.notes, 'ITYPE'), ''))) = lower(trim(cat_name))
      or lower(trim(coalesce(public.app_note_meta_value(gi.notes, 'CSLUG'), ''))) = lower(trim(cat_slug))
      or lower(trim(coalesce(public.app_note_meta_value(gi.notes, 'ITYPE'), ''))) = lower(trim(cat_slug))
    );

  -- Also collect brands that only appear via stock rows in this category.
  select coalesce(array_agg(distinct x.id), brand_ids)
  into brand_ids
  from (
    select unnest(brand_ids) as id
    union
    select distinct gi.brand_id
    from public.goods_items gi
    where gi.owner_id = data_owner
      and gi.brand_id is not null
      and gi.group_id = any(gids)
  ) x
  where x.id is not null;

  -- Product lines under those brands
  select coalesce(array_agg(distinct pl.id), '{}')
  into line_ids
  from public.goods_product_lines pl
  where pl.owner_id = data_owner
    and cardinality(brand_ids) > 0
    and pl.brand_id = any(brand_ids);

  deleted_items := public.app_hard_delete_goods_groups(gids);

  if cardinality(brand_ids) > 0 or cardinality(line_ids) > 0 then
    delete from public.goods_brand_variants
    where owner_id = data_owner
      and (
        (cardinality(brand_ids) > 0 and brand_id = any(brand_ids))
        or (cardinality(line_ids) > 0 and product_line_id = any(line_ids))
      );

    delete from public.goods_product_lines
    where owner_id = data_owner
      and (
        (cardinality(brand_ids) > 0 and brand_id = any(brand_ids))
        or id = any(line_ids)
      );

    delete from public.goods_sub_brands
    where owner_id = data_owner
      and cardinality(brand_ids) > 0
      and brand_id = any(brand_ids);

    delete from public.goods_brands
    where owner_id = data_owner
      and cardinality(brand_ids) > 0
      and id = any(brand_ids);
  end if;

  delete from public.goods_category_config
  where id = p_id
    and owner_id in (data_owner, uid);

  return jsonb_build_object(
    'ok', true,
    'id', p_id,
    'name', cat_name,
    'slug', cat_slug,
    'deleted_items', deleted_items,
    'hard_purge', true
  );
end;
$$;

revoke all on function public.app_delete_goods_category(uuid) from public;
grant execute on function public.app_delete_goods_category(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/066_inventory_category_hard_purge_owner_fix.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/067_inventory_category_visibility_and_tombstones.sql
-- ############################################################################

-- ============================================================================
-- 067_inventory_category_visibility_and_tombstones.sql
-- Additive: activate hidden preset grids without duplicate category rows, and
-- retain a deleted-category tombstone so list calls never re-seed it.
-- Category contents remain a true hard purge.
-- ============================================================================

-- Hard-purge every domain and legacy-ledger row belonging to stock groups.
create or replace function public.app_hard_delete_goods_groups(p_group_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  data_owner uuid;
  n int := 0;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  data_owner := coalesce(public.app_data_owner_id(), uid);
  if p_group_ids is null or cardinality(p_group_ids) = 0 then
    return 0;
  end if;

  delete from public.goods_sales
  where owner_id = data_owner and group_id = any(p_group_ids);

  delete from public.goods_events
  where owner_id = data_owner and group_id = any(p_group_ids);

  delete from public.goods_items
  where owner_id = data_owner and group_id = any(p_group_ids);

  delete from public.loan_ledger_entries
  where owner_id = data_owner and group_id = any(p_group_ids);

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.app_hard_delete_goods_groups(uuid[]) from public;
grant execute on function public.app_hard_delete_goods_groups(uuid[]) to authenticated, service_role;

-- List active categories. Defaults are seeded only when there has never been a
-- row for that owner/slug; an is_deleted tombstone deliberately blocks reseeding.
create or replace function public.app_list_my_goods_categories()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  data_owner uuid;
  items jsonb := '[]'::jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  data_owner := coalesce(public.app_data_owner_id(), uid);

  insert into public.goods_category_config (
    owner_id, name, slug, uses_brands, uses_product_lines, uses_variants,
    qty_pattern, sort_order, hint, meta
  )
  select
    data_owner, c.name, c.slug, c.uses_brands, c.uses_product_lines,
    c.uses_variants, c.qty_pattern, c.sort_order, c.hint,
    jsonb_build_object('preset', true, 'grid_visible', false)
  from (
    values
      ('Electronics', 'electronics', true, true, true, 'count', 10, 'Brand → Type → Variant'),
      ('Perfumes', 'perfumes', true, true, true, 'volume', 20, 'Brand → Fragrance → Size'),
      ('Liquids', 'liquids', true, true, true, 'volume', 30, 'Brand → Product → Volume'),
      ('Food & Grocery', 'food-grocery', true, false, true, 'weight', 40, 'Brand → Pack / weight'),
      ('Clothing', 'clothing', true, true, true, 'count', 50, 'Brand → Style → Size/Color'),
      ('Hardware', 'hardware', true, true, true, 'count', 60, 'Brand → Product → Spec'),
      ('Tools', 'tools', true, true, true, 'count', 70, 'Brand → Tool → Spec'),
      ('Stationery', 'stationery', true, false, true, 'count', 80, 'Brand → Item'),
      ('Furniture', 'furniture', true, true, true, 'count', 90, 'Brand → Piece → Finish'),
      ('Cables & Pipes', 'cables-pipes', true, true, true, 'length', 100, 'Brand → Type → Length'),
      ('General', 'general', false, false, false, 'count', 999, 'Simple item')
  ) as c(name, slug, uses_brands, uses_product_lines, uses_variants, qty_pattern, sort_order, hint)
  where not exists (
    select 1
    from public.goods_category_config g
    where g.owner_id = data_owner
      and lower(g.slug) = lower(c.slug)
  );

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.sort_order, lower(x.name)), '[]'::jsonb)
  into items
  from (
    select
      id, name, slug, uses_brands, uses_product_lines, uses_variants,
      qty_pattern, sort_order, hint, meta, created_at, updated_at,
      case
        when lower(coalesce(meta ->> 'grid_visible', 'false')) in ('true', '1', 'yes') then true
        else false
      end as grid_visible
    from public.goods_category_config
    where owner_id = data_owner
      and coalesce(is_deleted, false) = false
  ) x;

  return jsonb_build_object('ok', true, 'items', coalesce(items, '[]'::jsonb));
end;
$$;

revoke all on function public.app_list_my_goods_categories() from public;
grant execute on function public.app_list_my_goods_categories() to authenticated, anon, service_role;

-- Upsert by active OR tombstoned name/slug. This reactivates an explicitly
-- re-added grid and marks it visible, preventing duplicate-key failures.
create or replace function public.app_upsert_goods_category(
  p_id uuid default null,
  p_name text default '',
  p_slug text default '',
  p_uses_brands boolean default true,
  p_uses_product_lines boolean default true,
  p_uses_variants boolean default true,
  p_qty_pattern text default 'count',
  p_sort_order int default 0,
  p_hint text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  data_owner uuid;
  nm text := left(trim(coalesce(p_name, '')), 80);
  sl text := left(trim(coalesce(nullif(p_slug, ''), lower(regexp_replace(nm, '[^a-zA-Z0-9]+', '-', 'g')))), 80);
  pattern text := lower(trim(coalesce(p_qty_pattern, 'count')));
  row public.goods_category_config;
  old_name text;
  old_slug text;
  target_id uuid := p_id;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if nm = '' then raise exception 'Category name is required'; end if;
  data_owner := coalesce(public.app_data_owner_id(), uid);
  if pattern not in ('count', 'weight', 'length', 'volume') then pattern := 'count'; end if;
  sl := lower(regexp_replace(sl, '[^a-z0-9]+', '-', 'g'));
  sl := trim(both '-' from sl);
  if sl = '' then sl := 'general'; end if;

  if target_id is not null then
    select * into row
    from public.goods_category_config c
    where c.id = target_id
      and c.owner_id in (data_owner, uid)
    limit 1;
    if row.id is null then
      target_id := null;
    else
      target_id := row.id;
    end if;
  end if;

  if target_id is null then
    select c.id into target_id
    from public.goods_category_config c
    where c.owner_id in (data_owner, uid)
      and (
        lower(c.name) = lower(nm)
        or lower(c.slug) = lower(sl)
      )
    order by coalesce(c.is_deleted, false) asc, c.updated_at desc nulls last
    limit 1;
  end if;

  if target_id is null then
    insert into public.goods_category_config (
      owner_id, name, slug, uses_brands, uses_product_lines, uses_variants,
      qty_pattern, sort_order, hint, meta
    ) values (
      data_owner, nm, sl, coalesce(p_uses_brands, true),
      coalesce(p_uses_product_lines, true), coalesce(p_uses_variants, true),
      pattern, coalesce(p_sort_order, 0), nullif(trim(coalesce(p_hint, '')), ''),
      jsonb_build_object('grid_visible', true)
    )
    returning * into row;
  else
    select * into row
    from public.goods_category_config c
    where c.id = target_id
      and c.owner_id in (data_owner, uid)
    for update;
    if row.id is null then raise exception 'Category not found'; end if;

    old_name := row.name;
    old_slug := row.slug;

    if exists (
      select 1
      from public.goods_category_config c
      where c.owner_id = row.owner_id
        and c.id <> row.id
        and coalesce(c.is_deleted, false) = false
        and lower(c.slug) = lower(sl)
    ) then
      raise exception 'Category slug "%" is already in use. Choose a different name.', sl;
    end if;

    update public.goods_category_config
    set
      name = nm,
      slug = sl,
      uses_brands = coalesce(p_uses_brands, uses_brands),
      uses_product_lines = coalesce(p_uses_product_lines, uses_product_lines),
      uses_variants = coalesce(p_uses_variants, uses_variants),
      qty_pattern = pattern,
      sort_order = coalesce(p_sort_order, sort_order),
      hint = nullif(trim(coalesce(p_hint, '')), ''),
      meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('grid_visible', true),
      is_deleted = false,
      updated_at = now()
    where id = row.id
    returning * into row;

    if old_name is distinct from nm or old_slug is distinct from sl then
      update public.goods_items gi
      set
        category_slug = sl,
        notes = public.app_note_meta_set(
          public.app_note_meta_set(gi.notes, 'ITYPE', nm),
          'CSLUG',
          sl
        ),
        updated_at = now()
      where gi.owner_id = row.owner_id
        and coalesce(gi.is_deleted, false) = false
        and (
          lower(coalesce(gi.category_slug, '')) = lower(coalesce(old_slug, ''))
          or lower(coalesce(public.app_note_meta_value(gi.notes, 'CSLUG'), '')) = lower(coalesce(old_slug, ''))
          or lower(coalesce(public.app_note_meta_value(gi.notes, 'ITYPE'), '')) = lower(coalesce(old_name, ''))
        );

      update public.goods_brands b
      set item_type = nm, updated_at = now()
      where b.owner_id = row.owner_id
        and coalesce(b.is_deleted, false) = false
        and lower(coalesce(b.item_type, '')) = lower(coalesce(old_name, ''));

      update public.goods_product_lines pl
      set category_name = nm, updated_at = now()
      where pl.owner_id = row.owner_id
        and coalesce(pl.is_deleted, false) = false
        and lower(coalesce(pl.category_name, '')) = lower(coalesce(old_name, ''));

      update public.loan_ledger_entries e
      set
        notes = public.app_note_meta_set(
          public.app_note_meta_set(e.notes, 'ITYPE', nm),
          'CSLUG',
          sl
        ),
        updated_at = now()
      where e.owner_id = row.owner_id
        and coalesce(e.notes, '') ilike '%[GOODS]%'
        and (
          lower(coalesce(public.app_note_meta_value(e.notes, 'CSLUG'), '')) = lower(coalesce(old_slug, ''))
          or lower(coalesce(public.app_note_meta_value(e.notes, 'ITYPE'), '')) = lower(coalesce(old_name, ''))
        );
    end if;
  end if;

  return jsonb_build_object('ok', true, 'item', row_to_json(row)::jsonb);
end;
$$;

revoke all on function public.app_upsert_goods_category(uuid, text, text, boolean, boolean, boolean, text, int, text) from public;
grant execute on function public.app_upsert_goods_category(uuid, text, text, boolean, boolean, boolean, text, int, text) to authenticated, anon, service_role;

-- Purge category contents, then keep only an is_deleted configuration tombstone.
-- The tombstone prevents app_list_my_goods_categories from recreating a deleted preset.
create or replace function public.app_delete_goods_category(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  data_owner uuid;
  category_owner uuid;
  cat_name text := '';
  cat_slug text := '';
  gids uuid[] := '{}';
  brand_ids uuid[] := '{}';
  line_ids uuid[] := '{}';
  deleted_items int := 0;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_id is null then raise exception 'Category is required'; end if;
  data_owner := coalesce(public.app_data_owner_id(), uid);

  select c.owner_id, c.name, c.slug
  into category_owner, cat_name, cat_slug
  from public.goods_category_config c
  where c.id = p_id
    and c.owner_id in (data_owner, uid)
    and coalesce(c.is_deleted, false) = false;

  if cat_name is null then
    return jsonb_build_object('ok', true, 'id', p_id, 'deleted_items', 0, 'hard_purge', true);
  end if;

  select coalesce(array_agg(distinct b.id), '{}')
  into brand_ids
  from public.goods_brands b
  where b.owner_id = category_owner
    and (
      lower(trim(coalesce(b.item_type, ''))) = lower(trim(cat_name))
      or lower(trim(coalesce(b.item_type, ''))) = lower(trim(cat_slug))
    );

  select coalesce(array_agg(distinct src.group_id), '{}')
  into gids
  from (
    select gi.group_id
    from public.goods_items gi
    where gi.owner_id = category_owner
      and (
        (cardinality(brand_ids) > 0 and gi.brand_id = any(brand_ids))
        or lower(trim(coalesce(gi.category_slug, ''))) = lower(trim(cat_slug))
        or lower(trim(coalesce(public.app_note_meta_value(gi.notes, 'ITYPE'), ''))) = lower(trim(cat_name))
        or lower(trim(coalesce(public.app_note_meta_value(gi.notes, 'CSLUG'), ''))) = lower(trim(cat_slug))
      )
    union
    select ge.group_id
    from public.goods_events ge
    where ge.owner_id = category_owner
      and (
        lower(trim(coalesce(public.app_note_meta_value(ge.notes, 'ITYPE'), ''))) = lower(trim(cat_name))
        or lower(trim(coalesce(public.app_note_meta_value(ge.notes, 'CSLUG'), ''))) = lower(trim(cat_slug))
      )
    union
    select gs.group_id
    from public.goods_sales gs
    where gs.owner_id = category_owner
      and (
        lower(trim(coalesce(public.app_note_meta_value(gs.notes, 'ITYPE'), ''))) = lower(trim(cat_name))
        or lower(trim(coalesce(public.app_note_meta_value(gs.notes, 'CSLUG'), ''))) = lower(trim(cat_slug))
      )
  ) src
  where src.group_id is not null;

  select coalesce(array_agg(distinct x.id), brand_ids)
  into brand_ids
  from (
    select unnest(brand_ids) as id
    union
    select distinct gi.brand_id
    from public.goods_items gi
    where gi.owner_id = category_owner
      and gi.brand_id is not null
      and gi.group_id = any(gids)
  ) x
  where x.id is not null;

  select coalesce(array_agg(distinct pl.id), '{}')
  into line_ids
  from public.goods_product_lines pl
  where pl.owner_id = category_owner
    and cardinality(brand_ids) > 0
    and pl.brand_id = any(brand_ids);

  deleted_items := public.app_hard_delete_goods_groups(gids);

  -- Catch category-tagged orphan rows that did not have a current goods_items row.
  delete from public.goods_sales gs
  where gs.owner_id = category_owner
    and (
      lower(trim(coalesce(public.app_note_meta_value(gs.notes, 'ITYPE'), ''))) = lower(trim(cat_name))
      or lower(trim(coalesce(public.app_note_meta_value(gs.notes, 'CSLUG'), ''))) = lower(trim(cat_slug))
    );

  delete from public.goods_events ge
  where ge.owner_id = category_owner
    and (
      lower(trim(coalesce(public.app_note_meta_value(ge.notes, 'ITYPE'), ''))) = lower(trim(cat_name))
      or lower(trim(coalesce(public.app_note_meta_value(ge.notes, 'CSLUG'), ''))) = lower(trim(cat_slug))
    );

  delete from public.loan_ledger_entries e
  where e.owner_id = category_owner
    and coalesce(e.notes, '') ilike '%[GOODS]%'
    and (
      lower(trim(coalesce(public.app_note_meta_value(e.notes, 'ITYPE'), ''))) = lower(trim(cat_name))
      or lower(trim(coalesce(public.app_note_meta_value(e.notes, 'CSLUG'), ''))) = lower(trim(cat_slug))
    );

  if cardinality(brand_ids) > 0 or cardinality(line_ids) > 0 then
    delete from public.goods_brand_variants
    where owner_id = category_owner
      and (
        (cardinality(brand_ids) > 0 and brand_id = any(brand_ids))
        or (cardinality(line_ids) > 0 and product_line_id = any(line_ids))
      );

    delete from public.goods_product_lines
    where owner_id = category_owner
      and (
        (cardinality(brand_ids) > 0 and brand_id = any(brand_ids))
        or id = any(line_ids)
      );

    delete from public.goods_sub_brands
    where owner_id = category_owner
      and cardinality(brand_ids) > 0
      and brand_id = any(brand_ids);

    delete from public.goods_brands
    where owner_id = category_owner
      and cardinality(brand_ids) > 0
      and id = any(brand_ids);
  end if;

  update public.goods_category_config
  set
    is_deleted = true,
    meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('grid_visible', false),
    updated_at = now()
  where id = p_id
    and owner_id = category_owner;

  return jsonb_build_object(
    'ok', true,
    'id', p_id,
    'name', cat_name,
    'slug', cat_slug,
    'deleted_items', deleted_items,
    'hard_purge', true,
    'tombstoned', true
  );
end;
$$;

revoke all on function public.app_delete_goods_category(uuid) from public;
grant execute on function public.app_delete_goods_category(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/067_inventory_category_visibility_and_tombstones.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/068_books_taxonomy_and_product_line_delete_fix.sql
-- ############################################################################

-- ============================================================================
-- 068_books_taxonomy_and_product_line_delete_fix.sql
-- Additive: seed Books taxonomy and fix the ambiguous brand_id reference in
-- product-line hard delete. No DROP TABLE or TRUNCATE.
-- ============================================================================

-- Seed the built-in Books category for existing owners without forcing the
-- empty grid visible. It becomes visible when the user explicitly adds Books.
insert into public.goods_category_config (
  owner_id, name, slug, uses_brands, uses_product_lines, uses_variants,
  qty_pattern, sort_order, hint, meta
)
select
  u.id,
  'Books',
  'books',
  true,
  true,
  true,
  'count',
  110,
  'Author → Book title → Edition / Format',
  jsonb_build_object('preset', true, 'grid_visible', false)
from public.app_users u
where coalesce(u.is_active, true) = true
  and not exists (
    select 1
    from public.goods_category_config c
    where c.owner_id = u.id
      and lower(c.slug) = 'books'
  );

-- Include Books for accounts created after this migration too.
create or replace function public.app_list_my_goods_categories()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  data_owner uuid;
  items jsonb := '[]'::jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  data_owner := coalesce(public.app_data_owner_id(), uid);

  insert into public.goods_category_config (
    owner_id, name, slug, uses_brands, uses_product_lines, uses_variants,
    qty_pattern, sort_order, hint, meta
  )
  select
    data_owner, c.name, c.slug, c.uses_brands, c.uses_product_lines,
    c.uses_variants, c.qty_pattern, c.sort_order, c.hint,
    jsonb_build_object('preset', true, 'grid_visible', false)
  from (
    values
      ('Electronics', 'electronics', true, true, true, 'count', 10, 'Brand → Type → Variant'),
      ('Perfumes', 'perfumes', true, true, true, 'volume', 20, 'Brand → Fragrance → Size'),
      ('Liquids', 'liquids', true, true, true, 'volume', 30, 'Brand → Product → Volume'),
      ('Food & Grocery', 'food-grocery', true, false, true, 'weight', 40, 'Brand → Pack / weight'),
      ('Clothing', 'clothing', true, true, true, 'count', 50, 'Brand → Style → Size/Color'),
      ('Hardware', 'hardware', true, true, true, 'count', 60, 'Brand → Product → Spec'),
      ('Tools', 'tools', true, true, true, 'count', 70, 'Brand → Tool → Spec'),
      ('Stationery', 'stationery', true, false, true, 'count', 80, 'Brand → Item'),
      ('Furniture', 'furniture', true, true, true, 'count', 90, 'Brand → Piece → Finish'),
      ('Cables & Pipes', 'cables-pipes', true, true, true, 'length', 100, 'Brand → Type → Length'),
      ('Books', 'books', true, true, true, 'count', 110, 'Author → Book title → Edition / Format'),
      ('General', 'general', false, false, false, 'count', 999, 'Simple item')
  ) as c(name, slug, uses_brands, uses_product_lines, uses_variants, qty_pattern, sort_order, hint)
  where not exists (
    select 1
    from public.goods_category_config g
    where g.owner_id = data_owner
      and lower(g.slug) = lower(c.slug)
  );

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.sort_order, lower(x.name)), '[]'::jsonb)
  into items
  from (
    select
      id, name, slug, uses_brands, uses_product_lines, uses_variants,
      qty_pattern, sort_order, hint, meta, created_at, updated_at,
      case
        when lower(coalesce(meta ->> 'grid_visible', 'false')) in ('true', '1', 'yes') then true
        else false
      end as grid_visible
    from public.goods_category_config
    where owner_id = data_owner
      and coalesce(is_deleted, false) = false
  ) x;

  return jsonb_build_object('ok', true, 'items', coalesce(items, '[]'::jsonb));
end;
$$;

revoke all on function public.app_list_my_goods_categories() from public;
grant execute on function public.app_list_my_goods_categories() to authenticated, anon, service_role;

-- Qualify the line's brand id with v_brand_id. The former unqualified
-- reference collided with goods_items.brand_id and raised an ambiguity error.
create or replace function public.app_delete_goods_product_line(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  data_owner uuid;
  line_owner uuid;
  line_name text := '';
  v_brand_id uuid;
  gids uuid[] := '{}';
  deleted_items int := 0;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_id is null then raise exception 'Product type is required'; end if;
  data_owner := coalesce(public.app_data_owner_id(), uid);

  select pl.owner_id, pl.name, pl.brand_id
  into line_owner, line_name, v_brand_id
  from public.goods_product_lines pl
  where pl.id = p_id
    and pl.owner_id in (data_owner, uid);

  if line_name is null then
    return jsonb_build_object('ok', true, 'id', p_id, 'deleted_items', 0, 'hard_purge', true);
  end if;

  select coalesce(array_agg(distinct gi.group_id), '{}')
  into gids
  from public.goods_items gi
  where gi.owner_id = line_owner
    and (
      gi.product_line_id = p_id
      or (
        v_brand_id is not null
        and gi.brand_id = v_brand_id
        and lower(trim(coalesce(gi.product_line, ''))) = lower(trim(line_name))
      )
      or lower(trim(coalesce(public.app_note_meta_value(gi.notes, 'PLINEID'), ''))) = lower(p_id::text)
      or lower(trim(coalesce(public.app_note_meta_value(gi.notes, 'PLINE'), ''))) = lower(trim(line_name))
    );

  deleted_items := public.app_hard_delete_goods_groups(gids);

  delete from public.goods_brand_variants
  where owner_id = line_owner
    and product_line_id = p_id;

  delete from public.goods_product_lines
  where id = p_id
    and owner_id = line_owner;

  return jsonb_build_object(
    'ok', true,
    'id', p_id,
    'name', line_name,
    'deleted_items', deleted_items,
    'hard_purge', true
  );
end;
$$;

revoke all on function public.app_delete_goods_product_line(uuid) from public;
grant execute on function public.app_delete_goods_product_line(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/068_books_taxonomy_and_product_line_delete_fix.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/069_installment_down_payment.sql
-- ############################################################################

-- ============================================================================
-- 069_installment_down_payment.sql
-- Additive: persist optional installment-plan down payment and financed amount.
-- No DROP TABLE, TRUNCATE, or data reset.
-- ============================================================================

alter table public.installment_plans
  add column if not exists down_payment_amount numeric not null default 0;

alter table public.installment_plans
  add column if not exists financed_amount numeric;

comment on column public.installment_plans.down_payment_amount is
  'Optional payment made at plan creation; excluded from monthly installment slots.';

comment on column public.installment_plans.financed_amount is
  'Plan total less down payment; this amount is distributed across monthly installments.';

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/069_installment_down_payment.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/070_inventory_category_taxonomy_meta.sql
-- ############################################################################

-- Additive: store category taxonomy labels/examples in goods_category_config.meta.taxonomy
-- and accept optional p_taxonomy on upsert. Safe for live DBs (no DROP / truncate).

-- Prefer a single 10-arg signature (p_taxonomy default null) so PostgREST named calls stay stable.
drop function if exists public.app_upsert_goods_category(uuid, text, text, boolean, boolean, boolean, text, int, text);

create or replace function public.app_upsert_goods_category(
  p_id uuid default null,
  p_name text default '',
  p_slug text default '',
  p_uses_brands boolean default true,
  p_uses_product_lines boolean default true,
  p_uses_variants boolean default true,
  p_qty_pattern text default 'count',
  p_sort_order int default 0,
  p_hint text default null,
  p_taxonomy jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_app_user_id();
  data_owner uuid;
  nm text := left(trim(coalesce(p_name, '')), 80);
  sl text := left(trim(coalesce(nullif(p_slug, ''), lower(regexp_replace(nm, '[^a-zA-Z0-9]+', '-', 'g')))), 80);
  pattern text := lower(trim(coalesce(p_qty_pattern, 'count')));
  row public.goods_category_config;
  old_name text;
  old_slug text;
  target_id uuid := p_id;
  tax jsonb := case
    when p_taxonomy is null or jsonb_typeof(p_taxonomy) <> 'object' then null
    else p_taxonomy
  end;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if nm = '' then raise exception 'Category name is required'; end if;
  data_owner := coalesce(public.app_data_owner_id(), uid);
  if pattern not in ('count', 'weight', 'length', 'volume') then pattern := 'count'; end if;
  sl := lower(regexp_replace(sl, '[^a-z0-9]+', '-', 'g'));
  sl := trim(both '-' from sl);
  if sl = '' then sl := 'general'; end if;

  if target_id is not null then
    select * into row
    from public.goods_category_config c
    where c.id = target_id
      and c.owner_id in (data_owner, uid)
    limit 1;
    if row.id is null then
      target_id := null;
    else
      target_id := row.id;
    end if;
  end if;

  if target_id is null then
    select c.id into target_id
    from public.goods_category_config c
    where c.owner_id in (data_owner, uid)
      and (
        lower(c.name) = lower(nm)
        or lower(c.slug) = lower(sl)
      )
    order by coalesce(c.is_deleted, false) asc, c.updated_at desc nulls last
    limit 1;
  end if;

  if target_id is null then
    insert into public.goods_category_config (
      owner_id, name, slug, uses_brands, uses_product_lines, uses_variants,
      qty_pattern, sort_order, hint, meta
    ) values (
      data_owner, nm, sl, coalesce(p_uses_brands, true),
      coalesce(p_uses_product_lines, true), coalesce(p_uses_variants, true),
      pattern, coalesce(p_sort_order, 0), nullif(trim(coalesce(p_hint, '')), ''),
      jsonb_build_object('grid_visible', true)
        || case when tax is null then '{}'::jsonb else jsonb_build_object('taxonomy', tax) end
    )
    returning * into row;
  else
    select * into row
    from public.goods_category_config c
    where c.id = target_id
      and c.owner_id in (data_owner, uid)
    for update;
    if row.id is null then raise exception 'Category not found'; end if;

    old_name := row.name;
    old_slug := row.slug;

    if exists (
      select 1
      from public.goods_category_config c
      where c.owner_id = row.owner_id
        and c.id <> row.id
        and coalesce(c.is_deleted, false) = false
        and lower(c.slug) = lower(sl)
    ) then
      raise exception 'Category slug "%" is already in use. Choose a different name.', sl;
    end if;

    update public.goods_category_config
    set
      name = nm,
      slug = sl,
      uses_brands = coalesce(p_uses_brands, uses_brands),
      uses_product_lines = coalesce(p_uses_product_lines, uses_product_lines),
      uses_variants = coalesce(p_uses_variants, uses_variants),
      qty_pattern = pattern,
      sort_order = coalesce(p_sort_order, sort_order),
      hint = nullif(trim(coalesce(p_hint, '')), ''),
      meta = coalesce(meta, '{}'::jsonb)
        || jsonb_build_object('grid_visible', true)
        || case when tax is null then '{}'::jsonb else jsonb_build_object('taxonomy', tax) end,
      is_deleted = false,
      updated_at = now()
    where id = row.id
    returning * into row;

    if old_name is distinct from nm or old_slug is distinct from sl then
      update public.goods_items gi
      set
        category_slug = sl,
        notes = public.app_note_meta_set(
          public.app_note_meta_set(gi.notes, 'ITYPE', nm),
          'CSLUG',
          sl
        ),
        updated_at = now()
      where gi.owner_id = row.owner_id
        and coalesce(gi.is_deleted, false) = false
        and (
          lower(coalesce(gi.category_slug, '')) = lower(coalesce(old_slug, ''))
          or lower(coalesce(public.app_note_meta_value(gi.notes, 'CSLUG'), '')) = lower(coalesce(old_slug, ''))
          or lower(coalesce(public.app_note_meta_value(gi.notes, 'ITYPE'), '')) = lower(coalesce(old_name, ''))
        );

      update public.goods_brands gb
      set
        item_type = nm,
        updated_at = now()
      where gb.owner_id = row.owner_id
        and lower(trim(coalesce(gb.item_type, ''))) = lower(trim(coalesce(old_name, '')));

      update public.goods_events e
      set
        notes = public.app_note_meta_set(
          public.app_note_meta_set(e.notes, 'ITYPE', nm),
          'CSLUG',
          sl
        ),
        updated_at = now()
      where e.owner_id = row.owner_id
        and coalesce(e.is_deleted, false) = false
        and (
          lower(coalesce(public.app_note_meta_value(e.notes, 'CSLUG'), '')) = lower(coalesce(old_slug, ''))
          or lower(coalesce(public.app_note_meta_value(e.notes, 'ITYPE'), '')) = lower(coalesce(old_name, ''))
        );
    end if;
  end if;

  return jsonb_build_object('ok', true, 'id', row.id, 'item', to_jsonb(row));
end;
$$;

revoke all on function public.app_upsert_goods_category(uuid, text, text, boolean, boolean, boolean, text, int, text, jsonb) from public;
grant execute on function public.app_upsert_goods_category(uuid, text, text, boolean, boolean, boolean, text, int, text, jsonb) to authenticated, anon, service_role;

-- Backfill taxonomy for known preset slugs when missing.
update public.goods_category_config c
set meta = coalesce(c.meta, '{}'::jsonb) || jsonb_build_object(
  'taxonomy',
  case lower(c.slug)
    when 'electronics' then jsonb_build_object(
      'primaryLabel', 'Brand', 'primaryPlural', 'Brands', 'subBrandLabel', 'Sub-brand',
      'productLineLabel', 'Type', 'productLinePlural', 'types', 'variantLabelName', 'Variant', 'variantPlural', 'variants',
      'hint', 'Brand → Type → Variant (storage / color)', 'breadcrumb', 'Brand → Type → Variant',
      'usesSubBrands', true, 'variantAttrMode', 'storage_color',
      'examples', jsonb_build_object('primary', 'e.g. Device maker', 'subBrand', 'e.g. Pro line', 'productLine', 'e.g. Phone model', 'variant', 'e.g. 256 GB · Black', 'storage', 'e.g. 256 GB', 'color', 'e.g. Black')
    )
    when 'perfumes' then jsonb_build_object(
      'primaryLabel', 'Brand', 'primaryPlural', 'Brands', 'subBrandLabel', 'Sub-brand',
      'productLineLabel', 'Fragrance', 'productLinePlural', 'fragrances', 'variantLabelName', 'Size', 'variantPlural', 'sizes',
      'hint', 'Brand → Fragrance → Size', 'breadcrumb', 'Brand → Fragrance → Size',
      'usesSubBrands', true, 'variantAttrMode', 'none', 'defaultSellBy', 'volume',
      'examples', jsonb_build_object('primary', 'e.g. Fragrance house', 'subBrand', 'e.g. Collection', 'productLine', 'e.g. Scent name', 'variant', 'e.g. 100 ml')
    )
    when 'liquids' then jsonb_build_object(
      'primaryLabel', 'Brand', 'primaryPlural', 'Brands', 'subBrandLabel', 'Sub-brand',
      'productLineLabel', 'Product', 'productLinePlural', 'products', 'variantLabelName', 'Volume', 'variantPlural', 'volumes',
      'hint', 'Brand → Product → Volume', 'breadcrumb', 'Brand → Product → Volume',
      'usesSubBrands', true, 'variantAttrMode', 'none', 'defaultSellBy', 'bottle',
      'examples', jsonb_build_object('primary', 'e.g. Maker name', 'subBrand', 'e.g. Range', 'productLine', 'e.g. Drink / oil name', 'variant', 'e.g. 1 L bottle')
    )
    when 'food-grocery' then jsonb_build_object(
      'primaryLabel', 'Brand', 'primaryPlural', 'Brands', 'subBrandLabel', 'Sub-brand',
      'productLineLabel', 'Type', 'productLinePlural', 'types', 'variantLabelName', 'Pack', 'variantPlural', 'packs',
      'hint', 'Brand → Pack / weight', 'breadcrumb', 'Brand → Pack',
      'usesSubBrands', false, 'variantAttrMode', 'none',
      'examples', jsonb_build_object('primary', 'e.g. Food brand', 'productLine', 'e.g. Product type', 'variant', 'e.g. 500 g pack')
    )
    when 'clothing' then jsonb_build_object(
      'primaryLabel', 'Brand', 'primaryPlural', 'Brands', 'subBrandLabel', 'Sub-brand',
      'productLineLabel', 'Style', 'productLinePlural', 'styles', 'variantLabelName', 'Size', 'variantPlural', 'sizes',
      'hint', 'Brand → Style → Size / Color', 'breadcrumb', 'Brand → Style → Size',
      'usesSubBrands', true, 'variantAttrMode', 'color_size',
      'examples', jsonb_build_object('primary', 'e.g. Apparel brand', 'subBrand', 'e.g. Line', 'productLine', 'e.g. Shirt style', 'variant', 'e.g. M', 'color', 'e.g. Navy')
    )
    when 'hardware' then jsonb_build_object(
      'primaryLabel', 'Brand', 'primaryPlural', 'Brands', 'subBrandLabel', 'Sub-brand',
      'productLineLabel', 'Product', 'productLinePlural', 'products', 'variantLabelName', 'Spec', 'variantPlural', 'specs',
      'hint', 'Brand → Product → Spec', 'breadcrumb', 'Brand → Product → Spec',
      'usesSubBrands', true, 'variantAttrMode', 'none',
      'examples', jsonb_build_object('primary', 'e.g. Hardware brand', 'subBrand', 'e.g. Series', 'productLine', 'e.g. Fastener type', 'variant', 'e.g. M8 × 40 mm')
    )
    when 'tools' then jsonb_build_object(
      'primaryLabel', 'Brand', 'primaryPlural', 'Brands', 'subBrandLabel', 'Sub-brand',
      'productLineLabel', 'Tool', 'productLinePlural', 'tools', 'variantLabelName', 'Spec', 'variantPlural', 'specs',
      'hint', 'Brand → Tool → Spec', 'breadcrumb', 'Brand → Tool → Spec',
      'usesSubBrands', true, 'variantAttrMode', 'none',
      'examples', jsonb_build_object('primary', 'e.g. Tool brand', 'subBrand', 'e.g. Series', 'productLine', 'e.g. Wrench type', 'variant', 'e.g. 12 mm')
    )
    when 'stationery' then jsonb_build_object(
      'primaryLabel', 'Brand', 'primaryPlural', 'Brands', 'subBrandLabel', 'Sub-brand',
      'productLineLabel', 'Type', 'productLinePlural', 'types', 'variantLabelName', 'Item', 'variantPlural', 'items',
      'hint', 'Brand → Item', 'breadcrumb', 'Brand → Item',
      'usesSubBrands', false, 'variantAttrMode', 'none',
      'examples', jsonb_build_object('primary', 'e.g. Stationery brand', 'productLine', 'e.g. Pen type', 'variant', 'e.g. Blue ink · medium', 'color', 'e.g. Blue')
    )
    when 'furniture' then jsonb_build_object(
      'primaryLabel', 'Brand', 'primaryPlural', 'Brands', 'subBrandLabel', 'Sub-brand',
      'productLineLabel', 'Piece', 'productLinePlural', 'pieces', 'variantLabelName', 'Finish', 'variantPlural', 'finishes',
      'hint', 'Brand → Piece → Finish', 'breadcrumb', 'Brand → Piece → Finish',
      'usesSubBrands', true, 'variantAttrMode', 'none',
      'examples', jsonb_build_object('primary', 'e.g. Furniture brand', 'subBrand', 'e.g. Collection', 'productLine', 'e.g. Chair model', 'variant', 'e.g. Oak finish', 'color', 'e.g. Oak')
    )
    when 'cables-pipes' then jsonb_build_object(
      'primaryLabel', 'Brand', 'primaryPlural', 'Brands', 'subBrandLabel', 'Sub-brand',
      'productLineLabel', 'Type', 'productLinePlural', 'types', 'variantLabelName', 'Length', 'variantPlural', 'lengths',
      'hint', 'Brand → Type → Length', 'breadcrumb', 'Brand → Type → Length',
      'usesSubBrands', false, 'variantAttrMode', 'none',
      'examples', jsonb_build_object('primary', 'e.g. Cable brand', 'productLine', 'e.g. Cable type', 'variant', 'e.g. 5 m / 10 m', 'other', 'e.g. Gauge')
    )
    when 'books' then jsonb_build_object(
      'primaryLabel', 'Author', 'primaryPlural', 'Authors', 'subBrandLabel', 'Series',
      'productLineLabel', 'Book title', 'productLinePlural', 'book titles', 'variantLabelName', 'Edition / Format', 'variantPlural', 'editions / formats',
      'hint', 'Author → Book title → Edition / Format', 'breadcrumb', 'Author → Book title → Edition / Format',
      'usesSubBrands', true, 'variantAttrMode', 'isbn_language',
      'examples', jsonb_build_object('primary', 'e.g. Author name', 'subBrand', 'e.g. Series name', 'productLine', 'e.g. Book title', 'variant', 'e.g. Paperback', 'storage', 'e.g. ISBN', 'color', 'e.g. Language')
    )
    when 'general' then jsonb_build_object(
      'primaryLabel', 'Brand', 'primaryPlural', 'Brands', 'subBrandLabel', 'Sub-brand',
      'productLineLabel', 'Type', 'productLinePlural', 'types', 'variantLabelName', 'Variant', 'variantPlural', 'variants',
      'hint', 'Simple item with quantity', 'breadcrumb', 'Item',
      'usesSubBrands', false, 'variantAttrMode', 'none',
      'examples', jsonb_build_object('primary', 'e.g. Maker', 'productLine', 'e.g. Item type', 'variant', 'e.g. Size / pack')
    )
    else null
  end
),
updated_at = now()
where coalesce(c.meta -> 'taxonomy', null) is null
  and lower(c.slug) in (
    'electronics','perfumes','liquids','food-grocery','clothing','hardware',
    'tools','stationery','furniture','cables-pipes','books','general'
  );

-- ############################################################################
-- END migrations/070_inventory_category_taxonomy_meta.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/071_admin_backup_table_coverage.sql
-- ############################################################################

-- Additive: expand admin CSV/JSON backup coverage to post-034 tables
-- (inventory catalog, reminders, installment due notices). Safe for live DBs.

create or replace function public.app_admin_backup_table_list()
returns text[]
language sql
immutable
as $$
  select array[
    'app_organizations',
    'app_users',
    'app_permissions',
    'app_team_permissions',
    'loan_ledger_entries',
    'loans',
    'loan_payments',
    'installment_plans',
    'installment_payments',
    'goods_category_config',
    'goods_brands',
    'goods_sub_brands',
    'goods_product_lines',
    'goods_brand_variants',
    'goods_items',
    'goods_sales',
    'goods_events',
    'expense_accounts',
    'expense_topups',
    'expense_entries',
    'expense_transfers',
    'bitcoin_wallets',
    'app_notes',
    'app_note_reminders',
    'app_user_notifications',
    'app_user_prefs',
    'app_installment_due_notices',
    'app_inquiries',
    'app_inquiry_messages',
    'app_admin_notifications',
    'app_access_extensions',
    'app_plan_renewal_requests',
    'app_activity_log'
  ]::text[];
$$;

revoke all on function public.app_admin_backup_table_list() from public, anon, authenticated;

create or replace function public.app_admin_import_full_backup(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  admin public.app_users;
  sess_id uuid;
  current_tok text;
  current_hash text;
  fmt text;
  ver int;
  tables_obj jsonb;
  tbl text;
  inserted jsonb := '{}'::jsonb;
  n int;
  backup_admin_id uuid;
  clear_order text[] := array[
    'app_inquiry_messages',
    'app_admin_notifications',
    'app_inquiries',
    'app_access_extensions',
    'app_plan_renewal_requests',
    'app_activity_log',
    'app_team_permissions',
    'app_permissions',
    'app_note_reminders',
    'app_user_notifications',
    'app_installment_due_notices',
    'loan_payments',
    'installment_payments',
    'goods_brand_variants',
    'goods_product_lines',
    'goods_sub_brands',
    'goods_brands',
    'goods_category_config',
    'goods_sales',
    'goods_events',
    'expense_transfers',
    'expense_entries',
    'expense_topups',
    'expense_accounts',
    'bitcoin_wallets',
    'app_notes',
    'app_user_prefs',
    'loans',
    'installment_plans',
    'goods_items',
    'loan_ledger_entries'
  ];
  insert_order text[] := array[
    'app_organizations',
    'app_permissions',
    'app_team_permissions',
    'loan_ledger_entries',
    'loans',
    'loan_payments',
    'installment_plans',
    'installment_payments',
    'goods_category_config',
    'goods_brands',
    'goods_sub_brands',
    'goods_product_lines',
    'goods_brand_variants',
    'goods_items',
    'goods_sales',
    'goods_events',
    'expense_accounts',
    'expense_topups',
    'expense_entries',
    'expense_transfers',
    'bitcoin_wallets',
    'app_notes',
    'app_note_reminders',
    'app_user_notifications',
    'app_user_prefs',
    'app_installment_due_notices',
    'app_inquiries',
    'app_inquiry_messages',
    'app_admin_notifications',
    'app_access_extensions',
    'app_plan_renewal_requests',
    'app_activity_log'
  ];
begin
  admin := public.app_require_protected_admin();
  current_tok := public.current_session_token();
  current_hash := case
    when current_tok is null or current_tok = '' then null
    else public.app_hash_token(current_tok)
  end;
  if current_hash is not null then
    select s.id into sess_id
    from public.app_sessions s
    where s.token_hash = current_hash
      and s.revoked_at is null
      and s.expires_at > now()
    limit 1;
  end if;

  perform set_config('app.import_keep_user_id', admin.id::text, true);
  perform set_config('app.import_authorized', '1', true);

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Invalid backup payload';
  end if;

  fmt := coalesce(p_payload->>'format', '');
  ver := coalesce(nullif(p_payload->>'version', '')::int, 0);
  if fmt <> 'triple-m-admin-backup' then
    raise exception 'Unsupported backup format (expected triple-m-admin-backup)';
  end if;
  if ver < 1 then
    raise exception 'Unsupported backup version';
  end if;

  tables_obj := coalesce(p_payload->'tables', '{}'::jsonb);
  if jsonb_typeof(tables_obj) <> 'object' then
    raise exception 'Backup tables object missing';
  end if;

  if not (tables_obj ? 'app_users')
     or jsonb_typeof(tables_obj->'app_users') <> 'array' then
    raise exception 'Backup must include app_users';
  end if;

  select nullif(u->>'id', '')::uuid
    into backup_admin_id
  from jsonb_array_elements(tables_obj->'app_users') u
  where lower(trim(both from coalesce(u->>'username', '')))
        = lower(trim(both from coalesce(admin.username, '')))
  limit 1;

  if backup_admin_id is not null and backup_admin_id is distinct from admin.id then
    tables_obj := public.app_admin_backup_remap_uuid_in_tables(
      tables_obj, backup_admin_id, admin.id
    );
  end if;

  foreach tbl in array clear_order loop
    perform public.app_admin_backup_clear_table(tbl);
  end loop;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'app_sessions'
  ) then
    if sess_id is not null then
      delete from public.app_sessions where id is distinct from sess_id;
    else
      delete from public.app_sessions where user_id is distinct from admin.id;
    end if;
  end if;

  if tables_obj ? 'app_organizations' then
    update public.app_users set organization_id = null where true;
    perform public.app_admin_backup_clear_table('app_organizations');
    n := public.app_admin_backup_insert_rows('app_organizations', tables_obj->'app_organizations');
    inserted := inserted || jsonb_build_object('app_organizations', n);
  end if;

  n := public.app_admin_backup_restore_users(tables_obj->'app_users');
  inserted := inserted || jsonb_build_object('app_users', n);

  foreach tbl in array insert_order loop
    if tbl = 'app_organizations' then
      continue;
    end if;
    if tables_obj ? tbl then
      n := public.app_admin_backup_insert_rows(tbl, tables_obj->tbl);
      inserted := inserted || jsonb_build_object(tbl, n);
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'restoredBy', admin.username,
    'restoredAt', now(),
    'inserted', inserted,
    'warning', 'Restore is destructive for exported tables. Sessions were cleared except the current admin session. Extra is_protected flags from the backup were stripped.'
  );
end;
$$;

revoke all on function public.app_admin_import_full_backup(jsonb) from public;
grant execute on function public.app_admin_import_full_backup(jsonb) to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/071_admin_backup_table_coverage.sql
-- ############################################################################

-- ############################################################################
-- BEGIN migrations/072_fix_backup_restore_password_and_reminder_fk.sql
-- ############################################################################

-- Additive: fix backup restore password policy + reminder FK order.
-- Safe for live DBs (no DROP TABLE / truncate of user data).
--
-- 1) Password trigger must NOT block restore of existing weak passwords.
--    Restore keeps hashes + admin_visible_password as-is and sets password_is_weak
--    so the UI banner still appears. Create/change password still enforces policy.
-- 2) Insert app_user_notifications BEFORE app_note_reminders (FK).
-- 3) Null orphan notification_id / note_id refs that are missing from the payload.

create or replace function public.app_users_password_policy_trg()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  importing boolean := false;
begin
  begin
    importing := public.app_import_is_authorized();
  exception when others then
    importing := false;
  end;

  -- INSERT (restore / seed / RPC already validated): keep password as-is, flag weak for UI banner.
  if tg_op = 'INSERT' then
    if new.admin_visible_password is not null and length(trim(new.admin_visible_password)) > 0 then
      new.password_is_weak := not public.app_password_meets_policy(new.admin_visible_password);
    else
      new.password_is_weak := coalesce(new.password_is_weak, false);
    end if;
    return new;
  end if;

  -- UPDATE of visible password
  if new.admin_visible_password is distinct from old.admin_visible_password then
    if importing then
      -- Backup restore must not reject legacy weak passwords.
      if new.admin_visible_password is not null and length(trim(new.admin_visible_password)) > 0 then
        new.password_is_weak := not public.app_password_meets_policy(new.admin_visible_password);
      end if;
      return new;
    end if;

    if new.admin_visible_password is not null and length(trim(new.admin_visible_password)) > 0 then
      -- Real password change: enforce policy (same message users already see in the UI).
      perform public.app_assert_password_policy(new.admin_visible_password);
      new.password_is_weak := false;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_app_users_password_policy on public.app_users;
create trigger trg_app_users_password_policy
before insert or update of admin_visible_password on public.app_users
for each row
execute function public.app_users_password_policy_trg();

-- Keep export list order parent-friendly (notifications before reminders).
create or replace function public.app_admin_backup_table_list()
returns text[]
language sql
immutable
as $$
  select array[
    'app_organizations',
    'app_users',
    'app_permissions',
    'app_team_permissions',
    'loan_ledger_entries',
    'loans',
    'loan_payments',
    'installment_plans',
    'installment_payments',
    'goods_category_config',
    'goods_brands',
    'goods_sub_brands',
    'goods_product_lines',
    'goods_brand_variants',
    'goods_items',
    'goods_sales',
    'goods_events',
    'expense_accounts',
    'expense_topups',
    'expense_entries',
    'expense_transfers',
    'bitcoin_wallets',
    'app_notes',
    'app_user_notifications',
    'app_note_reminders',
    'app_user_prefs',
    'app_installment_due_notices',
    'app_inquiries',
    'app_inquiry_messages',
    'app_admin_notifications',
    'app_access_extensions',
    'app_plan_renewal_requests',
    'app_activity_log'
  ]::text[];
$$;

revoke all on function public.app_admin_backup_table_list() from public, anon, authenticated;

create or replace function public.app_admin_backup_sanitize_fk_rows(
  p_rows jsonb,
  p_parent_rows jsonb,
  p_fk_column text,
  p_parent_id_column text default 'id'
)
returns jsonb
language plpgsql
immutable
as $$
declare
  out_rows jsonb := '[]'::jsonb;
  elem jsonb;
  fk_raw text;
  parent_ids text[] := array[]::text[];
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return '[]'::jsonb;
  end if;

  if p_parent_rows is not null and jsonb_typeof(p_parent_rows) = 'array' then
    select coalesce(array_agg(nullif(p ->> p_parent_id_column, '')), array[]::text[])
      into parent_ids
    from jsonb_array_elements(p_parent_rows) p;
  end if;

  for elem in select * from jsonb_array_elements(p_rows)
  loop
    fk_raw := nullif(trim(both from coalesce(elem ->> p_fk_column, '')), '');
    if fk_raw is not null and not (fk_raw = any (parent_ids)) then
      elem := (elem - p_fk_column) || jsonb_build_object(p_fk_column, null);
    end if;
    out_rows := out_rows || jsonb_build_array(elem);
  end loop;

  return out_rows;
end;
$$;

revoke all on function public.app_admin_backup_sanitize_fk_rows(jsonb, jsonb, text, text) from public, anon, authenticated;

create or replace function public.app_admin_import_full_backup(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  admin public.app_users;
  sess_id uuid;
  current_tok text;
  current_hash text;
  fmt text;
  ver int;
  tables_obj jsonb;
  tbl text;
  inserted jsonb := '{}'::jsonb;
  n int;
  backup_admin_id uuid;
  clear_order text[] := array[
    'app_inquiry_messages',
    'app_admin_notifications',
    'app_inquiries',
    'app_access_extensions',
    'app_plan_renewal_requests',
    'app_activity_log',
    'app_team_permissions',
    'app_permissions',
    'app_note_reminders',
    'app_installment_due_notices',
    'app_user_notifications',
    'loan_payments',
    'installment_payments',
    'goods_brand_variants',
    'goods_product_lines',
    'goods_sub_brands',
    'goods_brands',
    'goods_category_config',
    'goods_sales',
    'goods_events',
    'expense_transfers',
    'expense_entries',
    'expense_topups',
    'expense_accounts',
    'bitcoin_wallets',
    'app_notes',
    'app_user_prefs',
    'loans',
    'installment_plans',
    'goods_items',
    'loan_ledger_entries'
  ];
  -- Parents before children: notifications before reminders / due notices.
  insert_order text[] := array[
    'app_organizations',
    'app_permissions',
    'app_team_permissions',
    'loan_ledger_entries',
    'loans',
    'loan_payments',
    'installment_plans',
    'installment_payments',
    'goods_category_config',
    'goods_brands',
    'goods_sub_brands',
    'goods_product_lines',
    'goods_brand_variants',
    'goods_items',
    'goods_sales',
    'goods_events',
    'expense_accounts',
    'expense_topups',
    'expense_entries',
    'expense_transfers',
    'bitcoin_wallets',
    'app_notes',
    'app_user_notifications',
    'app_note_reminders',
    'app_user_prefs',
    'app_installment_due_notices',
    'app_inquiries',
    'app_inquiry_messages',
    'app_admin_notifications',
    'app_access_extensions',
    'app_plan_renewal_requests',
    'app_activity_log'
  ];
begin
  admin := public.app_require_protected_admin();
  current_tok := public.current_session_token();
  current_hash := case
    when current_tok is null or current_tok = '' then null
    else public.app_hash_token(current_tok)
  end;
  if current_hash is not null then
    select s.id into sess_id
    from public.app_sessions s
    where s.token_hash = current_hash
      and s.revoked_at is null
      and s.expires_at > now()
    limit 1;
  end if;

  perform set_config('app.import_keep_user_id', admin.id::text, true);
  perform set_config('app.import_authorized', '1', true);

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Invalid backup payload';
  end if;

  fmt := coalesce(p_payload->>'format', '');
  ver := coalesce(nullif(p_payload->>'version', '')::int, 0);
  if fmt <> 'triple-m-admin-backup' then
    raise exception 'Unsupported backup format (expected triple-m-admin-backup)';
  end if;
  if ver < 1 then
    raise exception 'Unsupported backup version';
  end if;

  tables_obj := coalesce(p_payload->'tables', '{}'::jsonb);
  if jsonb_typeof(tables_obj) <> 'object' then
    raise exception 'Backup tables object missing';
  end if;

  if not (tables_obj ? 'app_users')
     or jsonb_typeof(tables_obj->'app_users') <> 'array' then
    raise exception 'Backup must include app_users';
  end if;

  select nullif(u->>'id', '')::uuid
    into backup_admin_id
  from jsonb_array_elements(tables_obj->'app_users') u
  where lower(trim(both from coalesce(u->>'username', '')))
        = lower(trim(both from coalesce(admin.username, '')))
  limit 1;

  if backup_admin_id is not null and backup_admin_id is distinct from admin.id then
    tables_obj := public.app_admin_backup_remap_uuid_in_tables(
      tables_obj, backup_admin_id, admin.id
    );
  end if;

  -- Drop orphan FKs that would fail restore even with correct order
  -- (e.g. reminder points at a notification missing from the backup file).
  if tables_obj ? 'app_note_reminders' then
    tables_obj := jsonb_set(
      tables_obj,
      '{app_note_reminders}',
      public.app_admin_backup_sanitize_fk_rows(
        tables_obj->'app_note_reminders',
        tables_obj->'app_user_notifications',
        'notification_id',
        'id'
      )
    );
    tables_obj := jsonb_set(
      tables_obj,
      '{app_note_reminders}',
      public.app_admin_backup_sanitize_fk_rows(
        tables_obj->'app_note_reminders',
        tables_obj->'app_notes',
        'note_id',
        'id'
      )
    );
  end if;

  if tables_obj ? 'app_installment_due_notices' then
    tables_obj := jsonb_set(
      tables_obj,
      '{app_installment_due_notices}',
      public.app_admin_backup_sanitize_fk_rows(
        tables_obj->'app_installment_due_notices',
        tables_obj->'app_user_notifications',
        'notification_id',
        'id'
      )
    );
  end if;

  foreach tbl in array clear_order loop
    perform public.app_admin_backup_clear_table(tbl);
  end loop;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'app_sessions'
  ) then
    if sess_id is not null then
      delete from public.app_sessions where id is distinct from sess_id;
    else
      delete from public.app_sessions where user_id is distinct from admin.id;
    end if;
  end if;

  if tables_obj ? 'app_organizations' then
    update public.app_users set organization_id = null where true;
    perform public.app_admin_backup_clear_table('app_organizations');
    n := public.app_admin_backup_insert_rows('app_organizations', tables_obj->'app_organizations');
    inserted := inserted || jsonb_build_object('app_organizations', n);
  end if;

  n := public.app_admin_backup_restore_users(tables_obj->'app_users');
  inserted := inserted || jsonb_build_object('app_users', n);

  foreach tbl in array insert_order loop
    if tbl = 'app_organizations' then
      continue;
    end if;
    if tables_obj ? tbl then
      n := public.app_admin_backup_insert_rows(tbl, tables_obj->tbl);
      inserted := inserted || jsonb_build_object(tbl, n);
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'restoredBy', admin.username,
    'restoredAt', now(),
    'inserted', inserted,
    'warning', 'Restore is destructive for exported tables. Sessions were cleared except the current admin session. Extra is_protected flags from the backup were stripped. Existing passwords were kept as-is; weak passwords are flagged for the UI banner only.'
  );
end;
$$;

revoke all on function public.app_admin_import_full_backup(jsonb) from public;
grant execute on function public.app_admin_import_full_backup(jsonb) to anon, authenticated;

notify pgrst, 'reload schema';

-- ############################################################################
-- END migrations/072_fix_backup_restore_password_and_reminder_fk.sql
-- ############################################################################

-- ============================================================================
-- End of Triple-M full schema. Next: Admin → Upload Backup (JSON/CSV) for data.
-- ============================================================================
