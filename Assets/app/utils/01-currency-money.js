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

/* Build 156 — country-aware public billing currency. Workspace currencies stay multi-currency. */
const TRIPLEM_PUBLIC_PLAN_PRICES = Object.freeze({
  monthly: Object.freeze({ AED: 49, SAR: 49, PKR: 1799, USD: 13.99 }),
  yearly: Object.freeze({ AED: 449, SAR: 449, PKR: 19999, USD: 149 })
});
const TRIPLEM_PUBLIC_TEAM_PRICES = Object.freeze({
  monthly: Object.freeze({ AED: 10, SAR: 10, PKR: 75, USD: 4 }),
  yearly: Object.freeze({ AED: 80, SAR: 80, PKR: 7000, USD: 40 })
});
const TRIPLEM_REGION_CACHE_KEY = "triplem_public_region_v1";
const TRIPLEM_REGION_CACHE_MS = 6 * 60 * 60 * 1000;
const TRIPLEM_COUNTRY_API = "https://api.country.is/";
const TRIPLEM_DEMO_UNITS_PER_AED = Object.freeze({ AED: 1, SAR: 1.02, PKR: 76, USD: 0.2723 });

function regionalCurrencyForCountry(countryCode){
  const country = String(countryCode || "").trim().toUpperCase();
  if (country === "PK") return "PKR";
  if (country === "SA") return "SAR";
  if (country === "AE") return "AED";
  return "USD";
}

function regionalCountryFromEnvironment(){
  let tz = "";
  try { tz = String(Intl.DateTimeFormat().resolvedOptions().timeZone || ""); } catch (_) {}
  if (tz === "Asia/Karachi") return "PK";
  if (tz === "Asia/Riyadh") return "SA";
  if (tz === "Asia/Dubai") return "AE";

  const locales = [];
  try { if (Array.isArray(navigator.languages)) locales.push(...navigator.languages); } catch (_) {}
  try { if (navigator.language) locales.push(navigator.language); } catch (_) {}
  for (const locale of locales) {
    const match = String(locale || "").replace(/_/g, "-").match(/(?:^|-)(PK|SA|AE)(?:-|$)/i);
    if (match) return match[1].toUpperCase();
  }
  return "";
}

function readRegionalCountryCache(){
  try {
    const parsed = JSON.parse(localStorage.getItem(TRIPLEM_REGION_CACHE_KEY) || "null");
    const country = String(parsed?.country || "").toUpperCase();
    const savedAt = Number(parsed?.savedAt || 0);
    if (/^[A-Z]{2}$/.test(country) && savedAt > 0 && Date.now() - savedAt < TRIPLEM_REGION_CACHE_MS) return country;
  } catch (_) {}
  return "";
}

function writeRegionalCountryCache(countryCode){
  const country = String(countryCode || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) return;
  try { localStorage.setItem(TRIPLEM_REGION_CACHE_KEY, JSON.stringify({ country, savedAt: Date.now() })); } catch (_) {}
}

const initialRegionalCountry = readRegionalCountryCache() || regionalCountryFromEnvironment();
const triplemRegionalState = {
  countryCode: initialRegionalCountry || "ZZ",
  currency: regionalCurrencyForCountry(initialRegionalCountry),
  source: readRegionalCountryCache() ? "cache" : (initialRegionalCountry ? "environment" : "fallback")
};

function getRegionalCountryCode(){
  return String(triplemRegionalState.countryCode || "ZZ").toUpperCase();
}

function getRegionalCurrency(){
  return regionalCurrencyForCountry(getRegionalCountryCode());
}

function publishRegionalCurrency(countryCode, source = "resolved"){
  const country = String(countryCode || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) return false;
  const previousCountry = triplemRegionalState.countryCode;
  const previousCurrency = triplemRegionalState.currency;
  triplemRegionalState.countryCode = country;
  triplemRegionalState.currency = regionalCurrencyForCountry(country);
  triplemRegionalState.source = source;
  if (source === "ip") writeRegionalCountryCache(country);
  if (previousCountry !== country || previousCurrency !== triplemRegionalState.currency) {
    try { window.dispatchEvent(new CustomEvent("triplem:regional-currency", { detail: { ...triplemRegionalState } })); } catch (_) {}
  }
  return true;
}

