"use strict";
// 2026-11-17: sign-up side panel (card first for Pro), panels slide out, card notices, migration 234.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");
const exists = rel => fs.existsSync(path.join(root, rel));

test("sign-up is a side panel with short steps and the terms inside it", () => {
  const src = read("Assets/app/auth/02-auth-welcome-trial.js");
  assert.match(read("Assets/app/ui/09-side-sheets.js"), /trialSignupModal: "", subscriptionNotificationModal: ""/);
  assert.match(src, /const steps = \(\) => \["plan", "account", \.\.\.\(company\(\) \? \["company"\] : \[\]\), "workspace", \.\.\.\(paid\(\) \? \["payment"\] : \[\]\)\];/);
  assert.match(src, /data-su-terms-view/);
  assert.doesNotMatch(src, /signup-offer-spotlight|signup-trial-facts|signup-v2-value-strip/);
  for (const id of ["trialLicense", "trialIndustry", "trialCompanySize", "trialCountry", "trialCity", "trialWebsite", "trialFiscalStart", "trialVatRate", "trialCompanyEmail", "trialCompanyPhone"]) assert.match(src, new RegExp(`id="${id}"`), id);
  assert.match(src, /pref_key: "company_profile"/);
});

test("Pro at sign-up: card by default, bank transfer optional, Store and team seats use bank", () => {
  const src = read("Assets/app/auth/02-auth-welcome-trial.js");
  assert.match(src, /const cardSwitchedOn = \(\) => !!card && !storeEdition && card\.enabled\?\.\(\) === true;/);
  assert.match(src, /const cardAvailable = \(\) => cardSwitchedOn\(\) && !currentTeamSeats\(\);/);
  assert.match(src, /<em class="su-soon">Coming soon<\/em>/);
  assert.match(src, /S\.pay = cardAvailable\(\) \? "card" : "bank";/);
  assert.match(src, /const serverPlan = method === "card" \? "free" : S\.plan;/);
  assert.match(src, /card\.payFromSignup\(cardPeriod, \{ onDone: openRecovery \}\)/);
  const cardJs = read("Assets/app/billing/01-card-payments.js");
  assert.match(cardJs, /rpc\("app_card_checkout_start_v2", \{ p_period: period, p_context: context \|\| null \}\)/);
  assert.match(cardJs, /payFromSignup, openInvoice/);
});

test("every side panel slides back out when it closes", () => {
  const sheets = read("Assets/app/ui/09-side-sheets.js");
  assert.match(sheets, /else if \(m\.classList\?\.contains\("tm-sheet"\) && m\.classList\.contains\("hide"\) && r\.oldValue && !\/\\bhide\\b\/\.test\(r\.oldValue\)\) slideOut\(m\);/);
  assert.match(sheets, /ghost\.inert = true;/);
  const css = read("Assets/style/69-admin-user-manager.css");
  assert.match(css, /\.aum-root\{[^}]*transition:visibility 0s linear \.34s\}/);
  assert.match(css, /@keyframes tmSheetOut\{from\{opacity:1;transform:none\}to\{opacity:\.4;transform:translateX\(104%\)\}\}/);
  assert.doesNotMatch(css, /translateX\(calc\(/, "calc() is not flipped correctly in the right-to-left stylesheet");
});

test("card notices open in the side panel with method, local dates and the invoice", () => {
  const msg = read("Assets/app/messaging/01-messaging.js");
  assert.match(msg, /if \(cardEvent\.startsWith\("subscription_card_"\)\) return openCardNotificationDetails\(notification, payload, cardEvent\);/);
  assert.match(msg, /function localizeServerDates\(text\)/);
  assert.match(msg, /data-sub-notif-invoice/);
});

test("migration 234: sign-up card time starts at payment; nothing existing altered", { skip: !exists("migrations/234_card_signup.sql") }, () => {
  const code = read("migrations/234_card_signup.sql").replace(/--.*$/gm, "");
  assert.match(code, /create table if not exists public\.app_card_signup_checkouts\(/);
  assert.match(code, /create or replace function public\.app_card_checkout_start_v2\(p_period text, p_context text default null\)/);
  assert.match(code, /base_at := now\(\);/);
  assert.match(code, /paid_months := \(case when period = 'yearly' then 12 else 1 end\) \* qty;/);
  assert.match(code, /\(935,'app_card_signup_checkouts', 'excluded'/);
  assert.doesNotMatch(code, /\b(alter table public\.app_(users|card_checkout_sessions|card_payments|subscription_requests)|drop table|drop function|truncate)\b/i);
});

test("card payments switch: Main Admin only, password, Coming soon while off (migration 235)", { skip: !exists("migrations/235_card_billing_switch.sql") }, () => {
  const code = read("migrations/235_card_billing_switch.sql").replace(/--.*$/gm, "");
  assert.match(code, /insert into public\.app_card_billing_settings\(id, enabled\) values \(1, false\) on conflict \(id\) do nothing;/);
  assert.match(code, /if not coalesce\(admin\.is_protected, false\) then raise exception 'Only the Main Admin can manage card payments'; end if;/);
  assert.match(code, /admin\.password_hash <> extensions\.crypt\(p_password, admin\.password_hash\)/);
  assert.match(code, /if not public\.app_card__allowed_for\(uid\) then\s*raise exception 'Card payments are coming soon/);
  assert.match(code, /\(243,'app_card_billing_settings', 'system'/);
  assert.doesNotMatch(code, /\b(alter table public\.app_(users|card_checkout_sessions|card_payments)|drop table|drop function|truncate)\b/i);
  const js = read("Assets/app/billing/01-card-payments.js");
  assert.match(js, /supabaseRpc\("app_card_billing_status", \{\}\)/);
  assert.match(js, /Coming soon<\/em>/);
  assert.doesNotMatch(js, /cardtest|previewOnly/);
  const admin = read("Assets/app/billing/02-card-billing-admin.js");
  assert.match(admin, /supabaseRpc\("app_admin_card_billing_set", \{ p_enabled: enable, p_password: st\.pw/);
  assert.match(read("index.html"), /id="adminCardPaymentsBtn"/);
  assert.match(read("Assets/app/admin/01-admin.js"), /getElementById\("adminCardPaymentsBtn"\)\?\.classList\.toggle\("hide", !allowed\)/);
});
