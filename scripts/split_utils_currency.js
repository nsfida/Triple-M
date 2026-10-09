"use strict";
/** Split currency helpers out of core/04-entries-api.js into utils/01-currency.js (contiguous). */
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const app = path.join(root, "Assets", "app");
const monolith = fs.readFileSync(path.join(app, "script.monolith.js"), "utf8").split(/\n/);
const manifestPath = path.join(app, "_modularization", "js-split-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const entries = manifest.slices.find((s) => s.rel === "core/04-entries-api.js");
if (!entries) throw new Error("core/04-entries-api.js missing from manifest");

// Absolute line of `const PDF_CURRENCY_MARKERS` in monolith
let currencyStart = null;
for (let i = entries.start - 1; i < entries.end; i++) {
  if (/^const PDF_CURRENCY_MARKERS/.test(monolith[i])) {
    currencyStart = i + 1;
    break;
  }
}
if (!currencyStart) throw new Error("PDF_CURRENCY_MARKERS not found");

// End currency utils before shortId / grouping helpers
let currencyEnd = null;
for (let i = currencyStart - 1; i < entries.end; i++) {
  if (/^function shortId\(/.test(monolith[i])) {
    currencyEnd = i; // 0-based index of shortId → previous line is end (1-based = i)
    break;
  }
}
if (!currencyEnd || currencyEnd <= currencyStart) throw new Error("shortId cut not found");

function write(rel, start, end, note) {
  const chunk = monolith.slice(start - 1, end).join("\n");
  const body = chunk.endsWith("\n") ? chunk : chunk + "\n";
  const out = path.join(app, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(
    out,
    `/* Modularized from script.js lines ${start}-${end} — ${note}. Load order must be preserved. */\n` + body
  );
  console.log("wrote", rel, start, end);
  return { rel, start, end, note, lines: end - start + 1 };
}

const next = [];
for (const s of manifest.slices) {
  if (s.rel !== "core/04-entries-api.js") {
    next.push(s);
    continue;
  }
  next.push(write("core/04-entries-api.js", s.start, currencyStart - 1, "DB write queue + saveEntriesImmediately"));
  next.push(write("utils/01-currency-money.js", currencyStart, currencyEnd, "currency + money + overview watermark helpers"));
  next.push(write("core/05-meta-helpers.js", currencyEnd + 1, s.end, "debounce, installment/goods meta helpers"));
}

const rebuilt = next.map((s) => monolith.slice(s.start - 1, s.end).join("\n")).join("\n");
if (rebuilt !== monolith.join("\n")) {
  console.error("MISMATCH");
  process.exit(1);
}

fs.writeFileSync(manifestPath, JSON.stringify({ slices: next, symbolCount: manifest.symbolCount }, null, 2));
fs.writeFileSync(
  path.join(app, "_modularization", "script-tags.html"),
  next.map((s) => `  <script src="Assets/app/${s.rel.replace(/\\/g, "/")}"></script>`).join("\n") + "\n"
);
console.log("OK utils split");
