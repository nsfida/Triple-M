"use strict";

/* Guards for Triplem VIP for Windows 3.9:
 *  - in-app PDF viewer for saved PDFs (address bar with the real path, Print)
 *  - print preview with paper, margins (custom), scale, pages, printer
 *  - search bar beside the section button (one small call per search)
 *  - migration 209 (read-only search function). */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const has = rel => fs.existsSync(path.join(root, rel));
const text = rel => fs.readFileSync(path.join(root, rel), "utf8");
const nativeDir = "scripts/windows_app/native";
const skipNative = has(`${nativeDir}/pdfview.go`) ? false : "Windows app source not present in this checkout";
const skipSql = files => files.every(has) ? false : "Database migrations are not present in this checkout";
const PDFJS = "Assets/app/lib/pdfjs-4.10.38";

test("3.9 native: only PDFs the app saved, size-limited, in chunks; previews in the app's own temp folder", { skip: skipNative }, () => {
  const v = text(`${nativeDir}/pdfview.go`);
  assert.match(v, /path, ok := completedFiles\[id\]/);
  assert.match(v, /if viewerKind\(path\) != "pdf" \{/);
  assert.match(v, /st\.Size\(\) > maxViewerFileBytes/);
  assert.match(v, /if !looksLikePDF\(data\) \{/);
  const p = text(`${nativeDir}/printing.go`);
  assert.match(p, /if isPreviewFileName\(e\.Name\(\)\) \{/, "only preview-<n>.pdf files are ever removed");
  assert.match(p, /dir := filepath\.Join\(os\.TempDir\(\), previewDirName\)/);
  assert.match(text(`${nativeDir}/logic.go`), /"file-read": true, "print-preview": true,/);
  assert.match(text(`${nativeDir}/logic.go`), /appVersionNative = "3\.10\.1"/);
  assert.match(text(`${nativeDir}/bridge.go`), /"pdfview"\}/);
  assert.match(text(`${nativeDir}/downloads.go`), /"path": finalPath, "view": viewerKind\(finalPath\)/);
  assert.match(text(`${nativeDir}/logic39_test.go`), /func TestPreviewFiles/);
});

test("3.9 PDF.js is bundled locally, loaded only when the viewer opens, without eval", () => {
  for (const f of ["pdf.min.mjs", "pdf.worker.min.mjs", "LICENSE", "standard_fonts", "cmaps"]) assert.ok(has(`${PDFJS}/${f}`), f);
  const js = text("Assets/app/desktop/02-pdf-viewer.js");
  assert.match(js, /if \(!kit \|\| !kit\.caps\.has\("pdfview"\)\) return;/);
  assert.match(js, /import\(new URL\(LIB \+ "pdf\.min\.mjs", document\.baseURI\)\.href\)/);
  assert.match(js, /isEvalSupported: false/);
  assert.doesNotMatch(text("index.html"), /pdf\.min\.mjs/, "not loaded with the page");
});

test("3.9 saved PDFs open in the viewer; other files keep their program", () => {
  const js = text("Assets/app/desktop/01-windows-desktop.js");
  assert.match(js, /const inApp = msg\.view === "pdf" && caps\.has\("pdfview"\) && typeof window\.TriplemPdfViewer\?\.openFile === "function";/);
  assert.match(js, /run: \(\) => \(inApp \? window\.TriplemPdfViewer\.openFile\(file\) : send\("download-open", \{ id \}\)\)/);
  assert.match(js, /if \(!context\.classic && previewAvailable\(\)\) \{/, "print panel becomes the preview, with the classic panel as fallback");
  assert.match(js, /if \(local\.printMode === "preview"\) return; \/\/ 3\.9: the preview PDF was made, not printed/);
  const html = text("index.html");
  assert.match(html, /<script defer src="Assets\/app\/desktop\/02-pdf-viewer\.js\?v=\d{8}-pdfview\d+"><\/script>/);
  assert.match(html, /<script defer src="Assets\/app\/desktop\/03-desktop-search\.js\?v=\d{8}-search\d+"><\/script>/);
});

function loadModules() {
  const sent = [];
  const handlers = new Map();
  const kit = {
    caps: new Set(["pdfview", "printpdf"]), send: (cmd, extra) => sent.push({ cmd, ...extra }),
    on: (t, fn) => { handlers.set(t, fn); return () => {}; }, notice() {}, esc: s => String(s), safe: v => (v === null || v === undefined ? "" : String(v)),
    allowed: () => true, signedInUserId: () => "u1", PAPER_MM: { a4: [210, 297], letter: [215.9, 279.4], legal: [215.9, 355.6], a5: [148, 210], a3: [297, 420] },
    MARGIN_MM: { none: 0, narrow: 6.35, normal: 10, wide: 19.05 }, validPages: p => /^\s*\d+(\s*-\s*\d+)?(\s*,\s*\d+(\s*-\s*\d+)?)*\s*$/.test(p)
  };
  const g = { console, setTimeout, clearTimeout, setInterval() {}, Date, Math, Number, String, Array, Object, JSON, RegExp, Set, Map, Promise, URL, atob: s => Buffer.from(s, "base64").toString("latin1"), Uint8Array, navigator: { onLine: true } };
  g.window = g;
  g.document = { readyState: "loading", addEventListener() {}, getElementById: () => null, querySelector: () => null, baseURI: "https://triplemvip.com/" };
  g.TriplemDesktop = { kit };
  vm.createContext(g);
  vm.runInContext(text("Assets/app/desktop/02-pdf-viewer.js"), g);
  vm.runInContext(text("Assets/app/desktop/03-desktop-search.js"), g);
  return { V: g.TriplemPdfViewer, S: g.TriplemDesktopSearch, sent, handlers };
}

test("print preview geometry: paper, layout, margins and scale", () => {
  const { V } = loadModules();
  const t = V._test;
  const plain = v => JSON.parse(JSON.stringify(v));
  const a4pt = { w: 595.28, h: 841.89 };
  assert.deepEqual(plain(t.paperMm("a4", "portrait")), [210, 297]);
  assert.deepEqual(plain(t.paperMm("a4", "landscape")), [297, 210]);
  assert.deepEqual(plain(t.paperMm("a4", "auto", { w: 842, h: 595 })), [297, 210], "auto follows a wide PDF");
  assert.equal(Math.round(t.paperMm("pdf", "", a4pt)[0]), 210);
  assert.deepEqual(plain(t.marginsMm({ margins: "custom", marginMm: [25, 10, 99, -3] })), [25, 10, 60, 0], "custom margins are kept between 0 and 60 mm");
  assert.deepEqual(plain(t.marginsMm({ margins: "wide" })), [19.05, 19.05, 19.05, 19.05]);
  const actual = t.placePage(a4pt, [210, 297], [0, 0, 0, 0], "actual", 100);
  assert.ok(Math.abs(actual.img.w - 210) < 0.1 && actual.img.x < 0.1 && actual.img.y === 0);
  const fit = t.placePage(a4pt, [297, 210], [25, 10, 10, 25], "fit", 100);
  assert.ok(fit.img.h <= fit.area.h + 0.01 && fit.img.w <= fit.area.w + 0.01, "fit stays inside the printable area");
  assert.ok(Math.abs(fit.area.x - 25) < 1e-9 && Math.abs(fit.area.y - 25) < 1e-9);
  const half = t.placePage(a4pt, [210, 297], [10, 10, 10, 10], "custom", 50);
  assert.ok(Math.abs(half.img.w - 105) < 0.1);
  assert.deepEqual(plain(t.pageList("", 3)), [1, 2, 3]);
  assert.deepEqual(plain(t.pageList("3, 1-2, 9", 3)), [1, 2, 3]);
  assert.equal(t.pageList("2-a", 3), null);
  assert.equal(Array.from(t.decodeChunks([Buffer.from("%PDF-").toString("base64"), Buffer.from("1.7").toString("base64")])).map(c => String.fromCharCode(c)).join(""), "%PDF-1.7");
});

test("search bar: grouped, ranked, limited per kind; one call only when typing pauses", () => {
  const { S } = loadModules();
  const t = S._test;
  const rows = [
    { k: "note", id: "n1", t: "Call zubair" },
    { k: "doc", id: "d1", t: "INV-0042", x: "sales_invoice · Zubair LLC · issued", c: "AED", a: 1050, d: "2026-11-05" },
    ...Array.from({ length: 9 }, (_, i) => ({ k: "expense", id: `e${i}`, t: `Zubair taxi ${i}` }))
  ];
  const out = t.mergeResults([{ k: "section", id: "accounting", t: "Accounting" }], [{ k: "doc", id: "D1", t: "INV-0042" }], rows, "zubair");
  assert.equal(JSON.stringify(out.map(r => r.k).filter((k, i, a) => a.indexOf(k) === i)), JSON.stringify(["section", "doc", "expense", "note"]));
  assert.equal(out.filter(r => r.k === "doc").length, 1, "local and server copies are merged");
  assert.equal(out.filter(r => r.k === "expense").length, 5, "at most 5 per kind");
  assert.match(t.subText(rows[1]), /^Invoice · Zubair LLC · issued · .+ · AED 1,050$/);
  assert.equal(t.highlight("Zubair taxi", "zubair"), "<mark>Zubair</mark> taxi");
  const js = text("Assets/app/desktop/03-desktop-search.js");
  assert.match(js, /const MIN_CHARS = 2;/);
  assert.match(js, /const DEBOUNCE_MS = 350;/);
  assert.match(js, /window\.supabaseRpc\(RPC, \{ p_query: raw\.slice\(0, 80\), p_limit: PER_KIND \}, \{ signal: controller\.signal, offlineCache: false \}\)/);
  assert.match(js, /S\.controller\?\.abort\(\);/);
  assert.match(js, /if \(fromCache \|\| !canQueryServer\(\)\) \{ setBusy\(false\); return; \}/);
  assert.match(js, /if \(!kit\) return;/, "Windows app only");
  assert.match(text("Assets/app/desktop/01-windows-desktop.js"), /run: \(\) => \{ if \(!window\.TriplemDesktopSearch\?\.focus\?\.\(\)\) openSearchPalette\(\); \}/);
});

test("migration 209 adds only a read-only search function with permission checks", { skip: skipSql(["migrations/209_desktop_global_search.sql"]) }, () => {
  const sql = text("migrations/209_desktop_global_search.sql");
  const body = sql.replace(/^--.*$/gm, "");
  const fns = [...body.matchAll(/create or replace function public\.([a-z_]+)/g)].map(m => m[1]);
  assert.deepEqual(fns, ["app_desktop_search"]);
  assert.doesNotMatch(body, /\b(alter table|drop table|truncate|delete from|update public\.|insert into|create index|create table)\b/i);
  assert.match(body, /\bstable\b/);
  assert.match(body, /v_owner := public\.app_data_owner_id\(\);/);
  for (const gate of ["app_has_permission('loans', 'view')", "app_has_permission('accounting', 'view')", "app_has_permission('expenses', 'view')", "app_can_use_assets()", "app_has_insurance_permission('view')"]) assert.ok(body.includes(gate), gate);
  assert.match(body, /n integer := least\(greatest\(coalesce\(p_limit, 5\), 1\), 8\);/);
  assert.match(body, /if char_length\(q\) < 2 or char_length\(q\) > 80 then/);
  assert.match(body, /replace\(replace\(replace\(q, '\\', '\\\\'\), '%', '\\%'\), '_', '\\_'\)/, "LIKE wildcards are escaped");
  assert.equal((body.match(/where owner_id = v_owner|\.owner_id = v_owner/g) || []).length >= 13, true, "every source reads only the account's own rows");
  assert.match(text("scripts/build_full_schema_sql.js"), /"209_desktop_global_search\.sql",/);
});
