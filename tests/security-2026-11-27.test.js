"use strict";
// Security audit fixes (2026-11-27): inventory upsert owner check (245), company-logos writes
// through the session-checked file-storage function (246/247), localhost CORS only on request,
// production-only GitHub Pages workflow.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");
const exists = rel => fs.existsSync(path.join(root, rel));

function loadLogoStorageWrite(fetchImpl, token = "tok") {
  const src = read("Assets/app/auth/01-auth-session.js");
  const start = src.indexOf("async function logoStorageWrite(");
  const end = src.indexOf("\nasync function supabaseRpc(", start);
  assert.ok(start > 0 && end > start, "logoStorageWrite is defined before supabaseRpc");
  const ctx = {
    state: { sessionToken: token },
    getSupabaseConfig: () => ({ supabaseUrl: "https://db.example", supabaseKey: "pk" }),
    fetch: fetchImpl, JSON, String, encodeURIComponent
  };
  vm.createContext(ctx);
  vm.runInContext(src.slice(start, end) + "\nthis.logoStorageWrite = logoStorageWrite;", ctx);
  return ctx.logoStorageWrite;
}
const reply = (status, body) => ({ status, ok: status >= 200 && status < 300, clone() { return reply(status, body); }, json: async () => body, text: async () => JSON.stringify(body) });

test("Logo writes go to the session-checked file-storage function", async () => {
  const calls = [];
  const write = loadLogoStorageWrite(async (url, init) => { calls.push({ url, init }); return reply(200, { ok: true }); });
  const res = await write("put", "/0b8f0c4e-1111-4222-8333-444455556666/logo-1.png", "BYTES", { contentType: "image/png", upsert: false });
  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://db.example/functions/v1/file-storage?action=logo-put");
  assert.equal(calls[0].init.headers["X-Session-Token"], "tok");
  assert.equal(decodeURIComponent(calls[0].init.headers["X-Logo-Path"]), "0b8f0c4e-1111-4222-8333-444455556666/logo-1.png");
  assert.equal(calls[0].init.headers["X-Logo-Upsert"], "0");
  calls.length = 0;
  await write("delete", "0b8f0c4e-1111-4222-8333-444455556666/logo-1.png");
  assert.equal(calls[0].url, "https://db.example/functions/v1/file-storage");
  assert.deepEqual(JSON.parse(calls[0].init.body), { action: "logo-delete", path: "0b8f0c4e-1111-4222-8333-444455556666/logo-1.png" });
});

test("Logo writes fall back to direct Storage only while the function action is not deployed", async () => {
  for (const first of [reply(404, { message: "Requested function was not found" }), reply(400, { error: "Unsupported action", code: "bad_request" })]) {
    const calls = [];
    const write = loadLogoStorageWrite(async url => { calls.push(url); return calls.length === 1 ? first : reply(200, {}); });
    const res = await write("put", "0b8f0c4e-1111-4222-8333-444455556666/logo-1.png", "BYTES");
    assert.equal(res.status, 200);
    assert.equal(calls[1], "https://db.example/storage/v1/object/company-logos/0b8f0c4e-1111-4222-8333-444455556666/logo-1.png");
  }
  // A refusal by the function is final: no direct Storage call.
  const calls = [];
  const write = loadLogoStorageWrite(async url => { calls.push(url); return reply(400, { error: "Storage path is not in your workspace", code: "rejected" }); });
  const res = await write("put", "0b8f0c4e-1111-4222-8333-444455556666/logo-1.png", "BYTES");
  assert.equal(res.status, 400);
  assert.equal(calls.length, 1);
});

