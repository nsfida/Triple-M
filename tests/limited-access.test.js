"use strict";
// Grace period and limited access after a trial or plan ends; Inventory 2.0 only for new
// sign-ups (migration 224, 2026-11-11).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");
const exists = rel => fs.existsSync(path.join(root, rel));
const M224 = "migrations/224_limited_access_after_trial_and_v2_only_signups.sql";
const skipSql = exists(M224) ? false : "Database migrations are not present in this checkout";

test("migration 224 is additive and never switches accounts off", { skip: skipSql }, () => {
  const sql = read(M224);
  const withoutOwnTrigger = sql.replace(/drop trigger if exists trg_limited_access_guard on public\.%I/g, "").replace(/drop trigger if exists trg_limited_access_guard on public\.app_note_reminders/g, "");
  assert.doesNotMatch(withoutOwnTrigger, /\b(drop\s+(table|function|column|index|trigger|policy)|truncate|delete from|alter table|create table)\b/i);
  assert.doesNotMatch(sql, /is_active\s*=\s*false/i, "no automatic deactivation");
  assert.doesNotMatch(sql, /revoked_at\s*=\s*now\(\)/i, "no session revocation");
  assert.match(sql, /'lock_active',false/);
  assert.match(sql, /'should_auto_disable',false/);
  assert.match(sql, /'write_allowed',not limited/);
  assert.match(sql, /'data_access_allowed',true/);
  assert.match(sql, /grace_ends := expires_at \+ make_interval\(days => grace_days\);/);
  assert.match(sql, /hint = 'TRIPLEM_LIMITED_ACCESS'/);
  assert.match(sql, /for each statement execute function public\.app_limited_access_guard\(\)/);
  // first-use defaults may still be created by exactly these functions (call stack from PostgreSQL)
  assert.match(sql, /get diagnostics ctx = pg_context;/);
  assert.match(sql, /\(app_list_my_goods_categories\|app_accounting_bootstrap_defaults\|insurance_sync_customer_sources\)/);
  assert.match(sql, /build_full_schema|/);
  assert.match(read("scripts/build_full_schema_sql.js"), /"224_limited_access_after_trial_and_v2_only_signups\.sql"/);
});

