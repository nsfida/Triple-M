/* Modularized from script.js lines 37378-39297 — Messaging + overlay helpers. Load order must be preserved. */
/** Near-realtime messaging sync via RPC polling (Realtime blocked by deny-all RLS + custom sessions). */
const messagingLiveState = {
  timer: null,
  visibilityBound: false,
  fingerprint: null,
  fallbackFingerprint: null,
  refreshInFlight: false,
  debounceTimer: null,
  syncRpcAvailable: null, // null unknown, true/false after first probe
  lastThreadSig: null,
  lastNoteReminderDispatchAt: 0
};

const MESSAGING_LIVE_POLL_MS = 8000;
const MESSAGING_LIVE_POLL_ACTIVE_MS = 5000;
const NOTE_REMINDER_DISPATCH_THROTTLE_MS = 5000;

function stopAdminCommsPolling(){
  stopMessagingLiveSync();
}

function startAdminCommsPolling(){
  startMessagingLiveSync();
}

function stopMessagingLiveSync(){
  if (messagingLiveState.timer) {
    clearTimeout(messagingLiveState.timer);
    messagingLiveState.timer = null;
  }
  if (messagingLiveState.debounceTimer) {
    clearTimeout(messagingLiveState.debounceTimer);
    messagingLiveState.debounceTimer = null;
  }
  messagingLiveState.refreshInFlight = false;
}

function messagingLiveEligible(){
  return !!(state.unlocked && !isGuestMode() && state.sessionToken && state.sessionUser);
}

function messagingLivePollIntervalMs(){
  return getActiveTabKey() === "messages" ? MESSAGING_LIVE_POLL_ACTIVE_MS : MESSAGING_LIVE_POLL_MS;
}

function scheduleMessagingLivePoll(delayMs){
  if (messagingLiveState.timer) {
    clearTimeout(messagingLiveState.timer);
    messagingLiveState.timer = null;
  }
  if (!messagingLiveEligible()) return;
  const wait = Math.max(1000, Number(delayMs) || messagingLivePollIntervalMs());
  messagingLiveState.timer = setTimeout(() => {
    messagingLiveState.timer = null;
    runMessagingLivePoll().finally(() => {
      if (messagingLiveEligible()) scheduleMessagingLivePoll(messagingLivePollIntervalMs());
    });
  }, wait);
}

function startMessagingLiveSync(){
  stopMessagingLiveSync();
  if (!messagingLiveEligible()) return;
  bindMessagingLiveVisibility();
  // Seed soon after login; first successful poll only stores fingerprint (no UI churn)
  scheduleMessagingLivePoll(1500);
}

function bindMessagingLiveVisibility(){
  if (messagingLiveState.visibilityBound) return;
  messagingLiveState.visibilityBound = true;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (messagingLiveState.timer) {
        clearTimeout(messagingLiveState.timer);
        messagingLiveState.timer = null;
      }
      return;
    }
    if (!messagingLiveEligible()) return;
    scheduleMessagingLivePoll(400);
  });
}

function threadListFingerprint(items){
  return (Array.isArray(items) ? items : []).map(t => [
    t.id,
    t.status,
    t.last_message_at || "",
    t.message_count || 0,
    t.unread_for_admin || 0,
    t.unread_for_user || 0,
    t.last_message_preview || ""
  ].join(":")).join("|");
}

function selectedThreadSignature(items, selectedId){
  if (!selectedId) return null;
  const t = (Array.isArray(items) ? items : []).find(x => x.id === selectedId);
  if (!t) return `${selectedId}:missing`;
  return [selectedId, t.last_message_at || "", t.message_count || 0, t.status || ""].join(":");
}

function isAdminCommsDropdownOpen(key){
  const panel = document.querySelector(`.menu-dropdown[data-entry-menu-panel="${key}"]`);
  return !!(panel && panel.classList.contains("open"));
}

function applyAdminBadgeCounts(notifications, inquiries){
  adminCommsState.unreadNotifications = Math.max(0, Number(notifications) || 0);
  adminCommsState.unreadInquiries = Math.max(0, Number(inquiries) || 0);
  setHeaderBadge(document.getElementById("adminNotifyCount"), adminCommsState.unreadNotifications);
  setHeaderBadge(document.getElementById("adminMessagesCount"), adminCommsState.unreadInquiries);
}

function queueMessagingLiveUiRefresh(reason){
  if (messagingLiveState.debounceTimer) clearTimeout(messagingLiveState.debounceTimer);
  messagingLiveState.debounceTimer = setTimeout(() => {
    messagingLiveState.debounceTimer = null;
    applyMessagingLiveUiRefresh(reason).catch(err => {
      console.warn("Messaging live refresh failed:", err);
    });
  }, 350);
}

async function applyMessagingLiveUiRefresh(reason){
  if (messagingLiveState.refreshInFlight) {
    queueMessagingLiveUiRefresh(reason || "retry");
    return;
  }
  messagingLiveState.refreshInFlight = true;
  try {
    await refreshAdminCommsBadges();
    if (isAdminCommsDropdownOpen("admin-notify")) {
      await loadAdminNotificationsDropdown();
    }
    if (isAdminCommsDropdownOpen("admin-messages")) {
      await loadAdminMessagesPreview();
    }
    if (getActiveTabKey() === "messages") {
      await renderMessagesPanel({ silent: true });
    }
  } finally {
    messagingLiveState.refreshInFlight = false;
  }
}

async function fetchMessagingSyncState(){
  if (messagingLiveState.syncRpcAvailable === false) return null;
  try {
    const sync = unwrapRpcJson(await supabaseRpc("app_messaging_sync_state", {}));
    messagingLiveState.syncRpcAvailable = true;
    return sync;
  } catch (err) {
    const msg = String(err?.message || err || "");
    // Function missing / schema cache → fall back to existing RPCs
    if (/messaging_sync_state|Could not find the function|404|PGRST202/i.test(msg)) {
      messagingLiveState.syncRpcAvailable = false;
      return null;
    }
    throw err;
  }
}

async function fetchMessagingFallbackFingerprint(){
  if (isAppAdminSession()) {
    try {
      const counts = await supabaseRpc("app_admin_unread_counts", {});
      const n = Number(counts?.notifications || 0);
      const i = Number(counts?.inquiries || 0);
      applyAdminBadgeCounts(n, i);
      let listFp = "";
      if (getActiveTabKey() === "messages" || isAdminCommsDropdownOpen("admin-messages") || isAdminCommsDropdownOpen("admin-notify")) {
        const statusRadio = document.querySelector('input[name="inquiryStatusFilter"]:checked');
        const status = statusRadio?.value === "all" ? null : (statusRadio?.value || null);
        const result = await supabaseRpc("app_admin_list_inquiries", {
          p_status: getActiveTabKey() === "messages" ? status : "open",
          p_limit: getActiveTabKey() === "messages" ? 150 : 12
        });
        const items = Array.isArray(result?.items) ? result.items : [];
        listFp = threadListFingerprint(items);
      }
      return `a-fb|${n}|${i}|${listFp}`;
    } catch (err) {
      if (typeof isAdminSecurityKeyError === "function" && isAdminSecurityKeyError(err)) {
        return "a-fb|security-locked";
      }
      throw err;
    }
  }

  let userNotifUnread = 0;
  try {
    const userNotifs = await fetchMyNotificationsList(1);
    userNotifUnread = Number(userNotifs.unread || 0);
  } catch (_) {}
  const result = unwrapRpcJson(await supabaseRpc("app_list_my_inquiries", {}));
  const items = Array.isArray(result?.items) ? result.items : [];
  const unreadMsgs = items.reduce((sum, t) => sum + Number(t.unread_for_user || 0), 0);
  applyAdminBadgeCounts(userNotifUnread, unreadMsgs);
  let listFp = "";
  if (getActiveTabKey() === "messages" || isAdminCommsDropdownOpen("admin-messages") || isAdminCommsDropdownOpen("admin-notify")) {
    listFp = threadListFingerprint(items);
  }
  return `u-fb|${userNotifUnread}|${unreadMsgs}|${listFp}`;
}

async function dispatchDueNoteRemindersThrottled(force = false){
  if (!messagingLiveEligible()) return 0;
  const now = Date.now();
  if (!force && now - messagingLiveState.lastNoteReminderDispatchAt < NOTE_REMINDER_DISPATCH_THROTTLE_MS) {
    return 0;
  }
  messagingLiveState.lastNoteReminderDispatchAt = now;
  try {
    const clientNow = new Date().toISOString();
    let res;
    try {
      res = await supabaseRpc("app_dispatch_due_note_reminders", { p_client_now: clientNow });
    } catch (_) {
      // Prefer client-now; fall back if overload/arg is not deployed yet.
      res = await supabaseRpc("app_dispatch_due_note_reminders", {});
    }
    const payload = unwrapRpcJson(res);
    const delivered = Math.max(0, Number(payload?.delivered ?? res?.delivered ?? res?.[0]?.delivered ?? 0));
    if (delivered > 0) {
      noteMessagingLocalMutation();
      queueMessagingLiveUiRefresh("note-reminders");
      noteReminderUiState.loadedAt = 0;
      await refreshAdminCommsBadges();
      if (isAdminCommsDropdownOpen("admin-notify")) {
        try { await loadAdminNotificationsDropdown(); } catch (_) {}
      }
      showNoteReminderToasts(locallyDueNoteReminders(noteReminderUiState.pendingReminders, 2000));
      // Prefer inbox rows so overlay works even when pending cache is empty (cold load).
      try { await presentUnreadReminderAlertsFromNotifications(); } catch (_) {}
    }
    return delivered;
  } catch (err) {
    console.warn("Note reminder dispatch failed:", err);
    return 0;
  }
}

