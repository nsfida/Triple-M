/* Triplem VIP — Web Push DISABLED (2026-10-10 low-log release).
 *
 * Push notifications were removed to stop Supabase log ingestion / log-query
 * consumption. This module keeps the public `window.TriplemPush` surface so
 * the rest of the app (login, messaging, recovery, live chat) keeps working,
 * but EVERY method is a local no-op:
 *   - no request to /functions/v1/push-notifications
 *   - no app_*push* RPC (subscribe / presence / config / outbox flush)
 *   - no timers, no focus/visibility listeners, no service-worker messaging
 *
 * The only thing it does is hide the push UI controls and, once per browser,
 * drop any push subscription left over from earlier versions. That cleanup
 * talks to the browser's own push service only — never to Supabase.
 */
(() => {
  "use strict";

  const CLEANUP_FLAG = "triplem_push_disabled_cleanup_v1";
  const HIDE_SELECTORS = [
    "#pushQuickToggleBtn",
    ".admin-comms-device-footer",
    "#adminPushNotificationsBtn",
    ".landing-visitor-alert-control",
    ".landing-mobile-notification-row"
  ];

  const resolved = (value = false) => Promise.resolve(value);
  const disabledError = () => Promise.reject(new Error("Push notifications are turned off in this version of Triplem VIP."));

  function hideControls() {
    try {
      if (document.getElementById("triplemPushDisabledStyle")) return;
      const style = document.createElement("style");
      style.id = "triplemPushDisabledStyle";
      style.textContent = `${HIDE_SELECTORS.join(",")}{display:none!important}`;
      (document.head || document.documentElement).appendChild(style);
    } catch (_) {}
  }

  function dropLegacySubscriptionOnce() {
    try {
      if (localStorage.getItem(CLEANUP_FLAG) === "1") return;
      localStorage.setItem(CLEANUP_FLAG, "1");
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
      navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(registration => {
          registration.pushManager?.getSubscription?.()
            .then(subscription => subscription?.unsubscribe?.())
            .catch(() => {});
        });
      }).catch(() => {});
    } catch (_) {}
  }

  window.TriplemPush = Object.freeze({
    disabled: true,
    supported: () => false,
    enable: disabledError,
    disable: () => resolved(true),
    enableVisitorNotifications: disabledError,
    disableVisitorNotifications: () => resolved(true),
    toggleVisitorNotifications: () => resolved(false),
    syncVisitorSubscription: () => resolved(false),
    syncExistingSubscription: () => resolved(false),
    refreshControl: () => resolved(false),
    refreshVisitorControl: () => resolved(false),
    startClientPresence: () => resolved(false),
    requestLiveChatAgentPush: () => resolved(false),
    requestMessagePush: () => resolved(false),
    requestSecurityRecoveryPush: () => resolved(false),
    flushAdminInboxPushQueue: () => resolved(false),
    scheduleAdminInboxFlush: () => false,
    openAdminPushModal: () => resolved(false),
    maybePromptSignedInUser: () => resolved(false),
    promptAfterLogin: () => resolved(false),
    maybePromptVisitor: () => resolved(false),
    refreshUi: () => {}
  });

  hideControls();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { hideControls(); dropLegacySubscriptionOnce(); }, { once: true });
  } else {
    dropLegacySubscriptionOnce();
  }
})();
