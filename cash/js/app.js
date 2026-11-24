import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  beginBrowserSession,
  clearBrowserSessionCookie,
  clearLegacyPlaintextSession,
  createEncryptedBrowserSessionStorage,
  EXPENSE_VAULT_AUTH_STORAGE_KEY,
  getEncryptedSessionDiagnostics,
  getEncryptedSessionPersistenceStatus
} from './secure-session-storage.js';
import { cancelSpreadsheetDrag, clearAllSpreadsheetSelections, createSpreadsheetGrid } from './spreadsheet-grid.js?v=work-date-10';

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
const saveButton = el('saveRowsButton');
const addButton = el('addRowButton');
const deleteButton = el('deleteRowButton');
const sheetStatus = el('sheetStatus');
const toast = el('toast');
const receivedTableBody = el('receivedTableBody');
const receivedHeaderRow = el('receivedHeaderRow');
const receivedSaveButton = el('saveReceivedRowsButton');
const receivedAddButton = el('addReceivedRowButton');
const receivedDeleteButton = el('deleteReceivedRowButton');
const receivedSheetStatus = el('receivedSheetStatus');
const cashTableBody = el('cashCountTableBody');
const cashHeaderRow = el('cashCountHeaderRow');
const cashSaveButton = el('saveCashCountsButton');
const cashAddButton = el('addCashCountButton');
const cashDeleteButton = el('deleteCashCountButton');
const cashVaultStatus = el('cashVaultStatus');

let currentUser = null;
let canWrite = false;
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
  sheetStatus.textContent = message;
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
  cashVaultStatus.textContent = message;
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

