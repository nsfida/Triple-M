/* Triplem VIP · language runtime (2026-11-16)
 *
 * Pages: English at https://triplem.vip/, Arabic at /ar/ and Urdu at /ur/.
 * The Arabic and Urdu pages are generated from the English page (scripts/build_i18n.js)
 * with their static text already translated; this runtime translates everything the
 * app draws afterwards (panels, lists, messages, dialogs, dates) and remembers the
 * language:
 *   - on this device (localStorage "triplem.lang"), also while signed out;
 *   - in the signed-in user's account (app_user_prefs, pref_key "ui_language"), so the
 *     language follows the user to other devices.
 * English stays exactly as it was: on the English page nothing is translated.
 */
(function initTriplemI18n(global){
  "use strict";
  const LANGS = {
    en: { name: "English", native: "English", short: "EN", dir: "ltr", path: "/", locale: "en-GB" },
    ar: { name: "Arabic", native: "العربية", short: "عربي", dir: "rtl", path: "/ar/", locale: "ar-AE-u-nu-latn-ca-gregory" },
    ur: { name: "Urdu", native: "اردو", short: "اردو", dir: "rtl", path: "/ur/", locale: "ur-PK-u-nu-latn-ca-gregory" }
  };
  const STORE_KEY = "triplem.lang";
  const PREF_KEY = "ui_language";
  const pathLang = (() => { const m = /^\/(ar|ur)(?:\/|$)/.exec(location.pathname); return m ? m[1] : "en"; })();
  const LANG = pathLang;
  const info = LANGS[LANG];
  const doc = document;
  const html = doc.documentElement;

  function savedLanguage(){ try { const v = localStorage.getItem(STORE_KEY); return LANGS[v] ? v : ""; } catch (_) { return ""; } }
  function remember(lang){ try { localStorage.setItem(STORE_KEY, lang); } catch (_) {} }

  // URL of the same place in another language (keeps query and hash).
  function urlFor(lang){
    const rest = location.pathname.replace(/^\/(ar|ur)(?=\/|$)/, "").replace(/^\/index\.html$/, "/") || "/";
    const base = LANGS[lang].path.replace(/\/$/, "");
    const p = rest === "/" ? LANGS[lang].path : base + rest;
    return p + location.search + location.hash;
  }

  // ── translator ─────────────────────────────────────────────────────────────────────────
  let T = null;
  if (LANG !== "en" && global.TriplemI18nCore && global.TRIPLEM_I18N_DICT && global.TRIPLEM_I18N_DICT.lang === LANG) {
    T = global.TriplemI18nCore.createTranslator(global.TRIPLEM_I18N_DICT);
  }
  const t = text => (T ? (T.translate(text) ?? text) : text);

  const ATTRS = ["placeholder", "title", "aria-label", "alt", "data-tooltip", "aria-description"];
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "CODE", "PRE", "SVG", "MATH", "TEMPLATE"]);
  const done = new WeakMap(); // text node -> translated value we wrote
  const BTN_SEL = "button,a,[role=button],[role=tab],[role=menuitem],[role=menuitemradio],[role=option],option,.btn";

  function skipped(el){
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (SKIP_TAGS.has(n.tagName)) return true;
      if (n.getAttribute("translate") === "no" || n.classList.contains("notranslate") || n.isContentEditable) return true;
    }
    return false;
  }
  function textNode(node){
    const v = node.nodeValue;
    if (!v || done.get(node) === v || !/[A-Za-z]/.test(v)) return;
    const p = node.parentElement;
    if (!p || skipped(p)) return;
    const tr = T.translateNodeText(v, p.closest(BTN_SEL) ? "btn" : "");
    if (tr != null && tr !== v) { done.set(node, tr); node.nodeValue = tr; }
  }
  function attrs(el){
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (v && /[A-Za-z]/.test(v)) { const tr = T.translate(v, el.matches(BTN_SEL) ? "btn" : ""); if (tr && tr !== v) el.setAttribute(a, tr); }
    }
    if (el.tagName === "INPUT" && /^(button|submit|reset)$/i.test(el.type) && /[A-Za-z]/.test(el.value)) {
      const tr = T.translate(el.value); if (tr) el.value = tr;
    }
  }
  function walk(rootNode){
    if (!rootNode) return;
    if (rootNode.nodeType === 3) return textNode(rootNode);
    if (rootNode.nodeType !== 1 && rootNode.nodeType !== 9 && rootNode.nodeType !== 11) return;
    if (rootNode.nodeType === 1) { if (skipped(rootNode)) return; attrs(rootNode); }
    const w = doc.createTreeWalker(rootNode, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: n => (n.nodeType === 1 && (SKIP_TAGS.has(n.tagName) || n.getAttribute("translate") === "no" || n.classList.contains("notranslate")) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
    });
    for (let n = w.nextNode(); n; n = w.nextNode()) { if (n.nodeType === 3) textNode(n); else attrs(n); }
  }
  function translateTitle(){
    const v = doc.title; if (!v) return;
    const tr = T.translate(v) || T.translate(v.replace(/\s*[|·–-]\s*Triplem VIP\s*$/, ""));
    if (tr && tr !== v) doc.title = /Triplem VIP/.test(tr) || !/Triplem VIP/.test(v) ? tr : `${tr} | Triplem VIP`;
  }

  function startObserver(){
    walk(doc.body || html);
    translateTitle();
    const obs = new MutationObserver(records => {
      for (const r of records) {
        if (r.type === "characterData") textNode(r.target);
        else if (r.type === "childList") { for (const n of r.addedNodes) walk(n); if (r.target.nodeName === "TITLE") translateTitle(); }
        else if (r.type === "attributes" && r.target.nodeType === 1 && !skipped(r.target)) attrs(r.target);
      }
    });
    obs.observe(html, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS.concat(["value"]) });
  }

  // ── built-in dialogs, dates and history in Arabic / Urdu ───────────────────────────────────
  function patchPlatform(){
    for (const name of ["alert", "confirm"]) {
      const orig = global[name];
      if (typeof orig === "function") global[name] = function(message){ return orig.call(this, translateMessage(message)); };
    }
    const origPrompt = global.prompt;
    if (typeof origPrompt === "function") global.prompt = function(message, def){ return origPrompt.call(this, translateMessage(message), def); };

    // Dates: month and day names in Arabic / Urdu, digits stay 0-9.
    const L = info.locale;
    const pick = loc => (loc == null || /^en\b/i.test(String(Array.isArray(loc) ? loc[0] : loc)) ? L : loc);
    const D = Date.prototype;
    for (const m of ["toLocaleDateString", "toLocaleString", "toLocaleTimeString"]) {
      const orig = D[m];
      D[m] = function(loc, opts){ return orig.call(this, pick(loc), opts); };
    }
    const OrigDTF = Intl.DateTimeFormat;
    const DTF = function(loc, opts){ return new OrigDTF(pick(loc), opts); };
    DTF.prototype = OrigDTF.prototype;
    DTF.supportedLocalesOf = OrigDTF.supportedLocalesOf.bind(OrigDTF);
    try { Intl.DateTimeFormat = DTF; } catch (_) {}
    const ORT = Intl.RelativeTimeFormat;
    if (ORT) {
      const RTF = function(loc, opts){ return new ORT(pick(loc), opts); };
      RTF.prototype = ORT.prototype; RTF.supportedLocalesOf = ORT.supportedLocalesOf.bind(ORT);
      try { Intl.RelativeTimeFormat = RTF; } catch (_) {}
    }
  }
  // Messages are often several sentences joined; translate them one line at a time.
  function translateMessage(message){
    const s = String(message ?? "");
    if (!T || !/[A-Za-z]/.test(s)) return message;
    const whole = T.translate(s); if (whole) return whole;
    return s.split(/\n/).map(line => { const tr = T.translate(line); return tr == null ? line : tr; }).join("\n");
  }

  // The Arabic / Urdu pages use <base href="/"> so the app's relative file paths keep working.
  // Relative history URLs and "#section" links must still stay on /ar/ or /ur/.
  function patchBaseUrl(){
    for (const m of ["pushState", "replaceState"]) {
      const orig = history[m];
      history[m] = function(state, title, url){
        if (typeof url === "string" && url && !/^([a-z][a-z0-9+.-]*:|\/)/i.test(url)) url = new URL(url, location.href).href;
        return orig.call(this, state, title, url);
      };
    }
    global.addEventListener("click", e => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest?.("a[href]");
      if (!a || a.target === "_blank") return;
      const raw = a.getAttribute("href");
      if (!raw || raw[0] !== "#") return;
      e.preventDefault();
      if (raw.length > 1) location.hash = raw; else history.replaceState(history.state, "", location.pathname + location.search);
    });
  }

  // ── choosing a language ─────────────────────────────────────────────────────────────────
  function signedInOwner(){
    try {
      const u = global.state?.sessionUser;
      if (!u || !u.id) return "";
      if (typeof global.isGuestMode === "function" && global.isGuestMode()) return "";
      return String(u.id);
    } catch (_) { return ""; }
  }
  async function saveAccountLanguage(lang){
    const owner = signedInOwner();
    if (!owner || typeof global.supabase !== "function") return false;
    try {
      await global.supabase("app_user_prefs?on_conflict=owner_id,pref_key", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ owner_id: owner, pref_key: PREF_KEY, pref_value: lang })
      });
      return true;
    } catch (_) { return false; }
  }
  async function loadAccountLanguage(){
    const owner = signedInOwner();
    if (!owner || typeof global.supabase !== "function") return "";
    try {
      const rows = await global.supabase(`app_user_prefs?select=pref_value&owner_id=eq.${encodeURIComponent(owner)}&pref_key=eq.${PREF_KEY}&limit=1`);
      const v = Array.isArray(rows) && rows[0] ? String(rows[0].pref_value || "") : "";
      return LANGS[v] ? v : "";
    } catch (_) { return ""; }
  }
  async function setLanguage(lang, { save = true } = {}){
    if (!LANGS[lang]) return;
    remember(lang);
    if (save) await saveAccountLanguage(lang);
    if (lang !== LANG) location.assign(urlFor(lang));
  }
  // After sign-in: the account's language wins (once per page load).
  let accountChecked = false;
  async function syncWithAccount(){
    if (accountChecked || !signedInOwner()) return;
    accountChecked = true;
    const acct = await loadAccountLanguage();
    if (!acct) { await saveAccountLanguage(LANG); return; } // first time: keep what the user is using now
    remember(acct);
    if (acct !== LANG) location.replace(urlFor(acct));
  }
  function watchSignIn(){
    const check = () => { if (doc.body?.classList.contains("tm-app-on")) syncWithAccount(); else accountChecked = false; };
    const start = () => { check(); new MutationObserver(check).observe(doc.body, { attributes: true, attributeFilter: ["class"] }); };
    if (doc.body) start(); else doc.addEventListener("DOMContentLoaded", start, { once: true });
  }

  // Language buttons: any element with [data-lang-picker] becomes a small menu.
  function pickerHtml(compact){
    const items = Object.entries(LANGS).map(([k, v]) => `<button type="button" role="menuitemradio" aria-checked="${k === LANG}" data-lang-choice="${k}" lang="${k}" dir="${v.dir}"><span>${v.native}</span>${k === LANG ? '<i class="fa-solid fa-check" aria-hidden="true"></i>' : ""}</button>`).join("");
    return `<button type="button" class="tm-lang-btn" aria-haspopup="menu" aria-expanded="false" data-lang-toggle translate="no" aria-label="${info.native}" title="${info.native}"><i class="fa-solid fa-language" aria-hidden="true"></i><span class="tm-lang-label">${compact ? info.short : info.native}</span><i class="fa-solid fa-chevron-down tm-lang-caret" aria-hidden="true"></i></button><div class="tm-lang-menu" role="menu" hidden translate="no">${items}</div>`;
  }
  function mountPickers(scope){
    (scope || doc).querySelectorAll("[data-lang-picker]:not([data-lang-ready])").forEach(el => {
      el.setAttribute("data-lang-ready", "1");
      el.classList.add("tm-lang");
      const compact = el.getAttribute("data-lang-picker") === "compact";
      if (compact) el.classList.add("tm-lang--compact");
      el.innerHTML = pickerHtml(compact);
    });
  }
  function onPickerClick(e){
    const toggle = e.target.closest?.("[data-lang-toggle]");
    const choice = e.target.closest?.("[data-lang-choice]");
    doc.querySelectorAll(".tm-lang-menu:not([hidden])").forEach(m => {
      if (!toggle || m.parentElement !== toggle.parentElement) { m.hidden = true; m.parentElement.querySelector("[data-lang-toggle]")?.setAttribute("aria-expanded", "false"); }
    });
    if (toggle) {
      const menu = toggle.parentElement.querySelector(".tm-lang-menu");
      menu.hidden = !menu.hidden;
      toggle.setAttribute("aria-expanded", String(!menu.hidden));
      return;
    }
    if (choice) { e.preventDefault(); setLanguage(choice.dataset.langChoice); }
    // <select data-lang-select> in Settings
  }
  function onSelectChange(e){
    const sel = e.target.closest?.("select[data-lang-select]");
    if (sel) setLanguage(sel.value);
  }

  // ── start ───────────────────────────────────────────────────────────────────────────────
  if (LANG !== "en") { patchPlatform(); patchBaseUrl(); }
  if (savedLanguage() !== LANG) remember(LANG); // opening /ar/ or /ur/ (or English) directly chooses it
  doc.addEventListener("click", onPickerClick);
  doc.addEventListener("change", onSelectChange);
  const ready = () => {
    mountPickers();
    new MutationObserver(recs => { for (const r of recs) for (const n of r.addedNodes) if (n.nodeType === 1) { if (n.matches?.("[data-lang-picker]")) mountPickers(n.parentElement); else if (n.querySelector?.("[data-lang-picker]")) mountPickers(n); } }).observe(doc.body, { childList: true, subtree: true });
    doc.querySelectorAll("select[data-lang-select]").forEach(s => { s.value = LANG; });
    if (T) startObserver();
    watchSignIn();
  };
  if (doc.body) ready(); else doc.addEventListener("DOMContentLoaded", ready, { once: true });

  global.TriplemI18n = Object.freeze({
    lang: LANG, dir: info.dir, locale: info.locale, languages: LANGS,
    t, translateMessage, setLanguage, urlFor, saved: savedLanguage,
    translateNode: n => { if (T) walk(n); }
  });
})(window);
