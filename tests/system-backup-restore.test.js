"use strict";
// Main Admin System Backup & Restore (migration 212): archive format, safety
// rules and wiring. Database-dependent checks run only when the private
// migrations / supabase folders are present (they are not in the public repo).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
if (!globalThis.crypto) globalThis.crypto = require("node:crypto").webcrypto;

const root = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");
const E = require("../Assets/app/backup/04-system-backup-engine.js");
const R = require("../Assets/app/backup/05-system-backup-runner.js");
const fflate = require("../Assets/app/lib/fflate-0.8.2.min.js");
const enc = new TextEncoder();
const MIGRATION = path.join(root, "migrations/212_system_backup_restore.sql");
const FUNCTION = path.join(root, "supabase/functions/file-storage/index.ts");
const MIGRATION_229 = path.join(root, "migrations/229_system_backup_v2_credentials_and_restore_all.sql");

const memSink = () => { const parts = []; return { parts, write: async b => { parts.push(Buffer.from(b)); }, close: async () => {} }; };
async function zipOf(entries) {
  const sink = memSink(); const w = new E.ZipWriter(sink);
  for (const [n, d] of entries) await w.add(n, d);
  await w.finish();
  return new Uint8Array(Buffer.concat(sink.parts));
}

test("ZIP writer output is read back exactly, with CRC checks", async () => {
  const a = enc.encode("hello"), b = new Uint8Array(70000).map((_, i) => i % 251);
  const z = await zipOf([[E.ROOT + "README.txt", a], [E.ROOT + "backup-header.json", b]]);
  const r = await E.openZip(z);
  assert.deepEqual([...await r.read(E.ROOT + "README.txt")], [...a]);
  assert.deepEqual([...await r.read(E.ROOT + "backup-header.json")], [...b]);
  const bad = new Uint8Array(z); bad[30 + (E.ROOT + "README.txt").length + 1] ^= 1; // inside the first entry's data
  await assert.rejects(async () => (await E.openZip(bad)).read(E.ROOT + "README.txt"), /damaged/);
});

test("unsafe ZIP paths are rejected, unknown files are flagged", async () => {
  for (const name of ["../x", "/abs", "C:/x", "TRIPLEM_VIP_SYSTEM_BACKUP/../x", "a\\b"]) {
    await assert.rejects(E.openZip(await zipOf([[name, enc.encode("x")]])), e => e.code === "unsafe_path", name);
  }
  const z = await E.openZip(await zipOf([[E.ROOT + "notes.txt", enc.encode("x")]]));
  assert.deepEqual(z.unknown, [E.ROOT + "notes.txt"]);
  assert.equal(E.safeName(E.ROOT + "database-schema/017_functions_and_procedures.sql.enc"), "file");
  assert.equal(E.safeName(E.ROOT + "users/00000000-0000-4000-8000-000000000001/expenses/expense_entries.ndjson.enc"), "file");
});

test("files are sealed with AES-256-GCM bound to backup id and path", async () => {
  const key = await E.deriveKey("Correct#Horse-2026", new Uint8Array(16), 100000);
  const sealed = await E.seal(fflate, key, "b1", "users/x/a.ndjson", enc.encode("{\"a\":1}\n".repeat(50)));
  const back = await E.open(fflate, key, "b1", "users/x/a.ndjson", sealed, 10000);
  assert.equal(new TextDecoder().decode(back).split("\n")[0], "{\"a\":1}");
  await assert.rejects(E.open(fflate, key, "b1", "users/y/a.ndjson", sealed, 10000), e => e.code === "tampered"); // moved file
  await assert.rejects(E.open(fflate, key, "b2", "users/x/a.ndjson", sealed, 10000), e => e.code === "tampered"); // other backup
  const wrong = await E.deriveKey("Wrong#Horse-2026", new Uint8Array(16), 100000);
  await assert.rejects(E.open(fflate, wrong, "b1", "users/x/a.ndjson", sealed, 10000), e => e.code === "tampered");
  await assert.rejects(E.open(fflate, key, "b1", "users/x/a.ndjson", sealed, 20), e => e.code === "too_large"); // bomb limit
});

test("backup password rules", () => {
  assert.match(E.passwordProblem("short"), /12 characters/);
  assert.match(E.passwordProblem("alllowercaseletters"), /three/);
  assert.equal(E.passwordProblem("Good#Backup-2026"), "");
});

