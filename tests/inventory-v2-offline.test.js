"use strict";
// Inventory 2.0 - Phase 6 (migration 220): offline POS, sync queue, conflicts kept for review.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");
const M220 = "migrations/220_inventory_v2_offline_sync.sql";
const hasMig = fs.existsSync(path.join(root, M220));
const skipSql = hasMig ? false : "Database migrations are not present in this checkout";
const OFF = "Assets/app/inventory-v2/12-offline.js";

test("migration 220 only adds Inventory 2.0 objects and never rewrites other data", { skip: skipSql }, () => {
  const sql = read(M220);
  assert.doesNotMatch(sql, /\b(drop table|truncate)\b/i);
  for (const m of sql.matchAll(/alter table public\.(\w+)/g)) assert.match(m[1], /^inventory_v2_/, m[1]);
  for (const m of sql.matchAll(/create table if not exists public\.(\w+)/g)) assert.match(m[1], /^inventory_v2_/, m[1]);
  assert.match(sql, /add column if not exists offline_at/);
  assert.match(sql, /add column if not exists needs_review boolean not null default false/);
  assert.doesNotMatch(sql, /(insert into|update|delete from)\s+public\.goods_/i, "Inventory V1 untouched");
  assert.doesNotMatch(sql, /(update|delete from)\s+public\.accounting_/i);
  // The offline number is informational: two tills may never be refused because of it.
  assert.doesNotMatch(sql, /create unique index[^;]*offline_no/i);
  assert.match(sql, /alter table public\.inventory_v2_sync_issues enable row level security/);
});

test("offline sales are kept and flagged, never refused or silently resolved", { skip: skipSql }, () => {
  const sql = read(M220);
  assert.match(sql, /lenient boolean := coalesce\(\(p_sale ->> 'offline'\)::boolean, false\)/);
  // only a new completed sale may arrive from a till that was offline
  assert.match(sql, /if lenient and \(act <> 'complete' or nullif\(p_sale ->> 'id', ''\) is not null/);
  // every relaxed rule is recorded as an issue instead
  for (const t of ["stock_shortfall", "serial_conflict", "price_changed", "discount_over_limit", "credit_limit", "unpaid_walk_in"]) assert.match(sql, new RegExp(`'${t}'`), t);
  assert.match(sql, /needs_review/);
  // online sales keep the strict rules
  assert.match(sql, /allow_neg := st\.negative_stock_policy <> 'block' or lenient/);
  assert.match(sql, /if not lenient then raise exception 'Serial\/IMEI % is not in stock at this location'/);
  // review needs edit permission and is owner-scoped
  assert.match(sql, /where id = p_id and owner_id = owner/);
});

test("migration 220 keeps backups complete", { skip: skipSql }, () => {
  const sql = read(M220);
  assert.match(sql, /\(161, 'inventory_v2_sync_issues', 'user', 'inventory_v2', 'history', 't\.owner_id'/);
  assert.match(sql, /\(146,'inventory_v2_sync_issues','inventory_v2','history',null\)/);
  assert.doesNotMatch(sql, /\(\d+,\s*'inventory_v2_access',\s*'inventory_v2'/, "access rows stay out of user backups");
});

test("the till queue survives restarts and resends with the same operation id", () => {
  const js = read(OFF);
  assert.match(js, /indexedDB/);
  assert.match(js, /triplem-inv2-offline-v1/);
  assert.match(js, /p_client_op_id: q\.op, p_sale: q\.payload/);
  // a sale is removed from the device only after the server accepted it
  assert.match(js, /const r = await I\(\)\.rpc\("app_inv2_sale_save"[^\n]*\n\s*await del\("queue", q\.op\);/);
  // refusals stay on the device with the reason
  assert.match(js, /q\.status = "error"; q\.attempts\+\+; q\.last_error/);
  // no polling: retries only after a failed attempt, with a growing delay
  assert.doesNotMatch(js, /setInterval\(/);
  assert.match(js, /Math\.min\(S\.backoff \? S\.backoff \* 2 : 5000, 300000\)/);
  // a workspace opened offline counts as offline until the app has re-checked the sign-in
  assert.match(js, /state\.offlineSync\?\.offlineSession/);
});

test("the POS falls back to the device and honours the owner's block option", () => {
  const pos = read("Assets/app/inventory-v2/06-pos.js");
  assert.match(pos, /if \(!isOnline\(\)\) return completeOffline\(opId, body, T, pays, false\)/);
  // a lost reply re-sends the same operation, so the server saves it once
  assert.match(pos, /isNetworkError\(e\) && !c\.id && !c\.source_id\) return completeOffline\(opId, body, T, pays, true\)/);
  assert.match(pos, /offline_sale_policy === "block"/);
  assert.match(pos, /p_client_op_id: opId/);
  const html = read("index.html");
  assert.match(html, /inventory-v2\/12-offline\.js\?v=/);
  assert.ok(html.indexOf("inventory-v2/12-offline.js") > html.indexOf("inventory-v2/06-pos.js"));
});
