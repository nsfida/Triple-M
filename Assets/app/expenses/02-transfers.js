/* Modularized from script.js lines 24604-26701 — wallet transfers. Load order must be preserved. */
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
    `<option value="${escapeHtml(a.group_id)}" data-currency="${escapeHtml(a.currency || "")}" ${a.group_id === fromGroupId ? 'selected' : ''}>${escapeHtml(a.person_name)} (${escapeHtml(formatReportAmount(a.balance, a.currency))}) - ${escapeHtml(a.currency)}</option>`
  ).join("");
  
  // Set to wallet (exclude from wallet)
  els.transferToWallet.innerHTML = accounts.filter(a => a.group_id !== fromGroupId).map(a => 
    `<option value="${escapeHtml(a.group_id)}" data-currency="${escapeHtml(a.currency || "")}">${escapeHtml(a.person_name)} (${escapeHtml(formatReportAmount(a.balance, a.currency))}) - ${escapeHtml(a.currency)}</option>`
  ).join("");
  
  if (els.transferToWallet.options.length === 0) {
    els.transferToWallet.innerHTML = '<option value="">No other wallets available</option>';
  }
  syncCurrencySelectFonts(els.transferFromWallet);
  syncCurrencySelectFonts(els.transferToWallet);
  
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
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Please enter a valid amount greater than zero.");
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
  
  // Create transfer records — await sync so both wallets refresh from DB after both rows land.
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
  
  await saveEntriesImmediately([expensePayload, topupPayload], { label: "Transfer", awaitSync: true });
  
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

