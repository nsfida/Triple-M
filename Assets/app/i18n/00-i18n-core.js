/* Triplem VIP · translation core (2026-11-16)
 *
 * Shared by the browser runtime (01-i18n-runtime.js) and the build script
 * (scripts/build_i18n.js), so the Arabic and Urdu pages are translated the same way
 * at build time (static HTML) and at run time (everything the app draws later).
 *
 * A dictionary is { lang, s: { "English": "ترجمة" }, p: { "{0} line(s)": "{0} سطر" } }.
 *  - s: whole texts, matched exactly after collapsing white space.
 *  - p: templates; {0}, {1}… stand for values (numbers, names, dates). The translation
 *       may reorder them. Values that are themselves known texts are translated too.
 * Nothing is translated partially: a text either matches as a whole or is left alone,
 * so names, notes and other user data are never altered.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TriplemI18nCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const WS = /\s+/g;
  const norm = s => String(s == null ? "" : s).replace(WS, " ").trim();
  // Numbers as the app prints them: 1,234.56  -3  12%  2026-11-16  10:30  #12
  const NUM = /[-+−]?\d[\d,]*(?:\.\d+)?/g;
  const PH = /\{(\d+)\}/g;
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const SUFFIXES = [":", "：", "…", "...", " *", "*", ".", "!", "?", " →", " ›"];

  function createTranslator(dict) {
    const lang = (dict && dict.lang) || "";
    const suffixFor = sfx => {
      switch (sfx.trim()) {
        case ":": case "：": return ":";
        case "…": case "...": return "…";
        case "*": return " *";
        case ".": return lang === "ur" ? "۔" : ".";
        case "?": return "؟";
        case "!": return "!";
        case "→": case "›": return " ←";
        default: return sfx;
      }
    };
    const exact = new Map();
    for (const [k, v] of Object.entries((dict && dict.s) || {})) if (v) exact.set(norm(k), v);
    const numeric = new Map();   // skeleton with {#} -> [{ order, tr }]
    const buckets = new Map();   // first/last literal word -> [{ tpl, tr, re }]
    for (const [tplRaw, tr] of Object.entries((dict && dict.p) || {})) {
      if (!tr) continue;
      const tpl = norm(tplRaw);
      const order = [];
      tpl.replace(PH, (_, i) => { order.push(+i); return ""; });
      if (!order.length) { exact.set(tpl, tr); continue; }
      const skeleton = tpl.replace(PH, "{#}");
      if (!numeric.has(skeleton)) numeric.set(skeleton, []);
      numeric.get(skeleton).push({ order, tr });
      const literals = tpl.split(PH).filter((_, i) => i % 2 === 0);
      const first = literals[0].trim().split(" ")[0];
      const last = literals[literals.length - 1].trim().split(" ").pop();
      const key = first ? "^" + first : last ? "$" + last : "";
      if (!key) continue; // a template made only of values cannot be matched safely
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push({ tpl, tr, order, re: null, lit: literals.join("").length });
    }
    // The most specific template wins: "Open installment plan for {0}" before "Open {0}".
    for (const list of buckets.values()) list.sort((a, b) => b.lit - a.lit);
    // "{1-}" in a translation consumes value 1 without printing it (English plural endings
    // such as "item{1}" -> "s" have no place in Arabic or Urdu).
    const fill = (tr, order, values) => {
      const byIndex = {};
      order.forEach((idx, pos) => { byIndex[idx] = values[pos]; });
      return tr.replace(/\{(\d+)(-?)\}/g, (m, i, drop) => (i in byIndex ? (drop ? "" : sub(byIndex[i])) : m));
    };
    // A value inside a template may itself be a known text ("Paid", "Open"…).
    const sub = v => {
      const n = norm(v);
      return exact.get(n) || v;
    };
    function viaTemplates(text) {
      // 1. numbers only: "3 line(s)" -> "{#} line(s)"
      const values = [];
      const skeleton = text.replace(NUM, m => { values.push(m); return "{#}"; });
      if (values.length) {
        const hits = numeric.get(skeleton);
        if (hits && hits[0].order.length === values.length) return fill(hits[0].tr, hits[0].order, values);
      }
      // 2. general values, looked up by the first or last word of the text
      const words = text.split(" ");
      const head = buckets.get("^" + words[0]) || [], tail = buckets.get("$" + words[words.length - 1]) || [];
      const cands = !head.length ? tail : !tail.length ? head : head.concat(tail).sort((a, b) => b.lit - a.lit);
      for (const c of cands) {
        if (!c.re) c.re = new RegExp("^" + c.tpl.split(PH).map((part, i) => (i % 2 === 0 ? esc(part) : "(.*?)")).join("") + "$");
        const m = c.re.exec(text);
        if (m) return fill(c.tr, c.order, m.slice(1));
      }
      return null;
    }
    // ctx "btn": text on a button, link, tab or menu item. A few words need a verb there
    // ("Open", "Spend", "Close") and a noun or adjective elsewhere; such texts have a
    // second entry "[btn] Open" in the dictionary.
    function translate(raw, ctx) {
      const text = norm(raw);
      if (!text || !/[A-Za-z]/.test(text)) return null;
      if (ctx === "btn") { const b = exact.get("[btn] " + text); if (b) return b; }
      const hit = exact.get(text);
      if (hit) return hit;
      for (const sfx of SUFFIXES) {
        if (text.length > sfx.length && text.endsWith(sfx)) {
          const h = exact.get(text.slice(0, -sfx.length).trim());
          if (h) return h + suffixFor(sfx);
        }
      }
      return viaTemplates(text);
    }
    // Keep the original leading / trailing spaces of a DOM text node.
    function translateNodeText(value, ctx) {
      const tr = translate(value, ctx);
      if (tr == null) return null;
      const lead = /^\s*/.exec(value)[0], trail = /\s*$/.exec(value)[0];
      return (lead ? " " : "") + tr + (trail ? " " : "");
    }
    return { translate, translateNodeText, size: exact.size + numeric.size };
  }
  return { createTranslator, norm };
});