async function runMessagingLivePoll(){
  if (!messagingLiveEligible() || document.hidden) return;
  try {
    // Deliver due note reminders while the page is open (throttled).
    await dispatchDueNoteRemindersThrottled(false);

    const sync = await fetchMessagingSyncState();
    if (sync && sync.fingerprint) {
      if (sync.role === "admin") {
        applyAdminBadgeCounts(sync.notifications, sync.inquiries);
      } else {
        applyAdminBadgeCounts(sync.notifications ?? sync.user_notifications, sync.inquiries ?? sync.user_unread);
      }
      const prev = messagingLiveState.fingerprint;
      const userUnread = Number(
        sync.role === "admin"
          ? (sync.user_notifications ?? 0)
          : (sync.notifications ?? sync.user_notifications ?? 0)
      );
      if (prev === null) {
        messagingLiveState.fingerprint = sync.fingerprint;
        // Cold-load: badge may already be > 0 from unread reminders delivered while offline.
        if (userUnread > 0) {
          presentUnreadReminderAlertsFromNotifications().catch(() => {});
        }
        return;
      }
      if (prev === sync.fingerprint) return;
      messagingLiveState.fingerprint = sync.fingerprint;
      queueMessagingLiveUiRefresh("sync");
      if (userUnread > 0) {
        presentUnreadReminderAlertsFromNotifications().catch(() => {});
      }
      return;
    }

    // Fallback path when 019 is not applied yet
    const fb = await fetchMessagingFallbackFingerprint();
    const prevFb = messagingLiveState.fallbackFingerprint;
    if (prevFb === null) {
      messagingLiveState.fallbackFingerprint = fb;
      return;
    }
    if (prevFb === fb) return;
    messagingLiveState.fallbackFingerprint = fb;
    queueMessagingLiveUiRefresh("fallback");
  } catch (err) {
    console.warn("Messaging live poll failed:", err);
  }
}

/** Call after local send/reply so the next poll does not treat our own write as remote. */
function noteMessagingLocalMutation(){
  messagingLiveState.fingerprint = null;
  messagingLiveState.fallbackFingerprint = null;
}

function setHeaderBadge(el, count){
  if (!el) return;
  const n = Math.max(0, Number(count) || 0);
  el.textContent = n > 99 ? "99+" : String(n);
  el.style.display = n > 0 ? "inline" : "none";
}

function updateAdminCommsVisibility(){
  const show = !!(state.unlocked && !isGuestMode() && state.sessionUser);
  ["adminNotifyWrap", "adminMessagesWrap"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("hide", !show);
  });
  const admin = isAppAdminSession();
  const notifySub = document.getElementById("adminNotifySubtitle");
  const msgTitle = document.getElementById("adminMessagesTitle");
  const msgSub = document.getElementById("adminMessagesSubtitle");
  if (notifySub) notifySub.textContent = admin ? "Reminders, dues & system alerts" : "Reminders & installment dues";
  if (msgTitle) msgTitle.textContent = admin ? "Inquiries" : "Messages";
  if (msgSub) msgSub.textContent = admin ? "Messages from users" : "Conversations with admin";
  if (!show) {
    setHeaderBadge(document.getElementById("adminNotifyCount"), 0);
    setHeaderBadge(document.getElementById("adminMessagesCount"), 0);
    stopInstallmentDueChecker();
  }
  if (!messagingLiveEligible()) stopMessagingLiveSync();
}

async function refreshAdminCommsBadges(){
  updateAdminCommsVisibility();
  if (!messagingLiveEligible()) return;
  try {
    if (isAppAdminSession()) {
      let adminN = 0;
      let inquiries = 0;
      try {
        const counts = unwrapRpcJson(await supabaseRpc("app_admin_unread_counts", {}));
        adminN = Number(counts?.notifications || 0);
        inquiries = Number(counts?.inquiries || 0);
      } catch (_) {}
      let userN = 0;
      try {
        const userNotifs = await fetchMyNotificationsList(1);
        userN = Number(userNotifs.unread || 0);
      } catch (_) {}
      applyAdminBadgeCounts(adminN + userN, inquiries);
      return;
    }
    let userN = 0;
    let userUnread = 0;
    try {
      const userNotifs = await fetchMyNotificationsList(1);
      userN = Number(userNotifs.unread || 0);
    } catch (_) {}
    try {
      const result = unwrapRpcJson(await supabaseRpc("app_list_my_inquiries", {}));
      const items = Array.isArray(result?.items) ? result.items : [];
      userUnread = items.reduce((sum, t) => sum + Number(t.unread_for_user || 0), 0);
    } catch (_) {}
    applyAdminBadgeCounts(userN, userUnread);
  } catch (err) {
    console.warn("Comms unread counts failed:", err);
  }
}

function notificationIconClass(kind){
  if (kind === "trial_signup") return "trial";
  if (kind === "inquiry") return "inquiry";
  if (kind === "renewal_request") return "renewal";
  if (kind === "access_expiry_warning" || kind === "access_auto_disabled") return "warn";
  if (kind === "note_reminder") return "reminder";
  if (kind === "installment_due") return "due";
  return "";
}

function notificationIcon(kind){
  if (kind === "trial_signup") return "fa-user-plus";
  if (kind === "inquiry") return "fa-envelope-open-text";
  if (kind === "renewal_request") return "fa-rotate";
  if (kind === "access_expiry_warning") return "fa-triangle-exclamation";
  if (kind === "access_auto_disabled") return "fa-user-slash";
  if (kind === "note_reminder") return "fa-clock";
  if (kind === "installment_due") return "fa-calendar-day";
  return "fa-bell";
}

async function loadAdminNotificationsDropdown(){
  const list = document.getElementById("adminNotifyList");
  if (!list || !messagingLiveEligible()) return;
  list.innerHTML = `<div class="admin-comms-empty">Loading…</div>`;
  try {
    await dispatchDueNoteRemindersThrottled(true);
    const items = [];
    let loadErrors = [];
    if (isAppAdminSession()) {
      try {
        const adminResult = unwrapRpcJson(await supabaseRpc("app_admin_list_notifications", { p_limit: 40 }));
        (Array.isArray(adminResult?.items) ? adminResult.items : []).forEach(n => {
          items.push({ ...n, source: "admin" });
        });
      } catch (err) {
        loadErrors.push(err?.message || "Admin notifications failed");
      }
    }
    try {
      const userResult = await fetchMyNotificationsList(40);
      userResult.items.forEach(n => {
        items.push({ ...n, source: n.source || "user" });
      });
    } catch (err) {
      loadErrors.push(err?.message || "User notifications failed");
    }
    items.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    adminCommsState.notifications = items.slice(0, 50);
    if (!adminCommsState.notifications.length) {
      const hint = loadErrors.length
        ? `Could not load notifications (${escapeHtml(loadErrors[0])})`
        : "No notifications yet";
      list.innerHTML = `<div class="admin-comms-empty">${hint}</div>`;
      return;
    }
    list.innerHTML = adminCommsState.notifications.map(n => {
      const unread = !n.is_read;
      const payload = n.payload && typeof n.payload === "object" ? n.payload : {};
      const source = n.source || (n.kind === "note_reminder" || n.kind === "installment_due" ? "user" : "admin");
      const reminderPreview = n.kind === "note_reminder"
        ? String(payload.note_preview || n.body || "").trim()
        : n.kind === "installment_due"
          ? [payload.person_name, payload.due_date, payload.amount_label].filter(Boolean).join(" · ")
          : "";
      const extra = n.kind === "renewal_request"
        ? `<p class="admin-comms-item-body"><strong>${escapeHtml(payload.period_label || accessPeriodLabel(payload.requested_period, payload.requested_days, payload.requested_until ? toInputDateValue(payload.requested_until) : null))}</strong>${payload.current_expires_at ? ` · current ${escapeHtml(formatTrialExpiry(payload.current_expires_at))}` : ""}${payload.message ? ` · “${escapeHtml(payload.message)}”` : ""}</p>`
        : (n.kind === "access_expiry_warning" || n.kind === "access_auto_disabled")
          ? `<p class="admin-comms-item-body">${payload.trial_expires_at ? `Expired ${escapeHtml(formatTrialExpiry(payload.trial_expires_at))}` : ""}${payload.access_disable_at ? ` · disable ${escapeHtml(formatTrialExpiry(payload.access_disable_at))}` : ""}</p>`
          : (reminderPreview
            ? `<p class="admin-comms-item-body">${escapeHtml(reminderPreview.slice(0, 120))}</p>`
            : "");
      const jumpUser = source === "admin" && n.related_user_id
        ? `<button type="button" class="btn ghost" data-notif-user="${escapeHtml(n.related_user_id)}" title="Open user"><i class="fa-solid fa-user"></i></button>`
        : "";
      const title = String(n.title || (
        n.kind === "note_reminder"
          ? (payload.type === "installment_manual" ? "Installment reminder" : "Note reminder")
          : n.kind === "installment_due"
            ? "Installment due"
            : "Notification"
      )).trim();
      return `
        <div class="admin-comms-item ${unread ? "unread" : ""}" data-notification-id="${escapeHtml(n.id)}" data-notif-source="${escapeHtml(source)}" data-related-user="${escapeHtml(n.related_user_id || "")}">
          <div class="admin-comms-item-icon ${notificationIconClass(n.kind)}">
            <i class="fa-solid ${notificationIcon(n.kind)}"></i>
          </div>
          <div>
            <p class="admin-comms-item-title">${escapeHtml(title)}</p>
            <p class="admin-comms-item-body">${escapeHtml(n.body || "")}</p>
            ${extra}
            <span class="admin-comms-item-meta">${escapeHtml(formatRelativeTime(n.created_at))}</span>
          </div>
          <div class="admin-comms-item-actions">
            ${jumpUser}
            ${unread ? `<button type="button" class="btn ghost" data-notif-read="${escapeHtml(n.id)}" data-notif-source="${escapeHtml(source)}" title="Mark read"><i class="fa-solid fa-check"></i></button>` : ""}
            <button type="button" class="btn ghost" data-notif-delete="${escapeHtml(n.id)}" data-notif-source="${escapeHtml(source)}" title="Delete"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>`;
    }).join("");
  } catch (err) {
    list.innerHTML = `<div class="admin-comms-empty">${escapeHtml(err.message || "Could not load notifications")}</div>`;
  }
}
async function loadAdminMessagesPreview(){
  const list = document.getElementById("adminMessagesPreviewList");
  if (!list || !messagingLiveEligible()) return;
  list.innerHTML = `<div class="admin-comms-empty">Loading…</div>`;
  try {
    const admin = isAppAdminSession();
    const result = admin
      ? await supabaseRpc("app_admin_list_inquiries", { p_status: null, p_limit: 12 })
      : await supabaseRpc("app_list_my_inquiries", {});
    const items = (Array.isArray(result?.items) ? result.items : []).slice(0, 12);
    adminCommsState.inquiryPreview = items;
    if (!items.length) {
      list.innerHTML = `<div class="admin-comms-empty">${admin ? "No conversations yet" : "No messages yet"}</div>`;
      return;
    }
    list.innerHTML = items.map(item => {
      const unread = admin
        ? (Number(item.unread_for_admin || 0) > 0 || item.status === "open")
        : Number(item.unread_for_user || 0) > 0;
      const who = admin
        ? (item.sender_display_name || item.guest_name || item.sender_username || "Guest")
        : "Admin";
      return `
      <button type="button" class="admin-comms-item ${unread ? "unread" : ""}" data-preview-inquiry="${escapeHtml(item.id)}">
        <div class="admin-comms-item-icon inquiry"><i class="fa-solid fa-comments"></i></div>
        <div>
          <p class="admin-comms-item-title">${escapeHtml(item.subject || "Conversation")}</p>
          <p class="admin-comms-item-body">${escapeHtml(who)} · ${escapeHtml(item.last_message_preview || item.body || "")}</p>
          <span class="admin-comms-item-meta">${escapeHtml(formatRelativeTime(item.last_message_at || item.created_at))}</span>
        </div>
      </button>`;
    }).join("");
  } catch (err) {
    list.innerHTML = `<div class="admin-comms-empty">${escapeHtml(err.message || "Could not load messages")}</div>`;
  }
}

