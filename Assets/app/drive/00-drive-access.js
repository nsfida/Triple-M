/* Triplem Drive - access, Home card and lazy loader (migration 236, 2026-11-23).
 *
 * This is the only Triplem Drive file every signed-in user downloads (a few KB). It
 * - draws the "Triplem Drive" Home card only when the Main Admin switched Triplem Drive on for
 *   the account (settings.TriplemDrive, part of the profile the app already has: no request);
 * - loads the Triplem Drive application (scripts + styles) the first time the card is opened;
 * - lets the Main Admin's Admin › user › Features switch open the activation dialog (loaded on demand);
 * - adds "Open booking" to Triplem Drive booking notifications.
 * The server is the authority: every Triplem Drive function checks the account again
 * (app_drive__owner), so a hidden or forged card cannot open anyone's data.
 */
(function (global) {
  "use strict";

  const V = "20261123-td6";
  const APP_SCRIPTS = ["Assets/app/drive/02-drive-app.js", "Assets/app/drive/03-drive-ops.js", "Assets/app/drive/04-drive-setup.js"];
  const APP_CSS = "Assets/drive/drive-app.css";
  const ADMIN_SCRIPT = "Assets/app/drive/01-drive-admin.js";
  const st = () => (typeof state !== "undefined" ? state : null);

  function flag() {
    const s = st();
    const u = s && s.unlocked ? s.sessionUser : null;
    if (!u || u.team_owner_id) return null;
    const f = u.settings && u.settings.TriplemDrive;
    return f && f.enabled === true ? f : null;
  }
  const enabled = () => !!flag();

  // ---- loading ----------------------------------------------------------------------------
  const loaded = new Map();
  function loadScript(src) {
    if (loaded.has(src)) return loaded.get(src);
    const p = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = `${src}?v=${V}`; s.async = false;
      s.onload = () => resolve();
      s.onerror = () => { loaded.delete(src); reject(new Error("Triplem Drive could not be loaded. Check your connection and try again.")); };
      document.head.appendChild(s);
    });
    loaded.set(src, p);
    return p;
  }
  function loadCss(href) {
    if (loaded.has(href)) return loaded.get(href);
    const p = new Promise(resolve => {
      const l = document.createElement("link");
      l.rel = "stylesheet"; l.href = `${href}?v=${V}`;
      l.onload = () => resolve(); l.onerror = () => resolve();
      document.head.appendChild(l);
    });
    loaded.set(href, p);
    return p;
  }
  async function loadApp() {
    await Promise.all([loadCss(APP_CSS), ...APP_SCRIPTS.map(loadScript)]);
    if (!global.TriplemDriveApp) throw new Error("Triplem Drive could not be loaded. Reload the page and try again.");
    return global.TriplemDriveApp;
  }

  async function open(view, opts) {
    if (!enabled()) return;
    try {
      document.documentElement.classList.add("td-loading");
      const app = await loadApp();
      await app.open(view, opts);
    } catch (e) {
      const msg = String(e?.message || e || "Triplem Drive could not be opened.");
      try { if (typeof showToast === "function") showToast(msg, "error"); else alert(msg); } catch (_) {}
    } finally { document.documentElement.classList.remove("td-loading"); }
  }

  // ---- Home card ----------------------------------------------------------------------------
  function decorateHome(grid) {
    if (!grid || !enabled()) return;
    if (grid.querySelector('[data-workspace-tab="drive"]')) return;
    const tpl = document.createElement("template");
    const copy = "Manage vehicles, publish your fleet, receive reservations, and coordinate trips.";
    if (typeof global.workspaceHomeCardHtml === "function") {
      tpl.innerHTML = global.workspaceHomeCardHtml({ key: "drive", rawKey: "drive", label: "Triplem Drive", copy }).trim();
    } else {
      tpl.innerHTML = `<div class="workspace-home-card wh2-card workspace-home-card--drive" role="button" tabindex="0" data-workspace-tab="drive" data-home-key="drive" data-default-label="Triplem Drive"><span class="wh2-icon"><img class="wh2-img" src="Assets/logo/icons/home/drive.svg" alt="" aria-hidden="true"></span><span class="wh2-text"><strong class="wh2-label">Triplem Drive</strong><small class="wh2-desc">${copy}</small></span></div>`;
    }
    const card = tpl.content.firstElementChild;
    card.setAttribute("title", "Fleet Management & Vehicle Bookings");
    let order = [];
    try { order = global.TriplemCardOrder?.home?.effectiveOrder?.() || []; } catch (_) {}
    const at = order.indexOf("drive");
    if (at >= 0) {
      const later = new Set(order.slice(at + 1));
      const next = [...grid.querySelectorAll(":scope > [data-workspace-tab]")].find(el => later.has(el.dataset.workspaceTab));
      if (next) grid.insertBefore(card, next); else grid.appendChild(card);
    } else grid.appendChild(card);
    card.style.setProperty("--workspace-card-index", String([...grid.children].indexOf(card)));
  }

  // ---- Main Admin activation dialog (loaded only when used) -------------------------------------
  // Each business has its own address directly after the domain: https://triplem.vip/<address>/
  // (Triplem Drive itself: https://triplem.vip/triplemdrive/).
  const publicUrl = slug => `${location.origin && /^https?:/.test(location.origin) ? location.origin : "https://triplem.vip"}/${encodeURIComponent(String(slug || ""))}/`;
  const ACTION_LABELS = { enabled: "Switched on", disabled: "Switched off", address_changed: "Address changed", root_changed: "Main /triplemdrive/ page changed" };
  function actionLabel(h) {
    const base = ACTION_LABELS[h?.action] || String(h?.action || "");
    const d = h?.detail || {};
    if (h?.action === "address_changed") return `${base}: ${d.from || "—"} → ${d.to || "—"}`;
    if (h?.action === "root_changed") return d.root ? "Marked as the main business" : "No longer the main business";
    if (h?.action === "enabled" && d.slug) return `${base} · /${d.slug}/`;
    return base;
  }
  async function openDialog(opts) {
    try { await loadScript(ADMIN_SCRIPT); await loadCss(APP_CSS); global.TriplemDriveAdminDialog.open(opts); }
    catch (e) { alert(String(e?.message || e)); }
  }

  // ---- notifications ----------------------------------------------------------------------------
  const payloadOf = n => { try { return (typeof notificationPayloadObject === "function" ? notificationPayloadObject(n) : n?.payload) || {}; } catch (_) { return {}; } };
  function isDriveBooking(n) { const p = payloadOf(n); return p && p.type === "drive_booking" ? p : null; }
  function isDriveInquiry(n) { const p = payloadOf(n); return p && p.type === "drive_inquiry" ? p : null; }

  // A short "ding" for every new booking request and inquiry (Assets/sounds/drive_ding.mp3).
  let lastDing = 0, audio = null;
  function ding() {
    if (Date.now() - lastDing < 2500) return;
    lastDing = Date.now();
    try { audio = audio || new Audio("Assets/sounds/drive_ding.mp3?v=20261123"); audio.currentTime = 0; const p = audio.play(); if (p && p.catch) p.catch(() => {}); } catch (_) {}
  }
  // New Triplem Drive notifications seen in the bell list (works with or without push).
  const SEEN_KEY = "triplem-drive-seen-v1";
  function checkNew(items) {
    const u = st()?.sessionUser; if (!u || !Array.isArray(items)) return;
    const drive = items.filter(n => !n.is_read && (isDriveBooking(n) || isDriveInquiry(n)));
    let seen = {};
    try { seen = JSON.parse(localStorage.getItem(SEEN_KEY) || "{}"); } catch (_) {}
    const mine = new Set(seen[u.id] || []);
    const first = !seen[u.id];
    const fresh = drive.filter(n => !mine.has(String(n.id)) && Date.now() - Date.parse(n.created_at || 0) < 30 * 60000);
    drive.forEach(n => mine.add(String(n.id)));
    seen[u.id] = [...mine].slice(-200);
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch (_) {}
    if (!first && fresh.length) { ding(); try { global.TriplemDriveApp?.onNews?.(); } catch (_) {} }
  }
  function wrapList() {
    if (global.__tdListWrapped || typeof global.fetchMyNotificationsList !== "function") return;
    global.__tdListWrapped = true;
    const orig = global.fetchMyNotificationsList;
    global.fetchMyNotificationsList = async function () {
      const r = await orig.apply(this, arguments);
      try { if (enabled()) checkNew(r?.items); } catch (_) {}
      return r;
    };
  }
  function onPush(event) {
    const msg = event?.data || {};
    if (msg.type !== "TRIPLEM_PUSH_RECEIVED") return;
    const type = msg.payload?.data?.type || "";
    if (type !== "drive_booking" && type !== "drive_inquiry") return;
    if (!enabled()) return;
    ding();
    try { global.TriplemDriveApp?.onNews?.(); } catch (_) {}
  }
  // Opened from a push notification: /?push=drive&kind=booking|inquiry&id=<id>
  function openFromLink() {
    let q;
    try { q = new URLSearchParams(location.search); } catch (_) { return; }
    if (q.get("push") !== "drive") return;
    const kind = q.get("kind"), id = q.get("id") || "";
    let tries = 0;
    const t = setInterval(() => {
      if (++tries > 120) return clearInterval(t);
      if (!st()?.unlocked) return;
      clearInterval(t);
      try { const u = new URL(location.href); ["push", "kind", "id"].forEach(k => u.searchParams.delete(k)); history.replaceState(null, "", u.pathname + u.search + u.hash); } catch (_) {}
      if (!enabled()) return;
      open(kind === "inquiry" ? "inquiries" : "bookings", kind === "inquiry" ? { inquiry: id } : { booking: id });
    }, 500);
  }
  function wrapNotifications() {
    if (global.__tdNotifWrapped) return;
    const origActions = global.notificationActions, origRun = global.runNotificationAction;
    if (typeof origActions !== "function" || typeof origRun !== "function") return;
    global.__tdNotifWrapped = true;
    global.notificationActions = function (n) {
      const list = origActions.apply(this, arguments) || [];
      if (isDriveBooking(n) && enabled()) list.unshift({ id: "drive-open", label: "Open booking", icon: "fa-car-side", primary: true });
      if (isDriveInquiry(n) && enabled()) list.unshift({ id: "drive-inquiry", label: "Open inquiry", icon: "fa-envelope-open-text", primary: true });
      return list;
    };
    global.runNotificationAction = async function (n, action) {
      const qi = isDriveInquiry(n);
      if (action === "drive-inquiry" && qi) {
        try { global.closeNotificationDetail?.(); } catch (_) {}
        try { global.TriplemDetailPanels?.close?.(); } catch (_) {}
        return open("inquiries", { inquiry: qi.inquiry_id });
      }
      const p = isDriveBooking(n);
      if (action === "drive-open" && p) {
        try { global.closeNotificationDetail?.(); } catch (_) {}
        try { global.TriplemDetailPanels?.close?.(); } catch (_) {}
        return open("bookings", { booking: p.booking_id });
      }
      return origRun.apply(this, arguments);
    };
  }

  function onSession() {
    if (!enabled()) { try { global.TriplemDriveApp?.close?.({ force: true }); } catch (_) {} }
  }

  global.TriplemDrive = Object.freeze({ enabled, flag, decorateHome, open, loadApp, ding, version: V });
  global.TriplemDriveAdmin = Object.freeze({ openDialog, publicUrl, actionLabel });

  const install = () => { wrapNotifications(); wrapList(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
  global.addEventListener("load", () => { install(); openFromLink(); });
  try { navigator.serviceWorker?.addEventListener?.("message", onPush); } catch (_) {}
  document.addEventListener("triplem:session-changed", onSession);
})(window);
