#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");
const fail = message => { throw new Error(message); };
const stripComments = html => html.replace(/<!--[\s\S]*?-->/g, "");
const stripQuery = value => String(value || "").split(/[?#]/, 1)[0].replace(/&amp;/g, "&");

const index = read("index.html");
const activeIndex = stripComments(index);

// 1. IDs must stay unique: duplicate modal/control IDs produce non-deterministic bindings.
const ids = [...activeIndex.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
const seen = new Set();
for (const id of ids) {
  if (seen.has(id)) fail(`Duplicate id in index.html: ${id}`);
  seen.add(id);
}

// 2. Every local active stylesheet/script reference must resolve on disk.
const refs = [];
for (const match of activeIndex.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/g)) refs.push(match[1]);
for (const match of activeIndex.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)) refs.push(match[1]);
for (const ref of refs) {
  if (/^(?:https?:)?\/\//i.test(ref) || /^data:/i.test(ref)) continue;
  const rel = stripQuery(ref);
  if (!rel || !fs.existsSync(path.join(root, rel))) fail(`Broken active frontend reference: ${ref}`);
}

// 3. New-window anchors need opener isolation.
for (const match of activeIndex.matchAll(/<a\b[^>]*\btarget="_blank"[^>]*>/g)) {
  const tag = match[0];
  if (!/\brel="[^"]*\bnoopener\b[^"]*"/i.test(tag)) fail(`target=_blank without noopener: ${tag}`);
}

// 4. Production CSS consolidation is a hard performance invariant.
const activeStyles = [...activeIndex.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/g)].map(match => match[1]);
if (activeStyles.length > 3) fail(`Too many active stylesheets on index.html: ${activeStyles.length} (budget: 3)`);
if (!activeStyles.some(ref => ref.includes("Assets/style/app.feature.bundle.css"))) fail("Feature CSS production bundle is not active.");

// 5. Bottom runtime scripts must stay deferred; only early theme/bootstrap and analytics may execute parser-blocking/async.
const runtimeMarker = activeIndex.indexOf("jspdf.umd.min.js");
if (runtimeMarker < 0) fail("Runtime script marker not found.");
const runtimeHtml = activeIndex.slice(runtimeMarker);
for (const match of runtimeHtml.matchAll(/<script\b([^>]*)\bsrc="([^"]+)"([^>]*)><\/script>/g)) {
  const tag = match[0];
  if (!/\bdefer\b/i.test(tag)) fail(`Runtime script is not deferred: ${match[2]}`);
}

// 6. Verify the generated feature CSS exactly matches its manifest/source hashes.
const manifest = JSON.parse(read("Assets/style/app.feature.bundle.manifest.json"));
const bundle = read("Assets/style/app.feature.bundle.css");
const bundleHash = crypto.createHash("sha256").update(bundle).digest("hex");
if (bundleHash !== manifest.sha256) fail("Feature CSS bundle hash does not match its manifest. Run npm run build:styles.");
for (const source of manifest.sources || []) {
  const body = read(source.path);
  const hash = crypto.createHash("sha256").update(body).digest("hex");
  if (hash !== source.sha256) fail(`Feature CSS source changed without rebuilding bundle: ${source.path}`);
}

// 7. Delivery/security invariants.
if (!/Content-Security-Policy[^>]+object-src 'none'; base-uri 'self'/i.test(index)) fail("Low-risk CSP hardening is missing from index.html.");
const sw = read("service-worker.js");
if (!/self\.addEventListener\("fetch"/.test(sw) || !/STATIC_CACHE/.test(sw)) fail("Static asset service-worker cache is missing.");
if (!/00-performance\.js/.test(activeIndex)) fail("Non-blocking service-worker registration helper is not loaded.");

console.log(`Frontend audit passed: ${ids.length} unique IDs, ${activeStyles.length} active stylesheets, ${refs.length} active resource references.`);
