/* Shared KMR-S3 registration deadline UI.
 * This controls presentation only. The PostgreSQL submit_registration function
 * and Storage INSERT policies remain the security boundary for public submissions.
 *
 * Behaviour after the cutoff:
 *   - Public visitors see the closed-registration notice in the scrolling announcement strip.
 *   - A verified administrator keeps the original "Register" button and links.
 *   - While an existing admin session is being checked, the UI does not briefly
 *     flash the public-only closed state. The server remains authoritative.
 */
(function () {
  "use strict";

  const registration = window.KMRRegistration;
  if (!registration || !document.body) return;

  // Race postponed (DSO Nowshera notice, 13 Nov 2026). Registration continues
  // until the rescheduled date; the new date will be announced officially.
  const OPEN_COPY = "OFFICIAL NOTICE: KHAWRAI MARATHON RACE SEASON THREE HAS BEEN POSTPONED DUE TO UNAVOIDABLE CIRCUMSTANCES · THE RACE WILL BE RESCHEDULED AT THE SAME VENUE · NEW DATE TO BE ANNOUNCED · ONLINE REGISTRATION REMAINS OPEN";
  const CLOSED_COPY = "OFFICIAL NOTICE: KHAWRAI MARATHON RACE SEASON THREE HAS BEEN POSTPONED DUE TO UNAVOIDABLE CIRCUMSTANCES · THE RACE WILL BE RESCHEDULED AT THE SAME VENUE · NEW DATE TO BE ANNOUNCED · ONLINE REGISTRATION IS CLOSED";

  let isVerifiedAdmin = false;
  // Do not briefly apply public-only restrictions while the saved session is being
  // validated. This is a presentation state only; it never grants database access.
  let authResolved = !window.KMRAuth;
  let navigationRegisterLink = null;
  let navigationOriginal = null;
  let navigationRegisterCta = null;
  let countdownNode = null;
  let noticeOpenTrack = null;
  let noticeClosedTrack = null;
  let noticeAccessible = null;
  let lastMode = "";
  let countdownTimer = null;

  function rootPath() {
    let path = window.location.pathname || "/";
    const routed = path.replace(/\/(?:results\/manage|participants|results|about|register|admin|event-info|notice)(?:\/index\.html)?\/?$/i, "/");
    if (routed !== path) path = routed;
    else path = path.replace(/\/index\.html$/i, "/");
    if (!path.endsWith("/")) path = path.slice(0, path.lastIndexOf("/") + 1);
    return path || "/";
  }

  function normalizeRoute(path) {
    let value = String(path || "/").replace(/\/index\.html$/i, "/").replace(/\.html$/i, "/");
    if (!value.endsWith("/")) value += "/";
    return value;
  }

  function isAdminInterfaceRoute() {
    const path = normalizeRoute(window.location.pathname || "/");
    return /\/admin\/$/i.test(path) || /\/results\/manage\/$/i.test(path);
  }

  const registerPath = normalizeRoute(rootPath() + "register/");

  function isRegistrationLink(anchor) {
    if (!anchor || !anchor.getAttribute || !anchor.getAttribute("href")) return false;
    try {
      const url = new URL(anchor.getAttribute("href"), window.location.href);
      return url.origin === window.location.origin && normalizeRoute(url.pathname) === registerPath;
    } catch (_) {
      return false;
    }
  }

  function ensureNotice() {
    let noticeNode = document.getElementById("registrationNotice");
    if (!noticeNode) {
      noticeNode = document.createElement("div");
      noticeNode.className = "registration-notice";
      noticeNode.id = "registrationNotice";
      noticeNode.setAttribute("role", "status");
      noticeNode.setAttribute("aria-live", "polite");
      noticeNode.innerHTML = `
        <div class="registration-notice-viewport" aria-hidden="true">
          <div class="registration-notice-track" id="registrationAnnouncementOpen" hidden><span>${OPEN_COPY}</span><span>${OPEN_COPY}</span></div>
          <div class="registration-notice-track" id="registrationAnnouncementClosed"><span>${CLOSED_COPY}</span><span>${CLOSED_COPY}</span></div>
        </div>
        <span class="sr-only" id="registrationNoticeAccessible"></span>`;
      const header = document.querySelector("header.top, header");
      if (header && header.parentNode) header.parentNode.insertBefore(noticeNode, header);
      else document.body.insertBefore(noticeNode, document.body.firstChild);
    }

    noticeOpenTrack = noticeNode.querySelector("#registrationAnnouncementOpen");
    noticeClosedTrack = noticeNode.querySelector("#registrationAnnouncementClosed");
    noticeAccessible = noticeNode.querySelector("#registrationNoticeAccessible");

    // Normalize incomplete legacy markup without replacing any surrounding page DOM.
    if (!noticeOpenTrack || !noticeClosedTrack) {
      noticeNode.innerHTML = `
        <div class="registration-notice-viewport" aria-hidden="true">
          <div class="registration-notice-track" id="registrationAnnouncementOpen" hidden><span>${OPEN_COPY}</span><span>${OPEN_COPY}</span></div>
          <div class="registration-notice-track" id="registrationAnnouncementClosed"><span>${CLOSED_COPY}</span><span>${CLOSED_COPY}</span></div>
        </div>
        <span class="sr-only" id="registrationNoticeAccessible"></span>`;
      noticeOpenTrack = noticeNode.querySelector("#registrationAnnouncementOpen");
      noticeClosedTrack = noticeNode.querySelector("#registrationAnnouncementClosed");
      noticeAccessible = noticeNode.querySelector("#registrationNoticeAccessible");
    }
  }

  function ensureHeaderControls() {
    // Prefer the stable CTA marker even when the public-closed state has removed
    // its href. Never mistake the separate account-menu registration item for
    // the main header button during a later sign-in/sign-out transition.
    navigationRegisterLink = document.querySelector("header .header-actions a[data-kmr-registration-nav]") ||
      [...document.querySelectorAll("header .header-actions a[href]")].find(anchor =>
        !anchor.hasAttribute("data-profile-register") && isRegistrationLink(anchor)
      ) || null;
    if (!navigationRegisterLink && navigationOriginal && navigationOriginal.anchor) {
      navigationRegisterLink = navigationOriginal.anchor;
    }
    if (!navigationRegisterLink) return;

    navigationRegisterLink.dataset.kmrRegistrationNav = "1";
    navigationRegisterCta = navigationRegisterLink.closest(".cta") || navigationRegisterLink.parentElement;
    if (navigationRegisterCta) navigationRegisterCta.classList.add("registration-cta");

    countdownNode = (navigationRegisterCta && navigationRegisterCta.querySelector(".registration-countdown")) || document.getElementById("registrationCountdown");
    if (!countdownNode && navigationRegisterCta) {
      countdownNode = document.createElement("span");
      countdownNode.className = "registration-countdown";
      countdownNode.id = "registrationCountdown";
      countdownNode.setAttribute("aria-live", "off");
      countdownNode.textContent = "CLOSES IN --D --H --M --S";
      countdownNode.hidden = true;
      navigationRegisterLink.insertAdjacentElement("afterend", countdownNode);
    }

  }

  function captureNavigationLink() {
    if (!navigationRegisterLink || navigationOriginal) return;
    navigationOriginal = {
      anchor: navigationRegisterLink,
      href: navigationRegisterLink.getAttribute("href") || routeHrefFromRoot(),
      html: navigationRegisterLink.innerHTML,
      hidden: navigationRegisterLink.hidden
    };
    navigationRegisterLink.dataset.kmrOriginalHref = navigationOriginal.href;
  }

  function restoreNavigationLink() {
    if (!navigationRegisterLink || !navigationOriginal) return;
    navigationRegisterLink.setAttribute("href", navigationOriginal.href);
    navigationRegisterLink.innerHTML = navigationOriginal.html;
    navigationRegisterLink.hidden = navigationOriginal.hidden;
    navigationRegisterLink.removeAttribute("aria-hidden");
  }

  function syncProfileRegistrationLinks() {
    // The account-menu item is an organiser shortcut, not a public CTA. Only
    // expose it once the real Supabase admin session has been verified.
    document.querySelectorAll("[data-profile-register]").forEach(anchor => {
      anchor.hidden = !(authResolved && isVerifiedAdmin);
    });
  }

  function updateBanner(open) {
    if (noticeOpenTrack) noticeOpenTrack.hidden = !open;
    if (noticeClosedTrack) noticeClosedTrack.hidden = open;
    if (noticeAccessible) {
      noticeAccessible.textContent = open
        ? "Official notice: Khawrai Marathon Race Season Three has been postponed due to unavoidable circumstances. It will be rescheduled at the same venue and the new date will be announced. Online registration remains open" + (registration.hasDeadline && registration.hasDeadline() ? " until " + registration.cutoffPKT() + "." : " until the rescheduled race date.")
        : "Official notice: Khawrai Marathon Race Season Three has been postponed due to unavoidable circumstances. It will be rescheduled at the same venue and the new date will be announced. Online registration is closed.";
    }
  }

  function updateCountdown() {
    if (!countdownNode) return;
    if (registration.hasDeadline && !registration.hasDeadline()) {
      // Open until further notice: show a calm static label instead of a timer.
      const label = "OPEN TILL NEW RACE DATE";
      if (countdownNode.textContent !== label) countdownNode.textContent = label;
      countdownNode.hidden = false;
      return;
    }
    const remaining = registration.remainingMs();
    if (remaining <= 0) {
      countdownNode.hidden = true;
      return;
    }
    const days = Math.floor(remaining / 86400000);
    const hours = Math.floor((remaining % 86400000) / 3600000);
    const minutes = Math.floor((remaining % 3600000) / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    const pad = n => String(n).padStart(2, "0");
    countdownNode.textContent = `CLOSES IN ${days}D ${pad(hours)}H ${pad(minutes)}M ${pad(seconds)}S`;
    countdownNode.hidden = false;
  }

  function syncCountdownTimer(open) {
    const ticking = open && !(registration.hasDeadline && !registration.hasDeadline());
    if (ticking && countdownTimer === null) {
      countdownTimer = window.setInterval(() => {
        if (registration.isOpen()) {
          updateCountdown();
          return;
        }
        window.clearInterval(countdownTimer);
        countdownTimer = null;
        applyRegistrationState();
      }, 1000);
    } else if (!ticking && countdownTimer !== null) {
      window.clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function setMode(mode) {
    if (lastMode === mode) return;
    document.documentElement.dataset.registrationState = mode;
    lastMode = mode;
  }

  function applyRegistrationState() {
    ensureHeaderControls();
    captureNavigationLink();
    syncProfileRegistrationLinks();

    const open = registration.isOpen();
    const adminInterface = isAdminInterfaceRoute();
    updateBanner(open);

    // Do not expose the public closed-state badge or stale CTA while an existing
    // organiser session is being checked. Admin workspace routes keep the
    // original Register shortcut; public routes show only the scrolling notice.
    if (!open && !authResolved) {
      restoreNavigationLink();
      if (navigationRegisterCta) navigationRegisterCta.hidden = !adminInterface;
      if (countdownNode) countdownNode.hidden = true;
      setMode("auth-checking");
      syncCountdownTimer(false);
      return;
    }

    const keepHeaderRegister = open || isVerifiedAdmin || adminInterface;
    const mode = open ? "open" : (isVerifiedAdmin ? "admin-closed" : (adminInterface ? "admin-interface-closed" : "public-closed"));

    // Keep registration links in page content functional: they lead to the
    // registration page, which displays a clear closed notice to the public.
    // This avoids injecting multiple static "Registration Ends" placeholders.

    if (navigationRegisterCta) navigationRegisterCta.hidden = !keepHeaderRegister;
    if (navigationRegisterLink) {
      if (keepHeaderRegister) {
        restoreNavigationLink();
        if (countdownNode) countdownNode.hidden = !open;
        if (open) updateCountdown();
      } else {
        navigationRegisterLink.hidden = true;
        navigationRegisterLink.removeAttribute("href");
        navigationRegisterLink.setAttribute("aria-hidden", "true");
        if (countdownNode) countdownNode.hidden = true;
      }
    }

    setMode(mode);
    syncCountdownTimer(open);
  }

  function routeHrefFromRoot() {
    return rootPath() + "register/";
  }

  // Expose a manual refresh for any optional UI that adds links after page load.
  window.KMRRegistrationUI = { refresh: applyRegistrationState };

  ensureNotice();
  ensureHeaderControls();
  captureNavigationLink();
  applyRegistrationState();

  if (window.KMRAuth) {
    Promise.resolve()
      .then(() => window.KMRAuth.current())
      .then(username => {
        isVerifiedAdmin = !!username;
        authResolved = true;
        applyRegistrationState();
      })
      .catch(() => {
        isVerifiedAdmin = false;
        authResolved = true;
        applyRegistrationState();
      });

    window.KMRAuth.onChange(username => {
      isVerifiedAdmin = !!username;
      authResolved = true;
      applyRegistrationState();
    });
  }
})();
