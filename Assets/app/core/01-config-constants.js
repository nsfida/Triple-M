/* Modularized from script.js lines 1-623 — CONFIG + constants + early helpers. Load order must be preserved. */
const CONFIG = {
  table: "loan_ledger_entries"
};

const SESSION_USERNAME_KEY = "loanledger-session-username-v1";
const SESSION_ENCRYPTED_STORAGE_KEY = "loanledger-session-credential-v4";
const SESSION_EPHEMERAL_STORAGE_KEY = "loanledger-session-credential-ephemeral-v4";
const SESSION_CREDENTIAL_DB_NAME = "loanledger-secure-credentials-v1";
const SESSION_CREDENTIAL_STORE_NAME = "secureKeys";
const SESSION_CREDENTIAL_KEY_ID = "session-login-aes-gcm-v1";
const REMEMBER_ME_PREF_KEY = "loanledger-remember-me-pref-v1";
const TRIAL_PROMO_DISMISS_KEY = "triplem-trial-overlay-dismissed-v1";
const LEGACY_ZIP_STORAGE_KEYS = [
  "loanledger-unlocked",
  "loanledger-zip-username-v1",
  "loanledger-zip-password-v1",
  "loanledger-zip-username-persist-v1",
  "loanledger-zip-derived-password-v2",
  "loanledger-zip-derived-username-v2",
  "loanledger-zip-credential-v3"
];

const APP_PERMISSION_MODULES = [
  "dashboard","expenses","wallets","inventory","loans","installments",
  "bitcoin","notes","assets","customers","reports","pdf_export","currency_settings",
  "settings","admin_panel"
];
const APP_PERMISSION_ACTIONS = ["view","create","edit","delete","export","import"];

/** Obfuscated Supabase config (not secret — RLS + sessions enforce access). */
function getEmbeddedSupabaseConfig(){
  const xorKey = 41;
  const decodeXor = (arr) => String.fromCharCode(...arr.map((n) => n ^ xorKey));
  // "https://iymztqbscfodelovdrnn.supabase.co" XOR 41
  const urlParts = [
    65,77,77,73,74,18,4,4,64,80,68,83,77,72,66,74,74,66,79,66,71,76,66,79,66,85,69,83,67,67,7,74,84,73,66,67,66,74,66,7,66,66
  ];
  // Rebuild URL via joined fragments + light XOR on host only for readability control
  const host = ["iymzt","qbscfo","delovd","rnn"].join("");
  const supabaseUrl = ["https://", host, ".supabase.co"].join("");
  const keyParts = [
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5bXp0cWJzY2ZvZGVsb3Zkcm5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MjcxNDAsImV4cCI6MjA5NDMwMzE0MH0",
    "eASEqmcC9-eDDgjYFsa3Ne8idK-6KmfXHbxvhWVwZSA"
  ];
  void decodeXor; void urlParts;
  return {
    supabaseUrl,
    supabaseKey: keyParts.join(".")
  };
}

function sanitizeUsername(raw){
  const username = String(raw || "").trim();
  if (!username) throw new Error("Please enter your username.");
  if (!/^[a-zA-Z0-9_-]+$/.test(username)){
    throw new Error("Username may only contain letters, numbers, underscores, and hyphens.");
  }
  return username;
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

function openCredentialDb(){
  if (!window.indexedDB) {
    return Promise.reject(new Error("Secure browser storage is not available."));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SESSION_CREDENTIAL_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SESSION_CREDENTIAL_STORE_NAME)){
        db.createObjectStore(SESSION_CREDENTIAL_STORE_NAME);
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
      const tx = db.transaction(SESSION_CREDENTIAL_STORE_NAME, mode);
      const store = tx.objectStore(SESSION_CREDENTIAL_STORE_NAME);
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
  let key = await credentialStoreOperation("readonly", store => store.get(SESSION_CREDENTIAL_KEY_ID)).catch(() => null);
  if (key || !create) return key || null;
  key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await credentialStoreOperation("readwrite", store => store.put(key, SESSION_CREDENTIAL_KEY_ID));
  return key;
}

async function saveEncryptedSessionCredential(credential, { persist = true } = {}){
  // Without Remember Me: never write durable or tab storage — refresh/close requires sign-in again.
  if (!persist) {
    try { localStorage.removeItem(SESSION_ENCRYPTED_STORAGE_KEY); } catch {}
    try { sessionStorage.removeItem(SESSION_EPHEMERAL_STORAGE_KEY); } catch {}
    try { localStorage.setItem(REMEMBER_ME_PREF_KEY, "0"); } catch {}
    return;
  }
  const key = await getCredentialEncryptionKey({ create: true });
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify({
    version: 4,
    username: credential.username,
    sessionToken: credential.sessionToken,
    remember: true,
    savedAt: new Date().toISOString()
  }));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  const envelope = JSON.stringify({
    version: 4,
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(encrypted))
  });
  localStorage.setItem(SESSION_ENCRYPTED_STORAGE_KEY, envelope);
  try { sessionStorage.removeItem(SESSION_EPHEMERAL_STORAGE_KEY); } catch {}
  localStorage.setItem(REMEMBER_ME_PREF_KEY, "1");
}

