const CONFIG = {
  zipBaseUrl: "https://triplem.vip/Assets/app/",
  table: "loan_ledger_entries"
};

const ZIP_USERNAME_SESSION_KEY = "loanledger-zip-username-v1";
const ZIP_PASSWORD_STORAGE_KEY = "loanledger-zip-password-v1";
const ZIP_USERNAME_STORAGE_KEY = "loanledger-zip-username-persist-v1";

function sanitizeZipUsername(raw){
  const username = String(raw || "").trim();
  if (!username) throw new Error("Please enter your username.");
  if (!/^[a-zA-Z0-9_-]+$/.test(username)){
    throw new Error("Username may only contain letters, numbers, underscores, and hyphens.");
  }
  return username;
}

function zipUrlForUsername(raw){
  const username = sanitizeZipUsername(raw);
  return `${CONFIG.zipBaseUrl}${encodeURIComponent(username)}.zip`;
}

let runtimeConfig = null;
let fullConfigData = null;

const SUPPORTED_CURRENCIES = ["AED", "SAR", "PKR", "USD", "BTC"];

// Currency mapping for symbols and variations
const CURRENCY_ALIASES = {
  "RS": "PKR",
  "RS.": "PKR", 
  "RUPEES": "PKR",
  "RUPEE": "PKR",
  "₨": "PKR",
  "SAR.": "SAR",
  "RIYAL": "SAR",
  "RIYALS": "SAR",
  "DIRHAM": "AED",
  "DIRHAMS": "AED",
  "DHS": "AED",
  "DH": "AED",
  "~": "AED",
  "USD.": "USD",
  "$": "USD", // Note: This might conflict with SAR, but USD is more common
  "DOLLAR": "USD",
  "DOLLARS": "USD",
  "BITCOIN": "BTC",
  "₿": "BTC",
  "BTC.": "BTC"
};

function normalizeCurrencyCode(currency) {
  if (!currency) return "";
  
  const cleanCurrency = String(currency).trim().toUpperCase();
  
  // Direct match first
  if (SUPPORTED_CURRENCIES.includes(cleanCurrency)) {
    return cleanCurrency;
  }
  
  // Check aliases
  return CURRENCY_ALIASES[cleanCurrency] || cleanCurrency;
}

function getAllowedCurrencies() {
  if (!fullConfigData?.Currency) {
    return SUPPORTED_CURRENCIES; // Default to all supported currencies if no config
  }
  
  const configCurrencies = fullConfigData.Currency;
  
  // If config contains "All" (case-insensitive), return all supported currencies
  if (configCurrencies.some(currency => String(currency).toUpperCase() === "ALL")) {
    return SUPPORTED_CURRENCIES;
  }
  
  // Filter to only include currencies that are both in config and supported
  return configCurrencies.filter(currency => 
    SUPPORTED_CURRENCIES.includes(normalizeCurrencyCode(currency))
  );
}

const state = {
  entries: [],
  dataSource: "backup",
  hasImportedFile: false,
  dbEntryIds: new Set(),
  dbSignatures: new Set(),
  dbSignaturesById: new Map(),
  unlocked: false,
  search: { given: "", received: "", taken: "", returned: "", installments: "", goods: "", expenses: "" },
  statusFilter: { given: "All", received: "All", taken: "All", returned: "All", installments: "All", goods: "All", expenses: "All" },
  currencyFilter: { given: "All", received: "All", taken: "All", returned: "All", installments: "All", goods: "All", expenses: "All" },
  lastCurrency: "AED", // Will be updated to first allowed currency after config loads
  modalDirection: "given",
  editId: null,
  editKind: null,
  expenseWalletFilter: "all",
  expenseDateFrom: "",
  expenseDateTo: "",
  bitcoin: {
    wallet: null,
    selectedNetworkKey: "mainnet",
    utxos: [],
    history: [],
    historyCursor: null,
    historyDone: false,
    historyTotal: 0,
    qrInstance: null,
    feeRate: 8,
    isWatchOnly: false,
    watchAddress: null,
    btcPrice: null,
    lastPriceUpdate: null
  },
  notes: [],
  bitcoinWallets: [],
  recycleBin: []
};

const els = {
  lockScreen: document.getElementById("lockScreen"),
  zipUsernameInput: document.getElementById("zipUsernameInput"),
  zipPasswordInput: document.getElementById("zipPasswordInput"),
  unlockBtn: document.getElementById("unlockBtn"),
  lockError: document.getElementById("lockError"),
  welcomeScreen: document.getElementById("welcomeScreen"),
  welcomeName: document.getElementById("welcomeName"),
  lockScreenSubtitle: document.getElementById("lockScreenSubtitle"),
  standaloneAboutSubtitle: document.getElementById("standaloneAboutSubtitle"),
  mainAppSubtitle: document.getElementById("mainAppSubtitle"),
  app: document.getElementById("app"),
  learnMoreBtn: document.getElementById("learnMoreBtn"),
  pricingBtn: document.getElementById("pricingBtn"),
  standaloneAboutSection: document.getElementById("standaloneAboutSection"),
  closeStandaloneAboutBtn: document.getElementById("closeStandaloneAboutBtn"),
  backToLoginBtn: document.getElementById("backToLoginBtn"),
  standalonePricingSection: document.getElementById("standalonePricingSection"),
  closeStandalonePricingBtn: document.getElementById("closeStandalonePricingBtn"),
  backToLoginFromPricingBtn: document.getElementById("backToLoginFromPricingBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  mainOverview: document.getElementById("mainOverview"),
  statsGrid: document.getElementById("statsGrid"),
  givenList: document.getElementById("givenList"),
  receivedList: document.getElementById("receivedList"),
  takenList: document.getElementById("takenList"),
  returnedList: document.getElementById("returnedList"),
  installmentsList: document.getElementById("installmentsList"),
  goodsList: document.getElementById("goodsList"),
  expensesList: document.getElementById("expensesList"),
  openGivenCount: document.getElementById("openGivenCount"),
  openTakenCount: document.getElementById("openTakenCount"),
  receivedCount: document.getElementById("receivedCount"),
  returnedCount: document.getElementById("returnedCount"),
  connectSupabaseBtn: document.getElementById("connectSupabaseBtn"),
  importJsonInput: document.getElementById("importJsonInput"),
  importCsvInput: document.getElementById("importCsvInput"),
  downloadReportMenuBtn: document.getElementById("downloadReportMenuBtn"),
  downloadAllDataJsonBtn: document.getElementById("downloadAllDataJsonBtn"),
  downloadAllDataCsvBtn: document.getElementById("downloadAllDataCsvBtn"),
  uploadBackupBtn: document.getElementById("uploadBackupBtn"),
  downloadAllSectionsPdfBtn: document.getElementById("downloadAllSectionsPdfBtn"),
  downloadGivenPdfBtn: document.getElementById("downloadGivenPdfBtn"),
  downloadReceivedPdfBtn: document.getElementById("downloadReceivedPdfBtn"),
  downloadTakenPdfBtn: document.getElementById("downloadTakenPdfBtn"),
  downloadReturnedPdfBtn: document.getElementById("downloadReturnedPdfBtn"),
  downloadExpensesPdfBtn: document.getElementById("downloadExpensesPdfBtn"),
  entryModal: document.getElementById("entryModal"),
  editModal: document.getElementById("editModal"),
  modalTitle: document.getElementById("modalTitle"),
  modalDesc: document.getElementById("modalDesc"),
  principalModalForm: document.getElementById("principalModalForm"),
  paymentModalForm: document.getElementById("paymentModalForm"),
  editForm: document.getElementById("editForm"),
  modalLoanSelect: document.getElementById("modalLoanSelect"),
  principalSubmitBtn: document.getElementById("principalSubmitBtn"),
  paymentSubmitBtn: document.getElementById("paymentSubmitBtn"),
  multiEntryCount: document.getElementById("multiEntryCount"),
  multiEntryContainer: document.getElementById("multiEntryContainer"),
  goodsModal: document.getElementById("goodsModal"),
  goodsModalTitle: document.getElementById("goodsModalTitle"),
  goodsModalDesc: document.getElementById("goodsModalDesc"),
  goodsBoughtForm: document.getElementById("goodsBoughtForm"),
  goodsSoldForm: document.getElementById("goodsSoldForm"),
  goodsItemSelect: document.getElementById("goodsItemSelect"),
  goodsNewItemToggleBtn: document.getElementById("goodsNewItemToggleBtn"),
  goodsNewItemFields: document.getElementById("goodsNewItemFields"),
  openGoodsBoughtBtn: document.getElementById("openGoodsBoughtBtn"),
  openGoodsSoldBtn: document.getElementById("openGoodsSoldBtn"),
  expenseModal: document.getElementById("expenseModal"),
  expenseModalTitle: document.getElementById("expenseModalTitle"),
  expenseModalDesc: document.getElementById("expenseModalDesc"),
  expenseAccountForm: document.getElementById("expenseAccountForm"),
  expenseTopupForm: document.getElementById("expenseTopupForm"),
  expenseEntryForm: document.getElementById("expenseEntryForm"),
  expenseTopupAccountSelect: document.getElementById("expenseTopupAccountSelect"),
  expenseSpendAccountSelect: document.getElementById("expenseSpendAccountSelect"),
  expenseCurrencySelect: document.getElementById("expenseCurrencySelect"),
  expenseTypeSelect: document.getElementById("expenseTypeSelect"),
  openExpenseAccountBtn: document.getElementById("openExpenseAccountBtn"),
  openExpenseTopupBtn: document.getElementById("openExpenseTopupBtn"),
  openExpenseEntryBtn: document.getElementById("openExpenseEntryBtn"),
  expenseWalletFilters: document.getElementById("expenseWalletFilters"),
  expenseItemNameInput: document.getElementById("expenseItemNameInput"),
  expenseItemIntentWrap: document.getElementById("expenseItemIntentWrap"),
  transferModal: document.getElementById("transferModal"),
  transferModalTitle: document.getElementById("transferModalTitle"),
  transferModalDesc: document.getElementById("transferModalDesc"),
  transferForm: document.getElementById("transferForm"),
  transferFromWallet: document.getElementById("transferFromWallet"),
  transferToWallet: document.getElementById("transferToWallet"),
  conversionRateInput: document.getElementById("conversionRateInput"),
  conversionHelp: document.getElementById("conversionHelp"),
  fromCurrencyIndicator: document.getElementById("fromCurrencyIndicator"),
  toCurrencyIndicator: document.getElementById("toCurrencyIndicator"),
  toggleWalletsBtn: document.getElementById("toggleWalletsBtn"),
  walletsOverviewSection: document.getElementById("walletsOverviewSection"),
  walletsBanner: document.getElementById("walletsBanner"),
  walletsContent: document.getElementById("walletsContent"),
  toggleMainOverviewBtn: document.getElementById("toggleMainOverviewBtn"),
  mainOverviewBanner: document.getElementById("mainOverviewBanner"),
  mainOverviewContent: document.getElementById("mainOverviewContent"),
  btcWifInput: document.getElementById("btcWifInput"),
  btcImportBtn: document.getElementById("btcImportBtn"),
  btcGenerateBtn: document.getElementById("btcGenerateBtn"),
  btcDownloadWalletPdfBtn: document.getElementById("btcDownloadWalletPdfBtn"),
  btcClearBtn: document.getElementById("btcClearBtn"),
  btcWalletStatus: document.getElementById("btcWalletStatus"),
  btcMaskedWif: document.getElementById("btcMaskedWif"),
  btcCopyWifBtn: document.getElementById("btcCopyWifBtn"),
  btcWalletAddress: document.getElementById("btcWalletAddress"),
  btcCopyAddressInfoBtn: document.getElementById("btcCopyAddressInfoBtn"),
  btcSaveAddressBtn: document.getElementById("btcSaveAddressBtn"),
  btcBalanceValue: document.getElementById("btcBalanceValue"),
  btcReceivedValue: document.getElementById("btcReceivedValue"),
  btcSentValue: document.getElementById("btcSentValue"),
  btcTxCountValue: document.getElementById("btcTxCountValue"),
  btcSendBtn: document.getElementById("btcSendBtn"),
  btcReceiveBtn: document.getElementById("btcReceiveBtn"),
  btcRefreshBtn: document.getElementById("btcRefreshBtn"),
  btcLoginSection: document.getElementById("btcLoginSection"),
  btcWalletInfoSection: document.getElementById("btcWalletInfoSection"),
  btcHistorySection: document.getElementById("btcHistorySection"),
  btcHistoryList: document.getElementById("btcHistoryList"),
  btcDownloadPdfBtn: document.getElementById("btcDownloadPdfBtn"),
  btcSendModal: document.getElementById("btcSendModal"),
  btcReceiveModal: document.getElementById("btcReceiveModal"),
  btcToAddress: document.getElementById("btcToAddress"),
  btcSendAmount: document.getElementById("btcSendAmount"),
  btcFeeRate: document.getElementById("btcFeeRate"),
  btcMaxBtn: document.getElementById("btcMaxBtn"),
  btcSendStatus: document.getElementById("btcSendStatus"),
  btcBroadcastBtn: document.getElementById("btcBroadcastBtn"),
  btcQrBox: document.getElementById("btcQrBox"),
  btcReceiveAddress: document.getElementById("btcReceiveAddress"),
  btcCopyAddressBtn: document.getElementById("btcCopyAddressBtn"),
  btcTransactionSuccessOverlay: document.getElementById("btcTransactionSuccessOverlay"),
  btcTransactionSuccessAmount: document.getElementById("btcTransactionSuccessAmount"),
  btcTransactionSuccessFromWallet: document.getElementById("btcTransactionSuccessFromWallet"),
  btcTransactionSuccessToWallet: document.getElementById("btcTransactionSuccessToWallet"),
  btcTransactionSuccessTxid: document.getElementById("btcTransactionSuccessTxid"),
  moneyAddedSuccessOverlay: document.getElementById("moneyAddedSuccessOverlay"),
  moneyAddedSuccessAmount: document.getElementById("moneyAddedSuccessAmount"),
  moneyAddedSuccessWallet: document.getElementById("moneyAddedSuccessWallet"),
  // Watch wallet elements
  btcFullWalletBtn: document.getElementById("btcFullWalletBtn"),
  btcWatchWalletBtn: document.getElementById("btcWatchWalletBtn"),
  btcFullWalletSection: document.getElementById("btcFullWalletSection"),
  btcWatchWalletSection: document.getElementById("btcWatchWalletSection"),
  btcAddressInput: document.getElementById("btcAddressInput"),
  btcWatchAddressBtn: document.getElementById("btcWatchAddressBtn"),
  btcSendWifSection: document.getElementById("btcSendWifSection"),
  btcSendWifInput: document.getElementById("btcSendWifInput"),
  // USD price display elements
  btcBalanceUsd: document.getElementById("btcBalanceUsd"),
  btcReceivedUsd: document.getElementById("btcReceivedUsd"),
  btcSentUsd: document.getElementById("btcSentUsd"),
  btcPriceDisplay: document.getElementById("btcPriceDisplay"),
  // Saved Bitcoin wallets elements
  btcSavedWalletsSection: document.getElementById("btcSavedWalletsSection"),
  btcSavedWalletsList: document.getElementById("btcSavedWalletsList"),
  btcRefreshSavedBtn: document.getElementById("btcRefreshSavedBtn"),
  // Existing addresses dropdown elements
  btcExistingAddressesBtn: document.getElementById("btcExistingAddressesBtn"),
  btcExistingAddressesDropdown: document.getElementById("btcExistingAddressesDropdown"),
  btcExistingAddressesList: document.getElementById("btcExistingAddressesList"),
  btcExistingAddressesLabel: document.getElementById("btcExistingAddressesLabel"),
  notesPanel: document.getElementById("notesPanel"),
  noteInput: document.getElementById("noteInput"),
  saveNoteBtn: document.getElementById("saveNoteBtn"),
  searchNotes: document.getElementById("searchNotes"),
  notesList: document.getElementById("notesList")
};

const INSTALLMENT_TAG = "[INSTALLMENT]";
const GOODS_TAG = "[GOODS]";
const EXPENSE_ACCOUNT_TAG = "[EXPENSE_ACCOUNT]";
const DELETED_TAG = "[DELETED]";
const BACKUP_STORAGE_KEY = "loanledger-json-backup-v1";
const IMPORT_SESSION_KEY = "loanledger-imported-file-v1";
const FLOAT_CURRENCY_PATHS = ["currency-float-path-1", "currency-float-path-2", "currency-float-path-3", "currency-float-path-4"];

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
  if (!value) return 0;
  const str = String(value).trim();
  const normalized = str.length === 10 ? `${str}T23:59:59` : str;
  const time = new Date(normalized).getTime();
  return Number.isFinite(time) ? time : 0;
}

function normalizeDateForDb(value){
  const raw = String(value || "").trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch){
    const dd = slashMatch[1].padStart(2, "0");
    const mm = slashMatch[2].padStart(2, "0");
    const yyyy = slashMatch[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  const dotMatch = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dotMatch){
    const dd = dotMatch[1].padStart(2, "0");
    const mm = dotMatch[2].padStart(2, "0");
    const yyyy = dotMatch[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
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
    // Filter out recycle bin and deleted entries
    if (isEntryInRecycleBin(entry.id) || hasDeletedTag(entry.notes)) {
      return false;
    }
    
    // Filter out entries with currencies not in allowed list
    if (entry.currency && !allowedCurrencies.includes(normalizeCurrencyCode(entry.currency))) {
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
  try {
    localStorage.setItem('loanledger-recycle-bin-v1', JSON.stringify(state.recycleBin));
  } catch (e) {
    console.error('Failed to save recycle bin to storage:', e);
  }
}

function loadRecycleBinFromStorage() {
  try {
    const stored = localStorage.getItem('loanledger-recycle-bin-v1');
    if (stored) {
      state.recycleBin = JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load recycle bin from storage:', e);
    state.recycleBin = [];
  }
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
    // For database mode, remove the deleted tag from notes
    const updatedNotes = removeDeletedTag(deletedItem?.notes || "");
    await supabase(`${CONFIG.table}?id=eq.${encodeURIComponent(entryId)}`, { 
      method: "PATCH", 
      body: JSON.stringify({ notes: updatedNotes }) 
    });
    // Add a small delay to ensure database operations complete
    await new Promise(resolve => setTimeout(resolve, 200));
    await loadEntriesFromSupabase();
    renderAll();
    // Force refresh of expense accounts specifically
    renderExpensesList();
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

  // Permanently delete from database if in database mode
  if (!isBackupMode()) {
    await supabase(`${CONFIG.table}?id=eq.${encodeURIComponent(entryId)}`, { method: "DELETE" });
  }
  
  renderRecycleBinDropdown();
}

function renderRecycleBinDropdown() {
  // Always update the count badge first, even if dropdown doesn't exist yet
  const countBadge = document.getElementById('recycleBinCount');
  if (countBadge) {
    countBadge.textContent = state.recycleBin.length;
    countBadge.style.display = state.recycleBin.length > 0 ? 'inline' : 'none';
  }

  let dropdown = document.getElementById('recycleBinDropdown');
  if (!dropdown) return;

  const itemsContainer = dropdown.querySelector('.recycle-bin-items');
  if (!itemsContainer) return;

  const items = state.recycleBin;
  
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

function getSupabaseConfig(){
  if (!runtimeConfig?.supabaseUrl || !runtimeConfig?.supabaseKey){
    throw new Error("Supabase config is locked. Please unlock the ZIP file first.");
  }
  return runtimeConfig;
}

async function readConfigFromZip(file, password){
  if (!window.zip?.ZipReader) throw new Error("ZIP library failed to load.");

  const reader = new zip.ZipReader(new zip.BlobReader(file), { password });
  const entries = await reader.getEntries();
  const configEntry = entries.find(e => /(^|\/)db-config\.json$/i.test(e.filename) || /\.json$/i.test(e.filename));
  if (!configEntry) throw new Error("No JSON config found in ZIP.");
  const jsonText = await configEntry.getData(new zip.TextWriter());
  await reader.close();
  return JSON.parse(jsonText);
}

async function fetchProtectedZipBlob(username){
  const url = zipUrlForUsername(username);
  const zipRes = await fetch(url, { cache: "no-store" });

  if (!zipRes.ok){
    throw new Error(`Unable to load ${url}. Check username and that the ZIP exists on the server.`);
  }
  return zipRes.blob();
}

function apiHeaders(extra = {}){
  const dbConfig = getSupabaseConfig();
  return {
    "apikey": dbConfig.supabaseKey,
    "Authorization": `Bearer ${dbConfig.supabaseKey}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation",
    ...extra
  };
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
  if (!res.ok) throw new Error(data?.message || data?.error || text || `Request failed (${res.status})`);
  return data;
}

function currencySymbol(currency){
  return currency === "AED" ? "~" : 
         currency === "SAR" ? "$" : 
         currency === "PKR" ? "Rs." : 
         currency === "USD" ? "$" : 
         currency === "BTC" ? "₿" : 
         currency || "";
}

function currencySymbolHtml(currency){
  const symbol = currencySymbol(currency);
  if (currency === "AED") return `<span class="symbol symbol-dirham">${escapeHtml(symbol)}</span>`;
  if (currency === "SAR") return `<span class="symbol symbol-riyal">${escapeHtml(symbol)}</span>`;
  if (currency === "USD") return `<span class="symbol symbol-dollar">${escapeHtml(symbol)}</span>`;
  if (currency === "BTC") return `<span class="symbol symbol-bitcoin">${escapeHtml(symbol)}</span>`;
  return `<span class="symbol">${escapeHtml(symbol)}</span>`;
}

function moneyText(amount, currency){
  const n = Number(amount || 0);
  const isBtc = currency === "BTC";
  const formatted = n.toLocaleString("en-US", { minimumFractionDigits: isBtc ? 6 : 2, maximumFractionDigits: isBtc ? 6 : 2 });
  const symbol = currencySymbol(currency);
  return `${symbol ? symbol + " " : ""}${formatted}`;
}

function money(amount, currency){
  const n = Number(amount || 0);
  const isBtc = currency === "BTC";
  const formatted = n.toLocaleString("en-US", { minimumFractionDigits: isBtc ? 6 : 2, maximumFractionDigits: isBtc ? 6 : 2 });
  return `<span class="money">${currencySymbolHtml(currency)}<span class="amount">${formatted}</span></span>`;
}

function shortId(id){
  return id ? `#${String(id).slice(0,8).toUpperCase()}` : "";
}

function groupSortStamp(group){
  return group.activityStamp || 0;
}

function groupByLoan(entries){
  const groups = new Map();

  for (const entry of entries){
    if (!entry.group_id) continue;

    if (!groups.has(entry.group_id)){
      groups.set(entry.group_id, {
        group_id: entry.group_id,
        direction: entry.direction,
        person_name: entry.person_name,
        currency: entry.currency,
        principal: null,
        actions: [],
        notes: entry.notes || "",
        loan_date: entry.loan_date || null,
        activityStamp: 0,
        lastActivity: null
      });
    }

    const g = groups.get(entry.group_id);

    if (entry.entry_kind === "principal"){
      g.principal = entry;
      g.loan_date = entry.loan_date || g.loan_date;
    } else {
      g.actions.push(entry);
    }

    const candidateStamp = Math.max(dateStamp(entry.loan_date), dateStamp(entry.action_date));
    if (candidateStamp >= g.activityStamp){
      g.activityStamp = candidateStamp;
      g.lastActivity = entry.action_date || entry.loan_date || g.lastActivity;
    }
  }

  for (const g of groups.values()){
    if (!g.principal && g.actions.length){
      const first = g.actions[0];
      g.principal = {
        id: first.id,
        group_id: first.group_id,
        direction: first.direction,
        entry_kind: "principal",
        person_name: first.person_name,
        currency: first.currency,
        principal_amount: first.principal_amount,
        action_amount: null,
        loan_date: first.loan_date,
        action_date: null,
        notes: first.notes || null
      };
    }

    const principalStamp = dateStamp(g.principal?.loan_date || g.loan_date);
    const actionStamps = g.actions.map(a => dateStamp(a.action_date)).filter(Boolean);
    const latestActionStamp = actionStamps.length ? Math.max(...actionStamps) : 0;

    g.activityStamp = Math.max(g.activityStamp, principalStamp, latestActionStamp);

    if (!g.lastActivity){
      g.lastActivity =
        g.actions.length
          ? g.actions.slice().sort((a, b) => dateStamp(b.action_date) - dateStamp(a.action_date))[0]?.action_date
          : g.principal?.loan_date || g.loan_date || null;
    }
  }

  return Array.from(groups.values()).sort((a, b) => {
    const diff = groupSortStamp(b) - groupSortStamp(a);
    if (diff !== 0) return diff;
    return String(b.group_id || "").localeCompare(String(a.group_id || ""));
  });
}

function calculateLoan(group){
  const principal = Number(group.principal?.principal_amount || 0);
  const actions = group.actions
    .slice()
    .sort((a, b) => {
      const ad = dateStamp(a.action_date);
      const bd = dateStamp(b.action_date);
      if (ad !== bd) return ad - bd;
      return 0;
    });

  let remaining = principal;
  const rows = [];

  rows.push({
    kind: "principal",
    date: group.principal?.loan_date || group.loan_date || "—",
    amount: principal,
    remainingAfter: principal,
    note: group.principal?.notes || group.notes || "—",
    entryId: group.principal?.id || ""
  });

  for (const a of actions){
    remaining = Math.max(remaining - Number(a.action_amount || 0), 0);
    rows.push({
      kind: a.entry_kind === "partial" ? "partial" : "full",
      date: a.action_date || "—",
      amount: Number(a.action_amount || 0),
      remainingAfter: remaining,
      note: a.notes || "—",
      entryId: a.id
    });
  }

  const paid = principal - remaining;
  const status = remaining <= 0 ? "Closed" : paid > 0 ? "Partial" : "Open";
  return { principal, paid, remaining, status, rows };
}

function summarizeCurrency(currency){
  const givenGroups = groupByLoan(getActiveEntries().filter(e =>
    e.currency === currency &&
    e.direction === "given" &&
    !hasGoodsTag(e.notes)
  ));
  const takenGroups = groupByLoan(getActiveEntries().filter(e =>
    e.currency === currency &&
    e.direction === "taken" &&
    !hasGoodsTag(e.notes) &&
    !hasExpenseAccountTag(e.notes)
  ));

  const givenPrincipal = givenGroups.reduce((s, g) => s + Number(g.principal?.principal_amount || 0), 0);
  const givenOpen = givenGroups.reduce((s, g) => s + calculateLoan(g).remaining, 0);
  const takenPrincipal = takenGroups.reduce((s, g) => s + Number(g.principal?.principal_amount || 0), 0);
  const takenOpen = takenGroups.reduce((s, g) => s + calculateLoan(g).remaining, 0);

  return { currency, givenPrincipal, givenOpen, takenPrincipal, takenOpen };
}

function summarizeExpenseByCurrency(currency){
  const accounts = getExpenseAccounts({ applyUiFilters: false }).filter(a => a.currency === currency);
  const totalAmount = accounts.reduce((sum, account) => sum + Number(account.openingBalance || 0) + Number(account.addedMoney || 0), 0);
  const totalExpenses = accounts.reduce((sum, account) => sum + Number(account.spentMoney || 0), 0);
  const availableBalance = accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0);
  return { currency, totalAmount, totalExpenses, availableBalance };
}

function overviewOneLine(label, amountHtml){
  return `
    <div class="summary-line summary-line-one">
      <span class="summary-line-one-label">${escapeHtml(label)}</span>
      <span class="summary-line-one-value">${amountHtml}</span>
    </div>
  `;
}

function overviewAvailableLine(amountHtml, balance = 0, usdEquivalent = ""){
  const isNegativeOrZero = Number(balance) <= 0;
  const colorStyle = isNegativeOrZero ? "color: var(--danger) !important;" : "color: var(--success) !important;";
  const moneyClass = isNegativeOrZero ? "danger-amount" : "success-amount";
  let usdLine = "";
  if (usdEquivalent) {
    usdLine = `<div class="summary-line summary-line-one" style="margin-top: 2px;"><span class="summary-line-one-label"></span><span class="summary-line-one-value" style="color: var(--muted); font-size: 0.74rem; font-weight: 600;">≈ $${usdEquivalent}</span></div>`;
  }
  return `<div class="summary-line summary-line-one"><span class="summary-line-one-label available-label" style="${colorStyle}">Available:</span><span class="summary-line-one-value available-amount ${moneyClass}" style="${colorStyle}">${amountHtml}</span></div>${usdLine}`;
}

function overviewExpenseLine(currency, suffix, amountHtml){
  return `<div class="summary-line summary-line-one"><span class="summary-line-one-label summary-line-one-label--with-symbol"><span class="summary-currency-mark">${currencySymbolHtml(currency)}</span><span class="summary-label-suffix">${escapeHtml(suffix)}</span></span><span class="summary-line-one-value">${amountHtml}</span></div>`;
}

function overviewWatermarkCurrency(currency){
  return `<div class="summary-watermark" aria-hidden="true">${currencySymbolHtml(currency)}</div>`;
}

function overviewWatermarkWallet(walletName, currency){
  // Try to load wallet logo, fallback to currency symbol if logo doesn't exist
  const logoPath = `Assets/logo/wallet_logos/${escapeHtml(walletName)}.png`;
  const uniqueId = `wallet-logo-${escapeHtml(walletName).replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '')}`;
  return `
    <div class="summary-watermark" aria-hidden="true">
      <img id="${uniqueId}" src="${logoPath}" alt="${escapeHtml(walletName)} logo"
           style="width: 100%; height: 100%; object-fit: contain; opacity: 0.45;"
           onload="this.style.display='block'; document.getElementById('${uniqueId}-fallback').style.display='none';"
           onerror="this.style.display='none'; document.getElementById('${uniqueId}-fallback').style.display='block';">
      <div id="${uniqueId}-fallback" style="display:block; font-size:clamp(4.5rem, 28vw, 7.5rem); line-height:1; color:var(--text); opacity:.07; animation:summary-watermark-pulse 3.8s ease-in-out infinite;">${currencySymbolHtml(currency)}</div>
    </div>
  `;
}

function getWalletIconHtml(walletName, size = 20){
  // Returns wallet icon HTML for inline use (small size)
  const logoPath = `Assets/logo/wallet_logos/${escapeHtml(walletName)}.png`;
  const uniqueId = `wallet-icon-${escapeHtml(walletName).replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '')}-${Math.random().toString(36).substr(2, 9)}`;
  return `
    <span class="wallet-icon-inline" style="display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;">
      <img id="${uniqueId}" src="${logoPath}" alt="${escapeHtml(walletName)}" 
           style="width:${size}px;height:${size}px;object-fit:contain;vertical-align:middle;"
           onload="this.style.display='inline-block'; document.getElementById('${uniqueId}-fallback').style.display='none';"
           onerror="this.style.display='none'; document.getElementById('${uniqueId}-fallback').style.display='inline-block';">
      <span id="${uniqueId}-fallback" style="display:none;vertical-align:middle;font-size:${size * 0.8}px;">💼</span>
    </span>
  `;
}

function overviewWatermarkGoods(){
  return `<div class="summary-watermark summary-watermark-goods" aria-hidden="true">🛒</div>`;
}

function overviewWatermarkExpenses(currencies){
  if (!currencies.length) return "";
  const layers = currencies.map((currency, index) =>
    `<span class="summary-watermark-symbol" style="animation-delay:${index * 0.55}s">${currencySymbolHtml(currency)}</span>`
  ).join("");
  return `<div class="summary-watermark summary-watermark-expense" aria-hidden="true">${layers}</div>`;
}

function hash01(str){
  const s = String(str || "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++){
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // unsigned → [0,1)
  return ((h >>> 0) % 100000) / 100000;
}

function overviewWatermarkFloatingWalletLogos(accounts){
  const list = Array.isArray(accounts) ? accounts : [];
  if (!list.length) return "";
  
  // Ensure at least 7 logos by duplicating wallets if needed
  const logoCount = Math.max(list.length, 7);
  const logos = [];
  
  for (let i = 0; i < logoCount; i++) {
    const account = list[i % list.length];
    const name = String(account.person_name || "Wallet").trim() || "Wallet";
    
    // Use Math.random() for truly random movement (not deterministic)
    const dur = (12 + Math.random() * 24).toFixed(1); // 12..36s
    const delay = (Math.random() * -15).toFixed(1); // random negative delay
    const scale = (0.7 + Math.random() * 0.6).toFixed(2); // 0.7..1.3
    const left = (Math.random() * 95).toFixed(2); // 0..95%
    const top = (Math.random() * 95).toFixed(2); // 0..95%
    
    // Random animation variant for each logo
    const animVariant = Math.floor(Math.random() * 4); // 0..3
    const animName = `wallet-drift-${animVariant}`;
    
    const cssVars = [
      `--d:${dur}s`,
      `--delay:${delay}s`,
      `--s:${scale}`
    ].join(";");
    
    const logoPath = `Assets/logo/wallet_logos/${escapeHtml(name)}.png`;
    logos.push(`
      <span class="wallet-float-logo" style="${cssVars}; left:${left}%; top:${top}%; animation-name: wallet-fade-in, ${animName};">
        <img src="${logoPath}" alt="" aria-hidden="true" loading="lazy" onerror="this.parentElement.style.display='none'"/>
      </span>
    `);
  }
  
  return `<div class="wallet-float-watermark" aria-hidden="true">${logos.join("")}</div>`;
}

function renderOverviewCards(){
  const allowedCurrencies = getAllowedCurrencies();
  const currencies = [...new Set([...allowedCurrencies, ...state.entries.map(e => e.currency).filter(Boolean)])];
  const goodsAll = getGoodsGroups({ applyUiFilters: false });
  const goodsBoughtQty = goodsAll.reduce((sum, g) => sum + Number(g.boughtQty || 0), 0);
  const goodsSoldQty = goodsAll.reduce((sum, g) => sum + Number(g.soldQty || 0), 0);
  const goodsStockQty = goodsAll.reduce((sum, g) => sum + Number(g.remainingQty || 0), 0);
  const goodsNetPLByCurrency = goodsAll.reduce((acc, g) => {
    const key = g.currency || "";
    acc[key] = (acc[key] || 0) + Number(g.profitLoss || 0);
    return acc;
  }, {});
  const goodsNetPLText = Object.keys(goodsNetPLByCurrency).length
    ? Object.entries(goodsNetPLByCurrency).map(([currency, amount]) => formatReportAmount(amount, currency)).join(" | ")
    : "0";

  const currencyCards = currencies.map(currency => {
    const s = summarizeCurrency(currency);
    return `
      <div class="summary currency-summary">
        ${overviewWatermarkCurrency(currency)}
        <div class="currency-head">
          ${currencySymbolHtml(currency)}
        </div>
        ${overviewOneLine("Given Principal:", money(s.givenPrincipal, currency))}
        ${overviewOneLine("Given Open:", money(s.givenOpen, currency))}
        ${overviewOneLine("Taken Principal:", money(s.takenPrincipal, currency))}
        ${overviewOneLine("Taken Open:", money(s.takenOpen, currency))}
        <div class="overview-card-actions" style="margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap;">
          <button class="tiny ghost" onclick="window.location.href='#givenPanel'">View Given</button>
          <button class="tiny ghost" onclick="window.location.href='#takenPanel'">View Taken</button>
          <button class="tiny ghost" onclick="downloadCurrencyPDF('${currency}')"><i class="fa-solid fa-download"></i></button>
        </div>
      </div>
    `;
  }).join("");

  const goodsCard = `
    <div class="summary currency-summary goods-overview">
      ${overviewWatermarkGoods()}
      <div class="currency-head">🛒</div>
      ${overviewOneLine("Bought qty:", `<strong>${escapeHtml(String(goodsBoughtQty))}</strong>`)}
      ${overviewOneLine("Sold qty:", `<strong>${escapeHtml(String(goodsSoldQty))}</strong>`)}
      ${overviewOneLine("In stock qty:", `<strong>${escapeHtml(String(goodsStockQty))}</strong>`)}
      ${overviewOneLine("Net P/L:", `<strong>${escapeHtml(goodsNetPLText)}</strong>`)}
      <div class="overview-card-actions" style="margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap;">
        <button class="tiny ghost" onclick="window.location.href='#goodsPanel'">View Goods</button>
        <button class="tiny ghost" onclick="openGoodsModal('bought')">Add Item</button>
        <button class="tiny ghost" onclick="downloadGoodsPDF()"><i class="fa-solid fa-download"></i></button>
      </div>
    </div>
  `;

  // Expense summary is intentionally rendered inside Wallets Overview (Expenses tab),
  // not inside the main Overview grid.
  els.statsGrid.innerHTML = currencyCards + goodsCard;
}

function matchesSearch(entry, term){
  if (!term) return true;
  const blob = `${entry.person_name || ""} ${entry.notes || ""} ${entry.currency || ""} ${displayDate(entry.loan_date)} ${displayDate(entry.action_date)}`.toLowerCase();
  return blob.includes(term.toLowerCase());
}

function hasInstallmentTag(noteValue){
  return String(noteValue || "").includes(INSTALLMENT_TAG);
}

function hasGoodsTag(noteValue){
  return String(noteValue || "").includes(GOODS_TAG);
}

function normalizeInstallmentNote(noteValue, markInstallment){
  const base = String(noteValue || "").replace(INSTALLMENT_TAG, "").trim();
  if (!markInstallment) return base || null;
  return base ? `${INSTALLMENT_TAG} ${base}` : INSTALLMENT_TAG;
}

function normalizeGoodsNote(noteValue, markGoods){
  const base = String(noteValue || "").replace(GOODS_TAG, "").trim();
  if (!markGoods) return base || null;
  return base ? `${GOODS_TAG} ${base}` : GOODS_TAG;
}

function goodsMetaFromNotes(noteValue){
  const text = String(noteValue || "");
  const readNum = (key) => {
    const m = text.match(new RegExp(`\\[${key}:([^\\]]+)\\]`, "i"));
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  };
  return {
    boughtQty: readNum("BQTY"),
    soldQty: readNum("SQTY"),
    unitActualPrice: readNum("UAP"),
    unitSoldPrice: readNum("USP")
  };
}

function upsertGoodsMetaInNote(noteValue, meta = {}){
  let note = normalizeGoodsNote(noteValue, true) || GOODS_TAG;
  note = note.replace(/\[(BQTY|SQTY|UAP|USP):[^\]]+\]/gi, "").replace(/\s{2,}/g, " ").trim();
  const tags = [];
  if (meta.boughtQty != null) tags.push(`[BQTY:${meta.boughtQty}]`);
  if (meta.soldQty != null) tags.push(`[SQTY:${meta.soldQty}]`);
  if (meta.unitActualPrice != null) tags.push(`[UAP:${meta.unitActualPrice}]`);
  if (meta.unitSoldPrice != null) tags.push(`[USP:${meta.unitSoldPrice}]`);
  return `${note} ${tags.join(" ")}`.trim();
}

function hasExpenseAccountTag(noteValue){
  return noteValue && noteValue.includes(EXPENSE_ACCOUNT_TAG);
}

function hasDeletedTag(noteValue){
  return noteValue && noteValue.includes(DELETED_TAG);
}

function addDeletedTag(noteValue){
  if (!noteValue) return DELETED_TAG;
  if (hasDeletedTag(noteValue)) return noteValue;
  return noteValue + " " + DELETED_TAG;
}

function removeDeletedTag(noteValue){
  if (!noteValue || !hasDeletedTag(noteValue)) return noteValue;
  return noteValue.replace(DELETED_TAG, "").trim();
}

function expenseMetaFromNotes(noteValue){
  const text = String(noteValue || "");
  const readText = key => {
    const m = text.match(new RegExp(`\\[${key}:([^\\]]+)\\]`, "i"));
    return m ? m[1] : "";
  };
  return {
    accountType: readText("ATYPE"),
    rowType: readText("ETYPE"),
    itemName: readText("ITEM"),
    expenseType: readText("XTYPE")
  };
}

function upsertExpenseMetaInNote(noteValue, meta = {}){
  const base = String(noteValue || "")
    .replace(EXPENSE_ACCOUNT_TAG, "")
    .replace(/\[(ATYPE|ETYPE|ITEM|XTYPE):[^\]]+\]/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const tags = [];
  if (meta.accountType) tags.push(`[ATYPE:${meta.accountType}]`);
  if (meta.rowType) tags.push(`[ETYPE:${meta.rowType}]`);
  if (meta.itemName) tags.push(`[ITEM:${meta.itemName}]`);
  if (meta.expenseType) tags.push(`[XTYPE:${meta.expenseType}]`);
  const withTag = `${EXPENSE_ACCOUNT_TAG} ${base}`.trim();
  return `${withTag} ${tags.join(" ")}`.trim();
}

function cleanExpenseNote(noteValue){
  return String(noteValue || "")
    .replace(EXPENSE_ACCOUNT_TAG, "")
    .replace(/\[(ATYPE|ETYPE|ITEM|XTYPE):[^\]]+\]/gi, "")
    .replace(/→/g, "->")
    .replace(/\s{2,}/g, " ")
    .trim() || "—";
}

function wrapTextForPdf(text, maxLength = 50){
  const str = String(text || "");
  if (str.length <= maxLength) return str;
  const words = str.split(' ');
  const lines = [];
  let currentLine = '';
  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length <= maxLength) {
      currentLine = (currentLine + ' ' + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.join('\n');
}

function sortCurrenciesList(values){
  const allowedCurrencies = getAllowedCurrencies();
  const rank = c => {
    const i = allowedCurrencies.indexOf(String(c || "").toUpperCase());
    return i === -1 ? 100 : i;
  };
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    rank(a) - rank(b) || String(a).localeCompare(String(b))
  );
}

function findTransferPartnerForExpense(expenseEntry){
  const transferMatch = String(expenseEntry.notes || "").match(/Transfer to ([^:]+)/);
  if (!transferMatch) return null;
  const toWalletName = transferMatch[1].trim();
  return state.entries.find(e =>
    e.id !== expenseEntry.id &&
    hasExpenseAccountTag(e.notes) &&
    expenseMetaFromNotes(e.notes).rowType === "TOPUP" &&
    String(e.person_name || "").trim() === toWalletName &&
    e.notes.includes(`Transfer from ${expenseEntry.person_name}`)
  ) || null;
}

function parseTransferExpenseDetails(tx, fromAccount){
  const raw = String(tx.notes || "");
  const detailed = raw.match(/Transfer to ([^:]+):\s*([\d.]+)\s+(\w+)\s*→\s*([\d.]+)\s+(\w+)\s*\(\s*Rate:\s*([\d.]+)\s*\)/);
  const simple = raw.match(/Transfer to ([^:]+)/);
  const toWallet = detailed ? detailed[1].trim() : (simple ? simple[1].trim() : "—");
  const amtOut = Number(tx.action_amount || 0);
  const curOut = fromAccount.currency || "AED";
  if (detailed){
    const amtIn = Number(detailed[4]);
    const curIn = detailed[5];
    const rate = Number(detailed[6]);
    return {
      toWallet,
      amtOut,
      curOut,
      amtIn,
      curIn,
      rate: Number.isFinite(rate) && rate > 0 ? rate : 1,
      sameCurrency: String(detailed[3]).toUpperCase() === String(detailed[5]).toUpperCase()
    };
  }
  return {
    toWallet,
    amtOut,
    curOut,
    amtIn: amtOut,
    curIn: curOut,
    rate: 1,
    sameCurrency: true
  };
}

function buildTransferEvents(){
  const wf = state.expenseWalletFilter;
  const accounts = getExpenseAccounts({ applyUiFilters: false });
  const accountsByGroup = new Map(accounts.map(a => [a.group_id, a]));
  const out = [];
  for (const account of accounts){
    for (const row of account.spends){
      const meta = expenseMetaFromNotes(row.notes);
      if (meta.expenseType !== "Transfer") continue;
      if (!isInDateRange(row.action_date)) continue;
      const partner = findTransferPartnerForExpense(row);
      if (wf !== "all"){
        const hit = account.group_id === wf || (partner && partner.group_id === wf);
        if (!hit) continue;
      }
      const p = parseTransferExpenseDetails(row, account);
      const toAcc = partner ? accountsByGroup.get(partner.group_id) : null;
      out.push({
        expenseId: row.id,
        topupId: partner?.id || null,
        date: row.action_date,
        fromWallet: account.person_name,
        toWallet: p.toWallet,
        fromAccountType: account.accountType,
        toAccountType: toAcc?.accountType || "",
        amtOut: p.amtOut,
        curOut: p.curOut,
        amtIn: p.amtIn,
        curIn: p.curIn,
        rate: p.rate,
        sameCurrency: p.sameCurrency,
        notesExpense: row.notes,
        notesTopup: partner?.notes || ""
      });
    }
  }
  return out.sort((a, b) => dateStamp(b.date) - dateStamp(a.date));
}

function getTransferRowsForCurrency(cur, events){
  const rows = [];
  for (const ev of events){
    if (ev.curOut === cur){
      rows.push({
        kind: "Sent",
        date: ev.date,
        walletName: ev.fromWallet,
        walletLabel: `${ev.fromWallet}${ev.fromAccountType ? ` (${ev.fromAccountType})` : ""}`,
        counterparty: ev.toWallet,
        amount: ev.amtOut,
        rateDisplay: ev.sameCurrency ? "1" : String(ev.rate),
        otherLegDisplay: ev.sameCurrency ? "—" : `${moneyText(ev.amtIn, ev.curIn)}`,
        notes: cleanExpenseNote(ev.notesExpense),
        editId: ev.expenseId
      });
    }
    if (ev.curIn === cur){
      rows.push({
        kind: "Received",
        date: ev.date,
        walletName: ev.toWallet,
        walletLabel: `${ev.toWallet}${ev.toAccountType ? ` (${ev.toAccountType})` : ""}`,
        counterparty: ev.fromWallet,
        amount: ev.amtIn,
        rateDisplay: ev.sameCurrency ? "1" : String(ev.rate),
        otherLegDisplay: ev.sameCurrency ? "—" : `${moneyText(ev.amtOut, ev.curOut)}`,
        notes: cleanExpenseNote(ev.notesTopup || ev.notesExpense),
        editId: ev.topupId || ev.expenseId
      });
    }
  }
  return rows.sort((a, b) => dateStamp(b.date) - dateStamp(a.date));
}

function transferCurrencyTotals(cur, events){
  let sent = 0;
  let received = 0;
  for (const ev of events){
    if (ev.curOut === cur) sent += Number(ev.amtOut || 0);
    if (ev.curIn === cur) received += Number(ev.amtIn || 0);
  }
  return { sent, received };
}

function collectTopupTransactionsFlat(accounts){
  const wf = state.expenseWalletFilter;
  const topupTransactions = [];
  for (const account of accounts){
    if (wf !== "all" && account.group_id !== wf) continue;
    if (account.principal && Number(account.principal.principal_amount || 0) > 0){
      if (isInDateRange(account.principal.loan_date)){
        topupTransactions.push({
          ...account.principal,
          action_date: account.principal.loan_date,
          action_amount: account.principal.principal_amount,
          person_name: account.person_name,
          currency: account.currency,
          accountType: account.accountType,
          isOpeningBalance: true
        });
      }
    }
    for (const topup of account.topups){
      if (!isInDateRange(topup.action_date)) continue;
      topupTransactions.push({
        ...topup,
        person_name: account.person_name,
        currency: account.currency,
        accountType: account.accountType,
        isTopup: true
      });
    }
  }
  return topupTransactions;
}

function filterPrincipal(direction, searchKey = direction){
  return groupByLoan(getActiveEntries().filter(e => e.direction === direction))
    .filter(group => matchesSearch(group.principal || group.actions[0] || {}, state.search[searchKey]));
}

function groupByPerson(direction, searchKey = direction){
  const personMap = new Map();
  const directionEntries = getActiveEntries().filter(e => e.direction === direction);
  const searchTerm = state.search[searchKey];
  const selectedCurrency = state.currencyFilter[searchKey] || "All";

  for (const entry of directionEntries){
    if (!matchesSearch(entry, searchTerm)) continue;
    if (selectedCurrency !== "All" && entry.currency !== selectedCurrency) continue;

    const personKey = String(entry.person_name || "").trim();
    if (!personMap.has(personKey)){
      personMap.set(personKey, {
        person_name: personKey,
        entries: [],
        groupIds: new Set(),
        activityStamp: 0,
        lastActivity: null
      });
    }

    const person = personMap.get(personKey);
    person.entries.push(entry);
    if (entry.group_id) person.groupIds.add(entry.group_id);

    const stamp = Math.max(dateStamp(entry.loan_date), dateStamp(entry.action_date));
    if (stamp >= person.activityStamp){
      person.activityStamp = stamp;
      person.lastActivity = entry.action_date || entry.loan_date || person.lastActivity;
    }
  }

  const people = [];
  for (const person of personMap.values()){
    const principalRows = person.entries.filter(e => e.entry_kind === "principal");
    const actionRows = person.entries.filter(e => e.entry_kind !== "principal");

    const principalTotal = principalRows.reduce((sum, e) => sum + Number(e.principal_amount || 0), 0);
    const paidTotal = actionRows.reduce((sum, e) => sum + Number(e.action_amount || 0), 0);
    const remaining = Math.max(principalTotal - paidTotal, 0);
    const status = remaining <= 0 ? "Closed" : paidTotal > 0 ? "Partial" : "Open";

    const currency = principalRows[0]?.currency || actionRows[0]?.currency || "";

    const timeline = person.entries
      .slice()
      .sort((a, b) => {
        const aStamp = dateStamp(a.entry_kind === "principal" ? a.loan_date : a.action_date);
        const bStamp = dateStamp(b.entry_kind === "principal" ? b.loan_date : b.action_date);
        if (aStamp !== bStamp) return aStamp - bStamp;
        return (a.entry_kind === "principal" ? -1 : 1) - (b.entry_kind === "principal" ? -1 : 1);
      });

    let runningRemaining = 0;
    const rows = timeline.map(entry => {
      const isPrincipal = entry.entry_kind === "principal";
      const amount = Number(isPrincipal ? entry.principal_amount : entry.action_amount || 0);
      runningRemaining = isPrincipal
        ? runningRemaining + amount
        : Math.max(runningRemaining - amount, 0);

      return {
        kind: isPrincipal ? "principal" : (entry.entry_kind === "partial" ? "partial" : "full"),
        date: isPrincipal ? (entry.loan_date || "—") : (entry.action_date || "—"),
        amount,
        remainingAfter: runningRemaining,
        note: entry.notes || "—",
        entryId: entry.id
      };
    });

    const firstDate = timeline[0]
      ? (timeline[0].entry_kind === "principal" ? timeline[0].loan_date : timeline[0].action_date)
      : null;

    people.push({
      person_name: person.person_name,
      currency,
      principalTotal,
      paidTotal,
      remaining,
      status,
      rows,
      loan_date: firstDate || null,
      activityStamp: person.activityStamp,
      lastActivity: person.lastActivity,
      groupCount: person.groupIds.size,
      primaryGroupId: principalRows[0]?.group_id || actionRows[0]?.group_id || ""
    });
  }

  return people.sort((a, b) => {
    const diff = (b.activityStamp || 0) - (a.activityStamp || 0);
    if (diff !== 0) return diff;
    return String(a.person_name || "").localeCompare(String(b.person_name || ""));
  });
}

function getFilteredGroups(direction, searchKey, options = {}){
  let groups = groupByPerson(direction, searchKey);
  if (typeof options.groupFilter === "function"){
    groups = groups.filter(options.groupFilter);
  }
  const filterValue = state.statusFilter[searchKey];
  if (filterValue !== "All"){
    if (filterValue === "Active"){
      groups = groups.filter(g => g.status === "Open" || g.status === "Partial");
    } else {
      groups = groups.filter(g => g.status.toLowerCase() === filterValue.toLowerCase());
    }
  }
  return groups;
}

function renderLoanCards(container, direction, searchKey = direction, options = {}){
  let groups = getFilteredGroups(direction, searchKey, options);

  if (!groups.length){
    container.innerHTML = `<div class="empty">No entries found.</div>`;
    return;
  }

  container.innerHTML = groups.map(group => {
    const statusClass = group.status === "Closed" ? "green" : group.status === "Partial" ? "orange" : "blue";
    const directionLabel = direction === "given" ? "Given" : "Taken";
    const movementLabel = direction === "given" ? "Received back" : "Returned back";
    const openOnly = group.remaining > 0;

    const showInstallmentMove = direction === "taken" && !options.hideMoveToInstallments;
    const personName = String(group.person_name || "").trim();
    const unsyncedEntries = getUnsyncedEntriesForPerson(personName, direction);
    const hasUnsynced = unsyncedEntries.length > 0;
    return `
      <details class="loan">
        <summary>
          <div class="loan-top">
            <div class="lt-main">
              <div class="loan-name"><i class="fa-solid fa-user"></i> ${escapeHtml(group.person_name || "Unnamed")}</div>
              <div class="loan-sub">
                <span>${escapeHtml(directionLabel)}</span>
                <span>Opened ${escapeHtml(displayDate(group.loan_date || "—"))}</span>
                <span>Updated ${escapeHtml(displayDate(group.lastActivity || group.loan_date || "—"))}</span>
                <span>${currencySymbolHtml(group.currency || "")}</span>
                <span>${escapeHtml(`${group.groupCount || 1} loan${(group.groupCount || 1) > 1 ? "s" : ""}`)}</span>
                ${hasUnsynced ? `<span class="badge orange">Not in DB (${unsyncedEntries.length})</span>` : ""}
                ${openOnly ? '<span class="badge orange">Open</span>' : '<span class="badge green">Closed</span>'}
              </div>
            </div>
            <div class="cell lt-status"><small>Status</small><strong><span class="badge ${statusClass}">${escapeHtml(group.status)}</span></strong></div>
            <div class="cell lt-principal"><small>Principal</small><strong>${money(group.principalTotal, group.currency)}</strong></div>
            <div class="cell lt-movement"><small>${escapeHtml(movementLabel)}</small><strong>${money(group.paidTotal, group.currency)}</strong></div>
            <div class="cell lt-remaining"><small>Remaining</small><strong>${money(group.remaining, group.currency)}</strong></div>
            <div class="lt-action">
              <div class="menu-wrap">
                <button class="icon-btn ghost menu-trigger person-menu-btn" type="button" aria-label="More actions" data-person-menu="${escapeHtml(group.primaryGroupId || group.person_name || "menu")}">☰</button>
                <div class="menu-dropdown" data-person-menu-panel="${escapeHtml(group.primaryGroupId || group.person_name || "menu")}">
                  <button class="menu-item personActionBtn" type="button" data-action="pdf" data-person="${encodeURIComponent(group.person_name || "")}" data-direction="${escapeHtml(direction)}"><i class="fa-solid fa-download"></i> Download PDF</button>
                  ${hasUnsynced ? `<button class="menu-item personActionBtn" type="button" data-action="save-db" data-person="${encodeURIComponent(group.person_name || "")}" data-direction="${escapeHtml(direction)}">Save to Database</button>` : ""}
                  <button class="menu-item personActionBtn" type="button" data-action="edit-name" data-person="${encodeURIComponent(group.person_name || "")}" data-direction="${escapeHtml(direction)}">Edit Name</button>
                  ${showInstallmentMove ? `<button class="menu-item personActionBtn" type="button" data-action="move-installment" data-person="${encodeURIComponent(group.person_name || "")}" data-direction="${escapeHtml(direction)}">Move to Installments</button>` : ""}
                  <button class="menu-item danger personActionBtn" type="button" data-action="delete" data-person="${encodeURIComponent(group.person_name || "")}" data-direction="${escapeHtml(direction)}">Delete Record</button>
                </div>
              </div>
              ${hasUnsynced ? `<button class="icon-btn savePersonBtn" type="button" title="Save missing records to database" data-person="${encodeURIComponent(group.person_name || "")}" data-direction="${escapeHtml(direction)}">💾</button>` : ""}
            </div>
          </div>
        </summary>
        <div class="detail">
          <div class="detail-head">
            <div>
              <h4>Timeline</h4>
              <p>Oldest to newest inside each loan. New activity still brings the loan card to the top.</p>
            </div>
            <div class="badge ${statusClass}">${currencySymbolHtml(group.currency || "")}</div>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Remaining</th>
                  <th>Notes</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${group.rows.map((row, index) => `
                  <tr>
                    <td>${escapeHtml(displayDate(row.date))}</td>
                    <td><span class="badge ${row.kind === "principal" ? "blue" : row.kind === "partial" ? "orange" : "green"}">${row.kind === "principal" ? "Principal" : row.kind === "partial" ? "Partial" : "Full"}</span></td>
                    <td>${money(row.amount, group.currency)}</td>
                    <td><strong>${money(row.remainingAfter, group.currency)}</strong></td>
                    <td>
                      <div class="note-wrap">
                        <button type="button" class="note-toggle" data-note-toggle style="color:var(--primary);cursor:pointer;font-weight:600;font-size:.72rem;line-height:1.1;background:none;border:none;padding:0;font-family:inherit;">Note ▾</button>
                        <div class="hide note-popover" style="margin-top:4px;padding:6px;background:var(--bg);border-radius:6px;font-size:.76rem;">
                          <button class="note-close" type="button" data-note-close aria-label="Close note">×</button>
                          ${escapeHtml(row.note)}
                          <div style="color:var(--muted);font-size:.7rem;margin-top:3px">${index === 0 ? "Opening row" : `Linked ${escapeHtml(shortId(row.entryId))}`}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                       <div style="display:flex;gap:4px;">
                         <button class="tiny ghost editRowBtn" data-id="${escapeHtml(row.entryId)}" title="Edit entry">✎</button>
                         <button class="tiny danger delRowBtn" data-id="${escapeHtml(row.entryId)}" title="Delete entry">✕</button>
                       </div>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    `;
  }).join("");

  container.querySelectorAll(".editRowBtn").forEach(btn => btn.addEventListener("click", () => openEditModal(btn.dataset.id)));
  container.querySelectorAll(".delRowBtn").forEach(btn => btn.addEventListener("click", () => deleteEntry(btn.dataset.id)));
  container.querySelectorAll(".personActionBtn").forEach(btn => btn.addEventListener("click", async e => {
    e.preventDefault();
    const action = btn.dataset.action;
    const person = btn.dataset.person;
    const dir = btn.dataset.direction;
    if (action === "pdf") {
      await downloadPersonPDF(person, dir);
    } else if (action === "save-db") {
      await savePersonRecordsToDatabase(person, dir);
    } else if (action === "delete") {
      await deletePersonRecords(person, dir);
    } else if (action === "edit-name") {
      await renamePersonRecords(person, dir);
    } else if (action === "move-installment") {
      await movePersonToInstallments(person, dir);
    }
  }));
  container.querySelectorAll(".savePersonBtn").forEach(btn => btn.addEventListener("click", async e => {
    e.preventDefault();
    await savePersonRecordsToDatabase(btn.dataset.person, btn.dataset.direction);
  }));
  container.querySelectorAll("[data-note-toggle]").forEach(btn => btn.addEventListener("click", e => {
    e.preventDefault();
    const popover = btn.parentElement?.querySelector(".note-popover");
    if (!popover) return;
    document.querySelectorAll(".note-popover").forEach(p => {
      if (p !== popover) p.classList.add("hide");
    });
    popover.classList.toggle("hide");
    if (!popover.classList.contains("hide")) {
      positionNotePopover(btn, popover);
    }
    updateNoteBackdropVisibility();
  }));
  container.querySelectorAll("[data-note-close]").forEach(btn => btn.addEventListener("click", e => {
    e.preventDefault();
    btn.closest(".note-popover")?.classList.add("hide");
    updateNoteBackdropVisibility();
  }));
  container.querySelectorAll("[data-person-menu]").forEach(btn => btn.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    const key = btn.dataset.personMenu;
    const panel = container.querySelector(`[data-person-menu-panel="${key}"]`);
    if (!panel) return;
    document.querySelectorAll(".menu-dropdown.open").forEach(openPanel => {
      if (openPanel !== panel) openPanel.classList.remove("open");
    });
    document.querySelectorAll(".menu-trigger[aria-expanded='true']").forEach(trigger => {
      if (trigger !== btn) trigger.setAttribute("aria-expanded", "false");
    });
    const nowOpen = panel.classList.toggle("open");
    btn.setAttribute("aria-expanded", nowOpen ? "true" : "false");

    // Position the dropdown using fixed positioning
    if (nowOpen) {
      const rect = btn.getBoundingClientRect();
      panel.style.top = `${rect.bottom + 6}px`;
      panel.style.left = `${rect.right - panel.offsetWidth}px`;
      // Ensure dropdown doesn't go off-screen to the right
      if (rect.right - panel.offsetWidth < 10) {
        panel.style.left = `${Math.max(10, rect.left)}px`;
      }
    }
  }));
}

function positionNotePopover(toggleBtn, popover){
  if (!toggleBtn || !popover) return;
  const rect = toggleBtn.getBoundingClientRect();
  const viewportPadding = 8;
  const gap = 6;

  popover.style.position = "fixed";
  popover.style.left = `${Math.max(viewportPadding, rect.left)}px`;
  popover.style.top = `${rect.bottom + gap}px`;
  popover.style.right = "auto";
  popover.style.transform = "none";
  popover.style.zIndex = "9999";

  let popRect = popover.getBoundingClientRect();
  const overflowRight = popRect.right - (window.innerWidth - viewportPadding);
  if (overflowRight > 0){
    popover.style.left = `${Math.max(viewportPadding, rect.left - overflowRight)}px`;
    popRect = popover.getBoundingClientRect();
  }

  const overflowBottom = popRect.bottom - (window.innerHeight - viewportPadding);
  if (overflowBottom > 0){
    const top = Math.max(viewportPadding, rect.top - popRect.height - gap);
    popover.style.top = `${top}px`;
  }
}

function ensureNoteBackdrop(){
  let backdrop = document.getElementById("noteBackdrop");
  if (!backdrop){
    backdrop = document.createElement("div");
    backdrop.id = "noteBackdrop";
    backdrop.className = "note-backdrop hide";
    backdrop.addEventListener("click", () => {
      document.querySelectorAll(".note-popover").forEach(pop => pop.classList.add("hide"));
      backdrop.classList.add("hide");
    });
    document.body.appendChild(backdrop);
  }
  return backdrop;
}

function updateNoteBackdropVisibility(){
  const backdrop = ensureNoteBackdrop();
  const hasOpenPopover = Array.from(document.querySelectorAll(".note-popover")).some(pop => !pop.classList.contains("hide"));
  backdrop.classList.toggle("hide", !hasOpenPopover);
}

function repositionOpenNotePopovers(){
  document.querySelectorAll(".note-wrap").forEach(wrap => {
    const popover = wrap.querySelector(".note-popover");
    const toggle = wrap.querySelector("[data-note-toggle]");
    if (!popover || !toggle || popover.classList.contains("hide")) return;
    positionNotePopover(toggle, popover);
  });
}

function renderLoanSelectors(){
  const givenGroups = groupByLoan(getActiveEntries().filter(e => e.direction === "given")).filter(g => calculateLoan(g).remaining > 0);
  const takenGroups = groupByLoan(getActiveEntries().filter(e => e.direction === "taken" && !hasGoodsTag(e.notes) && !hasExpenseAccountTag(e.notes))).filter(g => calculateLoan(g).remaining > 0);

  const makeOptions = groups => groups.length
    ? `<option value="">Choose one</option>` + groups.map(g => {
        const remaining = calculateLoan(g).remaining;
        return `<option value="${escapeHtml(g.group_id)}">${escapeHtml(g.person_name)} — ${escapeHtml(formatReportAmount(remaining, g.currency))} remaining</option>`;
      }).join("")
    : `<option value="">No open loans available</option>`;

  els.modalLoanSelect.innerHTML = state.modalDirection === "given" ? makeOptions(givenGroups) : makeOptions(takenGroups);

  const hasOptions = (state.modalDirection === "given" ? givenGroups : takenGroups).length > 0;
  els.modalLoanSelect.disabled = !hasOptions;
  els.paymentSubmitBtn.disabled = !hasOptions;
}

function getGoodsGroups(options = {}){
  const applyUiFilters = options.applyUiFilters !== false;
  const groups = groupByLoan(getActiveEntries().filter(e =>
    e.direction === "goods" || (e.direction === "taken" && hasGoodsTag(e.notes))
  ))
    .map(group => {
      const principalMeta = goodsMetaFromNotes(group.principal?.notes);
      const boughtQty = Math.max(1, Number(principalMeta.boughtQty || 1));
      const bought = Number(group.principal?.principal_amount || 0);
      const unitActualPrice = principalMeta.unitActualPrice != null
        ? Number(principalMeta.unitActualPrice)
        : boughtQty ? (bought / boughtQty) : bought;
      const soldQty = group.actions.reduce((sum, row) => sum + Math.max(1, Number(goodsMetaFromNotes(row.notes).soldQty || 1)), 0);
      const soldTotal = group.actions.reduce((sum, row) => sum + Number(row.action_amount || 0), 0);
      const remainingQty = Math.max(boughtQty - soldQty, 0);
      const status = soldQty >= boughtQty ? "Sold" : soldQty > 0 ? "Partial" : "In Stock";
      const soldCostBasis = soldQty > 0 ? unitActualPrice * soldQty : 0;
      const profitLoss = soldQty > 0 ? (soldTotal - soldCostBasis) : 0;
      return {
        ...group,
        bought,
        boughtQty,
        soldQty,
        remainingQty,
        unitActualPrice,
        soldTotal,
        soldCostBasis,
        soldCount: group.actions.length,
        profitLoss,
        status,
        latestSoldDate: group.actions.length
          ? group.actions.slice().sort((a, b) => dateStamp(b.action_date) - dateStamp(a.action_date))[0]?.action_date
          : null
      };
    });

  if (!applyUiFilters) return groups;

  return groups.filter(group => {
      if (!matchesSearch(group.principal || {}, state.search.goods)) return false;
      const f = state.statusFilter.goods;
      if (f === "Open") return group.status === "In Stock" || group.status === "Partial";
      if (f === "Closed") return group.status === "Sold";
      return true;
    });
}

function renderGoodsSelectors(){
  const groups = getGoodsGroups().filter(g => g.remainingQty > 0);
  els.goodsItemSelect.innerHTML = groups.length
    ? `<option value="">Choose bought item</option>${groups.map(g => `<option value="${escapeHtml(g.group_id)}">${escapeHtml(g.person_name)} — Qty ${escapeHtml(String(g.remainingQty))} left</option>`).join("")}`
    : `<option value="">No in-stock items</option>`;
}

async function downloadGoodsItemPDF(groupId){
  const group = getGoodsGroups().find(g => g.group_id === groupId);
  if (!group){
    alert("Item not found.");
    return;
  }
  if (!window.jspdf){
    alert("PDF library loading. Please try again.");
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // Load custom fonts for currency symbols
  await loadCustomFontsForPdf(doc);

  const logoData = await getPdfLogo();
  const title = "Goods Invoice / Receipt";
  const subtitle = `Item: ${group.person_name || "Unnamed"}`;
  drawPdfHeader(doc, logoData, title, subtitle);
  drawPdfOwnerBlock(doc, 48);

  const fmt = amt => formatReportAmount(amt, group.currency);
  doc.setTextColor(23, 33, 43);
  doc.setFontSize(10);
  doc.text(`Status: ${group.status}`, 132, 48);
  doc.text(`Bought Price: ${fmt(group.bought)}`, 132, 54);
  doc.text(`Sold Total: ${fmt(group.soldTotal)}`, 132, 60);
  doc.text(`Bought Date: ${displayDate(group.principal?.loan_date || "—")}`, 132, 66);

  const rows = [
    ["Bought", displayDate(group.principal?.loan_date || "—"), fmt(group.bought), group.principal?.notes || "—"],
    ...group.actions.map(a => ["Sold", displayDate(a.action_date || "—"), fmt(a.action_amount || 0), a.notes || "—"])
  ];
  doc.autoTable({
    startY: 78,
    head: [["Type", "Date", "Amount", "Note"]],
    body: rows,
    theme: "grid",
    headStyles: { fillColor: [36, 87, 214] },
    margin: { top: 50, bottom: 40 },
    didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
  });
  doc.save(`Goods_${String(group.person_name || "item").replace(/\s+/g, "_")}.pdf`);
}

async function downloadGoodsSoldReceiptPDF(entryId){
  const saleEntry = state.entries.find(e => e.id === entryId && (e.direction === "goods" || e.direction === "taken") && e.entry_kind !== "principal" && hasGoodsTag(e.notes));
  if (!saleEntry){
    alert("Sold entry not found.");
    return;
  }
  const principalEntry = state.entries.find(e => e.group_id === saleEntry.group_id && e.entry_kind === "principal");
  if (!principalEntry){
    alert("Original bought record not found.");
    return;
  }
  if (!window.jspdf){
    alert("PDF library loading. Please try again.");
    return;
  }
  const meta = goodsMetaFromNotes(saleEntry.notes);
  const soldQty = Math.max(1, Number(meta.soldQty || 1));
  const unitSoldPrice = meta.unitSoldPrice != null ? Number(meta.unitSoldPrice) : (Number(saleEntry.action_amount || 0) / soldQty);
  const soldTotal = Number(saleEntry.action_amount || 0);

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // Load custom fonts for currency symbols
  await loadCustomFontsForPdf(doc);

  const logoData = await getPdfLogo();
  const title = "Goods Sold Receipt";
  const subtitle = `Receipt ID: ${shortId(saleEntry.id) || "N/A"}`;
  drawPdfHeader(doc, logoData, title, subtitle);
  drawPdfOwnerBlock(doc, 48);

  doc.setTextColor(23, 33, 43);
  doc.setFontSize(10);
  doc.text(`Item: ${principalEntry.person_name || "Unnamed"}`, 132, 48);
  doc.text(`Date: ${displayDate(saleEntry.action_date || "—")}`, 132, 54);
  doc.text(`Currency: ${saleEntry.currency || ""}`, 132, 60);
  doc.text(`Qty Sold: ${soldQty}`, 132, 66);

  doc.autoTable({
    startY: 78,
    head: [["Description", "Qty", "Unit Price", "Total"]],
    body: [[
      principalEntry.person_name || "Goods item",
      String(soldQty),
      formatReportAmount(unitSoldPrice, saleEntry.currency),
      formatReportAmount(soldTotal, saleEntry.currency)
    ]],
    theme: "grid",
    headStyles: { fillColor: [36, 87, 214] },
    margin: { top: 50, bottom: 40 },
    didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
  });

  doc.setFontSize(9.5);
  doc.setTextColor(102, 112, 133);
  doc.text(`Notes: ${String(saleEntry.notes || "—").replace(GOODS_TAG, "").trim() || "—"}`, 14, doc.lastAutoTable.finalY + 10);
  doc.save(`Sold_Receipt_${String(principalEntry.person_name || "item").replace(/\s+/g, "_")}_${String(saleEntry.id || "").slice(0, 6)}.pdf`);
}

function renderGoodsList(){
  const groups = getGoodsGroups();
  if (!groups.length){
    els.goodsList.innerHTML = `<div class="empty">No goods entries found.</div>`;
    return;
  }
  const boughtCount = groups.reduce((sum, g) => sum + Number(g.boughtQty || 0), 0);
  const soldCount = groups.reduce((sum, g) => sum + Number(g.soldQty || 0), 0);
  const stockCount = groups.reduce((sum, g) => sum + Number(g.remainingQty || 0), 0);
  els.goodsList.innerHTML = groups.map(group => {
    const statusClass = group.status === "Sold" ? "green" : "orange";
    const pnlClass = group.profitLoss >= 0 ? "green" : "red";
    const pnlLabel = group.profitLoss >= 0 ? "Profit" : "Loss";
    const soldRows = group.actions
      .slice()
      .sort((a, b) => dateStamp(b.action_date) - dateStamp(a.action_date));
    return `
      <details class="loan">
        <summary>
          <div class="loan-top">
            <div class="lt-main">
              <div class="loan-name"><i class="fa-solid fa-box"></i> ${escapeHtml(group.person_name || "Unnamed item")}</div>
              <div class="loan-sub">
                <span>Bought ${escapeHtml(displayDate(group.principal?.loan_date || "—"))}</span>
                <span>${currencySymbolHtml(group.currency || "")}</span>
                <span>Qty ${escapeHtml(String(group.soldQty))}/${escapeHtml(String(group.boughtQty))}</span>
                <span class="badge ${statusClass}">${escapeHtml(group.status)}</span>
              </div>
            </div>
            <div class="cell lt-principal"><small>Actual total</small><strong>${money(group.bought, group.currency)}</strong></div>
            <div class="cell lt-movement"><small>Sold total</small><strong>${money(group.soldTotal, group.currency)}</strong></div>
            <div class="cell lt-remaining"><small>${pnlLabel}</small><strong><span class="badge ${pnlClass}">${money(Math.abs(group.profitLoss), group.currency)}</span></strong></div>
            <div class="lt-action">
              <div class="menu-wrap">
                <button class="icon-btn ghost menu-trigger person-menu-btn" type="button" data-goods-menu="${escapeHtml(group.group_id)}">☰</button>
                <div class="menu-dropdown" data-goods-menu-panel="${escapeHtml(group.group_id)}">
                  <button class="menu-item goodsActionBtn" type="button" data-action="pdf" data-group-id="${escapeHtml(group.group_id)}"><i class="fa-solid fa-download"></i> Download PDF</button>
                  <button class="menu-item goodsActionBtn" type="button" data-action="edit-bought" data-entry-id="${escapeHtml(group.principal?.id || "")}">Edit Bought</button>
                  <button class="menu-item danger goodsActionBtn" type="button" data-action="delete-item" data-entry-id="${escapeHtml(group.principal?.id || "")}">Delete Item</button>
                </div>
              </div>
            </div>
          </div>
        </summary>
        <div class="detail">
          <div class="table-wrap">
            <table>
              <thead><tr><th>Type</th><th>Date</th><th>Amount</th><th>Notes</th><th>Action</th></tr></thead>
              <tbody>
                ${soldRows.length ? soldRows.map(row => `
                  <tr>
                    <td><span class="badge green">Sold</span></td>
                    <td>${escapeHtml(displayDate(row.action_date || "—"))}</td>
                    <td>${money(row.action_amount || 0, group.currency)}</td>
                    <td>${escapeHtml(row.notes || "—")}</td>
                    <td>
                      <div style="display:flex;gap:4px;">
                        <button class="tiny soldReceiptBtn" data-id="${escapeHtml(row.id)}">PDF</button>
                        <button class="tiny ghost editRowBtn" data-id="${escapeHtml(row.id)}">✎</button>
                        <button class="tiny danger delRowBtn" data-id="${escapeHtml(row.id)}">✕</button>
                      </div>
                    </td>
                  </tr>
                `).join("") : `<tr><td colspan="5">No sold entries yet.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    `;
  }).join("") + `
    <div class="summary" style="margin-top:8px">
      <span>Goods Summary</span>
      <strong>Bought Qty: ${boughtCount} | Sold Qty: ${soldCount} | In Stock Qty: ${stockCount}</strong>
    </div>
  `;

  els.goodsList.querySelectorAll(".goodsActionBtn").forEach(btn => btn.addEventListener("click", async e => {
    e.preventDefault();
    const action = btn.dataset.action;
    if (action === "pdf") await downloadGoodsItemPDF(btn.dataset.groupId);
    if (action === "edit-bought") openEditModal(btn.dataset.entryId);
    if (action === "delete-item") await deleteEntry(btn.dataset.entryId);
  }));
  els.goodsList.querySelectorAll(".soldReceiptBtn").forEach(btn => btn.addEventListener("click", () => downloadGoodsSoldReceiptPDF(btn.dataset.id)));
  els.goodsList.querySelectorAll(".editRowBtn").forEach(btn => btn.addEventListener("click", () => openEditModal(btn.dataset.id)));
  els.goodsList.querySelectorAll(".delRowBtn").forEach(btn => btn.addEventListener("click", () => deleteEntry(btn.dataset.id)));
  els.goodsList.querySelectorAll("[data-goods-menu]").forEach(btn => btn.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    const key = btn.dataset.goodsMenu;
    const panel = els.goodsList.querySelector(`[data-goods-menu-panel="${key}"]`);
    if (!panel) return;
    document.querySelectorAll(".menu-dropdown.open").forEach(openPanel => {
      if (openPanel !== panel) openPanel.classList.remove("open");
    });
    const nowOpen = panel.classList.toggle("open");
    btn.setAttribute("aria-expanded", nowOpen ? "true" : "false");

    // Position the dropdown using fixed positioning
    if (nowOpen) {
      const rect = btn.getBoundingClientRect();
      panel.style.top = `${rect.bottom + 6}px`;
      panel.style.left = `${rect.right - panel.offsetWidth}px`;
      // Ensure dropdown doesn't go off-screen to the right
      if (rect.right - panel.offsetWidth < 10) {
        panel.style.left = `${Math.max(10, rect.left)}px`;
      }
    }
  }));
}

function getExpenseAccounts(options = {}){
  const applyUiFilters = options.applyUiFilters !== false;
  const groups = groupByLoan(getActiveEntries().filter(e => e.direction === "taken" && hasExpenseAccountTag(e.notes)))
    .map(group => {
      const principal = group.principal;
      const principalMeta = expenseMetaFromNotes(principal?.notes);
      const topups = group.actions.filter(a => expenseMetaFromNotes(a.notes).rowType === "TOPUP");
      const spends = group.actions.filter(a => expenseMetaFromNotes(a.notes).rowType === "EXPENSE");
      const openingBalance = Number(principal?.principal_amount || 0);
      const addedMoney = topups.reduce((sum, row) => sum + Number(row.action_amount || 0), 0);
      const spentMoney = spends.reduce((sum, row) => sum + Number(row.action_amount || 0), 0);
      const balance = openingBalance + addedMoney - spentMoney;
      const status = balance > 0 ? "Open" : "Closed";
      return {
        ...group,
        accountType: principalMeta.accountType || "Bank Account",
        openingBalance,
        addedMoney,
        spentMoney,
        balance,
        status,
        topups,
        spends
      };
    });

  if (!applyUiFilters) return groups;

  const searchTerm = state.search.expenses;
  const status = state.statusFilter.expenses;
  const currency = state.currencyFilter.expenses || "All";
  return groups.filter(group => {
    const blob = `${group.person_name || ""} ${group.accountType || ""} ${group.principal?.notes || ""} ${group.spends.map(s => expenseMetaFromNotes(s.notes).itemName).join(" ")} ${group.spends.map(s => expenseMetaFromNotes(s.notes).expenseType).join(" ")}`;
    if (searchTerm && !blob.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (currency !== "All" && group.currency !== currency) return false;
    if (status === "Active") return group.status === "Open";
    if (status === "Closed") return group.status === "Closed";
    return true;
  });
}

function getExistingItemNamesLowerForCurrency(currency){
  const set = new Set();
  const cur = String(currency || "").trim();
  for (const account of getExpenseAccounts({ applyUiFilters: false })){
    if (account.currency !== cur) continue;
    for (const row of account.spends){
      const meta = expenseMetaFromNotes(row.notes);
      const n = String(meta.itemName || "").trim().toLowerCase();
      if (n) set.add(n);
    }
  }
  return set;
}

function refreshExpenseItemIntentUi(){
  const wrap = els.expenseItemIntentWrap;
  if (!wrap || !els.expenseEntryForm || els.expenseEntryForm.classList.contains("hide")) return;
  const fd = new FormData(els.expenseEntryForm);
  const item = String(fd.get("item_name") || "").trim().toLowerCase();
  const cur = String(fd.get("currency") || "").trim();
  if (!item || !cur){
    wrap.classList.add("hide");
    return;
  }
  const exists = getExistingItemNamesLowerForCurrency(cur).has(item);
  wrap.classList.toggle("hide", !exists);
  if (!exists){
    const r = els.expenseEntryForm.querySelector('input[name="expense_item_intent"][value="additional"]');
    if (r) r.checked = true;
  }
}

function isInDateRange(dateStr){
  if (!state.expenseDateFrom && !state.expenseDateTo) return true;
  const d = dateStamp(dateStr);
  if (!d) return true;
  if (state.expenseDateFrom && d < dateStamp(state.expenseDateFrom)) return false;
  if (state.expenseDateTo && d > dateStamp(state.expenseDateTo + "T23:59:59")) return false;
  return true;
}

function collectExpenseSpendRows(accounts){
  const out = [];
  const wf = state.expenseWalletFilter;
  for (const account of accounts){
    if (wf !== "all" && account.group_id !== wf) continue;
    for (const row of account.spends){
      if (!isInDateRange(row.action_date)) continue;
      out.push({ row, account });
    }
  }
  return out;
}


function groupExpenseItems(spendAttached){
  const map = new Map();
  for (const { row, account } of spendAttached){
    const meta = expenseMetaFromNotes(row.notes);
    const nameRaw = String(meta.itemName || "").trim();
    if (!nameRaw) continue;
    const currency = account.currency || "AED";
    const key = `${currency}||${nameRaw.toLowerCase()}`;
    if (!map.has(key)){
      map.set(key, {
        key,
        displayName: nameRaw,
        expenseType: meta.expenseType || "",
        currency,
        total: 0,
        txs: []
      });
    }
    const g = map.get(key);
    g.total += Number(row.action_amount || 0);
    g.txs.push({
      id: row.id,
      date: row.action_date,
      wallet: account.person_name,
      group_id: account.group_id,
      amount: Number(row.action_amount || 0),
      expenseType: meta.expenseType || "",
      notes: cleanExpenseNote(row.notes)
    });
  }
  for (const g of map.values()){
    g.txs.sort((a, b) => dateStamp(b.date) - dateStamp(a.date));
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

function walletRadioSafeId(groupId){
  return String(groupId || "").replace(/[^a-zA-Z0-9-]/g, "-");
}

function renderExpenseWalletBar(accounts){
  const host = els.expenseWalletFilters;
  if (!host) return;

  const blocks = [];
  const allId = "f_exp_wallet_all";
  const allChecked = state.expenseWalletFilter === "all" ? "checked" : "";
  blocks.push(`
    <div class="expense-wallet-card-wrap">
      <input type="radio" id="${allId}" name="f_exp_wallet" value="all" class="filter-radio expense-wallet-radio" ${allChecked}>
      <label for="${allId}" class="expense-wallet-card expense-wallet-card-all">
        <span class="expense-wallet-title">All wallets</span>
        <span class="expense-wallet-sub">Expense statement includes every wallet below.</span>
      </label>
    </div>
  `);

  for (const a of accounts){
    const rid = `f_exp_wallet_${walletRadioSafeId(a.group_id)}`;
    const ck = state.expenseWalletFilter === a.group_id ? "checked" : "";
    const totalTopup = Number(a.openingBalance || 0) + Number(a.addedMoney || 0);
    const gid = escapeHtml(a.group_id);
    
    // Calculate USD equivalent for BTC wallets
    let btcUsdEquivalent = "";
    if (a.currency === "BTC") {
      const btcBalance = Number(a.balance || 0);
      console.log(`Rendering BTC wallet ${a.group_id} with balance: ${btcBalance}, price available: ${!!state.bitcoin.btcPrice}`);
      
      if (btcBalance > 0) {
        // Always calculate USD equivalent, even if price is not available
        const usdValue = state.bitcoin.btcPrice ? 
          (btcBalance * state.bitcoin.btcPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) :
          '0.00';
        
        btcUsdEquivalent = `<span class="btc-usd-equivalent"><em>≈ $</em> <strong>${usdValue}</strong></span>`;
        
        // If no price available, fetch it and update
        if (!state.bitcoin.btcPrice) {
          console.log('No price available, fetching for BTC wallet');
          btcFetchPrice().then(priceData => {
            if (priceData && priceData.price) {
              const updatedUsd = (btcBalance * priceData.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              console.log(`Updating BTC wallet ${a.group_id} with USD: ${updatedUsd}`);
              
              // Find and update the USD equivalent element
              setTimeout(() => {
                const walletElement = document.querySelector(`[data-group-id="${gid}"] .btc-usd-equivalent`);
                if (walletElement) {
                  console.log('Found USD element, updating with:', updatedUsd);
                  walletElement.innerHTML = `<span class="btc-usd-equivalent"><em>≈ $</em> <strong>${updatedUsd}</strong></span>`;
                } else {
                  console.log('USD element not found for wallet:', a.group_id);
                }
              }, 100);
            }
          }).catch(err => console.error('Failed to fetch price for BTC wallet:', err));
        }
      }
    }
    
    blocks.push(`
      <div class="expense-wallet-card-wrap">
        <input type="radio" id="${rid}" name="f_exp_wallet" value="${gid}" class="filter-radio expense-wallet-radio" ${ck}>
        <label for="${rid}" class="expense-wallet-card">
          <span class="expense-wallet-title">${getWalletIconHtml(a.person_name || "Wallet", 18)} ${escapeHtml(a.person_name || "Wallet")} (${escapeHtml(formatReportAmount(totalTopup, a.currency))})</span>
          <span class="expense-wallet-sub">${escapeHtml(a.accountType || "")} · ${currencySymbolHtml(a.currency)}</span>
          <div class="expense-wallet-stats">
            <span><em>Top-up</em> <strong>${escapeHtml(formatReportAmount(totalTopup, a.currency))}</strong></span>
            <span><em>Spent</em> <strong>${escapeHtml(formatReportAmount(a.spentMoney, a.currency))}</strong></span>
            <span class="available-label"><em style="color: var(--success) !important;">Available</em> <strong class="available-amount">${escapeHtml(formatReportAmount(a.balance, a.currency))}</strong></span>
            ${btcUsdEquivalent}
          </div>
        </label>
        <div class="expense-wallet-actions">
          <button type="button" class="expenseWalletQuick" data-action="topup" data-group-id="${gid}">Add money</button>
          <button type="button" class="expenseWalletQuick" data-action="expense" data-group-id="${gid}">Add expense</button>
          <button type="button" class="expenseWalletQuick" data-action="pdf" data-group-id="${gid}">PDF</button>
          <button type="button" class="expenseWalletQuick" data-action="edit-account" data-entry-id="${escapeHtml(a.principal?.id || "")}">Edit</button>
          <button type="button" class="expenseWalletQuick danger" data-action="delete-account" data-entry-id="${escapeHtml(a.principal?.id || "")}">Delete</button>
        </div>
      </div>
    `);
  }

  host.innerHTML = blocks.join("");

  host.querySelectorAll('input[name="f_exp_wallet"]').forEach(inp => {
    inp.addEventListener("change", () => {
      state.expenseWalletFilter = inp.value;
      renderExpensesList();
    });
  });

  host.querySelectorAll(".expenseWalletQuick").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.preventDefault();
      e.stopPropagation();
      const action = btn.dataset.action;
      if (action === "pdf") await downloadExpenseAccountPDF(btn.dataset.groupId);
      if (action === "topup") openExpenseModal("topup", btn.dataset.groupId);
      if (action === "expense") openExpenseModal("expense", btn.dataset.groupId);
      if (action === "edit-account") openEditModal(btn.dataset.entryId);
      if (action === "delete-account") await deleteEntry(btn.dataset.entryId);
    });
  });
}

function renderExpenseAccountSelectors(){
  const accounts = getExpenseAccounts({ applyUiFilters: false });
  const byCurrency = accounts.reduce((acc, account) => {
    const key = account.currency || "";
    acc[key] = acc[key] || [];
    acc[key].push(account);
    return acc;
  }, {});

  els.expenseTopupAccountSelect.innerHTML = accounts.length
    ? `<option value="">Choose account</option>${accounts.map(a => `<option value="${escapeHtml(a.group_id)}">${escapeHtml(a.person_name)} (${escapeHtml(a.accountType)}) - ${escapeHtml(formatReportAmount(a.balance, a.currency))}</option>`).join("")}`
    : `<option value="">No accounts found</option>`;

  const chosenCurrency = els.expenseCurrencySelect.value || "AED";
  const currencyAccounts = byCurrency[chosenCurrency] || [];
  els.expenseSpendAccountSelect.innerHTML = currencyAccounts.length
    ? `<option value="">Choose account</option>${currencyAccounts.map(a => `<option value="${escapeHtml(a.group_id)}">${escapeHtml(a.person_name)} (${escapeHtml(a.accountType)}) - ${escapeHtml(formatReportAmount(a.balance, a.currency))}</option>`).join("")}`
    : `<option value="">No account in ${escapeHtml(chosenCurrency)}</option>`;
}

function openExpenseModal(mode, presetGroupId = ""){
  els.expenseModal.classList.remove("hide");
  els.expenseModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  els.expenseAccountForm.classList.toggle("hide", mode !== "account");
  els.expenseTopupForm.classList.toggle("hide", mode !== "topup");
  els.expenseEntryForm.classList.toggle("hide", mode !== "expense");
  renderExpenseAccountSelectors();

  if (mode === "account"){
    els.expenseModalTitle.textContent = "Add Expense Account";
    els.expenseModalDesc.textContent = "Create Bank or Cash account with opening balance.";
    els.expenseAccountForm.reset();
    setCurrencyChoice(els.expenseAccountForm, state.lastCurrency || "AED");
    defaultDateInputs(els.expenseAccountForm);
  } else if (mode === "topup"){
    els.expenseModalTitle.textContent = "Add Money";
    els.expenseModalDesc.textContent = "Add funds to an existing expense account.";
    els.expenseTopupForm.reset();
    defaultDateInputs(els.expenseTopupForm);
    if (presetGroupId) els.expenseTopupAccountSelect.value = presetGroupId;
  } else {
    els.expenseModalTitle.textContent = "Add Expense";
    els.expenseModalDesc.textContent = "Record expense item, amount, type and source account.";
    els.expenseEntryForm.reset();
    els.expenseCurrencySelect.value = state.lastCurrency || "AED";
    renderExpenseAccountSelectors();
    defaultDateInputs(els.expenseEntryForm);
    if (presetGroupId) els.expenseSpendAccountSelect.value = presetGroupId;
    const intentAdd = els.expenseEntryForm.querySelector('input[name="expense_item_intent"][value="additional"]');
    if (intentAdd) intentAdd.checked = true;
    if (els.expenseItemIntentWrap) els.expenseItemIntentWrap.classList.add("hide");
    refreshExpenseItemIntentUi();
  }
}

async function saveExpenseAccount(form){
  const fd = new FormData(form);
  const payload = {
    group_id: crypto.randomUUID(),
    direction: "taken",
    entry_kind: "principal",
    person_name: String(fd.get("account_name") || "").trim(),
    currency: String(fd.get("currency") || "AED").trim(),
    principal_amount: Number(fd.get("opening_balance") || 0),
    action_amount: null,
    loan_date: String(fd.get("account_date") || ""),
    action_date: null,
    notes: upsertExpenseMetaInNote(String(fd.get("notes") || "").trim() || null, {
      accountType: String(fd.get("account_type") || "Bank Account"),
      rowType: "ACCOUNT"
    })
  };
  if (!payload.person_name || !payload.currency || payload.principal_amount === "" || payload.principal_amount === null || payload.principal_amount === undefined || !payload.loan_date){
    throw new Error("Complete all required fields.");
  }
  if (isBackupMode()){
    state.entries.unshift({ ...payload, id: crypto.randomUUID(), created_at: new Date().toISOString() });
    refreshBackupView();
  } else {
    await supabase(CONFIG.table, { method: "POST", body: JSON.stringify(payload) });
    await loadEntriesFromSupabase();
  }
  closeModal("expenseModal");
}

async function saveExpenseTopup(form){
  const fd = new FormData(form);
  const groupId = String(fd.get("group_id") || "");
  const amount = Number(fd.get("amount") || 0);
  const date = String(fd.get("date") || "");
  const notes = String(fd.get("notes") || "").trim() || null;
  if (!groupId || !amount || !date) throw new Error("Complete all required fields.");
  const principal = state.entries.find(e => e.group_id === groupId && e.direction === "taken" && e.entry_kind === "principal" && hasExpenseAccountTag(e.notes));
  if (!principal) throw new Error("Account not found.");
  const payload = {
    group_id: groupId,
    direction: "taken",
    entry_kind: "partial",
    person_name: principal.person_name,
    currency: principal.currency,
    principal_amount: null,
    action_amount: amount,
    loan_date: principal.loan_date,
    action_date: date,
    notes: upsertExpenseMetaInNote(notes, {
      accountType: expenseMetaFromNotes(principal.notes).accountType || "Bank Account",
      rowType: "TOPUP"
    })
  };
  if (isBackupMode()){
    state.entries.unshift({ ...payload, id: crypto.randomUUID(), created_at: new Date().toISOString() });
    refreshBackupView();
  } else {
    await supabase(CONFIG.table, { method: "POST", body: JSON.stringify(payload) });
    await loadEntriesFromSupabase();
  }
  
  // Show money added success overlay
  showMoneyAddedSuccessOverlay(principal.person_name, amount, principal.currency);
  
  closeModal("expenseModal");
}

async function saveExpenseEntry(form){
  const fd = new FormData(form);
  const groupId = String(fd.get("group_id") || "");
  const selectedCurrency = String(fd.get("currency") || "").trim();
  const amount = Number(fd.get("amount") || 0);
  const date = String(fd.get("date") || "");
  const itemName = String(fd.get("item_name") || "").trim();
  const expenseType = String(fd.get("custom_expense_type") || "").trim() || String(fd.get("expense_type") || "").trim() || "Other";
  const notes = String(fd.get("notes") || "").trim() || null;
  const itemIntent = String(fd.get("expense_item_intent") || "additional");
  if (!groupId || amount === "" || amount === null || amount === undefined || !date || !itemName) throw new Error("Complete all required fields.");
  const account = getExpenseAccounts({ applyUiFilters: false }).find(a => a.group_id === groupId);
  if (!account) throw new Error("Account not found.");
  if (selectedCurrency && account.currency !== selectedCurrency){
    throw new Error("Selected currency does not match the account currency.");
  }
  const nameLower = itemName.toLowerCase();
  const existingNames = getExistingItemNamesLowerForCurrency(account.currency);
  if (existingNames.has(nameLower) && itemIntent === "new_distinct"){
    throw new Error("This item name already exists. Either choose \"More spending on the same item\" or enter a different item name.");
  }
  if (amount > account.balance) throw new Error(`Insufficient balance. Available: ${formatReportAmount(account.balance, account.currency)}.`);
  const payload = {
    group_id: groupId,
    direction: "taken",
    entry_kind: "partial",
    person_name: account.person_name,
    currency: account.currency,
    principal_amount: null,
    action_amount: amount,
    loan_date: account.principal?.loan_date || todayISO(),
    action_date: date,
    notes: upsertExpenseMetaInNote(notes, {
      accountType: account.accountType,
      rowType: "EXPENSE",
      itemName,
      expenseType
    })
  };
  if (isBackupMode()){
    state.entries.unshift({ ...payload, id: crypto.randomUUID(), created_at: new Date().toISOString() });
    refreshBackupView();
  } else {
    await supabase(CONFIG.table, { method: "POST", body: JSON.stringify(payload) });
    await loadEntriesFromSupabase();
  }
  closeModal("expenseModal");
}

async function downloadExpenseAccountPDF(groupId){
  const account = getExpenseAccounts({ applyUiFilters: false }).find(a => a.group_id === groupId);
  if (!account){
    alert("Account not found.");
    return;
  }
  if (!window.jspdf){
    alert("PDF library loading. Please try again.");
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // Load custom fonts for currency symbols
  await loadCustomFontsForPdf(doc);

  const logoData = await getPdfLogo();
  const title = "Expense Account Report";
  const subtitle = `Account: ${account.person_name}`;
  drawPdfHeader(doc, logoData, title, subtitle);
  drawPdfOwnerBlock(doc, 48);
  doc.setFontSize(10);
  doc.setTextColor(23, 33, 43);
  doc.text(`Type: ${account.accountType}`, 132, 48);
  doc.text(`Currency: ${account.currency}`, 132, 54);
  doc.text(`Balance: ${formatPdfAmount(account.balance, account.currency)}`, 132, 60);
  
  // Add USD equivalent for BTC wallets
  if (account.currency === "BTC" && account.balance > 0 && state.bitcoin.btcPrice) {
    const usdValue = (account.balance * state.bitcoin.btcPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    doc.setTextColor(102, 112, 133); // Muted color
    doc.text(`~ $${usdValue}`, 132, 66);
    doc.setFontSize(8);
    doc.setTextColor(153, 163, 180); // Lighter muted color
    doc.text(`* USD value as of statement generation`, 132, 72);
  }

  let runningBalance = Number(account.openingBalance || 0);
  const rows = [
    ["Opening", displayDate(account.principal?.loan_date || "—"), "—", formatPdfAmount(account.openingBalance, account.currency), formatPdfAmount(runningBalance, account.currency), cleanExpenseNote(account.principal?.notes)]
  ];
  const timeline = account.actions.slice().sort((a, b) => dateStamp(a.action_date) - dateStamp(b.action_date));
  timeline.forEach(row => {
    const meta = expenseMetaFromNotes(row.notes);
    const isExpense = meta.rowType === "EXPENSE";
    const amt = Number(row.action_amount || 0);
    runningBalance = isExpense ? runningBalance - amt : runningBalance + amt;
    rows.push([
      isExpense ? `Expense (${meta.expenseType || "Other"})` : "Topup",
      displayDate(row.action_date || "—"),
      isExpense ? (meta.itemName || "—") : "—",
      formatPdfAmount(amt, account.currency),
      formatPdfAmount(runningBalance, account.currency),
      cleanExpenseNote(row.notes)
    ]);
  });

  doc.autoTable({
    startY: 72,
    head: [["Type", "Date", "Item", "Amount", "Balance", "Remarks"]],
    body: rows,
    theme: "grid",
    headStyles: { fillColor: [36, 87, 214] },
    margin: { top: 50, bottom: 40 },
    didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
  });
  doc.save(`Expense_Account_${String(account.person_name || "account").replace(/\s+/g, "_")}.pdf`);
}

function filterExpensesBySearch(expenses, searchTerm){
  if (!searchTerm || searchTerm.trim() === "") return expenses;
  
  const term = searchTerm.toLowerCase().trim();
  return expenses.filter(expense => {
    // For expense items (from groupExpenseItems)
    if (expense.displayName !== undefined) {
      const itemMatch = (expense.displayName && expense.displayName.toLowerCase().includes(term)) ||
                        (expense.expenseType && expense.expenseType.toLowerCase().includes(term));
      // Also search in nested transactions (both raw and cleaned notes)
      const txMatch = expense.txs && expense.txs.some(tx =>
        (tx.wallet && tx.wallet.toLowerCase().includes(term)) ||
        (tx.notes && (tx.notes.toLowerCase().includes(term) || cleanExpenseNote(tx.notes).toLowerCase().includes(term))) ||
        (tx.expenseType && tx.expenseType.toLowerCase().includes(term))
      );
      return itemMatch || txMatch;
    }
    
    // For transfer events (from buildTransferEvents)
    if (expense.fromWallet !== undefined) {
      return (expense.fromWallet && expense.fromWallet.toLowerCase().includes(term)) ||
             (expense.toWallet && expense.toWallet.toLowerCase().includes(term)) ||
             (expense.fromAccountType && expense.fromAccountType.toLowerCase().includes(term)) ||
             (expense.toAccountType && expense.toAccountType.toLowerCase().includes(term)) ||
             (expense.notesExpense && (expense.notesExpense.toLowerCase().includes(term) || cleanExpenseNote(expense.notesExpense).toLowerCase().includes(term))) ||
             (expense.notesTopup && (expense.notesTopup.toLowerCase().includes(term) || cleanExpenseNote(expense.notesTopup).toLowerCase().includes(term)));
    }
    
    // For topup transactions (from collectTopupTransactionsFlat)
    if (expense.person_name !== undefined) {
      return (expense.person_name && expense.person_name.toLowerCase().includes(term)) ||
             (expense.notes && (expense.notes.toLowerCase().includes(term) || cleanExpenseNote(expense.notes).toLowerCase().includes(term))) ||
             (expense.accountType && expense.accountType.toLowerCase().includes(term));
    }
    
    // Fallback: search in common fields (both raw and cleaned notes)
    return (expense.displayName && expense.displayName.toLowerCase().includes(term)) ||
           (expense.wallet && expense.wallet.toLowerCase().includes(term)) ||
           (expense.notes && (expense.notes.toLowerCase().includes(term) || cleanExpenseNote(expense.notes).toLowerCase().includes(term))) ||
           (expense.expenseType && expense.expenseType.toLowerCase().includes(term)) ||
           (expense.person_name && expense.person_name.toLowerCase().includes(term)) ||
           (expense.accountType && expense.accountType.toLowerCase().includes(term));
  });
}

function renderExpensesList(){
  const accounts = getExpenseAccounts();
  const validIds = new Set(accounts.map(a => a.group_id));
  if (state.expenseWalletFilter !== "all" && !validIds.has(state.expenseWalletFilter)){
    state.expenseWalletFilter = "all";
  }
  renderExpenseWalletBar(accounts);

  if (!accounts.length){
    els.expensesList.innerHTML = `<div class="empty">No expense accounts found.</div>`;
    return;
  }

  // Check if any expense filters are active
  const isExpenseFilterActive = (
    (state.search.expenses && state.search.expenses.trim() !== "") ||
    (state.expenseDateFrom && state.expenseDateFrom.trim() !== "") ||
    (state.expenseDateTo && state.expenseDateTo.trim() !== "") ||
    (state.currencyFilter.expenses && state.currencyFilter.expenses !== "All") ||
    (state.expenseWalletFilter && state.expenseWalletFilter !== "all") ||
    (state.statusFilter.expenses && state.statusFilter.expenses !== "All")
  );

  let html = "";

  const accountsForTopups = getExpenseAccounts({ applyUiFilters: false });
  let topupTransactions = collectTopupTransactionsFlat(accountsForTopups);
  
  // Apply search filtering to top-up transactions
  if (state.search.expenses && state.search.expenses.trim() !== "") {
    topupTransactions = filterExpensesBySearch(topupTransactions, state.search.expenses);
  }
  
  const topupByCurrency = new Map();
  for (const tx of topupTransactions){
    const c = tx.currency || "AED";
    if (!topupByCurrency.has(c)) topupByCurrency.set(c, []);
    topupByCurrency.get(c).push(tx);
  }
  const topupCurrencies = sortCurrenciesList([...topupByCurrency.keys()]);

  if (topupTransactions.length > 0){
    html += `<details class="expense-collapsible-section" id="topupRecordsSection" ${isExpenseFilterActive ? 'open' : ''}>
      <summary class="expense-collapsible-header">
        <h4 class="expense-section-title"><i class="fa-solid fa-money-bill-wave"></i> Top-Up Records</h4>
        <span class="expand-icon">▶</span>
      </summary>
      <div class="expense-collapsible-content">
        <div class="expense-section-toolbar"><span class="expense-toolbar-hint">PDF per currency row below. Combined report covers every currency.</span>
          <button type="button" class="icon-btn ghost expenseActionBtn" data-action="pdf" data-type="all-topups" title="Download PDF (all currencies)"><i class="fa-solid fa-download"></i></button>
        </div>`;
    for (const cur of topupCurrencies){
      const txs = topupByCurrency.get(cur).slice().sort((a, b) => dateStamp(b.action_date || b.loan_date) - dateStamp(a.action_date || a.loan_date));
      const totalCur = txs.reduce((sum, tx) => sum + Number(tx.action_amount || 0), 0);
      html += `
      <details class="loan expense-item-row expense-by-currency">
        <summary>
          <div class="loan-top">
            <div class="lt-main">
              <div class="loan-name">Top-Up — ${currencySymbolHtml(cur)}</div>
              <div class="loan-sub">
                <span class="badge green">Money In</span>
                <span>${txs.length} transaction(s)</span>
                ${currencySymbolHtml(cur)}
              </div>
            </div>
            <div class="cell expense-item-total">
              <small>Total (${currencySymbolHtml(cur)})</small>
              <strong>${escapeHtml(moneyText(totalCur, cur))}</strong>
            </div>
            <div class="lt-action">
              <button type="button" class="icon-btn ghost expenseActionBtn" data-action="pdf" data-type="topups-by-currency" data-currency="${escapeHtml(cur)}" title="Download PDF (${escapeHtml(cur)})" style="font-size: 0.9rem;"><i class="fa-solid fa-download"></i></button>
            </div>
          </div>
        </summary>
        <div class="detail">
          <div class="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Wallet</th><th>Type</th><th>Amount</th><th>Notes</th><th>Action</th></tr></thead>
              <tbody>
                ${txs.map(tx => `
                  <tr>
                    <td>${escapeHtml(displayDate(tx.action_date || tx.loan_date || "—"))}</td>
                    <td>${getWalletIconHtml(tx.person_name || "Wallet", 16)} ${escapeHtml(tx.person_name || "—")} (${escapeHtml(tx.accountType || "")})</td>
                    <td><span class="badge green">${tx.isOpeningBalance ? "Opening Balance" : "Top-up"}</span></td>
                    <td style="color: var(--success);">${money(tx.action_amount, cur)}</td>
                    <td class="expense-item-detail-note">${escapeHtml(cleanExpenseNote(tx.notes))}</td>
                    <td>
                      <div style="display:flex;gap:4px;">
                        <button class="tiny ghost editRowBtn" data-id="${escapeHtml(tx.id)}">✎</button>
                        <button class="tiny danger delRowBtn" data-id="${escapeHtml(tx.id)}">✕</button>
                      </div>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </details>`;
    }
    html += `</div></details>`;
  }

  let transferEvents = buildTransferEvents();
  
  // Apply search filtering to transfer events
  if (state.search.expenses && state.search.expenses.trim() !== "") {
    transferEvents = filterExpensesBySearch(transferEvents, state.search.expenses);
  }
  
  const transferCurrencySet = new Set();
  for (const ev of transferEvents){
    transferCurrencySet.add(ev.curOut);
    transferCurrencySet.add(ev.curIn);
  }
  const transferCurrencies = sortCurrenciesList([...transferCurrencySet]);

  if (transferEvents.length > 0 && transferCurrencies.length > 0){
    html += `<details class="expense-collapsible-section" id="transferRecordsSection" ${isExpenseFilterActive ? 'open' : ''}>
      <summary class="expense-collapsible-header">
        <h4 class="expense-section-title"><i class="fa-solid fa-arrow-right-arrow-left"></i> Transfer Records</h4>
        <span class="expand-icon">▶</span>
      </summary>
      <div class="expense-collapsible-content">
        <div class="expense-section-toolbar"><span class="expense-toolbar-hint">Sent and received are shown per currency using the conversion rate recorded on transfer.</span>
          <button type="button" class="icon-btn ghost expenseActionBtn" data-action="pdf" data-type="all-transfers" title="Download PDF (all currencies)"><i class="fa-solid fa-download"></i></button>
        </div>`;
    for (const cur of transferCurrencies){
      const rows = getTransferRowsForCurrency(cur, transferEvents);
      if (!rows.length) continue;
      const { sent, received } = transferCurrencyTotals(cur, transferEvents);
      html += `
      <details class="loan expense-item-row expense-by-currency">
        <summary>
          <div class="loan-top">
            <div class="lt-main">
              <div class="loan-name">Transfers — ${currencySymbolHtml(cur)}</div>
              <div class="loan-sub">
                <span class="badge orange">Money moved</span>
                <span>${rows.length} row(s)</span>
                ${currencySymbolHtml(cur)}
              </div>
            </div>
            <div class="cell expense-item-total expense-transfer-totals">
              <div><small>Sent (${currencySymbolHtml(cur)})</small><strong>${escapeHtml(moneyText(sent, cur))}</strong></div>
              <div><small>Received (${currencySymbolHtml(cur)})</small><strong>${escapeHtml(moneyText(received, cur))}</strong></div>
            </div>
            <div class="lt-action">
              <button type="button" class="icon-btn ghost expenseActionBtn" data-action="pdf" data-type="transfers-by-currency" data-currency="${escapeHtml(cur)}" title="Download PDF (${escapeHtml(cur)})" style="font-size: 0.9rem;"><i class="fa-solid fa-download"></i></button>
            </div>
          </div>
        </summary>
        <div class="detail">
          <div class="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Type</th><th>Wallet</th><th>With</th><th>Amount</th><th>Rate<br/><span style="font-weight:normal">(1 From = ? To)</span></th><th>Converted leg</th><th>Notes</th><th>Action</th></tr></thead>
              <tbody>
                ${rows.map(r => {
                  const amountStyle = r.kind === "Sent" ? "color: var(--danger);" : "color: var(--success);";
                  const badgeCls = r.kind === "Sent" ? "orange" : "green";
                  return `
                    <tr>
                      <td>${escapeHtml(displayDate(r.date || "—"))}</td>
                      <td><span class="badge ${badgeCls}">${escapeHtml(r.kind)}</span></td>
                      <td>${getWalletIconHtml(r.walletName || "Wallet", 16)} ${escapeHtml(r.walletLabel)}</td>
                      <td>${escapeHtml(r.counterparty || "—")}</td>
                      <td style="${amountStyle}">${money(r.amount, cur)}</td>
                      <td>${escapeHtml(r.rateDisplay)}</td>
                      <td>${escapeHtml(r.otherLegDisplay)}</td>
                      <td class="expense-item-detail-note">${escapeHtml(r.notes)}</td>
                      <td>
                        <div style="display:flex;gap:4px;">
                          <button class="tiny ghost editRowBtn" data-id="${escapeHtml(r.editId)}">✎</button>
                          <button class="tiny danger delRowBtn" data-id="${escapeHtml(r.editId)}">✕</button>
                        </div>
                      </td>
                    </tr>`;
                }).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </details>`;
    }
    html += `</div></details>`;
  }

  // Expense items (non-transfer spending), grouped by item
  const spendAttached = collectExpenseSpendRows(accounts);
  let items = groupExpenseItems(spendAttached);
  
  // Apply search filtering to expense items
  if (state.search.expenses && state.search.expenses.trim() !== "") {
    items = filterExpensesBySearch(items, state.search.expenses);
  }
  
  if (items.length > 0) {
    html += `<details class="expense-collapsible-section" id="transactionsHistorySection" ${isExpenseFilterActive ? 'open' : ''}>
      <summary class="expense-collapsible-header">
        <h4 class="expense-section-title"><i class="fa-solid fa-list-ul"></i> Transactions History</h4>
        <span class="expand-icon">▶</span>
      </summary>
      <div class="expense-collapsible-content">`;
    html += items.map(item => `
      <details class="loan expense-item-row">
        <summary>
          <div class="loan-top">
            <div class="lt-main">
              <div class="loan-name">${escapeHtml(item.displayName)}</div>
              <div class="loan-sub">
                ${item.expenseType ? `<span class="badge blue">${escapeHtml(item.expenseType)}</span>` : `<span class="badge blue">Other</span>`}
                <span>${item.txs.length} transaction(s)</span>
                <span>${currencySymbolHtml(item.currency || "")}</span>
              </div>
            </div>
            <div class="cell expense-item-total">
              <small>Total spent</small>
              <strong>${money(item.total, item.currency)}</strong>
            </div>
            <div class="lt-action">
              <button class="icon-btn ghost" onclick="downloadExpenseItemPDF('${escapeHtml(item.key)}')" title="Download PDF" style="font-size: 0.9rem;"><i class="fa-solid fa-download"></i></button>
            </div>
          </div>
        </summary>
        <div class="detail">
          <div class="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Wallet</th><th>Type</th><th>Amount</th><th>Notes</th><th>Action</th></tr></thead>
              <tbody>
                ${item.txs.map(tx => `
                  <tr>
                    <td>${escapeHtml(displayDate(tx.date || "—"))}</td>
                    <td>${getWalletIconHtml(tx.wallet || "Wallet", 16)} ${escapeHtml(tx.wallet || "—")}</td>
                    <td>${escapeHtml(tx.expenseType || "—")}</td>
                    <td>${money(tx.amount, item.currency)}</td>
                    <td class="expense-item-detail-note">${escapeHtml(tx.notes)}</td>
                    <td>
                      <div style="display:flex;gap:4px;">
                        <button class="tiny ghost editRowBtn" data-id="${escapeHtml(tx.id)}">✎</button>
                        <button class="tiny danger delRowBtn" data-id="${escapeHtml(tx.id)}">✕</button>
                      </div>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    `).join("");
    html += `</div></details>`;
  }

  if (!html) {
    els.expensesList.innerHTML = `<div class="empty">No transactions found.</div>`;
  } else {
    els.expensesList.innerHTML = html;
  }

  els.expensesList.querySelectorAll(".editRowBtn").forEach(btn => btn.addEventListener("click", () => openEditModal(btn.dataset.id)));
  els.expensesList.querySelectorAll(".delRowBtn").forEach(btn => btn.addEventListener("click", () => deleteEntry(btn.dataset.id)));
  // Add event listeners for expense action buttons
  els.expensesList.querySelectorAll(".expenseActionBtn").forEach(btn => btn.addEventListener("click", async e => {
    e.preventDefault();
    const action = btn.dataset.action;
    const type = btn.dataset.type;
    
    if (action === "pdf") {
      if (type === "topups-by-currency"){
        await downloadAllTopupsPDF(btn.dataset.currency);
      } else if (type === "all-topups"){
        await downloadAllTopupsPDF(null);
      } else if (type === "transfers-by-currency"){
        await downloadAllTransfersPDF(btn.dataset.currency);
      } else if (type === "all-transfers"){
        await downloadAllTransfersPDF(null);
      }
    }
  }));
}


function defaultDateInputs(root = document){
  root.querySelectorAll('input[type="date"]').forEach(i => {
    if (!i.value && i.dataset.defaultToday === "true") i.value = todayISO();
  });
}

function renderMultiEntries(count) {
  let html = `
    <div class="multi-row-header">
      <div>Date</div>
      <div>Amount</div>
      <div>Remarks</div>
    </div>
  `;
  for(let i=0; i<count; i++){
    html += `
      <div class="multi-row">
        <input class="input" name="action_date_${i}" type="date" required data-default-today="true" aria-label="Date ${i+1}" />
        <input class="input" name="action_amount_${i}" type="number" min="0" step="0.00000001" required placeholder="0.00" aria-label="Amount ${i+1}" />
        <input class="input" name="notes_${i}" placeholder="Notes" aria-label="Remarks ${i+1}" />
      </div>
    `;
  }
  els.multiEntryContainer.innerHTML = html;
  defaultDateInputs(els.multiEntryContainer);
}

function parseEntriesPayload(payload){
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.entries)) return payload.entries;
  return [];
}

function csvEscape(value){
  const str = String(value ?? "");
  if (!/[",\n\r]/.test(str)) return str;
  return `"${str.replace(/"/g, '""')}"`;
}

function toCsv(entries){
  const headers = [
    "id","group_id","direction","entry_kind","person_name","currency",
    "principal_amount","action_amount","loan_date","action_date","notes","created_at"
  ];
  const lines = [headers.join(",")];
  for (const entry of entries){
    lines.push(headers.map(h => csvEscape(entry[h])).join(","));
  }
  return lines.join("\n");
}

function parseCsvLine(line){
  const out = [];
  let value = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++){
    const ch = line[i];
    if (ch === '"'){
      if (inQuotes && line[i + 1] === '"'){
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes){
      out.push(value);
      value = "";
    } else {
      value += ch;
    }
  }
  out.push(value);
  return out;
}

function parseCsvRows(text){
  const rows = [];
  let row = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++){
    const ch = text[i];
    if (ch === '"'){
      if (inQuotes && text[i + 1] === '"'){
        row += '""';
        i += 1;
      } else {
        inQuotes = !inQuotes;
        row += ch;
      }
      continue;
    }
    if ((ch === "\n" || ch === "\r") && !inQuotes){
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      if (row.trim()) rows.push(parseCsvLine(row));
      row = "";
      continue;
    }
    row += ch;
  }
  if (row.trim()) rows.push(parseCsvLine(row));
  return rows;
}

function parseEntriesCsv(csvText){
  const rows = parseCsvRows(csvText);
  if (!rows.length) return [];
  const header = rows[0].map(v => String(v || "").trim());
  const idx = key => header.indexOf(key);
  const required = ["group_id","direction","entry_kind","person_name","currency","loan_date"];
  if (required.some(k => idx(k) === -1)){
    throw new Error("Invalid CSV format. Missing required columns.");
  }
  return rows.slice(1).map(cols => {
    const get = key => {
      const i = idx(key);
      return i >= 0 ? (cols[i] ?? "").trim() : "";
    };
    const valOrNull = key => {
      const v = get(key);
      return v === "" ? null : v;
    };
    const numOrNull = key => {
      const v = get(key);
      if (v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    return {
      id: valOrNull("id") || crypto.randomUUID(),
      group_id: get("group_id"),
      direction: get("direction"),
      entry_kind: get("entry_kind"),
      person_name: get("person_name"),
      currency: get("currency"),
      principal_amount: numOrNull("principal_amount"),
      action_amount: numOrNull("action_amount"),
      loan_date: get("loan_date"),
      action_date: valOrNull("action_date"),
      notes: valOrNull("notes"),
      created_at: valOrNull("created_at") || new Date().toISOString()
    };
  }).filter(entry => entry.group_id && entry.direction && entry.entry_kind && entry.person_name);
}

function saveBackupEntries(entries){
  const payload = {
    exportedAt: new Date().toISOString(),
    entries: Array.isArray(entries) ? entries : []
  };
  localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(payload));
}

function loadBackupEntriesFromStorage(){
  const raw = localStorage.getItem(BACKUP_STORAGE_KEY);
  if (!raw) return [];
  try{
    return parseEntriesPayload(JSON.parse(raw));
  }catch{
    return [];
  }
}

function updateUploadButtonVisibility(){
  const shouldShow = state.hasImportedFile && state.dataSource === "backup";
  els.uploadBackupBtn.classList.toggle("hide", !shouldShow);
}

function updateConnectButtonVisibility(){
  const showConnect = state.hasImportedFile && !state.unlocked;
  els.connectSupabaseBtn.classList.toggle("hide", !showConnect);
}

function applyEntries(entries, source = "backup", options = {}){
  state.entries = Array.isArray(entries) ? entries : [];
  state.dataSource = source;
  if (typeof options.hasImportedFile === "boolean"){
    state.hasImportedFile = options.hasImportedFile;
    if (state.hasImportedFile){
      sessionStorage.setItem(IMPORT_SESSION_KEY, "1");
    } else {
      sessionStorage.removeItem(IMPORT_SESSION_KEY);
    }
  }
  saveBackupEntries(state.entries);
  updateUploadButtonVisibility();
  updateConnectButtonVisibility();
  renderAll();
}

async function loadEntries(){
  if (state.dataSource === "backup"){
    applyEntries(loadBackupEntriesFromStorage(), "backup");
    // Load recycle bin from localStorage for backup mode
    loadRecycleBinFromStorage();
    renderRecycleBinDropdown();
    return;
  }
  await loadEntriesFromSupabase();
}

async function loadEntriesFromSupabase(){
  const rows = await supabase(`${CONFIG.table}?select=*&order=created_at.desc`);
  // Filter out entries with deleted tag for main display
  const filteredRows = Array.isArray(rows) ? rows.filter(row => !hasDeletedTag(row.notes)) : [];
  updateDbSnapshot(filteredRows);
  applyEntries(filteredRows, "supabase", { hasImportedFile: false });
  
  // Load deleted entries into recycle bin
  const deletedRows = Array.isArray(rows) ? rows.filter(row => hasDeletedTag(row.notes)) : [];
  state.recycleBin = deletedRows.map(row => ({
    ...row,
    deletedAt: row.updated_at, // Use updated_at as deletion time
    originalSection: getEntrySection(row)
  }));
  saveRecycleBinToStorage();
  renderRecycleBinDropdown();
}

function renderExpenseOverviewWallets(){
  const container = document.getElementById("expenseOverviewWallets");
  if (!container) return;
  const accounts = getExpenseAccounts({ applyUiFilters: false });
  if (!accounts.length){
    container.innerHTML = `<div class="empty" style="grid-column:1/-1">No expense accounts yet.</div>`;
    return;
  }
  const expenseCurrencies = [...new Set(accounts.map(account => account.currency).filter(Boolean))];
  const expenseSummaryCard = expenseCurrencies.length ? `
      <div class="summary currency-summary expense-overview">
        ${overviewWatermarkFloatingWalletLogos(accounts)}
        <div class="currency-head">Summary ${expenseCurrencies.map(currency => currencySymbolHtml(currency)).join(' ')}</div>
        ${expenseCurrencies.map(currency => {
          const s = summarizeExpenseByCurrency(currency);
          return `
            ${overviewExpenseLine(currency, "Total Amount:", money(s.totalAmount, currency))}
            ${overviewExpenseLine(currency, "Total Expenses:", money(s.totalExpenses, currency))}
            <div class="summary-line summary-line-one available-label">
              <span class="summary-line-one-label summary-line-one-label--with-symbol strong-success">
                <span class="summary-currency-mark">${currencySymbolHtml(currency)}</span>
                <span class="summary-label-suffix strong-success">Available Balance:</span>
              </span>
              <span class="summary-line-one-value available-amount strong-success">${money(s.availableBalance, currency)}</span>
            </div>
          `;
        }).join("")}
        <div class="overview-card-actions" style="margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap;">
          <button class="tiny ghost" onclick="window.location.href='#expensesPanel'">View Expenses</button>
          <button class="tiny ghost" onclick="openExpenseModal('account')">Add Account</button>
          <button class="tiny ghost" onclick="downloadExpensesPDF()"><i class="fa-solid fa-download"></i></button>
        </div>
      </div>
  ` : "";

  container.innerHTML = expenseSummaryCard + accounts.map(a => {
    const totalTopup = Number(a.openingBalance || 0) + Number(a.addedMoney || 0);
    
    // Calculate USD equivalent for BTC wallets
    let btcUsdEquivalent = "";
    if (a.currency === "BTC") {
      const btcBalance = Number(a.balance || 0);
      if (btcBalance > 0 && state.bitcoin.btcPrice) {
        const usdValue = (btcBalance * state.bitcoin.btcPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        btcUsdEquivalent = usdValue;
      }
    }
    
    return `
      <div class="summary currency-summary">
        ${overviewWatermarkWallet(a.person_name || "Wallet", a.currency)}
        <div class="currency-head" style="font-size:1.1rem;gap:6px;justify-content:flex-start;">
          ${currencySymbolHtml(a.currency)}
          ${getWalletIconHtml(a.person_name || "Wallet", 24)}
          <span style="font-size:.8rem;font-weight:750;line-height:1.2;">${escapeHtml(a.person_name || "Wallet")}</span>
        </div>
        ${overviewOneLine("Top-up:", money(totalTopup, a.currency))}
        ${overviewOneLine("Spent:", money(a.spentMoney, a.currency))}
        ${overviewAvailableLine(money(a.balance, a.currency), a.balance, btcUsdEquivalent)}
        <div class="overview-card-actions" style="margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap;">
          <button class="tiny ghost" onclick="openExpenseModal('topup', '${escapeHtml(a.group_id)}')">Add Money</button>
          <button class="tiny ghost" onclick="openExpenseModal('expense', '${escapeHtml(a.group_id)}')">Add Expense</button>
          <button class="tiny ghost" onclick="openTransferModal('${escapeHtml(a.group_id)}', '${escapeHtml(a.person_name || 'Wallet')}', '${escapeHtml(a.currency)}')">Transfer</button>
          <button class="tiny ghost" onclick="downloadExpenseAccountPDF('${escapeHtml(a.group_id)}')"><i class="fa-solid fa-download"></i></button>
          <button class="tiny ghost" onclick="openEditModal('${escapeHtml(a.principal?.id || '')}')">Edit</button>
          <button class="tiny danger" onclick="deleteExpenseWallet('${escapeHtml(a.group_id)}', '${escapeHtml(a.person_name || 'Wallet')}')">Delete Wallet</button>
        </div>
      </div>
    `;
  }).join("");
}

function renderAll(){
  renderOverviewCards();
  renderLoanSelectors();
  renderGoodsSelectors();
  renderLoanCards(els.givenList, "given", "given");
  renderLoanCards(els.receivedList, "given", "received");
  renderLoanCards(els.takenList, "taken", "taken", {
    groupFilter: group => !group.rows.some(row => hasInstallmentTag(row.note) || hasGoodsTag(row.note) || hasExpenseAccountTag(row.note)) && group.person_name !== "SYSTEM"
  });
  renderLoanCards(els.returnedList, "taken", "returned", {
    groupFilter: group => !group.rows.some(row => hasInstallmentTag(row.note) || hasGoodsTag(row.note) || hasExpenseAccountTag(row.note)) && group.person_name !== "SYSTEM"
  });
  renderLoanCards(els.installmentsList, "taken", "installments", {
    groupFilter: group => group.rows.some(row => hasInstallmentTag(row.note)) && !group.rows.some(row => hasGoodsTag(row.note)) && !group.rows.some(row => hasExpenseAccountTag(row.note)),
    hideMoveToInstallments: true
  });
  renderGoodsList();
  renderExpensesList();
  renderExpenseOverviewWallets();

  els.openGivenCount.textContent = groupByLoan(getActiveEntries().filter(e => e.direction === "given" && !hasGoodsTag(e.notes))).filter(g => calculateLoan(g).remaining > 0).length;
  els.openTakenCount.textContent = groupByLoan(getActiveEntries().filter(e => e.direction === "taken" && !hasGoodsTag(e.notes) && !hasExpenseAccountTag(e.notes))).filter(g => calculateLoan(g).remaining > 0).length;
  els.receivedCount.textContent = getActiveEntries().filter(e => e.direction === "given" && e.entry_kind !== "principal").length;
  els.returnedCount.textContent = getActiveEntries().filter(e => e.direction === "taken" && e.entry_kind !== "principal" && !hasGoodsTag(e.notes) && !hasExpenseAccountTag(e.notes)).length;

}

function activate(tab){
  // Prevent access to tabs when not logged in (except when showing standalone about)
  if (!state.unlocked && window.location.hash !== "#about") {
    return;
  }

  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
  document.getElementById(`${tab}Panel`).classList.add("active");
  const mainOverview = document.getElementById("mainOverview");
  const walletsOverview = document.getElementById("walletsOverviewSection");

  if (mainOverview) {
    if (tab === "expenses" || tab === "bitcoin" || tab === "notes") {
      mainOverview.style.display = "none";
    } else {
      mainOverview.style.display = "block";
    }
  }

  if (walletsOverview) {
    if (tab === "bitcoin" || tab === "notes") {
      walletsOverview.style.display = "none";
    } else if (tab === "expenses") {
      walletsOverview.style.display = "block";
    } else {
      walletsOverview.style.display = "none";
    }
  }

  // Load notes from database when Notes tab is activated
  if (tab === "notes") {
    loadNotesFromDatabase();
  }
  
  // Load Bitcoin wallets from database when Bitcoin tab is activated
  if (tab === "bitcoin") {
    loadBitcoinWalletsFromDatabase();
  }
  
  // Fetch Bitcoin price when expense tab is activated to ensure USD values are displayed
  if (tab === "expenses") {
    // Always fetch fresh price when expense tab loads
    btcFetchPrice().then(priceData => {
      if (priceData) {
        console.log('Bitcoin price fetched for expense section:', priceData);
        // Update expense wallets to show BTC USD equivalents
        renderExpenseWalletBar(getExpenseAccounts());
        
        // Force update USD values after a delay
        setTimeout(() => {
          const accounts = getExpenseAccounts({ applyUiFilters: false });
          const btcAccounts = accounts.filter(a => a.currency === 'BTC');
          btcAccounts.forEach(account => {
            const balance = Number(account.balance || 0);
            if (balance > 0 && priceData.price) {
              const usdValue = (balance * priceData.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              console.log(`Updating BTC wallet ${account.group_id} with USD value: $${usdValue}`);
              
              // Find and update the USD equivalent element
              const walletCard = document.querySelector(`[data-group-id="${account.group_id}"]`);
              if (walletCard) {
                const usdElement = walletCard.querySelector('.btc-usd-equivalent');
                if (usdElement) {
                  usdElement.innerHTML = `<span class="btc-usd-equivalent"><em>≈ $</em> <strong>${usdValue}</strong></span>`;
                } else {
                  // Create USD element if it doesn't exist
                  const statsDiv = walletCard.querySelector('.expense-wallet-stats');
                  if (statsDiv) {
                    const usdSpan = document.createElement('span');
                    usdSpan.className = 'btc-usd-equivalent';
                    usdSpan.innerHTML = `<em>≈ $</em> <strong>${usdValue}</strong>`;
                    statsDiv.appendChild(usdSpan);
                  }
                }
              }
            }
          });
        }, 500);
      }
    }).catch(err => console.error('Failed to fetch Bitcoin price:', err));
  }
}

// Function to set initial overview visibility for Expenses tab
function setInitialOverviewForExpenses() {
  const mainOverview = document.getElementById("mainOverview");
  const walletsOverview = document.getElementById("walletsOverviewSection");
  
  if (mainOverview) mainOverview.style.display = "none";
  if (walletsOverview) walletsOverview.style.display = "block";
}

function setCurrencyChoice(form, currency){
  const hidden = form.querySelector('input[name="currency"]');
  if (hidden) hidden.value = currency;
  form.querySelectorAll(".currency-chip").forEach(btn => btn.classList.toggle("active", btn.dataset.currency === currency));
  state.lastCurrency = currency;

  // Refresh loan wallet selector if present in this form
  const walletSel = form.querySelector('[name="loan_wallet_id"]') || form.querySelector('[name="payment_wallet_id"]');
  if (walletSel) populateLoanWalletSelector(currency, walletSel);
}

function openEntryModal(mode, direction){
  state.modalDirection = direction;

  els.entryModal.classList.remove("hide");
  els.entryModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  if (mode === "principal"){
    els.modalTitle.textContent = direction === "given" ? "New loan given" : "New loan taken";
    els.modalDesc.textContent = direction === "given" ? "Add a loan you gave to someone." : "Add money you received from someone.";
    els.principalModalForm.classList.remove("hide");
    els.paymentModalForm.classList.add("hide");
    els.principalModalForm.reset();
    els.principalModalForm.querySelector('input[name="direction"]').value = direction;
    els.principalModalForm.querySelector('input[name="person_name"]').placeholder = direction === "given" ? "Full name" : "Lender name";
    els.principalSubmitBtn.textContent = direction === "given" ? "Save given loan" : "Save taken loan";
    setCurrencyChoice(els.principalModalForm, state.lastCurrency || "AED");
    defaultDateInputs(els.principalModalForm);

    // Wallet selector badge & population
    const walletBadge = document.getElementById("principalWalletBadge");
    if (walletBadge) {
      if (direction === "given") {
        walletBadge.textContent = "Loan Given → Deduct from wallet";
        walletBadge.className = "badge orange";
      } else {
        walletBadge.textContent = "Loan Taken → Add to wallet";
        walletBadge.className = "badge green";
      }
    }
    populateLoanWalletSelector(state.lastCurrency || "AED", document.getElementById("modalLoanWalletSelect"));
  } else {
    els.modalTitle.textContent = direction === "given" ? "New received back entry" : "New returned back entry";
    els.modalDesc.textContent = direction === "given" ? "Record money received against a given loan." : "Record repayment against a taken loan.";
    els.paymentModalForm.classList.remove("hide");
    els.principalModalForm.classList.add("hide");
    els.paymentModalForm.reset();
    els.paymentModalForm.querySelector('input[name="direction"]').value = direction;
    els.paymentSubmitBtn.textContent = direction === "given" ? "Save received back" : "Save returned back";
    els.multiEntryCount.value = 1;
    renderMultiEntries(1);
    renderLoanSelectors();

    // Wallet selector badge
    const walletBadge = document.getElementById("paymentWalletBadge");
    if (walletBadge) {
      if (direction === "given") {
        walletBadge.textContent = "Received Back → Add to wallet";
        walletBadge.className = "badge green";
      } else {
        walletBadge.textContent = "Returned Back → Deduct from wallet";
        walletBadge.className = "badge orange";
      }
    }
    // Populate wallet selector based on first open loan's currency (if available)
    const firstLoanOption = els.modalLoanSelect.options[els.modalLoanSelect.selectedIndex];
    const selectedGroup = firstLoanOption?.value;
    let loanCurrency = null;
    if (selectedGroup) {
      const principalEntry = state.entries.find(e => e.group_id === selectedGroup && e.entry_kind === "principal");
      if (principalEntry) loanCurrency = principalEntry.currency;
    }
    populateLoanWalletSelector(loanCurrency, document.getElementById("modalPaymentWalletSelect"));
  }
}

function openGoodsModal(mode){
  els.goodsModal.classList.remove("hide");
  els.goodsModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  els.goodsBoughtForm.classList.toggle("hide", mode !== "bought");
  els.goodsSoldForm.classList.toggle("hide", mode !== "sold");
  els.goodsNewItemFields.classList.add("hide");
  els.goodsNewItemToggleBtn.textContent = "+ Add New";

  if (mode === "bought"){
    els.goodsModalTitle.textContent = "Bought Item";
    els.goodsModalDesc.textContent = "Add a newly bought item.";
    els.goodsBoughtForm.reset();
    setCurrencyChoice(els.goodsBoughtForm, state.lastCurrency || "AED");
    defaultDateInputs(els.goodsBoughtForm);
  } else {
    els.goodsModalTitle.textContent = "Sale Item";
    els.goodsModalDesc.textContent = "Sell from bought list or add and sell new item.";
    els.goodsSoldForm.reset();
    setCurrencyChoice(els.goodsSoldForm, state.lastCurrency || "AED");
    renderGoodsSelectors();
    defaultDateInputs(els.goodsSoldForm);
  }
}

async function saveGoodsBought(form){
  const fd = new FormData(form);
  const unitActualPrice = Number(fd.get("actual_price") || 0);
  const boughtQty = Math.max(1, parseInt(fd.get("bought_qty"), 10) || 1);
  const totalActualPrice = unitActualPrice * boughtQty;
  const payload = {
    group_id: crypto.randomUUID(),
    direction: "taken",
    entry_kind: "principal",
    person_name: String(fd.get("item_name") || "").trim(),
    currency: String(fd.get("currency") || "AED").trim(),
    principal_amount: totalActualPrice,
    action_amount: null,
    loan_date: String(fd.get("bought_date") || ""),
    action_date: null,
    notes: upsertGoodsMetaInNote(
      normalizeGoodsNote(String(fd.get("notes") || "").trim() || null, true),
      { boughtQty, unitActualPrice }
    )
  };
  if (!payload.person_name || !payload.currency || !unitActualPrice || !boughtQty || !payload.loan_date){
    throw new Error("Complete all required fields.");
  }
  
  // Validate currency
  validateCurrencyForForm(fd);

  if (isBackupMode()){
    state.entries.unshift({ ...payload, id: crypto.randomUUID(), created_at: new Date().toISOString() });
    refreshBackupView();
  } else {
    await supabase(CONFIG.table, { method: "POST", body: JSON.stringify(payload) });
    await loadEntriesFromSupabase();
  }
  closeModal("goodsModal");
}

async function saveGoodsSold(form){
  const fd = new FormData(form);
  let groupId = String(fd.get("group_id") || "").trim();
  let principalEntry = state.entries.find(e =>
    e.group_id === groupId &&
    e.entry_kind === "principal" &&
    (e.direction === "goods" || (e.direction === "taken" && hasGoodsTag(e.notes)))
  );
  const soldPrice = Number(fd.get("sold_price") || 0);
  const soldQty = Math.max(1, parseInt(fd.get("sold_qty"), 10) || 1);
  const soldDate = String(fd.get("sold_date") || "");
  const soldNotes = String(fd.get("notes") || "").trim() || null;

  const newItemName = String(fd.get("new_item_name") || "").trim();
  if (!groupId && newItemName){
    groupId = crypto.randomUUID();
    principalEntry = {
      group_id: groupId,
      direction: "taken",
      entry_kind: "principal",
      person_name: newItemName,
      currency: String(fd.get("new_currency") || "AED").trim(),
      principal_amount: Number(fd.get("new_actual_price") || 0) * (Math.max(1, parseInt(fd.get("new_bought_qty"), 10) || 1)),
      action_amount: null,
      loan_date: String(fd.get("new_bought_date") || "") || todayISO(),
      action_date: null,
      notes: upsertGoodsMetaInNote(normalizeGoodsNote(null, true), {
        boughtQty: Math.max(1, parseInt(fd.get("new_bought_qty"), 10) || 1),
        unitActualPrice: Number(fd.get("new_actual_price") || 0)
      })
    };
    if (!principalEntry.principal_amount){
      throw new Error("Actual price is required for new item.");
    }
  }

  if (!principalEntry) throw new Error("Choose bought item or add a new one.");
  if (!soldPrice || !soldQty || !soldDate) throw new Error("Sold price, sold quantity and sold date are required.");

  const principalMeta = goodsMetaFromNotes(principalEntry.notes);
  const totalBoughtQty = Math.max(1, Number(principalMeta.boughtQty || 1));
  const soldQtyAlready = state.entries
    .filter(e => e.group_id === groupId && e.entry_kind !== "principal" && hasGoodsTag(e.notes))
    .reduce((sum, e) => sum + Math.max(1, Number(goodsMetaFromNotes(e.notes).soldQty || 1)), 0);
  const remainingQty = Math.max(totalBoughtQty - soldQtyAlready, 0);
  if (soldQty > remainingQty){
    throw new Error(`Only ${remainingQty} item(s) left to sell for this entry.`);
  }

  const soldPayload = {
    group_id: groupId,
    direction: "taken",
    entry_kind: "full",
    person_name: principalEntry.person_name,
    currency: principalEntry.currency,
    principal_amount: null,
    action_amount: soldPrice * soldQty,
    loan_date: principalEntry.loan_date,
    action_date: soldDate,
    notes: upsertGoodsMetaInNote(normalizeGoodsNote(soldNotes, true), {
      soldQty,
      unitSoldPrice: soldPrice
    })
  };

  if (isBackupMode()){
    if (!state.entries.some(e => e.group_id === groupId && e.entry_kind === "principal" && (e.direction === "goods" || (e.direction === "taken" && hasGoodsTag(e.notes))))){
      state.entries.unshift({ ...principalEntry, id: crypto.randomUUID(), created_at: new Date().toISOString() });
    }
    state.entries.unshift({ ...soldPayload, id: crypto.randomUUID(), created_at: new Date().toISOString() });
    refreshBackupView();
  } else {
    if (!state.entries.some(e => e.group_id === groupId && e.entry_kind === "principal" && (e.direction === "goods" || (e.direction === "taken" && hasGoodsTag(e.notes))))){
      await supabase(CONFIG.table, { method: "POST", body: JSON.stringify(principalEntry) });
    }
    await supabase(CONFIG.table, { method: "POST", body: JSON.stringify(soldPayload) });
    await loadEntriesFromSupabase();
  }
  closeModal("goodsModal");
}

function openEditModal(id) {
  const entry = state.entries.find(e => e.id === id);
  if (!entry) return;
  state.editId = id;
  state.editKind = entry.entry_kind;

  if (entry.entry_kind === "principal") {
    document.getElementById('editPersonGroup').classList.remove('hide');
    document.getElementById('editCurrencyGroup').classList.remove('hide');
    document.getElementById('editName').value = entry.person_name || "";
    document.getElementById('editName').required = true;
    setCurrencyChoice(els.editForm, entry.currency || "AED");
    document.getElementById('editAmountLabel').textContent = "Principal Amount";
    document.getElementById('editAmount').value = entry.principal_amount || "";
    document.getElementById('editDateLabel').textContent = "Loan Date";
    document.getElementById('editDate').value = entry.loan_date || "";
  } else {
    document.getElementById('editPersonGroup').classList.add('hide');
    document.getElementById('editCurrencyGroup').classList.add('hide');
    document.getElementById('editName').required = false;
    document.getElementById('editAmountLabel').textContent = "Payment Amount";
    document.getElementById('editAmount').value = entry.action_amount || "";
    document.getElementById('editDateLabel').textContent = "Payment Date";
    document.getElementById('editDate').value = entry.action_date || "";
  }
  document.getElementById('editNotes').value = entry.notes || "";

  els.editModal.classList.remove("hide");
  els.editModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeModal(modalId){
  document.getElementById(modalId).classList.add("hide");
  document.getElementById(modalId).setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function isBackupMode(){
  return state.dataSource === "backup";
}

function refreshBackupView(){
  applyEntries(state.entries, "backup");
}

async function createPrincipal(form){
  const fd = new FormData(form);
  const direction = String(fd.get("direction") || "");
  const groupId = crypto.randomUUID();
  const walletId = String(fd.get("loan_wallet_id") || "").trim();

  const payload = {
    group_id: groupId,
    direction,
    entry_kind: "principal",
    person_name: String(fd.get("person_name") || "").trim(),
    currency: String(fd.get("currency") || "").trim(),
    principal_amount: Number(fd.get("principal_amount") || 0),
    action_amount: null,
    loan_date: fd.get("loan_date"),
    action_date: null,
    notes: String(fd.get("notes") || "").trim() || null
  };

  if (!payload.person_name || !payload.currency || !payload.principal_amount || !payload.loan_date) throw new Error("Complete all required fields.");
  
  // Validate currency
  validateCurrencyForForm(fd);

  // Validate wallet balance before saving (loan given = money out)
  if (walletId && direction === "given") {
    const account = getExpenseAccounts({ applyUiFilters: false }).find(a => a.group_id === walletId);
    if (account) {
      if (account.currency !== payload.currency) throw new Error("Selected wallet currency does not match the loan currency.");
      if (payload.principal_amount > account.balance) throw new Error(`Insufficient wallet balance. Available: ${formatReportAmount(account.balance, account.currency)}.`);
    }
  }

  if (isBackupMode()){
    state.entries.unshift({
      ...payload,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString()
    });
  } else {
    await supabase(CONFIG.table, { method: "POST", body: JSON.stringify(payload) });
  }

  // Create linked wallet entry
  if (walletId) {
    await createWalletEntryForLoanPrincipal(walletId, payload.principal_amount, payload.loan_date, payload.person_name, direction, payload.currency);
  }

  form.reset();
  setCurrencyChoice(form, "AED");
  defaultDateInputs(form);
  closeModal("entryModal");
  if (isBackupMode()) refreshBackupView();
  else await loadEntriesFromSupabase();
}

async function createPayment(form){
  const fd = new FormData(form);
  const direction = String(fd.get("direction") || "");
  const groupId = String(fd.get("group_id") || "");
  const count = parseInt(els.multiEntryCount.value) || 1;
  const walletId = String(fd.get("payment_wallet_id") || "").trim();

  if (!groupId) throw new Error("Please choose a loan.");

  const principalEntry = state.entries.find(e => e.group_id === groupId && e.entry_kind === "principal");
  if (!principalEntry) throw new Error("Selected loan could not be found.");
  
  // Validate that the principal's currency is allowed
  const tempFormData = new FormData();
  tempFormData.append('currency', principalEntry.currency);
  validateCurrencyForForm(tempFormData);

  const group = groupByLoan(getActiveEntries().filter(e => e.group_id === groupId))[0];
  let currentRemaining = calculateLoan(group).remaining;

  let totalAmount = 0;
  for(let i=0; i<count; i++){
     totalAmount += Number(fd.get(`action_amount_${i}`) || 0);
  }

  if (totalAmount > currentRemaining){
    throw new Error(`Total amount (${totalAmount}) exceeds remaining balance (${currentRemaining}).`);
  }

  // Validate wallet for returned back (money goes out)
  if (walletId && direction === "taken") {
    const account = getExpenseAccounts({ applyUiFilters: false }).find(a => a.group_id === walletId);
    if (account) {
      if (account.currency !== principalEntry.currency) throw new Error("Selected wallet currency does not match the loan currency.");
      if (totalAmount > account.balance) throw new Error(`Insufficient wallet balance for this repayment. Available: ${formatReportAmount(account.balance, account.currency)}.`);
    }
  }

  const payloads = [];
  for(let i=0; i<count; i++){
    const amt = Number(fd.get(`action_amount_${i}`) || 0);
    const dt = fd.get(`action_date_${i}`);
    const nt = String(fd.get(`notes_${i}`) || "").trim() || null;

    if(!amt || !dt) continue;

    currentRemaining -= amt;
    payloads.push({
      group_id: groupId,
      direction,
      entry_kind: currentRemaining <= 0 ? "full" : "partial",
      person_name: principalEntry.person_name,
      currency: principalEntry.currency,
      principal_amount: null,
      action_amount: amt,
      loan_date: principalEntry.loan_date,
      action_date: dt,
      notes: nt
    });
  }

  if(payloads.length === 0) throw new Error("Please fill out amount and date.");

  if (isBackupMode()){
    const now = new Date().toISOString();
    payloads.forEach(p => {
      state.entries.unshift({ ...p, id: crypto.randomUUID(), created_at: now });
    });
  } else {
    await supabase(CONFIG.table, { method: "POST", body: JSON.stringify(payloads) });
  }

  // Create linked wallet entries for each payment row
  if (walletId) {
    for (const p of payloads) {
      await createWalletEntryForPayment(walletId, p.action_amount, p.action_date, principalEntry.person_name, direction, principalEntry.currency);
    }
  }

  form.reset();
  els.multiEntryCount.value = 1;
  renderMultiEntries(1);
  closeModal("entryModal");
  if (isBackupMode()) refreshBackupView();
  else await loadEntriesFromSupabase();
}

async function submitEdit(){
  const id = state.editId;
  if (!id) return;
  const currentEntry = state.entries.find(e => e.id === id);
  if (!currentEntry) return;

  const amt = Number(document.getElementById('editAmount').value || 0);
  const dt = document.getElementById('editDate').value;
  const nt = document.getElementById('editNotes').value.trim() || null;

  if(state.editKind === "principal"){
    const nm = document.getElementById('editName').value.trim();
    const curr = document.getElementById('editCurrency').value;
    if (!nm || !curr || !amt || !dt) throw new Error("Complete required fields.");
    
    let updatedNotes = nt;
    
    // Handle goods entries - update metadata when price/amount changes
    if (hasGoodsTag(currentEntry.notes)) {
      const currentMeta = goodsMetaFromNotes(currentEntry.notes);
      const currentBoughtQty = Math.max(1, Number(currentMeta.boughtQty || 1));
      const newUnitActualPrice = amt / currentBoughtQty;
      
      updatedNotes = upsertGoodsMetaInNote(nt, {
        boughtQty: currentBoughtQty,
        unitActualPrice: newUnitActualPrice
      });
    } else if (hasExpenseAccountTag(currentEntry.notes)) {
      updatedNotes = upsertExpenseMetaInNote(nt, { ...expenseMetaFromNotes(currentEntry.notes), rowType: "ACCOUNT" });
    }
    
    if (isBackupMode()){
      state.entries = state.entries.map(entry => entry.id === id
        ? { ...entry, person_name: nm, currency: curr, principal_amount: amt, loan_date: dt, notes: updatedNotes }
        : entry
      );
    } else {
      await supabase(`${CONFIG.table}?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ person_name: nm, currency: curr, principal_amount: amt, loan_date: dt, notes: updatedNotes })
      });
    }
  } else {
    if (!amt || !dt) throw new Error("Complete required fields.");
    let editedNotes = nt;
    
    // Handle goods sold entries - update metadata when sold amount changes
    if (hasGoodsTag(currentEntry.notes)) {
      const currentMeta = goodsMetaFromNotes(currentEntry.notes);
      const currentSoldQty = Math.max(1, Number(currentMeta.soldQty || 1));
      const newUnitSoldPrice = amt / currentSoldQty;
      
      editedNotes = upsertGoodsMetaInNote(nt, {
        soldQty: currentSoldQty,
        unitSoldPrice: newUnitSoldPrice
      });
    } else if (hasExpenseAccountTag(currentEntry.notes)) {
      const expenseMeta = expenseMetaFromNotes(currentEntry.notes);
      editedNotes = upsertExpenseMetaInNote(nt, expenseMeta);
    }
    
    if (isBackupMode()){
      state.entries = state.entries.map(entry => entry.id === id
        ? { ...entry, action_amount: amt, action_date: dt, notes: editedNotes }
        : entry
      );
    } else {
      await supabase(`${CONFIG.table}?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ action_amount: amt, action_date: dt, notes: editedNotes })
      });
    }
  }

  closeModal("editModal");
  if (isBackupMode()) refreshBackupView();
  else await loadEntriesFromSupabase();
}

async function renamePersonRecords(personNameEncoded, direction){
  const currentName = decodeURIComponent(personNameEncoded || "").trim();
  if (!currentName || !direction) return;
  const nextName = prompt("Enter new person name:", currentName);
  if (nextName === null) return;
  const cleanedName = nextName.trim();
  if (!cleanedName) {
    alert("Name cannot be empty.");
    return;
  }
  if (cleanedName === currentName) return;

  const matchingIds = state.entries
    .filter(e => e.direction === direction && String(e.person_name || "").trim() === currentName)
    .map(e => e.id)
    .filter(Boolean);

  if (!matchingIds.length) return;

  if (isBackupMode()){
    state.entries = state.entries.map(entry => (
      entry.direction === direction && String(entry.person_name || "").trim() === currentName
        ? { ...entry, person_name: cleanedName }
        : entry
    ));
    refreshBackupView();
    return;
  }

  for (const id of matchingIds){
    await supabase(`${CONFIG.table}?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ person_name: cleanedName })
    });
  }
  await loadEntriesFromSupabase();
}

async function deleteEntry(id){
  if (!id) return;
  const entry = state.entries.find(e => e.id === id);
  if (!entry) return;

  // Check if this is a transfer record
  const isTransfer = hasExpenseAccountTag(entry.notes) && 
                     expenseMetaFromNotes(entry.notes).expenseType === "Transfer";

  if(entry.entry_kind === "principal"){
    if (!confirm(`Delete the entire loan for ${entry.person_name}? This will move ALL linked repayments to recycle bin.`)) return;
    if (isBackupMode()){
      // Move all entries in the group to recycle bin
      const groupEntries = state.entries.filter(e => e.group_id === entry.group_id);
      groupEntries.forEach(e => addToRecycleBin(e));
      state.entries = state.entries.filter(e => e.group_id !== entry.group_id);
      refreshBackupView();
      renderAll();
    } else {
      // Move to recycle bin and mark as deleted
      const groupEntries = state.entries.filter(e => e.group_id === entry.group_id);
      groupEntries.forEach(e => {
        addToRecycleBin(e);
        // Update in database to mark as deleted using notes field
        supabase(`${CONFIG.table}?id=eq.${encodeURIComponent(e.id)}`, { 
          method: "PATCH", 
          body: JSON.stringify({ notes: addDeletedTag(e.notes || "") }) 
        });
      });
      await loadEntriesFromSupabase();
      renderAll();
    }
  } else if (isTransfer) {
    // Handle transfer deletion - move both expense and top-up parts to recycle bin
    await deleteTransfer(entry);
  } else {
    if (!confirm(`Move this entry to recycle bin?`)) return;
    if (isBackupMode()){
      addToRecycleBin(entry);
      state.entries = state.entries.filter(e => e.id !== id);
    } else {
      addToRecycleBin(entry);
      await supabase(`${CONFIG.table}?id=eq.${encodeURIComponent(id)}`, { 
        method: "PATCH", 
        body: JSON.stringify({ notes: addDeletedTag(entry.notes || "") }) 
      });
    }
  }
  if (isBackupMode()) {
    refreshBackupView();
    renderAll();
  } else {
    // Add a small delay to ensure database operations complete
    await new Promise(resolve => setTimeout(resolve, 100));
    await loadEntriesFromSupabase();
    renderAll();
  }
  renderRecycleBinDropdown();
}

async function deleteTransfer(entry) {
  const meta = expenseMetaFromNotes(entry.notes);
  const isExpenseTransfer = meta.rowType === "EXPENSE";
  const isTopupTransfer = meta.rowType === "TOPUP";
  
  // Find the matching transfer partner
  let transferPartner = null;
  let transferType = "";
  
  if (isExpenseTransfer) {
    // This is the expense (money out) part, find the top-up (money in) part
    const transferMatch = entry.notes.match(/Transfer to ([^:]+):/);
    if (transferMatch) {
      const toWalletName = transferMatch[1];
      transferPartner = state.entries.find(e => 
        e.id !== entry.id &&
        hasExpenseAccountTag(e.notes) &&
        expenseMetaFromNotes(e.notes).rowType === "TOPUP" &&
        e.notes.includes(`Transfer from ${entry.person_name}`)
      );
      transferType = "expense";
    }
  } else if (isTopupTransfer) {
    // This is the top-up (money in) part, find the expense (money out) part
    const transferMatch = entry.notes.match(/Transfer from ([^:]+):/);
    if (transferMatch) {
      const fromWalletName = transferMatch[1];
      transferPartner = state.entries.find(e => 
        e.id !== entry.id &&
        hasExpenseAccountTag(e.notes) &&
        expenseMetaFromNotes(e.notes).rowType === "EXPENSE" &&
        e.notes.includes(`Transfer to ${entry.person_name}`)
      );
      transferType = "topup";
    }
  }
  
  if (!transferPartner) {
    // No partner found, just move this entry to recycle bin
    if (!confirm(`Move this transfer record to recycle bin? No matching transfer partner found.`)) return;
    if (isBackupMode()) {
      addToRecycleBin(entry);
      state.entries = state.entries.filter(e => e.id !== entry.id);
    } else {
      addToRecycleBin(entry);
      await supabase(`${CONFIG.table}?id=eq.${encodeURIComponent(entry.id)}`, { 
        method: "PATCH", 
        body: JSON.stringify({ deleted: true, deleted_at: new Date().toISOString() }) 
      });
    }
    return;
  }
  
  // Found transfer partner, ask to move both to recycle bin
  const confirmMessage = transferType === "expense" 
    ? `Move this transfer from ${entry.person_name} to ${transferPartner.person_name} to recycle bin?\n\nThis will move BOTH:\n- The expense record (money out) from ${entry.person_name}\n- The top-up record (money in) to ${transferPartner.person_name}\n\nYou can restore them later from the recycle bin.`
    : `Move this transfer from ${transferPartner.person_name} to ${entry.person_name} to recycle bin?\n\nThis will move BOTH:\n- The expense record (money out) from ${transferPartner.person_name}\n- The top-up record (money in) to ${entry.person_name}\n\nYou can restore them later from the recycle bin.`;
  
  if (!confirm(confirmMessage)) return;
  
  // Move both transfer records to recycle bin
  if (isBackupMode()) {
    addToRecycleBin(entry);
    addToRecycleBin(transferPartner);
    state.entries = state.entries.filter(e => e.id !== entry.id && e.id !== transferPartner.id);
    refreshBackupView();
    renderAll();
  } else {
    addToRecycleBin(entry);
    addToRecycleBin(transferPartner);
    await supabase(`${CONFIG.table}?id=eq.${encodeURIComponent(entry.id)}`, { 
      method: "PATCH", 
      body: JSON.stringify({ notes: addDeletedTag(entry.notes || "") }) 
    });
    await supabase(`${CONFIG.table}?id=eq.${encodeURIComponent(transferPartner.id)}`, { 
      method: "PATCH", 
      body: JSON.stringify({ notes: addDeletedTag(transferPartner.notes || "") }) 
    });
    // Add a small delay to ensure database operations complete
    await new Promise(resolve => setTimeout(resolve, 100));
    await loadEntriesFromSupabase();
    renderAll();
  }
  renderRecycleBinDropdown();
}

async function deletePersonRecords(personNameEncoded, direction){
  const personName = decodeURIComponent(personNameEncoded || "").trim();
  if (!personName || !direction) return;

  const recordsCount = state.entries.filter(e =>
    e.direction === direction && String(e.person_name || "").trim() === personName
  ).length;

  if (!recordsCount) {
    alert("No records found for this person.");
    return;
  }

  const directionLabel = direction === "given" ? "given" : "taken";
  if (!confirm(`Move full record for ${personName} to recycle bin? This will move ${recordsCount} entr${recordsCount === 1 ? "y" : "ies"} from ${directionLabel} to recycle bin.`)) return;

  if (isBackupMode()){
    const matchingEntries = state.entries.filter(e => e.direction === direction && String(e.person_name || "").trim() === personName);
    matchingEntries.forEach(e => addToRecycleBin(e));
    state.entries = state.entries.filter(e => !(e.direction === direction && String(e.person_name || "").trim() === personName));
    refreshBackupView();
    renderAll();
    renderRecycleBinDropdown();
    return;
  }

  const matchingIds = state.entries
    .filter(e => e.direction === direction && String(e.person_name || "").trim() === personName)
    .map(e => e.id)
    .filter(Boolean);

  const matchingEntries = state.entries.filter(e => e.direction === direction && String(e.person_name || "").trim() === personName);
  matchingEntries.forEach(e => addToRecycleBin(e));

  for (const id of matchingIds){
    const entry = state.entries.find(e => e.id === id);
    await supabase(`${CONFIG.table}?id=eq.${encodeURIComponent(id)}`, { 
      method: "PATCH", 
      body: JSON.stringify({ notes: addDeletedTag(entry?.notes || "") }) 
    });
  }

  // Add a small delay to ensure database operations complete
  await new Promise(resolve => setTimeout(resolve, 100));
  await loadEntriesFromSupabase();
  renderAll();
  renderRecycleBinDropdown();
}

async function movePersonToInstallments(personNameEncoded, direction){
  const personName = decodeURIComponent(personNameEncoded || "").trim();
  if (!personName || direction !== "taken") return;

  const matchedEntries = state.entries.filter(e =>
    e.direction === "taken" && String(e.person_name || "").trim() === personName
  );

  if (!matchedEntries.length){
    alert("No records found for this person.");
    return;
  }

  if (!confirm(`Move ${personName} to Installment Plans?`)) return;

  if (isBackupMode()){
    state.entries = state.entries.map(entry => (
      entry.direction === "taken" && String(entry.person_name || "").trim() === personName
        ? { ...entry, notes: normalizeInstallmentNote(entry.notes, true) }
        : entry
    ));
    refreshBackupView();
  } else {
    for (const entry of matchedEntries){
      await supabase(`${CONFIG.table}?id=eq.${encodeURIComponent(entry.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ notes: normalizeInstallmentNote(entry.notes, true) })
      });
    }
    await loadEntriesFromSupabase();
  }
  activate("installments");
}

async function getBase64ImageFromUrl(imageUrl) {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    return null;
  }
}

const PDF_BRAND = {
  owner: "Nadeem Shahzad Fida",
  email: "nadeemshahzadfida@outlook.com",
  mobile: "+971 55 921 6280",
  whatsapp: "+92 333 900 4564",
  facebook: "facebook.com/nadeemshahzadfida",
  systemName: "TRIPLE M by NSF"
};

let cachedPdfLogo = null;
async function getPdfLogo(){
  if (cachedPdfLogo !== null) return cachedPdfLogo;
  
  // Use JSON logo if available, otherwise use default
  const logoUrl = fullConfigData?.logo || "Assets/logo/logo2.png";
  
  try {
    cachedPdfLogo = await getBase64ImageFromUrl(logoUrl);
  } catch (error) {
    // If JSON logo fails, fall back to default logo
    console.warn('Failed to load logo from JSON config, using default logo:', error);
    cachedPdfLogo = await getBase64ImageFromUrl("Assets/logo/logo2.png");
  }
  
  return cachedPdfLogo;
}

function updateLogosFromConfig(){
  if (!fullConfigData?.logo) return;
  
  const logoUrl = fullConfigData.logo;
  const logoImages = document.querySelectorAll('img.mark[src="Assets/logo/logo2.png"]');
  
  logoImages.forEach(img => {
    // Test if the logo URL is accessible
    const testImg = new Image();
    testImg.onload = function() {
      // If logo loads successfully, update the src
      img.src = logoUrl;
    };
    testImg.onerror = function() {
      // If logo fails to load, keep the default
      console.warn('Failed to load logo from JSON config, keeping default logo');
    };
    testImg.src = logoUrl;
  });
}

function updateCurrencyFiltersFromConfig(){
  const allowedCurrencies = getAllowedCurrencies();
  
  // Get all currency filter radio buttons
  const currencyRadios = document.querySelectorAll('.currency-radio');
  
  currencyRadios.forEach(radio => {
    const currency = radio.value;
    const label = document.querySelector(`label[for="${radio.id}"]`);
    
    if (currency === "All") {
      // Always show "All" option
      radio.style.display = '';
      if (label) label.style.display = '';
    } else {
      // Show/hide based on allowed currencies (normalize comparison)
      const normalizedCurrency = normalizeCurrencyCode(currency);
      const isAllowed = allowedCurrencies.includes(normalizedCurrency);
      radio.style.display = isAllowed ? '' : 'none';
      if (label) label.style.display = isAllowed ? '' : 'none';
      
      // If current selection is not allowed, reset to "All"
      const filterKey = radio.dataset.currencyFilter;
      if (!isAllowed && state.currencyFilter[filterKey] === currency) {
        state.currencyFilter[filterKey] = "All";
        // Check the "All" radio button for this filter
        const allRadio = document.querySelector(`.currency-radio[data-currency-filter="${filterKey}"][value="All"]`);
        if (allRadio) allRadio.checked = true;
      }
    }
  });
  
  // Update currency select elements in modals
  updateCurrencySelectElements();
}

function updateCurrencySelectElements() {
  const allowedCurrencies = getAllowedCurrencies();
  
  // Find all currency select elements
  const currencySelects = document.querySelectorAll('select[name="currency"]');
  
  currencySelects.forEach(select => {
    // Store current selection if it's allowed
    const currentValue = select.value;
    const isCurrentValueAllowed = currentValue && allowedCurrencies.includes(currentValue);
    
    // Clear all options
    select.innerHTML = '';
    
    // Add allowed currency options
    allowedCurrencies.forEach(currency => {
      const option = document.createElement('option');
      option.value = currency;
      option.textContent = currency;
      select.appendChild(option);
    });
    
    // Restore previous selection if it's still allowed, otherwise select first allowed currency
    if (isCurrentValueAllowed) {
      select.value = currentValue;
    } else if (allowedCurrencies.length > 0) {
      select.value = allowedCurrencies[0];
    }
  });
  
  // Update currency button selections (for modals that use buttons instead of selects)
  updateCurrencyButtons();
}

function updateCurrencyButtons() {
  const allowedCurrencies = getAllowedCurrencies();
  
  // Find all currency chip buttons in modals
  const currencyChips = document.querySelectorAll('.currency-chip[data-currency]');
  
  currencyChips.forEach(chip => {
    const currency = chip.dataset.currency;
    const normalizedCurrency = normalizeCurrencyCode(currency);
    const isAllowed = allowedCurrencies.includes(normalizedCurrency);
    
    if (isAllowed) {
      chip.style.display = '';
    } else {
      chip.style.display = 'none';
    }
  });
  
  // Find all currency picker containers and ensure at least one currency is selected
  const currencyPickers = document.querySelectorAll('.currency-picker');
  
  currencyPickers.forEach(picker => {
    const visibleChips = picker.querySelectorAll('.currency-chip[data-currency]:not([style*="display: none"])');
    const hiddenInput = picker.querySelector('input[type="hidden"][name="currency"]');
    
    if (visibleChips.length > 0 && hiddenInput) {
      // Check if currently selected currency is still visible
      const currentlySelected = picker.querySelector('.currency-chip.active[data-currency]');
      if (!currentlySelected || currentlySelected.style.display === 'none') {
        // Select the first visible currency
        visibleChips[0].classList.add('active');
        visibleChips[0].click();
      }
    }
  });
}

function validateCurrencyForForm(formData) {
  const currency = formData.get('currency');
  if (!currency) return true; // Allow forms without currency
  
  const allowedCurrencies = getAllowedCurrencies();
  const normalizedCurrency = normalizeCurrencyCode(currency);
  const isAllowed = allowedCurrencies.includes(normalizedCurrency);
  
  if (!isAllowed) {
    throw new Error(`Currency "${currency}" is not supported. Supported currencies: ${allowedCurrencies.join(', ')}`);
  }
  
  return true;
}

function updateHeaderTextFromConfig(){
  const company = fullConfigData?.Company;
  const trn = fullConfigData?.TRN;
  
  let subtitle = "Money Management Module (Powered by Nadeem Shahzad Fida)";
  
  if (company && company.trim()) {
    // Create HTML with styling for company name (black and bold) and TRN (blue on next line)
    subtitle = `<span style="color: black; font-weight: bold;">${company.trim()}</span>`;
    if (trn && trn.trim()) {
      subtitle += `<br><span style="color: #2457d6; font-size: 0.9em;">TRN: ${trn.trim()}</span>`;
    }
  }
  
  // Update all header subtitle elements with HTML
  if (els.lockScreenSubtitle) els.lockScreenSubtitle.innerHTML = subtitle;
  if (els.standaloneAboutSubtitle) els.standaloneAboutSubtitle.innerHTML = subtitle;
  if (els.mainAppSubtitle) els.mainAppSubtitle.innerHTML = subtitle;
}

function drawPdfHeader(doc, logoData, title, subtitle){
  const pageWidth = doc.internal.pageSize.getWidth();

  // Premium gradient-like header background
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(10, 8, pageWidth - 20, 35, 3, 3, "F");

  // Accent border at top
  doc.setFillColor(36, 87, 214);
  doc.roundedRect(10, 8, pageWidth - 20, 3, 3, 3, "F");

  if (logoData){
    try {
      // Check if logo is from JSON (external URL) or default
      const isJsonLogo = fullConfigData?.logo && fullConfigData.logo.trim();
      
      if (isJsonLogo) {
        // For JSON logos, use smaller size to fit properly without stretching
        doc.addImage(logoData, "PNG", 15.5, 15, 40, 14);
      } else {
        // For default logo, use original size
        doc.addImage(logoData, "PNG", 15.5, 14, 50, 18);
      }
    } catch {}
  }

  // Title with premium styling
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(title, 72, 20);

  if (subtitle) {
    doc.setTextColor(71, 85, 105);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(subtitle, 72, 28);
  }
}

function drawPdfOwnerBlock(doc, y = 48){
  // Use JSON config data if available, otherwise use defaults
  const owner = fullConfigData?.Name || PDF_BRAND.owner;
  const email = fullConfigData?.email || PDF_BRAND.email;
  const mobile = fullConfigData?.Mobile || PDF_BRAND.mobile;
  const whatsapp = fullConfigData?.WhatsApp || PDF_BRAND.whatsapp;
  
  doc.setTextColor(23, 33, 43);
  doc.setFontSize(10);
  doc.text(`${owner}`, 14, y);
  doc.text(`Email: ${email}`, 14, y + 5);
  doc.text(`Mobile: ${mobile}`, 14, y + 10);
  doc.text(`WhatsApp: ${whatsapp}`, 14, y + 15);
}

function drawPdfFooter(doc){
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Premium footer background
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(12, pageHeight - 28, pageWidth - 24, 20, 2, 2, "F");

  // Top border line
  doc.setDrawColor(36, 87, 214);
  doc.setLineWidth(0.3);
  doc.line(12, pageHeight - 28, pageWidth - 12, pageHeight - 28);

  // System name with premium styling - use Company from JSON if available, otherwise default
  let companyName = PDF_BRAND.systemName;
  let trnText = null;
  
  if (fullConfigData?.Company && fullConfigData.Company.trim()) {
    companyName = fullConfigData.Company.trim();
    if (fullConfigData?.TRN && fullConfigData.TRN.trim()) {
      trnText = `TRN: ${fullConfigData.TRN.trim()}`;
    }
  }
  
  // Company name - black and bold
  doc.setTextColor(0, 0, 0); // Black color
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(companyName, pageWidth / 2, pageHeight - 22, { align: "center" });
  
  // TRN - on next line with current color (blue)
  if (trnText) {
    doc.setTextColor(36, 87, 214); // Current blue color
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(trnText, pageWidth / 2, pageHeight - 17, { align: "center" });
  }

  // Disclaimer text - adjust position based on whether TRN is present
  const disclaimerY = trnText ? pageHeight - 14 : pageHeight - 17;
  doc.setTextColor(102, 112, 133);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text("This is a system-generated document and does not require any signature", pageWidth / 2, disclaimerY, { align: "center" });

  // Contact information - use company name from JSON if available, otherwise default behavior
  let contactName, email, mobile;
  
  if (fullConfigData?.Company && fullConfigData.Company.trim()) {
    // Use company name from JSON without "Powered by" prefix
    contactName = fullConfigData.Company.trim();
    email = fullConfigData?.email || PDF_BRAND.email;
    mobile = fullConfigData?.Mobile || PDF_BRAND.mobile;
  } else {
    // Fallback to default behavior when no JSON data
    contactName = PDF_BRAND.owner;
    email = PDF_BRAND.email;
    mobile = PDF_BRAND.mobile;
  }
  
  // Adjust contact info position based on whether TRN is present
  const contactY = trnText ? pageHeight - 10 : pageHeight - 12;
  doc.setTextColor(71, 85, 105);
  doc.setFontSize(6.5);
  
  if (fullConfigData?.Company && fullConfigData.Company.trim()) {
    // When JSON company is available, show: Company Name | email | mobile
    doc.text(`${contactName} | ${email} | ${mobile}`, pageWidth / 2, contactY, { align: "center" });
  } else {
    // When no JSON data, show original: Powered by Nadeem Shahzad Fida | email | mobile
    doc.text(`Powered by ${contactName} | ${email} | ${mobile}`, pageWidth / 2, contactY, { align: "center" });
  }
}

function drawPdfHeaderAndFooter(doc, logoData, title, subtitle, showOwnerBlock = true){
  drawPdfHeader(doc, logoData, title, subtitle);
  if (showOwnerBlock) {
    drawPdfOwnerBlock(doc, 48);
  }
  drawPdfFooter(doc);
}

function buildPersonPdfData(personName, direction){
  const normalizedName = String(personName || "").trim();
  const personEntries = state.entries.filter(e =>
    e.direction === direction && String(e.person_name || "").trim() === normalizedName
  );
  if (!personEntries.length) return null;

  const principalRows = personEntries.filter(e => e.entry_kind === "principal");
  const actionRows = personEntries.filter(e => e.entry_kind !== "principal");

  const currency = principalRows[0]?.currency || actionRows[0]?.currency || "";
  const principalTotal = principalRows.reduce((sum, e) => sum + Number(e.principal_amount || 0), 0);
  const paidTotal = actionRows.reduce((sum, e) => sum + Number(e.action_amount || 0), 0);
  const remaining = Math.max(principalTotal - paidTotal, 0);
  const status = remaining <= 0 ? "Closed" : paidTotal > 0 ? "Partial" : "Open";
  const loanCount = new Set(personEntries.map(e => e.group_id).filter(Boolean)).size;

  const timeline = personEntries
    .slice()
    .sort((a, b) => {
      const aStamp = dateStamp(a.entry_kind === "principal" ? a.loan_date : a.action_date);
      const bStamp = dateStamp(b.entry_kind === "principal" ? b.loan_date : b.action_date);
      if (aStamp !== bStamp) return aStamp - bStamp;
      return (a.entry_kind === "principal" ? -1 : 1) - (b.entry_kind === "principal" ? -1 : 1);
    });

  let runningRemaining = 0;
  const rows = timeline.map(entry => {
    const isPrincipal = entry.entry_kind === "principal";
    const amount = Number(isPrincipal ? entry.principal_amount : entry.action_amount || 0);
    runningRemaining = isPrincipal
      ? runningRemaining + amount
      : Math.max(runningRemaining - amount, 0);

    return {
      date: isPrincipal ? (entry.loan_date || "—") : (entry.action_date || "—"),
      type: isPrincipal ? "Principal" : (entry.entry_kind === "partial" ? "Partial" : "Full"),
      amount,
      remainingAfter: runningRemaining,
      note: entry.notes || "—"
    };
  });

  return { personName: normalizedName, direction, currency, principalTotal, paidTotal, remaining, status, loanCount, rows };
}

async function downloadPersonPDF(personNameEncoded, direction) {
  if (!window.jspdf) {
    alert("PDF library loading. Please try again in a moment.");
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const personName = decodeURIComponent(personNameEncoded || "");
  const data = buildPersonPdfData(personName, direction);
  if (!data) {
    alert("No entries found for this person.");
    return;
  }

  const logoData = await getPdfLogo();
  const title = "Statement / Receipt";
  const subtitle = `Client: ${data.personName}`;

  drawPdfHeader(doc, logoData, title, subtitle);
  drawPdfOwnerBlock(doc, 48);

  doc.setTextColor(0);
  doc.setFontSize(11);
  doc.text(`Status: ${data.status}`, 132, 48);
  doc.text(`Currency: ${data.currency}`, 132, 54);
  doc.text(`Loan Entries: ${data.loanCount}`, 132, 60);

  const formatMon = (amt) => {
     const n = Number(amt || 0);
     const formatted = n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
     return `${data.currency ? data.currency + " " : ""}${formatted}`;
  };

  doc.text(`Principal: ${formatMon(data.principalTotal)}`, 132, 66);
  doc.text(`Paid/Returned: ${formatMon(data.paidTotal)}`, 132, 72);
  doc.text(`Remaining: ${formatMon(data.remaining)}`, 132, 78);

  const tableData = data.rows.map((r) => [
    displayDate(r.date),
    r.type,
    formatMon(r.amount),
    formatMon(r.remainingAfter),
    r.note || '—'
  ]);

  doc.autoTable({
    startY: 88,
    head: [['Date', 'Type', 'Amount', 'Remaining', 'Notes']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [36, 87, 214] },
    styles: { font: 'helvetica' },
    margin: { top: 50, bottom: 40 },
    didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
  });

  doc.save(`Statement_${data.personName.replace(/\s+/g, '_')}.pdf`);
}

function sectionLabel(searchKey){
  return searchKey === "given"
    ? "Loan Given"
    : searchKey === "received"
    ? "Received Back"
    : searchKey === "taken"
    ? "Loan Taken"
    : searchKey === "expenses"
    ? "Expenses"
    : "Returned Back";
}

function formatReportAmount(amount, currency){
  const n = Number(amount || 0);
  const isBtc = currency === "BTC";
  const formatted = n.toLocaleString("en-US", { minimumFractionDigits: isBtc ? 9 : 2, maximumFractionDigits: isBtc ? 9 : 2 });
  const symbol = currency === "AED" ? "AED" : currency === "SAR" ? "SAR" : currency === "PKR" ? "PKR" : currency === "USD" ? "USD" : currency === "BTC" ? "BTC" : currency || "";
  return `${symbol} ${formatted}`.trim();
}

// New function for PDF-specific currency formatting
function formatPdfAmount(amount, currency){
  const n = Number(amount || 0);
  const isBtc = currency === "BTC";
  const formatted = n.toLocaleString("en-US", { minimumFractionDigits: isBtc ? 9 : 2, maximumFractionDigits: isBtc ? 9 : 2 });
  const symbol = currency === "AED" ? "AED" : currency === "SAR" ? "SAR" : currency === "PKR" ? "PKR" : currency === "USD" ? "USD" : currency === "BTC" ? "BTC" : currency || "";
  return `${symbol} ${formatted}`.trim();
}

function buildSectionReportRows(direction, searchKey){
  if (searchKey === "expenses"){
    const accounts = getExpenseAccounts();
    const spendRows = collectExpenseSpendRows(accounts);
    const rows = spendRows
      .slice()
      .sort((a, b) => dateStamp(a.row.action_date) - dateStamp(b.row.action_date))
      .map(({ row, account }) => {
        const meta = expenseMetaFromNotes(row.notes);
        return [
          meta.itemName || "—",
          displayDate(row.action_date || "—"),
          `${account.person_name || "Wallet"} · ${meta.expenseType || "Other"}`,
          account.person_name || "Wallet",
          formatPdfAmount(Number(row.action_amount || 0), account.currency),
          "—",
          cleanExpenseNote(row.notes)
        ];
      });
    return { groups: accounts, rows };
  }

  const groups = getFilteredGroups(direction, searchKey);
  const rows = [];

  for (const group of groups){
    for (const row of group.rows){
      rows.push([
        group.person_name || "Unnamed",
        displayDate(row.date),
        row.kind === "principal" ? "Principal" : row.kind === "partial" ? "Partial" : "Full",
        formatPdfAmount(row.amount, group.currency),
        formatPdfAmount(row.remainingAfter, group.currency),
        row.note || "—"
      ]);
    }
  }

  return { groups, rows };
}

async function exportSectionPDF(searchKey){
  if (!window.jspdf){
    alert("PDF library loading. Please try again in a moment.");
    return;
  }

  const direction = (searchKey === "given" || searchKey === "received") ? "given" : "taken";
  const label = sectionLabel(searchKey);
  const report = buildSectionReportRows(direction, searchKey);
  if (!report.rows.length){
    alert("No entries found for this section.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // Load custom fonts for currency symbols
  await loadCustomFontsForPdf(doc);

  const logoData = await getPdfLogo();
  const title = `${label} - Full Report`;
  const subtitle = `Generated: ${new Date().toLocaleString()}`;

  drawPdfHeader(doc, logoData, title, subtitle);
  drawPdfOwnerBlock(doc, 48);
  doc.setTextColor(23, 33, 43);
  doc.setFontSize(10);
  const expensePdf = searchKey === "expenses";
  doc.text(`${expensePdf ? "Wallets in view" : "Members"}: ${report.groups.length}`, 132, 48);
  doc.text(`Rows: ${report.rows.length}`, 132, 54);

  const tableHead = expensePdf
    ? [["Item", "Date", "Wallet · Type", "Amount", "—", "Notes"]]
    : [["Member", "Date", "Type", "Amount", "Remaining", "Remarks"]];

  doc.autoTable({
    startY: 72,
    head: tableHead,
    body: report.rows,
    theme: "grid",
    headStyles: { fillColor: [36, 87, 214] },
    styles: { font: "helvetica", fontSize: 9, cellPadding: 2.5 },
    columnStyles: { 
      0: { cellWidth: expensePdf ? 35 : 38 }, 
      3: { cellWidth: expensePdf ? 32 : 28 }, // Amount column - wider for expenses to accommodate BTC
      4: { cellWidth: expensePdf ? 15 : 28 }, // Remaining/empty column
      5: { cellWidth: expensePdf ? 55 : 58 }  // Notes column
    },
    margin: { top: 50, bottom: 40 },
    didDrawPage: (data) => {
      drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false);
    }
  });

  doc.save(`${label.replace(/\s+/g, "_")}_Report.pdf`);
}


async function loadCustomFontsForPdf(doc){
  try {
    // Load Dirham symbol font
    const aedFontResponse = await fetch('Assets/style/fonts/AED.ttf');
    if (aedFontResponse.ok) {
      const aedFontBlob = await aedFontResponse.blob();
      const aedFontBase64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(aedFontBlob);
      });
      const aedFontData = atob(aedFontBase64.split(',')[1]);
      doc.addFileToVFS('AED.ttf', aedFontData);
      doc.addFont('AED.ttf', 'AED', 'normal');
    }

    // Load Riyal symbol font
    const sarFontResponse = await fetch('Assets/style/fonts/SAR.otf');
    if (sarFontResponse.ok) {
      const sarFontBlob = await sarFontResponse.blob();
      const sarFontBase64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(sarFontBlob);
      });
      const sarFontData = atob(sarFontBase64.split(',')[1]);
      doc.addFileToVFS('SAR.otf', sarFontData);
      doc.addFont('SAR.otf', 'SAR', 'normal');
    }
  } catch (e) {
    console.log('Failed to load custom fonts:', e);
  }
}

async function downloadCurrencyPDF(currency){
  if (!window.jspdf){
    alert("PDF library loading. Please try again in a moment.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // Load custom fonts for currency symbols
  await loadCustomFontsForPdf(doc);

  const logoData = await getPdfLogo();
  const title = `Currency Report - ${currency}`;
  const subtitle = `Generated: ${new Date().toLocaleString()}`;

  // Get currency-specific data
  const givenGroups = groupByLoan(state.entries.filter(e =>
    e.currency === currency &&
    e.direction === "given" &&
    !hasGoodsTag(e.notes)
  ));
  const takenGroups = groupByLoan(state.entries.filter(e =>
    e.currency === currency &&
    e.direction === "taken" &&
    !hasGoodsTag(e.notes) &&
    !hasExpenseAccountTag(e.notes)
  ));

  drawPdfHeader(doc, logoData, title, subtitle);
  drawPdfOwnerBlock(doc, 48);
  doc.setTextColor(23, 33, 43);
  doc.setFontSize(10);
  doc.text(`Given Loans: ${givenGroups.length}`, 132, 48);
  doc.text(`Taken Loans: ${takenGroups.length}`, 132, 54);

  // Build given loans data
  const givenRows = givenGroups.map(group => {
    const calc = calculateLoan(group);
    return [
      group.person_name || "Unnamed",
      displayDate(group.loan_date || "—"),
      "Principal",
      formatPdfAmount(group.principal?.principal_amount || 0, currency),
      formatPdfAmount(calc.remaining, currency),
      group.notes || "—"
    ];
  });

  // Build taken loans data
  const takenRows = takenGroups.map(group => {
    const calc = calculateLoan(group);
    return [
      group.person_name || "Unnamed",
      displayDate(group.loan_date || "—"),
      "Principal",
      formatPdfAmount(group.principal?.principal_amount || 0, currency),
      formatPdfAmount(calc.remaining, currency),
      group.notes || "—"
    ];
  });

  // Add given loans section
  if (givenRows.length > 0) {
    doc.autoTable({
      startY: 72,
      head: [["Member", "Date", "Type", "Amount", "Remaining", "Remarks"]],
      body: givenRows,
      theme: "grid",
      headStyles: { fillColor: [36, 87, 214] },
      styles: { font: "helvetica", fontSize: 9, cellPadding: 2.5 },
      margin: { top: 50, bottom: 40 },
      didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
    });
  }

  // Add taken loans section if there's space or on new page
  if (takenRows.length > 0) {
    if (givenRows.length > 0) doc.addPage();
    const takenTitle = `Currency Report - ${currency} (Taken Loans)`;
    drawPdfHeader(doc, logoData, takenTitle, subtitle);
    drawPdfOwnerBlock(doc, 48);
    doc.autoTable({
      startY: 72,
      head: [["Member", "Date", "Type", "Amount", "Remaining", "Remarks"]],
      body: takenRows,
      theme: "grid",
      headStyles: { fillColor: [36, 87, 214] },
      styles: { font: "helvetica", fontSize: 9, cellPadding: 2.5 },
      margin: { top: 50, bottom: 40 },
      didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, takenTitle, subtitle, false)
    });
  }

  doc.save(`Currency_${currency}_Report.pdf`);
}

async function downloadGoodsPDF(){
  if (!window.jspdf){
    alert("PDF library loading. Please try again in a moment.");
    return;
  }

  const goodsAll = getGoodsGroups({ applyUiFilters: false });
  if (!goodsAll.length){
    alert("No goods entries found.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // Load custom fonts for currency symbols
  await loadCustomFontsForPdf(doc);

  const logoData = await getPdfLogo();
  const title = "Goods Report - Full Summary";
  const subtitle = `Generated: ${new Date().toLocaleString()}`;

  drawPdfHeader(doc, logoData, title, subtitle);
  drawPdfOwnerBlock(doc, 48);
  doc.setTextColor(23, 33, 43);
  doc.setFontSize(10);
  doc.text(`Total Items: ${goodsAll.length}`, 132, 48);

  const goodsRows = goodsAll.map(group => {
    const meta = goodsMetaFromNotes(group.principal?.notes);
    return [
      group.person_name || "Unnamed",
      String(meta.boughtQty || 1),
      String(meta.soldQty || 0),
      String(group.remainingQty || 0),
      formatPdfAmount(group.profitLoss || 0, group.currency),
      group.currency || ""
    ];
  });

  doc.autoTable({
    startY: 72,
    head: [["Item", "Bought Qty", "Sold Qty", "In Stock", "P/L", "Currency"]],
    body: goodsRows,
    theme: "grid",
    headStyles: { fillColor: [36, 87, 214] },
    styles: { font: "helvetica", fontSize: 9, cellPadding: 2.5 },
    margin: { top: 50, bottom: 40 },
    didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
  });

  doc.save("Goods_Report.pdf");
}

async function downloadAllTopupsPDF(currencyFilter = null){
  if (!window.jspdf){
    alert("PDF library loading. Please try again in a moment.");
    return;
  }

  const allTopups = collectTopupTransactionsFlat(getExpenseAccounts({ applyUiFilters: false }));
  const filtered = currencyFilter
    ? allTopups.filter(t => String(t.currency || "").toUpperCase() === String(currencyFilter).toUpperCase())
    : allTopups;
  filtered.sort((a, b) => dateStamp(a.action_date || a.loan_date) - dateStamp(b.action_date || b.loan_date));

  if (!filtered.length){
    alert("No top-up records found for this selection.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // Load custom fonts for currency symbols
  await loadCustomFontsForPdf(doc);

  const logoData = await getPdfLogo();
  const subtitle = currencyFilter
    ? `Currency: ${currencyFilter}`
    : "All currencies (separate totals per currency)";
  const title = currencyFilter ? `Top-Up Records — ${currencyFilter}` : "Top-Up Records — all currencies";
  drawPdfHeader(
    doc,
    logoData,
    title,
    subtitle
  );
  drawPdfOwnerBlock(doc, 52);

  let tableStartY = 76;
  if (currencyFilter){
    const sum = filtered.reduce((s, t) => s + Number(t.action_amount || 0), 0);
    doc.setFontSize(10);
    doc.setTextColor(23, 33, 43);
    doc.text(`Transactions: ${filtered.length}`, 120, 58);
    doc.text(`Total: ${formatPdfAmount(sum, currencyFilter)}`, 120, 64);
    tableStartY = 72;
  }else{
    const totals = {};
    for (const t of filtered){
      const c = t.currency || "—";
      totals[c] = (totals[c] || 0) + Number(t.action_amount || 0);
    }
    let y = 58;
    doc.setFontSize(10);
    doc.setTextColor(23, 33, 43);
    doc.text(`Transactions: ${filtered.length}`, 120, y);
    y += 6;
    sortCurrenciesList(Object.keys(totals)).forEach(c => {
      doc.text(`Total (${c}): ${formatPdfAmount(totals[c], c)}`, 120, y);
      y += 6;
    });
    tableStartY = y + 8;
  }

  const bodyRows = filtered.map(tx => {
    const d = displayDate(tx.action_date || tx.loan_date || "—");
    const w = `${tx.person_name || "—"} (${tx.accountType || ""})`;
    const ty = tx.isOpeningBalance ? "Opening Balance" : "Top-up";
    const amt = formatPdfAmount(Number(tx.action_amount || 0), tx.currency);
    const note = cleanExpenseNote(tx.notes);
    const wrappedNote = wrapTextForPdf(note, 45).split('\n');
    if (currencyFilter) return [d, w, ty, amt, wrappedNote];
    return [d, w, ty, amt, tx.currency || "—", wrappedNote];
  });

  doc.autoTable({
    startY: tableStartY,
    head: currencyFilter ? [["Date", "Wallet", "Type", "Amount", "Notes"]] : [["Date", "Wallet", "Type", "Amount", "Cur", "Notes"]],
    body: bodyRows,
    theme: "grid",
    headStyles: { fillColor: [36, 87, 214] },
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 2.5, halign: "left" },
    margin: { left: 14, right: 14 },
    tableWidth: 180,
    columnStyles: currencyFilter
      ? {
          0: { cellWidth: 22 },
          1: { cellWidth: 36 },
          2: { cellWidth: 24 },
          3: { cellWidth: 26 },
          4: { cellWidth: 72 }
        }
      : {
          0: { cellWidth: 17 },
          1: { cellWidth: 31 },
          2: { cellWidth: 19 },
          3: { cellWidth: 22 },
          4: { cellWidth: 12 },
          5: { cellWidth: 79 }
        },
    margin: { left: 14, right: 14, top: 50, bottom: 40 },
    didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
  });

  doc.save(currencyFilter
    ? `Topups_${currencyFilter}_${todayISO()}.pdf`
    : `All_Topup_Records_${todayISO()}.pdf`);
}

async function downloadAllTransfersPDF(currencyFilter = null){
  if (!window.jspdf){
    alert("PDF library loading. Please try again in a moment.");
    return;
  }

  const events = buildTransferEvents();
  const currencies = currencyFilter ? [currencyFilter] : sortCurrenciesList([...new Set(events.flatMap(e => [e.curOut, e.curIn]))]);

  let tableRows = [];
  for (const cur of currencies){
    const rows = getTransferRowsForCurrency(cur, events);
    for (const r of rows){
      tableRows.push({
        currency: cur,
        dateRaw: r.date,
        date: displayDate(r.date || "—"),
        type: r.kind,
        wallet: r.walletLabel,
        withParty: r.counterparty || "—",
        amount: formatPdfAmount(r.amount, cur),
        rate: r.rateDisplay,
        convertedLeg: r.otherLegDisplay,
        notes: r.notes
      });
    }
  }

  tableRows.sort((a, b) => dateStamp(b.dateRaw) - dateStamp(a.dateRaw));

  if (!tableRows.length){
    alert("No transfer rows found for this selection.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // Load custom fonts for currency symbols
  await loadCustomFontsForPdf(doc);

  const logoData = await getPdfLogo();
  const title = currencyFilter ? `Transfer Records — ${currencyFilter}` : "Transfer Records — all currencies";
  const subtitle = "Sent and received legs per currency; rate matches the booking on each transfer.";
  drawPdfHeader(
    doc,
    logoData,
    title,
    subtitle
  );
  drawPdfOwnerBlock(doc, 52);
  doc.setFontSize(10);
  doc.setTextColor(23, 33, 43);

  let ySummary = 62;
  for (const cur of currencies){
    const { sent, received } = transferCurrencyTotals(cur, events);
    doc.text(`${cur} — Sent: ${formatPdfAmount(sent, cur)}   Received: ${formatPdfAmount(received, cur)}`, 120, ySummary);
    ySummary += 5;
  }

  const body = tableRows.map(r => {
    const wrappedNote = wrapTextForPdf(r.notes, 40).split('\n');
    return currencyFilter
      ? [r.date, r.type, r.wallet, r.withParty, r.amount, r.rate, r.convertedLeg, wrappedNote]
      : [r.currency, r.date, r.type, r.wallet, r.withParty, r.amount, r.rate, r.convertedLeg, wrappedNote];
  });

  doc.autoTable({
    startY: ySummary + 6,
    head: currencyFilter
      ? [["Date", "Type", "Wallet", "With", "Amount", "Rate", "Converted leg", "Notes"]]
      : [["Cur", "Date", "Type", "Wallet", "With", "Amount", "Rate", "Converted leg", "Notes"]],
    body,
    theme: "grid",
    headStyles: { fillColor: [36, 87, 214] },
    styles: { font: "helvetica", fontSize: 7.5, cellPadding: 2, minCellHeight: 12 },
    margin: { left: 14, right: 14 },
    tableWidth: 180,
    columnStyles: currencyFilter
      ? {
          0: { cellWidth: 17 }, // Date
          1: { cellWidth: 12 }, // Type
          2: { cellWidth: 22 }, // Wallet
          3: { cellWidth: 20 }, // With
          4: { cellWidth: 20 }, // Amount
          5: { cellWidth: 12 }, // Rate
          6: { cellWidth: 17 }, // Converted leg
          7: { cellWidth: 60 }  // Notes
        }
      : {
          0: { cellWidth: 9 }, // Cur
          1: { cellWidth: 15 }, // Date
          2: { cellWidth: 12 }, // Type
          3: { cellWidth: 20 }, // Wallet
          4: { cellWidth: 17 }, // With
          5: { cellWidth: 20 }, // Amount
          6: { cellWidth: 11 }, // Rate
          7: { cellWidth: 15 }, // Converted leg
          8: { cellWidth: 61 }  // Notes
        },
    didDrawPage: () => drawPdfFooter(doc)
  });

  doc.save(currencyFilter
    ? `Transfers_${currencyFilter}_${todayISO()}.pdf`
    : `All_Transfer_Records_${todayISO()}.pdf`);
}

async function downloadExpenseItemPDF(itemKey){
  if (!window.jspdf){
    alert("PDF library loading. Please try again in a moment.");
    return;
  }

  // Parse the item key to get currency and item name
  const [currency, itemName] = itemKey.split('||');
  
  // Get all expense accounts
  const accounts = getExpenseAccounts({ applyUiFilters: false });
  
  // Collect all expense transactions
  const spendAttached = collectExpenseSpendRows(accounts);
  const items = groupExpenseItems(spendAttached);
  
  // Find the specific item
  const targetItem = items.find(item => item.key === itemKey);
  if (!targetItem) {
    alert("Expense item not found.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // Load custom fonts for currency symbols
  await loadCustomFontsForPdf(doc);

  const logoData = await getPdfLogo();
  const title = `Expense Report - ${targetItem.displayName}`;
  const subtitle = `Generated: ${new Date().toLocaleString()}`;
  drawPdfHeader(doc, logoData, title, subtitle);
  drawPdfOwnerBlock(doc, 48);
  doc.setTextColor(23, 33, 43);
  doc.setFontSize(10);
  doc.text(`Item: ${targetItem.displayName}`, 132, 48);
  doc.text(`Type: ${targetItem.expenseType || 'Other'}`, 132, 54);
  doc.text(`Transactions: ${targetItem.txs.length}`, 132, 60);

  const rows = targetItem.txs.map(tx => [
    displayDate(tx.date || "—"),
    tx.wallet || "—",
    tx.expenseType || "—",
    formatPdfAmount(tx.amount, targetItem.currency),
    cleanExpenseNote(tx.notes)
  ]);

  doc.autoTable({
    startY: 72,
    head: [["Date", "Wallet", "Type", "Amount", "Notes"]],
    body: rows,
    theme: "grid",
    headStyles: { fillColor: [36, 87, 214] },
    styles: { font: "helvetica", fontSize: 9, cellPadding: 2.5 },
    columnStyles: { 3: { cellWidth: 30 }, 4: { cellWidth: 60 } },
    margin: { top: 50, bottom: 40 },
    didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
  });

  // Add summary at the bottom
  const finalY = doc.lastAutoTable.finalY || 72;
  doc.setTextColor(23, 33, 43);
  doc.setFontSize(10);
  doc.text(`Total Amount: ${formatPdfAmount(targetItem.total, targetItem.currency)}`, 14, finalY + 10);

  const fileName = `Expense_${targetItem.displayName.replace(/\s+/g, "_")}_${targetItem.currency}.pdf`;
  doc.save(fileName);
}

async function deleteExpenseWallet(groupId, walletName) {
  if (!groupId) return;
  
  // Get all entries related to this wallet
  const walletEntries = state.entries.filter(e => e.group_id === groupId);
  
  if (!walletEntries.length) {
    alert("No records found for this wallet.");
    return;
  }

  const confirmMessage = `Are you sure you want to delete the wallet "${walletName}"?\n\nThis will permanently delete ALL records related to this wallet:\n- ${walletEntries.length} total transactions\n- Including opening balance, top-ups, and expenses\n\nThis action cannot be undone!`;
  
  if (!confirm(confirmMessage)) return;

  if (isBackupMode()) {
    // In backup mode, remove from local state
    state.entries = state.entries.filter(e => e.group_id !== groupId);
    refreshBackupView();
  } else {
    // In database mode, delete all entries with this group_id
    try {
      await supabase(`${CONFIG.table}?group_id=eq.${encodeURIComponent(groupId)}`, { method: "DELETE" });
      await loadEntriesFromSupabase();
    } catch (error) {
      alert("Error deleting wallet: " + error.message);
      return;
    }
  }
}

function openTransferModal(fromGroupId, fromWalletName, currency) {
  els.transferModal.classList.remove("hide");
  els.transferModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  
  els.transferModalTitle.textContent = "Transfer Money";
  els.transferModalDesc.textContent = `Move money from ${fromWalletName} to another wallet.`;
  els.transferForm.reset();
  defaultDateInputs(els.transferForm);
  
  // Populate wallet options
  const accounts = getExpenseAccounts({ applyUiFilters: false });
  
  // Set from wallet (all wallets)
  els.transferFromWallet.innerHTML = accounts.map(a => 
    `<option value="${escapeHtml(a.group_id)}" ${a.group_id === fromGroupId ? 'selected' : ''}>${escapeHtml(a.person_name)} (${escapeHtml(formatReportAmount(a.balance, a.currency))}) - ${escapeHtml(a.currency)}</option>`
  ).join("");
  
  // Set to wallet (exclude from wallet)
  els.transferToWallet.innerHTML = accounts.filter(a => a.group_id !== fromGroupId).map(a => 
    `<option value="${escapeHtml(a.group_id)}">${escapeHtml(a.person_name)} (${escapeHtml(formatReportAmount(a.balance, a.currency))}) - ${escapeHtml(a.currency)}</option>`
  ).join("");
  
  if (els.transferToWallet.options.length === 0) {
    els.transferToWallet.innerHTML = '<option value="">No other wallets available</option>';
  }
  
  // Set currency indicators
  updateTransferCurrencyIndicators();
  
  // Add event listeners for currency changes
  els.transferFromWallet.addEventListener("change", updateTransferCurrencyIndicators);
  els.transferToWallet.addEventListener("change", updateTransferCurrencyIndicators);
  els.transferForm.querySelector('input[name="amount"]').addEventListener("input", calculateReceivedAmount);
  els.conversionRateInput.addEventListener("input", calculateReceivedAmount);
}

function updateTransferCurrencyIndicators() {
  const accounts = getExpenseAccounts({ applyUiFilters: false });
  const fromGroupId = els.transferFromWallet.value;
  const toGroupId = els.transferToWallet.value;
  
  const fromAccount = accounts.find(a => a.group_id === fromGroupId);
  const toAccount = accounts.find(a => a.group_id === toGroupId);
  
  if (fromAccount) {
    els.fromCurrencyIndicator.textContent = fromAccount.currency;
  }
  
  if (toAccount) {
    els.toCurrencyIndicator.textContent = toAccount.currency;
  }
  
  // Update conversion rate field visibility and help text
  if (fromAccount && toAccount) {
    const isSameCurrency = fromAccount.currency === toAccount.currency;
    els.conversionRateInput.style.display = isSameCurrency ? "none" : "block";
    els.conversionHelp.style.display = isSameCurrency ? "none" : "inline";
    
    if (isSameCurrency) {
      els.conversionRateInput.value = "1";
      calculateReceivedAmount();
    } else {
      els.conversionRateInput.value = "";
      els.transferForm.querySelector('input[name="received_amount"]').value = "";
    }
    
    // Update help text
    if (!isSameCurrency) {
      els.conversionHelp.textContent = `(1 ${fromAccount.currency} = ? ${toAccount.currency})`;
    }
  }
  
  calculateReceivedAmount();
}

function calculateReceivedAmount() {
  const amount = parseFloat(els.transferForm.querySelector('input[name="amount"]').value) || 0;
  const conversionRate = parseFloat(els.conversionRateInput.value) || 1;
  const receivedAmount = amount * conversionRate;
  
  els.transferForm.querySelector('input[name="received_amount"]').value = receivedAmount.toFixed(2);
}

async function saveTransfer(form) {
  const fd = new FormData(form);
  const fromGroupId = String(fd.get("from_wallet") || "").trim();
  const toGroupId = String(fd.get("to_wallet") || "").trim();
  const amount = Number(fd.get("amount") || 0);
  const conversionRate = Number(fd.get("conversion_rate") || 1);
  const receivedAmount = Number(fd.get("received_amount") || 0);
  const date = String(fd.get("date") || "");
  const notes = String(fd.get("notes") || "").trim() || null;
  
  if (!fromGroupId || !toGroupId) throw new Error("Please select both wallets.");
  if (fromGroupId === toGroupId) throw new Error("Cannot transfer to the same wallet.");
  if (amount === null || amount === undefined || isNaN(amount) || amount < 0) throw new Error("Please enter a valid amount.");
  if (!date) throw new Error("Please select a date.");
  
  const accounts = getExpenseAccounts({ applyUiFilters: false });
  const fromAccount = accounts.find(a => a.group_id === fromGroupId);
  const toAccount = accounts.find(a => a.group_id === toGroupId);
  
  if (!fromAccount || !toAccount) throw new Error("Selected wallet not found.");
  if (amount > fromAccount.balance) throw new Error(`Insufficient balance. Available: ${formatReportAmount(fromAccount.balance, fromAccount.currency)}`);
  
  // Validate conversion rate for cross-currency transfers
  const isCrossCurrency = fromAccount.currency !== toAccount.currency;
  if (isCrossCurrency && (!conversionRate || conversionRate <= 0)) {
    throw new Error("Please enter a valid conversion rate for cross-currency transfer.");
  }
  
  // Create transfer records
  let transferNote, receiveNote;
  
  if (isCrossCurrency) {
    transferNote = notes 
      ? `Transfer to ${toAccount.person_name}: ${amount} ${fromAccount.currency} → ${receivedAmount.toFixed(2)} ${toAccount.currency} (Rate: ${conversionRate}) - ${notes}`
      : `Transfer to ${toAccount.person_name}: ${amount} ${fromAccount.currency} → ${receivedAmount.toFixed(2)} ${toAccount.currency} (Rate: ${conversionRate})`;
    receiveNote = notes 
      ? `Transfer from ${fromAccount.person_name}: ${amount} ${fromAccount.currency} → ${receivedAmount.toFixed(2)} ${toAccount.currency} (Rate: ${conversionRate}) - ${notes}`
      : `Transfer from ${fromAccount.person_name}: ${amount} ${fromAccount.currency} → ${receivedAmount.toFixed(2)} ${toAccount.currency} (Rate: ${conversionRate})`;
  } else {
    transferNote = notes ? `Transfer to ${toAccount.person_name}: ${notes}` : `Transfer to ${toAccount.person_name}`;
    receiveNote = notes ? `Transfer from ${fromAccount.person_name}: ${notes}` : `Transfer from ${fromAccount.person_name}`;
  }
  
  const expensePayload = {
    group_id: fromGroupId,
    direction: "taken",
    entry_kind: "full",
    person_name: fromAccount.person_name,
    currency: fromAccount.currency,
    principal_amount: null,
    action_amount: amount,
    loan_date: fromAccount.principal?.loan_date || date,
    action_date: date,
    notes: upsertExpenseMetaInNote(transferNote, { rowType: "EXPENSE", expenseType: "Transfer" })
  };
  
  const topupPayload = {
    group_id: toGroupId,
    direction: "taken",
    entry_kind: "full",
    person_name: toAccount.person_name,
    currency: toAccount.currency,
    principal_amount: null,
    action_amount: receivedAmount,
    loan_date: toAccount.principal?.loan_date || date,
    action_date: date,
    notes: upsertExpenseMetaInNote(receiveNote, { rowType: "TOPUP" })
  };
  
  if (isBackupMode()) {
    const now = new Date().toISOString();
    state.entries.unshift({ ...expensePayload, id: crypto.randomUUID(), created_at: now });
    state.entries.unshift({ ...topupPayload, id: crypto.randomUUID(), created_at: now });
    refreshBackupView();
  } else {
    await supabase(CONFIG.table, { method: "POST", body: JSON.stringify(expensePayload) });
    await supabase(CONFIG.table, { method: "POST", body: JSON.stringify(topupPayload) });
    await loadEntriesFromSupabase();
  }
  
  // Show transfer success overlay
  showTransferSuccessOverlay(fromAccount, toAccount, amount, fromAccount.currency);
  
  closeModal("transferModal");
  form.reset();
}

function showTransferSuccessOverlay(fromAccount, toAccount, amount, currency) {
  const overlay = document.getElementById("transferSuccessOverlay");
  const amountElement = document.getElementById("transferSuccessAmount");
  const fromWalletElement = document.getElementById("transferSuccessFromWallet");
  const toWalletElement = document.getElementById("transferSuccessToWallet");
  
  // Set transfer details with wallet icons
  amountElement.textContent = formatReportAmount(amount, currency);
  fromWalletElement.innerHTML = `${getWalletIconHtml(fromAccount.person_name, 16)} ${fromAccount.person_name}`;
  toWalletElement.innerHTML = `${getWalletIconHtml(toAccount.person_name, 16)} ${toAccount.person_name}`;
  
  // Show overlay
  overlay.classList.remove("hide");
  overlay.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  
  // Auto-hide after 4 seconds
  setTimeout(() => {
    closeTransferSuccessOverlay();
  }, 4000);
}

function closeTransferSuccessOverlay() {
  const overlay = document.getElementById("transferSuccessOverlay");
  overlay.classList.add("hide");
  overlay.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function showMoneyAddedSuccessOverlay(walletName, amount, currency) {
  const overlay = document.getElementById("moneyAddedSuccessOverlay");
  const amountElement = document.getElementById("moneyAddedSuccessAmount");
  const walletElement = document.getElementById("moneyAddedSuccessWallet");
  
  // Set money added details with wallet icon
  amountElement.textContent = formatReportAmount(amount, currency);
  walletElement.innerHTML = `${getWalletIconHtml(walletName, 16)} ${walletName}`;
  
  // Show overlay
  overlay.classList.remove("hide");
  overlay.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  
  // Auto-hide after 4 seconds
  setTimeout(() => {
    closeMoneyAddedSuccessOverlay();
  }, 4000);
}

function closeMoneyAddedSuccessOverlay() {
  els.moneyAddedSuccessOverlay.classList.add('hide');
  els.moneyAddedSuccessOverlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function closeBtcTransactionSuccessOverlay() {
  els.btcTransactionSuccessOverlay.classList.add('hide');
  els.btcTransactionSuccessOverlay.setAttribute('aria-hidden', 'true');
}

function showBtcTransactionSuccessOverlay(amountSat, toAddress, txid) {
  // Format the amount for display
  const amountBtc = btcFormatBtcFromSat(amountSat);
  const walletAddress = state.bitcoin.wallet ? state.bitcoin.wallet.address : 'Your Wallet';
  
  // Update overlay content
  els.btcTransactionSuccessAmount.textContent = `${amountBtc} BTC`;
  els.btcTransactionSuccessFromWallet.textContent = walletAddress.slice(0, 12) + '...';
  els.btcTransactionSuccessToWallet.textContent = toAddress.slice(0, 12) + '...';
  els.btcTransactionSuccessTxid.textContent = `Transaction ID: ${txid}`;
  
  // Show overlay
  els.btcTransactionSuccessOverlay.classList.remove('hide');
  els.btcTransactionSuccessOverlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    closeBtcTransactionSuccessOverlay();
  }, 5000);
}

async function downloadExpensesPDF(){
  return exportSectionPDF("expenses");
}

async function exportAllSectionsPDF(){
  if (!window.jspdf){
    alert("PDF library loading. Please try again in a moment.");
    return;
  }

  const sectionDefs = [
    { key: "given", direction: "given", label: "Loan Given" },
    { key: "received", direction: "given", label: "Received Back" },
    { key: "taken", direction: "taken", label: "Loan Taken" },
    { key: "returned", direction: "taken", label: "Returned Back" },
    { key: "expenses", direction: "taken", label: "Expenses" }
  ];

  const sectionReports = sectionDefs.map(def => ({
    ...def,
    ...buildSectionReportRows(def.direction, def.key)
  }));

  const totalRows = sectionReports.reduce((sum, s) => sum + s.rows.length, 0);
  if (!totalRows){
    alert("No entries found to export.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // Load custom fonts for currency symbols
  await loadCustomFontsForPdf(doc);

  const logoData = await getPdfLogo();
  drawPdfHeader(doc, logoData, "All Sections - Detailed Report", `Generated: ${new Date().toLocaleString()}`);
  drawPdfOwnerBlock(doc, 48);
  doc.setTextColor(23, 33, 43);
  doc.setFontSize(10);
  doc.text(`Total Rows: ${totalRows}`, 132, 48);

  let printedSections = 0;
  for (const section of sectionReports) {
    if (!section.rows.length) continue;
    if (printedSections > 0) doc.addPage();
    drawPdfHeader(doc, logoData, section.label, "Section Summary");
    drawPdfOwnerBlock(doc, 48);
    doc.setTextColor(23, 33, 43);
    doc.setFontSize(10);
    const secExpense = section.key === "expenses";
    doc.text(`${secExpense ? "Wallets in view" : "Members"}: ${section.groups.length}`, 132, 48);
    doc.text(`Rows: ${section.rows.length}`, 132, 54);

    // Process rows to keep currency text format
    const processedRows = section.rows.map(row => {
      if (secExpense) {
        const walletCell = row[2];
        const amountCell = row[4];
        // Keep currency text format (AED, SAR, PKR) for PDF
        const updatedWalletCell = walletCell;
        const updatedAmountCell = amountCell;
        return [
          row[0],
          row[1],
          updatedWalletCell,
          updatedAmountCell,
          row[5],
          row[6]
        ];
      } else {
        return row.map(cell => {
          if (typeof cell === 'string') {
            return cell; // Keep currency text format
          }
          return cell;
        });
      }
    });

    const secHead = secExpense
      ? [["Item", "Date", "Wallet · Type", "Amount", "—", "Notes"]]
      : [["Member", "Date", "Type", "Amount", "Remaining", "Remarks"]];

    doc.autoTable({
      startY: 72,
      head: secHead,
      body: section.rows,
      theme: "grid",
      headStyles: { fillColor: [36, 87, 214] },
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 2.2 },
      columnStyles: { 0: { cellWidth: 34 }, 5: { cellWidth: 55 } },
      didDrawCell: (data) => {
        // Apply custom fonts to currency symbols in body cells
        if (data.section === 'body' && typeof data.cell.raw === 'string') {
          const cellText = data.cell.raw;
          if (cellText.includes('AED')) {
            doc.setFont('AED');
            doc.setFontSize(8.5);
          } else if (cellText.includes('SAR')) {
            doc.setFont('SAR');
            doc.setFontSize(8.5);
          } else {
            doc.setFont('helvetica');
            doc.setFontSize(8.5);
          }
        }
      },
      margin: { top: 50, bottom: 40 },
      didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, section.label, "Section Summary", false)
    });
    printedSections += 1;
  }

  doc.save("All_Sections_Detailed_Report.pdf");
}

function downloadJsonBackup(){
  const payload = {
    exportedAt: new Date().toISOString(),
    source: state.dataSource,
    entries: state.entries
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `LoanLedger_Backup_${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadCsvBackup(){
  const csvText = toCsv(state.entries);
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `LoanLedger_Backup_${todayISO()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function importJsonBackup(file){
  if (!file) return;
  const text = await file.text();
  let parsed;
  try{
    parsed = JSON.parse(text);
  }catch{
    throw new Error("Invalid JSON file.");
  }
  const entries = parseEntriesPayload(parsed);
  if (!Array.isArray(entries)){
    throw new Error("JSON file must contain an entries array.");
  }
  
  // Filter entries based on allowed currencies
  const allowedCurrencies = getAllowedCurrencies();
  const filteredEntries = entries.filter(entry => {
    if (!entry.currency) return true; // Allow entries without currency
    return allowedCurrencies.includes(normalizeCurrencyCode(entry.currency));
  });
  
  // Warn if some entries were filtered out
  if (filteredEntries.length < entries.length) {
    const filteredCount = entries.length - filteredEntries.length;
    console.warn(`${filteredCount} entries were filtered out due to unsupported currencies.`);
  }
  
  applyEntries(filteredEntries, "backup", { hasImportedFile: true });
  if (state.unlocked) {
    await refreshDbSnapshot();
    renderAll();
  }
}

async function importCsvBackup(file){
  if (!file) return;
  const text = await file.text();
  const entries = parseEntriesCsv(text);
  
  // Filter entries based on allowed currencies
  const allowedCurrencies = getAllowedCurrencies();
  const filteredEntries = entries.filter(entry => {
    if (!entry.currency) return true; // Allow entries without currency
    return allowedCurrencies.includes(normalizeCurrencyCode(entry.currency));
  });
  
  // Warn if some entries were filtered out
  if (filteredEntries.length < entries.length) {
    const filteredCount = entries.length - filteredEntries.length;
    console.warn(`${filteredCount} entries were filtered out due to unsupported currencies.`);
  }
  
  applyEntries(filteredEntries, "backup", { hasImportedFile: true });
  if (state.unlocked) {
    await refreshDbSnapshot();
    renderAll();
  }
}

function sanitizeEntryForSupabase(entry){
  const normalizedLoanDate = normalizeDateForDb(entry.loan_date);
  const normalizedActionDate = normalizeDateForDb(entry.action_date);
  return {
    group_id: String(entry.group_id || "").trim(),
    direction: String(entry.direction || "").trim(),
    entry_kind: String(entry.entry_kind || "").trim(),
    person_name: String(entry.person_name || "").trim(),
    currency: String(entry.currency || "").trim(),
    principal_amount: entry.principal_amount == null || entry.principal_amount === "" ? null : Number(entry.principal_amount),
    action_amount: entry.action_amount == null || entry.action_amount === "" ? null : Number(entry.action_amount),
    loan_date: normalizedLoanDate,
    action_date: normalizedActionDate,
    notes: entry.notes == null || String(entry.notes).trim() === "" ? null : String(entry.notes)
  };
}

function updateDbSnapshot(rows){
  const validRows = Array.isArray(rows) ? rows : [];
  state.dbEntryIds = new Set(validRows.map(r => r.id).filter(Boolean));
  state.dbSignatures = new Set(validRows.map(entrySignature));
  state.dbSignaturesById = new Map(validRows.filter(r => r.id).map(r => [r.id, entrySignature(r)]));
}

function getUnsyncedEntriesForPerson(personName, direction){
  if (!state.unlocked){
    return state.hasImportedFile
      ? state.entries.filter(entry => entry.direction === direction && String(entry.person_name || "").trim() === personName)
      : [];
  }
  return state.entries.filter(entry => {
    if (entry.direction !== direction) return false;
    if (String(entry.person_name || "").trim() !== personName) return false;
    const signature = entrySignature(entry);
    const byId = entry.id && state.dbEntryIds.has(entry.id);
    if (byId){
      const dbSignature = state.dbSignaturesById.get(entry.id);
      return dbSignature !== signature;
    }
    const bySignature = state.dbSignatures.has(signature);
    return !byId && !bySignature;
  });
}

async function refreshDbSnapshot(){
  if (!runtimeConfig?.supabaseUrl || !runtimeConfig?.supabaseKey) return;
  const rows = await supabase(`${CONFIG.table}?select=*`);
  updateDbSnapshot(Array.isArray(rows) ? rows : []);
}

async function uploadBackupToDatabase(){
  if (!state.hasImportedFile || state.dataSource !== "backup"){
    alert("Please import a JSON or CSV file first.");
    return;
  }
  if (!runtimeConfig?.supabaseUrl || !runtimeConfig?.supabaseKey){
    alert("Please connect to the database first using your username and ZIP password.");
    els.lockScreen.classList.remove("hide");
    focusUnlockForm();
    return;
  }

  const cleanedRows = state.entries
    .map(sanitizeEntryForSupabase)
    .filter(row => row.group_id && row.direction && row.entry_kind && row.person_name && row.currency && row.loan_date);

  if (!cleanedRows.length){
    throw new Error("No valid rows found to upload. Please verify CSV/JSON date format.");
  }

  if (!confirm(`Upload imported backup to database? This will DELETE existing records and replace with ${cleanedRows.length} row(s).`)) return;

  await supabase(`${CONFIG.table}?id=not.is.null`, { method: "DELETE" });
  await supabase(CONFIG.table, { method: "POST", body: JSON.stringify(cleanedRows) });
  await refreshDbSnapshot();
  renderAll();

  alert("Database updated successfully from imported backup.");
}

async function savePersonRecordsToDatabase(personNameEncoded, direction){
  const personName = decodeURIComponent(personNameEncoded || "").trim();
  if (!personName || !direction) return;
  if (!runtimeConfig?.supabaseUrl || !runtimeConfig?.supabaseKey){
    alert("Please connect to the database first using your username and ZIP password.");
    els.lockScreen.classList.remove("hide");
    focusUnlockForm();
    return;
  }

  await refreshDbSnapshot();
  const unsyncedEntries = getUnsyncedEntriesForPerson(personName, direction);
  if (!unsyncedEntries.length){
    alert("All records for this member are already saved in database.");
    return;
  }

  const payload = unsyncedEntries
    .map(sanitizeEntryForSupabase)
    .filter(row => row.group_id && row.direction && row.entry_kind && row.person_name && row.currency && row.loan_date);

  if (!payload.length){
    alert("No valid rows found for database save.");
    return;
  }

  await supabase(CONFIG.table, { method: "POST", body: JSON.stringify(payload) });
  await refreshDbSnapshot();
  renderAll();
  alert(`Saved ${payload.length} record(s) to database for ${personName}.`);
}

function expandWalletsOverview() {
  els.walletsOverviewSection.classList.remove("collapsed");
  els.walletsOverviewSection.classList.add("expanded");
  els.toggleWalletsBtn.textContent = "▼";
  els.toggleWalletsBtn.title = "Collapse Wallets Overview";
}

function collapseWalletsOverview() {
  els.walletsOverviewSection.classList.remove("expanded");
  els.walletsOverviewSection.classList.add("collapsed");
  els.toggleWalletsBtn.textContent = "▶";
  els.toggleWalletsBtn.title = "Expand Wallets Overview";
}

function toggleWalletsOverview() {
  const isExpanded = els.walletsOverviewSection.classList.contains("expanded");
  if (isExpanded) {
    collapseWalletsOverview();
  } else {
    expandWalletsOverview();
  }
}

function expandMainOverview() {
  els.mainOverview.classList.remove("collapsed");
  els.mainOverview.classList.add("expanded");
  els.toggleMainOverviewBtn.textContent = "▼";
  els.toggleMainOverviewBtn.title = "Collapse Overview";
}

function collapseMainOverview() {
  els.mainOverview.classList.remove("expanded");
  els.mainOverview.classList.add("collapsed");
  els.toggleMainOverviewBtn.textContent = "▶";
  els.toggleMainOverviewBtn.title = "Expand Overview";
}

function toggleMainOverview() {
  const isExpanded = els.mainOverview.classList.contains("expanded");
  if (isExpanded) {
    collapseMainOverview();
  } else {
    expandMainOverview();
  }
}

function attachEvents(){
  const closeAllMenus = () => {
    document.querySelectorAll(".menu-dropdown.open").forEach(panel => panel.classList.remove("open"));
    document.querySelectorAll(".menu-trigger[aria-expanded='true']").forEach(trigger => trigger.setAttribute("aria-expanded", "false"));
  };

  document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => activate(btn.dataset.tab)));

  document.querySelectorAll("[data-open-modal]").forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.openModal;
      const direction = btn.dataset.direction || "given";
      if (mode === "principal") activate(direction === "given" ? "given" : "taken");
      if (mode === "payment") activate(direction === "given" ? "given" : "taken");
      openEntryModal(mode, direction);
    });
  });
  els.openGoodsBoughtBtn.addEventListener("click", () => {
    activate("goods");
    openGoodsModal("bought");
  });
  els.openGoodsSoldBtn.addEventListener("click", () => {
    activate("goods");
    openGoodsModal("sold");
  });
  els.openExpenseAccountBtn.addEventListener("click", () => {
    activate("expenses");
    openExpenseModal("account");
  });
  els.openExpenseTopupBtn.addEventListener("click", () => {
    activate("expenses");
    openExpenseModal("topup");
  });
  els.openExpenseEntryBtn.addEventListener("click", () => {
    activate("expenses");
    openExpenseModal("expense");
  });

  els.toggleWalletsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleWalletsOverview();
  });
  els.walletsBanner.addEventListener("click", toggleWalletsOverview);

  els.toggleMainOverviewBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMainOverview();
  });
  els.mainOverviewBanner.addEventListener("click", toggleMainOverview);

  document.querySelectorAll("[data-entry-menu]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const key = btn.dataset.entryMenu;
      const panel = document.querySelector(`[data-entry-menu-panel="${key}"]`);
      if (!panel) return;
      document.querySelectorAll(".menu-dropdown.open").forEach(openPanel => {
        if (openPanel !== panel) openPanel.classList.remove("open");
      });
      document.querySelectorAll(".menu-trigger[aria-expanded='true']").forEach(trigger => {
        if (trigger !== btn) trigger.setAttribute("aria-expanded", "false");
      });
      const nowOpen = panel.classList.toggle("open");
      btn.setAttribute("aria-expanded", nowOpen ? "true" : "false");

      // Position the dropdown using fixed positioning
      if (nowOpen) {
        const rect = btn.getBoundingClientRect();
        panel.style.top = `${rect.bottom + 6}px`;
        panel.style.left = `${rect.right - panel.offsetWidth}px`;
        // Ensure dropdown doesn't go off-screen to the right
        if (rect.right - panel.offsetWidth < 10) {
          panel.style.left = `${Math.max(10, rect.left)}px`;
        }
        
        // Render recycle bin items if this is the recycle bin dropdown
        if (key === "recyclebin") {
          renderRecycleBinDropdown();
        }
      }
    });
  });

  document.addEventListener("click", e => {
    const trigger = e.target.closest(".menu-trigger");
    document.querySelectorAll(".menu-dropdown.open").forEach(panel => {
      if (trigger && panel.previousElementSibling === trigger) return;
      panel.classList.remove("open");
      if (panel.previousElementSibling?.classList.contains("menu-trigger")){
        panel.previousElementSibling.setAttribute("aria-expanded", "false");
      }
    });
    if (!e.target.closest(".note-wrap")){
      document.querySelectorAll(".note-popover").forEach(pop => pop.classList.add("hide"));
      updateNoteBackdropVisibility();
    }
  });
  window.addEventListener("scroll", () => {
    closeAllMenus();
    repositionOpenNotePopovers();
  }, { passive: true });
  window.addEventListener("resize", repositionOpenNotePopovers);

  document.querySelectorAll("[data-close-modal]").forEach(btn => {
    btn.addEventListener("click", e => closeModal(e.target.dataset.closeModal));
  });

  [els.entryModal, els.editModal, els.goodsModal, els.expenseModal].forEach(m => {
    m.addEventListener("click", e => {
      if (e.target && e.target.matches(".modal-backdrop")) closeModal(m.id);
    });
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      if (!els.entryModal.classList.contains("hide")) closeModal("entryModal");
      if (!els.editModal.classList.contains("hide")) closeModal("editModal");
      if (!els.goodsModal.classList.contains("hide")) closeModal("goodsModal");
      if (!els.expenseModal.classList.contains("hide")) closeModal("expenseModal");
    }
  });

  document.querySelectorAll(".currency-chip").forEach(btn => {
    btn.addEventListener("click", () => setCurrencyChoice(btn.closest('form'), btn.dataset.currency));
  });

  document.querySelectorAll(".filter-radio").forEach(r => {
    r.addEventListener("change", e => {
      if (!e.target.dataset.filter) return;
      const key = e.target.dataset.filter;
      state.statusFilter[key] = e.target.value;
      renderAll();
    });
  });

  document.querySelectorAll(".currency-radio").forEach(r => {
    r.addEventListener("change", e => {
      const key = e.target.dataset.currencyFilter;
      state.currencyFilter[key] = e.target.value;
      renderAll();
    });
  });

  els.multiEntryCount.addEventListener("input", e => {
    let cnt = parseInt(e.target.value) || 1;
    if(cnt < 1) cnt = 1;
    if(cnt > 10) cnt = 10;
    renderMultiEntries(cnt);
  });

  // When a loan is selected in the payment modal, update wallet selector currency
  els.modalLoanSelect.addEventListener("change", () => {
    const selectedGroupId = els.modalLoanSelect.value;
    if (!selectedGroupId) return;
    const principalEntry = state.entries.find(e => e.group_id === selectedGroupId && e.entry_kind === "principal");
    const currency = principalEntry?.currency || null;
    populateLoanWalletSelector(currency, document.getElementById("modalPaymentWalletSelect"));
  });

  els.principalModalForm.addEventListener("submit", async e => {
    e.preventDefault();
    try { await createPrincipal(els.principalModalForm); } catch (err) { alert(err.message); }
  });

  els.paymentModalForm.addEventListener("submit", async e => {
    e.preventDefault();
    try { await createPayment(els.paymentModalForm); } catch (err) { alert(err.message); }
  });

  els.editForm.addEventListener("submit", async e => {
    e.preventDefault();
    try { await submitEdit(); } catch (err) { alert(err.message); }
  });
  els.goodsBoughtForm.addEventListener("submit", async e => {
    e.preventDefault();
    try { await saveGoodsBought(els.goodsBoughtForm); } catch (err) { alert(err.message); }
  });
  els.goodsSoldForm.addEventListener("submit", async e => {
    e.preventDefault();
    try { await saveGoodsSold(els.goodsSoldForm); } catch (err) { alert(err.message); }
  });
  els.expenseAccountForm.addEventListener("submit", async e => {
    e.preventDefault();
    try { await saveExpenseAccount(els.expenseAccountForm); } catch (err) { alert(err.message); }
  });
  els.expenseTopupForm.addEventListener("submit", async e => {
    e.preventDefault();
    try { await saveExpenseTopup(els.expenseTopupForm); } catch (err) { alert(err.message); }
  });
  els.expenseEntryForm.addEventListener("submit", async e => {
    e.preventDefault();
    try { await saveExpenseEntry(els.expenseEntryForm); } catch (err) { alert(err.message); }
  });

  els.transferForm.addEventListener("submit", async e => {
    e.preventDefault();
    try { await saveTransfer(els.transferForm); } catch (err) { alert(err.message); }
  });
  els.expenseCurrencySelect.addEventListener("change", () => {
    renderExpenseAccountSelectors();
    refreshExpenseItemIntentUi();
  });
  if (els.expenseItemNameInput){
    els.expenseItemNameInput.addEventListener("input", refreshExpenseItemIntentUi);
    els.expenseItemNameInput.addEventListener("blur", refreshExpenseItemIntentUi);
  }
  els.expenseSpendAccountSelect.addEventListener("change", refreshExpenseItemIntentUi);
  els.goodsNewItemToggleBtn.addEventListener("click", () => {
    const open = els.goodsNewItemFields.classList.toggle("hide");
    els.goodsNewItemToggleBtn.textContent = open ? "+ Add New" : "− Use Existing";
    if (!open) defaultDateInputs(els.goodsSoldForm);
  });

  els.downloadGivenPdfBtn.addEventListener("click", () => exportSectionPDF("given").catch(err => alert(err.message)));
  els.downloadReceivedPdfBtn.addEventListener("click", () => exportSectionPDF("received").catch(err => alert(err.message)));
  els.downloadTakenPdfBtn.addEventListener("click", () => exportSectionPDF("taken").catch(err => alert(err.message)));
  els.downloadReturnedPdfBtn.addEventListener("click", () => exportSectionPDF("returned").catch(err => alert(err.message)));
  els.downloadExpensesPdfBtn.addEventListener("click", () => exportSectionPDF("expenses").catch(err => alert(err.message)));
  els.downloadAllSectionsPdfBtn.addEventListener("click", () => exportAllSectionsPDF().catch(err => alert(err.message)));
  els.downloadAllDataJsonBtn.addEventListener("click", downloadJsonBackup);
  els.downloadAllDataCsvBtn.addEventListener("click", downloadCsvBackup);
  els.uploadBackupBtn.addEventListener("click", () => uploadBackupToDatabase().catch(err => alert(err.message)));
  els.importJsonInput.addEventListener("change", async e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try{
      await importJsonBackup(file);
    }catch(err){
      alert(err.message);
    }finally{
      e.target.value = "";
    }
  });
  els.importCsvInput.addEventListener("change", async e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try{
      await importCsvBackup(file);
    }catch(err){
      alert(err.message);
    }finally{
      e.target.value = "";
    }
  });
  const expDateFrom = document.getElementById("expenseDateFrom");
  const expDateTo = document.getElementById("expenseDateTo");
  const clearExpDateBtn = document.getElementById("clearExpenseDateBtn");
  if (expDateFrom) expDateFrom.addEventListener("change", e => { state.expenseDateFrom = e.target.value; renderAll(); });
  if (expDateTo) expDateTo.addEventListener("change", e => { state.expenseDateTo = e.target.value; renderAll(); });
  if (clearExpDateBtn) clearExpDateBtn.addEventListener("click", () => {
    state.expenseDateFrom = "";
    state.expenseDateTo = "";
    if (expDateFrom) expDateFrom.value = "";
    if (expDateTo) expDateTo.value = "";
    renderAll();
  });
  els.connectSupabaseBtn.addEventListener("click", () => {
    els.lockScreen.classList.remove("hide");
    focusUnlockForm();
  });

  if (els.logoutBtn){
    els.logoutBtn.addEventListener("click", () => doLogout());
  }
  if (els.refreshBtn){
    els.refreshBtn.addEventListener("click", () => {
      loadEntries();
      loadNotesFromDatabase();
    });
  }

  if (els.zipUsernameInput){
    els.zipUsernameInput.addEventListener("keydown", e => { if (e.key === "Enter") attemptUnlock(); });
  }
  els.zipPasswordInput.addEventListener("keydown", e => { if (e.key === "Enter") attemptUnlock(); });
  els.unlockBtn.addEventListener("click", attemptUnlock);
  
  // Learn More and standalone about section event listeners
  if (els.learnMoreBtn) {
    els.learnMoreBtn.addEventListener("click", showStandaloneAbout);
  }
  if (els.closeStandaloneAboutBtn) {
    els.closeStandaloneAboutBtn.addEventListener("click", hideStandaloneAbout);
  }
  if (els.backToLoginBtn) {
    els.backToLoginBtn.addEventListener("click", hideStandaloneAbout);
  }

  // Pricing section event listeners
  if (els.pricingBtn) {
    els.pricingBtn.addEventListener("click", showStandalonePricing);
  }
  if (els.closeStandalonePricingBtn) {
    els.closeStandalonePricingBtn.addEventListener("click", hideStandalonePricing);
  }
  if (els.backToLoginFromPricingBtn) {
    els.backToLoginFromPricingBtn.addEventListener("click", hideStandalonePricing);
  }

  [["searchGiven","given"],["searchReceived","received"],["searchTaken","taken"],["searchReturned","returned"],["searchInstallments","installments"],["searchGoods","goods"],["searchExpenses","expenses"]].forEach(([id,key]) => {
    document.getElementById(id).addEventListener("input", e => {
      state.search[key] = e.target.value;
      renderAll();
    });
  });
}

function focusUnlockForm(){
  els.lockError.textContent = "";
  const savedUser = sessionStorage.getItem(ZIP_USERNAME_SESSION_KEY);
  if (els.zipUsernameInput && savedUser && !els.zipUsernameInput.value.trim()){
    els.zipUsernameInput.value = savedUser;
  }
  const focusEl = els.zipUsernameInput && !els.zipUsernameInput.value.trim()
    ? els.zipUsernameInput
    : els.zipPasswordInput;
  focusEl.focus();
}

function showStandaloneAbout() {
  if (els.lockScreen) els.lockScreen.classList.add("hide");
  if (els.standaloneAboutSection) els.standaloneAboutSection.classList.remove("hide");
  // Hide tabs when showing standalone about
  const tabsSection = document.querySelector(".tabs");
  if (tabsSection) tabsSection.classList.add("hidden-tabs");
  window.location.hash = "#about";
}

function hideStandaloneAbout() {
  if (els.standaloneAboutSection) els.standaloneAboutSection.classList.add("hide");
  if (els.lockScreen) els.lockScreen.classList.remove("hide");
  // Show tabs when returning to login (but they won't work without login)
  const tabsSection = document.querySelector(".tabs");
  if (tabsSection) tabsSection.classList.remove("hidden-tabs");
  if (window.location.hash === "#about") {
    history.replaceState(null, null, window.location.pathname);
  }
  focusUnlockForm();
}

function showStandalonePricing() {
  if (els.lockScreen) els.lockScreen.classList.add("hide");
  if (els.standalonePricingSection) els.standalonePricingSection.classList.remove("hide");
  // Hide tabs when showing standalone pricing
  const tabsSection = document.querySelector(".tabs");
  if (tabsSection) tabsSection.classList.add("hidden-tabs");
  window.location.hash = "#pricing";
}

function hideStandalonePricing() {
  if (els.standalonePricingSection) els.standalonePricingSection.classList.add("hide");
  if (els.lockScreen) els.lockScreen.classList.remove("hide");
  // Show tabs when returning to login (but they won't work without login)
  const tabsSection = document.querySelector(".tabs");
  if (tabsSection) tabsSection.classList.remove("hidden-tabs");
  if (window.location.hash === "#pricing") {
    history.replaceState(null, null, window.location.pathname);
  }
  focusUnlockForm();
}

// Handle URL hash for direct About section access
function handleUrlHash() {
  if (window.location.hash === "#about") {
    showStandaloneAbout();
  } else if (window.location.hash === "#pricing") {
    showStandalonePricing();
  }
}

function doLogout(){
  runtimeConfig = null;
  fullConfigData = null;
  cachedPdfLogo = null;
  state.unlocked = false;
  sessionStorage.removeItem("loanledger-unlocked");
  sessionStorage.removeItem(ZIP_USERNAME_SESSION_KEY);
  localStorage.removeItem(ZIP_USERNAME_STORAGE_KEY);
  localStorage.removeItem(ZIP_PASSWORD_STORAGE_KEY);
  if (els.zipPasswordInput) els.zipPasswordInput.value = "";
  if (els.app) els.app.classList.add("hide");
  if (els.lockScreen) els.lockScreen.classList.remove("hide");
  // Clear Bitcoin wallet session on logout
  btcClearSession();
  focusUnlockForm();
}

async function autoLogin(){
  const storedUsername = localStorage.getItem(ZIP_USERNAME_STORAGE_KEY);
  const storedPassword = localStorage.getItem(ZIP_PASSWORD_STORAGE_KEY);
  
  if (storedUsername && storedPassword && els.zipUsernameInput && els.zipPasswordInput){
    els.zipUsernameInput.value = storedUsername;
    els.zipPasswordInput.value = storedPassword;
    await attemptUnlock();
  }
}

async function attemptUnlock(){
  els.lockError.textContent = "";
  const zipUsernameRaw = els.zipUsernameInput ? els.zipUsernameInput.value.trim() : "";
  const zipPassword = els.zipPasswordInput.value.trim();
  if (!zipUsernameRaw){
    els.lockError.textContent = "Please enter your username.";
    return;
  }
  if (!zipPassword){
    els.lockError.textContent = "Please enter the ZIP password.";
    return;
  }
  els.unlockBtn.disabled = true;
  els.unlockBtn.textContent = "Signing In…";
  const keepCurrentBackup = state.hasImportedFile && state.dataSource === "backup";
  try{
    const safeUser = sanitizeZipUsername(zipUsernameRaw);
    let zipBlob;
    try{
      zipBlob = await fetchProtectedZipBlob(safeUser);
    }catch(fetchErr){
      els.lockError.textContent = "Username is incorrect. Please check your username and try again.";
      els.lockError.classList.add("show");
      return;
    }
    const zipFile = new File([zipBlob], `${safeUser}.zip`, { type: "application/zip" });
    let configData;
    try{
      configData = await readConfigFromZip(zipFile, zipPassword);
    }catch(decryptErr){
      els.lockError.textContent = "Password is incorrect. Please check your password and try again.";
      els.lockError.classList.add("show");
      return;
    }
    if (!configData?.supabaseUrl || !configData?.supabaseKey){
      throw new Error("Config JSON must contain supabaseUrl and supabaseKey.");
    }

    runtimeConfig = {
      supabaseUrl: String(configData.supabaseUrl).trim(),
      supabaseKey: String(configData.supabaseKey).trim()
    };
    // Store full config data for PDF generation and logo usage
    fullConfigData = configData;
    
    // Invalidate PDF logo cache to ensure new logo is loaded
    cachedPdfLogo = null;
    
    // Update logo images in HTML if JSON logo is available
    updateLogosFromConfig();
    
    // Update header text with Company and TRN from JSON if available
    updateHeaderTextFromConfig();
    
    // Update currency filters based on configuration
    updateCurrencyFiltersFromConfig();
    
    // Update lastCurrency to first allowed currency
    const allowedCurrencies = getAllowedCurrencies();
    if (allowedCurrencies.length > 0 && !allowedCurrencies.includes(state.lastCurrency)) {
      state.lastCurrency = allowedCurrencies[0];
    }
    
    sessionStorage.setItem("loanledger-unlocked", "true");
    sessionStorage.setItem(ZIP_USERNAME_SESSION_KEY, safeUser);
    localStorage.setItem(ZIP_USERNAME_STORAGE_KEY, safeUser);
    localStorage.setItem(ZIP_PASSWORD_STORAGE_KEY, zipPassword);
    state.unlocked = true;
    
    // Show welcome screen with name from JSON config
    const displayName = configData.Name && configData.Name.trim() ? configData.Name.trim() : "User";
    els.welcomeName.textContent = displayName;
    els.lockScreen.classList.add("hide");
    els.welcomeScreen.classList.remove("hide");

    // Start welcome screen animation and transition to main app
    setTimeout(() => {
      showWelcomeAndTransitionToApp(keepCurrentBackup);
    }, 1200); // Show welcome for 1.2 seconds
  }catch(err){
    els.lockError.textContent = err.message;
  }finally{
    els.unlockBtn.disabled = false;
    els.unlockBtn.textContent = "Sign In";
  }
}

async function showWelcomeAndTransitionToApp(keepCurrentBackup) {
  // Add exit animation to welcome screen
  els.welcomeScreen.classList.add("exit-animation");
  
  // Prepare app for entrance
  els.app.classList.remove("hide");
  els.app.classList.add("app-enter-animation");
  
  // Wait for animations to complete
  setTimeout(async () => {
    // Hide welcome screen completely
    els.welcomeScreen.classList.add("hide");
    els.welcomeScreen.classList.remove("exit-animation");
    
    // Remove app animation class
    els.app.classList.remove("app-enter-animation");
    
    // Initialize the app
    defaultDateInputs(document);
    
    // Initialize recycle bin (will be loaded from database in loadEntriesFromSupabase)
    if (state.dataSource === "backup") {
      loadRecycleBinFromStorage();
      renderRecycleBinDropdown();
    }
    
    if (keepCurrentBackup){
      await refreshDbSnapshot();
      updateUploadButtonVisibility();
      updateConnectButtonVisibility();
      renderAll();
    } else {
      await loadEntriesFromSupabase();
    }
  }, 1200); // Match the animation duration
}

function populateLoanWalletSelector(currency, selectEl) {
  if (!selectEl) return;
  const accounts = getExpenseAccounts({ applyUiFilters: false });
  const matchingAccounts = currency
    ? accounts.filter(a => a.currency === currency)
    : accounts;

  selectEl.innerHTML = `<option value="">Skip wallet entry</option>` +
    matchingAccounts.map(a => {
      const balDisplay = formatReportAmount(a.balance, a.currency);
      return `<option value="${escapeHtml(a.group_id)}">${escapeHtml(a.person_name)} (${escapeHtml(a.accountType)}) — ${escapeHtml(balDisplay)}</option>`;
    }).join("");
}

async function createWalletEntryForLoanPrincipal(walletGroupId, amount, date, personName, direction, currency) {
  const account = getExpenseAccounts({ applyUiFilters: false }).find(a => a.group_id === walletGroupId);
  if (!account) return;
  if (account.currency !== currency) {
    console.warn("Wallet currency mismatch, skipping wallet entry.");
    return;
  }
  // Loan Given  → money GOES OUT of wallet → EXPENSE
  // Loan Taken  → money COMES INTO wallet  → TOPUP
  const isExpense = direction === "given";
  const noteText = isExpense
    ? `Loan Given to ${personName}`
    : `Loan Received from ${personName}`;

  const payload = {
    group_id: walletGroupId,
    direction: "taken",
    entry_kind: "partial",
    person_name: account.person_name,
    currency: account.currency,
    principal_amount: null,
    action_amount: amount,
    loan_date: account.principal?.loan_date || date,
    action_date: date,
    notes: upsertExpenseMetaInNote(noteText, {
      accountType: account.accountType,
      rowType: isExpense ? "EXPENSE" : "TOPUP",
      itemName: personName,
      expenseType: isExpense ? "Loan Given" : "Loan Received"
    })
  };

  if (isBackupMode()) {
    state.entries.unshift({ ...payload, id: crypto.randomUUID(), created_at: new Date().toISOString() });
  } else {
    await supabase(CONFIG.table, { method: "POST", body: JSON.stringify(payload) });
  }
}

async function createWalletEntryForPayment(walletGroupId, amount, date, personName, direction, currency) {
  const account = getExpenseAccounts({ applyUiFilters: false }).find(a => a.group_id === walletGroupId);
  if (!account) return;
  if (account.currency !== currency) {
    console.warn("Wallet currency mismatch, skipping wallet entry.");
    return;
  }
  // Received Back (given)  → money COMES BACK   → TOPUP
  // Returned Back (taken)  → money GOES OUT      → EXPENSE
  const isTopup = direction === "given";
  const noteText = isTopup
    ? `Received Back from ${personName}`
    : `Returned Back to ${personName}`;

  const payload = {
    group_id: walletGroupId,
    direction: "taken",
    entry_kind: "partial",
    person_name: account.person_name,
    currency: account.currency,
    principal_amount: null,
    action_amount: amount,
    loan_date: account.principal?.loan_date || date,
    action_date: date,
    notes: upsertExpenseMetaInNote(noteText, {
      accountType: account.accountType,
      rowType: isTopup ? "TOPUP" : "EXPENSE",
      itemName: personName,
      expenseType: isTopup ? "Received Back" : "Returned Back"
    })
  };

  if (isBackupMode()) {
    state.entries.unshift({ ...payload, id: crypto.randomUUID(), created_at: new Date().toISOString() });
  } else {
    await supabase(CONFIG.table, { method: "POST", body: JSON.stringify(payload) });
  }
}

// Bitcoin Wallet Functions
const BTC_NETWORKS = {
  mainnet: {
    label: 'Mainnet',
    network: bitcoinjs.networks.bitcoin,
    api: 'https://blockstream.info/api',
    wifHint: 'Mainnet WIF usually starts with 5, K, or L.'
  },
  testnet: {
    label: 'Testnet',
    network: bitcoinjs.networks.testnet,
    api: 'https://blockstream.info/testnet/api',
    wifHint: 'Testnet WIF usually starts with 9 or c.'
  },
  signet: {
    label: 'Signet',
    network: bitcoinjs.networks.testnet,
    api: 'https://blockstream.info/signet/api',
    wifHint: 'Signet uses the testnet-style key format.'
  }
};

const DUST_P2PKH = 546;
const MAX_BTC_HISTORY = 100;

function btcSatToBtc(sats) {
  return Number(sats || 0) / 1e8;
}

function btcFormatBtcFromSat(sats) {
  const btcFmt = new Intl.NumberFormat(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 });
  return `${btcFmt.format(btcSatToBtc(sats))} BTC`;
}

function btcBtcToSat(value) {
  const n = Number(String(value).trim());
  if (!Number.isFinite(n)) throw new Error('Invalid BTC amount.');
  const sats = Math.round(n * 1e8);
  if (!Number.isSafeInteger(sats) || sats < 0) throw new Error('Invalid BTC amount.');
  return sats;
}

function btcMaskWif(wif) {
  const s = String(wif || '').trim();
  if (!s) return '—';
  if (s.length <= 12) return `${s.slice(0, 4)}…${s.slice(-3)}`;
  return `${s.slice(0, 6)}…${s.slice(-6)}`;
}

function btcFormatDate(timestamp) {
  if (!timestamp) return 'mempool';
  const date = new Date(timestamp * 1000);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

function btcShortHash(v) {
  const s = String(v || '');
  if (!s) return '—';
  return `${s.slice(0, 12)}…${s.slice(-10)}`;
}

function btcSetWalletStatus(msg, kind) {
  const el = els.btcWalletStatus;
  el.className = `empty ${kind || ''}`.trim();
  el.textContent = msg;
}

function btcSetSendStatus(msg, kind) {
  const el = els.btcSendStatus;
  el.className = `empty ${kind || ''}`.trim();
  el.textContent = msg;
}

function btcGetNetworkInfo(key) {
  return BTC_NETWORKS[key] || BTC_NETWORKS.mainnet;
}

function btcClearQR() {
  els.btcQrBox.innerHTML = '';
  state.bitcoin.qrInstance = null;
}

function btcRenderQR(text) {
  btcClearQR();
  const safe = String(text || '').trim();
  if (!safe) return;
  state.bitcoin.qrInstance = new QRCode(els.btcQrBox, {
    text: safe,
    width: 196,
    height: 196,
    colorDark: '#111111',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M
  });
}

async function btcCopyText(text) {
  const value = String(text || '');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(value);
  }
  return new Promise((resolve, reject) => {
    try {
      const tmp = document.createElement('textarea');
      tmp.value = value;
      tmp.setAttribute('readonly', 'readonly');
      tmp.style.position = 'fixed';
      tmp.style.left = '-9999px';
      document.body.appendChild(tmp);
      tmp.select();
      document.execCommand('copy');
      document.body.removeChild(tmp);
      resolve();
    } catch (err) {
      reject(err);
    }
  });
}

function btcSummarizeUtxoBalance() {
  return state.bitcoin.utxos.reduce((sum, u) => sum + Number(u.value || 0), 0);
}

async function btcFetchJson(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  return fetch(url, {
    ...(options || {}),
    signal: controller.signal
  }).then(async (res) => {
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || `Request failed (${res.status})`);
    }
    return res.json();
  }).finally(() => clearTimeout(timeout));
}

async function btcFetchText(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  return fetch(url, {
    ...(options || {}),
    signal: controller.signal
  }).then(async (res) => {
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || `Request failed (${res.status})`);
    }
    return res.text();
  }).finally(() => clearTimeout(timeout));
}

// BTC Price fetching functions
async function btcFetchPrice() {
  try {
    // Using CoinGecko free API - no API key required
    const response = await btcFetchJson('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true');
    const price = response.bitcoin?.usd;
    const change = response.bitcoin?.usd_24h_change;
    
    if (price && typeof price === 'number') {
      state.bitcoin.btcPrice = price;
      state.bitcoin.lastPriceUpdate = Date.now();
      return { price, change };
    }
    throw new Error('Invalid price data received');
  } catch (error) {
    console.warn('Failed to fetch BTC price:', error);
    return null;
  }
}

function btcUpdatePriceDisplay() {
  const price = state.bitcoin.btcPrice;
  const change = state.bitcoin.priceChange;
  
  if (!price) {
    els.btcPriceDisplay.textContent = 'BTC: $—';
    return;
  }
  
  const changeSymbol = change >= 0 ? '+' : '';
  const changeText = change ? ` (${changeSymbol}${change.toFixed(2)}%)` : '';
  els.btcPriceDisplay.textContent = `BTC: $${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${changeText}`;
}

function btcBtcToUsd(btcAmount) {
  const price = state.bitcoin.btcPrice;
  if (!price || !btcAmount) return 0;
  return Number(btcAmount) * price;
}

function btcUpdateUsdValues() {
  const balance = btcSatToBtc(btcSummarizeUtxoBalance());
  
  // Calculate received and sent from chain stats if available, otherwise use history
  let receivedSat = 0;
  let sentSat = 0;
  
  // Try to get values from the last wallet data fetch
  if (state.bitcoin.lastChainStats) {
    receivedSat = Number(state.bitcoin.lastChainStats.funded_txo_sum || 0);
    sentSat = Number(state.bitcoin.lastChainStats.spent_txo_sum || 0);
  } else {
    // Fallback to history calculation
    receivedSat = state.bitcoin.history.reduce((sum, tx) => {
      const direction = btcTxDirection(tx);
      return sum + (direction.label === 'Received' ? direction.receivedSat : 0);
    }, 0);
    sentSat = state.bitcoin.history.reduce((sum, tx) => {
      const direction = btcTxDirection(tx);
      return sum + (direction.label === 'Sent' ? direction.sentSat : 0);
    }, 0);
  }
  
  const received = btcSatToBtc(receivedSat);
  const sent = btcSatToBtc(sentSat);
  
  // Update Bitcoin tab displays
  if (state.bitcoin.btcPrice) {
    els.btcBalanceUsd.textContent = `≈ $${btcBtcToUsd(balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    els.btcReceivedUsd.textContent = `≈ $${btcBtcToUsd(received).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    els.btcSentUsd.textContent = `≈ $${btcBtcToUsd(sent).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } else {
    els.btcBalanceUsd.textContent = '≈ $—';
    els.btcReceivedUsd.textContent = '≈ $—';
    els.btcSentUsd.textContent = '≈ $—';
  }
  
  // Also update expense wallets to show BTC USD equivalents
  const accounts = getExpenseAccounts({ applyUiFilters: false });
  renderExpenseWalletBar(accounts);
  
  // Additional update for BTC USD values in expense section
  setTimeout(() => {
    if (document.getElementById('expensePanel').classList.contains('active')) {
      const btcAccounts = accounts.filter(a => a.currency === 'BTC');
      if (btcAccounts.length > 0) {
        renderExpenseWalletBar(accounts);
      }
    }
  }, 200);
}

// Automatic price updates
let btcPriceUpdateInterval = null;

function btcStartPriceUpdates() {
  // Clear existing interval
  if (btcPriceUpdateInterval) {
    clearInterval(btcPriceUpdateInterval);
  }
  
  // Update immediately if we have a wallet
  if (state.bitcoin.wallet) {
    btcFetchPrice().then(priceData => {
      if (priceData) {
        state.bitcoin.priceChange = priceData.change;
        btcUpdatePriceDisplay();
        btcUpdateUsdValues();
      }
    });
  }
  
  // Set up automatic updates every 5 minutes
  btcPriceUpdateInterval = setInterval(async () => {
    if (state.bitcoin.wallet) {
      const priceData = await btcFetchPrice();
      if (priceData) {
        state.bitcoin.priceChange = priceData.change;
        btcUpdatePriceDisplay();
        btcUpdateUsdValues();
      }
    }
  }, 5 * 60 * 1000); // 5 minutes
}

function btcStopPriceUpdates() {
  if (btcPriceUpdateInterval) {
    clearInterval(btcPriceUpdateInterval);
    btcPriceUpdateInterval = null;
  }
}

// Watch wallet functions
function btcToggleWalletType(type) {
  if (type === 'full') {
    els.btcFullWalletSection.classList.remove('hide');
    els.btcWatchWalletSection.classList.add('hide');
    els.btcFullWalletBtn.classList.add('primary');
    els.btcFullWalletBtn.classList.remove('ghost');
    els.btcWatchWalletBtn.classList.add('ghost');
    els.btcWatchWalletBtn.classList.remove('primary');
  } else {
    els.btcFullWalletSection.classList.add('hide');
    els.btcWatchWalletSection.classList.remove('hide');
    els.btcFullWalletBtn.classList.add('ghost');
    els.btcFullWalletBtn.classList.remove('primary');
    els.btcWatchWalletBtn.classList.add('primary');
    els.btcWatchWalletBtn.classList.remove('ghost');
  }
}

async function btcWatchAddress(skipSave = false) {
  try {
    const address = els.btcAddressInput.value.trim();
    if (!address) {
      btcSetWalletStatus('Please enter a Bitcoin address.', '');
      return;
    }
    
    // Basic address validation
    if (!/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$|^bc1[ac-hj-np-z02-9]{8,87}$/.test(address)) {
      btcSetWalletStatus('Invalid Bitcoin address format.', '');
      return;
    }
    
    state.bitcoin.isWatchOnly = true;
    state.bitcoin.watchAddress = address;
    state.bitcoin.wallet = {
      address: address,
      key: state.bitcoin.selectedNetworkKey,
      label: btcGetNetworkInfo(state.bitcoin.selectedNetworkKey).label,
      isWatchOnly: true
    };
    
    // Prompt to save watch-only address to database (only if not loading from existing addresses)
    if (!skipSave) {
      await promptToSaveWallet(address, `Watch-Only ${address.slice(0, 10)}...`, state.bitcoin.selectedNetworkKey, true);
    }
    
    btcUpdateWalletView();
    btcSetWalletStatus(`Watch-only wallet loaded for address: ${btcShortHash(address)}`, '');
    
    // Update UI visibility
    updateSaveButtonVisibility();
    updateSavedAddressesVisibility();
    
    // Fetch wallet data
    await btcFetchWalletData(true);
    
  } catch (error) {
    btcSetWalletStatus(`Error watching address: ${error.message}`, '');
  }
}

function btcUpdateWalletView() {
  if (!state.bitcoin.wallet) {
    btcClearView();
    return;
  }
  
  const wallet = state.bitcoin.wallet;
  els.btcLoginSection.classList.add('hide');
  els.btcWalletInfoSection.classList.remove('hide');
  els.btcHistorySection.classList.remove('hide');
  
  if (wallet.isWatchOnly) {
    els.btcMaskedWif.textContent = 'Watch-only wallet (no private key)';
    els.btcCopyWifBtn.style.display = 'none';
    els.btcDownloadWalletPdfBtn.style.display = 'none';
    btcSetWalletStatus(`Watch-only wallet loaded for ${wallet.label}. Balance and transactions only.`, '');
  } else {
    els.btcMaskedWif.textContent = btcMaskWif(wallet.wif);
    els.btcCopyWifBtn.style.display = 'inline-flex';
    els.btcDownloadWalletPdfBtn.style.display = 'inline-flex';
    btcSetWalletStatus(`Wallet loaded for ${wallet.label}. The uncompressed legacy address is ready.`, '');
  }
  
  els.btcWalletAddress.textContent = wallet.address;
  
  // Update USD values if price is available
  if (state.bitcoin.btcPrice) {
    btcUpdatePriceDisplay();
    btcUpdateUsdValues();
  }
  
  // Start automatic price updates
  btcStartPriceUpdates();
}

function btcCurrentApi() {
  return btcGetNetworkInfo(state.bitcoin.wallet ? state.bitcoin.wallet.key : state.bitcoin.selectedNetworkKey).api;
}

function btcClearView() {
  state.bitcoin.wallet = null;
  state.bitcoin.utxos = [];
  state.bitcoin.history = [];
  state.bitcoin.historyCursor = null;
  state.bitcoin.historyDone = false;
  state.bitcoin.historyTotal = 0;
  state.bitcoin.lastChainStats = null; // Clear stored chain stats
  els.btcMaskedWif.textContent = 'WIF masked after login';
  els.btcBalanceValue.textContent = '—';
  els.btcReceivedValue.textContent = '—';
  els.btcSentValue.textContent = '—';
  els.btcTxCountValue.textContent = '—';
  els.btcHistoryList.innerHTML = '';
  btcClearQR();
  els.btcCopyWifBtn.disabled = true;
  els.btcDownloadWalletPdfBtn.style.display = 'none';
  els.btcLoginSection.classList.remove('hide');
  els.btcWalletInfoSection.classList.add('hide');
  els.btcHistorySection.classList.add('hide');
  
  // Clear USD displays
  els.btcBalanceUsd.textContent = '≈ $—';
  els.btcReceivedUsd.textContent = '≈ $—';
  els.btcSentUsd.textContent = '≈ $—';
  els.btcPriceDisplay.textContent = 'BTC: $—';
  
  // Stop automatic price updates
  btcStopPriceUpdates();
}

function btcUpdateWalletView() {
  if (!state.bitcoin.wallet) {
    btcClearView();
    return;
  }

  const wallet = state.bitcoin.wallet;
  els.btcMaskedWif.textContent = btcMaskWif(wallet.inputWif);
  els.btcWalletAddress.textContent = wallet.address;
  els.btcCopyWifBtn.disabled = false;
  els.btcDownloadWalletPdfBtn.style.display = 'inline-block';
  els.btcLoginSection.classList.add('hide');
  els.btcWalletInfoSection.classList.remove('hide');
  els.btcHistorySection.classList.remove('hide');
  btcSetWalletStatus(`Wallet loaded for ${wallet.label}. The uncompressed legacy address is ready.`, '');
}

function btcDetectAndLoadWallet(wif, preferredKey) {
  const normalized = String(wif || '').trim();
  if (!normalized) throw new Error('Paste a WIF first.');

  const keys = [preferredKey, 'mainnet', 'testnet', 'signet'].filter((v, i, a) => a.indexOf(v) === i);
  for (const key of keys) {
    const net = btcGetNetworkInfo(key).network;
    try {
      console.log(`Trying WIF on ${key} network...`);
      const importedPair = bitcoinjs.ECPair.fromWIF(normalized, net);
      if (!importedPair.privateKey) throw new Error('Missing private key.');
      const uncompressedPair = bitcoinjs.ECPair.fromPrivateKey(importedPair.privateKey, {
        network: net,
        compressed: false
      });
      const address = bitcoinjs.payments.p2pkh({
        pubkey: uncompressedPair.publicKey,
        network: net
      }).address;
      if (!address) throw new Error('Could not derive address.');
      
      console.log(`Successfully imported WIF on ${key} network, address:`, address);
      return {
        key,
        network: net,
        label: btcGetNetworkInfo(key).label,
        inputWif: normalized,
        sourcePair: importedPair,
        uncompressedPair,
        address
      };
    } catch (err) {
      console.log(`Failed to import WIF on ${key} network:`, err.message);
      // keep trying
    }
  }
  throw new Error('Invalid WIF format. Please check your WIF and try again.');
}

function btcEstimateLegacyP2PKHSize(inputCount, outputCount) {
  return 10 + (inputCount * 148) + (outputCount * 34);
}

function btcHexToBytes(hex) {
  const clean = String(hex || '').trim();
  if (!clean || clean.length % 2 !== 0 || /[^0-9a-f]/i.test(clean)) {
    throw new Error('Invalid hex data.');
  }
  // Create proper Buffer using Bitcoin.js library's Buffer implementation
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  // Use Bitcoin.js Buffer constructor which works in browser
  return new bitcoinjs.Buffer(bytes);
}

function btcBuildSpendPlan(sumIn, inputCount, amountSat, feeRateSatVb) {
  const feeTwoOut = Math.ceil(btcEstimateLegacyP2PKHSize(inputCount, 2) * feeRateSatVb);
  const changeTwo = sumIn - amountSat - feeTwoOut;
  if (changeTwo >= DUST_P2PKH) return { outputs: 2, feeSat: feeTwoOut, changeSat: changeTwo };

  const feeOneOut = Math.ceil(btcEstimateLegacyP2PKHSize(inputCount, 1) * feeRateSatVb);
  const changeOne = sumIn - amountSat - feeOneOut;
  if (changeOne >= 0) return { outputs: 1, feeSat: feeOneOut, changeSat: 0 };

  return null;
}

function btcTxDirection(tx) {
  const wallet = state.bitcoin.wallet;
  let received = 0;
  let sent = 0;

  for (const out of (tx.vout || [])) {
    if (out && out.scriptpubkey_address === wallet.address) {
      received += Number(out.value || 0);
    }
  }

  for (const input of (tx.vin || [])) {
    const prev = input && input.prevout;
    if (prev && prev.scriptpubkey_address === wallet.address) {
      sent += Number(prev.value || 0);
    }
  }

  const net = received - sent;
  let label = 'self';
  let cls = 'self';
  if (net > 0) { label = 'received'; cls = 'in'; }
  else if (net < 0) { label = 'sent'; cls = 'out'; }

  return { label, cls, netSat: net, receivedSat: received, sentSat: sent };
}

function btcRenderHistory() {
  const wallet = state.bitcoin.wallet;
  els.btcHistoryList.innerHTML = '';

  if (!wallet) return;

  if (!state.bitcoin.history.length) {
    els.btcHistoryList.innerHTML = '<div class="empty">No transactions yet</div>';
    return;
  }

  // Show only last 20 transactions initially
  const transactionsToShow = state.bitcoin.history.slice(0, 20);

  for (const tx of transactionsToShow) {
    const dir = btcTxDirection(tx);
    const ts = tx.status && tx.status.confirmed
      ? btcFormatDate(tx.status.block_time || 0)
      : 'mempool';
    const conf = tx.status && tx.status.confirmed
      ? (tx.status.block_height ? `confirmed @ ${tx.status.block_height}` : 'confirmed')
      : 'unconfirmed';
    const amount = dir.netSat === 0
      ? '0 BTC'
      : `${dir.netSat > 0 ? '+' : '-'}${btcFormatBtcFromSat(Math.abs(dir.netSat))}`;
    const badgeText = dir.label === 'received' ? 'Received' : dir.label === 'sent' ? 'Sent' : 'Self / change';

    // Get addresses for display
    const addresses = btcGetTransactionAddresses(tx, wallet.address);
    
    const row = document.createElement('div');
    row.className = 'loan';
    row.innerHTML = `
      <div class="loan-top btc-transaction-row" data-tx-id="${escapeHtml(tx.txid)}">
        <div class="lt-main">
          <div class="loan-name">${escapeHtml(badgeText)}</div>
          <div class="loan-sub">${ts}</div>
        </div>
        <div class="cell">
          <small>Net change</small>
          <strong>${escapeHtml(amount)}</strong>
        </div>
        <div class="cell">
          <small>Status</small>
          <strong>${escapeHtml(conf)}</strong>
        </div>
        <div class="cell">
          <small>Txid</small>
          <strong class="mono">${escapeHtml(btcShortHash(tx.txid))}</strong>
        </div>
        <div class="cell">
          <button class="btn ghost btc-download-tx-btn" data-tx-id="${escapeHtml(tx.txid)}" title="Download Transaction PDF" style="padding: 4px 8px; font-size: 0.8rem;">
            <i class="fa-solid fa-download"></i>
          </button>
        </div>
        <div class="cell">
          <button class="btn ghost btc-view-on-chain-btn" data-tx-id="${escapeHtml(tx.txid)}" title="View on Chain" style="padding: 4px 8px; font-size: 0.8rem;">
            View on chain
          </button>
        </div>
      </div>
      <div class="btc-transaction-details" style="display: none;">
        <div class="loan-details" style="padding: 12px; background: var(--panel-2); border-top: 1px solid var(--line);">
          <div style="margin-bottom: 8px;"><strong>Transaction Hash:</strong></div>
          <div class="mono" style="word-break: break-all; margin-bottom: 12px; font-size: 0.85rem; color: var(--muted);">${escapeHtml(tx.txid)}</div>
          
          ${addresses.from.length > 0 ? `
          <div style="margin-bottom: 8px;"><strong>From Addresses:</strong></div>
          <div style="margin-bottom: 12px;">
            ${addresses.from.map(addr => `<div class="mono" style="word-break: break-all; font-size: 0.85rem; margin-bottom: 4px; color: var(--muted);">${escapeHtml(addr)}</div>`).join('')}
          </div>
          ` : ''}
          
          ${addresses.to.length > 0 ? `
          <div style="margin-bottom: 8px;"><strong>To Addresses:</strong></div>
          <div style="margin-bottom: 12px;">
            ${addresses.to.map(addr => `<div class="mono" style="word-break: break-all; font-size: 0.85rem; margin-bottom: 4px; color: var(--muted);">${escapeHtml(addr)}</div>`).join('')}
          </div>
          ` : ''}
          
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-top: 12px;">
            <div>
              <small style="color: var(--muted);">Size:</small>
              <div><strong>${tx.size || 0} bytes</strong></div>
            </div>
            <div>
              <small style="color: var(--muted);">Weight:</small>
              <div><strong>${tx.weight || 0} WU</strong></div>
            </div>
            <div>
              <small style="color: var(--muted);">Fee:</small>
              <div><strong>${tx.fee ? btcFormatBtcFromSat(tx.fee) : 'N/A'}</strong></div>
            </div>
            ${tx.status && tx.status.block_height ? `
            <div>
              <small style="color: var(--muted);">Block Height:</small>
              <div><strong>${tx.status.block_height}</strong></div>
            </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
    
    // Add click event to toggle details
    const topRow = row.querySelector('.btc-transaction-row');
    const details = row.querySelector('.btc-transaction-details');
    
    topRow.style.cursor = 'pointer';
    topRow.addEventListener('click', () => {
      if (details.style.display === 'none') {
        details.style.display = 'block';
        topRow.style.background = 'var(--panel-2)';
      } else {
        details.style.display = 'none';
        topRow.style.background = '';
      }
    });
    
    // Add event listener for download button
    const downloadBtn = row.querySelector('.btc-download-tx-btn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        btcDownloadTransactionPDF(tx);
      });
    }
    
    // Add event listener for view on chain button
    const viewOnChainBtn = row.querySelector('.btc-view-on-chain-btn');
    if (viewOnChainBtn) {
      viewOnChainBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.open(`https://blockchair.com/bitcoin/transaction/${tx.txid}`, '_blank');
      });
    }
    
    els.btcHistoryList.appendChild(row);
  }
  
  // Update load more button after rendering
  btcUpdateLoadMoreButton();
}

function btcGetTransactionAddresses(tx, walletAddress) {
  const from = [];
  const to = [];
  
  // Get input addresses (from)
  for (const input of (tx.vin || [])) {
    const prev = input && input.prevout;
    if (prev && prev.scriptpubkey_address) {
      from.push(prev.scriptpubkey_address);
    }
  }
  
  // Get output addresses (to)
  for (const output of (tx.vout || [])) {
    if (output && output.scriptpubkey_address) {
      to.push(output.scriptpubkey_address);
    }
  }
  
  // Remove duplicates and wallet address from appropriate lists
  return {
    from: [...new Set(from)].filter(addr => addr !== walletAddress),
    to: [...new Set(to)].filter(addr => addr !== walletAddress)
  };
}

async function btcLoadMoreTransactions() {
  if (!state.bitcoin.wallet || state.bitcoin.historyDone) return;
  
  const wallet = state.bitcoin.wallet;
  const url = state.bitcoin.historyCursor 
    ? `${btcCurrentApi()}/address/${wallet.address}/txs/chain/${state.bitcoin.historyCursor}`
    : `${btcCurrentApi()}/address/${wallet.address}/txs`;
    
  try {
    const txs = await btcFetchJson(url);
    
    if (Array.isArray(txs) && txs.length > 0) {
      state.bitcoin.history = [...state.bitcoin.history, ...txs];
      
      const confirmed = state.bitcoin.history.filter((tx) => tx.status && tx.status.confirmed);
      state.bitcoin.historyCursor = confirmed.length >= 25 ? confirmed[confirmed.length - 1].txid : null;
      state.bitcoin.historyDone = txs.length < 25;
      
      btcRenderHistory();
      btcUpdateLoadMoreButton();
    }
  } catch (error) {
    console.error('Error loading more transactions:', error);
    btcSetWalletStatus('Error loading more transactions.', 'error');
  }
}

function btcUpdateLoadMoreButton() {
  const existingBtn = document.getElementById('btcLoadMoreBtn');
  if (existingBtn) {
    existingBtn.remove();
  }
  
  // Calculate how many more transactions can be loaded
  const loadedCount = Math.min(state.bitcoin.history.length, 20); // Currently displayed
  const remainingInHistory = state.bitcoin.history.length - loadedCount; // Available but not displayed
  const totalRemaining = state.bitcoin.historyTotal - loadedCount; // Total remaining including API
  
  if (!state.bitcoin.historyDone && state.bitcoin.history.length > loadedCount) {
    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.id = 'btcLoadMoreBtn';
    loadMoreBtn.className = 'btn ghost';
    loadMoreBtn.textContent = `Load More (Show ${Math.min(20, remainingInHistory)} more of ${totalRemaining} remaining)`;
    loadMoreBtn.style.marginTop = '12px';
    loadMoreBtn.style.width = '100%';
    
    loadMoreBtn.addEventListener('click', () => {
      loadMoreBtn.textContent = 'Loading...';
      loadMoreBtn.disabled = true;
      
      // Show next 20 transactions from already loaded data
      btcRenderMoreTransactions(loadedCount, 20).finally(() => {
        loadMoreBtn.disabled = false;
      });
    });
    
    els.btcHistoryList.appendChild(loadMoreBtn);
  } else if (!state.bitcoin.historyDone && state.bitcoin.history.length <= loadedCount) {
    // Need to load more from API
    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.id = 'btcLoadMoreBtn';
    loadMoreBtn.className = 'btn ghost';
    loadMoreBtn.textContent = `Load More (${totalRemaining} remaining)`;
    loadMoreBtn.style.marginTop = '12px';
    loadMoreBtn.style.width = '100%';
    
    loadMoreBtn.addEventListener('click', () => {
      loadMoreBtn.textContent = 'Loading...';
      loadMoreBtn.disabled = true;
      btcLoadMoreTransactions().finally(() => {
        loadMoreBtn.disabled = false;
      });
    });
    
    els.btcHistoryList.appendChild(loadMoreBtn);
  }
}

async function btcRenderMoreTransactions(startIndex, count) {
  const wallet = state.bitcoin.wallet;
  if (!wallet) return;

  const transactionsToRender = state.bitcoin.history.slice(startIndex, startIndex + count);
  const loadMoreBtn = document.getElementById('btcLoadMoreBtn');
  
  // Remove the load more button temporarily
  if (loadMoreBtn) {
    loadMoreBtn.remove();
  }

  for (const tx of transactionsToRender) {
    const dir = btcTxDirection(tx);
    const ts = tx.status && tx.status.confirmed
      ? btcFormatDate(tx.status.block_time || 0)
      : 'mempool';
    const conf = tx.status && tx.status.confirmed
      ? (tx.status.block_height ? `confirmed @ ${tx.status.block_height}` : 'confirmed')
      : 'unconfirmed';
    const amount = dir.netSat === 0
      ? '0 BTC'
      : `${dir.netSat > 0 ? '+' : '-'}${btcFormatBtcFromSat(Math.abs(dir.netSat))}`;
    const badgeText = dir.label === 'received' ? 'Received' : dir.label === 'sent' ? 'Sent' : 'Self / change';

    // Get addresses for display
    const addresses = btcGetTransactionAddresses(tx, wallet.address);
    
    const row = document.createElement('div');
    row.className = 'loan';
    row.innerHTML = `
      <div class="loan-top btc-transaction-row" data-tx-id="${escapeHtml(tx.txid)}">
        <div class="lt-main">
          <div class="loan-name">${escapeHtml(badgeText)}</div>
          <div class="loan-sub">${ts}</div>
        </div>
        <div class="cell">
          <small>Net change</small>
          <strong>${escapeHtml(amount)}</strong>
        </div>
        <div class="cell">
          <small>Status</small>
          <strong>${escapeHtml(conf)}</strong>
        </div>
        <div class="cell">
          <small>Txid</small>
          <strong class="mono">${escapeHtml(btcShortHash(tx.txid))}</strong>
        </div>
        <div class="cell">
          <button class="btn ghost btc-download-tx-btn" data-tx-id="${escapeHtml(tx.txid)}" title="Download Transaction PDF" style="padding: 4px 8px; font-size: 0.8rem;">
            <i class="fa-solid fa-download"></i>
          </button>
        </div>
        <div class="cell">
          <button class="btn ghost btc-view-on-chain-btn" data-tx-id="${escapeHtml(tx.txid)}" title="View on Chain" style="padding: 4px 8px; font-size: 0.8rem;">
            View on chain
          </button>
        </div>
      </div>
      <div class="btc-transaction-details" style="display: none;">
        <div class="loan-details" style="padding: 12px; background: var(--panel-2); border-top: 1px solid var(--line);">
          <div style="margin-bottom: 8px;"><strong>Transaction Hash:</strong></div>
          <div class="mono" style="word-break: break-all; margin-bottom: 12px; font-size: 0.85rem; color: var(--muted);">${escapeHtml(tx.txid)}</div>
          
          ${addresses.from.length > 0 ? `
          <div style="margin-bottom: 8px;"><strong>From Addresses:</strong></div>
          <div style="margin-bottom: 12px;">
            ${addresses.from.map(addr => `<div class="mono" style="word-break: break-all; font-size: 0.85rem; margin-bottom: 4px; color: var(--muted);">${escapeHtml(addr)}</div>`).join('')}
          </div>
          ` : ''}
          
          ${addresses.to.length > 0 ? `
          <div style="margin-bottom: 8px;"><strong>To Addresses:</strong></div>
          <div style="margin-bottom: 12px;">
            ${addresses.to.map(addr => `<div class="mono" style="word-break: break-all; font-size: 0.85rem; margin-bottom: 4px; color: var(--muted);">${escapeHtml(addr)}</div>`).join('')}
          </div>
          ` : ''}
          
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-top: 12px;">
            <div>
              <small style="color: var(--muted);">Size:</small>
              <div><strong>${tx.size || 0} bytes</strong></div>
            </div>
            <div>
              <small style="color: var(--muted);">Weight:</small>
              <div><strong>${tx.weight || 0} WU</strong></div>
            </div>
            <div>
              <small style="color: var(--muted);">Fee:</small>
              <div><strong>${tx.fee ? btcFormatBtcFromSat(tx.fee) : 'N/A'}</strong></div>
            </div>
            ${tx.status && tx.status.block_height ? `
            <div>
              <small style="color: var(--muted);">Block Height:</small>
              <div><strong>${tx.status.block_height}</strong></div>
            </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
    
    // Add click event to toggle details
    const topRow = row.querySelector('.btc-transaction-row');
    const details = row.querySelector('.btc-transaction-details');
    
    topRow.style.cursor = 'pointer';
    topRow.addEventListener('click', () => {
      if (details.style.display === 'none') {
        details.style.display = 'block';
        topRow.style.background = 'var(--panel-2)';
      } else {
        details.style.display = 'none';
        topRow.style.background = '';
      }
    });
    
    // Add event listener for download button
    const downloadBtn = row.querySelector('.btc-download-tx-btn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        btcDownloadTransactionPDF(tx);
      });
    }
    
    // Add event listener for view on chain button
    const viewOnChainBtn = row.querySelector('.btc-view-on-chain-btn');
    if (viewOnChainBtn) {
      viewOnChainBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.open(`https://blockchair.com/bitcoin/transaction/${tx.txid}`, '_blank');
      });
    }
    
    els.btcHistoryList.appendChild(row);
  }
  
  // Update load more button after rendering
  btcUpdateLoadMoreButton();
}

async function btcDownloadTransactionPDF(tx) {
  if (!window.jspdf) {
    alert('PDF library loading. Please try again.');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const wallet = state.bitcoin.wallet;

  const logoData = await getPdfLogo();
  const title = 'Bitcoin Transaction Details';
  const subtitle = `Transaction ID: ${btcShortHash(tx.txid)}`;
  drawPdfHeader(doc, logoData, title, subtitle);
  drawPdfOwnerBlock(doc, 48);

  // Get transaction direction and details
  const dir = btcTxDirection(tx);
  const ts = tx.status && tx.status.confirmed
    ? btcFormatDate(tx.status.block_time || 0)
    : 'mempool';
  const conf = tx.status && tx.status.confirmed
    ? (tx.status.block_height ? `confirmed @ ${tx.status.block_height}` : 'confirmed')
    : 'unconfirmed';
  const amount = dir.netSat === 0
    ? '0 BTC'
    : `${dir.netSat > 0 ? '+' : '-'}${btcFormatBtcFromSat(Math.abs(dir.netSat))}`;
  const badgeText = dir.label === 'received' ? 'Received' : dir.label === 'sent' ? 'Sent' : 'Self / change';
  
  // Get addresses for this transaction
  const addresses = btcGetTransactionAddresses(tx, wallet.address);

  // Add transaction summary to top right
  doc.setFontSize(10);
  doc.setTextColor(23, 33, 43);
  const summaryY = 55;
  const summaryX = 120;
  
  doc.text(`Type: ${badgeText}`, summaryX, summaryY);
  doc.text(`Date: ${ts}`, summaryX, summaryY + 7);
  doc.text(`Amount: ${amount}`, summaryX, summaryY + 14);
  doc.text(`Status: ${conf}`, summaryX, summaryY + 21);
  doc.text(`Size: ${tx.size || 0} bytes`, summaryX, summaryY + 28);
  doc.text(`Weight: ${tx.weight || 0} WU`, summaryX, summaryY + 35);
  if (tx.fee) {
    doc.text(`Fee: ${btcFormatBtcFromSat(tx.fee)}`, summaryX, summaryY + 42);
  }

  // Create detailed transaction data
  const tableData = [];
  
  // Main transaction info
  tableData.push(['Field', 'Value']);
  tableData.push(['Transaction Type', badgeText]);
  tableData.push(['Date/Time', ts]);
  tableData.push(['Amount', amount]);
  tableData.push(['Status', conf]);
  tableData.push(['Transaction ID', tx.txid]);
  tableData.push(['Size', `${tx.size || 0} bytes`]);
  tableData.push(['Weight', `${tx.weight || 0} WU`]);
  if (tx.fee) {
    tableData.push(['Fee', btcFormatBtcFromSat(tx.fee)]);
  }
  if (tx.status && tx.status.block_height) {
    tableData.push(['Block Height', tx.status.block_height.toString()]);
  }

  // Add addresses
  if (addresses.from.length > 0) {
    tableData.push(['From Addresses', addresses.from.join(', ')]);
  }
  if (addresses.to.length > 0) {
    tableData.push(['To Addresses', addresses.to.join(', ')]);
  }

  // Add the table to PDF
  doc.autoTable({
    head: [tableData[0]],
    body: tableData.slice(1),
    startY: 75,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [36, 87, 214], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    columnStyles: {
      0: { cellWidth: 40, fontStyle: 'bold' },
      1: { cellWidth: 'auto' }
    }
  });

  // Save the PDF
  doc.save(`bitcoin-transaction-${btcShortHash(tx.txid)}-${new Date().toISOString().split('T')[0]}.pdf`);
}

async function btcFetchWalletData(withFeeRefresh) {
  if (!state.bitcoin.wallet) return;

  const wallet = state.bitcoin.wallet;
  btcSetWalletStatus('Loading wallet data from Blockstream Explorer…', '');
  try {
    const [stats, utxos] = await Promise.all([
      btcFetchJson(`${btcCurrentApi()}/address/${wallet.address}`),
      btcFetchJson(`${btcCurrentApi()}/address/${wallet.address}/utxo`)
    ]);

    state.bitcoin.utxos = Array.isArray(utxos) ? utxos : [];
    const chainStats = stats.chain_stats || {};
    const mempoolStats = stats.mempool_stats || {};

    // Store chain stats for USD calculations
    state.bitcoin.lastChainStats = chainStats;

    const txCount = Number(chainStats.tx_count || 0) + Number(mempoolStats.tx_count || 0);
    els.btcBalanceValue.textContent = btcFormatBtcFromSat(btcSummarizeUtxoBalance());
    els.btcReceivedValue.textContent = btcFormatBtcFromSat(Number(chainStats.funded_txo_sum || 0));
    els.btcSentValue.textContent = btcFormatBtcFromSat(Number(chainStats.spent_txo_sum || 0));
    els.btcTxCountValue.textContent = `${txCount} tx`;

    // Fetch BTC price and update USD values
    const priceData = await btcFetchPrice();
    if (priceData) {
      state.bitcoin.priceChange = priceData.change;
      btcUpdatePriceDisplay();
      btcUpdateUsdValues();
    }

    // Reset pagination state
    state.bitcoin.history = [];
    state.bitcoin.historyCursor = null;
    state.bitcoin.historyDone = false;
    state.bitcoin.historyTotal = txCount;
    
    // Load initial batch of transactions
    await btcLoadMoreTransactions();

    btcSetWalletStatus(
      `Live data loaded.\nAddress: ${wallet.address}\nAvailable balance: ${btcFormatBtcFromSat(btcSummarizeUtxoBalance())}`,
      ''
    );

    if (withFeeRefresh) {
      try {
        const fees = await btcFetchJson(`${btcCurrentApi()}/fee-estimates`);
        const suggested = Number(fees && (fees['2'] || fees['3'] || fees['4'] || 8));
        if (Number.isFinite(suggested) && suggested > 0) {
          state.bitcoin.feeRate = suggested;
          els.btcFeeRate.value = String(Number(suggested.toFixed(2)));
        }
      } catch (err) {
        if (!els.btcFeeRate.value) els.btcFeeRate.value = '8';
      }
    }
  } catch (err) {
    btcSetWalletStatus(`Could not load live wallet data.\n${err.message || err}`, '');
  }
}

async function btcImportWif() {
  try {
    const wif = els.btcWifInput.value.trim();
    if (!wif) {
      btcSetWalletStatus('Please enter a WIF (private key) to import.', 'error');
      return;
    }
    
    console.log('Importing WIF:', wif);
    state.bitcoin.selectedNetworkKey = 'mainnet';
    console.log('Selected network:', state.bitcoin.selectedNetworkKey);
    
    const wallet = btcDetectAndLoadWallet(wif, state.bitcoin.selectedNetworkKey);
    console.log('Wallet detected:', wallet);
    
    if (!wallet || !wallet.address) {
      btcSetWalletStatus('Failed to import wallet. Please check your WIF format.', 'error');
      return;
    }
    
    state.bitcoin.wallet = wallet;
    btcUpdateWalletView();
    btcSetWalletStatus(`Wallet loaded for ${wallet.label}. The uncompressed legacy address is ready.`, '');
    
    // Update save button visibility
    updateSaveButtonVisibility();
    
    // Fetch wallet data
    await btcFetchWalletData(true);
    
  } catch (error) {
    console.error('WIF import error:', error);
    btcSetWalletStatus(error.message, 'error');
  }
}

async function btcGenerateWallet() {
  try {
    const key = 'mainnet';
    const info = btcGetNetworkInfo(key);
    const sourcePair = bitcoinjs.ECPair.makeRandom({ network: info.network });
    if (!sourcePair.privateKey) throw new Error('Could not generate a private key.');
    const uncompressedPair = bitcoinjs.ECPair.fromPrivateKey(sourcePair.privateKey, {
      network: info.network,
      compressed: false
    });
    const address = bitcoinjs.payments.p2pkh({
      pubkey: uncompressedPair.publicKey,
      network: info.network
    }).address;
    if (!address) throw new Error('Could not derive an address.');
    const wif = uncompressedPair.toWIF();

    state.bitcoin.wallet = {
      key,
      network: info.network,
      label: info.label,
      inputWif: wif,
      sourcePair,
      uncompressedPair,
      address
    };

    btcUpdateWalletView();
    await btcFetchWalletData(true);
  } catch (err) {
    btcSetWalletStatus(`Could not generate wallet.\n${err.message || err}`, '');
  }
}

function btcGenerateQRCodeDataURL(text) {
  return new Promise((resolve, reject) => {
    try {
      const tempDiv = document.createElement('div');
      tempDiv.style.position = 'absolute';
      tempDiv.style.left = '-9999px';
      tempDiv.style.top = '-9999px';
      document.body.appendChild(tempDiv);
      
      const qr = new QRCode(tempDiv, {
        text: text,
        width: 200,
        height: 200,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
      });
      
      setTimeout(() => {
        const qrImage = tempDiv.querySelector('img');
        if (qrImage && qrImage.src) {
          document.body.removeChild(tempDiv);
          resolve(qrImage.src);
        } else {
          document.body.removeChild(tempDiv);
          reject(new Error('Failed to generate QR code'));
        }
      }, 100);
    } catch (err) {
      reject(err);
    }
  });
}

// Generate Bitcoin Paper Wallet Background
async function generatePaperWalletBackground() {
  // Use the paper_wallet_bg.png image from Assets folder
  // Convert to base64 data URL for jsPDF compatibility
  try {
    const response = await fetch("Assets/paper_wallet_bg.png");
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error("Failed to load paper wallet background:", err);
    // Fallback to a simple background if image fails to load
    return null;
  }
}

async function btcDownloadWalletPdf() {
  try {
    if (!state.bitcoin.wallet) {
      btcSetWalletStatus('No wallet loaded to download.', '');
      return;
    }

    const wallet = state.bitcoin.wallet;
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF();
    
    // Load custom fonts for currency symbols
    await loadCustomFontsForPdf(pdf);
    
    // Generate QR codes
    const [wifQrDataUrl, addressQrDataUrl] = await Promise.all([
      btcGenerateQRCodeDataURL(wallet.inputWif),
      btcGenerateQRCodeDataURL(wallet.address)
    ]);

    // Get logo data and draw standard header
    const logoData = await getPdfLogo();
    const title = "Bitcoin Wallet Backup";
    const subtitle = `Network: ${wallet.label} | Generated: ${new Date().toLocaleString()}`;
    drawPdfHeader(pdf, logoData, title, subtitle);
    drawPdfOwnerBlock(pdf, 48);
    
    // Security warning box
    pdf.setFillColor(255, 248, 235);
    pdf.setDrawColor(239, 68, 68);
    pdf.setLineWidth(0.5);
    pdf.roundedRect(14, 72, 182, 20, 3, 3);
    
    pdf.setFontSize(9);
    pdf.setTextColor(220, 38, 38);
    pdf.setFont(undefined, 'bold');
    pdf.text('WARNING: SECURITY ALERT', 19, 80);
    pdf.setTextColor(139, 69, 19);
    pdf.setFont(undefined, 'normal');
    pdf.text('Keep this PDF secure. Anyone with access to the WIF can control your Bitcoin.', 19, 87);
    
    // Set up colors
    const textColor = [0, 0, 0]; // Black text for light background
    
    // Single background image for entire paper wallet
    const paperWalletBackground = await generatePaperWalletBackground();
    // Only add background if it loaded successfully
    if (paperWalletBackground) {
      pdf.addImage(paperWalletBackground, 'PNG', 14, 100, 182, 125);
    }
    
    // Address QR Code - left side, adjusted position
    pdf.addImage(addressQrDataUrl, 'PNG', 39, 141.5, 42, 42);
    
    // Address Text - below address QR code, adjusted position
    pdf.setFontSize(7.2);
    pdf.setTextColor(...textColor);
    pdf.setFont(undefined, 'normal');
    pdf.text(wallet.address, 43, 199, { maxWidth: 53 });
    
    // WIF QR Code - right side, adjusted position
    pdf.addImage(wifQrDataUrl, 'PNG', 129, 141.5, 42, 42);
    
    // WIF Text - below WIF QR code, smaller font to fit on one line
    pdf.setFontSize(4);
    pdf.setTextColor(...textColor);
    pdf.setFont(undefined, 'normal');
    pdf.text(wallet.inputWif, 140, 199, { maxWidth: 65 });
    
    // Draw standard footer
    drawPdfFooter(pdf);
    
    // Save the PDF
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
    pdf.save(`bitcoin-wallet-${wallet.label.toLowerCase()}-${timestamp}.pdf`);
    
    btcSetWalletStatus('Wallet PDF downloaded successfully!', 'success');
  } catch (err) {
    btcSetWalletStatus(`Failed to generate PDF: ${err.message || err}`, '');
  }
}

function btcClearSession() {
  state.bitcoin.wallet = null;
  state.bitcoin.utxos = [];
  state.bitcoin.history = [];
  state.bitcoin.historyCursor = null;
  state.bitcoin.historyDone = false;
  state.bitcoin.historyTotal = 0;
  els.btcWifInput.value = '';
  els.btcToAddress.value = '';
  els.btcSendAmount.value = '';
  els.btcFeeRate.value = '';
  btcSetWalletStatus('No wallet loaded yet.', '');
  btcClearView();
  // Reset dropdown button text to default
  els.btcExistingAddressesLabel.textContent = 'Select Saved Address ▾';
}

// Bitcoin Wallet Functions
async function saveBitcoinWallet(address, label, network, isWatchOnly) {
  if (!address || !label || !network) {
    alert('Address, label, and network are required.');
    return;
  }

  if (!runtimeConfig?.supabaseUrl || !runtimeConfig?.supabaseKey) {
    alert("Please connect to the database first using your username and ZIP password.");
    els.lockScreen.classList.remove("hide");
    return;
  }

  const walletId = crypto.randomUUID();
  const payload = {
    id: walletId,
    group_id: walletId,
    person_name: "SYSTEM",
    direction: "taken",
    entry_kind: "principal",
    currency: "BTC",
    principal_amount: 0,
    loan_date: new Date().toISOString().split('T')[0],
    action_date: new Date().toISOString().split('T')[0],
    notes: JSON.stringify({
      address: address,
      label: label,
      network: network,
      is_watch_only: isWatchOnly,
      rowType: "BITCOIN_WALLET"
    }),
    created_at: new Date().toISOString()
  };

  console.log('Saving Bitcoin wallet to database:', payload);
  try {
    const result = await supabase(CONFIG.table, { method: "POST", body: JSON.stringify(payload) });
    console.log('Bitcoin wallet saved successfully:', result);
    
    // Refresh the saved wallets list
    await loadBitcoinWalletsFromDatabase();
  } catch (err) {
    console.error('Failed to save Bitcoin wallet:', err);
    alert('Failed to save Bitcoin wallet to database: ' + err.message);
  }
}

async function deleteBitcoinWallet(walletId) {
  if (!walletId) {
    alert('Wallet ID is required for deletion.');
    return;
  }

  try {
    await supabase(`${CONFIG.table}?id=eq.${encodeURIComponent(walletId)}`, { method: 'DELETE' });
    console.log('Bitcoin wallet deleted successfully:', walletId);
    await loadBitcoinWalletsFromDatabase();
  } catch (err) {
    console.error('Failed to delete Bitcoin wallet:', err);
    alert('Failed to delete Bitcoin wallet: ' + err.message);
  }
}

async function loadBitcoinWalletsFromDatabase() {
  if (!runtimeConfig?.supabaseUrl || !runtimeConfig?.supabaseKey) {
    console.log('Database not connected, Bitcoin wallets will not be loaded');
    state.bitcoinWallets = [];
    renderBitcoinWallets();
    return;
  }

  try {
    console.log('Loading Bitcoin wallets from database...');
    const rows = await supabase(`${CONFIG.table}?select=*&direction=eq.taken&person_name=eq.SYSTEM&order=created_at.desc`);
    console.log('Database rows:', rows);
    state.bitcoinWallets = (Array.isArray(rows) ? rows : [])
      .filter(row => {
        try {
          const walletData = JSON.parse(row.notes || '{}');
          return walletData.rowType === "BITCOIN_WALLET";
        } catch {
          return false;
        }
      })
      .map(row => {
        try {
          const walletData = JSON.parse(row.notes || '{}');
          return {
            id: row.id,
            address: walletData.address || '',
            label: walletData.label || '',
            network: walletData.network || '',
            is_watch_only: walletData.is_watch_only || false,
            createdAt: row.created_at
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    console.log('Loaded Bitcoin wallets:', state.bitcoinWallets);
    renderBitcoinWallets();
    renderExistingAddressesDropdown();
  } catch (err) {
    console.error('Failed to load Bitcoin wallets from database:', err);
    state.bitcoinWallets = [];
    renderBitcoinWallets();
    renderExistingAddressesDropdown();
  }
}

function renderExistingAddressesDropdown() {
  if (state.bitcoinWallets.length === 0) {
    els.btcExistingAddressesList.innerHTML = '<div style="padding:12px;text-align:center;color:var(--muted);font-size:.9rem;">No saved addresses found</div>';
    els.btcExistingAddressesLabel.textContent = 'Select Saved Address ▾';
    return;
  }

  els.btcExistingAddressesList.innerHTML = '';
  state.bitcoinWallets.forEach(wallet => {
    const walletItem = document.createElement('div');
    walletItem.style.cssText = 'padding:8px 12px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;';
    
    const walletInfo = document.createElement('div');
    walletInfo.style.cssText = 'flex:1;cursor:pointer;';
    walletInfo.innerHTML = `
      <div style="font-weight:600;color:var(--text);margin-bottom:2px;">${escapeHtml(wallet.label)}</div>
      <div style="font-size:.8rem;color:var(--muted);">${escapeHtml(wallet.address.slice(0, 20))}...${escapeHtml(wallet.address.slice(-10))}</div>
      <div style="font-size:.75rem;color:var(--muted);">${wallet.network} ${wallet.is_watch_only ? '(Watch Only)' : '(Full)'}</div>
    `;
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn ghost';
    deleteBtn.style.cssText = 'padding:4px 8px;font-size:.8rem;margin-left:8px;';
    deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
    deleteBtn.onclick = async (e) => {
      e.stopPropagation();
      if (confirm(`Delete saved address "${wallet.label}"?`)) {
        await deleteBitcoinWallet(wallet.id);
      }
    };
    
    walletInfo.onclick = () => {
      loadSelectedAddress(wallet);
    };
    
    walletItem.appendChild(walletInfo);
    walletItem.appendChild(deleteBtn);
    els.btcExistingAddressesList.appendChild(walletItem);
  });
}

function checkIfAddressExists(address) {
  return state.bitcoinWallets.some(wallet => 
    wallet.address.toLowerCase() === address.toLowerCase()
  );
}

async function promptToSaveWallet(address, label, network, isWatchOnly) {
  if (checkIfAddressExists(address)) {
    return; // Don't save if already exists
  }
  
  // Save directly without prompting
  await saveBitcoinWallet(address, label, network, isWatchOnly);
}

function updateSaveButtonVisibility() {
  if (!state.bitcoin.wallet || !state.bitcoin.wallet.address) {
    els.btcSaveAddressBtn.style.display = 'none';
    return;
  }
  
  const addressExists = checkIfAddressExists(state.bitcoin.wallet.address);
  
  // Show save button if:
  // 1. It's a watch-only wallet that doesn't exist in database, OR
  // 2. It's a full wallet that doesn't exist in database
  if (addressExists) {
    els.btcSaveAddressBtn.style.display = 'none';
  } else {
    els.btcSaveAddressBtn.style.display = 'block';
    
    // Update button text based on wallet type
    if (state.bitcoin.wallet.isWatchOnly) {
      els.btcSaveAddressBtn.textContent = 'Save Watch Wallet';
    } else {
      els.btcSaveAddressBtn.textContent = 'Save Wallet';
    }
  }
}

function updateSavedAddressesVisibility() {
  // Hide the existing addresses section when a wallet is loaded
  if (state.bitcoin.wallet && state.bitcoin.wallet.address) {
    // Hide the entire existing addresses section
    const existingAddressesSection = els.btcExistingAddressesBtn.closest('.field');
    if (existingAddressesSection) {
      existingAddressesSection.style.display = 'none';
    }
  } else {
    // Show the existing addresses section when no wallet is loaded
    const existingAddressesSection = els.btcExistingAddressesBtn.closest('.field');
    if (existingAddressesSection) {
      existingAddressesSection.style.display = 'block';
    }
  }
}

async function loadSelectedAddress(wallet) {
  // Close dropdown
  els.btcExistingAddressesDropdown.classList.remove('show');
  els.btcExistingAddressesBtn.setAttribute('aria-expanded', 'false');
  
  // Update label
  els.btcExistingAddressesLabel.textContent = `${wallet.label} ▾`;
  
  // Always load as watch-only address when selecting from existing list
  els.btcWatchWalletBtn.click();
  els.btcAddressInput.value = wallet.address;
  state.bitcoin.selectedNetworkKey = wallet.network;
  
  // Directly set up watch wallet without going through btcWatchAddress function
  try {
    state.bitcoin.isWatchOnly = true;
    state.bitcoin.watchAddress = wallet.address;
    state.bitcoin.wallet = {
      address: wallet.address,
      key: state.bitcoin.selectedNetworkKey,
      label: btcGetNetworkInfo(state.bitcoin.selectedNetworkKey).label,
      isWatchOnly: true
    };
    
    btcUpdateWalletView();
    btcSetWalletStatus(`Watch-only wallet loaded for address: ${btcShortHash(wallet.address)}`, '');
    
    // Update UI visibility
    updateSaveButtonVisibility();
    updateSavedAddressesVisibility();
    
    // Fetch wallet data
    await btcFetchWalletData(true);
  } catch (error) {
    btcSetWalletStatus(`Error watching address: ${error.message}`, '');
  }
}

function renderBitcoinWallets(searchTerm = '') {
  // Section has been removed from HTML, so do nothing
  return;
}

// Load saved wallet function for onclick handlers
async function loadSavedBitcoinWallet(address, network, isWatchOnly) {
  try {
    if (isWatchOnly) {
      // Load as watch-only wallet
      state.bitcoin.selectedNetworkKey = network;
      state.bitcoin.isWatchOnly = true;
      state.bitcoin.watchAddress = address;
      state.bitcoin.wallet = {
        address: address,
        key: network,
        label: network.charAt(0).toUpperCase() + network.slice(1),
        isWatchOnly: true
      };
      
      btcUpdateWalletView();
      btcSetWalletStatus(`Watch-only wallet loaded: ${address}`, '');
      
      // Fetch wallet data
      await btcFetchWalletData(true);
    } else {
      // For full wallets, we need the user to provide WIF
      // We'll pre-fill the WIF input and switch to full wallet mode
      els.btcWifInput.value = ''; // Clear for security
      state.bitcoin.selectedNetworkKey = network;
      
      // Switch to full wallet mode
      btcToggleWalletType('full');
      
      btcSetWalletStatus(`Please enter the WIF for address: ${address}`, '');
    }
  } catch (err) {
    console.error('Failed to load saved Bitcoin wallet:', err);
    btcSetWalletStatus(`Error loading wallet: ${err.message}`, '');
  }
}

// Delete saved wallet function for onclick handlers
async function deleteSavedBitcoinWallet(walletId) {
  if (confirm('Are you sure you want to delete this Bitcoin address from saved wallets?')) {
    await deleteBitcoinWallet(walletId);
  }
}

// Notes Functions
async function saveNote() {
  const noteText = els.noteInput.value.trim();
  if (!noteText) {
    alert('Please enter a note.');
    return;
  }

  if (!runtimeConfig?.supabaseUrl || !runtimeConfig?.supabaseKey) {
    alert("Please connect to the database first using your username and ZIP password.");
    els.lockScreen.classList.remove("hide");
    return;
  }

  const noteId = crypto.randomUUID();
  const payload = {
    id: noteId,
    group_id: noteId,
    person_name: "SYSTEM",
    direction: "taken",
    entry_kind: "principal",
    currency: "AED",
    principal_amount: 0,
    loan_date: new Date().toISOString().split('T')[0],
    action_date: new Date().toISOString().split('T')[0],
    notes: JSON.stringify({
      content: noteText,
      rowType: "NOTE"
    }),
    created_at: new Date().toISOString()
  };

  console.log('Saving note to database:', payload);
  try {
    const result = await supabase(CONFIG.table, { method: "POST", body: JSON.stringify(payload) });
    console.log('Note saved successfully:', result);
    els.noteInput.value = '';
    await loadNotesFromDatabase();
  } catch (err) {
    console.error('Failed to save note:', err);
    alert("Failed to save note to database: " + err.message);
  }
}

function renderNotes(searchTerm = '') {
  const filteredNotes = searchTerm
    ? state.notes.filter(note =>
        note.content.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : state.notes;

  els.notesList.innerHTML = '';

  if (filteredNotes.length === 0) {
    els.notesList.innerHTML = '<div class="empty">No notes found.</div>';
    return;
  }

  filteredNotes.forEach(note => {
    const noteDate = new Date(note.createdAt);
    const formattedDate = noteDate.toLocaleDateString() + ' ' + noteDate.toLocaleTimeString();

    const noteEl = document.createElement('div');
    noteEl.className = 'card';
    noteEl.style.marginBottom = '12px';
    noteEl.style.padding = '14px';
    noteEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
        <div style="flex:1;">
          <div style="font-size:.9rem;color:var(--text);line-height:1.5;white-space:pre-wrap;">${escapeHtml(note.content)}</div>
        </div>
        <div style="display:flex;gap:8px;margin-left:10px;">
          <button class="btn ghost" onclick="editNote('${note.id}')" style="padding:4px 8px;font-size:.8rem;">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="btn ghost" onclick="deleteNote('${note.id}')" style="padding:4px 8px;font-size:.8rem;">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
      <div style="font-size:.76rem;color:var(--muted);">${formattedDate}</div>
    `;
    els.notesList.appendChild(noteEl);
  });
}

window.deleteNote = async function(noteId) {
  if (!confirm('Are you sure you want to delete this note?')) return;
  
  if (!runtimeConfig?.supabaseUrl || !runtimeConfig?.supabaseKey) {
    alert("Please connect to the database first using your username and ZIP password.");
    els.lockScreen.classList.remove("hide");
    return;
  }

  try {
    await supabase(`${CONFIG.table}?id=eq.${encodeURIComponent(noteId)}`, { method: "DELETE" });
    await loadNotesFromDatabase();
  } catch (err) {
    alert("Failed to delete note: " + err.message);
  }
};

window.editNote = async function(noteId) {
  const note = state.notes.find(n => n.id === noteId);
  if (!note) return;
  
  const newContent = prompt('Edit your note:', note.content);
  if (newContent === null || newContent.trim() === '') return;
  
  if (!runtimeConfig?.supabaseUrl || !runtimeConfig?.supabaseKey) {
    alert("Please connect to the database first using your username and ZIP password.");
    els.lockScreen.classList.remove("hide");
    return;
  }

  try {
    await supabase(`${CONFIG.table}?id=eq.${encodeURIComponent(noteId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        notes: JSON.stringify({
          content: newContent.trim(),
          rowType: "NOTE"
        })
      })
    });
    await loadNotesFromDatabase();
  } catch (err) {
    alert("Failed to update note: " + err.message);
  }
};

async function loadNotesFromDatabase() {
  if (!runtimeConfig?.supabaseUrl || !runtimeConfig?.supabaseKey) {
    console.log('Database not connected, notes will not be loaded');
    state.notes = [];
    renderNotes();
    return;
  }

  try {
    console.log('Loading notes from database...');
    const rows = await supabase(`${CONFIG.table}?select=*&direction=eq.taken&person_name=eq.SYSTEM&order=created_at.desc`);
    console.log('Database rows:', rows);
    state.notes = (Array.isArray(rows) ? rows : [])
      .filter(row => {
        try {
          const noteData = JSON.parse(row.notes || '{}');
          return noteData.rowType === "NOTE";
        } catch {
          return false;
        }
      })
      .map(row => {
        try {
          const noteData = JSON.parse(row.notes || '{}');
          return {
            id: row.id,
            content: noteData.content || '',
            createdAt: row.created_at
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    console.log('Loaded notes:', state.notes);
    renderNotes();
  } catch (err) {
    console.error('Failed to load notes from database:', err);
    state.notes = [];
    renderNotes();
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function btcUseMaxAmount() {
  if (!state.bitcoin.wallet) return;
  const balance = btcSummarizeUtxoBalance();
  const feeRate = Number(els.btcFeeRate.value || state.bitcoin.feeRate || 8);
  const inputCount = Math.max(1, state.bitcoin.utxos.length);
  const feeOneOut = Math.ceil(btcEstimateLegacyP2PKHSize(inputCount, 1) * feeRate);
  const maxSat = Math.max(0, balance - feeOneOut);
  els.btcSendAmount.value = (maxSat / 1e8).toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
  btcSetSendStatus(`Max amount prefilled from confirmed balance: ${btcFormatBtcFromSat(maxSat)}.`, '');
}

async function btcDownloadPDF() {
  if (!state.bitcoin.wallet) {
    alert('Please load a wallet first.');
    return;
  }
  if (!state.bitcoin.history || !state.bitcoin.history.length) {
    alert('No transactions to download.');
    return;
  }
  if (!window.jspdf) {
    alert('PDF library loading. Please try again.');
    return;
  }

  // Only use currently displayed transactions (max 20 or currently loaded)
  const displayedTransactions = state.bitcoin.history.slice(0, Math.min(state.bitcoin.history.length, 20));
  
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const wallet = state.bitcoin.wallet;

  const logoData = await getPdfLogo();
  const title = 'Bitcoin Transaction History';
  const subtitle = `Address: ${wallet.address} (${displayedTransactions.length} transactions)`;
  drawPdfHeader(doc, logoData, title, subtitle);
  drawPdfOwnerBlock(doc, 48);

  // Calculate summary data from displayed transactions only
  const balance = btcSummarizeUtxoBalance();
  const received = Number(displayedTransactions.reduce((sum, tx) => sum + (btcTxDirection(tx).receivedSat || 0), 0));
  const sent = Number(displayedTransactions.reduce((sum, tx) => sum + (btcTxDirection(tx).sentSat || 0), 0));
  const transactionCount = displayedTransactions.length;

  // Add summary info to top right
  doc.setFontSize(10);
  doc.setTextColor(23, 33, 43);
  const summaryY = 55;
  const summaryX = 120;
  
  doc.text(`Transaction Count: ${transactionCount}`, summaryX, summaryY);
  doc.text(`Current Balance: ${btcFormatBtcFromSat(balance)}`, summaryX, summaryY + 7);
  doc.text(`Total Received: ${btcFormatBtcFromSat(received)}`, summaryX, summaryY + 14);
  doc.text(`Total Sent: ${btcFormatBtcFromSat(sent)}`, summaryX, summaryY + 21);
  doc.text(`Network: ${wallet.label}`, summaryX, summaryY + 28);

  // Create detailed transaction data
  const tableData = [];
  for (const tx of displayedTransactions) {
    const dir = btcTxDirection(tx);
    const ts = tx.status && tx.status.confirmed
      ? btcFormatDate(tx.status.block_time || 0)
      : 'mempool';
    const conf = tx.status && tx.status.confirmed
      ? (tx.status.block_height ? `confirmed @ ${tx.status.block_height}` : 'confirmed')
      : 'unconfirmed';
    const amount = dir.netSat === 0
      ? '0 BTC'
      : `${dir.netSat > 0 ? '+' : '-'}${btcFormatBtcFromSat(Math.abs(dir.netSat))}`;
    const badgeText = dir.label === 'received' ? 'Received' : dir.label === 'sent' ? 'Sent' : 'Self / change';
    
    // Get addresses for this transaction
    const addresses = btcGetTransactionAddresses(tx, wallet.address);
    
    // Main transaction row
    tableData.push([
      badgeText,
      ts,
      amount,
      conf,
      btcShortHash(tx.txid)
    ]);
    
    // Full transaction hash row
    tableData.push([
      '',
      'Full Hash:',
      { content: tx.txid, styles: { fontStyle: 'mono', fontSize: 8, cellWidth: 'auto' } },
      '',
      ''
    ]);
    
    // From addresses row
    if (addresses.from.length > 0) {
      tableData.push([
        '',
        'From:',
        { content: addresses.from.join(', '), styles: { fontStyle: 'mono', fontSize: 8, cellWidth: 'auto' } },
        '',
        ''
      ]);
    }
    
    // To addresses row
    if (addresses.to.length > 0) {
      tableData.push([
        '',
        'To:',
        { content: addresses.to.join(', '), styles: { fontStyle: 'mono', fontSize: 8, cellWidth: 'auto' } },
        '',
        ''
      ]);
    }
    
    // Additional details row
    const details = [];
    if (tx.size) details.push(`Size: ${tx.size} bytes`);
    if (tx.weight) details.push(`Weight: ${tx.weight} WU`);
    if (tx.fee) details.push(`Fee: ${btcFormatBtcFromSat(tx.fee)}`);
    if (details.length > 0) {
      tableData.push([
        '',
        'Details:',
        { content: details.join(' | '), styles: { fontSize: 8 } },
        '',
        ''
      ]);
    }
    
    // Add empty row for spacing between transactions
    tableData.push(['', '', '', '', '']);
  }

  doc.autoTable({
    startY: 72,
    head: [['Type', 'Date', 'Amount', 'Status', 'Txid']],
    body: tableData,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [36, 87, 214], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    tableWidth: 182, // Fixed width to stay within page margins (14px left + 14px right = 28px total margins, 210 - 28 = 182)
    margin: { left: 14, right: 14 },
    rowPageBreak: 'auto',
    pageBreak: 'auto',
    showFoot: 'everyPage',
    horizontalPageBreak: false,
    columnStyles: {
      0: { cellWidth: 22, fontSize: 8 },
      1: { cellWidth: 40, fontSize: 8 },
      2: { cellWidth: 30, fontSize: 8 },
      3: { cellWidth: 30, fontSize: 8 },
      4: { cellWidth: 60, fontSize: 7 }
    },
    didParseCell: function(data) {
      // Style detail rows differently
      if (data.row.raw && data.row.raw[0] === '' && data.row.raw[1] && 
          (data.row.raw[1].includes('Full Hash:') || data.row.raw[1].includes('From:') || 
           data.row.raw[1].includes('To:') || data.row.raw[1].includes('Details:'))) {
        data.cell.styles.fillColor = [245, 247, 250];
        data.cell.styles.fontStyle = 'normal';
        data.cell.styles.fontSize = 7;
        
        // Make hash/address columns use full width
        if (data.column.index === 2 && data.row.raw[1] !== 'Details:') {
          data.cell.styles.cellWidth = 'auto';
          data.cell.colSpan = 3;
        }
      }
      
      // Truncate long text in main txid column
      if (data.column.index === 4 && typeof data.cell.text === 'string' && data.cell.text.length > 15) {
        data.cell.text = data.cell.text.substring(0, 12) + '...';
      }
    },
    willDrawCell: function(data) {
      // For detail rows, ensure proper text wrapping
      if (data.row.raw && data.row.raw[0] === '' && data.row.raw[1] && 
          (data.row.raw[1].includes('Full Hash:') || data.row.raw[1].includes('From:') || 
           data.row.raw[1].includes('To:'))) {
        if (data.column.index === 2) {
          const text = data.cell.raw || '';
          if (typeof text === 'string' && text.length > 60) {
            const lines = doc.splitTextToSize(text, 140);
            data.cell.text = lines;
          }
        }
      }
    }
  });

  // Summary already displayed at top right, no need to repeat here

  drawPdfFooter(doc);
  doc.save(`bitcoin-transactions-${wallet.address.slice(0, 8)}-${new Date().toISOString().split('T')[0]}.pdf`);
}

async function btcBuildAndBroadcast() {
  if (!state.bitcoin.wallet) {
    btcSetSendStatus('Load a wallet first.', '');
    return;
  }

  const wallet = state.bitcoin.wallet;
  const toAddress = String(els.btcToAddress.value || '').trim();
  if (!toAddress) {
    btcSetSendStatus('Enter a recipient address.', '');
    return;
  }

  let amountSat;
  let feeRateSatVb;
  try {
    amountSat = btcBtcToSat(els.btcSendAmount.value);
  } catch (err) {
    btcSetSendStatus(err.message || 'Invalid amount.', '');
    return;
  }

  feeRateSatVb = Number(els.btcFeeRate.value || state.bitcoin.feeRate || 8);
  if (!Number.isFinite(feeRateSatVb) || feeRateSatVb <= 0) {
    btcSetSendStatus('Invalid fee rate.', '');
    return;
  }

  // Handle watch-only wallet - require WIF for signing
  let signingWallet = wallet;
  if (wallet.isWatchOnly) {
    const wif = String(els.btcSendWifInput.value || '').trim();
    if (!wif) {
      btcSetSendStatus('Watch-only wallet requires private key (WIF) to sign transactions.', '');
      return;
    }
    
    try {
      // Create temporary signing wallet from provided WIF
      const signingKeyPair = btcDetectAndLoadWallet(wif, wallet.key);
      if (signingKeyPair.address !== wallet.address) {
        btcSetSendStatus('Provided WIF does not match the watch-only wallet address.', '');
        return;
      }
      signingWallet = {
        ...wallet,
        wif: wif,
        uncompressedPair: signingKeyPair.uncompressedPair,
        network: signingKeyPair.network,
        isWatchOnly: false // Temporary override for signing
      };
    } catch (err) {
      btcSetSendStatus(`Invalid WIF provided: ${err.message}`, '');
      return;
    }
  }

  let outputScript;
  try {
    outputScript = bitcoinjs.address.toOutputScript(toAddress, signingWallet.network);
  } catch (err) {
    btcSetSendStatus('Recipient address is not valid for the selected network.', '');
    return;
  }

  const spendable = btcSummarizeUtxoBalance();
  if (!state.bitcoin.utxos.length || spendable <= 0) {
    btcSetSendStatus('No spendable UTXOs were found for this wallet.', '');
    return;
  }
  if (amountSat <= 0) {
    btcSetSendStatus('Amount must be greater than zero.', '');
    return;
  }

  const utxos = [...state.bitcoin.utxos].sort((a, b) => Number(b.value || 0) - Number(a.value || 0));
  const selected = [];
  let totalIn = 0;
  let plan = null;

  for (const utxo of utxos) {
    selected.push(utxo);
    totalIn += Number(utxo.value || 0);
    plan = btcBuildSpendPlan(totalIn, selected.length, amountSat, feeRateSatVb);
    if (plan) break;
  }

  if (!plan) {
    btcSetSendStatus(
      `Not enough amount available to make transaction.\nAvailable balance: ${btcFormatBtcFromSat(spendable)}\nAmount requested: ${btcFormatBtcFromSat(amountSat)} BTC\nPlease reduce the amount or add more funds.`,
      'danger'
    );
    return;
  }

  btcSetSendStatus('Fetching previous transactions and assembling the spend…', '');

  try {
    const prevHexes = await Promise.all(selected.map((u) => btcFetchText(`${btcCurrentApi()}/tx/${u.txid}/hex`)));
    const psbt = new bitcoinjs.Psbt({ network: signingWallet.network });

    for (let i = 0; i < selected.length; i++) {
      const utxo = selected[i];
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        nonWitnessUtxo: btcHexToBytes(prevHexes[i])
      });
    }

    psbt.addOutput({ script: outputScript, value: amountSat });

    if (plan.outputs === 2 && plan.changeSat >= DUST_P2PKH) {
      psbt.addOutput({ address: signingWallet.address, value: plan.changeSat });
    }

    for (let i = 0; i < selected.length; i++) {
      psbt.signInput(i, signingWallet.uncompressedPair);
    }
    psbt.finalizeAllInputs();

    const tx = psbt.extractTransaction();
    const rawHex = tx.toHex();
    const exactVSize = tx.virtualSize();
    const changeValue = plan.outputs === 2 ? plan.changeSat : 0;
    const exactFee = totalIn - amountSat - changeValue;
    const actualRate = exactFee / exactVSize;

    btcSetSendStatus(
      `Transaction built successfully.\nInputs: ${selected.length}\nExact size: ${exactVSize} vB\nFee: ${btcFormatBtcFromSat(exactFee)} (${actualRate.toFixed(2)} sat/vB)\nBroadcasting…`
    );

    const broadcast = await btcFetchText(`${btcCurrentApi()}/tx`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: rawHex
    });

    const txid = String(broadcast || '').trim();
    btcSetSendStatus(
      `Broadcast accepted.\nTxid: ${txid || tx.getId()}\nFee: ${btcFormatBtcFromSat(exactFee)}\nThe wallet data will refresh now.`,
      ''
    );

    // Show Bitcoin transaction success overlay
    showBtcTransactionSuccessOverlay(amountSat, toAddress, txid || tx.getId());

    await btcFetchWalletData(false);
  } catch (err) {
    btcSetSendStatus(`Send failed.\n${err.message || err}`, '');
  }
}

function btcBindUI() {
  // Wallet type toggle buttons
  els.btcFullWalletBtn.addEventListener('click', () => btcToggleWalletType('full'));
  els.btcWatchWalletBtn.addEventListener('click', () => btcToggleWalletType('watch'));
  els.btcWatchAddressBtn.addEventListener('click', btcWatchAddress);
  
  els.btcImportBtn.addEventListener('click', btcImportWif);
  els.btcGenerateBtn.addEventListener('click', btcGenerateWallet);
  els.btcDownloadWalletPdfBtn.addEventListener('click', btcDownloadWalletPdf);
  els.btcClearBtn.addEventListener('click', btcClearSession);
  els.btcCopyWifBtn.addEventListener('click', async () => {
    if (!state.bitcoin.wallet) return;
    try {
      await btcCopyText(state.bitcoin.wallet.inputWif);
      const oldText = els.btcCopyWifBtn.textContent;
      els.btcCopyWifBtn.textContent = 'Copied';
      setTimeout(() => {
        els.btcCopyWifBtn.textContent = oldText;
      }, 1000);
    } catch (err) {
      btcSetWalletStatus('Could not copy WIF.', '');
    }
  });
  els.btcSaveAddressBtn.addEventListener('click', async () => {
    if (!state.bitcoin.wallet || !state.bitcoin.wallet.address) {
      btcSetWalletStatus('No wallet loaded to save.', 'error');
      return;
    }
    
    // Save directly using the address as the label
    await saveBitcoinWallet(
      state.bitcoin.wallet.address, 
      state.bitcoin.wallet.address, 
      state.bitcoin.wallet.key, 
      state.bitcoin.isWatchOnly
    );
    updateSaveButtonVisibility();
  });
  
  els.btcCopyAddressInfoBtn.addEventListener('click', async () => {
    if (!state.bitcoin.wallet) return;
    try {
      await btcCopyText(state.bitcoin.wallet.address);
      const oldText = els.btcCopyAddressInfoBtn.textContent;
      els.btcCopyAddressInfoBtn.textContent = 'Copied';
      els.btcCopyAddressInfoBtn.disabled = true;
      setTimeout(() => {
        els.btcCopyAddressInfoBtn.textContent = oldText;
        els.btcCopyAddressInfoBtn.disabled = false;
      }, 1000);
    } catch (err) {
      console.error('Could not copy address');
    }
  });
  els.btcRefreshBtn.addEventListener('click', () => btcFetchWalletData(true));
  els.btcSendBtn.addEventListener('click', () => {
    if (state.bitcoin.wallet) {
      // Show/hide WIF input based on wallet type
      if (state.bitcoin.wallet.isWatchOnly) {
        els.btcSendWifSection.classList.remove('hide');
        els.btcSendWifInput.value = ''; // Clear previous WIF
      } else {
        els.btcSendWifSection.classList.add('hide');
      }
      els.btcSendModal.classList.remove('hide');
    }
  });
  els.btcReceiveBtn.addEventListener('click', () => {
    if (state.bitcoin.wallet) {
      els.btcReceiveModal.classList.remove('hide');
      els.btcReceiveAddress.textContent = state.bitcoin.wallet.address;
      btcRenderQR(`bitcoin:${state.bitcoin.wallet.address}`);
    }
  });
  els.btcDownloadPdfBtn.addEventListener('click', btcDownloadPDF);
  els.btcBroadcastBtn.addEventListener('click', btcBuildAndBroadcast);
  els.btcMaxBtn.addEventListener('click', btcUseMaxAmount);
}

// Notes UI Binding
function notesBindUI() {
  els.saveNoteBtn.addEventListener('click', saveNote);
  els.searchNotes.addEventListener('input', (e) => {
    renderNotes(e.target.value);
  });
}

function btcClearSession() {
  state.bitcoin.wallet = null;
  state.bitcoin.utxos = [];
  state.bitcoin.history = [];
  state.bitcoin.historyCursor = null;
  state.bitcoin.historyDone = false;
  state.bitcoin.isWatchOnly = false;
  state.bitcoin.watchAddress = null;
  
  btcClearView();
  
  // Update UI visibility
  updateSaveButtonVisibility();
  updateSavedAddressesVisibility();
  
  els.btcWifInput.value = '';
  els.btcAddressInput.value = '';
  els.btcToAddress.value = '';
  els.btcSendAmount.value = '';
  els.btcFeeRate.value = '';
  els.btcSendWifInput.value = '';
  btcSetWalletStatus('No wallet loaded yet.', '');
  btcClearView();
  
  // Reset dropdown button text to default
  els.btcExistingAddressesLabel.textContent = 'Select Saved Address ▾';
  
  // Reset wallet type to full wallet
  btcToggleWalletType('full');
}

async function boot(){
  attachEvents();
  initFloatingCurrencyBackground();
  defaultDateInputs(document);
  const resumedImport = sessionStorage.getItem(IMPORT_SESSION_KEY) === "1";
  applyEntries(loadBackupEntriesFromStorage(), "backup", { hasImportedFile: resumedImport });
  activate("expenses");
  setInitialOverviewForExpenses();
  btcBindUI();
  notesBindUI();
  await autoLogin();
  await loadNotesFromDatabase();
  handleUrlHash();
}

// Inquiry Overlay Functionality
function initInquiryOverlay() {
  const sendInquiryBtn = document.getElementById('sendInquiryBtn');
  const inquiryOverlay = document.getElementById('inquiryOverlay');
  const closeInquiryBtn = document.getElementById('closeInquiryBtn');
  const inquiryForm = document.getElementById('inquiryForm');
  const inquirySuccess = document.getElementById('inquirySuccess');
  const inquiryError = document.getElementById('inquiryError');

  // Open inquiry overlay
  if (sendInquiryBtn) {
    sendInquiryBtn.addEventListener('click', () => {
      inquiryOverlay.classList.remove('hide');
      document.body.style.overflow = 'hidden';
    });
  }

  // Close inquiry overlay
  function closeInquiryOverlay() {
    inquiryOverlay.classList.add('hide');
    document.body.style.overflow = '';
    inquiryForm.reset();
    inquirySuccess.classList.add('hide');
    inquiryError.classList.add('hide');
    inquiryForm.classList.remove('submitting');
  }

  if (closeInquiryBtn) {
    closeInquiryBtn.addEventListener('click', closeInquiryOverlay);
  }

  // Close on backdrop click
  inquiryOverlay.addEventListener('click', (e) => {
    if (e.target === inquiryOverlay) {
      closeInquiryOverlay();
    }
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !inquiryOverlay.classList.contains('hide')) {
      closeInquiryOverlay();
    }
  });

  // Handle form submission
  if (inquiryForm) {
    inquiryForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      // Add submitting state
      inquiryForm.classList.add('submitting');
      inquirySuccess.classList.add('hide');
      inquiryError.classList.add('hide');

      // Get form data
      const formData = new FormData(inquiryForm);
      
      try {
        const response = await fetch('https://api.web3forms.com/submit', {
          method: 'POST',
          body: formData
        });

        const result = await response.json();
        
        if (result.success) {
          // Show success message
          inquirySuccess.classList.remove('hide');
          inquiryForm.reset();
          
          // Close overlay after 3 seconds
          setTimeout(() => {
            closeInquiryOverlay();
          }, 3000);
        } else {
          // Show error message
          inquiryError.classList.remove('hide');
        }
      } catch (error) {
        console.error('Inquiry form submission error:', error);
        // Show error message
        inquiryError.classList.remove('hide');
      } finally {
        // Remove submitting state
        inquiryForm.classList.remove('submitting');
      }
    });
  }
}

// App Download Overlay Functionality
let iosQrCodeInstance = null;
let androidQrCodeInstance = null;

function initAppDownloadOverlay() {
  // Get elements
  const iosDownloadBtn = document.getElementById('iosDownloadBtn');
  const androidDownloadBtn = document.getElementById('androidDownloadBtn');
  const iosDownloadOverlay = document.getElementById('iosDownloadOverlay');
  const androidDownloadOverlay = document.getElementById('androidDownloadOverlay');
  const closeIosDownloadBtn = document.getElementById('closeIosDownloadBtn');
  const closeAndroidDownloadBtn = document.getElementById('closeAndroidDownloadBtn');

  if (!iosDownloadBtn || !androidDownloadBtn || !iosDownloadOverlay || !androidDownloadOverlay) {
    console.warn('App download elements not found');
    return;
  }

  // iOS download button click handler
  iosDownloadBtn.addEventListener('click', () => {
    showIosDownloadOverlay();
  });

  // Android download button click handler
  androidDownloadBtn.addEventListener('click', () => {
    showAndroidDownloadOverlay();
  });

  // Close button handlers
  closeIosDownloadBtn.addEventListener('click', hideIosDownloadOverlay);
  closeAndroidDownloadBtn.addEventListener('click', hideAndroidDownloadOverlay);

  // Close on overlay background click
  iosDownloadOverlay.addEventListener('click', (e) => {
    if (e.target === iosDownloadOverlay) {
      hideIosDownloadOverlay();
    }
  });

  androidDownloadOverlay.addEventListener('click', (e) => {
    if (e.target === androidDownloadOverlay) {
      hideAndroidDownloadOverlay();
    }
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideIosDownloadOverlay();
      hideAndroidDownloadOverlay();
    }
  });
}

function showIosDownloadOverlay() {
  const overlay = document.getElementById('iosDownloadOverlay');
  const qrContainer = document.getElementById('iosQrCode');
  
  if (!overlay || !qrContainer) return;

  // Show overlay
  overlay.classList.remove('hide');
  
  // Generate QR code if not already generated
  if (!iosQrCodeInstance) {
    const iosUrl = 'https://triplem.vip/Assets/mobile_app/iOS/Triple_M_by_NSF.mobileconfig';
    qrContainer.innerHTML = ''; // Clear existing content
    
    try {
      iosQrCodeInstance = new QRCode(qrContainer, {
        text: iosUrl,
        width: 90,
        height: 90,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
      });
    } catch (error) {
      console.error('Failed to generate iOS QR code:', error);
      qrContainer.innerHTML = '<p style="color: var(--danger); font-size: 0.65rem;">Failed to generate QR code</p>';
    }
  }
}

function showAndroidDownloadOverlay() {
  const overlay = document.getElementById('androidDownloadOverlay');
  const qrContainer = document.getElementById('androidQrCode');
  
  if (!overlay || !qrContainer) return;

  // Show overlay
  overlay.classList.remove('hide');
  
  // Generate QR code if not already generated
  if (!androidQrCodeInstance) {
    const androidUrl = 'https://triplem.vip/Assets/mobile_app/Android/Triple_M_by_NSF.apk';
    qrContainer.innerHTML = ''; // Clear existing content
    
    try {
      androidQrCodeInstance = new QRCode(qrContainer, {
        text: androidUrl,
        width: 90,
        height: 90,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
      });
    } catch (error) {
      console.error('Failed to generate Android QR code:', error);
      qrContainer.innerHTML = '<p style="color: var(--danger); font-size: 0.65rem;">Failed to generate QR code</p>';
    }
  }
}

function hideIosDownloadOverlay() {
  const overlay = document.getElementById('iosDownloadOverlay');
  if (overlay) {
    overlay.classList.add('hide');
  }
}

function hideAndroidDownloadOverlay() {
  const overlay = document.getElementById('androidDownloadOverlay');
  if (overlay) {
    overlay.classList.add('hide');
  }
}

// Initialize inquiry overlay when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initInquiryOverlay();
    initAppDownloadOverlay();
  });
} else {
  initInquiryOverlay();
  initAppDownloadOverlay();
}

boot();