function goToMessagesTab(inquiryId = null, options = {}){
  document.querySelectorAll(".menu-dropdown.open").forEach(p => p.classList.remove("open"));
  if (state.trialLocked) hideTrialExpiredOverlay();
  if (inquiryId) messagesUiState.pendingOpenId = inquiryId;
  activate("messages");
  const compose = options && options.compose === true;
  if (compose) {
    setMessagesComposerVisible(true);
    prepareMessagesComposer().catch(() => {});
  } else if (options && options.compose === false) {
    setMessagesComposerVisible(false);
  }
}

const messagesUiState = {
  threads: [],
  selectedId: null,
  canReply: false,
  pendingOpenId: null
};

function setMessagesComposerVisible(show){
  const composer = document.getElementById("messagesNewComposer");
  if (composer) composer.classList.toggle("hide", !show);
}

async function prepareMessagesComposer(){
  const admin = isAppAdminSession();
  const title = document.getElementById("messagesNewTitle");
  const help = document.getElementById("messagesNewHelp");
  const pickWrap = document.getElementById("messagesUserPickWrap");
  const select = document.getElementById("messagesUserSelect");
  const subject = document.getElementById("inquirySubject");
  const body = document.getElementById("inquiryBody");
  const err = document.getElementById("inquiryFormError");

  if (title) title.textContent = admin ? "Message a user" : "Start a conversation";
  if (help) {
    help.textContent = admin
      ? "Choose an existing account, then write a subject and first message."
      : "Describe your request clearly. The administrator can reply here in Messages.";
  }
  if (pickWrap) pickWrap.classList.toggle("hide", !admin);
  if (err) {
    err.textContent = "";
    err.classList.remove("show");
  }
  if (subject) subject.value = "";
  if (body) body.value = "";

  if (admin && select) {
    select.innerHTML = `<option value="">Loading users…</option>`;
    select.disabled = true;
    try {
      let list = [];
      try {
        const recipients = await supabaseRpc("app_admin_list_message_recipients", {});
        list = Array.isArray(recipients?.items) ? recipients.items : [];
      } catch (_) {
        // Fallback if migration 089 not applied yet
        const users = await supabaseRpc("app_admin_list_users", {});
        list = Array.isArray(users) ? users : (Array.isArray(users?.items) ? users.items : []);
      }
      const myId = state.sessionUser?.id;
      const options = list
        .filter(u => u?.id && u.id !== myId)
        .sort((a, b) => String(a.username || "").localeCompare(String(b.username || "")));
      if (!options.length) {
        select.innerHTML = `<option value="">No other users found</option>`;
      } else {
        select.innerHTML = `<option value="">Select a user…</option>` + options.map(u => {
          const label = `${u.display_name || u.username || "User"} (@${u.username || "—"})`;
          const meta = u.role === "admin" ? " · admin" : (u.access_plan === "trial" ? " · trial" : "");
          return `<option value="${escapeHtml(u.id)}">${escapeHtml(label + meta)}</option>`;
        }).join("");
        select.disabled = false;
      }
    } catch (ex) {
      select.innerHTML = `<option value="">Could not load users</option>`;
      if (err) {
        err.textContent = ex.message || "Could not load users.";
        err.classList.add("show");
      }
    }
  }
}

async function renderMessagesPanel(options = {}){
  const silent = !!options.silent;
  const title = document.getElementById("messagesPanelTitle");
  const subtitle = document.getElementById("messagesPanelSubtitle");
  const filters = document.getElementById("messagesAdminFilters");
  const newBtn = document.getElementById("messagesNewBtn");
  const list = document.getElementById("messagesThreadList");
  if (!list) return;

  const admin = isAppAdminSession();
  if (!silent) {
    if (title) title.textContent = "Messages";
    if (subtitle) {
      subtitle.textContent = admin
        ? "Conversations with users and access requests. Use New message to contact any account."
        : "Message the administrator — replies appear in this conversation view.";
    }
    if (filters) filters.classList.toggle("hide", !admin);
    if (newBtn) {
      newBtn.classList.remove("hide");
      newBtn.innerHTML = admin
        ? `<i class="fa-solid fa-pen-to-square"></i> Message user`
        : `<i class="fa-solid fa-pen-to-square"></i> New message`;
    }
    list.innerHTML = `<div class="empty">Loading…</div>`;
  }

  try {
    let items = [];
    if (admin) {
      const statusRadio = document.querySelector('input[name="inquiryStatusFilter"]:checked');
      const status = statusRadio?.value === "all" ? null : (statusRadio?.value || null);
      const result = await supabaseRpc("app_admin_list_inquiries", {
        p_status: status,
        p_limit: 150
      });
      items = Array.isArray(result?.items) ? result.items : [];
    } else {
      const result = await supabaseRpc("app_list_my_inquiries", {});
      items = Array.isArray(result?.items) ? result.items : [];
    }
    messagesUiState.threads = items;
    renderMessagesThreadList(list, items, admin);

    const nextThreadSig = selectedThreadSignature(items, messagesUiState.selectedId);
    const openId = silent
      ? (messagesUiState.selectedId && items.some(t => t.id === messagesUiState.selectedId)
        ? messagesUiState.selectedId
        : null)
      : (messagesUiState.pendingOpenId || messagesUiState.selectedId);
    if (!silent) messagesUiState.pendingOpenId = null;

    if (openId && items.some(t => t.id === openId)) {
      const shouldReloadThread = !silent
        || messagingLiveState.lastThreadSig !== nextThreadSig
        || !document.getElementById("messagesThreadActive")
        || document.getElementById("messagesThreadActive")?.classList.contains("hide");
      if (shouldReloadThread) {
        await openInquiryThread(openId, { silent });
        messagingLiveState.lastThreadSig = selectedThreadSignature(items, openId);
      } else {
        messagingLiveState.lastThreadSig = nextThreadSig;
      }
    } else if (!silent && items.length && admin && !isMessagesMobileLayout()) {
      await openInquiryThread(items[0].id);
      messagingLiveState.lastThreadSig = selectedThreadSignature(items, items[0].id);
    } else if (!silent && items.length && !admin && messagesUiState.selectedId && items.some(t => t.id === messagesUiState.selectedId)) {
      await openInquiryThread(messagesUiState.selectedId);
      messagingLiveState.lastThreadSig = selectedThreadSignature(items, messagesUiState.selectedId);
    } else if (!items.length || (messagesUiState.selectedId && !items.some(t => t.id === messagesUiState.selectedId))) {
      showMessagesEmptyState();
      messagingLiveState.lastThreadSig = null;
    } else if (!silent && isMessagesMobileLayout() && !openId) {
      // Mobile: stay on the thread list until the user opens a conversation.
      showMessagesEmptyState();
      messagingLiveState.lastThreadSig = null;
    }
  } catch (err) {
    if (!silent) {
      list.innerHTML = `<div class="empty">${escapeHtml(err.message || "Could not load messages")}</div>`;
      showMessagesEmptyState();
    }
  }
  if (admin) refreshAdminCommsBadges().catch(() => {});
  if (!silent) noteMessagingLocalMutation();
  // Reschedule at active interval while Messages tab is open
  if (messagingLiveEligible() && getActiveTabKey() === "messages") {
    scheduleMessagingLivePoll(messagingLivePollIntervalMs());
  }
}

function renderMessagesThreadList(container, items, isAdmin){
  if (!items.length) {
    container.innerHTML = `<div class="empty">${isAdmin ? "No conversations yet." : "No conversations yet. Tap “New message” to start."}</div>`;
    return;
  }
  container.innerHTML = items.map(item => {
    const unread = isAdmin
      ? Number(item.unread_for_admin || 0) > 0 || item.status === "open"
      : Number(item.unread_for_user || 0) > 0;
    const active = item.id === messagesUiState.selectedId ? "active" : "";
    const sourceBadge = item.source === "landing"
      ? `<span class="thread-source">Access request</span>`
      : "";
    const who = isAdmin
      ? (item.sender_display_name || item.guest_name || item.sender_username || "Guest")
      : item.subject;
    return `
      <button type="button" class="messages-thread-item ${active} ${unread ? "unread" : ""}" data-open-thread="${escapeHtml(item.id)}">
        <div class="thread-item-top">
          <strong>${escapeHtml(who)}</strong>
          <span class="thread-time">${escapeHtml(formatRelativeTime(item.last_message_at || item.created_at))}</span>
        </div>
        <div class="thread-item-subject">${escapeHtml(item.subject)}${sourceBadge}</div>
        <div class="thread-item-preview">${escapeHtml(item.last_message_preview || item.body || "")}</div>
        <div class="thread-item-meta">
          <span class="message-status-pill ${escapeHtml(item.status || "open")}">${escapeHtml(item.status || "open")}</span>
          ${unread ? `<span class="thread-unread-dot" title="Unread"></span>` : ""}
        </div>
      </button>`;
  }).join("");
}

