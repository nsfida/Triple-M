"use strict";
// Expenses history v3, transaction side panel, wallet "Go to date", PDF progress bar,
// existing-item check and plain wallet-card icons (2026-11-17).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");

function loadHistory(){
  const ctx = { window: {}, globalThis: null, document: { querySelector: () => null, addEventListener(){} }, console };
  ctx.globalThis = ctx.window;
  vm.createContext(ctx);
  vm.runInContext(read("Assets/app/expenses/07-expenses-history-v3.js"), ctx);
  return ctx.window.TriplemExpenseHistory;
}

test("history v3: loaded in the page after the expenses scripts, with its stylesheet in the bundle", () => {
  const html = read("index.html");
  const a = html.indexOf("Assets/app/expenses/06-wallet-logos.js");
  const b = html.indexOf("Assets/app/expenses/07-expenses-history-v3.js?v=");
  assert.ok(a > 0 && b > a);
  assert.ok(html.indexOf("Assets/app/ui/11-pdf-progress.js?v=") > html.indexOf("Assets/app/ui/10-detail-panels.js"));
  const bundle = read("Assets/style/app.feature.bundle.manifest.json");
  assert.match(bundle, /74-expenses-history-v3\.css/);
  assert.match(bundle, /73-pdf-progress\.css/);
});