function ensureSalesInvoiceSuccessOverlay(){
  let overlay = document.getElementById("salesInvoiceSuccessOverlay");
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.id = "salesInvoiceSuccessOverlay";
  overlay.className = "transfer-success-overlay sales-invoice-success-overlay hide";
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `
    <div class="transfer-success-backdrop" data-sales-invoice-close></div>
    <div class="transfer-success-content sales-invoice-success-content" role="dialog" aria-modal="true" aria-labelledby="salesInvoiceSuccessTitle">
      <div class="transfer-success-icon sales-invoice-success-mark" aria-hidden="true">
        <i class="fa-solid fa-circle-check"></i>
      </div>
      <div class="transfer-success-message">
        <h3 id="salesInvoiceSuccessTitle">Invoice saved</h3>
        <p class="sales-invoice-success-sub">Your sales invoice / receipt is ready.</p>
        <div class="transfer-details sales-invoice-success-details">
          <div class="transfer-amount" id="salesInvoiceSuccessTotal">—</div>
          <div class="sales-invoice-success-meta">
            <span id="salesInvoiceSuccessNumber">Invoice —</span>
            <span id="salesInvoiceSuccessCustomer">Customer —</span>
          </div>
        </div>
      </div>
      <div class="transfer-success-actions sales-invoice-success-actions">
        <button type="button" class="btn primary" id="salesInvoiceSuccessPdfBtn">
          <i class="fa-solid fa-file-pdf" aria-hidden="true"></i> Download PDF
        </button>
        <button type="button" class="btn ghost" data-sales-invoice-close>Done</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelectorAll("[data-sales-invoice-close]").forEach(el => {
    el.addEventListener("click", () => closeSalesInvoiceSuccessOverlay());
  });
  overlay.querySelector("#salesInvoiceSuccessPdfBtn")?.addEventListener("click", async () => {
    const entryId = overlay.dataset.entryId || "";
    if (!entryId) {
      alert("Invoice was saved, but the PDF entry could not be found. Open the customer invoice list to download it.");
      return;
    }
    try {
      await downloadInventoryReceiptPDF(entryId);
    } catch (err) {
      alert(err.message || "Could not download invoice PDF.");
    }
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !overlay.classList.contains("hide")) {
      closeSalesInvoiceSuccessOverlay();
    }
  });
  return overlay;
}

function showSalesInvoiceSuccessOverlay(details = {}){
  const overlay = ensureSalesInvoiceSuccessOverlay();
  const invoiceNumber = String(details.invoiceNumber || details.receiptNumber || "").trim() || "—";
  const customerName = String(details.customerName || "").trim() || "Customer";
  const totalText = String(details.totalText || "").trim() || "—";
  overlay.dataset.entryId = String(details.entryId || "").trim();
  const totalEl = overlay.querySelector("#salesInvoiceSuccessTotal");
  const numberEl = overlay.querySelector("#salesInvoiceSuccessNumber");
  const customerEl = overlay.querySelector("#salesInvoiceSuccessCustomer");
  if (totalEl) totalEl.textContent = totalText;
  if (numberEl) numberEl.textContent = `Invoice ${invoiceNumber}`;
  if (customerEl) customerEl.textContent = customerName;
  overlay.classList.remove("hide");
  overlay.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  overlay.querySelector("#salesInvoiceSuccessPdfBtn")?.focus();
}

function closeSalesInvoiceSuccessOverlay(){
  const overlay = document.getElementById("salesInvoiceSuccessOverlay");
  if (!overlay) return;
  overlay.classList.add("hide");
  overlay.setAttribute("aria-hidden", "true");
  overlay.dataset.entryId = "";
  document.body.style.overflow = "";
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
  await ensureAllLedgerDataLoaded({ throwOnError: true });

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

async function downloadJsonBackup(){
  if (isGuestMode()) {
    alert("Demo Login cannot download JSON backups. Please use a real login for backup exports.");
    return;
  }
  await ensureAllLedgerDataLoaded({ throwOnError: true });
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

async function downloadCsvBackup(){
  if (isGuestMode()) {
    alert("Demo Login cannot download CSV backups. Please use a real login for backup exports.");
    return;
  }
  await ensureAllLedgerDataLoaded({ throwOnError: true });
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
  const entries = assignMissingIdsAndGroupIds(parseEntriesCsv(text), { existingEntries: [] });
  
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

/**
 * Auto-assign missing id / group_id for CSV rows.
 * - Missing id → new UUID
 * - Principal without group_id → new group_id
 * - Payment/partial/full without group_id → match person_name+currency+direction
 *   within the import batch (prefer principal), then existing data; else new group_id
 */
function assignMissingIdsAndGroupIds(entries, { existingEntries = [] } = {}){
  const list = Array.isArray(entries) ? entries.map(e => ({ ...e })) : [];
  const matchKey = (e) =>
    `${String(e.person_name || "").trim().toLowerCase()}|${normalizeCurrencyCode(e.currency || "")}|${String(e.direction || "").trim()}`;

  const groupByKey = new Map();
  const seedFrom = (rows) => {
    for (const row of rows) {
      if (!row?.group_id) continue;
      const key = matchKey(row);
      if (!groupByKey.has(key)) groupByKey.set(key, String(row.group_id));
    }
  };
  seedFrom(existingEntries);
  // Prefer principals in the batch for new group assignment
  for (const entry of list) {
    if (entry.entry_kind === "principal" && entry.group_id) {
      groupByKey.set(matchKey(entry), String(entry.group_id));
    }
  }

  for (const entry of list) {
    if (!entry.id) entry.id = crypto.randomUUID();
    if (!entry.loan_date) entry.loan_date = entry.action_date || todayISO();
    if (entry.group_id) {
      if (entry.entry_kind === "principal") groupByKey.set(matchKey(entry), String(entry.group_id));
      continue;
    }
    if (entry.entry_kind === "principal") {
      entry.group_id = crypto.randomUUID();
      groupByKey.set(matchKey(entry), entry.group_id);
      continue;
    }
    const key = matchKey(entry);
    if (groupByKey.has(key)) {
      entry.group_id = groupByKey.get(key);
    } else {
      entry.group_id = crypto.randomUUID();
      groupByKey.set(key, entry.group_id);
    }
  }
  return list;
}

function normalizeSectionCsvKey(section){
  const s = String(section || "").trim().toLowerCase();
  if (s === "given" || s === "loans-given" || s === "loans_given") return LEDGER_SCOPE_LOANS_GIVEN;
  if (s === "taken" || s === "loans-taken" || s === "loans_taken") return LEDGER_SCOPE_LOANS_TAKEN;
  if (s === "installments" || s === "installment") return LEDGER_SCOPE_INSTALLMENTS;
  if (s === "expenses" || s === "expense") return LEDGER_SCOPE_EXPENSES;
  if (s === "goods" || s === "inventory") return LEDGER_SCOPE_GOODS;
  if (s === "notes" || s === "note") return "notes";
  if (s === "bitcoin" || s === "btc") return "bitcoin";
  return s;
}

function installmentCsvRowHasSourceIdentity(entry){
  if (!entry) return false;
  const direction = String(entry.direction || "").trim().toLowerCase();
  // Installment plans are always stored as taken. Never reinterpret a Loans Given row.
  if (direction && direction !== "taken") return false;

  const notes = String(entry.notes || "");
  const domainTable = String(entry.domain_table || "").trim().toLowerCase();
  const hasDomainIdentity = domainTable === "installment_plans" || domainTable === "installment_payments";
  const hasMetaIdentity = /\[(?:ICNT|IAMT|ILAST|IFREQ|ISTART|IALLOC|IDOWN|IFIN|IPTYPE):/i.test(notes);
  return hasInstallmentTag(notes) || hasDomainIdentity || hasMetaIdentity;
}

function filterInstallmentCsvRowsByGroupIntegrity(entries){
  const list = Array.isArray(entries) ? entries : [];
  const importedPrincipalGroups = new Set(
    list
      .filter(entry => entry?.entry_kind === "principal" && entry.group_id)
      .map(entry => String(entry.group_id))
  );
  const existingPrincipalGroups = new Set(
    state.entries
      .filter(entry => entry?.entry_kind === "principal" && entryBelongsToLedgerScope(entry, LEDGER_SCOPE_INSTALLMENTS) && entry.group_id)
      .map(entry => String(entry.group_id))
  );

  return list.filter(entry => {
    if (entry?.entry_kind === "principal") return true;
    const groupId = String(entry?.group_id || "").trim();
    return !!groupId && (importedPrincipalGroups.has(groupId) || existingPrincipalGroups.has(groupId));
  });
}

function ensureEntryTagsForSection(entry, scope){
  const row = { ...entry };
  if (scope === LEDGER_SCOPE_INSTALLMENTS) {
    row.direction = "taken";
    row.notes = normalizeInstallmentNote(row.notes, true);
  } else if (scope === LEDGER_SCOPE_GOODS) {
    row.notes = normalizeGoodsNote(row.notes, true);
    if (!row.direction) row.direction = "taken";
  } else if (scope === LEDGER_SCOPE_EXPENSES) {
    row.direction = "taken";
    if (!hasExpenseAccountTag(row.notes)) {
      row.notes = `${EXPENSE_ACCOUNT_TAG} ${String(row.notes || "").trim()}`.trim();
    }
  } else if (scope === LEDGER_SCOPE_LOANS_GIVEN) {
    row.direction = "given";
    row.notes = normalizeInstallmentNote(row.notes, false);
  } else if (scope === LEDGER_SCOPE_LOANS_TAKEN) {
    row.direction = "taken";
    row.notes = normalizeInstallmentNote(row.notes, false);
  }
  if (!row.loan_date) {
    row.loan_date = row.action_date || todayISO();
  }
  return row;
}

function entriesForSectionCsv(scope){
  if (scope === "notes") {
    return (state.notes || []).map(note => {
      const title = typeof noteTitleFor === "function"
        ? noteTitleFor(note)
        : String(note.title || note.content || "Untitled note").trim().slice(0, 120);
      return {
        id: note.id,
        group_id: note.id,
        direction: "taken",
        entry_kind: "principal",
        person_name: "SYSTEM",
        currency: "AED",
        principal_amount: 0,
        action_amount: null,
        loan_date: (note.createdAt || "").slice(0, 10) || todayISO(),
        action_date: (note.createdAt || "").slice(0, 10) || null,
        notes: JSON.stringify({ title, content: note.content || "", rowType: "NOTE" }),
        created_at: note.createdAt || new Date().toISOString(),
        data_origin: note.data_origin || "",
        domain_table: note.domain_table || "app_notes"
      };
    });
  }
  if (scope === "bitcoin") {
    return (state.bitcoinWallets || []).map(wallet => ({
      id: wallet.id,
      group_id: wallet.id,
      direction: "taken",
      entry_kind: "principal",
      person_name: "SYSTEM",
      currency: "BTC",
      principal_amount: 0,
      action_amount: null,
      loan_date: (wallet.createdAt || "").slice(0, 10) || todayISO(),
      action_date: null,
      notes: JSON.stringify({
        address: wallet.address || "",
        label: wallet.label || "",
        network: wallet.network || "",
        is_watch_only: !!wallet.is_watch_only,
        rowType: "BITCOIN_WALLET"
      }),
      created_at: wallet.createdAt || new Date().toISOString(),
      data_origin: wallet.data_origin || "",
      domain_table: wallet.domain_table || "bitcoin_wallets"
    }));
  }
  return state.entries.filter(entry =>
    entryBelongsToLedgerScope(entry, scope) && !hasDeletedTag(entry.notes)
  );
}

function triggerCsvDownload(csvText, filename){
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function inventoryAuditStatusLabel(group){
  if (Number(group.remainingQty || 0) <= 0.00000001) return "Sold";
  if (isInventoryLowStockGroup(group)) return "Low";
  return "In";
}

function auditReportRound(value, digits = 4){
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

function auditReportIsoDate(value){
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const stamp = dateStamp(raw);
  if (!stamp) return raw.length >= 10 ? raw.slice(0, 10) : raw;
  try {
    return new Date(stamp).toISOString().slice(0, 10);
  } catch {
    return raw.slice(0, 10);
  }
}

function auditReportSheetName(name){
  return String(name || "Sheet")
    .replace(/[\\/?*\[\]:]/g, "_")
    .trim()
    .slice(0, 31) || "Sheet";
}

function auditReportEntityInfo(){
  const contact = typeof getPdfCompanyContact === "function" ? getPdfCompanyContact() : null;
  const company = String(
    contact?.name ||
    fullConfigData?.Company ||
    state.sessionUser?.company_name ||
    state.sessionUser?.settings?.Company ||
    ""
  ).trim();
  const trn = String(
    contact?.trn ||
    fullConfigData?.TRN ||
    state.sessionUser?.vat_number ||
    state.sessionUser?.settings?.TRN ||
    ""
  ).trim();
  const address = String(contact?.address || fullConfigData?.Address || fullConfigData?.address || "").trim();
  const phone = String(contact?.phone || fullConfigData?.Mobile || fullConfigData?.Phone || "").trim();
  const email = String(contact?.email || fullConfigData?.Email || fullConfigData?.email || "").trim();
  return {
    company: company || "Triplem VIP",
    trn,
    address,
    phone,
    email,
    username: String(state.currentUsername || "").trim(),
    reportDate: todayISO(),
    generatedAt: new Date().toISOString()
  };
}

function auditReportTitleBlock(sheetTitle, options = {}){
  const info = options.info || auditReportEntityInfo();
  const currency = String(options.currency || "").trim();
  const rows = [
    [info.company],
    [info.trn ? `TRN / VAT Registration No.: ${info.trn}` : "TRN / VAT Registration No.: —"],
    ["Inventory Audit Report"],
    [`Sheet: ${sheetTitle}`],
    [`Report date: ${info.reportDate}`],
    [`Generated (UTC): ${info.generatedAt}`],
    ["Prepared for audit / inspection"],
    [info.username ? `Prepared by workspace user: ${info.username}` : "Prepared by workspace user: —"]
  ];
  if (info.address) rows.push([`Address: ${info.address}`]);
  if (info.phone || info.email) {
    rows.push([`Contact: ${[info.phone, info.email].filter(Boolean).join(" | ")}`]);
  }
  if (currency) rows.push([`Currency scope: ${currency}`]);
  rows.push([]);
  return rows;
}

function auditReportColWidths(widths){
  return (widths || []).map(w => ({ wch: Math.max(Number(w) || 10, 6) }));
}

function auditReportPushTotalRow(rows, labelColIndex, numericIndexes, label = "TOTAL"){
  if (!rows.length) return;
  const width = rows[0].length;
  const total = new Array(width).fill("");
  total[Math.max(0, labelColIndex)] = label;
  numericIndexes.forEach(index => {
    let sum = 0;
    for (let i = 0; i < rows.length; i += 1) {
      const n = Number(rows[i][index]);
      if (Number.isFinite(n)) sum += n;
    }
    total[index] = auditReportRound(sum, 2);
  });
  rows.push(total);
}

function auditReportSettlementPaidForSale(saleEntryId){
  const saleId = String(saleEntryId || "").trim();
  if (!saleId) return 0;
  return state.entries.reduce((sum, entry) => {
    if (!isInventorySettlementAction(entry)) return sum;
    const meta = goodsMetaFromNotes(entry.notes);
    if (String(meta.settlementForEntryId || "") !== saleId) return sum;
    return sum + Number(entry.action_amount || 0);
  }, 0);
}

function auditReportFindLinkedWallet(mode, context = {}){
  const currency = String(context.currency || "").trim();
  const date = auditReportIsoDate(context.date);
  const invoice = String(context.invoiceNumber || context.receiptNumber || "").trim().toLowerCase();
  const itemName = String(context.itemName || "").trim().toLowerCase();
  const amount = Number(context.amount || 0);
  const preferSale = mode === "sale";
  let best = "";
  for (const entry of state.entries) {
    if (!hasExpenseAccountTag(entry.notes)) continue;
    if (currency && String(entry.currency || "") !== currency) continue;
    if (date && auditReportIsoDate(entry.action_date) !== date) continue;
    const meta = expenseMetaFromNotes(entry.notes);
    const expenseType = String(meta.expenseType || "").toLowerCase();
    const notes = String(entry.notes || "").toLowerCase();
    const isSaleWallet = expenseType.includes("inventory sale") || notes.includes("inventory sale");
    const isPurchaseWallet = expenseType.includes("inventory purchase") || notes.includes("inventory purchase");
    if (preferSale && !isSaleWallet) continue;
    if (!preferSale && !isPurchaseWallet) continue;
    if (preferSale && invoice && !notes.includes(invoice)) continue;
    if (!preferSale && itemName && meta.itemName && !String(meta.itemName).toLowerCase().includes(itemName) && !itemName.includes(String(meta.itemName).toLowerCase())) {
      continue;
    }
    if (amount > 0 && Math.abs(Number(entry.action_amount || 0) - amount) > 0.02) continue;
    best = String(entry.person_name || meta.itemName || "").trim();
    if (best) break;
  }
  return best;
}

function collectInventoryAuditPurchaseLines(goodsAll){
  const lines = [];
  (goodsAll || []).forEach(group => {
    const principal = group.principal;
    if (principal) {
      const meta = goodsMetaFromNotes(principal.notes);
      const qty = Number(meta.boughtQty != null ? meta.boughtQty : group.boughtQty || 0);
      const lineTotal = Number(principal.principal_amount || 0);
      const tax = taxBreakdownFromMeta(meta, lineTotal);
      const unitCost = meta.unitActualPrice != null ? Number(meta.unitActualPrice) : Number(group.unitActualPrice || 0);
      const currency = String(group.currency || principal.currency || "").trim() || "—";
      const date = auditReportIsoDate(principal.loan_date || group.loan_date);
      lines.push({
        date,
        entryId: principal.id || "",
        itemCode: meta.itemCode || group.itemCode || "",
        itemName: group.person_name || "",
        itemDescription: meta.itemDescription || group.itemDescription || "",
        itemType: meta.itemType || group.itemType || "",
        itemCategory: meta.itemCategory || group.itemCategory || "",
        quantityUnit: meta.quantityUnit || group.quantityUnit || "",
        qty,
        unitCost,
        lineTotal,
        taxRate: tax.rate,
        taxAmount: tax.tax,
        netAmount: tax.net,
        currency,
        entryKind: "Opening purchase",
        notes: cleanGoodsDisplayNote(principal.notes) || "",
        wallet: auditReportFindLinkedWallet("purchase", {
          currency,
          date,
          itemName: group.person_name || "",
          amount: lineTotal
        })
      });
    }
    (group.purchaseActions || []).forEach(row => {
      const meta = goodsMetaFromNotes(row.notes);
      const qty = Number(meta.boughtQty || 0);
      const lineTotal = Number(row.action_amount || 0);
      const tax = taxBreakdownFromMeta(meta, lineTotal);
      const currency = String(row.currency || group.currency || "").trim() || "—";
      const date = auditReportIsoDate(row.action_date);
      lines.push({
        date,
        entryId: row.id || "",
        itemCode: meta.itemCode || group.itemCode || "",
        itemName: group.person_name || "",
        itemDescription: meta.itemDescription || group.itemDescription || "",
        itemType: meta.itemType || group.itemType || "",
        itemCategory: meta.itemCategory || group.itemCategory || "",
        quantityUnit: meta.quantityUnit || group.quantityUnit || "",
        qty,
        unitCost: Number(meta.unitActualPrice || 0),
        lineTotal,
        taxRate: tax.rate,
        taxAmount: tax.tax,
        netAmount: tax.net,
        currency,
        entryKind: "Restock / additional purchase",
        notes: cleanGoodsDisplayNote(row.notes) || "",
        wallet: auditReportFindLinkedWallet("purchase", {
          currency,
          date,
          itemName: group.person_name || "",
          amount: lineTotal
        })
      });
    });
  });
  return lines.sort((a, b) =>
    dateStamp(a.date) - dateStamp(b.date) ||
    String(a.itemName).localeCompare(String(b.itemName)) ||
    String(a.itemCode).localeCompare(String(b.itemCode))
  );
}

function collectInventoryAuditSalesLines(goodsAll){
  const lines = [];
  (goodsAll || []).forEach(group => {
    const unitCost = Number(group.unitActualPrice || 0);
    (group.actions || []).forEach(row => {
      const meta = goodsMetaFromNotes(row.notes);
      const qty = Number(meta.soldQty || 0);
      const lineTotal = Number(row.action_amount || 0);
      const tax = taxBreakdownFromMeta(meta, lineTotal);
      const initialPaid = inventoryLinePaidAmount(meta, lineTotal);
      const settlementPaid = auditReportSettlementPaidForSale(row.id);
      const paid = Math.min(lineTotal, initialPaid + settlementPaid);
      const balance = Math.max(lineTotal - paid, 0);
      const currency = String(row.currency || group.currency || "").trim() || "—";
      const invoiceNumber = meta.invoiceNumber || meta.receiptNumber || shortId(row.id) || "";
      const date = auditReportIsoDate(row.action_date);
      const estProfit = qty > 0 ? (Number(tax.net || 0) - (unitCost * qty)) : "";
      lines.push({
        date,
        entryId: row.id || "",
        invoiceNumber,
        paymentReceiptNumber: meta.paymentReceiptNumber || "",
        customerName: meta.customerName || "Walk-in customer",
        customerCompany: meta.customerCompany || "",
        customerTrn: meta.customerTrn || "",
        customerPhone: meta.customerPhone || "",
        customerEmail: meta.customerEmail || "",
        customerAddress: meta.customerAddress || "",
        itemCode: meta.itemCode || group.itemCode || "",
        itemName: group.person_name || "",
        itemType: meta.itemType || group.itemType || "",
        itemCategory: meta.itemCategory || group.itemCategory || "",
        quantityUnit: meta.quantityUnit || group.quantityUnit || "",
        qty,
        unitPrice: Number(meta.unitSoldPrice || 0),
        unitCost,
        lineTotal,
        taxRate: tax.rate,
        taxAmount: tax.tax,
        netAmount: tax.net,
        paid,
        balance,
        paymentStatus: balance <= 0.00000001 ? "Full Paid" : inventoryPaymentStatus(meta, lineTotal),
        currency,
        estProfit,
        notes: cleanGoodsDisplayNote(row.notes) || "",
        wallet: auditReportFindLinkedWallet("sale", {
          currency,
          date,
          invoiceNumber,
          receiptNumber: meta.receiptNumber || invoiceNumber,
          amount: paid
        })
      });
    });
  });
  return lines.sort((a, b) =>
    dateStamp(a.date) - dateStamp(b.date) ||
    String(a.invoiceNumber).localeCompare(String(b.invoiceNumber)) ||
    String(a.itemName).localeCompare(String(b.itemName))
  );
}

function buildInventoryAuditDetailSheet(sheetTitle, headers, dataRows, options = {}){
  const info = options.info || auditReportEntityInfo();
  const titleRows = auditReportTitleBlock(sheetTitle, { info, currency: options.currency });
  const headerRowIndex = titleRows.length;
  const tableRows = dataRows.map(row => row.slice());
  if (options.totals && tableRows.length) {
    auditReportPushTotalRow(
      tableRows,
      options.totals.labelColIndex ?? 0,
      options.totals.numericIndexes || [],
      options.totals.label || "TOTAL"
    );
  }
  if (!tableRows.length && options.emptyRow) {
    tableRows.push(options.emptyRow);
  }
  return {
    name: auditReportSheetName(options.sheetName || sheetTitle),
    rows: [...titleRows, headers, ...tableRows],
    freezeRow: headerRowIndex + 1,
    cols: options.cols || null
  };
}

function buildInventoryAuditReportSheets(){
  const payload = buildInventoryDetailsPayload();
  const goodsAll = payload.goodsAll || [];
  const outstanding = collectOutstandingInventoryInvoices();
  const info = auditReportEntityInfo();
  const purchaseLines = collectInventoryAuditPurchaseLines(goodsAll);
  const salesLines = collectInventoryAuditSalesLines(goodsAll);

  const currencies = sortCurrenciesList([
    ...goodsAll.map(g => g.currency),
    ...purchaseLines.map(l => l.currency),
    ...salesLines.map(l => l.currency),
    ...outstanding.map(inv => inv.currency)
  ].filter(c => c && c !== "—"));

  const currencySet = currencies.length ? currencies : ["—"];
  const sheets = [];

  const summaryTitle = auditReportTitleBlock("Summary — Overall", { info });
  const summaryMetricsHeaderIndex = summaryTitle.length;
  const summaryRows = [
    ...summaryTitle,
    ["Section", "Metric", "Value"],
    ["Inventory register", "Total stock keeping units (SKUs)", payload.metrics.items],
    ["Inventory register", "Items in stock", payload.metrics.inStock],
    ["Inventory register", "Items low stock", payload.metrics.lowStock],
    ["Inventory register", "Items sold out", payload.metrics.soldOut],
    ["Inventory register", "Quantity on hand (summary)", payload.metrics.stockQty],
    ["Valuation", "Stock value on hand", payload.metrics.stockValue],
    ["Purchases", "Purchase total (gross)", payload.metrics.purchaseTotal],
    ["Sales", "Sales total (gross)", payload.metrics.salesTotal],
    ["Collections", "Amount collected", payload.metrics.paidTotal],
    ["Receivables", "Outstanding invoice count", payload.metrics.outstandingCount],
    ["Receivables", "Outstanding balance", payload.metrics.outstanding],
    ["Profit and loss", "Realized profit total", payload.metrics.profitTotal],
    ["Profit and loss", "Realized loss total", payload.metrics.lossTotal],
    [],
    ["Movement summary by currency"],
    [
      "Currency",
      "SKUs",
      "Qty purchased",
      "Qty sold",
      "Qty on hand",
      "Stock value",
      "Purchase total",
      "Purchase net",
      "Purchase VAT",
      "Sales total",
      "Sales net",
      "Sales VAT",
      "Amount collected",
      "Balance due",
      "Realized profit",
      "Realized loss",
      "Outstanding invoices",
      "Outstanding balance"
    ]
  ];

  currencySet.forEach(currency => {
    const groups = goodsAll.filter(g => String(g.currency || "—") === currency);
    const purchases = purchaseLines.filter(l => l.currency === currency);
    const sales = salesLines.filter(l => l.currency === currency);
    const outs = outstanding.filter(inv => String(inv.currency || "—") === currency);
    const stockValue = groups.reduce((sum, g) => sum + (Number(g.unitActualPrice || 0) * Number(g.remainingQty || 0)), 0);
    const purchaseTotal = purchases.reduce((sum, l) => sum + Number(l.lineTotal || 0), 0);
    const purchaseNet = purchases.reduce((sum, l) => sum + Number(l.netAmount || 0), 0);
    const purchaseTax = purchases.reduce((sum, l) => sum + Number(l.taxAmount || 0), 0);
    const salesTotal = sales.reduce((sum, l) => sum + Number(l.lineTotal || 0), 0);
    const salesNet = sales.reduce((sum, l) => sum + Number(l.netAmount || 0), 0);
    const salesTax = sales.reduce((sum, l) => sum + Number(l.taxAmount || 0), 0);
    const paidTotal = sales.reduce((sum, l) => sum + Number(l.paid || 0), 0);
    const balanceDue = sales.reduce((sum, l) => sum + Number(l.balance || 0), 0);
    const profit = groups.reduce((sum, g) => sum + Math.max(Number(g.profitLoss || 0), 0), 0);
    const loss = groups.reduce((sum, g) => sum + Math.abs(Math.min(Number(g.profitLoss || 0), 0)), 0);
    const qtyBought = groups.reduce((sum, g) => sum + Number(g.boughtQty || 0), 0);
    const qtySold = groups.reduce((sum, g) => sum + Number(g.soldQty || 0), 0);
    const qtyRemain = groups.reduce((sum, g) => sum + Number(g.remainingQty || 0), 0);
    const outstandingBalance = outs.reduce((sum, inv) => {
      if (inv.balanceByCurrency?.has?.(currency)) return sum + Number(inv.balanceByCurrency.get(currency) || 0);
      return sum + Number(inv.balanceTotal || 0);
    }, 0);
    summaryRows.push([
      currency,
      groups.length,
      auditReportRound(qtyBought),
      auditReportRound(qtySold),
      auditReportRound(qtyRemain),
      auditReportRound(stockValue, 2),
      auditReportRound(purchaseTotal, 2),
      auditReportRound(purchaseNet, 2),
      auditReportRound(purchaseTax, 2),
      auditReportRound(salesTotal, 2),
      auditReportRound(salesNet, 2),
      auditReportRound(salesTax, 2),
      auditReportRound(paidTotal, 2),
      auditReportRound(balanceDue, 2),
      auditReportRound(profit, 2),
      auditReportRound(loss, 2),
      outs.length,
      auditReportRound(outstandingBalance, 2)
    ]);
  });

  sheets.push({
    name: auditReportSheetName("Summary"),
    rows: summaryRows,
    freezeRow: summaryMetricsHeaderIndex + 1,
    cols: auditReportColWidths([18, 36, 28, 14, 12, 12, 14, 14, 14, 14, 14, 12, 14, 12, 14, 12, 16, 16])
  });

  const stockHeaders = [
    "Serial No.",
    "Item Code",
    "Item Name",
    "Description",
    "Item Type",
    "Category",
    "Unit of Measure",
    "Currency",
    "Stock Status",
    "Quantity Purchased",
    "Quantity Sold",
    "Quantity On Hand",
    "Weighted Avg Unit Cost",
    "Stock Value (On Hand)",
    "Purchase Total (Gross)",
    "Purchase Net Total",
    "Purchase VAT / Tax",
    "Sales Total (Gross)",
    "Sales Net Total",
    "Sales VAT / Tax",
    "Amount Collected",
    "Balance Due",
    "Realized Profit / Loss",
    "First Purchase Date",
    "Latest Sale Date"
  ];
  const stockCols = auditReportColWidths([10, 14, 28, 28, 14, 12, 12, 10, 12, 14, 12, 14, 16, 16, 16, 14, 14, 14, 14, 12, 14, 12, 16, 14, 14]);

  currencySet.forEach(currency => {
    const groups = goodsAll
      .filter(g => String(g.currency || "—") === currency)
      .slice()
      .sort((a, b) => String(a.person_name || "").localeCompare(String(b.person_name || "")) || String(a.itemCode || "").localeCompare(String(b.itemCode || "")));
    if (!groups.length) return;
    const dataRows = groups.map((group, index) => {
      const remaining = Number(group.remainingQty || 0);
      const unitCost = Number(group.unitActualPrice || 0);
      const profit = Number(group.soldQty || 0) > 0 ? auditReportRound(group.profitLoss, 2) : "";
      return [
        index + 1,
        group.itemCode || "",
        group.person_name || "",
        group.itemDescription || "",
        group.itemType || "",
        group.itemCategory || "",
        group.quantityUnit || "",
        group.currency || currency,
        inventoryAuditStatusLabel(group),
        auditReportRound(group.boughtQty),
        auditReportRound(group.soldQty),
        auditReportRound(remaining),
        auditReportRound(unitCost, 6),
        auditReportRound(remaining * unitCost, 2),
        auditReportRound(group.bought, 2),
        auditReportRound(group.purchaseNetTotal, 2),
        auditReportRound(group.purchaseTaxTotal, 2),
        auditReportRound(group.soldTotal, 2),
        auditReportRound(group.soldNetTotal, 2),
        auditReportRound(group.salesTaxTotal, 2),
        auditReportRound(group.paidTotal, 2),
        auditReportRound(group.balanceTotal, 2),
        profit,
        auditReportIsoDate(group.principal?.loan_date || group.loan_date),
        auditReportIsoDate(group.latestSoldDate)
      ];
    });
    sheets.push(buildInventoryAuditDetailSheet(
      `Stock / Inventory Register — ${currency}`,
      stockHeaders,
      dataRows,
      {
        info,
        currency,
        sheetName: `Stock_${currency}`,
        cols: stockCols,
        totals: {
          labelColIndex: 2,
          numericIndexes: [9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21],
          label: "TOTAL"
        }
      }
    ));
  });

  const purchaseHeaders = [
    "Serial No.",
    "Purchase Date",
    "Entry Reference",
    "Item Code",
    "Item Name",
    "Description",
    "Item Type",
    "Category",
    "Unit of Measure",
    "Quantity Purchased",
    "Unit Cost",
    "Line Gross Amount",
    "VAT / Tax Rate (%)",
    "VAT / Tax Amount",
    "Net Amount",
    "Currency",
    "Transaction Type",
    "Linked Wallet",
    "Notes / Remarks"
  ];
  const purchaseCols = auditReportColWidths([10, 14, 16, 14, 28, 24, 14, 12, 12, 14, 12, 14, 14, 14, 12, 10, 22, 16, 28]);

  currencySet.forEach(currency => {
    const lines = purchaseLines.filter(l => l.currency === currency);
    if (!lines.length) return;
    const dataRows = lines.map((line, index) => [
      index + 1,
      line.date,
      shortId(line.entryId) || "",
      line.itemCode,
      line.itemName,
      line.itemDescription,
      line.itemType,
      line.itemCategory,
      line.quantityUnit,
      auditReportRound(line.qty),
      auditReportRound(line.unitCost, 6),
      auditReportRound(line.lineTotal, 2),
      auditReportRound(line.taxRate, 2),
      auditReportRound(line.taxAmount, 2),
      auditReportRound(line.netAmount, 2),
      line.currency,
      line.entryKind,
      line.wallet || "",
      line.notes
    ]);
    sheets.push(buildInventoryAuditDetailSheet(
      `Purchased Items — ${currency}`,
      purchaseHeaders,
      dataRows,
      {
        info,
        currency,
        sheetName: `Purchases_${currency}`,
        cols: purchaseCols,
        totals: {
          labelColIndex: 4,
          numericIndexes: [9, 11, 13, 14],
          label: "TOTAL"
        }
      }
    ));
  });

  const salesHeaders = [
    "Serial No.",
    "Sale Date",
    "Invoice / Receipt No.",
    "Payment Receipt No.",
    "Customer Name",
    "Customer Company",
    "Customer TRN",
    "Customer Phone",
    "Customer Email",
    "Customer Address",
    "Item Code",
    "Item Name",
    "Item Type",
    "Category",
    "Unit of Measure",
    "Quantity Sold",
    "Unit Selling Price",
    "Line Gross Amount",
    "VAT / Tax Rate (%)",
    "VAT / Tax Amount",
    "Net Amount",
    "Amount Paid",
    "Balance Due",
    "Payment Status",
    "Currency",
    "Estimated Profit / Loss",
    "Linked Wallet",
    "Notes / Remarks"
  ];
  const salesCols = auditReportColWidths([10, 12, 18, 16, 22, 18, 14, 14, 20, 24, 12, 22, 12, 12, 10, 12, 14, 14, 12, 12, 12, 12, 12, 12, 10, 14, 14, 24]);

  currencySet.forEach(currency => {
    const lines = salesLines.filter(l => l.currency === currency);
    if (!lines.length) return;
    const dataRows = lines.map((line, index) => [
      index + 1,
      line.date,
      line.invoiceNumber,
      line.paymentReceiptNumber,
      line.customerName,
      line.customerCompany,
      line.customerTrn,
      line.customerPhone,
      line.customerEmail,
      line.customerAddress,
      line.itemCode,
      line.itemName,
      line.itemType,
      line.itemCategory,
      line.quantityUnit,
      auditReportRound(line.qty),
      auditReportRound(line.unitPrice, 6),
      auditReportRound(line.lineTotal, 2),
      auditReportRound(line.taxRate, 2),
      auditReportRound(line.taxAmount, 2),
      auditReportRound(line.netAmount, 2),
      auditReportRound(line.paid, 2),
      auditReportRound(line.balance, 2),
      line.paymentStatus,
      line.currency,
      line.estProfit === "" ? "" : auditReportRound(line.estProfit, 2),
      line.wallet || "",
      line.notes
    ]);
    sheets.push(buildInventoryAuditDetailSheet(
      `Sold Items — ${currency}`,
      salesHeaders,
      dataRows,
      {
        info,
        currency,
        sheetName: `Sales_${currency}`,
        cols: salesCols,
        totals: {
          labelColIndex: 4,
          numericIndexes: [15, 17, 19, 20, 21, 22, 25],
          label: "TOTAL"
        }
      }
    ));
  });

  const outstandingHeaders = [
    "Serial No.",
    "Invoice / Receipt No.",
    "Customer Name",
    "Invoice Date",
    "Oldest Line Date",
    "Line Count",
    "Items Summary",
    "Currency",
    "Invoice Total",
    "Amount Paid",
    "Balance Due",
    "Tax Summary"
  ];
  const outstandingByCurrency = new Map();
  outstanding.forEach(invoice => {
    const currency = String(invoice.currency || "—");
    if (!outstandingByCurrency.has(currency)) outstandingByCurrency.set(currency, []);
    outstandingByCurrency.get(currency).push(invoice);
  });
  const outstandingCurrencies = outstanding.length
    ? sortCurrenciesList([...outstandingByCurrency.keys()])
    : [];

  if (!outstandingCurrencies.length) {
    sheets.push(buildInventoryAuditDetailSheet(
      "Outstanding Receivables",
      outstandingHeaders,
      [],
      {
        info,
        sheetName: "Outstanding",
        cols: auditReportColWidths([10, 18, 24, 14, 14, 10, 36, 10, 14, 12, 12, 28]),
        emptyRow: ["—", "No outstanding inventory invoices", "", "", "", "", "", "", "", "", "", ""]
      }
    ));
  } else {
    outstandingCurrencies.forEach(currency => {
      const invoices = outstandingByCurrency.get(currency) || [];
      const dataRows = invoices.map((invoice, index) => {
        const balance = invoice.balanceByCurrency?.has?.(currency)
          ? Number(invoice.balanceByCurrency.get(currency) || 0)
          : Number(invoice.balanceTotal || 0);
        const total = invoice.totalsByCurrency?.get?.(currency)?.total != null
          ? Number(invoice.totalsByCurrency.get(currency).total || 0)
          : Number(invoice.totalAmount || 0);
        const paid = invoice.totalsByCurrency?.get?.(currency)?.paid != null
          ? Number(invoice.totalsByCurrency.get(currency).paid || 0)
          : Number(invoice.paidTotal || 0);
        return [
          index + 1,
          invoice.invoiceNumber || invoice.receiptNumber || "",
          invoice.customerName || "",
          auditReportIsoDate(invoice.date),
          auditReportIsoDate(invoice.oldestDate),
          invoice.lineCount || 0,
          invoice.itemSummary || "",
          currency,
          auditReportRound(total, 2),
          auditReportRound(paid, 2),
          auditReportRound(balance, 2),
          invoice.taxText || ""
        ];
      });
      sheets.push(buildInventoryAuditDetailSheet(
        `Outstanding Receivables — ${currency}`,
        outstandingHeaders,
        dataRows,
        {
          info,
          currency,
          sheetName: outstandingCurrencies.length === 1 ? "Outstanding" : `Outstanding_${currency}`,
          cols: auditReportColWidths([10, 18, 24, 14, 14, 10, 36, 10, 14, 12, 12, 28]),
          totals: {
            labelColIndex: 2,
            numericIndexes: [8, 9, 10],
            label: "TOTAL"
          }
        }
      ));
    });
  }

  // Per-currency profit & loss / movement sheets (skip when already covered by empty inventory)
  currencySet.forEach(currency => {
    if (currency === "—") return;
    const groups = goodsAll.filter(g => String(g.currency || "") === currency);
    const purchases = purchaseLines.filter(l => l.currency === currency);
    const sales = salesLines.filter(l => l.currency === currency);
    if (!groups.length && !purchases.length && !sales.length) return;

    const purchaseTotal = purchases.reduce((sum, l) => sum + Number(l.lineTotal || 0), 0);
    const purchaseNet = purchases.reduce((sum, l) => sum + Number(l.netAmount || 0), 0);
    const purchaseTax = purchases.reduce((sum, l) => sum + Number(l.taxAmount || 0), 0);
    const salesTotal = sales.reduce((sum, l) => sum + Number(l.lineTotal || 0), 0);
    const salesNet = sales.reduce((sum, l) => sum + Number(l.netAmount || 0), 0);
    const salesTax = sales.reduce((sum, l) => sum + Number(l.taxAmount || 0), 0);
    const paidTotal = sales.reduce((sum, l) => sum + Number(l.paid || 0), 0);
    const balanceDue = sales.reduce((sum, l) => sum + Number(l.balance || 0), 0);
    const stockValue = groups.reduce((sum, g) => sum + (Number(g.unitActualPrice || 0) * Number(g.remainingQty || 0)), 0);
    const realizedPl = groups.reduce((sum, g) => sum + Number(g.profitLoss || 0), 0);
    const costOfSales = groups.reduce((sum, g) => sum + Number(g.soldCostBasis || 0), 0);

    const titleRows = auditReportTitleBlock(`Profit & Loss / Movement — ${currency}`, { info, currency });
    const headerRowIndex = titleRows.length;
    const rows = [
      ...titleRows,
      ["Particulars", "Amount", "Notes"],
      ["Purchases (gross)", auditReportRound(purchaseTotal, 2), "All purchase / restock lines"],
      ["Less: Purchase VAT / tax", auditReportRound(purchaseTax, 2), ""],
      ["Purchases (net of tax)", auditReportRound(purchaseNet, 2), ""],
      ["Sales (gross)", auditReportRound(salesTotal, 2), "All sales invoice lines"],
      ["Less: Sales VAT / tax", auditReportRound(salesTax, 2), ""],
      ["Sales (net of tax)", auditReportRound(salesNet, 2), ""],
      ["Cost of goods sold (estimated)", auditReportRound(costOfSales, 2), "Weighted average unit cost × qty sold"],
      ["Gross profit / (loss) realized", auditReportRound(realizedPl, 2), "Sales net − cost of goods sold"],
      [],
      ["Collections and receivables", "", ""],
      ["Amount collected", auditReportRound(paidTotal, 2), "Includes settlements applied to sales"],
      ["Balance due from customers", auditReportRound(balanceDue, 2), "Open receivable on sales lines"],
      ["Closing stock value (on hand)", auditReportRound(stockValue, 2), "Qty on hand × weighted avg unit cost"],
      [],
      ["Counts", "", ""],
      ["SKUs in register", groups.length, ""],
      ["Purchase line count", purchases.length, ""],
      ["Sales line count", sales.length, ""]
    ];
    sheets.push({
      name: auditReportSheetName(`PL_${currency}`),
      rows,
      freezeRow: headerRowIndex + 1,
      cols: auditReportColWidths([36, 16, 48])
    });
  });

  return sheets;
}

function escapeXmlText(value){
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function triggerBinaryDownload(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadInventoryAuditReportWithSheetJs(sheets, filename){
  const XLSXref = window.XLSX;
  if (!XLSXref?.utils?.aoa_to_sheet || !XLSXref?.utils?.book_new) {
    throw new Error("SheetJS unavailable");
  }
  const workbook = XLSXref.utils.book_new();
  sheets.forEach(sheet => {
    const ws = XLSXref.utils.aoa_to_sheet(sheet.rows || []);
    if (sheet.cols?.length) ws["!cols"] = sheet.cols;
    const freezeRow = Number(sheet.freezeRow || 0);
    if (freezeRow > 0) {
      ws["!freeze"] = { xSplit: 0, ySplit: freezeRow, topLeftCell: `A${freezeRow + 1}`, activePane: "bottomLeft", state: "frozen" };
      ws["!views"] = [{ state: "frozen", xSplit: 0, ySplit: freezeRow, topLeftCell: `A${freezeRow + 1}`, activePane: "bottomLeft" }];
    }
    XLSXref.utils.book_append_sheet(workbook, ws, auditReportSheetName(sheet.name));
  });
  const arrayBuffer = XLSXref.write(workbook, { bookType: "xlsx", type: "array" });
  triggerBinaryDownload(
    new Blob([arrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    filename
  );
}

function downloadInventoryAuditReportSpreadsheetMl(sheets, filename){
  const worksheets = sheets.map(sheet => {
    const rowsXml = (sheet.rows || []).map(row => {
      const cells = row.map(cell => {
        if (typeof cell === "number" && Number.isFinite(cell)) {
          return `<Cell><Data ss:Type="Number">${cell}</Data></Cell>`;
        }
        return `<Cell><Data ss:Type="String">${escapeXmlText(cell)}</Data></Cell>`;
      }).join("");
      return `<Row>${cells}</Row>`;
    }).join("");
    return `<Worksheet ss:Name="${escapeXmlText(auditReportSheetName(sheet.name))}"><Table>${rowsXml}</Table></Worksheet>`;
  }).join("");
  const xml = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
${worksheets}
</Workbook>`;
  const fallbackName = String(filename || "").replace(/\.xlsx$/i, ".xls");
  triggerBinaryDownload(new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8;" }), fallbackName);
}

async function downloadInventoryAuditReportExcel(){
  if (isGuestMode()) {
    alert("Demo Login cannot download reports. Please use a real login.");
    return;
  }
  await ensureAllLedgerDataLoaded({ throwOnError: true });
  if (databaseSessionCanLoad()) {
    await loadLedgerScopeFromSupabase(LEDGER_SCOPE_GOODS, { force: false }).catch(() => {});
  }
  const sheets = buildInventoryAuditReportSheets();
  const filename = `TripleM_Inventory_Audit_Report_${todayISO()}.xlsx`;
  try {
    downloadInventoryAuditReportWithSheetJs(sheets, filename);
  } catch (err) {
    console.warn("SheetJS Excel export unavailable, using SpreadsheetML fallback.", err);
    downloadInventoryAuditReportSpreadsheetMl(sheets, filename);
  }
}

async function downloadSectionCsv(sectionKey){
  if (isGuestMode()) {
    alert("Demo Login cannot download CSV. Please use a real login.");
    return;
  }
  const scope = normalizeSectionCsvKey(sectionKey);
  if (scope === "notes") {
    await loadNotesFromDatabase({ force: false }).catch(() => {});
  } else if (scope === "bitcoin") {
    await loadBitcoinWalletsFromDatabase({ force: false }).catch(() => {});
  } else if (LEDGER_DATA_SCOPES.includes(scope)) {
    await ensureAllLedgerDataLoaded({ throwOnError: true });
    if (databaseSessionCanLoad()) {
      await loadLedgerScopeFromSupabase(scope, { force: false }).catch(() => {});
    }
  } else {
    throw new Error("Unknown section for CSV download.");
  }
  const rows = entriesForSectionCsv(scope);
  const label = scope === LEDGER_SCOPE_GOODS ? "inventory"
    : scope === LEDGER_SCOPE_LOANS_GIVEN ? "loans_given"
    : scope === LEDGER_SCOPE_LOANS_TAKEN ? "loans_taken"
    : scope;
  triggerCsvDownload(toCsv(rows), `TripleM_${label}_${todayISO()}.csv`);
}

async function upsertSectionCsvEntry(entry){
  const row = withLocalEntryIdentity(entry);
  if (isBackupMode()) {
    const idx = state.entries.findIndex(e => e.id === row.id);
    if (idx >= 0) state.entries[idx] = { ...state.entries[idx], ...row };
    else state.entries.unshift(row);
    return { action: idx >= 0 ? "update" : "insert", row };
  }

  if (window.DomainLedger?.upsertDomainEntry) {
    try {
      const result = await DomainLedger.upsertDomainEntry(row);
      if (result.usedLedger) {
        const existing = state.dbEntryIds.has(row.id);
        if (existing) {
          await supabase(`${CONFIG.table}?id=eq.${encodeURIComponent(row.id)}`, {
            method: "PATCH",
            body: JSON.stringify(databaseInsertPayload(row))
          });
        } else {
          await supabase(CONFIG.table, {
            method: "POST",
            body: JSON.stringify(databaseInsertPayload(row))
          });
        }
        row.data_origin = "ledger";
        row.is_legacy_meta = true;
      } else {
        row.domain_table = result.table;
        row.data_origin = "domain";
        row.is_legacy_meta = false;
      }
    } catch (err) {
      const msg = String(err?.message || err || "");
      if (/does not exist|42P01|404|Not Found|Could not find the table/i.test(msg)) {
        const existing = state.dbEntryIds.has(row.id);
        if (existing) {
          await supabase(`${CONFIG.table}?id=eq.${encodeURIComponent(row.id)}`, {
            method: "PATCH",
            body: JSON.stringify(databaseInsertPayload(row))
          });
        } else {
          await supabase(CONFIG.table, {
            method: "POST",
            body: JSON.stringify(databaseInsertPayload(row))
          });
        }
        row.data_origin = "ledger";
        row.is_legacy_meta = true;
      } else {
        throw err;
      }
    }
  } else {
    queueDatabaseInsert([row], "CSV import");
  }

  const idx = state.entries.findIndex(e => e.id === row.id);
  if (idx >= 0) state.entries[idx] = { ...state.entries[idx], ...row };
  else state.entries.unshift(row);
  markDbSnapshotRows([row]);
  return { action: "upsert", row };
}

async function importNotesSectionCsv(entries){
  let imported = 0;
  for (const entry of entries) {
    let content = "";
    let title = "";
    try {
      const parsed = JSON.parse(String(entry.notes || "{}"));
      content = parsed.content || "";
      title = parsed.title || "";
    } catch {
      content = String(entry.notes || "").trim();
    }
    if (!content) continue;
    title = String(title || entry.title || "").trim().replace(/\s+/g, " ").slice(0, 120)
      || (typeof deriveNoteTitle === "function" ? deriveNoteTitle(content) : content.slice(0, 120));
    const id = entry.id || crypto.randomUUID();
    const payload = {
      id,
      owner_id: currentOwnerId(),
      content,
      notes: JSON.stringify({ title, content, rowType: "NOTE" }),
      meta: { rowType: "NOTE", title },
      is_deleted: false,
      created_at: entry.created_at || new Date().toISOString()
    };
    try {
      const existing = await supabase(`app_notes?id=eq.${encodeURIComponent(id)}&select=id`);
      if (Array.isArray(existing) && existing.length) {
        await supabase(`app_notes?id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({ content, notes: payload.notes, meta: payload.meta, updated_at: new Date().toISOString() })
        });
      } else {
        await supabase("app_notes", { method: "POST", body: JSON.stringify(payload) });
      }
      imported += 1;
    } catch (domainErr) {
      const ledgerRow = {
        id,
        group_id: id,
        person_name: "SYSTEM",
        direction: "taken",
        entry_kind: "principal",
        currency: "AED",
        principal_amount: 0,
        loan_date: todayISO(),
        action_date: todayISO(),
        notes: payload.notes,
        created_at: payload.created_at,
        owner_id: payload.owner_id
      };
      await upsertSectionCsvEntry(ledgerRow);
      imported += 1;
      console.warn("app_notes CSV upsert fell back to ledger:", domainErr);
    }
  }
  await loadNotesFromDatabase({ force: true }).catch(() => {});
  renderNotes(els.searchNotes?.value || "");
  return imported;
}

async function importBitcoinSectionCsv(entries){
  let imported = 0;
  for (const entry of entries) {
    let wallet = {};
    try {
      wallet = JSON.parse(String(entry.notes || "{}"));
    } catch {
      wallet = {};
    }
    const address = wallet.address || "";
    const label = wallet.label || entry.person_name || "Wallet";
    const network = wallet.network || "bitcoin";
    if (!address) continue;
    const id = entry.id || crypto.randomUUID();
    const payload = {
      id,
      owner_id: currentOwnerId(),
      label,
      address,
      network,
      is_watch_only: !!wallet.is_watch_only,
      currency: "BTC",
      notes: JSON.stringify({
        address,
        label,
        network,
        is_watch_only: !!wallet.is_watch_only,
        rowType: "BITCOIN_WALLET"
      }),
      meta: { rowType: "BITCOIN_WALLET" },
      is_deleted: false,
      created_at: entry.created_at || new Date().toISOString()
    };
    try {
      const existing = await supabase(`bitcoin_wallets?id=eq.${encodeURIComponent(id)}&select=id`);
      if (Array.isArray(existing) && existing.length) {
        await supabase(`bitcoin_wallets?id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({
            label,
            address,
            network,
            is_watch_only: !!wallet.is_watch_only,
            notes: payload.notes,
            updated_at: new Date().toISOString()
          })
        });
      } else {
        await supabase("bitcoin_wallets", { method: "POST", body: JSON.stringify(payload) });
      }
      imported += 1;
    } catch (domainErr) {
      await upsertSectionCsvEntry({
        id,
        group_id: id,
        person_name: "SYSTEM",
        direction: "taken",
        entry_kind: "principal",
        currency: "BTC",
        principal_amount: 0,
        loan_date: todayISO(),
        notes: payload.notes,
        created_at: payload.created_at,
        owner_id: payload.owner_id
      });
      imported += 1;
      console.warn("bitcoin_wallets CSV upsert fell back to ledger:", domainErr);
    }
  }
  await loadBitcoinWalletsFromDatabase({ force: true }).catch(() => {});
  renderBitcoinWallets();
  renderExistingAddressesDropdown();
  return imported;
}

