const CONFIG = {
  zipBaseUrl: "https://triplem.vip/Assets/app/",
  table: "loan_ledger_entries"
};

const ZIP_USERNAME_SESSION_KEY = "loanledger-zip-username-v1";
const ZIP_PASSWORD_STORAGE_KEY = "loanledger-zip-password-v1";
const ZIP_USERNAME_STORAGE_KEY = "loanledger-zip-username-persist-v1";
const ZIP_DERIVED_PASSWORD_SESSION_KEY = "loanledger-zip-derived-password-v2";
const ZIP_DERIVED_USERNAME_SESSION_KEY = "loanledger-zip-derived-username-v2";
const ZIP_ENCRYPTED_CREDENTIAL_STORAGE_KEY = "loanledger-zip-credential-v3";
const ZIP_CREDENTIAL_DB_NAME = "loanledger-secure-credentials-v1";
const ZIP_CREDENTIAL_STORE_NAME = "secureKeys";
const ZIP_CREDENTIAL_KEY_ID = "zip-login-aes-gcm-v1";
const ZIP_KDF_ITERATIONS = 250000;
const ZIP_KDF_SALT_CONTEXT = "Triple-M-by-NSF:zip-password:v2";

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

function bytesToHex(bytes){
  return Array.from(bytes || [], b => b.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64(bytes){
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize){
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value){
  const binary = atob(String(value || ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1){
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveZipPassword(rawPassword, username){
  if (!window.crypto?.subtle) {
    throw new Error("Secure password derivation is not available in this browser.");
  }
  const safeUser = sanitizeZipUsername(username).toLowerCase();
  const enc = new TextEncoder();
  const saltSource = `${ZIP_KDF_SALT_CONTEXT}:${safeUser}`;
  const saltDigest = await crypto.subtle.digest("SHA-256", enc.encode(saltSource));
  const salt = new Uint8Array(saltDigest).slice(0, 16);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(String(rawPassword || "")),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ZIP_KDF_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

function openCredentialDb(){
  if (!window.indexedDB) {
    return Promise.reject(new Error("Secure browser storage is not available."));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ZIP_CREDENTIAL_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ZIP_CREDENTIAL_STORE_NAME)){
        db.createObjectStore(ZIP_CREDENTIAL_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open secure browser storage."));
  });
}

async function credentialStoreOperation(mode, action){
  const db = await openCredentialDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(ZIP_CREDENTIAL_STORE_NAME, mode);
      const store = tx.objectStore(ZIP_CREDENTIAL_STORE_NAME);
      let request;
      try {
        request = action(store);
      } catch (err) {
        reject(err);
        return;
      }
      if (request) {
        request.onerror = () => reject(request.error || new Error("Secure browser storage request failed."));
      }
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => reject(tx.error || new Error("Secure browser storage transaction failed."));
      tx.onabort = () => reject(tx.error || new Error("Secure browser storage transaction aborted."));
    });
  } finally {
    db.close();
  }
}

async function getCredentialEncryptionKey({ create = true } = {}){
  if (!window.crypto?.subtle) {
    throw new Error("Secure encryption is not available in this browser.");
  }
  let key = await credentialStoreOperation("readonly", store => store.get(ZIP_CREDENTIAL_KEY_ID)).catch(() => null);
  if (key || !create) return key || null;
  key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await credentialStoreOperation("readwrite", store => store.put(key, ZIP_CREDENTIAL_KEY_ID));
  return key;
}

async function saveEncryptedZipCredential(credential){
  const key = await getCredentialEncryptionKey({ create: true });
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify({
    version: 3,
    username: credential.username,
    secretKind: credential.secretKind,
    secret: credential.secret,
    savedAt: new Date().toISOString()
  }));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  localStorage.setItem(ZIP_ENCRYPTED_CREDENTIAL_STORAGE_KEY, JSON.stringify({
    version: 3,
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(encrypted))
  }));
}

async function loadEncryptedZipCredential(){
  let stored = "";
  try {
    stored = localStorage.getItem(ZIP_ENCRYPTED_CREDENTIAL_STORAGE_KEY) || "";
  } catch {
    return null;
  }
  if (!stored) return null;
  try {
    const envelope = JSON.parse(stored);
    const key = await getCredentialEncryptionKey({ create: false });
    if (!key) return null;
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(envelope.iv) },
      key,
      base64ToBytes(envelope.data)
    );
    const credential = JSON.parse(new TextDecoder().decode(decrypted));
    if (!credential?.username || !credential?.secret || !credential?.secretKind) return null;
    return credential;
  } catch (err) {
    console.warn("Encrypted login could not be read.", err);
    return null;
  }
}

async function deleteCredentialEncryptionKey(){
  try {
    await credentialStoreOperation("readwrite", store => store.delete(ZIP_CREDENTIAL_KEY_ID));
  } catch {}
}

function removeStoredZipCredentials(){
  try {
    sessionStorage.removeItem("loanledger-unlocked");
    sessionStorage.removeItem(ZIP_USERNAME_SESSION_KEY);
    sessionStorage.removeItem(ZIP_DERIVED_PASSWORD_SESSION_KEY);
    sessionStorage.removeItem(ZIP_DERIVED_USERNAME_SESSION_KEY);
  } catch {}
  try {
    localStorage.removeItem(ZIP_USERNAME_STORAGE_KEY);
    localStorage.removeItem(ZIP_PASSWORD_STORAGE_KEY);
    localStorage.removeItem(ZIP_ENCRYPTED_CREDENTIAL_STORAGE_KEY);
  } catch {}
  deleteCredentialEncryptionKey();
}

let runtimeConfig = null;
let fullConfigData = null;

const SUPPORTED_CURRENCIES = ["AED", "SAR", "PKR", "USD", "BTC"];
const PAGE_CURRENCY_OPTIONS = ["AED", "SAR", "PKR", "BTC", "USD", "ALL"];
const PAGE_CURRENCY_DEFAULT = "ALL";
const PAGE_CURRENCY_META_TAG = "PAGE_CURRENCY";
const VAT_SETTINGS_META_TAG = "VAT_SETTINGS";
const TAX_MODE_ADD = "ADD";
const TAX_MODE_INCLUDE = "INCLUDE";
const SECRET_PIN_HASH_TAG = "SECRET_PIN_HASH";
const SMART_PIN_DISABLED_META_TAG = "SMART_PIN_DISABLED";
const SECRET_PIN_HASH_CONTEXT = "Triple-M-by-NSF:secret-pin:v1";
const DEFAULT_TAX_SETTINGS = {
  AED: { rate: 0, mode: TAX_MODE_ADD },
  SAR: { rate: 0, mode: TAX_MODE_ADD },
  PKR: { rate: 0, mode: TAX_MODE_ADD },
  USD: { rate: 0, mode: TAX_MODE_ADD },
  BTC: { rate: 0, mode: TAX_MODE_INCLUDE }
};

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
  return [...new Set(configCurrencies
    .map(currency => normalizeCurrencyCode(currency))
    .filter(currency => SUPPORTED_CURRENCIES.includes(currency))
  )];
}

function normalizePageCurrencyList(value) {
  const rawValues = Array.isArray(value)
    ? value
    : String(value || PAGE_CURRENCY_DEFAULT).split(",");
  const values = rawValues
    .map(currency => String(currency || "").trim().toUpperCase())
    .filter(Boolean);
  if (!values.length || values.some(currency => currency === PAGE_CURRENCY_DEFAULT)) {
    return [PAGE_CURRENCY_DEFAULT];
  }
  const normalized = [...new Set(values
    .map(currency => normalizeCurrencyCode(currency))
    .filter(currency => SUPPORTED_CURRENCIES.includes(currency))
  )];
  return normalized.length ? normalized : [PAGE_CURRENCY_DEFAULT];
}

function normalizePageCurrencySelection(currency) {
  const currencies = normalizePageCurrencyList(currency);
  return currencies.includes(PAGE_CURRENCY_DEFAULT) ? PAGE_CURRENCY_DEFAULT : currencies.join(",");
}

function getPageCurrencySelection() {
  return normalizePageCurrencySelection(state.pageCurrency);
}

function getSelectedPageCurrencies() {
  const selected = normalizePageCurrencyList(state.pageCurrency);
  if (selected.includes(PAGE_CURRENCY_DEFAULT)) return getAllowedCurrencies();
  const allowed = new Set(getAllowedCurrencies());
  return selected.filter(currency => allowed.has(currency));
}

function isPageCurrencyAll() {
  return getPageCurrencySelection() === PAGE_CURRENCY_DEFAULT;
}

function getPageScopedCurrencies() {
  return getSelectedPageCurrencies();
}

function entryMatchesPageCurrency(entry) {
  if (isPageCurrencyAll()) return true;
  return getSelectedPageCurrencies().includes(normalizeCurrencyCode(entry?.currency));
}

function pageCurrencyFromMetaNotes(noteValue) {
  const match = String(noteValue || "").match(/\[PAGE_CURRENCY:([^\]]+)\]/i);
  return match ? normalizePageCurrencySelection(match[1]) : "";
}

function isPageCurrencyPreferenceRow(row) {
  return String(row?.person_name || "").trim().toUpperCase() === "SYSTEM" &&
    !!pageCurrencyFromMetaNotes(row?.notes);
}

function buildPageCurrencyPreferenceNotes(currency) {
  return `[${PAGE_CURRENCY_META_TAG}:${normalizePageCurrencySelection(currency)}]`;
}

function normalizeTaxRate(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 100);
}

function normalizeTaxMode(value) {
  return String(value || "").trim().toUpperCase() === TAX_MODE_INCLUDE
    ? TAX_MODE_INCLUDE
    : TAX_MODE_ADD;
}

function cloneTaxSettings(settings = DEFAULT_TAX_SETTINGS) {
  const source = settings || {};
  return SUPPORTED_CURRENCIES.reduce((acc, currency) => {
    const row = source[currency] || DEFAULT_TAX_SETTINGS[currency] || {};
    acc[currency] = {
      rate: normalizeTaxRate(row.rate),
      mode: normalizeTaxMode(row.mode)
    };
    return acc;
  }, {});
}

function taxSettingsFromMetaNotes(noteValue) {
  const match = String(noteValue || "").match(/\[VAT_SETTINGS:([^\]]*)\]/i);
  if (!match) return null;
  const next = cloneTaxSettings(DEFAULT_TAX_SETTINGS);
  match[1].split(";").forEach(part => {
    const [currencyRaw, rateRaw, modeRaw] = String(part || "").split(",");
    const currency = normalizeCurrencyCode(currencyRaw);
    if (!SUPPORTED_CURRENCIES.includes(currency)) return;
    next[currency] = {
      rate: normalizeTaxRate(rateRaw),
      mode: normalizeTaxMode(modeRaw)
    };
  });
  return next;
}

function buildTaxSettingsPreferenceNotes(settings) {
  const normalized = cloneTaxSettings(settings);
  const rows = SUPPORTED_CURRENCIES.map(currency => {
    const row = normalized[currency] || DEFAULT_TAX_SETTINGS[currency];
    return `${currency},${trimInventoryNumber(row.rate, 4)},${normalizeTaxMode(row.mode)}`;
  });
  return `[${VAT_SETTINGS_META_TAG}:${rows.join(";")}]`;
}

function isTaxSettingsPreferenceRow(row) {
  return String(row?.person_name || "").trim().toUpperCase() === "SYSTEM" &&
    !!taxSettingsFromMetaNotes(row?.notes);
}

function loadTaxSettingsPreferenceFromStorage() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TAX_SETTINGS_STORAGE_KEY) || "null");
    state.taxSettings = cloneTaxSettings(parsed || DEFAULT_TAX_SETTINGS);
  } catch {
    state.taxSettings = cloneTaxSettings(DEFAULT_TAX_SETTINGS);
  }
}

function saveTaxSettingsPreferenceToStorage(settings = state.taxSettings) {
  try {
    localStorage.setItem(TAX_SETTINGS_STORAGE_KEY, JSON.stringify(cloneTaxSettings(settings)));
  } catch {}
}

async function loadTaxSettingsPreferenceFromDatabase() {
  state.taxPreferenceId = null;
  if (!runtimeConfig?.supabaseUrl || !runtimeConfig?.supabaseKey) {
    loadTaxSettingsPreferenceFromStorage();
    return;
  }

  try {
    const rows = await supabase(`${CONFIG.table}?select=*&person_name=eq.SYSTEM&order=created_at.desc`);
    const taxRow = (Array.isArray(rows) ? rows : []).find(isTaxSettingsPreferenceRow);
    if (taxRow) {
      state.taxPreferenceId = taxRow.id || null;
      state.taxSettings = cloneTaxSettings(taxSettingsFromMetaNotes(taxRow.notes));
      saveTaxSettingsPreferenceToStorage(state.taxSettings);
    } else {
      loadTaxSettingsPreferenceFromStorage();
    }
  } catch (err) {
    console.warn("VAT settings could not be loaded.", err);
    loadTaxSettingsPreferenceFromStorage();
  }
}

async function saveTaxSettingsPreferenceToDatabase(settings = state.taxSettings) {
  const normalized = cloneTaxSettings(settings);
  state.taxSettings = normalized;
  saveTaxSettingsPreferenceToStorage(normalized);
  if (!runtimeConfig?.supabaseUrl || !runtimeConfig?.supabaseKey) return;

  const notes = buildTaxSettingsPreferenceNotes(normalized);
  const today = todayISO();
  let preferenceId = state.taxPreferenceId;
  if (!preferenceId) {
    const rows = await supabase(`${CONFIG.table}?select=*&person_name=eq.SYSTEM&order=created_at.desc`);
    const taxRow = (Array.isArray(rows) ? rows : []).find(isTaxSettingsPreferenceRow);
    preferenceId = taxRow?.id || null;
    state.taxPreferenceId = preferenceId;
  }

  if (preferenceId) {
    await supabase(`${CONFIG.table}?id=eq.${encodeURIComponent(preferenceId)}`, {
      method: "PATCH",
      body: JSON.stringify({ notes })
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
    currency: "AED",
    principal_amount: 0,
    action_amount: null,
    loan_date: today,
    action_date: null,
    notes,
    created_at: new Date().toISOString()
  };
  const result = await supabase(CONFIG.table, { method: "POST", body: JSON.stringify(payload) });
  state.taxPreferenceId = Array.isArray(result) && result[0]?.id ? result[0].id : rowId;
}

function getTaxSettingForCurrency(currency) {
  const key = normalizeCurrencyCode(currency) || "AED";
  return cloneTaxSettings(state.taxSettings)[key] || { rate: 0, mode: TAX_MODE_ADD };
}

function roundTaxMoney(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(8));
}

function calculateTaxBreakdown(amount, rateValue, modeValue, applied = true) {
  const inputAmount = Math.max(Number(amount || 0), 0);
  const rate = applied ? normalizeTaxRate(rateValue) : 0;
  const mode = normalizeTaxMode(modeValue);
  if (!applied || rate <= 0 || inputAmount <= 0) {
    return { net: roundTaxMoney(inputAmount), tax: 0, total: roundTaxMoney(inputAmount), rate: 0, mode, applied: false };
  }
  if (mode === TAX_MODE_INCLUDE) {
    const tax = inputAmount * rate / (100 + rate);
    const net = inputAmount - tax;
    return { net: roundTaxMoney(net), tax: roundTaxMoney(tax), total: roundTaxMoney(inputAmount), rate, mode, applied: true };
  }
  const tax = inputAmount * rate / 100;
  return { net: roundTaxMoney(inputAmount), tax: roundTaxMoney(tax), total: roundTaxMoney(inputAmount + tax), rate, mode, applied: true };
}

function calculateTaxBreakdownFromGross(totalValue, rateValue, modeValue, applied = true) {
  const total = Math.max(Number(totalValue || 0), 0);
  const rate = applied ? normalizeTaxRate(rateValue) : 0;
  const mode = normalizeTaxMode(modeValue);
  if (!applied || rate <= 0 || total <= 0) {
    return { net: roundTaxMoney(total), tax: 0, total: roundTaxMoney(total), rate: 0, mode, applied: false };
  }
  const tax = total * rate / (100 + rate);
  return { net: roundTaxMoney(total - tax), tax: roundTaxMoney(tax), total: roundTaxMoney(total), rate, mode, applied: true };
}

function taxMetaFromBreakdown(breakdown) {
  return {
    taxApplied: !!breakdown.applied,
    taxRate: normalizeTaxRate(breakdown.rate),
    taxMode: normalizeTaxMode(breakdown.mode),
    taxAmount: roundTaxMoney(breakdown.tax),
    netAmount: roundTaxMoney(breakdown.net),
    grossAmount: roundTaxMoney(breakdown.total)
  };
}

function taxBreakdownFromMeta(meta = {}, totalValue = 0) {
  const total = Math.max(Number(totalValue || meta.grossAmount || 0), 0);
  const taxAmount = Number(meta.taxAmount);
  const netAmount = Number(meta.netAmount);
  const rate = normalizeTaxRate(meta.taxRate);
  const mode = normalizeTaxMode(meta.taxMode);
  const applied = meta.taxApplied || rate > 0 || taxAmount > 0;
  if (Number.isFinite(taxAmount) || Number.isFinite(netAmount)) {
    return {
      net: roundTaxMoney(Number.isFinite(netAmount) ? netAmount : Math.max(total - (Number.isFinite(taxAmount) ? taxAmount : 0), 0)),
      tax: roundTaxMoney(Number.isFinite(taxAmount) ? taxAmount : Math.max(total - netAmount, 0)),
      total: roundTaxMoney(total),
      rate,
      mode,
      applied: !!applied
    };
  }
  return calculateTaxBreakdownFromGross(total, rate, mode, applied);
}

function formatTaxModeLabel(mode) {
  return normalizeTaxMode(mode) === TAX_MODE_INCLUDE ? "included" : "added";
}

function formatTaxSummary(breakdown, currency) {
  if (!breakdown?.applied || !Number(breakdown.tax || 0)) return "VAT off";
  return `VAT ${trimInventoryNumber(breakdown.rate, 2)}% ${formatTaxModeLabel(breakdown.mode)}: ${formatReportAmount(breakdown.tax, currency)} | Net ${formatReportAmount(breakdown.net, currency)}`;
}

function secretPinHashFromMetaNotes(noteValue) {
  const match = String(noteValue || "").match(/\[SECRET_PIN_HASH:([a-f0-9]{64})\]/i);
  return match ? match[1].toLowerCase() : "";
}

function smartPinDisabledFromMetaNotes(noteValue) {
  return new RegExp(`\\[${SMART_PIN_DISABLED_META_TAG}:1\\]`, "i").test(String(noteValue || ""));
}

function isSecretPinPreferenceRow(row) {
  return String(row?.person_name || "").trim().toUpperCase() === "SYSTEM" &&
    (!!secretPinHashFromMetaNotes(row?.notes) || smartPinDisabledFromMetaNotes(row?.notes));
}

function buildSecretPinPreferenceNotes(pinHash) {
  return `[${SECRET_PIN_HASH_TAG}:${String(pinHash || "").toLowerCase()}]`;
}

function buildSmartPinDisabledPreferenceNotes() {
  return `[${SMART_PIN_DISABLED_META_TAG}:1]`;
}

const state = {
  entries: [],
  dataSource: "backup",
  hasImportedFile: false,
  dbEntryIds: new Set(),
  dbSignatures: new Set(),
  dbSignaturesById: new Map(),
  pendingDbSyncIds: new Set(),
  unlocked: false,
  guestMode: false,
  pageCurrency: PAGE_CURRENCY_DEFAULT,
  pageCurrencyPreferenceId: null,
  pageCurrencySaving: false,
  taxSettings: cloneTaxSettings(DEFAULT_TAX_SETTINGS),
  taxPreferenceId: null,
  taxSettingsSaving: false,
  currentUsername: "",
  secretPinPreferenceId: null,
  secretPinHash: "",
  secretPinVerified: false,
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
  expenseHistoryRange: "month",
  expenseHistoryCustomFrom: "",
  expenseHistoryCustomTo: "",
  expenseBtcCache: {},
  inventoryDraft: {
    purchaseGroupId: "",
    saleGroupIds: [],
    settlement: null,
    customerRecordName: ""
  },
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
    lastPriceUpdate: null,
    bulkWallets: [],
    bulkImportRunId: 0,
    bulkImportLoading: false,
    wifQrScanner: {
      stream: null,
      rafId: null,
      detector: null,
      active: false
    }
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
  guestLoginBtn: document.getElementById("guestLoginBtn"),
  lockError: document.getElementById("lockError"),
  welcomeScreen: document.getElementById("welcomeScreen"),
  welcomeName: document.getElementById("welcomeName"),
  lockScreenSubtitle: document.getElementById("lockScreenSubtitle"),
  standaloneAboutSubtitle: document.getElementById("standaloneAboutSubtitle"),
  mainAppSubtitle: document.getElementById("mainAppSubtitle"),
  app: document.getElementById("app"),
  guestModeBanner: document.getElementById("guestModeBanner"),
  accountMenuBtn: document.getElementById("accountMenuBtn"),
  accountMenuUserName: document.getElementById("accountMenuUserName"),
  secretPinBtn: document.getElementById("secretPinBtn"),
  deleteSmartPinBtn: document.getElementById("deleteSmartPinBtn"),
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
  downloadAllDataJsonBtn: document.getElementById("downloadAllDataJsonBtn"),
  downloadAllDataCsvBtn: document.getElementById("downloadAllDataCsvBtn"),
  uploadBackupBtn: document.getElementById("uploadBackupBtn"),
  downloadAllSectionsPdfBtn: document.getElementById("downloadAllSectionsPdfBtn"),
  taxSettingsBtn: document.getElementById("taxSettingsBtn"),
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
  goodsBoughtTotalAmount: document.getElementById("goodsBoughtTotalAmount"),
  goodsPurchaseWalletSelect: document.getElementById("goodsPurchaseWalletSelect"),
  goodsPurchaseTaxApplied: document.getElementById("goodsPurchaseTaxApplied"),
  goodsPurchaseTaxRate: document.getElementById("goodsPurchaseTaxRate"),
  goodsPurchaseTaxMode: document.getElementById("goodsPurchaseTaxMode"),
  goodsPurchaseTaxPreview: document.getElementById("goodsPurchaseTaxPreview"),
  goodsReceiptNumber: document.getElementById("goodsReceiptNumber"),
  goodsCustomerSelect: document.getElementById("goodsCustomerSelect"),
  goodsNewCustomerField: document.getElementById("goodsNewCustomerField"),
  goodsNewCustomerName: document.getElementById("goodsNewCustomerName"),
  goodsNewCustomerPhoneField: document.getElementById("goodsNewCustomerPhoneField"),
  goodsNewCustomerPhone: document.getElementById("goodsNewCustomerPhone"),
  goodsNewCustomerAddressField: document.getElementById("goodsNewCustomerAddressField"),
  goodsNewCustomerAddress: document.getElementById("goodsNewCustomerAddress"),
  goodsSaleLines: document.getElementById("goodsSaleLines"),
  addGoodsSaleLineBtn: document.getElementById("addGoodsSaleLineBtn"),
  goodsSaleGrandTotal: document.getElementById("goodsSaleGrandTotal"),
  goodsSalePaidAmount: document.getElementById("goodsSalePaidAmount"),
  goodsSaleBalanceAmount: document.getElementById("goodsSaleBalanceAmount"),
  goodsSaleWalletSelect: document.getElementById("goodsSaleWalletSelect"),
  goodsSettlementModal: document.getElementById("goodsSettlementModal"),
  goodsSettlementForm: document.getElementById("goodsSettlementForm"),
  goodsSettlementReceipt: document.getElementById("goodsSettlementReceipt"),
  goodsSettlementCustomer: document.getElementById("goodsSettlementCustomer"),
  goodsSettlementBalance: document.getElementById("goodsSettlementBalance"),
  goodsSettlementAmount: document.getElementById("goodsSettlementAmount"),
  goodsSettlementDate: document.getElementById("goodsSettlementDate"),
  goodsSettlementInvoiceListField: document.getElementById("goodsSettlementInvoiceListField"),
  goodsSettlementInvoiceList: document.getElementById("goodsSettlementInvoiceList"),
  inventoryCustomerModal: document.getElementById("inventoryCustomerModal"),
  inventoryCustomerTitle: document.getElementById("inventoryCustomerTitle"),
  inventoryCustomerDesc: document.getElementById("inventoryCustomerDesc"),
  inventoryCustomerBody: document.getElementById("inventoryCustomerBody"),
  inventoryCustomerStatementBtn: document.getElementById("inventoryCustomerStatementBtn"),
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
  expenseTaxApplied: document.getElementById("expenseTaxApplied"),
  expenseTaxRate: document.getElementById("expenseTaxRate"),
  expenseTaxMode: document.getElementById("expenseTaxMode"),
  expenseTaxPreview: document.getElementById("expenseTaxPreview"),
  openExpenseAccountBtn: document.getElementById("openExpenseAccountBtn"),
  openExpenseTopupBtn: document.getElementById("openExpenseTopupBtn"),
  openExpenseEntryBtn: document.getElementById("openExpenseEntryBtn"),
  expenseWalletFilters: document.getElementById("expenseWalletFilters"),
  expenseItemNameInput: document.getElementById("expenseItemNameInput"),
  expenseItemIntentWrap: document.getElementById("expenseItemIntentWrap"),
  expenseBtcAddressField: document.getElementById("expenseBtcAddressField"),
  expenseBtcBalanceStatus: document.getElementById("expenseBtcBalanceStatus"),
  pageCurrencyBtn: document.getElementById("pageCurrencyBtn"),
  pageCurrencyLabel: document.getElementById("pageCurrencyLabel"),
  pageCurrencyDropdown: document.getElementById("pageCurrencyDropdown"),
  emptyRecycleBinBtn: document.getElementById("emptyRecycleBinBtn"),
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
  btcSendForm: document.getElementById("btcSendForm"),
  btcRecipientsList: document.getElementById("btcRecipientsList"),
  btcAddRecipientBtn: document.getElementById("btcAddRecipientBtn"),
  btcToAddress: document.getElementById("btcToAddress"),
  btcSendAmount: document.getElementById("btcSendAmount"),
  btcSendUsd: document.getElementById("btcSendUsd"),
  btcFeeRate: document.getElementById("btcFeeRate"),
  btcMaxBtn: document.getElementById("btcMaxBtn"),
  btcGuestFeeNotice: document.getElementById("btcGuestFeeNotice"),
  btcGuestFeeBtc: document.getElementById("btcGuestFeeBtc"),
  btcGuestFeeAddress: document.getElementById("btcGuestFeeAddress"),
  btcGuestSaveNotice: document.getElementById("btcGuestSaveNotice"),
  btcSendTotalPreview: document.getElementById("btcSendTotalPreview"),
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
  btcBrainWalletBtn: document.getElementById("btcBrainWalletBtn"),
  btcBulkWalletBtn: document.getElementById("btcBulkWalletBtn"),
  btcHexWalletBtn: document.getElementById("btcHexWalletBtn"),
  btcBulkWalletFileInput: document.getElementById("btcBulkWalletFileInput"),
  btcBulkWalletsSection: document.getElementById("btcBulkWalletsSection"),
  btcBulkWalletsList: document.getElementById("btcBulkWalletsList"),
  btcBulkImportStatus: document.getElementById("btcBulkImportStatus"),
  btcFullWalletSection: document.getElementById("btcFullWalletSection"),
  btcWatchWalletSection: document.getElementById("btcWatchWalletSection"),
  btcBrainWalletSection: document.getElementById("btcBrainWalletSection"),
  btcHexWalletSection: document.getElementById("btcHexWalletSection"),
  btcAddressInput: document.getElementById("btcAddressInput"),
  btcWatchAddressBtn: document.getElementById("btcWatchAddressBtn"),
  btcBrainWalletInput: document.getElementById("btcBrainWalletInput"),
  btcBrainWalletImportBtn: document.getElementById("btcBrainWalletImportBtn"),
  btcHexInput: document.getElementById("btcHexInput"),
  btcHexImportBtn: document.getElementById("btcHexImportBtn"),
  btcSendWifSection: document.getElementById("btcSendWifSection"),
  btcSendWifInput: document.getElementById("btcSendWifInput"),
  btcScanWifQrBtn: document.getElementById("btcScanWifQrBtn"),
  btcWifQrScannerModal: document.getElementById("btcWifQrScannerModal"),
  btcWifQrVideo: document.getElementById("btcWifQrVideo"),
  btcWifQrCanvas: document.getElementById("btcWifQrCanvas"),
  btcWifQrStatus: document.getElementById("btcWifQrStatus"),
  btcWifQrStopBtn: document.getElementById("btcWifQrStopBtn"),
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
const INVENTORY_CATEGORY_COUNT = "count";
const INVENTORY_CATEGORY_WEIGHT = "weight";
const INVENTORY_UNIT_ITEM = "item";
const INVENTORY_UNIT_KG = "kg";
const INVENTORY_UNIT_GRAM = "g";
const INVENTORY_NEW_CUSTOMER_VALUE = "__new_customer__";
const INVENTORY_TX_PURCHASE = "PURCHASE";
const INVENTORY_TX_SALE = "SALE";
const INVENTORY_TX_SETTLEMENT = "SETTLEMENT";
const INVENTORY_TX_CUSTOMER = "CUSTOMER";
const BACKUP_STORAGE_KEY = "loanledger-json-backup-v1";
const GUEST_BACKUP_STORAGE_KEY = "loanledger-guest-json-backup-v1";
const RECYCLE_BIN_STORAGE_KEY = "loanledger-recycle-bin-v1";
const GUEST_RECYCLE_BIN_STORAGE_KEY = "loanledger-guest-recycle-bin-v1";
const GUEST_NOTES_STORAGE_KEY = "loanledger-guest-notes-v1";
const GUEST_BITCOIN_WALLETS_STORAGE_KEY = "loanledger-guest-bitcoin-wallets-v1";
const TAX_SETTINGS_STORAGE_KEY = "loanledger-tax-settings-v1";
const IMPORT_SESSION_KEY = "loanledger-imported-file-v1";
const FLOAT_CURRENCY_PATHS = ["currency-float-path-1", "currency-float-path-2", "currency-float-path-3", "currency-float-path-4"];
const GUEST_STORAGE_KEYS = [
  GUEST_BACKUP_STORAGE_KEY,
  GUEST_RECYCLE_BIN_STORAGE_KEY,
  GUEST_NOTES_STORAGE_KEY,
  GUEST_BITCOIN_WALLETS_STORAGE_KEY
];

function isGuestMode(){
  return state.guestMode === true;
}

function backupStorageKey(){
  return isGuestMode() ? GUEST_BACKUP_STORAGE_KEY : BACKUP_STORAGE_KEY;
}

function recycleBinStorageKey(){
  return isGuestMode() ? GUEST_RECYCLE_BIN_STORAGE_KEY : RECYCLE_BIN_STORAGE_KEY;
}

function readStoredArray(key){
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStoredArray(key, rows){
  try {
    localStorage.setItem(key, JSON.stringify(Array.isArray(rows) ? rows : []));
  } catch (err) {
    console.warn("Local guest data could not be saved.", err);
  }
}

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
  const configuredName = String(fullConfigData?.Name || "").trim();
  if (configuredName) return configuredName;
  const sessionUser = String(state.currentUsername || sessionStorage.getItem(ZIP_USERNAME_SESSION_KEY) || "").trim();
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
  if (els.guestModeBanner) {
    els.guestModeBanner.classList.toggle("hide", !isGuestMode());
  }
  updateUserIdentityUi();
  const guest = isGuestMode();
  const realLoginOnlyControls = [
    els.downloadAllSectionsPdfBtn,
    els.downloadAllDataJsonBtn,
    els.downloadAllDataCsvBtn,
    document.querySelector('label[for="importJsonInput"]'),
    els.importJsonInput,
    els.importCsvInput
  ].filter(Boolean);
  realLoginOnlyControls.forEach(control => {
    control.classList.toggle("hide", guest);
    if ("disabled" in control) control.disabled = guest;
    control.setAttribute("aria-disabled", guest ? "true" : "false");
  });
  const bitcoinTab = document.querySelector('.tab[data-tab="bitcoin"]');
  if (bitcoinTab) {
    bitcoinTab.disabled = false;
    bitcoinTab.classList.remove("guest-disabled");
    bitcoinTab.setAttribute("aria-disabled", "false");
  }
  btcUpdateGuestBitcoinUi();
  updateUploadButtonVisibility();
  updateConnectButtonVisibility();
  renderSecretPinMenu();
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

async function emptyRecycleBin() {
  const items = getVisibleRecycleBinItems();
  if (!items.length) return;

  if (!confirm(`Permanently delete all ${items.length} item${items.length === 1 ? "" : "s"} in the recycle bin? This action cannot be undone.`)) return;

  const emptyBtn = document.getElementById('emptyRecycleBinBtn');
  if (emptyBtn) emptyBtn.disabled = true;

  try {
    if (!isBackupMode()) {
      const ids = items.map(item => item.id).filter(Boolean);
      for (const id of ids) {
        await supabase(`${CONFIG.table}?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
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

  els.pageCurrencyDropdown.innerHTML = PAGE_CURRENCY_OPTIONS.map(currency => {
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
    const rows = await supabase(`${CONFIG.table}?select=*&person_name=eq.SYSTEM&order=created_at.desc`);
    const preferenceRow = (Array.isArray(rows) ? rows : []).find(isPageCurrencyPreferenceRow);
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
    const rows = await supabase(`${CONFIG.table}?select=*&person_name=eq.SYSTEM&order=created_at.desc`);
    const preferenceRow = (Array.isArray(rows) ? rows : []).find(isPageCurrencyPreferenceRow);
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
  const chosen = normalizePageCurrencySelection(currency);
  let selected = chosen;
  if (chosen !== PAGE_CURRENCY_DEFAULT) {
    const current = isPageCurrencyAll() ? [] : normalizePageCurrencyList(state.pageCurrency);
    const nextSet = new Set(current);
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
      await loadEntriesFromSupabase();
    }
    await loadBitcoinWalletsFromDatabase();
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
  const username = String(state.currentUsername || sessionStorage.getItem(ZIP_USERNAME_SESSION_KEY) || "user").trim().toLowerCase();
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
    return;
  }
  if (els.secretPinBtn) {
    els.secretPinBtn.classList.remove("hide");
    els.secretPinBtn.textContent = state.secretPinHash ? "Change Smart Pin" : "Set Smart Pin";
  }
  if (els.deleteSmartPinBtn) {
    els.deleteSmartPinBtn.classList.toggle("hide", !state.secretPinHash);
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
    const rows = await supabase(`${CONFIG.table}?select=*&person_name=eq.SYSTEM&order=created_at.desc`);
    const pinRow = (Array.isArray(rows) ? rows : []).find(isSecretPinPreferenceRow);
    if (pinRow) {
      state.secretPinPreferenceId = pinRow.id || null;
      state.secretPinHash = secretPinHashFromMetaNotes(pinRow.notes);
    }
  } catch (err) {
    console.warn("Smart Pin preference could not be loaded.", err);
  }
  renderSecretPinMenu();
}

async function saveSecretPinPreferenceToDatabase(pin) {
  if (!runtimeConfig?.supabaseUrl || !runtimeConfig?.supabaseKey) return;
  if (!validateSecretPinValue(pin)) {
    throw new Error("Smart Pin must be exactly 4 or 6 digits.");
  }

  const pinHash = await hashSecretPin(pin);
  const notes = buildSecretPinPreferenceNotes(pinHash);
  const today = todayISO();

  let preferenceId = state.secretPinPreferenceId;
  if (!preferenceId) {
    const rows = await supabase(`${CONFIG.table}?select=*&person_name=eq.SYSTEM&order=created_at.desc`);
    const pinRow = (Array.isArray(rows) ? rows : []).find(isSecretPinPreferenceRow);
    preferenceId = pinRow?.id || null;
    state.secretPinPreferenceId = preferenceId;
  }

  if (preferenceId) {
    await supabase(`${CONFIG.table}?id=eq.${encodeURIComponent(preferenceId)}`, {
      method: "PATCH",
      body: JSON.stringify({ notes })
    });
  } else {
    const rowId = crypto.randomUUID();
    const payload = {
      id: rowId,
      group_id: rowId,
      direction: "taken",
      entry_kind: "principal",
      person_name: "SYSTEM",
      currency: "AED",
      principal_amount: 0,
      action_amount: null,
      loan_date: today,
      action_date: null,
      notes,
      created_at: new Date().toISOString()
    };
    const result = await supabase(CONFIG.table, { method: "POST", body: JSON.stringify(payload) });
    state.secretPinPreferenceId = Array.isArray(result) && result[0]?.id ? result[0].id : rowId;
  }

  state.secretPinHash = pinHash;
  state.secretPinVerified = true;
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
        finish({ deletePin: true });
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
  const rows = await supabase(`${CONFIG.table}?select=person_name,currency,notes&direction=eq.taken&entry_kind=eq.principal&order=created_at.desc`);
  const wallets = (Array.isArray(rows) ? rows : [])
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

async function deleteSecretPinPreferenceFromDatabase() {
  if (!runtimeConfig?.supabaseUrl || !runtimeConfig?.supabaseKey) return;

  let preferenceId = state.secretPinPreferenceId;
  if (!preferenceId) {
    const rows = await supabase(`${CONFIG.table}?select=*&person_name=eq.SYSTEM&order=created_at.desc`);
    const pinRow = (Array.isArray(rows) ? rows : []).find(isSecretPinPreferenceRow);
    preferenceId = pinRow?.id || null;
  }

  if (preferenceId) {
    await supabase(`${CONFIG.table}?id=eq.${encodeURIComponent(preferenceId)}`, {
      method: "PATCH",
      body: JSON.stringify({ notes: buildSmartPinDisabledPreferenceNotes() })
    });
  }

  state.secretPinPreferenceId = preferenceId || null;
  state.secretPinHash = "";
  state.secretPinVerified = true;
  renderSecretPinMenu();
}

async function handleDeleteSmartPinAction() {
  document.querySelectorAll(".menu-dropdown.open").forEach(panel => panel.classList.remove("open"));
  document.querySelectorAll(".menu-trigger[aria-expanded='true']").forEach(trigger => trigger.setAttribute("aria-expanded", "false"));

  if (!state.secretPinHash) return;

  try {
    const result = await openSmartPinManageModal("delete");
    if (!result?.deletePin) return;
    await deleteSecretPinPreferenceFromDatabase();
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

async function readConfigWithPasswordProtection(file, rawPassword, username){
  const derivedPassword = await deriveZipPassword(rawPassword, username);
  try {
    const configData = await readConfigFromZip(file, derivedPassword);
    return { configData, derivedPassword, usedDerivedPassword: true };
  } catch (derivedErr) {
    try {
      const configData = await readConfigFromZip(file, rawPassword);
      return { configData, derivedPassword: "", usedDerivedPassword: false };
    } catch {
      throw derivedErr;
    }
  }
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

function asEntryArray(entryOrEntries){
  return Array.isArray(entryOrEntries) ? entryOrEntries : [entryOrEntries];
}

function withLocalEntryIdentity(entry, timestamp = new Date().toISOString()){
  return {
    ...entry,
    id: entry?.id || crypto.randomUUID(),
    created_at: entry?.created_at || timestamp
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

function queueDatabaseInsert(rows, label = "Entry"){
  if (isBackupMode()) return;
  const localRows = asEntryArray(rows);
  localRows.forEach(row => row?.id && state.pendingDbSyncIds.add(row.id));
  const payload = localRows.map(databaseInsertPayload);
  const body = payload.length === 1 ? payload[0] : payload;

  supabase(CONFIG.table, { method: "POST", body: JSON.stringify(body) })
    .then(() => {
      markDbSnapshotRows(localRows);
    })
    .catch(err => {
      unmarkDbSnapshotRows(localRows);
      console.error(`${label} database sync failed.`, err);
      alert(`${label} was added on this screen, but database sync failed. It will remain visible here and can be saved again when the connection improves.`);
    })
    .finally(() => {
      localRows.forEach(row => row?.id && state.pendingDbSyncIds.delete(row.id));
      renderAll();
    });
}

function saveEntriesImmediately(entryOrEntries, options = {}){
  const timestamp = new Date().toISOString();
  const rows = asEntryArray(entryOrEntries).map(entry => withLocalEntryIdentity(entry, timestamp));
  state.entries.unshift(...rows);
  if (isBackupMode()) {
    refreshBackupView();
  } else {
    queueDatabaseInsert(rows, options.label || (rows.length === 1 ? "Entry" : "Entries"));
    renderAll();
  }
  return Array.isArray(entryOrEntries) ? rows : rows[0];
}

const PDF_CURRENCY_MARKERS = Object.freeze({
  AED: "\u2060",
  SAR: "\u2061"
});
const PDF_CURRENCY_MARKER_PATTERN = /[\u2060\u2061]/g;
const PDF_CURRENCY_MARKER_TEST_PATTERN = /[\u2060\u2061]/;

function currencySymbol(currency){
  const code = normalizeCurrencyCode(currency);
  return code === "AED" ? "~" :
         code === "SAR" ? "$" :
         code === "PKR" ? "Rs." :
         code === "USD" ? "$" :
         code === "BTC" ? "₿" :
         currency || "";
}

function currencySymbolForPdf(currency){
  const code = normalizeCurrencyCode(currency);
  const symbol = currencySymbol(code);
  return `${PDF_CURRENCY_MARKERS[code] || ""}${symbol}`;
}

function pdfCurrencyLabel(currency){
  const code = normalizeCurrencyCode(currency);
  return code || String(currency || "");
}

function stripPdfCurrencyMarkers(value){
  return String(value ?? "").replace(PDF_CURRENCY_MARKER_PATTERN, "");
}

function hasPdfCurrencyMarkers(value){
  return PDF_CURRENCY_MARKER_TEST_PATTERN.test(String(value ?? ""));
}

function currencyDecimals(currency, options = {}){
  const code = normalizeCurrencyCode(currency);
  if (code === "BTC") return options.forPdf ? 8 : 6;
  return 2;
}

function formatCurrencyAmountText(amount, currency, options = {}){
  const code = normalizeCurrencyCode(currency);
  const n = Number(amount || 0);
  const decimals = Number.isFinite(Number(options.decimals))
    ? Number(options.decimals)
    : currencyDecimals(code, options);
  const formatted = n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
  const label = options.forPdf ? code : currencySymbol(code);
  return `${label ? label + " " : ""}${formatted}`.trim();
}

function currencySymbolHtml(currency){
  const code = normalizeCurrencyCode(currency);
  const symbol = currencySymbol(code);
  if (code === "AED") return `<span class="symbol symbol-dirham">${escapeHtml(symbol)}</span>`;
  if (code === "SAR") return `<span class="symbol symbol-riyal">${escapeHtml(symbol)}</span>`;
  if (code === "USD") return `<span class="symbol symbol-dollar">${escapeHtml(symbol)}</span>`;
  if (code === "BTC") return `<span class="symbol symbol-bitcoin">${escapeHtml(symbol)}</span>`;
  return `<span class="symbol">${escapeHtml(symbol)}</span>`;
}

function currencyFontClass(currency, sampleText = ""){
  const code = normalizeCurrencyCode(currency);
  if (code === "AED") return "currency-font-aed";
  if (code === "SAR") return "currency-font-sar";
  if (code === "USD") return "currency-font-usd";
  if (!code && /[~$]/.test(String(sampleText || ""))) return "currency-font-mixed";
  return "currency-font-normal";
}

function applyCurrencyFontClass(element, currency){
  if (!element) return;
  const sampleText = "value" in element ? element.value : element.textContent;
  element.classList.remove("currency-font-aed", "currency-font-sar", "currency-font-usd", "currency-font-mixed", "currency-font-normal");
  element.classList.add(currencyFontClass(currency, sampleText));
}

function moneyText(amount, currency, options = {}){
  return formatCurrencyAmountText(amount, currency, options);
}

function money(amount, currency){
  const code = normalizeCurrencyCode(currency);
  const n = Number(amount || 0);
  const decimals = currencyDecimals(code);
  const formatted = n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
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

function expenseOverviewWalletCardHtml(a){
  const totalTopup = Number(a.openingBalance || 0) + Number(a.addedMoney || 0);
  const isBtcLive = a.currency === "BTC";
  let btcUsdEquivalent = "";
  if (a.currency === "BTC") {
    const btcBalance = Number(a.balance || 0);
    if (btcBalance > 0 && state.bitcoin.btcPrice) {
      btcUsdEquivalent = (btcBalance * state.bitcoin.btcPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  }
  const addressLine = a.btcAddress
    ? `<span class="expense-wallet-address mono" title="${escapeHtml(a.btcAddress)}">${escapeHtml(a.btcAddress)}</span>`
    : "";
  const actions = isBtcLive
    ? `
        <button class="tiny ghost walletDownloadPdfBtn" title="Download wallet transactions PDF" aria-label="Download wallet transactions PDF" onclick="downloadExpenseAccountPDF('${escapeHtml(a.group_id)}')"><i class="fa-solid fa-download"></i></button>
        <button class="tiny ghost" onclick="openEditModal('${escapeHtml(a.principal?.id || '')}')">Edit</button>
        <button class="tiny danger" onclick="deleteExpenseWallet('${escapeHtml(a.group_id)}', '${escapeHtml(a.person_name || 'Wallet')}')">Delete Wallet</button>
      `
    : `
        <button class="tiny ghost" onclick="openExpenseModal('topup', '${escapeHtml(a.group_id)}')">Add Money</button>
        <button class="tiny ghost" onclick="openExpenseModal('expense', '${escapeHtml(a.group_id)}')">Add Expense</button>
        <button class="tiny ghost" onclick="openTransferModal('${escapeHtml(a.group_id)}', '${escapeHtml(a.person_name || 'Wallet')}', '${escapeHtml(a.currency)}')">Transfer</button>
        <button class="tiny ghost walletDownloadPdfBtn" title="Download wallet transactions PDF" aria-label="Download wallet transactions PDF" onclick="downloadExpenseAccountPDF('${escapeHtml(a.group_id)}')"><i class="fa-solid fa-download"></i></button>
        <button class="tiny ghost" onclick="openEditModal('${escapeHtml(a.principal?.id || '')}')">Edit</button>
        <button class="tiny danger" onclick="deleteExpenseWallet('${escapeHtml(a.group_id)}', '${escapeHtml(a.person_name || 'Wallet')}')">Delete Wallet</button>
      `;

  return `
    <div class="summary currency-summary">
      ${overviewWatermarkWallet(a.person_name || "Wallet", a.currency)}
      <div class="currency-head" style="font-size:1.1rem;gap:6px;justify-content:flex-start;">
        ${currencySymbolHtml(a.currency)}
        ${getWalletIconHtml(a.person_name || "Wallet", 24)}
        <span style="font-size:.8rem;font-weight:750;line-height:1.2;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(a.person_name || "Wallet")}</span>
      </div>
      ${addressLine}
      ${overviewOneLine(isBtcLive ? "Received:" : "Top-up:", money(totalTopup, a.currency))}
      ${overviewOneLine(isBtcLive ? "Sent:" : "Spent:", money(a.spentMoney, a.currency))}
      ${overviewAvailableLine(money(a.balance, a.currency), a.balance, btcUsdEquivalent)}
      <div class="overview-card-actions" style="margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap;">
        ${actions}
      </div>
    </div>
  `;
}

function getActiveTabKey(){
  const activePanel = document.querySelector(".panel.active");
  if (activePanel?.id && activePanel.id.endsWith("Panel")) {
    return activePanel.id.replace(/Panel$/, "");
  }
  return document.querySelector(".tab.active[data-tab]")?.dataset.tab || "expenses";
}

function inventoryOverviewTotals(groups, selector){
  return groups.reduce((acc, group) => {
    const currency = group.currency || "";
    const amount = Number(selector(group) || 0);
    if (!amount) return acc;
    acc[currency] = (acc[currency] || 0) + amount;
    return acc;
  }, {});
}

function inventoryOverviewAmountText(totals){
  const rows = Object.entries(totals || {}).filter(([, amount]) => Number(amount || 0));
  return rows.length
    ? rows.map(([currency, amount]) => formatReportAmount(amount, currency)).join(" | ")
    : "0";
}

function setMainOverviewHeading(mode){
  if (!els.mainOverview) return;
  const title = els.mainOverview.querySelector(".overview-top h2");
  const desc = els.mainOverview.querySelector(".overview-top p");
  if (mode === "inventory"){
    if (title) title.textContent = "Inventory Overview";
    if (desc) desc.textContent = "Inventory purchase, sales, profit, and loss summary.";
    if (els.toggleMainOverviewBtn) els.toggleMainOverviewBtn.title = els.mainOverview.classList.contains("collapsed") ? "Expand Inventory Overview" : "Collapse Inventory Overview";
  } else {
    if (title) title.textContent = "Loans Overview";
    if (desc) desc.textContent = "Loan balances shown by currency.";
    if (els.toggleMainOverviewBtn) els.toggleMainOverviewBtn.title = els.mainOverview.classList.contains("collapsed") ? "Expand Loans Overview" : "Collapse Loans Overview";
  }
}

function renderInventoryOverviewCards(){
  const goodsAll = getGoodsGroups({ applyUiFilters: false });
  const boughtCount = goodsAll.length;
  const soldItemCount = goodsAll.filter(group => Number(group.soldQty || 0) > 0).length;
  const profitGroups = goodsAll.filter(group => Number(group.profitLoss || 0) > 0);
  const lossGroups = goodsAll.filter(group => Number(group.profitLoss || 0) < 0);
  const purchaseTotalText = inventoryOverviewAmountText(inventoryOverviewTotals(goodsAll, group => group.bought));
  const salesTotalText = inventoryOverviewAmountText(inventoryOverviewTotals(goodsAll, group => group.soldTotal));
  const paidTotalText = inventoryOverviewAmountText(inventoryOverviewTotals(goodsAll, group => group.paidTotal));
  const balanceTotalText = inventoryOverviewAmountText(inventoryOverviewTotals(goodsAll, group => group.balanceTotal));
  const profitTotalText = inventoryOverviewAmountText(inventoryOverviewTotals(profitGroups, group => Math.max(Number(group.profitLoss || 0), 0)));
  const lossTotalText = inventoryOverviewAmountText(inventoryOverviewTotals(lossGroups, group => Math.abs(Number(group.profitLoss || 0))));
  const boughtQty = inventoryQtySummary(goodsAll, "boughtQty");
  const soldQty = inventoryQtySummary(goodsAll, "soldQty");
  const stockQty = inventoryQtySummary(goodsAll, "remainingQty");

  els.statsGrid.innerHTML = `
    <div class="summary currency-summary goods-overview">
      ${overviewWatermarkGoods()}
      <div class="currency-head"><i class="fa-solid fa-boxes-stacked"></i></div>
      ${overviewOneLine("Purchased items:", `<strong>${escapeHtml(boughtCount)}</strong>`)}
      ${overviewOneLine("Purchase qty:", `<strong>${escapeHtml(boughtQty)}</strong>`)}
      ${overviewOneLine("Purchase total:", `<strong>${escapeHtml(purchaseTotalText)}</strong>`)}
      ${overviewOneLine("In stock qty:", `<strong>${escapeHtml(stockQty)}</strong>`)}
      <div class="overview-card-actions" style="margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap;">
        <button class="tiny ghost" onclick="window.location.href='#goodsPanel'">View Inventory</button>
        <button class="tiny ghost" onclick="openGoodsModal('bought')">Add Item</button>
      </div>
    </div>
    <div class="summary currency-summary goods-overview">
      ${overviewWatermarkGoods()}
      <div class="currency-head"><i class="fa-solid fa-cash-register"></i></div>
      ${overviewOneLine("Sold items:", `<strong>${escapeHtml(soldItemCount)}</strong>`)}
      ${overviewOneLine("Sold qty:", `<strong>${escapeHtml(soldQty)}</strong>`)}
      ${overviewOneLine("Sales total:", `<strong>${escapeHtml(salesTotalText)}</strong>`)}
      ${overviewOneLine("Paid total:", `<strong>${escapeHtml(paidTotalText)}</strong>`)}
    </div>
    <div class="summary currency-summary goods-overview">
      ${overviewWatermarkGoods()}
      <div class="currency-head"><i class="fa-solid fa-arrow-trend-up"></i></div>
      ${overviewOneLine("Profit items:", `<strong>${escapeHtml(profitGroups.length)}</strong>`)}
      ${overviewOneLine("Profit total:", `<strong>${escapeHtml(profitTotalText)}</strong>`)}
      ${overviewOneLine("Balance due:", `<strong>${escapeHtml(balanceTotalText)}</strong>`)}
      ${overviewOneLine("Net stock:", `<strong>${escapeHtml(stockQty)}</strong>`)}
    </div>
    <div class="summary currency-summary goods-overview">
      ${overviewWatermarkGoods()}
      <div class="currency-head"><i class="fa-solid fa-arrow-trend-down"></i></div>
      ${overviewOneLine("Loss items:", `<strong>${escapeHtml(lossGroups.length)}</strong>`)}
      ${overviewOneLine("Loss total:", `<strong>${escapeHtml(lossTotalText)}</strong>`)}
      ${overviewOneLine("Sales total:", `<strong>${escapeHtml(salesTotalText)}</strong>`)}
      ${overviewOneLine("Balance due:", `<strong>${escapeHtml(balanceTotalText)}</strong>`)}
      <div class="overview-card-actions" style="margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap;">
        <button class="tiny ghost" onclick="downloadGoodsPDF()"><i class="fa-solid fa-download"></i></button>
      </div>
    </div>
  `;
}

function renderOverviewCards(tab = getActiveTabKey()){
  const mode = tab === "goods" ? "inventory" : "loans";
  setMainOverviewHeading(mode);
  if (mode === "inventory"){
    renderInventoryOverviewCards();
    return;
  }
  const allowedCurrencies = getPageScopedCurrencies();
  const activeLoanCurrencies = getActiveEntries()
    .filter(entry => !hasGoodsTag(entry.notes) && !hasExpenseAccountTag(entry.notes))
    .map(entry => normalizeCurrencyCode(entry.currency))
    .filter(currency => allowedCurrencies.includes(currency));
  const currencies = activeLoanCurrencies.length
    ? sortCurrenciesList(activeLoanCurrencies)
    : sortCurrenciesList(allowedCurrencies);

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

  els.statsGrid.innerHTML = currencyCards;
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
  const readText = (key) => {
    const m = text.match(new RegExp(`\\[${key}:([^\\]]*)\\]`, "i"));
    return m ? m[1].trim() : "";
  };
  return {
    boughtQty: readNum("BQTY"),
    soldQty: readNum("SQTY"),
    unitActualPrice: readNum("UAP"),
    unitSoldPrice: readNum("USP"),
    itemCode: readText("ICODE"),
    itemDescription: readText("IDESC"),
    customerName: readText("CUST"),
    customerPhone: readText("CPHONE"),
    customerAddress: readText("CADDR"),
    receiptNumber: readText("RCPT"),
    invoiceNumber: readText("INV"),
    paymentReceiptNumber: readText("PAYRCPT"),
    transactionType: readText("TX"),
    itemCategory: readText("UCAT"),
    quantityUnit: readText("UOM"),
    paidAmount: readNum("PAID"),
    balanceAmount: readNum("BAL"),
    paymentStatus: readText("PSTAT"),
    settlementForEntryId: readText("SID"),
    settlementId: readText("SETID"),
    taxApplied: readText("VATP") === "1",
    taxRate: readNum("VATR"),
    taxMode: readText("VATM"),
    taxAmount: readNum("VATA"),
    netAmount: readNum("NET"),
    grossAmount: readNum("GROSS")
  };
}

function upsertGoodsMetaInNote(noteValue, meta = {}){
  let note = normalizeGoodsNote(noteValue, true) || GOODS_TAG;
  note = note.replace(/\[(BQTY|SQTY|UAP|USP|ICODE|IDESC|CUST|CPHONE|CADDR|RCPT|INV|PAYRCPT|TX|UCAT|UOM|PAID|BAL|PSTAT|SID|SETID|VATP|VATR|VATM|VATA|NET|GROSS):[^\]]*\]/gi, "").replace(/\s{2,}/g, " ").trim();
  const tags = [];
  if (meta.boughtQty != null) tags.push(`[BQTY:${meta.boughtQty}]`);
  if (meta.soldQty != null) tags.push(`[SQTY:${meta.soldQty}]`);
  if (meta.unitActualPrice != null) tags.push(`[UAP:${meta.unitActualPrice}]`);
  if (meta.unitSoldPrice != null) tags.push(`[USP:${meta.unitSoldPrice}]`);
  if (meta.itemCode) tags.push(`[ICODE:${String(meta.itemCode).replace(/\]/g, "")}]`);
  if (meta.itemDescription) tags.push(`[IDESC:${String(meta.itemDescription).replace(/\]/g, "")}]`);
  if (meta.customerName) tags.push(`[CUST:${String(meta.customerName).replace(/\]/g, "")}]`);
  if (meta.customerPhone) tags.push(`[CPHONE:${String(meta.customerPhone).replace(/\]/g, "")}]`);
  if (meta.customerAddress) tags.push(`[CADDR:${String(meta.customerAddress).replace(/\]/g, "")}]`);
  if (meta.receiptNumber) tags.push(`[RCPT:${String(meta.receiptNumber).replace(/\]/g, "")}]`);
  if (meta.invoiceNumber) tags.push(`[INV:${String(meta.invoiceNumber).replace(/\]/g, "")}]`);
  if (meta.paymentReceiptNumber) tags.push(`[PAYRCPT:${String(meta.paymentReceiptNumber).replace(/\]/g, "")}]`);
  if (meta.transactionType) tags.push(`[TX:${String(meta.transactionType).replace(/\]/g, "")}]`);
  if (meta.itemCategory) tags.push(`[UCAT:${String(meta.itemCategory).replace(/\]/g, "")}]`);
  if (meta.quantityUnit) tags.push(`[UOM:${String(meta.quantityUnit).replace(/\]/g, "")}]`);
  if (meta.paidAmount != null) tags.push(`[PAID:${meta.paidAmount}]`);
  if (meta.balanceAmount != null) tags.push(`[BAL:${meta.balanceAmount}]`);
  if (meta.paymentStatus) tags.push(`[PSTAT:${String(meta.paymentStatus).replace(/\]/g, "")}]`);
  if (meta.settlementForEntryId) tags.push(`[SID:${String(meta.settlementForEntryId).replace(/\]/g, "")}]`);
  if (meta.settlementId) tags.push(`[SETID:${String(meta.settlementId).replace(/\]/g, "")}]`);
  if (meta.taxApplied != null) tags.push(`[VATP:${meta.taxApplied ? 1 : 0}]`);
  if (meta.taxRate != null) tags.push(`[VATR:${normalizeTaxRate(meta.taxRate)}]`);
  if (meta.taxMode) tags.push(`[VATM:${normalizeTaxMode(meta.taxMode)}]`);
  if (meta.taxAmount != null) tags.push(`[VATA:${roundTaxMoney(meta.taxAmount)}]`);
  if (meta.netAmount != null) tags.push(`[NET:${roundTaxMoney(meta.netAmount)}]`);
  if (meta.grossAmount != null) tags.push(`[GROSS:${roundTaxMoney(meta.grossAmount)}]`);
  return `${note} ${tags.join(" ")}`.trim();
}

function cleanGoodsDisplayNote(noteValue){
  return String(noteValue || "")
    .replace(GOODS_TAG, "")
    .replace(/\[(BQTY|SQTY|UAP|USP|ICODE|IDESC|CUST|CPHONE|CADDR|RCPT|INV|PAYRCPT|TX|UCAT|UOM|PAID|BAL|PSTAT|SID|SETID|VATP|VATR|VATM|VATA|NET|GROSS):[^\]]*\]/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
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
  const readNum = key => {
    const m = text.match(new RegExp(`\\[${key}:([^\\]]+)\\]`, "i"));
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  };
  return {
    accountType: readText("ATYPE"),
    rowType: readText("ETYPE"),
    itemName: readText("ITEM"),
    expenseType: readText("XTYPE"),
    btcAddress: readText("BADDR"),
    btcNetwork: readText("BNET"),
    taxApplied: readText("VATP") === "1",
    taxRate: readNum("VATR"),
    taxMode: readText("VATM"),
    taxAmount: readNum("VATA"),
    netAmount: readNum("NET"),
    grossAmount: readNum("GROSS")
  };
}

function upsertExpenseMetaInNote(noteValue, meta = {}){
  const tagValue = value => String(value || "").replace(/\]/g, "").trim();
  const base = String(noteValue || "")
    .replace(EXPENSE_ACCOUNT_TAG, "")
    .replace(/\[(ATYPE|ETYPE|ITEM|XTYPE|BADDR|BNET|VATP|VATR|VATM|VATA|NET|GROSS):[^\]]+\]/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const tags = [];
  if (meta.accountType) tags.push(`[ATYPE:${tagValue(meta.accountType)}]`);
  if (meta.rowType) tags.push(`[ETYPE:${tagValue(meta.rowType)}]`);
  if (meta.itemName) tags.push(`[ITEM:${tagValue(meta.itemName)}]`);
  if (meta.expenseType) tags.push(`[XTYPE:${tagValue(meta.expenseType)}]`);
  if (meta.btcAddress) tags.push(`[BADDR:${tagValue(meta.btcAddress)}]`);
  if (meta.btcNetwork) tags.push(`[BNET:${tagValue(meta.btcNetwork)}]`);
  if (meta.taxApplied != null) tags.push(`[VATP:${meta.taxApplied ? 1 : 0}]`);
  if (meta.taxRate != null) tags.push(`[VATR:${normalizeTaxRate(meta.taxRate)}]`);
  if (meta.taxMode) tags.push(`[VATM:${normalizeTaxMode(meta.taxMode)}]`);
  if (meta.taxAmount != null) tags.push(`[VATA:${roundTaxMoney(meta.taxAmount)}]`);
  if (meta.netAmount != null) tags.push(`[NET:${roundTaxMoney(meta.netAmount)}]`);
  if (meta.grossAmount != null) tags.push(`[GROSS:${roundTaxMoney(meta.grossAmount)}]`);
  const withTag = `${EXPENSE_ACCOUNT_TAG} ${base}`.trim();
  return `${withTag} ${tags.join(" ")}`.trim();
}

function cleanExpenseNote(noteValue){
  return String(noteValue || "")
    .replace(EXPENSE_ACCOUNT_TAG, "")
    .replace(/\[(ATYPE|ETYPE|ITEM|XTYPE|BADDR|BNET|VATP|VATR|VATM|VATA|NET|GROSS):[^\]]+\]/gi, "")
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

function expenseBtcTrimAmount(value){
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "0";
  return n.toFixed(8).replace(/\.?0+$/, "");
}

function expenseBtcCacheKey(address, networkKey = "mainnet"){
  return `${String(networkKey || "mainnet").trim()}:${String(address || "").trim().toLowerCase()}`;
}

function expenseBtcGetCache(address, networkKey = "mainnet"){
  return state.expenseBtcCache[expenseBtcCacheKey(address, networkKey)] || null;
}

function expenseBtcSetCache(address, networkKey, data){
  state.expenseBtcCache[expenseBtcCacheKey(address, networkKey)] = {
    ...(data || {}),
    address: String(address || "").trim(),
    networkKey: String(networkKey || "mainnet").trim() || "mainnet"
  };
}

function expenseBtcIsCacheFresh(cache, maxAgeMs = 120000){
  return cache && !cache.loading && !cache.error && cache.fetchedAt && (Date.now() - cache.fetchedAt) < maxAgeMs;
}

function expenseBtcDetectNetwork(address){
  const cleaned = String(address || "").trim();
  if (!cleaned) throw new Error("Bitcoin wallet address is required.");
  const candidates = ["mainnet", "testnet", "signet"];
  for (const key of candidates){
    try {
      bitcoinjs.address.toOutputScript(cleaned, btcGetNetworkInfo(key).network);
      return key;
    } catch {
      // keep trying the next Bitcoin network
    }
  }
  const lower = cleaned.toLowerCase();
  if (lower.startsWith("bc1") || /^[13]/.test(cleaned)) return "mainnet";
  if (lower.startsWith("tb1") || /^[mn2]/i.test(cleaned)) return "testnet";
  throw new Error("Enter a valid Bitcoin wallet address.");
}

function expenseBtcNetworkFromMeta(meta = {}){
  const key = String(meta.btcNetwork || "mainnet").trim().toLowerCase();
  return BTC_NETWORKS[key] ? key : "mainnet";
}

async function fetchExpenseBtcWalletData(address, networkKey = ""){
  const cleaned = String(address || "").trim();
  const detectedNetwork = networkKey && BTC_NETWORKS[networkKey] ? networkKey : expenseBtcDetectNetwork(cleaned);
  const api = btcGetNetworkInfo(detectedNetwork).api;
  const [stats, utxos, txs] = await Promise.all([
    btcFetchJson(`${api}/address/${encodeURIComponent(cleaned)}`),
    btcFetchJson(`${api}/address/${encodeURIComponent(cleaned)}/utxo`),
    btcFetchJson(`${api}/address/${encodeURIComponent(cleaned)}/txs`)
  ]);
  const chainStats = stats?.chain_stats || {};
  const mempoolStats = stats?.mempool_stats || {};
  const fundedSat = Number(chainStats.funded_txo_sum || 0) + Number(mempoolStats.funded_txo_sum || 0);
  const sentSat = Number(chainStats.spent_txo_sum || 0) + Number(mempoolStats.spent_txo_sum || 0);
  const balanceSat = Array.isArray(utxos)
    ? utxos.reduce((sum, utxo) => sum + Number(utxo.value || 0), 0)
    : Math.max(fundedSat - sentSat, 0);
  const txCount = Number(chainStats.tx_count || 0) + Number(mempoolStats.tx_count || 0);
  return {
    address: cleaned,
    networkKey: detectedNetwork,
    balanceSat,
    fundedSat,
    sentSat,
    txCount,
    utxos: Array.isArray(utxos) ? utxos : [],
    transactions: Array.isArray(txs) ? txs : [],
    fetchedAt: Date.now(),
    loading: false,
    error: ""
  };
}

async function fetchExpenseBtcAllWalletData(address, networkKey = ""){
  const data = await fetchExpenseBtcWalletData(address, networkKey);
  const api = btcGetNetworkInfo(data.networkKey).api;
  const all = Array.isArray(data.transactions) ? data.transactions.slice() : [];
  const seen = new Set(all.map(tx => tx?.txid).filter(Boolean));
  let confirmed = all.filter(tx => tx?.status?.confirmed);
  let cursor = all.length >= 25 && confirmed.length ? confirmed[confirmed.length - 1].txid : "";

  while (cursor && all.length < MAX_BTC_HISTORY) {
    const batch = await btcFetchJson(`${api}/address/${encodeURIComponent(data.address)}/txs/chain/${encodeURIComponent(cursor)}`);
    if (!Array.isArray(batch) || !batch.length) break;

    let added = 0;
    for (const tx of batch) {
      if (!tx?.txid || seen.has(tx.txid)) continue;
      all.push(tx);
      seen.add(tx.txid);
      added += 1;
      if (all.length >= MAX_BTC_HISTORY) break;
    }

    const confirmedBatch = batch.filter(tx => tx?.status?.confirmed);
    const nextCursor = confirmedBatch.length ? confirmedBatch[confirmedBatch.length - 1].txid : "";
    if (batch.length < 25 || !nextCursor || nextCursor === cursor || !added) break;
    cursor = nextCursor;
  }

  return {
    ...data,
    transactions: all,
    txCount: Math.max(Number(data.txCount || 0), all.length)
  };
}

function refreshExpenseBtcWallets(accounts, options = {}){
  const force = options.force === true;
  const targets = [];
  const seen = new Set();
  for (const account of accounts || []){
    if (account.currency !== "BTC" || !account.btcAddress) continue;
    const key = expenseBtcCacheKey(account.btcAddress, account.btcNetwork || "mainnet");
    if (seen.has(key)) continue;
    seen.add(key);
    const cache = expenseBtcGetCache(account.btcAddress, account.btcNetwork || "mainnet");
    if (!force && (expenseBtcIsCacheFresh(cache) || cache?.loading)) continue;
    if (!force && cache?.error && cache.fetchedAt && (Date.now() - cache.fetchedAt) < 120000) continue;
    targets.push({ address: account.btcAddress, networkKey: account.btcNetwork || "mainnet", key });
  }
  if (!targets.length) return;

  for (const target of targets){
    expenseBtcSetCache(target.address, target.networkKey, {
      ...(state.expenseBtcCache[target.key] || {}),
      loading: true,
      error: ""
    });
  }

  Promise.allSettled(targets.map(async target => {
    try {
      const data = await fetchExpenseBtcWalletData(target.address, target.networkKey);
      expenseBtcSetCache(target.address, data.networkKey, data);
      if (data.networkKey !== target.networkKey) {
        delete state.expenseBtcCache[target.key];
      }
    } catch (err) {
      expenseBtcSetCache(target.address, target.networkKey, {
        ...(state.expenseBtcCache[target.key] || {}),
        loading: false,
        error: err.message || String(err),
        fetchedAt: Date.now()
      });
    }
  })).then(() => {
    renderAll();
  });
}

function syncExpenseBtcAccountFields(form = els.expenseAccountForm){
  if (!form || form !== els.expenseAccountForm) return;
  const currency = String(form.querySelector('input[name="currency"]')?.value || "").trim();
  const isBtc = currency === "BTC";
  const addressInput = form.querySelector('input[name="btc_address"]');
  const balanceInput = form.querySelector('input[name="opening_balance"]');
  const balanceLabel = balanceInput?.closest(".field")?.querySelector("label");

  if (els.expenseBtcAddressField) els.expenseBtcAddressField.classList.toggle("hide", !isBtc);
  if (addressInput) addressInput.required = isBtc;
  if (balanceInput) {
    balanceInput.readOnly = isBtc;
    balanceInput.placeholder = isBtc ? "Fetched from blockchain" : "0.00";
    if (isBtc && !balanceInput.value) balanceInput.value = "0";
  }
  if (balanceLabel) balanceLabel.textContent = isBtc ? "Live blockchain balance" : "Available balance";
  if (els.expenseBtcBalanceStatus) {
    els.expenseBtcBalanceStatus.className = "expense-btc-help";
    els.expenseBtcBalanceStatus.textContent = isBtc
      ? "Balance and transactions will be loaded directly from the blockchain."
      : "";
  }
}

async function previewExpenseBtcBalance(){
  const form = els.expenseAccountForm;
  if (!form) return;
  const addressInput = form.querySelector('input[name="btc_address"]');
  const balanceInput = form.querySelector('input[name="opening_balance"]');
  const address = String(addressInput?.value || "").trim();
  if (!address) return;

  if (els.expenseBtcBalanceStatus) {
    els.expenseBtcBalanceStatus.className = "expense-btc-help";
    els.expenseBtcBalanceStatus.textContent = "Loading live BTC balance...";
  }

  try {
    const data = await fetchExpenseBtcWalletData(address);
    expenseBtcSetCache(data.address, data.networkKey, data);
    if (balanceInput) balanceInput.value = expenseBtcTrimAmount(btcSatToBtc(data.balanceSat));
    if (els.expenseBtcBalanceStatus) {
      els.expenseBtcBalanceStatus.className = "expense-btc-help success";
      els.expenseBtcBalanceStatus.textContent = `Live balance: ${btcFormatBtcFromSat(data.balanceSat)} · ${data.txCount} transaction${data.txCount === 1 ? "" : "s"}`;
    }
  } catch (err) {
    if (els.expenseBtcBalanceStatus) {
      els.expenseBtcBalanceStatus.className = "expense-btc-help error";
      els.expenseBtcBalanceStatus.textContent = err.message || String(err);
    }
  }
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

function inferGoodsActionType(entry){
  if (!entry || entry.entry_kind === "principal") return "ITEM";
  const meta = goodsMetaFromNotes(entry.notes);
  return String(meta.transactionType || INVENTORY_TX_SALE).trim().toUpperCase();
}

function isInventorySaleAction(entry){
  const type = inferGoodsActionType(entry);
  return type === INVENTORY_TX_SALE;
}

function isInventorySettlementAction(entry){
  return inferGoodsActionType(entry) === INVENTORY_TX_SETTLEMENT;
}

function isInventoryCustomerOnlyEntry(entry){
  return hasGoodsTag(entry?.notes) && inferGoodsActionType(entry) === INVENTORY_TX_CUSTOMER;
}

function getExistingInventoryCodes(){
  return new Set(
    state.entries
      .filter(e => hasGoodsTag(e.notes))
      .map(e => goodsMetaFromNotes(e.notes).itemCode)
      .filter(Boolean)
      .map(code => String(code).trim().toUpperCase())
  );
}

function getExistingInventoryReceipts(){
  return new Set(state.entries
    .filter(e => hasGoodsTag(e.notes) && e.entry_kind !== "principal")
    .map(e => goodsMetaFromNotes(e.notes).receiptNumber)
    .filter(Boolean)
    .map(receipt => String(receipt).trim().toUpperCase()));
}

function getExistingInventoryDocumentNumbers(extraNumbers = []){
  const numbers = new Set();
  state.entries
    .filter(e => hasGoodsTag(e.notes))
    .forEach(entry => {
      const meta = goodsMetaFromNotes(entry.notes);
      [meta.receiptNumber, meta.invoiceNumber, meta.paymentReceiptNumber].forEach(value => {
        const code = String(value || "").trim();
        if (code) numbers.add(code.toUpperCase());
      });
    });
  extraNumbers.forEach(value => {
    const code = String(value || "").trim();
    if (code) numbers.add(code.toUpperCase());
  });
  return numbers;
}

function randomHex12(){
  const bytes = new Uint8Array(6);
  if (window.crypto?.getRandomValues){
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function nextPrefixedHexCode(prefix, existingCodes = new Set()){
  const used = new Set(Array.from(existingCodes || []).map(code => String(code).trim().toUpperCase()));
  let candidate = "";
  do {
    candidate = `${prefix}#${randomHex12()}`;
  } while (used.has(candidate.toUpperCase()));
  used.add(candidate.toUpperCase());
  return candidate;
}

function nextInventoryCode(){
  return nextPrefixedHexCode("ITM", getExistingInventoryCodes());
}

function nextInvoiceNumber(extraNumbers = []){
  return nextPrefixedHexCode("INV", getExistingInventoryDocumentNumbers(extraNumbers));
}

function nextPaymentReceiptNumber(extraNumbers = []){
  return nextPrefixedHexCode("RCP", getExistingInventoryDocumentNumbers(extraNumbers));
}

function nextReceiptNumber(extraNumbers = []){
  return nextPaymentReceiptNumber(extraNumbers);
}

function stableInventoryHex12(value){
  const text = String(value || "inventory-document");
  let hashA = 0x811c9dc5;
  let hashB = 0x9e3779b9;
  for (let i = 0; i < text.length; i += 1){
    const code = text.charCodeAt(i);
    hashA ^= code;
    hashA = Math.imul(hashA, 0x01000193);
    hashB ^= code + i;
    hashB = Math.imul(hashB, 0x85ebca6b);
  }
  return `${(hashA >>> 0).toString(16).padStart(8, "0")}${(hashB >>> 0).toString(16).padStart(8, "0")}`.slice(0, 12).toUpperCase();
}

function inventoryInvoiceNumberFromMeta(meta = {}, entry = null){
  return String(meta.invoiceNumber || meta.receiptNumber || shortId(entry?.id) || "N/A").trim();
}

function inventoryPaymentReceiptNumberFromMeta(meta = {}, entry = null, seed = ""){
  const explicit = String(meta.paymentReceiptNumber || "").trim();
  if (explicit) return explicit;
  const seedValue = seed || meta.settlementId || entry?.id || meta.receiptNumber || meta.invoiceNumber || "payment";
  return `RCP#${stableInventoryHex12(`payment:${seedValue}`)}`;
}

function normalizeInventoryCategory(value){
  return String(value || "").toLowerCase() === INVENTORY_CATEGORY_WEIGHT
    ? INVENTORY_CATEGORY_WEIGHT
    : INVENTORY_CATEGORY_COUNT;
}

function inventoryBaseUnitForCategory(category){
  return normalizeInventoryCategory(category) === INVENTORY_CATEGORY_WEIGHT ? INVENTORY_UNIT_KG : INVENTORY_UNIT_ITEM;
}

function normalizeInventoryUnit(value, category){
  const normalizedCategory = normalizeInventoryCategory(category);
  const unit = String(value || "").toLowerCase();
  if (normalizedCategory === INVENTORY_CATEGORY_WEIGHT){
    return unit === INVENTORY_UNIT_GRAM ? INVENTORY_UNIT_GRAM : INVENTORY_UNIT_KG;
  }
  return INVENTORY_UNIT_ITEM;
}

function trimInventoryNumber(value, decimals = 8){
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0";
  const places = Math.max(0, Number(decimals) || 0);
  if (places === 0) return n.toFixed(0);
  return n.toFixed(places).replace(/\.?0+$/, "");
}

function normalizeInventoryQuantityInput(value, category, unit){
  const normalizedCategory = normalizeInventoryCategory(category);
  const raw = Number(value || 0);
  if (normalizedCategory === INVENTORY_CATEGORY_WEIGHT){
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return normalizeInventoryUnit(unit, normalizedCategory) === INVENTORY_UNIT_GRAM ? raw / 1000 : raw;
  }
  const count = Math.floor(raw);
  return Number.isFinite(count) && count > 0 ? count : 1;
}

function normalizeStoredInventoryQty(value, category, fallback = 1){
  const normalizedCategory = normalizeInventoryCategory(category);
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0){
    return normalizedCategory === INVENTORY_CATEGORY_WEIGHT ? 0 : fallback;
  }
  return normalizedCategory === INVENTORY_CATEGORY_WEIGHT ? n : Math.max(1, Math.floor(n));
}

function formatInventoryQty(value, category){
  const normalizedCategory = normalizeInventoryCategory(category);
  const qty = normalizeStoredInventoryQty(value, normalizedCategory, 0);
  if (normalizedCategory === INVENTORY_CATEGORY_WEIGHT) return `${trimInventoryNumber(qty, 3)} KG`;
  return `${trimInventoryNumber(qty, 0)} pcs`;
}

function inventoryQtyLabel(value, category){
  return formatInventoryQty(value, category);
}

function inventoryQtySummary(groups, key){
  const rows = Array.isArray(groups) ? groups : [];
  const countTotal = rows
    .filter(group => normalizeInventoryCategory(group.itemCategory) === INVENTORY_CATEGORY_COUNT)
    .reduce((sum, group) => sum + Number(group[key] || 0), 0);
  const weightTotal = rows
    .filter(group => normalizeInventoryCategory(group.itemCategory) === INVENTORY_CATEGORY_WEIGHT)
    .reduce((sum, group) => sum + Number(group[key] || 0), 0);
  const parts = [];
  if (countTotal) parts.push(formatInventoryQty(countTotal, INVENTORY_CATEGORY_COUNT));
  if (weightTotal) parts.push(formatInventoryQty(weightTotal, INVENTORY_CATEGORY_WEIGHT));
  return parts.length ? parts.join(" | ") : "0";
}

function inventoryLinePaidAmount(meta = {}, lineTotal = 0){
  const total = Math.max(Number(lineTotal || 0), 0);
  const paid = Number(meta.paidAmount);
  if (Number.isFinite(paid)) return Math.min(Math.max(paid, 0), total);
  const balance = Number(meta.balanceAmount);
  if (Number.isFinite(balance)) return Math.min(Math.max(total - balance, 0), total);
  return total;
}

function inventoryLineBalanceAmount(meta = {}, lineTotal = 0){
  const total = Math.max(Number(lineTotal || 0), 0);
  const balance = Number(meta.balanceAmount);
  if (Number.isFinite(balance)) return Math.max(balance, 0);
  return Math.max(total - inventoryLinePaidAmount(meta, total), 0);
}

function inventoryPaymentStatus(meta = {}, lineTotal = 0){
  const status = String(meta.paymentStatus || "").trim().toUpperCase();
  if (status === "FULL" || status === "FULL PAID") return "Full Paid";
  if (status === "PARTIAL" || status === "PARTIAL PAID") return "Partial Paid";
  return inventoryLineBalanceAmount(meta, lineTotal) <= 0.00000001 ? "Full Paid" : "Partial Paid";
}

function getInventoryReceiptEntries(receiptNumber, fallbackEntry = null){
  const receipt = String(receiptNumber || "").trim();
  const entries = state.entries.filter(e => {
    if (e.entry_kind === "principal" || !hasGoodsTag(e.notes)) return false;
    const meta = goodsMetaFromNotes(e.notes);
    return receipt && (meta.receiptNumber || "") === receipt;
  });
  return entries.length || !fallbackEntry ? entries : [fallbackEntry];
}

function getInventoryReceiptData(receiptNumber, fallbackEntry = null){
  const entries = getInventoryReceiptEntries(receiptNumber, fallbackEntry);
  const saleEntries = entries.filter(isInventorySaleAction);
  const settlementEntries = entries.filter(isInventorySettlementAction);
  const settlementsBySaleId = new Map();
  settlementEntries.forEach(entry => {
    const meta = goodsMetaFromNotes(entry.notes);
    const saleId = meta.settlementForEntryId || "";
    if (!saleId) return;
    if (!settlementsBySaleId.has(saleId)) settlementsBySaleId.set(saleId, []);
    settlementsBySaleId.get(saleId).push(entry);
  });

  const saleRows = saleEntries.map((entry, index) => {
    const principalEntry = state.entries.find(e => e.group_id === entry.group_id && e.entry_kind === "principal");
    const entryMeta = goodsMetaFromNotes(entry.notes);
    const principalMeta = goodsMetaFromNotes(principalEntry?.notes);
    const invoiceNumber = inventoryInvoiceNumberFromMeta(entryMeta, entry);
    const initialReceiptNumber = inventoryPaymentReceiptNumberFromMeta(entryMeta, entry, `${invoiceNumber || entry.id}:initial`);
    const itemCategory = normalizeInventoryCategory(entryMeta.itemCategory || principalMeta.itemCategory);
    const qty = normalizeStoredInventoryQty(entryMeta.soldQty, itemCategory, 1);
    const total = Number(entry.action_amount || 0);
    const tax = taxBreakdownFromMeta(entryMeta, total);
    const unitPrice = entryMeta.unitSoldPrice != null ? Number(entryMeta.unitSoldPrice) : (qty ? total / qty : 0);
    const lineSettlements = settlementsBySaleId.get(entry.id) || [];
    const initialPaid = inventoryLinePaidAmount(entryMeta, total);
    const settlementPaid = lineSettlements.reduce((sum, settlement) => sum + Number(settlement.action_amount || 0), 0);
    const paid = Math.min(total, initialPaid + settlementPaid);
    const balance = Math.max(total - paid, 0);
    return {
      sr: index + 1,
      entry,
      entryMeta,
      invoiceNumber,
      initialReceiptNumber,
      principalEntry,
      principalMeta,
      itemCode: principalMeta.itemCode || entryMeta.itemCode || "",
      itemName: principalEntry?.person_name || entry.person_name || "Goods item",
      customerPhone: entryMeta.customerPhone || "",
      customerAddress: entryMeta.customerAddress || "",
      itemCategory,
      qty,
      qtyDisplay: inventoryQtyLabel(qty, itemCategory),
      unitPrice,
      netAmount: tax.net,
      taxAmount: tax.tax,
      taxRate: tax.rate,
      taxMode: tax.mode,
      taxApplied: tax.applied,
      total,
      initialPaid,
      settlementPaid,
      paid,
      balance,
      paymentStatus: balance <= 0.00000001 ? "Full Paid" : "Partial Paid",
      currency: entry.currency
    };
  });

  const totalsByCurrency = saleRows.reduce((acc, row) => {
    const currencyKey = row.currency || "AED";
    if (!acc.has(currencyKey)) acc.set(currencyKey, { net: 0, tax: 0, total: 0, paid: 0, balance: 0 });
    const bucket = acc.get(currencyKey);
    bucket.net += Number(row.netAmount || 0);
    bucket.tax += Number(row.taxAmount || 0);
    bucket.total += Number(row.total || 0);
    bucket.paid += Number(row.paid || 0);
    bucket.balance += Number(row.balance || 0);
    return acc;
  }, new Map());

  const settlementGroups = new Map();
  settlementEntries.forEach(entry => {
    const meta = goodsMetaFromNotes(entry.notes);
    const key = meta.settlementId || entry.id || `${entry.action_date || ""}-${entry.created_at || ""}`;
    if (!settlementGroups.has(key)){
      const paymentReceiptNumber = inventoryPaymentReceiptNumberFromMeta(meta, entry, key);
      settlementGroups.set(key, {
        key,
        date: entry.action_date,
        currency: entry.currency,
        amount: 0,
        paymentReceiptNumber,
        notes: cleanGoodsDisplayNote(entry.notes) || "Balance settlement"
      });
    }
    const row = settlementGroups.get(key);
    row.amount += Number(entry.action_amount || 0);
    if (!row.date) row.date = entry.action_date;
  });

  const currency = totalsByCurrency.size === 1 ? Array.from(totalsByCurrency.keys())[0] : (saleRows[0]?.currency || fallbackEntry?.currency || "AED");
  const receiptNumberValue = receiptNumber || goodsMetaFromNotes(fallbackEntry?.notes).receiptNumber || shortId(fallbackEntry?.id) || "N/A";
  const invoiceNumber = saleRows.find(row => row.invoiceNumber)?.invoiceNumber || inventoryInvoiceNumberFromMeta(goodsMetaFromNotes(fallbackEntry?.notes), fallbackEntry) || receiptNumberValue;
  const totalAmount = saleRows.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const initialPaidTotal = saleRows.reduce((sum, row) => sum + Number(row.initialPaid || 0), 0);
  const initialPaymentReceiptNumber = saleRows.find(row => row.initialPaid > 0.00000001)?.initialReceiptNumber || inventoryPaymentReceiptNumberFromMeta(goodsMetaFromNotes(fallbackEntry?.notes), fallbackEntry, `${invoiceNumber}:initial`);
  const saleDates = saleRows.map(row => row.entry.action_date).filter(Boolean).sort((a, b) => dateStamp(a) - dateStamp(b));
  const paymentRows = [];
  if (saleRows.length && totalsByCurrency.size <= 1){
    let cumulativePaid = initialPaidTotal;
    paymentRows.push({
      type: "First payment",
      date: saleDates[0] || fallbackEntry?.action_date || "—",
      receiptNumber: initialPaymentReceiptNumber,
      amount: initialPaidTotal,
      balanceAfter: Math.max(totalAmount - cumulativePaid, 0),
      currency
    });
    Array.from(settlementGroups.values())
      .sort((a, b) => {
        const diff = dateStamp(a.date) - dateStamp(b.date);
        if (diff !== 0) return diff;
        return String(a.key).localeCompare(String(b.key));
      })
      .forEach(row => {
        cumulativePaid = Math.min(totalAmount, cumulativePaid + Number(row.amount || 0));
        paymentRows.push({
          type: "Balance settlement",
          date: row.date || "—",
          receiptNumber: row.paymentReceiptNumber,
          amount: Number(row.amount || 0),
          balanceAfter: Math.max(totalAmount - cumulativePaid, 0),
          currency: row.currency || currency,
          notes: row.notes
        });
      });
  }

  return {
    receiptNumber: receiptNumberValue,
    invoiceNumber,
    entries,
    saleEntries,
    settlementEntries,
    saleRows,
    totalsByCurrency,
    paymentRows,
    currency,
    totalAmount,
    paidTotal: saleRows.reduce((sum, row) => sum + Number(row.paid || 0), 0),
    balanceTotal: saleRows.reduce((sum, row) => sum + Number(row.balance || 0), 0),
    customerName: saleRows[0]?.entryMeta.customerName || goodsMetaFromNotes(fallbackEntry?.notes).customerName || "Walk-in customer",
    customerPhone: saleRows.find(row => row.customerPhone)?.customerPhone || goodsMetaFromNotes(fallbackEntry?.notes).customerPhone || "",
    customerAddress: saleRows.find(row => row.customerAddress)?.customerAddress || goodsMetaFromNotes(fallbackEntry?.notes).customerAddress || ""
  };
}

function addCurrencyTotal(target, currency, amount){
  const key = currency || "AED";
  target.set(key, Number(target.get(key) || 0) + Number(amount || 0));
}

function inventoryCurrencyTotalsText(totals, options = {}){
  const rows = totals instanceof Map ? Array.from(totals.entries()) : Object.entries(totals || {});
  return rows
    .filter(([, amount]) => Math.abs(Number(amount || 0)) > 0.00000001)
    .map(([currency, amount]) => moneyText(amount, currency, options))
    .join(" | ");
}

function collectOutstandingInventoryInvoices(){
  const seenReceipts = new Set();
  const saleEntries = state.entries.filter(e => e.entry_kind !== "principal" && hasGoodsTag(e.notes) && isInventorySaleAction(e));
  const invoices = [];

  for (const entry of saleEntries){
    const meta = goodsMetaFromNotes(entry.notes);
    const receiptNumber = meta.receiptNumber || shortId(entry.id) || "";
    const receiptKey = receiptNumber || entry.id;
    if (seenReceipts.has(receiptKey)) continue;
    seenReceipts.add(receiptKey);

    const receiptData = getInventoryReceiptData(receiptNumber, entry);
    if (!receiptData.saleRows.length || receiptData.balanceTotal <= 0.00000001) continue;

    const balanceByCurrency = new Map();
    receiptData.totalsByCurrency.forEach((amounts, currency) => {
      addCurrencyTotal(balanceByCurrency, currency, amounts.balance || 0);
    });
    const outstandingSaleRow = receiptData.saleRows.find(row => row.balance > 0.00000001) || receiptData.saleRows[0];
    const dateValue = receiptData.saleRows
      .map(row => row.entry.action_date)
      .filter(Boolean)
      .sort((a, b) => dateStamp(b) - dateStamp(a))[0] || entry.action_date || entry.loan_date || "";
    const oldestDate = receiptData.saleRows
      .map(row => row.entry.action_date)
      .filter(Boolean)
      .sort((a, b) => dateStamp(a) - dateStamp(b))[0] || entry.action_date || entry.loan_date || "";
    const itemNames = [...new Set(receiptData.saleRows.map(row => row.itemName).filter(Boolean))];

    invoices.push({
      receiptNumber: receiptData.receiptNumber || receiptNumber || shortId(entry.id),
      invoiceNumber: receiptData.invoiceNumber || receiptData.receiptNumber || receiptNumber || shortId(entry.id),
      customerName: receiptData.customerName || meta.customerName || "Walk-in customer",
      entryId: outstandingSaleRow?.entry?.id || entry.id,
      date: dateValue,
      oldestDate,
      lineCount: receiptData.saleRows.length,
      itemSummary: itemNames.slice(0, 3).join(", ") + (itemNames.length > 3 ? ` +${itemNames.length - 3}` : ""),
      taxText: formatInventoryTotalsByCurrency(receiptData.totalsByCurrency, "tax") || "-",
      totalText: formatInventoryTotalsByCurrency(receiptData.totalsByCurrency, "total") || moneyText(receiptData.totalAmount, receiptData.currency),
      paidText: formatInventoryTotalsByCurrency(receiptData.totalsByCurrency, "paid") || moneyText(receiptData.paidTotal, receiptData.currency),
      balanceText: inventoryCurrencyTotalsText(balanceByCurrency) || moneyText(receiptData.balanceTotal, receiptData.currency),
      totalAmount: receiptData.totalAmount,
      paidTotal: receiptData.paidTotal,
      balanceTotal: receiptData.balanceTotal,
      currency: receiptData.totalsByCurrency.size === 1 ? Array.from(receiptData.totalsByCurrency.keys())[0] : receiptData.currency,
      totalsByCurrency: receiptData.totalsByCurrency,
      balanceByCurrency,
      canSettle: receiptData.totalsByCurrency.size === 1
    });
  }

  return invoices.sort((a, b) =>
    String(a.customerName).localeCompare(String(b.customerName)) ||
    dateStamp(b.date) - dateStamp(a.date) ||
    String(a.receiptNumber).localeCompare(String(b.receiptNumber))
  );
}

function renderInventoryOutstandingBanner(){
  const invoices = collectOutstandingInventoryInvoices();
  const totalBalance = new Map();
  invoices.forEach(invoice => {
    invoice.balanceByCurrency.forEach((amount, currency) => addCurrencyTotal(totalBalance, currency, amount));
  });
  const searchableCustomerNames = getInventoryCustomerNames();

  if (!invoices.length && !searchableCustomerNames.length){
    return `
      <details class="inventory-outstanding-banner is-clear">
        <summary class="inventory-outstanding-top">
          <div>
            <h4><i class="fa-solid fa-file-invoice-dollar"></i> Outstanding Payment Invoices</h4>
            <p>No outstanding inventory invoices.</p>
          </div>
          <div class="inventory-outstanding-top-actions">
            <strong>Clear</strong>
            <button class="tiny ghost inventoryOutstandingAddCustomerBtn" type="button" title="Add a customer with an optional outstanding sale"><i class="fa-solid fa-user-plus"></i> Add Customer</button>
          </div>
        </summary>
      </details>
    `;
  }

  const members = new Map();
  invoices.forEach(invoice => {
    const key = invoice.customerName || "Walk-in customer";
    if (!members.has(key)){
      members.set(key, { name: key, invoices: [], totalByCurrency: new Map(), paidByCurrency: new Map(), balanceByCurrency: new Map() });
    }
    const member = members.get(key);
    member.invoices.push(invoice);
    invoice.totalsByCurrency.forEach((amounts, currency) => {
      addCurrencyTotal(member.totalByCurrency, currency, amounts.total || 0);
      addCurrencyTotal(member.paidByCurrency, currency, amounts.paid || 0);
    });
    invoice.balanceByCurrency.forEach((amount, currency) => addCurrencyTotal(member.balanceByCurrency, currency, amount));
  });
  const memberRows = Array.from(members.values()).sort((a, b) => a.name.localeCompare(b.name));
  const outstandingNameKeys = new Set(Array.from(members.keys()).map(normalizeInventoryCustomerKey));
  const searchOnlyMembers = searchableCustomerNames
    .filter(name => !outstandingNameKeys.has(normalizeInventoryCustomerKey(name)))
    .map(name => {
      const record = getInventoryCustomerRecord(name);
      const invoiceSearch = record.invoices.map(invoice => `${invoice.invoiceNumber || invoice.receiptNumber} ${invoice.itemSummary} ${invoice.totalText} ${invoice.paidText} ${invoice.balanceText}`).join(" ");
      return {
        name: record.customerName || name,
        invoiceCount: record.invoices.length,
        totalByCurrency: record.totalByCurrency,
        paidByCurrency: record.paidByCurrency,
        balanceByCurrency: record.balanceByCurrency,
        searchText: `${record.customerName || name} ${invoiceSearch} ${record.contact.phone || ""} ${record.contact.address || ""}`
      };
    })
    .filter(member => member.name)
    .sort((a, b) => a.name.localeCompare(b.name));

  return `
    <details class="inventory-outstanding-banner${invoices.length ? "" : " is-clear"}">
      <summary class="inventory-outstanding-top">
        <div>
          <h4><i class="fa-solid fa-file-invoice-dollar"></i> Outstanding Payment Invoices</h4>
          <p>${invoices.length ? `${escapeHtml(invoices.length)} invoice${invoices.length === 1 ? "" : "s"} pending across ${escapeHtml(members.size)} member${members.size === 1 ? "" : "s"}.` : "No outstanding inventory invoices. Search to find customer records."}</p>
        </div>
        <div class="inventory-outstanding-top-actions">
          ${invoices.length ? `<div class="inventory-outstanding-total">
            <small>Total balance</small>
            <strong>${escapeHtml(inventoryCurrencyTotalsText(totalBalance))}</strong>
          </div>` : `<strong>Clear</strong>`}
          <button class="tiny ghost inventoryOutstandingAddCustomerBtn" type="button" title="Add a customer with an optional outstanding sale"><i class="fa-solid fa-user-plus"></i> Add Customer</button>
        </div>
      </summary>
      <div class="inventory-outstanding-body">
        <div class="inventory-outstanding-search">
          <div class="inventory-outstanding-search-box">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input class="input inventoryOutstandingSearchInput" type="search" placeholder="Search customer, invoice, or item" />
          </div>
          <button class="tiny inventoryOutstandingSearchBtn" type="button">Search</button>
          <button class="tiny ghost inventoryOutstandingClearSearchBtn" type="button">Clear</button>
        </div>
        <div class="inventory-outstanding-members">
        ${memberRows.map(member => {
          const searchText = `${member.name} ${member.invoices.map(invoice => `${invoice.invoiceNumber || invoice.receiptNumber} ${invoice.itemSummary} ${invoice.totalText} ${invoice.paidText} ${invoice.balanceText}`).join(" ")}`;
          return `
          <details class="inventory-outstanding-member" data-search="${escapeHtml(searchText)}">
            <summary>
              <button class="inventory-outstanding-name inventoryOutstandingCustomerOpenBtn" type="button" data-customer="${escapeHtml(member.name)}" title="Open customer record">${escapeHtml(member.name)}</button>
              <strong>${escapeHtml(member.invoices.length)} invoice${member.invoices.length === 1 ? "" : "s"} • ${escapeHtml(inventoryCurrencyTotalsText(member.balanceByCurrency))}</strong>
            </summary>
            <div class="inventory-outstanding-list">
              <div class="inventory-outstanding-row">
                <div class="inventory-outstanding-main">
                  <strong>Combined outstanding invoice</strong>
                  <span>${escapeHtml(member.invoices.length)} invoice${member.invoices.length === 1 ? "" : "s"} for ${escapeHtml(member.name)} • oldest balance settled first</span>
                </div>
                <div class="inventory-outstanding-money"><small>Total</small><strong>${escapeHtml(inventoryCurrencyTotalsText(member.totalByCurrency))}</strong></div>
                <div class="inventory-outstanding-money"><small>Paid</small><strong>${escapeHtml(inventoryCurrencyTotalsText(member.paidByCurrency))}</strong></div>
                <div class="inventory-outstanding-money is-due"><small>Balance</small><strong>${escapeHtml(inventoryCurrencyTotalsText(member.balanceByCurrency))}</strong></div>
                <div class="inventory-outstanding-actions">
                  <button class="tiny inventoryOutstandingCustomerPdfBtn" type="button" data-customer="${escapeHtml(member.name)}" title="Download customer outstanding invoice PDF"><i class="fa-solid fa-download"></i> PDF</button>
                  <button class="tiny ghost inventoryOutstandingCustomerStatementBtn" type="button" data-customer="${escapeHtml(member.name)}" title="Download full customer statement">Statement</button>
                  <button class="tiny ghost inventoryOutstandingCustomerSettleBtn" type="button" data-customer="${escapeHtml(member.name)}" title="Select one or more invoices and record settlement">Settle</button>
                </div>
              </div>
            </div>
          </details>
        `;
        }).join("")}
        ${searchOnlyMembers.map(member => `
          <details class="inventory-outstanding-member search-only hide" data-search-only="true" data-search="${escapeHtml(member.searchText)}">
            <summary>
              <button class="inventory-outstanding-name inventoryOutstandingCustomerOpenBtn" type="button" data-customer="${escapeHtml(member.name)}" title="Open customer record">${escapeHtml(member.name)}</button>
              <strong>${member.invoiceCount ? `${escapeHtml(member.invoiceCount)} paid invoice${member.invoiceCount === 1 ? "" : "s"}` : "Customer record"}</strong>
            </summary>
            <div class="inventory-outstanding-list">
              <div class="inventory-outstanding-row">
                <div class="inventory-outstanding-main">
                  <strong>Customer statement</strong>
                  <span>${member.invoiceCount ? "Open this customer to check payment records and invoices." : "Open this customer record before creating an invoice."}</span>
                </div>
                <div class="inventory-outstanding-money"><small>Total</small><strong>${escapeHtml(inventoryCurrencyTotalsText(member.totalByCurrency) || "0")}</strong></div>
                <div class="inventory-outstanding-money"><small>Paid</small><strong>${escapeHtml(inventoryCurrencyTotalsText(member.paidByCurrency) || "0")}</strong></div>
                <div class="inventory-outstanding-money"><small>Balance</small><strong>${escapeHtml(inventoryCurrencyTotalsText(member.balanceByCurrency) || "0")}</strong></div>
                <div class="inventory-outstanding-actions">
                  <button class="tiny ghost inventoryOutstandingCustomerStatementBtn" type="button" data-customer="${escapeHtml(member.name)}" title="Download full customer statement">Statement</button>
                </div>
              </div>
            </div>
          </details>
        `).join("")}
          <div class="inventory-outstanding-empty hide">No matching customers.</div>
        </div>
      </div>
    </details>
  `;
}

function applyInventoryOutstandingSearch(root = els.goodsList){
  const banner = root?.querySelector(".inventory-outstanding-banner");
  const input = banner?.querySelector(".inventoryOutstandingSearchInput");
  const members = Array.from(banner?.querySelectorAll(".inventory-outstanding-member") || []);
  const empty = banner?.querySelector(".inventory-outstanding-empty");
  const term = String(input?.value || "").trim().toLowerCase();
  let visible = 0;
  members.forEach(member => {
    const haystack = String(member.dataset.search || "").toLowerCase();
    const searchOnly = member.dataset.searchOnly === "true";
    const isVisible = term ? haystack.includes(term) : !searchOnly;
    member.classList.toggle("hide", !isVisible);
    if (isVisible) visible += 1;
    else member.open = false;
  });
  if (empty) empty.classList.toggle("hide", !term || visible > 0);
}

function bindInventoryOutstandingBanner(root = els.goodsList){
  if (!root) return;
  root.querySelectorAll(".inventoryOutstandingAddCustomerBtn").forEach(btn => btn.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    activate("goods");
    openGoodsModal("sold", { addCustomer: true });
  }));
  root.querySelectorAll(".inventoryOutstandingCustomerOpenBtn").forEach(btn => btn.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    openInventoryCustomerModal(btn.dataset.customer);
  }));
  root.querySelectorAll(".inventoryOutstandingCustomerStatementBtn").forEach(btn => btn.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    downloadInventoryCustomerStatementPDF(btn.dataset.customer);
  }));
  root.querySelectorAll(".inventoryOutstandingSearchBtn").forEach(btn => btn.addEventListener("click", () => applyInventoryOutstandingSearch(root)));
  root.querySelectorAll(".inventoryOutstandingClearSearchBtn").forEach(btn => btn.addEventListener("click", () => {
    const input = root.querySelector(".inventoryOutstandingSearchInput");
    if (input) input.value = "";
    applyInventoryOutstandingSearch(root);
  }));
  root.querySelectorAll(".inventoryOutstandingSearchInput").forEach(input => input.addEventListener("input", () => applyInventoryOutstandingSearch(root)));
  root.querySelectorAll(".inventoryOutstandingSearchInput").forEach(input => input.addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    applyInventoryOutstandingSearch(root);
  }));
}

function outstandingInvoicesForCustomer(customerName){
  const target = String(customerName || "").trim().toLowerCase();
  return collectOutstandingInventoryInvoices()
    .filter(invoice => String(invoice.customerName || "").trim().toLowerCase() === target)
    .sort((a, b) => dateStamp(a.oldestDate || a.date) - dateStamp(b.oldestDate || b.date) || String(a.receiptNumber).localeCompare(String(b.receiptNumber)));
}

async function downloadOutstandingCustomerInvoicePDF(customerName){
  const invoices = outstandingInvoicesForCustomer(customerName);
  if (!invoices.length){
    alert("No outstanding invoices found for this customer.");
    return;
  }
  if (!window.jspdf){
    alert("PDF library loading. Please try again.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  await loadCustomFontsForPdf(doc);
  const logoData = await getPdfLogo();
  const title = "Outstanding Inventory Invoice";
  const subtitle = `Customer: ${customerName}`;
  drawPdfHeader(doc, logoData, title, subtitle);
  drawPdfOwnerBlock(doc, 48);

  const contact = getInventoryCustomerContact(customerName);
  const totalBalance = new Map();
  const totalAmounts = new Map();
  const taxAmounts = new Map();
  const paidAmounts = new Map();
  invoices.forEach(invoice => {
    invoice.totalsByCurrency.forEach((amounts, currency) => {
      addCurrencyTotal(totalAmounts, currency, amounts.total || 0);
      addCurrencyTotal(taxAmounts, currency, amounts.tax || 0);
      addCurrencyTotal(paidAmounts, currency, amounts.paid || 0);
    });
    invoice.balanceByCurrency.forEach((amount, currency) => addCurrencyTotal(totalBalance, currency, amount));
  });

  doc.setFontSize(10);
  doc.setTextColor(23, 33, 43);
  doc.text(`Bill To: ${customerName}`, 132, 48);
  if (contact.phone) doc.text(`Phone: ${contact.phone}`, 132, 54);
  if (contact.address) doc.text(`Address: ${contact.address}`, 132, contact.phone ? 60 : 54, { maxWidth: 58 });

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, 78, 182, 30, 2, 2, "F");
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, 78, 182, 30, 2, 2, "S");
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);
  doc.text(`Invoices: ${invoices.length}`, 18, 86);
  doc.text(`Total Amount: ${inventoryCurrencyTotalsText(totalAmounts, { forPdf: true })}`, 18, 94);
  doc.text(`VAT Amount: ${inventoryCurrencyTotalsText(taxAmounts, { forPdf: true })}`, 110, 86);
  doc.text(`Paid Amount: ${inventoryCurrencyTotalsText(paidAmounts, { forPdf: true })}`, 110, 94);
  doc.text(`Balance Amount: ${inventoryCurrencyTotalsText(totalBalance, { forPdf: true })}`, 110, 102);

  doc.autoTable({
    startY: 116,
    head: [["Invoice", "Date", "Notes/Description", "VAT", "Total", "Paid", "Balance"]],
    body: invoices.map(invoice => [
      invoice.invoiceNumber || invoice.receiptNumber,
      displayDate(invoice.oldestDate || invoice.date || "—"),
      `${invoice.lineCount} item${invoice.lineCount === 1 ? "" : "s"}${invoice.itemSummary ? ` - ${invoice.itemSummary}` : ""}`,
      formatInventoryTotalsByCurrency(invoice.totalsByCurrency, "tax", { forPdf: true }) || "-",
      formatInventoryTotalsByCurrency(invoice.totalsByCurrency, "total", { forPdf: true }) || "-",
      formatInventoryTotalsByCurrency(invoice.totalsByCurrency, "paid", { forPdf: true }) || "-",
      inventoryCurrencyTotalsText(invoice.balanceByCurrency, { forPdf: true }) || "-"
    ]),
    theme: "grid",
    headStyles: { fillColor: [36, 87, 214], textColor: 255, fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 8.2, cellPadding: 2.2, overflow: "linebreak" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 25 },
      1: { cellWidth: 24 },
      2: { cellWidth: 42 },
      3: { cellWidth: 21, halign: "right" },
      4: { cellWidth: 24, halign: "right" },
      5: { cellWidth: 23, halign: "right" },
      6: { cellWidth: 23, halign: "right" }
    },
    margin: { top: 50, bottom: 40 },
    didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
  });

  doc.save(`Outstanding_Invoice_${String(customerName || "customer").replace(/\s+/g, "_")}.pdf`);
}

function normalizeInventoryCustomerKey(name){
  return String(name || "").trim().toLowerCase();
}

function getInventoryCustomerInvoices(customerName){
  const target = normalizeInventoryCustomerKey(customerName);
  if (!target) return [];
  const seenReceipts = new Set();
  return state.entries
    .filter(entry => entry.entry_kind !== "principal" && hasGoodsTag(entry.notes) && isInventorySaleAction(entry))
    .filter(entry => normalizeInventoryCustomerKey(goodsMetaFromNotes(entry.notes).customerName || "Walk-in customer") === target)
    .sort((a, b) => dateStamp(a.action_date || a.created_at) - dateStamp(b.action_date || b.created_at))
    .map(entry => {
      const meta = goodsMetaFromNotes(entry.notes);
      const receiptNumber = meta.receiptNumber || shortId(entry.id) || "";
      const receiptKey = receiptNumber || entry.id;
      if (seenReceipts.has(receiptKey)) return null;
      seenReceipts.add(receiptKey);
      const receiptData = getInventoryReceiptData(receiptNumber, entry);
      if (!receiptData.saleRows.length) return null;
      if (normalizeInventoryCustomerKey(receiptData.customerName || meta.customerName || "Walk-in customer") !== target) return null;
      const balanceByCurrency = new Map();
      receiptData.totalsByCurrency.forEach((amounts, currency) => addCurrencyTotal(balanceByCurrency, currency, amounts.balance || 0));
      const dates = receiptData.saleRows.map(row => row.entry.action_date).filter(Boolean);
      const oldestDate = dates.slice().sort((a, b) => dateStamp(a) - dateStamp(b))[0] || entry.action_date || "";
      const latestDate = dates.slice().sort((a, b) => dateStamp(b) - dateStamp(a))[0] || entry.action_date || "";
      const itemNames = [...new Set(receiptData.saleRows.map(row => row.itemName).filter(Boolean))];
      return {
        receiptNumber: receiptData.receiptNumber || receiptNumber || shortId(entry.id),
        invoiceNumber: receiptData.invoiceNumber || receiptData.receiptNumber || receiptNumber || shortId(entry.id),
        entryId: receiptData.saleRows[0]?.entry?.id || entry.id,
        customerName: receiptData.customerName || meta.customerName || "Walk-in customer",
        oldestDate,
        date: latestDate,
        lineCount: receiptData.saleRows.length,
        itemSummary: itemNames.slice(0, 4).join(", ") + (itemNames.length > 4 ? ` +${itemNames.length - 4}` : ""),
        taxText: formatInventoryTotalsByCurrency(receiptData.totalsByCurrency, "tax") || "-",
        totalText: formatInventoryTotalsByCurrency(receiptData.totalsByCurrency, "total") || moneyText(receiptData.totalAmount, receiptData.currency),
        paidText: formatInventoryTotalsByCurrency(receiptData.totalsByCurrency, "paid") || moneyText(receiptData.paidTotal, receiptData.currency),
        balanceText: inventoryCurrencyTotalsText(balanceByCurrency) || moneyText(receiptData.balanceTotal, receiptData.currency),
        totalsByCurrency: receiptData.totalsByCurrency,
        balanceByCurrency,
        receiptData
      };
    })
    .filter(Boolean)
    .sort((a, b) => dateStamp(a.oldestDate || a.date) - dateStamp(b.oldestDate || b.date) || String(a.receiptNumber).localeCompare(String(b.receiptNumber)));
}

function inventoryReceiptSettlementGroups(receiptData){
  const groups = new Map();
  receiptData.settlementEntries.forEach(entry => {
    const meta = goodsMetaFromNotes(entry.notes);
    const key = meta.settlementId || entry.id;
    if (!groups.has(key)){
      const paymentReceiptNumber = inventoryPaymentReceiptNumberFromMeta(meta, entry, key);
      groups.set(key, {
        key,
        date: entry.action_date || entry.created_at || "",
        currency: entry.currency || receiptData.currency,
        receiptNumber: meta.receiptNumber || receiptData.receiptNumber,
        invoiceNumber: inventoryInvoiceNumberFromMeta(meta, entry) || receiptData.invoiceNumber,
        paymentReceiptNumber,
        entryIds: [],
        itemNames: new Set(),
        amountByCurrency: new Map(),
        notes: cleanGoodsDisplayNote(entry.notes) || "Balance settlement"
      });
    }
    const group = groups.get(key);
    group.entryIds.push(entry.id);
    if (entry.person_name) group.itemNames.add(entry.person_name);
    addCurrencyTotal(group.amountByCurrency, entry.currency || receiptData.currency, Number(entry.action_amount || 0));
    if (!group.date) group.date = entry.action_date || entry.created_at || "";
  });
  const rows = Array.from(groups.values()).sort((a, b) => dateStamp(a.date) - dateStamp(b.date) || String(a.key).localeCompare(String(b.key)));
  const paymentRows = receiptData.paymentRows.filter(row => row.type === "Balance settlement");
  rows.forEach((group, index) => {
    const paymentRow = paymentRows.find(row => row.receiptNumber === group.paymentReceiptNumber) || paymentRows[index];
    if (paymentRow){
      group.balanceText = formatReportAmount(paymentRow.balanceAfter || 0, paymentRow.currency || group.currency || receiptData.currency);
      group.balancePdfText = formatPdfAmount(paymentRow.balanceAfter || 0, paymentRow.currency || group.currency || receiptData.currency);
    }
  });
  return rows;
}

function getInventoryCustomerRecord(customerName){
  const invoices = getInventoryCustomerInvoices(customerName);
  const customer = invoices[0]?.customerName || customerName || "Walk-in customer";
  const contact = getInventoryCustomerContact(customer);
  const totalByCurrency = new Map();
  const taxByCurrency = new Map();
  const paidByCurrency = new Map();
  const balanceByCurrency = new Map();
  const statementRows = [];

  invoices.forEach(invoice => {
    invoice.totalsByCurrency.forEach((amounts, currency) => {
      addCurrencyTotal(totalByCurrency, currency, amounts.total || 0);
      addCurrencyTotal(taxByCurrency, currency, amounts.tax || 0);
      addCurrencyTotal(paidByCurrency, currency, amounts.paid || 0);
      addCurrencyTotal(balanceByCurrency, currency, amounts.balance || 0);
    });

    statementRows.push({
      date: invoice.oldestDate || invoice.date || "",
      type: "Invoice",
      receiptNumber: invoice.invoiceNumber || invoice.receiptNumber,
      sortInvoiceNumber: invoice.invoiceNumber || invoice.receiptNumber,
      details: `${invoice.lineCount} item${invoice.lineCount === 1 ? "" : "s"}${invoice.itemSummary ? ` - ${invoice.itemSummary}` : ""}`,
      taxText: invoice.taxText || "-",
      debitText: invoice.totalText,
      creditText: "-",
      balanceText: invoice.totalText,
      taxPdfText: formatInventoryTotalsByCurrency(invoice.totalsByCurrency, "tax", { forPdf: true }) || "-",
      debitPdfText: formatInventoryTotalsByCurrency(invoice.totalsByCurrency, "total", { forPdf: true }) || "-",
      creditPdfText: "-",
      balancePdfText: formatInventoryTotalsByCurrency(invoice.totalsByCurrency, "total", { forPdf: true }) || "-",
      entryId: invoice.entryId,
      action: "invoice"
    });

    const initialPaidByCurrency = new Map();
    const initialBalanceByCurrency = new Map();
    invoice.receiptData.saleRows.forEach(row => {
      addCurrencyTotal(initialPaidByCurrency, row.currency, row.initialPaid || 0);
      addCurrencyTotal(initialBalanceByCurrency, row.currency, Math.max(Number(row.total || 0) - Number(row.initialPaid || 0), 0));
    });
    const initialPaidText = inventoryCurrencyTotalsText(initialPaidByCurrency);
    if (initialPaidText){
      const initialPaymentRow = invoice.receiptData.paymentRows.find(row => row.type === "First payment");
      const firstSaleEntry = state.entries.find(entry => entry.id === invoice.entryId);
      statementRows.push({
        date: invoice.oldestDate || invoice.date || "",
        type: "First Payment",
        receiptNumber: initialPaymentRow?.receiptNumber || inventoryPaymentReceiptNumberFromMeta(goodsMetaFromNotes(firstSaleEntry?.notes), firstSaleEntry, `${invoice.invoiceNumber || invoice.receiptNumber}:initial`),
        sortInvoiceNumber: invoice.invoiceNumber || invoice.receiptNumber,
        details: "Initial payment on invoice",
        taxText: "-",
        debitText: "-",
        creditText: initialPaidText,
        balanceText: inventoryCurrencyTotalsText(initialBalanceByCurrency) || "-",
        taxPdfText: "-",
        debitPdfText: "-",
        creditPdfText: inventoryCurrencyTotalsText(initialPaidByCurrency, { forPdf: true }),
        balancePdfText: inventoryCurrencyTotalsText(initialBalanceByCurrency, { forPdf: true }) || "-",
        entryId: invoice.entryId,
        action: "receipt"
      });
    }

    inventoryReceiptSettlementGroups(invoice.receiptData).forEach(payment => {
      statementRows.push({
        date: payment.date,
        type: "Balance Payment",
        receiptNumber: payment.paymentReceiptNumber || payment.receiptNumber,
        sortInvoiceNumber: invoice.invoiceNumber || invoice.receiptNumber,
        details: payment.itemNames.size ? Array.from(payment.itemNames).join(", ") : payment.notes,
        taxText: "-",
        debitText: "-",
        creditText: inventoryCurrencyTotalsText(payment.amountByCurrency),
        balanceText: payment.balanceText || "",
        taxPdfText: "-",
        debitPdfText: "-",
        creditPdfText: inventoryCurrencyTotalsText(payment.amountByCurrency, { forPdf: true }),
        balancePdfText: payment.balancePdfText || payment.balanceText || "",
        entryId: payment.entryIds[0],
        action: "receipt"
      });
    });
  });

  const typeOrder = { "Invoice": 1, "First Payment": 2, "Balance Payment": 3 };
  statementRows.sort((a, b) =>
    dateStamp(a.date) - dateStamp(b.date) ||
    String(a.sortInvoiceNumber || a.receiptNumber).localeCompare(String(b.sortInvoiceNumber || b.receiptNumber)) ||
    (typeOrder[a.type] || 9) - (typeOrder[b.type] || 9) ||
    String(a.receiptNumber).localeCompare(String(b.receiptNumber))
  );

  return { customerName: customer, contact, invoices, statementRows, totalByCurrency, taxByCurrency, paidByCurrency, balanceByCurrency };
}

function renderInventoryCustomerRecord(record){
  if (!record.invoices.length){
    return `
      <div class="inventory-customer-contact">
        <span><strong>Bill To:</strong> ${escapeHtml(record.customerName)}</span>
        ${record.contact.phone ? `<span><strong>Phone:</strong> ${escapeHtml(record.contact.phone)}</span>` : ""}
        ${record.contact.address ? `<span><strong>Address:</strong> ${escapeHtml(record.contact.address)}</span>` : ""}
      </div>
      <div class="empty">No inventory invoices found for this customer.</div>
    `;
  }
  return `
    <div class="inventory-customer-summary">
      <div><small>Total Invoiced</small><strong>${escapeHtml(inventoryCurrencyTotalsText(record.totalByCurrency) || "0")}</strong></div>
      <div><small>Total VAT</small><strong>${escapeHtml(inventoryCurrencyTotalsText(record.taxByCurrency) || "0")}</strong></div>
      <div><small>Total Paid</small><strong>${escapeHtml(inventoryCurrencyTotalsText(record.paidByCurrency) || "0")}</strong></div>
      <div><small>Outstanding</small><strong>${escapeHtml(inventoryCurrencyTotalsText(record.balanceByCurrency) || "0")}</strong></div>
    </div>
    <div class="inventory-customer-contact">
      <span><strong>Bill To:</strong> ${escapeHtml(record.customerName)}</span>
      ${record.contact.phone ? `<span><strong>Phone:</strong> ${escapeHtml(record.contact.phone)}</span>` : ""}
      ${record.contact.address ? `<span><strong>Address:</strong> ${escapeHtml(record.contact.address)}</span>` : ""}
    </div>
    <div class="inventory-customer-section">
      <h4>Invoices</h4>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Invoice</th><th>Items</th><th>VAT</th><th>Total</th><th>Paid</th><th>Balance</th><th>Action</th></tr></thead>
          <tbody>
            ${record.invoices.map(invoice => `
              <tr>
                <td>${escapeHtml(displayDate(invoice.oldestDate || invoice.date || "-"))}</td>
                <td>${escapeHtml(invoice.invoiceNumber || invoice.receiptNumber)}</td>
                <td>${escapeHtml(invoice.itemSummary || `${invoice.lineCount} item${invoice.lineCount === 1 ? "" : "s"}`)}</td>
                <td>${escapeHtml(invoice.taxText || "-")}</td>
                <td>${escapeHtml(invoice.totalText)}</td>
                <td>${escapeHtml(invoice.paidText)}</td>
                <td>${escapeHtml(invoice.balanceText || "-")}</td>
                <td><button class="tiny inventoryCustomerInvoicePdfBtn" type="button" data-entry-id="${escapeHtml(invoice.entryId)}"><i class="fa-solid fa-download"></i> Invoice</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
    <div class="inventory-customer-section">
      <h4>Payment Statement</h4>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Type</th><th>Invoice / Receipt</th><th>Details</th><th>VAT</th><th>Debit</th><th>Credit</th><th>Balance</th><th>Download</th></tr></thead>
          <tbody>
            ${record.statementRows.map(row => `
              <tr>
                <td>${escapeHtml(displayDate(row.date || "-"))}</td>
                <td>${escapeHtml(row.type)}</td>
                <td>${escapeHtml(row.receiptNumber)}</td>
                <td>${escapeHtml(row.details || "-")}</td>
                <td>${escapeHtml(row.taxText || "-")}</td>
                <td>${escapeHtml(row.debitText || "-")}</td>
                <td>${escapeHtml(row.creditText || "-")}</td>
                <td>${escapeHtml(row.balanceText || "-")}</td>
                <td>
                  ${row.action === "invoice"
                    ? `<button class="tiny inventoryCustomerInvoicePdfBtn" type="button" data-entry-id="${escapeHtml(row.entryId)}"><i class="fa-solid fa-file-invoice"></i></button>`
                    : `<button class="tiny ghost inventoryCustomerReceiptPdfBtn" type="button" data-entry-id="${escapeHtml(row.entryId)}"><i class="fa-solid fa-receipt"></i></button>`}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function openInventoryCustomerModal(customerName){
  const record = getInventoryCustomerRecord(customerName);
  state.inventoryDraft.customerRecordName = record.customerName || customerName || "";
  if (els.inventoryCustomerTitle) els.inventoryCustomerTitle.textContent = record.customerName || "Customer record";
  if (els.inventoryCustomerDesc) {
    els.inventoryCustomerDesc.textContent = `${record.invoices.length} invoice${record.invoices.length === 1 ? "" : "s"} sorted by date with receipts and payment statement.`;
  }
  if (els.inventoryCustomerBody) {
    els.inventoryCustomerBody.innerHTML = renderInventoryCustomerRecord(record);
    els.inventoryCustomerBody.querySelectorAll(".inventoryCustomerInvoicePdfBtn").forEach(btn => {
      btn.addEventListener("click", () => downloadInventoryReceiptPDF(btn.dataset.entryId));
    });
    els.inventoryCustomerBody.querySelectorAll(".inventoryCustomerReceiptPdfBtn").forEach(btn => {
      btn.addEventListener("click", () => downloadInventoryPaymentReceiptPDF(btn.dataset.entryId));
    });
  }
  if (els.inventoryCustomerModal) {
    els.inventoryCustomerModal.classList.remove("hide");
    els.inventoryCustomerModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }
}

async function downloadInventoryPaymentReceiptPDF(entryId){
  const sourceEntry = state.entries.find(entry => entry.id === entryId && entry.entry_kind !== "principal" && hasGoodsTag(entry.notes));
  if (!sourceEntry){
    alert("Payment receipt entry not found.");
    return;
  }
  if (!window.jspdf){
    alert("PDF library loading. Please try again.");
    return;
  }
  const sourceMeta = goodsMetaFromNotes(sourceEntry.notes);
  const receiptNumber = sourceMeta.receiptNumber || shortId(sourceEntry.id) || "N/A";
  const receiptData = getInventoryReceiptData(receiptNumber, sourceEntry);
  const invoiceNumber = receiptData.invoiceNumber || inventoryInvoiceNumberFromMeta(sourceMeta, sourceEntry);
  const paymentReceiptNumber = inventoryPaymentReceiptNumberFromMeta(sourceMeta, sourceEntry, sourceMeta.settlementId || `${invoiceNumber}:initial`);
  const rows = [];
  const paidByCurrency = new Map();
  let receiptDate = sourceEntry.action_date || sourceEntry.created_at || "";
  let receiptLabel = isInventorySettlementAction(sourceEntry) ? "Balance Payment Receipt" : "Initial Payment Receipt";

  if (isInventorySettlementAction(sourceEntry)){
    const settlementId = sourceMeta.settlementId || "";
    const settlementRows = receiptData.settlementEntries.filter(entry => {
      const meta = goodsMetaFromNotes(entry.notes);
      return settlementId ? meta.settlementId === settlementId : entry.id === sourceEntry.id;
    });
    settlementRows.forEach(entry => {
      const meta = goodsMetaFromNotes(entry.notes);
      const amount = Number(entry.action_amount || 0);
      addCurrencyTotal(paidByCurrency, entry.currency || receiptData.currency, amount);
      rows.push([
        displayDate(entry.action_date || receiptDate || "-"),
        inventoryInvoiceNumberFromMeta(meta, entry) || invoiceNumber,
        entry.person_name || meta.itemCode || "Inventory item",
        formatPdfAmount(amount, entry.currency || receiptData.currency),
        formatPdfAmount(meta.balanceAmount || 0, entry.currency || receiptData.currency)
      ]);
    });
  } else {
    receiptData.saleRows.filter(row => row.initialPaid > 0.00000001).forEach(row => {
      addCurrencyTotal(paidByCurrency, row.currency || receiptData.currency, row.initialPaid || 0);
      rows.push([
        displayDate(row.entry.action_date || receiptDate || "-"),
        invoiceNumber,
        row.itemName || row.itemCode || "Inventory item",
        formatPdfAmount(row.initialPaid || 0, row.currency || receiptData.currency),
        formatPdfAmount(Math.max(row.total - row.initialPaid, 0), row.currency || receiptData.currency)
      ]);
    });
  }

  if (!rows.length){
    alert("No payment amount found for this receipt.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  await loadCustomFontsForPdf(doc);
  const logoData = await getPdfLogo();
  const title = receiptLabel;
  const subtitle = `Receipt ID: ${paymentReceiptNumber}`;
  drawPdfHeader(doc, logoData, title, subtitle);
  drawPdfOwnerBlock(doc, 48);

  doc.setTextColor(23, 33, 43);
  doc.setFontSize(10);
  doc.text(`Customer: ${receiptData.customerName || sourceMeta.customerName || "Walk-in customer"}`, 132, 48);
  doc.text(`Receipt Date: ${displayDate(receiptDate || "-")}`, 132, 54);
  doc.text(`Invoice ID: ${invoiceNumber}`, 132, 60);
  doc.text(`Paid: ${inventoryCurrencyTotalsText(paidByCurrency, { forPdf: true })}`, 132, 66, { maxWidth: 58 });
  doc.text(`Invoice VAT: ${formatInventoryTotalsByCurrency(receiptData.totalsByCurrency, "tax", { forPdf: true }) || "-"}`, 132, 72, { maxWidth: 58 });

  doc.autoTable({
    startY: 84,
    head: [["Date", "Invoice", "Notes/Description", "Paid", "Line Balance"]],
    body: rows,
    theme: "grid",
    headStyles: { fillColor: [36, 87, 214], textColor: 255, fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 2.4, overflow: "linebreak" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 27 },
      1: { cellWidth: 28 },
      2: { cellWidth: 64 },
      3: { cellWidth: 31, halign: "right" },
      4: { cellWidth: 32, halign: "right" }
    },
    margin: { top: 50, bottom: 40 },
    didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
  });
  doc.setFontSize(9.5);
  doc.setTextColor(102, 112, 133);
  doc.text(`Notes/Description: ${cleanGoodsDisplayNote(sourceEntry.notes) || "-"}`, 14, doc.lastAutoTable.finalY + 10);
  doc.save(`Payment_Receipt_${String(paymentReceiptNumber).replace(/\s+/g, "_")}.pdf`);
}

async function downloadInventoryCustomerStatementPDF(customerName){
  const record = getInventoryCustomerRecord(customerName);
  if (!record.invoices.length){
    alert("No inventory records found for this customer.");
    return;
  }
  if (!window.jspdf){
    alert("PDF library loading. Please try again.");
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  await loadCustomFontsForPdf(doc);
  const logoData = await getPdfLogo();
  const title = "Inventory Customer Statement";
  const subtitle = `Customer: ${record.customerName}`;
  drawPdfHeader(doc, logoData, title, subtitle);
  drawPdfOwnerBlock(doc, 48);

  doc.setTextColor(23, 33, 43);
  doc.setFontSize(10);
  doc.text(`Bill To: ${record.customerName}`, 132, 48);
  if (record.contact.phone) doc.text(`Phone: ${record.contact.phone}`, 132, 54);
  if (record.contact.address) doc.text(`Address: ${record.contact.address}`, 132, record.contact.phone ? 60 : 54, { maxWidth: 58 });

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, 78, 182, 30, 2, 2, "F");
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, 78, 182, 30, 2, 2, "S");
  doc.setFontSize(9.2);
  doc.setTextColor(51, 65, 85);
  doc.text(`Invoices: ${record.invoices.length}`, 18, 86);
  doc.text(`Total: ${inventoryCurrencyTotalsText(record.totalByCurrency, { forPdf: true }) || "0"}`, 18, 94);
  doc.text(`VAT: ${inventoryCurrencyTotalsText(record.taxByCurrency, { forPdf: true }) || "0"}`, 110, 86);
  doc.text(`Paid: ${inventoryCurrencyTotalsText(record.paidByCurrency, { forPdf: true }) || "0"}`, 110, 94);
  doc.text(`Balance: ${inventoryCurrencyTotalsText(record.balanceByCurrency, { forPdf: true }) || "0"}`, 110, 102);

  doc.autoTable({
    startY: 116,
    head: [["Date", "Type", "Invoice / Receipt", "Notes/Description", "VAT", "Debit", "Credit", "Balance"]],
    body: record.statementRows.map(row => [
      displayDate(row.date || "-"),
      row.action === "receipt" ? "Receipt" : row.type,
      row.receiptNumber,
      row.details || "-",
      row.taxPdfText || row.taxText || "-",
      row.debitPdfText || row.debitText || "-",
      row.creditPdfText || row.creditText || "-",
      row.balancePdfText || row.balanceText || "-"
    ]),
    theme: "grid",
    headStyles: { fillColor: [36, 87, 214], textColor: 255, fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 7.4, cellPadding: 1.8, overflow: "linebreak" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 22 },
      2: { cellWidth: 25 },
      3: { cellWidth: 31 },
      4: { cellWidth: 20, halign: "right" },
      5: { cellWidth: 21, halign: "right" },
      6: { cellWidth: 21, halign: "right" },
      7: { cellWidth: 20, halign: "right" }
    },
    margin: { top: 50, bottom: 40 },
    didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
  });
  doc.save(`Inventory_Customer_Statement_${String(record.customerName || "customer").replace(/\s+/g, "_")}.pdf`);
}

function inventoryTaxDefaultsForGroup(group) {
  const setting = getTaxSettingForCurrency(group?.currency || state.lastCurrency || "AED");
  const rate = group?.defaultTaxRate != null ? group.defaultTaxRate : setting.rate;
  const mode = group?.defaultTaxMode || setting.mode;
  return { rate: normalizeTaxRate(rate), mode: normalizeTaxMode(mode) };
}

function syncGoodsPurchaseTaxDefaults(force = false) {
  if (!els.goodsBoughtForm) return;
  const currentGroup = getGoodsGroups({ applyUiFilters: false }).find(g => g.group_id === state.inventoryDraft.purchaseGroupId);
  const currency = currentGroup?.currency || String(els.goodsBoughtForm.querySelector('[name="currency"]')?.value || state.lastCurrency || "AED");
  const defaults = inventoryTaxDefaultsForGroup(currentGroup || { currency });
  if (force || els.goodsBoughtForm.dataset.taxManual !== "true") {
    if (els.goodsPurchaseTaxApplied) els.goodsPurchaseTaxApplied.checked = defaults.rate > 0;
    if (els.goodsPurchaseTaxRate) els.goodsPurchaseTaxRate.value = defaults.rate ? trimInventoryNumber(defaults.rate, 2) : "";
    if (els.goodsPurchaseTaxMode) els.goodsPurchaseTaxMode.value = defaults.mode;
  }
  updateGoodsBoughtTotal();
}

function getGoodsPurchaseTaxBreakdown() {
  if (!els.goodsBoughtForm) return calculateTaxBreakdown(0, 0, TAX_MODE_ADD, false);
  const price = Number(els.goodsBoughtForm.querySelector('[name="actual_price"]')?.value || 0);
  const category = normalizeInventoryCategory(els.goodsBoughtForm.querySelector('[name="item_category"]')?.value);
  const unit = els.goodsBoughtForm.querySelector('[name="quantity_unit"]')?.value || inventoryBaseUnitForCategory(category);
  const qty = normalizeInventoryQuantityInput(els.goodsBoughtForm.querySelector('[name="bought_qty"]')?.value, category, unit);
  const baseAmount = price * qty;
  const applied = !!els.goodsPurchaseTaxApplied?.checked;
  const rate = normalizeTaxRate(els.goodsPurchaseTaxRate?.value);
  const mode = normalizeTaxMode(els.goodsPurchaseTaxMode?.value);
  return calculateTaxBreakdown(baseAmount, rate, mode, applied);
}

function updateGoodsBoughtTotal(){
  if (!els.goodsBoughtForm || !els.goodsBoughtTotalAmount) return;
  const breakdown = getGoodsPurchaseTaxBreakdown();
  els.goodsBoughtTotalAmount.value = breakdown.total ? trimInventoryNumber(breakdown.total) : "";
  if (els.goodsPurchaseTaxPreview) {
    const currency = String(els.goodsBoughtForm.querySelector('[name="currency"]')?.value || state.lastCurrency || "AED");
    els.goodsPurchaseTaxPreview.textContent = formatTaxSummary(breakdown, currency);
  }
}

function syncGoodsBoughtCategoryFields(){
  if (!els.goodsBoughtForm) return;
  const categorySelect = els.goodsBoughtForm.querySelector('[name="item_category"]');
  const unitSelect = els.goodsBoughtForm.querySelector('[name="quantity_unit"]');
  const unitWrap = els.goodsBoughtForm.querySelector("[data-inventory-unit-wrap]");
  const qtyInput = els.goodsBoughtForm.querySelector('[name="bought_qty"]');
  const priceLabel = els.goodsBoughtForm.querySelector("[data-inventory-price-label]");
  const sellingLabel = els.goodsBoughtForm.querySelector("[data-inventory-selling-label]");
  const qtyLabel = els.goodsBoughtForm.querySelector("[data-inventory-qty-label]");
  const category = normalizeInventoryCategory(categorySelect?.value);
  const isWeight = category === INVENTORY_CATEGORY_WEIGHT;

  if (unitWrap) unitWrap.classList.toggle("hide", !isWeight);
  if (unitSelect){
    unitSelect.disabled = !isWeight;
    unitSelect.value = isWeight ? normalizeInventoryUnit(unitSelect.value, category) : INVENTORY_UNIT_ITEM;
  }
  if (qtyInput){
    qtyInput.min = isWeight ? "0.001" : "1";
    qtyInput.step = isWeight ? "0.001" : "1";
    qtyInput.placeholder = isWeight ? "Weight" : "Quantity";
  }
  if (priceLabel) priceLabel.textContent = isWeight ? "Purchase price / KG" : "Purchase price";
  if (sellingLabel) sellingLabel.textContent = isWeight ? "Selling price / KG" : "Selling price";
  if (qtyLabel) qtyLabel.textContent = isWeight ? "Weight" : "Quantity";
  updateGoodsBoughtTotal();
}

function getInventoryCustomerNames(){
  return [...new Set(
    state.entries
      .filter(e => hasGoodsTag(e.notes) && e.entry_kind !== "principal")
      .map(e => goodsMetaFromNotes(e.notes).customerName)
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));
}

function getInventoryCustomerContact(name){
  const target = String(name || "").trim().toLowerCase();
  if (!target) return { phone: "", address: "" };
  const rows = state.entries
    .filter(e => hasGoodsTag(e.notes) && e.entry_kind !== "principal")
    .map(entry => ({ entry, meta: goodsMetaFromNotes(entry.notes) }))
    .filter(row => String(row.meta.customerName || "").trim().toLowerCase() === target)
    .sort((a, b) => dateStamp(b.entry.action_date || b.entry.created_at) - dateStamp(a.entry.action_date || a.entry.created_at));
  const phone = rows.find(row => row.meta.customerPhone)?.meta.customerPhone || "";
  const address = rows.find(row => row.meta.customerAddress)?.meta.customerAddress || "";
  return { phone, address };
}

function buildTransferEvents(){
  const wf = state.expenseWalletFilter;
  const accounts = getExpenseAccounts({ applyUiFilters: false });
  const accountsByGroup = new Map(accounts.map(a => [a.group_id, a]));
  const out = [];
  for (const account of accounts){
    if (account.currency === "BTC") continue;
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
  const showOtherCurrencyLeg = isPageCurrencyAll();
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
        otherLegDisplay: ev.sameCurrency || !showOtherCurrencyLeg ? "—" : `${moneyText(ev.amtIn, ev.curIn)}`,
        otherLegPdfDisplay: ev.sameCurrency || !showOtherCurrencyLeg ? "—" : `${moneyText(ev.amtIn, ev.curIn, { forPdf: true })}`,
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
        otherLegDisplay: ev.sameCurrency || !showOtherCurrencyLeg ? "—" : `${moneyText(ev.amtOut, ev.curOut)}`,
        otherLegPdfDisplay: ev.sameCurrency || !showOtherCurrencyLeg ? "—" : `${moneyText(ev.amtOut, ev.curOut, { forPdf: true })}`,
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
    if (account.currency === "BTC") continue;
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
                ${group.rows.map(row => `
                  <tr>
                    <td>${escapeHtml(displayDate(row.date))}</td>
                    <td><span class="badge ${row.kind === "principal" ? "blue" : row.kind === "partial" ? "orange" : "green"}">${row.kind === "principal" ? "Principal" : row.kind === "partial" ? "Partial" : "Full"}</span></td>
                    <td>${money(row.amount, group.currency)}</td>
                    <td><strong>${money(row.remainingAfter, group.currency)}</strong></td>
                    <td class="loan-note-cell">
                      <span class="loan-note-inline" title="${escapeHtml(row.note)}">${escapeHtml(row.note)}</span>
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

function getInventorySelectableGroups(){
  return getGoodsGroups({ applyUiFilters: false }).filter(g => g.remainingQty > 0);
}

function inventoryGroupOptionLabel(group){
  const codePart = group.itemCode ? `${group.itemCode} - ` : "";
  return `${codePart}${group.person_name} - ${inventoryQtyLabel(group.remainingQty, group.itemCategory)} left`;
}

function renderGoodsCustomerOptions(){
  if (!els.goodsCustomerSelect) return;
  const names = getInventoryCustomerNames();
  els.goodsCustomerSelect.innerHTML = [
    '<option value="">Select customer</option>',
    ...names.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`),
    `<option value="${INVENTORY_NEW_CUSTOMER_VALUE}">+ Add new customer</option>`
  ].join("");
  if (!names.length) els.goodsCustomerSelect.value = INVENTORY_NEW_CUSTOMER_VALUE;
  syncGoodsCustomerFields();
}

function syncGoodsCustomerFields(){
  if (!els.goodsCustomerSelect || !els.goodsNewCustomerField || !els.goodsNewCustomerName) return;
  const isNew = els.goodsCustomerSelect.value === INVENTORY_NEW_CUSTOMER_VALUE;
  els.goodsNewCustomerField.classList.toggle("hide", !isNew);
  if (els.goodsNewCustomerPhoneField) els.goodsNewCustomerPhoneField.classList.toggle("hide", !isNew);
  if (els.goodsNewCustomerAddressField) els.goodsNewCustomerAddressField.classList.toggle("hide", !isNew);
  els.goodsNewCustomerName.required = isNew;
  if (!isNew) {
    els.goodsNewCustomerName.value = "";
    if (els.goodsNewCustomerPhone) els.goodsNewCustomerPhone.value = "";
    if (els.goodsNewCustomerAddress) els.goodsNewCustomerAddress.value = "";
  }
}

function getSelectedGoodsCustomerName(form){
  const selected = String(form.querySelector('[name="customer_name_select"]')?.value || "").trim();
  if (selected === INVENTORY_NEW_CUSTOMER_VALUE){
    return String(form.querySelector('[name="new_customer_name"]')?.value || "").trim();
  }
  return selected;
}

function getSelectedGoodsCustomerContact(form){
  const selected = String(form.querySelector('[name="customer_name_select"]')?.value || "").trim();
  if (selected === INVENTORY_NEW_CUSTOMER_VALUE){
    return {
      phone: String(form.querySelector('[name="new_customer_phone"]')?.value || "").trim(),
      address: String(form.querySelector('[name="new_customer_address"]')?.value || "").trim()
    };
  }
  return getInventoryCustomerContact(selected);
}

function inventorySaleUnitOptions(group){
  const category = normalizeInventoryCategory(group?.itemCategory);
  if (category === INVENTORY_CATEGORY_WEIGHT){
    return `
      <option value="${INVENTORY_UNIT_KG}">KG</option>
      <option value="${INVENTORY_UNIT_GRAM}">Gram</option>
    `;
  }
  return `<option value="${INVENTORY_UNIT_ITEM}">Pcs</option>`;
}

function buildGoodsSaleLine(groupId = ""){
  const groups = getInventorySelectableGroups();
  const options = ['<option value="">Select item</option>']
    .concat(groups.map(group => `<option value="${escapeHtml(group.group_id)}" ${group.group_id === groupId ? "selected" : ""}>${escapeHtml(inventoryGroupOptionLabel(group))}</option>`))
    .join("");
  const selectedGroup = groups.find(g => g.group_id === groupId);
  const selectedCategory = normalizeInventoryCategory(selectedGroup?.itemCategory);
  const taxDefault = inventoryTaxDefaultsForGroup(selectedGroup);
  return `
    <div class="inventory-sale-line" data-tax-manual="false">
      <select class="select goods-sale-item">${options}</select>
      <input class="input goods-sale-qty" type="number" min="${selectedCategory === INVENTORY_CATEGORY_WEIGHT ? "0.001" : "1"}" step="${selectedCategory === INVENTORY_CATEGORY_WEIGHT ? "0.001" : "1"}" value="1" placeholder="${selectedCategory === INVENTORY_CATEGORY_WEIGHT ? "Weight" : "Qty"}" />
      <select class="select goods-sale-unit">${inventorySaleUnitOptions(selectedGroup)}</select>
      <input class="input goods-sale-price" type="number" min="0" step="0.00000001" placeholder="${selectedCategory === INVENTORY_CATEGORY_WEIGHT ? "Price / KG" : "Unit price"}" />
      <input class="input goods-sale-line-total" type="text" readonly placeholder="Total" />
      <button class="icon-btn ghost goods-sale-remove" type="button" aria-label="Remove item" title="Remove item">
        <i class="fa-solid fa-trash"></i>
      </button>
      <div class="inventory-sale-line-meta">${selectedGroup ? escapeHtml(`${selectedGroup.currency} | ${selectedGroup.itemCode || "No code"} | ${selectedCategory === INVENTORY_CATEGORY_WEIGHT ? "Weight" : "Numbers"}`) : ""}</div>
      <div class="inventory-sale-tax-controls">
        <label class="checkbox-line">
          <input class="goods-sale-tax-applied" type="checkbox" ${taxDefault.rate > 0 ? "checked" : ""} />
          <span>VAT</span>
        </label>
        <input class="input goods-sale-tax-rate" type="number" min="0" max="100" step="0.01" value="${taxDefault.rate ? escapeHtml(trimInventoryNumber(taxDefault.rate, 2)) : ""}" placeholder="VAT %" />
        <select class="select goods-sale-tax-mode">
          <option value="ADD" ${taxDefault.mode === TAX_MODE_ADD ? "selected" : ""}>Add VAT to line</option>
          <option value="INCLUDE" ${taxDefault.mode === TAX_MODE_INCLUDE ? "selected" : ""}>VAT included</option>
        </select>
        <span class="inventory-sale-tax-summary">VAT off</span>
      </div>
    </div>
  `;
}

function syncGoodsSaleLineMeta(line){
  if (!line) return;
  const groupId = line.querySelector(".goods-sale-item")?.value || "";
  const group = getInventorySelectableGroups().find(g => g.group_id === groupId);
  const meta = line.querySelector(".inventory-sale-line-meta");
  if (meta) {
    meta.textContent = group
      ? `${group.currency} | ${group.itemCode || "No code"} | ${normalizeInventoryCategory(group.itemCategory) === INVENTORY_CATEGORY_WEIGHT ? "Weight" : "Numbers"} | Stock ${inventoryQtyLabel(group.remainingQty, group.itemCategory)}`
      : "";
  }
}

function getGoodsSaleTotalsByCurrency(){
  const totalsByCurrency = new Map();
  if (!els.goodsSaleLines) return totalsByCurrency;
  const lines = Array.from(els.goodsSaleLines.querySelectorAll(".inventory-sale-line"));
  for (const line of lines){
    const groupId = line.querySelector(".goods-sale-item")?.value || "";
    const group = getInventorySelectableGroups().find(g => g.group_id === groupId);
    const amount = Number(line.querySelector(".goods-sale-line-total")?.dataset.rawTotal || 0);
    if (!group || !amount) continue;
    totalsByCurrency.set(group.currency, (totalsByCurrency.get(group.currency) || 0) + amount);
  }
  return totalsByCurrency;
}

function formatInventoryTotalsByCurrency(totalsByCurrency, key = null, options = {}){
  const rows = totalsByCurrency instanceof Map
    ? Array.from(totalsByCurrency.entries())
    : Object.entries(totalsByCurrency || {});
  return rows
    .filter(([, value]) => key ? Number.isFinite(Number(value?.[key])) : Number(value || 0))
    .map(([currency, value]) => moneyText(key ? value[key] : value, currency, options))
    .join(" | ");
}

function updateGoodsSalePaymentFields(totalsByCurrency = getGoodsSaleTotalsByCurrency()){
  if (!els.goodsSalePaidAmount || !els.goodsSaleBalanceAmount) return;
  const totals = Array.from(totalsByCurrency.entries()).filter(([, amount]) => Number(amount || 0) > 0);
  if (!totals.length){
    els.goodsSalePaidAmount.disabled = false;
    els.goodsSalePaidAmount.value = "";
    els.goodsSaleBalanceAmount.value = "";
    els.goodsSalePaidAmount.removeAttribute("max");
    updateGoodsSaleWalletSelector(totalsByCurrency);
    return;
  }
  if (totals.length !== 1){
    els.goodsSalePaidAmount.disabled = true;
    els.goodsSalePaidAmount.value = "";
    els.goodsSalePaidAmount.dataset.autoPaid = "true";
    els.goodsSalePaidAmount.placeholder = "Multiple currencies";
    els.goodsSalePaidAmount.removeAttribute("max");
    els.goodsSaleBalanceAmount.value = formatInventoryTotalsByCurrency(totalsByCurrency);
    applyCurrencyFontClass(els.goodsSaleBalanceAmount, "");
    updateGoodsSaleWalletSelector(totalsByCurrency);
    return;
  }
  const [currency, total] = totals[0];
  els.goodsSalePaidAmount.disabled = false;
  els.goodsSalePaidAmount.placeholder = "0.00";
  els.goodsSalePaidAmount.max = trimInventoryNumber(total);
  if (els.goodsSalePaidAmount.dataset.autoPaid !== "false"){
    els.goodsSalePaidAmount.value = trimInventoryNumber(total);
    els.goodsSalePaidAmount.dataset.autoPaid = "true";
  }
  const paid = Math.max(Number(els.goodsSalePaidAmount.value || 0), 0);
  const balance = Math.max(Number(total || 0) - Math.min(paid, Number(total || 0)), 0);
  els.goodsSaleBalanceAmount.value = moneyText(balance, currency);
  applyCurrencyFontClass(els.goodsSaleBalanceAmount, currency);
  updateGoodsSaleWalletSelector(totalsByCurrency);
}

function updateGoodsSaleGrandTotal(){
  if (!els.goodsSaleGrandTotal || !els.goodsSaleLines) return;
  const totalsByCurrency = getGoodsSaleTotalsByCurrency();
  els.goodsSaleGrandTotal.value = totalsByCurrency.size
    ? formatInventoryTotalsByCurrency(totalsByCurrency)
    : "";
  const onlyCurrency = totalsByCurrency.size === 1 ? Array.from(totalsByCurrency.keys())[0] : "";
  applyCurrencyFontClass(els.goodsSaleGrandTotal, onlyCurrency);
  updateGoodsSalePaymentFields(totalsByCurrency);
}

function updateGoodsSaleLine(line, sourceEl = null){
  if (!line) return;
  const groupId = line.querySelector(".goods-sale-item")?.value || "";
  const group = getInventorySelectableGroups().find(g => g.group_id === groupId);
  const qtyInput = line.querySelector(".goods-sale-qty");
  const unitSelect = line.querySelector(".goods-sale-unit");
  const priceInput = line.querySelector(".goods-sale-price");
  const totalInput = line.querySelector(".goods-sale-line-total");
  const taxAppliedInput = line.querySelector(".goods-sale-tax-applied");
  const taxRateInput = line.querySelector(".goods-sale-tax-rate");
  const taxModeInput = line.querySelector(".goods-sale-tax-mode");
  const taxSummary = line.querySelector(".inventory-sale-tax-summary");
  const category = normalizeInventoryCategory(group?.itemCategory);
  const itemChanged = sourceEl?.classList?.contains("goods-sale-item");
  const taxChanged = sourceEl?.classList?.contains("goods-sale-tax-applied") ||
    sourceEl?.classList?.contains("goods-sale-tax-rate") ||
    sourceEl?.classList?.contains("goods-sale-tax-mode");
  if (taxChanged) line.dataset.taxManual = "true";
  if (unitSelect && group){
    const selectedUnit = normalizeInventoryUnit(unitSelect.value, category);
    unitSelect.innerHTML = inventorySaleUnitOptions(group);
    unitSelect.value = selectedUnit;
    unitSelect.disabled = category !== INVENTORY_CATEGORY_WEIGHT;
  }
  if (qtyInput){
    qtyInput.min = category === INVENTORY_CATEGORY_WEIGHT ? "0.001" : "1";
    qtyInput.step = category === INVENTORY_CATEGORY_WEIGHT ? "0.001" : "1";
    qtyInput.placeholder = category === INVENTORY_CATEGORY_WEIGHT ? "Weight" : "Qty";
  }
  if (priceInput) priceInput.placeholder = category === INVENTORY_CATEGORY_WEIGHT ? "Price / KG" : "Unit price";
  const rawQtyValue = String(qtyInput?.value || "").trim();
  const qty = rawQtyValue
    ? normalizeInventoryQuantityInput(rawQtyValue, category, unitSelect?.value || inventoryBaseUnitForCategory(category))
    : 0;
  const visibleQty = category === INVENTORY_CATEGORY_WEIGHT
    ? Number(qtyInput?.value || 0)
    : qty;
  if (qtyInput && document.activeElement !== qtyInput && visibleQty > 0) qtyInput.value = trimInventoryNumber(visibleQty, category === INVENTORY_CATEGORY_WEIGHT ? 3 : 0);
  const editingPrice = sourceEl === priceInput;
  if (group && priceInput && !editingPrice && (!priceInput.value || Number(priceInput.value) <= 0)){
    const defaultPrice = Number(group.defaultUnitSoldPrice || 0) || Number(group.unitActualPrice || 0);
    priceInput.value = defaultPrice ? trimInventoryNumber(defaultPrice) : "";
  }
  if (group && (itemChanged || line.dataset.taxManual !== "true")) {
    const taxDefault = inventoryTaxDefaultsForGroup(group);
    if (taxAppliedInput) taxAppliedInput.checked = taxDefault.rate > 0;
    if (taxRateInput) taxRateInput.value = taxDefault.rate ? trimInventoryNumber(taxDefault.rate, 2) : "";
    if (taxModeInput) taxModeInput.value = taxDefault.mode;
    line.dataset.taxManual = "false";
  }
  const lineBase = qty * Number(priceInput?.value || 0);
  const breakdown = calculateTaxBreakdown(
    lineBase,
    taxRateInput?.value,
    taxModeInput?.value,
    !!taxAppliedInput?.checked
  );
  if (totalInput){
    totalInput.dataset.rawNet = String(breakdown.net);
    totalInput.dataset.rawTax = String(breakdown.tax);
    totalInput.dataset.rawTotal = String(breakdown.total);
    totalInput.dataset.taxRate = String(breakdown.rate);
    totalInput.dataset.taxMode = breakdown.mode;
    totalInput.dataset.taxApplied = breakdown.applied ? "1" : "0";
    totalInput.value = group && breakdown.total ? moneyText(breakdown.total, group.currency) : "";
    applyCurrencyFontClass(totalInput, group?.currency || "");
  }
  if (taxSummary) taxSummary.textContent = group ? formatTaxSummary(breakdown, group.currency) : "Select item for VAT";
  syncGoodsSaleLineMeta(line);
  updateGoodsSaleGrandTotal();
}

function addGoodsSaleLine(groupId = ""){
  if (!els.goodsSaleLines) return;
  els.goodsSaleLines.insertAdjacentHTML("beforeend", buildGoodsSaleLine(groupId));
  const line = els.goodsSaleLines.lastElementChild;
  updateGoodsSaleLine(line);
  toggleGoodsSaleRemoveButtons();
}

function toggleGoodsSaleRemoveButtons(){
  if (!els.goodsSaleLines) return;
  const lines = els.goodsSaleLines.querySelectorAll(".inventory-sale-line");
  lines.forEach(line => {
    const btn = line.querySelector(".goods-sale-remove");
    if (btn) btn.disabled = lines.length === 1;
  });
}

function renderGoodsSaleLines(prefillGroupIds = []){
  if (!els.goodsSaleLines) return;
  const ids = prefillGroupIds.length ? prefillGroupIds : [""];
  els.goodsSaleLines.innerHTML = ids.map(groupId => buildGoodsSaleLine(groupId)).join("");
  els.goodsSaleLines.querySelectorAll(".inventory-sale-line").forEach(line => updateGoodsSaleLine(line));
  toggleGoodsSaleRemoveButtons();
}

function collectGoodsSaleLines(){
  if (!els.goodsSaleLines) return [];
  return Array.from(els.goodsSaleLines.querySelectorAll(".inventory-sale-line")).map(line => {
    const groupId = line.querySelector(".goods-sale-item")?.value || "";
    const group = getInventorySelectableGroups().find(g => g.group_id === groupId);
    const category = normalizeInventoryCategory(group?.itemCategory);
    const unit = normalizeInventoryUnit(line.querySelector(".goods-sale-unit")?.value, category);
    const qtyValue = String(line.querySelector(".goods-sale-qty")?.value || "").trim();
    const qty = qtyValue ? normalizeInventoryQuantityInput(qtyValue, category, unit) : 0;
    const unitPrice = Number(line.querySelector(".goods-sale-price")?.value || 0);
    const totalInput = line.querySelector(".goods-sale-line-total");
    return {
      groupId,
      qty,
      unitPrice,
      unit,
      itemCategory: category,
      taxApplied: totalInput?.dataset.taxApplied === "1",
      taxRate: normalizeTaxRate(totalInput?.dataset.taxRate),
      taxMode: normalizeTaxMode(totalInput?.dataset.taxMode),
      taxAmount: Number(totalInput?.dataset.rawTax || 0),
      netAmount: Number(totalInput?.dataset.rawNet || 0),
      grossAmount: Number(totalInput?.dataset.rawTotal || 0)
    };
  }).filter(line => line.groupId);
}

function getGoodsGroups(options = {}){
  const applyUiFilters = options.applyUiFilters !== false;
  const groups = groupByLoan(getActiveEntries().filter(e =>
    (e.direction === "goods" || (e.direction === "taken" && hasGoodsTag(e.notes))) &&
    !isInventoryCustomerOnlyEntry(e)
  ))
    .map(group => {
      const principalMeta = goodsMetaFromNotes(group.principal?.notes);
      const purchaseActions = group.actions.filter(row => inferGoodsActionType(row) === INVENTORY_TX_PURCHASE);
      const settlementActions = group.actions.filter(isInventorySettlementAction);
      const saleActions = group.actions.filter(isInventorySaleAction);
      const purchaseMetas = purchaseActions.map(row => goodsMetaFromNotes(row.notes));
      const itemCategory = normalizeInventoryCategory(
        principalMeta.itemCategory || purchaseMetas.find(meta => meta.itemCategory)?.itemCategory
      );
      const quantityUnit = normalizeInventoryUnit(
        principalMeta.quantityUnit || purchaseMetas.find(meta => meta.quantityUnit)?.quantityUnit,
        itemCategory
      );
      const principalBoughtQty = normalizeStoredInventoryQty(principalMeta.boughtQty, itemCategory, 1);
      const restockQty = purchaseMetas.reduce((sum, meta) => sum + normalizeStoredInventoryQty(meta.boughtQty, itemCategory, 1), 0);
      const boughtQty = principalBoughtQty + restockQty;
      const principalBought = Number(group.principal?.principal_amount || 0);
      const restockTotal = purchaseActions.reduce((sum, row) => sum + Number(row.action_amount || 0), 0);
      const bought = principalBought + restockTotal;
      const unitActualPrice = boughtQty ? (bought / boughtQty) : bought;
      const soldQty = saleActions.reduce((sum, row) => sum + normalizeStoredInventoryQty(goodsMetaFromNotes(row.notes).soldQty, itemCategory, 1), 0);
      const soldTotal = saleActions.reduce((sum, row) => sum + Number(row.action_amount || 0), 0);
      const initialPaidTotal = saleActions.reduce((sum, row) => sum + inventoryLinePaidAmount(goodsMetaFromNotes(row.notes), row.action_amount || 0), 0);
      const settlementTotal = settlementActions.reduce((sum, row) => sum + Number(row.action_amount || 0), 0);
      const paidTotal = Math.min(soldTotal, initialPaidTotal + settlementTotal);
      const balanceTotal = Math.max(soldTotal - paidTotal, 0);
      const remainingQty = Math.max(boughtQty - soldQty, 0);
      const status = soldQty + 0.00000001 >= boughtQty ? "Sold" : soldQty > 0 ? "Partial" : "In Stock";
      const soldCostBasis = soldQty > 0 ? unitActualPrice * soldQty : 0;
      const profitLoss = soldQty > 0 ? (soldTotal - soldCostBasis) : 0;
      const purchaseDefaultPrice = purchaseMetas
        .map(meta => Number(meta.unitSoldPrice || 0))
        .filter(price => price > 0)
        .pop() || 0;
      const defaultUnitSoldPrice = Number(principalMeta.unitSoldPrice || 0) || purchaseDefaultPrice;
      const taxDefaultMeta = (principalMeta.taxRate != null || principalMeta.taxMode)
        ? principalMeta
        : (purchaseMetas.filter(meta => meta.taxRate != null || meta.taxMode).pop() || principalMeta);
      const currencyTaxDefault = getTaxSettingForCurrency(group.currency);
      const defaultTaxRate = taxDefaultMeta.taxRate != null ? normalizeTaxRate(taxDefaultMeta.taxRate) : currencyTaxDefault.rate;
      const defaultTaxMode = taxDefaultMeta.taxMode ? normalizeTaxMode(taxDefaultMeta.taxMode) : currencyTaxDefault.mode;
      const principalPurchaseTax = taxBreakdownFromMeta(principalMeta, group.principal?.principal_amount || 0).tax;
      const purchaseTaxTotal = principalPurchaseTax + purchaseActions.reduce((sum, row) => sum + taxBreakdownFromMeta(goodsMetaFromNotes(row.notes), row.action_amount || 0).tax, 0);
      const salesTaxTotal = saleActions.reduce((sum, row) => sum + taxBreakdownFromMeta(goodsMetaFromNotes(row.notes), row.action_amount || 0).tax, 0);
      return {
        ...group,
        actions: saleActions,
        purchaseActions,
        settlementActions,
        bought,
        boughtQty,
        soldQty,
        remainingQty,
        unitActualPrice,
        soldTotal,
        paidTotal,
        balanceTotal,
        soldCostBasis,
        soldCount: saleActions.length,
        profitLoss,
        status,
        itemCode: principalMeta.itemCode || "",
        itemDescription: principalMeta.itemDescription || cleanGoodsDisplayNote(group.principal?.notes) || "",
        itemCategory,
        quantityUnit,
        defaultUnitSoldPrice,
        defaultTaxRate,
        defaultTaxMode,
        purchaseTaxTotal,
        salesTaxTotal,
        latestSoldDate: saleActions.length
          ? saleActions.slice().sort((a, b) => dateStamp(b.action_date) - dateStamp(a.action_date))[0]?.action_date
          : null
      };
    });

  if (!applyUiFilters) return groups;

  return groups.filter(group => {
      if (!matchesSearch(group.principal || {}, state.search.goods)) return false;
      const f = state.statusFilter.goods;
      if (f === "Open") return group.status === "In Stock" || group.status === "Partial";
      if (f === "LowStock") return group.remainingQty > 0.00000001 && group.boughtQty > 0 && (group.remainingQty / group.boughtQty) <= 0.15;
      if (f === "Closed") return group.status === "Sold";
      return true;
    });
}

function renderGoodsSelectors(){
  const groups = getGoodsGroups().filter(g => g.remainingQty > 0);
  els.goodsItemSelect.innerHTML = groups.length
    ? `<option value="">Choose purchased item</option>${groups.map(g => `<option value="${escapeHtml(g.group_id)}">${escapeHtml(g.person_name)} - ${escapeHtml(inventoryQtyLabel(g.remainingQty, g.itemCategory))} left</option>`).join("")}`
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
  const title = "Inventory Item Invoice";
  const subtitle = `Item: ${group.itemCode || shortId(group.group_id) || "N/A"}`;
  drawPdfHeader(doc, logoData, title, subtitle);
  drawPdfOwnerBlock(doc, 48);

  const fmt = amt => formatPdfAmount(amt, group.currency);
  doc.setTextColor(23, 33, 43);
  doc.setFontSize(10);
  doc.text(`Item: ${group.person_name || "Unnamed item"}`, 132, 48);
  doc.text(`Status: ${group.status}`, 132, 54);
  doc.text(`In Stock: ${inventoryQtyLabel(group.remainingQty, group.itemCategory)}`, 132, 60);
  doc.text(`Purchase Date: ${displayDate(group.principal?.loan_date || "—")}`, 132, 66);
  doc.text(`Net ${group.profitLoss >= 0 ? "Profit" : "Loss"}: ${fmt(Math.abs(group.profitLoss))}`, 132, 72);

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, 78, 182, 28, 2, 2, "F");
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, 78, 182, 28, 2, 2, "S");
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.text(`Purchase Total: ${fmt(group.bought || 0)}`, 18, 86);
  doc.text(`Sales Total: ${fmt(group.soldTotal || 0)}`, 18, 93);
  doc.text(`Paid Total: ${fmt(group.paidTotal || 0)}`, 105, 86);
  doc.text(`Balance Amount: ${fmt(group.balanceTotal || 0)}`, 105, 93);
  doc.text(`Purchase Qty: ${inventoryQtyLabel(group.boughtQty, group.itemCategory)}`, 18, 100);
  doc.text(`Sold Qty: ${inventoryQtyLabel(group.soldQty, group.itemCategory)}`, 105, 100);
  doc.text(`VAT: ${fmt((group.purchaseTaxTotal || 0) + (group.salesTaxTotal || 0))}`, 150, 100);

  const principalTax = taxBreakdownFromMeta(goodsMetaFromNotes(group.principal?.notes), group.principal?.principal_amount || 0);
  const rows = [
    {
      type: "Purchase",
      date: group.principal?.loan_date,
      qty: inventoryQtyLabel(group.boughtQty - group.purchaseActions.reduce((sum, row) => sum + normalizeStoredInventoryQty(goodsMetaFromNotes(row.notes).boughtQty, group.itemCategory, 1), 0), group.itemCategory),
      net: fmt(principalTax.net || 0),
      vat: principalTax.tax ? fmt(principalTax.tax) : "-",
      amount: fmt(principalTax.total || group.principal?.principal_amount || 0),
      paid: "—",
      balance: "—",
      status: "—",
      note: group.itemDescription || cleanGoodsDisplayNote(group.principal?.notes) || "Opening stock"
    },
    ...group.purchaseActions.map(row => {
      const meta = goodsMetaFromNotes(row.notes);
      const tax = taxBreakdownFromMeta(meta, row.action_amount || 0);
      return {
        type: "Purchase",
        date: row.action_date,
        qty: inventoryQtyLabel(meta.boughtQty || 0, group.itemCategory),
        net: fmt(tax.net || 0),
        vat: tax.tax ? fmt(tax.tax) : "-",
        amount: fmt(tax.total || row.action_amount || 0),
        paid: "—",
        balance: "—",
        status: "—",
        note: cleanGoodsDisplayNote(row.notes) || "Additional stock"
      };
    }),
    ...group.actions.map(row => {
      const meta = goodsMetaFromNotes(row.notes);
      const receipt = meta.receiptNumber || shortId(row.id);
      const receiptData = getInventoryReceiptData(receipt, row);
      const invoiceNumber = receiptData.invoiceNumber || inventoryInvoiceNumberFromMeta(meta, row);
      const saleSummary = receiptData.saleRows.find(saleRow => saleRow.entry.id === row.id);
      return {
        type: "Sold",
        date: row.action_date,
        qty: inventoryQtyLabel(meta.soldQty || 0, group.itemCategory),
        net: fmt(saleSummary?.netAmount || 0),
        vat: saleSummary?.taxAmount ? fmt(saleSummary.taxAmount) : "-",
        amount: fmt(row.action_amount || 0),
        paid: fmt(saleSummary?.paid || inventoryLinePaidAmount(meta, row.action_amount || 0)),
        balance: fmt(saleSummary?.balance || 0),
        status: saleSummary?.paymentStatus || inventoryPaymentStatus(meta, row.action_amount || 0),
        note: `${meta.customerName || "Walk-in customer"} | ${invoiceNumber}`
      };
    }),
    ...group.settlementActions.map(row => {
      const meta = goodsMetaFromNotes(row.notes);
      const balance = inventoryLineBalanceAmount(meta, 0);
      return {
        type: "Settlement",
        date: row.action_date,
        qty: "—",
        amount: fmt(row.action_amount || 0),
        paid: fmt(row.action_amount || 0),
        balance: fmt(balance),
        status: inventoryPaymentStatus(meta, balance),
        note: `${meta.customerName || "Walk-in customer"} | ${inventoryInvoiceNumberFromMeta(meta, row)} | ${cleanGoodsDisplayNote(row.notes) || "Balance settlement"}`
      };
    })
  ].sort((a, b) => dateStamp(a.date) - dateStamp(b.date));
  doc.autoTable({
    startY: 114,
    head: [["Type", "Date", "Notes/Description", "Qty", "Status", "Net", "VAT", "Paid", "Balance", "Total"]],
    body: rows.map(row => [row.type, displayDate(row.date || "-"), row.note, row.qty, row.status, row.net || "-", row.vat || "-", row.paid, row.balance, row.amount]),
    theme: "grid",
    tableWidth: 170,
    headStyles: { fillColor: [36, 87, 214], textColor: 255, fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 7.2, cellPadding: 1.8, overflow: "linebreak", cellWidth: "wrap" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 12, halign: "center" },
      1: { cellWidth: 14 },
      2: { cellWidth: 46 },
      3: { cellWidth: 12, halign: "right" },
      4: { cellWidth: 14 },
      5: { cellWidth: 16, halign: "right" },
      6: { cellWidth: 14, halign: "right" },
      7: { cellWidth: 14, halign: "right" },
      8: { cellWidth: 14, halign: "right" },
      9: { cellWidth: 18, halign: "right" }
    },
    margin: { left: 16, right: 16, top: 50, bottom: 40 },
    didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
  });
  doc.save(`Goods_${String(group.person_name || "item").replace(/\s+/g, "_")}.pdf`);
}

async function downloadGoodsSoldReceiptPDF(entryId){
  return downloadInventoryReceiptPDF(entryId);
  const saleEntry = state.entries.find(e => e.id === entryId && (e.direction === "goods" || e.direction === "taken") && e.entry_kind !== "principal" && hasGoodsTag(e.notes));
  if (!saleEntry){
    alert("Sold entry not found.");
    return;
  }
  const principalEntry = state.entries.find(e => e.group_id === saleEntry.group_id && e.entry_kind === "principal");
  if (!principalEntry){
    alert("Original purchase record not found.");
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
  doc.text(`Currency: ${pdfCurrencyLabel(saleEntry.currency || "")}`, 132, 60);
  doc.text(`Qty Sold: ${soldQty}`, 132, 66);

  doc.autoTable({
    startY: 78,
    head: [["Description", "Qty", "Unit Price", "Total"]],
    body: [[
      principalEntry.person_name || "Goods item",
      String(soldQty),
      formatPdfAmount(unitSoldPrice, saleEntry.currency),
      formatPdfAmount(soldTotal, saleEntry.currency)
    ]],
    theme: "grid",
    headStyles: { fillColor: [36, 87, 214] },
    margin: { top: 50, bottom: 40 },
    didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
  });

  doc.setFontSize(9.5);
  doc.setTextColor(102, 112, 133);
  doc.text(`Notes/Description: ${String(saleEntry.notes || "—").replace(GOODS_TAG, "").trim() || "—"}`, 14, doc.lastAutoTable.finalY + 10);
  doc.save(`Sold_Receipt_${String(principalEntry.person_name || "item").replace(/\s+/g, "_")}_${String(saleEntry.id || "").slice(0, 6)}.pdf`);
}

function renderGoodsList(){
  const groups = getGoodsGroups();
  if (!groups.length){
    els.goodsList.innerHTML = `<div class="empty">No goods entries found.</div>`;
    return;
  }
  const boughtCount = inventoryQtySummary(groups, "boughtQty");
  const soldCount = inventoryQtySummary(groups, "soldQty");
  const stockCount = inventoryQtySummary(groups, "remainingQty");
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
                <span>Purchase ${escapeHtml(displayDate(group.principal?.loan_date || "—"))}</span>
                <span>${currencySymbolHtml(group.currency || "")}</span>
                <span>${escapeHtml(normalizeInventoryCategory(group.itemCategory) === INVENTORY_CATEGORY_WEIGHT ? "Weight" : "Numbers")}</span>
                <span>Qty ${escapeHtml(inventoryQtyLabel(group.soldQty, group.itemCategory))}/${escapeHtml(inventoryQtyLabel(group.boughtQty, group.itemCategory))}</span>
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
                  <button class="menu-item goodsActionBtn" type="button" data-action="edit-bought" data-entry-id="${escapeHtml(group.principal?.id || "")}">Edit Purchase</button>
                  <button class="menu-item danger goodsActionBtn" type="button" data-action="delete-item" data-entry-id="${escapeHtml(group.principal?.id || "")}">Delete Item</button>
                </div>
              </div>
            </div>
          </div>
        </summary>
        <div class="detail">
          <div class="table-wrap">
            <table>
              <thead><tr><th>Type</th><th>Date</th><th>Amount</th><th>VAT</th><th>Notes</th><th>Action</th></tr></thead>
              <tbody>
                ${soldRows.length ? soldRows.map(row => `
                  <tr>
                    <td><span class="badge green">Sold</span></td>
                    <td>${escapeHtml(displayDate(row.action_date || "—"))}</td>
                    <td>${money(row.action_amount || 0, group.currency)}</td>
                    <td>${taxBreakdownFromMeta(goodsMetaFromNotes(row.notes), row.action_amount || 0).tax ? money(taxBreakdownFromMeta(goodsMetaFromNotes(row.notes), row.action_amount || 0).tax, group.currency) : "-"}</td>
                    <td>${escapeHtml(row.notes || "—")}</td>
                    <td>
                      <div style="display:flex;gap:4px;">
                        <button class="tiny soldReceiptBtn" data-id="${escapeHtml(row.id)}">PDF</button>
                        <button class="tiny ghost editRowBtn" data-id="${escapeHtml(row.id)}">✎</button>
                        <button class="tiny danger delRowBtn" data-id="${escapeHtml(row.id)}">✕</button>
                      </div>
                    </td>
                  </tr>
                `).join("") : `<tr><td colspan="6">No sold entries yet.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    `;
  }).join("") + `
    <div class="summary" style="margin-top:8px">
      <span>Goods Summary</span>
      <strong>Purchase Qty: ${escapeHtml(boughtCount)} | Sold Qty: ${escapeHtml(soldCount)} | In Stock Qty: ${escapeHtml(stockCount)}</strong>
    </div>
  `;

  els.goodsList.querySelectorAll(".goodsActionBtn").forEach(btn => btn.addEventListener("click", async e => {
    e.preventDefault();
    const action = btn.dataset.action;
    if (action === "pdf") await downloadGoodsItemPDF(btn.dataset.groupId);
    if (action === "edit-bought") openEditModal(btn.dataset.entryId);
    if (action === "delete-item") await deleteEntry(btn.dataset.entryId);
  }));
  els.goodsList.querySelectorAll(".soldReceiptBtn").forEach(btn => btn.addEventListener("click", () => downloadInventoryReceiptPDF(btn.dataset.id)));
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

async function downloadInventoryReceiptPDF(entryId){
  const saleEntry = state.entries.find(e => e.id === entryId && e.entry_kind !== "principal" && hasGoodsTag(e.notes));
  if (!saleEntry){
    alert("Sold entry not found.");
    return;
  }
  if (!window.jspdf){
    alert("PDF library loading. Please try again.");
    return;
  }
  const meta = goodsMetaFromNotes(saleEntry.notes);
  const receiptNumber = meta.receiptNumber || shortId(saleEntry.id) || "N/A";
  const receiptData = getInventoryReceiptData(receiptNumber, saleEntry);
  const invoiceNumber = receiptData.invoiceNumber || inventoryInvoiceNumberFromMeta(meta, saleEntry);
  const receiptRows = receiptData.saleRows;
  if (!receiptRows.length){
    alert("No sale lines found for this invoice.");
    return;
  }
  const totalsByCurrency = receiptData.totalsByCurrency;
  const soldTotal = receiptData.totalAmount;
  const currency = receiptData.currency || saleEntry.currency || receiptRows[0]?.currency || "AED";
  const customerName = receiptData.customerName || meta.customerName || "Walk-in customer";
  const customerPhone = receiptData.customerPhone || meta.customerPhone || "";
  const customerAddress = receiptData.customerAddress || meta.customerAddress || "";
  const totalQtyText = inventoryQtySummary(receiptRows, "qty");
  const totalAmountText = formatInventoryTotalsByCurrency(totalsByCurrency, "total", { forPdf: true }) || moneyText(soldTotal, currency, { forPdf: true });
  const netAmountText = formatInventoryTotalsByCurrency(totalsByCurrency, "net", { forPdf: true }) || moneyText(soldTotal, currency, { forPdf: true });
  const taxAmountText = formatInventoryTotalsByCurrency(totalsByCurrency, "tax", { forPdf: true }) || moneyText(0, currency, { forPdf: true });
  const paidAmountText = formatInventoryTotalsByCurrency(totalsByCurrency, "paid", { forPdf: true }) || moneyText(soldTotal, currency, { forPdf: true });
  const balanceAmountText = formatInventoryTotalsByCurrency(totalsByCurrency, "balance", { forPdf: true }) || moneyText(0, currency, { forPdf: true });
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  await loadCustomFontsForPdf(doc);
  const logoData = await getPdfLogo();
  const title = "Inventory Sales Invoice";
  const subtitle = `Invoice ID: ${invoiceNumber}`;
  drawPdfHeader(doc, logoData, title, subtitle);
  drawPdfOwnerBlock(doc, 48);
  doc.setTextColor(23, 33, 43);
  doc.setFontSize(10);
  doc.text(`Customer: ${customerName}`, 132, 48);
  doc.text(`Date: ${displayDate(receiptData.paymentRows[0]?.date || saleEntry.action_date || "—")}`, 132, 54);
  doc.text(`Lines: ${receiptRows.length}`, 132, 60);
  doc.text(`Status: ${receiptData.balanceTotal > 0.00000001 ? "Partial Paid" : "Full Paid"}`, 132, 66);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, 78, 182, 44, 2, 2, "F");
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, 78, 182, 44, 2, 2, "S");
  doc.setFontSize(9.2);
  doc.setTextColor(51, 65, 85);
  let billY = 86;
  doc.text(`Bill To: ${customerName}`, 18, billY);
  billY += 6;
  if (customerPhone) {
    doc.text(`Phone: ${customerPhone}`, 18, billY);
    billY += 6;
  }
  if (customerAddress) {
    const addressLines = doc.splitTextToSize(`Address: ${customerAddress}`, 84).slice(0, 2);
    doc.text(addressLines, 18, billY);
    billY += addressLines.length * 6;
  }
  doc.text(`Invoice No: ${invoiceNumber}`, 18, Math.min(billY, 116));
  doc.text(`Net Amount: ${netAmountText}`, 110, 86);
  doc.text(`Issued On: ${displayDate(receiptData.paymentRows[0]?.date || saleEntry.action_date || "-")}`, 110, 92);
  doc.text(`VAT Amount: ${taxAmountText}`, 110, 100);
  doc.text(`Total Amount: ${totalAmountText}`, 110, 106);
  doc.text(`Paid: ${paidAmountText}`, 110, 112);
  doc.text(`Balance: ${balanceAmountText}`, 110, 118);

  doc.autoTable({
    startY: 130,
    head: [["#", "Item Name", "Quantity", "Net", "VAT", "Total"]],
    body: receiptRows.map(row => [
      String(row.sr),
      row.itemName,
      row.qtyDisplay,
      formatPdfAmount(row.netAmount || 0, row.currency),
      row.taxAmount ? `${formatPdfAmount(row.taxAmount, row.currency)} (${trimInventoryNumber(row.taxRate, 2)}%)` : "-",
      formatPdfAmount(row.total, row.currency)
    ]),
    theme: "grid",
    headStyles: { fillColor: [36, 87, 214], textColor: 255, fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 9, cellPadding: 3, overflow: "linebreak" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 9, halign: "center" },
      1: { cellWidth: 67 },
      2: { cellWidth: 28, halign: "right" },
      3: { cellWidth: 27, halign: "right" },
      4: { cellWidth: 24, halign: "right" },
      5: { cellWidth: 27, halign: "right" }
    },
    margin: { top: 50, bottom: 40 },
    didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
  });
  let afterTableY = doc.lastAutoTable.finalY + 8;
  if (receiptData.paymentRows.length){
    doc.autoTable({
      startY: afterTableY,
      head: [["Settlement", "Date", "Paid", "Balance"]],
      body: receiptData.paymentRows.map(row => [
        row.type,
        displayDate(row.date || "—"),
        formatPdfAmount(row.amount || 0, row.currency || currency),
        formatPdfAmount(row.balanceAfter || 0, row.currency || currency)
      ]),
      theme: "grid",
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold" },
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 2.5 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 52 },
        1: { cellWidth: 32 },
        2: { cellWidth: 48, halign: "right" },
        3: { cellWidth: 50, halign: "right" }
      },
      margin: { top: 50, bottom: 40 },
      didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
    });
    afterTableY = doc.lastAutoTable.finalY + 8;
  }
  const showCurrencyInSummary = totalsByCurrency.size > 1;
  const summaryRows = Array.from(totalsByCurrency.entries()).flatMap(([rowCurrency, amounts]) => [
    [showCurrencyInSummary ? `${pdfCurrencyLabel(rowCurrency)} net amount` : "Net amount", formatPdfAmount(amounts.net || 0, rowCurrency)],
    [showCurrencyInSummary ? `${pdfCurrencyLabel(rowCurrency)} VAT amount` : "VAT amount", formatPdfAmount(amounts.tax || 0, rowCurrency)],
    [showCurrencyInSummary ? `${pdfCurrencyLabel(rowCurrency)} total amount` : "Total amount", formatPdfAmount(amounts.total, rowCurrency)],
    [showCurrencyInSummary ? `${pdfCurrencyLabel(rowCurrency)} paid amount` : "Paid amount", formatPdfAmount(amounts.paid, rowCurrency)],
    [showCurrencyInSummary ? `${pdfCurrencyLabel(rowCurrency)} balance amount` : "Balance amount", formatPdfAmount(amounts.balance, rowCurrency)]
  ]);
  doc.autoTable({
    startY: afterTableY,
    body: summaryRows,
    theme: "plain",
    styles: { font: "helvetica", fontSize: 9.5, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 38, halign: "right", fontStyle: "bold", textColor: [51, 65, 85] },
      1: { cellWidth: 38, halign: "right", textColor: [15, 23, 42] }
    },
    margin: { left: 120, right: 14, top: 50, bottom: 40 },
    didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
  });
  doc.setFontSize(9.5);
  doc.setTextColor(102, 112, 133);
  const noteY = Math.max(afterTableY + 10, doc.lastAutoTable.finalY + 8);
  doc.text(`Total Qty: ${totalQtyText}`, 14, noteY);
  doc.text(`Notes/Description: ${cleanGoodsDisplayNote(saleEntry.notes) || "—"}`, 14, noteY + 6);
  doc.text(`Prepared for: ${customerName}`, 14, noteY + 12);
  doc.save(`Invoice_${String(invoiceNumber).replace(/\s+/g, "_")}.pdf`);
}

function renderInventoryList(){
  const groups = getGoodsGroups();
  const outstandingBanner = renderInventoryOutstandingBanner();
  if (!groups.length){
    els.goodsList.innerHTML = `${outstandingBanner}<div class="empty">No inventory items found.</div>`;
    els.goodsList.querySelectorAll(".soldReceiptBtn").forEach(btn => btn.addEventListener("click", () => downloadInventoryReceiptPDF(btn.dataset.id)));
    els.goodsList.querySelectorAll(".clearBalanceBtn").forEach(btn => btn.addEventListener("click", () => openGoodsSettlementModal(btn.dataset.id)));
    els.goodsList.querySelectorAll(".inventoryOutstandingCustomerPdfBtn").forEach(btn => btn.addEventListener("click", () => downloadOutstandingCustomerInvoicePDF(btn.dataset.customer)));
    els.goodsList.querySelectorAll(".inventoryOutstandingCustomerSettleBtn").forEach(btn => btn.addEventListener("click", () => openGoodsCustomerSettlementModal(btn.dataset.customer)));
    bindInventoryOutstandingBanner(els.goodsList);
    return;
  }
  const boughtCount = inventoryQtySummary(groups, "boughtQty");
  const soldCount = inventoryQtySummary(groups, "soldQty");
  const stockCount = inventoryQtySummary(groups, "remainingQty");
  els.goodsList.innerHTML = outstandingBanner + groups.map(group => {
    const statusClass = group.status === "Sold" ? "green" : "orange";
    const pnlClass = group.profitLoss >= 0 ? "green" : "red";
    const pnlLabel = group.profitLoss >= 0 ? "Profit" : "Loss";
    const historyRows = [
      {
        kind: "Purchased",
        badge: "blue",
        date: group.principal?.loan_date,
        amount: group.principal?.principal_amount,
        note: group.itemDescription || cleanGoodsDisplayNote(group.principal?.notes) || "Opening stock",
        paymentStatus: "—",
        paidDisplay: "—",
        balanceDisplay: "—",
        entryId: group.principal?.id || ""
      },
      ...group.purchaseActions.map(row => ({
        kind: "Purchased",
        badge: "blue",
        date: row.action_date,
        amount: row.action_amount,
        note: cleanGoodsDisplayNote(row.notes) || "Additional stock",
        paymentStatus: "—",
        paidDisplay: "—",
        balanceDisplay: "—",
        entryId: row.id
      })),
      ...group.actions.map(row => {
        const meta = goodsMetaFromNotes(row.notes);
        const receipt = meta.receiptNumber || shortId(row.id);
        const customer = meta.customerName || "Walk-in customer";
        const noteText = cleanGoodsDisplayNote(row.notes) || "Sale entry";
        const receiptData = getInventoryReceiptData(receipt, row);
        const invoiceNumber = receiptData.invoiceNumber || inventoryInvoiceNumberFromMeta(meta, row);
        const saleSummary = receiptData.saleRows.find(saleRow => saleRow.entry.id === row.id);
        const paymentStatus = saleSummary?.paymentStatus || inventoryPaymentStatus(meta, row.action_amount || 0);
        const balance = Number(saleSummary?.balance || 0);
        return {
          kind: "Sold",
          badge: "green",
          date: row.action_date,
          amount: row.action_amount,
          note: `${customer} | ${invoiceNumber}${noteText ? ` | ${noteText}` : ""}`,
          paymentStatus,
          paymentBadge: paymentStatus === "Full Paid" ? "green" : "orange",
          paidDisplay: money(saleSummary?.paid || inventoryLinePaidAmount(meta, row.action_amount || 0), group.currency),
          balanceDisplay: money(balance, group.currency),
          canSettle: balance > 0.00000001,
          entryId: row.id
        };
      }),
      ...group.settlementActions.map(row => {
        const meta = goodsMetaFromNotes(row.notes);
        const receipt = meta.receiptNumber || shortId(row.id);
        const invoiceNumber = inventoryInvoiceNumberFromMeta(meta, row);
        const customer = meta.customerName || "Walk-in customer";
        const balance = inventoryLineBalanceAmount(meta, 0);
        const status = inventoryPaymentStatus(meta, balance);
        return {
          kind: "Settlement",
          badge: "orange",
          date: row.action_date,
          amount: row.action_amount,
          note: `${customer} | ${invoiceNumber || receipt} | ${cleanGoodsDisplayNote(row.notes) || "Balance settlement"}`,
          paymentStatus: status,
          paymentBadge: status === "Full Paid" ? "green" : "orange",
          paidDisplay: money(row.action_amount || 0, group.currency),
          balanceDisplay: money(balance, group.currency),
          canSettle: false,
          entryId: row.id
        };
      })
    ].sort((a, b) => dateStamp(b.date) - dateStamp(a.date));
    return `
      <details class="loan">
        <summary>
          <div class="loan-top">
            <div class="lt-main">
              <div class="loan-name"><i class="fa-solid fa-box"></i> ${escapeHtml(group.person_name || "Unnamed item")}</div>
              <div class="loan-sub">
                <span>${escapeHtml(group.itemCode || "No code")}</span>
                <span>Purchase ${escapeHtml(displayDate(group.principal?.loan_date || "—"))}</span>
                <span>${currencySymbolHtml(group.currency || "")}</span>
                <span>${escapeHtml(normalizeInventoryCategory(group.itemCategory) === INVENTORY_CATEGORY_WEIGHT ? "Weight" : "Numbers")}</span>
                <span>Qty sold ${escapeHtml(inventoryQtyLabel(group.soldQty, group.itemCategory))}/${escapeHtml(inventoryQtyLabel(group.boughtQty, group.itemCategory))}</span>
                <span>In stock ${escapeHtml(inventoryQtyLabel(group.remainingQty, group.itemCategory))}</span>
                <span class="badge ${statusClass}">${escapeHtml(group.status)}</span>
              </div>
            </div>
            <div class="cell lt-principal"><small>Actual total</small><strong>${money(group.bought, group.currency)}</strong></div>
            <div class="cell lt-movement"><small>Sold total</small><strong>${money(group.soldTotal, group.currency)}</strong></div>
            <div class="cell lt-remaining"><small>${pnlLabel}</small><strong><span class="badge ${pnlClass}">${money(Math.abs(group.profitLoss), group.currency)}</span></strong></div>
            <div class="lt-action">
              <div class="inventory-inline-actions">
                <button class="icon-btn ghost inventoryQuickBtn" type="button" data-action="purchase" data-group-id="${escapeHtml(group.group_id)}" title="Add purchase">
                  <i class="fa-solid fa-cart-plus"></i>
                </button>
                <button class="icon-btn ghost inventoryQuickBtn" type="button" data-action="sell" data-group-id="${escapeHtml(group.group_id)}" title="Create sale">
                  <i class="fa-solid fa-cash-register"></i>
                </button>
              </div>
              <div class="menu-wrap">
                <button class="icon-btn ghost menu-trigger person-menu-btn" type="button" data-goods-menu="${escapeHtml(group.group_id)}">☰</button>
                <div class="menu-dropdown" data-goods-menu-panel="${escapeHtml(group.group_id)}">
                  <button class="menu-item goodsActionBtn" type="button" data-action="pdf" data-group-id="${escapeHtml(group.group_id)}"><i class="fa-solid fa-download"></i> Download PDF</button>
                  <button class="menu-item goodsActionBtn" type="button" data-action="edit-bought" data-entry-id="${escapeHtml(group.principal?.id || "")}">Edit Item</button>
                  <button class="menu-item danger goodsActionBtn" type="button" data-action="delete-item" data-entry-id="${escapeHtml(group.principal?.id || "")}">Delete Item</button>
                </div>
              </div>
            </div>
          </div>
        </summary>
        <div class="detail">
          ${group.itemDescription ? `<div class="detail-head"><div><h4>Description</h4><p>${escapeHtml(group.itemDescription)}</p></div></div>` : ""}
          <div class="table-wrap">
            <table>
              <thead><tr><th>Type</th><th>Date</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Payment</th><th>Notes</th><th>Action</th></tr></thead>
              <tbody>
                ${historyRows.length ? historyRows.map(row => `
                  <tr>
                    <td><span class="badge ${escapeHtml(row.badge)}">${escapeHtml(row.kind)}</span></td>
                    <td>${escapeHtml(displayDate(row.date || "—"))}</td>
                    <td>${money(row.amount || 0, group.currency)}</td>
                    <td>${row.paidDisplay || "—"}</td>
                    <td>${row.balanceDisplay || "—"}</td>
                    <td>${row.paymentStatus === "—" ? "—" : `<span class="badge ${escapeHtml(row.paymentBadge || "orange")}">${escapeHtml(row.paymentStatus)}</span>`}</td>
                    <td>${escapeHtml(row.note || "—")}</td>
                    <td>
                      <div style="display:flex;gap:4px;">
                        ${row.kind === "Sold" || row.kind === "Settlement" ? `<button class="tiny soldReceiptBtn" data-id="${escapeHtml(row.entryId)}" title="Download receipt"><i class="fa-solid fa-download"></i></button>` : `<button class="tiny invoiceDownloadBtn" data-group-id="${escapeHtml(group.group_id)}" title="Download invoice"><i class="fa-solid fa-file-invoice"></i></button>`}
                        ${row.canSettle ? `<button class="tiny ghost clearBalanceBtn" data-id="${escapeHtml(row.entryId)}" title="Clear balance">Clear</button>` : ""}
                        <button class="tiny ghost editRowBtn" data-id="${escapeHtml(row.entryId)}">✎</button>
                        <button class="tiny danger delRowBtn" data-id="${escapeHtml(row.entryId)}">✕</button>
                      </div>
                    </td>
                  </tr>
                `).join("") : `<tr><td colspan="8">No inventory activity yet.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    `;
  }).join("") + `
    <div class="summary" style="margin-top:8px">
      <span>Inventory Summary</span>
      <strong>Purchase Qty: ${escapeHtml(boughtCount)} | Sold Qty: ${escapeHtml(soldCount)} | In Stock Qty: ${escapeHtml(stockCount)}</strong>
    </div>
  `;

  els.goodsList.querySelectorAll(".inventoryQuickBtn").forEach(btn => btn.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    if (btn.dataset.action === "purchase") openGoodsModal("bought", { groupId: btn.dataset.groupId });
    if (btn.dataset.action === "sell") openGoodsModal("sold", { groupId: btn.dataset.groupId });
  }));
  els.goodsList.querySelectorAll(".goodsActionBtn").forEach(btn => btn.addEventListener("click", async e => {
    e.preventDefault();
    const action = btn.dataset.action;
    if (action === "pdf") await downloadGoodsItemPDF(btn.dataset.groupId);
    if (action === "edit-bought") openEditModal(btn.dataset.entryId);
    if (action === "delete-item") await deleteEntry(btn.dataset.entryId);
  }));
  els.goodsList.querySelectorAll(".soldReceiptBtn").forEach(btn => btn.addEventListener("click", () => downloadInventoryReceiptPDF(btn.dataset.id)));
  els.goodsList.querySelectorAll(".clearBalanceBtn").forEach(btn => btn.addEventListener("click", () => openGoodsSettlementModal(btn.dataset.id)));
  els.goodsList.querySelectorAll(".inventoryOutstandingCustomerPdfBtn").forEach(btn => btn.addEventListener("click", () => downloadOutstandingCustomerInvoicePDF(btn.dataset.customer)));
  els.goodsList.querySelectorAll(".inventoryOutstandingCustomerSettleBtn").forEach(btn => btn.addEventListener("click", () => openGoodsCustomerSettlementModal(btn.dataset.customer)));
  bindInventoryOutstandingBanner(els.goodsList);
  els.goodsList.querySelectorAll(".invoiceDownloadBtn").forEach(btn => btn.addEventListener("click", () => downloadGoodsItemPDF(btn.dataset.groupId)));
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
    if (nowOpen) {
      const rect = btn.getBoundingClientRect();
      panel.style.top = `${rect.bottom + 6}px`;
      panel.style.left = `${rect.right - panel.offsetWidth}px`;
      if (rect.right - panel.offsetWidth < 10) panel.style.left = `${Math.max(10, rect.left)}px`;
    }
  }));
}

function getExpenseAccounts(options = {}){
  const applyUiFilters = options.applyUiFilters !== false;
  const groups = groupByLoan(getActiveEntries().filter(e => e.direction === "taken" && hasExpenseAccountTag(e.notes)))
    .map(group => {
      const principal = group.principal;
      const principalMeta = expenseMetaFromNotes(principal?.notes);
      const isBtcLive = String(principal?.currency || "").trim() === "BTC" && !!principalMeta.btcAddress;
      const btcNetwork = isBtcLive ? expenseBtcNetworkFromMeta(principalMeta) : "";
      const btcCache = isBtcLive ? expenseBtcGetCache(principalMeta.btcAddress, btcNetwork) : null;
      const topups = isBtcLive ? [] : group.actions.filter(a => expenseMetaFromNotes(a.notes).rowType === "TOPUP");
      const spends = isBtcLive ? [] : group.actions.filter(a => expenseMetaFromNotes(a.notes).rowType === "EXPENSE");
      let openingBalance = Number(principal?.principal_amount || 0);
      let addedMoney = topups.reduce((sum, row) => sum + Number(row.action_amount || 0), 0);
      let spentMoney = spends.reduce((sum, row) => sum + Number(row.action_amount || 0), 0);
      let balance = openingBalance + addedMoney - spentMoney;

      if (isBtcLive && btcCache && btcCache.balanceSat != null) {
        openingBalance = btcSatToBtc(btcCache.fundedSat || 0);
        addedMoney = 0;
        spentMoney = btcSatToBtc(btcCache.sentSat || 0);
        balance = btcSatToBtc(btcCache.balanceSat || 0);
      }

      const status = balance > 0 ? "Open" : "Closed";
      return {
        ...group,
        accountType: principalMeta.accountType || "Bank Account",
        btcAddress: principalMeta.btcAddress || "",
        btcNetwork,
        btcCache,
        isBtcLive,
        openingBalance,
        addedMoney,
        spentMoney,
        balance,
        status,
        topups,
        spends,
        actions: isBtcLive ? [] : group.actions,
        chainTransactions: isBtcLive && btcCache && Array.isArray(btcCache.transactions) ? btcCache.transactions : []
      };
    });

  if (!applyUiFilters) return groups;

  const searchTerm = state.search.expenses;
  const status = state.statusFilter.expenses;
  const currency = state.currencyFilter.expenses || "All";
  return groups.filter(group => {
    const blob = `${group.person_name || ""} ${group.accountType || ""} ${group.btcAddress || ""} ${group.principal?.notes || ""} ${group.spends.map(s => expenseMetaFromNotes(s.notes).itemName).join(" ")} ${group.spends.map(s => expenseMetaFromNotes(s.notes).expenseType).join(" ")}`;
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

function localDateInputValue(date = new Date()){
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function addLocalDays(date, days){
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function monthStartISO(date = new Date()){
  return localDateInputValue(new Date(date.getFullYear(), date.getMonth(), 1));
}

function expenseHistoryRangeBounds(range = state.expenseHistoryRange){
  const today = new Date();
  const todayIso = localDateInputValue(today);
  if (range === "today"){
    return { from: todayIso, to: todayIso, label: "Today" };
  }
  if (range === "last7"){
    return { from: localDateInputValue(addLocalDays(today, -6)), to: todayIso, label: "Last 7 Days" };
  }
  if (range === "all"){
    return { from: "", to: "", label: "All" };
  }
  if (range === "custom"){
    return {
      from: state.expenseHistoryCustomFrom || "",
      to: state.expenseHistoryCustomTo || "",
      label: "Custom"
    };
  }
  return { from: monthStartISO(today), to: todayIso, label: "This Month" };
}

function expenseHistoryRangeText(){
  const bounds = expenseHistoryRangeBounds();
  if (!bounds.from && !bounds.to) return bounds.label;
  if (bounds.from && bounds.to) return `${bounds.label}: ${displayDate(bounds.from)} - ${displayDate(bounds.to)}`;
  if (bounds.from) return `${bounds.label}: from ${displayDate(bounds.from)}`;
  return `${bounds.label}: until ${displayDate(bounds.to)}`;
}

function isInExpenseHistoryRange(dateStr){
  const bounds = expenseHistoryRangeBounds();
  if (state.expenseHistoryRange === "custom" && !bounds.from && !bounds.to) return false;
  if (!bounds.from && !bounds.to) return true;
  const d = dateStamp(dateStr);
  if (!d) return true;
  if (bounds.from && d < dateStamp(bounds.from)) return false;
  if (bounds.to && d > dateStamp(bounds.to + "T23:59:59")) return false;
  return true;
}

function filterExpenseHistoryRows(spendAttached){
  return spendAttached.filter(({ row }) => isInExpenseHistoryRange(row.action_date));
}

function setExpenseHistoryRange(range, keepHistoryOpen = false){
  const allowed = new Set(["month", "today", "last7", "all", "custom"]);
  state.expenseHistoryRange = allowed.has(range) ? range : "month";
  if (state.expenseHistoryRange === "custom"){
    state.expenseHistoryCustomFrom = "";
    state.expenseHistoryCustomTo = "";
  }
  renderExpensesList();
  if (keepHistoryOpen){
    const section = document.getElementById("transactionsHistorySection");
    if (section) section.open = true;
  }
}

function collectExpenseSpendRows(accounts){
  const out = [];
  const wf = state.expenseWalletFilter;
  for (const account of accounts){
    if (wf !== "all" && account.group_id !== wf) continue;
    if (account.currency === "BTC") continue;
    for (const row of account.spends){
      if (!isInDateRange(row.action_date)) continue;
      out.push({ row, account });
    }
  }
  return out;
}

function btcTxDirectionForAddress(tx, walletAddress) {
  let received = 0;
  let sent = 0;

  for (const out of (tx.vout || [])) {
    if (out && out.scriptpubkey_address === walletAddress) {
      received += Number(out.value || 0);
    }
  }

  for (const input of (tx.vin || [])) {
    const prev = input && input.prevout;
    if (prev && prev.scriptpubkey_address === walletAddress) {
      sent += Number(prev.value || 0);
    }
  }

  const net = received - sent;
  let label = "self";
  let cls = "self";
  if (net > 0) { label = "received"; cls = "in"; }
  else if (net < 0) { label = "sent"; cls = "out"; }

  return { label, cls, netSat: net, receivedSat: received, sentSat: sent };
}

function expenseBtcExplorerUrl(txid, networkKey = "mainnet"){
  const safeTxid = encodeURIComponent(String(txid || ""));
  if (networkKey === "testnet") return `https://blockstream.info/testnet/tx/${safeTxid}`;
  if (networkKey === "signet") return `https://blockstream.info/signet/tx/${safeTxid}`;
  return `https://blockstream.info/tx/${safeTxid}`;
}

function expenseBtcTxDateIso(tx){
  return tx?.status?.confirmed && tx.status.block_time
    ? new Date(Number(tx.status.block_time) * 1000).toISOString().slice(0, 10)
    : "";
}

function expenseBtcAccountsForCurrentFilters(accounts){
  const currency = state.currencyFilter.expenses || "All";
  const status = state.statusFilter.expenses || "All";
  const walletFilter = state.expenseWalletFilter || "all";
  return (accounts || []).filter(account => {
    if (account.currency !== "BTC" || !account.btcAddress) return false;
    if (currency !== "All" && currency !== "BTC") return false;
    if (walletFilter !== "all" && account.group_id !== walletFilter) return false;
    if (status === "Active" && account.status !== "Open") return false;
    if (status === "Closed" && account.status !== "Closed") return false;
    return true;
  });
}

function renderExpenseBtcTransactionsSection(accounts, isOpen){
  const btcAccounts = expenseBtcAccountsForCurrentFilters(accounts);
  if (!btcAccounts.length) return "";

  const searchTerm = String(state.search.expenses || "").trim().toLowerCase();
  const rows = [];
  const notices = [];

  for (const account of btcAccounts){
    const cache = account.btcCache;
    if (cache?.loading) {
      notices.push(`<div class="empty">Loading blockchain records for ${escapeHtml(account.person_name || "BTC Wallet")}...</div>`);
    } else if (cache?.error) {
      notices.push(`<div class="empty">Could not load ${escapeHtml(account.person_name || "BTC Wallet")}: ${escapeHtml(cache.error)}</div>`);
    } else if (!account.chainTransactions.length) {
      notices.push(`<div class="empty">No blockchain transactions for ${escapeHtml(account.person_name || "BTC Wallet")}.</div>`);
    }

    for (const tx of account.chainTransactions){
      const dateIso = expenseBtcTxDateIso(tx);
      if (dateIso && !isInDateRange(dateIso)) continue;
      const dir = btcTxDirectionForAddress(tx, account.btcAddress);
      const type = dir.label === "received" ? "Received" : dir.label === "sent" ? "Sent" : "Self / change";
      const amount = dir.netSat === 0
        ? btcFormatBtcFromSat(0)
        : `${dir.netSat > 0 ? "+" : "-"}${btcFormatBtcFromSat(Math.abs(dir.netSat))}`;
      const status = tx.status?.confirmed
        ? (tx.status.block_height ? `confirmed @ ${tx.status.block_height}` : "confirmed")
        : "unconfirmed";
      const blob = `${account.person_name || ""} ${account.btcAddress || ""} ${tx.txid || ""} ${type} ${status}`.toLowerCase();
      if (searchTerm && !blob.includes(searchTerm)) continue;
      rows.push({
        account,
        tx,
        type,
        amount,
        amountStyle: dir.netSat < 0 ? "color: var(--danger);" : dir.netSat > 0 ? "color: var(--success);" : "",
        badgeClass: dir.netSat < 0 ? "orange" : dir.netSat > 0 ? "green" : "blue",
        status,
        dateText: tx.status?.confirmed ? btcFormatDate(tx.status.block_time || 0) : "mempool"
      });
    }
  }

  rows.sort((a, b) => Number(b.tx?.status?.block_time || 0) - Number(a.tx?.status?.block_time || 0));
  const statementAccount = btcAccounts.length === 1 ? btcAccounts[0] : null;
  const statementTitle = statementAccount
    ? `Download full statement for ${statementAccount.person_name || "BTC Wallet"}`
    : "Select one BTC wallet to download its full statement";

  const body = rows.length ? `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Date</th><th>Wallet</th><th>Type</th><th>Amount</th><th>Status</th><th>Txid</th><th>Action</th></tr></thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              <td>${escapeHtml(row.dateText)}</td>
              <td>
                ${getWalletIconHtml(row.account.person_name || "Wallet", 16)} ${escapeHtml(row.account.person_name || "BTC Wallet")}
                <span class="expense-wallet-address mono" title="${escapeHtml(row.account.btcAddress)}">${escapeHtml(row.account.btcAddress)}</span>
              </td>
              <td><span class="badge ${row.badgeClass}">${escapeHtml(row.type)}</span></td>
              <td style="${row.amountStyle}">${escapeHtml(row.amount)}</td>
              <td>${escapeHtml(row.status)}</td>
              <td class="mono">${escapeHtml(btcShortHash(row.tx.txid))}</td>
              <td>
                <div class="expense-tx-actions">
                  <button type="button" class="tiny ghost expenseBtcTxPdfBtn" data-group-id="${escapeHtml(row.account.group_id)}" data-tx-id="${escapeHtml(row.tx.txid)}" title="Download transaction receipt" aria-label="Download transaction receipt"><i class="fa-solid fa-download"></i></button>
                  <button type="button" class="tiny ghost expenseBtcTxBtn" data-url="${escapeHtml(expenseBtcExplorerUrl(row.tx.txid, row.account.btcNetwork))}" title="View on chain" aria-label="View on chain"><i class="fa-solid fa-link"></i></button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  ` : (notices.join("") || `<div class="empty">No blockchain transactions found.</div>`);

  return `<details class="expense-collapsible-section" id="btcBlockchainRecordsSection" ${isOpen ? "open" : ""}>
    <summary class="expense-collapsible-header">
      <h4 class="expense-section-title"><i class="fa-brands fa-bitcoin"></i> BTC Blockchain Transactions</h4>
      <span class="expense-section-actions">
        <button type="button" class="tiny ghost expenseBtcStatementBtn" data-group-id="${escapeHtml(statementAccount?.group_id || "")}" title="${escapeHtml(statementTitle)}"><i class="fa-solid fa-download"></i> Statement</button>
        <span class="expand-icon">▶</span>
      </span>
    </summary>
    <div class="expense-collapsible-content">${body}</div>
  </details>`;
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
        taxTotal: 0,
        netTotal: 0,
        txs: []
      });
    }
    const g = map.get(key);
    const gross = Number(row.action_amount || 0);
    const tax = taxBreakdownFromMeta(meta, gross);
    g.total += gross;
    g.taxTotal += Number(tax.tax || 0);
    g.netTotal += Number(tax.net || 0);
    g.txs.push({
      id: row.id,
      date: row.action_date,
      wallet: account.person_name,
      group_id: account.group_id,
      amount: gross,
      netAmount: Number(tax.net || 0),
      taxAmount: Number(tax.tax || 0),
      taxRate: Number(tax.rate || 0),
      taxMode: tax.mode,
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
    const isBtcLive = a.currency === "BTC";
    const titleAmount = isBtcLive ? Number(a.balance || 0) : totalTopup;
    const walletAddressLine = a.btcAddress
      ? `<span class="expense-wallet-address mono" title="${escapeHtml(a.btcAddress)}">${escapeHtml(a.btcAddress)}</span>`
      : "";
    const inLabel = isBtcLive ? "Received" : "Top-up";
    const outLabel = isBtcLive ? "Sent" : "Spent";
    const btcStatusLine = isBtcLive && a.btcCache?.loading
      ? `<span><em>Blockchain</em> <strong>Loading...</strong></span>`
      : isBtcLive && a.btcCache?.error
      ? `<span><em>Blockchain</em> <strong title="${escapeHtml(a.btcCache.error)}">Needs refresh</strong></span>`
      : "";
    const walletActions = isBtcLive
      ? `
          <button type="button" class="expenseWalletQuick" data-action="pdf" data-group-id="${gid}">PDF</button>
          <button type="button" class="expenseWalletQuick" data-action="edit-account" data-entry-id="${escapeHtml(a.principal?.id || "")}">Edit</button>
          <button type="button" class="expenseWalletQuick danger" data-action="delete-account" data-entry-id="${escapeHtml(a.principal?.id || "")}">Delete</button>
        `
      : `
          <button type="button" class="expenseWalletQuick" data-action="topup" data-group-id="${gid}">Add money</button>
          <button type="button" class="expenseWalletQuick" data-action="expense" data-group-id="${gid}">Add expense</button>
          <button type="button" class="expenseWalletQuick" data-action="pdf" data-group-id="${gid}">PDF</button>
          <button type="button" class="expenseWalletQuick" data-action="edit-account" data-entry-id="${escapeHtml(a.principal?.id || "")}">Edit</button>
          <button type="button" class="expenseWalletQuick danger" data-action="delete-account" data-entry-id="${escapeHtml(a.principal?.id || "")}">Delete</button>
        `;
    
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
        <label for="${rid}" class="expense-wallet-card" data-group-id="${gid}">
          <span class="expense-wallet-title">${getWalletIconHtml(a.person_name || "Wallet", 18)} ${escapeHtml(a.person_name || "Wallet")} (${escapeHtml(formatReportAmount(titleAmount, a.currency))})</span>
          ${walletAddressLine}
          <span class="expense-wallet-sub">${escapeHtml(a.accountType || "")} · ${currencySymbolHtml(a.currency)}${isBtcLive ? " · Live blockchain" : ""}</span>
          <div class="expense-wallet-stats">
            <span><em>${inLabel}</em> <strong>${escapeHtml(formatReportAmount(totalTopup, a.currency))}</strong></span>
            <span><em>${outLabel}</em> <strong>${escapeHtml(formatReportAmount(a.spentMoney, a.currency))}</strong></span>
            <span class="available-label"><em style="color: var(--success) !important;">Available</em> <strong class="available-amount">${escapeHtml(formatReportAmount(a.balance, a.currency))}</strong></span>
            ${btcUsdEquivalent}
            ${btcStatusLine}
          </div>
        </label>
        <div class="expense-wallet-actions">
          ${walletActions}
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
  const accounts = getExpenseAccounts({ applyUiFilters: false }).filter(a => a.currency !== "BTC");
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

function syncExpenseTaxDefaults(force = false) {
  if (!els.expenseEntryForm) return;
  const currency = String(els.expenseCurrencySelect?.value || state.lastCurrency || "AED");
  const defaults = getTaxSettingForCurrency(currency);
  if (force || els.expenseEntryForm.dataset.taxManual !== "true") {
    if (els.expenseTaxApplied) els.expenseTaxApplied.checked = false;
    if (els.expenseTaxRate) els.expenseTaxRate.value = defaults.rate ? trimInventoryNumber(defaults.rate, 2) : "";
    if (els.expenseTaxMode) els.expenseTaxMode.value = TAX_MODE_INCLUDE;
  }
  updateExpenseTaxPreview();
}

function getExpenseTaxBreakdown() {
  if (!els.expenseEntryForm) return calculateTaxBreakdown(0, 0, TAX_MODE_INCLUDE, false);
  const amount = Number(els.expenseEntryForm.querySelector('[name="amount"]')?.value || 0);
  const applied = !!els.expenseTaxApplied?.checked;
  const rate = normalizeTaxRate(els.expenseTaxRate?.value);
  const mode = normalizeTaxMode(els.expenseTaxMode?.value);
  return calculateTaxBreakdown(amount, rate, mode, applied);
}

function updateExpenseTaxPreview() {
  if (!els.expenseTaxPreview) return;
  const currency = String(els.expenseCurrencySelect?.value || state.lastCurrency || "AED");
  const breakdown = getExpenseTaxBreakdown();
  els.expenseTaxPreview.textContent = formatTaxSummary(breakdown, currency);
}

function openExpenseModal(mode, presetGroupId = ""){
  if ((mode === "topup" || mode === "expense") && presetGroupId) {
    const presetAccount = getExpenseAccounts({ applyUiFilters: false }).find(a => a.group_id === presetGroupId);
    if (presetAccount?.currency === "BTC") {
      alert("BTC wallet balances and transactions are loaded directly from the blockchain.");
      return;
    }
  }

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
    syncExpenseBtcAccountFields(els.expenseAccountForm);
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
    els.expenseEntryForm.dataset.taxManual = "false";
    els.expenseCurrencySelect.value = state.lastCurrency || "AED";
    renderExpenseAccountSelectors();
    syncExpenseTaxDefaults(true);
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
  const currency = String(fd.get("currency") || "AED").trim();
  const accountType = String(fd.get("account_type") || "Bank Account");
  let openingBalance = Number(fd.get("opening_balance") || 0);
  let btcAddress = "";
  let btcNetwork = "";

  if (currency === "BTC") {
    btcAddress = String(fd.get("btc_address") || "").trim();
    if (!btcAddress) throw new Error("Bitcoin wallet address is required.");
    const btcData = await fetchExpenseBtcWalletData(btcAddress);
    btcAddress = btcData.address;
    btcNetwork = btcData.networkKey;
    openingBalance = btcSatToBtc(btcData.balanceSat);
    expenseBtcSetCache(btcAddress, btcNetwork, btcData);
  }

  const payload = {
    group_id: crypto.randomUUID(),
    direction: "taken",
    entry_kind: "principal",
    person_name: String(fd.get("account_name") || "").trim(),
    currency,
    principal_amount: openingBalance,
    action_amount: null,
    loan_date: String(fd.get("account_date") || ""),
    action_date: null,
    notes: upsertExpenseMetaInNote(String(fd.get("notes") || "").trim() || null, {
      accountType,
      rowType: "ACCOUNT",
      btcAddress,
      btcNetwork
    })
  };
  if (!payload.person_name || !payload.currency || payload.principal_amount === "" || payload.principal_amount === null || payload.principal_amount === undefined || !payload.loan_date){
    throw new Error("Complete all required fields.");
  }
  validateCurrencyForForm(fd);
  if (currency === "BTC") state.expenseWalletFilter = payload.group_id;
  saveEntriesImmediately(payload, { label: "Expense account" });
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
  if (principal.currency === "BTC") throw new Error("BTC wallet balances and transactions are loaded directly from the blockchain.");
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
  saveEntriesImmediately(payload, { label: "Top-up" });
  
  // Show money added success overlay
  showMoneyAddedSuccessOverlay(principal.person_name, amount, principal.currency);
  
  closeModal("expenseModal");
}

async function saveExpenseEntry(form){
  const fd = new FormData(form);
  const groupId = String(fd.get("group_id") || "");
  const selectedCurrency = String(fd.get("currency") || "").trim();
  const enteredAmount = Number(fd.get("amount") || 0);
  const taxBreakdown = getExpenseTaxBreakdown();
  const amount = taxBreakdown.total;
  const date = String(fd.get("date") || "");
  const itemName = String(fd.get("item_name") || "").trim();
  const expenseType = String(fd.get("custom_expense_type") || "").trim() || String(fd.get("expense_type") || "").trim() || "Other";
  const notes = String(fd.get("notes") || "").trim() || null;
  const itemIntent = String(fd.get("expense_item_intent") || "additional");
  if (!groupId || !enteredAmount || !date || !itemName) throw new Error("Complete all required fields.");
  const account = getExpenseAccounts({ applyUiFilters: false }).find(a => a.group_id === groupId);
  if (!account) throw new Error("Account not found.");
  if (account.currency === "BTC") throw new Error("BTC wallet transactions are loaded directly from the blockchain.");
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
      expenseType,
      ...taxMetaFromBreakdown(taxBreakdown)
    })
  };
  saveEntriesImmediately(payload, { label: "Expense" });
  closeModal("expenseModal");
}

async function downloadExpenseAccountPDF(groupId){
  if (isGuestMode()){
    showGuestRestrictionOverlay("download");
    return;
  }
  const account = getExpenseAccounts({ applyUiFilters: false }).find(a => a.group_id === groupId);
  if (!account){
    alert("Account not found.");
    return;
  }
  if (account.isBtcLive) {
    await downloadExpenseBtcAccountPDF(account);
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
  doc.text(`Currency: ${pdfCurrencyLabel(account.currency)}`, 132, 54);
  doc.text(`Balance: ${formatPdfAmount(account.balance, account.currency)}`, 132, 60);
  
  // Add USD equivalent for BTC wallets
  if (account.currency === "BTC" && account.balance > 0 && state.bitcoin.btcPrice) {
    const usdValue = (account.balance * state.bitcoin.btcPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    doc.setTextColor(102, 112, 133); // Muted color
    doc.text(`Approx USD ${usdValue}`, 132, 66);
    doc.setFontSize(8);
    doc.setTextColor(153, 163, 180); // Lighter muted color
    doc.text(`* Dollar value as of statement generation`, 132, 72);
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
    const tax = taxBreakdownFromMeta(meta, amt);
    runningBalance = isExpense ? runningBalance - amt : runningBalance + amt;
    rows.push([
      isExpense ? `Expense (${meta.expenseType || "Other"})` : "Topup",
      displayDate(row.action_date || "—"),
      isExpense ? (meta.itemName || "—") : "—",
      formatPdfAmount(amt, account.currency),
      isExpense && tax.tax ? formatPdfAmount(tax.tax, account.currency) : "-",
      formatPdfAmount(runningBalance, account.currency),
      cleanExpenseNote(row.notes)
    ]);
  });

  doc.autoTable({
    startY: 72,
    head: [["Type", "Date", "Item", "Notes/Description", "VAT", "Amount", "Balance"]],
    body: rows.map(row => row.length === 6
      ? [row[0], row[1], row[2], row[5], "-", row[3], row[4]]
      : [row[0], row[1], row[2], row[6], row[4], row[3], row[5]]
    ),
    theme: "grid",
    headStyles: { fillColor: [36, 87, 214] },
    styles: { font: "helvetica", fontSize: 7.6, cellPadding: 1.8, overflow: "linebreak" },
    tableWidth: 182,
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 22 },
      2: { cellWidth: 24 },
      3: { cellWidth: 45 },
      4: { cellWidth: 15, halign: "right" },
      5: { cellWidth: 26, halign: "right" },
      6: { cellWidth: 26, halign: "right" }
    },
    margin: { top: 50, bottom: 40 },
    didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
  });
  doc.save(`Expense_Account_${String(account.person_name || "account").replace(/\s+/g, "_")}.pdf`);
}

function expenseBtcWalletPdfContext(account){
  const networkKey = account.btcNetwork || "mainnet";
  const networkInfo = btcGetNetworkInfo(networkKey);
  return {
    key: networkKey,
    label: networkInfo.label,
    address: account.btcAddress,
    isWatchOnly: true
  };
}

async function getExpenseBtcAccountForPdf(groupIdOrAccount, options = {}){
  const groupId = typeof groupIdOrAccount === "string" ? groupIdOrAccount : groupIdOrAccount?.group_id;
  let account = typeof groupIdOrAccount === "object" && groupIdOrAccount
    ? groupIdOrAccount
    : getExpenseAccounts({ applyUiFilters: false }).find(a => a.group_id === groupId);
  if (!account?.isBtcLive || !account.btcAddress) throw new Error("BTC wallet not found.");

  const needAll = options.fetchAll === true;
  const loadedCount = Number(account.chainTransactions?.length || 0);
  const maxNeeded = Math.min(Number(account.btcCache?.txCount || 0), MAX_BTC_HISTORY);
  const hasNeededTransactions = !needAll || loadedCount >= maxNeeded;
  const needsRefresh = !account.btcCache || account.btcCache.error || account.btcCache.loading || !hasNeededTransactions;

  if (needsRefresh) {
    const data = needAll
      ? await fetchExpenseBtcAllWalletData(account.btcAddress, account.btcNetwork || "mainnet")
      : await fetchExpenseBtcWalletData(account.btcAddress, account.btcNetwork || "mainnet");
    expenseBtcSetCache(data.address, data.networkKey, data);
    account = getExpenseAccounts({ applyUiFilters: false }).find(a => a.group_id === account.group_id) || account;
  }

  return account;
}

async function downloadExpenseBtcStatementPDF(groupIdOrAccount){
  try {
    const account = await getExpenseBtcAccountForPdf(groupIdOrAccount, { fetchAll: true });
    await btcDownloadPDF({
      wallet: expenseBtcWalletPdfContext(account),
      transactions: account.chainTransactions || [],
      balanceSat: account.btcCache?.balanceSat ?? Math.round(Number(account.balance || 0) * 1e8)
    });
  } catch (err) {
    alert(`Could not download BTC statement: ${err.message || err}`);
  }
}

async function downloadExpenseBtcTransactionReceiptPDF(groupId, txid){
  try {
    let account = await getExpenseBtcAccountForPdf(groupId, { fetchAll: false });
    let tx = (account.chainTransactions || []).find(row => row.txid === txid);
    if (!tx) {
      account = await getExpenseBtcAccountForPdf(account, { fetchAll: true });
      tx = (account.chainTransactions || []).find(row => row.txid === txid);
    }
    if (!tx) throw new Error("Transaction not found.");
    await btcDownloadTransactionPDF(tx, expenseBtcWalletPdfContext(account));
  } catch (err) {
    alert(`Could not download BTC transaction receipt: ${err.message || err}`);
  }
}

async function downloadExpenseBtcAccountPDF(account){
  await downloadExpenseBtcStatementPDF(account);
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

function renderExpenseHistoryRangeControls(){
  const active = state.expenseHistoryRange || "month";
  const options = [
    ["month", "This Month"],
    ["today", "Today"],
    ["last7", "Last 7 Days"],
    ["all", "All"],
    ["custom", "Custom"]
  ];
  return `<span class="expense-history-controls">
    ${options.map(([value, label]) => `
      <button type="button" class="tiny ghost expense-history-range-btn ${active === value ? "active" : ""}" data-expense-history-range="${escapeHtml(value)}">${escapeHtml(label)}</button>
    `).join("")}
    <button type="button" class="icon-btn ghost expenseActionBtn expense-history-download" data-action="pdf" data-type="transactions-history" title="Download Transactions History PDF"><i class="fa-solid fa-download"></i></button>
  </span>`;
}

function renderExpenseHistoryToolbar(transactionCount){
  const customOpen = state.expenseHistoryRange === "custom";
  return `<div class="expense-section-toolbar expense-history-toolbar">
    <span class="expense-toolbar-hint">Showing ${escapeHtml(expenseHistoryRangeText())}. ${transactionCount} transaction(s) in this selection.</span>
    <span class="expense-history-custom ${customOpen ? "" : "hide"}">
      <input type="date" class="input" data-expense-history-date="from" value="${escapeHtml(state.expenseHistoryCustomFrom || "")}" aria-label="Transactions history from date">
      <input type="date" class="input" data-expense-history-date="to" value="${escapeHtml(state.expenseHistoryCustomTo || "")}" aria-label="Transactions history to date">
      <button type="button" class="tiny primary expense-history-custom-apply">Ok</button>
    </span>
  </div>`;
}

function getExpenseDetailsOpenState(){
  if (!els.expensesList) return new Set();
  const openDetails = new Set();
  els.expensesList.querySelectorAll("details").forEach(detail => {
    if (!detail.open) return;
    const key = detail.dataset.expenseDetailsId || detail.id;
    if (key) openDetails.add(key);
  });
  return openDetails;
}

function restoreExpenseDetailsOpenState(openDetails){
  if (!els.expensesList || !openDetails?.size) return;
  els.expensesList.querySelectorAll("details").forEach(detail => {
    const key = detail.dataset.expenseDetailsId || detail.id;
    if (key && openDetails.has(key)) detail.open = true;
  });
}

function renderExpensesList(){
  const openExpenseDetails = getExpenseDetailsOpenState();
  let accounts = getExpenseAccounts();
  let accountsForSections = getExpenseAccounts({ applyUiFilters: false });
  refreshExpenseBtcWallets(accountsForSections);
  accounts = getExpenseAccounts();
  accountsForSections = getExpenseAccounts({ applyUiFilters: false });
  const validIds = new Set(accounts.map(a => a.group_id));
  if (state.expenseWalletFilter !== "all" && !validIds.has(state.expenseWalletFilter)){
    state.expenseWalletFilter = "all";
  }
  renderExpenseWalletBar(accounts);

  if (!accounts.length){
    els.expensesList.innerHTML = `<div class="empty">No expense accounts found.</div>`;
    return;
  }

  let html = "";
  html += renderExpenseBtcTransactionsSection(accountsForSections, false);

  let topupTransactions = collectTopupTransactionsFlat(accountsForSections);
  
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
    html += `<details class="expense-collapsible-section" id="topupRecordsSection" data-expense-details-id="topupRecordsSection">
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
      <details class="loan expense-item-row expense-by-currency" data-expense-details-id="topup-${escapeHtml(cur)}">
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
              <strong>${money(totalCur, cur)}</strong>
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
  const selectedPageCurrencies = new Set(getSelectedPageCurrencies());
  const allPageCurrencies = isPageCurrencyAll();
  for (const ev of transferEvents){
    if (allPageCurrencies || selectedPageCurrencies.has(ev.curOut)) {
      transferCurrencySet.add(ev.curOut);
    }
    if (allPageCurrencies || selectedPageCurrencies.has(ev.curIn)) {
      transferCurrencySet.add(ev.curIn);
    }
  }
  const transferCurrencies = sortCurrenciesList([...transferCurrencySet]);

  if (transferEvents.length > 0 && transferCurrencies.length > 0){
    html += `<details class="expense-collapsible-section" id="transferRecordsSection" data-expense-details-id="transferRecordsSection">
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
      <details class="loan expense-item-row expense-by-currency" data-expense-details-id="transfer-${escapeHtml(cur)}">
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
              <div><small>Sent (${currencySymbolHtml(cur)})</small><strong>${money(sent, cur)}</strong></div>
              <div><small>Received (${currencySymbolHtml(cur)})</small><strong>${money(received, cur)}</strong></div>
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
  const historySpendAttached = filterExpenseHistoryRows(spendAttached);
  let items = groupExpenseItems(historySpendAttached);
  
  // Apply search filtering to expense items
  if (state.search.expenses && state.search.expenses.trim() !== "") {
    items = filterExpensesBySearch(items, state.search.expenses);
  }
  
  if (spendAttached.length > 0) {
    const visibleTransactionCount = items.reduce((sum, item) => sum + item.txs.length, 0);
    html += `<details class="expense-collapsible-section" id="transactionsHistorySection" data-expense-details-id="transactionsHistorySection">
      <summary class="expense-collapsible-header expense-history-header">
        <h4 class="expense-section-title"><i class="fa-solid fa-list-ul"></i> Transactions History</h4>
        ${renderExpenseHistoryRangeControls()}
        <span class="expand-icon">▶</span>
      </summary>
      <div class="expense-collapsible-content">
      ${renderExpenseHistoryToolbar(visibleTransactionCount)}`;
    html += items.length ? items.map(item => `
      <details class="loan expense-item-row" data-expense-details-id="history-${escapeHtml(item.key)}">
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
              ${item.taxTotal ? `<small>VAT ${money(item.taxTotal, item.currency)}</small>` : ""}
            </div>
            <div class="lt-action">
              <button class="icon-btn ghost" onclick="downloadExpenseItemPDF('${escapeHtml(item.key)}')" title="Download PDF" style="font-size: 0.9rem;"><i class="fa-solid fa-download"></i></button>
            </div>
          </div>
        </summary>
        <div class="detail">
          <div class="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Wallet</th><th>Type</th><th>Amount</th><th>VAT</th><th>Notes</th><th>Action</th></tr></thead>
              <tbody>
                ${item.txs.map(tx => `
                  <tr>
                    <td>${escapeHtml(displayDate(tx.date || "—"))}</td>
                    <td>${getWalletIconHtml(tx.wallet || "Wallet", 16)} ${escapeHtml(tx.wallet || "—")}</td>
                    <td>${escapeHtml(tx.expenseType || "—")}</td>
                    <td>${money(tx.amount, item.currency)}</td>
                    <td>${tx.taxAmount ? `${money(tx.taxAmount, item.currency)} (${escapeHtml(trimInventoryNumber(tx.taxRate, 2))}%)` : "-"}</td>
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
    `).join("") : `<div class="empty">No transactions found for ${escapeHtml(expenseHistoryRangeText())}.</div>`;
    html += `</div></details>`;
  }

  if (!html) {
    els.expensesList.innerHTML = `<div class="empty">No transactions found.</div>`;
  } else {
    els.expensesList.innerHTML = html;
  }

  restoreExpenseDetailsOpenState(openExpenseDetails);

  els.expensesList.querySelectorAll(".editRowBtn").forEach(btn => btn.addEventListener("click", () => openEditModal(btn.dataset.id)));
  els.expensesList.querySelectorAll(".delRowBtn").forEach(btn => btn.addEventListener("click", () => deleteEntry(btn.dataset.id)));
  // Add event listeners for expense action buttons
  els.expensesList.querySelectorAll(".expenseActionBtn").forEach(btn => btn.addEventListener("click", async e => {
    e.preventDefault();
    e.stopPropagation();
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
      } else if (type === "transactions-history"){
        await downloadExpenseTransactionsHistoryPDF();
      }
    }
  }));
  els.expensesList.querySelectorAll(".expense-history-range-btn").forEach(btn => btn.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    setExpenseHistoryRange(btn.dataset.expenseHistoryRange || "month", true);
  }));
  els.expensesList.querySelectorAll(".expense-history-custom-apply").forEach(btn => btn.addEventListener("click", e => {
    e.preventDefault();
    const wrap = btn.closest(".expense-history-custom");
    const fromValue = String(wrap?.querySelector('[data-expense-history-date="from"]')?.value || "");
    const toValue = String(wrap?.querySelector('[data-expense-history-date="to"]')?.value || "");
    const completeDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value);
    if (!completeDate(fromValue) || !completeDate(toValue)){
      alert("Please enter both custom dates first.");
      return;
    }
    state.expenseHistoryRange = "custom";
    state.expenseHistoryCustomFrom = fromValue;
    state.expenseHistoryCustomTo = toValue;
    renderExpensesList();
    const section = document.getElementById("transactionsHistorySection");
    if (section) section.open = true;
  }));
  els.expensesList.querySelectorAll(".expenseBtcStatementBtn").forEach(btn => btn.addEventListener("click", async e => {
    e.preventDefault();
    e.stopPropagation();
    const groupId = btn.dataset.groupId || "";
    if (!groupId) {
      alert("Select one BTC wallet to download its full statement.");
      return;
    }
    await downloadExpenseBtcStatementPDF(groupId);
  }));
  els.expensesList.querySelectorAll(".expenseBtcTxPdfBtn").forEach(btn => btn.addEventListener("click", async e => {
    e.preventDefault();
    await downloadExpenseBtcTransactionReceiptPDF(btn.dataset.groupId, btn.dataset.txId);
  }));
  els.expensesList.querySelectorAll(".expenseBtcTxBtn").forEach(btn => btn.addEventListener("click", e => {
    e.preventDefault();
    const url = btn.dataset.url;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
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
  if (isGuestMode()) {
    clearGuestStorageArtifacts();
    return;
  }
  const payload = {
    exportedAt: new Date().toISOString(),
    entries: Array.isArray(entries) ? entries : []
  };
  localStorage.setItem(backupStorageKey(), JSON.stringify(payload));
}

function loadBackupEntriesFromStorage(){
  if (isGuestMode()) return [];
  const raw = localStorage.getItem(backupStorageKey());
  if (!raw) return [];
  try{
    return parseEntriesPayload(JSON.parse(raw));
  }catch{
    return [];
  }
}

function updateUploadButtonVisibility(){
  const shouldShow = !isGuestMode() && state.hasImportedFile && state.dataSource === "backup";
  els.uploadBackupBtn.classList.toggle("hide", !shouldShow);
}

function updateConnectButtonVisibility(){
  const showConnect = !isGuestMode() && state.hasImportedFile && !state.unlocked;
  els.connectSupabaseBtn.classList.toggle("hide", !showConnect);
}

function applyEntries(entries, source = "backup", options = {}){
  state.entries = Array.isArray(entries) ? entries : [];
  state.dataSource = source;
  if (typeof options.hasImportedFile === "boolean"){
    state.hasImportedFile = options.hasImportedFile;
    if (state.hasImportedFile && !isGuestMode()){
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
    if (isGuestMode()) {
      applyEntries(state.entries, "backup");
      renderRecycleBinDropdown();
      return;
    }
    applyEntries(loadBackupEntriesFromStorage(), "backup");
    // Load recycle bin from localStorage for backup mode
    loadRecycleBinFromStorage();
    renderRecycleBinDropdown();
    return;
  }
  await loadEntriesFromSupabase();
}

async function loadEntriesFromSupabase(){
  if (state.secretPinHash && !state.secretPinVerified) {
    applyEntries([], "supabase", { hasImportedFile: false });
    return;
  }
  const selectedCurrencies = getSelectedPageCurrencies();
  if (!isPageCurrencyAll() && !selectedCurrencies.length) {
    applyEntries([], "supabase", { hasImportedFile: false });
    state.recycleBin = [];
    renderRecycleBinDropdown();
    return;
  }
  const currencyQuery = isPageCurrencyAll()
    ? ""
    : selectedCurrencies.length === 1
      ? `&currency=eq.${encodeURIComponent(selectedCurrencies[0])}`
      : `&currency=in.(${selectedCurrencies.map(currency => encodeURIComponent(currency)).join(",")})`;
  const rows = await supabase(`${CONFIG.table}?select=*${currencyQuery}&order=created_at.desc`);
  const dataRows = Array.isArray(rows)
    ? rows.filter(row => !isPageCurrencyPreferenceRow(row) && !isSecretPinPreferenceRow(row) && !isTaxSettingsPreferenceRow(row))
    : [];
  // Filter out entries with deleted tag for main display
  const filteredRows = dataRows.filter(row => !hasDeletedTag(row.notes));
  await ensureInventoryItemCodesForRows(filteredRows);
  updateDbSnapshot(filteredRows);
  applyEntries(filteredRows, "supabase", { hasImportedFile: false });
  
  // Load deleted entries into recycle bin
  const deletedRows = dataRows.filter(row => hasDeletedTag(row.notes));
  state.recycleBin = deletedRows.map(row => ({
    ...row,
    deletedAt: row.updated_at, // Use updated_at as deletion time
    originalSection: getEntrySection(row)
  }));
  saveRecycleBinToStorage();
  renderRecycleBinDropdown();
}

async function ensureInventoryItemCodesForRows(rows){
  const goodsRows = Array.isArray(rows) ? rows.filter(row => hasGoodsTag(row.notes)) : [];
  if (!goodsRows.length) return;

  const existingCodes = new Set();
  const codeByGroup = new Map();
  for (const row of goodsRows){
    const meta = goodsMetaFromNotes(row.notes);
    if (!meta.itemCode) continue;
    const code = String(meta.itemCode).trim();
    if (!code) continue;
    existingCodes.add(code.toUpperCase());
    if (row.group_id && !codeByGroup.has(row.group_id)) codeByGroup.set(row.group_id, code);
  }

  for (const row of goodsRows){
    if (!row.group_id || codeByGroup.has(row.group_id)) continue;
    const itemCode = nextPrefixedHexCode("ITM", existingCodes);
    existingCodes.add(itemCode.toUpperCase());
    codeByGroup.set(row.group_id, itemCode);
  }

  const patches = [];
  for (const row of goodsRows){
    const meta = goodsMetaFromNotes(row.notes);
    if (meta.itemCode || !row.group_id) continue;
    const itemCode = codeByGroup.get(row.group_id);
    if (!itemCode) continue;
    const nextNotes = upsertGoodsMetaInNote(row.notes, { ...meta, itemCode });
    row.notes = nextNotes;
    if (row.id){
      patches.push({ id: row.id, notes: nextNotes });
    }
  }

  if (!patches.length) return;
  try {
    for (const patch of patches){
      await supabase(`${CONFIG.table}?id=eq.${encodeURIComponent(patch.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ notes: patch.notes })
      });
    }
  } catch (err) {
    console.warn("Inventory item code backfill failed:", err);
  }
}

function renderExpenseOverviewWallets(){
  const container = document.getElementById("expenseOverviewWallets");
  if (!container) return;
  const accounts = getExpenseAccounts({ applyUiFilters: false });
  if (!accounts.length){
    container.innerHTML = `<div class="empty" style="grid-column:1/-1">No expense accounts yet.</div>`;
    return;
  }
  
  // Store original data for resize handling
  container.accounts = accounts;
  
  const expenseCurrencies = [...new Set(accounts.map(account => account.currency).filter(Boolean))];
  const expenseSummaryCard = expenseCurrencies.length ? `
      <div class="summary currency-summary expense-overview">
        ${overviewWatermarkFloatingWalletLogos(accounts)}
        <div class="currency-head">Summary ${expenseCurrencies.map(currency => currencySymbolHtml(currency)).join(' ')}</div>
        ${expenseCurrencies.map((currency, index) => {
          const s = summarizeExpenseByCurrency(currency);
          const isLastCurrency = index === expenseCurrencies.length - 1;
          
          // Calculate USD equivalent for BTC available balance
          let btcUsdEquivalent = "";
          if (currency === "BTC") {
            const btcBalance = Number(s.availableBalance || 0);
            if (btcBalance > 0 && state.bitcoin.btcPrice) {
              const usdValue = (btcBalance * state.bitcoin.btcPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              btcUsdEquivalent = usdValue;
            }
          }
          
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
            ${btcUsdEquivalent ? `<div class="summary-line summary-line-one" style="margin-top: 2px;"><span class="summary-line-one-label"></span><span class="summary-line-one-value" style="color: var(--muted); font-size: 0.8rem; font-weight: 600;">≈ $${btcUsdEquivalent}</span></div>` : ''}
            ${!isLastCurrency ? '<div class="currency-separator"></div>' : ''}
          `;
        }).join("")}
        <div class="overview-card-actions" style="margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap;">
          <button class="tiny ghost" onclick="window.location.href='#expensesPanel'">View Expenses</button>
          <button class="tiny ghost" onclick="openExpenseModal('account')">Add Account</button>
          <button class="tiny ghost" onclick="downloadExpensesPDF()"><i class="fa-solid fa-download"></i></button>
        </div>
      </div>
  ` : "";

  // Check screen width to determine layout
  const isDesktop = window.innerWidth > 768;
  
  if (isDesktop) {
    // Desktop layout: two columns
    const walletCardsHtml = accounts.map(expenseOverviewWalletCardHtml).join("");
    
    if (expenseSummaryCard) {
      container.innerHTML = `
        <div class="wallets-desktop-layout">
          <div class="summary-column">
            ${expenseSummaryCard}
          </div>
          <div class="wallets-column">
            <div class="wallets-grid">
              ${walletCardsHtml}
            </div>
          </div>
        </div>
      `;
    } else {
      // No summary card - show only wallet cards in full width
      container.innerHTML = `
        <div class="wallets-full-width">
          <div class="wallets-grid">
            ${walletCardsHtml}
          </div>
        </div>
      `;
    }
  } else {
    // Mobile layout: original simple grid
    container.innerHTML = expenseSummaryCard + accounts.map(expenseOverviewWalletCardHtml).join("");
  }
}

// Function to update wallets layout on window resize
function updateWalletsLayoutOnResize() {
  const container = document.getElementById("expenseOverviewWallets");
  if (!container || !container.accounts) return;
  
  // Re-render with current screen width
  const isDesktop = window.innerWidth > 768;
  const accounts = container.accounts;
  
  // Recalculate expense summary card
  const expenseCurrencies = [...new Set(accounts.map(account => account.currency).filter(Boolean))];
  const expenseSummaryCard = expenseCurrencies.length ? `
      <div class="summary currency-summary expense-overview">
        ${overviewWatermarkFloatingWalletLogos(accounts)}
        <div class="currency-head">Summary ${expenseCurrencies.map(currency => currencySymbolHtml(currency)).join(' ')}</div>
        ${expenseCurrencies.map((currency, index) => {
          const s = summarizeExpenseByCurrency(currency);
          const isLastCurrency = index === expenseCurrencies.length - 1;
          
          // Calculate USD equivalent for BTC available balance
          let btcUsdEquivalent = "";
          if (currency === "BTC") {
            const btcBalance = Number(s.availableBalance || 0);
            if (btcBalance > 0 && state.bitcoin.btcPrice) {
              const usdValue = (btcBalance * state.bitcoin.btcPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              btcUsdEquivalent = usdValue;
            }
          }
          
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
            ${btcUsdEquivalent ? `<div class="summary-line summary-line-one" style="margin-top: 2px;"><span class="summary-line-one-label"></span><span class="summary-line-one-value" style="color: var(--muted); font-size: 0.8rem; font-weight: 600;">≈ $${btcUsdEquivalent}</span></div>` : ''}
            ${!isLastCurrency ? '<div class="currency-separator"></div>' : ''}
          `;
        }).join("")}
        <div class="overview-card-actions" style="margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap;">
          <button class="tiny ghost" onclick="window.location.href='#expensesPanel'">View Expenses</button>
          <button class="tiny ghost" onclick="openExpenseModal('account')">Add Account</button>
          <button class="tiny ghost" onclick="downloadExpensesPDF()"><i class="fa-solid fa-download"></i></button>
        </div>
      </div>
  ` : "";

  if (isDesktop) {
    // Desktop layout: two columns
    const walletCardsHtml = accounts.map(expenseOverviewWalletCardHtml).join("");
    
    if (expenseSummaryCard) {
      container.innerHTML = `
        <div class="wallets-desktop-layout">
          <div class="summary-column">
            ${expenseSummaryCard}
          </div>
          <div class="wallets-column">
            <div class="wallets-grid">
              ${walletCardsHtml}
            </div>
          </div>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div class="wallets-full-width">
          <div class="wallets-grid">
            ${walletCardsHtml}
          </div>
        </div>
      `;
    }
  } else {
    // Mobile layout: original simple grid
    container.innerHTML = expenseSummaryCard + accounts.map(expenseOverviewWalletCardHtml).join("");
  }
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
  renderInventoryList();
  renderExpensesList();
  renderExpenseOverviewWallets();

  els.openGivenCount.textContent = groupByLoan(getActiveEntries().filter(e => e.direction === "given" && !hasGoodsTag(e.notes))).filter(g => calculateLoan(g).remaining > 0).length;
  els.openTakenCount.textContent = groupByLoan(getActiveEntries().filter(e => e.direction === "taken" && !hasGoodsTag(e.notes) && !hasExpenseAccountTag(e.notes))).filter(g => calculateLoan(g).remaining > 0).length;
  els.receivedCount.textContent = getActiveEntries().filter(e => e.direction === "given" && e.entry_kind !== "principal").length;
  els.returnedCount.textContent = getActiveEntries().filter(e => e.direction === "taken" && e.entry_kind !== "principal" && !hasGoodsTag(e.notes) && !hasExpenseAccountTag(e.notes)).length;

}

function activate(tab){
  if (!tab) return;
  // Prevent access to tabs when not logged in (except when showing standalone about)
  if (!state.unlocked && window.location.hash !== "#about") {
    return;
  }
  const targetPanel = document.getElementById(`${tab}Panel`);
  if (!targetPanel) return;

  document.querySelectorAll(".tab").forEach(b => {
    const isLoanDropdownTab = b.id === "loansTabBtn" && ["given", "received", "taken", "returned"].includes(tab);
    b.classList.toggle("active", b.dataset.tab === tab || isLoanDropdownTab);
  });
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
  targetPanel.classList.add("active");
  const mainOverview = document.getElementById("mainOverview");
  const walletsOverview = document.getElementById("walletsOverviewSection");
  const loanOverviewTabs = new Set(["given", "received", "taken", "returned", "installments"]);
  const showMainOverview = loanOverviewTabs.has(tab) || tab === "goods";

  if (mainOverview) {
    if (showMainOverview) {
      renderOverviewCards(tab);
      mainOverview.style.display = "block";
    } else {
      mainOverview.style.display = "none";
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
  if (form === els.goodsBoughtForm) {
    syncGoodsPurchaseTaxDefaults();
    updateGoodsPurchaseWalletSelector();
  }
  syncExpenseBtcAccountFields(form);
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

function openGoodsModal(mode, options = {}){
  els.goodsModal.classList.remove("hide");
  els.goodsModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  els.goodsBoughtForm.classList.toggle("hide", mode !== "bought");
  els.goodsSoldForm.classList.toggle("hide", mode !== "sold");
  state.inventoryDraft.purchaseGroupId = options.groupId || "";
  state.inventoryDraft.saleGroupIds = options.groupId ? [options.groupId] : [];
  if (els.goodsNewItemFields) els.goodsNewItemFields.classList.add("hide");
  if (els.goodsNewItemToggleBtn) els.goodsNewItemToggleBtn.textContent = "+ Add New";

  if (mode === "bought"){
    const currentGroup = getGoodsGroups({ applyUiFilters: false }).find(g => g.group_id === state.inventoryDraft.purchaseGroupId);
    els.goodsModalTitle.textContent = currentGroup ? "Add Inventory Stock" : "Add Inventory Item";
    els.goodsModalDesc.textContent = currentGroup ? "Record an additional purchase for this item." : "Add a newly purchased inventory item.";
    els.goodsBoughtForm.reset();
    els.goodsBoughtForm.dataset.taxManual = "false";
    if (currentGroup){
      els.goodsBoughtForm.querySelector('[name="item_code"]').value = currentGroup.itemCode || nextInventoryCode();
      els.goodsBoughtForm.querySelector('[name="item_name"]').value = currentGroup.person_name || "";
      setCurrencyChoice(els.goodsBoughtForm, currentGroup.currency || state.lastCurrency || "AED");
      els.goodsBoughtForm.querySelector('[name="item_description"]').value = currentGroup.itemDescription || "";
      els.goodsBoughtForm.querySelector('[name="selling_price"]').value = currentGroup.defaultUnitSoldPrice ? trimInventoryNumber(currentGroup.defaultUnitSoldPrice) : "";
      els.goodsBoughtForm.querySelector('[name="item_category"]').value = normalizeInventoryCategory(currentGroup.itemCategory);
      els.goodsBoughtForm.querySelector('[name="item_category"]').disabled = true;
      els.goodsBoughtForm.querySelector('[name="quantity_unit"]').value = normalizeInventoryUnit(currentGroup.quantityUnit, currentGroup.itemCategory);
    } else {
      els.goodsBoughtForm.querySelector('[name="item_code"]').value = nextInventoryCode();
      els.goodsBoughtForm.querySelector('[name="item_category"]').value = INVENTORY_CATEGORY_COUNT;
      els.goodsBoughtForm.querySelector('[name="item_category"]').disabled = false;
      els.goodsBoughtForm.querySelector('[name="quantity_unit"]').value = INVENTORY_UNIT_ITEM;
      setCurrencyChoice(els.goodsBoughtForm, state.lastCurrency || "AED");
    }
    defaultDateInputs(els.goodsBoughtForm);
    syncGoodsPurchaseTaxDefaults(true);
    syncGoodsBoughtCategoryFields();
    updateGoodsPurchaseWalletSelector();
  } else {
    const addingCustomerOnly = options.addCustomer && !options.groupId;
    els.goodsModalTitle.textContent = addingCustomerOnly ? "Add Customer" : "Create Sales Invoice";
    els.goodsModalDesc.textContent = addingCustomerOnly
      ? "Save customer details now, or choose items if you also want to create an invoice."
      : "Select customer, choose one or more items, and save one invoice.";
    els.goodsSoldForm.reset();
    if (els.goodsReceiptNumber) els.goodsReceiptNumber.value = nextInvoiceNumber();
    if (els.goodsSalePaidAmount) {
      els.goodsSalePaidAmount.dataset.autoPaid = "true";
      els.goodsSalePaidAmount.disabled = false;
      els.goodsSalePaidAmount.value = "";
      els.goodsSalePaidAmount.placeholder = "0.00";
    }
    if (els.goodsSaleBalanceAmount) els.goodsSaleBalanceAmount.value = "";
    renderGoodsCustomerOptions();
    if (options.addCustomer && els.goodsCustomerSelect) {
      els.goodsCustomerSelect.value = INVENTORY_NEW_CUSTOMER_VALUE;
      syncGoodsCustomerFields();
      els.goodsNewCustomerName?.focus();
    }
    syncGoodsCustomerFields();
    renderGoodsSaleLines(state.inventoryDraft.saleGroupIds || []);
    renderGoodsSelectors();
    defaultDateInputs(els.goodsSoldForm);
    updateGoodsSaleGrandTotal();
    updateGoodsSaleWalletSelector();
  }
}

async function saveGoodsBought(form){
  const fd = new FormData(form);
  const groupId = state.inventoryDraft.purchaseGroupId || "";
  const currentGroup = groupId ? getGoodsGroups({ applyUiFilters: false }).find(g => g.group_id === groupId) : null;
  const walletId = String(fd.get("purchase_wallet_id") || "").trim();
  const unitActualPrice = Number(fd.get("actual_price") || 0);
  const itemCategory = currentGroup ? normalizeInventoryCategory(currentGroup.itemCategory) : normalizeInventoryCategory(fd.get("item_category"));
  const quantityUnit = normalizeInventoryUnit(fd.get("quantity_unit"), itemCategory);
  const boughtQty = normalizeInventoryQuantityInput(fd.get("bought_qty"), itemCategory, quantityUnit);
  const purchaseTax = getGoodsPurchaseTaxBreakdown();
  const totalActualPrice = purchaseTax.total;
  const sellingPrice = Number(fd.get("selling_price") || 0);
  const itemCode = String(fd.get("item_code") || "").trim() || nextInventoryCode();
  const itemName = currentGroup ? currentGroup.person_name : String(fd.get("item_name") || "").trim();
  const itemDescription = String(fd.get("item_description") || "").trim();
  const currency = currentGroup ? currentGroup.currency : String(fd.get("currency") || "AED").trim();
  const boughtDate = String(fd.get("bought_date") || "");
  if (!itemName || !currency || !unitActualPrice || !boughtQty || !boughtDate){
    throw new Error("Complete all required fields.");
  }

  validateCurrencyForForm(fd);
  if (walletId) validateInventoryWallet(walletId, currency, totalActualPrice, "deduct");

  if (currentGroup){
    const payload = {
      group_id: currentGroup.group_id,
      direction: "taken",
      entry_kind: "partial",
      person_name: currentGroup.person_name,
      currency: currentGroup.currency,
      principal_amount: null,
      action_amount: totalActualPrice,
      loan_date: currentGroup.principal?.loan_date,
      action_date: boughtDate,
      notes: upsertGoodsMetaInNote(normalizeGoodsNote(null, true), {
        boughtQty,
        unitActualPrice,
        unitSoldPrice: sellingPrice > 0 ? sellingPrice : null,
        itemCode,
        itemDescription,
        itemCategory,
        quantityUnit: inventoryBaseUnitForCategory(itemCategory),
        transactionType: "PURCHASE",
        ...taxMetaFromBreakdown(purchaseTax)
      })
    };
    saveEntriesImmediately(payload, { label: "Inventory purchase" });
  } else {
    const payload = {
      group_id: crypto.randomUUID(),
      direction: "taken",
      entry_kind: "principal",
      person_name: itemName,
      currency,
      principal_amount: totalActualPrice,
      action_amount: null,
      loan_date: boughtDate,
      action_date: null,
      notes: upsertGoodsMetaInNote(normalizeGoodsNote(null, true), {
        boughtQty,
        unitActualPrice,
        unitSoldPrice: sellingPrice > 0 ? sellingPrice : null,
        itemCode,
        itemDescription,
        itemCategory,
        quantityUnit: inventoryBaseUnitForCategory(itemCategory),
        transactionType: "ITEM",
        ...taxMetaFromBreakdown(purchaseTax)
      })
    };
    saveEntriesImmediately(payload, { label: "Inventory item" });
  }
  if (walletId) {
    await createWalletEntryForInventory(walletId, totalActualPrice, boughtDate, currency, "purchase", { itemName, itemCode });
  }
  closeModal("goodsModal");
}

function saveInventoryCustomerOnly(form, customerName, customerContact, fd){
  const today = String(fd.get("sold_date") || "") || todayISO();
  const allowedCurrencies = getPageScopedCurrencies();
  const currency = allowedCurrencies.includes(state.lastCurrency)
    ? state.lastCurrency
    : (allowedCurrencies[0] || "AED");
  const payload = {
    group_id: crypto.randomUUID(),
    direction: "taken",
    entry_kind: "partial",
    person_name: customerName,
    currency,
    principal_amount: null,
    action_amount: 0,
    loan_date: today,
    action_date: today,
    notes: upsertGoodsMetaInNote(normalizeGoodsNote("Customer record", true), {
      customerName,
      customerPhone: customerContact.phone,
      customerAddress: customerContact.address,
      transactionType: INVENTORY_TX_CUSTOMER
    })
  };
  saveEntriesImmediately(payload, { label: "Customer" });
  form.reset();
  closeModal("goodsModal");
}

async function saveGoodsSold(form){
  const fd = new FormData(form);
  const soldDate = String(fd.get("sold_date") || "");
  const customerName = getSelectedGoodsCustomerName(form);
  const customerContact = getSelectedGoodsCustomerContact(form);
  const receiptNumber = String(fd.get("receipt_number") || "").trim() || nextInvoiceNumber();
  const invoiceNumber = receiptNumber;
  const soldNotes = String(fd.get("notes") || "").trim() || null;
  const walletId = String(fd.get("sale_wallet_id") || "").trim();
  const saleLines = collectGoodsSaleLines();
  const requestedQtyByGroup = new Map();
  if (!customerName) throw new Error("Customer name is required.");
  if (!saleLines.length) {
    saveInventoryCustomerOnly(form, customerName, customerContact, fd);
    return;
  }
  if (!soldDate) throw new Error("Sold date is required.");
  for (const line of saleLines){
    requestedQtyByGroup.set(line.groupId, (requestedQtyByGroup.get(line.groupId) || 0) + Number(line.qty || 0));
  }

  const preparedLines = saleLines.map(line => {
    const principalEntry = state.entries.find(e =>
      e.group_id === line.groupId &&
      e.entry_kind === "principal" &&
      (e.direction === "goods" || (e.direction === "taken" && hasGoodsTag(e.notes)))
    );
    if (!principalEntry) throw new Error("One of the selected items no longer exists.");
    const soldPrice = Number(line.unitPrice || 0);
    const selectedGroup = getGoodsGroups({ applyUiFilters: false }).find(g => g.group_id === line.groupId);
    const itemCategory = normalizeInventoryCategory(selectedGroup?.itemCategory || line.itemCategory);
    const soldQty = normalizeStoredInventoryQty(line.qty, itemCategory, 0);
    if (!soldPrice || !soldQty) throw new Error("Each selected item needs quantity and unit selling price.");
    const principalMeta = goodsMetaFromNotes(principalEntry.notes);
    const totalBoughtQty = selectedGroup?.boughtQty || normalizeStoredInventoryQty(principalMeta.boughtQty, itemCategory, 1);
    const soldQtyAlready = selectedGroup?.soldQty || 0;
    const remainingQty = Math.max(totalBoughtQty - soldQtyAlready, 0);
    if ((requestedQtyByGroup.get(line.groupId) || soldQty) > remainingQty){
      throw new Error(`Only ${inventoryQtyLabel(remainingQty, itemCategory)} left for ${principalEntry.person_name}.`);
    }
    const fallbackTax = calculateTaxBreakdown(soldPrice * soldQty, line.taxRate, line.taxMode, line.taxApplied);
    const lineNet = Number.isFinite(Number(line.netAmount)) && Number(line.netAmount) > 0 ? Number(line.netAmount) : fallbackTax.net;
    const lineTax = Number.isFinite(Number(line.taxAmount)) ? Number(line.taxAmount) : fallbackTax.tax;
    const lineTotal = Number.isFinite(Number(line.grossAmount)) && Number(line.grossAmount) > 0 ? Number(line.grossAmount) : fallbackTax.total;
    return {
      ...line,
      principalEntry,
      principalMeta,
      itemCategory,
      soldQty,
      soldPrice,
      lineNet,
      lineTax,
      lineTotal,
      currency: principalEntry.currency
    };
  });

  const saleCurrencies = new Set(preparedLines.map(line => line.currency));
  const singleCurrencyReceipt = saleCurrencies.size === 1;
  const receiptTotal = preparedLines.reduce((sum, line) => sum + Number(line.lineTotal || 0), 0);
  let receiptPaidTotal = receiptTotal;
  if (singleCurrencyReceipt){
    const paidRaw = String(fd.get("paid_amount") || "").trim();
    receiptPaidTotal = paidRaw ? Number(paidRaw) : receiptTotal;
    if (!Number.isFinite(receiptPaidTotal) || receiptPaidTotal < 0) throw new Error("Paid amount must be zero or more.");
    if (receiptPaidTotal > receiptTotal + 0.00000001) throw new Error("Paid amount cannot exceed invoice total.");
  }
  const receiptPaymentStatus = !singleCurrencyReceipt || receiptPaidTotal + 0.00000001 >= receiptTotal ? "FULL" : "PARTIAL";
  const paymentReceiptNumber = receiptPaidTotal > 0.00000001 ? nextPaymentReceiptNumber([invoiceNumber]) : "";
  let paidRemaining = receiptPaidTotal;
  const saleCurrency = singleCurrencyReceipt ? preparedLines[0]?.currency : "";
  if (walletId){
    if (!singleCurrencyReceipt) throw new Error("Wallet top-up is available only for single-currency sale invoices.");
    if (receiptPaidTotal <= 0) throw new Error("Paid amount must be greater than zero to add money to a wallet.");
    validateInventoryWallet(walletId, saleCurrency, receiptPaidTotal, "topup");
  }

  const payloads = preparedLines.map(line => {
    const linePaid = singleCurrencyReceipt ? Math.min(line.lineTotal, Math.max(paidRemaining, 0)) : line.lineTotal;
    if (singleCurrencyReceipt) paidRemaining = Math.max(paidRemaining - linePaid, 0);
    const lineBalance = Math.max(line.lineTotal - linePaid, 0);
    return {
      group_id: line.groupId,
      direction: "taken",
      entry_kind: receiptPaymentStatus === "FULL" ? "full" : "partial",
      person_name: line.principalEntry.person_name,
      currency: line.principalEntry.currency,
      principal_amount: null,
      action_amount: line.lineTotal,
      loan_date: line.principalEntry.loan_date,
      action_date: soldDate,
      notes: upsertGoodsMetaInNote(normalizeGoodsNote(soldNotes, true), {
        soldQty: line.soldQty,
        unitSoldPrice: line.soldPrice,
        itemCode: line.principalMeta.itemCode,
        itemCategory: line.itemCategory,
        quantityUnit: inventoryBaseUnitForCategory(line.itemCategory),
        customerName,
        customerPhone: customerContact.phone,
        customerAddress: customerContact.address,
        receiptNumber,
        invoiceNumber,
        paymentReceiptNumber,
        transactionType: "SALE",
        paidAmount: linePaid,
        balanceAmount: lineBalance,
        paymentStatus: receiptPaymentStatus,
        ...taxMetaFromBreakdown({
          applied: line.taxApplied,
          rate: line.taxRate,
          mode: line.taxMode,
          tax: line.lineTax,
          net: line.lineNet,
          total: line.lineTotal
        })
      })
    };
  });
  saveEntriesImmediately(payloads, { label: "Sales invoice" });
  if (walletId) {
    await createWalletEntryForInventory(walletId, receiptPaidTotal, soldDate, saleCurrency, "sale", { customerName, receiptNumber });
  }
  closeModal("goodsModal");
}

function addInventorySettlementPayloads(payloads, receiptData, remainingSettlement, settlementDate, settlementNotes, settlementId, paymentReceiptNumber = ""){
  const rows = receiptData.saleRows
    .filter(saleRow => saleRow.balance > 0.00000001)
    .sort((a, b) =>
      dateStamp(a.entry.action_date || a.entry.created_at) - dateStamp(b.entry.action_date || b.entry.created_at) ||
      String(a.entry.id || "").localeCompare(String(b.entry.id || ""))
    );
  for (const row of rows){
    if (remainingSettlement.amount <= 0.00000001) break;
    const paidForLine = Math.min(row.balance, remainingSettlement.amount);
    remainingSettlement.amount = Math.max(remainingSettlement.amount - paidForLine, 0);
    const lineBalance = Math.max(row.balance - paidForLine, 0);
    payloads.push({
      group_id: row.entry.group_id,
      direction: "taken",
      entry_kind: lineBalance <= 0.00000001 ? "full" : "partial",
      person_name: row.principalEntry?.person_name || row.itemName,
      currency: row.currency,
      principal_amount: null,
      action_amount: paidForLine,
      loan_date: row.entry.loan_date,
      action_date: settlementDate,
      notes: upsertGoodsMetaInNote(normalizeGoodsNote(settlementNotes, true), {
        itemCode: row.itemCode,
        itemCategory: row.itemCategory,
        quantityUnit: inventoryBaseUnitForCategory(row.itemCategory),
        customerName: receiptData.customerName,
        customerPhone: receiptData.customerPhone,
        customerAddress: receiptData.customerAddress,
        receiptNumber: receiptData.receiptNumber,
        invoiceNumber: receiptData.invoiceNumber,
        paymentReceiptNumber,
        transactionType: INVENTORY_TX_SETTLEMENT,
        paidAmount: paidForLine,
        balanceAmount: lineBalance,
        paymentStatus: lineBalance <= 0.00000001 ? "FULL" : "PARTIAL",
        settlementForEntryId: row.entry.id,
        settlementId
      })
    });
  }
}

function renderGoodsSettlementInvoiceList(invoices){
  if (!els.goodsSettlementInvoiceListField || !els.goodsSettlementInvoiceList) return;
  if (!invoices.length){
    els.goodsSettlementInvoiceListField.classList.add("hide");
    els.goodsSettlementInvoiceList.innerHTML = "";
    return;
  }
  els.goodsSettlementInvoiceListField.classList.remove("hide");
  els.goodsSettlementInvoiceList.innerHTML = invoices.map(invoice => `
    <label class="settlement-invoice-option">
      <input type="checkbox" class="goods-settlement-invoice-check" value="${escapeHtml(invoice.receiptNumber)}" data-entry-id="${escapeHtml(invoice.entryId)}" data-currency="${escapeHtml(invoice.currency || "")}" data-balance="${escapeHtml(invoice.balanceTotal)}" data-date="${escapeHtml(invoice.oldestDate || invoice.date || "")}" checked>
      <span>
        <strong>${escapeHtml(invoice.invoiceNumber || invoice.receiptNumber)}</strong>
        <small>${escapeHtml(displayDate(invoice.oldestDate || invoice.date || "—"))} • Balance ${escapeHtml(invoice.balanceText)}</small>
      </span>
    </label>
  `).join("");
}

function selectedGoodsSettlementInvoices(){
  if (!els.goodsSettlementInvoiceList) return [];
  return Array.from(els.goodsSettlementInvoiceList.querySelectorAll(".goods-settlement-invoice-check:checked"))
    .map(input => ({
      receiptNumber: input.value,
      entryId: input.dataset.entryId || "",
      currency: input.dataset.currency || "",
      balance: Number(input.dataset.balance || 0),
      date: input.dataset.date || ""
    }))
    .filter(invoice => invoice.receiptNumber && invoice.balance > 0.00000001);
}

function updateGoodsSettlementSelectionTotals(){
  const draft = state.inventoryDraft.settlement;
  if (draft?.mode !== "customer") return;
  const selected = selectedGoodsSettlementInvoices();
  const currencies = new Set(selected.map(invoice => invoice.currency).filter(Boolean));
  const total = selected.reduce((sum, invoice) => sum + Number(invoice.balance || 0), 0);
  const currency = currencies.size === 1 ? Array.from(currencies)[0] : "";
  if (els.goodsSettlementBalance) {
    els.goodsSettlementBalance.value = selected.length && currency ? moneyText(total, currency) : (selected.length ? "Select one currency only" : "Select invoices");
    applyCurrencyFontClass(els.goodsSettlementBalance, currency);
  }
  if (els.goodsSettlementAmount) {
    els.goodsSettlementAmount.disabled = !selected.length || currencies.size !== 1;
    if (currency) els.goodsSettlementAmount.max = trimInventoryNumber(total);
    else els.goodsSettlementAmount.removeAttribute("max");
    const current = Number(els.goodsSettlementAmount.value || 0);
    if (!current || current > total || currencies.size !== 1) {
      els.goodsSettlementAmount.value = currency ? trimInventoryNumber(total) : "";
    }
  }
  state.inventoryDraft.settlement.currency = currency;
  state.inventoryDraft.settlement.balance = total;
}

function openGoodsSettlementModal(entryId){
  const entry = state.entries.find(e => e.id === entryId && e.entry_kind !== "principal" && hasGoodsTag(e.notes));
  if (!entry){
    alert("Sale entry not found.");
    return;
  }
  const meta = goodsMetaFromNotes(entry.notes);
  const receiptNumber = meta.receiptNumber || shortId(entry.id) || "";
  const receiptData = getInventoryReceiptData(receiptNumber, entry);
  if (receiptData.totalsByCurrency.size !== 1){
    alert("Balance clearance is available only for a single-currency receipt.");
    return;
  }
  if (receiptData.balanceTotal <= 0.00000001){
    alert("This invoice has no balance amount to clear.");
    return;
  }
  state.inventoryDraft.settlement = {
    mode: "receipt",
    entryId,
    receiptNumber,
    currency: receiptData.currency,
    balance: receiptData.balanceTotal
  };
  if (els.goodsSettlementForm) els.goodsSettlementForm.reset();
  renderGoodsSettlementInvoiceList([]);
  if (els.goodsSettlementReceipt) els.goodsSettlementReceipt.value = receiptData.invoiceNumber || receiptNumber;
  if (els.goodsSettlementCustomer) els.goodsSettlementCustomer.value = receiptData.customerName || "Walk-in customer";
  if (els.goodsSettlementBalance) {
    els.goodsSettlementBalance.value = moneyText(receiptData.balanceTotal, receiptData.currency);
    applyCurrencyFontClass(els.goodsSettlementBalance, receiptData.currency);
  }
  if (els.goodsSettlementAmount) {
    els.goodsSettlementAmount.disabled = false;
    els.goodsSettlementAmount.value = trimInventoryNumber(receiptData.balanceTotal);
    els.goodsSettlementAmount.max = trimInventoryNumber(receiptData.balanceTotal);
  }
  if (els.goodsSettlementDate) els.goodsSettlementDate.value = todayISO();
  els.goodsSettlementModal.classList.remove("hide");
  els.goodsSettlementModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function openGoodsCustomerSettlementModal(customerName){
  const invoices = outstandingInvoicesForCustomer(customerName).filter(invoice => invoice.canSettle);
  if (!invoices.length){
    alert("No single-currency outstanding invoices found for this customer.");
    return;
  }
  state.inventoryDraft.settlement = {
    mode: "customer",
    customerName,
    receiptNumber: "Multiple invoices",
    currency: "",
    balance: 0
  };
  if (els.goodsSettlementForm) els.goodsSettlementForm.reset();
  if (els.goodsSettlementReceipt) els.goodsSettlementReceipt.value = "Multiple invoices";
  if (els.goodsSettlementCustomer) els.goodsSettlementCustomer.value = customerName || "Walk-in customer";
  renderGoodsSettlementInvoiceList(invoices);
  if (els.goodsSettlementDate) els.goodsSettlementDate.value = todayISO();
  updateGoodsSettlementSelectionTotals();
  els.goodsSettlementModal.classList.remove("hide");
  els.goodsSettlementModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

async function saveGoodsSettlement(form){
  const draft = state.inventoryDraft.settlement;
  if (!draft?.receiptNumber) throw new Error("Settlement invoice was not selected.");
  const fd = new FormData(form);
  const settlementAmount = Number(fd.get("settlement_amount") || 0);
  const settlementDate = String(fd.get("settlement_date") || "");
  const settlementNotes = String(fd.get("notes") || "").trim() || "Balance settlement";
  if (!settlementDate) throw new Error("Settlement date is required.");
  if (!Number.isFinite(settlementAmount) || settlementAmount <= 0) throw new Error("Settlement amount must be greater than zero.");

  let remainingSettlement = { amount: settlementAmount };
  const settlementId = crypto.randomUUID();
  const paymentReceiptNumber = nextPaymentReceiptNumber();
  const payloads = [];

  if (draft.mode === "customer"){
    const selected = selectedGoodsSettlementInvoices()
      .sort((a, b) => dateStamp(a.date) - dateStamp(b.date) || String(a.receiptNumber).localeCompare(String(b.receiptNumber)));
    if (!selected.length) throw new Error("Select at least one invoice to settle.");
    const selectedCurrencies = new Set(selected.map(invoice => invoice.currency).filter(Boolean));
    if (selectedCurrencies.size !== 1) throw new Error("Select invoices from one currency only.");
    const selectedBalance = selected.reduce((sum, invoice) => sum + Number(invoice.balance || 0), 0);
    if (settlementAmount > selectedBalance + 0.00000001) throw new Error("Settlement amount cannot exceed the selected balance.");

    for (const invoice of selected){
      if (remainingSettlement.amount <= 0.00000001) break;
      const fallbackEntry = state.entries.find(e => e.id === invoice.entryId) || null;
      const receiptData = getInventoryReceiptData(invoice.receiptNumber, fallbackEntry);
      if (receiptData.totalsByCurrency.size !== 1) continue;
      addInventorySettlementPayloads(payloads, receiptData, remainingSettlement, settlementDate, settlementNotes, settlementId, paymentReceiptNumber);
    }
  } else {
    const fallbackEntry = state.entries.find(e => e.id === draft.entryId) || null;
    const receiptData = getInventoryReceiptData(draft.receiptNumber, fallbackEntry);
    if (receiptData.totalsByCurrency.size !== 1) throw new Error("Balance clearance is available only for a single-currency receipt.");
    if (settlementAmount > receiptData.balanceTotal + 0.00000001) throw new Error("Settlement amount cannot exceed the current balance.");
    addInventorySettlementPayloads(payloads, receiptData, remainingSettlement, settlementDate, settlementNotes, settlementId, paymentReceiptNumber);
  }
  if (!payloads.length) throw new Error("No outstanding balance found for the selected invoice(s).");
  if (remainingSettlement.amount > 0.00000001) throw new Error("Settlement amount exceeds the current outstanding balance.");

  saveEntriesImmediately(payloads, { label: "Settlement" });
  state.inventoryDraft.settlement = null;
  closeModal("goodsSettlementModal");
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
  syncEditTaxControls(entry);

  els.editModal.classList.remove("hide");
  els.editModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function syncEditTaxControls(entry) {
  const group = document.getElementById("editTaxGroup");
  if (!group) return;
  const amount = Number(entry.entry_kind === "principal" ? entry.principal_amount : entry.action_amount || 0);
  const isExpense = hasExpenseAccountTag(entry.notes) && expenseMetaFromNotes(entry.notes).rowType === "EXPENSE";
  const isGoods = hasGoodsTag(entry.notes);
  const show = isGoods || isExpense;
  group.classList.toggle("hide", !show);
  if (!show) return;
  const meta = isGoods ? goodsMetaFromNotes(entry.notes) : expenseMetaFromNotes(entry.notes);
  const defaults = getTaxSettingForCurrency(entry.currency || "AED");
  const rate = meta.taxRate != null ? normalizeTaxRate(meta.taxRate) : defaults.rate;
  const mode = meta.taxMode ? normalizeTaxMode(meta.taxMode) : defaults.mode;
  const applied = meta.taxApplied || rate > 0 || Number(meta.taxAmount || 0) > 0;
  document.getElementById("editTaxApplied").checked = applied;
  document.getElementById("editTaxRate").value = rate ? trimInventoryNumber(rate, 2) : "";
  document.getElementById("editTaxMode").value = mode;
  updateEditTaxPreview(amount, entry.currency || "AED");
}

function updateEditTaxPreview(amountValue = null, currencyValue = null) {
  const preview = document.getElementById("editTaxPreview");
  if (!preview || document.getElementById("editTaxGroup")?.classList.contains("hide")) return;
  const entry = state.entries.find(e => e.id === state.editId);
  const amount = amountValue != null ? Number(amountValue || 0) : Number(document.getElementById("editAmount")?.value || 0);
  const currency = currencyValue || entry?.currency || "AED";
  const applied = !!document.getElementById("editTaxApplied")?.checked;
  const rate = normalizeTaxRate(document.getElementById("editTaxRate")?.value);
  const mode = normalizeTaxMode(document.getElementById("editTaxMode")?.value);
  preview.textContent = formatTaxSummary(calculateTaxBreakdownFromGross(amount, rate, mode, applied), currency);
}

function getEditTaxMeta(entry, amount) {
  const group = document.getElementById("editTaxGroup");
  if (!group || group.classList.contains("hide")) return {};
  const applied = !!document.getElementById("editTaxApplied")?.checked;
  const rate = normalizeTaxRate(document.getElementById("editTaxRate")?.value);
  const mode = normalizeTaxMode(document.getElementById("editTaxMode")?.value);
  return taxMetaFromBreakdown(calculateTaxBreakdownFromGross(amount, rate, mode, applied));
}

function closeModal(modalId){
  if (modalId === "btcWifQrScannerModal") {
    btcStopWifQrScanner();
  }
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.add("hide");
  modal.setAttribute("aria-hidden", "true");
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

  saveEntriesImmediately(payload, { label: "Loan" });

  // Create linked wallet entry
  if (walletId) {
    await createWalletEntryForLoanPrincipal(walletId, payload.principal_amount, payload.loan_date, payload.person_name, direction, payload.currency);
  }

  form.reset();
  setCurrencyChoice(form, "AED");
  defaultDateInputs(form);
  closeModal("entryModal");
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

  saveEntriesImmediately(payloads, { label: "Payment" });

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
      const itemCategory = normalizeInventoryCategory(currentMeta.itemCategory);
      const currentBoughtQty = normalizeStoredInventoryQty(currentMeta.boughtQty, itemCategory, 1);
      const newUnitActualPrice = amt / currentBoughtQty;
      
      updatedNotes = upsertGoodsMetaInNote(nt, {
        ...currentMeta,
        boughtQty: currentBoughtQty,
        unitActualPrice: newUnitActualPrice,
        ...getEditTaxMeta(currentEntry, amt)
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
      const itemCategory = normalizeInventoryCategory(currentMeta.itemCategory);
      const currentSoldQty = normalizeStoredInventoryQty(currentMeta.soldQty, itemCategory, 1);
      const newUnitSoldPrice = amt / currentSoldQty;
      
      editedNotes = upsertGoodsMetaInNote(nt, {
        ...currentMeta,
        soldQty: currentSoldQty,
        unitSoldPrice: newUnitSoldPrice,
        ...getEditTaxMeta(currentEntry, amt)
      });
    } else if (hasExpenseAccountTag(currentEntry.notes)) {
      const expenseMeta = expenseMetaFromNotes(currentEntry.notes);
      editedNotes = upsertExpenseMetaInNote(nt, {
        ...expenseMeta,
        ...getEditTaxMeta(currentEntry, amt)
      });
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

function pdfImageFormatFromDataUrl(dataUrl){
  const match = String(dataUrl || "").match(/^data:image\/([a-z0-9.+-]+);/i);
  const type = (match?.[1] || "png").toLowerCase();
  if (type.includes("jpeg") || type.includes("jpg")) return "JPEG";
  if (type.includes("webp")) return "WEBP";
  return "PNG";
}

function drawPdfWatermark(doc, logoData){
  if (!doc || !logoData) return;
  const pageInfo = doc.internal?.getCurrentPageInfo?.();
  const pageNumber = pageInfo?.pageNumber || doc.internal?.getNumberOfPages?.() || 1;
  if (!doc.__tripleMWatermarkedPages) doc.__tripleMWatermarkedPages = new Set();
  if (doc.__tripleMWatermarkedPages.has(pageNumber)) return;

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const width = Math.min(pageWidth * 0.58, 128);
  const height = Math.min(width * 0.34, 48);
  const x = (pageWidth - width) / 2;
  const y = (pageHeight - height) / 2;

  try {
    if (typeof doc.GState === "function" && typeof doc.setGState === "function") {
      doc.setGState(new doc.GState({ opacity: 0.045 }));
      doc.addImage(logoData, pdfImageFormatFromDataUrl(logoData), x, y, width, height);
      doc.setGState(new doc.GState({ opacity: 1 }));
      doc.__tripleMWatermarkedPages.add(pageNumber);
    }
  } catch {
    try {
      if (typeof doc.setGState === "function" && typeof doc.GState === "function") {
        doc.setGState(new doc.GState({ opacity: 1 }));
      }
    } catch {}
  }
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
  syncSectionCurrencyFiltersWithPage();
  renderPageCurrencySelector();
}

function updateCurrencySelectElements() {
  const allowedCurrencies = getPageScopedCurrencies();
  
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
  const allowedCurrencies = getPageScopedCurrencies();
  
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
  const pageCurrencies = getPageScopedCurrencies();
  const normalizedCurrency = normalizeCurrencyCode(currency);
  const isAllowed = allowedCurrencies.includes(normalizedCurrency) && pageCurrencies.includes(normalizedCurrency);
  
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

function pdfTextContainsCurrencyMarkers(text){
  if (Array.isArray(text)) return text.some(line => hasPdfCurrencyMarkers(line));
  return hasPdfCurrencyMarkers(text);
}

function splitPdfMarkedTextToSize(doc, text, maxWidth){
  const words = String(text ?? "").split(/(\s+)/);
  const lines = [];
  let line = "";
  words.forEach(word => {
    const candidate = `${line}${word}`;
    const visibleCandidate = stripPdfCurrencyMarkers(candidate);
    if (line && doc.getTextWidth(visibleCandidate) > maxWidth && /\S/.test(word)){
      lines.push(line.trimEnd());
      line = word.trimStart();
    } else {
      line = candidate;
    }
  });
  if (line) lines.push(line.trimEnd());
  return lines.length ? lines : [String(text ?? "")];
}

function tokenizePdfCurrencyText(text){
  const markerFonts = {
    [PDF_CURRENCY_MARKERS.AED]: "AED",
    [PDF_CURRENCY_MARKERS.SAR]: "SAR"
  };
  const raw = String(text ?? "");
  const tokens = [];
  let buffer = "";
  for (let i = 0; i < raw.length; i += 1){
    const ch = raw[i];
    const font = markerFonts[ch];
    if (font){
      if (buffer){
        tokens.push({ text: buffer, font: null });
        buffer = "";
      }
      const symbol = raw[i + 1] || "";
      if (symbol){
        tokens.push({ text: symbol, font });
        i += 1;
      }
    } else {
      buffer += ch;
    }
  }
  if (buffer) tokens.push({ text: buffer, font: null });
  return tokens;
}

function installPdfCurrencyTextRenderer(doc){
  if (!doc || doc.__tripleMCurrencyRendererInstalled) return;
  const originalText = doc.text.bind(doc);

  function restoreFont(font){
    if (!font) return;
    try {
      doc.setFont(font.fontName || "helvetica", font.fontStyle || "normal");
    } catch {
      doc.setFont("helvetica", "normal");
    }
  }

  function drawMarkedLine(line, x, y, options = {}){
    const raw = String(line ?? "");
    if (!hasPdfCurrencyMarkers(raw)){
      return originalText(raw, x, y, options);
    }

    const baseFont = doc.getFont();
    const visibleText = stripPdfCurrencyMarkers(raw);
    const align = options.align || "left";
    const drawOptions = { ...options };
    delete drawOptions.align;
    delete drawOptions.maxWidth;

    let cursorX = x;
    if (align === "right") cursorX = x - doc.getTextWidth(visibleText);
    if (align === "center") cursorX = x - (doc.getTextWidth(visibleText) / 2);

    tokenizePdfCurrencyText(raw).forEach(token => {
      if (!token.text) return;
      if (token.font) {
        try {
          doc.setFont(token.font, "normal");
        } catch {
          restoreFont(baseFont);
        }
      } else {
        restoreFont(baseFont);
      }
      originalText(token.text, cursorX, y, drawOptions);
      cursorX += doc.getTextWidth(token.text);
    });

    restoreFont(baseFont);
    return doc;
  }

  doc.text = function tripleMCurrencyText(text, x, y, options, transform){
    if (!pdfTextContainsCurrencyMarkers(text)){
      return originalText(text, x, y, options, transform);
    }

    const safeOptions = options && typeof options === "object" ? { ...options } : {};
    let lines = Array.isArray(text) ? text.map(line => String(line ?? "")) : [String(text ?? "")];
    if (!Array.isArray(text) && safeOptions.maxWidth){
      lines = splitPdfMarkedTextToSize(doc, lines[0], Number(safeOptions.maxWidth));
    }
    const lineHeight = typeof doc.getLineHeight === "function"
      ? doc.getLineHeight() / doc.internal.scaleFactor
      : (doc.getFontSize() * 1.15) / doc.internal.scaleFactor;
    lines.forEach((line, index) => drawMarkedLine(line, x, y + (index * lineHeight), safeOptions));
    return doc;
  };

  doc.__tripleMCurrencyRendererInstalled = true;
}

function pdfCellTextValue(cell){
  const raw = cell?.raw;
  if (raw && typeof raw === "object" && "content" in raw) return raw.content;
  if (Array.isArray(cell?.text)) return cell.text.join(" ");
  return raw ?? cell?.text ?? "";
}

function isPdfMoneyLike(value){
  const text = stripPdfCurrencyMarkers(Array.isArray(value) ? value.join(" ") : value);
  if (!/\d/.test(text)) return false;
  return /(^|[\s(:+-])(?:~|\$|Rs\.|₿)\s*[-+]?\d|[-+]?\d[\d,]*(?:\.\d+)?\s*(?:~|\$|Rs\.|₿)/.test(text);
}

function installProfessionalPdfTableDefaults(doc){
  if (!doc?.autoTable || doc.__tripleMAutoTableInstalled) return;
  const originalAutoTable = doc.autoTable.bind(doc);
  doc.autoTable = function tripleMAutoTable(options = {}){
    const userWillDrawPage = options.willDrawPage;
    const userDidParseCell = options.didParseCell;
    const nextOptions = {
      ...options,
      theme: options.theme || "grid",
      showHead: options.showHead || "everyPage",
      rowPageBreak: options.rowPageBreak || "avoid",
      styles: {
        font: "helvetica",
        fontSize: 8.4,
        cellPadding: 2.4,
        lineColor: [226, 232, 240],
        lineWidth: 0.12,
        textColor: [30, 41, 59],
        overflow: "linebreak",
        valign: "middle",
        ...options.styles,
        fillColor: false
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: 255,
        fontStyle: "bold",
        lineColor: [15, 23, 42],
        lineWidth: 0.12,
        halign: "center",
        valign: "middle",
        ...options.headStyles
      },
      bodyStyles: {
        ...(options.bodyStyles || {}),
        fillColor: false
      },
      alternateRowStyles: {
        ...(options.alternateRowStyles || {}),
        fillColor: false
      },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: "bold",
        lineColor: [203, 213, 225],
        lineWidth: 0.15,
        ...(options.footStyles || {})
      },
      margin: {
        top: 52,
        bottom: 34,
        left: 14,
        right: 14,
        ...(options.margin || {})
      },
      willDrawPage(data){
        drawPdfWatermark(doc, doc.__tripleMPdfLogoData);
        if (typeof userWillDrawPage === "function") userWillDrawPage(data);
      },
      didParseCell(data){
        if (typeof userDidParseCell === "function") userDidParseCell(data);
        if (data.section === "body"){
          data.cell.styles.fillColor = false;
        }
        if (data.section === "body" && isPdfMoneyLike(pdfCellTextValue(data.cell))){
          if (!data.cell.styles.halign || data.cell.styles.halign === "left"){
            data.cell.styles.halign = "right";
          }
          data.cell.styles.fontStyle = data.cell.styles.fontStyle || "normal";
        }
      }
    };
    return originalAutoTable(nextOptions);
  };
  doc.__tripleMAutoTableInstalled = true;
}

function applyProfessionalPdfDefaults(doc){
  if (!doc || doc.__tripleMProfessionalPdfApplied) return;
  installPdfCurrencyTextRenderer(doc);
  installProfessionalPdfTableDefaults(doc);
  try {
    doc.setProperties({
      title: PDF_BRAND.systemName,
      subject: "Financial document",
      creator: PDF_BRAND.systemName
    });
  } catch {}
  doc.__tripleMProfessionalPdfApplied = true;
}

function drawPdfHeader(doc, logoData, title, subtitle){
  const pageWidth = doc.internal.pageSize.getWidth();

  applyProfessionalPdfDefaults(doc);
  doc.__tripleMPdfLogoData = logoData || doc.__tripleMPdfLogoData || null;
  drawPdfWatermark(doc, doc.__tripleMPdfLogoData);
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, 38, "F");
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 5, "F");
  doc.setFillColor(36, 87, 214);
  doc.rect(0, 5, pageWidth, 1.4, "F");
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.line(14, 36, pageWidth - 14, 36);

  if (logoData){
    try {
      // Check if logo is from JSON (external URL) or default
      const isJsonLogo = fullConfigData?.logo && fullConfigData.logo.trim();
      
      if (isJsonLogo) {
        // For JSON logos, use smaller size to fit properly without stretching
        doc.addImage(logoData, "PNG", 14, 11, 36, 12);
      } else {
        // For default logo, use original size
        doc.addImage(logoData, "PNG", 14, 10, 42, 15);
      }
    } catch {}
  }

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(title, 68, 16);

  if (subtitle) {
    doc.setTextColor(71, 85, 105);
    doc.setFontSize(8.2);
    doc.setFont("helvetica", "normal");
    const subtitleLines = hasPdfCurrencyMarkers(subtitle)
      ? splitPdfMarkedTextToSize(doc, subtitle, pageWidth - 86)
      : doc.splitTextToSize(subtitle, pageWidth - 86);
    doc.text(subtitleLines, 68, 23);
  }
}

function drawPdfOwnerBlock(doc, y = 48){
  // Use JSON config data if available, otherwise use defaults
  const owner = getLoggedInUserDisplayName();
  const email = fullConfigData?.email || PDF_BRAND.email;
  const mobile = fullConfigData?.Mobile || PDF_BRAND.mobile;
  const whatsapp = fullConfigData?.WhatsApp || PDF_BRAND.whatsapp;
  
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, y - 5, 92, 24, 2, 2, "FD");
  doc.setTextColor(100, 116, 139);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.2);
  doc.text("PREPARED BY", 18, y + 1);
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9.2);
  doc.text(String(owner || ""), 18, y + 7, { maxWidth: 82 });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  doc.setTextColor(71, 85, 105);
  doc.text(`Email: ${email}`, 18, y + 12, { maxWidth: 82 });
  doc.text(`Mobile: ${mobile} | WhatsApp: ${whatsapp}`, 18, y + 17, { maxWidth: 82 });
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
  await loadCustomFontsForPdf(doc);

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
  doc.text(`Currency: ${pdfCurrencyLabel(data.currency)}`, 132, 54);
  doc.text(`Loan Entries: ${data.loanCount}`, 132, 60);

  const formatMon = (amt) => {
     return formatPdfAmount(amt, data.currency);
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

  const orderedTableData = tableData.map(row => [row[0], row[1], row[4], row[2], row[3]]);

  doc.autoTable({
    startY: 88,
    head: [['Date', 'Type', 'Notes/Description', 'Amount', 'Remaining']],
    body: orderedTableData,
    theme: 'grid',
    headStyles: { fillColor: [36, 87, 214] },
    styles: { font: 'helvetica' },
    columnStyles: {
      2: { cellWidth: 62 },
      3: { halign: "right" },
      4: { halign: "right" }
    },
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
  return formatCurrencyAmountText(amount, currency, { decimals: normalizeCurrencyCode(currency) === "BTC" ? 8 : 2 });
}

// New function for PDF-specific currency formatting
function formatPdfAmount(amount, currency){
  return formatCurrencyAmountText(amount, currency, { forPdf: true });
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
        const tax = taxBreakdownFromMeta(meta, row.action_amount || 0);
        return [
          meta.itemName || "—",
          displayDate(row.action_date || "—"),
          `${account.person_name || "Wallet"} · ${meta.expenseType || "Other"}`,
          account.person_name || "Wallet",
          formatPdfAmount(Number(row.action_amount || 0), account.currency),
          tax.tax ? formatPdfAmount(tax.tax, account.currency) : "-",
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
        row.note || "-",
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

  const tableRows = expensePdf
    ? report.rows.map(row => [row[0], row[1], row[row.length > 7 ? 7 : 6], row[2], row[3], row.length > 7 ? row[5] : "-", row[4]])
    : report.rows.map(row => [row[0], row[1], row[2], row.length > 6 ? row[3] : row[5], row.length > 6 ? row[4] : row[3], row.length > 6 ? row[5] : row[4]]);

  const tableHead = expensePdf
    ? [["Item", "Date", "Notes/Description", "Wallet / Type", "Wallet", "VAT", "Amount"]]
    : [["Member", "Date", "Type", "Notes/Description", "Amount", "Remaining"]];

  doc.autoTable({
    startY: 72,
    head: tableHead,
    body: tableRows,
    theme: "grid",
    headStyles: { fillColor: [36, 87, 214] },
    styles: { font: "helvetica", fontSize: expensePdf ? 7.8 : 9, cellPadding: expensePdf ? 1.9 : 2.5, overflow: "linebreak" },
    tableWidth: 182,
    columnStyles: expensePdf
      ? {
          0: { cellWidth: 24 },
          1: { cellWidth: 24 },
          2: { cellWidth: 46 },
          3: { cellWidth: 28 },
          4: { cellWidth: 24 },
          5: { cellWidth: 17, halign: "right" },
          6: { cellWidth: 19, halign: "right" }
        }
      : {
          0: { cellWidth: 34 },
          3: { cellWidth: 48 },
          4: { cellWidth: 28, halign: "right" },
          5: { cellWidth: 28, halign: "right" }
        },
    margin: { top: 50, bottom: 40 },
    didDrawPage: (data) => {
      drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false);
    }
  });

  doc.save(`${label.replace(/\s+/g, "_")}_Report.pdf`);
}


async function loadCustomFontsForPdf(doc){
  if (!doc) return;
  if (doc.__tripleMFontsLoaded) {
    applyProfessionalPdfDefaults(doc);
    return;
  }
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
    doc.__tripleMFontsLoaded = true;
  } catch (e) {
    console.log('Failed to load custom fonts:', e);
  } finally {
    applyProfessionalPdfDefaults(doc);
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
  const title = `Currency Report - ${pdfCurrencyLabel(currency)}`;
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
    const givenTableRows = givenRows.map(row => [row[0], row[1], row[2], row[5], row[3], row[4]]);
    doc.autoTable({
      startY: 72,
      head: [["Member", "Date", "Type", "Notes/Description", "Amount", "Remaining"]],
      body: givenTableRows,
      theme: "grid",
      headStyles: { fillColor: [36, 87, 214] },
      styles: { font: "helvetica", fontSize: 9, cellPadding: 2.5 },
      columnStyles: {
        3: { cellWidth: 50 },
        4: { halign: "right" },
        5: { halign: "right" }
      },
      margin: { top: 50, bottom: 40 },
      didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
    });
  }

  // Add taken loans section if there's space or on new page
  if (takenRows.length > 0) {
    if (givenRows.length > 0) doc.addPage();
    const takenTitle = `Currency Report - ${pdfCurrencyLabel(currency)} (Taken Loans)`;
    drawPdfHeader(doc, logoData, takenTitle, subtitle);
    drawPdfOwnerBlock(doc, 48);
    const takenTableRows = takenRows.map(row => [row[0], row[1], row[2], row[5], row[3], row[4]]);
    doc.autoTable({
      startY: 72,
      head: [["Member", "Date", "Type", "Notes/Description", "Amount", "Remaining"]],
      body: takenTableRows,
      theme: "grid",
      headStyles: { fillColor: [36, 87, 214] },
      styles: { font: "helvetica", fontSize: 9, cellPadding: 2.5 },
      columnStyles: {
        3: { cellWidth: 50 },
        4: { halign: "right" },
        5: { halign: "right" }
      },
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
  const title = "Inventory Statement";
  const subtitle = `Generated: ${new Date().toLocaleString()}`;

  drawPdfHeader(doc, logoData, title, subtitle);
  drawPdfOwnerBlock(doc, 48);
  const totalsByCurrency = goodsAll.reduce((acc, group) => {
    const key = group.currency || "";
    acc[key] = acc[key] || { purchase: 0, sales: 0, tax: 0, profitLoss: 0 };
    acc[key].purchase += Number(group.bought || 0);
    acc[key].sales += Number(group.soldTotal || 0);
    acc[key].tax += Number(group.purchaseTaxTotal || 0) + Number(group.salesTaxTotal || 0);
    acc[key].profitLoss += Number(group.profitLoss || 0);
    return acc;
  }, {});
  const totalsText = Object.entries(totalsByCurrency)
    .map(([currency, row]) => `${pdfCurrencyLabel(currency)} Purchase ${formatPdfAmount(row.purchase, currency)} | Sales ${formatPdfAmount(row.sales, currency)} | VAT ${formatPdfAmount(row.tax, currency)} | P/L ${formatPdfAmount(row.profitLoss, currency)}`)
    .join("   ");

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, 72, 182, 24, 2, 2, "F");
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, 72, 182, 24, 2, 2, "S");
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9.5);
  doc.text(`Total Items: ${goodsAll.length}`, 18, 80);
  doc.text(`Purchase Qty: ${inventoryQtySummary(goodsAll, "boughtQty")}`, 18, 87);
  doc.text(`Sold Qty: ${inventoryQtySummary(goodsAll, "soldQty")}`, 105, 80);
  doc.text(`In Stock: ${inventoryQtySummary(goodsAll, "remainingQty")}`, 105, 87);
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(doc.splitTextToSize(totalsText || "No totals", 174), 18, 94);

  const goodsRows = goodsAll.map(group => [
    group.itemCode || shortId(group.group_id) || "-",
    group.person_name || "Unnamed",
    normalizeInventoryCategory(group.itemCategory) === INVENTORY_CATEGORY_WEIGHT ? "Weight" : "Numbers",
    inventoryQtyLabel(group.boughtQty, group.itemCategory),
    inventoryQtyLabel(group.soldQty, group.itemCategory),
    inventoryQtyLabel(group.remainingQty, group.itemCategory),
    formatPdfAmount(group.bought || 0, group.currency),
    formatPdfAmount(group.soldTotal || 0, group.currency),
    formatPdfAmount((group.purchaseTaxTotal || 0) + (group.salesTaxTotal || 0), group.currency),
    formatPdfAmount(group.profitLoss || 0, group.currency)
  ]);

  doc.autoTable({
    startY: 104,
    head: [["Item Code", "Item", "Category", "Purchase Qty", "Sold Qty", "In Stock", "Purchase Total", "Sales Total", "VAT", "P/L"]],
    body: goodsRows,
    theme: "grid",
    headStyles: { fillColor: [36, 87, 214], textColor: 255, fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 7.5, cellPadding: 2, overflow: "linebreak" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 19 },
      1: { cellWidth: 27 },
      2: { cellWidth: 15 },
      3: { cellWidth: 17, halign: "right" },
      4: { cellWidth: 15, halign: "right" },
      5: { cellWidth: 17, halign: "right" },
      6: { cellWidth: 19, halign: "right" },
      7: { cellWidth: 19, halign: "right" },
      8: { cellWidth: 16, halign: "right" },
      9: { cellWidth: 18, halign: "right" }
    },
    margin: { top: 50, bottom: 40 },
    didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
  });

  doc.save("Inventory_Statement.pdf");
}

function getExpenseHistoryItemsForExport(){
  const accounts = getExpenseAccounts();
  const spendAttached = filterExpenseHistoryRows(collectExpenseSpendRows(accounts));
  let items = groupExpenseItems(spendAttached);
  if (state.search.expenses && state.search.expenses.trim() !== ""){
    items = filterExpensesBySearch(items, state.search.expenses);
  }
  return items;
}

function flattenExpenseHistoryItems(items){
  const rows = [];
  for (const item of items){
    for (const tx of item.txs){
      rows.push({
        item: item.displayName,
        currency: item.currency,
        expenseType: tx.expenseType || item.expenseType || "Other",
        date: tx.date,
        wallet: tx.wallet || "Wallet",
        amount: Number(tx.amount || 0),
        netAmount: Number(tx.netAmount || 0),
        taxAmount: Number(tx.taxAmount || 0),
        taxRate: Number(tx.taxRate || 0),
        notes: cleanExpenseNote(tx.notes)
      });
    }
  }
  return rows.sort((a, b) => dateStamp(b.date) - dateStamp(a.date));
}

function expenseHistoryRangeSlug(){
  return String(state.expenseHistoryRange || "month").replace(/[^a-z0-9_-]/gi, "_");
}

function expenseHistoryPdfNewPageIfNeeded(doc, logoData, title, subtitle, y, needed = 32){
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed <= pageHeight - 38) return y;
  doc.addPage();
  drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false);
  return 52;
}

async function downloadExpenseTransactionsHistoryPDF(){
  if (!window.jspdf){
    alert("PDF library loading. Please try again in a moment.");
    return;
  }

  const items = getExpenseHistoryItemsForExport();
  const rows = flattenExpenseHistoryItems(items);
  if (!rows.length){
    alert("No transactions found for the selected history range.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  await loadCustomFontsForPdf(doc);

  const logoData = await getPdfLogo();
  const rangeLabel = expenseHistoryRangeText();
  const title = "Expense Transactions History";
  const subtitle = `${rangeLabel} | Generated: ${new Date().toLocaleString()}`;
  drawPdfHeader(doc, logoData, title, subtitle);
  drawPdfOwnerBlock(doc, 52);

  const pageWidth = doc.internal.pageSize.getWidth();
  const walletCount = new Set(rows.map(r => r.wallet)).size;
  const currencyTotals = new Map();
  const currencyTaxTotals = new Map();
  const currencyCounts = new Map();
  for (const r of rows){
    const cur = r.currency || "AED";
    currencyTotals.set(cur, (currencyTotals.get(cur) || 0) + Number(r.amount || 0));
    currencyTaxTotals.set(cur, (currencyTaxTotals.get(cur) || 0) + Number(r.taxAmount || 0));
    currencyCounts.set(cur, (currencyCounts.get(cur) || 0) + 1);
  }

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, 74, pageWidth - 28, 24, 2, 2, "F");
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, 74, pageWidth - 28, 24, 2, 2, "S");
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Report Summary", 20, 83);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Date selection: ${rangeLabel}`, 20, 90);
  doc.text(`Transactions: ${rows.length}`, 132, 83);
  doc.text(`Expense items: ${items.length}`, 132, 90);
  doc.text(`Wallets: ${walletCount}`, 132, 96);

  const totalsBody = sortCurrenciesList([...currencyTotals.keys()]).map(cur => [
    pdfCurrencyLabel(cur),
    String(currencyCounts.get(cur) || 0),
    formatPdfAmount(currencyTaxTotals.get(cur) || 0, cur),
    formatPdfAmount(currencyTotals.get(cur) || 0, cur)
  ]);

  doc.autoTable({
    startY: 106,
    head: [["Currency", "Transactions", "VAT", "Total Spent"]],
    body: totalsBody,
    theme: "grid",
    headStyles: { fillColor: [36, 87, 214], textColor: 255, fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 2.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { cellWidth: 35, halign: "right" },
      2: { cellWidth: 35, halign: "right" },
      3: { cellWidth: 55, halign: "right" }
    },
    margin: { left: 14, right: 14, top: 50, bottom: 40 },
    didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
  });

  let y = (doc.lastAutoTable?.finalY || 106) + 12;
  for (const item of items){
    y = expenseHistoryPdfNewPageIfNeeded(doc, logoData, title, subtitle, y, 45);
    doc.setFillColor(36, 87, 214);
    doc.roundedRect(14, y, pageWidth - 28, 9, 1.5, 1.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(`${item.displayName} | ${pdfCurrencyLabel(item.currency)}`, 18, y + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`${item.txs.length} transaction(s) | Total: ${formatPdfAmount(item.total, item.currency)} | Type: ${item.expenseType || "Other"}`, pageWidth - 18, y + 6, { align: "right" });

    const body = item.txs.map(tx => [
      displayDate(tx.date || "â€”"),
      tx.wallet || "â€”",
      tx.expenseType || item.expenseType || "Other",
      formatPdfAmount(tx.amount, item.currency),
      tx.taxAmount ? formatPdfAmount(tx.taxAmount, item.currency) : "-",
      wrapTextForPdf(cleanExpenseNote(tx.notes), 62).split("\n")
    ]);
    const orderedBody = body.map(row => [row[0], row[1], row[2], row[5], row[4], row[3]]);

    doc.autoTable({
      startY: y + 13,
      head: [["Date", "Wallet", "Type", "Notes/Description", "VAT", "Amount"]],
      body: orderedBody,
      theme: "grid",
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold" },
      styles: { font: "helvetica", fontSize: 8, cellPadding: 2.3, overflow: "linebreak" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 34 },
        2: { cellWidth: 26 },
        3: { cellWidth: 46 },
        4: { cellWidth: 24, halign: "right" },
        5: { cellWidth: 28, halign: "right" }
      },
      margin: { left: 14, right: 14, top: 50, bottom: 40 },
      didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
    });
    y = (doc.lastAutoTable?.finalY || y + 13) + 12;
  }

  doc.save(`Expense_Transactions_History_${expenseHistoryRangeSlug()}_${todayISO()}.pdf`);
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
    ? `Currency: ${pdfCurrencyLabel(currencyFilter)}`
    : "All currencies (separate totals per currency)";
  const title = currencyFilter ? `Top-Up Records - ${pdfCurrencyLabel(currencyFilter)}` : "Top-Up Records - all currencies";
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
      doc.text(`Total (${pdfCurrencyLabel(c)}): ${formatPdfAmount(totals[c], c)}`, 120, y);
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
    if (currencyFilter) return [d, w, ty, wrappedNote, amt];
    return [d, w, ty, wrappedNote, pdfCurrencyLabel(tx.currency || ""), amt];
  });

  doc.autoTable({
    startY: tableStartY,
    head: currencyFilter ? [["Date", "Wallet", "Type", "Notes/Description", "Amount"]] : [["Date", "Wallet", "Type", "Notes/Description", "Currency", "Amount"]],
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
          3: { cellWidth: 72 },
          4: { cellWidth: 26, halign: "right" }
        }
      : {
          0: { cellWidth: 17 },
          1: { cellWidth: 31 },
          2: { cellWidth: 19 },
          3: { cellWidth: 79 },
          4: { cellWidth: 12 },
          5: { cellWidth: 22, halign: "right" }
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
        convertedLeg: r.otherLegPdfDisplay || r.otherLegDisplay,
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
  const title = currencyFilter ? `Transfer Records - ${pdfCurrencyLabel(currencyFilter)}` : "Transfer Records - all currencies";
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
    doc.text(`${pdfCurrencyLabel(cur)} - Sent: ${formatPdfAmount(sent, cur)}   Received: ${formatPdfAmount(received, cur)}`, 120, ySummary);
    ySummary += 5;
  }

  const body = tableRows.map(r => {
    const wrappedNote = wrapTextForPdf(r.notes, 40).split('\n');
    return currencyFilter
      ? [r.date, r.type, r.wallet, r.withParty, wrappedNote, r.rate, r.convertedLeg, r.amount]
      : [pdfCurrencyLabel(r.currency), r.date, r.type, r.wallet, r.withParty, wrappedNote, r.rate, r.convertedLeg, r.amount];
  });

  doc.autoTable({
    startY: ySummary + 6,
    head: currencyFilter
      ? [["Date", "Type", "Wallet", "With", "Notes/Description", "Rate", "Converted leg", "Amount"]]
      : [["Currency", "Date", "Type", "Wallet", "With", "Notes/Description", "Rate", "Converted leg", "Amount"]],
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
          4: { cellWidth: 60 }, // Notes
          5: { cellWidth: 12 }, // Rate
          6: { cellWidth: 17 }, // Converted leg
          7: { cellWidth: 20, halign: "right" }  // Amount
        }
      : {
          0: { cellWidth: 9 }, // Cur
          1: { cellWidth: 15 }, // Date
          2: { cellWidth: 12 }, // Type
          3: { cellWidth: 20 }, // Wallet
          4: { cellWidth: 17 }, // With
          5: { cellWidth: 61 }, // Notes
          6: { cellWidth: 11 }, // Rate
          7: { cellWidth: 15 }, // Converted leg
          8: { cellWidth: 20, halign: "right" }  // Amount
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
  doc.text(`VAT: ${formatPdfAmount(targetItem.taxTotal || 0, targetItem.currency)}`, 132, 66);

  const rows = targetItem.txs.map(tx => [
    displayDate(tx.date || "—"),
    tx.wallet || "—",
    tx.expenseType || "—",
    formatPdfAmount(tx.amount, targetItem.currency),
    tx.taxAmount ? formatPdfAmount(tx.taxAmount, targetItem.currency) : "-",
    cleanExpenseNote(tx.notes)
  ]);
  const orderedRows = rows.map(row => [row[0], row[1], row[2], row[5], row[4], row[3]]);

  doc.autoTable({
    startY: 78,
    head: [["Date", "Wallet", "Type", "Notes/Description", "VAT", "Amount"]],
    body: orderedRows,
    theme: "grid",
    headStyles: { fillColor: [36, 87, 214] },
    styles: { font: "helvetica", fontSize: 8.4, cellPadding: 2.3, overflow: "linebreak" },
    columnStyles: { 3: { cellWidth: 46 }, 4: { cellWidth: 24, halign: "right" }, 5: { cellWidth: 30, halign: "right" } },
    margin: { top: 50, bottom: 40 },
    didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
  });

  // Add summary at the bottom
  const finalY = doc.lastAutoTable.finalY || 72;
  doc.setTextColor(23, 33, 43);
  doc.setFontSize(10);
  doc.text(`Total Amount: ${formatPdfAmount(targetItem.total, targetItem.currency)}`, 14, finalY + 10);
  doc.text(`Total VAT: ${formatPdfAmount(targetItem.taxTotal || 0, targetItem.currency)}`, 14, finalY + 16);

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
  const sourceAccount = getExpenseAccounts({ applyUiFilters: false }).find(a => a.group_id === fromGroupId);
  if (sourceAccount?.currency === "BTC") {
    alert("BTC wallet transactions are loaded directly from the blockchain.");
    return;
  }

  els.transferModal.classList.remove("hide");
  els.transferModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  
  els.transferModalTitle.textContent = "Transfer Money";
  els.transferModalDesc.textContent = `Move money from ${fromWalletName} to another wallet.`;
  els.transferForm.reset();
  defaultDateInputs(els.transferForm);
  
  // Populate wallet options
  const accounts = getExpenseAccounts({ applyUiFilters: false }).filter(a => a.currency !== "BTC");
  
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
  if (fromAccount.currency === "BTC" || toAccount.currency === "BTC") {
    throw new Error("BTC wallet transactions are loaded directly from the blockchain.");
  }
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
  
  saveEntriesImmediately([expensePayload, topupPayload], { label: "Transfer" });
  
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
  amountElement.innerHTML = money(amount, currency);
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
  amountElement.innerHTML = money(amount, currency);
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
  const walletAddress = state.bitcoin.wallet ? state.bitcoin.wallet.address : 'Your Wallet';
  
  // Update overlay content
  els.btcTransactionSuccessAmount.innerHTML = money(btcSatToBtc(amountSat), "BTC");
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
  if (isGuestMode()) {
    alert("Demo Login cannot download the full report. Please use a real login for full exports.");
    return;
  }
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

    const processedRows = section.rows.map(row => {
      if (secExpense) {
        const walletCell = row[2];
        const amountCell = row[4];
        return [
          row[0],
          row[1],
          walletCell,
          amountCell,
          row[5],
          row[6]
        ];
      } else {
        return row;
      }
    });

    const secHead = secExpense
      ? [["Item", "Date", "Notes/Description", "Wallet / Type", "Wallet", "VAT", "Amount"]]
      : [["Member", "Date", "Type", "Notes/Description", "Amount", "Remaining"]];
    const finalSectionRows = secExpense
      ? section.rows.map(row => [row[0], row[1], row[row.length > 7 ? 7 : 6], row[2], row[3], row.length > 7 ? row[5] : "-", row[4]])
      : section.rows.map(row => [row[0], row[1], row[2], row.length > 6 ? row[3] : row[5], row.length > 6 ? row[4] : row[3], row.length > 6 ? row[5] : row[4]]);
    const finalSectionHead = secExpense
      ? [["Item", "Date", "Notes/Description", "Wallet / Type", "Wallet", "VAT", "Amount"]]
      : [["Member", "Date", "Type", "Notes/Description", "Amount", "Remaining"]];

    doc.autoTable({
      startY: 72,
      head: finalSectionHead,
      body: finalSectionRows,
      theme: "grid",
      headStyles: { fillColor: [36, 87, 214] },
      styles: { font: "helvetica", fontSize: secExpense ? 7.7 : 8.5, cellPadding: secExpense ? 1.8 : 2.2, overflow: "linebreak" },
      tableWidth: 182,
      columnStyles: secExpense
        ? {
            0: { cellWidth: 24 },
            1: { cellWidth: 24 },
            2: { cellWidth: 46 },
            3: { cellWidth: 28 },
            4: { cellWidth: 24 },
            5: { cellWidth: 17, halign: "right" },
            6: { cellWidth: 19, halign: "right" }
          }
        : { 3: { cellWidth: 50 }, 4: { halign: "right" }, 5: { halign: "right" } },
      margin: { top: 50, bottom: 40 },
      didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, section.label, "Section Summary", false)
    });
    printedSections += 1;
  }

  doc.save("All_Sections_Detailed_Report.pdf");
}

function downloadJsonBackup(){
  if (isGuestMode()) {
    alert("Demo Login cannot download JSON backups. Please use a real login for backup exports.");
    return;
  }
  const payload = {
    exportedAt: new Date().toISOString(),
    source: isGuestMode() ? "guest-local" : state.dataSource,
    entries: state.entries,
    ...(isGuestMode() ? {
      notes: state.notes,
      bitcoinWallets: state.bitcoinWallets
    } : {})
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${isGuestMode() ? "TripleM_Guest_Backup" : "LoanLedger_Backup"}_${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadCsvBackup(){
  if (isGuestMode()) {
    alert("Demo Login cannot download CSV backups. Please use a real login for backup exports.");
    return;
  }
  const csvText = toCsv(state.entries);
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${isGuestMode() ? "TripleM_Guest_Backup" : "LoanLedger_Backup"}_${todayISO()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function importJsonBackup(file){
  if (isGuestMode()) {
    alert("Demo Login cannot import backups. Please use a real login for import/export features.");
    return;
  }
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
  if (isGuestMode()) {
    if (Array.isArray(parsed.notes)) {
      state.notes = parsed.notes.filter(note => note && note.id && note.content);
      saveGuestNotesToStorage();
      renderNotes();
    }
    if (Array.isArray(parsed.bitcoinWallets)) {
      state.bitcoinWallets = parsed.bitcoinWallets.filter(wallet => wallet && wallet.id && wallet.address);
      saveGuestBitcoinWalletsToStorage();
      renderBitcoinWallets();
      renderExistingAddressesDropdown();
    }
  }
  if (state.unlocked) {
    await refreshDbSnapshot();
    renderAll();
  }
}

async function importCsvBackup(file){
  if (isGuestMode()) {
    alert("Demo Login cannot import backups. Please use a real login for import/export features.");
    return;
  }
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

async function importBackupFile(file){
  if (!file) return;
  const name = String(file.name || "").toLowerCase();
  const type = String(file.type || "").toLowerCase();
  if (name.endsWith(".json") || type.includes("json")) {
    await importJsonBackup(file);
    return;
  }
  if (name.endsWith(".csv") || type.includes("csv")) {
    await importCsvBackup(file);
    return;
  }

  const preview = (await file.text()).trimStart();
  if (preview.startsWith("{") || preview.startsWith("[")) {
    await importJsonBackup(file);
    return;
  }
  await importCsvBackup(file);
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
    if (entry.id && state.pendingDbSyncIds.has(entry.id)) return false;
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
  setMainOverviewHeading(getActiveTabKey() === "goods" ? "inventory" : "loans");
}

function collapseMainOverview() {
  els.mainOverview.classList.remove("expanded");
  els.mainOverview.classList.add("collapsed");
  els.toggleMainOverviewBtn.textContent = "▶";
  setMainOverviewHeading(getActiveTabKey() === "goods" ? "inventory" : "loans");
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

  document.addEventListener("click", handleGuestRestrictedClick, true);

  document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => {
    if (btn.dataset.tab) activate(btn.dataset.tab);
  }));
  document.querySelectorAll("[data-loan-tab]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      activate(btn.dataset.loanTab);
      closeAllMenus();
    });
  });

  document.querySelectorAll("[data-open-modal]").forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.openModal;
      const direction = btn.dataset.direction || "given";
      if (mode === "principal") activate(direction === "given" ? "given" : "taken");
      if (mode === "payment") activate(direction === "given" ? "given" : "taken");
      openEntryModal(mode, direction);
    });
  });
  if (els.openGoodsBoughtBtn) {
    els.openGoodsBoughtBtn.addEventListener("click", () => {
      activate("goods");
      openGoodsModal("bought");
    });
  }
  if (els.openGoodsSoldBtn) {
    els.openGoodsSoldBtn.addEventListener("click", () => {
      activate("goods");
      openGoodsModal("sold");
    });
  }
  if (els.inventoryCustomerStatementBtn) {
    els.inventoryCustomerStatementBtn.addEventListener("click", () => downloadInventoryCustomerStatementPDF(state.inventoryDraft.customerRecordName));
  }
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
        if (key === "page-currency") {
          renderPageCurrencySelector();
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
  
// Add resize listener for wallets layout
let resizeTimeout;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    updateWalletsLayoutOnResize();
  }, 250); // Debounce to avoid excessive calls
});

  document.querySelectorAll("[data-close-modal]").forEach(btn => {
    btn.addEventListener("click", e => closeModal(e.target.dataset.closeModal));
  });

  [els.entryModal, els.editModal, els.goodsModal, els.goodsSettlementModal, els.inventoryCustomerModal, els.expenseModal].forEach(m => {
    if (!m) return;
    m.addEventListener("click", e => {
      if (e.target && e.target.matches(".modal-backdrop")) closeModal(m.id);
    });
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      if (!els.entryModal.classList.contains("hide")) closeModal("entryModal");
      if (!els.editModal.classList.contains("hide")) closeModal("editModal");
      if (!els.goodsModal.classList.contains("hide")) closeModal("goodsModal");
      if (els.goodsSettlementModal && !els.goodsSettlementModal.classList.contains("hide")) closeModal("goodsSettlementModal");
      if (els.inventoryCustomerModal && !els.inventoryCustomerModal.classList.contains("hide")) closeModal("inventoryCustomerModal");
      if (!els.expenseModal.classList.contains("hide")) closeModal("expenseModal");
      if (els.btcWifQrScannerModal && !els.btcWifQrScannerModal.classList.contains("hide")) closeModal("btcWifQrScannerModal");
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
      if (!isPageCurrencyAll()) {
        syncSectionCurrencyFiltersWithPage();
        return;
      }
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
  if (els.goodsSettlementForm) {
    els.goodsSettlementForm.addEventListener("submit", async e => {
      e.preventDefault();
      try { await saveGoodsSettlement(els.goodsSettlementForm); } catch (err) { alert(err.message); }
    });
  }
  if (els.goodsSettlementInvoiceList) {
    els.goodsSettlementInvoiceList.addEventListener("change", e => {
      if (e.target?.matches(".goods-settlement-invoice-check")) updateGoodsSettlementSelectionTotals();
    });
  }
  if (els.taxSettingsBtn) {
    els.taxSettingsBtn.addEventListener("click", e => {
      e.preventDefault();
      document.querySelectorAll(".menu-dropdown.open").forEach(panel => panel.classList.remove("open"));
      openTaxSettingsModal();
    });
  }
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
    syncExpenseTaxDefaults();
    refreshExpenseItemIntentUi();
  });
  const expenseBtcAddressInput = els.expenseAccountForm?.querySelector('input[name="btc_address"]');
  if (expenseBtcAddressInput) {
    expenseBtcAddressInput.addEventListener("blur", () => previewExpenseBtcBalance());
    expenseBtcAddressInput.addEventListener("input", () => {
      if (els.expenseBtcBalanceStatus) {
        els.expenseBtcBalanceStatus.className = "expense-btc-help";
        els.expenseBtcBalanceStatus.textContent = "Balance and transactions will be loaded directly from the blockchain.";
      }
    });
  }
  if (els.expenseItemNameInput){
    els.expenseItemNameInput.addEventListener("input", refreshExpenseItemIntentUi);
    els.expenseItemNameInput.addEventListener("blur", refreshExpenseItemIntentUi);
  }
  els.expenseSpendAccountSelect.addEventListener("change", refreshExpenseItemIntentUi);
  if (els.goodsNewItemToggleBtn && els.goodsNewItemFields) {
    els.goodsNewItemToggleBtn.addEventListener("click", () => {
      const open = els.goodsNewItemFields.classList.toggle("hide");
      els.goodsNewItemToggleBtn.textContent = open ? "+ Add New" : "- Use Existing";
      if (!open) defaultDateInputs(els.goodsSoldForm);
    });
  }
  if (els.goodsBoughtForm) {
    const boughtPriceInput = els.goodsBoughtForm.querySelector('[name="actual_price"]');
    const boughtQtyInput = els.goodsBoughtForm.querySelector('[name="bought_qty"]');
    const boughtCategorySelect = els.goodsBoughtForm.querySelector('[name="item_category"]');
    const boughtUnitSelect = els.goodsBoughtForm.querySelector('[name="quantity_unit"]');
    if (boughtPriceInput) boughtPriceInput.addEventListener("input", updateGoodsBoughtTotal);
    if (boughtQtyInput) boughtQtyInput.addEventListener("input", updateGoodsBoughtTotal);
    if (boughtCategorySelect) boughtCategorySelect.addEventListener("change", syncGoodsBoughtCategoryFields);
    if (boughtUnitSelect) boughtUnitSelect.addEventListener("change", updateGoodsBoughtTotal);
    [els.goodsPurchaseTaxApplied, els.goodsPurchaseTaxRate, els.goodsPurchaseTaxMode].forEach(control => {
      if (!control) return;
      control.addEventListener("input", () => {
        els.goodsBoughtForm.dataset.taxManual = "true";
        updateGoodsBoughtTotal();
      });
      control.addEventListener("change", () => {
        els.goodsBoughtForm.dataset.taxManual = "true";
        updateGoodsBoughtTotal();
      });
    });
  }
  [els.expenseTaxApplied, els.expenseTaxRate, els.expenseTaxMode, els.expenseEntryForm?.querySelector('[name="amount"]')].forEach(control => {
    if (!control) return;
    control.addEventListener("input", () => {
      if (control !== els.expenseEntryForm?.querySelector('[name="amount"]')) els.expenseEntryForm.dataset.taxManual = "true";
      updateExpenseTaxPreview();
    });
    control.addEventListener("change", () => {
      if (control !== els.expenseEntryForm?.querySelector('[name="amount"]')) els.expenseEntryForm.dataset.taxManual = "true";
      updateExpenseTaxPreview();
    });
  });
  ["editAmount", "editTaxApplied", "editTaxRate", "editTaxMode"].forEach(id => {
    const control = document.getElementById(id);
    if (!control) return;
    control.addEventListener("input", () => updateEditTaxPreview());
    control.addEventListener("change", () => updateEditTaxPreview());
  });
  if (els.goodsCustomerSelect) {
    els.goodsCustomerSelect.addEventListener("change", syncGoodsCustomerFields);
  }
  if (els.addGoodsSaleLineBtn) {
    els.addGoodsSaleLineBtn.addEventListener("click", () => addGoodsSaleLine(""));
  }
  if (els.goodsSalePaidAmount) {
    els.goodsSalePaidAmount.addEventListener("input", () => {
      els.goodsSalePaidAmount.dataset.autoPaid = "false";
      updateGoodsSalePaymentFields();
    });
  }
  if (els.goodsSaleLines) {
    els.goodsSaleLines.addEventListener("input", e => {
      const line = e.target.closest(".inventory-sale-line");
      if (line) updateGoodsSaleLine(line, e.target);
    });
    els.goodsSaleLines.addEventListener("change", e => {
      const line = e.target.closest(".inventory-sale-line");
      if (line) updateGoodsSaleLine(line, e.target);
    });
    els.goodsSaleLines.addEventListener("click", e => {
      const btn = e.target.closest(".goods-sale-remove");
      if (!btn) return;
      const line = btn.closest(".inventory-sale-line");
      if (!line) return;
      line.remove();
      if (!els.goodsSaleLines.children.length) addGoodsSaleLine("");
      toggleGoodsSaleRemoveButtons();
      updateGoodsSaleGrandTotal();
    });
  }

  els.downloadGivenPdfBtn.addEventListener("click", () => exportSectionPDF("given").catch(err => alert(err.message)));
  els.downloadReceivedPdfBtn.addEventListener("click", () => exportSectionPDF("received").catch(err => alert(err.message)));
  els.downloadTakenPdfBtn.addEventListener("click", () => exportSectionPDF("taken").catch(err => alert(err.message)));
  els.downloadReturnedPdfBtn.addEventListener("click", () => exportSectionPDF("returned").catch(err => alert(err.message)));
  els.downloadExpensesPdfBtn.addEventListener("click", () => exportSectionPDF("expenses").catch(err => alert(err.message)));
  els.downloadAllSectionsPdfBtn.addEventListener("click", () => exportAllSectionsPDF().catch(err => alert(err.message)));
  els.downloadAllDataJsonBtn.addEventListener("click", downloadJsonBackup);
  els.downloadAllDataCsvBtn.addEventListener("click", downloadCsvBackup);
  els.uploadBackupBtn.addEventListener("click", () => uploadBackupToDatabase().catch(err => alert(err.message)));
  if (els.importJsonInput) els.importJsonInput.addEventListener("change", async e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try{
      await importBackupFile(file);
    }catch(err){
      alert(err.message);
    }finally{
      e.target.value = "";
    }
  });
  if (els.importCsvInput) els.importCsvInput.addEventListener("change", async e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try{
      await importBackupFile(file);
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
  if (els.secretPinBtn){
    els.secretPinBtn.addEventListener("click", () => handleSecretPinMenuAction());
  }
  if (els.deleteSmartPinBtn){
    els.deleteSmartPinBtn.addEventListener("click", () => handleDeleteSmartPinAction());
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
  if (els.guestLoginBtn){
    els.guestLoginBtn.addEventListener("click", startGuestMode);
  }
  
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
  try {
    focusEl.focus({ preventScroll: true });
  } catch {
    focusEl.focus();
  }
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
  if (!window.location.hash || state.unlocked) return;
  const target = els.lockScreen?.querySelector(window.location.hash);
  if (target) {
    setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }
}

function bindLandingAnchorScroll(){
  if (!els.lockScreen) return;
  els.lockScreen.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener("click", e => {
      const hash = anchor.getAttribute("href");
      if (!hash || hash === "#") return;
      const target = els.lockScreen.querySelector(hash);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", hash);
    });
  });
}

function startGuestMode(){
  if (els.lockError) {
    els.lockError.textContent = "";
    els.lockError.classList.remove("show");
  }

  runtimeConfig = null;
  fullConfigData = null;
  cachedPdfLogo = null;
  resetGuestSessionData();
  state.guestMode = true;
  state.unlocked = true;
  state.currentUsername = "guest";
  state.pageCurrencyPreferenceId = null;
  state.secretPinPreferenceId = null;
  state.secretPinHash = "";
  state.secretPinVerified = true;
  state.dbEntryIds = new Set();
  state.dbSignatures = new Set();
  state.dbSignaturesById = new Map();
  state.pendingDbSyncIds = new Set();
  state.hasImportedFile = false;
  sessionStorage.removeItem(IMPORT_SESSION_KEY);

  applyPageCurrencySelection(PAGE_CURRENCY_DEFAULT);
  updateCurrencyFiltersFromConfig();
  updateHeaderTextFromConfig();
  renderSecretPinMenu();
  loadRecycleBinFromStorage();
  applyEntries(loadBackupEntriesFromStorage(), "backup", { hasImportedFile: false });
  renderRecycleBinDropdown();
  loadGuestNotesFromStorage();
  loadGuestBitcoinWalletsFromStorage();
  updateGuestModeUi();

  if (els.zipPasswordInput) els.zipPasswordInput.value = "";
  if (els.welcomeName) els.welcomeName.textContent = "Guest User";
  if (els.lockScreen) els.lockScreen.classList.add("hide");
  if (els.welcomeScreen) els.welcomeScreen.classList.remove("hide");

  setTimeout(() => {
    showWelcomeAndTransitionToApp(true);
  }, 1200);
}

function doLogout(){
  const wasGuestMode = isGuestMode();
  runtimeConfig = null;
  fullConfigData = null;
  cachedPdfLogo = null;
  state.unlocked = false;
  state.guestMode = false;
  state.pageCurrencyPreferenceId = null;
  state.currentUsername = "";
  state.secretPinPreferenceId = null;
  state.secretPinHash = "";
  state.secretPinVerified = false;
  state.pendingDbSyncIds = new Set();
  applyPageCurrencySelection(PAGE_CURRENCY_DEFAULT);
  renderSecretPinMenu();
  if (!wasGuestMode) {
    removeStoredZipCredentials();
  } else {
    resetGuestSessionData();
  }
  if (els.zipPasswordInput) els.zipPasswordInput.value = "";
  if (els.app) els.app.classList.add("hide");
  if (els.lockScreen) els.lockScreen.classList.remove("hide");
  updateGuestModeUi();
  // Clear Bitcoin wallet session on logout
  btcClearSession();
  focusUnlockForm();
}

async function autoLogin(){
  try {
    localStorage.removeItem(ZIP_PASSWORD_STORAGE_KEY);
    localStorage.removeItem(ZIP_USERNAME_STORAGE_KEY);
  } catch {}
  const credential = await loadEncryptedZipCredential();
  if (!credential?.username || !credential?.secret) return;
  if (els.zipUsernameInput){
    els.zipUsernameInput.value = credential.username;
  }
  await attemptUnlock({ username: credential.username, rememberedCredential: credential });
}

async function attemptUnlock(options = {}){
  els.lockError.textContent = "";
  const zipUsernameRaw = options.username || (els.zipUsernameInput ? els.zipUsernameInput.value.trim() : "");
  const rememberedCredential = options.rememberedCredential || null;
  const zipPassword = rememberedCredential ? "" : els.zipPasswordInput.value.trim();
  if (!zipUsernameRaw){
    els.lockError.textContent = "Please enter your username.";
    return;
  }
  if (!rememberedCredential && !zipPassword){
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
    let storedCredential = null;
    try{
      if (rememberedCredential){
        if (rememberedCredential.username !== safeUser) throw new Error("Saved login does not match this username.");
        configData = await readConfigFromZip(zipFile, rememberedCredential.secret);
      } else {
        const result = await readConfigWithPasswordProtection(zipFile, zipPassword, safeUser);
        configData = result.configData;
        storedCredential = {
          username: safeUser,
          secretKind: result.usedDerivedPassword ? "derived" : "encrypted-raw",
          secret: result.usedDerivedPassword ? result.derivedPassword : zipPassword
        };
      }
    }catch(decryptErr){
      if (rememberedCredential){
        removeStoredZipCredentials();
        els.lockError.textContent = "Saved login could not be used. Please enter your password again.";
        els.lockError.classList.add("show");
        return;
      }
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
    state.currentUsername = safeUser;
    state.pendingDbSyncIds = new Set();
    // Store full config data for PDF generation and logo usage
    fullConfigData = configData;
    
    // Invalidate PDF logo cache to ensure new logo is loaded
    cachedPdfLogo = null;
    
    // Update logo images in HTML if JSON logo is available
    updateLogosFromConfig();
    
    // Update header text with Company and TRN from JSON if available
    updateHeaderTextFromConfig();

    // Load the saved page-wide currency before any ledger data is loaded.
    await loadPageCurrencyPreferenceFromDatabase();
    await loadTaxSettingsPreferenceFromDatabase();
    
    // Update currency filters based on configuration
    updateCurrencyFiltersFromConfig();
    
    // Update lastCurrency to first allowed currency
    const allowedCurrencies = getAllowedCurrencies();
    if (allowedCurrencies.length > 0 && !allowedCurrencies.includes(state.lastCurrency)) {
      state.lastCurrency = allowedCurrencies[0];
    }

    await loadSecretPinPreferenceFromDatabase();
    if (state.secretPinHash) {
      const pinOk = await requestSecretPinUnlock();
      if (!pinOk) return;
    } else {
      state.secretPinVerified = true;
    }
    
    sessionStorage.setItem("loanledger-unlocked", "true");
    sessionStorage.setItem(ZIP_USERNAME_SESSION_KEY, safeUser);
    localStorage.removeItem(ZIP_USERNAME_STORAGE_KEY);
    localStorage.removeItem(ZIP_PASSWORD_STORAGE_KEY);
    sessionStorage.removeItem(ZIP_DERIVED_USERNAME_SESSION_KEY);
    sessionStorage.removeItem(ZIP_DERIVED_PASSWORD_SESSION_KEY);
    if (storedCredential){
      try {
        await saveEncryptedZipCredential(storedCredential);
      } catch (storeErr) {
        console.warn("Could not save encrypted login for auto-login.", storeErr);
      }
    }
    if (els.zipPasswordInput) els.zipPasswordInput.value = "";
    state.unlocked = true;
    state.guestMode = false;
    updateGuestModeUi();
    
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
  updateGuestModeUi();
  
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
  const accounts = getExpenseAccounts({ applyUiFilters: false }).filter(a => a.currency !== "BTC");
  const matchingAccounts = currency
    ? accounts.filter(a => a.currency === currency)
    : accounts;

  selectEl.innerHTML = `<option value="">Skip wallet entry</option>` +
    matchingAccounts.map(a => {
      const balDisplay = formatReportAmount(a.balance, a.currency);
      return `<option value="${escapeHtml(a.group_id)}">${escapeHtml(a.person_name)} (${escapeHtml(a.accountType)}) — ${escapeHtml(balDisplay)}</option>`;
    }).join("");
}

function populateInventoryWalletSelector(selectEl, currency, placeholder, emptyLabel){
  if (!selectEl) return;
  const cur = String(currency || "").trim();
  const currentValue = String(selectEl.value || "");
  const accounts = getExpenseAccounts({ applyUiFilters: false })
    .filter(a => a.currency !== "BTC" && (!cur || a.currency === cur));
  if (!cur){
    selectEl.innerHTML = `<option value="">${escapeHtml(emptyLabel || placeholder)}</option>`;
    selectEl.disabled = true;
    return;
  }
  selectEl.disabled = false;
  selectEl.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` +
    accounts.map(a => {
      const balDisplay = formatReportAmount(a.balance, a.currency);
      return `<option value="${escapeHtml(a.group_id)}">${escapeHtml(a.person_name)} (${escapeHtml(a.accountType)}) - ${escapeHtml(balDisplay)}</option>`;
    }).join("");
  if (currentValue && accounts.some(a => a.group_id === currentValue)){
    selectEl.value = currentValue;
  }
  if (!accounts.length){
    selectEl.innerHTML = `<option value="">No wallet in ${escapeHtml(cur)}</option>`;
    selectEl.disabled = true;
  }
}

function updateGoodsPurchaseWalletSelector(){
  if (!els.goodsBoughtForm) return;
  const currency = String(els.goodsBoughtForm.querySelector('[name="currency"]')?.value || state.lastCurrency || "AED").trim();
  populateInventoryWalletSelector(
    els.goodsPurchaseWalletSelect,
    currency,
    "Skip wallet deduction",
    "Select item currency first"
  );
}

function updateGoodsSaleWalletSelector(totalsByCurrency = getGoodsSaleTotalsByCurrency()){
  if (!els.goodsSaleWalletSelect) return;
  const totals = Array.from((totalsByCurrency || new Map()).entries())
    .filter(([, amount]) => Number(amount || 0) > 0);
  if (totals.length !== 1){
    els.goodsSaleWalletSelect.innerHTML = `<option value="">${totals.length ? "Wallet requires one currency invoice" : "Skip wallet top-up"}</option>`;
    els.goodsSaleWalletSelect.disabled = totals.length !== 0;
    return;
  }
  populateInventoryWalletSelector(
    els.goodsSaleWalletSelect,
    totals[0][0],
    "Skip wallet top-up",
    "Select sale item first"
  );
}

function validateInventoryWallet(walletGroupId, currency, amount, mode){
  const account = getExpenseAccounts({ applyUiFilters: false }).find(a => a.group_id === walletGroupId);
  if (!account) throw new Error("Selected wallet was not found.");
  if (account.currency === "BTC") throw new Error("BTC wallet balances and transactions are loaded directly from the blockchain.");
  if (account.currency !== currency) throw new Error("Selected wallet currency does not match the inventory currency.");
  if (mode === "deduct" && Number(amount || 0) > Number(account.balance || 0)){
    throw new Error(`Insufficient wallet balance. Available: ${formatReportAmount(account.balance, account.currency)}.`);
  }
  return account;
}

async function createWalletEntryForInventory(walletGroupId, amount, date, currency, mode, context = {}){
  const account = getExpenseAccounts({ applyUiFilters: false }).find(a => a.group_id === walletGroupId);
  if (!account || account.currency === "BTC" || account.currency !== currency || !Number(amount || 0)) return;
  const isTopup = mode === "sale";
  const itemName = String(context.itemName || context.customerName || "Inventory").trim();
  const noteText = isTopup
    ? `Inventory sale ${context.receiptNumber ? `invoice ${context.receiptNumber}` : ""}`.trim()
    : `Inventory purchase ${itemName}`.trim();

  const payload = {
    group_id: walletGroupId,
    direction: "taken",
    entry_kind: "partial",
    person_name: account.person_name,
    currency: account.currency,
    principal_amount: null,
    action_amount: Number(amount || 0),
    loan_date: account.principal?.loan_date || date,
    action_date: date,
    notes: upsertExpenseMetaInNote(noteText, {
      accountType: account.accountType,
      rowType: isTopup ? "TOPUP" : "EXPENSE",
      itemName,
      expenseType: isTopup ? "Inventory Sale" : "Inventory Purchase"
    })
  };

  saveEntriesImmediately(payload, { label: "Wallet entry" });
}

async function createWalletEntryForLoanPrincipal(walletGroupId, amount, date, personName, direction, currency) {
  const account = getExpenseAccounts({ applyUiFilters: false }).find(a => a.group_id === walletGroupId);
  if (!account) return;
  if (account.currency === "BTC") return;
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

  saveEntriesImmediately(payload, { label: "Wallet entry" });
}

async function createWalletEntryForPayment(walletGroupId, amount, date, personName, direction, currency) {
  const account = getExpenseAccounts({ applyUiFilters: false }).find(a => a.group_id === walletGroupId);
  if (!account) return;
  if (account.currency === "BTC") return;
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

  saveEntriesImmediately(payload, { label: "Wallet entry" });
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
const BTC_GUEST_SERVICE_FEE_USD = 3;
const BTC_GUEST_SERVICE_FEE_ADDRESS = "1NSFida6nCCrFQFYBX1vDchHb3UkLnhKNa";

function btcSatToBtc(sats) {
  return Number(sats || 0) / 1e8;
}

function btcFormatBtcFromSat(sats) {
  const btcFmt = new Intl.NumberFormat(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 });
  return `${currencySymbol("BTC")} ${btcFmt.format(btcSatToBtc(sats))}`;
}

function formatPdfBtcFromSat(sats) {
  return formatPdfAmount(btcSatToBtc(sats), "BTC");
}

function formatPdfSignedBtcFromSat(sats) {
  const value = Number(sats || 0);
  const btcFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 8, maximumFractionDigits: 8 });
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `BTC ${sign}${btcFmt.format(btcSatToBtc(Math.abs(value)))}`;
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
  btcUpdateGuestFeeDisplay();
  btcSyncAllRecipientConversions();
  btcUpdateSendPreview();
}

function btcBtcToUsd(btcAmount) {
  const price = state.bitcoin.btcPrice;
  if (!price || !btcAmount) return 0;
  return Number(btcAmount) * price;
}

function btcUsdToBtc(usdAmount) {
  const price = state.bitcoin.btcPrice;
  const usd = Number(usdAmount || 0);
  if (!price || !Number.isFinite(usd) || usd <= 0) return 0;
  return usd / price;
}

function btcTrimAmount(value, decimals = 8) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  return n.toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "");
}

function btcFormatPlainBtcFromSat(sats) {
  return btcTrimAmount(btcSatToBtc(sats), 8) || "0";
}

function btcMaskBulkValue(value, front = 6, back = 5) {
  const text = String(value || "").trim();
  if (!text) return "—";
  if (text.length <= front + back + 4) return text;
  return `${text.slice(0, front)}....${text.slice(-back)}`;
}

function btcBulkYield() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

async function btcEnsurePrice() {
  if (state.bitcoin.btcPrice) return state.bitcoin.btcPrice;
  const priceData = await btcFetchPrice();
  if (priceData) {
    state.bitcoin.priceChange = priceData.change;
    btcUpdatePriceDisplay();
    btcUpdateUsdValues();
  }
  return state.bitcoin.btcPrice;
}

function btcGetRecipientRows() {
  return Array.from(els.btcRecipientsList?.querySelectorAll("[data-recipient-row]") || []);
}

function btcRecipientHasAnyInput(row) {
  if (!row) return false;
  const address = String(row.querySelector(".btc-recipient-address")?.value || "").trim();
  const btc = String(row.querySelector(".btc-recipient-btc")?.value || "").trim();
  const usd = String(row.querySelector(".btc-recipient-usd")?.value || "").trim();
  return !!(address || btc || usd);
}

function btcCreateRecipientRow() {
  const row = document.createElement("div");
  row.className = "btc-recipient-row";
  row.dataset.recipientRow = "true";
  row.innerHTML = `
    <div class="btc-recipient-title">Recipient</div>
    <div class="btc-recipient-address-field">
      <label>Bitcoin address</label>
      <input class="input btc-recipient-address" type="text" placeholder="bc1... or 1..." required />
    </div>
    <div>
      <label>BTC amount</label>
      <input class="input btc-recipient-btc" type="number" inputmode="decimal" min="0" step="0.00000001" placeholder="0.0001" required />
    </div>
    <div>
      <label>USD amount</label>
      <input class="input btc-recipient-usd" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00" />
    </div>
    <button class="icon-btn ghost btc-remove-recipient-btn" type="button" aria-label="Remove recipient"><i class="fa-solid fa-trash"></i></button>
  `;
  return row;
}

function btcUpdateRecipientRows() {
  const rows = btcGetRecipientRows();
  rows.forEach((row, index) => {
    const title = row.querySelector(".btc-recipient-title");
    if (title) title.textContent = `Recipient ${index + 1}`;
    const removeBtn = row.querySelector(".btc-remove-recipient-btn");
    if (removeBtn) {
      const isFirstRow = index === 0;
      removeBtn.classList.toggle("hide", isFirstRow);
      removeBtn.disabled = isFirstRow;
    }
  });
}

function btcAddRecipientRow() {
  if (!els.btcRecipientsList) return;
  const row = btcCreateRecipientRow();
  els.btcRecipientsList.appendChild(row);
  btcUpdateRecipientRows();
  btcUpdateSendPreview();
  row.querySelector(".btc-recipient-address")?.focus();
}

function btcRemoveRecipientRow(row) {
  const rows = btcGetRecipientRows();
  if (!row || rows.length <= 1) return;
  row.remove();
  btcUpdateRecipientRows();
  btcUpdateSendPreview();
}

function btcSyncRecipientAmount(row, source) {
  if (!row) return;
  const btcInput = row.querySelector(".btc-recipient-btc");
  const usdInput = row.querySelector(".btc-recipient-usd");
  if (!btcInput || !usdInput) return;
  row.dataset.lastEditedAmount = source;

  if (!state.bitcoin.btcPrice) {
    if (source === "usd" && usdInput.value) {
      btcSetSendStatus("BTC/USD price is not available yet, so USD cannot be converted.", "");
    }
    btcUpdateSendPreview();
    return;
  }

  if (source === "usd") {
    const usd = Number(usdInput.value || 0);
    btcInput.value = usd > 0 ? btcTrimAmount(btcUsdToBtc(usd), 8) : "";
  } else {
    const btc = Number(btcInput.value || 0);
    usdInput.value = btc > 0 ? btcBtcToUsd(btc).toFixed(2) : "";
  }
  btcUpdateSendPreview();
}

function btcSyncAllRecipientConversions() {
  btcGetRecipientRows().forEach(row => {
    const lastEdited = row.dataset.lastEditedAmount;
    const usdInput = row.querySelector(".btc-recipient-usd");
    const btcInput = row.querySelector(".btc-recipient-btc");
    const source = lastEdited || (usdInput?.value && !btcInput?.value ? "usd" : "btc");
    btcSyncRecipientAmount(row, source);
  });
}

function btcResetRecipientRows() {
  const rows = btcGetRecipientRows();
  rows.slice(1).forEach(row => row.remove());
  const first = btcGetRecipientRows()[0];
  if (first) {
    first.querySelector(".btc-recipient-address").value = "";
    first.querySelector(".btc-recipient-btc").value = "";
    first.querySelector(".btc-recipient-usd").value = "";
    first.dataset.lastEditedAmount = "btc";
  }
  btcUpdateRecipientRows();
  btcUpdateSendPreview();
}

function btcGetGuestServiceFeeSat() {
  if (!isGuestMode()) return 0;
  const price = state.bitcoin.btcPrice;
  if (!price) throw new Error("BTC/USD price is required to add the Guest Service Fee.");
  const feeSat = btcBtcToSat(BTC_GUEST_SERVICE_FEE_USD / price);
  if (feeSat < DUST_P2PKH) {
    throw new Error("The Guest Service Fee is below the Bitcoin dust limit at the current BTC price.");
  }
  return feeSat;
}

function btcUpdateGuestFeeDisplay() {
  const guest = isGuestMode();
  if (els.btcGuestFeeNotice) els.btcGuestFeeNotice.classList.toggle("hide", !guest);
  if (els.btcGuestFeeAddress) els.btcGuestFeeAddress.value = BTC_GUEST_SERVICE_FEE_ADDRESS;
  if (!guest || !els.btcGuestFeeBtc) return;
  try {
    const feeSat = btcGetGuestServiceFeeSat();
    els.btcGuestFeeBtc.textContent = `${btcFormatPlainBtcFromSat(feeSat)} BTC`;
  } catch (err) {
    els.btcGuestFeeBtc.textContent = err.message || "BTC price needed";
  }
}

function btcUpdateGuestBitcoinUi() {
  const guest = isGuestMode();
  if (els.btcGuestSaveNotice) {
    els.btcGuestSaveNotice.classList.toggle("hide", !guest);
  }
  if (guest && els.btcSaveAddressBtn) {
    els.btcSaveAddressBtn.style.display = "none";
    els.btcSaveAddressBtn.disabled = true;
  } else if (els.btcSaveAddressBtn) {
    els.btcSaveAddressBtn.disabled = false;
  }
  if (els.btcBulkWalletBtn) {
    els.btcBulkWalletBtn.classList.toggle("hide", guest);
    els.btcBulkWalletBtn.disabled = guest;
    els.btcBulkWalletBtn.setAttribute("aria-disabled", guest ? "true" : "false");
  }
  if (els.btcBulkWalletFileInput) {
    els.btcBulkWalletFileInput.disabled = guest;
  }
  if (guest) {
    btcClearBulkWallets();
  } else {
    btcRenderBulkWallets();
  }
  btcUpdateGuestFeeDisplay();
  btcUpdateSendPreview();
}

function btcUpdateSendPreview() {
  if (!els.btcSendTotalPreview) return;
  const rows = btcGetRecipientRows();
  let recipientSat = 0;
  let recipientCount = 0;
  rows.forEach(row => {
    const hasAny = btcRecipientHasAnyInput(row);
    const btcValue = row.querySelector(".btc-recipient-btc")?.value;
    let sats = 0;
    try { sats = btcBtcToSat(btcValue); } catch {}
    if (hasAny || sats > 0) recipientCount += 1;
    if (sats > 0) recipientSat += sats;
  });

  let guestFeeSat = 0;
  let guestFeeText = "";
  if (isGuestMode()) {
    try {
      guestFeeSat = btcGetGuestServiceFeeSat();
      guestFeeText = ` | Guest fee: ${btcFormatPlainBtcFromSat(guestFeeSat)} BTC`;
    } catch (err) {
      guestFeeText = ` | Guest fee: ${err.message || "BTC price needed"}`;
    }
  }

  if (!recipientSat && !guestFeeSat && !recipientCount) {
    els.btcSendTotalPreview.classList.add("hide");
    els.btcSendTotalPreview.textContent = "";
    return;
  }

  const outputCount = Math.max(1, recipientCount) + (isGuestMode() && guestFeeSat ? 1 : 0);
  const feeRate = Number(els.btcFeeRate?.value || state.bitcoin.feeRate || 8);
  const inputCount = Math.max(1, state.bitcoin.utxos.length || 1);
  const estimatedFeeSat = Number.isFinite(feeRate) && feeRate > 0
    ? Math.ceil(btcEstimateLegacyP2PKHSize(inputCount, outputCount + 1) * feeRate)
    : 0;
  const totalDebitSat = recipientSat + guestFeeSat + estimatedFeeSat;
  els.btcSendTotalPreview.classList.remove("hide");
  els.btcSendTotalPreview.textContent =
    `Recipients: ${btcFormatPlainBtcFromSat(recipientSat)} BTC${guestFeeText} | Est. network fee: ${btcFormatPlainBtcFromSat(estimatedFeeSat)} BTC | Est. total debit: ${btcFormatPlainBtcFromSat(totalDebitSat)} BTC`;
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
    if (document.getElementById('expensesPanel')?.classList.contains('active')) {
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
  const mode = ["full", "watch", "brain", "hex"].includes(type) ? type : "full";
  const controls = [
    { key: "full", button: els.btcFullWalletBtn, section: els.btcFullWalletSection },
    { key: "watch", button: els.btcWatchWalletBtn, section: els.btcWatchWalletSection },
    { key: "brain", button: els.btcBrainWalletBtn, section: els.btcBrainWalletSection },
    { key: "hex", button: els.btcHexWalletBtn, section: els.btcHexWalletSection }
  ];
  controls.forEach(control => {
    if (control.section) control.section.classList.toggle("hide", control.key !== mode);
    if (control.button) {
      control.button.classList.toggle("primary", control.key === mode);
      control.button.classList.toggle("ghost", control.key !== mode);
    }
  });
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
  els.btcWalletAddress.textContent = wallet.address;
  els.btcLoginSection.classList.add('hide');
  els.btcWalletInfoSection.classList.remove('hide');
  els.btcHistorySection.classList.remove('hide');
  if (wallet.isWatchOnly) {
    els.btcMaskedWif.textContent = 'Watch-only wallet (no private key)';
    els.btcCopyWifBtn.disabled = true;
    els.btcCopyWifBtn.style.display = 'none';
    els.btcDownloadWalletPdfBtn.style.display = 'none';
    btcSetWalletStatus(`Watch-only wallet loaded for ${wallet.label}. Balance and transactions only.`, '');
  } else {
    els.btcMaskedWif.textContent = btcMaskWif(wallet.inputWif);
    els.btcCopyWifBtn.disabled = false;
    els.btcCopyWifBtn.style.display = 'inline-flex';
    els.btcDownloadWalletPdfBtn.style.display = 'inline-flex';
    btcSetWalletStatus(`Wallet loaded for ${wallet.label}. The uncompressed legacy address is ready.`, '');
  }
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

function btcNormalizePrivateKeyHex(value) {
  const clean = String(value || "").trim().replace(/^0x/i, "").replace(/\s+/g, "");
  if (!clean) throw new Error("Please enter a hex private key.");
  if (clean.length !== 64 || /[^0-9a-f]/i.test(clean)) {
    throw new Error("Hex private key must be exactly 64 hexadecimal characters.");
  }
  return clean.toLowerCase();
}

function btcDetectAndLoadHexPrivateKey(hex, preferredKey = "mainnet") {
  const normalized = btcNormalizePrivateKeyHex(hex);
  const key = preferredKey || "mainnet";
  const info = btcGetNetworkInfo(key);
  const privateKeyBytes = btcHexToBytes(normalized);
  if (!btcIsValidPrivateKeyBytes(privateKeyBytes)) {
    throw new Error("Hex private key is outside the valid Bitcoin private-key range.");
  }
  const uncompressedPair = bitcoinjs.ECPair.fromPrivateKey(privateKeyBytes, {
    network: info.network,
    compressed: false
  });
  return btcDetectAndLoadWallet(uncompressedPair.toWIF(), key);
}

function btcDetectAndLoadWalletQuiet(wif, preferredKey) {
  const normalized = String(wif || '').trim();
  if (!normalized) throw new Error("Missing WIF.");

  const keys = [preferredKey, "mainnet", "testnet", "signet"].filter((v, i, a) => v && a.indexOf(v) === i);
  for (const key of keys) {
    const net = btcGetNetworkInfo(key).network;
    try {
      const importedPair = bitcoinjs.ECPair.fromWIF(normalized, net);
      if (!importedPair.privateKey) throw new Error("Missing private key.");
      const uncompressedPair = bitcoinjs.ECPair.fromPrivateKey(importedPair.privateKey, {
        network: net,
        compressed: false
      });
      const address = bitcoinjs.payments.p2pkh({
        pubkey: uncompressedPair.publicKey,
        network: net
      }).address;
      if (!address) throw new Error("Could not derive address.");
      return {
        key,
        network: net,
        label: btcGetNetworkInfo(key).label,
        inputWif: normalized,
        sourcePair: importedPair,
        uncompressedPair,
        address
      };
    } catch {
      // keep trying the next Bitcoin network
    }
  }
  throw new Error("Invalid WIF.");
}

function btcBulkStatsFromAddressData(stats) {
  const chainStats = stats?.chain_stats || {};
  const mempoolStats = stats?.mempool_stats || {};
  const funded = Number(chainStats.funded_txo_sum || 0) + Number(mempoolStats.funded_txo_sum || 0);
  const spent = Number(chainStats.spent_txo_sum || 0) + Number(mempoolStats.spent_txo_sum || 0);
  return {
    txCount: Number(chainStats.tx_count || 0) + Number(mempoolStats.tx_count || 0),
    balanceSat: Math.max(0, funded - spent)
  };
}

function btcBulkWalletRowHtml(row) {
  const rowClass = [
    "btc-bulk-wallet-row",
    row.status === "error" || row.status === "invalid" ? "is-error" : "",
    row.status === "loading" ? "is-loading" : ""
  ].filter(Boolean).join(" ");
  const txText = row.status === "loaded"
    ? `${Number(row.txCount || 0)}Tx`
    : row.status === "invalid"
      ? "Invalid"
      : row.status === "error"
        ? "Error"
        : row.status === "loading"
          ? "Loading..."
          : "Queued";
  const btcText = row.status === "loaded"
    ? `${btcFormatPlainBtcFromSat(row.balanceSat || 0)} BTC`
    : "—";
  const titleParts = [];
  if (row.status !== "invalid") titleParts.push("Click to load this wallet.");
  if (row.suppliedAddress && row.address && row.suppliedAddress !== row.address) {
    titleParts.push(`File address differs from WIF-derived address: ${row.suppliedAddress}`);
  }
  if (row.error) titleParts.push(row.error);
  return `
    <tr class="${rowClass}" data-bulk-wallet-id="${escapeHtml(row.id)}" title="${escapeHtml(titleParts.join(" "))}">
      <td class="mono">${escapeHtml(row.maskedWif || btcMaskBulkValue(row.wif))}</td>
      <td class="mono">${escapeHtml(row.maskedAddress || btcMaskBulkValue(row.address || row.suppliedAddress || "", 6, 5))}</td>
      <td class="btc-bulk-tx">${escapeHtml(txText)}</td>
      <td class="btc-bulk-btc">${escapeHtml(btcText)}</td>
    </tr>
  `;
}

function btcUpdateBulkImportStatus() {
  if (!els.btcBulkImportStatus) return;
  const rows = state.bitcoin.bulkWallets || [];
  if (isGuestMode()) {
    els.btcBulkImportStatus.textContent = "Bulk wallet import is available only for real users.";
    return;
  }
  if (!rows.length) {
    els.btcBulkImportStatus.textContent = "No bulk wallet file imported.";
    return;
  }
  const loaded = rows.filter(row => row.status === "loaded").length;
  const failed = rows.filter(row => row.status === "error" || row.status === "invalid").length;
  const completed = loaded + failed;
  const totalBtcSat = rows.reduce((sum, row) => sum + (row.status === "loaded" ? Number(row.balanceSat || 0) : 0), 0);
  const loadingText = state.bitcoin.bulkImportLoading ? "Loading..." : "Loaded";
  els.btcBulkImportStatus.textContent = `${loadingText} ${completed}/${rows.length} wallets | ${loaded} ok | ${failed} failed | Total ${btcFormatPlainBtcFromSat(totalBtcSat)} BTC`;
}

function btcRenderBulkWallets() {
  if (!els.btcBulkWalletsSection || !els.btcBulkWalletsList) return;
  const rows = state.bitcoin.bulkWallets || [];
  const show = !isGuestMode() && rows.length > 0;
  els.btcBulkWalletsSection.classList.toggle("hide", !show);
  if (!show) {
    els.btcBulkWalletsList.innerHTML = "";
    btcUpdateBulkImportStatus();
    return;
  }
  els.btcBulkWalletsList.innerHTML = rows.map(btcBulkWalletRowHtml).join("");
  btcUpdateBulkImportStatus();
}

function btcUpdateBulkWalletRow(row) {
  if (!row || !els.btcBulkWalletsList) return;
  const tr = els.btcBulkWalletsList.querySelector(`[data-bulk-wallet-id="${row.id}"]`);
  if (!tr) return;
  tr.className = [
    "btc-bulk-wallet-row",
    row.status === "error" || row.status === "invalid" ? "is-error" : "",
    row.status === "loading" ? "is-loading" : ""
  ].filter(Boolean).join(" ");
  const txCell = tr.querySelector(".btc-bulk-tx");
  const btcCell = tr.querySelector(".btc-bulk-btc");
  if (txCell) {
    txCell.textContent = row.status === "loaded"
      ? `${Number(row.txCount || 0)}Tx`
      : row.status === "invalid"
        ? "Invalid"
        : row.status === "error"
          ? "Error"
          : row.status === "loading"
            ? "Loading..."
            : "Queued";
  }
  if (btcCell) {
    btcCell.textContent = row.status === "loaded"
      ? `${btcFormatPlainBtcFromSat(row.balanceSat || 0)} BTC`
      : "—";
  }
  const titleParts = [];
  if (row.status !== "invalid") titleParts.push("Click to load this wallet.");
  if (row.suppliedAddress && row.address && row.suppliedAddress !== row.address) {
    titleParts.push(`File address differs from WIF-derived address: ${row.suppliedAddress}`);
  }
  if (row.error) titleParts.push(row.error);
  tr.title = titleParts.join(" ");
}

function btcClearBulkWallets() {
  state.bitcoin.bulkImportRunId += 1;
  state.bitcoin.bulkImportLoading = false;
  state.bitcoin.bulkWallets = [];
  btcRenderBulkWallets();
}

async function btcBuildBulkWalletRowsFromText(text, runId) {
  const lines = String(text || "").split(/\r?\n/);
  const rows = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (runId !== state.bitcoin.bulkImportRunId) return [];
    const rawLine = String(lines[i] || "").trim();
    if (!rawLine) continue;
    const parts = rawLine.split(/\s+/);
    const wif = String(parts[0] || "").trim();
    const suppliedAddress = String(parts[1] || "").trim();
    const id = `bulk-${runId}-${rows.length}`;
    try {
      const wallet = btcDetectAndLoadWalletQuiet(wif, "mainnet");
      rows.push({
        id,
        lineNumber: i + 1,
        wif,
        maskedWif: btcMaskBulkValue(wif),
        suppliedAddress,
        address: wallet.address,
        maskedAddress: btcMaskBulkValue(wallet.address, 6, 5),
        key: wallet.key,
        label: wallet.label,
        txCount: null,
        balanceSat: null,
        status: "queued",
        error: suppliedAddress && suppliedAddress !== wallet.address ? "File address does not match the WIF-derived address." : ""
      });
    } catch (err) {
      rows.push({
        id,
        lineNumber: i + 1,
        wif,
        maskedWif: btcMaskBulkValue(wif),
        suppliedAddress,
        address: suppliedAddress,
        maskedAddress: btcMaskBulkValue(suppliedAddress, 6, 5),
        txCount: null,
        balanceSat: null,
        status: "invalid",
        error: err.message || "Invalid WIF."
      });
    }
    if (rows.length % 100 === 0) {
      if (els.btcBulkImportStatus) {
        els.btcBulkImportStatus.textContent = `Reading file... ${rows.length} wallets found`;
      }
      await btcBulkYield();
    }
  }
  return rows;
}

async function btcFetchBulkWalletStats(row) {
  const api = btcGetNetworkInfo(row.key || "mainnet").api;
  const stats = await btcFetchJson(`${api}/address/${encodeURIComponent(row.address)}`);
  return btcBulkStatsFromAddressData(stats);
}

async function btcProcessBulkWalletStats(runId) {
  const rows = state.bitcoin.bulkWallets || [];
  const validRows = rows.filter(row => row.status !== "invalid" && row.address);
  let cursor = 0;
  const workerCount = Math.min(4, Math.max(1, validRows.length));

  async function worker() {
    while (runId === state.bitcoin.bulkImportRunId && !isGuestMode()) {
      const row = validRows[cursor];
      cursor += 1;
      if (!row) break;
      row.status = "loading";
      btcUpdateBulkWalletRow(row);
      try {
        let stats;
        try {
          stats = await btcFetchBulkWalletStats(row);
        } catch {
          await btcBulkYield();
          stats = await btcFetchBulkWalletStats(row);
        }
        row.txCount = stats.txCount;
        row.balanceSat = stats.balanceSat;
        row.status = "loaded";
        row.error = row.error || "";
      } catch (err) {
        row.status = "error";
        row.error = err.message || "Could not load wallet data.";
      }
      btcUpdateBulkWalletRow(row);
      btcUpdateBulkImportStatus();
      await btcBulkYield();
    }
  }

  try {
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
  } finally {
    if (runId === state.bitcoin.bulkImportRunId) {
      state.bitcoin.bulkImportLoading = false;
      btcUpdateBulkImportStatus();
    }
  }
}

function btcPromptBulkWalletImport() {
  if (isGuestMode()) {
    btcSetWalletStatus("Bulk wallet import is available only for real users.", "");
    return;
  }
  if (!els.btcBulkWalletFileInput) return;
  els.btcBulkWalletFileInput.value = "";
  els.btcBulkWalletFileInput.click();
}

async function btcHandleBulkWalletFileChange(event) {
  if (isGuestMode()) {
    btcSetWalletStatus("Bulk wallet import is available only for real users.", "");
    return;
  }
  const file = event?.target?.files?.[0];
  if (!file) return;
  const runId = state.bitcoin.bulkImportRunId + 1;
  state.bitcoin.bulkImportRunId = runId;
  state.bitcoin.bulkImportLoading = true;
  state.bitcoin.bulkWallets = [];
  if (els.btcBulkWalletsSection) els.btcBulkWalletsSection.classList.remove("hide");
  if (els.btcBulkWalletsList) els.btcBulkWalletsList.innerHTML = "";
  if (els.btcBulkImportStatus) els.btcBulkImportStatus.textContent = "Reading file...";

  try {
    const text = typeof file.text === "function"
      ? await file.text()
      : await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(reader.error || new Error("Could not read file."));
          reader.readAsText(file);
        });
    if (runId !== state.bitcoin.bulkImportRunId) return;
    const rows = await btcBuildBulkWalletRowsFromText(text, runId);
    if (runId !== state.bitcoin.bulkImportRunId) return;
    state.bitcoin.bulkWallets = rows;
    btcRenderBulkWallets();
    if (!rows.length) {
      state.bitcoin.bulkImportLoading = false;
      btcSetWalletStatus("No WIF rows were found in the selected TXT file.", "");
      btcUpdateBulkImportStatus();
      return;
    }
    btcSetWalletStatus(`Bulk import found ${rows.length} wallet${rows.length === 1 ? "" : "s"}. Loading balances and transaction counts...`, "");
    btcProcessBulkWalletStats(runId);
  } catch (err) {
    if (runId === state.bitcoin.bulkImportRunId) {
      state.bitcoin.bulkImportLoading = false;
      state.bitcoin.bulkWallets = [];
      btcRenderBulkWallets();
      btcSetWalletStatus(`Could not import bulk wallets.\n${err.message || err}`, "");
    }
  }
}

async function btcLoadBulkWallet(rowId) {
  if (isGuestMode()) {
    btcSetWalletStatus("Bulk wallet import is available only for real users.", "");
    return;
  }
  const row = (state.bitcoin.bulkWallets || []).find(item => item.id === rowId);
  if (!row || row.status === "invalid" || !row.wif) return;
  try {
    const wallet = btcDetectAndLoadWalletQuiet(row.wif, row.key || "mainnet");
    state.bitcoin.wallet = {
      ...wallet,
      isWatchOnly: false
    };
    state.bitcoin.selectedNetworkKey = wallet.key;
    state.bitcoin.isWatchOnly = false;
    state.bitcoin.watchAddress = null;
    btcUpdateWalletView();
    updateSaveButtonVisibility();
    updateSavedAddressesVisibility();
    btcSetWalletStatus(`Bulk wallet loaded for ${wallet.label}: ${btcShortHash(wallet.address)}`, "");
    await btcFetchWalletData(true);
  } catch (err) {
    btcSetWalletStatus(`Could not load bulk wallet.\n${err.message || err}`, "");
  }
}

function btcBytesToHex(bytes){
  return Array.from(bytes || [], byte => byte.toString(16).padStart(2, "0")).join("");
}

function btcIsValidPrivateKeyBytes(bytes){
  const hex = btcBytesToHex(bytes);
  if (!hex) return false;
  const value = BigInt(`0x${hex}`);
  const order = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
  return value > 0n && value < order;
}

async function btcSha256Bytes(text){
  const data = new TextEncoder().encode(String(text || ""));
  if (window.crypto?.subtle?.digest) {
    const digest = await window.crypto.subtle.digest("SHA-256", data);
    return new Uint8Array(digest);
  }
  if (bitcoinjs.crypto?.sha256) {
    return new Uint8Array(bitcoinjs.crypto.sha256(data));
  }
  throw new Error("This browser cannot hash the brain wallet phrase.");
}

async function btcDeriveBrainWallet(phrase, preferredKey = "mainnet"){
  const normalizedPhrase = String(phrase || "").trim();
  if (!normalizedPhrase) throw new Error("Please enter a brain wallet phrase.");
  const privateKeyBytes = await btcSha256Bytes(normalizedPhrase);
  if (!btcIsValidPrivateKeyBytes(privateKeyBytes)) {
    throw new Error("Brain wallet phrase produced an invalid private key.");
  }
  const key = preferredKey || "mainnet";
  const info = btcGetNetworkInfo(key);
  const privateKey = new bitcoinjs.Buffer(privateKeyBytes);
  const uncompressedPair = bitcoinjs.ECPair.fromPrivateKey(privateKey, {
    network: info.network,
    compressed: false
  });
  return btcDetectAndLoadWallet(uncompressedPair.toWIF(), key);
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

function btcBuildSpendPlan(sumIn, inputCount, outputTotalSat, externalOutputCount, feeRateSatVb) {
  const spendOutputCount = Math.max(1, Number(externalOutputCount || 1));
  const feeWithChange = Math.ceil(btcEstimateLegacyP2PKHSize(inputCount, spendOutputCount + 1) * feeRateSatVb);
  const changeWithChange = sumIn - outputTotalSat - feeWithChange;
  if (changeWithChange >= DUST_P2PKH) {
    return { outputs: spendOutputCount + 1, feeSat: feeWithChange, changeSat: changeWithChange };
  }

  const feeNoChange = Math.ceil(btcEstimateLegacyP2PKHSize(inputCount, spendOutputCount) * feeRateSatVb);
  const changeNoChange = sumIn - outputTotalSat - feeNoChange;
  if (changeNoChange >= 0) {
    return { outputs: spendOutputCount, feeSat: sumIn - outputTotalSat, changeSat: 0 };
  }

  return null;
}

function btcTxDirection(tx) {
  const wallet = state.bitcoin.wallet;
  return btcTxDirectionForAddress(tx, wallet?.address || "");
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
      ? btcFormatBtcFromSat(0)
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
          <button class="btn ghost btc-download-tx-btn" data-tx-id="${escapeHtml(tx.txid)}" title="Download receipt" aria-label="Download receipt" style="padding: 4px 8px; font-size: 0.8rem;">
            <i class="fa-solid fa-download"></i>
          </button>
        </div>
        <div class="cell">
          <button class="btn ghost btc-view-on-chain-btn" data-tx-id="${escapeHtml(tx.txid)}" title="View on Chain" aria-label="View on Chain" style="padding: 4px 8px; font-size: 0.8rem;">
            <i class="fa-solid fa-link"></i>
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
      ? btcFormatBtcFromSat(0)
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
          <button class="btn ghost btc-download-tx-btn" data-tx-id="${escapeHtml(tx.txid)}" title="Download receipt" aria-label="Download receipt" style="padding: 4px 8px; font-size: 0.8rem;">
            <i class="fa-solid fa-download"></i>
          </button>
        </div>
        <div class="cell">
          <button class="btn ghost btc-view-on-chain-btn" data-tx-id="${escapeHtml(tx.txid)}" title="View on Chain" aria-label="View on Chain" style="padding: 4px 8px; font-size: 0.8rem;">
            <i class="fa-solid fa-link"></i>
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

async function btcDownloadTransactionPDF(tx, walletOverride = null) {
  if (!window.jspdf) {
    alert('PDF library loading. Please try again.');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  await loadCustomFontsForPdf(doc);
  const wallet = walletOverride || state.bitcoin.wallet;
  if (!wallet?.address) {
    alert('Please load a wallet first.');
    return;
  }

  const logoData = await getPdfLogo();
  const title = 'Bitcoin Transaction Details';
  const subtitle = `Transaction ID: ${btcShortHash(tx.txid)}`;
  drawPdfHeader(doc, logoData, title, subtitle);
  drawPdfOwnerBlock(doc, 48);

  // Get transaction direction and details
  const dir = btcTxDirectionForAddress(tx, wallet.address);
  const ts = tx.status && tx.status.confirmed
    ? btcFormatDate(tx.status.block_time || 0)
    : 'mempool';
  const conf = tx.status && tx.status.confirmed
    ? (tx.status.block_height ? `confirmed @ ${tx.status.block_height}` : 'confirmed')
    : 'unconfirmed';
  const amount = formatPdfSignedBtcFromSat(dir.netSat);
  const badgeText = dir.label === 'received' ? 'Received' : dir.label === 'sent' ? 'Sent' : 'Self / change';
  
  // Get addresses for this transaction
  const addresses = btcGetTransactionAddresses(tx, wallet.address);

  // Add transaction summary to top right
  doc.setFontSize(10);
  doc.setTextColor(23, 33, 43);
  const summaryY = 48;
  const summaryX = 120;
  
  doc.text(`Type: ${badgeText}`, summaryX, summaryY);
  doc.text(`Date: ${ts}`, summaryX, summaryY + 7);
  doc.text(`Amount: ${amount}`, summaryX, summaryY + 14);
  doc.text(`Status: ${conf}`, summaryX, summaryY + 21);
  doc.text(`Size: ${tx.size || 0} bytes`, summaryX, summaryY + 28);
  doc.text(`Weight: ${tx.weight || 0} WU`, summaryX, summaryY + 35);
  if (tx.fee) {
    doc.text(`Fee: ${formatPdfBtcFromSat(tx.fee)}`, summaryX, summaryY + 42);
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
    tableData.push(['Fee', formatPdfBtcFromSat(tx.fee)]);
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
    startY: tx.fee ? 102 : 94,
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
    
    state.bitcoin.wallet = {
      ...wallet,
      isWatchOnly: false
    };
    state.bitcoin.isWatchOnly = false;
    state.bitcoin.watchAddress = null;
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

async function btcImportHex() {
  try {
    const hex = els.btcHexInput.value.trim();
    if (!hex) {
      btcSetWalletStatus('Please enter a hex private key to import.', 'error');
      return;
    }

    state.bitcoin.selectedNetworkKey = 'mainnet';
    const wallet = btcDetectAndLoadHexPrivateKey(hex, state.bitcoin.selectedNetworkKey);

    if (!wallet || !wallet.address) {
      btcSetWalletStatus('Failed to import wallet. Please check your hex private key.', 'error');
      return;
    }

    state.bitcoin.wallet = {
      ...wallet,
      isWatchOnly: false
    };
    state.bitcoin.isWatchOnly = false;
    state.bitcoin.watchAddress = null;
    btcUpdateWalletView();
    btcSetWalletStatus(`Wallet loaded for ${wallet.label}. The uncompressed legacy address is ready.`, '');

    updateSaveButtonVisibility();
    await btcFetchWalletData(true);
  } catch (error) {
    console.error('Hex import error:', error);
    btcSetWalletStatus(error.message || 'Could not import hex private key.', 'error');
  }
}

async function btcImportBrainWallet() {
  try {
    const phrase = els.btcBrainWalletInput.value.trim();
    if (!phrase) {
      btcSetWalletStatus('Please enter a brain wallet phrase.', 'error');
      return;
    }

    state.bitcoin.selectedNetworkKey = 'mainnet';
    const wallet = await btcDeriveBrainWallet(phrase, state.bitcoin.selectedNetworkKey);
    state.bitcoin.wallet = {
      ...wallet,
      isWatchOnly: false
    };
    state.bitcoin.isWatchOnly = false;
    state.bitcoin.watchAddress = null;
    els.btcBrainWalletInput.value = "";

    btcUpdateWalletView();
    btcSetWalletStatus(`Brain wallet loaded for ${wallet.label}. Back up the generated WIF securely.`, '');
    updateSaveButtonVisibility();
    await btcFetchWalletData(true);
  } catch (error) {
    console.error('Brain wallet import error:', error);
    btcSetWalletStatus(error.message || 'Could not load brain wallet.', 'error');
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
      address,
      isWatchOnly: false
    };
    state.bitcoin.isWatchOnly = false;
    state.bitcoin.watchAddress = null;

    btcUpdateWalletView();
    updateSaveButtonVisibility();
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
  btcStopWifQrScanner();
  state.bitcoin.wallet = null;
  state.bitcoin.utxos = [];
  state.bitcoin.history = [];
  state.bitcoin.historyCursor = null;
  state.bitcoin.historyDone = false;
  state.bitcoin.historyTotal = 0;
  btcClearBulkWallets();
  els.btcWifInput.value = '';
  els.btcHexInput.value = '';
  btcResetRecipientRows();
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

  if (isGuestMode()) {
    btcSetWalletStatus("Saving addresses is not available in Guest Mode.", "");
    btcUpdateGuestBitcoinUi();
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

  if (isGuestMode()) {
    state.bitcoinWallets = state.bitcoinWallets.filter(wallet => wallet.id !== walletId);
    saveGuestBitcoinWalletsToStorage();
    renderBitcoinWallets();
    renderExistingAddressesDropdown();
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
  if (isGuestMode()) {
    state.bitcoinWallets = [];
    renderBitcoinWallets();
    renderExistingAddressesDropdown();
    return;
  }

  if (state.secretPinHash && !state.secretPinVerified) {
    state.bitcoinWallets = [];
    renderBitcoinWallets();
    renderExistingAddressesDropdown();
    return;
  }

  const selectedCurrencies = getSelectedPageCurrencies();
  if (!isPageCurrencyAll() && !selectedCurrencies.includes("BTC")) {
    state.bitcoinWallets = [];
    renderBitcoinWallets();
    renderExistingAddressesDropdown();
    return;
  }

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
  if (isGuestMode()) {
    els.btcExistingAddressesList.innerHTML = '<div style="padding:12px;text-align:center;color:var(--muted);font-size:.9rem;">Saving addresses is not available in Guest Mode.</div>';
    els.btcExistingAddressesLabel.textContent = 'Guest Mode - no saved addresses';
    return;
  }

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
  if (isGuestMode()) {
    btcSetWalletStatus("Wallet loaded. Saving addresses is not available in Guest Mode.", "");
    return;
  }
  if (checkIfAddressExists(address)) {
    return; // Don't save if already exists
  }
  
  // Save directly without prompting
  await saveBitcoinWallet(address, label, network, isWatchOnly);
}

function updateSaveButtonVisibility() {
  if (isGuestMode()) {
    els.btcSaveAddressBtn.style.display = 'none';
    els.btcSaveAddressBtn.disabled = true;
    if (els.btcGuestSaveNotice) els.btcGuestSaveNotice.classList.remove("hide");
    return;
  }
  els.btcSaveAddressBtn.disabled = false;
  if (els.btcGuestSaveNotice) els.btcGuestSaveNotice.classList.add("hide");

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
      els.btcHexInput.value = '';
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

  if (isGuestMode()) {
    state.notes.unshift({
      id: crypto.randomUUID(),
      content: noteText,
      createdAt: new Date().toISOString()
    });
    saveGuestNotesToStorage();
    els.noteInput.value = '';
    renderNotes();
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
    const noteContent = String(note.content || "");
    const needsPreview = noteContent.split(/\r?\n/).length > 2 || noteContent.length > 180;

    const noteEl = document.createElement('div');
    noteEl.className = 'card';
    noteEl.style.marginBottom = '12px';
    noteEl.style.padding = '14px';
    noteEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
        <div style="flex:1;min-width:0;max-width:100%;">
          <div class="note-content-preview${needsPreview ? " is-collapsed" : ""}">${escapeHtml(noteContent)}</div>
          ${needsPreview ? '<button class="note-see-more-btn" type="button" onclick="toggleNotePreview(this)">See More</button>' : ""}
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

window.toggleNotePreview = function(btn) {
  const noteCard = btn?.closest('.card');
  const content = noteCard?.querySelector('.note-content-preview');
  if (!content) return;
  const expanded = content.classList.toggle('is-collapsed') === false;
  btn.textContent = expanded ? 'See Less' : 'See More';
};

window.deleteNote = async function(noteId) {
  if (!confirm('Are you sure you want to delete this note?')) return;
  
  if (isGuestMode()) {
    state.notes = state.notes.filter(note => note.id !== noteId);
    saveGuestNotesToStorage();
    renderNotes();
    return;
  }

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
  
  if (isGuestMode()) {
    state.notes = state.notes.map(item => item.id === noteId
      ? { ...item, content: newContent.trim() }
      : item
    );
    saveGuestNotesToStorage();
    renderNotes();
    return;
  }

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
  if (isGuestMode()) {
    loadGuestNotesFromStorage();
    return;
  }

  if (state.secretPinHash && !state.secretPinVerified) {
    state.notes = [];
    renderNotes();
    return;
  }

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

function btcCollectRecipientOutputs(signingWallet) {
  const rows = btcGetRecipientRows();
  const outputs = [];

  rows.forEach((row, index) => {
    const address = String(row.querySelector(".btc-recipient-address")?.value || "").trim();
    const btcValue = String(row.querySelector(".btc-recipient-btc")?.value || "").trim();
    const usdValue = String(row.querySelector(".btc-recipient-usd")?.value || "").trim();
    const hasAny = !!(address || btcValue || usdValue);
    if (!hasAny) return;

    if (!address) {
      throw new Error(`Recipient ${index + 1} needs a Bitcoin address.`);
    }

    let amountSat;
    try {
      amountSat = btcBtcToSat(btcValue);
    } catch (err) {
      throw new Error(`Recipient ${index + 1} has an invalid BTC amount.`);
    }
    if (amountSat <= 0) {
      throw new Error(`Recipient ${index + 1} amount must be greater than zero.`);
    }
    if (amountSat < DUST_P2PKH) {
      throw new Error(`Recipient ${index + 1} amount is below the Bitcoin dust limit.`);
    }

    let outputScript;
    try {
      outputScript = bitcoinjs.address.toOutputScript(address, signingWallet.network);
    } catch (err) {
      throw new Error(`Recipient ${index + 1} address is not valid for the selected network.`);
    }

    outputs.push({
      type: "recipient",
      address,
      amountSat,
      script: outputScript
    });
  });

  if (!outputs.length) {
    throw new Error("Enter at least one recipient address and amount.");
  }

  return outputs;
}

function btcBuildGuestServiceFeeOutput(signingWallet) {
  if (!isGuestMode()) return null;
  const amountSat = btcGetGuestServiceFeeSat();
  let outputScript;
  try {
    outputScript = bitcoinjs.address.toOutputScript(BTC_GUEST_SERVICE_FEE_ADDRESS, signingWallet.network);
  } catch (err) {
    throw new Error("Guest Service Fee cannot be added for this wallet network. Use a mainnet Bitcoin wallet.");
  }
  return {
    type: "guest-fee",
    address: BTC_GUEST_SERVICE_FEE_ADDRESS,
    amountSat,
    script: outputScript
  };
}

async function btcOpenSendModal() {
  if (!state.bitcoin.wallet) return;
  btcUpdateRecipientRows();
  btcUpdateGuestBitcoinUi();
  btcUpdateGuestFeeDisplay();
  btcUpdateSendPreview();
  if (!state.bitcoin.btcPrice) {
    btcSetSendStatus("Loading BTC/USD price for USD conversion...", "");
    btcEnsurePrice().then(price => {
      btcUpdateGuestFeeDisplay();
      btcUpdateSendPreview();
      if (price) {
        btcSetSendStatus("Enter recipient address and amount.", "");
      } else if (isGuestMode()) {
        btcSetSendStatus("BTC/USD price is required for the Guest Service Fee before sending.", "");
      }
    });
  } else {
    btcSetSendStatus("Enter recipient address and amount.", "");
  }
  if (state.bitcoin.wallet.isWatchOnly) {
    els.btcSendWifSection.classList.remove('hide');
    els.btcSendWifInput.value = '';
  } else {
    els.btcSendWifSection.classList.add('hide');
  }
  els.btcSendModal.classList.remove('hide');
  els.btcSendModal.setAttribute("aria-hidden", "false");
}

async function btcUseMaxAmount() {
  if (!state.bitcoin.wallet) return;
  const balance = btcSummarizeUtxoBalance();
  const feeRate = Number(els.btcFeeRate.value || state.bitcoin.feeRate || 8);
  const inputCount = Math.max(1, state.bitcoin.utxos.length);
  const rows = btcGetRecipientRows();
  const firstRow = rows[0];
  if (!firstRow) return;

  let otherRecipientSat = 0;
  let otherRecipientCount = 0;
  rows.slice(1).forEach(row => {
    if (!btcRecipientHasAnyInput(row)) return;
    otherRecipientCount += 1;
    try {
      otherRecipientSat += btcBtcToSat(row.querySelector(".btc-recipient-btc")?.value);
    } catch {}
  });

  let guestFeeSat = 0;
  if (isGuestMode()) {
    try {
      await btcEnsurePrice();
      guestFeeSat = btcGetGuestServiceFeeSat();
    } catch (err) {
      btcSetSendStatus(err.message || "BTC/USD price is required for the Guest Service Fee.", "");
      btcUpdateGuestFeeDisplay();
      return;
    }
  }

  const outputCount = 1 + otherRecipientCount + (guestFeeSat > 0 ? 1 : 0);
  const feeNoChange = Math.ceil(btcEstimateLegacyP2PKHSize(inputCount, outputCount) * feeRate);
  const maxSat = Math.max(0, balance - otherRecipientSat - guestFeeSat - feeNoChange);
  const btcInput = firstRow.querySelector(".btc-recipient-btc");
  if (btcInput) {
    btcInput.value = btcFormatPlainBtcFromSat(maxSat);
    firstRow.dataset.lastEditedAmount = "btc";
    btcSyncRecipientAmount(firstRow, "btc");
  }
  btcSetSendStatus(`Max amount prefilled from confirmed balance: ${btcFormatBtcFromSat(maxSat)}.`, '');
  btcUpdateSendPreview();
}

async function btcDownloadPDF(options = {}) {
  const customContext = options && typeof options === "object" && options.wallet ? options : null;
  const wallet = customContext?.wallet || state.bitcoin.wallet;
  const history = customContext && Array.isArray(customContext.transactions)
    ? customContext.transactions
    : state.bitcoin.history;

  if (!wallet?.address) {
    alert('Please load a wallet first.');
    return;
  }
  if (!history || !history.length) {
    alert('No transactions to download.');
    return;
  }
  if (!window.jspdf) {
    alert('PDF library loading. Please try again.');
    return;
  }

  // Bitcoin tab keeps its current 20-row statement; Expense BTC statements pass a full wallet history.
  const displayedTransactions = customContext
    ? history
    : history.slice(0, Math.min(history.length, 20));
  
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  await loadCustomFontsForPdf(doc);

  const logoData = await getPdfLogo();
  const title = 'Bitcoin Transaction History';
  const subtitle = `Address: ${wallet.address} (${displayedTransactions.length} transactions)`;
  drawPdfHeader(doc, logoData, title, subtitle);
  drawPdfOwnerBlock(doc, 48);

  // Calculate summary data from displayed transactions only
  const directionForTx = tx => btcTxDirectionForAddress(tx, wallet.address);
  const balance = customContext && customContext.balanceSat != null
    ? Number(customContext.balanceSat || 0)
    : btcSummarizeUtxoBalance();
  const received = Number(displayedTransactions.reduce((sum, tx) => sum + (directionForTx(tx).receivedSat || 0), 0));
  const sent = Number(displayedTransactions.reduce((sum, tx) => sum + (directionForTx(tx).sentSat || 0), 0));
  const transactionCount = displayedTransactions.length;

  // Add summary info to top right
  doc.setFontSize(10);
  doc.setTextColor(23, 33, 43);
  const summaryY = 48;
  const summaryX = 120;
  
  doc.text(`Transaction Count: ${transactionCount}`, summaryX, summaryY);
  doc.text(`Current Balance: ${formatPdfBtcFromSat(balance)}`, summaryX, summaryY + 7);
  doc.text(`Total Received: ${formatPdfBtcFromSat(received)}`, summaryX, summaryY + 14);
  doc.text(`Total Sent: ${formatPdfBtcFromSat(sent)}`, summaryX, summaryY + 21);
  doc.text(`Network: ${wallet.label || wallet.key || 'Bitcoin'}`, summaryX, summaryY + 28);

  // Create detailed transaction data
  const tableData = [];
  for (const tx of displayedTransactions) {
    const dir = directionForTx(tx);
    const ts = tx.status && tx.status.confirmed
      ? btcFormatDate(tx.status.block_time || 0)
      : 'mempool';
    const conf = tx.status && tx.status.confirmed
      ? (tx.status.block_height ? `confirmed @ ${tx.status.block_height}` : 'confirmed')
      : 'unconfirmed';
    const amount = formatPdfSignedBtcFromSat(dir.netSat);
    const badgeText = dir.label === 'received' ? 'Received' : dir.label === 'sent' ? 'Sent' : 'Self / change';
    
    // Get addresses for this transaction
    const addresses = btcGetTransactionAddresses(tx, wallet.address);
    
    // Main transaction row
    tableData.push([
      badgeText,
      ts,
      conf,
      btcShortHash(tx.txid),
      amount
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
    if (tx.fee) details.push(`Fee: ${formatPdfBtcFromSat(tx.fee)}`);
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
    startY: 88,
    head: [['Type', 'Date', 'Status', 'Txid', 'Amount']],
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
      3: { cellWidth: 60, fontSize: 7 },
      4: { cellWidth: 30, fontSize: 8, halign: "right" }
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
      if (data.column.index === 3 && typeof data.cell.text === 'string' && data.cell.text.length > 15) {
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
  const safeAddress = String(wallet.address || "wallet").slice(0, 8) || "wallet";
  doc.save(`bitcoin-transactions-${safeAddress}-${new Date().toISOString().split('T')[0]}.pdf`);
}

function btcSetWifQrStatus(message, kind = ""){
  if (!els.btcWifQrStatus) return;
  els.btcWifQrStatus.className = `empty ${kind || ""}`.trim();
  els.btcWifQrStatus.textContent = message;
}

function btcStopWifQrScanner(){
  const scanner = state.bitcoin.wifQrScanner;
  scanner.active = false;
  if (scanner.rafId) {
    cancelAnimationFrame(scanner.rafId);
    scanner.rafId = null;
  }
  if (scanner.stream) {
    scanner.stream.getTracks().forEach(track => track.stop());
    scanner.stream = null;
  }
  if (els.btcWifQrVideo) {
    els.btcWifQrVideo.pause();
    els.btcWifQrVideo.srcObject = null;
  }
}

function btcQrCameraErrorMessage(error){
  const name = error?.name || "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Camera permission was denied. Allow camera access and try again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No camera was found on this device.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "The camera is already in use by another app.";
  }
  if (name === "SecurityError") {
    return "Camera access requires HTTPS or a trusted local app context.";
  }
  return error?.message || "Could not start the camera.";
}

function btcExtractWifFromQrText(text){
  const raw = String(text || "").trim();
  if (!raw) return "";
  const candidates = [raw];
  try {
    const url = new URL(raw);
    ["wif", "privkey", "privateKey", "key"].forEach(param => {
      const value = url.searchParams.get(param);
      if (value) candidates.push(value);
    });
  } catch {}
  const joined = candidates.join(" ");
  const match = joined.match(/\b(?:[5KL][1-9A-HJ-NP-Za-km-z]{50,51}|[9c][1-9A-HJ-NP-Za-km-z]{50,51})\b/);
  return (match?.[0] || candidates[0]).trim();
}

function btcHandleScannedWif(text){
  const wif = btcExtractWifFromQrText(text);
  if (!wif) {
    btcSetWifQrStatus("QR code did not contain a WIF.", "error");
    return false;
  }
  els.btcSendWifInput.value = wif;
  if (state.bitcoin.wallet?.isWatchOnly) {
    try {
      const signingWallet = btcDetectAndLoadWallet(wif, state.bitcoin.wallet.key);
      if (signingWallet.address !== state.bitcoin.wallet.address) {
        btcSetSendStatus("WIF scanned, but it does not match this watch-only address.", "");
      } else {
        btcSetSendStatus("WIF scanned and matched this watch-only wallet.", "success");
      }
    } catch (err) {
      btcSetSendStatus(`WIF scanned, but validation failed: ${err.message || err}`, "");
    }
  } else {
    btcSetSendStatus("WIF scanned.", "success");
  }
  closeModal("btcWifQrScannerModal");
  return true;
}

async function btcScanWifQrFrame(){
  const scanner = state.bitcoin.wifQrScanner;
  if (!scanner.active || !els.btcWifQrVideo || !els.btcWifQrCanvas) return;
  const video = els.btcWifQrVideo;
  if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
    const canvas = els.btcWifQrCanvas;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    let scannedText = "";
    if (scanner.detector) {
      try {
        const codes = await scanner.detector.detect(canvas);
        scannedText = codes?.[0]?.rawValue || "";
      } catch {}
    }
    if (!scannedText && typeof window.jsQR === "function") {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = window.jsQR(imageData.data, imageData.width, imageData.height);
      scannedText = code?.data || "";
    }
    if (scannedText && btcHandleScannedWif(scannedText)) return;
  }
  scanner.rafId = requestAnimationFrame(() => btcScanWifQrFrame());
}

async function btcOpenWifQrScanner(){
  if (!els.btcWifQrScannerModal || !els.btcWifQrVideo) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    btcSetSendStatus("QR scanning is not available in this browser.", "");
    return;
  }
  if (!("BarcodeDetector" in window) && typeof window.jsQR !== "function") {
    btcSetSendStatus("QR scanner library is still loading. Please try again in a moment.", "");
    return;
  }

  btcStopWifQrScanner();
  els.btcWifQrScannerModal.classList.remove("hide");
  els.btcWifQrScannerModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  btcSetWifQrStatus("Camera is starting...");

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });
    const scanner = state.bitcoin.wifQrScanner;
    scanner.stream = stream;
    scanner.active = true;
    scanner.detector = null;
    if ("BarcodeDetector" in window) {
      try {
        scanner.detector = new BarcodeDetector({ formats: ["qr_code"] });
      } catch {}
    }
    els.btcWifQrVideo.srcObject = stream;
    await els.btcWifQrVideo.play();
    btcSetWifQrStatus("Scanning for WIF QR code...");
    scanner.rafId = requestAnimationFrame(() => btcScanWifQrFrame());
  } catch (error) {
    btcStopWifQrScanner();
    btcSetWifQrStatus(btcQrCameraErrorMessage(error), "error");
    btcSetSendStatus(btcQrCameraErrorMessage(error), "");
  }
}

async function btcBuildAndBroadcast() {
  if (!state.bitcoin.wallet) {
    btcSetSendStatus('Load a wallet first.', '');
    return;
  }

  const wallet = state.bitcoin.wallet;
  let feeRateSatVb;
  feeRateSatVb = Number(els.btcFeeRate.value || state.bitcoin.feeRate || 8);
  if (!Number.isFinite(feeRateSatVb) || feeRateSatVb <= 0) {
    btcSetSendStatus('Invalid fee rate.', '');
    return;
  }

  if (isGuestMode()) {
    try {
      await btcEnsurePrice();
      btcGetGuestServiceFeeSat();
      btcUpdateGuestFeeDisplay();
    } catch (err) {
      btcSetSendStatus(`Guest Service Fee could not be added.\n${err.message || err}`, '');
      return;
    }
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

  let recipientOutputs;
  let guestFeeOutput = null;
  try {
    recipientOutputs = btcCollectRecipientOutputs(signingWallet);
    guestFeeOutput = btcBuildGuestServiceFeeOutput(signingWallet);
  } catch (err) {
    btcSetSendStatus(err.message || 'Invalid recipient output.', '');
    return;
  }

  if (isGuestMode() && !guestFeeOutput) {
    btcSetSendStatus('Guest Service Fee output is required in Guest Mode.', '');
    return;
  }

  const spendOutputs = guestFeeOutput ? [...recipientOutputs, guestFeeOutput] : recipientOutputs;
  const outputTotalSat = spendOutputs.reduce((sum, output) => sum + Number(output.amountSat || 0), 0);
  const recipientTotalSat = recipientOutputs.reduce((sum, output) => sum + Number(output.amountSat || 0), 0);

  const spendable = btcSummarizeUtxoBalance();
  if (!state.bitcoin.utxos.length || spendable <= 0) {
    btcSetSendStatus('No spendable UTXOs were found for this wallet.', '');
    return;
  }
  if (outputTotalSat <= 0) {
    btcSetSendStatus('Total output amount must be greater than zero.', '');
    return;
  }

  const utxos = [...state.bitcoin.utxos].sort((a, b) => Number(b.value || 0) - Number(a.value || 0));
  const selected = [];
  let totalIn = 0;
  let plan = null;

  for (const utxo of utxos) {
    selected.push(utxo);
    totalIn += Number(utxo.value || 0);
    plan = btcBuildSpendPlan(totalIn, selected.length, outputTotalSat, spendOutputs.length, feeRateSatVb);
    if (plan) break;
  }

  if (!plan) {
    btcSetSendStatus(
      `Not enough amount available to make transaction.\nAvailable balance: ${btcFormatBtcFromSat(spendable)}\nRecipient total: ${btcFormatBtcFromSat(recipientTotalSat)}${guestFeeOutput ? `\nGuest Service Fee: ${btcFormatBtcFromSat(guestFeeOutput.amountSat)}` : ""}\nPlease reduce the amount or add more funds.`,
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

    spendOutputs.forEach(output => {
      psbt.addOutput({ script: output.script, value: output.amountSat });
    });

    if (plan.changeSat >= DUST_P2PKH) {
      psbt.addOutput({ address: signingWallet.address, value: plan.changeSat });
    }

    for (let i = 0; i < selected.length; i++) {
      psbt.signInput(i, signingWallet.uncompressedPair);
    }
    psbt.finalizeAllInputs();

    const tx = psbt.extractTransaction();
    const rawHex = tx.toHex();
    const exactVSize = tx.virtualSize();
    const changeValue = plan.changeSat >= DUST_P2PKH ? plan.changeSat : 0;
    const exactFee = totalIn - outputTotalSat - changeValue;
    const actualRate = exactFee / exactVSize;

    btcSetSendStatus(
      `Transaction built successfully.\nInputs: ${selected.length}\nOutputs: ${spendOutputs.length}${guestFeeOutput ? " including Guest Service Fee" : ""}\nExact size: ${exactVSize} vB\nNetwork fee: ${btcFormatBtcFromSat(exactFee)} (${actualRate.toFixed(2)} sat/vB)\nTotal debit: ${btcFormatBtcFromSat(outputTotalSat + exactFee)}\nBroadcasting...`
    );

    const broadcast = await btcFetchText(`${btcCurrentApi()}/tx`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: rawHex
    });

    const txid = String(broadcast || '').trim();
    btcSetSendStatus(
      `Broadcast accepted.\nTxid: ${txid || tx.getId()}\nRecipient total: ${btcFormatBtcFromSat(recipientTotalSat)}${guestFeeOutput ? `\nGuest Service Fee: ${btcFormatBtcFromSat(guestFeeOutput.amountSat)}` : ""}\nNetwork fee: ${btcFormatBtcFromSat(exactFee)}\nThe wallet data will refresh now.`,
      ''
    );

    // Show Bitcoin transaction success overlay
    const toSummary = recipientOutputs.length === 1
      ? recipientOutputs[0].address
      : `${recipientOutputs.length} recipients`;
    showBtcTransactionSuccessOverlay(outputTotalSat, guestFeeOutput ? `${toSummary} + Guest Service Fee` : toSummary, txid || tx.getId());

    await btcFetchWalletData(false);
  } catch (err) {
    btcSetSendStatus(`Send failed.\n${err.message || err}`, '');
  }
}

function btcBindUI() {
  // Wallet type toggle buttons
  els.btcFullWalletBtn.addEventListener('click', () => btcToggleWalletType('full'));
  els.btcWatchWalletBtn.addEventListener('click', () => btcToggleWalletType('watch'));
  els.btcBrainWalletBtn.addEventListener('click', () => btcToggleWalletType('brain'));
  els.btcHexWalletBtn.addEventListener('click', () => btcToggleWalletType('hex'));
  els.btcBulkWalletBtn.addEventListener('click', btcPromptBulkWalletImport);
  els.btcBulkWalletFileInput.addEventListener('change', btcHandleBulkWalletFileChange);
  els.btcBulkWalletsList.addEventListener('click', event => {
    const row = event.target.closest?.('.btc-bulk-wallet-row');
    if (row?.dataset?.bulkWalletId) {
      btcLoadBulkWallet(row.dataset.bulkWalletId);
    }
  });
  els.btcWatchAddressBtn.addEventListener('click', btcWatchAddress);
  
  els.btcImportBtn.addEventListener('click', btcImportWif);
  els.btcBrainWalletImportBtn.addEventListener('click', btcImportBrainWallet);
  els.btcHexImportBtn.addEventListener('click', btcImportHex);
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
  els.btcSendBtn.addEventListener('click', btcOpenSendModal);
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
  els.btcAddRecipientBtn.addEventListener('click', btcAddRecipientRow);
  els.btcFeeRate.addEventListener('input', btcUpdateSendPreview);
  els.btcRecipientsList.addEventListener('input', event => {
    const row = event.target.closest?.('[data-recipient-row]');
    if (!row) return;
    if (event.target.classList.contains('btc-recipient-btc')) {
      btcSyncRecipientAmount(row, 'btc');
    } else if (event.target.classList.contains('btc-recipient-usd')) {
      btcSyncRecipientAmount(row, 'usd');
    } else if (event.target.classList.contains('btc-recipient-address')) {
      btcUpdateSendPreview();
    }
  });
  els.btcRecipientsList.addEventListener('click', event => {
    const removeBtn = event.target.closest?.('.btc-remove-recipient-btn');
    if (removeBtn) {
      btcRemoveRecipientRow(removeBtn.closest('[data-recipient-row]'));
    }
  });
  els.btcScanWifQrBtn.addEventListener('click', btcOpenWifQrScanner);
  els.btcWifQrStopBtn.addEventListener('click', btcStopWifQrScanner);
  btcUpdateRecipientRows();
  btcUpdateGuestBitcoinUi();
}

// Notes UI Binding
function notesBindUI() {
  els.saveNoteBtn.addEventListener('click', saveNote);
  els.searchNotes.addEventListener('input', (e) => {
    renderNotes(e.target.value);
  });
}

function btcClearSession() {
  btcStopWifQrScanner();
  state.bitcoin.wallet = null;
  state.bitcoin.utxos = [];
  state.bitcoin.history = [];
  state.bitcoin.historyCursor = null;
  state.bitcoin.historyDone = false;
  state.bitcoin.isWatchOnly = false;
  state.bitcoin.watchAddress = null;
  btcClearBulkWallets();
  
  btcClearView();
  
  // Update UI visibility
  updateSaveButtonVisibility();
  updateSavedAddressesVisibility();
  
  els.btcWifInput.value = '';
  els.btcAddressInput.value = '';
  els.btcHexInput.value = '';
  btcResetRecipientRows();
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
  bindLandingAnchorScroll();
  applyPageCurrencySelection(PAGE_CURRENCY_DEFAULT);
  loadTaxSettingsPreferenceFromStorage();
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