test("history v3: transactions are listed directly (no per-item banners) with skeleton rows while loading", () => {
  const js = read("Assets/app/expenses/01-expenses-wallets.js");
  assert.match(js, /expenseRecordView === "history" && window\.TriplemExpenseHistory/);
  assert.match(js, /window\.TriplemExpenseHistory\.render\(\{/);
  assert.match(js, /window\.TriplemExpenseHistory\.showSkeleton\(\)/);
  // 40 per page with "Load more"; exact totals from one page of up to 100 item summaries
  assert.match(js, /window\.TriplemExpenseHistory \? 40 : 10/);
  assert.match(js, /window\.TriplemExpenseHistory \? 100 :/);
  const H = loadHistory();
  const items = [
    { key: "AED||fuel", displayName: "Fuel", expenseType: "Transport", currency: "AED", txs: [
      { id: "a", date: "2026-11-16", amount: 50, createdAt: "2026-11-16T08:00:00Z" },
      { id: "b", date: "2026-11-17", amount: 20, createdAt: "2026-11-17T09:00:00Z" }] },
    { key: "AED||tea", displayName: "Tea", expenseType: "Food", currency: "AED", txs: [
      { id: "c", date: "2026-11-17", amount: 5, createdAt: "2026-11-17T10:00:00Z", auditStatus: "deleted" }] }
  ];
  const flat = H._test.flatten(items);
  assert.equal(flat.length, 3);
  assert.equal(H._test.sorted(flat).map(t => t.id).join(","), "c,b,a"); // newest first
  H._test.state.sort = "high";
  assert.equal(H._test.sorted(flat).map(t => t.id).join(","), "a,b,c");
  H._test.state.sort = "newest";
  const totals = H._test.localTotals(flat);
  assert.equal(totals.byCur.get("AED").total, 70); // deleted rows are not counted
  assert.equal(totals.count, 2);
  assert.equal(totals.types.size, 1);
});

test("history v3: Select mode downloads the chosen transactions as PDF (detailed or summary) or CSV", () => {
  const js = read("Assets/app/expenses/07-expenses-history-v3.js");
  assert.match(js, /data-exh-select="on"/);
  assert.match(js, /data-exh-pdf="detailed"/);
  assert.match(js, /data-exh-pdf="summary"/);
  assert.match(js, /downloadExpenseTransactionsHistoryPDF\(mode, \{ items, rangeLabel:/);
  assert.match(js, /data-exh-csv/);
  const exports = read("Assets/app/reports/02-exports.js");
  assert.match(exports, /async function downloadExpenseTransactionsHistoryPDF\(mode = "detailed", options = \{\}\)/);
  assert.match(exports, /const items = chosen \? chosen : await loadExpenseHistoryItemsForPdf/);
});

test("history v3: search can cover all dates or only the selected dates", () => {
  const js = read("Assets/app/expenses/01-expenses-wallets.js");
  assert.match(js, /search && state\.expenseHistorySearchScope === "range"/);
  assert.match(js, /mode: "search-range"/);
  assert.match(js, /const searchAllDates = search && state\.expenseHistorySearchScope !== "range"/);
  assert.match(read("Assets/app/expenses/07-expenses-history-v3.js"), /data-exh-scope="range"/);
});

test("transaction opens in the side panel (not a floating dialog), with overview, details, item history and change log", () => {
  const js = read("Assets/app/ui/10-detail-panels.js");
  assert.match(js, /function openExpenseTx\(id, opts = \{\}\)/);
  assert.match(js, /function openExpenseRecord\(type, id\)/);
  assert.match(js, /global\.openExpenseTransactionDetail = f/);
  assert.match(js, /global\.openExpenseRecordDetail = f/);
  for (const tab of ['["overview", "Overview"', '["details", "Details"', '["item", "This item"', '["history", "Change log"']) assert.ok(js.includes(tab), tab);
  for (const act of ["tx-edit", "tx-dup", "tx-pdf", "tx-copy", "tx-delete", "tx-go", "tx-att", "tx-item-all", "tx-back"]) assert.ok(js.includes(`"${act}"`), act);
  // after Edit is saved the panel returns to the transaction
  assert.match(js, /if \(txReturnAfterEdit\) \{ const back = txReturnAfterEdit; txReturnAfterEdit = ""; if \(openExpenseTx\(back\)\) return; \}/);
  assert.doesNotMatch(js, /supabase\(|supabaseRpc\(/);
  assert.match(read("Assets/app/expenses/03-expense-audit-pagination.js"), /loadHistory, historyHtml, logicalEditCount,/);
});

test("wallet panel: Activity has Go to date (on or before the chosen day) and rows open the transaction", () => {
  const js = read("Assets/app/ui/10-detail-panels.js");
  assert.match(js, /data-dp-goto/);
  assert.match(js, /fetchExpenseActivityRpc\(\{ groupId: gid, to: st\.at \|\| null, limit: WALLET_PAGE/);
  assert.match(js, /"goto-clear":/);
  // typing a year must not redraw the field half-way (0002, 0020, 0202, …)
  assert.match(js, /if \(!m \|\| Number\(m\[1\]\) < 1900 \|\| \(input\.max && v > input\.max\) \|\| v === st\.at\) return;/);
  // typing over an earlier date waits for a pause / Enter / blur; a calendar pick moves at once
  assert.match(js, /input\.addEventListener\("change", \(\) => \{ if \(typing\) later\(\); else commit\(\); \}\);/);
  assert.match(js, /if \(e\.target\.closest\?\.\("\[data-dp-goto\]"\)\) return;/);
  assert.match(js, /data-dp-act="w-tx"/);
});

test("wallet panel: Receive / Transfer saved in the panel confirm inside the panel", () => {
  const js = read("Assets/app/ui/10-detail-panels.js");
  assert.match(js, /global\.showMoneyAddedSuccessOverlay = function\(walletName, amount, currency\)\{\n\s+if \(panelForm\(\) && showDoneSheet\(/);
  assert.match(js, /global\.showTransferSuccessOverlay = function\(fromAccount, toAccount, amount, currency\)\{\n\s+if \(panelForm\(\) && showDoneSheet\(/);
  assert.match(js, /return base\.apply\(this, arguments\);/);      // outside the panel: the page overlay as before
  assert.match(js, /if \(doneSheetOpen\(\)\) \{ closeDoneSheet\(\); return; \}/);
  assert.match(read("Assets/style/74-expenses-history-v3.css"), /\.tm-dp-done\{/);
});

test("PDF progress: compact bar for every PDF (jsPDF hook + PDF buttons), never blocks the page", () => {
  const js = read("Assets/app/ui/11-pdf-progress.js");
  assert.match(js, /ns\.jsPDF = jsPDF/);
  assert.match(js, /doc\.save = function/);
  assert.match(js, /wrap\("addPage"/);
  assert.match(js, /wrap\("autoTable"/);
  assert.match(js, /action === "pdf-menu"/);              // a menu trigger is not a PDF
  assert.match(js, /btn\.querySelector\("button, a, \[role=menuitem\], select, input"\)\) return false/); // rows are not buttons
  const css = read("Assets/style/73-pdf-progress.css");
  assert.match(css, /pointer-events:none/);
  assert.match(css, /bottom:calc\(/);
  // the long Expenses export reports exact progress through the same bar (no blocking dialog)
  assert.match(read("Assets/app/reports/02-exports.js"), /window\.TriplemPdfProgress\.begin\("Preparing PDF"\)/);
});

test("existing item check: any date, server lookup when not loaded, canonical spelling on save", () => {
  const js = read("Assets/app/expenses/01-expenses-wallets.js");
  assert.match(js, /function refreshExpenseItemIntentUi\(\)/);
  assert.match(js, /fetchExpenseItemSummariesRpc\(\{ search: typed, limit: 25 \}\)/);
  assert.match(js, /normalizeExpenseItemName\(it\?\.item_name\)\.toLowerCase\(\) === nameLower/);
  assert.match(js, /if \(itemExists && itemIntent !== "new_distinct" && knownItem\?\.name && nameLower !== currentItemName\) itemName = knownItem\.name;/);
  assert.match(js, /if \(typed\.length < 2\) \{ hide\(\); return; \}/);
});

test("wallet cards: PDF / Edit / Delete are plain icons without circles", () => {
  const css = read("Assets/style/74-expenses-history-v3.css");
  assert.match(css, /\.overview-card-actions \.tiny:not\(\.ev2-act\)\{[^}]*border:0 !important;border-radius:6px !important;background:transparent !important/);
});

test("Arabic and Urdu: new texts are translated", () => {
  const rows = JSON.parse(read("i18n/src/r2-039.json"));
  const keys = new Set(rows.map(r => r[0]));
  for (const k of ["Preparing PDF", "PDF ready", "Go to date", "This item", "Change log", "Newest first", "already exists", "Add this spend to the same item, or keep it separate?"]) assert.ok(keys.has(k), k);
  for (const r of rows) assert.ok(r[1] && r[2], r[0]);
});
