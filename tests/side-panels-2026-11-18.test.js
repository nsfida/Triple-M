// Plan & Subscription, notifications and installment schedule in the side panel (2026-11-18).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const read = p => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

test("Plan & Subscription opens in the side panel: card (Coming soon while off) and bank transfer on request", () => {
  const js = read("Assets/app/billing/03-plan-panel.js");
  assert.match(js, /global\.openPlanSubscriptionModal = f;/);
  assert.match(js, /fallback \? fallback\.apply\(global, arguments\)/, "the previous dialog stays as a fallback");
  assert.match(js, /!v\.cardOn \? tag\("Coming soon", "is-soon"\)/);
  assert.match(js, /const cardOff = !v\.cardOn \|\| v\.renewing \|\| v\.seats > 0;/);
  assert.match(js, /if \(!bank\) return k\.section\("Choose your bank", list\);/, "bank details only after a bank is chosen");
  assert.match(js, /supabaseRpc\("app_request_pro_subscription_v2", payload\)/);
  assert.match(js, /if \(st\.loading && !st\.sub\) return `<div class="tm-dp-txhero is-transfer">\$\{k\.skel\(3\)\}/, "skeleton while loading");
  const html = read("index.html");
  assert.ok(html.indexOf("billing/02-card-billing-admin.js") < html.indexOf("billing/03-plan-panel.js"));
  for (const f of ["ar/index.html", "ur/index.html"]) assert.match(read(f), /billing\/03-plan-panel\.js/);
});

test("notifications open in the side panel with details, actions and recent notifications", () => {
  const js = read("Assets/app/notifications/02-notification-panels.js");
  for (const n of ["openNotificationDetail", "openSubscriptionNotificationDetails", "openAccessRequestDetails"]) assert.match(js, new RegExp(`global\\.${n} = wrap\\(`));
  assert.match(js, /global\.closeNotificationDetail = c;/);
  assert.match(js, /\["recent", "Recent"/);
  for (const f of ["index.html", "ar/index.html", "ur/index.html"]) assert.match(read(f), /notifications\/02-notification-panels\.js/);
});

test("wallet activity rows open the transaction; no row buttons; long schedules stay light", () => {
  const dp = read("Assets/app/ui/10-detail-panels.js");
  const rows = dp.slice(dp.indexOf("function walletRowsHtml"), dp.indexOf("function openWallet("));
  assert.doesNotMatch(rows, /tx-edit|tx-pdf|tx-delete/);
  assert.match(dp, /const LIMIT = 12, shown = st\.allOpen \? openSlots : openSlots\.slice\(0, LIMIT\);/);
  assert.match(dp, /"toggle-paid": \(b, st\) =>/);
  const css = read("Assets/style/69-admin-user-manager.css");
  assert.doesNotMatch(css, /\.tm-dp-rows li\{content-visibility:auto/, "rows of unknown height made scrolling jump");
  assert.match(css, /\.aum-root\.is-open \.aum-panel\{opacity:1;transform:none;transition:opacity \.26s ease,transform \.38s /);
  assert.match(css, /animation:tmSheetOut \.32s /);
});
