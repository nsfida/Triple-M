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
    },
    // 3.7
    async search() { if (window.TriplemDesktopSearch?.focus?.()) return; openSearchPalette(); },
    async "new-invoice"() {
      if (!allowed("accounting") || !can("accounting", "create")) return notAvailable("New invoices");
      goTab("accounting");
      try { await window.TriplemAccounting?.load?.(); } catch (_) {}
      if (typeof window.TriplemAccounting?.openDocument !== "function") return notAvailable("New invoices");
      window.TriplemAccounting.openDocument("sales");
      const type = await waitFor(() => document.querySelector('#acctDocumentForm [name="doc_type"]'), 4000);
      if (type && [...type.options].some(o => o.value === "sales_invoice")) {
        type.value = "sales_invoice";
        type.dispatchEvent(new Event("change", { bubbles: true }));
      }
    },
    async offline() { toggleAppMenu(true); },
    async wallet(opts = {}) {
      const id = safe(opts.id);
      if (!allowed("expenses")) return notAvailable("Expenses");
      goTab("expenses");
      await waitFor(() => document.getElementById("expensesPanel")?.classList.contains("active"));
      const exists = await waitFor(() => { try { return typeof getExpenseAccounts === "function" && getExpenseAccounts({ applyUiFilters: false }).some(a => a.group_id === id); } catch (_) { return false; } }, 6000);
      if (!exists || typeof openWalletDetailsOverlay !== "function") { forgetRecent("wallet", id); return showDesktopNotice("This wallet is no longer available", "warn"); }
      openWalletDetailsOverlay(id);
    },
    async doc(opts = {}) {
      const id = safe(opts.id);
      if (!allowed("accounting")) return notAvailable("Accounting");
      goTab("accounting");
      try { await window.TriplemAccounting?.load?.(); } catch (_) {}
      const found = (window.TriplemAccounting?.state?.documents || []).some(d => safe(d.id) === id);
      if (!found || typeof window.TriplemAccounting?.viewDocument !== "function") { forgetRecent("doc", id); return showDesktopNotice("This document is no longer available", "warn"); }
      window.TriplemAccounting.viewDocument(id);
      noteRecent("doc", id);
    }
  };

  // ---- Quick search (Ctrl+Alt+Shift+F, 3.7) --------------------------------------------------
  // Every section keeps its own search box; this palette sends the text to the
  // section you pick (the current one first) and focuses it.
  const SEARCH_TARGETS = [
    { tab: "expenses", input: "searchExpenses", label: "Expenses & wallets", icon: "fa-wallet" },
    { tab: "goods", input: "searchGoods", label: "Inventory", icon: "fa-boxes-stacked" },
    { tab: "accounting", input: "accountingSearch", label: "Accounting", icon: "fa-scale-balanced" },
    { tab: "loans", input: "searchGiven", label: "Loans", icon: "fa-hand-holding-dollar", panel: "givenPanel" },
    { tab: "installments", input: "searchInstallments", label: "Installment plans", icon: "fa-calendar-check" },
    { tab: "assets", input: "searchAssets", label: "Assets", icon: "fa-building" },
    { tab: "insurance", input: "insuranceFilterSearch", label: "Insurance", icon: "fa-shield-halved" },
    { tab: "notes", input: "searchNotes", label: "Notes", icon: "fa-note-sticky" }
  ];

  function activeSearchTarget(list) {
    const active = [...document.querySelectorAll("section.panel.active")].map(p => p.id);
    return list.find(t => active.includes(`${t.tab}Panel`) || (t.panel && active.includes(t.panel))) || null;
  }

  function closeSearchPalette() {
    document.getElementById("triplemDesktopSearch")?.remove();
  }

  function openSearchPalette() {
    if (!signedInUserId()) return;
    ensureStyles();
    closeSearchPalette();
    const list = SEARCH_TARGETS.filter(t => allowed(t.tab));
    if (!list.length) return notAvailable("Search");
    const current = activeSearchTarget(list);
    const ordered = current ? [current, ...list.filter(t => t !== current)] : list;
    let index = 0;
    const host = document.createElement("div");
    host.id = "triplemDesktopSearch";
    host.className = "dsp-backdrop";
    host.innerHTML = `<div class="dsp-card" role="dialog" aria-modal="true" aria-label="Search">
        <div class="dsp-input"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" placeholder="Search Triplem VIP…" aria-label="Search text" autocomplete="off"><kbd>Esc</kbd></div>
        <ul class="dsp-list" role="listbox">${ordered.map((t, i) => `<li role="option" data-i="${i}"${i === 0 ? ' aria-selected="true"' : ""}><i class="fa-solid ${esc(t.icon)}" aria-hidden="true"></i><span>Search in <strong>${esc(t.label)}</strong></span>${t === current ? "<em>Current</em>" : ""}</li>`).join("")}</ul>
        <p class="dsp-hint">Enter to search · ↑ ↓ to choose a section</p>
      </div>`;
    document.body.appendChild(host);
    const input = host.querySelector("input");
    const items = [...host.querySelectorAll("li")];
    const select = i => { index = (i + items.length) % items.length; items.forEach((li, n) => li.setAttribute("aria-selected", n === index ? "true" : "false")); items[index].scrollIntoView({ block: "nearest" }); };
    const run = async () => {
      const target = ordered[index];
      const text = input.value.trim();
      closeSearchPalette();
      goTab(target.tab);
      const field = await waitFor(() => { const el = document.getElementById(target.input); return el && el.offsetParent !== null ? el : null; }, 6000);
      if (!field) return notAvailable(`Search in ${target.label}`);
      if (text) {
        field.value = text;
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
      }
      field.focus();
      try { field.select(); } catch (_) {}
    };
    input.addEventListener("keydown", e => {
      if (e.key === "ArrowDown") { e.preventDefault(); select(index + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); select(index - 1); }
      else if (e.key === "Enter") { e.preventDefault(); run(); }
      else if (e.key === "Escape") { e.preventDefault(); closeSearchPalette(); }
    });
    host.addEventListener("click", e => {
      if (e.target === host) { closeSearchPalette(); return; }
      const li = e.target.closest("li[data-i]");
      if (li) { select(Number(li.dataset.i)); run(); }
    });
    setTimeout(() => input.focus(), 20);
  }

  // ---- Recent records for the taskbar Jump List (3.7) ------------------------------------
  const RECENT_PREFIX = "triplem-desktop-recent-v1:";
  const DOC_KIND_LABELS = { quotation: "Quotation", sales_order: "Sales order", delivery_note: "Delivery note", sales_invoice: "Invoice", credit_note: "Credit note", sales_return: "Sales return", purchase_order: "Purchase order", purchase_receipt: "Purchase receipt", purchase_bill: "Purchase bill", expense_invoice: "Expense invoice", debit_note: "Debit note", purchase_return: "Purchase return" };

  function readRecent(uid) {
    try { const v = JSON.parse(localStorage.getItem(RECENT_PREFIX + uid) || "[]"); return Array.isArray(v) ? v.filter(r => r && UUID_RE.test(safe(r.id)) && (r.kind === "doc" || r.kind === "wallet")).slice(0, 6) : []; } catch (_) { return []; }
  }
  function sendRecent() {
    if (!caps.has("recent")) return;
    const uid = signedInUserId();
    send("recent", { recent: uid ? readRecent(uid) : [] });
  }
  function recentTitle(kind, id) {
    try {
      if (kind === "wallet" && typeof getExpenseAccounts === "function") {
        const a = getExpenseAccounts({ applyUiFilters: false }).find(x => x.group_id === id);
        return a ? safe(a.person_name || "Wallet").trim() + (a.currency ? ` (${safe(a.currency)})` : "") : "";
      }
      if (kind === "doc") {
        const d = (window.TriplemAccounting?.state?.documents || []).find(x => safe(x.id) === id);
        return d ? `${DOC_KIND_LABELS[d.doc_type] || "Document"} ${safe(d.document_no)}`.trim() : "";
      }
    } catch (_) {}
    return "";
  }
  function noteRecent(kind, id) {
    const uid = signedInUserId();
    if (!caps.has("recent") || !uid || !UUID_RE.test(safe(id))) return;
    const title = recentTitle(kind, id).slice(0, 60);
    if (!title) return;
    const list = readRecent(uid).filter(r => !(r.kind === kind && r.id === id));
    list.unshift({ kind, id, title });
    try { localStorage.setItem(RECENT_PREFIX + uid, JSON.stringify(list.slice(0, 6))); } catch (_) {}
    sendRecent();
  }
  function forgetRecent(kind, id) {
    const uid = signedInUserId();
    if (!uid) return;
    try { localStorage.setItem(RECENT_PREFIX + uid, JSON.stringify(readRecent(uid).filter(r => !(r.kind === kind && r.id === id)))); } catch (_) {}
    sendRecent();
  }
  function trackRecentRecords() {
    if (!caps.has("recent")) return;
    // Wallet details (all ways of opening them go through this function).
    if (typeof window.openWalletDetailsOverlay === "function" && !window.openWalletDetailsOverlay.__triplemRecent) {
      const original = window.openWalletDetailsOverlay;
      const wrapped = function (groupId) {
        const result = original.apply(this, arguments);
        try { noteRecent("wallet", safe(groupId).trim()); } catch (_) {}
        return result;
      };
      wrapped.__triplemRecent = true;
      try { window.openWalletDetailsOverlay = wrapped; } catch (_) {}
    }
    // Accounting documents opened from any list.
    document.addEventListener("click", e => {
      const el = e.target.closest?.('[data-acct-action="view-document"][data-id]');
      if (el) setTimeout(() => noteRecent("doc", safe(el.dataset.id)), 0);
    }, true);
  }

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
    // Recent records from the Jump List arrive as "wallet:<id>" / "doc:<id>".
    const rec = /^(wallet|doc):([0-9a-f-]{36})$/i.exec(safe(target));
    if (rec && UUID_RE.test(rec[2])) { target = rec[1].toLowerCase(); opts = { ...opts, id: rec[2].toLowerCase() }; }
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
      @media (prefers-reduced-motion:reduce){#triplemDesktopNotice.show{animation:none}.desktop-app-switch input,.desktop-app-switch input::after{transition:none}}
      /* ---- 3.7: Windows app bar under the header icons ---- */
      .desktop-appbar-wrap{flex:1 0 100%;width:0;min-width:0;height:32px;position:relative}
      .btn.ghost.desktop-appbar{position:absolute;top:0;left:0;width:100%;min-width:0;min-height:32px;height:32px;padding:0 6px 0 12px;box-sizing:border-box;border-radius:999px;display:flex;align-items:center;justify-content:space-between;gap:8px;
        font-size:.76rem;font-weight:650;line-height:1;overflow:hidden;text-align:left}
      .desktop-appbar .dab-left,.desktop-appbar .dab-right{display:inline-flex;align-items:center;gap:7px;min-width:0}
      .desktop-appbar .dab-left i{color:var(--primary,#2457d6);font-size:.86rem}
      .desktop-appbar .dab-title{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .desktop-appbar .dab-version{color:var(--muted,#667085);font-weight:600;font-size:.7rem;font-variant-numeric:tabular-nums;white-space:nowrap}
      .desktop-appbar .dab-chip{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 8px;border-radius:999px;font-size:.68rem;font-weight:700;white-space:nowrap;
        background:color-mix(in srgb,var(--success,#16a34a) 12%,transparent);color:var(--success,#15803d)}
      .desktop-appbar .dab-chip[hidden]{display:none}
      .desktop-appbar .dab-dot,.desktop-app-menu .dam-dot{width:7px;height:7px;border-radius:50%;background:currentColor;flex:0 0 auto}
      .desktop-appbar .dab-chip[data-tone="offline"]{background:color-mix(in srgb,var(--muted,#64748b) 16%,transparent);color:var(--muted,#475569)}
      .desktop-appbar .dab-chip[data-tone="pending"],.desktop-appbar .dab-chip[data-tone="sync"]{background:color-mix(in srgb,var(--primary,#2457d6) 13%,transparent);color:var(--primary,#2457d6)}
      .desktop-appbar .dab-chip[data-tone="warn"]{background:color-mix(in srgb,var(--warning,#d97706) 15%,transparent);color:var(--warning,#b45309)}
      .desktop-appbar .dab-chip[data-tone="sync"] .dab-dot{animation:tvipPulse 1s ease-in-out infinite}
      .desktop-appbar .dab-chip.is-lock{background:color-mix(in srgb,var(--primary,#2457d6) 13%,transparent);color:var(--primary,#2457d6);padding:0 7px}
      .desktop-appbar .dab-chip.is-update{background:var(--primary,#2457d6);color:#fff}
      .desktop-appbar .dab-caret{font-size:.62rem;color:var(--muted,#667085);margin:0 4px 0 2px;transition:transform .15s}
      .desktop-appbar[aria-expanded="true"] .dab-caret{transform:rotate(180deg)}
      @keyframes tvipPulse{50%{opacity:.35}}
      #desktopAppMenu.menu-dropdown.desktop-app-menu{position:fixed!important;z-index:12100!important;padding:0;display:none;flex-direction:column;overflow-y:auto;overscroll-behavior:contain;border-radius:16px;min-width:0;color:var(--text,#17212b);
        background:var(--surface-glass,var(--surface-elevated,#fff))!important;backdrop-filter:blur(22px) saturate(1.15);-webkit-backdrop-filter:blur(22px) saturate(1.15)}
      #desktopAppMenu.menu-dropdown.desktop-app-menu.open{display:flex}
      /* Themes restyle every <input>; the switch track must win in all of them. */
      html body #desktopAppMenu.desktop-app-menu .desktop-app-switch input[type="checkbox"][role="switch"]{background-color:color-mix(in srgb,var(--muted,#64748b) 45%,transparent)!important;border:0!important;box-shadow:none!important}
      html body #desktopAppMenu.desktop-app-menu .desktop-app-switch input[type="checkbox"][role="switch"]:checked{background-color:var(--primary,#2457d6)!important}
      .desktop-app-menu .dam-head{display:flex;align-items:center;gap:10px;padding:12px 12px 10px 14px;border-bottom:1px solid var(--line,rgba(148,163,184,.25))}
      .desktop-app-menu .dam-logo{width:32px;height:32px;border-radius:10px;display:grid;place-items:center;background:color-mix(in srgb,var(--primary,#2457d6) 12%,transparent);color:var(--primary,#2457d6);flex:0 0 auto}
      .desktop-app-menu .dam-head-text{flex:1;min-width:0}
      .desktop-app-menu .dam-head-text strong{display:block;font-size:.86rem;color:var(--text,#17212b)}
      .desktop-app-menu .dam-head-text small{display:block;font-size:.72rem;color:var(--muted,#667085);margin-top:1px}
      .desktop-app-menu .dam-close{border:0;background:none;color:var(--muted,#667085);width:28px;height:28px;border-radius:8px;cursor:pointer}
      .desktop-app-menu .dam-close:hover{background:var(--surface-hover,rgba(241,245,249,.92));color:var(--text,#17212b)}
      .desktop-app-menu .dam-section{display:grid;gap:10px;padding:12px 14px;border-bottom:1px solid var(--line,rgba(148,163,184,.2))}
      .desktop-app-menu .dam-section h5{margin:0;font-size:.68rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#667085);font-weight:700}
      .desktop-app-menu .dam-status{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;padding:10px 12px;border-radius:12px;background:color-mix(in srgb,var(--success,#16a34a) 9%,transparent);color:var(--success,#15803d)}
      .desktop-app-menu .dam-status[data-tone="offline"]{background:color-mix(in srgb,var(--muted,#64748b) 12%,transparent);color:var(--muted,#475569)}
      .desktop-app-menu .dam-status[data-tone="pending"],.desktop-app-menu .dam-status[data-tone="sync"]{background:color-mix(in srgb,var(--primary,#2457d6) 10%,transparent);color:var(--primary,#2457d6)}
      .desktop-app-menu .dam-status[data-tone="warn"]{background:color-mix(in srgb,var(--warning,#d97706) 12%,transparent);color:var(--warning,#b45309)}
      .desktop-app-menu .dam-status-text{flex:1 1 calc(100% - 24px);min-width:0}
      .desktop-app-menu .dam-status-text strong{display:block;font-size:.82rem}
      .desktop-app-menu .dam-status-text small{display:block;font-size:.73rem;line-height:1.4;color:var(--text,#17212b);opacity:.78;margin-top:2px}
      .desktop-app-menu .dam-status-actions{display:flex;gap:6px;flex:1 0 100%;justify-content:flex-end}
      .desktop-app-menu .dam-status-actions:not(:has(.dam-btn:not([hidden]))){display:none}
      .desktop-app-menu .dam-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
      .desktop-app-menu .dam-row strong{display:block;font-size:.82rem;color:var(--text,#17212b);font-weight:600}
      .desktop-app-menu .dam-row small{display:block;font-size:.72rem;line-height:1.4;color:var(--muted,#667085);margin-top:1px}
      .desktop-app-menu .dam-btn,.desktop-app-menu .desktop-app-actions button{font:inherit;font-size:.75rem;font-weight:650;border:1px solid var(--line-strong,rgba(71,85,105,.3));background:var(--control-bg,#fff);color:var(--text,#17212b);
        border-radius:999px;padding:6px 12px;cursor:pointer;line-height:1.2;white-space:nowrap;display:inline-flex;align-items:center;gap:6px}
      .desktop-app-menu .dam-btn:hover:not(:disabled),.desktop-app-menu .desktop-app-actions button:hover:not(:disabled){background:var(--control-hover,#f1f5f9)}
      .desktop-app-menu .dam-btn.primary{background:var(--primary,#2457d6);border-color:var(--primary,#2457d6);color:#fff}
      .desktop-app-menu .dam-btn:disabled,.desktop-app-menu .desktop-app-actions button:disabled{opacity:.55;cursor:default}
      .desktop-app-menu .dam-btn[hidden]{display:none}
      .desktop-app-menu .dam-select{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:.82rem;color:var(--text,#17212b)}
      .desktop-app-menu .dam-select select{font:inherit;font-size:.78rem;border:1px solid var(--line-strong,rgba(71,85,105,.3));background:var(--control-bg,#fff);color:var(--text,#17212b);border-radius:9px;padding:5px 8px;max-width:58%}
      .desktop-app-menu .dam-select.is-off{opacity:.55}
      .desktop-app-menu .dam-keys{list-style:none;margin:0;padding:0;display:grid;gap:4px}
      .desktop-app-menu .dam-keys li{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:.78rem;color:var(--text,#17212b);padding:5px 8px;border-radius:9px;background:var(--surface-hover,rgba(241,245,249,.7))}
      .desktop-app-menu .dam-keys kbd{font:inherit;font-size:.7rem;font-weight:700;color:var(--muted,#475569);background:var(--control-bg,#fff);border:1px solid var(--line,rgba(148,163,184,.35));border-radius:6px;padding:2px 6px;white-space:nowrap}
      .desktop-app-menu .dam-keys li.is-busy kbd{color:var(--warning,#b45309);border-color:color-mix(in srgb,var(--warning,#d97706) 45%,transparent);text-decoration:line-through}
      .desktop-app-menu .dam-keys li.is-off{opacity:.5}
      .desktop-app-menu .desktop-app-switch input:disabled+*{opacity:.6}
      /* ---- 3.8: accordion menu ---- */
      .desktop-app-menu .dam-accordion{display:flex;flex-direction:column;padding:6px}
      .desktop-app-menu .dam-acc{border-radius:12px;transition:background-color .2s ease}
      .desktop-app-menu .dam-acc+.dam-acc{margin-top:2px}
      .desktop-app-menu .dam-acc.is-open{background:color-mix(in srgb,var(--primary,#2457d6) 6%,transparent)}
      .desktop-app-menu .dam-acc-head{all:unset;box-sizing:border-box;width:100%;display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:12px;cursor:pointer;color:var(--text,#17212b);font:inherit;font-size:.82rem;font-weight:650;line-height:1.2;-webkit-tap-highlight-color:transparent}
      .desktop-app-menu .dam-acc-head:hover{background:var(--surface-hover,rgba(241,245,249,.8))}
      .desktop-app-menu .dam-acc.is-open .dam-acc-head:hover{background:transparent}
      .desktop-app-menu .dam-acc-head:focus-visible{outline:2px solid var(--primary,#2457d6);outline-offset:-2px}
      .desktop-app-menu .dam-acc-icon{width:28px;height:28px;border-radius:9px;display:grid;place-items:center;flex:0 0 auto;font-size:.8rem;color:var(--primary,#2457d6);background:color-mix(in srgb,var(--primary,#2457d6) 11%,transparent)}
      .desktop-app-menu .dam-acc-title{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .desktop-app-menu .dam-acc-chip{flex:0 1 auto;min-width:0;max-width:46%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:.68rem;font-weight:700;padding:3px 8px;border-radius:999px;color:var(--muted,#667085);background:color-mix(in srgb,var(--muted,#64748b) 12%,transparent);font-variant-numeric:tabular-nums}
      .desktop-app-menu .dam-acc-chip:empty{display:none}
      .desktop-app-menu .dam-acc-chip[data-tone="ok"]{color:var(--success,#15803d);background:color-mix(in srgb,var(--success,#16a34a) 12%,transparent)}
      .desktop-app-menu .dam-acc-chip[data-tone="pending"],.desktop-app-menu .dam-acc-chip[data-tone="sync"]{color:var(--primary,#2457d6);background:color-mix(in srgb,var(--primary,#2457d6) 12%,transparent)}
      .desktop-app-menu .dam-acc-chip[data-tone="warn"]{color:var(--warning,#b45309);background:color-mix(in srgb,var(--warning,#d97706) 14%,transparent)}
      .desktop-app-menu .dam-acc-chip[data-tone="offline"]{color:var(--muted,#475569)}
      .desktop-app-menu .dam-acc-caret{font-size:.62rem;color:var(--muted,#667085);transition:transform .28s cubic-bezier(.2,.8,.2,1);flex:0 0 auto}
      .desktop-app-menu .dam-acc.is-open .dam-acc-caret{transform:rotate(180deg)}
      .desktop-app-menu .dam-acc-body{display:grid;grid-template-rows:0fr;transition:grid-template-rows .28s cubic-bezier(.2,.8,.2,1)}
      .desktop-app-menu .dam-acc.is-open .dam-acc-body{grid-template-rows:1fr}
      .desktop-app-menu .dam-acc-inner{min-height:0;overflow:hidden}
      .desktop-app-menu .dam-acc-content{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;padding:4px 12px 12px 48px;opacity:0;transform:translateY(-4px);transition:opacity .2s ease,transform .28s cubic-bezier(.2,.8,.2,1)}
      .desktop-app-menu .dam-acc.is-open .dam-acc-content{opacity:1;transform:none;transition-delay:.05s}
      .desktop-app-menu .dam-btns{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}
      .desktop-app-menu .dam-btns-wide{justify-content:flex-start}
      .desktop-app-menu .dam-btns:not(:has(.dam-btn:not([hidden]))){display:none}
      .desktop-app-menu .dam-btn.icon{padding:6px 9px}
      .desktop-app-menu .dam-btn kbd{font:inherit;font-size:.66rem;font-weight:700;color:var(--muted,#475569);border:1px solid var(--line,rgba(148,163,184,.35));border-radius:5px;padding:0 4px;margin-left:2px}
      .desktop-app-menu .dam-row-text{min-width:0;flex:1}
      .desktop-app-menu .dam-acc-content>*{min-width:0}
      .desktop-app-menu .dam-select span{flex:1;min-width:0}
      .desktop-app-menu .dam-select select,.desktop-app-menu .dam-select input[type="time"]{flex:0 1 auto;min-width:0}
      .desktop-app-menu .dam-row-text small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .desktop-app-menu .dam-status{padding:8px 10px;gap:6px 9px}
      .desktop-app-menu .dam-status-text{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
      .desktop-app-menu .dam-status-text small{margin:0}
      .desktop-app-menu .dam-select[hidden],.desktop-app-menu .dam-select [hidden]{display:none!important}
      .desktop-app-menu .dam-select input[type="time"]{font:inherit;font-size:.78rem;border:1px solid var(--line-strong,rgba(71,85,105,.3));background:var(--control-bg,#fff);color:var(--text,#17212b);border-radius:9px;padding:4px 8px;min-height:30px}
      .desktop-app-menu .dam-select select+select{margin-left:6px}
      .desktop-app-menu .dam-line{margin:0;font-size:.74rem;color:var(--muted,#667085);font-variant-numeric:tabular-nums;min-height:1em}
      .desktop-app-menu .dam-line.is-warn,.desktop-app-menu .dam-warn{color:var(--warning,#b45309);font-size:.74rem;font-weight:600}
      .desktop-app-menu .dam-warn[hidden],.desktop-app-menu .dam-note[hidden]{display:none}
      .desktop-app-menu .dam-note{margin:0;padding:8px 10px;border-radius:10px;font-size:.76rem;font-weight:600;color:var(--text,#17212b);background:color-mix(in srgb,var(--warning,#d97706) 11%,transparent)}
      .desktop-app-menu .dam-folder .dam-btns{flex:0 0 auto}
      .desktop-app-menu .dam-spin{width:12px;height:12px;border-radius:50%;border:2px solid currentColor;border-right-color:transparent;display:inline-block;animation:tvipSpin .8s linear infinite}
      @keyframes tvipSpin{to{transform:rotate(360deg)}}
      .desktop-app-menu .dam-foot{display:flex;justify-content:flex-end;padding:4px 12px 10px;border-top:1px solid var(--line,rgba(148,163,184,.2))}
      .desktop-app-menu .dam-link{border:0;background:none;color:var(--muted,#667085);font:inherit;font-size:.74rem;font-weight:650;cursor:pointer;padding:6px 4px;display:inline-flex;align-items:center;gap:6px;border-radius:8px}
      .desktop-app-menu .dam-link:hover{color:var(--text,#17212b)}
      .desktop-appbar .dab-chip.is-backup{background:color-mix(in srgb,var(--primary,#2457d6) 13%,transparent);color:var(--primary,#2457d6);padding:0 7px}
      .desktop-appbar .dab-chip.is-backup i{animation:tvipPulse 1.2s ease-in-out infinite}
      @media (max-width:420px){.desktop-app-menu .dam-acc-content{padding-left:12px}}
      @media (prefers-reduced-motion:reduce){.desktop-app-menu .dam-acc-body,.desktop-app-menu .dam-acc-content,.desktop-app-menu .dam-acc-caret{transition:none!important}.desktop-app-menu .dam-spin,.desktop-appbar .dab-chip.is-backup i{animation:none}}
      /* ---- 3.8: keyboard shortcuts overlay ---- */
      .dkh-backdrop{position:fixed;inset:0;z-index:2147482000;display:grid;place-items:center;padding:16px;background:rgba(15,23,42,.42);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);animation:tvipFade .16s ease-out}
      .dkh-card{width:min(720px,100%);max-height:calc(100vh - 32px);display:flex;flex-direction:column;border-radius:18px;background:var(--surface-elevated,#fff);color:var(--text,#17212b);box-shadow:0 30px 70px rgba(2,6,23,.35);border:1px solid var(--line,rgba(148,163,184,.25));overflow:hidden;outline:0}
      .dkh-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid var(--line,rgba(148,163,184,.25))}
      .dkh-head h3{margin:0;font-size:1rem;display:flex;align-items:center;gap:9px}
      .dkh-head h3 i{color:var(--primary,#2457d6)}
      .dkh-x{border:0;background:none;color:var(--muted,#667085);width:30px;height:30px;border-radius:9px;cursor:pointer}
      .dkh-x:hover{background:var(--surface-hover,#f1f5f9);color:var(--text,#17212b)}
      .dkh-body{display:grid;grid-template-columns:1fr 1fr;gap:6px 22px;padding:12px 18px 18px;overflow-y:auto}
      .dkh-body h4{margin:10px 0 6px;font-size:.68rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#667085)}
      .dkh-body ul{list-style:none;margin:0;padding:0;display:grid;gap:3px}
      .dkh-body li{display:flex;align-items:center;gap:12px;font-size:.82rem;padding:5px 8px;border-radius:9px}
      .dkh-body li:hover{background:var(--surface-hover,rgba(241,245,249,.7))}
      .dkh-keys{display:inline-flex;align-items:center;gap:4px;min-width:118px;color:var(--muted,#667085);font-size:.7rem}
      .dkh-keys kbd{font:inherit;font-size:.7rem;font-weight:700;color:var(--text,#17212b);background:var(--control-bg,#fff);border:1px solid var(--line-strong,rgba(71,85,105,.3));border-bottom-width:2px;border-radius:6px;padding:2px 7px;min-width:12px;text-align:center}
      .dkh-empty{margin:0;font-size:.8rem;color:var(--muted,#667085)}
      @keyframes tvipFade{from{opacity:0}to{opacity:1}}
      @media (max-width:640px){.dkh-body{grid-template-columns:1fr}}
      @media print{.dkh-backdrop{display:none!important}}
      /* ---- 3.7: print panel ---- */
      .dpp-backdrop,.dsp-backdrop{position:fixed;inset:0;z-index:2147482000;display:grid;place-items:center;padding:16px;background:rgba(15,23,42,.42);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px)}
      .dpp-card{width:min(620px,100%);max-height:calc(100vh - 32px);display:flex;flex-direction:column;border-radius:18px;background:var(--surface-elevated,#fff);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);color:var(--text,#17212b);box-shadow:0 30px 70px rgba(2,6,23,.35);border:1px solid var(--line,rgba(148,163,184,.25));overflow:hidden}
      .dpp-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 18px 10px}
      .dpp-head h3{margin:0;font-size:1.02rem;display:flex;align-items:center;gap:8px}
      .dpp-head h3 i{color:var(--primary,#2457d6)}
      .dpp-head p{margin:3px 0 0;font-size:.78rem;color:var(--muted,#667085);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:440px}
      .dpp-x{border:0;background:none;color:var(--muted,#667085);width:30px;height:30px;border-radius:9px;cursor:pointer}
      .dpp-x:hover{background:var(--surface-hover,#f1f5f9)}
      .dpp-body{display:grid;grid-template-columns:1fr 1fr;gap:12px 14px;padding:6px 18px 14px;overflow-y:auto}
      .dpp-field{display:grid;gap:5px;font-size:.76rem;font-weight:650;color:var(--muted,#667085);min-width:0}
      .dpp-field select,.dpp-field input{font:inherit;font-size:.84rem;font-weight:500;color:var(--text,#17212b);background:var(--control-bg,#fff);border:1px solid var(--line-strong,rgba(71,85,105,.3));border-radius:10px;padding:7px 9px;min-width:0;width:100%;box-sizing:border-box}
      .dpp-field select:focus,.dpp-field input:focus{outline:2px solid color-mix(in srgb,var(--primary,#2457d6) 45%,transparent);outline-offset:1px}
      .dpp-field input:disabled{opacity:.5}
      .dpp-wide{grid-column:1/-1}
      .dpp-pages{display:grid;grid-template-columns:96px 1fr;gap:6px}
      .dpp-seg{display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--line-strong,rgba(71,85,105,.3));border-radius:10px;overflow:hidden}
      .dpp-seg label{position:relative;cursor:pointer}
      .dpp-seg input{position:absolute;opacity:0;pointer-events:none}
      .dpp-seg span{display:block;text-align:center;padding:7px 6px;font-size:.8rem;font-weight:600;color:var(--text,#17212b);background:var(--control-bg,#fff)}
      .dpp-seg input:checked+span{background:var(--primary,#2457d6);color:#fff}
      .dpp-seg input:focus-visible+span{outline:2px solid var(--primary,#2457d6);outline-offset:-3px}
      .dpp-checks{display:flex;flex-wrap:wrap;gap:8px 18px;font-size:.82rem;color:var(--text,#17212b)}
      .dpp-checks label{display:inline-flex;align-items:center;gap:7px;cursor:pointer}
      .dpp-checks input{width:16px;height:16px;accent-color:var(--primary,#2457d6)}
      .dpp-error{margin:0;color:var(--danger,#dc2626);font-size:.78rem;font-weight:600}
      .dpp-foot{display:flex;align-items:center;gap:8px;padding:12px 18px 16px;border-top:1px solid var(--line,rgba(148,163,184,.25))}
      .dpp-spacer{flex:1}
      .dpp-link{border:0;background:none;color:var(--primary,#2457d6);font:inherit;font-size:.8rem;font-weight:650;cursor:pointer;padding:6px 2px}
      .dpp-btn{font:inherit;font-size:.82rem;font-weight:650;border:1px solid var(--line-strong,rgba(71,85,105,.3));background:var(--control-bg,#fff);color:var(--text,#17212b);border-radius:11px;padding:8px 14px;cursor:pointer;display:inline-flex;align-items:center;gap:7px}
      .dpp-btn:hover{background:var(--control-hover,#f1f5f9)}
      .dpp-btn.primary{background:var(--primary,#2457d6);border-color:var(--primary,#2457d6);color:#fff}
      .dpp-btn.primary:hover{filter:brightness(1.06)}
      @media (max-width:560px){.dpp-body{grid-template-columns:1fr}.dpp-foot{flex-wrap:wrap}.dpp-spacer{display:none}}
      /* ---- 3.7: quick search ---- */
      .dsp-backdrop{place-items:start center;padding-top:12vh}
      .dsp-card{width:min(560px,100%);border-radius:18px;background:var(--surface-elevated,#fff);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);color:var(--text,#17212b);box-shadow:0 30px 70px rgba(2,6,23,.35);border:1px solid var(--line,rgba(148,163,184,.25));overflow:hidden}
      .dsp-input{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line,rgba(148,163,184,.25))}
      .dsp-input i{color:var(--muted,#667085)}
      .dsp-input input{flex:1;border:0;outline:0;background:transparent;font:inherit;font-size:1rem;color:var(--text,#17212b);min-width:0}
      .dsp-input kbd{font:inherit;font-size:.68rem;color:var(--muted,#667085);border:1px solid var(--line,rgba(148,163,184,.35));border-radius:6px;padding:2px 6px}
      .dsp-list{list-style:none;margin:0;padding:6px;max-height:min(46vh,360px);overflow-y:auto}
      .dsp-list li{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:10px;font-size:.86rem;cursor:pointer}
      .dsp-list li i{width:18px;text-align:center;color:var(--primary,#2457d6)}
      .dsp-list li span{flex:1}
      .dsp-list li em{font-style:normal;font-size:.68rem;font-weight:700;color:var(--muted,#667085)}
      .dsp-list li[aria-selected="true"]{background:color-mix(in srgb,var(--primary,#2457d6) 11%,transparent)}
      .dsp-hint{margin:0;padding:8px 16px 12px;font-size:.72rem;color:var(--muted,#667085)}
      @media print{.dpp-backdrop,.dsp-backdrop,.desktop-app-menu{display:none!important}}
      @media (prefers-reduced-motion:reduce){.desktop-appbar .dab-caret,.desktop-appbar .dab-chip .dab-dot{transition:none;animation:none}}
      @media screen{#triplemDesktopPrintHost{display:none!important}}
      @media print{
        body.triplem-desktop-printing>*:not(#triplemDesktopPrintHost){display:none!important}
        body.triplem-desktop-printing #triplemDesktopPrintHost{display:block!important}
      }`;
    document.head.appendChild(style);
  }

  // ---- Windows app bar + menu (3.7, accordion since 3.8) ------------------------------------
  // A bar under the header icons (from the bell to the account icon) shows the
  // app's state at a glance: connection, changes waiting to sync, lock and
  // updates. Clicking it opens the Windows app menu: one closed banner per
  // topic; opening a banner closes the one that was open.
  function switchRow(key, label, id = "") {
    return `<label class="desktop-app-switch"><span>${esc(label)}</span><input type="checkbox" role="switch" data-desktop-setting="${esc(key)}"${id ? ` id="${esc(id)}"` : ""}></label>`;
  }

  const LOCK_CHOICES = [[0, "When closed or minimised"], [1, "After 1 minute"], [5, "After 5 minutes"], [15, "After 15 minutes"], [30, "After 30 minutes"], [60, "After 1 hour"]];
  const HELLO_TEXT = {
    1: "No Windows Hello device is available on this PC.",
    2: "Set up Windows Hello in Settings > Accounts > Sign-in options first.",
    3: "Windows Hello is turned off by your organisation.",
    4: "Windows Hello is busy. Try again in a moment."
  };
  const HOTKEY_LABELS = { "new-expense": "Add expense", search: "Search", "new-invoice": "New sales invoice" };
  const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const APPKEYS_KEY = "triplem-desktop-appkeys-v1";
  const ACC_ICONS = { sync: "fa-wifi", backup: "fa-box-archive", security: "fa-fingerprint", notify: "fa-bell", keys: "fa-keyboard", updates: "fa-rotate" };

  function hotkeyList() {
    const list = Array.isArray(info.hotkeys) && info.hotkeys.length ? info.hotkeys : [{ target: "new-expense", keys: SHORTCUT }];
    return list.filter(h => HOTKEY_LABELS[h.target]);
  }
  function appKeysOn() { try { return localStorage.getItem(APPKEYS_KEY) !== "0"; } catch (_) { return true; } }

  function accItem(id, title, body) {
    const cap = id.charAt(0).toUpperCase() + id.slice(1);
    return `<section class="dam-acc" data-acc="${id}">
        <button type="button" class="dam-acc-head" id="damAcc${cap}Head" aria-expanded="false" aria-controls="damAcc${cap}">
          <span class="dam-acc-icon" aria-hidden="true"><i class="fa-solid ${ACC_ICONS[id]}"></i></span>
          <span class="dam-acc-title">${esc(title)}</span>
          <span class="dam-acc-chip" id="damChip${cap}"></span>
          <i class="fa-solid fa-chevron-down dam-acc-caret" aria-hidden="true"></i>
        </button>
        <div class="dam-acc-body" id="damAcc${cap}" role="region" aria-labelledby="damAcc${cap}Head"><div class="dam-acc-inner"><div class="dam-acc-content">${body}</div></div></div>
      </section>`;
  }

  function appMenuHtml() {
    const lockOptions = LOCK_CHOICES.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join("");
    const keys = hotkeyList().map(h => `<li data-hotkey="${esc(h.target)}"><span>${esc(HOTKEY_LABELS[h.target])}</span><kbd>${esc(h.keys)}</kbd></li>`).join("");
    const monthDays = Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}">${i + 1}${["st", "nd", "rd"][((i + 1) % 10) - 1] && ![11, 12, 13].includes(i + 1) ? ["st", "nd", "rd"][((i + 1) % 10) - 1] : "th"}</option>`).join("");
    const items = [];
    items.push(accItem("sync", "Connection & sync", `
        <div class="dam-status" id="damStatus" aria-live="polite">
          <span class="dam-dot" aria-hidden="true"></span>
          <div class="dam-status-text"><strong id="damStatusTitle">Online</strong><small id="damStatusText"></small></div>
        </div>
        <div class="dam-btns"><button type="button" class="dam-btn" data-dam="review" id="damReviewBtn" hidden>Review</button><button type="button" class="dam-btn primary" data-dam="sync" id="damSyncBtn" hidden>Sync now</button></div>
        ${caps.has("offlineprep") ? `<div class="dam-row" id="damOfflineRow"><div class="dam-row-text"><strong>Offline copy</strong><small id="damOfflineText"></small></div><button type="button" class="dam-btn" data-dam="prepare" id="damPrepareBtn">Prepare now</button></div>` : ""}`));
    if (caps.has("backup")) items.push(accItem("backup", "Backup & restore", `
        <p class="dam-note" id="damBackupNote" hidden></p>
        <div class="dam-btns dam-btns-wide"><button type="button" class="dam-btn primary" data-dam="backup-now" id="damBackupNow"><i class="fa-solid fa-download" aria-hidden="true"></i> Back up now</button><button type="button" class="dam-btn" data-dam="restore" id="damRestoreBtn"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i> Restore</button></div>
        <label class="dam-select"><span>Automatic backup</span><select id="damBackupFreq"><option value="off">Off</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
        <label class="dam-select" id="damBackupDayRow"><span>Day</span><select id="damBackupWeekday">${WEEKDAYS.map((d, i) => `<option value="${i}">${d}</option>`).join("")}</select><select id="damBackupMonthday">${monthDays}</select></label>
        <label class="dam-select" id="damBackupTimeRow"><span>Time</span><input type="time" id="damBackupTime" value="21:00" step="60"></label>
        <label class="dam-select" id="damBackupKeepRow"><span>Keep</span><select id="damBackupKeep"><option value="5">Last 5</option><option value="10">Last 10</option><option value="20">Last 20</option><option value="30">Last 30</option><option value="0">All</option></select></label>
        <div class="dam-row dam-folder"><div class="dam-row-text"><strong>Folder</strong><small id="damBackupFolder" title=""></small></div><div class="dam-btns"><button type="button" class="dam-btn" data-dam="backup-folder">Change</button><button type="button" class="dam-btn icon" data-dam="backup-open" title="Open folder" aria-label="Open folder"><i class="fa-solid fa-folder-open" aria-hidden="true"></i></button></div></div>
        <p class="dam-line" id="damBackupLine" aria-live="polite"></p>`));
    if (caps.has("applock")) items.push(accItem("security", "Security", `
        <label class="desktop-app-switch"><span>Lock with Windows Hello</span><input type="checkbox" role="switch" id="damLockSwitch"></label>
        <small class="dam-warn" id="damLockHint" hidden></small>
        <label class="dam-select" id="damLockMinutesRow"><span>Lock the app</span><select id="damLockMinutes">${lockOptions}</select></label>
        ${switchRow("lockHideDetails", "Hide notification text while locked")}
        <div class="dam-btns"><button type="button" class="dam-btn" data-dam="lock-now" id="damLockNow"><i class="fa-solid fa-lock" aria-hidden="true"></i> Lock now</button></div>`));
    items.push(accItem("notify", "Notifications & background", `
        ${switchRow("notifications", "Windows notifications")}
        ${caps.has("traybadge") ? switchRow("trayBadge", "Unread count on the tray icon") : ""}
        ${switchRow("closeToTray", "Keep running when closed")}
        ${caps.has("savememory") ? switchRow("saveMemory", "Save memory in the background") : ""}
        ${switchRow("startWithWindows", "Start with Windows")}`));
    items.push(accItem("keys", "Shortcuts", `
        <label class="desktop-app-switch"><span>Shortcuts in the app</span><input type="checkbox" role="switch" id="damAppKeys"></label>
        ${caps.has("hotkey") ? `${switchRow("quickAddHotkey", "Shortcuts from any app")}<small class="dam-warn" id="desktopHotkeyHint" hidden></small><ul class="dam-keys" id="damKeys">${keys}</ul>` : ""}
        ${caps.has("recent") ? switchRow("recentJumpList", "Recent items in the taskbar menu") : ""}
        <div class="dam-btns"><button type="button" class="dam-btn" data-dam="shortcuts"><i class="fa-solid fa-keyboard" aria-hidden="true"></i> All shortcuts <kbd>Ctrl /</kbd></button></div>`));
    if (caps.has("update")) items.push(accItem("updates", "Updates", `
        ${switchRow("autoUpdate", "Download updates automatically")}
        <p class="desktop-app-update-line" id="desktopUpdateLine" aria-live="polite" hidden></p>
        <div class="desktop-app-actions"><button type="button" data-desktop-cmd="update">Check for updates</button></div>`));
    return `
      <div class="dam-head">
        <span class="dam-logo" aria-hidden="true"><i class="fa-brands fa-windows"></i></span>
        <div class="dam-head-text"><strong>Triplem VIP for Windows</strong><small id="damVersion">Version ${esc(info.version || "")}${info.arch ? ` · ${esc(info.arch)}` : ""}${info.packaged ? " · Microsoft Store" : ""}</small></div>
        <button type="button" class="dam-close" data-dam="close" aria-label="Close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
      </div>
      <div class="dam-accordion">${items.join("")}</div>
      ${caps.has("report") ? `<div class="dam-foot"><button type="button" class="dam-link" data-desktop-cmd="report"><i class="fa-solid fa-bug" aria-hidden="true"></i> Create error report</button></div>` : ""}`;
  }

  // Only one banner is open at a time; the height animates smoothly.
  function setAccordion(id) {
    const menu = document.getElementById("desktopAppMenu");
    if (!menu) return;
    local.openAcc = id || "";
    menu.querySelectorAll(".dam-acc").forEach(sec => {
      const open = sec.dataset.acc === local.openAcc;
      sec.classList.toggle("is-open", open);
      sec.querySelector(".dam-acc-head")?.setAttribute("aria-expanded", open ? "true" : "false");
      const body = sec.querySelector(".dam-acc-body");
      if (body) body.inert = !open;
    });
    if (local.openAcc) {
      const sec = menu.querySelector(`.dam-acc[data-acc="${local.openAcc}"]`);
      if (local.openAcc === "sync") renderOffline();
      if (local.openAcc === "backup") renderBackup();
      // Keep the opened banner in view once it has grown.
      setTimeout(() => { try { sec?.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); } catch (_) {} }, 280);
    }
  }

  function setChip(id, text, tone = "") {
    const chip = document.getElementById(id);
    if (!chip) return;
    if (chip.textContent !== text) chip.textContent = text;
    chip.dataset.tone = tone;
  }

  function ensureAppBar() {
    if (document.getElementById("desktopAppBarWrap")) return;
    const chips = document.querySelector("#app .header .chips");
    if (!chips) return;
    ensureStyles();
    const wrap = document.createElement("div");
    wrap.id = "desktopAppBarWrap";
    wrap.className = "menu-wrap desktop-appbar-wrap";
    wrap.innerHTML = `<button type="button" class="btn ghost menu-trigger desktop-appbar" id="desktopAppBar" aria-haspopup="dialog" aria-expanded="false" aria-controls="desktopAppMenu" title="Windows app settings (Ctrl+,)">
        <span class="dab-left"><i class="fa-brands fa-windows" aria-hidden="true"></i><span class="dab-title">Windows app</span><span class="dab-version">${esc(info.version ? "v" + info.version : "")}</span></span>
        <span class="dab-right"><span class="dab-chip" id="dabStatusChip"><span class="dab-dot" aria-hidden="true"></span><span id="dabStatusText">Online</span></span><span class="dab-chip is-lock" id="dabLockChip" hidden><i class="fa-solid fa-lock" aria-hidden="true"></i></span><span class="dab-chip is-backup" id="dabBackupChip" hidden><i class="fa-solid fa-box-archive" aria-hidden="true"></i></span><span class="dab-chip is-update" id="desktopUpdateChip" hidden>Update</span><i class="fa-solid fa-chevron-down dab-caret" aria-hidden="true"></i></span>
      </button>`;
    chips.appendChild(wrap);
    // The menu lives directly in <body>: glass headers in some themes would
    // otherwise become the reference box for its fixed position.
    const menu = document.createElement("div");
    menu.className = "menu-dropdown desktop-app-menu";
    menu.id = "desktopAppMenu";
    menu.setAttribute("role", "dialog");
    menu.setAttribute("aria-label", "Windows app");
    menu.innerHTML = appMenuHtml();
    document.body.appendChild(menu);
    setAccordion("");
    const bar = wrap.querySelector("#desktopAppBar");
    // The app's shared "click outside" handler closes open menus; keep the
    // bar's expanded state in step with that.
    new MutationObserver(() => { if (!menu.classList.contains("open")) bar.setAttribute("aria-expanded", "false"); }).observe(menu, { attributes: true, attributeFilter: ["class"] });
    bar.addEventListener("click", e => {
      e.stopPropagation();
      toggleAppMenu(!menu.classList.contains("open"));
    });
    menu.addEventListener("click", e => {
      const head = e.target.closest(".dam-acc-head");
      if (head) {
        const id = head.closest(".dam-acc")?.dataset.acc || "";
        setAccordion(local.openAcc === id ? "" : id);
        return;
      }
      const cmd = e.target.closest("[data-desktop-cmd]");
      if (cmd) {
        if (cmd.dataset.desktopCmd === "update") {
          if (local.update.state === "ready") send("update-install"); else send("update-check");
        } else if (cmd.dataset.desktopCmd === "report") {
          send("report");
        }
        return;
      }
      const act = e.target.closest("[data-dam]");
      if (!act) return;
      switch (act.dataset.dam) {
        case "close": toggleAppMenu(false); break;
        case "sync": try { if (typeof syncOfflineQueue === "function") syncOfflineQueue({ force: true, userInitiated: true }); } catch (_) {} setTimeout(renderStatus, 300); break;
        case "review": toggleAppMenu(false); try { if (typeof openOfflineSyncPanel === "function") openOfflineSyncPanel(); } catch (_) {} break;
        case "prepare": prepareOffline({ manual: true }); break;
        case "lock-now": toggleAppMenu(false); send("lock-now"); break;
        case "backup-now": runDesktopBackup({ auto: false }); break;
        case "restore": openRestore(); break;
        case "backup-folder": send("backup-folder"); break;
        case "backup-open": send("backup-open-folder"); break;
        case "shortcuts": toggleAppMenu(false); showShortcuts(); break;
      }
    });
    menu.addEventListener("change", e => {
      if (e.target.id === "damLockSwitch") {
        const want = !!e.target.checked;
        e.target.checked = !!local.settings.appLock; // changes only after Windows Hello confirms
        local.lockBusy = true;
        renderLock();
        send("settings-set", { key: "appLock", value: want });
        return;
      }
      if (e.target.id === "damLockMinutes") {
        send("settings-set", { key: "lockMinutes", value: Number(e.target.value) });
        return;
      }
      if (e.target.id === "damAppKeys") {
        try { localStorage.setItem(APPKEYS_KEY, e.target.checked ? "1" : "0"); } catch (_) {}
        renderChips();
        return;
      }
      if (/^damBackup(Freq|Weekday|Monthday|Time|Keep)$/.test(e.target.id)) {
        saveBackupSchedule();
        return;
      }
      const input = e.target.closest("[data-desktop-setting]");
      if (!input) return;
      const key = input.dataset.desktopSetting;
      send("settings-set", { key, value: !!input.checked });
      if (key === "notifications") onNotificationsSwitch(!!input.checked);
    });
    menu.addEventListener("keydown", e => { if (e.key === "Escape") { toggleAppMenu(false); bar.focus(); } });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && menu.classList.contains("open")) { toggleAppMenu(false); } });
    // Keep the bar exactly under the visible icons (bell ... account), also
    // when icons appear or hide, or the header wraps on a narrow window.
    let alignQueued = false;
    const queueAlign = () => { if (alignQueued) return; alignQueued = true; requestAnimationFrame(() => { alignQueued = false; alignAppBar(); }); };
    try { new ResizeObserver(queueAlign).observe(chips); } catch (_) {}
    try { new MutationObserver(queueAlign).observe(chips, { attributes: true, attributeFilter: ["class", "style", "hidden"], subtree: true, childList: true }); } catch (_) {}
    window.addEventListener("resize", () => { queueAlign(); if (menu.classList.contains("open")) positionAppMenu(); });
    // Icons can also move because of page-wide classes (theme, Windows app
    // mode); a cheap periodic check keeps the bar aligned (writes only on change).
    setInterval(() => { if (!document.hidden) alignAppBar(); }, 1500);
    alignAppBar();
    window.addEventListener("scroll", () => { if (menu.classList.contains("open")) positionAppMenu(); }, { passive: true });
    renderSettings();
    renderUpdate();
    renderStatus();
  }

  function alignAppBar() {
    const wrap = document.getElementById("desktopAppBarWrap");
    const bar = document.getElementById("desktopAppBar");
    const chips = wrap?.parentElement;
    if (!wrap || !bar || !chips) return;
    // The bar is positioned from the visible icons' edges (bell ... account).
    // It is taken out of the layout flow so its own width never widens the
    // header (which would move the icons it is measured from).
    const icons = [...chips.querySelectorAll(".top-icon-btn")].filter(el => !wrap.contains(el) && el.offsetParent !== null && el.getBoundingClientRect().width > 0);
    const wr = wrap.getBoundingClientRect();
    let left = 0;
    let width = wr.width;
    if (icons.length) {
      const l = Math.min(...icons.map(el => el.getBoundingClientRect().left));
      const r = Math.max(...icons.map(el => el.getBoundingClientRect().right));
      left = Math.round(l - wr.left);
      width = Math.round(r - l);
    }
    const ls = `${Math.max(0, left)}px`;
    const ws = `${Math.max(160, width)}px`;
    if (bar.style.left !== ls) bar.style.left = ls;
    if (bar.style.width !== ws) bar.style.width = ws;
  }

  function positionAppMenu() {
    const bar = document.getElementById("desktopAppBar");
    const menu = document.getElementById("desktopAppMenu");
    if (!bar || !menu) return;
    const r = bar.getBoundingClientRect();
    const vw = document.documentElement.clientWidth || window.innerWidth;
    // Same width as the bar (at least 340 px so the options stay readable).
    const width = Math.min(Math.max(r.width, 340), vw - 20);
    let left = r.right - width;
    if (left < 10) left = 10;
    menu.style.width = `${width}px`;
    menu.style.left = `${left}px`;
    menu.style.top = `${r.bottom + 6}px`;
    menu.style.maxHeight = `${Math.max(240, window.innerHeight - r.bottom - 18)}px`;
  }

  function toggleAppMenu(open) {
    const bar = document.getElementById("desktopAppBar");
    const menu = document.getElementById("desktopAppMenu");
    if (!bar || !menu) return;
    if (open) {
      document.querySelectorAll(".menu-dropdown.open").forEach(p => { if (p !== menu) p.classList.remove("open"); });
      document.querySelectorAll(".menu-trigger[aria-expanded='true']").forEach(t => { if (t !== bar) t.setAttribute("aria-expanded", "false"); });
      alignAppBar();
      renderStatus();
      renderOffline();
      renderBackup();
      menu.classList.add("open");
      positionAppMenu();
      send("settings-get");
    } else {
      menu.classList.remove("open");
    }
    bar.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function renderSettings() {
    document.querySelectorAll("[data-desktop-setting]").forEach(input => {
      input.checked = !!local.settings[input.dataset.desktopSetting];
    });
    const keysSwitch = document.getElementById("damAppKeys");
    if (keysSwitch) keysSwitch.checked = appKeysOn();
    const busyKeys = new Set(local.settings.hotkeysUnavailable || []);
    if (local.settings.hotkeyUnavailable) busyKeys.add("new-expense");
    const hint = document.getElementById("desktopHotkeyHint");
    if (hint) {
      const busy = local.settings.quickAddHotkey && busyKeys.size > 0;
      hint.textContent = busy ? "A marked shortcut is used by another program" : "";
      hint.hidden = !busy;
      hint.classList.toggle("is-warn", busy);
    }
    document.querySelectorAll("#damKeys [data-hotkey]").forEach(li => {
      const busy = local.settings.quickAddHotkey && busyKeys.has(li.dataset.hotkey);
      li.classList.toggle("is-busy", busy);
      li.classList.toggle("is-off", !local.settings.quickAddHotkey);
      li.title = busy ? "Used by another program on this PC" : "";
    });
    renderLock();
    renderBackup();
    renderChips();
  }

  function renderLock() {
    const sw = document.getElementById("damLockSwitch");
    if (!sw) return;
    const s = local.settings;
    sw.checked = !!s.appLock;
    const unavailable = s.helloAvailable > 0 && !s.appLock;
    sw.disabled = !!local.lockBusy || unavailable;
    const hint = document.getElementById("damLockHint");
    if (hint) {
      let text = "";
      if (local.lockBusy) text = "Waiting for Windows Hello…";
      else if (unavailable) text = HELLO_TEXT[s.helloAvailable] || "Windows Hello is not available on this PC.";
      else if (local.lockError) text = local.lockError;
      hint.textContent = text;
      hint.hidden = !text;
      hint.classList.toggle("is-warn", !!text && !local.lockBusy);
    }
    const minutes = document.getElementById("damLockMinutes");
    if (minutes) { minutes.value = String(s.lockMinutes ?? 5); minutes.disabled = !s.appLock; }
    const row = document.getElementById("damLockMinutesRow");
    if (row) row.classList.toggle("is-off", !s.appLock);
    const hide = document.querySelector('[data-desktop-setting="lockHideDetails"]');
    if (hide) hide.disabled = !s.appLock;
    const now = document.getElementById("damLockNow");
    if (now) now.disabled = !s.appLock;
    const chip = document.getElementById("dabLockChip");
    if (chip) { chip.hidden = !s.appLock; chip.title = "Windows Hello lock is on"; }
    renderChips();
  }

  function renderUpdate() {
    const line = document.getElementById("desktopUpdateLine");
    const btn = document.querySelector('[data-desktop-cmd="update"]');
    const u = local.update;
    const chip = document.getElementById("desktopUpdateChip");
    if (chip) { chip.hidden = u.state !== "ready"; chip.title = u.state === "ready" ? `Version ${u.version} is ready to install` : ""; }
    renderChips();
    if (!line && !btn) return;
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
    if (btn) { btn.textContent = label; btn.disabled = busy; btn.classList.toggle("primary", u.state === "ready"); }
  }

  // Short state shown on each closed banner.
  function renderChips() {
    const n = netState();
    const signedIn = !!signedInUserId();
    if (!n.online) setChip("damChipSync", signedIn && n.pending ? `Offline · ${n.pending}` : "Offline", "offline");
    else if (signedIn && n.pending) setChip("damChipSync", n.syncing ? "Syncing" : `${n.pending} to sync`, n.attention ? "warn" : "pending");
    else setChip("damChipSync", "Online", "ok");
    const b = local.backupSettings || {};
    if (b.lastError) setChip("damChipBackup", "Needs attention", "warn");
    else if (local.backupBusy) setChip("damChipBackup", "Backing up…", "pending");
    else setChip("damChipBackup", backupScheduleLabel(b), b.freq && b.freq !== "off" ? "ok" : "");
    const s = local.settings;
    setChip("damChipSecurity", s.appLock ? "Locked by Hello" : "Off", s.appLock ? "ok" : "");
    setChip("damChipNotify", s.notifications ? "On" : "Off", s.notifications ? "ok" : "");
    setChip("damChipKeys", appKeysOn() ? "On" : "Off", appKeysOn() ? "ok" : "");
    const u = local.update;
    setChip("damChipUpdates", u.state === "ready" ? "Ready" : u.state === "downloading" ? "Downloading" : u.state === "error" ? "Error" : `v${info.version || ""}`, u.state === "ready" ? "pending" : u.state === "error" ? "warn" : "");
    const backupChip = document.getElementById("dabBackupChip");
    if (backupChip) { backupChip.hidden = !local.backupBusy; backupChip.title = "Backing up…"; }
  }

  // ---- Connection, sync and offline access (3.7) --------------------------------------------
  function netState() {
    const st = appState();
    const sync = st?.offlineSync || {};
    const offlineSession = !!sync.offlineSession;
    return {
      online: navigator.onLine && !offlineSession,
      browserOnline: navigator.onLine,
      offlineSession,
      pending: Number(sync.pendingCount || 0),
      attention: Number(sync.attentionCount || 0),
      syncing: !!sync.syncing,
      authBlocked: !!sync.authBlocked
    };
  }

  function plural(n, one, many) { return `${n} ${n === 1 ? one : many}`; }

  function renderStatus() {
    const n = netState();
    const signedIn = !!signedInUserId();
    let tone = "ok";
    let short = "Online";
    let title = "Online";
    let text = "All changes are saved.";
    if (!n.online) {
      tone = "offline";
      short = "Offline";
      title = "Offline";
      text = n.offlineSession || signedIn ? "Working with data saved on this PC." : "No internet connection.";
    }
    if (signedIn && n.pending > 0) {
      if (n.syncing) { tone = "sync"; short = "Syncing"; title = "Syncing"; text = `Saving ${plural(n.pending, "change", "changes")}…`; }
      else if (n.attention > 0) { tone = "warn"; short = `${n.pending} to review`; title = n.online ? "Needs attention" : "Offline"; text = `${plural(n.attention, "change needs", "changes need")} review.`; }
      else if (n.authBlocked) { tone = "warn"; short = `${n.pending} waiting`; title = "Sign in to sync"; text = `${plural(n.pending, "change", "changes")} waiting on this PC.`; }
      else { if (tone === "ok") tone = "pending"; short = n.online ? `${n.pending} to sync` : `Offline · ${n.pending}`; text = `${plural(n.pending, "change", "changes")} waiting on this PC.`; }
    }
    const chip = document.getElementById("dabStatusChip");
    if (chip) { chip.dataset.tone = tone; chip.title = text; }
    const chipText = document.getElementById("dabStatusText");
    if (chipText) chipText.textContent = short;
    const box = document.getElementById("damStatus");
    if (box) box.dataset.tone = tone;
    const t = document.getElementById("damStatusTitle");
    if (t) t.textContent = title;
    const d = document.getElementById("damStatusText");
    if (d) d.textContent = text;
    const syncBtn = document.getElementById("damSyncBtn");
    if (syncBtn) { syncBtn.hidden = !(signedIn && n.pending > 0); syncBtn.disabled = !n.online || n.syncing; }
    const review = document.getElementById("damReviewBtn");
    if (review) review.hidden = !(signedIn && n.pending > 0);
    renderChips();
    // Tell the app (tray tooltip) only when something changed.
    const key = `${n.online}|${signedIn ? n.pending : 0}`;
    if (key !== local.lastStatusKey) {
      local.lastStatusKey = key;
      send("status", { online: n.online, pending: signedIn ? n.pending : 0 });
    }
  }

  const PREPARED_PREFIX = "triplem-desktop-offline-prepared-v1:";
  const PREPARE_EVERY_MS = 2 * 60 * 60 * 1000;
  function rememberedSession() {
    const st = appState();
    return !!(st?.sessionRememberMe && signedInUserId());
  }
  function preparedAt(uid) { try { return Number(localStorage.getItem(PREPARED_PREFIX + uid) || 0); } catch (_) { return 0; } }
  function timeAgo(ms) {
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return "just now";
    const m = Math.round(s / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} h ago`;
    return new Date(ms).toLocaleDateString();
  }

  function renderOffline() {
    const text = document.getElementById("damOfflineText");
    const btn = document.getElementById("damPrepareBtn");
    if (!text || !btn) return;
    const uid = signedInUserId();
    let t = "";
    let canPrepare = false;
    if (!uid) t = "Sign in first";
    else if (!rememberedSession()) t = "Needs Remember me at sign-in";
    else if (local.preparing) t = "Saving your records…";
    else {
      const at = preparedAt(uid);
      t = at ? `Saved ${timeAgo(at)}` : "Saved as you open records";
      canPrepare = netState().online;
    }
    text.textContent = t;
    btn.disabled = !canPrepare || !!local.preparing;
    btn.textContent = local.preparing ? "Preparing…" : "Prepare now";
  }

  // ---- Backup & Restore (3.8) ----------------------------------------------------------------
  // The backup is built by the page exactly like Account > Backup & Restore;
  // the app saves it into the chosen folder (no dialog) and runs the schedule.
  function backupScheduleLabel(b) {
    const t = safe(b.time || "21:00");
    switch (b.freq) {
      case "daily": return `Daily ${t}`;
      case "weekly": return `${WEEKDAYS[Number(b.weekday) || 0].slice(0, 3)} ${t}`;
      case "monthly": return `Monthly ${t}`;
      default: return "Manual";
    }
  }
  function backupOwnerState() {
    if (!signedInUserId()) return "signed-out";
    try { if (window.TriplemBackup?.isOwner && !window.TriplemBackup.isOwner()) return "member"; } catch (_) {}
    return "owner";
  }
  function whenText(ms) {
    if (!ms) return "";
    const d = new Date(ms);
    const today = new Date();
    const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);
    const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    if (d.toDateString() === today.toDateString()) return `today ${time}`;
    if (d.toDateString() === tomorrow.toDateString()) return `tomorrow ${time}`;
    return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })} ${time}`;
  }

  function renderBackup() {
    const box = document.getElementById("damAccBackup");
    if (!box) return;
    const b = local.backupSettings || { freq: "off", time: "21:00", weekday: 5, monthday: 1, keep: 10, folder: "" };
    const owner = backupOwnerState();
    const note = document.getElementById("damBackupNote");
    if (note) {
      note.hidden = owner === "owner";
      note.textContent = owner === "signed-out" ? "Sign in to back up your account." : owner === "member" ? "Only the account owner can back up and restore." : "";
    }
    const busy = !!local.backupBusy;
    const disable = owner !== "owner";
    const set = (id, v) => { const el = document.getElementById(id); if (el && document.activeElement !== el && el.value !== String(v)) el.value = String(v); };
    set("damBackupFreq", b.freq || "off");
    set("damBackupTime", b.time || "21:00");
    set("damBackupWeekday", b.weekday ?? 5);
    set("damBackupMonthday", b.monthday ?? 1);
    set("damBackupKeep", b.keep ?? 10);
    ["damBackupFreq", "damBackupTime", "damBackupWeekday", "damBackupMonthday", "damBackupKeep", "damRestoreBtn"].forEach(id => { const el = document.getElementById(id); if (el) el.disabled = disable; });
    const now = document.getElementById("damBackupNow");
    if (now) { now.disabled = disable || busy; now.innerHTML = busy ? `<span class="dam-spin" aria-hidden="true"></span> Backing up…` : `<i class="fa-solid fa-download" aria-hidden="true"></i> Back up now`; }
    const off = (b.freq || "off") === "off";
    const dayRow = document.getElementById("damBackupDayRow");
    if (dayRow) {
      dayRow.hidden = off || b.freq === "daily";
      const wd = document.getElementById("damBackupWeekday"); if (wd) wd.hidden = b.freq !== "weekly";
      const md = document.getElementById("damBackupMonthday"); if (md) md.hidden = b.freq !== "monthly";
    }
    const timeRow = document.getElementById("damBackupTimeRow"); if (timeRow) timeRow.hidden = off;
    const folder = document.getElementById("damBackupFolder");
    if (folder) { folder.textContent = safe(b.folder) || "Documents\\Triplem VIP Backups"; folder.title = safe(b.folder); }
    const line = document.getElementById("damBackupLine");
    if (line) {
      let t = "";
      let cls = "";
      if (busy) t = local.backupStep || "Creating the backup…";
      else if (b.lastError) { t = safe(b.lastError); cls = "is-warn"; }
      else {
        const parts = [];
        if (b.lastDone) parts.push(`Last ${whenText(Number(b.lastDone))}`);
        if (!off && b.next) parts.push(`Next ${whenText(Number(b.next))}`);
        t = parts.join(" · ") || (off ? "No backup yet" : "");
      }
      line.textContent = t;
      line.className = `dam-line ${cls}`.trim();
    }
    renderChips();
  }

  function saveBackupSchedule() {
    const val = id => document.getElementById(id)?.value;
    const sched = {
      freq: val("damBackupFreq") || "off",
      time: val("damBackupTime") || "21:00",
      weekday: Number(val("damBackupWeekday") ?? 5),
      monthday: Number(val("damBackupMonthday") ?? 1),
      keep: Number(val("damBackupKeep") ?? 10)
    };
    local.backupSettings = { ...(local.backupSettings || {}), ...sched };
    renderBackup();
    send("backup-schedule", { backup: sched });
  }

  function openRestore() {
    toggleAppMenu(false);
    if (typeof window.TriplemBackup?.open === "function") window.TriplemBackup.open();
    else notAvailable("Restore");
  }

  // Builds the backup in the page and hands the file to the app.
  async function runDesktopBackup({ auto = false } = {}) {
    const fail = (reason, quiet = false) => {
      local.backupBusy = false;
      local.backupStep = "";
      renderBackup();
      send("backup-failed", { reason, auto });
      if (!auto && !quiet) showDesktopNotice("Backup not created", "error", [], reason);
    };
    if (local.backupBusy) return;
    const api = window.TriplemBackup;
    if (!api?.createFile) return fail("Backup is not available in this version of the page. Reload and try again.");
    const owner = backupOwnerState();
    if (owner === "signed-out") return fail("Sign in to Triplem VIP to back up your account.");
    if (owner === "member") return fail("Only the account owner can back up this workspace.");
    if (!netState().online) return fail("No internet connection. The backup will run when you are online.");
    local.backupBusy = true;
    local.backupStep = "Creating the backup…";
    renderBackup();
    try {
      const out = await api.createFile({
        onProgress: p => {
          const pct = p && p.total ? Math.min(99, Math.round((p.done / p.total) * 100)) : 0;
          local.backupStep = pct ? `Creating the backup… ${pct}%` : "Creating the backup…";
          const line = document.getElementById("damBackupLine");
          if (line) line.textContent = local.backupStep;
        }
      });
      local.backupStep = "Saving…";
      renderBackup();
      local.backupFile = out.filename;
      local.backupRecords = out.manifest?.totals?.records || 0;
      // Tell the app which download is the backup, then download it.
      const ready = new Promise(resolve => { local.backupExpectResolve = resolve; setTimeout(resolve, 4000); });
      send("backup-expect", { name: out.filename, auto });
      await ready;
      local.backupExpectResolve = null;
      api.save(out.bytes, out.filename);
      // The app reports "backup-saved" or "backup-status" when the file is written.
      clearTimeout(local.backupWatch);
      local.backupWatch = setTimeout(() => { if (local.backupBusy) { local.backupBusy = false; local.backupStep = ""; renderBackup(); } }, 120000);
    } catch (err) {
      fail(safe(err?.message) || "The backup could not be created.");
    }
  }

  // Loads every section's records once so they are in this PC's encrypted
  // offline copy (reads only; it uses the same loaders as the app itself).
  async function prepareOffline({ manual = false } = {}) {
    const uid = signedInUserId();
    if (!uid || local.preparing || !rememberedSession() || !netState().online) { renderOffline(); return false; }
    if (!manual && Date.now() - preparedAt(uid) < PREPARE_EVERY_MS) return false;
    local.preparing = true;
    renderOffline();
    let ok = true;
    try {
      if (typeof ensureAllLedgerDataLoaded === "function") await ensureAllLedgerDataLoaded({});
      if (allowed("accounting") && can("accounting", "view") && typeof window.TriplemAccounting?.load === "function") {
        try { await window.TriplemAccounting.load(); } catch (_) {}
      }
      if (typeof warmDashboardData === "function") { try { await warmDashboardData(); } catch (_) {} }
    } catch (err) {
      ok = false;
      console.warn("Preparing offline access failed:", err);
    } finally {
      local.preparing = false;
    }
    if (ok && signedInUserId() === uid) {
      try { localStorage.setItem(PREPARED_PREFIX + uid, String(Date.now())); } catch (_) {}
      if (manual) showDesktopNotice("Ready for offline use", "success", [], "Your latest records are saved on this PC.");
    } else if (manual) {
      showDesktopNotice("Could not prepare offline access", "warn", [], "Check your internet connection and try again.");
    }
    renderOffline();
    return ok;
  }

  // ---- Two-key shortcuts inside the app (3.8) ----------------------------------------------
  // Ctrl + key works anywhere in the app, Alt + key in the open section
  // (Assets/app/ui/03-section-shortcuts.js), Alt + 1…9 opens a section and
  // Ctrl + S saves the open form. They only work while Triplem VIP is the
  // active window, so they never take keys away from other programs (the
  // optional "from any app" shortcuts are the three-key ones above).
  function sectionNewEntry() {
    const reg = window.TriplemSectionShortcuts;
    const section = reg?.activeSection?.() || "";
    const group = reg?.group?.(section);
    const first = group?.shortcuts?.find(s => s.key === "n") || group?.shortcuts?.find(s => ["g", "t"].includes(s.key) && /Loan/.test(s.label));
    if (first) { first.run(); return; }
    if (section === "home" || !section) { openTarget("new-expense"); return; }
    showDesktopNotice("Nothing to add in this section", "info");
  }
  function openSectionByNumber(n) {
    try {
      const list = (typeof getWorkspaceOrderedTabButtons === "function" ? getWorkspaceOrderedTabButtons() : []).filter(b => b?.dataset?.tab);
      const btn = list[n - 1];
      if (btn) goTab(btn.dataset.tab);
    } catch (_) {}
  }
  function clickIfUsable(id) {
    const el = document.getElementById(id);
    if (el && !el.disabled && el.offsetParent !== null) { el.click(); return true; }
    return false;
  }

  const APP_KEYS = [
    { code: "KeyK", keys: ["Ctrl", "K"], label: "Search", run: () => { if (!window.TriplemDesktopSearch?.focus?.()) openSearchPalette(); } },
    { code: "KeyN", keys: ["Ctrl", "N"], label: "New entry in this section", run: sectionNewEntry },
    { code: "KeyE", keys: ["Ctrl", "E"], label: "Add expense", run: () => openTarget("new-expense") },
    { code: "KeyI", keys: ["Ctrl", "I"], label: "New sales invoice", run: () => openTarget("new-invoice") },
    { code: "KeyH", keys: ["Ctrl", "H"], label: "Home", run: () => goTab("home") },
    { code: "KeyD", keys: ["Ctrl", "D"], label: "Dashboard", run: () => (allowed("dashboard") ? goTab("dashboard") : notAvailable("Dashboard")) },
    { code: "KeyJ", keys: ["Ctrl", "J"], label: "Notifications", run: () => openTarget("notifications") },
    { code: "KeyM", keys: ["Ctrl", "M"], label: "Messages", run: () => openTarget("messages") },
    { code: "KeyR", keys: ["Ctrl", "R"], label: "Refresh data", run: () => { if (!clickIfUsable("refreshBtn")) location.reload(); } },
    { code: "KeyB", keys: ["Ctrl", "B"], label: "Back up now", cap: "backup", run: () => runDesktopBackup({ auto: false }) },
    { code: "KeyL", keys: ["Ctrl", "L"], label: "Lock now", cap: "applock", run: () => (local.settings.appLock ? send("lock-now") : showDesktopNotice("Turn on the Windows Hello lock first", "info", [{ label: "Open settings", run: () => { toggleAppMenu(true); setAccordion("security"); } }])) },
    { code: "KeyP", keys: ["Ctrl", "P"], label: "Print", cap: "print", listOnly: true },
    { code: "Comma", keys: ["Ctrl", ","], label: "Windows app menu", run: () => { const m = document.getElementById("desktopAppMenu"); toggleAppMenu(!m?.classList.contains("open")); } },
    { code: "Slash", keys: ["Ctrl", "/"], label: "All shortcuts", run: () => showShortcuts() }
  ].filter(k => !k.cap || caps.has(k.cap));

  function topModal() {
    const list = [...document.querySelectorAll(".modal:not(.hide), #accountingDynamicModal")].filter(el => {
      const cs = getComputedStyle(el);
      return cs.display !== "none" && cs.visibility !== "hidden";
    });
    return list[list.length - 1] || null;
  }

  // Ctrl + S / Ctrl + Enter: the form's own save button (only when there is
  // exactly one obvious one), so nothing unexpected is ever submitted.
  function saveTopModal(modal) {
    const usable = el => el && !el.disabled && el.offsetParent !== null && el.getAttribute("aria-disabled") !== "true";
    let btn = [...modal.querySelectorAll("form button[type=submit]")].find(usable);
    if (!btn) {
      const primary = [...modal.querySelectorAll(".accounting-modal-footer .btn.primary, .modal-footer .btn.primary, .modal-foot .btn.primary, .tvb-primary")].filter(usable);
      if (primary.length === 1) btn = primary[0];
    }
    if (btn) btn.click();
  }

  function onAppKey(e) {
    if (e.defaultPrevented || e.isComposing || !appKeysOn() || local.locked) return;
    if (document.getElementById("triplemDesktopKeys") && e.key !== "Escape") return;
    const ctrl = e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;
    const alt = e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey;
    if (!ctrl && !alt) return;
    const signedIn = !!signedInUserId();
    const modal = topModal();
    if (ctrl) {
      if (e.code === "KeyS" || (e.key === "Enter" && modal)) {
        e.preventDefault();
        if (modal && !e.repeat) saveTopModal(modal);
        return;
      }
      if (e.repeat) return;
      const k = APP_KEYS.find(x => x.code === e.code);
      if (!k || k.listOnly) return;
      if (e.code === "Slash") { e.preventDefault(); k.run(); return; }
      if (modal && e.code === "KeyR") { e.preventDefault(); return; } // never reload over an open form
      if (!signedIn || modal || document.querySelector(".dpp-backdrop, .dsp-backdrop, .dpv-root")) return;
      if (e.target instanceof Element && e.target.closest("[contenteditable='true'],[contenteditable='plaintext-only']")) return;
      e.preventDefault();
      e.stopPropagation();
      try { k.run(); } catch (err) { console.warn("Shortcut failed:", err); }
      return;
    }
    // Alt + 1…9: open the sections in the order of Triplem VIP Home.
    if (alt && /^Digit[1-9]$/.test(e.code) && signedIn && !modal && !e.repeat) {
      e.preventDefault();
      openSectionByNumber(Number(e.code.slice(5)));
    }
  }

  function keysHtml(keys) {
    return keys.map((k, i) => `${i ? "<span>+</span>" : ""}<kbd>${esc(k)}</kbd>`).join("");
  }

  function closeShortcuts() {
    const host = document.getElementById("triplemDesktopKeys");
    if (!host) return;
    host.remove();
    try { local.keysReturnFocus?.focus?.({ preventScroll: true }); } catch (_) {}
  }

  function showShortcuts() {
    ensureStyles();
    closeShortcuts();
    local.keysReturnFocus = document.activeElement;
    const reg = window.TriplemSectionShortcuts;
    const section = reg?.activeSection?.() || "";
    const group = reg?.group?.(section);
    const label = section && typeof getWorkspaceSectionLabel === "function" ? getWorkspaceSectionLabel(section) : "";
    const rows = list => list.map(r => `<li><span class="dkh-keys">${keysHtml(r.keys)}</span><span>${esc(r.label)}</span></li>`).join("");
    const anywhere = APP_KEYS.map(k => ({ keys: k.keys, label: k.label })).concat([{ keys: ["Alt", "1–9"], label: "Open a section (Home order)" }]);
    const forms = [{ keys: ["Ctrl", "S"], label: "Save" }, { keys: ["Ctrl", "Enter"], label: "Save" }, { keys: ["Esc"], label: "Close" }];
    const global = caps.has("hotkey") && local.settings.quickAddHotkey ? hotkeyList().map(h => ({ keys: safe(h.keys).split("+"), label: HOTKEY_LABELS[h.target] })) : [];
    const host = document.createElement("div");
    host.id = "triplemDesktopKeys";
    host.className = "dkh-backdrop";
    host.innerHTML = `<div class="dkh-card" role="dialog" aria-modal="true" aria-labelledby="dkhTitle" tabindex="-1">
        <div class="dkh-head"><h3 id="dkhTitle"><i class="fa-solid fa-keyboard" aria-hidden="true"></i> Keyboard shortcuts</h3><button type="button" class="dkh-x" aria-label="Close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>
        <div class="dkh-body">
          <section><h4>Anywhere</h4><ul>${rows(anywhere)}</ul></section>
          <section><h4>${esc(group && label ? label : "This section")}</h4>${group ? `<ul>${rows(group.shortcuts)}</ul>` : `<p class="dkh-empty">Open a section to see its shortcuts.</p>`}
            <h4>Forms</h4><ul>${rows(forms)}</ul>
            ${global.length ? `<h4>From any app</h4><ul>${rows(global)}</ul>` : ""}</section>
        </div>
      </div>`;
    document.body.appendChild(host);
    host.addEventListener("click", e => { if (e.target === host || e.target.closest(".dkh-x")) closeShortcuts(); });
    host.addEventListener("keydown", e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeShortcuts(); } });
    setTimeout(() => host.querySelector(".dkh-card")?.focus({ preventScroll: true }), 20);
  }

  window.addEventListener("keydown", onAppKey, true);

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

  // Printing (3.7): the app's own print panel chooses printer, copies, pages,
  // paper, orientation, margins, colour, two-sided, scale, background graphics
  // and headers, then the app prints directly or saves a PDF. "More settings"
  // still opens the Windows print dialog. Without the 3.7 app, the Windows
  // print dialog opens as before.
  const PRINT_PREFS_KEY = "triplem-desktop-print-v1";
  const PAPER_MM = { a3: [297, 420], a4: [210, 297], a5: [148, 210], letter: [215.9, 279.4], legal: [215.9, 355.6] };
  const MARGIN_MM = { none: 0, narrow: 6.35, normal: 10.16, wide: 19.05 };

  function readPrintPrefs() {
    const d = { printer: "", copies: 1, orientation: "portrait", paper: "a4", margins: "default", marginMm: [10, 10, 10, 10], color: "default", duplex: "default", scale: 100, backgrounds: true, headers: false };
    try { return { ...d, ...(JSON.parse(localStorage.getItem(PRINT_PREFS_KEY) || "{}") || {}) }; } catch (_) { return d; }
  }
  function savePrintPrefs(o) {
    const keep = (({ printer, copies, orientation, paper, margins, marginMm, color, duplex, scale, backgrounds, headers }) => ({ printer, copies, orientation, paper, margins, marginMm, color, duplex, scale, backgrounds, headers }))(o);
    try { localStorage.setItem(PRINT_PREFS_KEY, JSON.stringify(keep)); } catch (_) {}
  }

  function nativePrint(context = {}) {
    if (caps.has("printplus")) { openPrintPanel(context); return; }
    if (!caps.has("print")) { cleanupThermal(); local.originalPrint?.(); return; }
    send("print");
  }

  // A temporary @page rule gives the chosen paper and margins on every PC
  // (ARM64 cannot pass these settings to WebView2 directly).
  function applyPageRule(o) {
    removePageRule();
    const paper = PAPER_MM[o.paper];
    const custom = o.margins === "custom" && Array.isArray(o.marginMm) && o.marginMm.length === 4 && o.marginMm.every(v => Number.isFinite(v) && v >= 0 && v <= 60);
    const margin = custom ? o.marginMm.map(v => `${Math.round(v * 10) / 10}mm`).join(" ") : (MARGIN_MM[o.margins] === undefined ? undefined : `${MARGIN_MM[o.margins]}mm`);
    if (!paper && margin === undefined) return;
    const parts = [];
    if (paper) {
      const [w, h] = o.orientation === "landscape" ? [paper[1], paper[0]] : paper;
      parts.push(`size:${w}mm ${h}mm`);
    } else if (o.orientation === "landscape") {
      parts.push("size:landscape");
    }
    if (margin !== undefined) parts.push(`margin:${margin}`);
    const style = document.createElement("style");
    style.id = "triplemDesktopPageRule";
    style.textContent = `@page{${parts.join(";")}}`;
    document.head.appendChild(style);
  }
  function removePageRule() { document.getElementById("triplemDesktopPageRule")?.remove(); }

  function finishPrint() {
    local.printing = false;
    local.printMode = "";
    removePageRule();
    cleanupThermal();
  }

  function printPanelHtml(o, ctx) {
    const printers = local.printInfo?.printers || [];
    const def = local.printInfo?.default || "";
    const opt = (v, t, cur) => `<option value="${esc(v)}"${String(cur) === String(v) ? " selected" : ""}>${esc(t)}</option>`;
    const printerOptions = [opt("", def ? `Default printer (${def})` : "Default printer", o.printer)].concat(printers.map(p => opt(p, p, o.printer))).join("");
    const floats = local.printInfo ? local.printInfo.floats !== false : info.arch !== "arm64";
    return `
      <div class="dpp-card" role="dialog" aria-modal="true" aria-labelledby="dppTitle">
        <div class="dpp-head"><div><h3 id="dppTitle"><i class="fa-solid fa-print" aria-hidden="true"></i> Print</h3><p>${esc(ctx.title || "Current page")}</p></div><button type="button" class="dpp-x" data-dpp="cancel" aria-label="Close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>
        <form class="dpp-body" id="dppForm" novalidate>
          <label class="dpp-field dpp-wide"><span>Printer</span><select name="printer">${printerOptions}</select></label>
          <label class="dpp-field"><span>Copies</span><input name="copies" type="number" min="1" max="99" step="1" value="${esc(o.copies || 1)}"></label>
          <div class="dpp-field"><span>Pages</span><div class="dpp-pages"><select name="pagesMode"><option value="all">All</option><option value="custom">Custom</option></select><input name="pages" placeholder="e.g. 1-3, 5" autocomplete="off" disabled></div></div>
          <div class="dpp-field"><span>Layout</span><div class="dpp-seg" role="radiogroup" aria-label="Layout">
            <label><input type="radio" name="orientation" value="portrait"${o.orientation !== "landscape" ? " checked" : ""}><span>Portrait</span></label>
            <label><input type="radio" name="orientation" value="landscape"${o.orientation === "landscape" ? " checked" : ""}><span>Landscape</span></label></div></div>
          <label class="dpp-field"><span>Paper size</span><select name="paper">${[["a4", "A4"], ["letter", "Letter"], ["legal", "Legal"], ["a5", "A5"], ["a3", "A3"], ["default", "Printer default"]].map(([v, t]) => opt(v, t, o.paper)).join("")}</select></label>
          <label class="dpp-field"><span>Margins</span><select name="margins">${[["default", "Default"], ["none", "None"], ["narrow", "Narrow"], ["normal", "Normal"], ["wide", "Wide"]].map(([v, t]) => opt(v, t, o.margins)).join("")}</select></label>
          <label class="dpp-field"><span>Colour</span><select name="color">${[["default", "Printer default"], ["color", "Colour"], ["bw", "Black and white"]].map(([v, t]) => opt(v, t, o.color)).join("")}</select></label>
          <label class="dpp-field"><span>Two-sided</span><select name="duplex">${[["default", "Printer default"], ["one", "Off (one-sided)"], ["long", "Flip on long edge"], ["short", "Flip on short edge"]].map(([v, t]) => opt(v, t, o.duplex)).join("")}</select></label>
          ${floats ? `<label class="dpp-field"><span>Scale (%)</span><input name="scale" type="number" min="10" max="200" step="5" value="${esc(o.scale || 100)}"></label>` : ""}
          <div class="dpp-checks dpp-wide">
            <label><input type="checkbox" name="backgrounds"${o.backgrounds ? " checked" : ""}> Background colours and images</label>
            <label><input type="checkbox" name="headers"${o.headers ? " checked" : ""}> Headers and footers</label>
          </div>
          <p class="dpp-error dpp-wide" id="dppError" role="alert" hidden></p>
        </form>
        <div class="dpp-foot">
          <button type="button" class="dpp-link" data-dpp="system">More settings…</button>
          <span class="dpp-spacer"></span>
          <button type="button" class="dpp-btn" data-dpp="cancel">Cancel</button>
          ${caps.has("printpdf") ? `<button type="button" class="dpp-btn" data-dpp="pdf"><i class="fa-solid fa-file-pdf" aria-hidden="true"></i> Save as PDF</button>` : ""}
          <button type="button" class="dpp-btn primary" data-dpp="print"><i class="fa-solid fa-print" aria-hidden="true"></i> Print</button>
        </div>
      </div>`;
  }

  function readPrintForm(form) {
    const f = new FormData(form);
    const pagesMode = f.get("pagesMode");
    const scale = Number(f.get("scale") || 100);
    return {
      printer: String(f.get("printer") || ""),
      copies: Math.max(1, Math.min(99, Math.round(Number(f.get("copies")) || 1))),
      pages: pagesMode === "custom" ? String(f.get("pages") || "").trim() : "",
      orientation: f.get("orientation") === "landscape" ? "landscape" : "portrait",
      paper: String(f.get("paper") || "default"),
      margins: String(f.get("margins") || "default"),
      color: String(f.get("color") || "default"),
      duplex: String(f.get("duplex") || "default"),
      scale: Number.isFinite(scale) ? Math.round(scale) : 100,
      backgrounds: f.get("backgrounds") === "on",
      headers: f.get("headers") === "on"
    };
  }

  function validPages(p) {
    if (!p) return true;
    if (!/^\s*\d{1,4}(\s*-\s*\d{1,4})?(\s*,\s*\d{1,4}(\s*-\s*\d{1,4})?)*\s*$/.test(p)) return false;
    return p.replace(/\s/g, "").split(",").every(part => { const [a, b = a] = part.split("-").map(Number); return a >= 1 && b >= a; });
  }

  function closePrintPanel({ keepPrinting = false } = {}) {
    const el = document.getElementById("triplemDesktopPrintPanel");
    if (el) el.remove();
    document.removeEventListener("keydown", printPanelKeys, true);
    if (!keepPrinting) finishPrint();
  }
  function printPanelKeys(e) {
    if (e.key === "Escape") { e.preventDefault(); closePrintPanel(); }
    if (e.key === "Enter" && e.target?.tagName !== "SELECT" && e.target?.tagName !== "BUTTON") {
      e.preventDefault();
      document.querySelector('#triplemDesktopPrintPanel [data-dpp="print"]')?.click();
    }
  }

  // 3.9: with the in-app PDF viewer the print panel is a full print preview
  // (the page is printed to a temporary PDF with the chosen settings and
  // shown page by page). The 3.7 panel stays for older apps and as a fallback.
  function previewAvailable() {
    return caps.has("pdfview") && caps.has("printpdf") && typeof window.TriplemPdfViewer?.openPagePreview === "function" && !local.previewFailed;
  }
  function openPrintPanel(context = {}) {
    ensureStyles();
    if (document.getElementById("triplemDesktopPrintPanel")) return;
    if (!context.classic && previewAvailable()) {
      try { if (window.TriplemPdfViewer.openPagePreview(context)) return; } catch (err) { console.warn("Print preview unavailable:", err); }
    }
    const prefs = readPrintPrefs();
    const host = document.createElement("div");
    host.id = "triplemDesktopPrintPanel";
    host.className = "dpp-backdrop";
    const render = () => { host.innerHTML = printPanelHtml(readPrintPrefsFrom(host) || prefs, context); bindForm(); };
    const readPrintPrefsFrom = h => { const form = h.querySelector("#dppForm"); return form ? { ...prefs, ...readPrintForm(form) } : null; };
    const showError = text => { const el = host.querySelector("#dppError"); if (el) { el.textContent = text; el.hidden = !text; } };
    function bindForm() {
      const form = host.querySelector("#dppForm");
      const mode = form.querySelector('[name="pagesMode"]');
      const pages = form.querySelector('[name="pages"]');
      mode.addEventListener("change", () => { pages.disabled = mode.value !== "custom"; if (!pages.disabled) pages.focus(); });
      form.addEventListener("submit", e => e.preventDefault());
      setTimeout(() => host.querySelector('[data-dpp="print"]')?.focus(), 30);
    }
    host.addEventListener("click", e => {
      if (e.target === host) { closePrintPanel(); return; }
      const btn = e.target.closest("[data-dpp]");
      if (!btn) return;
      const action = btn.dataset.dpp;
      if (action === "cancel") { closePrintPanel(); return; }
      if (action === "system") {
        closePrintPanel({ keepPrinting: true });
        local.printing = true;
        local.printMode = "system";
        send("print-system");
        return;
      }
      const o = readPrintForm(host.querySelector("#dppForm"));
      if (!validPages(o.pages)) { showError("Pages must look like 1-3, 5."); return; }
      if (o.scale < 10 || o.scale > 200) { showError("Scale must be between 10 and 200 %."); return; }
      savePrintPrefs(o);
      closePrintPanel({ keepPrinting: true });
      startPrintJob(action === "pdf" ? "print-pdf" : "print-run", o, context);
    });
    host.innerHTML = printPanelHtml(prefs, context);
    document.body.appendChild(host);
    bindForm();
    document.addEventListener("keydown", printPanelKeys, true);
    if (!local.printInfo) send("print-info");
    local.reRenderPrintPanel = render;
  }

  function printFileName(context = {}) {
    const fileName = safe(context.fileName || document.title || "Triplem VIP").replace(/[\\/:*?"<>|]+/g, " ").trim() || "Triplem VIP";
    return /\.pdf$/i.test(fileName) ? fileName : `${fileName}.pdf`;
  }

  // Starts a print job (print-run), a PDF (print-pdf) or a 3.9 preview PDF
  // (print-preview) of what the page prints now, with the @page rule applied.
  function startPrintJob(cmd, o, context = {}) {
    if (cmd !== "print-preview") {
      local.printing = true;
      local.printMode = "direct";
    } else {
      // Making the preview PDF fires "afterprint": the receipt must stay.
      local.printMode = "preview";
    }
    applyPageRule(o);
    // Two frames so the page lays out with the new @page rule first (with a
    // timer as a fallback when frames are paused).
    let sentJob = false;
    const go = () => {
      if (sentJob) return;
      sentJob = true;
      send(cmd, { print: { ...o, fileName: printFileName(context) } });
    };
    requestAnimationFrame(() => requestAnimationFrame(go));
    setTimeout(go, 250);
  }

  // 3.9: prints an element prepared by the PDF viewer (one sheet per page)
  // instead of the page, with its own @page rule.
  function printPreparedHost(el, o, pageCss, system = false) {
    cleanupThermal();
    removePageRule();
    el.id = "triplemDesktopPrintHost";
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
    document.body.classList.add("triplem-desktop-printing");
    const style = document.createElement("style");
    style.id = "triplemDesktopPageRule";
    style.textContent = pageCss;
    document.head.appendChild(style);
    local.thermalCleanup = () => {
      document.body.classList.remove("triplem-desktop-printing");
      el.remove();
    };
    local.printing = true;
    local.printMode = system ? "system" : "direct";
    let sentJob = false;
    const go = () => {
      if (sentJob) return;
      sentJob = true;
      if (system) send("print-system");
      else send("print-run", { print: o });
    };
    requestAnimationFrame(() => requestAnimationFrame(go));
    setTimeout(go, 250);
  }

  function systemPrint() {
    local.printing = true;
    local.printMode = "system";
    send("print-system");
  }

  // Receipt printing: the receipt document is rendered into a print-only host
  // of this page (screen: hidden), then the print panel prints it.
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
    // Direct printing (3.7) cleans up when the app reports the job finished;
    // the Windows print dialog path cleans up after printing as before.
    const onAfter = () => {
      if (local.printMode === "preview") return; // 3.9: the preview PDF was made, not printed
      window.removeEventListener("afterprint", onAfter);
      if (local.printMode !== "direct") cleanupThermal();
    };
    window.addEventListener("afterprint", onAfter);
    const imgs = [...printHost.querySelectorAll("img")].filter(img => !img.complete);
    let pending = imgs.length;
    let fired = false;
    const title = safe(doc.title || "Receipt");
    const go = () => { if (fired) return; fired = true; setTimeout(() => (caps.has("printplus") ? openPrintPanel({ title, fileName: title }) : send("print")), 80); };
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
    window.print = function triplemDesktopPrint() {
      if (!document.body.classList.contains("triplem-desktop-printing")) cleanupThermal();
      nativePrint({ title: document.title });
    };
    document.addEventListener("keydown", e => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        e.stopPropagation();
        if (document.getElementById("triplemDesktopPrintPanel")) return;
        if (window.TriplemPdfViewer?.isOpen?.()) { window.TriplemPdfViewer.printKey(); return; }
        cleanupThermal();
        nativePrint({ title: document.title });
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
  const subscribers = new Map(); // 3.9: other desktop modules (PDF viewer)
  function subscribe(type, fn) {
    if (!subscribers.has(type)) subscribers.set(type, new Set());
    subscribers.get(type).add(fn);
    return () => subscribers.get(type)?.delete(fn);
  }
  function handleNative(msg) {
    handleNativeCore(msg);
    // Other modules run after this module has taken the message in.
    const subs = subscribers.get(msg?.type);
    if (subs) [...subs].forEach(fn => { try { fn(msg); } catch (err) { console.warn("Desktop module failed:", err); } });
  }
  function handleNativeCore(msg) {
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
          safeStart: msg.safeStart === true,
          // 3.7
          hotkeysUnavailable: Array.isArray(msg.hotkeysUnavailable) ? msg.hotkeysUnavailable.map(safe) : [],
          appLock: msg.appLock === true,
          lockMinutes: Number.isFinite(Number(msg.lockMinutes)) ? Number(msg.lockMinutes) : 5,
          lockHideDetails: msg.lockHideDetails !== false,
          helloAvailable: Number.isFinite(Number(msg.helloAvailable)) ? Number(msg.helloAvailable) : -1,
          trayBadge: msg.trayBadge !== false,
          saveMemory: msg.saveMemory !== false,
          recentJumpList: msg.recentJumpList !== false,
          canPausePage: msg.canPausePage === true
        };
        local.locked = msg.locked === true;
        if (msg.backup && typeof msg.backup === "object") {
          local.backupSettings = msg.backup;
          if (msg.backup.running === false && local.backupBusy && !local.backupFile) local.backupBusy = false;
        }
        renderSettings();
        break;
      // ---- 3.8 Backup & Restore ----
      case "backup-run":
        runDesktopBackup({ auto: msg.auto === true });
        break;
      case "backup-expect-ok":
        if (typeof local.backupExpectResolve === "function") local.backupExpectResolve();
        break;
      case "backup-saved": {
        clearTimeout(local.backupWatch);
        local.backupBusy = false;
        local.backupStep = "";
        try { window.TriplemBackup?.markBackedUp?.(); } catch (_) {}
        const n = local.backupRecords || 0;
        const removed = Number(msg.removed) || 0;
        local.backupFile = "";
        renderBackup();
        showDesktopNotice("Backup saved", "success", [{ label: "Open folder", run: () => send("backup-open-folder") }],
          `${n ? `${n.toLocaleString()} records · ` : ""}${safe(msg.folder) ? `in ${safe(msg.folder)}` : safe(msg.name)}${removed ? ` · ${removed} older backup${removed === 1 ? "" : "s"} removed` : ""}`);
        break;
      }
      case "backup-status":
        if (msg.ok === false) {
          clearTimeout(local.backupWatch);
          local.backupBusy = false;
          local.backupStep = "";
          local.backupFile = "";
          renderBackup();
          if (!msg.cancelled && msg.reason && !msg.auto) showDesktopNotice("Backup not saved", "error", [], safe(msg.reason));
        }
        break;
      case "lock-result":
        local.lockBusy = false;
        local.lockError = msg.ok ? "" : safe(msg.error);
        local.settings.appLock = msg.enabled === true;
        renderSettings();
        if (msg.ok) showDesktopNotice(msg.enabled ? "Windows Hello lock is on" : "Windows Hello lock is off", "success", [], msg.enabled ? "Triplem VIP will ask for your face, fingerprint or PIN when it opens." : "");
        break;
      case "lock-state":
        local.locked = msg.locked === true;
        if (local.locked) {
          toggleAppMenu(false);
          closeSearchPalette();
        }
        break;
      case "lock-signout":
        // Chosen on the native lock screen: sign out without the usual
        // questions (changes saved on this PC stay and sync at next sign-in).
        try { if (typeof doLogout === "function" && signedInUserId()) doLogout(); } catch (_) {}
        setTimeout(() => send("unlock", { kind: "signed-out" }), 200);
        break;
      case "print-info":
        local.printInfo = { printers: Array.isArray(msg.printers) ? msg.printers.map(safe) : [], default: safe(msg.default), direct: msg.direct !== false, pdf: msg.pdf === true, floats: msg.floats !== false };
        if (document.getElementById("triplemDesktopPrintPanel") && typeof local.reRenderPrintPanel === "function") local.reRenderPrintPanel();
        break;
      case "print-done":
        finishPrint();
        if (!msg.ok && !msg.cancelled && !msg.pdf) showDesktopNotice("Printing did not finish", "error", [{ label: "More settings…", run: () => { local.printMode = "system"; local.printing = true; send("print-system"); } }], safe(msg.error));
        if (!msg.ok && !msg.cancelled && msg.pdf && msg.error) showDesktopNotice("Could not save the PDF", "error", [], safe(msg.error));
        if (msg.ok && !msg.pdf) showDesktopNotice("Sent to the printer", "success");
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
        if (local.windowVisible) { backgroundRefresh(true); renderStatus(); }
        else { toggleAppMenu(false); closeSearchPalette(); }
        break;
      case "download-complete": {
        if (msg.backup) break; // reported by "backup-saved"
        const id = safe(msg.id);
        const file = { id, name: safe(msg.name), path: safe(msg.path), folder: safe(msg.folder), size: Number(msg.size) || 0 };
        // 3.9: PDFs open in the app's own viewer (address bar, print preview).
        const inApp = msg.view === "pdf" && caps.has("pdfview") && typeof window.TriplemPdfViewer?.openFile === "function";
        showDesktopNotice(`Saved ${file.name}`, "info", [
          { label: inApp ? "Open" : "Open file", run: () => (inApp ? window.TriplemPdfViewer.openFile(file) : send("download-open", { id })) },
          { label: "Show in folder", run: () => send("download-show", { id }) }
        ], msg.folder ? `in ${file.folder}` : "");
        break;
      }
      case "download-failed":
        showDesktopNotice(`Could not save ${safe(msg.name) || "the export"}`, "error", [], safe(msg.reason));
        break;
      case "print-unavailable":
        finishPrint();
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
    print: () => nativePrint({ title: document.title }),
    open: openTarget,
    beforeLogout,
    openPrintPanel,
    openSearch: openSearchPalette,
    prepareOffline,
    // 3.8
    showShortcuts,
    backupNow: () => runDesktopBackup({ auto: false }),
    openMenu: (section = "") => { toggleAppMenu(true); if (section) setAccordion(section); },
    // 3.9: shared helpers for the PDF viewer and the search bar.
    kit: Object.freeze({
      caps, send, on: subscribe, notice: showDesktopNotice, esc, safe,
      allowed, can, goTab, waitFor, signedInUserId, openTarget,
      readPrintPrefs, savePrintPrefs, printInfo: () => local.printInfo, requestPrintInfo: () => send("print-info"),
      startPrintJob, printPreparedHost, systemPrint, finishPrint, validPages, printFileName,
      previewFailed: () => { local.previewFailed = true; }, PAPER_MM, MARGIN_MM
    }),
    _test: Object.freeze({ planToasts, notificationTitle, notificationBody, cssColorToHex, fileAccepted, validPages, readRecent, applyPageRule, removePageRule })
  });

  // Sign-in / sign-out / connection changes (cheap periodic check).
  function watchSession() {
    const uid = signedInUserId();
    if (uid !== local.watchUid) {
      local.watchUid = uid;
      sendRecent();
      renderOffline();
      if (uid && caps.has("offlineprep")) {
        clearTimeout(local.prepTimer);
        local.prepTimer = setTimeout(() => prepareOffline(), 25000); // after sign-in has settled
      }
    }
    renderStatus();
  }

  function start() {
    ensureStyles();
    ensureAppBar();
    trackRecentRecords();
    window.addEventListener("online", () => { renderStatus(); renderOffline(); });
    window.addEventListener("offline", () => { renderStatus(); renderOffline(); });
    window.addEventListener("afterprint", () => { if (local.printMode === "system") finishPrint(); });
    setInterval(watchSession, 4000);
    if (caps.has("offlineprep")) setInterval(() => { if (local.windowVisible !== false || !document.hidden) prepareOffline(); }, 15 * 60 * 1000);
    if (caps.has("theme")) {
      new MutationObserver(() => syncTitleBar()).observe(document.documentElement, { attributes: true, attributeFilter: ["data-triplem-theme", "style", "class"] });
      syncTitleBar();
    }
    // Sign-in / sign-out changes for Store notifications (cheap check).
    if (caps.has("push")) setInterval(syncPushRegistration, 5000);
    send("ready", {});
    watchSession();
    try {
      const d = { notifications: Number(document.getElementById("adminNotifyCount")?.dataset.count) || 0, messages: Number(document.getElementById("adminMessagesCount")?.dataset.count) || 0 };
      pushBadge(signedInUserId() ? d.notifications + d.messages : 0);
    } catch (_) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
