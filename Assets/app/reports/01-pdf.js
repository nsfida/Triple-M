/* Modularized from script.js lines 22601-24016 — PDF generators. Load order must be preserved. */
async function loadPdfLogoAsset(imageUrl) {
  const dataUrl = await getBase64ImageFromUrl(imageUrl);
  if (!dataUrl) return null;
  const dims = await measureImageDataUrl(dataUrl);
  return {
    dataUrl,
    width: dims.width || 120,
    height: dims.height || 40
  };
}

function pdfLogoDataUrl(logo) {
  if (!logo) return null;
  if (typeof logo === "string") return logo;
  return logo.dataUrl || null;
}

function fitPdfImageBox(naturalW, naturalH, maxW, maxH) {
  const srcW = Math.max(1, Number(naturalW) || 1);
  const srcH = Math.max(1, Number(naturalH) || 1);
  const ratio = srcW / srcH;
  let width = maxW;
  let height = width / ratio;
  if (height > maxH) {
    height = maxH;
    width = height * ratio;
  }
  return { width, height };
}

function drawFittedPdfImage(doc, logo, x, y, maxW, maxH, { align = "left", valign = "middle" } = {}) {
  const dataUrl = pdfLogoDataUrl(logo);
  if (!doc || !dataUrl) return null;
  const natW = typeof logo === "object" ? logo.width : maxW;
  const natH = typeof logo === "object" ? logo.height : maxH;
  const { width, height } = fitPdfImageBox(natW, natH, maxW, maxH);
  let drawX = x;
  let drawY = y;
  if (align === "center") drawX = x + (maxW - width) / 2;
  if (align === "right") drawX = x + (maxW - width);
  if (valign === "middle") drawY = y + (maxH - height) / 2;
  if (valign === "bottom") drawY = y + (maxH - height);
  try {
    doc.addImage(dataUrl, pdfImageFormatFromDataUrl(dataUrl), drawX, drawY, width, height);
  } catch {}
  return { x: drawX, y: drawY, width, height };
}

const PDF_BRAND = {
  owner: "Nadeem Shahzad Fida",
  email: "nadeemshahzadfida@outlook.com",
  mobile: "+971 55 921 6280",
  whatsapp: "+92 333 900 4564",
  facebook: "facebook.com/nadeemshahzadfida",
  systemName: "TRIPLEM VIP"
};

function getPdfCompanyContact() {
  const company = String(fullConfigData?.Company || "").trim();
  const hasCompany = !!company;
  const email = String(
    fullConfigData?.company_email || fullConfigData?.email || fullConfigData?.Email || ""
  ).trim();
  const phone = String(
    fullConfigData?.company_phone || fullConfigData?.Mobile || fullConfigData?.Phone || ""
  ).trim();
  const address = String(
    fullConfigData?.company_address || fullConfigData?.Address || fullConfigData?.address || ""
  ).trim();
  const trn = String(fullConfigData?.TRN || "").trim();

  if (hasCompany) {
    return {
      isCompany: true,
      name: company,
      trn,
      email: email || PDF_BRAND.email,
      phone: phone || PDF_BRAND.mobile,
      address,
      whatsapp: phone || PDF_BRAND.whatsapp
    };
  }
  // Personal / trial accounts without a company name still use their contact fields on PDFs
  return {
    isCompany: false,
    name: PDF_BRAND.owner,
    trn: trn || "",
    email: email || PDF_BRAND.email,
    phone: phone || PDF_BRAND.mobile,
    address: address || "",
    whatsapp: phone || PDF_BRAND.whatsapp
  };
}