async function importSectionCsv(file, sectionKey){
  if (isGuestMode()) {
    alert("Demo Login cannot import CSV. Please use a real login.");
    return;
  }
  if (!file) return;
  const scope = normalizeSectionCsvKey(sectionKey);
  const text = await file.text();
  let parsed = parseEntriesCsv(text);

  if (scope === "notes") {
    const count = await importNotesSectionCsv(assignMissingIdsAndGroupIds(parsed, { existingEntries: [] }));
    alert(`Imported ${count} note(s) into Notes.`);
    return;
  }
  if (scope === "bitcoin") {
    const count = await importBitcoinSectionCsv(assignMissingIdsAndGroupIds(parsed, { existingEntries: [] }));
    alert(`Imported ${count} wallet(s) into Bitcoin.`);
    return;
  }
  if (!LEDGER_DATA_SCOPES.includes(scope)) {
    throw new Error("Unknown section for CSV upload.");
  }

  if (databaseSessionCanLoad()) {
    await loadLedgerScopeFromSupabase(scope, { force: true }).catch(() => {});
  }

  // Critical safety rule: validate Installment source identity BEFORE adding section tags.
  // Previously every uploaded row was first forced to direction=taken + [INSTALLMENT], which
  // could silently convert unrelated loan rows into installment plans.
  if (scope === LEDGER_SCOPE_INSTALLMENTS) {
    const sourceRows = parsed.filter(installmentCsvRowHasSourceIdentity);
    const rejected = parsed.length - sourceRows.length;
    if (rejected > 0) {
      console.warn(`Installment CSV import rejected ${rejected} row(s) without installment source identity.`);
    }
    parsed = sourceRows;
    if (!parsed.length) {
      throw new Error("No genuine installment rows were found in this CSV. Loan or unrelated rows were not imported.");
    }
  }

  parsed = assignMissingIdsAndGroupIds(parsed, { existingEntries: state.entries });
  let prepared = parsed
    .map(entry => ensureEntryTagsForSection(entry, scope))
    .filter(entry => entryBelongsToLedgerScope(entry, scope));

  if (scope === LEDGER_SCOPE_INSTALLMENTS) {
    const beforeIntegrityCheck = prepared.length;
    prepared = filterInstallmentCsvRowsByGroupIntegrity(prepared);
    const rejectedOrphans = beforeIntegrityCheck - prepared.length;
    if (rejectedOrphans > 0) {
      console.warn(`Installment CSV import rejected ${rejectedOrphans} orphan payment row(s) without a matching plan.`);
    }
  }

  if (!prepared.length) {
    throw new Error("No valid rows matched this section after validation. Check the CSV and try again.");
  }

  // Principals first so FK group_id targets exist in domain tables
  const ordered = [
    ...prepared.filter(e => e.entry_kind === "principal"),
    ...prepared.filter(e => e.entry_kind !== "principal")
  ];

  let imported = 0;
  const errors = [];
  for (const entry of ordered) {
    try {
      await upsertSectionCsvEntry(entry);
      imported += 1;
    } catch (err) {
      errors.push(`${entry.person_name || entry.id}: ${err.message || err}`);
    }
  }

  if (isBackupMode()) {
    refreshBackupView();
  } else if (databaseSessionCanLoad()) {
    state.loadedLedgerScopes.delete(scope);
    await loadLedgerScopeFromSupabase(scope, { force: true }).catch(() => {});
    renderAll();
  } else {
    renderAll();
  }

  if (errors.length) {
    alert(`Imported ${imported} row(s). ${errors.length} failed:\n${errors.slice(0, 5).join("\n")}`);
  } else {
    alert(`Imported ${imported} row(s) into this section.`);
  }
}

