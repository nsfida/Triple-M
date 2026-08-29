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
    inventoryMenuOpen: false
  };
}

let state = baseState();
let currentIndex = 0;
let currentTutorialStep = -1;
let toastTimer = null;
let playbackSpeed = 1;
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
  if (["inventory", "sales", "customers"].includes(key)) {
    state.inventory.push({ id: "item-scanner", name: "Wireless Scanner", brand: "Triplem Supply", qty: 12, cost: 120, sell: 190, category: "Electronics", sku: "TM-SCN-01" });
  }
  if (["sales", "customers"].includes(key)) {
    state.sales.push({ id: "sale-alpine", item: "Wireless Scanner", customer: "Alpine Retail", qty: 2, total: 380, paid: 200, profit: 140 });
  }
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
  return `<section id="dashboardPanel" class="panel active"><div class="card section">
    ${sectionHead("Detailed Dashboard", "Live summaries across wallets, expenses, inventory, assets, loans, installments, and customer balances.", '<button class="tiny ghost" id="dashboardDetailsBtn"><i class="fa-solid fa-chart-pie"></i> Details</button>')}
    <div class="demo-dashboard-grid">
      ${metricCard("Wallet balance", money(totalWalletBalance()), "3 active AED wallets")}
      ${metricCard("Recorded expenses", money(totalExpenses()), `${state.expenses.length} transactions`) }
      ${metricCard("Asset valuation", money(totalAssetValue()), `${state.assets.length} active assets`) }
      ${metricCard("Outstanding", money(totalOutstanding()), "Loans + customer invoices")}
    </div>
    <div class="demo-dashboard-columns">
      <article class="demo-chart-card"><div class="demo-card-head"><strong>Cash Flow</strong><div class="demo-actions"><button class="tiny primary" id="dashboardCurrencyBtn">AED</button><button class="tiny ghost">SAR</button><button class="tiny ghost">USD</button></div></div><div class="demo-chart-bars" id="dashboardChart"><span style="--h:44%" data-label="Mar"></span><span style="--h:68%" data-label="Apr"></span><span style="--h:55%" data-label="May"></span><span style="--h:82%" data-label="Jun"></span><span style="--h:66%" data-label="Jul"></span><span style="--h:91%" data-label="Aug"></span></div></article>
      <article class="demo-activity-card"><div class="demo-card-head"><strong>Latest Activity</strong><span class="demo-badge green">Live sample</span></div><div class="demo-activity-list" id="dashboardActivity">
        <div class="demo-activity-row"><i class="fa-solid fa-arrow-down"></i><span><strong>Invoice payment</strong><small>Horizon Trading · Emirates NBD</small></span><span class="demo-positive">+1,500</span></div>
        <div class="demo-activity-row"><i class="fa-solid fa-cart-shopping"></i><span><strong>Office rent</strong><small>Expenses · Emirates NBD</small></span><span class="demo-negative">−1,800</span></div>
        <div class="demo-activity-row"><i class="fa-solid fa-box"></i><span><strong>Stock purchase</strong><small>Inventory · 12 units</small></span><span class="demo-negative">−1,020</span></div>
        <div class="demo-activity-row"><i class="fa-solid fa-calendar-check"></i><span><strong>Installment received</strong><small>Laptop Plan</small></span><span class="demo-positive">+600</span></div>
      </div></article>
    </div>
  </div></section>`;
}

function walletCards() {
  return `<div class="demo-wallet-grid">${state.wallets.map(wallet => `<article class="demo-wallet-card" id="wallet-${wallet.id}"><div class="demo-wallet-top"><span class="demo-badge">${wallet.type}</span>${wallet.id === "studio" ? '<button class="tiny ghost" id="editWalletBtn"><i class="fa-solid fa-pen"></i></button>' : '<i class="fa-solid fa-wallet" style="color:var(--primary)"></i>'}</div><h4>${wallet.name}</h4><p>${wallet.currency} ${wallet.type} account</p><strong class="demo-wallet-balance">${money(wallet.balance, wallet.currency)}</strong><div class="demo-wallet-meta"><span>Top-up ${money(wallet.topups, wallet.currency)}</span><span>Spent ${money(wallet.spent, wallet.currency)}</span></div></article>`).join("")}</div>`;
}

