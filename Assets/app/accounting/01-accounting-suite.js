/* Triplem VIP Accounting Suite
 * Additive full double-entry workspace. Existing Expenses, Inventory, Assets,
 * Loans and operational ledgers remain independent and untouched.
 */
(function (global) {
  "use strict";

  const VIEWS = [
    ["overview", "Overview", "fa-solid fa-chart-pie"],
    ["accounts", "Chart of Accounts", "fa-solid fa-list-ol"],
    ["journals", "Journals", "fa-solid fa-book"],
    ["sales", "Sales", "fa-solid fa-file-invoice-dollar"],
    ["purchases", "Purchases", "fa-solid fa-cart-flatbed"],
    ["contacts", "Contacts", "fa-solid fa-address-book"],
    ["reconciliation", "Reconciliation", "fa-solid fa-scale-balanced"],
    ["tax", "Tax", "fa-solid fa-percent"],
    ["reports", "Reports", "fa-solid fa-chart-column"],
    ["dimensions", "Dimensions", "fa-solid fa-diagram-project"],
    ["audit", "Audit", "fa-solid fa-clock-rotate-left"],
  ];

  const SALES_TYPES = new Set(["quotation", "sales_order", "delivery_note", "sales_invoice", "credit_note", "sales_return"]);
  const PURCHASE_TYPES = new Set(["purchase_order", "purchase_receipt", "purchase_bill", "debit_note", "purchase_return", "expense_invoice"]);
  const POSTABLE_TYPES = new Set(["sales_invoice", "credit_note", "sales_return", "purchase_bill", "debit_note", "purchase_return", "expense_invoice"]);
  const RECEIVABLE_TYPES = new Set(["sales_invoice"]);
  const PAYABLE_TYPES = new Set(["purchase_bill", "expense_invoice"]);

  const DOC_LABELS = {
    quotation: "Quotation",
    sales_order: "Sales Order",
    delivery_note: "Delivery Note",
    sales_invoice: "Sales Invoice",
    credit_note: "Credit Note",
    sales_return: "Sales Return",
    purchase_order: "Purchase Order",
    purchase_receipt: "Purchase Receipt",
    purchase_bill: "Purchase Bill",
    debit_note: "Debit Note",
    purchase_return: "Purchase Return",
    expense_invoice: "Expense Invoice",
  };

  const VIEW_GUIDES = {
    overview: ["Start here", "Review cash, receivables, payables and profit before opening a detailed workflow.", "Use the health cards to jump directly to sales, purchases, reconciliation or audit history."],
    accounts: ["Build the ledger first", "Accounts classify every posting. System accounts are protected and historical accounts are archived instead of erased.", "Create or refine accounts before entering journals and financial documents."],
    journals: ["Balanced adjustments", "A journal must contain equal debits and credits. Drafts can be edited or deleted; posted journals are corrected by a void reversal.", "Use journals for adjustments that do not belong to the sales or purchase document flow."],
    sales: ["Customer workflow", "Prepare sales documents as drafts, issue postable documents, then record receipts against open invoices.", "Drafts can be edited or deleted. Issued records are preserved and cancelled through the accounting lifecycle."],
    purchases: ["Supplier workflow", "Prepare purchase documents as drafts, post supplier liabilities, then record payments against open bills.", "Drafts can be edited or deleted. Posted records remain auditable and are corrected through controlled cancellation or adjustment documents."],
    contacts: ["Reusable parties", "Keep customer and supplier identity, tax and payment terms in one master record.", "Contacts already used by accounting history are archived rather than destroyed, so old documents remain intelligible."],
    reconciliation: ["Match evidence to books", "Import or enter bank statement rows, then match each row to a posted journal.", "Unmatch a row before editing or deleting it. Ignored rows remain visible as reconciliation evidence until removed."],
    tax: ["Tax analysis", "The period filter controls VAT analysis and the management corporate-tax estimate shown on this page.", "Tax codes can be refined or archived without altering historical document values. The corporate-tax figure is an estimate only."],
    reports: ["Read-only financial output", "Run reports for a selected period and export them to CSV or PDF.", "Reports are calculated from posted ledger records, so corrections are made at the source transaction rather than inside the report."],
    dimensions: ["Management analysis", "Use cost centres, departments, projects and branches to analyse profitability without changing the chart of accounts.", "Used dimensions are archived instead of erased so historical reporting retains its context."],
    audit: ["Immutable history", "Audit records explain who changed accounting data and when.", "This view is intentionally read-only; correcting a transaction creates a new auditable action rather than rewriting history."],
  };

  const stateA = {
    loaded: false,
    loading: false,
    schemaMissing: false,
    view: "overview",
    settings: null,
    accounts: [],
    contacts: [],
    dimensions: [],
    taxCodes: [],
    journals: [],
    journalLines: [],
    documents: [],
    documentLines: [],
    payments: [],
    bankTransactions: [],
    audit: [],
    search: "",
    reportType: "trial_balance",
    reportFrom: "",
    reportTo: "",
    reportRows: [],
    reportColumns: [],
    reportTitle: "",
    pendingBankImport: null,
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (value) => typeof global.escapeHtml === "function"
    ? global.escapeHtml(String(value ?? ""))
    : String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const today = () => new Date().toISOString().slice(0, 10);
  const num = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const round8 = (value) => Math.round((num(value) + Number.EPSILON) * 1e8) / 1e8;
  const dateStampA = (value) => value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).getTime() : 0;
  const dateDisplay = (value) => {
    if (!value) return "—";
    try { return typeof global.displayDate === "function" ? global.displayDate(value) : new Date(value).toLocaleDateString(); }
    catch (_) { return String(value); }
  };
  const statusText = (value) => String(value || "draft").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const baseCurrency = () => stateA.settings?.base_currency || global.state?.lastCurrency || "AED";
  const moneyA = (value, currency = baseCurrency()) => {
    if (typeof global.money === "function") {
      try { return global.money(num(value), currency); } catch (_) {}
    }
    return `${currency} ${num(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  // Accounting reports intentionally keep application-generated money markup for
  // on-screen symbol/font rendering, while every user-provided cell remains escaped.
  // Export paths convert the trusted money fragment back to plain ISO-currency text.
  const TRUSTED_REPORT_MONEY_RE = /^<span class="money"><span class="symbol [A-Za-z0-9_-]+" data-currency-symbol="([A-Z0-9]{3,5})">[^<>]*<\/span><span class="amount">([-0-9,.]+)<\/span><\/span>$/;
  function reportCellIsMoney(value) { return TRUSTED_REPORT_MONEY_RE.test(String(value ?? "")); }
  function reportCellHtml(value) {
    const raw = String(value ?? "");
    return reportCellIsMoney(raw) ? raw : esc(raw);
  }
  function reportCellText(value) {
    const raw = String(value ?? "");
    const match = raw.match(TRUSTED_REPORT_MONEY_RE);
    return match ? `${match[1]} ${match[2]}` : raw;
  }
  function reportMoneyIsZero(value) {
    const text = reportCellText(value);
    const match = text.match(/(-?[0-9][0-9,]*(?:\.[0-9]+)?)\s*$/);
    if (!match) return false;
    const parsed = Number(match[1].replace(/,/g, ""));
    return Number.isFinite(parsed) && Math.abs(parsed) < 0.00000001;
  }
  const currencySymbol = (currency) => typeof global.currencySymbolHtml === "function"
    ? global.currencySymbolHtml(currency)
    : `<span>${esc(currency)}</span>`;
  const currentOwner = () => typeof global.currentOwnerId === "function" ? global.currentOwnerId() : global.state?.sessionUser?.id || null;
  const can = (action) => typeof global.userHasPermission !== "function" || global.userHasPermission("accounting", action);
  const activeOwnerQuery = () => typeof global.ownerIdQuery === "function" ? global.ownerIdQuery() : (currentOwner() ? `&owner_id=eq.${encodeURIComponent(currentOwner())}` : "");

  function accountingSchemaError(err) {
    const msg = String(err?.message || err || "");
    return /accounting_|Could not find the table|does not exist|PGRST205|42P01|schema cache/i.test(msg);
  }

  function toast(message, type = "success") {
    if (typeof global.showEntryConfirmation === "function") {
      global.showEntryConfirmation(message, type);
      return;
    }
    if (type === "error") alert(message);
  }

  async function fetchAll(table, { order = "created_at.desc", filter = "", pageSize = 1000 } = {}) {
    const out = [];
    let offset = 0;
    while (true) {
      const path = `${table}?select=*${activeOwnerQuery()}${filter}${order ? `&order=${order}` : ""}`;
      const rows = await global.supabase(path, { headers: { Range: `${offset}-${offset + pageSize - 1}` } });
      const batch = Array.isArray(rows) ? rows : [];
      out.push(...batch);
      if (batch.length < pageSize) break;
      offset += pageSize;
      if (offset >= 20000) break;
    }
    return out;
  }

  function ensureAccountingUi() {
    if (!$(".tab[data-tab='accounting']")) {
      const inventoryTab = $(".tab[data-tab='goods']");
      const tab = document.createElement("button");
      tab.className = "tab hide";
      tab.type = "button";
      tab.disabled = true;
      tab.setAttribute("aria-hidden", "true");
      tab.dataset.tab = "accounting";
      tab.title = "Accounting";
      tab.innerHTML = '<i class="fa-solid fa-calculator" aria-hidden="true"></i><span class="tab-label">Accounting</span>';
      if (inventoryTab) inventoryTab.insertAdjacentElement("afterend", tab);
      else $(".tabs")?.appendChild(tab);
      tab.addEventListener("click", () => typeof global.activate === "function" && global.activate("accounting"));
    }

    if (!$("#accountingPanel")) {
      const panel = document.createElement("section");
      panel.id = "accountingPanel";
      panel.className = "panel accounting-panel";
      panel.innerHTML = `
        <div class="section-head accounting-section-head">
          <div>
            <h3>Accounting</h3>
            <p>Double-entry books, sales, purchases, tax, reconciliation and financial reporting.</p>
          </div>
          <div class="accounting-head-actions">
            <button class="btn ghost tiny" type="button" data-acct-action="guide"><i class="fa-regular fa-circle-question"></i> Guide</button>
            <button class="btn ghost tiny" type="button" data-acct-action="refresh"><i class="fa-solid fa-rotate"></i> Refresh</button>
            <button class="btn primary tiny" type="button" data-acct-action="quick-new"><i class="fa-solid fa-plus"></i> New</button>
          </div>
        </div>
        <div class="accounting-shell">
          <div class="accounting-subnav" role="tablist" aria-label="Accounting workspace">
            ${VIEWS.map(([id, label, icon]) => `<button type="button" class="accounting-nav-btn${id === "overview" ? " active" : ""}" data-acct-view="${id}"><i class="${icon}" aria-hidden="true"></i><span>${esc(label)}</span></button>`).join("")}
          </div>
          <div class="accounting-tools-row">
            <label class="accounting-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input id="accountingSearch" type="search" class="input" placeholder="Search current accounting view" autocomplete="off"></label>
            <div id="accountingContextActions" class="accounting-context-actions"></div>
          </div>
          <div id="accountingWorkspaceBody" class="accounting-workspace-body"><div class="empty">Open Accounting to load your books.</div></div>
        </div>
        <input id="accountingBankImportInput" class="hide" type="file" accept=".csv,.xlsx,.xls" />`;
      const before = $("#assetsPanel") || $("#dashboardPanel");
      if (before?.parentNode) before.parentNode.insertBefore(panel, before);
      else $("main")?.appendChild(panel);
      bindAccountingPanel(panel);
    }
  }

  function bindAccountingPanel(panel) {
    panel.addEventListener("click", async (event) => {
      const viewBtn = event.target.closest("[data-acct-view]");
      if (viewBtn) {
        setAccountingView(viewBtn.dataset.acctView);
        return;
      }
      const action = event.target.closest("[data-acct-action]");
      if (!action) return;
      event.preventDefault();
      await handleAccountingAction(action.dataset.acctAction, action);
    });
    $("#accountingSearch", panel)?.addEventListener("input", (event) => {
      stateA.search = String(event.target.value || "").trim().toLowerCase();
      renderAccountingView();
    });
    $("#accountingBankImportInput", panel)?.addEventListener("change", handleBankImportFile);
  }

  function setAccountingView(view) {
    if (!VIEWS.some(v => v[0] === view)) return;
    stateA.view = view;
    $$("[data-acct-view]").forEach(btn => btn.classList.toggle("active", btn.dataset.acctView === view));
    stateA.search = "";
    const search = $("#accountingSearch");
    if (search) search.value = "";
    renderAccountingView();
  }

  async function loadAccountingWorkspace({ force = false } = {}) {
    ensureAccountingUi();
    if (typeof global.userHasPermission === "function" && !global.userHasPermission("accounting", "view")) {
      const tab = $(".tab[data-tab='accounting']");
      if (tab) { tab.classList.add("hide"); tab.disabled = true; tab.setAttribute("aria-hidden", "true"); }
      return;
    }
    if (stateA.loading) return;
    if (stateA.loaded && !force) {
      renderAccountingView();
      return;
    }
    const body = $("#accountingWorkspaceBody");
    if (body) body.innerHTML = `<div class="accounting-loading"><span class="spinner"></span><strong>Loading accounting books…</strong></div>`;
    stateA.loading = true;
    stateA.schemaMissing = false;
    try {
      await global.supabaseRpc("app_accounting_bootstrap_defaults", {});
      const [settings, accounts, contacts, dimensions, taxCodes, journals, journalLines, documents, documentLines, payments, bankTransactions, audit] = await Promise.all([
        fetchAll("accounting_settings", { order: "updated_at.desc" }),
        fetchAll("accounting_accounts", { order: "code.asc" }),
        fetchAll("accounting_contacts", { order: "name.asc" }),
        fetchAll("accounting_dimensions", { order: "dimension_type.asc,code.asc" }),
        fetchAll("accounting_tax_codes", { order: "code.asc" }),
        fetchAll("accounting_journals", { order: "journal_date.desc,created_at.desc" }),
        fetchAll("accounting_journal_lines", { order: "created_at.asc" }),
        fetchAll("accounting_documents", { order: "issue_date.desc,created_at.desc", filter: "&is_deleted=eq.false" }),
        fetchAll("accounting_document_lines", { order: "created_at.asc" }),
        fetchAll("accounting_payments", { order: "payment_date.desc,created_at.desc" }),
        fetchAll("accounting_bank_transactions", { order: "transaction_date.desc,created_at.desc" }),
        fetchAll("accounting_audit_log", { order: "created_at.desc", pageSize: 500 }),
      ]);
      stateA.settings = settings[0] || null;
      stateA.accounts = accounts;
      stateA.contacts = contacts;
      stateA.dimensions = dimensions;
      stateA.taxCodes = taxCodes;
      stateA.journals = journals;
      stateA.journalLines = journalLines;
      stateA.documents = documents;
      stateA.documentLines = documentLines;
      stateA.payments = payments;
      stateA.bankTransactions = bankTransactions;
      stateA.audit = audit.slice(0, 1000);
      stateA.loaded = true;
      renderAccountingView();
    } catch (err) {
      console.error("Accounting workspace load failed", err);
      stateA.schemaMissing = accountingSchemaError(err);
      if (body) body.innerHTML = stateA.schemaMissing
        ? `<div class="accounting-schema-notice"><i class="fa-solid fa-database"></i><div><strong>Accounting database upgrade required</strong><p>Run <code>migrations/149_full_accounting_erp_core.sql</code> once in the Supabase SQL Editor, then press Refresh. Existing Triplem VIP data is not modified by this migration.</p></div></div>`
        : `<div class="empty">Accounting could not load. ${esc(err?.message || "Please try again.")}</div>`;
    } finally {
      stateA.loading = false;
    }
  }

  function postedJournalIds() {
    return new Set(stateA.journals.filter(j => j.status === "posted").map(j => j.id));
  }

  function accountBalance(account) {
    const posted = postedJournalIds();
    const movement = stateA.journalLines.reduce((sum, line) => {
      if (line.account_id !== account.id || !posted.has(line.journal_id)) return sum;
      const debit = num(line.base_debit || num(line.debit) * num(line.fx_rate || 1));
      const credit = num(line.base_credit || num(line.credit) * num(line.fx_rate || 1));
      return sum + ((account.account_type === "asset" || account.account_type === "expense") ? debit - credit : credit - debit);
    }, 0);
    return round8(num(account.opening_balance) + movement);
  }

  function contactName(id) {
    return stateA.contacts.find(c => c.id === id)?.name || "—";
  }
  function accountName(id) {
    const a = stateA.accounts.find(row => row.id === id);
    return a ? `${a.code} · ${a.name}` : "—";
  }
  function journalById(id) { return stateA.journals.find(j => j.id === id); }
  function linesForJournal(id) { return stateA.journalLines.filter(l => l.journal_id === id).sort((a, b) => num(a.line_no) - num(b.line_no)); }
  function linesForDocument(id) { return stateA.documentLines.filter(l => l.document_id === id).sort((a, b) => num(a.line_no) - num(b.line_no)); }
  function documentEffectiveStatus(doc) {
    if (["paid", "cancelled", "draft"].includes(doc.status)) return doc.status;
    if (num(doc.balance_amount) > 0 && doc.due_date && dateStampA(doc.due_date) < dateStampA(today())) return "overdue";
    return doc.status;
  }

  function searchMatch(parts) {
    if (!stateA.search) return true;
    return parts.filter(Boolean).join(" ").toLowerCase().includes(stateA.search);
  }

  function setContextActions(html) {
    const root = $("#accountingContextActions");
    if (root) root.innerHTML = html || "";
  }

  function renderAccountingView() {
    ensureAccountingUi();
    if (!stateA.loaded) {
      if (!stateA.loading && !stateA.schemaMissing) void loadAccountingWorkspace();
      return;
    }
    $$("[data-acct-view]").forEach(btn => btn.classList.toggle("active", btn.dataset.acctView === stateA.view));
    switch (stateA.view) {
      case "accounts": renderAccounts(); break;
      case "journals": renderJournals(); break;
      case "sales": renderDocuments("sales"); break;
      case "purchases": renderDocuments("purchases"); break;
      case "contacts": renderContacts(); break;
      case "reconciliation": renderReconciliation(); break;
      case "tax": renderTax(); break;
      case "reports": renderReports(); break;
      case "dimensions": renderDimensions(); break;
      case "audit": renderAudit(); break;
      default: renderAccountingOverview();
    }
    renderViewGuide();
  }

  function renderViewGuide() {
    const body = $("#accountingWorkspaceBody");
    const guide = VIEW_GUIDES[stateA.view] || VIEW_GUIDES.overview;
    if (!body || !guide || body.querySelector(".accounting-view-guide")) return;
    body.insertAdjacentHTML("afterbegin", `<aside class="accounting-view-guide" aria-label="Accounting guidance"><div class="accounting-view-guide-icon"><i class="fa-regular fa-compass"></i></div><div><small>${esc(guide[0])}</small><strong>${esc(guide[1])}</strong><span>${esc(guide[2])}</span></div><button class="btn ghost tiny" type="button" data-acct-action="guide">Full Guide</button></aside>`);
  }

  function accountingKpis() {
    const revenue = stateA.accounts.filter(a => a.account_type === "income").reduce((s, a) => s + accountBalance(a), 0);
    const expense = stateA.accounts.filter(a => a.account_type === "expense").reduce((s, a) => s + accountBalance(a), 0);
    const cash = stateA.accounts.filter(a => a.is_cash_account).reduce((s, a) => s + accountBalance(a), 0);
    const ar = stateA.accounts.find(a => a.code === "1100");
    const ap = stateA.accounts.find(a => a.code === "2000");
    const receivable = ar ? accountBalance(ar) : stateA.documents.filter(d => RECEIVABLE_TYPES.has(d.doc_type) && d.status !== "draft" && d.status !== "cancelled").reduce((s, d) => s + num(d.balance_amount), 0);
    const payable = ap ? accountBalance(ap) : stateA.documents.filter(d => PAYABLE_TYPES.has(d.doc_type) && d.status !== "draft" && d.status !== "cancelled").reduce((s, d) => s + num(d.balance_amount), 0);
    return { revenue, expense, profit: revenue - expense, cash, receivable, payable };
  }

  function renderAccountingOverview() {
    const body = $("#accountingWorkspaceBody");
    const k = accountingKpis();
    const recent = stateA.journals.slice(0, 8);
    const openSales = stateA.documents.filter(d => RECEIVABLE_TYPES.has(d.doc_type) && num(d.balance_amount) > 0 && d.status !== "draft").length;
    const openPurchases = stateA.documents.filter(d => PAYABLE_TYPES.has(d.doc_type) && num(d.balance_amount) > 0 && d.status !== "draft").length;
    const unreconciled = stateA.bankTransactions.filter(t => t.reconciliation_status === "unreconciled").length;
    const auditCount = stateA.audit.length;
    setContextActions(can("edit") ? `<button class="btn ghost tiny" data-acct-action="settings"><i class="fa-solid fa-gear"></i> Accounting Settings</button>` : "");
    body.innerHTML = `
      <div class="accounting-kpi-grid">
        ${kpiCard("Cash & Bank", k.cash, "fa-solid fa-building-columns", "cash")}
        ${kpiCard("Receivables", k.receivable, "fa-solid fa-arrow-trend-up", "receivable")}
        ${kpiCard("Payables", k.payable, "fa-solid fa-arrow-trend-down", "payable")}
        ${kpiCard("Net Profit", k.profit, "fa-solid fa-chart-line", k.profit >= 0 ? "profit" : "loss")}
      </div>
      <div class="accounting-overview-grid">
        <article class="accounting-card accounting-health-card">
          <div class="accounting-card-head"><div><small>BOOKS HEALTH</small><h4>Accounting control centre</h4></div><span class="badge green">Live</span></div>
          <div class="accounting-health-grid">
            <button data-acct-view="sales"><strong>${openSales}</strong><span>Open customer balances</span></button>
            <button data-acct-view="purchases"><strong>${openPurchases}</strong><span>Open supplier balances</span></button>
            <button data-acct-view="reconciliation"><strong>${unreconciled}</strong><span>Unreconciled bank rows</span></button>
            <button data-acct-view="audit"><strong>${auditCount}</strong><span>Recent audit events loaded</span></button>
          </div>
        </article>
        <article class="accounting-card">
          <div class="accounting-card-head"><div><small>PERFORMANCE</small><h4>Income and expenses</h4></div><button class="tiny ghost" data-acct-view="reports">Reports</button></div>
          <div class="accounting-performance">
            <div><span>Income</span><strong>${moneyA(k.revenue)}</strong><div class="accounting-meter"><i style="width:${Math.min(100, k.revenue > 0 ? 100 : 0)}%"></i></div></div>
            <div><span>Expenses</span><strong>${moneyA(k.expense)}</strong><div class="accounting-meter"><i style="width:${Math.min(100, k.revenue > 0 ? Math.abs(k.expense / k.revenue) * 100 : (k.expense ? 100 : 0))}%"></i></div></div>
            <div class="accounting-net-row"><span>Net</span><strong>${moneyA(k.profit)}</strong></div>
          </div>
        </article>
      </div>
      <article class="accounting-card">
        <div class="accounting-card-head"><div><small>RECENT LEDGER</small><h4>Posted and draft journals</h4></div><button class="tiny primary" data-acct-action="new-journal"><i class="fa-solid fa-plus"></i> Journal</button></div>
        ${recent.length ? `<div class="accounting-list">${recent.map(j => journalRowHtml(j, true)).join("")}</div>` : emptyState("No journals yet", "Create a balanced journal or post a sales/purchase document.")}
      </article>`;
  }

  function kpiCard(label, value, icon, kind) {
    return `<article class="accounting-kpi ${esc(kind)}"><div class="accounting-kpi-icon"><i class="${icon}"></i></div><div><span>${esc(label)}</span><strong>${moneyA(value)}</strong><small>${esc(baseCurrency())} base books</small></div></article>`;
  }
  function emptyState(title, detail = "") {
    return `<div class="accounting-empty"><i class="fa-regular fa-folder-open"></i><strong>${esc(title)}</strong>${detail ? `<span>${esc(detail)}</span>` : ""}</div>`;
  }

  function renderAccounts() {
    const body = $("#accountingWorkspaceBody");
    const rows = stateA.accounts.filter(a => searchMatch([a.code, a.name, a.account_type, a.account_subtype, a.currency, a.is_active ? "active" : "archived"]));
    setContextActions(can("create") ? `<button class="btn primary tiny" data-acct-action="new-account"><i class="fa-solid fa-plus"></i> Account</button>` : "");
    body.innerHTML = `
      <article class="accounting-card">
        <div class="accounting-card-head"><div><small>GENERAL LEDGER</small><h4>Chart of Accounts</h4><p>${stateA.accounts.length} accounts. System accounts are protected; unused custom accounts can be archived without disturbing historical postings.</p></div></div>
        <div class="accounting-table-wrap"><table class="accounting-table"><thead><tr><th>Code</th><th>Account</th><th>Type</th><th>Currency</th><th class="num">Balance</th><th></th></tr></thead><tbody>
          ${rows.map(a => `<tr class="${a.is_active ? "" : "accounting-row-archived"}"><td><code>${esc(a.code)}</code></td><td><strong>${esc(a.name)}</strong><small>${esc(statusText(a.account_subtype || "General"))}${a.is_cash_account ? " · Cash/Bank" : ""} · ${a.is_active ? "Active" : "Archived"}</small></td><td><span class="accounting-type-pill ${esc(a.account_type)}">${esc(statusText(a.account_type))}</span></td><td>${currencySymbol(a.currency)} ${esc(a.currency)}</td><td class="num"><strong>${moneyA(accountBalance(a), baseCurrency())}</strong></td><td class="actions">${can("edit") ? `<button class="icon-btn ghost" data-acct-action="edit-account" data-id="${esc(a.id)}" title="Edit account"><i class="fa-solid fa-pen"></i></button>` : ""}${!a.is_system && can("delete") ? (a.is_active ? `<button class="icon-btn ghost danger" data-acct-action="archive-account" data-id="${esc(a.id)}" title="Delete safely by archiving"><i class="fa-solid fa-trash-can"></i></button>` : `<button class="icon-btn ghost" data-acct-action="restore-account" data-id="${esc(a.id)}" title="Restore account"><i class="fa-solid fa-arrow-rotate-left"></i></button>`) : ""}</td></tr>`).join("") || `<tr><td colspan="6">${emptyState("No matching accounts")}</td></tr>`}
        </tbody></table></div>
      </article>`;
  }

  function journalTotals(journalId) {
    const lines = linesForJournal(journalId);
    return {
      debit: round8(lines.reduce((s, l) => s + num(l.base_debit || num(l.debit) * num(l.fx_rate || 1)), 0)),
      credit: round8(lines.reduce((s, l) => s + num(l.base_credit || num(l.credit) * num(l.fx_rate || 1)), 0)),
    };
  }

  function journalRowHtml(j, compact = false) {
    const t = journalTotals(j.id);
    return `<div class="accounting-list-row${compact ? " compact" : ""}">
      <div class="accounting-list-icon"><i class="fa-solid fa-book-open"></i></div>
      <div class="accounting-list-main"><strong>${esc(j.journal_no)}</strong><span>${esc(j.description || j.reference || "Journal entry")}</span><small>${dateDisplay(j.journal_date)}${j.reference ? ` · ${esc(j.reference)}` : ""}</small></div>
      <div class="accounting-list-value"><strong>${moneyA(t.debit, baseCurrency())}</strong><span class="badge ${j.status === "posted" ? "green" : j.status === "void" ? "red" : "orange"}">${esc(statusText(j.status))}</span></div>
      <div class="accounting-list-actions"><button class="icon-btn ghost" data-acct-action="view-journal" data-id="${esc(j.id)}" title="View journal"><i class="fa-solid fa-eye"></i></button>${j.status === "draft" && can("edit") ? `<button class="icon-btn ghost" data-acct-action="edit-journal" data-id="${esc(j.id)}" title="Edit draft"><i class="fa-solid fa-pen"></i></button><button class="icon-btn ghost" data-acct-action="post-journal" data-id="${esc(j.id)}" title="Post journal"><i class="fa-solid fa-circle-check"></i></button>` : ""}${j.status === "draft" && can("delete") ? `<button class="icon-btn ghost danger" data-acct-action="delete-journal" data-id="${esc(j.id)}" title="Delete draft"><i class="fa-solid fa-trash-can"></i></button>` : ""}${j.status === "posted" && can("delete") ? `<button class="icon-btn ghost danger" data-acct-action="void-journal" data-id="${esc(j.id)}" title="Void by reversal"><i class="fa-solid fa-rotate-left"></i></button>` : ""}</div>
    </div>`;
  }

  function renderJournals() {
    const body = $("#accountingWorkspaceBody");
    const rows = stateA.journals.filter(j => searchMatch([j.journal_no, j.reference, j.description, j.status, j.journal_date]));
    setContextActions(can("create") ? `<button class="btn primary tiny" data-acct-action="new-journal"><i class="fa-solid fa-plus"></i> Journal</button>` : "");
    body.innerHTML = `<article class="accounting-card"><div class="accounting-card-head"><div><small>DOUBLE ENTRY</small><h4>Journal Entries</h4><p>Drafts can be edited. Posted journals are immutable and can only be voided through an automatic reversal.</p></div></div>${rows.length ? `<div class="accounting-list">${rows.map(j => journalRowHtml(j)).join("")}</div>` : emptyState("No journal entries")}</article>`;
  }

  function documentKindOptions(kind) {
    const types = kind === "sales" ? Array.from(SALES_TYPES) : Array.from(PURCHASE_TYPES);
    return types.map(type => `<option value="${type}">${esc(DOC_LABELS[type])}</option>`).join("");
  }

  function documentRowHtml(d) {
    const effective = documentEffectiveStatus(d);
    const canPay = can("create") && (RECEIVABLE_TYPES.has(d.doc_type) || PAYABLE_TYPES.has(d.doc_type)) && num(d.balance_amount) > 0 && ["issued", "partial", "overdue"].includes(effective);
    const canLifecycleDelete = can("delete") && !["cancelled", "paid"].includes(d.status);
    return `<div class="accounting-doc-row">
      <div class="accounting-doc-type"><i class="${SALES_TYPES.has(d.doc_type) ? "fa-solid fa-arrow-up-right-dots" : "fa-solid fa-arrow-down"}"></i></div>
      <div class="accounting-doc-main"><strong>${esc(d.document_no)}</strong><span>${esc(DOC_LABELS[d.doc_type] || statusText(d.doc_type))} · ${esc(contactName(d.contact_id))}</span><small>${dateDisplay(d.issue_date)}${d.due_date ? ` · Due ${dateDisplay(d.due_date)}` : ""}</small></div>
      <div class="accounting-doc-money"><strong>${moneyA(d.total_amount, d.currency)}</strong>${num(d.balance_amount) > 0 && d.status !== "draft" ? `<small>Open ${moneyA(d.balance_amount, d.currency)}</small>` : ""}</div>
      <span class="accounting-status ${esc(effective)}">${esc(statusText(effective))}</span>
      <div class="accounting-doc-actions"><button class="icon-btn ghost" data-acct-action="view-document" data-id="${esc(d.id)}" title="View"><i class="fa-solid fa-eye"></i></button>${d.status === "draft" && can("edit") ? `<button class="icon-btn ghost" data-acct-action="edit-document" data-id="${esc(d.id)}" title="Edit draft"><i class="fa-solid fa-pen"></i></button><button class="icon-btn ghost" data-acct-action="post-document" data-id="${esc(d.id)}" title="Issue/Post"><i class="fa-solid fa-paper-plane"></i></button>` : ""}${canPay ? `<button class="icon-btn ghost" data-acct-action="record-payment" data-id="${esc(d.id)}" title="Record payment"><i class="fa-solid fa-money-check-dollar"></i></button>` : ""}<button class="icon-btn ghost" data-acct-action="document-pdf" data-id="${esc(d.id)}" title="PDF"><i class="fa-solid fa-file-pdf"></i></button>${canLifecycleDelete ? `<button class="icon-btn ghost danger" data-acct-action="cancel-document" data-id="${esc(d.id)}" title="${d.status === "draft" ? "Delete draft" : "Cancel safely"}"><i class="fa-solid ${d.status === "draft" ? "fa-trash-can" : "fa-ban"}"></i></button>` : ""}</div>
    </div>`;
  }

  function renderDocuments(kind) {
    const body = $("#accountingWorkspaceBody");
    const types = kind === "sales" ? SALES_TYPES : PURCHASE_TYPES;
    const rows = stateA.documents.filter(d => types.has(d.doc_type) && searchMatch([d.document_no, d.doc_type, contactName(d.contact_id), d.status, d.reference]));
    const open = rows.filter(d => num(d.balance_amount) > 0 && d.status !== "draft").reduce((s, d) => s + num(d.balance_amount) * num(d.fx_rate || 1), 0);
    setContextActions(can("create") ? `<button class="btn primary tiny" data-acct-action="new-${kind}-document"><i class="fa-solid fa-plus"></i> New ${kind === "sales" ? "Sale" : "Purchase"}</button>` : "");
    body.innerHTML = `
      <div class="accounting-kpi-grid accounting-kpi-grid--mini">
        <article class="accounting-kpi"><div class="accounting-kpi-icon"><i class="fa-solid fa-file-invoice"></i></div><div><span>Documents</span><strong>${rows.length}</strong><small>${kind === "sales" ? "Sales lifecycle" : "Purchase lifecycle"}</small></div></article>
        <article class="accounting-kpi"><div class="accounting-kpi-icon"><i class="fa-solid fa-hourglass-half"></i></div><div><span>Open balance</span><strong>${moneyA(open)}</strong><small>Base currency equivalent</small></div></article>
      </div>
      <article class="accounting-card"><div class="accounting-card-head"><div><small>${kind === "sales" ? "REVENUE CYCLE" : "PROCURE TO PAY"}</small><h4>${kind === "sales" ? "Sales Documents" : "Purchase Documents"}</h4><p>${kind === "sales" ? "Quotations, orders, delivery notes, invoices, credit notes and returns." : "Purchase orders, receipts, supplier bills, debit notes, returns and expense invoices."}</p></div></div>${rows.length ? `<div class="accounting-doc-list">${rows.map(documentRowHtml).join("")}</div>` : emptyState(`No ${kind} documents`, `Create your first ${kind} document.`)}</article>`;
  }

  function renderContacts() {
    const body = $("#accountingWorkspaceBody");
    const rows = stateA.contacts.filter(c => searchMatch([c.name, c.company_name, c.contact_type, c.email, c.phone, c.tax_registration_number, c.is_active ? "active" : "archived"]));
    setContextActions(can("create") ? `<button class="btn primary tiny" data-acct-action="new-contact"><i class="fa-solid fa-user-plus"></i> Contact</button>` : "");
    body.innerHTML = `<article class="accounting-card"><div class="accounting-card-head"><div><small>PARTIES</small><h4>Customers & Suppliers</h4><p>Reusable contact records for invoices, bills, payments and statements. Archived contacts remain attached to historical records.</p></div></div><div class="accounting-contact-grid">${rows.map(c => {
      const docs = stateA.documents.filter(d => d.contact_id === c.id);
      const openDocs = docs.filter(d => d.status !== "draft" && d.status !== "cancelled");
      const open = openDocs.reduce((sum, d) => sum + (num(d.balance_amount) * num(d.fx_rate || 1)), 0);
      return `<article class="accounting-contact-card${c.is_active ? "" : " accounting-card-archived"}"><div class="accounting-contact-avatar">${esc((c.name || "?").slice(0, 1).toUpperCase())}</div><div class="accounting-contact-info"><strong>${esc(c.name)}</strong><span>${esc(c.company_name || statusText(c.contact_type))}</span><small>${[c.email, c.phone].filter(Boolean).map(esc).join(" · ") || "No contact details"} · ${c.is_active ? "Active" : "Archived"}</small></div><div class="accounting-contact-meta"><span>${docs.length} docs</span><strong>${moneyA(open)}</strong></div><div class="accounting-contact-actions">${can("edit") ? `<button class="icon-btn ghost" data-acct-action="edit-contact" data-id="${esc(c.id)}" title="Edit contact"><i class="fa-solid fa-pen"></i></button>` : ""}${can("delete") ? (c.is_active ? `<button class="icon-btn ghost danger" data-acct-action="archive-contact" data-id="${esc(c.id)}" title="Delete safely by archiving"><i class="fa-solid fa-trash-can"></i></button>` : `<button class="icon-btn ghost" data-acct-action="restore-contact" data-id="${esc(c.id)}" title="Restore contact"><i class="fa-solid fa-arrow-rotate-left"></i></button>`) : ""}</div></article>`;
    }).join("") || emptyState("No contacts")}</div></article>`;
  }

  function bankMovementForJournal(journalId, bankAccountId = null) {
    const cashIds = new Set(stateA.accounts.filter(a => a.is_cash_account && (!bankAccountId || a.id === bankAccountId)).map(a => a.id));
    return round8(linesForJournal(journalId).reduce((s, l) => cashIds.has(l.account_id) ? s + num(l.debit) - num(l.credit) : s, 0));
  }

  function bestBankMatch(tx) {
    let best = null;
    for (const journal of stateA.journals) {
      if (journal.status !== "posted") continue;
      const movement = bankMovementForJournal(journal.id, tx.bank_account_id || null);
      if (Math.abs(movement - num(tx.amount)) > 0.01) continue;
      const days = Math.abs(dateStampA(journal.journal_date) - dateStampA(tx.transaction_date)) / 86400000;
      if (days > 5) continue;
      if (!best || days < best.days) best = { journal, movement, days };
    }
    return best;
  }

  function renderReconciliation() {
    const body = $("#accountingWorkspaceBody");
    const rows = stateA.bankTransactions.filter(t => searchMatch([t.description, t.reference, t.currency, t.reconciliation_status, t.transaction_date]));
    const pending = rows.filter(r => r.reconciliation_status === "unreconciled").length;
    setContextActions(`${can("create") ? `<button class="btn ghost tiny" data-acct-action="import-bank"><i class="fa-solid fa-file-import"></i> Import</button><button class="btn primary tiny" data-acct-action="new-bank-transaction"><i class="fa-solid fa-plus"></i> Bank Row</button>` : ""}`);
    body.innerHTML = `<article class="accounting-card"><div class="accounting-card-head"><div><small>BANK CONTROL</small><h4>Payment Reconciliation</h4><p>${pending} unreconciled. Import CSV/XLSX statements or enter rows manually, then match them to posted ledger journals.</p></div></div>${rows.length ? `<div class="accounting-reconcile-list">${rows.map(tx => {
      const suggested = tx.reconciliation_status === "unreconciled" ? bestBankMatch(tx) : null;
      const matched = tx.matched_journal_id ? journalById(tx.matched_journal_id) : null;
      const editable = tx.reconciliation_status !== "matched" && !tx.matched_journal_id;
      return `<div class="accounting-reconcile-row"><div class="accounting-reconcile-date"><strong>${dateDisplay(tx.transaction_date)}</strong><small>${esc(tx.currency)}</small></div><div class="accounting-reconcile-main"><strong>${esc(tx.description || "Bank transaction")}</strong><span>${esc(tx.reference || tx.source || "")}</span>${suggested ? `<small class="accounting-suggestion"><i class="fa-solid fa-wand-magic-sparkles"></i> Suggested ${esc(suggested.journal.journal_no)} · ${dateDisplay(suggested.journal.journal_date)}</small>` : matched ? `<small>Matched to ${esc(matched.journal_no)}</small>` : ""}</div><div class="accounting-reconcile-amount ${num(tx.amount) >= 0 ? "positive" : "negative"}"><strong>${moneyA(tx.amount, tx.currency)}</strong><span class="accounting-status ${esc(tx.reconciliation_status)}">${esc(statusText(tx.reconciliation_status))}</span></div><div class="accounting-doc-actions">${suggested && can("edit") ? `<button class="btn soft tiny" data-acct-action="match-bank" data-id="${esc(tx.id)}" data-journal-id="${esc(suggested.journal.id)}">Match</button>` : ""}${tx.reconciliation_status === "unreconciled" && can("edit") ? `<button class="icon-btn ghost" data-acct-action="choose-bank-match" data-id="${esc(tx.id)}" title="Choose journal"><i class="fa-solid fa-link"></i></button><button class="icon-btn ghost" data-acct-action="ignore-bank" data-id="${esc(tx.id)}" title="Ignore"><i class="fa-solid fa-eye-slash"></i></button>` : ""}${tx.reconciliation_status === "ignored" && can("edit") ? `<button class="icon-btn ghost" data-acct-action="restore-bank" data-id="${esc(tx.id)}" title="Return to unreconciled"><i class="fa-solid fa-eye"></i></button>` : ""}${tx.reconciliation_status === "matched" && can("edit") ? `<button class="icon-btn ghost" data-acct-action="unmatch-bank" data-id="${esc(tx.id)}" title="Remove match"><i class="fa-solid fa-link-slash"></i></button>` : ""}${editable && can("edit") ? `<button class="icon-btn ghost" data-acct-action="edit-bank-transaction" data-id="${esc(tx.id)}" title="Edit bank row"><i class="fa-solid fa-pen"></i></button>` : ""}${editable && can("delete") ? `<button class="icon-btn ghost danger" data-acct-action="delete-bank-transaction" data-id="${esc(tx.id)}" title="Delete bank row"><i class="fa-solid fa-trash-can"></i></button>` : ""}</div></div>`;
    }).join("")}</div>` : emptyState("No bank statement rows", "Import a CSV/XLSX statement to start reconciling.")}</article>`;
  }

  function taxSummary(from = stateA.reportFrom, to = stateA.reportTo) {
    const docOk = d => d.status !== "draft" && d.status !== "cancelled" && (!from || d.issue_date >= from) && (!to || d.issue_date <= to);
    let output = 0, input = 0, salesNet = 0, purchaseNet = 0;
    const byCode = new Map();
    for (const doc of stateA.documents.filter(docOk)) {
      const sign = ["credit_note", "sales_return", "debit_note", "purchase_return"].includes(doc.doc_type) ? -1 : 1;
      if (SALES_TYPES.has(doc.doc_type) && ["sales_invoice", "credit_note", "sales_return"].includes(doc.doc_type)) {
        output += sign * num(doc.tax_amount) * num(doc.fx_rate || 1);
        salesNet += sign * (num(doc.total_amount) - num(doc.tax_amount)) * num(doc.fx_rate || 1);
      }
      if (PURCHASE_TYPES.has(doc.doc_type) && ["purchase_bill", "debit_note", "purchase_return", "expense_invoice"].includes(doc.doc_type)) {
        input += sign * num(doc.tax_amount) * num(doc.fx_rate || 1);
        purchaseNet += sign * (num(doc.total_amount) - num(doc.tax_amount)) * num(doc.fx_rate || 1);
      }
      for (const line of linesForDocument(doc.id)) {
        const code = stateA.taxCodes.find(t => t.id === line.tax_code_id)?.code || `${num(line.tax_rate)}%`;
        if (!byCode.has(code)) byCode.set(code, { code, taxable: 0, tax: 0 });
        const row = byCode.get(code);
        row.taxable += sign * num(line.net_amount) * num(doc.fx_rate || 1);
        row.tax += sign * num(line.tax_amount) * num(doc.fx_rate || 1);
      }
    }
    return { output: round8(output), input: round8(input), net: round8(output - input), salesNet: round8(salesNet), purchaseNet: round8(purchaseNet), byCode: Array.from(byCode.values()) };
  }

  function profitInRange(from, to) {
    const lines = postedLinesInRange(from, to);
    const income = stateA.accounts.filter(a => a.account_type === "income").reduce((sum, a) => sum + accountMovementInLines(a, lines), 0);
    const expense = stateA.accounts.filter(a => a.account_type === "expense").reduce((sum, a) => sum + accountMovementInLines(a, lines), 0);
    return round8(income - expense);
  }

  function renderTax() {
    const body = $("#accountingWorkspaceBody");
    const t = taxSummary();
    const profit = profitInRange(stateA.reportFrom, stateA.reportTo);
    const threshold = num(stateA.settings?.corporate_tax_threshold || 375000);
    const rate = num(stateA.settings?.corporate_tax_rate || 9);
    const taxableAbove = Math.max(0, profit - threshold);
    const estimate = stateA.settings?.corporate_tax_enabled ? taxableAbove * rate / 100 : 0;
    setContextActions(`${can("edit") ? `<button class="btn ghost tiny" data-acct-action="settings"><i class="fa-solid fa-gear"></i> Tax Settings</button>` : ""}${can("create") ? `<button class="btn ghost tiny" data-acct-action="new-tax-code"><i class="fa-solid fa-plus"></i> Tax Code</button>` : ""}<button class="btn primary tiny" data-acct-action="tax-pdf"><i class="fa-solid fa-file-pdf"></i> PDF</button>`);
    body.innerHTML = `
      <div class="accounting-tax-filter"><label>From<input id="acctTaxFrom" class="input" type="date" value="${esc(stateA.reportFrom)}"></label><label>To<input id="acctTaxTo" class="input" type="date" value="${esc(stateA.reportTo)}"></label><button class="btn soft" data-acct-action="apply-tax-filter">Apply</button></div>
      <div class="accounting-kpi-grid">
        ${kpiCard("Output Tax", t.output, "fa-solid fa-arrow-up", "tax")}
        ${kpiCard("Input Tax", t.input, "fa-solid fa-arrow-down", "tax")}
        ${kpiCard("Net VAT", t.net, "fa-solid fa-scale-balanced", t.net >= 0 ? "payable" : "receivable")}
        ${kpiCard("CT Estimate", estimate, "fa-solid fa-landmark", "tax")}
      </div>
      <div class="accounting-overview-grid">
        <article class="accounting-card"><div class="accounting-card-head"><div><small>VAT ANALYSIS</small><h4>Period Tax Activity</h4><p>Posted taxable documents for the selected dates.</p></div></div><div class="accounting-table-wrap"><table class="accounting-table"><thead><tr><th>Code</th><th class="num">Taxable Base</th><th class="num">Tax</th></tr></thead><tbody>${t.byCode.map(r => `<tr><td><strong>${esc(r.code)}</strong></td><td class="num">${moneyA(r.taxable)}</td><td class="num">${moneyA(r.tax)}</td></tr>`).join("") || `<tr><td colspan="3">No posted taxable documents for this period.</td></tr>`}</tbody></table></div></article>
        <article class="accounting-card"><div class="accounting-card-head"><div><small>MANAGEMENT ESTIMATE</small><h4>Corporate Tax</h4><p>Period-matched management estimate from posted income and expense journals.</p></div></div><div class="accounting-tax-estimate"><div><span>Accounting profit</span><strong>${moneyA(profit)}</strong></div><div><span>Configured threshold</span><strong>${moneyA(threshold)}</strong></div><div><span>Configured rate</span><strong>${rate.toFixed(2)}%</strong></div><div class="total"><span>Estimated amount</span><strong>${moneyA(estimate)}</strong></div><p>Estimate for ${dateDisplay(stateA.reportFrom)} to ${dateDisplay(stateA.reportTo)}. This is management information, not an electronic filing or legal determination.</p></div></article>
      </div>
      <article class="accounting-card"><div class="accounting-card-head"><div><small>TAX MASTER DATA</small><h4>Configured Tax Codes</h4><p>Edit rates and behaviour for future documents. Historical line amounts are not recalculated. Custom codes can be archived and restored.</p></div></div><div class="accounting-tax-code-grid">${stateA.taxCodes.filter(tc => searchMatch([tc.code,tc.name,tc.tax_kind,tc.rate,tc.is_active ? "active" : "archived"])).map(tc => `<article class="accounting-tax-code-card${tc.is_active ? "" : " accounting-card-archived"}"><div><small>${esc(statusText(tc.tax_kind))} · ${tc.is_active ? "Active" : "Archived"}</small><strong>${esc(tc.code)} · ${esc(tc.name)}</strong><span>${num(tc.rate).toFixed(2)}%</span></div><div class="accounting-tax-code-actions">${can("edit") ? `<button class="icon-btn ghost" data-acct-action="edit-tax-code" data-id="${esc(tc.id)}" title="Edit tax code"><i class="fa-solid fa-pen"></i></button>` : ""}${!tc.is_system && can("delete") ? (tc.is_active ? `<button class="icon-btn ghost danger" data-acct-action="archive-tax-code" data-id="${esc(tc.id)}" title="Delete safely by archiving"><i class="fa-solid fa-trash-can"></i></button>` : `<button class="icon-btn ghost" data-acct-action="restore-tax-code" data-id="${esc(tc.id)}" title="Restore tax code"><i class="fa-solid fa-arrow-rotate-left"></i></button>`) : ""}</div></article>`).join("") || emptyState("No tax codes")}</div></article>`;
    $("#acctTaxFrom")?.addEventListener("change", e => { stateA.reportFrom = e.target.value; });
    $("#acctTaxTo")?.addEventListener("change", e => { stateA.reportTo = e.target.value; });
  }

  function reportDateRange() {
    const year = new Date().getFullYear();
    if (!stateA.reportFrom) stateA.reportFrom = `${year}-01-01`;
    if (!stateA.reportTo) stateA.reportTo = `${year}-12-31`;
    return [stateA.reportFrom, stateA.reportTo];
  }

  function postedLinesInRange(from, to) {
    const journals = new Map(stateA.journals.filter(j => j.status === "posted" && (!from || j.journal_date >= from) && (!to || j.journal_date <= to)).map(j => [j.id, j]));
    return stateA.journalLines.filter(l => journals.has(l.journal_id)).map(l => ({ line: l, journal: journals.get(l.journal_id), account: stateA.accounts.find(a => a.id === l.account_id) }));
  }
  function postedLinesThrough(to) { return postedLinesInRange("", to); }

  function buildReport(type, from, to) {
    const lines = postedLinesInRange(from, to);
    const asOfLines = postedLinesThrough(to);
    let title = "Report", columns = [], rows = [];
    if (type === "trial_balance") {
      title = "Trial Balance"; columns = ["Code", "Account", "Period Debit", "Period Credit", "Closing Balance"];
      rows = stateA.accounts.map(a => {
        const period = lines.filter(x => x.line.account_id === a.id);
        const debit = period.reduce((sum, x) => sum + num(x.line.base_debit), 0);
        const credit = period.reduce((sum, x) => sum + num(x.line.base_credit), 0);
        const closing = accountBalanceAt(a, asOfLines);
        return [a.code, a.name, moneyA(debit), moneyA(credit), moneyA(closing)];
      }).filter(r => !reportMoneyIsZero(r[2]) || !reportMoneyIsZero(r[3]) || !reportMoneyIsZero(r[4]));
    } else if (type === "profit_loss") {
      title = "Profit & Loss"; columns = ["Code", "Account", "Category", "Amount"];
      rows = stateA.accounts.filter(a => ["income", "expense"].includes(a.account_type)).map(a => [a.code, a.name, statusText(a.account_type), moneyA(accountMovementInLines(a, lines))]);
      const income = stateA.accounts.filter(a => a.account_type === "income").reduce((sum, a) => sum + accountMovementInLines(a, lines), 0);
      const expense = stateA.accounts.filter(a => a.account_type === "expense").reduce((sum, a) => sum + accountMovementInLines(a, lines), 0);
      rows.push(["", "Net Profit / Loss", "Net", moneyA(income - expense)]);
    } else if (type === "balance_sheet") {
      title = "Balance Sheet"; columns = ["Code", "Account", "Category", `Balance as of ${dateDisplay(to)}`];
      rows = stateA.accounts.filter(a => ["asset", "liability", "equity"].includes(a.account_type)).map(a => [a.code, a.name, statusText(a.account_type), moneyA(accountBalanceAt(a, asOfLines))]);
      const currentEarnings = stateA.accounts.filter(a => a.account_type === "income").reduce((sum, a) => sum + accountMovementInLines(a, asOfLines), 0)
        - stateA.accounts.filter(a => a.account_type === "expense").reduce((sum, a) => sum + accountMovementInLines(a, asOfLines), 0);
      if (Math.abs(currentEarnings) > 0.00000001) rows.push(["", "Current Earnings (Unclosed)", "Equity", moneyA(currentEarnings)]);
    } else if (type === "general_ledger") {
      title = "General Ledger"; columns = ["Date", "Journal", "Account", "Description", "Debit", "Credit"];
      rows = lines.sort((a,b) => dateStampA(a.journal.journal_date)-dateStampA(b.journal.journal_date)).map(x => [dateDisplay(x.journal.journal_date), x.journal.journal_no, x.account ? `${x.account.code} ${x.account.name}` : "—", x.line.description || x.journal.description || "", moneyA(x.line.base_debit), moneyA(x.line.base_credit)]);
    } else if (type === "cash_flow") {
      title = "Cash Flow Activity"; columns = ["Month", "Inflows", "Outflows", "Net"];
      const map = new Map();
      for (const x of lines) {
        if (!x.account?.is_cash_account) continue;
        const key = String(x.journal.journal_date).slice(0,7);
        if (!map.has(key)) map.set(key,{inflow:0,outflow:0});
        map.get(key).inflow += num(x.line.base_debit); map.get(key).outflow += num(x.line.base_credit);
      }
      rows = Array.from(map.entries()).sort().map(([month,value]) => [month,moneyA(value.inflow),moneyA(value.outflow),moneyA(value.inflow-value.outflow)]);
    } else if (type === "ar_aging") {
      title = "Accounts Receivable Aging"; columns = ["Invoice", "Customer", "Due", "0–30", "31–60", "61–90", "90+", "Open"];
      rows = agingRows("sales");
    } else if (type === "ap_aging") {
      title = "Accounts Payable Aging"; columns = ["Bill", "Supplier", "Due", "0–30", "31–60", "61–90", "90+", "Open"];
      rows = agingRows("purchase");
    } else if (type === "customer_balances") {
      title = "Customer Balances"; columns = ["Customer", "Tax No.", "Invoices", "Open Balance"];
      rows = stateA.contacts.filter(c => ["customer","both"].includes(c.contact_type)).map(c => { const docs=stateA.documents.filter(d=>d.contact_id===c.id&&RECEIVABLE_TYPES.has(d.doc_type)&&d.status!=="draft"&&d.status!=="cancelled"); const open=docs.reduce((sum,d)=>sum+num(d.balance_amount)*num(d.fx_rate||1),0); return [c.name,c.tax_registration_number||"",String(docs.length),moneyA(open)]; }).filter(r => !reportMoneyIsZero(r[3]) || num(r[2]) > 0);
    } else if (type === "supplier_balances") {
      title = "Supplier Balances"; columns = ["Supplier", "Tax No.", "Bills", "Open Balance"];
      rows = stateA.contacts.filter(c => ["supplier","both"].includes(c.contact_type)).map(c => { const docs=stateA.documents.filter(d=>d.contact_id===c.id&&PAYABLE_TYPES.has(d.doc_type)&&d.status!=="draft"&&d.status!=="cancelled"); const open=docs.reduce((sum,d)=>sum+num(d.balance_amount)*num(d.fx_rate||1),0); return [c.name,c.tax_registration_number||"",String(docs.length),moneyA(open)]; }).filter(r => !reportMoneyIsZero(r[3]) || num(r[2]) > 0);
    } else if (type === "dimension_profitability") {
      title = "Dimension Profitability"; columns = ["Dimension", "Type", "Revenue", "Expense", "Net"];
      const dimensions=[...stateA.dimensions.map(d=>({id:d.id,name:d.name,type:statusText(d.dimension_type)})),{id:null,name:"Unassigned",type:"Other"}];
      rows=dimensions.map(d=>{const dl=lines.filter(x=>(x.line.dimension_id||null)===d.id);const revenue=stateA.accounts.filter(a=>a.account_type==="income").reduce((sum,a)=>sum+accountMovementInLines(a,dl),0);const expense=stateA.accounts.filter(a=>a.account_type==="expense").reduce((sum,a)=>sum+accountMovementInLines(a,dl),0);return [d.name,d.type,moneyA(revenue),moneyA(expense),moneyA(revenue-expense)];}).filter(r=>!reportMoneyIsZero(r[2])||!reportMoneyIsZero(r[3]));
    } else if (type === "reconciliation_status") {
      title = "Bank Reconciliation Status"; columns = ["Date", "Description", "Reference", "Status", "Amount", "Matched Journal"];
      rows = stateA.bankTransactions.filter(t => t.transaction_date >= from && t.transaction_date <= to).map(t => [dateDisplay(t.transaction_date),t.description||"",t.reference||"",statusText(t.reconciliation_status),moneyA(t.amount,t.currency),journalById(t.matched_journal_id)?.journal_no||""]);
    } else if (type === "sales_register") {
      title = "Sales Register"; columns = ["Date", "Document", "Customer", "Type", "Net", "Tax", "Total", "Status"];
      rows = stateA.documents.filter(d => SALES_TYPES.has(d.doc_type) && d.issue_date >= from && d.issue_date <= to).map(d => [dateDisplay(d.issue_date),d.document_no,contactName(d.contact_id),DOC_LABELS[d.doc_type],moneyA(num(d.total_amount)-num(d.tax_amount),d.currency),moneyA(d.tax_amount,d.currency),moneyA(d.total_amount,d.currency),statusText(documentEffectiveStatus(d))]);
    } else if (type === "purchase_register") {
      title = "Purchase Register"; columns = ["Date", "Document", "Supplier", "Type", "Net", "Tax", "Total", "Status"];
      rows = stateA.documents.filter(d => PURCHASE_TYPES.has(d.doc_type) && d.issue_date >= from && d.issue_date <= to).map(d => [dateDisplay(d.issue_date),d.document_no,contactName(d.contact_id),DOC_LABELS[d.doc_type],moneyA(num(d.total_amount)-num(d.tax_amount),d.currency),moneyA(d.tax_amount,d.currency),moneyA(d.total_amount,d.currency),statusText(documentEffectiveStatus(d))]);
    } else if (type === "vat_summary") {
      title = "VAT Summary"; columns = ["Tax Code", "Taxable Base", "Tax"];
      rows = taxSummary(from,to).byCode.map(r => [r.code,moneyA(r.taxable),moneyA(r.tax)]);
    }
    return { title, columns, rows };
  }

  function accountMovementInLines(account, lines) {
    const al = lines.filter(x => x.line.account_id === account.id);
    const debit = al.reduce((s, x) => s + num(x.line.base_debit), 0);
    const credit = al.reduce((s, x) => s + num(x.line.base_credit), 0);
    return round8((account.account_type === "income" || account.account_type === "liability" || account.account_type === "equity") ? credit - debit : debit - credit);
  }
  function accountBalanceAt(account, lines) { return round8(num(account.opening_balance) + accountMovementInLines(account, lines)); }

  function agingRows(kind) {
    const todayMs = dateStampA(today());
    const types = kind === "sales" ? RECEIVABLE_TYPES : PAYABLE_TYPES;
    return stateA.documents.filter(d => types.has(d.doc_type) && num(d.balance_amount) > 0 && d.status !== "draft" && d.status !== "cancelled").map(d => {
      const overdueDays = Math.max(0, Math.floor((todayMs - dateStampA(d.due_date || d.issue_date)) / 86400000));
      const vals = [0,0,0,0];
      const idx = overdueDays <= 30 ? 0 : overdueDays <= 60 ? 1 : overdueDays <= 90 ? 2 : 3;
      vals[idx] = num(d.balance_amount);
      return [d.document_no,contactName(d.contact_id),dateDisplay(d.due_date),...vals.map(v => moneyA(v,d.currency)),moneyA(d.balance_amount,d.currency)];
    });
  }

  function renderReports() {
    const body = $("#accountingWorkspaceBody");
    const [from,to] = reportDateRange();
    const report = buildReport(stateA.reportType, from, to);
    stateA.reportRows = report.rows; stateA.reportColumns = report.columns; stateA.reportTitle = report.title;
    setContextActions(`<button class="btn ghost tiny" data-acct-action="report-csv"><i class="fa-solid fa-file-csv"></i> CSV</button><button class="btn primary tiny" data-acct-action="report-pdf"><i class="fa-solid fa-file-pdf"></i> PDF</button>`);
    body.innerHTML = `
      <div class="accounting-report-toolbar">
        <label>Report<select id="acctReportType" class="input">
          <option value="trial_balance">Trial Balance</option><option value="profit_loss">Profit & Loss</option><option value="balance_sheet">Balance Sheet</option><option value="general_ledger">General Ledger</option><option value="cash_flow">Cash Flow</option><option value="ar_aging">Receivables Aging</option><option value="ap_aging">Payables Aging</option><option value="customer_balances">Customer Balances</option><option value="supplier_balances">Supplier Balances</option><option value="dimension_profitability">Dimension Profitability</option><option value="reconciliation_status">Bank Reconciliation Status</option><option value="sales_register">Sales Register</option><option value="purchase_register">Purchase Register</option><option value="vat_summary">VAT Summary</option>
        </select></label>
        <label>From<input id="acctReportFrom" class="input" type="date" value="${esc(from)}"></label><label>To<input id="acctReportTo" class="input" type="date" value="${esc(to)}"></label><button class="btn soft" data-acct-action="apply-report">Run</button>
      </div>
      <article class="accounting-card"><div class="accounting-card-head"><div><small>FINANCIAL REPORT</small><h4>${esc(report.title)}</h4><p>${dateDisplay(from)} to ${dateDisplay(to)} · ${esc(baseCurrency())} base books</p></div></div><div class="accounting-table-wrap"><table class="accounting-table accounting-report-table"><thead><tr>${report.columns.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${report.rows.map(r => `<tr>${r.map(c => `<td${reportCellIsMoney(c) ? ' class="num"' : ""}>${reportCellHtml(c)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${report.columns.length}">No records for this period.</td></tr>`}</tbody></table></div></article>`;
    $("#acctReportType").value = stateA.reportType;
    $("#acctReportType")?.addEventListener("change", e => { stateA.reportType = e.target.value; });
    $("#acctReportFrom")?.addEventListener("change", e => { stateA.reportFrom = e.target.value; });
    $("#acctReportTo")?.addEventListener("change", e => { stateA.reportTo = e.target.value; });
  }

  function renderDimensions() {
    const body = $("#accountingWorkspaceBody");
    const rows = stateA.dimensions.filter(d => searchMatch([d.dimension_type,d.code,d.name,d.notes,d.is_active ? "active" : "archived"]));
    setContextActions(can("create") ? `<button class="btn primary tiny" data-acct-action="new-dimension"><i class="fa-solid fa-plus"></i> Dimension</button>` : "");
    body.innerHTML = `<article class="accounting-card"><div class="accounting-card-head"><div><small>ANALYTICAL ACCOUNTING</small><h4>Dimensions</h4><p>Cost centres, departments, projects and branches can be tagged on journal and document lines. Archiving preserves historic analysis.</p></div></div><div class="accounting-dimension-grid">${rows.map(d => `<article class="accounting-dimension-card${d.is_active ? "" : " accounting-card-archived"}"><div class="accounting-dimension-icon"><i class="${d.dimension_type === "cost_center" ? "fa-solid fa-bullseye" : d.dimension_type === "department" ? "fa-solid fa-people-group" : d.dimension_type === "branch" ? "fa-solid fa-code-branch" : "fa-solid fa-diagram-project"}"></i></div><div><small>${esc(statusText(d.dimension_type))} · ${d.is_active ? "Active" : "Archived"}</small><strong>${esc(d.code)} · ${esc(d.name)}</strong><span>${esc(d.notes || "Analytical dimension")}</span></div><div class="accounting-dimension-actions">${can("edit") ? `<button class="icon-btn ghost" data-acct-action="edit-dimension" data-id="${esc(d.id)}" title="Edit dimension"><i class="fa-solid fa-pen"></i></button>` : ""}${can("delete") ? (d.is_active ? `<button class="icon-btn ghost danger" data-acct-action="archive-dimension" data-id="${esc(d.id)}" title="Delete safely by archiving"><i class="fa-solid fa-trash-can"></i></button>` : `<button class="icon-btn ghost" data-acct-action="restore-dimension" data-id="${esc(d.id)}" title="Restore dimension"><i class="fa-solid fa-arrow-rotate-left"></i></button>`) : ""}</div></article>`).join("") || emptyState("No dimensions")}</div></article>`;
  }

  function renderAudit() {
    const body = $("#accountingWorkspaceBody");
    const rows = stateA.audit.filter(a => searchMatch([a.entity_table,a.action,a.summary,a.created_at])).slice(0,500);
    setContextActions(`<button class="btn ghost tiny" data-acct-action="refresh"><i class="fa-solid fa-rotate"></i> Refresh</button>`);
    body.innerHTML = `<article class="accounting-card"><div class="accounting-card-head"><div><small>AUDIT TRAIL</small><h4>Accounting Change History</h4><p>Append-only history of master data, documents, journals, payments and reconciliation actions.</p></div></div>${rows.length ? `<div class="accounting-audit-list">${rows.map(a => `<div class="accounting-audit-row"><div class="accounting-audit-dot"></div><div><strong>${esc(statusText(a.action))} · ${esc(statusText(a.entity_table.replace(/^accounting_/,"")))}</strong><span>${esc(a.summary || a.entity_id || "Accounting record")}</span><small>${new Date(a.created_at).toLocaleString()}</small></div></div>`).join("")}</div>` : emptyState("No audit events yet")}</article>`;
  }

  function openAccountingModal({ title, subtitle = "", body, actions = "", wide = false, onOpen = null }) {
    closeAccountingModal();
    const previousFocus = document.activeElement;
    const modal = document.createElement("div");
    modal.id = "accountingDynamicModal";
    modal.className = "modal accounting-modal";
    modal.setAttribute("aria-hidden", "false");
    const titleId = `accountingModalTitle-${Date.now()}`;
    modal.innerHTML = `<div class="modal-backdrop" data-acct-modal-close></div><div class="modal-dialog accounting-modal-dialog${wide ? " accounting-modal-wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="${titleId}" tabindex="-1"><div class="modal-head"><div><h3 id="${titleId}">${esc(title)}</h3>${subtitle ? `<p>${esc(subtitle)}</p>` : ""}</div><button class="icon-btn ghost" type="button" data-acct-modal-close aria-label="Close">×</button></div><div class="modal-body">${body}</div>${actions ? `<div class="accounting-modal-footer">${actions}</div>` : ""}</div>`;
    document.body.appendChild(modal);
    document.body.classList.add("accounting-modal-open");
    modal.__accountingPreviousFocus = previousFocus;
    modal.addEventListener("click", e => { if (e.target.closest("[data-acct-modal-close]")) closeAccountingModal(); });
    modal.addEventListener("keydown", e => {
      if (e.key === "Escape") { e.preventDefault(); closeAccountingModal(); return; }
      if (e.key !== "Tab") return;
      const focusable = $$('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])', modal).filter(el => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    if (typeof onOpen === "function") onOpen(modal);
    requestAnimationFrame(() => {
      const preferred = modal.querySelector("input:not([type=hidden]):not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled])");
      (preferred || modal.querySelector(".accounting-modal-dialog"))?.focus({ preventScroll:true });
    });
    return modal;
  }

  function closeAccountingModal() {
    const modal = $("#accountingDynamicModal");
    const previousFocus = modal?.__accountingPreviousFocus;
    modal?.remove();
    document.body.classList.remove("accounting-modal-open");
    if (previousFocus && document.contains(previousFocus) && typeof previousFocus.focus === "function") {
      try { previousFocus.focus({ preventScroll:true }); } catch (_) {}
    }
  }

  function accountOptions({ types = null, selected = "" } = {}) {
    return stateA.accounts.filter(a => a.is_active && (!types || types.includes(a.account_type))).map(a => `<option value="${esc(a.id)}" ${a.id === selected ? "selected" : ""}>${esc(a.code)} · ${esc(a.name)}</option>`).join("");
  }
  function dimensionOptions(selected = "") {
    return `<option value="">No dimension</option>${stateA.dimensions.filter(d => d.is_active).map(d => `<option value="${esc(d.id)}" ${d.id === selected ? "selected" : ""}>${esc(statusText(d.dimension_type))} · ${esc(d.code)} ${esc(d.name)}</option>`).join("")}`;
  }
  function contactOptions(kind, selected = "") {
    const allowed = kind === "sales" ? new Set(["customer","both"]) : kind === "purchases" ? new Set(["supplier","both"]) : new Set(["customer","supplier","both"]);
    return `<option value="">Select ${kind === "sales" ? "customer" : kind === "purchases" ? "supplier" : "contact"}</option>${stateA.contacts.filter(c => c.is_active && allowed.has(c.contact_type)).map(c => `<option value="${esc(c.id)}" ${c.id === selected ? "selected" : ""}>${esc(c.name)}${c.company_name ? ` · ${esc(c.company_name)}` : ""}</option>`).join("")}`;
  }
  function taxOptions(selected = "") {
    return `<option value="">No tax</option>${stateA.taxCodes.filter(t => t.is_active).map(t => `<option value="${esc(t.id)}" data-rate="${num(t.rate)}" ${t.id === selected ? "selected" : ""}>${esc(t.code)} · ${esc(t.name)}</option>`).join("")}`;
  }
  function currencyOptions(selected = baseCurrency()) {
    const codes = global.TriplemCurrencyRegistry?.codes?.() || ["AED","SAR","PKR","USD"];
    return codes.map(c => `<option value="${esc(c)}" ${c === selected ? "selected" : ""}>${esc(c)}</option>`).join("");
  }

  function openAccountModal(id = null) {
    const a = id ? stateA.accounts.find(x => x.id === id) : null;
    openAccountingModal({
      title: a ? "Edit Account" : "New Account",
      subtitle: a?.is_system ? "System account code is protected; descriptive fields can still be refined." : "Add a ledger account without changing existing records.",
      body: `<form id="acctAccountForm" class="accounting-form"><div class="accounting-form-grid"><label>Code<input class="input" name="code" value="${esc(a?.code || "")}" required ${a?.is_system ? "readonly" : ""}></label><label>Name<input class="input" name="name" value="${esc(a?.name || "")}" required></label><label>Type<select class="input" name="account_type" ${a?.is_system ? "disabled" : ""}>${["asset","liability","equity","income","expense"].map(t => `<option value="${t}" ${a?.account_type === t ? "selected" : ""}>${statusText(t)}</option>`).join("")}</select></label><label>Subtype<input class="input" name="account_subtype" value="${esc(a?.account_subtype || "")}" placeholder="e.g. bank, payroll"></label><label>Currency<select class="input" name="currency">${currencyOptions(a?.currency || baseCurrency())}</select></label><label>Opening balance<input class="input" name="opening_balance" type="number" step="0.00000001" value="${esc(a?.opening_balance || 0)}"></label><label class="accounting-check"><input type="checkbox" name="is_cash_account" ${a?.is_cash_account ? "checked" : ""}><span>Cash / bank account</span></label><label class="accounting-form-wide">Description<textarea class="input" name="description" rows="2">${esc(a?.description || "")}</textarea></label></div></form>`,
      actions: `<button class="btn ghost" data-acct-modal-close>Cancel</button><button class="btn primary" id="acctAccountSave">Save Account</button>`,
      onOpen(modal) { $("#acctAccountSave", modal).onclick = () => saveAccount(modal, a); },
    });
  }

  async function saveAccount(modal, existing) {
    const form = $("#acctAccountForm", modal); if (!form.reportValidity()) return;
    const fd = new FormData(form);
    const payload = { owner_id: currentOwner(), code: String(fd.get("code")||"").trim(), name: String(fd.get("name")||"").trim(), account_type: existing?.is_system ? existing.account_type : fd.get("account_type"), account_subtype: String(fd.get("account_subtype")||"").trim() || null, currency: fd.get("currency") || baseCurrency(), opening_balance: num(fd.get("opening_balance")), is_cash_account: fd.get("is_cash_account") === "on", description: String(fd.get("description")||"").trim() || null };
    try {
      if (existing) await global.supabase(`accounting_accounts?id=eq.${encodeURIComponent(existing.id)}`, { method:"PATCH", body:JSON.stringify(payload), headers:{Prefer:"return=representation"} });
      else await global.supabase("accounting_accounts", { method:"POST", body:JSON.stringify(payload), headers:{Prefer:"return=representation"} });
      closeAccountingModal(); await loadAccountingWorkspace({force:true}); toast("Account saved.");
    } catch(err){ toast(err.message || "Account could not be saved.","error"); }
  }

  function openContactModal(id = null) {
    const c = id ? stateA.contacts.find(x => x.id === id) : null;
    openAccountingModal({ title: c ? "Edit Contact" : "New Contact", subtitle:"Customer and supplier master record.", body:`<form id="acctContactForm" class="accounting-form"><div class="accounting-form-grid"><label>Name<input class="input" name="name" value="${esc(c?.name||"")}" required></label><label>Type<select class="input" name="contact_type">${["customer","supplier","both"].map(t=>`<option value="${t}" ${c?.contact_type===t?"selected":""}>${statusText(t)}</option>`).join("")}</select></label><label>Company<input class="input" name="company_name" value="${esc(c?.company_name||"")}"></label><label>TRN / Tax ID<input class="input" name="tax_registration_number" value="${esc(c?.tax_registration_number||"")}"></label><label>Email<input class="input" type="email" name="email" value="${esc(c?.email||"")}"></label><label>Phone<input class="input" name="phone" value="${esc(c?.phone||"")}"></label><label>Currency<select class="input" name="currency">${currencyOptions(c?.currency||baseCurrency())}</select></label><label>Terms days<input class="input" type="number" min="0" name="payment_terms_days" value="${esc(c?.payment_terms_days ?? 30)}"></label><label class="accounting-form-wide">Address<textarea class="input" name="address" rows="2">${esc(c?.address||"")}</textarea></label><label class="accounting-form-wide">Notes<textarea class="input" name="notes" rows="2">${esc(c?.notes||"")}</textarea></label></div></form>`, actions:`<button class="btn ghost" data-acct-modal-close>Cancel</button><button class="btn primary" id="acctContactSave">Save Contact</button>`, onOpen(modal){$("#acctContactSave",modal).onclick=()=>saveContact(modal,c);} });
  }
  async function saveContact(modal, existing) {
    const form=$("#acctContactForm",modal); if(!form.reportValidity()) return; const fd=new FormData(form);
    const payload={owner_id:currentOwner(),name:String(fd.get("name")||"").trim(),contact_type:fd.get("contact_type"),company_name:String(fd.get("company_name")||"").trim()||null,tax_registration_number:String(fd.get("tax_registration_number")||"").trim()||null,email:String(fd.get("email")||"").trim()||null,phone:String(fd.get("phone")||"").trim()||null,currency:fd.get("currency")||baseCurrency(),payment_terms_days:Math.max(0,Math.floor(num(fd.get("payment_terms_days")))),address:String(fd.get("address")||"").trim()||null,notes:String(fd.get("notes")||"").trim()||null};
    try{if(existing) await global.supabase(`accounting_contacts?id=eq.${encodeURIComponent(existing.id)}`,{method:"PATCH",body:JSON.stringify(payload)});else await global.supabase("accounting_contacts",{method:"POST",body:JSON.stringify(payload)});closeAccountingModal();await loadAccountingWorkspace({force:true});toast("Contact saved.");}catch(err){toast(err.message||"Contact could not be saved.","error");}
  }

  function openDimensionModal(id = null) {
    const d=id?stateA.dimensions.find(x=>x.id===id):null;
    openAccountingModal({title:d?"Edit Dimension":"New Dimension",subtitle:"Use dimensions for profitability and responsibility reporting.",body:`<form id="acctDimensionForm" class="accounting-form"><div class="accounting-form-grid"><label>Type<select class="input" name="dimension_type">${["cost_center","department","project","branch"].map(t=>`<option value="${t}" ${d?.dimension_type===t?"selected":""}>${statusText(t)}</option>`).join("")}</select></label><label>Code<input class="input" name="code" value="${esc(d?.code||"")}" required></label><label class="accounting-form-wide">Name<input class="input" name="name" value="${esc(d?.name||"")}" required></label><label class="accounting-form-wide">Notes<textarea class="input" name="notes" rows="2">${esc(d?.notes||"")}</textarea></label></div></form>`,actions:`<button class="btn ghost" data-acct-modal-close>Cancel</button><button class="btn primary" id="acctDimensionSave">Save Dimension</button>`,onOpen(modal){$("#acctDimensionSave",modal).onclick=()=>saveDimension(modal,d);}});
  }
  async function saveDimension(modal,existing){const form=$("#acctDimensionForm",modal);if(!form.reportValidity())return;const fd=new FormData(form);const payload={owner_id:currentOwner(),dimension_type:fd.get("dimension_type"),code:String(fd.get("code")||"").trim(),name:String(fd.get("name")||"").trim(),notes:String(fd.get("notes")||"").trim()||null};try{if(existing)await global.supabase(`accounting_dimensions?id=eq.${encodeURIComponent(existing.id)}`,{method:"PATCH",body:JSON.stringify(payload)});else await global.supabase("accounting_dimensions",{method:"POST",body:JSON.stringify(payload)});closeAccountingModal();await loadAccountingWorkspace({force:true});toast("Dimension saved.");}catch(err){toast(err.message||"Dimension could not be saved.","error");}}

  function openTaxCodeModal(id = null) {
    const tc = id ? stateA.taxCodes.find(x => x.id === id) : null;
    openAccountingModal({title:tc ? `Edit ${tc.code}` : "New Tax Code",subtitle:"Tax-code changes apply to future document calculations. Historical posted values remain unchanged.",body:`<form id="acctTaxCodeForm" class="accounting-form"><div class="accounting-form-grid"><label>Code<input class="input" name="code" value="${esc(tc?.code||"")}" required ${tc?.is_system ? "readonly" : ""}></label><label>Name<input class="input" name="name" value="${esc(tc?.name||"")}" required></label><label>Rate %<input class="input" type="number" min="0" max="100" step="0.000001" name="rate" value="${esc(tc?.rate??0)}" required></label><label>Tax Kind<select class="input" name="tax_kind" ${tc?.is_system ? "disabled" : ""}>${["vat","reverse_charge","exempt","out_of_scope","custom"].map(k=>`<option value="${k}" ${tc?.tax_kind===k?"selected":""}>${statusText(k)}</option>`).join("")}</select></label><label class="accounting-check"><input type="checkbox" name="input_recoverable" ${tc?.input_recoverable!==false?"checked":""}><span>Input tax recoverable</span></label><label class="accounting-check"><input type="checkbox" name="output_taxable" ${tc?.output_taxable!==false?"checked":""}><span>Output tax applicable</span></label></div></form>`,actions:`<button class="btn ghost" data-acct-modal-close>Cancel</button><button class="btn primary" id="acctTaxCodeSave">Save Tax Code</button>`,onOpen(modal){$("#acctTaxCodeSave",modal).onclick=()=>saveTaxCode(modal,tc);}});
  }
  async function saveTaxCode(modal, existing) {
    const form=$("#acctTaxCodeForm",modal); if(!form.reportValidity()) return; const fd=new FormData(form);
    const payload={owner_id:currentOwner(),code:String(fd.get("code")||"").trim(),name:String(fd.get("name")||"").trim(),rate:Math.min(100,Math.max(0,num(fd.get("rate")))),tax_kind:existing?.is_system?existing.tax_kind:fd.get("tax_kind"),input_recoverable:fd.get("input_recoverable")==="on",output_taxable:fd.get("output_taxable")==="on"};
    try{if(existing)await global.supabase(`accounting_tax_codes?id=eq.${encodeURIComponent(existing.id)}`,{method:"PATCH",body:JSON.stringify(payload)});else await global.supabase("accounting_tax_codes",{method:"POST",body:JSON.stringify(payload)});closeAccountingModal();await loadAccountingWorkspace({force:true});toast("Tax code saved.");}catch(err){toast(err.message||"Tax code could not be saved.","error");}
  }

  async function setMasterActive(table, id, isActive, label) {
    const verb = isActive ? "restore" : "archive";
    const promptText = isActive ? `Restore this ${label} for future accounting entries?` : `Remove this ${label} from future entry lists? Historical accounting references will be preserved.`;
    if(!confirm(promptText)) return;
    try{await global.supabase(`${table}?id=eq.${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify({is_active:isActive})});await loadAccountingWorkspace({force:true});toast(`${statusText(label)} ${verb}d.`);}catch(err){toast(err.message||`${statusText(label)} could not be ${verb}d.`,"error");}
  }

  function journalLineTemplate(line = {}, index = 0) {
    return `<div class="accounting-entry-line" data-journal-line><span class="accounting-line-no">${index + 1}</span><select class="input" name="account_id" required><option value="">Select account</option>${accountOptions({selected:line.account_id})}</select><input class="input" name="description" value="${esc(line.description||"")}" placeholder="Line description"><input class="input num" name="debit" type="number" min="0" step="0.00000001" value="${line.debit ? esc(line.debit) : ""}" placeholder="Debit"><input class="input num" name="credit" type="number" min="0" step="0.00000001" value="${line.credit ? esc(line.credit) : ""}" placeholder="Credit"><select class="input" name="dimension_id">${dimensionOptions(line.dimension_id)}</select><button type="button" class="icon-btn ghost danger" data-remove-journal-line title="Remove"><i class="fa-solid fa-xmark"></i></button></div>`;
  }

  function openJournalModal(id = null) {
    const journal=id?stateA.journals.find(j=>j.id===id):null;
    const lines=journal?linesForJournal(journal.id):[{},{ }];
    openAccountingModal({title:journal?`Edit ${journal.journal_no}`:"New Journal Entry",subtitle:"Every journal must balance in base currency before it can be saved or posted.",wide:true,body:`<form id="acctJournalForm" class="accounting-form"><input type="hidden" name="id" value="${esc(journal?.id||"")}"><div class="accounting-form-grid accounting-journal-head"><label>Date<input class="input" type="date" name="journal_date" value="${esc(journal?.journal_date||today())}" required></label><label>Reference<input class="input" name="reference" value="${esc(journal?.reference||"")}"></label><label>Currency<select class="input" name="currency">${currencyOptions(journal?.currency||baseCurrency())}</select></label><label>FX to ${esc(baseCurrency())}<input class="input" type="number" min="0.0000000001" step="0.0000000001" name="fx_rate" value="${esc(journal?.fx_rate||1)}" required></label><label class="accounting-form-wide">Description<input class="input" name="description" value="${esc(journal?.description||"")}" required></label></div><div class="accounting-entry-lines-head"><strong>Journal Lines</strong><button class="btn ghost tiny" type="button" id="acctAddJournalLine"><i class="fa-solid fa-plus"></i> Line</button></div><div id="acctJournalLines" class="accounting-entry-lines">${lines.map(journalLineTemplate).join("")}</div><div id="acctJournalTotals" class="accounting-entry-totals"></div></form>`,actions:`<button class="btn ghost" data-acct-modal-close>Cancel</button><button class="btn primary" id="acctJournalSave">Save Draft</button>`,onOpen(modal){const root=$("#acctJournalLines",modal);const refresh=()=>{ $$('[data-journal-line]',root).forEach((row,i)=>{row.querySelector('.accounting-line-no').textContent=i+1;});updateJournalTotals(modal);};$("#acctAddJournalLine",modal).onclick=()=>{root.insertAdjacentHTML("beforeend",journalLineTemplate({},root.children.length));refresh();};root.addEventListener("click",e=>{const b=e.target.closest("[data-remove-journal-line]");if(b&&root.children.length>2){b.closest("[data-journal-line]").remove();refresh();}});root.addEventListener("input",refresh);$("#acctJournalSave",modal).onclick=()=>saveJournal(modal,journal);refresh();}});
  }
  function updateJournalTotals(modal){const rows=$$("[data-journal-line]",modal);const d=rows.reduce((s,r)=>s+num($("[name=debit]",r).value),0);const c=rows.reduce((s,r)=>s+num($("[name=credit]",r).value),0);const fx=num($("[name=fx_rate]",modal)?.value||1);const el=$("#acctJournalTotals",modal);if(el)el.innerHTML=`<span>Debit <strong>${moneyA(d*fx)}</strong></span><span>Credit <strong>${moneyA(c*fx)}</strong></span><span class="${Math.abs(d-c)<0.00000001?"balanced":"unbalanced"}">${Math.abs(d-c)<0.00000001?"Balanced":"Difference " + moneyA((d-c)*fx)}</span>`;}
  async function saveJournal(modal,existing){const form=$("#acctJournalForm",modal);if(!form.reportValidity())return;const fd=new FormData(form);const lines=$$("[data-journal-line]",modal).map(r=>({account_id:$("[name=account_id]",r).value,description:$("[name=description]",r).value,debit:num($("[name=debit]",r).value),credit:num($("[name=credit]",r).value),dimension_id:$("[name=dimension_id]",r).value||null,currency:fd.get("currency"),fx_rate:num(fd.get("fx_rate"))||1}));const header={id:existing?.id||null,journal_date:fd.get("journal_date"),reference:String(fd.get("reference")||"").trim(),description:String(fd.get("description")||"").trim(),currency:fd.get("currency"),fx_rate:num(fd.get("fx_rate"))||1};try{await global.supabaseRpc("app_accounting_save_journal",{p_journal:header,p_lines:lines});closeAccountingModal();await loadAccountingWorkspace({force:true});toast("Journal draft saved.");}catch(err){toast(err.message||"Journal could not be saved.","error");}}

  function documentLineTemplate(line = {}, kind = "sales", index = 0) {
    const accountTypes = kind === "sales" ? ["income"] : ["expense","asset"];
    return `<div class="accounting-doc-line" data-document-line><span class="accounting-line-no">${index+1}</span><input class="input" name="item_code" value="${esc(line.item_code||"")}" placeholder="Code"><input class="input accounting-doc-desc" name="description" value="${esc(line.description||"")}" placeholder="Description" required><input class="input num" name="quantity" type="number" min="0.00000001" step="0.00000001" value="${esc(line.quantity||1)}" required><input class="input num" name="unit_price" type="number" min="0" step="0.00000001" value="${esc(line.unit_price||0)}" required><input class="input num" name="discount_amount" type="number" min="0" step="0.00000001" value="${esc(line.discount_amount||0)}"><select class="input" name="tax_code_id">${taxOptions(line.tax_code_id)}</select><select class="input" name="account_id"><option value="">Default account</option>${accountOptions({types:accountTypes,selected:line.account_id})}</select><select class="input" name="dimension_id">${dimensionOptions(line.dimension_id)}</select><strong class="accounting-doc-line-total">${moneyA(line.total_amount||0)}</strong><button type="button" class="icon-btn ghost danger" data-remove-document-line><i class="fa-solid fa-xmark"></i></button></div>`;
  }

  function openDocumentModal(kind, id = null) {
    const doc=id?stateA.documents.find(d=>d.id===id):null;
    const actualKind=doc?(SALES_TYPES.has(doc.doc_type)?"sales":"purchases"):kind;
    const lines=doc?linesForDocument(doc.id):[{}];
    openAccountingModal({title:doc?`Edit ${doc.document_no}`:`New ${actualKind === "sales" ? "Sales" : "Purchase"} Document`,subtitle:"Save as draft first; issuing a financial document posts the matching double-entry journal.",wide:true,body:`<form id="acctDocumentForm" class="accounting-form"><input type="hidden" name="id" value="${esc(doc?.id||"")}"><div class="accounting-form-grid"><label>Document Type<select class="input" name="doc_type" ${doc?"disabled":""}>${documentKindOptions(actualKind)}</select></label><label>${actualKind==="sales"?"Customer":"Supplier"}<select class="input" name="contact_id" required>${contactOptions(actualKind,doc?.contact_id)}</select></label><label>Issue Date<input class="input" type="date" name="issue_date" value="${esc(doc?.issue_date||today())}" required></label><label>Supply Date<input class="input" type="date" name="supply_date" value="${esc(doc?.supply_date||doc?.issue_date||today())}"></label><label>Due Date<input class="input" type="date" name="due_date" value="${esc(doc?.due_date||"")}"></label><label>Currency<select class="input" name="currency">${currencyOptions(doc?.currency||baseCurrency())}</select></label><label>FX to ${esc(baseCurrency())}<input class="input" type="number" name="fx_rate" min="0.0000000001" step="0.0000000001" value="${esc(doc?.fx_rate||1)}"></label><label class="accounting-form-wide">Reference<input class="input" name="reference" value="${esc(doc?.reference||"")}"></label></div><div class="accounting-entry-lines-head"><strong>Line Items</strong><button class="btn ghost tiny" type="button" id="acctAddDocLine"><i class="fa-solid fa-plus"></i> Line</button></div><div class="accounting-doc-lines-header"><span>#</span><span>Code</span><span>Description</span><span>Qty</span><span>Price</span><span>Discount</span><span>Tax</span><span>Account</span><span>Dimension</span><span>Total</span><span></span></div><div id="acctDocumentLines" class="accounting-doc-lines">${lines.map((l,i)=>documentLineTemplate(l,actualKind,i)).join("")}</div><div id="acctDocumentTotals" class="accounting-document-totals"></div><label class="accounting-form-wide">Notes<textarea class="input" name="notes" rows="2">${esc(doc?.notes||"")}</textarea></label></form>`,actions:`<button class="btn ghost" data-acct-modal-close>Cancel</button><button class="btn primary" id="acctDocumentSave">Save Draft</button>`,onOpen(modal){const typeSel=$("[name=doc_type]",modal);if(doc)typeSel.value=doc.doc_type;const root=$("#acctDocumentLines",modal);const refresh=()=>updateDocumentTotals(modal,actualKind);$("#acctAddDocLine",modal).onclick=()=>{root.insertAdjacentHTML("beforeend",documentLineTemplate({},actualKind,root.children.length));refresh();};root.addEventListener("click",e=>{const b=e.target.closest("[data-remove-document-line]");if(b&&root.children.length>1){b.closest("[data-document-line]").remove();refresh();}});root.addEventListener("input",refresh);root.addEventListener("change",refresh);$("#acctDocumentSave",modal).onclick=()=>saveDocument(modal,doc,actualKind);refresh();}});
  }
  function updateDocumentTotals(modal,kind){let subtotal=0,discount=0,tax=0,total=0;$$('[data-document-line]',modal).forEach((row,i)=>{row.querySelector('.accounting-line-no').textContent=i+1;const q=num($("[name=quantity]",row).value);const p=num($("[name=unit_price]",row).value);const d=num($("[name=discount_amount]",row).value);const taxSel=$("[name=tax_code_id]",row);const rate=num(taxSel?.selectedOptions?.[0]?.dataset?.rate||0);const net=Math.max(0,q*p-d);const tx=net*rate/100;const tt=net+tx;subtotal+=q*p;discount+=d;tax+=tx;total+=tt;const out=$(".accounting-doc-line-total",row);if(out)out.textContent=moneyA(tt,$("[name=currency]",modal)?.value||baseCurrency());});const el=$("#acctDocumentTotals",modal);if(el)el.innerHTML=`<span>Subtotal <strong>${moneyA(subtotal,$("[name=currency]",modal)?.value||baseCurrency())}</strong></span><span>Discount <strong>${moneyA(discount,$("[name=currency]",modal)?.value||baseCurrency())}</strong></span><span>Tax <strong>${moneyA(tax,$("[name=currency]",modal)?.value||baseCurrency())}</strong></span><span class="total">Total <strong>${moneyA(total,$("[name=currency]",modal)?.value||baseCurrency())}</strong></span>`;}
  async function saveDocument(modal,existing,kind){const form=$("#acctDocumentForm",modal);if(!form.reportValidity())return;const fd=new FormData(form);const doc={id:existing?.id||null,doc_type:existing?.doc_type||fd.get("doc_type"),contact_id:fd.get("contact_id"),issue_date:fd.get("issue_date"),supply_date:fd.get("supply_date")||fd.get("issue_date"),due_date:fd.get("due_date")||null,currency:fd.get("currency"),fx_rate:num(fd.get("fx_rate"))||1,reference:String(fd.get("reference")||"").trim(),notes:String(fd.get("notes")||"").trim()};const lines=$$('[data-document-line]',modal).map(row=>({item_code:$("[name=item_code]",row).value,description:$("[name=description]",row).value,quantity:num($("[name=quantity]",row).value),unit_price:num($("[name=unit_price]",row).value),discount_amount:num($("[name=discount_amount]",row).value),tax_code_id:$("[name=tax_code_id]",row).value||null,account_id:$("[name=account_id]",row).value||null,dimension_id:$("[name=dimension_id]",row).value||null}));try{await global.supabaseRpc("app_accounting_save_document",{p_document:doc,p_lines:lines});closeAccountingModal();await loadAccountingWorkspace({force:true});toast("Document draft saved.");}catch(err){toast(err.message||"Document could not be saved.","error");}}

  function openJournalView(id) {
    const j=stateA.journals.find(x=>x.id===id);if(!j)return;const lines=linesForJournal(id);const t=journalTotals(id);
    openAccountingModal({title:j.journal_no,subtitle:`${statusText(j.status)} · ${dateDisplay(j.journal_date)}`,wide:true,body:`<div class="accounting-detail-meta"><span><small>Reference</small><strong>${esc(j.reference||"—")}</strong></span><span><small>Currency</small><strong>${esc(j.currency)} · FX ${esc(j.fx_rate)}</strong></span><span><small>Source</small><strong>${esc(statusText(j.source_type||"manual"))}</strong></span></div><p class="accounting-detail-note">${esc(j.description||"")}</p><div class="accounting-table-wrap"><table class="accounting-table"><thead><tr><th>Account</th><th>Description</th><th>Dimension</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>${lines.map(l=>`<tr><td>${esc(accountName(l.account_id))}</td><td>${esc(l.description||"")}</td><td>${esc(stateA.dimensions.find(d=>d.id===l.dimension_id)?.name||"—")}</td><td class="num">${moneyA(l.debit,l.currency)}</td><td class="num">${moneyA(l.credit,l.currency)}</td></tr>`).join("")}</tbody><tfoot><tr><th colspan="3">Base currency totals</th><th class="num">${moneyA(t.debit)}</th><th class="num">${moneyA(t.credit)}</th></tr></tfoot></table></div>`});
  }

  function documentConversionTargets(d) {
    if (!d) return [];
    if (d.doc_type === "quotation") return ["sales_order","sales_invoice"];
    if (d.doc_type === "sales_order") return ["delivery_note","sales_invoice"];
    if (d.doc_type === "delivery_note") return ["sales_invoice"];
    if (d.doc_type === "sales_invoice" && d.status !== "draft") return ["credit_note","sales_return"];
    if (d.doc_type === "purchase_order") return ["purchase_receipt","purchase_bill"];
    if (d.doc_type === "purchase_receipt") return ["purchase_bill"];
    if (["purchase_bill","expense_invoice"].includes(d.doc_type) && d.status !== "draft") return ["debit_note","purchase_return"];
    return [];
  }

  function openDocumentView(id) {
    const d=stateA.documents.find(x=>x.id===id);if(!d)return;const lines=linesForDocument(id);const payments=stateA.payments.filter(p=>p.document_id===id);
    const conversionTargets = documentConversionTargets(d);
    const creditApplied = num(d.credit_applied_amount);
    const canCancel = can("delete") && !["cancelled","paid"].includes(d.status);
    const lifecycleAction = canCancel ? `<button class="btn ${d.status === "draft" ? "ghost" : "danger"}" data-acct-action="cancel-document" data-id="${esc(d.id)}"><i class="fa-solid ${d.status === "draft" ? "fa-trash" : "fa-ban"}"></i> ${d.status === "draft" ? "Delete Draft" : "Cancel"}</button>` : "";
    openAccountingModal({title:`${DOC_LABELS[d.doc_type]} ${d.document_no}`,subtitle:`${statusText(documentEffectiveStatus(d))} · ${contactName(d.contact_id)}`,wide:true,body:`<div class="accounting-detail-meta"><span><small>Issue</small><strong>${dateDisplay(d.issue_date)}</strong></span><span><small>Supply</small><strong>${dateDisplay(d.supply_date||d.issue_date)}</strong></span><span><small>Due</small><strong>${dateDisplay(d.due_date)}</strong></span><span><small>Currency</small><strong>${esc(d.currency)} · FX ${esc(d.fx_rate)}</strong></span><span><small>Reference</small><strong>${esc(d.reference||"—")}</strong></span><span><small>Document UUID</small><strong class="accounting-uuid">${esc(d.document_uuid||"—")}</strong></span></div><div class="accounting-table-wrap"><table class="accounting-table"><thead><tr><th>Code</th><th>Description</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Tax</th><th class="num">Total</th></tr></thead><tbody>${lines.map(l=>`<tr><td>${esc(l.item_code||"—")}</td><td>${esc(l.description)}</td><td class="num">${esc(l.quantity)}</td><td class="num">${moneyA(l.unit_price,d.currency)}</td><td class="num">${moneyA(l.tax_amount,d.currency)}</td><td class="num"><strong>${moneyA(l.total_amount,d.currency)}</strong></td></tr>`).join("")}</tbody></table></div><div class="accounting-document-summary"><span>Subtotal<strong>${moneyA(d.subtotal,d.currency)}</strong></span><span>Discount<strong>${moneyA(d.discount_amount,d.currency)}</strong></span><span>Tax<strong>${moneyA(d.tax_amount,d.currency)}</strong></span><span>Total<strong>${moneyA(d.total_amount,d.currency)}</strong></span><span>Paid<strong>${moneyA(d.paid_amount,d.currency)}</strong></span>${creditApplied>0?`<span>Credits / Returns<strong>${moneyA(creditApplied,d.currency)}</strong></span>`:""}<span class="total">Balance<strong>${moneyA(d.balance_amount,d.currency)}</strong></span></div>${payments.length?`<div class="accounting-payment-history"><h5>Payments</h5>${payments.map(p=>`<div><span>${dateDisplay(p.payment_date)} · ${esc(p.reference||statusText(p.payment_type))}</span><strong>${moneyA(p.amount,p.currency)}</strong></div>`).join("")}</div>`:""}${conversionTargets.length&&can("create")?`<div class="accounting-convert-row"><span>${d.status === "draft" ? "Convert draft flow" : "Create linked adjustment"}</span>${conversionTargets.map(t=>`<button class="btn soft tiny" data-acct-action="convert-document" data-id="${esc(d.id)}" data-target="${t}">Create ${esc(DOC_LABELS[t])}</button>`).join("")}</div>`:""}` , actions:`<button class="btn ghost" data-acct-modal-close>Close</button>${lifecycleAction}<button class="btn soft" data-acct-action="document-pdf" data-id="${esc(d.id)}"><i class="fa-solid fa-file-pdf"></i> PDF</button>${d.status==='draft'&&can("edit")?`<button class="btn primary" data-acct-action="post-document" data-id="${esc(d.id)}">Issue / Post</button>`:""}`});
  }

  function openPaymentModal(id) {
    const d=stateA.documents.find(x=>x.id===id);if(!d)return;const cash=stateA.accounts.filter(a=>a.is_cash_account&&a.is_active);
    openAccountingModal({title:RECEIVABLE_TYPES.has(d.doc_type)?"Record Customer Receipt":"Record Supplier Payment",subtitle:`${d.document_no} · Open ${moneyA(d.balance_amount,d.currency)}`,body:`<form id="acctPaymentForm" class="accounting-form"><div class="accounting-form-grid"><label>Amount<input class="input" type="number" name="amount" min="0.00000001" max="${esc(d.balance_amount)}" step="0.00000001" value="${esc(d.balance_amount)}" required></label><label>Cash / Bank Account<select class="input" name="account_id" required><option value="">Select account</option>${cash.map(a=>`<option value="${esc(a.id)}">${esc(a.code)} · ${esc(a.name)}</option>`).join("")}</select></label><label>Date<input class="input" type="date" name="payment_date" value="${today()}" required></label><label>FX to ${esc(baseCurrency())}<input class="input" type="number" min="0.0000000001" step="0.0000000001" name="fx_rate" value="${esc(d.fx_rate||1)}"></label><label class="accounting-form-wide">Reference<input class="input" name="reference" placeholder="Bank reference / receipt no."></label><label class="accounting-form-wide">Notes<textarea class="input" name="notes" rows="2"></textarea></label></div></form>`,actions:`<button class="btn ghost" data-acct-modal-close>Cancel</button><button class="btn primary" id="acctPaymentSave">Record Payment</button>`,onOpen(modal){$("#acctPaymentSave",modal).onclick=async()=>{const f=$("#acctPaymentForm",modal);if(!f.reportValidity())return;const fd=new FormData(f);try{await global.supabaseRpc("app_accounting_record_payment",{p_document_id:d.id,p_amount:num(fd.get("amount")),p_account_id:fd.get("account_id"),p_payment_date:fd.get("payment_date"),p_reference:String(fd.get("reference")||"").trim()||null,p_notes:String(fd.get("notes")||"").trim()||null,p_fx_rate:num(fd.get("fx_rate"))||d.fx_rate||1});closeAccountingModal();await loadAccountingWorkspace({force:true});toast("Payment recorded and posted to the ledger.");}catch(err){toast(err.message||"Payment could not be recorded.","error");}};}});
  }

  function openBankTransactionModal(id = null) {
    const tx = id ? stateA.bankTransactions.find(t => t.id === id) : null;
    if (tx && (tx.reconciliation_status === "matched" || tx.matched_journal_id)) { toast("Unmatch this bank row before editing it.", "error"); return; }
    const cash=stateA.accounts.filter(a=>a.is_cash_account&&a.is_active);
    openAccountingModal({title:tx?"Edit Bank Transaction":"Add Bank Transaction",subtitle:"Statement evidence for reconciliation. Editing this row does not alter any posted journal.",body:`<form id="acctBankForm" class="accounting-form"><div class="accounting-form-grid"><label>Bank Account<select class="input" name="bank_account_id"><option value="">Any bank account</option>${cash.map(a=>`<option value="${esc(a.id)}" ${a.id===tx?.bank_account_id?"selected":""}>${esc(a.code)} · ${esc(a.name)}</option>`).join("")}</select></label><label>Date<input class="input" type="date" name="transaction_date" value="${esc(tx?.transaction_date||today())}" required></label><label>Amount<input class="input" type="number" step="0.00000001" name="amount" value="${esc(tx?.amount??"")}" required placeholder="Positive receipt, negative payment"></label><label>Currency<select class="input" name="currency">${currencyOptions(tx?.currency||baseCurrency())}</select></label><label class="accounting-form-wide">Description<input class="input" name="description" value="${esc(tx?.description||"")}" required></label><label class="accounting-form-wide">Reference<input class="input" name="reference" value="${esc(tx?.reference||"")}"></label></div></form>`,actions:`<button class="btn ghost" data-acct-modal-close>Cancel</button><button class="btn primary" id="acctBankSave">${tx?"Save Changes":"Add Row"}</button>`,onOpen(modal){$("#acctBankSave",modal).onclick=async()=>{const f=$("#acctBankForm",modal);if(!f.reportValidity())return;const fd=new FormData(f);const payload={owner_id:currentOwner(),bank_account_id:fd.get("bank_account_id")||null,transaction_date:fd.get("transaction_date"),description:String(fd.get("description")||"").trim(),reference:String(fd.get("reference")||"").trim()||null,amount:num(fd.get("amount")),currency:fd.get("currency"),source:tx?.source||"manual",...(tx?{import_fingerprint:null}:{})};try{if(tx)await global.supabase(`accounting_bank_transactions?id=eq.${encodeURIComponent(tx.id)}`,{method:"PATCH",body:JSON.stringify(payload)});else await global.supabase("accounting_bank_transactions",{method:"POST",body:JSON.stringify(payload)});closeAccountingModal();await loadAccountingWorkspace({force:true});toast(tx?"Bank row updated.":"Bank row added.");}catch(err){toast(err.message||"Bank row could not be saved.","error");}};}});
  }

  async function handleBankImportFile(event) {
    const file=event.target.files?.[0];event.target.value="";if(!file)return;
    try{
      if(!global.XLSX) throw new Error("Spreadsheet parser is still loading.");
      const data=await file.arrayBuffer();const book=global.XLSX.read(data,{type:"array",cellDates:true});const sheet=book.Sheets[book.SheetNames[0]];const raw=global.XLSX.utils.sheet_to_json(sheet,{defval:"",raw:false});if(!raw.length)throw new Error("The statement contains no rows.");
      const normalized=raw.map((row,index)=>normalizeBankImportRow(row,index)).filter(Boolean);if(!normalized.length)throw new Error("Could not detect transaction date and amount columns.");stateA.pendingBankImport={name:file.name,rows:normalized};openBankImportConfirm();
    }catch(err){toast(err.message||"Bank file could not be read.","error");}
  }
  function normalizeBankImportRow(row,index){const entries=Object.entries(row);const get=(tests)=>{const e=entries.find(([k])=>tests.some(t=>String(k).toLowerCase().includes(t)));return e?e[1]:"";};let date=get(["transaction date","posting date","date"]);let amount=get(["amount","value"]);const debit=get(["debit","withdrawal"]);const credit=get(["credit","deposit"]);if(amount===""&& (debit!==""||credit!=="")) amount=num(credit)-num(debit);if(!date||amount==="")return null;try{if(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(String(date))){const d=new Date(date);if(!isNaN(d))date=d.toISOString().slice(0,10);}else{const d=new Date(date);if(!isNaN(d))date=d.toISOString().slice(0,10);}}catch(_){}return {transaction_date:String(date).slice(0,10),amount:num(String(amount).replace(/[^0-9.\-]/g,"")),description:String(get(["description","narration","memo","details","merchant"])||`Imported row ${index+1}`),reference:String(get(["reference","ref","transaction id","id"])||"")};}
  function stableBankHash(value){let h=2166136261;const text=String(value||"");for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16).padStart(8,"0");}
  function bankImportFingerprint(row,bank,currency){const normalized=[row.transaction_date,round8(row.amount).toFixed(8),String(row.reference||"").trim().toLowerCase(),String(row.description||"").trim().replace(/\s+/g," ").toLowerCase(),bank||"",currency||baseCurrency()].join("|");return `v1-${stableBankHash(normalized)}-${stableBankHash(normalized.split("").reverse().join(""))}`;}
  function openBankImportConfirm(){const imp=stateA.pendingBankImport;if(!imp)return;const cash=stateA.accounts.filter(a=>a.is_cash_account&&a.is_active);openAccountingModal({title:"Import Bank Statement",subtitle:`${imp.name} · ${imp.rows.length} rows detected`,body:`<div class="accounting-form-grid"><label>Bank Account<select id="acctImportBank" class="input"><option value="">Any bank account</option>${cash.map(a=>`<option value="${esc(a.id)}">${esc(a.code)} · ${esc(a.name)}</option>`).join("")}</select></label><label>Currency<select id="acctImportCurrency" class="input">${currencyOptions(baseCurrency())}</select></label></div><div class="accounting-import-preview">${imp.rows.slice(0,8).map(r=>`<div><span>${esc(r.transaction_date)} · ${esc(r.description)}</span><strong>${num(r.amount).toLocaleString()}</strong></div>`).join("")}</div>${imp.rows.length>8?`<p class="help">And ${imp.rows.length-8} more rows.</p>`:""}<p class="help">Repeated statement rows are detected and skipped using a deterministic import fingerprint.</p>`,actions:`<button class="btn ghost" data-acct-modal-close>Cancel</button><button class="btn primary" id="acctImportBankSave">Import ${imp.rows.length} Rows</button>`,onOpen(modal){$("#acctImportBankSave",modal).onclick=async()=>{const bank=$("#acctImportBank",modal).value||null;const currency=$("#acctImportCurrency",modal).value||baseCurrency();const existing=new Set(stateA.bankTransactions.map(r=>r.import_fingerprint).filter(Boolean));const seen=new Set(existing);let skipped=0;const payload=[];for(const r of imp.rows){const fingerprint=bankImportFingerprint(r,bank,currency);if(seen.has(fingerprint)){skipped++;continue;}seen.add(fingerprint);payload.push({owner_id:currentOwner(),bank_account_id:bank,transaction_date:r.transaction_date,description:r.description,reference:r.reference||null,amount:r.amount,currency,source:imp.name.toLowerCase().endsWith(".csv")?"csv":"xlsx",import_fingerprint:fingerprint});}if(!payload.length){toast(`No new bank rows to import. ${skipped} duplicate row${skipped===1?" was":"s were"} skipped.`);return;}try{for(let i=0;i<payload.length;i+=100){await global.supabase("accounting_bank_transactions",{method:"POST",body:JSON.stringify(payload.slice(i,i+100))});}stateA.pendingBankImport=null;closeAccountingModal();await loadAccountingWorkspace({force:true});toast(`${payload.length} bank rows imported${skipped?` · ${skipped} duplicate${skipped===1?"":"s"} skipped`:""}.`);}catch(err){toast(err.message||"Bank import failed.","error");}};}});}

  function openBankMatchChooser(txId){const tx=stateA.bankTransactions.find(t=>t.id===txId);if(!tx)return;const candidates=stateA.journals.filter(j=>j.status==="posted").slice(0,250);openAccountingModal({title:"Match Bank Transaction",subtitle:`${dateDisplay(tx.transaction_date)} · ${moneyA(tx.amount,tx.currency)}`,body:`<label>Posted Journal<select id="acctMatchJournal" class="input"><option value="">Select journal</option>${candidates.map(j=>`<option value="${esc(j.id)}">${esc(j.journal_no)} · ${dateDisplay(j.journal_date)} · ${esc(j.description||j.reference||"")}</option>`).join("")}</select></label>`,actions:`<button class="btn ghost" data-acct-modal-close>Cancel</button><button class="btn primary" id="acctMatchSave">Match</button>`,onOpen(modal){$("#acctMatchSave",modal).onclick=async()=>{const jid=$("#acctMatchJournal",modal).value;if(!jid)return;await matchBank(tx.id,jid);closeAccountingModal();};}});}
  async function matchBank(txId,journalId){try{await global.supabaseRpc("app_accounting_match_bank_transaction",{p_bank_transaction_id:txId,p_journal_id:journalId});await loadAccountingWorkspace({force:true});toast("Bank transaction reconciled.");}catch(err){toast(err.message||"Could not reconcile transaction.","error");}}
  async function unmatchBank(txId){if(!confirm("Remove this bank match and return the row to unreconciled status?"))return;try{await global.supabaseRpc("app_accounting_unmatch_bank_transaction",{p_bank_transaction_id:txId});await loadAccountingWorkspace({force:true});toast("Bank match removed.");}catch(err){toast(err.message||"Could not remove bank match.","error");}}

  function openSettingsModal(){const s=stateA.settings||{};const isOwner=String(global.state?.sessionUser?.id||"")===String(currentOwner()||"");openAccountingModal({title:"Accounting Settings",subtitle:"Base books, fiscal year, closed periods and management tax configuration.",body:`<form id="acctSettingsForm" class="accounting-form"><div class="accounting-form-grid"><label>Base Currency<select class="input" name="base_currency">${currencyOptions(s.base_currency||"AED")}</select></label><label>Invoice terms days<input class="input" type="number" min="0" name="invoice_terms_days" value="${esc(s.invoice_terms_days??30)}"></label><label>Fiscal start month<input class="input" type="number" min="1" max="12" name="fiscal_year_start_month" value="${esc(s.fiscal_year_start_month??1)}"></label><label>Fiscal start day<input class="input" type="number" min="1" max="28" name="fiscal_year_start_day" value="${esc(s.fiscal_year_start_day??1)}"></label><label>Books locked through<input class="input" type="date" name="books_lock_date" value="${esc(s.books_lock_date||"")}" ${isOwner?"":"disabled"}><small>${isOwner?"Posting on or before this date will be blocked.":"Only the company owner can change the closed-period date."}</small></label><label>Tax Registration Name<input class="input" name="tax_registration_name" value="${esc(s.tax_registration_name||"")}"></label><label>TRN / Tax Registration No.<input class="input" name="tax_registration_number" value="${esc(s.tax_registration_number||"")}"></label><label>CT Threshold<input class="input" type="number" min="0" step="0.01" name="corporate_tax_threshold" value="${esc(s.corporate_tax_threshold??375000)}"></label><label>CT Rate %<input class="input" type="number" min="0" max="100" step="0.01" name="corporate_tax_rate" value="${esc(s.corporate_tax_rate??9)}"></label><label class="accounting-check accounting-form-wide"><input type="checkbox" name="corporate_tax_enabled" ${s.corporate_tax_enabled?"checked":""}><span>Enable management corporate-tax estimate</span></label></div></form>`,actions:`<button class="btn ghost" data-acct-modal-close>Cancel</button><button class="btn primary" id="acctSettingsSave">Save Settings</button>`,onOpen(modal){$("#acctSettingsSave",modal).onclick=()=>saveSettings(modal);}});}
  async function saveSettings(modal){const f=$("#acctSettingsForm",modal);if(!f.reportValidity())return;const fd=new FormData(f);const isOwner=String(global.state?.sessionUser?.id||"")===String(currentOwner()||"");const payload={owner_id:currentOwner(),base_currency:fd.get("base_currency"),invoice_terms_days:Math.max(0,Math.floor(num(fd.get("invoice_terms_days")))),fiscal_year_start_month:Math.min(12,Math.max(1,Math.floor(num(fd.get("fiscal_year_start_month"))))),fiscal_year_start_day:Math.min(28,Math.max(1,Math.floor(num(fd.get("fiscal_year_start_day"))))),books_lock_date:isOwner?(fd.get("books_lock_date")||null):(stateA.settings?.books_lock_date||null),tax_registration_name:String(fd.get("tax_registration_name")||"").trim()||null,tax_registration_number:String(fd.get("tax_registration_number")||"").trim()||null,corporate_tax_threshold:Math.max(0,num(fd.get("corporate_tax_threshold"))),corporate_tax_rate:Math.min(100,Math.max(0,num(fd.get("corporate_tax_rate")))),corporate_tax_enabled:fd.get("corporate_tax_enabled")==="on"};try{if(stateA.settings)await global.supabase(`accounting_settings?owner_id=eq.${encodeURIComponent(currentOwner())}`,{method:"PATCH",body:JSON.stringify(payload)});else await global.supabase("accounting_settings",{method:"POST",body:JSON.stringify(payload)});closeAccountingModal();await loadAccountingWorkspace({force:true});toast("Accounting settings saved.");}catch(err){toast(err.message||"Settings could not be saved.","error");}}

  async function postJournal(id){try{await global.supabaseRpc("app_accounting_post_journal",{p_journal_id:id});await loadAccountingWorkspace({force:true});toast("Journal posted.");}catch(err){toast(err.message||"Journal could not be posted.","error");}}
  async function voidJournal(id){const reason=prompt("Reason for voiding this posted journal:","");if(reason===null)return;try{await global.supabaseRpc("app_accounting_void_journal",{p_journal_id:id,p_reason:reason||null});await loadAccountingWorkspace({force:true});toast("Journal voided with an automatic reversal.");}catch(err){toast(err.message||"Journal could not be voided.","error");}}
  async function postDocument(id){try{await global.supabaseRpc("app_accounting_post_document",{p_document_id:id});closeAccountingModal();await loadAccountingWorkspace({force:true});toast("Document issued and ledger posting completed.");}catch(err){toast(err.message||"Document could not be issued.","error");}}
  async function convertDocument(id,target){try{const result=await global.supabaseRpc("app_accounting_convert_document",{p_source_id:id,p_target_type:target});closeAccountingModal();await loadAccountingWorkspace({force:true});toast(`${DOC_LABELS[target]} ${result?.document_no||""} created as draft.`);}catch(err){toast(err.message||"Document conversion failed.","error");}}

  async function cancelDocument(id){const d=stateA.documents.find(x=>x.id===id);if(!d)return;let reason=null;if(d.status==="draft"){if(!confirm(`Permanently delete draft ${d.document_no}?`))return;}else{reason=prompt(`Reason for cancelling ${d.document_no}:`,"");if(reason===null)return;if(!String(reason).trim()){toast("A cancellation reason is required.","error");return;}}try{await global.supabaseRpc("app_accounting_cancel_document",{p_document_id:id,p_reason:reason?String(reason).trim():null});closeAccountingModal();await loadAccountingWorkspace({force:true});toast(d.status==="draft"?"Draft deleted.":"Document cancelled with ledger reversal where applicable.");}catch(err){toast(err.message||"Document could not be cancelled.","error");}}

  async function qrDataUrl(text) {
    if (!global.QRCode || !text) return null;
    const holder=document.createElement("div");holder.style.cssText="position:fixed;left:-9999px;top:-9999px;width:140px;height:140px;background:#fff";document.body.appendChild(holder);
    try { new global.QRCode(holder,{text:String(text),width:140,height:140,correctLevel:global.QRCode.CorrectLevel?.M}); await new Promise(resolve=>setTimeout(resolve,80)); const canvas=holder.querySelector("canvas"); if(canvas)return canvas.toDataURL("image/png"); const img=holder.querySelector("img"); return img?.src||null; } catch (_) { return null; } finally { holder.remove(); }
  }

  async function downloadAccountingPdf(title, columns, rows, filename, meta = [], options = {}) {
    if (!global.jspdf?.jsPDF) { toast("PDF library is still loading.","error"); return; }
    const { jsPDF } = global.jspdf; const doc = new jsPDF({orientation:columns.length>6?"landscape":"portrait"});
    const company = typeof global.getPdfCompanyContact === "function" ? global.getPdfCompanyContact() : {name:"Triplem VIP"};
    let logo=null;try{logo=typeof global.getPdfLogo==="function"?await global.getPdfLogo():null;}catch(_){}
    if(logo&&typeof global.drawFittedPdfImage==="function")global.drawFittedPdfImage(doc,logo,14,10,30,15);
    doc.setFontSize(15);doc.text(String(company?.name||"Triplem VIP"),48,16);doc.setFontSize(11);doc.text(title,14,34);doc.setFontSize(8);doc.text(`Generated ${new Date().toLocaleString()} · Base ${baseCurrency()}`,14,40);
    if(options.qrText){const qr=await qrDataUrl(options.qrText);if(qr){try{const pageW=doc.internal.pageSize.getWidth();doc.addImage(qr,"PNG",pageW-38,10,26,26);doc.setFontSize(6);doc.text("Document reference",pageW-25,39,{align:"center"});}catch(_){}}}
    let y=46;if(meta.length){meta.forEach(([k,v])=>{doc.text(`${reportCellText(k)}: ${reportCellText(v)}`,14,y);y+=5;});y+=2;}
    const exportColumns = (columns || []).map(reportCellText);
    const exportRows = (rows || []).map(row => (row || []).map(reportCellText));
    if(typeof doc.autoTable==="function")doc.autoTable({startY:y,head:[exportColumns],body:exportRows,styles:{fontSize:7,cellPadding:2},headStyles:{fillColor:[36,87,214]},margin:{left:10,right:10}});
    else { exportRows.slice(0,40).forEach((r,i)=>doc.text(r.join(" | ").slice(0,150),14,y+i*5)); }
    doc.save(filename);
  }

  async function downloadDocumentPdf(id){const d=stateA.documents.find(x=>x.id===id);if(!d)return;const lines=linesForDocument(id);const contact=stateA.contacts.find(c=>c.id===d.contact_id);const sellerTrn=stateA.settings?.tax_registration_number||"";const qrPayload=["Triplem VIP Document",d.document_uuid||d.id,d.document_no,d.issue_date,d.supply_date||d.issue_date,d.currency,round8(d.total_amount).toFixed(2),round8(d.tax_amount).toFixed(2),sellerTrn].join("|");await downloadAccountingPdf(`${DOC_LABELS[d.doc_type]} ${d.document_no}`,["Code","Description","Qty","Unit Price","Discount","Tax","Total"],lines.map(l=>[l.item_code||"",l.description,String(l.quantity),moneyA(l.unit_price,d.currency),moneyA(l.discount_amount,d.currency),moneyA(l.tax_amount,d.currency),moneyA(l.total_amount,d.currency)]),`${d.document_no}.pdf`,[["Party",contactName(d.contact_id)],["Party Tax No.",contact?.tax_registration_number||"—"],["Issue Date",dateDisplay(d.issue_date)],["Supply Date",dateDisplay(d.supply_date||d.issue_date)],["Due Date",dateDisplay(d.due_date)],["Seller Tax No.",sellerTrn||"—"],["Currency",d.currency],["Document UUID",d.document_uuid||d.id],["Total",moneyA(d.total_amount,d.currency)],["Credits / Returns",moneyA(d.credit_applied_amount||0,d.currency)],["Balance",moneyA(d.balance_amount,d.currency)]],{qrText:qrPayload});}
  async function downloadReportPdf(){await downloadAccountingPdf(stateA.reportTitle,stateA.reportColumns,stateA.reportRows,`${stateA.reportTitle.replace(/[^a-z0-9]+/gi,"_")}_${today()}.pdf`,[["Period",`${stateA.reportFrom} to ${stateA.reportTo}`]]);}
  function downloadReportCsv(){const lines=[stateA.reportColumns,...stateA.reportRows].map(row=>row.map(v=>`"${reportCellText(v).replace(/"/g,'""')}"`).join(","));const blob=new Blob([lines.join("\r\n")],{type:"text/csv;charset=utf-8"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`${stateA.reportTitle.replace(/[^a-z0-9]+/gi,"_")}_${today()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  async function downloadTaxPdf(){const t=taxSummary();await downloadAccountingPdf("Tax Summary",["Tax Code","Taxable Base","Tax"],t.byCode.map(r=>[r.code,moneyA(r.taxable),moneyA(r.tax)]),`Tax_Summary_${today()}.pdf`,[["Output Tax",moneyA(t.output)],["Input Tax",moneyA(t.input)],["Net",moneyA(t.net)]]);}

  async function handleAccountingAction(action, el) {
    switch(action){
      case "guide": return openAccountingGuide();
      case "refresh": return loadAccountingWorkspace({force:true});
      case "quick-new": return openQuickNewMenu();
      case "new-account": return openAccountModal();
      case "edit-account": return openAccountModal(el.dataset.id);
      case "archive-account": return setMasterActive("accounting_accounts",el.dataset.id,false,"account");
      case "restore-account": return setMasterActive("accounting_accounts",el.dataset.id,true,"account");
      case "new-contact": return openContactModal();
      case "edit-contact": return openContactModal(el.dataset.id);
      case "archive-contact": return setMasterActive("accounting_contacts",el.dataset.id,false,"contact");
      case "restore-contact": return setMasterActive("accounting_contacts",el.dataset.id,true,"contact");
      case "new-dimension": return openDimensionModal();
      case "edit-dimension": return openDimensionModal(el.dataset.id);
      case "archive-dimension": return setMasterActive("accounting_dimensions",el.dataset.id,false,"dimension");
      case "restore-dimension": return setMasterActive("accounting_dimensions",el.dataset.id,true,"dimension");
      case "new-tax-code": return openTaxCodeModal();
      case "edit-tax-code": return openTaxCodeModal(el.dataset.id);
      case "archive-tax-code": return setMasterActive("accounting_tax_codes",el.dataset.id,false,"tax code");
      case "restore-tax-code": return setMasterActive("accounting_tax_codes",el.dataset.id,true,"tax code");
      case "new-journal": return openJournalModal();
      case "edit-journal": return openJournalModal(el.dataset.id);
      case "view-journal": return openJournalView(el.dataset.id);
      case "post-journal": return postJournal(el.dataset.id);
      case "delete-journal": return deleteDraftJournal(el.dataset.id);
      case "void-journal": return voidJournal(el.dataset.id);
      case "new-sales-document": return openDocumentModal("sales");
      case "new-purchases-document": return openDocumentModal("purchases");
      case "edit-document": { const d=stateA.documents.find(x=>x.id===el.dataset.id); return openDocumentModal(d&&SALES_TYPES.has(d.doc_type)?"sales":"purchases",el.dataset.id); }
      case "view-document": return openDocumentView(el.dataset.id);
      case "post-document": return postDocument(el.dataset.id);
      case "record-payment": return openPaymentModal(el.dataset.id);
      case "convert-document": return convertDocument(el.dataset.id,el.dataset.target);
      case "cancel-document": return cancelDocument(el.dataset.id);
      case "document-pdf": return downloadDocumentPdf(el.dataset.id);
      case "new-bank-transaction": return openBankTransactionModal();
      case "edit-bank-transaction": return openBankTransactionModal(el.dataset.id);
      case "delete-bank-transaction": return deleteBankTransaction(el.dataset.id);
      case "import-bank": return $("#accountingBankImportInput")?.click();
      case "match-bank": return matchBank(el.dataset.id,el.dataset.journalId);
      case "unmatch-bank": return unmatchBank(el.dataset.id);
      case "choose-bank-match": return openBankMatchChooser(el.dataset.id);
      case "ignore-bank": return ignoreBank(el.dataset.id);
      case "restore-bank": return restoreBank(el.dataset.id);
      case "settings": return openSettingsModal();
      case "apply-tax-filter": stateA.reportFrom=$("#acctTaxFrom")?.value||"";stateA.reportTo=$("#acctTaxTo")?.value||"";return renderAccountingView();
      case "tax-pdf": return downloadTaxPdf();
      case "apply-report": stateA.reportType=$("#acctReportType")?.value||stateA.reportType;stateA.reportFrom=$("#acctReportFrom")?.value||stateA.reportFrom;stateA.reportTo=$("#acctReportTo")?.value||stateA.reportTo;return renderAccountingView();
      case "report-pdf": return downloadReportPdf();
      case "report-csv": return downloadReportCsv();
    }
  }

  function openQuickNewMenu(){
    if(!can("create")){toast("You do not have permission to create accounting records.","error");return;}
    openAccountingModal({title:"New Accounting Record",subtitle:"Choose the workflow you want to start.",body:`<div class="accounting-quick-grid"><button class="accounting-quick-btn" data-acct-action="new-journal"><i class="fa-solid fa-book"></i><strong>Journal Entry</strong><span>Balanced double entry</span></button><button class="accounting-quick-btn" data-acct-action="new-sales-document"><i class="fa-solid fa-file-invoice-dollar"></i><strong>Sales Document</strong><span>Quote, order or invoice</span></button><button class="accounting-quick-btn" data-acct-action="new-purchases-document"><i class="fa-solid fa-file-invoice"></i><strong>Purchase Document</strong><span>PO, receipt or bill</span></button><button class="accounting-quick-btn" data-acct-action="new-contact"><i class="fa-solid fa-user-plus"></i><strong>Contact</strong><span>Customer or supplier</span></button><button class="accounting-quick-btn" data-acct-action="new-bank-transaction"><i class="fa-solid fa-building-columns"></i><strong>Bank Row</strong><span>Manual reconciliation item</span></button><button class="accounting-quick-btn" data-acct-action="new-dimension"><i class="fa-solid fa-diagram-project"></i><strong>Dimension</strong><span>Cost centre or project</span></button></div>`});
  }

  function openAccountingGuide(){
    const sections = VIEWS.map(([id,label,icon])=>{const g=VIEW_GUIDES[id]||VIEW_GUIDES.overview;return `<article class="accounting-guide-card${id===stateA.view?" active":""}"><i class="${icon}"></i><div><small>${esc(label)}</small><strong>${esc(g[1])}</strong><span>${esc(g[2])}</span></div></article>`;}).join("");
    openAccountingModal({title:"Accounting Guide",subtitle:"A concise map of the accounting lifecycle and the safeguards that preserve financial history.",wide:true,body:`<div class="accounting-guide-intro"><i class="fa-solid fa-shield-halved"></i><div><strong>Correct records at their lifecycle stage</strong><span>Draft records can be edited or deleted. Posted journals are voided by reversal, issued documents are cancelled or adjusted, and used master data is archived so historical reports remain explicable.</span></div></div><div class="accounting-guide-grid">${sections}</div>`,actions:`<button class="btn primary" data-acct-modal-close>Done</button>`});
  }

  async function deleteDraftJournal(id){
    const journal=stateA.journals.find(j=>j.id===id);if(!journal)return;
    if(journal.status!=="draft"){toast("Only draft journals can be deleted. Posted journals must be voided by reversal.","error");return;}
    if(!confirm(`Delete draft ${journal.journal_no}? This draft has not affected the posted ledger.`))return;
    try{await global.supabaseRpc("app_accounting_void_journal",{p_journal_id:id,p_reason:null});closeAccountingModal();await loadAccountingWorkspace({force:true});toast("Journal draft deleted.");}catch(err){toast(err.message||"Journal draft could not be deleted.","error");}
  }

  async function deleteBankTransaction(id){
    const tx=stateA.bankTransactions.find(t=>t.id===id);if(!tx)return;
    if(tx.reconciliation_status==="matched"||tx.matched_journal_id){toast("Unmatch this bank row before deleting it.","error");return;}
    if(!confirm(`Delete the bank row dated ${dateDisplay(tx.transaction_date)} for ${reportCellText(moneyA(tx.amount,tx.currency))}? No posted journal will be deleted.`))return;
    try{await global.supabase(`accounting_bank_transactions?id=eq.${encodeURIComponent(id)}`,{method:"DELETE"});closeAccountingModal();await loadAccountingWorkspace({force:true});toast("Bank row deleted.");}catch(err){toast(err.message||"Bank row could not be deleted.","error");}
  }

  async function ignoreBank(id){try{await global.supabase(`accounting_bank_transactions?id=eq.${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify({reconciliation_status:"ignored",matched_journal_id:null})});await loadAccountingWorkspace({force:true});toast("Bank row marked ignored.");}catch(err){toast(err.message||"Bank row could not be updated.","error");}}
  async function restoreBank(id){try{await global.supabase(`accounting_bank_transactions?id=eq.${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify({reconciliation_status:"unreconciled",matched_journal_id:null})});await loadAccountingWorkspace({force:true});toast("Bank row returned to unreconciled.");}catch(err){toast(err.message||"Bank row could not be updated.","error");}}

  // Close or dispatch actions inside dynamic modals using the same central action handler.
  document.addEventListener("click", (event) => {
    const action=event.target.closest("#accountingDynamicModal [data-acct-action]");
    if(action){event.preventDefault();void handleAccountingAction(action.dataset.acctAction,action);}
  });

  function init() {
    ensureAccountingUi();
    if (!stateA.reportFrom || !stateA.reportTo) reportDateRange();
  }
  global.loadAccountingWorkspace = loadAccountingWorkspace;
  global.renderAccountingWorkspace = renderAccountingView;
  global.TriplemAccounting = { state: stateA, load: loadAccountingWorkspace, render: renderAccountingView, openDocument: openDocumentModal, openJournal: openJournalModal };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once:true });
  else init();
})(window);
