import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  beginBrowserSession,
  clearBrowserSessionCookie,
  clearLegacyPlaintextSession,
  createEncryptedBrowserSessionStorage,
  EXPENSE_VAULT_AUTH_STORAGE_KEY,
  getEncryptedSessionDiagnostics,
  getEncryptedSessionPersistenceStatus
} from './secure-session-storage.js?v=fast-autosave-1';
import { createVirtualSheet } from './virtual-sheet.js?v=fast-autosave-1';
import { setupReceiptImport } from './receipt-import.js?v=settings-1';
import { createAccountPanel } from './account-panel.js?v=settings-1';
import { cancelSpreadsheetDrag, clearAllSpreadsheetSelections, createSpreadsheetGrid } from './spreadsheet-grid.js?v=fast-autosave-1';

const SUPABASE_URL = 'https://hmtbalmgpyrnxbifnvzg.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_vThwCqEu6D5kFSNNI5SQaQ_C5e5ViGj';

// Keep the session through reloads and tab closes in the same browser session.
// Supabase's session JSON is AES-256-GCM encrypted before it touches localStorage;
// a browser-session cookie gates restoration and normally expires on browser exit.
clearLegacyPlaintextSession();
const encryptedAuthStorage = createEncryptedBrowserSessionStorage();
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    storage: encryptedAuthStorage,
    storageKey: EXPENSE_VAULT_AUTH_STORAGE_KEY,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: 'pkce'
  }
});

const AMOUNT_COLUMNS = [
  ['Salik', 'salik'], ['Renewal', 'renewal'], ['New Reg', 'new_reg'],
  ['RTA Passing', 'rta_passing'], ['Fines', 'fines'], ['Fuel', 'fuel'],
  ['Taxi', 'taxi'], ['Metro', 'metro'], ['Parking', 'parking'], ['Wash', 'wash'],
  ['Rental / FINE RF', 'rental_fine_rf'], ['FD REFUND', 'fd_refund'],
  ['Lunch', 'lunch'], ['Marketing', 'marketing'], ['Salary', 'salary'],
  ['Servicing', 'servicing'], ['Drawing', 'drawing'], ['Director', 'director'],
  ['Heyaza', 'heyaza'], ['Office Supplies', 'office_supplies'],
  ['Misc Exp.', 'misc_exp'], ['OTHER', 'other_exp'], ['Al Insaf', 'al_insaf'],
  ['Charity', 'charity'], ['VAT', 'vat']
];

const RECEIVING_AMOUNT_COLUMNS = [
  ['Rent', 'rent'], ['Salik', 'salik'], ['Fines', 'fines'], ['VAT', 'vat'],
  ['CDW', 'cdw'], ['ADD DRI', 'add_dri'], ['Low Fuel', 'low_fuel'],
  ['Fine Deposit', 'fine_deposit'], ['Waiver', 'waiver'], ['Withdraw', 'withdraw'],
  ['Sold Cars', 'sold_cars'], ['P.UP / DEL', 'pickup_delivery'],
  ['INS EXC.', 'ins_exc'], ['FREEZE', 'freeze_amount'], ['TYRE', 'tyre'],
  ['DAMAGE', 'damage'], ['EX KM', 'ex_km'], ['OTHERS', 'others']
];

const CASH_DENOMINATIONS = [
  { label: '1000', field: 'qty_1000', cents: 100000 },
  { label: '500', field: 'qty_500', cents: 50000 },
  { label: '200', field: 'qty_200', cents: 20000 },
  { label: '100', field: 'qty_100', cents: 10000 },
  { label: '50', field: 'qty_50', cents: 5000 },
  { label: '20', field: 'qty_20', cents: 2000 },
  { label: '10', field: 'qty_10', cents: 1000 },
  { label: '5', field: 'qty_5', cents: 500 },
  { label: '1', field: 'qty_1', cents: 100 },
  { label: '0.5', field: 'qty_050', cents: 50 },
  { label: '0.25', field: 'qty_025', cents: 25 }
];

const CASH_COUNT_COLUMNS = [
  { label: 'Date', field: 'count_date', kind: 'date', width: 138 },
  ...CASH_DENOMINATIONS.map(item => ({ label: item.label, field: item.field, kind: 'quantity', width: 76 })),
  { label: 'Total cash', field: 'total_cash', kind: 'total', width: 132 }
];
const CASH_QUANTITY_FIELDS = CASH_DENOMINATIONS.map(item => item.field);

const COLUMNS = [
  // Widths are relative weights: the Expenses table turns them into percentages
  // so all 32 columns always fit the window without horizontal scrolling.
  { label: 'Date', field: 'entry_date', kind: 'date', width: 84 },
  { label: 'Supplier', field: 'supplier', kind: 'text', width: 96 },
  { label: 'TRN#', field: 'trn_number', kind: 'text', width: 58 },
  { label: 'Name', field: 'spent_by', kind: 'text', width: 74 },
  { label: 'Inv#', field: 'invoice_number', kind: 'text', width: 58 },
  ...AMOUNT_COLUMNS.map(([label, field]) => ({ label, field, kind: 'amount', width: 40 })),
  { label: 'Total', field: 'total', kind: 'total', width: 52 },
  { label: 'TYPE', field: 'transaction_type', kind: 'select', width: 50 }
];
const COLUMN_WEIGHT_TOTAL = COLUMNS.reduce((sum, column) => sum + column.width, 0);

const RECEIVING_COLUMNS = [
  { label: 'Date', field: 'entry_date', kind: 'date', width: 116 },
  { label: 'Name', field: 'name', kind: 'text', width: 126 },
  ...RECEIVING_AMOUNT_COLUMNS.map(([label, field]) => ({ label, field, kind: 'amount', width: 64 })),
  { label: 'TOTAL', field: 'total', kind: 'total', width: 78 },
  { label: 'TYPE', field: 'transaction_type', kind: 'select', width: 72 },
  { label: 'Merchant', field: 'merchant', kind: 'text', width: 126 }
];

const EDITABLE_FIELDS = COLUMNS.filter(column => column.kind !== 'total').map(column => column.field);
const TEXT_FIELDS = ['supplier', 'trn_number', 'spent_by', 'invoice_number'];
const AMOUNT_FIELDS = AMOUNT_COLUMNS.map(([, field]) => field);
const RECEIVING_AMOUNT_FIELDS = RECEIVING_AMOUNT_COLUMNS.map(([, field]) => field);

const el = id => document.getElementById(id);
const authScreen = el('authScreen');
const appScreen = el('appScreen');
const loginForm = el('loginForm');
const loginButton = el('loginButton');
const loginMessage = el('loginMessage');
const tableBody = el('expenseTableBody');
const headerRow = el('expenseHeaderRow');
const table = el('expensesTable');
const saveButton = { disabled: false }; // per-sheet Save buttons were replaced by autosave + the top Save button
const addButton = el('addRowButton');
const deleteButton = el('deleteRowButton');
const sheetStatus = el('sheetStatus');
const toast = el('toast');
const receivedTableBody = el('receivedTableBody');
const receivedHeaderRow = el('receivedHeaderRow');
const receivedSaveButton = { disabled: false };
const receivedAddButton = el('addReceivedRowButton');
const receivedDeleteButton = el('deleteReceivedRowButton');
const receivedSheetStatus = el('receivedSheetStatus');
const cashTableBody = el('cashCountTableBody');
const cashHeaderRow = el('cashCountHeaderRow');
const cashSaveButton = { disabled: false };
const cashAddButton = el('addCashCountButton');
const cashDeleteButton = el('deleteCashCountButton');
const cashVaultStatus = el('cashVaultStatus');

let currentUser = null;
let canWrite = false; // true when the user can edit at least one section
// Access per section: 'none' | 'view' | 'edit' (from the access key; owner = edit everywhere).
const SECTION_KEYS = ['cash_vault', 'expenses', 'received'];
let permissions = { cash_vault: 'none', expenses: 'none', received: 'none', export: false, import: false };
const canEdit = section => permissions[section] === 'edit';
const canView = section => permissions[section] === 'view' || permissions[section] === 'edit';
const SECTION_BY_SHEET = { expenses: 'expenses', received: 'received', cash: 'cash_vault', expense_records: 'expenses', received_records: 'received' };
const sectionOf = key => SECTION_BY_SHEET[key] || key;

// Normalises the access returned by the server. Older Edge Function versions only
// send role + can_write, so those map to the same access the key always had.
function normalisePermissions(info) {
  if (info?.role === 'owner') return { cash_vault: 'edit', expenses: 'edit', received: 'edit', export: true, import: true };
  const fallback = info?.can_write ? 'edit' : 'view';
  const source = info?.permissions && typeof info.permissions === 'object' ? info.permissions : {};
  const level = value => (value === 'none' || value === 'view' || value === 'edit') ? value : fallback;
  return {
    cash_vault: level(source.cash_vault),
    expenses: level(source.expenses),
    received: level(source.received),
    export: typeof source.export === 'boolean' ? source.export : true,
    import: typeof source.import === 'boolean' ? source.import : Boolean(info?.can_write)
  };
}

// ---- Payment types (TYPE column) -------------------------------------------------
// Managed by the owner in Settings → Payment types (migration 014). Until that
// migration has run, the app keeps working with the original Cash and Bank.
const DEFAULT_PAYMENT_TYPES = [
  { name: 'Cash', counts_as_cash: true, use_in_expenses: true, use_in_received: true, is_system: true, sort_order: 1 },
  { name: 'Bank', counts_as_cash: false, use_in_expenses: true, use_in_received: true, is_system: true, sort_order: 2 }
];
let paymentTypes = DEFAULT_PAYMENT_TYPES.map(type => ({ ...type }));
let paymentTypesManaged = false; // true once the payment_types table is available
let cashTypeNames = new Set(['Cash']);
const typeOptionsCache = new Map();

function typesForLedger(ledger) {
  const flag = ledger === 'received' ? 'use_in_received' : 'use_in_expenses';
  return paymentTypes.filter(type => type[flag]);
}

function setPaymentTypes(list, managed) {
  const previousCash = [...cashTypeNames].sort().join('|');
  paymentTypes = (list?.length ? list : DEFAULT_PAYMENT_TYPES).map(type => ({ ...type }))
    .sort((a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100) || a.name.localeCompare(b.name));
  paymentTypesManaged = managed;
  cashTypeNames = new Set(paymentTypes.filter(type => type.counts_as_cash).map(type => type.name));
  cashTypeNames.add('Cash');
  typeOptionsCache.clear();
  return previousCash !== [...cashTypeNames].sort().join('|');
}

async function loadPaymentTypes() {
  const { data, error } = await supabase.from('payment_types').select('*').order('sort_order').order('name');
  if (error) return { managed: false, cashChanged: setPaymentTypes(DEFAULT_PAYMENT_TYPES, false) };
  return { managed: true, cashChanged: setPaymentTypes(data, true) };
}

// After the owner changes payment types: redraw the visible rows (new TYPE lists) and,
// if the "counts as cash" set changed, recalculate Available Cash from the database.
async function reloadPaymentTypes() {
  const { cashChanged } = await loadPaymentTypes();
  expenseSheet.refresh();
  receivedSheet.refresh();
  if (cashChanged) {
    invalidateCashSummaries();
    renderCashPosition();
    if (canView('cash_vault')) refreshCashSummary();
  }
}

async function updatePaymentType(name, changes) {
  const { data, error } = await supabase.from('payment_types').update(changes).eq('name', name).select('name');
  if (error) throw error;
  if (!data?.length) throw new Error('Only the owner can change payment types.');
  await reloadPaymentTypes();
}

async function addPaymentType(name) {
  const order = paymentTypes.reduce((max, type) => Math.max(max, type.sort_order ?? 0), 0) + 1;
  const { error } = await supabase.from('payment_types')
    .insert({ name, counts_as_cash: false, use_in_expenses: true, use_in_received: true, sort_order: order });
  if (error) throw error.code === '23505' ? new Error(`“${name}” already exists.`) : error;
  await reloadPaymentTypes();
}

async function deletePaymentType(name) {
  const { data, error } = await supabase.from('payment_types').delete().eq('name', name).select('name');
  if (error) throw error;
  if (!data?.length) throw new Error('This payment type could not be deleted.');
  await reloadPaymentTypes();
}

// <option> list for a TYPE cell: the types enabled for that ledger, plus the row's
// current type if it has since been unticked (so existing rows never change silently).
function typeOptionsHtml(ledger, value) {
  const current = value || 'Cash';
  const key = `${ledger}|${current}`;
  let html = typeOptionsCache.get(key);
  if (html) return html;
  const names = typesForLedger(ledger).map(type => type.name);
  if (!names.includes(current)) names.push(current);
  html = names.map(name => `<option value="${escapeHtml(name)}"${name === current ? ' selected' : ''}>${escapeHtml(name)}</option>`).join('');
  typeOptionsCache.set(key, html);
  return html;
}

// Pasted / imported type text -> the exact type name (case-insensitive), if allowed.
function canonicalType(ledger, text) {
  const wanted = String(text ?? '').trim().toLowerCase();
  if (!wanted) return null;
  const match = paymentTypes.find(type => type.name.toLowerCase() === wanted);
  if (!match) return null;
  return typesForLedger(ledger).some(type => type.name === match.name) ? match.name : null;
}
let rows = [];
let selectedClientId = null;
let expensesLoaded = false;
let expensesLoading = false;
let receivedRows = [];
let selectedReceivedClientId = null;
let receivedLoaded = false;
let receivedLoading = false;
let cashCounts = [];
let selectedCashClientId = null;
let cashVaultLoaded = false;
let cashVaultLoading = false;
let cashSummaryRequestId = 0;
let cashAvailableBalance = null;
let cashAvailableCents = null;
let cashPositionFrame = 0;
let summaryRefreshTimer = null;
let draggingClientId = null;
let cashPeople = [];
let cashPeopleViewDate = '';
let cashPeopleLoading = false;
let cashPeopleLoadPromise = null;
let editingCashPersonId = null;
const spreadsheetGrids = new Map();
let toastTimer;

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Edit window: only entries dated today and the previous (EDIT_WINDOW_DAYS - 1) days can be
// created, changed or deleted. The database enforces the same rule (migration 011).
const EDIT_WINDOW_DAYS = 3;
let lastLockToastAt = 0;

function editCutoffDate() {
  const date = new Date();
  date.setDate(date.getDate() - (EDIT_WINDOW_DAYS - 1));
  return localDateString(date);
}

function formatDmy(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value ?? '');
}

function isDateEditable(value) {
  return !value || String(value).slice(0, 10) >= editCutoffDate();
}

function isRowLocked(row, dateField) {
  return Boolean(row?.id) && !isDateEditable(row[dateField]);
}

function withEditWindow(text) {
  return `${text} · Editable from ${formatDmy(editCutoffDate())} (last ${EDIT_WINDOW_DAYS} days)`;
}

function warnLockedEdit(action = 'edit') {
  const now = Date.now();
  if (now - lastLockToastAt < 1200) return;
  lastLockToastAt = now;
  showToast(`Editing is not allowed for older entries. Only entries from the last ${EDIT_WINDOW_DAYS} days (${formatDmy(editCutoffDate())} onward) can be ${action === 'delete' ? 'deleted' : 'changed'}. This entry is locked.`, true);
}

function warnOldDate() {
  showToast(`Entries cannot be dated before ${formatDmy(editCutoffDate())}. Editing is not allowed for older dates (last ${EDIT_WINDOW_DAYS} days only).`, true);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3200);
}

function setSheetStatus(message, state = 'normal') {
  setText(sheetStatus, message);
  sheetStatus.classList.toggle('dirty', state === 'dirty');
  sheetStatus.classList.toggle('error', state === 'error');
}

