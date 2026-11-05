"use strict";

/*
 * Behavioural tests for the offline queue (Assets/app/core/08-offline-sync.js)
 * and the offline read-cache request classifier (core/10-offline-cache.js).
 * The modules run in a VM with an in-memory localStorage and a mocked server,
 * so these tests exercise the real replay, retry, duplicate and conflict logic.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const root = path.resolve(__dirname, "..");
const offlineSource = fs.readFileSync(path.join(root, "Assets/app/core/08-offline-sync.js"), "utf8");
const cacheSource = fs.readFileSync(path.join(root, "Assets/app/core/10-offline-cache.js"), "utf8");

function fakeElement() {
  return {
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    dataset: {},
    style: {},
    setAttribute() {},
    getAttribute() { return null; },
    appendChild() {},
    querySelectorAll() { return []; },
    querySelector() { return null; },
    addEventListener() {},
    remove() {},
    textContent: "",
    innerHTML: ""
  };
}

function makeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); }
  };
}

/**
 * Build a sandbox. `server` holds rows per table; `behaviour` lets a test make
 * the next writes fail with a chosen error.
 */
function makeEnv({ storage = makeStorage(), online = false, server = {}, behaviour = {} } = {}) {
  const calls = [];
  const timers = [];
  const toasts = [];
  const tables = new Map(Object.entries(server).map(([k, v]) => [k, v.map(r => ({ ...r }))]));
  const tableRows = name => { if (!tables.has(name)) tables.set(name, []); return tables.get(name); };

  function failure(kind) {
    const error = new Error(kind === "network" ? "Database request failed. Please check your connection." : kind === "auth" ? "Session expired or invalid" : kind === "duplicate" ? "duplicate key value violates unique constraint" : "Validation failed");
    if (kind === "network") { error.isConnectivityError = true; error.code = "NETWORK_ERROR"; error.status = 0; }
    if (kind === "auth") error.status = 401;
    if (kind === "duplicate") { error.status = 409; error.responseData = { code: "23505" }; }
    if (kind === "invalid") error.status = 400;
    return error;
  }

  async function supabase(pathAndQuery, options = {}) {
    const method = String(options.method || "GET").toUpperCase();
    calls.push({ method, path: pathAndQuery });
    if (behaviour.everything) throw failure(behaviour.everything);
    const [table, query = ""] = pathAndQuery.split("?");
    const idMatch = /id=eq\.([^&]+)/.exec(query);
    const id = idMatch ? decodeURIComponent(idMatch[1]) : "";
    if (method === "GET") {
      if (behaviour.reads) throw failure(behaviour.reads);
      return tableRows(table).filter(row => !id || row.id === id).map(row => ({ ...row }));
    }
    if (method === "POST") {
      const queued = behaviour.posts && behaviour.posts.shift();
      if (queued) throw failure(queued);
      const body = JSON.parse(options.body);
      if (tableRows(table).some(row => row.id === body.id)) throw failure("duplicate");
      tableRows(table).push({ ...body, updated_at: body.updated_at || "2026-11-04T10:00:00.000Z" });
      return null;
    }
    if (method === "PATCH") {
      const queued = behaviour.patches && behaviour.patches.shift();
      if (queued) throw failure(queued);
      const body = JSON.parse(options.body);
      tableRows(table).filter(row => row.id === id).forEach(row => Object.assign(row, body, { updated_at: "2026-11-04T12:00:00.000Z" }));
      return null;
    }
    throw new Error(`unexpected ${method}`);
  }

  const state = {
    unlocked: true,
    sessionToken: "tok",
    sessionRememberMe: true,
    sessionUser: { id: "owner-1" },
    entries: [],
    recycleBin: [],
    notes: [], assets: [], assetTransactions: [],
    pendingDbSyncIds: new Set(),
    offlineSync: { syncing: false, pendingCount: 0, lastError: "", retryTimer: null, authBlocked: false, offlineSession: false }
  };

  const context = {
    console: { log() {}, warn() {}, error() {} },
    JSON, Date, Math, Promise, Set, Map, Array, Object, String, Number, Error, RegExp, Uint8Array, TextEncoder, TextDecoder,
    crypto: webcrypto,
    localStorage: storage,
    navigator: { onLine: online },
    state,
    CONFIG: { table: "loan_ledger_entries" },
    supabase,
    requestAnimationFrame: fn => fn(),
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: () => {},
    setInterval: () => 0,
    confirm: () => true,
    CustomEvent: class { constructor(name, init) { this.type = name; this.detail = init?.detail; } },
    isGuestMode: () => false,
    currentOwnerId: () => "owner-1",
    hasDeletedTag: notes => /\[DELETED\]/.test(String(notes || "")),
    markDbSnapshotRows: () => {},
    databaseInsertPayload: row => ({ ...row }),
    DomainLedger: {
      classifyLedgerEntry: () => "expenses",
      domainInsertPayload: row => ({ table: "expense_entries", body: { ...row } }),
      insertDomainEntry: async () => ({}),
      resolveDomainTable: () => "expense_entries"
    },
    // Same contract as the real helpers in core/04-entries-api.js.
    writeLedgerRowToDatabase: async row => { await supabase("expense_entries", { method: "POST", body: JSON.stringify(row) }); },
    writeLedgerPatchToDatabase: async (id, body) => { await supabase(`expense_entries?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }); }
  };
  context.window = context;
  context.globalThis = context;
  context.addEventListener = () => {};
  context.dispatchEvent = () => {};
  const region = fakeElement();
  region.appendChild = el => toasts.push(el);
  context.document = {
    hidden: false,
    body: fakeElement(),
    documentElement: fakeElement(),
    getElementById: id => (id === "entryToastRegion" ? region : null),
    createElement: () => fakeElement(),
    addEventListener() {}
  };
  vm.createContext(context);
  vm.runInContext(offlineSource, context, { filename: "08-offline-sync.js" });
  return { context, state, calls, timers, toasts, tables, storage, behaviour };
}

const row = (id, extra = {}) => ({ id, group_id: `g-${id}`, direction: "taken", entry_kind: "expense", person_name: "Cash", currency: "AED", action_amount: 10, notes: "[EXPENSE]", owner_id: "owner-1", ...extra });
const queue = env => JSON.parse(env.storage.getItem("triplem-offline-entry-queue-v1") || "[]");

test("an entry saved offline is stored durably and survives a page reload", () => {
  const storage = makeStorage();
  const first = makeEnv({ storage });
  assert.equal(first.context.queueOfflineLedgerInsert([row("a1")], "Expense"), true);
  assert.equal(queue(first).length, 1);
  assert.equal(queue(first)[0].status, "pending");

  // "Reload": a brand-new page context reading the same storage.
  const second = makeEnv({ storage });
  const restored = second.context.rehydrateOfflineEntriesForCurrentUser();
  assert.equal(restored, 1);
  assert.equal(second.state.entries[0].id, "a1");
  assert.equal(second.state.entries[0]._syncStatus, "pending");
});

test("queue entries written by the previous release (no status field) are still synced", async () => {
  const legacy = [{ version: 1, operationId: "old-1", ownerId: "owner-1", type: "ledger-insert", label: "Old", rows: [row("legacy")], entityIds: ["legacy"], createdAt: "2026-10-01T00:00:00Z", attempts: 0, nextAttemptAt: 0, lastError: "" }];
  const env = makeEnv({ storage: makeStorage({ "triplem-offline-entry-queue-v1": JSON.stringify(legacy) }), online: true });
  await env.context.syncOfflineQueue();
  assert.equal(queue(env).length, 0);
  assert.equal(env.tables.get("expense_entries").length, 1);
});

test("reconnecting synchronizes pending entries and removes them from the queue", async () => {
  const env = makeEnv();
  env.context.queueOfflineLedgerInsert([row("s1")], "Expense");
  env.context.queueOfflineLedgerInsert([row("s2")], "Expense");
  env.context.navigator.onLine = true;
  const ok = await env.context.syncOfflineQueue();
  assert.equal(ok, true);
  assert.equal(queue(env).length, 0);
  assert.deepEqual(env.tables.get("expense_entries").map(r => r.id).sort(), ["s1", "s2"]);
});

test("replay never creates a duplicate when the record already reached the server", async () => {
  const env = makeEnv({ server: { expense_entries: [row("d1")] } });
  env.context.queueOfflineLedgerInsert([row("d1")], "Expense");
  // The same entry queued twice is only stored once.
  env.context.queueOfflineLedgerInsert([row("d1")], "Expense");
  assert.equal(queue(env).length, 1);
  env.context.navigator.onLine = true;
  await env.context.syncOfflineQueue();
  assert.equal(env.tables.get("expense_entries").length, 1);
  assert.equal(env.calls.filter(c => c.method === "POST").length, 0);
  assert.equal(queue(env).length, 0);
});

test("a duplicate-key response is re-checked by id and treated as already saved", async () => {
  const env = makeEnv({ behaviour: { posts: [] } });
  env.context.queueOfflineLedgerInsert([row("race1")], "Expense");
  env.context.navigator.onLine = true;
  // Simulate another tab inserting between our existence check and our POST.
  const original = env.context.writeLedgerRowToDatabase;
  env.context.writeLedgerRowToDatabase = async r => {
    env.tables.set("expense_entries", [{ ...r }]);
    await original(r); // now fails with 409 duplicate
  };
  await env.context.syncOfflineQueue();
  assert.equal(queue(env).length, 0, "operation completes instead of failing");
  assert.equal(env.tables.get("expense_entries").length, 1);
});

test("an entry saved while a sync is running is never overwritten (lost-update race)", async () => {
  const env = makeEnv();
  env.context.queueOfflineLedgerInsert([row("r1")], "Expense");
  env.context.navigator.onLine = true;
  const original = env.context.writeLedgerRowToDatabase;
  env.context.writeLedgerRowToDatabase = async r => {
    // User records another expense while the first one is uploading.
    env.context.queueOfflineLedgerInsert([row("r2")], "Expense");
    await original(r);
  };
  await env.context.syncOfflineQueue();
  const left = queue(env);
  assert.equal(left.length, 1, "the entry queued during sync is still stored");
  assert.equal(left[0].rows[0].id, "r2");
});

test("connection loss keeps the entry pending with exponential backoff", async () => {
  const env = makeEnv({ behaviour: { posts: ["network"] } });
  env.context.queueOfflineLedgerInsert([row("n1")], "Expense");
  env.context.navigator.onLine = true;
  const ok = await env.context.syncOfflineQueue();
  assert.equal(ok, false);
  const [op] = queue(env);
  assert.equal(op.status, "pending");
  assert.equal(op.attempts, 1);
  assert.ok(op.nextAttemptAt > Date.now());
  assert.ok(env.timers.length > 0, "a retry is scheduled");
  // Next attempt succeeds.
  env.storage.setItem("triplem-offline-entry-queue-v1", JSON.stringify([{ ...op, nextAttemptAt: 0 }]));
  await env.context.syncOfflineQueue();
  assert.equal(queue(env).length, 0);
});

test("a permanently rejected entry becomes 'failed' after limited retries and is kept for review", async () => {
  const env = makeEnv({ behaviour: { posts: Array(10).fill("invalid") } });
  env.context.queueOfflineLedgerInsert([row("f1")], "Expense");
  env.context.navigator.onLine = true;
  for (let i = 0; i < 6; i += 1) {
    const stored = queue(env).map(op => ({ ...op, nextAttemptAt: 0 }));
    env.storage.setItem("triplem-offline-entry-queue-v1", JSON.stringify(stored));
    await env.context.syncOfflineQueue();
  }
  const [op] = queue(env);
  assert.equal(op.status, "failed");
  assert.equal(op.attempts, 6);
  assert.match(op.lastError, /Validation failed/);
  // Failed operations are not retried automatically …
  const before = env.calls.length;
  await env.context.syncOfflineQueue();
  assert.equal(env.calls.length, before);
  // … until the user chooses Retry.
  env.behaviour.posts = [];
  await env.context.retryOfflineOperation(op.operationId);
  assert.equal(queue(env).length, 0);
});

test("an expired session pauses syncing without spending retry attempts", async () => {
  const env = makeEnv({ behaviour: { everything: "auth" } });
  env.context.queueOfflineLedgerInsert([row("u1")], "Expense");
  env.context.navigator.onLine = true;
  await env.context.syncOfflineQueue();
  const [op] = queue(env);
  assert.equal(op.status, "pending");
  assert.equal(op.attempts, 0);
  assert.equal(env.state.offlineSync.authBlocked, true);
});

test("offline edits merge into a still-unsynced new entry", () => {
  const env = makeEnv();
  env.context.queueOfflineLedgerInsert([row("m1", { action_amount: 10 })], "Expense");
  assert.equal(env.context.queueOfflineLedgerPatch("m1", { action_amount: 25 }, row("m1"), "Expense"), true);
  const ops = queue(env);
  assert.equal(ops.length, 1, "no separate patch operation");
  assert.equal(ops[0].rows[0].action_amount, 25);
});

test("two offline edits of the same record become one patch, so the second is not a false conflict", async () => {
  const server = { expense_entries: [{ ...row("e1"), updated_at: "2026-11-01T00:00:00.000Z" }] };
  const env = makeEnv({ server });
  const base = { ...row("e1", { data_origin: "domain", domain_table: "expense_entries" }), updated_at: "2026-11-01T00:00:00.000Z" };
  env.context.queueOfflineLedgerPatch("e1", { action_amount: 11 }, base, "Expense", { baseUpdatedAt: base.updated_at });
  env.context.queueOfflineLedgerPatch("e1", { notes: "[EXPENSE] corrected" }, base, "Expense", { baseUpdatedAt: base.updated_at });
  assert.equal(queue(env).length, 1);
  env.context.navigator.onLine = true;
  await env.context.syncOfflineQueue();
  assert.equal(queue(env).length, 0);
  const saved = env.tables.get("expense_entries")[0];
  assert.equal(saved.action_amount, 11);
  assert.equal(saved.notes, "[EXPENSE] corrected");
});

test("an offline edit of a record changed elsewhere is held as a conflict, then applied only on request", async () => {
  const server = { expense_entries: [{ ...row("c1", { action_amount: 99 }), updated_at: "2026-11-03T09:00:00.000Z" }] };
  const env = makeEnv({ server });
  const base = { ...row("c1", { data_origin: "domain", domain_table: "expense_entries" }), updated_at: "2026-11-01T00:00:00.000Z" };
  env.context.queueOfflineLedgerPatch("c1", { action_amount: 12 }, base, "Expense", { baseUpdatedAt: base.updated_at });
  env.context.navigator.onLine = true;
  await env.context.syncOfflineQueue();
  const [op] = queue(env);
  assert.equal(op.status, "conflict");
  assert.equal(env.tables.get("expense_entries")[0].action_amount, 99, "server copy untouched");
  await env.context.retryOfflineOperation(op.operationId, { forceApply: true });
  assert.equal(queue(env).length, 0);
  assert.equal(env.tables.get("expense_entries")[0].action_amount, 12);
});

test("an offline edit of a record deleted elsewhere is a conflict and can be discarded", async () => {
  const env = makeEnv({ server: { expense_entries: [], loan_ledger_entries: [] } });
  env.context.queueOfflineLedgerPatch("gone", { action_amount: 1 }, row("gone", { data_origin: "domain", domain_table: "expense_entries" }), "Expense", { baseUpdatedAt: "2026-11-01T00:00:00Z" });
  env.context.navigator.onLine = true;
  await env.context.syncOfflineQueue();
  const [op] = queue(env);
  assert.equal(op.status, "conflict");
  assert.equal(env.context.discardOfflineOperation(op.operationId), true);
  assert.equal(queue(env).length, 0);
});

test("a later change is not applied while an earlier change to the same record is unresolved", async () => {
  const env = makeEnv({ behaviour: { posts: ["invalid"] } });
  env.context.queueOfflineLedgerInsert([row("o1")], "Expense");
  // Simulate a patch queued separately (e.g. by an older build) for the same record.
  const ops = queue(env);
  ops.push({ version: 1, operationId: "p1", ownerId: "owner-1", type: "ledger-patch", label: "Edit", targetId: "o1", body: { action_amount: 5 }, entry: row("o1"), baseUpdatedAt: "", entityIds: ["o1"], createdAt: new Date().toISOString(), attempts: 0, nextAttemptAt: 0, lastError: "", status: "pending" });
  env.storage.setItem("triplem-offline-entry-queue-v1", JSON.stringify(ops));
  env.context.navigator.onLine = true;
  await env.context.syncOfflineQueue();
  assert.equal(env.calls.filter(c => c.method === "PATCH").length, 0);
  assert.equal(queue(env).length, 2);
});

test("entries of another account on a shared device are neither shown nor synced", async () => {
  const foreign = [{ version: 1, operationId: "x", ownerId: "someone-else", type: "ledger-insert", label: "X", rows: [row("x1", { owner_id: "someone-else" })], entityIds: ["x1"], createdAt: "2026-11-01T00:00:00Z", attempts: 0, nextAttemptAt: 0, lastError: "", status: "pending" }];
  const env = makeEnv({ storage: makeStorage({ "triplem-offline-entry-queue-v1": JSON.stringify(foreign) }), online: true });
  assert.equal(env.context.rehydrateOfflineEntriesForCurrentUser(), 0);
  await env.context.syncOfflineQueue();
  assert.equal(env.calls.length, 0);
  assert.equal(queue(env).length, 1, "kept for its owner");
});

test("secrets are refused by the offline queue", () => {
  const env = makeEnv();
  assert.equal(env.context.queueOfflineLedgerInsert([row("k1", { notes: "WIF L1abc private_key" })], "Expense"), false);
  assert.equal(queue(env).length, 0);
});

test("the read cache only serves read requests and never existence probes or credentials", () => {
  const context = { console, state: { unlocked: true, sessionToken: "t", sessionRememberMe: true, sessionUser: { id: "o" } }, isGuestMode: () => false, currentOwnerId: () => "o", setInterval: () => 0, addEventListener() {}, navigator: { onLine: true } };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(cacheSource, context, { filename: "10-offline-cache.js" });
  const api = context.TriplemOfflineCache;
  const post = { method: "POST" };
  assert.equal(api.isCacheableRequest("rpc/app_get_my_dashboard_summary", post), true);
  assert.equal(api.isCacheableRequest("rpc/app_list_inquiries", post), true);
  assert.equal(api.isCacheableRequest("expense_accounts?select=*&order=created_at.desc", {}), true);
  assert.equal(api.isCacheableRequest("expense_entries?id=eq.abc&select=id", {}), false);
  assert.equal(api.isCacheableRequest("expense_entries?select=id", {}), false);
  assert.equal(api.isCacheableRequest("rpc/app_save_expense", post), false);
  assert.equal(api.isCacheableRequest("rpc/app_get_or_create_wallet", post), false);
  assert.equal(api.isCacheableRequest("rpc/app_validate_session", post), false);
  assert.equal(api.isCacheableRequest("rpc/app_get_smart_pin_status", post), false);
  assert.equal(api.isCacheableRequest("rpc/app_account_security_get_overview", post), false);
  assert.equal(api.isCacheableRequest("expense_entries", { method: "POST" }), false);
  assert.equal(api.isCacheableRequest("rpc/app_get_my_dashboard_summary", { method: "POST", offlineCache: false }), false);
  context.state.sessionRememberMe = false;
  assert.equal(api.isCacheableRequest("rpc/app_get_my_dashboard_summary", post), false, "no cache without Remember Me");
  assert.equal(api.isReadRpc("app_messaging_sync_state"), true);
  assert.equal(api.isReadRpc("app_mark_inquiries_delivered"), false);
});
