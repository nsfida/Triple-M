#!/usr/bin/env node
"use strict";

// Run the complete regression suite in the private full-source checkout, but
// use a deliberately limited public-safe suite when backend SQL/Edge Function
// implementation files are intentionally not present in the public repository.
// This keeps CI useful without publishing private database implementation files.

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const PRIVATE_SOURCE_SENTINELS = [
  "migrations/schema.sql",
  "supabase/functions/push-notifications/index.ts"
];
const PUBLIC_TEST_FILES = [
  // This public-only test file checks website download behavior and the
  // published setup executable without loading private native build sources.
  // The full app-downloads.test.js remains part of the full-source suite only.
  "tests/app-downloads-public.test.js",
  "tests/frontend-hardening.test.js",
  "tests/seo-quality.test.js",
  "tests/public-repository.test.js"
];

function hasPrivateSource(rootDir = root) {
  return PRIVATE_SOURCE_SENTINELS.every(relative => {
    const absolute = path.join(rootDir, relative);
    try { return fs.statSync(absolute).isFile(); }
    catch (_) { return false; }
  });
}

function resolveProfile(rootDir = root, requested = "auto") {
  const profile = String(requested || "auto").trim().toLowerCase();
  if (!["auto", "full", "public"].includes(profile)) {
    throw new Error(`Unknown test profile "${requested}". Use auto, full, or public.`);
  }
  const privateSourceAvailable = hasPrivateSource(rootDir);
  if (profile === "full" && !privateSourceAvailable) {
    throw new Error(
      "The full regression profile needs private source files that are intentionally absent from this checkout: " +
      PRIVATE_SOURCE_SENTINELS.join(" and ") + ". Do not upload SQL files just to satisfy public CI. " +
      "Run the full profile from the private full-source workspace, or use --profile=public here."
    );
  }
  if (profile === "public") return "public";
  if (profile === "full") return "full";
  return privateSourceAvailable ? "full" : "public";
}

function getTestFiles(rootDir = root, profile = "auto") {
  const resolved = profile === "auto" ? resolveProfile(rootDir, profile) : profile;
  if (resolved === "public") {
    const missing = PUBLIC_TEST_FILES.filter(relative => !fs.existsSync(path.join(rootDir, relative)));
    if (missing.length) throw new Error(`Public-safe test file(s) missing: ${missing.join(", ")}`);
    return [...PUBLIC_TEST_FILES];
  }
  const testsDir = path.join(rootDir, "tests");
  return fs.readdirSync(testsDir)
    .filter(name => name.endsWith(".test.js"))
    .sort((a, b) => a.localeCompare(b))
    .map(name => path.join("tests", name));
}

function main() {
  const arg = process.argv.slice(2).find(value => value.startsWith("--profile="));
  const requested = arg ? arg.slice("--profile=".length) : (process.env.TRIPLEM_TEST_PROFILE || "auto");
  let profile;
  let files;
  try {
    profile = resolveProfile(root, requested);
    files = getTestFiles(root, profile);
  } catch (error) {
    console.error(`[test] ${error.message}`);
    process.exitCode = 1;
    return;
  }

  if (profile === "public") {
    console.log("[test] Private SQL migration and Supabase Edge Function sources are not both present.");
    console.log("[test] Running the public-safe regression suite: published app download behavior, frontend hardening, SEO/GEO and public-checkout safety.");
    console.log("[test] Native Windows implementation tests are excluded because their build-source files are not part of this public checkout.");
    console.log("[test] No SQL files need to be added to the public repository. Full schema-dependent tests remain available in the private full-source workspace.");
  } else {
    console.log(`[test] Full backend source detected; running all ${files.length} regression test files, including migration and Edge Function checks.`);
  }

  const absoluteFiles = files.map(relative => path.join(root, relative));
  const result = spawnSync(process.execPath, ["--test", ...absoluteFiles], {
    cwd: root,
    env: { ...process.env, TRIPLEM_RESOLVED_TEST_PROFILE: profile },
    stdio: "inherit"
  });
  if (result.error) {
    console.error(`[test] Could not start Node test runner: ${result.error.message}`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = Number.isInteger(result.status) ? result.status : 1;
}

if (require.main === module) main();

module.exports = {
  PRIVATE_SOURCE_SENTINELS,
  PUBLIC_TEST_FILES,
  getTestFiles,
  hasPrivateSource,
  resolveProfile
};
