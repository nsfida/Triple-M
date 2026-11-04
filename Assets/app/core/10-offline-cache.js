/* Triplem VIP offline read cache + offline session resume.
 *
 * Purpose: after a reload or browser restart without internet, a signed-in
 * (Remember Me) user can reopen the workspace, see the data last loaded on this
 * device, and keep recording entries into the durable offline queue.
 *
 * Security:
 *  - Cached responses and the profile snapshot are encrypted with AES-GCM using
 *    the same non-extractable browser key that protects the Remember Me session.
 *    Signing out deletes that key, so the cache becomes unreadable and is wiped.
 *  - Only read requests are cached. Security/credential RPCs are never cached.
 *  - Single-record existence probes (id=eq / select=id) are never answered from
 *    cache, so sync and duplicate checks always see the live server.
 *  - Offline resume is refused when Smart PIN or a forced password change is
 *    required, because those checks can only be verified by the server.
 */
(function initTriplemOfflineCache(global){
  "use strict";

  const DB_NAME = "triplem-offline-read-cache-v1";
  const STORE = "responses";
  const PROFILE_KEY = "triplem-offline-profile-v1";
  const MAX_ENTRIES = 400;
  const MAX_ENTRY_BYTES = 3 * 1024 * 1024;
  const PROFILE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
  const lastWrittenHash = new Map();
  let dbPromise = null;
  let writesSincePrune = 0;

  const READ_RPC = /^app_(?:[a-z0-9_]*_)?(?:get|list|fetch|load|search|count|lookup|find|read)(?:_|$)|_(?:summary|page|pages|state|snapshot|details?|history|report|overview|positions|timeline|dashboard|stats|balances|catalog|activity|records|rows|items|threads|notifications|options|directory|ledger|statement|statements)$/;
  const MUTATING_RPC = /(?:^|_)(?:create|save|upsert|insert|update|delete|remove|set|mark|ack|acknowledge|post|apply|restore|archive|claim|consume|register|unregister|login|logout|validate|signup|send|transfer|approve|reject|request|dispatch|toggle|enable|disable|reset|change|record|add|pay|sell|cancel|void|ingest|log|touch|grant|revoke|start|end|close|open|assign|accept|decline|verify|unlock|lock|import|migrate|purge|flush|submit|reply|reorder|receive|refund|deduct|settle)(?:_|$)/;
  const SENSITIVE_RPC = /security|password|smart_pin|pin_|two_factor|totp|passkey|webauthn|recovery|secret|credential|api_key|session|admin_backup|vault|gemini|key_/;

  function fnv1a(text){
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `${text.length.toString(36)}-${hash.toString(36)}`;
  }

  function sessionAllowsCache(){
    try {
      return !!(state.unlocked && state.sessionToken && state.sessionRememberMe && !(typeof isGuestMode === "function" && isGuestMode()));
    } catch (_) { return false; }
  }

  function ownerScope(){
    try { return String((typeof currentOwnerId === "function" && currentOwnerId()) || state.sessionUser?.id || ""); }
    catch (_) { return ""; }
  }

  function rpcName(path){
    const match = /^rpc\/([a-z0-9_]+)/i.exec(String(path || ""));
    return match ? match[1].toLowerCase() : "";
  }

  function isCacheableRequest(path, options = {}){
    if (!options || options.offlineCache === false) return false;
    if (!sessionAllowsCache()) return false;
    const method = String(options.method || "GET").toUpperCase();
    const p = String(path || "");
    if (method === "GET") {
      if (p.startsWith("rpc/")) return false;
      if (/[?&]id=eq\./i.test(p)) return false;
      if (/[?&]select=id(?:&|$)/i.test(p)) return false;
      return true;
    }
    if (method === "POST" && p.startsWith("rpc/")) {
      const name = rpcName(p);
      if (!name || SENSITIVE_RPC.test(name)) return false;
      // A read-named RPC that also carries a write verb (e.g. get_or_create) is never cached.
      return isReadRpc(name);
    }
    return false;
  }

  /** Pure name check (independent of the session): true for read-only RPC names. */
  function isReadRpc(name){
    const n = String(name || "").toLowerCase();
    if (!n || !READ_RPC.test(n)) return false;
    const withoutReadVerb = n.replace(/^app_/, "").replace(/(?:^|_)(?:get|list|fetch|load|search|count|lookup|find|read)(?=_|$)/g, "");
    return !MUTATING_RPC.test(withoutReadVerb);
  }

  function cacheKey(path, options){
    const method = String(options?.method || "GET").toUpperCase();
    const body = typeof options?.body === "string" ? options.body : "";
    return `${ownerScope()}|${method}|${path}|${fnv1a(body)}`;
  }

  function openDb(){
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!global.indexedDB) { reject(new Error("IndexedDB unavailable")); return; }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE);
          store.createIndex("savedAt", "savedAt");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Offline cache unavailable"));
    }).catch(error => { dbPromise = null; throw error; });
    return dbPromise;
  }

  async function storeOp(mode, fn){
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let request;
      try { request = fn(store); } catch (error) { reject(error); return; }
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => reject(tx.error || new Error("Offline cache transaction failed"));
      tx.onabort = () => reject(tx.error || new Error("Offline cache transaction aborted"));
    });
  }

  async function encryptionKey(){
    if (typeof getCredentialEncryptionKey !== "function") return null;
    try { return await getCredentialEncryptionKey({ create: false }); } catch (_) { return null; }
  }

  async function encryptText(text){
    const key = await encryptionKey();
    if (!key) return null;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text));
    return { iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(data)) };
  }

  async function decryptText(envelope){
    const key = await encryptionKey();
    if (!key || !envelope?.iv || !envelope?.data) return null;
    try {
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(envelope.iv) }, key, base64ToBytes(envelope.data));
      return new TextDecoder().decode(plain);
    } catch (_) {
      return null;
    }
  }

  async function pruneIfNeeded(){
    writesSincePrune += 1;
    if (writesSincePrune < 25) return;
    writesSincePrune = 0;
    try {
      const db = await openDb();
      await new Promise(resolve => {
        const tx = db.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);
        const countReq = store.count();
        countReq.onsuccess = () => {
          let excess = Number(countReq.result || 0) - MAX_ENTRIES;
          if (excess <= 0) return;
          const cursorReq = store.index("savedAt").openCursor();
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (!cursor || excess <= 0) return;
            cursor.delete();
            excess -= 1;
            cursor.continue();
          };
        };
        tx.oncomplete = resolve;
        tx.onerror = resolve;
        tx.onabort = resolve;
      });
    } catch (_) {}
  }

  /** Save a successful read response (skips identical repeats to avoid needless writes). */
  async function remember(path, options, data){
    try {
      if (!isCacheableRequest(path, options)) return;
      const key = cacheKey(path, options);
      const text = JSON.stringify(data === undefined ? null : data);
      if (text.length > MAX_ENTRY_BYTES) return;
      const hash = fnv1a(text);
      if (lastWrittenHash.get(key) === hash) return;
      const envelope = await encryptText(text);
      if (!envelope) return;
      await storeOp("readwrite", store => store.put({ ...envelope, savedAt: Date.now() }, key));
      lastWrittenHash.set(key, hash);
      pruneIfNeeded();
    } catch (_) {}
  }

  /** Return { hit: true, data, savedAt } for a cached read, or null. */
  async function recall(path, options){
    try {
      if (!isCacheableRequest(path, options)) return null;
      const record = await storeOp("readonly", store => store.get(cacheKey(path, options)));
      if (!record) return null;
      const text = await decryptText(record);
      if (text == null) return null;
      noteServedFromCache(record.savedAt);
      return { hit: true, data: JSON.parse(text), savedAt: record.savedAt };
    } catch (_) {
      return null;
    }
  }

  async function clearAll(){
    lastWrittenHash.clear();
    try { localStorage.removeItem(PROFILE_KEY); } catch (_) {}
    try { await storeOp("readwrite", store => store.clear()); } catch (_) {}
  }

  // ── Profile snapshot for offline resume ──────────────────────────────────

  async function saveProfile(user){
    try {
      if (!user?.id || !state.sessionRememberMe) return;
      const envelope = await encryptText(JSON.stringify({ username: String(user.username || state.currentUsername || ""), user, savedAt: Date.now() }));
      if (!envelope) return;
      localStorage.setItem(PROFILE_KEY, JSON.stringify(envelope));
    } catch (_) {}
  }

  /**
   * Returns the cached profile when offline resume is allowed for this user,
   * or { refused: "reason" } when it is not.
   */
  async function resumeProfile(username){
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (!raw) return { refused: "No workspace has been saved on this device for offline use yet." };
      const text = await decryptText(JSON.parse(raw));
      if (!text) return { refused: "The offline workspace on this device could not be opened." };
      const snapshot = JSON.parse(text);
      const user = snapshot?.user;
      if (!user?.id || String(snapshot.username || "").toLowerCase() !== String(username || "").toLowerCase()) {
        return { refused: "The offline workspace on this device belongs to a different account." };
      }
      if (Date.now() - Number(snapshot.savedAt || 0) > PROFILE_MAX_AGE_MS) {
        return { refused: "The offline workspace on this device is too old. Connect to the internet to sign in." };
      }
      const pinHash = String(user.smart_pin_hash || "").trim();
      if (user.smart_pin_enabled || pinHash) {
        return { refused: "Smart PIN must be verified online. Your saved entries are safe on this device and will sync after you reconnect." };
      }
      if (user.must_change_password) return { refused: "A password change is required. Connect to the internet to continue." };
      return { user, savedAt: snapshot.savedAt };
    } catch (_) {
      return { refused: "The offline workspace on this device could not be opened." };
    }
  }

  // ── Offline status banner ────────────────────────────────────────────────

  let servedFromCacheAt = 0;
  function noteServedFromCache(savedAt){
    servedFromCacheAt = Math.max(servedFromCacheAt, Number(savedAt || 0)) || Date.now();
    refreshBanner();
  }

  function bannerText(){
    const pending = Number(state.offlineSync?.pendingCount || 0);
    const pendingText = pending ? ` ${pending} change${pending === 1 ? " is" : "s are"} saved on this device and will sync automatically.` : " New entries are saved on this device and sync automatically.";
    if (!navigator.onLine || state.offlineSync?.offlineSession) {
      let when = "";
      if (servedFromCacheAt) {
        try { when = ` (last updated ${new Date(servedFromCacheAt).toLocaleString()})`; } catch (_) {}
      }
      return `You are offline. Showing data saved on this device${when}.${pendingText}`;
    }
    return "";
  }

  function refreshBanner(){
    try {
      let banner = document.getElementById("offlineModeBanner");
      const text = state.unlocked ? bannerText() : "";
      if (!text) {
        if (banner) banner.classList.add("hide");
        document.documentElement.classList.remove("triplem-offline-mode");
        return;
      }
      if (!banner) {
        banner = document.createElement("div");
        banner.id = "offlineModeBanner";
        banner.className = "offline-mode-banner hide";
        banner.setAttribute("role", "status");
        banner.setAttribute("aria-live", "polite");
        banner.innerHTML = `<i class="fa-solid fa-wifi" aria-hidden="true"></i><span data-offline-banner-text></span>`;
        document.body.appendChild(banner);
      }
      banner.querySelector("[data-offline-banner-text]").textContent = text;
      banner.classList.remove("hide");
      document.documentElement.classList.add("triplem-offline-mode");
    } catch (_) {}
  }

  // ── Reconnect after an offline resume ────────────────────────────────────

  let reconnecting = null;
  async function reconnectOfflineSession(){
    if (!state.offlineSync?.offlineSession || !navigator.onLine || reconnecting) return reconnecting;
    reconnecting = (async () => {
      try {
        const validated = await supabaseRpc("app_validate_session", {}, { offlineCache: false });
        const user = validated?.user || validated;
        if (!user?.id) throw new Error("Session expired or invalid");
        state.offlineSync.offlineSession = false;
        servedFromCacheAt = 0;
        try { applyUserProfileToConfig(user); } catch (_) {}
        try { if (typeof updateAccessBanner === "function") updateAccessBanner(); } catch (_) {}
        try { applyPermissionGates(); } catch (_) {}
        saveProfile(user);
        refreshBanner();
        try {
          const tab = typeof getActiveTabKey === "function" ? getActiveTabKey() : "";
          if (tab && typeof ensureTabDataLoaded === "function") await ensureTabDataLoaded(tab, { force: true });
        } catch (_) {}
        if (typeof invalidateDashboardSummary === "function") invalidateDashboardSummary({ refreshIfVisible: true });
        if (typeof scheduleOfflineSync === "function") scheduleOfflineSync(500);
        if (typeof showEntryConfirmation === "function") showEntryConfirmation("Back online. Your workspace is up to date.", "success");
      } catch (error) {
        const connectivity = typeof isConnectivityFailure === "function" && isConnectivityFailure(error);
        if (connectivity) return;
        // The server rejected the saved session. Saved entries stay in the
        // queue (it is not tied to the session) and sync after the next sign-in.
        const pending = Number(state.offlineSync?.pendingCount || 0);
        state.offlineSync.offlineSession = false;
        try { doLogout(); } catch (_) {}
        try {
          if (els.lockError) {
            els.lockError.textContent = pending
              ? `Your session has expired. Sign in again to sync ${pending} change${pending === 1 ? "" : "s"} saved on this device.`
              : "Your session has expired. Please sign in again.";
            els.lockError.classList.add("show");
          }
        } catch (_) {}
      } finally {
        reconnecting = null;
      }
    })();
    return reconnecting;
  }

  // A device can report "online" while the server is unreachable (captive
  // portal, flaky Wi-Fi). While the workspace was opened offline, retry the
  // session check every 30 s, only for a visible tab.
  global.setInterval(() => {
    try {
      if (state.offlineSync?.offlineSession && navigator.onLine && !document.hidden) reconnectOfflineSession();
    } catch (_) {}
  }, 30000);

  global.addEventListener("online", () => {
    refreshBanner();
    reconnectOfflineSession();
  });
  global.addEventListener("offline", refreshBanner);

  global.TriplemOfflineCache = Object.freeze({
    isCacheableRequest,
    isReadRpc,
    remember,
    recall,
    clearAll,
    saveProfile,
    resumeProfile,
    refreshBanner,
    reconnectOfflineSession
  });
})(typeof window !== "undefined" ? window : globalThis);
