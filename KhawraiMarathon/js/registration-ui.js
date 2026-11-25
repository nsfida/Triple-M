/* Shared KMR-S3 registration UI (header button, in-page links and the top strip).
 * Presentation only: public.submit_registration and the Storage INSERT policies
 * (public.registration_window) remain the security boundary for public submissions.
 *
 * Registration OPEN   -> everybody sees the Register button.
 * Registration CLOSED -> public visitors see a "Registration Closed" tag instead of
 *                        the button, and in-page register links are replaced by the
 *                        same tag (or hidden in footers). Verified admins keep the
 *                        Register button and links (they can still add runners).
 */
(function () {
  "use strict";

  const registration = window.KMRRegistration;
  if (!registration || !document.body) return;

  const LOCK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7"/></svg>';

  let isVerifiedAdmin = false;
  let authResolved = !window.KMRAuth;
  let headerLink = null, headerCta = null, headerLabel = null, headerTag = null;
  let countdownTimer = null;

  function rootPath() {
    let path = window.location.pathname || "/";
    const routed = path.replace(/\/(?:results\/manage|participants|results|about|register|admin|event-info|updates)(?:\/index\.html)?\/?$/i, "/");
    if (routed !== path) path = routed;
    else path = path.replace(/\/index\.html$/i, "/");
    if (!path.endsWith("/")) path = path.slice(0, path.lastIndexOf("/") + 1);
    return path || "/";
  }
  const normalizeRoute = p => { let v = String(p || "/").replace(/\/index\.html$/i, "/").replace(/\.html$/i, "/"); return v.endsWith("/") ? v : v + "/"; };
  const registerPath = normalizeRoute(rootPath() + "register/");
  const updatesHref = rootPath() + "updates/";
  const isAdminRoute = () => /\/(admin|results\/manage)\/$/i.test(normalizeRoute(window.location.pathname || "/"));

  function isRegistrationLink(anchor) {
    const href = anchor && (anchor.dataset.kmrRegHref || anchor.getAttribute("href"));
    if (!href) return false;
    try {
      const url = new URL(href, window.location.href);
      return url.origin === window.location.origin && normalizeRoute(url.pathname) === registerPath;
    } catch (_) { return false; }
  }

  // ---------------------------------------------------------------- top strip
  function tickerCopy(open) {
    if (window.KMRSite && typeof window.KMRSite.tickerText === "function") {
      const text = window.KMRSite.tickerText(open);
      if (text) return text;
    }
    return "RACE RESCHEDULED: KHAWRAI MARATHON RACE SEASON THREE · FRIDAY, 04 DECEMBER 2026 · 04:00 PM (PKT) · SAME VENUE: KHAWRAI, TEHSIL JEHANGIRA · " +
      (open ? "ONLINE REGISTRATION IS OPEN" : "ONLINE REGISTRATION IS CLOSED");
  }

  function renderStrip(open) {
    let node = document.getElementById("registrationNotice");
    if (!node) {
      node = document.createElement("div");
      node.id = "registrationNotice";
      const header = document.querySelector("header.top, header");
      if (header && header.parentNode) header.parentNode.insertBefore(node, header);
      else document.body.insertBefore(node, document.body.firstChild);
    }
    const text = tickerCopy(open);
    if (node.dataset.copy === text) return;
    node.dataset.copy = text;
    node.className = "registration-notice kmr-ticker";
    node.setAttribute("role", "region");
    node.setAttribute("aria-label", "Latest race announcement");
    const safe = String(text).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    node.innerHTML = `<a class="kmr-ticker-link" href="${updatesHref}">
        <span class="kmr-ticker-badge"><i aria-hidden="true"></i>UPDATE</span>
        <span class="registration-notice-viewport" aria-hidden="true"><span class="registration-notice-track"><span>${safe}</span><span>${safe}</span></span></span>
        <span class="sr-only">${safe}. Open all updates and notices.</span>
      </a>`;
  }

  // ---------------------------------------------------------------- header CTA
  function ensureHeader() {
    if (!headerLink) {
      headerLink = document.querySelector("header .header-actions a[data-kmr-registration-nav]") ||
        [...document.querySelectorAll("header .header-actions a[href]")].find(a => !a.hasAttribute("data-profile-register") && isRegistrationLink(a)) || null;
      if (headerLink) {
        headerLink.dataset.kmrRegistrationNav = "1";
        headerLink.dataset.kmrRegHref = headerLink.getAttribute("href") || registerPath;
      }
    }
    if (!headerLink) return false;
    headerCta = headerLink.closest(".cta") || headerLink.parentElement;
    if (headerCta) headerCta.classList.add("registration-cta");
    headerLabel = (headerCta && headerCta.querySelector(".registration-countdown")) || null;
    if (!headerLabel && headerCta) {
      headerLabel = document.createElement("span");
      headerLabel.className = "registration-countdown";
      headerLabel.setAttribute("aria-live", "off");
      headerLink.insertAdjacentElement("afterend", headerLabel);
    }
    if (!headerTag && headerCta) {
      headerTag = document.createElement("span");
      headerTag.className = "reg-closed-tag";
      headerTag.setAttribute("role", "status");
      headerTag.innerHTML = `${LOCK_ICON}<span><b>Registration</b> Closed</span>`;
      headerTag.title = "Online registration for Season Three is closed";
      headerTag.hidden = true;
      headerCta.insertBefore(headerTag, headerCta.firstChild);
    }
    return true;
  }

  function updateCountdown() {
    if (!headerLabel) return;
    if (!registration.hasDeadline()) { headerLabel.textContent = "REGISTRATION OPEN"; return; }
    const remaining = registration.remainingMs();
    const pad = n => String(n).padStart(2, "0");
    const d = Math.floor(remaining / 86400000), h = Math.floor((remaining % 86400000) / 3600000);
    const m = Math.floor((remaining % 3600000) / 60000), s = Math.floor((remaining % 60000) / 1000);
    headerLabel.textContent = `CLOSES IN ${d}D ${pad(h)}H ${pad(m)}M ${pad(s)}S`;
  }

  function syncTimer(open) {
    const ticking = open && registration.hasDeadline();
    if (ticking && countdownTimer === null) {
      countdownTimer = window.setInterval(() => {
        if (registration.isOpen()) updateCountdown();
        else apply();
      }, 1000);
    } else if (!ticking && countdownTimer !== null) {
      window.clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  // ---------------------------------------------------------------- in-page links
  function syncPageLinks(publicClosed, adminClosed) {
    document.querySelectorAll("a[href], a[data-kmr-reg-href]").forEach(anchor => {
      if (anchor === headerLink || anchor.hasAttribute("data-profile-register") || anchor.closest(".profile-menu") || anchor.closest("header .header-actions")) return;
      if (!isRegistrationLink(anchor)) return;
      if (!anchor.dataset.kmrRegHref) anchor.dataset.kmrRegHref = anchor.getAttribute("href");
      let tag = anchor.nextElementSibling && anchor.nextElementSibling.classList.contains("reg-closed-inline") ? anchor.nextElementSibling : null;
      const wantsTag = anchor.hasAttribute("data-reg-cta");
      if (publicClosed) {
        anchor.hidden = true;
        anchor.setAttribute("aria-hidden", "true");
        anchor.removeAttribute("href");
        if (wantsTag && !tag) {
          tag = document.createElement("span");
          tag.className = "reg-closed-inline";
          tag.innerHTML = `${LOCK_ICON}<span>Registration closed</span>`;
          anchor.insertAdjacentElement("afterend", tag);
        }
        if (tag) tag.hidden = false;
      } else {
        anchor.hidden = false;
        anchor.removeAttribute("aria-hidden");
        anchor.setAttribute("href", anchor.dataset.kmrRegHref);
        if (tag) tag.hidden = true;
      }
    });
    // Elements that only make sense while registration is open (or for admins).
    document.querySelectorAll("[data-reg-open-only]").forEach(n => { n.hidden = publicClosed; });
    document.querySelectorAll("[data-reg-closed-only]").forEach(n => { n.hidden = !publicClosed; });
    // Organiser-facing notes: registration is closed to the public but this admin can still register runners.
    document.querySelectorAll("[data-reg-admin-closed]").forEach(n => { n.hidden = !(adminClosed); });
  }

  function syncProfileLinks() {
    document.querySelectorAll("[data-profile-register]").forEach(a => { a.hidden = !(authResolved && isVerifiedAdmin); });
  }

  // ---------------------------------------------------------------- state
  function apply() {
    const open = registration.isOpen();
    const adminView = isVerifiedAdmin || isAdminRoute();
    const publicClosed = !open && !adminView;
    const mode = open ? "open" : (isVerifiedAdmin ? "admin-closed" : (!authResolved ? "auth-checking" : (isAdminRoute() ? "admin-interface-closed" : "public-closed")));
    document.documentElement.dataset.registrationState = mode;

    const haveHeader = ensureHeader();
    renderStrip(open);
    syncProfileLinks();
    syncPageLinks(publicClosed, !open && !publicClosed);

    if (haveHeader) {
      headerCta.hidden = false;
      headerCta.classList.toggle("is-closed", publicClosed);
      headerLink.hidden = publicClosed;
      if (publicClosed) {
        headerLink.removeAttribute("href");
        headerLink.setAttribute("aria-hidden", "true");
      } else {
        headerLink.setAttribute("href", headerLink.dataset.kmrRegHref);
        headerLink.removeAttribute("aria-hidden");
      }
      if (headerTag) headerTag.hidden = !publicClosed;
      if (headerLabel) {
        headerLabel.hidden = publicClosed;
        headerLabel.classList.toggle("is-admin-only", !open && !publicClosed);
        if (open) updateCountdown();
        else headerLabel.textContent = "ADMIN ACCESS ONLY";
      }
    }
    syncTimer(open);
  }

  window.KMRRegistrationUI = { refresh: apply };
  window.addEventListener("kmr:registration-change", apply);
  window.addEventListener("kmr:site-state", apply);

  apply();

  if (window.KMRAuth) {
    const resolve = username => { isVerifiedAdmin = !!username; authResolved = true; apply(); };
    Promise.resolve().then(() => window.KMRAuth.current()).then(resolve).catch(() => resolve(""));
    window.KMRAuth.onChange(resolve);
  }
})();
