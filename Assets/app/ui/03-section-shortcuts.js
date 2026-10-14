/* Triplem VIP section keyboard shortcuts.
   Desktop-only and strictly scoped to the currently active section. */
(() => {
  "use strict";

  const DESKTOP_SHORTCUT_MEDIA = "(min-width: 900px) and (any-hover: hover) and (any-pointer: fine)";
  const sectionShortcutRegistry = new Map();

  function desktopShortcutsAvailable(){
    try { return window.matchMedia(DESKTOP_SHORTCUT_MEDIA).matches; }
    catch (_) { return window.innerWidth >= 900; }
  }

  function activeSectionKey(){
    if (typeof getActiveTabKey === "function") return getActiveTabKey();
    const panel = document.querySelector(".panel.active");
    return panel?.id?.endsWith("Panel") ? panel.id.replace(/Panel$/, "") : "";
  }

  function blockingModalOpen(){
    return !!document.querySelector(".modal:not(.hide)");
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
    const button = document.querySelector(selector);
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

  function descriptor(key){
    return { key, ctrl: true, alt: true, shift: false };
  }

  function registerSectionShortcuts(section, details){
    const key = String(section || "").trim();
    if (!key || !details || !Array.isArray(details.shortcuts)) return;
    sectionShortcutRegistry.set(key, {
      title: String(details.title || "Keyboard Shortcuts"),
      subtitle: String(details.subtitle || "Available only while this section is open on a computer."),
      shortcuts: details.shortcuts.slice()
    });
  }

  registerSectionShortcuts("expenses", {
    title: "Expense Shortcuts",
    shortcuts: [
      { ...descriptor("n"), label: "Add Expense", description: "Open a new expense entry.", keys: ["Ctrl", "Alt", "N"], run: () => clickNativeAction("#openExpenseEntryBtn", { requireEntryEdit: true, unavailableMessage: "Add Expense is not available for your account." }) },
      { ...descriptor("a"), label: "Add Money", description: "Open wallet top-up.", keys: ["Ctrl", "Alt", "A"], run: () => clickNativeAction("#openExpenseTopupBtn", { requireEntryEdit: true, unavailableMessage: "Add Money is not available for your account." }) },
      { ...descriptor("t"), label: "Transfer Money", description: "Open wallet-to-wallet transfer.", keys: ["Ctrl", "Alt", "T"], run: openExpenseTransferShortcut },
      { ...descriptor("f"), label: "Search Expenses", description: "Focus and select the expense search field.", keys: ["Ctrl", "Alt", "F"], run: () => focusSearchInput("searchExpenses") }
    ]
  });

  const givenLoanShortcuts = section => [
    { ...descriptor("g"), label: "Loan Given", description: "Open a new Loan Given entry.", keys: ["Ctrl", "Alt", "G"], run: () => openLoanEntry("principal", "given") },
    { ...descriptor("r"), label: "Received Back", description: "Open a repayment received entry.", keys: ["Ctrl", "Alt", "R"], run: () => openLoanEntry("payment", "given") },
    { ...descriptor("o"), label: "Open / Partial Only", description: "Filter this loan view to open or partially settled records.", keys: ["Ctrl", "Alt", "O"], run: () => filterOpenPartial(section) },
    { ...descriptor("f"), label: "Search Loans", description: "Focus and select this loan search field.", keys: ["Ctrl", "Alt", "F"], run: () => focusSearchInput(section === "received" ? "searchReceived" : "searchGiven") }
  ];

  const takenLoanShortcuts = section => [
    { ...descriptor("t"), label: "Loan Taken", description: "Open a new Loan Taken entry.", keys: ["Ctrl", "Alt", "T"], run: () => openLoanEntry("principal", "taken") },
    { ...descriptor("b"), label: "Loan Returned", description: "Open a returned-back repayment entry.", keys: ["Ctrl", "Alt", "B"], run: () => openLoanEntry("payment", "taken") },
    { ...descriptor("o"), label: "Open / Partial Only", description: "Filter this loan view to open or partially settled records.", keys: ["Ctrl", "Alt", "O"], run: () => filterOpenPartial(section) },
    { ...descriptor("f"), label: "Search Loans", description: "Focus and select this loan search field.", keys: ["Ctrl", "Alt", "F"], run: () => focusSearchInput(section === "returned" ? "searchReturned" : "searchTaken") }
  ];

  registerSectionShortcuts("given", { title: "Loan Given / Received Back Shortcuts", shortcuts: givenLoanShortcuts("given") });
  registerSectionShortcuts("received", { title: "Loan Given / Received Back Shortcuts", shortcuts: givenLoanShortcuts("received") });
  registerSectionShortcuts("taken", { title: "Loan Taken / Returned Back Shortcuts", shortcuts: takenLoanShortcuts("taken") });
  registerSectionShortcuts("returned", { title: "Loan Taken / Returned Back Shortcuts", shortcuts: takenLoanShortcuts("returned") });

  registerSectionShortcuts("installments", {
    title: "Installment Shortcuts",
    shortcuts: [
      { ...descriptor("f"), label: "Search Installments", description: "Focus and select the installment search field.", keys: ["Ctrl", "Alt", "F"], run: () => focusSearchInput("searchInstallments") }
    ]
  });

  registerSectionShortcuts("assets", {
    title: "Asset Shortcuts",
    shortcuts: [
      { ...descriptor("f"), label: "Search Assets", description: "Focus the search field for the currently open Asset view.", keys: ["Ctrl", "Alt", "F"], run: focusAssetsSearch }
    ]
  });

  registerSectionShortcuts("notes", {
    title: "Notes Shortcuts",
    shortcuts: [
      { ...descriptor("n"), label: "New Note", description: "Open a new note.", keys: ["Ctrl", "Alt", "N"], run: () => clickNativeAction("#newNoteBtn", { unavailableMessage: "New Note is not available for your account." }) },
      { ...descriptor("f"), label: "Search Notes", description: "Focus and select the notes search field.", keys: ["Ctrl", "Alt", "F"], run: () => focusSearchInput("searchNotes") }
    ]
  });

  function matchesShortcut(event, shortcut){
    return String(event.key || "").toLowerCase() === shortcut.key
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

  window.TriplemSectionShortcuts = Object.freeze({
    register: registerSectionShortcuts,
    activeSection: activeSectionKey,
    open: openShortcutOverlay
  });
  window.addEventListener("keydown", handleSectionShortcut, true);
})();