function calculateTotal(row, amountFields = AMOUNT_FIELDS) {
  return amountFields.reduce((sum, field) => {
    const value = Number(row[field]);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
}

function formatAmount(value) {
  return calculateAmount(value).toFixed(2);
}

// Expenses / Received: zero is shown as an empty cell.
function formatBlankIfZero(value) {
  const numeric = calculateAmount(value);
  return Math.abs(numeric) < 0.005 ? '' : numeric.toFixed(2);
}

function calculateAmount(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatCashMoney(value) {
  const numeric = Number(value);
  return new Intl.NumberFormat('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

function formatSignedCashAdjustment(value) {
  const numeric = Number(value);
  const safe = Number.isFinite(numeric) ? numeric : 0;
  if (safe > 0.0001) return `+${formatCashMoney(safe)}`;
  if (safe < -0.0001) return `−${formatCashMoney(Math.abs(safe))}`;
  return formatCashMoney(0);
}

function calculateCashCountCents(row) {
  return CASH_DENOMINATIONS.reduce((sum, denomination) => {
    const raw = row[denomination.field];
    const quantity = raw === '' || raw == null ? 0 : Number(raw);
    return sum + (Number.isFinite(quantity) ? Math.round(quantity * denomination.cents) : 0);
  }, 0);
}

function makeEmptyCashCountRow(countDate = localDateString()) {
  const row = {
    clientId: crypto.randomUUID(),
    id: null,
    count_date: countDate,
    _dirty: true,
    _isNew: true
  };
  CASH_QUANTITY_FIELDS.forEach(field => { row[field] = ''; });
  return row;
}

function formatDateLabel(value) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

// The date box in the top bar is the working date for the whole app.
function workDate() {
  return el('cashAsOfDate').value || localDateString();
}

// ---------------------------------------------------------------------------
// Blank rows and automatic background saving
// ---------------------------------------------------------------------------
// Every change is kept in this browser's local storage at once (so nothing is lost if
// the page closes) and written to the database in the background a moment after you
// stop typing. There is no Save button: the indicator in the top bar shows the state.
const AUTOSAVE_DELAY_MS = 450;
const LOCAL_PERSIST_DELAY_MS = 200;
const RETRY_DELAYS_MS = [2000, 5000, 15000, 30000, 60000];
const UNSYNCED_TEXT = 'Saving…';
let persistTimer = null;
let autosaveTimer = null;
let retryTimer = null;
let retryAttempt = 0;
let syncPromise = null;
let syncAgain = false;
let lastSyncError = '';
let lastErrorToast = '';
let indicatorFrame = 0;
let restoredCount = 0;
const saveState = { expenses: false, received: false, cash: false };
let bulkTypeInFlight = 0; // "Change type" bulk requests on their way to the database

function setText(node, text) {
  if (node && node.textContent !== text) node.textContent = text;
}

function isBlankExpenseRow(row) {
  return !row.id
    && !String(row.supplier ?? '').trim()
    && !String(row.spent_by ?? '').trim()
    && !String(row.invoice_number ?? '').trim()
    && (!row.trn_number || row.trn_number === '---')
    && AMOUNT_FIELDS.every(field => !Number(row[field]));
}

function isBlankReceivedRow(row) {
  return !row.id
    && !String(row.name ?? '').trim()
    && !String(row.merchant ?? '').trim()
    && RECEIVING_AMOUNT_FIELDS.every(field => !Number(row[field]));
}

function recordCountText(list, isBlank) {
  let count = 0;
  for (let index = 0; index < list.length; index += 1) if (!isBlank(list[index])) count += 1;
  return `${count} ${count === 1 ? 'record' : 'records'}`;
}

function isBlankCashRow(row) {
  return !row.id && CASH_QUANTITY_FIELDS.every(field => !Number(row[field]));
}

function pendingChangeCount() {
  let count = 0;
  for (const row of rows) if (row._dirty && !row._bulk && !isBlankExpenseRow(row)) count += 1;
  for (const row of receivedRows) if (row._dirty && !row._bulk && !isBlankReceivedRow(row)) count += 1;
  for (const row of cashCounts) if (row._dirty && !isBlankCashRow(row)) count += 1;
  return count;
}

function updateSyncIndicator() {
  indicatorFrame = 0;
  const node = el('syncStatus');
  if (!node) return;
  let state;
  let text;
  let title;
  const pending = canWrite ? pendingChangeCount() : 0;
  if (!canWrite) {
    state = 'readonly'; text = 'View only'; title = 'This access key can view records but not change them.';
  } else if (pending && lastSyncError && !syncPromise) {
    const offline = navigator.onLine === false;
    state = offline ? 'offline' : 'error';
    text = offline ? 'Offline · kept on this device' : 'Not saved yet · retrying';
    title = `${lastSyncError} ${pending} ${pending === 1 ? 'change is' : 'changes are'} kept safely on this device and will be saved automatically.`;
  } else if (pending || syncPromise || bulkTypeInFlight) {
    state = 'saving'; text = 'Saving…'; title = 'Your changes are being saved to the database in the background.';
  } else {
    state = 'saved'; text = 'All changes saved'; title = 'Every change is saved to the database automatically.';
  }
  if (node.dataset.state !== state) node.dataset.state = state;
  setText(node, text);
  if (node.title !== title) node.title = title;
}

// Coalesces many rapid updates (every keystroke) into one cheap update per frame.
function updateSyncIndicatorSoon() {
  if (indicatorFrame) return;
  indicatorFrame = requestAnimationFrame(updateSyncIndicator);
}

// ---- Local storage (outbox) -------------------------------------------------
function pendingStorageKey() {
  const id = currentUser?.id ?? currentUser?.key_id ?? currentUser?.user_id ?? currentUser?.role ?? 'user';
  return `expense-vault:pending:v1:${id}`;
}

function readPendingStore() {
  try {
    const raw = localStorage.getItem(pendingStorageKey());
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

// Writes only the rows that still need syncing. A sheet that has not been loaded yet
// keeps whatever was stored for it, so nothing is lost before it is merged back in.
function persistPendingLocally() {
  clearTimeout(persistTimer);
  persistTimer = null;
  if (!currentUser) return;
  const previous = readPendingStore() || {};
  const pick = (loaded, list, isBlank, fallback) => (loaded ? list.filter(row => row._dirty && !isBlank(row)) : (fallback || []));
  const data = {
    expenses: pick(expensesLoaded, rows, isBlankExpenseRow, previous.expenses),
    received: pick(receivedLoaded, receivedRows, isBlankReceivedRow, previous.received),
    cash: pick(cashVaultLoaded, cashCounts, isBlankCashRow, previous.cash)
  };
  try {
    if (!data.expenses.length && !data.received.length && !data.cash.length) {
      localStorage.removeItem(pendingStorageKey());
    } else {
      localStorage.setItem(pendingStorageKey(), JSON.stringify({ v: 1, savedAt: Date.now(), ...data }));
    }
  } catch (_) { /* storage full or blocked: the changes simply stay in memory */ }
}

function scheduleLocalPersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persistPendingLocally, LOCAL_PERSIST_DELAY_MS);
}

// Puts unsynced rows kept on this device back into a freshly loaded sheet.
function mergePendingFromStorage(kind, list) {
  const stored = readPendingStore()?.[kind];
  if (!Array.isArray(stored) || !stored.length) return 0;
  let merged = 0;
  stored.forEach(item => {
    if (!item || typeof item !== 'object') return;
    if (item.id) {
      const index = list.findIndex(row => row.id === item.id);
      if (index < 0) return; // deleted elsewhere
      // _base stays the database version, so Available Cash counts the change once.
      list[index] = { ...item, clientId: list[index].clientId, _base: list[index]._base ?? null, _dirty: true, _isNew: false };
      merged += 1;
    } else if (item.clientId && !list.some(row => row.clientId === item.clientId)) {
      list.push({ ...item, id: null, _base: null, _dirty: true, _isNew: true });
      merged += 1;
    }
  });
  restoredCount += merged;
  return merged;
}

function announceRestoredChanges() {
  if (!restoredCount) return;
  const count = restoredCount;
  restoredCount = 0;
  showToast(`Restored ${count} unsaved ${count === 1 ? 'change' : 'changes'} from this device. Saving now…`);
  requestSync(800);
}

// ---- Serialised database writes -----------------------------------------------
// Every ledger write (and every Available Cash query) runs one after another. This
// keeps the Available Cash figure exact: a summary always reflects exactly the
// writes that finished before it started.
let ledgerQueue = Promise.resolve();

function runLedgerTask(task) {
  const run = ledgerQueue.then(task, task);
  ledgerQueue = run.catch(() => {});
  return run;
}

// ---- Local Available Cash ---------------------------------------------------------
// The database summary is the starting point. Changes that have been saved since that
// summary (commits) and changes still being typed / saved (dirty rows) are applied on
// top of it in the browser, so Available Cash and the difference update instantly.
let ledgerVersion = 0;
let ledgerCommits = [];
const cashSummaryCache = new Map(); // as-of date -> summary from the database
let cashSummaryError = null;

function toCents(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0;
}

function ledgerSnapshot(row, amountFields) {
  if (!row) return null;
  let cents = 0;
  for (const field of amountFields) cents += toCents(row[field]);
  return {
    date: String(row.entry_date || localDateString()).slice(0, 10),
    type: row.transaction_type || 'Cash',
    cents
  };
}

function snapshotContribution(snapshot, asOf) {
  return snapshot && cashTypeNames.has(snapshot.type) && snapshot.date <= asOf ? snapshot.cents : 0;
}

function recordLedgerCommit(kind, before, after) {
  ledgerVersion += 1;
  ledgerCommits.push({ version: ledgerVersion, kind, before, after });
}

function pruneLedgerCommits() {
  if (!cashSummaryCache.size) { ledgerCommits = []; return; }
  let oldest = Infinity;
  cashSummaryCache.forEach(summary => { oldest = Math.min(oldest, summary.version); });
  ledgerCommits = ledgerCommits.filter(commit => commit.version > oldest);
}

function computeCashPosition(asOf = workDate()) {
  const summary = cashSummaryCache.get(asOf);
  if (!summary) return null;
  let received = summary.receivedCents;
  let expense = summary.expenseCents;
  for (const commit of ledgerCommits) {
    if (commit.version <= summary.version) continue;
    const delta = snapshotContribution(commit.after, asOf) - snapshotContribution(commit.before, asOf);
    if (commit.kind === 'received') received += delta; else expense += delta;
  }
  for (const row of receivedRows) {
    if (!row._dirty) continue;
    received += snapshotContribution(ledgerSnapshot(row, RECEIVING_AMOUNT_FIELDS), asOf) - snapshotContribution(row._base, asOf);
  }
  for (const row of rows) {
    if (!row._dirty) continue;
    expense += snapshotContribution(ledgerSnapshot(row, AMOUNT_FIELDS), asOf) - snapshotContribution(row._base, asOf);
  }
  const people = summary.peopleGivenCents - summary.peopleReceivedCents;
  return { received, expense, people, available: received - expense - people };
}

// ---- Syncing ----------------------------------------------------------------
// Called after every edit: instant local save + a background save shortly after.
function scheduleAutosave(key) {
  if (!canWrite || !key) return;
  scheduleLocalPersist();
  requestSync();
  updateSyncIndicatorSoon();
  scheduleCashPositionRender();
}

function requestSync(delay = AUTOSAVE_DELAY_MS) {
  if (!canWrite) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => { autosaveTimer = null; syncAll(); }, delay);
}

async function syncAll() {
  const none = { saved: 0, failures: [] };
  if (!canWrite) return none;
  if (syncPromise) { syncAgain = true; return syncPromise; }
  clearTimeout(autosaveTimer);
  autosaveTimer = null;
  clearTimeout(retryTimer);
  retryTimer = null;
  if (pendingChangeCount() === 0) { persistPendingLocally(); updateSyncIndicator(); return none; }

  let ledgerSaved = 0;
  syncPromise = (async () => {
    let saved = 0;
    const failures = [];
    do {
      syncAgain = false;
      if (pendingChangeCount() === 0) break;
      const results = [await saveChanges(), await saveReceivedChanges(), await saveCashCountChanges()];
      ledgerSaved += results[0].saved + results[1].saved;
      results.forEach(item => { saved += item.saved; failures.push(...item.failures); });
      persistPendingLocally();
    } while (syncAgain && !failures.length);
    return { saved, failures };
  })();
  updateSyncIndicatorSoon();

  let result = none;
  try {
    result = await syncPromise;
  } catch (error) {
    result = { saved: 0, failures: [error?.message || 'Unknown save error'] };
  } finally {
    syncPromise = null;
  }
  persistPendingLocally();

  if (result.failures.length) {
    lastSyncError = result.failures[0];
    const delay = RETRY_DELAYS_MS[Math.min(retryAttempt, RETRY_DELAYS_MS.length - 1)];
    retryAttempt += 1;
    retryTimer = setTimeout(() => { retryTimer = null; syncAll(); }, delay);
    if (lastErrorToast !== lastSyncError) {
      lastErrorToast = lastSyncError;
      showToast(`Not saved yet: ${lastSyncError} Your changes are kept on this device and will be retried automatically.`, true);
    }
  } else {
    lastSyncError = '';
    lastErrorToast = '';
    retryAttempt = 0;
    if (pendingChangeCount() > 0) requestSync();
  }
  // Keep the database summary fresh in the background; the local figure is already exact.
  if (ledgerSaved) scheduleSummaryRefresh();
  updateSyncIndicator();
  return result;
}

// One empty row is always kept at the bottom of Expenses and Received, dated with the
// working date. Typing into it makes the next empty row appear.
function addTrailingBlankExpenseRow() {
  if (!canEdit('expenses') || !isDateEditable(workDate())) return null;
  const last = rows[rows.length - 1];
  if (last && isBlankExpenseRow(last)) return null;
  const row = makeEmptyRow();
  row._dirty = false;
  rows.push(row);
  return row;
}

function addTrailingBlankReceivedRow() {
  if (!canEdit('received') || !isDateEditable(workDate())) return null;
  const last = receivedRows[receivedRows.length - 1];
  if (last && isBlankReceivedRow(last)) return null;
  const row = makeEmptyReceivedRow();
  row._dirty = false;
  receivedRows.push(row);
  return row;
}

function appendTrailingExpenseRow() {
  const row = addTrailingBlankExpenseRow();
  if (!row) return null;
  expenseSheet.sync();
  setText(el('recordCount'), recordCountText(rows, isBlankExpenseRow));
  return row;
}

function appendTrailingReceivedRow() {
  const row = addTrailingBlankReceivedRow();
  if (!row) return null;
  receivedSheet.sync();
  setText(el('receivedRecordCount'), recordCountText(receivedRows, isBlankReceivedRow));
  return row;
}

// When the working date changes, the waiting empty rows take the new date.
function syncTrailingBlankRows() {
  const pairs = [
    { list: rows, sheet: expenseSheet, blank: isBlankExpenseRow, loaded: expensesLoaded, append: appendTrailingExpenseRow, count: 'recordCount' },
    { list: receivedRows, sheet: receivedSheet, blank: isBlankReceivedRow, loaded: receivedLoaded, append: appendTrailingReceivedRow, count: 'receivedRecordCount' }
  ];
  pairs.forEach(({ list, sheet, blank, loaded, append, count }) => {
    if (!loaded) return;
    const last = list[list.length - 1];
    if (last && blank(last)) {
      if (isDateEditable(workDate())) {
        last.entry_date = workDate();
        const input = sheet.rowElement(list.length - 1)?.querySelector('input[data-field="entry_date"]');
        if (input) input.value = last.entry_date;
      } else {
        list.pop();
        sheet.sync();
        setText(el(count), recordCountText(list, blank));
      }
    } else {
      append();
    }
  });
}

// ---- RTA receipt import -------------------------------------------------------
// Used by receipt-import.js. Expenses must be fully loaded first so duplicate
// receipts are detected against every existing row.
async function ensureExpensesLoaded() {
  if (!expensesLoaded && !expensesLoading) await loadExpenses();
  while (expensesLoading) await new Promise(resolve => setTimeout(resolve, 100));
  if (!expensesLoaded) throw new Error('Expenses could not be loaded. Check the connection and try again.');
}

function existingInvoiceNumbers() {
  const references = new Set();
  rows.forEach(row => {
    const value = String(row.invoice_number ?? '').trim();
    if (value) references.add(value);
  });
  return references;
}

// Adds imported entries above the empty row at the bottom of Expenses. They are new,
// unsaved rows exactly like typed ones, so they save automatically in the background
// (and Cash entries update Available Cash; Bank entries do not).
function addExpenseEntries(entries) {
  if (!canEdit('expenses') || !entries.length) return 0;
  const last = rows[rows.length - 1];
  const trailing = last && isBlankExpenseRow(last) ? rows.pop() : null;
  entries.forEach(entry => {
    const row = makeEmptyRow();
    row.entry_date = entry.entry_date;
    row.supplier = entry.supplier || '';
    row.spent_by = entry.spent_by || '';
    row.invoice_number = entry.invoice_number || '';
    row.transaction_type = canonicalType('expenses', entry.transaction_type) || 'Cash';
    Object.entries(entry.amounts || {}).forEach(([field, cents]) => {
      if (AMOUNT_FIELDS.includes(field) && cents) row[field] = (cents / 100).toFixed(2);
    });
    rows.push(row);
  });
  if (trailing) rows.push(trailing);
  selectedClientId = null;
  renderTable();
  setActiveTab('expenses');
  scrollSheetToBottom(table);
  setSheetStatus(UNSYNCED_TEXT, 'dirty');
  scheduleAutosave('expenses');
  return entries.length;
}

function focusTrailingRow(tableElement, list, selectSetter) {
  const last = list[list.length - 1];
  if (!last) return;
  selectSetter(last.clientId);
  tableElement.querySelectorAll('tbody tr.selected').forEach(tr => tr.classList.remove('selected'));
  const sheet = sheetFor(tableElement);
  sheet?.scrollToBottom();
  sheet?.rowElement(list.length - 1)?.classList.add('selected');
  spreadsheetGrids.get(tableElement)?.startEditing(list.length - 1, 0);
}

function warnOldWorkDate() {
  showToast(`The selected date (${formatDmy(workDate())}) is older than the ${EDIT_WINDOW_DAYS}-day edit window, so new entries can't be added. Choose ${formatDmy(editCutoffDate())} or later in the Date box at the top.`, true);
}

function syncCashDateControls() {
  const selectedDate = workDate();
  const dates = recentDateOptions();
  el('cashRecentDates').innerHTML = dates.map(date => `<option value="${date}"></option>`).join('');
  el('cashCountDateLabel').textContent = `Selected date: ${formatDateLabel(selectedDate)}`;
}

function setCashVaultStatus(message, state = 'normal') {
  setText(cashVaultStatus, message);
  cashVaultStatus.classList.toggle('dirty', state === 'dirty');
  cashVaultStatus.classList.toggle('error', state === 'error');
}

function buildCashTableHeader() {
  cashHeaderRow.innerHTML = '';
  CASH_COUNT_COLUMNS.forEach(column => {
    const th = document.createElement('th');
    th.textContent = column.label;
    th.style.width = `${column.width}px`;
    th.style.minWidth = `${column.width}px`;
    if (column.kind === 'date') th.classList.add('date-cell');
    if (column.kind === 'total') th.classList.add('cash-total-heading');
    cashHeaderRow.appendChild(th);
  });
}

function makeEmptyRow() {
  const row = {
    clientId: crypto.randomUUID(),
    id: null,
    entry_date: workDate(),
    supplier: '',
    trn_number: '---',
    spent_by: '',
    invoice_number: '',
    transaction_type: 'Cash',
    _dirty: true,
    _isNew: true
  };
  AMOUNT_FIELDS.forEach(field => { row[field] = ''; });
  return row;
}

function makeEmptyReceivedRow() {
  const row = {
    clientId: crypto.randomUUID(),
    id: null,
    entry_date: workDate(),
    name: '',
    transaction_type: 'Cash',
    merchant: '',
    _dirty: true,
    _isNew: true
  };
  RECEIVING_AMOUNT_FIELDS.forEach(field => { row[field] = ''; });
  return row;
}

const TAB_SECTION = { 'cash-vault': 'cash_vault', expenses: 'expenses', received: 'received' };

function firstVisibleTab() {
  return ['cash-vault', 'expenses', 'received'].find(tab => canView(TAB_SECTION[tab])) || 'cash-vault';
}

// Hides the tabs (and buttons) the signed-in user has no access to.
function applySectionVisibility() {
  document.querySelectorAll('.tab-button').forEach(button => {
    button.classList.toggle('hidden', !canView(TAB_SECTION[button.dataset.tab]));
  });
  el('exportExcelButton').classList.toggle('hidden', !permissions.export);
  el('cashPeopleButton').classList.toggle('hidden', !canView('cash_vault'));
}

function setActiveTab(tabName) {
  if (!canView(TAB_SECTION[tabName])) tabName = firstVisibleTab();
  clearAllSpreadsheetSelections();
  document.querySelectorAll('.tab-button').forEach(button => {
    button.classList.toggle('active', button.dataset.tab === tabName);
  });
  el('cashVaultPane').classList.toggle('hidden', tabName !== 'cash-vault');
  el('expensesPane').classList.toggle('hidden', tabName !== 'expenses');
  el('receivedPane').classList.toggle('hidden', tabName !== 'received');
  if (tabName === 'cash-vault') {
    if (!cashVaultLoaded && !cashVaultLoading) loadCashVault();
    else if (cashVaultLoaded) { renderCashPosition(); refreshCashSummary(); }
  }
  if (tabName === 'expenses' && !expensesLoaded && !expensesLoading) loadExpenses();
  if (tabName === 'received' && !receivedLoaded && !receivedLoading) loadReceived();
}

function buildTableHeader() {
  headerRow.innerHTML = '';
  COLUMNS.forEach(column => {
    const th = document.createElement('th');
    th.textContent = column.label;
    th.style.width = `${(column.width / COLUMN_WEIGHT_TOTAL * 100).toFixed(3)}%`;
    if (column.kind === 'date') th.classList.add('date-cell');
    headerRow.appendChild(th);
  });
}

function recentDateOptions() {
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - index);
    return localDateString(date);
  });
}

// Rows that cannot be edited (older than the edit window, or a view-only key) are
// drawn as plain text: far lighter than disabled inputs, so scrolling stays smooth.
function readOnlyCell(kind, text) {
  return `<span class="cell-text cell-${kind}">${escapeHtml(text)}</span>`;
}

function renderCell(row, column, amountFields = AMOUNT_FIELDS) {
  const value = row[column.field] ?? '';
  const ledger = amountFields === RECEIVING_AMOUNT_FIELDS ? 'received' : 'expenses';
  const editable = canEdit(ledger) && !isRowLocked(row, 'entry_date');
  if (!editable) {
    if (column.kind === 'total') return readOnlyCell('total', formatBlankIfZero(calculateTotal(row, amountFields)));
    if (column.kind === 'select') return readOnlyCell('select', value || 'Cash');
    if (column.kind === 'date') return readOnlyCell('date', formatDmy(value || localDateString()));
    if (column.kind === 'amount') return readOnlyCell('amount', value !== '' && value != null && Number(value) === 0 ? '' : String(value));
    return readOnlyCell('text', String(value) || (column.field === 'trn_number' ? '---' : ''));
  }
  const disabled = '';
  if (column.kind === 'total') {
    return `<input class="cell-input total-cell" type="text" value="${formatBlankIfZero(calculateTotal(row, amountFields))}" readonly tabindex="-1" aria-label="Calculated row total">`;
  }
  if (column.kind === 'select') {
    return `<select class="cell-input" data-field="${column.field}" ${disabled} aria-label="${column.label}">${typeOptionsHtml(ledger, value)}</select>`;
  }
  if (column.kind === 'date') {
    return `<input class="cell-input" type="date" list="recentDates" data-field="${column.field}" value="${escapeHtml(value || localDateString())}" ${disabled} aria-label="${column.label}">`;
  }
  if (column.kind === 'amount') {
    const shown = value !== '' && value != null && Number(value) === 0 ? '' : value;
    return `<input class="cell-input amount-cell" type="number" inputmode="decimal" step="0.01" data-field="${column.field}" value="${escapeHtml(shown)}" ${disabled} aria-label="${column.label}">`;
  }
  const placeholder = column.field === 'trn_number' ? '---' : '';
  return `<input class="cell-input" type="text" maxlength="120" data-field="${column.field}" value="${escapeHtml(value)}" placeholder="${placeholder}" ${disabled} aria-label="${column.label}">`;
}

function buildReceivingTableHeader() {
  receivedHeaderRow.innerHTML = '';
  RECEIVING_COLUMNS.forEach(column => {
    const th = document.createElement('th');
    th.textContent = column.label;
    th.style.width = `${column.width}px`;
    th.style.minWidth = `${column.width}px`;
    if (column.kind === 'date') th.classList.add('date-cell');
    receivedHeaderRow.appendChild(th);
  });
}

function renderCashCountCell(row, column) {
  const value = row[column.field] ?? '';
  if (!canEdit('cash_vault') || isRowLocked(row, 'count_date')) {
    if (column.kind === 'total') return readOnlyCell('total', formatCashMoney(calculateCashCountCents(row) / 100));
    if (column.kind === 'date') return readOnlyCell('date', formatDmy(value || localDateString()));
    return readOnlyCell('quantity', String(value));
  }
  const disabled = '';
  if (column.kind === 'total') {
    return `<input class="cell-input total-cell cash-row-total" type="text" value="${formatCashMoney(calculateCashCountCents(row) / 100)}" readonly tabindex="-1" aria-label="Calculated cash count total">`;
  }
  if (column.kind === 'date') {
    return `<input class="cell-input cash-date-cell" type="date" list="cashRecentDates" data-field="${column.field}" value="${escapeHtml(value || localDateString())}" ${disabled} aria-label="Count date">`;
  }
  return `<input class="cell-input quantity-cell" type="number" inputmode="numeric" min="0" max="2147483647" step="1" data-field="${column.field}" value="${escapeHtml(value)}" ${disabled} aria-label="Number of ${column.label} notes or coins">`;
}

function updateCashCountToolbar() {
  updateSyncIndicatorSoon();
  cashAddButton.disabled = !canEdit('cash_vault');
  cashDeleteButton.disabled = !canEdit('cash_vault') || !selectedCashClientId;
  setText(el('cashVaultPermissionNote'), accessNoteText('cash_vault'));
}

function updateCashCountedSummary() {
  const selectedDate = workDate();
  const row = cashCounts.find(item => item.count_date === selectedDate);
  const cents = row ? calculateCashCountCents(row) : 0;
  setText(el('cashCountedValue'), formatCashMoney(cents / 100));
  setText(el('cashCountedNote'), row
    ? `Physical notes and coins counted on ${formatDateLabel(selectedDate)}`
    : `No physical count for ${formatDateLabel(selectedDate)}`);
  updateCashReconciliation(row, cents);
}

// Recalculated on every keystroke from the figures on screen (no save needed).
// All arithmetic is in whole fils (cents) so the difference is never off by rounding.
function updateCashReconciliation(row, countedCents) {
  const banner = el('cashReconciliationBanner');
  const balanceCard = document.querySelector('.cash-balance-card');
  const countedCard = document.querySelector('.cash-counted-card');
  const balanceValue = el('cashBalanceValue');
  const countedValue = el('cashCountedValue');
  let state = 'needs-count';
  let title;
  let value = '—';
  let note;

  if (cashAvailableCents == null) {
    title = cashSummaryError ? 'Cash reconciliation unavailable' : 'Calculating cash position…';
    note = cashSummaryError ? 'The ledger balance could not be loaded.' : 'Loading the ledger balance for the selected date.';
  } else if (!row) {
    title = 'Physical cash count required';
    note = 'Enter the selected date’s notes and coins below to compare them with Available Cash.';
  } else {
    const differenceCents = countedCents - cashAvailableCents;
    if (differenceCents === 0) {
      state = 'variance-match';
      title = 'Cash balanced';
      value = formatCashMoney(0);
      note = 'Available Cash and Cash Counted match for the selected date.';
    } else {
      state = 'variance-alert';
      title = differenceCents > 0 ? 'Physical cash is higher than the ledger' : 'Physical cash is lower than the ledger';
      value = `${differenceCents > 0 ? '+' : '−'}${formatCashMoney(Math.abs(differenceCents) / 100)}`;
      note = 'Difference between Cash Counted and Available Cash. Both figures are highlighted until reconciled.';
    }
  }

  if (banner.dataset.state !== state) {
    banner.dataset.state = state;
    [banner, balanceCard, countedCard, balanceValue, countedValue].forEach(node => {
      node?.classList.remove('variance-alert', 'variance-match', 'needs-count');
    });
    banner.classList.add(state);
    if (state !== 'needs-count') {
      balanceCard.classList.add(state);
      countedCard.classList.add(state);
    }
    if (state === 'variance-alert') {
      balanceValue.classList.add('variance-alert');
      countedValue.classList.add('variance-alert');
    }
  }
  setText(el('cashReconciliationTitle'), title);
  setText(el('cashVarianceValue'), value);
  setText(el('cashVarianceNote'), note);
}

// Classes shared by every sheet row. Zebra striping is by model index (not
// :nth-child) because only the visible rows are rendered.
function rowClassName(row, rowIndex, selectedId, dateField) {
  let className = rowIndex % 2 ? 'zebra' : '';
  if (row.clientId === selectedId) className += ' selected';
  if (row._dirty) className += ' dirty-row';
  if (isRowLocked(row, dateField)) className += ' locked-row';
  if (row.clientId === draggingClientId) className += ' row-dragging';
  return className.trim();
}

function buildCashCountRow(row, rowIndex) {
  const tr = document.createElement('tr');
  tr.dataset.clientId = row.clientId;
  tr.dataset.rowIndex = String(rowIndex);
  tr.className = rowClassName(row, rowIndex, selectedCashClientId, 'count_date');
  if (row.count_date === workDate()) tr.classList.add('cash-current-date');
  tr.innerHTML = CASH_COUNT_COLUMNS.map((column, colIndex) => `<td data-row-index="${rowIndex}" data-col-index="${colIndex}">${renderCashCountCell(row, column)}</td>`).join('');
  return tr;
}

function renderCashCounts() {
  scheduleLocalPersist();
  resetSheetSelection(el('cashCountTable'));
  cashSheet.refresh();
  setText(el('cashVaultDateCount'), `${cashCounts.length} ${cashCounts.length === 1 ? 'daily count' : 'daily counts'}`);
  updateCashCountedSummary();
  updateCashCountToolbar();
}

function selectCashCountRow(clientId) {
  selectedCashClientId = clientId;
  const row = cashCounts.find(item => item.clientId === clientId);
  if (row?.count_date && el('cashAsOfDate').value !== row.count_date) {
    el('cashAsOfDate').value = row.count_date;
    syncCashDateControls();
    refreshCashSummary();
  }
  const selectedDate = workDate();
  cashTableBody.querySelectorAll('tr[data-client-id]').forEach(tr => {
    tr.classList.toggle('selected', tr.dataset.clientId === clientId);
    const model = cashCounts[Number(tr.dataset.rowIndex)];
    tr.classList.toggle('cash-current-date', model?.count_date === selectedDate);
  });
  updateCashCountedSummary();
  updateCashCountToolbar();
}

function handleCashCountInput(event) {
  const fieldInput = event.target.closest('[data-field]');
  if (!fieldInput) return;
  const tr = fieldInput.closest('tr[data-client-id]');
  if (!tr) return;
  const row = cashCounts.find(item => item.clientId === tr.dataset.clientId);
  if (!row) return;
  const field = fieldInput.dataset.field;
  const nextValue = fieldInput.value;
  if (isRowLocked(row, 'count_date')) { fieldInput.value = row[field] ?? ''; warnLockedEdit(); return; }
  if (field === 'count_date' && nextValue && !isDateEditable(nextValue)) {
    fieldInput.value = row.count_date;
    warnOldDate();
    return;
  }
  if (field === 'count_date' && nextValue) {
    const duplicate = cashCounts.find(item => item.clientId !== row.clientId && item.count_date === nextValue);
    if (duplicate) {
      fieldInput.value = row.count_date;
      showToast(`A cash count already exists for ${formatDateLabel(nextValue)}. Edit that existing row instead.`, true);
      return;
    }
  }
  row[field] = nextValue;
  row._dirty = true;
  tr.classList.add('dirty-row');
  setCashVaultStatus(UNSYNCED_TEXT, 'dirty');
  const totalInput = tr.querySelector('.cash-row-total');
  if (totalInput) totalInput.value = formatCashMoney(calculateCashCountCents(row) / 100);
  if (field === 'count_date' && row.clientId === selectedCashClientId && row.count_date) {
    el('cashAsOfDate').value = row.count_date;
    onCashAsOfDateChange();
  } else {
    // Instant: Cash Counted and the difference follow every keystroke.
    updateCashCountedSummary();
  }
  tr.classList.toggle('cash-current-date', row.count_date === workDate());
  updateCashCountToolbar();
  scheduleAutosave('cash');
}

function getCashCountPayload(row) {
  const payload = { count_date: row.count_date };
  if (!payload.count_date || !/^\d{4}-\d{2}-\d{2}$/.test(payload.count_date)) {
    throw new Error('Please choose a valid date for this cash count.');
  }
  CASH_QUANTITY_FIELDS.forEach(field => {
    const raw = row[field];
    const quantity = raw === '' || raw == null ? 0 : Number(raw);
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 2147483647) {
      const label = CASH_DENOMINATIONS.find(item => item.field === field)?.label || field;
      throw new Error(`The quantity for ${label} must be a whole number of 0 or more.`);
    }
    payload[field] = quantity;
  });
  return payload;
}