async function decryptSessionCredentialEnvelope(stored){
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
    if (!credential?.username || !credential?.sessionToken) return null;
    return credential;
  } catch (err) {
    console.warn("Encrypted session could not be read.", err);
    return null;
  }
}

/** Only loads Remember Me credentials from localStorage (never sessionStorage). */
async function loadEncryptedSessionCredential(){
  let stored = "";
  try {
    stored = localStorage.getItem(SESSION_ENCRYPTED_STORAGE_KEY) || "";
  } catch {
    return null;
  }
  if (!stored) return null;
  const cred = await decryptSessionCredentialEnvelope(stored);
  if (!cred) return null;
  return { ...cred, remember: true };
}

async function deleteCredentialEncryptionKey(){
  try {
    await credentialStoreOperation("readwrite", store => store.delete(SESSION_CREDENTIAL_KEY_ID));
  } catch {}
}

function clearLegacyZipStorage(){
  LEGACY_ZIP_STORAGE_KEYS.forEach(key => {
    try { sessionStorage.removeItem(key); } catch {}
    try { localStorage.removeItem(key); } catch {}
  });
}

function removeStoredSessionCredentials(){
  clearLegacyZipStorage();
  try {
    sessionStorage.removeItem(SESSION_USERNAME_KEY);
  } catch {}
  try {
    sessionStorage.removeItem(SESSION_EPHEMERAL_STORAGE_KEY);
  } catch {}
  try {
    localStorage.removeItem(SESSION_ENCRYPTED_STORAGE_KEY);
  } catch {}
  deleteCredentialEncryptionKey();
  if (typeof state !== "undefined" && state) {
    state.sessionToken = "";
    state.sessionUser = null;
    state.permissions = [];
  }
}

function readRememberMePreference(){
  try {
    if (typeof els !== "undefined" && els.rememberMeCheckbox) {
      return !!els.rememberMeCheckbox.checked;
    }
  } catch {}
  try {
    return localStorage.getItem(REMEMBER_ME_PREF_KEY) === "1";
  } catch {
    return false;
  }
}

function applyRememberMeCheckboxFromPreference(){
  try {
    if (!els?.rememberMeCheckbox) return;
    const pref = localStorage.getItem(REMEMBER_ME_PREF_KEY);
    // Default unchecked for security unless user previously chose Remember Me
    els.rememberMeCheckbox.checked = pref === "1";
  } catch {}
}

let runtimeConfig = getEmbeddedSupabaseConfig();
let fullConfigData = null;

const SUPPORTED_CURRENCIES = (window.TriplemCurrencyRegistry?.codes?.() || []);
window.addEventListener("triplem:currency-registry", () => {
  const next = window.TriplemCurrencyRegistry?.codes?.() || [];
  if (next.length) SUPPORTED_CURRENCIES.splice(0, SUPPORTED_CURRENCIES.length, ...next);
});
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

// Currency aliases are sourced from Assets/config/currencies.json.
function normalizeCurrencyCode(currency) {
  if (!currency) return "";
  const registry = window.TriplemCurrencyRegistry;
  if (registry?.normalize) return registry.normalize(currency);
  return String(currency).trim().toUpperCase();
}

function getAllowedCurrencies() {
  const configCurrencies = fullConfigData?.Currency;
  if (!Array.isArray(configCurrencies) || !configCurrencies.length) {
    // Admins with no explicit list get all; restricted users stay empty (no silent full unlock).
    if (state.sessionUser?.role === "admin" || isGuestMode() || !state.sessionUser) {
      return SUPPORTED_CURRENCIES;
    }
    return [];
  }

  // If config contains "All" (case-insensitive), return all supported currencies
  if (configCurrencies.some(currency => String(currency).toUpperCase() === "ALL")) {
    return SUPPORTED_CURRENCIES;
  }

  const filtered = [...new Set(configCurrencies
    .map(currency => normalizeCurrencyCode(currency))
    .filter(currency => SUPPORTED_CURRENCIES.includes(currency))
  )];
  return filtered.length ? filtered : (
    state.sessionUser?.role === "admin" ? SUPPORTED_CURRENCIES : []
  );
}

function preferenceRowsForCurrentUser(rows){
  const list = Array.isArray(rows) ? rows : [];
  const myId = currentOwnerId();
  if (!myId) return list;
  // Admins can see every user's SYSTEM preference rows — always prefer exact owner match.
  const exact = list.filter(row => row.owner_id === myId);
  if (exact.length) return exact;
  // Legacy rows created before owner_id existed (null) — only as fallback.
  return list.filter(row => !row.owner_id);
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
  const allowed = new Set(getAllowedCurrencies());
  const normalized = [...new Set(values
    .map(currency => normalizeCurrencyCode(currency))
    .filter(currency => allowed.has(currency))
  )];
  return normalized.length ? normalized : [PAGE_CURRENCY_DEFAULT];
}