let cachedPdfLogo = null;
async function getPdfLogo(){
  if (cachedPdfLogo !== null) return cachedPdfLogo;

  const logoUrl = (fullConfigData?.logo && String(fullConfigData.logo).trim())
    || "Assets/logo/logo2.png";

  try {
    cachedPdfLogo = await loadPdfLogoAsset(logoUrl);
    if (!cachedPdfLogo) throw new Error("Logo load returned empty");
  } catch (error) {
    console.warn("Failed to load company logo, using default logo:", error);
    cachedPdfLogo = await loadPdfLogoAsset("Assets/logo/logo2.png");
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
  const maxWidth = Math.min(pageWidth * 0.52, 110);
  const maxHeight = Math.min(pageHeight * 0.28, 52);
  const boxX = (pageWidth - maxWidth) / 2;
  const boxY = (pageHeight - maxHeight) / 2;

  try {
    if (typeof doc.GState === "function" && typeof doc.setGState === "function") {
      doc.setGState(new doc.GState({ opacity: 0.045 }));
      drawFittedPdfImage(doc, logoData, boxX, boxY, maxWidth, maxHeight, { align: "center", valign: "middle" });
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
  const logoUrl = String(fullConfigData?.logo || "").trim();
  const targets = document.querySelectorAll(
    "img.mark, #welcomeScreen img, .login-panel-top img, header img.mark, .brand img"
  );
  if (!logoUrl) {
    targets.forEach(img => {
      if (img.dataset.defaultSrc) img.src = img.dataset.defaultSrc;
    });
    return;
  }

  targets.forEach(img => {
    if (!img.dataset.defaultSrc) img.dataset.defaultSrc = img.getAttribute("src") || "Assets/logo/logo.png";
    const testImg = new Image();
    testImg.onload = () => { img.src = logoUrl; };
    testImg.onerror = () => {
      console.warn("Failed to load company logo, keeping default.");
      img.src = img.dataset.defaultSrc || "Assets/logo/logo.png";
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

  document.querySelectorAll(".currency-filter-select").forEach(select => {
    const filterKey = select.dataset.currencyFilter;
    Array.from(select.options).forEach(option => {
      if (option.value === "All") {
        option.hidden = false;
        option.disabled = false;
        return;
      }
      const isAllowed = allowedCurrencies.includes(normalizeCurrencyCode(option.value));
      option.hidden = !isAllowed;
      option.disabled = !isAllowed;
      if (!isAllowed && state.currencyFilter[filterKey] === option.value) {
        state.currencyFilter[filterKey] = "All";
      }
    });
    const desired = state.currencyFilter[filterKey] || "All";
    const match = Array.from(select.options).find(opt => !opt.disabled && opt.value === desired);
    select.value = match ? desired : "All";
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
  const contact = getPdfCompanyContact();
  let subtitle = "Money Management Module (Powered by Nadeem Shahzad Fida)";

  if (contact.isCompany) {
    subtitle = `<span style="color: var(--text); font-weight: bold;">${escapeHtml(contact.name)}</span>`;
    const meta = [];
    if (contact.trn) meta.push(`TRN: ${escapeHtml(contact.trn)}`);
    if (contact.phone) meta.push(escapeHtml(contact.phone));
    if (contact.email) meta.push(escapeHtml(contact.email));
    if (meta.length) {
      subtitle += `<br><span style="color: var(--primary); font-size: 0.9em;">${meta.join(" · ")}</span>`;
    }
    if (contact.address) {
      subtitle += `<br><span style="color: var(--muted); font-size: 0.82em;">${escapeHtml(contact.address)}</span>`;
    }
  }

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

function pdfOwnerBlockBottom(doc){
  return Number(doc?.__tripleMOwnerBlockBottom || 0);
}

function pdfClampLines(doc, text, maxWidth, maxLines = 2){
  const lines = doc.splitTextToSize(String(text || ""), maxWidth);
  if (lines.length <= maxLines) return lines;
  const clipped = lines.slice(0, maxLines);
  const last = String(clipped[maxLines - 1] || "");
  clipped[maxLines - 1] = last.length > 3 ? `${last.slice(0, Math.max(0, last.length - 3))}...` : last;
  return clipped;
}

function drawInventoryPdfDetailLines(doc, x, startY, lines, maxWidth, lineHeight = 3.5){
  let y = startY;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  for (const line of lines){
    if (!line) continue;
    const wrapped = pdfClampLines(doc, line, maxWidth, 2);
    doc.text(wrapped, x, y);
    y += Math.max(lineHeight, wrapped.length * lineHeight);
  }
  return y;
}

/**
 * Compact From | Party block + thin document meta strip (inventory, loans, expenses, installments).
 */
function drawInventoryPdfPartiesAndMeta(doc, options = {}){
  const rightLabel = String(options.rightLabel || "BILL TO").trim().toUpperCase() || "BILL TO";
  const customerName = String(options.customerName || options.partyName || "—").trim() || "—";
  const customerCompany = String(options.customerCompany || "").trim();
  const customerTrn = String(options.customerTrn || "").trim();
  const customerPhone = String(options.customerPhone || options.partyPhone || "").trim();
  const customerEmail = String(options.customerEmail || options.partyEmail || "").trim();
  const customerAddress = String(options.customerAddress || options.partyAddress || "").trim();
  const metaItems = Array.isArray(options.meta) ? options.meta.filter(item => item && (item.value || item.value === 0)) : [];
  const contact = getPdfCompanyContact();
  const sellerName = contact.isCompany
    ? contact.name
    : (getLoggedInUserDisplayName() || contact.name);

  const pageWidth = doc.internal.pageSize.getWidth();
  const leftX = 14;
  const rightX = 108;
  const colWidth = 84;
  const top = 40;
  const labelY = top + 3.2;
  const nameY = labelY + 5;
  const detailGap = 1.2;
  const lineHeight = 3.5;

  const sellerNameLines = pdfClampLines(doc, sellerName, colWidth - 4, 2);
  const buyerNameLines = pdfClampLines(doc, customerName, colWidth - 4, 2);
  const sellerDetails = [
    contact.trn ? `TRN: ${contact.trn}` : "",
    contact.phone || "",
    contact.email || "",
    contact.address || ""
  ].filter(Boolean);
  const buyerDetails = [
    customerCompany,
    customerTrn ? `TRN: ${customerTrn}` : "",
    customerPhone,
    customerEmail,
    customerAddress
  ].filter(Boolean);

  const measureDetails = (lines) => {
    let height = 0;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    for (const line of lines){
      const wrapped = pdfClampLines(doc, line, colWidth - 4, 2);
      height += Math.max(lineHeight, wrapped.length * lineHeight);
    }
    return height;
  };

  const leftDetailsH = measureDetails(sellerDetails);
  const rightDetailsH = measureDetails(buyerDetails);
  const leftContentH = 5 + Math.max(3.8, sellerNameLines.length * 3.8) + detailGap + leftDetailsH;
  const rightContentH = 5 + Math.max(3.8, buyerNameLines.length * 3.8) + detailGap + rightDetailsH;
  const bandHeight = Math.max(22, Math.max(leftContentH, rightContentH) + 5);
  const partiesBottom = top + bandHeight;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.roundedRect(leftX, top, pageWidth - 28, bandHeight, 1.5, 1.5, "FD");
  doc.line(101, top + 3, 101, partiesBottom - 3);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.4);
  doc.setTextColor(100, 116, 139);
  doc.text(contact.isCompany ? "FROM" : "PREPARED BY", leftX + 3, labelY);
  doc.text(rightLabel, rightX + 3, labelY);

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9);
  doc.text(sellerNameLines, leftX + 3, nameY);
  doc.text(buyerNameLines, rightX + 3, nameY);

  drawInventoryPdfDetailLines(
    doc,
    leftX + 3,
    nameY + Math.max(3.8, sellerNameLines.length * 3.8) + detailGap,
    sellerDetails,
    colWidth - 4,
    lineHeight
  );
  drawInventoryPdfDetailLines(
    doc,
    rightX + 3,
    nameY + Math.max(3.8, buyerNameLines.length * 3.8) + detailGap,
    buyerDetails,
    colWidth - 4,
    lineHeight
  );

  let metaBottom = partiesBottom;
  if (metaItems.length){
    const metaTop = partiesBottom + 2.5;
    const metaHeight = 9;
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(leftX, metaTop, pageWidth - 28, metaHeight, 1.2, 1.2, "F");
    const usableWidth = pageWidth - 34;
    const slot = usableWidth / metaItems.length;
    metaItems.forEach((item, index) => {
      const x = leftX + 4 + (index * slot);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(5.8);
      doc.setTextColor(148, 163, 184);
      doc.text(String(item.label || "").toUpperCase(), x, metaTop + 3.4);
      doc.setFontSize(7.4);
      doc.setTextColor(255, 255, 255);
      const valueLines = pdfClampLines(doc, String(item.value ?? "—"), slot - 4, 1);
      doc.text(valueLines, x, metaTop + 7.2);
    });
    metaBottom = metaTop + metaHeight;
  }

  doc.__tripleMOwnerBlockBottom = metaBottom;
  return metaBottom;
}

function drawInventoryPdfTotals(doc, startY, rows = []){
  const right = 196;
  const labelX = 128;
  let y = startY;
  rows.forEach((row, index) => {
    const isLast = index === rows.length - 1;
    const isStrong = !!row.strong || isLast;
    if (isStrong){
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(labelX, y - 3.2, right, y - 3.2);
    }
    doc.setFont("helvetica", isStrong ? "bold" : "normal");
    doc.setFontSize(isStrong ? 8.4 : 7.6);
    doc.setTextColor(isStrong ? 15 : 71, isStrong ? 23 : 85, isStrong ? 42 : 105);
    doc.text(String(row.label || ""), labelX, y);
    doc.setTextColor(15, 23, 42);
    doc.text(String(row.value || "—"), right, y, { align: "right" });
    y += isStrong ? 5.4 : 4.6;
  });
  return y;
}

const drawCompactPdfPartiesAndMeta = drawInventoryPdfPartiesAndMeta;
const drawCompactPdfTotals = drawInventoryPdfTotals;

/** First content / table Y below company details (or preferredY if already clear). */
function pdfContentStartY(doc, preferredY = 72, gap = 8){
  const preferred = Number(preferredY);
  const safePreferred = Number.isFinite(preferred) ? preferred : 72;
  const bottom = pdfOwnerBlockBottom(doc);
  if (!(bottom > 0)) return safePreferred;
  return Math.max(safePreferred, bottom + gap);
}

function installProfessionalPdfTableDefaults(doc){
  if (!doc?.autoTable || doc.__tripleMAutoTableInstalled) return;
  const originalAutoTable = doc.autoTable.bind(doc);
  doc.autoTable = function tripleMAutoTable(options = {}){
    const userWillDrawPage = options.willDrawPage;
    const userDidParseCell = options.didParseCell;
    const userWillDrawCell = options.willDrawCell;
    const preserveRowFills = !!options.preserveRowFills;
    const startY = options.startY == null
      ? options.startY
      : pdfContentStartY(doc, options.startY, 8);
    const nextOptions = {
      ...options,
      ...(startY != null ? { startY } : {}),
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
        ...(preserveRowFills ? {} : { fillColor: false })
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
        ...(preserveRowFills ? {} : { fillColor: false })
      },
      alternateRowStyles: preserveRowFills
        ? { ...(options.alternateRowStyles || {}) }
        : {
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
      willDrawCell(data){
        if (typeof userWillDrawCell === "function") userWillDrawCell(data);
      },
      didParseCell(data){
        if (typeof userDidParseCell === "function") userDidParseCell(data);
        if (data.section === "body" && !preserveRowFills){
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
    const isCompanyLogo = !!(fullConfigData?.logo && String(fullConfigData.logo).trim());
    // Keep natural aspect ratio inside a fixed header box (no stretch)
    drawFittedPdfImage(
      doc,
      logoData,
      14,
      9,
      isCompanyLogo ? 40 : 44,
      isCompanyLogo ? 22 : 24,
      { align: "left", valign: "middle" }
    );
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
  const contact = getPdfCompanyContact();
  const owner = contact.isCompany
    ? contact.name
    : (getLoggedInUserDisplayName() || contact.name);
  const lines = [];
  lines.push(`Email: ${contact.email}`);
  lines.push(`Mobile: ${contact.phone}${contact.whatsapp && contact.whatsapp !== contact.phone ? ` | WhatsApp: ${contact.whatsapp}` : ""}`);
  if (contact.trn) lines.push(`TRN: ${contact.trn}`);
  if (contact.address) lines.push(contact.address);

  // Measure wrapped owner + detail lines so tall company addresses don't clip or collide with tables
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.2);
  const ownerWrapped = doc.splitTextToSize(String(owner || ""), 82);
  const ownerLineHeight = 4.2;
  const ownerBlockHeight = Math.max(ownerLineHeight, ownerWrapped.length * ownerLineHeight);
  const detailsStartY = y + 7 + ownerBlockHeight + 1.2;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  const wrappedDetails = lines.map(line => doc.splitTextToSize(String(line || ""), 82));
  let detailsHeight = 0;
  wrappedDetails.forEach(wrapped => {
    detailsHeight += Math.max(4.2, wrapped.length * 3.6);
  });

  const boxTop = y - 5;
  const contentBottom = detailsStartY + detailsHeight;
  const boxHeight = Math.max(24, contentBottom - boxTop + 3);

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, boxTop, 92, boxHeight, 2, 2, "FD");
  doc.setTextColor(100, 116, 139);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.2);
  doc.text(contact.isCompany ? "COMPANY" : "PREPARED BY", 18, y + 1);
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9.2);
  doc.text(ownerWrapped, 18, y + 7);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  doc.setTextColor(71, 85, 105);
  let lineY = detailsStartY;
  wrappedDetails.forEach(wrapped => {
    doc.text(wrapped, 18, lineY);
    lineY += Math.max(4.2, wrapped.length * 3.6);
  });
  doc.__tripleMOwnerBlockBottom = boxTop + boxHeight;
  return doc.__tripleMOwnerBlockBottom;
}

function drawPdfFooter(doc){
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  const contact = getPdfCompanyContact();

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(12, pageHeight - 30, pageWidth - 24, 22, 2, 2, "F");

  doc.setDrawColor(36, 87, 214);
  doc.setLineWidth(0.3);
  doc.line(12, pageHeight - 30, pageWidth - 12, pageHeight - 30);

  const companyName = contact.isCompany ? contact.name : PDF_BRAND.systemName;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(companyName, pageWidth / 2, pageHeight - 24, { align: "center" });

  let nextY = pageHeight - 20;
  if (contact.trn) {
    doc.setTextColor(36, 87, 214);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`TRN: ${contact.trn}`, pageWidth / 2, nextY, { align: "center" });
    nextY += 3.6;
  }

  const contactBits = [contact.email, contact.phone].filter(Boolean);
  if (contact.address) contactBits.push(contact.address);
  if (contactBits.length) {
    doc.setTextColor(71, 85, 105);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    const contactLine = contact.isCompany
      ? contactBits.join("  ·  ")
      : `Powered by ${PDF_BRAND.owner} | ${contact.email} | ${contact.phone}`;
    const wrapped = doc.splitTextToSize(contactLine, pageWidth - 36);
    doc.text(wrapped, pageWidth / 2, nextY, { align: "center" });
    nextY += Math.max(3.4, wrapped.length * 3.2);
  }

  doc.setTextColor(102, 112, 133);
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.text(
    "This is a system-generated document and does not require any signature",
    pageWidth / 2,
    Math.min(nextY + 0.5, pageHeight - 8),
    { align: "center" }
  );
}

function drawPdfHeaderAndFooter(doc, logoData, title, subtitle, showOwnerBlock = true){
  drawPdfHeader(doc, logoData, title, subtitle);
  if (showOwnerBlock) {
    drawPdfOwnerBlock(doc, 48);
  } else {
    // Continuation pages: header only — clear owner bottom so tables aren't pushed down
    doc.__tripleMOwnerBlockBottom = 38;
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
      id: entry.id,
      groupId: entry.group_id || null,
      createdAt: entry.created_at || null,
      date: isPrincipal ? (entry.loan_date || "—") : (entry.action_date || "—"),
      type: isPrincipal ? "Principal" : (entry.entry_kind === "partial" ? "Partial" : "Full"),
      amount,
      remainingAfter: runningRemaining,
      note: entry.notes || "—"
    };
  });

  return { personName: normalizedName, direction, currency, principalTotal, paidTotal, remaining, status, loanCount, rows };
}

async function downloadLoanTransactionsSelectionPDF(personNameEncoded, direction, selectedIds = []) {
  if (!window.jspdf) { alert("PDF library loading. Please try again in a moment."); return; }
  const personName = decodeURIComponent(personNameEncoded || "");
  const data = buildPersonPdfData(personName, direction);
  if (!data) { alert("No entries found for this person."); return; }
  const wanted = new Set((selectedIds || []).map(String));
  const rows = wanted.size ? data.rows.filter(r => wanted.has(String(r.id))) : data.rows;
  if (!rows.length) { alert("Select one or more loan transactions."); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  await loadCustomFontsForPdf(doc);
  const logoData = await getPdfLogo();
  const title = rows.length === 1 ? "Loan Transaction Receipt" : "Selected Loan Transactions";
  const subtitle = `${data.personName} · ${direction === "given" ? "Loan Given" : "Loan Taken"}`;
  drawPdfHeader(doc, logoData, title, subtitle);
  const total = rows.reduce((sum,r)=>sum+Number(r.amount||0),0);
  const y = drawCompactPdfPartiesAndMeta(doc, {
    rightLabel: "CLIENT",
    partyName: data.personName,
    meta: [
      { label: "Direction", value: direction === "given" ? "Given" : "Taken" },
      { label: "Currency", value: pdfCurrencyLabel(data.currency) },
      { label: "Selected", value: String(rows.length) },
      { label: "Total", value: formatPdfAmount(total, data.currency) }
    ]
  });
  doc.autoTable({
    startY: y + 5,
    head: [["Date","Type","Notes","Recorded","Amount"]],
    body: rows.map(r => [
      displayDate(r.date), r.type,
      (typeof cleanInstallmentDisplayNote === "function" ? cleanInstallmentDisplayNote(r.note) : String(r.note||"").replace(/\[INSTALLMENT\]/g,"").trim()) || "—",
      r.createdAt ? new Date(r.createdAt).toLocaleString() : "—",
      formatPdfAmount(r.amount, data.currency)
    ]),
    theme:"grid",
    headStyles:{fillColor:[15,23,42],textColor:255,fontStyle:"bold",fontSize:7.6},
    styles:{font:"helvetica",fontSize:7.8,cellPadding:1.8,overflow:"linebreak"},
    columnStyles:{0:{cellWidth:25},1:{cellWidth:24},2:{cellWidth:62},3:{cellWidth:37},4:{cellWidth:32,halign:"right"}},
    margin:{top:42,bottom:32},
    didDrawPage:()=>drawPdfHeaderAndFooter(doc,logoData,title,subtitle,false)
  });
  drawCompactPdfTotals(doc, doc.lastAutoTable.finalY + 5, [{label:"Selected total",value:formatPdfAmount(total,data.currency),strong:true}]);
  doc.save(`Loan_${rows.length===1?"Transaction":"Selected_Transactions"}_${data.personName.replace(/[^a-z0-9_-]+/gi,"_")}.pdf`);
}
window.downloadLoanTransactionsSelectionPDF = downloadLoanTransactionsSelectionPDF;
window.getLoanPersonPdfData = buildPersonPdfData;

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
  const isInstallmentDoc = (data.rows || []).some(r => hasInstallmentTag(r.note));
  const title = isInstallmentDoc ? "Installment Statement" : "Loan Statement";
  const subtitle = `${data.personName}`;
  const formatMon = (amt) => formatPdfAmount(amt, data.currency);

  drawPdfHeader(doc, logoData, title, subtitle);
  const partiesBottom = drawCompactPdfPartiesAndMeta(doc, {
    rightLabel: "CLIENT",
    partyName: data.personName,
    meta: [
      { label: "Status", value: data.status },
      { label: "Currency", value: pdfCurrencyLabel(data.currency) },
      { label: "Entries", value: String(data.loanCount) },
      { label: "Remaining", value: formatMon(data.remaining) }
    ]
  });

  const orderedTableData = data.rows.map((r) => [
    displayDate(r.date),
    r.type,
    (typeof cleanInstallmentDisplayNote === "function" ? cleanInstallmentDisplayNote(r.note) : String(r.note || "").replace(/\[INSTALLMENT\]/g, "").trim()) || "—",
    formatMon(r.amount),
    formatMon(r.remainingAfter)
  ]);

  doc.autoTable({
    startY: partiesBottom + 5,
    head: [["Date", "Type", "Notes", "Amount", "Remaining"]],
    body: orderedTableData,
    theme: "grid",
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold", fontSize: 7.6 },
    styles: { font: "helvetica", fontSize: 7.8, cellPadding: 1.8, overflow: "linebreak" },
    columnStyles: {
      0: { cellWidth: 26 },
      1: { cellWidth: 28 },
      2: { cellWidth: 64 },
      3: { cellWidth: 32, halign: "right" },
      4: { cellWidth: 32, halign: "right" }
    },
    margin: { top: 42, bottom: 32 },
    didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
  });

  drawCompactPdfTotals(doc, doc.lastAutoTable.finalY + 5, [
    { label: "Principal", value: formatMon(data.principalTotal) },
    { label: direction === "given" ? "Received back" : "Paid / returned", value: formatMon(data.paidTotal) },
    { label: "Remaining", value: formatMon(data.remaining), strong: true }
  ]);

  doc.save(`Statement_${data.personName.replace(/\s+/g, "_")}.pdf`);
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
    alert("PDF library loading. Please try again.");
    return;
  }
  await ensureSectionDataLoaded(searchKey, { throwOnError: true });

  const direction = (searchKey === "given" || searchKey === "received") ? "given" : "taken";
  const label = sectionLabel(searchKey);
  const report = buildSectionReportRows(direction, searchKey);
  if (!report.rows.length){
    alert("No entries found for this section.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  await loadCustomFontsForPdf(doc);

  const logoData = await getPdfLogo();
  const title = `${label} Report`;
  const subtitle = `Generated ${new Date().toLocaleString()}`;
  const expensePdf = searchKey === "expenses";

  drawPdfHeader(doc, logoData, title, subtitle);
  const partiesBottom = drawCompactPdfPartiesAndMeta(doc, {
    rightLabel: expensePdf ? "SECTION" : "SUMMARY",
    partyName: label,
    meta: [
      { label: expensePdf ? "Wallets" : "Members", value: String(report.groups.length) },
      { label: "Rows", value: String(report.rows.length) },
      { label: "Generated", value: new Date().toLocaleDateString() }
    ]
  });

  const tableRows = expensePdf
    ? report.rows.map(row => [row[0], row[1], row[row.length > 7 ? 7 : 6], row[2], row[3], row.length > 7 ? row[5] : "-", row[4]])
    : report.rows.map(row => [row[0], row[1], row[2], row.length > 6 ? row[3] : row[5], row.length > 6 ? row[4] : row[3], row.length > 6 ? row[5] : row[4]]);

  const tableHead = expensePdf
    ? [["Item", "Date", "Notes", "Wallet / Type", "Wallet", "VAT", "Amount"]]
    : [["Member", "Date", "Type", "Notes", "Amount", "Remaining"]];

  doc.autoTable({
    startY: partiesBottom + 5,
    head: tableHead,
    body: tableRows,
    theme: "grid",
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold", fontSize: expensePdf ? 7.2 : 7.6 },
    styles: { font: "helvetica", fontSize: expensePdf ? 7.4 : 7.8, cellPadding: expensePdf ? 1.6 : 1.8, overflow: "linebreak" },
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
    margin: { top: 42, bottom: 32 },
    didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
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
  const summaryTop = pdfContentStartY(doc, 72, 6);
  doc.roundedRect(14, summaryTop, 182, 24, 2, 2, "F");
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, summaryTop, 182, 24, 2, 2, "S");
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9.5);
  doc.text(`Total Items: ${goodsAll.length}`, 18, summaryTop + 8);
  doc.text(`Purchase Qty: ${inventoryQtySummary(goodsAll, "boughtQty")}`, 18, summaryTop + 15);
  doc.text(`Sold Qty: ${inventoryQtySummary(goodsAll, "soldQty")}`, 105, summaryTop + 8);
  doc.text(`In Stock: ${inventoryQtySummary(goodsAll, "remainingQty")}`, 105, summaryTop + 15);
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(doc.splitTextToSize(totalsText || "No totals", 174), 18, summaryTop + 22);

  const goodsRows = goodsAll.map(group => [
    group.itemCode || shortId(group.group_id) || "-",
    group.person_name || "Unnamed",
    normalizeInventoryItemType(group.itemType),
    inventoryCategoryLabel(group.itemCategory),
    inventoryQtyLabel(group.boughtQty, group.itemCategory),
    inventoryQtyLabel(group.soldQty, group.itemCategory),
    inventoryQtyLabel(group.remainingQty, group.itemCategory),
    formatPdfAmount(group.bought || 0, group.currency),
    formatPdfAmount(group.soldTotal || 0, group.currency),
    formatPdfAmount((group.purchaseTaxTotal || 0) + (group.salesTaxTotal || 0), group.currency),
    formatPdfAmount(group.profitLoss || 0, group.currency)
  ]);

  doc.autoTable({
    startY: summaryTop + 32,
    head: [["Code", "Item", "Type", "Measure", "Bought", "Sold", "Stock", "Purchase", "Sales", "VAT", "P/L"]],
    body: goodsRows,
    theme: "grid",
    headStyles: { fillColor: [36, 87, 214], textColor: 255, fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 7.1, cellPadding: 1.8, overflow: "linebreak" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 16 },
      1: { cellWidth: 24 },
      2: { cellWidth: 18 },
      3: { cellWidth: 14 },
      4: { cellWidth: 15, halign: "right" },
      5: { cellWidth: 14, halign: "right" },
      6: { cellWidth: 15, halign: "right" },
      7: { cellWidth: 17, halign: "right" },
      8: { cellWidth: 17, halign: "right" },
      9: { cellWidth: 14, halign: "right" },
      10: { cellWidth: 16, halign: "right" }
    },
    margin: { top: 50, bottom: 40 },
    didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
  });

  doc.save("Inventory_Statement.pdf");
}

/** One PDF: summary + all stock + brands with items + detailed item table. */
async function downloadInventoryFullReportPDF(){
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
  await loadCustomFontsForPdf(doc);

  const logoData = await getPdfLogo();
  const title = "Inventory Full Report";
  const subtitle = `Generated: ${new Date().toLocaleString()}`;
  drawPdfHeader(doc, logoData, title, subtitle);
  drawPdfOwnerBlock(doc, 48);

  const totalsByCurrency = goodsAll.reduce((acc, group) => {
    const key = group.currency || "";
    acc[key] = acc[key] || { purchase: 0, sales: 0, tax: 0, profit: 0, loss: 0 };
    acc[key].purchase += Number(group.bought || 0);
    acc[key].sales += Number(group.soldTotal || 0);
    acc[key].tax += Number(group.purchaseTaxTotal || 0) + Number(group.salesTaxTotal || 0);
    const pl = Number(group.profitLoss || 0);
    if (pl >= 0) acc[key].profit += pl;
    else acc[key].loss += Math.abs(pl);
    return acc;
  }, {});
  const totalsText = Object.entries(totalsByCurrency)
    .map(([currency, row]) => `${pdfCurrencyLabel(currency)} Purchase ${formatPdfAmount(row.purchase, currency)} | Sales ${formatPdfAmount(row.sales, currency)} | Profit ${formatPdfAmount(row.profit, currency)} | Loss ${formatPdfAmount(row.loss, currency)}`)
    .join("   ");

  const summaryTop = pdfContentStartY(doc, 72, 6);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, summaryTop, 182, 28, 2, 2, "F");
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, summaryTop, 182, 28, 2, 2, "S");
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.text("1. Summary", 18, summaryTop + 7);
  doc.setFontSize(8.5);
  doc.text(`Items: ${goodsAll.length}   ·   Bought: ${inventoryQtySummary(goodsAll, "boughtQty")}   ·   Sold: ${inventoryQtySummary(goodsAll, "soldQty")}   ·   In stock: ${inventoryQtySummary(goodsAll, "remainingQty")}`, 18, summaryTop + 14);
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(doc.splitTextToSize(totalsText || "No totals", 174), 18, summaryTop + 21);

  const stockRows = goodsAll
    .slice()
    .sort((a, b) => String(a.person_name || "").localeCompare(String(b.person_name || ""), undefined, { sensitivity: "base" }))
    .map(group => {
      const pl = Number(group.profitLoss || 0);
      return [
        group.person_name || "Unnamed",
        inventoryQtyLabel(group.boughtQty, group.itemCategory, group),
        inventoryQtyLabel(group.soldQty, group.itemCategory, group),
        inventoryQtyLabel(group.remainingQty, group.itemCategory, group),
        formatPdfAmount(pl > 0 ? pl : 0, group.currency),
        formatPdfAmount(pl < 0 ? Math.abs(pl) : 0, group.currency)
      ];
    });

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.text("2. All stock", 14, summaryTop + 36);
  doc.autoTable({
    startY: summaryTop + 40,
    head: [["Item", "Total", "Sold", "In stock", "Profit", "Loss"]],
    body: stockRows,
    theme: "grid",
    headStyles: { fillColor: [36, 87, 214], textColor: 255, fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 7.2, cellPadding: 1.6, overflow: "linebreak" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 62 },
      1: { cellWidth: 22, halign: "right" },
      2: { cellWidth: 22, halign: "right" },
      3: { cellWidth: 24, halign: "right" },
      4: { cellWidth: 26, halign: "right" },
      5: { cellWidth: 26, halign: "right" }
    },
    margin: { top: 50, bottom: 40 },
    didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
  });

  // 3. Brands with items
  const byBrand = new Map();
  goodsAll.forEach(group => {
    const brand = String(group.brand || "").trim() || "Unbranded";
    if (!byBrand.has(brand)) byBrand.set(brand, []);
    byBrand.get(brand).push(group);
  });
  const brandNames = [...byBrand.keys()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  doc.addPage();
  drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false);
  let brandY = pdfContentStartY(doc, 50, 6);
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("3. Brands with items", 14, brandY);
  brandY += 4;

  brandNames.forEach((brand, idx) => {
    const items = byBrand.get(brand) || [];
    const rows = items
      .slice()
      .sort((a, b) => String(a.person_name || "").localeCompare(String(b.person_name || ""), undefined, { sensitivity: "base" }))
      .map(group => [
        group.person_name || "Unnamed",
        normalizeInventoryItemType(group.itemType),
        inventoryQtyLabel(group.boughtQty, group.itemCategory, group),
        inventoryQtyLabel(group.soldQty, group.itemCategory, group),
        inventoryQtyLabel(group.remainingQty, group.itemCategory, group),
        formatPdfAmount(group.profitLoss || 0, group.currency)
      ]);
    if (idx > 0 && brandY > 250) {
      doc.addPage();
      drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false);
      brandY = pdfContentStartY(doc, 50, 6);
    }
    doc.autoTable({
      startY: brandY,
      head: [[`${brand} (${items.length})`, "Type", "Total", "Sold", "Stock", "P/L"]],
      body: rows,
      theme: "grid",
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold", fontSize: 7.4 },
      styles: { font: "helvetica", fontSize: 6.9, cellPadding: 1.4, overflow: "linebreak" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 58 },
        1: { cellWidth: 28 },
        2: { cellWidth: 22, halign: "right" },
        3: { cellWidth: 22, halign: "right" },
        4: { cellWidth: 22, halign: "right" },
        5: { cellWidth: 30, halign: "right" }
      },
      margin: { top: 50, bottom: 40 },
      didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
    });
    brandY = (doc.lastAutoTable?.finalY || brandY) + 8;
  });

  // 4. Detailed report
  doc.addPage();
  drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false);
  const detailTop = pdfContentStartY(doc, 50, 6);
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("4. Detailed report", 14, detailTop);
  const detailedRows = goodsAll.map(group => [
    group.itemCode || shortId(group.group_id) || "-",
    group.person_name || "Unnamed",
    String(group.brand || "").trim() || "—",
    normalizeInventoryItemType(group.itemType),
    inventoryCategoryLabel(group.itemCategory),
    inventoryQtyLabel(group.boughtQty, group.itemCategory, group),
    inventoryQtyLabel(group.soldQty, group.itemCategory, group),
    inventoryQtyLabel(group.remainingQty, group.itemCategory, group),
    formatPdfAmount(group.bought || 0, group.currency),
    formatPdfAmount(group.soldTotal || 0, group.currency),
    formatPdfAmount(group.profitLoss || 0, group.currency)
  ]);
  doc.autoTable({
    startY: detailTop + 4,
    head: [["Code", "Item", "Brand", "Type", "Measure", "Bought", "Sold", "Stock", "Purchase", "Sales", "P/L"]],
    body: detailedRows,
    theme: "grid",
    headStyles: { fillColor: [36, 87, 214], textColor: 255, fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 6.6, cellPadding: 1.4, overflow: "linebreak" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 14 },
      1: { cellWidth: 28 },
      2: { cellWidth: 18 },
      3: { cellWidth: 16 },
      4: { cellWidth: 14 },
      5: { cellWidth: 13, halign: "right" },
      6: { cellWidth: 12, halign: "right" },
      7: { cellWidth: 13, halign: "right" },
      8: { cellWidth: 17, halign: "right" },
      9: { cellWidth: 17, halign: "right" },
      10: { cellWidth: 16, halign: "right" }
    },
    margin: { top: 50, bottom: 40 },
    didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
  });

  doc.save("Inventory_Full_Report.pdf");
}

