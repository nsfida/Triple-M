/* Site analytics tracker — anonymous visits/pageviews/events → app_site_analytics_ingest */
(function initTriplemSiteTracker(){
  if (window.__triplemSiteTracker) return;
  window.__triplemSiteTracker = true;

  const VISITOR_KEY = "triplem-analytics-vid-v1";
  const SESSION_KEY = "triplem-analytics-sid-v1";
  const SESSION_AT_KEY = "triplem-analytics-sid-at-v1";
  const SESSION_IDLE_MS = 30 * 60 * 1000;
  const FLUSH_MS = 8000;
  const HEARTBEAT_MS = 25000;

  const queue = {
    pageviewPending: false,
    events: [],
    lastPath: "",
    flushing: false,
    startedAt: Date.now()
  };

  function uuid(){
    if (crypto?.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === "x" ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function storageGet(key){
    try { return localStorage.getItem(key) || ""; } catch (_) { return ""; }
  }
  function storageSet(key, value){
    try { localStorage.setItem(key, value); } catch (_) {}
  }

  function visitorKey(){
    let id = storageGet(VISITOR_KEY);
    if (!id || id.length < 8) {
      id = uuid();
      storageSet(VISITOR_KEY, id);
    }
    return id;
  }

  function sessionKey(){
    const now = Date.now();
    let id = storageGet(SESSION_KEY);
    const at = Number(storageGet(SESSION_AT_KEY) || 0);
    if (!id || !at || (now - at) > SESSION_IDLE_MS) {
      id = uuid();
      storageSet(SESSION_KEY, id);
      queue.startedAt = now;
    }
    storageSet(SESSION_AT_KEY, String(now));
    return id;
  }

  function touchSession(){
    storageSet(SESSION_AT_KEY, String(Date.now()));
  }

  function supabaseConfig(){
    if (typeof getEmbeddedSupabaseConfig === "function") {
      try { return getEmbeddedSupabaseConfig(); } catch (_) {}
    }
    const host = ["iymzt", "qbscfo", "delovd", "rnn"].join("");
    const keyParts = [
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
      "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5bXp0cWJzY2ZvZGVsb3Zkcm5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MjcxNDAsImV4cCI6MjA5NDMwMzE0MH0",
      "eASEqmcC9-eDDgjYFsa3Ne8idK-6KmfXHbxvhWVwZSA"
    ];
    return {
      supabaseUrl: `https://${host}.supabase.co`,
      supabaseKey: keyParts.join(".")
    };
  }

  function detectDevice(){
    const ua = navigator.userAgent || "";
    const w = Math.min(window.screen?.width || window.innerWidth || 0, window.innerWidth || 0);
    if (/Mobi|Android.*Mobile|iPhone|iPod/i.test(ua) || w < 768) return "mobile";
    if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua) || (w >= 768 && w < 1024)) return "tablet";
    return "desktop";
  }

  function detectBrowser(){
    const ua = navigator.userAgent || "";
    if (/Edg\//i.test(ua)) return "Edge";
    if (/OPR\/|Opera/i.test(ua)) return "Opera";
    if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return "Chrome";
    if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return "Safari";
    if (/Firefox\//i.test(ua)) return "Firefox";
    if (/MSIE|Trident/i.test(ua)) return "IE";
    return "Other";
  }

  function detectOs(){
    const ua = navigator.userAgent || "";
    if (/Windows/i.test(ua)) return "Windows";
    if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
    if (/Android/i.test(ua)) return "Android";
    if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
    if (/Linux/i.test(ua)) return "Linux";
    return "Other";
  }

  function queryParam(name){
    try {
      return new URLSearchParams(location.search).get(name) || "";
    } catch (_) {
      return "";
    }
  }

  function currentPath(){
    let path = String(location.pathname || "/");
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    if (/\/index\.html$/i.test(path)) path = path.replace(/\/index\.html$/i, "/") || "/";
    if (path === "" || path === "/index.html") path = "/";

    try {
      if (typeof getActiveTabKey === "function"
        && typeof state !== "undefined"
        && state?.unlocked
        && (path === "/" || path.endsWith("Triple-M") || /\/Triple-M\/?$/i.test(path))) {
        const tab = String(getActiveTabKey() || "dashboard").slice(0, 40);
        return `/app/${tab}`;
      }
    } catch (_) {}

    if (location.hash && location.hash.length > 1) {
      const hash = location.hash.replace(/^#/, "").slice(0, 60);
      if (hash && !path.startsWith("/app/")) return `${path}#${hash}`;
    }
    return path.slice(0, 240) || "/";
  }

  function durationSeconds(){
    return Math.max(0, Math.min(86400, Math.round((Date.now() - queue.startedAt) / 1000)));
  }

  function labelForElement(el){
    if (!el) return "";
    const explicit = el.getAttribute("data-analytics")
      || el.getAttribute("data-analytics-label")
      || el.getAttribute("aria-label")
      || el.getAttribute("title");
    if (explicit) return String(explicit).trim().slice(0, 120);
    const text = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
    if (text) return text.slice(0, 80);
    if (el.id) return `#${el.id}`.slice(0, 80);
    return (el.tagName || "element").toLowerCase();
  }

  function trackPageview(force = false){
    const path = currentPath();
    if (!force && path === queue.lastPath) return;
    queue.lastPath = path;
    queue.pageviewPending = true;
    touchSession();
    scheduleFlush(400);
  }

  function trackEvent(name, label, meta = {}){
    const n = String(name || "click").trim().slice(0, 64);
    if (!n) return;
    queue.events.push({
      name: n,
      label: String(label || "").trim().slice(0, 160),
      path: currentPath(),
      meta: meta && typeof meta === "object" ? meta : {}
    });
    if (queue.events.length > 40) queue.events.splice(0, queue.events.length - 40);
    touchSession();
    scheduleFlush(1200);
  }

  let flushTimer = null;
  function scheduleFlush(delay = FLUSH_MS){
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush(false);
    }, Math.max(200, delay));
  }

  async function flush(isHeartbeat){
    if (queue.flushing) return;
    const hasWork = queue.pageviewPending || queue.events.length || isHeartbeat;
    if (!hasWork) return;
    queue.flushing = true;

    const events = queue.events.splice(0, 25);
    const pageview = queue.pageviewPending;
    queue.pageviewPending = false;

    const cfg = supabaseConfig();
    if (!cfg?.supabaseUrl || !cfg?.supabaseKey) {
      queue.flushing = false;
      if (pageview) queue.pageviewPending = true;
      if (events.length) queue.events.unshift(...events);
      return;
    }

    const payload = {
      visitor_key: visitorKey(),
      session_key: sessionKey(),
      path: currentPath(),
      title: String(document.title || "").slice(0, 160),
      referrer: String(document.referrer || "").slice(0, 500),
      device_type: detectDevice(),
      browser: detectBrowser(),
      os: detectOs(),
      utm_source: queryParam("utm_source"),
      utm_medium: queryParam("utm_medium"),
      utm_campaign: queryParam("utm_campaign"),
      duration_seconds: durationSeconds(),
      pageview: !!pageview,
      heartbeat: !!isHeartbeat && !pageview && !events.length,
      events
    };

    const headers = {
      apikey: cfg.supabaseKey,
      Authorization: `Bearer ${cfg.supabaseKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    };
    try {
      if (typeof state !== "undefined" && state?.sessionToken) {
        headers["X-Session-Token"] = state.sessionToken;
      }
    } catch (_) {}

    try {
      const res = await fetch(`${cfg.supabaseUrl}/rest/v1/rpc/app_site_analytics_ingest`, {
        method: "POST",
        headers,
        body: JSON.stringify({ p_payload: payload }),
        keepalive: !!isHeartbeat
      });
      if (!res.ok) {
        if (pageview) queue.pageviewPending = true;
        if (events.length) queue.events.unshift(...events);
      }
    } catch (_) {
      if (pageview) queue.pageviewPending = true;
      if (events.length) queue.events.unshift(...events);
    } finally {
      queue.flushing = false;
    }
  }

  function bindClicks(){
    document.addEventListener("click", (ev) => {
      const el = ev.target?.closest?.(
        "button, a, [data-analytics], [data-landing-trial], [data-landing-signin], .btn, .menu-item, .nav-item, .tab-btn"
      );
      if (!el) return;
      if (el.closest?.("#adminAnalyticsModal")) return;
      const tag = (el.tagName || "").toLowerCase();
      let name = "click";
      if (el.matches?.("[data-landing-trial]")) name = "trial_cta";
      else if (el.matches?.("[data-landing-signin]")) name = "signin_cta";
      else if (tag === "a") name = "link_click";
      else if (tag === "button" || el.classList?.contains("btn")) name = "button_click";
      trackEvent(name, labelForElement(el), { tag });
    }, { capture: true, passive: true });
  }

  function bindLifecycle(){
    trackPageview(true);

    window.addEventListener("hashchange", () => trackPageview(false));
    window.addEventListener("popstate", () => trackPageview(false));

    // In-app tab switches (admin SPA)
    document.addEventListener("click", (ev) => {
      if (ev.target?.closest?.("[data-tab], .nav-link, .bottom-nav button, [data-nav]")) {
        setTimeout(() => trackPageview(false), 80);
      }
    }, { passive: true });

    setInterval(() => {
      touchSession();
      flush(true);
    }, HEARTBEAT_MS);

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) flush(true);
      else {
        touchSession();
        trackPageview(false);
      }
    });

    window.addEventListener("pagehide", () => { flush(true); });
  }

  window.triplemTrackEvent = trackEvent;
  window.triplemTrackPageview = () => trackPageview(true);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      bindClicks();
      bindLifecycle();
    });
  } else {
    bindClicks();
    bindLifecycle();
  }
})();
