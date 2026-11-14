"use strict";
// Shared test account protection (2026-11-14): khawrai_pro can add and edit, but cannot change
// security settings, delete records or wallets, or empty the Recycle Bin.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");
const exists = rel => fs.existsSync(path.join(root, rel));

test("the test-account module is loaded and knows khawrai_pro", () => {
  const html = read("index.html");
  assert.match(html, /Assets\/app\/core\/12-test-account\.js\?v=/);
  const js = read("Assets/app/core/12-test-account.js");
  assert.match(js, /new Set\(\["khawrai_pro"\]\)/);
  assert.match(js, /app_my_account_restrictions/);
  for (const id of ["#securityChangePassword", "#securitySetupPasskey", "#securityManageSmartPin", "#securityManage2fa", "#securityManageRecovery"]) {
    assert.ok(js.includes(`"${id}"`), `${id} is guarded`);
  }
  assert.ok(js.includes("emptyRecycleBinBtn"), "Recycle Bin empty is guarded");
  // network safety net: deletes and soft deletes refused, edits allowed
  assert.match(js, /method === "DELETE"/);
  assert.match(js, /"is_deleted"\\s\*:\\s\*true/);
});

test("the notice is styled above every dialog", () => {
  const css = read("Assets/style/68-sections-v2.css");
  assert.match(css, /\.tm-test-notice\{[^}]*z-index:2147483647!important/);
  assert.match(css, /\.tm-test-notice-card\{/);
});

test("migration 226 is additive and listed in the full schema", { skip: !exists("migrations/226_test_account_protection.sql") }, () => {
  const sql = read("migrations/226_test_account_protection.sql");
  assert.match(sql, /create table if not exists public\.app_test_accounts/i);
  assert.match(sql, /TRIPLEM_TEST_ACCOUNT/);
  assert.doesNotMatch(sql, /\bdrop\s+table\b/i);
  assert.doesNotMatch(sql, /\btruncate\b/i);
  assert.match(read("scripts/build_full_schema_sql.js"), /"226_test_account_protection\.sql"/);
});

test("Main Admin can set the test account password and plan days apply without an extra tick", () => {
  const admin = read("Assets/app/admin/01-admin.js");
  assert.match(admin, /app_admin_set_test_account_password/);
  assert.match(admin, /markPeriodChanged/);
  const els = read("Assets/app/core/03-els.js");
  assert.match(els, /id="managePlanDaysBtn"/);
  assert.match(els, /app_admin_set_access_period/);
});

test("migration 227 is additive", { skip: !exists("migrations/227_admin_test_account_password.sql") }, () => {
  const sql = read("migrations/227_admin_test_account_password.sql");
  assert.match(sql, /app_require_protected_admin\(\)/);
  assert.match(sql, /app_is_test_account\(target\.id\)/);
  assert.doesNotMatch(sql, /\bdrop\s+table\b|\btruncate\b|\bdelete\s+from\b/i);
  assert.match(read("scripts/build_full_schema_sql.js"), /"227_admin_test_account_password\.sql"/);
});

test("the test data script is a single statement (works in the Supabase SQL Editor)", { skip: !exists("supabase/test-data/khawrai_pro_test_data.sql") }, () => {
  const sql = read("supabase/test-data/khawrai_pro_test_data.sql");
  assert.doesNotMatch(sql, /create\s+temp\s+table/i);
  assert.doesNotMatch(sql, /^begin;|^commit;/m);
  assert.equal((sql.match(/^do \$seed\$/gm) || []).length, 1);
});

test("skeleton loading is available to every section", () => {
  assert.match(read("index.html"), /Assets\/app\/core\/11-skeleton\.js\?v=/);
  const js = read("Assets/app/core/11-skeleton.js");
  for (const tab of ["expenses", "given", "installments", "notes", "assets", "admin", "goods"]) assert.ok(js.includes(`${tab}:`), tab);
  assert.match(read("Assets/app/ui/01-render-navigation.js"), /TriplemSkeleton\?\.tab/);
  assert.match(read("Assets/style/68-sections-v2.css"), /prefers-reduced-motion:reduce\)\{\.tm-skel/);
});

test("Admin user manager replaces the old user dialog and saves each change by itself", () => {
  const html = read("index.html");
  assert.match(html, /Assets\/app\/admin\/04-admin-user-manager\.js\?v=/);
  const js = read("Assets/app/admin/04-admin-user-manager.js");
  for (const fn of ["app_admin_update_user_access", "app_admin_set_access_expiry", "app_admin_set_access_period", "app_admin_inventory_access_set",
    "app_admin_set_triplem_ai_access", "app_admin_set_company_branding", "app_admin_set_team_limits", "app_admin_rename_user", "app_admin_set_role",
    "app_admin_force_password_change", "app_admin_clear_user_smart_pin", "app_admin_revoke_user_sessions", "app_admin_user_overview", "app_admin_delete_user"]) {
    assert.ok(js.includes(`"${fn}"`), fn);
  }
  assert.match(read("Assets/app/admin/01-admin.js"), /TriplemAdminUserManager\.open\(user\)/);
  assert.match(read("Assets/style/69-admin-user-manager.css"), /html\.aum-open body \.modal:not\(\.hide\)\{z-index:2147482600/);
});

test("migration 228 is additive and listed", { skip: !exists("migrations/228_admin_user_manager.sql") }, () => {
  const sql = read("migrations/228_admin_user_manager.sql");
  assert.doesNotMatch(sql, /\bdrop\s+table\b|\btruncate\b|\bdelete\s+from\b/i);
  assert.match(sql, /app_require_protected_admin\(\)/);
  assert.doesNotMatch(sql, /token_hash'|ip_text|password_hash/);
  assert.match(read("scripts/build_full_schema_sql.js"), /"228_admin_user_manager\.sql"/);
});

test("Home hides the section bar; header has no default text; new footer", () => {
  assert.match(read("Assets/style/66-workspace-home-v2.css"), /#workspaceSectionNav\.workspace-section-nav\.hide\{display:none !important\}/);
  const html = read("index.html");
  assert.match(html, /<p id="mainAppSubtitle"><\/p>/);
  assert.match(html, /Triplem VIP<\/span> \(Money Management Modules\)/);
  assert.match(html, /Invoices\/Receipts, Reports, Wallets\/Accounts, Inventory, Assets\/Depreciation, Loans, Installments\./);
  assert.doesNotMatch(read("Assets/app/reports/01-pdf.js"), /let subtitle = "Money Management Module \(Powered/);
});
