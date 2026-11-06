/* Shared KMR-S3 registration deadline UI.
 * This controls presentation only. The PostgreSQL submit_registration function
 * and Storage INSERT policies remain the security boundary for public submissions.
 *
 * Behaviour after the cutoff:
 *   - Public visitors see a clear, non-clickable "Registration Ends" status.
 *   - A verified administrator keeps the original "Register" button and links.
 *   - While an existing admin session is being checked, the UI does not briefly
 *     flash the public-only closed state. The server remains authoritative.
 */
(function () {
  "use strict";

  const registration = window.KMRRegistration;
  if (!registration || !document.body) return;

  const OPEN_COPY = "REGISTRATION DEADLINE: 05 NOVEMBER 2026 · 11:59 PM PAKISTAN STANDARD TIME (PKT) · REGISTER BEFORE THE DEADLINE";
  const CLOSED_COPY = "REGISTRATION HAS ENDED · ONLINE PLAYER REGISTRATION IS CLOSED · THANK YOU FOR YOUR INTEREST";
  const originalLinkState = new Map();

  let isVerifiedAdmin = false;
  // Do not briefly apply public-only restrictions while the saved session is being
  // validated. This is a presentation state only; it never grants database access.
  let authResolved = !window.KMRAuth;
  let navigationRegisterLink = null;
  let navigationOriginal = null;
  let navigationRegisterCta = null;
  let countdownNode = null;
  let endedNode = null;
  let noticeOpenTrack = null;
  let noticeClosedTrack = null;
  let noticeAccessible = null;
  let lastMode = "";
  let countdownTimer = null;

  function rootPath() {
    let path = window.location.pathname || "/";
    const routed = path.replace(/\/(?:results\/manage|participants|results|about|register|admin)(?:\/index\.html)?\/?$/i, "/");
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
          <div class="registration-notice-track" id="registrationAnnouncementOpen"><span>${OPEN_COPY}</span><span>${OPEN_COPY}</span></div>
          <div class="registration-notice-track" id="registrationAnnouncementClosed" hidden><span>${CLOSED_COPY}</span><span>${CLOSED_COPY}</span></div>
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
          <div class="registration-notice-track" id="registrationAnnouncementOpen"><span>${OPEN_COPY}</span><span>${OPEN_COPY}</span></div>
          <div class="registration-notice-track" id="registrationAnnouncementClosed" hidden><span>${CLOSED_COPY}</span><span>${CLOSED_COPY}</span></div>
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

    endedNode = (navigationRegisterCta && navigationRegisterCta.querySelector(".registration-ended-pill")) || document.getElementById("registrationEndedCta");
    if (!endedNode && navigationRegisterCta) {
      endedNode = document.createElement("span");
      endedNode.className = "btn registration-ended-pill";
      endedNode.textContent = "Registration Ends";
      endedNode.hidden = true;
      (countdownNode || navigationRegisterLink).insertAdjacentElement("afterend", endedNode);
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

  // Only public-facing registration links are replaced after the deadline.
  // The account-menu item is deliberately excluded: common.js owns its visibility
  // and only shows it to a signed-in organiser.
  function closeRegularLink(anchor) {
    const existing = originalLinkState.get(anchor);
    if (existing) {
      if (existing.placeholder && !existing.placeholder.isConnected) {
        anchor.insertAdjacentElement("afterend", existing.placeholder);
      }
      anchor.hidden = true;
      anchor.removeAttribute("href");
      anchor.setAttribute("aria-hidden", "true");
      return;
    }

    const placeholder = document.createElement("span");
    placeholder.className = "registration-ended-link";
    placeholder.textContent = "Registration Ends";
    placeholder.setAttribute("aria-disabled", "true");
    placeholder.setAttribute("role", "text");
    anchor.insertAdjacentElement("afterend", placeholder);
    originalLinkState.set(anchor, {
      placeholder,
      href: anchor.getAttribute("href"),
      html: anchor.innerHTML,
      hidden: anchor.hidden
    });
    anchor.hidden = true;
    anchor.removeAttribute("href");
    anchor.setAttribute("aria-hidden", "true");
  }

  function restoreRegularLink(anchor) {
    const state = originalLinkState.get(anchor);
    if (!state) return;
    if (state.placeholder && state.placeholder.isConnected) state.placeholder.remove();
    if (state.href != null) anchor.setAttribute("href", state.href);
    anchor.innerHTML = state.html;
    anchor.hidden = state.hidden;
    anchor.removeAttribute("aria-hidden");
    originalLinkState.delete(anchor);
  }

  function restoreAllRegularLinks() {
    [...originalLinkState.keys()].forEach(restoreRegularLink);
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
        ? "Registration closes on 05 November 2026 at 11:59 PM Pakistan Standard Time (PKT)."
        : "Registration has ended. Online player registration is closed.";
    }
  }

  function updateCountdown() {
    if (!countdownNode) return;
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
    if (open && countdownTimer === null) {
      countdownTimer = window.setInterval(() => {
        if (registration.isOpen()) {
          updateCountdown();
          return;
        }
        window.clearInterval(countdownTimer);
        countdownTimer = null;
        applyRegistrationState();
      }, 1000);
    } else if (!open && countdownTimer !== null) {
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
    updateBanner(open);

    // Wait for Supabase to validate the persisted session before applying any
    // public-only closed-state changes. This prevents the "Registration Ends"
    // badge flashing on every page for a signed-in admin.
    if (!open && !authResolved) {
      restoreAllRegularLinks();
      restoreNavigationLink();
      if (countdownNode) countdownNode.hidden = true;
      if (endedNode) endedNode.hidden = true;
      setMode("auth-checking");
      syncCountdownTimer(false);
      return;
    }

    const adminInterface = isAdminInterfaceRoute();
    const keepHeaderRegister = open || isVerifiedAdmin || adminInterface;
    const mode = open ? "open" : (isVerifiedAdmin ? "admin-closed" : (adminInterface ? "admin-interface-closed" : "public-closed"));

    if (open || isVerifiedAdmin) restoreAllRegularLinks();

    const allRegisterLinks = [...document.querySelectorAll("a[href]")]
      .filter(anchor => !anchor.hasAttribute("data-profile-register") && isRegistrationLink(anchor));
    originalLinkState.forEach((_, anchor) => {
      if (!anchor.hasAttribute("data-profile-register") && !allRegisterLinks.includes(anchor)) {
        allRegisterLinks.push(anchor);
      }
    });

    for (const anchor of allRegisterLinks) {
      if (anchor === navigationRegisterLink) continue;
      if (open || isVerifiedAdmin) restoreRegularLink(anchor);
      else closeRegularLink(anchor);
    }

    if (navigationRegisterLink) {
      if (keepHeaderRegister) {
        // Keep the original button text and link exactly as authored: "Register".
        // Admin workspace routes retain this shortcut even while signed out; the
        // registration form and database still require a verified admin session.
        restoreNavigationLink();
        if (countdownNode) countdownNode.hidden = !open;
        if (endedNode) endedNode.hidden = true;
        if (open) updateCountdown();
      } else {
        navigationRegisterLink.hidden = true;
        navigationRegisterLink.removeAttribute("href");
        navigationRegisterLink.setAttribute("aria-hidden", "true");
        if (countdownNode) countdownNode.hidden = true;
        if (endedNode) {
          endedNode.textContent = "Registration Ends";
          endedNode.hidden = false;
        }
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