function openSectionCsvUpload(sectionKey){
  const input = document.getElementById("sectionCsvInput");
  if (!input) {
    alert("CSV upload input is missing.");
    return;
  }
  input.dataset.section = normalizeSectionCsvKey(sectionKey);
  input.value = "";
  input.click();
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
  const principalRaw = entry.principal_amount == null || entry.principal_amount === ""
    ? null
    : finiteMoney(entry.principal_amount, NaN);
  const actionRaw = entry.action_amount == null || entry.action_amount === ""
    ? null
    : finiteMoney(entry.action_amount, NaN);
  const row = {
    group_id: String(entry.group_id || "").trim(),
    direction: String(entry.direction || "").trim(),
    entry_kind: String(entry.entry_kind || "").trim(),
    person_name: String(entry.person_name || "").trim(),
    currency: String(entry.currency || "").trim(),
    principal_amount: Number.isFinite(principalRaw) ? principalRaw : null,
    action_amount: Number.isFinite(actionRaw) ? actionRaw : null,
    loan_date: normalizedLoanDate,
    action_date: normalizedActionDate,
    notes: entry.notes == null || String(entry.notes).trim() === "" ? null : String(entry.notes)
  };
  const ownerId = currentOwnerId();
  if (ownerId) row.owner_id = ownerId;
  return row;
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
    if (entry.id && typeof hasPendingOfflineEntity === "function" && hasPendingOfflineEntity(entry.id)) return true;
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
  const rows = await supabase(`${CONFIG.table}?select=*${ownerIdQuery()}`);
  updateDbSnapshot(filterRowsForCurrentUser(rows));
}

