/* Modularized from script.js lines 1855-4265 — auth/session through before write-queue. Load order must be preserved. */
function clearGuestStorageArtifacts(){
  GUEST_STORAGE_KEYS.forEach(key => {
    try { localStorage.removeItem(key); } catch {}
    try { sessionStorage.removeItem(key); } catch {}
  });
}

function resetGuestSessionData(){
  clearGuestStorageArtifacts();
  state.entries = [];
  state.recycleBin = [];
  state.notes = [];
  state.bitcoinWallets = [];
}

function loadGuestNotesFromStorage(){
  renderNotes();
}

function saveGuestNotesToStorage(){
  clearGuestStorageArtifacts();
}

function loadGuestBitcoinWalletsFromStorage(){
  renderBitcoinWallets();
  renderExistingAddressesDropdown();
}

function saveGuestBitcoinWalletsToStorage(){
  clearGuestStorageArtifacts();
}

function ensureGuestRestrictionOverlay(){
  let overlay = document.getElementById("guestRestrictionOverlay");
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.id = "guestRestrictionOverlay";
  overlay.className = "guest-restriction-overlay hide";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.innerHTML = `
    <div class="guest-restriction-dialog">
      <div class="guest-restriction-icon"><i class="fa-solid fa-lock"></i></div>
      <div class="guest-restriction-copy">
        <h3 id="guestRestrictionTitle">Full access required</h3>
        <p id="guestRestrictionMessage">This feature is not available in Guest Mode.</p>
        <a class="guest-restriction-contact" href="https://wa.me/923339004564" target="_blank" rel="noopener">
          <i class="fa-brands fa-whatsapp"></i>
          <span>To get full access contact +923339004564</span>
        </a>
      </div>
      <button class="btn primary guest-restriction-ok" type="button">OK</button>
    </div>
  `;
  const closeOverlay = () => {
    overlay.classList.add("hide");
    document.body.style.overflow = "";
  };
  overlay.querySelector(".guest-restriction-ok")?.addEventListener("click", closeOverlay);
  overlay.addEventListener("click", event => {
    if (event.target === overlay) closeOverlay();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !overlay.classList.contains("hide")) closeOverlay();
  });
  document.body.appendChild(overlay);
  return overlay;
}

function showGuestRestrictionOverlay(kind = "feature"){
  const overlay = ensureGuestRestrictionOverlay();
  const title = overlay.querySelector("#guestRestrictionTitle");
  const message = overlay.querySelector("#guestRestrictionMessage");
  if (title) title.textContent = kind === "bitcoin" ? "Bitcoin is locked in Guest Mode" : "Full access required";
  if (message) {
    message.textContent = kind === "bitcoin"
      ? "Bitcoin wallet tools are not available in Guest Mode. Please use a full account to access this section."
      : "PDFs, statements, reports, invoices, receipts, CSV exports, and JSON exports are not available in Guest Mode.";
  }
  overlay.classList.remove("hide");
  document.body.style.overflow = "hidden";
  overlay.querySelector(".guest-restriction-ok")?.focus();
}

function isGuestRestrictedDownloadTarget(target){
  const control = target?.closest?.("button,a,label,[role='button']");
  if (!control) return false;
  if (control.closest("#iosDownloadOverlay, #androidDownloadOverlay")) return false;
  const restrictedIds = new Set([
    "downloadAllSectionsPdfBtn",
    "downloadAllDataJsonBtn",
    "downloadAllDataCsvBtn",
    "downloadGivenPdfBtn",
    "downloadReceivedPdfBtn",
    "downloadTakenPdfBtn",
    "downloadReturnedPdfBtn",
    "downloadExpensesPdfBtn",
    "inventoryCustomerStatementBtn"
  ]);
  if (control.id && restrictedIds.has(control.id)) return true;
  if (control.matches([
    ".soldReceiptBtn",
    ".invoiceDownloadBtn",
    ".inventoryOutstandingCustomerPdfBtn",
    ".inventoryOutstandingCustomerStatementBtn",
    ".inventoryCustomerInvoicePdfBtn",
    ".inventoryCustomerReceiptPdfBtn",
    ".expenseBtcTxPdfBtn",
    ".walletDownloadPdfBtn"
  ].join(","))) return true;
  if (control.dataset?.action === "pdf") return true;
  const probe = [
    control.id,
    control.className,
    control.getAttribute("onclick"),
    control.getAttribute("title"),
    control.getAttribute("aria-label"),
    control.textContent
  ].join(" ");
  return /\b(download|pdf|statement|report|receipt|csv|json)\b/i.test(probe);
}

function handleGuestRestrictedClick(event){
  if (!isGuestMode()) return;
  if (isGuestRestrictedDownloadTarget(event.target)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    showGuestRestrictionOverlay("download");
  }
}

function getLoggedInUserDisplayName(){
  if (isGuestMode()) return "Guest User";
  const configuredName = String(fullConfigData?.Name || state.sessionUser?.display_name || "").trim();
  if (configuredName) return configuredName;
  const sessionUser = String(state.currentUsername || sessionStorage.getItem(SESSION_USERNAME_KEY) || "").trim();
  return sessionUser || "User";
}

function updateUserIdentityUi(){
  const displayName = getLoggedInUserDisplayName();
  if (els.accountMenuUserName) {
    els.accountMenuUserName.textContent = displayName;
  }
  if (els.accountMenuBtn) {
    els.accountMenuBtn.innerHTML = '<i class="fa-solid fa-user" aria-hidden="true"></i>';
    els.accountMenuBtn.title = displayName ? `Account: ${displayName}` : "Account";
    els.accountMenuBtn.setAttribute("aria-label", displayName ? `Account menu for ${displayName}` : "Account menu");
  }
}

function updateGuestModeUi(){
  updateAccessBanner();
  updateWeakPasswordBanner();
  updateUserIdentityUi();
  const guest = isGuestMode();
  const locked = state.trialLocked === true;
  const accountSettingsBtn = document.getElementById("accountSettingsBtn");
  if (accountSettingsBtn) {
    // Keep Account Settings available when locked so users can request renewal
    accountSettingsBtn.classList.toggle("hide", guest);
  }
  const realLoginOnlyControls = [
    els.downloadAllSectionsPdfBtn,
    els.downloadAllDataJsonBtn,
    els.downloadAllDataCsvBtn,
    document.querySelector('label[for="importJsonInput"]'),
    els.importJsonInput,
    els.importCsvInput
  ].filter(Boolean);
  realLoginOnlyControls.forEach(control => {
    control.classList.toggle("hide", guest || locked);
    if ("disabled" in control) control.disabled = guest || locked;
    control.setAttribute("aria-disabled", (guest || locked) ? "true" : "false");
  });
  const bitcoinTab = document.querySelector('.tab[data-tab="bitcoin"]');
  if (bitcoinTab) {
    bitcoinTab.disabled = locked;
    bitcoinTab.classList.toggle("guest-disabled", locked);
    bitcoinTab.setAttribute("aria-disabled", locked ? "true" : "false");
  }
  btcUpdateGuestBitcoinUi();
  updateUploadButtonVisibility();
  updateConnectButtonVisibility();
  renderSecretPinMenu();
  applyPermissionGates();
}

function initFloatingCurrencyBackground(){
  const root = document.getElementById("pageCurrencyBg");
  if (!root) return;
  root.replaceChildren();
  const specs = [
    { type: "aed", cls: "float-currency-aed", html: '<span class="symbol symbol-dirham">~</span>' },
    { type: "sar", cls: "float-currency-sar", html: '<span class="symbol symbol-riyal">$</span>' },
    { type: "pkr", cls: "float-currency-pkr", html: '<span class="symbol">Rs.</span>' },
    { type: "usd", cls: "float-currency-usd", html: '<span class="symbol symbol-dollar">$</span>' },
    { type: "btc", cls: "float-currency-btc", html: '<span class="symbol symbol-bitcoin">₿</span>' }
  ];
  const colorPools = {
    aed: ["rgba(36,87,214,", "rgba(99,140,235,", "rgba(55,105,200,", "rgba(130,160,240,"],
    sar: ["rgba(6,118,71,", "rgba(46,160,110,", "rgba(20,90,65,", "rgba(80,175,120,"],
    pkr: ["rgba(181,71,8,", "rgba(210,110,35,", "rgba(160,85,20,", "rgba(200,95,45,"],
    usd: ["rgba(34,197,94,", "rgba(74,222,128,", "rgba(22,163,74,", "rgba(134,239,172,"],
    btc: ["rgba(251,146,60,", "rgba(254,215,170,", "rgba(249,115,22,", "rgba(253,186,116,"]
  };
  const count = 16;
  for (let i = 0; i < count; i++){
    const spec = specs[i % 5];
    const el = document.createElement("span");
    el.className = `float-currency ${spec.cls}`;
    el.innerHTML = spec.html;
    el.style.left = `${5 + Math.random() * 90}%`;
    el.style.top = `${3 + Math.random() * 88}%`;
    const fsMin = 2.4;
    const fsMax = 9.5;
    el.style.fontSize = `${fsMin + Math.random() * (fsMax - fsMin)}rem`;
    const pool = colorPools[spec.type];
    const alpha = 0.055 + Math.random() * 0.055;
    el.style.color = `${pool[Math.floor(Math.random() * pool.length)]}${alpha})`;
    const dur = 24 + Math.random() * 32;
    el.style.animationDuration = `${dur}s`;
    el.style.animationDelay = `${-Math.random() * dur}s`;
    el.style.animationName = FLOAT_CURRENCY_PATHS[Math.floor(Math.random() * FLOAT_CURRENCY_PATHS.length)];
    root.appendChild(el);
  }
}

function escapeHtml(str){
  return String(str ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[m]));
}

function todayISO(){
  return new Date().toISOString().slice(0,10);
}

function displayDate(value){
  if (!value) return "—";
  const str = String(value);
  if (str.length >= 10) {
    const yyyy = str.slice(0, 4);
    const mm = str.slice(5, 7);
    const dd = str.slice(8, 10);
    if (yyyy && mm && dd && yyyy.length === 4) {
      return `${dd}/${mm}/${yyyy}`;
    }
  }
  return str;
}

function dateStamp(value){
  return TripleMLoanMath.dateStamp(value);
}

/** Strip Excel formula wrappers like ="2024-03-15" or ='2024-03-15' from CSV cells. */
function unwrapCsvDateCell(value){
  let raw = String(value || "").trim();
  if (!raw) return "";
  const formula = raw.match(/^=\s*"([0-9./\-]+)"\s*$/);
  if (formula) raw = formula[1];
  const formula2 = raw.match(/^=\s*'([0-9./\-]+)'\s*$/);
  if (formula2) raw = formula2[1];
  if (raw.startsWith("'")) raw = raw.slice(1);
  return raw.trim();
}

/**
 * Normalize any common date string to YYYY-MM-DD for DB/CSV.
 * Slash dates: if one side > 12, that side is the day.
 * Ambiguous (both ≤ 12): treat as mm/dd/yyyy (Excel US CSV re-exports).
 */