function setActiveTab(tabName) {
  clearAllSpreadsheetSelections();
  document.querySelectorAll('.tab-button').forEach(button => {
    button.classList.toggle('active', button.dataset.tab === tabName);
  });
  el('cashVaultPane').classList.toggle('hidden', tabName !== 'cash-vault');
  el('expensesPane').classList.toggle('hidden', tabName !== 'expenses');
  el('receivedPane').classList.toggle('hidden', tabName !== 'received');
  if (tabName === 'cash-vault') {
    if (!cashVaultLoaded && !cashVaultLoading) loadCashVault();
    else if (cashVaultLoaded) refreshCashSummary();
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

function renderCell(row, column, amountFields = AMOUNT_FIELDS) {
  const value = row[column.field] ?? '';
  const disabled = (canWrite && !isRowLocked(row, 'entry_date')) ? '' : 'disabled';
  if (column.kind === 'total') {
    return `<input class="cell-input total-cell" type="text" value="${formatBlankIfZero(calculateTotal(row, amountFields))}" readonly tabindex="-1" aria-label="Calculated row total">`;
  }
  if (column.kind === 'select') {
    return `<select class="cell-input" data-field="${column.field}" ${disabled} aria-label="${column.label}">
      <option value="Cash" ${value === 'Cash' ? 'selected' : ''}>Cash</option>
      <option value="Bank" ${value === 'Bank' ? 'selected' : ''}>Bank</option>
    </select>`;
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
  const disabled = (canWrite && !isRowLocked(row, 'count_date')) ? '' : 'disabled';
  if (column.kind === 'total') {
    return `<input class="cell-input total-cell cash-row-total" type="text" value="${formatCashMoney(calculateCashCountCents(row) / 100)}" readonly tabindex="-1" aria-label="Calculated cash count total">`;
  }
  if (column.kind === 'date') {
    return `<input class="cell-input cash-date-cell" type="date" list="cashRecentDates" data-field="${column.field}" value="${escapeHtml(value || localDateString())}" ${disabled} aria-label="Count date">`;
  }
  return `<input class="cell-input quantity-cell" type="number" inputmode="numeric" min="0" max="2147483647" step="1" data-field="${column.field}" value="${escapeHtml(value)}" ${disabled} aria-label="Number of ${column.label} notes or coins">`;
}

function updateCashCountToolbar() {
  const dirty = cashCounts.some(row => row._dirty);
  cashSaveButton.disabled = !canWrite || !dirty;
  cashAddButton.disabled = !canWrite;
  cashDeleteButton.disabled = !canWrite || !selectedCashClientId;
  el('cashVaultPermissionNote').textContent = withEditWindow(currentUser?.role === 'owner'
    ? 'Owner · full access'
    : (canWrite ? 'Write access enabled' : 'View-only access'));
}

function updateCashCountedSummary() {
  const selectedDate = el('cashAsOfDate').value || localDateString();
  const row = cashCounts.find(item => item.count_date === selectedDate);
  const amount = row ? calculateCashCountCents(row) / 100 : 0;
  el('cashCountedValue').textContent = formatCashMoney(amount);
  el('cashCountedNote').textContent = row
    ? (row._dirty ? `Unsaved physical count for ${formatDateLabel(selectedDate)}` : `Physical notes and coins counted on ${formatDateLabel(selectedDate)}`)
    : `No physical count saved for ${formatDateLabel(selectedDate)}`;
  updateCashReconciliation(row, amount);
}

function updateCashReconciliation(row, countedAmount) {
  const banner = el('cashReconciliationBanner');
  const balanceCard = document.querySelector('.cash-balance-card');
  const countedCard = document.querySelector('.cash-counted-card');
  const balanceValue = el('cashBalanceValue');
  [banner, balanceCard, countedCard, balanceValue, el('cashCountedValue')].forEach(node => {
    node?.classList.remove('variance-alert', 'variance-match', 'needs-count');
  });

  if (cashAvailableBalance == null) {
    banner.classList.add('needs-count');
    el('cashReconciliationTitle').textContent = 'Cash reconciliation unavailable';
    el('cashVarianceValue').textContent = '—';
    el('cashVarianceNote').textContent = 'The ledger balance has not loaded yet.';
    return;
  }
  if (!row || !row.id || row._dirty) {
    banner.classList.add('needs-count');
    el('cashReconciliationTitle').textContent = row?._dirty ? 'Cash count has unsaved changes' : 'Physical cash count required';
    el('cashVarianceValue').textContent = '—';
    el('cashVarianceNote').textContent = 'Save the selected date’s physical denomination count to compare it with Available Cash.';
    return;
  }

  const difference = Number((countedAmount - cashAvailableBalance).toFixed(2));
  if (Math.abs(difference) < 0.01) {
    banner.classList.add('variance-match');
    balanceCard.classList.add('variance-match');
    countedCard.classList.add('variance-match');
    el('cashReconciliationTitle').textContent = 'Cash balanced';
    el('cashVarianceValue').textContent = formatCashMoney(0);
    el('cashVarianceNote').textContent = 'Available Cash and Cash Counted match for the selected date.';
  } else {
    banner.classList.add('variance-alert');
    balanceCard.classList.add('variance-alert');
    countedCard.classList.add('variance-alert');
    balanceValue.classList.add('variance-alert');
    el('cashCountedValue').classList.add('variance-alert');
    el('cashReconciliationTitle').textContent = difference > 0 ? 'Physical cash is higher than the ledger' : 'Physical cash is lower than the ledger';
    el('cashVarianceValue').textContent = `${difference > 0 ? '+' : '−'}${formatCashMoney(Math.abs(difference))}`;
    el('cashVarianceNote').textContent = 'Difference between Cash Counted and Available Cash. Both figures are highlighted until reconciled.';
  }
}

function renderCashCounts() {
  resetSheetSelection(el('cashCountTable'));
  cashTableBody.innerHTML = '';
  const selectedDate = el('cashAsOfDate').value || localDateString();
  if (cashCounts.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = CASH_COUNT_COLUMNS.length;
    td.className = 'empty-state';
    td.textContent = 'No daily cash counts yet. Select “Add day” to enter today’s notes and coins.';
    tr.appendChild(td);
    cashTableBody.appendChild(tr);
  } else {
    cashCounts.forEach((row, rowIndex) => {
      const tr = document.createElement('tr');
      tr.dataset.clientId = row.clientId;
      tr.dataset.rowIndex = String(rowIndex);
      tr.classList.toggle('selected', row.clientId === selectedCashClientId);
      tr.classList.toggle('dirty-row', Boolean(row._dirty));
      tr.classList.toggle('cash-current-date', row.count_date === selectedDate);
      tr.classList.toggle('locked-row', isRowLocked(row, 'count_date'));
      tr.innerHTML = CASH_COUNT_COLUMNS.map((column, colIndex) => `<td data-row-index="${rowIndex}" data-col-index="${colIndex}">${renderCashCountCell(row, column)}</td>`).join('');
      cashTableBody.appendChild(tr);
    });
  }
  el('cashVaultDateCount').textContent = `${cashCounts.length} ${cashCounts.length === 1 ? 'daily count' : 'daily counts'}`;
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
  cashTableBody.querySelectorAll('tr[data-client-id]').forEach(tr => {
    tr.classList.toggle('selected', tr.dataset.clientId === clientId);
    tr.classList.toggle('cash-current-date', tr.querySelector('input[data-field="count_date"]')?.value === (el('cashAsOfDate').value || localDateString()));
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
  setCashVaultStatus('Unsaved changes', 'dirty');
  const totalInput = tr.querySelector('.cash-row-total');
  if (totalInput) totalInput.value = formatCashMoney(calculateCashCountCents(row) / 100);
  if (field === 'count_date' && row.clientId === selectedCashClientId && row.count_date) {
    el('cashAsOfDate').value = row.count_date;
    syncCashDateControls();
    refreshCashSummary();
  } else if (row.count_date === (el('cashAsOfDate').value || localDateString())) {
    updateCashCountedSummary();
  }
  tr.classList.toggle('cash-current-date', row.count_date === (el('cashAsOfDate').value || localDateString()));
  updateCashCountToolbar();
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

async function refreshCashSummary() {
  if (!currentUser) return;
  const selectedDate = el('cashAsOfDate').value || localDateString();
  const requestId = ++cashSummaryRequestId;
  el('cashBalanceCaption').textContent = `As of ${formatDateLabel(selectedDate)} · Cash ledger minus staff balances`;
  const { data, error } = await supabase.rpc('get_cash_vault_summary', { p_as_of: selectedDate });
  if (requestId !== cashSummaryRequestId) return;
  if (error) {
    cashAvailableBalance = null;
    el('cashBalanceValue').textContent = 'Unavailable';
    el('cashBalanceValue').classList.remove('negative', 'variance-alert');
    el('cashReceivedValue').textContent = '—';
    el('cashExpensesValue').textContent = '—';
    el('cashPeopleAdjustmentValue').textContent = '—';
    showToast(`Unable to calculate cash balance: ${explainLedgerError(error)}. Confirm migrations 005, 006, 008, 009, 010 and 011 have been applied.`, true);
    updateCashCountedSummary();
    return;
  }
  const summary = Array.isArray(data) ? data[0] : data;
  const received = Number(summary?.received_cash ?? 0);
  const expenses = Number(summary?.expense_cash ?? 0);
  const personPositive = Number(summary?.person_cash_given ?? 0);
  const personNegative = Number(summary?.person_cash_received ?? 0);
  const peopleAdjustment = personPositive - personNegative;
  const available = Number(summary?.available_cash ?? received - expenses - peopleAdjustment);
  cashAvailableBalance = available;
  el('cashReceivedValue').textContent = formatCashMoney(received);
  el('cashExpensesValue').textContent = formatCashMoney(expenses);
  el('cashPeopleAdjustmentValue').textContent = formatSignedCashAdjustment(peopleAdjustment);
  el('cashPeopleAdjustmentValue').classList.toggle('person-positive', peopleAdjustment > 0.0001);
  el('cashPeopleAdjustmentValue').classList.toggle('person-negative', peopleAdjustment < -0.0001);
  el('cashBalanceValue').textContent = formatCashMoney(available);
  el('cashBalanceValue').classList.toggle('negative', available < 0);
  el('cashBalanceCaption').textContent = `As of ${formatDateLabel(selectedDate)} · Received − Expenses − Staff balance`;
  updateCashCountedSummary();
}

async function reloadCashCountRows() {
  const { data, error } = await supabase
    .from('cash_vault_counts')
    .select('*')
    .order('count_date', { ascending: true });
  if (error) throw error;

  cashCounts = (data || []).map(record => ({
    ...record,
    clientId: record.id,
    _dirty: false,
    _isNew: false
  }));
  if (!cashCounts.some(row => row.clientId === selectedCashClientId)) selectedCashClientId = null;
  buildCashTableHeader();
  renderCashCounts();
  return cashCounts;
}

async function loadCashVault() {
  if (!currentUser || cashVaultLoading) return;
  cashVaultLoading = true;
  cashAddButton.disabled = true;
  setCashVaultStatus('Loading daily cash counts…');
  if (!el('cashAsOfDate').value) el('cashAsOfDate').value = localDateString();
  syncCashDateControls();

  try {
    await reloadCashCountRows();
    scrollSheetToBottom(el('cashCountTable'));
    cashVaultLoaded = true;
    cashVaultLoading = false;
    cashAddButton.disabled = !canWrite;
    setCashVaultStatus('All changes saved');
    await refreshCashSummary();
  } catch (error) {
    cashVaultLoading = false;
    cashAddButton.disabled = !canWrite;
    setCashVaultStatus('Could not load cash counts', 'error');
    showToast(`Unable to load Cash Vault counts: ${explainLedgerError(error)}. Apply migration 005 if it has not been run.`, true);
  }
}

async function saveCashCountChanges() {
  if (!canWrite) return;
  const dirtyRows = cashCounts.filter(row => row._dirty);
  if (!dirtyRows.length) return;
  cashSaveButton.disabled = true;
  setCashVaultStatus('Saving cash counts…');
  let saved = 0;
  const failures = [];

  for (const row of dirtyRows) {
    try {
      const payload = getCashCountPayload(row);
      let result;
      if (row.id) {
        // Person movements also adjust this row. Use updated_at as an
        // optimistic lock so a stale browser tab cannot overwrite a note/coin
        // adjustment committed by another user or by a movement RPC.
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
      const savedRow = { ...result.data, clientId: result.data.id, _dirty: false, _isNew: false };
      const index = cashCounts.findIndex(item => item.clientId === row.clientId);
      if (index >= 0) cashCounts[index] = savedRow;
      saved++;
    } catch (error) {
      failures.push(error.message || 'Unknown save error');
      row._dirty = true;
    }
  }

  cashCounts.sort((a, b) => String(a.count_date).localeCompare(String(b.count_date)));
  renderCashCounts();
  if (failures.length) {
    setCashVaultStatus(`${saved} saved · ${failures.length} need attention`, 'error');
    showToast(`Some cash counts were not saved: ${failures[0]}`, true);
  } else {
    setCashVaultStatus('All changes saved');
    showToast(`${saved} ${saved === 1 ? 'daily count' : 'daily counts'} saved successfully.`);
  }
  await refreshCashSummary();
}

async function deleteSelectedCashCount() {
  if (!canWrite || !selectedCashClientId) return;
  const row = cashCounts.find(item => item.clientId === selectedCashClientId);
  if (!row) return;
  if (isRowLocked(row, 'count_date')) { warnLockedEdit('delete'); return; }
  if (!window.confirm(`Delete the cash count for ${formatDateLabel(row.count_date)}? This cannot be undone.`)) return;
  cashDeleteButton.disabled = true;
  if (row.id) {
    const { data, error } = await supabase.from('cash_vault_counts').delete().eq('id', row.id).select('id');
    if (error || !data?.length) {
      showToast(error?.message || 'The cash count could not be deleted. Check your access permission.', true);
      updateCashCountToolbar();
      return;
    }
  }
  cashCounts = cashCounts.filter(item => item.clientId !== selectedCashClientId);
  selectedCashClientId = null;
  renderCashCounts();
  setCashVaultStatus('Cash count deleted');
  showToast('Selected daily cash count deleted.');
  await refreshCashSummary();
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
  el('staffAddNewButton').classList.toggle('hidden', !canWrite);

  const list = el('cashPeopleBalanceList');
  if (!count) {
    list.innerHTML = `<p class="muted sp-empty">No staff balances on or before ${escapeHtml(formatDmy(cashPeopleViewDate))}.${canWrite ? ' Use “Add New” to add a staff member.' : ''}</p>`;
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
      ${canWrite ? `<button class="sp-btn sp-btn-small" type="button" data-staff-action="add" data-person-id="${id}">+ Add</button>` : ''}
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
  if (!canWrite) { showToast('This access key is view-only. Staff Balance cannot be changed.', true); return; }
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
  if (!canWrite) return;
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
    button.disabled = !canWrite;
  }
}

async function openStaffHistory(personId) {
  const person = cashPeople.find(item => item.person_id === personId) || staffState.person;
  if (!person) return;
  staffState.person = { ...person };
  el('staffHistoryName').textContent = person.person_name;
  el('staffHistorySub').textContent = 'Loading history…';
  el('staffHistoryList').innerHTML = '';
  el('staffHistoryAdd').classList.toggle('hidden', !canWrite);
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
    if (!canWrite) return '';
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
  cashTableBody.querySelectorAll('tr[data-client-id]').forEach(tr => {
    const dateInput = tr.querySelector('input[data-field="count_date"]');
    tr.classList.toggle('cash-current-date', dateInput?.value === el('cashAsOfDate').value);
  });
  updateCashCountedSummary();
  refreshCashSummary();
}

function renderTable() {
  resetSheetSelection(table);
  tableBody.innerHTML = '';
  if (rows.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = COLUMNS.length;
    td.className = 'empty-state';
    td.textContent = 'No expense entries yet. Select “Add row” to create your first entry.';
    tr.appendChild(td);
    tableBody.appendChild(tr);
  } else {
    el('recentDates').innerHTML = recentDateOptions().map(date => `<option value="${date}"></option>`).join('');
    rows.forEach((row, rowIndex) => {
      const tr = document.createElement('tr');
      tr.dataset.clientId = row.clientId;
      tr.dataset.rowIndex = String(rowIndex);
      tr.classList.toggle('selected', row.clientId === selectedClientId);
      tr.classList.toggle('dirty-row', Boolean(row._dirty));
      tr.classList.toggle('locked-row', isRowLocked(row, 'entry_date'));
      tr.innerHTML = COLUMNS.map((column, colIndex) => `<td data-row-index="${rowIndex}" data-col-index="${colIndex}">${renderCell(row, column)}</td>`).join('');
      tableBody.appendChild(tr);
    });
  }
  el('recordCount').textContent = `${rows.length} ${rows.length === 1 ? 'record' : 'records'}`;
  updateToolbar();
}

function updateToolbar() {
  const dirty = rows.some(row => row._dirty);
  saveButton.disabled = !canWrite || !dirty;
  addButton.disabled = !canWrite;
  deleteButton.disabled = !canWrite || !selectedClientId;
  el('permissionNote').textContent = withEditWindow(currentUser?.role === 'owner' ? 'Owner · full access' : (canWrite ? 'Write access enabled' : 'View-only access'));
}

function updateReceivedToolbar() {
  const dirty = receivedRows.some(row => row._dirty);
  receivedSaveButton.disabled = !canWrite || !dirty;
  receivedAddButton.disabled = !canWrite;
  receivedDeleteButton.disabled = !canWrite || !selectedReceivedClientId;
  el('receivedPermissionNote').textContent = withEditWindow(currentUser?.role === 'owner' ? 'Owner · full access' : (canWrite ? 'Write access enabled' : 'View-only access'));
}

function selectRow(clientId) {
  selectedClientId = clientId;
  tableBody.querySelectorAll('tr[data-client-id]').forEach(tr => {
    tr.classList.toggle('selected', tr.dataset.clientId === clientId);
  });
  updateToolbar();
}

function rowFromDatabase(record) {
  return { ...record, clientId: record.id, _dirty: false, _isNew: false };
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
  const info = await callAccess('me');
  currentUser = info;
  canWrite = info.role === 'owner' || Boolean(info.can_write);
  el('accessBadge').textContent = info.role === 'owner' ? 'Owner · Full access' : (canWrite ? 'Editor access' : 'View-only access');
  el('accessKeysButton').classList.toggle('hidden', info.role !== 'owner');
  addButton.disabled = !canWrite;
  saveButton.disabled = true;
  deleteButton.disabled = true;
  el('permissionNote').textContent = withEditWindow(info.role === 'owner' ? 'Owner · full access' : (canWrite ? 'Write access enabled' : 'View-only access'));
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
  setActiveTab('cash-vault');
}

async function loadExpenses() {
  if (!currentUser || expensesLoading) return;
  expensesLoading = true;
  addButton.disabled = true;
  setSheetStatus('Loading records…');
  const { data, error } = await supabase
    .from('expense_records')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    expensesLoading = false;
    addButton.disabled = !canWrite;
    setSheetStatus('Could not load records', 'error');
    showToast(`Unable to load expenses: ${explainLedgerError(error)}`, true);
    return;
  }
  const localUnsaved = rows.filter(row => row._isNew && row._dirty);
  rows = (data || []).map(rowFromDatabase);
  rows.push(...localUnsaved);
  if (!rows.some(row => row.clientId === selectedClientId)) selectedClientId = null;
  renderTable();
  scrollSheetToBottom(table);
  expensesLoaded = true;
  expensesLoading = false;
  addButton.disabled = !canWrite;
  const hasDirty = rows.some(row => row._dirty);
  setSheetStatus(hasDirty ? 'Unsaved changes' : 'All changes saved', hasDirty ? 'dirty' : 'normal');
}

function renderReceivedTable() {
  resetSheetSelection(el('receivedTable'));
  receivedTableBody.innerHTML = '';
  if (receivedRows.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = RECEIVING_COLUMNS.length;
    td.className = 'empty-state';
    td.textContent = 'No received entries yet. Select “Add row” to create your first entry.';
    tr.appendChild(td);
    receivedTableBody.appendChild(tr);
  } else {
    el('recentReceivedDates').innerHTML = recentDateOptions().map(date => `<option value="${date}"></option>`).join('');
    receivedRows.forEach((row, rowIndex) => {
      const tr = document.createElement('tr');
      tr.dataset.clientId = row.clientId;
      tr.dataset.rowIndex = String(rowIndex);
      tr.classList.toggle('selected', row.clientId === selectedReceivedClientId);
      tr.classList.toggle('dirty-row', Boolean(row._dirty));
      tr.classList.toggle('locked-row', isRowLocked(row, 'entry_date'));
      tr.innerHTML = RECEIVING_COLUMNS.map((column, colIndex) => `<td data-row-index="${rowIndex}" data-col-index="${colIndex}">${renderCell(row, column, RECEIVING_AMOUNT_FIELDS)}</td>`).join('');
      const dateInput = tr.querySelector('input[data-field="entry_date"]');
      if (dateInput) dateInput.setAttribute('list', 'recentReceivedDates');
      receivedTableBody.appendChild(tr);
    });
  }
  el('receivedRecordCount').textContent = `${receivedRows.length} ${receivedRows.length === 1 ? 'record' : 'records'}`;
  updateReceivedToolbar();
}

async function loadReceived() {
  if (!currentUser || receivedLoading) return;
  receivedLoading = true;
  receivedAddButton.disabled = true;
  receivedSheetStatus.textContent = 'Loading records…';
  const { data, error } = await supabase
    .from('received_records')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    receivedLoading = false;
    receivedAddButton.disabled = !canWrite;
    receivedSheetStatus.textContent = 'Could not load records';
    receivedSheetStatus.classList.add('error');
    showToast(`Unable to load received records: ${explainLedgerError(error)}`, true);
    return;
  }
  const localUnsaved = receivedRows.filter(row => row._isNew && row._dirty);
  receivedRows = (data || []).map(record => ({ ...record, clientId: record.id, _dirty: false, _isNew: false }));
  receivedRows.push(...localUnsaved);
  if (!receivedRows.some(row => row.clientId === selectedReceivedClientId)) selectedReceivedClientId = null;
  renderReceivedTable();
  scrollSheetToBottom(el('receivedTable'));
  receivedLoaded = true;
  receivedLoading = false;
  receivedAddButton.disabled = !canWrite;
  const hasDirty = receivedRows.some(row => row._dirty);
  receivedSheetStatus.textContent = hasDirty ? 'Unsaved changes' : 'All changes saved';
  receivedSheetStatus.classList.toggle('dirty', hasDirty);
  receivedSheetStatus.classList.remove('error');
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
  receivedSheetStatus.textContent = 'Unsaved changes';
  receivedSheetStatus.classList.add('dirty');
  receivedSheetStatus.classList.remove('error');
  tr.classList.add('dirty-row');
  const totalInput = tr.querySelector('.total-cell');
  if (totalInput) totalInput.value = formatBlankIfZero(calculateTotal(row, RECEIVING_AMOUNT_FIELDS));
  updateReceivedToolbar();
}

function getReceivedPayload(row) {
  const payload = {
    entry_date: row.entry_date || localDateString(),
    name: row.name || '',
    transaction_type: row.transaction_type === 'Bank' ? 'Bank' : 'Cash',
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
  if (!canWrite) return;
  const dirtyRows = receivedRows.filter(row => row._dirty);
  if (!dirtyRows.length) return;
  receivedSaveButton.disabled = true;
  receivedSheetStatus.textContent = 'Saving changes…';
  let saved = 0;
  const failures = [];
  for (const row of dirtyRows) {
    try {
      const payload = getReceivedPayload(row);
      applyMovedOrder(payload, row, receivedRows);
      const result = row.id
        ? await supabase.from('received_records').update(payload).eq('id', row.id).select('*').single()
        : await supabase.from('received_records').insert(payload).select('*').single();
      if (result.error) throw result.error;
      const savedRow = { ...result.data, clientId: result.data.id, _dirty: false, _isNew: false };
      const index = receivedRows.findIndex(item => item.clientId === row.clientId);
      if (index >= 0) receivedRows[index] = savedRow;
      saved++;
    } catch (error) {
      failures.push(error.message || 'Unknown save error');
      row._dirty = true;
    }
  }
  renderReceivedTable();
  if (failures.length) {
    receivedSheetStatus.textContent = `${saved} saved · ${failures.length} need attention`;
    receivedSheetStatus.classList.add('error');
    showToast(`Some received rows were not saved: ${failures[0]}`, true);
  } else {
    receivedSheetStatus.textContent = 'All changes saved';
    receivedSheetStatus.classList.remove('dirty', 'error');
    showToast(`${saved} ${saved === 1 ? 'row' : 'rows'} saved successfully.`);
  }
}

async function deleteSelectedReceivedRow() {
  if (!canWrite || !selectedReceivedClientId) return;
  const row = receivedRows.find(item => item.clientId === selectedReceivedClientId);
  if (!row) return;
  if (isRowLocked(row, 'entry_date')) { warnLockedEdit('delete'); return; }
  if (!window.confirm('Delete the selected received row? This cannot be undone.')) return;
  receivedDeleteButton.disabled = true;
  if (row.id) {
    const { data, error } = await supabase.from('received_records').delete().eq('id', row.id).select('id');
    if (error || !data?.length) {
      showToast(error?.message || 'The row could not be deleted. Check your access permission.', true);
      updateReceivedToolbar();
      return;
    }
  }
  receivedRows = receivedRows.filter(item => item.clientId !== selectedReceivedClientId);
  selectedReceivedClientId = null;
  renderReceivedTable();
  receivedSheetStatus.textContent = 'Row deleted';
  receivedSheetStatus.classList.remove('dirty', 'error');
  showToast('Selected received row deleted.');
}

function markRowDirty(row) {
  row._dirty = true;
  setSheetStatus('Unsaved changes', 'dirty');
  const tr = tableBody.querySelector(`tr[data-client-id="${CSS.escape(row.clientId)}"]`);
  if (tr) tr.classList.add('dirty-row');
  updateToolbar();
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
    transaction_type: row.transaction_type === 'Bank' ? 'Bank' : 'Cash'
  };
  AMOUNT_FIELDS.forEach(field => {
    const value = row[field];
    payload[field] = value === '' || value == null ? 0 : Number(value);
    if (!Number.isFinite(payload[field])) throw new Error(`Please enter a valid amount in ${field.replaceAll('_', ' ')}.`);
  });
  return payload;
}

async function saveChanges() {
  if (!canWrite) return;
  const dirtyRows = rows.filter(row => row._dirty);
  if (!dirtyRows.length) return;
  saveButton.disabled = true;
  setSheetStatus('Saving changes…');
  let saved = 0;
  const failures = [];

  for (const row of dirtyRows) {
    try {
      const payload = getPayload(row);
      applyMovedOrder(payload, row, rows);
      let result;
      if (row.id) {
        result = await supabase.from('expense_records').update(payload).eq('id', row.id).select('*').single();
      } else {
        result = await supabase.from('expense_records').insert(payload).select('*').single();
      }
      if (result.error) throw result.error;
      const savedRow = rowFromDatabase(result.data);
      const index = rows.findIndex(item => item.clientId === row.clientId);
      if (index >= 0) rows[index] = savedRow;
      saved++;
    } catch (error) {
      failures.push(error.message || 'Unknown save error');
      row._dirty = true;
    }
  }

  renderTable();
  if (failures.length) {
    setSheetStatus(`${saved} saved · ${failures.length} need attention`, 'error');
    showToast(`Some rows were not saved: ${failures[0]}`, true);
  } else {
    setSheetStatus('All changes saved');
    showToast(`${saved} ${saved === 1 ? 'row' : 'rows'} saved successfully.`);
  }
}

async function deleteSelectedRow() {
  if (!canWrite || !selectedClientId) return;
  const row = rows.find(item => item.clientId === selectedClientId);
  if (!row) return;
  if (isRowLocked(row, 'entry_date')) { warnLockedEdit('delete'); return; }
  if (!window.confirm('Delete the selected expense row? This cannot be undone.')) return;
  deleteButton.disabled = true;
  if (row.id) {
    const { data, error } = await supabase.from('expense_records').delete().eq('id', row.id).select('id');
    if (error || !data?.length) {
      showToast(error?.message || 'The row could not be deleted. Check your access permission.', true);
      updateToolbar();
      return;
    }
  }
  rows = rows.filter(item => item.clientId !== selectedClientId);
  selectedClientId = null;
  renderTable();
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
  const frame = tableElement?.closest('.table-frame');
  if (frame) frame.scrollTop = frame.scrollHeight;
}

function resetSheetSelection(tableElement) {
  spreadsheetGrids.get(tableElement)?.clearSelection();
}

function applyGridPaste(config, payload) {
  if (!canWrite) {
    showToast('This access key is view-only. Pasting changes is not permitted.', true);
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
        const canonical = value.toLowerCase() === 'cash' ? 'Cash' : value.toLowerCase() === 'bank' ? 'Bank' : null;
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
  const lockedNote = lockedSkipped ? ` ${lockedSkipped} cell${lockedSkipped === 1 ? '' : 's'} not changed: editing is not allowed for entries older than ${EDIT_WINDOW_DAYS} days (before ${formatDmy(editCutoffDate())}).` : '';
  if (applied) showToast(`Pasted ${applied} cell${applied === 1 ? '' : 's'}. Save changes to commit.${skipped ? ` ${skipped} cell${skipped === 1 ? '' : 's'} skipped (invalid or calculated cells).` : ''}${lockedNote}`, Boolean(lockedSkipped));
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
  clearAllSpreadsheetSelections();
  // Explicit sign-out is the only normal way to end the saved session: remove
  // the encrypted session and the browser-session marker, then sign out locally.
  clearBrowserSessionCookie();
  encryptedAuthStorage.removeItem(EXPENSE_VAULT_AUTH_STORAGE_KEY).catch(() => {});
  supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  currentUser = null;
  canWrite = false;
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

function openKeyDialog() {
  el('keyMessage').textContent = '';
  el('accessKeysDialog').showModal();
  loadAlternateKeys();
}

async function loadAlternateKeys() {
  const list = el('alternateKeyList');
  list.innerHTML = '<p class="muted">Loading keys…</p>';
  try {
    const result = await callAccess('list_keys');
    if (!result.keys?.length) {
      list.innerHTML = '<p class="muted">No alternate keys have been created.</p>';
      return;
    }
    list.innerHTML = result.keys.map(key => `
      <div class="alt-key-item">
        <div>
          <div class="alt-key-name">${escapeHtml(key.label || 'Alternate key')}</div>
          <div class="alt-key-meta">${key.is_active ? (key.can_write ? 'Can edit records' : 'View-only') + ' · Active' : 'Revoked'}</div>
        </div>
        <div class="alt-key-actions">
          ${key.is_active ? `<button type="button" data-alt-action="toggle" data-key-id="${escapeHtml(key.id)}">${key.can_write ? 'Make view-only' : 'Allow edits'}</button><button type="button" class="delete-alt" data-alt-action="delete" data-key-id="${escapeHtml(key.id)}">Revoke</button>` : '<span class="muted">Inactive</span>'}
        </div>
      </div>`).join('');
  } catch (error) {
    list.innerHTML = `<p class="form-message">${escapeHtml(error.message)}</p>`;
  }
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
  if (!canWrite) return;
  if (!isDateEditable(workDate())) { warnOldWorkDate(); return; }
  const row = makeEmptyRow();
  rows.push(row);
  selectedClientId = row.clientId;
  renderTable();
  scrollSheetToBottom(table);
  spreadsheetGrids.get(table)?.startEditing(rows.length - 1, 0);
  setSheetStatus('New row — remember to save', 'dirty');
});

saveButton.addEventListener('click', saveChanges);
deleteButton.addEventListener('click', deleteSelectedRow);
tableBody.addEventListener('input', onTableInput);
tableBody.addEventListener('change', onTableInput);
tableBody.addEventListener('click', event => {
  const tr = event.target.closest('tr[data-client-id]');
  if (tr) selectRow(tr.dataset.clientId);
});

cashAddButton.addEventListener('click', () => {
  if (!canWrite) return;
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
  setCashVaultStatus('New daily count — remember to save', 'dirty');
  scrollSheetToBottom(el('cashCountTable'));
  spreadsheetGrids.get(el('cashCountTable'))?.startEditing(cashCounts.length - 1, 1);
});

cashSaveButton.addEventListener('click', saveCashCountChanges);
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
  if (!canWrite) return;
  if (!isDateEditable(workDate())) { warnOldWorkDate(); return; }
  const row = makeEmptyReceivedRow();
  receivedRows.push(row);
  selectedReceivedClientId = row.clientId;
  renderReceivedTable();
  scrollSheetToBottom(el('receivedTable'));
  spreadsheetGrids.get(el('receivedTable'))?.startEditing(receivedRows.length - 1, 0);
  receivedSheetStatus.textContent = 'New row — remember to save';
  receivedSheetStatus.classList.add('dirty');
});

receivedSaveButton.addEventListener('click', saveReceivedChanges);
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

el('signOutButton').addEventListener('click', signOutToLogin);
el('accessKeysButton').addEventListener('click', openKeyDialog);
el('closeAccessKeys').addEventListener('click', () => el('accessKeysDialog').close());
el('refreshKeysButton').addEventListener('click', loadAlternateKeys);

el('changeKeyForm').addEventListener('submit', async event => {
  event.preventDefault();
  const currentKey = el('currentKey').value.trim();
  const newKey = el('newOwnerKey').value.trim();
  const confirmKey = el('confirmOwnerKey').value.trim();
  const message = el('keyMessage');
  message.textContent = '';
  try {
    validateNumericKey(currentKey, 'Current key');
    validateNumericKey(newKey, 'New key');
    if (newKey !== confirmKey) throw new Error('The new key and confirmation do not match.');
    if (newKey === currentKey) throw new Error('The new key must be different from the current key.');
    await callAccess('change_key', { current_key: currentKey, new_key: newKey });
    el('changeKeyForm').reset();
    message.style.color = 'var(--accent)';
    message.textContent = 'Owner key updated successfully.';
    showToast('Owner access key updated.');
  } catch (error) {
    message.style.color = 'var(--danger)';
    message.textContent = error.message;
  }
});

el('createAlternateForm').addEventListener('submit', async event => {
  event.preventDefault();
  const label = el('alternateLabel').value.trim();
  const key = el('alternateKey').value.trim();
  const confirmKey = el('confirmAlternateKey').value.trim();
  const message = el('keyMessage');
  message.style.color = 'var(--danger)';
  message.textContent = '';
  try {
    validateNumericKey(key, 'Alternate key');
    if (key !== confirmKey) throw new Error('The alternate key and confirmation do not match.');
    await callAccess('create_alternate', {
      label,
      key,
      can_write: el('alternateCanWrite').checked
    });
    el('createAlternateForm').reset();
    message.style.color = 'var(--accent)';
    message.textContent = 'Alternate key created. Share the key securely with its intended user.';
    showToast('Alternate key created.');
    await loadAlternateKeys();
  } catch (error) {
    message.style.color = 'var(--danger)';
    message.textContent = error.message;
  }
});

el('alternateKeyList').addEventListener('click', async event => {
  const button = event.target.closest('button[data-alt-action]');
  if (!button) return;
  const keyId = button.dataset.keyId;
  const action = button.dataset.altAction;
  try {
    if (action === 'delete') {
      if (!window.confirm('Revoke this alternate key? Anyone using it will immediately lose access.')) return;
      await callAccess('delete_alternate', { key_id: keyId });
      showToast('Alternate key revoked.');
    } else if (action === 'toggle') {
      await callAccess('toggle_alternate', { key_id: keyId });
      showToast('Alternate key permission updated.');
    }
    await loadAlternateKeys();
  } catch (error) {
    el('keyMessage').style.color = 'var(--danger)';
    el('keyMessage').textContent = error.message;
  }
});

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
  if (!button || !canWrite) return;
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

async function fetchAllRecords(tableName, orderFields) {
  const pageSize = 1000;
  const all = [];
  for (let from = 0; ; from += pageSize) {
    let query = supabase.from(tableName).select('*');
    orderFields.forEach(field => { query = query.order(field, { ascending: true }); });
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw error;
    all.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return all;
}

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
    const [XLSX, cashRecords, expenseRecords, receivedRecords] = await Promise.all([
      import('https://esm.sh/xlsx@0.18.5'),
      fetchAllRecords('cash_vault_counts', ['count_date']),
      fetchAllRecords('expense_records', ['sort_order', 'created_at']),
      fetchAllRecords('received_records', ['sort_order', 'created_at'])
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

    const unsaved = rows.some(row => row._dirty) || receivedRows.some(row => row._dirty) || cashCounts.some(row => row._dirty);
    showToast(unsaved
      ? 'Excel downloaded. It contains saved data only — save your pending changes and export again to include them.'
      : 'Excel file downloaded.');
  } catch (error) {
    showToast(`Excel export failed: ${explainLedgerError(error)}`, true);
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

el('exportExcelButton').addEventListener('click', exportToExcel);

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

function enableRowReorder({ tableElement, tbody, getRows, render, tableName, dateField }) {
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
    if (!canWrite) { stop(); return; }
    if (isRowLocked(row, dateField)) { warnLockedEdit(); stop(); return; }
    drag = { row, tr: pending.tr, x: pending.x, y: pending.y, target: null, position: 'after' };
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
    if (event.button !== 0 || pending || drag || !canWrite) return;
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

function formatSelectionSum(value, auto) {
  const rounded = Math.round(value * 100) / 100;
  return rounded.toLocaleString('en-US', {
    minimumFractionDigits: auto && Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2
  });
}

// Shows the sum of the numeric cells in a multi-cell selection in the footer line.
function updateSelectionSum(config, tableElement, range) {
  const node = el(config.sumElementId);
  if (!node) return;
  config.lastRange = range;
  const hide = () => { node.textContent = ''; node.classList.add('hidden'); };
  if (!range || (range.minRow === range.maxRow && range.minCol === range.maxCol)) { hide(); return; }
  const bodyRows = tableElement.tBodies[0]?.rows;
  if (!bodyRows) { hide(); return; }
  let sum = 0;
  let count = 0;
  for (let r = range.minRow; r <= range.maxRow; r += 1) {
    for (let c = range.minCol; c <= range.maxCol; c += 1) {
      const column = config.columns[c];
      if (!column || !config.sumKinds.includes(column.kind)) continue;
      const control = bodyRows[r]?.cells[c]?.querySelector('input, select');
      const raw = String(control ? control.value : '').replace(/,/g, '').trim();
      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) continue;
      sum += Number(raw);
      count += 1;
    }
  }
  if (!count) { hide(); return; }
  node.textContent = `Sum ${formatSelectionSum(sum, config.sumAuto)} · ${count} value${count === 1 ? '' : 's'}`;
  node.classList.remove('hidden');
}

function registerSpreadsheet(tableElement, config) {
  const paste = payload => applyGridPaste(config, payload);
  const refreshSum = () => updateSelectionSum(config, tableElement, config.lastRange);
  tableElement.tBodies[0]?.addEventListener('input', refreshSum);
  tableElement.tBodies[0]?.addEventListener('change', refreshSum);
  spreadsheetGrids.set(tableElement, createSpreadsheetGrid(tableElement, {
    columns: config.columns,
    getRowCount: () => config.getRows().length,
    onPaste: paste,
    onCopy: showCopyToast,
    onSelectionChange: range => updateSelectionSum(config, tableElement, range),
    onLockedEdit: rowIndex => {
      const model = config.getRows()[rowIndex];
      if (model && config.isLocked?.(model)) warnLockedEdit();
    }
  }));
}

registerSpreadsheet(table, {
  columns: COLUMNS,
  getRows: () => rows,
  makeRow: makeEmptyRow,
  sumElementId: 'expensesSelectionSum',
  sumKinds: ['amount', 'total'],
  isLocked: row => isRowLocked(row, 'entry_date'),
  render: renderTable,
  setDirtyStatus: () => { setSheetStatus('Unsaved changes from paste', 'dirty'); updateToolbar(); }
});
registerSpreadsheet(el('receivedTable'), {
  columns: RECEIVING_COLUMNS,
  getRows: () => receivedRows,
  makeRow: makeEmptyReceivedRow,
  sumElementId: 'receivedSelectionSum',
  sumKinds: ['amount', 'total'],
  isLocked: row => isRowLocked(row, 'entry_date'),
  render: renderReceivedTable,
  setDirtyStatus: () => {
    receivedSheetStatus.textContent = 'Unsaved changes from paste';
    receivedSheetStatus.classList.add('dirty');
    receivedSheetStatus.classList.remove('error');
    updateReceivedToolbar();
  }
});
registerSpreadsheet(el('cashCountTable'), {
  columns: CASH_COUNT_COLUMNS,
  getRows: () => cashCounts,
  sumElementId: 'cashSelectionSum',
  sumKinds: ['quantity', 'total'],
  sumAuto: true,
  isLocked: row => isRowLocked(row, 'count_date'),
  render: renderCashCounts,
  setDirtyStatus: () => { setCashVaultStatus('Unsaved changes from paste', 'dirty'); updateCashCountToolbar(); }
});

enableRowReorder({ tableElement: table, tbody: tableBody, getRows: () => rows, render: renderTable, tableName: 'expense_records', dateField: 'entry_date' });
enableRowReorder({ tableElement: el('receivedTable'), tbody: receivedTableBody, getRows: () => receivedRows, render: renderReceivedTable, tableName: 'received_records', dateField: 'entry_date' });

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
