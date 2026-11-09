/* Triplem VIP - Main Admin > Backup > System Backup & Restore (2026-11-10).
 *
 * Protected Main Admin only. The button is shown only to that account and the
 * server checks every call again (migration 212, app_require_protected_admin
 * with the Admin Security Key gate). Hiding the button is not the protection.
 *
 * The engine (04) and runner (05) are loaded on demand when the window opens.
 * Large archives: the ZIP is written as a stream to a file the admin chooses
 * (File System Access API in Chromium / Edge / the Windows app); otherwise it
 * is assembled from disk-backed Blob parts. Restore reads the selected file
 * piece by piece. No polling: progress comes from the work itself.
 */
(function () {
  "use strict";
  if (window.TriplemSystemBackup) return;

  const V = "20261110-sysbackup1";
  const ENGINE_URL = `Assets/app/backup/04-system-backup-engine.js?v=${V}`;
  const RUNNER_URL = `Assets/app/backup/05-system-backup-runner.js?v=${V}`;
  const FFLATE_URL = "Assets/app/lib/fflate-0.8.2.min.js?v=0.8.2";
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtBytes = n => { n = Number(n) || 0; if (n >= 1073741824) return `${(n / 1073741824).toFixed(2)} GB`; if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`; if (n >= 1024) return `${Math.round(n / 1024)} KB`; return `${n} B`; };
  const fmtNum = n => Number(n || 0).toLocaleString();
  const fmtDate = v => { if (!v) return "—"; try { return new Date(v).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch (_) { return String(v); } };
  const isMainAdmin = () => { try { return typeof isProtectedAdminSession === "function" && isProtectedAdminSession(); } catch (_) { return false; } };

  const S = { tab: "backup", busy: false, abort: null, backup: null, restore: { step: "select", file: null, arch: null, preview: null, result: null }, lib: null };

  // ---- loading --------------------------------------------------------------------------
  function loadScript(src, test) {
    if (test()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src; s.async = true;
      s.onload = () => test() ? resolve() : reject(new Error("A backup component could not be loaded."));
      s.onerror = () => reject(new Error("A backup component could not be loaded. Check your connection and try again."));
      document.head.appendChild(s);
    });
  }
  async function libs() {
    if (S.lib) return S.lib;
    await loadScript(FFLATE_URL, () => window.fflate && typeof window.fflate.Inflate === "function");
    await loadScript(ENGINE_URL, () => !!window.TriplemSystemBackupEngine);
    await loadScript(RUNNER_URL, () => !!window.TriplemSystemBackupRunner);
    S.lib = { E: window.TriplemSystemBackupEngine, R: window.TriplemSystemBackupRunner, fflate: window.fflate };
    return S.lib;
  }

  // ---- network adapters (protected admin session; the server checks every call) -----------
  function cfg() {
    const c = typeof getSupabaseConfig === "function" ? getSupabaseConfig() : null;
    const token = String(window.state?.sessionToken || "").trim();
    if (!c?.supabaseUrl || !token) throw new Error("Please sign in again.");
    return { url: String(c.supabaseUrl).replace(/\/$/, ""), key: c.supabaseKey, token };
  }
  const encodePath = p => String(p).split("/").map(encodeURIComponent).join("/");
  const b64url = obj => btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  function deps(lib) {
    const c = cfg();
    const fnUrl = `${c.url}/functions/v1/file-storage`;
    const headers = { apikey: c.key, Authorization: `Bearer ${c.key}`, "X-Session-Token": c.token };
    return {
      fflate: lib.fflate,
      appVersion: String(document.documentElement.dataset.build || ""),
      platform: window.__TRIPLEM_DESKTOP__ ? "windows-app" : (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? "mobile-web" : "web"),
      rpc: (n, a) => window.supabaseRpc(n, a, { offlineCache: false }),
      fetchAttachment: async a => {
        let res;
        try { res = await fetch(fnUrl, { method: "POST", cache: "no-store", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ action: "system-backup-file", id: a.id }) }); }
        catch (_) { throw new Error("The file-storage service could not be reached"); }
        if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || `HTTP ${res.status}`); }
        return new Uint8Array(await res.arrayBuffer());
      },
      fetchLogo: async p => {
        const res = await fetch(`${c.url}/storage/v1/object/public/company-logos/${encodePath(p)}`, { cache: "no-store" }).catch(() => null);
        return res && res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
      },
      logoExists: async p => {
        const res = await fetch(`${c.url}/storage/v1/object/public/company-logos/${encodePath(p)}`, { method: "HEAD", cache: "no-store" }).catch(() => null);
        return !!(res && res.ok);
      },
      uploadLogo: async (p, bytes, type) => {
        const res = await fetch(`${c.url}/storage/v1/object/company-logos/${encodePath(p)}`, { method: "POST", headers: { apikey: c.key, Authorization: `Bearer ${c.key}`, "Content-Type": type }, body: bytes });
        if (res.ok) return true;
        if (res.status === 409 || res.status === 400) return "exists"; // never replaced
        return false;
      },
      uploadAttachment: async (restoreId, meta, bytes) => {
        let res;
        try { res = await fetch(`${fnUrl}?action=system-restore-file`, { method: "POST", headers: { ...headers, "Content-Type": "application/octet-stream", "X-Attachment": b64url({ restore_id: restoreId, id: meta.id }) }, body: bytes }); }
        catch (_) { return { status: "failed", error: "The file-storage service could not be reached" }; }
        const j = await res.json().catch(() => ({}));
        return res.ok ? j : { status: "failed", error: j.error || `HTTP ${res.status}` };
      }
    };
  }

  // Where the archive goes: straight to a file the admin chooses (streamed), or
  // to disk-backed Blob parts that become one download at the end.
  async function chooseSink(filename) {
    if (typeof window.showSaveFilePicker === "function") {
      try {
        const handle = await window.showSaveFilePicker({ suggestedName: filename, types: [{ description: "Triplem VIP system backup", accept: { "application/zip": [".zip"] } }] });
        const w = await handle.createWritable();
        return { kind: "file", name: handle.name, sink: { write: b => w.write(b), close: () => w.close() }, readBack: () => handle.getFile(), abort: () => w.abort().catch(() => {}) };
      } catch (e) {
        if (e && e.name === "AbortError") throw e;   // the admin cancelled the save dialog
      }
    }
    const parts = [];
    let pending = [], size = 0;
    const flush = () => { if (pending.length) { parts.push(new Blob(pending)); pending = []; size = 0; } };
    let blob = null;
    return {
      kind: "blob", name: filename,
      sink: { write: async b => { pending.push(b.slice ? b.slice() : b); size += b.length; if (size > 16 * 1048576) flush(); }, close: async () => { flush(); blob = new Blob(parts, { type: "application/zip" }); } },
      readBack: async () => blob, getBlob: () => blob, abort: () => {}
    };
  }
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  }

  // ---- shell -------------------------------------------------------------------------------
  function modal() {
    let m = document.getElementById("systemBackupModal");
    if (m) return m;
    m = document.createElement("div");
    m.id = "systemBackupModal";
    m.className = "modal hide tsb-modal";
    m.setAttribute("aria-hidden", "true");
    m.innerHTML = `<div class="modal-backdrop" data-tsb-close></div>
      <div class="tsb-dialog" role="dialog" aria-modal="true" aria-labelledby="tsbTitle">
        <header class="tsb-head">
          <span class="tsb-head-icon" aria-hidden="true"><i class="fa-solid fa-shield-halved"></i></span>
          <div class="tsb-head-text"><p class="tsb-kicker">Main Admin · System</p><h3 id="tsbTitle">System Backup &amp; Restore</h3>
            <p class="tsb-sub">Every account, business, team, record and attachment, plus the complete database schema, in one encrypted archive.</p></div>
          <span class="tsb-lock" title="Only the protected Main Admin can use this"><i class="fa-solid fa-lock" aria-hidden="true"></i> Main Admin only</span>
          <button type="button" class="tsb-icon-btn" data-tsb-close aria-label="Close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
        </header>
        <nav class="tsb-tabs" role="tablist" aria-label="System backup sections">
          ${[["backup", "fa-box-archive", "System Backup"], ["restore", "fa-clock-rotate-left", "Restore"], ["history", "fa-list-check", "History"], ["schema", "fa-database", "Schema package"]]
            .map(([k, i, t]) => `<button type="button" role="tab" class="tsb-tab" data-tsb-tab="${k}" aria-selected="false"><i class="fa-solid ${i}" aria-hidden="true"></i><span>${t}</span></button>`).join("")}
        </nav>
        <div class="tsb-body" id="tsbBody"></div>
      </div>`;
    document.body.appendChild(m);
    m.addEventListener("click", e => {
      if (e.target.closest("[data-tsb-close]")) return close();
      const t = e.target.closest("[data-tsb-tab]");
      if (t) { if (S.busy) return flash("Wait for the current operation to finish (or stop it) before switching."); S.tab = t.dataset.tsbTab; render(); }
    });
    m.addEventListener("keydown", e => { if (e.key === "Escape" && !S.busy) close(); });
    return m;
  }
  function flash(text) {
    const b = document.getElementById("tsbBody");
    const el = document.createElement("div");
    el.className = "tsb-toast"; el.textContent = text;
    b?.prepend(el); setTimeout(() => el.remove(), 3200);
  }
  function open() {
    if (!isMainAdmin()) return;
    const m = modal();
    m.classList.remove("hide"); m.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    render();
  }
  function close() {
    if (S.busy) { flash("A backup or restore is running. Stop it first, or wait until it finishes."); return; }
    const m = document.getElementById("systemBackupModal");
    if (!m) return;
    m.classList.add("hide"); m.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }
  window.addEventListener("beforeunload", e => { if (S.busy) { e.preventDefault(); e.returnValue = ""; } });

  function render() {
    const m = modal();
    m.querySelectorAll("[data-tsb-tab]").forEach(b => { const on = b.dataset.tsbTab === S.tab; b.classList.toggle("is-active", on); b.setAttribute("aria-selected", on ? "true" : "false"); });
    const body = document.getElementById("tsbBody");
    if (S.tab === "backup") renderBackup(body);
    else if (S.tab === "restore") renderRestore(body);
    else if (S.tab === "history") renderHistory(body);
    else renderSchema(body);
  }

  // ---- shared pieces -----------------------------------------------------------------------
  const tone0 = (n, tone) => (Number(n) ? tone : "zero");
  const tile = (label, value, tone = "", icon = "") => `<div class="tsb-tile ${tone}">${icon ? `<i class="fa-solid ${icon}" aria-hidden="true"></i>` : ""}<div><small>${esc(label)}</small><strong>${esc(value)}</strong></div></div>`;
  const chip = (status) => {
    const map = { completed: ["ok", "Completed"], completed_with_warnings: ["warn", "Completed with warnings"], failed: ["bad", "Failed"], stopped: ["warn", "Stopped"], running: ["run", "Running"] };
    const [t, l] = map[status] || ["", status || "—"];
    return `<span class="tsb-chip ${t}">${esc(l)}</span>`;
  };
  function pwStrength(pw) {
    let s = 0; if (pw.length >= 12) s++; if (pw.length >= 16) s++; if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++; if (/\d/.test(pw)) s++; if (/[^A-Za-z0-9]/.test(pw)) s++;
    return Math.min(4, s);
  }
  const STAGES_B = [["schema", "Schema"], ["owners", "Accounts & files"], ["system", "System data"], ["finish", "Write archive"], ["verify", "Verify"]];
  function stepper(stages, current, done) {
    const idx = stages.findIndex(s => s[0] === current);
    return `<ol class="tsb-steps">${stages.map(([k, t], i) => `<li class="${done || i < idx ? "done" : i === idx ? "now" : ""}"><span>${done || i < idx ? '<i class="fa-solid fa-check" aria-hidden="true"></i>' : i + 1}</span>${esc(t)}</li>`).join("")}</ol>`;
  }

  // ---- Backup tab --------------------------------------------------------------------------
  function renderBackup(body) {
    const b = S.backup;
    if (b && (b.running || b.result || b.error)) return renderBackupProgress(body);
    body.innerHTML = `
      <div class="tsb-grid">
        <section class="tsb-card tsb-card--primary">
          <div class="tsb-card-head"><span class="tsb-card-icon"><i class="fa-solid fa-box-archive" aria-hidden="true"></i></span><div><h4>Create system backup</h4><p>Encrypted with a password you choose. Keep the password separately: without it the archive cannot be opened or restored.</p></div></div>
          <div class="tsb-last" id="tsbLast"><i class="fa-solid fa-clock" aria-hidden="true"></i><span>Checking the last system backup…</span></div>
          <form id="tsbBackupForm" class="tsb-form" autocomplete="off" novalidate>
            <label class="tsb-field"><span>Backup password</span><input class="tsb-input" type="password" id="tsbPw1" autocomplete="new-password" minlength="12" required placeholder="At least 12 characters"></label>
            <div class="tsb-meter" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
            <label class="tsb-field"><span>Repeat password</span><input class="tsb-input" type="password" id="tsbPw2" autocomplete="new-password" required></label>
            <p class="tsb-hint" id="tsbPwHint">Use 12+ characters with upper and lower case, numbers and symbols.</p>
            <div class="tsb-actions"><button type="submit" class="btn tsb-primary"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Create System Backup</button></div>
            <p class="tsb-hint">${typeof window.showSaveFilePicker === "function" ? "You will choose where to save the ZIP. It is written directly to that file, so even very large backups do not fill memory." : "The ZIP downloads when it is ready."}</p>
          </form>
        </section>
        <section class="tsb-card">
          <div class="tsb-card-head"><span class="tsb-card-icon is-info"><i class="fa-solid fa-circle-info" aria-hidden="true"></i></span><div><h4>Backup information</h4><p>What the archive contains.</p></div></div>
          <ul class="tsb-list">
            <li><i class="fa-solid fa-database"></i><div><strong>Database schema</strong><span>20 ordered SQL files read from the live catalog, for a new Supabase project.</span></div></li>
            <li><i class="fa-solid fa-users"></i><div><strong>One folder per account</strong><span>Individuals and businesses, their team members and permissions, every module's records.</span></div></li>
            <li><i class="fa-solid fa-paperclip"></i><div><strong>Attachment files</strong><span>The actual receipts, invoices and PDFs from Cloudflare R2, checked against their SHA-256.</span></div></li>
            <li><i class="fa-solid fa-fingerprint"></i><div><strong>Integrity</strong><span>Manifest, SHA-256 of every file, AES-256-GCM per file, full read-back check.</span></div></li>
            <li class="is-muted"><i class="fa-solid fa-ban"></i><div><strong>Never included</strong><span>Passwords, PINs, 2FA secrets, passkeys, sessions, R2 and server keys.</span></div></li>
          </ul>
        </section>
      </div>`;
    lastBackup(body.querySelector("#tsbLast"));
    const f = body.querySelector("#tsbBackupForm");
    const p1 = f.querySelector("#tsbPw1"), p2 = f.querySelector("#tsbPw2"), meter = f.querySelector(".tsb-meter"), hint = f.querySelector("#tsbPwHint");
    const upd = () => { const s = pwStrength(p1.value); meter.dataset.level = String(s); };
    p1.addEventListener("input", upd);
    f.addEventListener("submit", async e => {
      e.preventDefault();
      const { E } = await libs().catch(err => { hint.textContent = err.message; hint.className = "tsb-hint bad"; return {}; });
      if (!E) return;
      const problem = E.passwordProblem(p1.value);
      if (problem) { hint.textContent = problem; hint.className = "tsb-hint bad"; p1.focus(); return; }
      if (p1.value !== p2.value) { hint.textContent = "The two passwords are different."; hint.className = "tsb-hint bad"; p2.focus(); return; }
      startBackup(p1.value);
    });
  }

  // One read of the history when the tab opens (no polling).
  async function lastBackup(el) {
    if (!el) return;
    try {
      const r = await window.supabaseRpc("app_system_backup_history", { p_limit: 30 }, { offlineCache: false });
      const items = (r && r.items) || [];
      const last = items.find(i => i.kind === "backup" && /^completed/.test(i.status));
      if (!el.isConnected) return;
      if (!last) { el.classList.add("is-stale"); el.innerHTML = `<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><strong>No system backup yet.</strong><span>Create one now and keep it somewhere safe.</span>`; return; }
      const hours = (Date.now() - new Date(last.finished_at || last.started_at)) / 3600000;
      el.classList.toggle("is-stale", hours > 24);
      el.innerHTML = `<i class="fa-solid ${hours > 24 ? "fa-triangle-exclamation" : "fa-circle-check"}" aria-hidden="true"></i><strong>Last system backup: ${esc(fmtDate(last.finished_at || last.started_at))}</strong> ${chip(last.status)}<span>${hours > 24 ? "A restore into this database needs a backup from the last 24 hours." : "Recent enough to allow a restore."}</span>`;
    } catch (_) { if (el.isConnected) el.remove(); }
  }

  async function startBackup(password) {
    let lib, target;
    const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
    try {
      lib = await libs();
      target = await chooseSink(`Triplem-VIP-System-Backup-${stamp}.zip`);
    } catch (e) {
      if (e && e.name === "AbortError") return; // save dialog cancelled
      S.backup = { error: e.message }; return render();
    }
    S.busy = true;
    S.abort = new AbortController();
    S.backup = { running: true, stage: "start", p: {}, target, started: Date.now() };
    render();
    try {
      const res = await lib.R.createBackup(deps(lib), {
        password, sink: target.sink, readBack: target.readBack, signal: S.abort.signal,
        onProgress: p => { S.backup.stage = p.stage; S.backup.p = { ...S.backup.p, ...p }; paintBackup(); }
      });
      S.backup = { result: res, target };
      if (target.kind === "blob" && res.status !== "failed") downloadBlob(target.getBlob(), res.filename);
    } catch (e) {
      try { target.abort(); } catch (_) {}
      S.backup = { error: e.code === "aborted" ? "The backup was stopped. Nothing was saved as a valid backup." : (e.message || String(e)) };
    } finally { S.busy = false; S.abort = null; render(); }
  }
  function paintBackup() {
    const el = document.getElementById("tsbBackupLive");
    if (!el || !S.backup?.running) return;
    const p = S.backup.p || {};
    const pct = S.backup.stage === "owners" && p.owners ? Math.round((p.owner / p.owners) * 80) + 10
      : S.backup.stage === "schema" ? 5 : S.backup.stage === "system" ? 92 : S.backup.stage === "finish" ? 95 : S.backup.stage === "verify" && p.total ? 95 + Math.round((p.done / p.total) * 5) : 2;
    el.innerHTML = `${stepper(STAGES_B, S.backup.stage === "start" ? "schema" : S.backup.stage)}
      <div class="tsb-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>
      <div class="tsb-tiles">
        ${tile("Accounts processed", p.owners ? `${fmtNum(p.owner)} / ${fmtNum(p.owners)}` : "—", "", "fa-users")}
        ${tile("Records", fmtNum(p.records), "", "fa-table-list")}
        ${tile("Attachments", fmtNum(p.attachments), "", "fa-paperclip")}
        ${tile("Archive size", fmtBytes(p.bytes), "", "fa-file-zipper")}
      </div>
      <p class="tsb-live-line">${S.backup.stage === "verify" ? `Reading the finished archive back and checking every file… ${p.done ? `${fmtNum(p.done)} / ${fmtNum(p.total)}` : ""}` : S.backup.stage === "schema" ? "Exporting the database schema from the live catalog…" : S.backup.stage === "system" ? "Exporting system data…" : S.backup.stage === "finish" ? "Writing the manifest and checksums…" : "Exporting each account's records and files…"}</p>`;
  }
  function renderBackupProgress(body) {
    const b = S.backup;
    if (b.running) {
      body.innerHTML = `<section class="tsb-card tsb-progress"><div class="tsb-card-head"><span class="tsb-card-icon spin"><i class="fa-solid fa-gear" aria-hidden="true"></i></span><div><h4>Creating system backup</h4><p>Keep this window open. ${b.target.kind === "file" ? `Writing to <strong>${esc(b.target.name)}</strong>.` : "The ZIP downloads when it is ready."}</p></div>
        <button type="button" class="btn tsb-danger-ghost" id="tsbStop"><i class="fa-solid fa-stop" aria-hidden="true"></i> Stop</button></div><div id="tsbBackupLive"></div></section>`;
      body.querySelector("#tsbStop").onclick = () => S.abort?.abort();
      paintBackup();
      return;
    }
    if (b.error) {
      body.innerHTML = `<section class="tsb-card tsb-result bad"><div class="tsb-result-head"><i class="fa-solid fa-circle-xmark" aria-hidden="true"></i><div><h4>Backup not completed</h4><p>${esc(b.error)}</p></div></div>
        <div class="tsb-actions"><button type="button" class="btn tsb-secondary" id="tsbAgain">Back</button></div></section>`;
      body.querySelector("#tsbAgain").onclick = () => { S.backup = null; render(); };
      return;
    }
    const r = b.result, m = r.manifest, t = m.totals;
    const ok = r.status === "completed", warn = r.status === "completed_with_warnings";
    const v = r.verification;
    body.innerHTML = `
      <section class="tsb-card tsb-result ${ok ? "ok" : warn ? "warn" : "bad"}">
        <div class="tsb-result-head"><i class="fa-solid ${ok ? "fa-circle-check" : warn ? "fa-triangle-exclamation" : "fa-circle-xmark"}" aria-hidden="true"></i>
          <div><h4>${ok ? "System backup completed and verified" : warn ? "System backup completed with warnings" : "System backup failed verification"}</h4>
          <p>${b.target.kind === "file" ? `Saved as <strong>${esc(b.target.name)}</strong>` : `Downloaded as <strong>${esc(r.filename)}</strong>`} · ${fmtBytes(r.bytes)} · backup id <code>${esc(r.backupId)}</code></p></div></div>
        <div class="tsb-tiles">
          ${tile("Accounts", fmtNum(t.owners), "", "fa-users")}
          ${tile("Individual · business", `${fmtNum(t.individuals)} · ${fmtNum(t.businesses)}`, "", "fa-building")}
          ${tile("Team members", fmtNum(t.teamMembers), "", "fa-user-group")}
          ${tile("Records", fmtNum(t.records + t.systemRecords), "", "fa-table-list")}
          ${tile("Attachments", `${fmtNum(t.attachments)} · ${fmtBytes(t.attachmentBytes)}`, "", "fa-paperclip")}
          ${tile(v ? `Integrity · ${fmtNum(v.files)} files` : "Integrity", v ? (v.ok ? "Verified" : "FAILED") : "Not checked", v && v.ok ? "ok" : "bad", "fa-fingerprint")}
        </div>
        ${(m.failures || []).length ? `<details class="tsb-details bad" open><summary>${m.failures.length} attachment file(s) could not be included</summary><ul>${m.failures.slice(0, 100).map(f => `<li>${esc(f.username)} · ${esc(f.module)} · ${esc(f.id)} — ${esc(f.reason)}</li>`).join("")}</ul></details>` : ""}
        ${(m.warnings || []).length ? `<details class="tsb-details warn"><summary>${m.warnings.length} warning(s)</summary><ul>${m.warnings.slice(0, 200).map(w => `<li>${esc(w)}</li>`).join("")}</ul></details>` : ""}
        ${v && !v.ok ? `<details class="tsb-details bad" open><summary>Verification problems</summary><ul>${v.problems.slice(0, 50).map(p => `<li>${esc(p.path)} — ${esc(p.problem)}</li>`).join("")}</ul></details>` : ""}
        <div class="tsb-actions">${b.target.kind === "blob" && r.status !== "failed" ? `<button type="button" class="btn tsb-secondary" id="tsbDl"><i class="fa-solid fa-download" aria-hidden="true"></i> Download again</button>` : ""}
          <button type="button" class="btn tsb-primary" id="tsbDone">Done</button></div>
      </section>`;
    body.querySelector("#tsbDone").onclick = () => { S.backup = null; render(); };
    body.querySelector("#tsbDl")?.addEventListener("click", () => downloadBlob(b.target.getBlob(), r.filename));
  }

  // ---- Restore tab -------------------------------------------------------------------------
  const STAGES_R = [["select", "Select"], ["validate", "Validate"], ["preview", "Preview"], ["restore", "Restore"], ["report", "Report"]];
  function renderRestore(body) {
    const r = S.restore;
    const head = `<div class="tsb-restore-top">${stepper(STAGES_R, r.step, r.step === "report" && r.result)}</div>`;
    if (r.step === "select") {
      body.innerHTML = `${head}
        <div class="tsb-grid">
          <section class="tsb-card tsb-card--primary">
            <div class="tsb-card-head"><span class="tsb-card-icon is-restore"><i class="fa-solid fa-file-zipper" aria-hidden="true"></i></span><div><h4>Select a system backup</h4><p>A ZIP created by System Backup. It is checked completely before anything is changed.</p></div></div>
            <label class="tsb-drop" id="tsbDrop"><input type="file" id="tsbFile" accept=".zip,application/zip"><i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i><strong>${r.file ? esc(r.file.name) : "Choose or drop the ZIP file"}</strong><span>${r.file ? fmtBytes(r.file.size) : "Nothing is uploaded: the file is read on this device."}</span></label>
            <label class="tsb-field"><span>Backup password</span><input class="tsb-input" type="password" id="tsbOpenPw" autocomplete="off"></label>
            <p class="tsb-hint" id="tsbOpenMsg" role="status"></p>
            <div class="tsb-actions"><button type="button" class="btn tsb-primary" id="tsbValidate" ${r.file ? "" : "disabled"}><i class="fa-solid fa-magnifying-glass-chart" aria-hidden="true"></i> Validate archive</button></div>
          </section>
          <section class="tsb-card">
            <div class="tsb-card-head"><span class="tsb-card-icon is-info"><i class="fa-solid fa-shield" aria-hidden="true"></i></span><div><h4>How restore protects your data</h4><p>Built for a live system.</p></div></div>
            <ul class="tsb-list">
              <li><i class="fa-solid fa-ban"></i><div><strong>The 20 SQL files are never run</strong><span>No CREATE, ALTER, DROP or TRUNCATE. The schema cannot change.</span></div></li>
              <li><i class="fa-solid fa-plus"></i><div><strong>Only missing records are added</strong><span>Existing records are never overwritten or deleted.</span></div></li>
              <li><i class="fa-solid fa-scale-balanced"></i><div><strong>Differences are kept and reported</strong><span>If a live record differs (even if older), the live one stays.</span></div></li>
              <li><i class="fa-solid fa-route"></i><div><strong>Resumable</strong><span>Interrupted? Run it again: finished records are skipped, nothing is duplicated.</span></div></li>
              <li><i class="fa-solid fa-life-ring"></i><div><strong>Safety copy first</strong><span>A System Backup from the last 24 hours is required before restoring into existing data.</span></div></li>
            </ul>
          </section>
        </div>`;
      const input = body.querySelector("#tsbFile"), drop = body.querySelector("#tsbDrop");
      const pick = f => { if (f) { r.file = f; render(); } };
      input.onchange = () => pick(input.files?.[0]);
      drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("is-over"); });
      drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
      drop.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("is-over"); pick(e.dataTransfer?.files?.[0]); });
      body.querySelector("#tsbValidate").onclick = () => validate(body.querySelector("#tsbOpenPw").value, body.querySelector("#tsbOpenMsg"));
      return;
    }
    if (r.step === "validate") {
      const p = r.p || {};
      body.innerHTML = `${head}<section class="tsb-card tsb-progress"><div class="tsb-card-head"><span class="tsb-card-icon spin"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i></span><div><h4>Validating ${esc(r.file?.name)}</h4><p>Format, password, manifest, every file's checksum, then a read-only comparison with the database.</p></div>
        <button type="button" class="btn tsb-danger-ghost" id="tsbStop"><i class="fa-solid fa-stop" aria-hidden="true"></i> Stop</button></div>
        <div class="tsb-bar"><i style="width:${p.total ? Math.round(p.done / p.total * 100) : 3}%"></i></div><p class="tsb-live-line">${esc(r.phase || "Opening archive…")} ${p.total ? `${fmtNum(p.done)} / ${fmtNum(p.total)}` : ""}</p></section>`;
      body.querySelector("#tsbStop").onclick = () => S.abort?.abort();
      return;
    }
    if (r.step === "preview") return renderPreview(body, head);
    if (r.step === "restore") {
      const p = r.p || {};
      const o = p.outcomes || {};
      const pct = p.stage === "files" && p.total ? 90 + Math.round(p.done / p.total * 9) : p.total ? Math.round(p.done / p.total * 90) : 2;
      body.innerHTML = `${head}<section class="tsb-card tsb-progress"><div class="tsb-card-head"><span class="tsb-card-icon spin"><i class="fa-solid fa-rotate" aria-hidden="true"></i></span><div><h4>Restoring</h4><p>Keep this window open. If it is interrupted, start the same restore again: it resumes where it stopped.</p></div>
        <button type="button" class="btn tsb-danger-ghost" id="tsbStop"><i class="fa-solid fa-pause" aria-hidden="true"></i> Stop safely</button></div>
        <div class="tsb-bar"><i style="width:${pct}%"></i></div>
        <div class="tsb-tiles">${tile("Added", fmtNum(o.restored), tone0(o.restored, "ok"), "fa-plus")}${tile("Already present", fmtNum(o.same), tone0(o.same, ""), "fa-equals")}${tile("Kept live (differs)", fmtNum(o.kept_live), tone0(o.kept_live, "warn"), "fa-scale-balanced")}${tile("Conflicts", fmtNum((o.conflict || 0) + (o.deleted_live || 0)), tone0((o.conflict || 0) + (o.deleted_live || 0), "warn"), "fa-triangle-exclamation")}${tile("Failed", fmtNum(o.failed), tone0(o.failed, "bad"), "fa-circle-xmark")}</div>
        <p class="tsb-live-line">${p.stage === "files" ? `Restoring attachment files to Cloudflare R2… ${fmtNum(p.done)} / ${fmtNum(p.total)}` : p.stage === "verify" ? "Verifying restored records, ownership and schema…" : `Records ${fmtNum(p.done)} / ${fmtNum(p.total)} · ${esc(p.table || "")}`}</p></section>`;
      body.querySelector("#tsbStop").onclick = () => S.abort?.abort();
      return;
    }
    if (r.step === "report") return renderReport(body, head);
  }

  async function validate(password, msg) {
    const r = S.restore;
    if (!password) { msg.textContent = "Enter the backup password."; msg.className = "tsb-hint bad"; return; }
    let lib;
    try { lib = await libs(); } catch (e) { msg.textContent = e.message; msg.className = "tsb-hint bad"; return; }
    S.busy = true; S.abort = new AbortController();
    r.step = "validate"; r.phase = "Opening archive and checking the password…"; r.p = {}; render();
    try {
      const arch = await lib.E.openArchive(lib.fflate, r.file, password);
      r.phase = "Checking every file against its SHA-256…"; render();
      const v = await lib.E.verifyArchive(arch, { signal: S.abort.signal, onProgress: p => { r.p = p; render(); } });
      if (!v.ok) { const e = new Error(`${v.problems.length} file(s) in the archive failed the integrity check (first: ${v.problems[0].path} — ${v.problems[0].problem}). Nothing was restored.`); throw e; }
      r.phase = "Comparing with the database (read-only)…"; r.p = {}; render();
      const pv = await lib.R.preview(deps(lib), arch, { signal: S.abort.signal, onProgress: p => { r.p = p; render(); } });
      r.arch = arch; r.preview = pv; r.integrity = v; r.step = "preview";
    } catch (e) {
      r.step = "select"; r.arch = null;
      setTimeout(() => { const m = document.getElementById("tsbOpenMsg"); if (m) { m.textContent = e.code === "aborted" ? "Validation stopped." : e.message; m.className = "tsb-hint bad"; } }, 0);
    } finally { S.busy = false; S.abort = null; render(); }
  }

  function renderPreview(body, head) {
    const r = S.restore, pv = r.preview, a = pv.archive, c = pv.counts;
    const rows = Object.entries(pv.byTable).sort((x, y) => (y[1].new || 0) - (x[1].new || 0));
    body.innerHTML = `${head}
      <section class="tsb-card">
        <div class="tsb-card-head"><span class="tsb-card-icon is-ok"><i class="fa-solid fa-circle-check" aria-hidden="true"></i></span><div><h4>Archive valid · ${fmtNum(r.integrity.files)} files verified</h4>
          <p>Backup <code>${esc(a.backupId)}</code> · created ${esc(fmtDate(a.createdAt))}${a.createdBy ? ` by ${esc(a.createdBy.username)}` : ""}${a.app?.version ? ` · app ${esc(a.app.version)}` : ""} · ${chip(a.status)}</p></div></div>
        <div class="tsb-tiles tsb-tiles--6">
          ${tile("Users", fmtNum(a.users), "", "fa-users")}${tile("Individual accounts", fmtNum(a.individuals), "", "fa-user")}${tile("Businesses", fmtNum(a.businesses), "", "fa-building")}
          ${tile("Staff members", fmtNum(a.teamMembers), "", "fa-user-group")}${tile("Records", fmtNum(a.records), "", "fa-table-list")}${tile("Attachments", `${fmtNum(a.attachments)} · ${fmtBytes(a.attachmentBytes)}`, "", "fa-paperclip")}
        </div>
        <h5 class="tsb-subhead">What the restore would do</h5>
        <div class="tsb-tiles tsb-tiles--5">
          ${tile("New (will be added)", fmtNum(c.new), tone0(c.new, "ok"), "fa-plus")}${tile("Already present", fmtNum(c.same), tone0(c.same, ""), "fa-equals")}
          ${tile("Live differs (kept)", fmtNum(c.kept_live), tone0(c.kept_live, "warn"), "fa-scale-balanced")}${tile("Conflicts", fmtNum((c.conflict || 0) + (c.deleted_live || 0)), tone0((c.conflict || 0) + (c.deleted_live || 0), "warn"), "fa-triangle-exclamation")}
          ${tile("Unreadable", fmtNum(c.invalid), tone0(c.invalid, "bad"), "fa-circle-xmark")}
        </div>
        <p class="tsb-hint">${fmtNum(a.attachments)} attachment file(s) are checked against the bucket; only missing files are uploaded. The ${a.schemaFiles} SQL schema files in the archive are not used by a restore.</p>
        <details class="tsb-details"><summary>By table (${rows.length})</summary>
          <div class="tsb-table-wrap"><table class="tsb-table"><thead><tr><th>Table</th><th>New</th><th>Present</th><th>Kept live</th><th>Conflicts</th></tr></thead><tbody>
          ${rows.map(([t, v]) => `<tr><td>${esc(t)}</td><td>${fmtNum(v.new)}</td><td>${fmtNum(v.same)}</td><td>${fmtNum(v.kept_live)}</td><td>${fmtNum((v.conflict || 0) + (v.deleted_live || 0) + (v.invalid || 0))}</td></tr>`).join("")}
          </tbody></table></div></details>
        ${pv.conflicts.length ? `<details class="tsb-details warn"><summary>Potential conflicts (${fmtNum(pv.conflicts.length)}${pv.conflicts.length >= 500 ? "+" : ""})</summary><ul>${pv.conflicts.slice(0, 200).map(x => `<li><strong>${esc(x.table)}</strong> ${esc(x.id)} — ${esc(x.reason)}</li>`).join("")}</ul></details>` : ""}
        ${(a.failures || []).length ? `<details class="tsb-details bad"><summary>${a.failures.length} file(s) were missing when this backup was made</summary><ul>${a.failures.slice(0, 100).map(f => `<li>${esc(f.username)} · ${esc(f.id)} — ${esc(f.reason)}</li>`).join("")}</ul></details>` : ""}
      </section>
      <section class="tsb-card tsb-confirm">
        <div class="tsb-card-head"><span class="tsb-card-icon is-warn"><i class="fa-solid fa-hand" aria-hidden="true"></i></span><div><h4>Confirm restore</h4><p>Adds ${fmtNum(c.new)} missing record(s) to the live database. Nothing existing is changed or deleted.</p></div></div>
        <label class="tsb-check"><input type="checkbox" id="tsbAck1"> I have a System Backup of the current data from the last 24 hours (the server checks this).</label>
        <label class="tsb-field tsb-field--inline"><span>Type <strong>RESTORE</strong> to confirm</span><input class="tsb-input" id="tsbConfirmWord" autocomplete="off" spellcheck="false"></label>
        <p class="tsb-hint" id="tsbConfirmMsg" role="status"></p>
        <div class="tsb-actions"><button type="button" class="btn tsb-secondary" id="tsbCancel">Cancel</button><button type="button" class="btn tsb-primary" id="tsbGo" disabled><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i> Start restore</button></div>
      </section>`;
    const go = body.querySelector("#tsbGo"), ack = body.querySelector("#tsbAck1"), word = body.querySelector("#tsbConfirmWord");
    const upd = () => { go.disabled = !(ack.checked && word.value.trim() === "RESTORE"); };
    ack.onchange = upd; word.oninput = upd;
    body.querySelector("#tsbCancel").onclick = () => { S.restore = { step: "select", file: null }; render(); };
    go.onclick = () => runRestore();
  }

  async function runRestore() {
    const r = S.restore;
    const lib = await libs();
    S.busy = true; S.abort = new AbortController();
    r.step = "restore"; r.p = { outcomes: {} }; render();
    try {
      const res = await lib.R.restore(deps(lib), r.arch, { signal: S.abort.signal, onProgress: p => { r.p = { ...r.p, ...p, outcomes: { restored: p.restored ?? r.p.outcomes.restored, same: p.same ?? r.p.outcomes.same, kept_live: p.kept_live ?? r.p.outcomes.kept_live, conflict: p.conflict ?? r.p.outcomes.conflict, deleted_live: p.deleted_live ?? r.p.outcomes.deleted_live, failed: p.failed ?? r.p.outcomes.failed } }; render(); } });
      r.result = res; r.step = "report";
      try { r.report = await lib.R.reportRows(deps(lib), res.restoreId, { onlyIssues: true }); } catch (_) { r.report = null; }
    } catch (e) {
      r.step = "preview";
      setTimeout(() => { const m = document.getElementById("tsbConfirmMsg"); if (m) { m.textContent = e.message; m.className = "tsb-hint bad"; } }, 0);
    } finally { S.busy = false; S.abort = null; render(); }
  }

  function renderReport(body, head) {
    const r = S.restore, res = r.result, o = res.outcomes, v = res.verify || {};
    const ok = res.status === "completed", warn = res.status === "completed_with_warnings";
    const rows = r.report?.rows || [];
    body.innerHTML = `${head}
      <section class="tsb-card tsb-result ${ok ? "ok" : warn || res.stopped ? "warn" : "bad"}">
        <div class="tsb-result-head"><i class="fa-solid ${ok ? "fa-circle-check" : warn || res.stopped ? "fa-triangle-exclamation" : "fa-circle-xmark"}" aria-hidden="true"></i>
          <div><h4>${res.stopped ? "Restore stopped (resume by starting it again)" : ok ? "Restore completed and verified" : warn ? "Restore completed — review the report" : "Restore did not complete"}</h4>
          <p>${res.resumed ? "Resumed an interrupted restore. " : ""}Restore id <code>${esc(res.restoreId)}</code></p></div></div>
        <div class="tsb-tiles tsb-tiles--5">
          ${tile("Added", fmtNum(o.restored), tone0(o.restored, "ok"), "fa-plus")}${tile("Already present", fmtNum(o.same), tone0(o.same, ""), "fa-equals")}${tile("Kept live (differs)", fmtNum(o.kept_live), tone0(o.kept_live, "warn"), "fa-scale-balanced")}
          ${tile("Conflicts", fmtNum((o.conflict || 0) + (o.deleted_live || 0)), tone0((o.conflict || 0) + (o.deleted_live || 0), "warn"), "fa-triangle-exclamation")}${tile("Failed", fmtNum(o.failed), tone0(o.failed, "bad"), "fa-circle-xmark")}
        </div>
        <ul class="tsb-verify">
          <li class="${v.missing === 0 ? "ok" : "bad"}"><i class="fa-solid ${v.missing === 0 ? "fa-check" : "fa-xmark"}"></i> Every added record present${v.missing ? ` (${fmtNum(v.missing)} missing)` : ""}</li>
          <li class="${v.wrongOwner === 0 ? "ok" : "bad"}"><i class="fa-solid ${v.wrongOwner === 0 ? "fa-check" : "fa-xmark"}"></i> Ownership and business relationships verified</li>
          <li class="${v.schemaUnchanged ? "ok" : "bad"}"><i class="fa-solid ${v.schemaUnchanged ? "fa-check" : "fa-xmark"}"></i> No database schema change (SQL files not executed)</li>
          <li class="${res.files.failed ? "bad" : "ok"}"><i class="fa-solid ${res.files.failed ? "fa-xmark" : "fa-check"}"></i> Attachment files: ${fmtNum(res.files.restored)} restored, ${fmtNum(res.files.present)} already in R2, ${fmtNum(res.files.failed)} failed (size and SHA-256 checked)</li>
          ${res.logos.restored + res.logos.present + res.logos.failed ? `<li class="${res.logos.failed ? "bad" : "ok"}"><i class="fa-solid ${res.logos.failed ? "fa-xmark" : "fa-check"}"></i> Logos: ${fmtNum(res.logos.restored)} restored, ${fmtNum(res.logos.present)} present, ${fmtNum(res.logos.failed)} failed</li>` : ""}
        </ul>
        ${res.errors.length ? `<details class="tsb-details bad" open><summary>Errors</summary><ul>${res.errors.map(e => `<li>${esc(e)}</li>`).join("")}</ul></details>` : ""}
        ${rows.length ? `<details class="tsb-details warn" open><summary>${fmtNum(rows.length)} record(s) need attention</summary><div class="tsb-table-wrap"><table class="tsb-table"><thead><tr><th>Table</th><th>Record</th><th>Account</th><th>Outcome</th><th>Live updated</th><th>Backup updated</th><th>Reason</th></tr></thead><tbody>
          ${rows.slice(0, 300).map(x => `<tr><td>${esc(x.table)}</td><td><code>${esc(x.id)}</code></td><td>${esc(x.owner_username || x.owner || "")}</td><td>${esc(x.outcome.replace("_", " "))}</td><td>${esc(fmtDate(x.live_updated_at))}</td><td>${esc(fmtDate(x.backup_updated_at))}</td><td>${esc(x.reason)}</td></tr>`).join("")}
          </tbody></table></div>${rows.length > 300 ? `<p class="tsb-hint">Showing 300 of ${fmtNum(rows.length)}. Download the report for all.</p>` : ""}</details>` : ""}
        ${Number(r.report?.totals?.app_users?.restored || 0) ? `<p class="tsb-hint"><i class="fa-solid fa-key"></i> ${fmtNum(r.report.totals.app_users.restored)} account(s) were added without a password (passwords are never in a backup). Give each one a temporary password in Password Recovery.</p>` : ""}
        <div class="tsb-actions"><button type="button" class="btn tsb-secondary" id="tsbReport"><i class="fa-solid fa-file-csv" aria-hidden="true"></i> Download full report</button>
          ${res.stopped ? `<button type="button" class="btn tsb-primary" id="tsbResume"><i class="fa-solid fa-play" aria-hidden="true"></i> Resume restore</button>` : `<button type="button" class="btn tsb-primary" id="tsbDone">Done</button>`}</div>
      </section>`;
    body.querySelector("#tsbReport").onclick = async () => {
      const lib = await libs();
      const all = await lib.R.reportRows(deps(lib), res.restoreId, { onlyIssues: false });
      const csv = lib.R.reportCsv(all.rows);
      downloadBlob(new Blob(["﻿" + csv], { type: "text/csv" }), `Triplem-VIP-Restore-Report-${res.restoreId.slice(0, 8)}.csv`);
    };
    body.querySelector("#tsbDone")?.addEventListener("click", () => { S.restore = { step: "select", file: null }; render(); });
    body.querySelector("#tsbResume")?.addEventListener("click", () => runRestore());
  }

  // ---- History tab ---------------------------------------------------------------------------
  async function renderHistory(body) {
    body.innerHTML = `<section class="tsb-card"><div class="tsb-card-head"><span class="tsb-card-icon is-info"><i class="fa-solid fa-list-check" aria-hidden="true"></i></span><div><h4>Backup history</h4><p>System backups and restores recorded on the server.</p></div>
      <button type="button" class="btn tsb-secondary tiny" id="tsbHistRefresh"><i class="fa-solid fa-rotate" aria-hidden="true"></i> Refresh</button></div><div id="tsbHist"><div class="tsb-empty"><i class="fa-solid fa-spinner fa-spin"></i> Loading…</div></div></section>`;
    body.querySelector("#tsbHistRefresh").onclick = () => renderHistory(body);
    let items = [];
    try { const r = await window.supabaseRpc("app_system_backup_history", { p_limit: 50 }, { offlineCache: false }); items = (r && r.items) || (Array.isArray(r) && r[0]?.items) || []; }
    catch (e) { body.querySelector("#tsbHist").innerHTML = `<div class="tsb-empty bad">${esc(/administrator|security/i.test(e.message) ? "Main Admin access (with the Admin Security Key unlocked) is required." : e.message)}</div>`; return; }
    const host = body.querySelector("#tsbHist");
    if (!host) return;
    if (!items.length) { host.innerHTML = `<div class="tsb-empty"><i class="fa-regular fa-folder-open"></i><strong>No system backups yet</strong><span>Create the first one in the System Backup tab.</span></div>`; return; }
    host.innerHTML = `<div class="tsb-table-wrap"><table class="tsb-table tsb-history"><thead><tr><th>Type</th><th>Status</th><th>Started</th><th>Duration</th><th>By</th><th>Details</th></tr></thead><tbody>
      ${items.map(i => {
        const s = i.summary || {};
        const dur = i.finished_at ? Math.max(1, Math.round((new Date(i.finished_at) - new Date(i.started_at)) / 1000)) : null;
        const detail = i.kind === "backup"
          ? (s.totals ? `${fmtNum(s.totals.owners)} accounts · ${fmtNum((s.totals.records || 0) + (s.totals.systemRecords || 0))} records · ${fmtNum(s.totals.attachments)} files · ${fmtBytes(s.bytes)}${s.verified === true ? " · verified" : s.verified === false ? " · verification failed" : ""}` : "")
          : (s.journal ? `${fmtNum(s.journal.restored)} added · ${fmtNum(s.journal.same)} present · ${fmtNum((s.journal.kept_live || 0) + (s.journal.conflict || 0))} kept/conflicts · ${fmtNum(s.journal.failed)} failed` : "");
        return `<tr><td class="tsb-hist-kind"><span class="tsb-kind ${i.kind}"><i class="fa-solid ${i.kind === "backup" ? "fa-box-archive" : "fa-clock-rotate-left"}"></i> ${i.kind === "backup" ? "Backup" : "Restore"}</span></td><td class="tsb-hist-status">${chip(i.status)}</td><td data-label="Started">${esc(fmtDate(i.started_at))}</td><td data-label="Duration">${dur == null ? "—" : dur < 90 ? `${dur}s` : `${Math.round(dur / 60)} min`}</td><td data-label="By">${esc(i.by || "")}</td><td class="tsb-hist-detail">${esc(detail)}</td></tr>`;
      }).join("")}</tbody></table></div>`;
  }

  // ---- Schema tab ---------------------------------------------------------------------------
  function renderSchema(body) {
    body.innerHTML = `
      <div class="tsb-grid">
        <section class="tsb-card tsb-card--primary">
          <div class="tsb-card-head"><span class="tsb-card-icon"><i class="fa-solid fa-database" aria-hidden="true"></i></span><div><h4>Schema / migration package</h4><p>The structure of the Triplem VIP database for a NEW Supabase project. No records, no credentials.</p></div></div>
          <ul class="tsb-list">
            <li><i class="fa-solid fa-list-ol"></i><div><strong>Exactly 20 ordered SQL files</strong><span>001 extensions → 003-013 tables by area → 014-016 constraints, keys, indexes → 017 functions → 018 views → 019 triggers → 020 RLS, policies, grants.</span></div></li>
            <li><i class="fa-solid fa-magnifying-glass"></i><div><strong>Exported from the live catalog</strong><span>Not rebuilt from migration files: what is in the database is what you get.</span></div></li>
            <li><i class="fa-solid fa-shield"></i><div><strong>Guarded</strong><span>File 001 refuses to run on a database that already has Triplem VIP tables; 002-020 refuse unless 001 ran first.</span></div></li>
          </ul>
          <p class="tsb-hint" id="tsbSchemaMsg" role="status"></p>
          <div class="tsb-actions"><button type="button" class="btn tsb-primary" id="tsbSchemaDl"><i class="fa-solid fa-download" aria-hidden="true"></i> Download schema package (ZIP)</button></div>
        </section>
        <section class="tsb-card">
          <div class="tsb-card-head"><span class="tsb-card-icon is-info"><i class="fa-solid fa-terminal" aria-hidden="true"></i></span><div><h4>From an encrypted system backup</h4><p>Every system backup contains the same 20 files, encrypted.</p></div></div>
          <p class="tsb-text">To take them out of a backup without the app (for example on a new computer):</p>
          <pre class="tsb-code">node scripts/system_backup_tool.js schema Triplem-VIP-System-Backup.zip ./schema</pre>
          <p class="tsb-text">Then follow <code>SCHEMA_INSTALLATION_README.md</code>: run 001 → 020 in the SQL editor of the new project, create the Main Admin, deploy the Edge Functions and secrets, then restore the data from the same backup.</p>
          <pre class="tsb-code">node scripts/system_backup_tool.js verify Triplem-VIP-System-Backup.zip</pre>
        </section>
      </div>`;
    body.querySelector("#tsbSchemaDl").onclick = async ev => {
      const btn = ev.currentTarget, msg = body.querySelector("#tsbSchemaMsg");
      btn.disabled = true; msg.className = "tsb-hint"; msg.textContent = "Reading the live database catalog…";
      try {
        const lib = await libs();
        const a = await window.supabaseRpc("app_system_schema_export", { p_from: 1, p_to: 16 }, { offlineCache: false });
        const b = await window.supabaseRpc("app_system_schema_export", { p_from: 17, p_to: 20 }, { offlineCache: false });
        const cov = b.coverage || a.coverage || {};
        const meta = { backupId: (crypto.randomUUID ? crypto.randomUUID() : "schema-only"), generatedAt: String(a.generatedAt || new Date().toISOString()), serverVersion: String(cov.server_version || ""), schemaComment: cov.schema_comment ?? null,
          adminId: window.state?.sessionUser?.id, adminUsername: window.state?.sessionUser?.username };
        const files = lib.E.buildSchemaFiles([...(a.objects || []), ...(b.objects || [])], meta);
        const zipFiles = {};
        for (const f of files) zipFiles[`triplem-vip-schema/${f.name}`] = new TextEncoder().encode(f.text);
        zipFiles["triplem-vip-schema/SCHEMA_INSTALLATION_README.md"] = new TextEncoder().encode(lib.E.schemaReadme(meta, files, cov));
        const zipped = await new Promise((res, rej) => lib.fflate.zip(zipFiles, { level: 6 }, (e, d) => e ? rej(e) : res(d)));
        downloadBlob(new Blob([zipped], { type: "application/zip" }), `Triplem-VIP-Schema-${meta.generatedAt.slice(0, 10)}.zip`);
        msg.className = "tsb-hint ok"; msg.textContent = `20 SQL files · ${fmtNum(cov.tables)} tables, ${fmtNum(cov.functions)} functions, ${fmtNum(cov.triggers)} triggers, ${fmtNum(cov.policies)} policies.`;
      } catch (e) {
        msg.className = "tsb-hint bad"; msg.textContent = /administrator|security/i.test(e.message) ? "Main Admin access (with the Admin Security Key unlocked) is required." : e.message;
      } finally { btn.disabled = false; }
    };
  }

  // ---- entry point ----------------------------------------------------------------------------
  // The menu item lives inside the Admin "Backup" menu, which the admin code
  // shows only to the protected Main Admin (updateAdminBackupVisibility).
  window.TriplemSystemBackup = Object.freeze({ open, close });
})();
