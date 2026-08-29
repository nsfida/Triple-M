"use strict";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const money = (value, currency = "AED") => `${currency} ${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches || false;

const APP_TABS = [
  { key: "dashboard", label: "Dashboard", icon: "fa-chart-line" },
  { key: "expenses", label: "Expenses", icon: "fa-coins" },
  { key: "goods", label: "Inventory", icon: "fa-cart-shopping" },
  { key: "assets", label: "Asset", icon: "fa-building" },
  { key: "loans", label: "Loans", icon: "fa-hand-holding-dollar" },
  { key: "installments", label: "Installments", icon: "fa-calendar-days" },
  { key: "notes", label: "Notes", icon: "fa-sticky-note" },
  { key: "bitcoin", label: "Bitcoin", icon: "fa-bitcoin", brand: true },
  { key: "messages", label: "Messages", icon: "fa-comments" }
];

const MODULES = [
  {
    key: "dashboard", appTab: "dashboard", label: "Dashboard", icon: "fa-chart-line",
    steps: [
      ["Read the live overview", "Start with wallet balance, expenses, assets, and outstanding balances so the financial position is visible at a glance."],
      ["Change the dashboard currency", "Currency controls alter the dashboard view without changing the underlying records stored in each section."],
      ["Inspect cash-flow movement", "The chart compares recent inflow and outflow patterns and keeps the visual summary beside the headline totals."],
      ["Review latest activity", "Recent expense, invoice, stock, and installment events are surfaced together so important movement is not hidden in separate sections."],
      ["Open section intelligence", "Dashboard cards act as a starting point for deeper section details, graphs, and reports when more explanation is needed."]
    ]
  },
  {
    key: "wallets", appTab: "expenses", label: "Wallets", icon: "fa-wallet",
    steps: [
      ["Expand Wallets Overview", "Wallets live inside Expenses and show balance, top-ups, spending, account type, and currency per account."],
      ["Create a new account", "Use New Entry to add a Cash or Bank wallet with its own currency and opening balance."],
      ["Add money", "A top-up becomes a dated wallet transaction and immediately increases the available balance."],
      ["Transfer between wallets", "Transfers reduce the source wallet and increase the destination wallet while preserving both transaction legs."],
      ["Filter by wallet", "The wallet bar narrows transaction history to one account without losing the combined workspace view."],
      ["Reconcile the balances", "Top-up, spend, and transfer totals stay connected to the dashboard and expense history."]
    ]
  },
  {
    key: "expenses", appTab: "expenses", label: "Expenses", icon: "fa-coins",
    steps: [
      ["Open New Entry", "The section menu groups expense entry, exports, and related actions without crowding the section header."],
      ["Record an expense", "Choose the paying wallet, item, amount, date, and note. Saving updates both the transaction list and wallet balance."],
      ["Expand Transaction History", "History opens into a detailed table with date, item, wallet, notes, amount, and record actions."],
      ["Open the Download menu", "The report menu offers Summary and Detailed PDF choices above the expanded history instead of being hidden behind it."],
      ["Correct an existing record", "Editing preserves the transaction identity while recalculating the wallet effect and totals."],
      ["Review Expenses Details", "Section Details summarizes spending and graphs without leaving the Expenses workspace."]
    ]
  },
  {
    key: "inventory", appTab: "goods", label: "Inventory", icon: "fa-boxes-stacked",
    steps: [
      ["Open Inventory actions", "The + menu exposes Add item, Create sale, cart, scanner, barcodes, saved carts, CSV, PDF, and audit tools."],
      ["Add a stock item", "Record item name, brand, category, quantity, unit cost, selling price, and SKU as one catalog record."],
      ["Use inventory filters", "Search, brand, category, stock status, and view controls make large catalogs manageable."],
      ["Inspect the stock card", "Each product shows current quantity, cost, sell price, brand, category, and stock state."],
      ["Edit pricing", "Changing the selling price keeps the same product and stock history rather than creating a duplicate."],
      ["Restock the same SKU", "Additional quantity is added to the existing product while purchase cost can be recorded for the restock."],
      ["Open Inventory Details", "The section summary exposes stock valuation, item counts, low-stock signals, and deeper graphs."]
    ]
  },
  {
    key: "sales", appTab: "goods", label: "Sale / Cart", icon: "fa-cash-register",
    steps: [
      ["Start Create Sale", "Sales are built from current Inventory, so the cart can only use products and quantities that actually exist."],
      ["Add an item to cart", "Select a product and quantity; the cart calculates line total from the current selling price."],
      ["Attach a customer", "A saved or new customer can be attached so invoices, receipts, and outstanding balances remain connected."],
      ["Record payment", "Choose the receiving wallet and enter the amount collected now. Any unpaid portion becomes customer outstanding."],
      ["Review invoice totals", "Subtotal, paid amount, balance, and estimated profit are visible before finalization."],
      ["Finalize the sale", "Finalizing reduces stock, adds collected money to the wallet, creates the invoice, and updates profit and customer history."]
    ]
  },
  {
    key: "customers", appTab: "goods", label: "Customers", icon: "fa-users",
    steps: [
      ["Open Customers / Invoices", "Inventory includes a customer workspace for contact details, invoices, receipts, and current outstanding balance."],
      ["Create a customer", "Save company, phone, email, and customer name before or during a sale."],
      ["Open customer history", "The record combines invoices and payments chronologically so the account can be understood without searching elsewhere."],
      ["Record an outstanding payment", "Choose the destination wallet and settle all or part of an unpaid invoice."],
      ["Confirm the account status", "When the remaining balance reaches zero, the customer record reflects the paid state and the receipt remains in history."]
    ]
  },
  {
    key: "assets", appTab: "assets", label: "Assets", icon: "fa-building",
    steps: [
      ["Use the Assets view", "Owned Assets and Depreciation Assets are separate views within the same section."],
      ["Add an owned asset", "Record asset name, type, purchase date, purchase price, currency, description, and current value."],
      ["Filter the portfolio", "Search, status, currency, and type controls narrow the asset list while keeping portfolio totals visible."],
      ["Open asset details", "The asset card exposes purchase information, current valuation, performance, and transaction context."],
      ["Update current valuation", "Valuation can change independently of the original purchase price, preserving the historical acquisition value."],
      ["Use portfolio reports", "Summary and detailed PDF options provide portfolio reporting with the same themed charts and values."]
    ]
  },
  {
    key: "depreciation", appTab: "assets", label: "Depreciation", icon: "fa-arrow-trend-down",
    steps: [
      ["Switch to Depreciation Assets", "This view is dedicated to assets whose value is systematically reduced over their useful life."],
      ["Create a depreciation record", "Enter cost, salvage value, useful life, acquisition date, and depreciation method."],
      ["Review calculation settings", "The schedule explains the basis used to calculate annual and accumulated depreciation."],
      ["Read current book value", "The asset card separates original cost, accumulated depreciation, and present book value."],
      ["Inspect the schedule", "A period-by-period table makes the depreciation path auditable instead of showing only the final number."],
      ["Generate a depreciation report", "The report preserves asset details and schedule values for filing or review."]
    ]
  },
  {
    key: "loans", appTab: "loans", label: "Loans", icon: "fa-hand-holding-dollar",
    steps: [
      ["Start with Loan Given", "Given loans represent money that left your wallet and is expected back from a person or business."],
      ["Record Received Back", "A partial receipt reduces the remaining balance and can return money to the selected wallet."],
      ["Switch to Loan Taken", "Taken loans represent money received from another party that you still owe back."],
      ["Create a Taken Loan", "The principal can be deposited into a wallet and remains open until repayments are recorded."],
      ["Record Returned Back", "Partial repayment reduces both the wallet balance and the outstanding loan amount."],
      ["Complete settlement", "Final payment or receipt changes the relevant loan to Closed when the remaining balance reaches zero."],
      ["Read Loans Overview", "Balances are summarized by currency while the two loan directions remain distinctly traceable."]
    ]
  },
  {
    key: "installments", appTab: "installments", label: "Installments", icon: "fa-calendar-days",
    steps: [
      ["Create an Installment Plan", "Define the person or plan, total financed amount, currency, start date, and installment count."],
      ["Read the plan status", "The card shows original total, paid amount, remaining amount, and completion progress."],
      ["Record an installment", "Each received payment can be assigned to a wallet and becomes part of the plan history."],
      ["Review remaining balance", "The progress bar and totals update after every payment instead of requiring manual reconciliation."],
      ["Complete the schedule", "A final payment moves the plan to Completed when paid and total amounts reconcile."],
      ["Use Details and exports", "Section Details, CSV controls, and records remain available for deeper review and portability."]
    ]
  },
  {
    key: "notes", appTab: "notes", label: "Notes", icon: "fa-note-sticky",
    steps: [
      ["Create a New Note", "Notes preserve operational context, decisions, and follow-ups beside financial records."],
      ["Write the note clearly", "A title and full note body make the entry searchable and useful later."],
      ["Set a reminder", "The reminder control schedules attention for a chosen date and time without changing any finance record."],
      ["Open the saved note", "Note detail provides reading, editing, reminder management, and deletion from a focused overlay."],
      ["Search the Notes workspace", "Search filters by title and content so older context remains easy to retrieve."]
    ]
  },
  {
    key: "bitcoin", appTab: "bitcoin", label: "Bitcoin", icon: "fa-bitcoin-sign",
    steps: [
      ["Open the Bitcoin workspace", "The section supports wallet address views, receive/send workflows, balances, and transaction statements."],
      ["Review watch-only address", "A public address can be monitored without exposing a private key in this public demo."],
      ["Open Receive", "The receive overlay presents an address and QR representation for inbound transactions."],
      ["Inspect transaction history", "Received and sent activity is shown with confirmation state and BTC amounts per wallet."],
      ["Understand local key control", "Production key workflows are browser-side. This demo never stores, imports, signs, or broadcasts a real private key."],
      ["Open statement tools", "Per-wallet statements and address copying remain available without mixing sensitive material into other finance sections."]
    ]
  },
  {
    key: "messages", appTab: "messages", label: "Messages", icon: "fa-comments",
    steps: [
      ["Open Messages", "Messages provides a dedicated conversation workspace rather than relying only on temporary notification popovers."],
      ["Choose a conversation", "The left thread list keeps recent inquiries and support conversations visible with unread context."],
      ["Start a new inquiry", "A user can create a clear subject and message for the administrator directly from the application."],
      ["Write the message", "The composer keeps the conversation history above while the new message is prepared below."],
      ["Send and keep history", "Sent messages remain attached to the same thread so replies are easy to follow later."],
      ["Receive an administrator reply", "The reply appears in the thread with the existing conversation instead of becoming a disconnected alert."]
    ]
  },
  {
    key: "reports", appTab: "dashboard", label: "Reports", icon: "fa-file-pdf",
    steps: [
      ["Open report controls", "Triplem VIP supports section-level reports as well as a complete workspace report from account tools."],
      ["Choose report scope", "Select Expenses, Inventory, Assets, Loans, Installments, or All Sections depending on the purpose."],
      ["Choose Summary or Detailed", "Summary keeps the report concise, while Detailed includes the underlying records and richer breakdowns."],
      ["Generate the preview", "The preview uses the same fictional values demonstrated throughout the chapters so the numbers remain coherent."],
      ["Download the PDF", "The demo can generate a harmless sample PDF locally. Production reports use the signed-in workspace data."]
    ]
  }
];

const CHAPTER_REVIEW_COPY = {
  dashboard: "Pause on the completed dashboard and connect each hero total to the detailed section beneath it.",
  wallets: "Review the final wallet balances, top-up totals, spending, and transfer result before moving on.",
  expenses: "Review the saved transaction, wallet impact, expanded history, and report controls together.",
  inventory: "Review the category grid, stock quantities, pricing, filters, and item actions as one inventory workflow.",
  sales: "Review the finalized cart, invoice totals, customer balance, stock reduction, and wallet collection together.",
  customers: "Review how invoices, payments, receipts, and the remaining customer balance stay connected in one record.",
  assets: "Review purchase value, current position, net performance, status, and reporting controls on the asset cards.",
  depreciation: "Review original cost, accumulated depreciation, book value, useful life, and schedule context together.",
  loans: "Review given and taken directions separately, then compare principal, paid movement, remaining balance, and status.",
  installments: "Review the plan total, paid amount, remaining amount, next installment context, and completion progress.",
  notes: "Review note content, reminder state, searchability, and the opened note view before leaving the chapter.",
  bitcoin: "Review wallet type, balance, receive address, transaction history, and the browser-side security boundary together.",
  messages: "Review the conversation thread, sent message, and administrator reply as one continuous support history.",
  reports: "Review scope, detail level, generated totals, and the final report preview before downloading the safe sample."
};
MODULES.forEach(module => module.steps.push(["Review the completed state", CHAPTER_REVIEW_COPY[module.key] || "Review the final state and how each action changed the visible workspace."]));

function baseState() {
  return {
    wallets: [
      { id: "cash", name: "Cash", type: "Cash", currency: "AED", balance: 12400, topups: 15200, spent: 2800 },
      { id: "bank", name: "Emirates NBD", type: "Bank", currency: "AED", balance: 28640, topups: 35600, spent: 6960 },
      { id: "card", name: "Business Card", type: "Card", currency: "AED", balance: 7350, topups: 9100, spent: 1750 }
    ],
    expenses: [
      { id: "exp-rent", item: "Office rent", wallet: "bank", amount: 1800, date: "28 Aug 2026", note: "August workspace" },
      { id: "exp-utilities", item: "Utilities", wallet: "bank", amount: 420, date: "27 Aug 2026", note: "Electricity & internet" },
      { id: "exp-transport", item: "Transport", wallet: "cash", amount: 160, date: "26 Aug 2026", note: "Local delivery" },
      { id: "exp-supplies", item: "Office supplies", wallet: "card", amount: 285, date: "25 Aug 2026", note: "Paper & labels" }
    ],
    transfers: [{ date: "24 Aug 2026", from: "bank", to: "cash", amount: 1000, note: "Petty cash replenishment" }],
    loans: [
      { id: "loan-bilal", direction: "given", name: "Bilal Trading", principal: 5000, remaining: 3200, status: "Partial" },
      { id: "loan-supplier", direction: "taken", name: "Supplier Bridge", principal: 8000, remaining: 5000, status: "Partial" }
    ],
    loanMode: "given",
    assets: [
      { id: "asset-van", name: "Delivery Van", type: "Vehicle", purchase: 78000, value: 72000, status: "Active" },
      { id: "asset-office", name: "Office Equipment", type: "Equipment", purchase: 21500, value: 18000, status: "Active" }
    ],
    depreciation: [
      { id: "dep-laptop", name: "Editing Workstation", type: "Electronics", cost: 12000, salvage: 2000, life: 5, accumulated: 2000, book: 10000, method: "Straight line" }
    ],
    installments: [{ id: "plan-laptop", name: "Laptop Plan", total: 3600, paid: 1200, count: 6, status: "Partial" }],
    inventory: [
      { id: "item-oud", name: "Essential Oud", brand: "Noor", qty: 12, cost: 85, sell: 135, category: "Perfume", sku: "NR-OUD-01" },
      { id: "item-notebook", name: "Leather Notebook", brand: "Studio", qty: 24, cost: 18, sell: 35, category: "General", sku: "ST-NB-02" },
      { id: "item-cable", name: "USB-C Cable", brand: "Link", qty: 7, cost: 22, sell: 45, category: "Electronics", sku: "LK-CBL-03" }
    ],
    cart: [],
    sales: [],
    customers: [
      { id: "customer-horizon", name: "Horizon Trading", phone: "+971 50 555 0184", company: "Horizon Trading LLC", outstanding: 1350, history: ["INV-A1F40B · AED 2,850.00", "Payment · AED 1,500.00"] },
      { id: "customer-alpine", name: "Alpine Retail", phone: "+971 55 204 8821", company: "Alpine Retail", outstanding: 180, history: ["INV-7D21AA · AED 380.00", "Payment · AED 200.00"] }
    ],
    notes: [
      { id: "note-opening", title: "Month-end checklist", body: "Review outstanding invoices and wallet reconciliation before closing August.", reminder: true, time: "30 Aug · 09:00" },
      { id: "note-stock", title: "Scanner stock", body: "Reorder scanners if available quantity falls below five units.", reminder: false, time: "" }
    ],
    messages: [
      { who: "Admin", mine: false, text: "Welcome to Triplem VIP. Your workspace is ready. Let me know if you need help with setup.", time: "Yesterday · 18:40" },
      { who: "You", mine: true, text: "Thank you. I would like guidance on the inventory audit report.", time: "Today · 09:14" },
      { who: "Admin", mine: false, text: "Open Inventory, use the + menu, then choose Audit Report. It downloads an Excel workbook for review.", time: "Today · 09:18" }
    ],
    reportGenerated: false,
    expenseHistoryOpen: false,
    expenseDownloadOpen: false,
    inventoryMenuOpen: false,
    walletsCollapsed: false
  };
}

let state = baseState();
let currentIndex = 0;
let currentTutorialStep = -1;
let toastTimer = null;
let playbackSpeed = 0.8;
const playback = { token: 0, running: false, paused: false };
const completedModules = new Set();

function currentModule() { return MODULES[currentIndex]; }
function walletName(id) { return state.wallets.find(row => row.id === id)?.name || "Wallet"; }
function walletOptions(selected = "") { return state.wallets.map(row => `<option value="${row.id}" ${row.id === selected ? "selected" : ""}>${row.name} · ${money(row.balance, row.currency)}</option>`).join(""); }
function totalWalletBalance() { return state.wallets.reduce((sum, row) => sum + row.balance, 0); }
function totalExpenses() { return state.expenses.reduce((sum, row) => sum + row.amount, 0); }
function totalAssetValue() { return state.assets.reduce((sum, row) => sum + row.value, 0); }
function totalOutstanding() { return state.loans.reduce((sum, row) => sum + row.remaining, 0) + state.customers.reduce((sum, row) => sum + row.outstanding, 0); }
function stockValue() { return state.inventory.reduce((sum, row) => sum + row.qty * row.cost, 0); }

function prepareChapter(key) {
  state = baseState();
  if (["sales", "customers"].includes(key)) {
    state.inventory.push({ id: "item-scanner", name: "Wireless Scanner", brand: "Triplem Supply", qty: 12, cost: 120, sell: 190, category: "Electronics", sku: "TM-SCN-01" });
  }
  if (["sales", "customers"].includes(key)) {
    state.sales.push({ id: "sale-alpine", item: "Wireless Scanner", customer: "Alpine Retail", qty: 2, total: 380, paid: 200, profit: 140 });
  }
  if (key === "wallets") state.walletsCollapsed = true;
  currentTutorialStep = -1;
}

function renderNavigation() {
  $("#demoModuleTabs").innerHTML = MODULES.map((module, index) => `
    <button class="module-tab ${index === currentIndex ? "active" : ""} ${completedModules.has(module.key) ? "is-complete" : ""}" type="button" data-module-index="${index}" aria-current="${index === currentIndex ? "page" : "false"}" title="${module.label}">
      <i class="fa-solid ${module.icon}" aria-hidden="true"></i><span>${module.label}</span><i class="fa-solid fa-check module-check" aria-hidden="true"></i>
    </button>`).join("");
  $("#moduleSelect").innerHTML = MODULES.map((module, index) => `<option value="${index}" ${index === currentIndex ? "selected" : ""}>${index + 1}. ${module.label}</option>`).join("");
  $("#demoChapterTotal").textContent = `/ ${MODULES.length} explored`;
  renderTourProgress();
}

function renderProductTabs() {
  const active = currentModule().appTab;
  $("#productTabs").innerHTML = APP_TABS.map(tab => `
    <button class="tab ${tab.key === active ? "active" : ""}" type="button" data-product-tab="${tab.key}" title="${tab.label}">
      <i class="${tab.brand ? "fa-brands" : "fa-solid"} ${tab.icon}" aria-hidden="true"></i><span class="tab-label">${tab.label}</span>
    </button>`).join("");
}

function renderTourProgress() {
  $("#demoCompletedCount").textContent = String(completedModules.size);
  $("#coachChapter").textContent = `Chapter ${currentIndex + 1} of ${MODULES.length}`;
  $("#chapterMap").innerHTML = MODULES.map((module, index) => `<span class="${index === currentIndex ? "is-current" : ""} ${completedModules.has(module.key) ? "is-complete" : ""}" title="${index + 1}. ${module.label}"></span>`).join("");
}

function renderTutorial() {
  const module = currentModule();
  $("#tutorialTitle").textContent = `${module.label} steps`;
  $("#tutorialSteps").innerHTML = module.steps.map((item, index) => `
    <li class="tutorial-step ${index === currentTutorialStep ? "is-active" : ""} ${index < currentTutorialStep ? "is-done" : ""}" data-tutorial-step="${index}">
      <span class="step-index">${index < currentTutorialStep ? '<i class="fa-solid fa-check"></i>' : index + 1}</span>
      <div><strong>${item[0]}</strong><p>${item[1]}</p></div>
    </li>`).join("");
  if (currentTutorialStep >= 0) $("[data-tutorial-step='" + currentTutorialStep + "']")?.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
}

function renderModule() {
  hidePointerLabel();
  const module = currentModule();
  $("#stageTitle").textContent = module.label;
  $("#progressTitle").textContent = module.label;
  renderProductTabs();
  const renderer = RENDERERS[module.key];
  $("#productContent").innerHTML = renderer ? renderer() : "";
  renderNavigation();
  renderTutorial();
}

function sectionHead(title, description, controls = "") {
  return `<div class="section-head"><div class="section-head-top"><div class="title-group"><div class="title-row"><h3>${title}</h3>${controls}</div><p>${description}</p></div></div></div>`;
}

function filterRow(searchPlaceholder, extras = "") {
  return `<div class="filter-inline-row compact-filter-row"><div class="compact-filter-main"><div class="filter-inline-section compact-filter-search"><span class="filter-inline-label">Search</span><input class="input filter-inline-input" placeholder="${searchPlaceholder}" /></div>${extras}</div></div>`;
}

function metricCard(label, value, note) {
  return `<article class="demo-summary-card"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`;
}

function renderDashboard() {
  const outstandingLoans = state.loans.reduce((sum, row) => sum + row.remaining, 0);
  const installmentTotal = state.installments.reduce((sum, row) => sum + row.total, 0);
  const installmentPaid = state.installments.reduce((sum, row) => sum + row.paid, 0);
  const installmentPct = installmentTotal ? Math.round((installmentPaid / installmentTotal) * 100) : 0;
  const hero = [
    ["expenses","Wallet balance",money(totalWalletBalance()),`AED · ${state.wallets.length} wallets`],
    ["inventory","Inventory profit",money(state.inventory.reduce((sum,row)=>sum + Math.max(0,(row.sell-row.cost)*Math.max(1,row.qty)),0)),`AED · ${state.inventory.length} items`],
    ["assets","Asset net P/L",money(totalAssetValue()-state.assets.reduce((sum,row)=>sum+row.purchase,0)),`AED · ${state.assets.length} active · ${state.assets.length} total`],
    ["loans","Loans outstanding",money(outstandingLoans),`Given and taken open balances`],
    ["installments","Installment progress",`${installmentPct}%`,`${state.installments.filter(row=>row.paid<row.total).length} active · 0 overdue`]
  ];
  const heroHtml = hero.map((row,index)=>`<article class="dashboard-hero-card is-${row[0]} ${index < 4 ? 'demo-summary-card' : ''}" data-dashboard-hero-card="${row[0]}"><small>${row[1]}</small><strong>${row[2]}</strong><div class="dashboard-hero-meta">${row[3]}</div></article>`).join("");
  return `<section id="dashboardPanel" class="panel active"><div class="card section dashboard-section">
    ${sectionHead("Detailed Dashboard", "Live charts for wallets, inventory, assets, loans, and installments — each block follows the production dashboard hierarchy and currency focus.")}
    <div id="dashboardRoot" class="dashboard-root is-hydrated is-desktop-layout">
      <div class="dashboard-section-switch" role="tablist" aria-label="Dashboard section">
        <button class="dashboard-section-switch-btn active" type="button"><i class="fa-solid fa-coins"></i><span>Expenses</span></button>
        <button class="dashboard-section-switch-btn" type="button"><i class="fa-solid fa-cart-shopping"></i><span>Inventory</span></button>
        <button class="dashboard-section-switch-btn" type="button"><i class="fa-solid fa-building"></i><span>Assets</span></button>
        <button class="dashboard-section-switch-btn" type="button"><i class="fa-solid fa-hand-holding-dollar"></i><span>Loans</span></button>
        <button class="dashboard-section-switch-btn" type="button"><i class="fa-solid fa-calendar-days"></i><span>Installments</span></button>
      </div>
      <div class="dashboard-hero" style="--dashboard-hero-cols:5">${heroHtml}</div>
      <div class="dashboard-grid">
        <section class="dashboard-block is-expenses" data-dashboard-block="expenses">
          <header class="dashboard-block-head"><h4><i class="fa-solid fa-coins"></i> Expenses & Wallets</h4><button class="tiny ghost" id="dashboardDetailsBtn"><i class="fa-solid fa-chart-pie"></i> Open</button></header>
          <div class="section-details-currency-bar"><button class="tiny primary" id="dashboardCurrencyBtn">AED</button><button class="tiny ghost">SAR</button><button class="tiny ghost">USD</button></div>
          <div class="section-details-metrics">
            <div class="section-details-metric is-primary"><small>Wallets</small><strong>${state.wallets.length}</strong></div>
            <div class="section-details-metric is-success"><small>Active</small><strong>${state.wallets.length}</strong></div>
            <div class="section-details-metric"><small>Topped up</small><strong>${money(state.wallets.reduce((s,r)=>s+r.topups,0))}</strong></div>
            <div class="section-details-metric is-warning"><small>Spent</small><strong>${money(totalExpenses())}</strong></div>
            <div class="section-details-metric is-success"><small>Balance</small><strong>${money(totalWalletBalance())}</strong></div>
          </div>
          <div class="dashboard-charts">
            <article class="dashboard-chart-card"><h5>Monthly cash <span class="dashboard-chart-badge">AED</span></h5><div class="demo-chart-bars" id="dashboardChart"><span style="--h:44%" data-label="Mar"></span><span style="--h:68%" data-label="Apr"></span><span style="--h:55%" data-label="May"></span><span style="--h:82%" data-label="Jun"></span><span style="--h:66%" data-label="Jul"></span><span style="--h:91%" data-label="Aug"></span></div></article>
            <article class="dashboard-chart-card"><h5>Latest activity <span class="dashboard-chart-badge">Live sample</span></h5><div class="demo-activity-list" id="dashboardActivity"><div class="demo-activity-row"><i class="fa-solid fa-arrow-down"></i><span><strong>Invoice payment</strong><small>Horizon Trading · Emirates NBD</small></span><span class="demo-positive">+1,500</span></div><div class="demo-activity-row"><i class="fa-solid fa-coins"></i><span><strong>Office rent</strong><small>Expenses · Emirates NBD</small></span><span class="demo-negative">−1,800</span></div><div class="demo-activity-row"><i class="fa-solid fa-box"></i><span><strong>Stock purchase</strong><small>Inventory · 12 units</small></span><span class="demo-negative">−1,020</span></div></div></article>
          </div>
        </section>
        <section class="dashboard-block is-loans is-wide" data-dashboard-block="loans"><header class="dashboard-block-head"><h4><i class="fa-solid fa-hand-holding-dollar"></i> Loans</h4><button class="tiny ghost">Open</button></header><div class="dashboard-loan-split"><div class="dashboard-loan-pill is-given"><small>Given · principal / open</small><strong>${money(state.loans.filter(r=>r.direction==='given').reduce((s,r)=>s+r.principal,0))} · ${money(state.loans.filter(r=>r.direction==='given').reduce((s,r)=>s+r.remaining,0))}</strong></div><div class="dashboard-loan-pill is-taken"><small>Taken · principal / open</small><strong>${money(state.loans.filter(r=>r.direction==='taken').reduce((s,r)=>s+r.principal,0))} · ${money(state.loans.filter(r=>r.direction==='taken').reduce((s,r)=>s+r.remaining,0))}</strong></div></div><div class="section-details-metrics"><div class="section-details-metric is-primary"><small>People</small><strong>${state.loans.length}</strong></div><div class="section-details-metric is-warning"><small>Given open</small><strong>${money(state.loans.filter(r=>r.direction==='given').reduce((s,r)=>s+r.remaining,0))}</strong></div><div class="section-details-metric is-danger"><small>Taken open</small><strong>${money(state.loans.filter(r=>r.direction==='taken').reduce((s,r)=>s+r.remaining,0))}</strong></div></div></section>
      </div>
    </div>
  </div></section>`;
}

function walletCards() {
  return `<div class="expense-wallet-scroll demo-real-wallet-scroll">${state.wallets.map((wallet,index)=>`<div class="expense-wallet-card-wrap"><input type="radio" id="wallet-radio-${wallet.id}" name="demo_wallet" class="filter-radio expense-wallet-radio" ${index===0?'checked':''}><label for="wallet-radio-${wallet.id}" class="expense-wallet-card wallet-details-card" id="wallet-${wallet.id}" data-wallet-details="${wallet.id}"><span class="expense-wallet-title"><i class="fa-solid ${wallet.type==='Bank'?'fa-building-columns':wallet.type==='Card'?'fa-credit-card':'fa-wallet'}"></i> ${wallet.name} (${money(wallet.balance,wallet.currency)})</span><span class="expense-wallet-sub">${wallet.type} · ${wallet.currency}</span><div class="expense-wallet-stats"><span><small>Topped up</small><strong>${money(wallet.topups,wallet.currency)}</strong></span><span><small>Spent</small><strong>${money(wallet.spent,wallet.currency)}</strong></span><span><small>Balance</small><strong>${money(wallet.balance,wallet.currency)}</strong></span></div></label><div class="expense-wallet-actions"><button class="icon-btn ghost tiny" type="button" title="Wallet statement"><i class="fa-solid fa-file-lines"></i></button>${wallet.id==='studio'?'<button class="icon-btn ghost tiny" id="editWalletBtn" type="button"><i class="fa-solid fa-pen"></i></button>':''}</div></div>`).join("")}</div>`;
}

function renderWallets() {
  const menuClass = state.inventoryMenuOpen ? "demo-visible-menu" : "";
  return `<section id="expensesPanel" class="panel active">
    <section class="overview wallets-overview-section" id="walletsOverviewSection"><div class="overview-top" id="walletsBanner"><div><h3>Wallets Overview</h3><p>Account balances and expense tracking by wallet.</p></div><div class="tools"><button class="icon-btn ghost" id="toggleWalletsBtn" title="${state.walletsCollapsed ? 'Expand' : 'Collapse'} Wallets Overview">${state.walletsCollapsed ? '▶' : '▼'}</button></div></div><div class="wallets-content ${state.walletsCollapsed ? 'hide' : ''}" id="walletsContent"><div id="expenseOverviewWallets">${walletCards()}</div></div></section>
    <div class="card section demo-real-section-gap">${sectionHead("Expenses", "Wallets show top-up, spent, and balance. The statement below follows the same wallet-aware structure as the production workspace.", `<div class="menu-wrap"><button class="tiny ghost menu-trigger" id="walletNewEntryBtn">New Entry ▾</button><div class="menu-dropdown ${menuClass}" id="walletEntryMenu"><button class="menu-item" id="addWalletAction">Add Account</button><button class="menu-item" id="addMoneyAction">Add Money</button><button class="menu-item" id="transferAction">Transfer Money</button><button class="menu-item"><i class="fa-solid fa-file-pdf"></i> Download PDF</button></div></div>`)}
      <div class="filter-inline-row compact-filter-row"><div class="compact-filter-main"><div class="filter-inline-section compact-filter-search"><span class="filter-inline-label">Search</span><input class="input filter-inline-input" placeholder="Item, wallet, note"></div><div class="filter-inline-section"><span class="filter-inline-label">Wallet</span><select class="select filter-inline-select" id="walletFilter"><option>All wallets</option>${state.wallets.map(row=>`<option>${row.name}</option>`).join("")}</select></div><div class="filter-inline-section"><span class="filter-inline-label">Balance</span><select class="select filter-inline-select"><option>All</option><option>Active Balance</option><option>Zero Balance</option></select></div><div class="filter-inline-section"><span class="filter-inline-label">Currency</span><select class="select filter-inline-select"><option>All</option><option>AED</option></select></div></div></div>
      <div class="expense-wallet-block"><div class="filter-block-label">Wallets</div>${walletCards()}</div>
      <div class="empty demo-wallet-hint">This chapter demonstrates account creation, top-ups, transfers, filtering, and balance reconciliation before the transaction-history chapter.</div>
    </div>
  </section>`;
}

function renderExpenseHistoryGroups() {
  return state.expenses.map(row => `<details class="loan expense-item-row" id="expense-${row.id}" open>
    <summary><div class="loan-top"><div class="lt-main"><div class="loan-name">${row.item}</div><div class="loan-sub"><span class="badge blue">Other</span><span>1 transaction</span><span>AED</span></div></div><div class="cell expense-item-total"><small>Total spent</small><strong>${money(row.amount)}</strong></div><div class="lt-action"><button class="icon-btn ghost" type="button" title="Download PDF"><i class="fa-solid fa-download"></i></button></div></div></summary>
    <div class="detail"><div class="table-wrap"><table><thead><tr><th>Date</th><th>Wallet</th><th>Type</th><th>Amount</th><th>Notes</th><th>Action</th></tr></thead><tbody><tr><td>${row.date}</td><td>${walletName(row.wallet)}</td><td><span class="badge blue">Expense</span></td><td class="demo-negative">−${money(row.amount)}</td><td>${row.note}</td><td><div class="demo-actions">${row.id === "exp-demo" ? '<button class="tiny ghost" id="editExpenseBtn"><i class="fa-solid fa-pen"></i></button>' : '<button class="tiny ghost"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>'}<button class="tiny danger"><i class="fa-solid fa-xmark"></i></button></div></td></tr></tbody></table></div></div>
  </details>`).join("");
}

function renderExpenses() {
  const downloadMenuClass = state.expenseDownloadOpen ? "" : "hide";
  return `<section id="expensesPanel" class="panel active"><div class="card section">
    ${sectionHead("Expenses", "Wallets show top-up, spent, and balance. The list is an expense statement by item; open Transaction History for wallet-level records.", `<button class="tiny ghost" id="expensesDetailsBtn"><i class="fa-solid fa-chart-pie"></i> Details</button><div class="menu-wrap"><button class="tiny ghost menu-trigger" id="expenseEntryBtn">New Entry ▾</button><div class="menu-dropdown" id="expenseEntryMenu"><button class="menu-item" id="addExpenseAction">Add Expense</button><button class="menu-item">Add Account</button><button class="menu-item">Add Money</button><button class="menu-item"><i class="fa-solid fa-download"></i> Download CSV</button><button class="menu-item"><i class="fa-solid fa-file-pdf"></i> Download PDF</button></div></div>`)}
    <div class="filter-inline-row compact-filter-row"><div class="compact-filter-main"><div class="filter-inline-section compact-filter-search"><span class="filter-inline-label">Search</span><input class="input filter-inline-input" placeholder="Item, wallet, note"></div><div class="filter-inline-section"><span class="filter-inline-label">Balance</span><select class="select filter-inline-select"><option>All</option><option>Active Balance</option><option>Zero Balance</option></select></div><div class="filter-inline-section"><span class="filter-inline-label">Currency</span><select class="select filter-inline-select"><option>All</option><option>AED</option></select></div></div><div class="filter-inline-section compact-filter-dates"><span class="filter-inline-label">Date</span><input type="date" class="input filter-inline-date"><span class="compact-date-sep">to</span><input type="date" class="input filter-inline-date"><button class="btn ghost filter-inline-btn">Clear</button></div></div>
    <div class="expense-wallet-block"><div class="filter-block-label">Wallets</div>${walletCards()}</div>
    <details class="expense-collapsible-section" id="transactionsHistorySection" ${state.expenseHistoryOpen ? "open" : ""}>
      <summary class="expense-collapsible-header expense-history-header" id="transactionHistorySummary"><h4 class="expense-section-title"><i class="fa-solid fa-list-ul"></i> Transactions History</h4><span class="expense-history-controls"><button class="tiny ghost expense-history-range-btn active">Today</button><button class="tiny ghost expense-history-range-btn">Last 7 Days</button><button class="tiny ghost expense-history-range-btn">This Month</button><button class="tiny ghost expense-history-range-btn">All</button><span class="expense-history-download-wrap"><button type="button" class="icon-btn ghost expenseActionBtn expense-history-download" id="expenseDownloadBtn" title="Download Transactions History PDF"><i class="fa-solid fa-download"></i></button><div class="expense-history-pdf-menu ${downloadMenuClass}" id="expenseDownloadMenu"><button type="button" class="expense-history-pdf-option" id="detailedReportOption"><strong>Detailed PDF</strong><span>Each item with full transaction list</span></button><button type="button" class="expense-history-pdf-option" id="summaryReportOption"><strong>Summarize PDF</strong><span>Totals per item for the selected dates</span></button></div></span></span><span class="expand-icon">${state.expenseHistoryOpen ? "▼" : "▶"}</span></summary>
      <div class="expense-collapsible-content"><div class="expense-section-toolbar expense-history-toolbar"><span class="expense-toolbar-hint">Showing all sample dates. ${state.expenses.length} transaction(s) in this selection.</span></div>${renderExpenseHistoryGroups()}</div>
    </details>
  </div></section>`;
}

function renderInventory() {
  const categories = {};
  state.inventory.forEach(row => { if(!categories[row.category]) categories[row.category]=[]; categories[row.category].push(row); });
  const cards = Object.entries(categories).map(([category,rows])=>{ const stock=rows.reduce((s,r)=>s+r.qty,0); const brands=new Set(rows.map(r=>r.brand)).size; const target=rows.find(r=>r.id==='item-scanner'); return `<article class="inventory-section-card" ${target?'id="item-scanner"':''} data-inventory-section="${category}" role="button" tabindex="0"><div class="inventory-section-card-top"><strong>${category}</strong><span class="badge ${stock<10?'orange':'green'}">${stock<10?'Low stock':'In stock'}</span></div><div class="inventory-section-card-meta"><span>${rows.length} item${rows.length===1?'':'s'}</span><span>${brands} brand${brands===1?'':'s'}</span><span>Stock ${stock}</span></div><div class="inventory-section-card-actions"><button class="tiny ghost">Open</button><button class="tiny ghost">+ Add</button><button class="btn soft tiny inventory-section-cart-btn"><i class="fa-solid fa-cart-shopping"></i><span>Cart</span></button>${target?'<button class="tiny ghost" id="editInventoryBtn"><i class="fa-solid fa-pen"></i></button><button class="tiny ghost" id="restockInventoryBtn"><i class="fa-solid fa-boxes-stacked"></i></button>':''}</div><div class="demo-inventory-products">${rows.map(r=>`<span><strong>${r.name}</strong><small>${r.brand} · ${r.sku} · ${r.qty} units · ${money(r.sell)}</small></span>`).join('')}</div></article>`; }).join('');
  return `<section id="goodsPanel" class="panel active"><div class="card section">
    ${sectionHead("Inventory", "Category → Brand → Type → Variant — add to cart, save proforma, then finalize.", `<button class="tiny ghost" id="inventoryDetailsBtn"><i class="fa-solid fa-chart-pie"></i> Details</button><div class="menu-wrap inventory-actions-wrap"><button class="icon-btn menu-trigger" id="inventoryActionsBtn"><i class="fa-solid fa-plus"></i></button><div class="menu-dropdown inventory-actions-menu ${state.inventoryMenuOpen ? 'demo-visible-menu' : ''}" id="inventoryActionsMenu"><button class="menu-item" id="addInventoryAction"><i class="fa-solid fa-box"></i> Add item</button><button class="menu-item"><i class="fa-solid fa-cash-register"></i> Create sale</button><button class="menu-item"><i class="fa-solid fa-cart-shopping"></i> Open cart</button><button class="menu-item"><i class="fa-solid fa-camera"></i> Scanner</button><button class="menu-item"><i class="fa-solid fa-barcode"></i> Product Barcodes</button><button class="menu-item"><i class="fa-solid fa-folder-open"></i> Saved carts</button><button class="menu-item"><i class="fa-solid fa-download"></i> Download CSV</button><button class="menu-item"><i class="fa-solid fa-file-pdf"></i> Download PDF report</button><button class="menu-item"><i class="fa-solid fa-file-excel"></i> Audit Report</button></div></div>`)}
    <div class="inventory-stock-toolbar"><button class="tiny ghost"><i class="fa-solid fa-cart-flatbed"></i> Carts</button><button class="tiny ghost">Customers <i class="fa-solid fa-arrow-right"></i></button><button class="tiny ghost"><i class="fa-solid fa-barcode"></i> Product Barcodes</button><button class="tiny ghost"><i class="fa-solid fa-camera"></i> Scanner</button><button class="tiny ghost"><i class="fa-solid fa-user-plus"></i> Add Customer</button><label class="inventory-grid-sort"><span class="inventory-grid-sort-label"><i class="fa-solid fa-arrow-down-short-wide"></i> Arrange</span><select class="select filter-inline-select"><option>Custom order</option><option>Name A–Z</option></select></label></div>
    <div class="filter-inline-row inventory-filter-row"><div class="filter-inline-section inventory-filter-layout"><span class="filter-inline-label">View</span><div class="inventory-layout-switch"><button class="inventory-layout-btn active">Category</button><button class="inventory-layout-btn">List</button></div></div><div class="filter-inline-section inventory-filter-search"><span class="filter-inline-label">Search</span><input class="input filter-inline-input" placeholder="Item, brand, variant…"></div><div class="filter-inline-section inventory-filter-brand"><span class="filter-inline-label">Brand</span><select class="select filter-inline-select"><option>All brands</option></select></div><div class="filter-inline-section inventory-filter-type"><span class="filter-inline-label">Type</span><select class="select filter-inline-select"><option>All</option></select></div><div class="filter-inline-section inventory-filter-status"><span class="filter-inline-label">Status</span><select class="select filter-inline-select"><option>In Stock</option><option>Low Stock</option><option>Sold</option></select></div></div>
    <div id="goodsList" class="list"><div class="inventory-sections-grid">${cards}<article class="inventory-section-card inventory-section-add-card"><div class="inventory-section-add-inner"><span class="inventory-section-add-plus">+</span><strong>Add category</strong><span>Create a new grid</span></div></article></div></div>
  </div></section>`;
}

function renderSales() {
  const scanner = state.inventory.find(row => row.id === "item-scanner");
  return `<section id="goodsPanel" class="panel active"><div class="card section">
    ${sectionHead("Inventory", "Create sale / cart workflow using live stock before finalizing an invoice.", '<button class="tiny ghost"><i class="fa-solid fa-arrow-left"></i> Inventory</button><button class="btn primary tiny" id="createSaleBtn"><i class="fa-solid fa-cart-plus"></i> Create Sale</button>')}
    <div class="demo-inventory-summary">${metricCard("Scanner stock", `${scanner?.qty || 0} units`, "Available before finalize")}${metricCard("Cart lines", String(state.cart.length), "Current draft")}${metricCard("Invoices", String(state.sales.length), "Finalized sales")}${metricCard("Collected", money(state.sales.reduce((s,r)=>s+r.paid,0)), "Wallet-linked payments")}</div>
    <div class="demo-inventory-layout"><div class="demo-stock-grid">${state.inventory.slice(-3).map(row=>`<article class="demo-stock-card"><div class="demo-stock-card-head"><span class="demo-badge green">${row.qty} available</span><button class="tiny ghost"><i class="fa-solid fa-cart-plus"></i></button></div><h4>${row.name}</h4><p>${row.brand} · ${row.category}</p><strong>${money(row.sell)}</strong><div class="demo-stock-meta"><span>SKU ${row.sku}</span><span>Cost ${money(row.cost)}</span></div></article>`).join("")}</div><article class="demo-cart" id="salesCart"><div class="demo-card-head"><strong>Sales Cart</strong><span class="demo-badge">Draft</span></div><div class="demo-cart-lines">${state.cart.length?state.cart.map(line=>`<div class="demo-cart-line"><span>${line.item} × ${line.qty}</span><strong>${money(line.total)}</strong></div>`).join(""):'<div class="empty">Cart is empty. Start Create Sale to add stock.</div>'}</div>${state.cart.length?`<div class="demo-cart-total"><span>Cart total</span><span>${money(state.cart.reduce((s,r)=>s+r.total,0))}</span></div>`:''}</article></div>
    <div class="demo-table-wrap" style="margin-top:8px"><table class="demo-table"><thead><tr><th>Invoice</th><th>Customer</th><th>Item</th><th>Qty</th><th>Total</th><th>Paid</th><th>Balance</th></tr></thead><tbody>${state.sales.length?state.sales.map((row,index)=>`<tr><td>INV-${String(index+1).padStart(4,'0')}</td><td>${row.customer}</td><td>${row.item}</td><td>${row.qty}</td><td>${money(row.total)}</td><td class="demo-positive">${money(row.paid)}</td><td class="demo-negative">${money(row.total-row.paid)}</td></tr>`).join(""):'<tr><td colspan="7">No finalized sale in this chapter yet.</td></tr>'}</tbody></table></div>
  </div></section>`;
}

function renderCustomers() {
  const totalOpen = state.customers.reduce((sum,row)=>sum+row.outstanding,0);
  return `<section id="goodsPanel" class="panel active"><div class="card section">
    <div class="inventory-customers-toolbar"><div class="inventory-customers-toolbar-nav"><button class="tiny ghost" type="button"><i class="fa-solid fa-arrow-left"></i> Inventory</button><button class="tiny ghost" type="button" id="addCustomerBtn"><i class="fa-solid fa-user-plus"></i> Add Customer</button></div><div class="inventory-customers-toolbar-title"><strong>Customers / Invoices</strong><span>Track outstanding payment invoices, settle balances, and open customer records.</span></div></div>
    <details class="inventory-outstanding-banner inventory-outstanding-panel" open><summary class="inventory-outstanding-top"><div><p>${state.customers.length} customers · ${state.customers.reduce((n,r)=>n+r.history.length,0)} history entries · ${state.customers.filter(r=>r.outstanding>0).length} open.</p></div><div class="inventory-outstanding-top-actions"><div class="inventory-outstanding-total"><small>Open balance</small><strong>${money(totalOpen)}</strong></div></div></summary>
      <div class="inventory-outstanding-body"><div class="inventory-outstanding-search"><div class="inventory-outstanding-search-box"><i class="fa-solid fa-magnifying-glass"></i><input class="input inventoryOutstandingSearchInput filter-inline-input" type="search" placeholder="Search name, mobile, company, email, invoice, or item"></div><button class="tiny" type="button">Search</button><button class="tiny ghost" type="button">Clear</button></div><div class="inventory-outstanding-members">
        ${state.customers.map(row=>{const total=row.outstanding+(row.name==='Alpine Retail'?200:row.name==='Horizon Trading'?1500:0);const paid=Math.max(0,total-row.outstanding);return `<details class="inventory-outstanding-member" id="${row.id}" open><summary><button class="inventory-outstanding-name" ${row.id==='customer-alpine'?'id="openCustomerBtn"':''} type="button">${row.name}</button><strong>${row.history.length} entries · ${row.outstanding>0?`${money(row.outstanding)} open`:'paid'}</strong></summary><div class="inventory-outstanding-list"><div class="inventory-outstanding-row"><div class="inventory-outstanding-main"><strong>${row.outstanding>0?'Customer invoices':'Paid customer record'}</strong><span>${row.company} · ${row.phone}</span></div><div class="inventory-outstanding-money"><small>Total</small><strong>${money(total)}</strong></div><div class="inventory-outstanding-money"><small>Paid</small><strong>${money(paid)}</strong></div><div class="inventory-outstanding-money ${row.outstanding>0?'is-due':''}"><small>Balance</small><strong>${money(row.outstanding)}</strong></div><div class="inventory-outstanding-actions"><button class="tiny" type="button">Open</button><button class="tiny ghost" type="button">Statement</button>${row.outstanding>0?'<button class="tiny ghost" type="button">Settle</button>':''}</div></div></div></details>`}).join("")}
      </div></div>
    </details>
  </div></section>`;
}

function renderAssets() {
  return `<section id="assetsPanel" class="panel active"><div class="card section"><div class="assets-module-tabs" role="tablist"><button class="assets-module-tab is-active" id="ownedAssetsModeBtn">Assets</button><button class="assets-module-tab" id="depAssetsModeBtn">Depreciation Assets</button></div>
    ${sectionHead("Assets", "Track owned assets, purchase value, invested/spent movement, revenue, sale position, net performance, and reports.", `<button class="tiny ghost" id="assetsDetailsBtn"><i class="fa-solid fa-chart-pie"></i> Details</button><div class="menu-wrap"><button class="tiny ghost">Reports ▾</button></div><button class="btn primary tiny" id="addAssetBtn"><i class="fa-solid fa-plus"></i> Add Asset</button>`)}
    ${filterRow("Name, type, notes", '<div class="filter-inline-section"><span class="filter-inline-label">Status</span><label class="filter-chip"><input type="radio" name="assetStatusFilter" value="all" checked> All</label><label class="filter-chip"><input type="radio" name="assetStatusFilter" value="active"> Active</label><label class="filter-chip"><input type="radio" name="assetStatusFilter" value="sold"> Sold</label><label class="filter-chip"><input type="radio" name="assetStatusFilter" value="disposed"> Disposed</label></div><div class="filter-inline-section"><span class="filter-inline-label">Currency</span><select class="select filter-inline-select"><option>All</option><option>AED</option></select></div>')}
    <div class="assets-list" style="margin-top:8px">${state.assets.map(row=>{const net=row.value-row.purchase; const tone=net>=0?'profit':'loss'; return `<article class="asset-card" id="${row.id}"><div class="asset-card-top"><button class="asset-card-main" type="button"><h4 class="asset-card-title">${row.name}</h4><div class="asset-card-meta"><span>${row.type}</span><span class="asset-status asset-status-active">${row.status}</span><span class="asset-card-owned">Owned · ongoing</span></div></button><div class="asset-card-aside"><div class="asset-card-net asset-net-${tone}"><small>Net</small><strong>${money(net)}</strong></div>${row.id==='asset-camera'?'<button class="icon-btn ghost tiny" id="editAssetBtn"><i class="fa-solid fa-pen"></i></button>':'<button class="icon-btn ghost tiny"><i class="fa-solid fa-ellipsis-vertical"></i></button>'}</div></div><button class="asset-card-stats" type="button"><span><em>Buy</em> ${money(row.purchase)}</span><span><em>Spent</em> ${money(Math.round(row.purchase*.05))}</span><span><em>Revenue</em> ${money(Math.max(0,Math.round(row.value-row.purchase*.82)))}</span><span><em>Current</em> ${money(row.value)}</span></button></article>`}).join('')}</div>
  </div></section>`;
}

function renderDepreciation() {
  return `<section id="assetsPanel" class="panel active"><div class="card section"><div class="assets-module-tabs" role="tablist"><button class="assets-module-tab" id="ownedAssetsModeBtn">Assets</button><button class="assets-module-tab is-active" id="depAssetsModeBtn">Depreciation Assets</button></div>
    ${sectionHead("Depreciation Assets", "Track depreciable cost, salvage value, useful life, accumulated depreciation, current book value, and schedule reporting.", '<button class="tiny ghost" id="depReportBtn"><i class="fa-solid fa-file-pdf"></i> Report</button><button class="btn primary tiny" id="addDepAssetBtn"><i class="fa-solid fa-plus"></i> Add Asset</button>')}
    ${filterRow("Name, type, description", '<div class="filter-inline-section"><span class="filter-inline-label">Method</span><select class="select filter-inline-select"><option>All methods</option><option>Straight line</option></select></div>')}
    <div class="assets-list" style="margin-top:8px">${state.depreciation.map(row=>{const pct=Math.round((row.accumulated/Math.max(1,row.cost-row.salvage))*100);return `<article class="asset-card dep-asset-card" id="${row.id}"><div class="asset-card-top"><button class="asset-card-main" type="button"><h4 class="asset-card-title">${row.name}</h4><div class="asset-card-meta"><span>${row.type}</span><span class="badge blue">${row.method}</span><span class="asset-card-owned">Useful life ${row.life} years</span></div></button><div class="asset-card-aside"><div class="asset-card-net"><small>Book value</small><strong>${money(row.book)}</strong></div><button class="icon-btn ghost tiny"><i class="fa-solid fa-ellipsis-vertical"></i></button></div></div><button class="asset-card-stats" type="button"><span><em>Cost</em> ${money(row.cost)}</span><span><em>Salvage</em> ${money(row.salvage)}</span><span><em>Accumulated</em> ${money(row.accumulated)}</span><span><em>Progress</em> ${pct}%</span></button>${row.id==='dep-camera'?'<div class="demo-actions demo-card-footer-actions"><button class="tiny ghost" id="openDepScheduleBtn"><i class="fa-solid fa-list-ol"></i> Schedule</button></div>':''}</article>`}).join('')}</div>
  </div></section>`;
}

function loanCards(mode) {
  return state.loans.filter(row=>row.direction===mode).map(row=>{const paid=row.principal-row.remaining;const p=Math.min(100,Math.round(paid/row.principal*100));const action=row.id==='loan-demo-given'?'givenPaymentBtn':row.id==='loan-demo-taken'?'takenPaymentBtn':'';const status=row.remaining===0?'Closed':row.status;const statusClass=status==='Closed'?'green':status==='Partial'?'orange':'blue';return `<details class="loan" id="${row.id}" open><summary><div class="loan-top"><div class="lt-main"><div class="loan-name"><i class="fa-solid fa-user"></i> ${row.name}</div><div class="loan-sub"><span>30 Aug 2026</span><span>AED</span><span class="badge ${statusClass}">${status}</span></div></div><div class="cell lt-status"><small>Status</small><strong><span class="badge ${statusClass}">${status}</span></strong></div><div class="cell lt-principal"><small>Principal</small><strong>${money(row.principal)}</strong></div><div class="cell lt-movement"><small>${mode==='given'?'Received back':'Returned back'}</small><strong>${money(paid)}</strong></div><div class="cell lt-remaining"><small>Remaining</small><strong>${money(row.remaining)}</strong></div><div class="lt-action"><div class="card-action-grid loan-inline-actions">${action&&row.remaining>0?`<button class="icon-btn ghost" id="${action}" type="button" title="Record payment"><i class="fa-solid fa-plus"></i></button>`:''}<button class="icon-btn ghost" type="button">▾</button><button class="icon-btn ghost" type="button">☰</button></div></div></div></summary><div class="detail"><div class="detail-head"><div><h4>Timeline</h4><p>Oldest to newest inside this loan record.</p></div><span class="badge ${statusClass}">${p}% settled</span></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Remaining</th><th>Notes</th></tr></thead><tbody><tr><td>12 Aug 2026</td><td><span class="badge blue">Principal</span></td><td>${money(row.principal)}</td><td>${money(row.principal)}</td><td>Opening loan</td></tr>${paid?`<tr><td>26 Aug 2026</td><td><span class="badge green">${mode==='given'?'Received':'Returned'}</span></td><td>${money(paid)}</td><td>${money(row.remaining)}</td><td>Partial settlement</td></tr>`:''}</tbody></table></div></div></details>`}).join('');
}

function renderLoans() {
  const mode=state.loanMode;
  const open=state.loans.reduce((s,r)=>s+r.remaining,0);
  return `<section class="overview main-overview-section" id="mainOverview"><div class="overview-top"><div><h3>Loans Overview</h3><p>Loan balances shown by currency.</p></div><div class="tools"><span class="badge blue">AED ${open.toLocaleString()}</span><button class="icon-btn ghost">▼</button></div></div><div class="main-overview-content"><div class="overview-grid"><div class="summary"><small>Given open</small><strong>${money(state.loans.filter(r=>r.direction==='given').reduce((s,r)=>s+r.remaining,0))}</strong></div><div class="summary"><small>Taken open</small><strong>${money(state.loans.filter(r=>r.direction==='taken').reduce((s,r)=>s+r.remaining,0))}</strong></div></div></div></section><section id="${mode==='given'?'givenPanel':'takenPanel'}" class="panel active demo-real-section-gap"><div class="card section"><div class="loan-mode-switch" role="tablist"><button class="loan-mode-btn ${mode==='given'?'active':''}" id="givenModeBtn">Loan Given / Received Back</button><button class="loan-mode-btn ${mode==='taken'?'active':''}" id="takenModeBtn">Loan Taken / Returned Back</button></div>
    ${sectionHead(mode==='given'?"Loan Given / Received Back":"Loan Taken / Returned Back", "Loans are sorted by the latest user-entered payment date, newest first.", `<button class="tiny ghost" id="loansDetailsBtn"><i class="fa-solid fa-chart-pie"></i> Details</button><div class="menu-wrap"><button class="tiny ghost" id="newLoanBtn">New Entry ▾</button></div>`)}
    ${filterRow("Name or note", '<div class="filter-inline-section"><span class="filter-inline-label">Status</span><select class="select filter-inline-select"><option>All</option><option>Open/Partial</option><option>Closed</option></select></div><div class="filter-inline-section"><span class="filter-inline-label">Currency</span><select class="select filter-inline-select"><option>All</option><option>AED</option></select></div>')}
    <div class="list demo-loan-list" style="margin-top:8px">${loanCards(mode)}</div>
  </div></section>`;
}

function renderInstallments() {
  return `<section id="installmentsPanel" class="panel active"><div class="card section">
    ${sectionHead("Installment Plans", "People moved here from taken loans can be tracked as installment plans with schedule, payment, reminder, and statement actions.", '<button class="tiny ghost" id="installmentDetailsBtn"><i class="fa-solid fa-chart-pie"></i> Details</button><div class="menu-wrap"><button class="tiny ghost" id="addInstallmentBtn">New Entry ▾</button></div>')}
    ${filterRow("Name or note", '<div class="filter-inline-section"><span class="filter-inline-label">Status</span><select class="select filter-inline-select"><option>All</option><option>Open/Partial</option><option>Closed</option></select></div><div class="filter-inline-section"><span class="filter-inline-label">Currency</span><select class="select filter-inline-select"><option>All</option><option>AED</option></select></div>')}
    <div id="installmentsList" class="list demo-installment-list">${state.installments.map(row=>{const rem=Math.max(0,row.total-row.paid);const pct=Math.round(row.paid/row.total*100);const paidCount=Math.round((row.count||1)*pct/100);return `<article class="loan installment-plan-card" id="${row.id}" tabindex="0"><div class="ip-card"><div class="ip-card-head"><div class="ip-card-title"><div class="loan-name"><i class="fa-solid fa-calendar-check"></i><span>${row.name}</span><span class="badge ${rem===0?'green':'orange'}">${rem===0?'Closed':row.status}</span></div><div class="ip-card-meta"><span>12 Aug 2026</span><span>AED</span><span>${paidCount}/${row.count} paid</span><span>${money(row.total/row.count)} / mo</span></div></div><div class="ip-card-actions"><div class="menu-wrap">${row.id==='plan-equipment'&&rem>0?'<button class="icon-btn ghost menu-trigger person-menu-btn" id="installmentPaymentBtn"><i class="fa-solid fa-plus"></i></button>':'<button class="icon-btn ghost menu-trigger person-menu-btn">☰</button>'}</div></div></div><div class="ip-card-metrics"><div class="ip-metric"><small>Total</small><strong>${money(row.total)}</strong></div><div class="ip-metric"><small>Paid</small><strong>${money(row.paid)}</strong></div><div class="ip-metric"><small>Remaining</small><strong>${money(rem)}</strong></div><div class="ip-metric"><small>Next</small><strong>${rem?'#'+Math.min(row.count,paidCount+1)+' · 30 Sep':'Paid in full'}</strong></div></div><div class="ip-progress"><div class="ip-progress-track"><div class="ip-progress-fill" style="width:${pct}%"></div></div><div class="ip-progress-label"><span>${pct}% paid</span><span>Tap to open</span></div></div></div></article>`}).join('')}</div>
  </div></section>`;
}

function renderNotes() {
  return `<section id="notesPanel" class="panel active"><div class="card section">
    <div class="section-head notes-section-head"><div class="section-head-top"><div class="title-group"><div class="title-row"><h3>Notes</h3><div class="menu-wrap"><button class="btn ghost menu-trigger" type="button">Actions ▾</button></div></div><p>Capture ideas, decisions, and reminders in one organized workspace.</p></div><div class="tools notes-head-actions"><button id="newNoteBtn" class="btn primary" type="button"><i class="fa-solid fa-plus"></i> New Note</button></div></div><div class="filter-inline-row compact-filter-row"><div class="compact-filter-main"><div class="filter-inline-section compact-filter-search"><span class="filter-inline-label">Search</span><input id="searchNotes" class="input filter-inline-input" placeholder="Search notes..."></div></div></div></div>
    <div id="notesList" class="notes-grid" aria-live="polite">${state.notes.map(row=>`<div class="card note-grid-card" ${row.id==='note-demo'?'id="openNoteBtn"':''} role="button" tabindex="0" title="${row.title}"><span class="note-grid-title">${row.title}</span>${row.reminder?'<i class="fa-solid fa-bell demo-note-reminder" aria-hidden="true"></i>':''}</div>`).join("")}</div>
  </div></section>`;
}

function renderBitcoin() {
  return `<section id="bitcoinPanel" class="panel active"><div class="card section">
    ${sectionHead("Bitcoin Wallet", "Import a WIF, use watch-only mode, or create a wallet. Sensitive key operations remain client-side; this public demo uses a watch-only fictional address.", '<div class="menu-wrap"><button class="btn ghost tiny">Actions ▾</button></div><button class="tiny ghost" id="btcStatementBtn"><i class="fa-solid fa-file-lines"></i> Statement</button>')}
    <div class="demo-btc-security"><i class="fa-solid fa-triangle-exclamation"></i><span>This demo never exposes a private key or seed phrase. Production key material remains in the browser on the user’s device.</span></div>
    <div class="btc-wallet-type-grid demo-btc-types"><button class="btn ghost btc-wallet-type-btn">WIF</button><button class="btn primary btc-wallet-type-btn active">Watch</button><button class="btn ghost btc-wallet-type-btn">Seed</button></div>
    <div class="btc-wallets-list demo-btc-real-grid"><article class="btc-wallet-card demo-btc-wallet"><div class="loan-top"><div class="lt-main"><div class="loan-name"><i class="fa-brands fa-bitcoin"></i> Operations BTC <span class="badge green">Watch-only</span></div><div class="loan-sub"><span>Native SegWit</span><span>Mainnet</span><span>Updated now</span></div></div><div class="cell lt-principal"><small>Balance</small><strong>0.042816 BTC</strong></div><div class="cell lt-movement"><small>Sample value</small><strong>USD 4,612.18</strong></div></div><div class="btc-wallet-details is-watch-only"><div class="btc-detail-line"><span class="btc-detail-label">Receive address</span><div class="btc-detail-address" id="bitcoinAddress">bc1qtriplemdemo7safewatchonly9q4v8x2</div></div><div class="demo-actions"><button class="btn primary tiny" id="receiveBitcoinBtn"><i class="fa-solid fa-qrcode"></i> Receive Bitcoin</button><button class="btn ghost tiny" id="copyBitcoinBtn"><i class="fa-solid fa-copy"></i> Copy</button></div><div class="demo-key-warning" id="bitcoinKeyNotice"><i class="fa-solid fa-key"></i><span>Private keys and seed phrases are intentionally absent from this public demo.</span></div></div></article>
    <article class="loan demo-btc-transactions"><div class="detail-head"><div><h4>Transaction History</h4><p>Confirmed incoming and outgoing Bitcoin activity for this wallet.</p></div><span class="badge green">Confirmed</span></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Status</th><th>Amount</th></tr></thead><tbody><tr class="btc-transaction-row"><td>28 Aug</td><td>Received</td><td><span class="badge green">8 confirmations</span></td><td class="demo-positive">+0.0125 BTC</td></tr><tr class="btc-transaction-row"><td>24 Aug</td><td>Sent</td><td><span class="badge green">Confirmed</span></td><td class="demo-negative">−0.0042 BTC</td></tr><tr class="btc-transaction-row"><td>17 Aug</td><td>Received</td><td><span class="badge green">Confirmed</span></td><td class="demo-positive">+0.0345 BTC</td></tr></tbody></table></div></article></div>
  </div></section>`;
}

function renderMessages() {
  return `<section id="messagesPanel" class="panel active"><div class="card section messages-section"><div class="section-head"><div class="section-head-top"><div class="title-group"><div class="title-row"><h3 id="messagesPanelTitle">Messages</h3></div><p id="messagesPanelSubtitle">Message the administrator — replies appear in this conversation view.</p></div><div class="tools"><button class="btn soft" id="messagesNewBtn" type="button"><i class="fa-solid fa-pen-to-square"></i> New message</button><button class="btn ghost" type="button"><i class="fa-solid fa-rotate"></i> Refresh</button></div></div></div>
    <div class="messages-workspace messages-conversation-open"><aside class="messages-sidebar"><div id="messagesThreadList" class="messages-thread-list"><button type="button" class="messages-thread-item active unread" id="supportThread"><div class="thread-item-top"><strong>Triplem VIP Support</strong><span class="thread-time">09:18</span></div><div class="thread-item-subject">Inventory audit report guidance</div><div class="thread-item-preview">Open Inventory, use the + menu, then choose Audit Report.</div><div class="thread-item-meta"><span class="message-status-pill open">open</span><span class="thread-unread-dot"></span></div></button><button type="button" class="messages-thread-item"><div class="thread-item-top"><strong>Account</strong><span class="thread-time">Yesterday</span></div><div class="thread-item-subject">Workspace access confirmation</div><div class="thread-item-preview">Your workspace is ready.</div><div class="thread-item-meta"><span class="message-status-pill read">read</span></div></button></div></aside>
      <section class="messages-conversation" id="messagesConversation"><div id="messagesThreadActive" class="messages-thread-active"><header class="messages-thread-header" id="messagesThreadHeader"><div class="messages-thread-header-top"><button type="button" class="btn ghost messages-thread-back"><i class="fa-solid fa-arrow-left"></i> Back</button></div><div class="messages-thread-header-main"><div><h4>Inventory audit report guidance</h4><p>Triplem VIP Support · Administrator</p></div><span class="message-status-pill open">open</span></div></header><div class="messages-chat-scroll" id="messagesChatScroll">${state.messages.map(m=>`<div class="chat-bubble-row ${m.mine?'mine':'theirs'}"><div class="chat-bubble ${m.mine?'from-user':'from-admin'}"><div class="chat-bubble-meta"><strong>${m.who}</strong><span>${m.time}</span></div><div class="chat-bubble-body">${m.text}</div></div></div>`).join("")}</div><footer class="messages-reply-bar" id="messagesReplyBar"><textarea id="messagesReplyInput" class="input" rows="2" maxlength="4000" placeholder="Write a reply…"></textarea><div class="messages-reply-actions"><button type="button" class="btn primary" id="messagesReplySendBtn"><i class="fa-solid fa-paper-plane"></i> Send</button></div></footer></div></section>
    </div>
  </div></section>`;
}

function renderReports() {
  return `<section id="dashboardPanel" class="panel active"><div class="card section">
    ${sectionHead("Reports & Exports", "Generate section-level or complete workspace reports using the same records shown in this demo.", '<span class="demo-badge">Safe sample</span>')}
    <div class="demo-report-layout"><article class="demo-report-options"><h4>Generate report</h4><div class="demo-report-fields"><label class="demo-form-field"><span>Report area</span><select class="select" id="reportSection"><option value="expenses">Expenses</option><option value="inventory">Inventory</option><option value="assets">Assets</option><option value="loans">Loans</option><option value="all">All Sections</option></select></label><label class="demo-form-field"><span>Report style</span><select class="select" id="reportStyle"><option value="summary">Summary</option><option value="detailed">Detailed</option></select></label><label class="demo-form-field"><span>Currency</span><select class="select"><option>AED</option><option>All currencies</option></select></label><button class="btn primary" id="generateReportBtn"><i class="fa-solid fa-wand-magic-sparkles"></i> Generate report</button>${state.reportGenerated?'<button class="btn soft" id="downloadReportBtn"><i class="fa-solid fa-file-arrow-down"></i> Download PDF</button>':''}</div></article><article class="demo-report-preview" id="reportPreview">${state.reportGenerated?reportPreviewHtml():'<div class="empty" style="min-height:340px;display:grid;place-items:center"><div style="text-align:center"><i class="fa-regular fa-file-pdf" style="font-size:2rem;color:var(--primary)"></i><p>Choose options and generate a report preview.</p></div></div>'}</article></div>
  </div></section>`;
}

function reportPreviewHtml() {
  return `<div class="demo-report-head"><strong>TRIPLEM VIP · Detailed Report</strong><span>Generated 30 Aug 2026</span></div><div class="demo-report-summary"><div><small>Wallet balance</small><strong>${money(totalWalletBalance())}</strong></div><div><small>Expenses</small><strong>${money(totalExpenses())}</strong></div><div><small>Outstanding</small><strong>${money(totalOutstanding())}</strong></div></div><div class="demo-table-wrap"><table class="demo-table"><thead><tr><th>Section</th><th>Records</th><th>Value</th><th>Status</th></tr></thead><tbody><tr><td>Expenses</td><td>${state.expenses.length}</td><td>${money(totalExpenses())}</td><td><span class="demo-badge green">Ready</span></td></tr><tr><td>Inventory</td><td>${state.inventory.length}</td><td>${money(stockValue())}</td><td><span class="demo-badge green">Ready</span></td></tr><tr><td>Assets</td><td>${state.assets.length}</td><td>${money(totalAssetValue())}</td><td><span class="demo-badge green">Ready</span></td></tr><tr><td>Loans</td><td>${state.loans.length}</td><td>${money(state.loans.reduce((s,r)=>s+r.remaining,0))}</td><td><span class="demo-badge green">Ready</span></td></tr></tbody></table></div>`;
}

const RENDERERS = { dashboard:renderDashboard, wallets:renderWallets, expenses:renderExpenses, inventory:renderInventory, sales:renderSales, customers:renderCustomers, assets:renderAssets, depreciation:renderDepreciation, loans:renderLoans, installments:renderInstallments, notes:renderNotes, bitcoin:renderBitcoin, messages:renderMessages, reports:renderReports };

function field(id, label, type = "text", value = "", full = false) {
  return `<label class="demo-form-field ${full ? "full" : ""}"><span>${label}</span><input class="input" id="${id}" type="${type}" value="${value}"></label>`;
}
function selectField(id, label, options, full = false) { return `<label class="demo-form-field ${full ? "full" : ""}"><span>${label}</span><select class="select" id="${id}">${options}</select></label>`; }
function textareaField(id, label, value = "") { return `<label class="demo-form-field full"><span>${label}</span><textarea class="input" id="${id}">${value}</textarea></label>`; }

function openForm({ kicker = "New entry", title, body, primary = "Save", primaryId = "modalSaveBtn" }) {
  $("#demoModalKicker").textContent = kicker;
  $("#demoModalTitle").textContent = title;
  $("#demoModalBody").innerHTML = `<div class="demo-form-grid">${body}</div>`;
  $("#demoModalActions").innerHTML = `<button class="btn ghost" type="button" data-demo-close>Cancel</button><button class="btn primary" type="button" id="${primaryId}">${primary}</button>`;
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
function showToast(message) { clearTimeout(toastTimer); $("#demoToast span").textContent = message; $("#demoToast").classList.add("show"); toastTimer = setTimeout(() => $("#demoToast").classList.remove("show"), 2600); }

function setProgress(value) {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  $("#progressBar").style.width = `${safe}%`;
  $("#progressValue").textContent = `${Math.round(safe)}%`;
  $(".progress-track").setAttribute("aria-valuenow", String(Math.round(safe)));
}

function setCue(stepIndex, percent, stateName = "Running") {
  const module = currentModule();
  currentTutorialStep = Math.max(-1, Math.min(module.steps.length - 1, stepIndex));
  const step = module.steps[currentTutorialStep] || ["Ready when you are", `Press Play to watch ${module.label}.`];
  $("#coachTitle").textContent = step[0];
  $("#coachText").textContent = step[1];
  setProgress(percent);
  const host = $("#coachState");
  host.classList.toggle("is-running", stateName === "Running");
  host.classList.toggle("is-paused", stateName === "Paused");
  $("#coachState span:last-child").textContent = stateName;
  renderTutorial();
}

class Cancelled extends Error {}
function assertToken(token) { if (token !== playback.token) throw new Cancelled(); }
function rawWait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function wait(ms, token) {
  let remaining = Math.max(20, ms / playbackSpeed);
  while (remaining > 0) {
    assertToken(token);
    if (playback.paused) { await rawWait(90); continue; }
    const slice = Math.min(remaining, 60);
    await rawWait(slice);
    remaining -= slice;
  }
}

function ensurePointerLabel() {
  let label = $("#demoPointerLabel");
  if (!label) {
    label = document.createElement("div");
    label.id = "demoPointerLabel";
    label.className = "demo-pointer-label";
    label.setAttribute("aria-hidden", "true");
    document.body.appendChild(label);
  }
  return label;
}

function hidePointerLabel() {
  const label = $("#demoPointerLabel");
  if (label) label.classList.remove("show");
}

function visiblePointFor(el) {
  const rect = el.getBoundingClientRect();
  const margin = 16;
  const left = Math.max(margin, rect.left);
  const right = Math.min(window.innerWidth - margin, rect.right);
  const top = Math.max(margin, rect.top);
  const bottom = Math.min(window.innerHeight - margin, rect.bottom);
  const x = left <= right ? left + Math.max(3, (right-left) * 0.5) : Math.max(margin, Math.min(window.innerWidth-margin, rect.left + rect.width/2));
  const y = top <= bottom ? top + Math.max(3, (bottom-top) * 0.5) : Math.max(margin, Math.min(window.innerHeight-margin, rect.top + rect.height/2));
  return { x, y, rect };
}

function positionPointerLabel(el) {
  const label = ensurePointerLabel();
  const module = currentModule();
  const item = module.steps[currentTutorialStep] || [module.label, "Follow the highlighted control in the live product preview."];
  label.innerHTML = `<strong>${item[0]}</strong><span>${item[1]}</span>`;
  label.classList.add("show");
  const { rect } = visiblePointFor(el);
  const box = label.getBoundingClientRect();
  let left = rect.left + Math.min(rect.width * .18, 28);
  let top = rect.bottom + 10;
  if (top + box.height > window.innerHeight - 10) top = rect.top - box.height - 10;
  if (top < 8) top = 8;
  left = Math.max(8, Math.min(window.innerWidth - box.width - 8, left));
  label.style.left = `${left}px`;
  label.style.top = `${top}px`;
}

async function moveCursor(selector, token) {
  assertToken(token);
  const el = $(selector);
  if (!el) return null;
  el.scrollIntoView({ block: "center", inline: "center", behavior: reducedMotion ? "auto" : "smooth" });
  await wait(reducedMotion ? 280 : 620, token);
  assertToken(token);
  const { x, y } = visiblePointFor(el);
  const cursor = $("#demoCursor");
  cursor.classList.add("visible");
  cursor.style.left = `${Math.round(x)}px`;
  cursor.style.top = `${Math.round(y)}px`;
  cursor.style.transform = "translate3d(-2px,-2px,0)";
  el.classList.add("demo-hover-target");
  positionPointerLabel(el);
  await wait(reducedMotion ? 360 : 920, token);
  el.classList.remove("demo-hover-target");
  return el;
}

async function demoClick(selector, token) {
  const el = await moveCursor(selector, token);
  if (!el) return null;
  el.classList.add("demo-target");
  $("#demoCursor").classList.add("clicking");
  await wait(320, token);
  $("#demoCursor").classList.remove("clicking");
  el.classList.remove("demo-target");
  return el;
}

async function demoType(selector, value, token) {
  const el = await moveCursor(selector, token);
  if (!el) return;
  el.focus(); el.value = ""; el.classList.add("demo-target");
  for (const char of String(value)) {
    assertToken(token);
    el.value += char;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    await wait(48 + Math.random() * 26, token);
  }
  await wait(220, token);
  el.classList.remove("demo-target");
}

async function demoSelect(selector, value, token) {
  const el = await demoClick(selector, token);
  if (!el) return;
  el.value = value;
  el.dispatchEvent(new Event("change", { bubbles: true }));
  await wait(420, token);
}

async function step(index, percent, token, pause = 1650) { setCue(index, percent); await wait(pause, token); }

async function runDashboard(token) {
  await step(0, 6, token); await demoClick(".demo-summary-card:nth-child(1)", token);
  await step(1, 24, token); await demoClick("#dashboardCurrencyBtn", token);
  await step(2, 45, token); await demoClick("#dashboardChart", token);
  await step(3, 68, token); await demoClick("#dashboardActivity .demo-activity-row:nth-child(2)", token);
  await step(4, 90, token); await demoClick("#dashboardDetailsBtn", token); openInfoModal({ title:"Dashboard Details", body:`<div class="demo-report-summary"><div><small>Money in</small><strong>${money(52500)}</strong></div><div><small>Money out</small><strong>${money(23800)}</strong></div><div><small>Net movement</small><strong>${money(28700)}</strong></div></div><div class="demo-chart-bars" style="height:180px"><span style="--h:70%" data-label="Wallets"></span><span style="--h:35%" data-label="Expenses"></span><span style="--h:58%" data-label="Assets"></span><span style="--h:43%" data-label="Loans"></span></div>` }); await wait(1500,token); closeModal();
}

async function runWallets(token) {
  await step(0, 5, token); await demoClick("#toggleWalletsBtn",token); state.walletsCollapsed=false; renderModule(); await wait(700,token);
  await step(1, 18, token); state.inventoryMenuOpen=true; renderModule(); await demoClick("#addWalletAction",token); openForm({title:"Add Expense Account",body:`${field("walletName","Account name")}${selectField("walletType","Account type",'<option value="Bank">Bank</option><option value="Cash">Cash</option>')}${selectField("walletCurrency","Currency",'<option>AED</option><option>SAR</option><option>USD</option>')}${field("walletOpening","Opening balance","number")}`}); await demoType("#walletName","Petty Cash",token); await demoSelect("#walletType","Cash",token); await demoType("#walletOpening","2500",token); await demoClick("#modalSaveBtn",token); closeModal(); state.wallets.push({id:"studio",name:"Petty Cash",type:"Cash",currency:"AED",balance:2500,topups:2500,spent:0}); state.inventoryMenuOpen=false; renderModule(); showToast("Wallet created successfully");
  await step(2, 38, token); state.inventoryMenuOpen=true; renderModule(); await demoClick("#addMoneyAction",token); openForm({title:"Add Money",body:`${selectField("topupWallet","Wallet",walletOptions("studio"))}${field("topupAmount","Amount","number")}${field("topupDate","Date","date","2026-08-30")}`}); await demoType("#topupAmount","600",token); await demoClick("#modalSaveBtn",token); closeModal(); {const w=state.wallets.find(r=>r.id==='studio');w.balance+=600;w.topups+=600;} state.inventoryMenuOpen=false; renderModule(); showToast("Money added to Petty Cash");
  await step(3, 58, token); state.inventoryMenuOpen=true; renderModule(); await demoClick("#transferAction",token); openForm({title:"Transfer Money",body:`${selectField("transferFrom","From wallet",walletOptions("studio"))}${selectField("transferTo","To wallet",walletOptions("bank"))}${field("transferAmount","Amount","number")}${field("transferNote","Note")}`,primary:"Transfer"}); await demoSelect("#transferFrom","studio",token); await demoSelect("#transferTo","bank",token); await demoType("#transferAmount","400",token); await demoType("#transferNote","Till settlement",token); await demoClick("#modalSaveBtn",token); closeModal(); state.wallets.find(r=>r.id==='studio').balance-=400;state.wallets.find(r=>r.id==='bank').balance+=400;state.transfers.unshift({date:"30 Aug 2026",from:"studio",to:"bank",amount:400,note:"Till settlement"});state.inventoryMenuOpen=false;renderModule();showToast("AED 400.00 transferred successfully");
  await step(4, 78, token); await demoClick("#walletFilter",token);
  await step(5, 94, token); await demoClick("#wallet-studio",token);
}

async function runExpenses(token) {
  await step(0, 5, token); await demoClick("#expenseEntryBtn",token); $("#expenseEntryMenu")?.classList.add("demo-visible-menu"); await wait(850,token); await demoClick("#addExpenseAction",token); openForm({title:"Expense",body:`${selectField("expenseWallet","Wallet",walletOptions("cash"))}${field("expenseItem","Item")}${field("expenseAmount","Amount","number")}${field("expenseDate","Date","date","2026-08-30")}${field("expenseNote","Note","text","",true)}`}); await demoType("#expenseItem","Printer supplies",token); await demoType("#expenseAmount","185",token); await demoType("#expenseNote","Paper, labels and ink",token); await demoClick("#modalSaveBtn",token); closeModal(); state.expenses.unshift({id:"exp-demo",item:"Printer supplies",wallet:"cash",amount:185,date:"30 Aug 2026",note:"Paper, labels and ink"}); state.wallets.find(r=>r.id==='cash').balance-=185; renderModule(); showToast("Expense saved · Cash balance updated");
  await step(1, 24, token); await demoClick("#expense-exp-demo",token);
  await step(2, 42, token); await demoClick("#transactionHistorySummary",token); state.expenseHistoryOpen=true; renderModule(); await wait(850,token);
  await step(3, 60, token); await demoClick("#expenseDownloadBtn",token); state.expenseDownloadOpen=true; renderModule(); await wait(1100,token); await demoClick("#detailedReportOption",token); showToast("Detailed Expenses report selected"); state.expenseDownloadOpen=false; renderModule();
  await step(4, 77, token); await demoClick("#editExpenseBtn",token); openForm({kicker:"Edit",title:"Printer supplies",body:`${field("editExpenseItem","Item","text","Printer supplies")}${field("editExpenseAmount","Amount","number","185")}${field("editExpenseNote","Note","text","Paper, labels and ink",true)}`,primary:"Save changes"}); await demoType("#editExpenseAmount","210",token); await demoClick("#modalSaveBtn",token); closeModal(); state.expenses.find(r=>r.id==='exp-demo').amount=210;state.wallets.find(r=>r.id==='cash').balance-=25;state.expenseHistoryOpen=true;renderModule();showToast("Expense updated to AED 210.00");
  await step(5, 92, token); await demoClick("#expensesDetailsBtn",token); openInfoModal({title:"Expenses Details",body:`<div class="demo-report-summary"><div><small>Transactions</small><strong>${state.expenses.length}</strong></div><div><small>Total spent</small><strong>${money(totalExpenses())}</strong></div><div><small>Largest item</small><strong>${money(Math.max(...state.expenses.map(r=>r.amount)))}</strong></div></div><div class="demo-chart-bars" style="height:170px"><span style="--h:75%" data-label="Rent"></span><span style="--h:35%" data-label="Utilities"></span><span style="--h:22%" data-label="Travel"></span><span style="--h:28%" data-label="Supplies"></span></div>`}); await wait(1500,token); closeModal();
}

async function runInventory(token) {
  await step(0, 4, token); await demoClick("#inventoryActionsBtn",token); state.inventoryMenuOpen=true; renderModule(); await wait(1000,token);
  await step(1, 17, token); await demoClick("#addInventoryAction",token); openForm({title:"Add item",body:`${field("inventoryName","Item name")}${field("inventoryBrand","Brand")}${selectField("inventoryCategory","Category",'<option>Electronics</option><option>General</option><option>Perfume</option>')}${field("inventoryQty","Stock quantity","number")}${field("inventoryCost","Unit cost","number")}${field("inventorySell","Selling price","number")}${field("inventorySku","SKU","text","",true)}`}); await demoType("#inventoryName","Wireless Scanner",token); await demoType("#inventoryBrand","Triplem Supply",token); await demoType("#inventoryQty","10",token); await demoType("#inventoryCost","120",token); await demoType("#inventorySell","180",token); await demoType("#inventorySku","TM-SCN-01",token); await demoClick("#modalSaveBtn",token); closeModal(); state.inventory.push({id:"item-scanner",name:"Wireless Scanner",brand:"Triplem Supply",qty:10,cost:120,sell:180,category:"Electronics",sku:"TM-SCN-01"});state.inventoryMenuOpen=false;renderModule();showToast("Inventory item saved · 10 units in stock");
  await step(2, 37, token); await demoClick(".filter-inline-input",token);
  await step(3, 51, token); await demoClick("#item-scanner",token);
  await step(4, 65, token); await demoClick("#editInventoryBtn",token); openForm({kicker:"Edit item",title:"Wireless Scanner",body:`${field("inventoryEditName","Item name","text","Wireless Scanner")}${field("inventoryEditSell","Selling price","number","180")}`,primary:"Save changes"}); await demoType("#inventoryEditSell","190",token); await demoClick("#modalSaveBtn",token); closeModal(); state.inventory.find(r=>r.id==='item-scanner').sell=190;renderModule();showToast("Selling price updated to AED 190.00");
  await step(5, 79, token); await demoClick("#restockInventoryBtn",token); openForm({title:"Additional stock",body:`${field("restockQty","Quantity","number")}${field("restockCost","Unit cost","number","120")}`,primary:"Add stock"}); await demoType("#restockQty","2",token); await demoClick("#modalSaveBtn",token); closeModal();state.inventory.find(r=>r.id==='item-scanner').qty=12;renderModule();showToast("Stock updated · 12 units available");
  await step(6, 93, token); await demoClick("#inventoryDetailsBtn",token); openInfoModal({title:"Inventory Details",body:`<div class="demo-report-summary"><div><small>Catalog items</small><strong>${state.inventory.length}</strong></div><div><small>Units</small><strong>${state.inventory.reduce((s,r)=>s+r.qty,0)}</strong></div><div><small>Stock cost</small><strong>${money(stockValue())}</strong></div></div><div class="demo-chart-bars" style="height:170px"><span style="--h:58%" data-label="Perfume"></span><span style="--h:85%" data-label="General"></span><span style="--h:48%" data-label="Tech"></span></div>`}); await wait(1500,token); closeModal();
}

async function runSales(token) {
  await step(0, 6, token); await demoClick("#createSaleBtn",token); openForm({title:"Create Sale",body:`${selectField("saleItem","Inventory item",state.inventory.map(r=>`<option value="${r.id}">${r.name} · ${r.qty} in stock</option>`).join(""))}${field("saleQty","Quantity","number")}${field("saleCustomer","Customer name")}${field("salePaid","Paid amount","number")}${selectField("saleWallet","Payment wallet",walletOptions("bank"))}`,primary:"Review Cart"});
  await step(1, 20, token); await demoSelect("#saleItem","item-scanner",token); await demoType("#saleQty","2",token); state.cart=[{item:"Wireless Scanner",qty:2,total:380}];
  await step(2, 37, token); await demoType("#saleCustomer","Alpine Retail",token);
  await step(3, 54, token); await demoType("#salePaid","200",token); await demoSelect("#saleWallet","bank",token);
  await step(4, 70, token); await demoClick("#modalSaveBtn",token); closeModal(); renderModule(); await demoClick("#salesCart",token); await wait(1000,token); openInfoModal({kicker:"Invoice preview",title:"INV-0002 · Alpine Retail",body:`<div class="demo-report-summary"><div><small>Subtotal</small><strong>${money(380)}</strong></div><div><small>Paid now</small><strong>${money(200)}</strong></div><div><small>Balance</small><strong>${money(180)}</strong></div></div><div class="demo-table-wrap"><table class="demo-table"><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Total</th></tr></thead><tbody><tr><td>Wireless Scanner</td><td>2</td><td>${money(190)}</td><td>${money(380)}</td></tr></tbody></table></div>`,primary:"Finalize Sale",primaryId:"finalizeSaleBtn"});
  await step(5, 88, token); await demoClick("#finalizeSaleBtn",token); closeModal();state.inventory.find(r=>r.id==='item-scanner').qty-=2;state.sales.push({id:"sale-demo",item:"Wireless Scanner",customer:"Alpine Retail",qty:2,total:380,paid:200,profit:140});state.wallets.find(r=>r.id==='bank').balance+=200;state.cart=[];renderModule();showToast("Sale finalized · Stock, wallet, invoice and profit updated");
}

async function runCustomers(token) {
  await step(0, 7, token); await demoClick(".inventory-customers-toolbar-title strong",token);
  await step(1, 24, token); await demoClick("#addCustomerBtn",token); openForm({title:"Add Customer",body:`${field("customerName","Customer name")}${field("customerCompany","Company")}${field("customerPhone","Mobile")}${field("customerEmail","Email","email")}`}); await demoType("#customerName","Noor Studio",token); await demoType("#customerCompany","Noor Studio LLC",token); await demoType("#customerPhone","+971 50 882 1402",token); await demoClick("#modalSaveBtn",token); closeModal();state.customers.push({id:"customer-noor",name:"Noor Studio",company:"Noor Studio LLC",phone:"+971 50 882 1402",outstanding:0,history:[]});renderModule();showToast("Customer record created");
  await step(2, 43, token); await demoClick("#openCustomerBtn",token); openInfoModal({title:"Alpine Retail",body:`<div class="demo-report-summary"><div><small>Outstanding</small><strong>${money(180)}</strong></div><div><small>History</small><strong>2 entries</strong></div><div><small>Status</small><strong>Partial</strong></div></div><div class="demo-table-wrap"><table class="demo-table"><thead><tr><th>Type</th><th>Reference</th><th>Amount</th></tr></thead><tbody><tr><td>Invoice</td><td>INV-7D21AA</td><td>${money(380)}</td></tr><tr><td>Payment</td><td>Emirates NBD</td><td>${money(200)}</td></tr></tbody></table></div>`,primary:"Record payment",primaryId:"recordCustomerPaymentBtn"});
  await step(3, 66, token); await demoClick("#recordCustomerPaymentBtn",token); closeModal();openForm({title:"Customer Payment",body:`${field("customerPayment","Amount received","number")}${selectField("customerPaymentWallet","Add to wallet",walletOptions("bank"))}${field("customerPaymentNote","Note","text","",true)}`,primary:"Save payment"});await demoType("#customerPayment","180",token);await demoType("#customerPaymentNote","Invoice settled",token);await demoClick("#modalSaveBtn",token);closeModal();const alpine=state.customers.find(r=>r.id==='customer-alpine');alpine.outstanding=0;alpine.history.push("Payment · AED 180.00");state.wallets.find(r=>r.id==='bank').balance+=180;renderModule();showToast("Customer balance settled in full");
  await step(4, 91, token); await demoClick("#customer-alpine",token);
}

async function runAssets(token) {
  await step(0, 6, token); await demoClick("#ownedAssetsModeBtn",token);
  await step(1, 22, token); await demoClick("#addAssetBtn",token);openForm({title:"Add Asset",body:`${field("assetName","Asset name")}${selectField("assetType","Type",'<option>Equipment</option><option>Vehicle</option><option>Property</option>')}${field("assetDate","Purchase date","date","2026-08-30")}${field("assetPurchase","Purchase price","number")}${field("assetValue","Current valuation","number")}${field("assetDescription","Description","text","",true)}`});await demoType("#assetName","Camera Kit",token);await demoType("#assetPurchase","9500",token);await demoType("#assetValue","9500",token);await demoClick("#modalSaveBtn",token);closeModal();state.assets.push({id:"asset-camera",name:"Camera Kit",type:"Equipment",purchase:9500,value:9500,status:"Active"});renderModule();showToast("Asset added · Portfolio value updated");
  await step(2, 40, token); await demoClick("input[name='assetStatusFilter'][value='active']",token);
  await step(3, 55, token); await demoClick("#asset-camera",token);openInfoModal({title:"Camera Kit",body:`<div class="demo-report-summary"><div><small>Purchase price</small><strong>${money(9500)}</strong></div><div><small>Current value</small><strong>${money(9500)}</strong></div><div><small>Status</small><strong>Active</strong></div></div><p style="color:var(--muted);font-size:.7rem;line-height:1.6">Equipment asset purchased on 30 Aug 2026. Valuation can be updated independently of the purchase record.</p>`,primary:"Edit Asset",primaryId:"editAssetFromDetail"});await wait(1100,token);closeModal();
  await step(4, 73, token); await demoClick("#editAssetBtn",token);openForm({kicker:"Edit",title:"Camera Kit",body:`${field("assetEditName","Asset name","text","Camera Kit")}${field("assetEditValue","Current valuation","number","9500")}`,primary:"Save changes"});await demoType("#assetEditValue","10200",token);await demoClick("#modalSaveBtn",token);closeModal();state.assets.find(r=>r.id==='asset-camera').value=10200;renderModule();showToast("Valuation increased to AED 10,200.00");
  await step(5, 91, token); await demoClick("#assetsDetailsBtn",token);openInfoModal({title:"Assets Portfolio Details",body:`<div class="demo-report-summary"><div><small>Portfolio value</small><strong>${money(totalAssetValue())}</strong></div><div><small>Assets</small><strong>${state.assets.length}</strong></div><div><small>Currency</small><strong>AED</strong></div></div><div class="demo-chart-bars" style="height:160px"><span style="--h:82%" data-label="Vehicle"></span><span style="--h:34%" data-label="Equipment"></span><span style="--h:19%" data-label="Camera"></span></div>`});await wait(1500,token);closeModal();
}

async function runDepreciation(token) {
  await step(0, 6, token); await demoClick("#depAssetsModeBtn",token);
  await step(1, 22, token); await demoClick("#addDepAssetBtn",token);openForm({title:"Add Depreciation Asset",body:`${field("depName","Asset name")}${field("depCost","Cost","number")}${field("depSalvage","Salvage value","number")}${field("depLife","Useful life (years)","number")}${selectField("depMethod","Method",'<option>Straight line</option><option>Declining balance</option>')}${field("depDate","Acquisition date","date","2026-08-30")}`});await demoType("#depName","Camera Body",token);await demoType("#depCost","15000",token);await demoType("#depSalvage","3000",token);await demoType("#depLife","4",token);await demoClick("#modalSaveBtn",token);closeModal();state.depreciation.push({id:"dep-camera",name:"Camera Body",type:"Electronics",cost:15000,salvage:3000,life:4,accumulated:3000,book:12000,method:"Straight line"});renderModule();showToast("Depreciation asset created");
  await step(2, 42, token); await demoClick("#dep-camera",token);
  await step(3, 58, token); await demoClick("#dep-camera .asset-card-net",token);
  await step(4, 74, token); await demoClick("#openDepScheduleBtn",token);openInfoModal({title:"Camera Body · Depreciation Schedule",body:`<div class="demo-table-wrap"><table class="demo-table"><thead><tr><th>Year</th><th>Opening</th><th>Depreciation</th><th>Closing</th></tr></thead><tbody><tr><td>1</td><td>${money(15000)}</td><td>${money(3000)}</td><td>${money(12000)}</td></tr><tr><td>2</td><td>${money(12000)}</td><td>${money(3000)}</td><td>${money(9000)}</td></tr><tr><td>3</td><td>${money(9000)}</td><td>${money(3000)}</td><td>${money(6000)}</td></tr><tr><td>4</td><td>${money(6000)}</td><td>${money(3000)}</td><td>${money(3000)}</td></tr></tbody></table></div>`});await wait(1600,token);closeModal();
  await step(5, 92, token); await demoClick("#depReportBtn",token);showToast("Depreciation report preview prepared");
}

async function runLoans(token) {
  await step(0, 5, token); await demoClick("#newLoanBtn",token);openForm({title:"Loan Given",body:`${field("loanPerson","Person / business")}${field("loanAmount","Principal amount","number")}${selectField("loanWallet","Wallet",walletOptions("bank"))}${field("loanDate","Loan date","date","2026-08-30")}`});await demoType("#loanPerson","Ahmed Studio",token);await demoType("#loanAmount","3000",token);await demoClick("#modalSaveBtn",token);closeModal();state.loans.unshift({id:"loan-demo-given",direction:"given",name:"Ahmed Studio",principal:3000,remaining:3000,status:"Open"});state.wallets.find(r=>r.id==='bank').balance-=3000;renderModule();showToast("Given Loan created");
  await step(1, 20, token); await demoClick("#givenPaymentBtn",token);openForm({title:"Received Back",body:`${field("givenReceipt","Amount received","number")}${selectField("givenReceiptWallet","Add to wallet",walletOptions("bank"))}`,primary:"Save receipt"});await demoType("#givenReceipt","1200",token);await demoClick("#modalSaveBtn",token);closeModal();state.loans.find(r=>r.id==='loan-demo-given').remaining=1800;state.loans.find(r=>r.id==='loan-demo-given').status="Partial";state.wallets.find(r=>r.id==='bank').balance+=1200;renderModule();showToast("Partial receipt saved · AED 1,800 remaining");
  await step(2, 35, token); await demoClick("#takenModeBtn",token);state.loanMode="taken";renderModule();
  await step(3, 50, token); await demoClick("#newLoanBtn",token);openForm({title:"Loan Taken",body:`${field("takenPerson","Person / business")}${field("takenAmount","Principal amount","number")}${selectField("takenWallet","Receive into wallet",walletOptions("bank"))}`});await demoType("#takenPerson","Lumen Supplier",token);await demoType("#takenAmount","5000",token);await demoClick("#modalSaveBtn",token);closeModal();state.loans.unshift({id:"loan-demo-taken",direction:"taken",name:"Lumen Supplier",principal:5000,remaining:5000,status:"Open"});state.wallets.find(r=>r.id==='bank').balance+=5000;renderModule();showToast("Taken Loan created");
  await step(4, 65, token); await demoClick("#takenPaymentBtn",token);openForm({title:"Returned Back",body:`${field("takenPayment","Amount returned","number")}${selectField("takenPaymentWallet","Pay from wallet",walletOptions("bank"))}`,primary:"Save payment"});await demoType("#takenPayment","2000",token);await demoClick("#modalSaveBtn",token);closeModal();state.loans.find(r=>r.id==='loan-demo-taken').remaining=3000;state.loans.find(r=>r.id==='loan-demo-taken').status="Partial";state.wallets.find(r=>r.id==='bank').balance-=2000;renderModule();showToast("Partial repayment saved");
  await step(5, 80, token); await demoClick("#takenPaymentBtn",token);openForm({title:"Returned Back",body:`${field("takenFinal","Remaining amount","number","3000")}`,primary:"Complete repayment"});await demoClick("#modalSaveBtn",token);closeModal();state.loans.find(r=>r.id==='loan-demo-taken').remaining=0;state.loans.find(r=>r.id==='loan-demo-taken').status="Closed";renderModule();showToast("Taken Loan fully repaid · Closed");
  await step(6, 94, token); await demoClick("#mainOverview",token);
}

async function runInstallments(token) {
  await step(0, 5, token); await demoClick("#addInstallmentBtn",token);openForm({title:"Installment Plan",body:`${field("planName","Plan / person")}${field("planTotal","Total amount","number")}${field("planCount","Number of installments","number")}${field("planStart","Start date","date","2026-08-30")}`});await demoType("#planName","Equipment Plan",token);await demoType("#planTotal","4800",token);await demoType("#planCount","4",token);await demoClick("#modalSaveBtn",token);closeModal();state.installments.push({id:"plan-equipment",name:"Equipment Plan",total:4800,paid:0,count:4,status:"Open"});renderModule();showToast("Installment plan created");
  await step(1, 24, token); await demoClick("#plan-equipment",token);
  await step(2, 42, token); await demoClick("#installmentPaymentBtn",token);openForm({title:"Payment / Installment Received",body:`${field("planPayment","Amount","number")}${selectField("planWallet","Add to wallet",walletOptions("bank"))}`,primary:"Record payment"});await demoType("#planPayment","1200",token);await demoClick("#modalSaveBtn",token);closeModal();state.installments.find(r=>r.id==='plan-equipment').paid=1200;state.installments.find(r=>r.id==='plan-equipment').status="Partial";renderModule();showToast("AED 1,200.00 recorded · AED 3,600 remaining");
  await step(3, 60, token); await demoClick("#plan-equipment .ip-progress",token);
  await step(4, 76, token); await demoClick("#installmentPaymentBtn",token);openForm({title:"Payment / Installment Received",body:`${field("planFinalPayment","Remaining amount","number","3600")}`,primary:"Complete plan"});await demoClick("#modalSaveBtn",token);closeModal();state.installments.find(r=>r.id==='plan-equipment').paid=4800;state.installments.find(r=>r.id==='plan-equipment').status="Completed";renderModule();showToast("Plan paid in full · Completed");
  await step(5, 93, token); await demoClick("#installmentDetailsBtn",token);showToast("Installment details and export tools are available here");
}

async function runNotes(token) {
  await step(0, 6, token); await demoClick("#newNoteBtn",token);openForm({title:"New Note",body:`${field("noteTitle","Title","text","",true)}${textareaField("noteBody","Note")}<label class="demo-form-field full"><span>Reminder</span><span class="demo-toggle-row"><input type="checkbox" id="noteReminder"> Remind me tomorrow at 09:30</span></label>`});
  await step(1, 27, token); await demoType("#noteTitle","Client follow-up",token);await demoType("#noteBody","Confirm Horizon Trading payment receipt and send the updated statement.",token);
  await step(2, 50, token); await demoClick("#noteReminder",token);$("#noteReminder").checked=true;await demoClick("#modalSaveBtn",token);closeModal();state.notes.unshift({id:"note-demo",title:"Client follow-up",body:"Confirm Horizon Trading payment receipt and send the updated statement.",reminder:true,time:"31 Aug · 09:30"});renderModule();showToast("Note saved with reminder");
  await step(3, 72, token); await demoClick("#openNoteBtn",token);openInfoModal({title:"Client follow-up",body:`<p style="margin:0;color:var(--text);font-size:.72rem;line-height:1.7">Confirm Horizon Trading payment receipt and send the updated statement.</p><div class="demo-key-warning" style="color:var(--primary);background:var(--primary-soft)"><i class="fa-solid fa-bell"></i><span>Reminder · 31 Aug 2026 at 09:30</span></div>`,primary:"Close"});await wait(1300,token);closeModal();
  await step(4, 91, token); await demoClick(".filter-inline-input",token);
}

async function runBitcoin(token) {
  await step(0, 5, token); await demoClick("#bitcoinPanel .section-head h3",token);
  await step(1, 22, token); await demoClick("#bitcoinAddress",token);
  await step(2, 40, token); await demoClick("#receiveBitcoinBtn",token);openInfoModal({title:"Receive Bitcoin",body:`<div class="demo-qr">${Array.from({length:49},()=>"<span></span>").join("")}</div><div class="demo-address-box">bc1qtriplemdemo7safewatchonly9q4v8x2</div><p style="text-align:center;color:var(--muted);font-size:.62rem">Sample receive address · never send real funds to this demo address</p>`});await wait(1600,token);closeModal();
  await step(3, 58, token); await demoClick(".demo-btc-transactions .btc-transaction-row:nth-child(1)",token);
  await step(4, 75, token); await demoClick("#bitcoinKeyNotice",token);
  await step(5, 92, token); await demoClick("#btcStatementBtn",token);showToast("Per-wallet statement tools opened visually");
}

async function runMessages(token) {
  await step(0, 6, token); await demoClick("#messagesPanel .section-head h3",token);
  await step(1, 22, token); await demoClick("#supportThread",token);
  await step(2, 40, token); await demoClick("#messagesNewBtn",token);openForm({title:"New Message",body:`${selectField("messageRecipient","To",'<option>Administrator</option>')}${field("messageSubject","Subject")}${textareaField("newMessageBody","Message")}`,primary:"Open Composer"});await demoType("#messageSubject","Inventory audit report",token);await demoType("#newMessageBody","Could you please confirm what is included in the inventory audit workbook?",token);await demoClick("#modalSaveBtn",token);closeModal();renderModule();
  await step(3, 59, token); await demoType("#messagesReplyInput","Thank you. I can see the audit report option now.",token);
  await step(4, 76, token); await demoClick("#messagesReplySendBtn",token);state.messages.push({who:"You",mine:true,text:"Thank you. I can see the audit report option now.",time:"Now"});renderModule();showToast("Message sent to administrator");
  await step(5, 91, token); await wait(900,token);state.messages.push({who:"Admin",mine:false,text:"Perfect. The workbook includes stock, costs, prices, quantities, brands, and audit-ready detail.",time:"Now"});renderModule();await demoClick("#messagesChatScroll .chat-bubble-row:last-child .chat-bubble",token);showToast("Administrator reply received in the same thread");
}

async function runReports(token) {
  await step(0, 7, token); await demoClick(".demo-report-options",token);
  await step(1, 26, token); await demoSelect("#reportSection","all",token);
  await step(2, 45, token); await demoSelect("#reportStyle","detailed",token);
  await step(3, 67, token); await demoClick("#generateReportBtn",token);state.reportGenerated=true;renderModule();showToast("Detailed report generated");await demoClick("#reportPreview",token);
  await step(4, 90, token); await demoClick("#downloadReportBtn",token);showToast("Sample PDF is ready. Click Download PDF manually to save it.");
}

const RUNNERS = { dashboard:runDashboard, wallets:runWallets, expenses:runExpenses, inventory:runInventory, sales:runSales, customers:runCustomers, assets:runAssets, depreciation:runDepreciation, loans:runLoans, installments:runInstallments, notes:runNotes, bitcoin:runBitcoin, messages:runMessages, reports:runReports };

function updatePlayButton() {
  const button = $("#playPauseBtn");
  if (playback.running && !playback.paused) { button.innerHTML='<i class="fa-solid fa-pause"></i><span>Pause</span>'; button.setAttribute("aria-label","Pause chapter"); }
  else if (playback.running && playback.paused) { button.innerHTML='<i class="fa-solid fa-play"></i><span>Resume</span>'; button.setAttribute("aria-label","Resume chapter"); }
  else { button.innerHTML='<i class="fa-solid fa-play"></i><span>Play</span>'; button.setAttribute("aria-label","Play chapter"); }
}

function cancelPlayback() {
  playback.token += 1;
  playback.running = false;
  playback.paused = false;
  updatePlayButton();
  closeModal();
  $("#demoCursor").classList.remove("visible","clicking");
  $$(".demo-hover-target", $("#productContent")).forEach(el => el.classList.remove("demo-hover-target"));
  hidePointerLabel();
}

async function runCurrent() {
  cancelPlayback();
  const token = playback.token;
  const startedAt = performance.now();
  prepareChapter(currentModule().key);
  renderModule();
  setProgress(0);
  playback.running = true;
  playback.paused = false;
  updatePlayButton();
  $("#coachState").classList.add("is-running");
  $("#coachState span:last-child").textContent = "Running";
  try {
    await RUNNERS[currentModule().key](token);
    assertToken(token);
    const reviewIndex = currentModule().steps.length - 1;
    setCue(reviewIndex, 96);
    const reviewTarget = $("#productContent .panel.active") || $("#productContent");
    if (reviewTarget) {
      reviewTarget.classList.add("demo-review-state");
      reviewTarget.scrollIntoView({ block:"center", behavior: reducedMotion ? "auto" : "smooth" });
      positionPointerLabel(reviewTarget);
    }
    await wait(2300, token);
    if (reviewTarget) reviewTarget.classList.remove("demo-review-state");
    const profile = deviceProfile();
    const minDuration = profile.key === "mobile" ? 34000 : profile.key === "tablet" ? 32000 : 30000;
    const elapsed = performance.now() - startedAt;
    if (elapsed < minDuration) await wait((minDuration - elapsed) * playbackSpeed, token);
    assertToken(token);
    playback.running = false;
    playback.paused = false;
    completedModules.add(currentModule().key);
    currentTutorialStep = currentModule().steps.length;
    renderNavigation();
    renderTutorial();
    updatePlayButton();
    setProgress(100);
    hidePointerLabel();
    $("#coachTitle").textContent = "Chapter complete";
    $("#coachText").textContent = "This workflow is complete. Choose another chapter or use Next to continue through the product.";
    $("#coachState").className = "coach-state";
    $("#coachState span:last-child").textContent = "Complete";
    $("#demoCursor").classList.remove("visible");
  } catch (error) {
    hidePointerLabel();
    if (!(error instanceof Cancelled)) {
      console.error(error);
      playback.running = false;
      playback.paused = false;
      updatePlayButton();
      $("#coachTitle").textContent = "Walkthrough paused";
      $("#coachText").textContent = "Restart this chapter to continue the guided sequence.";
      $("#coachState").className = "coach-state is-paused";
      $("#coachState span:last-child").textContent = "Paused";
    }
  }
}

function setChapter(index, autoplay = false) {
  cancelPlayback();
  currentIndex = (Number(index) + MODULES.length) % MODULES.length;
  prepareChapter(currentModule().key);
  renderModule();
  setProgress(0);
  $("#coachTitle").textContent = "Ready when you are";
  $("#coachText").textContent = `Press Play to watch the complete ${currentModule().label} workflow. Every move is listed in the text tutorial.`;
  $("#coachState").className = "coach-state";
  $("#coachState span:last-child").textContent = "Ready";
  if (autoplay) runCurrent();
}

function firstModuleForTab(tab) {
  const index = MODULES.findIndex(module => module.appTab === tab);
  return index >= 0 ? index : 0;
}

function deviceProfile() {
  const width = window.innerWidth || document.documentElement.clientWidth || 1280;
  if (width <= 700) return { key:"mobile", label:"Mobile view", icon:"fa-mobile-screen-button" };
  if (width <= 1100) return { key:"tablet", label:"Tablet view", icon:"fa-tablet-screen-button" };
  return { key:"desktop", label:"Desktop view", icon:"fa-desktop" };
}

function syncDeviceMode() {
  const profile = deviceProfile();
  const viewport = $("#productViewport");
  viewport.dataset.device = profile.key;
  document.body.dataset.demoDevice = profile.key;
  $("#demoDeviceBadge").innerHTML = `<i class="fa-solid ${profile.icon}"></i><span>${profile.label}</span>`;
  $(".stage-note").innerHTML = `<i class="fa-solid ${profile.icon}" aria-hidden="true"></i> ${profile.label} · production responsive rules`;
  hidePointerLabel();
}

function downloadSamplePdf() {
  const stream = "BT /F1 20 Tf 54 760 Td (TRIPLEM VIP - Sample Detailed Report) Tj 0 -34 Td /F1 11 Tf (Fictional local demo data - no production records) Tj 0 -44 Td (Wallet balance: AED 48,390.00) Tj 0 -22 Td (Recorded expenses: AED 2,665.00) Tj 0 -22 Td (Asset valuation: AED 90,000.00) Tj 0 -22 Td (Generated safely in the browser.) Tj ET";
  const objects = ["1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj", "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj", "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj", "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj", `5 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`];
  let pdf = "%PDF-1.4\n", offsets = [0];
  objects.forEach(obj => { offsets.push(pdf.length); pdf += `${obj}\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => { pdf += `${String(offset).padStart(10,"0")} 00000 n \n`; });
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const url = URL.createObjectURL(new Blob([pdf], { type:"application/pdf" }));
  const link = document.createElement("a"); link.href = url; link.download = "Triplem_VIP_Demo_Report.pdf"; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
  showToast("Triplem_VIP_Demo_Report.pdf downloaded");
}

