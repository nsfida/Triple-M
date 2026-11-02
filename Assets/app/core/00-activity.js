/* Local-only activity state shared by production and Demo app modules.
 * It deliberately performs no network/database work. Background modules use
 * this signal to pause their own fallback requests after inactivity.
 */
(() => {
  "use strict";
  if (window.TriplemActivity) return;

  const IDLE_AFTER_MS = 2 * 60 * 1000;
  let lastActivityAt = Date.now();
  let lastPointerMoveAt = 0;
  let idleTimer = null;
  let idleSignalled = false;

  function signalIdle(source = "timeout") {
    if (idleSignalled) return;
    idleSignalled = true;
    try {
      window.dispatchEvent(new CustomEvent("triplem:idle", {
        detail: { at: Date.now(), idleForMs: Math.max(0, Date.now() - lastActivityAt), source }
      }));
    } catch (_) {}
  }

  function armIdleTimer() {
    if (idleTimer) window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      idleTimer = null;
      if (document.hidden) signalIdle("hidden");
      else if (Date.now() - lastActivityAt >= IDLE_AFTER_MS) signalIdle("timeout");
      else armIdleTimer();
    }, IDLE_AFTER_MS + 50);
  }

  function mark(source = "interaction") {
    const now = Date.now();
    const wasIdle = document.hidden || idleSignalled || (now - lastActivityAt) > IDLE_AFTER_MS;
    lastActivityAt = now;
    idleSignalled = false;
    armIdleTimer();
    try {
      window.dispatchEvent(new CustomEvent("triplem:activity", {
        detail: { at: now, wasIdle, source: String(source || "interaction") }
      }));
    } catch (_) {}
  }

  const passiveCapture = { passive: true, capture: true };
  ["pointerdown", "touchstart", "keydown", "click", "input", "wheel", "scroll"].forEach(type => {
    document.addEventListener(type, () => mark(type), passiveCapture);
  });
  document.addEventListener("pointermove", () => {
    const now = Date.now();
    if (now - lastPointerMoveAt < 15000) return;
    lastPointerMoveAt = now;
    mark("pointermove");
  }, { passive: true, capture: true });
  ["focus", "pageshow", "online"].forEach(type => {
    window.addEventListener(type, () => mark(type), { passive: true });
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) signalIdle("hidden");
    else mark("visible");
  }, { passive: true });

  armIdleTimer();
  if (document.hidden) signalIdle("hidden");

  window.TriplemActivity = Object.freeze({
    idleAfterMs: IDLE_AFTER_MS,
    mark,
    isActive: () => !document.hidden && (Date.now() - lastActivityAt) <= IDLE_AFTER_MS,
    getLastActivityAt: () => lastActivityAt,
    getIdleForMs: () => Math.max(0, Date.now() - lastActivityAt)
  });
})();
