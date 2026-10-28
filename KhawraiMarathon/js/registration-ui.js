/* Shared KMR-S3 registration deadline UI.
 * This is presentation only. The PostgreSQL submit_registration function and
 * Storage INSERT policies remain the security boundary for public submissions.
 */
(function () {
  "use strict";

  const registration = window.KMRRegistration;
  if (!registration || !document.body) return;

  const OPEN_COPY = "REGISTRATION DEADLINE: 05 NOVEMBER 2026 · 11:59 PM PAKISTAN STANDARD TIME · REGISTER BEFORE THE DEADLINE";
  const CLOSED_COPY = "REGISTRATION HAS ENDED · ONLINE PLAYER REGISTRATION IS CLOSED · THANK YOU FOR YOUR INTEREST";
  const originalLinkState = new Map();
  let isVerifiedAdmin = false;
  let navigationRegisterLink = null;
  let navigationOriginal = null;
  let navigationRegisterCta = null;
  let countdownNode = null;
  let endedNode = null;
  let noticeNode = null;
  let noticeOpenTrack = null;
  let noticeClosedTrack = null;
  let noticeAccessible = null;
  let lastMode = "";

  function rootPath() {
    let path = window.location.pathname || "/";
    const routed = path.replace(/\/(?:participants|results|about|register|admin)(?:\/index\.html)?\/?$/i, "/");
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

  const registerPath = normalizeRoute(rootPath() + "register/");

  function isRegistrationLink(anchor) {
    if (!anchor || !anchor.getAttribute || !anchor.getAttribute("href")) return false;
    try {
      const url = new URL(anchor.getAttribute("href"), window.location.href);
      return url.origin === window.location.origin && normalizeRoute(url.pathname) === registerPath;
    } catch (_) { return false; }
  }

  function ensureNotice() {
    noticeNode = document.getElementById("registrationNotice");
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

    noticeOpenTrack = document.getElementById("registrationAnnouncementOpen");
    noticeClosedTrack = document.getElementById("registrationAnnouncementClosed");
    noticeAccessible = document.getElementById("registrationNoticeAccessible");

    // Normalize older/custom route markup to the same open/closed banner on all pages.
    if (!noticeOpenTrack || !noticeClosedTrack) {
      noticeNode.innerHTML = `
        <div class="registration-notice-viewport" aria-hidden="true">
          <div class="registration-notice-track" id="registrationAnnouncementOpen"><span>${OPEN_COPY}</span><span>${OPEN_COPY}</span></div>
          <div class="registration-notice-track" id="registrationAnnouncementClosed" hidden><span>${CLOSED_COPY}</span><span>${CLOSED_COPY}</span></div>
        </div>
        <span class="sr-only" id="registrationNoticeAccessible"></span>`;
      noticeOpenTrack = document.getElementById("registrationAnnouncementOpen");
      noticeClosedTrack = document.getElementById("registrationAnnouncementClosed");
      noticeAccessible = document.getElementById("registrationNoticeAccessible");
    }
  }

  function ensureHeaderControls() {
    navigationRegisterLink = [...document.querySelectorAll("header .header-actions a[href]")].find(isRegistrationLink) || null;
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

  // Links are visually replaced when the deadline passes. Keep the original DOM
  // node and href in memory so an authenticated admin can regain the admin bypass
  // without a reload. Database checks are still authoritative and cannot be bypassed
  // by changing any of this browser-side markup.
  function closeRegularLink(anchor) {
    const existing = originalLinkState.get(anchor);
    if (existing) {
      // Another shared component may refresh a hidden profile link; re-apply the
      // closed state instead of allowing that refresh to restore a public href.
      if (existing.placeholder && !existing.placeholder.isConnected) anchor.insertAdjacentElement("afterend", existing.placeholder);
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
    originalLinkState.set(anchor, { placeholder, href: anchor.getAttribute("href"), html: anchor.innerHTML, hidden: anchor.hidden });
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
    // The shared profile renderer owns this item’s visibility: only a verified
    // administrator should see it, even if it was hidden when the deadline passed.
    anchor.hidden = anchor.hasAttribute("data-profile-register") ? !isVerifiedAdmin : state.hidden;
    anchor.removeAttribute("aria-hidden");
    originalLinkState.delete(anchor);
  }

  function updateBanner(open) {
    if (noticeOpenTrack) noticeOpenTrack.hidden = !open;
    if (noticeClosedTrack) noticeClosedTrack.hidden = open;
    if (noticeAccessible) {
      noticeAccessible.textContent = open
        ? "Registration closes on 05 November 2026 at 11:59 PM Pakistan Standard Time."
        : "Registration has ended. Online player registration is closed.";
    }
  }

  function updateCountdown() {
    if (!countdownNode) return;
    const remaining = registration.remainingMs();
    const days = Math.floor(remaining / 86400000);
    const hours = Math.floor((remaining % 86400000) / 3600000);
    const minutes = Math.floor((remaining % 3600000) / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    const pad = n => String(n).padStart(2, "0");
    countdownNode.textContent = `CLOSES IN ${days}D ${pad(hours)}H ${pad(minutes)}M ${pad(seconds)}S`;
  }

  function restoreNavigationLink() {
    if (!navigationRegisterLink || !navigationOriginal) return;
    navigationRegisterLink.setAttribute("href", navigationOriginal.href);
    navigationRegisterLink.innerHTML = navigationOriginal.html;
    navigationRegisterLink.hidden = navigationOriginal.hidden;
    navigationRegisterLink.removeAttribute("aria-hidden");
  }

  function applyRegistrationState() {
    ensureHeaderControls();
    const open = registration.isOpen();
    const mode = open ? "open" : (isVerifiedAdmin ? "admin-closed" : "public-closed");
    updateBanner(open);

    // Any non-navigation registration CTAs are restored for open registration or
    // a verified administrator. The public closed state replaces each with plain text.
    if (open || isVerifiedAdmin) {
      [...originalLinkState.keys()].forEach(restoreRegularLink);
    }

    const allRegisterLinks = [...document.querySelectorAll("a[href]")]
      .filter(isRegistrationLink);
    originalLinkState.forEach((_, anchor) => { if (!allRegisterLinks.includes(anchor)) allRegisterLinks.push(anchor); });
    for (const anchor of allRegisterLinks) {
      if (anchor === navigationRegisterLink) continue;
      if (open || isVerifiedAdmin) restoreRegularLink(anchor);
      else closeRegularLink(anchor);
    }

    if (navigationRegisterLink) {
      if (!navigationOriginal) {
        navigationOriginal = {
          anchor: navigationRegisterLink,
          href: navigationRegisterLink.getAttribute("href") || routeHrefFromRoot(),
          html: navigationRegisterLink.innerHTML,
          hidden: navigationRegisterLink.hidden
        };
        navigationRegisterLink.dataset.kmrOriginalHref = navigationOriginal.href;
      }
      if (open) {
        restoreNavigationLink();
        if (countdownNode) countdownNode.hidden = false;
        if (endedNode) endedNode.hidden = true;
        updateCountdown();
      } else if (isVerifiedAdmin) {
        restoreNavigationLink();
        navigationRegisterLink.textContent = "Admin registration";
        if (countdownNode) countdownNode.hidden = true;
        if (endedNode) endedNode.hidden = true;
      } else {
        navigationRegisterLink.hidden = true;
        navigationRegisterLink.removeAttribute("href");
        navigationRegisterLink.setAttribute("aria-hidden", "true");
        if (countdownNode) countdownNode.hidden = true;
        if (endedNode) { endedNode.textContent = "Registration Ends"; endedNode.hidden = false; }
      }
    }

    if (lastMode !== mode) {
      document.documentElement.dataset.registrationState = mode;
      lastMode = mode;
    }
  }

  function routeHrefFromRoot() { return rootPath() + "register/"; }

  // Initialize all static registration links once; links added by optional features
  // can be refreshed by calling the public sync method below.
  window.KMRRegistrationUI = { refresh: applyRegistrationState };
  ensureNotice();
  ensureHeaderControls();
  // Store original nav href before any later change; all page templates use relative links.
  if (navigationRegisterLink && !navigationOriginal) {
    navigationOriginal = {
      anchor: navigationRegisterLink,
      href: navigationRegisterLink.getAttribute("href") || routeHrefFromRoot(),
      html: navigationRegisterLink.innerHTML,
      hidden: navigationRegisterLink.hidden
    };
    navigationRegisterLink.dataset.kmrOriginalHref = navigationOriginal.href;
  }
  applyRegistrationState();

  if (window.KMRAuth) {
    window.KMRAuth.current().then(username => { isVerifiedAdmin = !!username; applyRegistrationState(); });
    window.KMRAuth.onChange(username => { isVerifiedAdmin = !!username; applyRegistrationState(); });
  }
  window.setInterval(applyRegistrationState, 1000);
})();
