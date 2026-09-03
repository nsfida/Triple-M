/* Triplem VIP Web Push Service Worker — v123 */
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

    // Foreground delivery is intentional in v123. Open Triplem VIP windows are
    // notified so their bell/messages can refresh immediately, while the OS
    // notification is still displayed. Users therefore receive the same push
    // whether the browser is open, minimized or fully closed.
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