/* ── Asset PDF visual system (modern ink + teal) ─────────────────────────── */
const ASSET_PDF_THEME = {
  ink: [11, 18, 32],
  slate: [30, 41, 59],
  teal: [13, 148, 136],
  tealSoft: [204, 251, 241],
  amber: [245, 158, 11],
  rose: [225, 29, 72],
  emerald: [5, 150, 105],
  mist: [248, 250, 252],
  line: [226, 232, 240],
  muted: [100, 116, 139],
  white: [255, 255, 255]
};

async function ensureAssetsLoadedForPdf(){
  if (typeof canUseAssetsFeature === "function" && !canUseAssetsFeature()) {
    throw new Error("Asset Management is not enabled for your account.");
  }
  if (typeof loadAssetsFromDatabase === "function" && !state.assetsLoaded) {
    await loadAssetsFromDatabase({ force: true });
  }
  if (!(state.assets || []).length) {
    throw new Error("No assets found.");
  }
}

async function ensureAssetDetailsLoadedForPdf(assetIds){
  if (typeof ensureAssetTransactionsLoaded !== "function") return;
  const ids = [...new Set((assetIds || []).map(String).filter(Boolean))];
  for (const id of ids) {
    await ensureAssetTransactionsLoaded(id);
  }
}

async function ensurePdfChartLib(){
  if (window.Chart) return true;
  if (typeof ensureChartLibLoaded === "function") return ensureChartLibLoaded();
  return false;
}