function setCashSummaryCaption(selectedDate, ready) {
  setText(el('cashBalanceCaption'), ready
    ? `As of ${formatDateLabel(selectedDate)} · Received − Expenses − Staff balance`
    : `As of ${formatDateLabel(selectedDate)} · Cash ledger minus staff balances`);
}

// Paints Available Cash and its parts from the database summary plus every local
// change (saved or still saving), then the reconciliation. Runs on each keystroke.
function renderCashPosition() {
  cashPositionFrame = 0;
  const selectedDate = workDate();
  const position = computeCashPosition(selectedDate);
  const balanceValue = el('cashBalanceValue');
  if (!position) {
    cashAvailableCents = null;
    cashAvailableBalance = null;
    if (cashSummaryError) {
      setText(balanceValue, 'Unavailable');
      ['cashReceivedValue', 'cashExpensesValue', 'cashPeopleAdjustmentValue'].forEach(id => setText(el(id), '—'));
    } else {
      setText(balanceValue, '…');
    }
    balanceValue.classList.remove('negative');
    setCashSummaryCaption(selectedDate, false);
    updateCashCountedSummary();
    return;
  }
  cashAvailableCents = position.available;
  cashAvailableBalance = position.available / 100;
  setText(el('cashReceivedValue'), formatCashMoney(position.received / 100));
  setText(el('cashExpensesValue'), formatCashMoney(position.expense / 100));
  const people = el('cashPeopleAdjustmentValue');
  setText(people, formatSignedCashAdjustment(position.people / 100));
  people.classList.toggle('person-positive', position.people > 0);
  people.classList.toggle('person-negative', position.people < 0);
  setText(balanceValue, formatCashMoney(position.available / 100));
  balanceValue.classList.toggle('negative', position.available < 0);
  setCashSummaryCaption(selectedDate, true);
  updateCashCountedSummary();
}

function scheduleCashPositionRender() {
  if (cashPositionFrame) return;
  cashPositionFrame = requestAnimationFrame(renderCashPosition);
}

function scheduleSummaryRefresh(delay = 1200) {
  clearTimeout(summaryRefreshTimer);
  summaryRefreshTimer = setTimeout(() => { summaryRefreshTimer = null; refreshCashSummary(); }, delay);
}

// Fetches the database summary for the working date. It runs in the same queue as the
// ledger writes, so it reflects exactly the writes recorded before it (ledgerVersion).
async function refreshCashSummary() {
  if (!currentUser || !canView('cash_vault')) return;
  const selectedDate = workDate();
  const requestId = ++cashSummaryRequestId;
  renderCashPosition();
  const { data, error, version } = await runLedgerTask(async () => {
    const issuedAt = ledgerVersion;
    const response = await supabase.rpc('get_cash_vault_summary', { p_as_of: selectedDate });
    return { ...response, version: issuedAt };
  });
  if (!currentUser) return;
  if (error) {
    if (requestId !== cashSummaryRequestId) return;
    cashSummaryCache.delete(selectedDate);
    cashSummaryError = error;
    renderCashPosition();
    showToast(`Unable to calculate cash balance: ${explainLedgerError(error)}. Confirm migrations 005, 006, 008, 009, 010 and 011 have been applied.`, true);
    return;
  }
  const summary = Array.isArray(data) ? data[0] : data;
  const receivedCents = toCents(summary?.received_cash ?? 0);
  const expenseCents = toCents(summary?.expense_cash ?? 0);
  cashSummaryCache.delete(selectedDate);
  cashSummaryCache.set(selectedDate, {
    version,
    receivedCents,
    expenseCents,
    peopleGivenCents: toCents(summary?.person_cash_given ?? 0),
    peopleReceivedCents: toCents(summary?.person_cash_received ?? 0)
  });
  while (cashSummaryCache.size > 12) cashSummaryCache.delete(cashSummaryCache.keys().next().value);
  pruneLedgerCommits();
  if (requestId !== cashSummaryRequestId && selectedDate !== workDate()) return;
  cashSummaryError = null;
  renderCashPosition();
}

// Staff Balance entries change the people part of every later date.
function invalidateCashSummaries() {
  cashSummaryCache.clear();
  pruneLedgerCommits();
}

async function reloadCashCountRows() {
  const data = await fetchAllRows('cash_vault_counts', ['count_date', 'id']);

  persistPendingLocally();
  cashCounts = (data || []).map(record => ({
    ...record,
    clientId: record.id,
    _dirty: false,
    _isNew: false
  }));
  if (mergePendingFromStorage('cash', cashCounts)) {
    cashCounts.sort((a, b) => String(a.count_date).localeCompare(String(b.count_date)));
  }
  if (!cashCounts.some(row => row.clientId === selectedCashClientId)) selectedCashClientId = null;
  renderCashCounts();
  return cashCounts;
}

async function loadCashVault() {
  if (!currentUser || cashVaultLoading || !canView('cash_vault')) return;
  cashVaultLoading = true;
  cashAddButton.disabled = true;
  setCashVaultStatus('Loading daily cash counts…');
  if (!el('cashAsOfDate').value) el('cashAsOfDate').value = localDateString();
  syncCashDateControls();
  // The balance and the counts load at the same time.
  refreshCashSummary();

  try {
    await reloadCashCountRows();
    scrollSheetToBottom(el('cashCountTable'));
    cashVaultLoaded = true;
    announceRestoredChanges();
    cashVaultLoading = false;
    cashAddButton.disabled = !canEdit('cash_vault');
    const hasDirty = cashCounts.some(row => row._dirty && !isBlankCashRow(row));
    setCashVaultStatus(hasDirty ? UNSYNCED_TEXT : 'All changes saved', hasDirty ? 'dirty' : 'normal');
    updateSyncIndicatorSoon();
  } catch (error) {
    cashVaultLoading = false;
    cashAddButton.disabled = !canEdit('cash_vault');
    setCashVaultStatus('Could not load cash counts', 'error');
    showToast(`Unable to load Cash Vault counts: ${explainLedgerError(error)}. Apply migration 005 if it has not been run.`, true);
  }
}