test("every business data table of the account backup catalogue is guarded", { skip: skipSql }, () => {
  const sql = read(M224);
  const listBlock = sql.slice(sql.indexOf("tables text[] := array["), sql.indexOf("];", sql.indexOf("tables text[] := array[")));
  const guarded = new Set([...listBlock.matchAll(/'([a-z0-9_]+)'/g)].map(m => m[1]));
  const catalogue = read("migrations/221_inventory_v2_backup_restore_review_notes.sql");
  const fn = catalogue.slice(catalogue.indexOf("create or replace function public.app_user_backup__catalog()"));
  const dataTables = [...fn.matchAll(/\(\d+,'([a-z0-9_]+)','[a-z0-9_]+','data',/g)].map(m => m[1]);
  assert.ok(dataTables.length > 60);
  for (const t of dataTables) {
    if (t === "inventory_v2_sync_issues" || t === "app_note_reminders") continue; // sync issues stay writable; reminders: row guard
    assert.ok(guarded.has(t), `${t} must be guarded`);
  }
  for (const t of ["app_attachments", "app_triplem_ai_drafts"]) assert.ok(guarded.has(t), t);
  assert.match(sql, /on public\.app_note_reminders for each row execute function public\.app_limited_access_reminder_guard\(\)/);
});

test("new sign-ups get Inventory 2.0 only; the Main Admin can still enable Classic inventory", { skip: skipSql }, () => {
  const sql = read(M224);
  assert.match(sql, /values \(uid, false, true, false, 'v2', now\(\), null\)\s*on conflict \(owner_id\) do nothing;/);
  assert.match(sql, /v1_enabled = false,/);
  assert.match(sql, /when 'inventory_classic' then 'inventory_v2'/);
  assert.doesNotMatch(sql.slice(sql.indexOf("selectable constant")), /'inventory_classic'\]/);
  // the admin switch from 215 is untouched
  assert.doesNotMatch(sql, /app_admin_inventory_access_set\(/);
  const signup = read("Assets/app/auth/02-auth-welcome-trial.js");
  assert.doesNotMatch(signup, /key: "inventory_classic"/);
  assert.match(signup, /New accounts use Inventory 2\.0/);
});

test("client: limited access explained, refusals caught, offline queues refuse, no locked overlay", () => {
  const html = read("index.html");
  assert.match(html, /<script defer src="Assets\/app\/core\/05-limited-access\.js\?v=[^"]+"><\/script>/);
  assert.match(html, /id="accessBannerActions"[\s\S]*data-banner-plan[\s\S]*data-banner-details/);
  assert.doesNotMatch(html, /auto-disables after this lock day/);
  const session = read("Assets/app/auth/01-auth-session.js");
  assert.match(session, /data\?\.hint === "TRIPLEM_LIMITED_ACCESS"[\s\S]{0,200}window\.TriplemLimitedAccess\?\.onRefused\?\.\(error\)/);
  const off = read("Assets/app/core/08-offline-sync.js");
  assert.equal((off.match(/if \(offlineQueueRefusedForLimitedAccess\(\)\) return false;/g) || []).length, 3);
  assert.match(read("Assets/app/inventory-v2/12-offline.js"), /window\.TriplemLimitedAccess\?\.blocksWrites\?\.\(\)/);
  const els = read("Assets/app/core/03-els.js");
  assert.match(els, /const lockActive = !v224 && user\.lock_active === true;/);
  assert.match(els, /data_access_allowed: v224/);
  assert.match(read("Assets/app/admin/01-admin.js"), /Limited access<\/span>/);
});

test("limited-access texts per phase", () => {
  const g = { document: { addEventListener() {}, documentElement: { classList: { toggle() {} } } }, localStorage: { getItem() { return null; }, setItem() {} } };
  g.window = g;
  vm.createContext(g);
  vm.runInContext(read("Assets/app/core/05-limited-access.js"), g);
  const L = g.TriplemLimitedAccess;
  const base = { is_trial: true, trial_expires_at: "2026-11-01T10:00:00Z", grace_ends_at: "2026-11-04T10:00:00Z" };
  const grace = L.bannerText({ ...base, period_expired: true, grace_active: true, read_only: false });
  assert.equal(grace.kind, "grace");
  assert.match(grace.title, /free trial has ended · grace period/);
  assert.match(grace.message, /full access until[\s\S]*limited access[\s\S]*never deleted/);
  const limited = L.bannerText({ ...base, period_expired: true, grace_active: false, read_only: true });
  assert.equal(limited.kind, "limited");
  assert.match(limited.message, /view, search and download every record, report, PDF, CSV file, receipt, invoice, document and backup/);
  assert.equal(L.bannerText({ ...base, period_active: true }), null);
  assert.equal(L.bannerText({ ...base, read_only: true, payment_approval_pending: true }), null);
  assert.equal(L.isRefusal({ responseData: { hint: "TRIPLEM_LIMITED_ACCESS" } }), true);
  assert.equal(L.isRefusal({ message: "Something else" }), false);
});

test("terms: grace period and limited access, no lock or deactivation; overlay above the sign-up, closed only by its X", () => {
  const T = require(path.join(root, "Assets/app/core/04-trial-terms.js"));
  const trial = T.plainText(T.TRIAL), terms = T.plainText(T.TERMS);
  for (const text of [trial, terms]) {
    assert.match(text, /grace period/);
    assert.match(text, /limited access/i);
    assert.doesNotMatch(text, /switched off automatically|locked \(1 day\)|deactivated:/i);
  }
  assert.ok(T.AVAILABLE.some(x => /backups/.test(x)) && T.PAUSED.some(x => /editing, archiving or deleting/.test(x)));
  assert.match(trial, /enforced by our servers/);
  const src = read("Assets/app/core/04-trial-terms.js");
  assert.doesNotMatch(src, /modal-footer/, "no Close button at the bottom");
  assert.match(src, /class="tt-close" data-tt-close aria-label="Close"/);
  assert.match(src, /doc\.body\.appendChild\(el\);\s*\}\s*if \(!el\.classList/);
  const css = read("Assets/style/65-signup-trial-terms.css");
  assert.match(css, /\.modal\.trial-terms-overlay\{z-index:2147483200!important\}/);
  assert.match(read("Assets/style/app.feature.bundle.css"), /trial-terms-overlay\{z-index:2147483200!important\}/);
});