function renderWallets() {
  return `<section id="expensesPanel" class="panel active"><section class="overview wallets-overview-section" id="walletsOverviewSection"><div class="overview-top"><div><h3>Wallets Overview</h3><p>Account balances and expense tracking by wallet.</p></div><div class="tools"><button class="icon-btn ghost" id="toggleWalletsBtn" title="Collapse Wallets Overview">▼</button></div></div><div class="wallets-content" id="walletsContent">${walletCards()}</div></section>
    <div class="card section" style="margin-top:8px!important">${sectionHead("Expenses", "Wallet accounts, transaction history, transfers, and spending records.", `<div class="menu-wrap"><button class="tiny ghost menu-trigger" id="walletNewEntryBtn">New Entry ▾</button><div class="menu-dropdown ${state.inventoryMenuOpen ? "demo-visible-menu" : ""}" id="walletEntryMenu"><button class="menu-item" id="addWalletAction">Add Account</button><button class="menu-item" id="addMoneyAction">Add Money</button><button class="menu-item" id="transferAction">Transfer Money</button></div></div>`)}${filterRow("Item, wallet, note", '<div class="filter-inline-section"><span class="filter-inline-label">Wallet</span><select class="select filter-inline-select" id="walletFilter"><option>All wallets</option>' + state.wallets.map(w => `<option>${w.name}</option>`).join("") + '</select></div>')}<div class="empty" style="margin-top:8px">Wallet chapter focuses on account setup before expense history.</div></div></section>`;
}

function renderExpenseRows() {
  return state.expenses.map(row => `<tr id="expense-${row.id}"><td>${row.date}</td><td><strong>${row.item}</strong></td><td>${walletName(row.wallet)}</td><td>${row.note}</td><td class="demo-negative">−${money(row.amount)}</td><td><div class="demo-actions">${row.id === "exp-demo" ? '<button class="tiny ghost" id="editExpenseBtn">✎</button>' : '<button class="tiny ghost">↗</button>'}<button class="tiny danger">×</button></div></td></tr>`).join("");
}

function renderExpenses() {
  const downloadMenu = state.expenseDownloadOpen ? "demo-visible-menu" : "";
  return `<section id="expensesPanel" class="panel active"><div class="card section">
    ${sectionHead("Expenses", "Track spending by wallet with searchable transaction history and report downloads.", `<button class="tiny ghost" id="expensesDetailsBtn"><i class="fa-solid fa-chart-pie"></i> Details</button><div class="menu-wrap"><button class="tiny ghost menu-trigger" id="expenseEntryBtn">New Entry ▾</button><div class="menu-dropdown" id="expenseEntryMenu"><button class="menu-item" id="addExpenseAction">Expense</button><button class="menu-item">Add Money</button><button class="menu-item">Transfer Money</button></div></div>`)}
    ${filterRow("Item, wallet, note", '<div class="filter-inline-section"><span class="filter-inline-label">Wallet</span><select class="select filter-inline-select"><option>All wallets</option><option>Cash</option><option>Emirates NBD</option></select></div><div class="filter-inline-section"><span class="filter-inline-label">Currency</span><select class="select filter-inline-select"><option>AED</option><option>All</option></select></div>')}
    <div class="demo-wallet-overview" style="margin-top:8px">${walletCards()}</div>
    <details class="demo-expense-group" id="transactionsHistorySection" ${state.expenseHistoryOpen ? "open" : ""}><summary id="transactionHistorySummary"><div class="demo-expense-summary"><div><h4><i class="fa-solid fa-clock-rotate-left"></i> Transaction History</h4><p>Expenses sorted newest first with wallet and note detail.</p></div><div class="demo-expense-total"><small>Total expenses</small><strong>${money(totalExpenses())}</strong></div><div class="demo-actions"><div class="menu-wrap"><button class="icon-btn ghost" id="expenseDownloadBtn" title="Download report"><i class="fa-solid fa-download"></i></button><div class="menu-dropdown ${downloadMenu}" id="expenseDownloadMenu"><button class="menu-item" id="summaryReportOption"><i class="fa-solid fa-file-lines"></i> Summary Report</button><button class="menu-item" id="detailedReportOption"><i class="fa-solid fa-file-circle-check"></i> Detailed Report</button></div></div><span class="expand-icon">${state.expenseHistoryOpen ? "▼" : "▶"}</span></div></div></summary><div class="demo-expense-content"><div class="demo-table-wrap"><table class="demo-table"><thead><tr><th>Date</th><th>Item</th><th>Wallet</th><th>Note</th><th>Amount</th><th>Action</th></tr></thead><tbody>${renderExpenseRows()}</tbody></table></div></div></details>
  </div></section>`;
}

