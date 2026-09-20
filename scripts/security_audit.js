#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");
const stripComments = html => html.replace(/<!--[\s\S]*?-->/g, "");
const fail = message => { throw new Error(message); };
const stripQuery = value => String(value || "").split(/[?#]/, 1)[0].replace(/&amp;/g, "&");

const index = read("index.html");
const active = stripComments(index);

// Browser-level baseline that is safe for the existing application architecture.
if (!/Content-Security-Policy" content="object-src 'none'; base-uri 'self'"/i.test(index)) {
  fail("CSP baseline must block plugins and hostile base URL rewriting.");
}
if (!/<meta\s+name="referrer"\s+content="strict-origin-when-cross-origin"\s*\/>/i.test(index)) {
  fail("Strict cross-origin referrer policy is missing.");
}

// Every application runtime script must be deferred and declared in <head> so it is
// fetched early but still executes after the DOM is parsed, preserving existing behavior.
const headEnd = active.indexOf("</head>");
const runtimeStart = active.indexOf("jspdf.umd.min.js");
if (runtimeStart < 0 || headEnd < 0 || runtimeStart > headEnd) fail("Deferred runtime must be declared inside <head>.");
const runtimeHead = active.slice(runtimeStart, headEnd);
const runtimeScripts = [...runtimeHead.matchAll(/<script\b([^>]*)\bsrc="([^"]+)"([^>]*)><\/script>/g)];
if (runtimeScripts.length < 50) fail(`Unexpectedly small runtime script set: ${runtimeScripts.length}`);
for (const match of runtimeScripts) {
  if (!/\bdefer\b/i.test(match[0])) fail(`Runtime script is not deferred: ${match[2]}`);
}

// External executable dependencies must remain pinned to explicit versions. Google tag
// manager is intentionally keyed by the site's fixed measurement ID instead of a package version.
const allowedExecutableHosts = new Set(["cdnjs.cloudflare.com", "cdn.jsdelivr.net", "www.googletagmanager.com"]);
for (const match of active.matchAll(/<script\b[^>]*\bsrc="(https:\/\/[^\"]+)"[^>]*><\/script>/g)) {
  const url = new URL(match[1].replace(/&amp;/g, "&"));
  if (!allowedExecutableHosts.has(url.hostname)) fail(`Unapproved external script host: ${url.hostname}`);
  if (url.hostname === "cdnjs.cloudflare.com" && !/\/ajax\/libs\/[^/]+\/\d+(?:\.\d+)+(?:[-+][^/]*)?\//.test(url.pathname)) {
    fail(`Unpinned cdnjs dependency: ${url.href}`);
  }
  if (url.hostname === "cdn.jsdelivr.net" && !/@\d+(?:\.\d+)+(?:[-+][^/]*)?\//.test(url.pathname)) {
    fail(`Unpinned jsDelivr dependency: ${url.href}`);
  }
  if (url.hostname === "www.googletagmanager.com" && url.searchParams.get("id") !== "G-TBKZB3FEVZ") {
    fail("Unexpected Google tag measurement ID.");
  }
}

// Development backups and internal tooling must never become active browser resources.
const forbiddenActivePaths = [
  "Assets/app/script.monolith.js",
  "Assets/app/_modularization/",
  "Assets/style/styles.monolith.css",
  "migrations/",
  "scripts/",
  "tests/",
  "supabase/functions/"
];
const activeRefs = [
  ...active.matchAll(/<(?:script|link|img|source)\b[^>]*(?:src|href|srcset)="([^"]+)"[^>]*>/g)
].map(match => stripQuery(match[1]));
for (const ref of activeRefs) {
  for (const forbidden of forbiddenActivePaths) {
    if (ref.includes(forbidden)) fail(`Development-only path is active in the browser: ${ref}`);
  }
}

// Public runtime configuration must not contain private application secrets.
const publicConfig = read("Assets/config/public-config.js");
const secretPatterns = [
  /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*["'`][^"'`]+/i,
  /GEMINI_API_KEY\s*[:=]\s*["'`][^"'`]+/i,
  /sk_live_[0-9A-Za-z]+/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/
];
for (const pattern of secretPatterns) {
  if (pattern.test(publicConfig)) fail(`Private secret pattern detected in public-config.js: ${pattern}`);
}

// Edge functions must source privileged credentials from the environment rather than literals.
for (const dirent of fs.readdirSync(path.join(root, "supabase/functions"), { withFileTypes: true })) {
  if (!dirent.isDirectory()) continue;
  const rel = `supabase/functions/${dirent.name}/index.ts`;
  const absolute = path.join(root, rel);
  if (!fs.existsSync(absolute)) continue;
  const source = fs.readFileSync(absolute, "utf8");
  for (const pattern of [/sk_live_[0-9A-Za-z]+/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/]) {
    if (pattern.test(source)) fail(`Literal private credential detected in ${rel}`);
  }
}

// Static caching may never intercept Supabase/API requests or non-GET mutations.
const sw = read("service-worker.js");
for (const required of [
  /request\.method !== "GET"/,
  /url\.origin !== self\.location\.origin/,
  /url\.pathname\.includes\("\/Assets\/"\)/
]) {
  if (!required.test(sw)) fail(`Service worker cache boundary is missing: ${required}`);
}
if (/functions\/v1|rest\/v1|auth\/v1/.test(sw)) fail("Service worker must not cache Supabase API/auth traffic.");

console.log(`Security audit passed: ${runtimeScripts.length} deferred runtime scripts, pinned executable CDNs, no public secret literals.`);
