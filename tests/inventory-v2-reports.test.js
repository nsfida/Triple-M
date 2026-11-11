"use strict";
// Inventory 2.0 - Phase 8 (migration 222): reports and labels.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");
const M222 = "migrations/222_inventory_v2_reports_labels.sql";
const hasMig = fs.existsSync(path.join(root, M222));
const skipSql = hasMig ? false : "Database migrations are not present in this checkout";

function labels() {
  const ctx = { window: {}, document: { addEventListener() {} } };
  vm.createContext(ctx);
  vm.runInContext(read("Assets/app/inventory-v2/14-labels.js"), ctx);
  return ctx.window.TriplemInv2Labels;
}

test("migration 222 is additive and read-only for business data", { skip: skipSql }, () => {
  const sql = read(M222);
  assert.doesNotMatch(sql, /\b(drop\s+(table|column|function|index|trigger)|truncate|delete from|create table)\b/i);
  for (const m of sql.matchAll(/alter table public\.(\w+)/g)) assert.equal(m[1], "inventory_v2_settings");
  assert.match(sql, /add column if not exists staff_view_costs boolean not null default false/);
  assert.match(sql, /add column if not exists label_settings jsonb not null default '\{\}'::jsonb/);
  // the report function only reads: no insert/update/delete inside it
  const rep = sql.slice(sql.indexOf("create or replace function public.app_inv2_report("), sql.indexOf("create or replace function public.app_inv2_label_items("));
  assert.doesNotMatch(rep, /\b(insert into|update public|delete from)\b/i);
  assert.match(rep, /returns jsonb language plpgsql stable security definer/);
  assert.match(rep, /owner uuid := public\.app_inv2__require\('view'\)/);
  // every query is limited to the caller's business
  for (const t of ["inventory_v2_sales s", "inventory_v2_payments p", "inventory_v2_stock_movements m", "inventory_v2_purchases x"]) {
    assert.ok(rep.includes(t), t);
  }
  assert.equal((rep.match(/\.owner_id = owner/g) || []).length >= 14, true);
  assert.match(rep, /if not show_costs then\s+rows := public\.app_inv2__strip_costs\(rows\);/);
  // settings save is owner-only and keeps only known label keys
  const save = sql.slice(sql.indexOf("create or replace function public.app_inv2_report_settings_save("));
  assert.match(save, /if not public\.app_inv2__is_owner\(\) then raise exception/);
  assert.match(save, /where k in \('template', 'show_name'/);
  for (const fn of ["app_inv2_report(text, date, date, uuid, jsonb)", "app_inv2_label_items(jsonb)", "app_inv2_report_settings_save(jsonb)"]) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn.replace(/[()]/g, "\\$&")} from public, anon, authenticated;`), fn);
  }
  for (const fn of ["app_inv2__tz(text)", "app_inv2__strip_costs(jsonb)", "app_inv2__pct(numeric, numeric)"]) {
    assert.doesNotMatch(sql, new RegExp(`grant execute on function public\\.${fn.replace(/[()]/g, "\\$&")}`), `${fn} stays private`);
  }
  assert.match(read("scripts/build_full_schema_sql.js"), /"222_inventory_v2_reports_labels\.sql"/);
});

test("EAN-13, EAN-8, UPC-A and Code 128 encode to the standard patterns", () => {
  const L = labels();
  // reference patterns produced by the python-barcode library
  assert.equal(L.ean13Modules("4006381333931"),
    "10100011010100111010111101111010001001011001101010100001010000101000010111010010000101100110101");
  assert.equal(L.ean13Modules("4006381333932"), null, "wrong check digit refused");
  assert.equal(L.ean8Modules("96385074"), "1010001011010111101111010110111010101001110111001010001001011100101");
  assert.equal(L.encode("036000291452").type, "UPC-A");
  assert.equal(L.encode("2000000222011").type, "EAN-13");
  // Code 128: start B, data, checksum, stop; "Wikipedia" example check value 0+... computed independently
  const m = L.code128Modules("PJJ123C");
  assert.ok(m.startsWith("11010010000"), "start B");
  assert.ok(m.endsWith("1100011101011"), "stop");
  assert.equal(L.code128Modules("1234").startsWith("11010011100"), true, "start C for even digits");
  assert.equal(L.encode("قلم"), null, "non-Latin text is not forced into a barcode");
  const svg = L.barcodeSvg("2000000222011", 40, 12);
  assert.match(svg, /^<svg [^>]*viewBox="0 0 40\.00 12\.00"/);
  assert.match(svg, /aria-label="EAN-13 2000000222011"/);
});

test("labels show the till price including tax and lay out sheets and rolls", () => {
  const L = labels();
  assert.equal(L.shelfPrice({ price: 10, tax_rate: 5, price_includes_tax: false }), 10.5);
  assert.equal(L.shelfPrice({ price: 10.5, tax_rate: 5, price_includes_tax: true }), 10.5);
  assert.equal(L.shelfPrice({ price: 50, tax_rate: 0, price_includes_tax: false }), 50);
  for (const [k, t] of Object.entries(L.TEMPLATES)) {
    if (!t.sheet) continue;
    assert.ok(t.left + (t.cols - 1) * t.px + t.w <= 210.01, `${k} fits A4 width`);
    assert.ok(t.top + (t.rows - 1) * t.py + t.h <= 297.01, `${k} fits A4 height`);
  }
  const src = read("Assets/app/inventory-v2/14-labels.js");
  assert.match(src, /@page\{size:\$\{t\.w\}mm \$\{t\.h\}mm;margin:0\}/);
  assert.match(src, /Math\.min\(999, Math\.floor\(Number\(it\.copies\) \|\| 0\)\)/, "copies are capped");
});

test("reports screen: server figures, cost columns follow the server, CSV is Excel-safe", () => {
  const src = read("Assets/app/inventory-v2/13-reports.js");
  assert.match(src, /I\(\)\.rpc\("app_inv2_report", \{ p_kind: S\.kind/);
  assert.match(src, /d && d\.costs_hidden && COST_KEYS\.has\(key\)/);
  assert.match(src, /return "\\uFEFF" \+ lines\.join\("\\r\\n"\)/);
  // spreadsheet formula injection guard
  assert.match(src, /\/\^\[=\+\\-@\]\/\.test\(s\) && !\/\^-\?\\d\/\.test\(s\) \? "'" : ""/);
  assert.match(src, /S\.asOf/, "stock date is kept apart from the report period");
  const html = read("index.html");
  for (const f of ["13-reports.js", "14-labels.js"]) assert.match(html, new RegExp(`inventory-v2/${f.replace(".", "\\.")}\\?v=`));
  assert.match(read("Assets/app/inventory-v2/01-shell.js"), /\{ key: "labels", label: "Labels & Barcodes", icon: "fa-tags" \}/);
  assert.match(read("Assets/app/inventory-v2/09-purchases.js"), /Shell\(\)\.show\("labels", \{ purchase_id: x\.id/);
});
