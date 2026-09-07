/* Modularized from script.js lines 24017-24603 — CSV/PDF export helpers for expenses history. Load order must be preserved. */
function getExpenseHistoryItemsForExport(){
  // Match Transactions History list: lazy/search use loaded activity (filter dates / full
  // history); only the non-lazy non-search path applies the history-banner window.
  const spendAttached = collectExpenseSpendRows(getExpenseAccounts());
  const searching = String(state.search.expenses || "").trim() !== "";
  const historySpendAttached = (typeof isExpenseLazyMode === "function" && isExpenseLazyMode()) || searching
    ? spendAttached
    : filterExpenseHistoryRows(spendAttached);
  let items = groupExpenseItems(historySpendAttached);
  if (searching){
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

function expenseItemTxPeriodLabel(txs = []){
  const stamps = txs
    .map(tx => ({ stamp: dateStamp(tx.date), raw: tx.date }))
    .filter(x => x.stamp);
  if (!stamps.length) return "—";
  stamps.sort((a, b) => a.stamp - b.stamp);
  const from = displayDate(stamps[0].raw);
  const to = displayDate(stamps[stamps.length - 1].raw);
  return from === to ? from : `${from} - ${to}`;
}

function closeExpenseHistoryPdfMenus(){
  document.querySelectorAll(".expense-history-pdf-menu").forEach(menu => menu.classList.add("hide"));
  document.querySelectorAll(".expense-history-download[aria-expanded='true']").forEach(btn => {
    btn.setAttribute("aria-expanded", "false");
  });
}

async function downloadExpenseTransactionsHistoryPDF(mode = "detailed"){
  if (!window.jspdf){
    alert("PDF library loading. Please try again in a moment.");
    return;
  }

  const reportMode = String(mode || "detailed").toLowerCase() === "summary" ? "summary" : "detailed";
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
  const title = reportMode === "summary"
    ? "Expense Transactions Summary"
    : "Expense Transactions History";
  const subtitle = `${rangeLabel} | Generated: ${new Date().toLocaleString()}`;
  drawPdfHeader(doc, logoData, title, subtitle);
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

  const summaryTop = drawCompactPdfPartiesAndMeta(doc, {
    rightLabel: "REPORT",
    partyName: reportMode === "summary" ? "Expense Summary" : "Expense History",
    meta: [
      { label: "Range", value: rangeLabel },
      { label: "Txns", value: String(rows.length) },
      { label: "Items", value: String(items.length) },
      { label: "Wallets", value: String(walletCount) }
    ]
  });

  const totalsBody = sortCurrenciesList([...currencyTotals.keys()]).map(cur => [
    pdfCurrencyLabel(cur),
    String(currencyCounts.get(cur) || 0),
    formatPdfAmount(currencyTaxTotals.get(cur) || 0, cur),
    formatPdfAmount(currencyTotals.get(cur) || 0, cur)
  ]);

  doc.autoTable({
    startY: summaryTop + 5,
    head: [["Currency", "Transactions", "VAT", "Total Spent"]],
    body: totalsBody,
    theme: "grid",
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold", fontSize: 7.6 },
    styles: { font: "helvetica", fontSize: 7.8, cellPadding: 1.8 },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { cellWidth: 35, halign: "right" },
      2: { cellWidth: 35, halign: "right" },
      3: { cellWidth: 55, halign: "right" }
    },
    margin: { left: 14, right: 14, top: 42, bottom: 32 },
    didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
  });

  let y = (doc.lastAutoTable?.finalY || 106) + 12;

  if (reportMode === "summary"){
    const itemsByCurrency = new Map();
    for (const item of items){
      const cur = item.currency || "AED";
      if (!itemsByCurrency.has(cur)) itemsByCurrency.set(cur, []);
      itemsByCurrency.get(cur).push(item);
    }

    for (const cur of sortCurrenciesList([...itemsByCurrency.keys()])){
      const curItems = itemsByCurrency.get(cur) || [];
      const curTotal = curItems.reduce((sum, item) => sum + Number(item.total || 0), 0);
      const curTax = curItems.reduce((sum, item) => sum + Number(item.taxTotal || 0), 0);
      const curTxCount = curItems.reduce((sum, item) => sum + Number(item.txs?.length || 0), 0);

      y = expenseHistoryPdfNewPageIfNeeded(doc, logoData, title, subtitle, y, 42);
      doc.setFillColor(36, 87, 214);
      doc.roundedRect(14, y, pageWidth - 28, 9, 1.5, 1.5, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(`Spending by Item | ${pdfCurrencyLabel(cur)}`, 18, y + 6);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(
        `${curItems.length} item(s) | ${curTxCount} txn(s) | VAT ${formatPdfAmount(curTax, cur)} | Total ${formatPdfAmount(curTotal, cur)}`,
        pageWidth - 18,
        y + 6,
        { align: "right" }
      );

      const summaryBody = curItems.map(item => {
        const period = expenseItemTxPeriodLabel(item.txs);
        return [
          item.displayName || "—",
          item.expenseType || "Other",
          String(item.txs.length),
          period,
          formatPdfAmount(item.taxTotal || 0, item.currency),
          formatPdfAmount(item.total || 0, item.currency)
        ];
      });

      doc.autoTable({
        startY: y + 13,
        head: [["Item", "Type", "Txns", "Period (from - to)", "VAT", "Total Spent"]],
        body: summaryBody,
        theme: "grid",
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold" },
        styles: { font: "helvetica", fontSize: 8, cellPadding: 2.3, overflow: "linebreak" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 36 },
          1: { cellWidth: 26 },
          2: { cellWidth: 14, halign: "right" },
          3: { cellWidth: 46 },
          4: { cellWidth: 26, halign: "right" },
          5: { cellWidth: 32, halign: "right" }
        },
        margin: { left: 14, right: 14, top: 50, bottom: 40 },
        didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
      });
      y = (doc.lastAutoTable?.finalY || y + 13) + 12;
    }

    y = expenseHistoryPdfNewPageIfNeeded(doc, logoData, title, subtitle, y, 22);
    doc.setTextColor(71, 85, 105);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const noteLines = doc.splitTextToSize(
      `Summary only — no individual transaction lines. Each item shows total spent for ${rangeLabel}, using that item's first and last transaction dates in this selection.`,
      pageWidth - 28
    );
    doc.text(noteLines, 14, y);

    doc.save(`Expense_Transactions_Summary_${expenseHistoryRangeSlug()}_${todayISO()}.pdf`);
    return;
  }

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
      displayDate(tx.date || "—"),
      tx.wallet || "—",
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

  let tableStartY = pdfContentStartY(doc, 76, 8);
  if (currencyFilter){
    const sum = filtered.reduce((s, t) => s + Number(t.action_amount || 0), 0);
    doc.setFontSize(10);
    doc.setTextColor(23, 33, 43);
    doc.text(`Transactions: ${filtered.length}`, 120, 58);
    doc.text(`Total: ${formatPdfAmount(sum, currencyFilter)}`, 120, 64);
    tableStartY = pdfContentStartY(doc, 72, 8);
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
    tableStartY = pdfContentStartY(doc, y + 8, 8);
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
    startY: pdfContentStartY(doc, ySummary + 6, 8),
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

async function downloadExpenseTransactionPDF(txId){
  if (!window.jspdf) { alert("PDF library loading. Please try again in a moment."); return; }
  const tx = typeof getExpenseTransactionByIdForExport === "function" ? getExpenseTransactionByIdForExport(txId) : null;
  if (!tx) { alert("Transaction not found."); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  await loadCustomFontsForPdf(doc);
  const logoData = await getPdfLogo();
  const title = "Expense Transaction Receipt";
  const created = tx.createdAt ? new Date(tx.createdAt) : null;
  const recorded = created && !Number.isNaN(created.getTime()) ? created.toLocaleString() : "Legacy record — exact creation time unavailable";
  const subtitle = `${tx.itemName || "Expense"} · ${displayDate(tx.date || "—")}`;
  drawPdfHeader(doc, logoData, title, subtitle);
  const y = drawCompactPdfPartiesAndMeta(doc, {
    rightLabel: "TRANSACTION",
    partyName: tx.wallet || "Wallet",
    meta: [
      { label: "Currency", value: pdfCurrencyLabel(tx.currency || "") },
      { label: "Type", value: tx.expenseType || "Other" },
      { label: "Date", value: displayDate(tx.date || "—") },
      { label: "Recorded", value: recorded }
    ]
  });
  doc.autoTable({
    startY: y + 6,
    head: [["Item", "Account", "Notes / Description", "VAT", "Amount"]],
    body: [[
      tx.itemName || "Expense",
      tx.wallet || "—",
      cleanExpenseNote(tx.notes || "") || "—",
      tx.taxAmount ? formatPdfAmount(tx.taxAmount, tx.currency) : "—",
      formatPdfAmount(tx.amount, tx.currency)
    ]],
    theme: "grid",
    headStyles: { fillColor: [15,23,42], textColor: 255, fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 8.2, cellPadding: 2.2, overflow: "linebreak" },
    columnStyles: { 2: { cellWidth: 58 }, 3: { cellWidth: 28, halign: "right" }, 4: { cellWidth: 34, halign: "right" } },
    margin: { top: 42, bottom: 32 },
    didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
  });
  drawCompactPdfTotals(doc, doc.lastAutoTable.finalY + 6, [
    { label: "Net", value: formatPdfAmount(tx.netAmount || (Number(tx.amount||0)-Number(tx.taxAmount||0)), tx.currency) },
    { label: "VAT", value: formatPdfAmount(tx.taxAmount || 0, tx.currency) },
    { label: "Total", value: formatPdfAmount(tx.amount, tx.currency), strong: true }
  ]);
  doc.save(`Expense_Transaction_${String(tx.itemName||"Expense").replace(/[^a-z0-9_-]+/gi,"_")}_${displayDate(tx.date||"").replace(/[^0-9A-Za-z_-]+/g,"_")}.pdf`);
}
window.downloadExpenseTransactionPDF = downloadExpenseTransactionPDF;

async function downloadExpenseItemPDF(itemKey){
  if (typeof ensureExpenseItemHistoryLoaded === "function" && typeof isExpenseLazyMode === "function" && isExpenseLazyMode()) {
    try { await ensureExpenseItemHistoryLoaded(itemKey); }
    catch (error) { console.warn("Complete expense item history was unavailable for PDF export.", error); }
  }
  if (!window.jspdf){
    alert("PDF library loading. Please try again in a moment.");
    return;
  }

  const items = getExpenseHistoryItemsForExport();
  const targetItem = items.find(item => item.key === itemKey);
  if (!targetItem) {
    alert("Expense item not found for the selected history range.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // Load custom fonts for currency symbols
  await loadCustomFontsForPdf(doc);

  const logoData = await getPdfLogo();
  const title = `Expense Report - ${targetItem.displayName}`;
  const subtitle = `${expenseHistoryRangeText()} | Generated: ${new Date().toLocaleString()}`;
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

  if (!teamCapability("can_delete_entries")) {
    alert("You do not have permission to delete wallets.");
    return;
  }

  // Get all entries related to this wallet
  const walletEntries = state.entries.filter(e => e.group_id === groupId);
  
  if (!walletEntries.length) {
    alert("No records found for this wallet.");
    return;
  }

  const safeName = walletName || "this wallet";
  const ok = await requireSmartPinConfirm({
    title: "Delete wallet",
    description: `Enter your Smart Pin to permanently delete the wallet "${safeName}" and move ${walletEntries.length} linked transaction${walletEntries.length === 1 ? "" : "s"} to the recycle bin.`,
    confirmLabel: "Delete Wallet",
    accent: "danger"
  });
  if (!ok) return;

  walletEntries.forEach(e => addToRecycleBin(e));
  unmarkDbSnapshotRows(walletEntries);
  state.entries = state.entries.filter(e => e.group_id !== groupId);

  if (isBackupMode()) {
    refreshBackupView();
  } else {
    // Soft-delete domain rows (whole group) + legacy ledger — dual-read cannot resurrect
    persistDeleteGroup(groupId, { entries: walletEntries, label: "Wallet delete" })
      .catch(error => {
        console.error("Wallet delete database sync failed.", error);
        if (typeof showEntryConfirmation === "function") showEntryConfirmation(`Wallet delete failed to sync: ${error?.message || error}`, "error");
        alert("Wallet was moved to recycle bin on this screen, but database sync failed. Please refresh after the connection improves.");
      });
  }
  logCompanyActivity("wallet_deleted", "expenses", `Deleted wallet "${safeName}" (${walletEntries.length} transaction${walletEntries.length === 1 ? "" : "s"})`, {
    entityType: "wallet",
    entityId: groupId
  });
  renderAll();
  renderRecycleBinDropdown();
  if (typeof showEntryConfirmation === "function") {
    showEntryConfirmation(`Wallet “${safeName}” moved to recycle bin.`, "success");
  }
}
