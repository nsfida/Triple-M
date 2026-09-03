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
  lastNoteReminderDispatchAt: 0,
  lastSubscriptionProfileRefreshKey: ""
};

const MESSAGING_LIVE_POLL_MS = 900;
const MESSAGING_LIVE_POLL_ACTIVE_MS = 550;
const NOTE_REMINDER_DISPATCH_THROTTLE_MS = 5000;

const MESSAGE_FLOAT_MAX_HEADS = 8;
const MESSAGE_FLOAT_PEEK_MS = 4600;
const MESSAGE_FLOAT_POSITION_KEY = "triplem_message_float_position_v4";
const MESSAGE_FLOAT_HEAD_POSITIONS_KEY = "triplem_message_float_head_positions_v1";
const MESSAGE_FLOAT_VISIBILITY_KEY = "triplem_message_float_visibility_v3";
const MESSAGE_HISTORY_CACHE_KEY = "triplem_message_history_cache_v1";
const MESSAGE_HISTORY_CACHE_MAX_THREADS = 36;
const MESSAGE_HISTORY_CACHE_MAX_MESSAGES = 360;
const MESSAGE_FLOAT_DISMISS_RADIUS = 82;

const LIVE_CHAT_QUICK_REPLIES = Object.freeze([
  { key: "monthly", icon: "fa-calendar-check", label: "Pro Monthly plan", hint: "Price, full access & 30 days free", text: "Pro Monthly provides full Triplem VIP access for one month. Current base pricing is AED 49, SAR 49, PKR 1,799, or USD 13.99. Your first approved Pro Monthly subscription currently includes an additional 30 days free. Company team-member charges are calculated separately in the selected billing currency." },
  { key: "yearly", icon: "fa-calendar-days", label: "Pro Yearly plan", hint: "Annual price, full access & 60 days free", text: "Pro Yearly provides full Triplem VIP access for 12 months. Current base pricing is AED 449, SAR 449, PKR 19,999, or USD 149. Your first approved Pro Yearly subscription currently includes an additional 60 days free. Company team-member charges are calculated separately in the selected billing currency." },
  { key: "trial", icon: "fa-gift", label: "14-Day Free trial", hint: "What is included and how to upgrade", text: "Triplem VIP includes a 14-day free trial so you can explore the workspace before choosing a paid plan. During the trial you can use the available Triplem VIP workspace normally and upgrade from Plan & Subscription whenever you are ready." },
  { key: "payment", icon: "fa-building-columns", label: "Bank transfer payment", hint: "How to pay and upload a receipt", text: "Pro subscriptions are currently activated through bank transfer. Choose Monthly or Yearly in Plan & Subscription, select the available bank account, complete the transfer and upload your receipt. Your request is recorded immediately and remains pending until the payment is verified." },
  { key: "approval", icon: "fa-circle-check", label: "Payment approval process", hint: "Pending, approved and declined requests", text: "After you submit a Pro payment receipt, Triplem VIP records the request immediately. Once the payment is verified, your subscription is approved and you receive an in-app confirmation with the activated plan and expiry. If verification is unsuccessful, you also receive a clear status notification." },
  { key: "team", icon: "fa-people-group", label: "Company team pricing", hint: "Team-member billing and account control", text: "Company accounts can add paid team access. Team-member pricing is calculated automatically according to the selected Monthly or Yearly billing period and billing currency, and the main company account remains responsible for subscription management." },
  { key: "security", icon: "fa-shield-halved", label: "Security & privacy", hint: "Data isolation and account protection", text: "Triplem VIP uses per-user data isolation, protected server-side access controls, secure session handling, Smart PIN protection, administrative security gates and privacy-focused account boundaries. Workspace data is separated between users and sensitive operations are validated server-side." },
  { key: "features", icon: "fa-layer-group", label: "Triplem VIP features", hint: "Complete workspace overview", text: "Triplem VIP combines expenses, wallets, transaction history, inventory, loans, installments, assets, notes, reports, reminders, messaging, Bitcoin tools and configurable business workflows in one private workspace." },
  { key: "expenses", icon: "fa-wallet", label: "Expenses & wallets", hint: "Transactions, search, currencies and reports", text: "The Expenses workspace supports wallets, categorized transactions, searchable history, notes, multiple currencies, summaries and detailed reports so personal or business spending can be managed from one place." },
  { key: "inventory", icon: "fa-boxes-stacked", label: "Inventory & sales", hint: "Stock, customers, scanning and records", text: "Inventory tools help manage items, stock, customers, sales workflows, scanning and business records while keeping the experience connected to the wider Triplem VIP workspace." },
  { key: "reports", icon: "fa-chart-column", label: "Reports & exports", hint: "Structured summaries and export-ready data", text: "Triplem VIP can prepare detailed workspace reports and export-ready records for supported sections, helping you review activity, balances and business information in a structured format." },
  { key: "company", icon: "fa-building", label: "Company & branding", hint: "TRN, logo, currencies and team workspace", text: "Company accounts can add company name, TRN, address, logo, preferred currencies and optional team access. Team members work under the company workspace while plan and access management remain controlled by the main company account." },
  { key: "hours", icon: "fa-clock", label: "Live Support hours", hint: "10:00 AM to 5:00 PM GST", text: "Triplem VIP Live Chat Support operates from 10:00 AM to 5:00 PM Gulf Standard Time. Messages received outside those hours are retained so the support team can continue assisting during the next support period." }
]);

function liveChatQuickRepliesHtml(contextId = "main") {
  const cid = escapeHtml(String(contextId));
  return `<div class="live-chat-quick-replies" data-live-quick-context="${cid}">
    <button type="button" class="live-chat-quick-trigger" data-live-quick-toggle aria-expanded="false" title="Quick replies" aria-label="Open quick replies"><i class="fa-solid fa-bolt"></i><span>Quick reply</span></button>
    <div class="live-chat-quick-menu hide" data-live-quick-menu role="menu" aria-label="Quick replies">
      <div class="live-chat-quick-menu-head"><strong>Support quick replies</strong><small>Choose a topic to send the prepared answer instantly</small></div>
      <div class="live-chat-quick-list">${LIVE_CHAT_QUICK_REPLIES.map(item => `<button type="button" class="live-chat-quick-item" data-live-quick-reply="${escapeHtml(item.key)}" role="menuitem" title="${escapeHtml(item.hint || item.label)}"><i class="fa-solid ${escapeHtml(item.icon || "fa-bolt")}"></i><span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.hint || "Prepared support response")}</small></span></button>`).join("")}</div>
    </div>
  </div>`;
}

function closeLiveChatQuickMenus(except = null) {
  document.querySelectorAll("[data-live-quick-menu]:not(.hide)").forEach(menu => {
    if (except && menu === except) return;
    menu.classList.add("hide");
    const wrap = menu.closest(".live-chat-quick-replies");
    wrap?.querySelector("[data-live-quick-toggle]")?.setAttribute("aria-expanded", "false");
  });
}

function toggleLiveChatQuickMenu(toggle) {
  const wrap = toggle?.closest(".live-chat-quick-replies");
  const menu = wrap?.querySelector("[data-live-quick-menu]");
  if (!menu) return;
  const opening = menu.classList.contains("hide");
  closeLiveChatQuickMenus(opening ? menu : null);
  menu.classList.toggle("hide", !opening);
  toggle.setAttribute("aria-expanded", opening ? "true" : "false");
  if (opening) menu.querySelector("[data-live-quick-reply]")?.focus({ preventScroll: true });
}

function liveChatQuickReplyText(key) {
  return LIVE_CHAT_QUICK_REPLIES.find(item => item.key === String(key || ""))?.text || "";
}

const liveChatOfferState = { signature: "", pendingIds: new Set(), busyIds: new Set(), dismissedKeys: new Set(), initialized: false };

const LIVE_CHAT_NOTIFICATION_SOUND_URL = "Assets/sounds/live_notification.opus?v=20260903-livechat117";
const LIVE_CHAT_REALTIME_TOPIC = "realtime:triplem-live-chat-agent-events-v1";
const LIVE_CHAT_REALTIME_EVENT_RESOLVED = "offer_resolved";
const LIVE_CHAT_REALTIME_EVENT_AVAILABLE = "offer_available";

const liveChatNotificationState = {
  audio: null,
  shouldPlay: false,
  playing: false,
  unlocked: false,
  unlockBound: false,
  audioErrorLogged: false,
  offerInquiryIds: new Set(),
  realtime: {
    socket: null,
    joined: false,
    joinRef: null,
    ref: 0,
    heartbeatTimer: null,
    reconnectTimer: null,
    reconnectAttempt: 0,
    stopping: false
  }
};

function liveChatNotificationAudio(){
  if (liveChatNotificationState.audio) return liveChatNotificationState.audio;
  const audio = new Audio(LIVE_CHAT_NOTIFICATION_SOUND_URL);
  audio.loop = true;
  audio.preload = "auto";
  audio.playsInline = true;
  audio.setAttribute("playsinline", "");
  audio.addEventListener("play", () => {
    liveChatNotificationState.playing = true;
  });
  audio.addEventListener("pause", () => {
    liveChatNotificationState.playing = false;
  });
  audio.addEventListener("error", () => {
    liveChatNotificationState.playing = false;
    if (!liveChatNotificationState.audioErrorLogged) {
      liveChatNotificationState.audioErrorLogged = true;
      console.warn(`Live Chat notification sound could not be loaded from ${LIVE_CHAT_NOTIFICATION_SOUND_URL}.`);
    }
  });
  liveChatNotificationState.audio = audio;
  return audio;
}

async function primeLiveChatNotificationAudio(){
  if (liveChatNotificationState.unlocked) return;
  const audio = liveChatNotificationAudio();
  try {
    if (liveChatNotificationState.shouldPlay) {
      audio.muted = false;
      await audio.play();
      liveChatNotificationState.unlocked = true;
      return;
    }
    audio.muted = true;
    await audio.play();
    audio.pause();
    try { audio.currentTime = 0; } catch (_) {}
    audio.muted = false;
    liveChatNotificationState.unlocked = true;
  } catch (_) {
    audio.muted = false;
  }
}

function bindLiveChatNotificationAudioUnlock(){
  if (liveChatNotificationState.unlockBound) return;
  liveChatNotificationState.unlockBound = true;
  const unlock = () => {
    primeLiveChatNotificationAudio().finally(() => {
      if (!liveChatNotificationState.unlocked) return;
      document.removeEventListener("pointerdown", unlock, true);
      document.removeEventListener("touchstart", unlock, true);
      document.removeEventListener("keydown", unlock, true);
    });
  };
  document.addEventListener("pointerdown", unlock, { capture: true, passive: true });
  document.addEventListener("touchstart", unlock, { capture: true, passive: true });
  document.addEventListener("keydown", unlock, true);
}

function startLiveChatNotificationSound(){
  liveChatNotificationState.shouldPlay = true;
  const audio = liveChatNotificationAudio();
  if (!audio.paused && !audio.ended) return;
  try { audio.currentTime = 0; } catch (_) {}
  audio.muted = false;
  const playResult = audio.play();
  if (playResult && typeof playResult.catch === "function") {
    playResult.then(() => {
      liveChatNotificationState.unlocked = true;
      liveChatNotificationState.playing = true;
    }).catch(() => {
      // Browser autoplay rules may block media before the first user gesture.
      // The capture listeners above will immediately start it on the next interaction.
      liveChatNotificationState.playing = false;
    });
  }
}

function stopLiveChatNotificationSound(){
  liveChatNotificationState.shouldPlay = false;
  const audio = liveChatNotificationState.audio;
  if (!audio) return;
  try {
    audio.pause();
    audio.currentTime = 0;
  } catch (_) {}
  liveChatNotificationState.playing = false;
}

function syncLiveChatNotificationSound(pendingOffers){
  const ids = new Set();
  (Array.isArray(pendingOffers) ? pendingOffers : []).forEach(item => {
    const inquiryId = String(notificationPayloadObject(item).inquiry_id || "").trim();
    if (inquiryId) ids.add(inquiryId);
  });
  liveChatNotificationState.offerInquiryIds = ids;
  if (ids.size) startLiveChatNotificationSound();
  else stopLiveChatNotificationSound();
}

function silenceLiveChatOfferInquiryImmediately(inquiryId, { dismissUi = false } = {}){
  const id = String(inquiryId || "").trim();
  if (!id) return;
  liveChatNotificationState.offerInquiryIds.delete(id);
  if (dismissUi) {
    const dock = ensureLiveChatOfferDock();
    dock.querySelectorAll("[data-live-offer-key]").forEach(card => {
      const belongsToInquiry = Array.from(card.querySelectorAll("[data-live-offer-inquiry]")).some(action => String(action.dataset.liveOfferInquiry || "") === id);
      if (belongsToInquiry) card.remove();
    });
    if (!dock.querySelector("[data-live-offer-key]")) dock.classList.add("hide");
    liveChatOfferState.signature = "";
  }
  if (!liveChatNotificationState.offerInquiryIds.size) stopLiveChatNotificationSound();
}

function nextLiveChatRealtimeRef(){
  liveChatNotificationState.realtime.ref += 1;
  return String(liveChatNotificationState.realtime.ref);
}

function liveChatRealtimeSend(event, payload, topic = LIVE_CHAT_REALTIME_TOPIC){
  const rt = liveChatNotificationState.realtime;
  const ws = rt.socket;
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  const ref = nextLiveChatRealtimeRef();
  ws.send(JSON.stringify({
    topic,
    event,
    payload: payload || {},
    ref,
    join_ref: topic === "phoenix" ? null : rt.joinRef
  }));
  return true;
}

function scheduleLiveChatRealtimeReconnect(){
  const rt = liveChatNotificationState.realtime;
  if (rt.stopping || !messagingLiveEligible() || rt.reconnectTimer) return;
  const wait = Math.min(8000, 700 + (rt.reconnectAttempt * 650));
  rt.reconnectAttempt += 1;
  rt.reconnectTimer = setTimeout(() => {
    rt.reconnectTimer = null;
    startLiveChatRealtimeBridge();
  }, wait);
}

async function reconcileLiveChatOffersFromRealtime(targetInquiryId = "") {
  if (!messagingLiveEligible()) return;
  const id = String(targetInquiryId || "").trim();
  try {
    const direct = await fetchDirectLiveChatOffers();
    if (direct?.available) {
      const items = Array.isArray(direct.items) ? direct.items : [];
      syncLiveChatOfferDock(items);
      // A public broadcast is only a wake-up hint. Audio/UI start solely when
      // the authenticated routing RPC confirms a genuinely actionable offer.
      if (id && !items.some(item => String(notificationPayloadObject(item).inquiry_id || "") === id)) {
        silenceLiveChatOfferInquiryImmediately(id, { dismissUi: true });
      }
    } else {
      await refreshAdminCommsBadges();
    }
  } catch (err) {
    console.warn("Live Chat realtime offer reconciliation failed:", err);
  }
}

function closeResolvedLiveChatAssignmentModal(inquiryId){
  const id = String(inquiryId || "").trim();
  const modal = document.getElementById("liveChatAssignmentModal");
  if (!id || !modal || String(modal.dataset.liveAssignmentInquiry || "") !== id) return;
  modal.classList.add("hide");
  modal.setAttribute("aria-hidden", "true");
}

function handleLiveChatRealtimeBroadcast(payload){
  const eventName = String(payload?.event || "");
  const data = payload?.payload && typeof payload.payload === "object" ? payload.payload : {};
  const inquiryId = String(data.inquiry_id || "").trim();
  if (!inquiryId) return;

  if (eventName === LIVE_CHAT_REALTIME_EVENT_AVAILABLE) {
    // Browsers heavily throttle hidden-tab timers. Realtime WebSocket events are
    // independent of the polling timer, so a minimized Agent page can wake and
    // verify the new invitation immediately.
    reconcileLiveChatOffersFromRealtime(inquiryId).then(() => {
      refreshAdminCommsBadges().catch(() => {});
    });
    return;
  }
  if (eventName !== LIVE_CHAT_REALTIME_EVENT_RESOLVED) return;

  // Stop/dismiss immediately, then refresh authoritative state.
  silenceLiveChatOfferInquiryImmediately(inquiryId, { dismissUi: true });
  closeResolvedLiveChatAssignmentModal(inquiryId);
  refreshAdminCommsBadges().catch(() => {});
  if (isAdminCommsDropdownOpen("admin-notify")) loadAdminNotificationsDropdown().catch(() => {});
}

function stopLiveChatRealtimeBridge(){
  const rt = liveChatNotificationState.realtime;
  rt.stopping = true;
  rt.joined = false;
  rt.joinRef = null;
  if (rt.reconnectTimer) { clearTimeout(rt.reconnectTimer); rt.reconnectTimer = null; }
  if (rt.heartbeatTimer) { clearInterval(rt.heartbeatTimer); rt.heartbeatTimer = null; }
  const ws = rt.socket;
  rt.socket = null;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    try { ws.close(1000, "Messaging sync stopped"); } catch (_) {}
  }
}

function startLiveChatRealtimeBridge(){
  if (!messagingLiveEligible() || typeof WebSocket === "undefined") return;
  const rt = liveChatNotificationState.realtime;
  if (rt.socket && (rt.socket.readyState === WebSocket.OPEN || rt.socket.readyState === WebSocket.CONNECTING)) return;
  if (rt.reconnectTimer) { clearTimeout(rt.reconnectTimer); rt.reconnectTimer = null; }
  rt.stopping = false;

  let config;
  try { config = getSupabaseConfig(); } catch (_) { return; }
  const wsUrl = String(config.supabaseUrl || "").replace(/^http/i, "ws") + `/realtime/v1/websocket?apikey=${encodeURIComponent(config.supabaseKey)}&vsn=1.0.0`;
  let ws;
  try { ws = new WebSocket(wsUrl); } catch (_) { scheduleLiveChatRealtimeReconnect(); return; }
  rt.socket = ws;
  rt.joined = false;
  rt.joinRef = null;

  ws.addEventListener("open", () => {
    if (rt.socket !== ws) return;
    const joinRef = nextLiveChatRealtimeRef();
    rt.joinRef = joinRef;
    ws.send(JSON.stringify({
      topic: LIVE_CHAT_REALTIME_TOPIC,
      event: "phx_join",
      payload: {
        config: {
          broadcast: { ack: false, self: false },
          presence: { enabled: false },
          private: false
        }
      },
      ref: joinRef,
      join_ref: joinRef
    }));
    rt.heartbeatTimer = setInterval(() => {
      liveChatRealtimeSend("heartbeat", {}, "phoenix");
    }, 25000);
  });

  ws.addEventListener("message", event => {
    if (rt.socket !== ws) return;
    let msg;
    try { msg = JSON.parse(String(event.data || "")); } catch (_) { return; }
    if (!msg || typeof msg !== "object" || Array.isArray(msg)) return;
    if (msg.event === "phx_reply" && String(msg.ref || "") === String(rt.joinRef || "")) {
      rt.joined = String(msg.payload?.status || "").toLowerCase() === "ok";
      if (rt.joined) {
        rt.reconnectAttempt = 0;
        // Catch an invitation that arrived while the socket/browser was suspended.
        reconcileLiveChatOffersFromRealtime().catch(() => {});
      }
      return;
    }
    if (msg.topic === LIVE_CHAT_REALTIME_TOPIC && msg.event === "broadcast") {
      handleLiveChatRealtimeBroadcast(msg.payload || {});
    }
  });

  ws.addEventListener("close", () => {
    if (rt.socket === ws) rt.socket = null;
    rt.joined = false;
    rt.joinRef = null;
    if (rt.heartbeatTimer) { clearInterval(rt.heartbeatTimer); rt.heartbeatTimer = null; }
    scheduleLiveChatRealtimeReconnect();
  });

  ws.addEventListener("error", () => {
    try { ws.close(); } catch (_) {}
  });
}

function broadcastLiveChatOfferResolved(inquiryId){
  const id = String(inquiryId || "").trim();
  if (!id || !liveChatNotificationState.realtime.joined) return false;
  return liveChatRealtimeSend("broadcast", {
    type: "broadcast",
    event: LIVE_CHAT_REALTIME_EVENT_RESOLVED,
    payload: { inquiry_id: id, resolved_at: new Date().toISOString() }
  });
}

bindLiveChatNotificationAudioUnlock();

function liveChatOfferKey(item){
  const p = notificationPayloadObject(item);
  return `${String(p.type || "").toLowerCase()}|${p.inquiry_id || ""}|${p.transfer_id || ""}`;
}

function dismissLiveChatOfferLocally(key){
  const k = String(key || "");
  if (!k) return;
  liveChatOfferState.dismissedKeys.add(k);
  liveChatOfferState.signature = "";
  const dock = ensureLiveChatOfferDock();
  dock.querySelectorAll(`[data-live-offer-key]`).forEach(card => {
    if (String(card.dataset.liveOfferKey || "") === k) card.remove();
  });
  if (!dock.querySelector("[data-live-offer-key]")) dock.classList.add("hide");
}

async function openAcceptedLiveChatImmediately(inquiryId, accepted = {}){
  const id = String(inquiryId || "");
  if (!id) return null;
  const currentId = String(state?.sessionUser?.id || state?.sessionUser?.user_id || "");
  let thread = accepted?.inquiry ? {
    ...accepted.inquiry,
    source: accepted.inquiry.source || "landing",
    subject: accepted.inquiry.subject || "Live Chat Support",
    support_assignment_status: "accepted",
    support_assigned_to: accepted.inquiry.support_assigned_to || currentId
  } : null;

  if (thread) revealFloatingThread(thread, { open: true, focus: true, forceDatabase: false });

  try {
    const full = unwrapRpcJson(await supabaseRpc("app_get_inquiry_thread", { p_inquiry_id: id })) || {};
    if (full.inquiry) {
      thread = { ...(thread || {}), ...full.inquiry, support_assignment_status: "accepted", support_assigned_to: full.inquiry.support_assigned_to || currentId };
      cacheThreadResult(id, { ...full, inquiry: thread }, thread);
      revealFloatingThread(thread, { open: true, focus: true, forceDatabase: false });
    }
  } catch (err) {
    console.warn("Accepted Live Chat history could not be prefetched:", err);
  }

  try {
    const listed = await fetchPersonalMessageThreads(300, null);
    const merged = Array.isArray(listed) ? listed.slice() : [];
    if (thread && !merged.some(item => String(item.id) === id)) merged.unshift(thread);
    syncFloatingMessageBubbles(merged);
  } catch (err) {
    console.warn("Accepted Live Chat list refresh failed:", err);
  }

  if (thread) revealFloatingThread(thread, { open: true, focus: true, forceDatabase: false });
  clearFloatingPeek();
  return thread;
}

