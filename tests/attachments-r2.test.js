"use strict";

/* Cloudflare R2 attachments (2026-11-09): image optimiser, attachment module,
 * Main Admin settings, Edge Function and migration 210.
 * SQL and Edge Function checks are skipped where those folders are not part of
 * the checkout (the public GitHub repository). */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const has = rel => fs.existsSync(path.join(root, rel));
const text = rel => fs.readFileSync(path.join(root, rel), "utf8");
const MIG = "migrations/210_r2_file_storage_attachments.sql";
const FN = "supabase/functions/file-storage/index.ts";
const skipSql = has(MIG) ? false : "Database migrations are not present in this checkout";
const skipFn = has(FN) ? false : "Edge Functions are not present in this checkout";

function loadCore() {
  const g = { TextDecoder, Uint8Array, DataView, Blob, Math, Number, String, Array, Object, JSON, Error, Promise, Date };
  g.self = g;
  vm.createContext(g);
  vm.runInContext(text("Assets/app/attachments/image-optimizer-core.js"), g);
  return g.TriplemOptimizeCore;
}

test("optimiser reads the real file type from the bytes", () => {
  const C = loadCore();
  const b = arr => new Uint8Array(arr);
  assert.equal(C.sniff(b([0xff, 0xd8, 0xff, 0xe0, 0, 0])), "image/jpeg");
  assert.equal(C.sniff(b([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])), "image/png");
  assert.equal(C.sniff(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ....")), "image/webp");
  assert.equal(C.sniff(new TextEncoder().encode("%PDF-1.7\n")), "application/pdf");
  assert.equal(C.sniff(new TextEncoder().encode("GIF89a....")), "image/gif");
  assert.equal(C.sniff(new TextEncoder().encode('  <svg xmlns="http://www.w3.org/2000/svg"/>')), "image/svg+xml");
  assert.equal(C.sniff(b([0, 0, 0, 24, ...Buffer.from("ftypheic"), 0, 0, 0, 0])), "image/heic");
  assert.equal(C.sniff(new TextEncoder().encode("MZ\x90 not an image")), "");
});

test("optimiser reads EXIF orientation and finds metadata to remove", () => {
  const C = loadCore();
  // Minimal JPEG: SOI, APP1 Exif (little endian) with Orientation = 6, SOF0 1200x900.
  const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, 0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0];
  const app1 = [0xff, 0xe1, 0, exif.length + 2, ...exif];
  const sof = [0xff, 0xc0, 0, 11, 8, 0x03, 0x84, 0x04, 0xb0, 1, 1, 0x11, 0];
  const jpg = new Uint8Array([0xff, 0xd8, ...app1, ...sof, 0xff, 0xda, 0, 2, 0xff, 0xd9]);
  const info = C.jpegInfo(jpg);
  assert.equal(info.orientation, 6);
  assert.equal(info.hasMeta, true);
  assert.equal(info.w, 1200);
  assert.equal(info.h, 900);
});

test("PNG metadata chunks are removed without touching pixels", () => {
  const C = loadCore();
  const chunk = (type, data) => { const out = Buffer.alloc(12 + data.length); out.writeUInt32BE(data.length, 0); out.write(type, 4, "latin1"); Buffer.from(data).copy(out, 8); return out; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(10, 0); ihdr.writeUInt32BE(5, 4); ihdr[8] = 8; ihdr[9] = 2;
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("tEXt", Buffer.from("GPS\0Dubai 25.1,55.2")), chunk("eXIf", Buffer.from("xx")), chunk("IDAT", Buffer.from([1, 2, 3])), chunk("IEND", Buffer.alloc(0))]);
  const info = C.pngInfo(new Uint8Array(png));
  assert.equal(info.w, 10); assert.equal(info.h, 5); assert.equal(info.hasMeta, true);
  const out = Buffer.from(C.stripPng(new Uint8Array(png), info));
  assert.ok(!out.includes(Buffer.from("tEXt")) && !out.includes(Buffer.from("eXIf")) && !out.includes(Buffer.from("Dubai")));
  assert.ok(out.includes(Buffer.from("IDAT")) && out.includes(Buffer.from([1, 2, 3])) && out.includes(Buffer.from("IEND")));
});

