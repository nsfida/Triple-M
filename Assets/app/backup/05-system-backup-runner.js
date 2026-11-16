/* Triplem VIP - System Backup & Restore runner (2026-11-10).
 *
 * Orchestrates a system backup and a system restore on top of the format in
 * 04-system-backup-engine.js. Everything that touches the network comes in
 * through `deps`, so the same code runs in the browser and in Node tests:
 *   deps.rpc(name, args)                         database function (protected Main Admin session)
 *   deps.fflate                                  deflate / inflate
 *   deps.fetchAttachment(meta)  -> Uint8Array    R2 file through the file-storage Edge Function
 *   deps.fetchLogo(path)        -> Uint8Array|null   company-logos Storage file
 *   deps.uploadAttachment(restoreId, meta, bytes) -> { status }   R2 restore through the Edge Function
 *   deps.logoExists(path) / deps.uploadLogo(path, bytes, type) -> true | "exists" | false
 *
 * Backup: reads page by page and writes one owner at a time, so memory holds
 * at most one table file of one owner (plus one attachment) at any moment.
 * Restore: never sends any SQL; only rows go to app_system_restore_apply,
 * which adds missing rows and journals every outcome.
 */
(function (root, factory) {
  const engine = (typeof module === "object" && module.exports) ? require("./04-system-backup-engine.js") : root.TriplemSystemBackupEngine;
  const api = factory(engine);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TriplemSystemBackupRunner = api;
})(typeof self !== "undefined" ? self : this, function (E) {
  "use strict";
  const { ROOT, SystemBackupError } = E;
  const enc = new TextEncoder();
  const dec = new TextDecoder("utf-8", { fatal: false });
  const PAGE = 1000;

  function unwrap(v) {
    let x = v;
    for (let i = 0; i < 3 && typeof x === "string"; i++) { try { x = JSON.parse(x); } catch (_) { break; } }
    if (Array.isArray(x) && x.length === 1 && x[0] && typeof x[0] === "object") x = x[0];
    return x;
  }
  const checkAbort = s => { if (s && s.aborted) throw new SystemBackupError("aborted", "Stopped."); };
  const now = () => new Date().toISOString();

  // =====================================================================================
  // Backup
  // =====================================================================================
  // Module notes for the manifest. Inventory 2.0 products store an icon id only; the icon pack ships
  // with the app, so the backup records which pack version the ids refer to (never the icons).
  async function moduleInfo(deps, tableTotals) {
    const v2 = Object.entries(tableTotals).filter(([t]) => /^inventory_v2_/.test(t));
    const out = {};
    if (v2.length) {
      let pack = null;
      try { pack = deps.iconPack ? await deps.iconPack() : null; } catch (_) { pack = null; }
      out.inventoryV2 = {
        tables: v2.length,
        records: v2.reduce((a, [, n]) => a + Number(n || 0), 0),
        iconPack: pack && pack.version ? String(pack.version) : null,
        iconSource: pack && pack.source ? String(pack.source) : null,
        iconsInBackup: false
      };
    }
    return out;
  }

  // Version-2 folders
  const ownerRoot = o => `${o.kind === "business" ? "Companies" : "Individuals"}/${o.id}`;
  const SNAPSHOT_ROWS = 20000;   // accounts up to this size are read in one consistent snapshot

  async function createBackup(deps, { password, sink, readBack, includeCredentials = false, onProgress = () => {}, signal } = {}) {
    const problem = E.passwordProblem(password);
    if (problem) throw new SystemBackupError("weak_password", problem);
    const lib = deps.fflate;
    const rpc = async (n, a) => unwrap(await deps.rpc(n, a || {}));
    onProgress({ stage: "start" });
    const begin = await rpc("app_system_backup_begin_v2", { p_options: { credentials: !!includeCredentials } });
    if (!begin || begin.ok !== true || begin.format !== E.FORMAT) throw new SystemBackupError("server", "The server could not start the system backup.");
    const backupId = String(begin.backupId);
    const runId = String(begin.runId);
    const catalog = begin.catalog || [];
    const catByTable = new Map(catalog.map(c => [c.table, c]));
    const owners = begin.owners || [];
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const key = await E.deriveKey(password, salt);
    const writer = new E.ZipWriter(sink);
    const files = [];           // manifest file list
    const checksums = {};
    const warnings = [];
    const failures = [];
    const verification = { sealedAndReopened: 0, schemaChecks: [] };
    const totals = { users: 0, owners: owners.length, individuals: 0, businesses: 0, teamMembers: 0, records: 0, attachments: 0, attachmentBytes: 0, logos: 0, files: 0, systemRecords: 0, unattributedRecords: 0,
      credentialAccounts: 0, snapshotAccounts: 0, pagedAccounts: 0 };
    const accounts = [];        // User_Accounts/accounts.json: every sign-in account and where its data is
    const tableTotals = {};
    let lastBeat = Date.now();
    const beat = async (stage, extra) => {
      if (Date.now() - lastBeat < 15000 && !extra) return;
      lastBeat = Date.now();
      try { await rpc("app_system_backup_progress", { p_run_id: runId, p_stage: stage, p_summary: extra || null }); } catch (_) {}
    };

    const addFile = async (path, plain, meta) => {
      checkAbort(signal);
      const sha = await E.sha256Hex(plain);
      if (E.isPlainV2(path)) {
        // Schema SQL and its guide: stored as they are (no records, no secrets) so they can be run
        // directly; their SHA-256 is in the encrypted manifest.
        await writer.add(E.zipName(2, path), plain);
      } else {
        const sealed = await E.seal(lib, key, backupId, path, plain, { compress: meta.kind !== "attachment" || !/\.(jpg|jpeg|png|webp)$/i.test(path) });
        // Re-open immediately: proves the sealed copy decrypts to exactly these bytes.
        const back = await E.open(lib, key, backupId, path, sealed, plain.length);
        if (back.length !== plain.length || await E.sha256Hex(back) !== sha) throw new SystemBackupError("verify", `A file could not be verified while writing (${path}).`);
        verification.sealedAndReopened += 1;
        await writer.add(E.zipName(2, path), sealed);
      }
      if (meta.kind !== "meta") { files.push({ path, size: plain.length, sha256: sha, ...meta }); checksums[path] = sha; }
      totals.files += 1;
      return sha;
    };

    // Plain header and README first (no secrets: the key check is an encrypted constant).
    const createdAt = String(begin.createdAt || now());
    const header = {
      format: E.FORMAT, formatVersion: E.FORMAT_VERSION, backupId, createdAt,
      app: { name: "Triplem VIP", version: String(deps.appVersion || ""), platform: String(deps.platform || "web") },
      encryption: { kdf: "PBKDF2-SHA-256", iterations: E.PBKDF2_ITERATIONS, salt: E.b64(salt), cipher: "AES-256-GCM", perFile: true,
                    keyCheck: await E.makeKeyCheck(lib, key, backupId) },
      note: "Every file except this header and README.txt is encrypted. The password is required to read or restore it."
    };
    await writer.add(E.zipName(2, E.LAYOUT[2].header), enc.encode(JSON.stringify(header, null, 2)));
    await writer.add(E.zipName(2, E.LAYOUT[2].readme), enc.encode(readme(header, !!begin.credentials)));

    // ---- 1. Database schema (10 files) ----
    onProgress({ stage: "schema" });
    const partA = await rpc("app_system_schema_export", { p_from: 1, p_to: 16 });
    const partB = await rpc("app_system_schema_export", { p_from: 17, p_to: 20 });
    const objects = [...(partA.objects || []), ...(partB.objects || [])];
    const coverage = partB.coverage || partA.coverage || {};
    const schemaMeta = { backupId, generatedAt: String(partA.generatedAt || createdAt), serverVersion: String(coverage.server_version || ""), schemaComment: coverage.schema_comment ?? null,
      adminId: begin.createdBy && begin.createdBy.id, adminUsername: begin.createdBy && begin.createdBy.username };
    const schemaFiles = E.buildSchemaFilesV2(objects, schemaMeta, coverage);
    // Coverage: every object counted in the live catalog appears in the package.
    const count = kind => objects.filter(o => o.kind === kind).length;
    const checks = [
      ["tables", count("table"), coverage.tables],
      ["views", count("view"), coverage.views],
      ["materialized views", count("materialized_view"), coverage.materialized_views],
      ["functions", count("function"), coverage.functions],
      ["triggers", count("trigger"), coverage.triggers],
      ["policies", count("policy"), coverage.policies],
      ["constraints", count("constraint") + count("foreign_key"), coverage.constraints],
      ["extensions", count("extension"), coverage.extensions]
    ];
    for (const [name, got, want] of checks) {
      const ok = Number(got) === Number(want);
      verification.schemaChecks.push({ object: name, exported: got, live: want, ok });
      if (!ok) warnings.push(`Schema export: ${name} exported ${got}, live catalog has ${want}.`);
    }
    for (const f of schemaFiles) await addFile(`Database_Schema/${f.name}`, enc.encode(f.text), { kind: "schema", objects: f.objects, plain: true });
    await addFile("Database_Schema/INSTALL.md", enc.encode(E.schemaReadmeV2(schemaMeta, schemaFiles, coverage)), { kind: "schema-readme", plain: true });

    // ---- 2. Every owner's folder ----
    const exportTable = async (table, args) => {
      const lines = [];
      let after = null;
      for (;;) {
        checkAbort(signal);
        const page = await rpc("app_system_backup_export_page", { p_table: table, p_owner: args.owner || null, p_orphans: !!args.orphans, p_after: after, p_limit: PAGE });
        const got = Array.isArray(page && page.lines) ? page.lines : [];
        for (const l of got) lines.push(typeof l === "string" ? l : JSON.stringify(l));
        if (!page || page.done || !got.length) break;
        after = page.last;
      }
      return lines;
    };
    const ownerSummaries = [];
    let ownerNo = 0;
    for (const o of owners) {
      ownerNo += 1;
      checkAbort(signal);
      const oid = String(o.id);
      onProgress({ stage: "owners", owner: ownerNo, owners: owners.length, records: totals.records, attachments: totals.attachments, bytes: writer.offset });
      if (o.kind === "business") totals.businesses += 1; else totals.individuals += 1;
      const ownerFiles = [];
      const logoPaths = new Set();
      const attachments = [];
      const counts = {};
      const folder = ownerRoot({ id: oid, kind: o.kind });
      const ownerTables = catalog.filter(c => ["user", "team", "users"].includes(c.scope) && Number((o.tables || {})[c.table] || 0) > 0);
      const expectedRows = ownerTables.reduce((n, c) => n + Number(o.tables[c.table] || 0), 0);
      // One consistent snapshot of the whole account when it fits (a document and its lines,
      // an expense and its wallet are read at the same instant); otherwise page by page.
      let snap = null;
      if (expectedRows && expectedRows <= SNAPSHOT_ROWS) {
        try {
          const r = await rpc("app_system_backup_export_owner", { p_owner: oid, p_tables: ownerTables.map(c => c.table), p_max_rows: SNAPSHOT_ROWS + 5000 });
          if (r && r.ok && r.tables) snap = r.tables;
        } catch (_) { snap = null; }
      }
      if (snap) totals.snapshotAccounts += 1; else if (expectedRows) totals.pagedAccounts += 1;
      for (const c of ownerTables) {
        const expected = Number((o.tables || {})[c.table] || 0);
        const lines = snap ? (snap[c.table] || []).map(l => typeof l === "string" ? l : JSON.stringify(l)) : await exportTable(c.table, { owner: oid });
        if (!snap && lines.length !== expected) warnings.push(`${c.table} for ${o.username}: ${expected} records when the backup started, ${lines.length} exported (records changed during the backup; this account was read page by page).`);
        const groups = new Map();
        if (c.table === "app_users") {
          for (const l of lines) {
            const r = JSON.parse(l); const sec = r.id === oid ? "profile" : "team";
            if (!groups.has(sec)) groups.set(sec, []); groups.get(sec).push(l);
            accounts.push({ id: r.id, username: r.username, display_name: r.display_name || "", role: r.role, is_active: r.is_active,
              owner: oid, owner_kind: o.kind, member: sec === "team" ? "team" : "owner", folder });
          }
        } else groups.set(c.section, lines);
        for (const [section, ls] of groups) {
          const text = ls.join("\n") + "\n";
          const path = `${folder}/${section}/${c.table}.ndjson`;
          await addFile(path, enc.encode(text), { kind: "data", table: c.table, owner: oid, section, records: ls.length, mode: c.mode, scope: c.scope });
          ownerFiles.push(path);
          for (const p of E.logoPathsIn(text)) logoPaths.add(p);
          if (c.table === "app_users" && section === "team") totals.teamMembers += ls.length;
        }
        if (c.table === "app_attachments") {
          for (const l of lines) { const r = JSON.parse(l); if (r.status === "stored") attachments.push(r); }
        }
        counts[c.table] = lines.length;
        totals.records += lines.length;
        tableTotals[c.table] = (tableTotals[c.table] || 0) + lines.length;
      }
      totals.users += 1 + Number(o.team_members || 0);
      // Actual R2 files
      for (const a of attachments) {
        checkAbort(signal);
        const ext = E.EXT[a.stored_mime] || "bin";
        const path = `Storage_Files/${oid}/${a.module}/${a.id}.${ext}`;
        let bytes = null, why = "";
        try { bytes = await deps.fetchAttachment(a); } catch (e) { why = e && e.message || "download failed"; }
        if (bytes && Number(a.stored_size) && bytes.length !== Number(a.stored_size)) { why = `size ${bytes.length} does not match ${a.stored_size}`; bytes = null; }
        if (bytes && a.sha256 && await E.sha256Hex(bytes) !== String(a.sha256).toLowerCase()) { why = "checksum does not match the attachment record"; bytes = null; }
        if (!bytes || ext === "bin") {
          failures.push({ type: "attachment", id: a.id, owner: oid, username: o.username, module: a.module, record_id: a.record_id, reason: why || "unsupported file type" });
          continue;
        }
        await addFile(path, bytes, { kind: "attachment", owner: oid, attachment: { id: a.id, module: a.module, record_id: a.record_id, mime: a.stored_mime, width: a.stored_width, height: a.stored_height } });
        totals.attachments += 1; totals.attachmentBytes += bytes.length;
        onProgress({ stage: "owners", owner: ownerNo, owners: owners.length, records: totals.records, attachments: totals.attachments, bytes: writer.offset });
      }
      // Logos referenced by this owner's records (Supabase Storage, public bucket)
      for (const p of logoPaths) {
        checkAbort(signal);
        let bytes = null;
        try { bytes = await deps.fetchLogo(p); } catch (_) { bytes = null; }
        if (!bytes) { warnings.push(`Logo not found in storage (referenced by ${o.username}): ${p}`); continue; }
        await addFile(`Storage_Files/${oid}/company-logos/${p}`, bytes, { kind: "logo", owner: oid, logo: { path: p } });
        totals.logos += 1;
      }
      const summary = { id: oid, username: o.username, display_name: o.display_name, company_name: o.company_name, kind: o.kind, role: o.role,
        is_active: o.is_active, created_at: o.created_at, team_members: Number(o.team_members || 0), records: counts,
        attachments: attachments.length, files: ownerFiles, folder, consistentSnapshot: !!snap };
      await addFile(`${folder}/profile/summary.json`, enc.encode(JSON.stringify(summary, null, 2)), { kind: "summary", owner: oid });
      ownerSummaries.push({ id: oid, username: o.username, display_name: o.display_name || "", company_name: o.company_name || "", kind: o.kind, folder,
        team_members: Number(o.team_members || 0), records: Object.values(counts).reduce((a, b) => a + b, 0), attachments: attachments.length, snapshot: !!snap,
        sections: [...new Set(ownerTables.map(c => c.section).filter(x => x && x !== "profile"))] });
      await beat(`owners ${ownerNo}/${owners.length}`);
    }

    // ---- 3. System data and unattributed rows ----
    onProgress({ stage: "system", records: totals.records, attachments: totals.attachments, bytes: writer.offset });
    for (const c of catalog) {
      if (c.scope !== "system") continue;
      const lines = await exportTable(c.table, {});
      if (!lines.length) continue;
      const where = ["data", "settings"].includes(c.mode) ? "System_Configuration" : "Shared_Resources";
      await addFile(`${where}/${c.table}.ndjson`, enc.encode(lines.join("\n") + "\n"), { kind: "data", table: c.table, scope: "system", section: "system", records: lines.length, mode: c.mode });
      totals.systemRecords += lines.length;
      tableTotals[c.table] = (tableTotals[c.table] || 0) + lines.length;
    }
    for (const [table, n] of Object.entries(begin.orphans || {})) {
      const lines = await exportTable(table, { orphans: true });
      if (!lines.length) continue;
      await addFile(`Shared_Resources/Unattributed/${table}.ndjson`, enc.encode(lines.join("\n") + "\n"), { kind: "data", table, scope: "unattributed", section: "unattributed", records: lines.length, mode: "history" });
      totals.unattributedRecords += lines.length;
      warnings.push(`${lines.length} ${table} record(s) belong to an account that no longer exists; they are kept in Shared_Resources/Unattributed (not restored).`);
    }
    for (const t of begin.unclassified || []) warnings.push(`Table ${t} is new and not yet classified for system backups; it was not exported.`);

    // ---- 3b. Accounts index and (optional) sign-in credentials ----
    await addFile("User_Accounts/accounts.json", enc.encode(JSON.stringify({ accounts, owners: ownerSummaries.map(o => ({ id: o.id, username: o.username, kind: o.kind, folder: o.folder, team: accounts.filter(a => a.owner === o.id && a.member === "team").map(a => a.id) })) }, null, 1)),
      { kind: "accounts", records: accounts.length });
    if (begin.credentials) {
      onProgress({ stage: "system", records: totals.records, attachments: totals.attachments, bytes: writer.offset, credentials: true });
      let after = null, part = 0;
      for (;;) {
        checkAbort(signal);
        const page = await rpc("app_system_backup_credentials_page", { p_run_id: runId, p_after: after, p_limit: 500 });
        const got = Array.isArray(page && page.lines) ? page.lines.map(l => typeof l === "string" ? l : JSON.stringify(l)) : [];
        if (got.length) {
          part += 1;
          await addFile(`User_Accounts/credentials/part-${String(part).padStart(4, "0")}.ndjson`, enc.encode(got.join("\n") + "\n"), { kind: "credentials", records: got.length });
          totals.credentialAccounts += got.length;
        }
        if (!page || page.done || !got.length) break;
        after = page.last;
      }
    }

    // ---- 4. Manifest, checksums, verification report ----
    const status = failures.length || warnings.some(w => /^Schema export|not yet classified/.test(w)) ? "completed_with_warnings" : (warnings.length ? "completed_with_warnings" : "completed");
    const manifest = {
      format: E.FORMAT, formatVersion: E.FORMAT_VERSION, backupId, createdAt, completedAt: now(),
      app: header.app, schemaVersion: Number(begin.schemaVersion) || 229, database: begin.database || {},
      layout: "Database_Schema, System_Configuration, Companies/<id>, Individuals/<id>, User_Accounts, Shared_Resources, Storage_Files, Backup_Metadata",
      credentials: { included: !!begin.credentials, accounts: totals.credentialAccounts,
        contents: begin.credentials ? "bcrypt password hashes, Smart PIN hashes, passkey public keys, recovery-key and recovery-code hashes, authenticator (2FA) secrets" : null },
      consistency: { snapshotAccounts: totals.snapshotAccounts, pagedAccounts: totals.pagedAccounts,
        rule: "Each account is read in one consistent database snapshot (up to 20,000 records); larger accounts are read page by page and counted." },
      relationships: ownerSummaries.map(o => ({ owner: o.id, kind: o.kind, team: accounts.filter(a => a.owner === o.id && a.member === "team").map(a => a.id) })),
      createdBy: begin.createdBy || null,
      totals, tables: Object.entries(tableTotals).map(([table, records]) => ({ table, records, scope: catByTable.get(table)?.scope, mode: catByTable.get(table)?.mode })),
      catalog, owners: ownerSummaries,
      modules: await moduleInfo(deps, tableTotals),
      excluded: catalog.filter(c => c.scope === "excluded").map(c => ({ table: c.table, reason: c.reason })),
      schema: { files: E.SCHEMA_FILES_V2, coverage, objects: objects.length, plain: true },
      warnings, failures, status,
      restoreRules: "Restore never runs the SQL files and never deletes. Mode 'new' adds missing records only. Mode 'all' also updates records that differ from the backup, after saving their previous version (undo).",
      files
    };
    manifest.digest = await E.sha256Hex(enc.encode(E.manifestDigestInput(manifest)));
    await addFile(E.LAYOUT[2].checksums, enc.encode(JSON.stringify({ algorithm: "SHA-256", of: "decrypted file contents", files: checksums }, null, 1)), { kind: "meta" });
    await addFile(E.LAYOUT[2].report, enc.encode(JSON.stringify({
      createdAt: now(), backupId, filesWritten: files.length, everyFileReopenedAndHashed: verification.sealedAndReopened, schemaCoverage: verification.schemaChecks,
      attachmentFailures: failures.length, warnings: warnings.length }, null, 2)), { kind: "meta" });
    await addFile(E.LAYOUT[2].manifest, enc.encode(JSON.stringify(manifest, null, 1)), { kind: "meta" });
    onProgress({ stage: "finish", records: totals.records, attachments: totals.attachments, bytes: writer.offset });
    const written = await writer.finish();

    // ---- 5. Read the finished file back exactly as a restore would ----
    let post = null;
    if (readBack) {
      onProgress({ stage: "verify", done: 0, total: files.length });
      try {
        const src = await readBack();
        const arch = await E.openArchive(lib, src, password);
        if (arch.manifest.digest !== manifest.digest) throw new SystemBackupError("verify", "The finished archive does not match what was written.");
        post = await E.verifyArchive(arch, { onProgress: p => onProgress({ stage: "verify", ...p }), signal });
      } catch (e) {
        post = { ok: false, problems: [{ path: "*", problem: e.message }] };
      }
    }
    const finalStatus = post && !post.ok ? "failed" : status;
    try {
      await rpc("app_system_backup_finish", { p_run_id: runId, p_status: finalStatus, p_summary: {
        totals, warnings: warnings.length, failures: failures.slice(0, 200), bytes: written.bytes, entries: written.entries,
        verified: post ? post.ok : null, verifyProblems: post ? post.problems.slice(0, 50) : [] } });
    } catch (_) {}
    return { backupId, runId, manifest, status: finalStatus, bytes: written.bytes, verification: post, filename: `Triplem_VIP_Full_Backup_${createdAt.replace(/[:T]/g, "-").slice(0, 16)}.zip` };
  }

  function readme(h, credentials) {
    return [
      "Triplem VIP - FULL SYSTEM BACKUP", "================================", "",
      `Backup id: ${h.backupId}`, `Created:   ${h.createdAt}`, `Sign-in credentials included: ${credentials ? "yes (encrypted)" : "no"}`, "",
      "Folders:",
      "  Database_Schema/       10 SQL files that recreate the database structure in a NEW Supabase project",
      "                         (not encrypted: no records, no passwords, no keys), plus INSTALL.md",
      "  Companies/<id>/        every business account with its team, one folder per account",
      "  Individuals/<id>/      every individual account, one folder per account",
      "  User_Accounts/         every sign-in account and its owner" + (credentials ? "; the encrypted sign-in credentials" : ""),
      "  System_Configuration/  system settings and catalogues",
      "  Shared_Resources/      support, analytics and history (kept for reference)",
      "  Storage_Files/         receipts, invoices, PDFs and logos",
      "  Backup_Metadata/       this README, the header, the manifest, checksums and the verification report", "",
      "Everything outside Database_Schema and this README / header is encrypted with the backup password",
      "(AES-256-GCM, key derived with PBKDF2-SHA-256, 600,000 iterations). Without the password it cannot be read.", "",
      "Restore into this or another Triplem VIP database:",
      "  Triplem VIP > Main Admin > Backup > System Backup & Restore > Restore. Nothing is ever deleted.", "",
      "New Supabase project: follow Database_Schema/INSTALL.md (run 01 to 10 in the SQL editor, then restore this ZIP).", "",
      "Keep this file private and keep the password separately. Do not edit files inside the archive."
    ].join("\r\n");
  }

  // =====================================================================================
  // Restore
  // =====================================================================================
  // Restorable files, in safe order: organisations, owners' accounts, team
  // accounts, then every owner's tables in catalog order.
  // options.owners: Set of owner ids to restore (default: all). Their team accounts come with them.
  // options.sections: Set of data categories (expenses, loans, inventory, ...); account profiles and
  //   teams are always included for the selected owners. options.system === false skips system data.
  function restorePlan(manifest, options = {}) {
    const cat = new Map((manifest.catalog || []).map(c => [c.table, c]));
    const pickOwners = options.owners instanceof Set && options.owners.size ? options.owners : null;
    const sections = options.sections instanceof Set && options.sections.size ? options.sections : null;
    const dataFiles = manifest.files.filter(f => f.kind === "data" && cat.has(f.table) && ["data", "settings"].includes(cat.get(f.table).mode) && f.scope !== "unattributed")
      .filter(f => {
        if (f.scope === "system" || !f.owner) return options.system !== false;
        if (pickOwners && !pickOwners.has(f.owner)) return false;
        if (sections && !["profile", "team"].includes(f.section) && !sections.has(f.section)) return false;
        return true;
      });
    const order = c => (cat.get(c.table) || {}).order || 0;
    const step = f => f.table === "app_organizations" ? 0 : f.table === "app_users" ? (f.section === "profile" ? 1 : 2) : 3;
    const owners = (manifest.owners || []).map(o => o.id);
    const ownerIdx = new Map(owners.map((id, i) => [id, i]));
    return dataFiles.slice().sort((a, b) => step(a) - step(b) || (step(a) === 3 ? (ownerIdx.get(a.owner) - ownerIdx.get(b.owner)) : 0) || order(a) - order(b) || (ownerIdx.get(a.owner) ?? 0) - (ownerIdx.get(b.owner) ?? 0));
  }

  async function preview(deps, arch, { onProgress = () => {}, signal, options = {} } = {}) {
    const rpc = async (n, a) => unwrap(await deps.rpc(n, a || {}));
    const m = arch.manifest;
    const plan = restorePlan(m, options);
    const counts = { new: 0, same: 0, kept_live: 0, deleted_live: 0, conflict: 0, invalid: 0 };
    const byTable = {};
    const byOwner = {};
    const bySection = {};
    const conflicts = [];
    const total = plan.reduce((n, f) => n + (f.records || 0), 0);
    let done = 0;
    for (const f of plan) {
      checkAbort(signal);
      const lines = E.ndjsonLines(await arch.file(f.path));
      for (const batch of E.batchLines(lines)) {
        const res = await rpc("app_system_restore_analyze", { p_table: f.table, p_owner: f.owner || null, p_lines: batch });
        for (const r of (res && res.results) || []) {
          counts[r.st] = (counts[r.st] || 0) + 1;
          const t = byTable[f.table] = byTable[f.table] || { new: 0, same: 0, kept_live: 0, deleted_live: 0, conflict: 0, invalid: 0 };
          t[r.st] = (t[r.st] || 0) + 1;
          const ok = f.owner || "system";
          const ow = byOwner[ok] = byOwner[ok] || { new: 0, same: 0, kept_live: 0, deleted_live: 0, conflict: 0, invalid: 0 };
          ow[r.st] = (ow[r.st] || 0) + 1;
          const sk = f.section || "system";
          const se = bySection[sk] = bySection[sk] || { new: 0, same: 0, kept_live: 0, deleted_live: 0, conflict: 0, invalid: 0 };
          se[r.st] = (se[r.st] || 0) + 1;
          if ((r.st === "conflict" || r.st === "invalid") && conflicts.length < 500) {
            let id = "";
            try { id = JSON.parse(batch[r.i]).id || ""; } catch (_) {}
            conflicts.push({ table: f.table, owner: f.owner, id, reason: r.why });
          }
        }
        done += batch.length;
        onProgress({ stage: "preview", done, total });
      }
    }
    const atts = m.files.filter(f => f.kind === "attachment");
    const creds = m.files.filter(f => f.kind === "credentials");
    return {
      counts, byTable, byOwner, bySection, conflicts,
      owners: (m.owners || []).map(o => ({ id: o.id, username: o.username, display_name: o.display_name || "", company_name: o.company_name || "", kind: o.kind,
        team_members: o.team_members, records: o.records, attachments: o.attachments, sections: o.sections || [] })),
      credentials: { included: !!(m.credentials && m.credentials.included), accounts: creds.reduce((n, f) => n + (f.records || 0), 0) },
      archive: {
        backupId: m.backupId, createdAt: m.createdAt, createdBy: m.createdBy, app: m.app, status: m.status,
        users: m.totals.users, owners: m.totals.owners, individuals: m.totals.individuals, businesses: m.totals.businesses,
        teamMembers: m.totals.teamMembers, records: m.totals.records, systemRecords: m.totals.systemRecords,
        attachments: atts.length, attachmentBytes: atts.reduce((n, f) => n + f.size, 0), logos: m.files.filter(f => f.kind === "logo").length,
        schemaFiles: m.files.filter(f => f.kind === "schema").length, formatVersion: m.formatVersion, warnings: m.warnings || [], failures: m.failures || []
      },
      restorableRecords: total
    };
  }

  // options: { mode: "new" | "all", owners: Set, sections: Set, system: boolean, credentials: boolean }
  async function restore(deps, arch, { onProgress = () => {}, signal, options = {} } = {}) {
    const rpc = async (n, a) => unwrap(await deps.rpc(n, a || {}));
    const m = arch.manifest;
    const mode = options.mode === "all" ? "all" : "new";
    const optInfo = { mode, owners: options.owners instanceof Set ? [...options.owners] : null, sections: options.sections instanceof Set ? [...options.sections] : null,
      system: options.system !== false, credentials: options.credentials !== false };
    const begin = await rpc("app_system_restore_begin", { p_backup_id: m.backupId, p_info: { createdAt: m.createdAt, records: m.totals.records, attachments: m.totals.attachments, app: m.app, formatVersion: m.formatVersion, options: optInfo } });
    if (!begin || begin.ok !== true) throw new SystemBackupError(begin && begin.reason || "server", begin && begin.message || "The server could not start the restore.");
    const restoreId = begin.restoreId;
    const cat = new Map((m.catalog || []).map(c => [c.table, c]));
    const plan = restorePlan(m, options);
    const result = { restoreId, resumed: !!begin.resumed, mode, processed: 0, total: plan.reduce((n, f) => n + (f.records || 0), 0),
      outcomes: { restored: 0, updated: 0, same: 0, kept_live: 0, deleted_live: 0, conflict: 0, failed: 0, skipped: 0 },
      credentials: { restored: 0, skipped: 0, failed: 0, total: 0 },
      files: { restored: 0, present: 0, skipped: 0, failed: 0, total: 0 }, logos: { restored: 0, present: 0, failed: 0 }, stopped: false, errors: [] };
    const needFile = new Set();
    try {
      for (const f of plan) {
        if (signal && signal.aborted) { result.stopped = true; break; }
        const c = cat.get(f.table) || {};
        let rows = E.ndjsonLines(await arch.file(f.path)).map(line => ({ line, obj: (() => { try { return JSON.parse(line); } catch (_) { return {}; } })() }));
        rows = E.orderRows(rows, c.selfRefs || []);
        for (const batch of E.batchLines(rows.map(r => r.line))) {
          if (signal && signal.aborted) { result.stopped = true; break; }
          const res = await rpc("app_system_restore_apply", { p_restore_id: restoreId, p_table: f.table, p_owner: f.owner || null, p_lines: batch });
          const out = (res && res.results) || [];
          if (out.length !== batch.length) throw new SystemBackupError("server", "The server stopped while restoring. Nothing was overwritten; run the restore again to continue.");
          for (const r of out) {
            result.outcomes[r.res] = (result.outcomes[r.res] || 0) + 1;
            if (r.file) { try { needFile.add(JSON.parse(batch[r.i]).id); } catch (_) {} }
          }
          result.processed += batch.length;
          onProgress({ stage: "records", table: f.table, owner: f.owner, ...result.outcomes, done: result.processed, total: result.total });
        }
        if (result.stopped) break;
      }
      // Sign-in credentials: only for accounts this restore has just added (the server checks).
      const credFiles = m.files.filter(f => f.kind === "credentials");
      if (!result.stopped && credFiles.length && options.credentials !== false) {
        const owners = options.owners instanceof Set && options.owners.size ? options.owners : null;
        let allowed = null;
        if (owners) {
          const idx = JSON.parse(dec.decode(await arch.file("User_Accounts/accounts.json")));
          allowed = new Set((idx.accounts || []).filter(a => owners.has(a.owner)).map(a => a.id));
        }
        onProgress({ stage: "credentials", done: 0, total: credFiles.reduce((n, f) => n + (f.records || 0), 0) });
        for (const f of credFiles) {
          if (signal && signal.aborted) { result.stopped = true; break; }
          let lines = E.ndjsonLines(await arch.file(f.path));
          if (allowed) lines = lines.filter(l => { try { return allowed.has(JSON.parse(l).id); } catch (_) { return false; } });
          for (const batch of E.batchLines(lines, 200)) {
            const res = await rpc("app_system_restore_credentials", { p_restore_id: restoreId, p_lines: batch });
            for (const r of (res && res.results) || []) {
              result.credentials.total += 1;
              if (r.res === "restored") result.credentials.restored += 1; else if (r.res === "failed") result.credentials.failed += 1; else result.credentials.skipped += 1;
            }
            onProgress({ stage: "credentials", done: result.credentials.total });
          }
        }
      }
      // Attachment files: only for records the database now holds.
      if (!result.stopped) {
        const done = new Set(((await rpc("app_system_restore_files_done", { p_restore_id: restoreId })) || {}).ids || []);
        const atts = m.files.filter(f => f.kind === "attachment" && f.attachment && needFile.has(f.attachment.id));
        result.files.total = atts.length;
        for (const f of atts) {
          if (signal && signal.aborted) { result.stopped = true; break; }
          const a = f.attachment;
          if (done.has(a.id)) { result.files.skipped += 1; continue; }
          let outcome = "failed", reason = "";
          try {
            const bytes = await arch.file(f.path);
            const r = await deps.uploadAttachment(restoreId, { id: a.id, size: f.size, sha256: f.sha256 }, bytes);
            if (r && r.status === "restored") { outcome = "restored"; result.files.restored += 1; }
            else if (r && r.status === "present") { outcome = "same"; result.files.present += 1; }
            else if (r && r.status === "skipped") { outcome = "skipped"; reason = r.reason || ""; result.files.skipped += 1; }
            else { reason = (r && r.error) || "upload failed"; result.files.failed += 1; }
          } catch (e) { reason = e.message || "upload failed"; result.files.failed += 1; }
          try { await rpc("app_system_restore_record_file", { p_restore_id: restoreId, p_id: a.id, p_owner: f.owner, p_outcome: outcome, p_reason: reason || null }); } catch (_) {}
          onProgress({ stage: "files", done: result.files.restored + result.files.present + result.files.skipped + result.files.failed, total: atts.length });
        }
      }
      // Logos (public Storage bucket): only missing files are uploaded, never replaced.
      if (!result.stopped) {
        for (const f of m.files.filter(x => x.kind === "logo")) {
          if (signal && signal.aborted) { result.stopped = true; break; }
          try {
            if (await deps.logoExists(f.logo.path)) { result.logos.present += 1; continue; }
            const bytes = await arch.file(f.path);
            const type = /\.png$/i.test(f.path) ? "image/png" : /\.webp$/i.test(f.path) ? "image/webp" : /\.gif$/i.test(f.path) ? "image/gif" : "image/jpeg";
            const ok = await deps.uploadLogo(f.logo.path, bytes, type);
            if (ok === true) result.logos.restored += 1; else if (ok === "exists") result.logos.present += 1; else result.logos.failed += 1;
          } catch (_) { result.logos.failed += 1; }
        }
      }
    } catch (e) {
      result.errors.push(e.message || String(e));
    }
    onProgress({ stage: "verify" });
    let verify = null;
    try { verify = await rpc("app_system_restore_verify", { p_restore_id: restoreId }); } catch (e) { result.errors.push(e.message || String(e)); }
    result.verify = verify;
    const clean = !result.stopped && !result.errors.length && verify && verify.ok && !result.files.failed && !result.logos.failed && !result.outcomes.failed && !result.credentials.failed;
    const status = result.stopped ? "stopped" : result.errors.length && !result.processed ? "failed" : clean && !result.outcomes.conflict && !result.outcomes.kept_live && !result.outcomes.deleted_live ? "completed" : "completed_with_warnings";
    if (!result.stopped) {
      try { await rpc("app_system_restore_finish", { p_restore_id: restoreId, p_status: status, p_summary: { mode, outcomes: result.outcomes, credentials: result.credentials, files: result.files, logos: result.logos, verify: verify && { ok: verify.ok, missing: verify.missing, wrongOwner: verify.wrongOwner, schemaUnchanged: verify.schemaUnchanged }, errors: result.errors.slice(0, 20) } }); }
      catch (e) { result.errors.push(e.message || String(e)); }
    }
    result.status = status;
    return result;
  }

  async function reportRows(deps, restoreId, { onlyIssues = true } = {}) {
    const rpc = async (n, a) => unwrap(await deps.rpc(n, a || {}));
    const rows = [];
    let after = 0, totals = {};
    for (let i = 0; i < 1000; i++) {
      const r = await rpc("app_system_restore_report", { p_restore_id: restoreId, p_after: after, p_limit: 2000, p_only_issues: onlyIssues });
      totals = r.totals || totals;
      rows.push(...(r.rows || []));
      if (!r.next) break;
      after = r.next;
    }
    return { totals, rows };
  }
  function reportCsv(rows) {
    const cols = ["table", "id", "owner", "owner_username", "outcome", "reason", "live_updated_at", "backup_updated_at", "at"];
    const cell = v => { const s = v == null ? "" : String(v); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : "") + s.replace(/"/g, '""')}"` : s; };
    return [cols.join(","), ...rows.map(r => cols.map(c => cell(r[c])).join(","))].join("\r\n") + "\r\n";
  }

  async function undoUpdates(deps, restoreId) {
    return unwrap(await deps.rpc("app_system_restore_undo_updates", { p_restore_id: restoreId }));
  }

  return Object.freeze({ createBackup, preview, restore, restorePlan, reportRows, reportCsv, undoUpdates, unwrap });
});
