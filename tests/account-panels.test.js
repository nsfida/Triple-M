"use strict";
// Account menu side panels (2026-11-17): VAT Settings, Default start page, Help & Support in the
// shared side panel; Account settings / security / team / plan / backup / download as side sheets;
// deleted expenses placed in their own day.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");

function loadPanels(){
  const ctx = { window: {}, document: { readyState: "complete", addEventListener(){}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], documentElement: { dataset: {}, classList: { contains: () => false } } },
    navigator: { userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/130.0", onLine: true }, location: { host: "triplem.vip" }, Intl, console,
    SUPPORTED_CURRENCIES: ["USD", "AED"], DEFAULT_TAX_SETTINGS: { USD: { rate: 0, mode: "ADD" }, AED: { rate: 0, mode: "ADD" } }, TAX_MODE_ADD: "ADD", TAX_MODE_INCLUDE: "INCLUDE",
    normalizeTaxRate: v => Math.max(0, Math.min(100, Number(v) || 0)), normalizeTaxMode: v => String(v).toUpperCase() === "INCLUDE" ? "INCLUDE" : "ADD",
    trimInventoryNumber: n => String(Number(n)), state: { sessionUser: { username: "demo" } } };
  ctx.window = ctx; ctx.addEventListener = () => {};
  vm.createContext(ctx);
  vm.runInContext(read("Assets/app/ui/12-account-panels.js"), ctx);
  return ctx.TriplemAccountPanels;
}

test("account panels: loaded on every page and in the style bundle", () => {
  const html = read("index.html");
  assert.match(html, /Assets\/app\/ui\/12-account-panels\.js\?v=/);
  assert.match(read("scripts/build_feature_css_bundle.js"), /75-account-panels\.css/);
  assert.match(read("Assets/style/app.feature.bundle.css"), /\.tm-vat-row\{/);
});

test("VAT panel: live example is right for 'add on top' and 'included'", () => {
  const P = loadPanels();
  const add = P._test.vatExample("AED", { rate: 5, mode: "ADD" }).replace(/<[^>]+>/g, "");
  assert.match(add, /AED 100\.00 \+ 5% = AED 105\.00/);
  const inc = P._test.vatExample("INR", { rate: 18, mode: "INCLUDE" }).replace(/<[^>]+>/g, "");
  assert.match(inc, /includes INR 15\.25 VAT/);
  assert.match(inc, /net 84\.75/);
  assert.match(P._test.vatExample("USD", { rate: 0, mode: "ADD" }), /No VAT is added/);
});

test("VAT panel saves with the app's own code (same steps as the old dialog)", () => {
  const js = read("Assets/app/ui/12-account-panels.js");
  assert.match(js, /await saveTaxSettingsPreferenceToDatabase\(next\);/);
  assert.match(js, /syncGoodsPurchaseTaxDefaults\(true\)/);
  assert.match(js, /syncExpenseTaxDefaults\(true\)/);
  assert.match(js, /state\.taxSettingsSaving = true;/);
  assert.match(js, /await savePreferredDefaultTab\(st\.sel\);/);
  assert.doesNotMatch(js, /supabase\(|supabaseRpc\(|localStorage\.setItem/);   // no new storage or calls
  // the old dialogs stay as a fallback
  assert.match(js, /return base\.apply\(this, arguments\);/);
  for (const n of ["openTaxSettingsModal", "openDefaultStartPageModal", "openUserHelpSupportModal"]) assert.match(js, new RegExp(`wrap\\("${n}"`));
});

test("Help: support details never include secrets", () => {
  const P = loadPanels();
  const rows = P.supportDetails();
  const keys = rows.map(r => r[0]).join(",");
  assert.match(keys, /App,Account,Open page,Browser,System,Screen,Language,Theme,Connection,Time zone,Local time/);
  assert.doesNotMatch(JSON.stringify(rows), /password|token|pin|secret|key/i);
  assert.ok(P._test.HELP_TOPICS.length >= 6);
});

test("account dialogs become side sheets; short security prompts stay centred", () => {
  const js = read("Assets/app/ui/09-side-sheets.js");
  for (const id of ["accountSettingsModal", "accountSecurityCenterModal", "companyTeamModal", "planSubscriptionModal", "userBackupModal", "accountProfileEditModal", "accountCompanyEditModal", "accountPasswordChangeModal"]) assert.match(js, new RegExp(`${id}: "`));
  assert.match(js, /const ACCOUNT_CHILD = "\.account-settings-child-modal";/);
  assert.match(js, /\.account-security-password-prompt, \.trusted-recovery-incoming-modal";/);
  assert.doesNotMatch(js, /#accountSettingsModal, \.account-settings-child-modal/);
  assert.match(read("Assets/style/75-account-panels.css"), /html body \.triplem-apps-overlay \.triplem-apps-modal\{align-self:stretch !important/);
});

test("page scroll safety net only lifts the lock when nothing is open", () => {
  const js = read("Assets/app/ui/12-account-panels.js");
  assert.match(js, /function anythingOpen\(\)/);
  assert.match(js, /if \(anythingOpen\(\)\) return;/);
  assert.match(js, /\["wheel", "touchstart", "keydown"\]\.forEach\(t => document\.addEventListener\(t, scrollGuard, \{ passive: true, capture: true \}\)\);/);
});

test("Expenses history: deleted transactions are placed in their own day", () => {
  const js = read("Assets/app/expenses/07-expenses-history-v3.js");
  assert.match(js, /const all = placeInactive\(flatten\(ctx\.items\), ctx\);/);
  assert.match(js, /return list\.filter\(t => !t\.auditStatus \|\| dayStamp\(t\.date\) >= oldest\);/);
  assert.match(js, /if \(!ctx\.hasMore\) return list;/);
  assert.match(js, /\$\{del \? ` · \$\{del\} deleted` : ""\}/);
  assert.match(read("Assets/style/74-expenses-history-v3.css"), /\.exh-del\{/);
});
