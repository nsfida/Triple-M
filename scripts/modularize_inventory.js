"use strict";
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "Assets", "app", "_modularization");
fs.mkdirSync(outDir, { recursive: true });

const scriptPath = path.join(root, "Assets", "app", "script.js");
const script = fs.readFileSync(scriptPath, "utf8");
const lines = script.split(/\n/);
const fns = [];
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^(async\s+)?function\s+([A-Za-z0-9_]+)/);
  if (m) fns.push({ line: i + 1, name: m[2], async: !!m[1] });
}

fs.writeFileSync(
  path.join(outDir, "script-symbols-before.json"),
  JSON.stringify({ count: fns.length, functions: fns }, null, 2)
);
fs.writeFileSync(
  path.join(outDir, "script-symbols-before.txt"),
  fns.map((f) => f.name).sort().join("\n") + "\n"
);

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const links = [...html.matchAll(/<link[^>]+href="([^"]+)"[^>]*>/g)].map((m) => m[1]);
const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"[^>]*><\/script>/g)].map((m) => m[1]);
const cssLines = fs.readFileSync(path.join(root, "Assets", "style", "styles.css"), "utf8").split(/\n/).length;

fs.writeFileSync(
  path.join(outDir, "load-order-before.json"),
  JSON.stringify(
    {
      links,
      scripts,
      cssLines,
      jsLines: lines.length,
      symbolCount: fns.length
    },
    null,
    2
  )
);

console.log("symbols", fns.length);
console.log("cssLines", cssLines);
console.log("jsLines", lines.length);
console.log("app scripts", scripts.filter((s) => s.includes("Assets/app")));
