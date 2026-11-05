"use strict";
/**
 * Analyze script.js for contiguous extraction cut points.
 * Prints clusters of consecutive top-level functions by heuristic domain.
 */
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const lines = fs.readFileSync(path.join(root, "Assets", "app", "script.js"), "utf8").split(/\n/);

function domainOf(name) {
  const n = name.toLowerCase();
  if (/login|logout|session|smartpin|password|trial|auth|welcome|lock|guest/.test(n)) return "auth";
  if (/admin|rawedit|backup|protect/.test(n)) return "admin";
  if (/transfer/.test(n)) return "transfer";
  if (/expense|wallet|topup/.test(n)) return "expense";
  if (/installment/.test(n)) return "installment";
  if (/loan|payment|given|taken|received|returned|person/.test(n)) return "loan";
  if (/goods|inventor|sale|draft|customer|cart|brand|variant|category|catalog|invoice|receipt/.test(n)) return "inventory";
  if (/note|reminder/.test(n)) return "notes";
  if (/bitcoin|btc/.test(n)) return "bitcoin";
  if (/pdf|jspdf/.test(n)) return "pdf";
  if (/csv|xlsx|excel|export|import|download.*csv|upload.*csv/.test(n)) return "exports";
  if (/message|inquiry|notif/.test(n)) return "messaging";
  if (/landing|pricing|faq|about|flyer|promo|testimonial/.test(n)) return "landing";
  if (/render|overview|activate|panel|menu|modal|toggle/.test(n)) return "ui";
  if (/supabase|queueDatabase|saveEntries|domain|rpc|fetch|persist|boot|bind|init/.test(n)) return "core";
  if (/money|currency|date|escape|format|normalize|finite|slug|tax|debounce|today/.test(n)) return "utils";
  return "other";
}

const fns = [];
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^(async\s+)?function\s+([A-Za-z0-9_]+)/);
  if (m) fns.push({ line: i + 1, name: m[2], domain: domainOf(m[2]) });
}

// Build runs of same domain
const runs = [];
for (const f of fns) {
  const last = runs[runs.length - 1];
  if (last && last.domain === f.domain) {
    last.endLine = f.line;
    last.count++;
    last.names.push(f.name);
  } else {
    runs.push({ domain: f.domain, startLine: f.line, endLine: f.line, count: 1, names: [f.name] });
  }
}

// Print significant runs (count >= 5) and first/last 30 runs
console.log("totalFns", fns.length, "runs", runs.length);
console.log("\nSignificant runs (count>=8):");
for (const r of runs.filter((x) => x.count >= 8)) {
  console.log(
    `${r.domain.padEnd(12)} L${String(r.startLine).padStart(5)}-${String(r.endLine).padStart(5)} n=${String(r.count).padStart(3)}  ${r.names[0]} … ${r.names[r.names.length - 1]}`
  );
}

fs.writeFileSync(
  path.join(root, "Assets", "app", "_modularization", "script-domain-runs.json"),
  JSON.stringify({ runs, fns }, null, 2)
);