async function saveCashCountChanges() {
  const none = { saved: 0, failures: [] };
  if (!canEdit('cash_vault') || saveState.cash) return none;
  const dirtyRows = cashCounts.filter(row => row._dirty && !isBlankCashRow(row));
  if (!dirtyRows.length) { updateCashCountToolbar(); return none; }
  saveState.cash = true;
  setCashVaultStatus('Saving…', 'dirty');
  let saved = 0;
  const failures = [];

  await runLedgerTask(async () => {
    for (const row of dirtyRows) {
      if (!cashCounts.includes(row)) continue; // deleted while waiting
      try {
        const payload = getCashCountPayload(row);
        const before = JSON.stringify(payload);
        let result;
        if (row.id) {
          // Optimistic lock: a stale browser tab cannot overwrite a newer change.
          result = await supabase.from('cash_vault_counts')
            .update(payload)
            .eq('id', row.id)
            .eq('updated_at', row.updated_at)
            .select('*')
            .maybeSingle();
        } else {
          result = await supabase.from('cash_vault_counts').insert(payload).select('*').single();
        }
        if (result.error) {
          if (result.error.code === '23505') {
            throw new Error('A cash count already exists for this date. Edit the existing date row instead.');
          }
          throw result.error;
        }
        if (!result.data) {
          throw new Error('This cash count was changed by another user or browser session after you opened it. Your changes were not saved. Refresh the page, load the latest count, and reapply your correction.');
        }
        Object.assign(row, { id: result.data.id, created_at: result.data.created_at, updated_at: result.data.updated_at, _isNew: false });
        let after = null;
        try { after = JSON.stringify(getCashCountPayload(row)); } catch (_) { /* keep dirty */ }
        row._dirty = after !== before;
        cashTableBody.querySelector(`tr[data-client-id="${CSS.escape(row.clientId)}"]`)?.classList.toggle('dirty-row', row._dirty);
        saved++;
      } catch (error) {
        failures.push(error.message || 'Unknown save error');
        row._dirty = true;
      }
    }
  });

  saveState.cash = false;
  updateCashCountToolbar();
  updateCashCountedSummary();
  if (failures.length) {
    setCashVaultStatus(`${saved} saved · ${failures.length} not saved yet`, 'error');
  } else if (cashCounts.some(row => row._dirty && !isBlankCashRow(row))) {
    setCashVaultStatus(UNSYNCED_TEXT, 'dirty');
    requestSync();
  } else {
    setCashVaultStatus('All changes saved');
  }
  return { saved, failures };
}

async function deleteSelectedCashCount() {
  if (!canEdit('cash_vault') || !selectedCashClientId) return;
  const row = cashCounts.find(item => item.clientId === selectedCashClientId);
  if (!row) return;
  if (isRowLocked(row, 'count_date')) { warnLockedEdit('delete'); return; }
  if (!window.confirm(`Delete the cash count for ${formatDateLabel(row.count_date)}? This cannot be undone.`)) return;
  cashDeleteButton.disabled = true;
  // Waits for any save of this row that is already on its way, then deletes it.
  const failure = await runLedgerTask(async () => {
    if (!row.id) return null;
    const { data, error } = await supabase.from('cash_vault_counts').delete().eq('id', row.id).select('id');
    if (error || !data?.length) return error?.message || 'The cash count could not be deleted. Check your access permission.';
    return null;
  });
  if (failure) {
    showToast(failure, true);
    updateCashCountToolbar();
    return;
  }
  cashCounts = cashCounts.filter(item => item !== row);
  if (selectedCashClientId === row.clientId) selectedCashClientId = null;
  persistPendingLocally();
  renderCashCounts();
  updateSyncIndicatorSoon();
  setCashVaultStatus('Cash count deleted');
  showToast('Selected daily cash count deleted.');
}

// ---------------------------------------------------------------------------
// Staff Balance panel (list → add amount / add new → history)
// ---------------------------------------------------------------------------
const staffState = { view: 'list', mode: 'add', person: null, returnView: 'list', formBalance: 0 };

function showStaffView(view) {
  staffState.view = view;
  [['list', 'staffViewList'], ['form', 'staffViewForm'], ['history', 'staffViewHistory']].forEach(([name, id]) => {
    el(id).classList.toggle('hidden', name !== view);
  });
  el('cashPeopleDialog').querySelector('.sp-body').scrollTop = 0;
}

function staffInitials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function staffAmountClass(value) {
  return value > 0.0001 ? 'person-positive' : value < -0.0001 ? 'person-negative' : 'person-zero';
}

function staffAmountHtml(value) {
  const n = Number(value || 0);
  return `${escapeHtml(formatSignedCashAdjustment(n))}<small>AED</small>`;
}

function renderCashPeopleData() {
  const count = cashPeople.length;
  const net = cashPeople.reduce((sum, person) => sum + Number(person.amount || 0), 0);
  el('cashPeopleCount').textContent = `${count} staff`;
  const chip = el('staffNetChip');
  chip.textContent = `Net ${formatSignedCashAdjustment(net)} AED`;
  chip.className = `sp-chip ${net > 0.0001 ? 'sp-chip-red' : net < -0.0001 ? 'sp-chip-green' : 'sp-chip-grey'}`;
  el('staffPanelSubtitle').textContent = `Balances as of ${formatDmy(cashPeopleViewDate)}`;
  el('cashPeopleListCaption').textContent = `STAFF · ${count}`;
  el('staffAddNewButton').classList.toggle('hidden', !canEdit('cash_vault'));

  const list = el('cashPeopleBalanceList');
  if (!count) {
    list.innerHTML = `<p class="muted sp-empty">No staff balances on or before ${escapeHtml(formatDmy(cashPeopleViewDate))}.${canEdit('cash_vault') ? ' Use “Add New” to add a staff member.' : ''}</p>`;
    return;
  }
  list.innerHTML = cashPeople.map(person => {
    const balance = Number(person.amount || 0);
    const id = escapeHtml(person.person_id);
    return `<article class="sp-item">
      <button class="sp-item-main" type="button" data-staff-action="history" data-person-id="${id}" title="View history">
        <span class="sp-item-icon">${escapeHtml(staffInitials(person.person_name))}</span>
        <span class="sp-item-text"><strong>${escapeHtml(person.person_name)}</strong><small>Last entry ${escapeHtml(formatDmy(person.effective_date))}</small></span>
        <span class="sp-item-amount ${staffAmountClass(balance)}">${staffAmountHtml(balance)}</span>
        <span class="sp-chevron" aria-hidden="true">›</span>
      </button>
      ${canEdit('cash_vault') ? `<button class="sp-btn sp-btn-small" type="button" data-staff-action="add" data-person-id="${id}">+ Add</button>` : ''}
    </article>`;
  }).join('');
}

async function loadCashPeopleData({ force = false } = {}) {
  if (!currentUser) return;
  if (cashPeopleLoading && cashPeopleLoadPromise) {
    if (!force) return cashPeopleLoadPromise;
    await cashPeopleLoadPromise;
  }

  cashPeopleLoading = true;
  if (!cashPeopleViewDate) cashPeopleViewDate = el('cashAsOfDate').value || localDateString();
  el('cashPeopleBalanceList').innerHTML = '<p class="muted sp-empty">Loading staff…</p>';
  cashPeopleLoadPromise = (async () => {
    try {
      const { data, error } = await supabase.rpc('get_person_balances_as_of', { p_as_of: cashPeopleViewDate });
      if (error) throw error;
      cashPeople = (data || []).slice().sort((a, b) => String(a.person_name).localeCompare(String(b.person_name)));
      renderCashPeopleData();
    } catch (error) {
      el('cashPeopleBalanceList').innerHTML = `<p class="form-message">${escapeHtml(error.message || 'Unable to load staff balances.')}</p>`;
      showToast(`Unable to load Staff Balance: ${explainLedgerError(error)}. Confirm migration 011 has been applied.`, true);
    }
  })();

  try {
    await cashPeopleLoadPromise;
  } finally {
    cashPeopleLoading = false;
    cashPeopleLoadPromise = null;
  }
}

function openCashPeoplePanel() {
  cashPeopleViewDate = el('cashAsOfDate').value || localDateString();
  el('cashPeopleViewDate').value = cashPeopleViewDate;
  showStaffView('list');
  el('cashPeopleDialog').showModal();
  loadCashPeopleData();
}

function parseSignedPersonAmount(rawValue) {
  const raw = String(rawValue ?? '').trim().replace(/[−–]/g, '-').replace(/,/g, '');
  if (!raw) throw new Error('Enter an amount. Use + to add or - to subtract.');
  if (!/^[+-]?(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(raw)) {
    throw new Error('Enter a valid amount with no more than two decimal places.');
  }
  const amount = Number(raw);
  if (!Number.isFinite(amount) || Math.abs(amount) > 99999999999999.99) {
    throw new Error('The amount is outside the supported range.');
  }
  return Number(amount.toFixed(2));
}

function setStaffFormMessage(text, ok = false) {
  const node = el('staffFormMessage');
  node.textContent = text;
  node.classList.toggle('ok', ok);
}

function updateStaffPreview() {
  const preview = el('staffPreview');
  const raw = el('staffAmount').value.trim();
  let amount = null;
  try { amount = raw ? parseSignedPersonAmount(raw) : null; } catch { amount = null; }
  if (amount === null || staffState.mode !== 'add') { preview.classList.add('hidden'); return; }
  const next = Number(staffState.formBalance || 0) + amount;
  preview.classList.remove('hidden');
  preview.innerHTML = `New balance on ${escapeHtml(formatDmy(el('staffDate').value))} <strong class="${staffAmountClass(next)}">${staffAmountHtml(next)}</strong>`;
}

async function refreshStaffFormBalance() {
  if (staffState.mode !== 'add' || !staffState.person) return;
  const date = el('staffDate').value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  const personId = staffState.person.person_id;
  const { data, error } = await supabase.rpc('get_person_balances_as_of', { p_as_of: date });
  if (error || staffState.person?.person_id !== personId || el('staffDate').value !== date) return;
  const match = (data || []).find(item => item.person_id === personId);
  staffState.formBalance = Number(match?.amount || 0);
  const node = el('staffCurrentBalance');
  node.innerHTML = staffAmountHtml(staffState.formBalance);
  node.className = staffAmountClass(staffState.formBalance);
  updateStaffPreview();
}

function openStaffForm(mode, person = null, returnView = 'list', entry = null) {
  if (!canEdit('cash_vault')) { showToast('This access key is view-only. Staff Balance cannot be changed.', true); return; }
  staffState.mode = mode;
  staffState.person = person;
  staffState.returnView = returnView;
  staffState.formBalance = Number(person?.amount || 0);
  staffState.entry = entry;
  const isNew = mode === 'new';
  const isEdit = mode === 'edit';
  el('staffForm').reset();
  el('staffNameField').classList.toggle('hidden', !isNew);
  el('staffCurrentBalanceRow').classList.toggle('hidden', isNew || isEdit);
  el('staffFormTitle').textContent = isNew ? 'Add new staff' : isEdit ? 'Edit entry' : 'Add amount';
  el('staffFormSubtitle').textContent = isNew
    ? 'Create a staff member. An opening amount is optional.'
    : person.person_name;
  el('staffAmountLabel').textContent = isNew ? 'Opening amount (AED, optional)' : 'Amount (AED)';
  el('staffSaveButton').textContent = isNew ? 'Add staff' : isEdit ? 'Save changes' : 'Save';
  const today = localDateString();
  const dateInput = el('staffDate');
  dateInput.min = editCutoffDate();
  dateInput.max = today;
  dateInput.value = isEdit ? entry.txn_date : workDate();
  if (isEdit) {
    el('staffAmount').value = `${entry.amount > 0 ? '+' : ''}${Number(entry.amount).toFixed(2)}`;
    el('staffNote').value = entry.note || '';
  }
  const balanceNode = el('staffCurrentBalance');
  balanceNode.innerHTML = staffAmountHtml(staffState.formBalance);
  balanceNode.className = staffAmountClass(staffState.formBalance);
  el('staffPreview').classList.add('hidden');
  setStaffFormMessage('');
  showStaffView('form');
  (isNew ? el('staffName') : el('staffAmount')).focus();
  if (!isNew && !isEdit) refreshStaffFormBalance();
}

function closeStaffForm() {
  if (staffState.returnView === 'history' && staffState.person) openStaffHistory(staffState.person.person_id);
  else showStaffView('list');
}

async function submitStaffForm(event) {
  event.preventDefault();
  if (!canEdit('cash_vault')) return;
  const isNew = staffState.mode === 'new';
  const isEdit = staffState.mode === 'edit';
  setStaffFormMessage('');

  let name = '';
  if (isNew) {
    name = el('staffName').value.trim();
    if (!name) { setStaffFormMessage('Enter the staff name.'); el('staffName').focus(); return; }
    if (name.length > 100) { setStaffFormMessage('The name must be 100 characters or fewer.'); el('staffName').focus(); return; }
  } else {
    name = staffState.person?.person_name || '';
  }

  let amount = 0;
  const rawAmount = el('staffAmount').value.trim();
  if (!(isNew && rawAmount === '')) {
    try { amount = parseSignedPersonAmount(rawAmount); } catch (error) {
      setStaffFormMessage(error.message); el('staffAmount').focus(); return;
    }
  }
  if (!isNew && !isEdit && amount === 0) {
    setStaffFormMessage('Enter an amount other than zero (use + to add, - to subtract).'); el('staffAmount').focus(); return;
  }

  const txnDate = el('staffDate').value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(txnDate)) { setStaffFormMessage('Choose a valid date.'); return; }
  if (!isDateEditable(txnDate)) {
    setStaffFormMessage(`Editing is not allowed for older entries. Choose ${formatDmy(editCutoffDate())} or later (last ${EDIT_WINDOW_DAYS} days).`);
    return;
  }
  if (txnDate > localDateString()) { setStaffFormMessage('The date cannot be in the future.'); return; }

  const note = el('staffNote').value.trim();
  const button = el('staffSaveButton');
  button.disabled = true;
  try {
    const { data, error } = isEdit
      ? await supabase.rpc('update_staff_transaction', {
          p_id: staffState.entry.id,
          p_amount: amount,
          p_note: note,
          p_txn_date: txnDate
        })
      : await supabase.rpc('add_staff_transaction', {
          p_person_id: isNew ? null : staffState.person.person_id,
          p_person_name: name,
          p_amount: amount,
          p_note: note,
          p_txn_date: txnDate
        });
    if (error) throw error;
    if (!data) throw new Error('The entry could not be saved.');

    if (txnDate > cashPeopleViewDate) {
      cashPeopleViewDate = txnDate;
      el('cashPeopleViewDate').value = txnDate;
    }
    showToast(isNew ? `${name} added to Staff Balance.` : isEdit ? `Entry updated for ${name}.` : `${formatSignedCashAdjustment(amount)} AED saved for ${name} on ${formatDmy(txnDate)}.`);
    try {
      invalidateCashSummaries();
      await Promise.all([refreshCashSummary(), loadCashPeopleData({ force: true })]);
      setCashVaultStatus('Staff Balance saved · Available Cash refreshed · Cash Count unchanged');
    } catch (refreshError) {
      setCashVaultStatus('Staff Balance saved · refresh required', 'error');
      showToast(`Saved, but the screen could not refresh: ${refreshError.message || 'Refresh the page.'}`, true);
    }
    if (!isNew && (isEdit || staffState.returnView === 'history')) openStaffHistory(data);
    else showStaffView('list');
  } catch (error) {
    const text = explainLedgerError(error) || error.message || 'The entry could not be saved.';
    setStaffFormMessage(text);
    showToast(text, true);
  } finally {
    button.disabled = !canEdit('cash_vault');
  }
}

async function openStaffHistory(personId) {
  const person = cashPeople.find(item => item.person_id === personId) || staffState.person;
  if (!person) return;
  staffState.person = { ...person };
  el('staffHistoryName').textContent = person.person_name;
  el('staffHistorySub').textContent = 'Loading history…';
  el('staffHistoryList').innerHTML = '';
  el('staffHistoryAdd').classList.toggle('hidden', !canEdit('cash_vault'));
  showStaffView('history');

  const { data, error } = await supabase
    .from('staff_balance_transactions')
    .select('id, txn_date, amount, note, created_at')
    .eq('person_id', personId)
    .order('txn_date', { ascending: true })
    .order('created_at', { ascending: true });
  if (staffState.view !== 'history' || staffState.person?.person_id !== personId) return;
  if (error) {
    el('staffHistorySub').textContent = '';
    el('staffHistoryList').innerHTML = `<p class="form-message">${escapeHtml(error.message || 'Unable to load history.')}</p>`;
    return;
  }

  const entryActions = item => {
    if (!canEdit('cash_vault')) return '';
    if (!isDateEditable(item.txn_date)) {
      return `<span class="sp-entry-actions"><span class="sp-lock" title="Locked: older than ${EDIT_WINDOW_DAYS} days">🔒</span></span>`;
    }
    const id = escapeHtml(item.id);
    return `<span class="sp-entry-actions">
      <button class="sp-icon-btn" type="button" data-entry-action="edit" data-entry-id="${id}" title="Edit entry" aria-label="Edit entry"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="M13.5 7.5l3 3"/></svg></button>
      <button class="sp-icon-btn sp-icon-btn-danger" type="button" data-entry-action="delete" data-entry-id="${id}" title="Delete entry" aria-label="Delete entry"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg></button>
    </span>`;
  };

  let running = 0;
  const entries = (data || []).map(item => {
    running = Math.round((running + Number(item.amount || 0)) * 100) / 100;
    return { ...item, amount: Number(item.amount || 0), after: running };
  });
  staffState.person.amount = running;
  staffState.entries = entries;
  el('staffHistorySub').innerHTML = `Total balance <strong class="${staffAmountClass(running)}">${staffAmountHtml(running)}</strong> · ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`;
  el('staffHistoryList').innerHTML = entries.length
    ? entries.slice().reverse().map(item => {
        const plus = item.amount >= 0;
        return `<article class="sp-item sp-history-item">
          <span class="sp-item-icon ${plus ? 'sp-icon-up' : 'sp-icon-down'}">${plus ? '↑' : '↓'}</span>
          <span class="sp-item-text"><strong>${escapeHtml(item.note || (plus ? 'Amount added' : 'Amount subtracted'))}</strong><small>${escapeHtml(formatDmy(item.txn_date))} · Balance after ${escapeHtml(formatSignedCashAdjustment(item.after))}</small></span>
          <span class="sp-item-amount ${staffAmountClass(item.amount)}">${staffAmountHtml(item.amount)}</span>
          ${entryActions(item)}
        </article>`;
      }).join('')
    : '<p class="muted sp-empty">No entries yet.</p>';
}

function onCashAsOfDateChange() {
  if (!el('cashAsOfDate').value) return;
  syncCashDateControls();
  const selectedDate = workDate();
  cashTableBody.querySelectorAll('tr[data-client-id]').forEach(tr => {
    tr.classList.toggle('cash-current-date', cashCounts[Number(tr.dataset.rowIndex)]?.count_date === selectedDate);
  });
  updateCashCountedSummary();
  refreshCashSummary();
  syncTrailingBlankRows();
}

function createExpenseRowElement(row, rowIndex) {
  const tr = document.createElement('tr');
  tr.dataset.clientId = row.clientId;
  tr.dataset.rowIndex = String(rowIndex);
  tr.className = rowClassName(row, rowIndex, selectedClientId, 'entry_date');
  tr.innerHTML = COLUMNS.map((column, colIndex) => `<td data-row-index="${rowIndex}" data-col-index="${colIndex}">${renderCell(row, column)}</td>`).join('');
  return tr;
}

function renderTable() {
  scheduleLocalPersist();
  addTrailingBlankExpenseRow();
  resetSheetSelection(table);
  if (rows.length) el('recentDates').innerHTML = recentDateOptions().map(date => `<option value="${date}"></option>`).join('');
  expenseSheet.refresh();
  setText(el('recordCount'), recordCountText(rows, isBlankExpenseRow));
  updateToolbar();
}