function assetPdfRgb(arr){
  return `rgb(${arr[0]}, ${arr[1]}, ${arr[2]})`;
}

async function renderOffscreenChartPng(buildChart, width = 980, height = 420){
  const ok = await ensurePdfChartLib();
  if (!ok || !window.Chart) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.style.cssText = "position:fixed;left:-99999px;top:0;width:" + width + "px;height:" + height + "px;opacity:0;pointer-events:none;";
  document.body.appendChild(canvas);
  let chart = null;
  try {
    chart = buildChart(canvas);
    if (!chart) return null;
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 40)));
    return canvas.toDataURL("image/png");
  } catch (err) {
    console.warn("Asset PDF chart render failed:", err);
    return null;
  } finally {
    try { chart?.destroy?.(); } catch (_) {}
    try { canvas.remove(); } catch (_) {}
  }
}

function assetPdfBaseChartOptions(){
  return {
    animation: false,
    responsive: false,
    maintainAspectRatio: false,
    layout: { padding: { top: 8, right: 14, bottom: 8, left: 8 } },
    plugins: {
      legend: {
        display: true,
        labels: {
          color: "#334155",
          boxWidth: 10,
          boxHeight: 10,
          usePointStyle: true,
          pointStyle: "circle",
          font: { size: 12, weight: "600" },
          padding: 14
        }
      }
    },
    scales: {
      x: {
        grid: { color: "rgba(148,163,184,.25)", drawBorder: false },
        ticks: { color: "#64748b", font: { size: 11 } }
      },
      y: {
        beginAtZero: true,
        grid: { color: "rgba(148,163,184,.22)", drawBorder: false },
        ticks: { color: "#64748b", font: { size: 11 } }
      }
    }
  };
}

async function renderAssetPdfDonut(labels, values, colors){
  // Square canvas so the ring stays a true circle (not stretched oval in PDF)
  return renderOffscreenChartPng(canvas => new window.Chart(canvas.getContext("2d"), {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderWidth: 4,
        borderColor: "#ffffff",
        hoverOffset: 0
      }]
    },
    options: {
      animation: false,
      responsive: false,
      maintainAspectRatio: false,
      layout: { padding: { top: 12, right: 18, bottom: 8, left: 18 } },
      cutout: "58%",
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "#334155",
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            pointStyle: "circle",
            font: { size: 13, weight: "600" },
            padding: 16
          }
        }
      }
    }
  }), 760, 760);
}

async function renderAssetPdfBars(labels, datasets, { horizontal = false } = {}){
  const opts = assetPdfBaseChartOptions();
  if (horizontal) {
    opts.indexAxis = "y";
  }
  return renderOffscreenChartPng(canvas => new window.Chart(canvas.getContext("2d"), {
    type: "bar",
    data: { labels, datasets },
    options: {
      ...opts,
      plugins: {
        ...opts.plugins,
        legend: { display: datasets.length > 1, labels: opts.plugins.legend.labels }
      }
    }
  }), 1200, 480);
}

async function renderAssetPdfLines(labels, datasets){
  return renderOffscreenChartPng(canvas => new window.Chart(canvas.getContext("2d"), {
    type: "line",
    data: { labels, datasets },
    options: {
      ...assetPdfBaseChartOptions(),
      elements: {
        line: { tension: 0.32, borderWidth: 3, borderJoinStyle: "round" },
        point: { radius: 3.2, hoverRadius: 5, borderWidth: 2, backgroundColor: "#fff" }
      }
    }
  }), 1200, 480);
}

async function renderAssetPdfCandles(labels, candles){
  if (!labels.length || !candles.length) return null;
  if (typeof createDashboardCandlestickChart === "function") {
    return renderOffscreenChartPng(canvas => {
      return createDashboardCandlestickChart(canvas, labels, candles, {
        ...assetPdfBaseChartOptions(),
        plugins: { legend: { display: false } }
      }, "assets-pdf");
    }, 1200, 500);
  }
  const bodyData = candles.map(c => [Math.min(c.o, c.c), Math.max(c.o, c.c)]);
  const colors = candles.map(c => Number(c.c) >= Number(c.o) ? "#059669" : "#e11d48");
  return renderOffscreenChartPng(canvas => new window.Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels,
      datasets: [{ data: bodyData, backgroundColor: colors, borderWidth: 0, maxBarThickness: 20 }]
    },
    options: {
      ...assetPdfBaseChartOptions(),
      plugins: { legend: { display: false } }
    }
  }), 1200, 500);
}

function buildAssetMonthKeysAndCandles(monthMap){
  const keys = [...(monthMap?.keys?.() ? monthMap.keys() : [])].filter(Boolean).sort();
  const candles = typeof buildCashflowCandles === "function"
    ? buildCashflowCandles(keys, monthMap, row => Number(row.revenue || 0), row => Number(row.expense || 0))
    : [];
  const labels = keys.map(k => {
    if (typeof sectionDetailsMonthLabel === "function") return sectionDetailsMonthLabel(k);
    return k;
  });
  return { keys, labels, candles };
}

