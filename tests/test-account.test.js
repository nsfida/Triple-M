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
