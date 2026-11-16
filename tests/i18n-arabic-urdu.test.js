"use strict";
// Triplem VIP in Arabic and Urdu (2026-11-16): /ar/ and /ur/ pages, the shared dictionary,
// the language buttons, the saved preference and right-to-left styles and PDFs.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");
const core = require(path.join(root, "Assets/app/i18n/00-i18n-core.js"));

function loadDict(lang) {
  const src = read(`Assets/i18n/${lang}.js`);
  const json = src.slice(src.indexOf("=") + 1).trim().replace(/;\s*$/, "");
  return JSON.parse(json);
}

test("generated Arabic/Urdu pages, dictionaries and RTL styles are up to date", () => {
  execFileSync(process.execPath, [path.join(root, "scripts/build_i18n.js"), "--check"], { cwd: root, stdio: "pipe" });
  execFileSync(process.execPath, [path.join(root, "scripts/build_rtl_css.js"), "--check"], { cwd: root, stdio: "pipe" });
});

test("/ar/ and /ur/ pages: right-to-left, own canonical URL, fonts, dictionary before the core", () => {
  for (const [lang, locale, font] of [["ar", "ar_AE", "Noto+Naskh+Arabic"], ["ur", "ur_PK", "Noto+Nastaliq+Urdu"]]) {
    const html = read(`${lang}/index.html`);
    assert.match(html, new RegExp(`<html[^>]*lang="${lang}"[^>]*dir="rtl"`));
    assert.match(html, /<base href="\/" \/>/);
    assert.match(html, new RegExp(`rel="canonical" href="https://triplem\\.vip/${lang}/"`));
    assert.match(html, new RegExp(`og:locale" content="${locale}"`));
    assert.ok(html.includes(font), `${lang}: ${font}`);
    assert.match(html, /app\.bundle\.rtl\.css/);
    assert.ok(html.indexOf(`/Assets/i18n/${lang}.js`) < html.indexOf("00-i18n-core.js"), "dictionary loads first");
    assert.ok(html.indexOf("02-i18n-pdf.js") > html.indexOf("jspdf.plugin.autotable"), "PDF support after jsPDF");
    assert.doesNotMatch(html, /i18n:redirect-start/, "no language redirect on the translated page");
    assert.match(html, /hreflang="en"/); assert.match(html, /hreflang="ar"/); assert.match(html, /hreflang="ur"/);
  }
  const en = read("index.html");
  assert.match(en, /i18n:redirect-start[\s\S]*triplem\.lang[\s\S]*i18n:redirect-end/);
  assert.match(en, /data-lang-picker/);
});

test("the dictionary translates exact text, templates and button verbs", () => {
  const ar = core.createTranslator(loadDict("ar"));
  const ur = core.createTranslator(loadDict("ur"));
  assert.equal(ar.translate("Expenses"), "المصروفات");
  assert.equal(ur.translate("Expenses"), "اخراجات");
  assert.equal(ar.translate("Open {0}".replace("{0}", "Notes")), "فتح الملاحظات", "captured values are translated too");
  assert.equal(ar.translate("Page 2 of 5"), "الصفحة 2 من 5");
  assert.equal(ur.translate("Page 2 of 5"), "صفحہ 2 از 5");
  assert.equal(ar.translate("Open"), "مفتوح", "status");
  assert.equal(ar.translate("[btn] Open"), "فتح", "button verb");
  assert.equal(ar.translate("Choose account:"), ar.translate("Choose account") + ":");
});

test("dictionary hygiene: placeholders match and no translation is left in English", () => {
  for (const lang of ["ar", "ur"]) {
    const d = loadDict(lang);
    const ph = s => (String(s).replace(/\{(\d+)-\}/g, "{$1}").match(/\{\d+\}/g) || []).sort().join(",");
    for (const [en, tr] of Object.entries(d.p || {})) assert.equal(ph(tr), ph(en), `${lang} placeholders: ${en}`);
    let english = 0;
    for (const [en, tr] of Object.entries(d.s || {})) {
      if (/[؀-ۿ]/.test(tr)) continue;
      // Allowed to stay Latin: brand, codes, numbers, symbols, file types and product names.
      if (/^(Triplem VIP|TRIPLEM VIP|TRIPLE|M|VIP|Triplem|Triplem AI|English|iOS|Ctrl|Esc|Gemini|PDF|SWIFT \/ BIC|Windows Hello|[©×]|[A-Z0-9 .\/:|+-]{1,24}|IBAN: [A-Z0-9]+|\S*[@.]\S*)$/.test(tr)) continue;
      if (/^(اردو|العربية)$/.test(tr)) continue;
      english++;
      assert.fail(`${lang}: "${en}" → "${tr}" is not translated`);
    }
    assert.equal(english, 0);
  }
});

test("language choice: saved on the device, on the account, and in /ar/ /ur/ URLs", () => {
  const rt = read("Assets/app/i18n/01-i18n-runtime.js");
  assert.match(rt, /triplem\.lang/);
  assert.match(rt, /app_user_prefs\?on_conflict=owner_id,pref_key/);
  assert.match(rt, /ui_language/);
  assert.match(rt, /resolution=merge-duplicates/);
  const admin = read("Assets/app/admin/01-admin.js");
  assert.match(admin, /function accountLanguageCardHtml\(/);
  assert.match(admin, /data-lang-choice/);
  assert.match(read("Assets/app/auth/02-auth-welcome-trial.js"), /signup-lang-row" data-lang-picker/);
  assert.match(read("scripts/build_production.js"), /"ar", "ur"/);
});

test("Arabic/Urdu PDFs: translated, shaped by the browser and mirrored", () => {
  const pdf = read("Assets/app/i18n/02-i18n-pdf.js");
  assert.match(pdf, /T\.lang === "en"\) return/, "English PDFs are untouched");
  assert.match(pdf, /API\.events\.push\(\["initialized"/);
  for (const m of ["text", "getTextWidth", "getStringUnitWidth", "splitTextToSize", "rect", "roundedRect", "line", "addImage", "autoTable", "link"]) {
    assert.match(pdf, new RegExp(`wrap\\("${m}"`), `${m} is handled`);
  }
  assert.match(pdf, /Noto Nastaliq Urdu/);
  assert.match(pdf, /depth > 0/, "internal calls are not mirrored twice");
});

test("brand wordmark and data stay left-to-right on RTL pages", () => {
  const css = read("Assets/style/71-i18n.css");
  assert.match(css, /html\[dir="rtl"\] :is\(\.auth-resume-brand,\.landing-brand-mark,\.landing-brand-name/);
  assert.match(css, /input\[type="number"\]/);
  const rtl = read("Assets/style/app.bundle.rtl.css");
  assert.ok(rtl.length > 100000);
});