function assetPdfSafeText(value){
  // Helvetica/WinAnsi: Unicode minus/dashes/middots break glyph widths (spaced "A E D 1 , 2 9 9")
  return String(value ?? "")
    .replace(/[\u2212\u2013\u2014\u2015]/g, "-")
    .replace(/[\u00B7\u2022\u2027\u22C5]/g, "-")
    .replace(/[\u2060\u2061\u200B\u200C\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function assetPdfHeaderHeight(cover = false){
  return cover ? 36 : 28;
}

function drawAssetPdfPageChrome(doc, logoData, title, subtitle, { cover = false, fullBleed = true } = {}){
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const T = ASSET_PDF_THEME;
  const headerH = assetPdfHeaderHeight(cover);
  const safeTitle = assetPdfSafeText(title || "Asset report");
  const safeSubtitle = assetPdfSafeText(subtitle || "");

  if (fullBleed) {
    // Pure white page canvas (tables provide their own row fills)
    doc.setFillColor(...T.white);
    doc.rect(0, 0, pageW, pageH, "F");
  }

  // Light header band — always redrawn above table rows; keep all text inside this band
  doc.setFillColor(...T.white);
  doc.rect(0, 0, pageW, headerH, "F");
  doc.setFillColor(...T.tealSoft);
  doc.rect(0, 0, pageW, 2, "F");
  doc.setDrawColor(...T.line);
  doc.setLineWidth(0.3);
  doc.line(0, headerH, pageW, headerH);

  if (logoData) {
    drawFittedPdfImage(doc, logoData, 10, cover ? 8 : 6, 26, cover ? 18 : 14, { align: "left", valign: "middle" });
  }

  const titleX = 42;
  const titleMaxW = pageW - titleX - 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(cover ? 11 : 9.5);
  doc.setTextColor(...T.ink);
  // Single-line titles only — wrapping caused clipping under/behind the header band
  const titleLine = (doc.splitTextToSize(safeTitle, titleMaxW)[0] || "").slice(0, 90);
  doc.text(titleLine, titleX, cover ? 15 : 12.5);
  if (safeSubtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(...T.muted);
    const subLine = (doc.splitTextToSize(safeSubtitle, titleMaxW)[0] || "").slice(0, 100);
    doc.text(subLine, titleX, cover ? 23 : 20);
  }

  // Light footer
  const footerH = 12;
  doc.setFillColor(...T.white);
  doc.rect(0, pageH - footerH, pageW, footerH, "F");
  doc.setDrawColor(...T.line);
  doc.setLineWidth(0.3);
  doc.line(0, pageH - footerH, pageW, pageH - footerH);
  doc.setFillColor(...T.tealSoft);
  doc.rect(0, pageH - footerH, pageW, 1.2, "F");
  doc.setTextColor(...T.muted);
  doc.setFontSize(6.6);
  doc.setFont("helvetica", "normal");
  const pageNo = doc.internal.getNumberOfPages();
  doc.text("TRIPLEM VIP - Asset Intelligence", 12, pageH - 4.5);
  doc.text(`Page ${pageNo}`, pageW - 12, pageH - 4.5, { align: "right" });
}

function drawAssetPdfTableChrome(doc, logoData, title, subtitle){
  // Header/footer only — never wipe table body
  drawAssetPdfPageChrome(doc, logoData, title, subtitle, { cover: false, fullBleed: false });
}

function drawAssetPdfSectionLabel(doc, text, x, y){
  const T = ASSET_PDF_THEME;
  doc.setFillColor(...T.teal);
  doc.roundedRect(x, y - 3.2, 2.2, 6.2, 0.6, 0.6, "F");
  doc.setTextColor(...T.ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(assetPdfSafeText(text || ""), x + 5, y + 1);
  return y + 7;
}

/**
 * Section label + primary title sharing one green accent bar (no collision).
 * Returns y below the block.
 */
function drawAssetPdfHeadingBlock(doc, label, title, x, y, maxWidth){
  const T = ASSET_PDF_THEME;
  const textX = x + 5;
  const textW = Math.max(40, (maxWidth || 170) - 5);
  const safeLabel = assetPdfSafeText(label || "");
  const safeTitle = assetPdfSafeText(title || "");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  const labelH = 4.2;
  doc.setFontSize(12);
  const titleLines = doc.splitTextToSize(safeTitle, textW).slice(0, 2);
  const titleLineH = 5.2;
  const titleBlockH = Math.max(titleLineH, titleLines.length * titleLineH);
  const gap = 2.2;
  const padTop = 1.2;
  const padBot = 1.4;
  const blockH = padTop + labelH + gap + titleBlockH + padBot;
  const barTop = y - padTop;

  doc.setFillColor(...T.teal);
  doc.roundedRect(x, barTop, 2.2, blockH, 0.6, 0.6, "F");

  let cursor = y + 1;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...T.slate);
  doc.text(safeLabel, textX, cursor);
  cursor += labelH + gap;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...T.ink);
  titleLines.forEach((line, i) => {
    doc.text(line, textX, cursor + (i * titleLineH));
  });

  return barTop + blockH + 3;
}

function drawAssetPdfKpiCards(doc, cards, x, y, width){
  const T = ASSET_PDF_THEME;
  const gap = 3.5;
  const n = Math.max(1, cards.length);
  const cardW = (width - gap * (n - 1)) / n;
  cards.forEach((card, i) => {
    const cx = x + i * (cardW + gap);
    doc.setFillColor(...T.white);
    doc.setDrawColor(...T.line);
    doc.setLineWidth(0.2);
    doc.roundedRect(cx, y, cardW, 22, 2.5, 2.5, "FD");
    doc.setFillColor(...(card.accent || T.teal));
    doc.roundedRect(cx, y, 2.2, 22, 1, 1, "F");
    doc.setTextColor(...T.muted);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.4);
    doc.text(assetPdfSafeText(String(card.label || "").toUpperCase()), cx + 6, y + 7);
    doc.setTextColor(...T.ink);
    doc.setFontSize(8.6);
    doc.text(assetPdfSafeText(String(card.value || "-")), cx + 6, y + 15);
  });
  return y + 26;
}

function drawAssetPdfPanel(doc, x, y, w, h, title){
  const T = ASSET_PDF_THEME;
  const titleBand = 12;
  doc.setFillColor(...T.white);
  doc.setDrawColor(...T.line);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, w, h, 3, 3, "FD");
  // Soft title strip — keep label fully above chart content
  doc.setFillColor(...T.mist);
  doc.roundedRect(x, y, w, titleBand, 3, 3, "F");
  doc.setFillColor(...T.white);
  doc.rect(x, y + titleBand - 2.5, w, 2.5, "F");
  doc.setTextColor(...T.slate);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.6);
  doc.text(assetPdfSafeText(title || ""), x + 5, y + 7.2);
  return {
    contentX: x + 4,
    contentY: y + titleBand + 1.5,
    contentW: w - 8,
    contentH: h - titleBand - 5.5
  };
}

function embedAssetPdfImage(doc, dataUrl, x, y, w, h, { fit = "fill" } = {}){
  const T = ASSET_PDF_THEME;
  if (!dataUrl) {
    doc.setFillColor(...T.mist);
    doc.roundedRect(x, y, w, h, 2, 2, "F");
    doc.setTextColor(...T.muted);
    doc.setFontSize(8);
    doc.text("Chart unavailable", x + w / 2, y + h / 2, { align: "center" });
    return;
  }
  let drawW = w;
  let drawH = h;
  let drawX = x;
  let drawY = y;
  // Keep circular charts circular: fit as a centered square inside the panel
  if (fit === "square") {
    const side = Math.min(w, h);
    drawW = side;
    drawH = side;
    drawX = x + (w - side) / 2;
    drawY = y + (h - side) / 2;
  } else if (fit === "contain") {
    // Preserve chart aspect (wide charts) inside panel
    const srcRatio = 1200 / 480;
    const boxRatio = w / Math.max(h, 0.01);
    if (boxRatio > srcRatio) {
      drawH = h;
      drawW = h * srcRatio;
      drawX = x + (w - drawW) / 2;
    } else {
      drawW = w;
      drawH = w / srcRatio;
      drawY = y + (h - drawH) / 2;
    }
  }
  try {
    doc.addImage(dataUrl, "PNG", drawX, drawY, drawW, drawH);
  } catch (_) {}
}

function assetPdfContentWidth(){
  return 182;
}

function assetPdfSideMargin(doc){
  const pageW = doc.internal.pageSize.getWidth();
  return (pageW - assetPdfContentWidth()) / 2;
}

function assetPdfLayout(doc){
  const side = assetPdfSideMargin(doc);
  const width = assetPdfContentWidth();
  const gap = 4;
  const half = (width - gap) / 2;
  return {
    side,
    width,
    gap,
    half,
    leftX: side,
    rightX: side + half + gap
  };
}

