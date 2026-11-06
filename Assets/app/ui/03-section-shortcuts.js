/* Triplem VIP section keyboard shortcuts.
   Desktop-only and strictly scoped to the currently active section.

   Browsers:  Ctrl + Alt + key (unchanged).
   Windows app (3.8): two keys, Alt + key. App-wide Ctrl + key shortcuts live
   in Assets/app/desktop/02-app-shortcuts.js. */
(() => {
  "use strict";

  const DESKTOP_SHORTCUT_MEDIA = "(min-width: 900px) and (any-hover: hover) and (any-pointer: fine)";
  const WINDOWS_APP = (() => { try { return window.__TRIPLEM_DESKTOP__?.app === "windows"; } catch (_) { return false; } })();
  const sectionShortcutRegistry = new Map();

  function desktopShortcutsAvailable(){
    if (WINDOWS_APP) return windowsAppKeysOn();
    try { return window.matchMedia(DESKTOP_SHORTCUT_MEDIA).matches; }
    catch (_) { return window.innerWidth >= 900; }
  }

  // The Windows app menu can turn its in-app shortcuts off (stored on this PC).
  function windowsAppKeysOn(){
    try { return localStorage.getItem("triplem-desktop-appkeys-v1") !== "0"; } catch (_) { return true; }
  }

  function activeSectionKey(){
    if (typeof getActiveTabKey === "function") return getActiveTabKey();
    const panel = document.querySelector(".panel.active");
    return panel?.id?.endsWith("Panel") ? panel.id.replace(/Panel$/, "") : "";
  }

  function blockingModalOpen(){
    return !!document.querySelector(".modal:not(.hide), #accountingDynamicModal, .dpp-backdrop, .dsp-backdrop");
  }

  function isEditableTarget(target){
    if (!(target instanceof Element)) return false;
    return !!target.closest("input,textarea,select,[contenteditable='true'],[contenteditable='plaintext-only']");
  }

  function closeOpenMenus(){
    try { if (typeof closeOpenEntryMenus === "function") closeOpenEntryMenus(); } catch (_) {}
    try { if (typeof closeExpenseTransactionMenus === "function") closeExpenseTransactionMenus(); } catch (_) {}
    document.querySelectorAll(".menu-dropdown.open").forEach(panel => panel.classList.remove("open"));
    document.querySelectorAll(".menu-wrap.open").forEach(wrap => wrap.classList.remove("open"));
    document.querySelectorAll(".menu-trigger[aria-expanded='true']").forEach(trigger => trigger.setAttribute("aria-expanded", "false"));
  }

  function canEditFinancialEntries(){
    return typeof teamCanShowEdit !== "function" || teamCanShowEdit("entries");
  }

  function requireFinancialEditPermission(){
    if (canEditFinancialEntries()) return true;
    alert("You do not have permission to create or edit financial entries.");
    return false;
  }

  function clickNativeAction(selector, options = {}){
    if (options.requireEntryEdit && !requireFinancialEditPermission()) return;
    closeOpenMenus();
    const active = document.getElementById(`${activeSectionKey()}Panel`);
    const button = active?.querySelector(selector) || document.querySelector(selector);
    if (!button || button.disabled || button.getAttribute("aria-disabled") === "true") {
      if (options.unavailableMessage) alert(options.unavailableMessage);
      return;
    }
    button.click();
  }

  function openExpenseTransferShortcut(){
    if (!requireFinancialEditPermission()) return;
    if (typeof getExpenseAccounts !== "function" || typeof openTransferModal !== "function") return;

    const accounts = getExpenseAccounts({ applyUiFilters: false })
      .filter(account => account && account.currency !== "BTC");
    if (accounts.length < 2) {
      alert("At least two non-BTC wallets are required to transfer money.");
      return;
    }

    const walletFilter = document.getElementById("expenseWalletSelectFilter");
    const selectedGroupId = String(walletFilter?.value || "");
    const source = accounts.find(account => account.group_id === selectedGroupId) || accounts[0];
    if (!source) return;

    closeOpenMenus();
    openTransferModal(source.group_id, source.person_name || "Wallet", source.currency || "");
  }

  function focusSearchInput(id){
    closeOpenMenus();
    const input = document.getElementById(id);
    if (!input || input.disabled || input.offsetParent === null) return;
    input.scrollIntoView({ block: "nearest", behavior: "smooth" });
    try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
    try { input.select(); } catch (_) {}
  }

  function focusAssetsSearch(){
    const depreciationView = document.getElementById("assetsDepreciationView");
    const depreciationActive = depreciationView && !depreciationView.classList.contains("hide");
    focusSearchInput(depreciationActive ? "searchDepAssets" : "searchAssets");
  }

  function openLoanEntry(mode, direction){
    if (!requireFinancialEditPermission()) return;
    closeOpenMenus();
    const active = activeSectionKey();
    const activePanel = document.getElementById(`${active}Panel`);
    const selector = `[data-open-modal="${mode}"][data-direction="${direction}"]:not([data-installment])`;
    const button = activePanel?.querySelector(selector) || document.querySelector(selector);
    if (!button || button.disabled || button.getAttribute("aria-disabled") === "true") {
      alert("This loan action is not available for your account.");
      return;
    }
    button.click();
  }

  function filterOpenPartial(section){
    const filterIds = {
      given: "givenStatusFilter",
      received: "receivedStatusFilter",
      taken: "takenStatusFilter",
      returned: "returnedStatusFilter"
    };
    const select = document.getElementById(filterIds[section] || "");
    if (!select) return;
    closeOpenMenus();
    select.value = "Active";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function accountingAction(action, view){
    closeOpenMenus();
    const panel = document.getElementById("accountingPanel");
    if (!panel) return;
    if (view) {
      const btn = panel.querySelector(`[data-acct-view="${view}"]`);
      if (btn) btn.click();
      return;
    }
    const api = window.TriplemAccounting;
    if (action === "invoice" && typeof api?.openDocument === "function") { api.openDocument("sales", null, "sales_invoice"); return; }
    if (action === "bill" && typeof api?.openDocument === "function") { api.openDocument("purchases", null, "purchase_bill"); return; }
    if (action === "journal" && typeof api?.openJournal === "function") { api.openJournal(null); return; }
    const button = panel.querySelector(`[data-acct-action="${action}"]`);
    if (button && !button.disabled) button.click();
  }

  function triplemAiNewChat(){
    closeOpenMenus();
    document.querySelector("#triplem-aiPanel [data-triplem-ai-clear]")?.click();
    setTimeout(() => document.getElementById("triplemAiInput")?.focus(), 30);
  }

  // Keys shown and matched: Alt + key in the Windows app, Ctrl + Alt + key in browsers.
  function keysFor(key){
    const k = String(key).toUpperCase();
    return WINDOWS_APP ? ["Alt", k] : ["Ctrl", "Alt", k];
  }
  function descriptor(key){
    return WINDOWS_APP ? { key, ctrl: false, alt: true, shift: false } : { key, ctrl: true, alt: true, shift: false };
  }
  function sc(key, label, description, run){
    return { ...descriptor(key), label, description, keys: keysFor(key), run };
  }

  function registerSectionShortcuts(section, details){
    const key = String(section || "").trim();
    if (!key || !details || !Array.isArray(details.shortcuts)) return;
    sectionShortcutRegistry.set(key, {
      title: String(details.title || "Keyboard Shortcuts"),
      subtitle: String(details.subtitle || (WINDOWS_APP ? "Hold Alt and press the letter." : "Available only while this section is open on a computer.")),
      shortcuts: details.shortcuts.slice()
    });
  }

  registerSectionShortcuts("expenses", {
    title: "Expense Shortcuts",
    shortcuts: [
      sc("n", "Add Expense", "New expense entry", () => clickNativeAction("#openExpenseEntryBtn", { requireEntryEdit: true, unavailableMessage: "Add Expense is not available for your account." })),
      sc("a", "Add Money", "Wallet top-up", () => clickNativeAction("#openExpenseTopupBtn", { requireEntryEdit: true, unavailableMessage: "Add Money is not available for your account." })),
      sc("t", "Transfer Money", "Wallet-to-wallet transfer", openExpenseTransferShortcut),
      sc("w", "Add Account", "New wallet or account", () => clickNativeAction("#openExpenseAccountBtn", { requireEntryEdit: true, unavailableMessage: "Add Account is not available for your account." })),
      sc("f", "Search Expenses", "Focus the search field", () => focusSearchInput("searchExpenses"))
    ]
  });

  const givenLoanShortcuts = section => [
    sc("g", "Loan Given", "New Loan Given entry", () => openLoanEntry("principal", "given")),
    sc("r", "Received Back", "Repayment received", () => openLoanEntry("payment", "given")),
    sc("o", "Open / Partial Only", "Show open or partly settled loans", () => filterOpenPartial(section)),
    sc("f", "Search Loans", "Focus the search field", () => focusSearchInput(section === "received" ? "searchReceived" : "searchGiven"))
  ];

  const takenLoanShortcuts = section => [
    sc("t", "Loan Taken", "New Loan Taken entry", () => openLoanEntry("principal", "taken")),
    sc("b", "Loan Returned", "Repayment returned back", () => openLoanEntry("payment", "taken")),
    sc("o", "Open / Partial Only", "Show open or partly settled loans", () => filterOpenPartial(section)),
    sc("f", "Search Loans", "Focus the search field", () => focusSearchInput(section === "returned" ? "searchReturned" : "searchTaken"))
  ];

  registerSectionShortcuts("given", { title: "Loan Given / Received Back Shortcuts", shortcuts: givenLoanShortcuts("given") });
  registerSectionShortcuts("received", { title: "Loan Given / Received Back Shortcuts", shortcuts: givenLoanShortcuts("received") });
  registerSectionShortcuts("taken", { title: "Loan Taken / Returned Back Shortcuts", shortcuts: takenLoanShortcuts("taken") });
  registerSectionShortcuts("returned", { title: "Loan Taken / Returned Back Shortcuts", shortcuts: takenLoanShortcuts("returned") });

  registerSectionShortcuts("installments", {
    title: "Installment Shortcuts",
    shortcuts: [
      sc("n", "New Plan", "New bought installment plan", () => clickNativeAction("#installmentNewPlanBtn", { requireEntryEdit: true, unavailableMessage: "New plans are not available for your account." })),
      sc("p", "Pay Installment", "Record an installment payment", () => clickNativeAction("#installmentNewPaymentBtn", { requireEntryEdit: true, unavailableMessage: "Payments are not available for your account." })),
      sc("f", "Search Installments", "Focus the search field", () => focusSearchInput("searchInstallments"))
    ]
  });

  registerSectionShortcuts("goods", {
    title: "Inventory Shortcuts",
    shortcuts: [
      sc("n", "Goods Bought", "New purchase entry", () => clickNativeAction("#openGoodsBoughtBtn", { requireEntryEdit: true, unavailableMessage: "Goods Bought is not available for your account." })),
      sc("s", "Goods Sold", "New sale entry", () => clickNativeAction("#openGoodsSoldBtn", { requireEntryEdit: true, unavailableMessage: "Goods Sold is not available for your account." })),
      sc("d", "Saved Carts", "Saved carts and proforma invoices", () => clickNativeAction("#openInventoryDraftsBtn")),
      sc("c", "Customers", "Customers and invoices", () => clickNativeAction("#openInventoryCustomersBtn")),
      sc("b", "Barcodes", "Product barcodes and labels", () => clickNativeAction("#openInventoryBarcodesBtn")),
      sc("q", "Scanner", "Scan barcodes into the cart", () => clickNativeAction("#openInventoryScannerBtn")),
      sc("f", "Search Inventory", "Focus the search field", () => focusSearchInput("searchGoods"))
    ]
  });

  registerSectionShortcuts("assets", {
    title: "Asset Shortcuts",
    shortcuts: [
      sc("n", "Add Asset", "New asset", () => clickNativeAction("#openAddAssetBtn", { requireEntryEdit: true, unavailableMessage: "Add Asset is not available for your account." })),
      sc("d", "Depreciation Asset", "New depreciation asset", () => clickNativeAction("#openAddDepAssetBtn", { requireEntryEdit: true, unavailableMessage: "Depreciation assets are not available for your account." })),
      sc("f", "Search Assets", "Focus the search field", focusAssetsSearch)
    ]
  });

  registerSectionShortcuts("insurance", {
    title: "Insurance Shortcuts",
    shortcuts: [
      sc("n", "Make Sale", "New insurance sale", () => clickNativeAction("#insuranceMakeSaleBtn", { unavailableMessage: "Make Sale is not available for your account." })),
      sc("r", "Refresh", "Reload insurance records", () => clickNativeAction("#insuranceRefreshBtn")),
      sc("f", "Search Insurance", "Focus the search field", () => focusSearchInput("insuranceFilterSearch"))
    ]
  });

  registerSectionShortcuts("audit", {
    title: "Audit Report Shortcuts",
    shortcuts: [
      sc("r", "Run Audit", "Run the financial audit", () => clickNativeAction("#runFinancialAuditBtn"))
    ]
  });

  registerSectionShortcuts("accounting", {
    title: "Accounting Shortcuts",
    shortcuts: [
      sc("n", "New Record", "Choose what to create", () => accountingAction("quick-new")),
      sc("i", "Sales Invoice", "New sales invoice", () => accountingAction("invoice")),
      sc("b", "Purchase Bill", "New supplier bill", () => accountingAction("bill")),
      sc("j", "Journal Entry", "New journal entry", () => accountingAction("journal")),
      sc("c", "Contact", "New customer or supplier", () => accountingAction("new-contact")),
      sc("r", "Reports", "Open financial reports", () => accountingAction(null, "reports")),
      sc("o", "Overview", "Accounting overview", () => accountingAction(null, "overview")),
      sc("s", "Settings", "Accounting settings", () => accountingAction("settings")),
      sc("f", "Search", "Focus the search field", () => focusSearchInput("accountingSearch"))
    ]
  });

  registerSectionShortcuts("notes", {
    title: "Notes Shortcuts",
    shortcuts: [
      sc("n", "New Note", "Open a new note", () => clickNativeAction("#newNoteBtn", { unavailableMessage: "New Note is not available for your account." })),
      sc("f", "Search Notes", "Focus the search field", () => focusSearchInput("searchNotes"))
    ]
  });

  registerSectionShortcuts("triplem-ai", {
    title: "Triplem AI Shortcuts",
    shortcuts: [
      sc("n", "New Chat", "Clear the conversation", triplemAiNewChat),
      sc("f", "Ask", "Focus the question box", () => focusSearchInput("triplemAiInput"))
    ]
  });

  function matchesShortcut(event, shortcut){
    // event.code keeps shortcuts working with Arabic, Urdu and other layouts.
    const code = String(event.code || "");
    const keyOk = String(event.key || "").toLowerCase() === shortcut.key || code === `Key${shortcut.key.toUpperCase()}`;
    return keyOk
      && event.ctrlKey === shortcut.ctrl
      && event.altKey === shortcut.alt
      && event.shiftKey === shortcut.shift
      && event.metaKey === false;
  }

  function handleSectionShortcut(event){
    if (event.defaultPrevented || event.repeat) return;
    if (!desktopShortcutsAvailable() || blockingModalOpen()) return;
    if (isEditableTarget(event.target)) return;

    const section = activeSectionKey();
    const group = sectionShortcutRegistry.get(section);
    if (!group) return;
    const shortcut = group.shortcuts.find(item => matchesShortcut(event, item));
    if (!shortcut) return;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    shortcut.run();
  }

  function shortcutKeysHtml(keys){
    return keys.map((key, index) => `${index ? '<span>+</span>' : ''}<kbd>${key}</kbd>`).join("");
  }

  function openShortcutOverlay(section){
    // The Windows app shows every shortcut (app-wide and this section) together.
    if (WINDOWS_APP && typeof window.TriplemDesktop?.showShortcuts === "function") { closeOpenMenus(); window.TriplemDesktop.showShortcuts(); return; }
    if (!desktopShortcutsAvailable()) return;
    const active = activeSectionKey();
    const requested = String(section || active);
    if (requested !== active && !(requested === "assets" && active === "assets")) return;

    const group = sectionShortcutRegistry.get(active);
    const modal = document.getElementById("sectionShortcutsModal");
    const title = document.getElementById("sectionShortcutsTitle");
    const subtitle = document.getElementById("sectionShortcutsSubtitle");
    const list = document.getElementById("sectionShortcutsList");
    if (!group || !modal || !title || !subtitle || !list) return;

    closeOpenMenus();
    title.innerHTML = `<i class="fa-solid fa-keyboard" aria-hidden="true"></i> ${group.title}`;
    subtitle.textContent = group.subtitle;
    list.innerHTML = group.shortcuts.map(shortcut => `
      <div class="section-shortcut-row">
        <div class="section-shortcut-keys">${shortcutKeysHtml(shortcut.keys)}</div>
        <div><strong>${shortcut.label}</strong><small>${shortcut.description}</small></div>
      </div>`).join("");
    modal.classList.remove("hide");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    modal.querySelector("button[data-close-modal]")?.focus({ preventScroll: true });
  }

  function closeShortcutOverlay(){
    if (typeof closeModal === "function") {
      closeModal("sectionShortcutsModal");
      return;
    }
    const modal = document.getElementById("sectionShortcutsModal");
    if (!modal) return;
    modal.classList.add("hide");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = document.querySelector(".modal:not(.hide)") ? "hidden" : "";
  }

  // In the Windows app the menu items announce the two-key shortcuts.
  function syncAriaShortcuts(){
    if (!WINDOWS_APP) return;
    document.querySelectorAll("[aria-keyshortcuts^='Control+Alt+']").forEach(el => {
      el.setAttribute("aria-keyshortcuts", el.getAttribute("aria-keyshortcuts").replace(/^Control\+Alt\+/, "Alt+"));
    });
  }

  document.addEventListener("click", event => {
    const trigger = event.target.closest?.("[data-shortcut-trigger]");
    if (!trigger) return;
    event.preventDefault();
    openShortcutOverlay(trigger.dataset.shortcutTrigger || activeSectionKey());
  });

  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    const modal = document.getElementById("sectionShortcutsModal");
    if (!modal || modal.classList.contains("hide")) return;
    event.preventDefault();
    closeShortcutOverlay();
  });

  if (WINDOWS_APP) {
    document.documentElement.classList.add("triplem-app-keys");
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", syncAriaShortcuts, { once: true });
    else syncAriaShortcuts();
  }

  window.TriplemSectionShortcuts = Object.freeze({
    register: registerSectionShortcuts,
    activeSection: activeSectionKey,
    open: openShortcutOverlay,
    group: section => sectionShortcutRegistry.get(String(section || activeSectionKey())) || null,
    windowsApp: WINDOWS_APP
  });
  window.addEventListener("keydown", handleSectionShortcut, true);
})();
