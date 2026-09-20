#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist-production");

const rootFiles = [
  "index.html", "404.html", "CNAME", "robots.txt", "sitemap.xml", "site.webmanifest",
  "humans.txt", "llms.txt", "llms-full.txt", "index.md", "service-worker.js",
  "fe79ac427d86a8002988e0a87b9a500f.txt"
];
const runtimeDirs = [".well-known", "Assets", "Demo", "Founder", "Security", "regions", "seo"];
const excluded = new Set([
  "Assets/app/script.monolith.js",
  "Assets/app/script.js",
  "Assets/style/styles.monolith.css"
]);
const excludedPrefixes = [
  "Assets/app/_modularization/"
];

function normalize(rel) { return rel.split(path.sep).join("/"); }
function isExcluded(rel) {
  const value = normalize(rel);
  return excluded.has(value) || excludedPrefixes.some(prefix => value.startsWith(prefix));
}
function copyFile(rel) {
  if (isExcluded(rel)) return;
  const source = path.join(root, rel);
  if (!fs.existsSync(source)) throw new Error(`Production source is missing: ${rel}`);
  const target = path.join(output, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}
function copyTree(rel) {
  const source = path.join(root, rel);
  if (!fs.existsSync(source)) return;
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const child = path.join(rel, entry.name);
    if (isExcluded(child)) continue;
    if (entry.isDirectory()) copyTree(child);
    else if (entry.isFile()) copyFile(child);
  }
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const rel of rootFiles) copyFile(rel);
for (const rel of runtimeDirs) copyTree(rel);

const files = [];
function inventory(dir, prefix = "") {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
    const abs = path.join(dir, entry.name);
    const rel = normalize(path.join(prefix, entry.name));
    if (entry.isDirectory()) inventory(abs, rel);
    else if (entry.isFile()) {
      const body = fs.readFileSync(abs);
      files.push({ path: rel, bytes: body.length, sha256: crypto.createHash("sha256").update(body).digest("hex") });
    }
  }
}
inventory(output);
const manifest = {
  format: "triplem-vip-production-manifest-v1",
  fileCount: files.length,
  totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
  files
};
fs.writeFileSync(path.join(output, "production-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

// Guard the release directory against accidental developer-source exposure.
for (const forbidden of ["migrations", "scripts", "tests", "supabase", ".github", ".cursor", "docs"]) {
  if (fs.existsSync(path.join(output, forbidden))) throw new Error(`Developer-only directory leaked into production output: ${forbidden}`);
}
for (const rel of excluded) {
  if (fs.existsSync(path.join(output, rel))) throw new Error(`Developer backup leaked into production output: ${rel}`);
}
for (const prefix of excludedPrefixes) {
  if (fs.existsSync(path.join(output, prefix))) throw new Error(`Developer modularization metadata leaked into production output: ${prefix}`);
}

console.log(`Production build ready: ${manifest.fileCount} files, ${manifest.totalBytes} bytes in dist-production/.`);
