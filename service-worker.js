/* Triplem VIP Web Push Service Worker — v120 */
"use strict";

self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", event => {
  event.waitUntil((async () => {
    let payload = {};
    try { payload = event.data ? event.data.json() : {}; }
    catch (_) {
      try { payload = { body: event.data ? event.data.text() : "" }; } catch (_) { payload = {}; }
    }

    const windowClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const suppressWhenOpen = payload && payload.suppressWhenOpen === true;

    if (suppressWhenOpen && windowClients.length > 0) {
      windowClients.forEach(client => {
        try { client.postMessage({ type: "TRIPLEM_PUSH_SUPPRESSED_OPEN", payload }); } catch (_) {}
      });
      return;
    }

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