function ensureLiveChatOfferDock(){
  let dock = document.getElementById("liveChatOfferDock");
  if (dock) return dock;
  dock = document.createElement("aside");
  dock.id = "liveChatOfferDock";
  dock.className = "live-support-offer-dock hide";
  dock.setAttribute("aria-live", "polite");
  document.body.appendChild(dock);
  dock.addEventListener("click", async e => {
    const dismiss = e.target.closest("[data-live-offer-dismiss]");
    if (dismiss) {
      e.preventDefault();
      e.stopPropagation();
      dismissLiveChatOfferLocally(dismiss.dataset.liveOfferDismiss);
      return;
    }
    const action = e.target.closest("[data-live-offer-action]");
    if (!action) return;
    e.preventDefault();
    const inquiryId = String(action.dataset.liveOfferInquiry || "");
    const kind = String(action.dataset.liveOfferKind || "assignment");
    const mode = String(action.dataset.liveOfferAction || "");
    const offerKey = String(action.closest("[data-live-offer-key]")?.dataset.liveOfferKey || "");
    if (!inquiryId || !mode || liveChatOfferState.busyIds.has(inquiryId)) return;
    liveChatOfferState.busyIds.add(inquiryId);
    dock.querySelectorAll(`[data-live-offer-inquiry="${inquiryId}"]`).forEach(btn => btn.disabled = true);
    try {
      if (mode === "accept") {
        // Stop this invitation sound at the click itself. If the authoritative
        // accept fails, the catch refresh below restores the pending offer/sound.
        silenceLiveChatOfferInquiryImmediately(inquiryId);
        const rpc = kind === "transfer" ? "app_live_chat_accept_transfer" : "app_live_chat_accept_assignment";
        const accepted = unwrapRpcJson(await supabaseRpc(rpc, { p_inquiry_id: inquiryId })) || {};
        broadcastLiveChatOfferResolved(inquiryId);
        if (offerKey) liveChatOfferState.dismissedKeys.add(offerKey);
        dismissLiveChatOfferLocally(offerKey);
        if (typeof showEntryConfirmation === "function") showEntryConfirmation(kind === "transfer" ? "Live Chat transfer accepted." : "Live Chat accepted.", "success", { duration: 2600 });
        noteMessagingLocalMutation();

        await openAcceptedLiveChatImmediately(inquiryId, accepted);
        if (getActiveTabKey() === "messages") renderMessagesPanel({ silent: true }).catch(() => {});
      } else {
        const rpc = kind === "transfer" ? "app_live_chat_decline_transfer" : "app_live_chat_decline_assignment";
        await supabaseRpc(rpc, { p_inquiry_id: inquiryId });
        silenceLiveChatOfferInquiryImmediately(inquiryId);
        if (offerKey) liveChatOfferState.dismissedKeys.add(offerKey);
        dismissLiveChatOfferLocally(offerKey);
        if (typeof showEntryConfirmation === "function") showEntryConfirmation(kind === "transfer" ? "Transfer declined. The previous representative keeps the chat." : "Live Chat declined. It remains available to other support agents.", "success", { duration: 2800 });
        noteMessagingLocalMutation();
      }
      await refreshAdminCommsBadges();
      if (isAdminCommsDropdownOpen("admin-notify")) loadAdminNotificationsDropdown().catch(() => {});
    } catch (err) {
      if (typeof showEntryConfirmation === "function") showEntryConfirmation(err.message || "This Live Chat is no longer available.", "error", { duration: 3200 });
      // Restore authoritative state immediately when an optimistic accept/decline fails.
      await refreshAdminCommsBadges().catch(() => {});
    } finally {
      liveChatOfferState.busyIds.delete(inquiryId);
    }
  });
  return dock;
}

function syncLiveChatOfferDock(notificationRows){
  const dock = ensureLiveChatOfferDock();
  if (!messagingLiveEligible()) {
    dock.classList.add("hide"); dock.replaceChildren(); liveChatOfferState.pendingIds.clear(); liveChatOfferState.signature = "";
    liveChatNotificationState.offerInquiryIds.clear();
    stopLiveChatNotificationSound();
    return;
  }
  const rows = (Array.isArray(notificationRows) ? notificationRows : []).filter(isLiveChatOfferNotification);
  const allPending = rows.filter(n => String(notificationPayloadObject(n).assignment_status || "pending").toLowerCase() === "pending");
  syncLiveChatNotificationSound(allPending);
  const activeKeys = new Set(allPending.map(liveChatOfferKey));
  Array.from(liveChatOfferState.dismissedKeys).forEach(key => { if (!activeKeys.has(key)) liveChatOfferState.dismissedKeys.delete(key); });
  const pending = allPending.filter(n => !liveChatOfferState.dismissedKeys.has(liveChatOfferKey(n)));
  const nextIds = new Set(allPending.map(n => String(n.id || "")));
  if (liveChatOfferState.initialized) rows.forEach(n => {
    const id = String(n.id || ""); const payload = notificationPayloadObject(n); const status = String(payload.assignment_status || "").toLowerCase();
    if (id && liveChatOfferState.pendingIds.has(id) && status === "taken" && payload.accepted_by_name && typeof showEntryConfirmation === "function") showEntryConfirmation(`${payload.accepted_by_name} accepted this Live Chat.`, "success", { duration: 3200 });
  });
  liveChatOfferState.pendingIds = nextIds; liveChatOfferState.initialized = true;
  const signature = pending.map(n => { const p = notificationPayloadObject(n); return [n.id,p.type,p.inquiry_id,p.transfer_id,p.message,p.from_agent_name].join("|"); }).join("||");
  if (signature === liveChatOfferState.signature) return;
  liveChatOfferState.signature = signature;
  if (!pending.length) { dock.classList.add("hide"); dock.replaceChildren(); return; }
  dock.innerHTML = pending.slice(0,4).map(n => {
    const p = notificationPayloadObject(n); const transfer = isLiveChatTransferNotification(n); const name = p.guest_name || "Landing visitor"; const preview = p.message || n.body || "A visitor is waiting for support."; const context = transfer ? `Transfer from ${p.from_agent_name || "another representative"}` : "New Live Chat";
    const key = liveChatOfferKey(n);
    return `<section class="live-support-offer-card" data-live-offer-key="${escapeHtml(key)}"><button type="button" class="live-support-offer-close" data-live-offer-dismiss="${escapeHtml(key)}" aria-label="Dismiss this Live Chat popup" title="Close popup"><i class="fa-solid fa-xmark"></i></button><div class="live-support-offer-icon"><i class="fa-solid ${transfer ? "fa-right-left" : "fa-headset"}"></i></div><div class="live-support-offer-copy"><div class="live-support-offer-top"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(context)}</span></div><p>${escapeHtml(String(preview).slice(0,180))}</p><div class="live-support-offer-actions"><button type="button" class="btn ghost tiny danger-text" data-live-offer-action="decline" data-live-offer-kind="${transfer ? "transfer" : "assignment"}" data-live-offer-inquiry="${escapeHtml(p.inquiry_id || "")}"><i class="fa-solid fa-xmark"></i> Decline</button><button type="button" class="btn primary tiny" data-live-offer-action="accept" data-live-offer-kind="${transfer ? "transfer" : "assignment"}" data-live-offer-inquiry="${escapeHtml(p.inquiry_id || "")}"><i class="fa-solid fa-headset"></i> ${transfer ? "Accept transfer" : "Accept chat"}</button></div></div></section>`;
  }).join("");
  dock.classList.remove("hide");
}

const NOTIFICATION_CENTER_KINDS = new Set([
  "trial_signup",
  "renewal_request",
  "subscription_payment",
  "note_reminder",
  "installment_due"
]);

const floatingMessageState = {
  accountKey: null,
  initialized: false,
  activeId: null,
  threadMap: new Map(),
  knownSignatures: new Map(),
  historyMap: new Map(),
  historyLoading: new Set(),
  visibleIds: new Set(),
  openIds: new Set(),
  dismissedSignatures: new Map(),
  readSignatures: new Map(),
  readInFlight: new Set(),
  peekTimer: null,
  bound: false,
  sendInFlight: new Set(),
  drag: null,
  momentumFrame: null,
  suppressClickUntil: 0,
  position: null,
  positionKey: null,
  mobileExpanded: false,
  mobileHeadPositions: new Map(),
  pageLock: null,
  lastHeadsKey: "",
  lastCardsKey: ""
};

const messagesFocusState = {
  bound: false,
  revealTimer: null,
  lastScrollTop: new WeakMap(),
  touchY: null
};

function notificationPayloadObject(item){
  return item?.payload && typeof item.payload === "object" ? item.payload : {};
}

function isMemberAccessRequestNotification(item){
  if (!item || item.kind !== "inquiry") return false;
  const payload = notificationPayloadObject(item);
  return String(payload.source || "").toLowerCase() === "landing";
}

function isLiveChatNotification(item){
  if (!item || String(item.kind || "").toLowerCase() !== "inquiry") return false;
  const payload = notificationPayloadObject(item);
  return String(payload.source || "").toLowerCase() === "live_chat";
}

function isSubscriptionUserNotification(item){
  if (!item || String(item.kind || "").toLowerCase() !== "system") return false;
  const payload = notificationPayloadObject(item);
  return String(payload.type || "").toLowerCase().startsWith("subscription_");
}

function isLiveChatAssignmentNotification(item){
  if (!item || String(item.kind || "").toLowerCase() !== "system") return false;
  const payload = notificationPayloadObject(item);
  return String(payload.type || "").toLowerCase() === "live_chat_assignment";
}

function isLiveChatTransferNotification(item){
  if (!item || String(item.kind || "").toLowerCase() !== "system") return false;
  return String(notificationPayloadObject(item).type || "").toLowerCase() === "live_chat_transfer";
}

function isLiveChatRoutingNotification(item){
  if (!item || String(item.kind || "").toLowerCase() !== "system") return false;
  return String(notificationPayloadObject(item).type || "").toLowerCase().startsWith("live_chat_");
}

function isAdminBroadcastNotification(item){
  if (!item || String(item.kind || "").toLowerCase() !== "system") return false;
  return String(notificationPayloadObject(item).type || "").toLowerCase() === "admin_broadcast";
}

function isLiveChatOfferNotification(item){
  return isLiveChatAssignmentNotification(item) || isLiveChatTransferNotification(item);
}

function notificationBelongsInBell(item){
  if (!item) return false;
  return NOTIFICATION_CENTER_KINDS.has(String(item.kind || "").toLowerCase())
    || isMemberAccessRequestNotification(item)
    || isSubscriptionUserNotification(item)
    || isAdminBroadcastNotification(item)
    || isLiveChatRoutingNotification(item);
}

function isPersonalMessageThread(item){
  return !!item
    && String(item.source || "app").toLowerCase() === "app"
    && !!item.sender_id;
}

function isLandingLiveChatThread(item){
  return !!item
    && String(item.source || "").toLowerCase() === "landing"
    && String(item.subject || "").trim().toLowerCase() === "live chat support";
}

function isAdminMessageThread(item){
  return isPersonalMessageThread(item) || isLandingLiveChatThread(item);
}

function isAssignedSupportThread(item){
  if (!isLandingLiveChatThread(item)) return false;
  const assigned = String(item.support_assigned_to || "");
  const current = String(state?.sessionUser?.id || state?.sessionUser?.user_id || "");
  return String(item.support_assignment_status || "").toLowerCase() === "accepted"
    && !!assigned && assigned === current;
}

function isUserVisibleMessageThread(item){
  return isPersonalMessageThread(item) || isAssignedSupportThread(item);
}

function isFloatingMessageThread(item){
  if (isLandingLiveChatThread(item)) {
    const routeStatus = String(item.support_assignment_status || "").toLowerCase();
    const inquiryStatus = String(item.status || "").toLowerCase();
    if (routeStatus === "closed" || inquiryStatus === "archived" || inquiryStatus === "closed") return false;
  }
  return isAppAdminSession() ? isAdminMessageThread(item) : isUserVisibleMessageThread(item);
}

function personalMessageServerUnreadCount(item, admin = isAppAdminSession()){
  if (!isPersonalMessageThread(item) && !isAssignedSupportThread(item) && !isLandingLiveChatThread(item)) return 0;
  const supportSide = admin || isAssignedSupportThread(item) || isLandingLiveChatThread(item);
  return Math.max(0, Number(supportSide ? item.unread_for_admin : item.unread_for_user) || 0);
}

function personalMessageUnreadCount(item, admin = isAppAdminSession()){
  if (!item) return 0;
  const id = String(item.id || "");
  if (id && floatingMessageState.openIds?.has(id)) return 0;
  if (id && getActiveTabKey() === "messages" && String(messagesUiState?.selectedId || "") === id) return 0;
  const locallyReadSignature = floatingMessageState.readSignatures?.get(id);
  if (locallyReadSignature && locallyReadSignature === personalThreadSignature(item)) return 0;
  return personalMessageServerUnreadCount(item, admin);
}

function isIncomingPersonalMessage(item, admin = isAppAdminSession()){
  if ((!isPersonalMessageThread(item) && !isAssignedSupportThread(item) && !(admin && isLandingLiveChatThread(item))) || personalMessageServerUnreadCount(item, admin) <= 0) return false;
  const role = String(item.last_message_role || "").toLowerCase();
  if (admin || isAssignedSupportThread(item)) return role === "user" || role === "guest";
  return role === "admin";
}

function personalThreadSignature(item){
  if (!item) return "";
  return [
    item.id || "",
    item.last_message_at || "",
    item.last_message_role || "",
    item.last_message_preview || "",
    item.message_count || 0,
    item.support_assignment_status || "",
    item.support_assigned_to || "",
    item.support_transfer_status || "",
    item.support_transfer_to || "",
    item.status || ""
  ].join("|");
}

function incomingPersonalMessageMarker(item){
  if (!item || !isIncomingPersonalMessage(item)) return "";
  return personalThreadSignature(item);
}

async function fetchPersonalMessageThreads(limit = 300, status = null){
  if (isAppAdminSession()) {
    const result = await supabaseRpc("app_admin_list_inquiries", {
      p_status: status,
      p_limit: Math.max(12, Math.min(300, Number(limit) || 300))
    });
    return (Array.isArray(result?.items) ? result.items : []).filter(isAdminMessageThread);
  }
  const result = unwrapRpcJson(await supabaseRpc("app_list_my_inquiries", {}));
  return (Array.isArray(result?.items) ? result.items : []).filter(isUserVisibleMessageThread);
}

async function fetchVisibleNotificationRows(limit = 200){
  const rows = [];
  if (isAppAdminSession()) {
    try {
      const adminResult = unwrapRpcJson(await supabaseRpc("app_admin_list_notifications", { p_limit: limit }));
      (Array.isArray(adminResult?.items) ? adminResult.items : []).forEach(item => {
        if (notificationBelongsInBell(item)) rows.push({ ...item, source: "admin" });
      });
    } catch (_) {}
  }
  try {
    const userResult = await fetchMyNotificationsList(limit);
    userResult.items.forEach(item => {
      if (notificationBelongsInBell(item)) rows.push({ ...item, source: item.source || "user" });
    });
  } catch (_) {}
  rows.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  return rows;
}

async function fetchDirectLiveChatOffers(){
  try {
    const result = unwrapRpcJson(await supabaseRpc("app_live_chat_my_actionable_offers", {}));
    return { available: true, items: Array.isArray(result?.items) ? result.items : [] };
  } catch (err) {
    // Compatibility fallback only if the authoritative routing RPC is unavailable.
    if (!/app_live_chat_my_actionable_offers|Could not find the function|404|PGRST202/i.test(String(err?.message || err))) {
      console.warn("Live Chat offer fallback failed:", err);
    }
    return { available: false, items: [] };
  }
}

function mergeLiveChatOfferRows(notificationRows, directResult){
  // Once 104+ is available, routing state is authoritative. Stale bell rows must
  // never recreate an offer after a chat is accepted, declined, ended or timed out.
  if (directResult?.available) return Array.isArray(directResult.items) ? directResult.items : [];
  return (Array.isArray(notificationRows) ? notificationRows : []).filter(isLiveChatOfferNotification);
}

function floatingSenderIdentity(thread){
  const admin = isAppAdminSession();
  if (!admin) {
    if (isAssignedSupportThread(thread)) {
      const name = String(thread?.sender_display_name || thread?.guest_name || "Live Chat Guest").trim();
      const detail = [thread?.sender_email, thread?.sender_phone].filter(Boolean).join(" · ") || "Landing live chat";
      return { username: name, detail, initial: (name.charAt(0) || "G").toUpperCase() };
    }
    return {
      username: "Admin",
      detail: "Triplem VIP Administration",
      initial: "A"
    };
  }
  const usernameRaw = String(thread?.sender_username || "").trim();
  const displayName = String(thread?.sender_display_name || "").trim();
  const company = String(thread?.sender_company || "").trim();
  const username = usernameRaw ? `@${usernameRaw}` : (displayName || "User");
  const detailParts = [];
  if (company) detailParts.push(company);
  if (displayName && displayName.toLowerCase() !== usernameRaw.toLowerCase()) detailParts.push(displayName);
  const detail = detailParts.join(" · ") || "Triplem VIP user";
  const initialSource = displayName || usernameRaw || "U";
  return { username, detail, initial: initialSource.charAt(0).toUpperCase() || "U" };
}

function currentFloatingAccountKey(){
  const user = state?.sessionUser || {};
  return String(user.id || user.user_id || user.username || "session");
}

function floatingVisibilityStorageKey(){
  return `${MESSAGE_FLOAT_VISIBILITY_KEY}:${encodeURIComponent(currentFloatingAccountKey())}`;
}

function floatingHistoryStorageKey(){
  return `${MESSAGE_HISTORY_CACHE_KEY}:${encodeURIComponent(currentFloatingAccountKey())}`;
}

function floatingPositionStorageKey(){
  const mode = window.matchMedia?.("(max-width:900px)")?.matches ? "mobile" : "desktop";
  return `${MESSAGE_FLOAT_POSITION_KEY}:${encodeURIComponent(currentFloatingAccountKey())}:${mode}`;
}

function floatingHeadPositionsStorageKey(){
  return `${MESSAGE_FLOAT_HEAD_POSITIONS_KEY}:${encodeURIComponent(currentFloatingAccountKey())}:mobile`;
}

function isFloatingMobile(){
  return !!window.matchMedia?.("(max-width:900px)")?.matches;
}

