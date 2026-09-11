/* Triplem VIP currency registry — Assets/config/currencies.json is the single runtime source for currencies, symbols, fonts, billing and regional mapping. */
(function(){
  // Emergency boot fallback only. Normal runtime is hydrated from currencies.json.
  const FALLBACK = {
    version: 3,
    defaultCurrency: "AED",
    regionalBilling: { default:"USD" },
    landingRegions: [],
    currencies: [
      {
        code:"AED", name:"UAE Dirham", symbol:"~", font:{ family:"TriplemCurrencyAED", file:"Assets/style/fonts/AED.ttf" },
        decimals:2, pdfDecimals:2, aliases:["DIRHAM","DIRHAMS","DHS","DH","~"], enabled:true,
        taxDefault:{ rate:0, mode:"ADD" },
        billing:{ monthly:49, yearly:449, teamMonthly:10, teamYearly:80, demoUnitsPerAED:1, billingEnabled:true, countryCodes:["AE"], timeZones:["Asia/Dubai"] }
      },
      {
        code:"USD", name:"US Dollar", symbol:"$", font:{ family:"inherit", file:null },
        decimals:2, pdfDecimals:2, aliases:["USD.","DOLLAR","DOLLARS"], enabled:true,
        taxDefault:{ rate:0, mode:"ADD" },
        billing:{ monthly:13.99, yearly:149, teamMonthly:4, teamYearly:40, demoUnitsPerAED:0.2723, billingEnabled:true, countryCodes:[], timeZones:[] }
      }
    ]
  };

  let registry = FALLBACK;
  let byCode = new Map();
  let aliases = new Map();
  let countryBillingMap = new Map();
  let timeZoneCountryMap = new Map();

  const cleanCountryCodes = values => (Array.isArray(values) ? values : [])
    .map(value => String(value || "").trim().toUpperCase())
    .filter((value, index, list) => /^[A-Z]{2}$/.test(value) && list.indexOf(value) === index);

  const cleanTimeZones = values => (Array.isArray(values) ? values : [])
    .map(value => String(value || "").trim())
    .filter((value, index, list) => value && list.indexOf(value) === index);

  function cleanCurrency(item){
    if (!item || typeof item !== "object") return null;
    const code = String(item.code || "").trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9]{1,9}$/.test(code)) return null;
    const symbol = String(item.symbol ?? "");
    const family = String(item.font?.family || "inherit").trim() || "inherit";
    const file = item.font?.file ? String(item.font.file).trim() : null;
    const billing = item.billing && typeof item.billing === "object" ? { ...item.billing } : {};
    billing.countryCodes = cleanCountryCodes(billing.countryCodes);
    billing.timeZones = cleanTimeZones(billing.timeZones);
    if ("billingEnabled" in billing) billing.billingEnabled = billing.billingEnabled !== false;
    ["monthly","yearly","teamMonthly","teamYearly","demoUnitsPerAED"].forEach(key => {
      if (billing[key] != null && Number.isFinite(Number(billing[key]))) billing[key] = Number(billing[key]);
    });
    const taxMode = String(item.taxDefault?.mode || "ADD").trim().toUpperCase() === "INCLUDE" ? "INCLUDE" : "ADD";
    const taxRate = Number.isFinite(Number(item.taxDefault?.rate)) ? Math.max(0, Number(item.taxDefault.rate)) : 0;
    return {
      code,
      name: String(item.name || code).trim(),
      symbol,
      font: { family, file },
      decimals: Number.isFinite(Number(item.decimals)) ? Math.max(0, Math.min(12, Number(item.decimals))) : 2,
      pdfDecimals: Number.isFinite(Number(item.pdfDecimals)) ? Math.max(0, Math.min(12, Number(item.pdfDecimals))) : 2,
      aliases: Array.isArray(item.aliases) ? item.aliases.map(v => String(v || "").trim().toUpperCase()).filter(Boolean) : [],
      enabled: item.enabled !== false,
      taxDefault: { rate: taxRate, mode: taxMode },
      billing
    };
  }

  function rebuild(next){
    const currencies = (Array.isArray(next?.currencies) ? next.currencies : [])
      .map(cleanCurrency).filter(Boolean).filter(currency => currency.enabled);
    if (!currencies.length) return false;

    const requestedDefault = String(next?.defaultCurrency || currencies[0].code).trim().toUpperCase();
    const defaultCurrency = currencies.some(currency => currency.code === requestedDefault) ? requestedDefault : currencies[0].code;
    const rawRegional = next?.regionalBilling && typeof next.regionalBilling === "object" ? { ...next.regionalBilling } : {};
    const regionalDefault = String(rawRegional.default || "USD").trim().toUpperCase();
    const explicitRegions = Object.fromEntries(Object.entries(rawRegional)
      .filter(([country]) => String(country).toLowerCase() !== "default")
      .map(([country, code]) => [String(country).trim().toUpperCase(), String(code || "").trim().toUpperCase()]));

    registry = {
      version: Number(next?.version || 1),
      defaultCurrency,
      regionalBilling: { ...explicitRegions, default: regionalDefault },
      landingRegions: (Array.isArray(next?.landingRegions) ? next.landingRegions : [])
        .map(region => ({ code:String(region?.code || "").trim().toUpperCase(), name:String(region?.name || region?.code || "").trim() }))
        .filter(region => /^[A-Z]{2}$/.test(region.code) && region.name),
      currencies
    };

    byCode = new Map(currencies.map(currency => [currency.code, currency]));
    aliases = new Map();
    countryBillingMap = new Map();
    timeZoneCountryMap = new Map();

    currencies.forEach(currency => {
      aliases.set(currency.code, currency.code);
      currency.aliases.forEach(alias => aliases.set(alias, currency.code));
      if (currency.billing?.billingEnabled !== false) {
        currency.billing.countryCodes.forEach(country => countryBillingMap.set(country, currency.code));
        currency.billing.timeZones.forEach(zone => {
          if (!timeZoneCountryMap.has(zone) && currency.billing.countryCodes[0]) timeZoneCountryMap.set(zone, currency.billing.countryCodes[0]);
        });
      }
    });
    Object.entries(explicitRegions).forEach(([country, code]) => {
      if (/^[A-Z]{2}$/.test(country) && byCode.has(code)) countryBillingMap.set(country, code);
    });

    installFonts(currencies);
    try { window.dispatchEvent(new CustomEvent("triplem:currency-registry", { detail:{ registry } })); } catch (_) {}
    return true;
  }

  function installFonts(currencies){
    let style = document.getElementById("triplemCurrencyRegistryFonts");
    if (!style) {
      style = document.createElement("style");
      style.id = "triplemCurrencyRegistryFonts";
      document.head.appendChild(style);
    }
    const css = [];
    currencies.forEach(currency => {
      if (currency.font.file && currency.font.family && currency.font.family !== "inherit") {
        const format = /\.ttf(?:$|[?#])/i.test(currency.font.file) ? "truetype" : "opentype";
        css.push(`@font-face{font-family:${JSON.stringify(currency.font.family)};src:url(${JSON.stringify(currency.font.file)}) format('${format}');font-display:swap;}`);
      }
      const cls = `currency-registry-${currency.code.toLowerCase()}`;
      const normalStack = `Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      const stack = currency.font.family === "inherit" ? normalStack : `${JSON.stringify(currency.font.family)}, ${normalStack}`;
      css.push(`.${cls}{font-family:${stack} !important;}`);
    });
    style.textContent = css.join("\n");
  }

  function all(){ return registry.currencies.slice(); }
  function codes(){ return all().map(currency => currency.code); }
  function get(code){ return byCode.get(String(code || "").trim().toUpperCase()) || null; }
  function normalize(value){
    const raw = String(value || "").trim().toUpperCase();
    return aliases.get(raw) || raw;
  }
  function fontClass(code){
    const currency = get(code);
    return currency ? `currency-registry-${currency.code.toLowerCase()}` : "currency-font-normal";
  }
  function optionLabel(code){
    const currency = get(code);
    return currency ? `${currency.symbol ? currency.symbol + " " : ""}${currency.code}` : String(code || "");
  }
  function billingCurrencies(){ return all().filter(currency => currency.billing?.billingEnabled !== false && Number(currency.billing?.monthly || currency.billing?.yearly || 0) > 0); }
  function billingCurrencyForCountry(countryCode){
    const country = String(countryCode || "").trim().toUpperCase();
    const mapped = countryBillingMap.get(country) || String(registry.regionalBilling?.default || "USD").trim().toUpperCase();
    if (get(mapped)?.billing?.billingEnabled !== false) return mapped;
    return billingCurrencies()[0]?.code || registry.defaultCurrency;
  }
  function planPrice(period, code){
    const currency = get(code);
    return Number(currency?.billing?.[String(period || "").toLowerCase()] || 0);
  }
  function teamPrice(period, code){
    const currency = get(code);
    const key = String(period || "").toLowerCase() === "yearly" ? "teamYearly" : "teamMonthly";
    return Number(currency?.billing?.[key] || 0);
  }
  function demoUnitsPerAED(code){ return Number(get(code)?.billing?.demoUnitsPerAED || 0); }
  function taxDefault(code){
    const currency = get(code);
    return currency ? { ...currency.taxDefault } : { rate:0, mode:"ADD" };
  }
  function countryCodes(code){ return [...(get(code)?.billing?.countryCodes || [])]; }
  function timeZoneCountry(timeZone){ return timeZoneCountryMap.get(String(timeZone || "").trim()) || ""; }
  function supported(){ return codes(); }
  function symbols(){ return [...new Set(all().map(currency => currency.symbol).filter(Boolean))]; }
  function landingRegions(){
    const merged = new Map(registry.landingRegions.map(region => [region.code, { ...region }]));
    countryBillingMap.forEach((_currency, country) => {
      if (merged.has(country)) return;
      let name = country;
      try {
        if (typeof Intl.DisplayNames === "function") name = new Intl.DisplayNames([navigator.language || "en"], { type:"region" }).of(country) || country;
      } catch (_) {}
      merged.set(country, { code:country, name });
    });
    return Array.from(merged.values());
  }
  function serverPayload(){
    return {
      version: registry.version,
      defaultCurrency: registry.defaultCurrency,
      regionalBilling: { default:String(registry.regionalBilling?.default || "USD").toUpperCase() },
      currencies: all().map(currency => ({
        code:currency.code,
        name:currency.name,
        symbol:currency.symbol,
        decimals:currency.decimals,
        pdfDecimals:currency.pdfDecimals,
        enabled:currency.enabled,
        billing:{ ...currency.billing, countryCodes:[...(currency.billing?.countryCodes || [])], timeZones:[...(currency.billing?.timeZones || [])] }
      }))
    };
  }

  function hydrate(root){
    const host = root && root.querySelectorAll ? root : document;
    const supportedCodes = new Set(codes());
    host.querySelectorAll("select").forEach(select => {
      const current = String(select.value || "").toUpperCase();
      const opts = Array.from(select.options || []);
      const currencyOpts = opts.filter(option => supportedCodes.has(String(option.value || "").toUpperCase()));
      if (!currencyOpts.length) return;
      currencyOpts.forEach(option => option.remove());
      all().forEach(currency => {
        const option = document.createElement("option");
        option.value = currency.code;
        option.textContent = optionLabel(currency.code);
        option.dataset.currency = currency.code;
        option.className = fontClass(currency.code);
        select.appendChild(option);
      });
      select.value = supportedCodes.has(current) ? current : (supportedCodes.has(registry.defaultCurrency) ? registry.defaultCurrency : codes()[0]);
      select.dataset.currency = select.value;
      select.classList.remove(...Array.from(select.classList).filter(cls => cls.startsWith("currency-registry-")));
      select.classList.add(fontClass(select.value));
    });
    host.querySelectorAll(".currency-picker").forEach(picker => {
      const chips = Array.from(picker.querySelectorAll(":scope > .currency-chip[data-currency]"));
      if (chips.length < 2) return;
      const selected = String(picker.querySelector(".currency-chip.active")?.dataset?.currency || "").toUpperCase();
      chips.forEach(chip => chip.remove());
      all().forEach(currency => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `currency-chip${currency.code === selected ? " active" : ""}`;
        button.dataset.currency = currency.code;
        const symbol = document.createElement("span");
        symbol.className = fontClass(currency.code);
        symbol.textContent = currency.symbol;
        const label = document.createElement("span");
        label.textContent = currency.code;
        button.append(symbol, label);
        picker.appendChild(button);
      });
    });
  }

  rebuild(FALLBACK);
  window.TriplemCurrencyRegistry = {
    all, codes, supported, billingCurrencies, landingRegions, get, normalize, fontClass, optionLabel,
    billingCurrencyForCountry, planPrice, teamPrice, demoUnitsPerAED, taxDefault, countryCodes,
    timeZoneCountry, symbols, serverPayload, hydrate,
    get registry(){ return registry; }
  };
  window.TRIPLEM_CURRENCY_REGISTRY_READY = fetch("Assets/config/currencies.json?v=20260911-001", { cache:"no-store" })
    .then(response => { if (!response.ok) throw new Error("Currency registry unavailable"); return response.json(); })
    .then(data => { if (!rebuild(data)) throw new Error("Currency registry is empty"); return registry; })
    .catch(() => registry)
    .then(data => { try { hydrate(document); } catch (_) {} return data; });
})();
