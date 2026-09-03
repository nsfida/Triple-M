/* Modularized from script.js lines 4480-4573 — currency + money + overview watermark helpers. Load order must be preserved. */
const PDF_CURRENCY_MARKERS = Object.freeze({
  AED: "\u2060",
  SAR: "\u2061"
});
const PDF_CURRENCY_MARKER_PATTERN = /[\u2060\u2061]/g;
const PDF_CURRENCY_MARKER_TEST_PATTERN = /[\u2060\u2061]/;

function currencySymbol(currency){
  const code = normalizeCurrencyCode(currency);
  return code === "AED" ? "~" :
         code === "SAR" ? "$" :
         code === "PKR" ? "Rs." :
         code === "USD" ? "$" :
         code === "BTC" ? "₿" :
         currency || "";
}

function currencySymbolForPdf(currency){
  const code = normalizeCurrencyCode(currency);
  const symbol = currencySymbol(code);
  return `${PDF_CURRENCY_MARKERS[code] || ""}${symbol}`;
}

function pdfCurrencyLabel(currency){
  const code = normalizeCurrencyCode(currency);
  return code || String(currency || "");
}

function stripPdfCurrencyMarkers(value){
  return String(value ?? "").replace(PDF_CURRENCY_MARKER_PATTERN, "");
}

function hasPdfCurrencyMarkers(value){
  return PDF_CURRENCY_MARKER_TEST_PATTERN.test(String(value ?? ""));
}

function currencyDecimals(currency, options = {}){
  const code = normalizeCurrencyCode(currency);
  if (code === "BTC") return options.forPdf ? 8 : 6;
  return 2;
}

function formatCurrencyAmountText(amount, currency, options = {}){
  const code = normalizeCurrencyCode(currency);
  const n = finiteMoney(amount);
  const decimals = Number.isFinite(Number(options.decimals))
    ? Number(options.decimals)
    : currencyDecimals(code, options);
  const formatted = n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
  const label = options.forPdf ? code : currencySymbol(code);
  return `${label ? label + " " : ""}${formatted}`.trim();
}

function currencySymbolHtml(currency){
  const code = normalizeCurrencyCode(currency);
  const symbol = currencySymbol(code);
  if (code === "AED") return `<span class="symbol symbol-dirham">${escapeHtml(symbol)}</span>`;
  if (code === "SAR") return `<span class="symbol symbol-riyal">${escapeHtml(symbol)}</span>`;
  if (code === "USD") return `<span class="symbol symbol-dollar">${escapeHtml(symbol)}</span>`;
  if (code === "BTC") return `<span class="symbol symbol-bitcoin">${escapeHtml(symbol)}</span>`;
  return `<span class="symbol">${escapeHtml(symbol)}</span>`;
}

function currencyFontClass(currency, sampleText = ""){
  const code = normalizeCurrencyCode(currency);
  if (code === "AED") return "currency-font-aed";
  if (code === "SAR") return "currency-font-sar";
  if (code === "USD") return "currency-font-usd";
  if (!code && /[~$]/.test(String(sampleText || ""))) return "currency-font-mixed";
  return "currency-font-normal";
}

function applyCurrencyFontClass(element, currency){
  if (!element) return;
  const sampleText = "value" in element ? element.value : element.textContent;
  const fontClasses = ["currency-font-aed", "currency-font-sar", "currency-font-usd", "currency-font-mixed", "currency-font-normal"];
  const desiredClass = currencyFontClass(currency, sampleText);
  const alreadyStable = element.classList.contains(desiredClass)
    && fontClasses.every(cls => cls === desiredClass || !element.classList.contains(cls));
  if (alreadyStable) return;
  element.classList.remove(...fontClasses);
  element.classList.add(desiredClass);
}

function currencyTextHtml(text, currency){
  const value = String(text ?? "");
  return `<span class="${currencyFontClass(currency, value)}">${escapeHtml(value)}</span>`;
}

function syncCurrencySelectFonts(selectEl){
  if (!selectEl) return;
  const fontClasses = ["currency-font-aed", "currency-font-sar", "currency-font-usd", "currency-font-mixed", "currency-font-normal"];
  Array.from(selectEl.options || []).forEach(option => {
    option.classList.remove(...fontClasses);
    const optionCurrency = normalizeCurrencyCode(option.dataset.currency || "");
    option.classList.add(currencyFontClass(optionCurrency, option.textContent || ""));
  });

  const applySelectedFont = () => {
    const selected = selectEl.options?.[selectEl.selectedIndex] || null;
    const selectedCurrency = normalizeCurrencyCode(selected?.dataset?.currency || selectEl.dataset.currency || "");
    applyCurrencyFontClass(selectEl, selectedCurrency);
  };

  if (selectEl.dataset.currencyFontBound !== "1") {
    selectEl.dataset.currencyFontBound = "1";
    selectEl.addEventListener("change", applySelectedFont);
  }
  applySelectedFont();
}

function moneyText(amount, currency, options = {}){
  return formatCurrencyAmountText(amount, currency, options);
}

function money(amount, currency){
  const code = normalizeCurrencyCode(currency);
  const n = finiteMoney(amount);
  const decimals = currencyDecimals(code);
  const formatted = n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `<span class="money">${currencySymbolHtml(currency)}<span class="amount">${formatted}</span></span>`;
}