function assetPdfTableTheme(doc, _headRgb = ASSET_PDF_THEME.tealSoft){
  const side = assetPdfSideMargin(doc);
  const contentW = assetPdfContentWidth();
  const headerH = assetPdfHeaderHeight(false);
  const softLine = [226, 232, 240];
  // Match original asset PDF palette
  const headFill = [204, 251, 241]; // soft teal (page theme)
  const altFill = [248, 250, 252];  // light stripe
  const whiteFill = [255, 255, 255];
  return {
    theme: "grid",
    tableWidth: contentW,
    preserveRowFills: true,
    headStyles: {
      fillColor: headFill,
      textColor: [15, 118, 110],
      fontStyle: "bold",
      fontSize: 7.2,
      font: "helvetica",
      cellPadding: { top: 2.4, right: 2.1, bottom: 2.4, left: 2.1 },
      halign: "center",
      valign: "middle",
      lineColor: softLine,
      lineWidth: 0.18
    },
    bodyStyles: {
      valign: "middle",
      font: "helvetica",
      lineColor: softLine,
      lineWidth: 0.18,
      fillColor: whiteFill
    },
    styles: {
      font: "helvetica",
      fontSize: 7.1,
      cellPadding: { top: 2.3, right: 2.1, bottom: 2.3, left: 2.1 },
      textColor: [30, 41, 59],
      lineColor: softLine,
      lineWidth: 0.18,
      overflow: "linebreak",
      valign: "middle",
      fillColor: whiteFill
    },
    alternateRowStyles: {
      fillColor: altFill,
      lineColor: softLine,
      lineWidth: 0.18
    },
    margin: { top: headerH + 6, left: side, right: side, bottom: 16 },
    didParseCell(data){
      const raw = data?.cell?.text;
      if (Array.isArray(raw)) {
        data.cell.text = raw.map(line => assetPdfSafeText(line));
      } else if (raw != null) {
        data.cell.text = assetPdfSafeText(raw);
      }
      if (data.section === "head") {
        data.cell.styles.lineColor = softLine;
        data.cell.styles.lineWidth = 0.18;
        data.cell.styles.fillColor = headFill;
        data.cell.styles.textColor = [15, 118, 110];
      }
      if (data.section === "body") {
        data.cell.styles.lineColor = softLine;
        data.cell.styles.lineWidth = 0.18;
        data.cell.styles.fillColor = (data.row.index % 2 === 1) ? altFill : whiteFill;
        const txt = String(Array.isArray(data.cell.text) ? data.cell.text.join("") : (data.cell.text || "")).trim();
        if (/^\+[A-Z]{3}\s/.test(txt)) {
          data.cell.styles.textColor = ASSET_PDF_THEME.emerald;
          data.cell.styles.fontStyle = "bold";
        } else if (/^-[A-Z]{3}\s/.test(txt)) {
          data.cell.styles.textColor = ASSET_PDF_THEME.rose;
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
    willDrawCell(data){
      // Paint row fill explicitly so zebra stripes always show
      let fill = null;
      if (data.section === "head") fill = headFill;
      else if (data.section === "body") fill = (data.row.index % 2 === 1) ? altFill : whiteFill;
      if (fill) {
        doc.setFillColor(...fill);
        doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, "F");
        data.cell.styles.fillColor = false;
      }
      data.cell.styles.lineColor = softLine;
    }
  };
}

function assetPdfIsRevenueTx(tx){
  return String(tx?.tx_type || tx?.txType || "").toLowerCase() === "revenue";
}

function assetPdfIsExpenseTx(tx){
  const type = String(tx?.tx_type || tx?.txType || "").toLowerCase();
  const set = window.TripleMAssetMath?.EXPENSE_TX_TYPES;
  if (set && typeof set.has === "function") return set.has(type);
  return ["maintenance", "repair", "operating", "other_expense", "additional_investment"].includes(type);
}

function assetPdfSignedAmount(tx, currency){
  // ASCII +/- only — Unicode minus breaks jsPDF Helvetica width metrics
  const abs = Math.abs(Number(tx?.amount) || 0);
  const formatted = assetPdfSafeText(formatPdfAmount(abs, currency));
  const sign = assetPdfIsRevenueTx(tx) ? "+" : "-";
  return `${sign}${formatted}`;
}

function assetPdfTxRows(txs, currency, { emptyNote = "No transactions recorded" } = {}){
  const rows = Array.isArray(txs) ? txs.filter(t => !t?.is_deleted) : [];
  if (!rows.length) {
    return [["-", "-", "0", assetPdfSafeText(emptyNote)]];
  }
  return rows.map(tx => [
    assetPdfSafeText(tx.tx_date || "-"),
    assetPdfSafeText(typeof assetTxTypeLabel === "function" ? assetTxTypeLabel(tx.tx_type, tx.tx_label) : (tx.tx_type || "-")),
    assetPdfSignedAmount(tx, currency),
    assetPdfSafeText(tx.notes || "")
  ]);
}

function assetPdfTxAmountColumnStyles(){
  // Keep amount on one line; wide enough for "-AED 12,345.67"
  return {
    cellWidth: 44,
    halign: "right",
    fontStyle: "bold",
    font: "helvetica",
    overflow: "hidden",
    cellPadding: { top: 2.4, right: 2.4, bottom: 2.4, left: 1.5 }
  };
}

function assetPdfSafeFilename(name){
  return String(name || "Asset").replace(/[^\w\-]+/g, "_").slice(0, 42);
}

function getAssetsPortfolioForPdf(currencyHint = ""){
  if (typeof collectAssetPortfolioRows === "function") {
    return collectAssetPortfolioRows(currencyHint || (typeof assetsDetailsSelectedCurrency !== "undefined" ? assetsDetailsSelectedCurrency : "") || "");
  }
  return { rows: [], totals: {}, selectedCurrency: "AED", count: 0, monthMap: new Map(), currencies: [] };
}

async function buildAssetPdfChartPack(data){
  const t = data.totals || {};
  const cur = data.selectedCurrency || "AED";
  const { labels: monthLabels, candles, keys: monthKeys } = buildAssetMonthKeysAndCandles(data.monthMap || new Map());
  const statusDonut = await renderAssetPdfDonut(
    ["Active", "Sold", "Disposed"],
    [t.status?.active || 0, t.status?.sold || 0, t.status?.disposed || 0],
    ["#0d9488", "#2563eb", "#64748b"]
  );
  const mixDonut = await renderAssetPdfDonut(
    ["Purchase", "Maintenance", "Repair", "Operating", "Other", "Extra invest.", "Sale costs"],
    [t.purchase || 0, t.maintenance || 0, t.repair || 0, t.operating || 0, t.otherExpense || 0, t.additionalInvestment || 0, t.saleCosts || 0],
    ["#0f172a", "#f59e0b", "#e11d48", "#8b5cf6", "#64748b", "#0ea5e9", "#ec4899"]
  );
  const performanceBars = await renderAssetPdfBars(
    ["Purchase", "Invested", "Revenue", "Sale", "Net"],
    [{
      label: cur,
      data: [t.purchase || 0, t.investedSpent || 0, t.revenue || 0, t.sale || 0, t.net || 0],
      backgroundColor: ["#0f172a", "#e11d48", "#0ea5e9", "#059669", (t.net || 0) >= 0 ? "#059669" : "#e11d48"],
      borderRadius: 8,
      maxBarThickness: 42
    }]
  );
  const monthlyLines = await renderAssetPdfLines(
    monthLabels.length ? monthLabels : ["—"],
    [
      {
        label: "Revenue",
        data: monthKeys.length ? monthKeys.map(k => Number(data.monthMap.get(k)?.revenue || 0)) : [0],
        borderColor: "#0ea5e9",
        backgroundColor: "rgba(14,165,233,.18)",
        fill: true,
        tension: 0.3
      },
      {
        label: "Expenses",
        data: monthKeys.length ? monthKeys.map(k => Number(data.monthMap.get(k)?.expense || 0)) : [0],
        borderColor: "#e11d48",
        backgroundColor: "rgba(225,29,72,.12)",
        fill: true,
        tension: 0.3
      }
    ]
  );
  const candleImg = await renderAssetPdfCandles(monthLabels, candles);
  const topNet = (data.rows || []).slice().sort((a, b) => Math.abs(Number(b.sum?.net || 0)) - Math.abs(Number(a.sum?.net || 0))).slice(0, 8);
  const netByAsset = await renderAssetPdfBars(
    topNet.length ? topNet.map(r => r.asset.name) : ["—"],
    [{
      label: "Net P/L",
      data: topNet.length ? topNet.map(r => Number(r.sum?.net || 0)) : [0],
      backgroundColor: topNet.map(r => Number(r.sum?.net || 0) >= 0 ? "#059669" : "#e11d48"),
      borderRadius: 6,
      maxBarThickness: 26
    }]
  );
  return { statusDonut, mixDonut, performanceBars, monthlyLines, candleImg, netByAsset, monthLabels, candles };
}

async function downloadAssetsSummaryPDF(){
  if (!window.jspdf) {
    alert("PDF library loading. Please try again in a moment.");
    return;
  }
  await ensureAssetsLoadedForPdf();
  const data = getAssetsPortfolioForPdf();
  const cur = data.selectedCurrency || "AED";
  const t = data.totals || {};
  const charts = await buildAssetPdfChartPack(data);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  await loadCustomFontsForPdf(doc);
  const logoData = await getPdfLogo();
  const title = "Asset Intelligence · Summary";
  const subtitle = `${new Date().toLocaleString()}  ·  ${cur} portfolio  ·  ${data.count} assets`;

  drawAssetPdfPageChrome(doc, logoData, title, subtitle, { cover: true });
  const L = assetPdfLayout(doc);
  let y = 56;
  y = drawAssetPdfSectionLabel(doc, "Executive snapshot", L.leftX, y);
  y = drawAssetPdfKpiCards(doc, [
    { label: "Purchase", value: formatPdfAmount(t.purchase || 0, cur), accent: ASSET_PDF_THEME.ink },
    { label: "Invested / spent", value: formatPdfAmount(t.investedSpent || 0, cur), accent: ASSET_PDF_THEME.rose },
    { label: "Revenue", value: formatPdfAmount(t.revenue || 0, cur), accent: ASSET_PDF_THEME.teal },
    { label: "Net P/L", value: formatPdfAmount(t.net || 0, cur), accent: (t.net || 0) >= 0 ? ASSET_PDF_THEME.emerald : ASSET_PDF_THEME.rose }
  ], L.leftX, y, L.width);

  doc.setTextColor(...ASSET_PDF_THEME.muted);
  doc.setFontSize(7.5);
  doc.text(`Active ${t.status?.active || 0}  ·  Sold ${t.status?.sold || 0}  ·  Disposed ${t.status?.disposed || 0}  ·  Sale proceeds ${formatPdfAmount(t.sale || 0, cur)}`, L.leftX, y);
  y += 6;

  const left = drawAssetPdfPanel(doc, L.leftX, y, L.half, 78, "Ownership status");
  embedAssetPdfImage(doc, charts.statusDonut, left.contentX, left.contentY, left.contentW, left.contentH - 2, { fit: "square" });
  const right = drawAssetPdfPanel(doc, L.rightX, y, L.half, 78, "Income vs investment");
  embedAssetPdfImage(doc, charts.performanceBars, right.contentX, right.contentY, right.contentW, right.contentH - 2, { fit: "contain" });
  y += 84;

  const candlePanel = drawAssetPdfPanel(doc, L.leftX, y, L.width, 72, "Portfolio equity candles (monthly OHLC)");
  embedAssetPdfImage(doc, charts.candleImg, candlePanel.contentX, candlePanel.contentY, candlePanel.contentW, candlePanel.contentH - 2, { fit: "contain" });

  // Page 2 — table + monthly trend
  doc.addPage();
  drawAssetPdfPageChrome(doc, logoData, title, subtitle);
  y = 44;
  y = drawAssetPdfSectionLabel(doc, "Monthly performance", L.leftX, y);
  const monthPanel = drawAssetPdfPanel(doc, L.leftX, y, L.width, 70, "Revenue & expenses over time");
  embedAssetPdfImage(doc, charts.monthlyLines, monthPanel.contentX, monthPanel.contentY, monthPanel.contentW, monthPanel.contentH - 2, { fit: "contain" });
  y += 76;
  y = drawAssetPdfSectionLabel(doc, "Asset scorecard", L.leftX, y);

  doc.autoTable({
    startY: y,
    head: [["Asset", "Type", "Status", "Owned", "Invested", "Revenue", "Net"]],
    body: (data.rows || []).map(row => [
      row.asset.name || "—",
      typeof assetTypeLabel === "function" ? assetTypeLabel(row.asset.asset_type, row.asset.asset_type_other) : row.asset.asset_type,
      typeof assetStatusLabel === "function" ? assetStatusLabel(row.asset.status) : row.asset.status,
      row.sum?.ownership?.label || "—",
      formatPdfAmount(row.sum?.investedSpent || 0, cur),
      formatPdfAmount(row.sum?.revenue || 0, cur),
      formatPdfAmount(row.sum?.net || 0, cur)
    ]),
    ...assetPdfTableTheme(doc, ASSET_PDF_THEME.ink),
    columnStyles: {
      0: { cellWidth: 36 },
      1: { cellWidth: 30 },
      2: { cellWidth: 24, halign: "center" },
      3: { cellWidth: 22, halign: "center" },
      4: { cellWidth: 24, halign: "right" },
      5: { cellWidth: 24, halign: "right" },
      6: { cellWidth: 22, halign: "right" }
    },
    didDrawPage: () => drawAssetPdfTableChrome(doc, logoData, title, subtitle)
  });

  doc.save(`Assets_Summary_${cur}.pdf`);
}

async function downloadAssetsDetailsPDF(){
  await ensureAssetsLoadedForPdf();
  await ensureAssetDetailsLoadedForPdf((state.assets || []).map(asset => asset.id));
  if (!window.jspdf) {
    alert("PDF library loading. Please try again in a moment.");
    return;
  }
  await ensureAssetsLoadedForPdf();
  const data = getAssetsPortfolioForPdf();
  const cur = data.selectedCurrency || "AED";
  const t = data.totals || {};
  const charts = await buildAssetPdfChartPack(data);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  await loadCustomFontsForPdf(doc);
  const logoData = await getPdfLogo();
  const title = "Asset Intelligence · Detailed";
  const subtitle = `${new Date().toLocaleString()}  ·  ${cur}  ·  full breakdown + charts`;

  drawAssetPdfPageChrome(doc, logoData, title, subtitle, { cover: true });
  const L = assetPdfLayout(doc);
  let y = 56;
  y = drawAssetPdfSectionLabel(doc, "Capital structure", L.leftX, y);
  y = drawAssetPdfKpiCards(doc, [
    { label: "Purchase", value: formatPdfAmount(t.purchase || 0, cur), accent: ASSET_PDF_THEME.ink },
    { label: "Upkeep total", value: formatPdfAmount((t.maintenance || 0) + (t.repair || 0) + (t.operating || 0) + (t.otherExpense || 0), cur), accent: ASSET_PDF_THEME.amber },
    { label: "Extra invest.", value: formatPdfAmount(t.additionalInvestment || 0, cur), accent: ASSET_PDF_THEME.teal },
    { label: "Sale costs", value: formatPdfAmount(t.saleCosts || 0, cur), accent: ASSET_PDF_THEME.rose }
  ], L.leftX, y, L.width);

  const mixPanel = drawAssetPdfPanel(doc, L.leftX, y, L.half, 82, "Expense composition");
  embedAssetPdfImage(doc, charts.mixDonut, mixPanel.contentX, mixPanel.contentY, mixPanel.contentW, mixPanel.contentH - 2, { fit: "square" });
  const statusPanel = drawAssetPdfPanel(doc, L.rightX, y, L.half, 82, "Status mix");
  embedAssetPdfImage(doc, charts.statusDonut, statusPanel.contentX, statusPanel.contentY, statusPanel.contentW, statusPanel.contentH - 2, { fit: "square" });
  y += 88;

  doc.autoTable({
    startY: y,
    head: [["Financial metric", "Amount"]],
    body: [
      ["Purchase price", formatPdfAmount(t.purchase || 0, cur)],
      ["Invested / spent", formatPdfAmount(t.investedSpent || 0, cur)],
      ["Total revenue", formatPdfAmount(t.revenue || 0, cur)],
      ["Sale proceeds", formatPdfAmount(t.sale || 0, cur)],
      ["Net profit / loss", formatPdfAmount(t.net || 0, cur)],
      ["Maintenance", formatPdfAmount(t.maintenance || 0, cur)],
      ["Repairs", formatPdfAmount(t.repair || 0, cur)],
      ["Operating", formatPdfAmount(t.operating || 0, cur)],
      ["Other expenses", formatPdfAmount(t.otherExpense || 0, cur)]
    ],
    ...assetPdfTableTheme(doc, ASSET_PDF_THEME.teal),
    columnStyles: { 0: { cellWidth: 110 }, 1: { cellWidth: 72, halign: "right" } },
    didDrawPage: () => drawAssetPdfTableChrome(doc, logoData, title, subtitle)
  });

  doc.addPage();
  drawAssetPdfPageChrome(doc, logoData, title, subtitle);
  y = 44;
  y = drawAssetPdfSectionLabel(doc, "Market-style analytics", L.leftX, y);
  const candlePanel = drawAssetPdfPanel(doc, L.leftX, y, L.width, 74, "Equity candles · monthly open / high / low / close");
  embedAssetPdfImage(doc, charts.candleImg, candlePanel.contentX, candlePanel.contentY, candlePanel.contentW, candlePanel.contentH - 2, { fit: "contain" });
  y += 80;
  const monthPanel = drawAssetPdfPanel(doc, L.leftX, y, L.width, 68, "Revenue vs expenses");
  embedAssetPdfImage(doc, charts.monthlyLines, monthPanel.contentX, monthPanel.contentY, monthPanel.contentW, monthPanel.contentH - 2, { fit: "contain" });

  doc.addPage();
  drawAssetPdfPageChrome(doc, logoData, title, subtitle);
  y = 44;
  y = drawAssetPdfSectionLabel(doc, "Asset-level net results", L.leftX, y);
  const netPanel = drawAssetPdfPanel(doc, L.leftX, y, L.width, 70, "Top assets by absolute net");
  embedAssetPdfImage(doc, charts.netByAsset, netPanel.contentX, netPanel.contentY, netPanel.contentW, netPanel.contentH - 2, { fit: "contain" });
  y += 76;
  y = drawAssetPdfSectionLabel(doc, "Detailed asset ledger", L.leftX, y);

  doc.autoTable({
    startY: y,
    head: [["Asset", "Status", "Purchase", "Invested", "Revenue", "Sale", "Net", "Owned"]],
    body: (data.rows || []).map(row => [
      row.asset.name || "—",
      typeof assetStatusLabel === "function" ? assetStatusLabel(row.asset.status) : row.asset.status,
      formatPdfAmount(row.sum?.purchasePrice || 0, cur),
      formatPdfAmount(row.sum?.investedSpent || 0, cur),
      formatPdfAmount(row.sum?.revenue || 0, cur),
      formatPdfAmount(row.sum?.salePrice || 0, cur),
      formatPdfAmount(row.sum?.net || 0, cur),
      `${row.sum?.ownership?.label || "—"} (${row.sum?.ownership?.days || 0}d)`
    ]),
    ...assetPdfTableTheme(doc, ASSET_PDF_THEME.ink),
    styles: { ...assetPdfTableTheme(doc, ASSET_PDF_THEME.ink).styles, fontSize: 6.5 },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: 18, halign: "center" },
      2: { cellWidth: 22, halign: "right" },
      3: { cellWidth: 22, halign: "right" },
      4: { cellWidth: 22, halign: "right" },
      5: { cellWidth: 20, halign: "right" },
      6: { cellWidth: 22, halign: "right" },
      7: { cellWidth: 24, halign: "center" }
    },
    didDrawPage: () => drawAssetPdfTableChrome(doc, logoData, title, subtitle)
  });

  doc.save(`Assets_Details_${cur}.pdf`);
}

