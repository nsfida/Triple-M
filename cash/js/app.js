import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  beginBrowserSession,
  clearBrowserSessionCookie,
  clearLegacyPlaintextSession,
  createEncryptedBrowserSessionStorage,
  getEncryptedSessionPersistenceStatus
} from './secure-session-storage.js';

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
    storageKey: 'expense-vault-auth-session-v1',
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
  { label: 'Date', field: 'entry_date', kind: 'date', width: 116 },
  { label: 'Supplier', field: 'supplier', kind: 'text', width: 126 },
  { label: 'TRN#', field: 'trn_number', kind: 'text', width: 88 },
  { label: 'Name', field: 'spent_by', kind: 'text', width: 106 },
  { label: 'Inv#', field: 'invoice_number', kind: 'text', width: 82 },
  ...AMOUNT_COLUMNS.map(([label, field]) => ({ label, field, kind: 'amount', width: 64 })),
  { label: 'Total', field: 'total', kind: 'total', width: 78 },
  { label: 'TYPE', field: 'transaction_type', kind: 'select', width: 72 }
];

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
let cashPeopleLoading = false;
let cashPeopleLoadPromise = null;
let editingCashPersonId = null;
const spreadsheetSelections = new WeakMap();
let toastTimer;

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

function syncCashDateControls() {
  const selectedDate = el('cashAsOfDate').value || localDateString();
  const quickDate = el('cashQuickDate');
  const dates = recentDateOptions();
  quickDate.innerHTML = dates.map(date => `<option value="${date}">${date === dates[0] ? 'Today' : date === dates[1] ? 'Yesterday' : date}</option>`).join('')
    + '<option value="custom">Custom date…</option>';
  quickDate.value = dates.includes(selectedDate) ? selectedDate : 'custom';
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

function resetCashPersonBalanceForm() {
  editingCashPersonId = null;
  el('cashPersonBalanceForm').reset();
  el('saveCashPersonBalance').textContent = 'Add person';
  el('cancelCashPersonEdit').classList.add('hidden');
  el('cashPersonBalanceMessage').textContent = '';
  el('cashPersonBalanceMessage').style.color = '';
  updateCashPersonBalancePermission();
}

function updateCashPersonBalancePermission() {
  const form = el('cashPersonBalanceForm');
  form.querySelectorAll('input, button').forEach(control => {
    control.disabled = !canWrite;
  });
  el('cashPersonBalanceForm').querySelector('button[type="submit"]').textContent = editingCashPersonId ? 'Save changes' : 'Add person';
}

function makeEmptyRow() {
  const row = {
    clientId: crypto.randomUUID(),
    id: null,
    entry_date: localDateString(),
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
    entry_date: localDateString(),
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
    th.style.width = `${column.width}px`;
    th.style.minWidth = `${column.width}px`;
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
  const disabled = canWrite ? '' : 'disabled';
  if (column.kind === 'total') {
    return `<input class="cell-input total-cell" type="text" value="${formatAmount(calculateTotal(row, amountFields))}" readonly tabindex="-1" aria-label="Calculated row total">`;
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
    return `<input class="cell-input amount-cell" type="number" inputmode="decimal" step="0.01" data-field="${column.field}" value="${escapeHtml(value)}" ${disabled} aria-label="${column.label}">`;
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
  const disabled = canWrite ? '' : 'disabled';
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
  el('cashVaultPermissionNote').textContent = currentUser?.role === 'owner'
    ? 'Owner · full access'
    : (canWrite ? 'Write access enabled' : 'View-only access');
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
  el('cashBalanceCaption').textContent = `As of ${formatDateLabel(selectedDate)} · Cash ledger minus signed people balances`;
  const { data, error } = await supabase.rpc('get_cash_vault_summary', { p_as_of: selectedDate });
  if (requestId !== cashSummaryRequestId) return;
  if (error) {
    cashAvailableBalance = null;
    el('cashBalanceValue').textContent = 'Unavailable';
    el('cashBalanceValue').classList.remove('negative', 'variance-alert');
    el('cashReceivedValue').textContent = '—';
    el('cashExpensesValue').textContent = '—';
    el('cashPeopleAdjustmentValue').textContent = '—';
    showToast(`Unable to calculate cash balance: ${explainLedgerError(error)}. Confirm migrations 005, 006, 008 and 009 have been applied.`, true);
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
  el('cashBalanceCaption').textContent = `As of ${formatDateLabel(selectedDate)} · Received − Expenses − People balance`;
  updateCashCountedSummary();
}

async function reloadCashCountRows() {
  const { data, error } = await supabase
    .from('cash_vault_counts')
    .select('*')
    .order('count_date', { ascending: false });
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

  cashCounts.sort((a, b) => String(b.count_date).localeCompare(String(a.count_date)));
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

function renderCashPeopleData() {
  el('cashPeopleCount').textContent = `${cashPeople.length} ${cashPeople.length === 1 ? 'person' : 'people'}`;
  const balanceList = el('cashPeopleBalanceList');
  if (!cashPeople.length) {
    balanceList.innerHTML = '<p class="muted">No people added yet.</p>';
  } else {
    balanceList.innerHTML = cashPeople.map(person => {
      const balance = Number(person.cash_adjustment || 0);
      const amountClass = balance > 0.0001 ? 'person-positive' : balance < -0.0001 ? 'person-negative' : 'person-zero';
      return `<article class="cash-person-balance-item" data-person-id="${escapeHtml(person.id)}">
        <div class="cash-person-balance-main"><strong>${escapeHtml(person.name)}</strong></div>
        <strong class="cash-person-balance-amount ${amountClass}">${formatSignedCashAdjustment(balance)}</strong>
        ${canWrite ? `<button class="cash-person-edit-button" type="button" data-person-action="edit" data-person-id="${escapeHtml(person.id)}">Edit</button>` : ''}
      </article>`;
    }).join('');
  }
  updateCashPersonBalancePermission();
}

async function loadCashPeopleData({ force = false } = {}) {
  if (!currentUser) return;
  if (cashPeopleLoading && cashPeopleLoadPromise) {
    if (!force) return cashPeopleLoadPromise;
    await cashPeopleLoadPromise;
  }

  cashPeopleLoading = true;
  el('cashPeopleBalanceList').innerHTML = '<p class="muted">Loading people…</p>';
  cashPeopleLoadPromise = (async () => {
    try {
      const { data, error } = await supabase
        .from('cash_people')
        .select('id, name, cash_adjustment')
        .order('name', { ascending: true });
      if (error) throw error;
      cashPeople = data || [];
      renderCashPeopleData();
    } catch (error) {
      el('cashPeopleBalanceList').innerHTML = `<p class="form-message">${escapeHtml(error.message || 'Unable to load people.')}</p>`;
      showToast(`Unable to load people balances: ${explainLedgerError(error)}. Confirm migration 009 has been applied.`, true);
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
  resetCashPersonBalanceForm();
  el('cashPeopleDialog').showModal();
  loadCashPeopleData();
}

function parseSignedPersonAmount(rawValue) {
  const raw = String(rawValue ?? '').trim().replace(/[−–]/g, '-').replace(/,/g, '');
  if (!raw) throw new Error('Enter an amount. Use + for a positive amount or - for a negative amount.');
  if (!/^[+-]?(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(raw)) {
    throw new Error('Enter a valid amount with no more than two decimal places.');
  }
  const amount = Number(raw);
  if (!Number.isFinite(amount) || Math.abs(amount) > 99999999999999.99) {
    throw new Error('The amount is outside the supported range.');
  }
  return Number(amount.toFixed(2));
}

async function saveCashPersonBalance(event) {
  event.preventDefault();
  if (!canWrite) return;

  const name = el('cashPersonName').value.trim();
  const message = el('cashPersonBalanceMessage');
  message.textContent = '';
  if (!name) {
    message.textContent = 'Enter a person name.';
    el('cashPersonName').focus();
    return;
  }
  if (name.length > 100) {
    message.textContent = 'Person name must be 100 characters or fewer.';
    el('cashPersonName').focus();
    return;
  }

  let amount;
  try {
    amount = parseSignedPersonAmount(el('cashPersonAdjustment').value);
  } catch (error) {
    message.textContent = error.message;
    el('cashPersonAdjustment').focus();
    return;
  }

  const button = el('saveCashPersonBalance');
  const wasEditing = Boolean(editingCashPersonId);
  button.disabled = true;
  try {
    const { data, error } = await supabase.rpc('set_cash_person_balance', {
      p_person_id: editingCashPersonId,
      p_person_name: name,
      p_cash_adjustment: amount
    });
    if (error) throw error;
    if (!data) throw new Error('The person balance could not be saved.');

    resetCashPersonBalanceForm();
    message.style.color = 'var(--accent)';
    message.textContent = wasEditing ? 'Person balance updated.' : 'Person added.';
    showToast(wasEditing ? `${name}'s balance updated.` : `${name} added to People balances.`);

    try {
      await Promise.all([
        refreshCashSummary(),
        loadCashPeopleData({ force: true })
      ]);
      setCashVaultStatus('People balances saved · Available Cash refreshed · Cash Count unchanged');
    } catch (refreshError) {
      setCashVaultStatus('Person balance saved · refresh required', 'error');
      showToast(`The balance was saved, but the screen could not refresh: ${refreshError.message || 'Refresh the page to view the updated balance.'}`, true);
    }
  } catch (error) {
    message.style.color = 'var(--danger)';
    message.textContent = error.message || 'The person balance could not be saved.';
    showToast(message.textContent, true);
  } finally {
    button.disabled = !canWrite;
    updateCashPersonBalancePermission();
  }
}

function beginEditCashPersonBalance(personId) {
  const person = cashPeople.find(item => item.id === personId);
  if (!person || !canWrite) return;
  editingCashPersonId = person.id;
  el('cashPersonName').value = person.name;
  el('cashPersonAdjustment').value = Number(person.cash_adjustment || 0).toFixed(2);
  el('saveCashPersonBalance').textContent = 'Save changes';
  el('cancelCashPersonEdit').classList.remove('hidden');
  el('cashPersonBalanceMessage').textContent = '';
  el('cashPersonName').focus();
  el('cashPersonBalanceForm').scrollIntoView({ block: 'nearest' });
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
  el('permissionNote').textContent = currentUser?.role === 'owner' ? 'Owner · full access' : (canWrite ? 'Write access enabled' : 'View-only access');
}

function updateReceivedToolbar() {
  const dirty = receivedRows.some(row => row._dirty);
  receivedSaveButton.disabled = !canWrite || !dirty;
  receivedAddButton.disabled = !canWrite;
  receivedDeleteButton.disabled = !canWrite || !selectedReceivedClientId;
  el('receivedPermissionNote').textContent = currentUser?.role === 'owner' ? 'Owner · full access' : (canWrite ? 'Write access enabled' : 'View-only access');
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
    || normalized.includes('set_cash_person_balance');
  const cashVaultError = normalized.includes('cash_vault_counts') || normalized.includes('get_cash_vault_summary');
  if (normalized.includes('permission denied for schema') || normalized.includes('permission denied for table') || normalized.includes('permission denied for function')) {
    if (personCashError) return 'People balance permissions are configured by sql/migrations/009_signed_person_balances.sql. Confirm migration 009 has been applied, then refresh this page.';
    if (normalized.includes('get_cash_vault_summary')) return 'The Cash Vault balance function needs migration 009. Run sql/migrations/009_signed_person_balances.sql, then refresh this page.';
    return cashVaultError
      ? 'Cash Vault permissions are configured by sql/migrations/005_cash_vault_counts_and_balance.sql. Confirm that migration 005 has been applied, then refresh this page.'
      : 'Database permissions need the ledger repair. In Supabase SQL Editor, run sql/migrations/004_fix_public_schema_access.sql, then refresh this page.';
  }
  if ((normalized.includes('relation') && normalized.includes('does not exist')) || normalized.includes('could not find the function')) {
    if (personCashError) return 'The signed people-balance column or function is missing. Confirm sql/migrations/009_signed_person_balances.sql has been applied, then refresh this page.';
    if (normalized.includes('get_cash_vault_summary')) return 'The updated Cash Vault summary is missing. Run sql/migrations/009_signed_person_balances.sql, then refresh this page.';
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
  el('permissionNote').textContent = info.role === 'owner' ? 'Owner · full access' : (canWrite ? 'Write access enabled' : 'View-only access');
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
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) {
    expensesLoading = false;
    addButton.disabled = !canWrite;
    setSheetStatus('Could not load records', 'error');
    showToast(`Unable to load expenses: ${explainLedgerError(error)}`, true);
    return;
  }
  const localUnsaved = rows.filter(row => row._isNew && row._dirty);
  rows = (data || []).map(rowFromDatabase);
  rows.unshift(...localUnsaved);
  if (!rows.some(row => row.clientId === selectedClientId)) selectedClientId = null;
  renderTable();
  expensesLoaded = true;
  expensesLoading = false;
  addButton.disabled = !canWrite;
  const hasDirty = rows.some(row => row._dirty);
  setSheetStatus(hasDirty ? 'Unsaved changes' : 'All changes saved', hasDirty ? 'dirty' : 'normal');
}

function renderReceivedTable() {
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
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false });
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
  receivedRows.unshift(...localUnsaved);
  if (!receivedRows.some(row => row.clientId === selectedReceivedClientId)) selectedReceivedClientId = null;
  renderReceivedTable();
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
  row[fieldInput.dataset.field] = fieldInput.value;
  row._dirty = true;
  receivedSheetStatus.textContent = 'Unsaved changes';
  receivedSheetStatus.classList.add('dirty');
  receivedSheetStatus.classList.remove('error');
  tr.classList.add('dirty-row');
  const totalInput = tr.querySelector('.total-cell');
  if (totalInput) totalInput.value = formatAmount(calculateTotal(row, RECEIVING_AMOUNT_FIELDS));
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
  row[field] = fieldInput.value;
  markRowDirty(row);
  const totalInput = tr.querySelector('.total-cell');
  if (totalInput) totalInput.value = formatAmount(calculateTotal(row));
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

function sheetCellFromEvent(event, table) {
  const cell = event.target.closest('td[data-row-index][data-col-index]');
  return cell && cell.closest('table') === table ? cell : null;
}

function drawSheetRangeSelection(table) {
  const state = spreadsheetSelections.get(table);
  table.querySelectorAll('.cell-range-selected, .cell-range-anchor').forEach(cell => {
    cell.classList.remove('cell-range-selected', 'cell-range-anchor');
  });
  if (!state?.start || !state?.end) return;
  const minRow = Math.min(state.start.row, state.end.row);
  const maxRow = Math.max(state.start.row, state.end.row);
  const minCol = Math.min(state.start.col, state.end.col);
  const maxCol = Math.max(state.start.col, state.end.col);
  table.querySelectorAll('td[data-row-index][data-col-index]').forEach(cell => {
    const rowIndex = Number(cell.dataset.rowIndex);
    const colIndex = Number(cell.dataset.colIndex);
    if (rowIndex >= minRow && rowIndex <= maxRow && colIndex >= minCol && colIndex <= maxCol) {
      cell.classList.add('cell-range-selected');
    }
  });
  const anchor = table.querySelector(`td[data-row-index="${state.start.row}"][data-col-index="${state.start.col}"]`);
  anchor?.classList.add('cell-range-anchor');
}

function sheetCellText(cell) {
  const control = cell.querySelector('input, select, textarea');
  return control ? control.value : cell.textContent.trim();
}

function sheetSelectionToTsv(table) {
  const state = spreadsheetSelections.get(table);
  if (!state?.start || !state?.end) return '';
  const minRow = Math.min(state.start.row, state.end.row);
  const maxRow = Math.max(state.start.row, state.end.row);
  const minCol = Math.min(state.start.col, state.end.col);
  const maxCol = Math.max(state.start.col, state.end.col);
  const lines = [];
  for (let rowIndex = minRow; rowIndex <= maxRow; rowIndex++) {
    const values = [];
    for (let colIndex = minCol; colIndex <= maxCol; colIndex++) {
      const cell = table.querySelector(`td[data-row-index="${rowIndex}"][data-col-index="${colIndex}"]`);
      values.push(cell ? sheetCellText(cell) : '');
    }
    lines.push(values.join('\t'));
  }
  return lines.join('\n');
}

function nativeInputTextIsSelected() {
  const active = document.activeElement;
  return active instanceof HTMLInputElement
    && typeof active.selectionStart === 'number'
    && active.selectionStart !== active.selectionEnd;
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

function applySpreadsheetPaste(config, table, clipboardText) {
  if (!canWrite) {
    showToast('This access key is view-only. Pasting changes is not permitted.', true);
    return;
  }
  const state = spreadsheetSelections.get(table);
  if (!state?.start) {
    showToast('Select a starting cell before pasting spreadsheet data.', true);
    return;
  }
  const normalized = clipboardText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n$/, '');
  if (!normalized) return;
  const matrix = normalized.split('\n').map(line => line.split('\t'));
  const startRow = state.start.row;
  const startCol = state.start.col;
  const modelRows = config.getRows();
  let applied = 0;
  let skipped = 0;

  matrix.forEach((values, rowOffset) => {
    const modelIndex = startRow + rowOffset;
    if (modelIndex >= modelRows.length) {
      if (!config.makeRow) { skipped += values.length; return; }
      while (modelRows.length <= modelIndex) modelRows.push(config.makeRow());
    }
    const model = modelRows[modelIndex];
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
        model[field] = parsedDate;
      } else if (column.kind === 'amount') {
        const parsedAmount = normalizePastedAmount(value);
        if (parsedAmount === null) { skipped++; return; }
        model[field] = parsedAmount;
      } else {
        model[field] = rawValue;
      }
      model._dirty = true;
      model._isNew = Boolean(model._isNew || !model.id);
      applied++;
    });
  });

  config.render();
  state.end = {
    row: Math.min(modelRows.length - 1, startRow + matrix.length - 1),
    col: Math.min(config.columns.length - 1, startCol + Math.max(...matrix.map(row => row.length), 1) - 1)
  };
  drawSheetRangeSelection(table);
  config.setDirtyStatus();
  if (applied) showToast(`Pasted ${applied} cell${applied === 1 ? '' : 's'}. Save changes to commit.${skipped ? ` ${skipped} cell${skipped === 1 ? '' : 's'} skipped (invalid or calculated cells).` : ''}`);
  else showToast('No editable cells from the pasted range were applied.', true);
}

function attachSpreadsheetClipboard(table, config) {
  const state = { start: null, end: null, dragging: false };
  spreadsheetSelections.set(table, state);

  table.addEventListener('mousedown', event => {
    if (event.button !== 0) return;
    const cell = sheetCellFromEvent(event, table);
    if (!cell) return;
    state.start = { row: Number(cell.dataset.rowIndex), col: Number(cell.dataset.colIndex) };
    state.end = { ...state.start };
    state.dragging = true;
    drawSheetRangeSelection(table);
  });

  table.addEventListener('mousemove', event => {
    if (!state.dragging) return;
    const cell = sheetCellFromEvent(event, table);
    if (!cell) return;
    state.end = { row: Number(cell.dataset.rowIndex), col: Number(cell.dataset.colIndex) };
    if (state.start.row !== state.end.row || state.start.col !== state.end.col) event.preventDefault();
    drawSheetRangeSelection(table);
  });

  document.addEventListener('mouseup', () => { state.dragging = false; });

  table.addEventListener('copy', event => {
    if (!state.start || nativeInputTextIsSelected()) return;
    const text = sheetSelectionToTsv(table);
    if (!text || !event.clipboardData) return;
    event.clipboardData.setData('text/plain', text);
    event.preventDefault();
  });

  table.addEventListener('paste', event => {
    if (!event.clipboardData) return;
    const text = event.clipboardData.getData('text/plain');
    if (!text.includes('\t') && !text.includes('\n')) return;
    event.preventDefault();
    applySpreadsheetPaste(config, table, text);
  });
}

function signOutToLogin() {
  clearBrowserSessionCookie();
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
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: result.session.access_token,
      refresh_token: result.session.refresh_token
    });
    if (sessionError) {
      clearBrowserSessionCookie();
      throw sessionError;
    }
    el('loginKey').value = '';
    await loadWorkspace();
    const persistenceStatus = getEncryptedSessionPersistenceStatus();
    if (!browserSessionMarker || !persistenceStatus.persisted) {
      showToast(`Secure session persistence is unavailable: ${persistenceStatus.error || 'browser storage is blocked'}. You may need to enter your key again after refresh or reopening the tab.`, true);
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
  const row = makeEmptyRow();
  rows.unshift(row);
  selectedClientId = row.clientId;
  renderTable();
  const firstInput = tableBody.querySelector(`tr[data-client-id="${CSS.escape(row.clientId)}"] input[data-field="entry_date"]`);
  firstInput?.focus();
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
  const countDate = el('cashAsOfDate').value || localDateString();
  const existing = cashCounts.find(row => row.count_date === countDate);
  if (existing) {
    selectCashCountRow(existing.clientId);
    showToast(`A cash count already exists for ${formatDateLabel(countDate)}. Edit that row instead.`);
    const rowElement = cashTableBody.querySelector(`tr[data-client-id="${CSS.escape(existing.clientId)}"]`);
    rowElement?.scrollIntoView({ block: 'nearest' });
    return;
  }
  const row = makeEmptyCashCountRow(countDate);
  cashCounts.unshift(row);
  selectedCashClientId = row.clientId;
  renderCashCounts();
  setCashVaultStatus('New daily count — remember to save', 'dirty');
  const rowElement = cashTableBody.querySelector(`tr[data-client-id="${CSS.escape(row.clientId)}"]`);
  rowElement?.scrollIntoView({ block: 'nearest' });
  rowElement?.querySelector('input.quantity-cell')?.focus();
});

cashSaveButton.addEventListener('click', saveCashCountChanges);
cashDeleteButton.addEventListener('click', deleteSelectedCashCount);
cashTableBody.addEventListener('input', handleCashCountInput);
cashTableBody.addEventListener('change', handleCashCountInput);
cashTableBody.addEventListener('click', event => {
  const tr = event.target.closest('tr[data-client-id]');
  if (tr) selectCashCountRow(tr.dataset.clientId);
});
el('cashAsOfDate').addEventListener('change', onCashAsOfDateChange);
el('cashQuickDate').addEventListener('change', () => {
  const selected = el('cashQuickDate').value;
  if (selected && selected !== 'custom') {
    el('cashAsOfDate').value = selected;
    onCashAsOfDateChange();
  }
});

receivedAddButton.addEventListener('click', () => {
  if (!canWrite) return;
  const row = makeEmptyReceivedRow();
  receivedRows.unshift(row);
  selectedReceivedClientId = row.clientId;
  renderReceivedTable();
  const firstInput = receivedTableBody.querySelector(`tr[data-client-id="${CSS.escape(row.clientId)}"] input[data-field="entry_date"]`);
  firstInput?.focus();
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
el('cashPersonBalanceForm').addEventListener('submit', saveCashPersonBalance);
el('cancelCashPersonEdit').addEventListener('click', resetCashPersonBalanceForm);
el('cashPeopleBalanceList').addEventListener('click', event => {
  const button = event.target.closest('button[data-person-action="edit"]');
  if (button) beginEditCashPersonBalance(button.dataset.personId);
});

attachSpreadsheetClipboard(table, {
  columns: COLUMNS,
  getRows: () => rows,
  makeRow: makeEmptyRow,
  render: renderTable,
  setDirtyStatus: () => { setSheetStatus('Unsaved changes from paste', 'dirty'); updateToolbar(); }
});
attachSpreadsheetClipboard(el('receivedTable'), {
  columns: RECEIVING_COLUMNS,
  getRows: () => receivedRows,
  makeRow: makeEmptyReceivedRow,
  render: renderReceivedTable,
  setDirtyStatus: () => {
    receivedSheetStatus.textContent = 'Unsaved changes from paste';
    receivedSheetStatus.classList.add('dirty');
    receivedSheetStatus.classList.remove('error');
    updateReceivedToolbar();
  }
});
attachSpreadsheetClipboard(el('cashCountTable'), {
  columns: CASH_COUNT_COLUMNS,
  getRows: () => cashCounts,
  render: renderCashCounts,
  setDirtyStatus: () => { setCashVaultStatus('Unsaved changes from paste', 'dirty'); updateCashCountToolbar(); }
});

el('cashAsOfDate').value = localDateString();
syncCashDateControls();
resetCashMovementForm();
buildTableHeader();
buildReceivingTableHeader();
buildCashTableHeader();
el('loginKey').focus();

async function restoreBrowserSession() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (!data.session?.access_token) return;
    await loadWorkspace();
  } catch (error) {
    const message = error?.message || 'Could not restore the saved browser session.';
    const isInvalidSession = /sign in again|session has expired|no longer active|invalid jwt|invalid token/i.test(message);
    if (isInvalidSession) {
      clearBrowserSessionCookie();
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      loginMessage.textContent = 'Your browser session has ended. Please enter your access key again.';
    } else {
      loginMessage.textContent = `Could not restore the session: ${message}`;
    }
  }
}

restoreBrowserSession();