function isMessagesMobileLayout(){
  return typeof window.matchMedia === "function"
    && window.matchMedia("(max-width: 900px)").matches;
}

function setMessagesMobileConversationMode(open){
  const workspace = document.querySelector(".messages-workspace");
  if (!workspace) return;
  const shouldOpen = !!open && isMessagesMobileLayout();
  workspace.classList.toggle("messages-conversation-open", shouldOpen);
}

function closeMessagesConversationView(){
  messagesUiState.selectedId = null;
  messagesUiState.canReply = false;
  messagingLiveState.lastThreadSig = null;
  document.querySelectorAll(".messages-thread-item.active").forEach(el => el.classList.remove("active"));
  document.getElementById("messagesThreadEmpty")?.classList.remove("hide");
  document.getElementById("messagesThreadActive")?.classList.add("hide");
  setMessagesMobileConversationMode(false);
}

function showMessagesEmptyState(){
  closeMessagesConversationView();
}

async function openInquiryThread(inquiryId, options = {}){
  const silent = !!options.silent;
  const empty = document.getElementById("messagesThreadEmpty");
  const active = document.getElementById("messagesThreadActive");
  const header = document.getElementById("messagesThreadHeader");
  const scroll = document.getElementById("messagesChatScroll");
  const replyBar = document.getElementById("messagesReplyBar");
  if (!scroll || !header) return;

  messagesUiState.selectedId = inquiryId;
  document.querySelectorAll(".messages-thread-item").forEach(el => {
    el.classList.toggle("active", el.dataset.openThread === inquiryId);
  });

  empty?.classList.add("hide");
  active?.classList.remove("hide");
  if (!silent) setMessagesMobileConversationMode(true);
  else if (isMessagesMobileLayout()) setMessagesMobileConversationMode(true);

  const wasNearBottom = silent
    ? (scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 96)
    : true;
  if (!silent) {
    header.innerHTML = `
      <div class="messages-thread-header-top">
        <button type="button" class="btn ghost messages-thread-back" data-messages-back aria-label="Back to conversations">
          <i class="fa-solid fa-arrow-left"></i> Back
        </button>
      </div>
      <div class="messages-thread-header-main">
        <div class="help">Loading conversation…</div>
      </div>`;
    scroll.innerHTML = "";
  }

  try {
    const result = await supabaseRpc("app_get_inquiry_thread", { p_inquiry_id: inquiryId });
    const inquiry = result?.inquiry || {};
    const messages = Array.isArray(result?.messages) ? result.messages : [];
    messagesUiState.canReply = !!result?.can_reply;
    const admin = isAppAdminSession();

    const contactBits = [
      inquiry.sender_email,
      inquiry.sender_phone,
      inquiry.sender_company
    ].filter(Boolean).map(escapeHtml).join(" · ");

    header.innerHTML = `
      <div class="messages-thread-header-top">
        <button type="button" class="btn ghost messages-thread-back" data-messages-back aria-label="Back to conversations">
          <i class="fa-solid fa-arrow-left"></i> Back
        </button>
      </div>
      <div class="messages-thread-header-main">
        <div>
          <h4>${escapeHtml(inquiry.subject || "Conversation")}</h4>
          <p>${escapeHtml(inquiry.sender_display_name || "Guest")}${inquiry.sender_username ? ` · @${escapeHtml(inquiry.sender_username)}` : ""}${inquiry.source === "landing" ? " · Login page request" : ""}</p>
          ${contactBits ? `<p class="messages-thread-contact">${contactBits}</p>` : ""}
        </div>
        <span class="message-status-pill ${escapeHtml(inquiry.status || "open")}">${escapeHtml(inquiry.status || "open")}</span>
      </div>
      <div class="messages-thread-header-actions">
        ${admin && inquiry.status !== "archived" ? `<button type="button" class="btn ghost" data-inquiry-status="${escapeHtml(inquiry.id)}" data-status="archived"><i class="fa-solid fa-box-archive"></i> Archive</button>` : ""}
        ${admin && inquiry.status === "archived" ? `<button type="button" class="btn soft" data-inquiry-status="${escapeHtml(inquiry.id)}" data-status="open"><i class="fa-solid fa-rotate-left"></i> Reopen</button>` : ""}
        ${admin ? `<button type="button" class="btn ghost danger-text" data-inquiry-delete="${escapeHtml(inquiry.id)}"><i class="fa-solid fa-trash"></i> Delete</button>` : ""}
        ${!admin ? `<button type="button" class="btn ghost danger-text" data-my-inquiry-delete="${escapeHtml(inquiry.id)}"><i class="fa-solid fa-trash"></i> Delete</button>` : ""}
      </div>`;

    scroll.innerHTML = messages.map(m => {
      const mine = admin ? m.sender_role === "admin" : m.sender_role !== "admin";
      const roleClass = m.sender_role === "admin" ? "from-admin" : (m.sender_role === "guest" ? "from-guest" : "from-user");
      return `
        <div class="chat-bubble-row ${mine ? "mine" : "theirs"}">
          <div class="chat-bubble ${roleClass}">
            <div class="chat-bubble-meta">
              <strong>${escapeHtml(m.sender_label || m.sender_role)}</strong>
              <span>${escapeHtml(formatRelativeTime(m.created_at))}</span>
            </div>
            <div class="chat-bubble-body">${escapeHtml(m.body)}</div>
          </div>
        </div>`;
    }).join("") || `<div class="empty">No messages in this thread.</div>`;

    if (replyBar) {
      replyBar.classList.toggle("hide", !messagesUiState.canReply);
      const note = inquiry.source === "landing" && admin
        ? "Guest request from the login page — you can reply here for internal notes; the guest is not logged in."
        : "";
      let hint = replyBar.querySelector(".messages-reply-hint");
      if (!hint) {
        hint = document.createElement("p");
        hint.className = "messages-reply-hint help";
        replyBar.insertBefore(hint, replyBar.firstChild);
      }
      hint.textContent = note;
      hint.classList.toggle("hide", !note);
    }

    if (!silent || wasNearBottom) {
      scroll.scrollTop = scroll.scrollHeight;
    }
    messagingLiveState.lastThreadSig = [
      inquiryId,
      inquiry.last_message_at || "",
      inquiry.message_count || messages.length || 0,
      inquiry.status || ""
    ].join(":");
    if (admin) refreshAdminCommsBadges().catch(() => {});
  } catch (err) {
    if (!silent) {
      header.innerHTML = `<div class="lock-error show">${escapeHtml(err.message || "Could not open conversation")}</div>`;
    }
  }
}

async function sendInquiryReply(){
  const input = document.getElementById("messagesReplyInput");
  const btn = document.getElementById("messagesReplySendBtn");
  const body = String(input?.value || "").trim();
  if (!messagesUiState.selectedId || !body) return;
  try {
    if (btn) btn.disabled = true;
    await supabaseRpc("app_reply_inquiry", {
      p_inquiry_id: messagesUiState.selectedId,
      p_body: body
    });
    if (input) input.value = "";
    noteMessagingLocalMutation();
    await renderMessagesPanel();
    await openInquiryThread(messagesUiState.selectedId);
  } catch (ex) {
    alert(ex.message || "Could not send reply.");
  } finally {
    if (btn) btn.disabled = false;
  }
}