async function downloadAssetsAssetWisePDF(){
  await ensureAssetsLoadedForPdf();
  await ensureAssetDetailsLoadedForPdf((state.assets || []).map(asset => asset.id));
  if (!window.jspdf) {
    alert("PDF library loading. Please try again in a moment.");
    return;
  }
  await ensureAssetsLoadedForPdf();
  const data = getAssetsPortfolioForPdf();
  const cur = data.selectedCurrency || "AED";
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  await loadCustomFontsForPdf(doc);
  const logoData = await getPdfLogo();
  const title = "Asset Intelligence · Asset-wise";
  const subtitle = `${new Date().toLocaleString()}  ·  ${cur}  ·  one dossier per asset`;

  const rows = data.rows || [];
  for (let index = 0; index < rows.length; index += 1) {
    if (index > 0) doc.addPage();
    const row = rows[index];
    await renderSingleAssetPdfPages(doc, logoData, row.asset, row.txs || [], row.sum || {}, {
      title,
      subtitle: `${subtitle}  ·  ${index + 1}/${rows.length}`,
      cover: index === 0,
      indexLabel: `${index + 1}. `
    });
  }

  doc.save(`Assets_AssetWise_${cur}.pdf`);
}

async function downloadSingleAssetPDF(assetId){
  if (!window.jspdf) {
    alert("PDF library loading. Please try again in a moment.");
    return;
  }
  await ensureAssetsLoadedForPdf();
  await ensureAssetDetailsLoadedForPdf([assetId]);
  const asset = typeof getAssetById === "function" ? getAssetById(assetId) : null;
  if (!asset) throw new Error("Asset not found.");
  const txs = typeof getAssetTransactions === "function" ? getAssetTransactions(assetId) : [];
  const sum = (window.TripleMAssetMath?.summarizeAsset?.(asset, txs)) || {};
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  await loadCustomFontsForPdf(doc);
  const logoData = await getPdfLogo();
  const title = `Asset Dossier - ${asset.name}`;
  const subtitle = `${new Date().toLocaleString()}  |  ${asset.currency || "AED"}`;
  await renderSingleAssetPdfPages(doc, logoData, asset, txs, sum, { title, subtitle, cover: true, indexLabel: "" });
  doc.save(`Asset_${assetPdfSafeFilename(asset.name)}.pdf`);
}

async function renderSingleAssetPdfPages(doc, logoData, asset, txs, sum, meta = {}){
  const cur = asset.currency || "AED";
  const title = meta.title || `Asset - ${asset.name}`;
  const subtitle = meta.subtitle || new Date().toLocaleString();
  const type = typeof assetTypeLabel === "function" ? assetTypeLabel(asset.asset_type, asset.asset_type_other) : asset.asset_type;
  const status = typeof assetStatusLabel === "function" ? assetStatusLabel(asset.status) : asset.status;
  const liveTxs = (Array.isArray(txs) ? txs : []).filter(t => !t?.is_deleted);

  const monthMap = new Map();
  (window.TripleMAssetMath?.monthlyBuckets?.(liveTxs) || []).forEach(m => {
    monthMap.set(m.month, { revenue: m.revenue || 0, expense: m.expense || 0 });
  });
  const { labels: monthLabels, candles, keys: monthKeys } = buildAssetMonthKeysAndCandles(monthMap);

  const mixDonut = await renderAssetPdfDonut(
    ["Purchase", "Maintenance", "Repair", "Operating", "Other", "Extra", "Sale costs"],
    [sum.purchasePrice || 0, sum.maintenance || 0, sum.repair || 0, sum.operating || 0, sum.otherExpense || 0, sum.additionalInvestment || 0, sum.saleCosts || 0],
    ["#0f172a", "#f59e0b", "#e11d48", "#8b5cf6", "#64748b", "#0ea5e9", "#ec4899"]
  );
  const perfBars = await renderAssetPdfBars(
    ["Purchase", "Invested", "Revenue", "Sale", "Net"],
    [{
      label: cur,
      data: [sum.purchasePrice || 0, sum.investedSpent || 0, sum.revenue || 0, sum.salePrice || 0, sum.net || 0],
      backgroundColor: ["#0f172a", "#e11d48", "#0ea5e9", "#059669", (sum.net || 0) >= 0 ? "#059669" : "#e11d48"],
      borderRadius: 8,
      maxBarThickness: 36
    }]
  );
  const monthlyLines = await renderAssetPdfLines(
    monthLabels.length ? monthLabels : ["—"],
    [
      {
        label: "Revenue",
        data: monthKeys.length ? monthKeys.map(k => Number(monthMap.get(k)?.revenue || 0)) : [0],
        borderColor: "#0ea5e9",
        backgroundColor: "rgba(14,165,233,.16)",
        fill: true
      },
      {
        label: "Expenses",
        data: monthKeys.length ? monthKeys.map(k => Number(monthMap.get(k)?.expense || 0)) : [0],
        borderColor: "#e11d48",
        backgroundColor: "rgba(225,29,72,.12)",
        fill: true
      }
    ]
  );
  const candleImg = await renderAssetPdfCandles(monthLabels, candles);

  // ── Content pages: summary + metrics + transactions ─────────────────────
  drawAssetPdfPageChrome(doc, logoData, title, subtitle, { cover: !!meta.cover });
  const L = assetPdfLayout(doc);
  const contentTop = assetPdfHeaderHeight(!!meta.cover) + 10;
  let y = contentTop;
  y = drawAssetPdfHeadingBlock(doc, "Asset overview", asset.name || "Asset", L.leftX, y, L.width);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...ASSET_PDF_THEME.muted);
  const metaLine = assetPdfSafeText(`${type} | ${status} | Purchased ${asset.purchase_date || "-"} | Owned ${sum.ownership?.label || "-"} (${sum.ownership?.days || 0} days)`);
  const metaLines = doc.splitTextToSize(metaLine, L.width);
  doc.text(metaLines.slice(0, 2), L.leftX + 5, y);
  y += Math.min(metaLines.length, 2) * 3.6 + 3;
  if (asset.description) {
    const desc = doc.splitTextToSize(assetPdfSafeText(asset.description), L.width - 5);
    doc.text(desc.slice(0, 2), L.leftX + 5, y);
    y += Math.min(desc.length, 2) * 3.6 + 2;
  }

  y = drawAssetPdfKpiCards(doc, [
    { label: "Purchase", value: formatPdfAmount(sum.purchasePrice || 0, cur), accent: ASSET_PDF_THEME.ink },
    { label: "Invested / spent", value: formatPdfAmount(sum.investedSpent || 0, cur), accent: ASSET_PDF_THEME.rose },
    { label: "Revenue", value: formatPdfAmount(sum.revenue || 0, cur), accent: ASSET_PDF_THEME.teal },
    { label: "Net", value: formatPdfAmount(sum.net || 0, cur), accent: (sum.net || 0) >= 0 ? ASSET_PDF_THEME.emerald : ASSET_PDF_THEME.rose }
  ], L.leftX, y, L.width);

  y = drawAssetPdfSectionLabel(doc, "Financial summary", L.leftX, y + 1);
  doc.autoTable({
    startY: y,
    head: [["Metric", "Amount"]],
    body: [
      ["Purchase price", formatPdfAmount(sum.purchasePrice || 0, cur)],
      ["Maintenance", formatPdfAmount(sum.maintenance || 0, cur)],
      ["Repairs", formatPdfAmount(sum.repair || 0, cur)],
      ["Operating", formatPdfAmount(sum.operating || 0, cur)],
      ["Other expenses", formatPdfAmount(sum.otherExpense || 0, cur)],
      ["Additional investment", formatPdfAmount(sum.additionalInvestment || 0, cur)],
      ["Sale costs", formatPdfAmount(sum.saleCosts || 0, cur)],
      ["Invested / spent", formatPdfAmount(sum.investedSpent || 0, cur)],
      ["Total revenue", formatPdfAmount(sum.revenue || 0, cur)],
      ["Sale proceeds", formatPdfAmount(sum.salePrice || 0, cur)],
      ["Net profit / loss", formatPdfAmount(sum.net || 0, cur)]
    ],
    ...assetPdfTableTheme(doc),
    columnStyles: { 0: { cellWidth: 110 }, 1: { cellWidth: 72, halign: "right" } },
    didDrawPage: () => drawAssetPdfTableChrome(doc, logoData, title, subtitle)
  });

  let txStart = (doc.lastAutoTable?.finalY || y) + 8;
  const pageH = doc.internal.pageSize.getHeight();
  if (txStart > pageH - 60) {
    doc.addPage();
    drawAssetPdfPageChrome(doc, logoData, title, subtitle);
    txStart = assetPdfHeaderHeight(false) + 10;
  }
  txStart = drawAssetPdfSectionLabel(doc, "Transaction history", L.leftX, txStart);
  doc.autoTable({
    startY: txStart,
    head: [["Date", "Type", "Amount", "Notes"]],
    body: assetPdfTxRows(liveTxs, cur, { emptyNote: "No transactions recorded" }),
    ...assetPdfTableTheme(doc),
    columnStyles: {
      0: { cellWidth: 26,halign: "center" },
      1: { cellWidth: 40 },
      2: assetPdfTxAmountColumnStyles(),
      3: { cellWidth: 72 }
    },
    didDrawPage: () => drawAssetPdfTableChrome(doc, logoData, title, subtitle)
  });

  // ── Last page: compact charts only ──────────────────────────────────────
  doc.addPage();
  drawAssetPdfPageChrome(doc, logoData, title, subtitle);
  y = assetPdfHeaderHeight(false) + 8;
  y = drawAssetPdfSectionLabel(doc, "Charts & analytics", L.leftX, y);

  const topH = 74;
  const left = drawAssetPdfPanel(doc, L.leftX, y, L.half, topH, "Cost composition");
  embedAssetPdfImage(doc, mixDonut, left.contentX, left.contentY, left.contentW, left.contentH - 1, { fit: "square" });
  const right = drawAssetPdfPanel(doc, L.rightX, y, L.half, topH, "Performance stack");
  embedAssetPdfImage(doc, perfBars, right.contentX, right.contentY, right.contentW, right.contentH - 1, { fit: "contain" });
  y += topH + 4;

  const midH = 58;
  const monthPanel = drawAssetPdfPanel(doc, L.leftX, y, L.width, midH, "Monthly revenue & expenses");
  embedAssetPdfImage(doc, monthlyLines, monthPanel.contentX, monthPanel.contentY, monthPanel.contentW, monthPanel.contentH - 1, { fit: "contain" });
  y += midH + 4;

  const bottomH = 54;
  const candlePanel = drawAssetPdfPanel(doc, L.leftX, y, L.width, bottomH, "Ownership equity candles (OHLC)");
  embedAssetPdfImage(doc, candleImg, candlePanel.contentX, candlePanel.contentY, candlePanel.contentW, candlePanel.contentH - 1, { fit: "contain" });
}

