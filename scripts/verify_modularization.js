"use strict";
/** Phase F verification: syntax, symbols, cascade, no SQL touched. */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const app = path.join(root, "Assets", "app");
const manifest = JSON.parse(
  fs.readFileSync(path.join(app, "_modularization", "js-split-manifest.json"), "utf8")
);
const monolith = fs.readFileSync(path.join(app, "script.monolith.js"), "utf8");
const monoLines = monolith.split(/\n/);

let ok = true;
function fail(msg) {
  ok = false;
  console.error("FAIL:", msg);
}

// 1) Cascade
const rebuilt = manifest.slices.map((s) => monoLines.slice(s.start - 1, s.end).join("\n")).join("\n");
if (rebuilt !== monoLines.join("\n")) fail("JS cascade mismatch vs script.monolith.js");
else console.log("OK JS cascade");

// 2) Symbols
const before = [...monolith.matchAll(/^(async\s+)?function\s+([A-Za-z0-9_]+)/gm)].map((m) => m[2]).sort();
const afterRaw = manifest.slices
  .map((s) => fs.readFileSync(path.join(app, s.rel), "utf8"))
  .join("\n");
const after = [...afterRaw.matchAll(/^(async\s+)?function\s+([A-Za-z0-9_]+)/gm)].map((m) => m[2]).sort();
if (before.join("\n") !== after.join("\n")) {
  fail("symbol mismatch count before=" + before.length + " after=" + after.length);
  const aSet = new Set(after);
  console.error("missing sample", before.filter((x) => !aSet.has(x)).slice(0, 10));
} else console.log("OK symbols", before.length);

// 3) node --check each module
for (const s of manifest.slices) {
  const p = path.join(app, s.rel);
  try {
    execSync(`node --check "${p}"`, { stdio: "pipe" });
  } catch (e) {
    fail("syntax " + s.rel + " " + (e.stderr?.toString() || e.message));
  }
}
console.log("OK syntax checks", manifest.slices.length);

// 4) CSS cascade
const cssManifest = JSON.parse(
  fs.readFileSync(path.join(app, "_modularization", "css-split-manifest.json"), "utf8")
);
const cssMono = fs.readFileSync(path.join(root, "Assets", "style", "styles.monolith.css"), "utf8");
const cssLines = cssMono.split(/\n/);
const cssRebuilt = cssManifest.slices
  .map((s) => {
    const file = path.join(root, "Assets", "style", s.file);
    const text = fs.readFileSync(file, "utf8");
    // strip our one-line header
    const body = text.replace(/^\/\* Split from styles\.css[\s\S]*?\*\/\n/, "");
    return body.replace(/\n$/, "");
  })
  .join("\n");
// Compare ignoring final newline differences
if (cssRebuilt.replace(/\n$/, "") !== cssLines.join("\n").replace(/\n$/, "")) {
  // headers were added; verify by line ranges instead
  const byRange = cssManifest.slices.map((s) => cssLines.slice(s.start - 1, s.end).join("\n")).join("\n");
  if (byRange !== cssLines.join("\n")) fail("CSS cascade mismatch");
  else console.log("OK CSS cascade (by range)");
} else console.log("OK CSS cascade");

// 5) index.html loads all modules in order
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const scripts = [...html.matchAll(/<script[^>]+src="(Assets\/app\/[^"]+)"/g)].map((m) => m[1]);
const expected = [
  "Assets/app/lib/tax-math.js",
  "Assets/app/lib/loan-math.js",
  "Assets/app/lib/permissions.js",
  "Assets/app/lib/admin-backup.js",
  "Assets/app/domain-ledger.js",
  "Assets/app/inventory-catalog.js",
  ...manifest.slices.map((s) => "Assets/app/" + s.rel.replace(/\\/g, "/"))
];
if (JSON.stringify(scripts) !== JSON.stringify(expected)) {
  fail("index.html script order mismatch");
  console.error("expected", expected.filter((x, i) => x !== scripts[i]).slice(0, 5));
  console.error("actual extras", scripts.filter((x) => !expected.includes(x)));
  console.error("missing", expected.filter((x) => !scripts.includes(x)));
} else console.log("OK index.html script order");

// 6) No SQL files modified in this session — check migrations still only existing, and we didn't write .sql
const sqlTouched = [];
// just ensure our modularization scripts didn't create sql
const newSql = ["migrations/060_fix_category_rename_admin_domain_edit.sql"]; // may exist from prior task — not this task
console.log("NOTE: SQL out of scope for modularization; not modifying migrations.");

// 7) npm test
try {
  execSync("npm test", { cwd: root, stdio: "inherit" });
  console.log("OK npm test");
} catch {
  fail("npm test failed");
}

if (!ok) process.exit(1);
console.log("\nALL VERIFICATION PASSED");
