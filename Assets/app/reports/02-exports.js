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
        details: typeof normalizeExpenseDetails === "function" ? normalizeExpenseDetails(tx.details || {}) : (tx.details || {}),
        notes: cleanExpenseNote(tx.notes)
      });
    }
  }
  return rows.sort((a, b) => dateStamp(b.date) - dateStamp(a.date));
}

function expenseHistoryRangeSlug(){
  return String(state.expenseHistoryRange || "month").replace(/[^a-z0-9_-]/gi, "_");
}

const expensePdfWalletLogoCache = new Map();

async function expensePdfNormalizeTransparentLogo(dataUrl){
  if (!dataUrl) return null;
  if (typeof document === "undefined" || typeof Image === "undefined") return dataUrl;
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const width = Math.max(1, Number(img.naturalWidth || img.width || 1));
        const height = Math.max(1, Number(img.naturalHeight || img.height || 1));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { alpha: true });
        if (!ctx) { resolve(dataUrl); return; }
        // Re-encode palette PNGs / WebP logos as true RGBA PNGs. The canvas stays
        // fully transparent, so jsPDF receives a real alpha channel instead of
        // interpreting palette transparency as a black matte.
        ctx.clearRect(0, 0, width, height);
        ctx.globalCompositeOperation = "copy";
        ctx.drawImage(img, 0, 0, width, height);
        ctx.globalCompositeOperation = "source-over";
        resolve(canvas.toDataURL("image/png"));
      } catch (error) {
        console.warn("Wallet logo transparency normalization failed.", error);
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function expensePdfLoadWalletLogo(source){
  let data = await getBase64ImageFromUrl(source);
  if (!data && source !== DEFAULT_WALLET_LOGO_PATH) data = await getBase64ImageFromUrl(DEFAULT_WALLET_LOGO_PATH);
  return data ? await expensePdfNormalizeTransparentLogo(data) : null;
}

async function expensePdfWalletLogo(walletName){
  const key = String(walletName || "Wallet").trim().toLowerCase() || "wallet";
  if (expensePdfWalletLogoCache.has(key)) return expensePdfWalletLogoCache.get(key);
  const custom = typeof customLogoForWalletName === "function" ? customLogoForWalletName(walletName) : "";
  const source = typeof resolveWalletLogoSrc === "function" ? resolveWalletLogoSrc(walletName, custom) : DEFAULT_WALLET_LOGO_PATH;
  const data = await expensePdfLoadWalletLogo(source);
  expensePdfWalletLogoCache.set(key, data || null);
  return data || null;
}

async function expensePdfWalletLogos(names = []){
  const unique = [...new Set(names.map(v => String(v || "Wallet").trim()).filter(Boolean))];
  await Promise.all(unique.map(name => expensePdfWalletLogo(name)));
  return new Map(unique.map(name => [name, expensePdfWalletLogoCache.get(name.toLowerCase()) || null]));
}

async function expensePdfWalletLogoForAccount(account){
  const walletName = String(account?.person_name || "Wallet").trim() || "Wallet";
  const exactCustom = String(account?.customLogoUrl || "").trim();
  const fallbackCustom = typeof customLogoForWalletName === "function" ? customLogoForWalletName(walletName) : "";
  const source = typeof resolveWalletLogoSrc === "function"
    ? resolveWalletLogoSrc(walletName, exactCustom || fallbackCustom)
    : (exactCustom || DEFAULT_WALLET_LOGO_PATH);
  const data = await expensePdfLoadWalletLogo(source);
  return data || null;
}

function expensePdfSelectedWalletContext(){
  const groupId = String(state?.expenseWalletFilter || "all");
  if (!groupId || groupId === "all") return { account: null, label: "All wallets", slug: "" };
  const account = typeof getExpenseAccounts === "function"
    ? getExpenseAccounts({ applyUiFilters: false }).find(row => String(row.group_id) === groupId)
    : null;
  if (!account) return { account: null, label: "All wallets", slug: "" };
  const name = String(account.person_name || "Wallet").trim() || "Wallet";
  const currency = String(account.currency || "").trim();
  return {
    account,
    label: currency ? `Wallet: ${name} (${pdfCurrencyLabel(currency)})` : `Wallet: ${name}`,
    slug: `_${name.replace(/[^a-z0-9_-]+/gi, "_")}`
  };
}

function expensePdfDrawWalletAccountVerification(doc, fields = [], y = 0){
  const clean = (fields || []).filter(field => field && field.value != null && String(field.value).trim() !== "");
  if (!clean.length) return y;
  const pageWidth = doc.internal.pageSize.getWidth();
  const x = 14;
  const width = pageWidth - 28;
  const gap = 4;
  const columns = Math.min(2, clean.length);
  const colWidth = (width - gap * (columns - 1)) / columns;
  const rowHeight = 13.5;
  const rows = Math.ceil(clean.length / columns);
  const headingHeight = 7;
  const blockHeight = headingHeight + rows * rowHeight + Math.max(0, rows - 1) * 2;

  doc.setTextColor(100,116,139);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.8);
  doc.text("ACCOUNT DETAILS", x, y + 4.8);

  clean.forEach((field, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    const bx = x + col * (colWidth + gap);
    const by = y + headingHeight + row * (rowHeight + 2);
    doc.setFillColor(248,250,252);
    doc.setDrawColor(226,232,240);
    doc.roundedRect(bx, by, colWidth, rowHeight, 2.2, 2.2, "FD");
    doc.setTextColor(100,116,139);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.35);
    doc.text(String(field.label || "DETAIL").toUpperCase(), bx + 3, by + 4.1, { maxWidth: colWidth - 6 });
    doc.setTextColor(15,23,42);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.2);
    const valueLines = pdfClampLines(doc, String(field.value || "—"), colWidth - 6, 2);
    doc.text(valueLines, bx + 3, by + 9.2, { lineHeightFactor: 1.05 });
  });

  return y + blockHeight;
}

