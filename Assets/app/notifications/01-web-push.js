/* Triplem VIP secure Web Push client + Main Admin/visitor notification center — v127 */
(() => {
  "use strict";

  const SW_URL = "/service-worker.js?v=123";
  const FUNCTION_NAME = "push-notifications";
  const stateLocal = {
    config: null,
    configPromise: null,
    syncing: false,
    togglePending: false,
    bound: false,
    selectedUsers: new Set(),
    adminMode: "all",
    visitorCount: 0,
    userPromptShown: false,
    promptUserId: "",
    visitorPromptShown: false,
    presenceTimer: null,
    presenceEndpoint: "",
    tabId: (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`).slice(0, 80)
  };


  const USER_PUSH_PREF_PREFIX = "triplem_push_account_pref_v1:";
  const VISITOR_PUSH_PREF_KEY = "triplem_push_visitor_pref_v1";
  const VISITOR_PUSH_TOKEN_KEY = "triplem_push_visitor_token_v1";

  function currentUserId() {
    return safe(typeof state !== "undefined" ? (state?.sessionUser?.id || state?.sessionUser?.user_id || state?.sessionUser?.owner_id || state?.currentUsername) : "").trim();
  }

  function accountPreferenceKey() {
    const id = currentUserId() || "unknown";
    return `${USER_PUSH_PREF_PREFIX}${id}`;
  }

  function getAccountPreference() {
    try { return localStorage.getItem(accountPreferenceKey()) || ""; } catch (_) { return ""; }
  }

  function setAccountPreference(value) {
    try { localStorage.setItem(accountPreferenceKey(), value === "on" ? "on" : "off"); } catch (_) {}
  }

  function getVisitorPreference() {
    try { return localStorage.getItem(VISITOR_PUSH_PREF_KEY) || ""; } catch (_) { return ""; }
  }

  function setVisitorPreference(value) {
    try { localStorage.setItem(VISITOR_PUSH_PREF_KEY, value === "on" ? "on" : "off"); } catch (_) {}
  }

  function visitorToken() {
    try {
      let token = localStorage.getItem(VISITOR_PUSH_TOKEN_KEY) || "";
      if (token.length < 24) {
        token = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}-${Math.random()}`;
        localStorage.setItem(VISITOR_PUSH_TOKEN_KEY, token);
      }
      return token;
    } catch (_) {
      return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}-${Math.random()}`;
    }
  }

  function safe(value) { return String(value ?? ""); }
  function esc(value) {
    if (typeof window.escapeHtml === "function") return window.escapeHtml(safe(value));
    return safe(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
  }

  function supported() {
    return window.isSecureContext
      && "serviceWorker" in navigator
      && "PushManager" in window
      && "Notification" in window;
  }

  function getConfigBase() {
    if (typeof window.getSupabaseConfig !== "function") throw new Error("Supabase configuration is unavailable.");
    const cfg = window.getSupabaseConfig();
    const base = safe(cfg?.supabaseUrl).replace(/\/$/, "");
    const key = safe(cfg?.supabaseKey).trim();
    if (!base || !key) throw new Error("Supabase configuration is unavailable.");
    return { base, key };
  }

  async function invoke(action, payload = {}, { sessionToken = "" } = {}) {
    const { base, key } = getConfigBase();
    const headers = {
      "apikey": key,
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json"
    };
    const token = safe(sessionToken || (typeof state !== "undefined" ? state?.sessionToken : "")).trim();
    if (token) headers["X-Session-Token"] = token;
    const response = await fetch(`${base}/functions/v1/${FUNCTION_NAME}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ action, ...payload }),
      cache: "no-store"
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }
    if (!response.ok || data?.ok === false) throw new Error(data?.error || `Push service request failed (${response.status}).`);
    return data || {};
  }

  async function getPushConfig(force = false) {
    if (!force && stateLocal.config) return stateLocal.config;
    if (!force && stateLocal.configPromise) return stateLocal.configPromise;
    stateLocal.configPromise = invoke("config").then(config => {
      stateLocal.config = config;
      return config;
    }).finally(() => { stateLocal.configPromise = null; });
    return stateLocal.configPromise;
  }

  function base64UrlToUint8Array(value) {
    const raw = safe(value).trim();
    const padding = "=".repeat((4 - raw.length % 4) % 4);
    const base64 = (raw + padding).replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(base64);
    const out = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i += 1) out[i] = decoded.charCodeAt(i);
    return out;
  }

  async function serviceWorkerRegistration() {
    if (!supported()) throw new Error("Web notifications are not supported by this browser.");
    await navigator.serviceWorker.register(SW_URL, { scope: "/", updateViaCache: "none" });
    return navigator.serviceWorker.ready;
  }

  function bytesEqual(a, b) {
    if (!a || !b) return false;
    const left = new Uint8Array(a instanceof ArrayBuffer ? a : a.buffer || a);
    const right = b instanceof Uint8Array ? b : new Uint8Array(b);
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i += 1) if (left[i] !== right[i]) return false;
    return true;
  }

  function subscriptionUsesPublicKey(subscription, publicKey) {
    if (!subscription || !publicKey) return false;
    const currentKey = subscription?.options?.applicationServerKey;
    if (!currentKey) return false;
    try { return bytesEqual(currentKey, base64UrlToUint8Array(publicKey)); }
    catch (_) { return false; }
  }

  async function unregisterEndpoint(endpoint) {
    const ep = safe(endpoint).trim();
    if (!ep || typeof window.supabaseRpc !== "function" || !(typeof state !== "undefined" && state?.sessionToken)) return false;
    await window.supabaseRpc("app_unregister_push_subscription", { p_endpoint: ep }).catch(() => {});
    return true;
  }

  async function ensureSubscriptionForVapid(registration, publicKey) {
    let subscription = await registration.pushManager.getSubscription();
    if (subscription && !subscriptionUsesPublicKey(subscription, publicKey)) {
      const oldEndpoint = safe(subscription.endpoint).trim();
      await unregisterEndpoint(oldEndpoint).catch(() => false);
      await subscription.unsubscribe().catch(() => false);
      subscription = null;
    }
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(publicKey)
      });
    }
    return subscription;
  }

  function subscriptionKeys(subscription) {
    const json = subscription?.toJSON?.() || {};
    return {
      endpoint: safe(subscription?.endpoint || json.endpoint).trim(),
      p256dh: safe(json?.keys?.p256dh).trim(),
      auth: safe(json?.keys?.auth).trim()
    };
  }

  function deviceLabel() {
    const ua = navigator.userAgent || "";
    const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /CriOS\//.test(ua) ? "Chrome iOS" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
    const platform = safe(navigator.userAgentData?.platform || navigator.platform || "Device").slice(0, 48);
    return `${browser} · ${platform}`;
  }

  async function registerSubscriptionAsVisitor(subscription) {
    if (!subscription) throw new Error("Push subscription is unavailable.");
    const keys = subscriptionKeys(subscription);
    if (!keys.endpoint || !keys.p256dh || !keys.auth) throw new Error("Browser push subscription is incomplete.");
    return invoke("visitor_register", {
      visitor_token: visitorToken(),
      endpoint: keys.endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      user_agent: navigator.userAgent || "",
      device_label: deviceLabel()
    });
  }

  async function unregisterVisitorEndpoint(endpoint) {
    const ep = safe(endpoint).trim();
    if (!ep) return false;
    try {
      const result = await invoke("visitor_unregister", { visitor_token: visitorToken(), endpoint: ep });
      return result?.ok === true;
    } catch (_) { return false; }
  }

  function landingIsVisible() {
    const lock = document.getElementById("lockScreen");
    const signIn = document.getElementById("signInOverlay");
    const signInOpen = !!signIn && !signIn.classList.contains("hide");
    return !!lock && !lock.classList.contains("hide") && !signInOpen && !(typeof state !== "undefined" && state?.unlocked);
  }

  async function enableVisitorNotifications() {
    if (!supported()) throw new Error("Web notifications are not supported on this device/browser.");
    const cfg = await getPushConfig(true);
    if (!cfg?.enabled || !cfg?.vapid_public_key) throw new Error("Web Push server setup is not complete yet.");
    let permission = Notification.permission;
    if (permission === "default") permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("Notification permission was not granted by this browser.");
    const registration = await serviceWorkerRegistration();
    const subscription = await ensureSubscriptionForVapid(registration, cfg.vapid_public_key);
    await registerSubscriptionAsVisitor(subscription);
    setVisitorPreference("on");
    return { ok: true, enabled: true };
  }

  async function syncVisitorSubscription() {
    if (!supported() || Notification.permission !== "granted" || getVisitorPreference() !== "on" || !landingIsVisible()) return false;
    try {
      const cfg = await getPushConfig(true);
      if (!cfg?.enabled || !cfg?.vapid_public_key) return false;
      const registration = await serviceWorkerRegistration();
      const subscription = await ensureSubscriptionForVapid(registration, cfg.vapid_public_key);
      await registerSubscriptionAsVisitor(subscription);
      return true;
    } catch (_) { return false; }
  }

  async function registerSubscriptionWithAccount(subscription) {
    if (!subscription) throw new Error("Push subscription is unavailable.");
    if (typeof window.supabaseRpc !== "function") throw new Error("Database connection is unavailable.");
    const keys = subscriptionKeys(subscription);
    if (!keys.endpoint || !keys.p256dh || !keys.auth) throw new Error("Browser push subscription is incomplete.");
    return window.supabaseRpc("app_register_push_subscription", {
      p_endpoint: keys.endpoint,
      p_p256dh: keys.p256dh,
      p_auth: keys.auth,
      p_user_agent: navigator.userAgent || "",
      p_device_label: deviceLabel()
    });
  }

  async function currentSubscription() {
    if (!supported()) return null;
    const reg = await serviceWorkerRegistration();
    return reg.pushManager.getSubscription();
  }


  const PRESENCE_TABS_KEY = "triplem_push_open_tabs_v1";
  const PRESENCE_TAB_STALE_MS = 180000;

  function readOpenTabs() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PRESENCE_TABS_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) { return {}; }
  }

  function writeOpenTabs(tabs) {
    try { localStorage.setItem(PRESENCE_TABS_KEY, JSON.stringify(tabs || {})); } catch (_) {}
  }

  function touchOpenTab() {
    const now = Date.now();
    const tabs = readOpenTabs();
    Object.keys(tabs).forEach(id => { if (!Number(tabs[id]) || now - Number(tabs[id]) > PRESENCE_TAB_STALE_MS) delete tabs[id]; });
    tabs[stateLocal.tabId] = now;
    writeOpenTabs(tabs);
  }

  function removeOpenTabAndCheckOthers() {
    const now = Date.now();
    const tabs = readOpenTabs();
    delete tabs[stateLocal.tabId];
    Object.keys(tabs).forEach(id => { if (!Number(tabs[id]) || now - Number(tabs[id]) > PRESENCE_TAB_STALE_MS) delete tabs[id]; });
    writeOpenTabs(tabs);
    return Object.keys(tabs).length > 0;
  }

  async function setClientPresence(open, { keepalive = false } = {}) {
    if (!(typeof state !== "undefined" && state?.sessionToken && state?.sessionUser)) return false;
    let endpoint = stateLocal.presenceEndpoint;
    if (!endpoint) {
      const subscription = await currentSubscription().catch(() => null);
      endpoint = safe(subscription?.endpoint).trim();
      stateLocal.presenceEndpoint = endpoint;
    }
    if (!endpoint) return false;

    if (!keepalive) {
      if (typeof window.supabaseRpc !== "function") return false;
      await window.supabaseRpc("app_set_push_client_presence", { p_endpoint: endpoint, p_open: open === true });
      return true;
    }

    try {
      const { base, key } = getConfigBase();
      fetch(`${base}/rest/v1/rpc/app_set_push_client_presence`, {
        method: "POST",
        headers: {
          "apikey": key,
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json",
          "X-Session-Token": safe(state.sessionToken)
        },
        body: JSON.stringify({ p_endpoint: endpoint, p_open: open === true }),
        keepalive: true,
        credentials: "omit",
        cache: "no-store"
      }).catch(() => {});
      return true;
    } catch (_) { return false; }
  }

  async function startClientPresence() {
    if (!supported() || Notification.permission !== "granted") return false;
    if (!(typeof state !== "undefined" && state?.unlocked && state?.sessionToken && state?.sessionUser)) return false;
    const subscription = await currentSubscription().catch(() => null);
    stateLocal.presenceEndpoint = safe(subscription?.endpoint).trim();
    if (!stateLocal.presenceEndpoint) return false;
    touchOpenTab();
    await setClientPresence(true).catch(() => false);
    if (stateLocal.presenceTimer) clearInterval(stateLocal.presenceTimer);
    stateLocal.presenceTimer = window.setInterval(() => {
      touchOpenTab();
      setClientPresence(true).catch(() => {});
    }, 45000);
    return true;
  }

  function closeClientPresence() {
    if (stateLocal.presenceTimer) {
      clearInterval(stateLocal.presenceTimer);
      stateLocal.presenceTimer = null;
    }
    const otherTabsRemain = removeOpenTabAndCheckOthers();
    if (!otherTabsRemain) setClientPresence(false, { keepalive: true }).catch(() => {});
  }

  async function enable() {
    if (!supported()) throw new Error("Web notifications are not supported on this device/browser.");
    if (!(typeof state !== "undefined" && state?.unlocked && state?.sessionToken && state?.sessionUser)) {
      throw new Error("Sign in to Triplem VIP before enabling device notifications.");
    }
    const cfg = await getPushConfig(true);
    if (!cfg?.enabled || !cfg?.vapid_public_key) throw new Error("Web Push server setup is not complete yet.");
    let permission = Notification.permission;
    if (permission === "default") permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("Notification permission was not granted by this browser.");

    const registration = await serviceWorkerRegistration();
    const subscription = await ensureSubscriptionForVapid(registration, cfg.vapid_public_key);
    await registerSubscriptionWithAccount(subscription);
    setAccountPreference("on");
    stateLocal.presenceEndpoint = safe(subscription?.endpoint).trim();
    await startClientPresence().catch(() => false);
    await refreshControl();
    return { ok: true, enabled: true };
  }

  async function disable() {
    // Optimistic by design: reflect the user's choice immediately, then retire
    // the remote subscription in the background. A server delay must never make
    // the bell switch feel sluggish.
    setAccountPreference("off");
    setPushControlStatus({ enabled: false, label: "Device notifications off", detail: "Turn on anytime to receive alerts on this device." });
    const registration = await serviceWorkerRegistration();
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      stateLocal.presenceEndpoint = safe(subscription.endpoint).trim();
      await setClientPresence(false).catch(() => false);
      const endpoint = safe(subscription.endpoint).trim();
      const remoteCleanup = [];
      if (endpoint && typeof window.supabaseRpc === "function" && typeof state !== "undefined" && state?.sessionToken) {
        remoteCleanup.push(window.supabaseRpc("app_unregister_push_subscription", { p_endpoint: endpoint }).catch(() => null));
      }
      remoteCleanup.push(unregisterVisitorEndpoint(endpoint).catch(() => false));
      remoteCleanup.push(subscription.unsubscribe().catch(() => false));
      await Promise.allSettled(remoteCleanup);
    }
    stateLocal.presenceEndpoint = "";
    if (stateLocal.presenceTimer) { clearInterval(stateLocal.presenceTimer); stateLocal.presenceTimer = null; }
    return { ok: true, enabled: false };
  }

  async function syncExistingSubscription() {
    if (stateLocal.syncing || !supported() || Notification.permission !== "granted") return false;
    if (!(typeof state !== "undefined" && state?.unlocked && state?.sessionToken && state?.sessionUser)) return false;
    if (getAccountPreference() === "off") return false;
    stateLocal.syncing = true;
    try {
      const cfg = await getPushConfig(true);
      if (!cfg?.enabled || !cfg?.vapid_public_key) return false;
      const registration = await serviceWorkerRegistration();
      const subscription = await ensureSubscriptionForVapid(registration, cfg.vapid_public_key);
      if (!subscription) return false;
      await registerSubscriptionWithAccount(subscription);
      setAccountPreference("on");
      stateLocal.presenceEndpoint = safe(subscription?.endpoint).trim();
      await startClientPresence().catch(() => false);
      return true;
    } catch (_) {
      return false;
    } finally {
      stateLocal.syncing = false;
      refreshControl().catch(() => {});
    }
  }

  function setPushControlStatus({ enabled = false, label = "", detail = "", disabled = false } = {}) {
    const btn = document.getElementById("pushNotificationToggleBtn");
    const quick = document.getElementById("pushQuickToggleBtn");
    const statusEl = document.getElementById("pushNotificationStatus");
    if (btn) {
      btn.disabled = disabled;
      btn.classList.toggle("is-enabled", enabled);
      btn.innerHTML = `<i class="fa-solid ${enabled ? "fa-bell" : "fa-bell-slash"}" aria-hidden="true"></i><span>${esc(label || (enabled ? "Device notifications on" : "Enable device notifications"))}</span>`;
    }
    if (quick) {
      quick.disabled = disabled;
      quick.classList.toggle("is-on", enabled);
      quick.setAttribute("aria-checked", enabled ? "true" : "false");
      quick.setAttribute("aria-label", enabled ? "Turn device notifications off" : "Turn device notifications on");
      quick.title = enabled ? "Device notifications on" : "Device notifications off";
    }
    if (statusEl) statusEl.textContent = detail;
  }

  async function refreshControl() {
    if (!document.getElementById("pushNotificationToggleBtn")) return;
    if (!supported()) {
      setPushControlStatus({ label: "Web Push unavailable", detail: "This browser does not support Web Push.", disabled: true });
      return;
    }
    if (!(typeof state !== "undefined" && state?.unlocked && state?.sessionUser)) {
      setPushControlStatus({ label: "Enable device notifications", detail: "Sign in to configure notifications.", disabled: true });
      return;
    }
    if (Notification.permission === "denied") {
      setPushControlStatus({ label: "Notifications blocked", detail: "Allow Triplem VIP notifications in browser/site settings.", disabled: true });
      return;
    }
    if (getAccountPreference() === "off") {
      setPushControlStatus({ enabled: false, label: "Device notifications off", detail: "Turn on anytime to receive alerts on this device." });
      return;
    }
    let subscription = null;
    try { subscription = await currentSubscription(); } catch (_) {}
    if (subscription && Notification.permission === "granted") {
      setPushControlStatus({ enabled: true, label: "Device notifications on", detail: "Receive important alerts whether Triplem VIP is open or closed." });
    } else {
      setPushControlStatus({ enabled: false, label: "Enable device notifications", detail: "Receive Triplem VIP alerts even when the browser is closed." });
    }
  }

  async function toggleAccountNotifications({ optimisticEnabled = null } = {}) {
    const subscription = await currentSubscription().catch(() => null);
    const currentlyOn = getAccountPreference() !== "off" && !!subscription && Notification.permission === "granted";
    if (currentlyOn || optimisticEnabled === false) await disable();
    else await enable();
  }

  function bindUserToggle() {
    [document.getElementById("pushNotificationToggleBtn"), document.getElementById("pushQuickToggleBtn")].filter(Boolean).forEach(btn => {
      if (btn.dataset.bound === "1") return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        if (stateLocal.togglePending || btn.disabled) return;
        const quick = document.getElementById("pushQuickToggleBtn");
        const appearsOn = quick ? quick.classList.contains("is-on") : btn.classList.contains("is-enabled");
        const optimisticEnabled = !appearsOn;
        stateLocal.togglePending = true;
        if (optimisticEnabled) {
          setPushControlStatus({ enabled: true, label: "Enabling device notifications…", detail: "Finishing secure registration in the background." });
        } else {
          setAccountPreference("off");
          setPushControlStatus({ enabled: false, label: "Device notifications off", detail: "Turn on anytime to receive alerts on this device." });
        }
        Promise.resolve(toggleAccountNotifications({ optimisticEnabled }))
          .catch(error => {
            refreshControl().catch(() => {});
            alert(error?.message || "Device notifications could not be updated.");
          })
          .finally(() => {
            stateLocal.togglePending = false;
            refreshControl().catch(() => {});
          });
      });
    });
  }

  function ensurePushConsentModal() {
    let modal = document.getElementById("pushConsentModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "pushConsentModal";
    modal.className = "push-consent-overlay hide";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <div class="push-consent-card" role="dialog" aria-modal="true" aria-labelledby="pushConsentTitle">
        <div class="push-consent-icon"><i class="fa-solid fa-bell"></i></div>
        <div class="push-consent-copy"><p class="push-consent-kicker">Triplem VIP Notifications</p><h3 id="pushConsentTitle">Keep important updates within reach</h3><p id="pushConsentText">Enable secure device alerts so you do not miss security notices, account activity, messages, reminders or support updates, even when Triplem VIP is closed.</p></div>
        <p class="push-consent-error" id="pushConsentError" aria-live="polite"></p>
        <div class="push-consent-actions"><button type="button" class="btn ghost push-consent-later" id="pushConsentLaterBtn">Keep notifications off</button><button type="button" class="btn primary push-consent-enable" id="pushConsentEnableBtn"><i class="fa-solid fa-bell"></i> Enable secure alerts</button></div>
      </div>`;
    document.body.appendChild(modal);
    return modal;
  }

  function closePushConsentModal() {
    const modal = document.getElementById("pushConsentModal");
    if (!modal) return;
    modal.classList.add("hide");
    modal.setAttribute("aria-hidden", "true");
    modal.dataset.mode = "";
  }

  function openPushConsentModal(mode) {
    const modal = ensurePushConsentModal();
    if (!modal.classList.contains("hide")) return;
    const accountMode = mode === "account";
    modal.dataset.mode = accountMode ? "account" : "visitor";
    const title = modal.querySelector("#pushConsentTitle");
    const text = modal.querySelector("#pushConsentText");
    const error = modal.querySelector("#pushConsentError");
    const browserBlocked = typeof Notification !== "undefined" && Notification.permission === "denied";
    if (title) title.textContent = accountMode
      ? (browserBlocked ? "Notifications are currently blocked" : "Keep important updates within reach")
      : "Stay connected with Triplem VIP";
    if (text) text.textContent = accountMode
      ? (browserBlocked
          ? "Triplem VIP cannot deliver device alerts because notifications are blocked in this browser. Allow notifications for triplem.vip in your browser or site settings so important messages and security updates are not missed."
          : "Enable secure device alerts so you do not miss security notices, account activity, messages, reminders or support updates, even when Triplem VIP is closed.")
      : "Allow concise Triplem VIP announcements and important public updates on this device. You can disable them later from browser settings.";
    if (error) error.textContent = "";
    modal.classList.remove("hide");
    modal.setAttribute("aria-hidden", "false");

    const enableBtn = modal.querySelector("#pushConsentEnableBtn");
    const laterBtn = modal.querySelector("#pushConsentLaterBtn");
    if (laterBtn) laterBtn.textContent = accountMode ? "Keep notifications off" : "Not now";
    if (enableBtn) enableBtn.innerHTML = browserBlocked && accountMode
      ? `<i class="fa-solid fa-gear"></i> Review browser settings`
      : `<i class="fa-solid fa-bell"></i> Enable secure alerts`;
    if (enableBtn && enableBtn.dataset.bound !== "1") {
      enableBtn.dataset.bound = "1";
      enableBtn.addEventListener("click", async () => {
        const modeNow = modal.dataset.mode || "visitor";
        enableBtn.disabled = true;
        if (laterBtn) laterBtn.disabled = true;
        if (error) error.textContent = "";
        try {
          if (modeNow === "account" && typeof Notification !== "undefined" && Notification.permission === "denied") {
            throw new Error("Allow notifications for triplem.vip in your browser/site settings, then return here and enable them again.");
          }
          if (modeNow === "account") await enable(); else await enableVisitorNotifications();
          closePushConsentModal();
        } catch (err) { if (error) error.textContent = err?.message || "Notifications could not be enabled."; }
        finally { enableBtn.disabled = false; if (laterBtn) laterBtn.disabled = false; refreshControl().catch(() => {}); }
      });
    }
    if (laterBtn && laterBtn.dataset.bound !== "1") {
      laterBtn.dataset.bound = "1";
      laterBtn.addEventListener("click", () => {
        if ((modal.dataset.mode || "visitor") === "account") setAccountPreference("off"); else setVisitorPreference("off");
        closePushConsentModal();
        refreshControl().catch(() => {});
      });
    }
  }

  async function maybePromptSignedInUser({ forceLoginPrompt = false } = {}) {
    if (!supported()) return false;
    if (!(typeof state !== "undefined" && state?.unlocked && state?.sessionUser)) return false;
    const userId = currentUserId();
    if (stateLocal.promptUserId !== userId || forceLoginPrompt) {
      stateLocal.promptUserId = userId;
      stateLocal.userPromptShown = false;
    }
    if (stateLocal.userPromptShown) return false;

    const appTurnedOff = getAccountPreference() === "off";
    const browserBlocked = Notification.permission === "denied";
    if (!appTurnedOff && !browserBlocked && Notification.permission === "granted") {
      await syncExistingSubscription().catch(() => false);
      return false;
    }

    stateLocal.userPromptShown = true;
    openPushConsentModal("account");
    return true;
  }

  function promptAfterLogin() {
    stateLocal.promptUserId = currentUserId();
    stateLocal.userPromptShown = false;
    window.setTimeout(() => maybePromptSignedInUser({ forceLoginPrompt: true }).catch(() => {}), 900);
  }

  async function maybePromptVisitor() {
    if (stateLocal.visitorPromptShown || !supported() || !landingIsVisible()) return false;
    const pref = getVisitorPreference();
    if (pref === "off" || Notification.permission === "denied") return false;
    if (pref === "on" && Notification.permission === "granted") {
      await syncVisitorSubscription().catch(() => false);
      return false;
    }
    stateLocal.visitorPromptShown = true;
    openPushConsentModal("visitor");
    return true;
  }

  function ensureAdminPushModal() {
    let modal = document.getElementById("adminPushNotificationModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "adminPushNotificationModal";
    modal.className = "modal hide admin-push-modal";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <div class="modal-backdrop" data-admin-push-close></div>
      <div class="modal-dialog admin-push-dialog" role="dialog" aria-modal="true" aria-labelledby="adminPushTitle">
        <div class="modal-head admin-push-head">
          <div><p class="admin-push-kicker"><i class="fa-solid fa-bell"></i> Web Push Center</p><h3 id="adminPushTitle">Send Triplem VIP notification</h3><p>Securely notify registered users, selected accounts, or subscribed visitors.</p></div>
          <button type="button" class="btn ghost tiny" data-admin-push-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body admin-push-body">
          <div class="admin-push-mode" role="group" aria-label="Recipients">
            <button type="button" class="admin-push-mode-btn is-active" data-admin-push-mode="all"><i class="fa-solid fa-users"></i><span>All users</span></button>
            <button type="button" class="admin-push-mode-btn" data-admin-push-mode="selected"><i class="fa-solid fa-user-check"></i><span>Selected users</span></button>
            <button type="button" class="admin-push-mode-btn" data-admin-push-mode="visitors"><i class="fa-solid fa-earth-americas"></i><span>Visitors</span></button>
          </div>
          <div class="admin-push-audience-summary" id="adminPushAudienceSummary"></div>
          <div class="admin-push-selector hide" id="adminPushSelector">
            <label class="admin-push-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" class="input" id="adminPushUserSearch" placeholder="Search username or full name…" autocomplete="off" /></label>
            <div class="admin-push-select-tools"><button type="button" class="btn ghost tiny" id="adminPushSelectVisibleBtn">Select visible</button><button type="button" class="btn ghost tiny" id="adminPushClearSelectedBtn">Clear</button><span id="adminPushSelectedCount">0 selected</span></div>
            <div class="admin-push-user-list" id="adminPushUserList"></div>
          </div>
          <div class="admin-push-compose">
            <label class="form-label" for="adminPushNotificationTitle">Title</label>
            <input class="input" id="adminPushNotificationTitle" maxlength="90" placeholder="Notification title" autocomplete="off" />
            <div class="admin-push-field-meta"><span>Keep the title concise.</span><span id="adminPushTitleCount">0/90</span></div>
            <label class="form-label" for="adminPushNotificationBody">Message</label>
            <textarea class="input admin-push-textarea" id="adminPushNotificationBody" maxlength="600" placeholder="Write the notification message…"></textarea>
            <div class="admin-push-field-meta"><span>Users will also receive this in their Triplem VIP notification bell.</span><span id="adminPushBodyCount">0/600</span></div>
          </div>
          <div class="admin-push-security-note"><i class="fa-solid fa-shield-halved"></i><div><strong>Secure delivery</strong><span>The VAPID private key remains server-side. Only users who enabled browser notifications receive Web Push.</span></div></div>
          <p class="admin-push-error" id="adminPushError" role="alert"></p>
        </div>
        <div class="modal-actions admin-push-actions"><button type="button" class="btn ghost" data-admin-push-close>Cancel</button><button type="button" class="btn primary" id="adminPushSendBtn"><i class="fa-solid fa-paper-plane"></i> Send notification</button></div>
      </div>`;
    document.body.appendChild(modal);
    return modal;
  }

  function adminUsers() {
    const me = safe(typeof state !== "undefined" ? state?.sessionUser?.id : "");
    const globalState = typeof state !== "undefined" ? state : null;
    return (Array.isArray(globalState?.adminUsersCache) ? globalState.adminUsersCache : [])
      .filter(user => user?.is_active !== false && safe(user?.id) && safe(user?.id) !== me)
      .sort((a,b) => safe(a.display_name || a.username).localeCompare(safe(b.display_name || b.username)));
  }

  async function ensureAdminUsersLoaded() {
    if (adminUsers().length) return adminUsers();
    if (typeof window.supabaseRpc !== "function") return [];
    const rows = await window.supabaseRpc("app_admin_list_users", {});
    if (Array.isArray(rows) && typeof state !== "undefined") state.adminUsersCache = rows;
    return adminUsers();
  }

  function adminPushFilteredUsers() {
    const input = document.getElementById("adminPushUserSearch");
    const query = safe(input?.value).trim().toLowerCase();
    const rows = adminUsers();
    if (!query) return rows;
    return rows.filter(user => [user.username,user.display_name,user.company_name].some(value => safe(value).toLowerCase().includes(query)));
  }

  function adminPushUserLogo(user) {
    const src = safe(user?.logo_url || user?.settings?.logo || "").trim() || "Assets/logo/logo.png";
    const name = safe(user?.display_name || user?.username || "Triplem VIP user");
    return `<img src="${esc(src)}" alt="${esc(name)} logo" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='Assets/logo/logo.png'" />`;
  }

  function renderAdminPushUsers() {
    const list = document.getElementById("adminPushUserList");
    if (!list) return;
    const rows = adminPushFilteredUsers();
    list.innerHTML = rows.length ? rows.map(user => {
      const id = safe(user.id);
      const checked = stateLocal.selectedUsers.has(id);
      const name = safe(user.display_name || user.username || "User");
      const meta = [user.username ? `@${user.username}` : "", user.company_name || ""].filter(Boolean).join(" · ");
      return `<label class="admin-push-user-row ${checked ? "is-selected" : ""}"><input type="checkbox" data-admin-push-user="${esc(id)}" ${checked ? "checked" : ""}/><span class="admin-push-user-avatar">${adminPushUserLogo(user)}</span><span><strong>${esc(name)}</strong><small>${esc(meta)}</small></span></label>`;
    }).join("") : `<div class="admin-push-empty">No users match this search.</div>`;
    list.querySelectorAll("[data-admin-push-user]").forEach(input => input.addEventListener("change", () => {
      const id = safe(input.dataset.adminPushUser);
      if (input.checked) stateLocal.selectedUsers.add(id); else stateLocal.selectedUsers.delete(id);
      renderAdminPushUsers();
      updateAdminPushSummary();
    }));
  }

  function updateAdminPushSummary() {
    const rows = adminUsers();
    const selected = stateLocal.selectedUsers.size;
    const summary = document.getElementById("adminPushAudienceSummary");
    const selectedCount = document.getElementById("adminPushSelectedCount");
    if (selectedCount) selectedCount.textContent = `${selected} selected`;
    if (summary) {
      if (stateLocal.adminMode === "visitors") {
        const n = Number(stateLocal.visitorCount) || 0;
        summary.innerHTML = `<i class="fa-solid fa-earth-americas"></i><div><strong>${n} subscribed visitor device${n === 1 ? "" : "s"}</strong><span>Anonymous landing-page subscribers receive Web Push only; no account or private data is exposed.</span></div>`;
      } else if (stateLocal.adminMode === "all") {
        summary.innerHTML = `<i class="fa-solid fa-users"></i><div><strong>${rows.length} registered user${rows.length === 1 ? "" : "s"}</strong><span>All active accounts except your Main Admin account will receive the in-app notification and Web Push where enabled.</span></div>`;
      } else {
        summary.innerHTML = `<i class="fa-solid fa-user-check"></i><div><strong>${selected} selected user${selected === 1 ? "" : "s"}</strong><span>Search and choose one or several registered recipients below.</span></div>`;
      }
    }
  }

  async function loadAdminVisitorCount() {
    if (!(typeof state !== "undefined" && state?.sessionToken)) return 0;
    try {
      const result = await invoke("admin_visitor_count", {}, { sessionToken: state.sessionToken });
      stateLocal.visitorCount = Number(result?.subscriber_count) || 0;
    } catch (_) { stateLocal.visitorCount = 0; }
    updateAdminPushSummary();
    return stateLocal.visitorCount;
  }

  function setAdminPushMode(mode) {
    stateLocal.adminMode = mode === "selected" ? "selected" : mode === "visitors" ? "visitors" : "all";
    document.querySelectorAll("[data-admin-push-mode]").forEach(btn => btn.classList.toggle("is-active", btn.dataset.adminPushMode === stateLocal.adminMode));
    document.getElementById("adminPushSelector")?.classList.toggle("hide", stateLocal.adminMode !== "selected");
    if (stateLocal.adminMode === "visitors") loadAdminVisitorCount().catch(() => {});
    updateAdminPushSummary();
  }

  function closeAdminPushModal() {
    const modal = document.getElementById("adminPushNotificationModal");
    if (!modal) return;
    modal.classList.add("hide");
    modal.setAttribute("aria-hidden","true");
    if (!document.querySelector(".modal:not(.hide)")) document.body.style.overflow = "";
  }

  async function openAdminPushModal() {
    if (!(typeof isProtectedAdminSession === "function" && isProtectedAdminSession())) {
      alert("Main Admin access is required.");
      return;
    }
    const modal = ensureAdminPushModal();
    modal.classList.remove("hide");
    modal.setAttribute("aria-hidden","false");
    document.body.style.overflow = "hidden";
    const error = document.getElementById("adminPushError");
    if (error) error.textContent = "";
    await Promise.all([ensureAdminUsersLoaded().catch(() => []), loadAdminVisitorCount().catch(() => 0)]);
    renderAdminPushUsers();
    updateAdminPushSummary();
  }

  async function sendAdminPush() {
    const titleEl = document.getElementById("adminPushNotificationTitle");
    const bodyEl = document.getElementById("adminPushNotificationBody");
    const sendBtn = document.getElementById("adminPushSendBtn");
    const errorEl = document.getElementById("adminPushError");
    const title = safe(titleEl?.value).trim();
    const body = safe(bodyEl?.value).trim();
    const selected = Array.from(stateLocal.selectedUsers);
    if (errorEl) errorEl.textContent = "";
    if (title.length < 2) { if (errorEl) errorEl.textContent = "Enter a notification title."; titleEl?.focus(); return; }
    if (body.length < 2) { if (errorEl) errorEl.textContent = "Enter notification text."; bodyEl?.focus(); return; }
    if (stateLocal.adminMode === "selected" && !selected.length) { if (errorEl) errorEl.textContent = "Select at least one user."; return; }
    if (stateLocal.adminMode === "visitors" && !(Number(stateLocal.visitorCount) > 0)) { if (errorEl) errorEl.textContent = "No landing-page visitors have subscribed to notifications yet."; return; }
    const audience = stateLocal.adminMode === "visitors"
      ? `${Number(stateLocal.visitorCount) || 0} subscribed visitor device${Number(stateLocal.visitorCount) === 1 ? "" : "s"}`
      : stateLocal.adminMode === "all"
        ? `${adminUsers().length} registered users`
        : `${selected.length} selected user${selected.length === 1 ? "" : "s"}`;
    if (!window.confirm(`Send this Triplem VIP notification to ${audience}?`)) return;

    sendBtn.disabled = true;
    sendBtn.classList.add("loading");
    try {
      const result = await invoke("admin_send", {
        title,
        body,
        audience: stateLocal.adminMode === "visitors" ? "visitors" : "users",
        all: stateLocal.adminMode === "all",
        user_ids: stateLocal.adminMode === "selected" ? selected : []
      }, { sessionToken: state?.sessionToken || "" });
      if (titleEl) titleEl.value = "";
      if (bodyEl) bodyEl.value = "";
      stateLocal.selectedUsers.clear();
      const titleCount = document.getElementById("adminPushTitleCount");
      const bodyCount = document.getElementById("adminPushBodyCount");
      if (titleCount) titleCount.textContent = "0/90";
      if (bodyCount) bodyCount.textContent = "0/600";
      if (errorEl) {
        errorEl.classList.add("is-success");
        const delivery = result?.delivery;
        const recipientCount = Number(result?.recipient_count ?? result?.subscriber_count) || 0;
        const visitorAudience = result?.audience === "visitors" || stateLocal.adminMode === "visitors";
        const inAppCount = visitorAudience ? 0 : (Number(result?.notification_count ?? recipientCount) || 0);
        if (delivery) {
          const failed = Number(delivery.failed) || 0;
          const firstFailure = Array.isArray(delivery.failures) ? delivery.failures[0] : null;
          const failureHint = failed && firstFailure ? ` (${safe(firstFailure.host || "push service")}${Number(firstFailure.status) ? ` HTTP ${Number(firstFailure.status)}` : ""})` : "";
          if (visitorAudience) errorEl.textContent = `${Number(delivery.sent) || 0} visitor device push${Number(delivery.sent) === 1 ? "" : "es"} accepted${failed ? `, ${failed} failed${failureHint}` : ""}.`;
          else errorEl.textContent = `${inAppCount} in-app notification${inAppCount === 1 ? "" : "s"} created; ${Number(delivery.sent) || 0} device push${Number(delivery.sent) === 1 ? "" : "es"} accepted${failed ? `, ${failed} failed${failureHint}` : ""}.`;
        } else if (visitorAudience) {
          errorEl.textContent = `${recipientCount} subscribed visitor device${recipientCount === 1 ? "" : "s"} queued securely for Web Push delivery.`;
        } else {
          errorEl.textContent = `${inAppCount} in-app notification${inAppCount === 1 ? "" : "s"} created for ${recipientCount} user${recipientCount === 1 ? "" : "s"}; Web Push delivery continues securely in the background.`;
        }
      }
      if (typeof refreshAdminCommsBadges === "function") refreshAdminCommsBadges().catch(() => {});
    } catch (error) {
      if (errorEl) {
        errorEl.classList.remove("is-success");
        errorEl.textContent = error?.message || "Notification could not be sent.";
      }
    } finally {
      sendBtn.disabled = false;
      sendBtn.classList.remove("loading");
    }
  }

  function bindAdminPush() {
    const btn = document.getElementById("adminPushNotificationsBtn");
    if (btn) {
      const visible = typeof isProtectedAdminSession === "function" && isProtectedAdminSession();
      btn.classList.toggle("hide", !visible);
      if (btn.dataset.bound !== "1") {
        btn.dataset.bound = "1";
        btn.addEventListener("click", () => openAdminPushModal().catch(error => alert(error?.message || "Push Center could not be opened.")));
      }
    }
    const modal = ensureAdminPushModal();
    if (modal.dataset.bound === "1") return;
    modal.dataset.bound = "1";
    modal.querySelectorAll("[data-admin-push-close]").forEach(el => el.addEventListener("click", closeAdminPushModal));
    modal.querySelectorAll("[data-admin-push-mode]").forEach(el => el.addEventListener("click", () => setAdminPushMode(el.dataset.adminPushMode)));
    document.getElementById("adminPushUserSearch")?.addEventListener("input", renderAdminPushUsers);
    document.getElementById("adminPushSelectVisibleBtn")?.addEventListener("click", () => {
      adminPushFilteredUsers().forEach(user => stateLocal.selectedUsers.add(safe(user.id)));
      renderAdminPushUsers(); updateAdminPushSummary();
    });
    document.getElementById("adminPushClearSelectedBtn")?.addEventListener("click", () => {
      stateLocal.selectedUsers.clear(); renderAdminPushUsers(); updateAdminPushSummary();
    });
    const titleEl = document.getElementById("adminPushNotificationTitle");
    const bodyEl = document.getElementById("adminPushNotificationBody");
    titleEl?.addEventListener("input", () => { const el=document.getElementById("adminPushTitleCount"); if(el) el.textContent=`${titleEl.value.length}/90`; });
    bodyEl?.addEventListener("input", () => { const el=document.getElementById("adminPushBodyCount"); if(el) el.textContent=`${bodyEl.value.length}/600`; });
    document.getElementById("adminPushSendBtn")?.addEventListener("click", () => sendAdminPush().catch(() => {}));
  }

  async function requestLiveChatAgentPush(inquiryId, guestToken) {
    const id = safe(inquiryId).trim();
    const token = safe(guestToken).trim();
    if (!id || !token) return false;
    try {
      const result = await invoke("live_chat_agent_request", { inquiry_id: id, guest_token: token });
      return result?.ok === true;
    } catch (_) {
      return false;
    }
  }

  async function requestMessagePush(inquiryId) {
    const id = safe(inquiryId).trim();
    if (!id || !(typeof state !== "undefined" && state?.sessionToken && state?.sessionUser)) return false;
    try {
      const result = await invoke("message_notify", { inquiry_id: id }, { sessionToken: state.sessionToken });
      return result?.ok === true;
    } catch (error) {
      console.warn("Triplem VIP message push could not be queued", error?.message || error);
      return false;
    }
  }

  function bind() {
    bindUserToggle();
    bindAdminPush();
    refreshControl().catch(() => {});
    serviceWorkerRegistration().catch(() => {});
    window.setTimeout(() => {
      if (typeof state !== "undefined" && state?.unlocked) {
        syncExistingSubscription().catch(() => {});
        window.setTimeout(() => maybePromptSignedInUser().catch(() => {}), 850);
      } else if (landingIsVisible()) {
        syncVisitorSubscription().catch(() => {});
        window.setTimeout(() => maybePromptVisitor().catch(() => {}), 1400);
      }
    }, 700);

    if (!stateLocal.bound) {
      stateLocal.bound = true;
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
          if (typeof state !== "undefined" && state?.unlocked) syncExistingSubscription().catch(() => {});
          else syncVisitorSubscription().catch(() => {});
          refreshControl().catch(() => {});
          bindAdminPush();
        }
      });
      window.addEventListener("focus", () => {
        if (typeof state !== "undefined" && state?.unlocked) syncExistingSubscription().catch(() => {});
        else syncVisitorSubscription().catch(() => {});
        bindAdminPush();
      }, { passive: true });
      window.addEventListener("pageshow", () => { startClientPresence().catch(() => {}); }, { passive: true });
      window.addEventListener("pagehide", closeClientPresence, { passive: true });
      window.addEventListener("beforeunload", closeClientPresence, { passive: true });
      navigator.serviceWorker?.addEventListener?.("message", event => {
        const msg = event.data || {};
        if (msg.type !== "TRIPLEM_PUSH_RECEIVED") return;
        const type = msg.payload?.data?.type || "";
        if (typeof refreshAdminCommsBadges === "function") refreshAdminCommsBadges().catch(() => {});
        if (type === "live_chat_agent_request") {
          if (typeof reconcileLiveChatOffersFromRealtime === "function") reconcileLiveChatOffersFromRealtime(msg.payload?.data?.inquiry_id || null).catch(() => {});
          return;
        }
        if (type === "private_message") {
          if (typeof noteMessagingLocalMutation === "function") noteMessagingLocalMutation();
          if (typeof getActiveTabKey === "function" && getActiveTabKey() === "messages" && typeof renderMessagesPanel === "function") {
            renderMessagesPanel({ silent: true }).catch(() => {});
          }
        }
        if (type === "admin_broadcast" && typeof loadAdminNotificationsDropdown === "function" && typeof isAdminCommsDropdownOpen === "function" && isAdminCommsDropdownOpen("admin-notify")) {
          loadAdminNotificationsDropdown().catch(() => {});
        }
      });
    }
  }

  window.TriplemPush = {
    supported,
    enable,
    disable,
    enableVisitorNotifications,
    syncVisitorSubscription,
    syncExistingSubscription,
    refreshControl,
    startClientPresence,
    requestLiveChatAgentPush,
    requestMessagePush,
    openAdminPushModal,
    maybePromptSignedInUser,
    promptAfterLogin,
    maybePromptVisitor,
    refreshUi: bind
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, { once: true });
  else bind();
})();