test("No browser code writes to the company-logos bucket directly any more", () => {
  const files = ["Assets/app/admin/01-admin.js", "Assets/app/expenses/01-expenses-wallets.js", "Assets/app/backup/02-backup-ui.js", "Assets/app/backup/03-system-backup.js"];
  for (const f of files) {
    const src = read(f);
    assert.doesNotMatch(src, /storage\/v1\/object\/company-logos\//, `${f} must use logoStorageWrite`);
    assert.match(src, /logoStorageWrite\(/, `${f} uses logoStorageWrite`);
  }
  for (const html of ["index.html", "ar/index.html", "ur/index.html"]) {
    assert.match(read(html), /auth\/01-auth-session\.js\?v=[^"]*sec=20261127-001"/, `${html} loads the updated session script`);
  }
});

test("Production GitHub Pages workflow stays off until the repository variable is set", () => {
  const wf = read(".github/workflows/pages-production.yml");
  assert.match(wf, /if: vars\.TRIPLEM_PAGES_FROM_ACTIONS == 'true'/);
  assert.match(wf, /path: dist-production/);
  assert.match(wf, /persist-credentials: false/);
});

test("Edge Functions accept localhost origins only when explicitly enabled", { skip: !exists("supabase/functions/file-storage/index.ts") }, () => {
  const dirs = ["file-storage", "aziz-live-support", "paddle-billing", "push-notifications", "account-security-webauthn", "photo-maintenance", "triplem-ai"];
  for (const d of dirs) {
    const src = read(`supabase/functions/${d}/index.ts`);
    assert.match(src, /const ALLOW_LOCALHOST = \/\^\(1\|true\|yes\)\$\/i\.test\(Deno\.env\.get\("TRIPLEM_ALLOW_LOCALHOST_ORIGINS"\)/, d);
    const checks = src.match(/\/\^https\?:\\\/\\\/\(localhost\|127\\\.0\\\.0\\\.1\)\(:\\d\+\)\?\$\/i\.test\(/g) || [];
    const gated = src.match(/ALLOW_LOCALHOST && \/\^https\?:\\\/\\\/\(localhost/g) || [];
    assert.ok(checks.length >= 1 && checks.length === gated.length, `${d}: every localhost origin check is gated`);
  }
  const fsrc = read("supabase/functions/file-storage/index.ts");
  assert.match(fsrc, /if \(action === "logo-put"\) return json\(req, await logoPut\(req, token\)\);/);
  assert.match(fsrc, /case "logo-delete": return json\(req, await logoDelete\(token, body\)\);/);
  assert.match(fsrc, /await callRpc\("app_storage_logo_authorize", \{ p_path: path, p_op: "put" \}, \{ token \}\);\n  const bytes/);
  assert.match(fsrc, /Only PNG, JPG, WebP or GIF images can be used\./);
});

test("Migrations 245-247 are additive and ordered", { skip: !exists("migrations/245_security_inventory_upsert_owner_check.sql") }, () => {
  const m245 = read("migrations/245_security_inventory_upsert_owner_check.sql");
  assert.equal((m245.match(/raise exception 'Inventory record not found'/g) || []).length, 2);
  assert.match(m245, /FUNCTION public\.app_upsert_goods_sale\(/);
  assert.match(m245, /FUNCTION public\.app_upsert_goods_item\(/);
  assert.doesNotMatch(m245, /\b(drop|truncate|delete from|alter table)\b/i);
  const m246 = read("migrations/246_security_logo_storage_authorize.sql");
  assert.match(m246, /create or replace function public\.app_storage_logo_authorize\(p_path text, p_op text\)/);
  assert.match(m246, /Storage path is not in your workspace/);
  assert.doesNotMatch(m246, /\b(drop|truncate|delete from|alter table)\b/i);
  const m247 = read("migrations/247_security_logo_storage_no_anonymous_writes.sql");
  assert.match(m247, /RUN ONLY AFTER/);
  assert.doesNotMatch(m247, /drop policy if exists company_logos_public_read/);
  assert.doesNotMatch(m247, /\b(truncate|delete from|drop table|alter table)\b/i);
  const order = read("scripts/build_full_schema_sql.js");
  assert.ok(order.indexOf("244_insurance_edit_commission_deductions.sql") < order.indexOf("245_security_inventory_upsert_owner_check.sql"));
  assert.ok(order.indexOf("246_security_logo_storage_authorize.sql") < order.indexOf("247_security_logo_storage_no_anonymous_writes.sql"));
});
