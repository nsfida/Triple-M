/* Modularized from script.js lines 4480-4573 — currency + money + overview watermark helpers. Load order must be preserved. */
const PDF_CURRENCY_MARKERS = Object.create(null);
const PDF_CURRENCY_CODES_BY_MARKER = Object.create(null);

function refreshPdfCurrencyMarkers(){
  Object.keys(PDF_CURRENCY_MARKERS).forEach(key => delete PDF_CURRENCY_MARKERS[key]);
  Object.keys(PDF_CURRENCY_CODES_BY_MARKER).forEach(key => delete PDF_CURRENCY_CODES_BY_MARKER[key]);
  const custom = window.TriplemCurrencyRegistry?.all?.().filter(currency => currency?.font?.file && currency?.font?.family && currency.font.family !== "inherit") || [];
  custom.forEach((currency, index) => {
    const marker = String.fromCharCode(0xE100 + index);
    PDF_CURRENCY_MARKERS[currency.code] = marker;
    PDF_CURRENCY_CODES_BY_MARKER[marker] = currency.code;
  });
}
refreshPdfCurrencyMarkers();
window.addEventListener("triplem:currency-registry", refreshPdfCurrencyMarkers);

function currencyDefinition(currency){
  const code = normalizeCurrencyCode(currency);
  return window.TriplemCurrencyRegistry?.get?.(code) || null;
}

function currencySymbol(currency){
  const def = currencyDefinition(currency);
  return def ? def.symbol : (currency || "");
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
  let text = String(value ?? "");
  Object.keys(PDF_CURRENCY_CODES_BY_MARKER).forEach(marker => { text = text.split(marker).join(""); });
  return text;
}

function hasPdfCurrencyMarkers(value){
  const text = String(value ?? "");
  return Object.keys(PDF_CURRENCY_CODES_BY_MARKER).some(marker => text.includes(marker));
}

function currencyDecimals(currency, options = {}){
  const def = currencyDefinition(currency);
  if (!def) return 2;
  return options.forPdf ? Number(def.pdfDecimals ?? def.decimals ?? 2) : Number(def.decimals ?? 2);
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
  const cls = window.TriplemCurrencyRegistry?.fontClass?.(code) || "currency-font-normal";
  return `<span class="symbol ${escapeHtml(cls)}" data-currency-symbol="${escapeHtml(code)}">${escapeHtml(symbol)}</span>`;
}

function currencyFontClass(currency, sampleText = ""){
  const code = normalizeCurrencyCode(currency);
  if (code) return window.TriplemCurrencyRegistry?.fontClass?.(code) || "currency-font-normal";
  return "currency-font-normal";
}

function applyCurrencyFontClass(element, currency){
  if (!element) return;
  const desiredClass = currencyFontClass(currency, "value" in element ? element.value : element.textContent);
  Array.from(element.classList || []).filter(cls => cls.startsWith("currency-registry-") || cls.startsWith("currency-font-")).forEach(cls => element.classList.remove(cls));
  element.classList.add(desiredClass);
}

function currencyTextHtml(text, currency){
  const value = String(text ?? "");
  return `<span class="${escapeHtml(currencyFontClass(currency, value))}">${escapeHtml(value)}</span>`;
}

// Render monetary symbols inside trusted application text strictly by the explicit
// ISO currency code adjacent to the amount. A bare "$" is deliberately left in
// the normal UI font; only an amount explicitly identified as SAR can receive SAR.otf.
function currencyAwareTextHtml(text){
  const raw = String(text ?? "");
  const registry = window.TriplemCurrencyRegistry;
  const currencies = registry?.all?.() || [];
  const escapeRegex = value => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const symbols = [...new Set(currencies.map(currency => currency.symbol).filter(Boolean))]
    .sort((a,b) => b.length - a.length).map(escapeRegex);
  const codes = currencies.map(currency => currency.code).sort((a,b) => b.length - a.length).map(escapeRegex);
  if (!symbols.length || !codes.length) return escapeHtml(raw);
  const pattern = new RegExp(`(${symbols.join("|")})(\\s*[0-9][0-9,]*(?:\\.[0-9]+)?)(\\s*(?:\\((${codes.join("|")})\\)|\\b(${codes.join("|")})\\b))`, "gi");
  let html = "";
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(raw)) !== null) {
    html += escapeHtml(raw.slice(lastIndex, match.index));
    const code = normalizeCurrencyCode(match[4] || match[5] || "");
    const suffix = match[3] || "";
    const codeToken = match[4] || match[5] || code;
    const renderedSuffix = suffix.replace(codeToken, code);
    html += `${currencySymbolHtml(code)}${escapeHtml(match[2])}${escapeHtml(renderedSuffix)}`;
    lastIndex = pattern.lastIndex;
  }
  html += escapeHtml(raw.slice(lastIndex));
  return html;
}