function accessNoteText(section = 'expenses') {
  return withEditWindow(currentUser?.role === 'owner' ? 'Owner · full access' : (canEdit(section) ? 'Edit access' : 'View-only access'));
}

function updateToolbar() {
  updateSyncIndicatorSoon();
  addButton.disabled = !canEdit('expenses');
  el('importReceiptsButton').disabled = !canEdit('expenses') || !permissions.import;
  el('importReceiptsButton').classList.toggle('hidden', !permissions.import);
  el('changeTypeExpensesButton').disabled = !canEdit('expenses');
  deleteButton.disabled = !canEdit('expenses') || !selectedClientId;
  setText(el('permissionNote'), accessNoteText('expenses'));
}

function updateReceivedToolbar() {
  updateSyncIndicatorSoon();
  receivedAddButton.disabled = !canEdit('received');
  el('changeTypeReceivedButton').disabled = !canEdit('received');
  receivedDeleteButton.disabled = !canEdit('received') || !selectedReceivedClientId;
  setText(el('receivedPermissionNote'), accessNoteText('received'));
}

function selectRow(clientId) {
  selectedClientId = clientId;
  tableBody.querySelectorAll('tr[data-client-id]').forEach(tr => {
    tr.classList.toggle('selected', tr.dataset.clientId === clientId);
  });
  updateToolbar();
}

// _base is the row as the database has it; Available Cash uses it to apply local
// changes exactly once.
function rowFromDatabase(record, amountFields = AMOUNT_FIELDS) {
  return { ...record, clientId: record.id, _base: ledgerSnapshot(record, amountFields), _dirty: false, _isNew: false };
}

// Loads every row of a table. Supabase returns at most 1,000 rows per request, so the
// remaining pages are fetched in parallel after the first one reports the total.
async function fetchAllRows(tableName, orderFields) {
  const pageSize = 1000;
  const query = (options) => {
    let request = supabase.from(tableName).select('*', options);
    orderFields.forEach(field => { request = request.order(field, { ascending: true }); });
    return request;
  };
  const first = await query({ count: 'exact' }).range(0, pageSize - 1);
  if (first.error) throw first.error;
  const all = first.data || [];
  const pageLength = all.length;
  if (first.count != null && pageLength > 0 && first.count > pageLength) {
    const pages = [];
    for (let from = pageLength; from < first.count; from += pageLength) {
      pages.push(query().range(from, from + pageLength - 1));
    }
    const results = await Promise.all(pages);
    for (const result of results) {
      if (result.error) throw result.error;
      all.push(...(result.data || []));
    }
  }
  return all;
}

function explainLedgerError(error) {
  const message = error?.message || 'Unknown database error.';
  const normalized = message.toLowerCase();
  const personCashError = normalized.includes('cash_people')
    || normalized.includes('cash_adjustment')
    || normalized.includes('staff_balance_transactions')
    || normalized.includes('add_staff_transaction')
    || normalized.includes('update_staff_transaction')
    || normalized.includes('delete_staff_transaction')
    || normalized.includes('get_person_balances_as_of');
  const cashVaultError = normalized.includes('cash_vault_counts') || normalized.includes('get_cash_vault_summary');
  if (normalized.includes('permission denied for schema') || normalized.includes('permission denied for table') || normalized.includes('permission denied for function')) {
    if (personCashError) return 'Staff Balance permissions are configured by sql/migrations/011_staff_balance_transactions_and_edit_window.sql. Confirm migration 011 has been applied, then refresh this page.';
    if (normalized.includes('get_cash_vault_summary')) return 'The Cash Vault balance function needs migration 009. Run sql/migrations/011_staff_balance_transactions_and_edit_window.sql, then refresh this page.';
    return cashVaultError
      ? 'Cash Vault permissions are configured by sql/migrations/005_cash_vault_counts_and_balance.sql. Confirm that migration 005 has been applied, then refresh this page.'
      : 'Database permissions need the ledger repair. In Supabase SQL Editor, run sql/migrations/004_fix_public_schema_access.sql, then refresh this page.';
  }
  if ((normalized.includes('relation') && normalized.includes('does not exist')) || normalized.includes('could not find the function')) {
    if (personCashError) return 'The Staff Balance table or function is missing. Run sql/migrations/011_staff_balance_transactions_and_edit_window.sql, then refresh this page.';
    if (normalized.includes('get_cash_vault_summary')) return 'The updated Cash Vault summary is missing. Run sql/migrations/011_staff_balance_transactions_and_edit_window.sql, then refresh this page.';
    return cashVaultError
      ? 'The Cash Vault table is missing. Run sql/migrations/005_cash_vault_counts_and_balance.sql, then refresh this page.'
      : 'The ledger table is missing. Apply the numbered SQL migrations in order, then refresh this page.';
  }
  return message;
}

async function callAccess(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke('access', {
    body: { action, ...payload }
  });
  if (error) {
    let message = error.message || 'The security service could not complete the request.';
    try {
      const body = await error.context?.json?.();
      if (body?.error) message = body.error;
    } catch (_) { /* Use the SDK error message if no response body is available. */ }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

async function loadWorkspace() {
  const [info] = await Promise.all([callAccess('me'), loadPaymentTypes()]);
  currentUser = { ...info, name: info.name || info.label || (info.role === 'owner' ? 'Owner' : 'User') };
  permissions = normalisePermissions(info);
  canWrite = SECTION_KEYS.some(canEdit);
  accountPanel.setUser(currentUser, permissions);
  applySectionVisibility();
  addButton.disabled = !canEdit('expenses');
  saveButton.disabled = true;
  deleteButton.disabled = true;
  el('permissionNote').textContent = accessNoteText('expenses');
  authScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');
  rows = [];
  selectedClientId = null;
  expensesLoaded = false;
  expensesLoading = false;
  receivedRows = [];
  selectedReceivedClientId = null;
  receivedLoaded = false;
  receivedLoading = false;
  cashCounts = [];
  selectedCashClientId = null;
  cashVaultLoaded = false;
  cashVaultLoading = false;
  cashAvailableBalance = null;
  cashAvailableCents = null;
  cashSummaryCache.clear();
  ledgerCommits = [];
  cashSummaryError = null;
  cashPeople = [];
  cashPeopleViewDate = '';
  cashPeopleLoading = false;
  cashPeopleLoadPromise = null;
  editingCashPersonId = null;
  el('cashAsOfDate').value = localDateString();
  syncCashDateControls();
  buildTableHeader();
  buildReceivingTableHeader();
  buildCashTableHeader();
  renderTable();
  renderReceivedTable();
  renderCashCounts();
  updateSyncIndicator();
  setActiveTab(firstVisibleTab());
  // Load the other sheets in the background straight away, so switching tabs is
  // instant and any changes kept on this device are saved without waiting.
  setTimeout(() => {
    if (!currentUser) return;
    if (canView('expenses') && !expensesLoaded && !expensesLoading) loadExpenses();
    if (canView('received') && !receivedLoaded && !receivedLoading) loadReceived();
  }, 0);
}

async function loadExpenses() {
  if (!currentUser || expensesLoading) return;
  expensesLoading = true;
  addButton.disabled = true;
  setSheetStatus('Loading records…');
  let data = null;
  let error = null;
  try { data = await fetchAllRows('expense_records', ['sort_order', 'created_at', 'id']); } catch (loadError) { error = loadError; }
  if (error) {
    expensesLoading = false;
    addButton.disabled = !canEdit('expenses');
    setSheetStatus('Could not load records', 'error');
    showToast(`Unable to load expenses: ${explainLedgerError(error)}`, true);
    return;
  }
  persistPendingLocally();
  const localUnsaved = rows.filter(row => row._isNew && row._dirty && !isBlankExpenseRow(row));
  rows = (data || []).map(record => rowFromDatabase(record, AMOUNT_FIELDS));
  mergePendingFromStorage('expenses', rows);
  localUnsaved.forEach(row => { if (!rows.some(item => item.clientId === row.clientId)) rows.push(row); });
  if (!rows.some(row => row.clientId === selectedClientId)) selectedClientId = null;
  renderTable();
  scrollSheetToBottom(table);
  expensesLoaded = true;
  expensesLoading = false;
  announceRestoredChanges();
  addButton.disabled = !canEdit('expenses');
  const hasDirty = rows.some(row => row._dirty && !isBlankExpenseRow(row));
  setSheetStatus(hasDirty ? UNSYNCED_TEXT : 'All changes saved', hasDirty ? 'dirty' : 'normal');
  scheduleCashPositionRender();
  updateSyncIndicatorSoon();
}

function createReceivedRowElement(row, rowIndex) {
  const tr = document.createElement('tr');
  tr.dataset.clientId = row.clientId;
  tr.dataset.rowIndex = String(rowIndex);
  tr.className = rowClassName(row, rowIndex, selectedReceivedClientId, 'entry_date');
  tr.innerHTML = RECEIVING_COLUMNS.map((column, colIndex) => `<td data-row-index="${rowIndex}" data-col-index="${colIndex}">${renderCell(row, column, RECEIVING_AMOUNT_FIELDS)}</td>`).join('');
  const dateInput = tr.querySelector('input[data-field="entry_date"]');
  if (dateInput) dateInput.setAttribute('list', 'recentReceivedDates');
  return tr;
}

function renderReceivedTable() {
  scheduleLocalPersist();
  addTrailingBlankReceivedRow();
  resetSheetSelection(el('receivedTable'));
  if (receivedRows.length) el('recentReceivedDates').innerHTML = recentDateOptions().map(date => `<option value="${date}"></option>`).join('');
  receivedSheet.refresh();
  setText(el('receivedRecordCount'), recordCountText(receivedRows, isBlankReceivedRow));
  updateReceivedToolbar();
}

async function loadReceived() {
  if (!currentUser || receivedLoading) return;
  receivedLoading = true;
  receivedAddButton.disabled = true;
  receivedSheetStatus.textContent = 'Loading records…';
  let data = null;
  let error = null;
  try { data = await fetchAllRows('received_records', ['sort_order', 'created_at', 'id']); } catch (loadError) { error = loadError; }
  if (error) {
    receivedLoading = false;
    receivedAddButton.disabled = !canEdit('received');
    receivedSheetStatus.textContent = 'Could not load records';
    receivedSheetStatus.classList.add('error');
    showToast(`Unable to load received records: ${explainLedgerError(error)}`, true);
    return;
  }
  persistPendingLocally();
  const localUnsaved = receivedRows.filter(row => row._isNew && row._dirty && !isBlankReceivedRow(row));
  receivedRows = (data || []).map(record => rowFromDatabase(record, RECEIVING_AMOUNT_FIELDS));
  mergePendingFromStorage('received', receivedRows);
  localUnsaved.forEach(row => { if (!receivedRows.some(item => item.clientId === row.clientId)) receivedRows.push(row); });
  if (!receivedRows.some(row => row.clientId === selectedReceivedClientId)) selectedReceivedClientId = null;
  renderReceivedTable();
  scrollSheetToBottom(el('receivedTable'));
  receivedLoaded = true;
  receivedLoading = false;
  announceRestoredChanges();
  receivedAddButton.disabled = !canEdit('received');
  const hasDirty = receivedRows.some(row => row._dirty && !isBlankReceivedRow(row));
  receivedSheetStatus.textContent = hasDirty ? UNSYNCED_TEXT : 'All changes saved';
  receivedSheetStatus.classList.toggle('dirty', hasDirty);
  receivedSheetStatus.classList.remove('error');
  scheduleCashPositionRender();
  updateSyncIndicatorSoon();
}

function handleReceivedInput(event) {
  const fieldInput = event.target.closest('[data-field]');
  if (!fieldInput) return;
  const tr = fieldInput.closest('tr[data-client-id]');
  if (!tr) return;
  const row = receivedRows.find(item => item.clientId === tr.dataset.clientId);
  if (!row) return;
  if (isRowLocked(row, 'entry_date')) { fieldInput.value = row[fieldInput.dataset.field] ?? ''; warnLockedEdit(); return; }
  if (fieldInput.dataset.field === 'entry_date' && fieldInput.value && !isDateEditable(fieldInput.value)) {
    fieldInput.value = row.entry_date;
    warnOldDate();
    return;
  }
  if (fieldInput.dataset.field === 'name' || fieldInput.dataset.field === 'merchant') {
    autocompleteInput(event, fieldInput, receivedRows, row, fieldInput.dataset.field);
  }
  row[fieldInput.dataset.field] = fieldInput.value;
  row._dirty = true;
  setText(receivedSheetStatus, UNSYNCED_TEXT);
  receivedSheetStatus.classList.add('dirty');
  receivedSheetStatus.classList.remove('error');
  tr.classList.add('dirty-row');
  const totalInput = tr.querySelector('.total-cell');
  if (totalInput) totalInput.value = formatBlankIfZero(calculateTotal(row, RECEIVING_AMOUNT_FIELDS));
  if (!isBlankReceivedRow(row) && row === receivedRows[receivedRows.length - 1]) appendTrailingReceivedRow();
  updateReceivedToolbar();
  scheduleAutosave('received');
}

function getReceivedPayload(row) {
  const payload = {
    entry_date: row.entry_date || localDateString(),
    name: row.name || '',
    transaction_type: row.transaction_type || 'Cash',
    merchant: row.merchant || ''
  };
  RECEIVING_AMOUNT_FIELDS.forEach(field => {
    const value = row[field];
    payload[field] = value === '' || value == null ? 0 : Number(value);
    if (!Number.isFinite(payload[field])) throw new Error(`Please enter a valid amount in ${field.replaceAll('_', ' ')}.`);
  });
  return payload;
}

async function saveReceivedChanges() {
  const none = { saved: 0, failures: [] };
  if (!canEdit('received') || saveState.received) return none;
  receivedRows.forEach(row => { if (row._dirty && isBlankReceivedRow(row)) row._dirty = false; });
  const dirtyRows = receivedRows.filter(row => !row._bulk && row._dirty);
  if (!dirtyRows.length) { updateReceivedToolbar(); return none; }
  saveState.received = true;
  setText(receivedSheetStatus, 'Saving…');
  let saved = 0;
  const failures = [];
  await runLedgerTask(async () => {
    for (const row of dirtyRows) {
      if (!receivedRows.includes(row)) continue; // deleted while waiting
      try {
        const payload = getReceivedPayload(row);
        const before = JSON.stringify(payload);
        applyMovedOrder(payload, row, receivedRows);
        const result = row.id
          ? await supabase.from('received_records').update(payload).eq('id', row.id).select('*').single()
          : await supabase.from('received_records').insert(payload).select('*').single();
        if (result.error) throw result.error;
        const committed = ledgerSnapshot(result.data, RECEIVING_AMOUNT_FIELDS);
        recordLedgerCommit('received', row._base ?? null, committed);
        Object.assign(row, { id: result.data.id, created_at: result.data.created_at, updated_at: result.data.updated_at, sort_order: result.data.sort_order, _base: committed, _isNew: false, _orderMoved: false });
        let after = null;
        try { after = JSON.stringify(getReceivedPayload(row)); } catch (_) { /* keep dirty */ }
        row._dirty = after !== before;
        receivedTableBody.querySelector(`tr[data-client-id="${CSS.escape(row.clientId)}"]`)?.classList.toggle('dirty-row', row._dirty);
        saved++;
      } catch (error) {
        failures.push(error.message || 'Unknown save error');
        row._dirty = true;
      }
    }
  });
  saveState.received = false;
  updateReceivedToolbar();
  scheduleCashPositionRender();
  if (failures.length) {
    receivedSheetStatus.textContent = `${saved} saved · ${failures.length} not saved yet`;
    receivedSheetStatus.classList.add('error');
  } else if (receivedRows.some(row => row._dirty && !isBlankReceivedRow(row))) {
    receivedSheetStatus.textContent = UNSYNCED_TEXT;
    receivedSheetStatus.classList.add('dirty');
    requestSync();
  } else {
    receivedSheetStatus.textContent = 'All changes saved';
    receivedSheetStatus.classList.remove('dirty', 'error');
  }
  return { saved, failures };
}

async function deleteSelectedReceivedRow() {
  if (!canEdit('received') || !selectedReceivedClientId) return;
  const row = receivedRows.find(item => item.clientId === selectedReceivedClientId);
  if (!row) return;
  if (isRowLocked(row, 'entry_date')) { warnLockedEdit('delete'); return; }
  if (!window.confirm('Delete the selected received row? This cannot be undone.')) return;
  receivedDeleteButton.disabled = true;
  // Waits for any save of this row that is already on its way, then deletes it.
  const failure = await runLedgerTask(async () => {
    if (!row.id) return null;
    const { data, error } = await supabase.from('received_records').delete().eq('id', row.id).select('id');
    if (error || !data?.length) return error?.message || 'The row could not be deleted. Check your access permission.';
    recordLedgerCommit('received', row._base ?? null, null);
    return null;
  });
  if (failure) {
    showToast(failure, true);
    updateReceivedToolbar();
    return;
  }
  receivedRows = receivedRows.filter(item => item !== row);
  if (selectedReceivedClientId === row.clientId) selectedReceivedClientId = null;
  persistPendingLocally();
  renderReceivedTable();
  scheduleCashPositionRender();
  receivedSheetStatus.textContent = 'Row deleted';
  receivedSheetStatus.classList.remove('dirty', 'error');
  showToast('Selected received row deleted.');
}

function markRowDirty(row) {
  row._dirty = true;
  setSheetStatus(UNSYNCED_TEXT, 'dirty');
  const tr = tableBody.querySelector(`tr[data-client-id="${CSS.escape(row.clientId)}"]`);
  if (tr) tr.classList.add('dirty-row');
  updateToolbar();
  scheduleAutosave('expenses');
}

function onTableInput(event) {
  const fieldInput = event.target.closest('[data-field]');
  if (!fieldInput) return;
  const tr = fieldInput.closest('tr[data-client-id]');
  if (!tr) return;
  const row = rows.find(item => item.clientId === tr.dataset.clientId);
  if (!row) return;
  const field = fieldInput.dataset.field;
  if (isRowLocked(row, 'entry_date')) { fieldInput.value = row[field] ?? ''; warnLockedEdit(); return; }
  if (field === 'entry_date' && fieldInput.value && !isDateEditable(fieldInput.value)) {
    fieldInput.value = row.entry_date;
    warnOldDate();
    return;
  }
  if (field === 'supplier' || field === 'spent_by') autocompleteInput(event, fieldInput, rows, row, field);
  row[field] = fieldInput.value;
  markRowDirty(row);
  if (field === 'supplier' && event.type === 'change') autofillFromSupplier(row, tr);
  if (!isBlankExpenseRow(row) && row === rows[rows.length - 1]) appendTrailingExpenseRow();
  const totalInput = tr.querySelector('.total-cell');
  if (totalInput) totalInput.value = formatBlankIfZero(calculateTotal(row));
}

function getPayload(row) {
  const payload = {
    entry_date: row.entry_date || localDateString(),
    supplier: row.supplier || '',
    trn_number: row.trn_number || '---',
    spent_by: row.spent_by || '',
    invoice_number: row.invoice_number || '',
    transaction_type: row.transaction_type || 'Cash'
  };
  AMOUNT_FIELDS.forEach(field => {
    const value = row[field];
    payload[field] = value === '' || value == null ? 0 : Number(value);
    if (!Number.isFinite(payload[field])) throw new Error(`Please enter a valid amount in ${field.replaceAll('_', ' ')}.`);
  });
  return payload;
}

async function saveChanges() {
  const none = { saved: 0, failures: [] };
  if (!canEdit('expenses') || saveState.expenses) return none;
  rows.forEach(row => { if (row._dirty && isBlankExpenseRow(row)) row._dirty = false; });
  const dirtyRows = rows.filter(row => row._dirty && !row._bulk);
  if (!dirtyRows.length) { updateToolbar(); return none; }
  saveState.expenses = true;
  setSheetStatus('Saving…', 'dirty');
  let saved = 0;
  const failures = [];

  await runLedgerTask(async () => {
    for (const row of dirtyRows) {
      if (!rows.includes(row)) continue; // deleted while waiting
      try {
        const payload = getPayload(row);
        const before = JSON.stringify(payload);
        applyMovedOrder(payload, row, rows);
        const result = row.id
          ? await supabase.from('expense_records').update(payload).eq('id', row.id).select('*').single()
          : await supabase.from('expense_records').insert(payload).select('*').single();
        if (result.error) throw result.error;
        const committed = ledgerSnapshot(result.data, AMOUNT_FIELDS);
        recordLedgerCommit('expense', row._base ?? null, committed);
        // Update the row in place so typing is never interrupted.
        Object.assign(row, { id: result.data.id, created_at: result.data.created_at, updated_at: result.data.updated_at, sort_order: result.data.sort_order, _base: committed, _isNew: false, _orderMoved: false });
        let after = null;
        try { after = JSON.stringify(getPayload(row)); } catch (_) { /* keep dirty */ }
        row._dirty = after !== before;
        tableBody.querySelector(`tr[data-client-id="${CSS.escape(row.clientId)}"]`)?.classList.toggle('dirty-row', row._dirty);
        saved++;
      } catch (error) {
        failures.push(error.message || 'Unknown save error');
        row._dirty = true;
      }
    }
  });

  saveState.expenses = false;
  updateToolbar();
  scheduleCashPositionRender();
  if (failures.length) {
    setSheetStatus(`${saved} saved · ${failures.length} not saved yet`, 'error');
  } else if (rows.some(row => row._dirty && !isBlankExpenseRow(row))) {
    setSheetStatus(UNSYNCED_TEXT, 'dirty');
    requestSync();
  } else {
    setSheetStatus('All changes saved');
  }
  return { saved, failures };
}

async function deleteSelectedRow() {
  if (!canEdit('expenses') || !selectedClientId) return;
  const row = rows.find(item => item.clientId === selectedClientId);
  if (!row) return;
  if (isRowLocked(row, 'entry_date')) { warnLockedEdit('delete'); return; }
  if (!window.confirm('Delete the selected expense row? This cannot be undone.')) return;
  deleteButton.disabled = true;
  // Waits for any save of this row that is already on its way, then deletes it.
  const failure = await runLedgerTask(async () => {
    if (!row.id) return null;
    const { data, error } = await supabase.from('expense_records').delete().eq('id', row.id).select('id');
    if (error || !data?.length) return error?.message || 'The row could not be deleted. Check your access permission.';
    recordLedgerCommit('expense', row._base ?? null, null);
    return null;
  });
  if (failure) {
    showToast(failure, true);
    updateToolbar();
    return;
  }
  rows = rows.filter(item => item !== row);
  if (selectedClientId === row.clientId) selectedClientId = null;
  persistPendingLocally();
  renderTable();
  scheduleCashPositionRender();
  setSheetStatus('Row deleted locally and from database');
  showToast('Selected row deleted.');
}

function normalizePastedDate(rawValue) {
  const value = String(rawValue ?? '').trim();
  if (!value) return '';

  const validParts = (year, month, day) => {
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return '';
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  let match = value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (match) return validParts(Number(match[1]), Number(match[2]), Number(match[3]));

  match = value.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (match) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    const year = Number(match[3]);
    // Dubai/UAE convention is day-first. If the first component cannot be a
    // month, interpret it as day-first; if the second cannot be a month, use
    // month-first (common when copying from a US-formatted workbook).
    if (first > 12 && second <= 12) return validParts(year, second, first);
    if (second > 12 && first <= 12) return validParts(year, first, second);
    return validParts(year, second, first);
  }

  // Excel's 1900 date system uses 1899-12-30 as its serial-number epoch.
  if (/^\d{1,5}(?:\.\d+)?$/.test(value)) {
    const serial = Math.floor(Number(value));
    if (serial >= 1 && serial <= 100000 && serial !== 60) {
      // Excel's 1900 date system includes the fictitious 29-Feb-1900 at
      // serial 60. Account for that historic leap-year bug explicitly.
      const daysFromEpoch = serial > 60 ? serial - 1 : serial;
      const date = new Date(Date.UTC(1899, 11, 31) + daysFromEpoch * 86400000);
      return validParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
    }
  }
  return '';
}

function normalizePastedAmount(rawValue) {
  const original = String(rawValue ?? '').trim();
  if (!original) return '';
  let value = original.replace(/(?:AED|د\.إ|USD|\$)/gi, '').replace(/\s+/g, '').replace(/,/g, '');
  if (/^\(.*\)$/.test(value)) value = `-${value.slice(1, -1)}`;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || Math.abs(numeric) > 999999999999.99) return null;
  // Keep the normalized decimal text; PostgreSQL numeric(14,2) performs
  // exact decimal rounding, avoiding JavaScript binary-float toFixed quirks.
  return value.startsWith('.') ? `0${value}` : value.startsWith('-.') ? value.replace('-.', '-0.') : value;
}

function scrollSheetToBottom(tableElement) {
  sheetFor(tableElement)?.scrollToBottom();
}

function resetSheetSelection(tableElement) {
  spreadsheetGrids.get(tableElement)?.clearSelection();
  const config = sheetConfigs.get(tableElement);
  if (config) config.rememberedRange = null;
}

function applyGridPaste(config, payload) {
  if (!canEdit(sectionOf(config.autosaveKey))) {
    showToast('You have view-only access here. Pasting changes is not permitted.', true);
    return null;
  }
  const { fillRange } = payload;
  let { matrix, startRow, startCol } = payload;
  if (fillRange) {
    // One copied value fills every selected cell, like Excel.
    const value = matrix[0][0];
    matrix = Array.from({ length: fillRange.maxRow - fillRange.minRow + 1 }, () =>
      Array.from({ length: fillRange.maxCol - fillRange.minCol + 1 }, () => value));
  }

  const modelRows = config.getRows();
  let applied = 0;
  let skipped = 0;
  let lockedSkipped = 0;

  matrix.forEach((values, rowOffset) => {
    const modelIndex = startRow + rowOffset;
    if (modelIndex >= modelRows.length) {
      if (!config.makeRow) { skipped += values.length; return; }
      while (modelRows.length <= modelIndex) modelRows.push(config.makeRow());
    }
    const model = modelRows[modelIndex];
    if (config.isLocked?.(model)) { lockedSkipped += values.length; return; }
    values.forEach((rawValue, colOffset) => {
      const column = config.columns[startCol + colOffset];
      if (!column || column.kind === 'total') { skipped++; return; }
      const field = column.field;
      const value = String(rawValue ?? '').trim();
      if (column.kind === 'select') {
        const canonical = canonicalType(config.autosaveKey === 'received' ? 'received' : 'expenses', value);
        if (!canonical) { skipped++; return; }
        model[field] = canonical;
      } else if (column.kind === 'quantity') {
        const compact = value.replace(/,/g, '');
        if (compact !== '' && (!/^\d+$/.test(compact) || Number(compact) > 2147483647)) { skipped++; return; }
        model[field] = compact;
      } else if (column.kind === 'date') {
        const parsedDate = normalizePastedDate(value);
        if (value && !parsedDate) { skipped++; return; }
        if (parsedDate && !isDateEditable(parsedDate)) { lockedSkipped++; return; }
        model[field] = parsedDate;
      } else if (column.kind === 'amount') {
        const parsedAmount = normalizePastedAmount(value);
        if (parsedAmount === null) { skipped++; return; }
        model[field] = parsedAmount;
      } else {
        model[field] = String(rawValue ?? '').slice(0, 120);
      }
      model._dirty = true;
      model._isNew = Boolean(model._isNew || !model.id);
      applied++;
    });
  });

  config.render();
  config.setDirtyStatus();
  scheduleAutosave(config.autosaveKey);
  const lockedNote = lockedSkipped ? ` ${lockedSkipped} cell${lockedSkipped === 1 ? '' : 's'} not changed: editing is not allowed for entries older than ${EDIT_WINDOW_DAYS} days (before ${formatDmy(editCutoffDate())}).` : '';
  if (applied) showToast(`Pasted ${applied} cell${applied === 1 ? '' : 's'}. Saving automatically.${skipped ? ` ${skipped} cell${skipped === 1 ? '' : 's'} skipped (invalid or calculated cells).` : ''}${lockedNote}`, Boolean(lockedSkipped));
  else showToast(lockedSkipped ? `Nothing pasted.${lockedNote}` : 'No editable cells from the pasted range were applied.', true);

  return {
    endRow: Math.max(0, Math.min(modelRows.length - 1, startRow + matrix.length - 1)),
    endCol: Math.min(config.columns.length - 1, startCol + Math.max(...matrix.map(row => row.length), 1) - 1)
  };
}

function showCopyToast({ rows, columns, cut }) {
  const cells = rows * columns;
  showToast(`${cut ? 'Cut' : 'Copied'} ${cells} cell${cells === 1 ? '' : 's'}${cells > 1 ? ` (${rows} × ${columns})` : ''} — paste into Excel with Ctrl+V.`);
}

function signOutToLogin() {
  clearTimeout(autosaveTimer);
  autosaveTimer = null;
  clearTimeout(retryTimer);
  retryTimer = null;
  lastSyncError = '';
  lastErrorToast = '';
  retryAttempt = 0;
  clearAllSpreadsheetSelections();
  // Explicit sign-out is the only normal way to end the saved session: remove
  // the encrypted session and the browser-session marker, then sign out locally.
  clearBrowserSessionCookie();
  encryptedAuthStorage.removeItem(EXPENSE_VAULT_AUTH_STORAGE_KEY).catch(() => {});
  supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  currentUser = null;
  canWrite = false;
  permissions = { cash_vault: 'none', expenses: 'none', received: 'none', export: false, import: false };
  accountPanel.close();
  rows = [];
  selectedClientId = null;
  expensesLoaded = false;
  expensesLoading = false;
  receivedRows = [];
  selectedReceivedClientId = null;
  receivedLoaded = false;
  receivedLoading = false;
  cashCounts = [];
  selectedCashClientId = null;
  cashVaultLoaded = false;
  cashVaultLoading = false;
  cashAvailableBalance = null;
  cashAvailableCents = null;
  cashSummaryCache.clear();
  ledgerCommits = [];
  cashSummaryError = null;
  clearTimeout(summaryRefreshTimer);
  summaryRefreshTimer = null;
  cashPeople = [];
  cashPeopleViewDate = '';
  cashPeopleLoading = false;
  cashPeopleLoadPromise = null;
  editingCashPersonId = null;
  cashSummaryRequestId++;
  appScreen.classList.add('hidden');
  authScreen.classList.remove('hidden');
  loginForm.reset();
  loginMessage.textContent = '';
  el('loginKey').focus();
}

function validateNumericKey(value, label) {
  if (!/^\d{8,32}$/.test(value)) throw new Error(`${label} must contain 8–32 digits.`);
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  const key = el('loginKey').value.trim();
  loginMessage.textContent = '';
  loginButton.disabled = true;
  loginButton.textContent = 'Checking key…';
  try {
    validateNumericKey(key, 'Access key');
    const result = await callAccess('login', { key });
    if (!result.session?.access_token || !result.session?.refresh_token) throw new Error('The sign-in service did not return a valid session.');
    const browserSessionMarker = beginBrowserSession();
    const sessionTokens = {
      access_token: result.session.access_token,
      refresh_token: result.session.refresh_token
    };
    const { error: sessionError } = await supabase.auth.setSession(sessionTokens);
    if (sessionError) {
      clearBrowserSessionCookie();
      throw sessionError;
    }

    // Persist explicitly after setSession as a second, awaited write. This avoids
    // depending solely on SDK initialization/refresh timing for the first save.
    const { data: currentSessionData, error: currentSessionError } = await supabase.auth.getSession();
    if (currentSessionError) throw currentSessionError;
    const sessionToPersist = currentSessionData?.session || result.session;
    await encryptedAuthStorage.setItem(EXPENSE_VAULT_AUTH_STORAGE_KEY, JSON.stringify(sessionToPersist));

    el('loginKey').value = '';
    await loadWorkspace();
    const persistenceStatus = getEncryptedSessionPersistenceStatus();
    const diagnostics = getEncryptedSessionDiagnostics();
    if (!browserSessionMarker || !persistenceStatus.persisted) {
      console.warn('[ExpenseVault] Encrypted browser-session persistence was not confirmed.', {
        ...diagnostics,
        error: persistenceStatus.error
      });
      showToast(`Secure session could not be saved: ${persistenceStatus.error || 'browser session marker unavailable'}. Refresh may require your key again.`, true);
    }
  } catch (error) {
    loginMessage.textContent = error.message || 'Sign-in failed. Please try again.';
  } finally {
    loginButton.disabled = false;
    loginButton.innerHTML = 'Sign in <span aria-hidden="true">→</span>';
  }
});