function normalizeCachedMessage(message){
  if (!message || typeof message !== "object") return null;
  return {
    id: String(message.id || `cached-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    sender_role: String(message.sender_role || ""),
    sender_id: message.sender_id || null,
    sender_label: String(message.sender_label || message.sender_role || ""),
    support_actor: String(message.support_actor || ""),
    message_actor: String(message.message_actor || ""),
    is_ai: message.is_ai === true,
    body: String(message.body || ""),
    created_at: message.created_at || new Date().toISOString(),
    _summary: message._summary === true
  };
}

function loadFloatingHistoryCache(){
  try {
    const saved = JSON.parse(localStorage.getItem(floatingHistoryStorageKey()) || "null");
    const rows = saved?.threads && typeof saved.threads === "object" ? Object.entries(saved.threads) : [];
    rows.forEach(([id, value]) => {
      if (!value || typeof value !== "object") return;
      const messages = (Array.isArray(value.messages) ? value.messages : []).map(normalizeCachedMessage).filter(Boolean);
      floatingMessageState.historyMap.set(String(id), {
        inquiry: value.inquiry && typeof value.inquiry === "object" ? value.inquiry : {},
        messages,
        can_reply: value.can_reply !== false,
        server_message_count: Math.max(Number(value.server_message_count) || 0, messages.length),
        thread_signature: String(value.thread_signature || ""),
        cached_at: Number(value.cached_at) || Date.now()
      });
    });
  } catch (_) {}
}

function persistFloatingHistoryCache(){
  if (!floatingMessageState.accountKey) return;
  const entries = Array.from(floatingMessageState.historyMap.entries())
    .filter(([, value]) => value && Array.isArray(value.messages))
    .sort((a, b) => (Number(b[1].cached_at) || 0) - (Number(a[1].cached_at) || 0))
    .slice(0, MESSAGE_HISTORY_CACHE_MAX_THREADS);
  const threads = {};
  entries.forEach(([id, value]) => {
    const messages = value.messages
      .filter(message => !message?._optimistic)
      .slice(-MESSAGE_HISTORY_CACHE_MAX_MESSAGES)
      .map(normalizeCachedMessage)
      .filter(Boolean);
    threads[id] = {
      inquiry: value.inquiry || {},
      messages,
      can_reply: value.can_reply !== false,
      server_message_count: Math.max(Number(value.server_message_count) || 0, messages.length),
      thread_signature: String(value.thread_signature || ""),
      cached_at: Date.now()
    };
  });
  try {
    localStorage.setItem(floatingHistoryStorageKey(), JSON.stringify({ version: 1, threads }));
  } catch (_) {
    // Storage pressure: keep the newest half rather than discarding the cache entirely.
    try {
      const compact = Object.fromEntries(Object.entries(threads).slice(0, Math.max(6, Math.floor(MESSAGE_HISTORY_CACHE_MAX_THREADS / 2))));
      localStorage.setItem(floatingHistoryStorageKey(), JSON.stringify({ version: 1, threads: compact }));
    } catch (_) {}
  }
}

function cacheThreadResult(threadId, result, threadSummary = null){
  const id = String(threadId || "");
  if (!id || !result) return null;
  const previous = floatingMessageState.historyMap.get(id) || {};
  const messages = (Array.isArray(result.messages) ? result.messages : previous.messages || []).map(normalizeCachedMessage).filter(Boolean);
  const inquiry = { ...(previous.inquiry || {}), ...(threadSummary || {}), ...(result.inquiry || {}) };
  const cache = {
    inquiry,
    messages,
    can_reply: result.can_reply !== false,
    server_message_count: Math.max(Number(threadSummary?.message_count) || 0, Number(inquiry.message_count) || 0, messages.length),
    thread_signature: personalThreadSignature(threadSummary || inquiry),
    cached_at: Date.now()
  };
  floatingMessageState.historyMap.set(id, cache);
  persistFloatingHistoryCache();
  return cache;
}

function cachedThreadResult(threadId){
  const id = String(threadId || "");
  const cache = floatingMessageState.historyMap.get(id);
  if (!cache) return null;
  const summary = floatingMessageState.threadMap.get(id) || (messagesUiState?.threads || []).find(item => String(item.id) === id) || {};
  const mergedInquiry = { ...(cache.inquiry || {}), ...summary };
  const transferPending = isAssignedSupportThread(mergedInquiry) && String(mergedInquiry.support_transfer_status || "").toLowerCase() === "pending";
  return {
    inquiry: mergedInquiry,
    messages: Array.isArray(cache.messages) ? cache.messages : [],
    can_reply: transferPending ? false : cache.can_reply !== false,
    _fromLocalCache: true
  };
}

function appendLatestThreadSummaryToCache(thread){
  if (!thread || !isFloatingMessageThread(thread)) return false;
  const id = String(thread.id);
  const cache = floatingMessageState.historyMap.get(id);
  if (!cache) return false;
  const signature = personalThreadSignature(thread);
  const serverCount = Math.max(0, Number(thread.message_count) || 0);
  const cachedServerCount = Math.max(0, Number(cache.server_message_count) || cache.messages?.length || 0);
  const role = String(thread.last_message_role || "");
  const body = String(thread.last_message_preview || "");
  const createdAt = thread.last_message_at || new Date().toISOString();
  let appended = false;

  if (serverCount > cachedServerCount && role && body) {
    const rows = Array.isArray(cache.messages) ? cache.messages : [];
    const duplicate = rows.some(message => String(message.sender_role || "") === role
      && String(message.created_at || "") === String(createdAt)
      && String(message.body || "") === body);
    if (!duplicate) {
      rows.push({
        id: `summary-${id}-${String(createdAt).replace(/[^0-9A-Za-z]/g, "")}`,
        sender_role: role,
        sender_label: role === "admin" ? "Admin" : "User",
        body,
        created_at: createdAt,
        _summary: true
      });
      cache.messages = rows;
      appended = true;
    }
  }

  cache.inquiry = { ...(cache.inquiry || {}), ...thread };
  cache.server_message_count = Math.max(serverCount, cachedServerCount + (appended ? 1 : 0));
  cache.thread_signature = signature;
  cache.cached_at = Date.now();
  floatingMessageState.historyMap.set(id, cache);
  persistFloatingHistoryCache();
  return appended;
}

function markFloatingThreadLocallyRead(thread){
  if (!thread) return;
  const id = String(thread.id || "");
  const signature = personalThreadSignature(thread);
  if (!id || !signature) return;
  floatingMessageState.readSignatures.set(id, signature);
  persistFloatingVisibility();
}

async function markFloatingThreadServerRead(threadOrId){
  const id = String(typeof threadOrId === "object" ? threadOrId?.id : threadOrId || "");
  if (!id || floatingMessageState.readInFlight.has(id)) return null;
  const thread = typeof threadOrId === "object" ? threadOrId : floatingMessageState.threadMap.get(id);
  if (!thread || personalMessageServerUnreadCount(thread) <= 0) {
    if (thread) markFloatingThreadLocallyRead(thread);
    return thread || null;
  }
  floatingMessageState.readInFlight.add(id);
  try {
    const result = unwrapRpcJson(await supabaseRpc("app_mark_inquiry_read", { p_inquiry_id: id })) || {};
    const updated = result.inquiry ? { ...(floatingMessageState.threadMap.get(id) || thread || {}), ...result.inquiry } : (thread || null);
    if (updated) {
      floatingMessageState.threadMap.set(id, updated);
      floatingMessageState.knownSignatures.set(id, personalThreadSignature(updated));
      markFloatingThreadLocallyRead(updated);
      renderFloatingMessageHeads();
    }
    refreshAdminCommsBadges().catch(() => {});
    return updated;
  } catch (err) {
    console.warn("Could not mark Live Chat read:", err);
    return thread || null;
  } finally {
    floatingMessageState.readInFlight.delete(id);
  }
}

function captureOuterPageScroll(){
  return { x: window.scrollX || 0, y: window.scrollY || 0 };
}

function restoreOuterPageScroll(position){
  if (!position) return;
  const restore = () => {
    if (Math.abs((window.scrollY || 0) - position.y) > 1 || Math.abs((window.scrollX || 0) - position.x) > 1) {
      window.scrollTo(position.x, position.y);
    }
  };
  restore();
  requestAnimationFrame(() => {
    restore();
    requestAnimationFrame(restore);
  });
}

function setInlineStyleValue(node, prop, value){
  if (!node) return;
  if (value) node.style.setProperty(prop, value);
  else node.style.removeProperty(prop);
}

function syncFloatingChatPageLock(shouldLock){
  const body = document.body;
  const html = document.documentElement;
  if (!body || !html) return;

  if (shouldLock) {
    if (floatingMessageState.pageLock) return;
    const scroll = captureOuterPageScroll();
    const scrollbarGap = Math.max(0, window.innerWidth - html.clientWidth);
    const computedPaddingRight = Math.max(0, Number.parseFloat(window.getComputedStyle?.(body)?.paddingRight || "0") || 0);
    floatingMessageState.pageLock = {
      x: scroll.x,
      y: scroll.y,
      body: {
        position: body.style.getPropertyValue("position"),
        top: body.style.getPropertyValue("top"),
        left: body.style.getPropertyValue("left"),
        width: body.style.getPropertyValue("width"),
        overflow: body.style.getPropertyValue("overflow"),
        paddingRight: body.style.getPropertyValue("padding-right")
      },
      html: {
        overflow: html.style.getPropertyValue("overflow"),
        overscrollBehavior: html.style.getPropertyValue("overscroll-behavior")
      }
    };

    body.classList.add("message-float-page-locked");
    html.classList.add("message-float-page-locked-root");
    body.style.setProperty("position", "fixed");
    body.style.setProperty("top", `${-scroll.y}px`);
    body.style.setProperty("left", `${-scroll.x}px`);
    body.style.setProperty("width", "100%");
    body.style.setProperty("overflow", "hidden");
    if (scrollbarGap > 0) body.style.setProperty("padding-right", `${computedPaddingRight + scrollbarGap}px`);
    html.style.setProperty("overflow", "hidden");
    html.style.setProperty("overscroll-behavior", "none");
    return;
  }

  const lock = floatingMessageState.pageLock;
  if (!lock) return;
  floatingMessageState.pageLock = null;
  body.classList.remove("message-float-page-locked");
  html.classList.remove("message-float-page-locked-root");
  setInlineStyleValue(body, "position", lock.body.position);
  setInlineStyleValue(body, "top", lock.body.top);
  setInlineStyleValue(body, "left", lock.body.left);
  setInlineStyleValue(body, "width", lock.body.width);
  setInlineStyleValue(body, "overflow", lock.body.overflow);
  setInlineStyleValue(body, "padding-right", lock.body.paddingRight);
  setInlineStyleValue(html, "overflow", lock.html.overflow);
  setInlineStyleValue(html, "overscroll-behavior", lock.html.overscrollBehavior);
  restoreOuterPageScroll({ x: lock.x, y: lock.y });
}

function resetFloatingRuntimeForAccount(){
  const key = currentFloatingAccountKey();
  if (floatingMessageState.accountKey === key) return;
  syncFloatingChatPageLock(false);
  floatingMessageState.accountKey = key;
  floatingMessageState.initialized = false;
  floatingMessageState.threadMap = new Map();
  floatingMessageState.knownSignatures = new Map();
  floatingMessageState.historyMap = new Map();
  floatingMessageState.historyLoading = new Set();
  floatingMessageState.visibleIds = new Set();
  floatingMessageState.openIds = new Set();
  floatingMessageState.dismissedSignatures = new Map();
  floatingMessageState.readSignatures = new Map();
  floatingMessageState.sendInFlight = new Set();
  floatingMessageState.activeId = null;
  floatingMessageState.lastHeadsKey = "";
  floatingMessageState.lastCardsKey = "";
  floatingMessageState.position = null;
  floatingMessageState.positionKey = null;
  floatingMessageState.mobileExpanded = false;
  floatingMessageState.mobileHeadPositions = new Map();
  try {
    const saved = JSON.parse(localStorage.getItem(floatingVisibilityStorageKey()) || "null");
    if (Array.isArray(saved?.visible)) {
      saved.visible.forEach(id => floatingMessageState.visibleIds.add(String(id)));
    }
    if (saved?.dismissed && typeof saved.dismissed === "object") {
      Object.entries(saved.dismissed).forEach(([id, marker]) => {
        if (marker) floatingMessageState.dismissedSignatures.set(String(id), String(marker));
      });
    }
    if (saved?.known && typeof saved.known === "object") {
      Object.entries(saved.known).forEach(([id, signature]) => {
        if (signature) floatingMessageState.knownSignatures.set(String(id), String(signature));
      });
    }
    if (saved?.read && typeof saved.read === "object") {
      Object.entries(saved.read).forEach(([id, signature]) => {
        if (signature) floatingMessageState.readSignatures.set(String(id), String(signature));
      });
    }
    floatingMessageState.initialized = saved?.seeded === true;
  } catch (_) {}
  try {
    const savedHeads = JSON.parse(localStorage.getItem(floatingHeadPositionsStorageKey()) || "null");
    const positions = savedHeads?.positions && typeof savedHeads.positions === "object" ? savedHeads.positions : {};
    Object.entries(positions).forEach(([id, value]) => {
      const rx = Number(value?.rx);
      const ry = Number(value?.ry);
      if (Number.isFinite(rx) && Number.isFinite(ry)) {
        floatingMessageState.mobileHeadPositions.set(String(id), {
          rx: Math.max(0, Math.min(1, rx)),
          ry: Math.max(0, Math.min(1, ry))
        });
      }
    });
  } catch (_) {}
  loadFloatingHistoryCache();
}

function persistFloatingHeadPositions(){
  if (!floatingMessageState.accountKey) return;
  try {
    localStorage.setItem(floatingHeadPositionsStorageKey(), JSON.stringify({
      positions: Object.fromEntries(floatingMessageState.mobileHeadPositions)
    }));
  } catch (_) {}
}

function persistFloatingVisibility(){
  if (!floatingMessageState.accountKey) return;
  try {
    localStorage.setItem(floatingVisibilityStorageKey(), JSON.stringify({
      seeded: floatingMessageState.initialized === true,
      visible: Array.from(floatingMessageState.visibleIds),
      dismissed: Object.fromEntries(floatingMessageState.dismissedSignatures),
      known: Object.fromEntries(floatingMessageState.knownSignatures),
      read: Object.fromEntries(floatingMessageState.readSignatures)
    }));
  } catch (_) {}
}

function floatingViewportBounds(){
  const vv = window.visualViewport;
  const layoutWidth = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
  const layoutHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
  const visibleLeft = Math.max(0, Number(vv?.offsetLeft) || 0);
  const visibleTop = Math.max(0, Number(vv?.offsetTop) || 0);
  const visibleWidth = Math.max(1, Math.min(layoutWidth, Number(vv?.width) || layoutWidth));
  const visibleHeight = Math.max(1, Math.min(layoutHeight, Number(vv?.height) || layoutHeight));
  return {
    layoutWidth,
    layoutHeight,
    visibleLeft,
    visibleTop,
    visibleRight: Math.min(layoutWidth, visibleLeft + visibleWidth),
    visibleBottom: Math.min(layoutHeight, visibleTop + visibleHeight)
  };
}

function syncFloatingMobileCardViewport(){
  const root = document.getElementById("messageFloatDock");
  if (!root) return;
  if (!isFloatingMobile() || floatingMessageState.openIds.size === 0) {
    root.style.removeProperty("--message-float-vv-left");
    root.style.removeProperty("--message-float-vv-top");
    root.style.removeProperty("--message-float-vv-width");
    root.style.removeProperty("--message-float-vv-height");
    return;
  }
  const bounds = floatingViewportBounds();
  root.style.setProperty("--message-float-vv-left", `${bounds.visibleLeft}px`);
  root.style.setProperty("--message-float-vv-top", `${bounds.visibleTop}px`);
  root.style.setProperty("--message-float-vv-width", `${Math.max(1, bounds.visibleRight - bounds.visibleLeft)}px`);
  root.style.setProperty("--message-float-vv-height", `${Math.max(1, bounds.visibleBottom - bounds.visibleTop)}px`);
}

function readFloatingDockPosition(){
  const storageKey = floatingPositionStorageKey();
  if (floatingMessageState.position && floatingMessageState.positionKey === storageKey) return floatingMessageState.position;
  let parsed = null;
  try {
    parsed = JSON.parse(localStorage.getItem(storageKey) || "null");
    // Preserve legacy desktop placement, but deliberately reset legacy mobile
    // placement so older bottom-edge coordinates cannot strand the new cluster.
    if (!parsed && !isFloatingMobile()) parsed = JSON.parse(localStorage.getItem("triplem_message_float_position_v3") || localStorage.getItem("triplem_message_float_position_v2") || "null");
  } catch (_) {}
  const side = parsed?.side === "left" ? "left" : "right";
  floatingMessageState.position = {
    side,
    bottom: Number.isFinite(Number(parsed?.bottom)) ? Number(parsed.bottom) : null,
    saved: !!parsed
  };
  floatingMessageState.positionKey = storageKey;
  return floatingMessageState.position;
}

function persistFloatingDockPosition(){
  if (!floatingMessageState.position) return;
  try {
    localStorage.setItem(floatingPositionStorageKey(), JSON.stringify({
      side: floatingMessageState.position.side === "left" ? "left" : "right",
      bottom: Number(floatingMessageState.position.bottom) || 18
    }));
    floatingMessageState.position.saved = true;
  } catch (_) {}
}

function floatingMobileClusterBottom(renderedHeight, bounds, gap){
  const visibleHeight = Math.max(1, bounds.visibleBottom - bounds.visibleTop);
  const centeredTop = bounds.visibleTop + Math.max(gap, (visibleHeight - renderedHeight) / 2);
  return Math.max(gap, bounds.layoutHeight - centeredTop - renderedHeight);
}

function applyFloatingDockPosition(save = false){
  const root = document.getElementById("messageFloatDock");
  if (!root) return;
  const storageKey = floatingPositionStorageKey();
  if (floatingMessageState.positionKey !== storageKey) {
    floatingMessageState.position = null;
    floatingMessageState.positionKey = null;
  }
  const position = readFloatingDockPosition();
  const mobile = isFloatingMobile();
  const gap = mobile ? 10 : 18;
  const stack = document.getElementById("messageFloatStack");
  const renderedHeight = Math.max(mobile ? 44 : 58, stack?.getBoundingClientRect().height || (mobile ? 44 : 58));
  const bounds = floatingViewportBounds();
  const minBottom = Math.max(gap, bounds.layoutHeight - bounds.visibleBottom + gap);
  const maxBottom = Math.max(minBottom, bounds.layoutHeight - bounds.visibleTop - renderedHeight - gap);
  const defaultBottom = mobile
    ? floatingMobileClusterBottom(renderedHeight, bounds, gap)
    : minBottom;
  const desiredBottom = position.bottom !== null && position.bottom !== undefined && Number.isFinite(Number(position.bottom)) ? Number(position.bottom) : defaultBottom;
  const clampedBottom = Math.max(minBottom, Math.min(maxBottom, desiredBottom));

  // Mobile starts on the right, centered vertically. Once the user drags the
  // merged group we preserve that side/height for this account and device mode.
  position.side = position.side === "left" ? "left" : "right";
  if (mobile && !position.saved) position.side = "right";

  root.dataset.side = position.side;
  root.style.top = "auto";
  root.style.bottom = `${clampedBottom}px`;
  if (position.side === "left") {
    root.style.left = `${Math.max(gap, bounds.visibleLeft + gap)}px`;
    root.style.right = "auto";
  } else {
    root.style.right = `${Math.max(gap, bounds.layoutWidth - bounds.visibleRight + gap)}px`;
    root.style.left = "auto";
  }

  if (save) {
    position.bottom = clampedBottom;
    position.saved = true;
    persistFloatingDockPosition();
  }
  applyFloatingMobileHeadLayout(false);
}

function clampFloatingHeadRect(left, top, width, height, bounds, gap = 8){
  const minLeft = bounds.visibleLeft + gap;
  const maxLeft = Math.max(minLeft, bounds.visibleRight - width - gap);
  const minTop = bounds.visibleTop + gap;
  const maxTop = Math.max(minTop, bounds.visibleBottom - height - gap);
  return {
    left: Math.max(minLeft, Math.min(maxLeft, left)),
    top: Math.max(minTop, Math.min(maxTop, top))
  };
}

function storeFloatingHeadPosition(threadId, rect){
  if (!isFloatingMobile() || !threadId || !rect) return;
  const bounds = floatingViewportBounds();
  const visibleWidth = Math.max(1, bounds.visibleRight - bounds.visibleLeft);
  const visibleHeight = Math.max(1, bounds.visibleBottom - bounds.visibleTop);
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  floatingMessageState.mobileHeadPositions.set(String(threadId), {
    rx: Math.max(0, Math.min(1, (cx - bounds.visibleLeft) / visibleWidth)),
    ry: Math.max(0, Math.min(1, (cy - bounds.visibleTop) / visibleHeight))
  });
  persistFloatingHeadPositions();
}

function applyFloatingMobileHeadLayout(animate = true){
  const root = document.getElementById("messageFloatDock");
  const stack = document.getElementById("messageFloatStack");
  if (!root || !stack) return;
  const mobile = isFloatingMobile();
  const heads = Array.from(stack.querySelectorAll(".message-float-head[data-float-head]"));
  root.classList.toggle("mobile-heads-expanded", mobile && floatingMessageState.mobileExpanded && heads.length > 1);
  if (!mobile || !floatingMessageState.mobileExpanded || heads.length <= 1) {
    heads.forEach(head => {
      head.style.removeProperty("position");
      head.style.removeProperty("left");
      head.style.removeProperty("top");
      head.style.removeProperty("right");
      head.style.removeProperty("bottom");
      head.style.removeProperty("margin");
      head.style.removeProperty("z-index");
      head.style.removeProperty("transition");
    });
    return;
  }

  const bounds = floatingViewportBounds();
  const gap = 9;
  const defaultSize = 44;
  const step = defaultSize + 8;
  const totalHeight = Math.min(bounds.visibleBottom - bounds.visibleTop - gap * 2, defaultSize + Math.max(0, heads.length - 1) * step);
  const startTop = bounds.visibleTop + Math.max(gap, ((bounds.visibleBottom - bounds.visibleTop) - totalHeight) / 2);

  heads.forEach((head, index) => {
    const id = String(head.dataset.floatHead || "");
    const rect = head.getBoundingClientRect();
    const width = rect.width || defaultSize;
    const height = rect.height || defaultSize;
    const saved = floatingMessageState.mobileHeadPositions.get(id);
    let left;
    let top;
    if (saved) {
      const visibleWidth = Math.max(1, bounds.visibleRight - bounds.visibleLeft);
      const visibleHeight = Math.max(1, bounds.visibleBottom - bounds.visibleTop);
      left = bounds.visibleLeft + saved.rx * visibleWidth - width / 2;
      top = bounds.visibleTop + saved.ry * visibleHeight - height / 2;
    } else {
      left = bounds.visibleRight - width - gap;
      top = startTop + index * step;
    }
    const clamped = clampFloatingHeadRect(left, top, width, height, bounds, gap);
    head.style.setProperty("position", "fixed");
    head.style.setProperty("left", `${clamped.left}px`);
    head.style.setProperty("top", `${clamped.top}px`);
    head.style.setProperty("right", "auto");
    head.style.setProperty("bottom", "auto");
    head.style.setProperty("margin", "0");
    head.style.setProperty("z-index", String(2147482400 + index));
    head.style.setProperty("transition", animate ? "left .2s cubic-bezier(.2,.8,.2,1), top .2s cubic-bezier(.2,.8,.2,1), transform .18s ease" : "none");
  });
}

function ensureFloatingDismissTarget(){
  let target = document.getElementById("messageFloatDismissTarget");
  if (target) return target;
  target = document.createElement("div");
  target.id = "messageFloatDismissTarget";
  target.className = "message-float-dismiss-target";
  target.setAttribute("aria-hidden", "true");
  target.innerHTML = `<div class="message-float-dismiss-core"><i class="fa-solid fa-xmark"></i><span>Close</span></div>`;
  document.body.appendChild(target);
  return target;
}

function ensureFloatingMessageDock(){
  resetFloatingRuntimeForAccount();
  let root = document.getElementById("messageFloatDock");
  if (root) return root;
  root = document.createElement("div");
  root.id = "messageFloatDock";
  root.className = "message-float-dock hide";
  root.setAttribute("aria-live", "polite");
  root.innerHTML = `
    <button type="button" id="messageFloatMobileScrim" class="message-float-mobile-scrim" aria-label="Minimize quick chat"></button>
    <div id="messageFloatCards" class="message-float-cards" aria-label="Open quick chats"></div>
    <div id="messageFloatPeek" class="message-float-peek hide" role="status"></div>
    <div id="messageFloatStack" class="message-float-stack" aria-label="New message conversations"></div>`;
  document.body.appendChild(root);
  ensureFloatingDismissTarget();
  applyFloatingDockPosition(false);
  bindFloatingMessageDock();
  return root;
}

function clearFloatingPeek(){
  if (floatingMessageState.peekTimer) {
    clearTimeout(floatingMessageState.peekTimer);
    floatingMessageState.peekTimer = null;
  }
  document.getElementById("messageFloatPeek")?.classList.add("hide");
}

function showFloatingMessagePeek(thread){
  const peek = document.getElementById("messageFloatPeek");
  if (!peek || !thread) return;
  const identity = floatingSenderIdentity(thread);
  peek.innerHTML = `
    <button type="button" class="message-float-peek-button" data-float-thread="${escapeHtml(thread.id)}">
      <span class="message-float-peek-copy">
        <strong>${escapeHtml(identity.username)}</strong>
        <span>${escapeHtml(String(thread.last_message_preview || "New message").slice(0, 110))}</span>
      </span>
    </button>`;
  peek.classList.remove("hide");
  clearTimeout(floatingMessageState.peekTimer);
  floatingMessageState.peekTimer = setTimeout(clearFloatingPeek, MESSAGE_FLOAT_PEEK_MS);
}

function floatingHistoryRowsHtml(messages, thread = null){
  const admin = isAppAdminSession();
  const supportThread = isAssignedSupportThread(thread);
  if (!Array.isArray(messages) || !messages.length) {
    return `<div class="message-float-history-empty">No messages yet.</div>`;
  }
  return messages.map(m => {
    const mine = admin || supportThread ? m.sender_role === "admin" : m.sender_role !== "admin";
    return `
      <div class="message-float-chat-row ${mine ? "mine" : "theirs"}" data-message-id="${escapeHtml(String(m.id || ""))}">
        <div class="message-float-chat-bubble${m._optimistic ? " chat-bubble-pending" : ""}">
          <div class="message-float-chat-body">${escapeHtml(String(m.body || ""))}</div>
          <div class="message-float-chat-time">${escapeHtml(formatRelativeTime(m.created_at || new Date().toISOString()))}</div>
        </div>
      </div>`;
  }).join("");
}

function floatingHistoryRenderKey(history){
  const rows = Array.isArray(history?.messages) ? history.messages : [];
  return rows.map(m => `${m.id || ""}|${m.created_at || ""}|${m.sender_role || ""}|${m.body || ""}|${m._optimistic ? 1 : 0}`).join("~");
}

function floatingCardSelector(id){
  const safe = (window.CSS && CSS.escape) ? CSS.escape(String(id)) : String(id).replace(/"/g, '\\"');
  return `.message-float-card[data-float-card="${safe}"]`;
}

function ensureFloatingMessageCard(thread){
  const cards = document.getElementById("messageFloatCards");
  if (!cards || !thread) return null;
  const id = String(thread.id);
  let card = cards.querySelector(floatingCardSelector(id));
  const identity = floatingSenderIdentity(thread);
  const liveSupportSide = isLandingLiveChatThread(thread) && (isAppAdminSession() || isAssignedSupportThread(thread));
  if (!card) {
    card = document.createElement("section");
    card.className = "message-float-card";
    card.dataset.floatCard = id;
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", `Quick conversation with ${identity.username}`);
    card.innerHTML = `
      <div class="message-float-card-head">
        <div class="message-float-avatar" aria-hidden="true">${escapeHtml(identity.initial)}</div>
        <div class="message-float-person">
          <strong data-float-person-name>${escapeHtml(identity.username)}</strong>
          <span data-float-person-detail>${escapeHtml(identity.detail)}</span>
        </div>
        <div class="message-float-card-controls">
          <button type="button" class="message-float-card-avatar-toggle" data-float-collapse="${escapeHtml(id)}" data-float-card-avatar aria-label="Minimize quick chat" title="Minimize chat"><img src="Assets/logo/logo.png" alt="" draggable="false" aria-hidden="true" /></button>
          <button type="button" class="message-float-icon-btn message-float-minimize-btn" data-float-collapse="${escapeHtml(id)}" aria-label="Minimize quick chat"><i class="fa-solid fa-minus"></i></button>
          <button type="button" class="message-float-icon-btn message-float-close-btn" data-float-dismiss="${escapeHtml(id)}" aria-label="Close floating conversation"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>
      <div class="message-float-history" data-float-history="${escapeHtml(id)}" aria-label="Conversation history"><div class="message-float-history-empty">Loading conversation…</div></div>
      <div class="message-float-reply">
        ${liveSupportSide ? liveChatQuickRepliesHtml(`float-${id}`) : ""}
        <textarea class="input" rows="2" maxlength="4000" data-float-reply="${escapeHtml(id)}" placeholder="Write a reply…" aria-label="Quick reply"></textarea>
        <div class="message-float-actions">
          <button type="button" class="btn ghost message-float-open" data-float-open="${escapeHtml(id)}"><i class="fa-solid fa-comments"></i> Open Messages</button>
          ${liveSupportSide && isAssignedSupportThread(thread) ? `<button type="button" class="btn ghost message-float-transfer" data-float-transfer="${escapeHtml(id)}"><i class="fa-solid fa-right-left"></i> Transfer</button>` : ""}
          <button type="button" class="btn primary message-float-send" data-float-send="${escapeHtml(id)}"><i class="fa-solid fa-paper-plane"></i> Reply</button>
        </div>
      </div>`;
    cards.appendChild(card);
  } else {
    const name = card.querySelector("[data-float-person-name]");
    const detail = card.querySelector("[data-float-person-detail]");
    const mobileAvatar = card.querySelector("[data-float-card-avatar]");
    if (name && name.textContent !== identity.username) name.textContent = identity.username;
    if (detail && detail.textContent !== identity.detail) detail.textContent = identity.detail;
    if (mobileAvatar && !mobileAvatar.querySelector("img")) mobileAvatar.innerHTML = `<img src="Assets/logo/logo.png" alt="" draggable="false" aria-hidden="true" />`;
  }
  return card;
}

function renderFloatingMessageCard(thread, options = {}){
  if (!thread) return;
  const id = String(thread.id);
  if (!floatingMessageState.openIds.has(id)) return;
  const card = ensureFloatingMessageCard(thread);
  if (!card) return;
  const historyEl = card.querySelector(`[data-float-history="${id}"]`);
  const history = floatingMessageState.historyMap.get(id);
  const loading = floatingMessageState.historyLoading.has(id);
  const previousDistanceFromBottom = historyEl
    ? Math.max(0, historyEl.scrollHeight - historyEl.scrollTop - historyEl.clientHeight)
    : 0;
  const nearBottom = previousDistanceFromBottom < 54;
  const nextHistoryKey = history ? floatingHistoryRenderKey(history) : (loading ? "loading" : "empty");
  if (historyEl && historyEl.dataset.renderKey !== nextHistoryKey) {
    if (history) historyEl.innerHTML = floatingHistoryRowsHtml(history.messages, history.inquiry || thread);
    else if (loading) historyEl.innerHTML = `<div class="message-float-history-empty"><i class="fa-solid fa-spinner fa-spin"></i> Loading conversation…</div>`;
    else historyEl.innerHTML = `<div class="message-float-history-empty">Open this conversation to load previous messages.</div>`;
    historyEl.dataset.renderKey = nextHistoryKey;
    requestAnimationFrame(() => {
      if (options.scrollBottom !== false || nearBottom) historyEl.scrollTop = historyEl.scrollHeight;
      else historyEl.scrollTop = Math.max(0, historyEl.scrollHeight - historyEl.clientHeight - previousDistanceFromBottom);
    });
  } else if (historyEl && options.scrollBottom === true) {
    requestAnimationFrame(() => { historyEl.scrollTop = historyEl.scrollHeight; });
  }
  const input = card.querySelector(`[data-float-reply="${id}"]`);
  const sendBtn = card.querySelector(`[data-float-send="${id}"]`);
  const transferBtn = card.querySelector(`[data-float-transfer="${id}"]`);
  const transferPending = String(thread.support_transfer_status || "").toLowerCase() === "pending";
  if (input && isAssignedSupportThread(thread)) { input.disabled = transferPending; input.placeholder = transferPending ? `Transfer pending${thread.support_transfer_to_name ? ` · ${thread.support_transfer_to_name}` : ""}` : "Write a reply…"; }
  if (sendBtn && isAssignedSupportThread(thread)) sendBtn.disabled = transferPending;
  if (transferBtn) { transferBtn.disabled = transferPending; transferBtn.innerHTML = transferPending ? `<i class="fa-solid fa-clock"></i> Pending` : `<i class="fa-solid fa-right-left"></i> Transfer`; }
  if (options.focus && input && !input.disabled) requestAnimationFrame(() => input.focus({ preventScroll: true }));
}

function visibleFloatingThreads(){
  return Array.from(floatingMessageState.visibleIds)
    .map(id => floatingMessageState.threadMap.get(String(id)))
    .filter(isFloatingMessageThread)
    .sort((a, b) => new Date(b.last_message_at || b.created_at || 0) - new Date(a.last_message_at || a.created_at || 0));
}

function renderFloatingMessageCards(){
  const cards = document.getElementById("messageFloatCards");
  if (!cards) return;
  const openIds = Array.from(floatingMessageState.openIds).filter(id => floatingMessageState.visibleIds.has(id) && floatingMessageState.threadMap.has(id));
  floatingMessageState.openIds = new Set(openIds);
  if (floatingMessageState.activeId && !floatingMessageState.openIds.has(String(floatingMessageState.activeId))) {
    floatingMessageState.activeId = openIds[openIds.length - 1] || null;
  }
  cards.querySelectorAll(".message-float-card[data-float-card]").forEach(card => {
    if (!floatingMessageState.openIds.has(String(card.dataset.floatCard || ""))) card.remove();
  });
  openIds.forEach((id, index) => {
    const thread = floatingMessageState.threadMap.get(id);
    const card = ensureFloatingMessageCard(thread);
    if (!card) return;
    card.style.setProperty("--float-card-order", String(index));
    card.classList.toggle("is-mobile-active", String(floatingMessageState.activeId) === id);
    renderFloatingMessageCard(thread, { focus: false, scrollBottom: false });
  });
  const root = document.getElementById("messageFloatDock");
  root?.classList.toggle("has-open-card", openIds.length > 0);
  syncFloatingMobileCardViewport();
  document.body.classList.toggle("message-float-chat-open", openIds.length > 0);
  // Quick-chat is a true floating window on desktop: preserve the page position
  // when opening it, but never freeze manual wheel/trackpad/scrollbar activity.
  // Mobile keeps modal-style isolation because the quick chat occupies the viewport.
  syncFloatingChatPageLock(isFloatingMobile() && openIds.length > 0);
}

function renderFloatingMessageHeads(){
  const root = ensureFloatingMessageDock();
  const stack = document.getElementById("messageFloatStack");
  if (!stack) return;
  if (!messagingLiveEligible()) {
    root.classList.add("hide");
    stack.innerHTML = "";
    document.getElementById("messageFloatCards")?.replaceChildren();
    floatingMessageState.activeId = null;
    floatingMessageState.openIds.clear();
    floatingMessageState.mobileExpanded = false;
    floatingMessageState.historyMap.clear();
    floatingMessageState.lastHeadsKey = "";
    clearFloatingPeek();
    syncFloatingChatPageLock(false);
    return;
  }
  const admin = isAppAdminSession();
  const allThreads = visibleFloatingThreads();
  const threads = allThreads.filter(thread => !(isAssignedSupportThread(thread) && floatingMessageState.openIds.has(String(thread.id))));
  const headKey = `${isFloatingMobile() && floatingMessageState.mobileExpanded ? "expanded" : "merged"}|` + threads.slice(0, MESSAGE_FLOAT_MAX_HEADS).map(thread => {
    const id = String(thread.id);
    return `${id}:${personalMessageUnreadCount(thread, admin)}:${floatingMessageState.openIds.has(id) ? 1 : 0}:${floatingMessageState.activeId === id ? 1 : 0}`;
  }).join("|");
  root.classList.toggle("hide", threads.length === 0 && floatingMessageState.openIds.size === 0);
  if (headKey !== floatingMessageState.lastHeadsKey) {
    stack.innerHTML = threads.slice(0, MESSAGE_FLOAT_MAX_HEADS).map(thread => {
      const id = String(thread.id);
      const identity = floatingSenderIdentity(thread);
      const unread = personalMessageUnreadCount(thread, admin);
      const active = floatingMessageState.activeId === id ? " active" : "";
      return `
        <div class="message-float-head${active}" data-float-head="${escapeHtml(id)}">
          <button type="button" class="message-float-bubble${active}" data-float-thread="${escapeHtml(id)}" aria-label="Quick chat with ${escapeHtml(identity.username)}" title="${escapeHtml(identity.username)} · ${escapeHtml(identity.detail)}">
            <span class="message-float-avatar"><img src="Assets/logo/logo.png" alt="" draggable="false" aria-hidden="true" /></span>
            ${unread > 0 ? `<span class="message-float-count">${unread > 9 ? "9+" : unread}</span>` : ""}
          </button>
          <button type="button" class="message-float-head-close" data-float-dismiss="${escapeHtml(id)}" aria-label="Close floating chat with ${escapeHtml(identity.username)}" title="Close"><i class="fa-solid fa-xmark"></i></button>
          <button type="button" class="message-float-head-open" data-float-open="${escapeHtml(id)}" aria-label="Open ${escapeHtml(identity.username)} in Messages" title="Open in Messages"><i class="fa-solid fa-up-right-from-square"></i></button>
        </div>`;
    }).join("");
    floatingMessageState.lastHeadsKey = headKey;
  }
  renderFloatingMessageCards();
  applyFloatingDockPosition(false);
  applyFloatingMobileHeadLayout(true);
}

async function loadFloatingMessageHistory(threadId, options = {}){
  const id = String(threadId || "");
  if (!id || floatingMessageState.historyLoading.has(id)) return;
  const cached = cachedThreadResult(id);
  if (cached && !options.forceDatabase) {
    renderFloatingMessageCard(floatingMessageState.threadMap.get(id), { scrollBottom: options.scrollBottom !== false, focus: options.focus });
    return cached;
  }

  const card = document.querySelector(floatingCardSelector(id));
  const currentHistory = card?.querySelector(`[data-float-history="${id}"]`);
  const distanceFromBottom = currentHistory
    ? Math.max(0, currentHistory.scrollHeight - currentHistory.scrollTop - currentHistory.clientHeight)
    : 0;
  floatingMessageState.historyLoading.add(id);
  if (!floatingMessageState.historyMap.has(id)) renderFloatingMessageCard(floatingMessageState.threadMap.get(id), { focus: false, scrollBottom: false });
  try {
    // One full fetch is used only to seed a thread that has never been cached locally.
    // Subsequent opens use local history and live summaries append only the newest message.
    const result = await supabaseRpc("app_get_inquiry_thread", { p_inquiry_id: id });
    if (!result) return null;
    cacheThreadResult(id, result, floatingMessageState.threadMap.get(id));
    const existing = floatingMessageState.threadMap.get(id) || {};
    if (result.inquiry) floatingMessageState.threadMap.set(id, { ...existing, ...result.inquiry });
    markFloatingThreadLocallyRead(floatingMessageState.threadMap.get(id));
    if (floatingMessageState.openIds.has(id)) {
      renderFloatingMessageCard(floatingMessageState.threadMap.get(id), {
        focus: options.focus !== false,
        scrollBottom: options.preserveScroll ? false : options.scrollBottom !== false
      });
      if (options.preserveScroll && currentHistory) {
        requestAnimationFrame(() => {
          const el = document.querySelector(floatingCardSelector(id))?.querySelector(`[data-float-history="${id}"]`);
          if (el) el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight - distanceFromBottom);
        });
      }
    }
    setTimeout(() => refreshAdminCommsBadges().catch(() => {}), 40);
    return cachedThreadResult(id);
  } catch (err) {
    console.warn("Quick chat history failed:", err);
    return null;
  } finally {
    floatingMessageState.historyLoading.delete(id);
    if (floatingMessageState.openIds.has(id)) {
      renderFloatingMessageCard(floatingMessageState.threadMap.get(id), { focus: false, scrollBottom: false });
    }
  }
}

function revealFloatingThread(threadOrId, options = {}){
  resetFloatingRuntimeForAccount();
  let thread = typeof threadOrId === "object" ? threadOrId : floatingMessageState.threadMap.get(String(threadOrId || ""));
  if (!thread && typeof threadOrId !== "object") {
    thread = (adminCommsState.inquiryPreview || []).find(item => String(item.id) === String(threadOrId));
  }
  if (!thread || !isFloatingMessageThread(thread)) return false;
  const id = String(thread.id);
  floatingMessageState.threadMap.set(id, thread);
  floatingMessageState.knownSignatures.set(id, personalThreadSignature(thread));
  floatingMessageState.visibleIds.add(id);
  floatingMessageState.dismissedSignatures.delete(id);
  if (options.open !== false) {
    floatingMessageState.openIds.add(id);
    floatingMessageState.activeId = id;
    markFloatingThreadLocallyRead(thread);
    markFloatingThreadServerRead(thread).catch(() => {});
  }
  persistFloatingVisibility();
  renderFloatingMessageHeads();
  if (options.open !== false) {
    loadFloatingMessageHistory(id, {
      forceDatabase: options.forceDatabase === true && !floatingMessageState.historyMap.has(id),
      scrollBottom: true,
      focus: options.focus !== false && !isFloatingMobile()
    }).catch(() => {});
  }
  return true;
}

function dismissFloatingThread(threadId){
  const id = String(threadId || "");
  const thread = floatingMessageState.threadMap.get(id);
  floatingMessageState.visibleIds.delete(id);
  floatingMessageState.openIds.delete(id);
  if (thread) floatingMessageState.dismissedSignatures.set(id, incomingPersonalMessageMarker(thread) || personalThreadSignature(thread));
  if (floatingMessageState.activeId === id) {
    const remaining = Array.from(floatingMessageState.openIds);
    floatingMessageState.activeId = remaining[remaining.length - 1] || null;
  }
  persistFloatingVisibility();
  clearFloatingPeek();
  renderFloatingMessageHeads();
}

function dismissAllFloatingThreads(){
  const ids = new Set([...floatingMessageState.visibleIds, ...floatingMessageState.openIds]);
  ids.forEach(id => {
    const thread = floatingMessageState.threadMap.get(String(id));
    if (thread) floatingMessageState.dismissedSignatures.set(String(id), incomingPersonalMessageMarker(thread) || personalThreadSignature(thread));
  });
  floatingMessageState.visibleIds.clear();
  floatingMessageState.openIds.clear();
  floatingMessageState.activeId = null;
  floatingMessageState.mobileExpanded = false;
  persistFloatingVisibility();
  clearFloatingPeek();
  renderFloatingMessageHeads();
}

function collapseFloatingCard(threadId){
  const id = String(threadId || "");
  floatingMessageState.openIds.delete(id);
  if (isFloatingMobile()) floatingMessageState.mobileExpanded = false;
  if (floatingMessageState.activeId === id) {
    const remaining = Array.from(floatingMessageState.openIds);
    floatingMessageState.activeId = remaining[remaining.length - 1] || null;
  }
  renderFloatingMessageHeads();
}

function syncFloatingMessageBubbles(threads){
  ensureFloatingMessageDock();
  resetFloatingRuntimeForAccount();
  if (!messagingLiveEligible()) {
    floatingMessageState.threadMap = new Map();
    renderFloatingMessageHeads();
    return;
  }
  const allThreads = (Array.isArray(threads) ? threads : []).filter(isFloatingMessageThread);
  floatingMessageState.threadMap = new Map(allThreads.map(thread => [String(thread.id), thread]));

  let newestChanged = null;
  let visibilityChanged = false;
  let knownChanged = false;
  allThreads.forEach(thread => {
    const id = String(thread.id);
    const signature = personalThreadSignature(thread);
    const previous = floatingMessageState.knownSignatures.get(id);
    const incomingMarker = incomingPersonalMessageMarker(thread);
    const dismissedMarker = floatingMessageState.dismissedSignatures.get(id);
    const genuinelyNewIncoming = isIncomingPersonalMessage(thread)
      && incomingMarker
      && (((previous && previous !== signature) || (floatingMessageState.initialized && !previous))
        || (!floatingMessageState.initialized && dismissedMarker && dismissedMarker !== incomingMarker));

    if (previous !== signature) {
      knownChanged = true;
      appendLatestThreadSummaryToCache(thread);
    }
    floatingMessageState.knownSignatures.set(id, signature);
    if (genuinelyNewIncoming && dismissedMarker !== incomingMarker) {
      if (!floatingMessageState.visibleIds.has(id)) visibilityChanged = true;
      floatingMessageState.visibleIds.add(id);
      floatingMessageState.dismissedSignatures.delete(id);
      const alreadyOpen = floatingMessageState.openIds.has(id)
        || (getActiveTabKey() === "messages" && String(messagesUiState?.selectedId || "") === id);
      if (alreadyOpen) {
        markFloatingThreadLocallyRead(thread);
        markFloatingThreadServerRead(thread).catch(() => {});
        if (floatingMessageState.openIds.has(id)) {
          renderFloatingMessageCard(thread, { scrollBottom: true, focus: false });
        }
      } else if (!newestChanged || new Date(thread.last_message_at || 0) > new Date(newestChanged.last_message_at || 0)) {
        newestChanged = thread;
      }
    }
  });

  Array.from(floatingMessageState.visibleIds).forEach(id => {
    if (!floatingMessageState.threadMap.has(id)) {
      floatingMessageState.visibleIds.delete(id);
      floatingMessageState.openIds.delete(id);
      floatingMessageState.historyMap.delete(id);
      visibilityChanged = true;
    }
  });
  Array.from(floatingMessageState.knownSignatures.keys()).forEach(id => {
    if (!floatingMessageState.threadMap.has(id)) {
      floatingMessageState.knownSignatures.delete(id);
      knownChanged = true;
    }
  });

  if (!floatingMessageState.initialized) {
    floatingMessageState.initialized = true;
    knownChanged = true;
  }
  if (visibilityChanged || knownChanged) persistFloatingVisibility();
  renderFloatingMessageHeads();

  if (newestChanged && !(getActiveTabKey() === "messages" && messagesUiState.selectedId === newestChanged.id)) {
    const id = String(newestChanged.id);
    if (!floatingMessageState.openIds.has(id)) showFloatingMessagePeek(newestChanged);
  }
}

function appendOptimisticFloatingReply(threadId, body){
  const id = String(threadId || "");
  const cache = floatingMessageState.historyMap.get(id);
  if (!cache) return null;
  const optimisticId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  cache.messages = Array.isArray(cache.messages) ? cache.messages.slice() : [];
  const thread = floatingMessageState.threadMap.get(id);
  cache.messages.push({
    id: optimisticId,
    sender_role: (isAppAdminSession() || isAssignedSupportThread(thread)) ? "admin" : "user",
    sender_label: "You",
    body,
    created_at: new Date().toISOString(),
    _optimistic: true
  });
  floatingMessageState.historyMap.set(id, cache);
  renderFloatingMessageCard(floatingMessageState.threadMap.get(id), { focus: false, scrollBottom: true });
  return optimisticId;
}

function removeOptimisticFloatingReply(threadId, optimisticId){
  if (!optimisticId) return;
  const id = String(threadId || "");
  const cache = floatingMessageState.historyMap.get(id);
  if (!cache?.messages) return;
  cache.messages = cache.messages.filter(m => m.id !== optimisticId);
  floatingMessageState.historyMap.set(id, cache);
}

async function sendFloatingMessageReply(threadId){
  const id = String(threadId || "");
  if (floatingMessageState.sendInFlight.has(id)) return;
  const card = document.querySelector(floatingCardSelector(id));
  const input = card?.querySelector(`[data-float-reply="${id}"]`);
  const body = String(input?.value || "").trim();
  if (!id || !body) {
    input?.focus({ preventScroll: true });
    return;
  }
  floatingMessageState.sendInFlight.add(id);
  const sendBtn = card?.querySelector(`[data-float-send="${id}"]`);
  if (sendBtn) sendBtn.disabled = true;
  if (input) input.value = "";
  const optimisticId = appendOptimisticFloatingReply(id, body);
  try {
    const result = await supabaseRpc("app_reply_inquiry", { p_inquiry_id: id, p_body: body });
    window.TriplemPush?.requestMessagePush?.(id)?.catch?.(() => {});
    removeOptimisticFloatingReply(id, optimisticId);
    const cache = floatingMessageState.historyMap.get(id) || {
      inquiry: {}, messages: [], can_reply: true, server_message_count: 0, thread_signature: "", cached_at: Date.now()
    };
    const serverMessage = normalizeCachedMessage(result?.message);
    if (serverMessage && !cache.messages.some(message => String(message.id) === String(serverMessage.id))) cache.messages.push(serverMessage);
    const currentThread = floatingMessageState.threadMap.get(id) || {};
    const nextThread = { ...currentThread, ...(result?.inquiry || {}) };
    floatingMessageState.threadMap.set(id, nextThread);
    cache.inquiry = { ...(cache.inquiry || {}), ...nextThread };
    cache.server_message_count = Math.max(Number(nextThread.message_count) || 0, Number(cache.server_message_count) || 0, cache.messages.length);
    cache.thread_signature = personalThreadSignature(nextThread);
    cache.cached_at = Date.now();
    floatingMessageState.historyMap.set(id, cache);
    floatingMessageState.knownSignatures.set(id, personalThreadSignature(nextThread));
    markFloatingThreadLocallyRead(nextThread);
    persistFloatingHistoryCache();
    renderFloatingMessageCard(nextThread, { focus: true, scrollBottom: true });
    noteMessagingLocalMutation();
    refreshAdminCommsBadges().catch(() => {});
    if (getActiveTabKey() === "messages") renderMessagesPanel({ silent: true }).catch(() => {});
  } catch (err) {
    removeOptimisticFloatingReply(id, optimisticId);
    renderFloatingMessageCard(floatingMessageState.threadMap.get(id), { focus: true, scrollBottom: true });
    if (input) input.value = body;
    alert(err.message || "Could not send reply.");
  } finally {
    floatingMessageState.sendInFlight.delete(id);
    const currentCard = document.querySelector(floatingCardSelector(id));
    const currentSend = currentCard?.querySelector(`[data-float-send="${id}"]`);
    if (currentSend) currentSend.disabled = false;
  }
}

function setFloatingDismissTargetVisible(show, hot = false){
  const target = ensureFloatingDismissTarget();
  target.classList.toggle("show", !!show);
  target.classList.toggle("hot", !!hot);
}

function floatingDismissTargetHit(clientX, clientY){
  const target = document.getElementById("messageFloatDismissTarget");
  if (!target) return false;
  const rect = target.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  return Math.hypot(clientX - cx, clientY - cy) <= MESSAGE_FLOAT_DISMISS_RADIUS;
}

function cancelFloatingMomentum(){
  if (floatingMessageState.momentumFrame) {
    cancelAnimationFrame(floatingMessageState.momentumFrame);
    floatingMessageState.momentumFrame = null;
  }
}

function floatingVelocityFromDrag(drag){
  const vx = Number(drag?.vx) || 0;
  const vy = Number(drag?.vy) || 0;
  const speed = Math.hypot(vx, vy);
  return { vx, vy, speed };
}

function glideFloatingHead(drag){
  const head = drag?.head;
  if (!head) return;
  cancelFloatingMomentum();
  const { vx: rawVx, vy: rawVy, speed } = floatingVelocityFromDrag(drag);
  if (speed < 0.18 || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
    storeFloatingHeadPosition(drag.threadId, head.getBoundingClientRect());
    applyFloatingMobileHeadLayout(true);
    return;
  }
  let vx = Math.max(-2.2, Math.min(2.2, rawVx));
  let vy = Math.max(-2.2, Math.min(2.2, rawVy));
  let last = performance.now();
  const bounds = floatingViewportBounds();
  const rect = head.getBoundingClientRect();
  let left = rect.left;
  let top = rect.top;
  const width = rect.width || 44;
  const height = rect.height || 44;
  head.classList.add("is-gliding");
  head.style.setProperty("transition", "none");

  const tick = now => {
    const dt = Math.min(32, Math.max(1, now - last));
    last = now;
    const decay = Math.pow(0.93, dt / 16.667);
    vx *= decay;
    vy *= decay;
    left += vx * dt;
    top += vy * dt;
    const clamped = clampFloatingHeadRect(left, top, width, height, bounds, 8);
    if (Math.abs(clamped.left - left) > .5) vx *= -.18;
    if (Math.abs(clamped.top - top) > .5) vy *= -.18;
    left = clamped.left;
    top = clamped.top;
    head.style.setProperty("left", `${left}px`);
    head.style.setProperty("top", `${top}px`);
    if (Math.hypot(vx, vy) > 0.055) {
      floatingMessageState.momentumFrame = requestAnimationFrame(tick);
      return;
    }
    floatingMessageState.momentumFrame = null;
    head.classList.remove("is-gliding");
    storeFloatingHeadPosition(drag.threadId, head.getBoundingClientRect());
    applyFloatingMobileHeadLayout(true);
  };
  floatingMessageState.momentumFrame = requestAnimationFrame(tick);
}

function glideFloatingDock(drag){
  const root = document.getElementById("messageFloatDock");
  const stack = document.getElementById("messageFloatStack");
  if (!root || !stack) return;
  cancelFloatingMomentum();
  const { vx: rawVx, vy: rawVy, speed } = floatingVelocityFromDrag(drag);
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  let dx = Number(drag.dx) || 0;
  let dy = Number(drag.dy) || 0;
  const startRect = drag.stackStartRect || stack.getBoundingClientRect();
  const bounds = floatingViewportBounds();
  const gap = isFloatingMobile() ? 10 : 18;
  const minDx = bounds.visibleLeft + gap - startRect.left;
  const maxDx = bounds.visibleRight - gap - startRect.right;
  const minDy = bounds.visibleTop + gap - startRect.top;
  const maxDy = bounds.visibleBottom - gap - startRect.bottom;
  let vx = Math.max(-2.6, Math.min(2.6, rawVx));
  let vy = Math.max(-2.6, Math.min(2.6, rawVy));
  let last = performance.now();

  const settle = () => {
    const finalStackRect = stack.getBoundingClientRect();
    root.style.transform = "";
    root.style.transition = "";
    root.classList.remove("is-gliding");
    const side = finalStackRect.left + finalStackRect.width / 2 < bounds.layoutWidth / 2 ? "left" : "right";
    const rawBottom = bounds.layoutHeight - finalStackRect.bottom;
    floatingMessageState.position = {
      side,
      bottom: Math.max(gap, rawBottom),
      saved: true
    };
    floatingMessageState.positionKey = floatingPositionStorageKey();
    applyFloatingDockPosition(true);
  };

  if (speed < 0.18 || reduced) {
    settle();
    return;
  }
  root.classList.add("is-gliding");
  const tick = now => {
    const dt = Math.min(32, Math.max(1, now - last));
    last = now;
    const decay = Math.pow(0.925, dt / 16.667);
    vx *= decay;
    vy *= decay;
    dx += vx * dt;
    dy += vy * dt;
    if (dx < minDx) { dx = minDx; vx *= -.16; }
    if (dx > maxDx) { dx = maxDx; vx *= -.16; }
    if (dy < minDy) { dy = minDy; vy *= -.16; }
    if (dy > maxDy) { dy = maxDy; vy *= -.16; }
    const lean = Math.max(-2.5, Math.min(2.5, vx * 1.15));
    root.style.transform = `translate3d(${dx}px, ${dy}px, 0) rotate(${lean}deg)`;
    if (Math.hypot(vx, vy) > 0.05) {
      floatingMessageState.momentumFrame = requestAnimationFrame(tick);
      return;
    }
    floatingMessageState.momentumFrame = null;
    settle();
  };
  floatingMessageState.momentumFrame = requestAnimationFrame(tick);
}

function beginFloatingDockDrag(e, bubble){
  if (e.button !== undefined && e.button !== 0) return;
  cancelFloatingMomentum();
  const root = document.getElementById("messageFloatDock");
  if (!root || !bubble) return;
  const threadId = String(bubble.dataset.floatThread || "");
  const mobile = isFloatingMobile();
  const head = bubble.closest(".message-float-head[data-float-head]");
  const individual = mobile && floatingMessageState.mobileExpanded && !!head;
  const rect = individual ? head.getBoundingClientRect() : null;
  floatingMessageState.drag = {
    pointerId: e.pointerId,
    mode: individual ? "head" : "dock",
    threadId,
    head,
    startLeft: rect?.left || 0,
    startTop: rect?.top || 0,
    startX: e.clientX,
    startY: e.clientY,
    lastX: e.clientX,
    lastY: e.clientY,
    lastT: performance.now(),
    vx: 0,
    vy: 0,
    stackStartRect: document.getElementById("messageFloatStack")?.getBoundingClientRect() || null,
    dx: 0,
    dy: 0,
    moved: false
  };
  root.classList.add("dragging");
  root.classList.toggle("dragging-head", individual);
  if (!individual) root.style.transition = "none";
  setFloatingDismissTargetVisible(true, false);
  try { bubble.setPointerCapture(e.pointerId); } catch (_) {}
}

function moveFloatingDockDrag(e){
  const drag = floatingMessageState.drag;
  const root = document.getElementById("messageFloatDock");
  if (!drag || !root || e.pointerId !== drag.pointerId) return;
  drag.dx = e.clientX - drag.startX;
  drag.dy = e.clientY - drag.startY;
  const now = performance.now();
  const dt = Math.max(1, now - (drag.lastT || now));
  const instantVx = (e.clientX - (drag.lastX ?? e.clientX)) / dt;
  const instantVy = (e.clientY - (drag.lastY ?? e.clientY)) / dt;
  drag.vx = (Number(drag.vx) || 0) * .58 + instantVx * .42;
  drag.vy = (Number(drag.vy) || 0) * .58 + instantVy * .42;
  drag.lastX = e.clientX;
  drag.lastY = e.clientY;
  drag.lastT = now;
  if (!drag.moved && Math.hypot(drag.dx, drag.dy) > 5) drag.moved = true;
  if (!drag.moved) return;
  e.preventDefault();

  if (drag.mode === "head" && drag.head) {
    const rect = drag.head.getBoundingClientRect();
    const bounds = floatingViewportBounds();
    const clamped = clampFloatingHeadRect(
      drag.startLeft + drag.dx,
      drag.startTop + drag.dy,
      rect.width || 44,
      rect.height || 44,
      bounds,
      8
    );
    drag.head.style.setProperty("transition", "none");
    drag.head.style.setProperty("left", `${clamped.left}px`);
    drag.head.style.setProperty("top", `${clamped.top}px`);
  } else {
    root.style.transform = `translate3d(${drag.dx}px, ${drag.dy}px, 0)`;
  }
  setFloatingDismissTargetVisible(true, floatingDismissTargetHit(e.clientX, e.clientY));
}

function endFloatingDockDrag(e){
  const drag = floatingMessageState.drag;
  const root = document.getElementById("messageFloatDock");
  if (!drag || !root || e.pointerId !== drag.pointerId) return;
  const moved = drag.moved;
  const shouldDismiss = moved && floatingDismissTargetHit(e.clientX, e.clientY);
  root.classList.remove("dragging", "dragging-head");
  setFloatingDismissTargetVisible(false, false);
  floatingMessageState.drag = null;
  if (!moved) {
    root.style.transform = "";
    root.style.transition = "";
    return;
  }
  floatingMessageState.suppressClickUntil = Date.now() + 360;

  if (shouldDismiss) {
    root.style.transform = "";
    root.style.transition = "";
    // Desktop dragging moves the Messenger dock as one object, so dropping it
    // on the close well dismisses every visible/open floating conversation.
    // Mobile keeps its existing merged-group semantics; expanded heads may be
    // dismissed individually.
    if (!isFloatingMobile()) dismissAllFloatingThreads();
    else if (drag.mode === "dock" && !floatingMessageState.mobileExpanded) dismissAllFloatingThreads();
    else dismissFloatingThread(drag.threadId);
    return;
  }

  if (drag.mode === "head" && drag.head) {
    glideFloatingHead(drag);
    return;
  }

  glideFloatingDock(drag);
}

async function openLiveChatTransferModal(inquiryId){
  const id = String(inquiryId || "");
  if (!id) return;
  let modal = document.getElementById("liveChatTransferModal");
  if (!modal) { modal = document.createElement("div"); modal.id = "liveChatTransferModal"; modal.className = "modal hide"; document.body.appendChild(modal); }
  modal.innerHTML = `<div class="modal-backdrop" data-live-transfer-close></div><div class="modal-dialog settings-sheet live-chat-transfer-sheet" role="dialog" aria-modal="true"><div class="settings-sheet-head"><div><h3><i class="fa-solid fa-right-left"></i> Transfer Live Chat</h3><p>Choose another available support representative.</p></div><button type="button" class="btn ghost tiny" data-live-transfer-close aria-label="Close">✕</button></div><div class="modal-body settings-sheet-body"><div class="live-chat-transfer-list"><div class="admin-comms-empty"><i class="fa-solid fa-spinner fa-spin"></i> Loading representatives…</div></div><p class="lock-error" data-live-transfer-error></p></div></div>`;
  const close=()=>{ modal.classList.add("hide"); modal.setAttribute("aria-hidden","true"); };
  modal.querySelectorAll("[data-live-transfer-close]").forEach(el=>el.onclick=close);
  modal.classList.remove("hide"); modal.setAttribute("aria-hidden","false");
  const list=modal.querySelector(".live-chat-transfer-list"); const error=modal.querySelector("[data-live-transfer-error]");
  try {
    const data=unwrapRpcJson(await supabaseRpc("app_live_chat_transfer_candidates",{p_inquiry_id:id})); const rawItems=Array.isArray(data?.items)?data.items:[]; const items=Array.from(new Map(rawItems.filter(Boolean).map(agent=>[String(agent.id||""),agent])).values()).filter(agent=>agent.id);
    list.innerHTML=items.length?items.map(agent=>`<button type="button" class="live-chat-transfer-agent" data-live-transfer-target="${escapeHtml(agent.id)}"><span class="live-chat-transfer-agent-avatar"><i class="fa-solid fa-headset"></i></span><span><strong>${escapeHtml(agent.display_name || agent.username || "Support agent")}</strong><small>@${escapeHtml(agent.username || "user")} · ${Number(agent.active_chats)||0} active chat${Number(agent.active_chats)===1?"":"s"}</small></span><i class="fa-solid fa-chevron-right"></i></button>`).join(""):`<div class="admin-comms-empty">No other Live Chat agents are currently available.</div>`;
    list.querySelectorAll("[data-live-transfer-target]").forEach(btn=>btn.onclick=async()=>{
      if (!(await appConfirmDelete(`Transfer this conversation to ${btn.querySelector("strong")?.textContent || "this representative"}?`,{title:"Transfer live chat?",confirmLabel:"Transfer chat",note:"The visitor will be informed that another representative is joining. Replies pause until the handoff is accepted or declined."}))) return;
      try { btn.disabled=true; await supabaseRpc("app_live_chat_request_transfer",{p_inquiry_id:id,p_target_user_id:btn.dataset.liveTransferTarget}); close(); if(typeof showEntryConfirmation==="function")showEntryConfirmation("Transfer request sent.","success",{duration:2600}); noteMessagingLocalMutation(); const threads=await fetchPersonalMessageThreads(300,null); syncFloatingMessageBubbles(threads); if(getActiveTabKey()==="messages")await renderMessagesPanel({silent:true}); await refreshAdminCommsBadges(); }
      catch(ex){ if(error){error.textContent=ex.message||"Could not transfer this chat.";error.classList.add("show");} btn.disabled=false; }
    });
  } catch(ex){ list.innerHTML=`<div class="admin-comms-empty">${escapeHtml(ex.message||"Could not load support agents")}</div>`; }
}

function bindFloatingMessageDock(){
  if (floatingMessageState.bound) return;
  const root = document.getElementById("messageFloatDock");
  if (!root) return;
  floatingMessageState.bound = true;
  root.addEventListener("pointerdown", e => {
    const bubble = e.target.closest(".message-float-bubble[data-float-thread]");
    if (bubble) beginFloatingDockDrag(e, bubble);
  });
  root.addEventListener("pointermove", moveFloatingDockDrag, { passive: false });
  root.addEventListener("pointerup", endFloatingDockDrag);
  root.addEventListener("pointercancel", endFloatingDockDrag);
  root.addEventListener("touchmove", e => {
    if (e.target.closest("#messageFloatMobileScrim")) e.preventDefault();
  }, { passive: false });
  root.addEventListener("click", e => {
    if (Date.now() < floatingMessageState.suppressClickUntil) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.target.closest("#messageFloatMobileScrim")) {
      e.preventDefault();
      if (floatingMessageState.activeId) collapseFloatingCard(floatingMessageState.activeId);
      return;
    }
    const threadTarget = e.target.closest("[data-float-thread]");
    const collapse = e.target.closest("[data-float-collapse]");
    const dismiss = e.target.closest("[data-float-dismiss]");
    const open = e.target.closest("[data-float-open]");
    const send = e.target.closest("[data-float-send]");
    const transfer = e.target.closest("[data-float-transfer]");
    const quickToggle = e.target.closest("[data-live-quick-toggle]");
    const quick = e.target.closest("[data-live-quick-reply]");
    if (quickToggle) {
      e.preventDefault();
      e.stopPropagation();
      toggleLiveChatQuickMenu(quickToggle);
      return;
    }
    if (quick) {
      e.preventDefault();
      const card = quick.closest("[data-float-card]");
      const id = String(card?.dataset.floatCard || "");
      const input = card?.querySelector(`[data-float-reply="${id}"]`);
      const text = liveChatQuickReplyText(quick.dataset.liveQuickReply);
      closeLiveChatQuickMenus();
      if (id && input && text) { input.value = text; sendFloatingMessageReply(id); }
      return;
    }
    if (dismiss) {
      e.preventDefault();
      dismissFloatingThread(dismiss.dataset.floatDismiss);
      return;
    }
    if (collapse) {
      e.preventDefault();
      collapseFloatingCard(collapse.dataset.floatCollapse);
      return;
    }
    if (open) {
      e.preventDefault();
      const id = String(open.dataset.floatOpen || "");
      clearFloatingPeek();
      goToMessagesTab(id, { compose: false });
      return;
    }
    if (transfer) { e.preventDefault(); openLiveChatTransferModal(transfer.dataset.floatTransfer).catch(() => {}); return; }
    if (send) {
      e.preventDefault();
      sendFloatingMessageReply(send.dataset.floatSend);
      return;
    }
    if (threadTarget) {
      e.preventDefault();
      e.stopPropagation();
      const id = String(threadTarget.dataset.floatThread || "");
      clearFloatingPeek();
      const mobileHeads = visibleFloatingThreads();
      if (isFloatingMobile() && !floatingMessageState.mobileExpanded && mobileHeads.length > 1) {
        floatingMessageState.mobileExpanded = true;
        renderFloatingMessageHeads();
        requestAnimationFrame(() => applyFloatingMobileHeadLayout(true));
        return;
      }
      if (floatingMessageState.openIds.has(id) && floatingMessageState.activeId === id) {
        collapseFloatingCard(id);
      } else {
        if (isFloatingMobile()) floatingMessageState.mobileExpanded = false;
        floatingMessageState.openIds.add(id);
        floatingMessageState.activeId = id;
        const thread = floatingMessageState.threadMap.get(id);
        if (thread) {
          markFloatingThreadLocallyRead(thread);
          markFloatingThreadServerRead(thread).catch(() => {});
        }
        // Desktop quick chat must never move the dashboard by itself, but it must
        // also leave manual background scrolling fully available. Capture only the
        // opening coordinate, render/focus with preventScroll, then restore that
        // coordinate across the next paint without applying a persistent page lock.
        const outerScroll = !isFloatingMobile() ? captureOuterPageScroll() : null;
        renderFloatingMessageHeads();
        if (outerScroll) restoreOuterPageScroll(outerScroll);
        loadFloatingMessageHistory(id, { scrollBottom: true, focus: !isFloatingMobile() }).catch(() => {});
        setTimeout(() => refreshAdminCommsBadges().catch(() => {}), 40);
      }
    }
  });
  root.addEventListener("keydown", e => {
    const reply = e.target.closest("[data-float-reply]");
    if (reply && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendFloatingMessageReply(reply.dataset.floatReply);
    }
    if (e.key === "Escape" && floatingMessageState.activeId) collapseFloatingCard(floatingMessageState.activeId);
  });
  const keepDockInsideViewport = () => {
    applyFloatingDockPosition(false);
    renderFloatingMessageCards();
    syncFloatingMobileCardViewport();
    applyFloatingMobileHeadLayout(false);
  };
  window.addEventListener("resize", keepDockInsideViewport, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", keepDockInsideViewport, { passive: true });
    window.visualViewport.addEventListener("scroll", () => { applyFloatingDockPosition(false); syncFloatingMobileCardViewport(); }, { passive: true });
  }
}


function setMessagesTabsRevealed(show, autoHideMs = 0){
  if (getActiveTabKey() !== "messages") return;
  document.body.classList.toggle("messages-tabs-revealed", !!show);
  if (messagesFocusState.revealTimer) {
    clearTimeout(messagesFocusState.revealTimer);
    messagesFocusState.revealTimer = null;
  }
  if (show && autoHideMs > 0) {
    messagesFocusState.revealTimer = setTimeout(() => {
      document.body.classList.remove("messages-tabs-revealed");
      messagesFocusState.revealTimer = null;
    }, autoHideMs);
  }
}

function syncMessagesFocusMode(){
  const active = getActiveTabKey() === "messages" && document.getElementById("messagesPanel")?.classList.contains("active");
  document.body.classList.toggle("messages-focus-mode", !!active);
  if (!active) {
    document.body.classList.remove("messages-tabs-revealed");
    if (messagesFocusState.revealTimer) clearTimeout(messagesFocusState.revealTimer);
    messagesFocusState.revealTimer = null;
    return;
  }
  setMessagesTabsRevealed(true, window.matchMedia?.("(max-width:900px)")?.matches ? 1200 : 900);
}

function bindMessagesFocusMode(){
  if (messagesFocusState.bound) return;
  messagesFocusState.bound = true;
  const panel = document.getElementById("messagesPanel");
  if (panel && typeof MutationObserver === "function") {
    new MutationObserver(syncMessagesFocusMode).observe(panel, { attributes: true, attributeFilter: ["class"] });
  }
  document.addEventListener("pointermove", e => {
    if (!document.body.classList.contains("messages-focus-mode")) return;
    if (window.matchMedia?.("(max-width:900px)")?.matches) return;
    const tabs = document.querySelector("#app > .tabs");
    if (e.clientY <= 34) {
      setMessagesTabsRevealed(true, 0);
      return;
    }
    if (document.body.classList.contains("messages-tabs-revealed") && tabs) {
      const rect = tabs.getBoundingClientRect();
      if (e.clientY > rect.bottom + 30) setMessagesTabsRevealed(false);
    }
  }, { passive: true });

  const revealMobileTabs = (ms = 2400) => {
    if (!document.body.classList.contains("messages-focus-mode")) return;
    if (!window.matchMedia?.("(max-width:900px)")?.matches) return;
    setMessagesTabsRevealed(true, ms);
  };

  document.addEventListener("pointerdown", e => {
    if (!document.body.classList.contains("messages-focus-mode")) return;
    if (!window.matchMedia?.("(max-width:900px)")?.matches) return;
    if (e.clientY <= 34) revealMobileTabs(2600);
  }, { passive: true });

  document.addEventListener("touchstart", e => {
    if (!document.body.classList.contains("messages-focus-mode")) return;
    if (!window.matchMedia?.("(max-width:900px)")?.matches) return;
    messagesFocusState.touchY = e.touches?.[0]?.clientY ?? null;
  }, { passive: true });
  document.addEventListener("touchmove", e => {
    if (!document.body.classList.contains("messages-focus-mode")) return;
    if (!window.matchMedia?.("(max-width:900px)")?.matches) return;
    const y = e.touches?.[0]?.clientY;
    const previous = messagesFocusState.touchY;
    if (!Number.isFinite(y) || !Number.isFinite(previous)) return;
    // A downward finger gesture means the conversation is being scrolled back
    // toward older/top content. Reveal navigation even when the inner scroller
    // has no overflow, so the user can always leave Messages on mobile.
    if (y - previous > 8) revealMobileTabs(2800);
    else if (previous - y > 18 && document.body.classList.contains("messages-tabs-revealed")) setMessagesTabsRevealed(false);
    messagesFocusState.touchY = y;
  }, { passive: true });
  document.addEventListener("touchend", () => { messagesFocusState.touchY = null; }, { passive: true });

  document.addEventListener("scroll", e => {
    if (!document.body.classList.contains("messages-focus-mode")) return;
    if (!window.matchMedia?.("(max-width:900px)")?.matches) return;
    const target = e.target;
    if (!(target instanceof Element) || !target.matches(".messages-chat-scroll, .messages-thread-list, .messages-compose, .messages-thread-header")) return;
    const current = target.scrollTop || 0;
    const previous = messagesFocusState.lastScrollTop.get(target) ?? current;
    messagesFocusState.lastScrollTop.set(target, current);
    if (current <= 10 || current < previous - 3) revealMobileTabs(2600);
    else if (current > previous + 8) setMessagesTabsRevealed(false);
  }, true);

  document.addEventListener("wheel", e => {
    if (!document.body.classList.contains("messages-focus-mode")) return;
    if (!window.matchMedia?.("(max-width:900px)")?.matches) return;
    if (e.deltaY < -4) revealMobileTabs(2400);
  }, { passive: true });

  window.addEventListener("resize", syncMessagesFocusMode, { passive: true });
  syncMessagesFocusMode();
}

function stopAdminCommsPolling(){
  stopMessagingLiveSync();
}

function startAdminCommsPolling(){
  startMessagingLiveSync();
}

function stopMessagingLiveSync(){
  stopLiveChatRealtimeBridge();
  if (!messagingLiveEligible()) {
    liveChatNotificationState.offerInquiryIds.clear();
    stopLiveChatNotificationSound();
  }
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
  const wait = Math.max(250, Number(delayMs) || messagingLivePollIntervalMs());
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
  startLiveChatRealtimeBridge();
  bindMessagingLiveVisibility();
  // Seed soon after login; first successful poll only stores fingerprint (no UI churn)
  scheduleMessagingLivePoll(180);
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
    reconcileLiveChatOffersFromRealtime().catch(() => {});
    scheduleMessagingLivePoll(120);
  });
  window.addEventListener("focus", () => { if (messagingLiveEligible()) reconcileLiveChatOffersFromRealtime().catch(() => {}); }, { passive: true });
  window.addEventListener("online", () => { if (messagingLiveEligible()) reconcileLiveChatOffersFromRealtime().catch(() => {}); }, { passive: true });
  window.addEventListener("pageshow", () => { if (messagingLiveEligible()) reconcileLiveChatOffersFromRealtime().catch(() => {}); }, { passive: true });
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
  }, 70);
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
      const [threads, notifications] = await Promise.all([
        fetchPersonalMessageThreads(120, null),
        fetchVisibleNotificationRows(120)
      ]);
      const unreadMessages = threads.reduce((sum, thread) => sum + personalMessageUnreadCount(thread, true), 0);
      const unreadNotifications = notifications.filter(item => !item.is_read).length;
      return `a-fb|${unreadNotifications}|${unreadMessages}|${threadListFingerprint(threads)}`;
    } catch (err) {
      if (typeof isAdminSecurityKeyError === "function" && isAdminSecurityKeyError(err)) return "a-fb|security-locked";
      throw err;
    }
  }
  const [threads, notifications] = await Promise.all([
    fetchPersonalMessageThreads(120, null),
    fetchVisibleNotificationRows(120)
  ]);
  const unreadMessages = threads.reduce((sum, thread) => sum + personalMessageUnreadCount(thread, false), 0);
  const unreadNotifications = notifications.filter(item => !item.is_read).length;
  return `u-fb|${unreadNotifications}|${unreadMessages}|${threadListFingerprint(threads)}`;
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
    await dispatchDueNoteRemindersThrottled(false);

    const sync = await fetchMessagingSyncState();
    if (sync && sync.fingerprint) {
      const prev = messagingLiveState.fingerprint;
      const userUnread = Number(
        sync.role === "admin"
          ? (sync.user_notifications ?? 0)
          : (sync.notifications ?? sync.user_notifications ?? 0)
      );
      if (prev === null) {
        messagingLiveState.fingerprint = sync.fingerprint;
        await refreshAdminCommsBadges();
        if (userUnread > 0) presentUnreadReminderAlertsFromNotifications().catch(() => {});
        return;
      }
      if (prev === sync.fingerprint) return;
      messagingLiveState.fingerprint = sync.fingerprint;
      queueMessagingLiveUiRefresh("sync");
      if (userUnread > 0) presentUnreadReminderAlertsFromNotifications().catch(() => {});
      return;
    }

    const fb = await fetchMessagingFallbackFingerprint();
    const prevFb = messagingLiveState.fallbackFingerprint;
    if (prevFb === null) {
      messagingLiveState.fallbackFingerprint = fb;
      await refreshAdminCommsBadges();
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
  if (messagingLiveEligible()) scheduleMessagingLivePoll(120);
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
  if (notifySub) notifySub.textContent = admin ? "Reminders, trials & access requests" : "Reminders & installment dues";
  if (msgTitle) msgTitle.textContent = "Messages";
  if (msgSub) msgSub.textContent = admin ? "Personal messages from users" : "Personal messages from admin";
  if (!show) {
    setHeaderBadge(document.getElementById("adminNotifyCount"), 0);
    setHeaderBadge(document.getElementById("adminMessagesCount"), 0);
    stopInstallmentDueChecker();
    syncFloatingMessageBubbles([]);
  }
  if (!messagingLiveEligible()) stopMessagingLiveSync();
}

async function refreshAdminCommsBadges(){
  updateAdminCommsVisibility();
  if (!messagingLiveEligible()) return;
  try {
    const directLiveOffers = await fetchDirectLiveChatOffers();
    const [notifications, threads] = await Promise.all([
      fetchVisibleNotificationRows(200),
      fetchPersonalMessageThreads(300, null)
    ]);
    const admin = isAppAdminSession();
    const subscriptionUpdate = !admin ? notifications.find(item => !item.is_read && isSubscriptionUserNotification(item)) : null;
    const subscriptionKey = subscriptionUpdate ? `${subscriptionUpdate.id}:${subscriptionUpdate.created_at || ""}` : "";
    if (subscriptionKey && messagingLiveState.lastSubscriptionProfileRefreshKey !== subscriptionKey) {
      messagingLiveState.lastSubscriptionProfileRefreshKey = subscriptionKey;
      try {
        const validated = await supabaseRpc("app_validate_session", {});
        if (validated?.user) {
          applyUserProfileToConfig(validated.user);
          updateAccessBanner();
          applyPermissionGates();
        }
      } catch (_) {}
    }
    const notificationUnread = notifications.reduce((sum, item) => sum + (!item.is_read ? 1 : 0), 0);
    const messageUnread = threads.reduce((sum, thread) => sum + personalMessageUnreadCount(thread, admin), 0);
    applyAdminBadgeCounts(notificationUnread, messageUnread);
    syncLiveChatOfferDock(mergeLiveChatOfferRows(notifications, directLiveOffers));
    syncFloatingMessageBubbles(threads);
  } catch (err) {
    console.warn("Comms unread counts failed:", err);
  }
}

function notificationIconClass(kind){
  if (kind === "trial_signup") return "trial";
  if (kind === "inquiry") return "inquiry";
  if (kind === "renewal_request") return "renewal";
  if (kind === "subscription_payment") return "renewal";
  if (kind === "access_expiry_warning" || kind === "access_auto_disabled") return "warn";
  if (kind === "note_reminder") return "reminder";
  if (kind === "installment_due") return "due";
  return "";
}

function notificationIcon(kind){
  if (kind === "trial_signup") return "fa-user-plus";
  if (kind === "inquiry") return "fa-envelope-open-text";
  if (kind === "renewal_request") return "fa-rotate";
  if (kind === "subscription_payment") return "fa-receipt";
  if (kind === "access_expiry_warning") return "fa-triangle-exclamation";
  if (kind === "access_auto_disabled") return "fa-user-slash";
  if (kind === "note_reminder") return "fa-clock";
  if (kind === "installment_due") return "fa-calendar-day";
  return "fa-bell";
}


async function openSubscriptionNotificationDetails(notification){
  if (!notification) return;
  const payload = notificationPayloadObject(notification);
  const requestId = String(payload.request_id || "").trim();
  let details = null;
  if (requestId) {
    try { details = unwrapRpcJson(await supabaseRpc("app_my_subscription_request_details", { p_request_id: requestId })); }
    catch (_) { details = null; }
  }
  const eventType = String(payload.type || "").toLowerCase();
  const approved = eventType === "subscription_approved" || String(details?.status || "") === "approved";
  const declined = eventType === "subscription_declined" || String(details?.status || "") === "declined";
  const statusLabel = approved ? "Approved" : declined ? "Declined" : "Subscription update";
  const planValue = details?.plan || payload.plan || "";
  const planLabel = planValue === "yearly" ? "Pro Yearly" : planValue === "monthly" ? "Pro Monthly" : "Plan access";
  const expiry = details?.proposed_expires_at || payload.expires_at || details?.access?.trial_expires_at || null;
  const amount = details?.amount != null ? `${details.currency || ""} ${Number(details.amount).toLocaleString(undefined,{maximumFractionDigits:2})}`.trim() : "";
  const promo = Number(details?.promotion_months ?? payload.promotion_months ?? 0) || 0;
  const decisionAt = details?.resolved_at || notification.created_at || null;
  const note = String(details?.admin_note || payload.admin_note || "").trim();
  const context = details?.request_context === "renewal" ? "Plan extension" : "New Pro signup";
  const currentExpiry = details?.access?.trial_expires_at || null;

  let modal = document.getElementById("subscriptionNotificationModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "subscriptionNotificationModal";
    modal.className = "modal hide";
    document.body.appendChild(modal);
  }
  const previousOverflow = document.body.style.overflow;
  modal.innerHTML = `<div class="modal-backdrop" data-sub-notif-close></div>
    <div class="modal-dialog settings-sheet subscription-notification-sheet" role="dialog" aria-modal="true" aria-labelledby="subscriptionNotificationTitle">
      <div class="settings-sheet-head">
        <div><h3 id="subscriptionNotificationTitle"><i class="fa-solid ${approved ? "fa-circle-check" : declined ? "fa-circle-xmark" : "fa-bell"}"></i> ${escapeHtml(statusLabel)}</h3><p>${escapeHtml(planLabel)} · ${escapeHtml(context)}</p></div>
        <button type="button" class="btn ghost tiny" data-sub-notif-close aria-label="Close">✕</button>
      </div>
      <div class="modal-body settings-sheet-body subscription-notification-body">
        <div class="subscription-decision-hero is-${approved ? "approved" : declined ? "declined" : "neutral"}">
          <span><i class="fa-solid ${approved ? "fa-check" : declined ? "fa-xmark" : "fa-clock"}"></i></span>
          <div><strong>${escapeHtml(notification.title || statusLabel)}</strong><p>${escapeHtml(notification.body || (approved ? "Your Pro subscription has been approved." : declined ? "Your payment could not be approved." : "Your subscription status was updated."))}</p></div>
        </div>
        <div class="subscription-notification-grid">
          <div><span>Decision</span><strong>${escapeHtml(statusLabel)}</strong></div>
          <div><span>Plan</span><strong>${escapeHtml(planLabel)}</strong></div>
          ${amount ? `<div><span>Payment</span><strong>${escapeHtml(amount)}</strong></div>` : ""}
          <div><span>Request</span><strong>${escapeHtml(context)}</strong></div>
          ${approved && expiry ? `<div><span>Activated until</span><strong>${escapeHtml(formatTrialExpiry(expiry))}</strong></div>` : ""}
          ${!approved && currentExpiry ? `<div><span>Current access until</span><strong>${escapeHtml(formatTrialExpiry(currentExpiry))}</strong></div>` : ""}
          ${promo ? `<div><span>Promotion</span><strong>+${escapeHtml(String(promo))} bonus month${promo===1?"":"s"}</strong></div>` : ""}
          ${details?.payment_bank ? `<div><span>Paid to</span><strong>${escapeHtml(String(details.payment_bank).toUpperCase())}</strong></div>` : ""}
          ${decisionAt ? `<div><span>Decision time</span><strong>${escapeHtml(typeof formatAdminDate === "function" ? formatAdminDate(decisionAt) : formatRelativeTime(decisionAt))}</strong></div>` : ""}
        </div>
        ${note ? `<div class="subscription-admin-note"><span>Administrator note</span><p>${escapeHtml(note)}</p></div>` : ""}
        <div class="subscription-notification-actions">
          <button type="button" class="btn soft tiny" data-sub-notif-plan><i class="fa-solid fa-crown"></i> Plan & Subscription</button>
          <button type="button" class="btn primary tiny" data-sub-notif-close>Done</button>
        </div>
      </div>
    </div>`;
  const close = () => { modal.classList.add("hide"); modal.setAttribute("aria-hidden","true"); document.body.style.overflow = previousOverflow; };
  modal.querySelectorAll("[data-sub-notif-close]").forEach(el => el.onclick = close);
  const planBtn = modal.querySelector("[data-sub-notif-plan]");
  if (planBtn) planBtn.onclick = async () => { close(); if (typeof openPlanSubscriptionModal === "function") await openPlanSubscriptionModal(); };
  modal.classList.remove("hide"); modal.setAttribute("aria-hidden","false");
  document.body.style.overflow = "hidden";
}


function liveChatOfferMatches(a, b){
  if (!a || !b) return false;
  const pa = notificationPayloadObject(a);
  const pb = notificationPayloadObject(b);
  const typeA = String(pa.type || "").toLowerCase();
  const typeB = String(pb.type || "").toLowerCase();
  if (typeA !== typeB) return false;
  if (String(pa.inquiry_id || "") !== String(pb.inquiry_id || "")) return false;
  if (typeA === "live_chat_transfer") return String(pa.transfer_id || "") === String(pb.transfer_id || "");
  return true;
}

function liveChatNotificationResolution(notification, actionable = false){
  const payload = notificationPayloadObject(notification);
  const status = String(payload.assignment_status || "").toLowerCase();
  const acceptedBy = String(payload.accepted_by_name || "").trim();
  if (actionable) return { code: "pending", label: isLiveChatTransferNotification(notification) ? "Transfer awaiting your response" : "Awaiting Agent response" };
  if (status === "accepted") return { code: "accepted", label: "Accepted by you" };
  if (status === "taken") return { code: "taken", label: acceptedBy ? `Accepted by ${acceptedBy}` : "Accepted by another Agent" };
  if (status === "closed") return { code: "closed", label: "Conversation ended" };
  if (status === "cancelled") return { code: "cancelled", label: "Transfer cancelled" };
  if (status === "declined") return { code: "declined", label: "Declined" };
  return { code: "resolved", label: "No longer awaiting your response" };
}

async function resolveLiveChatOfferForInteraction(notification){
  const direct = await fetchDirectLiveChatOffers();
  let latest = notification;
  try {
    const rows = await fetchVisibleNotificationRows(200);
    latest = rows.find(row => String(row.id || "") === String(notification?.id || ""))
      || rows.find(row => liveChatOfferMatches(row, notification))
      || notification;
  } catch (_) {}
  const actionable = direct?.available
    ? (Array.isArray(direct.items) ? direct.items : []).some(item => liveChatOfferMatches(item, notification))
    : String(notificationPayloadObject(latest).assignment_status || "pending").toLowerCase() === "pending";
  return { actionable, latest, direct };
}

async function openLiveChatAssignmentDetails(notification){
  if (!notification) return;
  const originalPayload = notificationPayloadObject(notification);
  const inquiryId = String(originalPayload.inquiry_id || "").trim();
  if (!inquiryId) return;

  let snapshot;
  try { snapshot = await resolveLiveChatOfferForInteraction(notification); }
  catch (_) { snapshot = { actionable: String(originalPayload.assignment_status || "pending").toLowerCase() === "pending", latest: notification }; }
  const currentNotification = snapshot.latest || notification;
  const payload = notificationPayloadObject(currentNotification);
  const transfer = isLiveChatTransferNotification(currentNotification);
  const resolution = liveChatNotificationResolution(currentNotification, !!snapshot.actionable);

  let modal = document.getElementById("liveChatAssignmentModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "liveChatAssignmentModal";
    modal.className = "modal hide";
    document.body.appendChild(modal);
  }
  modal.dataset.liveAssignmentInquiry = inquiryId;
  const name = String(payload.guest_name || "Live Chat Guest");
  const contact = [payload.guest_email, payload.guest_phone].filter(Boolean).join(" · ");
  const preview = String(payload.message || currentNotification.body || "A visitor contacted Triplem VIP Support.");
  const title = transfer ? "Live chat transfer" : "Live chat request";
  const help = snapshot.actionable
    ? (transfer
      ? `Accepting moves this conversation from ${escapeHtml(payload.from_agent_name || "the current Agent")} to your Messages.`
      : "Accepting assigns this waiting visitor to you and unlocks the visitor reply box.")
    : "This notification is retained for your records. It is no longer actionable.";
  const resolvedBlock = snapshot.actionable ? "" : `<div class="live-chat-assignment-resolution is-${escapeHtml(resolution.code)}"><i class="fa-solid ${resolution.code === "closed" ? "fa-circle-check" : "fa-circle-info"}"></i><div><strong>${escapeHtml(resolution.label)}</strong><small>Accept and Decline are disabled because the current Live Chat route has already changed.</small></div></div>`;
  const actions = snapshot.actionable
    ? `<div class="live-chat-assignment-actions"><button type="button" class="btn ghost tiny danger-text" data-live-assignment-decline><i class="fa-solid fa-xmark"></i> Decline</button><button type="button" class="btn ghost tiny" data-live-assignment-close>Later</button><button type="button" class="btn primary tiny" data-live-assignment-accept><i class="fa-solid fa-headset"></i> ${transfer ? "Accept transfer" : "Accept chat"}</button></div>`
    : `<div class="live-chat-assignment-actions is-resolved"><button type="button" class="btn primary tiny" data-live-assignment-close><i class="fa-solid fa-check"></i> Done</button></div>`;

  modal.innerHTML = `<div class="modal-backdrop" data-live-assignment-close></div>
    <div class="modal-dialog settings-sheet live-chat-assignment-sheet" role="dialog" aria-modal="true" aria-labelledby="liveChatAssignmentTitle">
      <div class="settings-sheet-head">
        <div><h3 id="liveChatAssignmentTitle"><i class="fa-solid ${transfer ? "fa-right-left" : "fa-headset"}"></i> ${escapeHtml(title)}</h3><p>Triplem VIP Support queue</p></div>
        <button type="button" class="btn ghost tiny" data-live-assignment-close aria-label="Close">✕</button>
      </div>
      <div class="modal-body settings-sheet-body live-chat-assignment-body">
        <div class="live-chat-assignment-person"><span><i class="fa-solid fa-user"></i></span><div><strong>${escapeHtml(name)}</strong><small>${escapeHtml(contact || "Landing-page visitor")}</small></div></div>
        <div class="live-chat-assignment-message"><span>Latest message</span><p>${escapeHtml(preview)}</p></div>
        ${resolvedBlock}
        <p class="help">${help}</p>
        <p class="lock-error" data-live-assignment-error></p>
        ${actions}
      </div>
    </div>`;
  const close = () => { modal.classList.add("hide"); modal.setAttribute("aria-hidden","true"); };
  modal.querySelectorAll("[data-live-assignment-close]").forEach(el => el.onclick = close);

  const declineBtn = modal.querySelector("[data-live-assignment-decline]");
  if (declineBtn) declineBtn.onclick = async (e) => {
    const btn = e.currentTarget;
    const err = modal.querySelector("[data-live-assignment-error]");
    try {
      btn.disabled = true;
      if (err) { err.textContent = ""; err.classList.remove("show"); }
      silenceLiveChatOfferInquiryImmediately(inquiryId);
      await supabaseRpc(transfer ? "app_live_chat_decline_transfer" : "app_live_chat_decline_assignment", { p_inquiry_id: inquiryId });
      close();
      noteMessagingLocalMutation();
      await loadAdminNotificationsDropdown().catch(() => {});
      await refreshAdminCommsBadges().catch(() => {});
    } catch (ex) {
      await reconcileLiveChatOffersFromRealtime(inquiryId).catch(() => {});
      if (err) { err.textContent = ex.message || "This chat could not be declined."; err.classList.add("show"); }
    } finally { btn.disabled = false; }
  };

  const acceptBtn = modal.querySelector("[data-live-assignment-accept]");
  if (acceptBtn) acceptBtn.onclick = async (e) => {
    const btn = e.currentTarget;
    const err = modal.querySelector("[data-live-assignment-error]");
    try {
      btn.disabled = true;
      if (err) { err.textContent = ""; err.classList.remove("show"); }
      // The accepting device goes silent at the click itself, not after network round trips.
      silenceLiveChatOfferInquiryImmediately(inquiryId);
      const accepted = unwrapRpcJson(await supabaseRpc(transfer ? "app_live_chat_accept_transfer" : "app_live_chat_accept_assignment", { p_inquiry_id: inquiryId })) || {};
      broadcastLiveChatOfferResolved(inquiryId);
      close();
      noteMessagingLocalMutation();
      document.querySelectorAll(".menu-dropdown.open").forEach(p => p.classList.remove("open"));
      await openAcceptedLiveChatImmediately(inquiryId, accepted);
      await refreshAdminCommsBadges().catch(() => {});
    } catch (ex) {
      await reconcileLiveChatOffersFromRealtime(inquiryId).catch(() => {});
      if (err) { err.textContent = ex.message || "This chat could not be accepted."; err.classList.add("show"); }
    } finally { btn.disabled = false; }
  };
  modal.classList.remove("hide");
  modal.setAttribute("aria-hidden","false");
}

async function loadAdminNotificationsDropdown(){
  const list = document.getElementById("adminNotifyList");
  if (!list || !messagingLiveEligible()) return;
  const requestId = (Number(adminCommsState.notificationRequestId) || 0) + 1;
  adminCommsState.notificationRequestId = requestId;
  const previousScrollTop = list.scrollTop;
  const hadRenderedContent = list.dataset.notificationsRendered === "1";
  if (!hadRenderedContent) list.innerHTML = `<div class="admin-comms-empty">Loading…</div>`;
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
    if (requestId !== adminCommsState.notificationRequestId) return;
    const directLiveOffers = await fetchDirectLiveChatOffers().catch(() => ({ available: false, items: [] }));
    if (requestId !== adminCommsState.notificationRequestId) return;
    items.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    adminCommsState.notifications = items.filter(notificationBelongsInBell).slice(0, 50);
    const notificationSignature = adminCommsState.notifications.map(n => {
      const p = notificationPayloadObject(n);
      return [n.id, n.is_read ? 1 : 0, n.created_at || "", n.kind || "", p.assignment_status || "", p.request_id || "", p.inquiry_id || "", p.transfer_id || ""].join("|");
    }).join("||") || "empty";
    if (hadRenderedContent && notificationSignature === adminCommsState.notificationDropdownSignature) {
      list.scrollTop = previousScrollTop;
      return;
    }
    adminCommsState.notificationDropdownSignature = notificationSignature;
    if (!adminCommsState.notifications.length) {
      const hint = loadErrors.length
        ? `Could not load notifications (${escapeHtml(loadErrors[0])})`
        : "No notifications yet";
      list.innerHTML = `<div class="admin-comms-empty">${hint}</div>`;
      list.dataset.notificationsRendered = "1";
      list.scrollTop = 0;
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
        : n.kind === "subscription_payment"
          ? `<p class="admin-comms-item-body"><strong>${escapeHtml(payload.plan === "yearly" ? "Pro Yearly" : "Pro Monthly")}</strong>${payload.amount ? ` · ${escapeHtml(payload.currency || "")} ${escapeHtml(String(payload.amount))}` : ""}${payload.team_seats ? ` · ${escapeHtml(String(payload.team_seats))} team seat(s)` : ""}</p>`
        : (n.kind === "access_expiry_warning" || n.kind === "access_auto_disabled")
          ? `<p class="admin-comms-item-body">${payload.trial_expires_at ? `Expired ${escapeHtml(formatTrialExpiry(payload.trial_expires_at))}` : ""}${payload.access_disable_at ? ` · disable ${escapeHtml(formatTrialExpiry(payload.access_disable_at))}` : ""}</p>`
          : (reminderPreview
            ? `<p class="admin-comms-item-body">${escapeHtml(reminderPreview.slice(0, 120))}</p>`
            : "");
      const jumpUser = source === "admin" && n.related_user_id
        ? `<button type="button" class="btn ghost" data-notif-user="${escapeHtml(n.related_user_id)}" title="Open user"><i class="fa-solid fa-user"></i></button>`
        : "";
      const paymentReview = source === "admin" && n.kind === "subscription_payment" && payload.request_id
        ? `<button type="button" class="btn primary" data-subscription-review="${escapeHtml(payload.request_id)}" title="Review payment"><i class="fa-solid fa-receipt"></i></button>`
        : "";
      const payloadPending = !String(payload.assignment_status || "").trim() || String(payload.assignment_status || "").toLowerCase() === "pending";
      const assignmentOpen = isLiveChatOfferNotification(n)
        ? (directLiveOffers.available
          ? (Array.isArray(directLiveOffers.items) ? directLiveOffers.items : []).some(item => liveChatOfferMatches(item, n))
          : payloadPending)
        : false;
      const offerKind = isLiveChatTransferNotification(n) ? "transfer" : "assignment";
      const liveResolution = isLiveChatOfferNotification(n) ? liveChatNotificationResolution(n, assignmentOpen) : null;
      const liveResolutionLine = liveResolution ? `<p class="admin-comms-item-body live-chat-notification-state is-${escapeHtml(liveResolution.code)}"><i class="fa-solid ${assignmentOpen ? "fa-clock" : "fa-circle-check"}"></i> ${escapeHtml(liveResolution.label)}</p>` : "";
      const liveChatAccept = source === "user" && isLiveChatOfferNotification(n) && payload.inquiry_id && assignmentOpen
        ? `<button type="button" class="btn primary" data-live-chat-accept="${escapeHtml(payload.inquiry_id)}" data-live-chat-kind="${offerKind}" title="Accept live chat"><i class="fa-solid fa-headset"></i></button>`
        : "";
      const liveChatDecline = source === "user" && isLiveChatOfferNotification(n) && payload.inquiry_id && assignmentOpen
        ? `<button type="button" class="btn ghost danger-text" data-live-chat-decline="${escapeHtml(payload.inquiry_id)}" data-live-chat-kind="${offerKind}" title="Decline live chat"><i class="fa-solid fa-xmark"></i></button>`
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
          <div class="admin-comms-item-icon ${isLiveChatOfferNotification(n) ? "inquiry" : notificationIconClass(n.kind)}">
            <i class="fa-solid ${isLiveChatOfferNotification(n) ? "fa-headset" : notificationIcon(n.kind)}"></i>
          </div>
          <div>
            <p class="admin-comms-item-title">${escapeHtml(title)}</p>
            <p class="admin-comms-item-body">${escapeHtml(n.body || "")}</p>
            ${extra}
            ${liveResolutionLine}
            <span class="admin-comms-item-meta">${escapeHtml(formatRelativeTime(n.created_at))}</span>
          </div>
          <div class="admin-comms-item-actions">
            ${paymentReview}
            ${liveChatAccept}
            ${liveChatDecline}
            ${jumpUser}
            ${unread ? `<button type="button" class="btn ghost admin-notif-read-btn" data-notif-read="${escapeHtml(n.id)}" data-notif-source="${escapeHtml(source)}" title="Mark notification as read"><i class="fa-solid fa-check" aria-hidden="true"></i><span>Read</span></button>` : ""}
            <button type="button" class="btn ghost" data-notif-delete="${escapeHtml(n.id)}" data-notif-source="${escapeHtml(source)}" title="Delete"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>`;
    }).join("");
    list.dataset.notificationsRendered = "1";
    list.scrollTop = previousScrollTop;
    requestAnimationFrame(() => { if (list.isConnected) list.scrollTop = previousScrollTop; });
  } catch (err) {
    if (requestId !== adminCommsState.notificationRequestId) return;
    if (!hadRenderedContent) list.innerHTML = `<div class="admin-comms-empty">${escapeHtml(err.message || "Could not load notifications")}</div>`;
  }
}
async function loadAdminMessagesPreview(){
  const list = document.getElementById("adminMessagesPreviewList");
  if (!list || !messagingLiveEligible()) return;
  const requestId = (Number(adminCommsState.messagePreviewRequestId) || 0) + 1;
  adminCommsState.messagePreviewRequestId = requestId;
  const hadRenderedContent = !!adminCommsState.messagePreviewSignature;
  const previousScrollTop = list.scrollTop;
  try {
    const admin = isAppAdminSession();
    const result = admin ? await supabaseRpc("app_admin_list_inquiries", { p_status: null, p_limit: 80 }) : await supabaseRpc("app_list_my_inquiries", {});
    if (requestId !== adminCommsState.messagePreviewRequestId) return;
    const items = (Array.isArray(result?.items) ? result.items : []).filter(admin ? isAdminMessageThread : isUserVisibleMessageThread).slice(0, 12);
    adminCommsState.inquiryPreview = items;
    const signature = items.map(item => [item.id,item.last_message_at,item.message_count,item.unread_for_admin,item.unread_for_user,item.support_assignment_status,item.support_assigned_to,item.support_transfer_status].join("|")).join("||") || "empty";
    if (signature === adminCommsState.messagePreviewSignature) return;
    adminCommsState.messagePreviewSignature = signature;
    if (!items.length) { list.innerHTML = `<div class="admin-comms-empty">${admin ? "No conversations yet" : "No messages yet"}</div>`; list.scrollTop = 0; return; }
    list.innerHTML = items.map(item => {
      const supportThread = isAssignedSupportThread(item);
      const unread = admin || supportThread ? Number(item.unread_for_admin || 0) > 0 : Number(item.unread_for_user || 0) > 0;
      const who = admin || supportThread ? (item.sender_display_name || item.guest_name || item.sender_username || "Guest") : "Admin";
      const transferPending = String(item.support_transfer_status || "").toLowerCase() === "pending";
      return `<div class="admin-comms-item admin-comms-message-row ${unread ? "unread" : ""}" data-message-preview-row="${escapeHtml(item.id)}"><button type="button" class="admin-comms-message-main" data-preview-inquiry="${escapeHtml(item.id)}" title="Open floating chat"><span class="admin-comms-item-icon inquiry"><i class="fa-solid fa-comments"></i></span><span class="admin-comms-message-copy"><span class="admin-comms-item-title">${escapeHtml(item.subject || "Conversation")}${transferPending ? ` <em class="live-support-inline-state">Transfer pending</em>` : ""}</span><span class="admin-comms-item-body">${escapeHtml(who)} · ${escapeHtml(item.last_message_preview || item.body || "")}</span><span class="admin-comms-item-meta">${escapeHtml(formatRelativeTime(item.last_message_at || item.created_at))}</span></span></button></div>`;
    }).join("");
    list.scrollTop = previousScrollTop; requestAnimationFrame(() => { if (list.isConnected) list.scrollTop = previousScrollTop; });
  } catch (err) {
    if (requestId !== adminCommsState.messagePreviewRequestId) return;
    if (!hadRenderedContent) list.innerHTML = `<div class="admin-comms-empty">${escapeHtml(err.message || "Could not load messages")}</div>`;
  }
}


