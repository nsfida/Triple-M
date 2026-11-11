/* Triplem VIP Inventory 2.0 - Phase 6: offline selling and sync.
 *
 * What a till needs to keep selling without internet is kept on the device (IndexedDB):
 * products, prices, barcodes and pack barcodes, IMEI/serial numbers in stock and
 * customers, refreshed when the POS opens online (one call, no polling).
 *
 * A sale completed offline - or whose reply never arrived - is stored on the device
 * with the client operation id created when the payment window opened and a
 * provisional number (OFF-<till>-<n>) printed on a receipt marked provisional.
 * When the connection returns (the browser's "online" event, opening Inventory 2.0
 * or the POS, or "Sync now") the sales are sent one by one with that same id, so a
 * sale is saved once even if it is sent twice. The server gives the final number,
 * moves stock, takes the payment, posts to Accounting and lists anything the till
 * could not check (a shortfall, an IMEI already sold by another till, a price outside
 * the rules) for review. A sale the server cannot accept stays on the device, shown
 * in the sync list with the reason; nothing is deleted automatically.
 */
(function () {
  "use strict";
  const I = () => window.TriplemInv2;
  const Shell = () => window.TriplemInventoryV2Shell;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const DB = "triplem-inv2-offline-v1";
  const DEV_KEY = "triplem-inv2-device-v1";
  const SEQ_KEY = "triplem-inv2-offline-seq-v1";
  const DONE_KEY = "triplem-inv2-synced-v1";
  const ownerKey = () => { const u = (typeof state !== "undefined" ? state : null)?.sessionUser; return u ? (u.team_owner_id || u.id) : ""; };
  const S = { db: null, syncing: null, timer: 0, backoff: 0, mem: { catalog: new Map(), queue: new Map() }, broken: false };

  // ---- storage -------------------------------------------------------------------------------
  function open() {
    if (S.db) return S.db;
    S.db = new Promise(resolve => {
      try {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => {
          const d = req.result;
          if (!d.objectStoreNames.contains("catalog")) d.createObjectStore("catalog", { keyPath: "key" });
          if (!d.objectStoreNames.contains("queue")) { const q = d.createObjectStore("queue", { keyPath: "op" }); q.createIndex("owner", "owner"); }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => { S.broken = true; resolve(null); };
        req.onblocked = () => { S.broken = true; resolve(null); };
      } catch (_) { S.broken = true; resolve(null); }
    });
    return S.db;
  }
  async function tx(store, mode, fn) {
    const d = await open();
    if (!d) return fn(null);
    return new Promise((resolve, reject) => {
      const t = d.transaction(store, mode); const os = t.objectStore(store); let out;
      Promise.resolve(fn(os)).then(r => { out = r; });
      t.oncomplete = () => resolve(out); t.onerror = () => reject(t.error); t.onabort = () => reject(t.error);
    });
  }
  const req2p = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  async function put(store, value) {
    if (S.broken) { S.mem[store].set(value.key || value.op, value); return; }
    await tx(store, "readwrite", os => os ? req2p(os.put(value)) : S.mem[store].set(value.key || value.op, value));
  }
  async function get(store, key) {
    if (S.broken) return S.mem[store].get(key) || null;
    return tx(store, "readonly", os => os ? req2p(os.get(key)) : S.mem[store].get(key) || null);
  }
  async function del(store, key) {
    if (S.broken) { S.mem[store].delete(key); return; }
    await tx(store, "readwrite", os => os ? req2p(os.delete(key)) : S.mem[store].delete(key));
  }
  async function queueAll(owner = ownerKey()) {
    if (S.broken) return [...S.mem.queue.values()].filter(x => x.owner === owner);
    const rows = await tx("queue", "readonly", os => os ? req2p(os.index("owner").getAll(owner)) : [...S.mem.queue.values()].filter(x => x.owner === owner));
    return (rows || []).sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  // ---- device and numbers ----------------------------------------------------------------------
  function device() {
    let d = "";
    try { d = localStorage.getItem(DEV_KEY) || ""; } catch (_) {}
    if (!/^[A-Z0-9]{6}$/.test(d)) {
      const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const r = crypto?.getRandomValues ? crypto.getRandomValues(new Uint8Array(6)) : Array.from({ length: 6 }, () => Math.random() * 256);
      d = Array.from(r, x => abc[x % abc.length]).join("");
      try { localStorage.setItem(DEV_KEY, d); } catch (_) {}
    }
    return d;
  }
  function nextOfflineNo() {
    const dev = device(); let all = {};
    try { all = JSON.parse(localStorage.getItem(SEQ_KEY) || "{}"); } catch (_) {}
    const k = `${ownerKey()}|${dev}`; all[k] = (all[k] || 0) + 1;
    try { localStorage.setItem(SEQ_KEY, JSON.stringify(all)); } catch (_) {}
    return `OFF-${dev}-${String(all[k]).padStart(4, "0")}`;
  }

  // ---- connectivity ----------------------------------------------------------------------------
  // A workspace opened while offline stays offline until the app has re-checked the sign-in.
  const resumedOffline = () => { try { return typeof state !== "undefined" && !!state.offlineSync?.offlineSession; } catch (_) { return false; } };
  const online = () => navigator.onLine !== false && !resumedOffline();
  // A request that never got an answer (as opposed to the server refusing it).
  function isNetworkError(e) {
    const m = String(e?.message || e || "");
    return !online() || e?.offline === true || /network|failed to fetch|fetch failed|load failed|connection|timed? ?out|Database request failed|NetworkError|ERR_/i.test(m);
  }

  // ---- catalogue -------------------------------------------------------------------------------
  const catKey = loc => `${ownerKey()}|${loc || "default"}`;
  async function refreshCatalog(loc) {
    if (!online()) return getCatalog(loc);
    try {
      const data = await I().rpc("app_inv2_pos_catalog", { p_location_id: loc || null });
      if (!data || !Array.isArray(data.items)) return getCatalog(loc);
      // Sales still waiting on this device have already taken stock and serials.
      const waiting = await queueAll();
      waiting.forEach(q => applySale(data, q.payload));
      await put("catalog", { key: catKey(loc), at: Date.now(), data });
      return data;
    } catch (_) { return getCatalog(loc); }
  }
  async function getCatalog(loc) { const r = await get("catalog", catKey(loc)).catch(() => null); return r ? r.data : null; }
  async function catalogAge(loc) { const r = await get("catalog", catKey(loc)).catch(() => null); return r ? r.at : 0; }
  function applySale(data, payload) {
    for (const l of payload.lines || []) {
      const it = data.items.find(x => x.variant_id === l.variant_id);
      if (it && it.product_type === "stock") it.qty = Number(it.qty) - Number(l.qty) * Number(l.factor || 1);
      if ((l.serials || []).length) data.serials = (data.serials || []).filter(([sn]) => !l.serials.includes(sn));
    }
    for (const p of payload.payments || []) void p;
  }
  // Keeps the stored figures in step after a sale made online or offline on this till.
  async function noteSale(loc, payload) {
    const r = await get("catalog", catKey(loc)).catch(() => null);
    if (!r) return;
    applySale(r.data, payload);
    await put("catalog", r);
  }
  function searchLocal(data, q, cat) {
    if (!data) return [];
    const t = String(q || "").trim().toLowerCase();
    return data.items.filter(x => (!cat || x.category_id === cat) && (!t || [x.name, x.variant_name, x.sku].some(v => String(v || "").toLowerCase().includes(t)) || x.barcodes.some(b => b.code === String(q).trim())))
      .slice(0, 60);
  }
  function lookupLocal(data, code) {
    if (!data) return null;
    const c = String(code || "").trim(); if (!c) return null;
    for (const it of data.items) {
      const b = it.barcodes.find(x => x.code === c);
      if (b) return { item: it, product_unit_id: b.product_unit_id, factor: Number(b.factor || 1), unit_label: b.unit_label };
    }
    const sku = data.items.find(x => String(x.sku || "").toLowerCase() === c.toLowerCase());
    if (sku) return { item: sku, factor: 1 };
    const sn = (data.serials || []).find(([s]) => s === c);
    if (sn) { const it = data.items.find(x => x.variant_id === sn[1]); if (it) return { item: it, factor: 1, serial: c }; }
    return null;
  }
  const serialsFor = (data, variant) => (data?.serials || []).filter(([, v]) => v === variant).map(([s]) => s);

  // ---- queue -------------------------------------------------------------------------------------
  async function enqueue(op, payload, summary) {
    // Limited access (trial or plan ended, grace over): the server would refuse this sale.
    if (window.TriplemLimitedAccess?.blocksWrites?.()) {
      window.TriplemLimitedAccess.refuseOffline();
      const e = new Error("Limited access: new entries are paused until a plan is approved.");
      e.isLimitedAccess = true;
      throw e;
    }
    const item = { op, owner: ownerKey(), created_at: new Date().toISOString(), payload, summary, status: "waiting", attempts: 0, last_error: "", sent: !!summary.sent };
    await put("queue", item);
    await noteSale(payload.location_id, payload);
    announce();
    if (online()) schedule(800);
    return item;
  }
  async function count() { const q = await queueAll().catch(() => []); return { waiting: q.filter(x => x.status === "waiting").length, error: q.filter(x => x.status === "error").length, total: q.length }; }

  function schedule(ms) { clearTimeout(S.timer); S.timer = setTimeout(() => sync(), Math.max(300, ms)); }
  async function sync({ manual = false } = {}) {
    if (S.syncing) return S.syncing;
    if (!online() || !ownerKey()) return { sent: 0 };
    S.syncing = (async () => {
      let sent = 0, failed = 0, network = false;
      const rows = await queueAll();
      for (const q of rows) {
        if (q.status === "error" && !manual) continue;
        try {
          const r = await I().rpc("app_inv2_sale_save", { p_client_op_id: q.op, p_sale: q.payload });
          await del("queue", q.op);
          remember(q.payload.offline_no, r);
          sent++;
          window.dispatchEvent(new CustomEvent("triplem:inv2-synced", { detail: { offline_no: q.payload.offline_no, result: r } }));
        } catch (e) {
          if (isNetworkError(e)) { network = true; q.attempts++; q.last_error = ""; await put("queue", q); break; }
          // The server refused it: keep it on the device with the reason, for the owner to see.
          q.status = "error"; q.attempts++; q.last_error = String(e?.message || e).slice(0, 300); await put("queue", q); failed++;
        }
      }
      if (network) { S.backoff = Math.min(S.backoff ? S.backoff * 2 : 5000, 300000); schedule(S.backoff); } else S.backoff = 0;
      announce();
      if (sent) { try { I().invalidateSummary(); } catch (_) {} }
      return { sent, failed, network };
    })().finally(() => { S.syncing = null; });
    return S.syncing;
  }
  function remember(offlineNo, r) {
    try { const all = JSON.parse(localStorage.getItem(DONE_KEY) || "{}"); all[offlineNo] = { id: r.id, doc_no: r.doc_no, at: Date.now(), issues: r.issues || 0 }; const keys = Object.keys(all).sort((a, b) => all[b].at - all[a].at); keys.slice(200).forEach(k => delete all[k]); localStorage.setItem(DONE_KEY, JSON.stringify(all)); } catch (_) {}
  }
  function synced(offlineNo) { try { return JSON.parse(localStorage.getItem(DONE_KEY) || "{}")[offlineNo] || null; } catch (_) { return null; } }

  // ---- status in the top bar ---------------------------------------------------------------------
  async function announce() {
    const c = await count();
    window.dispatchEvent(new CustomEvent("triplem:inv2-queue", { detail: c }));
    const root = Shell()?.root?.();
    const pill = root?.querySelector("[data-inv2-sync]");
    if (pill) {
      pill.hidden = c.total === 0;
      pill.classList.toggle("is-error", c.error > 0);
      pill.innerHTML = `<i class="fa-solid ${c.error ? "fa-triangle-exclamation" : "fa-cloud-arrow-up"}" aria-hidden="true"></i> ${c.total} to sync`;
    }
  }

  async function openCenter() {
    const rows = await queueAll();
    const c = await count();
    const d = I().dialog({
      title: "Sales waiting to sync", subtitle: online() ? "Sent automatically while the connection is on" : "Offline — they are sent when the connection is back",
      wide: true,
      body: rows.length ? `<div class="inv2-sync-list">${rows.map(q => `<div class="inv2-sync-row ${q.status}">
          <span><strong>${esc(q.payload.offline_no)}</strong><small>${esc(I().dateTime(q.created_at))} · ${q.payload.lines.length} line${q.payload.lines.length === 1 ? "" : "s"}${q.summary?.customer ? ` · ${esc(q.summary.customer)}` : ""}</small>
            ${q.status === "error" ? `<small class="bad">Not accepted: ${esc(q.last_error)}</small>` : q.attempts ? `<small class="warn">Tried ${q.attempts} time${q.attempts === 1 ? "" : "s"}; waiting for the connection</small>` : ""}</span>
          <strong>${esc(I().money(q.summary?.total || 0))}</strong>
          <button type="button" class="inv2-icon-btn small" data-reprint="${esc(q.op)}" title="Reprint provisional receipt" aria-label="Reprint provisional receipt"><i class="fa-solid fa-receipt" aria-hidden="true"></i></button></div>`).join("")}</div>
          ${c.error ? `<p class="inv2-note">A sale the server did not accept stays here with the reason. Fix the reason (for example re-open the location or restore the product) and press Sync now. It is never deleted automatically.</p>` : ""}`
        : `<div class="inv2-empty inv2-empty-ok"><i class="fa-solid fa-circle-check" aria-hidden="true"></i><p>Everything is synced.</p></div>`,
      onOpen(f, dd) {
        const foot = f.querySelector(".inv2-dialog-foot");
        foot.innerHTML = `${rows.length ? `<button type="button" class="inv2-btn primary" data-sync-now${online() ? "" : " disabled"}><i class="fa-solid fa-rotate" aria-hidden="true"></i> Sync now</button>` : ""}<button type="button" class="inv2-btn" data-close-x>Close</button>`;
        foot.querySelector("[data-close-x]").addEventListener("click", () => dd.close(true));
        foot.querySelector("[data-sync-now]")?.addEventListener("click", async e => {
          e.target.disabled = true;
          const r = await sync({ manual: true });
          dd.close(true);
          Shell().toast(r.sent ? `${r.sent} sale${r.sent === 1 ? "" : "s"} synced.${r.failed ? ` ${r.failed} not accepted.` : ""}` : r.network ? "Still offline." : r.failed ? "The server did not accept a sale; see the reason." : "Nothing to sync.");
          if (r.failed || r.network) openCenter();
        });
        f.querySelectorAll("[data-reprint]").forEach(b => b.addEventListener("click", () => { const q = rows.find(x => x.op === b.dataset.reprint); if (q) window.TriplemInv2Print.print(window.TriplemInv2Print.receiptHtml(q.summary.receipt)); }));
      }
    });
    return d;
  }

  // ---- triggers (no polling) ---------------------------------------------------------------------
  window.addEventListener("online", () => schedule(1200));
  // When the app finishes reconnecting a workspace that was opened offline it schedules its own
  // sync; waiting sales follow straight after (same moment, no extra timers).
  if (typeof window.scheduleOfflineSync === "function" && !window.scheduleOfflineSync.__inv2) {
    const core = window.scheduleOfflineSync;
    const wrapped = function () { const r = core.apply(this, arguments); if (online()) schedule(1500); return r; };
    wrapped.__inv2 = true; window.scheduleOfflineSync = wrapped;
  }
  window.addEventListener("offline", () => { clearTimeout(S.timer); announce(); });
  function init() {
    const sh = Shell(); if (!sh) return;
    const root = () => sh.root?.();
    // The top-bar pill is added to the shell the first time it is built.
    const add = () => {
      const r = root(); if (!r || r.querySelector("[data-inv2-sync]")) return;
      r.querySelector("[data-inv2-offline]")?.insertAdjacentHTML("afterend", `<button type="button" class="inv2-sync-pill" data-inv2-sync hidden></button>`);
      r.querySelector("[data-inv2-sync]")?.addEventListener("click", openCenter);
    };
    const prev = window.TriplemInventoryV2Shell.open;
    window.TriplemInventoryV2Shell.open = async function () { const p = prev.apply(this, arguments); add(); announce(); schedule(1500); return p; };
  }

  window.TriplemInv2Offline = { device, nextOfflineNo, online, isNetworkError, refreshCatalog, getCatalog, catalogAge, searchLocal, lookupLocal, serialsFor, noteSale, enqueue, queueAll, count, sync, openCenter, synced, announce };
  if (window.TriplemInventoryV2Shell) init(); else document.addEventListener("DOMContentLoaded", init);
})();
