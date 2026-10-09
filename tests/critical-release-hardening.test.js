"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");

test("fresh-install SQL bundle has a fail-closed empty-schema guard and transaction", () => {
  const builder = require(path.join(root, "scripts", "build_full_schema_sql.js"));
  const result = builder.buildFullSchema({ write: false });
  const begin = result.sql.indexOf("BEGIN;");
  const guard = result.sql.indexOf("DO $triplem_fresh_install_safety_guard$");
  const drop = result.sql.indexOf("drop view if exists public.v_loan_ledger_unified");
  assert.ok(begin >= 0 && guard > begin && drop > guard, "guard must execute before every destructive reset operation");
  assert.match(result.sql, /public schema is not empty/);
  assert.match(result.sql, /RAISE EXCEPTION USING[\s\S]*ERRCODE = 'P0001'/);
  assert.match(result.sql.trimEnd(), /COMMIT;$/);
  assert.equal((result.sql.match(/^\s*begin\s*;\s*$/gim) || []).length, 1, "bundled migrations must not begin nested transactions");
  assert.equal((result.sql.match(/^\s*commit\s*;\s*$/gim) || []).length, 1, "bundled migrations must not commit before the final guard-controlled commit");
  assert.match(builder.DEFAULT_OUT_FILE, /developer-artifacts[\\/]fresh-install-only[\\/]triplem_full_schema\.sql$/);
  assert.doesNotMatch(builder.DEFAULT_OUT_FILE, /Assets[\\/]sql/);
});

test("standalone migrations/schema.sql aborts on populated public schema before destructive statements", () => {
  const schema = read("migrations/schema.sql");
  const begin = schema.indexOf("BEGIN;");
  const guard = schema.indexOf("DO $triplem_schema_empty_guard$");
  const drop = schema.indexOf("drop view if exists public.v_loan_ledger_unified");
  assert.ok(begin >= 0 && guard > begin && drop > guard, "standalone bootstrap must run its safety guard before any DROP");
  assert.match(schema, /TRIPLEM VIP SAFETY STOP:[\s\S]*brand-new empty public schema only/);
  assert.match(schema.trimEnd(), /COMMIT;$/);
});

test("schema builder refuses to generate a destructive full schema without explicit fresh-install confirmation", () => {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "build_full_schema_sql.js")], {
    cwd: root,
    encoding: "utf8"
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Refusing to build a destructive full-schema bundle without explicit confirmation/);
});

