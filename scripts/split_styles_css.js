"use strict";
/**
 * Mechanically split Assets/style/styles.css into ordered contiguous slices.
 * Cascade order is preserved exactly (no rule reordering).
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const cssPath = path.join(root, "Assets", "style", "styles.css");
const outDir = path.join(root, "Assets", "style");
const backupPath = path.join(outDir, "styles.monolith.css");
const raw = fs.readFileSync(cssPath, "utf8");
// Preserve full monolith as backup (not linked from index.html)
if (!fs.existsSync(backupPath) || fs.readFileSync(backupPath, "utf8").length < raw.length) {
  fs.writeFileSync(backupPath, raw);
}
const lines = raw.split(/\n/);

// Contiguous cuts (1-based inclusive end). Chosen near domain comment markers
// while NEVER reordering rules. Link order in index.html must match this list.
const SLICES = [
  { file: "01-tokens.css", start: 1, end: 32, note: "@font-face + :root" },
  { file: "02-base.css", start: 33, end: 563, note: "body, layout primitives through before recycle bin" },
  { file: "03-components.css", start: 564, end: 1060, note: "recycle bin, smart pin, shared chrome" },
  { file: "04-inventory.css", start: 1061, end: 3989, note: "inventory / sales / cart (incl. mobile-after-base)" },
  { file: "05-expenses-filters.css", start: 3990, end: 4831, note: "expense sections + filters" },
  { file: "06-installments.css", start: 4832, end: 5520, note: "installment overlays + filter mobile" },
  { file: "07-overlays-transfers.css", start: 5521, end: 5812, note: "transfer success overlays" },
  { file: "08-landing-auth.css", start: 5813, end: 9923, note: "welcome, login, landing, trial promo" },
  { file: "09-shell-overview.css", start: 9924, end: 10551, note: "wallets/main overview + standalone about" },
  { file: "10-overlays-misc.css", start: 10552, end: 12452, note: "inquiry, app download, related overlays" },
  { file: "11-admin-messaging.css", start: 12453, end: 13598, note: "company team, admin notifications/messages" },
  { file: "12-late-overrides.css", start: 13599, end: lines.length, note: "admin raw + legacy fix + remaining late rules" }
];

const header = (slice) =>
  `/* Split from styles.css lines ${slice.start}-${slice.end} — ${slice.note}. Do not reorder relative to other 0N-*.css files. */\n`;

const manifest = [];
for (const slice of SLICES) {
  const chunk = lines.slice(slice.start - 1, slice.end).join("\n");
  const body = chunk.endsWith("\n") ? chunk : chunk + "\n";
  const out = path.join(outDir, slice.file);
  fs.writeFileSync(out, header(slice) + body);
  manifest.push({
    file: slice.file,
    start: slice.start,
    end: slice.end,
    lines: slice.end - slice.start + 1,
    bytes: Buffer.byteLength(header(slice) + body)
  });
  console.log("wrote", slice.file, "lines", slice.start + "-" + slice.end);
}

// Verify concatenation (ignoring headers) matches original
const rebuilt = SLICES.map((s) => lines.slice(s.start - 1, s.end).join("\n")).join("\n");
const original = lines.join("\n");
if (rebuilt !== original) {
  console.error("CASCADE MISMATCH: rebuilt content differs from styles.css");
  process.exit(1);
}

fs.writeFileSync(
  path.join(root, "Assets", "app", "_modularization", "css-split-manifest.json"),
  JSON.stringify({ slices: manifest, totalLines: lines.length }, null, 2)
);

// Stub original styles.css to point maintainers at the split (not linked from index.html)
fs.writeFileSync(
  cssPath,
  [
    "/* DEPRECATED ENTRYPOINT — Triplem VIP modularization.",
    " * The app loads Assets/style/01-*.css … 12-*.css directly from index.html",
    " * in numeric order (same cascade as the former monolithic styles.css).",
    " * This file is kept only as a pointer for old references; do not link it.",
    " */",
    ""
  ].join("\n")
);

console.log("OK: cascade verified, styles.css stubbed");
