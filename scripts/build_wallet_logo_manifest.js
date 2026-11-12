#!/usr/bin/env node
/* Writes Assets/logo/wallet_logos/manifest.json: the built-in wallet logos offered by the
 * wallet logo picker (a browser cannot list a folder). Run after adding or removing a
 * logo file:  node scripts/build_wallet_logo_manifest.js   (tests check it is current). */
"use strict";
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "Assets", "logo", "wallet_logos");
const DEFAULT_FILE = "triplem_default_wallet.png";

function buildManifest(dir = DIR) {
  const files = fs.readdirSync(dir)
    .filter(f => /\.(png|jpe?g|webp|svg)$/i.test(f) && !f.startsWith("."))
    .sort((a, b) => (a === DEFAULT_FILE) - (b === DEFAULT_FILE) || a.localeCompare(b, "en", { sensitivity: "base" }));
  return {
    version: 1,
    logos: files.map(file => ({
      file,
      name: file === DEFAULT_FILE ? "Triplem VIP" : file.replace(/\.[^.]+$/, "")
    }))
  };
}

if (require.main === module) {
  const out = path.join(DIR, "manifest.json");
  fs.writeFileSync(out, JSON.stringify(buildManifest(), null, 2) + "\n");
  console.log(`Wrote ${path.relative(process.cwd(), out)}`);
}

module.exports = { buildManifest, DIR };
