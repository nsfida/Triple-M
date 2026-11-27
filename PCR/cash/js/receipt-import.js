/*
 * "Import RTA receipts": reads one or more RTA vehicle-renewal receipt PDFs, shows
 * exactly which Expenses entries will be created, asks Cash or Bank, then adds the
 * entries to the Expenses sheet (they save automatically like any typed row).
 *
 * Mapping (see README):
 *   Renewal  = Light vehicle register + Registration card + Renewal fee + Delivery fee
 *              + the AED 20 Knowledge & Innovation fee charged for the renewal
 *   Fines    = each fine + the AED 20 Knowledge & Innovation fee charged for it
 *              (Dubai items only: RTA parking, bus lane, Dubai Police)
 *   RTA Passing = vehicle test / inspection fees (if a receipt ever has them)
 *   Misc Exp.   = any other line the receipt contains (shown as a warning first)
 * Every receipt's entries add up exactly to the receipt's printed Total Amount.
 */

import { parseRtaReceiptPdf } from './rta-receipt-parser.js?v=settings-1';

const PDFJS_URL = new URL('./vendor/pdfjs/pdf.min.js', import.meta.url).href;
const PDFJS_WORKER_URL = new URL('./vendor/pdfjs/pdf.worker.min.js', import.meta.url).href;
let pdfjsPromise = null;

function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(PDFJS_URL).then(pdfjs => {
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      return pdfjs;
    }).catch(error => {
      pdfjsPromise = null;
      throw error;
    });
  }
  return pdfjsPromise;
}

