"use strict";
// Inventory 2.0 - Phase 7: System Backup, account backup and the schema package carry V2 data.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
if (!globalThis.crypto) globalThis.crypto = require("node:crypto").webcrypto;
const root = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");
const E = require("../Assets/app/backup/04-system-backup-engine.js");
const UB = require("../Assets/app/backup/01-backup-engine.js");
const M221 = "migrations/221_inventory_v2_backup_restore_review_notes.sql";
const hasMig = fs.existsSync(path.join(root, M221));
const skipSql = hasMig ? false : "Database migrations are not present in this checkout";
const OWNER = "00000000-0000-4000-8000-000000000004";

test("System Backup accepts Inventory 2.0 folders and still refuses anything unsafe", () => {
  for (const t of ["inventory_v2_products", "inventory_v2_access", "inventory_v2_sync_issues"]) {
    assert.equal(E.safeName(`${E.ROOT}users/${OWNER}/inventory_v2/${t}.ndjson.enc`), "file", t);
  }
  assert.equal(E.safeName(`${E.ROOT}attachments/${OWNER}/inventory_product/${OWNER}.webp.enc`), "file");
  // older sections are unchanged
  assert.equal(E.safeName(`${E.ROOT}users/${OWNER}/inventory/goods_items.ndjson.enc`), "file");
  for (const bad of [
    `${E.ROOT}users/${OWNER}/2inventory/x.ndjson.enc`,       // must start with a letter
    `${E.ROOT}users/${OWNER}/Inventory_V2/x.ndjson.enc`.replace("Inventory_V2", "inv.v2"),
    `${E.ROOT}users/${OWNER}/inventory_v2/../x.ndjson.enc`,
    `${E.ROOT}users/${OWNER}/inventory_v2/x.sql.enc`,
    `${E.ROOT}users/${OWNER}/inventory_v2/x.ndjson`
  ]) assert.notEqual(E.safeName(bad), "file", bad);
});

test("Account backups accept Inventory 2.0 tables and keep the strict path rules", () => {
  const ok = UB._test.safeEntryName;
  assert.equal(ok("data/inventory_v2/inventory_v2_products.ndjson"), true);
  assert.equal(ok("data/inventory/goods_items.ndjson"), true);
  for (const bad of ["data/../x.ndjson", "data/inventory_v2/x.json", "data/2x/y.ndjson", "data/inv-v2/y.ndjson", "/data/x/y.ndjson"]) assert.notEqual(ok(bad), true, bad);
  const src = read("Assets/app/backup/01-backup-engine.js");
  assert.match(src, /!\/\^\[a-z\]\[a-z0-9_\]\{1,79\}\$\/\.test\(String\(t\.table\)\)/);
});

test("both manifests record the icon pack version, never the icons", () => {
  const runner = read("Assets/app/backup/05-system-backup-runner.js");
  assert.match(runner, /modules: await moduleInfo\(deps, tableTotals\)/);
  assert.match(runner, /iconsInBackup: false/);
  assert.match(read("Assets/app/backup/01-backup-engine.js"), /modules: await moduleNotes\(deps, manifestTables\)/);
  for (const ui of ["Assets/app/backup/02-backup-ui.js", "Assets/app/backup/03-system-backup.js"]) {
    assert.match(read(ui), /iconPack: async \(\) => \{[\s\S]{0,200}inventory-v2\/icons\/icon-manifest\.json/, ui);
  }
  const pack = JSON.parse(read("Assets/inventory-v2/icons/icon-manifest.json"));
  assert.match(String(pack.version), /^\d+\.\d+\.\d+$/);
});

test("migration 221 only reclassifies the offline review notes as restorable", { skip: skipSql }, () => {
  const sql = read(M221);
  const prev = read("migrations/220_inventory_v2_offline_sync.sql");
  assert.doesNotMatch(sql, /\b(drop\s+(table|function|column|index|trigger|policy)|truncate|delete from|alter table|create table|insert into|update public\.)/i);
  const fnOf = (s, name) => s.slice(s.indexOf(`create or replace function public.${name}()`), s.indexOf(`revoke all on function public.${name}()`));
  for (const fn of ["app_system_backup__catalog", "app_user_backup__catalog"]) {
    const now = fnOf(sql, fn), before = fnOf(prev, fn);
    // identical except the sync_issues row
    const strip = s => s.split("\n").filter(l => !/inventory_v2_sync_issues/.test(l)).join("\n");
    assert.equal(strip(now), strip(before), fn);
    assert.ok(now.length > 1000, fn);
  }
  assert.match(sql, /\(161, 'inventory_v2_sync_issues', 'user', 'inventory_v2', 'data', 't\.owner_id', null, null, null\)/);
  assert.match(sql, /\(146,'inventory_v2_sync_issues','inventory_v2','data',null\)/);
  // the Main Admin's switches stay out of account backups
  assert.doesNotMatch(fnOf(sql, "app_user_backup__catalog"), /'inventory_v2_access'|'inventory_v2_plan_entitlements'/);
  assert.match(sql, /app_system_backup__unclassified\(\)/);
  // only Inventory 2.0 tables may stop it: production has other tables outside the catalogue
  // (audit_log, profiles, user_permissions) that System Backup already skips with a warning
  assert.match(sql, /where t like 'inventory\\_v2\\_%';/);
  assert.match(sql, /System Backup catalogue is missing Inventory 2\.0 tables/);
});

test("schema package keeps 20 files and places V2 tables beside V1 inventory", { skip: skipSql }, () => {
  assert.equal(E.SCHEMA_FILES.length, 20);
  assert.match(read("migrations/215_inventory_v2_access_control.sql"), /when p_name ~ '\^\(goods_\|inventory_v2_\)' then 7/);
  assert.match(read("scripts/build_full_schema_sql.js"), /"221_inventory_v2_backup_restore_review_notes\.sql"/);
});