function normalizeDateForDb(value){
  let raw = unwrapCsvDateCell(value);
  if (!raw) return null;

  // Take date part only if datetime
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10);
  }
  const spaceIdx = raw.search(/[\sT]/);
  if (spaceIdx > 0) raw = raw.slice(0, spaceIdx);

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch){
    const a = Number(slashMatch[1]);
    const b = Number(slashMatch[2]);
    const yyyy = slashMatch[3];
    let mm;
    let dd;
    if (a > 12 && b <= 12) {
      // dd/mm/yyyy
      dd = a;
      mm = b;
    } else if (b > 12 && a <= 12) {
      // mm/dd/yyyy
      mm = a;
      dd = b;
    } else {
      // Ambiguous — Excel (US) CSV typically writes mm/dd/yyyy
      mm = a;
      dd = b;
    }
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }

  const dashMatch = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMatch){
    const a = Number(dashMatch[1]);
    const b = Number(dashMatch[2]);
    const yyyy = dashMatch[3];
    let mm;
    let dd;
    if (a > 12 && b <= 12) {
      dd = a;
      mm = b;
    } else if (b > 12 && a <= 12) {
      mm = a;
      dd = b;
    } else {
      mm = a;
      dd = b;
    }
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }

  const dotMatch = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dotMatch){
    // European style: dd.mm.yyyy
    const dd = Number(dotMatch[1]);
    const mm = Number(dotMatch[2]);
    const yyyy = dotMatch[3];
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    // Avoid UTC day-shift for local date-only strings already handled above
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return null;
}

/** Always write ISO YYYY-MM-DD in CSV (Excel-safe formula keeps it from locale conversion). */
function formatCsvDate(value){
  const iso = normalizeDateForDb(value);
  if (!iso) return "";
  // Pre-escaped CSV cell: Excel stores text ISO instead of locale mm/dd or dd/mm
  return `"=""${iso}"""`;
}

function entrySignature(entry){
  const person = String(entry.person_name || "").trim().toLowerCase();
  const notes = String(entry.notes || "").trim().toLowerCase();
  const principal = entry.principal_amount == null || entry.principal_amount === "" ? "" : Number(entry.principal_amount).toFixed(2);
  const action = entry.action_amount == null || entry.action_amount === "" ? "" : Number(entry.action_amount).toFixed(2);
  const loanDate = normalizeDateForDb(entry.loan_date) || "";
  const actionDate = normalizeDateForDb(entry.action_date) || "";
  return [
    String(entry.group_id || "").trim().toLowerCase(),
    String(entry.direction || "").trim().toLowerCase(),
    String(entry.entry_kind || "").trim().toLowerCase(),
    person,
    String(entry.currency || "").trim().toUpperCase(),
    principal,
    action,
    loanDate,
    actionDate,
    notes
  ].join("|");
}

function isEntryInRecycleBin(entryId) {
  return state.recycleBin.some(item => item.id === entryId);
}

function getActiveEntries() {
  const allowedCurrencies = getAllowedCurrencies();
  return state.entries.filter(entry => {
    if (isPageCurrencyPreferenceRow(entry) || isSecretPinPreferenceRow(entry) || isTaxSettingsPreferenceRow(entry)) {
      return false;
    }

    // Filter out recycle bin and deleted entries
    if (isEntryInRecycleBin(entry.id) || hasDeletedTag(entry.notes)) {
      return false;
    }
    
    // Filter out entries with currencies not in allowed list
    if (entry.currency && !allowedCurrencies.includes(normalizeCurrencyCode(entry.currency))) {
      return false;
    }

    if (!entryMatchesPageCurrency(entry)) {
      return false;
    }
    
    return true;
  });
}

function addToRecycleBin(entry) {
  const deletedItem = {
    ...entry,
    deletedAt: new Date().toISOString(),
    originalSection: getEntrySection(entry)
  };
  state.recycleBin.push(deletedItem);
  saveRecycleBinToStorage();
}

function getEntrySection(entry) {
  if (hasExpenseAccountTag(entry.notes)) return 'expenses';
  if (hasGoodsTag(entry.notes)) return 'goods';
  if (entry.direction === 'given') return 'given';
  if (entry.direction === 'taken') return 'taken';
  return 'unknown';
}

function saveRecycleBinToStorage() {
  if (isGuestMode()) {
    clearGuestStorageArtifacts();
    return;
  }
  try {
    localStorage.setItem(recycleBinStorageKey(), JSON.stringify(state.recycleBin));
  } catch (e) {
    console.error('Failed to save recycle bin to storage:', e);
  }
}

function loadRecycleBinFromStorage() {
  if (isGuestMode()) {
    state.recycleBin = [];
    return;
  }
  try {
    const stored = localStorage.getItem(recycleBinStorageKey());
    if (stored) {
      state.recycleBin = JSON.parse(stored);
    } else {
      state.recycleBin = [];
    }
  } catch (e) {
    console.error('Failed to load recycle bin from storage:', e);
    state.recycleBin = [];
  }
}

function getVisibleRecycleBinItems() {
  return state.recycleBin.filter(item => entryMatchesPageCurrency(item));
}

async function restoreFromRecycleBin(entryId) {
  const recycleIndex = state.recycleBin.findIndex(item => item.id === entryId);
  if (recycleIndex === -1) return;

  const deletedItem = state.recycleBin[recycleIndex];
  
  // Remove from recycle bin
  state.recycleBin.splice(recycleIndex, 1);
  saveRecycleBinToStorage();

  // Restore to entries
  if (isBackupMode()) {
    // For backup mode, just add it back to state.entries
    const { deletedAt, originalSection, ...restoredEntry } = deletedItem;
    state.entries.push(restoredEntry);
    refreshBackupView();
    renderAll();
  } else {
    // Clear is_deleted on domain AND remove [DELETED] on ledger (dual-store restore)
    const updatedNotes = removeDeletedTag(deletedItem?.notes || "");
    const { deletedAt, originalSection, ...restoredEntryBase } = deletedItem;
    const restoredEntry = { ...restoredEntryBase, notes: updatedNotes, is_deleted: false };
    state.entries.unshift(restoredEntry);
    const restoreTasks = [];
    if (window.DomainLedger) {
      restoreTasks.push(
        DomainLedger.restoreDomainEntry(restoredEntry).catch(err => {
          console.warn("Restore domain entry skipped/failed.", err);
        })
      );
    }
    restoreTasks.push(
      supabase(`${CONFIG.table}?id=eq.${encodeURIComponent(entryId)}`, {
        method: "PATCH",
        body: JSON.stringify({ notes: updatedNotes })
      }).catch(err => {
        console.warn("Restore ledger entry skipped/failed.", err);
      })
    );
    Promise.all(restoreTasks).finally(() => {
      renderAll();
      renderExpensesList();
    });
  }
  
  renderRecycleBinDropdown();
}

async function permanentDeleteFromRecycleBin(entryId) {
  if (!confirm('Permanently delete this item? This action cannot be undone.')) return;

  const recycleIndex = state.recycleBin.findIndex(item => item.id === entryId);
  if (recycleIndex === -1) return;

  const deletedItem = state.recycleBin[recycleIndex];
  
  // Remove from recycle bin
  state.recycleBin.splice(recycleIndex, 1);
  saveRecycleBinToStorage();

  // Permanently delete from every store dual-read can load
  if (!isBackupMode()) {
    if (window.DomainLedger) {
      await DomainLedger.hardDeleteDomainEntry(deletedItem).catch(err => {
        console.warn("Permanent domain delete skipped/failed.", err);
      });
    }
    await supabase(`${CONFIG.table}?id=eq.${encodeURIComponent(entryId)}`, { method: "DELETE" }).catch(err => {
      console.warn("Permanent ledger delete skipped/failed.", err);
    });
  }
  
  renderRecycleBinDropdown();
}

async function emptyRecycleBin() {
  const items = getVisibleRecycleBinItems();
  if (!items.length) return;

  if (!confirm(`Permanently delete all ${items.length} item${items.length === 1 ? "" : "s"} in the recycle bin? This action cannot be undone.`)) return;

  const emptyBtn = document.getElementById('emptyRecycleBinBtn');
  if (emptyBtn) emptyBtn.disabled = true;

  try {
    if (!isBackupMode()) {
      for (const item of items) {
        if (!item?.id) continue;
        if (window.DomainLedger) {
          await DomainLedger.hardDeleteDomainEntry(item).catch(err => {
            console.warn("Empty-bin domain delete skipped/failed.", err);
          });
        }
        await supabase(`${CONFIG.table}?id=eq.${encodeURIComponent(item.id)}`, { method: "DELETE" }).catch(err => {
          console.warn("Empty-bin ledger delete skipped/failed.", err);
        });
      }
      await loadEntriesFromSupabase();
    }

    const visibleIds = new Set(items.map(item => item.id).filter(Boolean));
    state.recycleBin = state.recycleBin.filter(item => !visibleIds.has(item.id));
    saveRecycleBinToStorage();
    if (isBackupMode()) {
      refreshBackupView();
    }
    renderRecycleBinDropdown();
  } catch (err) {
    alert(`Failed to empty recycle bin: ${err.message || err}`);
    renderRecycleBinDropdown();
  } finally {
    if (emptyBtn) emptyBtn.disabled = getVisibleRecycleBinItems().length === 0;
  }
}

