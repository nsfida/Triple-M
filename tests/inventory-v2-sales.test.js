"use strict";
// Inventory 2.0 - Phase 5 (migration 219): POS, customers, suppliers, purchases, payments, returns,
// documents, printing and Accounting posting.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");
const M219 = "migrations/219_inventory_v2_sales_purchases.sql";
const hasMig = fs.existsSync(path.join(root, M219));
const skipSql = hasMig ? false : "Database migrations are not present in this checkout";

test("migration 219 only adds Inventory 2.0 objects and never rewrites other data", { skip: skipSql }, () => {
  const sql = read(M219);
  assert.doesNotMatch(sql, /\b(drop table|truncate)\b/i);
  for (const m of sql.matchAll(/alter table public\.(\w+)/g)) assert.match(m[1], /^inventory_v2_/, m[1]);
  for (const m of sql.matchAll(/create table if not exists public\.(\w+)/g)) assert.match(m[1], /^inventory_v2_/, m[1]);
  assert.doesNotMatch(sql, /(insert into|update|delete from)\s+public\.goods_/i, "Inventory V1 untouched");
  assert.doesNotMatch(sql, /(update|delete from)\s+public\.accounting_/i, "Accounting rows are only added, never changed");
  // Accounting: posted journals are only written by the V2 posting helper, marked as Inventory 2.0, once per document
  assert.equal((sql.match(/insert into public\.accounting_journals\(/g) || []).length, 1);
  assert.match(sql, /'inventory_v2_' \|\| p_source_type/);
  assert.match(sql, /primary key \(owner_id, source_type, source_id\)/);
  assert.match(sql, /perform set_config\('app\.accounting_internal', '', true\);/);
  // Purchases debit the Inventory asset (not an expense); sales credit Sales and debit COGS at the stored cost
  assert.match(sql, /'key', 'inventory', 'debit', stock_net/);
  assert.match(sql, /'key', 'cogs', 'debit', round\(s\.cost_total, 2\)/);
  // a posting problem keeps the document and leaves the posting pending
  assert.match(sql, /status = 'pending', message = excluded\.message/);
  // completed documents are protected; every document write is idempotent
  assert.match(sql, /Completed documents cannot be changed; use a return or a new document/);
  for (const fn of ["app_inv2_sale_save", "app_inv2_sale_return", "app_inv2_purchase_save", "app_inv2_purchase_receive", "app_inv2_purchase_return", "app_inv2_payment_save"]) {
    const body = sql.slice(sql.indexOf(`create or replace function public.${fn}(`));
    assert.match(body.slice(0, 4000), /app_inv2__op_begin\(owner, p_client_op_id/, fn);
  }
  // row security on every new table
  assert.match(sql, /execute format\('alter table public\.%I enable row level security', t\);/);
});

test("every new table is in System Backup and User Backup", { skip: skipSql }, () => {
  const sql = read(M219);
  const tables = [...sql.matchAll(/create table if not exists public\.(inventory_v2_\w+)/g)].map(m => m[1]);
  assert.equal(tables.length, 10);
  const sys = sql.slice(sql.indexOf("create or replace function public.app_system_backup__catalog()"));
  const usr = sql.slice(sql.indexOf("create or replace function public.app_user_backup__catalog()"));
  for (const t of tables) { assert.ok(sys.includes(`'${t}'`), `system: ${t}`); assert.ok(usr.includes(`'${t}'`), `user: ${t}`); }
  // the Main Admin switch stays out of User Backup
  assert.ok(!usr.slice(0, usr.indexOf("$$;")).includes("'inventory_v2_access'"));
  assert.match(read("scripts/build_full_schema_sql.js"), /219_inventory_v2_sales_purchases\.sql/);
});

test("the Phase 5 screens load and register with the shell", () => {
  const html = read("index.html");
  for (const f of ["06-pos", "07-parties", "08-sales", "09-purchases", "10-print", "11-settings-sales"]) {
    assert.match(html, new RegExp(`<script defer src="Assets/app/inventory-v2/${f}\\.js\\?v=\\d{8}-inv2p\\d+"></script>`), f);
    const js = read(`Assets/app/inventory-v2/${f}.js`);
    assert.doesNotMatch(js, /setInterval/, f);
    assert.doesNotMatch(js, /John Smith|\$8,450|RetailPOS/, f);
  }
  assert.match(read("Assets/app/inventory-v2/06-pos.js"), /register\("pos"/);
  assert.match(read("Assets/app/inventory-v2/07-parties.js"), /register\("customers"[\s\S]*register\("suppliers"/);
  const sales = read("Assets/app/inventory-v2/08-sales.js");
  for (const v of ["orders", "documents", "outstanding"]) assert.match(sales, new RegExp(`register\\("${v}"`));
  assert.match(read("Assets/app/inventory-v2/09-purchases.js"), /register\("purchases"/);
});

test("payments use one operation id per payment window, so a retry never charges twice", () => {
  const pos = read("Assets/app/inventory-v2/06-pos.js");
  const pay = pos.slice(pos.indexOf("function payDialog()"), pos.indexOf("function doneDialog("));
  assert.match(pay, /const opId = I\(\)\.opId\(\);/);
  assert.match(pay, /p_client_op_id: opId/);
  for (const [f, fn] of [["08-sales", "returnDialog"], ["09-purchases", "editor"], ["09-purchases", "receiveDialog"], ["07-parties", "paymentDialog"]]) {
    const js = read(`Assets/app/inventory-v2/${f}.js`);
    const body = js.slice(js.indexOf(`function ${fn}(`));
    assert.match(body.slice(0, 600), /const opId = I\(\)\.opId\(\);/, `${f}:${fn}`);
  }
});

test("printing uses the Windows app print path first, then a hidden frame; receipts follow the paper width", () => {
  const js = read("Assets/app/inventory-v2/10-print.js");
  assert.match(js, /window\.TriplemDesktop\?\.printHtml\?\.\(html\)/);
  assert.match(js, /@page\{size:\$\{w\}mm auto;margin:0\}/);
  assert.match(js, /@page\{size:A4;margin:14mm\}/);
  assert.match(js, /dir="auto"/);
  assert.doesNotMatch(js, /window\.open\(/);
});

test("one-item lists from the server stay lists", () => {
  const core = read("Assets/app/inventory-v2/02-core.js");
  assert.match(core, /const LIST_RPCS = new Set\(\["app_inv2_pos_items", "app_inv2_movements"\]\);/);
});
