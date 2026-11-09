"use strict";

/* Guards for Triplem VIP for Windows 3.8 and the Accounting upgrade:
 *  - lock screen that never overflows (layout in Go, measured text, ellipsis)
 *  - Windows app menu as an accordion, without "Print this page" or hint texts
 *  - two-key shortcuts (Ctrl = anywhere, Alt = this section, Alt+1…9, Ctrl+S)
 *  - Backup & Restore in the Windows app with a schedule and a backup folder
 *  - Accounting: settings, numbering, defaults, reports, ledger, statements
 *  - migrations 207 (numbering prefixes) and 208 (document save fix). */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const has = rel => fs.existsSync(path.join(root, rel));
const text = rel => fs.readFileSync(path.join(root, rel), "utf8");
const nativeDir = "scripts/windows_app/native";
const skipNative = has(`${nativeDir}/backup.go`) ? false : "Windows app source not present in this checkout";
// SQL migrations are kept out of the public repository: these checks run only where they exist.
const skipSql = files => files.every(has) ? false : "Database migrations are not present in this checkout";

test("3.8 lock screen: measured text, layout that cannot overflow, no flicker", { skip: skipNative }, () => {
  const lock = text(`${nativeDir}/applock.go`);
  assert.match(lock, /lay := layoutLockScreen\(lockLayoutIn\{/);
  assert.match(lock, /lw2, _ := measureText\(dc, btnF, lockButtonLabel\(true\), 0, DT_SINGLELINE\)/, "the button is sized for its longest label");
  assert.match(lock, /DT_CENTER\|DT_SINGLELINE\|DT_VCENTER\|DT_END_ELLIPSIS/);
  assert.match(lock, /procBitBlt\.Call\(hdc, 0, 0/, "drawn off-screen first");
  assert.match(lock, /case WM_MOUSEMOVE:/);
  assert.match(text(`${nativeDir}/main.go`), /case WM_LBUTTONUP, WM_KEYDOWN, WM_SETCURSOR, WM_MOUSEMOVE:/);
  assert.match(text(`${nativeDir}/logic38_test.go`), /func TestLockLayoutNeverOverflows/);
});

test("3.8 backup: only announced backup files, saved without overwriting, pruning limited to the account's own backups", { skip: skipNative }, () => {
  const b = text(`${nativeDir}/backup.go`);
  const logic = text(`${nativeDir}/logic38.go`);
  assert.match(b, /if !validBackupFileName\(name\) \{\s*return\s*\}/);
  assert.match(b, /if !matchesExpectedBackup\(filepath\.Base\(defPath\), expectedBackup\) \{/);
  assert.match(b, /return uniqueBackupPath\(dir, name, exists\), true, false, ""/);
  assert.match(b, /for _, old := range backupsToPrune\(names, keep, filepath\.Base\(path\)\) \{/);
  assert.match(logic, /if validBackupFileName\(n\) && backupAccountPrefix\(n\) == prefix \{/);
  assert.match(b, /resumePage\(\) \/\/ a paused page cannot build the file/);
  assert.match(text(`${nativeDir}/background.go`), /if backupBusy\(\) \{ \/\/ 3\.8: never pause the page while it builds a backup/);
  assert.match(text(`${nativeDir}/downloads.go`), /path, isBackup, dialog, failReason := takeBackupDownload\(p\.defPath\)/);
  assert.match(text(`${nativeDir}/bridge.go`), /"backup", "appkeys",/);
  assert.match(text(`${nativeDir}/logic.go`), /"backup-schedule": true, "backup-folder": true, "backup-open-folder": true, "backup-now": true,/);
});

test("3.8 Windows app menu: accordion banners, one open at a time, no print item or hint texts", () => {
  const js = text("Assets/app/desktop/01-windows-desktop.js");
  assert.match(js, /function setAccordion\(id\)/);
  assert.match(js, /const open = sec\.dataset\.acc === local\.openAcc;/);
  assert.match(js, /if \(body\) body\.inert = !open;/);
  assert.match(js, /\.dam-acc-body\{display:grid;grid-template-rows:0fr;transition:grid-template-rows \.28s/);
  assert.doesNotMatch(js, /Print this page/);
  assert.doesNotMatch(js, /data-dam="print"/);
  assert.doesNotMatch(js, /Keeps notifications arriving|Opens quietly in the notification area|Installs only when you choose Restart/);
  for (const id of ["sync", "backup", "security", "notify", "keys", "updates"]) assert.match(js, new RegExp(`accItem\\("${id}"`));
});

test("3.8 shortcuts: two keys, only inside the app, safe in forms", () => {
  const js = text("Assets/app/desktop/01-windows-desktop.js");
  for (const code of ["KeyK", "KeyN", "KeyE", "KeyI", "KeyH", "KeyD", "KeyJ", "KeyM", "KeyR", "KeyB", "KeyL", "Comma", "Slash"]) {
    assert.match(js, new RegExp(`\\{ code: "${code}", keys: \\["Ctrl", "`), code);
  }
  assert.match(js, /if \(alt && \/\^Digit\[1-9\]\$\/\.test\(e\.code\) && signedIn && !modal && !e\.repeat\)/);
  assert.match(js, /if \(primary\.length === 1\) btn = primary\[0\];/, "Ctrl+S only clicks an unambiguous save button");
  assert.match(js, /if \(modal && e\.code === "KeyR"\) \{ e\.preventDefault\(\); return; \} \/\/ never reload over an open form/);
  const sec = text("Assets/app/ui/03-section-shortcuts.js");
  assert.match(sec, /return WINDOWS_APP \? \["Alt", k\] : \["Ctrl", "Alt", k\];/);
  assert.match(sec, /code === `Key\$\{shortcut\.key\.toUpperCase\(\)\}`/, "works with Arabic, Urdu and other layouts");
  for (const s of ["goods", "insurance", "audit", "accounting", "triplem-ai"]) assert.match(sec, new RegExp(`registerSectionShortcuts\\("${s}"`));
});

test("3.8 backup in the app reuses the account backup and its restore", () => {
  const js = text("Assets/app/desktop/01-windows-desktop.js");
  assert.match(js, /const out = await api\.createFile\(\{/);
  assert.match(js, /send\("backup-expect", \{ name: out\.filename, auto \}\);/);
  assert.match(js, /if \(typeof window\.TriplemBackup\?\.open === "function"\) window\.TriplemBackup\.open\(\);/);
  const ui = text("Assets/app/backup/02-backup-ui.js");
  assert.match(ui, /async function createFile\(\{ onProgress \} = \{\}\) \{\s*if \(!isOwner\(\)\)/);
  assert.match(ui, /const out = await E\(\)\.createBackup\(d, \{ password: "", signal: quietRun\.signal/);
});

test("migration 207 replaces only the prefix function and falls back to the old prefixes", { skip: skipSql(["migrations/207_accounting_document_prefixes.sql"]) }, () => {
  const sql = text("migrations/207_accounting_document_prefixes.sql").replace(/^--.*$/gm, "");
  const fns = [...sql.matchAll(/create or replace function public\.([a-z_]+)/g)].map(m => m[1]);
  assert.deepEqual(fns, ["app_accounting_document_prefix"]);
  assert.doesNotMatch(sql, /\b(alter table|drop table|truncate|delete from|update public\.|insert into)\b/i);
  assert.match(sql, /custom ~ '\^\[A-Z0-9\]\{1,8\}\$'/);
  for (const [t, p] of [["quotation", "QUO"], ["sales_invoice", "INV"], ["purchase_bill", "BILL"], ["expense_invoice", "EXP"]]) assert.match(sql, new RegExp(`when '${t}' then '${p}'`));
});

test("migration 208 is the 149 document save with one added directive", { skip: skipSql(["migrations/149_full_accounting_erp_core.sql", "migrations/208_accounting_document_save_fix.sql"]) }, () => {
  const m149 = text("migrations/149_full_accounting_erp_core.sql");
  const m208 = text("migrations/208_accounting_document_save_fix.sql");
  const block = s => s.slice(s.indexOf("create or replace function public.app_accounting_save_document"), s.indexOf("grant execute on function public.app_accounting_save_document"));
  assert.equal(block(m208).replace("#variable_conflict use_variable\n", ""), block(m149));
  assert.match(block(m208), /as \$\$\n#variable_conflict use_variable\ndeclare/);
  const fns = [...m208.replace(/^--.*$/gm, "").matchAll(/create or replace function public\.([a-z_]+)/g)].map(m => m[1]);
  assert.deepEqual(fns, ["app_accounting_save_document"]);
  const schema = text("scripts/build_full_schema_sql.js");
  assert.match(schema, /"207_accounting_document_prefixes\.sql",\n  "208_accounting_document_save_fix\.sql",\n/);
});

function loadAccounting() {
  const g = { console, setTimeout, clearTimeout, Date, Math, Number, String, Array, Object, JSON, RegExp, Set, Map, Promise, Intl };
  g.window = g;
  g.document = { readyState: "loading", addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
  vm.createContext(g);
  vm.runInContext(text("Assets/app/accounting/01-accounting-suite.js"), g);
  return g.TriplemAccounting;
}

test("accounting periods, comparisons and numbering", () => {
  const A = loadAccounting();
  const t = A._test;
  const plain = v => JSON.parse(JSON.stringify(v));
  const now = new Date(2026, 10, 6);
  assert.deepEqual(plain(t.periodRange("this_month", now)), ["2026-11-01", "2026-11-30"]);
  assert.deepEqual(plain(t.periodRange("last_month", now)), ["2026-10-01", "2026-10-31"]);
  assert.deepEqual(plain(t.periodRange("this_quarter", now)), ["2026-10-01", "2026-12-31"]);
  assert.deepEqual(plain(t.periodRange("last_quarter", now)), ["2026-07-01", "2026-09-30"]);
  assert.deepEqual(plain(t.periodRange("fiscal_year", now)), ["2026-01-01", "2026-12-31"], "calendar year when the financial year starts on 1 January");
  A.state.settings = { fiscal_year_start_month: 4, fiscal_year_start_day: 1, meta: { numbering: { prefixes: { sales_invoice: "TI", quotation: "bad prefix" } } } };
  assert.deepEqual(plain(t.periodRange("fiscal_year", now)), ["2026-04-01", "2027-03-31"]);
  assert.deepEqual(plain(t.periodRange("last_fiscal_year", now)), ["2025-04-01", "2026-03-31"]);
  assert.deepEqual(plain(t.periodRange("fiscal_year", new Date(2026, 1, 10))), ["2025-04-01", "2026-03-31"]);
  assert.deepEqual(plain(t.previousPeriod("2026-11-01", "2026-11-30")), ["2026-10-01", "2026-10-31"]);
  assert.deepEqual(plain(t.previousPeriod("2026-01-01", "2026-03-31")), ["2025-10-01", "2025-12-31"]);
  assert.deepEqual(plain(t.previousPeriod("2026-11-05", "2026-11-10")), ["2026-10-30", "2026-11-04"]);
  assert.equal(t.docPrefix("sales_invoice"), "TI");
  assert.equal(t.docPrefix("quotation"), "QUO", "invalid saved prefixes fall back");
  assert.equal(t.docPrefix("purchase_bill"), "BILL");
});

test("accounting settings keep unknown meta keys and only add their own", () => {
  const js = text("Assets/app/accounting/01-accounting-suite.js");
  assert.match(js, /const nextMeta=\{\.\.\.meta,/);
  assert.match(js, /ui:\{\.\.\.\(meta\.ui&&typeof meta\.ui==="object"\?meta\.ui:\{\}\),/);
  for (const s of ["function openAccountLedger", "function openContactStatement", "const SETTINGS_TABS", "function balanceJournalLines", "case \"duplicate-document\"", "case \"doc-filter\"", "Compare with previous period", "Total Liabilities & Equity", "Books locked through", "Supply Date", "Current Earnings (Unclosed)"]) {
    assert.ok(js.includes(s), s);
  }
  assert.match(js, /if\(out\)out\.innerHTML=moneyA\(tt,/, "line totals render the money markup, not raw HTML text");
});
