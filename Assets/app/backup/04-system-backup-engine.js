/* Triplem VIP - System Backup engine (2026-11-10).
 *
 * Format "triplem-vip-system-backup" version 1. No user interface here:
 * Assets/app/backup/03-system-backup.js drives it in the browser, and
 * scripts/system_backup_tool.js uses it from Node (decrypt / verify /
 * extract the schema package for a new Supabase project).
 *
 * Archive layout (a standard ZIP, ZIP64 when large, entries stored):
 *   TRIPLEM_VIP_SYSTEM_BACKUP/backup-header.json      plain: format, id, date, key-derivation settings
 *   TRIPLEM_VIP_SYSTEM_BACKUP/README.txt              plain: what this is and how to open it
 *   TRIPLEM_VIP_SYSTEM_BACKUP/<path>.enc              every other file, encrypted
 *     backup-manifest.json                            contents, counts, every file's SHA-256
 *     backup-verification/checksums.json              SHA-256 of every file
 *     backup-verification/verification-report.json    checks done while writing
 *     database-schema/001_....sql ... 020_....sql     schema for a NEW Supabase project
 *     database-schema/SCHEMA_INSTALLATION_README.md
 *     users/<owner id>/<section>/<table>.ndjson       one record per line
 *     users/<owner id>/profile/summary.json
 *     system-data/<table>.ndjson                      system tables
 *     system-data/unattributed/<table>.ndjson         rows whose owner no longer exists
 *     attachments/<owner id>/<module>/<attachment id>.<ext>   R2 files
 *     attachments/<owner id>/company-logos/<path>     logo files
 *
 * Encryption: a key is derived from the backup password with PBKDF2-SHA-256
 * (600,000 iterations, random salt). Each file is compressed (deflate) and
 * then sealed with AES-256-GCM using a random IV; the additional data binds
 * it to this backup and to its path, so files cannot be swapped or edited.
 * The key is never stored in the archive.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TriplemSystemBackupEngine = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const FORMAT = "triplem-vip-system-backup";
  const FORMAT_VERSION = 1;
  const ROOT = "TRIPLEM_VIP_SYSTEM_BACKUP/";
  const PBKDF2_ITERATIONS = 600000;
  const MB = 1024 * 1024;
  const GB = 1024 * MB;
  const LIMITS = Object.freeze({
    entries: 2000000,
    centralDirectory: 512 * MB,
    dataFile: 1024 * MB,        // one decrypted data file
    attachment: 64 * MB,        // one decrypted attachment
    schemaFile: 64 * MB,
    manifest: 256 * MB,
    totalExpanded: 512 * GB
  });
  const SCHEMA_FILES = Object.freeze([
    "001_extensions_and_prerequisites.sql",
    "002_schema_privileges_types_and_sequences.sql",
    "003_core_user_and_organization_tables.sql",
    "004_security_and_authentication_tables.sql",
    "005_wallet_and_expense_tables.sql",
    "006_loan_and_installment_tables.sql",
    "007_inventory_and_product_tables.sql",
    "008_asset_and_depreciation_tables.sql",
    "009_accounting_tables.sql",
    "010_insurance_tables.sql",
    "011_notes_notifications_and_messaging_tables.sql",
    "012_live_support_and_ai_tables.sql",
    "013_platform_storage_and_analytics_tables.sql",
    "014_primary_keys_unique_and_check_constraints.sql",
    "015_foreign_keys.sql",
    "016_indexes.sql",
    "017_functions_and_procedures.sql",
    "018_views_and_materialized_views.sql",
    "019_triggers.sql",
    "020_rls_policies_grants_and_finalization.sql"
  ]);
  const SCHEMA_TITLES = Object.freeze([
    "Extensions and prerequisites", "Schema privileges, types and sequences", "Core user and organisation tables",
    "Security and authentication tables", "Wallet and expense tables", "Loan and installment tables",
    "Inventory and product tables", "Asset and depreciation tables", "Accounting tables (customers, suppliers, journals, documents)",
    "Insurance tables", "Notes, notifications and messaging tables", "Live support and AI tables",
    "Platform, storage, attachment and analytics tables", "Primary keys, unique and check constraints", "Foreign keys",
    "Indexes", "Functions and procedures", "Views and materialized views", "Triggers",
    "Row level security, policies, grants, Storage, Realtime and finalisation"
  ]);
  const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  const UUID_RE = new RegExp(`^${UUID}$`, "i");
  const MAGIC = [0x54, 0x4d, 0x56, 0x45, 0x31]; // "TMVE1"

  const enc = new TextEncoder();
  const dec = new TextDecoder("utf-8", { fatal: false });

  class SystemBackupError extends Error {
    constructor(code, message, detail) { super(message); this.code = code; this.detail = detail; }
  }

  const cryptoApi = () => {
    const c = (typeof globalThis !== "undefined" && globalThis.crypto) || null;
    if (!c || !c.subtle) throw new SystemBackupError("crypto", "This browser cannot create secure backups (Web Crypto is unavailable).");
    return c;
  };
  const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  async function sha256Hex(bytes) { return hex(await cryptoApi().subtle.digest("SHA-256", bytes)); }
  const b64 = bytes => {
    const u = new Uint8Array(bytes);
    if (typeof Buffer !== "undefined" && typeof btoa === "undefined") return Buffer.from(u).toString("base64");
    let s = "";
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const unb64 = s => {
    if (typeof Buffer !== "undefined" && typeof atob === "undefined") return new Uint8Array(Buffer.from(String(s || ""), "base64"));
    return Uint8Array.from(atob(String(s || "")), c => c.charCodeAt(0));
  };
  const concat = parts => {
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  };

  // ---- CRC-32 ------------------------------------------------------------------------------
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes, prev = 0) {
    let c = (prev ^ 0xffffffff) >>> 0;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  // ---- Key derivation and per-file sealing ---------------------------------------------------
  function passwordProblem(pw) {
    const s = String(pw || "");
    if (s.length < 12) return "Use at least 12 characters.";
    const kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(r => r.test(s)).length;
    if (kinds < 3) return "Mix at least three of: lower-case, upper-case, numbers and symbols.";
    return "";
  }
  async function deriveKey(password, salt, iterations = PBKDF2_ITERATIONS) {
    const c = cryptoApi();
    const base = await c.subtle.importKey("raw", enc.encode(String(password)), "PBKDF2", false, ["deriveKey"]);
    return c.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  const aadFor = (backupId, path) => enc.encode(`${FORMAT}|${backupId}|${path}`);

  // sealed = "TMVE1" | flags (1 = deflated) | iv (12) | AES-GCM ciphertext+tag
  async function seal(lib, key, backupId, path, plain, { compress = true } = {}) {
    const c = cryptoApi();
    let body = plain;
    let flags = 0;
    if (compress && plain.length > 64) {
      const z = lib.deflateSync(plain, { level: 6 });
      if (z.length < plain.length) { body = z; flags = 1; }
    }
    const iv = c.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await c.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aadFor(backupId, path) }, key, body));
    const out = new Uint8Array(6 + 12 + ct.length);
    out.set(MAGIC, 0); out[5] = flags; out.set(iv, 6); out.set(ct, 18);
    return out;
  }

  // Inflate with a hard output limit (stops "ZIP bomb" payloads).
  function inflateLimited(lib, data, limit) {
    const parts = [];
    let total = 0;
    let failed = null;
    const inf = new lib.Inflate((chunk) => {
      total += chunk.length;
      if (total > limit) { failed = failed || new SystemBackupError("too_large", "A file in the backup expands beyond its declared size and was rejected."); return; }
      parts.push(chunk);
    });
    const STEP = 256 * 1024;
    try {
      for (let i = 0; i < data.length && !failed; i += STEP) inf.push(data.subarray(i, Math.min(data.length, i + STEP)), i + STEP >= data.length);
    } catch (_) { failed = failed || new SystemBackupError("corrupt", "A file in the backup is damaged."); }
    if (failed) throw failed;
    return concat(parts);
  }

  async function open(lib, key, backupId, path, sealed, limit) {
    if (!(sealed instanceof Uint8Array) || sealed.length < 18 + 16 || MAGIC.some((b, i) => sealed[i] !== b)) {
      throw new SystemBackupError("corrupt", `A file in the backup is damaged (${path}).`);
    }
    const flags = sealed[5];
    let body;
    try {
      body = new Uint8Array(await cryptoApi().subtle.decrypt({ name: "AES-GCM", iv: sealed.subarray(6, 18), additionalData: aadFor(backupId, path) }, key, sealed.subarray(18)));
    } catch (_) {
      throw new SystemBackupError("tampered", `A file in the backup could not be decrypted: it was changed, or the password is wrong (${path}).`);
    }
    if (flags & 1) body = inflateLimited(lib, body, limit);
    if (body.length > limit) throw new SystemBackupError("too_large", `A file in the backup is larger than allowed (${path}).`);
    return body;
  }

  async function makeKeyCheck(lib, key, backupId) {
    return b64(await seal(lib, key, backupId, "key-check", enc.encode("triplem-vip-key-check"), { compress: false }));
  }
  async function verifyKeyCheck(lib, key, backupId, value) {
    try {
      const out = await open(lib, key, backupId, "key-check", unb64(value), 64);
      return dec.decode(out) === "triplem-vip-key-check";
    } catch (_) { return false; }
  }

  // ---- ZIP writer (stored entries, ZIP64 when needed) ----------------------------------------
  // sink: { write(Uint8Array) -> Promise, close() -> Promise }
  const u16 = (v, o, a) => { a[o] = v & 0xff; a[o + 1] = (v >>> 8) & 0xff; };
  const u32 = (v, o, a) => { a[o] = v & 0xff; a[o + 1] = (v >>> 8) & 0xff; a[o + 2] = (v >>> 16) & 0xff; a[o + 3] = (v >>> 24) & 0xff; };
  const u64 = (v, o, a) => { const lo = v % 0x100000000; const hi = Math.floor(v / 0x100000000); u32(lo >>> 0, o, a); u32(hi >>> 0, o + 4, a); };
  const MAX32 = 0xffffffff;
  function dosTime(d) {
    const t = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
    const dt = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
    return { t, dt };
  }

  class ZipWriter {
    constructor(sink) {
      this.sink = sink; this.offset = 0; this.entries = []; this.names = new Set(); this.closed = false;
      this.when = dosTime(new Date());
    }
    async _write(bytes) { await this.sink.write(bytes); this.offset += bytes.length; }
    async add(name, data) {
      if (this.closed) throw new SystemBackupError("zip", "The archive is already closed.");
      if (this.names.has(name)) throw new SystemBackupError("zip", `Duplicate file in archive: ${name}`);
      this.names.add(name);
      const nameBytes = enc.encode(name);
      const crc = crc32(data);
      const size = data.length;
      const offset = this.offset;
      const zip64 = size >= MAX32 || offset >= MAX32;
      const extra = zip64 ? new Uint8Array(20) : new Uint8Array(0);
      if (zip64) { u16(0x0001, 0, extra); u16(16, 2, extra); u64(size, 4, extra); u64(size, 12, extra); }
      const h = new Uint8Array(30);
      u32(0x04034b50, 0, h); u16(zip64 ? 45 : 20, 4, h); u16(0x0800, 6, h); u16(0, 8, h);
      u16(this.when.t, 10, h); u16(this.when.dt, 12, h); u32(crc, 14, h);
      u32(zip64 ? MAX32 : size, 18, h); u32(zip64 ? MAX32 : size, 22, h);
      u16(nameBytes.length, 26, h); u16(extra.length, 28, h);
      await this._write(concat([h, nameBytes, extra]));
      await this._write(data);
      this.entries.push({ nameBytes, crc, size, offset });
    }
    async finish() {
      const cdStart = this.offset;
      const chunks = [];
      let pending = 0;
      for (const e of this.entries) {
        const needSize = e.size >= MAX32;
        const needOff = e.offset >= MAX32;
        const extraLen = (needSize ? 16 : 0) + (needOff ? 8 : 0);
        const extra = new Uint8Array(extraLen ? extraLen + 4 : 0);
        if (extraLen) {
          u16(0x0001, 0, extra); u16(extraLen, 2, extra);
          let o = 4;
          if (needSize) { u64(e.size, o, extra); u64(e.size, o + 8, extra); o += 16; }
          if (needOff) u64(e.offset, o, extra);
        }
        const c = new Uint8Array(46);
        u32(0x02014b50, 0, c); u16(45, 4, c); u16(extraLen ? 45 : 20, 6, c); u16(0x0800, 8, c); u16(0, 10, c);
        u16(this.when.t, 12, c); u16(this.when.dt, 14, c); u32(e.crc, 16, c);
        u32(needSize ? MAX32 : e.size, 20, c); u32(needSize ? MAX32 : e.size, 24, c);
        u16(e.nameBytes.length, 28, c); u16(extra.length, 30, c); u16(0, 32, c); u16(0, 34, c); u16(0, 36, c); u32(0, 38, c);
        u32(needOff ? MAX32 : e.offset, 42, c);
        chunks.push(c, e.nameBytes, extra);
        pending += 46 + e.nameBytes.length + extra.length;
        if (pending > 4 * MB) { await this._write(concat(chunks.splice(0))); pending = 0; }
      }
      if (chunks.length) await this._write(concat(chunks));
      const cdSize = this.offset - cdStart;
      const count = this.entries.length;
      const need64 = count >= 0xffff || cdSize >= MAX32 || cdStart >= MAX32;
      if (need64) {
        const eocd64At = this.offset;
        const z = new Uint8Array(56);
        u32(0x06064b50, 0, z); u64(44, 4, z); u16(45, 12, z); u16(45, 14, z); u32(0, 16, z); u32(0, 20, z);
        u64(count, 24, z); u64(count, 32, z); u64(cdSize, 40, z); u64(cdStart, 48, z);
        const loc = new Uint8Array(20);
        u32(0x07064b50, 0, loc); u32(0, 4, loc); u64(eocd64At, 8, loc); u32(1, 16, loc);
        await this._write(concat([z, loc]));
      }
      const end = new Uint8Array(22);
      u32(0x06054b50, 0, end); u16(0, 4, end); u16(0, 6, end);
      u16(Math.min(count, 0xffff), 8, end); u16(Math.min(count, 0xffff), 10, end);
      u32(Math.min(cdSize, MAX32), 12, end); u32(Math.min(cdStart, MAX32), 16, end); u16(0, 20, end);
      await this._write(end);
      this.closed = true;
      if (this.sink.close) await this.sink.close();
      return { bytes: this.offset, entries: count };
    }
  }

  // ---- ZIP reader (random access on a Blob/File, or a Uint8Array) ---------------------------
  const r16 = (a, o) => a[o] | (a[o + 1] << 8);
  const r32 = (a, o) => (a[o] | (a[o + 1] << 8) | (a[o + 2] << 16) | (a[o + 3] << 24)) >>> 0;
  const r64 = (a, o) => r32(a, o) + r32(a, o + 4) * 0x100000000;
  async function readRange(src, start, end) {
    if (src instanceof Uint8Array) return src.subarray(start, end);
    if (typeof src.read === "function") return src.read(start, end); // Node helper
    return new Uint8Array(await src.slice(start, end).arrayBuffer());
  }
  const sizeOf = src => (src instanceof Uint8Array ? src.length : Number(src.size));

  // Path rules for anything read from an uploaded archive.
  // Section folders are lower-case names that start with a letter; digits are allowed after it
  // (Inventory 2.0 uses "inventory_v2"). Dots, slashes and other characters are never allowed.
  const SECTION = "[a-z][a-z0-9_]{1,39}";
  const TABLE = "[a-z0-9_]{2,80}";
  const PATH_RULES = [
    new RegExp(`^${ROOT}(backup-header\\.json|README\\.txt)$`),
    new RegExp(`^${ROOT}backup-manifest\\.json\\.enc$`),
    new RegExp(`^${ROOT}backup-verification/(checksums|verification-report)\\.json\\.enc$`),
    new RegExp(`^${ROOT}database-schema/(0[0-1][0-9]|020)_[a-z0-9_]{3,80}\\.sql\\.enc$`),
    new RegExp(`^${ROOT}database-schema/SCHEMA_INSTALLATION_README\\.md\\.enc$`),
    new RegExp(`^${ROOT}users/${UUID}/${SECTION}/${TABLE}\\.ndjson\\.enc$`, "i"),
    new RegExp(`^${ROOT}users/${UUID}/profile/summary\\.json\\.enc$`, "i"),
    new RegExp(`^${ROOT}system-data/${TABLE}\\.ndjson\\.enc$`),
    new RegExp(`^${ROOT}system-data/unattributed/${TABLE}\\.ndjson\\.enc$`),
    new RegExp(`^${ROOT}attachments/${UUID}/[a-z_]{2,40}/${UUID}\\.(jpg|jpeg|png|webp|pdf)\\.enc$`, "i"),
    new RegExp(`^${ROOT}attachments/${UUID}/company-logos/[A-Za-z0-9_.\\-/]{1,300}\\.enc$`, "i")
  ];
  function safeName(name) {
    const n = String(name || "");
    if (!n || n.length > 600 || /[\u0000-\u001f\\:*?"<>|]/.test(n) || n.startsWith("/") || /^[a-z]:/i.test(n)) return false;
    const parts = n.split("/");
    if (parts.some(p => p === ".." || p === "." || p === "")) return n.endsWith("/") && !parts.slice(0, -1).some(p => p === ".." || p === "." || p === "") ? "dir" : false;
    return PATH_RULES.some(r => r.test(n)) ? "file" : "unknown";
  }

  async function openZip(src) {
    const total = sizeOf(src);
    if (!(total >= 22)) throw new SystemBackupError("not_zip", "This is not a ZIP file.");
    const head = await readRange(src, 0, 4);
    if (head[0] !== 0x50 || head[1] !== 0x4b) throw new SystemBackupError("not_zip", "This is not a ZIP file.");
    const tailLen = Math.min(total, 22 + 65535 + 20);
    const tail = await readRange(src, total - tailLen, total);
    let eo = -1;
    for (let i = tail.length - 22; i >= 0; i--) if (r32(tail, i) === 0x06054b50) { eo = i; break; }
    if (eo < 0) throw new SystemBackupError("corrupt", "The ZIP file is incomplete or damaged (end record not found).");
    let count = r16(tail, eo + 10);
    let cdSize = r32(tail, eo + 12);
    let cdStart = r32(tail, eo + 16);
    if (count === 0xffff || cdSize === MAX32 || cdStart === MAX32) {
      const lo = eo - 20;
      if (lo < 0 || r32(tail, lo) !== 0x07064b50) throw new SystemBackupError("corrupt", "The ZIP64 end record is missing.");
      const z64At = r64(tail, lo + 8);
      const z = await readRange(src, z64At, z64At + 56);
      if (r32(z, 0) !== 0x06064b50) throw new SystemBackupError("corrupt", "The ZIP64 end record is damaged.");
      count = r64(z, 32); cdSize = r64(z, 40); cdStart = r64(z, 48);
    }
    if (count > LIMITS.entries) throw new SystemBackupError("too_many", "The archive contains too many files.");
    if (cdSize > LIMITS.centralDirectory || cdStart + cdSize > total) throw new SystemBackupError("corrupt", "The ZIP directory is damaged.");
    const cd = await readRange(src, cdStart, cdStart + cdSize);
    const entries = new Map();
    const unknown = [];
    let p = 0;
    for (let i = 0; i < count; i++) {
      if (p + 46 > cd.length || r32(cd, p) !== 0x02014b50) throw new SystemBackupError("corrupt", "The ZIP directory is damaged.");
      const flags = r16(cd, p + 8);
      const method = r16(cd, p + 10);
      const crc = r32(cd, p + 16);
      let csize = r32(cd, p + 20), usize = r32(cd, p + 24);
      const nlen = r16(cd, p + 28), xlen = r16(cd, p + 30), clen = r16(cd, p + 32);
      let off = r32(cd, p + 42);
      const name = dec.decode(cd.subarray(p + 46, p + 46 + nlen));
      let x = p + 46 + nlen;
      const xend = x + xlen;
      while (x + 4 <= xend) {
        const id = r16(cd, x), len = r16(cd, x + 2);
        if (id === 0x0001) {
          let q = x + 4;
          if (usize === MAX32) { usize = r64(cd, q); q += 8; }
          if (csize === MAX32) { csize = r64(cd, q); q += 8; }
          if (off === MAX32) { off = r64(cd, q); q += 8; }
        }
        x += 4 + len;
      }
      p = xend + clen;
      const kind = safeName(name);
      if (kind === false) throw new SystemBackupError("unsafe_path", "The archive contains an unsafe file path and was rejected.");
      if (kind === "dir") continue;
      if (kind === "unknown") { unknown.push(name); continue; }
      if (entries.has(name)) throw new SystemBackupError("corrupt", "The archive contains a duplicate file.");
      if (flags & 1) throw new SystemBackupError("unsupported", "ZIP-level encryption is not used by Triplem VIP backups.");
      if (method !== 0 || csize !== usize) throw new SystemBackupError("unsupported", "This archive was not written by Triplem VIP (unexpected compression).");
      if (off + csize > total) throw new SystemBackupError("corrupt", "The archive is truncated.");
      entries.set(name, { name, crc, size: csize, offset: off });
    }
    return {
      src, total, entries, unknown,
      async read(name, { verifyCrc = true } = {}) {
        const e = entries.get(name);
        if (!e) throw new SystemBackupError("incomplete", `The backup is incomplete (${name.replace(ROOT, "")} is missing).`);
        const lh = await readRange(src, e.offset, e.offset + 30);
        if (r32(lh, 0) !== 0x04034b50) throw new SystemBackupError("corrupt", "The archive is damaged (local header).");
        const start = e.offset + 30 + r16(lh, 26) + r16(lh, 28);
        const data = await readRange(src, start, start + e.size);
        if (data.length !== e.size) throw new SystemBackupError("corrupt", "The archive is truncated.");
        if (verifyCrc && crc32(data) !== e.crc) throw new SystemBackupError("corrupt", `A file in the archive is damaged (${name.replace(ROOT, "")}).`);
        return data;
      }
    };
  }

  // ---- Schema package --------------------------------------------------------------------------
  function schemaHeader(i, meta) {
    const no = String(i + 1).padStart(3, "0");
    return [
      `-- Triplem VIP database schema - file ${no} of 020: ${SCHEMA_TITLES[i]}`,
      `-- Exported from the live PostgreSQL catalog on ${meta.generatedAt} (backup ${meta.backupId}, PostgreSQL ${meta.serverVersion}).`,
      "-- FOR A NEW, EMPTY SUPABASE PROJECT ONLY. Run the files in order: 001, 002, ... 020.",
      "-- Schema only: no customer records, no passwords, no keys or other credentials.",
      "-- Never run these files against an existing Triplem VIP database. File 001 refuses to run on",
      "-- a database that already has Triplem VIP tables, and files 002-020 refuse to run unless 001 ran first.",
      ""
    ].join("\n");
  }
  function buildSchemaFiles(objects, meta) {
    const marker = `triplem-vip-schema-install:${meta.backupId}`;
    const byFile = SCHEMA_FILES.map(() => []);
    const seen = new Set();
    for (const o of objects) {
      const f = Number(o.file);
      if (!(f >= 1 && f <= 20)) throw new SystemBackupError("schema", `Schema object assigned to an unknown file: ${o.kind} ${o.name}`);
      const key = `${o.kind}|${o.name}`;
      if (seen.has(key) && !["comment", "grant", "function_grant", "column_grant", "schema_grant"].includes(o.kind)) {
        throw new SystemBackupError("schema", `Duplicate schema object: ${o.kind} ${o.name}`);
      }
      seen.add(key);
      byFile[f - 1].push(o);
    }
    const files = [];
    SCHEMA_FILES.forEach((name, i) => {
      const objs = byFile[i].sort((a, b) => a.seq - b.seq);
      if (!objs.length) throw new SystemBackupError("schema", `Schema file ${name} would be empty. The schema package was not created.`);
      const parts = [schemaHeader(i, meta), "BEGIN;", "SET LOCAL check_function_bodies = off;", "SET LOCAL search_path = public, extensions;", ""];
      if (i === 0) {
        parts.push(
          "DO $guard$",
          "BEGIN",
          "  IF to_regclass('public.app_users') IS NOT NULL THEN",
          "    RAISE EXCEPTION 'This database already contains Triplem VIP tables. The schema package is only for a NEW, empty Supabase project. Nothing was changed.';",
          "  END IF;",
          "  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN",
          "    RAISE EXCEPTION 'The Supabase roles anon, authenticated and service_role were not found. Run these files in the SQL editor of a Supabase project.';",
          "  END IF;",
          "END $guard$;",
          `COMMENT ON SCHEMA public IS '${marker}';`,
          "");
      } else {
        parts.push(
          "DO $guard$",
          "BEGIN",
          "  IF coalesce(obj_description('public'::regnamespace, 'pg_namespace'), '') NOT LIKE 'triplem-vip-schema-install:%' THEN",
          `    RAISE EXCEPTION 'Run 001_extensions_and_prerequisites.sql first. This file only runs during a new installation (file ${String(i + 1).padStart(3, "0")} refused, nothing changed).';`,
          "  END IF;",
          "END $guard$;",
          "");
      }
      let last = "";
      for (const o of objs) {
        if (o.kind !== last) { parts.push(`-- ${o.kind.replace(/_/g, " ")}`); last = o.kind; }
        parts.push(String(o.ddl).trim(), "");
      }
      if (i === 19) {
        parts.push("-- finalisation: restore the original schema comment and reload the API schema cache",
          `COMMENT ON SCHEMA public IS ${meta.schemaComment == null ? "NULL" : "'" + String(meta.schemaComment).replace(/'/g, "''") + "'"};`,
          "NOTIFY pgrst, 'reload schema';", "");
      }
      parts.push("COMMIT;", "");
      files.push({ name, text: parts.join("\n"), objects: objs.length });
    });
    return files;
  }
  function schemaReadme(meta, files, coverage) {
    const c = coverage || {};
    return `# Triplem VIP - database schema installation

Generated ${meta.generatedAt} from the live database (backup \`${meta.backupId}\`, PostgreSQL ${meta.serverVersion}).

These 20 SQL files recreate the **structure** of the Triplem VIP database on a **new, empty Supabase project**.
They contain no customer records, no passwords and no keys. Customer data is restored separately with
**Main Admin > Backup > System Backup & Restore > Restore**, which never runs these files.

## What is included (counted from the live catalog)

| Object | Count |
|---|---|
| Tables | ${c.tables ?? "-"} |
| Views / materialized views | ${c.views ?? "-"} / ${c.materialized_views ?? "-"} |
| Functions and procedures | ${c.functions ?? "-"} |
| Triggers | ${c.triggers ?? "-"} |
| Row level security policies | ${c.policies ?? "-"} |
| Indexes (incl. key indexes) | ${c.indexes ?? "-"} |
| Constraints (PK, unique, check, FK) | ${c.constraints ?? "-"} |
| Sequences | ${c.sequences ?? "-"} |
| Extensions | ${c.extensions ?? "-"} |

Also included: column defaults, identity columns, NOT NULL rules, row level security switches, every
table/column/function privilege (revoked from the Supabase defaults first, then granted exactly as live),
comments, Storage buckets and Storage policies created by the app, and Realtime publication membership.

## Requirements

* A **new** Supabase project (PostgreSQL ${String(meta.serverVersion || "").split(".")[0] || "15"}+ recommended: same major version as the source, ${meta.serverVersion}).
* Run the files as the \`postgres\` role (Supabase SQL editor, or \`psql\` with the database connection string).

## Order

${files.map((f, i) => `${i + 1}. \`${f.name}\``).join("\n")}

Each file runs in a single transaction. If one fails, nothing from that file is applied: fix the cause and run the same file again.

With psql:

\`\`\`
for f in 0*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f" || break; done
\`\`\`

## Safety guards

* File 001 refuses to run when the database already contains Triplem VIP tables, so it can never be applied to production by mistake.
* Files 002-020 refuse to run unless 001 has run (001 marks the new database; 020 removes the mark).

## Checks after installation

\`\`\`sql
select count(*) from pg_tables where schemaname = 'public';          -- expect ${c.tables ?? "the table count above"}
select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prokind in ('f','p');              -- expect at least ${c.functions ?? "the function count above"}
select count(*) from pg_policies where schemaname = 'public';        -- expect ${c.policies ?? "the policy count above"}
\`\`\`

## Configuration that SQL cannot carry (do these after installing)

1. **Edge Functions**: deploy every function from \`supabase/functions\` (file-storage with \`--no-verify-jwt\`, and the others as before).
2. **Edge Function secrets**: \`TRIPLEM_STORAGE_ENCRYPTION_KEY\` (new random 32-byte key), plus any other secrets your functions use (push keys, AI keys). Secrets are never in a backup.
3. **Cloudflare R2**: open Main Admin > File Storage and enter the R2 credentials again (they are encrypted with the server key and are never exported).
4. **Triplem AI / Gemini key**: enter it again in the app (vault secrets are never exported).
5. **Vault**: the \`supabase_vault\` extension must be enabled (it is on Supabase by default).
6. **App configuration**: point the web app and the Windows app at the new project URL and publishable key.
7. **Main Admin account**: create the protected Main Admin with the SAME id and username it had, so its records match the
   backup. Run this once in the SQL editor (replace only the password; keep it private):

\`\`\`sql
insert into public.app_users (id, username, password_hash, display_name, role, is_protected, is_active, must_change_password)
values ('${meta.adminId || "<MAIN_ADMIN_ID from backup-manifest.json createdBy.id>"}', '${String(meta.adminUsername || "<MAIN_ADMIN_USERNAME>").replace(/'/g, "''")}',
        extensions.crypt('<choose a strong password>', extensions.gen_salt('bf')), 'Main Admin', 'admin', true, true, false);
\`\`\`

8. **Data**: sign in as that Main Admin and use Main Admin > Backup > System Backup & Restore > Restore with your backup ZIP.
   On an empty database no pre-restore backup is required; on a database that already has data a System Backup from the
   last 24 hours is required first.
9. **Accounts**: passwords are never exported. Restored accounts get an unknown random password and must change it:
   give each user a temporary password (Main Admin > Password Recovery) or set one in Main Admin > Users > Edit.
`;
  }

  // ---- Manifest ------------------------------------------------------------------------------
  function manifestDigestInput(m) {
    return JSON.stringify([m.format, m.formatVersion, m.backupId, m.createdAt,
      (m.files || []).map(f => [f.path, f.size, f.sha256])]);
  }
  function validateManifest(m, header) {
    if (!m || m.format !== FORMAT) throw new SystemBackupError("not_backup", "This is not a Triplem VIP system backup.");
    if (!Number.isInteger(m.formatVersion) || m.formatVersion < 1) throw new SystemBackupError("unsupported", "This backup format is not supported.");
    if (m.formatVersion > FORMAT_VERSION) throw new SystemBackupError("newer", "This backup was made by a newer version of Triplem VIP. Update the app and try again.");
    if (!UUID_RE.test(String(m.backupId || "")) || (header && m.backupId !== header.backupId)) throw new SystemBackupError("corrupt", "The backup description does not match its header.");
    if (!Array.isArray(m.files) || !m.files.length) throw new SystemBackupError("corrupt", "The backup description is incomplete.");
    const seen = new Set();
    let expanded = 0;
    for (const f of m.files) {
      if (!f || typeof f.path !== "string" || safeName(ROOT + f.path + ".enc") !== "file" || seen.has(f.path)
          || !Number.isInteger(f.size) || f.size < 0 || !/^[0-9a-f]{64}$/.test(String(f.sha256))) {
        throw new SystemBackupError("corrupt", "The backup description lists an invalid file.");
      }
      seen.add(f.path);
      expanded += f.size;
    }
    if (expanded > LIMITS.totalExpanded) throw new SystemBackupError("too_large", "The backup expands beyond the supported size.");
    const schema = m.files.filter(f => f.kind === "schema" && /\.sql$/.test(f.path));
    if (schema.length !== 20 || schema.some((f, i) => f.path !== `database-schema/${SCHEMA_FILES[i]}`)) {
      throw new SystemBackupError("corrupt", "The backup does not contain the 20 database schema files in order.");
    }
    return m;
  }
  const limitFor = f => (f.kind === "attachment" || f.kind === "logo") ? LIMITS.attachment : f.kind === "schema" ? LIMITS.schemaFile : LIMITS.dataFile;

  function parseHeader(bytes) {
    let h;
    try { h = JSON.parse(dec.decode(bytes)); } catch (_) { throw new SystemBackupError("corrupt", "The backup header is damaged."); }
    if (!h || h.format !== FORMAT) throw new SystemBackupError("not_backup", "This ZIP is not a Triplem VIP system backup.");
    if (!Number.isInteger(h.formatVersion) || h.formatVersion > FORMAT_VERSION) throw new SystemBackupError("newer", "This backup was made by a newer version of Triplem VIP.");
    const k = h.encryption || {};
    if (k.kdf !== "PBKDF2-SHA-256" || k.cipher !== "AES-256-GCM" || !(k.iterations >= 100000 && k.iterations <= 5000000) || !k.salt || !k.keyCheck) {
      throw new SystemBackupError("unsupported", "This backup uses unsupported protection settings.");
    }
    if (!UUID_RE.test(String(h.backupId || ""))) throw new SystemBackupError("corrupt", "The backup header is incomplete.");
    return h;
  }

  // Open an archive: structure, header, password, manifest, checksums list.
  async function openArchive(lib, src, password, { onProgress } = {}) {
    const zip = await openZip(src);
    if (zip.unknown.length) {
      throw new SystemBackupError("unexpected_files", `The archive contains files that a Triplem VIP system backup never has (${zip.unknown.slice(0, 3).join(", ")}${zip.unknown.length > 3 ? ", ..." : ""}). It was rejected.`);
    }
    const header = parseHeader(await zip.read(ROOT + "backup-header.json"));
    if (!password) throw new SystemBackupError("needs_password", "Enter the backup password.");
    const key = await deriveKey(password, unb64(header.encryption.salt), header.encryption.iterations);
    if (!await verifyKeyCheck(lib, key, header.backupId, header.encryption.keyCheck)) throw new SystemBackupError("password", "The password is not correct.");
    const readFile = async (path, limit) => open(lib, key, header.backupId, path, await zip.read(ROOT + path + ".enc"), limit);
    let manifest;
    try { manifest = JSON.parse(dec.decode(await readFile("backup-manifest.json", LIMITS.manifest))); }
    catch (e) { if (e instanceof SystemBackupError) throw e; throw new SystemBackupError("corrupt", "The backup description is damaged."); }
    validateManifest(manifest, header);
    const digest = await sha256Hex(enc.encode(manifestDigestInput(manifest)));
    if (digest !== manifest.digest) throw new SystemBackupError("tampered", "The backup description was changed after it was created.");
    // Every listed file must be in the ZIP, and nothing else may be.
    const listed = new Set(manifest.files.map(f => ROOT + f.path + ".enc"));
    listed.add(ROOT + "backup-manifest.json.enc"); listed.add(ROOT + "backup-header.json"); listed.add(ROOT + "README.txt");
    listed.add(ROOT + "backup-verification/checksums.json.enc"); listed.add(ROOT + "backup-verification/verification-report.json.enc");
    for (const name of zip.entries.keys()) if (!listed.has(name)) throw new SystemBackupError("unexpected_files", `The archive contains an unexpected file (${name.replace(ROOT, "")}).`);
    for (const f of manifest.files) if (!zip.entries.has(ROOT + f.path + ".enc")) throw new SystemBackupError("incomplete", `The backup is incomplete (${f.path} is missing).`);
    const byPath = new Map(manifest.files.map(f => [f.path, f]));
    return {
      zip, header, manifest, key,
      // Decrypt, size-check and hash-check one listed file.
      async file(path) {
        const f = byPath.get(path);
        if (!f) throw new SystemBackupError("incomplete", `Unknown file ${path}.`);
        const data = await readFile(path, Math.min(limitFor(f), f.size));
        if (data.length !== f.size || await sha256Hex(data) !== f.sha256) throw new SystemBackupError("tampered", `A file in the backup does not match its checksum (${path}).`);
        return data;
      },
      async checksums() { return JSON.parse(dec.decode(await readFile("backup-verification/checksums.json", LIMITS.manifest))); },
      async report() { return JSON.parse(dec.decode(await readFile("backup-verification/verification-report.json", LIMITS.manifest))); }
    };
  }

  // Full integrity pass over every listed file (used before a restore and by the tool).
  async function verifyArchive(arch, { onProgress, signal } = {}) {
    const files = arch.manifest.files;
    const sums = await arch.checksums();
    let done = 0, bytes = 0;
    const problems = [];
    for (const f of files) {
      if (signal && signal.aborted) throw new SystemBackupError("aborted", "Stopped.");
      if (sums.files?.[f.path] !== f.sha256) problems.push({ path: f.path, problem: "checksum list differs" });
      try { const d = await arch.file(f.path); bytes += d.length; }
      catch (e) { problems.push({ path: f.path, problem: e.message }); }
      done += 1;
      if (onProgress && (done % 25 === 0 || done === files.length)) onProgress({ done, total: files.length, bytes });
    }
    return { ok: problems.length === 0, files: files.length, bytes, problems };
  }

  // ---- NDJSON ------------------------------------------------------------------------------
  function ndjsonLines(bytes) {
    const text = dec.decode(bytes);
    const out = [];
    let start = 0;
    for (let i = 0; i <= text.length; i++) {
      if (i === text.length || text.charCodeAt(i) === 10) {
        const line = text.slice(start, i).replace(/\r$/, "");
        if (line.trim()) out.push(line);
        start = i + 1;
      }
    }
    return out;
  }
  function logoPathsIn(text) {
    const out = new Set();
    const re = /\/storage\/v1\/object\/(?:public\/)?company-logos\/([A-Za-z0-9_.\-\/%]+)/g;
    let m;
    while ((m = re.exec(text))) {
      let p;
      try { p = decodeURIComponent(m[1]); } catch (_) { continue; }
      if (!p.includes("..") && /^[A-Za-z0-9_.\-\/]{1,300}$/.test(p) && !p.startsWith("/")) out.add(p);
    }
    return [...out];
  }
  const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

  // ---- Restore planning helpers ---------------------------------------------------------------
  // Parents before children inside one table (self references: accounts under accounts,
  // reversal journals, credit notes).
  function orderRows(rows, parentCols) {
    if (!parentCols.length) return rows;
    const byKey = new Map(rows.map(r => [String(r.obj.id ?? ""), r]));
    const state = new Map();
    const out = [];
    const visit = r => {
      if (state.get(r)) return;
      state.set(r, 1);
      for (const c of parentCols) {
        const p = byKey.get(String(r.obj[c] ?? ""));
        if (p && p !== r) visit(p);
      }
      out.push(r);
    };
    rows.forEach(visit);
    return out;
  }
  function batchLines(lines, maxLines = 300, maxBytes = 1.5 * MB) {
    const out = [];
    let cur = [], size = 0;
    for (const l of lines) {
      if (cur.length && (cur.length >= maxLines || size + l.length > maxBytes)) { out.push(cur); cur = []; size = 0; }
      cur.push(l); size += l.length;
    }
    if (cur.length) out.push(cur);
    return out;
  }

  return Object.freeze({
    FORMAT, FORMAT_VERSION, ROOT, PBKDF2_ITERATIONS, LIMITS, SCHEMA_FILES, SCHEMA_TITLES, SystemBackupError, EXT,
    sha256Hex, b64, unb64, crc32, concat, passwordProblem, deriveKey, seal, open, makeKeyCheck, verifyKeyCheck,
    ZipWriter, openZip, safeName, buildSchemaFiles, schemaReadme, manifestDigestInput, validateManifest, parseHeader,
    openArchive, verifyArchive, ndjsonLines, logoPathsIn, orderRows, batchLines, inflateLimited, UUID_RE
  });
});