function ensureAccessRequestDetailsModal(){
  let modal = document.getElementById("accessRequestDetailsModal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "accessRequestDetailsModal";
  modal.className = "modal hide access-request-details-modal";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="modal-backdrop" data-access-request-close></div>
    <div class="modal-dialog access-request-details-dialog" role="dialog" aria-modal="true" aria-labelledby="accessRequestDetailsTitle">
      <div class="modal-head">
        <div>
          <h3 id="accessRequestDetailsTitle">Member access request</h3>
          <p>Request submitted from the Triplem VIP access form.</p>
        </div>
        <button class="icon-btn ghost" type="button" data-access-request-close aria-label="Close">×</button>
      </div>
      <div class="modal-body" id="accessRequestDetailsBody"><div class="empty">Loading…</div></div>
    </div>`;
  (document.getElementById("app") || document.body).appendChild(modal);
  modal.addEventListener("click", e => {
    if (e.target.closest("[data-access-request-close]")) {
      modal.classList.add("hide");
      modal.setAttribute("aria-hidden", "true");
    }
  });
  return modal;
}

async function openAccessRequestDetails(notification){
  const inquiryId = notification?.related_inquiry_id;
  if (!inquiryId) return;
  const modal = ensureAccessRequestDetailsModal();
  const body = modal.querySelector("#accessRequestDetailsBody");
  modal.classList.remove("hide");
  modal.setAttribute("aria-hidden", "false");
  if (body) body.innerHTML = `<div class="empty">Loading request…</div>`;
  try {
    const result = await supabaseRpc("app_get_inquiry_thread", { p_inquiry_id: inquiryId });
    const inquiry = result?.inquiry || {};
    const messages = Array.isArray(result?.messages) ? result.messages : [];
    const requestMessage = messages.find(m => m.sender_role === "guest")?.body || inquiry.body || notification?.body || "";
    if (body) {
      body.innerHTML = `
        <div class="access-request-person">
          <div class="access-request-avatar"><i class="fa-solid fa-user-lock"></i></div>
          <div>
            <strong>${escapeHtml(inquiry.sender_display_name || inquiry.guest_name || "Visitor")}</strong>
            <span>${escapeHtml(inquiry.sender_email || inquiry.guest_email || "No email supplied")}</span>
          </div>
        </div>
        <div class="access-request-meta-grid">
          <div><span>Mobile / WhatsApp</span><strong>${escapeHtml(inquiry.sender_phone || inquiry.guest_phone || "Not supplied")}</strong></div>
          <div><span>Submitted</span><strong>${escapeHtml(formatRelativeTime(inquiry.created_at || notification?.created_at))}</strong></div>
        </div>
        <div class="access-request-message">
          <span>Request message</span>
          <p>${escapeHtml(requestMessage)}</p>
        </div>`;
    }
    noteMessagingLocalMutation();
    refreshAdminCommsBadges().catch(() => {});
  } catch (err) {
    if (body) body.innerHTML = `<div class="empty">${escapeHtml(err.message || "Could not load this access request")}</div>`;
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
  pendingOpenId: null,
  userStarter: false
};

function setMessagesComposerVisible(show){
  const composer = document.getElementById("messagesNewComposer");
  // Registered users now use the same conversation surface as every reply.
  // The separate compose card is an admin-only recipient picker.
  const allowed = !!show && isAppAdminSession();
  if (composer) composer.classList.toggle("hide", !allowed);
}

function preferredUserAdminThread(items){
  const list = (Array.isArray(items) ? items : [])
    .filter(isPersonalMessageThread)
    .filter(item => String(item?.status || "open").toLowerCase() !== "archived");
  if (!list.length) return null;
  const timeOf = item => {
    const value = Date.parse(item?.last_message_at || item?.updated_at || item?.created_at || "");
    return Number.isFinite(value) ? value : 0;
  };
  return [...list].sort((a, b) => timeOf(b) - timeOf(a))[0] || null;
}

function syncUserConversationWorkspace(admin){
  const workspace = document.querySelector(".messages-workspace");
  if (!workspace) return;
  workspace.classList.toggle("messages-user-single", !admin);
}

function showUserAdminConversationStarter(){
  if (isAppAdminSession()) return showMessagesEmptyState();
  const workspace = document.querySelector(".messages-workspace");
  const empty = document.getElementById("messagesThreadEmpty");
  const active = document.getElementById("messagesThreadActive");
  const header = document.getElementById("messagesThreadHeader");
  const scroll = document.getElementById("messagesChatScroll");
  const replyBar = document.getElementById("messagesReplyBar");
  const input = document.getElementById("messagesReplyInput");
  messagesUiState.selectedId = null;
  messagesUiState.canReply = true;
  messagesUiState.userStarter = true;
  messagingLiveState.lastThreadSig = null;
  workspace?.classList.add("messages-user-single");
  if (isMessagesMobileLayout()) workspace?.classList.add("messages-conversation-open");
  empty?.classList.add("hide");
  active?.classList.remove("hide");
  if (header) {
    header.innerHTML = `
      <div class="messages-thread-header-main messages-user-admin-header">
        <div class="messages-admin-avatar" aria-hidden="true"><i class="fa-solid fa-user-shield"></i></div>
        <div>
          <h4>Triplem VIP Admin</h4>
          <p>Private conversation · Continue here whenever you need assistance.</p>
        </div>
      </div>`;
  }
  if (scroll) {
    scroll.innerHTML = `
      <div class="messages-conversation-welcome">
        <div class="messages-empty-icon"><i class="fa-solid fa-comments"></i></div>
        <strong>Start your private conversation</strong>
        <p>Write below. Your first message starts this chat with the administrator; future messages continue in the same conversation.</p>
      </div>`;
  }
  if (replyBar) {
    replyBar.classList.remove("hide");
    let hint = replyBar.querySelector(".messages-reply-hint");
    if (!hint) {
      hint = document.createElement("p");
      hint.className = "messages-reply-hint help";
      replyBar.insertBefore(hint, replyBar.firstChild);
    }
    hint.textContent = "Your message will be sent privately to the Triplem VIP administrator.";
    hint.classList.remove("hide");
  }
  if (input) input.placeholder = "Write a message to Admin…";
}

async function prepareMessagesComposer(){
  const admin = isAppAdminSession();
  if (!admin) {
    setMessagesComposerVisible(false);
    const preferred = preferredUserAdminThread(messagesUiState.threads);
    if (preferred?.id) {
      await openInquiryThread(preferred.id);
      document.getElementById("messagesReplyInput")?.focus({ preventScroll: true });
    } else {
      showUserAdminConversationStarter();
      document.getElementById("messagesReplyInput")?.focus({ preventScroll: true });
    }
    return;
  }
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
  syncUserConversationWorkspace(admin);
  if (!admin) setMessagesComposerVisible(false);
  if (!silent) {
    if (title) title.textContent = "Messages";
    if (subtitle) {
      subtitle.textContent = admin
        ? "Private conversations with registered users and landing-page Live Chat Support."
        : "One continuous private conversation with the Triplem VIP administrator.";
    }
    if (filters) filters.classList.toggle("hide", !admin);
    if (newBtn) {
      newBtn.classList.toggle("hide", !admin);
      if (admin) newBtn.innerHTML = `<i class="fa-solid fa-pen-to-square"></i> Message user`;
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
        p_limit: 300
      });
      items = (Array.isArray(result?.items) ? result.items : []).filter(isAdminMessageThread);
    } else {
      const result = await supabaseRpc("app_list_my_inquiries", {});
      items = (Array.isArray(result?.items) ? result.items : []).filter(isUserVisibleMessageThread);
    }
    messagesUiState.threads = items;
    renderMessagesThreadList(list, items, admin);

    // User accounts deliberately behave like one continuing Admin conversation.
    // If legacy builds created multiple threads, the newest non-archived thread is
    // the continuation target; older records remain untouched in the database.
    if (!admin) {
      const preferred = preferredUserAdminThread(items);
      const requested = messagesUiState.pendingOpenId && items.find(t => String(t.id) === String(messagesUiState.pendingOpenId) && String(t.status || "open").toLowerCase() !== "archived");
      const selected = messagesUiState.selectedId && items.find(t => String(t.id) === String(messagesUiState.selectedId) && String(t.status || "open").toLowerCase() !== "archived");
      const target = requested || selected || preferred;
      if (!silent) messagesUiState.pendingOpenId = null;
      if (target?.id) {
        messagesUiState.userStarter = false;
        const nextSig = selectedThreadSignature(items, target.id);
        const activeMissing = !document.getElementById("messagesThreadActive")
          || document.getElementById("messagesThreadActive")?.classList.contains("hide");
        if (!silent || messagesUiState.selectedId !== target.id || messagingLiveState.lastThreadSig !== nextSig || activeMissing) {
          await openInquiryThread(target.id, { silent });
          messagingLiveState.lastThreadSig = selectedThreadSignature(items, target.id);
        }
      } else if (!silent) {
        showUserAdminConversationStarter();
      }
    } else {
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
      } else if (!silent && items.length && !isMessagesMobileLayout()) {
        await openInquiryThread(items[0].id);
        messagingLiveState.lastThreadSig = selectedThreadSignature(items, items[0].id);
      } else if (!items.length || (messagesUiState.selectedId && !items.some(t => t.id === messagesUiState.selectedId))) {
        showMessagesEmptyState();
        messagingLiveState.lastThreadSig = null;
      } else if (!silent && isMessagesMobileLayout() && !openId) {
        showMessagesEmptyState();
        messagingLiveState.lastThreadSig = null;
      }
    }
  } catch (err) {
    if (!silent) {
      list.innerHTML = `<div class="empty">${escapeHtml(err.message || "Could not load messages")}</div>`;
      if (admin) showMessagesEmptyState();
      else showUserAdminConversationStarter();
    }
  }
  if (admin) refreshAdminCommsBadges().catch(() => {});
  if (!silent) noteMessagingLocalMutation();
  if (messagingLiveEligible() && getActiveTabKey() === "messages") {
    scheduleMessagingLivePoll(messagingLivePollIntervalMs());
  }
}

function renderMessagesThreadList(container, items, isAdmin){
  if (!items.length) {
    container.innerHTML = `<div class="empty">${isAdmin ? "No conversations yet." : "Your private Admin conversation will appear here."}</div>`;
    return;
  }
  const liveItems = items.filter(item => isAdmin ? isLandingLiveChatThread(item) : isAssignedSupportThread(item));
  const switcher = liveItems.length ? `
    <div class="live-support-active-switcher" aria-label="Active live chats">
      <div class="live-support-active-head"><span><i class="fa-solid fa-headset"></i> Live chats</span><small>${liveItems.length} active</small></div>
      <div class="live-support-active-scroll">${liveItems.map(item => {
        const active = String(item.id) === String(messagesUiState.selectedId) ? " active" : "";
        const unread = Number(item.unread_for_admin || 0) > 0;
        const name = item.sender_display_name || item.guest_name || "Visitor";
        return `<button type="button" class="live-support-active-chip${active}${unread ? " unread" : ""}" data-open-thread="${escapeHtml(item.id)}"><i class="fa-solid fa-comment-dots"></i><span>${escapeHtml(name)}</span>${unread ? `<b>${Math.min(9, Number(item.unread_for_admin || 0))}${Number(item.unread_for_admin || 0) > 9 ? "+" : ""}</b>` : ""}</button>`;
      }).join("")}</div>
    </div>` : "";
  container.innerHTML = switcher + items.map(item => {
    const supportThread = isAssignedSupportThread(item);
    const unread = isAdmin || supportThread
      ? Number(item.unread_for_admin || 0) > 0
      : Number(item.unread_for_user || 0) > 0;
    const active = item.id === messagesUiState.selectedId ? "active" : "";
    const aiMode = String(item.support_ai_mode || "").toLowerCase();
    const sourceBadge = isLandingLiveChatThread(item)
      ? aiMode === "human_pending"
        ? `<span class="thread-source-badge live-chat ai-handoff"><i class="fa-solid fa-user-clock"></i> AI handoff</span>`
        : `<span class="thread-source-badge live-chat"><i class="fa-solid fa-headset"></i> Live chat</span>`
      : "";
    const who = isAdmin || supportThread
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
  if (!isAppAdminSession()) {
    const preferred = preferredUserAdminThread(messagesUiState.threads);
    if (preferred?.id) {
      openInquiryThread(preferred.id).catch(() => {});
    } else {
      showUserAdminConversationStarter();
    }
    return;
  }
  messagesUiState.selectedId = null;
  messagesUiState.canReply = false;
  messagesUiState.userStarter = false;
  messagingLiveState.lastThreadSig = null;
  document.querySelectorAll(".messages-thread-item.active").forEach(el => el.classList.remove("active"));
  document.getElementById("messagesThreadEmpty")?.classList.remove("hide");
  document.getElementById("messagesThreadActive")?.classList.add("hide");
  setMessagesMobileConversationMode(false);
}

function showMessagesEmptyState(){
  if (!isAppAdminSession()) return showUserAdminConversationStarter();
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
  messagesUiState.userStarter = false;
  syncUserConversationWorkspace(isAppAdminSession());
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
      ${isAppAdminSession() ? `<div class="messages-thread-header-top">
        <button type="button" class="btn ghost messages-thread-back" data-messages-back aria-label="Back to conversations">
          <i class="fa-solid fa-arrow-left"></i> Back
        </button>
      </div>` : ""}
      <div class="messages-thread-header-main">
        <div class="help">Loading conversation…</div>
      </div>`;
    scroll.innerHTML = "";
  }

  try {
    resetFloatingRuntimeForAccount();
    let result = cachedThreadResult(inquiryId);
    if (!result) {
      result = await supabaseRpc("app_get_inquiry_thread", { p_inquiry_id: inquiryId });
      cacheThreadResult(inquiryId, result, (messagesUiState.threads || []).find(item => String(item.id) === String(inquiryId)) || null);
      result = cachedThreadResult(inquiryId) || result;
    }
    const inquiry = result?.inquiry || {};
    const messages = Array.isArray(result?.messages) ? result.messages : [];
    messagesUiState.canReply = !!result?.can_reply;
    markFloatingThreadLocallyRead(inquiry);
    const admin = isAppAdminSession();
    const supportThread = isAssignedSupportThread(inquiry);
    const supportAiMode = String(inquiry.support_ai_mode || "").toLowerCase();
    const liveChatIdentityNote = supportAiMode === "human_pending"
      ? " · AI handoff requested"
      : supportAiMode === "human" ? " · Agent support" : "";

    const contactBits = [
      inquiry.sender_email,
      inquiry.sender_phone,
      inquiry.sender_company
    ].filter(Boolean).map(escapeHtml).join(" · ");

    header.innerHTML = `
      ${admin || supportThread ? `<div class="messages-thread-header-top">
        <button type="button" class="btn ghost messages-thread-back" data-messages-back aria-label="Back to conversations">
          <i class="fa-solid fa-arrow-left"></i> Back
        </button>
      </div>` : ""}
      <div class="messages-thread-header-main">
        <div>
          <h4>${admin ? escapeHtml(inquiry.subject || "Conversation") : supportThread ? escapeHtml(inquiry.sender_display_name || inquiry.guest_name || "Live Chat Guest") : "Triplem VIP Admin"}</h4>
          <p>${admin ? `${escapeHtml(inquiry.sender_display_name || "Guest")}${inquiry.sender_username ? ` · @${escapeHtml(inquiry.sender_username)}` : ""}${isLandingLiveChatThread(inquiry) ? ` · Landing live chat${liveChatIdentityNote}` : (inquiry.source === "landing" ? " · Login page request" : "")}` : supportThread ? `Triplem VIP Live Support · visitor conversation${liveChatIdentityNote}` : "Private conversation · Continue here whenever you need assistance."}</p>
          ${(admin || supportThread) && contactBits ? `<p class="messages-thread-contact">${contactBits}</p>` : ""}
        </div>
        ${admin || supportThread ? `<span class="message-status-pill ${escapeHtml(inquiry.status || "open")}">${escapeHtml(inquiry.status || "open")}</span>` : ""}
      </div>
      <div class="messages-thread-header-actions">
        ${admin && inquiry.status !== "archived" ? `<button type="button" class="btn ghost" data-inquiry-status="${escapeHtml(inquiry.id)}" data-status="archived"><i class="fa-solid fa-box-archive"></i> Archive</button>` : ""}
        ${admin && inquiry.status === "archived" ? `<button type="button" class="btn soft" data-inquiry-status="${escapeHtml(inquiry.id)}" data-status="open"><i class="fa-solid fa-rotate-left"></i> Reopen</button>` : ""}
        ${admin ? `<button type="button" class="btn ghost danger-text" data-inquiry-delete="${escapeHtml(inquiry.id)}"><i class="fa-solid fa-trash"></i> Delete</button>` : ""}
        ${supportThread ? `${String(inquiry.support_transfer_status || "").toLowerCase() === "pending" ? `<span class="live-support-transfer-pending"><i class="fa-solid fa-clock"></i> Transfer pending${inquiry.support_transfer_to_name ? ` · ${escapeHtml(inquiry.support_transfer_to_name)}` : ""}</span>` : `<button type="button" class="btn ghost tiny" data-live-chat-transfer="${escapeHtml(inquiry.id)}"><i class="fa-solid fa-right-left"></i> Transfer</button>`}<button type="button" class="btn ghost tiny" data-live-chat-agent-end="${escapeHtml(inquiry.id)}"><i class="fa-solid fa-circle-check"></i> End chat</button>` : (!admin ? `<button type="button" class="btn ghost danger-text" data-my-inquiry-delete="${escapeHtml(inquiry.id)}"><i class="fa-solid fa-trash"></i> Delete</button>` : "")}
      </div>`;

    scroll.innerHTML = messages.map(m => {
      const actor = String(m.message_actor || m.support_actor || (m.sender_role === "admin" && m.sender_id ? "agent" : "")).toLowerCase();
      const isAiMessage = actor === "ai" || m.is_ai === true;
      const isHumanMessage = actor === "agent";
      const mine = admin || supportThread ? (m.sender_role === "admin" && !isAiMessage) : m.sender_role !== "admin";
      const roleClass = isAiMessage ? "from-ai" : (m.sender_role === "admin" ? "from-admin" : (m.sender_role === "guest" ? "from-guest" : "from-user"));
      const actorBadge = isAiMessage
        ? `<em class="chat-actor-badge is-ai">AI Assistant</em>`
        : isHumanMessage ? `<em class="chat-actor-badge is-human">Agent</em>` : "";
      return `
        <div class="chat-bubble-row ${mine ? "mine" : "theirs"}">
          <div class="chat-bubble ${roleClass}">
            <div class="chat-bubble-meta">
              <span class="chat-bubble-who"><strong>${escapeHtml(m.sender_label || m.sender_role)}</strong>${actorBadge}</span>
              <span>${escapeHtml(formatRelativeTime(m.created_at))}</span>
            </div>
            <div class="chat-bubble-body">${escapeHtml(m.body)}</div>
          </div>
        </div>`;
    }).join("") || `<div class="empty">No messages in this thread.</div>`;

    if (replyBar) {
      replyBar.classList.toggle("hide", !messagesUiState.canReply);
      const replyInput = document.getElementById("messagesReplyInput");
      if (replyInput && !admin) replyInput.placeholder = supportThread ? "Reply to live-chat visitor…" : "Write a message to Admin…";
      const note = (admin || supportThread) && isLandingLiveChatThread(inquiry)
        ? supportAiMode === "human_pending"
          ? "AI Assistant paused · your reply will clearly identify you to the visitor as a Triplem VIP support agent."
          : "Triplem VIP Live Support · replies appear seamlessly in the visitor’s temporary chat."
        : (inquiry.source === "landing" && admin
          ? "Guest request from the login page — you can reply here for internal notes; the guest is not logged in."
          : "");
      let hint = replyBar.querySelector(".messages-reply-hint");
      if (!hint) {
        hint = document.createElement("p");
        hint.className = "messages-reply-hint help";
        replyBar.insertBefore(hint, replyBar.firstChild);
      }
      hint.textContent = note;
      hint.classList.toggle("hide", !note);
      replyBar.querySelectorAll(".live-chat-quick-replies").forEach(el => el.remove());
      if ((admin || supportThread) && isLandingLiveChatThread(inquiry)) {
        replyBar.insertAdjacentHTML("afterbegin", liveChatQuickRepliesHtml(`thread-${inquiry.id}`));
      }
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
    refreshAdminCommsBadges().catch(() => {});
  } catch (err) {
    if (!silent) {
      header.innerHTML = `<div class="lock-error show">${escapeHtml(err.message || "Could not open conversation")}</div>`;
    }
  }
}

async function sendInquiryReply(){
  const input = document.getElementById("messagesReplyInput");
  const btn = document.getElementById("messagesReplySendBtn");
  const scroll = document.getElementById("messagesChatScroll");
  const body = String(input?.value || "").trim();
  const threadId = String(messagesUiState.selectedId || "");
  const startingUserConversation = !isAppAdminSession() && messagesUiState.userStarter && !threadId;
  if ((!threadId && !startingUserConversation) || !body) return;
  let optimisticRow = null;
  try {
    if (btn) btn.disabled = true;
    if (input) input.value = "";
    if (scroll) {
      optimisticRow = document.createElement("div");
      optimisticRow.className = "chat-bubble-row mine chat-bubble-pending";
      optimisticRow.innerHTML = `
        <div class="chat-bubble ${isAppAdminSession() ? "from-admin" : "from-user"}">
          <div class="chat-bubble-meta"><strong>You</strong><span>Sending…</span></div>
          <div class="chat-bubble-body">${escapeHtml(body)}</div>
        </div>`;
      scroll.appendChild(optimisticRow);
      scroll.scrollTop = scroll.scrollHeight;
    }

    if (startingUserConversation) {
      const created = await supabaseRpc("app_submit_inquiry", {
        p_subject: "Conversation with Admin",
        p_body: body
      });
      window.TriplemPush?.requestMessagePush?.(created?.id)?.catch?.(() => {});
      optimisticRow?.remove();
      messagesUiState.userStarter = false;
      messagesUiState.pendingOpenId = created?.id || null;
      noteMessagingLocalMutation();
      await renderMessagesPanel();
      return;
    }

    const result = await supabaseRpc("app_reply_inquiry", {
      p_inquiry_id: threadId,
      p_body: body
    });
    window.TriplemPush?.requestMessagePush?.(threadId)?.catch?.(() => {});
    resetFloatingRuntimeForAccount();
    const cache = floatingMessageState.historyMap.get(threadId) || {
      inquiry: {}, messages: [], can_reply: true, server_message_count: 0, thread_signature: "", cached_at: Date.now()
    };
    const serverMessage = normalizeCachedMessage(result?.message);
    if (serverMessage && !cache.messages.some(message => String(message.id) === String(serverMessage.id))) cache.messages.push(serverMessage);
    const currentSummary = (messagesUiState.threads || []).find(item => String(item.id) === threadId) || floatingMessageState.threadMap.get(threadId) || {};
    const nextThread = { ...currentSummary, ...(result?.inquiry || {}) };
    floatingMessageState.threadMap.set(threadId, nextThread);
    cache.inquiry = { ...(cache.inquiry || {}), ...nextThread };
    cache.server_message_count = Math.max(Number(nextThread.message_count) || 0, Number(cache.server_message_count) || 0, cache.messages.length);
    cache.thread_signature = personalThreadSignature(nextThread);
    cache.cached_at = Date.now();
    floatingMessageState.historyMap.set(threadId, cache);
    floatingMessageState.knownSignatures.set(threadId, personalThreadSignature(nextThread));
    markFloatingThreadLocallyRead(nextThread);
    persistFloatingHistoryCache();
    optimisticRow?.remove();
    noteMessagingLocalMutation();
    await openInquiryThread(threadId, { silent: true });
    refreshAdminCommsBadges().catch(() => {});
  } catch (ex) {
    optimisticRow?.remove();
    if (input) input.value = body;
    input?.focus({ preventScroll: true });
    alert(ex.message || "Could not send reply.");
  } finally {
    if (btn) btn.disabled = false;
  }
}

function bindMessagingUi(){
  ensureFloatingMessageDock();
  bindMessagesFocusMode();
  const refreshBtn = document.getElementById("messagesRefreshBtn");
  if (refreshBtn) refreshBtn.addEventListener("click", () => renderMessagesPanel());

  const newBtn = document.getElementById("messagesNewBtn");
  if (newBtn) {
    newBtn.addEventListener("click", async () => {
      if (!isAppAdminSession()) {
        setMessagesComposerVisible(false);
        const preferred = preferredUserAdminThread(messagesUiState.threads);
        if (preferred?.id) await openInquiryThread(preferred.id);
        else showUserAdminConversationStarter();
        document.getElementById("messagesReplyInput")?.focus({ preventScroll: true });
        return;
      }
      setMessagesComposerVisible(true);
      await prepareMessagesComposer();
      document.getElementById("messagesUserSelect")?.focus();
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
        window.TriplemPush?.requestMessagePush?.(created?.id)?.catch?.(() => {});
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

  document.getElementById("messagesReplyBar")?.addEventListener("click", e => {
    const toggle = e.target.closest("[data-live-quick-toggle]");
    if (toggle) {
      e.preventDefault();
      e.stopPropagation();
      toggleLiveChatQuickMenu(toggle);
      return;
    }
    const chip = e.target.closest("[data-live-quick-reply]");
    if (!chip) return;
    e.preventDefault();
    const text = liveChatQuickReplyText(chip.dataset.liveQuickReply);
    const input = document.getElementById("messagesReplyInput");
    closeLiveChatQuickMenus();
    if (!text || !input) return;
    input.value = text;
    sendInquiryReply();
  });

  if (!document.documentElement.dataset.liveQuickReplyDismissBound) {
    document.documentElement.dataset.liveQuickReplyDismissBound = "1";
    document.addEventListener("pointerdown", e => {
      if (!e.target.closest(".live-chat-quick-replies")) closeLiveChatQuickMenus();
    }, { passive: true });
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeLiveChatQuickMenus(); });
  }

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
        const list = document.getElementById("adminNotifyList");
        const preservedScrollTop = list?.scrollTop || 0;
        adminCommsState.notifications = (adminCommsState.notifications || []).map(n => ({ ...n, is_read: true }));
        list?.querySelectorAll(".admin-comms-item.unread").forEach(row => row.classList.remove("unread"));
        list?.querySelectorAll("[data-notif-read]").forEach(btn => btn.remove());
        if (isAppAdminSession()) {
          await supabaseRpc("app_admin_mark_all_notifications_read", {}).catch(() => {});
        }
        await supabaseRpc("app_mark_all_my_notifications_read", {}).catch(() => {});
        adminCommsState.notificationDropdownSignature = "";
        await loadAdminNotificationsDropdown();
        if (list) { list.scrollTop = preservedScrollTop; requestAnimationFrame(() => { if (list.isConnected) list.scrollTop = preservedScrollTop; }); }
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
    const paymentBtn = e.target.closest("[data-subscription-review]");
    const liveAcceptBtn = e.target.closest("[data-live-chat-accept]");
    const liveDeclineBtn = e.target.closest("[data-live-chat-decline]");
    if (liveDeclineBtn) {
      e.preventDefault(); e.stopPropagation();
      try {
        liveDeclineBtn.disabled = true;
        await supabaseRpc(liveDeclineBtn.dataset.liveChatKind === "transfer" ? "app_live_chat_decline_transfer" : "app_live_chat_decline_assignment", { p_inquiry_id: liveDeclineBtn.dataset.liveChatDecline });
        await loadAdminNotificationsDropdown();
        await refreshAdminCommsBadges();
      } catch (ex) { alert(ex.message || "Could not decline this live chat."); }
      finally { liveDeclineBtn.disabled = false; }
      return;
    }
    if (liveAcceptBtn) {
      e.preventDefault(); e.stopPropagation();
      const nrow = e.target.closest("[data-notification-id]");
      const n = adminCommsState.notifications.find(x => x.id === nrow?.dataset.notificationId);
      document.querySelectorAll(".menu-dropdown.open").forEach(p => p.classList.remove("open"));
      if (n) await openLiveChatAssignmentDetails(n);
      return;
    }
    if (paymentBtn) {
      e.preventDefault(); e.stopPropagation();
      document.querySelectorAll(".menu-dropdown.open").forEach(p => p.classList.remove("open"));
      try {
        activate("admin");
        await openAdminSubscriptionReviewById(paymentBtn.dataset.subscriptionReview);
      } catch (ex) { alert(ex.message || "Could not open payment review."); }
      return;
    }
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
        const targetUser = (state.adminUsersCache || []).find(user => String(user.id) === String(userId));
        if (targetUser && typeof window.openAdminUserDetailsOverlay === "function") window.openAdminUserDetailsOverlay(targetUser);
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
        if (!(await appConfirmDelete("Delete this notification?", { title: "Delete notification?", confirmLabel: "Delete notification" }))) return;
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
        if (source === "user" && isLiveChatOfferNotification(n)) {
          document.querySelectorAll(".menu-dropdown.open").forEach(p => p.classList.remove("open"));
          if (isLiveChatTransferNotification(n)) syncLiveChatOfferDock([n]);
          else await openLiveChatAssignmentDetails(n);
        } else if (source === "user" && isSubscriptionUserNotification(n)) {
          document.querySelectorAll(".menu-dropdown.open").forEach(p => p.classList.remove("open"));
          await openSubscriptionNotificationDetails(n);
        } else if (n?.kind === "inquiry" && isLiveChatNotification(n)) {
          document.querySelectorAll(".menu-dropdown.open").forEach(p => p.classList.remove("open"));
          goToMessagesTab(n.related_inquiry_id || null, { compose: false });
          setTimeout(() => { if (n.related_inquiry_id) openInquiryThread(n.related_inquiry_id).catch(() => {}); }, 80);
        } else if (n?.kind === "inquiry" && isMemberAccessRequestNotification(n)) {
          document.querySelectorAll(".menu-dropdown.open").forEach(p => p.classList.remove("open"));
          await openAccessRequestDetails(n);
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
        } else if (n?.kind === "trial_signup" || n?.kind === "renewal_request" || n?.kind === "subscription_payment" || n?.kind === "access_expiry_warning" || n?.kind === "access_auto_disabled") {
          document.querySelectorAll(".menu-dropdown.open").forEach(p => p.classList.remove("open"));
          activate("admin");
          if (n.related_user_id) {
            await loadAdminUsers();
            const targetUser = (state.adminUsersCache || []).find(user => String(user.id) === String(n.related_user_id));
            if (targetUser && typeof window.openAdminUserDetailsOverlay === "function") window.openAdminUserDetailsOverlay(targetUser);
            if (n.kind === "subscription_payment" && n.payload?.request_id && typeof openAdminSubscriptionReviewById === "function") {
              try { await openAdminSubscriptionReviewById(n.payload.request_id); } catch (reviewErr) { console.warn("Payment review could not be opened:", reviewErr); }
            }
          }
        }
      }
    } catch (ex) {
      alert(ex.message || "Action failed.");
    }
  });
