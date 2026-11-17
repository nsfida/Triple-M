"use strict";
// Pro by card through Paddle (2026-11-17): migration 231, the paddle-billing server function,
// the Plan & Subscription card option, the CSP and the terms.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");
const exists = rel => fs.existsSync(path.join(root, rel));

test("migration 231 only adds tables and re-declares three functions", { skip: !exists("migrations/231_paddle_card_payments.sql") }, () => {
  const sql = read("migrations/231_paddle_card_payments.sql");
  const code = sql.replace(/--.*$/gm, "");
  assert.doesNotMatch(code, /\b(drop\s+table|truncate|alter\s+table\s+public\.app_(users|subscription_requests))\b/i);
  assert.doesNotMatch(code, /\bdelete\s+from\s+public\.(?!app_card_checkout_sessions)/i, "only expired checkout references are ever deleted");
  for (const t of ["app_card_checkout_sessions", "app_card_subscriptions", "app_card_payments", "app_card_webhook_events"]) {
    assert.match(code, new RegExp(`create table if not exists public\\.${t}\\(`));
    assert.match(code, new RegExp(`alter table public\\.${t} enable row level security`));
    assert.match(code, new RegExp(`\\('${t}'|,'${t}'`), `${t} is classified for System Backup`);
  }
  assert.match(code, /grant execute on function public\.app_card_service_handle_event\(jsonb, jsonb\) to service_role;/);
  assert.match(code, /revoke all on function public\.app_card_service_handle_event\(jsonb, jsonb\) from public, anon, authenticated;/);
  assert.match(code, /test_usernames/, "test-mode payments credit only listed test accounts");
  assert.match(code, /and not public\.app_card__promo_used\(uid\);/, "bank request bonus also counts card payments");
});

test("paddle-billing verifies Paddle's signature and keeps secrets on the server", { skip: !exists("supabase/functions/paddle-billing/index.ts") }, () => {
  const ts = read("supabase/functions/paddle-billing/index.ts");
  assert.match(ts, /\$\{ts\}:\$\{raw\}/);
  assert.match(ts, /SIGNATURE_TOLERANCE_SECONDS/);
  assert.match(ts, /Deno\.env\.get\("PADDLE_API_KEY"\)/);
  assert.match(ts, /Deno\.env\.get\("PADDLE_WEBHOOK_SECRET"\)/);
  assert.doesNotMatch(ts, /pdl_(sdbx|live)_apikey_|pdl_ntfset_/);
});

test("card option: public values only, hidden in the Store edition, loaded after the plan panel", () => {
  const js = read("Assets/app/billing/01-card-payments.js");
  assert.doesNotMatch(js, /apikey_|ntfset_|PADDLE_API_KEY|WEBHOOK_SECRET/);
  assert.match(js, /token: "(test|live)_[a-z0-9]+"/);
  assert.match(js, /if \(storeEdition\(\)\) return false;/);
  assert.match(js, /app_card_checkout_start/);
  const html = read("index.html");
  assert.ok(html.indexOf("billing/01-card-payments.js") > html.indexOf("admin/01-admin.js"));
  for (const page of [html, read("_headers")]) {
    assert.match(page, /script-src[^;]*https:\/\/cdn\.paddle\.com/);
    assert.match(page, /frame-src 'self' https:\/\/\*\.paddle\.com/);
    assert.match(page, /connect-src[^;]*https:\/\/\*\.paddle\.com/);
  }
});

test("terms name Paddle as Merchant of Record and the 14-day refund", () => {
  const T = require(path.join(root, "Assets/app/core/04-trial-terms.js"));
  const terms = T.plainText(T.TERMS);
  assert.match(terms, /Paddle\.com is the Merchant of Record for all our card orders/);
  assert.match(terms, /14-day money-back guarantee/);
  assert.match(terms, /Plans paid by card renew automatically/);
  for (const p of ["seo/terms-and-conditions.html", "seo/refund-policy.html"]) assert.match(read(p), /Paddle/);
});

test("migration 233 only re-declares the event handler with quantity support", { skip: !exists("migrations/233_card_payment_quantity.sql") }, () => {
  const code = read("migrations/233_card_payment_quantity.sql").replace(/--.*$/gm, "");
  assert.match(code, /paid_months := \(case when period = 'yearly' then 12 else 1 end\) \* qty;/);
  assert.equal((code.match(/create or replace function/g) || []).length, 1);
  assert.doesNotMatch(code, /\b(create table|alter table|drop |truncate)\b/i);
});
