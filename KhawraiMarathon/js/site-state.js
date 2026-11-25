/* KMR-S3 site state: race schedule, registration status, the updates feed and the
 * archived postponement notice. Shared by every public and admin route.
 *
 *  - Race date/time/venue come from public.site_settings (via public_site_state()),
 *    with js/config.js values as the default and a localStorage copy for instant paint.
 *  - Any element with data-kmr="<field>" is filled from the state (see FIELDS below),
 *    so a new race date set by nsfida appears everywhere without editing pages.
 *  - [data-kmr-countdown] elements count down to the race start (PKT).
 *  - [data-kmr-updates] elements render the published updates from public.site_updates
 *    (built-in defaults are used if the table is not reachable yet).
 *  - The 13 Nov 2026 postponement notice is kept as an archived, read-only item.
 */
(function () {
  "use strict";
  const C = window.KMR || {};
  const RACE = C.RACE || {};
  const script = document.currentScript || [...document.scripts].find(s => /site-state\.js/.test(s.src));
  const ROOT = script && script.src ? new URL("../", script.src).href : new URL("./", location.href).href;
  const asset = p => new URL(String(p || "").replace(/^\/+/, ""), ROOT).href;
  const STATE_KEY = "kmr-site-state-v1";
  const UPDATES_KEY = "kmr-site-updates-v1";
  const POSTPONEMENT_SLUG = "race-postponed-2026-11-13";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  };

  // ------------------------------------------------------------------ defaults
  const DEFAULT_STATE = {
    race_at: RACE.START_AT || "2026-12-04T16:00:00+05:00",
    venue: RACE.VENUE || "Khawrai, Tehsil Jehangira, District Nowshera",
    reporting_note: RACE.REPORTING_NOTE || "",
    ticker_text: "",
    registration_open: C.REGISTRATION_OPEN !== false,
    registration_closes_at: C.REGISTRATION_CUTOFF || null
  };
  const NOTICE = C.ARCHIVED_NOTICE || {};
  const DEFAULT_UPDATES = [
    {
      id: "default-rescheduled", slug: "race-rescheduled-2026-12-04", category: "schedule", is_pinned: true, is_archived: false,
      published_on: "2026-11-25",
      title: "New race date: Friday, 04 December 2026 at 04:00 PM",
      summary: "Khawrai Marathon Race Season Three has been rescheduled. The race will be held on Friday, 04 December 2026 at 04:00 PM (Pakistan Time) at the same venue in Khawrai, Tehsil Jehangira.",
      body: "The start point (Railway Phatak, Khawrai Road), the finish point (Government Boys School Khawrai) and the approximately 07 KM route are unchanged.\n\nAll registered runners keep their registration numbers. Please report to the start point by 03:00 PM, one hour before the official start, and follow the instructions of the organisers and marshals.",
      link_url: "event-info/", link_label: "Event info & route"
    },
    {
      id: "default-registration-closed", slug: "registration-closed", category: "registration", is_pinned: false, is_archived: false,
      published_on: "2026-11-25",
      title: "Online registration is now closed",
      summary: "Public online registration for Season Three has closed. Runners who are already registered keep their entries and registration numbers.",
      body: "No new public entries are accepted. You can check your entry in the public participants list.",
      link_url: "participants/", link_label: "View participants"
    },
    {
      id: "default-postponed", slug: POSTPONEMENT_SLUG, category: "notice", is_pinned: false, is_archived: true,
      published_on: "2026-11-13",
      title: "Official notice: race postponed",
      summary: "District Sports Office Nowshera postponed the race previously scheduled for 15 November 2026 due to unavoidable circumstances, to be rescheduled at the same venue.",
      body: "This notice has been superseded by the announcement of the new race date: Friday, 04 December 2026 at 04:00 PM.",
      attachment_url: NOTICE.PDF_FILE || "assets/notice/KMR-S3-Postponement-Notice.pdf", attachment_label: "Download PDF notice"
    }
  ];

  let state = Object.assign({}, DEFAULT_STATE, store.get(STATE_KEY) || {});
  let updates = store.get(UPDATES_KEY);
  let updatesSource = Array.isArray(updates) ? "cache" : "default";
  if (!Array.isArray(updates)) updates = DEFAULT_UPDATES;

  // ------------------------------------------------------------------ formatting (always PKT)
  const raceMs = () => { const t = Date.parse(state.race_at); return Number.isFinite(t) ? t : Date.parse(DEFAULT_STATE.race_at); };
  function pkt(ms, opts) {
    try { return new Intl.DateTimeFormat("en-GB", Object.assign({ timeZone: "Asia/Karachi" }, opts)).format(new Date(ms)); }
    catch (_) { return new Date(ms).toUTCString(); }
  }
  function timeText(ms) {
    try { return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(ms)); }
    catch (_) { return ""; }
  }
  const FIELDS = {
    "race-date": () => pkt(raceMs(), { day: "2-digit", month: "long", year: "numeric" }),
    "race-date-short": () => pkt(raceMs(), { day: "2-digit", month: "short", year: "numeric" }),
    "race-day": () => pkt(raceMs(), { weekday: "long" }),
    "race-day-num": () => pkt(raceMs(), { day: "2-digit" }),
    "race-month-short": () => pkt(raceMs(), { month: "short" }).toUpperCase(),
    "race-year": () => pkt(raceMs(), { year: "numeric" }),
    "race-time": () => timeText(raceMs()),
    "report-time": () => timeText(raceMs() - 3600000),   // reporting = one hour before the start
    "race-weekday-date": () => `${pkt(raceMs(), { weekday: "long" })}, ${pkt(raceMs(), { day: "2-digit", month: "long", year: "numeric" })}`,
    "race-datetime": () => `${pkt(raceMs(), { weekday: "long" })}, ${pkt(raceMs(), { day: "2-digit", month: "long", year: "numeric" })} · ${timeText(raceMs())} PKT`,
    "venue": () => state.venue || DEFAULT_STATE.venue,
    "reporting": () => state.reporting_note || DEFAULT_STATE.reporting_note,
    "registration-status": () => (window.KMRRegistration && window.KMRRegistration.isOpen()) ? "Open" : "Closed"
  };
  function applyFields(root) {
    (root || document).querySelectorAll("[data-kmr]").forEach(node => {
      const fn = FIELDS[node.dataset.kmr];
      if (!fn) return;
      const value = fn();
      if (value && node.textContent !== value) node.textContent = value;
    });
    document.querySelectorAll("[data-kmr-reg-state]").forEach(node => {
      node.dataset.kmrRegState = (window.KMRRegistration && window.KMRRegistration.isOpen()) ? "open" : "closed";
    });
  }

  function tickerText(open) {
    const custom = String(state.ticker_text || "").trim();
    if (custom) return custom.toUpperCase();
    return `NEW RACE DATE: KHAWRAI MARATHON RACE SEASON THREE · ${FIELDS["race-weekday-date"]().toUpperCase()} · ${FIELDS["race-time"]()} (PKT) · SAME VENUE: ${String(state.venue || "").toUpperCase()} · ` +
      (open ? "ONLINE REGISTRATION IS OPEN" : "ONLINE REGISTRATION IS CLOSED · REGISTERED RUNNERS KEEP THEIR ENTRIES");
  }

  // ------------------------------------------------------------------ race countdown
  const RACE_WINDOW_MS = 4 * 3600000;   // treated as "race day / in progress" for 4 hours after the start
  function phase(now) {
    const start = raceMs();
    if (now < start) return "upcoming";
    if (now < start + RACE_WINDOW_MS) return "live";
    return "past";
  }
  function renderCountdowns() {
    const nodes = document.querySelectorAll("[data-kmr-countdown]");
    if (!nodes.length) return false;
    const now = Date.now(), left = Math.max(0, raceMs() - now), ph = phase(now);
    const parts = { d: Math.floor(left / 86400000), h: Math.floor(left % 86400000 / 3600000), m: Math.floor(left % 3600000 / 60000), s: Math.floor(left % 60000 / 1000) };
    nodes.forEach(node => {
      node.dataset.phase = ph;
      node.querySelectorAll("[data-cd]").forEach(n => {
        const v = String(parts[n.dataset.cd] == null ? "" : parts[n.dataset.cd]).padStart(2, "0");
        if (n.textContent !== v) n.textContent = v;
      });
      node.querySelectorAll("[data-cd-show]").forEach(n => { n.hidden = n.dataset.cdShow.split(/\s+/).indexOf(ph) < 0; });
    });
    return true;
  }
  let cdTimer = null;
  function startCountdowns() {
    if (cdTimer || !renderCountdowns()) return;
    cdTimer = window.setInterval(() => { if (!document.hidden) renderCountdowns(); }, 1000);
  }

  // ------------------------------------------------------------------ updates feed
  const CATEGORY = {
    schedule: "Race schedule", announcement: "Announcement", registration: "Registration",
    notice: "Official notice", results: "Results", general: "General"
  };
  function safeUrl(url) {
    const v = String(url || "").trim();
    if (!v) return "";
    if (/^https?:\/\//i.test(v)) return v;
    if (/^[a-z][a-z0-9+.-]*:/i.test(v) || v.startsWith("//")) return "";   // block javascript:, data:, etc.
    return asset(v);
  }
  function dateLabel(d) {
    if (!d) return "";
    const ms = Date.parse(String(d).length <= 10 ? d + "T12:00:00+05:00" : d);
    return Number.isFinite(ms) ? pkt(ms, { day: "2-digit", month: "short", year: "numeric" }) : "";
  }
  function bodyHTML(text) {
    return String(text || "").trim().split(/\n{2,}/).filter(Boolean).map(p => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  }
  const ICON = {
    link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    file: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/></svg>',
    doc: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 13h6M10 17h6"/></svg>',
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6l-1 6 3 3H7l3-3z"/><path d="M12 13v7"/></svg>'
  };
  function updateCard(u, opts) {
    const cat = CATEGORY[u.category] ? u.category : "general";
    const link = safeUrl(u.link_url), file = safeUrl(u.attachment_url);
    const actions = [];
    if (u.slug === POSTPONEMENT_SLUG) actions.push(`<button type="button" class="kmr-update-action is-primary" data-kmr-open-notice>${ICON.doc}View original notice</button>`);
    if (link) actions.push(`<a class="kmr-update-action${actions.length ? "" : " is-primary"}" href="${esc(link)}"${/^https?:/i.test(u.link_url || "") ? ' target="_blank" rel="noopener noreferrer"' : ""}>${esc(u.link_label || "Read more")}${ICON.link}</a>`);
    if (file) actions.push(`<a class="kmr-update-action" href="${esc(file)}" download>${ICON.file}${esc(u.attachment_label || "Download")}</a>`);
    const body = opts.full && u.body ? `<div class="kmr-update-body">${bodyHTML(u.body)}</div>` : "";
    const anchor = u.slug ? ` id="${esc(String(u.slug).replace(/[^a-z0-9-]/gi, ""))}"` : "";
    return `<article class="kmr-update kmr-update--${cat}${u.is_pinned ? " is-pinned" : ""}${u.is_archived ? " is-archived" : ""}"${anchor}>
      <div class="kmr-update-meta"><span class="kmr-update-chip">${esc(CATEGORY[cat])}</span>${u.is_pinned && !u.is_archived ? `<span class="kmr-update-pin">${ICON.pin}Pinned</span>` : ""}${u.is_archived ? '<span class="kmr-update-archived">Earlier notice</span>' : ""}<time>${esc(dateLabel(u.published_on))}</time></div>
      <h3>${esc(u.title)}</h3>
      ${u.summary ? `<p class="kmr-update-summary">${esc(u.summary)}</p>` : ""}
      ${body}
      ${actions.length ? `<div class="kmr-update-actions">${actions.join("")}</div>` : ""}
    </article>`;
  }
  function sortUpdates(list) {
    return list.slice().sort((a, b) =>
      (b.is_pinned === true) - (a.is_pinned === true) ||
      String(b.published_on || "").localeCompare(String(a.published_on || "")) ||
      String(b.created_at || "").localeCompare(String(a.created_at || "")));
  }
  function renderUpdates() {
    document.querySelectorAll("[data-kmr-updates]").forEach(host => {
      const mode = host.dataset.kmrUpdates || "latest";
      const limit = Number(host.dataset.limit || 0) || Infinity;
      const full = host.hasAttribute("data-full");
      const list = sortUpdates(updates);
      let items;
      if (mode === "earlier") items = list.filter(u => u.is_archived);
      else if (mode === "current") items = list.filter(u => !u.is_archived);
      else items = list;
      items = items.slice(0, limit);
      host.innerHTML = items.length
        ? items.map(u => updateCard(u, { full })).join("")
        : `<p class="kmr-updates-empty">${mode === "earlier" ? "No earlier notices." : "No updates have been published yet."}</p>`;
      host.setAttribute("aria-busy", "false");
    });
    document.querySelectorAll("[data-kmr-updates-count]").forEach(n => {
      const which = n.dataset.kmrUpdatesCount;
      n.textContent = String(updates.filter(u => which === "earlier" ? u.is_archived : !u.is_archived).length);
    });
  }

  // ------------------------------------------------------------------ archived notice (13 Nov 2026)
  function noticePaperHTML(headingId) {
    const L = asset("assets/logo-left.png"), R = asset("assets/logo-right.png");
    return `
      <article class="pp-paper" aria-labelledby="${headingId}">
        <header class="pp-letterhead">
          <img src="${L}" alt="District Administration Nowshera emblem" width="92" height="92">
          <div class="pp-letterhead-text">
            <div class="pp-gov">GOVERNMENT OF KHYBER PAKHTUNKHWA</div>
            <div class="pp-dso">DISTRICT SPORTS OFFICE NOWSHERA</div>
            <div class="pp-dept">Directorate General of Sports, Khyber Pakhtunkhwa<br>in collaboration with District Administration Nowshera</div>
          </div>
          <img src="${R}" alt="Directorate General of Sports Khyber Pakhtunkhwa logo" width="92" height="92">
        </header>
        <div class="pp-refline"><span><b>Event:</b> Khawrai Marathon Race - Season Three</span><span><b>Dated:</b> ${esc(NOTICE.NOTICE_DATE || "13 November 2026")}</span></div>
        <div class="pp-title"><span id="${headingId}">NOTICE</span></div>
        <p class="pp-subject">Subject: Postponement of Khawrai Marathon Race - Season Three</p>
        <div class="pp-body">
          <p>It is hereby notified for the information of all registered participants, stakeholders and the general public that the <b>Khawrai Marathon Race (Season Three)</b>, arranged by the District Administration and the District Sports Office Nowshera at Khawrai, Tehsil Jehangira, and previously scheduled for ${esc(NOTICE.ORIGINAL_DATE || "15 November 2026")}, <b>has been postponed due to unavoidable circumstances</b>.</p>
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
  let overlay = null, lastFocus = null;
  function openNotice() {
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "pp-overlay";
      overlay.hidden = true;
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-labelledby", "kmrArchivedNoticeTitle");
      const pdf = asset(NOTICE.PDF_FILE || "assets/notice/KMR-S3-Postponement-Notice.pdf");
      overlay.innerHTML = `
        <div class="pp-dialog">
          <div class="pp-ribbon"><span class="pp-ribbon-live is-archived"><i aria-hidden="true"></i>EARLIER NOTICE · ${esc((NOTICE.NOTICE_DATE || "13 November 2026").toUpperCase())}</span>
            <button type="button" class="pp-close-x" data-pp-close aria-label="Close notice">×</button></div>
          <div class="pp-superseded" role="note"><strong>Superseded.</strong> The race has been rescheduled to <span data-kmr="race-weekday-date"></span> at <span data-kmr="race-time"></span> (PKT), at the same venue.</div>
          ${noticePaperHTML("kmrArchivedNoticeTitle")}
          <div class="pp-actions">
            <a class="pp-btn pp-btn-primary" href="${pdf}" download="KMR-S3-Postponement-Notice.pdf">${ICON.file}Download PDF notice</a>
            <button type="button" class="pp-btn pp-btn-light" data-pp-close>Close</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      applyFields(overlay);
      overlay.addEventListener("click", e => { if (e.target === overlay || e.target.closest("[data-pp-close]")) closeNotice(); });
      overlay.addEventListener("keydown", e => {
        if (e.key === "Escape") { e.preventDefault(); closeNotice(); return; }
        if (e.key !== "Tab") return;
        const f = [...overlay.querySelectorAll("a[href],button:not([disabled])")].filter(el => el.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      });
    }
    if (!overlay.hidden) return;
    lastFocus = document.activeElement;
    overlay.hidden = false;
    document.documentElement.classList.add("pp-lock");
    overlay.scrollTop = 0;
    requestAnimationFrame(() => { overlay.classList.add("is-open"); const b = overlay.querySelector(".pp-close-x"); if (b) b.focus({ preventScroll: true }); });
  }
  function closeNotice() {
    if (!overlay || overlay.hidden) return;
    overlay.classList.remove("is-open");
    document.documentElement.classList.remove("pp-lock");
    window.setTimeout(() => { overlay.hidden = true; }, 200);
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (_) {} }
  }
  document.addEventListener("click", e => {
    const t = e.target.closest && e.target.closest("[data-kmr-open-notice]");
    if (t) { e.preventDefault(); openNotice(); }
  });

  // ------------------------------------------------------------------ live data
  function applyState(next, fromServer) {
    state = Object.assign({}, DEFAULT_STATE, state, next || {});
    if (fromServer) store.set(STATE_KEY, state);
    if (window.KMRRegistration && typeof state.registration_open === "boolean") {
      window.KMRRegistration.setRemote(state.registration_open, state.registration_closes_at);
    }
    applyFields();
    renderCountdowns();
    try { window.dispatchEvent(new CustomEvent("kmr:site-state", { detail: state })); } catch (_) {}
  }
  async function refreshState() {
    if (!window.sb) return state;
    try {
      const { data, error } = await window.sb.rpc("public_site_state");
      if (!error && data && typeof data === "object") applyState(data, true);
    } catch (_) {}
    return state;
  }
  async function refreshUpdates() {
    if (!window.sb) return updates;
    try {
      const { data, error } = await window.sb.from("site_updates")
        .select("id,slug,category,title,summary,body,published_on,link_url,link_label,attachment_url,attachment_label,is_pinned,is_archived,created_at")
        .eq("is_published", true)
        .order("is_pinned", { ascending: false }).order("published_on", { ascending: false }).order("created_at", { ascending: false })
        .limit(100);
      if (!error && Array.isArray(data)) { updates = data; updatesSource = "server"; store.set(UPDATES_KEY, data); renderUpdates(); }
    } catch (_) {}
    return updates;
  }

  window.KMRSite = {
    state: () => Object.assign({}, state),
    defaults: () => Object.assign({}, DEFAULT_STATE),
    defaultUpdates: () => DEFAULT_UPDATES.map(u => Object.assign({}, u)),
    updates: () => updates.slice(),
    updatesSource: () => updatesSource,
    tickerText, applyFields, renderUpdates, refreshState, refreshUpdates,
    cardHTML: u => updateCard(u, { full: true }),
    applyState: next => applyState(next, true),
    format: { pkt, timeText, dateLabel },
    categories: Object.assign({}, CATEGORY),
    openArchivedNotice: openNotice, safeUrl, asset
  };

  function init() {
    applyFields();
    startCountdowns();
    renderUpdates();
    // Re-apply the cached registration value through the shared helper (first paint),
    // then load the live values.
    if (window.KMRRegistration && typeof state.registration_open === "boolean") window.KMRRegistration.setRemote(state.registration_open, state.registration_closes_at);
    refreshState();
    if (document.querySelector("[data-kmr-updates]")) refreshUpdates();
    window.addEventListener("kmr:registration-change", () => applyFields());
    document.addEventListener("visibilitychange", () => { if (!document.hidden) renderCountdowns(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