function showManualHoverHelp(el) {
  if (!el || playback.running) return;
  const label = ensurePointerLabel();
  const title = String(
    el.getAttribute("aria-label")
    || el.getAttribute("title")
    || el.querySelector(".loan-name,.asset-card-title,.expense-wallet-title,.note-grid-title,.thread-item-subject,h4,strong")?.textContent
    || el.textContent
    || "Demo control"
  ).replace(/\s+/g," ").trim().slice(0,90);
  const nearestCopy = el.querySelector(".loan-sub,.asset-card-meta,.expense-wallet-sub,.thread-item-preview,.ip-card-meta")?.textContent
    || el.closest(".card,.section,.overview")?.querySelector(".title-group p,.inventory-customers-toolbar-title span,.detail-head p")?.textContent
    || "Explore this production-style control. Guided playback explains its effect with fictional demo data.";
  label.innerHTML = `<strong>${title || "Demo detail"}</strong><span>${String(nearestCopy).replace(/\s+/g," ").trim().slice(0,240)}</span>`;
  label.classList.add("show");
  const rect = el.getBoundingClientRect();
  const box = label.getBoundingClientRect();
  let left = Math.max(8, Math.min(window.innerWidth - box.width - 8, rect.left + Math.min(rect.width * .15, 24)));
  let top = rect.bottom + 9;
  if (top + box.height > window.innerHeight - 8) top = Math.max(8, rect.top - box.height - 9);
  label.style.left = `${left}px`;
  label.style.top = `${top}px`;
  el.classList.add("demo-hover-target");
}

