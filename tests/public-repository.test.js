"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  PRIVATE_SOURCE_SENTINELS,
  PUBLIC_TEST_FILES,
  getTestFiles,
  hasPrivateSource,
  resolveProfile
} = require("../scripts/run_tests.js");

const projectRoot = path.resolve(__dirname, "..");

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "triplem-public-ci-"));
}

function makeSecurityAuditFixture(root, includeFunctions = false) {
  for (const relative of [
    "scripts/security_audit.js",
    "index.html",
    "service-worker.js",
    "Assets/config/public-config.js"
  ]) {
    const source = path.join(projectRoot, relative);
    const destination = path.join(root, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
  // Older public branches may not contain a response-headers file; copy it only
  // when that file exists. If the checked-in audit requires it but it is absent,
  // the audit should fail normally rather than this test fixture fabricating it.
  const headersSource = path.join(projectRoot, "_headers");
  if (fs.existsSync(headersSource)) {
    fs.copyFileSync(headersSource, path.join(root, "_headers"));
  }
  if (includeFunctions) fs.mkdirSync(path.join(root, "supabase/functions"), { recursive: true });
}

function runSecurityAudit(root) {
  return spawnSync(process.execPath, [path.join(root, "scripts/security_audit.js")], {
    cwd: root,
    encoding: "utf8"
  });
}

test("automatic test profile selects public-safe checks when private backend source is withheld", () => {
  const root = makeTempRoot();
  try {
    assert.equal(hasPrivateSource(root), false);
    assert.equal(resolveProfile(root, "auto"), "public");
    assert.deepEqual(getTestFiles(projectRoot, "public"), PUBLIC_TEST_FILES);
    assert.ok(PUBLIC_TEST_FILES.includes("tests/app-downloads-public.test.js"), "public profile must keep browser-facing download coverage");
    assert.ok(!PUBLIC_TEST_FILES.includes("tests/app-downloads.test.js"), "public profile must not invoke source-inspection tests for private native build files");
    assert.ok(PRIVATE_SOURCE_SENTINELS.every(relative => !fs.existsSync(path.join(root, relative))));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("full profile is used only when both private SQL and Edge Function sources are available", () => {
  const root = makeTempRoot();
  try {
    for (const relative of PRIVATE_SOURCE_SENTINELS) {
      const file = path.join(root, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, "-- private-source sentinel\n");
    }
    assert.equal(hasPrivateSource(root), true);
    assert.equal(resolveProfile(root, "auto"), "full");
    assert.equal(resolveProfile(root, "full"), "full");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("explicit full profile fails with a clear explanation instead of asking public CI to fetch SQL", () => {
  const root = makeTempRoot();
  try {
    assert.throws(() => resolveProfile(root, "full"), /Do not upload SQL files just to satisfy public CI/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("security audit succeeds when Supabase Edge Function source is absent", () => {
  const root = makeTempRoot();
  try {
    makeSecurityAuditFixture(root, false);
    const result = runSecurityAudit(root);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Skipping Supabase edge function credential checks/);
    assert.match(result.stdout, /Security audit passed/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("security audit continues scanning Edge Functions when source exists", () => {
  const root = makeTempRoot();
  try {
    makeSecurityAuditFixture(root, true);
    const safe = path.join(root, "supabase/functions/example/index.ts");
    fs.mkdirSync(path.dirname(safe), { recursive: true });
    fs.writeFileSync(safe, "export const safe = true;\n");
    const safeResult = runSecurityAudit(root);
    assert.equal(safeResult.status, 0, safeResult.stderr || safeResult.stdout);
    assert.doesNotMatch(safeResult.stdout, /Skipping Supabase/);

    fs.writeFileSync(safe, "const leaked = 'sk_live_testCredential123';\n");
    const unsafeResult = runSecurityAudit(root);
    assert.notEqual(unsafeResult.status, 0, "security audit must reject a literal credential");
    assert.match(unsafeResult.stderr, /Literal private credential detected in supabase\/functions\/example\/index\.ts/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
