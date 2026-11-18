// One menu style, Backup and Account Settings side panels, expenses records in the history style.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const read = p => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

test("every action menu takes its look from 76-menu-system.css; section files keep position only", () => {
  const css = read("Assets/style/76-menu-system.css");
  for (const cls of [".home-card-menu", ".expense-tx-menu", ".loan-tx-menu", ".exh-menu", ".btc2-menu", ".inv2-menu-pop", ".assets-pdf-menu", ".expense-history-pdf-menu", ".tm-lang-menu", "#insuranceFloatingMenu"]) assert.ok(css.includes(cls), cls);
  assert.match(css, /html:is\(#m-a,\*\):is\(#m-b,\*\):is\(#m-c,\*\) body/, "menus moved to <body> must match too");
  assert.match(css, /:is\(\.hide,\[hidden\]\)\{display:none !important\}/, "hidden rows stay hidden");
  assert.match(read("scripts/build_feature_css_bundle.js"), /76-menu-system\.css/);
  assert.doesNotMatch(read("Assets/style/66-workspace-home-v2.css"), /\.home-card-menu button\{/);
  assert.doesNotMatch(read("Assets/style/68-sections-v2.css"), /Same menu style as Add/);
  assert.doesNotMatch(read("Assets/style/74-expenses-history-v3.css"), /\.exh-menu button\{/);
  for (const f of ["Assets/app/ui/01-render-navigation.js", "Assets/app/inventory/02-inventory-sales-drafts.js"]) assert.doesNotMatch(read(f), /☰<\/button>/, f);
  const js = read("Assets/app/ui/13-menu-system.js");
  assert.match(js, /addEventListener\("pointerdown", e => \{[^\n]*closeAll\(e\.target\)/);
  assert.match(js, /e\.key === "Escape"/);
});

test("account menu: Backup and Account Settings; moved controls stay for their handlers", () => {
  const html = read("index.html");
  const menu = html.slice(html.indexOf('data-entry-menu-panel="account"'), html.indexOf('id="logoutBtn"'));
  assert.match(menu, /id="userBackupBtn"[^>]*>.*Backup<\/button>/);
  const moved = menu.slice(menu.indexOf('class="account-menu-moved" hidden'));
  for (const id of ["downloadAllSectionsPdfBtn", "downloadAllDataJsonBtn", "downloadAllDataCsvBtn", "userBackupRestoreBtn", "importJsonInput", "planSubscriptionBtn", "companyTeamBtn", "taxSettingsBtn"]) assert.ok(moved.includes(`id="${id}"`), id);
  const bk = read("Assets/app/backup/03-backup-panel.js");
  for (const f of ["exportAllSectionsPDF()", "downloadJsonBackup()", "downloadCsvBackup()", "importBackupFile(file)", "global.TriplemBackup?.open?.()"]) assert.ok(bk.includes(f), f);
  const hub = read("Assets/app/ui/14-account-hub.js");
  assert.match(hub, /global\.openAccountSettingsModal = f;/);
  for (const t of ['"profile"', '"security"', '"plan"', '"team"', '"vat"']) assert.ok(hub.includes(t), t);
  assert.match(hub, /supabaseRpc\("app_team_list_members", \{\}\)/);
});

test("expenses history: 50 per Load more, never on scroll; Receiving and Transfers in the history style", () => {
  const exh = read("Assets/app/expenses/07-expenses-history-v3.js");
  assert.match(exh, /const STEP = 50;/);
  assert.doesNotMatch(exh, /S\.autoMore/);
  assert.match(exh, /function renderRecords\(ctx\)/);
  const w = read("Assets/app/expenses/01-expenses-wallets.js");
  assert.match(w, /kind: "receiving", records/);
  assert.match(w, /kind: "transfers", records/);
});