const manualHoverSelector = "button,.inventory-section-card,.expense-wallet-card,.asset-card,.loan,.installment-plan-card,.note-grid-card,.messages-thread-item,.btc-wallet-card,.inventory-outstanding-member";
$("#productContent").addEventListener("mouseover", event => {
  if (playback.running) return;
  const el = event.target.closest(manualHoverSelector);
  if (!el || !$("#productContent").contains(el)) return;
  showManualHoverHelp(el);
});
$("#productContent").addEventListener("mouseout", event => {
  if (playback.running) return;
  const el = event.target.closest(manualHoverSelector);
  if (!el) return;
  if (event.relatedTarget && el.contains(event.relatedTarget)) return;
  el.classList.remove("demo-hover-target");
  hidePointerLabel();
});

document.addEventListener("click", event => {
  const tab = event.target.closest("[data-module-index]");
  if (tab) { setChapter(tab.dataset.moduleIndex); return; }
  const productTab = event.target.closest("[data-product-tab]");
  if (productTab) { setChapter(firstModuleForTab(productTab.dataset.productTab)); return; }
  if (event.target.closest("[data-demo-close]") || event.target.closest("#modalCloseBtn")) { closeModal(); return; }
  if (event.target.closest("#toggleWalletsBtn") && !playback.running) { state.walletsCollapsed = !state.walletsCollapsed; renderModule(); return; }
  if (event.target.closest("#walletNewEntryBtn") && !playback.running) { state.inventoryMenuOpen = !state.inventoryMenuOpen; renderModule(); return; }
  if (event.target.closest("#expenseEntryBtn") && !playback.running) { event.preventDefault(); event.stopPropagation(); $("#expenseEntryMenu")?.classList.toggle("demo-visible-menu"); return; }
  if (event.target.closest("#givenModeBtn") && !playback.running) { state.loanMode = "given"; renderModule(); return; }
  if (event.target.closest("#takenModeBtn") && !playback.running) { state.loanMode = "taken"; renderModule(); return; }
  if (event.target.closest("#ownedAssetsModeBtn") && !playback.running && currentModule().key !== "assets") { setChapter(MODULES.findIndex(m=>m.key==="assets")); return; }
  if (event.target.closest("#depAssetsModeBtn") && !playback.running && currentModule().key !== "depreciation") { setChapter(MODULES.findIndex(m=>m.key==="depreciation")); return; }
  if (event.target.closest("#generateReportBtn")) { state.reportGenerated = true; renderModule(); showToast("Detailed report generated"); return; }
  if (event.target.closest("#downloadReportBtn")) { downloadSamplePdf(); return; }
  if (event.target.closest("#copyBitcoinBtn")) { showToast("Sample Bitcoin address copied visually"); return; }
  if (event.target.closest("#transactionHistorySummary") && !playback.running) { state.expenseHistoryOpen = !state.expenseHistoryOpen; renderModule(); return; }
  if (event.target.closest("#expenseDownloadBtn") && !playback.running) { event.preventDefault(); event.stopPropagation(); state.expenseDownloadOpen = !state.expenseDownloadOpen; renderModule(); return; }
  if (event.target.closest("#inventoryActionsBtn") && !playback.running) { state.inventoryMenuOpen = !state.inventoryMenuOpen; renderModule(); return; }
});

