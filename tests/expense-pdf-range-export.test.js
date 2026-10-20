const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const exportsSource = fs.readFileSync(path.join(root, 'Assets/app/reports/02-exports.js'), 'utf8');
const expensesSource = fs.readFileSync(path.join(root, 'Assets/app/expenses/01-expenses-wallets.js'), 'utf8');
const cssSource = fs.readFileSync(path.join(root, 'Assets/style/05-expenses-filters.css'), 'utf8');
const bundledCss = fs.readFileSync(path.join(root, 'Assets/style/app.bundle.css'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function functionBody(source, name, nextMarker) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Expected ${name} to exist`);
  const end = source.indexOf(nextMarker, start);
  assert.notEqual(end, -1, `Expected end marker for ${name} to exist`);
  return source.slice(start, end);
}

test('expense PDF export loads the complete selected activity through the existing paginated read RPC', () => {
  const loader = functionBody(exportsSource, 'loadExpenseHistoryItemsForPdf', '\nasync function downloadExpenseTransactionsHistoryPDF');
  assert.match(loader, /fetchExpenseActivityRpc\(/);
  assert.match(loader, /from:\s*selection\.from\s*\|\|\s*null/);
  assert.match(loader, /to:\s*selection\.to\s*\|\|\s*null/);
  assert.match(loader, /search:\s*selection\.search\s*\|\|\s*""/);
  assert.match(loader, /groupId:\s*selection\.groupId\s*\|\|\s*""/);
  assert.match(loader, /offset\s*\+=\s*pageRows\.length/);
  assert.match(loader, /if\s*\(!page\?\.hasMore\s*\|\|\s*!pageRows\.length\)/);
  assert.match(loader, /No partial PDF was downloaded/);
  assert.match(loader, /rowType\s*!==\s*"EXPENSE"/);
  assert.match(loader, /expensePdfDateWithinSelection\(row\.activity_date, selection\)/);
  assert.doesNotMatch(loader, /state\.entries\s*=/, 'export loading must not replace or mutate the live ledger array');
});

test('both history and item banner PDFs use a captured date-range snapshot and the complete-history loader', () => {
  const history = functionBody(exportsSource, 'downloadExpenseTransactionsHistoryPDF', '\nasync function downloadAllTopupsPDF');
  const item = functionBody(exportsSource, 'downloadExpenseItemPDF', '\nasync function deleteExpenseWallet');
  for (const body of [history, item]) {
    assert.match(body, /expensePdfHistorySelectionSnapshot\(\)/);
    assert.match(body, /loadExpenseHistoryItemsForPdf\(selection/);
    assert.match(body, /selection\.rangeLabel/);
    assert.match(body, /selection\.rangeSlug/);
    assert.match(body, /finally\s*\{\s*progress\.finish\(\);\s*\}/);
    assert.match(body, /EXPENSE_PDF_TABLE_CHUNK_SIZE/);
  }
  assert.doesNotMatch(item, /ensureExpenseItemHistoryLoaded\(itemKey/,
    'a banner PDF must not mutate/pageload the visible expense ledger to build its report');
});

test('long PDF exports provide an accessible minimizable progress panel that remains usable when minimized', () => {
  assert.match(exportsSource, /role="progressbar"/);
  assert.match(exportsSource, /aria-valuenow/);
  assert.match(exportsSource, /data-expense-pdf-progress-toggle/);
  assert.match(exportsSource, /classList\.toggle\("is-minimized"\)/);
  assert.match(cssSource, /\.expense-pdf-progress-root\.is-minimized/);
  assert.match(cssSource, /pointer-events:\s*none/);
  assert.match(cssSource, /\.expense-pdf-progress-root\.is-minimized \.expense-pdf-progress-card[\s\S]*?pointer-events:\s*auto/);
  assert.match(bundledCss, /\.expense-pdf-progress-root/);
});

test('active production assets use fresh cache keys for the PDF exporter and rebuilt stylesheet', () => {
  assert.match(indexSource, /Assets\/app\/reports\/02-exports\.js\?[^" ]*expensepdf=20261020-001/);
  assert.match(indexSource, /Assets\/style\/app\.bundle\.css\?[^" ]*expensepdf=20261020-001/);
});