function expensePdfDrawWalletStatementHeader(doc, { logoData, wallet, accountType, currency, balance, y }){
  const pageWidth = doc.internal.pageSize.getWidth();
  const x = 14;
  const width = pageWidth - 28;
  const height = 28;
  doc.setFillColor(248,250,252);
  doc.setDrawColor(226,232,240);
  doc.roundedRect(x, y, width, height, 3, 3, "FD");
  doc.setFillColor(255,255,255);
  doc.setDrawColor(226,232,240);
  doc.roundedRect(x + 5, y + 4, 20, 20, 3.5, 3.5, "FD");
  expensePdfAddWalletLogoContained(doc, logoData, x + 5, y + 4, 20, 20, 2.2);
  doc.setTextColor(100,116,139);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.2);
  doc.text("WALLET STATEMENT", x + 30, y + 8);
  doc.setTextColor(15,23,42);
  doc.setFontSize(10.2);
  doc.text(String(wallet || "Wallet"), x + 30, y + 15, { maxWidth: 81 });
  doc.setTextColor(71,85,105);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.6);
  doc.text(`${String(accountType || "Account")} · ${pdfCurrencyLabel(currency || "")}`, x + 30, y + 21, { maxWidth: 81 });
  doc.setTextColor(100,116,139);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.2);
  doc.text("CURRENT BALANCE", x + width - 7, y + 9, { align: "right" });
  doc.setTextColor(36,87,214);
  doc.setFontSize(13.5);
  doc.text(formatPdfAmount(Number(balance || 0), currency || ""), x + width - 7, y + 19, { align: "right" });
  return y + height;
}

function expensePdfDrawSingleExpenseHero(doc, {
  logoData, item, wallet, category, amount, currency, date, y,
  kicker = "EXPENSE", amountLabel = "TOTAL PAID", flow = "out"
}){
  const pageWidth = doc.internal.pageSize.getWidth();
  const x = 14;
  const width = pageWidth - 28;
  const height = 29;
  doc.setFillColor(15,23,42);
  doc.setDrawColor(15,23,42);
  doc.roundedRect(x, y, width, height, 3.5, 3.5, "FD");
  doc.setFillColor(255,255,255);
  doc.roundedRect(x + 6, y + 6, 17, 17, 3, 3, "F");
  expensePdfAddWalletLogoContained(doc, logoData, x + 6, y + 6, 17, 17, 2.2);
  doc.setTextColor(148,163,184);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text(String(kicker || "TRANSACTION").toUpperCase(), x + 28, y + 7.5);
  doc.setTextColor(255,255,255);
  doc.setFontSize(11.6);
  doc.text(String(item || "Transaction"), x + 28, y + 14.5, { maxWidth: 84 });
  doc.setTextColor(203,213,225);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.8);
  doc.text(`${String(wallet || "Wallet")} · ${String(category || "Other")} · ${displayDate(date || "—")}`, x + 28, y + 21, { maxWidth: 94 });
  doc.setTextColor(148,163,184);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text(String(amountLabel || "AMOUNT").toUpperCase(), x + width - 7, y + 8, { align: "right" });
  doc.setTextColor(255,255,255);
  doc.setFontSize(14.8);
  doc.text(expensePdfFlowText(Number(amount || 0), currency || "", flow), x + width - 7, y + 18.5, { align: "right" });
  doc.setTextColor(148,163,184);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  doc.text(pdfCurrencyLabel(currency || ""), x + width - 7, y + 24.5, { align: "right" });
  return y + height;
}

function expensePdfDrawSingleTransferHero(doc, { fromLogo, toLogo, fromWallet, toWallet, amountOut, amountIn, curOut, curIn, y }){
  const pageWidth = doc.internal.pageSize.getWidth();
  const x = 14;
  const width = pageWidth - 28;
  const height = 29;
  const half = width / 2;
  const middle = x + half;
  doc.setFillColor(15,23,42);
  doc.setDrawColor(15,23,42);
  doc.roundedRect(x, y, width, height, 3.5, 3.5, "FD");
  doc.setDrawColor(51,65,85);
  doc.line(middle, y + 5, middle, y + height - 5);

  const drawSide = (sideX, logoData, kicker, wallet, amount, currency, flow) => {
    doc.setFillColor(255,255,255);
    doc.roundedRect(sideX + 6, y + 6, 17, 17, 3, 3, "F");
    expensePdfAddWalletLogoContained(doc, logoData, sideX + 6, y + 6, 17, 17, 2.2);
    doc.setTextColor(148,163,184);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text(kicker, sideX + 28, y + 7.5);
    doc.setTextColor(255,255,255);
    doc.setFontSize(10.2);
    doc.text(String(wallet || "Wallet"), sideX + 28, y + 14.5, { maxWidth: half - 35 });
    doc.setFontSize(12.2);
    doc.text(expensePdfFlowText(Number(amount || 0), currency || "", flow), sideX + half - 7, y + 22, { align: "right" });
  };

  drawSide(x, fromLogo, "TRANSFER OUT", fromWallet, amountOut, curOut, "out");
  drawSide(middle, toLogo, "TRANSFER IN", toWallet, amountIn, curIn, "in");
  return y + height;
}

