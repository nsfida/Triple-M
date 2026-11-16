#!/usr/bin/env node
"use strict";
/*
 * Triplem VIP · Arabic and Urdu build (2026-11-16)
 *
 * 1. Merges the translations in i18n/src/*.json (rows of [English, Arabic, Urdu]) into
 *    Assets/i18n/ar.js and Assets/i18n/ur.js (loaded only by the Arabic / Urdu pages).
 * 2. Generates ar/index.html and ur/index.html from index.html: lang/dir, <base href="/">,
 *    absolute asset paths, right-to-left stylesheets, Arabic / Urdu fonts, the dictionary,
 *    translated static text, canonical / hreflang / Open Graph for that language.
 *    The pages are served as https://triplem.vip/ar/ and https://triplem.vip/ur/.
 *
 * Usage: node scripts/build_i18n.js [--check]   (--check fails when generated files are stale)
 */
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const { createTranslator, norm } = require(path.join(root, "Assets/app/i18n/00-i18n-core.js"));
const SITE = "https://triplem.vip";
const LANGS = {
  ar: { name: "العربية", locale: "ar_AE", fonts: "family=Inter:wght@400;500;600;700&family=Noto+Naskh+Arabic:wght@400;500;600;700", inLanguage: "ar" },
  ur: { name: "اردو", locale: "ur_PK", fonts: "family=Inter:wght@400;500;600;700&family=Noto+Nastaliq+Urdu:wght@400;500;600;700&family=Noto+Naskh+Arabic:wght@400;500;600;700", inLanguage: "ur" }
};
const PH = /\{\d+\}/g;

function loadRows(){
  const dir = path.join(root, "i18n", "src");
  const rows = [];
  if (!fs.existsSync(dir)) return rows;
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort()) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    for (const r of data) {
      if (!Array.isArray(r) || r.length < 3) throw new Error(`${f}: every row must be [English, Arabic, Urdu]: ${JSON.stringify(r).slice(0, 120)}`);
      rows.push({ en: r[0], ar: r[1], ur: r[2], file: f });
    }
  }
  return rows;
}
function placeholders(s){ return (String(s).replace(/\{(\d+)-\}/g, "{$1}").match(PH) || []).sort().join(","); }
function buildDicts(rows){
  const dicts = { ar: { lang: "ar", s: {}, p: {} }, ur: { lang: "ur", s: {}, p: {} } };
  const problems = [];
  for (const r of rows) {
    const en = norm(r.en);
    if (!en) continue;
    for (const lang of ["ar", "ur"]) {
      const tr = String(r[lang] || "").trim();
      if (!tr) continue;
      if (placeholders(en) !== placeholders(tr)) problems.push(`${r.file}: ${lang} placeholders differ for "${en.slice(0, 80)}"`);
      (PH.test(en) ? dicts[lang].p : dicts[lang].s)[en] = tr;
      PH.lastIndex = 0;
    }
  }
  return { dicts, problems };
}