addButton.addEventListener('click', () => {
  if (!canEdit('expenses')) return;
  if (!isDateEditable(workDate())) { warnOldWorkDate(); return; }
  appendTrailingExpenseRow();
  focusTrailingRow(table, rows, id => { selectedClientId = id; });
  updateToolbar();
});

deleteButton.addEventListener('click', deleteSelectedRow);
tableBody.addEventListener('input', onTableInput);
tableBody.addEventListener('change', onTableInput);
tableBody.addEventListener('click', event => {
  const tr = event.target.closest('tr[data-client-id]');
  if (tr) selectRow(tr.dataset.clientId);
});

cashAddButton.addEventListener('click', () => {
  if (!canEdit('cash_vault')) return;
  if (!isDateEditable(workDate())) { warnOldWorkDate(); return; }
  const countDate = workDate();
  const existing = cashCounts.find(row => row.count_date === countDate);
  if (existing) {
    selectCashCountRow(existing.clientId);
    showToast(`A cash count already exists for ${formatDateLabel(countDate)}. Edit that row instead.`);
    const rowElement = cashTableBody.querySelector(`tr[data-client-id="${CSS.escape(existing.clientId)}"]`);
    rowElement?.scrollIntoView({ block: 'nearest' });
    return;
  }
  const row = makeEmptyCashCountRow(countDate);
  cashCounts.push(row);
  selectedCashClientId = row.clientId;
  renderCashCounts();
  setCashVaultStatus('New daily count — type the quantities, it saves automatically', 'dirty');
  scrollSheetToBottom(el('cashCountTable'));
  spreadsheetGrids.get(el('cashCountTable'))?.startEditing(cashCounts.length - 1, 1);
});

cashDeleteButton.addEventListener('click', deleteSelectedCashCount);
cashTableBody.addEventListener('input', handleCashCountInput);
cashTableBody.addEventListener('change', handleCashCountInput);
cashTableBody.addEventListener('click', event => {
  const tr = event.target.closest('tr[data-client-id]');
  if (tr) selectCashCountRow(tr.dataset.clientId);
});
el('cashAsOfDate').addEventListener('change', () => {
  if (!el('cashAsOfDate').value) el('cashAsOfDate').value = localDateString();
  onCashAsOfDateChange();
});

receivedAddButton.addEventListener('click', () => {
  if (!canEdit('received')) return;
  if (!isDateEditable(workDate())) { warnOldWorkDate(); return; }
  appendTrailingReceivedRow();
  focusTrailingRow(el('receivedTable'), receivedRows, id => { selectedReceivedClientId = id; });
  updateReceivedToolbar();
});

receivedDeleteButton.addEventListener('click', deleteSelectedReceivedRow);
receivedTableBody.addEventListener('input', handleReceivedInput);
receivedTableBody.addEventListener('change', handleReceivedInput);
receivedTableBody.addEventListener('click', event => {
  const tr = event.target.closest('tr[data-client-id]');
  if (!tr) return;
  selectedReceivedClientId = tr.dataset.clientId;
  receivedTableBody.querySelectorAll('tr[data-client-id]').forEach(row => {
    row.classList.toggle('selected', row.dataset.clientId === selectedReceivedClientId);
  });
  updateReceivedToolbar();
});

document.querySelectorAll('.tab-button').forEach(button => {
  button.addEventListener('click', () => setActiveTab(button.dataset.tab));
});

// Sign out (from the user menu). Unsaved changes are saved first when possible.
async function requestSignOut() {
  persistPendingLocally();
  if (pendingChangeCount() > 0) {
    try { await syncAll(); } catch (_) { /* unsynced rows stay on this device */ }
    if (pendingChangeCount() > 0 && !window.confirm('Some changes could not be synced yet. They stay saved on this device and will sync the next time you sign in. Sign out anyway?')) return;
  }
  signOutToLogin();
}

el('cashPeopleButton').addEventListener('click', openCashPeoplePanel);
el('closeCashPeoplePanel').addEventListener('click', () => el('cashPeopleDialog').close());
el('cashPeopleDialog').addEventListener('click', event => {
  if (event.target === el('cashPeopleDialog')) el('cashPeopleDialog').close();
});
el('staffForm').addEventListener('submit', submitStaffForm);
el('staffAmount').addEventListener('input', updateStaffPreview);
el('staffDate').addEventListener('change', () => { refreshStaffFormBalance(); updateStaffPreview(); });
el('staffAddNewButton').addEventListener('click', () => openStaffForm('new'));
el('staffFormBack').addEventListener('click', closeStaffForm);
el('staffFormCancel').addEventListener('click', closeStaffForm);
el('staffHistoryBack').addEventListener('click', () => showStaffView('list'));
el('staffHistoryAdd').addEventListener('click', () => {
  if (staffState.person) openStaffForm('add', staffState.person, 'history');
});
el('cashPeopleViewDate').addEventListener('change', () => {
  const value = el('cashPeopleViewDate').value;
  if (!value) return;
  cashPeopleViewDate = value;
  loadCashPeopleData({ force: true });
});
el('staffHistoryList').addEventListener('click', async event => {
  const button = event.target.closest('[data-entry-action]');
  if (!button || !canEdit('cash_vault')) return;
  const entry = (staffState.entries || []).find(item => item.id === button.dataset.entryId);
  if (!entry || !staffState.person) return;
  if (!isDateEditable(entry.txn_date)) { warnLockedEdit(button.dataset.entryAction === 'delete' ? 'delete' : 'edit'); return; }
  if (button.dataset.entryAction === 'edit') {
    openStaffForm('edit', staffState.person, 'history', entry);
    return;
  }
  if (!window.confirm(`Delete this entry?\n\n${formatDmy(entry.txn_date)} · ${formatSignedCashAdjustment(entry.amount)} AED${entry.note ? `\n${entry.note}` : ''}`)) return;
  button.disabled = true;
  try {
    const { data, error } = await supabase.rpc('delete_staff_transaction', { p_id: entry.id });
    if (error) throw error;
    showToast('Entry deleted.');
    invalidateCashSummaries();
    await Promise.all([refreshCashSummary(), loadCashPeopleData({ force: true })]);
    openStaffHistory(data || staffState.person.person_id);
  } catch (error) {
    button.disabled = false;
    showToast(explainLedgerError(error) || 'The entry could not be deleted.', true);
  }
});
el('cashPeopleBalanceList').addEventListener('click', event => {
  const button = event.target.closest('[data-staff-action]');
  if (!button) return;
  const person = cashPeople.find(item => item.person_id === button.dataset.personId);
  if (!person) return;
  if (button.dataset.staffAction === 'history') openStaffHistory(person.person_id);
  else openStaffForm('add', person, 'list');
});

