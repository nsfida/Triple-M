/* Main Admin — File Storage Settings (Cloudflare R2), 2026-11-09.
 *
 * Only the protected Main Admin sees the button; the server checks again on
 * every call (app_storage_admin_check / app_require_protected_admin).
 * Credentials go to the file-storage Edge Function, which encrypts them; they
 * are never read back. The secret field is always empty and masked.
 * Figures are calculated from attachment records (not Cloudflare billing).
 * Loaded only when the page is opened; no background polling.
 */
(function () {
  "use strict";
  if (window.TriplemFileStorageAdmin) return;
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtBytes = n => { n = Number(n) || 0; if (n >= 1073741824) return `${(n / 1073741824).toFixed(2)} GB`; if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`; if (n >= 1024) return `${Math.round(n / 1024)} KB`; return `${n} B`; };
  const fmtDate = v => { if (!v) return "Never"; try { return new Date(v).toLocaleString(); } catch (_) { return String(v); } };
  const isMainAdmin = () => { try { return typeof isProtectedAdminSession === "function" && isProtectedAdminSession(); } catch (_) { return false; } };

  async function callFn(body) {
    const cfg = typeof getSupabaseConfig === "function" ? getSupabaseConfig() : null;
    const token = String(window.state?.sessionToken || "").trim();
    if (!cfg?.supabaseUrl || !token) throw new Error("Please sign in again.");
    let res;
    try {
      res = await fetch(`${String(cfg.supabaseUrl).replace(/\/$/, "")}/functions/v1/file-storage`, {
        method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json", apikey: cfg.supabaseKey, Authorization: `Bearer ${cfg.supabaseKey}`, "X-Session-Token": token },
        body: JSON.stringify(body)
      });
    } catch (_) { throw new Error("The file-storage service could not be reached. Check that the Edge Function is deployed."); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Request failed (${res.status}).`);
    return data;
  }

  function modalShell() {
    let m = document.getElementById("fileStorageModal");
    if (m) return m;
    m = document.createElement("div");
    m.id = "fileStorageModal";
    m.className = "modal hide";
    m.setAttribute("aria-hidden", "true");
    m.innerHTML = `<div class="modal-backdrop" data-fs-close></div>
      <div class="modal-dialog tm-fs-dialog" role="dialog" aria-modal="true" aria-labelledby="fileStorageTitle">
        <div class="modal-head"><div><h3 id="fileStorageTitle"><i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i> File Storage Settings</h3><p>Cloudflare R2 for receipts, invoices and documents of all users.</p></div>
          <button class="icon-btn ghost" type="button" data-fs-close aria-label="Close">×</button></div>
        <div class="modal-body" id="fileStorageBody"><div class="empty">Loading…</div></div>
      </div>`;
    document.body.appendChild(m);
    m.addEventListener("click", e => { if (e.target.closest("[data-fs-close]")) close(); });
    m.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
    return m;
  }
  function close() {
    const m = document.getElementById("fileStorageModal");
    if (!m) return;
    m.classList.add("hide"); m.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function render(ov, msg) {
    const c = ov?.config || {};
    const s = c.settings || {};
    const allowed = Array.isArray(s.allowed) ? s.allowed : ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    const imgOrig = Number(ov?.image_original_bytes) || 0, imgStored = Number(ov?.image_stored_bytes) || 0;
    const saved = Math.max(0, imgOrig - imgStored);
    const pct = imgOrig ? ((saved / imgOrig) * 100).toFixed(1) : "0.0";
    const conn = c.last_test_ok === true ? ["ok", "Connected"] : c.last_test_ok === false ? ["bad", "Failed"] : ["", c.configured ? "Not tested" : "Not configured"];
    const body = document.getElementById("fileStorageBody");
    const field = (label, control, hint = "", cls = "") => `<label class="tm-fs-field ${cls}"><span>${label}</span>${control}${hint ? `<small>${hint}</small>` : ""}</label>`;
    const metric = (label, value, tone = "") => `<div class="tm-fs-metric ${tone}"><small>${label}</small><strong title="${esc(value)}">${esc(value)}</strong></div>`;
    body.innerHTML = `
      <div class="tm-fs">
        <div class="tm-fs-hero">
          <span class="tm-fs-badge ${conn[0] || "idle"}"><i aria-hidden="true"></i>${esc(conn[1])}</span>
          <dl class="tm-fs-kv">
            <div><dt>Bucket</dt><dd title="${esc(c.bucket)}">${esc(c.bucket || "—")}</dd></div>
            <div><dt>Storage</dt><dd class="${c.enabled ? "ok" : ""}">${c.enabled ? "Enabled" : "Disabled"}</dd></div>
            <div><dt>Last successful connection</dt><dd>${esc(fmtDate(c.last_success_at))}</dd></div>
            <div><dt>Configuration updated</dt><dd>${esc(fmtDate(c.updated_at))}</dd></div>
          </dl>
        </div>
        ${c.last_test_message ? `<p class="tm-fs-msg tm-fs-banner ${c.last_test_ok ? "ok" : "bad"}">${esc(c.last_test_message)}</p>` : ""}
        <form id="fileStorageForm" class="tm-fs-form" autocomplete="off" novalidate>
          <section class="tm-fs-card" aria-labelledby="tmFsConnTitle">
            <header class="tm-fs-card-head"><i class="fa-solid fa-plug" aria-hidden="true"></i><div><h4 id="tmFsConnTitle">Connection</h4><p>Cloudflare R2 API token. Credentials are encrypted on the server and never shown again.</p></div></header>
            <div class="tm-fs-grid">
              ${field("Cloudflare Account ID", `<input class="input" name="account_id" value="${esc(c.account_id)}" placeholder="32 characters" spellcheck="false" required>`)}
              ${field("R2 Bucket Name", `<input class="input" name="bucket" value="${esc(c.bucket || "triplem-vip-files")}" spellcheck="false" required>`)}
              ${field("S3 API Endpoint", `<input class="input" name="endpoint" value="${esc(c.endpoint)}" placeholder="https://ACCOUNT_ID.r2.cloudflarestorage.com" spellcheck="false">`, "Leave empty to build it from the Account ID.", "wide")}
              ${field("S3 Access Key ID", `<input class="input" name="access_key_id" value="" placeholder="${c.configured ? `Configured (ends ${esc(c.access_key_hint)}) — leave empty to keep` : "From an R2 API token"}" spellcheck="false" autocomplete="off">`, "The R2 token's Access Key ID, not a Cloudflare API token.")}
              ${field("Secret Access Key", `<input class="input" type="password" name="secret_access_key" value="" placeholder="${c.configured ? "•••••••• saved — leave empty to keep" : "Shown once when the token is created"}" autocomplete="new-password">`, "Stored encrypted. Never displayed again.")}
              ${field("Region", `<input class="input" name="region" value="${esc(c.region || "auto")}" spellcheck="false">`)}
              ${field("Storage", `<select class="select" name="enabled"><option value="on"${c.enabled ? " selected" : ""}>Enabled for all users</option><option value="off"${c.enabled ? "" : " selected"}>Disabled</option></select>`, "Enabling runs a connection test first.")}
            </div>
          </section>
          <section class="tm-fs-card" aria-labelledby="tmFsImgTitle">
            <header class="tm-fs-card-head"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i><div><h4 id="tmFsImgTitle">Image optimisation</h4><p>Applied on the device before upload. PDFs are stored unchanged.</p></div></header>
            <div class="tm-fs-grid tm-fs-grid--4">
              ${field("Optimise before upload", `<select class="select" name="optimize"><option value="on"${s.optimize !== false ? " selected" : ""}>On (recommended)</option><option value="off"${s.optimize === false ? " selected" : ""}>Off</option></select>`)}
              ${field("Quality", `<select class="select" name="preset">${[["document", "Document (sharpest text)"], ["balanced", "Balanced"], ["compact", "Compact"]].map(([v, t]) => `<option value="${v}"${(s.preset || "document") === v ? " selected" : ""}>${t}</option>`).join("")}</select>`)}
              ${field("Largest image side", `<select class="select" name="max_edge">${[2000, 2500, 3000, 3500, 4000].map(v => `<option value="${v}"${Number(s.max_edge || 3000) === v ? " selected" : ""}>${v} px${v === 3000 ? " (default)" : ""}</option>`).join("")}</select>`)}
              ${field("Largest upload", `<select class="select" name="max_upload_mb">${[5, 10, 15, 25].map(v => `<option value="${v}"${Number(s.max_upload_mb || 15) === v ? " selected" : ""}>${v} MB</option>`).join("")}</select>`)}
              <div class="tm-fs-field wide"><span>Allowed files</span><div class="tm-fs-chips">${[["image/jpeg", "JPG"], ["image/png", "PNG"], ["image/webp", "WebP"], ["application/pdf", "PDF"]].map(([v, t]) => `<label class="tm-fs-chip"><input type="checkbox" name="allowed" value="${v}"${allowed.includes(v) ? " checked" : ""}><span>${t}</span></label>`).join("")}</div></div>
            </div>
          </section>
          <div class="tm-fs-bar">
            <p class="tm-fs-msg" id="fileStorageMsg" role="status" aria-live="polite"></p>
            <div class="tm-fs-actions">
              <button type="button" class="btn ghost" data-fs-test${c.configured ? "" : " disabled"}><i class="fa-solid fa-plug-circle-check" aria-hidden="true"></i> Test Connection</button>
              <button type="submit" class="btn primary"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Save Configuration</button>
            </div>
          </div>
        </form>
        <section class="tm-fs-card" aria-labelledby="tmFsOvTitle">
          <header class="tm-fs-card-head"><i class="fa-solid fa-chart-simple" aria-hidden="true"></i><div><h4 id="tmFsOvTitle">Storage overview</h4><p>Calculated from Triplem VIP's attachment records.</p></div>
            <div class="tm-fs-head-actions"><button type="button" class="btn ghost tiny" data-fs-refresh><i class="fa-solid fa-rotate" aria-hidden="true"></i> Refresh</button><button type="button" class="btn ghost tiny" data-fs-retry${c.configured ? "" : " disabled"}><i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i> Retry pending</button></div></header>
          <div class="tm-fs-metrics">
            ${metric("Attachments", ov?.attachments ?? 0)}
            ${metric("Total stored", fmtBytes(ov?.stored_bytes))}
            ${metric("Images · original", fmtBytes(imgOrig))}
            ${metric("Images · stored", fmtBytes(imgStored))}
            ${metric("Saved by optimisation", `${fmtBytes(saved)} (${pct}%)`, "ok")}
            ${metric("PDFs", ov?.pdfs ?? 0)}
            ${metric("Pending uploads", ov?.uploading ?? 0)}
            ${metric("Failed uploads", ov?.failed ?? 0, Number(ov?.failed) ? "bad" : "")}
            ${metric("Deletes to retry", ov?.deleting ?? 0, Number(ov?.deleting) ? "bad" : "")}
            ${metric("Last storage operation", fmtDate(c.last_operation_at))}
          </div>
          ${(ov?.recent_errors || []).length ? `<h5 class="tm-fs-subhead">Recent errors</h5><ul class="tm-fs-errors">${ov.recent_errors.map(e => `<li>${esc(fmtDate(e.at))} · ${esc(e.module)} · ${esc(e.status)} — ${esc(e.error)}</li>`).join("")}</ul>` : ""}
          <p class="tm-fs-note">Uploads still waiting on users' devices (offline) are counted once they reach the server. Cloudflare's own usage and billing figures are in the Cloudflare dashboard.</p>
        </section>
      </div>`;
    const form = body.querySelector("#fileStorageForm");
    const say = (text, ok) => { const p = body.querySelector("#fileStorageMsg"); p.className = `tm-fs-msg ${ok === true ? "ok" : ok === false ? "bad" : ""}`; p.innerHTML = text; };
    if (msg) say(msg.html, msg.ok);
    const busy = (btn, on) => { btn.disabled = on; };
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const fd = new FormData(form);
      const btn = form.querySelector('[type="submit"]');
      busy(btn, true); say("Saving…");
      try {
        const out = await callFn({
          action: "admin-save",
          account_id: String(fd.get("account_id") || "").trim(), endpoint: String(fd.get("endpoint") || "").trim(), bucket: String(fd.get("bucket") || "").trim(),
          region: String(fd.get("region") || "auto").trim(), access_key_id: String(fd.get("access_key_id") || "").trim(), secret_access_key: String(fd.get("secret_access_key") || "").trim(),
          enabled: fd.get("enabled") === "on",
          settings: { optimize: fd.get("optimize") === "on", preset: fd.get("preset"), max_edge: Number(fd.get("max_edge")), max_upload_mb: Number(fd.get("max_upload_mb")), allowed: fd.getAll("allowed") }
        });
        form.querySelector('[name="secret_access_key"]').value = "";
        const t = out.test;
        const html = t ? `${t.ok ? "Saved. " : "Saved, but storage stays disabled: "}${esc(t.message)}${steps(t)}` : "Saved.";
        try { localStorage.removeItem("triplem-attachments-cfg-v1"); } catch (_) {}
        await load({ html, ok: t ? t.ok : true });
      } catch (err) { say(esc(err.message), false); busy(btn, false); }
    });
    body.querySelector("[data-fs-test]")?.addEventListener("click", async ev => {
      busy(ev.currentTarget, true); say("Testing the connection with a real upload, download and delete…");
      try { const t = await callFn({ action: "admin-test" }); await load({ html: esc(t.message) + steps(t), ok: t.ok }); }
      catch (err) { say(esc(err.message), false); ev.currentTarget.disabled = false; }
    });
    body.querySelector("[data-fs-refresh]")?.addEventListener("click", () => load());
    body.querySelector("[data-fs-retry]")?.addEventListener("click", async ev => {
      busy(ev.currentTarget, true);
      try { const r = await callFn({ action: "admin-retry" }); await load({ html: `Retried: ${r.deleted} deleted, ${r.confirmed} confirmed, ${r.remaining} still waiting.`, ok: true }); }
      catch (err) { say(esc(err.message), false); ev.currentTarget.disabled = false; }
    });
  }
  const steps = t => (t?.steps?.length ? `<ul class="tm-fs-steps">${t.steps.map(s => `<li>${s.ok ? "✓" : "✗"} ${esc(s.step)}${s.detail ? ` — ${esc(s.detail)}` : ""}</li>`).join("")}</ul>` : "");

  async function load(msg) {
    const body = document.getElementById("fileStorageBody");
    try {
      const ov = await supabaseRpc("app_storage_admin_overview", {}, { offlineCache: false });
      render(ov, msg);
    } catch (err) {
      body.innerHTML = `<div class="empty">${esc(/Administrator|security/i.test(err.message) ? "Main Admin access (with the Admin Security Key unlocked) is required." : err.message)}</div>`;
    }
  }
  function open() {
    if (!isMainAdmin()) return;
    const m = modalShell();
    m.classList.remove("hide"); m.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    load();
  }
  // Button in the Admin toolbar (Main Admin only).
  function addButton() {
    const after = document.getElementById("adminStorageMgmtBtn");
    if (!after || document.getElementById("adminFileStorageBtn")) return;
    const b = document.createElement("button");
    b.className = "btn soft tiny admin-tool-btn hide";
    b.id = "adminFileStorageBtn"; b.type = "button"; b.title = "File Storage Settings (Cloudflare R2)";
    b.innerHTML = `<i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i> File Storage`;
    after.insertAdjacentElement("afterend", b);
    b.addEventListener("click", open);
    const sync = () => b.classList.toggle("hide", !isMainAdmin());
    sync();
    const panel = document.getElementById("adminPanel");
    if (panel) new MutationObserver(sync).observe(panel, { attributes: true, attributeFilter: ["class"] });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addButton, { once: true }); else addButton();
  window.TriplemFileStorageAdmin = Object.freeze({ open, close });
})();
