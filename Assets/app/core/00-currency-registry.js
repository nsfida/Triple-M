/* Triplem VIP currency registry — JSON is the single UI source of truth for supported currencies, symbols and symbol fonts. */
(function(){
  const FALLBACK = {
    version: 1,
    defaultCurrency: "AED",
    regionalBilling: { PK:"PKR", SA:"SAR", AE:"AED", default:"USD" },
    landingRegions: [{code:"US",name:"USA"},{code:"GB",name:"UK"},{code:"IN",name:"India"},{code:"AE",name:"UAE"},{code:"SA",name:"Saudi Arabia"},{code:"PK",name:"Pakistan"},{code:"RU",name:"Russia"},{code:"CN",name:"China"}],
    currencies: [
      { code:"USD", name:"US Dollar", symbol:"$", font:{ family:"inherit", file:null }, decimals:2, pdfDecimals:2, aliases:["USD.","DOLLAR","DOLLARS"], enabled:true, billing:{monthly:13.99,yearly:149,teamMonthly:4,teamYearly:40,demoUnitsPerAED:0.2723,billingEnabled:true} },
      { code:"PKR", name:"Pakistani Rupee", symbol:"Rs.", font:{ family:"inherit", file:null }, decimals:2, pdfDecimals:2, aliases:["RS","RS.","RUPEE","RUPEES","₨"], enabled:true, billing:{monthly:1799,yearly:19999,teamMonthly:75,teamYearly:7000,demoUnitsPerAED:76,billingEnabled:true} },
      { code:"SAR", name:"Saudi Riyal", symbol:"$", font:{ family:"TriplemCurrencySAR", file:"Assets/style/fonts/SAR.otf" }, decimals:2, pdfDecimals:2, aliases:["SAR.","RIYAL","RIYALS"], enabled:true, billing:{monthly:49,yearly:449,teamMonthly:10,teamYearly:80,demoUnitsPerAED:1.02,billingEnabled:true} },
      { code:"AED", name:"UAE Dirham", symbol:"~", font:{ family:"TriplemCurrencyAED", file:"Assets/style/fonts/AED.ttf" }, decimals:2, pdfDecimals:2, aliases:["DIRHAM","DIRHAMS","DHS","DH","~"], enabled:true, billing:{monthly:49,yearly:449,teamMonthly:10,teamYearly:80,demoUnitsPerAED:1,billingEnabled:true} },
      { code:"BTC", name:"Bitcoin", symbol:"₿", font:{ family:"inherit", file:null }, decimals:6, pdfDecimals:8, aliases:["BITCOIN","BTC.","₿"], enabled:true, billing:{billingEnabled:false} }
    ]
  };

  let registry = FALLBACK;
  let byCode = new Map();
  let aliases = new Map();

  function cleanCurrency(item){
    if (!item || typeof item !== "object") return null;
    const code = String(item.code || "").trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9]{1,9}$/.test(code)) return null;
    const symbol = String(item.symbol ?? "");
    const family = String(item.font?.family || "inherit").trim() || "inherit";
    const file = item.font?.file ? String(item.font.file).trim() : null;
    return {
      code,
      name: String(item.name || code).trim(),
      symbol,
      font: { family, file },
      decimals: Number.isFinite(Number(item.decimals)) ? Math.max(0, Math.min(12, Number(item.decimals))) : 2,
      pdfDecimals: Number.isFinite(Number(item.pdfDecimals)) ? Math.max(0, Math.min(12, Number(item.pdfDecimals))) : (code === "BTC" ? 8 : 2),
      aliases: Array.isArray(item.aliases) ? item.aliases.map(v => String(v || "").trim().toUpperCase()).filter(Boolean) : [],
      enabled: item.enabled !== false,
      billing: item.billing && typeof item.billing === "object" ? { ...item.billing } : {}
    };
  }

  function rebuild(next){
    const currencies = (Array.isArray(next?.currencies) ? next.currencies : []).map(cleanCurrency).filter(Boolean).filter(c => c.enabled);
    if (!currencies.length) return false;
    registry = { version:Number(next?.version || 1), defaultCurrency:String(next?.defaultCurrency || currencies[0].code).toUpperCase(), regionalBilling:(next?.regionalBilling && typeof next.regionalBilling === "object" ? { ...next.regionalBilling } : { PK:"PKR", SA:"SAR", AE:"AED", default:"USD" }), landingRegions:(Array.isArray(next?.landingRegions) ? next.landingRegions : FALLBACK.landingRegions).map(r => ({ code:String(r?.code || "").trim().toUpperCase(), name:String(r?.name || r?.code || "").trim() })).filter(r => /^[A-Z]{2}$/.test(r.code) && r.name), currencies };
    byCode = new Map(currencies.map(c => [c.code, c]));
    aliases = new Map();
    currencies.forEach(c => {
      aliases.set(c.code, c.code);
      c.aliases.forEach(alias => aliases.set(alias, c.code));
    });
    installFonts(currencies);
    try { window.dispatchEvent(new CustomEvent("triplem:currency-registry", { detail:{ registry } })); } catch (_) {}
    return true;
  }

  function installFonts(currencies){
    let style = document.getElementById("triplemCurrencyRegistryFonts");
    if (!style) { style = document.createElement("style"); style.id = "triplemCurrencyRegistryFonts"; document.head.appendChild(style); }
    const css = [];
    currencies.forEach(c => {
      if (c.font.file && c.font.family && c.font.family !== "inherit") {
        const format = /\.ttf(?:$|[?#])/i.test(c.font.file) ? 'truetype' : 'opentype';
        css.push(`@font-face{font-family:${JSON.stringify(c.font.family)};src:url(${JSON.stringify(c.font.file)}) format('${format}');font-display:swap;}`);
      }
      const cls = `currency-registry-${c.code.toLowerCase()}`;
      const normalStack = `Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      const stack = c.font.family === "inherit" ? normalStack : `${JSON.stringify(c.font.family)}, ${normalStack}`;
      css.push(`.${cls}{font-family:${stack} !important;}`);
    });
    style.textContent = css.join("\n");
  }

  function all(){ return registry.currencies.slice(); }
  function codes(){ return all().map(c => c.code); }
  function get(code){ return byCode.get(String(code || "").trim().toUpperCase()) || null; }
  function normalize(value){
    const raw = String(value || "").trim().toUpperCase();
    return aliases.get(raw) || raw;
  }
  function fontClass(code){ const c = get(code); return c ? `currency-registry-${c.code.toLowerCase()}` : "currency-font-normal"; }
  function optionLabel(code){ const c = get(code); return c ? `${c.symbol ? c.symbol + " " : ""}${c.code}` : String(code || ""); }
  function billingCurrencyForCountry(countryCode){
    const country = String(countryCode || "").trim().toUpperCase();
    const mapped = String(registry.regionalBilling?.[country] || registry.regionalBilling?.default || registry.defaultCurrency || codes()[0] || "USD").toUpperCase();
    return get(mapped)?.billing?.billingEnabled !== false ? mapped : (codes().find(code => get(code)?.billing?.billingEnabled !== false) || mapped);
  }
  function planPrice(period, code){ const c=get(code); return Number(c?.billing?.[String(period||"").toLowerCase()] || 0); }
  function teamPrice(period, code){ const c=get(code); const key=String(period||"").toLowerCase()==="yearly" ? "teamYearly" : "teamMonthly"; return Number(c?.billing?.[key] || 0); }
  function demoUnitsPerAED(code){ return Number(get(code)?.billing?.demoUnitsPerAED || 0); }
  function supported(){ return codes(); }
  function landingRegions(){ return Array.isArray(registry.landingRegions) ? registry.landingRegions.map(r => ({...r})) : []; }

  function hydrate(root){
    const host = root && root.querySelectorAll ? root : document;
    const supportedCodes = new Set(codes());
    host.querySelectorAll('select').forEach(select => {
      const current = String(select.value || "").toUpperCase();
      const opts = Array.from(select.options || []);
      const currencyOpts = opts.filter(o => supportedCodes.has(String(o.value || "").toUpperCase()) || ["AED","SAR","PKR","USD","BTC"].includes(String(o.value || "").toUpperCase()));
      if (!currencyOpts.length) return;
      currencyOpts.forEach(o => o.remove());
      all().forEach(c => {
        const o = document.createElement("option"); o.value = c.code; o.textContent = optionLabel(c.code); o.dataset.currency = c.code; o.className = fontClass(c.code); select.appendChild(o);
      });
      select.value = supportedCodes.has(current) ? current : (supportedCodes.has(String(registry.defaultCurrency)) ? String(registry.defaultCurrency) : codes()[0]);
      select.dataset.currency = select.value;
      select.classList.remove(...Array.from(select.classList).filter(x => x.startsWith("currency-registry-")));
      select.classList.add(fontClass(select.value));
    });
    host.querySelectorAll('.currency-picker').forEach(picker => {
      const chips = Array.from(picker.querySelectorAll(':scope > .currency-chip[data-currency]'));
      if (chips.length < 2) return;
      const selected = String(picker.querySelector('.currency-chip.active')?.dataset?.currency || "").toUpperCase();
      chips.forEach(chip => chip.remove());
      all().forEach(c => {
        const btn = document.createElement("button"); btn.type = "button"; btn.className = `currency-chip${c.code === selected ? " active" : ""}`; btn.dataset.currency = c.code;
        const span = document.createElement("span"); span.className = fontClass(c.code); span.textContent = c.symbol;
        const label = document.createElement("span"); label.textContent = c.code;
        btn.append(span, label); picker.appendChild(btn);
      });
    });
  }

  rebuild(FALLBACK);
  window.TriplemCurrencyRegistry = { all, codes, supported, landingRegions, get, normalize, fontClass, optionLabel, billingCurrencyForCountry, planPrice, teamPrice, demoUnitsPerAED, hydrate, get registry(){ return registry; } };
  window.TRIPLEM_CURRENCY_REGISTRY_READY = fetch("Assets/config/currencies.json?v=20260906-002", { cache:"no-store" })
    .then(r => { if (!r.ok) throw new Error("Currency registry unavailable"); return r.json(); })
    .then(data => { if (!rebuild(data)) throw new Error("Currency registry is empty"); return registry; })
    .catch(() => registry)
    .then(data => { try { hydrate(document); } catch (_) {} return data; });
})();
