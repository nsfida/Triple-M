/* Triplem VIP attachments (receipts, invoices, documents) — 2026-11-09.
 *
 * Files live in a private Cloudflare R2 bucket set up by the Main Admin; only
 * metadata is in Supabase (migration 210). This module:
 *   - adds a small "Attach receipt / invoice" control to supported forms;
 *   - optimises images on the device (Web Worker, image-optimizer-core.js)
 *     BEFORE anything is uploaded; PDFs stay PDFs;
 *   - keeps the optimised file in IndexedDB until the server confirms it, so
 *     attachments survive offline use, app restarts and failed uploads, and a
 *     retry never re-compresses;
 *   - uploads through the file-storage Edge Function once the record exists
 *     on the server (after the normal save / offline sync);
 *   - shows a paperclip icon only on records that have files, and a viewer.
 *
 * Nothing runs until a form with attachments is used or a list asks for its
 * icons: no polling, no startup downloads. Financial records are saved exactly
 * as before; attachments are tracked separately and never block a save.
 */
(function () {
  "use strict";
  if (window.TriplemAttachments) return;

  const DB_NAME = "triplem-attachments-v1";
  const STORE = "queue";
  const CFG_CACHE_KEY = "triplem-attachments-cfg-v1";
  const CORE_URL = "Assets/app/attachments/image-optimizer-core.js?v=20261109-att2";
  const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.pdf";
  const MAX_FILES_PER_RECORD = 20;
  const MODULE_BY_TABLE = {
    expense_entries: "expense", expense_topups: "topup", expense_transfers: "transfer",
    loans: "loan", loan_payments: "loan_payment", installment_plans: "installment", installment_payments: "installment_payment",
    goods_items: "inventory_item", goods_sales: "inventory_sale", goods_events: "inventory_event"
  };
  const BACKOFF = [3000, 15000, 45000, 120000, 300000, 600000];

  const S = {
    cfg: null, cfgPromise: null, index: new Map(), indexOwner: "", indexPromise: null,
    pump: null, timer: 0, worker: null, workerBroken: false, coreLoaded: null, jobs: new Map(), jobSeq: 0,
    controls: new WeakMap(), memQueue: new Map(), dbBroken: false, captureRows: null, notified: new Set()
  };

  // ---- small helpers -------------------------------------------------------------------
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));
  const fmtSize = n => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  const session = () => { try { return window.state || null; } catch (_) { return null; } };
  const ownerId = () => { try { return (typeof currentOwnerId === "function" && currentOwnerId()) || ""; } catch (_) { return ""; } };
  const token = () => String(session()?.sessionToken || "").trim();
  const signedIn = () => !!token() && !!ownerId();
  const notice = (msg, type = "info") => { try { if (typeof showEntryConfirmation === "function") showEntryConfirmation(msg, type); } catch (_) {} };
  const isUuid = v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ""));

  // ---- configuration (no credentials; from app_storage_client_config) ------------------
  function cachedCfg() { try { return JSON.parse(localStorage.getItem(CFG_CACHE_KEY) || "null"); } catch (_) { return null; } }
  async function clientConfig(force = false) {
    if (S.cfg && !force) return S.cfg;
    if (S.cfgPromise && !force) return S.cfgPromise;
    S.cfgPromise = (async () => {
      if (!signedIn() || navigator.onLine === false || typeof supabaseRpc !== "function") return (S.cfg = cachedCfg() || { enabled: false, optimize: true, max_edge: 3000, preset: "document", max_upload_mb: 15 });
      try {
        const c = await supabaseRpc("app_storage_client_config", {}, { offlineCache: false });
        S.cfg = c && typeof c === "object" ? c : { enabled: false };
        try { localStorage.setItem(CFG_CACHE_KEY, JSON.stringify(S.cfg)); } catch (_) {}
      } catch (_) {
        S.cfg = cachedCfg() || { enabled: false, optimize: true, max_edge: 3000, preset: "document", max_upload_mb: 15 };
      }
      return S.cfg;
    })().finally(() => { S.cfgPromise = null; });
    return S.cfgPromise;
  }

  // ---- record references ----------------------------------------------------------------
  function refForEntry(entry) {
    if (!entry || !isUuid(entry.id)) return null;
    try {
      const p = window.DomainLedger?.domainInsertPayload?.(entry);
      const module = p && MODULE_BY_TABLE[p.table];
      const id = p?.body?.id || entry.id;
      if (module && isUuid(id)) return { module, id: String(id).toLowerCase() };
    } catch (_) {}
    return null;
  }

  // ---- image optimisation (Web Worker, page fallback) ------------------------------------
  function ensureCore() {
    if (window.TriplemOptimizeCore) return Promise.resolve(window.TriplemOptimizeCore);
    if (!S.coreLoaded) {
      S.coreLoaded = new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = CORE_URL; s.async = true;
        s.onload = () => (window.TriplemOptimizeCore ? res(window.TriplemOptimizeCore) : rej(new Error("Optimiser unavailable")));
        s.onerror = () => { S.coreLoaded = null; rej(new Error("Optimiser unavailable")); };
        document.head.appendChild(s);
      });
    }
    return S.coreLoaded;
  }
  function getWorker() {
    if (S.workerBroken || typeof Worker !== "function" || typeof OffscreenCanvas !== "function") return null;
    if (S.worker) return S.worker;
    try {
      S.worker = new Worker(new URL(CORE_URL, document.baseURI).href);
      S.worker.onmessage = e => {
        const job = S.jobs.get(e.data?.id);
        if (!job) return;
        if (e.data.progress) { job.onProgress?.(e.data.progress); return; }
        S.jobs.delete(e.data.id);
        if (e.data.error) job.reject(Object.assign(new Error(e.data.error.message), { code: e.data.error.code }));
        else job.resolve(e.data.result);
      };
      S.worker.onerror = () => {
        S.workerBroken = true;
        try { S.worker.terminate(); } catch (_) {}
        S.worker = null;
        for (const [, job] of S.jobs) job.retryOnPage();
        S.jobs.clear();
      };
    } catch (_) { S.workerBroken = true; S.worker = null; }
    return S.worker;
  }
  async function optimizeFile(file, onProgress) {
    const cfg = await clientConfig();
    const settings = { optimize: cfg.optimize !== false, maxEdge: cfg.max_edge || 3000, preset: cfg.preset || "document", maxUploadMb: cfg.max_upload_mb || 15 };
    const onPage = async () => (await ensureCore()).optimize(file, settings, onProgress);
    const w = getWorker();
    if (!w) return onPage();
    return new Promise((resolve, reject) => {
      const id = ++S.jobSeq;
      S.jobs.set(id, { resolve, reject, onProgress, retryOnPage: () => onPage().then(resolve, reject) });
      w.postMessage({ id, file, settings });
    });
  }

  // ---- persistent queue (IndexedDB; memory if the browser blocks it) ----------------------
  let dbPromise = null;
  function db() {
    if (S.dbBroken || typeof indexedDB === "undefined") return Promise.resolve(null);
    if (!dbPromise) {
      dbPromise = new Promise(resolve => {
        try {
          const req = indexedDB.open(DB_NAME, 1);
          req.onupgradeneeded = () => { const d = req.result; if (!d.objectStoreNames.contains(STORE)) { const st = d.createObjectStore(STORE, { keyPath: "id" }); st.createIndex("owner", "ownerId"); } };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => { S.dbBroken = true; resolve(null); };
          req.onblocked = () => resolve(null);
        } catch (_) { S.dbBroken = true; resolve(null); }
      });
    }
    return dbPromise;
  }
  async function qPut(item) {
    const d = await db();
    if (!d) { S.memQueue.set(item.id, item); return; }
    await new Promise((res, rej) => { const tx = d.transaction(STORE, "readwrite"); tx.objectStore(STORE).put(item); tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
  }
  async function qDelete(id) {
    S.memQueue.delete(id);
    const d = await db();
    if (!d) return;
    await new Promise(res => { const tx = d.transaction(STORE, "readwrite"); tx.objectStore(STORE).delete(id); tx.oncomplete = res; tx.onerror = res; });
  }
  async function qAll(owner) {
    const d = await db();
    const mem = [...S.memQueue.values()].filter(i => i.ownerId === owner);
    if (!d) return mem;
    const rows = await new Promise(res => {
      try {
        const tx = d.transaction(STORE, "readonly");
        const r = tx.objectStore(STORE).index("owner").getAll(owner);
        r.onsuccess = () => res(r.result || []); r.onerror = () => res([]);
      } catch (_) { res([]); }
    });
    return rows.concat(mem);
  }

  // ---- index (which records have files) -------------------------------------------------
  const localPending = new Map(); // `${module}:${id}` -> count of queued uploads (this device)
  async function refreshLocalPending() {
    localPending.clear();
    const owner = ownerId();
    if (!owner) return;
    for (const it of await qAll(owner)) if (it.kind === "upload") { const k = `${it.module}:${it.recordId}`; localPending.set(k, (localPending.get(k) || 0) + 1); }
  }
  function loadIndex(force = false) {
    const owner = ownerId();
    if (!owner) return Promise.resolve();
    if (!force && S.indexOwner === owner && S.index.size >= 0 && S.indexLoadedAt) return Promise.resolve();
    if (S.indexPromise) return S.indexPromise;
    S.indexPromise = (async () => {
      await refreshLocalPending();
      const cfg = await clientConfig();
      if (cfg.enabled && navigator.onLine !== false && typeof supabaseRpc === "function") {
        try {
          const res = await supabaseRpc("app_attachment_index", {}, { offlineCache: false });
          const rows = Array.isArray(res?.rows) ? res.rows : [];
          const m = new Map();
          for (const r of rows) if (Array.isArray(r) && r.length === 3) m.set(`${r[0]}:${String(r[1]).toLowerCase()}`, Number(r[2]) || 0);
          S.index = m;
          S.indexLoadedAt = Date.now();
        } catch (_) { /* icons for files on the server appear after the next load */ }
      }
      S.indexOwner = owner;
      if (!S.indexLoadedAt) S.indexLoadedAt = -1;
    })().finally(() => { S.indexPromise = null; });
    S.indexPromise.then(() => { if (S.index.size || localPending.size) changed(); });
    return S.indexPromise;
  }
  function counts(module, id) {
    const k = `${module}:${String(id || "").toLowerCase()}`;
    return { stored: S.index.get(k) || 0, pending: localPending.get(k) || 0 };
  }
  function iconHtml(module, id) {
    if (!module || !isUuid(id)) return "";
    if (S.indexOwner !== ownerId()) { loadIndex(); return ""; }
    const c = counts(module, id);
    const n = c.stored + c.pending;
    if (!n) return "";
    const label = c.pending ? `${n} attachment${n === 1 ? "" : "s"} (${c.pending} waiting to upload)` : `${n} attachment${n === 1 ? "" : "s"}`;
    return `<button type="button" class="tm-att-icon${c.pending ? " is-pending" : ""}" data-tm-att-module="${esc(module)}" data-tm-att-record="${esc(id)}" title="${esc(label)}" aria-label="${esc(label)}"><i class="fa-solid fa-paperclip" aria-hidden="true"></i>${n > 1 ? `<span>${n}</span>` : ""}</button>`;
  }
  function iconForEntry(entry) { const r = refForEntry(entry); return r ? iconHtml(r.module, r.id) : ""; }
  // Icon for a ledger row known only by id (module from the row, or the given fallback).
  function iconForId(id, fallbackModule = "") {
    if (!isUuid(id)) return "";
    const entry = (session()?.entries || []).find(e => String(e.id) === String(id));
    const r = entry ? refForEntry(entry) : null;
    if (r) return iconHtml(r.module, r.id);
    return fallbackModule ? iconHtml(fallbackModule, String(id).toLowerCase()) : "";
  }
  // Forms that are only opened by other code: prepare the control whenever
  // the form's modal (or the form itself) becomes visible.
  function autoPrepare(form, module) {
    if (!form || form.dataset.tmAttAuto) return;
    form.dataset.tmAttAuto = "1";
    const target = form.closest(".modal") || form;
    let wasOpen = false;
    const check = () => {
      const open = !target.classList.contains("hide") && !form.classList.contains("hide");
      if (open && !wasOpen) prepare(form, module);
      wasOpen = open;
    };
    new MutationObserver(check).observe(target, { attributes: true, attributeFilter: ["class"] });
    if (target !== form) new MutationObserver(check).observe(form, { attributes: true, attributeFilter: ["class"] });
  }
  let changeTimer = 0;
  function changed() {
    clearTimeout(changeTimer);
    changeTimer = setTimeout(() => {
      try { window.dispatchEvent(new CustomEvent("triplem:attachments-changed")); } catch (_) {}
      // Lists re-render so icons appear or disappear (layout otherwise unchanged).
      try { if (typeof renderAll === "function") renderAll(); } catch (_) {}
    }, 120);
  }

  // ---- edge function --------------------------------------------------------------------
  function fnUrl(action) {
    const cfg = typeof getSupabaseConfig === "function" ? getSupabaseConfig() : null;
    if (!cfg?.supabaseUrl) return "";
    return `${String(cfg.supabaseUrl).replace(/\/$/, "")}/functions/v1/file-storage${action ? `?action=${action}` : ""}`;
  }
  async function callFn(body, { upload } = {}) {
    const cfg = typeof getSupabaseConfig === "function" ? getSupabaseConfig() : null;
    const url = fnUrl(upload ? "upload" : "");
    if (!url || !cfg?.supabaseKey) throw Object.assign(new Error("Storage service unavailable."), { retry: true });
    const headers = { apikey: cfg.supabaseKey, Authorization: `Bearer ${cfg.supabaseKey}`, "X-Session-Token": token() };
    let reqBody;
    if (upload) {
      headers["Content-Type"] = "application/octet-stream";
      const json = new TextEncoder().encode(JSON.stringify(upload.meta));
      let bin = ""; json.forEach(b => { bin += String.fromCharCode(b); });
      headers["X-Attachment"] = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      reqBody = upload.blob;
    } else {
      headers["Content-Type"] = "application/json";
      reqBody = JSON.stringify(body);
    }
    let res;
    try { res = await fetch(url, { method: "POST", headers, body: reqBody, cache: "no-store" }); }
    catch (_) { throw Object.assign(new Error("Network unavailable."), { retry: true, offline: true }); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data?.error || `Storage error (${res.status}).`), { status: res.status, code: data?.code, retry: !!data?.retry || res.status >= 500 });
    return data;
  }

  // ---- upload / delete pump --------------------------------------------------------------
  function schedule(ms) {
    clearTimeout(S.timer);
    S.timer = setTimeout(() => process(), Math.max(200, ms));
  }
  function process() {
    if (S.pump) { S.pumpAgain = true; return S.pump; }
    S.pump = (async () => {
      do {
        S.pumpAgain = false;
        await runQueue();
      } while (S.pumpAgain);
    })().finally(() => { S.pump = null; });
    return S.pump;
  }
  async function runQueue() {
    const owner = ownerId();
    if (!owner || !signedIn() || navigator.onLine === false) return;
    const items = (await qAll(owner)).sort((a, b) => a.createdAt - b.createdAt);
    if (!items.length) return;
    const cfg = await clientConfig(true);
    if (!cfg.enabled) { schedule(BACKOFF[4]); return; }
    const now = Date.now();
    let soonest = Infinity;
    const pendingUploads = new Set(items.filter(i => i.kind === "upload").map(i => i.id));
    for (const it of items) {
      if (it.status === "failed") continue;
      if (it.nextAt && it.nextAt > now) { soonest = Math.min(soonest, it.nextAt); continue; }
      if (it.kind === "delete" && (it.after || []).some(id => pendingUploads.has(id))) continue; // replacement first
      try {
        if (it.kind === "upload") {
          await callFn(null, { upload: { blob: it.blob, meta: { id: it.id, module: it.module, record_id: it.recordId, mime: it.mime, ...it.meta } } });
          await qDelete(it.id);
          pendingUploads.delete(it.id);
          const k = `${it.module}:${it.recordId}`;
          S.index.set(k, (S.index.get(k) || 0) + 1);
          localPending.set(k, Math.max(0, (localPending.get(k) || 1) - 1));
          if (!localPending.get(k)) localPending.delete(k);
        } else if (it.kind === "delete") {
          await callFn({ action: "delete", id: it.attachmentId });
          await qDelete(it.id);
          const k = `${it.module}:${it.recordId}`;
          const n = (S.index.get(k) || 1) - 1;
          if (n > 0) S.index.set(k, n); else S.index.delete(k);
        }
        changed();
      } catch (err) {
        if (err.offline) return; // resumes on the "online" event
        if (err.status === 401) return; // resumes after the next sign-in
        it.attempts = (it.attempts || 0) + 1;
        if (err.retry || err.code === "record_pending") {
          it.nextAt = Date.now() + BACKOFF[Math.min(it.attempts - 1, BACKOFF.length - 1)];
          it.lastError = err.message;
          soonest = Math.min(soonest, it.nextAt);
        } else {
          it.status = "failed";
          it.lastError = err.message;
          if (!S.notified.has(it.id)) { S.notified.add(it.id); notice(`Attachment "${it.name}" could not be uploaded: ${err.message}`, "error"); }
        }
        await qPut(it).catch(() => {});
      }
    }
    if (soonest < Infinity) schedule(soonest - Date.now());
  }

  // ---- viewer ------------------------------------------------------------------------------
  async function listFor(module, id) {
    const owner = ownerId();
    const local = (await qAll(owner)).filter(i => i.kind === "upload" && i.module === module && i.recordId === id)
      .map(i => ({ id: i.id, name: i.name, mime: i.mime, size: i.blob?.size || 0, local: i, pending: true, failed: i.status === "failed", error: i.lastError }));
    const deleting = new Set((await qAll(owner)).filter(i => i.kind === "delete").map(i => i.attachmentId));
    let remote = [];
    if (navigator.onLine !== false && typeof supabaseRpc === "function") {
      try { remote = (await supabaseRpc("app_attachment_list", { p_module: module, p_record_id: id }, { offlineCache: false }))?.items || []; } catch (_) { remote = []; }
    }
    return (Array.isArray(remote) ? remote : []).filter(r => !deleting.has(r.id)).concat(local);
  }
  async function linkFor(att, disposition = "inline") {
    if (att.local) return URL.createObjectURL(att.local.blob);
    const r = await callFn({ action: "download", id: att.id, disposition });
    return r.url;
  }
  function closeViewer() { document.getElementById("tmAttViewer")?.remove(); }
  async function openViewer(module, id, focusId) {
    closeViewer();
    const root = document.createElement("div");
    root.id = "tmAttViewer";
    root.className = "tm-att-viewer";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Attachments");
    root.innerHTML = `<div class="tm-att-viewer-card"><div class="tm-att-viewer-head"><strong><i class="fa-solid fa-paperclip" aria-hidden="true"></i> Attachments</strong><button type="button" class="icon-btn ghost" data-tm-att-close aria-label="Close">×</button></div>
      <div class="tm-att-viewer-body"><div class="tm-att-viewer-list" role="list"><div class="tm-att-muted">Loading…</div></div><div class="tm-att-viewer-stage"></div></div></div>`;
    document.body.appendChild(root);
    root.addEventListener("click", e => { if (e.target === root || e.target.closest("[data-tm-att-close]")) closeViewer(); });
    root.addEventListener("keydown", e => { if (e.key === "Escape") { e.stopPropagation(); closeViewer(); } });
    root.tabIndex = -1; root.focus();
    const items = await listFor(module, id);
    const list = root.querySelector(".tm-att-viewer-list");
    if (!items.length) { list.innerHTML = `<div class="tm-att-muted">No attachments.</div>`; return; }
    list.innerHTML = items.map((a, i) => `<button type="button" class="tm-att-viewer-item" role="listitem" data-i="${i}"><i class="fa-solid ${a.mime === "application/pdf" ? "fa-file-pdf" : "fa-image"}" aria-hidden="true"></i><span><strong>${esc(a.name || "Attachment")}</strong><small>${esc(fmtSize(a.size || 0))}${a.pending ? (a.failed ? " · upload failed" : " · waiting to upload") : ""}</small></span></button>`).join("");
    const stage = root.querySelector(".tm-att-viewer-stage");
    let urls = [];
    const show = async i => {
      const a = items[i];
      list.querySelectorAll(".tm-att-viewer-item").forEach(b => b.classList.toggle("is-active", Number(b.dataset.i) === i));
      stage.innerHTML = `<div class="tm-att-muted">Opening…</div>`;
      try {
        const url = await linkFor(a);
        if (a.local) urls.push(url);
        const dl = a.local ? url : await linkFor(a, "attachment").catch(() => url);
        if (a.local && dl !== url) urls.push(dl);
        stage.innerHTML = (a.mime === "application/pdf"
          ? `<div class="tm-att-pdf"><i class="fa-solid fa-file-pdf" aria-hidden="true"></i><strong>${esc(a.name)}</strong><a class="btn primary" href="${esc(url)}" target="_blank" rel="noopener">Open PDF</a></div>`
          : `<img class="tm-att-img" alt="${esc(a.name)}" src="${esc(url)}">`)
          + `<div class="tm-att-viewer-actions"><a class="btn ghost tiny" href="${esc(dl)}" download="${esc(a.name)}" rel="noopener"><i class="fa-solid fa-download" aria-hidden="true"></i> Download</a>${a.pending ? `<span class="tm-att-muted">${a.failed ? esc(a.error || "Upload failed") : "Stored on this device until it is uploaded."}</span>` : ""}</div>`;
      } catch (err) {
        stage.innerHTML = `<div class="tm-att-muted">${esc(err.offline ? "Connect to the internet to open this file." : err.message)}</div>`;
      }
    };
    list.addEventListener("click", e => { const b = e.target.closest(".tm-att-viewer-item"); if (b) show(Number(b.dataset.i)); });
    const start = Math.max(0, items.findIndex(a => a.id === focusId));
    show(start);
    const obs = new MutationObserver(() => { if (!root.isConnected) { urls.forEach(u => URL.revokeObjectURL(u)); obs.disconnect(); } });
    obs.observe(document.body, { childList: true });
  }
  // List icons: open the viewer without triggering the row's own actions.
  document.addEventListener("click", e => {
    const b = e.target.closest?.(".tm-att-icon");
    if (!b) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.();
    openViewer(b.dataset.tmAttModule, b.dataset.tmAttRecord);
  }, true);
  ["pointerdown", "mousedown"].forEach(t => document.addEventListener(t, e => { if (e.target.closest?.(".tm-att-icon")) e.stopPropagation(); }, true));

  // ---- form control ------------------------------------------------------------------------
  function controlHtml() {
    const touch = matchMedia?.("(pointer: coarse)")?.matches;
    return `<div class="tm-att-head">
        <button type="button" class="tm-att-add"><i class="fa-solid fa-paperclip" aria-hidden="true"></i> Attach receipt / invoice</button>
        ${touch ? `<button type="button" class="tm-att-cam" aria-label="Take a photo"><i class="fa-solid fa-camera" aria-hidden="true"></i></button>` : ""}
        <span class="tm-att-hint">JPG, PNG, WebP or PDF</span>
      </div>
      <ul class="tm-att-list" aria-live="polite"></ul>
      <input type="file" class="tm-att-input" accept="${ACCEPT}" multiple hidden>
      <input type="file" class="tm-att-camera" accept="image/*" capture="environment" hidden>`;
  }
  function mount(form, opts = {}) {
    if (!form || S.controls.has(form)) return S.controls.get(form) || null;
    const host = document.createElement("div");
    host.className = "tm-att field w12";
    host.innerHTML = controlHtml();
    const footer = opts.before || form.querySelector(".modal-footer, .modal-actions") || form.querySelector('button[type="submit"]')?.parentElement;
    if (footer && footer.parentElement) footer.parentElement.insertBefore(host, footer); else form.appendChild(host);
    const ctl = { form, host, module: opts.module, items: [], existing: [], removed: new Set(), ref: null, gen: 0 };
    S.controls.set(form, ctl);
    const input = host.querySelector(".tm-att-input");
    const camera = host.querySelector(".tm-att-camera");
    host.querySelector(".tm-att-add").addEventListener("click", () => input.click());
    host.querySelector(".tm-att-cam")?.addEventListener("click", () => camera.click());
    const onPick = e => { addFiles(ctl, [...(e.target.files || [])]); e.target.value = ""; };
    input.addEventListener("change", onPick);
    camera.addEventListener("change", onPick);
    host.addEventListener("click", e => {
      const b = e.target.closest("[data-tm-att-act]");
      if (!b) return;
      const key = b.dataset.key;
      if (b.dataset.tmAttAct === "remove") {
        const it = ctl.items.find(x => x.key === key);
        if (it) { if (it.preview) URL.revokeObjectURL(it.preview); ctl.items = ctl.items.filter(x => x.key !== key); }
        else if (ctl.existing.some(x => x.id === key)) ctl.removed.add(key);
        renderControl(ctl);
      } else if (b.dataset.tmAttAct === "undo") { ctl.removed.delete(key); renderControl(ctl); }
      else if (b.dataset.tmAttAct === "view") {
        const it = ctl.items.find(x => x.key === key);
        if (it?.result) window.open(URL.createObjectURL(it.result.blob), "_blank", "noopener");
        else if (ctl.ref) openViewer(ctl.ref.module, ctl.ref.id, key);
      } else if (b.dataset.tmAttAct === "original") {
        const it = ctl.items.find(x => x.key === key);
        if (it) useOriginal(ctl, it);
      }
    });
    renderControl(ctl);
    return ctl;
  }
  function renderControl(ctl) {
    const list = ctl.host.querySelector(".tm-att-list");
    const rows = [];
    for (const a of ctl.existing) {
      const gone = ctl.removed.has(a.id);
      rows.push(`<li class="tm-att-row${gone ? " is-removed" : ""}"><span class="tm-att-thumb"><i class="fa-solid ${a.mime === "application/pdf" ? "fa-file-pdf" : "fa-image"}" aria-hidden="true"></i></span>
        <span class="tm-att-text"><strong>${esc(a.name)}</strong><small>${gone ? "Will be removed when you save" : esc(fmtSize(a.size || 0)) + (a.pending ? " · waiting to upload" : "")}</small></span>
        <span class="tm-att-acts">${gone ? `<button type="button" data-tm-att-act="undo" data-key="${esc(a.id)}">Undo</button>` : `<button type="button" data-tm-att-act="view" data-key="${esc(a.id)}" aria-label="View">View</button>${a.can_remove === false ? "" : `<button type="button" data-tm-att-act="remove" data-key="${esc(a.id)}" aria-label="Remove ${esc(a.name)}">×</button>`}`}</span></li>`);
    }
    for (const it of ctl.items) {
      const r = it.result;
      let info = "Optimising…";
      if (it.error) info = it.error;
      else if (r && r.optimized && r.savedBytes > 0) info = `Image optimised: ${fmtSize(r.originalSize)} → ${fmtSize(r.size)}`;
      else if (r) info = `${fmtSize(r.size)}${r.mime === "application/pdf" ? " · PDF" : ""}`;
      const thumb = it.preview ? `<img src="${esc(it.preview)}" alt="" decoding="async">` : `<i class="fa-solid ${r?.mime === "application/pdf" ? "fa-file-pdf" : "fa-image"}" aria-hidden="true"></i>`;
      rows.push(`<li class="tm-att-row${it.error ? " is-error" : ""}${!r && !it.error ? " is-busy" : ""}"><span class="tm-att-thumb">${thumb}</span>
        <span class="tm-att-text"><strong>${esc(it.file.name || "Photo")}</strong><small>${esc(info)}</small></span>
        <span class="tm-att-acts">${it.canUseOriginal ? `<button type="button" data-tm-att-act="original" data-key="${esc(it.key)}">Attach original</button>` : ""}${r ? `<button type="button" data-tm-att-act="view" data-key="${esc(it.key)}">Preview</button>` : ""}<button type="button" data-tm-att-act="remove" data-key="${esc(it.key)}" aria-label="Remove ${esc(it.file.name || "file")}">×</button></span></li>`);
    }
    list.innerHTML = rows.join("");
    const total = ctl.items.length + ctl.existing.filter(a => !ctl.removed.has(a.id)).length;
    ctl.host.querySelector(".tm-att-add").disabled = total >= MAX_FILES_PER_RECORD;
  }
  async function addFiles(ctl, files) {
    const room = MAX_FILES_PER_RECORD - ctl.items.length - ctl.existing.filter(a => !ctl.removed.has(a.id)).length;
    for (const file of files.slice(0, Math.max(0, room))) {
      const it = { key: uuid(), file, result: null, error: "", preview: "" };
      ctl.items.push(it);
      renderControl(ctl);
      try {
        it.result = await optimizeFile(file, () => {});
        if (it.result.mime !== "application/pdf") it.preview = URL.createObjectURL(it.result.thumb || it.result.blob);
      } catch (err) {
        it.error = err.message || "This file cannot be attached.";
        // Optimisation failed but the file itself is a valid image: offer the original as-is.
        it.canUseOriginal = ["decode", "encode"].includes(err.code) && /^image\/(jpeg|png|webp)$/.test(file.type) && file.size <= ((await clientConfig()).max_upload_mb || 15) * 1048576;
      }
      if (ctl.items.includes(it)) renderControl(ctl);
    }
    if (files.length > room) notice(`A record can have at most ${MAX_FILES_PER_RECORD} attachments.`, "warning");
  }
  async function useOriginal(ctl, it) {
    const bytes = new Uint8Array(await it.file.slice(0, 16).arrayBuffer());
    const core = await ensureCore().catch(() => null);
    const mime = core ? core.sniff(bytes) : it.file.type;
    if (!/^image\/(jpeg|png|webp)$/.test(mime)) { it.error = "This file cannot be attached."; it.canUseOriginal = false; renderControl(ctl); return; }
    it.result = { blob: it.file, mime, size: it.file.size, originalName: it.file.name, originalMime: mime, originalSize: it.file.size, method: "original-fallback", optimized: false, version: core?.VERSION || 1 };
    it.error = ""; it.canUseOriginal = false; it.preview = URL.createObjectURL(it.file);
    renderControl(ctl);
  }
  function reset(form) {
    const ctl = S.controls.get(form);
    if (!ctl) return;
    ctl.items.forEach(it => it.preview && URL.revokeObjectURL(it.preview));
    ctl.items = []; ctl.existing = []; ctl.removed = new Set(); ctl.ref = null; ctl.gen += 1;
    renderControl(ctl);
  }
  async function showExisting(form, ref) {
    const ctl = S.controls.get(form);
    if (!ctl || !ref) return;
    reset(form);
    ctl.ref = ref;
    const gen = ctl.gen;
    const list = await listFor(ref.module, ref.id);
    if (gen !== ctl.gen) return;
    ctl.existing = list.map(a => ({ id: a.id, name: a.name, mime: a.mime, size: a.size, pending: !!a.pending, can_remove: a.pending ? true : a.can_remove !== false, local: a.local }));
    renderControl(ctl);
  }
  // Called when a form opens: adds the control once, clears it, and shows it
  // only when file storage is enabled (no request until a form is used).
  function prepare(form, module) {
    if (!form || !signedIn()) return null;
    const ctl = mount(form, { module });
    if (!ctl) return null;
    reset(form);
    ctl.host.hidden = !(S.cfg && S.cfg.enabled);
    clientConfig().then(c => { ctl.host.hidden = !c.enabled; }).catch(() => {});
    return ctl;
  }
  function busy(form) { const c = S.controls.get(form); return !!c && c.items.some(it => !it.result && !it.error); }
  // Takes the selections out of the form (the form may reset while saving).
  function take(form) {
    const ctl = S.controls.get(form);
    if (!ctl) return null;
    return { ctl, items: ctl.items.slice(), removed: [...ctl.removed], existing: ctl.existing.slice(), ref: ctl.ref };
  }
  function restore(snap) {
    if (!snap) return;
    snap.ctl.items = snap.items; snap.ctl.removed = new Set(snap.removed); snap.ctl.existing = snap.existing; snap.ctl.ref = snap.ref;
    renderControl(snap.ctl);
  }
  // Saves the chosen files for a record that was just saved (online or offline).
  async function commit(snap, ref) {
    if (!snap || !ref || !isUuid(ref.id)) return { queued: 0 };
    const owner = ownerId();
    if (!owner) return { queued: 0 };
    const ready = snap.items.filter(it => it.result);
    const uploadIds = [];
    for (const it of ready) {
      const r = it.result;
      const id = uuid();
      uploadIds.push(id);
      await qPut({
        id, kind: "upload", ownerId: owner, module: ref.module, recordId: ref.id.toLowerCase(), name: it.file.name || "Photo",
        mime: r.mime, blob: r.blob, createdAt: Date.now(), attempts: 0, nextAt: Date.now() + 1500,
        meta: {
          original_name: String(it.file.name || "").slice(0, 200), original_mime: r.originalMime || it.file.type || r.mime, original_size: r.originalSize || it.file.size,
          original_width: r.originalWidth ?? null, original_height: r.originalHeight ?? null,
          compression: { method: r.method, quality: r.quality ?? null, preset: r.preset || null, max_edge: r.maxEdge || null, version: r.version || 1, at: new Date().toISOString(), saved_bytes: r.savedBytes || 0 }
        }
      });
      if (it.preview) URL.revokeObjectURL(it.preview);
    }
    for (const attId of snap.removed) {
      const ex = snap.existing.find(a => a.id === attId);
      if (ex?.local) { await qDelete(ex.id); continue; } // never uploaded: just drop it
      await qPut({ id: uuid(), kind: "delete", ownerId: owner, attachmentId: attId, module: ref.module, recordId: ref.id.toLowerCase(), after: uploadIds, createdAt: Date.now(), attempts: 0 });
    }
    await refreshLocalPending();
    changed();
    schedule(1500);
    const skipped = snap.items.length - ready.length;
    if (ready.length) notice(navigator.onLine === false ? `Attachment saved on this device. It uploads when you are back online.` : `Attachment${ready.length === 1 ? "" : "s"} uploading…`, "info");
    if (skipped) notice(`${skipped} file${skipped === 1 ? " was" : "s were"} not attached.`, "warning");
    return { queued: ready.length, removed: snap.removed.length };
  }
  // Runs a save and returns the ledger rows it created (saveEntriesImmediately reports them).
  async function capture(fn) {
    const rows = [];
    const prev = S.captureRows;
    S.captureRows = rows;
    try { const result = await fn(); return { result, rows }; }
    finally { S.captureRows = prev; }
  }
  function reportSaved(rows) { if (S.captureRows && Array.isArray(rows)) S.captureRows.push(...rows); }
  function pickRef(rows, modules) {
    for (const m of modules) for (const row of rows || []) { const r = refForEntry(row); if (r && r.module === m) return r; }
    return null;
  }
  // One call for ledger forms: take selections, save, link them to the saved row.
  async function saveWithAttachments(form, modules, save) {
    const snap = take(form);
    const editId = String(form?.dataset?.editEntryId || "").trim();
    let out;
    try { out = await capture(save); }
    catch (err) { restore(snap); throw err; }
    if (!snap || (!snap.items.length && !snap.removed.length)) return out.result;
    let ref = pickRef(out.rows, modules);
    if (!ref && editId) {
      const entry = (session()?.entries || []).find(e => String(e.id) === editId);
      ref = refForEntry(entry) || (isUuid(editId) && snap.ref ? snap.ref : null);
    }
    if (!ref && snap.ref) ref = snap.ref;
    if (ref) await commit(snap, ref).catch(err => notice(`Attachments could not be stored on this device: ${err.message}`, "error"));
    return out.result;
  }

  // ---- triggers (no polling) -----------------------------------------------------------------
  window.addEventListener("online", () => schedule(500));
  window.addEventListener("triplem:offline-entry-synced", () => schedule(800));
  let started = false;
  function startOnce() {
    if (started || !signedIn()) return;
    started = true;
    schedule(4000); // uploads left from an earlier session
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { startOnce(); } });
  setTimeout(startOnce, 6000);

  window.TriplemAttachments = Object.freeze({
    mount, prepare, reset, showExisting, busy, take, restore, commit, capture, reportSaved, saveWithAttachments,
    refForEntry, iconHtml, iconForEntry, iconForId, autoPrepare, openViewer, loadIndex, process, clientConfig,
    _test: Object.freeze({ pickRef, qAll, counts, MODULE_BY_TABLE })
  });
})();
