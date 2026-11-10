"use strict";
// Inventory 2.0 - Phase 2 (migration 215): access control, home card, full-screen shell.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");
const MIG = "migrations/215_inventory_v2_access_control.sql";
const hasMig = fs.existsSync(path.join(root, MIG));

test("migration 215 is additive and keeps Inventory V1 untouched", { skip: hasMig ? false : "Database migrations are not present in this checkout" }, () => {
  const body = read(MIG).replace(/^--.*$/gm, "");
  assert.doesNotMatch(body, /\b(drop table|truncate|delete from)\b/i);
  assert.doesNotMatch(body, /(alter|update|insert into)\s+public\.goods_/i, "V1 tables are never changed");
  assert.match(body, /create table if not exists public\.inventory_v2_access/);
  assert.match(body, /create table if not exists public\.inventory_v2_plan_entitlements/);
  assert.match(body, /\('trial', true\), \('full', true\), \('legacy', false\)/);
  assert.match(body, /raise exception 'Inventory 2\.0 is not enabled for this account'/);
  assert.match(body, /public\.app_require_protected_admin\(\)/);
  assert.match(body, /Team members follow their company account/);
  assert.match(body, /\(49, 'inventory_v2_access', 'user', 'inventory_v2', 'settings'/);
  assert.match(body, /\(199,'inventory_v2_plan_entitlements', 'system'/);
  assert.match(body, /when p_name ~ '\^\(goods_\|inventory_v2_\)' then 7/);
  // The gate itself is not callable from outside.
  assert.match(body, /revoke all on function public\.app_inv2_require_access\(\) from public, anon, authenticated;/);
  assert.match(read("scripts/build_full_schema_sql.js"), /"215_inventory_v2_access_control\.sql",/);
});

test("the app loads Inventory 2.0 and hooks it into home, navigation, sign-out and the Edit user window", () => {
  const html = read("index.html");
  assert.match(html, /<script defer src="Assets\/app\/inventory-v2\/00-access\.js\?v=\d{8}-inv2p\d+"><\/script>/);
  assert.match(html, /<script defer src="Assets\/app\/inventory-v2\/01-shell\.js\?v=\d{8}-inv2p\d+"><\/script>/);
  const nav = read("Assets/app/ui/01-render-navigation.js");
  assert.match(nav, /if \(key === "goods" && window\.TriplemInventoryV2\?\.v1Hidden\?\.\(\)\) return false;/);
  assert.match(nav, /window\.TriplemInventoryV2\?\.decorateHome\?\.\(grid\)/);
  assert.match(nav, /if \(tab === "inventory2"\) \{ window\.TriplemInventoryV2\?\.open\?\.\(\); return; \}/);
  assert.match(read("Assets/app/auth/01-auth-session.js"), /window\.TriplemInventoryV2\?\.refreshAccess\?\.\(\)/);
  assert.match(read("Assets/app/auth/02-auth-welcome-trial.js"), /window\.TriplemInventoryV2\?\.reset\?\.\(\)/);
  assert.doesNotMatch(read("Assets/app/core/03-els.js"), /TriplemInventoryV2/);
  const admin = read("Assets/app/admin/01-admin.js");
  assert.match(admin, /window\.TriplemInventoryV2\?\.mountEditSection\?\.\(body, user\)/);
  assert.match(admin, /if \(isProtectedAdminSession\(\)\) await window\.TriplemInventoryV2\?\.saveEditSection\?\.\(modal, user\)/);
  assert.match(read("Assets/style/app.feature.bundle.css"), /\.inv2-app\{/);
});

test("the shell asks the server on every open, shows no sample data and protects unsaved work", () => {
  const js = read("Assets/app/inventory-v2/01-shell.js");
  assert.match(js, /supabaseRpc\("app_inv2_context"/);
  assert.equal((js.match(/data-inv2-view="\$\{n\.key\}"/g) || []).length, 1);
  for (const label of ["Dashboard", "POS Terminal", "Orders / Sales", "Products", "Inventory / Stock", "Purchases", "Customers", "Suppliers", "Invoices & Receipts", "Outstanding Balances", "Reports", "Settings"]) assert.ok(js.includes(`label: "${label}"`), label);
  assert.doesNotMatch(js, /\$8,450|John Smith|RetailPOS|Fresh Milk/);
  assert.match(js, /You have unsaved changes in Inventory 2\.0/);
  const access = read("Assets/app/inventory-v2/00-access.js");
  assert.doesNotMatch(access, /setInterval/);
  assert.match(access, /app_admin_inventory_access_set/);
});