/* ------------------------------------------------------------------ */
/* Excel export: Cash Vault, Expenses and Received (all dates, all rows) */
/* ------------------------------------------------------------------ */

function excelDateCell(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));
  if (!match) return value ?? '';
  const serial = Math.round((Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) - Date.UTC(1899, 11, 30)) / 86400000);
  return { t: 'n', v: serial, z: 'dd/mm/yyyy' };
}

function buildExportSheet(XLSX, columns, records, valueFor) {
  const matrix = [columns.map(column => column.label)];
  records.forEach(record => {
    matrix.push(columns.map(column => {
      if (column.kind === 'date') return excelDateCell(record[column.field]);
      return valueFor(record, column);
    }));
  });
  const sheet = XLSX.utils.aoa_to_sheet(matrix);
  sheet['!cols'] = columns.map(column => ({
    wch: column.kind === 'date' ? 12 : column.kind === 'text' ? 18 : Math.max(8, column.label.length + 2)
  }));
  return sheet;
}

async function exportToExcel() {
  const button = el('exportExcelButton');
  if (!currentUser) return;
  button.disabled = true;
  const originalLabel = button.textContent;
  button.textContent = 'Preparing…';
  try {
    if (pendingChangeCount() > 0) await syncAll();
    const [XLSX, cashRecords, expenseRecords, receivedRecords] = await Promise.all([
      import('https://esm.sh/xlsx@0.18.5'),
      fetchAllRows('cash_vault_counts', ['count_date', 'id']),
      fetchAllRows('expense_records', ['sort_order', 'created_at', 'id']),
      fetchAllRows('received_records', ['sort_order', 'created_at', 'id'])
    ]);

    const numberOrBlank = value => (value === '' || value == null ? 0 : Number(value));
    const cashSheet = buildExportSheet(XLSX, CASH_COUNT_COLUMNS, cashRecords, (record, column) => {
      if (column.kind === 'total') return calculateCashCountCents(record) / 100;
      return numberOrBlank(record[column.field]);
    });
    const expenseSheet = buildExportSheet(XLSX, COLUMNS, expenseRecords, (record, column) => {
      if (column.kind === 'total') return Number(calculateTotal(record, AMOUNT_FIELDS).toFixed(2));
      if (column.kind === 'amount') return numberOrBlank(record[column.field]);
      return record[column.field] ?? '';
    });
    const receivedSheet = buildExportSheet(XLSX, RECEIVING_COLUMNS, receivedRecords, (record, column) => {
      if (column.kind === 'total') return Number(calculateTotal(record, RECEIVING_AMOUNT_FIELDS).toFixed(2));
      if (column.kind === 'amount') return numberOrBlank(record[column.field]);
      return record[column.field] ?? '';
    });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, cashSheet, 'Cash Vault');
    XLSX.utils.book_append_sheet(workbook, expenseSheet, 'Expenses');
    XLSX.utils.book_append_sheet(workbook, receivedSheet, 'Received');
    XLSX.writeFile(workbook, `Expense-Vault-${localDateString()}.xlsx`);

    const unsaved = pendingChangeCount() > 0;
    showToast(unsaved
      ? 'Excel downloaded. Some changes were still being saved — export again in a moment to include them.'
      : 'Excel file downloaded.');
  } catch (error) {
    showToast(`Excel export failed: ${explainLedgerError(error)}`, true);
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

el('exportExcelButton').addEventListener('click', exportToExcel);
window.addEventListener('beforeunload', event => {
  persistPendingLocally();
  if (pendingChangeCount() > 0 || syncPromise || bulkTypeInFlight) { event.preventDefault(); event.returnValue = ''; }
});
window.addEventListener('pagehide', () => persistPendingLocally());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    persistPendingLocally();
    if (pendingChangeCount() > 0) syncAll(); // best effort when the tab is hidden or closed
  } else if (currentUser && !el('cashVaultPane').classList.contains('hidden')) {
    refreshCashSummary();
  }
});
window.addEventListener('online', () => {
  updateSyncIndicator();
  if (currentUser && pendingChangeCount() > 0) syncAll();
});
window.addEventListener('offline', updateSyncIndicator);
// Picks up changes made by other users / devices while the Cash Vault is open.
setInterval(() => {
  if (!currentUser || document.visibilityState !== 'visible') return;
  if (el('cashVaultPane').classList.contains('hidden')) return;
  refreshCashSummary();
}, 60000);

// ---------------------------------------------------------------------------
// Type-ahead: while typing a Supplier / Name / Merchant, complete it from the rows above
// (most recent first). The completed part is selected, so Enter/Tab accepts it and
// typing on or pressing Backspace discards it. Choosing a Supplier also fills in
// TRN# and Name from its most recent row when those cells are still empty.
// ---------------------------------------------------------------------------
function autocompleteInput(event, input, sourceRows, currentRow, field) {
  if (event.type !== 'input' || event.inputType !== 'insertText') return;
  if (input.type !== 'text' || document.activeElement !== input) return;
  const typed = input.value;
  if (!typed.trim()) return;
  if (input.selectionStart !== typed.length || input.selectionEnd !== typed.length) return;
  const lower = typed.toLowerCase();
  for (let index = sourceRows.length - 1; index >= 0; index -= 1) {
    const candidate = sourceRows[index];
    if (candidate === currentRow) continue;
    const text = String(candidate[field] ?? '');
    if (text.length > typed.length && text.toLowerCase().startsWith(lower)) {
      input.value = typed + text.slice(typed.length);
      try { input.setSelectionRange(typed.length, input.value.length); } catch (_) { /* ignore */ }
      return;
    }
  }
}

function autofillFromSupplier(row, tr) {
  const key = String(row.supplier ?? '').trim().toLowerCase();
  if (!key || isRowLocked(row, 'entry_date')) return;
  const needTrn = !row.trn_number || row.trn_number === '---';
  const needName = !String(row.spent_by ?? '').trim();
  if (!needTrn && !needName) return;
  let trn = '';
  let name = '';
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const other = rows[index];
    if (other === row || String(other.supplier ?? '').trim().toLowerCase() !== key) continue;
    if (!trn && other.trn_number && other.trn_number !== '---') trn = other.trn_number;
    if (!name && String(other.spent_by ?? '').trim()) name = other.spent_by;
    if (trn && name) break;
  }
  const setField = (field, value) => {
    row[field] = value;
    const input = tr?.querySelector(`[data-field="${field}"]`);
    if (input) input.value = value;
  };
  let filled = 0;
  if (needTrn && trn) { setField('trn_number', trn); filled += 1; }
  if (needName && name) { setField('spent_by', name); filled += 1; }
  if (filled) markRowDirty(row);
}

// ---------------------------------------------------------------------------
// Row order: press and hold a row, then drag it up or down. Saved rows store their
// position (sort_order) in the database; the position of a row is placed halfway
// between its new neighbours so only the moved row is updated.
// ---------------------------------------------------------------------------
function computeSortOrder(list, index) {
  const orderOf = item => (item?.sort_order == null || item.sort_order === '' ? null : Number(item.sort_order));
  let previous = null;
  let following = null;
  for (let i = index - 1; i >= 0; i -= 1) { const v = orderOf(list[i]); if (Number.isFinite(v)) { previous = v; break; } }
  for (let i = index + 1; i < list.length; i += 1) { const v = orderOf(list[i]); if (Number.isFinite(v)) { following = v; break; } }
  if (previous !== null && following !== null) {
    const middle = (previous + following) / 2;
    return middle > previous && middle < following ? middle : null;
  }
  if (previous !== null) return previous + 1;
  if (following !== null) return following - 1;
  return 1;
}

function applyMovedOrder(payload, row, list) {
  if (!row._orderMoved) return;
  const order = computeSortOrder(list, list.indexOf(row));
  if (order !== null) payload.sort_order = order;
}

function enableRowReorder({ tableElement, tbody, getRows, render, tableName, dateField, isBlank }) {
  const frame = tableElement.closest('.table-frame');
  const HOLD_MS = 450;
  let pending = null;
  let drag = null;
  let frameRequest = 0;

  const blockTouchScroll = event => { if (drag) event.preventDefault(); };
  const blockMenu = event => { if (pending || drag) event.preventDefault(); };

  function clearIndicators() {
    tbody.querySelectorAll('.drop-before, .drop-after').forEach(node => node.classList.remove('drop-before', 'drop-after'));
  }

  function updateTarget() {
    if (!drag) return;
    const trs = [...tbody.querySelectorAll('tr[data-client-id]')];
    if (!trs.length) return;
    const hit = document.elementFromPoint(drag.x, drag.y)?.closest('tr[data-client-id]');
    let target = null;
    let position = 'after';
    if (hit && tbody.contains(hit)) {
      const rect = hit.getBoundingClientRect();
      target = hit;
      position = drag.y < rect.top + rect.height / 2 ? 'before' : 'after';
    } else if (drag.y < trs[0].getBoundingClientRect().top) {
      target = trs[0]; position = 'before';
    } else if (drag.y > trs[trs.length - 1].getBoundingClientRect().bottom) {
      target = trs[trs.length - 1]; position = 'after';
    } else {
      return;
    }
    clearIndicators();
    drag.target = target;
    drag.position = position;
    if (target !== drag.tr) target.classList.add(position === 'before' ? 'drop-before' : 'drop-after');
  }

  function tick() {
    if (!drag) return;
    const rect = frame.getBoundingClientRect();
    const topEdge = rect.top + 80;
    if (drag.y < topEdge) frame.scrollTop -= Math.min(24, Math.max(4, (topEdge - drag.y) / 3));
    else if (drag.y > rect.bottom - 48) frame.scrollTop += Math.min(24, Math.max(4, (drag.y - (rect.bottom - 48)) / 3));
    updateTarget();
    frameRequest = requestAnimationFrame(tick);
  }

  function activate() {
    if (!pending) return;
    const row = getRows().find(item => item.clientId === pending.tr.dataset.clientId);
    if (!row) { stop(); return; }
    if (!canEdit(sectionOf(tableName)) || isBlank?.(row)) { stop(); return; }
    if (isRowLocked(row, dateField)) { warnLockedEdit(); stop(); return; }
    drag = { row, tr: pending.tr, x: pending.x, y: pending.y, target: null, position: 'after' };
    draggingClientId = row.clientId;
    pending = null;
    cancelSpreadsheetDrag();
    drag.tr.classList.add('row-dragging');
    document.body.classList.add('reordering-rows');
    try { navigator.vibrate?.(15); } catch (_) { /* not supported */ }
    frameRequest = requestAnimationFrame(tick);
  }

  function onMove(event) {
    if (pending) {
      pending.x = event.clientX;
      pending.y = event.clientY;
      if (Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY) > 6) stop();
    } else if (drag) {
      drag.x = event.clientX;
      drag.y = event.clientY;
      updateTarget();
    }
  }

  async function onUp() {
    const finished = drag;
    stop();
    if (!finished || !finished.target || finished.target === finished.tr) return;
    const list = getRows();
    const from = list.indexOf(finished.row);
    let to = list.findIndex(item => item.clientId === finished.target.dataset.clientId) + (finished.position === 'after' ? 1 : 0);
    if (from < 0 || to < 0) return;
    if (from < to) to -= 1;
    if (to === from) return;

    const snapshot = list.slice();
    list.splice(from, 1);
    list.splice(to, 0, finished.row);
    const restore = () => { list.splice(0, list.length, ...snapshot); render(); };

    if (!finished.row.id) {
      finished.row._orderMoved = true;
      render();
      return;
    }
    const order = computeSortOrder(list, to);
    if (order === null) {
      restore();
      showToast('The row could not be placed there. Move it a little further up or down.', true);
      return;
    }
    render();
    const { data, error } = await supabase.from(tableName).update({ sort_order: order }).eq('id', finished.row.id).select('sort_order').single();
    if (error) {
      restore();
      showToast(`The row could not be moved: ${explainLedgerError(error)}. Confirm migration 012 has been applied.`, true);
      return;
    }
    finished.row.sort_order = Number(data.sort_order);
    showToast('Row moved.');
  }

  function stop() {
    if (pending) clearTimeout(pending.timer);
    pending = null;
    cancelAnimationFrame(frameRequest);
    if (drag) drag.tr.classList.remove('row-dragging');
    tbody.querySelector('tr.row-dragging')?.classList.remove('row-dragging');
    draggingClientId = null;
    clearIndicators();
    document.body.classList.remove('reordering-rows');
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUpHandler);
    window.removeEventListener('pointercancel', onCancelHandler);
    window.removeEventListener('touchmove', blockTouchScroll);
    window.removeEventListener('contextmenu', blockMenu, true);
    drag = null;
  }

  const onUpHandler = () => { onUp(); };
  const onCancelHandler = () => { stop(); };

  tbody.addEventListener('pointerdown', event => {
    if (event.button !== 0 || pending || drag || !canEdit(sectionOf(tableName))) return;
    const tr = event.target.closest('tr[data-client-id]');
    if (!tr || tr.querySelector('td.cell-editing')) return;
    pending = {
      tr, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY,
      timer: setTimeout(activate, HOLD_MS)
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUpHandler);
    window.addEventListener('pointercancel', onCancelHandler);
    window.addEventListener('touchmove', blockTouchScroll, { passive: false });
    window.addEventListener('contextmenu', blockMenu, true);
  });
}


// Values come from the data model, so selections that run off screen (rows that are
// not rendered) still sum and copy correctly.
function modelTotalText(config, row) {
  if (config.cashTotals) return (calculateCashCountCents(row) / 100).toFixed(2);
  return formatBlankIfZero(calculateTotal(row, config.amountFields));
}

function modelCellText(config, rowIndex, colIndex) {
  const row = config.getRows()[rowIndex];
  const column = config.columns[colIndex];
  if (!row || !column) return '';
  const value = row[column.field];
  switch (column.kind) {
    case 'total': return modelTotalText(config, row);
    case 'date': return String(value || localDateString());
    case 'select': return String(value || 'Cash');
    case 'amount': return value === '' || value == null || Number(value) === 0 ? '' : String(value);
    default: return value == null ? '' : String(value);
  }
}

function modelCellNumber(config, rowIndex, colIndex) {
  const column = config.columns[colIndex];
  if (!column || !config.sumKinds.includes(column.kind)) return null;
  const raw = modelCellText(config, rowIndex, colIndex).replace(/,/g, '').trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) return null;
  return Number(raw);
}

function formatSelectionSum(value, auto) {
  const rounded = Math.round(value * 100) / 100;
  return rounded.toLocaleString('en-US', {
    minimumFractionDigits: auto && Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2
  });
}

// Shows the sum of the numeric cells in a multi-cell selection in the footer line.
function updateSelectionSum(config, range) {
  const node = el(config.sumElementId);
  config.lastRange = range;
  if (range) config.rememberedRange = range;
  if (!node) return;
  const hide = () => { node.textContent = ''; node.classList.add('hidden'); };
  if (!range || (range.minRow === range.maxRow && range.minCol === range.maxCol)) { hide(); return; }
  let sumCents = 0;
  let count = 0;
  for (let r = range.minRow; r <= range.maxRow; r += 1) {
    for (let c = range.minCol; c <= range.maxCol; c += 1) {
      const value = modelCellNumber(config, r, c);
      if (value == null) continue;
      sumCents += Math.round(value * 100);
      count += 1;
    }
  }
  if (!count) { hide(); return; }
  setText(node, `Sum ${formatSelectionSum(sumCents / 100, config.sumAuto)} · ${count} value${count === 1 ? '' : 's'}`);
  node.classList.remove('hidden');
}

// Delete / Backspace / Ctrl+X: clears free-entry cells (text, amounts, quantities)
// in the data model, including rows that are scrolled out of view.
function clearRangeValues(config, range, sheet) {
  if (!canEdit(sectionOf(config.autosaveKey))) return;
  const list = config.getRows();
  const clearable = new Set(['text', 'amount', 'quantity']);
  let lockedHit = false;
  const touched = [];
  for (let r = range.minRow; r <= range.maxRow; r += 1) {
    const model = list[r];
    if (!model) continue;
    if (config.isLocked?.(model)) { lockedHit = true; continue; }
    let changed = false;
    for (let c = range.minCol; c <= range.maxCol; c += 1) {
      const column = config.columns[c];
      if (!column || !clearable.has(column.kind)) continue;
      if (modelCellText(config, r, c) === '') continue;
      model[column.field] = '';
      changed = true;
    }
    if (changed) {
      model._dirty = true;
      model._isNew = Boolean(model._isNew || !model.id);
      touched.push(r);
    }
  }
  if (lockedHit) warnLockedEdit();
  if (!touched.length) return;
  touched.forEach(index => sheet.updateRow(index));
  config.setDirtyStatus();
  config.afterChange?.();
  scheduleAutosave(config.autosaveKey);
}

function sheetFor(tableElement) {
  return sheets.get(tableElement) || null;
}

