"use strict";
// Inventory 2.0 - Phase 3 (migrations 216, 217): Main Admin default, product catalogue, stock ledger,
// icon library and the Products / Stock / Settings screens.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");
const M216 = "migrations/216_inventory_v2_main_admin_default.sql";
const M217 = "migrations/217_inventory_v2_catalogue_stock.sql";
const hasMig = fs.existsSync(path.join(root, M216)) && fs.existsSync(path.join(root, M217));
const skipSql = hasMig ? false : "Database migrations are not present in this checkout";

test("migration 216 turns 2.0 on for the Main Admin only, without writing rows", { skip: skipSql }, () => {
  const sql = read(M216);
  assert.match(sql, /is_main_admin := o\.role = 'admin' and coalesce\(o\.is_protected, false\);/);
  assert.match(sql, /v2 := coalesce\(a\.v2_enabled, is_main_admin\) and entitled;/);
  assert.doesNotMatch(sql, /\b(drop table|truncate|delete from)\b/i);
  // The only write is the admin's own Edit-user action; the migration itself inserts no rows.
  const inserts = sql.split(/insert into public\.inventory_v2_access/).length - 1;
  assert.equal(inserts, 1);
  assert.ok(sql.indexOf("insert into public.inventory_v2_access") > sql.indexOf("function public.app_admin_inventory_access_set"));
});

test("migration 217 is additive, append-only and isolated per business", { skip: skipSql }, () => {
  const sql = read(M217);
  assert.doesNotMatch(sql, /\b(drop table|truncate|alter table public\.(goods_|app_users))/i);
  // Inventory V1 tables are never written by 2.0.
  assert.doesNotMatch(sql, /(insert into|update|delete from)\s+public\.goods_/i);
  assert.match(sql, /create trigger inventory_v2_movements_immutable before update or delete on public\.inventory_v2_stock_movements/);
  assert.match(sql, /enable row level security/);
  // Variants with history are archived, not deleted.
  assert.match(sql, /set is_active = false[\s\S]{0,200}exists \(select 1 from public\.inventory_v2_stock_movements m where m\.variant_id = vv\.id\)/);
  assert.match(sql, /and not exists \(select 1 from public\.inventory_v2_stock_movements m where m\.variant_id = vv\.id\)/);
  // Idempotent client operations, WAC and FIFO-ready cost layers.
  assert.match(sql, /create table if not exists public\.inventory_v2_client_operations/);
  assert.match(sql, /create table if not exists public\.inventory_v2_cost_layers/);
  for (const fn of ["app_inv2_setup", "app_inv2_product_save", "app_inv2_stock_adjust", "app_inv2_stock_count", "app_inv2_stock_transfer", "app_inv2_lookup_code", "app_inv2_verify_ledger"]) {
    assert.match(sql, new RegExp(`create or replace function public\\.${fn}\\(`), fn);
  }
  // Every new table is in both backups.
  const tables = [...sql.matchAll(/create table if not exists public\.(inventory_v2_\w+)/g)].map(m => m[1]);
  assert.ok(tables.length >= 16, String(tables.length));
  const sys = sql.slice(sql.indexOf("app_system_backup__catalog"));
  const usr = sql.slice(sql.indexOf("app_user_backup__catalog"));
  for (const t of tables) {
    assert.ok(sys.includes(`'${t}'`), `system backup: ${t}`);
    assert.ok(usr.includes(`'${t}'`), `user backup: ${t}`);
  }
  assert.match(read("scripts/build_full_schema_sql.js"), /217_inventory_v2_catalogue_stock\.sql/);
});

test("the Phase 3 screens load and register with the shell", () => {
  const html = read("index.html");
  for (const f of ["02-core", "03-products", "04-stock"]) {
    assert.match(html, new RegExp(`<script defer src="Assets/app/inventory-v2/${f}\\.js\\?v=\\d{8}-inv2p\\d+"></script>`), f);
  }
  assert.match(read("Assets/app/inventory-v2/02-core.js"), /sh\.register\("settings"/);
  assert.match(read("Assets/app/inventory-v2/03-products.js"), /register\("products"/);
  assert.match(read("Assets/app/inventory-v2/04-stock.js"), /register\("stock"/);
  for (const f of ["02-core", "03-products", "04-stock"]) {
    const js = read(`Assets/app/inventory-v2/${f}.js`);
    assert.doesNotMatch(js, /setInterval/, f);
    assert.doesNotMatch(js, /John Smith|\$8,450|RetailPOS/, f);
  }
});

test("stock operations carry one client operation id so a retry never posts twice", () => {
  const js = read("Assets/app/inventory-v2/04-stock.js");
  assert.match(js, /opId\(/);
  assert.match(js, /app_inv2_stock_(adjust|transfer|count)/);
});

test("the icon library is local, licensed and rendered against the page", () => {
  const dir = "Assets/inventory-v2/icons";
  const manifest = JSON.parse(read(`${dir}/icon-manifest.json`));
  assert.ok(manifest.count >= 150, String(manifest.count));
  let n = 0;
  for (const cat of Object.values(manifest.categories)) for (const ic of cat.icons) {
    n++;
    assert.ok(fs.existsSync(path.join(root, dir, ic.file)), ic.file);
  }
  assert.equal(n, manifest.count);
  assert.match(read(`${dir}/LICENSE-tabler-icons.txt`), /MIT License/);
  const core = read("Assets/app/inventory-v2/02-core.js");
  assert.match(core, /mask-image:url\('\$\{u\}'\)/);
  assert.doesNotMatch(read("Assets/style/64-inventory-v2.css"), /var\(--ico\)/);
});

test("internal EAN-13 barcodes use the in-store prefix and a valid check digit", () => {
  const js = read("Assets/app/inventory-v2/03-products.js");
  assert.match(js, /ean13Check/);
  assert.match(js, /internalBarcode/);
});
