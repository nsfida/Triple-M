#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
const sources = [
  "Assets/style/52-workspace-section-home.css",
  "Assets/style/35-build011-refinements.css",
  "Assets/style/31-aziz-live-support.css",
  "Assets/style/32-aziz-chat-agent-polish.css",
  "Assets/style/33-live-chat-records-polish.css",
  "Assets/style/34-build010-upgrades.css",
  "Assets/style/22-landing-hero-polish.css",
  "Assets/style/36-build012-notes-redesign.css",
  "Assets/style/37-build013-filter-cleanup.css",
  "Assets/style/38-build014-inventory-overview-polish.css",
  "Assets/style/39-assets-depreciation-fixes.css",
  "Assets/style/40-account-security-session-refinement.css",
  "Assets/style/41-accounting-suite.css",
  "Assets/style/42-public-accounting-seo.css",
  "Assets/style/43-expenses-overlay-refinement.css",
  "Assets/style/44-financial-audit-report.css",
  "Assets/style/45-triplem-ai.css",
  "Assets/style/47-section-keyboard-shortcuts.css",
  "Assets/style/48-installment-bought-sold.css",
  "Assets/style/50-dashboard-financial-timeline.css",
  "Assets/style/51-messages-compose-receipts.css",
  "Assets/style/53-company-team-management.css",
  "Assets/style/54-insurance.css"
];

const output = path.join(root, "Assets/style/app.feature.bundle.css");
const manifestPath = path.join(root, "Assets/style/app.feature.bundle.manifest.json");

const parts = [
  "/* Triplem VIP feature CSS production bundle.\n" +
  " * Generated from the maintained source files listed in app.feature.bundle.manifest.json.\n" +
  " * Source order is identical to the former index.html stylesheet order.\n" +
  " * Run: npm run build:styles\n" +
  " */\n"
];
const manifest = { version: 1, generatedBy: "scripts/build_feature_css_bundle.js", sources: [] };

for (const relative of sources) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) throw new Error(`Missing CSS source: ${relative}`);
  const source = fs.readFileSync(absolute, "utf8");
  const sha256 = crypto.createHash("sha256").update(source).digest("hex");
  manifest.sources.push({ path: relative, bytes: Buffer.byteLength(source), sha256 });
  parts.push(`\n/* ===== SOURCE: ${relative} ===== */\n`);
  parts.push(source.trimEnd());
  parts.push("\n");
}

const bundle = parts.join("");
fs.writeFileSync(output, bundle);
manifest.bytes = Buffer.byteLength(bundle);
manifest.sha256 = crypto.createHash("sha256").update(bundle).digest("hex");
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Built ${path.relative(root, output)} from ${sources.length} source files (${manifest.bytes} bytes).`);
