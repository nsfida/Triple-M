/* Triplem VIP landing AI + Human Live Support — temporary two-hour guest conversation. */
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
  let startSending = false;
  let replySending = false;
  let aiGenerating = false;
  let aiGenerationStartedAt = 0;

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
      support_mode: safeText(raw.support_mode || "legacy_human").trim() || "legacy_human",
      support_label: safeText(raw.support_label || "").trim(),
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
    aiGenerating = false;
    aiGenerationStartedAt = 0;
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
      const humanState = open ? "Human support is online" : "Human support is currently offline";
      const humanWait = availability.wait_label || "Human support hours: 10:00 AM – 5:00 PM GST";
      els.status.innerHTML = `<span class="landing-live-chat-status-dot"></span><div><strong>${escape(humanState)}</strong><small>${escape(`AI available 24/7 · ${humanWait}`)}</small></div>`;
    }
    if (els.availability) els.availability.textContent = "AI available 24/7 · Human support 10:00 AM – 5:00 PM GST";
    els.launcher?.classList.toggle("is-online", open);
  }

  function setSupportIdentity(mode, label = "") {
    if (!els.identity) return;
    const state = safeText(mode || "ai").trim().toLowerCase();
    let title = "Triplem VIP AI Assistant";
    let detail = "AI-generated replies · Triplem VIP only · ask for a human agent anytime";
    let icon = "fa-wand-magic-sparkles";
    let stateClass = "is-ai";

    if (state === "human_pending") {
      title = "Human support requested";
      detail = "AI replies are paused · waiting for a real support agent";
      icon = "fa-user-clock";
      stateClass = "is-pending";
    } else if (state === "human") {
      title = label || "Triplem VIP Support Agent";
      detail = "Real Triplem VIP support representative · live conversation";
      icon = "fa-headset";
      stateClass = "is-human";
    } else if (state === "closed") {
      title = "Support conversation ended";
      detail = "Start a new chat whenever you need further assistance";
      icon = "fa-circle-check";
      stateClass = "is-closed";
    } else if (state === "legacy_human") {
      title = label || "Triplem VIP Live Support";
      detail = "Existing human-support conversation";
      icon = "fa-headset";
      stateClass = "is-human";
    }

    els.identity.className = `landing-live-chat-identity ${stateClass}`;
    els.identity.innerHTML = `<span class="landing-live-chat-identity-icon" aria-hidden="true"><i class="fa-solid ${escape(icon)}"></i></span><div><strong>${escape(title)}</strong><small>${escape(detail)}</small></div>`;
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
    setSupportIdentity("ai", "Triplem VIP AI Assistant");
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
    setSupportIdentity(session.support_mode, session.support_label);
    updateExpiryLabel();
    renderMessages(session.messages || []);
  }

  function isAiMessage(message) {
    const actor = safeText(message?.message_actor || message?.support_actor || "").toLowerCase();
    return actor === "ai" || message?.is_ai === true;
  }

  function messageSignature(messages) {
    const rows = (messages || []).map(m => `${m.id || ""}:${m.sender_role || ""}:${m.message_actor || m.support_actor || ""}:${m.sender_label || ""}:${m.created_at || ""}:${m.body || ""}`).join("|");
    return `${rows}|ai-generating:${aiGenerating ? "1" : "0"}`;
  }

  function aiThinkingMarkup() {
    return `<div class="landing-live-chat-message-row is-admin is-ai is-thinking" role="status" aria-live="polite"><span class="landing-live-chat-avatar is-brand is-ai" aria-hidden="true"><img src="Assets/logo/logo.png" alt="" /></span><div class="landing-live-chat-message is-admin is-ai landing-live-chat-thinking"><div class="landing-live-chat-message-meta"><span class="landing-live-chat-message-who"><strong>Triplem VIP AI Assistant</strong><em class="landing-live-chat-actor-badge is-ai">AI</em></span><span>Generating</span></div><p><span>Generating a response</span><span class="landing-live-chat-thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span></p></div></div>`;
  }

  function setAiGenerating(active) {
    const next = active === true;
    if (next && !aiGenerating) aiGenerationStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (!next) aiGenerationStartedAt = 0;
    aiGenerating = next;
    lastRenderSignature = "";
    if (session) renderMessages(session.messages || []);
  }

  function aiThinkingDelay(question, answer) {
    const qLen = safeText(question).trim().length;
    const aLen = safeText(answer).trim().length;
    const complexity = Math.min(850, qLen * 7) + Math.min(950, aLen * 2.1);
    return Math.round(Math.max(1250, Math.min(3300, 900 + complexity)));
  }

  function wait(ms) {
    return new Promise(resolve => window.setTimeout(resolve, Math.max(0, Number(ms) || 0)));
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
    const messageHtml = rows.length ? rows.map(m => {
      const fromGuest = String(m.sender_role || "") !== "admin";
      const actor = fromGuest ? "visitor" : safeText(m.message_actor || m.support_actor || (m.sender_id ? "agent" : "system")).toLowerCase();
      const isAi = actor === "ai" || m.is_ai === true;
      const isHuman = actor === "agent";
      const label = fromGuest ? "You" : (m.sender_label || (isAi ? "Triplem VIP AI Assistant" : isHuman ? "Triplem VIP Support Agent" : "Triplem VIP Support"));
      const badge = fromGuest ? "" : `<em class="landing-live-chat-actor-badge ${isAi ? "is-ai" : isHuman ? "is-human" : "is-system"}">${isAi ? "AI" : isHuman ? "Human" : "System"}</em>`;
      const when = formatChatTime(m.created_at);
      const avatar = fromGuest
        ? `<span class="landing-live-chat-avatar is-user" aria-hidden="true"><i class="fa-solid fa-user"></i></span>`
        : `<span class="landing-live-chat-avatar is-brand ${isAi ? "is-ai" : isHuman ? "is-human" : "is-system"}" aria-hidden="true"><img src="Assets/logo/logo.png" alt="" /></span>`;
      const actorClass = fromGuest ? "is-guest" : isAi ? "is-ai" : isHuman ? "is-human" : "is-system";
      return `<div class="landing-live-chat-message-row ${fromGuest ? "is-guest" : "is-admin"} ${actorClass}">${fromGuest ? "" : avatar}<div class="landing-live-chat-message ${fromGuest ? "is-guest" : "is-admin"} ${actorClass}"><div class="landing-live-chat-message-meta"><span class="landing-live-chat-message-who"><strong>${escape(label)}</strong>${badge}</span><span>${escape(when)}</span></div><p>${escape(m.body)}</p></div>${fromGuest ? avatar : ""}</div>`;
    }).join("") : (aiGenerating ? "" : `<div class="landing-live-chat-empty">No messages yet.</div>`);
    els.messages.innerHTML = messageHtml + (aiGenerating ? aiThinkingMarkup() : "");
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
    if (!session || aiGenerating) return;
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
      if (result?.support_mode) session.support_mode = safeText(result.support_mode);
      if (result?.support_label) session.support_label = safeText(result.support_label);
      session.closed = result?.chat_closed === true;
      if (session.closed) session.support_mode = "closed";
      if (result?.availability) setAvailability(result.availability);
      persistSession();
      setSupportIdentity(session.support_mode, session.support_label);
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
      const mode = safeText(session?.support_mode || "legacy_human");
      els.reply.placeholder = closed ? "This chat has ended"
        : aiGenerating ? "AI is generating a response…"
        : mode === "ai" ? "Ask the Triplem VIP AI Assistant…"
        : mode === "human_pending" ? "Add a message for the human support agent…"
        : "Write a message to Triplem VIP Support…";
    }
    if (els.replyButton) els.replyButton.disabled = closed || replySending || startSending;
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
      if (replySending || startSending || aiGenerating) {
        pollTimer = window.setTimeout(tick, 800);
        return;
      }
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
    if (startSending) return;
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
    startSending = true;
    if (button) { button.disabled = true; button.classList.add("loading"); }
    try {
      const result = await supabaseRpc("app_public_live_chat_start", {
        p_name: name,
        p_mobile: phone,
        p_email: email,
        p_message: message
      });
      const expiresAt = result?.expires_at || new Date(Date.now() + FALLBACK_TTL_MS).toISOString();
      const returnedMessages = Array.isArray(result?.messages) ? result.messages.slice(-200) : [];
      const initialAi = [...returnedMessages].reverse().find(isAiMessage) || null;
      const visibleMessages = initialAi
        ? returnedMessages.filter(m => String(m.id || "") !== String(initialAi.id || ""))
        : returnedMessages;
      session = normalizeSession({
        inquiry_id: result?.inquiry_id,
        guest_token: result?.guest_token,
        expires_at: expiresAt,
        contact: { name, phone, email },
        messages: visibleMessages,
        support_mode: result?.support_mode || (result?.ai_available === true ? "ai" : "legacy_human"),
        support_label: result?.support_label || (result?.ai_available === true ? "Triplem VIP AI Assistant" : "Triplem VIP Live Support")
      });
      if (!session) throw new Error("Live chat could not be started.");
      if (result?.availability) setAvailability(result.availability);
      persistSession();
      showConversationView();
      updateReplyState();
      if (els.message) els.message.value = "";

      if (initialAi) {
        setAiGenerating(true);
        updateReplyState();
        const planned = aiThinkingDelay(message, initialAi.body);
        const elapsed = (typeof performance !== "undefined" ? performance.now() : Date.now()) - aiGenerationStartedAt;
        await wait(Math.max(0, planned - elapsed));
        if (!session) return;
        const rows = Array.isArray(session.messages) ? session.messages.slice() : [];
        if (!rows.some(m => String(m.id) === String(initialAi.id))) rows.push(initialAi);
        session.messages = rows.slice(-200);
        setAiGenerating(false);
        persistSession();
        setSupportIdentity(session.support_mode, session.support_label);
        updateReplyState();
        renderMessages(session.messages);
      }

      startPolling();
      requestAnimationFrame(() => els.reply?.focus({ preventScroll: true }));
    } catch (error) {
      showError(els.startError, error?.message || "Live chat could not be started. Please try again.");
    } finally {
      startSending = false;
      if (button) { button.disabled = false; button.classList.remove("loading"); }
      updateReplyState();
    }
  }

  async function sendReply(event) {
    event.preventDefault();
    if (replySending || !session || session.closed) return;
    const body = safeText(els.reply?.value).trim();
    if (!body) return;
    showError(els.replyError, "");
    replySending = true;
    stopPolling();
    if (els.replyButton) els.replyButton.disabled = true;

    const modeBeforeSend = safeText(session.support_mode || "legacy_human").toLowerCase();
    const optimisticId = `local-guest-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const optimisticMessage = {
      id: optimisticId,
      sender_role: "guest",
      body,
      created_at: new Date().toISOString(),
      message_actor: "visitor"
    };
    session.messages = [...(Array.isArray(session.messages) ? session.messages : []), optimisticMessage].slice(-200);
    if (els.reply) {
      els.reply.value = "";
      els.reply.style.height = "38px";
    }
    renderMessages(session.messages);
    requestAnimationFrame(() => { if (els.messages) els.messages.scrollTop = els.messages.scrollHeight; });
    if (modeBeforeSend === "ai") setAiGenerating(true);
    updateReplyState();

    try {
      const result = await supabaseRpc("app_public_live_chat_reply", {
        p_inquiry_id: session.inquiry_id,
        p_guest_token: session.guest_token,
        p_body: body
      });

      let messages = (Array.isArray(session.messages) ? session.messages : []).filter(m => String(m.id) !== optimisticId);
      if (result?.message && !messages.some(m => String(m.id) === String(result.message.id))) messages.push(result.message);
      session.messages = messages.slice(-200);
      if (result?.support_mode) session.support_mode = safeText(result.support_mode);
      if (result?.support_label) session.support_label = safeText(result.support_label);
      persistSession();
      setSupportIdentity(session.support_mode, session.support_label);
      renderMessages(session.messages);

      const aiMessage = result?.ai_message || null;
      if (aiMessage) {
        if (!aiGenerating) setAiGenerating(true);
        updateReplyState();
        const planned = aiThinkingDelay(body, aiMessage.body);
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        const elapsed = aiGenerationStartedAt ? now - aiGenerationStartedAt : 0;
        await wait(Math.max(0, planned - elapsed));
        if (!session) return;
        messages = Array.isArray(session.messages) ? session.messages.slice() : [];
        if (!messages.some(m => String(m.id) === String(aiMessage.id))) messages.push(aiMessage);
        session.messages = messages.slice(-200);
      }

      setAiGenerating(false);
      persistSession();
      setSupportIdentity(session.support_mode, session.support_label);
      updateReplyState();
      renderMessages(session.messages);
      requestAnimationFrame(() => { if (els.messages) els.messages.scrollTop = els.messages.scrollHeight; });
    } catch (error) {
      if (session) {
        session.messages = (Array.isArray(session.messages) ? session.messages : []).filter(m => String(m.id) !== optimisticId);
      }
      setAiGenerating(false);
      if (els.reply && !els.reply.value) {
        els.reply.value = body;
        els.reply.dispatchEvent(new Event("input", { bubbles: true }));
      }
      const message = error?.message || "Message could not be sent.";
      showError(els.replyError, message);
      if (/expired|unavailable/i.test(message)) clearSession({ keepPanel: true });
      else if (session) renderMessages(session.messages);
    } finally {
      replySending = false;
      updateReplyState();
      if (session) startPolling();
    }
  }

  async function resetChat() {
    if (!session) return clearSession({ keepPanel: true });
    let proceed = true;
    if (typeof window.appConfirmDelete === "function") {
      proceed = await window.appConfirmDelete("End this temporary landing-page chat? Triplem VIP will retain the support record, but this browser will forget the two-hour guest access token.", {
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
    els.identity = $("landingLiveChatIdentity");
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
    const resizeReply = () => {
      if (!els.reply) return;
      els.reply.style.height = "auto";
      els.reply.style.height = `${Math.min(96, Math.max(38, els.reply.scrollHeight))}px`;
    };
    const submitOnEnter = (event, form) => {
      if (event.key !== "Enter" || event.isComposing) return;
      if (event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      if (typeof form?.requestSubmit === "function") form.requestSubmit();
      else form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    };
    els.message?.addEventListener("keydown", event => submitOnEnter(event, els.startForm));
    els.reply?.addEventListener("keydown", event => submitOnEnter(event, els.replyForm));
    els.reply?.addEventListener("input", resizeReply);
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
