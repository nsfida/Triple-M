/* Triplem VIP Web Push Service Worker — v123; static asset cache v191-windows-push1.
 *
 * Offline support (2026-11): the HTML app shell and the pinned CDN libraries are
 * kept so the workspace can be reopened without internet. Supabase API, auth and
 * Edge Function traffic is never intercepted or cached here; offline data lives
 * in the page's encrypted IndexedDB cache and durable write queue instead.
 */
"use strict";

const STATIC_CACHE_PREFIX = "triplem-static-";
const STATIC_CACHE = `${STATIC_CACHE_PREFIX}v191-windows-push1`;
const CACHEABLE_DESTINATIONS = new Set(["script", "style", "image", "font"]);
// Version-pinned third-party libraries and fonts referenced by the pages.
const PINNED_CDN_HOSTS = new Set(["cdn.jsdelivr.net", "cdnjs.cloudflare.com", "fonts.googleapis.com", "fonts.gstatic.com"]);
const NAVIGATION_TIMEOUT_MS = 6000;
const OFFLINE_FALLBACK_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Triplem VIP — Offline</title><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0f172a;color:#e2e8f0;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;text-align:center}main{max-width:420px}button{margin-top:16px;padding:10px 18px;border-radius:10px;border:0;background:#2563eb;color:#fff;font-weight:600}</style></head><body><main><h1>You are offline</h1><p>This page has not been saved on this device yet. Open Triplem VIP once while online and it will be available offline afterwards. Entries already saved on this device are safe.</p><button onclick="location.reload()">Try again</button></main></body></html>`;

/**
 * Resolve a notification destination without permitting external origins or
 * non-HTTP(S) schemes to be opened from a push notification.
 */
function resolveSafeNotificationUrl(rawUrl, origin = self.location.origin) {
  try {
    const fallback = new URL("/", origin);
    const candidate = new URL(typeof rawUrl === "string" ? rawUrl : "/", origin);
    if (candidate.origin !== fallback.origin) return fallback.href;
    if (candidate.protocol !== "https:" && candidate.protocol !== "http:") return fallback.href;
    return candidate.href;
  } catch (_) {
    try { return new URL("/", origin).href; }
    catch (_) { return "/"; }
  }
}

/** Same-origin script/stylesheet URLs referenced by the app shell (comments ignored). */
function shellAssetUrls(html, baseUrl) {
  const active = String(html || "").replace(/<!--[\s\S]*?-->/g, "");
  const urls = new Set();
  const add = raw => {
    try {
      const url = new URL(String(raw || "").replace(/&amp;/g, "&"), baseUrl);
      if (url.origin === self.location.origin && url.pathname.includes("/Assets/")) urls.add(url.href);
      else if (url.protocol === "https:" && PINNED_CDN_HOSTS.has(url.hostname)) urls.add(url.href);
    } catch (_) {}
  };
  for (const match of active.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gi)) add(match[1]);
  for (const match of active.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"/gi)) add(match[1]);
  return [...urls];
}

/** Best effort: keep the app shell and its scripts so the next reload works offline. */
async function precacheAppShell() {
  try {
    const cache = await caches.open(STATIC_CACHE);
    const shellUrl = new URL("./", self.registration?.scope || self.location.origin).href;
    const response = await fetch(shellUrl, { cache: "no-cache", credentials: "same-origin" });
    if (!response.ok || response.redirected) return;
    await cache.put(navigationCacheKey(shellUrl), response.clone());
    const html = await response.text();
    await Promise.all(shellAssetUrls(html, shellUrl).map(async href => {
      try {
        if (await cache.match(href)) return;
        const url = new URL(href);
        const request = url.origin === self.location.origin ? new Request(href) : new Request(href, { mode: "no-cors" });
        const assetResponse = await fetch(request);
        if (canStoreResponse(assetResponse) || isStorableOpaqueCdnResponse(assetResponse, url)) await cache.put(href, assetResponse);
      } catch (_) {}
    }));
  } catch (_) {}
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    await precacheAppShell();
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    try {
      const names = await caches.keys();
      await Promise.all(names
        .filter(name => name.startsWith(STATIC_CACHE_PREFIX) && name !== STATIC_CACHE)
        .map(name => caches.delete(name)));
    } catch (_) {}
    await self.clients.claim();
  })());
});

function isCacheableStaticRequest(request, url) {
  if (request.method !== "GET") return false;
  if (url.origin !== self.location.origin) return false;
  if (!url.pathname.includes("/Assets/")) return false;
  if (request.headers.has("range")) return false;
  if (request.cache === "only-if-cached" && request.mode !== "same-origin") return false;
  return CACHEABLE_DESTINATIONS.has(request.destination);
}

function canStoreResponse(response) {
  return !!response && response.ok && (response.type === "basic" || response.type === "cors");
}