function bindMessagingUi(){
  const refreshBtn = document.getElementById("messagesRefreshBtn");
  if (refreshBtn) refreshBtn.addEventListener("click", () => renderMessagesPanel());

  const newBtn = document.getElementById("messagesNewBtn");
  if (newBtn) {
    newBtn.addEventListener("click", async () => {
      setMessagesComposerVisible(true);
      await prepareMessagesComposer();
      if (isAppAdminSession()) {
        document.getElementById("messagesUserSelect")?.focus();
      } else {
        document.getElementById("inquirySubject")?.focus();
      }
    });
  }
  document.getElementById("messagesNewCancelBtn")?.addEventListener("click", () => {
    setMessagesComposerVisible(false);
  });

  const submitBtn = document.getElementById("inquirySubmitBtn");
  if (submitBtn) {
    submitBtn.addEventListener("click", async () => {
      const err = document.getElementById("inquiryFormError");
      const subjectEl = document.getElementById("inquirySubject");
      const bodyEl = document.getElementById("inquiryBody");
      const userSelect = document.getElementById("messagesUserSelect");
      if (err) {
        err.textContent = "";
        err.classList.remove("show");
      }
      try {
        submitBtn.disabled = true;
        let created;
        if (isAppAdminSession()) {
          const userId = userSelect?.value || "";
          if (!userId) throw new Error("Please select a user to message.");
          created = await supabaseRpc("app_admin_start_conversation", {
            p_user_id: userId,
            p_subject: subjectEl?.value || "",
            p_body: bodyEl?.value || ""
          });
        } else {
          created = await supabaseRpc("app_submit_inquiry", {
            p_subject: subjectEl?.value || "",
            p_body: bodyEl?.value || ""
          });
        }
        if (subjectEl) subjectEl.value = "";
        if (bodyEl) bodyEl.value = "";
        if (userSelect) userSelect.value = "";
        setMessagesComposerVisible(false);
        messagesUiState.pendingOpenId = created?.id || null;
        noteMessagingLocalMutation();
        await renderMessagesPanel();
      } catch (ex) {
        if (err) {
          err.textContent = ex.message || "Could not send message.";
          err.classList.add("show");
        } else {
          alert(ex.message || "Could not send message.");
        }
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  document.querySelectorAll('input[name="inquiryStatusFilter"]').forEach(radio => {
    radio.addEventListener("change", () => {
      if (isAppAdminSession()) renderMessagesPanel();
    });
  });

  document.getElementById("messagesReplySendBtn")?.addEventListener("click", () => sendInquiryReply());
  document.getElementById("messagesReplyInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendInquiryReply();
    }
  });

  document.getElementById("messagesThreadList")?.addEventListener("click", e => {
    const btn = e.target.closest("[data-open-thread]");
    if (!btn) return;
    openInquiryThread(btn.dataset.openThread);
  });

  window.addEventListener("resize", () => {
    if (!isMessagesMobileLayout()) {
      document.querySelector(".messages-workspace")?.classList.remove("messages-conversation-open");
    } else if (messagesUiState.selectedId
      && !document.getElementById("messagesThreadActive")?.classList.contains("hide")) {
      setMessagesMobileConversationMode(true);
    }
  });

  const markAllBtn = document.getElementById("adminNotifyMarkAllBtn");
  if (markAllBtn) {
    markAllBtn.addEventListener("click", async e => {
      e.stopPropagation();
      try {
        if (isAppAdminSession()) {
          await supabaseRpc("app_admin_mark_all_notifications_read", {}).catch(() => {});
        }
        await supabaseRpc("app_mark_all_my_notifications_read", {}).catch(() => {});
        await loadAdminNotificationsDropdown();
        await refreshAdminCommsBadges();
      } catch (ex) {
        alert(ex.message || "Could not mark notifications as read.");
      }
    });
  }

  ["adminMessagesOpenFullBtn", "adminMessagesGotoBtn"].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();
        goToMessagesTab(null, { compose: false });
      });
    }
  });

  const adminMessagesNewBtn = document.getElementById("adminMessagesNewBtn");
  if (adminMessagesNewBtn) {
    adminMessagesNewBtn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      goToMessagesTab(null, { compose: true });
    });
  }

  const openMessagesMenuBtn = document.getElementById("openMessagesMenuBtn");
  if (openMessagesMenuBtn) {
    openMessagesMenuBtn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      goToMessagesTab(null, { compose: false });
    });
  }

  const trialExpiredMessagesBtn = document.getElementById("trialExpiredMessagesBtn");
  if (trialExpiredMessagesBtn) {
    trialExpiredMessagesBtn.addEventListener("click", e => {
      e.preventDefault();
      goToMessagesTab();
    });
  }

  document.getElementById("adminNotifyList")?.addEventListener("click", async e => {
    const readBtn = e.target.closest("[data-notif-read]");
    const delBtn = e.target.closest("[data-notif-delete]");
    const userBtn = e.target.closest("[data-notif-user]");
    const row = e.target.closest("[data-notification-id]");
    const sourceOf = (el) => String(el?.dataset?.notifSource || row?.dataset?.notifSource || "admin");
    try {
      if (userBtn) {
        e.stopPropagation();
        const userId = userBtn.dataset.notifUser;
        document.querySelectorAll(".menu-dropdown.open").forEach(p => p.classList.remove("open"));
        activate("admin");
        await loadAdminUsers();
        const card = document.querySelector(`.admin-user-card[data-user-id="${CSS.escape ? CSS.escape(userId) : userId}"]`);
        if (card) {
          const details = card.querySelector(".admin-user-details");
          const toggle = card.querySelector("[data-admin-toggle-card]");
          card.classList.add("is-expanded");
          if (details) details.hidden = false;
          if (toggle) toggle.setAttribute("aria-expanded", "true");
          card.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        return;
      }
      if (readBtn) {
        e.stopPropagation();
        const source = sourceOf(readBtn);
        if (source === "user") {
          await supabaseRpc("app_mark_my_notification_read", { p_notification_id: readBtn.dataset.notifRead });
        } else {
          await supabaseRpc("app_admin_mark_notification_read", { p_notification_id: readBtn.dataset.notifRead });
        }
        await loadAdminNotificationsDropdown();
        await refreshAdminCommsBadges();
        return;
      }
      if (delBtn) {
        e.stopPropagation();
        if (!confirm("Delete this notification?")) return;
        const source = sourceOf(delBtn);
        if (source === "user") {
          await supabaseRpc("app_delete_my_notification", { p_notification_id: delBtn.dataset.notifDelete });
        } else {
          await supabaseRpc("app_admin_delete_notification", { p_notification_id: delBtn.dataset.notifDelete });
        }
        await loadAdminNotificationsDropdown();
        await refreshAdminCommsBadges();
        return;
      }
      if (row?.dataset.notificationId) {
        const n = adminCommsState.notifications.find(x => x.id === row.dataset.notificationId);
        const source = sourceOf(row);
        if (n && !n.is_read) {
          if (source === "user") {
            await supabaseRpc("app_mark_my_notification_read", { p_notification_id: n.id });
          } else {
            await supabaseRpc("app_admin_mark_notification_read", { p_notification_id: n.id });
          }
          await refreshAdminCommsBadges();
        }
        if (n?.kind === "inquiry") {
          goToMessagesTab(n.related_inquiry_id || null);
        } else if (n?.kind === "note_reminder" || n?.kind === "installment_due") {
          document.querySelectorAll(".menu-dropdown.open").forEach(p => p.classList.remove("open"));
          // Replay the same centered overlay (and sound) for reminder inbox rows.
          const raw = notificationRowToReminderAlertRaw({ ...n, is_read: false });
          if (raw) {
            const item = normalizeReminderAlertItem(raw);
            const key = reminderAlertDedupeKey(item);
            if (key) noteReminderUiState.toastedReminderIds.delete(key);
            enqueueReminderAlerts([raw]);
          } else if (n.kind === "installment_due") {
            activate("installments");
          } else {
            const payload = n.payload && typeof n.payload === "object" ? n.payload : {};
            const planId = payload.plan_group_id || payload.related_plan_group_id || "";
            if (payload.type === "installment_manual" || (planId && !n.related_note_id && !payload.note_id)) {
              activate("installments");
            } else {
              activate("notes");
            }
          }
        } else if (n?.kind === "trial_signup" || n?.kind === "renewal_request" || n?.kind === "access_expiry_warning" || n?.kind === "access_auto_disabled") {
          document.querySelectorAll(".menu-dropdown.open").forEach(p => p.classList.remove("open"));
          activate("admin");
          if (n.related_user_id) {
            await loadAdminUsers();
            const card = document.querySelector(`.admin-user-card[data-user-id="${CSS.escape ? CSS.escape(n.related_user_id) : n.related_user_id}"]`);
            if (card) {
              const details = card.querySelector(".admin-user-details");
              const toggle = card.querySelector("[data-admin-toggle-card]");
              card.classList.add("is-expanded");
              if (details) details.hidden = false;
              if (toggle) toggle.setAttribute("aria-expanded", "true");
              card.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          }
        }
      }
    } catch (ex) {
      alert(ex.message || "Action failed.");
    }
  });
document.getElementById("adminMessagesPreviewList")?.addEventListener("click", async e => {
    const btn = e.target.closest("[data-preview-inquiry]");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    goToMessagesTab(btn.dataset.previewInquiry);
  });

  document.getElementById("messagesThreadHeader")?.addEventListener("click", async e => {
    const backBtn = e.target.closest("[data-messages-back]");
    const statusBtn = e.target.closest("[data-inquiry-status]");
    const adminDel = e.target.closest("[data-inquiry-delete]");
    const myDel = e.target.closest("[data-my-inquiry-delete]");
    try {
      if (backBtn) {
        e.preventDefault();
        closeMessagesConversationView();
        return;
      }
      if (statusBtn) {
        await supabaseRpc("app_admin_set_inquiry_status", {
          p_inquiry_id: statusBtn.dataset.inquiryStatus,
          p_status: statusBtn.dataset.status
        });
        noteMessagingLocalMutation();
        await renderMessagesPanel();
        return;
      }
      if (adminDel) {
        if (!confirm("Permanently delete this conversation? This cannot be undone.")) return;
        await supabaseRpc("app_admin_delete_inquiry", { p_inquiry_id: adminDel.dataset.inquiryDelete });
        messagesUiState.selectedId = null;
        noteMessagingLocalMutation();
        closeMessagesConversationView();
        await renderMessagesPanel();
        await refreshAdminCommsBadges();
        return;
      }
      if (myDel) {
        if (!confirm("Delete this conversation?")) return;
        await supabaseRpc("app_delete_my_inquiry", { p_inquiry_id: myDel.dataset.myInquiryDelete });
        messagesUiState.selectedId = null;
        noteMessagingLocalMutation();
        closeMessagesConversationView();
        await renderMessagesPanel();
      }
    } catch (ex) {
      alert(ex.message || "Action failed.");
    }
  });
}



function toDatetimeLocalValue(isoOrDate){
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parse datetime-local wall-clock as LOCAL components (not UTC). */
function parseDatetimeLocalInput(value){
  const m = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5], +(m[6]||0), 0);
}