function expensePdfDrawReceiptFieldGrid(doc, fields, { y, maxY, preferredColumns = 4 } = {}){
  const pageWidth = doc.internal.pageSize.getWidth();
  const left = 14;
  const gapX = 3.2;
  const availableHeight = Math.max(30, Number(maxY || (doc.internal.pageSize.getHeight() - 54)) - y);
  const cleanFields = (fields || []).filter(field => field && field.value != null && String(field.value).trim() !== "");
  if (!cleanFields.length) return y;

  const buildLayout = (columns, valueFont = 8.8, rowGap = 1.55, minHeight = 10.2) => {
    const colWidth = (pageWidth - 28 - gapX * (columns - 1)) / columns;
    const rows = [];
    for (let i = 0; i < cleanFields.length; i += columns){
      const cells = cleanFields.slice(i, i + columns).map(field => {
        const label = String(field?.label || "Detail").toUpperCase();
        const value = String(field?.value == null || field.value === "" ? "—" : field.value);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.55);
        const labelLines = pdfClampLines(doc, label, colWidth - 6, 2);
        doc.setFont("helvetica", field?.strong ? "bold" : "normal");
        doc.setFontSize(valueFont);
        const valueLines = pdfClampLines(doc, value, colWidth - 6, 3);
        const height = Math.max(minHeight, 4.0 + labelLines.length * 2.35 + valueLines.length * 3.15);
        return { field, labelLines, valueLines, height };
      });
      rows.push({ cells, height: Math.max(...cells.map(cell => cell.height), minHeight) });
    }
    const totalHeight = rows.reduce((sum, row) => sum + row.height, 0) + Math.max(0, rows.length - 1) * rowGap;
    return { columns, colWidth, rows, rowGap, valueFont, totalHeight };
  };

  const order = preferredColumns === 3 ? [3, 4] : [4, 3];
  const candidates = order.map(columns => buildLayout(columns, columns === 4 ? 8.55 : 8.8, 1.55, 10.2));
  let layout = candidates.find(candidate => candidate.totalHeight <= availableHeight);
  if (!layout){
    const compact = order.map(columns => buildLayout(columns, columns === 4 ? 8.3 : 8.55, 1.1, 9.6));
    layout = compact.reduce((best, candidate) => candidate.totalHeight < best.totalHeight ? candidate : best, compact[0]);
  }

  let cursorY = y;
  layout.rows.forEach(row => {
    row.cells.forEach((cell, column) => {
      const x = left + column * (layout.colWidth + gapX);
      doc.setFillColor(248,250,252);
      doc.setDrawColor(226,232,240);
      doc.roundedRect(x, cursorY, layout.colWidth, row.height, 1.8, 1.8, "FD");
      doc.setTextColor(100,116,139);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.55);
      doc.text(cell.labelLines, x + 3, cursorY + 3.8);
      doc.setTextColor(15,23,42);
      doc.setFont("helvetica", cell.field?.strong ? "bold" : "normal");
      doc.setFontSize(layout.valueFont);
      const valueY = cursorY + 4.7 + cell.labelLines.length * 2.35;
      doc.text(cell.valueLines, x + 3, valueY);
    });
    cursorY += row.height + layout.rowGap;
  });
  return cursorY;
}

function expensePdfAddWalletLogo(doc, dataUrl, x, y, size = 5.4){
  if (!dataUrl) return;
  try {
    const format = typeof pdfImageFormatFromDataUrl === "function"
      ? pdfImageFormatFromDataUrl(dataUrl)
      : (/^data:image\/(?:jpeg|jpg)/i.test(dataUrl) ? "JPEG" : "PNG");
    const compression = format === "JPEG" ? "FAST" : undefined;
    doc.addImage(dataUrl, format, x, y, size, size, undefined, compression);
  } catch (error) {
    console.warn("Wallet logo could not be embedded in PDF.", error);
  }
}

function expensePdfAddWalletLogoContained(doc, dataUrl, x, y, width, height = width, padding = 0){
  if (!dataUrl) return;
  try {
    const format = typeof pdfImageFormatFromDataUrl === "function"
      ? pdfImageFormatFromDataUrl(dataUrl)
      : (/^data:image\/(?:jpeg|jpg)/i.test(dataUrl) ? "JPEG" : "PNG");
    const props = typeof doc.getImageProperties === "function" ? doc.getImageProperties(dataUrl) : null;
    const sourceW = Number(props?.width || 1);
    const sourceH = Number(props?.height || 1);
    const innerW = Math.max(1, Number(width || 1) - (padding * 2));
    const innerH = Math.max(1, Number(height || width || 1) - (padding * 2));
    const ratio = Math.min(innerW / sourceW, innerH / sourceH);
    const drawW = Math.max(1, sourceW * ratio);
    const drawH = Math.max(1, sourceH * ratio);
    const drawX = Number(x || 0) + padding + ((innerW - drawW) / 2);
    const drawY = Number(y || 0) + padding + ((innerH - drawH) / 2);
    const compression = format === "JPEG" ? "FAST" : undefined;
    doc.addImage(dataUrl, format, drawX, drawY, drawW, drawH, undefined, compression);
  } catch (error) {
    console.warn("Wallet logo could not be fitted in PDF.", error);
    expensePdfAddWalletLogo(doc, dataUrl, x, y, Math.min(width, height));
  }
}

function expensePdfDetailRows(details, kind = "expense"){
  if (typeof expenseDetailsForDisplay === "function") return expenseDetailsForDisplay(details || {}, kind);
  return Object.entries(details || {}).filter(([, value]) => value !== "" && value != null).map(([key,value]) => ({
    label: String(key).replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase()),
    value: String(value)
  }));
}

function expensePdfDetailsText(details, kind = "expense", notes = ""){
  const parts = [];
  const cleanNotes = String(notes || "").trim();
  if (cleanNotes) parts.push(cleanNotes);
  for (const row of expensePdfDetailRows(details, kind)) parts.push(`${row.label}: ${row.value}`);
  return parts.join("\n") || "—";
}

function expensePdfWalletCellHooks(doc, logoRows, walletColumnIndex){
  return {
    didParseCell(data){
      if (data.section !== "body" || data.column.index !== walletColumnIndex) return;
      const pad = typeof data.cell.styles.cellPadding === "number" ? data.cell.styles.cellPadding : 2;
      data.cell.styles.cellPadding = { top: pad, right: pad, bottom: pad, left: 9 };
      data.cell.styles.minCellHeight = Math.max(Number(data.cell.styles.minCellHeight || 0), 8);
    },
    didDrawCell(data){
      if (data.section !== "body" || data.column.index !== walletColumnIndex) return;
      const logo = logoRows[data.row.index];
      expensePdfAddWalletLogo(doc, logo, data.cell.x + 2, data.cell.y + Math.max(1.2,(data.cell.height - 5.2)/2), 5.2);
    }
  };
}