async function downloadSingleAssetRevenuePDF(assetId){
  if (!window.jspdf) {
    alert("PDF library loading. Please try again in a moment.");
    return;
  }
  await ensureAssetsLoadedForPdf();
  await ensureAssetDetailsLoadedForPdf([assetId]);
  const asset = typeof getAssetById === "function" ? getAssetById(assetId) : null;
  if (!asset) throw new Error("Asset not found.");
  const allTxs = typeof getAssetTransactions === "function" ? getAssetTransactions(assetId) : [];
  const txs = allTxs.filter(t => !t.is_deleted && assetPdfIsRevenueTx(t));
  const sum = (window.TripleMAssetMath?.summarizeAsset?.(asset, allTxs)) || {};
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  await loadCustomFontsForPdf(doc);
  const logoData = await getPdfLogo();
  const cur = asset.currency || "AED";
  const title = `Revenue Report - ${asset.name}`;
  const subtitle = `${new Date().toLocaleString()}  |  ${cur}`;
  const type = typeof assetTypeLabel === "function" ? assetTypeLabel(asset.asset_type, asset.asset_type_other) : asset.asset_type;
  const status = typeof assetStatusLabel === "function" ? assetStatusLabel(asset.status) : asset.status;

  drawAssetPdfPageChrome(doc, logoData, title, subtitle, { cover: true });
  const L = assetPdfLayout(doc);
  let y = assetPdfHeaderHeight(true) + 10;
  y = drawAssetPdfHeadingBlock(doc, "Revenue summary", asset.name || "Asset", L.leftX, y, L.width);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...ASSET_PDF_THEME.muted);
  doc.text(assetPdfSafeText(`${type} | ${status} | ${txs.length} revenue entr${txs.length === 1 ? "y" : "ies"}`), L.leftX + 5, y);
  y += 8;
  y = drawAssetPdfKpiCards(doc, [
    { label: "Total revenue", value: formatPdfAmount(sum.revenue || 0, cur), accent: ASSET_PDF_THEME.teal },
    { label: "Sale proceeds", value: formatPdfAmount(sum.salePrice || 0, cur), accent: ASSET_PDF_THEME.amber },
    { label: "Entries", value: String(txs.length), accent: ASSET_PDF_THEME.ink },
    { label: "Net P/L", value: formatPdfAmount(sum.net || 0, cur), accent: (sum.net || 0) >= 0 ? ASSET_PDF_THEME.emerald : ASSET_PDF_THEME.rose }
  ], L.leftX, y, L.width);

  y = drawAssetPdfSectionLabel(doc, "Revenue transactions", L.leftX, y);
  doc.autoTable({
    startY: y,
    head: [["Date", "Label", "Amount", "Notes"]],
    body: assetPdfTxRows(txs, cur, { emptyNote: "No revenue recorded" }),
    ...assetPdfTableTheme(doc),
    columnStyles: {
      0: { cellWidth: 26,halign: "center" },
      1: { cellWidth: 40 },
      2: assetPdfTxAmountColumnStyles(),
      3: { cellWidth: 72 }
    },
    didDrawPage: () => drawAssetPdfTableChrome(doc, logoData, title, subtitle)
  });

  doc.save(`Asset_Revenue_${assetPdfSafeFilename(asset.name)}.pdf`);
}

async function downloadSingleAssetExpensesPDF(assetId){
  if (!window.jspdf) {
    alert("PDF library loading. Please try again in a moment.");
    return;
  }
  await ensureAssetsLoadedForPdf();
  await ensureAssetDetailsLoadedForPdf([assetId]);
  const asset = typeof getAssetById === "function" ? getAssetById(assetId) : null;
  if (!asset) throw new Error("Asset not found.");
  const allTxs = typeof getAssetTransactions === "function" ? getAssetTransactions(assetId) : [];
  const txs = allTxs.filter(t => !t.is_deleted && assetPdfIsExpenseTx(t));
  const sum = (window.TripleMAssetMath?.summarizeAsset?.(asset, allTxs)) || {};
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  await loadCustomFontsForPdf(doc);
  const logoData = await getPdfLogo();
  const cur = asset.currency || "AED";
  const title = `Expenses Report - ${asset.name}`;
  const subtitle = `${new Date().toLocaleString()}  |  ${cur}`;
  const type = typeof assetTypeLabel === "function" ? assetTypeLabel(asset.asset_type, asset.asset_type_other) : asset.asset_type;
  const status = typeof assetStatusLabel === "function" ? assetStatusLabel(asset.status) : asset.status;
  const expenseTotal = Number(sum.investedSpent || 0);

  drawAssetPdfPageChrome(doc, logoData, title, subtitle, { cover: true });
  const L = assetPdfLayout(doc);
  let y = assetPdfHeaderHeight(true) + 10;
  y = drawAssetPdfHeadingBlock(doc, "Expenses summary", asset.name || "Asset", L.leftX, y, L.width);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...ASSET_PDF_THEME.muted);
  doc.text(assetPdfSafeText(`${type} | ${status} | ${txs.length} expense entr${txs.length === 1 ? "y" : "ies"}`), L.leftX + 5, y);
  y += 8;
  y = drawAssetPdfKpiCards(doc, [
    { label: "Invested / spent", value: formatPdfAmount(expenseTotal, cur), accent: ASSET_PDF_THEME.rose },
    { label: "Maintenance", value: formatPdfAmount(sum.maintenance || 0, cur), accent: ASSET_PDF_THEME.amber },
    { label: "Sale costs", value: formatPdfAmount(sum.saleCosts || 0, cur), accent: ASSET_PDF_THEME.ink },
    { label: "Entries", value: String(txs.length), accent: ASSET_PDF_THEME.slate }
  ], L.leftX, y, L.width);

  y = drawAssetPdfSectionLabel(doc, "Expense breakdown", L.leftX, y);
  doc.autoTable({
    startY: y,
    head: [["Category", "Amount"]],
    body: [
      ["Maintenance", formatPdfAmount(sum.maintenance || 0, cur)],
      ["Repairs", formatPdfAmount(sum.repair || 0, cur)],
      ["Operating", formatPdfAmount(sum.operating || 0, cur)],
      ["Other expenses", formatPdfAmount(sum.otherExpense || 0, cur)],
      ["Additional investment", formatPdfAmount(sum.additionalInvestment || 0, cur)],
      ["Sale costs", formatPdfAmount(sum.saleCosts || 0, cur)],
      ["Invested / spent total", formatPdfAmount(expenseTotal, cur)]
    ],
    ...assetPdfTableTheme(doc),
    columnStyles: { 0: { cellWidth: 110 }, 1: { cellWidth: 72,halign: "right" } },
    didDrawPage: () => drawAssetPdfTableChrome(doc, logoData, title, subtitle)
  });

  let txStart = (doc.lastAutoTable?.finalY || y) + 8;
  const pageH = doc.internal.pageSize.getHeight();
  if (txStart > pageH - 55) {
    doc.addPage();
    drawAssetPdfPageChrome(doc, logoData, title, subtitle);
    txStart = assetPdfHeaderHeight(false) + 10;
  }
  txStart = drawAssetPdfSectionLabel(doc, "Expense transactions", L.leftX, txStart);
  doc.autoTable({
    startY: txStart,
    head: [["Date", "Type", "Amount", "Notes"]],
    body: assetPdfTxRows(txs, cur, { emptyNote: "No expense transactions recorded" }),
    ...assetPdfTableTheme(doc),
    columnStyles: {
      0: { cellWidth: 26,halign: "center" },
      1: { cellWidth: 40 },
      2: assetPdfTxAmountColumnStyles(),
      3: { cellWidth: 72 }
    },
    didDrawPage: () => drawAssetPdfTableChrome(doc, logoData, title, subtitle)
  });

  doc.save(`Asset_Expenses_${assetPdfSafeFilename(asset.name)}.pdf`);
}
