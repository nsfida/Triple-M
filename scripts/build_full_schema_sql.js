/**
 * Builds Assets/sql/triplem_full_schema.sql from migrations/schema.sql + migrations/0*.sql.
 * Run: node scripts/build_full_schema_sql.js
 *
 * Also exportable for unit tests:
 *   const { resolveMigrationFiles, buildFullSchema } = require("./build_full_schema_sql");
 */
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const DEFAULT_MIG_DIR = path.join(root, "migrations");
const DEFAULT_OUT_DIR = path.join(root, "Assets", "sql");
const DEFAULT_OUT_FILE = path.join(DEFAULT_OUT_DIR, "triplem_full_schema.sql");

/**
 * Canonical apply order. schema.sql first, then numbered migrations.
 * 001 before 001a. New migrations MUST be appended here (extras are also
 * auto-appended, but explicit listing keeps order reviewable).
 */
const CANONICAL_MIGRATION_FILES = [
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
  "038_expense_account_custom_logo.sql",
  "039_production_security_hardening.sql",
  "040_note_reminders.sql",
  "041_installment_due_notifications.sql",
  "042_restore_protected_admin_capabilities.sql",
  "043_note_reminder_live_update.sql",
  "044_note_reminder_client_now.sql",
  "045_installment_manual_reminders.sql",
  "046_expense_account_types_expand.sql",
  "047_expense_account_type_crypto_wallet.sql",
  "048_expense_lazy_queries.sql",
  "049_inventory_brands_variants_lazy.sql",
  "050_inventory_sales_customers_list.sql",
  "051_inventory_category_product_lines.sql",
  "052_inventory_product_line_summary_fix.sql",
  "053_inventory_product_line_variant_safe_upsert.sql",
  "054_inventory_upsert_goods_item_rpc.sql",
  "055_inventory_catalog_edit_delete.sql",
  "056_inventory_item_detail_rpc_restore.sql",
  "057_inventory_cascade_delete_catalog.sql",
  "058_inventory_sales_upsert_and_owner_fix.sql",
  "059_password_policy.sql",
  "060_fix_category_rename_admin_domain_edit.sql",
  "061_inventory_sub_brand_variant_attrs.sql",
  "062_inventory_category_hard_purge.sql",
  "063_inventory_sell_by_volume_or_bottle.sql",
  "064_remember_me_and_grace_lock_disable.sql",
  "065_inventory_summary_sell_by_fields.sql",
  "066_inventory_category_hard_purge_owner_fix.sql",
  "067_inventory_category_visibility_and_tombstones.sql",
  "068_books_taxonomy_and_product_line_delete_fix.sql",
  "069_installment_down_payment.sql",
  "070_inventory_category_taxonomy_meta.sql",
  "071_admin_backup_table_coverage.sql",
  "072_fix_backup_restore_password_and_reminder_fk.sql",
  "073_inventory_category_reorder.sql",
  "074_sync_team_member_access_from_owner.sql",
  "075_asset_management.sql",
  "076_asset_custom_labels.sql",
  "077_fix_team_member_edit_and_permissions.sql",
  "078_admin_storage_management.sql",
  "079_admin_photo_compression.sql",
  "080_fix_admin_list_user_photos_account_name.sql",
  "081_trial_btc_bitcoin_tab_gate.sql",
  "082_inventory_product_barcodes.sql",
  "083_depreciation_assets.sql",
  "084_admin_security_key.sql",
  "085_admin_key_page_lock_and_smart_pin_lockout.sql",
  "086_fix_lockout_commit_on_failure.sql",
  "087_smart_pin_lock_tiers_countdown.sql",
  "088_smart_pin_lock_refresh_admin_reset.sql",
  "089_admin_comms_bypass_security_key.sql",
  "090_site_analytics.sql",
  "091_analytics_storage_cleanup.sql",
  "092_performance_dashboard_and_paging_FIXED_V2.sql",
];

