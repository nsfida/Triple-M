/* Triplem VIP Insurance module, migration 179. */
(function (global) {
  "use strict";

  const VIEWS = [
    ["sales", "Sales", "fa-receipt"],
    ["commission", "My Commission", "fa-hand-holding-dollar"],
    ["referrals", "Referrals", "fa-user-group"],
    ["customers", "Customers/Balances", "fa-users"],
    ["companies", "Companies", "fa-building-shield"],
    ["policies", "Policies", "fa-file-shield"],
    ["reports", "Reports", "fa-chart-column"],
    ["temporary", "Temporary Invoices", "fa-file-pen"]
  ];
  const S = {
    ready: false,
    loading: false,
    view: "sales",
    companies: [], policies: [], sales: [], customers: [], tempInvoices: [],
    total: 0, offset: 0, limit: 25, hasMore: false,
    summary: { total: 0, by_currency: [] },
    filters: { start: "", end: "", search: "", company: "", policy: "", customer: "" },
    reportView: "commission",
    commissions: [], commissionTotal: 0, commissionOffset: 0, commissionLimit: 50, commissionHasMore: false,
    commissionSummary: { total: 0, by_currency: [] },
    commissionFilters: { start: "", end: "", search: "", company: "", status: "" },
    commissionReceipts: [], openingBalances: [], openingBalanceTotal: 0,
    referrals: [], referralTransactions: [], referrerDirectory: [], referralTotal: 0, referralOffset: 0, referralLimit: 50, referralHasMore: false,
    referralSummary: { total: 0, by_currency: [] }, referralFilters: { start: "", end: "", search: "", status: "" },
    customerBalances: [], customerBalanceTotal: 0, customerBalanceOffset: 0, customerBalanceLimit: 50, customerBalanceHasMore: false,
    customerBalanceFilters: { search: "", status: "outstanding" }, customerAccountTransactions: []
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = value => typeof escapeHtml === "function"
    ? escapeHtml(String(value ?? ""))
    : String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  const n = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const rpc = (name, args = {}) => {
    if (typeof supabaseRpc !== "function") return Promise.reject(new Error("Database connection is unavailable."));
    return supabaseRpc(name, args);
  };
  const can = action => {
    if (typeof userHasPermission !== "function" || !userHasPermission("insurance", action)) return false;
    if (["create", "edit"].includes(action) && typeof teamCanShowEdit === "function" && !teamCanShowEdit("invoices")) return false;
    if (action === "delete" && typeof teamCanShowDelete === "function" && !teamCanShowDelete("invoices")) return false;
    return true;
  };
  const moneyHtml = (amount, currency) => typeof money === "function" ? money(amount, currency) : `${esc(currency)} ${n(amount).toFixed(2)}`;
  const moneyPlain = (amount, currency) => typeof moneyText === "function" ? moneyText(amount, currency) : `${currency} ${n(amount).toFixed(2)}`;
  const dateToday = () => {
    const d = new Date();
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
  };
  const timeNow = () => new Date().toTimeString().slice(0, 5);
  const fmtDate = value => {
    if (!value) return "";
    try { return new Date(`${value}T00:00:00`).toLocaleDateString(); } catch (_) { return String(value); }
  };
  const fmtTime = value => String(value || "").slice(0, 5);
  const formatPolicyDuration = value => { const days=Math.max(0,Math.trunc(n(value))); if(days===0)return "Same day"; if(days===1)return "1 day"; return `${days.toLocaleString()} days`; };
  const currencyOptions = selected => {
    const allowed = typeof getAllowedCurrencies === "function" ? getAllowedCurrencies() : [];
    const list = allowed.length ? allowed : ["AED"];
    const current = normalizeCurrencyCode?.(selected || list[0]) || selected || list[0];
    return list.map(code => `<option value="${esc(code)}" data-currency="${esc(code)}" ${code === current ? "selected" : ""}>${esc(code)}</option>`).join("");
  };
  const currentCurrency = () => {
    const allowed = typeof getAllowedCurrencies === "function" ? getAllowedCurrencies() : [];
    return normalizeCurrencyCode?.(allowed[0] || "AED") || allowed[0] || "AED";
  };

  function notify(message, type = "success") {
    if (typeof showEntryConfirmation === "function") {
      showEntryConfirmation(message, type === "error" ? "error" : type);
      return;
    }
    let box = $("#insuranceNotice");
    if (!box) {
      box = document.createElement("div");
      box.id = "insuranceNotice";
      box.className = "insurance-warning hide";
      $("#insurancePanel .insurance-shell")?.prepend(box);
    }
    if (!box) return;
    box.textContent = message;
    box.classList.remove("hide", "loss");
    if (type === "error") box.classList.add("loss");
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => box.classList.add("hide"), 4200);
  }

  function ensureModal(id) {
    let modal = document.getElementById(id);
    if (!modal) {
      modal = document.createElement("div");
      modal.id = id;
      modal.className = "modal hide insurance-modal";
      modal.setAttribute("aria-hidden", "true");
      document.body.appendChild(modal);
    }
    return modal;
  }

  function openModal({ id = "insuranceModal", title, subtitle = "", body = "", actions = "", onOpen = null, wide = false }) {
    const modal = ensureModal(id);
    modal.innerHTML = `
      <div class="modal-backdrop" data-insurance-close></div>
      <div class="modal-dialog ${wide ? "insurance-document-dialog" : "insurance-entry-dialog compact-entry-dialog"}" role="dialog" aria-modal="true">
        <div class="modal-head"><div><h3>${esc(title)}</h3>${subtitle ? `<p>${esc(subtitle)}</p>` : ""}</div><button class="icon-btn ghost" type="button" data-insurance-close aria-label="Close">×</button></div>
        <div class="modal-body">${body}</div>
        ${actions ? `<div class="modal-footer">${actions}</div>` : ""}
      </div>`;
    const close = () => { closeInsuranceFloatingMenu(); modal.classList.add("hide"); modal.setAttribute("aria-hidden", "true"); };
    $$('[data-insurance-close]', modal).forEach(el => el.onclick = close);
    modal.classList.remove("hide"); modal.setAttribute("aria-hidden", "false");
    onOpen?.(modal, close);
    return modal;
  }

  function closeInsuranceFloatingMenu() {
    const menu = document.getElementById("insuranceFloatingMenu");
    if (menu) menu.remove();
    $$('[data-insurance-row-menu][aria-expanded="true"]').forEach(btn => btn.setAttribute("aria-expanded", "false"));
  }

  function positionInsuranceFloatingMenu(menu, anchor) {
    if (!menu || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const pad = 8;
    menu.style.visibility = "hidden";
    menu.style.display = "grid";
    const box = menu.getBoundingClientRect();
    let left = rect.right - box.width;
    left = Math.max(pad, Math.min(left, window.innerWidth - box.width - pad));
    let top = rect.bottom + 4;
    if (top + box.height > window.innerHeight - pad) top = Math.max(pad, rect.top - box.height - 4);
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
    menu.style.visibility = "visible";
  }

  function openInsuranceFloatingMenu(anchor, items = []) {
    closeInsuranceFloatingMenu();
    const usable = items.filter(Boolean);
    if (!usable.length) return;
    const menu = document.createElement("div");
    menu.id = "insuranceFloatingMenu";
    menu.className = "insurance-floating-menu";
    const isCustomerTransactionMenu = anchor?.dataset?.insuranceRowMenu === "customerTransaction";
    if (isCustomerTransactionMenu) {
      menu.classList.add("insurance-customer-documents-dropdown");
      // Critical desktop layout is also applied inline. This prevents a stale or
      // partially cached stylesheet from ever turning the document dropdown into
      // an in-row action strip inside the customer statement ledger.
      Object.assign(menu.style, {
        position: "fixed",
        zIndex: "2147483647",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr)",
        gridAutoFlow: "row",
        width: "196px",
        minWidth: "196px",
        maxWidth: "calc(100vw - 16px)",
        padding: "4px",
        gap: "2px",
        boxSizing: "border-box"
      });
    }
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", isCustomerTransactionMenu ? "Transaction documents" : "Actions");
    menu.innerHTML = usable.map((item, index) => `<button type="button" role="menuitem" data-insurance-floating-action="${index}" class="${item.danger ? "danger" : ""}"><i class="fa-solid ${esc(item.icon || "fa-circle")}"></i><span>${esc(item.label)}</span></button>`).join("");
    if (isCustomerTransactionMenu) {
      $$('[data-insurance-floating-action]', menu).forEach(button => Object.assign(button.style, {
        display: "grid",
        gridTemplateColumns: "15px minmax(0, 1fr)",
        alignItems: "center",
        width: "100%",
        minHeight: "28px",
        padding: "5px 7px",
        gap: "6px",
        boxSizing: "border-box",
        textAlign: "left",
        whiteSpace: "nowrap"
      }));
    }
    const themeSource = anchor.closest?.(".insurance-modal") || anchor.closest?.("#insurancePanel") || anchor;
    if (themeSource) {
      const theme = getComputedStyle(themeSource);
      ["--insurance-surface", "--insurance-soft", "--insurance-line", "--insurance-primary"].forEach(name => {
        const value = theme.getPropertyValue(name).trim();
        if (value) menu.style.setProperty(name, value);
      });
    }
    // Customer transaction menus live at the document root so no body/modal
    // stacking or overflow context can make them participate in the ledger row.
    (isCustomerTransactionMenu ? document.documentElement : document.body).appendChild(menu);
    anchor.setAttribute("aria-expanded", "true");
    positionInsuranceFloatingMenu(menu, anchor);
    $$('[data-insurance-floating-action]', menu).forEach(btn => btn.onclick = async e => {
      e.preventDefault(); e.stopPropagation();
      const item = usable[Number(btn.dataset.insuranceFloatingAction)];
      closeInsuranceFloatingMenu();
      if (item?.action) await item.action();
    });
    if (!global.__triplemInsuranceFloatingMenuBound) {
      global.__triplemInsuranceFloatingMenuBound = true;
      document.addEventListener("click", e => {
        if (!e.target.closest?.("#insuranceFloatingMenu,[data-insurance-row-menu]")) closeInsuranceFloatingMenu();
      });
      window.addEventListener("resize", closeInsuranceFloatingMenu, { passive: true });
      window.addEventListener("scroll", closeInsuranceFloatingMenu, { passive: true, capture: true });
    }
  }

  function rowMenuButtonHtml(kind, id) {
    return `<button class="icon-btn ghost insurance-row-menu-btn" type="button" data-insurance-row-menu="${esc(kind)}" data-insurance-row-id="${esc(id)}" aria-haspopup="menu" aria-label="Actions" title="Actions"><i class="fa-solid fa-ellipsis-vertical"></i></button>`;
  }

  function documentMenuButtonHtml(kind, id) {
    const isCustomerTransaction = kind === "customerTransaction";
    return `<button class="${isCustomerTransaction ? "btn ghost tiny insurance-customer-transaction-docs" : "icon-btn ghost"} insurance-row-menu-btn insurance-document-menu-btn" type="button" data-insurance-row-menu="${esc(kind)}" data-insurance-row-id="${esc(id)}" aria-haspopup="menu" aria-expanded="false" aria-label="Invoice, receipt and temporary invoice options" title="Invoice, receipt and temporary invoice"><i class="fa-solid fa-file-arrow-down"></i>${isCustomerTransaction ? `<span>Documents</span>` : ""}<i class="fa-solid fa-caret-down insurance-document-menu-caret"></i></button>`;
  }

  function bindClickableRows(root, selector, callback) {
    $$(selector, root).forEach(row => {
      row.classList.add("insurance-clickable-row");
      if (!row.hasAttribute("tabindex")) row.tabIndex = 0;
      row.setAttribute("role", "button");
      row.onclick = e => {
        if (e.target.closest?.("button,a,input,select,textarea,label")) return;
        callback(row);
      };
      row.onkeydown = e => {
        if (e.key !== "Enter" && e.key !== " ") return;
        if (e.target.closest?.("button,a,input,select,textarea")) return;
        e.preventDefault(); callback(row);
      };
    });
  }

  function bindInsuranceRowMenus(root) {
    $$('[data-insurance-row-menu]', root).forEach(btn => btn.onclick = e => {
      e.preventDefault(); e.stopPropagation();
      const kind = btn.dataset.insuranceRowMenu;
      const id = btn.dataset.insuranceRowId;
      let items = [];
      if (kind === "sale") {
        const sale = S.sales.find(x => x.id === id);
        if (!sale) return;
        const temp = tempInvoiceForSale(sale.id);
        items = [
          { label: "View", icon: "fa-eye", action: () => openSaleDetails(sale.id) },
          { label: "Download Invoice", icon: "fa-file-invoice", action: () => downloadCustomerDocumentPdf(buildDocumentData(sale,"invoice")) },
          { label: "Download Receipt", icon: "fa-receipt", action: () => downloadCustomerDocumentPdf(buildDocumentData(sale,"receipt")) },
          sale.cancellation_id
            ? { label: "View Cancellation", icon: "fa-ban", action: () => openCancellationDetails(sale.id) }
            : (can("edit") ? { label: "Cancel Policy", icon: "fa-ban", action: () => openPolicyCancellation(sale) } : null),
          can(temp ? "edit" : "create") ? { label: temp ? "Edit Temporary Invoice" : "Create Temporary Invoice", icon: "fa-file-pen", action: () => openTempInvoiceEditor(sale,temp) } : null,
          temp ? { label: "Download Temporary Invoice", icon: "fa-file-pdf", action: () => downloadTempInvoicePdf(temp) } : null,
          can("delete") ? { label: "Delete", icon: "fa-trash", danger: true, action: () => deleteSaleRecord(sale.id) } : null
        ];
      } else if (kind === "customerBalance") {
        const customer = S.customerBalances.find(x => x.customer_number === id); if (!customer) return;
        items = [
          { label: "View Account", icon: "fa-eye", action: () => openCustomerBalance(customer.customer_number) },
          { label: "Download Statement PDF", icon: "fa-file-pdf", action: () => downloadCustomerStatementPdf(customer.customer_number) }
        ];
      } else if (kind === "customerTransaction") {
        const sale = S.customerAccountTransactions.find(x => x.id === id); if (!sale) return;
        const temp = tempInvoiceForSale(sale.id);
        items = [
          { label: "View Transaction", icon: "fa-eye", action: () => openSaleDetails(sale.id) },
          { label: "Invoice PDF", icon: "fa-file-invoice", action: () => downloadCustomerDocumentPdf(buildDocumentData(sale,"invoice")) },
          { label: "Receipt PDF", icon: "fa-receipt", action: () => downloadCustomerDocumentPdf(buildDocumentData(sale,"receipt")) },
          can(temp ? "edit" : "create") ? { label: temp ? "Edit Temporary Invoice" : "Create Temporary Invoice", icon: "fa-file-pen", action: () => openTempInvoiceEditor(sale,temp) } : null,
          temp ? { label: "Download Temporary Invoice", icon: "fa-file-pdf", action: () => downloadTempInvoicePdf(temp) } : null,
          can("create") && n(sale.customer_outstanding) > 0 ? { label: "Receive Payment", icon: "fa-hand-holding-dollar", action: () => openCustomerPayment(sale) } : null
        ];
      } else if (kind === "commission") {
        const commission = S.commissions.find(x => x.id === id); if (!commission) return;
        items = [
          { label: "View", icon: "fa-eye", action: () => openCommissionDetails(commission.id) },
          can("create") && n(commission.commission_outstanding) > 0 ? { label: "Receive Commission", icon: "fa-hand-holding-dollar", action: () => openCommissionReceiving(commission) } : null,
          can("create") && n(commission.commission_due) > 0 ? { label: "Add Deduction", icon: "fa-minus-circle", action: () => openCommissionDeduction(commission) } : null,
          { label: "Payment / Deduction History", icon: "fa-clock-rotate-left", action: () => openCommissionDetails(commission.id) }
        ];
      } else if (kind === "referrer") {
        const referrer = S.referrals.find(x => x.referral_id === id); if (!referrer) return;
        items = [{ label: "View", icon: "fa-eye", action: () => openReferrerDetails(referrer.referral_id) }];
      } else if (kind === "referralTransaction") {
        const referral = S.referralTransactions.find(x => x.id === id); if (!referral) return;
        items = [
          { label: "View / History", icon: "fa-eye", action: () => openReferralDetails(referral.id) },
          can("create") && n(referral.referral_outstanding) > 0 ? { label: "Pay Referral", icon: "fa-money-bill-transfer", action: () => openReferralPayment(referral) } : null
        ];
      } else if (kind === "referralPayment") {
        const referral = S.referralTransactions.find(x => Array.isArray(x.payments) && x.payments.some(p => p.id === id));
        const payment = referral?.payments?.find(p => p.id === id); if (!payment) return;
        items = [can("delete") ? { label: "Delete Payment", icon: "fa-trash", danger: true, action: () => deleteReferralPayment(payment.id, referral.id) } : null];
      } else if (kind === "commissionReceipt") {
        const receipt = S.commissionReceipts.find(x => x.id === id); if (!receipt) return;
        items = [
          { label: "View", icon: "fa-eye", action: () => openCommissionReceiptDetails(receipt) },
          can("delete") ? { label: "Delete Entry", icon: "fa-trash", danger: true, action: () => deleteCommissionReceipt(receipt.id) } : null
        ];
      } else if (kind === "openingBalance") {
        const balance = S.openingBalances.find(x => x.id === id); if (!balance) return;
        items = [
          { label: "View", icon: "fa-eye", action: () => openOpeningBalanceDetails(balance.id) },
          can("create") && n(balance.amount_outstanding) > 0 ? { label: "Receive", icon: "fa-hand-holding-dollar", action: () => openCommissionReceiving({ ...balance, source_type: "opening" }) } : null,
          can("edit") && n(balance.amount_received) <= 0 ? { label: "Edit", icon: "fa-pen", action: () => openOpeningBalanceForm(balance) } : null,
          can("delete") && n(balance.amount_received) <= 0 ? { label: "Delete", icon: "fa-trash", danger: true, action: () => deleteOpeningBalance(balance.id) } : null
        ];
      } else if (kind === "company") {
        const company = S.companies.find(x => x.id === id); if (!company) return;
        items = [
          { label: "View", icon: "fa-eye", action: () => openCompanyDetails(company) },
          can("edit") ? { label: "Edit", icon: "fa-pen", action: () => openCompanyForm(company) } : null,
          can("delete") ? { label: "Delete", icon: "fa-trash", danger: true, action: () => deleteCompany(company.id) } : null
        ];
      } else if (kind === "policy") {
        const policy = S.policies.find(x => x.id === id); if (!policy) return;
        items = [
          { label: "View", icon: "fa-eye", action: () => openPolicyDetails(policy) },
          can("edit") ? { label: "Edit", icon: "fa-pen", action: () => openPolicyForm(policy) } : null,
          can("delete") ? { label: "Delete", icon: "fa-trash", danger: true, action: () => deletePolicy(policy.id) } : null
        ];
      } else if (kind === "temp") {
        const temp = S.tempInvoices.find(x => x.id === id); if (!temp) return;
        items = [
          { label: "View", icon: "fa-eye", action: () => previewTempInvoice(temp) },
          can("edit") ? { label: "Edit", icon: "fa-pen", action: () => openTempInvoiceEditor(null,temp) } : null,
          { label: "Download PDF", icon: "fa-file-pdf", action: () => downloadTempInvoicePdf(temp) },
          can("delete") ? { label: "Delete", icon: "fa-trash", danger: true, action: () => deleteTempInvoice(temp.id) } : null
        ];
      }
      openInsuranceFloatingMenu(btn, items);
    });
  }

  function setBusy(button, busy, label = "Working") {
    if (!button) return;
    if (busy) {
      button.dataset.originalHtml = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${esc(label)}`;
    } else {
      button.disabled = false;
      if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
    }
  }

  function renderViewTabs() {
    const root = $("#insuranceViewTabs");
    if (!root) return;
    root.innerHTML = VIEWS.map(([key, label, icon]) => `<button class="btn ghost tiny insurance-view-tab ${S.view === key ? "active" : ""}" type="button" data-insurance-view="${key}"><i class="fa-solid ${icon}"></i> ${esc(label)}</button>`).join("");
    $$('[data-insurance-view]', root).forEach(btn => btn.onclick = () => switchView(btn.dataset.insuranceView));
  }

  function summaryLines(key) {
    const rows = Array.isArray(S.summary.by_currency) ? S.summary.by_currency : [];
    if (!rows.length) return "0";
    return rows.map(row => `<span class="insurance-summary-money">${moneyHtml(row[key] || 0, row.currency)}</span>`).join("<br>");
  }

  function renderKpis() {
    const root = $("#insuranceKpis");
    if (!root) return;
    const lossCount = (S.summary.by_currency || []).reduce((sum, r) => sum + Number(r.loss_count || 0), 0);
    root.innerHTML = `
      <div class="insurance-kpi"><span>Total Sales</span><strong>${Number(S.summary.total || 0).toLocaleString()}</strong></div>
      <div class="insurance-kpi"><span>Gross Premium</span><strong>${summaryLines("gross_premium")}</strong></div>
      <div class="insurance-kpi"><span>Actual Commission / Profit</span><strong>${summaryLines("actual_profit")}</strong></div>
      <div class="insurance-kpi ${lossCount ? "loss" : ""}"><span>Loss Transactions</span><strong>${lossCount.toLocaleString()}</strong></div>`;
  }

  async function loadMaster({ force = false } = {}) {
    if (S.ready && !force) return;
    const [companies, policies, customers, temps, summary, referrers] = await Promise.all([
      rpc("app_insurance_list_companies", {}),
      rpc("app_insurance_list_policies", { p_company_id: null }),
      rpc("app_insurance_list_customers", { p_search: null, p_limit: 300 }),
      rpc("app_insurance_list_temp_invoices", {}),
      rpc("app_insurance_summary", { p_start_date: null, p_end_date: null }),
      rpc("app_insurance_list_referrer_directory", { p_search: null, p_limit: 250 })
    ]);
    S.companies = companies?.items || [];
    S.policies = policies?.items || [];
    S.customers = customers?.items || [];
    S.tempInvoices = temps?.items || [];
    S.referrerDirectory = referrers?.items || [];
    S.summary = summary || { total: 0, by_currency: [] };
    S.ready = true;
  }

  async function loadSales({ reset = true, report = false } = {}) {
    if (reset) S.offset = 0;
    const limit = report ? 100 : S.limit;
    const res = await rpc("app_insurance_list_sales", {
      p_start_date: S.filters.start || null,
      p_end_date: S.filters.end || null,
      p_search: S.filters.search || null,
      p_company_id: S.filters.company || null,
      p_policy_id: S.filters.policy || null,
      p_customer: S.filters.customer || null,
      p_offset: S.offset,
      p_limit: limit
    });
    S.sales = res?.items || [];
    S.total = Number(res?.total || 0);
    S.hasMore = !!res?.has_more;
  }

  async function loadCustomerBalances({ reset = true } = {}) {
    if (reset) S.customerBalanceOffset = 0;
    const f = S.customerBalanceFilters;
    const res = await rpc("app_insurance_list_customer_balances", {
      p_search: f.search || null,
      p_status: f.status || "all",
      p_offset: S.customerBalanceOffset,
      p_limit: S.customerBalanceLimit
    });
    S.customerBalances = res?.items || [];
    S.customerBalanceTotal = Number(res?.total || 0);
    S.customerBalanceHasMore = !!res?.has_more;
  }

  const CUSTOMER_PAYMENT_STATUS = {
    paid: { label: "Fully Paid", cls: "paid" },
    partial: { label: "Partially Paid", cls: "partial" },
    unpaid: { label: "Not Paid", cls: "unpaid" },
    outstanding: { label: "Outstanding", cls: "outstanding" },
    settled: { label: "Settled", cls: "paid" }
  };

  function customerPaymentStatusBadge(row) {
    const key = row?.customer_payment_status || row?.balance_status || "paid";
    const meta = CUSTOMER_PAYMENT_STATUS[key] || CUSTOMER_PAYMENT_STATUS.paid;
    return `<span class="insurance-payment-status ${meta.cls}">${esc(meta.label)}</span>`;
  }

  async function refreshSummaryForFilters() {
    S.summary = await rpc("app_insurance_summary", {
      p_start_date: S.filters.start || null,
      p_end_date: S.filters.end || null,
      p_search: S.filters.search || null,
      p_company_id: S.filters.company || null,
      p_policy_id: S.filters.policy || null,
      p_customer: S.filters.customer || null
    }) || S.summary;
    renderKpis();
  }

  function companyOptions(selected = "", activeOnly = false) {
    return S.companies.filter(c => !activeOnly || c.is_active !== false).map(c => `<option value="${esc(c.id)}" ${c.id === selected ? "selected" : ""}>${esc(c.company_name)}${c.is_active === false ? " (Inactive)" : ""}</option>`).join("");
  }
  function policyOptions(selected = "", activeOnly = false) {
    return S.policies.filter(p => !activeOnly || p.is_active !== false).map(p => `<option value="${esc(p.id)}" ${p.id === selected ? "selected" : ""}>${esc(p.policy_name)}${p.is_active === false ? " (Inactive)" : ""}</option>`).join("");
  }

  const REPORT_VIEWS = {
    full: { label: "Full Financial Report", title: "Insurance Financial Report", fields: ["gross_premium","purchase_price","sale_price","company_commission","customer_discount","actual_profit"] },
    commission: { label: "Commission Report", title: "Insurance Commission Report", fields: ["company_commission","customer_discount","actual_profit"] },
    user_commission: { label: "User Commission", title: "Insurance User Commission Report", fields: ["actual_profit"] },
    company_commission: { label: "Company Commission", title: "Insurance Company Commission Report", fields: ["company_commission"] },
    customer_discount: { label: "Customer Discount", title: "Insurance Customer Discount Report", fields: ["customer_discount"] },
    premium_sales: { label: "Premium & Sales", title: "Insurance Premium and Sales Report", fields: ["gross_premium","purchase_price","sale_price"] }
  };

  const REPORT_FIELD_META = {
    gross_premium: { label: "Gross Premium", key: "gross_premium" },
    purchase_price: { label: "Purchase Price", key: "purchase_price" },
    sale_price: { label: "Sale Price", key: "sale_price" },
    company_commission: { label: "Company Commission", key: "company_commission" },
    customer_discount: { label: "Customer Discount", key: "customer_discount" },
    actual_profit: { label: "User Commission / Actual Profit", key: "actual_profit" }
  };

  function reportViewOptions() {
    return Object.entries(REPORT_VIEWS).map(([key, meta]) => `<option value="${key}" ${S.reportView === key ? "selected" : ""}>${esc(meta.label)}</option>`).join("");
  }

  function salesToolbar({ report = false } = {}) {
    return `<div class="insurance-toolbar insurance-filter-toolbar ${report ? "insurance-report-filter-toolbar" : ""}">
      <div class="form-group insurance-filter-field insurance-search"><label class="form-label">Search</label><input id="insuranceFilterSearch" class="input" value="${esc(S.filters.search)}" placeholder="Reference, policy no., company, policy or customer"></div>
      ${report ? `<div class="form-group insurance-filter-field insurance-report-view"><label class="form-label">Report</label><select id="insuranceReportView" class="select">${reportViewOptions()}</select></div>` : ""}
      <div class="form-group insurance-filter-field"><label class="form-label">From</label><input id="insuranceFilterStart" class="input" type="date" value="${esc(S.filters.start)}"></div>
      <div class="form-group insurance-filter-field"><label class="form-label">To</label><input id="insuranceFilterEnd" class="input" type="date" value="${esc(S.filters.end)}"></div>
      <div class="form-group insurance-filter-field"><label class="form-label">Company</label><select id="insuranceFilterCompany" class="select"><option value="">All companies</option>${companyOptions(S.filters.company)}</select></div>
      <div class="form-group insurance-filter-field"><label class="form-label">Policy</label><select id="insuranceFilterPolicy" class="select"><option value="">All policies</option>${policyOptions(S.filters.policy)}</select></div>
      <div class="form-group insurance-filter-field"><label class="form-label">Customer</label><input id="insuranceFilterCustomer" class="input" value="${esc(S.filters.customer)}" placeholder="Any customer"></div>
      <div class="insurance-toolbar-actions insurance-filter-actions"><button class="btn primary tiny" id="insuranceApplyFilters" type="button"><i class="fa-solid fa-filter"></i><span>Apply</span></button><button class="btn ghost tiny" id="insuranceClearFilters" type="button"><i class="fa-solid fa-rotate-left"></i><span>Clear</span></button>${report ? `<button class="btn ghost tiny" id="insuranceReportPdf" type="button"><i class="fa-solid fa-file-pdf"></i><span>PDF</span></button><button class="btn ghost tiny" id="insuranceReportCsv" type="button"><i class="fa-solid fa-file-csv"></i><span>CSV</span></button>` : ""}</div>
    </div>`;
  }

  function bindFilters(root, { report = false } = {}) {
    $("#insuranceApplyFilters", root)?.addEventListener("click", async e => {
      const btn = e.currentTarget; setBusy(btn, true, "Loading");
      try {
        S.filters = {
          start: $("#insuranceFilterStart", root)?.value || "",
          end: $("#insuranceFilterEnd", root)?.value || "",
          search: $("#insuranceFilterSearch", root)?.value.trim() || "",
          company: $("#insuranceFilterCompany", root)?.value || "",
          policy: $("#insuranceFilterPolicy", root)?.value || "",
          customer: $("#insuranceFilterCustomer", root)?.value.trim() || ""
        };
        if (S.filters.start && S.filters.end && S.filters.start > S.filters.end) throw new Error("From date cannot be later than To date.");
        await Promise.all([loadSales({ reset: true, report }), refreshSummaryForFilters()]);
        report ? renderReports() : renderSales();
      } catch (err) { notify(err.message || "Could not filter Insurance records.", "error"); }
      finally { setBusy(btn, false); }
    });
    $("#insuranceClearFilters", root)?.addEventListener("click", async () => {
      S.filters = { start: "", end: "", search: "", company: "", policy: "", customer: "" };
      await Promise.all([loadSales({ reset: true, report }), refreshSummaryForFilters()]);
      report ? renderReports() : renderSales();
    });
    if (report) {
      $("#insuranceReportView", root)?.addEventListener("change", e => {
        S.reportView = REPORT_VIEWS[e.currentTarget.value] ? e.currentTarget.value : "commission";
        renderReports();
      });
      $("#insuranceReportPdf", root)?.addEventListener("click", () => exportInsuranceReportPdf());
      $("#insuranceReportCsv", root)?.addEventListener("click", () => exportInsuranceReportCsv());
    }
  }

  function tempInvoiceForSale(saleId) {
    return S.tempInvoices.find(t => t.sale_id === saleId || t.invoice_data?.source_sale_id === saleId) || null;
  }

  function saleActionMenuHtml(s) {
    return rowMenuButtonHtml("sale", s.id);
  }

  function saleRow(s, { report = false } = {}) {
    const profitClass = n(s.actual_profit) < 0 ? "insurance-amount-loss" : "";
    const customerNo = s.customer_number ? ` · #${esc(s.customer_number)}` : "";
    const policyNo=s.policy_number?` · Policy #${esc(s.policy_number)}`:"";
    const cancelMeta=s.cancellation_id?` · Cancelled · ${formatPolicyDuration(s.policy_used_days)} used`:"";
    return `<div class="insurance-row ${s.cancellation_id?"insurance-sale-cancelled":""}" data-insurance-sale-row="${esc(s.id)}">
      <div class="insurance-row-main"><strong>${esc(s.reference_no)}${s.cancellation_id?` <span class="insurance-cancelled-badge">Cancelled</span>`:""}</strong><small>${esc(s.company_name_snapshot)} · ${esc(s.policy_name_snapshot)}${policyNo} · ${fmtDate(s.transaction_date)} ${fmtTime(s.transaction_time)}${cancelMeta}</small></div>
      <div class="insurance-cell"><small>Customer</small><b>${esc(s.customer_name || "Walk-in Customer")}${customerNo}</b></div>
      <div class="insurance-cell"><small>${report ? "Gross / Sale" : "Sale Price"}</small><b>${report ? `${moneyHtml(s.gross_premium,s.currency)} / ${moneyHtml(s.sale_price,s.currency)}` : moneyHtml(s.sale_price,s.currency)}</b></div>
      <div class="insurance-cell"><small>User Commission</small><b class="${profitClass}">${moneyHtml(s.actual_profit,s.currency)}</b></div>
      <div class="insurance-actions">${saleActionMenuHtml(s)}</div>
    </div>`;
  }

  function enrichTemporaryDocument(temp) {
    const base={...(temp?.invoice_data||{}),title:"Invoice",invoice_number:temp?.invoice_number||temp?.invoice_data?.invoice_number||""};
    const saleId=temp?.sale_id||base.source_sale_id;const sale=S.sales.find(s=>s.id===saleId)||S.customerAccountTransactions.find(s=>s.id===saleId);
    if(!sale)return base;
    const source=buildDocumentData(sale,"invoice");
    return {...source,...base,title:"Invoice",company_id:sale.company_id||source.company_id||base.company_id||null,policy_id:sale.policy_id||source.policy_id||base.policy_id||null,policy_number:base.policy_number||sale.policy_number||"",cancellation_id:sale.cancellation_id||base.cancellation_id||null,cancellation_date:sale.cancellation_date||base.cancellation_date||null,cancellation_time:sale.cancellation_time||base.cancellation_time||null,policy_used_days:sale.policy_used_days??base.policy_used_days??0,cancellation_reason:sale.cancellation_reason||base.cancellation_reason||""};
  }

  function downloadTempInvoicePdf(temp) {
    if (!temp) return notify("No temporary Invoice exists for this sale yet.", "error");
    const d=enrichTemporaryDocument(temp);
    return downloadCustomerDocumentPdf({ ...d, reference: d.invoice_number, date: d.invoice_date });
  }

  function bindSaleRecordActions(root) {
    bindInsuranceRowMenus(root);
    bindClickableRows(root, '[data-insurance-sale-row]', row => openSaleDetails(row.dataset.insuranceSaleRow));
    bindClickableRows(root, '[data-insurance-report-sale]', row => openSaleDetails(row.dataset.insuranceReportSale));
  }

  function renderSales() {
    const root = $("#insuranceWorkspace"); if (!root) return;
    root.innerHTML = `${salesToolbar()}<div class="insurance-list" style="margin-top:10px">${S.sales.length ? S.sales.map(s => saleRow(s)).join("") : `<div class="insurance-empty"><i class="fa-solid fa-shield-heart"></i>No Insurance sales found.</div>`}</div>
      ${S.total ? `<div class="insurance-pager"><button class="btn ghost tiny" id="insurancePrevPage" ${S.offset <= 0 ? "disabled" : ""}>Previous</button><span class="help">${Math.min(S.offset + 1,S.total)} to ${Math.min(S.offset + S.sales.length,S.total)} of ${S.total}</span><button class="btn ghost tiny" id="insuranceNextPage" ${!S.hasMore ? "disabled" : ""}>Next</button></div>` : ""}`;
    bindFilters(root);
    bindSaleRecordActions(root);
    $("#insurancePrevPage", root)?.addEventListener("click", async () => { S.offset = Math.max(0, S.offset - S.limit); await loadSales({ reset: false }); renderSales(); });
    $("#insuranceNextPage", root)?.addEventListener("click", async () => { S.offset += S.limit; await loadSales({ reset: false }); renderSales(); });
  }

  const COMMISSION_STATUS = {
    outstanding: { label: "Outstanding", cls: "outstanding" },
    partial: { label: "Partially Received", cls: "partial" },
    received: { label: "Fully Received", cls: "received" },
    settled: { label: "Fully Settled", cls: "settled" },
    no_commission: { label: "No Commission", cls: "none" }
  };

  function commissionStatusMeta(row) {
    const status = row?.commission_status || "outstanding";
    if (status === "no_commission" && n(row?.actual_profit) < 0) return { label: "Loss / No Commission", cls: "none loss" };
    return COMMISSION_STATUS[status] || COMMISSION_STATUS.outstanding;
  }

  function commissionStatusBadge(row) {
    const meta = commissionStatusMeta(row);
    return `<span class="insurance-commission-status ${esc(meta.cls)}">${esc(meta.label)}</span>`;
  }

  async function loadCommissions({ reset = true, limit = null } = {}) {
    if (reset) S.commissionOffset = 0;
    const res = await rpc("app_insurance_list_commissions", {
      p_start_date: S.commissionFilters.start || null,
      p_end_date: S.commissionFilters.end || null,
      p_search: S.commissionFilters.search || null,
      p_company_id: S.commissionFilters.company || null,
      p_status: S.commissionFilters.status || null,
      p_offset: S.commissionOffset,
      p_limit: limit || S.commissionLimit
    });
    S.commissions = res?.items || [];
    S.commissionTotal = Number(res?.total || 0);
    S.commissionHasMore = !!res?.has_more;
  }

  async function loadOpeningBalances() {
    const res = await rpc("app_insurance_list_commission_opening_balances", {
      p_start_date: S.commissionFilters.start || null,
      p_end_date: S.commissionFilters.end || null,
      p_search: S.commissionFilters.search || null,
      p_company_id: S.commissionFilters.company || null,
      p_status: S.commissionFilters.status || null,
      p_offset: 0,
      p_limit: 500
    });
    S.openingBalances = res?.items || [];
    S.openingBalanceTotal = Number(res?.total || 0);
  }

  async function loadCommissionSummary() {
    S.commissionSummary = await rpc("app_insurance_commission_summary", {
      p_start_date: S.commissionFilters.start || null,
      p_end_date: S.commissionFilters.end || null,
      p_search: S.commissionFilters.search || null,
      p_company_id: S.commissionFilters.company || null,
      p_status: S.commissionFilters.status || null
    }) || { total: 0, by_currency: [] };
  }

  function commissionToolbar() {
    const f = S.commissionFilters;
    return `<div class="insurance-toolbar insurance-filter-toolbar insurance-commission-filter-toolbar">
      <div class="form-group insurance-filter-field insurance-search"><label class="form-label">Search</label><input id="insuranceCommissionSearch" class="input" value="${esc(f.search)}" placeholder="Reference, policy no., company, policy or customer"></div>
      <div class="form-group insurance-filter-field"><label class="form-label">From</label><input id="insuranceCommissionStart" class="input" type="date" value="${esc(f.start)}"></div>
      <div class="form-group insurance-filter-field"><label class="form-label">To</label><input id="insuranceCommissionEnd" class="input" type="date" value="${esc(f.end)}"></div>
      <div class="form-group insurance-filter-field"><label class="form-label">Company</label><select id="insuranceCommissionCompany" class="select"><option value="">All companies</option>${companyOptions(f.company)}</select></div>
      <div class="form-group insurance-filter-field"><label class="form-label">Status</label><select id="insuranceCommissionStatus" class="select"><option value="" ${!f.status?"selected":""}>All statuses</option><option value="outstanding" ${f.status==="outstanding"?"selected":""}>Outstanding</option><option value="partial" ${f.status==="partial"?"selected":""}>Partially Received</option><option value="received" ${f.status==="received"?"selected":""}>Fully Received</option><option value="settled" ${f.status==="settled"?"selected":""}>Fully Settled</option><option value="no_commission" ${f.status==="no_commission"?"selected":""}>No Commission / Loss</option></select></div>
      <div class="insurance-toolbar-actions insurance-filter-actions insurance-commission-actions">
        <button class="btn primary tiny" id="insuranceCommissionApply" type="button"><i class="fa-solid fa-filter"></i><span>Apply</span></button>
        <button class="btn ghost tiny" id="insuranceCommissionClear" type="button"><i class="fa-solid fa-rotate-left"></i><span>Clear</span></button>
        ${can("create") ? `<button class="btn ghost tiny" id="insuranceAddOpeningBalance" type="button"><i class="fa-solid fa-scale-balanced"></i><span>Opening Balance</span></button><button class="btn primary tiny" id="insuranceReceiveCommission" type="button"><i class="fa-solid fa-hand-holding-dollar"></i><span>Receive</span></button>` : ""}
        <button class="btn ghost tiny" id="insuranceCommissionHistory" type="button"><i class="fa-solid fa-clock-rotate-left"></i><span>History</span></button>
      </div>
    </div>`;
  }

  function bindCommissionFilters(root) {
    $("#insuranceCommissionApply",root)?.addEventListener("click",async e=>{
      const btn=e.currentTarget;setBusy(btn,true,"Loading");
      try{
        S.commissionFilters={
          start:$("#insuranceCommissionStart",root)?.value||"",
          end:$("#insuranceCommissionEnd",root)?.value||"",
          search:$("#insuranceCommissionSearch",root)?.value.trim()||"",
          company:$("#insuranceCommissionCompany",root)?.value||"",
          status:$("#insuranceCommissionStatus",root)?.value||""
        };
        if(S.commissionFilters.start&&S.commissionFilters.end&&S.commissionFilters.start>S.commissionFilters.end)throw new Error("From date cannot be later than To date.");
        await Promise.all([loadCommissions({reset:true}),loadOpeningBalances(),loadCommissionSummary()]);renderMyCommission();
      }catch(err){notify(err.message||"Could not filter commissions.","error");}finally{setBusy(btn,false);}
    });
    $("#insuranceCommissionClear",root)?.addEventListener("click",async()=>{
      S.commissionFilters={start:"",end:"",search:"",company:"",status:""};
      await Promise.all([loadCommissions({reset:true}),loadOpeningBalances(),loadCommissionSummary()]);renderMyCommission();
    });
    $("#insuranceAddOpeningBalance",root)?.addEventListener("click",()=>openOpeningBalanceForm());
    $("#insuranceReceiveCommission",root)?.addEventListener("click",()=>openCommissionReceiving());
    $("#insuranceCommissionHistory",root)?.addEventListener("click",()=>openCommissionHistory(S.commissionFilters.company||null));
  }

  function commissionSummaryHtml() {
    const rows=Array.isArray(S.commissionSummary.by_currency)?S.commissionSummary.by_currency:[];
    if(!rows.length)return `<div class="insurance-commission-summary-empty">No commission totals for these filters.</div>`;
    return `<div class="insurance-commission-summary-strip">${rows.map(r=>`<div class="insurance-commission-summary-currency"><div class="insurance-commission-summary-code">${esc(r.currency)}</div><div><span>Total Commission</span><strong>${moneyHtml(r.commission_due,r.currency)}</strong></div><div><span>Total Commission Received</span><strong>${moneyHtml(r.commission_received,r.currency)}</strong></div><div><span>Balance to Receive</span><strong>${moneyHtml(r.commission_outstanding,r.currency)}</strong></div>${n(r.commission_deducted)>0?`<small>Commission deductions ${moneyHtml(r.commission_deducted,r.currency)}</small>`:""}</div>`).join("")}</div>`;
  }

  function openingBalanceStatusBadge(row) {
    const status=row?.balance_status||"outstanding";
    const meta=status==="received"?COMMISSION_STATUS.received:status==="partial"?COMMISSION_STATUS.partial:COMMISSION_STATUS.outstanding;
    return `<span class="insurance-commission-status ${esc(meta.cls)}">${esc(meta.label)}</span>`;
  }

  function openingBalanceRow(row) {
    return `<div class="insurance-opening-balance-row" data-insurance-opening-row="${esc(row.id)}"><div class="insurance-opening-main"><strong>${esc(row.reference_no)}</strong><span>${esc(row.company_name_snapshot)} · ${fmtDate(row.balance_date)}${row.notes?` · ${esc(row.notes)}`:""}</span></div><div data-label="Opening"><span>${moneyHtml(row.opening_amount,row.currency)}</span></div><div data-label="Received"><span>${moneyHtml(row.amount_received,row.currency)}</span></div><div data-label="Outstanding" class="${n(row.amount_outstanding)>0?"insurance-amount-outstanding":""}"><span>${moneyHtml(row.amount_outstanding,row.currency)}</span></div><div class="insurance-opening-status">${openingBalanceStatusBadge(row)}${row.last_received_date?`<small>${fmtDate(row.last_received_date)} ${fmtTime(row.last_received_time)}</small>`:""}</div><div>${rowMenuButtonHtml("openingBalance",row.id)}</div></div>`;
  }

  function openingBalancesHtml() {
    if(!S.openingBalances.length)return "";
    return `<div class="insurance-opening-balance-section"><div class="insurance-opening-balance-title"><div><strong>Opening Outstanding Balances</strong><span>Commission balances brought forward from policies recorded before Triplem VIP.</span></div><span>${Number(S.openingBalanceTotal||0)} record${Number(S.openingBalanceTotal||0)===1?"":"s"}</span></div><div class="insurance-opening-balance-head"><div>Opening Balance</div><div>Amount</div><div>Received</div><div>Outstanding</div><div>Status</div><div></div></div><div class="insurance-opening-balance-list">${S.openingBalances.map(openingBalanceRow).join("")}</div></div>`;
  }

  function commissionRow(row) {
    const outstanding=n(row.commission_outstanding), received=n(row.commission_received), deducted=n(row.commission_deducted), due=n(row.commission_due);
    return `<div class="insurance-commission-line insurance-commission-record" data-insurance-commission-row="${esc(row.id)}">
      <div class="insurance-commission-item"><strong>${esc(row.reference_no)}</strong><span>${esc(row.company_name_snapshot)} · ${esc(row.policy_name_snapshot)} · ${fmtDate(row.transaction_date)}</span></div>
      <div class="insurance-commission-value" data-label="Gross">${moneyHtml(row.gross_premium,row.currency)}</div>
      <div class="insurance-commission-value" data-label="Purchase">${moneyHtml(row.purchase_price,row.currency)}</div>
      <div class="insurance-commission-value" data-label="Sold">${moneyHtml(row.sale_price,row.currency)}</div>
      <div class="insurance-commission-value" data-label="My Commission">${moneyHtml(due,row.currency)}</div>
      <div class="insurance-commission-value" data-label="Received">${moneyHtml(received,row.currency)}</div>
      <div class="insurance-commission-value insurance-amount-deduction" data-label="Deducted">${moneyHtml(deducted,row.currency)}</div>
      <div class="insurance-commission-value ${outstanding>0?"insurance-amount-outstanding":""}" data-label="Outstanding">${moneyHtml(outstanding,row.currency)}</div>
      <div class="insurance-commission-status-cell">${commissionStatusBadge(row)}${row.last_received_date?`<small>${fmtDate(row.last_received_date)} ${fmtTime(row.last_received_time)}</small>`:""}</div>
      <div class="insurance-report-line-actions">${rowMenuButtonHtml("commission",row.id)}</div>
    </div>`;
  }

  function renderMyCommission() {
    const root=$("#insuranceWorkspace");if(!root)return;
    root.innerHTML=`${commissionToolbar()}${commissionSummaryHtml()}<div class="insurance-commission-heading"><div><strong>My Commission</strong><span>Live policy commission plus any opening outstanding balances brought into Triplem VIP.</span></div></div>${openingBalancesHtml()}
      <div class="insurance-commission-table">
        <div class="insurance-commission-line insurance-commission-head"><div>Insurance Sale</div><div>Gross</div><div>Purchase</div><div>Sold</div><div>My Commission</div><div>Received</div><div>Deducted</div><div>Outstanding</div><div>Status</div><div></div></div>
        <div class="insurance-commission-list">${S.commissions.length?S.commissions.map(commissionRow).join(""):`<div class="insurance-empty"><i class="fa-solid fa-hand-holding-dollar"></i>No Insurance sale commission records found.</div>`}</div>
      </div>
      ${S.commissionTotal?`<div class="insurance-pager"><button class="btn ghost tiny" id="insuranceCommissionPrev" ${S.commissionOffset<=0?"disabled":""}>Previous</button><span class="help">${Math.min(S.commissionOffset+1,S.commissionTotal)} to ${Math.min(S.commissionOffset+S.commissions.length,S.commissionTotal)} of ${S.commissionTotal}</span><button class="btn ghost tiny" id="insuranceCommissionNext" ${!S.commissionHasMore?"disabled":""}>Next</button></div>`:""}`;
    bindCommissionFilters(root);bindInsuranceRowMenus(root);
    bindClickableRows(root,'[data-insurance-commission-row]',row=>openCommissionDetails(row.dataset.insuranceCommissionRow));
    bindClickableRows(root,'[data-insurance-opening-row]',row=>openOpeningBalanceDetails(row.dataset.insuranceOpeningRow));
    $("#insuranceCommissionPrev",root)?.addEventListener("click",async()=>{S.commissionOffset=Math.max(0,S.commissionOffset-S.commissionLimit);await loadCommissions({reset:false});renderMyCommission();});
    $("#insuranceCommissionNext",root)?.addEventListener("click",async()=>{S.commissionOffset+=S.commissionLimit;await loadCommissions({reset:false});renderMyCommission();});
  }

  async function openCommissionDetails(id) {
    try{
      const res=await rpc("app_insurance_get_commission",{p_sale_id:id}),row=res?.item;if(!row)return;
      const payments=Array.isArray(row.payments)?row.payments:[];
      const paymentHtml=payments.length?payments.map(p=>`<div class="insurance-commission-payment-row"><div><strong>${esc(p.reference_no)}</strong><span>${fmtDate(p.received_date)} ${fmtTime(p.received_time)}${p.external_reference?` · ${esc(p.external_reference)}`:""}</span></div><b>${moneyHtml(p.amount_allocated,row.currency)}</b></div>`).join(""):`<div class="insurance-commission-payment-empty">No commission payment has been recorded for this sale.</div>`;
      const deductions=Array.isArray(row.deductions)?row.deductions:[];
      const deductionHtml=deductions.length?deductions.map(d=>`<div class="insurance-commission-payment-row"><div><strong>${esc(d.reference_no)}</strong><span>${fmtDate(d.deduction_date)} ${fmtTime(d.deduction_time)}${d.reason?` · ${esc(d.reason)}`:""}</span></div><b class="insurance-amount-deduction">− ${moneyHtml(d.amount,row.currency)}</b></div>`).join(""):`<div class="insurance-commission-payment-empty">No commission deduction has been recorded for this sale.</div>`;
      openModal({id:"insuranceCommissionDetailsModal",title:"My Commission",subtitle:row.reference_no,body:`<div class="insurance-detail-grid">
        <div class="insurance-detail"><span>Insurance Company</span><strong>${esc(row.company_name_snapshot)}</strong></div><div class="insurance-detail"><span>Policy</span><strong>${esc(row.policy_name_snapshot)}</strong></div>
        <div class="insurance-detail"><span>Gross Premium</span><strong>${moneyHtml(row.gross_premium,row.currency)}</strong></div><div class="insurance-detail"><span>Purchase Price</span><strong>${moneyHtml(row.purchase_price,row.currency)}</strong></div>
        <div class="insurance-detail"><span>Sold Price</span><strong>${moneyHtml(row.sale_price,row.currency)}</strong></div><div class="insurance-detail"><span>My Commission</span><strong>${moneyHtml(row.commission_due,row.currency)}</strong></div>
        <div class="insurance-detail"><span>Received</span><strong>${moneyHtml(row.commission_received,row.currency)}</strong></div><div class="insurance-detail"><span>Commission Deductions</span><strong>${moneyHtml(row.commission_deducted||0,row.currency)}</strong></div>
        <div class="insurance-detail"><span>Outstanding</span><strong>${moneyHtml(row.commission_outstanding,row.currency)}</strong></div><div class="insurance-detail"><span>Status</span><strong>${commissionStatusBadge(row)}</strong></div>
      </div><div class="insurance-commission-payment-history"><div class="insurance-commission-payment-title">Receiving History</div>${paymentHtml}</div><div class="insurance-commission-payment-history"><div class="insurance-commission-payment-title">Deduction History</div>${deductionHtml}</div>`,actions:`<button class="btn ghost" data-insurance-close>Done</button>${can("create")&&n(row.commission_due)>0?`<button class="btn ghost" id="insuranceCommissionDeductFromDetails">Add Deduction</button>`:""}${can("create")&&n(row.commission_outstanding)>0?`<button class="btn primary" id="insuranceCommissionReceiveFromDetails">Receive</button>`:""}`,onOpen(modal,close){$("#insuranceCommissionDeductFromDetails",modal)?.addEventListener("click",()=>{close();openCommissionDeduction(row);});$("#insuranceCommissionReceiveFromDetails",modal)?.addEventListener("click",()=>{close();openCommissionReceiving(row);});}});
    }catch(err){notify(err.message||"Could not open commission details.","error");}
  }

  function openOpeningBalanceForm(existing=null) {
    if(!can(existing?"edit":"create"))return notify("Opening balance entry is not permitted for this account.","error");
    const title=existing?"Edit Opening Balance":"Add Opening Balance";
    openModal({id:"insuranceOpeningBalanceModal",title,subtitle:"Bring forward commission owed from policies before Triplem VIP.",body:`<form id="insuranceOpeningBalanceForm" class="insurance-form-grid insurance-opening-balance-form">
      <label>Insurance Company<select class="select" name="company_id" required><option value="">Select company</option>${companyOptions(existing?.company_id||"")}</select></label>
      <label>Currency<select class="select" name="currency" required>${currencyOptions(existing?.currency||currentCurrency())}</select></label>
      <label>Opening Outstanding Balance<input class="input" name="opening_amount" type="number" min="0.01" step="0.01" value="${existing?esc(existing.opening_amount):""}" required placeholder="0.00"></label>
      <label>Balance Date<input class="input" name="balance_date" type="date" value="${esc(existing?.balance_date||dateToday())}" required></label>
      <label class="wide">Note<textarea class="input" name="notes" rows="2" maxlength="500" placeholder="e.g. Balance from previous insurance policies before moving to Triplem VIP">${esc(existing?.notes||"")}</textarea></label>
    </form>`,actions:`<button class="btn ghost" data-insurance-close>Cancel</button><button class="btn primary" id="insuranceOpeningBalanceSave">Save</button>`,onOpen(modal,close){
      if(typeof syncCurrencySelectFonts==="function")syncCurrencySelectFonts($("select[name=currency]",modal));
      const form=$("#insuranceOpeningBalanceForm",modal);$("#insuranceOpeningBalanceSave",modal).onclick=async e=>{if(!form.reportValidity())return;const fd=new FormData(form),amount=n(fd.get("opening_amount"));if(amount<=0)return notify("Opening outstanding balance must be greater than zero.","error");setBusy(e.currentTarget,true,"Saving");try{const args={p_company_id:fd.get("company_id"),p_currency:fd.get("currency"),p_opening_amount:amount,p_balance_date:fd.get("balance_date"),p_notes:fd.get("notes")||null};if(existing)args.p_id=existing.id;const res=await rpc(existing?"app_insurance_update_commission_opening_balance":"app_insurance_create_commission_opening_balance",args);close();await Promise.all([loadOpeningBalances(),loadCommissionSummary()]);renderMyCommission();notify(`Opening balance ${res?.item?.reference_no||"saved"}.`);}catch(err){notify(err.message||"Could not save opening balance.","error");}finally{setBusy(e.currentTarget,false);}};
    }});
  }

  async function openOpeningBalanceDetails(id) {
    try{const res=await rpc("app_insurance_get_commission_opening_balance",{p_id:id}),row=res?.item;if(!row)return;const payments=Array.isArray(row.payments)?row.payments:[];const paymentHtml=payments.length?payments.map(p=>`<div class="insurance-commission-payment-row"><div><strong>${esc(p.reference_no)}</strong><span>${fmtDate(p.received_date)} ${fmtTime(p.received_time)}${p.external_reference?` · ${esc(p.external_reference)}`:""}</span></div><b>${moneyHtml(p.amount_allocated,row.currency)}</b></div>`).join(""):`<div class="insurance-commission-payment-empty">No receiving entry has been recorded against this opening balance.</div>`;openModal({id:"insuranceOpeningBalanceDetailsModal",title:"Opening Commission Balance",subtitle:row.reference_no,body:`<div class="insurance-detail-grid"><div class="insurance-detail"><span>Insurance Company</span><strong>${esc(row.company_name_snapshot)}</strong></div><div class="insurance-detail"><span>Balance Date</span><strong>${fmtDate(row.balance_date)}</strong></div><div class="insurance-detail"><span>Opening Balance</span><strong>${moneyHtml(row.opening_amount,row.currency)}</strong></div><div class="insurance-detail"><span>Received</span><strong>${moneyHtml(row.amount_received,row.currency)}</strong></div><div class="insurance-detail"><span>Balance to Receive</span><strong>${moneyHtml(row.amount_outstanding,row.currency)}</strong></div><div class="insurance-detail"><span>Status</span><strong>${openingBalanceStatusBadge(row)}</strong></div>${row.notes?`<div class="insurance-detail insurance-detail-wide"><span>Migration Note</span><strong>${esc(row.notes)}</strong></div>`:""}</div><div class="insurance-commission-payment-history"><div class="insurance-commission-payment-title">Receiving History</div>${paymentHtml}</div>`,actions:`<button class="btn ghost" data-insurance-close>Done</button>${can("edit")&&n(row.amount_received)<=0?`<button class="btn ghost" id="insuranceOpeningBalanceEdit">Edit</button>`:""}${can("create")&&n(row.amount_outstanding)>0?`<button class="btn primary" id="insuranceOpeningBalanceReceive">Receive</button>`:""}`,onOpen(modal,close){$("#insuranceOpeningBalanceEdit",modal)?.addEventListener("click",()=>{close();openOpeningBalanceForm(row);});$("#insuranceOpeningBalanceReceive",modal)?.addEventListener("click",()=>{close();openCommissionReceiving({...row,source_type:"opening"});});}});}catch(err){notify(err.message||"Could not open opening balance.","error");}
  }

  async function deleteOpeningBalance(id) {
    const row=S.openingBalances.find(x=>x.id===id);if(!row)return;
    if(!global.confirm(`Delete opening balance ${row.reference_no}?`))return;
    try{await rpc("app_insurance_delete_commission_opening_balance",{p_id:id});await Promise.all([loadOpeningBalances(),loadCommissionSummary()]);renderMyCommission();notify("Opening balance deleted.");}catch(err){notify(err.message||"Could not delete opening balance.","error");}
  }

  function openCommissionDeduction(row) {
    if(!can("create"))return notify("Commission deduction is not permitted for this account.","error");
    if(!row||n(row.commission_due)<=0)return notify("This sale has no positive commission to deduct from.","error");
    openModal({id:"insuranceCommissionDeductionModal",title:"Add Commission Deduction",subtitle:`${row.reference_no} · ${row.company_name_snapshot}`,body:`<form id="insuranceCommissionDeductionForm" class="insurance-form-grid insurance-deduction-form">
      <label>Deduction Amount<input class="input" name="amount" type="number" min="0.01" step="0.01" required placeholder="0.00"></label>
      <label>Date<input class="input" name="deduction_date" type="date" value="${dateToday()}" required></label>
      <label>Time<input class="input" name="deduction_time" type="time" value="${timeNow()}" required></label>
      <label class="wide">Reason<input class="input" name="reason" maxlength="240" placeholder="Cancellation adjustment or other company deduction"></label>
      <label class="wide insurance-check-line"><input type="checkbox" name="apply_to_sale" checked><span>Apply as much as possible to this sale now. Any unused deduction remains available for a later company commission settlement.</span></label>
    </form>`,actions:`<button class="btn ghost" data-insurance-close>Cancel</button><button class="btn primary" id="insuranceCommissionDeductionSave">Save</button>`,onOpen(modal,close){
      const form=$("#insuranceCommissionDeductionForm",modal);
      $("#insuranceCommissionDeductionSave",modal).onclick=async e=>{if(!form.reportValidity())return;const fd=new FormData(form),amount=n(fd.get("amount"));if(amount<=0)return notify("Deduction amount must be greater than zero.","error");setBusy(e.currentTarget,true,"Saving");try{const res=await rpc("app_insurance_add_commission_deduction",{p_sale_id:row.id,p_amount:amount,p_deduction_date:fd.get("deduction_date"),p_deduction_time:fd.get("deduction_time"),p_reason:fd.get("reason")||null,p_apply_to_sale:fd.get("apply_to_sale")==="on"});close();await Promise.all([loadCommissions({reset:true}),loadOpeningBalances(),loadCommissionSummary()]);if(S.view==="commission")renderMyCommission();notify(`Commission deduction ${res?.item?.reference_no||"saved"} recorded.`);}catch(err){notify(err.message||"Could not save commission deduction.","error");}finally{setBusy(e.currentTarget,false);}};
    }});
  }

  async function openCommissionReceiving(prefill=null) {
    if(!can("create"))return notify("Commission receiving is not permitted for this account.","error");
    const selectedCompany=prefill?.company_id||"";
    openModal({id:"insuranceCommissionReceiveModal",title:"Receive Commission",subtitle:"Settle company commission across live policies and imported opening balances.",body:`<form id="insuranceCommissionReceiveForm" class="insurance-form-grid insurance-commission-receive-form">
      <label>Insurance Company<select class="select" name="company_id" required><option value="">Select company</option>${companyOptions(selectedCompany)}</select></label>
      <label>Currency<select class="select" name="currency" required><option value="">Select currency</option></select></label>
      <div class="wide insurance-commission-selection-head"><span>Outstanding commission receivables</span><button class="btn ghost tiny" type="button" id="insuranceCommissionSelectAll">Select All</button></div>
      <div class="wide insurance-commission-candidate-list" id="insuranceCommissionCandidateList"><div class="insurance-commission-payment-empty">Select an Insurance Company.</div></div>
      <div class="wide insurance-commission-selection-head"><span>Pending deductions</span><button class="btn ghost tiny" type="button" id="insuranceDeductionSelectAll">Select All</button></div>
      <div class="wide insurance-commission-candidate-list insurance-deduction-candidate-list" id="insuranceDeductionCandidateList"><div class="insurance-commission-payment-empty">Select an Insurance Company.</div></div>
      <div class="wide insurance-commission-selected-summary" id="insuranceCommissionSelectedSummary">0 receivables selected</div>
      <label>Amount Received<input class="input" name="amount_received" type="number" min="0" step="0.01" required></label>
      <label>Reference / Deposit No.<input class="input" name="external_reference" maxlength="120" placeholder="Optional"></label>
      <label>Received Date<input class="input" type="date" name="received_date" value="${dateToday()}" required></label>
      <label>Received Time<input class="input" type="time" name="received_time" value="${timeNow()}" required></label>
      <label class="wide">Notes<textarea class="input" name="notes" rows="2" placeholder="Optional"></textarea></label>
      <div class="wide insurance-commission-allocation-note">Cash clears selected opening balances first, then selected policy commissions. Pending cancellation deductions can reduce only the selected policy commissions. Any unused deduction remains available for a later settlement.</div>
    </form>`,actions:`<button class="btn ghost" data-insurance-close>Cancel</button><button class="btn primary" id="insuranceCommissionReceiveSave">Save</button>`,onOpen(modal,close){
      const form=$("#insuranceCommissionReceiveForm",modal),company=form.elements.company_id,currency=form.elements.currency,amount=form.elements.amount_received,list=$("#insuranceCommissionCandidateList",modal),deductionList=$("#insuranceDeductionCandidateList",modal),summary=$("#insuranceCommissionSelectedSummary",modal);let candidates=[];let deductions=[];let preferredKey=prefill?.id?`${prefill?.source_type==="opening"?"opening":"sale"}:${prefill.id}`:null;
      const selectedRows=()=>$$('input[data-commission-select]:checked',list).map(input=>candidates.find(r=>r.selection_key===input.value)).filter(Boolean);
      const selectedDeductions=()=>$$('input[data-deduction-select]:checked',deductionList).map(input=>deductions.find(r=>r.id===input.value)).filter(Boolean);
      const updateSelection=(suggest=true)=>{const rows=selectedRows(),sales=rows.filter(r=>r.source_type==="sale"),deds=selectedDeductions(),total=rows.reduce((sum,r)=>sum+n(r.commission_outstanding),0),saleOutstanding=sales.reduce((sum,r)=>sum+n(r.commission_outstanding),0),deductionTotal=deds.reduce((sum,r)=>sum+n(r.amount_remaining),0),usable=Math.min(saleOutstanding,deductionTotal),suggested=Math.max(total-usable,0);summary.innerHTML=`<span>${rows.length} receivable${rows.length===1?"":"s"} · ${deds.length} deduction${deds.length===1?"":"s"}</span><strong>${rows.length?`${moneyHtml(total,rows[0].currency)} outstanding${usable>0?` · − ${moneyHtml(usable,rows[0].currency)} deductions`:""}`:"0"}</strong>`;if(suggest)amount.value=rows.length?String(Number(suggested.toFixed(8))):"";};
      const renderCandidates=()=>{const cur=currency.value;const rows=candidates.filter(r=>r.currency===cur&&n(r.commission_outstanding)>0);list.innerHTML=rows.length?rows.map(r=>`<label class="insurance-commission-candidate ${r.source_type==="opening"?"insurance-opening-candidate":""}"><input type="checkbox" data-commission-select value="${esc(r.selection_key)}" ${preferredKey===r.selection_key?"checked":""}><span><strong>${esc(r.reference_no)} · ${r.source_type==="opening"?"Opening Balance":esc(r.policy_name_snapshot||"Insurance")}</strong><small>${fmtDate(r.transaction_date)} · ${r.source_type==="opening"?`${esc(r.company_name_snapshot)}${r.notes?` · ${esc(r.notes)}`:""}`:`${esc(r.customer_name||"Walk-in Customer")}${r.policy_number?` · #${esc(r.policy_number)}`:""}`}</small></span><b>${moneyHtml(r.commission_outstanding,r.currency)}</b></label>`).join(""):`<div class="insurance-commission-payment-empty">No outstanding commission in this currency.</div>`;$$('input[data-commission-select]',list).forEach(input=>input.addEventListener("change",()=>{preferredKey=null;updateSelection();}));
        const drows=deductions.filter(d=>d.currency===cur&&n(d.amount_remaining)>0);deductionList.innerHTML=drows.length?drows.map(d=>`<label class="insurance-commission-candidate insurance-deduction-candidate"><input type="checkbox" data-deduction-select value="${esc(d.id)}"><span><strong>${esc(d.reference_no)}${d.source_sale_reference?` · ${esc(d.source_sale_reference)}`:""}</strong><small>${fmtDate(d.deduction_date)} · ${esc(d.reason||"Commission deduction")}</small></span><b>− ${moneyHtml(d.amount_remaining,d.currency)}</b></label>`).join(""):`<div class="insurance-commission-payment-empty">No pending deduction in this currency.</div>`;$$('input[data-deduction-select]',deductionList).forEach(input=>input.addEventListener("change",()=>updateSelection()));updateSelection();};
      const loadCandidates=async()=>{const companyId=company.value;preferredKey=prefill?.id&&companyId===prefill.company_id?`${prefill?.source_type==="opening"?"opening":"sale"}:${prefill.id}`:null;if(!companyId){candidates=[];deductions=[];currency.innerHTML='<option value="">Select currency</option>';list.innerHTML='<div class="insurance-commission-payment-empty">Select an Insurance Company.</div>';deductionList.innerHTML='<div class="insurance-commission-payment-empty">Select an Insurance Company.</div>';updateSelection();return;}list.innerHTML=deductionList.innerHTML='<div class="insurance-commission-payment-empty"><i class="fa-solid fa-spinner fa-spin"></i> Loading…</div>';try{const [cres,ores,dres]=await Promise.all([rpc("app_insurance_list_commissions",{p_start_date:null,p_end_date:null,p_search:null,p_company_id:companyId,p_status:"due",p_offset:0,p_limit:500}),rpc("app_insurance_list_commission_opening_balances",{p_start_date:null,p_end_date:null,p_search:null,p_company_id:companyId,p_status:"due",p_offset:0,p_limit:500}),rpc("app_insurance_list_commission_deductions",{p_company_id:companyId,p_currency:null,p_status:"pending",p_offset:0,p_limit:500})]);const saleRows=(cres?.items||[]).map(r=>({...r,source_type:"sale",selection_key:`sale:${r.id}`}));const openingRows=(ores?.items||[]).map(r=>({...r,source_type:"opening",selection_key:`opening:${r.id}`,commission_outstanding:r.amount_outstanding,transaction_date:r.balance_date,policy_name_snapshot:"Opening Balance"}));candidates=[...openingRows,...saleRows];deductions=(dres?.items||[]).filter(d=>n(d.amount_remaining)>0);const currencies=[...new Set(candidates.map(r=>r.currency).filter(Boolean))];currency.innerHTML='<option value="">Select currency</option>'+currencies.map(cur=>`<option value="${esc(cur)}" ${cur===(prefill?.currency||currencies[0])?"selected":""}>${esc(cur)}</option>`).join("");if(typeof syncCurrencySelectFonts==="function")syncCurrencySelectFonts(currency);renderCandidates();}catch(err){candidates=[];deductions=[];list.innerHTML=deductionList.innerHTML=`<div class="insurance-commission-payment-empty">${esc(err.message||"Could not load settlement records.")}</div>`;}};
      company.addEventListener("change",()=>{prefill=null;loadCandidates();});currency.addEventListener("change",()=>{preferredKey=null;renderCandidates();});amount.addEventListener("input",()=>updateSelection(false));
      $("#insuranceCommissionSelectAll",modal).onclick=()=>{const boxes=$$('input[data-commission-select]',list);const shouldCheck=boxes.some(x=>!x.checked);boxes.forEach(x=>x.checked=shouldCheck);preferredKey=null;updateSelection();};
      $("#insuranceDeductionSelectAll",modal).onclick=()=>{const boxes=$$('input[data-deduction-select]',deductionList);const shouldCheck=boxes.some(x=>!x.checked);boxes.forEach(x=>x.checked=shouldCheck);updateSelection();};
      if(selectedCompany){company.value=selectedCompany;loadCandidates();}
      $("#insuranceCommissionReceiveSave",modal).onclick=async e=>{if(!form.reportValidity())return;const rows=selectedRows(),sales=rows.filter(r=>r.source_type==="sale"),openings=rows.filter(r=>r.source_type==="opening"),deds=selectedDeductions();if(!rows.length)return notify("Select at least one outstanding commission or opening balance.","error");if(deds.length&&!sales.length)return notify("Commission deductions can only be applied when a policy commission is selected.","error");const received=n(amount.value),selectedOutstanding=rows.reduce((sum,r)=>sum+n(r.commission_outstanding),0);if(received<0)return notify("Received amount cannot be negative.","error");if(received>selectedOutstanding+0.00000001)return notify("Received amount cannot exceed the selected outstanding total.","error");if(received<=0&&!deds.length)return notify("Enter a received amount or select a pending deduction.","error");setBusy(e.currentTarget,true,"Saving");try{const fd=new FormData(form);const res=await rpc("app_insurance_receive_commission",{p_company_id:company.value,p_currency:currency.value,p_amount_received:received,p_sale_ids:sales.map(r=>r.id),p_deduction_ids:deds.map(d=>d.id),p_opening_balance_ids:openings.map(r=>r.id),p_received_date:fd.get("received_date"),p_received_time:fd.get("received_time"),p_external_reference:fd.get("external_reference")||null,p_notes:fd.get("notes")||null});close();await Promise.all([loadCommissions({reset:true}),loadOpeningBalances(),loadCommissionSummary()]);renderMyCommission();notify(`Commission settlement ${res?.item?.reference_no||"saved"} recorded.`);}catch(err){notify(err.message||"Could not record commission settlement.","error");}finally{setBusy(e.currentTarget,false);}};
    }});
  }

  async function openCommissionHistory(companyId=null) {
    try{
      const res=await rpc("app_insurance_list_commission_receipts",{p_company_id:companyId||null,p_start_date:null,p_end_date:null,p_offset:0,p_limit:200});S.commissionReceipts=res?.items||[];
      openModal({id:"insuranceCommissionHistoryModal",title:"Commission Receiving History",subtitle:companyId?(S.companies.find(c=>c.id===companyId)?.company_name||""):"All Insurance Companies",body:`<div class="insurance-commission-receipt-list">${S.commissionReceipts.length?S.commissionReceipts.map(r=>`<div class="insurance-commission-receipt-row" data-insurance-commission-receipt-row="${esc(r.id)}"><div><strong>${esc(r.reference_no)}</strong><span>${esc(r.company_name_snapshot)} · ${fmtDate(r.received_date)} ${fmtTime(r.received_time)} · ${Number(r.allocation_count||0)} receivable${Number(r.allocation_count||0)===1?"":"s"}${n(r.deduction_applied)>0?` · deductions ${moneyPlain(r.deduction_applied,r.currency)}`:""}</span></div><b>${moneyHtml(r.amount_received,r.currency)}</b><div>${rowMenuButtonHtml("commissionReceipt",r.id)}</div></div>`).join(""):`<div class="insurance-commission-payment-empty">No commission receipts recorded.</div>`}</div>`,actions:`<button class="btn ghost" data-insurance-close>Done</button>`,onOpen(modal){bindInsuranceRowMenus(modal);bindClickableRows(modal,'[data-insurance-commission-receipt-row]',row=>openCommissionReceiptDetails(S.commissionReceipts.find(r=>r.id===row.dataset.insuranceCommissionReceiptRow)));}});
    }catch(err){notify(err.message||"Could not load commission receiving history.","error");}
  }

  function openCommissionReceiptDetails(receipt) {
    if(!receipt)return;const allocations=Array.isArray(receipt.allocations)?receipt.allocations:[],openingAllocations=Array.isArray(receipt.opening_allocations)?receipt.opening_allocations:[],deductions=Array.isArray(receipt.deduction_allocations)?receipt.deduction_allocations:[];const deductionTotal=n(receipt.deduction_applied);
    openModal({id:"insuranceCommissionReceiptDetailsModal",title:"Commission Settlement",subtitle:receipt.reference_no,body:`<div class="insurance-detail-grid"><div class="insurance-detail"><span>Insurance Company</span><strong>${esc(receipt.company_name_snapshot)}</strong></div><div class="insurance-detail"><span>Cash Received</span><strong>${moneyHtml(receipt.amount_received,receipt.currency)}</strong></div><div class="insurance-detail"><span>Deductions Applied</span><strong>${moneyHtml(deductionTotal,receipt.currency)}</strong></div><div class="insurance-detail"><span>Total Commission Cleared</span><strong>${moneyHtml(n(receipt.amount_received)+deductionTotal,receipt.currency)}</strong></div><div class="insurance-detail"><span>Date</span><strong>${fmtDate(receipt.received_date)}</strong></div><div class="insurance-detail"><span>Time</span><strong>${fmtTime(receipt.received_time)}</strong></div>${receipt.external_reference?`<div class="insurance-detail insurance-detail-wide"><span>Reference</span><strong>${esc(receipt.external_reference)}</strong></div>`:""}${receipt.notes?`<div class="insurance-detail insurance-detail-wide"><span>Notes</span><strong>${esc(receipt.notes)}</strong></div>`:""}</div><div class="insurance-commission-payment-history"><div class="insurance-commission-payment-title">Cash Allocations</div>${openingAllocations.map(a=>`<div class="insurance-commission-payment-row"><div><strong>${esc(a.reference_no)} · Opening Balance</strong><span>${fmtDate(a.balance_date)}${a.notes?` · ${esc(a.notes)}`:""}</span></div><b>${moneyHtml(a.amount_allocated,receipt.currency)}</b></div>`).join("")}${allocations.map(a=>`<div class="insurance-commission-payment-row"><div><strong>${esc(a.reference_no)}</strong><span>${esc(a.policy_name||"Insurance")} · ${fmtDate(a.transaction_date)}</span></div><b>${moneyHtml(a.amount_allocated,receipt.currency)}</b></div>`).join("")}${!openingAllocations.length&&!allocations.length?`<div class="insurance-commission-payment-empty">No cash allocation in this settlement.</div>`:""}</div><div class="insurance-commission-payment-history"><div class="insurance-commission-payment-title">Deduction Allocations</div>${deductions.length?deductions.map(d=>`<div class="insurance-commission-payment-row"><div><strong>${esc(d.deduction_reference_no||"Deduction")}</strong><span>${esc(d.sale_reference_no||"")}${d.reason?` · ${esc(d.reason)}`:""}</span></div><b class="insurance-amount-deduction">− ${moneyHtml(d.amount_applied,receipt.currency)}</b></div>`).join(""):`<div class="insurance-commission-payment-empty">No deduction allocation in this settlement.</div>`}</div>`,actions:`<button class="btn ghost" data-insurance-close>Done</button>`});
  }

  async function deleteCommissionReceipt(id) {
    const receipt=S.commissionReceipts.find(r=>r.id===id);if(!receipt)return;
    if(!global.confirm(`Delete commission receipt ${receipt.reference_no}? Its allocations will be removed from the received totals and the affected commissions will become outstanding again.`))return;
    try{await rpc("app_insurance_delete_commission_receipt",{p_id:id});await Promise.all([loadCommissions({reset:true}),loadOpeningBalances(),loadCommissionSummary()]);if(S.view==="commission")renderMyCommission();const historyModal=document.getElementById("insuranceCommissionHistoryModal");if(historyModal&&!historyModal.classList.contains("hide"))await openCommissionHistory(S.commissionFilters.company||null);notify("Commission receipt deleted and outstanding balances recalculated.");}catch(err){notify(err.message||"Could not delete commission receipt.","error");}
  }

  const REFERRAL_STATUS = {
    outstanding: { label: "Outstanding", cls: "outstanding" },
    partial: { label: "Partially Paid", cls: "partial" },
    paid: { label: "Fully Paid", cls: "received" }
  };

  function referralStatusBadge(row) {
    const meta=REFERRAL_STATUS[row?.referral_status]||REFERRAL_STATUS.outstanding;
    return `<span class="insurance-commission-status ${esc(meta.cls)}">${esc(meta.label)}</span>`;
  }

  async function loadReferrals({ reset=true }={}) {
    if(reset)S.referralOffset=0;
    const f=S.referralFilters;
    const res=await rpc("app_insurance_list_referrer_accounts",{p_start_date:f.start||null,p_end_date:f.end||null,p_search:f.search||null,p_status:f.status||null,p_offset:S.referralOffset,p_limit:S.referralLimit});
    S.referrals=res?.items||[];S.referralTotal=Number(res?.total||0);S.referralHasMore=!!res?.has_more;
  }

  async function loadReferralSummary() {
    const f=S.referralFilters;
    S.referralSummary=await rpc("app_insurance_referrer_summary",{p_start_date:f.start||null,p_end_date:f.end||null,p_search:f.search||null,p_status:f.status||null})||{total:0,by_currency:[]};
  }

  function referralSummaryHtml() {
    const rows=Array.isArray(S.referralSummary.by_currency)?S.referralSummary.by_currency:[];
    if(!rows.length)return `<div class="insurance-commission-summary-empty">No referral commission totals for these filters.</div>`;
    return `<div class="insurance-commission-summary-strip insurance-referral-summary-strip">${rows.map(r=>`<div class="insurance-commission-summary-currency"><div class="insurance-commission-summary-code">${esc(r.currency)}</div><div><span>Referral Commission</span><strong>${moneyHtml(r.referral_commission,r.currency)}</strong></div><div><span>Paid</span><strong>${moneyHtml(r.referral_paid,r.currency)}</strong></div><div><span>Outstanding</span><strong>${moneyHtml(r.referral_outstanding,r.currency)}</strong></div></div>`).join("")}</div>`;
  }

  function referralToolbar() {
    const f=S.referralFilters;
    return `<div class="insurance-toolbar insurance-filter-toolbar insurance-referral-filter-toolbar">
      <div class="form-group insurance-filter-field insurance-search"><label class="form-label">Search</label><input id="insuranceReferralSearch" class="input" value="${esc(f.search)}" placeholder="Referral, company, policy or customer"></div>
      <div class="form-group insurance-filter-field"><label class="form-label">From</label><input id="insuranceReferralStart" class="input" type="date" value="${esc(f.start)}"></div>
      <div class="form-group insurance-filter-field"><label class="form-label">To</label><input id="insuranceReferralEnd" class="input" type="date" value="${esc(f.end)}"></div>
      <div class="form-group insurance-filter-field"><label class="form-label">Status</label><select id="insuranceReferralStatus" class="select"><option value="" ${!f.status?"selected":""}>All statuses</option><option value="outstanding" ${f.status==="outstanding"?"selected":""}>Outstanding</option><option value="partial" ${f.status==="partial"?"selected":""}>Partially Paid</option><option value="paid" ${f.status==="paid"?"selected":""}>Fully Paid</option></select></div>
      <div class="insurance-toolbar-actions insurance-filter-actions"><button class="btn primary tiny" id="insuranceReferralApply" type="button"><i class="fa-solid fa-filter"></i><span>Apply</span></button><button class="btn ghost tiny" id="insuranceReferralClear" type="button"><i class="fa-solid fa-rotate-left"></i><span>Clear</span></button></div>
    </div>`;
  }

  function referralCurrencyTotalsHtml(row) {
    const totals=Array.isArray(row?.currency_totals)?row.currency_totals:[];
    if(!totals.length)return `<span class="insurance-referrer-empty-money">—</span>`;
    return totals.map(t=>`<span class="insurance-referrer-money-line"><b>${esc(t.currency)}</b><span>${moneyHtml(t.referral_commission,t.currency)} · ${moneyHtml(t.referral_paid,t.currency)} · ${moneyHtml(t.referral_outstanding,t.currency)}</span></span>`).join("");
  }

  function referralRow(row) {
    return `<div class="insurance-referral-line insurance-referrer-line" data-insurance-referrer-row="${esc(row.referral_id)}"><div class="insurance-referral-main"><strong>${esc(row.referral_name)}</strong><span>${Number(row.transaction_count||0)} polic${Number(row.transaction_count||0)===1?"y":"ies"} · Latest ${fmtDate(row.last_transaction_date)}</span></div><div class="insurance-referrer-money" data-label="Commission · Paid · Outstanding">${referralCurrencyTotalsHtml(row)}</div><div class="insurance-referral-status">${referralStatusBadge(row)}</div><div>${rowMenuButtonHtml("referrer",row.referral_id)}</div></div>`;
  }

  function renderReferrals() {
    const root=$("#insuranceWorkspace");if(!root)return;
    root.innerHTML=`${referralToolbar()}${referralSummaryHtml()}<div class="insurance-referral-table insurance-referrer-table"><div class="insurance-referral-head insurance-referrer-head"><div>Referrer</div><div>Commission · Paid · Outstanding</div><div>Status</div><div></div></div><div class="insurance-referral-list">${S.referrals.length?S.referrals.map(referralRow).join(""):`<div class="insurance-empty"><i class="fa-solid fa-user-group"></i>No referral commissions found.</div>`}</div></div>${S.referralTotal?`<div class="insurance-pager"><button class="btn ghost tiny" id="insuranceReferralPrev" ${S.referralOffset<=0?"disabled":""}>Previous</button><span class="help">${Math.min(S.referralOffset+1,S.referralTotal)} to ${Math.min(S.referralOffset+S.referrals.length,S.referralTotal)} of ${S.referralTotal}</span><button class="btn ghost tiny" id="insuranceReferralNext" ${!S.referralHasMore?"disabled":""}>Next</button></div>`:""}`;
    const apply=async()=>{S.referralFilters={start:$("#insuranceReferralStart",root)?.value||"",end:$("#insuranceReferralEnd",root)?.value||"",search:$("#insuranceReferralSearch",root)?.value.trim()||"",status:$("#insuranceReferralStatus",root)?.value||""};if(S.referralFilters.start&&S.referralFilters.end&&S.referralFilters.start>S.referralFilters.end)return notify("From date cannot be later than To date.","error");await Promise.all([loadReferrals({reset:true}),loadReferralSummary()]);renderReferrals();};
    $("#insuranceReferralApply",root)?.addEventListener("click",apply);$("#insuranceReferralClear",root)?.addEventListener("click",async()=>{S.referralFilters={start:"",end:"",search:"",status:""};await Promise.all([loadReferrals({reset:true}),loadReferralSummary()]);renderReferrals();});
    $("#insuranceReferralPrev",root)?.addEventListener("click",async()=>{S.referralOffset=Math.max(0,S.referralOffset-S.referralLimit);await loadReferrals({reset:false});renderReferrals();});$("#insuranceReferralNext",root)?.addEventListener("click",async()=>{S.referralOffset+=S.referralLimit;await loadReferrals({reset:false});renderReferrals();});
    bindInsuranceRowMenus(root);bindClickableRows(root,'[data-insurance-referrer-row]',row=>openReferrerDetails(row.dataset.insuranceReferrerRow));
  }

  async function openReferrerDetails(referrerId) {
    try{
      const f=S.referralFilters,res=await rpc("app_insurance_get_referrer_account",{p_referrer_id:referrerId,p_start_date:f.start||null,p_end_date:f.end||null}),account=res?.item;if(!account)return;
      const transactions=Array.isArray(account.transactions)?account.transactions:[];S.referralTransactions=transactions;
      const totals=Array.isArray(account.currency_totals)?account.currency_totals:[];
      const totalsHtml=totals.length?`<div class="insurance-referrer-ledger-totals">${totals.map(t=>`<div><span>${esc(t.currency)}</span><b>${moneyHtml(t.referral_commission,t.currency)}</b><small>Paid ${moneyHtml(t.referral_paid,t.currency)} · Outstanding ${moneyHtml(t.referral_outstanding,t.currency)}</small></div>`).join("")}</div>`:"";
      const rows=transactions.length?transactions.map(tx=>`<div class="insurance-referrer-ledger-row" data-insurance-referral-transaction="${esc(tx.id)}"><div class="insurance-referrer-ledger-policy"><strong>${esc(tx.policy_name_snapshot)}${tx.policy_number?` · #${esc(tx.policy_number)}`:""}</strong><span>${esc(tx.company_name_snapshot)} · ${esc(tx.reference_no)} · ${fmtDate(tx.transaction_date)} ${fmtTime(tx.transaction_time)}</span><small>${esc(tx.customer_name||"Walk-in Customer")}</small></div><div data-label="Commission"><b>${moneyHtml(tx.referral_commission,tx.currency)}</b></div><div data-label="Paid"><b>${moneyHtml(tx.referral_paid,tx.currency)}</b></div><div data-label="Outstanding"><b class="${n(tx.referral_outstanding)>0?"insurance-amount-outstanding":""}">${moneyHtml(tx.referral_outstanding,tx.currency)}</b></div><div class="insurance-referral-status">${referralStatusBadge(tx)}</div><div>${rowMenuButtonHtml("referralTransaction",tx.id)}</div></div>`).join(""):`<div class="insurance-commission-payment-empty">No referral transactions match the selected dates.</div>`;
      openModal({id:"insuranceReferrerDetailsModal",title:account.name,subtitle:`Referral ledger · ${transactions.length} transaction${transactions.length===1?"":"s"}`,body:`${totalsHtml}<div class="insurance-referrer-ledger"><div class="insurance-referrer-ledger-head"><div>Policy / Transaction</div><div>Commission</div><div>Paid</div><div>Outstanding</div><div>Status</div><div></div></div>${rows}</div>`,actions:`<button class="btn primary" data-insurance-close>Done</button>`,onOpen(modal){bindInsuranceRowMenus(modal);bindClickableRows(modal,'[data-insurance-referral-transaction]',row=>openReferralDetails(row.dataset.insuranceReferralTransaction));}});
    }catch(err){notify(err.message||"Could not open referral ledger.","error");}
  }

  async function openReferralDetails(saleId) {
    try{
      const res=await rpc("app_insurance_get_referral",{p_sale_id:saleId}),row=res?.item;if(!row)return;
      const idx=S.referralTransactions.findIndex(r=>r.id===saleId);if(idx>=0)S.referralTransactions[idx]={...S.referralTransactions[idx],...row};else S.referralTransactions.push(row);
      const payments=Array.isArray(row.payments)?row.payments:[];
      openModal({id:"insuranceReferralDetailsModal",title:"Referral Commission",subtitle:`${row.referral_name} · ${row.reference_no}`,body:`<div class="insurance-detail-grid"><div class="insurance-detail"><span>Referral</span><strong>${esc(row.referral_name)}</strong></div><div class="insurance-detail"><span>Status</span><strong>${referralStatusBadge(row)}</strong></div><div class="insurance-detail"><span>Insurance Company</span><strong>${esc(row.company_name_snapshot)}</strong></div><div class="insurance-detail"><span>Policy</span><strong>${esc(row.policy_name_snapshot)}${row.policy_number?` · #${esc(row.policy_number)}`:""}</strong></div><div class="insurance-detail"><span>Sale</span><strong>${esc(row.reference_no)} · ${fmtDate(row.transaction_date)}</strong></div><div class="insurance-detail"><span>Customer</span><strong>${esc(row.customer_name||"Walk-in Customer")}</strong></div><div class="insurance-detail"><span>My Commission</span><strong>${moneyHtml(row.actual_profit,row.currency)}</strong></div><div class="insurance-detail"><span>Referral Commission</span><strong>${moneyHtml(row.referral_commission,row.currency)}</strong></div><div class="insurance-detail"><span>Paid</span><strong>${moneyHtml(row.referral_paid,row.currency)}</strong></div><div class="insurance-detail"><span>Outstanding</span><strong>${moneyHtml(row.referral_outstanding,row.currency)}</strong></div></div><div class="insurance-commission-payment-history"><div class="insurance-commission-payment-title">Payment History</div>${payments.length?payments.map(p=>`<div class="insurance-commission-payment-row"><div><strong>${esc(p.reference_no)}</strong><span>${fmtDate(p.payment_date)} ${fmtTime(p.payment_time)}${p.external_reference?` · ${esc(p.external_reference)}`:""}${p.notes?` · ${esc(p.notes)}`:""}</span></div><b>${moneyHtml(p.amount_paid,row.currency)}</b>${can("delete")?`<div>${rowMenuButtonHtml("referralPayment",p.id)}</div>`:""}</div>`).join(""):`<div class="insurance-commission-payment-empty">No referral payments recorded.</div>`}</div>`,actions:`${can("create")&&n(row.referral_outstanding)>0?`<button class="btn ghost" id="insuranceReferralPayFromDetails">Pay Referral</button>`:""}<button class="btn primary" data-insurance-close>Done</button>`,onOpen(modal){bindInsuranceRowMenus(modal);$("#insuranceReferralPayFromDetails",modal)?.addEventListener("click",()=>{modal.classList.add("hide");openReferralPayment(row);});}});
    }catch(err){notify(err.message||"Could not open referral commission.","error");}
  }

  function openReferralPayment(row) {
    if(!can("create"))return notify("Referral payment is not permitted for this account.","error");if(!row)return;
    const outstanding=n(row.referral_outstanding);
    openModal({id:"insuranceReferralPaymentModal",title:"Pay Referral",subtitle:`${row.referral_name} · ${row.reference_no}`,body:`<form id="insuranceReferralPaymentForm" class="insurance-form-grid insurance-referral-payment-form"><div class="insurance-detail insurance-referral-balance-card"><span>Outstanding</span><strong>${moneyHtml(outstanding,row.currency)}</strong></div><label>Amount Paid<input class="input" type="number" name="amount_paid" min="0.01" max="${outstanding}" step="0.01" value="${outstanding}" required></label><label>Payment Date<input class="input" type="date" name="payment_date" value="${dateToday()}" required></label><label>Payment Time<input class="input" type="time" name="payment_time" value="${timeNow()}" required></label><label>Reference<input class="input" name="external_reference" maxlength="120" placeholder="Optional"></label><label class="wide">Notes<textarea class="input" name="notes" rows="2" placeholder="Optional"></textarea></label></form>`,actions:`<button class="btn ghost" data-insurance-close>Cancel</button><button class="btn primary" id="insuranceReferralPaymentSave">Save</button>`,onOpen(modal,close){const form=$("#insuranceReferralPaymentForm",modal);$("#insuranceReferralPaymentSave",modal).onclick=async e=>{if(!form.reportValidity())return;const fd=new FormData(form),amount=n(fd.get("amount_paid"));if(amount<=0||amount>outstanding)return notify("Enter a payment within the outstanding referral balance.","error");setBusy(e.currentTarget,true,"Saving");try{await rpc("app_insurance_pay_referral",{p_sale_id:row.id,p_amount_paid:amount,p_payment_date:fd.get("payment_date"),p_payment_time:fd.get("payment_time"),p_external_reference:fd.get("external_reference")||null,p_notes:fd.get("notes")||null});close();await Promise.all([loadReferrals({reset:true}),loadReferralSummary()]);if(S.view==="referrals")renderReferrals();const ledger=document.getElementById("insuranceReferrerDetailsModal");if(ledger&&!ledger.classList.contains("hide")&&row.referral_id)await openReferrerDetails(row.referral_id);notify("Referral payment recorded.");}catch(err){notify(err.message||"Could not record referral payment.","error");}finally{setBusy(e.currentTarget,false);}};}});
  }

  async function deleteReferralPayment(paymentId,saleId) {
    if(!global.confirm("Delete this referral payment? The amount will return to the referral outstanding balance."))return;
    try{await rpc("app_insurance_delete_referral_payment",{p_id:paymentId});await Promise.all([loadReferrals({reset:true}),loadReferralSummary()]);if(S.view==="referrals")renderReferrals();notify("Referral payment deleted and outstanding balance recalculated.");if(saleId)openReferralDetails(saleId);}catch(err){notify(err.message||"Could not delete referral payment.","error");}
  }

  function customerBalanceToolbar() {
    const f=S.customerBalanceFilters;
    return `<div class="insurance-toolbar insurance-filter-toolbar insurance-customer-balance-toolbar">
      <div class="form-group insurance-filter-field insurance-search"><label class="form-label">Search</label><input id="insuranceCustomerBalanceSearch" class="input" value="${esc(f.search)}" placeholder="Customer name, number, phone, email or company"></div>
      <div class="form-group insurance-filter-field"><label class="form-label">Balance</label><select id="insuranceCustomerBalanceStatus" class="select"><option value="outstanding" ${f.status==="outstanding"?"selected":""}>Outstanding only</option><option value="all" ${f.status==="all"?"selected":""}>All customers</option><option value="settled" ${f.status==="settled"?"selected":""}>Settled only</option></select></div>
      <div class="insurance-toolbar-actions insurance-filter-actions"><button class="btn primary tiny" id="insuranceCustomerBalanceApply" type="button"><i class="fa-solid fa-filter"></i><span>Apply</span></button><button class="btn ghost tiny" id="insuranceCustomerBalanceClear" type="button"><i class="fa-solid fa-rotate-left"></i><span>Reset</span></button></div>
    </div>`;
  }

  function customerBalanceCurrencyLines(row) {
    const totals=Array.isArray(row?.currency_totals)?row.currency_totals:[];
    if(!totals.length)return `<span class="insurance-customer-balance-empty">—</span>`;
    return totals.map(t=>`<span class="insurance-customer-balance-money"><b>${esc(t.currency)}</b><span>${moneyHtml(t.outstanding,t.currency)}</span></span>`).join("");
  }

  function customerBalanceRow(row) {
    return `<div class="insurance-customer-balance-row" data-insurance-customer-balance="${esc(row.customer_number)}">
      <div class="insurance-customer-balance-main"><strong>${esc(row.customer_name)}</strong><span>#${esc(row.customer_number)} · ${Number(row.transaction_count||0)} transaction${Number(row.transaction_count||0)===1?"":"s"}${row.company?` · ${esc(row.company)}`:""}</span></div>
      <div class="insurance-customer-balance-outstanding" data-label="Outstanding">${customerBalanceCurrencyLines(row)}</div>
      <div class="insurance-customer-balance-status">${customerPaymentStatusBadge(row)}<small>Latest ${fmtDate(row.last_transaction_date)}</small></div>
      <div class="insurance-customer-balance-arrow">${rowMenuButtonHtml("customerBalance",row.customer_number)}</div>
    </div>`;
  }

  function renderCustomerBalances() {
    const root=$("#insuranceWorkspace");if(!root)return;
    root.innerHTML=`${customerBalanceToolbar()}<div class="insurance-customer-balance-table"><div class="insurance-customer-balance-head"><div>Customer</div><div>Outstanding Balance</div><div>Status</div><div></div></div><div class="insurance-customer-balance-list">${S.customerBalances.length?S.customerBalances.map(customerBalanceRow).join(""):`<div class="insurance-empty"><i class="fa-solid fa-users"></i>No customers match this balance filter.</div>`}</div></div>${S.customerBalanceTotal?`<div class="insurance-pager"><button class="btn ghost tiny" id="insuranceCustomerBalancePrev" ${S.customerBalanceOffset<=0?"disabled":""}>Previous</button><span class="help">${Math.min(S.customerBalanceOffset+1,S.customerBalanceTotal)} to ${Math.min(S.customerBalanceOffset+S.customerBalances.length,S.customerBalanceTotal)} of ${S.customerBalanceTotal}</span><button class="btn ghost tiny" id="insuranceCustomerBalanceNext" ${!S.customerBalanceHasMore?"disabled":""}>Next</button></div>`:""}`;
    const apply=async()=>{S.customerBalanceFilters={search:$("#insuranceCustomerBalanceSearch",root)?.value.trim()||"",status:$("#insuranceCustomerBalanceStatus",root)?.value||"outstanding"};await loadCustomerBalances({reset:true});renderCustomerBalances();};
    $("#insuranceCustomerBalanceApply",root)?.addEventListener("click",apply);
    $("#insuranceCustomerBalanceClear",root)?.addEventListener("click",async()=>{S.customerBalanceFilters={search:"",status:"outstanding"};await loadCustomerBalances({reset:true});renderCustomerBalances();});
    $("#insuranceCustomerBalanceSearch",root)?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();apply();}});
    $("#insuranceCustomerBalancePrev",root)?.addEventListener("click",async()=>{S.customerBalanceOffset=Math.max(0,S.customerBalanceOffset-S.customerBalanceLimit);await loadCustomerBalances({reset:false});renderCustomerBalances();});
    $("#insuranceCustomerBalanceNext",root)?.addEventListener("click",async()=>{S.customerBalanceOffset+=S.customerBalanceLimit;await loadCustomerBalances({reset:false});renderCustomerBalances();});
    bindInsuranceRowMenus(root);
    bindClickableRows(root,'[data-insurance-customer-balance]',row=>openCustomerBalance(row.dataset.insuranceCustomerBalance));
  }

  function customerAccountTotalsHtml(account) {
    const totals=Array.isArray(account?.currency_totals)?account.currency_totals:[];
    if(!totals.length)return `<div class="insurance-commission-summary-empty">No Insurance transactions for this customer.</div>`;
    return `<div class="insurance-customer-account-totals">${totals.map(t=>`<div><span>${esc(t.currency)}</span><b>${moneyHtml(t.outstanding,t.currency)}</b><small>Sales ${moneyHtml(t.sale_total,t.currency)} · Paid ${moneyHtml(t.amount_paid,t.currency)}</small></div>`).join("")}</div>`;
  }

  async function fetchCustomerAccount(customerNumber) {
    const res=await rpc("app_insurance_get_customer_account",{p_customer_number:customerNumber});
    return res?.item||null;
  }

  async function openCustomerBalance(customerNumber) {
    try{
      const [account,tempResult]=await Promise.all([fetchCustomerAccount(customerNumber),rpc("app_insurance_list_temp_invoices",{})]);if(!account)return;
      S.tempInvoices=tempResult?.items||S.tempInvoices||[];
      const txs=Array.isArray(account.transactions)?account.transactions:[];S.customerAccountTransactions=txs;
      const contact=[account.phone,account.email,account.company].filter(Boolean).map(esc).join(" · ");
      const rows=txs.length?txs.map(tx=>`<div class="insurance-customer-account-row" data-insurance-customer-sale="${esc(tx.id)}"><div class="insurance-customer-account-policy"><strong>${esc(tx.policy_name_snapshot)}${tx.policy_number?` · #${esc(tx.policy_number)}`:""}</strong><span>${esc(tx.company_name_snapshot)} · ${esc(tx.reference_no)} · ${fmtDate(tx.transaction_date)} ${fmtTime(tx.transaction_time)}</span></div><div data-label="Sale"><b>${moneyHtml(tx.sale_price,tx.currency)}</b></div><div data-label="Paid"><b>${moneyHtml(tx.customer_amount_paid,tx.currency)}</b></div><div data-label="Outstanding"><b class="${n(tx.customer_outstanding)>0?"insurance-amount-outstanding":""}">${moneyHtml(tx.customer_outstanding,tx.currency)}</b></div><div class="insurance-customer-account-status">${customerPaymentStatusBadge(tx)}</div><div class="insurance-customer-account-actions">${documentMenuButtonHtml("customerTransaction",tx.id)}</div></div>`).join(""):`<div class="insurance-commission-payment-empty">No Insurance transactions found.</div>`;
      openModal({id:"insuranceCustomerBalanceDetailsModal",title:account.name,subtitle:`Customer #${account.customer_number}${contact?` · ${contact}`:""}`,body:`${customerAccountTotalsHtml(account)}<div class="insurance-customer-account-document-hint"><i class="fa-solid fa-circle-info"></i><span>Use Documents on any transaction to download its Invoice PDF or Receipt PDF, or create, edit and download its Temporary Invoice.</span></div><div class="insurance-customer-account-ledger"><div class="insurance-customer-account-head"><div>Policy / Transaction</div><div>Sale</div><div>Paid</div><div>Outstanding</div><div>Status</div><div>Documents</div></div>${rows}</div>`,actions:`<button class="btn ghost" id="insuranceCustomerStatementPdf"><i class="fa-solid fa-file-pdf"></i> Statement PDF</button><button class="btn primary" data-insurance-close>Done</button>`,onOpen(modal){bindInsuranceRowMenus(modal);bindClickableRows(modal,'[data-insurance-customer-sale]',row=>openSaleDetails(row.dataset.insuranceCustomerSale));$("#insuranceCustomerStatementPdf",modal)?.addEventListener("click",()=>downloadCustomerStatementPdf(account));}});
    }catch(err){notify(err.message||"Could not open customer balance.","error");}
  }

  function insuranceProviderProfile(data={}) {
    const current=S.companies.find(c=>c.id===(data.company_id||data.source_company_id));
    return {
      name:data.insurance_company||data.company_name_snapshot||current?.company_name||"Insurance Company",
      contact:data.insurance_contact_name||current?.contact_name||"",
      phone:data.insurance_phone||current?.phone||"",
      email:data.insurance_email||current?.email||"",
      address:data.insurance_address||current?.address||""
    };
  }

  function insurancePolicyProfile(data={}) {
    const current=S.policies.find(p=>p.id===(data.policy_id||data.source_policy_id));
    return {
      name:data.policy_name||data.policy_name_snapshot||data.description||current?.policy_name||"Insurance Policy",
      number:data.policy_number||"",
      description:data.policy_description||current?.description||"",
      notes:data.policy_notes||current?.notes||""
    };
  }

  function createInsuranceA5Pdf(jsPDF) {
    return new jsPDF({orientation:"landscape",unit:"mm",format:"a5",compress:true});
  }

  function insurancePdfAmount(value,currency) {
    return typeof formatPdfAmount==="function"?formatPdfAmount(value,currency):moneyPlain(value,currency);
  }

  function insurancePdfLines(doc,value,width,maxLines=2) {
    if(value==null||String(value).trim()==="")return [];
    return doc.splitTextToSize(String(value),width).slice(0,maxLines);
  }

  function drawInsurancePdfFrame(doc,logo,title,reference,date,pageNo=1) {
    const pageW=doc.internal.pageSize.getWidth(),pageH=doc.internal.pageSize.getHeight(),company=documentCompanyProfile();
    if(typeof applyProfessionalPdfDefaults==="function")applyProfessionalPdfDefaults(doc);
    doc.setFillColor(15,23,42);doc.rect(0,0,pageW,4.2,"F");doc.setFillColor(36,87,214);doc.rect(0,4.2,pageW,1.1,"F");
    if(logo&&typeof drawFittedPdfImage==="function")drawFittedPdfImage(doc,logo,8,7.2,34,12.5,{align:"left",valign:"middle"});
    doc.setTextColor(15,23,42);doc.setFont("helvetica","bold");doc.setFontSize(12);doc.text(String(title||"Insurance Document"),48,12.2);
    doc.setTextColor(71,85,105);doc.setFont("helvetica","normal");doc.setFontSize(6.2);doc.text(String(reference||""),48,16.9,{maxWidth:88});
    doc.setTextColor(100,116,139);doc.setFontSize(5.6);doc.text("DATE",pageW-8,9.8,{align:"right"});doc.setTextColor(15,23,42);doc.setFontSize(7);doc.text(fmtDate(date)||"—",pageW-8,14.1,{align:"right"});
    doc.setDrawColor(226,232,240);doc.setLineWidth(.2);doc.line(8,22,pageW-8,22);
    doc.setDrawColor(226,232,240);doc.line(8,pageH-10,pageW-8,pageH-10);doc.setFont("helvetica","normal");doc.setFontSize(5.3);doc.setTextColor(100,116,139);
    doc.text(String(company.name||"Triplem VIP"),8,pageH-6.1);doc.text("System-generated Insurance document",pageW/2,pageH-6.1,{align:"center"});doc.text(`Page ${pageNo}`,pageW-8,pageH-6.1,{align:"right"});
  }

  function drawInsurancePdfCard(doc,{x,y,w,h,label,title,lines=[]}) {
    doc.setDrawColor(221,226,232);doc.setFillColor(249,250,251);doc.roundedRect(x,y,w,h,1.6,1.6,"FD");
    doc.setFont("helvetica","bold");doc.setFontSize(5.4);doc.setTextColor(100,116,139);doc.text(String(label||""),x+3,y+4.2);
    doc.setFontSize(7.1);doc.setTextColor(15,23,42);const titleLines=insurancePdfLines(doc,title,w-6,1);if(titleLines.length)doc.text(titleLines,x+3,y+8.8);
    doc.setFont("helvetica","normal");doc.setTextColor(71,85,105);
    const source=(lines||[]).filter(Boolean).map(String),available=Math.max(5,h-13.1);let fontSize=5.15,lineHeight=2.65,visual=[];
    for(const size of [5.15,4.85,4.55]){doc.setFontSize(size);const candidate=source.flatMap(line=>doc.splitTextToSize(line,w-6));const lh=size<=4.55?2.35:size<=4.85?2.5:2.65;if(candidate.length*lh<=available+.25){fontSize=size;lineHeight=lh;visual=candidate;break;}visual=candidate;fontSize=size;lineHeight=lh;}
    const maxLines=Math.max(1,Math.floor(available/lineHeight));if(visual.length>maxLines){visual=visual.slice(0,maxLines);const last=String(visual[maxLines-1]||"");visual[maxLines-1]=last.length>2?`${last.slice(0,-1)}…`:"…";}
    doc.setFontSize(fontSize);if(visual.length)doc.text(visual,x+3,y+13,{lineHeightFactor:1.05});
  }

  function insuranceStatementTransactionRow(tx) {
    const provider=insuranceProviderProfile(tx),policy=insurancePolicyProfile(tx);
    const providerContact=[provider.contact,provider.phone,provider.email,provider.address].filter(Boolean).join("\n");
    const policyDetail=[policy.number?`#${policy.number}`:"",policy.description,policy.notes].filter(Boolean).join("\n");
    const status=(CUSTOMER_PAYMENT_STATUS[tx.customer_payment_status]||CUSTOMER_PAYMENT_STATUS.paid).label;
    return [
      `${fmtDate(tx.transaction_date)}\n${fmtTime(tx.transaction_time)}`,
      tx.reference_no||"",
      `${provider.name}${providerContact?`\n${providerContact}`:""}`,
      `${policy.name}${policyDetail?`\n${policyDetail}`:""}`,
      insurancePdfAmount(tx.sale_price,tx.currency),
      insurancePdfAmount(tx.customer_amount_paid,tx.currency),
      insurancePdfAmount(tx.customer_outstanding,tx.currency),
      status
    ];
  }

  async function downloadCustomerStatementPdf(customerOrAccount) {
    if(!global.jspdf?.jsPDF)return notify("PDF library is still loading. Try again in a moment.","error");
    try{
      const account=typeof customerOrAccount==="string"?await fetchCustomerAccount(customerOrAccount):customerOrAccount;if(!account)return notify("Customer account could not be loaded.","error");
      const txs=Array.isArray(account.transactions)?account.transactions:[],totals=Array.isArray(account.currency_totals)?account.currency_totals:[];
      const {jsPDF}=global.jspdf,doc=createInsuranceA5Pdf(jsPDF);
      if(typeof loadCustomFontsForPdf==="function")await loadCustomFontsForPdf(doc);
      const logo=typeof getPdfLogo==="function"?await getPdfLogo():null,company=documentCompanyProfile(),pageW=doc.internal.pageSize.getWidth(),left=8,right=8,gap=4,cardW=(pageW-left-right-gap*2)/3;
      const ref=`Customer #${account.customer_number||""}`,statementDate=dateToday();
      drawInsurancePdfFrame(doc,logo,"Customer Statement",ref,statementDate,1);
      const companyLines=[company.trn?`TRN ${company.trn}`:"",[company.email,company.phone].filter(Boolean).join(" · "),company.address].filter(Boolean);
      const customerLines=[account.customer_number?`Customer No. #${account.customer_number}`:"",[account.company,account.trn?`TRN ${account.trn}`:""].filter(Boolean).join(" · "),[account.phone,account.email].filter(Boolean).join(" · "),account.address].filter(Boolean);
      const summaryLines=totals.slice(0,4).map(t=>`${t.currency}: Sales ${insurancePdfAmount(t.sale_total,t.currency)} · Paid ${insurancePdfAmount(t.amount_paid,t.currency)} · Due ${insurancePdfAmount(t.outstanding,t.currency)}`);
      if(totals.length>4)summaryLines.push(`+${totals.length-4} more currencies`);
      drawInsurancePdfCard(doc,{x:left,y:26,w:cardW,h:28,label:"ISSUER",title:company.name,lines:companyLines});
      drawInsurancePdfCard(doc,{x:left+cardW+gap,y:26,w:cardW,h:28,label:"CUSTOMER",title:account.name||"Customer",lines:customerLines});
      drawInsurancePdfCard(doc,{x:left+(cardW+gap)*2,y:26,w:cardW,h:28,label:"ACCOUNT SUMMARY",title:`${txs.length} transaction${txs.length===1?"":"s"}`,lines:summaryLines.length?summaryLines:["No currency totals available"]});
      const startY=59;
      if(txs.length){
        doc.autoTable({
          startY,
          head:[["Policy Date","Reference","Insurance Company","Policy Details","Sale","Paid","Balance","Status"]],
          body:txs.map(insuranceStatementTransactionRow),
          styles:{fontSize:5.05,cellPadding:1.15,overflow:"linebreak",valign:"middle",lineColor:[229,231,235],lineWidth:.08},
          headStyles:{fontSize:5.05,fillColor:[15,23,42],textColor:255,fontStyle:"bold",halign:"left"},
          columnStyles:{0:{cellWidth:18},1:{cellWidth:21},2:{cellWidth:34},3:{cellWidth:40},4:{cellWidth:20,halign:"right"},5:{cellWidth:20,halign:"right"},6:{cellWidth:20,halign:"right"},7:{cellWidth:17}},
          margin:{left,right,top:26,bottom:13},
          showHead:"everyPage",
          willDrawPage:data=>{if(data.pageNumber>1)drawInsurancePdfFrame(doc,logo,"Customer Statement",ref,statementDate,data.pageNumber);}
        });
      }else{
        doc.setFont("helvetica","normal");doc.setFontSize(6.2);doc.setTextColor(100,116,139);doc.text("No Insurance transactions found for this customer.",left,startY+5);
      }
      const safe=String(account.name||account.customer_number||"Customer").replace(/[^a-z0-9_-]+/gi,"_").replace(/^_+|_+$/g,"")||"Customer";
      doc.save(`Insurance_Customer_Statement_${safe}_${String(account.customer_number||"").replace(/[^a-z0-9_-]+/gi,"_")}.pdf`);
    }catch(err){notify(err.message||"Could not generate customer statement PDF.","error");}
  }

  function renderCompanies() {
    const root = $("#insuranceWorkspace"); if (!root) return;
    root.innerHTML = `<div class="insurance-toolbar"><div class="insurance-toolbar-actions">${can("create") ? `<button class="btn primary tiny" id="insuranceAddCompany"><i class="fa-solid fa-plus"></i> Add Insurance Company</button>` : ""}</div></div>
      <div class="insurance-list" style="margin-top:10px">${S.companies.length ? S.companies.map(c => `<div class="insurance-row" data-insurance-company-row="${esc(c.id)}">
        <div class="insurance-row-main"><strong>${esc(c.company_name)}</strong><small>${esc(c.contact_name || c.email || c.phone || "No contact details")} · ${c.is_active !== false ? "Active" : "Inactive"}</small></div>
        <div class="insurance-cell"><small>Sales</small><b>${Number(c.sale_count || 0)}</b></div><div class="insurance-cell"><small>Created</small><b>${fmtDate(String(c.created_at || "").slice(0,10))}</b></div><div class="insurance-cell"><small>Updated</small><b>${fmtDate(String(c.updated_at || "").slice(0,10))}</b></div>
        <div class="insurance-actions">${rowMenuButtonHtml("company",c.id)}</div></div>`).join("") : `<div class="insurance-empty"><i class="fa-solid fa-building-shield"></i>No Insurance Companies yet.</div>`}</div>`;
    $("#insuranceAddCompany", root)?.addEventListener("click", () => openCompanyForm());
    bindInsuranceRowMenus(root);
    bindClickableRows(root,'[data-insurance-company-row]',row=>openCompanyDetails(S.companies.find(c=>c.id===row.dataset.insuranceCompanyRow)));
  }

  function renderPolicies() {
    const root = $("#insuranceWorkspace"); if (!root) return;
    root.innerHTML = `<div class="insurance-toolbar"><div class="insurance-policy-note"><i class="fa-solid fa-circle-info"></i><span>Policies are independent from Insurance Companies and can be sold through any active provider.</span></div><div class="insurance-toolbar-actions">${can("create") ? `<button class="btn primary tiny" id="insuranceAddPolicy"><i class="fa-solid fa-plus"></i> Add Policy</button>` : ""}</div></div><div id="insurancePolicyRows" class="insurance-list" style="margin-top:10px"></div>`;
    const rows = S.policies;
    $("#insurancePolicyRows", root).innerHTML = rows.length ? rows.map(p => `<div class="insurance-row" data-insurance-policy-row="${esc(p.id)}"><div class="insurance-row-main"><strong>${esc(p.policy_name)}</strong><small>${p.is_active !== false ? "Active" : "Inactive"}${p.description ? ` · ${esc(p.description)}` : ""}</small></div><div class="insurance-cell"><small>Sales</small><b>${Number(p.sale_count || 0)}</b></div><div class="insurance-cell"><small>Created</small><b>${fmtDate(String(p.created_at||"").slice(0,10))}</b></div><div class="insurance-cell"><small>Updated</small><b>${fmtDate(String(p.updated_at||"").slice(0,10))}</b></div><div class="insurance-actions">${rowMenuButtonHtml("policy",p.id)}</div></div>`).join("") : `<div class="insurance-empty"><i class="fa-solid fa-file-shield"></i>No Insurance Policies found.</div>`;
    $("#insuranceAddPolicy", root)?.addEventListener("click", () => openPolicyForm());
    bindInsuranceRowMenus(root);
    bindClickableRows(root,'[data-insurance-policy-row]',row=>openPolicyDetails(S.policies.find(p=>p.id===row.dataset.insurancePolicyRow)));
  }

  function activeReportMeta() { return REPORT_VIEWS[S.reportView] || REPORT_VIEWS.commission; }

  function selectedDateRangeLabel() {
    if (S.filters.start && S.filters.end) return `${fmtDate(S.filters.start)} to ${fmtDate(S.filters.end)}`;
    if (S.filters.start) return `From ${fmtDate(S.filters.start)}`;
    if (S.filters.end) return `Up to ${fmtDate(S.filters.end)}`;
    return "All dates";
  }

  function reportFieldCell(key, row) {
    const field = REPORT_FIELD_META[key], value = n(row[field.key]);
    const isLoss = key === "actual_profit" && value < 0;
    return `<div class="insurance-report-line-value ${isLoss ? "insurance-amount-loss" : ""}" data-label="${esc(isLoss ? "User Loss" : field.label)}"><span>${moneyHtml(value,row.currency)}</span></div>`;
  }

  function reportListHeaderHtml() {
    const meta = activeReportMeta();
    return `<div class="insurance-report-line insurance-report-line-head insurance-report-cols-${meta.fields.length}"><div>Item</div>${meta.fields.map(key => `<div>${esc(REPORT_FIELD_META[key].label)}</div>`).join("")}<div class="insurance-report-line-action-head">Actions</div></div>`;
  }

  function reportSaleRow(s) {
    const meta = activeReportMeta();
    return `<div class="insurance-report-line insurance-report-line-record insurance-report-cols-${meta.fields.length}" data-insurance-report-sale="${esc(s.id)}">
      <div class="insurance-report-item"><strong>${esc(s.policy_name_snapshot || "Insurance")}${s.cancellation_id?` <span class="insurance-cancelled-badge">Cancelled</span>`:""}</strong><span>${esc(s.reference_no)}${s.policy_number?` · Policy #${esc(s.policy_number)}`:""} · ${fmtDate(s.transaction_date)} · ${esc(s.company_name_snapshot)} · ${esc(s.customer_name || "Walk-in Customer")}${s.cancellation_id?` · ${formatPolicyDuration(s.policy_used_days)} used`:""}</span></div>
      ${meta.fields.map(key => reportFieldCell(key,s)).join("")}
      <div class="insurance-report-line-actions">${saleActionMenuHtml(s)}</div>
    </div>`;
  }

  function reportSummaryHtml(totals) {
    const meta = activeReportMeta();
    if (!totals.length) return `<div class="insurance-report-total-empty">No totals for the selected filters.</div>`;
    return totals.map(r => `<div class="insurance-report-line insurance-report-line-total insurance-report-cols-${meta.fields.length}">
      <div class="insurance-report-item"><strong>Total · ${esc(r.currency)}</strong><span>${Number(r.sale_count||0)} sales${Number(r.loss_count||0) ? ` · ${Number(r.loss_count||0)} loss` : ""}</span></div>
      ${meta.fields.map(key => reportFieldCell(key,r)).join("")}
      <div></div>
    </div>`).join("");
  }

  function renderReports() {
    const root = $("#insuranceWorkspace"); if (!root) return;
    const totals = Array.isArray(S.summary.by_currency) ? S.summary.by_currency : [];
    const meta = activeReportMeta();
    const dateLabel = selectedDateRangeLabel();
    root.innerHTML = `${salesToolbar({ report: true })}<div class="insurance-report-heading"><div><strong>${esc(meta.label)}</strong><span>${esc(dateLabel)} · ${Number(S.total||0).toLocaleString()} record${Number(S.total||0)===1?"":"s"}</span></div></div><div class="insurance-report-table">${reportListHeaderHtml()}<div class="insurance-report-list">${S.sales.length ? S.sales.map(reportSaleRow).join("") : `<div class="insurance-empty"><i class="fa-solid fa-chart-column"></i>No report records found.</div>`}</div><div class="insurance-report-totals">${reportSummaryHtml(totals)}</div></div>${S.total ? `<div class="insurance-pager"><button class="btn ghost tiny" id="insuranceReportPrev" ${S.offset<=0?"disabled":""}>Previous</button><span class="help">${Math.min(S.offset+1,S.total)} to ${Math.min(S.offset+S.sales.length,S.total)} of ${S.total}</span><button class="btn ghost tiny" id="insuranceReportNext" ${!S.hasMore?"disabled":""}>Next</button></div>` : ""}`;
    bindFilters(root, { report: true });
    bindSaleRecordActions(root);
    $("#insuranceReportPrev",root)?.addEventListener("click",async()=>{S.offset=Math.max(0,S.offset-100);await loadSales({reset:false,report:true});renderReports();});
    $("#insuranceReportNext",root)?.addEventListener("click",async()=>{S.offset+=100;await loadSales({reset:false,report:true});renderReports();});
  }

  function renderTemporaryInvoices() {
    const root = $("#insuranceWorkspace"); if (!root) return;
    root.innerHTML = `<div class="insurance-list">${S.tempInvoices.length ? S.tempInvoices.map(t => {
      const d = t.invoice_data || {};
      return `<div class="insurance-temp-card" data-insurance-temp-row="${esc(t.id)}"><div><strong>${esc(t.invoice_number)}</strong><div class="help">${esc(d.customer_name || "Customer")}${d.customer_number ? ` · #${esc(d.customer_number)}` : ""} · ${esc(d.policy_name || "Insurance")} · ${fmtDate(d.invoice_date || String(t.updated_at||"").slice(0,10))}</div></div><div class="insurance-actions">${rowMenuButtonHtml("temp",t.id)}</div></div>`;
    }).join("") : `<div class="insurance-empty"><i class="fa-solid fa-file-pen"></i>No temporary invoices saved. Create one from an Insurance Sale.</div>`}</div>`;
    bindInsuranceRowMenus(root);
    bindClickableRows(root,'[data-insurance-temp-row]',row=>previewTempInvoice(S.tempInvoices.find(t=>t.id===row.dataset.insuranceTempRow)));
  }

  async function switchView(view) {
    if (!VIEWS.some(v => v[0] === view)) view = "sales";
    S.view = view; renderViewTabs();
    try {
      if (view === "sales") { await loadSales({ reset: true }); renderSales(); }
      else if (view === "commission") { await Promise.all([loadCommissions({ reset: true }), loadOpeningBalances(), loadCommissionSummary()]); renderMyCommission(); }
      else if (view === "referrals") { await Promise.all([loadReferrals({ reset: true }), loadReferralSummary()]); renderReferrals(); }
      else if (view === "customers") { await loadCustomerBalances({ reset: true }); renderCustomerBalances(); }
      else if (view === "companies") renderCompanies();
      else if (view === "policies") renderPolicies();
      else if (view === "reports") { await loadSales({ reset: true, report: true }); renderReports(); }
      else if (view === "temporary") { const r = await rpc("app_insurance_list_temp_invoices",{}); S.tempInvoices = r?.items || []; renderTemporaryInvoices(); }
    } catch (err) { notify(err.message || "Could not open Insurance view.", "error"); }
  }

  function openCompanyForm(company = null) {
    const edit = !!company;
    openModal({ title: edit ? "Edit Insurance Company" : "Add Insurance Company", subtitle: "This provider is separate from your own workspace/company profile.", body: `<form id="insuranceCompanyForm" class="insurance-form-grid insurance-master-form">
      <label class="wide">Company Name<input class="input" name="company_name" required maxlength="160" value="${esc(company?.company_name || "")}"></label>
      <label>Contact Name<input class="input" name="contact_name" value="${esc(company?.contact_name || "")}"></label><label>Phone<input class="input" name="phone" value="${esc(company?.phone || "")}"></label>
      <label>Email<input class="input" type="email" name="email" value="${esc(company?.email || "")}"></label><label>Status<select class="select" name="is_active"><option value="true" ${company?.is_active !== false ? "selected" : ""}>Active</option><option value="false" ${company?.is_active === false ? "selected" : ""}>Inactive</option></select></label>
      <label class="wide">Address<input class="input" name="address" value="${esc(company?.address || "")}"></label><label class="wide">Notes<textarea class="input" name="notes" rows="3">${esc(company?.notes || "")}</textarea></label></form>`, actions: `<button class="btn ghost" data-insurance-close>Cancel</button><button class="btn primary" id="insuranceCompanySave">${edit ? "Save" : "Add"}</button>`, onOpen(modal, close) {
      $("#insuranceCompanySave", modal).onclick = async e => {
        const form = $("#insuranceCompanyForm", modal); if (!form.reportValidity()) return;
        const fd = new FormData(form); setBusy(e.currentTarget, true, "Saving");
        try { await rpc("app_insurance_upsert_company", { p_id: company?.id || null, p_company_name: fd.get("company_name"), p_contact_name: fd.get("contact_name"), p_phone: fd.get("phone"), p_email: fd.get("email"), p_address: fd.get("address"), p_notes: fd.get("notes"), p_is_active: fd.get("is_active") === "true" }); close(); await reloadMasterAndView(); notify(edit ? "Insurance Company updated." : "Insurance Company added."); }
        catch (err) { notify(err.message || "Could not save Insurance Company.", "error"); }
        finally { setBusy(e.currentTarget, false); }
      };
    }});
  }

  function openPolicyForm(policy = null) {
    const edit = !!policy;
    openModal({ title: edit ? "Edit Insurance Policy" : "Add Insurance Policy", subtitle: "Policies are reusable across every Insurance Company. Pricing is entered only when making a sale.", body: `<form id="insurancePolicyForm" class="insurance-form-grid insurance-master-form">
      <label class="wide">Policy Name<input class="input" name="policy_name" required maxlength="180" value="${esc(policy?.policy_name || "")}" placeholder="e.g. Comprehensive Insurance"></label>
      <label class="wide">Description<textarea class="input" name="description" rows="2">${esc(policy?.description || "")}</textarea></label><label class="wide">Notes<textarea class="input" name="notes" rows="2">${esc(policy?.notes || "")}</textarea></label>
      <label>Status<select class="select" name="is_active"><option value="true" ${policy?.is_active !== false ? "selected" : ""}>Active</option><option value="false" ${policy?.is_active === false ? "selected" : ""}>Inactive</option></select></label></form>`, actions: `<button class="btn ghost" data-insurance-close>Cancel</button><button class="btn primary" id="insurancePolicySave">${edit ? "Save" : "Add"}</button>`, onOpen(modal, close) {
      $("#insurancePolicySave", modal).onclick = async e => { const form=$("#insurancePolicyForm",modal); if(!form.reportValidity())return; const fd=new FormData(form); setBusy(e.currentTarget,true,"Saving"); try { await rpc("app_insurance_upsert_policy",{p_id:policy?.id||null,p_company_id:null,p_policy_name:fd.get("policy_name"),p_description:fd.get("description"),p_notes:fd.get("notes"),p_is_active:fd.get("is_active")==="true"}); close(); await reloadMasterAndView(); notify(edit?"Insurance Policy updated.":"Insurance Policy added."); } catch(err){notify(err.message||"Could not save Insurance Policy.","error");} finally{setBusy(e.currentTarget,false);} };
    }});
  }

  function openCompanyDetails(company) {
    if (!company) return;
    openModal({ id:"insuranceCompanyDetailsModal", title:"Insurance Company", subtitle:company.company_name, body:`<div class="insurance-detail-grid">
      <div class="insurance-detail"><span>Status</span><strong>${company.is_active !== false ? "Active" : "Inactive"}</strong></div>
      <div class="insurance-detail"><span>Sales</span><strong>${Number(company.sale_count||0)}</strong></div>
      <div class="insurance-detail"><span>Contact</span><strong>${esc(company.contact_name||"—")}</strong></div>
      <div class="insurance-detail"><span>Phone</span><strong>${esc(company.phone||"—")}</strong></div>
      <div class="insurance-detail"><span>Email</span><strong>${esc(company.email||"—")}</strong></div>
      <div class="insurance-detail"><span>Updated</span><strong>${fmtDate(String(company.updated_at||"").slice(0,10))}</strong></div>
      ${company.address?`<div class="insurance-detail insurance-detail-wide"><span>Address</span><strong>${esc(company.address)}</strong></div>`:""}
      ${company.notes?`<div class="insurance-detail insurance-detail-wide"><span>Notes</span><strong>${esc(company.notes)}</strong></div>`:""}
    </div>`,actions:`<button class="btn primary" data-insurance-close>Done</button>`});
  }

  function openPolicyDetails(policy) {
    if (!policy) return;
    openModal({ id:"insurancePolicyDetailsModal", title:"Insurance Policy", subtitle:policy.policy_name, body:`<div class="insurance-detail-grid">
      <div class="insurance-detail"><span>Status</span><strong>${policy.is_active !== false ? "Active" : "Inactive"}</strong></div>
      <div class="insurance-detail"><span>Sales</span><strong>${Number(policy.sale_count||0)}</strong></div>
      <div class="insurance-detail"><span>Created</span><strong>${fmtDate(String(policy.created_at||"").slice(0,10))}</strong></div>
      <div class="insurance-detail"><span>Updated</span><strong>${fmtDate(String(policy.updated_at||"").slice(0,10))}</strong></div>
      ${policy.description?`<div class="insurance-detail insurance-detail-wide"><span>Description</span><strong>${esc(policy.description)}</strong></div>`:""}
      ${policy.notes?`<div class="insurance-detail insurance-detail-wide"><span>Notes</span><strong>${esc(policy.notes)}</strong></div>`:""}
    </div>`,actions:`<button class="btn primary" data-insurance-close>Done</button>`});
  }

  async function deleteCompany(id) {
    const c=S.companies.find(x=>x.id===id); if(!c)return;
    if(!global.confirm(`Delete ${c.company_name}? Historical sales will never be destroyed.`))return;
    try{const r=await rpc("app_insurance_delete_company",{p_id:id});await reloadMasterAndView();notify(r?.message||"Insurance Company removed safely.");}catch(err){notify(err.message||"Could not remove company.","error");}
  }
  async function deletePolicy(id) {
    const p=S.policies.find(x=>x.id===id); if(!p)return;
    if(!global.confirm(`Delete ${p.policy_name}? Historical sales will never be destroyed.`))return;
    try{const r=await rpc("app_insurance_delete_policy",{p_id:id});await reloadMasterAndView();notify(r?.message||"Insurance Policy removed safely.");}catch(err){notify(err.message||"Could not remove policy.","error");}
  }

  function customerNumberOf(c) {
    const values=[c?.customer_number,c?.customerNumber,c?.customer_id,c?.customerId];
    return values.map(v=>String(v||"").trim()).find(v=>/^\d{6}$/.test(v))||"";
  }

  function mergeCustomerDirectory(serverItems, search = "") {
    const map = new Map();
    const registeredNames = new Set();
    const addRegistered = c => {
      const name=String(c?.name||"").trim(); if(!name || /^walk-?in/i.test(name))return;
      const number=customerNumberOf(c);
      const key=number?`number:${number}`:`name:${name.toLowerCase()}`;
      map.set(key,{...c,name,customer_number:number||c?.customer_number||""});
      if(number)registeredNames.add(name.toLowerCase());
    };
    (serverItems||S.customers||[]).forEach(addRegistered);
    try {
      if (typeof inventoryCustomerDirectory === "function") {
        inventoryCustomerDirectory({search,offset:0,limit:500}).items.forEach(c=>{
          const name=String(c?.name||"").trim(); if(!name || /^walk-?in/i.test(name))return;
          const nameKey=name.toLowerCase();
          if(registeredNames.has(nameKey))return;
          const key=`inventory:${nameKey}`;
          if(!map.has(key))map.set(key,{...c,name});
        });
      }
    } catch (_) {}
    return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name)||customerNumberOf(a).localeCompare(customerNumberOf(b)));
  }

  function duplicateCustomerPrompt(matches = []) {
    return new Promise(resolve => {
      let settled=false;
      const finish=(value,close)=>{if(settled)return;settled=true;close();resolve(value);};
      const options=matches.map((c,i)=>`<option value="${i}">${customerNumberOf(c)?`#${esc(customerNumberOf(c))} · `:""}${esc(c.name||"Customer")}${c.phone?` · ${esc(c.phone)}`:""}</option>`).join("");
      openModal({id:"insuranceDuplicateCustomerModal",title:"Customer Already Exists",subtitle:"Use the existing customer to avoid an accidental duplicate, or explicitly create a separate record.",body:`<div class="insurance-duplicate-box"><p>A customer with this name already exists.</p><label class="form-label">Existing customer<select class="select" id="insuranceDuplicateCustomerSelect">${options}</select></label></div>`,actions:`<button class="btn ghost" id="insuranceDuplicateCancel">Cancel</button><button class="btn ghost" id="insuranceUseExistingCustomer">Use Existing</button><button class="btn primary" id="insuranceCreateDuplicateCustomer">Create Duplicate</button>`,onOpen(modal,close){
        const select=$("#insuranceDuplicateCustomerSelect",modal);
        $("#insuranceDuplicateCancel",modal).onclick=()=>finish(null,close);
        $("#insuranceUseExistingCustomer",modal).onclick=()=>finish({choice:"existing",customer:matches[Number(select?.value||0)]||matches[0]},close);
        $("#insuranceCreateDuplicateCustomer",modal).onclick=()=>finish({choice:"duplicate"},close);
        $$('[data-insurance-close]',modal).forEach(el=>el.addEventListener("click",()=>{if(!settled){settled=true;resolve(null);}}, {once:true}));
      }});
    });
  }

  function openMakeSale() {
    if (!can("create")) return notify("Your account does not have permission to create Insurance sales.", "error");
    const activeCompanies=S.companies.filter(c=>c.is_active!==false), activePolicies=S.policies.filter(p=>p.is_active!==false);
    if(!activeCompanies.length)return notify("Add an active Insurance Company first.","error");
    if(!activePolicies.length)return notify("Add an active Insurance Policy first.","error");
    const firstCompany=activeCompanies[0].id, firstCurrency=currentCurrency();
    let customers=mergeCustomerDirectory(S.customers);
    const customerOptionHtml = list => `<option value="">Select customer</option>${list.map((c,i)=>`<option value="${i}">${customerNumberOf(c)?`#${esc(customerNumberOf(c))} · `:""}${esc(c.name)}</option>`).join("")}`;
    openModal({ id:"insuranceSaleModal", title:"Make Insurance Sale", subtitle:"Select the insurance provider and policy independently. Commission and profit are calculated automatically.", body:`<form id="insuranceSaleForm" class="insurance-form-grid insurance-sale-form">
      <label>Insurance Company<select class="select" name="company_id" id="insuranceSaleCompany" required><option value="">Select company</option>${companyOptions(firstCompany,true)}</select></label>
      <label>Insurance Policy<select class="select" name="policy_id" id="insuranceSalePolicy" required><option value="">Select policy</option>${policyOptions("",true)}</select></label>
      <label class="wide insurance-policy-number-field">Policy Number<input class="input" name="policy_number" maxlength="160" placeholder="Optional policy / certificate number"></label>
      <div class="wide insurance-referral-entry"><label id="insuranceReferralIdentityField">Referral<select class="select" name="referral_selector" id="insuranceReferralSelector"><option value="">No referral</option>${S.referrerDirectory.map(r=>`<option value="${esc(r.id)}">${esc(r.name)}</option>`).join("")}<option value="__new__">+ Add New Referral</option></select><div id="insuranceNewReferralField" class="insurance-referral-new-control hide"><input class="input" name="referral_name" maxlength="160" placeholder="New referral name"><button type="button" class="btn ghost insurance-referral-existing-btn" id="insuranceReferralChooseExisting">Existing</button></div></label><label class="insurance-check-line insurance-referral-toggle"><input type="checkbox" id="insuranceReferralCommissionToggle"><span>Give part of My Commission to referral</span></label><label id="insuranceReferralCommissionField" class="hide">Referral Commission<input class="input" name="referral_commission" type="number" inputmode="decimal" min="0" step="0.01" value="0"></label></div>
      <div class="wide"><label class="form-label">Customer</label><div class="insurance-customer-modes"><button class="insurance-customer-mode active" type="button" data-customer-mode="walkin">Walk-in Customer</button><button class="insurance-customer-mode" type="button" data-customer-mode="existing">Existing Customer</button><button class="insurance-customer-mode" type="button" data-customer-mode="new">New Customer</button></div><input type="hidden" name="customer_type" value="walkin"></div>
      <div id="insuranceExistingCustomerFields" class="wide hide"><label class="form-label">Existing Customer</label><input class="input" id="insuranceExistingCustomerSearch" type="search" autocomplete="off" placeholder="Search name, 6-digit customer number, phone, email or company"><select class="select" id="insuranceExistingCustomerSelect" name="existing_customer" style="margin-top:6px">${customerOptionHtml(customers)}</select><div class="help" id="insuranceExistingCustomerHelp">Search or select from existing Inventory and Insurance customers.</div></div>
      <div id="insuranceCustomerFields" class="wide hide"><div class="insurance-form-grid"><label>Customer Name<input class="input" name="customer_name"></label><label>Customer Number<input class="input" name="customer_id" readonly placeholder="Auto-generated 6 digits"></label><label>Phone<input class="input" name="customer_phone"></label><label>Email<input class="input" type="email" name="customer_email"></label><label>Company<input class="input" name="customer_company"></label><label>TRN<input class="input" name="customer_trn"></label><label class="wide">Address<input class="input" name="customer_address"></label></div></div>
      <div class="wide insurance-sale-meta"><label>Currency<select class="select" name="currency" id="insuranceSaleCurrency">${currencyOptions(firstCurrency)}</select></label><label>Date<input class="input" type="date" name="transaction_date" value="${dateToday()}" required></label><label>Time<input class="input" type="time" name="transaction_time" value="${timeNow()}" required></label></div>
      <div class="wide insurance-price-grid"><label>Gross Premium<input class="input insurance-price" type="number" inputmode="decimal" min="0" step="0.01" name="gross_premium" required placeholder="1500"></label><label>Purchase Price<input class="input insurance-price" type="number" inputmode="decimal" min="0" step="0.01" name="purchase_price" required placeholder="1400"></label><label>Sale Price<input class="input insurance-price" type="number" inputmode="decimal" min="0" step="0.01" name="sale_price" required placeholder="1450"></label></div>
      <div class="wide insurance-customer-payment-entry"><label class="insurance-check-line insurance-customer-payment-toggle"><input type="checkbox" id="insuranceNotFullyPaid"><span>Not fully paid</span></label><div id="insuranceAmountPaidField" class="insurance-customer-payment-fields hide"><label>Amount Paid<input class="input" name="amount_paid" type="number" inputmode="decimal" min="0" step="0.01" value="0"></label><div class="insurance-customer-payment-preview"><span>Outstanding after sale</span><strong id="insuranceCustomerOutstandingPreview">0</strong></div></div><small id="insuranceCustomerPaymentHelp">By default this sale is recorded as fully paid.</small></div>
      <div class="insurance-calc"><div class="insurance-calc-item"><span>Company Commission</span><strong id="insuranceCalcCompany">0</strong></div><div class="insurance-calc-item"><span>Customer Discount</span><strong id="insuranceCalcDiscount">0</strong></div><div class="insurance-calc-item"><span>Actual Commission / Profit</span><strong id="insuranceCalcProfit">0</strong></div></div><div id="insuranceCalcWarning" class="insurance-warning hide"></div>
      <label class="wide">Additional Details / Notes<textarea class="input" name="notes" rows="2"></textarea></label></form>`, actions:`<button class="btn ghost" data-insurance-close>Cancel</button><button class="btn primary" id="insuranceSaleSave"><i class="fa-solid fa-check"></i> Complete Sale</button>`, onOpen(modal,close){
        const form=$("#insuranceSaleForm",modal), cur=$("#insuranceSaleCurrency",modal);
        if(typeof syncCurrencySelectFonts==="function")syncCurrencySelectFonts(cur);
        const paymentToggle=$("#insuranceNotFullyPaid",modal),paymentField=$("#insuranceAmountPaidField",modal),paymentAmount=form.elements.amount_paid,paymentPreview=$("#insuranceCustomerOutstandingPreview",modal),paymentHelp=$("#insuranceCustomerPaymentHelp",modal);
        const syncCustomerPayment=()=>{const enabled=!!paymentToggle?.checked,salePrice=Math.max(0,n(form.elements.sale_price.value)),paid=Math.max(0,n(paymentAmount?.value)),currency=form.elements.currency.value||firstCurrency,mode=String(form.elements.customer_type.value||"walkin");paymentField?.classList.toggle("hide",!enabled);if(paymentAmount){paymentAmount.disabled=!enabled;paymentAmount.max=String(salePrice);if(!enabled)paymentAmount.value="0";}if(paymentPreview)paymentPreview.innerHTML=moneyHtml(enabled?Math.max(salePrice-paid,0):0,currency);if(paymentHelp)paymentHelp.textContent=enabled?(mode==="walkin"?"Choose an existing or new customer so this outstanding balance can be tracked.":"Enter how much the customer paid now. The remaining balance will stay in Customers/Balances."):"By default this sale is recorded as fully paid.";};
        paymentToggle?.addEventListener("change",syncCustomerPayment);paymentAmount?.addEventListener("input",syncCustomerPayment);
        const referralSelector=$("#insuranceReferralSelector",modal),newReferralField=$("#insuranceNewReferralField",modal),newReferralInput=form.elements.referral_name,chooseExisting=$("#insuranceReferralChooseExisting",modal),referralToggle=$("#insuranceReferralCommissionToggle",modal),referralField=$("#insuranceReferralCommissionField",modal),referralAmount=form.elements.referral_commission;
        const selectedReferralName=()=>{const value=referralSelector?.value||"";if(value==="__new__")return String(newReferralInput?.value||"").trim();return S.referrerDirectory.find(r=>r.id===value)?.name||"";};
        const syncReferralSelection=()=>{const isNew=referralSelector?.value==="__new__",hasReferral=!!referralSelector?.value;referralSelector?.classList.toggle("hide",isNew);newReferralField?.classList.toggle("hide",!isNew);if(newReferralInput)newReferralInput.required=isNew;referralToggle.disabled=!hasReferral;if(!hasReferral){referralToggle.checked=false;}syncReferralCommission();};
        const syncReferralCommission=()=>{const enabled=!!referralToggle?.checked&&!referralToggle.disabled;referralField?.classList.toggle("hide",!enabled);if(referralAmount){referralAmount.disabled=!enabled;if(!enabled)referralAmount.value="0";}};referralSelector?.addEventListener("change",()=>{syncReferralSelection();if(referralSelector.value==="__new__")requestAnimationFrame(()=>newReferralInput?.focus());});chooseExisting?.addEventListener("click",()=>{referralSelector.value="";if(newReferralInput)newReferralInput.value="";syncReferralSelection();referralSelector.classList.remove("hide");referralSelector.focus();});referralToggle?.addEventListener("change",syncReferralCommission);syncReferralSelection();
        const modeButtons=$$('[data-customer-mode]',modal), existingWrap=$("#insuranceExistingCustomerFields",modal), fieldsWrap=$("#insuranceCustomerFields",modal);
        const editableCustomerInputs=["customer_name","customer_phone","customer_email","customer_company","customer_trn","customer_address"].map(name=>form.elements[name]).filter(Boolean);
        const fillCustomer=c=>{form.elements.customer_name.value=c?.name||"";form.elements.customer_id.value=customerNumberOf(c);form.elements.customer_phone.value=c?.phone||"";form.elements.customer_email.value=c?.email||"";form.elements.customer_company.value=c?.company||"";form.elements.customer_trn.value=c?.trn||"";form.elements.customer_address.value=c?.address||"";};
        const clearCustomer=()=>fillCustomer({});
        const setMode=mode=>{form.elements.customer_type.value=mode;modeButtons.forEach(b=>b.classList.toggle("active",b.dataset.customerMode===mode));existingWrap.classList.toggle("hide",mode!=="existing");fieldsWrap.classList.toggle("hide",mode==="walkin");editableCustomerInputs.forEach(input=>{input.readOnly=mode==="existing";});form.elements.customer_id.readOnly=true;if(mode==="existing"&&form.elements.existing_customer.value!==""){const c=customers[Number(form.elements.existing_customer.value)];if(c)fillCustomer(c);}if(mode==="new"||mode==="walkin")clearCustomer();syncCustomerPayment();};
        modeButtons.forEach(b=>b.onclick=()=>setMode(b.dataset.customerMode));
        const customerSelect=$("#insuranceExistingCustomerSelect",modal),customerSearch=$("#insuranceExistingCustomerSearch",modal),customerHelp=$("#insuranceExistingCustomerHelp",modal);
        customerSelect.onchange=()=>{const raw=customerSelect.value;if(raw==="")return clearCustomer();const c=customers[Number(raw)];if(c)fillCustomer(c);};
        let customerSearchTimer=null;
        customerSearch.addEventListener("input",()=>{clearTimeout(customerSearchTimer);customerSearchTimer=setTimeout(async()=>{const query=customerSearch.value.trim();if(customerHelp)customerHelp.textContent="Searching customers…";try{const response=await rpc("app_insurance_list_customers",{p_search:query||null,p_limit:100});customers=mergeCustomerDirectory(response?.items||[],query);customerSelect.innerHTML=customerOptionHtml(customers);clearCustomer();if(customerHelp)customerHelp.textContent=customers.length?`${customers.length} matching customer${customers.length===1?"":"s"}. Select one below.`:"No matching customers found.";}catch(err){if(customerHelp)customerHelp.textContent=err.message||"Could not search customers.";}},220);});
        const calc=()=>{const gp=form.elements.gross_premium.value,pp=form.elements.purchase_price.value,sp=form.elements.sale_price.value,currency=form.elements.currency.value||firstCurrency;const warning=$("#insuranceCalcWarning",modal); if([gp,pp,sp].some(v=>v==="")){warning.classList.add("hide");return;} try{const r=global.TripleMInsuranceMath.calculateInsuranceFinancials(gp,pp,sp);$("#insuranceCalcCompany",modal).innerHTML=moneyHtml(r.companyCommission,currency);$("#insuranceCalcDiscount",modal).innerHTML=moneyHtml(r.customerDiscount,currency);const profit=$("#insuranceCalcProfit",modal);profit.innerHTML=moneyHtml(r.actualProfit,currency);profit.classList.toggle("insurance-amount-loss",r.isLoss);const msgs=[];if(r.purchasePrice>r.grossPremium)msgs.push("Purchase Price is above Gross Premium, so the original company commission is negative.");if(r.salePrice>r.grossPremium)msgs.push("Sale Price is above Gross Premium, so Customer Discount is negative and represents a markup.");if(r.isLoss)msgs.push(`This transaction creates a loss of ${moneyPlain(r.lossAmount,currency)}.`);warning.textContent=msgs.join(" ");warning.classList.toggle("hide",!msgs.length);warning.classList.toggle("loss",r.isLoss);}catch(err){warning.textContent=err.message;warning.classList.remove("hide");warning.classList.add("loss");}};
        $$('.insurance-price',modal).forEach(i=>i.addEventListener("input",()=>{calc();syncCustomerPayment();}));cur.addEventListener("change",()=>{calc();syncCustomerPayment();});syncCustomerPayment();
        $("#insuranceSaleSave",modal).onclick=async e=>{
          if(!form.reportValidity())return;
          const fd=new FormData(form);let mode=String(fd.get("customer_type")||"walkin");
          if(mode!=="walkin"&&!String(fd.get("customer_name")||"").trim())return notify("Customer name is required.","error");
          let math;try{math=global.TripleMInsuranceMath.calculateInsuranceFinancials(fd.get("gross_premium"),fd.get("purchase_price"),fd.get("sale_price"));}catch(err){return notify(err.message,"error");}
          const notFullyPaid=!!paymentToggle?.checked,amountPaid=notFullyPaid?n(fd.get("amount_paid")):math.salePrice;
          if(notFullyPaid&&mode==="walkin")return notify("Select an existing or new customer before recording an outstanding balance.","error");
          if(notFullyPaid&&math.salePrice<=0)return notify("A zero-value sale cannot have an outstanding balance.","error");
          if(notFullyPaid&&(amountPaid<0||amountPaid>=math.salePrice))return notify("Amount Paid must be zero or more, and less than the Sale Price. If fully paid, leave Not fully paid unticked.","error");
          const referralName=selectedReferralName(),referralEnabled=!!referralToggle?.checked,referralCommission=referralEnabled?n(fd.get("referral_commission")):0;
          if(referralEnabled&&!referralName)return notify("Enter the referral name before assigning referral commission.","error");
          if(referralEnabled&&referralCommission<=0)return notify("Referral commission must be greater than zero.","error");
          if(referralCommission>Math.max(math.actualProfit,0))return notify("Referral commission cannot exceed My Commission for this sale.","error");
          let selectedCustomer=null,allowDuplicate=false;
          if(mode==="existing"){const raw=form.elements.existing_customer.value;selectedCustomer=raw===""?null:customers[Number(raw)];if(!selectedCustomer)return notify("Select an existing customer.","error");}
          if(mode==="new"){
            try{
              const duplicate=await rpc("app_insurance_check_customer_duplicate",{p_name:String(fd.get("customer_name")||"").trim()});
              if(duplicate?.exists&&Array.isArray(duplicate.items)&&duplicate.items.length){
                const choice=await duplicateCustomerPrompt(duplicate.items);
                if(!choice)return;
                if(choice.choice==="existing"){mode="existing";selectedCustomer=choice.customer;}
                else allowDuplicate=true;
              }
            }catch(err){return notify(err.message||"Could not verify customer name.","error");}
          }
          const customer={
            id:selectedCustomer?customerNumberOf(selectedCustomer):String(fd.get("customer_id")||"").trim(),
            name:selectedCustomer?.name||String(fd.get("customer_name")||"").trim(),
            phone:selectedCustomer?.phone||String(fd.get("customer_phone")||"").trim(),
            email:selectedCustomer?.email||String(fd.get("customer_email")||"").trim(),
            company:selectedCustomer?.company||String(fd.get("customer_company")||"").trim(),
            trn:selectedCustomer?.trn||String(fd.get("customer_trn")||"").trim(),
            address:selectedCustomer?.address||String(fd.get("customer_address")||"").trim()
          };
          setBusy(e.currentTarget,true,"Saving");
          try{
            const res=await rpc("app_insurance_create_sale_with_referral",{p_company_id:fd.get("company_id"),p_policy_id:fd.get("policy_id"),p_customer_type:mode,p_customer_id:customer.id||null,p_customer_name:mode==="walkin"?null:customer.name,p_customer_phone:mode==="walkin"?null:customer.phone||null,p_customer_email:mode==="walkin"?null:customer.email||null,p_customer_company:mode==="walkin"?null:customer.company||null,p_customer_trn:mode==="walkin"?null:customer.trn||null,p_customer_address:mode==="walkin"?null:customer.address||null,p_currency:fd.get("currency"),p_gross_premium:math.grossPremium,p_purchase_price:math.purchasePrice,p_sale_price:math.salePrice,p_transaction_date:fd.get("transaction_date"),p_transaction_time:fd.get("transaction_time"),p_notes:fd.get("notes")||null,p_allow_duplicate_customer:allowDuplicate,p_policy_number:String(fd.get("policy_number")||"").trim()||null,p_referral_name:referralName||null,p_referral_commission:referralCommission,p_not_fully_paid:notFullyPaid,p_amount_paid:amountPaid});
            close();await reloadMasterAndView("sales");notify(math.isLoss?`Insurance sale saved with a loss of ${moneyPlain(math.lossAmount,fd.get("currency"))}.`:"Insurance sale completed.",math.isLoss?"error":"success");if(res?.item)openSaleDetails(res.item.id);
          }catch(err){notify(err.message||"Could not complete Insurance sale.","error");}
          finally{setBusy(e.currentTarget,false);}
        };
    }});
  }

  function policyUsedDays(startDate,endDate){
    if(!startDate||!endDate)return 0;
    const a=new Date(`${startDate}T00:00:00`),b=new Date(`${endDate}T00:00:00`);
    if(Number.isNaN(a.getTime())||Number.isNaN(b.getTime()))return 0;
    return Math.max(0,Math.round((b-a)/86400000));
  }

  function openPolicyCancellation(sale) {
    if(!can("edit"))return notify("Policy cancellation is not permitted for this account.","error");
    if(!sale)return;
    if(sale.cancellation_id)return openCancellationDetails(sale.id);
    openModal({id:"insuranceCancellationModal",title:"Cancel Insurance Policy",subtitle:`${sale.reference_no} · ${sale.policy_name_snapshot}`,body:`<form id="insuranceCancellationForm" class="insurance-form-grid insurance-cancellation-form">
      <div class="wide insurance-cancellation-summary"><span><b>Policy</b>${esc(sale.policy_name_snapshot)}</span><span><b>Policy No.</b>${sale.policy_number?esc(sale.policy_number):"—"}</span><span><b>Insurance Company</b>${esc(sale.company_name_snapshot)}</span></div>
      <label>Cancellation Date<input class="input" name="cancellation_date" type="date" min="${esc(sale.transaction_date)}" value="${dateToday()}" required></label>
      <label>Cancellation Time<input class="input" name="cancellation_time" type="time" value="${timeNow()}" required></label>
      <label>Policy Used<input class="input" id="insuranceCancellationDuration" value="${esc(formatPolicyDuration(policyUsedDays(sale.transaction_date,dateToday())))}" readonly></label>
      <label>Commission Deduction<input class="input" name="commission_deduction" type="number" min="0" step="0.01" value="0" inputmode="decimal"></label>
      <label class="wide">Cancellation Reason<input class="input" name="reason" maxlength="240" placeholder="Optional reason"></label>
      <label class="wide">Notes<textarea class="input" name="notes" rows="2" placeholder="Optional"></textarea></label>
      <label class="wide insurance-check-line"><input type="checkbox" name="add_to_commission" checked><span>Add the cancellation commission deduction to the existing My Commission record for this sale. Any amount that cannot be applied to this sale remains available for a later settlement from the same Insurance Company.</span></label>
    </form>`,actions:`<button class="btn ghost" data-insurance-close>Cancel</button><button class="btn danger" id="insuranceCancellationSave">Confirm Cancellation</button>`,onOpen(modal,close){
      const form=$("#insuranceCancellationForm",modal),dateInput=form.elements.cancellation_date,duration=$("#insuranceCancellationDuration",modal);
      const updateDuration=()=>{duration.value=formatPolicyDuration(policyUsedDays(sale.transaction_date,dateInput.value));};dateInput.addEventListener("change",updateDuration);updateDuration();
      $("#insuranceCancellationSave",modal).onclick=async e=>{if(!form.reportValidity())return;const fd=new FormData(form),deduction=n(fd.get("commission_deduction"));if(fd.get("cancellation_date")<sale.transaction_date)return notify("Cancellation date cannot be before the Insurance sale date.","error");if(deduction<0)return notify("Commission deduction cannot be negative.","error");setBusy(e.currentTarget,true,"Saving");try{const res=await rpc("app_insurance_cancel_sale",{p_sale_id:sale.id,p_cancellation_date:fd.get("cancellation_date"),p_cancellation_time:fd.get("cancellation_time"),p_commission_deduction:deduction,p_reason:fd.get("reason")||null,p_notes:fd.get("notes")||null,p_add_to_commission:fd.get("add_to_commission")==="on"});close();await reloadMasterAndView(S.view==="reports"?"reports":"sales");notify(`Policy cancellation ${res?.item?.reference_no||"saved"} recorded.`);}catch(err){notify(err.message||"Could not cancel Insurance policy.","error");}finally{setBusy(e.currentTarget,false);}};
    }});
  }

  async function openCancellationDetails(saleId) {
    try{
      const res=await rpc("app_insurance_get_cancellation",{p_sale_id:saleId}),c=res?.item;if(!c)return;
      openModal({id:"insuranceCancellationDetailsModal",title:"Policy Cancellation",subtitle:c.reference_no,body:`<div class="insurance-detail-grid">
        <div class="insurance-detail"><span>Insurance Company</span><strong>${esc(c.company_name_snapshot)}</strong></div><div class="insurance-detail"><span>Policy</span><strong>${esc(c.policy_name_snapshot)}</strong></div>
        <div class="insurance-detail"><span>Policy Number</span><strong>${c.policy_number_snapshot?esc(c.policy_number_snapshot):"—"}</strong></div><div class="insurance-detail"><span>Policy Started</span><strong>${fmtDate(c.policy_start_date)}</strong></div>
        <div class="insurance-detail"><span>Cancelled</span><strong>${fmtDate(c.cancellation_date)} ${fmtTime(c.cancellation_time)}</strong></div><div class="insurance-detail"><span>Policy Used</span><strong>${formatPolicyDuration(c.policy_used_days)}</strong></div>
        <div class="insurance-detail"><span>Commission Deduction</span><strong>${moneyHtml(c.commission_deduction,currencyForCancellation(c))}</strong></div><div class="insurance-detail"><span>My Commission Entry</span><strong>${c.post_deduction_to_commission?"Added":"Not added"}</strong></div>
        ${c.reason?`<div class="insurance-detail insurance-detail-wide"><span>Reason</span><strong>${esc(c.reason)}</strong></div>`:""}${c.notes?`<div class="insurance-detail insurance-detail-wide"><span>Notes</span><strong>${esc(c.notes)}</strong></div>`:""}
        ${c.deduction_reference_no?`<div class="insurance-detail insurance-detail-wide"><span>Deduction Reference</span><strong>${esc(c.deduction_reference_no)}</strong></div>`:""}
      </div>`,actions:`<button class="btn primary" data-insurance-close>Done</button>`});
    }catch(err){notify(err.message||"Could not open policy cancellation.","error");}
  }

  function currencyForCancellation(c){
    const sale=S.sales.find(s=>s.id===c.sale_id);return c?.currency||sale?.currency||currentCurrency();
  }

  async function deleteSaleRecord(id) {
    const sale=S.sales.find(x=>x.id===id);
    if(!sale)return;
    if(!global.confirm(`Delete Insurance Sale ${sale.reference_no}? The record will be soft-deleted and historical customer data will remain safe.`))return;
    try{
      await rpc("app_insurance_delete_sale",{p_id:id});
      await reloadMasterAndView(S.view==="reports"?"reports":"sales");
      notify("Insurance Sale deleted.");
    }catch(err){notify(err.message||"Could not delete sale.","error");}
  }

  function customerPaymentHistoryHtml(s) {
    const payments=Array.isArray(s?.customer_payments)?s.customer_payments:[];
    if(!payments.length)return `<div class="insurance-customer-payment-history-empty">No customer payment entries.</div>`;
    return `<div class="insurance-customer-payment-history"><div class="insurance-customer-payment-history-head"><div>Payment</div><div>Date</div><div>Amount</div></div>${payments.map(p=>`<div class="insurance-customer-payment-history-row"><div><strong>${esc(p.reference_no||"Payment")}</strong><small>${p.payment_kind==="initial"?"At sale":p.payment_kind==="historical"?"Existing settled sale":"Received later"}${p.notes?` · ${esc(p.notes)}`:""}</small></div><span>${fmtDate(p.payment_date)} ${fmtTime(p.payment_time)}</span><b>${moneyHtml(p.amount_paid,s.currency)}</b></div>`).join("")}</div>`;
  }

  async function openCustomerPayment(sale) {
    if(!can("create"))return notify("Your account does not have permission to receive Insurance payments.","error");
    const outstanding=n(sale?.customer_outstanding);
    if(!sale?.id||!sale?.customer_number||outstanding<=0)return notify("This Insurance Sale has no outstanding customer balance.","error");
    openModal({id:"insuranceCustomerPaymentModal",title:"Receive Customer Payment",subtitle:`${sale.customer_name} · ${sale.reference_no}`,body:`<form id="insuranceCustomerPaymentForm" class="insurance-form-grid insurance-customer-payment-form"><div class="wide insurance-customer-payment-balance"><span>Outstanding Balance</span><strong>${moneyHtml(outstanding,sale.currency)}</strong></div><label>Amount Received<input class="input" name="amount_paid" type="number" inputmode="decimal" min="0.01" max="${esc(outstanding)}" step="0.01" value="${esc(outstanding)}" required></label><label>Date<input class="input" name="payment_date" type="date" value="${dateToday()}" required></label><label>Time<input class="input" name="payment_time" type="time" value="${timeNow()}" required></label><label class="wide">Payment Details / Notes<textarea class="input" name="notes" rows="2" placeholder="Optional reference or payment note"></textarea></label></form>`,actions:`<button class="btn ghost" data-insurance-close>Cancel</button><button class="btn primary" id="insuranceCustomerPaymentSave"><i class="fa-solid fa-hand-holding-dollar"></i> Receive Payment</button>`,onOpen(modal,close){
      const form=$("#insuranceCustomerPaymentForm",modal);
      $("#insuranceCustomerPaymentSave",modal).onclick=async e=>{if(!form.reportValidity())return;const fd=new FormData(form),amount=n(fd.get("amount_paid"));if(amount<=0)return notify("Payment amount must be greater than zero.","error");if(amount>outstanding)return notify("Payment amount cannot exceed the outstanding balance.","error");setBusy(e.currentTarget,true,"Saving");try{await rpc("app_insurance_record_customer_payment",{p_sale_id:sale.id,p_amount_paid:amount,p_payment_date:fd.get("payment_date"),p_payment_time:fd.get("payment_time"),p_notes:String(fd.get("notes")||"").trim()||null});close();notify("Customer payment recorded.");if(S.view==="customers"){await loadCustomerBalances({reset:false});renderCustomerBalances();await openCustomerBalance(sale.customer_number);}else if(S.view==="sales"){await loadSales({reset:false});renderSales();await openSaleDetails(sale.id);}else if(S.view==="reports"){await loadSales({reset:false,report:true});renderReports();await openSaleDetails(sale.id);}else{await openSaleDetails(sale.id);}}catch(err){notify(err.message||"Could not record customer payment.","error");}finally{setBusy(e.currentTarget,false);}};
    }});
  }

  async function openSaleDetails(id) {
    try {
      const res=await rpc("app_insurance_get_sale",{p_id:id}), s=res?.item; if(!s)return;
      const profit=n(s.actual_profit), isLoss=profit<0, outstanding=n(s.customer_outstanding), paid=n(s.customer_amount_paid);
      openModal({ id:"insuranceDetailsModal",title:"Insurance Transaction",subtitle:s.reference_no,body:`<div class="insurance-detail-grid">
        <div class="insurance-detail"><span>Insurance Company</span><strong>${esc(s.company_name_snapshot)}</strong></div><div class="insurance-detail"><span>Insurance Policy</span><strong>${esc(s.policy_name_snapshot)}</strong></div>
        <div class="insurance-detail"><span>Policy Number</span><strong>${s.policy_number?esc(s.policy_number):"—"}</strong></div><div class="insurance-detail"><span>Policy Status</span><strong>${s.cancellation_id?`<span class="insurance-cancelled-badge">Cancelled</span>`:"Active / Sold"}</strong></div>
        <div class="insurance-detail"><span>Customer</span><strong>${esc(s.customer_name||"Walk-in Customer")}</strong></div><div class="insurance-detail"><span>Customer Number</span><strong>${s.customer_number?`#${esc(s.customer_number)}`:"—"}</strong></div>
        <div class="insurance-detail"><span>Date</span><strong>${fmtDate(s.transaction_date)}</strong></div><div class="insurance-detail"><span>Time</span><strong>${fmtTime(s.transaction_time)}</strong></div>
        <div class="insurance-detail"><span>Gross Premium</span><strong>${moneyHtml(s.gross_premium,s.currency)}</strong></div><div class="insurance-detail"><span>Purchase Price</span><strong>${moneyHtml(s.purchase_price,s.currency)}</strong></div>
        <div class="insurance-detail"><span>Sale Price</span><strong>${moneyHtml(s.sale_price,s.currency)}</strong></div><div class="insurance-detail"><span>Original Company Commission</span><strong>${moneyHtml(s.company_commission,s.currency)}</strong></div>
        <div class="insurance-detail"><span>Customer Discount</span><strong>${moneyHtml(s.customer_discount,s.currency)}</strong></div><div class="insurance-detail"><span>${isLoss?"Actual Loss":"Actual Commission / Profit"}</span><strong class="${isLoss?"insurance-amount-loss":""}">${moneyHtml(s.actual_profit,s.currency)}</strong></div>
        <div class="insurance-detail"><span>Payment Status</span><strong>${customerPaymentStatusBadge(s)}</strong></div><div class="insurance-detail"><span>Amount Paid</span><strong>${moneyHtml(paid,s.currency)}</strong></div>
        <div class="insurance-detail"><span>Outstanding Balance</span><strong class="${outstanding>0?"insurance-amount-outstanding":""}">${moneyHtml(outstanding,s.currency)}</strong></div><div class="insurance-detail"><span>Payments</span><strong>${Array.isArray(s.customer_payments)?s.customer_payments.length:0}</strong></div>
        ${s.referral_name?`<div class="insurance-detail"><span>Referral</span><strong>${esc(s.referral_name)}</strong></div><div class="insurance-detail"><span>Referral Commission</span><strong>${moneyHtml(s.referral_commission||0,s.currency)}</strong></div>`:""}
        ${s.cancellation_id?`<div class="insurance-detail"><span>Cancellation Date</span><strong>${fmtDate(s.cancellation_date)} ${fmtTime(s.cancellation_time)}</strong></div><div class="insurance-detail"><span>Policy Used</span><strong>${formatPolicyDuration(s.policy_used_days)}</strong></div><div class="insurance-detail"><span>Cancellation Commission Deduction</span><strong>${moneyHtml(s.cancellation_commission_deduction||0,s.currency)}</strong></div><div class="insurance-detail"><span>Added to My Commission</span><strong>${s.post_deduction_to_commission?"Yes":"No"}</strong></div>${s.cancellation_reason?`<div class="insurance-detail insurance-detail-wide"><span>Cancellation Reason</span><strong>${esc(s.cancellation_reason)}</strong></div>`:""}`:""}
        ${s.notes?`<div class="insurance-detail insurance-detail-wide"><span>Notes</span><strong>${esc(s.notes)}</strong></div>`:""}
        <div class="insurance-detail insurance-detail-wide insurance-customer-payment-detail"><span>Customer Payment History</span>${customerPaymentHistoryHtml(s)}</div>
        <div class="insurance-detail insurance-detail-wide"><span>Calculation</span><strong>Company Commission = Gross Premium − Purchase Price. Customer Discount = Gross Premium − Sale Price. Actual Profit = Sale Price − Purchase Price.${isLoss?` This sale records a loss of ${moneyPlain(Math.abs(profit),s.currency)}.`:""}</strong></div></div>`,actions:`<button class="btn ghost" data-insurance-close>Done</button>${outstanding>0&&s.customer_number&&can("create")?`<button class="btn primary" id="insuranceReceiveCustomerPayment"><i class="fa-solid fa-hand-holding-dollar"></i> Receive Payment</button>`:""}`,onOpen(modal){$("#insuranceReceiveCustomerPayment",modal)?.addEventListener("click",()=>openCustomerPayment(s));}});
    } catch(err){notify(err.message||"Could not open Insurance transaction.","error");}
  }

  function documentCompanyProfile() {
    const cfg=typeof fullConfigData==="object"&&fullConfigData?fullConfigData:{};
    return {name:cfg.Company||state?.sessionUser?.company_name||state?.sessionUser?.display_name||"Triplem VIP",trn:cfg.TRN||state?.sessionUser?.vat_number||"",email:cfg.email||cfg.Email||state?.sessionUser?.company_email||"",phone:cfg.Mobile||cfg.Phone||state?.sessionUser?.company_phone||"",address:cfg.Address||state?.sessionUser?.company_address||""};
  }

  function buildDocumentData(s,type="invoice") {
    const discount=n(s.customer_discount),provider=S.companies.find(c=>c.id===s.company_id),policy=S.policies.find(p=>p.id===s.policy_id);
    const salePrice=n(s.sale_price),amountPaid=s.customer_amount_paid==null?salePrice:n(s.customer_amount_paid),outstanding=s.customer_outstanding==null?Math.max(salePrice-amountPaid,0):n(s.customer_outstanding);
    return { type, title:type==="receipt"?"Receipt":"Invoice", reference:s.reference_no, date:s.transaction_date, transaction_time:s.transaction_time||"", company_id:s.company_id||null,policy_id:s.policy_id||null,customer_name:s.customer_name||"Walk-in Customer",customer_number:s.customer_number||"",customer_phone:s.customer_phone||"",customer_email:s.customer_email||"",customer_company:s.customer_company||"",customer_trn:s.customer_trn||"",customer_address:s.customer_address||"",insurance_company:s.company_name_snapshot||provider?.company_name||"",insurance_contact_name:provider?.contact_name||"",insurance_phone:provider?.phone||"",insurance_email:provider?.email||"",insurance_address:provider?.address||"",policy_name:s.policy_name_snapshot||policy?.policy_name||"",policy_number:s.policy_number||"",policy_description:policy?.description||"",policy_notes:policy?.notes||"",currency:s.currency,gross_premium:n(s.gross_premium),customer_discount:discount,sale_price:salePrice,amount_paid:amountPaid,outstanding,payment_status:s.customer_payment_status||((outstanding<=0)?"paid":amountPaid>0?"partial":"unpaid"),notes:s.notes||"",cancellation_id:s.cancellation_id||null,cancellation_date:s.cancellation_date||null,cancellation_time:s.cancellation_time||null,policy_used_days:n(s.policy_used_days),cancellation_commission_deduction:n(s.cancellation_commission_deduction),cancellation_reason:s.cancellation_reason||"" };
  }

  function documentHtml(d) {
    const company=documentCompanyProfile(),provider=insuranceProviderProfile(d),policy=insurancePolicyProfile(d);
    const paid=d.amount_paid==null?n(d.sale_price):n(d.amount_paid),outstanding=d.outstanding==null?Math.max(n(d.sale_price)-paid,0):n(d.outstanding);
    const discountLine=n(d.customer_discount)>0?`<div><span>Customer Discount</span><strong>− ${moneyHtml(d.customer_discount,d.currency)}</strong></div>`:"";
    const companyLines=[company.trn?`TRN ${esc(company.trn)}`:"",[company.email,company.phone].filter(Boolean).map(esc).join(" · "),company.address?esc(company.address):""].filter(Boolean);
    const customerLines=[d.customer_number?`Customer No. #${esc(d.customer_number)}`:"",[d.customer_company,d.customer_trn?`TRN ${d.customer_trn}`:""].filter(Boolean).map(esc).join(" · "),[d.customer_phone,d.customer_email].filter(Boolean).map(esc).join(" · "),d.customer_address?esc(d.customer_address):""].filter(Boolean);
    const providerLines=[provider.contact,[provider.phone,provider.email].filter(Boolean).join(" · "),provider.address].filter(Boolean).map(esc);
    return `<div class="insurance-document"><div class="insurance-document-head"><div><h2>${esc(d.title||"Invoice")}</h2><p class="doc-muted">${esc(d.reference||d.invoice_number||"")}</p></div><div class="insurance-document-date"><span>${d.title==="Receipt"?"Receipt Date":"Invoice Date"}</span><strong>${fmtDate(d.date||d.invoice_date)}</strong></div></div>
      <div class="insurance-document-party-row insurance-document-party-row-three"><div class="insurance-document-party"><span>Issuer</span><strong>${esc(company.name)}</strong>${companyLines.map(line=>`<p>${line}</p>`).join("")}</div><div class="insurance-document-party"><span>Customer</span><strong>${esc(d.customer_name||"Walk-in Customer")}</strong>${customerLines.map(line=>`<p>${line}</p>`).join("")}</div><div class="insurance-document-party"><span>Insurance Company</span><strong>${esc(provider.name)}</strong>${providerLines.map(line=>`<p>${line}</p>`).join("")}</div></div>
      <div class="insurance-document-context"><div><span>Policy</span><strong>${esc(policy.name)}</strong></div><div><span>Policy Number</span><strong>${policy.number?esc(policy.number):"—"}</strong></div><div><span>Policy Date</span><strong>${fmtDate(d.date||d.invoice_date)}${d.transaction_time?` · ${fmtTime(d.transaction_time)}`:""}</strong></div></div>
      ${policy.description||policy.notes?`<div class="insurance-document-policy-notes">${esc([policy.description,policy.notes].filter(Boolean).join(" · "))}</div>`:""}
      ${d.cancellation_id?`<div class="insurance-document-cancellation"><strong>Policy Cancelled</strong><span>${fmtDate(d.cancellation_date)} · ${formatPolicyDuration(d.policy_used_days)} used${d.cancellation_reason?` · ${esc(d.cancellation_reason)}`:""}</span></div>`:""}
      <table class="insurance-document-table"><thead><tr><th>Description</th><th>Amount</th></tr></thead><tbody><tr><td>${esc(policy.name)}</td><td>${moneyHtml(d.gross_premium||d.sale_price,d.currency)}</td></tr></tbody></table><div class="insurance-document-total">${n(d.gross_premium)>0?`<div><span>Gross Premium</span><strong>${moneyHtml(d.gross_premium,d.currency)}</strong></div>`:""}${discountLine}<div><span>Sale Amount</span><strong>${moneyHtml(d.sale_price,d.currency)}</strong></div><div class="grand"><span>${d.title==="Receipt"?"Amount Received":"Amount Paid"}</span><strong>${moneyHtml(paid,d.currency)}</strong></div><div><span>Balance Due</span><strong>${moneyHtml(outstanding,d.currency)}</strong></div></div>${d.notes?`<p class="doc-muted insurance-document-note">${esc(d.notes)}</p>`:""}</div>`;
  }

  function openCustomerDocument(s,type) {
    const d=buildDocumentData(s,type);
    openModal({id:"insuranceDocumentModal",title:d.title,subtitle:type==="receipt"?"Customer receipt":"Customer invoice",body:documentHtml(d),wide:true,actions:`<button class="btn ghost" data-insurance-close>Done</button><button class="btn primary" id="insuranceDocumentPdf"><i class="fa-solid fa-file-pdf"></i> PDF</button>`,onOpen(modal){$("#insuranceDocumentPdf",modal).onclick=()=>downloadCustomerDocumentPdf(d);}});
  }

  async function downloadCustomerDocumentPdf(d) {
    if(!global.jspdf?.jsPDF)return notify("PDF library is still loading. Try again in a moment.","error");
    try{
      const {jsPDF}=global.jspdf,doc=createInsuranceA5Pdf(jsPDF);
      if(typeof loadCustomFontsForPdf==="function")await loadCustomFontsForPdf(doc);
      const logo=typeof getPdfLogo==="function"?await getPdfLogo():null,company=documentCompanyProfile(),provider=insuranceProviderProfile(d),policy=insurancePolicyProfile(d);
      const pageW=doc.internal.pageSize.getWidth(),left=8,right=8,gap=4,cardW=(pageW-left-right-gap*2)/3,title=d.title||"Invoice",reference=d.reference||d.invoice_number||"",docDate=d.date||d.invoice_date;
      drawInsurancePdfFrame(doc,logo,title,reference,docDate,1);
      const issuerLines=[company.trn?`TRN ${company.trn}`:"",[company.email,company.phone].filter(Boolean).join(" · "),company.address].filter(Boolean);
      const customerLines=[d.customer_number?`Customer No. #${d.customer_number}`:"",[d.customer_company,d.customer_trn?`TRN ${d.customer_trn}`:""].filter(Boolean).join(" · "),[d.customer_phone,d.customer_email].filter(Boolean).join(" · "),d.customer_address].filter(Boolean);
      const providerLines=[provider.contact,[provider.phone,provider.email].filter(Boolean).join(" · "),provider.address].filter(Boolean);
      drawInsurancePdfCard(doc,{x:left,y:26,w:cardW,h:29,label:"ISSUER",title:company.name,lines:issuerLines});
      drawInsurancePdfCard(doc,{x:left+cardW+gap,y:26,w:cardW,h:29,label:"CUSTOMER",title:d.customer_name||"Walk-in Customer",lines:customerLines});
      drawInsurancePdfCard(doc,{x:left+(cardW+gap)*2,y:26,w:cardW,h:29,label:"INSURANCE COMPANY",title:provider.name,lines:providerLines});
      const policyY=59,policyW=pageW-left-right;
      doc.setDrawColor(221,226,232);doc.setFillColor(255,255,255);doc.roundedRect(left,policyY,policyW,22,1.6,1.6,"FD");
      const policyCols=[
        {label:"POLICY",value:policy.name,width:54},
        {label:"POLICY NUMBER",value:policy.number||"—",width:37},
        {label:"POLICY DATE",value:`${fmtDate(docDate)}${d.transaction_time?` · ${fmtTime(d.transaction_time)}`:""}`,width:42},
        {label:"PAYMENT STATUS",value:(CUSTOMER_PAYMENT_STATUS[d.payment_status]||CUSTOMER_PAYMENT_STATUS.paid).label,width:37}
      ];
      let px=left+3;policyCols.forEach(col=>{doc.setFont("helvetica","bold");doc.setFontSize(5.2);doc.setTextColor(100,116,139);doc.text(col.label,px,policyY+4.6);doc.setFontSize(6.6);doc.setTextColor(15,23,42);doc.text(insurancePdfLines(doc,col.value,col.width-3,1),px,policyY+9.1);px+=col.width;});
      const desc=[policy.description,policy.notes].filter(Boolean).join(" · ");doc.setFont("helvetica","normal");doc.setFontSize(5.2);doc.setTextColor(71,85,105);doc.text(insurancePdfLines(doc,desc||"Policy details recorded with this Insurance transaction.",policyW-6,2),left+3,policyY+16.2);
      let tableY=85;
      if(d.cancellation_id){doc.setFillColor(254,242,242);doc.setDrawColor(245,190,190);doc.roundedRect(left,tableY,pageW-left-right,9.5,1.5,1.5,"FD");doc.setFont("helvetica","bold");doc.setFontSize(5.6);doc.setTextColor(170,48,57);doc.text("POLICY CANCELLED",left+3,tableY+3.9);doc.setFont("helvetica","normal");doc.setTextColor(92,62,65);doc.text(insurancePdfLines(doc,`${fmtDate(d.cancellation_date)} · ${formatPolicyDuration(d.policy_used_days)} used${d.cancellation_reason?` · ${d.cancellation_reason}`:""}`,pageW-left-right-35,1),left+34,tableY+3.9);tableY+=12.5;}
      const paidRaw=d.amount_paid==null?n(d.sale_price):Math.min(Math.max(n(d.amount_paid),0),Math.max(n(d.sale_price),0)),outstandingRaw=d.outstanding==null?Math.max(n(d.sale_price)-paidRaw,0):Math.max(n(d.outstanding),0);
      doc.autoTable({startY:tableY,head:[["Policy / Description","Gross Premium","Discount","Sale Amount",title==="Receipt"?"Amount Received":"Amount Paid","Balance Due"]],body:[[policy.name,n(d.gross_premium)>0?insurancePdfAmount(d.gross_premium,d.currency):"—",n(d.customer_discount)>0?insurancePdfAmount(d.customer_discount,d.currency):"—",insurancePdfAmount(d.sale_price,d.currency),insurancePdfAmount(paidRaw,d.currency),insurancePdfAmount(outstandingRaw,d.currency)]],styles:{fontSize:5.65,cellPadding:1.45,overflow:"linebreak",valign:"middle",lineColor:[229,231,235],lineWidth:.08},headStyles:{fontSize:5.45,fillColor:[15,23,42],textColor:255,fontStyle:"bold"},columnStyles:{0:{cellWidth:59},1:{cellWidth:27,halign:"right"},2:{cellWidth:25,halign:"right"},3:{cellWidth:28,halign:"right"},4:{cellWidth:28,halign:"right"},5:{cellWidth:27,halign:"right"}},margin:{left,right,bottom:13}});
      const after=doc.lastAutoTable?.finalY||tableY+14,notes=[d.notes?`Notes: ${d.notes}`:"",d.cancellation_id?`Cancellation: ${fmtDate(d.cancellation_date)} · ${formatPolicyDuration(d.policy_used_days)} used`:""].filter(Boolean).join("   ");
      if(notes&&after<132){doc.setFont("helvetica","normal");doc.setFontSize(5.25);doc.setTextColor(71,85,105);doc.text(insurancePdfLines(doc,notes,pageW-left-right,2),left,Math.min(after+4,132));}
      doc.save(`${title.replace(/\s+/g,"_")}_${String(reference||"Insurance").replace(/[^a-z0-9_-]+/gi,"_")}.pdf`);
    }catch(err){notify(err.message||"Could not generate PDF.","error");}
  }

  function tempDataFromSale(s) {
    const d=buildDocumentData(s,"invoice");
    return {...d,title:"Invoice",invoice_number:`INV-${String(s.reference_no||"").replace(/^INS-/,"")}`,invoice_date:s.transaction_date,description:s.policy_name_snapshot,source_sale_id:s.id};
  }

  function openTempInvoiceEditor(sale=null,temp=null) {
    const action = temp ? "edit" : "create";
    if (!can(action)) return notify(`Your account does not have permission to ${action} temporary Insurance invoices.`, "error");
    const d=temp?enrichTemporaryDocument(temp):tempDataFromSale(sale);
    openModal({id:"insuranceTempInvoiceModal",title:"Temporary Editable Invoice",subtitle:"Editable draft only. The customer-facing document title remains Invoice.",body:`<form id="insuranceTempForm" class="insurance-form-grid">
      <input type="hidden" name="customer_number" value="${esc(d.customer_number||"")}">
      <label>Invoice Number<input class="input" name="invoice_number" value="${esc(d.invoice_number||"")}"></label><label>Invoice Date<input class="input" type="date" name="invoice_date" value="${esc(d.invoice_date||dateToday())}"></label>
      <label>Customer Name<input class="input" name="customer_name" required value="${esc(d.customer_name||"")}"></label><label>Currency<select class="select" name="currency">${currencyOptions(d.currency||currentCurrency())}</select></label>
      <label>Insurance Company<input class="input" name="insurance_company" value="${esc(d.insurance_company||"")}"></label><label>Policy / Description<input class="input" name="policy_name" value="${esc(d.policy_name||d.description||"")}"></label>
      <label class="wide">Policy Number<input class="input" name="policy_number" value="${esc(d.policy_number||"")}" placeholder="Optional"></label>
      <label>Gross Premium<input class="input" type="number" min="0" step="0.01" name="gross_premium" value="${esc(d.gross_premium??"")}"></label><label>Customer Discount<input class="input" type="number" step="0.01" name="customer_discount" value="${esc(d.customer_discount??0)}"></label>
      <label>Invoice Amount<input class="input" type="number" min="0" step="0.01" name="sale_price" required value="${esc(d.sale_price??"")}"></label><label class="wide">Notes<textarea class="input" name="notes" rows="2">${esc(d.notes||"")}</textarea></label>
    </form>`,actions:`<button class="btn ghost" data-insurance-close>Cancel</button><button class="btn ghost" id="insuranceTempPreview">Preview</button><button class="btn primary" id="insuranceTempSave">Save</button>`,onOpen(modal,close){
      const form=$("#insuranceTempForm",modal),tempCurrency=form.elements.currency;if(typeof syncCurrencySelectFonts==="function")syncCurrencySelectFonts(tempCurrency);
      const read=()=>{const fd=new FormData(form);return{title:"Invoice",invoice_number:String(fd.get("invoice_number")||"").trim(),invoice_date:fd.get("invoice_date"),customer_name:String(fd.get("customer_name")||"").trim(),customer_number:String(fd.get("customer_number")||d.customer_number||"").trim(),currency:fd.get("currency"),insurance_company:String(fd.get("insurance_company")||"").trim(),policy_name:String(fd.get("policy_name")||"").trim(),policy_number:String(fd.get("policy_number")||"").trim(),gross_premium:n(fd.get("gross_premium")),customer_discount:n(fd.get("customer_discount")),sale_price:n(fd.get("sale_price")),notes:String(fd.get("notes")||"").trim(),source_sale_id:sale?.id||temp?.sale_id||d.source_sale_id||null,cancellation_id:d.cancellation_id||null,cancellation_date:d.cancellation_date||null,cancellation_time:d.cancellation_time||null,policy_used_days:n(d.policy_used_days),cancellation_reason:d.cancellation_reason||""};};
      $("#insuranceTempPreview",modal).onclick=()=>{if(!form.reportValidity())return;previewTempInvoice({invoice_number:read().invoice_number,invoice_data:read()});};
      $("#insuranceTempSave",modal).onclick=async e=>{if(!form.reportValidity())return;const data=read();setBusy(e.currentTarget,true,"Saving");try{await rpc("app_insurance_upsert_temp_invoice",{p_id:temp?.id||null,p_sale_id:sale?.id||temp?.sale_id||d.source_sale_id||null,p_invoice_number:data.invoice_number||null,p_invoice_data:data});close();const r=await rpc("app_insurance_list_temp_invoices",{});S.tempInvoices=r?.items||[];if(S.view==="temporary")renderTemporaryInvoices();else if(S.view==="sales")renderSales();else if(S.view==="reports")renderReports();notify("Temporary Invoice saved. Permanent Insurance Sale remains unchanged.");}catch(err){notify(err.message||"Could not save temporary invoice.","error");}finally{setBusy(e.currentTarget,false);}};
    }});
  }

  function previewTempInvoice(temp) {
    if(!temp)return;const d=enrichTemporaryDocument(temp);
    openModal({id:"insuranceTempPreviewModal",title:"Invoice Preview",subtitle:"Temporary editable document",body:documentHtml(d),wide:true,actions:`<button class="btn ghost" data-insurance-close>Done</button><button class="btn primary" id="insuranceTempPdf"><i class="fa-solid fa-file-pdf"></i> PDF</button>`,onOpen(modal){$("#insuranceTempPdf",modal).onclick=()=>downloadCustomerDocumentPdf({...d,title:"Invoice",reference:d.invoice_number,date:d.invoice_date});}});
  }

  async function deleteTempInvoice(id){if(!global.confirm("Delete this temporary Invoice? The permanent Insurance Sale will not be changed."))return;try{await rpc("app_insurance_delete_temp_invoice",{p_id:id});const r=await rpc("app_insurance_list_temp_invoices",{});S.tempInvoices=r?.items||[];renderTemporaryInvoices();notify("Temporary Invoice deleted. Insurance Sale preserved.");}catch(err){notify(err.message||"Could not delete temporary invoice.","error");}}

  async function fetchAllReportRows() {
    const all=[];let offset=0,total=Infinity;
    while(offset<total && all.length<5000){const res=await rpc("app_insurance_list_sales",{p_start_date:S.filters.start||null,p_end_date:S.filters.end||null,p_search:S.filters.search||null,p_company_id:S.filters.company||null,p_policy_id:S.filters.policy||null,p_customer:S.filters.customer||null,p_offset:offset,p_limit:200});const rows=res?.items||[];all.push(...rows);total=Number(res?.total||all.length);if(!rows.length)break;offset+=rows.length;}
    return all;
  }

  function reportExportColumns() {
    const fields = activeReportMeta().fields;
    return fields.map(key => ({ key, label: REPORT_FIELD_META[key].label }));
  }

  async function exportInsuranceReportPdf(){
    if(!can("export") && !can("view"))return notify("Report export is not permitted for this account.","error");
    if(!global.jspdf?.jsPDF)return notify("PDF library is still loading.","error");
    try{
      const rows=await fetchAllReportRows();if(!rows.length)return notify("No Insurance records match this report.","error");
      const meta=activeReportMeta(),financial=reportExportColumns(),{jsPDF}=global.jspdf,doc=new jsPDF("landscape");
      if(typeof loadCustomFontsForPdf==="function")await loadCustomFontsForPdf(doc);
      const logo=typeof getPdfLogo==="function"?await getPdfLogo():null;
      const range=selectedDateRangeLabel();
      if(typeof drawPdfHeaderAndFooter==="function")drawPdfHeaderAndFooter(doc,logo,meta.title,range,true);
      const y=Math.max(82,Number(doc.__tripleMOwnerBlockBottom||75)+6);
      doc.setFontSize(7);doc.setTextColor(100,116,139);doc.text(`Selected dates: ${range}   ·   Records: ${rows.length}`,10,y-3);
      doc.autoTable({startY:y,head:[["Item","Policy No.","Status","Date","Company","Customer",...financial.map(c=>c.label)]],body:rows.map(r=>[r.policy_name_snapshot||"Insurance",r.policy_number||"—",r.cancellation_id?`Cancelled · ${formatPolicyDuration(r.policy_used_days)} used`:"Active / Sold",fmtDate(r.transaction_date),r.company_name_snapshot,r.customer_name||"Walk-in Customer",...financial.map(c=>formatPdfAmount(r[c.key],r.currency))]),styles:{fontSize:5.8,cellPadding:1.9},headStyles:{fontSize:5.8},margin:{left:10,right:10,bottom:34}});
      const totals=Array.isArray(S.summary.by_currency)?S.summary.by_currency:[];
      if(totals.length){
        const totalStart=(doc.lastAutoTable?.finalY||y)+6;
        doc.autoTable({startY:totalStart,head:[["TOTAL","Sales",...financial.map(c=>c.label)]],body:totals.map(r=>[r.currency,Number(r.sale_count||0),...financial.map(c=>formatPdfAmount(r[c.key],r.currency))]),styles:{fontSize:6.6,fontStyle:"bold",cellPadding:2.3},headStyles:{fontSize:6.2},margin:{left:10,right:10,bottom:34},theme:"grid"});
      }
      doc.save(`${meta.title.replace(/[^a-z0-9]+/gi,"_")}.pdf`);
    }catch(err){notify(err.message||"Could not export Insurance report PDF.","error");}
  }

  async function exportInsuranceReportCsv(){
    try{const rows=await fetchAllReportRows();if(!rows.length)return notify("No Insurance records match this report.","error");const meta=activeReportMeta(),financial=reportExportColumns(),q=v=>`"${String(v??"").replace(/"/g,'""')}"`;const header=["Reference","Policy Number","Status","Policy Used Days","Date","Time","Insurance Company","Policy","Customer","Currency",...financial.map(c=>c.label)];const lines=[header.map(q).join(","),...rows.map(r=>[r.reference_no,r.policy_number||"",r.cancellation_id?"Cancelled":"Active / Sold",r.cancellation_id?r.policy_used_days:"",r.transaction_date,r.transaction_time,r.company_name_snapshot,r.policy_name_snapshot,r.customer_name,r.currency,...financial.map(c=>r[c.key])].map(q).join(","))];const blob=new Blob([lines.join("\n")],{type:"text/csv;charset=utf-8"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`${meta.title.replace(/[^a-z0-9]+/gi,"_")}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}catch(err){notify(err.message||"Could not export Insurance CSV.","error");}
  }

  async function reloadMasterAndView(nextView = null) {
    S.ready=false;await loadMaster({force:true});await refreshSummaryForFilters();renderKpis();await switchView(nextView||S.view);
  }

  function bindStaticEvents() {
    const refresh=$("#insuranceRefreshBtn"), sale=$("#insuranceMakeSaleBtn");
    if(refresh&&refresh.dataset.boundInsurance!=="1"){refresh.dataset.boundInsurance="1";refresh.onclick=async()=>{setBusy(refresh,true,"Refreshing");try{await reloadMasterAndView();notify("Insurance workspace refreshed.");}catch(err){notify(err.message||"Could not refresh Insurance.","error");}finally{setBusy(refresh,false);}};}
    if(sale&&sale.dataset.boundInsurance!=="1"){sale.dataset.boundInsurance="1";sale.onclick=openMakeSale;}
    if(sale)sale.classList.toggle("hide",!can("create"));
  }

  async function prepareInsuranceWorkspace() {
    if (typeof userHasPermission !== "function" || !userHasPermission("insurance","view")) {
      notify("Insurance access is not enabled for this account.","error");
      if(typeof activate==="function")activate("home");
      return;
    }
    if(S.loading)return;S.loading=true;
    try{bindStaticEvents();await loadMaster();renderKpis();renderViewTabs();await loadSales({reset:true});renderSales();}
    catch(err){console.error("Insurance load failed",err);notify(err.message||"Insurance could not be loaded.","error");}
    finally{S.loading=false;}
  }

  global.prepareInsuranceWorkspace=prepareInsuranceWorkspace;
  global.TriplemInsurance={state:S,openMakeSale,openSaleDetails,refresh:reloadMasterAndView};
})(window);