function expensePdfDrawTransactionCard(doc, { logoData, label, wallet, amount, currency, y }){
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(248,250,252);
  doc.setDrawColor(226,232,240);
  doc.roundedRect(14, y, pageWidth - 28, 24, 3, 3, "FD");
  expensePdfAddWalletLogo(doc, logoData, 20, y + 5, 14);
  doc.setTextColor(100,116,139); doc.setFont("helvetica","bold"); doc.setFontSize(7.5);
  doc.text(String(label || "WALLET").toUpperCase(), 39, y + 8);
  doc.setTextColor(15,23,42); doc.setFontSize(10);
  doc.text(String(wallet || "Wallet"), 39, y + 14);
  doc.setTextColor(36,87,214); doc.setFontSize(15);
  doc.text(formatPdfAmount(Number(amount || 0), currency || ""), pageWidth - 20, y + 15, { align: "right" });
  return y + 24;
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
  const walletContext = expensePdfSelectedWalletContext();
  const title = reportMode === "summary"
    ? "Expense Transactions Summary"
    : "Expense Transactions History";
  const subtitle = `${rangeLabel} | ${walletContext.label} | Generated: ${new Date().toLocaleString()}`;
  drawPdfHeader(doc, logoData, title, subtitle);
  const pageWidth = doc.internal.pageSize.getWidth();
  const walletCount = new Set(rows.map(r => r.wallet)).size;
  const currencyTotals = new Map();
  const currencyTaxTotals = new Map();
  const currencyNetTotals = new Map();
  const currencyCounts = new Map();
  for (const r of rows){
    const cur = r.currency || "AED";
    currencyTotals.set(cur, (currencyTotals.get(cur) || 0) + Number(r.amount || 0));
    currencyTaxTotals.set(cur, (currencyTaxTotals.get(cur) || 0) + Number(r.taxAmount || 0));
    currencyNetTotals.set(cur, (currencyNetTotals.get(cur) || 0) + Number(r.netAmount || (Number(r.amount || 0) - Number(r.taxAmount || 0))));
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
    expensePdfFlowText(currencyNetTotals.get(cur) || 0, cur, "out"),
    expensePdfFlowText(currencyTaxTotals.get(cur) || 0, cur, "out"),
    expensePdfFlowText(currencyTotals.get(cur) || 0, cur, "out")
  ]);

  doc.autoTable({
    startY: summaryTop + 5,
    head: [["Currency", "Transactions", "Net", "VAT", "Total Spent"]],
    body: totalsBody,
    theme: "grid",
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold", fontSize: 7.6 },
    styles: { font: "helvetica", fontSize: 7.8, cellPadding: 1.8 },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: 30, halign: "right" },
      2: { cellWidth: 40, halign: "right" },
      3: { cellWidth: 35, halign: "right" },
      4: { cellWidth: 43, halign: "right" }
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
        `${curItems.length} item(s) | ${curTxCount} txn(s) | VAT ${expensePdfFlowText(curTax, cur, "out")} | Total ${expensePdfFlowText(curTotal, cur, "out")}`,
        pageWidth - 18,
        y + 6,
        { align: "right" }
      );

      const summaryBody = curItems.map(item => {
        const period = expenseItemTxPeriodLabel(item.txs);
        const count = Math.max(1, Number(item.txs?.length || 0));
        const net = Number(item.total || 0) - Number(item.taxTotal || 0);
        return [
          item.displayName || "—",
          item.expenseType || "Other",
          String(item.txs.length),
          period,
          expensePdfFlowText(Number(item.total || 0) / count, item.currency, "out"),
          expensePdfFlowText(item.taxTotal || 0, item.currency, "out"),
          expensePdfFlowText(net, item.currency, "out"),
          expensePdfFlowText(item.total || 0, item.currency, "out")
        ];
      });

      doc.autoTable({
        startY: y + 13,
        head: [["Item", "Type", "Txns", "Period", "Average", "VAT", "Net", "Total"]],
        body: summaryBody,
        theme: "grid",
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold" },
        styles: { font: "helvetica", fontSize: 8, cellPadding: 2.3, overflow: "linebreak" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 28 },
          1: { cellWidth: 20 },
          2: { cellWidth: 11, halign: "right" },
          3: { cellWidth: 32 },
          4: { cellWidth: 21, halign: "right" },
          5: { cellWidth: 20, halign: "right" },
          6: { cellWidth: 24, halign: "right" },
          7: { cellWidth: 24, halign: "right" }
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

    doc.save(`Expense_Transactions_Summary${walletContext.slug}_${expenseHistoryRangeSlug()}_${todayISO()}.pdf`);
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
    doc.text(`${item.txs.length} transaction(s) | Total: ${expensePdfFlowText(item.total, item.currency, "out")} | Type: ${item.expenseType || "Other"}`, pageWidth - 18, y + 6, { align: "right" });

    const body = item.txs.map(tx => [
      displayDate(tx.date || "—"),
      tx.wallet || "—",
      tx.expenseType || item.expenseType || "Other",
      expensePdfFlowText(tx.amount, item.currency, "out"),
      tx.taxAmount ? expensePdfFlowText(tx.taxAmount, item.currency, "out") : "-",
      wrapTextForPdf(expensePdfDetailsText(tx.details || expenseMetaFromNotes(tx.notes).details || {}, "expense", cleanExpenseNote(tx.notes)), 78).split("\n")
    ]);
    const orderedBody = body.map(row => [row[0], row[1], row[2], row[5], row[4], row[3]]);
    const historyLogoMap = await expensePdfWalletLogos(item.txs.map(tx => tx.wallet || "Wallet"));
    const historyLogoRows = item.txs.map(tx => historyLogoMap.get(String(tx.wallet || "Wallet").trim()) || null);

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
      ...expensePdfWalletCellHooks(doc, historyLogoRows, 1),
      didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
    });
    y = (doc.lastAutoTable?.finalY || y + 13) + 12;
  }

  doc.save(`Expense_Transactions_History${walletContext.slug}_${expenseHistoryRangeSlug()}_${todayISO()}.pdf`);
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
  const walletContext = expensePdfSelectedWalletContext();
  const subtitleBase = currencyFilter
    ? `Currency: ${pdfCurrencyLabel(currencyFilter)}`
    : "All currencies (separate totals per currency)";
  const subtitle = `${subtitleBase} | ${walletContext.label}`;
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
    doc.text(`Total: ${expensePdfFlowText(sum, currencyFilter, "in")}`, 120, 64);
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
      doc.text(`Total (${pdfCurrencyLabel(c)}): ${expensePdfFlowText(totals[c], c, "in")}`, 120, y);
      y += 6;
    });
    tableStartY = pdfContentStartY(doc, y + 8, 8);
  }

  const expenseAccountsForTopups = typeof getExpenseAccounts === "function" ? getExpenseAccounts({ applyUiFilters: false }) : [];
  const expenseAccountByGroupForTopups = new Map(expenseAccountsForTopups.map(account => [String(account.group_id || ""), account]));
  const bodyRows = filtered.map(tx => {
    const d = displayDate(tx.action_date || tx.loan_date || "—");
    const w = `${tx.person_name || "—"}${tx.accountType ? ` (${tx.accountType})` : ""}`;
    const ty = tx.isOpeningBalance ? "Opening Balance" : "Money Added";
    const amt = expensePdfFlowText(Number(tx.action_amount || 0), tx.currency, "in");
    const meta = expenseMetaFromNotes(tx.notes);
    const detailText = expensePdfDetailsText(meta.details || tx.details || {}, "topup", cleanExpenseNote(tx.notes));
    const walletAccount = expenseAccountByGroupForTopups.get(String(tx.group_id || ""));
    const accountText = walletAccount && typeof expenseAccountPdfMinimalText === "function" ? expenseAccountPdfMinimalText(walletAccount) : "";
    const fullDetailText = [detailText, accountText ? `Account: ${accountText}` : ""].filter(Boolean).join(" | ");
    const wrappedNote = wrapTextForPdf(fullDetailText, 78).split('\n');
    if (currencyFilter) return [d, w, ty, wrappedNote, amt];
    return [d, w, ty, wrappedNote, pdfCurrencyLabel(tx.currency || ""), amt];
  });
  const topupLogoMap = await expensePdfWalletLogos(filtered.map(tx => tx.person_name || "Wallet"));
  const topupLogoRows = filtered.map(tx => topupLogoMap.get(String(tx.person_name || "Wallet").trim()) || null);

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
    ...expensePdfWalletCellHooks(doc, topupLogoRows, 1),
    didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
  });

  doc.save(currencyFilter
    ? `Topups_${currencyFilter}${walletContext.slug}_${todayISO()}.pdf`
    : `All_Topup_Records${walletContext.slug}_${todayISO()}.pdf`);
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
        walletName: r.walletName || r.walletLabel,
        walletGroupId: r.walletGroupId || "",
        counterpartyGroupId: r.counterpartyGroupId || "",
        wallet: r.walletLabel,
        withParty: r.counterparty || "—",
        amount: expensePdfFlowText(r.amount, cur, r.kind === "Received" ? "in" : "out"),
        rate: r.rateDisplay,
        convertedLeg: expensePdfFlowExistingText(r.otherLegPdfDisplay || r.otherLegDisplay, r.kind === "Received" ? "out" : "in"),
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
  const walletContext = expensePdfSelectedWalletContext();
  const title = currencyFilter ? `Transfer Records - ${pdfCurrencyLabel(currencyFilter)}` : "Transfer Records - all currencies";
  const subtitle = `Sent and received legs per currency; rate matches the booking on each transfer. | ${walletContext.label}`;
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
    doc.text(`${pdfCurrencyLabel(cur)} - Sent: ${expensePdfFlowText(sent, cur, "out")}   Received: ${expensePdfFlowText(received, cur, "in")}`, 120, ySummary);
    ySummary += 5;
  }

  const expenseAccountsForTransfers = typeof getExpenseAccounts === "function" ? getExpenseAccounts({ applyUiFilters: false }) : [];
  const expenseAccountByGroupForTransfers = new Map(expenseAccountsForTransfers.map(account => [String(account.group_id || ""), account]));
  const body = tableRows.map(r => {
    const walletAccount = expenseAccountByGroupForTransfers.get(String(r.walletGroupId || ""));
    const accountText = walletAccount && typeof expenseAccountPdfMinimalText === "function" ? expenseAccountPdfMinimalText(walletAccount) : "";
    const transferNote = [r.notes, accountText ? `Account: ${accountText}` : ""].filter(Boolean).join(" | ");
    const wrappedNote = wrapTextForPdf(transferNote, 54).split('\n');
    return currencyFilter
      ? [r.date, r.type, r.wallet, r.withParty, wrappedNote, r.rate, r.convertedLeg, r.amount]
      : [pdfCurrencyLabel(r.currency), r.date, r.type, r.wallet, r.withParty, wrappedNote, r.rate, r.convertedLeg, r.amount];
  });
  const transferLogoMap = await expensePdfWalletLogos(tableRows.map(r => r.walletName || "Wallet"));
  const transferLogoRows = tableRows.map(r => transferLogoMap.get(String(r.walletName || "Wallet").trim()) || null);

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
    ...expensePdfWalletCellHooks(doc, transferLogoRows, currencyFilter ? 2 : 3),
    didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
  });

  doc.save(currencyFilter
    ? `Transfers_${currencyFilter}${walletContext.slug}_${todayISO()}.pdf`
    : `All_Transfer_Records${walletContext.slug}_${todayISO()}.pdf`);
}

