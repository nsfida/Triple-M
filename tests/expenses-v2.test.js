"use strict";
// Expenses v2 (2026-11-12): Wallets/Accounts first, Expenses History swaps the view and loads
// records only when opened, compact cards (2 per row on phones), wallet overlay hero,
// Expenses Style options, wallet logo picker with Cloudflare R2 uploads, instant figures.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");
const exists = rel => fs.existsSync(path.join(root, rel));

test("Wallets/Accounts first; Expenses History replaces the wallets and is not remembered", () => {
  const html = read("index.html");
  assert.match(html, /<section class="overview wallets-overview-section expanded ev2" id="walletsOverviewSection">/);
  assert.match(html, /<h3 class="ev2-title">Wallets\/Accounts<\/h3>/);
  assert.match(html, /id="ev2HistoryBtn" aria-pressed="false" aria-controls="expensesPanel">/);
  assert.match(html, /id="ev2PrivacyBtn"/);
  assert.match(html, /id="ev2StyleBtn"/);
  assert.match(html, /<div class="overview-top hide" id="walletsBanner" hidden>/, "banner kept in the page (old bindings), hidden");
  for (const f of ["04-expenses-v2.js", "05-expenses-style.js", "06-wallet-logos.js"]) {
    assert.match(html, new RegExp(`<script defer src="Assets/app/expenses/${f.replace(/\./g, "\\.")}\\?v=[^"]+"></script>`));
  }
  const js = read("Assets/app/expenses/04-expenses-v2.js");
  assert.doesNotMatch(js, /localStorage/, "always opens on the wallets");
  assert.match(js, /ensureExpenseHistoryActivityLoaded/);
  assert.match(js, /TriplemExpensesV2 = \{ openHistory, toggleHistory, setHistory, isHistoryOpen: isOpen \}/);
  const css = read("Assets/style/67-expenses-v2.css");
  assert.match(css, /body:not\(\.ev2-history-open\) #expensesPanel\{display:none !important\}/);
  assert.match(css, /html body\.ev2-history-open #app #walletsOverviewSection\.ev2 \.wallets-content\{display:none !important\}/);
  const bundle = read("scripts/build_feature_css_bundle.js");
  assert.match(bundle, /"Assets\/style\/67-expenses-v2\.css"/);
});

test("history records are requested only when the history is open", () => {
  const w = read("Assets/app/expenses/01-expenses-wallets.js");
  assert.match(w, /function expenseHistoryIsOpen\(\)/);
  assert.match(w, /async function ensureExpenseHistoryActivityLoaded\(\)/);
  assert.match(w, /activityDeferred = true/);
  const list = w.slice(w.indexOf("function renderExpensesList(){"), w.indexOf("function renderExpensesList(){") + 900);
  assert.match(list, /listDirty = true/);
});

test("figures update straight away: writes are tracked and the refresh waits for them", () => {
  const api = read("Assets/app/core/04-entries-api.js");
  assert.match(api, /function trackExpenseWrite\(/);
  assert.match(api, /function waitForExpenseWrites\(timeoutMs = 15000\)/);
  assert.doesNotMatch(api, /setTimeout\(\s*\(\)\s*=>\s*scheduleRefresh\(\),\s*280\)/);
  const w = read("Assets/app/expenses/01-expenses-wallets.js");
  assert.match(w, /expenseLazyRefreshSeq/);
  assert.match(w, /waitForExpenseWrites/);
  const meta = read("Assets/app/core/05-meta-helpers.js");
  assert.match(meta, /function applyOptimisticExpenseLazySummaryForRows\(rows, sign = 1\)/);
  const loans = read("Assets/app/loans/01-loans-payments.js");
  assert.match(loans, /applyOptimisticExpenseLazySummaryForRows\([^)]*-1\)/, "deletes and edits adjust the figures at once");
});

test("compact cards, two per row on phones, hover zoom with mouse only, spent meter", () => {
  const css = read("Assets/style/67-expenses-v2.css");
  assert.match(css, /grid-template-columns:repeat\(auto-fill,minmax\(212px,1fr\)\)/);
  assert.match(css, /@media \(max-width:768px\)\{\s*html body #app #walletsOverviewSection\.ev2 #expenseOverviewWallets\{display:grid !important;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media \(hover:hover\)\{\s*html body #app #walletsOverviewSection\.ev2:not\(\.ev-motion-none\)/);
  assert.match(css, /zoom:var\(--ev-card-zoom,1\)/);
  const card = read("Assets/app/core/05-meta-helpers.js");
  assert.match(card, /class="ev2-meter\$\{meterTone\}"/);
  assert.match(card, /style="--wallet-accent:\$\{accent\}"/);
});

test("Expenses Style: saved per user in the existing settings, no migration", () => {
  const js = read("Assets/app/expenses/05-expenses-style.js");
  assert.match(js, /ExpensesStyle/);
  assert.match(js, /app_update_own_settings/);
  const css = read("Assets/style/67-expenses-v2.css");
  for (const c of ["ev-look-vivid", "ev-look-solid", "ev-accent-mono", "ev-motion-lift", "ev-no-meter", "ev-no-summary", "ev-phone-1"]) assert.ok(css.includes(c), c);
  assert.match(css, /html\.ev-privacy #walletsOverviewSection \.money/);
});

test("wallet overlay: hero, quick actions, Chart.js bundled locally", () => {
  const r = read("Assets/app/ui/01-render-navigation.js");
  assert.match(r, /class="wd-hero"/);
  assert.match(r, /data-wd-act/);
  assert.match(r, /Assets\/app\/lib\/chartjs-4\.4\.7\/chart\.umd\.min\.js/);
  assert.ok(exists("Assets/app/lib/chartjs-4.4.7/chart.umd.min.js"));
  assert.ok(exists("Assets/app/lib/chartjs-4.4.7/LICENSE.md"));
  assert.doesNotMatch(read("index.html"), /cdn\.jsdelivr\.net\/npm\/chart\.js/);
});

test("wallet logos: picker manifest is current; uploads go to Cloudflare R2; old logos untouched", () => {
  // The list is rebuilt automatically (npm run build:styles / verify and the production
  // build), so a logo added to the folder never breaks the checks.
  const { buildManifest } = require("../scripts/build_wallet_logo_manifest.js");
  const built = buildManifest();
  assert.ok(built.logos.length >= 1 && built.logos.every(l => exists(`Assets/logo/wallet_logos/${l.file}`)));
  assert.ok(built.logos.some(l => l.file === "triplem_default_wallet.png"));
  assert.match(JSON.parse(read("package.json")).scripts["build:styles"], /build_wallet_logo_manifest\.js/);
  assert.match(read("scripts/build_production.js"), /build_wallet_logo_manifest\.js/);
  const js = read("Assets/app/expenses/06-wallet-logos.js");
  assert.match(js, /const MODULE = "wallet_logo";/);
  assert.match(js, /directUpload\(/);
  assert.doesNotMatch(js, /storage\/v1\/object/, "no Supabase storage for new logos");
  const w = read("Assets/app/expenses/01-expenses-wallets.js");
  const change = w.slice(w.indexOf("async function changeExpenseWalletLogo("), w.indexOf("function setExpenseWalletLogoValue("));
  assert.doesNotMatch(change, /uploadWalletLogoToStorage/);
  const resolve = w.slice(w.indexOf("async function resolveWalletCustomLogoFromForm("), w.indexOf("function syncExpenseAccountCustomLogoFields("));
  assert.doesNotMatch(resolve, /uploadWalletLogoToStorage/);
  const meta = read("Assets/app/core/05-meta-helpers.js");
  assert.match(meta, /if \(\/\^r2:\/i\.test\(custom\)\)/);
  assert.match(meta, /if \(custom\) return custom;/, "existing logos keep their URL");
  assert.match(meta, /\/\\\/storage\\\/v1\\\/object\\\/\(\?:public\\\/\)\?company-logos\\\//, "existing Supabase logos still recognised");
  const att = read("Assets/app/attachments/02-attachments.js");
  assert.match(att, /directUpload, directLink, directDelete,/);
  const html = read("index.html");
  assert.match(html, /id="expenseLogoPickBtn"/);
  assert.match(html, /class="field w12 wl-legacy-field" hidden>/);
});

test("migration 225 only adds the wallet_logo module (additive, registered)", { skip: !exists("migrations/225_wallet_logo_r2_storage.sql") }, () => {
  const sql = read("migrations/225_wallet_logo_r2_storage.sql");
  assert.match(sql, /\('wallet_logo', 'expense_accounts', 'expenses'\)/);
  assert.match(sql, /\('inventory_product', 'inventory_v2_products', '#inventory_v2'\),/);
  assert.doesNotMatch(sql, /\b(drop table|delete from|truncate|alter table)\b/i);
  assert.match(read("scripts/build_full_schema_sql.js"), /"225_wallet_logo_r2_storage\.sql"/);
});

test("performance: resize re-renders only on a layout change; animations stop when switched off", () => {
  const w = read("Assets/app/expenses/01-expenses-wallets.js");
  const fn = w.slice(w.indexOf("function updateWalletsLayoutOnResize() {"), w.indexOf("function renderSearchResults(key){"));
  assert.match(fn, /if \(isDesktop === lastWalletsLayoutDesktop\) return;/);
  assert.ok(fn.length < 900, "no duplicated render code");
  const css = read("Assets/style/67-expenses-v2.css");
  assert.match(css, /html\.triplem-bg-off #walletsOverviewSection \.wallet-float-logo/);
  assert.match(css, /#expensesList \.expense-item-row:not\(\[open\]\)\{content-visibility:auto;contain-intrinsic-size:auto 76px\}/);
});

test("round 3: plain summary title, flat history, phone dropdown and short Add, more style options", () => {
  const w = read("Assets/app/expenses/01-expenses-wallets.js");
  assert.match(w, /<div class="currency-head ev2-sum-title">Summary<\/div>/);
  const html = read("index.html");
  assert.match(html, /id="ev2AddBtn" data-entry-menu="expenses"/);
  assert.match(html, /html:not\(\.auth-resuming\) #authResumeSplash \* \{ animation: none !important; \}/);
  const css = read("Assets/style/67-expenses-v2.css");
  assert.match(css, /#walletsOverviewSection#walletsOverviewSection\.ev2/);
  assert.match(css, /#expensesPanel#expensesPanel :is\(\.card\.section,\.section-head/);
  assert.match(css, /#expensesPanel \.ev2-seg\.ev2-seg--dates\{display:none !important\}/);
  assert.match(css, /:is\(\.wallet-float-logo,\.summary-watermark,\.summary-watermark-wallet-logo,\.summary-watermark-wallet-logo img\)\{animation:none !important\}/);
  const v2 = read("Assets/app/expenses/04-expenses-v2.js");
  assert.match(v2, /function openBlocks\(\)/);
  const st = read("Assets/app/expenses/05-expenses-style.js");
  for (const k of ["wt:", "bal:", "st:", "sb:", "sl:", "sum:", "corners:", "density:", "labels:"]) assert.ok(st.includes(`    ${k} [`), k);
  assert.match(st, /wt: "regular", bal: "regular", st: "regular", sb: "regular", sl: "regular"/);
});

test("2026-11-14: Add menu replaces New Entry; frameless header, filters and section bar", () => {
  const html = read("index.html");
  assert.equal((html.match(/data-entry-menu="expenses"/g) || []).length, 1, "one New Entry menu: the Add button");
  const add = html.slice(html.indexOf('<div class="menu-wrap ev2-add-wrap">'), html.indexOf('<div class="overview-top hide" id="walletsBanner"'));
  for (const id of ["openExpenseAccountBtn", "openExpenseTopupBtn", "openExpenseEntryBtn", "downloadExpensesPdfBtn"]) assert.ok(add.includes(`id="${id}"`), id);
  assert.doesNotMatch(read("Assets/app/expenses/04-expenses-v2.js"), /ev2AddExpenseBtn/);
  assert.match(html, /id="workspaceHomeBackBtn"[^>]*>\s*<i class="fa-solid fa-house"/);
  assert.match(html, /<span id="workspaceSectionIcon" class="workspace-section-icon" aria-hidden="true"><\/span>/);
  assert.match(html, /id="workspaceSectionBtn" data-entry-menu="workspace-sections"/);
  assert.match(html, /id="workspaceSectionMenu" data-entry-menu-panel="workspace-sections"/);
  assert.match(html, /<select id="workspaceSectionSelect"[^>]* hidden tabindex="-1">/, "the select stays for older code, hidden");
  assert.match(read("Assets/app/ui/01-render-navigation.js"), /function workspaceSwitchItems\(sectionKey\)\{[\s\S]*?v2Enabled[\s\S]*?"inventory2"/, "Inventory 2.0 is in the section menu");
  assert.match(html, /id="ev2AddBtn" data-entry-menu="expenses"[^>]*><span>Add<\/span>/, "Add without a plus sign");
  assert.match(html, /id="ev2ViewBtn" data-entry-menu="expenses-view"/);
  for (const v of ["history", "topups", "transfers"]) assert.ok(html.includes(`data-ev2-view="${v}"`), v);
  const nav = read("Assets/app/ui/01-render-navigation.js");
  assert.match(nav, /const icon = document\.getElementById\("workspaceSectionIcon"\);/);
  assert.match(nav, /return `Assets\/logo\/icons\/packs\/blue\/\$\{k\}\.svg\?v=[^`]+`;/, "section bar always uses the Blue pack");
  const navCss = read("Assets/style/66-workspace-home-v2.css");
  assert.match(navCss, /\.workspace-section-icon\{[^}]*background-color:var\(--primary\);/);
  assert.match(navCss, /html\.tm-kbd body #app #workspaceSectionNav/, "focus ring only for keyboard use");
  assert.match(navCss, /#triplemDesktopSearchBar\.dgs:focus-within\{box-shadow:0 1px 2px/);
  const css = read("Assets/style/67-expenses-v2.css");
  assert.match(css, /\.ev2-actions \.ev2-btn\{\s*background:none !important;border:0 !important/);
  assert.match(css, /\.compact-filter-row :is\(\.input,\.select\)\{\s*border:0 !important;background-color:transparent !important/);
  assert.match(read("Assets/style/66-workspace-home-v2.css"), /#workspaceSectionNav \.workspace-home-back\{[^}]*background:none !important/);
});

test("2026-11-14: text weight is Regular by default, saved to the account, in the Theme menu", () => {
  const js = read("Assets/app/ui/08-text-style.js");
  assert.match(js, /const SETTINGS_KEY = "TextStyle";/);
  assert.match(js, /const DEFAULT = "regular";/);
  assert.match(js, /supabaseRpc\("app_update_own_settings", \{ p_settings: \{ \[SETTINGS_KEY\]: value \} \}/);
  assert.match(read("index.html"), /<script defer src="Assets\/app\/ui\/08-text-style\.js\?v=[^"]+"><\/script>/);
  assert.match(read("Assets/app/core/07-theme.js"), /window\.TriplemTextStyle\?\.mount\?\.\(dropdown\)/);
  const css = read("Assets/style/66-workspace-home-v2.css");
  assert.match(css, /html\.tm-tw-regular :is\(#tw-a,\*\)/);
  assert.match(css, /:not\(\[class\*="fa-"\]\)/, "icons keep their weight");
  const home = read("Assets/app/ui/07-home-style.js");
  assert.match(home, /weight: "normal", captions: true/);
});

test("2026-11-14: Windows app update chip and Restart button use the theme's primary colours", () => {
  const js = read("Assets/app/desktop/01-windows-desktop.js");
  assert.match(js, /\.dab-chip\.is-update \*\{background:var\(--primary,#2457d6\)!important;background-image:none!important;color:var\(--on-primary,#fff\)!important/);
  assert.match(js, /#desktopAppMenu\.desktop-app-menu \.desktop-app-actions button\.primary\{background:var\(--primary,#2457d6\)!important/);
});

test("2026-11-14: sections v2 (Loans, Installments, Assets, Accounting, Bitcoin, Triplem AI, Admin)", () => {
  const css = read("Assets/style/68-sections-v2.css");
  for (const id of ["#givenPanel", "#takenPanel", "#installmentsPanel", "#assetsPanel", "#accountingPanel", "#bitcoinPanel", "#triplem-aiPanel", "#adminPanel"]) assert.ok(css.includes(id), id);
  assert.match(read("scripts/build_feature_css_bundle.js"), /"Assets\/style\/68-sections-v2\.css"/);
  const html = read("index.html");
  assert.doesNotMatch(html, /New Entry ▾/, "Add ▾ everywhere");
  for (const k of ["given", "received", "taken", "returned", "installments"]) assert.match(html, new RegExp(`data-entry-menu="${k}"[^>]*><span>Add</span><i class="fa-solid fa-chevron-down v2-caret"`), k);
  assert.match(html, /data-open-modal="principal"[^>]*><i class="fa-solid fa-plus" aria-hidden="true"><\/i> Loan Given/);
  assert.doesNotMatch(read("Assets/app/bitcoin/01-bitcoin.js"), /Select Saved Address ▾/);
});