// ── HTML helpers ─────────────────────────────────────────────────────────────────────────
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", times: "×", middot: "·", rarr: "→", larr: "←", hellip: "…", mdash: "—", ndash: "–", copy: "©", reg: "®", trade: "™", bull: "•", check: "✓" };
const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENT[e.toLowerCase()] ?? m));
const encText = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const encAttr = s => encText(s).replace(/"/g, "&quot;");
const TR_ATTRS = ["placeholder", "title", "aria-label", "alt", "data-tooltip", "aria-description"];

const BTN_TAGS = new Set(["button", "a", "option"]);
let btnDepth = 0;
function translateHtml(html, T, stats){
  btnDepth = 0;
  // split out parts that must not be touched
  const parts = html.split(/(<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<!--[\s\S]*?-->|<textarea\b[\s\S]*?<\/textarea>)/i);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      if (/^<textarea/i.test(part)) return part.replace(/^<textarea\b[^>]*>/i, tag => translateAttrs(tag, T, stats));
      return part;
    }
    // tags: translate attributes; text between tags: translate whole text
    return part.replace(/(<\/?[a-zA-Z][^>]*>)([^<]*)/g, (m, tag, text) => {
      const name = (/^<\/?([a-zA-Z0-9-]+)/.exec(tag) || [])[1]?.toLowerCase() || "";
      const closing = tag[1] === "/";
      if (BTN_TAGS.has(name) || /\brole="(button|tab|menuitem|option)"/.test(tag)) { if (closing) btnDepth = Math.max(0, btnDepth - 1); else if (!/\/>$/.test(tag)) btnDepth++; }
      const t2 = closing ? tag : translateAttrs(tag, T, stats, BTN_TAGS.has(name) ? "btn" : "");
      return t2 + (text ? translateText(text, T, stats, btnDepth > 0 ? "btn" : "") : "");
    });
  }).join("");
}
function translateText(raw, T, stats, ctx){
  if (!/[A-Za-z]/.test(raw)) return raw;
  const plain = decode(raw);
  const tr = T.translateNodeText(plain, ctx);
  if (tr == null) { stats.miss.add(norm(plain)); return raw; }
  stats.hit++;
  return encText(tr);
}
function translateAttrs(tag, T, stats, ctx){
  return tag.replace(new RegExp(`\\s(${TR_ATTRS.join("|")})="([^"]*)"`, "g"), (m, name, val) => {
    if (!/[A-Za-z]/.test(val)) return m;
    const tr = T.translate(decode(val), ctx);
    if (tr == null) { stats.miss.add(norm(decode(val))); return m; }
    stats.hit++;
    return ` ${name}="${encAttr(tr)}"`;
  });
}

function buildPage(lang, english, dict){
  const T = createTranslator(dict);
  const info = LANGS[lang];
  const stats = { hit: 0, miss: new Set() };
  let html = english;
  // English-only start-up redirect is not needed here
  html = html.replace(/\s*<!-- i18n:redirect-start[\s\S]*?<!-- i18n:redirect-end -->/, "");
  html = html.replace(/<html lang="en">/, `<html lang="${lang}" dir="rtl">`);
  html = html.replace(/<head>\n/, `<head>\n  <base href="/" />\n  <!-- GENERATED by scripts/build_i18n.js from index.html (${info.name}). Do not edit: change index.html or i18n/src and run npm run build:i18n. -->\n`);
  // absolute paths for files (the page lives in /${lang}/)
  html = html.replace(/\b(src|href)="(?!https?:|\/\/|\/|#|data:|mailto:|tel:|javascript:|ms-windows-store:)([^"]+)"/g, (m, a, u) => `${a}="/${u}"`);
  html = html.replace(/\bhref="#([^"]*)"/g, (m, h) => `href="/${lang}/#${h}"`);
  // right-to-left stylesheets + fonts + dictionary
  html = html.replace(/\/Assets\/style\/app\.bundle\.css/g, "/Assets/style/app.bundle.rtl.css").replace(/\/Assets\/style\/app\.feature\.bundle\.css/g, "/Assets/style/app.feature.bundle.rtl.css");
  const fontTags = `  <link rel="preconnect" href="https://fonts.googleapis.com" />\n  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />\n  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?${info.fonts}&display=swap" />\n`;
  html = html.replace(/(\s*<link rel="canonical")/, `\n${fontTags.trimEnd()}$1`);
  html = html.replace(/(\s*<script defer src="\/Assets\/app\/i18n\/00-i18n-core\.js[^"]*"><\/script>)/, `\n  <script defer src="/Assets/i18n/${lang}.js?v=${dictVersion(dict)}"></script>$1`);
  // canonical, Open Graph, hreflang
  html = html.replace(/<link rel="canonical" href="https:\/\/triplem\.vip\/" \/>/, `<link rel="canonical" href="${SITE}/${lang}/" />`);
  html = html.replace(/<meta property="og:url" content="https:\/\/triplem\.vip\/" \/>/, `<meta property="og:url" content="${SITE}/${lang}/" />`);
  html = html.replace(/<meta property="og:locale" content="en_US" \/>/, `<meta property="og:locale" content="${info.locale}" />`);
  html = html.replace(/\s*<meta property="og:locale:alternate" content="[^"]*" \/>/g, "");
  html = html.replace(/(<meta property="og:locale" content="[^"]*" \/>)/, `$1\n  <meta property="og:locale:alternate" content="en_US" />\n  <meta property="og:locale:alternate" content="${lang === "ar" ? "ur_PK" : "ar_AE"}" />`);
  // meta descriptions and titles
  html = html.replace(/(<meta (?:name|property)="(?:description|og:title|og:description|twitter:title|twitter:description|og:image:alt|twitter:image:alt|apple-mobile-web-app-title|application-name)" content=")([^"]*)(")/g, (m, a, v, b) => {
    const tr = T.translate(decode(v)); if (tr == null) { stats.miss.add(norm(decode(v))); return m; } return a + encAttr(tr) + b;
  });
  html = html.replace(/<title>([^<]*)<\/title>/, (m, v) => { const tr = T.translate(decode(v)); if (tr == null) { stats.miss.add(norm(decode(v))); return m; } return `<title>${encText(tr)}</title>`; });
  // structured data: a page-level entry in this language that points to the English entities
  const title = (/<title>([^<]*)<\/title>/.exec(html) || [])[1] || "Triplem VIP";
  const desc = (/<meta name="description" content="([^"]*)"/.exec(html) || [])[1] || "";
  const ld = { "@context": "https://schema.org", "@graph": [{
    "@type": "WebPage", "@id": `${SITE}/${lang}/#webpage`, url: `${SITE}/${lang}/`, name: decode(title), description: decode(desc),
    inLanguage: info.inLanguage, isPartOf: { "@id": `${SITE}/#website` }, about: [{ "@id": `${SITE}/#software` }, { "@id": `${SITE}/#windows-app` }, { "@id": `${SITE}/#brand` }],
    publisher: { "@id": `${SITE}/#organization` }, translationOfWork: { "@id": `${SITE}/#webpage` }
  }]};
  html = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, `<script type="application/ld+json">\n${JSON.stringify(ld, null, 2)}\n  </script>`);
  // visible text and attributes
  html = translateHtml(html, T, stats);
  return { html, stats };
}
function dictVersion(dict){
  return require("node:crypto").createHash("sha256").update(JSON.stringify(dict)).digest("hex").slice(0, 12);
}

