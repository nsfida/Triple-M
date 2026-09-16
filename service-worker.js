/* Triplem VIP Web Push Service Worker — v123; static asset cache hardening v170. */
"use strict";

const STATIC_CACHE_PREFIX = "triplem-static-";
const STATIC_CACHE = `${STATIC_CACHE_PREFIX}v170`;
const CACHEABLE_DESTINATIONS = new Set(["script", "style", "image", "font"]);

self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
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

self.addEventListener("fetch", event => {
  const request = event.request;
  let url;
  try { url = new URL(request.url); } catch (_) { return; }
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
    const targetUrl = new URL(String(event.notification?.data?.url || "/"), self.location.origin).href;
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