function renderRecycleBinDropdown() {
  // Always update the count badge first, even if dropdown doesn't exist yet
  const visibleItems = getVisibleRecycleBinItems();
  const countBadge = document.getElementById('recycleBinCount');
  if (countBadge) {
    countBadge.textContent = visibleItems.length;
    countBadge.style.display = visibleItems.length > 0 ? 'inline' : 'none';
  }

  const emptyBtn = document.getElementById('emptyRecycleBinBtn');
  if (emptyBtn) {
    emptyBtn.disabled = visibleItems.length === 0;
    emptyBtn.onclick = () => emptyRecycleBin();
  }

  let dropdown = document.getElementById('recycleBinDropdown');
  if (!dropdown) return;

  const itemsContainer = dropdown.querySelector('.recycle-bin-items');
  if (!itemsContainer) return;

  const items = visibleItems;
  
  if (items.length === 0) {
    itemsContainer.innerHTML = '<div class="recycle-bin-empty">Recycle bin is empty</div>';
    return;
  }

  itemsContainer.innerHTML = items.map(item => {
    const section = item.originalSection || 'unknown';
    const name = item.person_name || 'Unknown';
    const amount = item.principal_amount || item.action_amount || 0;
    const currency = item.currency || '';
    const date = displayDate(item.loan_date || item.action_date);
    
    return `
      <div class="recycle-bin-item">
        <div class="recycle-bin-item-info">
          <span class="recycle-bin-item-section">${escapeHtml(section)}</span>
          <span class="recycle-bin-item-name">${escapeHtml(name)}</span>
          <span class="recycle-bin-item-amount">${money(amount, currency)}</span>
          <span class="recycle-bin-item-date">${escapeHtml(date)}</span>
        </div>
        <div class="recycle-bin-item-actions">
          <button class="recycle-bin-restore-btn" data-id="${escapeHtml(item.id)}" title="Restore">
            <i class="fa-solid fa-rotate-left"></i>
          </button>
          <button class="recycle-bin-delete-btn" data-id="${escapeHtml(item.id)}" title="Permanently Delete">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Add event listeners
  itemsContainer.querySelectorAll('.recycle-bin-restore-btn').forEach(btn => {
    btn.addEventListener('click', () => restoreFromRecycleBin(btn.dataset.id));
  });
  
  itemsContainer.querySelectorAll('.recycle-bin-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => permanentDeleteFromRecycleBin(btn.dataset.id));
  });
}

function renderPageCurrencySelector() {
  const selected = getPageCurrencySelection();
  const selectedCurrencies = getSelectedPageCurrencies();
  const selectedSet = new Set(selectedCurrencies);
  const isAllSelected = isPageCurrencyAll();
  const labelText = isAllSelected ? PAGE_CURRENCY_DEFAULT : selectedCurrencies.join("+");
  if (els.pageCurrencyLabel) {
    els.pageCurrencyLabel.innerHTML = isAllSelected
      ? PAGE_CURRENCY_DEFAULT
      : selectedCurrencies.map(currency => currencySymbolHtml(currency)).join("");
  }
  if (els.pageCurrencyBtn) {
    els.pageCurrencyBtn.title = `Page Currency: ${labelText}`;
    els.pageCurrencyBtn.setAttribute("aria-label", `Page Currency: ${labelText}`);
  }
  if (!els.pageCurrencyDropdown) return;

  const menuOptions = getPageCurrencyMenuOptions();
  els.pageCurrencyDropdown.innerHTML = menuOptions.map(currency => {
    const isAll = currency === PAGE_CURRENCY_DEFAULT;
    const active = isAll ? isAllSelected : !isAllSelected && selectedSet.has(currency);
    const symbol = isAll ? "ALL" : currencySymbolHtml(currency);
    const label = isAll ? "All currencies" : currency;
    return `
      <button class="menu-item page-currency-option${active ? " active" : ""}" type="button" data-page-currency="${escapeHtml(currency)}" aria-pressed="${active ? "true" : "false"}">
        <span class="page-currency-option-main">
          <span class="page-currency-option-symbol">${symbol}</span>
          <span>${escapeHtml(label)}</span>
        </span>
        <span class="page-currency-option-check">${active ? '<i class="fa-solid fa-check"></i>' : ""}</span>
      </button>
    `;
  }).join("");

  els.pageCurrencyDropdown.querySelectorAll("[data-page-currency]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      setPageCurrencySelection(btn.dataset.pageCurrency).catch(err => alert(err.message || err));
    });
  });
}

function ensureTaxSettingsModal() {
  let modal = document.getElementById("taxSettingsModal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "taxSettingsModal";
  modal.className = "modal hide";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="modal-backdrop" data-close-modal="taxSettingsModal"></div>
    <div class="modal-dialog">
      <div class="modal-head">
        <div>
          <h3>VAT Settings</h3>
          <p>Default VAT rates for new records. Existing invoices keep their saved VAT.</p>
        </div>
        <button class="icon-btn ghost" type="button" data-close-modal="taxSettingsModal" aria-label="Close">X</button>
      </div>
      <div class="modal-body">
        <form id="taxSettingsForm">
          <div class="vat-settings-body"></div>
          <div class="field w12 modal-footer" style="margin-top:14px;">
            <button class="btn ghost" type="button" data-close-modal="taxSettingsModal">Cancel</button>
            <button class="btn primary" type="submit">Save VAT Settings</button>
          </div>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelectorAll("[data-close-modal]").forEach(btn => btn.addEventListener("click", () => closeModal("taxSettingsModal")));
  modal.querySelector("#taxSettingsForm")?.addEventListener("submit", async e => {
    e.preventDefault();
    await saveTaxSettingsFromModal();
  });
  return modal;
}

function openTaxSettingsModal() {
  const modal = ensureTaxSettingsModal();
  const body = modal.querySelector(".vat-settings-body");
  const settings = cloneTaxSettings(state.taxSettings);
  body.innerHTML = SUPPORTED_CURRENCIES.map(currency => {
    const row = settings[currency] || DEFAULT_TAX_SETTINGS[currency];
    return `
      <div class="vat-settings-row" data-vat-currency="${currency}">
        <span class="vat-settings-currency">${currency}</span>
        <input class="input" name="tax_rate_${currency}" type="number" min="0" max="100" step="0.01" value="${escapeHtml(trimInventoryNumber(row.rate, 2))}" aria-label="${currency} VAT rate" />
        <select class="select" name="tax_mode_${currency}" aria-label="${currency} VAT treatment">
          <option value="ADD" ${normalizeTaxMode(row.mode) === TAX_MODE_ADD ? "selected" : ""}>Add VAT to total</option>
          <option value="INCLUDE" ${normalizeTaxMode(row.mode) === TAX_MODE_INCLUDE ? "selected" : ""}>VAT included in total</option>
        </select>
      </div>
    `;
  }).join("");
  modal.classList.remove("hide");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

async function saveTaxSettingsFromModal() {
  const modal = ensureTaxSettingsModal();
  const form = modal.querySelector("#taxSettingsForm");
  const fd = new FormData(form);
  const next = {};
  SUPPORTED_CURRENCIES.forEach(currency => {
    next[currency] = {
      rate: normalizeTaxRate(fd.get(`tax_rate_${currency}`)),
      mode: normalizeTaxMode(fd.get(`tax_mode_${currency}`))
    };
  });
  try {
    state.taxSettingsSaving = true;
    await saveTaxSettingsPreferenceToDatabase(next);
    closeModal("taxSettingsModal");
    syncGoodsPurchaseTaxDefaults(true);
    syncExpenseTaxDefaults(true);
    renderAll();
  } catch (err) {
    alert(err.message || err);
  } finally {
    state.taxSettingsSaving = false;
  }
}

function syncSectionCurrencyFiltersWithPage() {
  const isAllSelected = isPageCurrencyAll();
  const scopedCurrencies = new Set(getPageScopedCurrencies());
  const forcedSingleCurrency = !isAllSelected && scopedCurrencies.size === 1 ? [...scopedCurrencies][0] : "";
  Object.keys(state.currencyFilter).forEach(key => {
    const current = state.currencyFilter[key] || "All";
    if (forcedSingleCurrency) {
      state.currencyFilter[key] = forcedSingleCurrency;
    } else if (!isAllSelected && scopedCurrencies.size > 1) {
      state.currencyFilter[key] = "All";
    } else if (current !== "All" && !scopedCurrencies.has(normalizeCurrencyCode(current))) {
      state.currencyFilter[key] = "All";
    }
  });
  document.querySelectorAll(".currency-radio").forEach(radio => {
    const filterKey = radio.dataset.currencyFilter;
    const value = radio.value;
    const label = document.querySelector(`label[for="${radio.id}"]`);
    const visible = value === "All"
      ? (isAllSelected || scopedCurrencies.size > 1)
      : scopedCurrencies.has(normalizeCurrencyCode(value));
    radio.style.display = visible ? "" : "none";
    radio.disabled = !visible;
    if (label) label.style.display = visible ? "" : "none";
    radio.checked = (state.currencyFilter[filterKey] || "All") === value;
  });
  document.querySelectorAll(".currency-filter-select").forEach(select => {
    const filterKey = select.dataset.currencyFilter;
    Array.from(select.options).forEach(option => {
      const value = option.value;
      const visible = value === "All"
        ? (isAllSelected || scopedCurrencies.size > 1)
        : scopedCurrencies.has(normalizeCurrencyCode(value));
      option.hidden = !visible;
      option.disabled = !visible;
    });
    const desired = state.currencyFilter[filterKey] || "All";
    const match = Array.from(select.options).find(opt => !opt.disabled && opt.value === desired);
    select.value = match ? desired : "All";
    state.currencyFilter[filterKey] = select.value || "All";
  });
}

function applyPageCurrencySelection(currency) {
  const next = normalizePageCurrencySelection(currency);
  state.pageCurrency = next;
  const selectedCurrencies = getSelectedPageCurrencies();
  if (!isPageCurrencyAll() && selectedCurrencies.length) {
    if (!selectedCurrencies.includes(state.lastCurrency)) {
      state.lastCurrency = selectedCurrencies[0];
    }
  } else {
    const allowedCurrencies = getAllowedCurrencies();
    if (allowedCurrencies.length && !allowedCurrencies.includes(state.lastCurrency)) {
      state.lastCurrency = allowedCurrencies[0];
    }
  }
  syncSectionCurrencyFiltersWithPage();
  updateCurrencySelectElements();
  renderPageCurrencySelector();
}

async function loadPageCurrencyPreferenceFromDatabase() {
  state.pageCurrencyPreferenceId = null;
  if (!runtimeConfig?.supabaseUrl || !runtimeConfig?.supabaseKey) {
    applyPageCurrencySelection(PAGE_CURRENCY_DEFAULT);
    return;
  }

  try {
    const rows = await supabase(systemPreferenceQuery(PAGE_CURRENCY_META_TAG));
    const preferenceRow = preferenceRowsForCurrentUser(rows).find(isPageCurrencyPreferenceRow);
    if (preferenceRow) {
      state.pageCurrencyPreferenceId = preferenceRow.id || null;
      applyPageCurrencySelection(pageCurrencyFromMetaNotes(preferenceRow.notes) || PAGE_CURRENCY_DEFAULT);
    } else {
      applyPageCurrencySelection(PAGE_CURRENCY_DEFAULT);
    }
  } catch (err) {
    console.warn("Page currency preference could not be loaded.", err);
    applyPageCurrencySelection(PAGE_CURRENCY_DEFAULT);
  }
}

async function savePageCurrencyPreferenceToDatabase(currency) {
  if (!runtimeConfig?.supabaseUrl || !runtimeConfig?.supabaseKey) return;
  const selected = normalizePageCurrencySelection(currency);
  const today = todayISO();
  const notes = buildPageCurrencyPreferenceNotes(selected);
  const selectedCurrencies = normalizePageCurrencyList(selected);
  const rowCurrency = selected === PAGE_CURRENCY_DEFAULT ? "AED" : (selectedCurrencies[0] || "AED");

  let preferenceId = state.pageCurrencyPreferenceId;
  if (!preferenceId) {
    const rows = await supabase(systemPreferenceQuery(PAGE_CURRENCY_META_TAG));
    const preferenceRow = preferenceRowsForCurrentUser(rows).find(isPageCurrencyPreferenceRow);
    preferenceId = preferenceRow?.id || null;
    state.pageCurrencyPreferenceId = preferenceId;
  }

  if (preferenceId) {
    await supabase(`${CONFIG.table}?id=eq.${encodeURIComponent(preferenceId)}`, {
      method: "PATCH",
      body: JSON.stringify({ currency: rowCurrency, notes })
    });
    return;
  }

  const rowId = crypto.randomUUID();
  const payload = {
    id: rowId,
    group_id: rowId,
    direction: "taken",
    entry_kind: "principal",
    person_name: "SYSTEM",
    currency: rowCurrency,
    principal_amount: 0,
    action_amount: null,
    loan_date: today,
    action_date: null,
    notes,
    created_at: new Date().toISOString()
  };
  const result = await supabase(CONFIG.table, { method: "POST", body: JSON.stringify(payload) });
  state.pageCurrencyPreferenceId = Array.isArray(result) && result[0]?.id ? result[0].id : rowId;
}

async function setPageCurrencySelection(currency) {
  const allowed = new Set(getAllowedCurrencies());
  const chosenRaw = normalizePageCurrencySelection(currency);
  // Ignore taps on currencies the user is not allowed to use
  if (chosenRaw !== PAGE_CURRENCY_DEFAULT && !allowed.has(chosenRaw)) {
    renderPageCurrencySelector();
    return;
  }
  const chosen = chosenRaw;
  let selected = chosen;
  if (chosen !== PAGE_CURRENCY_DEFAULT) {
    const current = isPageCurrencyAll() ? [] : normalizePageCurrencyList(state.pageCurrency);
    const nextSet = new Set(current.filter(c => allowed.has(c)));
    if (nextSet.has(chosen)) {
      nextSet.delete(chosen);
    } else {
      nextSet.add(chosen);
    }
    selected = nextSet.size ? [...nextSet].join(",") : PAGE_CURRENCY_DEFAULT;
  }
  applyPageCurrencySelection(selected);
  if (chosen === PAGE_CURRENCY_DEFAULT) {
    document.querySelectorAll(".menu-dropdown.open").forEach(panel => panel.classList.remove("open"));
    document.querySelectorAll(".menu-trigger[aria-expanded='true']").forEach(trigger => trigger.setAttribute("aria-expanded", "false"));
  }

  try {
    state.pageCurrencySaving = true;
    await savePageCurrencyPreferenceToDatabase(selected);
    if (isBackupMode()) {
      renderAll();
    } else {
      resetLazyDataState({ clearEntries: true });
      state.dataSource = "supabase";
      await ensureTabDataLoaded(getActiveTabKey(), { force: true });
      state.bitcoinWalletsLoaded = false;
      if (getActiveTabKey() === "bitcoin") {
        await loadBitcoinWalletsFromDatabase({ force: true });
      }
    }
  } finally {
    state.pageCurrencySaving = false;
    renderPageCurrencySelector();
    renderRecycleBinDropdown();
  }
}

function validateSecretPinValue(pin) {
  return /^(\d{4}|\d{6})$/.test(String(pin || "").trim());
}

async function hashSecretPin(pin) {
  if (!window.crypto?.subtle) {
    throw new Error("Secure Smart Pin storage is not available in this browser.");
  }
  const username = String(state.currentUsername || sessionStorage.getItem(SESSION_USERNAME_KEY) || "user").trim().toLowerCase();
  const text = `${SECRET_PIN_HASH_CONTEXT}:${username}:${String(pin || "").trim()}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return bytesToHex(new Uint8Array(digest));
}

async function verifySecretPin(pin) {
  if (!state.secretPinHash) return true;
  if (!validateSecretPinValue(pin)) return false;
  return (await hashSecretPin(pin)) === state.secretPinHash;
}

function renderSecretPinMenu() {
  if (isGuestMode()) {
    if (els.secretPinBtn) els.secretPinBtn.classList.add("hide");
    if (els.deleteSmartPinBtn) els.deleteSmartPinBtn.classList.add("hide");
    if (els.companyTeamBtn) els.companyTeamBtn.classList.add("hide");
    return;
  }
  if (els.secretPinBtn) {
    els.secretPinBtn.classList.remove("hide");
    els.secretPinBtn.textContent = state.secretPinHash ? "Change Smart Pin" : "Set Smart Pin";
  }
  if (els.deleteSmartPinBtn) {
    els.deleteSmartPinBtn.classList.toggle("hide", !state.secretPinHash);
  }
  if (els.companyTeamBtn) {
    // Activity log + team management: main company account (or manage-team member for members only — activity is owner-only)
    const showTeam = isTeamOwnerAccount() || canManageCompanyTeam();
    els.companyTeamBtn.classList.toggle("hide", !showTeam);
    if (showTeam) {
      els.companyTeamBtn.innerHTML = `<i class="fa-solid fa-users"></i> Company Team`;
    }
  }
}

async function loadSecretPinPreferenceFromDatabase() {
  state.secretPinPreferenceId = null;
  state.secretPinHash = "";
  state.secretPinVerified = false;
  if (!runtimeConfig?.supabaseUrl || !runtimeConfig?.supabaseKey) {
    renderSecretPinMenu();
    return;
  }

  try {
    // Primary: dedicated app_users column (works on every device)
    const status = await supabaseRpc("app_get_smart_pin_status", {});
    const hash = String(status?.smart_pin_hash || "").trim().toLowerCase();
    if (hash && /^[a-f0-9]{64}$/.test(hash)) {
      state.secretPinHash = hash;
      if (state.sessionUser) {
        state.sessionUser.smart_pin_hash = hash;
        state.sessionUser.smart_pin_enabled = true;
      }
      renderSecretPinMenu();
      return;
    }

    // Legacy fallback: SYSTEM preference row in the ledger (pre-migration 006)
    const rows = await supabase(systemPreferenceQuery([SECRET_PIN_HASH_TAG, SMART_PIN_DISABLED_META_TAG]));
    const pinRow = preferenceRowsForCurrentUser(rows).find(row =>
      isSecretPinPreferenceRow(row) && !!secretPinHashFromMetaNotes(row.notes)
    );
    if (pinRow) {
      const legacyHash = secretPinHashFromMetaNotes(pinRow.notes);
      state.secretPinPreferenceId = pinRow.id || null;
      state.secretPinHash = legacyHash;
      if (legacyHash) {
        // Promote legacy pin into app_users so other devices see it next login
        try {
          // Cannot re-hash without the pin; keep using legacy hash via status after user re-sets.
          // If profile already empty, leave legacy in memory for this session.
          if (state.sessionUser) state.sessionUser.smart_pin_hash = legacyHash;
        } catch (_) { /* ignore */ }
      }
    }
  } catch (err) {
    console.warn("Smart Pin preference could not be loaded.", err);
  }
  renderSecretPinMenu();
}

async function saveSecretPinPreferenceToDatabase(pin) {
  if (!runtimeConfig?.supabaseUrl || !runtimeConfig?.supabaseKey) {
    throw new Error("Database is not connected. Smart Pin cannot be saved.");
  }
  if (!validateSecretPinValue(pin)) {
    throw new Error("Smart Pin must be exactly 4 or 6 digits.");
  }

  const result = await supabaseRpc("app_set_smart_pin", { p_pin: String(pin).trim() });
  const pinHash = String(result?.smart_pin_hash || await hashSecretPin(pin)).trim().toLowerCase();
  state.secretPinHash = pinHash;
  state.secretPinVerified = true;
  if (state.sessionUser) {
    state.sessionUser.smart_pin_hash = pinHash;
    state.sessionUser.smart_pin_enabled = true;
  }
  renderSecretPinMenu();
}

function ensureSmartPinManageModal() {
  let modal = document.getElementById("smartPinManageModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "smartPinManageModal";
  modal.className = "modal hide secret-pin-modal";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-dialog secret-pin-dialog">
      <div class="modal-head">
        <div>
          <h3 id="smartPinManageTitle">Set Smart Pin</h3>
          <p id="smartPinManageDescription">Choose a 4 or 6 digit Smart Pin.</p>
        </div>
      </div>
      <div class="modal-body">
        <form id="smartPinManageForm">
          <div class="modal-grid">
            <div class="field w12 hide" id="smartPinExistingField">
              <label>Existing Smart Pin</label>
              <input id="smartPinExistingInput" class="input" type="password" inputmode="numeric" maxlength="6" autocomplete="current-password" placeholder="4 or 6 digits" />
            </div>
            <div class="field w12" id="smartPinNewField">
              <label>New Smart Pin</label>
              <input id="smartPinNewInput" class="input" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" placeholder="4 or 6 digits" />
            </div>
            <div class="field w12" id="smartPinConfirmField">
              <label>Confirm Smart Pin</label>
              <input id="smartPinConfirmInput" class="input" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" placeholder="Repeat Smart Pin" />
            </div>
            <div class="field w12">
              <div id="smartPinManageError" class="secret-pin-error"></div>
            </div>
            <div class="field w12 modal-footer secret-pin-actions">
              <button class="btn ghost" id="smartPinManageCancelBtn" type="button">Cancel</button>
              <button class="btn primary" id="smartPinManageSubmitBtn" type="submit">Set Smart Pin</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function openSmartPinManageModal(mode) {
  const modal = ensureSmartPinManageModal();
  document.body.appendChild(modal);

  const config = {
    set: {
      title: "Set Smart Pin",
      description: "Choose a 4 or 6 digit Smart Pin.",
      submit: "Set Smart Pin"
    },
    change: {
      title: "Change Smart Pin",
      description: "Enter your existing Smart Pin, then choose a new one.",
      submit: "Change Smart Pin"
    },
    reset: {
      title: "Reset Smart Pin",
      description: "Choose a new 4 or 6 digit Smart Pin.",
      submit: "Reset Smart Pin"
    },
    delete: {
      title: "Delete Smart Pin",
      description: "Enter your existing Smart Pin to remove it. Your data will load normally afterward.",
      submit: "Delete Smart Pin"
    }
  }[mode] || {};

  const form = modal.querySelector("#smartPinManageForm");
  const title = modal.querySelector("#smartPinManageTitle");
  const description = modal.querySelector("#smartPinManageDescription");
  const existingField = modal.querySelector("#smartPinExistingField");
  const newField = modal.querySelector("#smartPinNewField");
  const confirmField = modal.querySelector("#smartPinConfirmField");
  const existingInput = modal.querySelector("#smartPinExistingInput");
  const newInput = modal.querySelector("#smartPinNewInput");
  const confirmInput = modal.querySelector("#smartPinConfirmInput");
  const error = modal.querySelector("#smartPinManageError");
  const cancelBtn = modal.querySelector("#smartPinManageCancelBtn");
  const submitBtn = modal.querySelector("#smartPinManageSubmitBtn");
  const backdrop = modal.querySelector(".modal-backdrop");
  const needsExistingPin = mode === "change" || mode === "delete";
  const needsNewPin = mode !== "delete";
  const previousOverflow = document.body.style.overflow;

  title.textContent = config.title || "Smart Pin";
  description.textContent = config.description || "";
  submitBtn.textContent = config.submit || "Save";
  submitBtn.classList.toggle("danger", mode === "delete");
  existingField.classList.toggle("hide", !needsExistingPin);
  newField.classList.toggle("hide", !needsNewPin);
  confirmField.classList.toggle("hide", !needsNewPin);
  existingInput.value = "";
  newInput.value = "";
  confirmInput.value = "";
  error.textContent = "";

  const inputs = [existingInput, newInput, confirmInput];
  const cleanNumericInput = input => {
    input.value = String(input.value || "").replace(/\D/g, "").slice(0, 6);
  };
  inputs.forEach(input => {
    input.oninput = () => cleanNumericInput(input);
  });

  modal.classList.remove("hide");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  setTimeout(() => (needsExistingPin ? existingInput : newInput).focus(), 50);

  return new Promise(resolve => {
    const finish = value => {
      modal.classList.add("hide");
      modal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = previousOverflow;
      form.onsubmit = null;
      cancelBtn.onclick = null;
      backdrop.onclick = null;
      inputs.forEach(input => { input.oninput = null; });
      resolve(value);
    };

    form.onsubmit = async e => {
      e.preventDefault();
      error.textContent = "";

      if (needsExistingPin) {
        const existingPin = String(existingInput.value || "").trim();
        if (!validateSecretPinValue(existingPin)) {
          error.textContent = "Existing Smart Pin must be exactly 4 or 6 digits.";
          existingInput.focus();
          return;
        }
        if (!(await verifySecretPin(existingPin))) {
          error.textContent = "Existing Smart Pin is incorrect.";
          existingInput.focus();
          return;
        }
      }

      if (!needsNewPin) {
        finish({ deletePin: true, pin: String(existingInput.value || "").trim() });
        return;
      }

      const newPin = String(newInput.value || "").trim();
      const confirmPin = String(confirmInput.value || "").trim();
      if (!validateSecretPinValue(newPin)) {
        error.textContent = "Smart Pin must be exactly 4 or 6 digits.";
        newInput.focus();
        return;
      }
      if (newPin !== confirmPin) {
        error.textContent = "Smart Pin confirmation does not match.";
        confirmInput.focus();
        return;
      }

      finish({ pin: newPin });
    };

    cancelBtn.onclick = () => finish(null);
    backdrop.onclick = () => finish(null);
  });
}

async function getExpenseWalletChallengeData() {
  const rows = await supabase(`${CONFIG.table}?select=person_name,currency,notes,owner_id&direction=eq.taken&entry_kind=eq.principal${ownerIdQuery()}&order=created_at.desc`);
  const wallets = filterRowsForCurrentUser(rows)
    .filter(row => hasExpenseAccountTag(row.notes))
    .filter(row => entryMatchesPageCurrency(row));
  return {
    count: wallets.length,
    names: new Set(wallets.map(row => String(row.person_name || "").trim().toLowerCase()).filter(Boolean))
  };
}

async function handleForgotSecretPin() {
  const answerCount = prompt("How many wallets do you have in the Expenses tab?");
  if (answerCount === null) return false;
  const answerName = prompt("Enter the name of any existing wallet.");
  if (answerName === null) return false;

  const challenge = await getExpenseWalletChallengeData();
  const countOk = Number.parseInt(String(answerCount || "").trim(), 10) === challenge.count;
  const nameOk = challenge.names.has(String(answerName || "").trim().toLowerCase());
  if (!countOk || !nameOk) {
    alert("The answers are wrong.");
    return false;
  }

  const result = await openSmartPinManageModal("reset");
  if (!result?.pin) return false;
  await saveSecretPinPreferenceToDatabase(result.pin);
  alert("Smart Pin updated successfully.");
  return true;
}

async function handleSecretPinMenuAction() {
  document.querySelectorAll(".menu-dropdown.open").forEach(panel => panel.classList.remove("open"));
  document.querySelectorAll(".menu-trigger[aria-expanded='true']").forEach(trigger => trigger.setAttribute("aria-expanded", "false"));

  try {
    const mode = state.secretPinHash ? "change" : "set";
    const result = await openSmartPinManageModal(mode);
    if (!result?.pin) return;
    await saveSecretPinPreferenceToDatabase(result.pin);
    alert(mode === "change" ? "Smart Pin changed successfully." : "Smart Pin set successfully.");
  } catch (err) {
    alert(err.message || err);
  }
}

async function deleteSecretPinPreferenceFromDatabase(pin) {
  if (!runtimeConfig?.supabaseUrl || !runtimeConfig?.supabaseKey) {
    throw new Error("Database is not connected. Smart Pin cannot be deleted.");
  }
  if (!validateSecretPinValue(pin)) {
    throw new Error("Smart Pin must be exactly 4 or 6 digits.");
  }

  await supabaseRpc("app_clear_smart_pin", { p_pin: String(pin).trim() });
  state.secretPinPreferenceId = null;
  state.secretPinHash = "";
  state.secretPinVerified = true;
  if (state.sessionUser) {
    state.sessionUser.smart_pin_hash = "";
    state.sessionUser.smart_pin_enabled = false;
  }
  renderSecretPinMenu();
}

async function handleDeleteSmartPinAction() {
  document.querySelectorAll(".menu-dropdown.open").forEach(panel => panel.classList.remove("open"));
  document.querySelectorAll(".menu-trigger[aria-expanded='true']").forEach(trigger => trigger.setAttribute("aria-expanded", "false"));

  if (!state.secretPinHash) return;

  try {
    const result = await openSmartPinManageModal("delete");
    if (!result?.deletePin || !result?.pin) return;
    await deleteSecretPinPreferenceFromDatabase(result.pin);
    alert("Smart Pin deleted successfully.");
  } catch (err) {
    alert(err.message || err);
  }
}

function ensureSecretPinModal() {
  let modal = document.getElementById("secretPinGateModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "secretPinGateModal";
  modal.className = "modal hide secret-pin-modal";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-dialog secret-pin-dialog">
      <div class="modal-head">
        <div>
          <h3>Smart Pin</h3>
          <p>Enter your Smart Pin to load your data.</p>
        </div>
      </div>
      <div class="modal-body">
        <form id="secretPinGateForm">
          <div class="modal-grid">
            <div class="field w12">
              <label>Smart Pin</label>
              <input id="secretPinGateInput" class="input" type="password" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="4 or 6 digits" />
              <div id="secretPinGateError" class="secret-pin-error"></div>
            </div>
            <div class="field w12 modal-footer secret-pin-actions secret-pin-gate-actions">
              <button class="btn primary" id="secretPinUnlockBtn" type="submit">Unlock</button>
              <div class="secret-pin-text-actions">
                <button class="secret-pin-text-btn" id="secretPinForgotBtn" type="button">Forgot Smart Pin</button>
                <button class="secret-pin-text-btn" id="secretPinGateLogoutBtn" type="button">Logout</button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function requestSecretPinUnlock() {
  if (!state.secretPinHash) {
    state.secretPinVerified = true;
    return Promise.resolve(true);
  }

  const modal = ensureSecretPinModal();
  const form = modal.querySelector("#secretPinGateForm");
  const input = modal.querySelector("#secretPinGateInput");
  const error = modal.querySelector("#secretPinGateError");
  const forgotBtn = modal.querySelector("#secretPinForgotBtn");
  const logoutBtn = modal.querySelector("#secretPinGateLogoutBtn");

  modal.classList.remove("hide");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  input.value = "";
  error.textContent = "";
  setTimeout(() => input.focus(), 50);

  return new Promise(resolve => {
    const finish = (ok) => {
      modal.classList.add("hide");
      modal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
      form.onsubmit = null;
      forgotBtn.onclick = null;
      logoutBtn.onclick = null;
      resolve(ok);
    };

    form.onsubmit = async e => {
      e.preventDefault();
      const pin = String(input.value || "").trim();
      if (!validateSecretPinValue(pin)) {
        error.textContent = "Smart Pin must be exactly 4 or 6 digits.";
        return;
      }
      if (!(await verifySecretPin(pin))) {
        error.textContent = "Smart Pin is incorrect.";
        return;
      }
      state.secretPinVerified = true;
      finish(true);
    };

    forgotBtn.onclick = async () => {
      try {
        const ok = await handleForgotSecretPin();
        if (ok) finish(true);
      } catch (err) {
        error.textContent = err.message || String(err);
      }
    };

    logoutBtn.onclick = () => {
      finish(false);
      doLogout();
    };
  });
}

function ensureSmartPinConfirmModal() {
  let modal = document.getElementById("smartPinConfirmModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "smartPinConfirmModal";
  modal.className = "modal hide secret-pin-modal smart-pin-confirm-modal";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-dialog secret-pin-dialog smart-pin-confirm-dialog">
      <div class="smart-pin-confirm-head">
        <div class="smart-pin-confirm-icon"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i></div>
        <div class="smart-pin-confirm-head-text">
          <h3 id="smartPinConfirmTitle">Confirm action</h3>
          <p id="smartPinConfirmDescription"></p>
        </div>
      </div>
      <div class="modal-body smart-pin-confirm-body">
        <div id="smartPinConfirmSetupNotice" class="smart-pin-confirm-setup hide">
          <p>You need to set a Smart Pin before you can do this.</p>
          <button type="button" class="btn primary" id="smartPinConfirmSetupBtn">Set Smart Pin</button>
        </div>
        <form id="smartPinConfirmForm">
          <div class="modal-grid">
            <div class="field w12">
              <label>Smart Pin</label>
              <input id="smartPinConfirmInput" class="input" type="password" inputmode="numeric" maxlength="6" autocomplete="current-password" placeholder="4 or 6 digits" />
              <div id="smartPinConfirmError" class="secret-pin-error"></div>
            </div>
            <div class="field w12 modal-footer secret-pin-actions smart-pin-confirm-actions">
              <button class="btn ghost" id="smartPinConfirmCancelBtn" type="button">Cancel</button>
              <button class="btn danger" id="smartPinConfirmSubmitBtn" type="submit">Confirm</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function requireSmartPinConfirm(options = {}) {
  const {
    title = "Confirm action",
    description = "Enter your Smart Pin to confirm this action.",
    confirmLabel = "Confirm",
    accent = "danger"
  } = options;

  const modal = ensureSmartPinConfirmModal();
  const head = modal.querySelector(".smart-pin-confirm-head");
  const icon = modal.querySelector(".smart-pin-confirm-icon i");
  const titleEl = modal.querySelector("#smartPinConfirmTitle");
  const descEl = modal.querySelector("#smartPinConfirmDescription");
  const setupNotice = modal.querySelector("#smartPinConfirmSetupNotice");
  const setupBtn = modal.querySelector("#smartPinConfirmSetupBtn");
  const form = modal.querySelector("#smartPinConfirmForm");
  const input = modal.querySelector("#smartPinConfirmInput");
  const error = modal.querySelector("#smartPinConfirmError");
  const cancelBtn = modal.querySelector("#smartPinConfirmCancelBtn");
  const submitBtn = modal.querySelector("#smartPinConfirmSubmitBtn");
  const backdrop = modal.querySelector(".modal-backdrop");
  const previousOverflow = document.body.style.overflow;

  titleEl.textContent = title;
  descEl.textContent = description;
  submitBtn.textContent = confirmLabel;
  submitBtn.className = `btn ${accent === "danger" ? "danger" : "primary"}`;
  head.classList.toggle("is-danger", accent === "danger");
  if (icon) icon.className = accent === "danger" ? "fa-solid fa-triangle-exclamation" : "fa-solid fa-shield-halved";
  error.textContent = "";
  input.value = "";

  const needsSetup = !state.secretPinHash;
  setupNotice.classList.toggle("hide", !needsSetup);
  form.classList.toggle("hide", needsSetup);

  modal.classList.remove("hide");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  if (!needsSetup) {
    setTimeout(() => input.focus(), 50);
  }

  return new Promise(resolve => {
    const onKeydown = e => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish(false);
      }
    };

    const finish = value => {
      modal.classList.add("hide");
      modal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = previousOverflow;
      form.onsubmit = null;
      cancelBtn.onclick = null;
      backdrop.onclick = null;
      setupBtn.onclick = null;
      document.removeEventListener("keydown", onKeydown);
      resolve(value);
    };

    document.addEventListener("keydown", onKeydown);

    if (needsSetup) {
      setupBtn.onclick = async () => {
        try {
          const result = await openSmartPinManageModal("set");
          if (result?.pin) {
            await saveSecretPinPreferenceToDatabase(result.pin);
            alert("Smart Pin set successfully. Please try again.");
          }
        } catch (err) {
          alert(err.message || err);
        }
        finish(false);
      };
      cancelBtn.onclick = () => finish(false);
      backdrop.onclick = () => finish(false);
      return;
    }

    form.onsubmit = async e => {
      e.preventDefault();
      const pin = String(input.value || "").trim();
      if (!validateSecretPinValue(pin)) {
        error.textContent = "Smart Pin must be exactly 4 or 6 digits.";
        return;
      }
      submitBtn.disabled = true;
      try {
        const ok = await verifySecretPin(pin);
        if (!ok) {
          error.textContent = "Smart Pin is incorrect.";
          input.value = "";
          input.focus();
          return;
        }
        finish(true);
      } finally {
        submitBtn.disabled = false;
      }
    };

    cancelBtn.onclick = () => finish(false);
    backdrop.onclick = () => finish(false);
  });
}

function getSupabaseConfig(){
  if (!runtimeConfig?.supabaseUrl || !runtimeConfig?.supabaseKey){
    runtimeConfig = getEmbeddedSupabaseConfig();
  }
  if (!runtimeConfig?.supabaseUrl || !runtimeConfig?.supabaseKey){
    throw new Error("Supabase config is unavailable.");
  }
  return runtimeConfig;
}

async function supabaseRpc(fnName, args = {}, options = {}){
  return supabase(`rpc/${fnName}`, {
    method: "POST",
    body: JSON.stringify(args),
    ...options,
    headers: {
      ...(options.headers || {}),
      Prefer: "return=representation"
    }
  });
}

/** Normalize PostgREST RPC payloads (object, single-element array, or JSON string). */
function unwrapRpcJson(data){
  let value = data;
  for (let i = 0; i < 3; i += 1) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return null;
      try { value = JSON.parse(trimmed); } catch (_) { return data; }
      continue;
    }
    if (Array.isArray(value)) {
      if (!value.length) return null;
      value = value.length === 1 ? value[0] : value;
      if (Array.isArray(value)) return value;
      continue;
    }
    break;
  }
  return value;
}

async function logCompanyActivity(action, module, summary, extra = {}){
  if (isGuestMode() || !state.sessionUser) return;
  if (!isTeamOwnerAccount() && !isTeamMemberAccount()) return;
  try {
    await supabaseRpc("app_team_log_activity", {
      p_action: String(action || "activity").slice(0, 64),
      p_module: String(module || "").slice(0, 64) || null,
      p_summary: String(summary || "Activity").slice(0, 280),
      p_entity_type: extra.entityType || null,
      p_entity_id: extra.entityId ? String(extra.entityId) : null,
      p_meta: extra.meta || {}
    });
  } catch (e) { console.warn("Activity log failed", e); }
}

function activityModuleForEntry(entry){
  if (!entry) return "ledger";
  if (hasGoodsTag(entry.notes)) return "inventory";
  if (hasExpenseAccountTag(entry.notes)) return "expenses";
  if (hasInstallmentTag(entry.notes)) return "installments";
  if (entry.direction === "given" || entry.direction === "taken") return "loans";
  return "ledger";
}

function activitySummaryForEntry(entry, verb = "Saved"){
  if (!entry) return verb;
  const name = entry.person_name || "record";
  const currency = entry.currency || "";
  if (hasExpenseAccountTag(entry.notes)) {
    const meta = expenseMetaFromNotes(entry.notes);
    if (meta.rowType === "ACCOUNT" || entry.entry_kind === "principal") {
      return `${verb} wallet "${name}" (${moneyText(entry.principal_amount || 0, currency)})`;
    }
    if (meta.rowType === "TOPUP" || (meta.expenseType || "").toLowerCase() === "transfer" && meta.rowType === "TOPUP") {
      return `${verb} top-up on "${name}" (${moneyText(entry.action_amount || 0, currency)})`;
    }
    if ((meta.expenseType || "").toLowerCase() === "transfer") {
      return `${verb} transfer involving "${name}" (${moneyText(entry.action_amount || 0, currency)})`;
    }
    return `${verb} expense on "${name}" (${moneyText(entry.action_amount || 0, currency)})`;
  }
  if (hasGoodsTag(entry.notes)) {
    const meta = goodsMetaFromNotes(entry.notes);
    if (entry.entry_kind === "principal") {
      return `${verb} inventory item "${name}" (${moneyText(entry.principal_amount || 0, currency)})`;
    }
    return `${verb} sale "${name}" qty ${meta.soldQty || "?"} (${moneyText(entry.action_amount || 0, currency)})`;
  }
  if (hasInstallmentTag(entry.notes)) {
    if (entry.entry_kind === "principal") {
      return `${verb} installment plan "${name}" (${moneyText(entry.principal_amount || 0, currency)})`;
    }
    return `${verb} installment payment "${name}" (${moneyText(entry.action_amount || 0, currency)})`;
  }
  if (entry.entry_kind === "principal") {
    const dir = entry.direction === "given" ? "loan given" : "loan taken";
    return `${verb} ${dir} "${name}" (${moneyText(entry.principal_amount || 0, currency)})`;
  }
  return `${verb} payment "${name}" (${moneyText(entry.action_amount || 0, currency)})`;
}

function logEntriesCreated(entries){
  asEntryArray(entries).forEach(entry => {
    logCompanyActivity("create", activityModuleForEntry(entry), activitySummaryForEntry(entry, "Created"), {
      entityType: entry.entry_kind || "entry",
      entityId: entry.id || entry.group_id
    });
  });
}

function logEntryUpdated(entry){
  if (!entry) return;
  logCompanyActivity("edit", activityModuleForEntry(entry), activitySummaryForEntry(entry, "Updated"), {
    entityType: entry.entry_kind || "entry",
    entityId: entry.id
  });
}

function logEntryDeleted(entry, label = "Deleted"){
  if (!entry) return;
  logCompanyActivity("delete", activityModuleForEntry(entry), activitySummaryForEntry(entry, label), {
    entityType: entry.entry_kind || "entry",
    entityId: entry.id || entry.group_id
  });
}

const COMPANY_TEAM_PERMISSION_FIELDS = [
  ["can_edit_entries", "Edit entries"],
  ["can_delete_entries", "Delete entries"],
  ["can_edit_invoices", "Edit invoices"],
  ["can_delete_invoices", "Delete invoices"],
  ["can_manage_team", "Manage team"]
];

function companyTeamPermCheckboxesHtml(idPrefix, values = {}){
  return COMPANY_TEAM_PERMISSION_FIELDS.map(([key, label]) => `
    <label class="admin-check-item">
      <input type="checkbox" id="${idPrefix}${key}" data-perm="${key}" ${values[key] ? "checked" : ""} />
      ${escapeHtml(label)}
    </label>
  `).join("");
}

function readCompanyTeamPermCheckboxes(idPrefix){
  const permissions = {};
  COMPANY_TEAM_PERMISSION_FIELDS.forEach(([key]) => {
    permissions[key] = !!document.getElementById(`${idPrefix}${key}`)?.checked;
  });
  return permissions;
}

function resetCompanyTeamAddPermDefaults(modal){
  COMPANY_TEAM_PERMISSION_FIELDS.forEach(([key]) => {
    const input = modal.querySelector(`#teamAdd${key}`);
    if (!input) return;
    input.checked = key === "can_edit_entries" || key === "can_edit_invoices";
  });
}

function ensureCompanyTeamModal(){
  let modal = document.getElementById("companyTeamModal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "companyTeamModal";
  modal.className = "modal hide";
  modal.setAttribute("aria-hidden", "true");
  document.body.appendChild(modal);
  return modal;
}

function closeCompanyTeamModal(){
  const modal = document.getElementById("companyTeamModal");
  if (!modal || modal.classList.contains("hide")) return;
  modal.classList.add("hide");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function isCompanyTeamModalOpen(){
  const modal = document.getElementById("companyTeamModal");
  return !!modal && !modal.classList.contains("hide");
}

async function openCompanyTeamModal(){
  const canManage = canManageCompanyTeam();
  const canViewActivity = isTeamOwnerAccount();
  if (!canManage && !canViewActivity) {
    alert("Company team is only available on the main company account (or members with manage-team permission).");
    return;
  }
  const modal = ensureCompanyTeamModal();
  const defaultTab = canManage ? "members" : "activity";
  const showTabs = canManage && canViewActivity;
  modal._activityOffset = 0;
  modal._activityLimit = 50;
  modal._activityTotal = 0;
  modal.innerHTML = `
    <div class="modal-backdrop" data-team-modal-close></div>
    <div class="modal-dialog admin-modal-dialog company-team-dialog">
      <div class="modal-head">
        <div>
          <h3>Company Team</h3>
          <p>${canManage
            ? (canViewActivity
              ? "Invite members, set permissions, and review every action across the company account."
              : "Invite sub-users and set edit/delete rights for this company account.")
            : "Activity across the company account and all team members."}</p>
        </div>
        <button type="button" class="btn ghost tiny" data-team-modal-close aria-label="Close">✕</button>
      </div>
      <div class="modal-body company-team-body">
        ${showTabs ? `
        <div class="company-team-tabs" role="tablist">
          <button type="button" class="company-team-tab ${defaultTab === "members" ? "is-active" : ""}" data-team-tab="members" role="tab" aria-selected="${defaultTab === "members" ? "true" : "false"}">Members</button>
          <button type="button" class="company-team-tab ${defaultTab === "activity" ? "is-active" : ""}" data-team-tab="activity" role="tab" aria-selected="${defaultTab === "activity" ? "true" : "false"}">Activity</button>
        </div>` : ""}
        ${canManage ? `
        <div class="company-team-panel ${defaultTab === "members" ? "" : "hide"}" data-team-panel="members">
          <div class="company-team-add">
            <div class="company-team-add-head">
              <h4 class="admin-section-title">Add team member</h4>
              <span id="companyTeamSeats" class="company-team-seats"></span>
            </div>
            <form id="companyTeamAddForm" class="admin-form-grid">
              <div class="form-group">
                <label class="form-label">Username</label>
                <input id="teamAddUsername" class="input" autocomplete="off" required />
              </div>
              <div class="form-group">
                <label class="form-label">Display name</label>
                <input id="teamAddDisplayName" class="input" autocomplete="off" />
              </div>
              <div class="form-group">
                <label class="form-label">Password</label>
                <input id="teamAddPassword" class="input" type="password" autocomplete="new-password" placeholder="8+ chars, upper, lower, number" required />
              </div>
              <div class="form-group" style="grid-column:1/-1">
                <label class="form-label">Permissions</label>
                <div class="company-team-perm-grid">
                  ${companyTeamPermCheckboxesHtml("teamAdd", { can_edit_entries: true, can_edit_invoices: true })}
                </div>
              </div>
              <div class="form-group company-team-add-footer" style="grid-column:1/-1">
                <div id="companyTeamAddError" class="lock-error"></div>
                <button type="submit" class="btn primary tiny"><i class="fa-solid fa-user-plus"></i> Add member</button>
              </div>
            </form>
          </div>
          <h4 class="admin-section-title company-team-members-title">Team members</h4>
          <div id="companyTeamMembersList" class="company-team-list"><div class="empty"><i class="fa-solid fa-spinner btn-loader"></i> Loading members…</div></div>
        </div>` : ""}
        ${canViewActivity ? `
        <div class="company-team-panel ${defaultTab === "activity" ? "" : "hide"}" data-team-panel="activity">
          <div class="company-team-activity-toolbar">
            <span id="companyTeamActivityCount" class="company-team-activity-count">Activity</span>
            <button type="button" class="company-team-activity-icon-btn" data-activity-refresh title="Refresh" aria-label="Refresh activity">
              <i class="fa-solid fa-rotate"></i>
            </button>
          </div>
          <div id="companyTeamActivityList" class="company-team-activity-list"><div class="empty tiny"><i class="fa-solid fa-spinner btn-loader"></i> Loading…</div></div>
          <div class="company-team-activity-pager">
            <button type="button" class="company-team-activity-icon-btn" data-activity-prev title="Previous" aria-label="Previous page"><i class="fa-solid fa-chevron-left"></i></button>
            <span id="companyTeamActivityPage" class="company-team-activity-page">—</span>
            <button type="button" class="company-team-activity-icon-btn" data-activity-next title="Next" aria-label="Next page"><i class="fa-solid fa-chevron-right"></i></button>
          </div>
        </div>` : ""}
      </div>
    </div>
  `;
  modal.classList.remove("hide");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  modal.querySelectorAll("[data-team-modal-close]").forEach(el => {
    el.onclick = () => closeCompanyTeamModal();
  });

  modal.querySelectorAll("[data-team-tab]").forEach(btn => {
    btn.onclick = () => {
      modal.querySelectorAll("[data-team-tab]").forEach(b => {
        const active = b === btn;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-selected", active ? "true" : "false");
      });
      const target = btn.dataset.teamTab;
      modal.querySelectorAll("[data-team-panel]").forEach(panel => {
        panel.classList.toggle("hide", panel.dataset.teamPanel !== target);
      });
      if (target === "activity" && canViewActivity) loadCompanyTeamActivity(modal);
      if (target === "members" && canManage) loadCompanyTeamMembers(modal);
    };
  });

  if (canViewActivity) {
    const refreshBtn = modal.querySelector("[data-activity-refresh]");
    const prevBtn = modal.querySelector("[data-activity-prev]");
    const nextBtn = modal.querySelector("[data-activity-next]");
    if (refreshBtn) {
      refreshBtn.onclick = () => {
        refreshBtn.classList.add("is-spinning");
        loadCompanyTeamActivity(modal).finally(() => refreshBtn.classList.remove("is-spinning"));
      };
    }
    if (prevBtn) {
      prevBtn.onclick = () => {
        const limit = modal._activityLimit || 50;
        const nextOffset = Math.max(0, (modal._activityOffset || 0) - limit);
        if (nextOffset === (modal._activityOffset || 0)) return;
        modal._activityOffset = nextOffset;
        loadCompanyTeamActivity(modal);
      };
    }
    if (nextBtn) {
      nextBtn.onclick = () => {
        const limit = modal._activityLimit || 50;
        const total = modal._activityTotal || 0;
        const nextOffset = (modal._activityOffset || 0) + limit;
        if (nextOffset >= total) return;
        modal._activityOffset = nextOffset;
        loadCompanyTeamActivity(modal);
      };
    }
  }

  if (canManage) {
    const addForm = modal.querySelector("#companyTeamAddForm");
    if (addForm) {
      addForm.onsubmit = async e => {
        e.preventDefault();
        const err = modal.querySelector("#companyTeamAddError");
        if (err) {
          err.textContent = "";
          err.classList.remove("show");
        }
        try {
          const username = modal.querySelector("#teamAddUsername")?.value.trim();
          const password = modal.querySelector("#teamAddPassword")?.value || "";
          const displayName = modal.querySelector("#teamAddDisplayName")?.value.trim() || "";
          if (!username) throw new Error("Username is required.");
          assertPasswordPolicy(password);
          const permissions = readCompanyTeamPermCheckboxes("teamAdd");
          await supabaseRpc("app_team_create_member", {
            p_username: username,
            p_password: password,
            p_display_name: displayName,
            p_permissions: permissions
          });
          addForm.reset();
          resetCompanyTeamAddPermDefaults(modal);
          await loadCompanyTeamMembers(modal);
          logCompanyActivity("team", "team", `Added team member "${username}"`, { entityType: "team_member" });
        } catch (ex) {
          if (err) {
            err.textContent = ex.message || "Could not add member.";
            err.classList.add("show");
          } else {
            alert(ex.message || "Could not add member.");
          }
        }
      };
    }
    await loadCompanyTeamMembers(modal);
  }
  if (canViewActivity && defaultTab === "activity") {
    await loadCompanyTeamActivity(modal);
  }
}

function updateCompanyTeamSeatsUi(modal, rows){
  const seatsEl = modal.querySelector("#companyTeamSeats");
  const submitBtn = modal.querySelector("#companyTeamAddForm button[type='submit']");
  const activeCount = rows.filter(m => m.is_active !== false).length;
  const maxTeam = Math.max(1, Math.min(50, Number(state.sessionUser?.max_team_members) || 3));
  const isFull = activeCount >= maxTeam;
  if (seatsEl) {
    seatsEl.textContent = `${activeCount} / ${maxTeam} seats used`;
    seatsEl.classList.toggle("is-full", isFull);
  }
  if (submitBtn) {
    submitBtn.disabled = isFull;
    submitBtn.title = isFull ? `Team is full (${activeCount}/${maxTeam}). Ask the platform admin to increase the limit.` : "";
  }
}

async function loadCompanyTeamMembers(modal){
  const list = modal.querySelector("#companyTeamMembersList");
  if (!list) return;
  list.innerHTML = `<div class="empty"><i class="fa-solid fa-spinner btn-loader"></i> Loading members…</div>`;
  try {
    const members = await supabaseRpc("app_team_list_members", {});
    const rows = Array.isArray(members) ? members : [];
    updateCompanyTeamSeatsUi(modal, rows);
    if (!rows.length) {
      list.innerHTML = `<div class="empty">No team members yet. Add one above.</div>`;
      return;
    }
    list.innerHTML = rows.map(member => renderCompanyTeamMemberCard(member)).join("");
    wireCompanyTeamMemberActions(modal, list, rows);
  } catch (err) {
    list.innerHTML = `<div class="empty">${escapeHtml(err.message || "Could not load team members.")}</div>`;
  }
}

function renderCompanyTeamMemberCard(member){
  const perms = member.team_permissions || {};
  const chips = COMPANY_TEAM_PERMISSION_FIELDS
    .map(([key, label]) => `<span class="company-team-chip ${perms[key] ? "is-on" : "is-off"}">${escapeHtml(label)}</span>`)
    .join("");
  const statusBadge = member.is_active !== false
    ? `<span class="admin-badge ok">Active</span>`
    : `<span class="admin-badge warn">Disabled</span>`;
  return `
    <article class="company-team-member" data-member-id="${escapeHtml(String(member.id))}">
      <div class="company-team-member-head">
        <div class="company-team-member-name">
          <strong>${escapeHtml(member.display_name || member.username)}</strong>
          <code>@${escapeHtml(member.username)}</code>
        </div>
        ${statusBadge}
      </div>
      <div class="company-team-chip-row">${chips}</div>
      <div class="company-team-member-actions">
        <button type="button" class="btn soft tiny" data-team-action="edit-permissions">Edit permissions</button>
        <button type="button" class="btn ghost tiny" data-team-action="toggle-active">${member.is_active !== false ? "Disable" : "Enable"}</button>
        <button type="button" class="btn ghost tiny danger-text" data-team-action="remove">Remove</button>
      </div>
    </article>`;
}

function wireCompanyTeamMemberActions(modal, list, rows){
  list.querySelectorAll(".company-team-member").forEach(card => {
    const memberId = card.dataset.memberId;
    const member = rows.find(m => String(m.id) === String(memberId));
    if (!member) return;

    const editBtn = card.querySelector('[data-team-action="edit-permissions"]');
    const toggleBtn = card.querySelector('[data-team-action="toggle-active"]');
    const removeBtn = card.querySelector('[data-team-action="remove"]');

    if (editBtn) {
      editBtn.onclick = () => openCompanyTeamMemberPermissionsEditor(card, member);
    }
    if (toggleBtn) {
      toggleBtn.onclick = async () => {
        const nextActive = member.is_active === false;
        toggleBtn.disabled = true;
        try {
          await supabaseRpc("app_team_set_member_active", { p_user_id: member.id, p_active: nextActive });
          await loadCompanyTeamMembers(modal);
        } catch (err) {
          alert(err.message || "Could not update member status.");
          toggleBtn.disabled = false;
        }
      };
    }
    if (removeBtn) {
      removeBtn.onclick = async () => {
        if (!confirm(`Remove team member "${member.username}"? They will lose access, but shared company data stays intact.`)) return;
        removeBtn.disabled = true;
        try {
          await supabaseRpc("app_team_delete_member", { p_user_id: member.id });
          await loadCompanyTeamMembers(modal);
        } catch (err) {
          alert(err.message || "Could not remove team member.");
          removeBtn.disabled = false;
        }
      };
    }
  });
}

function openCompanyTeamMemberPermissionsEditor(card, member){
  const existingEditor = card.querySelector(".company-team-perm-editor");
  if (existingEditor) {
    existingEditor.remove();
    return;
  }
  const perms = member.team_permissions || {};
  const editor = document.createElement("div");
  editor.className = "company-team-perm-editor";
  editor.innerHTML = `
    <div class="company-team-perm-grid">${companyTeamPermCheckboxesHtml("teamEdit" + member.id, perms)}</div>
    <div class="company-team-perm-editor-actions">
      <button type="button" class="btn ghost tiny" data-perm-cancel>Cancel</button>
      <button type="button" class="btn primary tiny" data-perm-save>Save permissions</button>
    </div>
  `;
  card.appendChild(editor);
  editor.querySelector("[data-perm-cancel]").onclick = () => editor.remove();
  editor.querySelector("[data-perm-save]").onclick = async () => {
    const saveBtn = editor.querySelector("[data-perm-save]");
    saveBtn.disabled = true;
    try {
      const permissions = {};
      editor.querySelectorAll("[data-perm]").forEach(input => {
        permissions[input.dataset.perm] = input.checked;
      });
      await supabaseRpc("app_team_update_member_permissions", { p_user_id: member.id, p_permissions: permissions });
      const modal = card.closest(".modal");
      if (modal) await loadCompanyTeamMembers(modal);
    } catch (err) {
      alert(err.message || "Could not update permissions.");
      saveBtn.disabled = false;
    }
  };
}

async function loadCompanyTeamActivity(modal){
  if (!isTeamOwnerAccount()) {
    const list = modal.querySelector("#companyTeamActivityList");
    if (list) list.innerHTML = `<div class="empty tiny">Only the main company account can view activity.</div>`;
    return;
  }
  const list = modal.querySelector("#companyTeamActivityList");
  const countEl = modal.querySelector("#companyTeamActivityCount");
  const pageEl = modal.querySelector("#companyTeamActivityPage");
  const prevBtn = modal.querySelector("[data-activity-prev]");
  const nextBtn = modal.querySelector("[data-activity-next]");
  if (!list) return;

  const limit = modal._activityLimit || 50;
  let offset = Math.max(0, modal._activityOffset || 0);
  list.innerHTML = `<div class="empty tiny"><i class="fa-solid fa-spinner btn-loader"></i> Loading…</div>`;
  try {
    const result = await supabaseRpc("app_team_list_activity", { p_limit: limit, p_offset: offset });
    const items = Array.isArray(result?.items) ? result.items : [];
    const total = Number(result?.total) || 0;
    modal._activityTotal = total;
    if (offset > 0 && !items.length && total > 0) {
      modal._activityOffset = Math.max(0, Math.floor((total - 1) / limit) * limit);
      return loadCompanyTeamActivity(modal);
    }
    offset = modal._activityOffset || 0;
    const from = total ? offset + 1 : 0;
    const to = Math.min(offset + items.length, total);
    const page = Math.floor(offset / limit) + 1;
    const pages = Math.max(1, Math.ceil(total / limit) || 1);
    if (countEl) countEl.textContent = total ? `${from}–${to} of ${total}` : "No activity yet";
    if (pageEl) pageEl.textContent = total ? `${page}/${pages}` : "0/0";
    if (prevBtn) prevBtn.disabled = offset <= 0;
    if (nextBtn) nextBtn.disabled = offset + limit >= total;

    if (!items.length) {
      list.innerHTML = `<div class="empty tiny">No activity recorded yet.</div>`;
      return;
    }
    list.innerHTML = items.map(item => {
      const actor = item.actor_username || "unknown";
      const summary = item.summary || item.action || "Activity";
      const mod = item.module || "";
      const time = formatRelativeTime(item.created_at) || formatAdminDate(item.created_at);
      return `
        <div class="cta-line" title="${escapeHtml(formatAdminDate(item.created_at))}">
          <span class="cta-actor">@${escapeHtml(actor)}</span>
          <span class="cta-summary">${escapeHtml(summary)}</span>
          ${mod ? `<span class="cta-mod">${escapeHtml(mod)}</span>` : `<span class="cta-mod cta-mod-empty"></span>`}
          <span class="cta-time">${escapeHtml(time)}</span>
        </div>`;
    }).join("");
  } catch (err) {
    if (countEl) countEl.textContent = "Activity";
    if (pageEl) pageEl.textContent = "—";
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    list.innerHTML = `<div class="empty tiny">${escapeHtml(err.message || "Could not load activity.")}</div>`;
  }
}

function applyUserProfileToConfig(user){
  if (!user) {
    fullConfigData = null;
    return;
  }
  const settings = user.settings && typeof user.settings === "object" ? user.settings : {};
  // Prefer admin-assigned allowed_currencies, then settings.Currency — never invent a full list
  // when the user already has an explicit (possibly empty) assignment.
  let currency;
  if (Array.isArray(user.allowed_currencies) && user.allowed_currencies.length) {
    currency = user.allowed_currencies;
  } else if (Array.isArray(settings.Currency) && settings.Currency.length) {
    currency = settings.Currency;
  } else if (settings.Currency) {
    currency = [settings.Currency];
  } else if (user.role === "admin") {
    currency = SUPPORTED_CURRENCIES;
  } else {
    currency = Array.isArray(user.allowed_currencies) ? user.allowed_currencies : [];
  }
  currency = [...new Set(
    (Array.isArray(currency) ? currency : [])
      .map(c => normalizeCurrencyCode(c))
      .filter(c => SUPPORTED_CURRENCIES.includes(c))
  )];
  if (!currency.length && user.role === "admin") {
    currency = [...SUPPORTED_CURRENCIES];
  }
  const company = user.company_name || settings.Company || "";
  const trn = user.vat_number || settings.TRN || "";
  const logo = user.logo_url || settings.logo || "";
  const companyEmail = user.company_email || settings.email || settings.Email || "";
  const companyPhone = user.company_phone || settings.Mobile || settings.Phone || settings.phone || "";
  const companyAddress = user.company_address || settings.Address || settings.address || "";
  fullConfigData = {
    Name: user.display_name || settings.Name || user.username || "User",
    Company: company,
    TRN: trn,
    logo,
    ...settings,
    Company: company,
    TRN: trn,
    logo,
    email: companyEmail,
    Email: companyEmail,
    Mobile: companyPhone,
    Phone: companyPhone,
    Address: companyAddress,
    address: companyAddress,
    company_email: companyEmail,
    company_phone: companyPhone,
    company_address: companyAddress,
    Currency: currency
  };
  state.sessionUser = user;
  state.permissions = Array.isArray(user.permissions) ? user.permissions : [];
  state.currentUsername = user.username || "";
  const pinHash = String(user.smart_pin_hash || "").trim().toLowerCase();
  if (pinHash && /^[a-f0-9]{64}$/.test(pinHash)) {
    state.secretPinHash = pinHash;
  }
  cachedPdfLogo = null;
}

function normalizeAssignedModules(rawTabs){
  return TripleMPermissions.normalizeAssignedModules(rawTabs);
}

function getSessionAssignedModules(){
  const user = state.sessionUser;
  if (!user) return null;
  let tabs = user.allowed_tabs;
  if (!Array.isArray(tabs) || !tabs.length) {
    tabs = user.settings?.Tabs;
  }
  if (!Array.isArray(tabs) || !tabs.length) return null;
  return normalizeAssignedModules(tabs);
}

function userHasPermission(moduleName, action = "view"){
  return TripleMPermissions.evaluateUserPermission({
    moduleName,
    action,
    isGuest: isGuestMode(),
    sessionUser: state.sessionUser,
    trialLocked: state.trialLocked === true,
    isTrial: getUserAccessFlags().is_trial === true,
    assignedModules: getSessionAssignedModules(),
    permissions: state.permissions
  });
}

function isTeamMemberAccount(user = state.sessionUser){
  return TripleMPermissions.isTeamMemberAccount(user);
}
function isTeamOwnerAccount(user = state.sessionUser){
  return TripleMPermissions.isTeamOwnerAccount(user);
}
function canManageCompanyTeam(user = state.sessionUser){
  return TripleMPermissions.canManageCompanyTeam(user);
}
function teamCapability(key, user = state.sessionUser){
  return TripleMPermissions.teamCapability(key, user);
}
function assertTeamCapability(key, message){
  if (!teamCapability(key)) throw new Error(message || "You do not have permission for this action.");
}

// UI-level gate: hides (rather than just disabling) edit/delete affordances
// for restricted team members. "entries" = loans/installments/expenses,
// "invoices" = inventory/goods items & sales. Solo/owner accounts always pass.
function teamCanShowEdit(kind = "entries"){
  return teamCapability(kind === "invoices" ? "can_edit_invoices" : "can_edit_entries");
}
function teamCanShowDelete(kind = "entries"){
  return teamCapability(kind === "invoices" ? "can_delete_invoices" : "can_delete_entries");
}

function applyPermissionGates(){
  const tabModuleMap = {
    dashboard: "dashboard",
    expenses: "expenses",
    goods: "inventory",
    loans: "loans",
    given: "loans",
    received: "loans",
    taken: "loans",
    returned: "loans",
    installments: "installments",
    notes: "notes",
    bitcoin: "bitcoin",
    admin: "admin_panel"
  };
  const locked = state.trialLocked === true;
  document.querySelectorAll(".tab[data-tab]").forEach(tab => {
    const mod = tabModuleMap[tab.dataset.tab];
    if (tab.dataset.tab === "messages" || tab.dataset.tab === "about") {
      // Messages + About use header icons / overlays — never show as tabs.
      tab.classList.add("hide");
      tab.disabled = true;
      tab.setAttribute("aria-hidden", "true");
      return;
    }
    if (!mod) return;
    let allowed = isGuestMode() ? mod !== "admin_panel" : userHasPermission(mod, "view");
    if (locked) allowed = false;
    if (tab.dataset.tab === "admin" && getUserAccessFlags().is_trial) allowed = false;
    tab.classList.toggle("hide", !allowed);
    tab.disabled = !allowed;
    tab.setAttribute("aria-hidden", allowed ? "false" : "true");
  });
  const loansBtn = document.getElementById("loansTabBtn");
  if (loansBtn) {
    const allowed = !locked && (isGuestMode() || userHasPermission("loans", "view"));
    loansBtn.classList.toggle("hide", !allowed);
    loansBtn.disabled = !allowed;
  }
  const adminTab = document.querySelector('.tab[data-tab="admin"]');
  if (adminTab) {
    const allowed = !isGuestMode() && !locked && !getUserAccessFlags().is_trial && userHasPermission("admin_panel", "view");
    adminTab.classList.toggle("hide", !allowed);
  }
  const canExport = isGuestMode() ? false : (userHasPermission("pdf_export", "export") || userHasPermission("reports", "export"));
  const canImport = isGuestMode() ? false : userHasPermission("settings", "import");
  document.querySelectorAll(
    "#downloadGivenPdfBtn, #downloadReceivedPdfBtn, #downloadTakenPdfBtn, #downloadReturnedPdfBtn, #downloadExpensesPdfBtn, #downloadAllSectionsPdfBtn, #btcDownloadPdfBtn, #btcDownloadWalletPdfBtn, #downloadAllDataJsonBtn, #downloadAllDataCsvBtn"
  ).forEach(btn => {
    if (!btn || isGuestMode()) return;
    btn.classList.toggle("perm-disabled", !canExport);
    if ("disabled" in btn) btn.disabled = !canExport && (btn.id || "").includes("Pdf");
  });
  [document.querySelector('label[for="importJsonInput"]'), document.getElementById("importJsonInput"), document.getElementById("importCsvInput")]
    .filter(Boolean)
    .forEach(el => {
      if (isGuestMode()) return;
      el.classList.toggle("hide", !canImport);
    });
  updateAdminCommsVisibility();
  updateAdminBackupVisibility();
  if (messagingLiveEligible()) {
    refreshAdminCommsBadges().catch(() => {});
    startInstallmentDueChecker();
    startMessagingLiveSync();
    if (typeof ensureReminderAlertAudioUnlocked === "function") ensureReminderAlertAudioUnlocked();
    if (typeof bootstrapReminderDeliveryOnUnlock === "function") {
      bootstrapReminderDeliveryOnUnlock().catch(() => {});
    }
  } else {
    stopInstallmentDueChecker();
    stopMessagingLiveSync();
  }
}

function apiHeaders(extra = {}){
  const dbConfig = getSupabaseConfig();
  const headers = {
    "apikey": dbConfig.supabaseKey,
    "Authorization": `Bearer ${dbConfig.supabaseKey}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation",
    ...extra
  };
  if (state.sessionToken) {
    headers["X-Session-Token"] = state.sessionToken;
  }
  return headers;
}

async function supabase(path, options = {}){
  const dbConfig = getSupabaseConfig();
  let res;
  try{
    res = await fetch(`${dbConfig.supabaseUrl}/rest/v1/${path}`, {
      ...options,
      headers: apiHeaders(options.headers || {})
    });
  }catch{
    throw new Error("Database request failed. Please check connection and unlock again.");
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const message = data?.message || data?.error || data?.hint || text || `Request failed (${res.status})`;
    if (res.status === 401 || /session expired|authentication required|invalid username or password/i.test(String(message))) {
      if (state.unlocked && !isGuestMode() && state.sessionToken && !String(path).startsWith("rpc/app_login")) {
        console.warn("Session rejected by database:", message);
      }
    }
    throw new Error(message);
  }
  return data;
}

function asEntryArray(entryOrEntries){
  return Array.isArray(entryOrEntries) ? entryOrEntries : [entryOrEntries];
}

function withLocalEntryIdentity(entry, timestamp = new Date().toISOString()){
  // Always stamp the session data-owner — never trust client-supplied owner_id (IDOR).
  const ownerId = currentOwnerId();
  return {
    ...entry,
    id: entry?.id || crypto.randomUUID(),
    created_at: entry?.created_at || timestamp,
    ...(ownerId ? { owner_id: ownerId } : {})
  };
}

function databaseInsertPayload(entry){
  const row = sanitizeEntryForSupabase(entry);
  if (entry?.id) row.id = entry.id;
  if (entry?.created_at) row.created_at = entry.created_at;
  return row;
}

function markDbSnapshotRows(rows){
  asEntryArray(rows).forEach(row => {
    if (!row?.id) return;
    const signature = entrySignature(row);
    state.dbEntryIds.add(row.id);
    state.dbSignatures.add(signature);
    state.dbSignaturesById.set(row.id, signature);
  });
}

function unmarkDbSnapshotRows(rows){
  asEntryArray(rows).forEach(row => {
    if (!row?.id) return;
    state.dbEntryIds.delete(row.id);
    state.dbSignatures.delete(entrySignature(row));
    state.dbSignaturesById.delete(row.id);
  });
}
