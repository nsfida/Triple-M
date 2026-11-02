/* Triplem VIP delivery hardening — non-blocking service-worker registration. */
(() => {
  "use strict";

  if (!("serviceWorker" in navigator)) return;
  if (!(location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) return;

  const register = async () => {
    try {
      const registration = await navigator.serviceWorker.register("/service-worker.js", {
        scope: "/",
        updateViaCache: "none"
      });
      // Do not block startup on update discovery. Browsers already perform their
      // own checks; this simply gives long-lived tabs a lightweight refresh path.
      if (registration?.update) {
        const lastKey = "triplem-sw-update-check-v1";
        const now = Date.now();
        let last = 0;
        try { last = Number(localStorage.getItem(lastKey) || 0); } catch (_) {}
        if (!Number.isFinite(last) || now - last > 6 * 60 * 60 * 1000) {
          try { localStorage.setItem(lastKey, String(now)); } catch (_) {}
          registration.update().catch(() => {});
        }
      }
    } catch (_) {
      // Static delivery optimization is intentionally non-critical. Authentication
      // and the finance workspace must remain usable if SW registration is blocked.
    }
  };

  const schedule = () => {
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(() => { register(); }, { timeout: 1800 });
    } else {
      setTimeout(register, 250);
    }
  };

  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true, passive: true });
})();