function renderInventory() {
  return `<section id="goodsPanel" class="panel active"><div class="card section">
    ${sectionHead("Inventory", "Category → Brand → Type → Variant, with stock, carts, customers, barcodes, scanner, reports, and audit tools.", `<button class="tiny ghost" id="inventoryDetailsBtn"><i class="fa-solid fa-chart-pie"></i> Details</button><div class="menu-wrap inventory-actions-wrap"><button class="icon-btn menu-trigger" id="inventoryActionsBtn"><i class="fa-solid fa-plus"></i></button><div class="menu-dropdown inventory-actions-menu ${state.inventoryMenuOpen ? "demo-visible-menu" : ""}" id="inventoryActionsMenu"><button class="menu-item" id="addInventoryAction"><i class="fa-solid fa-box"></i> Add item</button><button class="menu-item"><i class="fa-solid fa-cash-register"></i> Create sale</button><button class="menu-item"><i class="fa-solid fa-cart-shopping"></i> Open cart</button><button class="menu-item"><i class="fa-solid fa-camera"></i> Scanner</button><button class="menu-item"><i class="fa-solid fa-barcode"></i> Product Barcodes</button><button class="menu-item"><i class="fa-solid fa-folder-open"></i> Saved carts</button><button class="menu-item"><i class="fa-solid fa-download"></i> Download CSV</button><button class="menu-item"><i class="fa-solid fa-file-pdf"></i> Download PDF report</button><button class="menu-item"><i class="fa-solid fa-file-excel"></i> Audit Report</button></div></div>`)}
    <div class="demo-inventory-summary">${metricCard("Items", String(state.inventory.length), "Active catalog records")}${metricCard("Units in stock", String(state.inventory.reduce((s,r)=>s+r.qty,0)), "Across all items")}${metricCard("Stock cost", money(stockValue()), "Quantity × unit cost")}${metricCard("Low stock", String(state.inventory.filter(r=>r.qty<8).length), "Below 8 units")}</div>
    ${filterRow("Item, brand, variant", '<div class="filter-inline-section"><span class="filter-inline-label">Brand</span><select class="select filter-inline-select"><option>All brands</option><option>Noor</option><option>Triplem Supply</option></select></div><div class="filter-inline-section"><span class="filter-inline-label">Stock</span><select class="select filter-inline-select"><option>All</option><option>In stock</option><option>Low stock</option></select></div>')}
    <div class="demo-stock-grid" style="margin-top:8px">${state.inventory.map(row => `<article class="demo-stock-card" id="${row.id}"><div class="demo-stock-card-head"><span class="demo-badge ${row.qty<8?'orange':'green'}">${row.qty<8?'Low stock':'In stock'}</span>${row.id==='item-scanner'?'<div class="demo-actions"><button class="tiny ghost" id="editInventoryBtn">✎</button><button class="tiny ghost" id="restockInventoryBtn"><i class="fa-solid fa-boxes-stacked"></i></button></div>':'<i class="fa-solid fa-box" style="color:var(--primary)"></i>'}</div><h4>${row.name}</h4><p>${row.brand} · ${row.category} · SKU ${row.sku}</p><strong>${row.qty} units</strong><div class="demo-stock-meta"><span>Cost ${money(row.cost)}</span><span>Sell ${money(row.sell)}</span></div></article>`).join("")}</div>
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
  return `<section id="goodsPanel" class="panel active"><div class="card section">
    ${sectionHead("Customers / Invoices", "Customer records, invoice history, outstanding balances, payments, and receipts.", '<button class="tiny ghost"><i class="fa-solid fa-arrow-left"></i> Inventory</button><button class="btn primary tiny" id="addCustomerBtn"><i class="fa-solid fa-user-plus"></i> Add Customer</button>')}
    ${filterRow("Customer, company, phone", '<div class="filter-inline-section"><span class="filter-inline-label">Balance</span><select class="select filter-inline-select"><option>All</option><option>Outstanding</option><option>Paid</option></select></div>')}
    <div class="demo-asset-grid" style="margin-top:8px">${state.customers.map(row=>`<article class="demo-record-card" id="${row.id}"><div class="demo-record-card-head"><span class="demo-badge ${row.outstanding===0?'green':'orange'}">${row.outstanding===0?'Paid':'Outstanding'}</span><i class="fa-solid fa-user" style="color:var(--primary)"></i></div><h4>${row.name}</h4><p>${row.company}<br>${row.phone}</p><strong class="demo-record-value">${money(row.outstanding)}</strong><div class="demo-record-meta"><span>${row.history.length} history entries</span>${row.id==='customer-alpine'?'<button class="tiny ghost" id="openCustomerBtn">Open</button>':'<button class="tiny ghost">View</button>'}</div></article>`).join("")}</div>
  </div></section>`;
}

function renderAssets() {
  return `<section id="assetsPanel" class="panel active"><div class="assets-module-switch demo-mode-switch"><button class="active" id="ownedAssetsModeBtn">Assets</button><button id="depAssetsModeBtn">Depreciation Assets</button></div><div class="card section">
    ${sectionHead("Assets", "Track purchase value, current valuation, performance, and portfolio records.", '<button class="tiny ghost" id="assetsDetailsBtn"><i class="fa-solid fa-chart-pie"></i> Details</button><div class="menu-wrap"><button class="tiny ghost">Reports ▾</button></div><button class="btn primary tiny" id="addAssetBtn"><i class="fa-solid fa-plus"></i> Add Asset</button>')}
    ${filterRow("Name, type, notes", '<div class="filter-inline-section"><span class="filter-inline-label">Status</span><label class="demo-badge"><input type="radio" name="assetStatus" checked> All</label><label class="demo-badge"><input type="radio" name="assetStatus"> Active</label></div><div class="filter-inline-section"><span class="filter-inline-label">Currency</span><select class="select filter-inline-select"><option>AED</option><option>All</option></select></div>')}
    <div class="demo-asset-grid" style="margin-top:8px">${state.assets.map(row=>`<article class="demo-record-card" id="${row.id}"><div class="demo-record-card-head"><span class="demo-badge green">${row.status}</span>${row.id==='asset-camera'?'<button class="tiny ghost" id="editAssetBtn">✎</button>':'<i class="fa-solid fa-building" style="color:var(--primary)"></i>'}</div><h4>${row.name}</h4><p>${row.type} · Purchase ${money(row.purchase)}</p><strong class="demo-record-value">${money(row.value)}</strong><div class="demo-record-meta"><span>Current valuation</span><span class="demo-positive">Tracked</span></div></article>`).join("")}</div>
  </div></section>`;
}

function renderDepreciation() {
  return `<section id="assetsPanel" class="panel active"><div class="assets-module-switch demo-mode-switch"><button id="ownedAssetsModeBtn">Assets</button><button class="active" id="depAssetsModeBtn">Depreciation Assets</button></div><div class="card section">
    ${sectionHead("Depreciation Assets", "Track depreciable cost, salvage value, useful life, accumulated depreciation, and current book value.", '<button class="tiny ghost" id="depReportBtn"><i class="fa-solid fa-file-pdf"></i> Report</button><button class="btn primary tiny" id="addDepAssetBtn"><i class="fa-solid fa-plus"></i> Add Asset</button>')}
    ${filterRow("Name, type, description", '<div class="filter-inline-section"><span class="filter-inline-label">Method</span><select class="select filter-inline-select"><option>All methods</option><option>Straight line</option></select></div>')}
    <div class="demo-asset-grid" style="margin-top:8px">${state.depreciation.map(row=>`<article class="demo-record-card" id="${row.id}"><div class="demo-record-card-head"><span class="demo-badge">${row.method}</span><i class="fa-solid fa-arrow-trend-down" style="color:var(--warning)"></i></div><h4>${row.name}</h4><p>${row.type} · Useful life ${row.life} years</p><strong class="demo-record-value">Book value ${money(row.book)}</strong><div class="demo-record-meta"><span>Cost ${money(row.cost)}</span><span>Accum. ${money(row.accumulated)}</span></div><div class="demo-progress"><span style="--p:${Math.round((row.accumulated/(row.cost-row.salvage))*100)}%"></span></div>${row.id==='dep-camera'?'<div class="demo-actions" style="margin-top:8px"><button class="tiny ghost" id="openDepScheduleBtn">Schedule</button></div>':''}</article>`).join("")}</div>
  </div></section>`;
}

function loanCards(mode) {
  return state.loans.filter(row=>row.direction===mode).map(row=>{const paid=row.principal-row.remaining;const p=Math.min(100,Math.round(paid/row.principal*100));const action=row.id==='loan-demo-given'?'givenPaymentBtn':row.id==='loan-demo-taken'?'takenPaymentBtn':'';return `<article class="demo-record-card" id="${row.id}"><div class="demo-record-card-head"><span class="demo-badge ${row.remaining===0?'green':'orange'}">${row.remaining===0?'Closed':row.status}</span>${action&&row.remaining>0?`<button class="tiny ghost" id="${action}"><i class="fa-solid fa-plus"></i></button>`:'<i class="fa-solid fa-hand-holding-dollar" style="color:var(--primary)"></i>'}</div><h4>${row.name}</h4><p>${mode==='given'?'Loan Given / Received Back':'Loan Taken / Returned Back'}</p><strong class="demo-record-value">Remaining ${money(row.remaining)}</strong><div class="demo-record-meta"><span>Principal ${money(row.principal)}</span><span>${p}% settled</span></div><div class="demo-progress"><span style="--p:${p}%"></span></div></article>`}).join("");
}

function renderLoans() {
  const mode=state.loanMode;
  return `<section class="overview main-overview-section" id="mainOverview"><div class="overview-top"><div><h3>Loans Overview</h3><p>Loan balances shown by currency.</p></div><div class="tools"><span class="demo-badge">AED ${state.loans.reduce((s,r)=>s+r.remaining,0).toLocaleString()}</span><button class="icon-btn ghost">▼</button></div></div></section><section id="${mode==='given'?'givenPanel':'takenPanel'}" class="panel active" style="margin-top:8px"><div class="demo-mode-switch" role="tablist"><button class="${mode==='given'?'active':''}" id="givenModeBtn">Loan Given / Received Back</button><button class="${mode==='taken'?'active':''}" id="takenModeBtn">Loan Taken / Returned Back</button></div><div class="card section">
    ${sectionHead(mode==='given'?"Loan Given / Received Back":"Loan Taken / Returned Back", "Loans are sorted by the latest user-entered payment date, newest first.", `<button class="tiny ghost" id="loansDetailsBtn"><i class="fa-solid fa-chart-pie"></i> Details</button><div class="menu-wrap"><button class="tiny ghost" id="newLoanBtn">New Entry ▾</button></div>`)}
    ${filterRow("Name or note", '<div class="filter-inline-section"><span class="filter-inline-label">Status</span><select class="select filter-inline-select"><option>All</option><option>Open/Partial</option><option>Closed</option></select></div><div class="filter-inline-section"><span class="filter-inline-label">Currency</span><select class="select filter-inline-select"><option>AED</option><option>All</option></select></div>')}
    <div class="demo-loan-grid" style="margin-top:8px">${loanCards(mode)}</div>
  </div></section>`;
}

function renderInstallments() {
  return `<section id="installmentsPanel" class="panel active"><div class="card section">
    ${sectionHead("Installment Plans", "People moved here from taken loans can be tracked as installment plans.", '<button class="tiny ghost" id="installmentDetailsBtn"><i class="fa-solid fa-chart-pie"></i> Details</button><button class="tiny ghost" id="addInstallmentBtn">New Entry ▾</button>')}
    ${filterRow("Name or note", '<div class="filter-inline-section"><span class="filter-inline-label">Status</span><select class="select filter-inline-select"><option>All</option><option>Open/Partial</option><option>Closed</option></select></div><div class="filter-inline-section"><span class="filter-inline-label">Currency</span><select class="select filter-inline-select"><option>AED</option><option>All</option></select></div>')}
    <div class="demo-plan-grid" style="margin-top:8px">${state.installments.map(row=>{const rem=Math.max(0,row.total-row.paid);const p=Math.round(row.paid/row.total*100);return `<article class="demo-record-card" id="${row.id}"><div class="demo-record-card-head"><span class="demo-badge ${rem===0?'green':'orange'}">${rem===0?'Completed':row.status}</span>${row.id==='plan-equipment'&&rem>0?'<button class="tiny ghost" id="installmentPaymentBtn"><i class="fa-solid fa-plus"></i></button>':'<i class="fa-solid fa-calendar-days" style="color:var(--primary)"></i>'}</div><h4>${row.name}</h4><p>${row.count} installments · Total ${money(row.total)}</p><strong class="demo-record-value">Remaining ${money(rem)}</strong><div class="demo-record-meta"><span>Paid ${money(row.paid)}</span><span>${p}%</span></div><div class="demo-progress"><span style="--p:${p}%"></span></div></article>`}).join("")}</div>
  </div></section>`;
}

function renderNotes() {
  return `<section id="notesPanel" class="panel active"><div class="card section">
    ${sectionHead("Notes", "Keep important context, decisions, and reminders close to your work.", '<button class="btn primary tiny" id="newNoteBtn"><i class="fa-solid fa-plus"></i> New Note</button>')}
    ${filterRow("Search notes...")}
    <div class="demo-note-grid" style="margin-top:8px">${state.notes.map(row=>`<article class="card note-grid-card demo-record-card" id="${row.id}"><div class="demo-record-card-head"><span class="demo-badge ${row.reminder?'orange':''}">${row.reminder?'Reminder':'Note'}</span><i class="fa-solid fa-note-sticky" style="color:var(--primary)"></i></div><h4>${row.title}</h4><p>${row.body}</p><div class="demo-record-meta"><span>${row.reminder?'<i class="fa-solid fa-bell"></i> '+row.time:'No reminder'}</span>${row.id==='note-demo'?'<button class="tiny ghost" id="openNoteBtn">Open</button>':'<button class="tiny ghost">Open</button>'}</div></article>`).join("")}</div>
  </div></section>`;
}

function renderBitcoin() {
  return `<section id="bitcoinPanel" class="panel active"><div class="card section">
    ${sectionHead("Bitcoin Wallet", "Client-side wallet control with address views, receive/send workflows, and per-wallet transaction statements.", '<button class="tiny ghost" id="btcStatementBtn"><i class="fa-solid fa-file-lines"></i> Statement</button>')}
    <div class="demo-btc-layout"><article class="demo-btc-wallet"><div class="demo-record-card-head"><span class="demo-badge green">Watch-only demo</span><i class="fa-brands fa-bitcoin" style="color:#f59e0b;font-size:1rem"></i></div><h4 style="margin:8px 0 2px">Operations BTC</h4><p style="margin:0;color:var(--muted);font-size:.54rem">Native SegWit · Mainnet</p><div class="demo-btc-balance"><strong>0.042816 BTC</strong><span>Sample value · USD 4,612.18</span></div><div class="demo-address-box" id="bitcoinAddress">bc1qtriplemdemo7safewatchonly9q4v8x2</div><div class="demo-actions" style="margin-top:8px"><button class="btn primary tiny" id="receiveBitcoinBtn"><i class="fa-solid fa-qrcode"></i> Receive Bitcoin</button><button class="btn ghost tiny" id="copyBitcoinBtn"><i class="fa-solid fa-copy"></i> Copy</button></div><div class="demo-key-warning" id="bitcoinKeyNotice"><i class="fa-solid fa-key"></i><span>Private keys and seed phrases are intentionally absent from this public demo. Production sensitive key handling remains browser-side.</span></div></article><article class="demo-btc-activity"><div class="demo-card-head"><strong>Transaction History</strong><span class="demo-badge">Confirmed</span></div><div class="demo-activity-list"><div class="demo-activity-row"><i class="fa-solid fa-arrow-down"></i><span><strong>Received</strong><small>28 Aug · 8 confirmations</small></span><span class="demo-positive">+0.0125</span></div><div class="demo-activity-row"><i class="fa-solid fa-arrow-up"></i><span><strong>Sent</strong><small>24 Aug · Confirmed</small></span><span class="demo-negative">−0.0042</span></div><div class="demo-activity-row"><i class="fa-solid fa-arrow-down"></i><span><strong>Received</strong><small>17 Aug · Confirmed</small></span><span class="demo-positive">+0.0345</span></div></div></article></div>
  </div></section>`;
}

function renderMessages() {
  return `<section id="messagesPanel" class="panel active"><div class="card section">
    ${sectionHead("Messages", "Conversations with the administrator stay attached to their thread and remain available for follow-up.", '<button class="btn primary tiny" id="newMessageBtn"><i class="fa-solid fa-pen-to-square"></i> New Message</button>')}
    <div class="demo-messages-layout"><aside class="demo-thread-list"><div class="demo-thread-search"><input class="input" placeholder="Search conversations" /></div><div class="demo-thread-item active" id="supportThread"><div class="demo-thread-avatar">TV</div><span><strong>Triplem VIP Support</strong><small>Inventory audit report guidance</small></span><time>09:18</time></div><div class="demo-thread-item"><div class="demo-thread-avatar">AC</div><span><strong>Account</strong><small>Workspace access confirmation</small></span><time>Yesterday</time></div></aside><section class="demo-conversation"><header class="demo-conversation-head"><div><strong>Triplem VIP Support</strong><div style="color:var(--muted);font-size:.48rem">Administrator conversation</div></div><span class="demo-badge green">Open</span></header><div class="demo-chat-scroll" id="messagesChatScroll">${state.messages.map(m=>`<div class="demo-message ${m.mine?'me':''}">${m.text}<small>${m.who} · ${m.time}</small></div>`).join("")}</div><div class="demo-compose"><input class="input" id="messageComposer" placeholder="Write a message..." /><button class="btn primary" id="sendMessageBtn"><i class="fa-solid fa-paper-plane"></i></button></div></section></div>
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

async function moveCursor(selector, token) {
  assertToken(token);
  const el = $(selector);
  if (!el) return null;
  el.scrollIntoView({ block: "center", inline: "center", behavior: reducedMotion ? "auto" : "smooth" });
  await wait(420, token);
  const rect = el.getBoundingClientRect();
  const x = Math.max(7, Math.min(window.innerWidth - 28, rect.left + Math.max(5, Math.min(rect.width * .66, rect.width - 5))));
  const y = Math.max(7, Math.min(window.innerHeight - 32, rect.top + Math.max(5, Math.min(rect.height * .55, rect.height - 4))));
  const cursor = $("#demoCursor");
  cursor.classList.add("visible");
  cursor.style.transform = `translate3d(${x}px,${y}px,0)`;
  await wait(reducedMotion ? 260 : 760, token);
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

async function step(index, percent, token, pause = 1150) { setCue(index, percent); await wait(pause, token); }

async function runDashboard(token) {
  await step(0, 6, token); await demoClick(".demo-summary-card:nth-child(1)", token);
  await step(1, 24, token); await demoClick("#dashboardCurrencyBtn", token);
  await step(2, 45, token); await demoClick("#dashboardChart", token);
  await step(3, 68, token); await demoClick("#dashboardActivity .demo-activity-row:nth-child(2)", token);
  await step(4, 90, token); await demoClick("#dashboardDetailsBtn", token); openInfoModal({ title:"Dashboard Details", body:`<div class="demo-report-summary"><div><small>Money in</small><strong>${money(52500)}</strong></div><div><small>Money out</small><strong>${money(23800)}</strong></div><div><small>Net movement</small><strong>${money(28700)}</strong></div></div><div class="demo-chart-bars" style="height:180px"><span style="--h:70%" data-label="Wallets"></span><span style="--h:35%" data-label="Expenses"></span><span style="--h:58%" data-label="Assets"></span><span style="--h:43%" data-label="Loans"></span></div>` }); await wait(1500,token); closeModal();
}

async function runWallets(token) {
  await step(0, 5, token); await demoClick("#toggleWalletsBtn",token);
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
  await step(0, 7, token); await demoClick(".section-head h3",token);
  await step(1, 24, token); await demoClick("#addCustomerBtn",token); openForm({title:"Add Customer",body:`${field("customerName","Customer name")}${field("customerCompany","Company")}${field("customerPhone","Mobile")}${field("customerEmail","Email","email")}`}); await demoType("#customerName","Noor Studio",token); await demoType("#customerCompany","Noor Studio LLC",token); await demoType("#customerPhone","+971 50 882 1402",token); await demoClick("#modalSaveBtn",token); closeModal();state.customers.push({id:"customer-noor",name:"Noor Studio",company:"Noor Studio LLC",phone:"+971 50 882 1402",outstanding:0,history:[]});renderModule();showToast("Customer record created");
  await step(2, 43, token); await demoClick("#openCustomerBtn",token); openInfoModal({title:"Alpine Retail",body:`<div class="demo-report-summary"><div><small>Outstanding</small><strong>${money(180)}</strong></div><div><small>History</small><strong>2 entries</strong></div><div><small>Status</small><strong>Partial</strong></div></div><div class="demo-table-wrap"><table class="demo-table"><thead><tr><th>Type</th><th>Reference</th><th>Amount</th></tr></thead><tbody><tr><td>Invoice</td><td>INV-7D21AA</td><td>${money(380)}</td></tr><tr><td>Payment</td><td>Emirates NBD</td><td>${money(200)}</td></tr></tbody></table></div>`,primary:"Record payment",primaryId:"recordCustomerPaymentBtn"});
  await step(3, 66, token); await demoClick("#recordCustomerPaymentBtn",token); closeModal();openForm({title:"Customer Payment",body:`${field("customerPayment","Amount received","number")}${selectField("customerPaymentWallet","Add to wallet",walletOptions("bank"))}${field("customerPaymentNote","Note","text","",true)}`,primary:"Save payment"});await demoType("#customerPayment","180",token);await demoType("#customerPaymentNote","Invoice settled",token);await demoClick("#modalSaveBtn",token);closeModal();const alpine=state.customers.find(r=>r.id==='customer-alpine');alpine.outstanding=0;alpine.history.push("Payment · AED 180.00");state.wallets.find(r=>r.id==='bank').balance+=180;renderModule();showToast("Customer balance settled in full");
  await step(4, 91, token); await demoClick("#customer-alpine",token);
}

async function runAssets(token) {
  await step(0, 6, token); await demoClick("#ownedAssetsModeBtn",token);
  await step(1, 22, token); await demoClick("#addAssetBtn",token);openForm({title:"Add Asset",body:`${field("assetName","Asset name")}${selectField("assetType","Type",'<option>Equipment</option><option>Vehicle</option><option>Property</option>')}${field("assetDate","Purchase date","date","2026-08-30")}${field("assetPurchase","Purchase price","number")}${field("assetValue","Current valuation","number")}${field("assetDescription","Description","text","",true)}`});await demoType("#assetName","Camera Kit",token);await demoType("#assetPurchase","9500",token);await demoType("#assetValue","9500",token);await demoClick("#modalSaveBtn",token);closeModal();state.assets.push({id:"asset-camera",name:"Camera Kit",type:"Equipment",purchase:9500,value:9500,status:"Active"});renderModule();showToast("Asset added · Portfolio value updated");
  await step(2, 40, token); await demoClick("input[name='assetStatus']",token);
  await step(3, 55, token); await demoClick("#asset-camera",token);openInfoModal({title:"Camera Kit",body:`<div class="demo-report-summary"><div><small>Purchase price</small><strong>${money(9500)}</strong></div><div><small>Current value</small><strong>${money(9500)}</strong></div><div><small>Status</small><strong>Active</strong></div></div><p style="color:var(--muted);font-size:.7rem;line-height:1.6">Equipment asset purchased on 30 Aug 2026. Valuation can be updated independently of the purchase record.</p>`,primary:"Edit Asset",primaryId:"editAssetFromDetail"});await wait(1100,token);closeModal();
  await step(4, 73, token); await demoClick("#editAssetBtn",token);openForm({kicker:"Edit",title:"Camera Kit",body:`${field("assetEditName","Asset name","text","Camera Kit")}${field("assetEditValue","Current valuation","number","9500")}`,primary:"Save changes"});await demoType("#assetEditValue","10200",token);await demoClick("#modalSaveBtn",token);closeModal();state.assets.find(r=>r.id==='asset-camera').value=10200;renderModule();showToast("Valuation increased to AED 10,200.00");
  await step(5, 91, token); await demoClick("#assetsDetailsBtn",token);openInfoModal({title:"Assets Portfolio Details",body:`<div class="demo-report-summary"><div><small>Portfolio value</small><strong>${money(totalAssetValue())}</strong></div><div><small>Assets</small><strong>${state.assets.length}</strong></div><div><small>Currency</small><strong>AED</strong></div></div><div class="demo-chart-bars" style="height:160px"><span style="--h:82%" data-label="Vehicle"></span><span style="--h:34%" data-label="Equipment"></span><span style="--h:19%" data-label="Camera"></span></div>`});await wait(1500,token);closeModal();
}

async function runDepreciation(token) {
  await step(0, 6, token); await demoClick("#depAssetsModeBtn",token);
  await step(1, 22, token); await demoClick("#addDepAssetBtn",token);openForm({title:"Add Depreciation Asset",body:`${field("depName","Asset name")}${field("depCost","Cost","number")}${field("depSalvage","Salvage value","number")}${field("depLife","Useful life (years)","number")}${selectField("depMethod","Method",'<option>Straight line</option><option>Declining balance</option>')}${field("depDate","Acquisition date","date","2026-08-30")}`});await demoType("#depName","Camera Body",token);await demoType("#depCost","15000",token);await demoType("#depSalvage","3000",token);await demoType("#depLife","4",token);await demoClick("#modalSaveBtn",token);closeModal();state.depreciation.push({id:"dep-camera",name:"Camera Body",type:"Electronics",cost:15000,salvage:3000,life:4,accumulated:3000,book:12000,method:"Straight line"});renderModule();showToast("Depreciation asset created");
  await step(2, 42, token); await demoClick("#dep-camera",token);
  await step(3, 58, token); await demoClick("#dep-camera .demo-record-value",token);
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
  await step(3, 60, token); await demoClick("#plan-equipment .demo-progress",token);
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
  await step(3, 58, token); await demoClick(".demo-btc-activity .demo-activity-row:nth-child(1)",token);
  await step(4, 75, token); await demoClick("#bitcoinKeyNotice",token);
  await step(5, 92, token); await demoClick("#btcStatementBtn",token);showToast("Per-wallet statement tools opened visually");
}

async function runMessages(token) {
  await step(0, 6, token); await demoClick("#messagesPanel .section-head h3",token);
  await step(1, 22, token); await demoClick("#supportThread",token);
  await step(2, 40, token); await demoClick("#newMessageBtn",token);openForm({title:"New Message",body:`${selectField("messageRecipient","To",'<option>Administrator</option>')}${field("messageSubject","Subject")}${textareaField("newMessageBody","Message")}`,primary:"Open Composer"});await demoType("#messageSubject","Inventory audit report",token);await demoType("#newMessageBody","Could you please confirm what is included in the inventory audit workbook?",token);await demoClick("#modalSaveBtn",token);closeModal();renderModule();
  await step(3, 59, token); await demoType("#messageComposer","Thank you. I can see the audit report option now.",token);
  await step(4, 76, token); await demoClick("#sendMessageBtn",token);state.messages.push({who:"You",mine:true,text:"Thank you. I can see the audit report option now.",time:"Now"});renderModule();showToast("Message sent to administrator");
  await step(5, 91, token); await wait(900,token);state.messages.push({who:"Admin",mine:false,text:"Perfect. The workbook includes stock, costs, prices, quantities, brands, and audit-ready detail.",time:"Now"});renderModule();await demoClick("#messagesChatScroll .demo-message:last-child",token);showToast("Administrator reply received in the same thread");
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
}

async function runCurrent() {
  cancelPlayback();
  const token = playback.token;
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
    playback.running = false;
    playback.paused = false;
    completedModules.add(currentModule().key);
    currentTutorialStep = currentModule().steps.length;
    renderNavigation();
    renderTutorial();
    updatePlayButton();
    setProgress(100);
    $("#coachTitle").textContent = "Chapter complete";
    $("#coachText").textContent = "This workflow is complete. Choose another chapter or use Next to continue through the product.";
    $("#coachState").className = "coach-state";
    $("#coachState span:last-child").textContent = "Complete";
    $("#demoCursor").classList.remove("visible");
  } catch (error) {
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

function syncDeviceMode() {
  const mobile = window.matchMedia("(max-width: 700px)").matches;
  $("#productViewport").dataset.device = mobile ? "mobile" : "desktop";
  $("#demoDeviceBadge").innerHTML = mobile ? '<i class="fa-solid fa-mobile-screen-button"></i><span>Mobile view</span>' : '<i class="fa-solid fa-desktop"></i><span>Desktop view</span>';
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

document.addEventListener("click", event => {
  const tab = event.target.closest("[data-module-index]");
  if (tab) { setChapter(tab.dataset.moduleIndex); return; }
  const productTab = event.target.closest("[data-product-tab]");
  if (productTab) { setChapter(firstModuleForTab(productTab.dataset.productTab)); return; }
  if (event.target.closest("[data-demo-close]") || event.target.closest("#modalCloseBtn")) { closeModal(); return; }
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
