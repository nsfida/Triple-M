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
  "fe79ac427d86a8002988e0a87b9a500f.txt", "_headers"
];
const runtimeDirs = [".well-known", "Assets", "Demo", "Founder", "Security", "regions", "seo"];
const excluded = new Set([
  "Assets/app/script.monolith.js",
  "Assets/app/script.js",
  "Assets/app/MODULES.md",
  "Assets/logo/test.png",
  "Assets/style/styles.monolith.css"
]);
const excludedPrefixes = [
  "Assets/app/_modularization/",
  "Assets/sql/"
];

function normalize(rel) { return rel.split(path.sep).join("/"); }
function isExcluded(rel) {
  const value = normalize(rel);
  return excluded.has(value) || excludedPrefixes.some(prefix => value === prefix.replace(/\/$/, "") || value.startsWith(prefix));
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

/**
 * Replace manually maintained JS/CSS cache keys with a fingerprint of each
 * actual local file. Existing query parameters are retained for compatibility.
 */
function fingerprintHtmlAssets(htmlFile, outputRoot = output) {
  const original = fs.readFileSync(htmlFile, "utf8");
  const htmlDir = path.dirname(htmlFile);
  const next = original.replace(/\b(src|href)=(['"])([^'"]+\.(?:js|css)(?:\?[^'"]*)?(?:#[^'"]*)?)\2/gi, (whole, attr, quote, rawUrl) => {
    const fragmentAt = rawUrl.indexOf("#");
    const fragment = fragmentAt >= 0 ? rawUrl.slice(fragmentAt) : "";
    const urlWithoutFragment = fragmentAt >= 0 ? rawUrl.slice(0, fragmentAt) : rawUrl;
    const queryAt = urlWithoutFragment.indexOf("?");
    const pathname = queryAt >= 0 ? urlWithoutFragment.slice(0, queryAt) : urlWithoutFragment;
    const existingQuery = queryAt >= 0 ? urlWithoutFragment.slice(queryAt + 1) : "";
    if (!pathname || /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(pathname) || /^data:/i.test(pathname)) return whole;

    let assetPath;
    try {
      assetPath = pathname.startsWith("/")
        ? path.join(outputRoot, pathname.replace(/^\/+/, ""))
        : path.resolve(htmlDir, decodeURIComponent(pathname));
    } catch (_) {
      return whole;
    }
    const relative = path.relative(outputRoot, assetPath);
    if (relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(assetPath) || !fs.statSync(assetPath).isFile()) return whole;
    const hash = crypto.createHash("sha256").update(fs.readFileSync(assetPath)).digest("hex").slice(0, 16);
    const separator = existingQuery ? "&amp;" : "?";
    const versionedUrl = pathname + (existingQuery ? "?" + existingQuery + separator : "?") + "__v=" + hash + fragment;
    return `${attr}=${quote}${versionedUrl}${quote}`;
  });
  if (next !== original) fs.writeFileSync(htmlFile, next, "utf8");
}

function fingerprintHtmlTree(dir, outputRoot = dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) fingerprintHtmlTree(abs, outputRoot);
    else if (entry.isFile() && /\.html?$/i.test(entry.name)) fingerprintHtmlAssets(abs, outputRoot);
  }
}

function getStaticCacheName(serviceWorkerSource = fs.readFileSync(path.join(root, "service-worker.js"), "utf8")) {
  const prefixMatch = serviceWorkerSource.match(/const\s+STATIC_CACHE_PREFIX\s*=\s*(["'])(.*?)\1\s*;/);
  const valueMatch = serviceWorkerSource.match(/const\s+STATIC_CACHE\s*=\s*`\$\{STATIC_CACHE_PREFIX\}([^`]+)`\s*;/);
  if (!prefixMatch || !valueMatch || !valueMatch[1].trim()) {
    throw new Error("Could not derive the static service-worker cache name from service-worker.js.");
  }
  return prefixMatch[2] + valueMatch[1];
}

function main() {
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const rel of rootFiles) copyFile(rel);
for (const rel of runtimeDirs) copyTree(rel);
fingerprintHtmlTree(output);

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
  scope: "Copied production content files; generated manifest files are not self-hashed.",
  fileCount: files.length,
  totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
  files
};
fs.writeFileSync(path.join(output, "production-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

const releaseManifest = {
  format: "triplem-vip-release-manifest-v1",
  generatedAtUtc: new Date().toISOString(),
  application: "Triplem VIP",
  build: {
    fileCount: manifest.fileCount,
    totalBytes: manifest.totalBytes,
    productionManifest: "production-manifest.json"
  },
  database: {
    databaseChangesRequired: false,
    requiredMigrations: [],
    migrationsBundled: false
  },
  edgeFunctions: {
    deploymentRequired: true,
    requiredDeployments: ["push-notifications"],
    bundledInProductionZip: false,
    reason: "The push-notifications Edge Function now validates the protected-admin session before using the service-role admin outbox operation."
  },
  cacheStrategy: "Local JavaScript and CSS references in HTML are fingerprinted from file content during the production build.",
  security: {
    freshInstallSchemaInPublicOutput: false,
    responseHeadersFile: "_headers",
    serviceWorkerCache: getStaticCacheName()
  }
};
fs.writeFileSync(path.join(output, "release-manifest.json"), JSON.stringify(releaseManifest, null, 2) + "\n");

// Guard the release directory against accidental developer-source exposure.
for (const forbidden of ["migrations", "scripts", "tests", "supabase", ".github", ".cursor", "docs", "developer-artifacts"]) {
  if (fs.existsSync(path.join(output, forbidden))) throw new Error(`Developer-only directory leaked into production output: ${forbidden}`);
}
for (const rel of excluded) {
  if (fs.existsSync(path.join(output, rel))) throw new Error(`Developer backup leaked into production output: ${rel}`);
}
for (const prefix of excludedPrefixes) {
  if (fs.existsSync(path.join(output, prefix))) throw new Error(`Developer modularization metadata leaked into production output: ${prefix}`);
}

if (fs.existsSync(path.join(output, "Assets", "sql"))) {
  throw new Error("Fresh-install SQL bundles must never be copied into public production output.");
}

console.log(`Production build ready: ${manifest.fileCount} content files, ${manifest.totalBytes} bytes before generated manifests in dist-production/.`);
}

module.exports = { fingerprintHtmlAssets, fingerprintHtmlTree, getStaticCacheName, isExcluded, normalize };

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error && error.message ? error.message : error);
    process.exit(1);
  }
}
