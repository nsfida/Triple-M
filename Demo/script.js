"use strict";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const money = value => `AED ${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const uid = prefix => `${prefix}-${Math.random().toString(16).slice(2, 9)}`;
const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
const timingScale = reducedMotion ? 0.12 : 1;

const MODULES = [
  { key: "dashboard", label: "Dashboard", icon: "fa-chart-line", kicker: "Detailed Dashboard", title: "Financial Overview", description: "Live sample summaries across wallets, expenses, loans, assets, inventory, and installments.", action: "Watch overview" },
  { key: "wallets", label: "Wallets", icon: "fa-wallet", kicker: "Expenses · Wallets", title: "Wallet Accounts", description: "Create, top up, edit, and transfer between multi-currency accounts.", action: "Run wallet flow" },
  { key: "expenses", label: "Expenses", icon: "fa-coins", kicker: "Expense Tracking", title: "Expenses", description: "Record spending against a wallet, then edit or remove the transaction.", action: "Run expense flow" },
  { key: "loans", label: "Loans", icon: "fa-hand-holding-dollar", kicker: "Loan Ledger", title: "Loans Given & Taken", description: "Track both loan directions with partial and complete settlement states.", action: "Run loan flow" },
  { key: "assets", label: "Assets", icon: "fa-building", kicker: "Asset Management", title: "Owned Assets", description: "Track purchase value, current valuation, performance, and asset records.", action: "Run asset flow" },
  { key: "installments", label: "Installments", icon: "fa-calendar-days", kicker: "Installment Plans", title: "Installment Schedule", description: "Create a plan, record payments, and follow remaining balances to completion.", action: "Run installment flow" },
  { key: "inventory", label: "Inventory", icon: "fa-boxes-stacked", kicker: "Inventory", title: "Stock & Catalog", description: "Add stock, update item details, and keep quantities current.", action: "Run inventory flow" },
  { key: "sales", label: "Sales", icon: "fa-cash-register", kicker: "Inventory · Sales", title: "Sales Cart", description: "Select stock, finalize a customer sale, and watch quantity and profit update.", action: "Run sales flow" },
  { key: "customers", label: "Customers", icon: "fa-users", kicker: "Customers / Invoices", title: "Customer Accounts", description: "Create customer records, inspect invoice history, and settle outstanding balances.", action: "Run customer flow" },
  { key: "reports", label: "Reports", icon: "fa-file-pdf", kicker: "Reports & PDF", title: "Report Center", description: "Choose report scope, generate a preview, and download a safe sample PDF.", action: "Run report flow" },
  { key: "notes", label: "Notes", icon: "fa-note-sticky", kicker: "Notes", title: "Notes & Reminders", description: "Capture operational context and attach a reminder to it.", action: "Run notes flow" },
  { key: "bitcoin", label: "Bitcoin", icon: "fa-bitcoin-sign", kicker: "Bitcoin Wallet", title: "Watch-only Bitcoin", description: "Review a sample wallet, receive address, and local wallet activity without exposing keys.", action: "Run Bitcoin flow" }
];

function baseState() {
  return {
    wallets: [
      { id: "cash", name: "Cash", type: "Cash", currency: "AED", balance: 12400, topups: 15200, spent: 2800 },
      { id: "bank", name: "Emirates NBD", type: "Bank", currency: "AED", balance: 28640, topups: 35600, spent: 6960 }
    ],
    expenses: [
      { id: "exp-rent", item: "Office rent", wallet: "bank", amount: 1800, date: "28 Aug 2026", note: "August workspace" },
      { id: "exp-utilities", item: "Utilities", wallet: "bank", amount: 420, date: "27 Aug 2026", note: "Electricity & internet" },
      { id: "exp-transport", item: "Transport", wallet: "cash", amount: 160, date: "26 Aug 2026", note: "Local delivery" }
    ],
    loans: [
      { id: "loan-bilal", direction: "given", name: "Bilal Trading", principal: 5000, remaining: 3200, status: "Partial" },
      { id: "loan-supplier", direction: "taken", name: "Supplier Bridge", principal: 8000, remaining: 5000, status: "Partial" }
    ],
    loanMode: "given",
    assets: [
      { id: "asset-van", name: "Delivery Van", type: "Vehicle", purchase: 78000, value: 72000, status: "Active" },
      { id: "asset-office", name: "Office Equipment", type: "Equipment", purchase: 21500, value: 18000, status: "Active" }
    ],
    installments: [
      { id: "plan-laptop", name: "Laptop Plan", total: 3600, paid: 1200, count: 6, status: "Partial" }
    ],
    inventory: [
      { id: "item-oud", name: "Essential Oud", brand: "Noor", qty: 12, cost: 85, sell: 135, category: "Perfume" },
      { id: "item-notebook", name: "Leather Notebook", brand: "Studio", qty: 24, cost: 18, sell: 35, category: "General" }
    ],
    sales: [],
    customers: [
      { id: "customer-horizon", name: "Horizon Trading", phone: "+971 50 555 0184", company: "Horizon Trading LLC", outstanding: 1350, history: ["INV-A1F40B · AED 2,850.00", "Payment · AED 1,500.00"] }
    ],
    notes: [
      { id: "note-opening", title: "Month-end checklist", body: "Review outstanding invoices and wallet reconciliation.", reminder: true, time: "30 Aug · 09:00" }
    ],
    reportGenerated: false
  };
}

let state = baseState();
let currentIndex = 0;
let toastTimer = null;
const playback = { token: 0, running: false, paused: false };
const completedModules = new Set();

function currentModule() { return MODULES[currentIndex]; }
function walletName(id) { return state.wallets.find(row => row.id === id)?.name || "Wallet"; }
function walletOptions(selected = "") { return state.wallets.map(row => `<option value="${row.id}" ${row.id === selected ? "selected" : ""}>${row.name} · ${money(row.balance)}</option>`).join(""); }
function totalWalletBalance() { return state.wallets.reduce((sum, row) => sum + row.balance, 0); }
function totalExpenses() { return state.expenses.reduce((sum, row) => sum + row.amount, 0); }
function totalAssetValue() { return state.assets.reduce((sum, row) => sum + row.value, 0); }
function totalOutstanding() { return state.loans.reduce((sum, row) => sum + row.remaining, 0) + state.customers.reduce((sum, row) => sum + row.outstanding, 0); }

function prepareChapter(key) {
  state = baseState();
  if (["sales", "customers", "reports"].includes(key)) {
    state.inventory.push({ id: "item-scanner", name: "Wireless Scanner", brand: "Triplem Supply", qty: 12, cost: 120, sell: 190, category: "Electronics" });
  }
  if (["customers", "reports"].includes(key)) {
    state.sales.push({ id: "sale-alpine", item: "Wireless Scanner", customer: "Alpine Retail", qty: 2, total: 380, paid: 200, profit: 140 });
    state.customers.push({ id: "customer-alpine", name: "Alpine Retail", phone: "+971 55 204 8821", company: "Alpine Retail", outstanding: 180, history: ["INV-7D21AA · AED 380.00", "Payment · AED 200.00"] });
  }
}

function renderNavigation() {
  $("#demoModuleTabs").innerHTML = MODULES.map((module, index) => `
    <button class="module-tab ${index === currentIndex ? "active" : ""} ${completedModules.has(module.key) ? "is-complete" : ""}" type="button" data-module-index="${index}" aria-current="${index === currentIndex ? "page" : "false"}">
      <i class="fa-solid ${module.icon}" aria-hidden="true"></i><span>${module.label}</span><span class="module-complete" aria-label="${completedModules.has(module.key) ? "Completed" : "Not completed"}"><i class="fa-solid fa-check" aria-hidden="true"></i></span>
    </button>`).join("");
  $("#moduleSelect").innerHTML = MODULES.map((module, index) => `<option value="${index}" ${index === currentIndex ? "selected" : ""}>${index + 1}. ${module.label}</option>`).join("");
  renderTourProgress();
}

function renderTourProgress() {
  $("#demoCompletedCount").textContent = String(completedModules.size);
  $("#coachChapter").textContent = `Chapter ${currentIndex + 1} of ${MODULES.length}`;
  $("#chapterMap").innerHTML = MODULES.map((module, index) => `<span class="${index === currentIndex ? "is-current" : ""} ${completedModules.has(module.key) ? "is-complete" : ""}" title="${index + 1}. ${module.label}"></span>`).join("");
}

function renderModule() {
  const module = currentModule();
  $("#workspaceKicker").textContent = module.kicker;
  $("#workspaceTitle").textContent = module.title;
  $("#workspaceDescription").textContent = module.description;
  $("#progressTitle").textContent = module.label;
  $("#workspaceActions").innerHTML = `<button type="button" class="btn primary" id="chapterActionBtn"><i class="fa-solid fa-circle-play" aria-hidden="true"></i>${module.action}</button>`;
  const renderer = RENDERERS[module.key];
  $("#workspaceContent").innerHTML = renderer ? renderer() : "";
  renderNavigation();
}

function metric(icon, label, value, note) {
  return `<article class="metric-card"><span class="metric-icon"><i class="fa-solid ${icon}" aria-hidden="true"></i></span><small>${label}</small><strong>${value}</strong><em>${note}</em></article>`;
}

function renderDashboard() {
  return `
    <div class="summary-grid">
      ${metric("fa-wallet", "Wallet balance", money(totalWalletBalance()), "2 active AED wallets")}
      ${metric("fa-receipt", "Recorded expenses", money(totalExpenses()), "Current sample period")}
      ${metric("fa-building", "Asset valuation", money(totalAssetValue()), "2 active assets")}
      ${metric("fa-hand-holding-dollar", "Outstanding", money(totalOutstanding()), "Loans + invoices")}
    </div>
    <div class="dashboard-grid">
      <article class="surface-card">
        <header class="surface-head"><h3>Cash flow</h3><div class="chip-row"><button class="chip active" id="dashboardCurrency">AED</button><button class="chip">SAR</button><button class="chip">USD</button></div></header>
        <div class="chart" aria-label="Sample cash flow chart">
          <span class="bar" style="--h:48%" data-label="Mar"></span><span class="bar" style="--h:72%" data-label="Apr"></span><span class="bar" style="--h:56%" data-label="May"></span><span class="bar" style="--h:84%" data-label="Jun"></span><span class="bar" style="--h:69%" data-label="Jul"></span><span class="bar" style="--h:92%" data-label="Aug"></span>
        </div>
      </article>
      <article class="surface-card"><header class="surface-head"><h3>Latest activity</h3><span class="status open">Live sample</span></header><div class="activity-list">
        <div class="activity-row"><span class="activity-icon"><i class="fa-solid fa-arrow-down"></i></span><span><strong>Invoice payment</strong><small>Horizon Trading · Bank</small></span><span class="positive">+1,500</span></div>
        <div class="activity-row"><span class="activity-icon"><i class="fa-solid fa-cart-shopping"></i></span><span><strong>Office rent</strong><small>Expenses · Emirates NBD</small></span><span class="negative">−1,800</span></div>
        <div class="activity-row"><span class="activity-icon"><i class="fa-solid fa-box"></i></span><span><strong>Stock purchase</strong><small>Inventory · 12 units</small></span><span class="negative">−1,020</span></div>
        <div class="activity-row"><span class="activity-icon"><i class="fa-solid fa-calendar-check"></i></span><span><strong>Installment received</strong><small>Laptop Plan</small></span><span class="positive">+600</span></div>
      </div></article>
    </div>`;
}

function renderWallets() {
  return `<div class="toolbar"><div class="toolbar-copy"><strong>Wallets Overview</strong><span>Top-up, spent, and available balance by account.</span></div><div class="toolbar-actions"><button class="btn ghost" id="newWalletMenuBtn"><i class="fa-solid fa-plus"></i>Add Account</button><button class="btn ghost" id="addMoneyMenuBtn">Add Money</button><button class="btn soft" id="transferMenuBtn"><i class="fa-solid fa-right-left"></i>Transfer</button></div></div>
    <div class="wallet-grid">${state.wallets.map(wallet => `<article class="wallet-card" id="wallet-${wallet.id}"><div class="wallet-top"><div class="wallet-mark"><i class="fa-solid ${wallet.type === "Bank" ? "fa-building-columns" : "fa-wallet"}"></i></div>${wallet.id === "studio" ? '<button class="card-menu" id="editWalletBtn" aria-label="Edit wallet"><i class="fa-solid fa-pen"></i></button>' : `<span class="status open">${wallet.type}</span>`}</div><h3>${wallet.name}</h3><p>${wallet.currency} ${wallet.type} account</p><strong class="wallet-balance">${money(wallet.balance)}</strong><div class="wallet-stats"><span>Top-up ${money(wallet.topups)}</span><span>Spent ${money(wallet.spent)}</span></div></article>`).join("")}</div>`;
}

function renderExpenses() {
  return `<div class="toolbar"><div class="toolbar-copy"><strong>Expense statement</strong><span>Wallet-level transactions grouped by item.</span></div><div class="toolbar-actions"><button class="btn primary" id="addExpenseBtn"><i class="fa-solid fa-plus"></i>Add Expense</button><button class="btn ghost"><i class="fa-solid fa-file-pdf"></i>PDF</button></div></div>
    <div class="chip-row" style="margin-bottom:10px"><button class="chip active">All wallets</button>${state.wallets.map(row => `<button class="chip">${row.name} · ${money(row.balance)}</button>`).join("")}</div>
    <div class="table-wrap"><table><thead><tr><th>Date</th><th>Item</th><th>Wallet</th><th>Note</th><th>Amount</th><th>Actions</th></tr></thead><tbody>${state.expenses.map(row => `<tr id="expense-${row.id}"><td>${row.date}</td><td><strong>${row.item}</strong></td><td>${walletName(row.wallet)}</td><td>${row.note}</td><td class="negative">−${money(row.amount)}</td><td><div class="row-actions">${row.id === "exp-demo" ? '<button class="tiny-btn" id="editExpenseBtn" title="Edit"><i class="fa-solid fa-pen"></i></button><button class="tiny-btn" id="deleteExpenseBtn" title="Delete"><i class="fa-solid fa-trash"></i></button>' : '<button class="tiny-btn" title="Open"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>'}</div></td></tr>`).join("")}</tbody></table></div>`;
}

function loanCard(row) {
  const paid = row.principal - row.remaining;
  const percent = Math.min(100, Math.round((paid / row.principal) * 100));
  const actionId = row.id === "loan-demo-given" ? "givenPaymentBtn" : row.id === "loan-demo-taken" ? "takenPaymentBtn" : "";
  return `<article class="loan-card" id="${row.id}"><div class="card-top"><span class="status ${row.remaining === 0 ? "closed" : ""}">${row.remaining === 0 ? "Closed" : row.status}</span>${actionId && row.remaining > 0 ? `<button class="card-menu" id="${actionId}" aria-label="Record payment"><i class="fa-solid fa-plus"></i></button>` : ""}</div><h3>${row.name}</h3><p>${row.direction === "given" ? "Loan Given / Received Back" : "Loan Taken / Returned Back"}</p><div class="card-stats"><span>Principal ${money(row.principal)}</span><strong>Remaining ${money(row.remaining)}</strong></div><div class="progress-mini"><span style="--p:${percent}%"></span></div></article>`;
}

function renderLoans() {
  const rows = state.loans.filter(row => row.direction === state.loanMode);
  return `<div class="mode-switch" role="tablist"><button class="${state.loanMode === "given" ? "active" : ""}" id="givenModeBtn">Loan Given / Received Back</button><button class="${state.loanMode === "taken" ? "active" : ""}" id="takenModeBtn">Loan Taken / Returned Back</button></div>
    <div class="toolbar"><div class="toolbar-copy"><strong>${state.loanMode === "given" ? "Loans Given" : "Loans Taken"}</strong><span>Open, partial, and closed balances.</span></div><button class="btn primary" id="newLoanBtn"><i class="fa-solid fa-plus"></i>New Entry</button></div><div class="loan-grid">${rows.map(loanCard).join("")}</div>`;
}

function renderAssets() {
  return `<div class="mode-switch"><button class="active">Assets</button><button>Depreciation Assets</button></div><div class="toolbar"><div class="toolbar-copy"><strong>Asset portfolio</strong><span>Purchase, valuation, revenue, and status.</span></div><div class="toolbar-actions"><button class="btn primary" id="addAssetBtn"><i class="fa-solid fa-plus"></i>Add Asset</button><button class="btn ghost"><i class="fa-solid fa-file-pdf"></i>Reports</button></div></div><div class="asset-grid">${state.assets.map(row => `<article class="asset-card" id="${row.id}"><div class="card-top"><div class="item-mark"><i class="fa-solid fa-building"></i></div>${row.id === "asset-camera" ? '<button class="card-menu" id="editAssetBtn"><i class="fa-solid fa-pen"></i></button>' : '<span class="status open">Active</span>'}</div><h3>${row.name}</h3><p>${row.type} · Purchase ${money(row.purchase)}</p><strong class="wallet-balance">${money(row.value)}</strong><div class="card-stats"><span>Current valuation</span>${row.id === "asset-camera" ? '<button class="tiny-btn" id="deleteAssetBtn"><i class="fa-solid fa-trash"></i></button>' : '<span class="positive">Tracked</span>'}</div></article>`).join("")}</div>`;
}

function renderInstallments() {
  return `<div class="toolbar"><div class="toolbar-copy"><strong>Installment Plans</strong><span>Paid, pending, and completed schedules.</span></div><button class="btn primary" id="addInstallmentBtn"><i class="fa-solid fa-plus"></i>Installment Plan</button></div><div class="installment-grid">${state.installments.map(row => { const remaining = Math.max(0, row.total - row.paid); const pct = Math.round((row.paid / row.total) * 100); return `<article class="installment-card" id="${row.id}"><div class="card-top"><span class="status ${remaining === 0 ? "paid" : ""}">${remaining === 0 ? "Completed" : row.status}</span>${row.id === "plan-equipment" && remaining > 0 ? '<button class="card-menu" id="installmentPaymentBtn"><i class="fa-solid fa-plus"></i></button>' : ""}</div><h3>${row.name}</h3><p>${row.count} installments · Total ${money(row.total)}</p><div class="card-stats"><span>Paid ${money(row.paid)}</span><strong>Remaining ${money(remaining)}</strong></div><div class="progress-mini"><span style="--p:${pct}%"></span></div></article>`; }).join("")}</div>`;
}

function renderInventory() {
  return `<div class="toolbar"><div class="toolbar-copy"><strong>Category → Brand → Type → Variant</strong><span>Add to cart, save proforma, then finalize.</span></div><div class="toolbar-actions"><button class="btn primary" id="addInventoryBtn"><i class="fa-solid fa-plus"></i>Add item</button><button class="btn ghost"><i class="fa-solid fa-camera"></i>Scanner</button></div></div><div class="search-filter"><input class="input" placeholder="Item, brand, variant…"><select class="select"><option>All brands</option></select><select class="select"><option>In Stock</option></select></div><div class="inventory-grid">${state.inventory.map(row => `<article class="inventory-card" id="${row.id}"><div class="card-top"><div class="item-mark"><i class="fa-solid fa-box"></i></div>${row.id === "item-scanner" ? '<button class="card-menu" id="editInventoryBtn"><i class="fa-solid fa-pen"></i></button>' : '<span class="status open">In stock</span>'}</div><h3>${row.name}</h3><p>${row.brand} · ${row.category}</p><strong class="stock-value">${row.qty} units</strong><span class="stock-pill">Sell ${money(row.sell)} · Cost ${money(row.cost)}</span>${row.id === "item-scanner" ? '<div class="card-stats"><span>SKU TM-SCN-01</span><button class="tiny-btn" id="restockInventoryBtn"><i class="fa-solid fa-boxes-stacked"></i></button></div>' : ""}</article>`).join("")}</div>`;
}

function renderSales() {
  const scanner = state.inventory.find(row => row.id === "item-scanner");
  return `<div class="toolbar"><div class="toolbar-copy"><strong>Cart / proforma</strong><span>Stock reduces only when a sale is finalized.</span></div><button class="btn primary" id="createSaleBtn"><i class="fa-solid fa-cart-plus"></i>Create sale</button></div>
    <div class="summary-grid" style="margin-bottom:10px">${metric("fa-box", "Wireless Scanner stock", `${scanner?.qty || 0} units`, "Live demo quantity")}${metric("fa-file-invoice", "Sales invoices", String(state.sales.length), "Finalized")}${metric("fa-chart-line", "Estimated profit", money(state.sales.reduce((s,r)=>s+r.profit,0)), "Sales − cost")}${metric("fa-money-bill", "Collected", money(state.sales.reduce((s,r)=>s+r.paid,0)), "Wallet-linked payments")}</div>
    <div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Item</th><th>Qty</th><th>Total</th><th>Paid</th><th>Balance</th></tr></thead><tbody>${state.sales.length ? state.sales.map((row,index) => `<tr><td>INV-${String(index+1).padStart(4,"0")}</td><td>${row.customer}</td><td>${row.item}</td><td>${row.qty}</td><td>${money(row.total)}</td><td class="positive">${money(row.paid)}</td><td class="negative">${money(row.total-row.paid)}</td></tr>`).join("") : '<tr><td colspan="7" style="text-align:center;color:var(--muted)">No finalized sale in this chapter yet.</td></tr>'}</tbody></table></div>`;
}

function renderCustomers() {
  return `<div class="toolbar"><div class="toolbar-copy"><strong>Customers / Invoices</strong><span>Track outstanding invoices, settlements, and customer history.</span></div><button class="btn primary" id="addCustomerBtn"><i class="fa-solid fa-user-plus"></i>Add Customer</button></div><div class="customer-grid">${state.customers.map(row => `<article class="customer-card" id="${row.id}"><div class="card-top"><div class="customer-mark">${row.name.slice(0,2).toUpperCase()}</div><span class="status ${row.outstanding === 0 ? "paid" : ""}">${row.outstanding === 0 ? "Paid" : "Outstanding"}</span></div><h3>${row.name}</h3><p>${row.company || "Individual"}<br>${row.phone || "No phone"}</p><strong class="wallet-balance">${money(row.outstanding)}</strong><div class="card-stats"><span>${row.history.length} history entries</span>${row.id === "customer-alpine" ? '<button class="btn soft" id="openCustomerBtn">Open</button>' : '<button class="tiny-btn"><i class="fa-solid fa-arrow-right"></i></button>'}</div></article>`).join("")}</div>`;
}

function renderReports() {
  return `<div class="report-layout"><article class="report-card"><h3>Generate report</h3><div class="report-options"><label class="field"><span>Report area</span><select class="select" id="reportSection"><option value="expenses">Expenses</option><option value="inventory">Inventory</option><option value="all">All Sections</option></select></label><label class="field"><span>Report style</span><select class="select" id="reportStyle"><option value="summary">Summary</option><option value="detailed">Detailed</option></select></label><label class="field"><span>Currency</span><select class="select"><option>AED</option><option>All currencies</option></select></label><button class="btn primary" id="generateReportBtn"><i class="fa-solid fa-wand-magic-sparkles"></i>Generate report</button>${state.reportGenerated ? '<button class="btn soft" id="downloadReportBtn"><i class="fa-solid fa-file-arrow-down"></i>Download PDF</button>' : ""}</div></article><article class="report-preview" id="reportPreview">${state.reportGenerated ? reportPreviewHtml() : '<div style="height:310px;display:grid;place-items:center;text-align:center;color:var(--muted)"><div><i class="fa-regular fa-file-pdf" style="font-size:2rem;color:var(--primary)"></i><p style="font-size:.72rem">Choose options and generate a report preview.</p></div></div>'}</article></div>`;
}

function reportPreviewHtml() {
  return `<div class="report-preview-head"><strong>TRIPLEM VIP · Detailed Report</strong><span>Generated 29 Aug 2026</span></div><div class="report-summary"><div><small>Wallet balance</small><strong>${money(totalWalletBalance())}</strong></div><div><small>Expenses</small><strong>${money(totalExpenses())}</strong></div><div><small>Outstanding</small><strong>${money(totalOutstanding())}</strong></div></div><div class="table-wrap"><table><thead><tr><th>Section</th><th>Records</th><th>Value</th><th>Status</th></tr></thead><tbody><tr><td>Expenses</td><td>${state.expenses.length}</td><td>${money(totalExpenses())}</td><td>Ready</td></tr><tr><td>Inventory</td><td>${state.inventory.length}</td><td>${money(state.inventory.reduce((s,r)=>s+(r.qty*r.cost),0))}</td><td>Ready</td></tr><tr><td>Assets</td><td>${state.assets.length}</td><td>${money(totalAssetValue())}</td><td>Ready</td></tr><tr><td>Loans</td><td>${state.loans.length}</td><td>${money(state.loans.reduce((s,r)=>s+r.remaining,0))}</td><td>Ready</td></tr></tbody></table></div>`;
}

function renderNotes() {
  return `<div class="toolbar"><div class="toolbar-copy"><strong>Notes workspace</strong><span>Ideas, decisions, and reminders beside the finance records.</span></div><button class="btn primary" id="newNoteBtn"><i class="fa-solid fa-plus"></i>New Note</button></div><div class="note-grid">${state.notes.map(row => `<article class="note-card" id="${row.id}"><div class="card-top"><div class="item-mark"><i class="fa-solid fa-note-sticky"></i></div>${row.reminder ? '<span class="status open">Reminder</span>' : ""}</div><h3>${row.title}</h3><p>${row.body}</p>${row.reminder ? `<span class="note-reminder"><i class="fa-solid fa-bell"></i>${row.time}</span>` : ""}<time>Updated just now</time></article>`).join("")}</div>`;
}

function renderBitcoin() {
  return `<div class="btc-layout"><article class="btc-card"><div class="card-top"><div class="item-mark"><i class="fa-brands fa-bitcoin"></i></div><span class="status open">Watch-only sample</span></div><h3>Operations BTC</h3><p>Native SegWit · Mainnet</p><div class="btc-balance"><strong>0.042816 BTC</strong><span>Sample value · USD 4,612.18</span></div><div class="address-box">bc1qtriplemdemo7safewatchonly9q4v8x2</div><div class="toolbar-actions" style="margin-top:10px"><button class="btn primary" id="receiveBitcoinBtn"><i class="fa-solid fa-qrcode"></i>Receive</button><button class="btn ghost" id="copyBitcoinBtn"><i class="fa-solid fa-copy"></i>Copy address</button></div></article><article class="surface-card"><header class="surface-head"><h3>Wallet activity</h3><span class="status open">Blockchain sample</span></header><div class="activity-list"><div class="activity-row"><span class="activity-icon"><i class="fa-solid fa-arrow-down"></i></span><span><strong>Received</strong><small>28 Aug · 8 confirmations</small></span><span class="positive">+0.0125</span></div><div class="activity-row"><span class="activity-icon"><i class="fa-solid fa-arrow-up"></i></span><span><strong>Sent</strong><small>24 Aug · Confirmed</small></span><span class="negative">−0.0042</span></div><div class="activity-row"><span class="activity-icon"><i class="fa-solid fa-arrow-down"></i></span><span><strong>Received</strong><small>17 Aug · Confirmed</small></span><span class="positive">+0.0345</span></div></div></article></div>`;
}

const RENDERERS = { dashboard: renderDashboard, wallets: renderWallets, expenses: renderExpenses, loans: renderLoans, assets: renderAssets, installments: renderInstallments, inventory: renderInventory, sales: renderSales, customers: renderCustomers, reports: renderReports, notes: renderNotes, bitcoin: renderBitcoin };

function field(id, label, type = "text", value = "", extra = "") {
  return `<label class="field"><span>${label}</span><input class="input" id="${id}" type="${type}" value="${value}" ${extra}></label>`;
}
function selectField(id, label, options) { return `<label class="field"><span>${label}</span><select class="select" id="${id}">${options}</select></label>`; }

function openForm({ kicker = "New entry", title, body, primary = "Save" }) {
  $("#demoModalKicker").textContent = kicker;
  $("#demoModalTitle").textContent = title;
  $("#demoModalBody").innerHTML = `<div class="field-grid">${body}</div>`;
  $("#demoModalActions").innerHTML = `<button class="btn ghost" type="button" data-demo-close>Cancel</button><button class="btn primary" type="button" id="modalSaveBtn">${primary}</button>`;
  $("#demoModal").classList.remove("hide");
  $("#demoModal").setAttribute("aria-hidden", "false");
}

function openInfoModal({ kicker = "Details", title, body, primary = "Close", primaryId = "modalCloseBtn" }) {
  $("#demoModalKicker").textContent = kicker;
  $("#demoModalTitle").textContent = title;
  $("#demoModalBody").innerHTML = body;
  $("#demoModalActions").innerHTML = `<button class="btn primary" type="button" id="${primaryId}">${primary}</button>`;
  $("#demoModal").classList.remove("hide");
  $("#demoModal").setAttribute("aria-hidden", "false");
}

function closeModal() { $("#demoModal").classList.add("hide"); $("#demoModal").setAttribute("aria-hidden", "true"); }
function showToast(message) { clearTimeout(toastTimer); $("#demoToast span").textContent = message; $("#demoToast").classList.add("show"); toastTimer = setTimeout(() => $("#demoToast").classList.remove("show"), 2200); }

function setCue(title, text, percent, stateName = "Running") {
  $("#coachTitle").textContent = title;
  $("#coachText").textContent = text;
  setProgress(percent);
  const host = $("#coachState");
  host.classList.toggle("is-running", stateName === "Running");
  host.classList.toggle("is-paused", stateName === "Paused");
  $("#coachState span:last-child").textContent = stateName;
}

function setProgress(value) {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  $("#progressBar").style.width = `${safe}%`;
  $("#progressValue").textContent = `${Math.round(safe)}%`;
  $(".progress-track").setAttribute("aria-valuenow", String(Math.round(safe)));
}

class Cancelled extends Error {}
function assertToken(token) { if (token !== playback.token) throw new Cancelled(); }
function rawWait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function wait(ms, token) {
  let remaining = Math.max(12, ms * timingScale);
  while (remaining > 0) {
    assertToken(token);
    if (playback.paused) { await rawWait(70); continue; }
    const slice = Math.min(remaining, 45);
    await rawWait(slice);
    remaining -= slice;
  }
}

async function moveCursor(selector, token) {
  assertToken(token);
  const el = $(selector);
  if (!el) return null;
  el.scrollIntoView({ block: "center", inline: "center", behavior: reducedMotion ? "auto" : "smooth" });
  await wait(170, token);
  const rect = el.getBoundingClientRect();
  const x = Math.max(8, Math.min(window.innerWidth - 28, rect.left + Math.min(rect.width * .65, rect.width - 5)));
  const y = Math.max(8, Math.min(window.innerHeight - 32, rect.top + Math.min(rect.height * .55, rect.height - 4)));
  const cursor = $("#demoCursor");
  cursor.classList.add("visible");
  cursor.style.transform = `translate3d(${x}px,${y}px,0)`;
  await wait(650, token);
  return el;
}

async function demoClick(selector, token) {
  const el = await moveCursor(selector, token);
  if (!el) return null;
  el.classList.add("demo-target");
  $("#demoCursor").classList.add("clicking");
  await wait(240, token);
  $("#demoCursor").classList.remove("clicking");
  el.classList.remove("demo-target");
  return el;
}

async function demoType(selector, value, token) {
  const el = await moveCursor(selector, token);
  if (!el) return;
  el.focus(); el.value = ""; el.classList.add("demo-target");
  for (const char of String(value)) { assertToken(token); el.value += char; el.dispatchEvent(new Event("input", { bubbles: true })); await wait(44 + Math.random() * 34, token); }
  el.classList.remove("demo-target");
}

async function demoSelect(selector, value, token) {
  const el = await demoClick(selector, token);
  if (!el) return;
  el.value = value; el.dispatchEvent(new Event("change", { bubbles: true }));
  await wait(260, token);
}

async function cue(title, text, percent, token, pause = 420) { setCue(title, text, percent); await wait(pause, token); }

async function runDashboard(token) {
  await cue("One glance across the books", "Triplem VIP combines live financial summaries without leaving the dashboard.", 8, token);
  await demoClick("#dashboardCurrency", token);
  await cue("Currency-focused summaries", "The selected currency drives charts and section totals while each module keeps its own records.", 36, token);
  await demoClick(".metric-card:nth-child(1)", token);
  await cue("Balances remain connected", "Wallet activity, expenses, settlements, and sales feed the overview as transactions change.", 68, token);
  await demoClick(".activity-row:nth-child(2)", token);
  await cue("Ready to explore", "Use Next or choose any chapter to watch a complete workflow.", 96, token);
}

async function runWallets(token) {
  await cue("Create a wallet", "The Expenses module treats accounts as wallets with their own balance and currency.", 4, token);
  await demoClick("#newWalletMenuBtn", token);
  openForm({ title: "Add Expense Account", body: `${field("walletName", "Account name")}${selectField("walletType", "Account type", '<option value="Bank">Bank</option><option value="Cash">Cash</option>')}${selectField("walletCurrency", "Currency", '<option>AED</option><option>SAR</option><option>USD</option>')}${field("walletOpening", "Opening balance", "number")}` });
  await demoType("#walletName", "Petty Cash", token); await demoSelect("#walletType", "Cash", token); await demoType("#walletOpening", "2500", token); await demoClick("#modalSaveBtn", token);
  closeModal(); state.wallets.push({ id: "studio", name: "Petty Cash", type: "Cash", currency: "AED", balance: 2500, topups: 2500, spent: 0 }); renderModule(); showToast("Wallet created successfully");
  await cue("Add money", "Top-ups increase the selected wallet and immediately refresh its available balance.", 28, token);
  await demoClick("#addMoneyMenuBtn", token); openForm({ title: "Add Money", body: `${selectField("topupWallet", "Wallet", walletOptions("studio"))}${field("topupAmount", "Amount", "number")}${field("topupDate", "Date", "date", "2026-08-29")}` }); await demoSelect("#topupWallet", "studio", token); await demoType("#topupAmount", "600", token); await demoClick("#modalSaveBtn", token);
  closeModal(); { const w = state.wallets.find(r => r.id === "studio"); w.balance += 600; w.topups += 600; } renderModule(); showToast("Money added to Petty Cash");
  await cue("Edit wallet information", "The account record can be refined without changing its transaction history.", 50, token); await demoClick("#editWalletBtn", token); openForm({ kicker: "Edit", title: "Wallet information", body: `${field("editWalletName", "Account name", "text", "Petty Cash")}${selectField("editWalletType", "Account type", '<option selected>Cash</option><option>Bank</option>')}`, primary: "Save changes" }); await demoType("#editWalletName", "Studio Cash", token); await demoClick("#modalSaveBtn", token);
  closeModal(); state.wallets.find(r => r.id === "studio").name = "Studio Cash"; renderModule(); showToast("Wallet information updated");
  await cue("Transfer between wallets", "The source balance reduces while the destination balance increases by the same amount.", 69, token); await demoClick("#transferMenuBtn", token); openForm({ title: "Transfer Money", body: `${selectField("transferFrom", "From wallet", walletOptions("studio"))}${selectField("transferTo", "To wallet", walletOptions("bank"))}${field("transferAmount", "Amount", "number")}${field("transferNote", "Note")}`, primary: "Transfer" }); await demoSelect("#transferFrom", "studio", token); await demoSelect("#transferTo", "bank", token); await demoType("#transferAmount", "400", token); await demoType("#transferNote", "Till settlement", token); await demoClick("#modalSaveBtn", token);
  closeModal(); state.wallets.find(r=>r.id==="studio").balance -= 400; state.wallets.find(r=>r.id==="bank").balance += 400; renderModule(); showToast("AED 400.00 transferred successfully"); await cue("Balances updated", "Studio Cash reduced to AED 2,700 and Emirates NBD received AED 400.", 98, token);
}

async function runExpenses(token) {
  await cue("Record an expense", "Choose the wallet that paid, then enter the item and amount.", 4, token); await demoClick("#addExpenseBtn", token); openForm({ title: "Add Expense", body: `${selectField("expenseWallet", "Wallet", walletOptions("cash"))}${field("expenseItem", "Item name")}${field("expenseAmount", "Amount", "number")}${field("expenseNote", "Note")}${field("expenseDate", "Date", "date", "2026-08-29")}` }); await demoSelect("#expenseWallet", "cash", token); await demoType("#expenseItem", "Office supplies", token); await demoType("#expenseAmount", "185", token); await demoType("#expenseNote", "Printer paper and labels", token); await demoClick("#modalSaveBtn", token);
  closeModal(); state.expenses.unshift({ id: "exp-demo", item: "Office supplies", wallet: "cash", amount: 185, date: "29 Aug 2026", note: "Printer paper and labels" }); state.wallets.find(r=>r.id==="cash").balance -= 185; renderModule(); showToast("Expense saved · Cash balance updated");
  await cue("Edit the transaction", "Corrections preserve the same expense record while recalculating the wallet balance.", 40, token); await demoClick("#editExpenseBtn", token); openForm({ kicker: "Edit", title: "Office supplies", body: `${field("editExpenseItem", "Item name", "text", "Office supplies")}${field("editExpenseAmount", "Amount", "number", "185")}${field("editExpenseNote", "Note", "text", "Printer paper and labels")}`, primary: "Save changes" }); await demoType("#editExpenseAmount", "210", token); await demoClick("#modalSaveBtn", token);
  closeModal(); state.expenses.find(r=>r.id==="exp-demo").amount = 210; state.wallets.find(r=>r.id==="cash").balance -= 25; renderModule(); showToast("Expense updated to AED 210.00");
  await cue("Delete safely", "Removing the sample expense restores its wallet effect and refreshes totals.", 70, token); await demoClick("#deleteExpenseBtn", token); openInfoModal({ kicker: "Confirm deletion", title: "Delete Office supplies?", body: '<p style="margin:0;color:var(--muted);font-size:.76rem;line-height:1.6">The demo transaction will be removed and the Cash balance will be restored.</p>', primary: "Delete expense", primaryId: "confirmDeleteExpenseBtn" }); await demoClick("#confirmDeleteExpenseBtn", token);
  closeModal(); state.expenses = state.expenses.filter(r=>r.id!=="exp-demo"); state.wallets.find(r=>r.id==="cash").balance += 210; renderModule(); showToast("Expense deleted · Totals restored"); await cue("Statement is current", "The list, wallet balance, and dashboard calculation now match again.", 98, token);
}

async function runLoans(token) {
  await cue("Create a Given Loan", "Money leaves the selected wallet and becomes an amount to receive back.", 3, token); await demoClick("#newLoanBtn", token); openForm({ title: "Loan Given", body: `${field("loanPerson", "Person / business")}${field("loanAmount", "Principal amount", "number")}${selectField("loanWallet", "Wallet", walletOptions("bank"))}${field("loanDate", "Loan date", "date", "2026-08-29")}` }); await demoType("#loanPerson", "Ahmed Studio", token); await demoType("#loanAmount", "3000", token); await demoClick("#modalSaveBtn", token); closeModal(); state.loans.unshift({ id:"loan-demo-given",direction:"given",name:"Ahmed Studio",principal:3000,remaining:3000,status:"Open" }); state.wallets.find(r=>r.id==="bank").balance-=3000; renderModule(); showToast("Given Loan created");
  await cue("Receive a partial amount", "Partial receipts reduce the outstanding balance without closing the loan.", 19, token); await demoClick("#givenPaymentBtn", token); openForm({ title:"Received Back", body:`${field("givenReceipt", "Amount received", "number")}${selectField("givenReceiptWallet", "Add to wallet", walletOptions("bank"))}`, primary:"Save receipt" }); await demoType("#givenReceipt", "1200", token); await demoClick("#modalSaveBtn", token); closeModal(); state.loans.find(r=>r.id==="loan-demo-given").remaining=1800; state.loans.find(r=>r.id==="loan-demo-given").status="Partial"; state.wallets.find(r=>r.id==="bank").balance+=1200; renderModule(); showToast("Partial receipt saved · AED 1,800 remaining");
  await cue("Switch to Taken Loans", "The same ledger separates money received from money you owe back.", 34, token); await demoClick("#takenModeBtn", token); state.loanMode="taken"; renderModule(); await demoClick("#newLoanBtn", token); openForm({ title:"Loan Taken", body:`${field("takenPerson","Lumen Supplier")}${field("takenAmount","Principal amount","number")}${selectField("takenWallet","Receive into wallet",walletOptions("bank"))}` }); await demoType("#takenPerson","Lumen Supplier",token); await demoType("#takenAmount","5000",token); await demoClick("#modalSaveBtn",token); closeModal(); state.loans.unshift({id:"loan-demo-taken",direction:"taken",name:"Lumen Supplier",principal:5000,remaining:5000,status:"Open"}); state.wallets.find(r=>r.id==="bank").balance+=5000; renderModule(); showToast("Taken Loan created");
  await cue("Return part of a Taken Loan", "A partial repayment updates both the wallet and the loan status.", 51, token); await demoClick("#takenPaymentBtn", token); openForm({ title:"Returned Back", body:`${field("takenPayment","Amount returned","number")}${selectField("takenPaymentWallet","Pay from wallet",walletOptions("bank"))}`, primary:"Save payment" }); await demoType("#takenPayment","2000",token); await demoClick("#modalSaveBtn",token); closeModal(); state.loans.find(r=>r.id==="loan-demo-taken").remaining=3000; state.loans.find(r=>r.id==="loan-demo-taken").status="Partial"; state.wallets.find(r=>r.id==="bank").balance-=2000; renderModule(); showToast("Partial repayment saved");
  await cue("Complete the Taken Loan", "The final repayment changes the status to Closed.", 67, token); await demoClick("#takenPaymentBtn",token); openForm({title:"Returned Back",body:`${field("takenPaymentFinal","Final amount","number")}`,primary:"Complete repayment"}); await demoType("#takenPaymentFinal","3000",token); await demoClick("#modalSaveBtn",token); closeModal(); state.loans.find(r=>r.id==="loan-demo-taken").remaining=0; state.loans.find(r=>r.id==="loan-demo-taken").status="Closed"; state.wallets.find(r=>r.id==="bank").balance-=3000; renderModule(); showToast("Taken Loan fully repaid · Closed");
  await cue("Complete the Given Loan", "The final receipt closes the amount due from Ahmed Studio.", 82, token); await demoClick("#givenModeBtn",token); state.loanMode="given"; renderModule(); await demoClick("#givenPaymentBtn",token); openForm({title:"Received Back",body:`${field("givenFinal","Final amount received","number")}`,primary:"Complete receipt"}); await demoType("#givenFinal","1800",token); await demoClick("#modalSaveBtn",token); closeModal(); state.loans.find(r=>r.id==="loan-demo-given").remaining=0; state.loans.find(r=>r.id==="loan-demo-given").status="Closed"; state.wallets.find(r=>r.id==="bank").balance+=1800; renderModule(); showToast("Given Loan fully received · Closed"); await cue("Both directions reconciled", "Partial and complete settlements now show the correct status and remaining balance.", 98, token);
}

async function runAssets(token) {
  await cue("Create an asset", "Asset Management tracks purchase information and ongoing valuation separately from expenses.", 5, token); await demoClick("#addAssetBtn",token); openForm({title:"Add Asset",body:`${field("assetName","Asset name")}${selectField("assetType","Type",'<option>Equipment</option><option>Vehicle</option><option>Property</option>')}${field("assetPurchase","Purchase price","number")}${field("assetValue","Current valuation","number")}`}); await demoType("#assetName","Camera Kit",token); await demoType("#assetPurchase","9500",token); await demoType("#assetValue","9500",token); await demoClick("#modalSaveBtn",token); closeModal(); state.assets.push({id:"asset-camera",name:"Camera Kit",type:"Equipment",purchase:9500,value:9500,status:"Active"}); renderModule(); showToast("Asset added · Portfolio value updated");
  await cue("Update valuation", "Editing the current valuation changes portfolio totals without rewriting the purchase price.", 43, token); await demoClick("#editAssetBtn",token); openForm({kicker:"Edit",title:"Camera Kit",body:`${field("assetEditName","Asset name","text","Camera Kit")}${field("assetEditValue","Current valuation","number","9500")}`,primary:"Save changes"}); await demoType("#assetEditValue","10200",token); await demoClick("#modalSaveBtn",token); closeModal(); state.assets.find(r=>r.id==="asset-camera").value=10200; renderModule(); showToast("Valuation increased to AED 10,200.00");
  await cue("Delete the demo asset", "Supported asset records can be removed after a clear confirmation step.", 72, token); await demoClick("#deleteAssetBtn",token); openInfoModal({kicker:"Confirm deletion",title:"Delete Camera Kit?",body:'<p style="margin:0;color:var(--muted);font-size:.76rem">The demo portfolio value will return to its previous total.</p>',primary:"Delete asset",primaryId:"confirmDeleteAssetBtn"}); await demoClick("#confirmDeleteAssetBtn",token); closeModal(); state.assets=state.assets.filter(r=>r.id!=="asset-camera"); renderModule(); showToast("Asset deleted · Portfolio recalculated"); await cue("Portfolio reconciled", "The dashboard asset valuation now reflects only the remaining active assets.", 98, token);
}

async function runInstallments(token) {
  await cue("Create a plan", "Define the financed total and the planned number of installments.", 5, token); await demoClick("#addInstallmentBtn",token); openForm({title:"Installment Plan",body:`${field("planName","Plan / person")}${field("planTotal","Total amount","number")}${field("planCount","Number of installments","number")}${field("planStart","Start date","date","2026-08-29")}`}); await demoType("#planName","Equipment Plan",token); await demoType("#planTotal","4800",token); await demoType("#planCount","4",token); await demoClick("#modalSaveBtn",token); closeModal(); state.installments.push({id:"plan-equipment",name:"Equipment Plan",total:4800,paid:0,count:4,status:"Open"}); renderModule(); showToast("Installment plan created");
  await cue("Record the first payment", "Payments fill the schedule and reduce the remaining amount.", 39, token); await demoClick("#installmentPaymentBtn",token); openForm({title:"Payment / Installment Received",body:`${field("planPayment","Amount","number")}${selectField("planWallet","Add to wallet",walletOptions("bank"))}`,primary:"Record payment"}); await demoType("#planPayment","1200",token); await demoClick("#modalSaveBtn",token); closeModal(); state.installments.find(r=>r.id==="plan-equipment").paid=1200; state.installments.find(r=>r.id==="plan-equipment").status="Partial"; renderModule(); showToast("AED 1,200.00 recorded · AED 3,600 remaining");
  await cue("Complete the schedule", "A final payment moves the plan from Partial to Completed.", 69, token); await demoClick("#installmentPaymentBtn",token); openForm({title:"Payment / Installment Received",body:`${field("planFinalPayment","Remaining amount","number")}`,primary:"Complete plan"}); await demoType("#planFinalPayment","3600",token); await demoClick("#modalSaveBtn",token); closeModal(); state.installments.find(r=>r.id==="plan-equipment").paid=4800; state.installments.find(r=>r.id==="plan-equipment").status="Completed"; renderModule(); showToast("Plan paid in full · Completed"); await cue("Schedule complete", "Paid and remaining values now reconcile to the original AED 4,800 total.", 98, token);
}

async function runInventory(token) {
  await cue("Add a stock item", "Triplem VIP records category, brand, quantity, cost, and selling price together.", 4, token); await demoClick("#addInventoryBtn",token); openForm({title:"Add item",body:`${field("inventoryName","Item name")}${field("inventoryBrand","Brand")}${selectField("inventoryCategory","Category",'<option>Electronics</option><option>General</option><option>Perfume</option>')}${field("inventoryQty","Stock quantity","number")}${field("inventoryCost","Unit cost","number")}${field("inventorySell","Selling price","number")}`}); await demoType("#inventoryName","Wireless Scanner",token); await demoType("#inventoryBrand","Triplem Supply",token); await demoType("#inventoryQty","10",token); await demoType("#inventoryCost","120",token); await demoType("#inventorySell","180",token); await demoClick("#modalSaveBtn",token); closeModal(); state.inventory.push({id:"item-scanner",name:"Wireless Scanner",brand:"Triplem Supply",qty:10,cost:120,sell:180,category:"Electronics"}); renderModule(); showToast("Inventory item saved · 10 units in stock");
  await cue("Edit item pricing", "Product information can change without losing its stock history.", 52, token); await demoClick("#editInventoryBtn",token); openForm({kicker:"Edit item",title:"Wireless Scanner",body:`${field("inventoryEditName","Item name","text","Wireless Scanner")}${field("inventoryEditSell","Selling price","number","180")}`,primary:"Save changes"}); await demoType("#inventoryEditSell","190",token); await demoClick("#modalSaveBtn",token); closeModal(); state.inventory.find(r=>r.id==="item-scanner").sell=190; renderModule(); showToast("Selling price updated to AED 190.00");
  await cue("Restock", "Additional stock increases the available quantity while preserving the same SKU.", 76, token); await demoClick("#restockInventoryBtn",token); openForm({title:"Additional stock",body:`${field("restockQty","Quantity","number")}${field("restockCost","Unit cost","number","120")}`,primary:"Add stock"}); await demoType("#restockQty","2",token); await demoClick("#modalSaveBtn",token); closeModal(); state.inventory.find(r=>r.id==="item-scanner").qty=12; renderModule(); showToast("Stock updated · 12 units available"); await cue("Stock is current", "The item now shows its new price and quantity across Inventory and Sales.", 98, token);
}

async function runSales(token) {
  await cue("Start a sale", "The cart uses live inventory quantities and keeps stock unchanged until Finalize.", 4, token); await demoClick("#createSaleBtn",token); openForm({title:"Sales Cart",body:`${selectField("saleItem","Inventory item",state.inventory.map(r=>`<option value="${r.id}">${r.name} · ${r.qty} in stock</option>`).join(""))}${field("saleQty","Quantity","number")}${field("saleCustomer","Customer name")}${field("salePaid","Paid amount","number")}${selectField("saleWallet","Payment wallet",walletOptions("bank"))}`,primary:"Finalize"}); await demoSelect("#saleItem","item-scanner",token); await demoType("#saleQty","2",token); await demoType("#saleCustomer","Alpine Retail",token); await demoType("#salePaid","200",token); await cue("Review the invoice", "Two scanners total AED 380. AED 200 is collected now and AED 180 remains outstanding.", 52, token); await demoClick("#modalSaveBtn",token); closeModal(); state.inventory.find(r=>r.id==="item-scanner").qty-=2; state.sales.push({id:"sale-demo",item:"Wireless Scanner",customer:"Alpine Retail",qty:2,total:380,paid:200,profit:140}); state.wallets.find(r=>r.id==="bank").balance+=200; renderModule(); showToast("Sale finalized · Invoice INV-0001 created"); await cue("Stock and profit updated", "Stock reduced from 12 to 10 units, AED 200 reached the wallet, and estimated profit is AED 140.", 96, token);
}

async function runCustomers(token) {
  await cue("Create a customer record", "A customer can be saved before a sale so contact details are ready for future invoices.", 4, token); await demoClick("#addCustomerBtn",token); openForm({title:"Add Customer",body:`${field("customerName","Customer name")}${field("customerCompany","Company")}${field("customerPhone","Mobile")}${field("customerEmail","Email","email")}`}); await demoType("#customerName","Noor Studio",token); await demoType("#customerCompany","Noor Studio LLC",token); await demoType("#customerPhone","+971 50 882 1402",token); await demoClick("#modalSaveBtn",token); closeModal(); state.customers.push({id:"customer-noor",name:"Noor Studio",company:"Noor Studio LLC",phone:"+971 50 882 1402",outstanding:0,history:[]}); renderModule(); showToast("Customer record created");
  await cue("Open customer history", "Customer details combine invoices, receipts, and the current amount outstanding.", 38, token); await demoClick("#openCustomerBtn",token); openInfoModal({title:"Alpine Retail",body:`<div class="summary-grid" style="grid-template-columns:repeat(2,1fr)">${metric("fa-file-invoice","Outstanding",money(180),"Invoice INV-7D21AA")}${metric("fa-clock-rotate-left","History","2 entries","Sale + payment")}</div><div class="activity-list" style="margin-top:12px"><div class="activity-row"><span class="activity-icon"><i class="fa-solid fa-file-invoice"></i></span><span><strong>Invoice INV-7D21AA</strong><small>Wireless Scanner × 2</small></span><span>${money(380)}</span></div><div class="activity-row"><span class="activity-icon"><i class="fa-solid fa-money-bill"></i></span><span><strong>Payment received</strong><small>Emirates NBD</small></span><span class="positive">${money(200)}</span></div></div>`,primary:"Record payment",primaryId:"recordCustomerPaymentBtn"}); await demoClick("#recordCustomerPaymentBtn",token); closeModal();
  openForm({title:"Customer Payment",body:`${field("customerPayment","Amount received","number")}${selectField("customerPaymentWallet","Add to wallet",walletOptions("bank"))}${field("customerPaymentNote","Note")}`,primary:"Save payment"}); await demoType("#customerPayment","180",token); await demoType("#customerPaymentNote","Invoice settled",token); await demoClick("#modalSaveBtn",token); closeModal(); const alpine=state.customers.find(r=>r.id==="customer-alpine"); alpine.outstanding=0; alpine.history.push("Payment · AED 180.00"); state.wallets.find(r=>r.id==="bank").balance+=180; renderModule(); showToast("Customer balance settled in full"); await cue("Outstanding reduced to zero", "Alpine Retail is now Paid and the receipt is part of the customer history.", 98, token);
}

async function runReports(token) {
  await cue("Choose report scope", "Triplem VIP supports section reports and a complete detailed report across the workspace.", 5, token); await demoClick("#reportSection",token); await demoSelect("#reportSection","all",token); await demoSelect("#reportStyle","detailed",token); await cue("Generate the report", "The preview summarizes the same fictional module data shown throughout this demo.", 44, token); await demoClick("#generateReportBtn",token); state.reportGenerated=true; renderModule(); showToast("Detailed report generated"); await cue("Trigger PDF Download", "The manual Download PDF button creates a safe sample PDF locally in your browser.", 78, token); await demoClick("#downloadReportBtn",token); showToast("Sample PDF download ready"); await cue("Report complete", "No production records were read and no server request was made.", 98, token);
}

async function runNotes(token) {
  await cue("Capture an operational note", "Notes keep business context beside the numbers without changing financial records.", 5, token); await demoClick("#newNoteBtn",token); openForm({title:"New Note",body:`${field("noteTitle","Title")}<label class="field full"><span>Note</span><textarea class="input" id="noteBody"></textarea></label><label class="field full"><span>Reminder</span><span class="toggle-field"><label class="toggle"><input type="checkbox" id="noteReminder"><span class="toggle-track"></span></label> Remind me tomorrow at 09:30</span></label>`}); await demoType("#noteTitle","Client follow-up",token); await demoType("#noteBody","Confirm Horizon Trading payment receipt and send the updated statement.",token); await cue("Attach a reminder", "The same note can surface again at the chosen time.", 61, token); await demoClick("#noteReminder",token); $("#noteReminder").checked=true; await demoClick("#modalSaveBtn",token); closeModal(); state.notes.unshift({id:"note-demo",title:"Client follow-up",body:"Confirm Horizon Trading payment receipt and send the updated statement.",reminder:true,time:"30 Aug · 09:30"}); renderModule(); showToast("Note saved with reminder"); await cue("Context saved", "The reminder badge keeps the follow-up visible from the Notes workspace.", 98, token);
}

async function runBitcoin(token) {
  await cue("Review a watch-only wallet", "The public demo shows address and blockchain-style activity without a private key.", 8, token); await demoClick("#receiveBitcoinBtn",token); openInfoModal({title:"Receive Bitcoin",body:`<div class="qr-placeholder">${Array.from({length:49},()=>"<span></span>").join("")}</div><div class="address-box">bc1qtriplemdemo7safewatchonly9q4v8x2</div><p style="text-align:center;color:var(--muted);font-size:.68rem">Sample receive address · not for real funds</p>`,primary:"Close",primaryId:"closeReceiveBtn"}); await cue("Receive address", "Triplem VIP presents an address and QR view while sensitive signing material stays outside this public experience.", 52, token); await demoClick("#closeReceiveBtn",token); closeModal(); await demoClick("#copyBitcoinBtn",token); showToast("Sample address copied visually"); await cue("Client-side control", "The production Bitcoin module supports statements and address views; this demo intentionally performs no blockchain write or broadcast.", 98, token);
}

const RUNNERS = { dashboard:runDashboard, wallets:runWallets, expenses:runExpenses, loans:runLoans, assets:runAssets, installments:runInstallments, inventory:runInventory, sales:runSales, customers:runCustomers, reports:runReports, notes:runNotes, bitcoin:runBitcoin };

function updatePlayButton() {
  const button = $("#playPauseBtn");
  if (playback.running && !playback.paused) { button.innerHTML='<i class="fa-solid fa-pause"></i><span>Pause</span>'; button.setAttribute("aria-label","Pause chapter"); }
  else if (playback.running && playback.paused) { button.innerHTML='<i class="fa-solid fa-play"></i><span>Resume</span>'; button.setAttribute("aria-label","Resume chapter"); }
  else { button.innerHTML='<i class="fa-solid fa-play"></i><span>Play</span>'; button.setAttribute("aria-label","Play chapter"); }
}

function cancelPlayback() {
  playback.token += 1; playback.running=false; playback.paused=false; updatePlayButton(); closeModal(); $("#demoCursor").classList.remove("visible","clicking");
}

async function runCurrent() {
  cancelPlayback();
  const token = playback.token;
  prepareChapter(currentModule().key); renderModule(); setProgress(0);
  playback.running=true; playback.paused=false; updatePlayButton(); setCue("Starting chapter", currentModule().description, 1);
  try {
    await RUNNERS[currentModule().key](token);
    assertToken(token); playback.running=false; playback.paused=false; completedModules.add(currentModule().key); renderNavigation(); updatePlayButton(); setProgress(100); setCue("Chapter complete", "Choose another module, use Next, or Restart this walkthrough.", 100, "Complete"); $("#demoCursor").classList.remove("visible");
  } catch (error) {
    if (!(error instanceof Cancelled)) { playback.running=false; playback.paused=false; updatePlayButton(); setCue("Demo paused", "Restart the chapter to continue the walkthrough.", Number($("#progressValue").textContent.replace("%","")) || 0, "Paused"); }
  }
}

function setChapter(index, autoplay = false) {
  cancelPlayback(); currentIndex=(Number(index)+MODULES.length)%MODULES.length; prepareChapter(currentModule().key); renderModule(); setProgress(0); $("#coachTitle").textContent="Ready when you are"; $("#coachText").textContent=`Press Play to watch ${currentModule().label}.`; $("#coachState").className="coach-state"; $("#coachState span:last-child").textContent="Ready"; if (autoplay) runCurrent();
}

function downloadSamplePdf() {
  const stream = "BT /F1 20 Tf 54 760 Td (TRIPLEM VIP - Sample Detailed Report) Tj 0 -34 Td /F1 11 Tf (Fictional local demo data - no production records) Tj 0 -44 Td (Wallet balance: AED 41,040.00) Tj 0 -22 Td (Recorded expenses: AED 2,380.00) Tj 0 -22 Td (Asset valuation: AED 90,000.00) Tj 0 -22 Td (Report generated safely in the browser.) Tj ET";
  const objects = ["1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj", "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj", "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj", "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj", `5 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`];
  let pdf="%PDF-1.4\n", offsets=[0]; objects.forEach(obj=>{ offsets.push(pdf.length); pdf+=`${obj}\n`; }); const xref=pdf.length; pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`; offsets.slice(1).forEach(offset=>{ pdf+=`${String(offset).padStart(10,"0")} 00000 n \n`; }); pdf+=`trailer << /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const url=URL.createObjectURL(new Blob([pdf],{type:"application/pdf"})); const link=document.createElement("a"); link.href=url; link.download="Triplem_Demo_Report.pdf"; document.body.appendChild(link); link.click(); link.remove(); setTimeout(()=>URL.revokeObjectURL(url),1200); showToast("Triplem_Demo_Report.pdf downloaded");
}

document.addEventListener("click", event => {
  const tab=event.target.closest("[data-module-index]"); if(tab){ setChapter(tab.dataset.moduleIndex); return; }
  if(event.target.closest("[data-demo-close]")){ closeModal(); return; }
  if(event.target.closest("#modalCloseBtn")){ closeModal(); return; }
  if(event.target.closest("#chapterActionBtn")){ runCurrent(); return; }
  if(event.target.closest("#generateReportBtn")){ state.reportGenerated=true; renderModule(); showToast("Detailed report generated"); return; }
  if(event.target.closest("#downloadReportBtn")){ downloadSamplePdf(); return; }
  if(event.target.closest("#receiveBitcoinBtn")){ openInfoModal({title:"Receive Bitcoin",body:`<div class="qr-placeholder">${Array.from({length:49},()=>"<span></span>").join("")}</div><div class="address-box">bc1qtriplemdemo7safewatchonly9q4v8x2</div>`,primary:"Close"}); return; }
  if(event.target.closest("#copyBitcoinBtn")){ showToast("Sample address copied visually"); }
});

$("#moduleSelect").addEventListener("change", event => setChapter(event.target.value));
$("#prevBtn").addEventListener("click", () => setChapter(currentIndex-1));
$("#nextBtn").addEventListener("click", () => setChapter(currentIndex+1));
$("#restartBtn").addEventListener("click", () => runCurrent());
$("#playPauseBtn").addEventListener("click", () => {
  if (!playback.running) { runCurrent(); return; }
  playback.paused=!playback.paused; updatePlayButton(); setCue(playback.paused?"Playback paused":"Playback resumed", playback.paused?"Press Resume when you are ready.":currentModule().description, Number($("#progressValue").textContent.replace("%",""))||0, playback.paused?"Paused":"Running");
});
$("#demoThemeSelect").addEventListener("change", event => {
  const theme=event.target.value; document.documentElement.dataset.demoTheme=theme; document.documentElement.style.colorScheme=theme==="navy"?"dark":"light"; const colors={default:"#2457d6",neon:"#0284c7",navy:"#4f8cff",red:"#c1121f",pink:"#db2777",green:"#19974f"}; $("meta[name='theme-color']").setAttribute("content",colors[theme]||colors.default);
});
document.addEventListener("keydown", event => {
  if(event.key==="Escape") closeModal();
  if(event.code==="Space" && ["BODY","BUTTON"].includes(document.activeElement?.tagName)){ event.preventDefault(); $("#playPauseBtn").click(); return; }
  if(["INPUT","SELECT","TEXTAREA"].includes(document.activeElement?.tagName) || !$("#demoModal").classList.contains("hide")) return;
  if(event.key==="ArrowLeft"){ event.preventDefault(); setChapter(currentIndex-1); }
  if(event.key==="ArrowRight"){ event.preventDefault(); setChapter(currentIndex+1); }
});

prepareChapter(MODULES[0].key);
renderModule();
setProgress(0);