function registerSpreadsheet(tableElement, config) {
  const paste = payload => applyGridPaste(config, payload);
  const refreshSum = () => updateSelectionSum(config, config.lastRange);
  tableElement.tBodies[0]?.addEventListener('input', refreshSum);
  tableElement.tBodies[0]?.addEventListener('change', refreshSum);
  let grid = null;
  const sheet = createVirtualSheet({
    table: tableElement,
    getRows: config.getRows,
    buildRow: config.buildRow,
    columnCount: config.columns.length,
    emptyHtml: config.emptyHtml,
    estimatedRowHeight: config.rowHeight,
    onRendered: () => grid?.repaint()
  });
  grid = createSpreadsheetGrid(tableElement, {
    columns: config.columns,
    getRowCount: () => config.getRows().length,
    getRowElement: index => sheet.rowElement(index),
    getRenderedRange: () => sheet.renderedRange(),
    ensureRowVisible: index => sheet.scrollToRow(index),
    getCellText: (row, col) => modelCellText(config, row, col),
    onClear: range => { clearRangeValues(config, range, sheet); refreshSum(); },
    onPaste: paste,
    onCopy: showCopyToast,
    onSelectionChange: range => updateSelectionSum(config, range),
    onLockedEdit: rowIndex => {
      const model = config.getRows()[rowIndex];
      if (model && config.isLocked?.(model)) warnLockedEdit();
    }
  });
  spreadsheetGrids.set(tableElement, grid);
  sheets.set(tableElement, sheet);
  sheetConfigs.set(tableElement, config);
  return sheet;
}

const sheets = new Map();
const sheetConfigs = new Map();

const expenseSheet = registerSpreadsheet(table, {
  columns: COLUMNS,
  amountFields: AMOUNT_FIELDS,
  getRows: () => rows,
  buildRow: createExpenseRowElement,
  rowHeight: 32,
  emptyHtml: 'No expense entries yet. Select “Add row” to create your first entry.',
  makeRow: makeEmptyRow,
  autosaveKey: 'expenses',
  sumElementId: 'expensesSelectionSum',
  sumKinds: ['amount', 'total'],
  isLocked: row => isRowLocked(row, 'entry_date'),
  render: renderTable,
  setDirtyStatus: () => { setSheetStatus(UNSYNCED_TEXT, 'dirty'); updateToolbar(); }
});
const receivedSheet = registerSpreadsheet(el('receivedTable'), {
  columns: RECEIVING_COLUMNS,
  amountFields: RECEIVING_AMOUNT_FIELDS,
  getRows: () => receivedRows,
  buildRow: createReceivedRowElement,
  rowHeight: 36,
  emptyHtml: 'No received entries yet. Select “Add row” to create your first entry.',
  makeRow: makeEmptyReceivedRow,
  autosaveKey: 'received',
  sumElementId: 'receivedSelectionSum',
  sumKinds: ['amount', 'total'],
  isLocked: row => isRowLocked(row, 'entry_date'),
  render: renderReceivedTable,
  setDirtyStatus: () => {
    receivedSheetStatus.textContent = UNSYNCED_TEXT;
    receivedSheetStatus.classList.add('dirty');
    receivedSheetStatus.classList.remove('error');
    updateReceivedToolbar();
  }
});
const cashSheet = registerSpreadsheet(el('cashCountTable'), {
  columns: CASH_COUNT_COLUMNS,
  cashTotals: true,
  getRows: () => cashCounts,
  buildRow: buildCashCountRow,
  rowHeight: 36,
  emptyHtml: 'No daily cash counts yet. Select “Add day” to enter today’s notes and coins.',
  afterChange: () => updateCashCountedSummary(),
  autosaveKey: 'cash',
  sumElementId: 'cashSelectionSum',
  sumKinds: ['quantity', 'total'],
  sumAuto: true,
  isLocked: row => isRowLocked(row, 'count_date'),
  render: renderCashCounts,
  setDirtyStatus: () => { setCashVaultStatus(UNSYNCED_TEXT, 'dirty'); updateCashCountToolbar(); updateCashCountedSummary(); }
});
// ---------------------------------------------------------------------------
// Change type of many rows at once (Expenses / Received → "Change type")
// ---------------------------------------------------------------------------
// Rows come from the cells you selected in the sheet (click the first row, Shift+click
// the last, or drag), or from every row of one date. Only rows inside the edit window
// can change. Saved rows are updated with one database request per 300 rows; Available
// Cash follows the change exactly (Bank → Cash adds the rows to the cash total, etc.).
const typeChange = { ledger: 'expenses', scope: 'selection', date: '', from: '', to: '' };

const typeChangeContext = ledger => ledger === 'received'
  ? { ledger, list: () => receivedRows, table: el('receivedTable'), sheet: receivedSheet, amountFields: RECEIVING_AMOUNT_FIELDS, isBlank: isBlankReceivedRow, tableName: 'received_records', label: 'Received', kind: 'received' }
  : { ledger, list: () => rows, table, sheet: expenseSheet, amountFields: AMOUNT_FIELDS, isBlank: isBlankExpenseRow, tableName: 'expense_records', label: 'Expenses', kind: 'expense' };

function typeChangeRange(context) {
  const range = sheetConfigs.get(context.table)?.rememberedRange;
  if (!range) return null;
  const last = Math.min(range.maxRow, context.list().length - 1);
  return last >= range.minRow ? { first: range.minRow, last } : null;
}

// Works out exactly which rows would change and why others are skipped.
function planTypeChange() {
  const context = typeChangeContext(typeChange.ledger);
  const list = context.list();
  let candidates = [];
  if (typeChange.scope === 'selection') {
    const range = typeChangeRange(context);
    if (range) candidates = list.slice(range.first, range.last + 1);
  } else if (typeChange.date) {
    candidates = list.filter(row => String(row.entry_date).slice(0, 10) === typeChange.date);
  }
  const plan = { context, change: [], locked: 0, blank: 0, already: 0, filtered: 0, total: candidates.length, cashDeltaCents: 0 };
  const asOf = workDate();
  for (const row of candidates) {
    if (context.isBlank(row)) { plan.blank += 1; continue; }
    const current = row.transaction_type || 'Cash';
    if (typeChange.from && current !== typeChange.from) { plan.filtered += 1; continue; }
    if (typeChange.to && current === typeChange.to) { plan.already += 1; continue; }
    if (isRowLocked(row, 'entry_date')) { plan.locked += 1; continue; }
    plan.change.push(row);
    if (typeChange.to) {
      const before = ledgerSnapshot(row, context.amountFields);
      const delta = snapshotContribution({ ...before, type: typeChange.to }, asOf) - snapshotContribution(before, asOf);
      plan.cashDeltaCents += context.ledger === 'received' ? delta : -delta;
    }
  }
  return plan;
}

function openTypeChange(ledger) {
  if (!canEdit(ledger)) { showToast('You have view-only access to this sheet.', true); return; }
  const context = typeChangeContext(ledger);
  typeChange.ledger = ledger;
  typeChange.scope = typeChangeRange(context) ? 'selection' : 'date';
  typeChange.date = typeChange.date || workDate();
  typeChange.from = '';
  typeChange.to = '';
  el('typeChangeTitle').textContent = `Change type · ${context.label}`;
  renderTypeChange();
  el('typeChangePanel').showModal();
}

function renderTypeChange() {
  const plan = planTypeChange();
  const context = plan.context;
  const range = typeChangeRange(context);
  const types = typesForLedger(context.ledger);
  const list = context.list();
  const usedTypes = [...new Set(list.map(row => row.transaction_type || 'Cash'))];
  const fromOptions = [...new Set([...types.map(type => type.name), ...usedTypes])];
  const firstDate = range ? formatDmy(list[range.first]?.entry_date) : '';
  const lastDate = range ? formatDmy(list[range.last]?.entry_date) : '';
  const count = plan.change.length;
  const notes = [];
  if (plan.locked) notes.push(`${plan.locked} older than the edit window (locked)`);
  if (plan.already) notes.push(`${plan.already} already ${escapeHtml(typeChange.to)}`);
  if (plan.filtered) notes.push(`${plan.filtered} of another type`);
  if (plan.blank) notes.push(`${plan.blank} empty`);
  const cashText = !typeChange.to || !plan.cashDeltaCents ? ''
    : `Available Cash will ${plan.cashDeltaCents > 0 ? 'increase' : 'decrease'} by AED ${formatCashMoney(Math.abs(plan.cashDeltaCents) / 100)}.`;

  el('typeChangeBody').innerHTML = `
    <div class="sp-toolbar ap-tight"><span class="sp-section-label">1 · ROWS</span></div>
    <label class="ri-choice ${range ? '' : 'ap-disabled'}"><input type="radio" name="tcScope" value="selection" ${typeChange.scope === 'selection' ? 'checked' : ''} ${range ? '' : 'disabled'}>
      <span><strong>Selected rows</strong><small>${range ? `${range.last - range.first + 1} row${range.last === range.first ? '' : 's'} · rows ${range.first + 1}–${range.last + 1}${firstDate ? ` · ${firstDate}${lastDate !== firstDate ? ` to ${lastDate}` : ''}` : ''}` : 'Select cells in the rows first (click the first row, Shift+click the last), then open Change type'}</small></span></label>
    <label class="ri-choice"><input type="radio" name="tcScope" value="date" ${typeChange.scope === 'date' ? 'checked' : ''}>
      <span><strong>All rows dated</strong><small>Every ${escapeHtml(context.label)} row with this date</small></span>
      <input class="tc-date" type="date" value="${escapeHtml(typeChange.date)}" min="${escapeHtml(editCutoffDate())}" aria-label="Date"></label>
    <div class="sp-field tc-from"><label for="tcFrom">Only rows that are currently</label>
      <select id="tcFrom"><option value="">Any type</option>${fromOptions.map(name => `<option value="${escapeHtml(name)}" ${typeChange.from === name ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}</select></div>

    <div class="sp-toolbar ap-tight"><span class="sp-section-label">2 · NEW TYPE</span></div>
    <div class="tc-types">
      ${types.map(type => `<label class="tc-type ${typeChange.to === type.name ? 'on' : ''}"><input type="radio" name="tcTo" value="${escapeHtml(type.name)}" ${typeChange.to === type.name ? 'checked' : ''}><strong>${escapeHtml(type.name)}</strong><small>${type.counts_as_cash ? 'Counts as cash' : 'Not cash'}</small></label>`).join('')}
    </div>
    ${currentUser?.role === 'owner' ? '<p class="sp-help">Need another type? Add it in Settings → Payment types.</p>' : ''}

    <div class="tc-summary ${count && typeChange.to ? 'ready' : ''}">
      <strong>${typeChange.to ? `${count} row${count === 1 ? '' : 's'} will change to ${escapeHtml(typeChange.to)}` : `${count} row${count === 1 ? '' : 's'} can change`}</strong>
      ${notes.length ? `<small>Skipped: ${notes.join(' · ')}</small>` : ''}
      ${cashText ? `<small>${cashText}</small>` : ''}
    </div>
    <p class="sp-message" id="typeChangeMessage" role="status" aria-live="polite"></p>
    <div class="sp-actions"><button class="sp-btn sp-btn-primary" type="button" id="typeChangeApply" ${count && typeChange.to && !bulkTypeInFlight ? '' : 'disabled'}>${typeChange.to && count ? `Change ${count} row${count === 1 ? '' : 's'}` : 'Change type'}</button><button class="sp-btn" type="button" data-close-panel>Cancel</button></div>`;
}

async function applyTypeChange() {
  const plan = planTypeChange();
  const target = typeChange.to;
  if (!plan.change.length || !target) return;
  const { context } = plan;
  const bulk = [];
  plan.change.forEach(row => {
    const savedAndClean = Boolean(row.id) && !row._dirty;
    row.transaction_type = target;
    row._dirty = true;
    if (savedAndClean) { row._bulk = true; bulk.push(row); }
  });
  context.sheet.refresh();
  persistPendingLocally();
  scheduleCashPositionRender();
  el('typeChangePanel').close();
  const total = plan.change.length;
  showToast(`Changing ${total} row${total === 1 ? '' : 's'} to ${target}…`);
  if (plan.change.length > bulk.length) scheduleAutosave(context.ledger); // new / already edited rows

  if (!bulk.length) return;
  bulkTypeInFlight += 1;
  updateSyncIndicator();
  let failed = 0;
  try {
    await runLedgerTask(async () => {
      for (let start = 0; start < bulk.length; start += 300) {
        const chunk = bulk.slice(start, start + 300).filter(row => context.list().includes(row) && row.id);
        if (!chunk.length) continue;
        const { data, error } = await supabase.from(context.tableName)
          .update({ transaction_type: target })
          .in('id', chunk.map(row => row.id))
          .select('id, transaction_type, updated_at');
        const done = new Map((error ? [] : data || []).map(record => [record.id, record]));
        chunk.forEach(row => {
          const record = done.get(row.id);
          row._bulk = false;
          if (!record) { failed += 1; return; } // stays dirty: normal autosave retries it
          const before = row._base ?? null;
          const after = before ? { ...before, type: record.transaction_type } : ledgerSnapshot({ ...row, transaction_type: record.transaction_type }, context.amountFields);
          recordLedgerCommit(context.kind === 'received' ? 'received' : 'expense', before, after);
          row._base = after;
          row.updated_at = record.updated_at;
          row._dirty = (row.transaction_type || 'Cash') !== record.transaction_type;
        });
      }
    });
  } finally {
    bulk.forEach(row => { row._bulk = false; });
    bulkTypeInFlight -= 1;
  }
  context.sheet.refresh();
  persistPendingLocally();
  scheduleCashPositionRender();
  scheduleSummaryRefresh();
  updateSyncIndicator();
  if (failed) {
    showToast(`${total - failed} changed to ${target}. ${failed} could not be updated in one go and will be saved one by one.`, true);
    scheduleAutosave(context.ledger);
  } else {
    showToast(`${total} row${total === 1 ? '' : 's'} changed to ${target}.`);
  }
}

el('changeTypeExpensesButton').addEventListener('click', () => openTypeChange('expenses'));
el('changeTypeReceivedButton').addEventListener('click', () => openTypeChange('received'));
el('typeChangePanel').addEventListener('click', event => {
  if (event.target === el('typeChangePanel') || event.target.closest('[data-close-panel]')) el('typeChangePanel').close();
  if (event.target.closest('#typeChangeApply')) applyTypeChange();
});
el('typeChangePanel').addEventListener('change', event => {
  const target = event.target;
  if (target.name === 'tcScope') typeChange.scope = target.value;
  else if (target.name === 'tcTo') typeChange.to = target.value;
  else if (target.id === 'tcFrom') typeChange.from = target.value;
  else if (target.classList.contains('tc-date')) { typeChange.date = target.value; typeChange.scope = 'date'; }
  renderTypeChange();
});
el('closeTypeChangePanel').addEventListener('click', () => el('typeChangePanel').close());

const accountPanel = createAccountPanel({
  callAccess,
  showToast,
  signOut: () => requestSignOut(),
  getPaymentTypes: () => paymentTypes,
  paymentTypesManaged: () => paymentTypesManaged,
  updatePaymentType,
  addPaymentType,
  deletePaymentType,
  onProfileChanged: profile => { currentUser = { ...currentUser, name: profile.name, avatar: profile.avatar }; }
});

setupReceiptImport({
  canWrite: () => canEdit('expenses') && permissions.import,
  ensureExpensesLoaded,
  expenseTypes: () => typesForLedger('expenses'),
  isCashType: name => cashTypeNames.has(name),
  existingInvoiceNumbers,
  addExpenseEntries,
  workDate,
  editCutoffDate,
  isDateEditable,
  formatDmy,
  editWindowDays: EDIT_WINDOW_DAYS,
  showToast
});


enableRowReorder({ tableElement: table, tbody: tableBody, getRows: () => rows, render: renderTable, tableName: 'expense_records', dateField: 'entry_date', isBlank: isBlankExpenseRow });
enableRowReorder({ tableElement: el('receivedTable'), tbody: receivedTableBody, getRows: () => receivedRows, render: renderReceivedTable, tableName: 'received_records', dateField: 'entry_date', isBlank: isBlankReceivedRow });

el('cashAsOfDate').value = localDateString();
syncCashDateControls();
buildTableHeader();
buildReceivingTableHeader();
buildCashTableHeader();

// Restore the saved login before showing the access-key form so a page refresh
// goes straight back into the workspace. Only an explicit Sign out (or a session
// the server confirms is no longer valid) sends the person back to the key form.
async function restoreBrowserSession() {
  authScreen.classList.add('restoring');
  let restored = false;
  try {
    const diagnosticsBeforeRestore = getEncryptedSessionDiagnostics();
    console.info('[ExpenseVault] Browser-session restore check.', diagnosticsBeforeRestore);

    if (!diagnosticsBeforeRestore.browserSessionCookiePresent) {
      // Nothing to restore: first visit, signed out, or browser data was cleared.
      return;
    }

    // Read the encrypted value directly as well as through Supabase Auth. This
    // provides a deterministic recovery path if the SDK's first initialization
    // raced the async IndexedDB key lookup on a page refresh.
    const encryptedSessionJson = await encryptedAuthStorage.getItem(EXPENSE_VAULT_AUTH_STORAGE_KEY);
    let encryptedSession = null;
    if (encryptedSessionJson) {
      try {
        encryptedSession = JSON.parse(encryptedSessionJson);
      } catch (_) {
        throw new Error('The saved encrypted session is not valid JSON. Please sign in again.');
      }
      if (!encryptedSession?.access_token || !encryptedSession?.refresh_token) {
        throw new Error('The saved encrypted session is incomplete. Please sign in again.');
      }
    }

    let { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    // If the encrypted adapter has a valid session but the SDK did not hydrate
    // it during startup, explicitly restore the two tokens through Supabase Auth.
    if (!data.session?.access_token && encryptedSession) {
      const hydrated = await supabase.auth.setSession({
        access_token: encryptedSession.access_token,
        refresh_token: encryptedSession.refresh_token
      });
      if (hydrated.error) throw hydrated.error;
      data = hydrated.data;
      await encryptedAuthStorage.setItem(EXPENSE_VAULT_AUTH_STORAGE_KEY, JSON.stringify(data.session || encryptedSession));
    }

    if (!data.session?.access_token) {
      const latestDiagnostics = getEncryptedSessionDiagnostics();
      console.warn('[ExpenseVault] Browser-session marker exists but no restorable session was found.', latestDiagnostics);
      if (latestDiagnostics.encryptedBlobPresent) {
        loginMessage.textContent = 'The saved session could not be restored. Please enter your access key; if this repeats, browser storage may be blocked.';
      }
      return;
    }

    await loadWorkspace();
    restored = true;
  } catch (error) {
    const message = error?.message || 'Could not restore the saved browser session.';
    const isInvalidSession = /sign in again|session has expired|no longer active|invalid jwt|invalid token|not authenticated|refresh token.*(invalid|not found|already used)|invalid refresh token/i.test(message);
    if (isInvalidSession) {
      clearBrowserSessionCookie();
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      loginMessage.textContent = 'Your saved session is no longer valid. Please enter your access key again.';
    } else {
      // Likely a temporary problem such as being offline: keep the saved session
      // so a refresh can try again, and let the person use their key meanwhile.
      console.error('[ExpenseVault] Browser-session restore failed:', message);
      loginMessage.textContent = `Could not restore the saved session (${message}). Refresh to try again, or enter your access key.`;
    }
  } finally {
    authScreen.classList.remove('restoring');
    if (!restored) el('loginKey').focus();
  }
}

restoreBrowserSession();
