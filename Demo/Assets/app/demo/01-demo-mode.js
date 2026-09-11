/* Triplem VIP Demo Mode
 * Local-only runtime adapter. It keeps the production UI/business rules intact,
 * bypasses authentication, seeds realistic fictional data and replaces backend calls
 * with an in-memory PostgREST/RPC-compatible mock for the Demo folder only.
 */
(function demoModeBootstrap(global) {
  "use strict";

  const DEMO_OWNER_ID = "00000000-0000-4000-8000-000000000001";
  const DEMO_NOW = "2026-09-11T11:30:00.000Z";
  const iso = (date) => `${date}T09:00:00.000Z`;
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const id = name => `demo-${name}`;
  const owner = row => ({ owner_id: DEMO_OWNER_ID, ...row });

  function demoUser() {
    const tabs = [
      "dashboard", "expenses", "inventory", "reports", "accounting", "assets",
      "loans", "installments", "notes", "bitcoin", "settings", "currency_settings",
      "pdf_export", "customers", "admin_panel"
    ];
    const permissions = [];
    const actions = ["view", "create", "edit", "delete", "export", "import", "manage"];
    tabs.forEach(module => actions.forEach(action => permissions.push({ module, action, allowed: true })));
    return {
      id: DEMO_OWNER_ID,
      username: "demo@triplem.vip",
      display_name: "Ayaan Malik",
      role: "admin",
      account_type: "company",
      company_name: "Northstar Trading FZCO",
      company_email: "finance@northstar-demo.example",
      company_phone: "+971 50 555 0148",
      company_address: "Dubai Silicon Oasis, Dubai, UAE",
      vat_number: "100482735900003",
      allowed_tabs: tabs,
      allowed_currencies: ["AED", "SAR", "PKR", "USD", "EUR", "INR", "BTC"],
      permissions,
      smart_pin_enabled: false,
      settings: {
        Name: "Ayaan Malik",
        Company: "Northstar Trading FZCO",
        TRN: "100482735900003",
        email: "finance@northstar-demo.example",
        Mobile: "+971 50 555 0148",
        Address: "Dubai Silicon Oasis, Dubai, UAE",
        Currency: ["AED", "SAR", "PKR", "USD", "EUR", "INR", "BTC"],
        Tabs: tabs
      }
    };
  }

  function expenseNotes(base, meta) {
    if (typeof global.upsertExpenseMetaInNote === "function") return global.upsertExpenseMetaInNote(base || null, meta || {});
    const enc = v => encodeURIComponent(JSON.stringify(v || {}));
    const tags = [`[ATYPE:${meta.accountType || "Bank Account"}]`, `[ETYPE:${meta.rowType || "ACCOUNT"}]`];
    if (meta.itemName) tags.push(`[ITEM:${meta.itemName}]`);
    if (meta.expenseType) tags.push(`[XTYPE:${meta.expenseType}]`);
    if (meta.walletSortOrder != null) tags.push(`[WSORT:${meta.walletSortOrder}]`);
    if (meta.details && Object.keys(meta.details).length) tags.push(`[XDET:${enc(meta.details)}]`);
    if (meta.accountDetails && Object.keys(meta.accountDetails).length) tags.push(`[ADET:${enc(meta.accountDetails)}]`);
    return `[EXPENSE_ACCOUNT] ${String(base || "").trim()} ${tags.join(" ")}`.trim();
  }

  function goodsNotes(base, meta) {
    if (typeof global.upsertGoodsMetaInNote === "function") return global.upsertGoodsMetaInNote(base || null, meta || {});
    return `[GOODS] ${String(base || "").trim()}`.trim();
  }

  function installmentNotes(base, total, count, currency, start, downPayment, paymentMeta) {
    if (paymentMeta) {
      return typeof global.upsertInstallmentMetaInNote === "function"
        ? global.upsertInstallmentMetaInNote(base || null, paymentMeta)
        : base || null;
    }
    const schedule = typeof global.buildInstallmentScheduleMeta === "function"
      ? global.buildInstallmentScheduleMeta(total, count, currency, start, downPayment || 0)
      : { count, startDate: start, downPayment: downPayment || 0, frequency: "monthly" };
    return typeof global.upsertInstallmentMetaInNote === "function"
      ? global.upsertInstallmentMetaInNote(base || null, schedule)
      : base || null;
  }

  function seedLedger() {
    const rows = [];
    const push = row => rows.push({
      id: row.id || crypto.randomUUID(),
      owner_id: DEMO_OWNER_ID,
      created_at: row.created_at || iso(row.action_date || row.loan_date || "2026-01-01"),
      updated_at: row.updated_at || row.created_at || iso(row.action_date || row.loan_date || "2026-01-01"),
      data_origin: "demo",
      ...row
    });

    const wallet = (key, name, currency, opening, type, date, details, sort) => {
      const group = id(`wallet-${key}`);
      push({
        id: id(`wallet-${key}-principal`), group_id: group, direction: "taken", entry_kind: "principal",
        person_name: name, currency, principal_amount: opening, action_amount: null,
        loan_date: date, action_date: null,
        notes: expenseNotes("Demo financial account", { accountType: type, rowType: "ACCOUNT", accountDetails: details, walletSortOrder: sort }),
        meta: { etype: "ACCOUNT", sort_order: sort }
      });
      return group;
    };
    const topup = (walletId, key, name, currency, amount, date, note, type = "Bank Account") => push({
      id: id(`topup-${key}`), group_id: walletId, direction: "taken", entry_kind: "partial",
      person_name: name, currency, principal_amount: null, action_amount: amount,
      loan_date: date, action_date: date,
      notes: expenseNotes(note, { accountType: type, rowType: "TOPUP", details: { reference: `DEP-${key.toUpperCase()}` } })
    });
    const spend = (walletId, key, name, currency, amount, date, item, category, note, type = "Bank Account", tax = null) => push({
      id: id(`expense-${key}`), group_id: walletId, direction: "taken", entry_kind: "partial",
      person_name: name, currency, principal_amount: null, action_amount: amount,
      loan_date: date, action_date: date,
      notes: expenseNotes(note, {
        accountType: type, rowType: "EXPENSE", itemName: item, expenseType: category,
        details: { merchant: item, payment_method: name },
        ...(tax || {})
      })
    });

    const enbd = wallet("enbd", "Emirates NBD", "AED", 72500, "Bank Account", "2026-01-01", {
      holder_name: "Northstar Trading FZCO", iban: "AE070260001234567890123", account_number: "001234567890", branch: "Dubai Main Branch"
    }, 0);
    const cash = wallet("cash", "Office Cash", "AED", 8500, "Cash", "2026-01-01", { location: "Dubai office safe" }, 1);
    const mashreqUsd = wallet("mashreq-usd", "Mashreq USD", "USD", 18500, "Bank Account", "2026-02-01", {
      holder_name: "Northstar Trading FZCO", iban: "AE440330000001987654321", account_number: "01987654321", branch: "JLT Branch"
    }, 2);
    const riyad = wallet("riyad", "Riyad Bank", "SAR", 42000, "Bank Account", "2026-02-15", {
      holder_name: "Northstar Trading FZCO", iban: "SA0380000000608010167519", account_number: "608010167519"
    }, 3);
    const hbl = wallet("hbl", "HBL", "PKR", 1350000, "Bank Account", "2026-03-01", {
      holder_name: "Northstar Trading FZCO", iban: "PK36HABB0000123456789012", account_number: "123456789012"
    }, 4);
    const eur = wallet("eur", "Euro Business Wallet", "EUR", 12400, "Digital Wallet", "2026-03-05", { tag_id: "EU-DEMO-78421" }, 5);
    const inr = wallet("inr", "India Operations", "INR", 640000, "Bank Account", "2026-04-01", {
      holder_name: "Northstar India Desk", account_number: "031901002847", branch: "Mumbai", ifsc: "HDFC0000319"
    }, 6);

    topup(enbd, "enbd-may", "Emirates NBD", "AED", 45000, "2026-05-03", "Customer settlement received");
    topup(enbd, "enbd-aug", "Emirates NBD", "AED", 28000, "2026-08-02", "August operating capital");
    spend(enbd, "rent", "Emirates NBD", "AED", 12600, "2026-09-01", "Office Rent", "Rent", "September office lease", "Bank Account", { taxApplied: true, taxRate: 5, taxMode: "added", taxAmount: 600, netAmount: 12000, grossAmount: 12600 });
    spend(enbd, "cloud", "Emirates NBD", "AED", 1890, "2026-09-03", "Cloud Infrastructure", "Software", "Production hosting and storage", "Bank Account", { taxApplied: true, taxRate: 5, taxMode: "added", taxAmount: 90, netAmount: 1800, grossAmount: 1890 });
    spend(enbd, "ads", "Emirates NBD", "AED", 7350, "2026-09-05", "Digital Campaign", "Marketing", "Regional launch campaign");
    spend(cash, "courier", "Office Cash", "AED", 475, "2026-09-06", "Courier & Delivery", "Logistics", "Document deliveries", "Cash");
    spend(cash, "pantry", "Office Cash", "AED", 310, "2026-09-08", "Office Pantry", "Office", "Weekly refreshments", "Cash");
    topup(mashreqUsd, "usd-client", "Mashreq USD", "USD", 7200, "2026-08-20", "International client receipt");
    spend(mashreqUsd, "saas", "Mashreq USD", "USD", 790, "2026-09-02", "SaaS Licences", "Software", "Monthly software licences");
    spend(riyad, "ksa-logistics", "Riyad Bank", "SAR", 4200, "2026-09-04", "KSA Logistics", "Logistics", "Warehouse transport");
    spend(hbl, "pak-payroll", "HBL", "PKR", 285000, "2026-09-01", "Pakistan Team Payroll", "Payroll", "September payroll");
    spend(eur, "eu-sub", "Euro Business Wallet", "EUR", 980, "2026-09-05", "EU Compliance Subscription", "Professional", "Annual compliance tools", "Digital Wallet");
    spend(inr, "india-vendor", "India Operations", "INR", 83500, "2026-09-07", "India Vendor Settlement", "Suppliers", "September vendor settlement");

    const loanGiven = id("loan-given-ahmad");
    push({ id: id("loan-given-ahmad-p"), group_id: loanGiven, direction: "given", entry_kind: "principal", person_name: "Ahmad Khan", currency: "AED", principal_amount: 25000, action_amount: null, loan_date: "2026-05-10", action_date: null, notes: "Business bridge financing" });
    push({ id: id("loan-given-ahmad-r1"), group_id: loanGiven, direction: "given", entry_kind: "partial", person_name: "Ahmad Khan", currency: "AED", principal_amount: null, action_amount: 5000, loan_date: "2026-05-10", action_date: "2026-06-15", notes: "First repayment received" });
    push({ id: id("loan-given-ahmad-r2"), group_id: loanGiven, direction: "given", entry_kind: "partial", person_name: "Ahmad Khan", currency: "AED", principal_amount: null, action_amount: 4000, loan_date: "2026-05-10", action_date: "2026-08-12", notes: "Second repayment received" });

    const loanTaken = id("loan-taken-skyline");
    push({ id: id("loan-taken-skyline-p"), group_id: loanTaken, direction: "taken", entry_kind: "principal", person_name: "Skyline Capital", currency: "AED", principal_amount: 60000, action_amount: null, loan_date: "2026-04-18", action_date: null, notes: "Working-capital facility" });
    push({ id: id("loan-taken-skyline-r1"), group_id: loanTaken, direction: "taken", entry_kind: "partial", person_name: "Skyline Capital", currency: "AED", principal_amount: null, action_amount: 10000, loan_date: "2026-04-18", action_date: "2026-07-18", notes: "Principal repayment" });

    const loanUsd = id("loan-given-olivia");
    push({ id: id("loan-given-olivia-p"), group_id: loanUsd, direction: "given", entry_kind: "principal", person_name: "Olivia Carter", currency: "USD", principal_amount: 8500, action_amount: null, loan_date: "2026-07-02", action_date: null, notes: "Short-term project financing" });
    push({ id: id("loan-given-olivia-r1"), group_id: loanUsd, direction: "given", entry_kind: "partial", person_name: "Olivia Carter", currency: "USD", principal_amount: null, action_amount: 1500, loan_date: "2026-07-02", action_date: "2026-08-02", notes: "Repayment received" });

    const instBought = id("installment-macbook");
    push({ id: id("installment-macbook-p"), group_id: instBought, direction: "taken", installment_plan_type: "bought", entry_kind: "principal", person_name: "MacBook Pro Fleet", currency: "AED", principal_amount: 18000, action_amount: null, loan_date: "2026-05-01", action_date: null, notes: installmentNotes("Six-month equipment plan", 18000, 6, "AED", "2026-05-01", 3000) });
    push({ id: id("installment-macbook-down"), group_id: instBought, direction: "taken", installment_plan_type: "bought", entry_kind: "partial", person_name: "MacBook Pro Fleet", currency: "AED", principal_amount: null, action_amount: 3000, loan_date: "2026-05-01", action_date: "2026-05-01", notes: installmentNotes("Down payment", 0, 0, "AED", "2026-05-01", 0, { paymentType: "down_payment" }) });
    push({ id: id("installment-macbook-pay1"), group_id: instBought, direction: "taken", installment_plan_type: "bought", entry_kind: "partial", person_name: "MacBook Pro Fleet", currency: "AED", principal_amount: null, action_amount: 2500, loan_date: "2026-05-01", action_date: "2026-06-01", notes: installmentNotes("June instalment", 0, 0, "AED", "2026-05-01", 0, { paymentType: "installment" }) });
    push({ id: id("installment-macbook-pay2"), group_id: instBought, direction: "taken", installment_plan_type: "bought", entry_kind: "partial", person_name: "MacBook Pro Fleet", currency: "AED", principal_amount: null, action_amount: 2500, loan_date: "2026-05-01", action_date: "2026-07-01", notes: installmentNotes("July instalment", 0, 0, "AED", "2026-05-01", 0, { paymentType: "installment" }) });
    push({ id: id("installment-macbook-pay3"), group_id: instBought, direction: "taken", installment_plan_type: "bought", entry_kind: "partial", person_name: "MacBook Pro Fleet", currency: "AED", principal_amount: null, action_amount: 2500, loan_date: "2026-05-01", action_date: "2026-08-01", notes: installmentNotes("August instalment", 0, 0, "AED", "2026-05-01", 0, { paymentType: "installment" }) });

    const instSold = id("installment-office-set");
    push({ id: id("installment-office-set-p"), group_id: instSold, direction: "given", installment_plan_type: "sold", entry_kind: "principal", person_name: "Vertex Studio LLC", currency: "AED", principal_amount: 12000, action_amount: null, loan_date: "2026-07-15", action_date: null, notes: installmentNotes("Office equipment sold on plan", 12000, 4, "AED", "2026-07-15", 2000) });
    push({ id: id("installment-office-set-down"), group_id: instSold, direction: "given", installment_plan_type: "sold", entry_kind: "partial", person_name: "Vertex Studio LLC", currency: "AED", principal_amount: null, action_amount: 2000, loan_date: "2026-07-15", action_date: "2026-07-15", notes: installmentNotes("Advance received", 0, 0, "AED", "2026-07-15", 0, { paymentType: "down_payment" }) });
    push({ id: id("installment-office-set-pay1"), group_id: instSold, direction: "given", installment_plan_type: "sold", entry_kind: "partial", person_name: "Vertex Studio LLC", currency: "AED", principal_amount: null, action_amount: 2500, loan_date: "2026-07-15", action_date: "2026-08-15", notes: installmentNotes("First instalment received", 0, 0, "AED", "2026-07-15", 0, { paymentType: "installment" }) });

    const item = (key, name, currency, qty, unit, date, code, category, brand, variant, note) => {
      const group = id(`inventory-${key}`);
      push({ id: id(`inventory-${key}-p`), group_id: group, direction: "goods", entry_kind: "principal", person_name: name, currency, principal_amount: qty * unit, action_amount: null, loan_date: date, action_date: null,
        notes: goodsNotes(note, { boughtQty: qty, unitActualPrice: unit, itemCode: code, itemDescription: note, itemType: "Product", itemCategory: category, quantityUnit: "pcs", brand, variantLabel: variant, sellBy: "unit", transactionType: "PURCHASE", taxApplied: false }) });
      return group;
    };
    const sale = (group, key, name, currency, qty, unitSale, date, customer, invoice, costHint, category, brand, variant) => push({
      id: id(`inventory-${key}-sale`), group_id: group, direction: "goods", entry_kind: "partial", person_name: name, currency, principal_amount: null, action_amount: qty * unitSale, loan_date: date, action_date: date,
      notes: goodsNotes("Demo sale", { soldQty: qty, unitSoldPrice: unitSale, customerName: customer, invoiceNumber: invoice, receiptNumber: `R-${invoice}`, transactionType: "SALE", itemCategory: category, brand, variantLabel: variant, paidAmount: qty * unitSale, balanceAmount: 0, paymentStatus: "Paid", unitActualPrice: costHint })
    });
    const iph = item("iphone", "iPhone 16 Pro 256GB", "AED", 24, 3450, "2026-07-05", "APL-IP16P-256", "Electronics", "Apple", "Natural Titanium", "Retail smartphone stock");
    sale(iph, "iphone-a", "iPhone 16 Pro 256GB", "AED", 5, 4099, "2026-08-09", "Blue Horizon LLC", "INV-2026-0819", 3450, "Electronics", "Apple", "Natural Titanium");
    sale(iph, "iphone-b", "iPhone 16 Pro 256GB", "AED", 7, 3999, "2026-09-02", "Walk-in Customer", "INV-2026-0907", 3450, "Electronics", "Apple", "Natural Titanium");
    const dell = item("dell", "Dell XPS 14", "USD", 10, 1480, "2026-06-18", "DLL-XPS14", "Electronics", "Dell", "32GB / 1TB", "High-performance laptop inventory");
    sale(dell, "dell-a", "Dell XPS 14", "USD", 3, 1790, "2026-08-25", "Orion Consulting", "INV-USD-014", 1480, "Electronics", "Dell", "32GB / 1TB");
    const water = item("water", "Premium Mineral Water 500ml", "AED", 360, 1.15, "2026-08-10", "FMCG-WTR-500", "Food & Beverage", "Al Ain", "500ml", "Office and event beverage stock");
    sale(water, "water-a", "Premium Mineral Water 500ml", "AED", 120, 2.25, "2026-09-04", "Event Supply Co.", "INV-2026-0911", 1.15, "Food & Beverage", "Al Ain", "500ml");

    return rows;
  }

  const demoTables = {
    app_assets: [
      owner({ id: id("asset-tesla"), name: "Tesla Model Y Long Range", asset_type: "vehicle", description: "Company operations vehicle", currency: "AED", purchase_date: "2025-11-12", purchase_price: 189900, status: "active", sale_date: null, sale_price: null, sale_costs: 0, sale_notes: "", meta: { registration: "Dubai A 48321" }, is_deleted: false, created_at: iso("2025-11-12"), updated_at: DEMO_NOW }),
      owner({ id: id("asset-server"), name: "Dell PowerEdge R760", asset_type: "equipment", description: "Private infrastructure server", currency: "USD", purchase_date: "2026-02-20", purchase_price: 12800, status: "active", sale_date: null, sale_price: null, sale_costs: 0, sale_notes: "", meta: { serial: "R760-DEMO-901" }, is_deleted: false, created_at: iso("2026-02-20"), updated_at: DEMO_NOW }),
      owner({ id: id("asset-forklift"), name: "Toyota 8FBE Forklift", asset_type: "equipment", description: "Warehouse handling equipment", currency: "AED", purchase_date: "2024-09-08", purchase_price: 87000, status: "active", sale_date: null, sale_price: null, sale_costs: 0, sale_notes: "", meta: {}, is_deleted: false, created_at: iso("2024-09-08"), updated_at: DEMO_NOW })
    ],
    app_asset_transactions: [
      owner({ id: id("at-tesla-insurance"), asset_id: id("asset-tesla"), tx_type: "operating", tx_label: null, amount: 5250, tx_date: "2026-01-10", notes: "Annual comprehensive insurance", meta: {}, is_deleted: false, created_at: iso("2026-01-10"), updated_at: iso("2026-01-10") }),
      owner({ id: id("at-tesla-service"), asset_id: id("asset-tesla"), tx_type: "maintenance", tx_label: null, amount: 1450, tx_date: "2026-07-23", notes: "Tyres and preventive service", meta: {}, is_deleted: false, created_at: iso("2026-07-23"), updated_at: iso("2026-07-23") }),
      owner({ id: id("at-server-upgrade"), asset_id: id("asset-server"), tx_type: "additional_investment", tx_label: null, amount: 1850, tx_date: "2026-06-11", notes: "Memory expansion", meta: {}, is_deleted: false, created_at: iso("2026-06-11"), updated_at: iso("2026-06-11") }),
      owner({ id: id("at-forklift-repair"), asset_id: id("asset-forklift"), tx_type: "repair", tx_label: null, amount: 3200, tx_date: "2026-04-16", notes: "Hydraulic repair", meta: {}, is_deleted: false, created_at: iso("2026-04-16"), updated_at: iso("2026-04-16") })
    ],
    depreciation_assets: [
      owner({ id: id("dep-office-fitout"), name: "Dubai Office Fit-out", description: "Leasehold improvements", asset_type: "property", purchase_date: "2025-01-01", purchase_price: 240000, salvage_value: 0, useful_life_years: 5, depreciation_method: "straight_line", in_service_date: "2025-01-01", declining_rate: null, units_capacity: null, last_review_date: "2026-01-01", disposal_proceeds: null, currency: "AED", status: "active", monthly_depreciation: 4000, annual_depreciation: 48000, accumulated_depreciation: 80000, current_book_value: 160000, meta: {}, is_deleted: false, created_at: iso("2025-01-01"), updated_at: DEMO_NOW }),
      owner({ id: id("dep-production-machine"), name: "Packaging Line P-240", description: "Warehouse packaging machine", asset_type: "equipment", purchase_date: "2026-01-15", purchase_price: 160000, salvage_value: 16000, useful_life_years: 6, depreciation_method: "diminishing_balance", in_service_date: "2026-02-01", declining_rate: 25, units_capacity: null, last_review_date: "2026-07-01", disposal_proceeds: null, currency: "AED", status: "active", monthly_depreciation: 3333.33, annual_depreciation: 40000, accumulated_depreciation: 23333.31, current_book_value: 136666.69, meta: {}, is_deleted: false, created_at: iso("2026-01-15"), updated_at: DEMO_NOW })
    ],
    depreciation_history: [],
    depreciation_usage_entries: [],
    app_notes: [
      owner({ id: id("note-quarter-close"), content: "Reconcile all bank wallets, confirm open supplier bills, review VAT ledger, and export the management pack before 30 September.", notes: JSON.stringify({ title: "Q3 close checklist", content: "Reconcile all bank wallets, confirm open supplier bills, review VAT ledger, and export the management pack before 30 September.", rowType: "NOTE" }), meta: { rowType: "NOTE", title: "Q3 close checklist" }, is_deleted: false, created_at: iso("2026-09-06"), updated_at: iso("2026-09-06") }),
      owner({ id: id("note-vendor"), content: "Vertex Studio requested consolidated monthly invoices. Use finance@vertex-demo.example for statement delivery.", notes: JSON.stringify({ title: "Vertex billing note", content: "Vertex Studio requested consolidated monthly invoices. Use finance@vertex-demo.example for statement delivery.", rowType: "NOTE" }), meta: { rowType: "NOTE", title: "Vertex billing note" }, is_deleted: false, created_at: iso("2026-08-21"), updated_at: iso("2026-08-21") }),
      owner({ id: id("note-expansion"), content: "Evaluate Riyadh satellite office budget in SAR and compare six-month rent scenarios before the October review.", notes: JSON.stringify({ title: "KSA expansion", content: "Evaluate Riyadh satellite office budget in SAR and compare six-month rent scenarios before the October review.", rowType: "NOTE" }), meta: { rowType: "NOTE", title: "KSA expansion" }, is_deleted: false, created_at: iso("2026-08-12"), updated_at: iso("2026-08-12") })
    ],
    bitcoin_wallets: [
      owner({ id: id("btc-treasury"), label: "Treasury Cold Wallet", address: "bc1q4demo7n5x3w9k8r2s6t0p4m8v3c7z5q2d9demo", network: "mainnet", is_watch_only: true, currency: "BTC", notes: JSON.stringify({ rowType: "BITCOIN_WALLET" }), meta: { rowType: "BITCOIN_WALLET" }, is_deleted: false, created_at: iso("2026-02-04") }),
      owner({ id: id("btc-ops"), label: "Operations Watch Wallet", address: "bc1q9demo2p6s4v8y3m7n5x1r0t2k6c8w4z9demo", network: "mainnet", is_watch_only: true, currency: "BTC", notes: JSON.stringify({ rowType: "BITCOIN_WALLET" }), meta: { rowType: "BITCOIN_WALLET" }, is_deleted: false, created_at: iso("2026-06-19") })
    ],
    accounting_settings: [owner({ id: id("acct-settings"), base_currency: "AED", fiscal_year_start_month: 1, corporate_tax_rate: 9, corporate_tax_threshold: 375000, created_at: iso("2026-01-01"), updated_at: DEMO_NOW })],
    accounting_accounts: [
      owner({ id: id("acc-cash"), code: "1000", name: "Cash and Bank", account_type: "asset", normal_balance: "debit", is_system: true, is_active: true, created_at: iso("2026-01-01") }),
      owner({ id: id("acc-ar"), code: "1100", name: "Accounts Receivable", account_type: "asset", normal_balance: "debit", is_system: true, is_active: true, created_at: iso("2026-01-01") }),
      owner({ id: id("acc-inventory"), code: "1200", name: "Inventory", account_type: "asset", normal_balance: "debit", is_system: true, is_active: true, created_at: iso("2026-01-01") }),
      owner({ id: id("acc-ap"), code: "2000", name: "Accounts Payable", account_type: "liability", normal_balance: "credit", is_system: true, is_active: true, created_at: iso("2026-01-01") }),
      owner({ id: id("acc-vat"), code: "2100", name: "VAT Payable", account_type: "liability", normal_balance: "credit", is_system: true, is_active: true, created_at: iso("2026-01-01") }),
      owner({ id: id("acc-capital"), code: "3000", name: "Owner Capital", account_type: "equity", normal_balance: "credit", is_system: true, is_active: true, created_at: iso("2026-01-01") }),
      owner({ id: id("acc-sales"), code: "4000", name: "Sales Revenue", account_type: "revenue", normal_balance: "credit", is_system: false, is_active: true, created_at: iso("2026-01-01") }),
      owner({ id: id("acc-services"), code: "4100", name: "Service Revenue", account_type: "revenue", normal_balance: "credit", is_system: false, is_active: true, created_at: iso("2026-01-01") }),
      owner({ id: id("acc-cogs"), code: "5000", name: "Cost of Goods Sold", account_type: "expense", normal_balance: "debit", is_system: false, is_active: true, created_at: iso("2026-01-01") }),
      owner({ id: id("acc-rent"), code: "6100", name: "Rent Expense", account_type: "expense", normal_balance: "debit", is_system: false, is_active: true, created_at: iso("2026-01-01") }),
      owner({ id: id("acc-software"), code: "6200", name: "Software & Cloud", account_type: "expense", normal_balance: "debit", is_system: false, is_active: true, created_at: iso("2026-01-01") })
    ],
    accounting_contacts: [
      owner({ id: id("contact-blue"), name: "Blue Horizon LLC", contact_type: "customer", email: "accounts@bluehorizon-demo.example", phone: "+971 4 555 0120", tax_number: "100382711900003", payment_terms_days: 30, is_active: true, created_at: iso("2026-02-02") }),
      owner({ id: id("contact-orion"), name: "Orion Consulting", contact_type: "customer", email: "finance@orion-demo.example", phone: "+1 415 555 0196", tax_number: "", payment_terms_days: 14, is_active: true, created_at: iso("2026-03-10") }),
      owner({ id: id("contact-cloud"), name: "Nimbus Cloud Services", contact_type: "supplier", email: "billing@nimbus-demo.example", phone: "+971 4 555 0190", tax_number: "100993155800003", payment_terms_days: 30, is_active: true, created_at: iso("2026-01-22") })
    ],
    accounting_dimensions: [
      owner({ id: id("dim-dubai"), code: "DXB", name: "Dubai Operations", dimension_type: "branch", is_active: true, created_at: iso("2026-01-01") }),
      owner({ id: id("dim-digital"), code: "DIG", name: "Digital Products", dimension_type: "department", is_active: true, created_at: iso("2026-01-01") })
    ],
    accounting_tax_codes: [
      owner({ id: id("tax-vat5"), code: "VAT5", name: "UAE VAT 5%", rate: 5, tax_type: "vat", recoverable_rate: 100, is_active: true, created_at: iso("2026-01-01") }),
      owner({ id: id("tax-zero"), code: "ZERO", name: "Zero Rated", rate: 0, tax_type: "vat", recoverable_rate: 100, is_active: true, created_at: iso("2026-01-01") })
    ],
    accounting_journals: [
      owner({ id: id("j-opening"), journal_no: "JV-2026-0001", journal_date: "2026-01-01", reference: "OPEN-2026", description: "Opening balances", currency: "AED", fx_rate: 1, status: "posted", posted_at: iso("2026-01-01"), created_at: iso("2026-01-01") }),
      owner({ id: id("j-rent"), journal_no: "JV-2026-0087", journal_date: "2026-09-01", reference: "RENT-SEP", description: "September office rent", currency: "AED", fx_rate: 1, status: "posted", posted_at: iso("2026-09-01"), created_at: iso("2026-09-01") }),
      owner({ id: id("j-adjust"), journal_no: "JV-2026-0092", journal_date: "2026-09-09", reference: "ACCRUAL-09", description: "Month-end cloud accrual", currency: "AED", fx_rate: 1, status: "draft", posted_at: null, created_at: iso("2026-09-09") })
    ],
    accounting_journal_lines: [
      owner({ id: id("jl-open-cash"), journal_id: id("j-opening"), account_id: id("acc-cash"), description: "Opening bank balance", debit: 180000, credit: 0, currency: "AED", fx_rate: 1, base_debit: 180000, base_credit: 0, created_at: iso("2026-01-01") }),
      owner({ id: id("jl-open-cap"), journal_id: id("j-opening"), account_id: id("acc-capital"), description: "Opening capital", debit: 0, credit: 180000, currency: "AED", fx_rate: 1, base_debit: 0, base_credit: 180000, created_at: iso("2026-01-01") }),
      owner({ id: id("jl-rent-exp"), journal_id: id("j-rent"), account_id: id("acc-rent"), description: "September rent", debit: 12000, credit: 0, currency: "AED", fx_rate: 1, base_debit: 12000, base_credit: 0, created_at: iso("2026-09-01") }),
      owner({ id: id("jl-rent-bank"), journal_id: id("j-rent"), account_id: id("acc-cash"), description: "Rent payment", debit: 0, credit: 12000, currency: "AED", fx_rate: 1, base_debit: 0, base_credit: 12000, created_at: iso("2026-09-01") }),
      owner({ id: id("jl-adj-soft"), journal_id: id("j-adjust"), account_id: id("acc-software"), description: "Cloud accrual", debit: 1800, credit: 0, currency: "AED", fx_rate: 1, base_debit: 1800, base_credit: 0, created_at: iso("2026-09-09") }),
      owner({ id: id("jl-adj-ap"), journal_id: id("j-adjust"), account_id: id("acc-ap"), description: "Cloud accrual", debit: 0, credit: 1800, currency: "AED", fx_rate: 1, base_debit: 0, base_credit: 1800, created_at: iso("2026-09-09") })
    ],
    accounting_documents: [
      owner({ id: id("doc-sales-1"), document_no: "SI-2026-0042", doc_type: "sales_invoice", contact_id: id("contact-blue"), issue_date: "2026-08-09", supply_date: "2026-08-09", due_date: "2026-09-08", currency: "AED", fx_rate: 1, reference: "BH-PO-771", notes: "Smartphone inventory supply", subtotal: 19519.05, tax_amount: 975.95, total_amount: 20495, paid_amount: 15000, balance_amount: 5495, status: "posted", is_deleted: false, created_at: iso("2026-08-09") }),
      owner({ id: id("doc-purchase-1"), document_no: "PB-2026-0031", doc_type: "purchase_bill", contact_id: id("contact-cloud"), issue_date: "2026-09-03", supply_date: "2026-09-03", due_date: "2026-10-03", currency: "AED", fx_rate: 1, reference: "NC-SEP-261", notes: "September cloud services", subtotal: 1800, tax_amount: 90, total_amount: 1890, paid_amount: 0, balance_amount: 1890, status: "posted", is_deleted: false, created_at: iso("2026-09-03") }),
      owner({ id: id("doc-quote-1"), document_no: "QT-2026-0018", doc_type: "quotation", contact_id: id("contact-orion"), issue_date: "2026-09-08", supply_date: "2026-09-08", due_date: "2026-09-22", currency: "USD", fx_rate: 3.6725, reference: "ORION-Q3", notes: "Consulting hardware proposal", subtotal: 8250, tax_amount: 0, total_amount: 8250, paid_amount: 0, balance_amount: 8250, status: "draft", is_deleted: false, created_at: iso("2026-09-08") })
    ],
    accounting_document_lines: [
      owner({ id: id("dl-sales-1"), document_id: id("doc-sales-1"), item_code: "APL-IP16P-256", description: "iPhone 16 Pro 256GB", quantity: 5, unit_price: 3903.81, discount_amount: 0, tax_code_id: id("tax-vat5"), account_id: id("acc-sales"), dimension_id: id("dim-dubai"), line_subtotal: 19519.05, tax_amount: 975.95, line_total: 20495, created_at: iso("2026-08-09") }),
      owner({ id: id("dl-purchase-1"), document_id: id("doc-purchase-1"), item_code: "CLOUD-SEP", description: "Cloud infrastructure", quantity: 1, unit_price: 1800, discount_amount: 0, tax_code_id: id("tax-vat5"), account_id: id("acc-software"), dimension_id: id("dim-digital"), line_subtotal: 1800, tax_amount: 90, line_total: 1890, created_at: iso("2026-09-03") })
    ],
    accounting_payments: [
      owner({ id: id("payment-blue-1"), document_id: id("doc-sales-1"), amount: 15000, payment_date: "2026-08-20", account_id: id("acc-cash"), reference: "ENBD-784112", notes: "Part receipt", fx_rate: 1, created_at: iso("2026-08-20") })
    ],
    accounting_bank_transactions: [
      owner({ id: id("banktx-rent"), transaction_date: "2026-09-01", description: "LANDLORD RENT SEP", reference: "FT2624411", amount: -12600, currency: "AED", account_id: id("acc-cash"), status: "matched", matched_journal_id: id("j-rent"), created_at: iso("2026-09-01") }),
      owner({ id: id("banktx-client"), transaction_date: "2026-09-07", description: "CLIENT RECEIPT ALPHA", reference: "CR2611908", amount: 28500, currency: "AED", account_id: id("acc-cash"), status: "unmatched", matched_journal_id: null, created_at: iso("2026-09-07") })
    ],
    accounting_audit_log: [
      owner({ id: id("audit-1"), action: "journal.posted", entity_type: "journal", entity_id: id("j-rent"), description: "Posted September office rent journal", actor_name: "Ayaan Malik", created_at: iso("2026-09-01") }),
      owner({ id: id("audit-2"), action: "document.posted", entity_type: "document", entity_id: id("doc-purchase-1"), description: "Posted supplier bill PB-2026-0031", actor_name: "Ayaan Malik", created_at: iso("2026-09-03") })
    ]
  };

  function ensureDepHistory() {
    if (demoTables.depreciation_history.length) return;
    const asset = demoTables.depreciation_assets[0];
    let before = asset.purchase_price;
    for (let month = 2; month <= 9; month++) {
      const amount = 4000;
      demoTables.depreciation_history.push(owner({
        id: id(`dep-hist-${month}`), depreciation_asset_id: asset.id,
        period_date: `2026-${String(month).padStart(2, "0")}-01`, depreciation_amount: amount,
        book_value_before: before, book_value_after: before - amount, created_at: iso(`2026-${String(month).padStart(2, "0")}-01`)
      }));
      before -= amount;
    }
  }
  ensureDepHistory();

  function parseBody(body) {
    if (body == null || body === "") return null;
    if (typeof body === "string") {
      try { return JSON.parse(body); } catch (_) { return body; }
    }
    return clone(body);
  }

  function splitPath(path) {
    const text = String(path || "");
    const q = text.indexOf("?");
    return { table: q >= 0 ? text.slice(0, q) : text, query: new URLSearchParams(q >= 0 ? text.slice(q + 1) : "") };
  }

  function eqMatch(rowValue, wanted) {
    if (wanted === "null") return rowValue == null;
    if (wanted === "true" || wanted === "false") return Boolean(rowValue) === (wanted === "true");
    return String(rowValue ?? "") === String(wanted ?? "");
  }

  function applyQuery(rows, query) {
    let out = rows.slice();
    for (const [key, value] of query.entries()) {
      if (["select", "order", "limit", "offset", "on_conflict"].includes(key) || key === "or") continue;
      if (value.startsWith("eq.")) out = out.filter(row => eqMatch(row[key], value.slice(3)));
      else if (value.startsWith("neq.")) out = out.filter(row => !eqMatch(row[key], value.slice(4)));
      else if (value.startsWith("is.")) out = out.filter(row => eqMatch(row[key], value.slice(3)));
      else if (value.startsWith("ilike.")) {
        const token = value.slice(6).replace(/^\*|\*$/g, "").toLowerCase();
        out = out.filter(row => String(row[key] ?? "").toLowerCase().includes(token));
      } else if (value.startsWith("in.(") && value.endsWith(")")) {
        const allowed = value.slice(4, -1).split(",").map(v => decodeURIComponent(v).replace(/^"|"$/g, ""));
        out = out.filter(row => allowed.includes(String(row[key] ?? "")));
      } else if (value.startsWith("gte.")) out = out.filter(row => String(row[key] ?? "") >= value.slice(4));
      else if (value.startsWith("lte.")) out = out.filter(row => String(row[key] ?? "") <= value.slice(4));
    }
    const order = query.get("order");
    if (order) {
      const parts = order.split(",").map(s => s.trim()).filter(Boolean);
      out.sort((a, b) => {
        for (const part of parts) {
          const [field, dir] = part.split(".");
          const av = a[field], bv = b[field];
          if (av === bv) continue;
          const cmp = Number.isFinite(Number(av)) && Number.isFinite(Number(bv)) ? Number(av) - Number(bv) : String(av ?? "").localeCompare(String(bv ?? ""));
          if (cmp) return dir === "desc" ? -cmp : cmp;
        }
        return 0;
      });
    }
    const offset = Math.max(0, Number(query.get("offset") || 0));
    const limit = Number(query.get("limit") || 0);
    if (offset) out = out.slice(offset);
    if (limit > 0) out = out.slice(0, limit);
    return out;
  }

  async function demoSupabase(path, options = {}) {
    const { table, query } = splitPath(path);
    if (!demoTables[table]) demoTables[table] = [];
    const method = String(options.method || "GET").toUpperCase();
    const rows = demoTables[table];
    if (method === "GET") return clone(applyQuery(rows, query));
    const body = parseBody(options.body);
    if (method === "POST") {
      const incoming = Array.isArray(body) ? body : [body || {}];
      const inserted = incoming.map(raw => {
        const next = { id: raw.id || crypto.randomUUID(), owner_id: raw.owner_id || DEMO_OWNER_ID, created_at: raw.created_at || new Date().toISOString(), updated_at: raw.updated_at || new Date().toISOString(), ...clone(raw) };
        const existingIndex = rows.findIndex(r => String(r.id) === String(next.id));
        if (existingIndex >= 0) rows[existingIndex] = { ...rows[existingIndex], ...next };
        else rows.push(next);
        return next;
      });
      return clone(inserted);
    }
    const matches = applyQuery(rows, query);
    const ids = new Set(matches.map(r => String(r.id)));
    if (method === "PATCH") {
      const patch = body && typeof body === "object" ? body : {};
      const changed = [];
      rows.forEach((row, index) => {
        if (ids.has(String(row.id))) {
          rows[index] = { ...row, ...clone(patch), updated_at: patch.updated_at || new Date().toISOString() };
          changed.push(rows[index]);
        }
      });
      return clone(changed);
    }
    if (method === "DELETE") {
      const removed = [];
      for (let i = rows.length - 1; i >= 0; i--) {
        if (ids.has(String(rows[i].id))) removed.push(...rows.splice(i, 1));
      }
      return clone(removed);
    }
    return [];
  }

  function addAudit(action, entityType, entityId, description) {
    demoTables.accounting_audit_log.unshift(owner({ id: crypto.randomUUID(), action, entity_type: entityType, entity_id: entityId, description, actor_name: "Ayaan Malik", created_at: new Date().toISOString() }));
  }

  function nextNo(prefix, table, field) {
    const count = (demoTables[table] || []).length + 1;
    return `${prefix}-2026-${String(count).padStart(4, "0")}`;
  }

  function saveAccountingJournal(args) {
    const header = clone(args.p_journal || {});
    const jid = header.id || crypto.randomUUID();
    let row = demoTables.accounting_journals.find(x => x.id === jid);
    const base = owner({ id: jid, journal_no: row?.journal_no || nextNo("JV", "accounting_journals", "journal_no"), status: row?.status || "draft", posted_at: row?.posted_at || null, created_at: row?.created_at || new Date().toISOString(), ...header });
    if (row) Object.assign(row, base); else demoTables.accounting_journals.push(base);
    demoTables.accounting_journal_lines = demoTables.accounting_journal_lines.filter(x => x.journal_id !== jid);
    (args.p_lines || []).forEach((line, i) => demoTables.accounting_journal_lines.push(owner({ id: crypto.randomUUID(), journal_id: jid, created_at: new Date().toISOString(), line_no: i + 1, ...clone(line), base_debit: Number(line.debit || 0) * Number(line.fx_rate || 1), base_credit: Number(line.credit || 0) * Number(line.fx_rate || 1) })));
    addAudit("journal.saved", "journal", jid, `Saved journal ${base.journal_no}`);
    return { id: jid, journal_no: base.journal_no };
  }

  function documentTotals(lines) {
    let subtotal = 0, tax = 0;
    (lines || []).forEach(line => {
      const gross = Math.max(0, Number(line.quantity || 0) * Number(line.unit_price || 0) - Number(line.discount_amount || 0));
      const code = demoTables.accounting_tax_codes.find(t => t.id === line.tax_code_id);
      const t = gross * Number(code?.rate || 0) / 100;
      subtotal += gross; tax += t;
    });
    return { subtotal, tax_amount: tax, total_amount: subtotal + tax };
  }

  function saveAccountingDocument(args) {
    const doc = clone(args.p_document || {}), lines = clone(args.p_lines || []);
    const did = doc.id || crypto.randomUUID();
    let row = demoTables.accounting_documents.find(x => x.id === did);
    const prefix = ({ sales_invoice: "SI", quotation: "QT", sales_order: "SO", delivery_note: "DN", credit_note: "CN", sales_return: "SR", purchase_order: "PO", purchase_receipt: "PR", purchase_bill: "PB", debit_note: "DB", purchase_return: "PRT", expense_invoice: "EI" })[doc.doc_type] || "DOC";
    const totals = documentTotals(lines);
    const base = owner({ id: did, document_no: row?.document_no || nextNo(prefix, "accounting_documents", "document_no"), status: row?.status || "draft", paid_amount: Number(row?.paid_amount || 0), balance_amount: totals.total_amount - Number(row?.paid_amount || 0), is_deleted: false, created_at: row?.created_at || new Date().toISOString(), ...doc, ...totals });
    if (row) Object.assign(row, base); else demoTables.accounting_documents.push(base);
    demoTables.accounting_document_lines = demoTables.accounting_document_lines.filter(x => x.document_id !== did);
    lines.forEach((line, i) => {
      const totalsL = documentTotals([line]);
      demoTables.accounting_document_lines.push(owner({ id: crypto.randomUUID(), document_id: did, line_no: i + 1, created_at: new Date().toISOString(), ...line, line_subtotal: totalsL.subtotal, tax_amount: totalsL.tax_amount, line_total: totalsL.total_amount }));
    });
    addAudit("document.saved", "document", did, `Saved ${base.document_no}`);
    return { id: did, document_no: base.document_no };
  }

  function sampleAiAnswer(message) {
    const q = String(message || "").toLowerCase();
    if (q.includes("vat")) return "Your demo books show UAE VAT activity in both operating expenses and posted documents. The largest recent VAT-bearing items are office rent and cloud services. Review the Tax workspace for the period breakdown before filing.";
    if (q.includes("inventory")) return "Inventory is healthy overall. iPhone 16 Pro is moving fastest, Dell XPS remains well stocked, and mineral water has steady turnover. The inventory workspace contains purchase cost, selling price, stock balance and sales history for each item.";
    if (q.includes("expense")) return "September expenses are concentrated in rent, marketing, payroll, cloud infrastructure and regional logistics. Open Expenses to inspect each wallet, transaction history, VAT treatment and PDFs.";
    if (q.includes("loan")) return "The demo has both loans given and taken, with partial repayments. Ahmad Khan and Olivia Carter are receivables, while Skyline Capital is a payable facility. Open Loans for schedules, balances and transaction PDFs.";
    return "This is the local Triplem AI demo. I can explain the fictional dashboard, expenses, accounting, inventory, loans, installments, assets, notes and Bitcoin sample data without sending anything to a server.";
  }

  const demoInquiries = [
    { id: id("inq-1"), subject: "Invoice clarification", status: "open", unread_count: 1, last_message_at: iso("2026-09-10"), created_at: iso("2026-09-10"), user_id: DEMO_OWNER_ID, display_name: "Ayaan Malik" },
    { id: id("inq-2"), subject: "Asset report format", status: "closed", unread_count: 0, last_message_at: iso("2026-09-03"), created_at: iso("2026-09-02"), user_id: DEMO_OWNER_ID, display_name: "Ayaan Malik" }
  ];
  const demoThreads = {
    [id("inq-1")]: [
      { id: id("msg-1"), inquiry_id: id("inq-1"), sender_role: "user", sender_name: "Ayaan Malik", body: "Can the invoice PDF include the company TRN?", created_at: iso("2026-09-10") },
      { id: id("msg-2"), inquiry_id: id("inq-1"), sender_role: "admin", sender_name: "Support", body: "Yes. Company identity and TRN are included from your configured profile.", created_at: "2026-09-10T10:15:00.000Z" }
    ]
  };

  async function demoRpc(name, args = {}) {
    switch (String(name || "")) {
      case "app_accounting_bootstrap_defaults": return { ok: true };
      case "app_accounting_save_journal": return saveAccountingJournal(args);
      case "app_accounting_post_journal": {
        const j = demoTables.accounting_journals.find(x => x.id === args.p_journal_id); if (j) { j.status = "posted"; j.posted_at = new Date().toISOString(); addAudit("journal.posted", "journal", j.id, `Posted ${j.journal_no}`); } return { ok: true };
      }
      case "app_accounting_void_journal": {
        const j = demoTables.accounting_journals.find(x => x.id === args.p_journal_id); if (j) { if (j.status === "draft") demoTables.accounting_journals = demoTables.accounting_journals.filter(x => x.id !== j.id); else j.status = "void"; addAudit("journal.voided", "journal", j.id, `Voided ${j.journal_no}`); } return { ok: true };
      }
      case "app_accounting_save_document": return saveAccountingDocument(args);
      case "app_accounting_post_document": {
        const d = demoTables.accounting_documents.find(x => x.id === args.p_document_id); if (d) { d.status = "posted"; addAudit("document.posted", "document", d.id, `Posted ${d.document_no}`); } return { ok: true };
      }
      case "app_accounting_cancel_document": {
        const d = demoTables.accounting_documents.find(x => x.id === args.p_document_id); if (d) { if (d.status === "draft") d.is_deleted = true; else d.status = "cancelled"; addAudit("document.cancelled", "document", d.id, `Cancelled ${d.document_no}`); } return { ok: true };
      }
      case "app_accounting_convert_document": {
        const src = demoTables.accounting_documents.find(x => x.id === args.p_source_id); if (!src) return {};
        const newId = crypto.randomUUID();
        const target = args.p_target_type || "sales_invoice";
        const copy = owner({ ...clone(src), id: newId, doc_type: target, document_no: nextNo(target === "sales_invoice" ? "SI" : "DOC", "accounting_documents", "document_no"), status: "draft", paid_amount: 0, balance_amount: Number(src.total_amount || 0), created_at: new Date().toISOString() });
        demoTables.accounting_documents.push(copy); return { id: newId, document_no: copy.document_no };
      }
      case "app_accounting_record_payment": {
        const d = demoTables.accounting_documents.find(x => x.id === args.p_document_id); const amount = Number(args.p_amount || 0);
        if (d) { d.paid_amount = Number(d.paid_amount || 0) + amount; d.balance_amount = Math.max(0, Number(d.total_amount || 0) - d.paid_amount); if (d.balance_amount <= 0.00000001) d.status = "paid"; }
        demoTables.accounting_payments.push(owner({ id: crypto.randomUUID(), document_id: args.p_document_id, amount, account_id: args.p_account_id, payment_date: args.p_payment_date, reference: args.p_reference, notes: args.p_notes, fx_rate: args.p_fx_rate || 1, created_at: new Date().toISOString() }));
        addAudit("payment.recorded", "payment", args.p_document_id, "Recorded document payment"); return { ok: true };
      }
      case "app_accounting_match_bank_transaction": { const tx = demoTables.accounting_bank_transactions.find(x => x.id === args.p_bank_transaction_id); if (tx) { tx.status = "matched"; tx.matched_journal_id = args.p_journal_id; } return { ok: true }; }
      case "app_accounting_unmatch_bank_transaction": { const tx = demoTables.accounting_bank_transactions.find(x => x.id === args.p_bank_transaction_id); if (tx) { tx.status = "unmatched"; tx.matched_journal_id = null; } return { ok: true }; }
      case "app_list_my_asset_summaries": throw new Error("Could not find function app_list_my_asset_summaries in schema cache");
      case "app_two_factor_status": return { enabled: true, recovery_remaining: 7, configured_at: "2026-08-18T08:20:00.000Z" };
      case "app_get_smart_pin_status": return { enabled: true, smart_pin_enabled: true };
      case "app_account_security_status": return {
        two_factor_enabled: true,
        passkey_enabled: true,
        smart_pin_enabled: true,
        quick_sign_in_enabled: true,
        smart_pin_bypass_enabled: false,
        current_browser_trusted_for_two_factor: false,
        active_session_count: 2
      };
      case "app_account_security_sessions": return {
        active: [
          { id: id("session-current"), current: true, auth_method: "two_factor_totp", user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/152.0", last_seen_at: DEMO_NOW, created_at: "2026-09-11T08:05:00.000Z" },
          { id: id("session-mobile"), current: false, auth_method: "biometric_passkey", user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 20_0 like Mac OS X) Version/20.0 Mobile Safari", last_seen_at: "2026-09-10T20:42:00.000Z", created_at: "2026-09-09T17:20:00.000Z" }
        ],
        history: [
          { id: id("history-1"), status: "success", auth_method: "two_factor_totp", user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/152.0", created_at: "2026-09-11T08:05:00.000Z" },
          { id: id("history-2"), status: "success", auth_method: "biometric_passkey", user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 20_0 like Mac OS X) Version/20.0 Mobile Safari", created_at: "2026-09-10T20:42:00.000Z" },
          { id: id("history-3"), status: "failed", auth_method: "password", user_agent: "Mozilla/5.0 (X11; Linux x86_64) Firefox/142.0", created_at: "2026-09-08T06:15:00.000Z" }
        ]
      };
      case "app_two_factor_trusted_devices": return { devices: [
        { id: id("trusted-laptop"), label: "Office Laptop", current: false, user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/152.0", expires_at: "2026-10-05T08:00:00.000Z" },
        { id: id("trusted-phone"), label: "Ayaan iPhone", current: false, user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 20_0 like Mac OS X) Version/20.0 Mobile Safari", expires_at: "2026-10-02T18:00:00.000Z" }
      ] };
      case "app_account_recovery_status": return { recovery_key_enabled: true, passkey_enabled: true, current_device_trusted: false, trusted_device_count: 2 };
      case "app_account_recovery_trusted_devices": return { devices: [
        { id: id("recovery-laptop"), label: "Office Laptop", current: false, user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/152.0", expires_at: "2026-10-05T08:00:00.000Z" },
        { id: id("recovery-phone"), label: "Ayaan iPhone", current: false, user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 20_0 like Mac OS X) Version/20.0 Mobile Safari", expires_at: "2026-10-02T18:00:00.000Z" }
      ] };
      case "app_account_recovery_pending_device_requests": return { ok: true, requests: [] };
      case "app_account_security_verify_trusted_browser": return { ok: true, trusted: false };
      case "app_account_security_revoke_other_sessions":
      case "app_account_security_revoke_session":
      case "app_account_security_revoke_other_trusted_browsers_v2":
      case "app_account_security_revoke_trusted_browser_v2":
      case "app_account_security_delete_login_history":
      case "app_account_security_set_standard_biometric_preferences": return { ok: true };
      case "app_triplem_ai_access_status": return { allowed: true, configured: true, key_mask: "DEMO••••••••LOCAL", model: "gemini-3.8-flash", configured_at: DEMO_NOW, last_tested_at: DEMO_NOW, last_used_at: DEMO_NOW };
      case "app_admin_sync_currency_registry": return { ok: true };
      case "app_validate_session": return { valid: true, user: demoUser() };
      case "app_list_my_inquiries": return clone(demoInquiries);
      case "app_admin_list_inquiries": return clone(demoInquiries);
      case "app_get_inquiry_thread": return clone(demoThreads[args.p_inquiry_id] || []);
      case "app_submit_inquiry":
      case "app_admin_start_conversation": {
        const iid = crypto.randomUUID(); const row = { id: iid, subject: args.p_subject || "Demo conversation", status: "open", unread_count: 0, last_message_at: new Date().toISOString(), created_at: new Date().toISOString(), user_id: DEMO_OWNER_ID, display_name: "Ayaan Malik" }; demoInquiries.unshift(row); demoThreads[iid] = [{ id: crypto.randomUUID(), inquiry_id: iid, sender_role: "user", sender_name: "Ayaan Malik", body: args.p_body || "Demo message", created_at: new Date().toISOString() }]; return row;
      }
      case "app_reply_inquiry": { const iid = args.p_inquiry_id; demoThreads[iid] = demoThreads[iid] || []; demoThreads[iid].push({ id: crypto.randomUUID(), inquiry_id: iid, sender_role: "user", sender_name: "Ayaan Malik", body: args.p_body || "Demo reply", created_at: new Date().toISOString() }); return { ok: true }; }
      case "app_mark_inquiry_read": return { ok: true };
      case "app_delete_my_inquiry":
      case "app_admin_delete_inquiry": return { ok: true };
      case "app_admin_list_users": return [demoUser(), { id: id("user-2"), username: "sara@northstar-demo.example", display_name: "Sara Ahmed", role: "user", account_type: "individual", status: "active", allowed_currencies: ["AED", "USD"], allowed_tabs: ["dashboard", "expenses", "inventory", "loans", "notes"] }];
      case "app_admin_list_message_recipients": return [{ id: id("user-2"), username: "sara@northstar-demo.example", display_name: "Sara Ahmed" }];
      case "app_messaging_sync_state": return { inquiries: clone(demoInquiries), notifications: [] };
      case "app_list_my_notifications":
      case "app_admin_list_notifications": return [];
      case "app_mark_all_my_notifications_read":
      case "app_admin_mark_all_notifications_read":
      case "app_mark_my_notification_read":
      case "app_admin_mark_notification_read":
      case "app_delete_my_notification":
      case "app_admin_delete_notification": return { ok: true };
      case "app_list_my_note_reminders":
      case "app_list_my_installment_reminders": return [];
      case "app_create_note_reminder":
      case "app_update_note_reminder":
      case "app_delete_note_reminder":
      case "app_create_installment_reminder":
      case "app_ensure_installment_due_notice":
      case "app_dispatch_due_note_reminders": return { ok: true };
      case "app_my_subscription_request_details": return { status: "active", plan: "pro_yearly", demo: true };
      case "app_live_chat_my_actionable_offers":
      case "app_live_chat_transfer_candidates": return [];
      case "app_live_chat_presence_sweep":
      case "app_live_chat_agent_end":
      case "app_live_chat_request_transfer": return { ok: true };
      default: return { ok: true };
    }
  }

  const realFetch = global.fetch ? global.fetch.bind(global) : null;
  function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
  }
  global.fetch = async function demoFetch(input, init = {}) {
    const url = typeof input === "string" ? input : String(input?.url || input || "");
    if (/demo\.triplem\.local|\/functions\/v1\/triplem-ai/i.test(url)) {
      let body = {}; try { body = JSON.parse(init?.body || "{}"); } catch (_) {}
      if (url.includes("triplem-ai")) {
        const action = body.action || "chat";
        if (action === "chat") return jsonResponse({ ok: true, answer: sampleAiAnswer(body.message), records: [], references: [{ label: "Demo data", detail: "Local fictional Triplem VIP workspace" }], drafts: [], model: "gemini-3.8-flash" });
        if (action === "list_drafts") return jsonResponse({ ok: true, drafts: [] });
        if (["save_key", "update_model", "test_key"].includes(action)) return jsonResponse({ ok: true, allowed: true, configured: true, key_mask: "DEMO••••••••LOCAL", model: body.model || "gemini-3.8-flash" });
        if (action === "delete_key") return jsonResponse({ ok: true });
        return jsonResponse({ ok: true });
      }
      return jsonResponse({ ok: true });
    }
    if (/api\.country\.is/i.test(url)) return jsonResponse({ country: "AE", ip: "203.0.113.42" });
    if (/api\.coingecko\.com/i.test(url)) return jsonResponse({ bitcoin: { usd: 112450.25, usd_24h_change: 1.84 } });
    if (/blockstream\.info|mempool\.space/i.test(url)) {
      if (/fee-estimates/.test(url)) return jsonResponse({ "1": 10, "2": 8, "3": 6, "6": 4 });
      if (/\/address\//.test(url) && /\/utxo/.test(url)) return jsonResponse([{ txid: "9d2f1a2b3c4d5e6f7890abcdeffedcba0123456789abcdef0123456789abcdef", vout: 0, value: 18750000, status: { confirmed: true, block_height: 910321 } }]);
      if (/\/address\//.test(url) && /\/txs/.test(url)) return jsonResponse([]);
      if (/\/address\//.test(url)) return jsonResponse({ chain_stats: { funded_txo_sum: 32350000, spent_txo_sum: 13600000, tx_count: 12 }, mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 } });
      return jsonResponse({});
    }
    return realFetch ? realFetch(input, init) : Promise.reject(new Error("Fetch unavailable"));
  };

  function applyDemoData() {
    const ledger = seedLedger();
    if (typeof global.applyEntries === "function") global.applyEntries(ledger, "backup", { hasImportedFile: false });
    else state.entries = ledger;
    state.dataSource = "backup";
    state.hasImportedFile = false;
    state.loadedLedgerScopes = new Set(["expenses", "goods", "loans-given", "loans-taken", "installments"]);
    state.notes = demoTables.app_notes.map(row => {
      let parsed = {}; try { parsed = JSON.parse(row.notes || "{}"); } catch (_) {}
      return { id: row.id, title: parsed.title || row.meta?.title || "Note", content: row.content || parsed.content || "", createdAt: row.created_at, meta: row.meta || {}, is_legacy_meta: false, data_origin: "domain", domain_table: "app_notes" };
    });
    state.notesLoaded = true;
    state.bitcoinWallets = demoTables.bitcoin_wallets.map(row => ({ id: row.id, address: row.address, label: row.label, network: row.network, is_watch_only: true, createdAt: row.created_at, is_legacy_meta: false, data_origin: "domain", domain_table: "bitcoin_wallets" }));
    state.bitcoinWalletsLoaded = true;
    state.bitcoin.btcPrice = 112450.25;
    state.bitcoin.priceChange = 1.84;
    state.bitcoin.lastPriceUpdate = Date.now();
    state.recycleBin = [];
  }

  function installDemoBadge() {
    if (document.getElementById("triplemDemoBadge")) return;
    const badge = document.createElement("div");
    badge.id = "triplemDemoBadge";
    badge.setAttribute("role", "status");
    badge.innerHTML = '<i class="fa-solid fa-flask" aria-hidden="true"></i><span>Interactive Demo</span><button type="button" id="triplemDemoReset" title="Reset fictional demo data"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i></button>';
    badge.style.cssText = "position:fixed;right:14px;bottom:14px;z-index:2147482000;display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--line,#d8dde8);border-radius:999px;background:color-mix(in srgb,var(--card,#fff) 92%,transparent);color:var(--text,#172033);box-shadow:0 8px 24px rgba(15,23,42,.14);font:600 12px/1.2 system-ui,-apple-system,Segoe UI,sans-serif;backdrop-filter:blur(10px)";
    const btnCss = "border:0;background:transparent;color:inherit;cursor:pointer;padding:2px 4px;border-radius:999px";
    document.body.appendChild(badge);
    const btn = document.getElementById("triplemDemoReset");
    if (btn) { btn.style.cssText = btnCss; btn.onclick = () => { try { sessionStorage.removeItem("triplem-demo-touched"); } catch (_) {} global.location.reload(); }; }
  }

  // Disable production persistence in Demo. All mutations live only for this page session.
  global.loadBackupEntriesFromStorage = () => seedLedger();
  global.saveBackupEntries = () => {};
  global.saveRecycleBinToStorage = () => {};
  global.loadRecycleBinFromStorage = () => { state.recycleBin = []; return state.recycleBin; };
  global.removeStoredSessionCredentials = () => {};
  global.supabase = demoSupabase;
  global.supabaseRpc = demoRpc;
  // Never allow the production lazy ledger loader to replace local demo entries.
  global.databaseSessionCanLoad = () => false;

  // Keep logout inside the demo instead of exposing the production login screen.
  global.doLogout = function demoLogout() { global.location.reload(); };

  // Make Bitcoin APIs deterministic and local even when the UI requests refreshes.
  if (typeof global.btcFetchPrice === "function") {
    global.btcFetchPrice = async () => { state.bitcoin.btcPrice = 112450.25; state.bitcoin.priceChange = 1.84; state.bitcoin.lastPriceUpdate = Date.now(); return { price: 112450.25, change: 1.84 }; };
  }
  if (typeof global.btcFetchAddressStats === "function") {
    global.btcFetchAddressStats = async () => ({
      stats: { chain_stats: { funded_txo_sum: 32350000, spent_txo_sum: 13600000, tx_count: 12 }, mempool_stats: {} },
      utxos: [{ txid: "9d2f1a2b3c4d5e6f7890abcdeffedcba0123456789abcdef0123456789abcdef", vout: 0, value: 18750000, status: { confirmed: true, block_height: 910321 } }],
      balanceSat: 18750000, receivedSat: 32350000, sentSat: 13600000, txCount: 12
    });
  }

  global.autoLogin = async function demoAutoLogin() {
    const user = demoUser();
    try { runtimeConfig = { supabaseUrl: "https://demo.triplem.local", supabaseKey: "demo-local-key" }; } catch (_) {}
    state.unlocked = true;
    state.guestMode = false;
    state.trialLocked = false;
    state.sessionToken = "demo-local-session";
    state.sessionRememberMe = false;
    state.currentUsername = user.username;
    state.secretPinHash = "";
    state.secretPinVerified = true;
    state.pageCurrency = "AED";
    state.lastCurrency = "AED";
    try { global.applyUserProfileToConfig(user); } catch (_) { state.sessionUser = user; state.permissions = user.permissions; }
    state.triplemAi.access = true;
    state.triplemAi.configured = true;
    state.triplemAi.keyMask = "DEMO••••••••LOCAL";
    state.triplemAi.model = "gemini-3.8-flash";
    state.triplemAi.configuredAt = DEMO_NOW;
    state.triplemAi.lastTestedAt = DEMO_NOW;
    state.triplemAi.lastUsedAt = DEMO_NOW;
    state.triplemAi.statusLoaded = true;
    applyDemoData();
    try { global.updateLogosFromConfig?.(); global.updateHeaderTextFromConfig?.(); } catch (_) {}
    try { global.applyPermissionGates?.(); } catch (_) {}
    await global.enterAppAfterUnlock(false, { instant: true, deferTabLoad: true });
    try { global.renderAll?.(); } catch (_) {}
    try { global.renderNotes?.(); } catch (_) {}
    try { global.renderBitcoinWallets?.(); global.renderExistingAddressesDropdown?.(); global.btcUpdatePriceDisplay?.(); } catch (_) {}
    try { global.refreshTriplemAiAccessState?.({ force: true }); } catch (_) {}
    installDemoBadge();
    return true;
  };

  global.TriplemDemo = {
    enabled: true,
    ownerId: DEMO_OWNER_ID,
    reset() { global.location.reload(); },
    tables: demoTables,
    reseed: applyDemoData
  };
})(window);