/** Encode local datetime-local as timestamptz string with explicit offset. */
function datetimeLocalInputToTimestamptz(value){
  const d = parseDatetimeLocalInput(value);
  if (!d || Number.isNaN(d.getTime())) return null;
  const offMin = -d.getTimezoneOffset();
  const sign = offMin >= 0 ? "+" : "-";
  const abs = Math.abs(offMin);
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.floor(abs/60))}:${pad(abs%60)}`;
}

function formatNoteReminderWhen(iso){
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function setNoteReminderFormMode(mode){
  const isEdit = mode === "edit";
  const title = document.getElementById("noteReminderTitle");
  const saveBtn = document.getElementById("noteReminderSaveBtn");
  const resetBtn = document.getElementById("noteReminderResetBtn");
  const isInstallment = noteReminderUiState.modalMode === "installment";
  if (title) {
    if (isEdit) title.textContent = "Update reminder";
    else title.textContent = isInstallment ? "Installment reminder" : "Set reminder";
  }
  if (saveBtn) saveBtn.textContent = isEdit ? "Update reminder" : "Save reminder";
  if (resetBtn) resetBtn.hidden = !isEdit;
}

function resetNoteReminderForm(){
  const noteId = noteReminderUiState.modalNoteId
    || document.getElementById("noteReminderNoteId")?.value
    || "";
  const planGroupId = noteReminderUiState.modalPlanGroupId
    || document.getElementById("noteReminderPlanGroupId")?.value
    || "";
  const reminderIdInput = document.getElementById("noteReminderId");
  const atInput = document.getElementById("noteReminderAt");
  const msgInput = document.getElementById("noteReminderMessage");
  if (reminderIdInput) reminderIdInput.value = "";
  if (msgInput) msgInput.value = "";
  if (atInput) atInput.value = toDatetimeLocalValue(new Date(Date.now() + 60 * 60 * 1000));
  const noteIdInput = document.getElementById("noteReminderNoteId");
  if (noteIdInput) noteIdInput.value = noteId || "";
  const planIdInput = document.getElementById("noteReminderPlanGroupId");
  if (planIdInput) planIdInput.value = planGroupId || "";
  setNoteReminderFormMode("new");
}

function fillNoteReminderFormForEdit(reminderId){
  const row = noteReminderUiState.modalPending.find(r => String(r.id) === String(reminderId));
  if (!row) return;
  const reminderIdInput = document.getElementById("noteReminderId");
  const noteIdInput = document.getElementById("noteReminderNoteId");
  const planIdInput = document.getElementById("noteReminderPlanGroupId");
  const atInput = document.getElementById("noteReminderAt");
  const msgInput = document.getElementById("noteReminderMessage");
  if (reminderIdInput) reminderIdInput.value = String(row.id || "");
  if (noteIdInput) noteIdInput.value = String(row.note_id || noteReminderUiState.modalNoteId || "");
  if (planIdInput) {
    planIdInput.value = String(
      row.related_plan_group_id || noteReminderUiState.modalPlanGroupId || ""
    );
  }
  if (atInput) atInput.value = toDatetimeLocalValue(row.remind_at);
  if (msgInput) msgInput.value = String(row.message || "");
  setNoteReminderFormMode("edit");
}

function renderNoteReminderExistingList(items){
  const box = document.getElementById("noteReminderExisting");
  if (!box) return;
  const pending = Array.isArray(items) ? items.filter(r => !r.is_delivered) : [];
  noteReminderUiState.modalPending = pending;
  if (!pending.length) {
    box.innerHTML = "";
    box.classList.add("hide");
    return;
  }
  box.classList.remove("hide");
  box.innerHTML = `
    <div class="note-reminder-existing-head">Pending reminders</div>
    <ul class="note-reminder-existing-list">
      ${pending.map(r => {
        const when = escapeHtml(formatNoteReminderWhen(r.remind_at));
        const msg = String(r.message || "").trim();
        const msgHtml = msg
          ? `<div class="note-reminder-existing-msg">${escapeHtml(msg)}</div>`
          : `<div class="note-reminder-existing-msg is-empty">No message</div>`;
        const id = escapeHtml(String(r.id || ""));
        return `
          <li class="note-reminder-existing-item">
            <div class="note-reminder-existing-meta">
              <div class="note-reminder-existing-when">${when}</div>
              ${msgHtml}
            </div>
            <div class="note-reminder-existing-actions">
              <button type="button" class="btn ghost note-reminder-edit-btn" data-reminder-edit="${id}">Edit</button>
              <button type="button" class="btn ghost note-reminder-delete-btn" data-reminder-delete="${id}">Delete</button>
            </div>
          </li>`;
      }).join("")}
    </ul>`;
}

async function loadNoteReminderExistingList(noteId){
  const box = document.getElementById("noteReminderExisting");
  if (!box || !noteId) return;
  box.classList.remove("hide");
  box.innerHTML = `<div class="note-reminder-existing-loading">Loading reminders…</div>`;
  try {
    const res = await supabaseRpc("app_list_my_note_reminders", { p_note_id: noteId });
    const items = Array.isArray(res?.pending)
      ? res.pending
      : (Array.isArray(res?.items) ? res.items : []);
    renderNoteReminderExistingList(items);
    const byId = new Map(
      (noteReminderUiState.pendingReminders || []).map(r => [String(r.id), r])
    );
    for (const r of pendingItemsForWake(items)) byId.set(String(r.id), r);
    scheduleNoteReminderWake([...byId.values()]);
  } catch (err) {
    box.innerHTML = `<div class="note-reminder-existing-error">${escapeHtml(err.message || "Could not load reminders.")}</div>`;
  }
}

async function loadInstallmentReminderExistingList(planGroupId){
  const box = document.getElementById("noteReminderExisting");
  if (!box || !planGroupId) return;
  box.classList.remove("hide");
  box.innerHTML = `<div class="note-reminder-existing-loading">Loading reminders…</div>`;
  try {
    let items = [];
    try {
      const res = await supabaseRpc("app_list_my_installment_reminders", {
        p_plan_group_id: planGroupId
      });
      items = Array.isArray(res?.pending)
        ? res.pending
        : (Array.isArray(res?.items) ? res.items : []);
    } catch (err) {
      // Fallback before migration 045: filter all pending by preview/plan id.
      const msg = String(err?.message || err || "");
      if (!/Could not find the function|404|PGRST202|installment_reminder/i.test(msg)) throw err;
      const res = await supabaseRpc("app_list_my_note_reminders", {});
      const all = Array.isArray(res?.pending)
        ? res.pending
        : (Array.isArray(res?.items) ? res.items : []);
      items = all.filter(r => {
        if (!r || r.is_delivered) return false;
        const plan = String(r.related_plan_group_id || "").trim();
        if (plan) return plan === String(planGroupId);
        const blob = `${r.note_preview || ""} ${r.message || ""}`;
        return blob.includes(String(planGroupId));
      });
    }
    renderNoteReminderExistingList(items);
    const byId = new Map(
      (noteReminderUiState.pendingReminders || []).map(r => [String(r.id), r])
    );
    for (const r of pendingItemsForWake(items)) byId.set(String(r.id), r);
    scheduleNoteReminderWake([...byId.values()]);
  } catch (err) {
    box.innerHTML = `<div class="note-reminder-existing-error">${escapeHtml(err.message || "Could not load reminders.")}</div>`;
  }
}

function pendingItemsForWake(items){
  return (Array.isArray(items) ? items : []).filter(r => r && !r.is_delivered);
}

function installmentReminderPreviewText(plan){
  const person = String(plan?.person_name || "").trim() || "Installment plan";
  const currency = plan?.currency || "";
  const remaining = Number(plan?.remaining || 0);
  const amount = typeof moneyText === "function" && remaining > 0
    ? moneyText(remaining, currency)
    : "";
  return amount ? `Installment · ${person} · ${amount} left` : `Installment · ${person}`;
}

window.openNoteReminderModal = async function(noteId){
  const note = state.notes.find(n => n.id === noteId);
  if (!note) return;
  if (isGuestMode()) {
    alert("Sign in to save note reminders.");
    return;
  }
  const form = document.getElementById("noteReminderForm");
  const preview = document.getElementById("noteReminderPreview");
  const noteIdInput = document.getElementById("noteReminderNoteId");
  const planIdInput = document.getElementById("noteReminderPlanGroupId");
  const atInput = document.getElementById("noteReminderAt");
  if (!form || !noteIdInput || !atInput) return;
  noteReminderUiState.modalMode = "note";
  noteReminderUiState.modalNoteId = noteId;
  noteReminderUiState.modalPlanGroupId = null;
  noteIdInput.value = noteId;
  if (planIdInput) planIdInput.value = "";
  if (preview) {
    const text = String(note.content || "").trim().replace(/\s+/g, " ");
    preview.textContent = text ? text.slice(0, 120) : "Choose when to be notified about this note.";
  }
  resetNoteReminderForm();
  const modal = document.getElementById("noteReminderModal");
  if (!modal) return;
  modal.classList.remove("hide");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  await loadNoteReminderExistingList(noteId);
};

window.openInstallmentReminderModal = async function(planGroupId){
  const groupId = String(planGroupId || "").trim();
  if (!groupId) return;
  const plan = typeof getInstallmentPlanGroup === "function" ? getInstallmentPlanGroup(groupId) : null;
  if (!plan) {
    alert("Installment plan not found.");
    return;
  }
  if (isGuestMode()) {
    alert("Sign in to save installment reminders.");
    return;
  }
  const form = document.getElementById("noteReminderForm");
  const preview = document.getElementById("noteReminderPreview");
  const noteIdInput = document.getElementById("noteReminderNoteId");
  const planIdInput = document.getElementById("noteReminderPlanGroupId");
  const atInput = document.getElementById("noteReminderAt");
  if (!form || !planIdInput || !atInput) return;
  noteReminderUiState.modalMode = "installment";
  noteReminderUiState.modalNoteId = null;
  noteReminderUiState.modalPlanGroupId = groupId;
  if (noteIdInput) noteIdInput.value = "";
  planIdInput.value = groupId;
  if (preview) {
    preview.textContent = installmentReminderPreviewText(plan);
  }
  resetNoteReminderForm();
  const modal = document.getElementById("noteReminderModal");
  if (!modal) return;
  modal.classList.remove("hide");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  await loadInstallmentReminderExistingList(groupId);
};

async function saveNoteReminder(form){
  const fd = new FormData(form);
  const isInstallment = noteReminderUiState.modalMode === "installment";
  const noteId = String(fd.get("note_id") || noteReminderUiState.modalNoteId || "").trim();
  const planGroupId = String(
    fd.get("plan_group_id") || noteReminderUiState.modalPlanGroupId || ""
  ).trim();
  const reminderId = String(fd.get("reminder_id") || "").trim();
  const remindLocal = String(fd.get("remind_at") || "").trim();
  const message = String(fd.get("message") || "").trim();
  if (isInstallment) {
    if (!planGroupId) throw new Error("Installment plan not found.");
  } else if (!noteId) {
    throw new Error("Note not found.");
  }
  if (!remindLocal) throw new Error("Reminder time is required.");
  // datetime-local is wall-clock local; never use new Date("YYYY-MM-DDTHH:mm") (UTC in Safari).
  const remindAtLocal = parseDatetimeLocalInput(remindLocal);
  const remindAtTz = datetimeLocalInputToTimestamptz(remindLocal);
  if (!remindAtLocal || !remindAtTz || Number.isNaN(remindAtLocal.getTime())) {
    throw new Error("Invalid reminder time.");
  }
  if (remindAtLocal.getTime() <= Date.now()) throw new Error("Reminder time must be in the future.");

  let preview = "";
  if (isInstallment) {
    const plan = typeof getInstallmentPlanGroup === "function" ? getInstallmentPlanGroup(planGroupId) : null;
    preview = installmentReminderPreviewText(plan);
  } else {
    const note = state.notes.find(n => n.id === noteId);
    preview = String(note?.content || "").trim().slice(0, 240);
  }

  if (reminderId) {
    await supabaseRpc("app_update_note_reminder", {
      p_reminder_id: reminderId,
      p_remind_at: remindAtTz,
      p_message: message
    });
  } else if (isInstallment) {
    try {
      await supabaseRpc("app_create_installment_reminder", {
        p_plan_group_id: planGroupId,
        p_remind_at: remindAtTz,
        p_message: message,
        p_note_preview: preview
      });
    } catch (err) {
      const msg = String(err?.message || err || "");
      if (!/Could not find the function|404|PGRST202|installment_reminder/i.test(msg)) throw err;
      // Pre-045 fallback: null note_id + plan id in preview.
      await supabaseRpc("app_create_note_reminder", {
        p_note_id: null,
        p_remind_at: remindAtTz,
        p_message: message || `Installment reminder · ${planGroupId}`,
        p_note_preview: `${preview} · ${planGroupId}`
      });
    }
  } else {
    await supabaseRpc("app_create_note_reminder", {
      p_note_id: noteId,
      p_remind_at: remindAtTz,
      p_message: message,
      p_note_preview: preview
    });
  }
  noteMessagingLocalMutation();
  noteReminderUiState.loadedAt = 0;
  await refreshAdminCommsBadges();
  if (isInstallment) await loadInstallmentReminderExistingList(planGroupId);
  else await loadNoteReminderExistingList(noteId);
  resetNoteReminderForm();
  await ensurePendingNoteReminderMap(true);
  // Schedule wake from the just-saved local time — do not rely only on list RPC timing.
  const justSaved = {
    id: reminderId || `local-${isInstallment ? planGroupId : noteId}-${remindAtLocal.getTime()}`,
    note_id: isInstallment ? null : noteId,
    related_plan_group_id: isInstallment ? planGroupId : null,
    remind_at: remindAtLocal.toISOString() || remindAtTz,
    is_delivered: false,
    message,
    note_preview: preview,
    kind: isInstallment ? "installment_manual" : "note_reminder"
  };
  const byId = new Map(
    (noteReminderUiState.pendingReminders || []).map(r => [String(r.id || `${r.note_id || r.related_plan_group_id}:${r.remind_at}`), r])
  );
  byId.set(String(justSaved.id), justSaved);
  const mergedPending = [...byId.values()];
  noteReminderUiState.pendingReminders = mergedPending;
  if (!isInstallment) noteReminderUiState.pendingNoteIds.add(String(noteId));
  scheduleNoteReminderWake(mergedPending);
  if (!isInstallment) renderNotes(els.searchNotes?.value || "");
  const statusEl = document.getElementById("noteReminderPreview");
  if (statusEl) {
    const whenLabel = formatNoteReminderWhen(remindAtLocal);
    const confirmMsg = reminderId
      ? `Reminder updated. Scheduled for ${whenLabel}.`
      : `Reminder saved. Scheduled for ${whenLabel}.`;
    statusEl.textContent = confirmMsg;
    setTimeout(() => {
      if (statusEl.textContent === confirmMsg) {
        if (isInstallment) {
          const plan = typeof getInstallmentPlanGroup === "function" ? getInstallmentPlanGroup(planGroupId) : null;
          statusEl.textContent = installmentReminderPreviewText(plan);
        } else {
          const note = state.notes.find(n => n.id === noteId);
          statusEl.textContent = String(note?.content || "").trim().replace(/\s+/g, " ").slice(0, 120)
            || "Choose when to be notified about this note.";
        }
      }
    }, 2800);
  }
}

const installmentDueState = { timer: null, inFlight: false, lastRunAt: 0 };

function stopInstallmentDueChecker(){
  if (installmentDueState.timer) {
    clearTimeout(installmentDueState.timer);
    installmentDueState.timer = null;
  }
}

function startInstallmentDueChecker(){
  stopInstallmentDueChecker();
  if (!messagingLiveEligible()) return;
  scheduleInstallmentDueCheck(1200);
}

function scheduleInstallmentDueCheck(delayMs){
  if (installmentDueState.timer) {
    clearTimeout(installmentDueState.timer);
    installmentDueState.timer = null;
  }
  if (!messagingLiveEligible()) return;
  installmentDueState.timer = setTimeout(() => {
    installmentDueState.timer = null;
    runInstallmentDueCheck().finally(() => {
      if (messagingLiveEligible()) scheduleInstallmentDueCheck(5 * 60 * 1000);
    });
  }, Math.max(500, Number(delayMs) || 5000));
}

function daysUntilISODate(dueDate){
  const due = String(dueDate || "").slice(0, 10);
  const today = todayISO();
  if (!due || !today) return null;
  const dueMs = dateStamp(due);
  const todayMs = dateStamp(today);
  if (!Number.isFinite(dueMs) || !Number.isFinite(todayMs)) return null;
  return Math.round((dueMs - todayMs) / 86400000);
}

async function runInstallmentDueCheck(){
  if (!messagingLiveEligible() || document.hidden || installmentDueState.inFlight) return;
  if (Date.now() - installmentDueState.lastRunAt < 20000) return;
  installmentDueState.inFlight = true;
  installmentDueState.lastRunAt = Date.now();
  try {
    try {
      await supabaseRpc("app_dispatch_due_note_reminders", { p_client_now: new Date().toISOString() });
    } catch (_) {
      await supabaseRpc("app_dispatch_due_note_reminders", {}).catch(() => {});
    }
    const plans = typeof getInstallmentPlanGroups === "function" ? getInstallmentPlanGroups() : [];
    const offsets = [5, 3, 0];
    let created = 0;
    const createdAlerts = [];
    for (const plan of plans) {
      const schedule = plan?.schedule;
      if (!schedule?.slots?.length) continue;
      const currency = plan.currency || schedule.currency || "AED";
      for (const slot of schedule.slots) {
        if (!(Number(slot.balance || 0) > 0.00000001)) continue;
        const days = daysUntilISODate(slot.dueDate);
        if (days === null || days < 0) continue;
        if (!offsets.includes(days)) continue;
        const amountLabel = typeof moneyText === "function"
          ? moneyText(slot.balance, currency)
          : `${slot.balance} ${currency}`;
        try {
          const res = await supabaseRpc("app_ensure_installment_due_notice", {
            p_plan_group_id: String(plan.group_id || ""),
            p_slot_index: Number(slot.index),
            p_due_date: String(slot.dueDate).slice(0, 10),
            p_offset_days: days,
            p_person_name: plan.person_name || "",
            p_amount_label: amountLabel,
            p_currency: currency
          });
          if (res?.created) {
            created += 1;
            const whenLabel = days === 0 ? "due today" : days === 3 ? "due in 3 days" : "due in 5 days";
            createdAlerts.push({
              kind: "installment_due",
              title: `Installment ${whenLabel}`,
              person_name: plan.person_name || "",
              plan_group_id: String(plan.group_id || ""),
              slot_index: Number(slot.index),
              due_date: String(slot.dueDate).slice(0, 10),
              offset_days: days,
              amount_label: amountLabel,
              notification_id: res.notification_id || null
            });
          }
        } catch (err) {
          const msg = String(err?.message || err || "");
          if (/ensure_installment_due|Could not find the function|404|PGRST202/i.test(msg)) return;
          console.warn("Installment due notice skipped:", err);
        }
      }
    }
    if (created > 0) {
      noteMessagingLocalMutation();
      await refreshAdminCommsBadges();
      if (isAdminCommsDropdownOpen("admin-notify")) {
        await loadAdminNotificationsDropdown();
      }
      if (createdAlerts.length) enqueueReminderAlerts(createdAlerts);
    }
  } catch (err) {
    console.warn("Installment due check failed:", err);
  } finally {
    installmentDueState.inFlight = false;
  }
}
function bindAdminPanelEvents(){
  const refreshBtn = document.getElementById("adminRefreshUsersBtn");
  const createBtn = document.getElementById("adminCreateUserBtn");
  const storageBtn = document.getElementById("adminStorageMgmtBtn");
  const accountBtn = document.getElementById("accountSettingsBtn");
  const weakPwBtn = els.weakPasswordBannerBtn || document.getElementById("weakPasswordBannerBtn");
  if (refreshBtn) refreshBtn.addEventListener("click", () => loadAdminUsers());
  if (createBtn) createBtn.addEventListener("click", () => openAdminCreateUserModal());
  if (storageBtn) storageBtn.addEventListener("click", () => openAdminStorageManagementModal());
  if (accountBtn) accountBtn.addEventListener("click", () => openAccountSettingsModal());
  document.getElementById("defaultStartPageBtn")?.addEventListener("click", () => {
    document.querySelectorAll(".menu-dropdown.open").forEach(p => p.classList.remove("open"));
    if (typeof openDefaultStartPageModal === "function") openDefaultStartPageModal();
  });
  if (weakPwBtn) {
    weakPwBtn.addEventListener("click", () => openAccountSettingsModal());
  }
  bindAdminBackupEvents();
  if (typeof bindAdminSecurityUi === "function") bindAdminSecurityUi();
}

async function boot(){
  attachEvents();
  bindLandingAnchorScroll();
  bindAdminPanelEvents();
  bindMessagingUi();
  applyPageCurrencySelection(PAGE_CURRENCY_DEFAULT);
  loadTaxSettingsPreferenceFromStorage();
  initFloatingCurrencyBackground();
  defaultDateInputs(document);
  const resumedImport = sessionStorage.getItem(IMPORT_SESSION_KEY) === "1";
  applyEntries(loadBackupEntriesFromStorage(), "backup", { hasImportedFile: resumedImport });
  activate("dashboard");
  setInitialOverviewForExpenses();
  btcBindUI();
  notesBindUI();
  if (typeof assetsBindUI === "function") assetsBindUI();
  if (typeof depreciationAssetsBindUI === "function") depreciationAssetsBindUI();
  applyPermissionGates();
  try { bindNonRememberedSessionUnloadGuard(); } catch (_) {}
  await autoLogin();
  handleUrlHash();
  if (!state.unlocked) initTrialPromoOverlay().catch(() => {});
}

// 14-day free trial promo overlay (landing / sign-in)
function hasStoredSignInDetails(){
  try {
    if (localStorage.getItem(SESSION_ENCRYPTED_STORAGE_KEY)) return true;
  } catch {}
  try {
    if (sessionStorage.getItem(SESSION_USERNAME_KEY)) return true;
  } catch {}
  for (const key of LEGACY_ZIP_STORAGE_KEYS) {
    try {
      if (localStorage.getItem(key)) return true;
    } catch {}
    try {
      if (sessionStorage.getItem(key)) return true;
    } catch {}
  }
  return false;
}

function dismissTrialPromoOverlay(){
  const overlay = document.getElementById("trialPromoOverlay");
  if (!overlay) return;
  overlay.classList.add("hide");
  overlay.setAttribute("aria-hidden", "true");
  try {
    sessionStorage.setItem(TRIAL_PROMO_DISMISS_KEY, "1");
  } catch {}
}

function showTrialPromoOverlay(){
  const overlay = document.getElementById("trialPromoOverlay");
  if (!overlay) return;
  overlay.classList.remove("hide");
  overlay.setAttribute("aria-hidden", "false");
  document.getElementById("trialPromoStartBtn")?.focus();
}

async function initTrialPromoOverlay(){
  const overlay = document.getElementById("trialPromoOverlay");
  if (!overlay) return;

  const dismissors = overlay.querySelectorAll("[data-trial-promo-dismiss]");
  dismissors.forEach(el => {
    el.addEventListener("click", () => dismissTrialPromoOverlay());
  });

  const startBtn = document.getElementById("trialPromoStartBtn");
  if (startBtn) {
    startBtn.addEventListener("click", () => {
      dismissTrialPromoOverlay();
      openTrialSignupModal();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (overlay.classList.contains("hide")) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    dismissTrialPromoOverlay();
  }, true);

  if (state.unlocked) return;
  try {
    if (sessionStorage.getItem(TRIAL_PROMO_DISMISS_KEY) === "1") return;
  } catch {}
  if (hasStoredSignInDetails()) return;
  const credential = await loadEncryptedSessionCredential().catch(() => null);
  if (credential?.username && credential?.sessionToken) return;
  if (state.unlocked || (els.app && !els.app.classList.contains("hide"))) return;
  if (els.lockScreen && els.lockScreen.classList.contains("hide")) return;

  window.setTimeout(() => {
    if (state.unlocked) return;
    if (els.lockScreen && els.lockScreen.classList.contains("hide")) return;
    showTrialPromoOverlay();
  }, 520);
}

// Inquiry Overlay Functionality
function initInquiryOverlay() {
  const sendInquiryBtn = document.getElementById('sendInquiryBtn');
  const inquiryOverlay = document.getElementById('inquiryOverlay');
  const closeInquiryBtn = document.getElementById('closeInquiryBtn');
  const inquiryForm = document.getElementById('inquiryForm');
  const inquirySuccess = document.getElementById('inquirySuccess');
  const inquiryError = document.getElementById('inquiryError');

  // Open inquiry overlay
  if (sendInquiryBtn) {
    sendInquiryBtn.addEventListener('click', () => {
      inquiryOverlay.classList.remove('hide');
      document.body.style.overflow = 'hidden';
    });
  }

  // Close inquiry overlay
  function closeInquiryOverlay() {
    inquiryOverlay.classList.add('hide');
    document.body.style.overflow = '';
    inquiryForm.reset();
    inquirySuccess.classList.add('hide');
    inquiryError.classList.add('hide');
    inquiryForm.classList.remove('submitting');
  }

  if (closeInquiryBtn) {
    closeInquiryBtn.addEventListener('click', closeInquiryOverlay);
  }

  // Close on backdrop click
  inquiryOverlay.addEventListener('click', (e) => {
    if (e.target === inquiryOverlay) {
      closeInquiryOverlay();
    }
  });

  // Close on Escape key — stop so content overlay does not also close in the same keypress
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !inquiryOverlay.classList.contains('hide')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      closeInquiryOverlay();
    }
  }, true);

  // Handle form submission → admin Messages inbox
  if (inquiryForm) {
    inquiryForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      inquiryForm.classList.add('submitting');
      inquirySuccess.classList.add('hide');
      inquiryError.classList.add('hide');
      const errText = document.getElementById('inquiryErrorText');

      try {
        runtimeConfig = getEmbeddedSupabaseConfig();
        await supabaseRpc("app_public_request_access", {
          p_name: document.getElementById('inquiryName')?.value || "",
          p_mobile: document.getElementById('inquiryMobile')?.value || "",
          p_email: document.getElementById('inquiryEmail')?.value || "",
          p_message: document.getElementById('inquiryMessage')?.value || ""
        });
        inquirySuccess.classList.remove('hide');
        inquiryForm.reset();
        setTimeout(() => {
          closeInquiryOverlay();
        }, 2800);
      } catch (error) {
        console.error('Inquiry form submission error:', error);
        if (errText) errText.textContent = error.message || "Failed to send inquiry. Please try again.";
        inquiryError.classList.remove('hide');
      } finally {
        inquiryForm.classList.remove('submitting');
      }
    });
  }
}

// App Download Overlay Functionality
let iosQrCodeInstance = null;
let androidQrCodeInstance = null;

function initAppDownloadOverlay() {
  // Get elements
  const iosDownloadBtn = document.getElementById('iosDownloadBtn');
  const androidDownloadBtn = document.getElementById('androidDownloadBtn');
  const iosDownloadOverlay = document.getElementById('iosDownloadOverlay');
  const androidDownloadOverlay = document.getElementById('androidDownloadOverlay');
  const closeIosDownloadBtn = document.getElementById('closeIosDownloadBtn');
  const closeAndroidDownloadBtn = document.getElementById('closeAndroidDownloadBtn');

  if (!iosDownloadBtn || !androidDownloadBtn || !iosDownloadOverlay || !androidDownloadOverlay) {
    console.warn('App download elements not found');
    return;
  }

  // iOS download button click handler
  iosDownloadBtn.addEventListener('click', () => {
    showIosDownloadOverlay();
  });

  // Android download button click handler
  androidDownloadBtn.addEventListener('click', () => {
    showAndroidDownloadOverlay();
  });

  // Close button handlers
  closeIosDownloadBtn.addEventListener('click', hideIosDownloadOverlay);
  closeAndroidDownloadBtn.addEventListener('click', hideAndroidDownloadOverlay);

  // Close on overlay background click
  iosDownloadOverlay.addEventListener('click', (e) => {
    if (e.target === iosDownloadOverlay) {
      hideIosDownloadOverlay();
    }
  });

  androidDownloadOverlay.addEventListener('click', (e) => {
    if (e.target === androidDownloadOverlay) {
      hideAndroidDownloadOverlay();
    }
  });

  // Close on Escape key (download overlays sit above content overlay)
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const iosOpen = iosDownloadOverlay && !iosDownloadOverlay.classList.contains('hide');
    const androidOpen = androidDownloadOverlay && !androidDownloadOverlay.classList.contains('hide');
    if (!iosOpen && !androidOpen) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (iosOpen) hideIosDownloadOverlay();
    if (androidOpen) hideAndroidDownloadOverlay();
  }, true);
}

function showIosDownloadOverlay() {
  const overlay = document.getElementById('iosDownloadOverlay');
  const qrContainer = document.getElementById('iosQrCode');
  
  if (!overlay || !qrContainer) return;

  // Show overlay
  overlay.classList.remove('hide');
  
  // Generate QR code if not already generated
  if (!iosQrCodeInstance) {
    const iosUrl = 'https://triplem.vip/Assets/mobile_app/iOS/Triple_M_by_NSF.mobileconfig';
    qrContainer.innerHTML = ''; // Clear existing content
    
    try {
      iosQrCodeInstance = new QRCode(qrContainer, {
        text: iosUrl,
        width: 90,
        height: 90,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
      });
    } catch (error) {
      console.error('Failed to generate iOS QR code:', error);
      qrContainer.innerHTML = '<p style="color: var(--danger); font-size: 0.65rem;">Failed to generate QR code</p>';
    }
  }
}

function showAndroidDownloadOverlay() {
  const overlay = document.getElementById('androidDownloadOverlay');
  const qrContainer = document.getElementById('androidQrCode');
  
  if (!overlay || !qrContainer) return;

  // Show overlay
  overlay.classList.remove('hide');
  
  // Generate QR code if not already generated
  if (!androidQrCodeInstance) {
    const androidUrl = 'https://triplem.vip/Assets/mobile_app/Android/Triple_M_by_NSF.apk';
    qrContainer.innerHTML = ''; // Clear existing content
    
    try {
      androidQrCodeInstance = new QRCode(qrContainer, {
        text: androidUrl,
        width: 90,
        height: 90,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
      });
    } catch (error) {
      console.error('Failed to generate Android QR code:', error);
      qrContainer.innerHTML = '<p style="color: var(--danger); font-size: 0.65rem;">Failed to generate QR code</p>';
    }
  }
}

function hideIosDownloadOverlay() {
  const overlay = document.getElementById('iosDownloadOverlay');
  if (overlay) {
    overlay.classList.add('hide');
  }
}

function hideAndroidDownloadOverlay() {
  const overlay = document.getElementById('androidDownloadOverlay');
  if (overlay) {
    overlay.classList.add('hide');
  }
}
