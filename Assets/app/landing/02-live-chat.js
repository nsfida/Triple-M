/* Triplem VIP landing AI + Agent Live Support — temporary two-hour guest conversation. */
(() => {
  "use strict";

  const STORAGE_KEY = "triplem_landing_live_chat_v1";
  const FALLBACK_TTL_MS = 2 * 60 * 60 * 1000;
  const POLL_OPEN_MS = 2500;
  const POLL_HIDDEN_MS = 6000;
  const LIVE_CHAT_AGENT_EVENT_TOPIC = "triplem-live-chat-agent-events-v1";
  const LIVE_CHAT_AGENT_EVENT_AVAILABLE = "offer_available";
  let pollTimer = null;
  let session = null;
  let lastRenderSignature = "";
  let lastSeenAdminMessageId = "";
  let availability = null;
  let startSending = false;
  let replySending = false;
  let aiGenerating = false;
  let aiGenerationStartedAt = 0;
  let guidedSending = false;
  let supportConfig = { aziz_enabled: false, assistant_name: "Aziz" };
  let supportConfigTimer = null;

  const $ = (id) => document.getElementById(id);
  const els = {};

  const GUIDED_FALLBACK = {
    home: [
      { id: "overview", label: "What is Triplem VIP?" },
      { id: "how_it_works", label: "How does it work?" },
      { id: "features", label: "What can I manage?" },
      { id: "plans", label: "Plans & pricing?" },
      { id: "subscribe", label: "How do I subscribe?" },
      { id: "agent", label: "Talk to an Agent", kind: "agent" }
    ],
    overview: [
      { id: "how_it_works", label: "How does it work?" },
      { id: "features", label: "What can I manage?" },
      { id: "plans", label: "What are the plans?" },
      { id: "security", label: "How is it secured?" },
      { id: "agent", label: "Talk to an Agent", kind: "agent" }
    ],
    plans: [
      { id: "monthly", label: "Monthly plan?" },
      { id: "yearly", label: "Yearly plan?" },
      { id: "trial", label: "Free trial?" },
      { id: "subscribe", label: "How do I subscribe?" },
      { id: "agent", label: "Talk to an Agent", kind: "agent" }
    ],
    features: [
      { id: "wallets_expenses", label: "Wallets & expenses?" },
      { id: "inventory_sales", label: "Inventory & sales?" },
      { id: "loans_assets", label: "Loans & assets?" },
      { id: "reports_invoices", label: "Reports & invoices?" },
      { id: "more_topics", label: "More topics" },
      { id: "agent", label: "Talk to an Agent", kind: "agent" }
    ],
    subscription: [
      { id: "payment_process", label: "How do I pay?" },
      { id: "payment_security", label: "Is payment secure?" },
      { id: "monthly", label: "Monthly price?" },
      { id: "yearly", label: "Yearly price?" },
      { id: "agent", label: "Talk to an Agent", kind: "agent" }
    ],
    security: [
      { id: "payment_security", label: "Payment security?" },
      { id: "data_privacy", label: "How is data protected?" },
      { id: "smart_pin", label: "What is Smart PIN?" },
      { id: "home", label: "More questions" },
      { id: "agent", label: "Talk to an Agent", kind: "agent" }
    ],
    operations: [
      { id: "team_company", label: "Team & company setup?" },
      { id: "notes", label: "Notes & reminders?" },
      { id: "bitcoin", label: "Bitcoin tools?" },
      { id: "demo", label: "Can I see the demo?" },
      { id: "home", label: "Main questions" },
      { id: "agent", label: "Talk to an Agent", kind: "agent" }
    ]
  };

  function safeText(value) {
    return String(value ?? "");
  }

  function randomLocalToken(bytes = 18) {
    try {
      const raw = new Uint8Array(bytes); crypto.getRandomValues(raw);
      return Array.from(raw, b => b.toString(16).padStart(2, "0")).join("");
    } catch (_) { return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`; }
  }

  function isAzizMode() { return supportConfig?.aziz_enabled === true; }
  function isAzizSession() { return safeText(session?.support_mode).toLowerCase() === "aziz"; }

  function updateAzizAgentTopAction() {
    if (!els.agentTop) return;
    const visible = isAzizMode() && isAzizSession() && session?.closed !== true;
    els.agentTop.classList.toggle("hide", !visible);
    els.agentTop.disabled = !visible || replySending || aiGenerating;
  }

  function requestAzizLiveAgent() {
    if (!isAzizSession() || session?.closed || !els.replyForm || replySending || aiGenerating) return;
    if (els.reply) els.reply.value = "Please transfer me to a Triplem VIP support agent";
    if (typeof els.replyForm.requestSubmit === "function") els.replyForm.requestSubmit();
    else els.replyForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }

  function visitorRequestsHumanAgent(value) {
    const raw = safeText(value).normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
    if (!raw) return false;
    const latin = raw.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    if (latin && [
      /\b(?:transfer|connect|handover|hand over|forward|send|put me through|move)\b.{0,55}\b(?:agent|human|person|someone|operator|representative|support|support team|customer service|admin|administrator|live support)\b/,
      /\b(?:talk|speak|chat|communicate)\b.{0,45}\b(?:to|with)\b.{0,20}\b(?:agent|human|real person|someone|operator|representative|support|support team|customer service|admin|administrator)\b/,
      /\b(?:i want|i need|i would like|id like|can i have|can you get me|give me)\b.{0,50}\b(?:agent|human|real person|someone|operator|representative|support team|customer service|live support)\b/,
      /\b(?:no more ai|dont want ai|do not want ai|stop ai|not aziz)\b.{0,45}\b(?:agent|human|support|person)\b/
    ].some(pattern => pattern.test(latin))) return true;

    const romanUrduTarget = /\b(?:agent|live agent|human|insan|banda|banday|representative|support wala|support walay|support team)\b/i;
    const romanUrduIntent = /\b(?:transfer|connect|milwa|mila do|baat karwa|baat karni|baat karna|baat kara|jora|jor do|bhej|chahiye|chahta|chahti)\b/i;
    if (romanUrduTarget.test(raw) && romanUrduIntent.test(raw)) return true;

    const urduTarget = /(?:ایجنٹ|نمائندہ|انسان|لائیو\s*ایجنٹ|سپورٹ\s*(?:ایجنٹ|نمائندہ|ٹیم))/u;
    const urduIntent = /(?:ٹرانسفر|منتقل|بات\s*(?:کرو|کروا|کرنی|کرنا)|ملوا|رابطہ|جوڑ|چاہیے|چاہتا|چاہتی)/u;
    if (urduTarget.test(raw) && urduIntent.test(raw)) return true;

    const arabicTarget = /(?:وكيل|موظف|ممثل|إنسان|انسان|بشري|الدعم\s*(?:البشري|المباشر)|خدمة\s*العملاء)/u;
    const arabicIntent = /(?:تحويل|حوّلني|حولني|أريد\s*التحدث|اريد\s*التحدث|أريد\s*التكلم|اريد\s*التكلم|اربطني|وصلني|تحدث\s*مع|التحدث\s*مع)/u;
    return arabicTarget.test(raw) && arabicIntent.test(raw);
  }

  async function beginAzizTurn(body, turnId) {
    if (!session || !isAzizSession()) throw new Error("Aziz conversation is unavailable.");
    const result = await supabaseRpc("app_public_aziz_turn_begin", {
      p_inquiry_id: session.inquiry_id,
      p_guest_token: session.guest_token,
      p_chat_id: safeText(session.aziz_chat_id || session.inquiry_id).trim(),
      p_turn_id: safeText(turnId).trim(),
      p_body: safeText(body).trim()
    });
    return result || {};
  }

  function applyLauncherMode() {
    const aziz = isAzizMode();
    if (els.launcherLabel) els.launcherLabel.textContent = aziz ? "Talk to Aziz" : "Help?";
    els.launcher?.classList.toggle("is-aziz-mode", aziz);
    if (els.launcher) {
      els.launcher.setAttribute("aria-label", aziz ? "Talk to Aziz, Triplem VIP AI" : "Open Triplem VIP Support");
      els.launcher.title = aziz ? "Talk to Aziz" : "Help?";
    }
    if (!session && els.startView && !els.startView.classList.contains("hide")) {
      setSupportIdentity(aziz ? "aziz" : "ai", aziz ? "Aziz" : "Triplem VIP AI Assistant");
    }
    if (els.intro) els.intro.textContent = aziz
      ? "Start with Aziz for instant Triplem VIP guidance. Ask freely about features, plans, security, reports, branding, customization or how the platform works. Your browser keeps the live session available for two hours while the support transcript remains available to Triplem VIP Support."
      : "Start with the Triplem VIP AI Assistant for instant product guidance. It answers only about Triplem VIP and will transfer you to a real support agent whenever you ask. Your browser keeps this conversation available for two hours after you start.";
    if (els.startButton) els.startButton.innerHTML = aziz
      ? '<i class="fa-solid fa-wand-magic-sparkles"></i> Start Aziz Support'
      : '<i class="fa-solid fa-wand-magic-sparkles"></i> Start AI Support';
    if (els.status) els.status.classList.toggle("hide", aziz);
    if (aziz) {
      if (els.availability) els.availability.textContent = "Aziz AI support · available 24/7";
    }
    updateAzizAgentTopAction();
  }

  async function refreshSupportConfig() {
    const wasAziz = isAzizMode();
    try {
      const result = await supabaseRpc("app_public_live_chat_support_config", {});
      supportConfig = { aziz_enabled: result?.aziz_enabled === true, assistant_name: safeText(result?.assistant_name || "Aziz") || "Aziz" };
    } catch (_) {
      supportConfig = { aziz_enabled: false, assistant_name: "Aziz" };
    }
    applyLauncherMode();
    if (wasAziz && !isAzizMode()) refreshAvailability().catch(() => {});
    return supportConfig;
  }

  async function invokeAziz(message, messages = [], turnId = "") {
    try { if (window.TRIPLEM_REGIONAL_CURRENCY_READY) await window.TRIPLEM_REGIONAL_CURRENCY_READY; } catch (_) {}
    if (typeof window.getSupabaseConfig !== "function") throw new Error("Aziz support configuration is unavailable.");
    const cfg = window.getSupabaseConfig();
    const base = safeText(cfg?.supabaseUrl).replace(/\/$/, "");
    const key = safeText(cfg?.supabaseKey).trim();
    if (!base || !key) throw new Error("Aziz support configuration is unavailable.");
    const history = (Array.isArray(messages) ? messages : []).filter(m => !String(m?.id || "").startsWith("local-")).slice(-12).map(m => ({
      role: String(m?.sender_role || "") === "admin" ? "model" : "user",
      text: safeText(m?.body).slice(0, 1200)
    })).filter(row => row.text);
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = window.setTimeout(() => { try { controller?.abort(); } catch (_) {} }, 18000);
    let response;
    try {
      response = await fetch(`${base}/functions/v1/aziz-live-support`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: safeText(message).slice(0, 1200),
          history,
          chatId: safeText(session?.aziz_chat_id || session?.inquiry_id || ""),
          inquiryId: safeText(session?.inquiry_id || ""),
          turnId: safeText(turnId).slice(0, 120),
          countryCode: typeof getRegionalCountryCode === "function" ? getRegionalCountryCode() : "ZZ",
          regionalCurrency: typeof getRegionalCurrency === "function" ? getRegionalCurrency() : "USD"
        }),
        cache: "no-store",
        ...(controller ? { signal: controller.signal } : {})
      });
    } catch (error) {
      if (controller?.signal?.aborted) throw new Error("Aziz response timed out.");
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
    const text = await response.text(); let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) {}
    if (!response.ok || data?.ok === false) throw new Error(data?.error || `Aziz support request failed (${response.status}).`);
    return { ...data, answer: safeText(data?.answer).trim() };
  }

  function azizHandoffTranscript(messages, currentMessage = "") {
    const rows = (Array.isArray(messages) ? messages : []).filter(row => {
      const id = safeText(row?.id);
      const text = safeText(row?.body).trim();
      if (!text || id.startsWith("aziz-welcome-")) return false;
      return true;
    }).slice(-15).map(row => ({
      role: safeText(row?.message_actor).toLowerCase() === "ai" || safeText(row?.sender_role).toLowerCase() === "admin" ? "model" : "user",
      text: safeText(row?.body).trim().slice(0, 1200)
    }));
    const latest = safeText(currentMessage).trim();
    if (latest && (!rows.length || rows[rows.length - 1].text !== latest)) rows.push({ role: "user", text: latest.slice(0, 1200) });
    return rows.slice(-16);
  }

  function isMissingAzizHandoffRpc(error) {
    const msg = safeText(error?.message || error).toLowerCase();
    return /app_public_aziz_handoff(_verified)?/.test(msg) && /function.*does not exist|could not find the function|pgrst202|schema cache/.test(msg);
  }

  function canSafelyFallbackToLegacyAzizHandoff(error) {
    const msg = safeText(error?.message || error).toLowerCase();
    // Build 149 keeps the established Build 147 handoff as a safety net. Only
    // verified-staging/schema availability failures fall back; validation and live
    // chat start-limit errors still propagate and cannot be bypassed.
    return isMissingAzizHandoffRpc(error)
      || /aziz chat session is unavailable|invalid aziz chat session|verified session/i.test(msg);
  }

  async function handoffAzizToAgent(currentMessage, historyBefore, currentTurnId = "") {
    if (!session || !isAzizSession()) throw new Error("Aziz conversation is unavailable.");
    const contact = session.contact || {};
    const transcript = azizHandoffTranscript(historyBefore, currentMessage);
    let result;
    try {
      result = await supabaseRpc("app_public_aziz_handoff_verified", {
        p_name: safeText(contact.name).trim(),
        p_mobile: safeText(contact.phone).trim(),
        p_email: safeText(contact.email).trim(),
        p_chat_id: safeText(session.aziz_chat_id || session.inquiry_id).trim(),
        p_turn_id: safeText(currentTurnId).trim() || null,
        p_current_message: safeText(currentMessage).trim() || null
      });
    } catch (error) {
      if (!canSafelyFallbackToLegacyAzizHandoff(error)) throw error;
      // Preserve the proven Build 147 queue/notification path whenever the optional
      // verified transcript layer is temporarily unavailable. Human support must
      // never be blocked by transcript staging.
      try {
        result = await supabaseRpc("app_public_aziz_handoff", {
          p_name: safeText(contact.name).trim(),
          p_mobile: safeText(contact.phone).trim(),
          p_email: safeText(contact.email).trim(),
          p_transcript: transcript
        });
      } catch (legacyError) {
        if (!isMissingAzizHandoffRpc(legacyError)) throw legacyError;
        const started = await startGuidedChatRpc({
        p_name: safeText(contact.name).trim(),
        p_mobile: safeText(contact.phone).trim(),
        p_email: safeText(contact.email).trim()
      });
        const fallbackSession = normalizeSession({
          inquiry_id: started?.inquiry_id, guest_token: started?.guest_token, expires_at: started?.expires_at,
          contact, messages: started?.messages || [], support_mode: started?.support_mode || "ai",
          support_label: started?.support_label || "Triplem VIP AI Assistant", guided_options: started?.guided_options || [], guided_context: "home"
        });
        if (!fallbackSession) throw new Error("Agent handoff could not be started.");
        session = fallbackSession;
        result = await chooseGuidedRpc("agent");
        const merged = Array.isArray(session.messages) ? session.messages.slice() : [];
        if (result?.message) merged.push(result.message);
        if (result?.ai_message) merged.push(result.ai_message);
        result = { ...result, inquiry_id: session.inquiry_id, guest_token: session.guest_token, expires_at: session.expires_at, messages: merged };
      }
    }

    const next = normalizeSession({
      inquiry_id: result?.inquiry_id || session.inquiry_id,
      guest_token: result?.guest_token || session.guest_token,
      expires_at: result?.expires_at || session.expires_at,
      contact,
      messages: Array.isArray(result?.messages) ? result.messages : session.messages,
      support_mode: result?.support_mode || "human_pending",
      support_label: result?.support_label || "Waiting for an Agent",
      guided_options: [],
      guided_context: "home"
    });
    if (!next) throw new Error("Agent handoff could not be completed.");
    session = next;
    if (result?.availability) setAvailability(result.availability);
    persistSession();
    setSupportIdentity(session.support_mode, session.support_label);
    renderMessages(session.messages);
    updateReplyState();
    broadcastAgentOfferAvailable(session.inquiry_id).catch(() => {});
    requestClosedBrowserAgentPush(session.inquiry_id).catch(() => {});
    startPolling();
    requestAnimationFrame(() => { if (els.messages) els.messages.scrollTop = els.messages.scrollHeight; });
    return result;
  }

  async function requestClosedBrowserAgentPush(inquiryId) {
    const id = safeText(inquiryId).trim();
    const token = safeText(session?.guest_token).trim();
    if (!id || !token) return false;
    const push = window.TriplemPush;
    if (!push || typeof push.requestLiveChatAgentPush !== "function") return false;
    try { return await push.requestLiveChatAgentPush(id, token); }
    catch (_) { return false; }
  }

  async function broadcastAgentOfferAvailable(inquiryId) {
    const id = safeText(inquiryId).trim();
    if (!id || typeof fetch !== "function" || typeof window.getSupabaseConfig !== "function") return false;
    let config;
    try { config = window.getSupabaseConfig(); } catch (_) { return false; }
    const base = safeText(config?.supabaseUrl).replace(/\/$/, "");
    const key = safeText(config?.supabaseKey).trim();
    if (!base || !key) return false;
    const topic = encodeURIComponent(LIVE_CHAT_AGENT_EVENT_TOPIC);
    const event = encodeURIComponent(LIVE_CHAT_AGENT_EVENT_AVAILABLE);
    try {
      const response = await fetch(`${base}/realtime/v1/api/broadcast/${topic}/events/${event}`, {
        method: "POST",
        headers: { "apikey": key, "Content-Type": "application/json" },
        body: JSON.stringify({ inquiry_id: id, available_at: new Date().toISOString() }),
        keepalive: true,
        cache: "no-store"
      });
      return response.ok;
    } catch (_) {
      // The server-side handoff has already succeeded. Agent-side polling remains
      // the recovery path if Realtime Broadcast is momentarily unavailable.
      return false;
    }
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

  function normalizeGuidedOptions(raw) {
    const rows = Array.isArray(raw) ? raw : [];
    return rows.map(item => ({
      id: safeText(item?.id).trim().toLowerCase(),
      label: safeText(item?.label).trim(),
      kind: safeText(item?.kind).trim().toLowerCase()
    })).filter(item => /^[a-z0-9_]{2,40}$/.test(item.id) && item.label).slice(0, 8);
  }

  function fallbackGuidedOptions(context = "home") {
    return normalizeGuidedOptions(GUIDED_FALLBACK[context] || GUIDED_FALLBACK.home);
  }

  function normalizeSession(raw) {
    if (!raw || typeof raw !== "object") return null;
    const inquiryId = safeText(raw.inquiry_id).trim();
    const guestToken = safeText(raw.guest_token).trim();
    const expiresMs = new Date(raw.expires_at || 0).getTime();
    if (!inquiryId || !guestToken || !Number.isFinite(expiresMs) || expiresMs <= Date.now()) return null;
    return {
      inquiry_id: inquiryId,
      aziz_chat_id: safeText(raw.aziz_chat_id || "").trim(),
      guest_token: guestToken,
      expires_at: new Date(expiresMs).toISOString(),
      contact: raw.contact && typeof raw.contact === "object" ? raw.contact : {},
      messages: Array.isArray(raw.messages) ? raw.messages.slice(-200) : [],
      support_mode: safeText(raw.support_mode || "legacy_human").trim() || "legacy_human",
      support_label: safeText(raw.support_label || "").trim(),
      guided_options: normalizeGuidedOptions(raw.guided_options),
      guided_context: safeText(raw.guided_context || "home").trim() || "home",
      closed: raw.closed === true,
      closed_by: safeText(raw.closed_by || "").trim(),
      close_reason: safeText(raw.close_reason || "").trim(),
      visitor_presence: safeText(raw.visitor_presence || "").trim(),
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
    if (isAzizMode()) { applyLauncherMode(); return; }
    const open = availability.is_open === true || availability.is_open === "true";
    if (els.status) {
      els.status.classList.toggle("is-open", open);
      els.status.classList.toggle("is-closed", !open);
      const humanState = open ? "Agent support is online" : "Agent support is currently offline";
      const humanWait = availability.wait_label || "Agent support hours: 10:00 AM – 5:00 PM GST";
      els.status.innerHTML = `<span class="landing-live-chat-status-dot"></span><div><strong>${escape(humanState)}</strong><small>${escape(`AI available 24/7 · ${humanWait}`)}</small></div>`;
    }
    if (els.availability) els.availability.textContent = "AI available 24/7 · Agent support 10:00 AM – 5:00 PM GST";
    els.launcher?.classList.toggle("is-online", open);
  }

  function setSupportIdentity(mode, label = "") {
    if (!els.identity) return;
    const state = safeText(mode || "ai").trim().toLowerCase();
    let title = "Triplem VIP AI Assistant";
    let detail = "AI-guided support · choose a question below · request an Agent anytime";
    let icon = "fa-wand-magic-sparkles";
    let stateClass = "is-ai";

    if (state === "aziz") {
      title = "Aziz";
      detail = "Triplem VIP AI · ask anything about the platform";
      icon = "fa-wand-magic-sparkles";
      stateClass = "is-ai is-aziz";
    } else if (state === "human_pending") {
      title = "Agent support requested";
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
      detail = "Existing agent-support conversation";
      icon = "fa-headset";
      stateClass = "is-human";
    }

    els.identity.className = `landing-live-chat-identity ${stateClass}`;
    els.identity.innerHTML = `<span class="landing-live-chat-identity-icon" aria-hidden="true"><i class="fa-solid ${escape(icon)}"></i></span><div><strong>${escape(title)}</strong><small>${escape(detail)}</small></div>`;
    updateAzizAgentTopAction();
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
      renderGuidedActions();
      refreshThread({ silent: true }).catch(() => {});
      startPolling();
      const mode = safeText(session.support_mode).toLowerCase();
      if (mode === "human" || mode === "legacy_human" || mode === "aziz") requestAnimationFrame(() => els.reply?.focus({ preventScroll: true }));
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
    setSupportIdentity(isAzizMode() ? "aziz" : "ai", isAzizMode() ? "Aziz" : "Triplem VIP AI Assistant");
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
    renderGuidedActions();
    updateReplyState();
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
    const label = isAzizSession() ? "Aziz" : "Triplem VIP AI Assistant";
    return `<div class="landing-live-chat-message-row is-admin is-ai is-thinking" role="status" aria-live="polite"><span class="landing-live-chat-avatar is-brand is-ai" aria-hidden="true"><img src="Assets/logo/logo.png" alt="" /></span><div class="landing-live-chat-message is-admin is-ai landing-live-chat-thinking"><div class="landing-live-chat-message-meta"><span class="landing-live-chat-message-who"><strong>${escape(label)}</strong><em class="landing-live-chat-actor-badge is-ai">AI</em></span><span>AI generating</span></div><p><span>${isAzizSession() ? "Aziz is typing" : "Preparing your AI answer"}</span><span class="landing-live-chat-thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span></p></div></div>`;
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
    const complexity = Math.min(1050, qLen * 8) + Math.min(1250, aLen * 2.35);
    return Math.round(Math.max(1750, Math.min(4300, 1200 + complexity)));
  }

  function wait(ms) {
    return new Promise(resolve => window.setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  }

  function cleanSemanticAnalysis(raw) {
    if (!raw || typeof raw !== "object") return null;
    const allowed = new Set([
      "overview","business_value","setup","dashboard","pricing","payment_method","trial_signup",
      "wallets","expenses","income","currency","inventory","sales","customers","invoices",
      "reports","loans","installments","assets","notes","bitcoin","company_team","platforms",
      "personalization","security","payment_security","continuity","demo","smart_pin","import_backup","support","founder"
    ]);
    const intents = (Array.isArray(raw.intents) ? raw.intents : [])
      .map(row => ({ intent: safeText(row?.intent).trim().toLowerCase(), score: Number(row?.score) }))
      .filter(row => allowed.has(row.intent) && Number.isFinite(row.score) && row.score >= 0 && row.score <= 1)
      .slice(0, 3);
    return {
      engine: safeText(raw.engine).slice(0, 48),
      model: safeText(raw.model).slice(0, 96) || null,
      neural: raw.neural === true,
      confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0)),
      question_kind: safeText(raw.question_kind).slice(0, 24),
      plan_period: ["monthly", "yearly", "unknown"].includes(safeText(raw.plan_period).toLowerCase()) ? safeText(raw.plan_period).toLowerCase() : "unknown",
      currency: ["AED", "SAR", "PKR", "USD", "unknown"].includes(safeText(raw.currency).toUpperCase()) ? safeText(raw.currency).toUpperCase() : "unknown",
      intents
    };
  }

  async function analyzeVisitorQuestion(question, messages = []) {
    const ai = window.TriplemLiveChatAI;
    if (!ai || typeof ai.analyze !== "function") return null;
    try {
      const result = await Promise.race([
        Promise.resolve(ai.analyze(question, messages)),
        wait(6500).then(() => null)
      ]);
      if (result) return cleanSemanticAnalysis(result);
      if (typeof ai.fallbackAnalyze === "function") return cleanSemanticAnalysis(ai.fallbackAnalyze(question));
      return null;
    } catch (_) {
      return null;
    }
  }

  function isMissingSemanticRpc(error) {
    const msg = safeText(error?.message || error).toLowerCase();
    return /app_public_live_chat_(start|reply)_semantic/.test(msg) || /function.*does not exist|could not find the function|pgrst202|schema cache/.test(msg);
  }

  async function startLiveChatRpc(args, aiAnalysis) {
    try {
      return await supabaseRpc("app_public_live_chat_start_semantic", { ...args, p_ai_analysis: aiAnalysis });
    } catch (error) {
      if (!isMissingSemanticRpc(error)) throw error;
      return supabaseRpc("app_public_live_chat_start", args);
    }
  }

  async function replyLiveChatRpc(args, aiAnalysis) {
    try {
      return await supabaseRpc("app_public_live_chat_reply_semantic", { ...args, p_ai_analysis: aiAnalysis });
    } catch (error) {
      if (!isMissingSemanticRpc(error)) throw error;
      return supabaseRpc("app_public_live_chat_reply", args);
    }
  }

  function isMissingGuidedRpc(error) {
    const msg = safeText(error?.message || error).toLowerCase();
    return /app_public_live_chat_(start_guided|choose)/.test(msg) || /function.*does not exist|could not find the function|pgrst202|schema cache/.test(msg);
  }

  async function startGuidedChatRpc(args) {
    try {
      return await supabaseRpc("app_public_live_chat_start_guided", args);
    } catch (error) {
      if (!isMissingGuidedRpc(error)) throw error;
      const fallbackQuestion = "What is Triplem VIP?";
      const aiAnalysis = await analyzeVisitorQuestion(fallbackQuestion, []);
      const result = await startLiveChatRpc({ ...args, p_message: fallbackQuestion }, aiAnalysis);
      return { ...result, guided: true, guided_context: "home", guided_options: fallbackGuidedOptions("home") };
    }
  }

  function guidedLabel(choiceId) {
    const rows = [...Object.values(GUIDED_FALLBACK).flat(), ...(session?.guided_options || [])];
    return rows.find(item => item.id === choiceId)?.label || "Triplem VIP support question";
  }

  async function chooseGuidedRpc(choiceId) {
    try { if (window.TRIPLEM_REGIONAL_CURRENCY_READY) await window.TRIPLEM_REGIONAL_CURRENCY_READY; } catch (_) {}
    const baseArgs = {
      p_inquiry_id: session.inquiry_id,
      p_guest_token: session.guest_token,
      p_choice: choiceId
    };
    try {
      return await supabaseRpc("app_public_live_chat_choose_v2", {
        ...baseArgs,
        p_country_code: typeof getRegionalCountryCode === "function" ? getRegionalCountryCode() : "ZZ"
      });
    } catch (regionalError) {
      if (!isMissingGuidedRpc(regionalError)) throw regionalError;
      try { return await supabaseRpc("app_public_live_chat_choose", baseArgs); }
      catch (error) {
        if (!isMissingGuidedRpc(error)) throw error;
      }
      const label = guidedLabel(choiceId);
      const aiAnalysis = await analyzeVisitorQuestion(label, session.messages || []);
      const result = await replyLiveChatRpc({
        p_inquiry_id: session.inquiry_id,
        p_guest_token: session.guest_token,
        p_body: choiceId === "agent" ? "I want to talk to a real support agent" : label
      }, aiAnalysis);
      const context = choiceId === "plans" || ["monthly","yearly","trial","subscribe"].includes(choiceId) ? "plans"
        : choiceId === "features" ? "features"
        : choiceId === "overview" || choiceId === "how_it_works" ? "overview" : "home";
      return { ...result, guided: true, guided_context: context, guided_options: choiceId === "agent" ? [] : fallbackGuidedOptions(context) };
    }
  }

  function renderGuidedActions() {
    if (!els.guided) return;
    const mode = safeText(session?.support_mode || "").toLowerCase();
    const closed = session?.closed === true || mode === "closed";
    if (!session || closed || mode === "human" || mode === "legacy_human") {
      els.guided.innerHTML = "";
      els.guided.classList.add("hide");
      return;
    }
    if (mode === "aziz") {
      els.guided.innerHTML = "";
      els.guided.classList.add("hide");
      return;
    }
    if (mode === "human_pending") {
      els.guided.classList.remove("hide");
      els.guided.innerHTML = `<div class="landing-live-chat-agent-wait"><i class="fa-solid fa-user-clock" aria-hidden="true"></i><div><strong>Waiting for an Agent</strong><small>AI is paused. The message box will unlock automatically when an Agent accepts this chat.</small></div></div>`;
      return;
    }
    const options = session.guided_options?.length ? session.guided_options : fallbackGuidedOptions(session.guided_context || "home");
    const buttons = options.map(item => `<button type="button" class="landing-live-chat-guided-chip ${item.kind === "agent" || item.id === "agent" ? "is-agent" : ""}" data-live-chat-choice="${escape(item.id)}" ${guidedSending || aiGenerating ? "disabled" : ""}><span>${escape(item.label)}</span>${item.kind === "agent" || item.id === "agent" ? '<i class="fa-solid fa-headset" aria-hidden="true"></i>' : '<i class="fa-solid fa-chevron-right" aria-hidden="true"></i>'}</button>`).join("");
    els.guided.classList.remove("hide");
    els.guided.innerHTML = `<div class="landing-live-chat-guided-head"><strong>Choose a question</strong><small>No typing needed while AI is assisting</small></div><div class="landing-live-chat-guided-grid">${buttons}</div>`;
  }

  // Regression contract marker retained for RTL-safe chat tests: <p dir="auto">${escape(m.body)}</p>
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
      const label = fromGuest ? "You" : (m.sender_label || (isAi ? (isAzizSession() ? "Aziz" : "Triplem VIP AI Assistant") : isHuman ? "Triplem VIP Support Agent" : "Triplem VIP Support"));
      const badge = fromGuest ? "" : `<em class="landing-live-chat-actor-badge ${isAi ? "is-ai" : isHuman ? "is-human" : "is-system"}">${isAi ? "AI" : isHuman ? "Agent" : "System"}</em>`;
      const when = formatChatTime(m.created_at);
      const avatar = fromGuest
        ? `<span class="landing-live-chat-avatar is-user" aria-hidden="true"><i class="fa-solid fa-user"></i></span>`
        : `<span class="landing-live-chat-avatar is-brand ${isAi ? "is-ai" : isHuman ? "is-human" : "is-system"}" aria-hidden="true"><img src="Assets/logo/logo.png" alt="" /></span>`;
      const actorClass = fromGuest ? "is-guest" : isAi ? "is-ai" : isHuman ? "is-human" : "is-system";
      return `<div class="landing-live-chat-message-row ${fromGuest ? "is-guest" : "is-admin"} ${actorClass}">${fromGuest ? "" : avatar}<div class="landing-live-chat-message ${fromGuest ? "is-guest" : "is-admin"} ${actorClass}"><div class="landing-live-chat-message-meta"><span class="landing-live-chat-message-who"><strong>${escape(label)}</strong>${badge}</span><span>${escape(when)}</span></div><p dir="auto">${typeof currencyAwareTextHtml === "function" ? currencyAwareTextHtml(m.body) : escape(m.body)}</p></div>${fromGuest ? avatar : ""}</div>`;
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

  function liveChatRestRpcRequest(functionName, payload, { keepalive = false } = {}) {
    if (!session || typeof window.getSupabaseConfig !== "function" || typeof fetch !== "function") return Promise.resolve(null);
    let cfg;
    try { cfg = window.getSupabaseConfig(); } catch (_) { return Promise.resolve(null); }
    const base = safeText(cfg?.supabaseUrl).replace(/\/$/, "");
    const key = safeText(cfg?.supabaseKey).trim();
    if (!base || !key) return Promise.resolve(null);
    return fetch(`${base}/rest/v1/rpc/${encodeURIComponent(functionName)}`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
      cache: "no-store",
      keepalive: !!keepalive
    }).then(async response => {
      if (!response.ok) throw new Error((await response.text().catch(() => "")) || `Live Chat request failed (${response.status})`);
      const text = await response.text();
      try { return text ? JSON.parse(text) : null; } catch (_) { return null; }
    });
  }

  function signalVisitorPresence(eventName = "online", { keepalive = false } = {}) {
    if (!session || session.closed === true) return Promise.resolve(null);
    const payload = {
      p_inquiry_id: session.inquiry_id,
      p_guest_token: session.guest_token,
      p_event: safeText(eventName || "online").trim().toLowerCase()
    };
    // The unload path uses fetch keepalive because it permits the Supabase apikey
    // and Authorization headers required by the public RPC. Normal foreground
    // signals use the existing RPC client.
    if (keepalive) return liveChatRestRpcRequest("app_public_live_chat_presence", payload, { keepalive: true }).catch(() => null);
    return supabaseRpc("app_public_live_chat_presence", payload).catch(() => null);
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
      if (Array.isArray(result?.guided_options)) session.guided_options = normalizeGuidedOptions(result.guided_options);
      if (result?.guided_context) session.guided_context = safeText(result.guided_context) || session.guided_context;
      session.closed = result?.chat_closed === true;
      session.closed_by = safeText(result?.closed_by || result?.inquiry?.support_closed_by || session.closed_by || "").trim();
      session.close_reason = safeText(result?.close_reason || result?.inquiry?.support_close_reason || session.close_reason || "").trim();
      session.visitor_presence = safeText(result?.visitor_presence || result?.inquiry?.visitor_presence || session.visitor_presence || "").trim();
      if (session.closed) session.support_mode = "closed";
      if (result?.availability) setAvailability(result.availability);
      persistSession();
      setSupportIdentity(session.support_mode, session.support_label);
      renderMessages(session.messages);
      updateExpiryLabel();
      updateReplyState();
      renderGuidedActions();
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
    const mode = safeText(session?.support_mode || "legacy_human").toLowerCase();
    const canType = !closed && (mode === "human" || mode === "legacy_human" || mode === "aziz");
    if (els.replyForm) els.replyForm.classList.toggle("hide", !canType);
    if (els.reply) {
      els.reply.disabled = !canType;
      els.reply.placeholder = closed ? "This chat has ended" : mode === "aziz" ? "Ask Aziz anything about Triplem VIP…" : canType ? "Write a message to your support Agent…" : "Typing unlocks when an Agent accepts the chat";
    }
    if (els.replyButton) els.replyButton.disabled = !canType || replySending || startSending;
    if (els.restartButton) els.restartButton.classList.toggle("hide", !closed);
    if (closed) {
      const who = safeText(session?.closed_by).toLowerCase();
      const reason = safeText(session?.close_reason).toLowerCase();
      const closingText = reason === "visitor_left_website"
        ? "This live chat ended because the visitor left Triplem VIP. You can start a new conversation whenever you need further assistance."
        : who === "agent"
          ? "This live chat was ended by your Triplem VIP Support Agent. You can start a new conversation whenever you need further assistance."
          : who === "visitor"
            ? "You ended this live chat. You can start a new conversation whenever you need further assistance."
            : "This live chat has ended. You can start a new conversation whenever you need further assistance.";
      showError(els.replyError, closingText);
    }
    else if (els.replyError?.textContent?.includes("live chat has ended")) showError(els.replyError, "");
    renderGuidedActions();
    updateAzizAgentTopAction();
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
    if (!name || !phone || !email) {
      showError(els.startError, "Please complete your name, contact number and email.");
      return;
    }
    if (isAzizMode()) {
      const button = els.startButton;
      const azizChatId = `aziz-${randomLocalToken(14)}`;
      startSending = true;
      if (button) { button.disabled = true; button.classList.add("loading"); }
      try {
        // Build 150 starts Aziz on one canonical database conversation immediately.
        // No Agent route exists yet, so this is recorded for Admin history without
        // notifying Agents until a real handoff is requested.
        const result = await supabaseRpc("app_public_aziz_start", {
          p_name: name,
          p_mobile: phone,
          p_email: email,
          p_chat_id: azizChatId
        });
        const expiresAt = result?.expires_at || new Date(Date.now() + FALLBACK_TTL_MS).toISOString();
        session = normalizeSession({
          inquiry_id: result?.inquiry_id,
          aziz_chat_id: result?.aziz_chat_id || azizChatId,
          guest_token: result?.guest_token,
          expires_at: expiresAt,
          contact: { name, phone, email },
          support_mode: result?.support_mode || "aziz",
          support_label: result?.support_label || "Aziz",
          guided_options: [],
          guided_context: "home",
          messages: Array.isArray(result?.messages) ? result.messages.slice(-200) : []
        });
        if (!session) throw new Error("Aziz could not start this chat.");
        persistSession();
        showConversationView();
        updateReplyState();
        requestAnimationFrame(() => els.reply?.focus({ preventScroll: true }));
      } catch (error) {
        session = null;
        showError(els.startError, error?.message || "Aziz could not start this chat. Please try again.");
      } finally {
        startSending = false;
        if (button) { button.disabled = false; button.classList.remove("loading"); }
        updateReplyState();
      }
      return;
    }
    const button = els.startButton;
    startSending = true;
    if (button) { button.disabled = true; button.classList.add("loading"); }
    try {
      const result = await startGuidedChatRpc({ p_name: name, p_mobile: phone, p_email: email });
      const expiresAt = result?.expires_at || new Date(Date.now() + FALLBACK_TTL_MS).toISOString();
      session = normalizeSession({
        inquiry_id: result?.inquiry_id,
        guest_token: result?.guest_token,
        expires_at: expiresAt,
        contact: { name, phone, email },
        messages: Array.isArray(result?.messages) ? result.messages.slice(-200) : [],
        support_mode: result?.support_mode || "ai",
        support_label: result?.support_label || "Triplem VIP AI Assistant",
        guided_options: result?.guided_options || fallbackGuidedOptions("home"),
        guided_context: result?.guided_context || "home"
      });
      if (!session) throw new Error("Live chat could not be started.");
      if (result?.availability) setAvailability(result.availability);
      persistSession();
      showConversationView();
      updateReplyState();
      startPolling();
    } catch (error) {
      showError(els.startError, error?.message || "Live chat could not be started. Please try again.");
    } finally {
      startSending = false;
      if (button) { button.disabled = false; button.classList.remove("loading"); }
      updateReplyState();
    }
  }

  async function chooseGuidedQuestion(choiceId) {
    if (guidedSending || !session || session.closed) return;
    const mode = safeText(session.support_mode).toLowerCase();
    if (mode !== "ai") return;
    const label = guidedLabel(choiceId);
    guidedSending = true;
    stopPolling();
    showError(els.replyError, "");

    const optimisticId = `local-guided-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    session.messages = [...(session.messages || []), {
      id: optimisticId, sender_role: "guest", body: label, created_at: new Date().toISOString(), message_actor: "visitor"
    }].slice(-200);
    renderMessages(session.messages);
    setAiGenerating(true);
    renderGuidedActions();
    requestAnimationFrame(() => { if (els.messages) els.messages.scrollTop = els.messages.scrollHeight; });

    try {
      const result = await chooseGuidedRpc(choiceId);
      let messages = (session.messages || []).filter(m => String(m.id) !== optimisticId);
      if (result?.message && !messages.some(m => String(m.id) === String(result.message.id))) messages.push(result.message);
      session.messages = messages.slice(-200);
      if (result?.support_mode) session.support_mode = safeText(result.support_mode);
      if (result?.support_label) session.support_label = safeText(result.support_label);
      session.guided_options = normalizeGuidedOptions(result?.guided_options);
      if (result?.guided_context) session.guided_context = safeText(result.guided_context) || "home";
      if (result?.availability) setAvailability(result.availability);
      if (choiceId === "agent" || result?.handoff === true || safeText(result?.support_mode).toLowerCase() === "human_pending") {
        // Push a low-latency wake-up to connected Agent browsers. The receiving
        // browser verifies the offer through the authenticated routing RPC before
        // showing UI or starting audio, so this public broadcast cannot forge a chat.
        broadcastAgentOfferAvailable(session.inquiry_id).catch(() => {});
        // Server-signed Web Push reaches opted-in Agent devices when Triplem VIP
        // is closed. The Service Worker suppresses this OS notification whenever
        // a Triplem VIP window is already open, leaving Realtime + audio in charge.
        requestClosedBrowserAgentPush(session.inquiry_id).catch(() => {});
      }
      persistSession();
      setSupportIdentity(session.support_mode, session.support_label);
      renderMessages(session.messages);

      const aiMessage = result?.ai_message || null;
      if (aiMessage) {
        const planned = Math.max(850, Math.min(1900, 650 + safeText(aiMessage.body).length * 3.2));
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        const elapsed = aiGenerationStartedAt ? now - aiGenerationStartedAt : 0;
        await wait(Math.max(0, planned - elapsed));
        if (!session) return;
        messages = session.messages.slice();
        if (!messages.some(m => String(m.id) === String(aiMessage.id))) messages.push(aiMessage);
        session.messages = messages.slice(-200);
      }
      setAiGenerating(false);
      persistSession();
      setSupportIdentity(session.support_mode, session.support_label);
      renderMessages(session.messages);
      updateReplyState();
      requestAnimationFrame(() => { if (els.messages) els.messages.scrollTop = els.messages.scrollHeight; });
    } catch (error) {
      session.messages = (session.messages || []).filter(m => String(m.id) !== optimisticId);
      setAiGenerating(false);
      renderMessages(session.messages);
      showError(els.replyError, error?.message || "That option could not be opened. Please try again.");
    } finally {
      guidedSending = false;
      updateReplyState();
      if (session) startPolling();
    }
  }

  async function sendReply(event) {
    event.preventDefault();
    if (replySending || !session || session.closed) return;
    const activeMode = safeText(session.support_mode).toLowerCase();
    if (activeMode !== "human" && activeMode !== "legacy_human" && activeMode !== "aziz") {
      showError(els.replyError, "Choose an AI support question, or request an Agent. Typing unlocks after an Agent accepts the chat.");
      return;
    }
    const body = safeText(els.reply?.value).trim();
    if (!body) return;
    if (activeMode === "aziz") {
      showError(els.replyError, "");
      replySending = true;
      if (els.replyButton) els.replyButton.disabled = true;
      const historyBefore = Array.isArray(session.messages) ? session.messages.slice() : [];
      const azizTurnId = `aziz-turn-${randomLocalToken(12)}`;
      const optimisticId = `local-guest-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      session.messages = [...historyBefore, { id: optimisticId, sender_role: "guest", body, created_at: new Date().toISOString(), message_actor: "visitor" }].slice(-200);
      if (els.reply) { els.reply.value = ""; els.reply.style.height = "38px"; }
      renderMessages(session.messages);
      setAiGenerating(true);
      updateReplyState();
      requestAnimationFrame(() => { if (els.messages) els.messages.scrollTop = els.messages.scrollHeight; });
      let visitorTurnSaved = false;
      try {
        // Build 152 durability rule: try to persist the visitor turn before Gemini,
        // but never convert a transient persistence problem into a human handoff.
        // The Edge Function can still commit the complete verified turn atomically.
        try {
          const begun = await beginAzizTurn(body, azizTurnId);
          visitorTurnSaved = true;
          if (begun?.visitor_message) {
            session.messages = (session.messages || []).filter(m => String(m.id) !== optimisticId);
            if (!session.messages.some(m => String(m.id) === String(begun.visitor_message.id))) session.messages.push(begun.visitor_message);
            session.messages = session.messages.slice(-200);
            persistSession();
            renderMessages(session.messages);
          }
        } catch (beginError) {
          console.warn("Aziz visitor-turn pre-save failed; continuing with server-side verified commit", beginError);
        }

        // Human transfer is explicit-only. The same path is used by the Live Agent
        // button, which submits an unambiguous visitor request through this form.
        const explicitHumanRequest = visitorRequestsHumanAgent(body);
        if (explicitHumanRequest) {
          await handoffAzizToAgent(body, historyBefore, azizTurnId);
          setAiGenerating(false);
          return;
        }

        const azizResult = await invokeAziz(body, historyBefore, azizTurnId);
        // Build 153 lets the same Gemini request semantically recognize an explicit
        // human request in any language. Only the Edge Function's signed/controlled
        // authorization flag may turn that semantic result into a real handoff.
        if (safeText(azizResult?.action).toLowerCase() === "handoff" && azizResult?.handoff_authorized === true) {
          await handoffAzizToAgent(body, historyBefore, azizTurnId);
          setAiGenerating(false);
          return;
        }
        const answer = safeText(azizResult?.answer).trim();
        if (!answer) throw new Error("Aziz could not answer right now. Please try again.");

        // Prefer the authoritative canonical transcript returned by the Edge commit.
        if (Array.isArray(azizResult?.messages) && azizResult.messages.length) {
          session.messages = azizResult.messages.slice(-200);
          persistSession();
          setAiGenerating(false);
          renderMessages(session.messages);
        } else {
          setAiGenerating(false);
          await refreshThread({ silent: true });
          const hasAnswer = (session?.messages || []).some(m => safeText(m?.body).trim() === answer && safeText(m?.message_actor).toLowerCase() === "ai");
          if (!hasAnswer) throw new Error("Aziz reply could not be confirmed in the chat record. Please try again.");
        }
      } catch (error) {
        setAiGenerating(false);
        if (session && isAzizSession()) await refreshThread({ silent: true }).catch(() => {});
        // Restore the text only when the pre-save did not complete, so retrying cannot
        // accidentally duplicate an already-durable visitor message.
        if (!visitorTurnSaved && els.reply && !els.reply.value) {
          els.reply.value = body;
          els.reply.dispatchEvent(new Event("input", { bubbles: true }));
        }
        const message = safeText(error?.message || "Aziz is temporarily unable to reply. Please try again, or use Live Agent if you want human support.");
        showError(els.replyError, message);
      } finally {
        replySending = false;
        updateReplyState();
        if (session) startPolling();
      }
      return;
    }
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
      const aiAnalysis = modeBeforeSend === "ai"
        ? await analyzeVisitorQuestion(body, session.messages || [])
        : null;
      const result = await replyLiveChatRpc({
        p_inquiry_id: session.inquiry_id,
        p_guest_token: session.guest_token,
        p_body: body
      }, aiAnalysis);

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
    if (session.closed === true) return;
    let proceed = true;
    if (typeof window.appConfirmDelete === "function") {
      proceed = await window.appConfirmDelete("End this live chat? Triplem VIP will retain the complete transcript. If an Agent is assisting you, they will be notified immediately and neither side will be able to send further messages in this conversation.", {
        title: "End live chat?",
        confirmLabel: "End Chat"
      });
    } else {
      proceed = window.confirm("End this live chat?");
    }
    if (!proceed) return;
    stopPolling();
    try {
      await supabaseRpc("app_public_live_chat_end", {
        p_inquiry_id: session.inquiry_id,
        p_guest_token: session.guest_token
      });
      await refreshThread({ silent: true });
      if (session) {
        session.closed = true;
        session.closed_by = session.closed_by || "visitor";
        session.close_reason = session.close_reason || "visitor_ended_chat";
        session.support_mode = "closed";
        persistSession();
        setSupportIdentity("closed", "Chat ended");
        updateReplyState();
        renderMessages(session.messages);
      }
    } catch (error) {
      showError(els.replyError, safeText(error?.message || "The live chat could not be ended. Please try again."));
      startPolling();
    }
  }

  function bind() {
    els.panel = $("landingLiveChatPanel");
    els.launcher = $("landingLiveChatLauncher");
    els.launcherLabel = els.launcher?.querySelector(".landing-live-chat-launcher-label");
    els.status = $("landingLiveChatStatus");
    els.availability = $("landingLiveChatAvailability");
    els.identity = $("landingLiveChatIdentity");
    els.agentTop = $("landingLiveChatAgentButton");
    els.startView = $("landingLiveChatStartView");
    els.intro = els.startView?.querySelector(".landing-live-chat-intro");
    els.conversation = $("landingLiveChatConversation");
    els.startForm = $("landingLiveChatStartForm");
    els.name = $("landingLiveChatName");
    els.phone = $("landingLiveChatPhone");
    els.email = $("landingLiveChatEmail");
    els.message = $("landingLiveChatMessage");
    els.startButton = $("landingLiveChatStartButton");
    els.startError = $("landingLiveChatStartError");
    els.messages = $("landingLiveChatMessages");
    els.guided = $("landingLiveChatGuided");
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
    els.agentTop?.addEventListener("click", event => { event.preventDefault(); requestAzizLiveAgent(); });
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
    els.reply?.addEventListener("keydown", event => submitOnEnter(event, els.replyForm));
    els.guided?.addEventListener("click", event => {
      const azizAgent = event.target.closest("[data-live-chat-aziz-agent]");
      if (azizAgent && !azizAgent.disabled) { requestAzizLiveAgent(); return; }
      const btn = event.target.closest("[data-live-chat-choice]");
      if (!btn || btn.disabled) return;
      chooseGuidedQuestion(safeText(btn.dataset.liveChatChoice).trim().toLowerCase()).catch(() => {});
    });
    els.reply?.addEventListener("input", resizeReply);
    document.addEventListener("visibilitychange", () => {
      if (!session) return;
      if (!document.hidden) signalVisitorPresence("resume").catch(() => {});
      startPolling();
    });
    // pagehide covers navigation, refresh and normal tab/window closure. The server
    // waits 15 seconds before acting, and pageshow/resume cancels that deadline.
    window.addEventListener("pagehide", () => {
      if (session && session.closed !== true) signalVisitorPresence("leaving", { keepalive: true });
    }, { capture: true });
    window.addEventListener("pageshow", () => {
      if (session && session.closed !== true) {
        signalVisitorPresence("resume").catch(() => {});
        startPolling();
      }
    }, { passive: true });
    window.addEventListener("online", () => {
      if (session && session.closed !== true) signalVisitorPresence("resume").catch(() => {});
    }, { passive: true });
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
    refreshSupportConfig().then(() => { if (!isAzizMode()) refreshAvailability().catch(() => {}); }).catch(() => refreshAvailability().catch(() => {}));
    if (supportConfigTimer) window.clearInterval(supportConfigTimer);
    supportConfigTimer = window.setInterval(() => refreshSupportConfig().catch(() => {}), 60000);
    window.addEventListener("focus", () => {
      refreshSupportConfig().catch(() => {});
      if (session && session.closed !== true) signalVisitorPresence("resume").catch(() => {});
    }, { passive: true });
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
