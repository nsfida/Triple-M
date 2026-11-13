/* KMR-S3 official postponement notice (District Sports Office Nowshera, 13 Nov 2026).
 *
 *  - Opens a "paper" notice overlay with both partner logos when a page loads
 *    (public pages: every load; admin workspaces: once per browser session;
 *    the /notice/ page itself never auto-opens it).
 *  - Adds a floating "Official notice" button so visitors can reopen it.
 *  - Makes the scrolling announcement strip open the notice.
 *  - Any element with [data-pp-open] opens the overlay; any <a data-pp-pdf>
 *    is pointed at the downloadable PDF notice.
 *  - Disable everything by setting window.KMR.POSTPONEMENT.ENABLED = false.
 */
(function () {
  "use strict";

  const cfg = (window.KMR && window.KMR.POSTPONEMENT) || {};
  if (cfg.ENABLED === false || !document.body) return;

  // Site root resolved from this script's own URL (js/postponement-notice.js -> ../).
  const script = document.currentScript || [...document.scripts].find(s => /postponement-notice\.js/.test(s.src));
  const ROOT = script && script.src ? new URL("../", script.src).href : new URL("./", window.location.href).href;
  const asset = path => new URL(path, ROOT).href;

  const NOTICE_DATE = cfg.NOTICE_DATE || "13 November 2026";
  const ORIGINAL_DATE = cfg.ORIGINAL_DATE || "15 November 2026";
  const PDF_URL = asset(cfg.PDF_FILE || "assets/notice/KMR-S3-Postponement-Notice.pdf");
  const PDF_NAME = "KMR-S3-Postponement-Notice.pdf";
  const NOTICE_PAGE = asset("notice/");
  const LOGO_LEFT = asset("assets/logo-left.png");
  const LOGO_RIGHT = asset("assets/logo-right.png");

  const path = (window.location.pathname || "/").replace(/index\.html$/i, "");
  const isNoticePage = /\/notice\/?$/i.test(path);
  const isAdminRoute = /\/admin\/?$/i.test(path) || /\/results\/manage\/?$/i.test(path);
  const SESSION_KEY = "kmr_pp_notice_seen_" + NOTICE_DATE.replace(/\W+/g, "");

  // Stylesheet fallback, in case a page forgot to link it.
  if (![...document.styleSheets].some(s => s.href && /postponement\.css/.test(s.href)) &&
      !document.querySelector('link[href*="postponement.css"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = asset("assets/postponement.css?v=20261113-1");
    document.head.appendChild(link);
  }

  const ICON_DOWNLOAD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/></svg>';
  const ICON_DOC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 13h6M10 17h6"/></svg>';

  function paperHTML(headingId) {
    return `
      <article class="pp-paper" aria-labelledby="${headingId}">
        <header class="pp-letterhead">
          <img src="${LOGO_LEFT}" alt="District Administration Nowshera emblem" width="92" height="92">
          <div class="pp-letterhead-text">
            <div class="pp-gov">GOVERNMENT OF KHYBER PAKHTUNKHWA</div>
            <div class="pp-dso">DISTRICT SPORTS OFFICE NOWSHERA</div>
            <div class="pp-dept">Directorate General of Sports, Khyber Pakhtunkhwa<br>in collaboration with District Administration Nowshera</div>
          </div>
          <img src="${LOGO_RIGHT}" alt="Directorate General of Sports Khyber Pakhtunkhwa logo" width="92" height="92">
        </header>
        <div class="pp-refline"><span><b>Event:</b> Khawrai Marathon Race - Season Three</span><span><b>Dated:</b> ${NOTICE_DATE}</span></div>
        <div class="pp-title"><span id="${headingId}">NOTICE</span></div>
        <p class="pp-subject">Subject: Postponement of Khawrai Marathon Race - Season Three</p>
        <div class="pp-body">
          <p>It is hereby notified for the information of all registered participants, stakeholders and the general public that the <b>Khawrai Marathon Race (Season Three)</b>, arranged by the District Administration and the District Sports Office Nowshera at Khawrai, Tehsil Jehangira, and previously scheduled for ${ORIGINAL_DATE}, <b>has been postponed due to unavoidable circumstances</b>.</p>
          <p>The event will be rescheduled at the <b>same venue</b>. The new date will be announced through an official notice in due course.</p>
          <p>It is further notified that the <b>registration process will continue until the rescheduled race date</b>. Participants who have already registered are not required to register again; their registrations remain valid.</p>
          <p>The inconvenience caused is sincerely regretted.</p>
        </div>
        <div class="pp-facts" role="list">
          <div class="pp-fact-status" role="listitem"><small>RACE STATUS</small><strong>Postponed</strong></div>
          <div role="listitem"><small>VENUE</small><strong>Same location · Khawrai, Tehsil Jehangira</strong></div>
          <div role="listitem"><small>NEW RACE DATE</small><strong>To be announced</strong></div>
          <div role="listitem"><small>REGISTRATION</small><strong>Open until the rescheduled date</strong></div>
        </div>
        <div class="pp-sign">
          <div class="pp-circ"><b>For information of:</b>1. All registered participants<br>2. Race organisers and volunteers<br>3. Community stakeholders and the general public</div>
          <div class="pp-signature"><div class="pp-regards">Kind regards,</div><strong>District Sports Officer</strong>Nowshera</div>
        </div>
        <div class="pp-paper-foot">Please follow only official announcements for the new race date.</div>
      </article>`;
  }

  let overlay = null;
  let lastFocus = null;

  function buildOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.className = "pp-overlay";
    overlay.id = "ppNoticeOverlay";
    overlay.hidden = true;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "ppOverlayTitle");
    overlay.innerHTML = `
      <div class="pp-dialog">
        <div class="pp-ribbon"><span class="pp-ribbon-live"><i aria-hidden="true"></i>OFFICIAL NOTICE · DISTRICT SPORTS OFFICE NOWSHERA</span>
          <button type="button" class="pp-close-x" data-pp-close aria-label="Close notice">×</button></div>
        ${paperHTML("ppOverlayTitle")}
        <div class="pp-actions">
          <a class="pp-btn pp-btn-primary" href="${PDF_URL}" download="${PDF_NAME}">${ICON_DOWNLOAD}Download PDF notice</a>
          ${isNoticePage ? "" : `<a class="pp-btn pp-btn-light" href="${NOTICE_PAGE}">${ICON_DOC}Notice page</a>`}
          <button type="button" class="pp-btn pp-btn-light" data-pp-close>Continue to site</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    overlay.addEventListener("click", event => {
      if (event.target === overlay || event.target.closest("[data-pp-close]")) close();
    });
    overlay.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); close(); return; }
      if (event.key !== "Tab") return;
      const focusable = [...overlay.querySelectorAll("a[href],button:not([disabled])")].filter(el => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    return overlay;
  }

  function open() {
    const node = buildOverlay();
    if (!node.hidden) return;
    lastFocus = document.activeElement;
    node.hidden = false;
    document.documentElement.classList.add("pp-lock");
    node.scrollTop = 0;
    requestAnimationFrame(() => {
      node.classList.add("is-open");
      const primary = node.querySelector("[data-pp-close].pp-btn") || node.querySelector("[data-pp-close]");
      if (primary) { try { primary.focus({ preventScroll: true }); } catch (_) { primary.focus(); } }
    });
    try { sessionStorage.setItem(SESSION_KEY, "1"); } catch (_) {}
  }

  function close() {
    if (!overlay || overlay.hidden) return;
    overlay.classList.remove("is-open");
    document.documentElement.classList.remove("pp-lock");
    window.setTimeout(() => { overlay.hidden = true; }, 200);
    if (lastFocus && typeof lastFocus.focus === "function") {
      try { lastFocus.focus({ preventScroll: true }); } catch (_) {}
    }
  }

  function addFloatingButton() {
    if (isNoticePage || document.querySelector(".pp-fab")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pp-fab";
    btn.setAttribute("aria-label", "Open the official race postponement notice");
    btn.innerHTML = '<i aria-hidden="true">!</i><span>OFFICIAL NOTICE</span>';
    btn.addEventListener("click", open);
    document.body.appendChild(btn);
  }

  function wireTriggers() {
    document.addEventListener("click", event => {
      const trigger = event.target.closest && event.target.closest("[data-pp-open]");
      if (trigger) { event.preventDefault(); open(); }
    });
    document.querySelectorAll("a[data-pp-pdf]").forEach(a => {
      a.href = PDF_URL;
      a.setAttribute("download", PDF_NAME);
    });
    const strip = document.getElementById("registrationNotice");
    if (strip && !isNoticePage) {
      strip.classList.add("pp-clickable");
      strip.title = "Read the official postponement notice";
      strip.addEventListener("click", open);
    }
  }

  // Wait for the page loader (if any) to finish so the notice is not hidden behind it.
  function whenLoaderDone(callback) {
    const started = Date.now();
    (function check() {
      const loader = document.getElementById("appLoader");
      const busy = loader && !loader.hidden && !loader.classList.contains("is-done") && getComputedStyle(loader).display !== "none";
      if (!busy || Date.now() - started > 4500) { window.setTimeout(callback, busy ? 0 : 280); return; }
      window.setTimeout(check, 150);
    })();
  }

  function shouldAutoOpen() {
    if (isNoticePage) return false;
    if (/[?&]notice=0\b/.test(window.location.search)) return false;
    if (isAdminRoute) {
      try { return sessionStorage.getItem(SESSION_KEY) !== "1"; } catch (_) { return true; }
    }
    return true;
  }

  window.KMRNotice = { open, close, pdfUrl: PDF_URL, paperHTML };

  function init() {
    wireTriggers();
    addFloatingButton();
    if (shouldAutoOpen()) whenLoaderDone(open);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