async function cacheResponse(cache, request, response) {
  if (!canStoreResponse(response)) return response;
  try { await cache.put(request, response.clone()); } catch (_) {}
  return response;
}

async function versionedCacheFirst(event, request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    const refresh = fetch(request)
      .then(response => cacheResponse(cache, request, response))
      .catch(() => null);
    event.waitUntil(refresh);
    return cached;
  }
  const response = await fetch(request);
  return cacheResponse(cache, request, response);
}

async function networkFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const response = await fetch(request);
    return cacheResponse(cache, request, response);
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

function navigationCacheKey(rawUrl) {
  const url = new URL(rawUrl);
  return `${url.origin}${url.pathname}`;
}

function isStorableOpaqueCdnResponse(response, url) {
  return !!response && response.type === "opaque" && PINNED_CDN_HOSTS.has(url.hostname);
}

function isPinnedCdnRequest(request, url) {
  return request.method === "GET" && url.protocol === "https:" && PINNED_CDN_HOSTS.has(url.hostname) && !request.headers.has("range");
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}

/** HTML pages: network first (always fresh when online), cached shell when offline. */
async function navigationNetworkFirst(event, request) {
  const cache = await caches.open(STATIC_CACHE);
  const key = navigationCacheKey(request.url);
  try {
    const response = await withTimeout(fetch(request), NAVIGATION_TIMEOUT_MS);
    if (response.ok && !response.redirected && response.type === "basic") {
      const copy = response.clone();
      event.waitUntil(cache.put(key, copy).catch(() => {}));
    }
    return response;
  } catch (error) {
    const cached = await cache.match(key)
      || await cache.match(navigationCacheKey(new URL("./", self.registration?.scope || self.location.origin).href));
    if (cached) return cached;
    return new Response(OFFLINE_FALLBACK_HTML, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }
}

/** Pinned CDN libraries: network first, cached copy when offline. */
async function cdnNetworkFirst(event, request, url) {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const response = await fetch(request);
    if (canStoreResponse(response) || isStorableOpaqueCdnResponse(response, url)) {
      const copy = response.clone();
      event.waitUntil(cache.put(request, copy).catch(() => {}));
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreVary: true });
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener("fetch", event => {
  const request = event.request;
  let url;
  try { url = new URL(request.url); } catch (_) { return; }
  if (request.method === "GET" && request.mode === "navigate" && url.origin === self.location.origin) {
    event.respondWith(navigationNetworkFirst(event, request));
    return;
  }
  if (isPinnedCdnRequest(request, url)) {
    event.respondWith(cdnNetworkFirst(event, request, url));
    return;
  }
  if (!isCacheableStaticRequest(request, url)) return;

  // Versioned URLs are immutable from the browser's perspective, so serve them
  // immediately and refresh quietly. Unversioned scripts/styles remain
  // network-first to avoid stale application logic after deployment. Images and
  // fonts are safe to serve stale-while-revalidate because their update is visual.
  const versioned = !!url.search;
  const visualAsset = request.destination === "image" || request.destination === "font";
  if (versioned || visualAsset) {
    event.respondWith(versionedCacheFirst(event, request));
  } else {
    event.respondWith(networkFirst(request));
  }
});

self.addEventListener("push", event => {
  event.waitUntil((async () => {
    let payload = {};
    try { payload = event.data ? event.data.json() : {}; }
    catch (_) {
      try { payload = { body: event.data ? event.data.text() : "" }; } catch (_) { payload = {}; }
    }

    // Foreground delivery is intentional. Open Triplem VIP windows are notified
    // so their bell/messages can refresh immediately, while the OS notification
    // is still displayed. Users receive the same push whether the browser is open,
    // minimized or fully closed.
    const windowClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    windowClients.forEach(client => {
      try { client.postMessage({ type: "TRIPLEM_PUSH_RECEIVED", payload }); } catch (_) {}
    });

    const title = String(payload?.title || "Triplem VIP");
    const data = payload?.data && typeof payload.data === "object" ? payload.data : { url: "/" };
    const options = {
      body: String(payload?.body || "You have a new Triplem VIP notification."),
      icon: payload?.icon || "/Assets/logo/logo.png",
      badge: payload?.badge || "/Assets/logo/logo.png",
      tag: payload?.tag || undefined,
      renotify: payload?.renotify === true,
      requireInteraction: payload?.requireInteraction === true,
      data,
      timestamp: Date.now()
    };
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const rawUrl = event.notification?.data?.url;
    const targetUrl = resolveSafeNotificationUrl(rawUrl, self.location.origin);
    const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of allClients) {
      try {
        const current = new URL(client.url);
        if (current.origin === self.location.origin) {
          if ("navigate" in client && client.url !== targetUrl) await client.navigate(targetUrl);
          if ("focus" in client) return client.focus();
        }
      } catch (_) {}
    }
    return self.clients.openWindow(targetUrl);
  })());
});
