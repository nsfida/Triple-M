/* Triplem VIP for Windows - page side of the desktop bridge (app 3.5+).
 *
 * Runs only inside the Triplem VIP Windows app (Microsoft WebView2), which
 * injects window.__TRIPLEM_DESKTOP__ before any page script. In browsers and on
 * mobile this file does nothing. It never changes data: it reads the unread
 * notifications the app already loads and asks the native app to show Windows
 * notifications, the taskbar badge, the Save As dialog and the Windows print
 * dialog.
 */
(() => {
  "use strict";
  if (window.TriplemDesktop) return;

  const info = (() => { try { return window.__TRIPLEM_DESKTOP__ || null; } catch (_) { return null; } })();
  const host = (() => { try { return window.chrome && window.chrome.webview ? window.chrome.webview : null; } catch (_) { return null; } })();
  if (!info || !host || info.app !== "windows") return;

  const caps = new Set(Array.isArray(info.caps) ? info.caps : []);
  const NOTIFIED_PREFIX = "triplem-desktop-notified-v1:";
  const NOTIFIED_LIMIT = 500;
  const MAX_TOASTS_PER_SYNC = 3;
  const BACKGROUND_REFRESH_MIN_MS = 45 * 1000;
  const OPEN_TARGET_WAIT_MS = 15 * 60 * 1000;

  const local = {
    settings: { notifications: true, closeToTray: true, startWithWindows: false, autostartManaged: false },
    lastBadge: -1,
    badgeTimer: null,
    lastBackgroundRefresh: 0,
    openTimer: null,
    windowVisible: true,
    thermalCleanup: null,
    originalPrint: typeof window.print === "function" ? window.print.bind(window) : null
  };

  function send(cmd, payload = {}) {
    try { host.postMessage(JSON.stringify({ cmd, ...payload })); } catch (_) {}
  }

  function safe(v) { return String(v ?? ""); }
  function esc(v) {
    return safe(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function appState() { try { return typeof state !== "undefined" ? state : window.state; } catch (_) { return window.state; } }
  function signedInUserId() {
    const st = appState();
    if (!st?.unlocked || !st?.sessionUser) return "";
    try { if (typeof isGuestMode === "function" && isGuestMode()) return ""; } catch (_) {}
    return safe(st.sessionUser.id || st.currentUsername || "");
  }

  // ---- Unread badge ------------------------------------------------------------------
  function pushBadge(total) {
    const n = Math.max(0, Number(total) || 0);
    if (local.badgeTimer) clearTimeout(local.badgeTimer);
    local.badgeTimer = setTimeout(() => {
      local.badgeTimer = null;
      if (n === local.lastBadge) return;
      local.lastBadge = n;
      send("badge", { count: n });
    }, 250);
  }

  window.addEventListener("triplem:unread-counts", event => {
    const d = event?.detail || {};
    pushBadge(d.signedIn === false ? 0 : (Number(d.notifications) || 0) + (Number(d.messages) || 0));
  });

  // ---- Native notifications (de-duplicated per account) -------------------------------
  function readNotified(uid) {
    try {
      const raw = localStorage.getItem(NOTIFIED_PREFIX + uid);
      if (raw == null) return null; // never seeded on this PC for this account
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.map(String) : [];
    } catch (_) { return []; }
  }
  function writeNotified(uid, list) {
    try { localStorage.setItem(NOTIFIED_PREFIX + uid, JSON.stringify(list.slice(-NOTIFIED_LIMIT))); } catch (_) {}
  }

  function notificationTitle(n) {
    const payload = n?.payload && typeof n.payload === "object" ? n.payload : {};
    if (n?.title) return safe(n.title);
    if (n?.kind === "note_reminder") return payload.type === "installment_manual" ? "Installment reminder" : "Note reminder";
    if (n?.kind === "installment_due") return "Installment due";
    return "Triplem VIP notification";
  }
  function notificationBody(n) {
    const payload = n?.payload && typeof n.payload === "object" ? n.payload : {};
    return safe(n?.body || payload.note_preview || payload.message || "Open Triplem VIP to view the details.").replace(/\s+/g, " ").trim();
  }

  function incomingMessageThreads(threads, admin) {
    return (Array.isArray(threads) ? threads : []).filter(t => {
      try {
        if (typeof isIncomingPersonalMessage === "function") return isIncomingPersonalMessage(t, admin);
        if (typeof personalMessageUnreadCount === "function") return personalMessageUnreadCount(t, admin) > 0;
      } catch (_) {}
      return false;
    });
  }

  // Exposed for automated tests through TriplemDesktop._test.
  function planToasts(uid, notifications, threads, admin, known) {
    const items = [];
    (Array.isArray(notifications) ? notifications : []).forEach(n => {
      if (!n || n.is_read || !n.id) return;
      items.push({ key: `n:${n.id}`, title: notificationTitle(n), body: notificationBody(n), target: "notifications" });
    });
    incomingMessageThreads(threads, admin).forEach(t => {
      if (!t?.id) return;
      const who = safe(t.sender_display_name || t.guest_name || t.sender_username || (admin ? "a user" : "Triplem VIP support"));
      items.push({
        key: `m:${t.id}:${safe(t.last_message_at || t.message_count || "")}`,
        title: `New message from ${who}`,
        body: safe(t.last_message_preview || "Open Triplem VIP to read it.").replace(/\s+/g, " ").trim(),
        target: "messages"
      });
    });
    if (known === null) {
      // First sync for this account on this PC: remember everything that is
      // already unread instead of flooding the user with old items.
      return { toasts: [], known: items.map(i => i.key) };
    }
    const knownSet = new Set(known);
    const fresh = items.filter(i => !knownSet.has(i.key));
    const toasts = fresh.slice(0, MAX_TOASTS_PER_SYNC);
    if (fresh.length > MAX_TOASTS_PER_SYNC) {
      toasts.push({ key: `summary:${fresh.map(i => i.key).join("|").length}:${Date.now()}`, title: "Triplem VIP", body: `${fresh.length - MAX_TOASTS_PER_SYNC} more new notifications`, target: "notifications" });
    }
    return { toasts, known: known.concat(fresh.map(i => i.key)) };
  }

  window.addEventListener("triplem:comms-snapshot", event => {
    const d = event?.detail || {};
    const uid = safe(d.userId) || signedInUserId();
    if (!uid) return;
    const plan = planToasts(uid, d.notifications, d.threads, !!d.admin, readNotified(uid));
    writeNotified(uid, plan.known);
    if (!local.settings.notifications) return;
    plan.toasts.forEach(t => send("notify", { title: t.title, body: t.body, tag: `${uid}:${t.key}`, target: t.target }));
  });

  // While the window is hidden in the tray, minimised or idle, the web app
  // pauses its own polling; the native app wakes the page once a minute so
  // notifications and the badge stay current.
  function backgroundRefresh(force = false) {
    if (!signedInUserId()) return;
    const now = Date.now();
    if (!force && now - local.lastBackgroundRefresh < BACKGROUND_REFRESH_MIN_MS) return;
    let active = false;
    try { active = !document.hidden && local.windowVisible && !!window.TriplemActivity?.isActive?.(); } catch (_) {}
    if (active && !force) return; // the normal live sync is running
    local.lastBackgroundRefresh = now;
    try { if (typeof refreshAdminCommsBadges === "function") refreshAdminCommsBadges().catch(() => {}); } catch (_) {}
  }

  // ---- Open targets (Jump List, tray menu, notification click) --------------------------
  function waitForUnlock(run) {
    if (local.openTimer) clearInterval(local.openTimer);
    if (signedInUserId()) { run(); return; }
    const started = Date.now();
    local.openTimer = setInterval(() => {
      if (signedInUserId()) {
        clearInterval(local.openTimer); local.openTimer = null;
        setTimeout(run, 400); // let the workspace finish rendering after sign-in
      } else if (Date.now() - started > OPEN_TARGET_WAIT_MS) {
        clearInterval(local.openTimer); local.openTimer = null;
      }
    }, 700);
  }

  function allowed(tab) { try { return typeof tabIsAllowed !== "function" || tabIsAllowed(tab); } catch (_) { return false; } }
  function can(module, action) { try { return typeof userHasPermission !== "function" || userHasPermission(module, action); } catch (_) { return false; } }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  async function waitFor(fn, timeout = 8000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) { try { const v = fn(); if (v) return v; } catch (_) {} await sleep(120); }
    return null;
  }
  function notAvailable(what) { showDesktopNotice(`${what} is not available for your account.`, "warn"); }
  function goTab(tab) { try { if (typeof activate === "function") activate(tab); } catch (_) {} }

  const targetHandlers = {
    async "new-expense"() {
      if (!allowed("expenses")) return notAvailable("Expenses");
      if (typeof teamCanShowEdit === "function" && !teamCanShowEdit("entries")) return notAvailable("Adding expenses");
      goTab("expenses");
      // Same action as the Ctrl+Alt+N shortcut: the button lives in the
      // section's "+" menu, so it is clicked once the Expenses panel is active.
      await waitFor(() => document.getElementById("expensesPanel")?.classList.contains("active"));
      const btn = document.getElementById("openExpenseEntryBtn");
      if (btn && !btn.disabled && btn.getAttribute("aria-disabled") !== "true") btn.click(); else notAvailable("Add Expense");
    },
    async "new-journal"() {
      if (!allowed("accounting") || !can("accounting", "create")) return notAvailable("New journal entries");
      goTab("accounting");
      try { await window.TriplemAccounting?.load?.(); } catch (_) {}
      if (typeof window.TriplemAccounting?.openJournal === "function") window.TriplemAccounting.openJournal(null);
      else notAvailable("New journal entries");
    },
    async reports() {
      if (allowed("accounting")) {
        goTab("accounting");
        const viewBtn = await waitFor(() => document.querySelector('#accountingPanel [data-acct-view="reports"]'));
        if (viewBtn) { viewBtn.click(); return; }
      }
      if (allowed("audit")) { goTab("audit"); return; }
      notAvailable("Reports");
    },
    async inventory() {
      if (!allowed("goods")) return notAvailable("Inventory");
      goTab("goods");
    },
    async notifications() {
      const btn = await waitFor(() => { const b = document.getElementById("adminNotifyBtn"); return b && b.offsetParent !== null ? b : null; }, 5000);
      if (btn && btn.getAttribute("aria-expanded") !== "true") btn.click();
    },
    async messages() {
      if (allowed("messages")) goTab("messages");
    }
  };

  function openTarget(target) {
    const handler = targetHandlers[target];
    if (!handler) return;
    waitForUnlock(() => {
      try {
        document.querySelectorAll(".menu-dropdown.open").forEach(p => p.classList.remove("open"));
        Promise.resolve(handler()).catch(err => console.warn("Desktop shortcut failed:", err));
      } catch (err) { console.warn("Desktop shortcut failed:", err); }
    });
  }

  // ---- Settings panel inside the notifications menu ---------------------------------------
  function ensureStyles() {
    if (document.getElementById("triplemDesktopStyles")) return;
    const style = document.createElement("style");
    style.id = "triplemDesktopStyles";
    style.textContent = `
      .desktop-app-settings{border-top:1px solid rgba(148,163,184,.25);padding:10px 12px 12px;display:grid;gap:8px}
      .desktop-app-settings h4{margin:0 0 2px;font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;opacity:.7}
      .desktop-app-switch{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:.82rem;cursor:pointer}
      .desktop-app-switch small{display:block;opacity:.65;font-size:.72rem}
      .desktop-app-switch input{appearance:none;width:36px;height:20px;border-radius:999px;background:rgba(148,163,184,.45);position:relative;flex:0 0 auto;cursor:pointer;transition:background .15s}
      .desktop-app-switch input::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .15s;box-shadow:0 1px 3px rgba(0,0,0,.3)}
      .desktop-app-switch input:checked{background:#2457d6}
      .desktop-app-switch input:checked::after{transform:translateX(16px)}
      .desktop-app-switch input:focus-visible{outline:2px solid #38bdf8;outline-offset:2px}
      #triplemDesktopNotice{position:fixed;right:18px;bottom:18px;z-index:2147483000;max-width:min(420px,calc(100vw - 36px));display:none;gap:10px;align-items:flex-start;
        padding:12px 14px;border-radius:14px;background:#0f172a;color:#f1f5f9;box-shadow:0 18px 40px rgba(2,6,23,.35);border:1px solid rgba(148,163,184,.25);font-size:.86rem}
      #triplemDesktopNotice.show{display:flex}
      #triplemDesktopNotice .dn-body{flex:1;min-width:0}
      #triplemDesktopNotice strong{display:block;margin-bottom:2px;overflow-wrap:anywhere}
      #triplemDesktopNotice .dn-actions{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}
      #triplemDesktopNotice button{font:inherit;font-size:.8rem;border:1px solid rgba(148,163,184,.35);background:rgba(255,255,255,.06);color:inherit;border-radius:9px;padding:5px 10px;cursor:pointer}
      #triplemDesktopNotice button.primary{background:#2457d6;border-color:#2457d6}
      #triplemDesktopNotice .dn-close{background:none;border:0;font-size:1.1rem;line-height:1;padding:0 2px;opacity:.7}
      #triplemDesktopNotice.warn{border-color:rgba(251,191,36,.6)}
      #triplemDesktopNotice.error{border-color:rgba(248,113,113,.7)}
      @media screen{#triplemDesktopPrintHost{display:none!important}}
      @media print{
        body.triplem-desktop-printing>*:not(#triplemDesktopPrintHost){display:none!important}
        body.triplem-desktop-printing #triplemDesktopPrintHost{display:block!important}
      }`;
    document.head.appendChild(style);
  }

  function switchRow(key, label, hint) {
    return `<label class="desktop-app-switch"><span>${esc(label)}<small>${esc(hint)}</small></span><input type="checkbox" role="switch" data-desktop-setting="${esc(key)}"></label>`;
  }

  function ensureSettingsPanel() {
    const dropdown = document.getElementById("adminNotifyDropdown");
    if (!dropdown || document.getElementById("desktopAppSettings")) return;
    const panel = document.createElement("div");
    panel.id = "desktopAppSettings";
    panel.className = "desktop-app-settings";
    panel.innerHTML = `<h4>Windows app</h4>
      ${switchRow("notifications", "Windows notifications", "Alerts in the Windows notification centre")}
      ${switchRow("closeToTray", "Run in the background when closed", "Keeps notifications arriving; quit from the tray icon")}
      ${switchRow("startWithWindows", "Start with Windows", "Opens quietly in the notification area at sign-in")}`;
    panel.addEventListener("click", e => e.stopPropagation());
    panel.addEventListener("change", e => {
      const input = e.target.closest("[data-desktop-setting]");
      if (!input) return;
      send("settings-set", { key: input.dataset.desktopSetting, value: !!input.checked });
    });
    dropdown.appendChild(panel);
    renderSettings();
  }

  function renderSettings() {
    document.querySelectorAll("[data-desktop-setting]").forEach(input => {
      input.checked = !!local.settings[input.dataset.desktopSetting];
    });
  }

  // ---- In-page notice (export saved / failed, availability messages) -----------------------
  let noticeTimer = null;
  function showDesktopNotice(title, kind = "info", actions = [], text = "") {
    ensureStyles();
    let box = document.getElementById("triplemDesktopNotice");
    if (!box) {
      box = document.createElement("div");
      box.id = "triplemDesktopNotice";
      box.setAttribute("role", "status");
      box.setAttribute("aria-live", "polite");
      document.body.appendChild(box);
    }
    box.className = `${kind} show`;
    box.innerHTML = `<div class="dn-body"><strong>${esc(title)}</strong>${text ? `<span>${esc(text)}</span>` : ""}${actions.length ? `<div class="dn-actions">${actions.map((a, i) => `<button type="button" class="${i === 0 ? "primary" : ""}" data-dn="${i}">${esc(a.label)}</button>`).join("")}</div>` : ""}</div><button type="button" class="dn-close" aria-label="Close">&times;</button>`;
    box.querySelector(".dn-close").addEventListener("click", () => box.classList.remove("show"));
    box.querySelectorAll("[data-dn]").forEach(btn => btn.addEventListener("click", () => {
      const a = actions[Number(btn.dataset.dn)];
      if (a?.run) a.run();
    }));
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => box.classList.remove("show"), actions.length ? 15000 : 7000);
  }

  // ---- Printing ---------------------------------------------------------------------
  function cleanupThermal() {
    if (typeof local.thermalCleanup === "function") { const f = local.thermalCleanup; local.thermalCleanup = null; f(); }
  }

  function nativePrint() {
    if (!caps.has("print")) { local.originalPrint?.(); return; }
    send("print");
  }

  // Receipt printing: the receipt document is rendered into a print-only host
  // of this page (screen: hidden), then the Windows print dialog prints it.
  function printHtml(html) {
    if (!caps.has("print") || typeof html !== "string" || !html) return false;
    ensureStyles();
    cleanupThermal();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const host = document.createElement("div");
    host.id = "triplemDesktopPrintHost";
    host.setAttribute("aria-hidden", "true");
    const styles = [...doc.querySelectorAll("style")].map(s => `@media print{${s.textContent || ""}}`).join("\n");
    doc.querySelectorAll("script").forEach(s => s.remove());
    const styleEl = document.createElement("style");
    styleEl.textContent = styles;
    host.innerHTML = doc.body ? doc.body.innerHTML : "";
    document.head.appendChild(styleEl);
    document.body.appendChild(host);
    document.body.classList.add("triplem-desktop-printing");
    local.thermalCleanup = () => {
      document.body.classList.remove("triplem-desktop-printing");
      host.remove();
      styleEl.remove();
    };
    const onAfter = () => { window.removeEventListener("afterprint", onAfter); cleanupThermal(); };
    window.addEventListener("afterprint", onAfter);
    const imgs = [...host.querySelectorAll("img")].filter(img => !img.complete);
    let pending = imgs.length;
    let fired = false;
    const go = () => { if (fired) return; fired = true; setTimeout(() => send("print"), 80); };
    if (!pending) go();
    imgs.forEach(img => {
      const done = () => { pending -= 1; if (pending <= 0) go(); };
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
    });
    setTimeout(go, 1500);
    return true;
  }

  if (caps.has("print")) {
    window.print = function triplemDesktopPrint() { cleanupThermal(); nativePrint(); };
    document.addEventListener("keydown", e => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        e.stopPropagation();
        cleanupThermal();
        nativePrint();
      }
    }, true);
  }

  // ---- Messages from the native app -------------------------------------------------------
  function handleNative(msg) {
    switch (msg?.type) {
      case "settings":
        local.settings = {
          notifications: msg.notifications !== false,
          closeToTray: msg.closeToTray !== false,
          startWithWindows: msg.startWithWindows === true,
          autostartManaged: msg.autostartManaged === true
        };
        renderSettings();
        break;
      case "open":
        openTarget(safe(msg.target));
        break;
      case "tick":
        local.windowVisible = msg.visible !== false;
        backgroundRefresh();
        break;
      case "visibility":
        local.windowVisible = msg.visible !== false;
        if (local.windowVisible) backgroundRefresh(true);
        break;
      case "download-complete": {
        const id = safe(msg.id);
        showDesktopNotice(`Saved ${safe(msg.name)}`, "info", [
          { label: "Open file", run: () => send("download-open", { id }) },
          { label: "Show in folder", run: () => send("download-show", { id }) }
        ], msg.folder ? `in ${safe(msg.folder)}` : "");
        break;
      }
      case "download-failed":
        showDesktopNotice(`Could not save ${safe(msg.name) || "the export"}`, "error", [], safe(msg.reason));
        break;
      case "print-unavailable":
        cleanupThermal();
        local.originalPrint?.();
        break;
    }
  }

  host.addEventListener("message", event => {
    let msg = event?.data;
    if (typeof msg === "string") { try { msg = JSON.parse(msg); } catch (_) { return; } }
    if (msg && typeof msg === "object") handleNative(msg);
  });

  document.documentElement.classList.add("triplem-windows-app-bridge");

  window.TriplemDesktop = Object.freeze({
    info,
    printHtml,
    print: nativePrint,
    open: openTarget,
    _test: Object.freeze({ planToasts, notificationTitle, notificationBody })
  });

  function start() {
    ensureStyles();
    ensureSettingsPanel();
    // The notifications menu can be rebuilt; keep the settings panel present.
    new MutationObserver(() => ensureSettingsPanel()).observe(document.body, { childList: true, subtree: false });
    send("ready", {});
    try {
      const d = { notifications: Number(document.getElementById("adminNotifyCount")?.dataset.count) || 0, messages: Number(document.getElementById("adminMessagesCount")?.dataset.count) || 0 };
      pushBadge(signedInUserId() ? d.notifications + d.messages : 0);
    } catch (_) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
