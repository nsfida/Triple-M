/**
 * Builds Assets/sql/triplem_full_schema.sql from migrations/schema.sql + migrations/0*.sql.
 * Run: node scripts/build_full_schema_sql.js
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const migDir = path.join(root, "migrations");
const outDir = path.join(root, "Assets", "sql");
const outFile = path.join(outDir, "triplem_full_schema.sql");

// Match project apply order (001 before 001a; schema first).
const migrationFiles = [
  "schema.sql",
  "001_multi_user_auth.sql",
  "001a_fix_pgcrypto_extensions.sql",
  "002_admin_user_management.sql",
  "003_fix_profile_overload_and_company_branding.sql",
  "004_fix_app_user_public_profile_unique.sql",
  "005_fix_admin_data_visibility_and_owner_backfill.sql",
  "006_smart_pin_and_admin_password_visibility.sql",
  "007_company_contact_details.sql",
  "008_strict_owner_isolation.sql",
  "009_trial_signup_and_access_plans.sql",
  "010_trial_signup_contact_details.sql",
  "011_fix_admin_delete_user_reassign.sql",
  "012_fix_admin_delete_user_cascade.sql",
  "013_fix_admin_delete_user_no_replication_role.sql",
  "014_admin_notifications_and_inquiries.sql",
  "015_inquiry_conversations_and_public_request.sql",
  "016_admin_start_conversation.sql",
  "017_fix_tab_permission_enforcement.sql",
  "018_admin_raw_user_ledger.sql",
  "019_messaging_live_sync.sql",
  "020_domain_tables_owner_rls.sql",
  "021_domain_migrate_rpcs.sql",
  "022_admin_raw_domain_tables.sql",
  "023_admin_dual_store_delete.sql",
  "024_fix_admin_session_preserve_and_extend_access.sql",
  "025_app_update_own_profile.sql",
  "026_access_period_grace_and_renewal.sql",
  "027_access_until_date_extension.sql",
  "028_admin_access_extension_history.sql",
  "029_installment_plan_schedule.sql",
  "030_company_team_members_and_activity.sql",
  "031_team_branding_sync_and_member_limits.sql",
  "032_activity_log_owner_only.sql",
  "033_admin_visible_smart_pin.sql",
  "034_admin_backup_restore.sql",
  "035_fix_admin_backup_safeupdate_delete.sql",
  "036_fix_admin_backup_username_remap.sql",
  "037_fix_admin_backup_session_preserve.sql",
];

const listed = new Set(migrationFiles);
const extras = fs
  .readdirSync(migDir)
  .filter((f) => /^\d{3,}.*\.sql$/i.test(f) && !listed.has(f))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
migrationFiles.push(...extras);

for (const file of migrationFiles) {
  const full = path.join(migDir, file);
  if (!fs.existsSync(full)) {
    console.error("Missing migration file:", file);
    process.exit(1);
  }
}

const header = `-- ============================================================================
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
${migrationFiles.map((f, i) => `--   ${String(i + 1).padStart(2, "0")}. migrations/${f}`).join("\n")}
-- ============================================================================

`;

const resetSection = `-- ============================================================================
-- RESET: clear existing Triple-M app objects (clean slate)
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- Views first (depend on tables)
drop view if exists public.v_loan_ledger_unified cascade;

-- Domain / ledger / messaging / team tables (dependency-safe via CASCADE)
drop table if exists public.app_inquiry_messages cascade;
drop table if exists public.app_inquiries cascade;
drop table if exists public.app_admin_notifications cascade;
drop table if exists public.app_access_extensions cascade;
drop table if exists public.app_plan_renewal_requests cascade;
drop table if exists public.app_activity_log cascade;
drop table if exists public.app_team_permissions cascade;
drop table if exists public.app_permissions cascade;
drop table if exists public.app_sessions cascade;
drop table if exists public.app_user_prefs cascade;
drop table if exists public.app_notes cascade;
drop table if exists public.bitcoin_wallets cascade;
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
        p.proname like 'app\\_%' escape '\\'
        or p.proname like 'current\\_app\\_%' escape '\\'
        or p.proname like 'current\\_session\\_%' escape '\\'
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

`;

fs.mkdirSync(outDir, { recursive: true });

const parts = [header, resetSection];

for (const file of migrationFiles) {
  const full = path.join(migDir, file);
  const body = fs.readFileSync(full, "utf8").replace(/^\uFEFF/, "");
  parts.push(
    "\n-- ############################################################################\n" +
      "-- BEGIN migrations/" + file + "\n" +
      "-- ############################################################################\n\n"
  );
  parts.push(body.replace(/\s*$/, "\n"));
  parts.push(
    "\n-- ############################################################################\n" +
      "-- END migrations/" + file + "\n" +
      "-- ############################################################################\n"
  );
}

parts.push(`
-- ============================================================================
-- End of Triple-M full schema. Next: Admin → Upload Backup (JSON/CSV) for data.
-- ============================================================================
`);

const sql = parts.join("");
fs.writeFileSync(outFile, sql, "utf8");

console.log("Wrote", outFile);
console.log("Files bundled:", migrationFiles.length);
console.log("Size bytes:", Buffer.byteLength(sql, "utf8"));
console.log("Size KB:", Math.round(Buffer.byteLength(sql, "utf8") / 1024));

const mustHave = [
  "app_users",
  "app_sessions",
  "app_permissions",
  "loans",
  "goods_items",
  "expense_accounts",
  "bitcoin_wallets",
  "installment_plans",
  "app_admin_export_full_backup",
  "app_admin_import_full_backup",
  "app_login",
  "smart_pin",
];
const missing = mustHave.filter((s) => !sql.includes(s));
if (missing.length) {
  console.error("MISSING markers:", missing.join(", "));
  process.exit(1);
}
console.log("Sanity OK:", mustHave.join(", "));