/** Prefix key used for uniqueness: "001", "001a", "038", … */
function migrationPrefixKey(filename) {
  const base = path.basename(String(filename || ""));
  const m = base.match(/^(\d+[a-z]?)/i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Resolve ordered migration file list for a migrations directory.
 * @param {string} [migDir]
 * @returns {{ files: string[], extras: string[], prefixKeys: string[] }}
 */
function resolveMigrationFiles(migDir = DEFAULT_MIG_DIR) {
  const migrationFiles = [...CANONICAL_MIGRATION_FILES];
  const listed = new Set(migrationFiles);

  if (!fs.existsSync(migDir)) {
    throw new Error("Migrations directory missing: " + migDir);
  }

  const onDisk = fs
    .readdirSync(migDir)
    .filter((f) => /^\d{3,}.*\.sql$/i.test(f));

  const extras = onDisk
    .filter((f) => !listed.has(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  migrationFiles.push(...extras);

  for (const file of migrationFiles) {
    const full = path.join(migDir, file);
    if (!fs.existsSync(full)) {
      throw new Error("Missing migration file: " + file);
    }
  }

  // Numbered SQL files on disk must all be included (no orphans).
  const included = new Set(migrationFiles.filter((f) => f !== "schema.sql"));
  const orphans = onDisk.filter((f) => !included.has(f));
  if (orphans.length) {
    throw new Error("Orphan migration files not bundled: " + orphans.join(", "));
  }

  // Unique prefixes (001 and 001a are distinct).
  const seen = new Map();
  for (const file of migrationFiles) {
    if (file === "schema.sql") continue;
    const key = migrationPrefixKey(file);
    if (!key) {
      throw new Error("Migration filename missing numeric prefix: " + file);
    }
    if (seen.has(key)) {
      throw new Error(
        `Duplicate migration prefix "${key}": ${seen.get(key)} and ${file}`
      );
    }
    seen.set(key, file);
  }

  return {
    files: migrationFiles,
    extras,
    prefixKeys: [...seen.keys()],
  };
}

const MUST_HAVE_MARKERS = [
  "app_users",
  "app_sessions",
  "app_permissions",
  "loans",
  "goods_items",
  "goods_brands",
  "goods_category_config",
  "goods_sub_brands",
  "expense_accounts",
  "bitcoin_wallets",
  "installment_plans",
  "app_note_reminders",
  "app_admin_export_full_backup",
  "app_admin_import_full_backup",
  "app_login",
  "smart_pin",
  "custom_logo_url",
  "drop table if exists public.goods_brands",
  "drop table if exists public.goods_category_config",
];

function buildResetSection() {
  return `-- ============================================================================
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
drop table if exists public.app_asset_transactions cascade;
drop table if exists public.app_assets cascade;
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
}

/**
 * Build the full schema SQL string (and optionally write it).
 * @param {{ migDir?: string, outFile?: string, write?: boolean }} [options]
 * @returns {{ sql: string, files: string[], extras: string[], outFile: string|null, missingMarkers: string[] }}
 */
function buildFullSchema(options = {}) {
  const migDir = options.migDir || DEFAULT_MIG_DIR;
  const outFile = options.outFile || DEFAULT_OUT_FILE;
  const write = options.write !== false;

  const { files: migrationFiles, extras } = resolveMigrationFiles(migDir);

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

  const parts = [header, buildResetSection()];

  for (const file of migrationFiles) {
    const full = path.join(migDir, file);
    const body = fs.readFileSync(full, "utf8").replace(/^\uFEFF/, "");
    parts.push(
      "\n-- ############################################################################\n" +
        "-- BEGIN migrations/" +
        file +
        "\n" +
        "-- ############################################################################\n\n"
    );
    parts.push(body.replace(/\s*$/, "\n"));
    parts.push(
      "\n-- ############################################################################\n" +
        "-- END migrations/" +
        file +
        "\n" +
        "-- ############################################################################\n"
    );
  }

  parts.push(`
-- ============================================================================
-- End of Triple-M full schema. Next: Admin → Upload Backup (JSON/CSV) for data.
-- ============================================================================
`);

  const sql = parts.join("");
  const missingMarkers = MUST_HAVE_MARKERS.filter((s) => !sql.includes(s));

  if (write) {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, sql, "utf8");
  }

  return {
    sql,
    files: migrationFiles,
    extras,
    outFile: write ? outFile : null,
    missingMarkers,
  };
}

function main() {
  const result = buildFullSchema({ write: true });
  if (result.missingMarkers.length) {
    console.error("MISSING markers:", result.missingMarkers.join(", "));
    process.exit(1);
  }
  if (result.extras.length) {
    console.warn(
      "Note: auto-appended unlisted migrations (add them to CANONICAL_MIGRATION_FILES):",
      result.extras.join(", ")
    );
  }
  console.log("Wrote", result.outFile);
  console.log("Files bundled:", result.files.length);
  console.log("Size bytes:", Buffer.byteLength(result.sql, "utf8"));
  console.log("Size KB:", Math.round(Buffer.byteLength(result.sql, "utf8") / 1024));
  console.log("Sanity OK:", MUST_HAVE_MARKERS.join(", "));
}

module.exports = {
  CANONICAL_MIGRATION_FILES,
  MUST_HAVE_MARKERS,
  migrationPrefixKey,
  resolveMigrationFiles,
  buildFullSchema,
  DEFAULT_MIG_DIR,
  DEFAULT_OUT_FILE,
};

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}
