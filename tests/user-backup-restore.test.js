"use strict";

/* Guards for the user Backup & Restore feature: the additive database
 * migration, the safe ZIP reader, password protection, the dependency
 * rules used by the restore preview and the UI wiring. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const has = rel => fs.existsSync(path.join(root, rel));
const text = rel => fs.readFileSync(path.join(root, rel), "utf8");

const MIGRATION = "migrations/205_user_backup_restore.sql";
const skipSql = has(MIGRATION) ? false : "Database migrations are not present in this checkout";
const engine = require(path.join(root, "Assets/app/backup/01-backup-engine.js"));
const fflate = require(path.join(root, "Assets/app/lib/fflate-0.8.2.min.js"));
const T = engine._test;

test("migration 205 is additive and never changes existing data", { skip: skipSql }, () => {
  const sql = text(MIGRATION);
  const code = sql.replace(/--[^\n]*/g, "");
  assert.doesNotMatch(code, /\bdrop\s+table\b/i);
  assert.doesNotMatch(code, /\btruncate\b/i);
  assert.doesNotMatch(code, /\balter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?(?!app_user_backup_)[a-z_]+\s+(?:drop|alter|rename)/i);
  assert.doesNotMatch(code, /\bon\s+conflict\b[^;]*\bdo\s+update\b/i, "restore must never overwrite");
  for (const t of ["app_user_backup_keys", "app_user_backup_runs", "app_user_backup_restored"]) {
    assert.match(code, new RegExp(`create table if not exists public\\.${t}\\b`, "i"));
    assert.match(code, new RegExp(`alter table public\\.${t} enable row level security`, "i"));
  }
  // Every write goes through the owner-only check and a per-row signature.
  assert.match(code, /Only the account owner can back up or restore this workspace/);
  assert.match(code, /hmac\(/i);
  assert.match(code, /p_include_settings/);
  assert.match(code, /revoke all on function public\.app_user_backup__check/i);
});

test("fresh-install schema bundle includes migration 205", { skip: skipSql }, () => {
  assert.match(text("scripts/build_full_schema_sql.js"), /205_user_backup_restore\.sql/);
});

test("ZIP entry names: only known paths, never traversal or absolute paths", () => {
  assert.equal(T.safeEntryName("manifest.json"), true);
  assert.equal(T.safeEntryName("data/expenses/expenses.ndjson"), true);
  assert.equal(T.safeEntryName("attachments/company-logos/u1/logo.png"), true);
  assert.equal(T.safeEntryName("data/"), "dir");
  for (const bad of ["../x", "data/../../etc/passwd", "/etc/passwd", "C:/win.ini", "a\\b", "data/./x.ndjson", "", "x\u0000y"]) {
    assert.equal(T.safeEntryName(bad), false, bad);
  }
});

test("safe unzip rejects traversal, non-ZIP files and data that expands too much", async () => {
  const ok = fflate.zipSync({ "manifest.json": fflate.strToU8("{}"), "notes/other.txt": fflate.strToU8("x") });
  const r = await T.safeUnzip(fflate, ok);
  assert.ok(r.files.has("manifest.json"));
  assert.deepEqual(r.ignored, ["notes/other.txt"]);

  const evil = fflate.zipSync({ "../evil.txt": fflate.strToU8("x") });
  await assert.rejects(T.safeUnzip(fflate, evil), e => e.code === "unsafe_path");
  await assert.rejects(T.safeUnzip(fflate, fflate.strToU8("not a zip at all, definitely not")), e => e.code === "not_zip");

  // 6 MB of zeros compresses to a few KB but is over the 5 MB attachment limit.
  const bomb = fflate.zipSync({ "attachments/company-logos/u1/a.png": new Uint8Array(6 * 1024 * 1024) }, { level: 9 });
  assert.ok(bomb.length < 100000);
  await assert.rejects(T.safeUnzip(fflate, bomb), e => e.code === "too_large");
});

test("password protection round-trips and refuses a wrong password", async () => {
  const data = fflate.strToU8("secret records");
  const sealed = await T.encryptBytes(data, "correct horse", "triplem-backup");
  assert.equal(sealed.cipher.name, "AES-GCM");
  assert.ok(sealed.kdf.iterations >= 600000);
  const manifest = { kdf: sealed.kdf, cipher: sealed.cipher };
  const back = await T.decryptBytes(sealed.data, "correct horse", manifest);
  assert.equal(fflate.strFromU8(back), "secret records");
  await assert.rejects(T.decryptBytes(sealed.data, "wrong password", manifest));
});

test("NDJSON lines and restore batches stay inside the limits", () => {
  assert.deepEqual(T.splitLines("a\r\n\nb\n"), ["a", "b"]);
  const items = Array.from({ length: 700 }, (_, i) => ({ line: "x".repeat(10) + i }));
  const b = T.batches(items, 300, 1e9);
  assert.deepEqual(b.map(x => x.length), [300, 300, 100]);
  const big = T.batches([{ line: "x".repeat(60) }, { line: "x".repeat(60) }], 300, 100);
  assert.equal(big.length, 2);
});

test("the engine exposes the documented format and limits", () => {
  assert.equal(engine.FORMAT, "triplem-vip-user-backup");
  assert.equal(engine.FORMAT_VERSION, 1);
  assert.equal(engine.LIMITS.zipBytes, 512 * 1024 * 1024);
  assert.equal(engine.LIMITS.attachmentBytes, 5 * 1024 * 1024);
  for (const fn of ["createBackup", "readBackup", "verifyWithServer", "analyze", "restore", "setSelected", "setSettingsIncluded"]) {
    assert.equal(typeof engine[fn], "function", fn);
  }
});

test("UI is wired into the account menu and loaded by the app", () => {
  const html = text("index.html");
  assert.match(html, /id="userBackupRestoreBtn"/);
  assert.match(html, /Assets\/app\/backup\/01-backup-engine\.js\?v=/);
  assert.match(html, /Assets\/app\/backup\/02-backup-ui\.js\?v=/);
  assert.match(text("scripts/build_feature_css_bundle.js"), /58-backup-restore\.css/);
  const ui = text("Assets/app/backup/02-backup-ui.js");
  assert.match(ui, /lib\/fflate-0\.8\.2\.min\.js/);
  assert.doesNotMatch(ui, /upsert:\s*true|x-upsert["']?\s*:\s*["']true/i, "restoring files must never overwrite existing files");
  assert.ok(has("Assets/app/lib/fflate-0.8.2.LICENSE.txt"));
});
