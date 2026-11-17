"use strict";
// 2026-11-17: two sources of repeated database errors in the production log.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");

test("admin push flush waits for the Admin security key instead of failing every minute", () => {
  const js = read("Assets/app/notifications/01-web-push.js");
  assert.match(js, /function scheduleAdminInboxFlush\(options = \{\}\) \{\n    if \(adminSecurityKeyLocked\(\)\) return false;/);
  assert.match(js, /if \(adminSecurityKeyLocked\(\)\) return \{ ok: false, queued: false, locked: true \};/);
  assert.match(js, /adminInboxKeyBlocked = true/);
  assert.match(read("Assets/app/admin/02-admin-security.js"), /triplem:admin-security-unlocked/);
});

test("site tracker stops for the page when the server refuses analytics", () => {
  const js = read("Assets/app/analytics/01-site-tracker.js");
  assert.match(js, /\[401, 403, 404\]\.includes\(res\.status\)\) \{ refused = true;/);
  assert.match(js, /if \(refused\) return;/);
});

test("migration 232 only re-grants the analytics ingest function", { skip: !fs.existsSync(path.join(root, "migrations/232_site_analytics_ingest_grant.sql")) }, () => {
  const code = read("migrations/232_site_analytics_ingest_grant.sql").replace(/--.*$/gm, "");
  assert.match(code, /grant execute on function public\.app_site_analytics_ingest\(jsonb\) to anon, authenticated;/);
  assert.doesNotMatch(code, /\b(create|drop|alter|delete|update|insert|truncate|revoke)\b/i);
});