const money = cents => (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const amount = cents => (cents ? (cents / 100).toFixed(2) : '');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * Builds the Expenses entries for one receipt.
 * layout 'split'   -> one renewal entry + one entry per fine (fine number in Inv#)
 * layout 'receipt' -> one entry with Renewal / Fines / ... columns
 * Returns [{ entry_date, supplier, invoice_number, renewal, fines, rta_passing, misc_exp, totalCents, note }]
 * (amounts in cents).
 */
export function buildReceiptEntries(receipt, { layout = 'split', entryDate } = {}) {
  const date = entryDate || receipt.paymentDate;
  const sum = (category) => receipt.lines.filter(line => line.category === category).reduce((total, line) => total + line.cents, 0);
  const renewalCents = sum('renewal') + (receipt.renewalKnowledgeCents || 0);
  const passingCents = sum('passing');
  const otherCents = sum('other');
  const fines = receipt.lines.filter(line => line.category === 'fine');
  const entries = [];
  const make = (fields) => ({
    entry_date: date,
    supplier: '',
    invoice_number: receipt.receiptNo,
    renewal: 0,
    fines: 0,
    rta_passing: 0,
    misc_exp: 0,
    note: '',
    ...fields
  });

  if (layout === 'receipt') {
    const finesCents = fines.reduce((total, line) => total + line.cents + (line.knowledgeCents || 0), 0);
    const parts = [];
    if (renewalCents) parts.push('renewal');
    if (fines.length) parts.push(`${fines.length} fine${fines.length === 1 ? '' : 's'}`);
    entries.push(make({ supplier: 'RTA', renewal: renewalCents, fines: finesCents, rta_passing: passingCents, misc_exp: otherCents, note: parts.join(' + ') }));
  } else {
    if (renewalCents || passingCents || otherCents) {
      entries.push(make({ supplier: 'RTA Renewal', renewal: renewalCents, rta_passing: passingCents, misc_exp: otherCents, note: 'Vehicle renewal' }));
    }
    fines.forEach(line => {
      const supplier = line.violation ? `${line.authority} · ${line.violation}` : line.authority;
      entries.push(make({
        supplier,
        invoice_number: line.fineNumber || receipt.receiptNo,
        fines: line.cents + (line.knowledgeCents || 0),
        note: line.knowledgeCents ? `Fine ${money(line.cents)} + Knowledge fee ${money(line.knowledgeCents)}` : `Fine ${money(line.cents)}`
      }));
    });
  }
  entries.forEach(entry => { entry.totalCents = entry.renewal + entry.fines + entry.rta_passing + entry.misc_exp; });
  const built = entries.reduce((total, entry) => total + entry.totalCents, 0);
  if (built !== receipt.totalCents) {
    throw new Error(`Receipt ${receipt.receiptNo}: entries add up to ${money(built)} instead of ${money(receipt.totalCents)}.`);
  }
  return entries;
}

// References that identify a receipt in the Expenses sheet (used to spot re-imports).
function receiptReferences(receipt) {
  return [receipt.receiptNo, ...receipt.lines.map(line => line.fineNumber).filter(Boolean)];
}

export function setupReceiptImport(app) {
  const dialog = document.getElementById('receiptImportDialog');
  const fileInput = document.getElementById('receiptImportFiles');
  const dropZone = document.getElementById('receiptDropZone');
  const fileList = document.getElementById('receiptFileList');
  const optionsBox = document.getElementById('receiptImportOptions');
  const receiptTable = document.getElementById('receiptImportReceipts');
  const entriesTable = document.getElementById('receiptImportEntries');
  const summary = document.getElementById('receiptImportSummary');
  const message = document.getElementById('receiptImportMessage');
  const confirmButton = document.getElementById('receiptImportConfirm');
  const oldDateBox = document.getElementById('receiptOldDateOption');
  const oldDateCheck = document.getElementById('receiptUseWorkDate');
  const oldDateLabel = document.getElementById('receiptOldDateText');
  const nameInput = document.getElementById('receiptImportName');
  const methodHint = document.getElementById('receiptPaymentHint');
  const typeChoices = document.getElementById('receiptTypeChoices');

  let files = [];      // { name, status: 'reading'|'done'|'error', error, receipts }
  let receipts = [];   // flattened, with ._include / ._status
  let busy = false;

  const selectedType = () => dialog.querySelector('input[name="receiptPaymentType"]:checked')?.value || '';
  const selectedLayout = () => dialog.querySelector('input[name="receiptLayout"]:checked')?.value || 'split';

  function reset() {
    files = [];
    receipts = [];
    fileInput.value = '';
    nameInput.value = '';
    oldDateCheck.checked = false;
    // Every payment type enabled for Expenses (Settings → Payment types); none preselected.
    typeChoices.innerHTML = app.expenseTypes().map(type => `<label class="tc-type"><input type="radio" name="receiptPaymentType" value="${escapeHtml(type.name)}"><strong>${escapeHtml(type.name)}</strong><small>${app.isCashType(type.name) ? 'Reduces Available Cash' : 'Not cash · entries only'}</small></label>`).join('');
    const split = dialog.querySelector('input[name="receiptLayout"][value="split"]');
    if (split) split.checked = true;
    message.textContent = '';
    render();
  }

  function open() {
    if (!app.canWrite()) { app.showToast('This access key can view records but cannot add entries.', true); return; }
    reset();
    dialog.showModal();
    loadPdfJs().catch(() => {}); // warm up while the person picks files
    // Duplicate detection needs every existing Expenses row.
    app.ensureExpensesLoaded().then(() => { if (dialog.open) render(); }).catch(() => {});
  }

  // Works out which receipts can be imported and why not.
  function refreshStatuses() {
    const existing = app.existingInvoiceNumbers();
    const seen = new Set();
    const cutoff = app.editCutoffDate();
    receipts.forEach(receipt => {
      let status = 'ready';
      let detail = '';
      if (receipt.error) { status = 'error'; detail = receipt.error; }
      else if (seen.has(receipt.receiptNo)) { status = 'duplicate-batch'; detail = 'Same receipt appears more than once in the selected files.'; }
      else if (receiptReferences(receipt).some(ref => existing.has(ref))) { status = 'imported'; detail = 'Already in Expenses (receipt or fine number found).'; }
      else if (!receipt.paymentDate) { status = 'error'; detail = 'Payment date could not be read.'; }
      else if (receipt.paymentDate < cutoff) {
        status = oldDateCheck.checked ? 'redated' : 'old';
        detail = oldDateCheck.checked
          ? `Paid ${app.formatDmy(receipt.paymentDate)}; will be entered on ${app.formatDmy(app.workDate())}.`
          : `Paid ${app.formatDmy(receipt.paymentDate)}, before the edit window (${app.formatDmy(cutoff)} onward).`;
      }
      seen.add(receipt.receiptNo);
      const importable = status === 'ready' || status === 'redated';
      if (receipt._status !== status) {
        // Default: tick importable receipts; untick everything else (re-imports can be ticked by hand).
        receipt._include = importable;
      }
      receipt._status = status;
      receipt._detail = detail;
      receipt._canTick = importable || status === 'imported';
    });
  }

  function entryDateFor(receipt) {
    return receipt._status === 'redated' ? app.workDate() : receipt.paymentDate;
  }

  function plannedEntries() {
    const layout = selectedLayout();
    const out = [];
    receipts.forEach(receipt => {
      if (!receipt._include || !receipt._canTick) return;
      buildReceiptEntries(receipt, { layout, entryDate: entryDateFor(receipt) }).forEach(entry => out.push({ ...entry, receipt }));
    });
    return out;
  }

  const STATUS_LABEL = {
    ready: 'Ready',
    redated: 'Working date',
    imported: 'Already imported',
    'duplicate-batch': 'Duplicate',
    old: 'Too old',
    error: 'Cannot read'
  };

  function render() {
    // Files
    fileList.innerHTML = files.map(file => {
      const state = file.status === 'reading' ? 'Reading…'
        : file.status === 'error' ? escapeHtml(file.error)
          : `${file.receipts.length} receipt${file.receipts.length === 1 ? '' : 's'}`;
      return `<li class="ri-file ${file.status}"><span class="ri-file-name">${escapeHtml(file.name)}</span><span class="ri-file-state">${state}</span></li>`;
    }).join('');
    const hasReceipts = receipts.length > 0;
    dropZone.classList.toggle('compact', files.length > 0);
    optionsBox.hidden = !hasReceipts;

    refreshStatuses();

    // Payment method seen on the receipts (a hint only; the person decides).
    const methods = [...new Set(receipts.map(receipt => receipt.paymentMethod).filter(Boolean))];
    methodHint.textContent = methods.length ? `The receipts show payment method: ${methods.join(', ')}.` : '';

    const oldCount = receipts.filter(receipt => receipt._status === 'old' || receipt._status === 'redated').length;
    oldDateBox.hidden = oldCount === 0;
    oldDateLabel.textContent = `${oldCount} receipt${oldCount === 1 ? ' is' : 's are'} dated before ${app.formatDmy(app.editCutoffDate())} (outside the ${app.editWindowDays}-day edit window). Enter ${oldCount === 1 ? 'it' : 'them'} on the working date (${app.formatDmy(app.workDate())}) instead`;

    // Receipts
    receiptTable.querySelector('tbody').innerHTML = receipts.map((receipt, index) => {
      const fines = receipt.lines.filter(line => line.category === 'fine');
      const renewal = receipt.lines.filter(line => line.category === 'renewal').reduce((t, l) => t + l.cents, 0) + (receipt.renewalKnowledgeCents || 0);
      const finesCents = fines.reduce((t, l) => t + l.cents + (l.knowledgeCents || 0), 0);
      const other = receipt.lines.filter(line => line.category === 'other' || line.category === 'passing').reduce((t, l) => t + l.cents, 0);
      const notes = [receipt._detail, ...(receipt.warnings || [])].filter(Boolean).map(escapeHtml).join('<br>');
      const parts = [renewal ? `Renewal ${money(renewal)}` : '', fines.length ? `${fines.length} fine${fines.length === 1 ? '' : 's'} ${money(finesCents)}` : '', other ? `Other ${money(other)}` : ''].filter(Boolean).join(' · ');
      return `<tr class="ri-status-${receipt._status}">
        <td class="ri-check"><input type="checkbox" data-index="${index}" ${receipt._include && receipt._canTick ? 'checked' : ''} ${receipt._canTick ? '' : 'disabled'} aria-label="Import receipt ${escapeHtml(receipt.receiptNo)}"></td>
        <td><span class="mono">${escapeHtml(receipt.receiptNo)}</span><div class="ri-sub">${escapeHtml(app.formatDmy(receipt.paymentDate))} · ${escapeHtml(receipt.fileName)} p.${receipt.pages.join('–')}</div><div class="ri-sub">${parts || '—'}</div>${notes ? `<div class="ri-sub ri-note">${notes}</div>` : ''}</td>
        <td class="num"><span class="strong">${receipt.totalCents != null ? money(receipt.totalCents) : '—'}</span><div><span class="ri-pill ri-pill-${receipt._status}">${STATUS_LABEL[receipt._status]}</span></div></td>
      </tr>`;
    }).join('') || '<tr><td colspan="3" class="ri-empty">No receipts yet.</td></tr>';

    // Entries preview
    let entries = [];
    let buildError = '';
    try { entries = plannedEntries(); } catch (error) { buildError = error.message; }
    const type = selectedType();
    entriesTable.querySelector('tbody').innerHTML = entries.map(entry => {
      const columns = [entry.renewal ? `Renewal ${money(entry.renewal)}` : '', entry.fines ? `Fines ${money(entry.fines)}` : '', entry.rta_passing ? `RTA Passing ${money(entry.rta_passing)}` : '', entry.misc_exp ? `Misc ${money(entry.misc_exp)}` : ''].filter(Boolean).join(' · ');
      return `<tr>
        <td>${escapeHtml(entry.supplier)}<div class="ri-sub"><span class="mono">${escapeHtml(entry.invoice_number)}</span> · ${escapeHtml(app.formatDmy(entry.entry_date))}</div><div class="ri-sub">${escapeHtml(columns)}${entry.note ? ` · ${escapeHtml(entry.note)}` : ''}</div></td>
        <td class="num"><span class="strong">${money(entry.totalCents)}</span><div class="ri-sub">${type ? escapeHtml(type) : '<span class="ri-missing">Choose type</span>'}</div></td>
      </tr>`;
    }).join('') || '<tr><td colspan="2" class="ri-empty">Tick at least one receipt.</td></tr>';

    const totalCents = entries.reduce((t, e) => t + e.totalCents, 0);
    const chosen = receipts.filter(receipt => receipt._include && receipt._canTick).length;
    summary.textContent = hasReceipts
      ? `${chosen} of ${receipts.length} receipt${receipts.length === 1 ? '' : 's'} · ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} · AED ${money(totalCents)}`
      : '';
    const reading = files.some(file => file.status === 'reading');
    confirmButton.disabled = busy || reading || !entries.length || !type || Boolean(buildError);
    confirmButton.textContent = entries.length
      ? `Add ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}${type ? ` as ${type}` : ''}`
      : 'Add entries';
    if (buildError) message.textContent = buildError;
    else if (hasReceipts && !type) message.textContent = 'Choose how the receipts were paid before adding the entries.';
    else if (!busy) message.textContent = '';
  }

  async function readFiles(list) {
    const pdfs = [...list].filter(file => /\.pdf$/i.test(file.name) || file.type === 'application/pdf');
    if (!pdfs.length) { message.textContent = 'Please choose PDF files.'; return; }
    const known = new Set(files.map(file => `${file.name}|${file.size}`));
    const fresh = pdfs.filter(file => !known.has(`${file.name}|${file.size}`));
    if (!fresh.length) { message.textContent = 'Those files are already in the list.'; return; }
    const entries = fresh.map(file => ({ name: file.name, size: file.size, status: 'reading', receipts: [], file }));
    files.push(...entries);
    render();
    let pdfjs;
    try {
      pdfjs = await loadPdfJs();
    } catch (error) {
      entries.forEach(entry => { entry.status = 'error'; entry.error = 'The PDF reader could not be loaded. Check the connection and try again.'; });
      render();
      return;
    }
    for (const entry of entries) {
      try {
        const data = new Uint8Array(await entry.file.arrayBuffer());
        const pdf = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
        const result = await parseRtaReceiptPdf(pdf, entry.name);
        pdf.destroy?.();
        if (!result.isRtaReceipt) throw new Error('Not an RTA vehicle renewal receipt.');
        entry.receipts = result.receipts;
        entry.status = 'done';
        receipts.push(...result.receipts);
      } catch (error) {
        entry.status = 'error';
        entry.error = /password/i.test(error?.message || '') ? 'The PDF is password protected.' : (error?.message || 'Could not read this PDF.');
      }
      delete entry.file;
      render();
    }
  }

  async function confirmImport() {
    const type = selectedType();
    if (!type || busy) return;
    busy = true;
    confirmButton.disabled = true;
    message.textContent = 'Adding entries…';
    try {
      await app.ensureExpensesLoaded();
      refreshStatuses(); // re-check duplicates against the freshly loaded sheet
      const entries = plannedEntries();
      if (!entries.length) { message.textContent = 'Nothing to add: the selected receipts are already in Expenses.'; render(); return; }
      if (entries.some(entry => !app.isDateEditable(entry.entry_date))) {
        message.textContent = 'Some entries are dated before the edit window. Tick the working-date option or untick those receipts.';
        return;
      }
      const name = nameInput.value.trim();
      const added = app.addExpenseEntries(entries.map(entry => ({
        entry_date: entry.entry_date,
        supplier: entry.supplier,
        spent_by: name,
        invoice_number: entry.invoice_number,
        transaction_type: type,
        amounts: { renewal: entry.renewal, fines: entry.fines, rta_passing: entry.rta_passing, misc_exp: entry.misc_exp }
      })));
      const receiptCount = new Set(entries.map(entry => entry.receipt.receiptNo)).size;
      const totalCents = entries.reduce((t, e) => t + e.totalCents, 0);
      dialog.close();
      app.showToast(`Added ${added} ${type} entr${added === 1 ? 'y' : 'ies'} from ${receiptCount} receipt${receiptCount === 1 ? '' : 's'} (AED ${money(totalCents)}). Saving automatically.${app.isCashType(type) ? '' : ` ${type} entries do not change Available Cash.`}`);
    } catch (error) {
      message.textContent = error?.message || 'The entries could not be added.';
    } finally {
      busy = false;
      if (dialog.open) render();
    }
  }

  // ---- Events ----------------------------------------------------------------
  document.getElementById('importReceiptsButton').addEventListener('click', open);
  document.getElementById('closeReceiptImport').addEventListener('click', () => dialog.close());
  document.getElementById('receiptImportCancel').addEventListener('click', () => dialog.close());
  document.getElementById('receiptChooseFiles').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { if (fileInput.files?.length) readFiles(fileInput.files); fileInput.value = ''; });
  confirmButton.addEventListener('click', confirmImport);
  dialog.addEventListener('change', event => {
    const box = event.target.closest('input[type="checkbox"][data-index]');
    if (box) receipts[Number(box.dataset.index)]._include = box.checked;
    render();
  });
  ['dragenter', 'dragover'].forEach(type => dialog.addEventListener(type, event => {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    dropZone.classList.add('dragging');
  }));
  ['dragleave', 'drop'].forEach(type => dialog.addEventListener(type, event => {
    if (type === 'dragleave' && dialog.contains(event.relatedTarget)) return;
    dropZone.classList.remove('dragging');
  }));
  dialog.addEventListener('drop', event => {
    if (!event.dataTransfer?.files?.length) return;
    event.preventDefault();
    readFiles(event.dataTransfer.files);
  });
  dialog.addEventListener('close', () => { files = []; receipts = []; });

  return { open };
}