async function uploadBackupToDatabase(){
  if (!state.hasImportedFile || state.dataSource !== "backup"){
    alert("Please import a JSON or CSV file first.");
    return;
  }
  if (!runtimeConfig?.supabaseUrl || !runtimeConfig?.supabaseKey){
    alert("Please sign in with your username and password to connect to the database.");
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

  if (!confirm(`Upload imported backup to database? This will DELETE your existing records and replace with ${cleanedRows.length} row(s).`)) return;

  const uid = currentOwnerId();
  if (!uid) throw new Error("Authentication required before uploading.");
  // Only wipe the current user's rows — never other accounts
  await supabase(`${CONFIG.table}?owner_id=eq.${encodeURIComponent(uid)}`, { method: "DELETE" });
  try {
    await supabase(CONFIG.table, { method: "POST", body: JSON.stringify(cleanedRows) });
  } catch (err) {
    const detail = err?.message || String(err);
    // Local imported rows remain on screen; retry Upload after connection recovers.
    throw new Error(
      `Database was cleared for your account, but re-upload failed (${detail}). ` +
      `Your imported data is still on this screen — fix the connection and click Upload again.`
    );
  }
  await refreshDbSnapshot();
  // Switch out of backup-import mode so subsequent loads use the live DB
  state.dataSource = "supabase";
  state.hasImportedFile = false;
  sessionStorage.removeItem(IMPORT_SESSION_KEY);
  updateUploadButtonVisibility();
  updateConnectButtonVisibility();
  renderAll();

  alert("Database updated successfully from imported backup.");
}

async function savePersonRecordsToDatabase(personNameEncoded, direction){
  const personName = decodeURIComponent(personNameEncoded || "").trim();
  if (!personName || !direction) return;
  if (!runtimeConfig?.supabaseUrl || !runtimeConfig?.supabaseKey){
    alert("Please sign in with your username and password to connect to the database.");
    els.lockScreen.classList.remove("hide");
    focusUnlockForm();
    return;
  }

  const queuedIds = state.entries
    .filter(entry => entry.direction === direction
      && String(entry.person_name || "").trim() === personName
      && entry.id
      && typeof hasPendingOfflineEntity === "function"
      && hasPendingOfflineEntity(entry.id))
    .map(entry => entry.id);
  if (queuedIds.length && typeof syncOfflineQueue === "function") {
    await syncOfflineQueue({ force: true, entityIds: queuedIds, userInitiated: true });
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
