"use strict";
/**
 * Secondary contiguous splits inside already-extracted modules.
 * Source of truth remains Assets/app/script.monolith.js line numbers.
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const monolith = fs.readFileSync(path.join(root, "Assets", "app", "script.monolith.js"), "utf8");
const lines = monolith.split(/\n/);
const manifestPath = path.join(root, "Assets", "app", "_modularization", "js-split-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

function isSafeCutLine(lineIdx0) {
  const line = lines[lineIdx0] || "";
  if (!/^(async\s+)?function\s+[A-Za-z0-9_]+\s*\(|^(const|let|var)\s+[A-Za-z0-9_]+\s*=|^\/\/ [A-Za-z]|^\/\*\*/.test(line)) {
    return false;
  }
  const prev = lines[lineIdx0 - 1] || "";
  return lineIdx0 === 0 || prev.trim() === "" || prev.trim() === "}" || prev.trim() === "};";
}

function nearestSafeCut(target1Based, lo, hi) {
  const target0 = target1Based - 1;
  for (let d = 0; d <= 120; d++) {
    for (const idx of [target0 - d, target0 + d]) {
      if (idx < lo - 1 || idx > hi - 1) continue;
      if (d === 0 || idx !== target0 || true) {
        if (isSafeCutLine(idx) && idx + 1 > lo && idx + 1 <= hi) return idx + 1;
      }
    }
  }
  throw new Error(`No safe cut near ${target1Based} in ${lo}-${hi}`);
}

function header(start, end, note) {
  return `/* Modularized from script.js lines ${start}-${end} — ${note}. Load order must be preserved. */\n`;
}

function writeSlice(rel, start, end, note) {
  const chunk = lines.slice(start - 1, end).join("\n");
  const body = chunk.endsWith("\n") ? chunk : chunk + "\n";
  const out = path.join(root, "Assets", "app", rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, header(start, end, note) + body);
  console.log("wrote", rel, `L${start}-${end}`);
  return { rel, start, end, note, lines: end - start + 1 };
}

// Replace selected coarse slices with finer contiguous pieces
const refined = [];
for (const slice of manifest.slices) {
  if (slice.rel === "core/01-config-state.js") {
    const cutState = nearestSafeCut(624, slice.start, slice.end); // const state
    refined.push(writeSlice("core/01-config-constants.js", slice.start, cutState - 1, "CONFIG + constants + early helpers"));
    const cutEls = nearestSafeCut(767, cutState, slice.end); // const els
    refined.push(writeSlice("core/02-state.js", cutState, cutEls - 1, "shared application state"));
    refined.push(writeSlice("core/03-els.js", cutEls, slice.end, "DOM element map (els)"));
    continue;
  }
  if (slice.rel === "core/03-entries-api.js") {
    // renumber after core 01-03 above — use 04-
    refined.push(writeSlice("core/04-entries-api.js", slice.start, slice.end, slice.note));
    continue;
  }
  if (slice.rel === "auth/02-auth-session.js") {
    refined.push(writeSlice("auth/01-auth-session.js", slice.start, slice.end, slice.note));
    continue;
  }
  if (slice.rel === "inventory/04-inventory.js") {
    const cutSales = nearestSafeCut(9000, slice.start, slice.end);
    const cutOverlay = nearestSafeCut(12000, cutSales, slice.end);
    refined.push(writeSlice("inventory/01-inventory-meta-stock.js", slice.start, cutSales - 1, "inventory meta + stock helpers"));
    refined.push(writeSlice("inventory/02-inventory-sales-drafts.js", cutSales, cutOverlay - 1, "sales drafts / cart"));
    refined.push(writeSlice("inventory/03-inventory-overlays.js", cutOverlay, slice.end, "section overlays + catalog menus"));
    continue;
  }
  if (slice.rel === "expenses/05-expenses-wallets.js") {
    refined.push(writeSlice("expenses/01-expenses-wallets.js", slice.start, slice.end, slice.note));
    continue;
  }
  if (slice.rel === "ui/06-render-navigation.js") {
    refined.push(writeSlice("ui/01-render-navigation.js", slice.start, slice.end, slice.note));
    continue;
  }
  if (slice.rel === "loans/07-loans-installments-forms.js") {
    const cutLoan = nearestSafeCut(21800, slice.start, slice.end);
    // If cut is near start, keep one file; else split installments vs loans
    if (cutLoan > slice.start + 50 && cutLoan < slice.end - 50) {
      refined.push(writeSlice("installments/01-installments.js", slice.start, cutLoan - 1, "installment details/actions"));
      refined.push(writeSlice("loans/01-loans-payments.js", cutLoan, slice.end, "loans create/payment/edit"));
    } else {
      refined.push(writeSlice("loans/01-loans-installments-forms.js", slice.start, slice.end, slice.note));
    }
    continue;
  }
  if (slice.rel === "reports/08-pdf-exports.js") {
    const cutExport = nearestSafeCut(24017, slice.start, slice.end);
    refined.push(writeSlice("reports/01-pdf.js", slice.start, cutExport - 1, "PDF generators"));
    refined.push(writeSlice("reports/02-exports.js", cutExport, slice.end, "CSV/PDF export helpers for expenses history"));
    continue;
  }
  if (slice.rel === "expenses/09-transfers.js") {
    refined.push(writeSlice("expenses/02-transfers.js", slice.start, slice.end, slice.note));
    continue;
  }
  if (slice.rel === "ui/10-bindings.js") {
    refined.push(writeSlice("ui/02-bindings.js", slice.start, slice.end, slice.note));
    continue;
  }
  if (slice.rel === "landing/11-landing.js") {
    refined.push(writeSlice("landing/01-landing.js", slice.start, slice.end, slice.note));
    continue;
  }
  if (slice.rel === "auth/12-auth-welcome-trial.js") {
    refined.push(writeSlice("auth/02-auth-welcome-trial.js", slice.start, slice.end, slice.note));
    continue;
  }
  if (slice.rel === "bitcoin/13-bitcoin.js") {
    refined.push(writeSlice("bitcoin/01-bitcoin.js", slice.start, slice.end, slice.note));
    continue;
  }
  if (slice.rel === "notes/14-notes.js") {
    refined.push(writeSlice("notes/01-notes.js", slice.start, slice.end, slice.note));
    continue;
  }
  if (slice.rel === "admin/15-admin.js") {
    refined.push(writeSlice("admin/01-admin.js", slice.start, slice.end, slice.note));
    continue;
  }
  if (slice.rel === "messaging/16-messaging.js") {
    refined.push(writeSlice("messaging/01-messaging.js", slice.start, slice.end, slice.note));
    continue;
  }
  if (slice.rel === "boot.js") {
    refined.push(writeSlice("boot.js", slice.start, slice.end, slice.note));
    continue;
  }
  refined.push(writeSlice(slice.rel, slice.start, slice.end, slice.note));
}