test("schema package: exactly 20 ordered, guarded files; refuses empty files", () => {
  const objs = E.SCHEMA_FILES.map((_, i) => ({ file: i + 1, seq: i + 1, kind: "table", name: `t${i}`, ddl: `CREATE TABLE public.t${i} (id int);` }));
  const files = E.buildSchemaFiles(objs, { backupId: "b", generatedAt: "now", serverVersion: "16", schemaComment: "standard public schema" });
  assert.equal(files.length, 20);
  files.forEach((f, i) => assert.ok(f.name.startsWith(String(i + 1).padStart(3, "0") + "_")));
  assert.match(files[0].text, /already contains Triplem VIP tables/);
  assert.match(files[0].text, /COMMENT ON SCHEMA public IS 'triplem-vip-schema-install:b'/);
  for (const f of files.slice(1)) assert.match(f.text, /Run 001_extensions_and_prerequisites\.sql first/);
  assert.match(files[19].text, /COMMENT ON SCHEMA public IS 'standard public schema';/);
  files.forEach(f => { assert.match(f.text, /^BEGIN;$/m); assert.match(f.text, /^COMMIT;$/m); });
  assert.throws(() => E.buildSchemaFiles(objs.slice(1), { backupId: "b" }), /would be empty/);
  const readme = E.schemaReadme({ backupId: "b", generatedAt: "now", serverVersion: "16.4", adminId: "id-1", adminUsername: "boss" }, files, { tables: 136 });
  assert.match(readme, /'id-1', 'boss'/);
  assert.match(readme, /never runs these files/);
});

test("schema package v2: exactly 10 ordered, guarded, validated files; fresh server keys; no secrets", () => {
  const objs = Array.from({ length: 20 }, (_, i) => ({ file: i + 1, seq: i + 1, kind: i === 16 ? "function" : "table", name: `t${i}`, ddl: i === 16 ? `CREATE FUNCTION public.f${i}() RETURNS int LANGUAGE sql AS $$ select 1 $$;` : `CREATE TABLE public.t${i} (id int);` }));
  const meta = { backupId: "b2", generatedAt: "now", serverVersion: "16", schemaComment: "standard public schema", adminId: "00000000-0000-4000-8000-0000000000aa", adminUsername: "boss" };
  const files = E.buildSchemaFilesV2(objs, meta, { tables: 19, functions: 1 });
  assert.equal(files.length, 10);
  assert.deepEqual(files.map(f => f.name), E.SCHEMA_FILES_V2);
  files.forEach((f, i) => { assert.ok(f.name.startsWith(String(i + 1).padStart(2, "0") + "_")); assert.match(f.text, /^BEGIN;$/m); assert.match(f.text, /^COMMIT;$/m); });
  assert.match(files[0].text, /already contains Triplem VIP tables/);
  for (const f of files.slice(1)) assert.match(f.text, /Run 01_extensions_and_install_guard\.sql first/);
  // file 09: same Main Admin id/username, one-time password, new random server keys (never copied)
  assert.match(files[8].text, /'00000000-0000-4000-8000-0000000000aa'::uuid, 'boss'/);
  assert.match(files[8].text, /must_change_password/);
  assert.match(files[8].text, /app_two_factor_server_keys\(key_name, key_bytes\) VALUES \('totp-wrap-v1', extensions\.gen_random_bytes\(32\)\)/);
  assert.match(files[8].text, /app_admin_security_pepper/);
  // file 10: validation of counts, RLS, Main Admin, 2FA key; restores the schema comment
  assert.match(files[9].text, /Validation failed/);
  assert.match(files[9].text, /two-factor server key is missing/);
  assert.match(files[9].text, /COMMENT ON SCHEMA public IS 'standard public schema';/);
  for (const f of files) assert.doesNotMatch(f.text, /\$2[aby]\$\d\d\$|service_role_key|secret_access_key/i);
  const readme = E.schemaReadmeV2(meta, files, { tables: 19 });
  assert.match(readme, /01_extensions_and_install_guard\.sql/);
});

test("archive layouts: v2 keeps schema and header readable, v1 archives still open", () => {
  assert.equal(E.zipName(2, "Database_Schema/01_extensions_and_install_guard.sql"), "Database_Schema/01_extensions_and_install_guard.sql");
  assert.equal(E.zipName(2, "Backup_Metadata/backup-header.json"), "Backup_Metadata/backup-header.json");
  assert.equal(E.zipName(2, "Backup_Metadata/backup-manifest.json"), "Backup_Metadata/backup-manifest.json.enc");
  assert.equal(E.zipName(2, "User_Accounts/credentials/part-0001.ndjson"), "User_Accounts/credentials/part-0001.ndjson.enc");
  assert.equal(E.zipName(1, "backup-header.json"), "TRIPLEM_VIP_SYSTEM_BACKUP/backup-header.json");
  assert.equal(E.zipName(1, "README.txt"), "TRIPLEM_VIP_SYSTEM_BACKUP/README.txt");
  assert.equal(E.zipName(1, "backup-manifest.json"), "TRIPLEM_VIP_SYSTEM_BACKUP/backup-manifest.json.enc");
  assert.equal(E.isPlainV2("Companies/x/expenses/expense_entries.ndjson"), false);
});