document.getElementById("adminMessagesPreviewList")?.addEventListener("click", async e => {
    const floatBtn = e.target.closest("[data-preview-inquiry]");
    if (!floatBtn) return;
    e.preventDefault();
    e.stopPropagation();
    document.querySelectorAll(".menu-dropdown.open").forEach(p => p.classList.remove("open"));
    const id = String(floatBtn.dataset.previewInquiry || "");
    const thread = (adminCommsState.inquiryPreview || []).find(item => String(item.id) === id);
    if (thread) revealFloatingThread(thread, { open: true, focus: true });
  });

  document.getElementById("messagesThreadHeader")?.addEventListener("click", async e => {
    const backBtn = e.target.closest("[data-messages-back]");
    const statusBtn = e.target.closest("[data-inquiry-status]");
    const adminDel = e.target.closest("[data-inquiry-delete]");
    const myDel = e.target.closest("[data-my-inquiry-delete]");
    const supportEnd = e.target.closest("[data-live-chat-agent-end]");
    const supportTransfer = e.target.closest("[data-live-chat-transfer]");
    try {
      if (supportTransfer) { await openLiveChatTransferModal(supportTransfer.dataset.liveChatTransfer); return; }
      if (supportEnd) {
        if (!(await appConfirmDelete("End this live support chat? The visitor will see a closing message and can start a new chat if needed.", { title: "End live chat?", confirmLabel: "End chat" }))) return;
        await supabaseRpc("app_live_chat_agent_end", { p_inquiry_id: supportEnd.dataset.liveChatAgentEnd });
        messagesUiState.selectedId = null;
        noteMessagingLocalMutation();
        await renderMessagesPanel();
        await refreshAdminCommsBadges();
        return;
      }
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
        if (!(await appConfirmDelete("Permanently delete this conversation? This cannot be undone.", { title: "Delete conversation permanently?", confirmLabel: "Delete permanently", note: "This removes the conversation permanently and cannot be undone." }))) return;
        await supabaseRpc("app_admin_delete_inquiry", { p_inquiry_id: adminDel.dataset.inquiryDelete });
        messagesUiState.selectedId = null;
        noteMessagingLocalMutation();
        closeMessagesConversationView();
        await renderMessagesPanel();
        await refreshAdminCommsBadges();
        return;
      }
      if (myDel) {
        if (!(await appConfirmDelete("Delete this conversation?", { title: "Delete conversation?", confirmLabel: "Delete conversation" }))) return;
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
  const planBtn = document.getElementById("planSubscriptionBtn");
  const weakPwBtn = els.weakPasswordBannerBtn || document.getElementById("weakPasswordBannerBtn");
  if (refreshBtn) refreshBtn.addEventListener("click", () => loadAdminUsers());
  if (createBtn) createBtn.addEventListener("click", () => openAdminCreateUserModal());
  if (storageBtn) storageBtn.addEventListener("click", () => openAdminStorageManagementModal());
  if (accountBtn) accountBtn.addEventListener("click", () => openAccountSettingsModal());
  if (planBtn) planBtn.addEventListener("click", () => { document.querySelectorAll(".menu-dropdown.open").forEach(p => p.classList.remove("open")); openPlanSubscriptionModal(); });
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
  // Non-auth startup helpers must never prevent remembered-session recovery.
  try {
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
  } catch (bootInitErr) {
    console.warn("Non-critical startup initialization failed; continuing to authentication.", bootInitErr);
  }

  try {
    await autoLogin();
  } catch (authBootErr) {
    console.error("Automatic sign-in bootstrap failed.", authBootErr);
    try { clearAuthResumingUi(); } catch (_) {
      try { document.documentElement.classList.remove("auth-resuming"); } catch (_) {}
    }
    try {
      if (els.lockScreen) {
        els.lockScreen.classList.remove("hide");
        els.lockScreen.style.display = "";
      }
      if (els.welcomeScreen) els.welcomeScreen.classList.add("hide");
      if (els.lockError) {
        els.lockError.textContent = "Saved sign-in could not resume. Please sign in again.";
        els.lockError.classList.add("show");
      }
    } catch (_) {}
  }

  try { handleUrlHash(); } catch (_) {}
  if (!state.unlocked) initTrialPromoOverlay().catch(() => {});
}

// 14-day free trial promo overlay (landing / sign-in)
const trialPromoUiState = {
  showFraudAfterDismiss: false,
  infoSequenceActive: false
};

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

function dismissTrialPromoOverlay(options = {}){
  const overlay = document.getElementById("trialPromoOverlay");
  if (!overlay) return;
  overlay.classList.add("hide");
  overlay.setAttribute("aria-hidden", "true");
  try {
    sessionStorage.setItem(TRIAL_PROMO_DISMISS_KEY, "1");
  } catch {}
  let showFraud = false;
  if (options.showFraud === true) showFraud = true;
  else if (options.showFraud === false) showFraud = false;
  else showFraud = !!(trialPromoUiState.showFraudAfterDismiss || trialPromoUiState.infoSequenceActive);
  trialPromoUiState.showFraudAfterDismiss = false;
  trialPromoUiState.infoSequenceActive = false;
  if (showFraud && typeof showFraudAlertOverlay === "function") {
    window.setTimeout(() => showFraudAlertOverlay(), 180);
  }
}

function showTrialPromoOverlay(){
  const overlay = document.getElementById("trialPromoOverlay");
  if (!overlay) return;
  try { if (typeof dismissFraudAlertOverlay === "function") dismissFraudAlertOverlay(); } catch (_) {}
  overlay.classList.remove("hide");
  overlay.setAttribute("aria-hidden", "false");
  document.getElementById("trialPromoStartBtn")?.focus();
}

function dismissFraudAlertOverlay(){
  const overlay = document.getElementById("fraudAlertOverlay");
  if (!overlay) return;
  overlay.classList.add("hide");
  overlay.setAttribute("aria-hidden", "true");
}

function showFraudAlertOverlay(){
  const overlay = document.getElementById("fraudAlertOverlay");
  if (!overlay) return;
  overlay.classList.remove("hide");
  overlay.setAttribute("aria-hidden", "false");
  document.getElementById("fraudAlertAckBtn")?.focus();
}

function openTrialFraudInfoSequence(){
  // Landing notices are intentionally user-triggered. Keep this legacy helper
  // as a trial-info opener without chaining Fraud Alert afterwards.
  trialPromoUiState.infoSequenceActive = false;
  trialPromoUiState.showFraudAfterDismiss = false;
  try { closeSignInOverlay(); } catch (_) {}
  showTrialPromoOverlay();
}

function initFraudAlertOverlay(){
  const overlay = document.getElementById("fraudAlertOverlay");
  if (!overlay || overlay.dataset.fraudBound === "1") return;
  overlay.dataset.fraudBound = "1";

  overlay.querySelectorAll("[data-fraud-alert-dismiss]").forEach(el => {
    el.addEventListener("click", () => dismissFraudAlertOverlay());
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (overlay.classList.contains("hide")) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    dismissFraudAlertOverlay();
  }, true);
}

async function initTrialPromoOverlay(){
  const overlay = document.getElementById("trialPromoOverlay");
  if (!overlay) return;

  initFraudAlertOverlay();

  const closeBtn = document.getElementById("trialPromoCloseBtn");
  if (closeBtn && closeBtn.dataset.fraudHook !== "1") {
    closeBtn.dataset.fraudHook = "1";
    closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dismissTrialPromoOverlay({ showFraud: false });
    });
  }

  const dismissors = overlay.querySelectorAll("[data-trial-promo-dismiss]");
  dismissors.forEach(el => {
    if (el === closeBtn) return; // Cross button handled above → Fraud Alert
    el.addEventListener("click", () => dismissTrialPromoOverlay());
  });

  const startBtn = document.getElementById("trialPromoStartBtn");
  if (startBtn) {
    startBtn.addEventListener("click", () => {
      trialPromoUiState.showFraudAfterDismiss = false;
      trialPromoUiState.infoSequenceActive = false;
      dismissTrialPromoOverlay({ showFraud: false });
      openTrialSignupModal();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (overlay.classList.contains("hide")) return;
    const fraud = document.getElementById("fraudAlertOverlay");
    if (fraud && !fraud.classList.contains("hide")) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    dismissTrialPromoOverlay();
  }, true);

  // Promotional and fraud overlays must never interrupt a visitor on page load.
  // They are available through two explicit, separate landing-page controls.
  document.querySelectorAll("[data-trial-promo-open]").forEach((trigger) => {
    if (trigger.dataset.trialPromoBound === "1") return;
    trigger.dataset.trialPromoBound = "1";
    trigger.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      trialPromoUiState.infoSequenceActive = false;
      trialPromoUiState.showFraudAfterDismiss = false;
      showTrialPromoOverlay();
    });
  });
  document.querySelectorAll("[data-fraud-alert-open]").forEach((trigger) => {
    if (trigger.dataset.fraudAlertBound === "1") return;
    trigger.dataset.fraudAlertBound = "1";
    trigger.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dismissTrialPromoOverlay({ showFraud: false });
      showFraudAlertOverlay();
    });
  });

  // No automatic timeout/show sequence. Visitors choose when to open either notice.
  return;
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
