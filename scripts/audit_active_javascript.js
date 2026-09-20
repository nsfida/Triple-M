#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");
const stripComments = html => html.replace(/<!--[\s\S]*?-->/g, "");
const stripQuery = value => String(value || "").split(/[?#]/, 1)[0].replace(/&amp;/g, "&");

const html = stripComments(read("index.html"));
const localScripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)]
  .map(match => match[1])
  .filter(ref => !/^(?:https?:)?\/\//i.test(ref) && !/^data:/i.test(ref))
  .map(stripQuery);

const unique = [...new Set(localScripts)];
let totalBytes = 0;
for (const rel of unique) {
  const absolute = path.join(root, rel);
  if (!fs.existsSync(absolute)) throw new Error(`Active JavaScript file is missing: ${rel}`);
  const source = fs.readFileSync(absolute, "utf8");
  totalBytes += Buffer.byteLength(source);
  try {
    new vm.Script(source, { filename: rel });
  } catch (error) {
    throw new Error(`JavaScript syntax error in ${rel}: ${error.message}`);
  }
}

for (const rel of ["service-worker.js"]) {
  const source = read(rel);
  try { new vm.Script(source, { filename: rel }); }
  catch (error) { throw new Error(`JavaScript syntax error in ${rel}: ${error.message}`); }
}

console.log(`Active JavaScript syntax audit passed: ${unique.length} local scripts, ${totalBytes} bytes.`);