test("restore selection: chosen accounts and categories only; profiles and team always kept", () => {
  const cat = [{ table: "app_users", mode: "data", order: 1 }, { table: "expense_entries", mode: "data", order: 2 }, { table: "inventory_items", mode: "data", order: 3 }, { table: "app_settings", mode: "settings", order: 4 }];
  const A = "00000000-0000-4000-8000-000000000001", B = "00000000-0000-4000-8000-000000000002";
  const f = (table, owner, section, scope = "owner") => ({ kind: "data", table, owner, section, scope, records: 1, path: `${table}-${owner}-${section}` });
  const m = { catalog: cat, owners: [{ id: A }, { id: B }], files: [f("app_users", A, "profile"), f("app_users", B, "profile"), f("expense_entries", A, "expenses"), f("inventory_items", A, "inventory"), f("expense_entries", B, "expenses"), f("app_settings", null, "system", "system")] };
  const all = R.restorePlan(m, {});
  assert.equal(all.length, 6);
  const onlyA = R.restorePlan(m, { owners: new Set([A]), sections: new Set(["expenses"]) });
  assert.deepEqual(onlyA.map(x => x.path).sort(), [`app_settings-null-system`, `app_users-${A}-profile`, `expense_entries-${A}-expenses`].sort());
  assert.ok(!onlyA.some(x => x.owner === B));
  assert.ok(!onlyA.some(x => x.section === "inventory"));
  assert.equal(R.restorePlan(m, { owners: new Set([A]), system: false }).some(x => x.scope === "system"), false);
});

test("migration 229 is additive, Main Admin only, never touches protected or existing sign-in details", { skip: !fs.existsSync(MIGRATION_229) && "private migrations folder not present" }, () => {
  const sql = fs.readFileSync(MIGRATION_229, "utf8");
  const code = sql.replace(/--.*$/gm, "");
  assert.doesNotMatch(code, /\bdrop\s+table\b/i);
  assert.doesNotMatch(code, /\btruncate\b/i);
  assert.doesNotMatch(code, /\bdelete\s+from\s+public\.(?!app_system)/i);
  for (const fn of ["app_system_backup_export_owner", "app_system_backup_credentials_page", "app_system_restore_credentials", "app_system_restore_undo_updates", "app_system_backup_begin_v2", "app_system_restore_apply", "app_system_restore_verify"]) {
    const body = sql.slice(sql.indexOf(`create or replace function public.${fn}(`));
    assert.match(body.slice(0, 2000), /app_system_backup__admin\(\)/, `${fn} must require the protected Main Admin`);
  }
  const cred = sql.slice(sql.indexOf("create or replace function public.app_system_backup_credentials_page("), sql.indexOf("create or replace function public.app_system_restore_credentials("));
  assert.doesNotMatch(cred.slice(0, 600), /\bstable\b/i, "credentials page must not be STABLE (it records progress)");
  assert.match(cred, /is_protected/, "protected accounts are excluded");
  const rc = sql.slice(sql.indexOf("create or replace function public.app_system_restore_credentials("), sql.indexOf("create or replace function public.app_system_restore_undo_updates("));
  assert.match(rc, /'restored'/, "only accounts added by this restore get sign-in details");
  const apply = sql.slice(sql.indexOf("create or replace function public.app_system_restore_apply("));
  assert.match(apply, /'password_hash', 'smart_pin_hash'/);
  assert.match(apply, /never changed by a restore/);
  assert.match(apply, /insert into public\.app_system_restore_undo/);
  assert.match(sql, /alter table public\.app_system_restore_undo enable row level security/);
});

test("restore plan never contains SQL, history, excluded or unattributed files", () => {
  const manifest = {
    owners: [{ id: "o1" }],
    catalog: [{ table: "app_users", mode: "data", order: 2 }, { table: "expense_entries", mode: "data", order: 11 }, { table: "accounting_audit_log", mode: "history", order: 121 }, { table: "app_sessions", scope: "excluded", order: 900 }],
    files: [
      { path: "database-schema/001_x.sql", kind: "schema" },
      { path: "users/o1/expenses/expense_entries.ndjson", kind: "data", table: "expense_entries", owner: "o1" },
      { path: "users/o1/profile/app_users.ndjson", kind: "data", table: "app_users", owner: "o1", section: "profile" },
      { path: "users/o1/history/accounting_audit_log.ndjson", kind: "data", table: "accounting_audit_log", owner: "o1" },
      { path: "users/o1/settings/app_sessions.ndjson", kind: "data", table: "app_sessions", owner: "o1" },
      { path: "system-data/unattributed/expense_entries.ndjson", kind: "data", table: "expense_entries", scope: "unattributed" }
    ]
  };
  assert.deepEqual(R.restorePlan(manifest).map(f => f.path), ["users/o1/profile/app_users.ndjson", "users/o1/expenses/expense_entries.ndjson"]);
});

