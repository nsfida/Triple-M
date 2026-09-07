"use strict";
/**
 * Find safe top-level cut candidates near target line numbers,
 * then partition script.js into contiguous modules.
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const scriptPath = path.join(root, "Assets", "app", "script.js");
const backupPath = path.join(root, "Assets", "app", "script.monolith.js");

// Prefer monolith backup if script.js was already stubbed
let raw;
if (fs.existsSync(backupPath) && fs.statSync(backupPath).size > 100000) {
  raw = fs.readFileSync(backupPath, "utf8");
} else {
  raw = fs.readFileSync(scriptPath, "utf8");
  fs.writeFileSync(backupPath, raw);
}

const lines = raw.split(/\n/);

function isTopLevelStart(line) {
  return /^(async\s+)?function\s+[A-Za-z0-9_]+\s*\(|^(const|let|var)\s+[A-Za-z0-9_]+\s*=|^\/\/ [A-Za-z]|^\/\*\*|^\}\s*;?\s*$/.test(line)
    || /^(class)\s+/.test(line)
    || /^if \(document\.readyState/.test(line)
    || /^boot\(\);?\s*$/.test(line);
}

function isSafeCutLine(lineIdx0) {
  // Cut BEFORE this line (1-based = lineIdx0+1). Previous non-empty should close a decl.
  const line = lines[lineIdx0] || "";
  if (!line.trim()) return false;
  // Prefer function / const / section comment starts
  if (/^(async\s+)?function\s+[A-Za-z0-9_]+\s*\(/.test(line)) return true;
  if (/^(const|let|var)\s+[A-Za-z0-9_]+\s*=/.test(line)) return true;
  if (/^\/\/ [A-Za-z]/.test(line)) return true;
  if (/^\/\*\*/.test(line)) return true;
  if (/^if \(document\.readyState/.test(line)) return true;
  if (/^boot\(\);?\s*$/.test(line)) return true;
  return false;
}

function nearestSafeCut(target1Based, window = 80) {
  const target0 = target1Based - 1;
  // Search backward first (prefer earlier), then forward
  for (let d = 0; d <= window; d++) {
    const back = target0 - d;
    if (back >= 0 && isSafeCutLine(back)) {
      // Ensure previous line is blank or closing brace-ish
      const prev = lines[back - 1] || "";
      if (back === 0 || prev.trim() === "" || prev.trim() === "}" || prev.trim() === "};") {
        return back + 1;
      }
    }
    const fwd = target0 + d;
    if (d > 0 && fwd < lines.length && isSafeCutLine(fwd)) {
      const prev = lines[fwd - 1] || "";
      if (prev.trim() === "" || prev.trim() === "}" || prev.trim() === "};") {
        return fwd + 1;
      }
    }
  }
  throw new Error("No safe cut near " + target1Based);
}

// Desired approximate landmarks → resolve to safe cuts
const desired = [
  { rel: "core/01-config-state.js", at: 1, note: "CONFIG, constants, state, els, early helpers" },
  { rel: "auth/02-auth-session.js", at: 1855, note: "auth/session through before write-queue" },
  { rel: "core/03-entries-api.js", at: 4266, note: "DB write queue, entries, money/meta helpers" },
  { rel: "inventory/04-inventory.js", at: 5589, note: "inventory / goods primary block" },
  { rel: "expenses/05-expenses-wallets.js", at: 14145, note: "expense wallets + lazy summaries" },
  { rel: "ui/06-render-navigation.js", at: 17620, note: "renderAll and navigation shell" },
  { rel: "loans/07-loans-installments-forms.js", at: 21700, note: "loans/payments/edit + related forms" },
  { rel: "reports/08-pdf-exports.js", at: 22601, note: "PDF + export helpers" },
  { rel: "expenses/09-transfers.js", at: 24620, note: "wallet transfers" },
  { rel: "ui/10-bindings.js", at: 26700, note: "event bindings / overview toggles" },
  { rel: "landing/11-landing.js", at: 27707, note: "landing page" },
  { rel: "auth/12-auth-welcome-trial.js", at: 28570, note: "trial/welcome + loan wallet helpers" },
  { rel: "bitcoin/13-bitcoin.js", at: 29322, note: "Bitcoin wallets" },
  { rel: "notes/14-notes.js", at: 32934, note: "Notes" },
  { rel: "admin/15-admin.js", at: 35231, note: "Admin RAW + backup" },
  { rel: "messaging/16-messaging.js", at: 37378, note: "Messaging + overlay helpers" },
  { rel: "boot.js", at: 39298, note: "DOM ready + boot()" }
];