function build({ check = false } = {}){
  const rows = loadRows();
  const { dicts, problems } = buildDicts(rows);
  if (problems.length) { console.error(problems.slice(0, 40).join("\n")); throw new Error(`${problems.length} translation placeholder problem(s).`); }
  const english = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const outputs = [];
  const report = {};
  for (const lang of Object.keys(LANGS)) {
    const dict = dicts[lang];
    outputs.push([`Assets/i18n/${lang}.js`, `/* GENERATED by scripts/build_i18n.js from i18n/src. ${LANGS[lang].name}: ${Object.keys(dict.s).length} texts, ${Object.keys(dict.p).length} templates. */\nwindow.TRIPLEM_I18N_DICT=${JSON.stringify(dict)};\n`]);
    const { html, stats } = buildPage(lang, english, dict);
    outputs.push([`${lang}/index.html`, html]);
    report[lang] = { texts: Object.keys(dict.s).length, templates: Object.keys(dict.p).length, staticTranslated: stats.hit, staticMissing: stats.miss.size };
    if (process.env.I18N_MISSING) fs.writeFileSync(path.join(process.env.I18N_MISSING, `missing-${lang}.json`), JSON.stringify([...stats.miss], null, 1));
  }
  const stale = [];
  for (const [rel, body] of outputs) {
    const abs = path.join(root, rel);
    const cur = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
    if (cur !== body) { if (check) stale.push(rel); else { fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, body, "utf8"); } }
  }
  if (check && stale.length) { console.error(`Arabic/Urdu files are out of date: ${stale.join(", ")}. Run npm run build:i18n.`); process.exit(1); }
  console.log(check ? "Arabic/Urdu pages are up to date." : "Arabic/Urdu pages written.", JSON.stringify(report));
}
if (require.main === module) build({ check: process.argv.includes("--check") });
module.exports = { build, buildDicts, translateHtml, loadRows };
