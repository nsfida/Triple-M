/* Triplem VIP landing Live Chat Support — temporary two-hour guest conversation. */
(() => {
  "use strict";

  const STORAGE_KEY = "triplem_landing_live_chat_v1";
  const FALLBACK_TTL_MS = 2 * 60 * 60 * 1000;
  const POLL_OPEN_MS = 2500;
  const POLL_HIDDEN_MS = 6000;
  let pollTimer = null;
  let session = null;
  let lastRenderSignature = "";
  let lastSeenAdminMessageId = "";
  let availability = null;

  const $ = (id) => document.getElementById(id);
  const els = {};

  function safeText(value) {
    return String(value ?? "");
  }

  function escape(value) {
    if (typeof window.escapeHtml === "function") return window.escapeHtml(safeText(value));
    return safeText(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function localAvailability() {
    try {
      const hour = Number(new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Dubai",
        hour: "2-digit",
        hourCycle: "h23"
      }).format(new Date()));
      const open = Number.isFinite(hour) && hour >= 10 && hour < 17;
      return {
        timezone: "GST",
        timezone_name: "Gulf Standard Time",
        hours_label: "10:00 AM – 5:00 PM GST",
        is_open: open,
        status_label: open ? "Support is online" : "Support is currently offline",
        wait_label: open ? "Typical response: within 15–30 minutes" : "Replies resume from 10:00 AM GST"
      };
    } catch (_) {
      return {
        timezone: "GST",
        timezone_name: "Gulf Standard Time",
        hours_label: "10:00 AM – 5:00 PM GST",
        is_open: false,
        status_label: "Live support",
        wait_label: "Support hours: 10:00 AM – 5:00 PM GST"
      };
    }
  }

  function normalizeSession(raw) {
    if (!raw || typeof raw !== "object") return null;
    const inquiryId = safeText(raw.inquiry_id).trim();
    const guestToken = safeText(raw.guest_token).trim();
    const expiresMs = new Date(raw.expires_at || 0).getTime();
    if (!inquiryId || !guestToken || !Number.isFinite(expiresMs) || expiresMs <= Date.now()) return null;
    return {
      inquiry_id: inquiryId,
      guest_token: guestToken,
      expires_at: new Date(expiresMs).toISOString(),
      contact: raw.contact && typeof raw.contact === "object" ? raw.contact : {},
      messages: Array.isArray(raw.messages) ? raw.messages.slice(-200) : [],
      closed: raw.closed === true,
      saved_at: Number(raw.saved_at) || Date.now()
    };
  }

  function loadSession() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      const normalized = normalizeSession(parsed);
      if (!normalized) localStorage.removeItem(STORAGE_KEY);
      return normalized;
    } catch (_) {
      try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
      return null;
    }
  }

  function persistSession() {
    if (!session) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...session, saved_at: Date.now() }));
    } catch (_) {}
  }

  function clearSession({ keepPanel = true } = {}) {
    session = null;
    lastRenderSignature = "";
    lastSeenAdminMessageId = "";
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    document.body.classList.remove("landing-live-chat-active");
    els.launcher?.classList.remove("has-unread");
    stopPolling();
    showStartView();
    if (!keepPanel) closePanel();
  }

  function setAvailability(next) {
    availability = next && typeof next === "object" ? next : localAvailability();
    const open = availability.is_open === true || availability.is_open === "true";
    if (els.status) {
      els.status.classList.toggle("is-open", open);
      els.status.classList.toggle("is-closed", !open);
      els.status.innerHTML = `<span class="landing-live-chat-status-dot"></span><div><strong>${escape(availability.status_label || (open ? "Support is online" : "Support is currently offline"))}</strong><small>${escape(availability.wait_label || "10:00 AM – 5:00 PM GST")}</small></div>`;
    }
    if (els.availability) els.availability.textContent = availability.hours_label || "10:00 AM – 5:00 PM GST";
    els.launcher?.classList.toggle("is-online", open);
  }

  function showError(el, message) {
    if (!el) return;
    el.textContent = safeText(message);
    el.classList.toggle("hide", !message);
  }

  function openPanel() {
    if (!els.panel) return;
    els.panel.classList.remove("hide");
    els.panel.setAttribute("aria-hidden", "false");
    els.launcher?.classList.remove("has-unread");
    if (session) {
      showConversationView();
      refreshThread({ silent: true }).catch(() => {});
      startPolling();
      requestAnimationFrame(() => els.reply?.focus({ preventScroll: true }));
    } else {
      showStartView();
      requestAnimationFrame(() => els.name?.focus({ preventScroll: true }));
    }
  }

  function closePanel() {
    if (!els.panel) return;
    els.panel.classList.add("hide");
    els.panel.setAttribute("aria-hidden", "true");
  }

  function showStartView() {
    els.startView?.classList.remove("hide");
    els.conversation?.classList.add("hide");
    if (session?.contact) {
      if (els.name && !els.name.value) els.name.value = safeText(session.contact.name);
      if (els.phone && !els.phone.value) els.phone.value = safeText(session.contact.phone);
      if (els.email && !els.email.value) els.email.value = safeText(session.contact.email);
    }
  }

  function showConversationView() {
    if (!session) return showStartView();
    document.body.classList.add("landing-live-chat-active");
    els.startView?.classList.add("hide");
    els.conversation?.classList.remove("hide");
    updateExpiryLabel();
    renderMessages(session.messages || []);
  }

  function messageSignature(messages) {
    return (messages || []).map(m => `${m.id || ""}:${m.sender_role || ""}:${m.created_at || ""}:${m.body || ""}`).join("|");
  }

  function renderMessages(messages) {
    if (!els.messages) return;
    const rows = Array.isArray(messages) ? messages : [];
    const signature = messageSignature(rows);
    if (signature === lastRenderSignature) return;
    const wasNearBottom = els.messages.scrollHeight - els.messages.scrollTop - els.messages.clientHeight < 72;
    const previousAdmin = lastSeenAdminMessageId;
    const latestAdmin = [...rows].reverse().find(m => String(m.sender_role || "") === "admin");
    lastSeenAdminMessageId = latestAdmin?.id || lastSeenAdminMessageId;
    els.messages.innerHTML = rows.length ? rows.map(m => {
      const fromGuest = String(m.sender_role || "") !== "admin";
      const label = fromGuest ? "You" : "Triplem VIP Support";
      const when = formatChatTime(m.created_at);
      const avatar = fromGuest
        ? `<span class="landing-live-chat-avatar is-user" aria-hidden="true"><i class="fa-solid fa-user"></i></span>`
        : `<span class="landing-live-chat-avatar is-brand" aria-hidden="true"><img src="Assets/logo/logo.png" alt="" /></span>`;
      return `<div class="landing-live-chat-message-row ${fromGuest ? "is-guest" : "is-admin"}">${fromGuest ? "" : avatar}<div class="landing-live-chat-message ${fromGuest ? "is-guest" : "is-admin"}"><div class="landing-live-chat-message-meta"><strong>${escape(label)}</strong><span>${escape(when)}</span></div><p>${escape(m.body)}</p></div>${fromGuest ? avatar : ""}</div>`;
    }).join("") : `<div class="landing-live-chat-empty">No messages yet.</div>`;
    lastRenderSignature = signature;
    if (wasNearBottom || !previousAdmin) requestAnimationFrame(() => { els.messages.scrollTop = els.messages.scrollHeight; });
    if (previousAdmin && latestAdmin?.id && latestAdmin.id !== previousAdmin && els.panel?.classList.contains("hide")) {
      els.launcher?.classList.add("has-unread");
    }
  }

  function formatChatTime(value) {
    const d = new Date(value || Date.now());
    if (Number.isNaN(d.getTime())) return "Now";
    try {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch (_) { return "Now"; }
  }

  function updateExpiryLabel() {
    if (!session || !els.expiry) return;
    const expires = new Date(session.expires_at).getTime();
    const remaining = expires - Date.now();
    if (remaining <= 0) {
      els.expiry.textContent = "This temporary chat has expired";
      clearSession({ keepPanel: true });
      return;
    }
    const mins = Math.max(1, Math.ceil(remaining / 60000));
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    els.expiry.textContent = hours > 0
      ? `Temporary chat resets in ${hours}h ${minutes}m`
      : `Temporary chat resets in ${minutes}m`;
  }

  async function refreshAvailability() {
    const fallback = localAvailability();
    setAvailability(fallback);
    try {
      const result = await supabaseRpc("app_live_chat_availability", {});
      setAvailability(result);
    } catch (_) {}
  }

  async function refreshThread({ silent = false } = {}) {
    if (!session) return;
    if (new Date(session.expires_at).getTime() <= Date.now()) {
      clearSession({ keepPanel: true });
      return;
    }
    try {
      const result = await supabaseRpc("app_public_live_chat_thread", {
        p_inquiry_id: session.inquiry_id,
        p_guest_token: session.guest_token
      });
      if (result?.expires_at) session.expires_at = result.expires_at;
      if (Array.isArray(result?.messages)) session.messages = result.messages.slice(-200);
      session.closed = result?.chat_closed === true;
      if (result?.availability) setAvailability(result.availability);
      persistSession();
      renderMessages(session.messages);
      updateExpiryLabel();
      updateReplyState();
    } catch (error) {
      const message = safeText(error?.message || "");
      if (/expired|unavailable|not found/i.test(message)) {
        clearSession({ keepPanel: true });
        showError(els.startError, "Your temporary live chat has expired. Start a new chat if you still need help.");
      } else if (!silent) {
        showError(els.replyError, message || "Could not refresh live chat.");
      }
    }
  }

  function updateReplyState() {
    const closed = session?.closed === true;
    if (els.reply) {
      els.reply.disabled = closed;
      els.reply.placeholder = closed ? "This chat has ended" : "Write a message…";
    }
    if (els.replyButton) els.replyButton.disabled = closed;
    if (els.restartButton) els.restartButton.classList.toggle("hide", !closed);
    if (closed) showError(els.replyError, "This live chat has ended. You can start a new conversation whenever you need further assistance.");
    else if (els.replyError?.textContent?.includes("live chat has ended")) showError(els.replyError, "");
  }

  function startPolling() {
    stopPolling();
    if (!session) return;
    const tick = async () => {
      if (!session) return;
      updateExpiryLabel();
      await refreshThread({ silent: true });
      if (!session) return;
      const delay = document.hidden ? POLL_HIDDEN_MS : POLL_OPEN_MS;
      pollTimer = window.setTimeout(tick, delay);
    };
    pollTimer = window.setTimeout(tick, 800);
  }

  function stopPolling() {
    if (pollTimer) window.clearTimeout(pollTimer);
    pollTimer = null;
  }

  async function startChat(event) {
    event.preventDefault();
    showError(els.startError, "");
    const name = safeText(els.name?.value).trim();
    const phone = safeText(els.phone?.value).trim();
    const email = safeText(els.email?.value).trim();
    const message = safeText(els.message?.value).trim();
    if (!name || !phone || !email || !message) {
      showError(els.startError, "Please complete your name, contact number, email and message.");
      return;
    }
    const button = els.startButton;
    if (button) { button.disabled = true; button.classList.add("loading"); }
    try {
      const result = await supabaseRpc("app_public_live_chat_start", {
        p_name: name,
        p_mobile: phone,
        p_email: email,
        p_message: message
      });
      const expiresAt = result?.expires_at || new Date(Date.now() + FALLBACK_TTL_MS).toISOString();
      session = normalizeSession({
        inquiry_id: result?.inquiry_id,
        guest_token: result?.guest_token,
        expires_at: expiresAt,
        contact: { name, phone, email },
        messages: Array.isArray(result?.messages) ? result.messages : []
      });
      if (!session) throw new Error("Live chat could not be started.");
      if (result?.availability) setAvailability(result.availability);
      persistSession();
      showConversationView();
      updateReplyState();
      startPolling();
      if (els.message) els.message.value = "";
      requestAnimationFrame(() => els.reply?.focus({ preventScroll: true }));
    } catch (error) {
      showError(els.startError, error?.message || "Live chat could not be started. Please try again.");
    } finally {
      if (button) { button.disabled = false; button.classList.remove("loading"); }
    }
  }

  async function sendReply(event) {
    event.preventDefault();
    if (!session || session.closed) return;
    const body = safeText(els.reply?.value).trim();
    if (!body) return;
    showError(els.replyError, "");
    if (els.replyButton) els.replyButton.disabled = true;
    try {
      const result = await supabaseRpc("app_public_live_chat_reply", {
        p_inquiry_id: session.inquiry_id,
        p_guest_token: session.guest_token,
        p_body: body
      });
      if (result?.message) {
        const messages = Array.isArray(session.messages) ? session.messages.slice() : [];
        if (!messages.some(m => String(m.id) === String(result.message.id))) messages.push(result.message);
        session.messages = messages.slice(-200);
      }
      if (els.reply) els.reply.value = "";
      persistSession();
      renderMessages(session.messages);
      requestAnimationFrame(() => { if (els.messages) els.messages.scrollTop = els.messages.scrollHeight; });
      refreshThread({ silent: true }).catch(() => {});
    } catch (error) {
      const message = error?.message || "Message could not be sent.";
      showError(els.replyError, message);
      if (/expired|unavailable/i.test(message)) clearSession({ keepPanel: true });
    } finally {
      if (els.replyButton) els.replyButton.disabled = false;
    }
  }

  async function resetChat() {
    if (!session) return clearSession({ keepPanel: true });
    let proceed = true;
    if (typeof window.appConfirmDelete === "function") {
      proceed = await window.appConfirmDelete("End this temporary landing-page chat? The administrator will retain the support record, but this browser will forget the two-hour guest access token.", {
        title: "End live chat?",
        confirmLabel: "End chat"
      });
    } else {
      proceed = window.confirm("End this temporary live chat on this browser?");
    }
    if (proceed) clearSession({ keepPanel: true });
  }

  function bind() {
    els.panel = $("landingLiveChatPanel");
    els.launcher = $("landingLiveChatLauncher");
    els.status = $("landingLiveChatStatus");
    els.availability = $("landingLiveChatAvailability");
    els.startView = $("landingLiveChatStartView");
    els.conversation = $("landingLiveChatConversation");
    els.startForm = $("landingLiveChatStartForm");
    els.name = $("landingLiveChatName");
    els.phone = $("landingLiveChatPhone");
    els.email = $("landingLiveChatEmail");
    els.message = $("landingLiveChatMessage");
    els.startButton = $("landingLiveChatStartButton");
    els.startError = $("landingLiveChatStartError");
    els.messages = $("landingLiveChatMessages");
    els.expiry = $("landingLiveChatExpiryText");
    els.replyForm = $("landingLiveChatReplyForm");
    els.reply = $("landingLiveChatReply");
    els.replyButton = $("landingLiveChatReplyButton");
    els.replyError = $("landingLiveChatReplyError");
    els.restartButton = $("landingLiveChatRestartButton");

    if (!els.panel || !els.launcher) return;
    document.querySelectorAll("[data-live-chat-open]").forEach(btn => btn.addEventListener("click", event => {
      event.preventDefault();
      if (typeof window.setLandingMobileMenuOpen === "function") window.setLandingMobileMenuOpen(false);
      else document.getElementById("landingMobileMenu")?.classList.add("hide");
      const launcherToggle = btn === els.launcher;
      const panelOpen = !els.panel.classList.contains("hide");
      if (launcherToggle && panelOpen) closePanel();
      else openPanel();
    }));
    document.querySelectorAll("[data-live-chat-close]").forEach(btn => btn.addEventListener("click", closePanel));
    document.querySelectorAll("[data-live-chat-reset]").forEach(btn => btn.addEventListener("click", () => resetChat().catch(() => {})));
    els.startForm?.addEventListener("submit", startChat);
    els.replyForm?.addEventListener("submit", sendReply);
    els.restartButton?.addEventListener("click", () => {
      clearSession({ keepPanel: true });
      window.setTimeout(() => els.name?.focus(), 60);
    });
    els.reply?.addEventListener("input", () => {
      els.reply.style.height = "auto";
      els.reply.style.height = `${Math.min(96, Math.max(38, els.reply.scrollHeight))}px`;
    });
    document.addEventListener("visibilitychange", () => {
      if (session) startPolling();
    });
    window.addEventListener("storage", event => {
      if (event.key !== STORAGE_KEY) return;
      session = loadSession();
      if (session) { showConversationView(); startPolling(); }
      else clearSession({ keepPanel: true });
    });
    const publicLockScreen = document.getElementById("lockScreen");
    if (publicLockScreen && typeof MutationObserver === "function") {
      new MutationObserver(() => {
        const publicVisible = !publicLockScreen.classList.contains("hide");
        if (!publicVisible) {
          closePanel();
          stopPolling();
        } else if (session) {
          startPolling();
        }
      }).observe(publicLockScreen, { attributes: true, attributeFilter: ["class"] });
    }

    session = loadSession();
    setAvailability(localAvailability());
    refreshAvailability().catch(() => {});
    if (session) {
      document.body.classList.add("landing-live-chat-active");
      showConversationView();
      refreshThread({ silent: true }).catch(() => {});
      startPolling();
    } else {
      showStartView();
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, { once: true });
  else bind();
})();