const starts = desired.map((d, i) => (i === 0 ? 1 : nearestSafeCut(d.at)));
// Ensure strictly increasing
for (let i = 1; i < starts.length; i++) {
  if (starts[i] <= starts[i - 1]) {
    starts[i] = nearestSafeCut(starts[i - 1] + 1, 200);
  }
  if (starts[i] <= starts[i - 1]) {
    throw new Error(`Non-increasing cut at index ${i}: ${starts[i]} <= ${starts[i - 1]}`);
  }
}

const SLICES = desired.map((d, i) => ({
  rel: d.rel,
  note: d.note,
  start: starts[i],
  end: i + 1 < starts.length ? starts[i + 1] - 1 : lines.length
}));

console.log("Resolved slices:");
for (const s of SLICES) {
  const first = lines[s.start - 1].slice(0, 90);
  console.log(`L${s.start}-${s.end}\t${s.rel}\t| ${first}`);
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

const header = (slice) =>
  `/* Modularized from script.js lines ${slice.start}-${slice.end} — ${slice.note}. Load order must be preserved. */\n`;

for (const slice of SLICES) {
  const chunk = lines.slice(slice.start - 1, slice.end).join("\n");
  const body = chunk.endsWith("\n") ? chunk : chunk + "\n";
  const out = path.join(root, "Assets", "app", slice.rel);
  ensureDir(out);
  fs.writeFileSync(out, header(slice) + body);
}

const rebuilt = SLICES.map((s) => lines.slice(s.start - 1, s.end).join("\n")).join("\n");
if (rebuilt !== lines.join("\n")) {
  console.error("MISMATCH: concatenation != original");
  process.exit(1);
}

// Symbol continuity check
const before = [...raw.matchAll(/^(async\s+)?function\s+([A-Za-z0-9_]+)/gm)].map((m) => m[2]).sort();
const afterRaw = SLICES.map((s) => fs.readFileSync(path.join(root, "Assets", "app", s.rel), "utf8")).join("\n");
const after = [...afterRaw.matchAll(/^(async\s+)?function\s+([A-Za-z0-9_]+)/gm)].map((m) => m[2]).sort();
if (before.join("\n") !== after.join("\n")) {
  console.error("SYMBOL MISMATCH");
  const bSet = new Set(before);
  const aSet = new Set(after);
  console.error("missing", before.filter((x) => !aSet.has(x)).slice(0, 20));
  console.error("extra", after.filter((x) => !bSet.has(x)).slice(0, 20));
  process.exit(1);
}

fs.writeFileSync(
  scriptPath,
  [
    "/* DEPRECATED ENTRYPOINT — Triplem VIP modularization.",
    " * The app loads Assets/app feature modules from index.html in numeric/folder order.",
    " * Full monolith backup: Assets/app/script.monolith.js",
    " * Do not link this stub from index.html.",
    " */",
    ""
  ].join("\n")
);

fs.writeFileSync(
  path.join(root, "Assets", "app", "_modularization", "js-split-manifest.json"),
  JSON.stringify({ slices: SLICES, symbolCount: before.length }, null, 2)
);

// Emit HTML script tags helper
const tags = SLICES.map((s) => `  <script src="Assets/app/${s.rel.replace(/\\/g, "/")}"></script>`).join("\n");
fs.writeFileSync(path.join(root, "Assets", "app", "_modularization", "script-tags.html"), tags + "\n");

console.log("OK: modules written, symbols=", before.length);