async function resolveRegionalCurrency(options = {}){
  const force = options?.force === true;
  if (!force) {
    const cached = readRegionalCountryCache();
    if (cached) {
      publishRegionalCurrency(cached, "cache");
      return { ...triplemRegionalState };
    }
  }
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeout = setTimeout(() => { try { controller?.abort(); } catch (_) {} }, 2200);
  try {
    const response = await fetch(TRIPLEM_COUNTRY_API, { method: "GET", mode: "cors", cache: "no-store", signal: controller?.signal });
    if (!response.ok) throw new Error("Country lookup unavailable");
    const payload = await response.json();
    const country = String(payload?.country || "").trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(country)) publishRegionalCurrency(country, "ip");
  } catch (_) {
    const fallback = regionalCountryFromEnvironment();
    if (fallback) publishRegionalCurrency(fallback, "environment");
  } finally {
    clearTimeout(timeout);
  }
  return { ...triplemRegionalState };
}

function publicPlanPrice(period, currency = getRegionalCurrency()){
  const p = String(period || "").toLowerCase();
  const c = normalizeCurrencyCode(currency);
  return Number(TRIPLEM_PUBLIC_PLAN_PRICES?.[p]?.[c] || 0);
}

function publicTeamPrice(period, currency = getRegionalCurrency()){
  const p = String(period || "").toLowerCase();
  const c = normalizeCurrencyCode(currency);
  return Number(TRIPLEM_PUBLIC_TEAM_PRICES?.[p]?.[c] || 0);
}

function regionalMoneyHtml(amount, currency = getRegionalCurrency(), options = {}){
  const code = normalizeCurrencyCode(currency) || getRegionalCurrency();
  const n = finiteMoney(amount);
  const maximumFractionDigits = Number.isFinite(Number(options.maximumFractionDigits)) ? Number(options.maximumFractionDigits) : (code === "PKR" ? 0 : 2);
  const minimumFractionDigits = Number.isFinite(Number(options.minimumFractionDigits)) ? Number(options.minimumFractionDigits) : (Number.isInteger(n) ? 0 : Math.min(2, maximumFractionDigits));
  const formatted = n.toLocaleString("en-US", { minimumFractionDigits, maximumFractionDigits });
  return `<span class="money regional-money" data-currency="${escapeHtml(code)}">${currencySymbolHtml(code)}<span class="amount">${escapeHtml(formatted)}</span></span>`;
}

function regionalMoneyText(amount, currency = getRegionalCurrency(), options = {}){
  const code = normalizeCurrencyCode(currency) || getRegionalCurrency();
  const n = finiteMoney(amount);
  const maximumFractionDigits = Number.isFinite(Number(options.maximumFractionDigits)) ? Number(options.maximumFractionDigits) : (code === "PKR" ? 0 : 2);
  const minimumFractionDigits = Number.isFinite(Number(options.minimumFractionDigits)) ? Number(options.minimumFractionDigits) : (Number.isInteger(n) ? 0 : Math.min(2, maximumFractionDigits));
  const formatted = n.toLocaleString("en-US", { minimumFractionDigits, maximumFractionDigits });
  return `${currencySymbol(code)} ${formatted}`.trim();
}

function convertIllustrativeCurrencyAmount(value, fromCurrency, toCurrency = getRegionalCurrency()){
  const from = normalizeCurrencyCode(fromCurrency);
  const to = normalizeCurrencyCode(toCurrency);
  const amount = finiteMoney(value);
  const fromRate = Number(TRIPLEM_DEMO_UNITS_PER_AED[from] || 0);
  const toRate = Number(TRIPLEM_DEMO_UNITS_PER_AED[to] || 0);
  if (!fromRate || !toRate) return amount;
  return (amount / fromRate) * toRate;
}

try { window.TriplemRegionalCurrency = triplemRegionalState; } catch (_) {}
try { window.TRIPLEM_REGIONAL_CURRENCY_READY = resolveRegionalCurrency(); } catch (_) {}
