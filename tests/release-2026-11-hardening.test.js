"use strict";

/* Regression guards for the November 2026 reliability/security release. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");
const stripSqlComments = sql => sql.replace(/--.*$/gm, "");

test("201 only revokes browser EXECUTE from internal helpers (no data or schema change)", () => {
  const sql = read("migrations/201_security_internal_helper_execute_hardening.sql");
  const code = stripSqlComments(sql);
  assert.match(code, /app_grant_default_permissions\(uuid\)/);
  assert.match(code, /revoke execute on function %s from public, anon, authenticated/);
  assert.match(code, /to_regprocedure\(fn\) is not null/);
  assert.doesNotMatch(code, /\b(drop|truncate|delete\s+from|update\s+public\.|insert\s+into|alter\s+table|create\s+or\s+replace)\b/i);
});

test("202 keeps app_validate_session behaviour and only throttles the session touch", () => {
  const sql = read("migrations/202_session_validation_write_reduction.sql");
  const previous = read("migrations/085_admin_key_page_lock_and_smart_pin_lockout.sql");
  assert.match(sql, /sess\.last_seen_at < now\(\) - interval '5 minutes'/);
  for (const message of ["Session expired or invalid", "Account is disabled", "access period expired", "Smart PIN lockout"]) {
    assert.ok(sql.includes(message), `keeps message: ${message}`);
    assert.ok(previous.includes(message), `message existed before: ${message}`);
  }
  assert.match(sql, /perform public\.app_enforce_access_expiry\(u\.id\)/);
  assert.match(sql, /expires_at = greatest\(expires_at, now\(\) \+ interval '14 days'\)/);
  assert.doesNotMatch(stripSqlComments(sql), /\b(drop|truncate|delete\s+from|alter\s+table)\b/i);
});

test("service worker serves an offline app shell but never touches Supabase traffic", () => {
  const sw = read("service-worker.js");
  assert.match(sw, /request\.mode === "navigate" && url\.origin === self\.location\.origin/);
  assert.match(sw, /navigationNetworkFirst/);
  assert.match(sw, /precacheAppShell/);
  assert.match(sw, /PINNED_CDN_HOSTS = new Set\(\["cdn\.jsdelivr\.net", "cdnjs\.cloudflare\.com"/);
  assert.doesNotMatch(sw, /supabase\.co|functions\/v1|rest\/v1|auth\/v1/);
});

test("service worker navigation falls back to the cached shell when offline", async () => {
  const source = read("service-worker.js");
  const listeners = new Map();
  const store = new Map();
  let online = true;
  const cache = {
    async match(key) { const k = typeof key === "string" ? key : key.url; return store.get(k) || null; },
    async put(key, value) { store.set(typeof key === "string" ? key : key.url, value); }
  };
  class FakeResponse {
    constructor(body, init = {}) { this.body = body; this.status = init.status || 200; this.ok = this.status < 400; this.type = "basic"; this.redirected = false; this.headers = new Map(Object.entries(init.headers || {})); }
    clone() { return this; }
    async text() { return String(this.body); }
  }
  const context = {
    self: { location: { origin: "https://triplem.vip" }, registration: { scope: "https://triplem.vip/" }, addEventListener(name, fn) { listeners.set(name, fn); }, clients: { claim: async () => {} }, skipWaiting: async () => {} },
    URL, Promise, Set, Map, String, Number, Error, console, setTimeout, clearTimeout,
    Request: class { constructor(url) { this.url = url; } },
    Response: FakeResponse,
    caches: { async open() { return cache; }, async keys() { return []; } },
    fetch: async () => { if (!online) throw new TypeError("Failed to fetch"); return new FakeResponse("<html>shell</html>"); }
  };
  vm.runInNewContext(source, context, { filename: "service-worker.js" });
  const fetchHandler = listeners.get("fetch");
  async function navigate(url) {
    let responded;
    const waits = [];
    fetchHandler({
      request: { url, method: "GET", mode: "navigate", headers: { has: () => false }, destination: "document" },
      respondWith(p) { responded = p; },
      waitUntil(p) { waits.push(p); }
    });
    const response = await responded;
    await Promise.all(waits);
    return response;
  }
  const first = await navigate("https://triplem.vip/?push=messages");
  assert.equal(await first.text(), "<html>shell</html>");
  online = false;
  const offline = await navigate("https://triplem.vip/");
  assert.equal(await offline.text(), "<html>shell</html>", "cached shell served offline");
  const unknown = await navigate("https://triplem.vip/seo/never-visited.html");
  assert.equal(await unknown.text(), "<html>shell</html>", "falls back to the app shell");
});

test("both service-worker registrations use one script URL (no reinstall loop)", () => {
  const perf = read("Assets/app/core/00-performance.js");
  const push = read("Assets/app/notifications/01-web-push.js");
  assert.match(perf, /window\.TRIPLEM_SERVICE_WORKER_URL \|\| "\/service-worker\.js\?v=123"/);
  assert.match(push, /window\.TRIPLEM_SERVICE_WORKER_URL \|\| "\/service-worker\.js\?v=123"/);
});

test("admin push outbox flush is scheduled only for the protected Main Admin and throttled for reads", () => {
  const auth = read("Assets/app/auth/01-auth-session.js");
  const push = read("Assets/app/notifications/01-web-push.js");
  assert.match(auth, /state\.sessionUser\?\.is_protected === true && state\.sessionUser\?\.role === "admin"[\s\S]{0,200}scheduleAdminInboxFlush/);
  assert.match(push, /ADMIN_INBOX_FLUSH_READ_GAP_MS = 60000/);
  assert.match(push, /if \(!mutating && elapsed < ADMIN_INBOX_FLUSH_READ_GAP_MS\) return false;/);
});

test("wallet names are escaped in transfer and top-up confirmation overlays", () => {
  for (const rel of ["Assets/app/expenses/02-transfers.js", "Demo/Assets/app/expenses/02-transfers.js"]) {
    const src = read(rel);
    assert.match(src, /\$\{escapeHtml\(fromAccount\.person_name\)\}/);
    assert.match(src, /\$\{escapeHtml\(toAccount\.person_name\)\}/);
    assert.match(src, /\$\{escapeHtml\(walletName\)\}/);
    assert.doesNotMatch(src, /16\)\} \$\{(?:walletName|fromAccount\.person_name|toAccount\.person_name)\}/);
  }
});

test("the Bitcoin module loads even when the bitcoinjs CDN script is unavailable", () => {
  const source = read("Assets/app/bitcoin/01-bitcoin.js");
  const head = source.slice(0, source.indexOf("const BTC_BIP39_ENGLISH_WORDS"));
  const context = { BigInt };
  vm.runInNewContext(`${head}; this.ok = typeof BTC_GUEST_SERVICE_FEE_ADDRESS === "string" && BTC_NETWORKS.mainnet.network === null;`, context);
  assert.equal(context.ok, true);
});

test("offline read cache is encrypted, owner-scoped and wiped on sign-out without touching the write queue", () => {
  const cache = read("Assets/app/core/10-offline-cache.js");
  const config = read("Assets/app/core/01-config-constants.js");
  assert.match(cache, /name: "AES-GCM"/);
  assert.match(cache, /getCredentialEncryptionKey\(\{ create: false \}\)/);
  assert.match(cache, /\$\{ownerScope\(\)\}\|/);
  assert.match(config, /TriplemOfflineCache\?\.clearAll\?\.\(\)/);
  assert.doesNotMatch(config, /triplem-offline-entry-queue-v1/);
});
