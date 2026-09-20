"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.join(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");
const activeHtml = html => html.replace(/<!--[\s\S]*?-->/g, "");

test("production CSS bundle preserves every maintained feature stylesheet in source order", () => {
  const manifest = JSON.parse(read("Assets/style/app.feature.bundle.manifest.json"));
  const bundle = read("Assets/style/app.feature.bundle.css");
  assert.equal(manifest.sources.length, 23);
  let last = -1;
  for (const source of manifest.sources) {
    const marker = `/* ===== SOURCE: ${source.path} ===== */`;
    const next = bundle.indexOf(marker);
    assert.ok(next > last, `${source.path} should retain source cascade order`);
    last = next;
    const body = read(source.path);
    assert.equal(crypto.createHash("sha256").update(body).digest("hex"), source.sha256);
  }
  assert.equal(crypto.createHash("sha256").update(bundle).digest("hex"), manifest.sha256);
});

test("main page reduces active stylesheets while keeping original source references inert", () => {
  const html = read("index.html");
  const active = activeHtml(html);
  const styles = [...active.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)].map(m => m[1]);
  assert.equal(styles.length, 3);
  assert.ok(styles.some(ref => ref.includes("app.bundle.css")));
  assert.ok(styles.some(ref => ref.includes("app.feature.bundle.css")));
  assert.match(html, /Assets\/style\/52-workspace-section-home\.css/);
  assert.doesNotMatch(active, /Assets\/style\/52-workspace-section-home\.css/);
});

test("runtime delivery is deferred and repeat-visit caching excludes application data/API traffic", () => {
  const html = activeHtml(read("index.html"));
  const marker = html.indexOf("jspdf.umd.min.js");
  assert.ok(marker >= 0);
  const runtime = html.slice(marker);
  const scripts = [...runtime.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g)];
  assert.ok(scripts.length > 50);
  for (const match of scripts) assert.match(match[0], /\bdefer\b/);

  const sw = read("service-worker.js");
  assert.match(sw, /url\.origin !== self\.location\.origin/);
  assert.match(sw, /url\.pathname\.includes\("\/Assets\/"\)/);
  assert.match(sw, /request\.method !== "GET"/);
  assert.doesNotMatch(sw, /functions\/v1|rest\/v1|auth\/v1/);
});

test("index applies opener isolation and low-risk CSP directives without restricting app APIs", () => {
  const html = activeHtml(read("index.html"));
  assert.match(html, /Content-Security-Policy" content="object-src 'none'; base-uri 'self'"/);
  for (const match of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) {
    assert.match(match[0], /rel="[^"]*noopener/);
  }
});