test("document-safe defaults: WebP 0.90, 3000 px, lossless for text, never larger, PDFs untouched", () => {
  const core = text("Assets/app/attachments/image-optimizer-core.js");
  assert.match(core, /const QUALITY = \{ document: 0\.9, balanced: 0\.85, compact: 0\.8 \};/);
  assert.match(core, /Number\(settings\.maxEdge \|\| settings\.max_edge\) \|\| 3000/);
  assert.match(core, /const lossless = await tryEncode\("image\/webp", 1, "webp-lossless"\);/);
  assert.match(core, /if \(!mustReencode && \(best\.blob\.size >= bytes\.length \* \(1 - MIN_SAVING\)\)\)/, "keeps the original when it is not meaningfully smaller");
  assert.match(core, /return done\(new Blob\(\[bytes\], \{ type \}\), \{ mime: type, method: "original-pdf", optimized: false \}\);/);
  assert.match(core, /imageOrientation: "from-image"/);
  assert.match(core, /\(type === "image\/jpeg" && info\.hasMeta\)/, "JPEGs with EXIF/GPS are re-encoded");
  assert.doesNotMatch(core, /fetch\(|XMLHttpRequest|localStorage/, "the optimiser does no network or storage");
});

test("attachments: optimised before upload, kept on the device until confirmed, retried without re-compressing", () => {
  const js = text("Assets/app/attachments/02-attachments.js");
  assert.match(js, /it\.result = await optimizeFile\(file, \(\) => \{\}\);/);
  assert.match(js, /kind: "upload", ownerId: owner, module: ref\.module, recordId: ref\.id\.toLowerCase\(\), name: it\.file\.name \|\| "Photo",\s*mime: r\.mime, blob: r\.blob/, "the optimised blob is what is stored and uploaded");
  assert.match(js, /await callFn\(null, \{ upload: \{ blob: it\.blob,/);
  assert.match(js, /await qDelete\(it\.id\);/, "removed only after the server answered");
  assert.match(js, /if \(it\.kind === "delete" && \(it\.after \|\| \[\]\)\.some\(id => pendingUploads\.has\(id\)\)\) continue; \/\/ replacement first/);
  assert.match(js, /window\.addEventListener\("triplem:offline-entry-synced", \(\) => schedule\(800\)\);/);
  assert.doesNotMatch(js, /setInterval\(/, "no polling");
  assert.match(text("Assets/app/core/04-entries-api.js"), /window\.TriplemAttachments\?\.reportSaved\?\.\(rows\);/);
  for (const f of ["expenseEntryForm", "expenseTopupForm", "transferForm", "principalModalForm", "paymentModalForm", "goodsBoughtForm", "goodsSoldForm"]) {
    assert.match(text("Assets/app/ui/02-bindings.js"), new RegExp(`TriplemAttachments\\.saveWithAttachments\\(els\\.${f},`), f);
  }
});

test("list icons appear only for records with attachments and never trigger row actions", () => {
  const js = text("Assets/app/attachments/02-attachments.js");
  assert.match(js, /if \(!n\) return "";/);
  assert.match(js, /e\.preventDefault\(\); e\.stopPropagation\(\); e\.stopImmediatePropagation\?\.\(\);/);
  assert.match(text("Assets/app/expenses/01-expenses-wallets.js"), /const attIcon = window\.TriplemAttachments \? TriplemAttachments\.iconHtml\(type === "topup" \? "topup" : "expense", id\) : "";/);
  const html = text("index.html");
  assert.match(html, /<script defer src="Assets\/app\/attachments\/02-attachments\.js\?v=\d{8}-att\d+"><\/script>\s*<script defer src="Assets\/app\/ui\/02-bindings\.js/);
  assert.match(html, /<script defer src="Assets\/app\/attachments\/03-file-storage-admin\.js\?v=\d{8}-att\d+"><\/script>/);
  assert.match(text("scripts/build_feature_css_bundle.js"), /"Assets\/style\/61-attachments\.css"/);
  assert.doesNotMatch(html, /r2\.cloudflarestorage\.com/, "no storage endpoint or key in the page");
});

test("Main Admin page never shows or stores credentials in the browser", () => {
  const js = text("Assets/app/attachments/03-file-storage-admin.js");
  assert.match(js, /type="password" name="secret_access_key" value=""/);
  assert.match(js, /name="access_key_id" value=""/);
  assert.match(js, /isProtectedAdminSession\(\)/);
  assert.doesNotMatch(js, /localStorage\.setItem|sessionStorage|indexedDB/);
});

test("file-storage function: encrypted credentials, checked bytes, short links, no secrets in logs", { skip: skipFn }, () => {
  const ts = text(FN);
  assert.match(ts, /name: "AES-GCM", iv, additionalData: new TextEncoder\(\)\.encode\(`triplem-r2:\$\{field\}`\)/);
  assert.match(ts, /TRIPLEM_STORAGE_ENCRYPTION_KEY/);
  assert.match(ts, /const SIGNED_LINK_SECONDS = 300;/);
  assert.match(ts, /if \(real !== declared\) throw new HttpError\(415, "The file content does not match its type\."/);
  assert.match(ts, /if \(!key\.startsWith\(`o\/\$\{begin\?\.owner_id\}\/\$\{module\}\/\$\{recordId\}\/\$\{id\}\.`\)\)/, "server-made object keys only");
  assert.match(ts, /callRpc\("app_attachment_finish_service", \{ p_id: id, p_size: bytes\.length, p_sha256: digest/);
  assert.match(ts, /npm:aws4fetch@1\.0\.20/);
  const logs = [...ts.matchAll(/console\.(log|warn|error)\(([^;]*)\);/g)].map(m => m[2]);
  for (const l of logs) assert.doesNotMatch(l, /secret|accessKey|access_key|cfg|token/i, l);
  assert.doesNotMatch(ts, /access_key_id_enc: accessKeyId|secret_access_key_enc: secret\b/, "never stored in plain text");
});

test("migration 210 is additive, keeps tables closed and service functions private", { skip: skipSql }, () => {
  const sql = text(MIG).replace(/^--.*$/gm, "");
  assert.doesNotMatch(sql, /\b(drop table|drop column|truncate|delete from|alter table public\.(?!app_file_storage_config|app_attachments))/i);
  for (const m of sql.matchAll(/update public\.([a-z_]+)/g)) assert.ok(["app_attachments", "app_file_storage_config"].includes(m[1]), m[1]);
  assert.match(sql, /alter table public\.app_file_storage_config enable row level security;\s*revoke all on table public\.app_file_storage_config from anon, authenticated;/);
  assert.match(sql, /alter table public\.app_attachments enable row level security;\s*revoke all on table public\.app_attachments from anon, authenticated;/);
  for (const f of ["app_attachment_finish_service(uuid, bigint, text, integer, integer)", "app_attachment_fail_service(uuid, text)", "app_attachment_finish_delete_service(uuid)", "app_storage_admin_pending_service(integer)"]) {
    assert.ok(sql.includes(`revoke all on function public.${f} from anon, authenticated;`), f);
    assert.ok(sql.includes(`grant execute on function public.${f} to service_role;`), f);
  }
  assert.match(sql, /format\('o\/%s\/%s\/%s\/%s\.%s', v_owner, p_module, p_record_id, p_id, v_ext\)/);
  assert.match(sql, /perform public\.app_require_protected_admin\(\);/);
  assert.match(sql, /u public\.app_users := public\.app_require_protected_admin\(\);/);
  assert.match(text("scripts/build_full_schema_sql.js"), /"210_r2_file_storage_attachments\.sql",/);
});
