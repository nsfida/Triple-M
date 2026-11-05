/* Triplem VIP - Backup & Restore engine (2026-11-05).
 *
 * Builds and reads backup ZIP files and plans restores. It has no user
 * interface: Assets/app/backup/02-backup-ui.js drives it. Every database call
 * goes through the server functions of migration 205, which enforce
 * ownership, signatures and "add only, never overwrite" on the server.
 *
 * Backup ZIP layout (format "triplem-vip-user-backup", version 1):
 *   manifest.json                      what is inside, hashes, server signature
 *   README.txt                         plain-language description
 *   profile.json                       account profile (reference only)
 *   data/<section>/<table>.ndjson      one signed record per line:
 *                                      {"s": <server signature>, "r": <original record>}
 *   attachments/company-logos/...      original logo files
 * Password-protected backups contain manifest.json (no data), README.txt and
 * payload.bin = AES-256-GCM(inner backup ZIP), key from PBKDF2-SHA-256.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TriplemBackupEngine = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const FORMAT = "triplem-vip-user-backup";
  const FORMAT_VERSION = 1;
  const MB = 1024 * 1024;
  const LIMITS = Object.freeze({
    zipBytes: 512 * MB,          // selected file
    totalUncompressed: 1536 * MB,
    entries: 20000,
    fileBytes: 768 * MB,         // one data file
    attachmentBytes: 5 * MB,     // one logo / image
    attachments: 2000,
    manifestBytes: 8 * MB
  });
  const PAGE_SIZE = 1000;
  const BATCH_LINES = 300;
  const BATCH_BYTES = 1.5 * MB;
  const PBKDF2_ITERATIONS = 600000;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const LOGO_BUCKET = "company-logos";
  const IMAGE_TYPES = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };

  const enc = new TextEncoder();
  const dec = new TextDecoder("utf-8", { fatal: false });

  class BackupError extends Error {
    constructor(code, message) { super(message); this.code = code; }
  }

  // ---- small helpers --------------------------------------------------------------------
  const cryptoApi = () => {
    const c = (typeof globalThis !== "undefined" && globalThis.crypto) || null;
    if (!c || !c.subtle) throw new BackupError("crypto", "This browser cannot create secure backups (Web Crypto is unavailable).");
    return c;
  };
  async function sha256Hex(bytes) {
    const d = await cryptoApi().subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
  }
  const b64 = bytes => {
    let s = "";
    const u = new Uint8Array(bytes);
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const unb64 = s => Uint8Array.from(atob(String(s || "")), c => c.charCodeAt(0));
  const tick = () => new Promise(r => setTimeout(r, 0));
  function checkAbort(signal) {
    if (signal && signal.aborted) throw new BackupError("aborted", "Stopped.");
  }
  function unwrap(v) {
    let x = v;
    for (let i = 0; i < 3 && typeof x === "string"; i += 1) { try { x = JSON.parse(x); } catch (_) { break; } }
    if (Array.isArray(x) && x.length === 1 && x[0] && typeof x[0] === "object") x = x[0];
    return x;
  }
  function splitLines(text) {
    const out = [];
    let start = 0;
    for (let i = 0; i <= text.length; i += 1) {
      if (i === text.length || text.charCodeAt(i) === 10) {
        const line = text.slice(start, i).replace(/\r$/, "");
        if (line.trim()) out.push(line);
        start = i + 1;
      }
    }
    return out;
  }

  // ---- fflate (vendored, MIT) -----------------------------------------------------------
  function zipLib(deps) {
    const lib = deps.fflate || (typeof globalThis !== "undefined" && globalThis.fflate);
    if (!lib || typeof lib.zip !== "function") throw new BackupError("zip", "The backup component could not be loaded. Check your connection and try again.");
    return lib;
  }
  function zipAsync(lib, files) {
    return new Promise((resolve, reject) => lib.zip(files, { level: 6, mtime: new Date() }, (err, data) => err ? reject(err) : resolve(data)));
  }

  // Path rules for anything read from an uploaded ZIP (no traversal, no
  // absolute paths, no hidden control characters, known folders only).
  function safeEntryName(name) {
    const n = String(name || "");
    if (!n || n.length > 400 || /[\u0000-\u001f\\]/.test(n) || n.startsWith("/") || /^[a-z]:/i.test(n)) return false;
    const parts = n.split("/");
    if (parts.some(p => p === ".." || p === ".")) return false;
    if (n.endsWith("/")) return "dir";
    return n === "manifest.json" || n === "README.txt" || n === "profile.json" || n === "payload.bin"
      || /^data\/[a-z_]+\/[a-z_]+\.ndjson$/.test(n)
      || /^attachments\/company-logos\/[A-Za-z0-9_.\/-]+$/.test(n);
  }

  // Streaming unzip that enforces the size limits while decompressing, so a
  // "ZIP bomb" whose headers lie is stopped before it can exhaust memory.
  async function safeUnzip(lib, bytes, { onProgress } = {}) {
    if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
    if (bytes.length > LIMITS.zipBytes) throw new BackupError("too_large", "This file is larger than the 512 MB backup limit.");
    if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new BackupError("not_zip", "This is not a ZIP file. Choose a Triplem VIP backup (.zip).");
    const files = new Map();
    const ignored = [];
    let entries = 0;
    let total = 0;
    let failure = null;
    const unzipper = new lib.Unzip(file => {
      entries += 1;
      if (entries > LIMITS.entries) { failure = failure || new BackupError("too_many", "The backup contains too many files."); return; }
      const rule = safeEntryName(file.name);
      if (rule === "dir") return;
      if (!rule) {
        if (file.name.includes("..") || file.name.startsWith("/") || /^[a-z]:/i.test(file.name) || file.name.includes("\\")) {
          failure = failure || new BackupError("unsafe_path", "The backup contains an unsafe file path and was rejected.");
        } else {
          ignored.push(file.name);
        }
        return;
      }
      const isAttachment = file.name.startsWith("attachments/");
      const limit = isAttachment ? LIMITS.attachmentBytes : (file.name === "manifest.json" ? LIMITS.manifestBytes : LIMITS.fileBytes);
      if (typeof file.originalSize === "number" && file.originalSize > limit) {
        failure = failure || new BackupError("too_large", `A file in the backup is too large (${file.name}).`);
        return;
      }
      const chunks = [];
      let size = 0;
      file.ondata = (err, chunk, final) => {
        if (failure) return;
        if (err) { failure = new BackupError("corrupt", "The backup file is damaged and cannot be read."); return; }
        size += chunk.length;
        total += chunk.length;
        if (size > limit || total > LIMITS.totalUncompressed) {
          failure = new BackupError("too_large", "The backup expands to more data than allowed and was rejected.");
          try { file.terminate(); } catch (_) {}
          return;
        }
        chunks.push(chunk);
        if (final) {
          const out = new Uint8Array(size);
          let o = 0;
          for (const c of chunks) { out.set(c, o); o += c.length; }
          files.set(file.name, out);
        }
      };
      file.start();
    });
    unzipper.register(lib.UnzipInflate);
    const STEP = 1 * MB;
    try {
      for (let i = 0; i < bytes.length; i += STEP) {
        if (failure) break;
        unzipper.push(bytes.subarray(i, Math.min(bytes.length, i + STEP)), i + STEP >= bytes.length);
        if (onProgress) onProgress(Math.min(1, (i + STEP) / bytes.length));
        await tick();
      }
    } catch (_) {
      failure = failure || new BackupError("corrupt", "The backup file is damaged and cannot be read.");
    }
    if (failure) throw failure;
    return { files, ignored };
  }

  // ---- password protection (AES-256-GCM, PBKDF2-SHA-256) --------------------------------
  async function deriveKey(password, salt, iterations) {
    const c = cryptoApi();
    const base = await c.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
    return c.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function encryptBytes(bytes, password, aad) {
    const c = cryptoApi();
    const salt = c.getRandomValues(new Uint8Array(16));
    const iv = c.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
    const data = new Uint8Array(await c.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(aad) }, key, bytes));
    return { data, kdf: { name: "PBKDF2", hash: "SHA-256", iterations: PBKDF2_ITERATIONS, salt: b64(salt) }, cipher: { name: "AES-GCM", iv: b64(iv), aad } };
  }
  async function decryptBytes(bytes, password, manifest) {
    const kdf = manifest.kdf || {};
    const cipher = manifest.cipher || {};
    if (kdf.name !== "PBKDF2" || kdf.hash !== "SHA-256" || cipher.name !== "AES-GCM") throw new BackupError("unsupported", "This backup uses an unsupported protection method.");
    const iterations = Number(kdf.iterations);
    if (!(iterations >= 100000 && iterations <= 5000000)) throw new BackupError("unsupported", "This backup uses unsupported protection settings.");
    const key = await deriveKey(password, unb64(kdf.salt), iterations);
    try {
      return new Uint8Array(await cryptoApi().subtle.decrypt({ name: "AES-GCM", iv: unb64(cipher.iv), additionalData: enc.encode(String(cipher.aad || "")) }, key, bytes));
    } catch (_) {
      throw new BackupError("password", "The password is not correct (or the protected backup was changed).");
    }
  }

  // ---- manifest digest --------------------------------------------------------------------
  function manifestDigestInput(m) {
    return JSON.stringify([
      m.format, m.formatVersion, m.backupId, m.owner && m.owner.id, m.createdAt,
      (m.tables || []).map(t => [t.table, t.section, t.mode, t.count, t.sha256]),
      ((m.attachments && m.attachments.files) || []).map(a => [a.path, a.sha256, a.size])
    ]);
  }

  // ---- attachments ------------------------------------------------------------------------
  // Logos uploaded by the app live at .../storage/v1/object/public/company-logos/<owner id>/...
  function logoPathFromUrl(url, ownerId) {
    const m = String(url || "").match(/\/storage\/v1\/object\/(?:public\/)?company-logos\/([^?#]+)/);
    if (!m) return "";
    let path;
    try { path = decodeURIComponent(m[1]); } catch (_) { return ""; }
    if (!path.startsWith(String(ownerId) + "/") || path.includes("..") || !/^[A-Za-z0-9_.\/-]+$/.test(path)) return "";
    return path;
  }
  function imageTypeOf(bytes) {
    const b = bytes;
    if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
    if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
    if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
    if (b.length > 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "image/gif";
    return "";
  }

  // =====================================================================================
  // Backup
  // =====================================================================================
  async function createBackup(deps, opts = {}) {
    const { password = "", onProgress = () => {}, signal } = opts;
    const lib = zipLib(deps);
    onProgress({ step: "start", done: 0, total: 1 });
    const begin = unwrap(await deps.rpc("app_user_backup_begin", {}));
    if (!begin || begin.ok !== true || begin.format !== FORMAT) throw new BackupError("server", "The server could not start the backup.");
    const ownerId = String(begin.owner && begin.owner.id || "");
    const tables = Array.isArray(begin.tables) ? begin.tables : [];
    const expected = tables.reduce((n, t) => n + (Number(t.count) || 0), 0);
    const zipFiles = {};
    const manifestTables = [];
    const logoUrls = new Set();
    if (begin.profile && begin.profile.logo_url) logoUrls.add(begin.profile.logo_url);
    let exported = 0;

    for (const t of tables) {
      checkAbort(signal);
      const lines = [];
      let after = null;
      for (;;) {
        checkAbort(signal);
        const page = unwrap(await deps.rpc("app_user_backup_export_page", { p_table: t.table, p_after: after, p_limit: PAGE_SIZE }));
        const got = Array.isArray(page && page.lines) ? page.lines : [];
        for (const l of got) lines.push(typeof l === "string" ? l : JSON.stringify(l));
        exported += got.length;
        onProgress({ step: "export", table: t.table, section: t.section, done: exported, total: Math.max(expected, exported) });
        if (!page || page.done || !got.length) break;
        after = page.last;
      }
      // Logos referenced by records (wallet logos and similar).
      if (lines.length && /expense_accounts|insurance_companies|accounting_contacts/.test(t.table)) {
        for (const l of lines) {
          try {
            const r = JSON.parse(l).r || {};
            if (r.custom_logo_url) logoUrls.add(r.custom_logo_url);
            if (r.logo_url) logoUrls.add(r.logo_url);
          } catch (_) {}
        }
      }
      const text = lines.length ? lines.join("\n") + "\n" : "";
      const bytes = enc.encode(text);
      const file = `data/${t.section}/${t.table}.ndjson`;
      zipFiles[file] = bytes;
      manifestTables.push({
        table: t.table, section: t.section, mode: t.mode, order: t.order, count: lines.length,
        file, bytes: bytes.length, sha256: await sha256Hex(bytes),
        key: t.key || ["id"], parents: Array.isArray(t.parents) ? t.parents : [], wholeParent: t.wholeParent || null
      });
    }

    // Attachments: original files, only from this account's own storage folder.
    const attachmentFiles = [];
    const missing = [];
    let n = 0;
    for (const url of logoUrls) {
      checkAbort(signal);
      const path = logoPathFromUrl(url, ownerId);
      if (!path || attachmentFiles.length >= LIMITS.attachments) continue;
      n += 1;
      onProgress({ step: "attachments", done: n, total: logoUrls.size });
      let res = null;
      try { res = await deps.fetchFile(path); } catch (_) { res = null; }
      if (!res || !res.ok || !res.bytes || res.bytes.length > LIMITS.attachmentBytes) { missing.push(path); continue; }
      const type = imageTypeOf(res.bytes);
      if (!type) { missing.push(path); continue; }
      const zpath = `attachments/${LOGO_BUCKET}/${path}`;
      zipFiles[zpath] = [res.bytes, { level: 0 }];
      attachmentFiles.push({ path, file: zpath, size: res.bytes.length, type, sha256: await sha256Hex(res.bytes), url });
    }

    const createdAt = String(begin.createdAt || new Date().toISOString());
    const manifest = {
      format: FORMAT,
      formatVersion: FORMAT_VERSION,
      schemaVersion: Number(begin.schemaVersion) || 205,
      app: { name: "Triplem VIP", version: String(deps.appVersion || ""), platform: String(deps.platform || "web") },
      backupId: String(begin.backupId),
      createdAt,
      owner: { id: ownerId, username: String(begin.owner && begin.owner.username || ""), displayName: String(begin.owner && begin.owner.displayName || "") },
      encrypted: false,
      totals: { records: manifestTables.reduce((a, t) => a + t.count, 0), attachments: attachmentFiles.length },
      tables: manifestTables,
      attachments: { bucket: LOGO_BUCKET, files: attachmentFiles, missing },
      excluded: [
        "Passwords, PINs, two-factor keys, passkeys, recovery keys and sign-in sessions (security)",
        "Notifications and device push subscriptions (recreated automatically)",
        "Support conversations with Triplem VIP staff (shared with staff)",
        "Subscription and payment requests (billing records kept by Triplem VIP)",
        "Team members' own accounts and the Triplem AI API key"
      ],
      restoreRules: "Restore adds only records that are missing from this account. Existing records are never changed or deleted."
    };
    manifest.digest = await sha256Hex(enc.encode(manifestDigestInput(manifest)));
    onProgress({ step: "sign", done: 0, total: 1 });
    const signed = unwrap(await deps.rpc("app_user_backup_sign_manifest", { p_backup_id: manifest.backupId, p_digest: manifest.digest }));
    if (!signed || !signed.signature) throw new BackupError("server", "The server could not sign the backup.");
    manifest.signature = signed.signature;

    zipFiles["manifest.json"] = enc.encode(JSON.stringify(manifest, null, 2));
    zipFiles["profile.json"] = enc.encode(JSON.stringify(begin.profile || {}, null, 2));
    zipFiles["README.txt"] = enc.encode(readmeText(manifest));
    onProgress({ step: "zip", done: 0, total: 1 });
    let zipped = await zipAsync(lib, zipFiles);

    // Validate the finished file exactly as a restore would read it.
    onProgress({ step: "verify", done: 0, total: 1 });
    const check = await readBackup(deps, zipped, {});
    if (check.manifest.digest !== manifest.digest || check.manifest.totals.records !== manifest.totals.records) {
      throw new BackupError("verify", "The backup could not be verified after it was created. Nothing was downloaded.");
    }

    if (password) {
      const aad = `${FORMAT}|${manifest.backupId}|${ownerId}`;
      const sealed = await encryptBytes(zipped, password, aad);
      const outer = {
        format: FORMAT, formatVersion: FORMAT_VERSION, schemaVersion: manifest.schemaVersion, app: manifest.app,
        backupId: manifest.backupId, createdAt, owner: manifest.owner, encrypted: true,
        totals: manifest.totals, kdf: sealed.kdf, cipher: sealed.cipher
      };
      const protectedZip = await zipAsync(lib, {
        "manifest.json": enc.encode(JSON.stringify(outer, null, 2)),
        "README.txt": enc.encode(readmeText(outer)),
        "payload.bin": [sealed.data, { level: 0 }]
      });
      const again = await readBackup(deps, protectedZip, { password });
      if (again.manifest.digest !== manifest.digest) throw new BackupError("verify", "The protected backup could not be verified. Nothing was downloaded.");
      zipped = protectedZip;
    }
    onProgress({ step: "done", done: 1, total: 1 });
    const stamp = createdAt.replace(/[:T]/g, "-").slice(0, 16);
    const who = (manifest.owner.username || "account").replace(/[^A-Za-z0-9_-]/g, "") || "account";
    return { bytes: zipped, filename: `Triplem-VIP-backup-${who}-${stamp}.zip`, manifest };
  }

  function readmeText(m) {
    return [
      "Triplem VIP backup",
      "==================",
      "",
      `Account: ${m.owner && m.owner.username || ""}`,
      `Created: ${m.createdAt}`,
      `Records: ${m.totals ? m.totals.records : ""}   Attachments: ${m.totals ? m.totals.attachments : ""}`,
      m.encrypted ? "This backup is protected with a password. You need that password to restore it." : "",
      "",
      "Restore it in Triplem VIP: Account menu > Backup & Restore > Restore from a backup.",
      "You will see exactly which records are new before anything is added.",
      "Restoring never changes or deletes records that already exist in your account.",
      "",
      "Keep this file private: it contains your business records.",
      "Do not edit the files inside; edited records are rejected when restoring."
    ].filter(x => x !== null).join("\r\n");
  }

  // =====================================================================================
  // Read + validate a backup file
  // =====================================================================================
  async function readBackup(deps, bytes, opts = {}) {
    const lib = zipLib(deps);
    const { password = "", onProgress } = opts;
    let { files, ignored } = await safeUnzip(lib, bytes, { onProgress });
    let manifest = parseManifest(files.get("manifest.json"));
    let encrypted = false;
    if (manifest.encrypted === true) {
      encrypted = true;
      if (!password) throw new BackupError("needs_password", "This backup is protected with a password.");
      const payload = files.get("payload.bin");
      if (!payload) throw new BackupError("incomplete", "The protected backup is incomplete.");
      const aad = String(manifest.cipher && manifest.cipher.aad || "");
      if (aad !== `${FORMAT}|${manifest.backupId}|${manifest.owner && manifest.owner.id}`) throw new BackupError("corrupt", "The protected backup does not match its description.");
      const inner = await decryptBytes(payload, password, manifest);
      ({ files, ignored } = await safeUnzip(lib, inner, {}));
      const outerOwner = manifest.owner && manifest.owner.id;
      manifest = parseManifest(files.get("manifest.json"));
      if (manifest.encrypted || (manifest.owner && manifest.owner.id) !== outerOwner) throw new BackupError("corrupt", "The protected backup does not match its description.");
    }
    // Every data file must match its hash and record count.
    for (const t of manifest.tables) {
      const data = files.get(t.file);
      if (!data) throw new BackupError("incomplete", `The backup is incomplete (${t.file} is missing).`);
      if (data.length !== t.bytes || await sha256Hex(data) !== t.sha256) throw new BackupError("tampered", `The backup was changed after it was created (${t.file}).`);
    }
    for (const a of manifest.attachments.files) {
      const data = files.get(a.file);
      if (!data || data.length !== a.size || await sha256Hex(data) !== a.sha256) throw new BackupError("tampered", "An attachment in the backup was changed or is missing.");
    }
    const digest = await sha256Hex(enc.encode(manifestDigestInput(manifest)));
    if (digest !== manifest.digest) throw new BackupError("tampered", "The backup description was changed after it was created.");
    return { manifest, files, encrypted, ignored };
  }

  function parseManifest(bytes) {
    if (!bytes) throw new BackupError("not_backup", "This ZIP is not a Triplem VIP backup (manifest.json is missing).");
    let m;
    try { m = JSON.parse(dec.decode(bytes)); } catch (_) { throw new BackupError("corrupt", "The backup description (manifest.json) is damaged."); }
    if (!m || m.format !== FORMAT) throw new BackupError("not_backup", "This ZIP is not a Triplem VIP backup.");
    if (!Number.isInteger(m.formatVersion) || m.formatVersion < 1) throw new BackupError("unsupported", "This backup format is not supported.");
    if (m.formatVersion > FORMAT_VERSION) throw new BackupError("newer", "This backup was made by a newer version of Triplem VIP. Refresh the page (or update the app) and try again.");
    if (!m.owner || !UUID_RE.test(String(m.owner.id || "")) || !UUID_RE.test(String(m.backupId || ""))) throw new BackupError("corrupt", "The backup description is incomplete.");
    if (m.encrypted === true) return m;
    if (!Array.isArray(m.tables) || !m.attachments || !Array.isArray(m.attachments.files) || !/^[0-9a-f]{64}$/.test(String(m.digest || "")) || !m.signature) {
      throw new BackupError("corrupt", "The backup description is incomplete.");
    }
    const seen = new Set();
    for (const t of m.tables) {
      if (!t || !/^[a-z_]+$/.test(String(t.table)) || !/^[a-z_]+$/.test(String(t.section)) || !["data", "settings", "history"].includes(t.mode)
        || t.file !== `data/${t.section}/${t.table}.ndjson` || !Number.isInteger(t.count) || t.count < 0 || !/^[0-9a-f]{64}$/.test(String(t.sha256)) || seen.has(t.table)) {
        throw new BackupError("corrupt", "The backup description is damaged.");
      }
      seen.add(t.table);
    }
    for (const a of m.attachments.files) {
      if (!a || !safeEntryName(a.file) || a.file !== `attachments/${LOGO_BUCKET}/${a.path}` || !/^[0-9a-f]{64}$/.test(String(a.sha256))) {
        throw new BackupError("corrupt", "The backup description is damaged.");
      }
    }
    return m;
  }

  // Server check: the signature proves the backup was made by Triplem VIP for
  // this account and was not changed.
  async function verifyWithServer(deps, manifest) {
    if (String(deps.currentUserId || "") && manifest.owner.id !== String(deps.currentUserId)) {
      throw new BackupError("other_account", `This backup belongs to another Triplem VIP account (${manifest.owner.username || "unknown"}). You can only restore your own backups.`);
    }
    const res = unwrap(await deps.rpc("app_user_backup_verify_manifest", { p_backup_id: manifest.backupId, p_owner_id: manifest.owner.id, p_digest: manifest.digest, p_signature: manifest.signature }));
    if (!res || res.ok !== true) {
      if (res && res.reason === "other_account") throw new BackupError("other_account", "This backup belongs to another Triplem VIP account. You can only restore your own backups.");
      throw new BackupError("tampered", "This backup could not be verified. It was changed after it was created or was not made by Triplem VIP.");
    }
    return true;
  }

  // =====================================================================================
  // Analyse: compare every record with the account
  // =====================================================================================
  function batches(lines, maxLines = BATCH_LINES, maxBytes = BATCH_BYTES) {
    const out = [];
    let cur = [];
    let size = 0;
    for (const item of lines) {
      const len = item.line.length;
      if (cur.length && (cur.length >= maxLines || size + len > maxBytes)) { out.push(cur); cur = []; size = 0; }
      cur.push(item);
      size += len;
    }
    if (cur.length) out.push(cur);
    return out;
  }

  async function analyze(deps, backup, opts = {}) {
    const { onProgress = () => {}, signal } = opts;
    const { manifest, files } = backup;
    const total = manifest.tables.reduce((n, t) => n + t.count, 0);
    const tables = [];
    const byTable = new Map();
    let done = 0;
    for (const t of manifest.tables.slice().sort((a, b) => (a.order || 0) - (b.order || 0))) {
      checkAbort(signal);
      const text = dec.decode(files.get(t.file) || new Uint8Array());
      const lines = splitLines(text);
      if (lines.length !== t.count) throw new BackupError("tampered", `The backup was changed after it was created (${t.table}).`);
      const recs = lines.map((line, i) => {
        let row = {};
        try { row = JSON.parse(line).r || {}; } catch (_) { row = {}; }
        return { table: t.table, section: t.section, mode: t.mode, i, line, row, key: rowKey(row, t.key), st: t.mode === "history" ? "history" : "pending", why: "", p: null, deps: [], dependents: [], selected: false, component: false };
      });
      if (t.mode !== "history") {
        for (const batch of batches(recs.map(r => ({ line: r.line, rec: r })))) {
          checkAbort(signal);
          const res = unwrap(await deps.rpc("app_user_backup_analyze", { p_table: t.table, p_lines: batch.map(b => b.line) }));
          const results = Array.isArray(res && res.results) ? res.results : [];
          if (results.length !== batch.length) throw new BackupError("server", "The server could not check this backup.");
          results.forEach(r => {
            const rec = batch[r.i].rec;
            rec.st = r.st; rec.why = r.why || ""; rec.p = r.p || null;
          });
          done += batch.length;
          onProgress({ step: "analyze", table: t.table, done, total });
        }
      } else {
        done += recs.length;
        onProgress({ step: "analyze", table: t.table, done, total });
      }
      const entry = { ...t, records: recs };
      tables.push(entry);
      byTable.set(t.table, entry);
    }
    const model = { manifest, tables, byTable, attachments: [], files };
    resolveDependencies(model);
    defaultSelection(model);
    // Attachments: present in storage already, or missing (restorable).
    const atts = manifest.attachments.files;
    let k = 0;
    for (const a of atts) {
      checkAbort(signal);
      let exists = true;
      try { exists = await deps.fileExists(a.path); } catch (_) { exists = true; }
      model.attachments.push({ ...a, st: exists ? "existing" : "new", selected: !exists });
      k += 1;
      onProgress({ step: "attachments", done: k, total: atts.length });
    }
    return model;
  }

  function rowKey(row, key) {
    const cols = Array.isArray(key) && key.length ? key : ["id"];
    return cols.filter(c => c !== "owner_id").map(c => String(row[c] ?? "")).join("\u001f");
  }

  // Links each new record to the new records it needs (its parents), marks
  // records whose parent is missing everywhere, and records that are parts of
  // a parent (lines, payments) as components.
  function resolveDependencies(model) {
    const idx = new Map(); // "table|col" -> Map(value -> record)
    const index = (table, col) => {
      const k = `${table}|${col}`;
      if (!idx.has(k)) {
        const m = new Map();
        const t = model.byTable.get(table);
        if (t) for (const r of t.records) { const v = r.row[col]; if (v !== undefined && v !== null) m.set(String(v), r); }
        idx.set(k, m);
      }
      return idx.get(k);
    };
    for (const t of model.tables) {
      for (const r of t.records) {
        if (r.st !== "new") continue;
        for (const fk of t.parents || []) {
          const v = r.row[fk.col];
          if (v === null || v === undefined || fk.col === "owner_id") continue;
          const prob = r.p && r.p[fk.col];
          if (!prob) continue; // parent exists in the account
          if (prob === "deleted") { r.st = "conflict"; r.why = "parent_deleted"; break; }
          const parent = index(fk.table, fk.ref).get(String(v));
          if (!parent) { r.st = "blocked"; r.why = "parent_missing"; break; }
          if (parent === r) continue;
          r.deps.push(parent);
          parent.dependents.push(r);
          if (t.wholeParent && fk.col === t.wholeParent) { r.component = true; r.wholeParentRec = parent; parent.components = (parent.components || []).concat(r); }
        }
      }
    }
    // A record whose parent cannot be restored cannot be restored either, and
    // a journal/document cannot be restored without all of its lines.
    let changed = true;
    while (changed) {
      changed = false;
      for (const t of model.tables) for (const r of t.records) {
        if (r.st !== "new") continue;
        const bad = r.deps.find(p => p.st !== "new");
        if (bad) { r.st = "blocked"; r.why = bad.st === "existing" ? "parent_conflict" : "parent_" + (bad.st === "blocked" ? "missing" : bad.st); changed = true; continue; }
        const brokenPart = (r.components || []).find(c => c.st !== "new");
        if (brokenPart) { r.st = "blocked"; r.why = "part_blocked"; changed = true; }
      }
    }
  }

  function defaultSelection(model) {
    for (const t of model.tables) for (const r of t.records) {
      r.selected = t.mode === "data" && r.st === "new" && !r.component && !isDeletedRow(r);
    }
    for (const t of model.tables) for (const r of t.records) if (r.selected) selectWithParents(r);
    syncComponents(model);
  }
  const isDeletedRow = r => r.row && (r.row.is_deleted === true);
  const selectable = r => r.st === "new" && !r.component && r.mode !== "history";

  function selectWithParents(r) {
    const stack = [r];
    while (stack.length) {
      const x = stack.pop();
      if (x.st !== "new") continue;
      if (!x.selected) x.selected = true;
      for (const p of x.deps) if (!p.selected && p.st === "new") stack.push(p);
    }
  }
  function unselectWithDependents(r) {
    const stack = [r];
    while (stack.length) {
      const x = stack.pop();
      x.selected = false;
      for (const c of x.dependents) if (c.selected) stack.push(c);
      // A line/payment cannot be left out of its journal or document.
      if (x.component && x.wholeParentRec && x.wholeParentRec.selected) stack.push(x.wholeParentRec);
    }
  }
  // Components (journal lines, document lines, payments, depreciation
  // history) are restored exactly when their parent is.
  function syncComponents(model) {
    for (const t of model.tables) for (const r of t.records) {
      if (!r.component) continue;
      r.selected = !!(r.wholeParentRec && r.wholeParentRec.selected && r.st === "new");
      if (r.selected) selectWithParents(r);
    }
  }
  function setSelected(model, r, on) {
    if (!selectable(r)) return;
    if (on) selectWithParents(r); else unselectWithDependents(r);
    syncComponents(model);
  }

  // "Also add missing settings": selects every new setting (never existing ones).
  function setSettingsIncluded(model, on) {
    for (const t of model.tables) if (t.mode === "settings") for (const r of t.records) r.selected = !!on && r.st === "new";
  }

  function summary(model) {
    const sections = new Map();
    const tot = { found: 0, new: 0, existing: 0, deleted: 0, conflicts: 0, history: 0, selected: 0, components: 0, settings: 0 };
    for (const t of model.tables) {
      const s = sections.get(t.section) || { section: t.section, mode: t.mode, found: 0, new: 0, existing: 0, deleted: 0, conflicts: 0, history: 0, selected: 0 };
      for (const r of t.records) {
        s.found += 1; tot.found += 1;
        if (r.st === "new") { s.new += 1; tot.new += 1; }
        else if (r.st === "existing") { s.existing += 1; tot.existing += 1; }
        else if (r.st === "deleted") { s.deleted += 1; tot.deleted += 1; }
        else if (r.st === "history") { s.history += 1; tot.history += 1; }
        else { s.conflicts += 1; tot.conflicts += 1; }
        if (r.selected) { s.selected += 1; tot.selected += 1; if (r.component) tot.components += 1; if (t.mode === "settings") tot.settings += 1; }
      }
      sections.set(t.section, s);
    }
    tot.attachments = model.attachments.length;
    tot.attachmentsMissing = model.attachments.filter(a => a.st === "new").length;
    tot.attachmentsSelected = model.attachments.filter(a => a.selected).length;
    return { totals: tot, sections: [...sections.values()] };
  }

  // =====================================================================================
  // Restore
  // =====================================================================================
  // Parents before children inside one table (accounts under accounts,
  // reversal journals after the journal they reverse, credit notes after the
  // invoice they correct).
  function orderWithinTable(records) {
    const set = new Set(records);
    const out = [];
    const state = new Map();
    const visit = r => {
      if (state.get(r) === 2) return;
      if (state.get(r) === 1) return; // cycle: keep original order
      state.set(r, 1);
      for (const p of r.deps) if (set.has(p) && p.table === r.table) visit(p);
      state.set(r, 2);
      out.push(r);
    };
    records.forEach(visit);
    return out;
  }

  async function restore(deps, model, opts = {}) {
    const { includeSettings = false, onProgress = () => {}, signal, batchLines = BATCH_LINES } = opts;
    const backupId = model.manifest.backupId;
    const work = [];
    for (const t of model.tables) {
      if (t.mode === "history") continue;
      if (t.mode === "settings" && !includeSettings) continue;
      const recs = t.records.filter(r => r.selected && r.st === "new");
      if (recs.length) work.push({ t, recs: orderWithinTable(recs) });
    }
    const totalRecords = work.reduce((n, w) => n + w.recs.length, 0);
    const result = { restored: 0, skipped: 0, attention: 0, processed: 0, total: totalRecords, items: [], attachments: { restored: 0, skipped: 0, failed: 0 }, stopped: false };
    const failedKeys = new Set();
    for (const w of work) {
      for (const batch of batches(w.recs.map(r => ({ line: r.line, rec: r })), batchLines)) {
        if (signal && signal.aborted) { result.stopped = true; break; }
        // Children of a parent that could not be restored are reported, not sent.
        const send = [];
        for (const b of batch) {
          const failedParent = b.rec.deps.find(p => failedKeys.has(p));
          if (failedParent) {
            b.rec.result = "attention"; b.rec.resultWhy = "parent_failed";
            failedKeys.add(b.rec);
            result.attention += 1; result.processed += 1;
            result.items.push(resultItem(b.rec));
          } else send.push(b);
        }
        if (send.length) {
          const res = unwrap(await deps.rpc("app_user_backup_restore", { p_table: w.t.table, p_lines: send.map(b => b.line), p_backup_id: backupId, p_include_settings: !!includeSettings }));
          const results = Array.isArray(res && res.results) ? res.results : [];
          if (results.length !== send.length) throw new BackupError("server", "The server stopped while restoring. Nothing was overwritten; run the restore again to continue.");
          results.forEach(r => {
            const rec = send[r.i].rec;
            rec.result = r.res;
            rec.resultWhy = r.why || r.st || "";
            if (r.res === "restored") { result.restored += 1; rec.st = "existing"; rec.restored = true; }
            else if (r.res === "skipped") { result.skipped += 1; rec.st = "existing"; }
            else { result.attention += 1; failedKeys.add(rec); result.items.push(resultItem(rec)); }
            result.processed += 1;
          });
        }
        onProgress({ step: "restore", table: w.t.table, section: w.t.section, ...countsOf(result) });
      }
      if (result.stopped) break;
    }
    // Missing logo files, only after the records are back.
    if (!result.stopped) {
      for (const a of model.attachments.filter(x => x.selected && x.st === "new")) {
        if (signal && signal.aborted) { result.stopped = true; break; }
        const bytes = model.files ? model.files.get(a.file) : null;
        try {
          const ok = bytes && imageTypeOf(bytes) && await deps.uploadFile(a.path, bytes, imageTypeOf(bytes));
          if (ok === "exists") result.attachments.skipped += 1;
          else if (ok) { result.attachments.restored += 1; a.st = "existing"; }
          else result.attachments.failed += 1;
        } catch (_) { result.attachments.failed += 1; }
        onProgress({ step: "attachments", ...countsOf(result) });
      }
    }
    try {
      await deps.rpc("app_user_backup_finish", { p_backup_id: backupId, p_kind: "restore", p_summary: { restored: result.restored, skipped: result.skipped, attention: result.attention, attachments: result.attachments, stopped: result.stopped } });
    } catch (_) {}
    return result;
  }
  const countsOf = r => ({ done: r.processed, total: r.total, restored: r.restored, skipped: r.skipped, attention: r.attention });
  const resultItem = rec => ({ table: rec.table, section: rec.section, key: rec.key, why: rec.resultWhy, row: rec.row });

  return Object.freeze({
    FORMAT, FORMAT_VERSION, LIMITS, BackupError,
    createBackup, readBackup, verifyWithServer, analyze, restore, summary,
    setSelected, setSettingsIncluded, selectable, syncComponents,
    _test: Object.freeze({ safeEntryName, safeUnzip, logoPathFromUrl, imageTypeOf, manifestDigestInput, splitLines, encryptBytes, decryptBytes, orderWithinTable, resolveDependencies, batches })
  });
});