test("production builder excludes SQL bundles and fingerprints local JS/CSS from their content", () => {
  const build = require(path.join(root, "scripts", "build_production.js"));
  assert.equal(build.isExcluded("Assets/sql"), true);
  assert.equal(build.isExcluded("Assets/sql/triplem_full_schema.sql"), true);
  assert.equal(build.isExcluded("Assets/app/MODULES.md"), true);
  assert.equal(build.isExcluded("Assets/logo/test.png"), true);
  assert.equal(build.isExcluded("Assets/app/insurance/01-insurance.js"), false);
  assert.equal(build.getStaticCacheName(), "triplem-static-v189-critical-hardening1");

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "triplem-build-fingerprint-"));
  try {
    fs.mkdirSync(path.join(temp, "Assets"), { recursive: true });
    fs.writeFileSync(path.join(temp, "Assets", "runtime.js"), "window.buildVersion = 2;\n");
    fs.writeFileSync(path.join(temp, "Assets", "app.css"), "body{color:#111}\n");
    const htmlFile = path.join(temp, "index.html");
    fs.writeFileSync(htmlFile, '<script src="Assets/runtime.js?v=old&amp;channel=stable#runtime"></script><link rel="stylesheet" href="/Assets/app.css"><script src="https://cdn.example.test/lib.js?v=1#external"></script>');
    build.fingerprintHtmlAssets(htmlFile, temp);
    const html = fs.readFileSync(htmlFile, "utf8");
    const jsHash = crypto.createHash("sha256").update(fs.readFileSync(path.join(temp, "Assets", "runtime.js"))).digest("hex").slice(0, 16);
    const cssHash = crypto.createHash("sha256").update(fs.readFileSync(path.join(temp, "Assets", "app.css"))).digest("hex").slice(0, 16);
    assert.ok(html.includes(`Assets/runtime.js?v=old&amp;channel=stable&amp;__v=${jsHash}#runtime`));
    assert.ok(html.includes(`/Assets/app.css?__v=${cssHash}`));
    assert.ok(html.includes('https://cdn.example.test/lib.js?v=1#external'), "external URLs must not be rewritten");
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("service worker opens only same-origin HTTP(S) notification destinations", async () => {
  const source = read("service-worker.js");
  const listeners = new Map();
  let openedUrl = null;
  const self = {
    location: { origin: "https://triplem.vip" },
    addEventListener(name, listener) { listeners.set(name, listener); },
    clients: {
      async matchAll() { return []; },
      async openWindow(url) { openedUrl = url; return null; }
    },
    registration: { async showNotification() {} }
  };
  vm.runInNewContext(source, {
    self,
    URL,
    Date,
    Promise,
    Set,
    String,
    Number,
    console,
    caches: { async keys() { return []; }, async open() { return { async match() { return null; }, async put() {} }; } },
    fetch: async () => ({ ok: true, type: "basic", clone() { return this; } })
  }, { filename: "service-worker.js" });

  async function click(url) {
    openedUrl = null;
    let pending;
    const handler = listeners.get("notificationclick");
    assert.equal(typeof handler, "function");
    handler({
      notification: { data: { url }, close() {} },
      waitUntil(promise) { pending = promise; }
    });
    await pending;
    return openedUrl;
  }

  assert.equal(await click("/settings?tab=security"), "https://triplem.vip/settings?tab=security");
  assert.equal(await click("https://attacker.example/steal"), "https://triplem.vip/");
  assert.equal(await click("//attacker.example/steal"), "https://triplem.vip/");
  assert.equal(await click("javascript:alert(1)"), "https://triplem.vip/");
});

test("release security policy and cache identifiers cover the critical changes", () => {
  const index = read("index.html");
  const headers = read("_headers");
  assert.match(index, /default-src 'self'; base-uri 'self'; object-src 'none'/);
  assert.match(headers, /frame-ancestors 'none'/);
  assert.match(headers, /X-Content-Type-Options: nosniff/);
  assert.match(headers, /Strict-Transport-Security: max-age=31536000/);
  assert.match(index, /01-assets\.js\?v=20261009-assets-critical-fixes/);
  assert.match(index, /01-bitcoin\.js\?v=20261009-bitcoin-critical-fixes/);
  assert.match(index, /01-insurance\.js\?v=20261009-insurance-critical-fixes/);
  const sw = read("service-worker.js");
  assert.match(sw, /STATIC_CACHE_PREFIX = "triplem-static-"/);
  assert.match(sw, /\$\{STATIC_CACHE_PREFIX\}v189-critical-hardening1/);
});


test("privileged admin inbox flush requires a server-validated protected-admin session before service-role calls", () => {
  const source = read("supabase/functions/push-notifications/index.ts");
  const start = source.indexOf('if (action === "admin_inbox_flush")');
  const end = source.indexOf('if (action === "admin_visitor_count")', start);
  assert.ok(start >= 0 && end > start, "admin inbox flush action must remain identifiable");
  const branch = source.slice(start, end);
  const sessionCheck = branch.indexOf('await callCustomSessionRpc(req, "app_push_admin_visitor_subscriber_count", {})');
  const serviceRoleCall = branch.indexOf('await adminClient.rpc("app_push_service_claim_admin_outbox"');
  assert.ok(sessionCheck >= 0, "flush must require the protected-admin session validation RPC");
  assert.ok(serviceRoleCall > sessionCheck, "session validation must happen before any service-role outbox operation");
  assert.match(branch, /Origin checks are not authentication/);
  const buildScript = read("scripts/build_production.js");
  assert.match(buildScript, /requiredDeployments:\s*\["push-notifications"\]/);
  assert.match(buildScript, /bundledInProductionZip:\s*false/);
});
