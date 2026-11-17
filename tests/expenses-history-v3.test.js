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
  assert.match(js, /function openExpenseRecord\(type, id, opts = \{\}\)/);
  assert.match(js, /global\.openExpenseTransactionDetail = f/);
  assert.match(js, /global\.openExpenseRecordDetail = f/);
  for (const tab of ['["overview", "Overview"', '["details", "Details"', '["item", "This item"', '["history", "Change log"']) assert.ok(js.includes(tab), tab);
  for (const act of ["tx-edit", "tx-dup", "tx-pdf", "tx-copy", "tx-delete", "tx-go", "tx-att", "tx-item-all", "tx-back"]) assert.ok(js.includes(`"${act}"`), act);
  // after Edit is saved the panel returns to the transaction
  assert.match(js, /if \(back\.type === "expense" \? openExpenseTx\(back\.id, \{ keepBack: true \}\) : openExpenseRecord\(back\.type, back\.id, \{ keepBack: true \}\)\) return;/);
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

// ── Wallet page records open in the panel (2026-11-17 d) ──────────────────────────────────
function loadPartnerFinder(entries){
  const src = read("Assets/app/inventory/01-inventory-meta-stock.js");
  const pick = name => { const i = src.indexOf(`function ${name}(`); assert.ok(i >= 0, name); let d = 0, j = src.indexOf("{\n", i); for (; j < src.length; j++) { if (src[j] === "{") d++; else if (src[j] === "}" && --d === 0) break; } return src.slice(i, j + 1); };
  const ctx = {
    window: {}, state: { entries },
    hasExpenseAccountTag: n => /\[EXPENSE_ACCOUNT\]/.test(String(n || "")),
    expenseMetaFromNotes: n => ({ rowType: (String(n || "").match(/\[ETYPE:([A-Z]+)\]/) || [])[1] || "", expenseType: (String(n || "").match(/\[XTYPE:([^\]]+)\]/) || [])[1] || "" })
  };
  vm.createContext(ctx);
  vm.runInContext([pick("expenseTransferPlainNote"), pick("findExpenseTransferPartner"), "window.f = findExpenseTransferPartner;"].join("\n"), ctx);
  return ctx.window.f;
}

test("transfer halves pair exactly, even with several identical transfers on the same day", () => {
  const out = (id, at) => ({ id, person_name: "Petty Cash", entry_kind: "partial", action_date: "2026-11-17", action_amount: 25, created_at: at, notes: "[EXPENSE_ACCOUNT] Transfer to Shop Cash Drawer [ETYPE:EXPENSE] [XTYPE:Transfer]" });
  const inn = (id, at) => ({ id, person_name: "Shop Cash Drawer", entry_kind: "partial", action_date: "2026-11-17", action_amount: 25, created_at: at, notes: "[EXPENSE_ACCOUNT] Transfer from Petty Cash [ETYPE:TOPUP] [XTYPE:Transfer]" });
  const rows = [out("e1", "2026-11-17T10:01:39.497Z"), out("e2", "2026-11-17T10:02:06.336Z"), out("e3", "2026-11-17T10:02:59.707Z"),
    inn("t1", "2026-11-17T10:01:39.497Z"), inn("t2", "2026-11-17T10:02:06.336Z"), inn("t3", "2026-11-17T10:02:59.707Z")];
  const find = loadPartnerFinder(rows);
  assert.equal(find(rows[1]).id, "t2");
  assert.equal(find(rows[4]).id, "e2");
  assert.equal(find(rows[2]).id, "t3");
  // strict: a half saved at another moment is not accepted as "already loaded"
  assert.equal(find(rows[1], [rows[3], rows[5]], { strict: true }), null);
  assert.equal(find(rows[1], [rows[3], rows[4], rows[5]], { strict: true }).id, "t2");
  // older records without a save time keep the old rule
  const legacy = [out("x1", null), inn("y1", null)];
  assert.equal(loadPartnerFinder(legacy)(legacy[0]).id, "y1");
  // a renamed wallet keeps the note-only rule
  const renamed = [out("r1", "2026-01-01T00:00:00Z"), { ...inn("s1", "2026-01-01T00:00:00Z"), person_name: "Shop Drawer (renamed)" }];
  assert.equal(loadPartnerFinder(renamed)(renamed[0]).id, "s1");
});

test("delete of a transfer uses the exact pairing", () => {
  const js = read("Assets/app/loans/01-loans-payments.js");
  assert.match(js, /transferPartner = typeof findExpenseTransferPartner === "function" \? findExpenseTransferPartner\(entry\) : null;/);
  assert.match(read("Assets/app/inventory/01-inventory-meta-stock.js"), /function findTransferPartnerForExpense\(expenseEntry\)\{\n  return findExpenseTransferPartner\(expenseEntry\);/);
});

test("records from a wallet page load on demand and never show in lists", () => {
  const js = read("Assets/app/expenses/01-expenses-wallets.js");
  assert.match(js, /function hydrateExpenseActivityRows\(rows\)\{/);
  assert.match(js, /entry\._expenseOnDemand = true;/);
  assert.match(js, /markDbSnapshotRows\(add\.concat\(\[\.\.\.replace\.values\(\)\]\)\);/);      // database copies: never re-saved
  assert.match(js, /hasExpenseAccountTag\(e\.notes\) && !e\._expenseOnDemand\)\)/);         // kept out of every wallet list
  assert.match(js, /if \(old && \(!old\._expenseOnDemand \|\| state\.pendingDbSyncIds\?\.has\?\.\(old\.id\)\)\) continue;/);
  assert.match(js, /findExpenseTransferPartner\(entry, null, \{ strict: true \}\)/);
  assert.match(js, /\|\| expenseTransferEventDirect\(id\);/);
  // the hydrate path does not write anything to the database
  const start = js.indexOf("function hydrateExpenseActivityRows"), end = js.indexOf("async function fetchExpenseGlobalSearchActivityRpc");
  assert.doesNotMatch(js.slice(start, end), /supabase\(|queueDatabasePatch|persist[A-Z]|saveEntries/);
});

test("panel: every wallet-page row opens a full record view with actions", () => {
  const js = read("Assets/app/ui/10-detail-panels.js");
  assert.match(js, /const ok = await openWalletRecord\(b\.dataset\.type, b\.dataset\.id, \{ fromWallet: gid, fromTab: P\.tab, list \}\);/);
  for (const a of ["rec-edit", "rec-again", "rec-pdf", "rec-copy", "rec-delete", "rec-att", "rec-wallet", "rec-go", "rec-copy-ref"]) assert.match(js, new RegExp(`"${a}"`));
  assert.match(js, /tabs: \[\["overview", "Overview", "fa-solid fa-receipt"\], \["details", "Details", "fa-solid fa-circle-info"\], \["history", "Change log"/);
  assert.match(js, /class="tm-dp-route"/);
  assert.doesNotMatch(js, /Open Expenses history to see this record\./);
  assert.match(read("Assets/style/74-expenses-history-v3.css"), /\.tm-dp-route\{/);
});