test("report CSV keeps every conflict column and neutralises spreadsheet formulas", () => {
  const csv = R.reportCsv([{ table: "t", id: "1", owner: "o", owner_username: "=cmd()", outcome: "kept_live", reason: "differs, kept", live_updated_at: "a", backup_updated_at: "b", at: "c" }]);
  assert.match(csv, /^table,id,owner,owner_username,outcome,reason,live_updated_at,backup_updated_at,at\r\n/);
  assert.match(csv, /"'=cmd\(\)"/);
  assert.match(csv, /"differs, kept"/);
});

test("Main Admin wiring: new System Backup entry, destructive JSON/CSV upload removed, account backup kept", () => {
  const index = read("index.html");
  const admin = read("Assets/app/admin/01-admin.js");
  assert.match(index, /id="adminSystemBackupBtn"/);
  assert.match(index, /Assets\/app\/backup\/03-system-backup\.js\?v=/);
  assert.doesNotMatch(index, /adminBackupUploadInput/);
  assert.doesNotMatch(admin, /supabaseRpc\("app_admin_import_full_backup"/);
  assert.match(index, /adminBackupDownloadJsonBtn/);  // safe downloads stay
  assert.match(index, /adminBackupDownloadCsvBtn/);
  assert.match(index, /Assets\/app\/backup\/02-backup-ui\.js/); // the account (user) backup is untouched
  const ui = read("Assets/app/backup/03-system-backup.js");
  assert.match(ui, /isProtectedAdminSession/);
  assert.doesNotMatch(ui, /setInterval\(/); // no polling
  assert.match(read("scripts/build_feature_css_bundle.js"), /62-system-backup\.css/);
});

test("migration 212 is additive and protects every entry point", { skip: !fs.existsSync(MIGRATION) && "private migrations folder not present" }, () => {
  const sql = fs.readFileSync(MIGRATION, "utf8");
  const code = sql.replace(/--.*$/gm, "");
  assert.doesNotMatch(code, /\bdrop\s+table\b/i);
  assert.doesNotMatch(code, /\btruncate\b/i);
  assert.doesNotMatch(code, /\bdelete\s+from\s+public\.(?!app_system)/i);
  assert.match(sql, /revoke execute on function public\.app_admin_import_full_backup\(jsonb\) from public, anon, authenticated/);
  for (const fn of ["app_system_backup_begin", "app_system_backup_export_page", "app_system_schema_export", "app_system_restore_begin", "app_system_restore_apply", "app_system_restore_analyze", "app_system_backup_file_authorize", "app_system_restore_file_begin"]) {
    const body = sql.slice(sql.indexOf(`create or replace function public.${fn}(`));
    assert.match(body.slice(0, 1500), /app_system_backup__admin\(\)/, `${fn} must require the protected Main Admin`);
  }
  for (const helper of ["app_system_backup__catalog()", "app_system_schema__objects()", "app_system_restore__check(uuid, uuid, text, text, jsonb)", "app_system_restore__meta(text)"]) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${helper.replace(/[()]/g, m => "\\" + m)} from public, anon, authenticated`), helper);
  }
  assert.match(sql, /where restore_id = p_restore_id and table_name = p_table and row_key = chk\.row_key/); // resume
  assert.match(sql, /'kept_live'/);
  assert.match(sql, /never overwritten automatically/);
});

test("file-storage Edge Function: system backup actions are Main Admin only", { skip: !fs.existsSync(FUNCTION) && "private supabase folder not present" }, () => {
  const src = fs.readFileSync(FUNCTION, "utf8");
  assert.match(src, /case "system-backup-file": return await systemBackupFile/);
  assert.match(src, /action === "system-restore-file"/);
  assert.match(src, /callRpc\("app_system_backup_file_authorize", \{ p_id: id \}, \{ token \}\)/);
  assert.match(src, /callRpc\("app_system_restore_file_begin"/);
  assert.match(src, /validateBytes\(bytes, String\(b\.mime/); // real file type checked before writing
});