$("#moduleSelect").addEventListener("change", event => setChapter(event.target.value));
$("#prevBtn").addEventListener("click", () => setChapter(currentIndex - 1));
$("#nextBtn").addEventListener("click", () => setChapter(currentIndex + 1));
$("#restartBtn").addEventListener("click", () => runCurrent());
$("#speedSelect").addEventListener("change", event => { playbackSpeed = Number(event.target.value) || 1; showToast(`Playback speed: ${event.target.options[event.target.selectedIndex].text}`); });
$("#playPauseBtn").addEventListener("click", () => {
  if (!playback.running) { runCurrent(); return; }
  playback.paused = !playback.paused;
  updatePlayButton();
  const host = $("#coachState");
  host.classList.toggle("is-paused", playback.paused);
  host.classList.toggle("is-running", !playback.paused);
  $("#coachState span:last-child").textContent = playback.paused ? "Paused" : "Running";
});

$("#demoThemeSelect").addEventListener("change", event => {
  const theme = event.target.value;
  document.documentElement.dataset.demoTheme = theme;
  document.documentElement.dataset.triplemTheme = theme;
  document.documentElement.style.colorScheme = theme === "navy" ? "dark" : "light";
  const colors = { default:"#2457d6", neon:"#0284c7", navy:"#4f8cff", red:"#c1121f", pink:"#db2777", green:"#19974f" };
  $("meta[name='theme-color']").setAttribute("content", colors[theme] || colors.default);
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeModal();
  if (event.code === "Space" && ["BODY","BUTTON"].includes(document.activeElement?.tagName)) { event.preventDefault(); $("#playPauseBtn").click(); return; }
  if (["INPUT","SELECT","TEXTAREA"].includes(document.activeElement?.tagName) || !$("#demoModal").classList.contains("hide")) return;
  if (event.key === "ArrowLeft") { event.preventDefault(); setChapter(currentIndex - 1); }
  if (event.key === "ArrowRight") { event.preventDefault(); setChapter(currentIndex + 1); }
});

window.addEventListener("resize", syncDeviceMode, { passive:true });
syncDeviceMode();
prepareChapter(MODULES[0].key);
renderModule();
setProgress(0);
