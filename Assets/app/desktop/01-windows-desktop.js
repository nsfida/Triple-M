/* Triplem VIP for Windows - page side of the desktop bridge (app 3.5+, 3.6 features).
 *
 * Runs only inside the Triplem VIP Windows app (Microsoft WebView2), which
 * injects window.__TRIPLEM_DESKTOP__ before any page script. In browsers and on
 * mobile this file does nothing. It never changes data itself: it reads the
 * unread notifications the app already loads and asks the native app to show
 * Windows notifications, the taskbar badge, the Save As dialog and the Windows
 * print dialog. Notification buttons reuse the existing in-app actions, and
 * Store push registration is handled by the Web Push module (events only).
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
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const SHORTCUT = String(info.shortcut || "Ctrl+Alt+Shift+E");

  const local = {
    settings: { notifications: true, closeToTray: true, startWithWindows: false, autostartManaged: false, autoUpdate: true, updatesSupported: false, quickAddHotkey: true, hotkeyUnavailable: false, safeStart: false },
    update: { state: "idle", version: "", notes: "", error: "", current: safe(info.version) },
    lastBadge: -1,
    badgeTimer: null,
    lastBackgroundRefresh: 0,
    openTimer: null,
    windowVisible: true,
    thermalCleanup: null,
    lastTheme: "",
    pushChannel: null,
    pushClosed: false,
    lastUid: "",
    // Store app: items that arrived while the app was closed were already shown
    // by Windows, so the first sync after start only records them.
    seedNextSnapshot: caps.has("push"),
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
  function commsState() { try { return typeof adminCommsState !== "undefined" ? adminCommsState : null; } catch (_) { return null; } }
  function isLiveOffer(n) { try { return typeof isLiveChatOfferNotification === "function" && isLiveChatOfferNotification(n); } catch (_) { return false; } }

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
    syncPushRegistration();
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

  // Buttons shown on a Windows notification. Each one maps to an existing
  // in-app action (see runAction below); ids are validated again natively.
  function notificationActions(n) {
    const id = safe(n?.id);
    if (!UUID_RE.test(id)) return [];
    if (isLiveOffer(n)) return [{ action: "accept-chat", id }, { action: "decline-chat", id }];
    return [{ action: "mark-read", id }];
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
      items.push({ key: `n:${n.id}`, title: notificationTitle(n), body: notificationBody(n), target: "notifications", id: UUID_RE.test(safe(n.id)) ? safe(n.id) : "", actions: notificationActions(n) });
    });
    incomingMessageThreads(threads, admin).forEach(t => {
      if (!t?.id) return;
      const who = safe(t.sender_display_name || t.guest_name || t.sender_username || (admin ? "a user" : "Triplem VIP support"));
      const tid = UUID_RE.test(safe(t.id)) ? safe(t.id) : "";
      items.push({
        key: `m:${t.id}:${safe(t.last_message_at || t.message_count || "")}`,
        title: `New message from ${who}`,
        body: safe(t.last_message_preview || "Open Triplem VIP to read it.").replace(/\s+/g, " ").trim(),
        target: "messages",
        id: tid,
        actions: tid ? [{ action: "reply", id: tid }] : []
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
      toasts.push({ key: `summary:${fresh.map(i => i.key).join("|").length}:${Date.now()}`, title: "Triplem VIP", body: `${fresh.length - MAX_TOASTS_PER_SYNC} more new notifications`, target: "notifications", id: "", actions: [] });
    }
    return { toasts, known: known.concat(fresh.map(i => i.key)) };
  }

  window.addEventListener("triplem:comms-snapshot", event => {
    const d = event?.detail || {};
    const uid = safe(d.userId) || signedInUserId();
    if (!uid) return;
    const known = readNotified(uid);
    if (local.seedNextSnapshot) {
      local.seedNextSnapshot = false;
      const seeded = planToasts(uid, d.notifications, d.threads, !!d.admin, null);
      writeNotified(uid, (known || []).concat(seeded.known));
      return;
    }
    const plan = planToasts(uid, d.notifications, d.threads, !!d.admin, known);
    writeNotified(uid, plan.known);
    if (!local.settings.notifications) return;
    plan.toasts.forEach(t => send("notify", { title: t.title, body: t.body, tag: `${uid}:${t.key}`, target: t.target, id: t.id || "", actions: t.actions || [] }));
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

  // ---- Open targets (Jump List, tray menu, notifications, triplemvip:// links) ------------
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

  async function openBell() {
    const btn = await waitFor(() => { const b = document.getElementById("adminNotifyBtn"); return b && b.offsetParent !== null ? b : null; }, 5000);
    if (btn && btn.getAttribute("aria-expanded") !== "true") btn.click();
    return !!btn;
  }

  // Finds a bell notification, loading the list once if needed.
  async function findNotification(id) {
    const look = () => (commsState()?.notifications || []).find(n => safe(n.id) === id) || null;
    let n = look();
    if (!n && typeof loadAdminNotificationsDropdown === "function") {
      try { await loadAdminNotificationsDropdown(); } catch (_) {}
      n = look();
    }
    return n;
  }

  async function openConversation(id, focusReply) {
    if (!allowed("messages")) return notAvailable("Messages");
    goTab("messages");
    if (id && typeof openInquiryThread === "function") {
      await waitFor(() => document.getElementById("messagesPanel")?.classList.contains("active") || document.getElementById("messagesChatScroll"), 4000);
      try { await openInquiryThread(id); } catch (_) {}
    }
    if (focusReply) {
      const input = await waitFor(() => { const el = document.getElementById("messagesReplyInput"); return el && el.offsetParent !== null && !el.disabled ? el : null; }, 5000);
      input?.focus();
    }
  }

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
    async notifications(opts = {}) {
      const id = safe(opts.id);
      if (id && UUID_RE.test(id)) {
        const n = await findNotification(id);
        if (n && typeof openNotificationDetail === "function") {
          document.dispatchEvent(new CustomEvent("triplem:notification-mark-read", { detail: { id } }));
          openNotificationDetail(n);
          return;
        }
      }
      await openBell();
    },
    async "live-chat"() {
      // Live chat offers (Accept / Decline) live in the bell.
      await openBell();
    },
    async messages(opts = {}) {
      const id = UUID_RE.test(safe(opts.id)) ? safe(opts.id) : "";
      await openConversation(id, opts.action === "reply");
    }
  };

  // Notification buttons. Native code only passes an action through when the
  // click came from this app's own notification; otherwise it just opens.
  async function runAction(action, id) {
    if (action === "reply") return openConversation(id, true);
    const n = await findNotification(id);
    if (!n) { await openBell(); return; }
    if (action === "mark-read") {
      document.dispatchEvent(new CustomEvent("triplem:notification-mark-read", { detail: { id } }));
      showDesktopNotice("Marked as read", "info");
      return;
    }
    if ((action === "accept-chat" || action === "decline-chat") && isLiveOffer(n) && typeof runNotificationAction === "function") {
      try {
        await runNotificationAction(n, action === "accept-chat" ? "live-accept" : "live-decline");
        if (action === "decline-chat") showDesktopNotice("Live chat declined", "info");
      } catch (err) {
        showDesktopNotice(err?.message || "This live chat is no longer available.", "warn");
      }
      return;
    }
    // Offer already taken or expired: show the notification instead.
    if (typeof openNotificationDetail === "function") openNotificationDetail(n); else await openBell();
  }

  function openTarget(target, opts = {}) {
    const handler = targetHandlers[target];
    if (!handler) return;
    waitForUnlock(() => {
      try {
        document.querySelectorAll(".menu-dropdown.open").forEach(p => p.classList.remove("open"));
        const action = safe(opts.action);
        const id = safe(opts.id);
        const run = action && UUID_RE.test(id) && action !== "reply" ? runAction(action, id) : handler(opts);
        Promise.resolve(run).catch(err => console.warn("Desktop shortcut failed:", err));
      } catch (err) { console.warn("Desktop shortcut failed:", err); }
    });
  }

  // ---- Styles -------------------------------------------------------------------------------
  function ensureStyles() {
    if (document.getElementById("triplemDesktopStyles")) return;
    const style = document.createElement("style");
    style.id = "triplemDesktopStyles";
    style.textContent = `
      .desktop-app-settings{border-top:1px solid var(--line,rgba(148,163,184,.25));flex:0 0 auto;position:relative;background:var(--surface-elevated,#fff);border-radius:0 0 inherit inherit}
      .desktop-app-settings[open]{box-shadow:0 -10px 18px -14px rgba(15,23,42,.35)}
      .desktop-app-settings>summary{list-style:none;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;cursor:pointer;user-select:none;
        font-size:.78rem;font-weight:650;color:var(--text,#17212b)}
      .desktop-app-settings>summary::-webkit-details-marker{display:none}
      .desktop-app-settings>summary:hover{background:var(--surface-hover,rgba(241,245,249,.92))}
      .desktop-app-settings>summary:focus-visible{outline:2px solid var(--primary,#2457d6);outline-offset:-2px;border-radius:8px}
      .desktop-app-summary-title{display:inline-flex;align-items:center;gap:7px}
      .desktop-app-summary-title i{color:var(--primary,#2457d6)}
      .desktop-app-summary-meta{display:inline-flex;align-items:center;gap:8px;color:var(--muted,#667085);font-weight:600;font-size:.72rem;font-variant-numeric:tabular-nums}
      .desktop-app-caret{font-size:.68rem;transition:transform .15s}
      .desktop-app-settings[open] .desktop-app-caret{transform:rotate(180deg)}
      .desktop-app-chip{display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;background:var(--primary,#2457d6);color:#fff;font-size:.68rem;font-weight:700}
      .desktop-app-chip[hidden]{display:none}
      .desktop-app-body{display:grid;gap:10px;padding:2px 14px 14px;max-height:min(46vh,360px);overflow-y:auto;overscroll-behavior:contain}
      .desktop-app-switch{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:.82rem;cursor:pointer;color:var(--text,#17212b)}
      .desktop-app-switch>span{min-width:0}
      .desktop-app-switch small{display:block;color:var(--muted,#667085);font-size:.72rem;line-height:1.35;margin-top:1px}
      .desktop-app-switch small.is-warn{color:var(--warning,#b45309)}
      .desktop-app-switch input{appearance:none;-webkit-appearance:none;margin:0;width:36px;height:20px;border-radius:999px;background:rgba(148,163,184,.45);position:relative;flex:0 0 auto;cursor:pointer;transition:background .15s}
      .desktop-app-switch input::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .15s;box-shadow:0 1px 3px rgba(0,0,0,.3)}
      .desktop-app-switch input:checked{background:var(--primary,#2457d6)}
      .desktop-app-switch input:checked::after{transform:translateX(16px)}
      .desktop-app-switch input:focus-visible{outline:2px solid var(--primary,#2457d6);outline-offset:2px}
      .desktop-app-switch input:disabled{opacity:.5;cursor:not-allowed}
      .desktop-app-actions{display:flex;flex-wrap:wrap;gap:6px}
      .desktop-app-actions button{font:inherit;font-size:.76rem;font-weight:600;border:1px solid var(--line-strong,rgba(71,85,105,.3));background:var(--control-bg,#fff);color:var(--text,#17212b);border-radius:999px;padding:5px 11px;cursor:pointer;line-height:1.2}
      .desktop-app-actions button:hover{background:var(--control-hover,#f1f5f9)}
      .desktop-app-actions button.primary{background:var(--primary,#2457d6);border-color:var(--primary,#2457d6);color:#fff}
      .desktop-app-actions button:disabled{opacity:.6;cursor:progress}
      .desktop-app-update-line{font-size:.74rem;color:var(--muted,#667085);margin:0}
      .desktop-app-update-line.is-ready{color:var(--primary,#2457d6);font-weight:600}
      .desktop-app-update-line.is-error{color:var(--danger,#dc2626)}
      #triplemDesktopNotice{position:fixed;right:18px;bottom:18px;z-index:2147483000;max-width:min(420px,calc(100vw - 36px));display:none;gap:10px;align-items:flex-start;
        padding:12px 14px;border-radius:14px;background:#0f172a;color:#f1f5f9;box-shadow:0 18px 40px rgba(2,6,23,.35);border:1px solid rgba(148,163,184,.25);font-size:.86rem}
      #triplemDesktopNotice.show{display:flex;animation:tvipNoticeIn .18s ease-out}
      #triplemDesktopNotice .dn-body{flex:1;min-width:0}
      #triplemDesktopNotice strong{display:block;margin-bottom:2px;overflow-wrap:anywhere}
      #triplemDesktopNotice .dn-body>span{display:block;opacity:.82;font-size:.8rem;overflow-wrap:anywhere}
      #triplemDesktopNotice .dn-actions{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}
      #triplemDesktopNotice button{font:inherit;font-size:.8rem;border:1px solid rgba(148,163,184,.35);background:rgba(255,255,255,.06);color:inherit;border-radius:9px;padding:5px 10px;cursor:pointer}
      #triplemDesktopNotice button.primary{background:#2457d6;border-color:#2457d6}
      #triplemDesktopNotice .dn-close{background:none;border:0;font-size:1.1rem;line-height:1;padding:0 2px;opacity:.7}
      #triplemDesktopNotice.warn{border-color:rgba(251,191,36,.6)}
      #triplemDesktopNotice.error{border-color:rgba(248,113,113,.7)}
      #triplemDesktopNotice.success{border-color:rgba(52,211,153,.6)}
      #triplemDesktopDrop{position:fixed;inset:0;z-index:2147482500;display:none;place-items:center;pointer-events:none;
        background:color-mix(in srgb,var(--primary,#2457d6) 10%,rgba(15,23,42,.38));backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}
      #triplemDesktopDrop.show{display:grid}
      #triplemDesktopDrop .dd-card{display:grid;justify-items:center;gap:6px;padding:22px 28px;border-radius:18px;border:2px dashed var(--primary,#2457d6);
        background:var(--surface-elevated,#fff);color:var(--text,#17212b);box-shadow:0 24px 60px rgba(15,23,42,.25);max-width:min(420px,calc(100vw - 48px));text-align:center}
      #triplemDesktopDrop .dd-card i{font-size:1.6rem;color:var(--primary,#2457d6)}
      #triplemDesktopDrop .dd-card strong{font-size:.98rem}
      #triplemDesktopDrop .dd-card span{font-size:.8rem;color:var(--muted,#667085)}
      #triplemDesktopDrop.is-blocked .dd-card{border-color:var(--muted,#94a3b8)}
      #triplemDesktopDrop.is-blocked .dd-card i{color:var(--muted,#94a3b8)}
      @keyframes tvipNoticeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
      .desktop-app-update-line[hidden]{display:none}
      @media (prefers-reduced-motion:reduce){#triplemDesktopNotice.show{animation:none}.desktop-app-switch input,.desktop-app-switch input::after,.desktop-app-caret{transition:none}}
      @media screen{#triplemDesktopPrintHost{display:none!important}}
      @media print{
        body.triplem-desktop-printing>*:not(#triplemDesktopPrintHost){display:none!important}
        body.triplem-desktop-printing #triplemDesktopPrintHost{display:block!important}
      }`;
    document.head.appendChild(style);
  }

  // ---- Settings panel inside the notifications menu ---------------------------------------
  function switchRow(key, label, hint, hintId = "") {
    return `<label class="desktop-app-switch"><span>${esc(label)}<small${hintId ? ` id="${esc(hintId)}"` : ""}>${esc(hint)}</small></span><input type="checkbox" role="switch" data-desktop-setting="${esc(key)}"></label>`;
  }

  const PANEL_OPEN_KEY = "triplem-desktop-settings-open-v1";
  function ensureSettingsPanel() {
    const dropdown = document.getElementById("adminNotifyDropdown");
    if (!dropdown || document.getElementById("desktopAppSettings")) return;
    // Collapsed by default so the notification list keeps its space; the
    // "Update ready" chip is visible even while it is closed.
    const panel = document.createElement("details");
    panel.id = "desktopAppSettings";
    panel.className = "desktop-app-settings";
    try { panel.open = localStorage.getItem(PANEL_OPEN_KEY) === "1"; } catch (_) {}
    panel.innerHTML = `<summary><span class="desktop-app-summary-title"><i class="fa-brands fa-windows" aria-hidden="true"></i> Windows app</span>
        <span class="desktop-app-summary-meta"><span class="desktop-app-chip" id="desktopUpdateChip" hidden>Update ready</span><span id="desktopAppVersion">${esc(info.version ? "v" + info.version : "")}</span><i class="fa-solid fa-chevron-down desktop-app-caret" aria-hidden="true"></i></span></summary>
      <div class="desktop-app-body">
      ${switchRow("notifications", "Windows notifications", "Alerts in the Windows notification centre")}
      ${switchRow("closeToTray", "Run in the background when closed", "Keeps notifications arriving; quit from the tray icon")}
      ${switchRow("startWithWindows", "Start with Windows", "Opens quietly in the notification area at sign-in")}
      ${caps.has("hotkey") ? switchRow("quickAddHotkey", "Quick add shortcut", `${SHORTCUT} opens Add Expense from anywhere`, "desktopHotkeyHint") : ""}
      ${caps.has("update") ? switchRow("autoUpdate", "Download updates automatically", "Installs only when you choose Restart to update") : ""}
      ${caps.has("update") ? `<p class="desktop-app-update-line" id="desktopUpdateLine" aria-live="polite" hidden></p>` : ""}
      <div class="desktop-app-actions">
        ${caps.has("update") ? `<button type="button" data-desktop-cmd="update">Check for updates</button>` : ""}
        ${caps.has("report") ? `<button type="button" data-desktop-cmd="report">Create error report</button>` : ""}
      </div>
      </div>`;
    panel.addEventListener("toggle", () => { try { localStorage.setItem(PANEL_OPEN_KEY, panel.open ? "1" : "0"); } catch (_) {} });
    panel.addEventListener("click", e => {
      e.stopPropagation();
      const btn = e.target.closest("[data-desktop-cmd]");
      if (!btn) return;
      if (btn.dataset.desktopCmd === "update") {
        if (local.update.state === "ready") send("update-install"); else send("update-check");
      } else if (btn.dataset.desktopCmd === "report") {
        send("report");
      }
    });
    panel.addEventListener("change", e => {
      const input = e.target.closest("[data-desktop-setting]");
      if (!input) return;
      const key = input.dataset.desktopSetting;
      send("settings-set", { key, value: !!input.checked });
      if (key === "notifications") onNotificationsSwitch(!!input.checked);
    });
    dropdown.appendChild(panel);
    renderSettings();
    renderUpdate();
  }

  function renderSettings() {
    document.querySelectorAll("[data-desktop-setting]").forEach(input => {
      input.checked = !!local.settings[input.dataset.desktopSetting];
    });
    const hint = document.getElementById("desktopHotkeyHint");
    if (hint) {
      const busy = local.settings.quickAddHotkey && local.settings.hotkeyUnavailable;
      hint.textContent = busy ? `${SHORTCUT} is used by another program on this PC` : `${SHORTCUT} opens Add Expense from anywhere`;
      hint.classList.toggle("is-warn", busy);
    }
  }

  function renderUpdate() {
    const line = document.getElementById("desktopUpdateLine");
    const btn = document.querySelector('[data-desktop-cmd="update"]');
    if (!line && !btn) return;
    const u = local.update;
    let text = "";
    let cls = "";
    let label = "Check for updates";
    let busy = false;
    switch (u.state) {
      case "checking": text = "Checking for updates…"; busy = true; break;
      case "downloading": text = `Downloading version ${u.version}…`; busy = true; break;
      case "ready": text = `Version ${u.version} is ready to install.`; cls = "is-ready"; label = "Restart to update"; break;
      case "none": text = `You have the latest version (${u.current || info.version}).`; break;
      case "error": text = u.error || "Could not check for updates."; cls = "is-error"; break;
      default: text = "";
    }
    if (line) { line.textContent = text; line.className = `desktop-app-update-line ${cls}`.trim(); line.hidden = !text; }
    const chip = document.getElementById("desktopUpdateChip");
    if (chip) chip.hidden = u.state !== "ready";
    if (btn) { btn.textContent = label; btn.disabled = busy; btn.classList.toggle("primary", u.state === "ready"); }
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
      box.classList.remove("show");
      if (a?.run) a.run();
    }));
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => box.classList.remove("show"), actions.length ? 20000 : 7000);
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
    const printHost = document.createElement("div");
    printHost.id = "triplemDesktopPrintHost";
    printHost.setAttribute("aria-hidden", "true");
    const styles = [...doc.querySelectorAll("style")].map(s => `@media print{${s.textContent || ""}}`).join("\n");
    doc.querySelectorAll("script").forEach(s => s.remove());
    const styleEl = document.createElement("style");
    styleEl.textContent = styles;
    printHost.innerHTML = doc.body ? doc.body.innerHTML : "";
    document.head.appendChild(styleEl);
    document.body.appendChild(printHost);
    document.body.classList.add("triplem-desktop-printing");
    local.thermalCleanup = () => {
      document.body.classList.remove("triplem-desktop-printing");
      printHost.remove();
      styleEl.remove();
    };
    const onAfter = () => { window.removeEventListener("afterprint", onAfter); cleanupThermal(); };
    window.addEventListener("afterprint", onAfter);
    const imgs = [...printHost.querySelectorAll("img")].filter(img => !img.complete);
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

  // ---- Title bar follows the app theme ----------------------------------------------------
  function cssColorToHex(value) {
    const v = safe(value).trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(v)) return ("#" + v.slice(1).split("").map(c => c + c).join("")).toLowerCase();
    const m = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i);
    if (!m) return "";
    if (m[4] !== undefined) {
      const a = m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      if (a < 1) return ""; // translucent: let Windows choose
    }
    return "#" + [m[1], m[2], m[3]].map(n => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, "0")).join("");
  }

  function syncTitleBar() {
    if (!caps.has("theme")) return;
    try {
      const root = document.documentElement;
      const cs = getComputedStyle(root);
      const scheme = `${root.style.colorScheme || ""} ${cs.colorScheme || ""}`;
      const color = cssColorToHex(cs.getPropertyValue("--page-bg")) || cssColorToHex(cs.getPropertyValue("--bg")) || cssColorToHex(getComputedStyle(document.body).backgroundColor);
      const dark = /\bdark\b/i.test(scheme) && !/\blight\b/i.test(root.style.colorScheme || "");
      const key = `${dark}|${color}`;
      if (key === local.lastTheme) return;
      local.lastTheme = key;
      send("theme", { dark, color });
    } catch (_) {}
  }

  // ---- Drag and drop files ------------------------------------------------------------------
  // Dropping a file anywhere in the app fills the upload field of the form that
  // is open (payment receipts, logos, bank statements, imports). Without this,
  // WebView2 would try to open the dropped file instead of the workspace.
  function fileAccepted(input, file) {
    const accept = safe(input.getAttribute("accept")).toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
    if (!accept.length) return true;
    const name = safe(file.name).toLowerCase();
    const type = safe(file.type).toLowerCase();
    return accept.some(a => a.startsWith(".") ? name.endsWith(a) : a.endsWith("/*") ? type.startsWith(a.slice(0, -1)) : type === a);
  }

  function visibleFileInputs() {
    const inputs = [...document.querySelectorAll('input[type="file"]:not([disabled])')];
    const isShown = el => {
      if (el.offsetParent !== null) return true;
      // A styled upload field may hide the input itself behind its label.
      const label = el.closest("label") || (el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null);
      return !!label && label.offsetParent !== null;
    };
    const shown = inputs.filter(isShown);
    // Prefer the top-most open dialog.
    const modals = [...document.querySelectorAll(".modal:not(.hide), [role=dialog]:not(.hide)")].filter(m => m.offsetParent !== null || getComputedStyle(m).position === "fixed");
    const top = modals[modals.length - 1];
    if (top) {
      const inTop = shown.filter(i => top.contains(i));
      if (inTop.length) return inTop;
    }
    return shown;
  }

  function dropTarget(files) {
    const list = visibleFileInputs();
    const first = files[0];
    if (!first) return null;
    return list.find(i => fileAccepted(i, first) && (files.length === 1 || i.multiple)) || null;
  }

  function dropOverlay(show, ok = true) {
    ensureStyles();
    let el = document.getElementById("triplemDesktopDrop");
    if (!el) {
      el = document.createElement("div");
      el.id = "triplemDesktopDrop";
      el.setAttribute("aria-hidden", "true");
      el.innerHTML = `<div class="dd-card"><i class="fa-solid fa-file-arrow-up"></i><strong></strong><span></span></div>`;
      document.body.appendChild(el);
    }
    el.classList.toggle("show", show);
    el.classList.toggle("is-blocked", !ok);
    el.querySelector("strong").textContent = ok ? "Drop to attach" : "No upload field is open";
    el.querySelector("span").textContent = ok ? "The file goes into the upload field of the open form." : "Open the form you want to attach this file to, then drop it again.";
  }

  function hasFiles(e) {
    try { return [...(e.dataTransfer?.types || [])].includes("Files"); } catch (_) { return false; }
  }

  if (caps.has("dragdrop")) {
    let depth = 0;
    document.addEventListener("dragenter", e => {
      if (!hasFiles(e)) return;
      depth += 1;
      if (depth === 1) dropOverlay(true, visibleFileInputs().length > 0);
    });
    document.addEventListener("dragleave", e => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) dropOverlay(false);
    });
    document.addEventListener("dragover", e => {
      if (!hasFiles(e) || e.defaultPrevented) return; // a page drop zone handles it
      e.preventDefault();
      e.dataTransfer.dropEffect = visibleFileInputs().length ? "copy" : "none";
    });
    document.addEventListener("drop", e => {
      depth = 0;
      dropOverlay(false);
      if (!hasFiles(e) || e.defaultPrevented) return;
      e.preventDefault(); // never let the window navigate to the dropped file
      const files = [...(e.dataTransfer?.files || [])];
      if (!files.length) return;
      const input = dropTarget(files);
      if (!input) {
        const open = visibleFileInputs();
        if (open.length) {
          const accepted = safe(open[0].getAttribute("accept")).replace(/application\/|image\//g, "").replace(/,/g, ", ");
          showDesktopNotice("This file type is not accepted here", "warn", [], accepted ? `Accepted: ${accepted}` : "");
        } else {
          showDesktopNotice("No upload field is open", "warn", [], "Open the form you want to attach the file to, then drop it again.");
        }
        return;
      }
      try {
        const dt = new DataTransfer();
        (input.multiple ? files : files.slice(0, 1)).forEach(f => dt.items.add(f));
        input.files = dt.files;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        showDesktopNotice(`Attached ${files[0].name}`, "success");
      } catch (_) {
        showDesktopNotice("The file could not be attached", "error");
      }
    });
  }

  // ---- Store push channel (registration is done by the Web Push module) -------------------
  function syncPushRegistration() {
    if (!caps.has("push")) return;
    const uid = signedInUserId();
    if (uid && uid !== local.lastUid && local.pushClosed && local.settings.notifications) {
      local.pushClosed = false;
      send("push-open"); // signed in again: get a fresh channel
    }
    if (!uid && local.lastUid) {
      // Signed out (or the session ended): stop Store notifications on this PC.
      local.pushClosed = true;
      send("push-close");
    }
    local.lastUid = uid;
    if (uid && local.pushChannel && local.settings.notifications) {
      window.dispatchEvent(new CustomEvent("triplem:windows-push-channel", { detail: { ...local.pushChannel, userId: uid } }));
    }
  }

  function onNotificationsSwitch(on) {
    if (!caps.has("push")) return;
    if (on) { local.pushClosed = false; send("push-open"); return; }
    local.pushClosed = true;
    if (local.pushChannel?.deviceId) window.dispatchEvent(new CustomEvent("triplem:windows-push-unregister", { detail: { deviceId: local.pushChannel.deviceId } }));
    local.pushChannel = null;
  }

  function beforeLogout() {
    if (!caps.has("push")) return;
    local.pushClosed = true;
    send("push-close");
    if (local.pushChannel?.deviceId) window.dispatchEvent(new CustomEvent("triplem:windows-push-unregister", { detail: { deviceId: local.pushChannel.deviceId } }));
    local.pushChannel = null;
    local.lastUid = "";
  }

  // ---- Messages from the native app -------------------------------------------------------
  function handleNative(msg) {
    switch (msg?.type) {
      case "settings":
        local.settings = {
          notifications: msg.notifications !== false,
          closeToTray: msg.closeToTray !== false,
          startWithWindows: msg.startWithWindows === true,
          autostartManaged: msg.autostartManaged === true,
          autoUpdate: msg.autoUpdate !== false,
          updatesSupported: msg.updatesSupported === true,
          quickAddHotkey: msg.quickAddHotkey !== false,
          hotkeyUnavailable: msg.hotkeyUnavailable === true,
          safeStart: msg.safeStart === true
        };
        renderSettings();
        break;
      case "open":
        openTarget(safe(msg.target), { id: safe(msg.id), action: safe(msg.action) });
        break;
      case "tick":
        local.windowVisible = msg.visible !== false;
        backgroundRefresh(msg.force === true);
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
      case "update": {
        const before = local.update.state;
        local.update = { state: safe(msg.state), version: safe(msg.version), notes: safe(msg.notes), error: safe(msg.error), current: safe(msg.current) };
        renderUpdate();
        if (local.update.state === "ready" && before !== "ready") {
          showDesktopNotice(`Update ${local.update.version} is ready`, "info",
            [{ label: "Restart to update", run: () => send("update-install") }, { label: "Later", run: () => {} }],
            local.update.notes || "Your work is saved online; Triplem VIP reopens in a few seconds.");
        }
        break;
      }
      case "updated":
        showDesktopNotice(`Triplem VIP was updated to ${safe(msg.version)}`, "success");
        break;
      case "safe-start":
        showDesktopNotice("Triplem VIP recovered from a problem", "warn",
          [{ label: "Create error report", run: () => send("report") }],
          "Some Windows extras are paused for this session. Your workspace and data are not affected.");
        break;
      case "report-created":
        showDesktopNotice("Error report created", "success", [], "Attach the selected file to the e-mail that opened. It contains no passwords or business data.");
        break;
      case "push-channel":
        if (typeof msg.uri === "string" && /^[0-9a-f]{32}$/.test(safe(msg.deviceId))) {
          local.pushChannel = { uri: msg.uri, expires: safe(msg.expires), deviceId: safe(msg.deviceId) };
          syncPushRegistration();
        }
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
    beforeLogout,
    _test: Object.freeze({ planToasts, notificationTitle, notificationBody, cssColorToHex, fileAccepted })
  });

  function start() {
    ensureStyles();
    ensureSettingsPanel();
    // The notifications menu can be rebuilt; keep the settings panel present.
    new MutationObserver(() => ensureSettingsPanel()).observe(document.body, { childList: true, subtree: false });
    if (caps.has("theme")) {
      new MutationObserver(() => syncTitleBar()).observe(document.documentElement, { attributes: true, attributeFilter: ["data-triplem-theme", "style", "class"] });
      syncTitleBar();
    }
    // Sign-in / sign-out changes for Store notifications (cheap check).
    if (caps.has("push")) setInterval(syncPushRegistration, 5000);
    send("ready", {});
    try {
      const d = { notifications: Number(document.getElementById("adminNotifyCount")?.dataset.count) || 0, messages: Number(document.getElementById("adminMessagesCount")?.dataset.count) || 0 };
      pushBadge(signedInUserId() ? d.notifications + d.messages : 0);
    } catch (_) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
