"use strict";
// Inventory 2.0 - Phase 4 (migration 218): dashboard, product photos, phone tab bar, tablet rail, dark mode.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");
const M218 = "migrations/218_inventory_v2_dashboard_photos.sql";
const M210 = "migrations/210_r2_file_storage_attachments.sql";
const hasMig = fs.existsSync(path.join(root, M218)) && fs.existsSync(path.join(root, M210));
const skipSql = hasMig ? false : "Database migrations are not present in this checkout";

test("migration 218 adds no tables and changes no data", { skip: skipSql }, () => {
  const sql = read(M218);
  assert.doesNotMatch(sql, /\b(create table|alter table|drop table|truncate|delete from|insert into|update public\.)/i);
  assert.match(sql, /create or replace function public\.app_inv2_dashboard\(p_location_id uuid default null\)/);
  assert.match(sql, /owner uuid := public\.app_inv2__require\('view'\)/);
  assert.match(sql, /grant execute on function public\.app_inv2_dashboard\(uuid\) to anon, authenticated;/);
  assert.match(sql, /revoke all on function public\.app_inv2__can\(text\) from public, anon, authenticated;/);
});

test("the attachment registry keeps every existing module and rule from migration 210", { skip: skipSql }, () => {
  const oldSql = read(M210), newSql = read(M218);
  const rows = s => [...s.slice(s.indexOf("function public.app_attachment_module"), s.indexOf("$fn$;", s.indexOf("function public.app_attachment_module"))).matchAll(/\('([a-z_]+)', '([a-z_0-9]+)', '([#a-z_0-9]+)'\)/g)].map(m => m.slice(1).join("|"));
  const before = rows(oldSql), after = rows(newSql);
  assert.ok(before.length >= 19);
  for (const r of before) assert.ok(after.includes(r), `module kept: ${r}`);
  assert.deepEqual(after.filter(r => !before.includes(r)), ["inventory_product|inventory_v2_products|#inventory_v2"]);
  // The Edge Function only accepts letters and underscores in module names.
  assert.match("inventory_product", /^[a-z_]{2,40}$/);
  const canBody = s => s.slice(s.indexOf("function public.app_attachment_can"), s.indexOf("$fn$;", s.indexOf("function public.app_attachment_can")));
  const strip = s => canBody(s).replace(/\s+/g, " ").replace(/ if m\.perm = '#inventory_v2' then.*?end if; (?=if p_action = 'view' then return public\.app_has_permission)/, " ");
  assert.equal(strip(newSql), canBody(oldSql).replace(/\s+/g, " "), "existing permission rules unchanged");
  assert.match(read(M218), /if p_action = 'add' then return public\.app_inv2__can\('edit'\); end if;/);
  assert.match(read("scripts/build_full_schema_sql.js"), /218_inventory_v2_dashboard_photos\.sql/);
});

test("the dashboard loads once per opening, keeps offline figures and shows no sample data", () => {
  const js = read("Assets/app/inventory-v2/05-dashboard.js");
  assert.match(js, /register\("dashboard"/);
  assert.match(js, /rpc\("app_inv2_dashboard", \{ p_location_id:/);
  assert.equal((js.match(/rpc\("app_inv2_dashboard"/g) || []).length, 1);
  assert.doesNotMatch(js, /setInterval|setTimeout\([^)]*load/);
  assert.doesNotMatch(js, /John Smith|\$8,450|RetailPOS|Hold Order/);
  assert.match(js, /Saved figures from/);
  assert.match(js, /try \{ return JSON\.parse\(localStorage\.getItem\(CACHE\)/);
  assert.match(read("index.html"), /<script defer src="Assets\/app\/inventory-v2\/05-dashboard\.js\?v=\d{8}-inv2p\d+"><\/script>/);
});

test("product photos use the shared attachment service under the inventory_product module", () => {
  const js = read("Assets/app/inventory-v2/03-products.js");
  assert.match(js, /const ATT_MODULE = "inventory_product";/);
  assert.match(js, /A\.commit\(snap, \{ module: ATT_MODULE, id: productId \}\)/);
  assert.match(js, /if \(snap\) A\.restore\(snap\); throw ex;/);
  assert.match(js, /A\.reset\(f\); A\.showExisting\(f, \{ module: ATT_MODULE, id: productId \}\);/);
  // The shared attachment module itself is not changed for this.
  assert.doesNotMatch(read("Assets/app/attachments/02-attachments.js"), /inventory_product/);
});

test("phone tab bar, tablet rail and dark mode styles are present", () => {
  const shell = read("Assets/app/inventory-v2/01-shell.js");
  assert.match(shell, /class="inv2-tabbar"/);
  assert.match(shell, /const RAIL = "\(max-width: 1100px\)";/);
  const css = read("Assets/style/64-inventory-v2.css");
  assert.match(css, /@media \(max-width:720px\)\{\s*\.inv2-tabbar\{display:grid/);
  assert.match(css, /@media \(min-width:721px\) and \(max-width:1100px\)/);
  assert.match(css, /html\[data-triplem-theme-mode="dark"\] \.inv2-app\{--inv2-blue:#3b82f6/);
  assert.match(read("Assets/style/app.feature.bundle.css"), /\.inv2-tabbar\{display:none\}/);
  // Touch screens: no automatic focus that would open the keyboard.
  assert.match(read("Assets/app/inventory-v2/02-core.js"), /matchMedia\("\(pointer: fine\)"\)/);
});