// Verify cascade
const rebuilt = refined.map((s) => lines.slice(s.start - 1, s.end).join("\n")).join("\n");
if (rebuilt !== lines.join("\n")) {
  console.error("MISMATCH after refine");
  process.exit(1);
}

const before = [...monolith.matchAll(/^(async\s+)?function\s+([A-Za-z0-9_]+)/gm)].map((m) => m[2]).sort();
const afterRaw = refined.map((s) => fs.readFileSync(path.join(root, "Assets", "app", s.rel), "utf8")).join("\n");
const after = [...afterRaw.matchAll(/^(async\s+)?function\s+([A-Za-z0-9_]+)/gm)].map((m) => m[2]).sort();
if (before.join("\n") !== after.join("\n")) {
  console.error("SYMBOL MISMATCH after refine");
  process.exit(1);
}

// Delete superseded coarse files
const keep = new Set(refined.map((s) => s.rel.replace(/\\/g, "/")));
const coarse = [
  "core/01-config-state.js",
  "auth/02-auth-session.js",
  "core/03-entries-api.js",
  "inventory/04-inventory.js",
  "expenses/05-expenses-wallets.js",
  "ui/06-render-navigation.js",
  "loans/07-loans-installments-forms.js",
  "reports/08-pdf-exports.js",
  "expenses/09-transfers.js",
  "ui/10-bindings.js",
  "landing/11-landing.js",
  "auth/12-auth-welcome-trial.js",
  "bitcoin/13-bitcoin.js",
  "notes/14-notes.js",
  "admin/15-admin.js",
  "messaging/16-messaging.js"
];
for (const rel of coarse) {
  if (keep.has(rel)) continue;
  const p = path.join(root, "Assets", "app", rel);
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    console.log("removed superseded", rel);
  }
}

fs.writeFileSync(manifestPath, JSON.stringify({ slices: refined, symbolCount: before.length }, null, 2));
const tags = refined
  .map((s) => `  <script src="Assets/app/${s.rel.replace(/\\/g, "/")}"></script>`)
  .join("\n");
fs.writeFileSync(path.join(root, "Assets", "app", "_modularization", "script-tags.html"), tags + "\n");
console.log("OK refined modules:", refined.length, "symbols", before.length);