async function downloadExpenseTransactionPDF(txId){
  if (!window.jspdf) { alert("PDF library loading. Please try again in a moment."); return; }
  const tx = typeof getExpenseTransactionByIdForExport === "function" ? getExpenseTransactionByIdForExport(txId) : null;
  if (!tx) { alert("Transaction not found."); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  await loadCustomFontsForPdf(doc);
  const brandLogo = await getPdfLogo();
  const walletAccount = typeof getExpenseAccounts === "function"
    ? getExpenseAccounts({ applyUiFilters: false }).find(a => String(a.group_id || "") === String(tx.group_id || ""))
      || getExpenseAccounts({ applyUiFilters: false }).find(a => String(a.person_name || "") === String(tx.wallet || "") && String(a.currency || "") === String(tx.currency || ""))
    : null;
  const walletLogo = walletAccount
    ? await expensePdfWalletLogoForAccount(walletAccount)
    : await expensePdfWalletLogo(tx.wallet || "Wallet");

  const compactId = String(tx.id || txId || "").replace(/[^a-z0-9]/gi, "").toUpperCase();
  const generatedReference = compactId ? `EXP-${compactId.slice(0, 10)}` : "—";
  const details = tx.details || {};
  const displayRef = generatedReference;
  const title = "Expense Transaction";
  const subtitle = `${tx.itemName || "Expense"} | ${displayDate(tx.date || "—")} | ${pdfCurrencyLabel(tx.currency || "")}`;
  drawPdfHeader(doc, brandLogo, title, subtitle);
  drawPdfFooter(doc);

  let y = expensePdfDrawSingleExpenseHero(doc, {
    logoData: walletLogo,
    item: tx.itemName || "Expense",
    wallet: tx.wallet || "Wallet",
    category: tx.expenseType || "Other",
    amount: tx.amount,
    currency: tx.currency,
    date: tx.date,
    y: 41.5
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  y += 5.2;
  doc.setTextColor(36,87,214);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.1);
  doc.text(`REFERENCE  ${displayRef}`, 14, y);
  doc.setTextColor(100,116,139);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  doc.text("Use this reference to search and verify the transaction in Triplem VIP.", pageWidth - 14, y, { align: "right" });
  y += 4.5;

  doc.setTextColor(15,23,42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.4);
  doc.text("Transaction particulars", 14, y);
  doc.setDrawColor(226,232,240);
  doc.line(14, y + 2.5, pageWidth - 14, y + 2.5);

  const baseFields = [
    { label: "Reference", value: displayRef, strong: true },
    { label: "Transaction date", value: displayDate(tx.date || "—") },
    { label: "Wallet", value: tx.wallet || "—" },
    { label: "Category", value: tx.expenseType || "Other" },
    { label: "Expense item", value: tx.itemName || "Expense" },
    { label: "Currency", value: pdfCurrencyLabel(tx.currency || "") },
    { label: "Recorded at", value: expenseRecordedText(tx.createdAt) },
    ...(walletAccount && typeof expenseAccountPdfMinimalFields === "function" ? expenseAccountPdfMinimalFields(walletAccount) : []),
    { label: "Total paid", value: expensePdfFlowText(tx.amount, tx.currency, "out"), strong: true }
  ];
  y = expensePdfDrawReceiptFieldGrid(doc, baseFields, {
    y: y + 5.5,
    maxY: pageHeight - 128,
    preferredColumns: 4
  });

  const detailFields = expensePdfDetailRows(details, "expense")
    .map(row => ({ label: row.label, value: row.value }));
  if (detailFields.length){
    y += 3.5;
    doc.setTextColor(15,23,42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.4);
    doc.text("Additional details", 14, y);
    doc.setDrawColor(226,232,240);
    doc.line(14, y + 2.5, pageWidth - 14, y + 2.5);
    y = expensePdfDrawReceiptFieldGrid(doc, detailFields, {
      y: y + 5.5,
      maxY: pageHeight - 82,
      preferredColumns: detailFields.length >= 8 ? 4 : 3
    });
  }

  const notes = cleanExpenseNote(tx.notes || "");
  if (notes){
    y += 3.0;
    const noteY = y;
    const noteLines = pdfClampLines(doc, notes, pageWidth - 36, 3);
    const noteH = Math.max(12, 7 + noteLines.length * 3.2);
    doc.setFillColor(248,250,252);
    doc.setDrawColor(226,232,240);
    doc.roundedRect(14, noteY, pageWidth - 28, noteH, 1.8, 1.8, "FD");
    doc.setTextColor(100,116,139);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.6);
    doc.text("NOTES / DESCRIPTION", 18, noteY + 4.3);
    doc.setTextColor(15,23,42);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(noteLines, 18, noteY + 8.2);
    y = noteY + noteH;
  }

  const netAmount = Number(tx.netAmount || (Number(tx.amount || 0) - Number(tx.taxAmount || 0)));
  const taxAmount = Number(tx.taxAmount || 0);
  const totalsY = Math.min(Math.max(y + 4.5, pageHeight - 52), pageHeight - 43);
  drawCompactPdfTotals(doc, totalsY, [
    { label: "Net", value: expensePdfFlowText(netAmount, tx.currency, "out") },
    { label: Number(tx.taxRate || 0) ? `VAT (${Number(tx.taxRate || 0)}%)` : "VAT", value: expensePdfFlowText(taxAmount, tx.currency, "out") },
    { label: "Total", value: expensePdfFlowText(tx.amount, tx.currency, "out"), strong: true }
  ]);

  doc.save(`Expense_Transaction_${String(tx.itemName || "Expense").replace(/[^a-z0-9_-]+/gi,"_")}_${displayDate(tx.date || "").replace(/[^0-9A-Za-z_-]+/g,"_")}.pdf`);
}

window.downloadExpenseTransactionPDF = downloadExpenseTransactionPDF;

async function downloadExpenseTopupTransactionPDF(txId){
  if (!window.jspdf) { alert("PDF library loading. Please try again in a moment."); return; }
  const tx = typeof getExpenseTopupByIdForExport === "function" ? getExpenseTopupByIdForExport(txId) : null;
  if (!tx) { alert("Money-added transaction not found."); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  await loadCustomFontsForPdf(doc);
  const brandLogo = await getPdfLogo();
  const walletAccount = typeof getExpenseAccounts === "function"
    ? getExpenseAccounts({ applyUiFilters: false }).find(a => String(a.group_id || "") === String(tx.group_id || ""))
      || getExpenseAccounts({ applyUiFilters: false }).find(a => String(a.person_name || "") === String(tx.wallet || "") && String(a.currency || "") === String(tx.currency || ""))
    : null;
  const walletLogo = walletAccount
    ? await expensePdfWalletLogoForAccount(walletAccount)
    : await expensePdfWalletLogo(tx.wallet || "Wallet");
  const title = tx.isOpeningBalance ? "Wallet Opening Balance Receipt" : "Money Added Receipt";
  const subtitle = `${tx.wallet || "Wallet"} | ${displayDate(tx.date || "—")} | ${pdfCurrencyLabel(tx.currency || "")}`;
  drawPdfHeader(doc, brandLogo, title, subtitle);
  drawPdfFooter(doc);

  let y = expensePdfDrawSingleExpenseHero(doc, {
    logoData: walletLogo,
    item: tx.isOpeningBalance ? "Opening Balance" : "Money Added",
    wallet: tx.wallet || "Wallet",
    category: tx.accountType || (tx.isOpeningBalance ? "Opening Balance" : "Top-Up"),
    amount: tx.amount,
    currency: tx.currency,
    date: tx.date,
    y: 41.5,
    kicker: tx.isOpeningBalance ? "OPENING BALANCE" : "TOP-UP",
    amountLabel: tx.isOpeningBalance ? "OPENING AMOUNT" : "AMOUNT RECEIVED",
    flow: "in"
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  y += 5.2;
  doc.setTextColor(15,23,42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.4);
  doc.text("Transaction particulars", 14, y);
  doc.setDrawColor(226,232,240);
  doc.line(14, y + 2.5, pageWidth - 14, y + 2.5);

  const baseFields = [
    { label: "Wallet", value: tx.wallet || "—" },
    { label: "Account type", value: tx.accountType || "—" },
    { label: "Transaction type", value: tx.isOpeningBalance ? "Opening Balance" : "Money Added" },
    { label: "Transaction date", value: displayDate(tx.date || "—") },
    { label: "Currency", value: pdfCurrencyLabel(tx.currency || "") },
    { label: "Recorded at", value: expenseRecordedText(tx.createdAt) },
    ...(walletAccount && typeof expenseAccountPdfMinimalFields === "function" ? expenseAccountPdfMinimalFields(walletAccount) : []),
    { label: tx.isOpeningBalance ? "Opening amount" : "Amount received", value: expensePdfFlowText(tx.amount, tx.currency, "in"), strong: true }
  ];
  y = expensePdfDrawReceiptFieldGrid(doc, baseFields, {
    y: y + 5.5,
    maxY: pageHeight - 126,
    preferredColumns: 4
  });

  const detailFields = expensePdfDetailRows(tx.details || {}, tx.isTransfer ? "transfer" : "topup")
    .map(row => ({ label: row.label, value: row.value }));
  if (detailFields.length){
    y += 3.5;
    doc.setTextColor(15,23,42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.4);
    doc.text("Additional details", 14, y);
    doc.setDrawColor(226,232,240);
    doc.line(14, y + 2.5, pageWidth - 14, y + 2.5);
    y = expensePdfDrawReceiptFieldGrid(doc, detailFields, {
      y: y + 5.5,
      maxY: pageHeight - 78,
      preferredColumns: detailFields.length >= 8 ? 4 : 3
    });
  }

  const notes = cleanExpenseNote(tx.notes || "");
  if (notes){
    y += 3.0;
    const noteLines = pdfClampLines(doc, notes, pageWidth - 36, 3);
    const noteH = Math.max(12, 7 + noteLines.length * 3.2);
    doc.setFillColor(248,250,252);
    doc.setDrawColor(226,232,240);
    doc.roundedRect(14, y, pageWidth - 28, noteH, 1.8, 1.8, "FD");
    doc.setTextColor(100,116,139);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.6);
    doc.text("NOTES / DESCRIPTION", 18, y + 4.3);
    doc.setTextColor(15,23,42);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(noteLines, 18, y + 8.2);
    y += noteH;
  }

  const totalsY = Math.min(Math.max(y + 4.5, pageHeight - 48), pageHeight - 40);
  drawCompactPdfTotals(doc, totalsY, [
    { label: tx.isOpeningBalance ? "Opening Balance" : "Amount Added", value: expensePdfFlowText(tx.amount, tx.currency, "in"), strong: true }
  ]);
  doc.save(`${tx.isOpeningBalance ? "Wallet_Opening_Balance" : "Money_Added"}_${String(tx.wallet||"Wallet").replace(/[^a-z0-9_-]+/gi,"_")}_${todayISO()}.pdf`);
}
window.downloadExpenseTopupTransactionPDF = downloadExpenseTopupTransactionPDF;

async function downloadExpenseTransferTransactionPDF(recordId){
  if (!window.jspdf) { alert("PDF library loading. Please try again in a moment."); return; }
  const ev = typeof getExpenseTransferByIdForExport === "function" ? getExpenseTransferByIdForExport(recordId) : null;
  if (!ev) { alert("Transfer transaction not found."); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  await loadCustomFontsForPdf(doc);
  const brandLogo = await getPdfLogo();
  const transferAccounts = typeof getExpenseAccounts === "function" ? getExpenseAccounts({ applyUiFilters: false }) : [];
  const fromAccount = transferAccounts.find(account => String(account.group_id || "") === String(ev.fromGroupId || ev.expenseEntry?.group_id || ""))
    || transferAccounts.find(account => String(account.person_name || "") === String(ev.fromWallet || "") && String(account.currency || "") === String(ev.curOut || ""));
  const toAccount = transferAccounts.find(account => String(account.group_id || "") === String(ev.toGroupId || ev.topupEntry?.group_id || ""))
    || transferAccounts.find(account => String(account.person_name || "") === String(ev.toWallet || "") && String(account.currency || "") === String(ev.curIn || ""));
  const fromLogo = fromAccount ? await expensePdfWalletLogoForAccount(fromAccount) : await expensePdfWalletLogo(ev.fromWallet || "Wallet");
  const toLogo = toAccount ? await expensePdfWalletLogoForAccount(toAccount) : await expensePdfWalletLogo(ev.toWallet || "Wallet");
  const title = "Wallet Transfer Receipt";
  const subtitle = `${displayDate(ev.date || "—")} | ${ev.fromWallet || "Wallet"} to ${ev.toWallet || "Wallet"}`;
  drawPdfHeader(doc, brandLogo, title, subtitle);
  drawPdfFooter(doc);

  let y = expensePdfDrawSingleTransferHero(doc, {
    fromLogo,
    toLogo,
    fromWallet: ev.fromWallet || "Wallet",
    toWallet: ev.toWallet || "Wallet",
    amountOut: ev.amtOut,
    amountIn: ev.amtIn,
    curOut: ev.curOut,
    curIn: ev.curIn,
    y: 41.5
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  y += 5.2;
  doc.setTextColor(15,23,42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.4);
  doc.text("Transaction particulars", 14, y);
  doc.setDrawColor(226,232,240);
  doc.line(14, y + 2.5, pageWidth - 14, y + 2.5);

  const baseFields = [
    { label: "From wallet", value: ev.fromWallet || "—" },
    { label: "To wallet", value: ev.toWallet || "—" },
    { label: "Transfer date", value: displayDate(ev.date || "—") },
    { label: "Conversion rate", value: ev.sameCurrency ? "1" : String(ev.rate || "—") },
    { label: "From account type", value: ev.fromAccountType || "—" },
    { label: "To account type", value: ev.toAccountType || "—" },
    { label: "Sent currency", value: pdfCurrencyLabel(ev.curOut || "") },
    { label: "Received currency", value: pdfCurrencyLabel(ev.curIn || "") },
    ...(fromAccount && typeof expenseAccountPdfMinimalFields === "function" ? expenseAccountPdfMinimalFields(fromAccount, { prefix: "From " }) : []),
    ...(toAccount && typeof expenseAccountPdfMinimalFields === "function" ? expenseAccountPdfMinimalFields(toAccount, { prefix: "To " }) : []),
    { label: "Amount sent", value: expensePdfFlowText(ev.amtOut, ev.curOut, "out"), strong: true },
    { label: "Amount received", value: expensePdfFlowText(ev.amtIn, ev.curIn, "in"), strong: true },
    { label: "Recorded at", value: expenseRecordedText(ev.createdAt) }
  ];
  y = expensePdfDrawReceiptFieldGrid(doc, baseFields, {
    y: y + 5.5,
    maxY: pageHeight - 132,
    preferredColumns: 4
  });

  const detailFields = expensePdfDetailRows(ev.details || {}, "transfer")
    .map(row => ({ label: row.label, value: row.value }));
  if (detailFields.length){
    y += 3.5;
    doc.setTextColor(15,23,42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.4);
    doc.text("Additional details", 14, y);
    doc.setDrawColor(226,232,240);
    doc.line(14, y + 2.5, pageWidth - 14, y + 2.5);
    y = expensePdfDrawReceiptFieldGrid(doc, detailFields, {
      y: y + 5.5,
      maxY: pageHeight - 78,
      preferredColumns: detailFields.length >= 8 ? 4 : 3
    });
  }

  const notes = cleanExpenseNote(ev.notesExpense || ev.notesTopup || "");
  if (notes){
    y += 3.0;
    const noteLines = pdfClampLines(doc, notes, pageWidth - 36, 3);
    const noteH = Math.max(12, 7 + noteLines.length * 3.2);
    doc.setFillColor(248,250,252);
    doc.setDrawColor(226,232,240);
    doc.roundedRect(14, y, pageWidth - 28, noteH, 1.8, 1.8, "FD");
    doc.setTextColor(100,116,139);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.6);
    doc.text("NOTES / DESCRIPTION", 18, y + 4.3);
    doc.setTextColor(15,23,42);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(noteLines, 18, y + 8.2);
    y += noteH;
  }

  const totalsY = Math.min(Math.max(y + 4.5, pageHeight - 52), pageHeight - 43);
  drawCompactPdfTotals(doc, totalsY, [
    { label: "Amount Sent", value: expensePdfFlowText(ev.amtOut, ev.curOut, "out") },
    { label: "Amount Received", value: expensePdfFlowText(ev.amtIn, ev.curIn, "in"), strong: true }
  ]);
  doc.save(`Wallet_Transfer_${String(ev.fromWallet||"Wallet").replace(/[^a-z0-9_-]+/gi,"_")}_to_${String(ev.toWallet||"Wallet").replace(/[^a-z0-9_-]+/gi,"_")}_${todayISO()}.pdf`);
}
window.downloadExpenseTransferTransactionPDF = downloadExpenseTransferTransactionPDF;

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
  doc.text(`VAT: ${expensePdfFlowText(targetItem.taxTotal || 0, targetItem.currency, "out")}`, 132, 66);
  doc.text(`Net: ${expensePdfFlowText(Number(targetItem.total || 0) - Number(targetItem.taxTotal || 0), targetItem.currency, "out")}`, 132, 72);
  doc.text(`Total: ${expensePdfFlowText(targetItem.total || 0, targetItem.currency, "out")}`, 132, 78);

  const rows = targetItem.txs.map(tx => [
    displayDate(tx.date || "—"),
    tx.wallet || "—",
    tx.expenseType || "—",
    expensePdfFlowText(tx.amount, targetItem.currency, "out"),
    tx.taxAmount ? expensePdfFlowText(tx.taxAmount, targetItem.currency, "out") : "-",
    expensePdfDetailsText(tx.details || expenseMetaFromNotes(tx.notes).details || {}, "expense", cleanExpenseNote(tx.notes))
  ]);
  const orderedRows = rows.map(row => [row[0], row[1], row[2], wrapTextForPdf(row[5], 76).split("\n"), row[4], row[3]]);
  const itemLogoMap = await expensePdfWalletLogos(targetItem.txs.map(tx => tx.wallet || "Wallet"));
  const itemLogoRows = targetItem.txs.map(tx => itemLogoMap.get(String(tx.wallet || "Wallet").trim()) || null);

  doc.autoTable({
    startY: 86,
    head: [["Date", "Wallet", "Type", "Notes/Description", "VAT", "Amount"]],
    body: orderedRows,
    theme: "grid",
    headStyles: { fillColor: [36, 87, 214] },
    styles: { font: "helvetica", fontSize: 8.4, cellPadding: 2.3, overflow: "linebreak" },
    columnStyles: { 3: { cellWidth: 46 }, 4: { cellWidth: 24, halign: "right" }, 5: { cellWidth: 30, halign: "right" } },
    margin: { top: 50, bottom: 40 },
    ...expensePdfWalletCellHooks(doc, itemLogoRows, 1),
    didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
  });

  // Add summary at the bottom
  const finalY = doc.lastAutoTable.finalY || 72;
  doc.setTextColor(23, 33, 43);
  doc.setFontSize(10);
  doc.text(`Net Amount: ${expensePdfFlowText(Number(targetItem.total || 0) - Number(targetItem.taxTotal || 0), targetItem.currency, "out")}`, 14, finalY + 10);
  doc.text(`Total VAT: ${expensePdfFlowText(targetItem.taxTotal || 0, targetItem.currency, "out")}`, 14, finalY + 16);
  doc.setFont("helvetica", "bold");
  doc.text(`Total Amount: ${expensePdfFlowText(targetItem.total, targetItem.currency, "out")}`, 14, finalY + 22);
  doc.setFont("helvetica", "normal");

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
