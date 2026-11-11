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

  async function createBackup(deps, { password, sink, readBack, onProgress = () => {}, signal } = {}) {
    const problem = E.passwordProblem(password);
    if (problem) throw new SystemBackupError("weak_password", problem);
    const lib = deps.fflate;
    const rpc = async (n, a) => unwrap(await deps.rpc(n, a || {}));
    onProgress({ stage: "start" });
    const begin = await rpc("app_system_backup_begin", {});
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
    const totals = { users: 0, owners: owners.length, individuals: 0, businesses: 0, teamMembers: 0, records: 0, attachments: 0, attachmentBytes: 0, logos: 0, files: 0, systemRecords: 0, unattributedRecords: 0 };
    const tableTotals = {};
    let lastBeat = Date.now();
    const beat = async (stage, extra) => {
      if (Date.now() - lastBeat < 15000 && !extra) return;
      lastBeat = Date.now();
      try { await rpc("app_system_backup_progress", { p_run_id: runId, p_stage: stage, p_summary: extra || null }); } catch (_) {}
    };

    const addFile = async (path, plain, meta) => {
      checkAbort(signal);
      const sealed = await E.seal(lib, key, backupId, path, plain, { compress: meta.kind !== "attachment" || !/\.(jpg|jpeg|png|webp)$/i.test(path) });
      // Re-open immediately: proves the sealed copy decrypts to exactly these bytes.
      const back = await E.open(lib, key, backupId, path, sealed, plain.length);
      const sha = await E.sha256Hex(plain);
      if (back.length !== plain.length || await E.sha256Hex(back) !== sha) throw new SystemBackupError("verify", `A file could not be verified while writing (${path}).`);
      verification.sealedAndReopened += 1;
      await writer.add(ROOT + path + ".enc", sealed);
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
    await writer.add(ROOT + "backup-header.json", enc.encode(JSON.stringify(header, null, 2)));
    await writer.add(ROOT + "README.txt", enc.encode(readme(header)));

    // ---- 1. Database schema (20 files) ----
    onProgress({ stage: "schema" });
    const partA = await rpc("app_system_schema_export", { p_from: 1, p_to: 16 });
    const partB = await rpc("app_system_schema_export", { p_from: 17, p_to: 20 });
    const objects = [...(partA.objects || []), ...(partB.objects || [])];
    const coverage = partB.coverage || partA.coverage || {};
    const schemaMeta = { backupId, generatedAt: String(partA.generatedAt || createdAt), serverVersion: String(coverage.server_version || ""), schemaComment: coverage.schema_comment ?? null,
      adminId: begin.createdBy && begin.createdBy.id, adminUsername: begin.createdBy && begin.createdBy.username };
    const schemaFiles = E.buildSchemaFiles(objects, schemaMeta);
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
    for (const f of schemaFiles) await addFile(`database-schema/${f.name}`, enc.encode(f.text), { kind: "schema", objects: f.objects });
    await addFile("database-schema/SCHEMA_INSTALLATION_README.md", enc.encode(E.schemaReadme(schemaMeta, schemaFiles, coverage)), { kind: "schema-readme" });

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
      for (const c of catalog) {
        if (!["user", "team", "users"].includes(c.scope)) continue;
        const expected = Number((o.tables || {})[c.table] || 0);
        if (!expected) continue;
        const lines = await exportTable(c.table, { owner: oid });
        if (lines.length !== expected) warnings.push(`${c.table} for ${o.username}: ${expected} records when the backup started, ${lines.length} exported (records changed during the backup).`);
        const groups = new Map();
        if (c.table === "app_users") {
          for (const l of lines) { const r = JSON.parse(l); const sec = r.id === oid ? "profile" : "team"; if (!groups.has(sec)) groups.set(sec, []); groups.get(sec).push(l); }
        } else groups.set(c.section, lines);
        for (const [section, ls] of groups) {
          const text = ls.join("\n") + "\n";
          const path = `users/${oid}/${section}/${c.table}.ndjson`;
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
        const path = `attachments/${oid}/${a.module}/${a.id}.${ext}`;
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
        await addFile(`attachments/${oid}/company-logos/${p}`, bytes, { kind: "logo", owner: oid, logo: { path: p } });
        totals.logos += 1;
      }
      const summary = { id: oid, username: o.username, display_name: o.display_name, company_name: o.company_name, kind: o.kind, role: o.role,
        is_active: o.is_active, created_at: o.created_at, team_members: Number(o.team_members || 0), records: counts,
        attachments: attachments.length, files: ownerFiles };
      await addFile(`users/${oid}/profile/summary.json`, enc.encode(JSON.stringify(summary, null, 2)), { kind: "summary", owner: oid });
      ownerSummaries.push({ id: oid, username: o.username, kind: o.kind, team_members: Number(o.team_members || 0), records: Object.values(counts).reduce((a, b) => a + b, 0), attachments: attachments.length });
      await beat(`owners ${ownerNo}/${owners.length}`);
    }

    // ---- 3. System data and unattributed rows ----
    onProgress({ stage: "system", records: totals.records, attachments: totals.attachments, bytes: writer.offset });
    for (const c of catalog) {
      if (c.scope !== "system") continue;
      const lines = await exportTable(c.table, {});
      if (!lines.length) continue;
      await addFile(`system-data/${c.table}.ndjson`, enc.encode(lines.join("\n") + "\n"), { kind: "data", table: c.table, scope: "system", section: "system", records: lines.length, mode: c.mode });
      totals.systemRecords += lines.length;
      tableTotals[c.table] = (tableTotals[c.table] || 0) + lines.length;
    }
    for (const [table, n] of Object.entries(begin.orphans || {})) {
      const lines = await exportTable(table, { orphans: true });
      if (!lines.length) continue;
      await addFile(`system-data/unattributed/${table}.ndjson`, enc.encode(lines.join("\n") + "\n"), { kind: "data", table, scope: "unattributed", section: "unattributed", records: lines.length, mode: "history" });
      totals.unattributedRecords += lines.length;
      warnings.push(`${lines.length} ${table} record(s) belong to an account that no longer exists; they are kept in system-data/unattributed (not restored).`);
    }
    for (const t of begin.unclassified || []) warnings.push(`Table ${t} is new and not yet classified for system backups; it was not exported.`);

    // ---- 4. Manifest, checksums, verification report ----
    const status = failures.length || warnings.some(w => /^Schema export|not yet classified/.test(w)) ? "completed_with_warnings" : (warnings.length ? "completed_with_warnings" : "completed");
    const manifest = {
      format: E.FORMAT, formatVersion: E.FORMAT_VERSION, backupId, createdAt, completedAt: now(),
      app: header.app, schemaVersion: Number(begin.schemaVersion) || 212, database: begin.database || {},
      createdBy: begin.createdBy || null,
      totals, tables: Object.entries(tableTotals).map(([table, records]) => ({ table, records, scope: catByTable.get(table)?.scope, mode: catByTable.get(table)?.mode })),
      catalog, owners: ownerSummaries,
      modules: await moduleInfo(deps, tableTotals),
      excluded: catalog.filter(c => c.scope === "excluded").map(c => ({ table: c.table, reason: c.reason })),
      schema: { files: E.SCHEMA_FILES, coverage, objects: objects.length },
      warnings, failures, status,
      restoreRules: "Restore never runs the SQL files. It adds only records that are missing; existing records are never overwritten or deleted. Records that differ are kept as they are and reported.",
      files
    };
    manifest.digest = await E.sha256Hex(enc.encode(E.manifestDigestInput(manifest)));
    await addFile("backup-verification/checksums.json", enc.encode(JSON.stringify({ algorithm: "SHA-256", of: "decrypted file contents", files: checksums }, null, 1)), { kind: "meta" });
    await addFile("backup-verification/verification-report.json", enc.encode(JSON.stringify({
      createdAt: now(), backupId, filesWritten: files.length, everyFileReopenedAndHashed: verification.sealedAndReopened, schemaCoverage: verification.schemaChecks,
      attachmentFailures: failures.length, warnings: warnings.length }, null, 2)), { kind: "meta" });
    await addFile("backup-manifest.json", enc.encode(JSON.stringify(manifest, null, 1)), { kind: "meta" });
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
    return { backupId, runId, manifest, status: finalStatus, bytes: written.bytes, verification: post, filename: `Triplem-VIP-System-Backup-${createdAt.replace(/[:T]/g, "-").slice(0, 16)}.zip` };
  }

  function readme(h) {
    return [
      "Triplem VIP - SYSTEM BACKUP", "===========================", "",
      `Backup id: ${h.backupId}`, `Created:   ${h.createdAt}`, "",
      "This archive holds the complete Triplem VIP database schema (20 SQL files), every account's",
      "records (one folder per account owner, with its team), system data, and the attachment files.",
      "Everything except this README and backup-header.json is encrypted with the backup password",
      "(AES-256-GCM, key derived with PBKDF2-SHA-256). Without the password the contents cannot be read.", "",
      "Restore: Triplem VIP > Main Admin > Backup > System Backup & Restore > Restore.",
      "  The restore never runs the SQL files. It only adds missing records and never overwrites or deletes.", "",
      "New Supabase project: decrypt the schema files with",
      "  node scripts/system_backup_tool.js schema <this.zip> <output folder>",
      "  then follow database-schema/SCHEMA_INSTALLATION_README.md.", "",
      "Keep this file private and keep the password separately. Do not edit files inside the archive."
    ].join("\r\n");
  }

  // =====================================================================================
  // Restore
  // =====================================================================================
  // Restorable files, in safe order: organisations, owners' accounts, team
  // accounts, then every owner's tables in catalog order.
  function restorePlan(manifest) {
    const cat = new Map((manifest.catalog || []).map(c => [c.table, c]));
    const dataFiles = manifest.files.filter(f => f.kind === "data" && cat.has(f.table) && ["data", "settings"].includes(cat.get(f.table).mode) && f.scope !== "unattributed");
    const order = c => (cat.get(c.table) || {}).order || 0;
    const step = f => f.table === "app_organizations" ? 0 : f.table === "app_users" ? (f.section === "profile" ? 1 : 2) : 3;
    const owners = (manifest.owners || []).map(o => o.id);
    const ownerIdx = new Map(owners.map((id, i) => [id, i]));
    return dataFiles.slice().sort((a, b) => step(a) - step(b) || (step(a) === 3 ? (ownerIdx.get(a.owner) - ownerIdx.get(b.owner)) : 0) || order(a) - order(b) || (ownerIdx.get(a.owner) ?? 0) - (ownerIdx.get(b.owner) ?? 0));
  }

  async function preview(deps, arch, { onProgress = () => {}, signal } = {}) {
    const rpc = async (n, a) => unwrap(await deps.rpc(n, a || {}));
    const m = arch.manifest;
    const plan = restorePlan(m);
    const counts = { new: 0, same: 0, kept_live: 0, deleted_live: 0, conflict: 0, invalid: 0 };
    const byTable = {};
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
    return {
      counts, byTable, conflicts,
      archive: {
        backupId: m.backupId, createdAt: m.createdAt, createdBy: m.createdBy, app: m.app, status: m.status,
        users: m.totals.users, owners: m.totals.owners, individuals: m.totals.individuals, businesses: m.totals.businesses,
        teamMembers: m.totals.teamMembers, records: m.totals.records, systemRecords: m.totals.systemRecords,
        attachments: atts.length, attachmentBytes: atts.reduce((n, f) => n + f.size, 0), logos: m.files.filter(f => f.kind === "logo").length,
        schemaFiles: m.files.filter(f => f.kind === "schema").length, warnings: m.warnings || [], failures: m.failures || []
      },
      restorableRecords: total
    };
  }

  async function restore(deps, arch, { onProgress = () => {}, signal } = {}) {
    const rpc = async (n, a) => unwrap(await deps.rpc(n, a || {}));
    const m = arch.manifest;
    const begin = await rpc("app_system_restore_begin", { p_backup_id: m.backupId, p_info: { createdAt: m.createdAt, records: m.totals.records, attachments: m.totals.attachments, app: m.app } });
    if (!begin || begin.ok !== true) throw new SystemBackupError(begin && begin.reason || "server", begin && begin.message || "The server could not start the restore.");
    const restoreId = begin.restoreId;
    const cat = new Map((m.catalog || []).map(c => [c.table, c]));
    const plan = restorePlan(m);
    const result = { restoreId, resumed: !!begin.resumed, processed: 0, total: plan.reduce((n, f) => n + (f.records || 0), 0),
      outcomes: { restored: 0, same: 0, kept_live: 0, deleted_live: 0, conflict: 0, failed: 0, skipped: 0 },
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
    const clean = !result.stopped && !result.errors.length && verify && verify.ok && !result.files.failed && !result.logos.failed && !result.outcomes.failed;
    const status = result.stopped ? "stopped" : result.errors.length && !result.processed ? "failed" : clean && !result.outcomes.conflict && !result.outcomes.kept_live && !result.outcomes.deleted_live ? "completed" : "completed_with_warnings";
    if (!result.stopped) {
      try { await rpc("app_system_restore_finish", { p_restore_id: restoreId, p_status: status, p_summary: { outcomes: result.outcomes, files: result.files, logos: result.logos, verify: verify && { ok: verify.ok, missing: verify.missing, wrongOwner: verify.wrongOwner, schemaUnchanged: verify.schemaUnchanged }, errors: result.errors.slice(0, 20) } }); }
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

  return Object.freeze({ createBackup, preview, restore, restorePlan, reportRows, reportCsv, unwrap });
});
