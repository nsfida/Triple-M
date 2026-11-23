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

  const V = "20261123-td3";
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
  function isDriveBooking(n) {
    try { const p = typeof notificationPayloadObject === "function" ? notificationPayloadObject(n) : (n?.payload || {}); return p && p.type === "drive_booking" ? p : null; } catch (_) { return null; }
  }
  function wrapNotifications() {
    if (global.__tdNotifWrapped) return;
    const origActions = global.notificationActions, origRun = global.runNotificationAction;
    if (typeof origActions !== "function" || typeof origRun !== "function") return;
    global.__tdNotifWrapped = true;
    global.notificationActions = function (n) {
      const list = origActions.apply(this, arguments) || [];
      if (isDriveBooking(n) && enabled()) list.unshift({ id: "drive-open", label: "Open booking", icon: "fa-car-side", primary: true });
      return list;
    };
    global.runNotificationAction = async function (n, action) {
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

  global.TriplemDrive = Object.freeze({ enabled, flag, decorateHome, open, loadApp, version: V });
  global.TriplemDriveAdmin = Object.freeze({ openDialog, publicUrl, actionLabel });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wrapNotifications, { once: true });
  else wrapNotifications();
  global.addEventListener("load", wrapNotifications);
  document.addEventListener("triplem:session-changed", onSession);
})(window);