function getPageCurrencyMenuOptions() {
  const allowed = getAllowedCurrencies();
  // Always offer "ALL" (meaning all currencies this user is allowed to use),
  // then only the admin-allowed currencies — never the full global list.
  return [PAGE_CURRENCY_DEFAULT, ...allowed.filter(c => c !== PAGE_CURRENCY_DEFAULT)];
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
  return TripleMTaxMath.normalizeTaxRate(value);
}

function normalizeTaxMode(value) {
  return TripleMTaxMath.normalizeTaxMode(value);
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
    const rows = await supabase(systemPreferenceQuery(VAT_SETTINGS_META_TAG));
    const taxRow = preferenceRowsForCurrentUser(rows).find(isTaxSettingsPreferenceRow);
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
    const rows = await supabase(systemPreferenceQuery(VAT_SETTINGS_META_TAG));
    const taxRow = preferenceRowsForCurrentUser(rows).find(isTaxSettingsPreferenceRow);
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
  return TripleMTaxMath.roundTaxMoney(value);
}

/** Coerce ledger money fields; never return NaN/Infinity. */
function finiteMoney(value, fallback = 0) {
  return TripleMTaxMath.finiteMoney(value, fallback);
}

/**
 * Resolve VAT-on flag from stored meta.
 * true/false = explicit [VATP:1|0]; null = legacy/missing → infer from rate/amount.
 */
function parseVatAppliedToken(raw) {
  return TripleMTaxMath.parseVatAppliedToken(raw);
}

function isTaxAppliedFromMeta(meta = {}) {
  return TripleMTaxMath.isTaxAppliedFromMeta(meta);
}

function calculateTaxBreakdown(amount, rateValue, modeValue, applied = true) {
  return TripleMTaxMath.calculateTaxBreakdown(amount, rateValue, modeValue, applied);
}

function calculateTaxBreakdownFromGross(totalValue, rateValue, modeValue, applied = true) {
  return TripleMTaxMath.calculateTaxBreakdownFromGross(totalValue, rateValue, modeValue, applied);
}

function taxMetaFromBreakdown(breakdown) {
  return TripleMTaxMath.taxMetaFromBreakdown(breakdown);
}

function taxBreakdownFromMeta(meta = {}, totalValue = 0) {
  return TripleMTaxMath.taxBreakdownFromMeta(meta, totalValue);
}

function formatTaxModeLabel(mode) {
  return normalizeTaxMode(mode) === TAX_MODE_INCLUDE ? "included" : "added";
}

function formatTaxSummary(breakdown, currency, options = {}) {
  if (!breakdown?.applied || !Number(breakdown.tax || 0)) return "VAT off";
  if (options.compact) {
    return `${trimInventoryNumber(breakdown.rate, 2)}% · ${formatReportAmount(breakdown.tax, currency)}`;
  }
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

function systemPreferenceQuery(tagOrTags){
  const tags = (Array.isArray(tagOrTags) ? tagOrTags : [tagOrTags]).filter(Boolean);
  const notesFilter = tags.length === 1
    ? `&notes=ilike.*${encodeURIComponent(tags[0])}*`
    : `&or=(${tags.map(tag => `notes.ilike.*${encodeURIComponent(tag)}*`).join(",")})`;
  return `${CONFIG.table}?select=*&person_name=eq.SYSTEM${notesFilter}${ownerIdQuery()}&order=created_at.desc`;
}

function currentOwnerId(){
  const u = state.sessionUser;
  if (!u) return null;
  return u.team_owner_id || u.id || null;
}

function ownerIdQuery(){
  const uid = currentOwnerId();
  if (!uid || isGuestMode()) return "";
  return `&owner_id=eq.${encodeURIComponent(uid)}`;
}

function rowBelongsToCurrentUser(row){
  if (isGuestMode() || !row) return true;
  const uid = currentOwnerId();
  if (!uid) return false;
  // Keep optimistic rows that are still syncing even if owner_id was missing on older builds
  if (!row.owner_id && row.id && state.pendingDbSyncIds.has(row.id)) return true;
  // Strict: only rows owned by the signed-in user (no cross-account mix)
  return row.owner_id === uid;
}

/** Keep optimistic / in-flight local rows so a scope reload cannot erase a just-saved entry. */
function shouldPreserveLocalLedgerEntry(entry, scope, activeIds, deletedIds){
  if (!entry?.id) return false;
  if (!entryBelongsToLedgerScope(entry, scope)) return false;
  if (deletedIds.has(entry.id)) return false;
  if (!rowBelongsToCurrentUser(entry)) return false;
  // Prefer the in-flight local version over a stale server row for the same id
  if (state.pendingDbSyncIds.has(entry.id)) return true;
  if (activeIds.has(entry.id)) return false;
  // Owned local row missing from this server response (pending insert race / failed sync / stale fetch)
  return true;
}

function filterRowsForCurrentUser(rows){
  const list = Array.isArray(rows) ? rows : [];
  if (isGuestMode() || !currentOwnerId()) return list;
  return list.filter(rowBelongsToCurrentUser);
}
