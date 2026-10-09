#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist-production");
const fail = message => { throw new Error(message); };
const normalize = value => value.split(path.sep).join("/");
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");

function listFiles(dir, prefix = "") {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(dir, entry.name);
    const relative = normalize(path.join(prefix, entry.name));
    if (entry.isDirectory()) result.push(...listFiles(absolute, relative));
    else if (entry.isFile()) result.push({ absolute, path: relative });
  }
  return result;
}

function htmlLocalAssetReferences(html, htmlFile, outputRoot) {
  const stripped = html.replace(/<!--[\s\S]*?-->/g, "");
  const references = [];
  const tagPattern = /<(?:script|link|source)\b[^>]*>/gi;
  for (const tagMatch of stripped.matchAll(tagPattern)) {
    const tag = tagMatch[0];
    const attribute = tag.match(/\b(src|href)\s*=\s*(["'])(.*?)\2/i);
    if (!attribute) continue;
    const rawUrl = attribute[3].replace(/&amp;/g, "&");
    if (!/\.(?:js|css)(?:[?#]|$)/i.test(rawUrl)) continue;
    if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(rawUrl) || /^(?:data|blob):/i.test(rawUrl)) continue;

    let resolved;
    try {
      const htmlRel = normalize(path.relative(outputRoot, htmlFile));
      const base = new URL("https://triplem-vip-audit.invalid/" + htmlRel);
      resolved = new URL(rawUrl, base);
      if (resolved.origin !== base.origin) continue;
    } catch (error) {
      fail(`Could not parse local asset URL "${rawUrl}" in ${path.relative(outputRoot, htmlFile)}: ${error.message}`);
    }

    let assetPath;
    try {
      const pathname = decodeURIComponent(resolved.pathname);
      assetPath = path.resolve(outputRoot, "." + pathname);
      const relative = path.relative(outputRoot, assetPath);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        fail(`Local asset escapes production root: ${rawUrl} in ${path.relative(outputRoot, htmlFile)}`);
      }
    } catch (error) {
      fail(`Invalid local asset path "${rawUrl}" in ${path.relative(outputRoot, htmlFile)}: ${error.message}`);
    }
    references.push({ rawUrl, assetPath, url: resolved, htmlFile });
  }
  return references;
}

function auditProductionOutput(outputRoot = output) {
  if (!fs.existsSync(outputRoot) || !fs.statSync(outputRoot).isDirectory()) {
    fail(`Production output directory is missing: ${outputRoot}. Run npm run build:production first.`);
  }

  const forbiddenPaths = [
    "migrations", "scripts", "tests", "supabase", ".github", ".cursor", "docs", "developer-artifacts",
    "Assets/sql", "Assets/app/_modularization", "Assets/app/script.monolith.js", "Assets/app/script.js",
    "Assets/app/MODULES.md", "Assets/logo/test.png", "Assets/style/styles.monolith.css"
  ];
  for (const item of forbiddenPaths) {
    if (fs.existsSync(path.join(outputRoot, item))) fail(`Developer-only or unsafe artifact leaked into production output: ${item}`);
  }
  for (const required of ["index.html", "404.html", "service-worker.js", "_headers", "production-manifest.json", "release-manifest.json"]) {
    if (!fs.existsSync(path.join(outputRoot, required))) fail(`Required production output file is missing: ${required}`);
  }

  const manifestPath = path.join(outputRoot, "production-manifest.json");
  const releasePath = path.join(outputRoot, "release-manifest.json");
  let manifest, release;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    release = JSON.parse(fs.readFileSync(releasePath, "utf8"));
  } catch (error) {
    fail(`Production manifest JSON is invalid: ${error.message}`);
  }
  if (manifest.format !== "triplem-vip-production-manifest-v1" || !Array.isArray(manifest.files)) {
    fail("Production manifest format or file inventory is invalid.");
  }

  const actual = listFiles(outputRoot).filter(file => !["production-manifest.json", "release-manifest.json"].includes(file.path));
  const actualByPath = new Map(actual.map(file => [file.path, file]));
  if (manifest.fileCount !== manifest.files.length || manifest.fileCount !== actual.length) {
    fail(`Production manifest file-count mismatch: manifest=${manifest.fileCount}, manifest entries=${manifest.files.length}, actual=${actual.length}.`);
  }
  const listed = new Set();
  let totalBytes = 0;
  for (const record of manifest.files) {
    if (!record || typeof record.path !== "string" || listed.has(record.path)) fail("Production manifest has a missing or duplicate path.");
    listed.add(record.path);
    const file = actualByPath.get(record.path);
    if (!file) fail(`Manifest-listed production file is missing: ${record.path}`);
    const body = fs.readFileSync(file.absolute);
    const digest = sha256(body);
    if (body.length !== record.bytes || digest !== record.sha256) fail(`Production manifest hash/size mismatch: ${record.path}`);
    totalBytes += body.length;
  }
  for (const file of actual) if (!listed.has(file.path)) fail(`Unmanifested production file: ${file.path}`);
  if (manifest.totalBytes !== totalBytes) fail(`Production manifest totalBytes mismatch: ${manifest.totalBytes} versus ${totalBytes}.`);

  const swText = fs.readFileSync(path.join(outputRoot, "service-worker.js"), "utf8");
  const expectedCache = require(path.join(root, "scripts", "build_production.js")).getStaticCacheName(swText);
  if (release?.security?.serviceWorkerCache !== expectedCache) {
    fail(`Release manifest service-worker cache mismatch: expected ${expectedCache}, got ${release?.security?.serviceWorkerCache || "<missing>"}.`);
  }
  if (release?.database?.databaseChangesRequired !== false || !Array.isArray(release?.database?.requiredMigrations) || release.database.requiredMigrations.length !== 0 || release?.database?.migrationsBundled !== false) {
    fail("Code-only production release must explicitly declare that no migrations are bundled or required.");
  }
  if (release?.edgeFunctions?.deploymentRequired !== true || release?.edgeFunctions?.bundledInProductionZip !== false || !Array.isArray(release?.edgeFunctions?.requiredDeployments) || !release.edgeFunctions.requiredDeployments.includes("push-notifications")) {
    fail("Release manifest must clearly declare the separate push-notifications Edge Function deployment.");
  }

  const htmlFiles = actual.filter(file => /\.html?$/i.test(file.path));
  let checkedReferences = 0;
  for (const htmlFile of htmlFiles) {
    const html = fs.readFileSync(htmlFile.absolute, "utf8");
    for (const reference of htmlLocalAssetReferences(html, htmlFile.absolute, outputRoot)) {
      checkedReferences += 1;
      if (!fs.existsSync(reference.assetPath) || !fs.statSync(reference.assetPath).isFile()) {
        fail(`Broken local production asset reference: ${reference.rawUrl} in ${htmlFile.path}`);
      }
      const expected = sha256(fs.readFileSync(reference.assetPath)).slice(0, 16);
      if (reference.url.searchParams.get("__v") !== expected) {
        fail(`Missing or stale content fingerprint for ${reference.rawUrl} in ${htmlFile.path}; expected __v=${expected}.`);
      }
    }
  }

  const headers = fs.readFileSync(path.join(outputRoot, "_headers"), "utf8");
  for (const pattern of [/X-Content-Type-Options:\s*nosniff/i, /Referrer-Policy:\s*strict-origin-when-cross-origin/i, /Content-Security-Policy:/i, /frame-ancestors 'none'/i]) {
    if (!pattern.test(headers)) fail(`Production headers artifact is missing required security protection: ${pattern}`);
  }

  return { fileCount: actual.length, totalBytes, htmlCount: htmlFiles.length, checkedReferences, expectedCache };
}

if (require.main === module) {
  try {
    const result = auditProductionOutput();
    console.log(`Production output audit passed: ${result.fileCount} files, ${result.totalBytes} bytes, ${result.htmlCount} HTML files, ${result.checkedReferences} local JS/CSS references with valid content fingerprints, cache=${result.expectedCache}.`);
  } catch (error) {
    console.error(error && error.message ? error.message : error);
    process.exit(1);
  }
}

module.exports = { auditProductionOutput, htmlLocalAssetReferences, listFiles };