function syncCurrencySelectFonts(selectEl){
  if (!selectEl) return;
  Array.from(selectEl.options || []).forEach(option => {
    Array.from(option.classList || []).filter(cls => cls.startsWith("currency-registry-") || cls.startsWith("currency-font-")).forEach(cls => option.classList.remove(cls));
    const optionCurrency = normalizeCurrencyCode(option.dataset.currency || option.value || "");
    if (window.TriplemCurrencyRegistry?.get?.(optionCurrency)) option.classList.add(currencyFontClass(optionCurrency, option.textContent || ""));
  });
  const applySelectedFont = () => {
    const selected = selectEl.options?.[selectEl.selectedIndex] || null;
    const selectedCurrency = normalizeCurrencyCode(selected?.dataset?.currency || selected?.value || selectEl.dataset.currency || "");
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
const TRIPLEM_PUBLIC_PLAN_PRICES = { monthly:{}, yearly:{} };
const TRIPLEM_PUBLIC_TEAM_PRICES = { monthly:{}, yearly:{} };
const TRIPLEM_DEMO_UNITS_PER_AED = {};

function refreshPublicCurrencyTables(){
  [TRIPLEM_PUBLIC_PLAN_PRICES.monthly,TRIPLEM_PUBLIC_PLAN_PRICES.yearly,TRIPLEM_PUBLIC_TEAM_PRICES.monthly,TRIPLEM_PUBLIC_TEAM_PRICES.yearly,TRIPLEM_DEMO_UNITS_PER_AED]
    .forEach(table => Object.keys(table).forEach(key => delete table[key]));
  (window.TriplemCurrencyRegistry?.all?.() || []).forEach(currency => {
    const code = currency.code;
    if (currency.billing?.billingEnabled !== false) {
      TRIPLEM_PUBLIC_PLAN_PRICES.monthly[code] = Number(currency.billing?.monthly || 0);
      TRIPLEM_PUBLIC_PLAN_PRICES.yearly[code] = Number(currency.billing?.yearly || 0);
      TRIPLEM_PUBLIC_TEAM_PRICES.monthly[code] = Number(currency.billing?.teamMonthly || 0);
      TRIPLEM_PUBLIC_TEAM_PRICES.yearly[code] = Number(currency.billing?.teamYearly || 0);
    }
    TRIPLEM_DEMO_UNITS_PER_AED[code] = Number(currency.billing?.demoUnitsPerAED || 0);
  });
}
refreshPublicCurrencyTables();
window.addEventListener("triplem:currency-registry", refreshPublicCurrencyTables);

const TRIPLEM_REGION_CACHE_KEY = "triplem_public_region_v2";
const TRIPLEM_REGION_OVERRIDE_KEY = "triplem_public_region_override_v1";
const TRIPLEM_REGION_CACHE_MS = 6 * 60 * 60 * 1000;
const TRIPLEM_COUNTRY_API = "https://api.country.is/";

function regionalCurrencyForCountry(countryCode){
  return window.TriplemCurrencyRegistry?.billingCurrencyForCountry?.(countryCode) || "USD";
}

function regionalCountryFromEnvironment(){
  let tz = "";
  try { tz = String(Intl.DateTimeFormat().resolvedOptions().timeZone || ""); } catch (_) {}
  const timezoneCountry = window.TriplemCurrencyRegistry?.timeZoneCountry?.(tz) || "";
  if (timezoneCountry) return timezoneCountry;

  const locales = [];
  try { if (Array.isArray(navigator.languages)) locales.push(...navigator.languages); } catch (_) {}
  try { if (navigator.language) locales.push(navigator.language); } catch (_) {}
  for (const rawLocale of locales) {
    const locale = String(rawLocale || "").replace(/_/g, "-");
    try {
      const region = new Intl.Locale(locale).region;
      if (/^[A-Z]{2}$/i.test(region || "")) return String(region).toUpperCase();
    } catch (_) {}
    const match = locale.match(/(?:^|-)([A-Z]{2})(?:-|$)/i);
    if (match) return match[1].toUpperCase();
  }
  return "";
}


function readRegionalCountryOverride(){
  try {
    const country = String(localStorage.getItem(TRIPLEM_REGION_OVERRIDE_KEY) || "").trim().toUpperCase();
    return /^[A-Z]{2}$/.test(country) ? country : "";
  } catch (_) { return ""; }
}

function writeRegionalCountryOverride(countryCode){
  const country = String(countryCode || "").trim().toUpperCase();
  try {
    if (/^[A-Z]{2}$/.test(country)) localStorage.setItem(TRIPLEM_REGION_OVERRIDE_KEY, country);
    else localStorage.removeItem(TRIPLEM_REGION_OVERRIDE_KEY);
  } catch (_) {}
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

const initialRegionalOverride = readRegionalCountryOverride();
const initialRegionalCountry = initialRegionalOverride || readRegionalCountryCache() || regionalCountryFromEnvironment();
const triplemRegionalState = {
  countryCode: initialRegionalCountry || "ZZ",
  currency: regionalCurrencyForCountry(initialRegionalCountry),
  source: initialRegionalOverride ? "manual" : (readRegionalCountryCache() ? "cache" : (initialRegionalCountry ? "environment" : "fallback"))
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
  if (source === "manual") writeRegionalCountryOverride(country);
  if (previousCountry !== country || previousCurrency !== triplemRegionalState.currency) {
    try { window.dispatchEvent(new CustomEvent("triplem:regional-currency", { detail: { ...triplemRegionalState } })); } catch (_) {}
  }
  return true;
}

async function resolveRegionalCurrency(options = {}){
  const force = options?.force === true;
  const manual = readRegionalCountryOverride();
  if (manual) {
    publishRegionalCurrency(manual, "manual");
    return { ...triplemRegionalState };
  }
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


function setRegionalCountryOverride(countryCode){
  const country = String(countryCode || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) return false;
  writeRegionalCountryOverride(country);
  return publishRegionalCurrency(country, "manual");
}

function clearRegionalCountryOverride(){
  writeRegionalCountryOverride("");
  return resolveRegionalCurrency({ force:true });
}

function publicPlanPrice(period, currency = getRegionalCurrency()){
  const p = String(period || "").toLowerCase();
  const c = normalizeCurrencyCode(currency);
  return Number(window.TriplemCurrencyRegistry?.planPrice?.(p, c) || TRIPLEM_PUBLIC_PLAN_PRICES?.[p]?.[c] || 0);
}

function publicTeamPrice(period, currency = getRegionalCurrency()){
  const p = String(period || "").toLowerCase();
  const c = normalizeCurrencyCode(currency);
  return Number(window.TriplemCurrencyRegistry?.teamPrice?.(p, c) || TRIPLEM_PUBLIC_TEAM_PRICES?.[p]?.[c] || 0);
}

function regionalMoneyHtml(amount, currency = getRegionalCurrency(), options = {}){
  const code = normalizeCurrencyCode(currency) || getRegionalCurrency();
  const n = finiteMoney(amount);
  const maximumFractionDigits = Number.isFinite(Number(options.maximumFractionDigits)) ? Number(options.maximumFractionDigits) : currencyDecimals(code);
  const minimumFractionDigits = Number.isFinite(Number(options.minimumFractionDigits)) ? Number(options.minimumFractionDigits) : (Number.isInteger(n) ? 0 : Math.min(2, maximumFractionDigits));
  const formatted = n.toLocaleString("en-US", { minimumFractionDigits, maximumFractionDigits });
  return `<span class="money regional-money" data-currency="${escapeHtml(code)}">${currencySymbolHtml(code)}<span class="amount">${escapeHtml(formatted)}</span></span>`;
}

function regionalMoneyText(amount, currency = getRegionalCurrency(), options = {}){
  const code = normalizeCurrencyCode(currency) || getRegionalCurrency();
  const n = finiteMoney(amount);
  const maximumFractionDigits = Number.isFinite(Number(options.maximumFractionDigits)) ? Number(options.maximumFractionDigits) : currencyDecimals(code);
  const minimumFractionDigits = Number.isFinite(Number(options.minimumFractionDigits)) ? Number(options.minimumFractionDigits) : (Number.isInteger(n) ? 0 : Math.min(2, maximumFractionDigits));
  const formatted = n.toLocaleString("en-US", { minimumFractionDigits, maximumFractionDigits });
  return `${currencySymbol(code)} ${formatted}`.trim();
}

function convertIllustrativeCurrencyAmount(value, fromCurrency, toCurrency = getRegionalCurrency()){
  const from = normalizeCurrencyCode(fromCurrency);
  const to = normalizeCurrencyCode(toCurrency);
  const amount = finiteMoney(value);
  const fromRate = Number(window.TriplemCurrencyRegistry?.demoUnitsPerAED?.(from) || TRIPLEM_DEMO_UNITS_PER_AED[from] || 0);
  const toRate = Number(window.TriplemCurrencyRegistry?.demoUnitsPerAED?.(to) || TRIPLEM_DEMO_UNITS_PER_AED[to] || 0);
  if (!fromRate || !toRate) return amount;
  return (amount / fromRate) * toRate;
}

try { window.TriplemRegionalCurrency = triplemRegionalState; } catch (_) {}
try {
  window.TRIPLEM_REGIONAL_CURRENCY_READY = Promise.resolve(window.TRIPLEM_CURRENCY_REGISTRY_READY)
    .catch(() => null)
    .then(() => {
      refreshPublicCurrencyTables();
      const currentCountry = getRegionalCountryCode();
      triplemRegionalState.currency = regionalCurrencyForCountry(currentCountry);
      return resolveRegionalCurrency();
    });
} catch (_) {}
