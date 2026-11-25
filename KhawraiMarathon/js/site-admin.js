/* nsfida-only "Site updates" section on /admin/ (tab "Site updates", URL #updates).
 *  1. Race schedule  - date, start time, venue, reporting note, optional ticker text
 *  2. Registration   - open / close PUBLIC registration (admins can always register)
 *  3. Updates        - publish, edit, pin, move to "Earlier notices", hide or delete
 * Every write goes through RLS / SECURITY DEFINER RPCs that re-check nsfida
 * (migration 20261125_021). Hiding this section is not the access boundary.
 */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const S = { ready: false, owner: false, updates: [], editing: null, migrationMissing: false, busy: false };
  const CATS = [["schedule", "Race schedule"], ["announcement", "Announcement"], ["registration", "Registration"], ["notice", "Official notice"], ["results", "Results"], ["general", "General"]];
  const todayPKT = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const partsPKT = iso => {
    const d = new Date(iso);
    if (isNaN(d)) return { date: "", time: "" };
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
    return { date, time };
  };
  const friendlyError = err => {
    const m = String(err && (err.message || err.details) || err || "Unknown error");
    if (/does not exist|schema cache|Could not find/i.test(m)) return "The database has not been updated yet. Run sql/migrations/20261125_021_reschedule_close_registration_site_updates.sql in the Supabase SQL Editor, then reload this page.";
    if (/row-level security|permission denied|42501|Only nsfida/i.test(m)) return "Only nsfida can change site updates and race settings.";
    return m;
  };
  function note(id, text, kind) {
    const n = $(id); if (!n) return;
    n.textContent = text || ""; n.hidden = !text;
    n.className = "su-msg" + (kind ? " " + kind : "");
  }

  // ------------------------------------------------------------------ markup
  function build(host) {
    host.innerHTML = `
      <div class="section-heading"><div><h2>Site updates &amp; race settings</h2><p>nsfida only. Changes go live on every page for all visitors within a few seconds.</p></div></div>
      <p class="su-msg warn" id="suMigration" hidden></p>
      <div class="su-grid">
        <section class="su-card" aria-labelledby="suRaceTitle">
          <div class="su-card-head"><span class="su-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/></svg></span><div><h3 id="suRaceTitle">Race schedule</h3><p>Shown on Home, Event Info, Results, About, the top strip and the countdowns.</p></div></div>
          <form id="suRaceForm" class="su-form" novalidate>
            <div class="su-row2">
              <label>Race date<input type="date" id="suRaceDate" required></label>
              <label>Start time (PKT)<input type="time" id="suRaceTime" required step="300"></label>
            </div>
            <label>Venue<input type="text" id="suVenue" maxlength="160" required></label>
            <label>Reporting note <small>optional</small><input type="text" id="suReporting" maxlength="300" placeholder="e.g. Report at Railway Phatak by 03:00 PM"></label>
            <label>Top strip text <small>optional · leave blank for the automatic text</small><textarea id="suTicker" rows="2" maxlength="400"></textarea></label>
            <div class="su-preview" aria-live="polite"><small>TOP STRIP PREVIEW</small><span id="suTickerPreview"></span></div>
            <p class="su-msg" id="suRaceMsg" hidden></p>
            <div class="su-actions"><span class="su-meta" id="suRaceMeta"></span><button class="btn" type="submit" id="suRaceSave">Save race schedule</button></div>
          </form>
        </section>

        <section class="su-card" aria-labelledby="suRegTitle">
          <div class="su-card-head"><span class="su-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7"/></svg></span><div><h3 id="suRegTitle">Public registration</h3><p>When closed, visitors see a “Registration Closed” tag. Admins can still add runners.</p></div></div>
          <div class="su-reg-state" id="suRegState" data-state="closed"><span class="su-dot" aria-hidden="true"></span><div><strong id="suRegLabel">Closed</strong><small id="suRegSub">Public visitors cannot register.</small></div></div>
          <div class="su-reg-open" id="suRegOpenBox">
            <label>Reopen until <small>optional · blank = until further notice</small><input type="datetime-local" id="suRegUntil"></label>
            <button class="btn" type="button" id="suRegOpen">Reopen registration</button>
          </div>
          <div class="su-reg-close" id="suRegCloseBox" hidden><button class="btn danger" type="button" id="suRegClose">Close registration now</button></div>
          <p class="su-msg" id="suRegMsg" hidden></p>
        </section>
      </div>

      <section class="su-card su-updates" aria-labelledby="suUpdTitle">
        <div class="su-card-head su-card-head-row">
          <span class="su-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 11v2a1 1 0 0 0 1 1h2l5 4V6L7 10H5a1 1 0 0 0-1 1z"/><path d="M16 9a3.5 3.5 0 0 1 0 6M18.5 6.5a7 7 0 0 1 0 11"/></svg></span>
          <div><h3 id="suUpdTitle">Updates &amp; notices</h3><p>Published on the Home page and the Updates page. Pinned items appear first; “Earlier” items are listed under Earlier notices.</p></div>
          <button class="btn" type="button" id="suNew">+ New update</button>
        </div>
        <div class="su-filter" role="group" aria-label="Filter updates">
          <button type="button" data-f="all" aria-pressed="true">All</button><button type="button" data-f="current" aria-pressed="false">Current</button><button type="button" data-f="earlier" aria-pressed="false">Earlier</button><button type="button" data-f="draft" aria-pressed="false">Hidden</button>
        </div>
        <p class="su-msg" id="suUpdMsg" hidden></p>
        <ul class="su-list" id="suList" aria-live="polite"></ul>
      </section>

      <dialog class="su-dialog" id="suDialog">
        <form id="suForm" method="dialog" novalidate>
          <div class="su-dialog-head"><div><span class="eyebrow">SITE UPDATE</span><h2 id="suFormTitle">New update</h2></div><button type="button" class="su-x" data-su-close aria-label="Close">×</button></div>
          <div class="su-dialog-body">
            <label>Title<input id="suTitle" maxlength="160" required placeholder="e.g. Race-day kit collection"></label>
            <div class="su-row2">
              <label>Category<select id="suCategory">${CATS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></label>
              <label>Date<input type="date" id="suDate" required></label>
            </div>
            <label>Summary <small>shown on cards · up to 500 characters</small><textarea id="suSummary" rows="3" maxlength="500"></textarea></label>
            <label>Details <small>optional · shown on the Updates page · blank line = new paragraph</small><textarea id="suBody" rows="5" maxlength="6000"></textarea></label>
            <div class="su-row2">
              <label>Button link <small>optional</small><input id="suLink" maxlength="500" placeholder="event-info/ or https://…"></label>
              <label>Button text<input id="suLinkLabel" maxlength="60" placeholder="Read more"></label>
            </div>
            <div class="su-row2">
              <label>Download file link <small>optional</small><input id="suFile" maxlength="500" placeholder="assets/notice/file.pdf or https://…"></label>
              <label>Download text<input id="suFileLabel" maxlength="60" placeholder="Download PDF"></label>
            </div>
            <div class="su-checks">
              <label class="su-check"><input type="checkbox" id="suPinned"><span><strong>Pin to top</strong><small>Shown first everywhere</small></span></label>
              <label class="su-check"><input type="checkbox" id="suArchived"><span><strong>Earlier notice</strong><small>Move to the archive section</small></span></label>
              <label class="su-check"><input type="checkbox" id="suPublished" checked><span><strong>Published</strong><small>Untick to hide from visitors</small></span></label>
            </div>
            <div class="su-form-preview"><small>PREVIEW</small><div id="suPreview"></div></div>
            <p class="su-msg bad" id="suFormMsg" hidden></p>
          </div>
          <div class="su-dialog-foot"><button type="button" class="btn ghost" data-su-close>Cancel</button><button type="submit" class="btn" id="suSave">Publish update</button></div>
        </form>
      </dialog>`;
    wire();
  }

  // ------------------------------------------------------------------ race schedule
  function fillRace(st) {
    const p = partsPKT(st.race_at);
    $("suRaceDate").value = p.date; $("suRaceTime").value = p.time;
    $("suVenue").value = st.venue || "";
    $("suReporting").value = st.reporting_note || "";
    $("suTicker").value = st.ticker_text || "";
    $("suRaceMeta").textContent = st.settings_updated_at ? "Last saved " + window.KMRSite.format.dateLabel(st.settings_updated_at) : "";
    previewTicker();
    fillRegistration(st);
  }
  function draftRaceIso() {
    const d = $("suRaceDate").value, t = $("suRaceTime").value;
    return d && t ? `${d}T${t}:00+05:00` : "";
  }
  function previewTicker() {
    const custom = $("suTicker").value.trim();
    if (custom) { $("suTickerPreview").textContent = custom.toUpperCase(); return; }
    const iso = draftRaceIso(), st = window.KMRSite.state();
    const ms = Date.parse(iso || st.race_at);
    const f = window.KMRSite.format;
    const open = window.KMRRegistration && window.KMRRegistration.isOpen();
    $("suTickerPreview").textContent = Number.isFinite(ms)
      ? `NEW RACE DATE: KHAWRAI MARATHON RACE SEASON THREE · ${f.pkt(ms, { weekday: "long" }).toUpperCase()}, ${f.pkt(ms, { day: "2-digit", month: "long", year: "numeric" }).toUpperCase()} · ${f.timeText(ms)} (PKT) · SAME VENUE: ${($("suVenue").value || st.venue).toUpperCase()} · ${open ? "ONLINE REGISTRATION IS OPEN" : "ONLINE REGISTRATION IS CLOSED · REGISTERED RUNNERS KEEP THEIR ENTRIES"}`
      : "";
  }
  async function saveRace(e) {
    e.preventDefault();
    const iso = draftRaceIso(), venue = $("suVenue").value.trim();
    if (!iso) return note("suRaceMsg", "Choose the race date and start time.", "bad");
    if (venue.length < 3) return note("suRaceMsg", "Enter the venue.", "bad");
    const pretty = $("suRaceDate").value.split("-").reverse().join("-") + " at " + $("suRaceTime").value + " PKT";
    if (!confirm(`Save the race schedule?\n\nRace start: ${pretty}\nVenue: ${venue}\n\nEvery page and countdown will show this immediately. If the race has not started, the Results page start time is moved too.`)) return;
    const btn = $("suRaceSave"); btn.disabled = true; note("suRaceMsg", "Saving…");
    try {
      const { data, error } = await sb.rpc("owner_save_site_settings", {
        p_race_at: iso, p_venue: venue, p_reporting_note: $("suReporting").value.trim(), p_ticker_text: $("suTicker").value.trim()
      });
      if (error) throw error;
      window.KMRSite.applyState(data); fillRace(window.KMRSite.state());
      note("suRaceMsg", "Race schedule saved and published.", "ok");
      toast("Race schedule saved.");
    } catch (err) { note("suRaceMsg", friendlyError(err), "bad"); }
    finally { btn.disabled = false; }
  }

  // ------------------------------------------------------------------ registration
  function fillRegistration(st) {
    const open = st.registration_open === true;
    $("suRegState").dataset.state = open ? "open" : "closed";
    $("suRegLabel").textContent = open ? "Open" : "Closed";
    $("suRegSub").textContent = open
      ? (st.registration_closes_at ? "Closes automatically on " + window.KMRSite.format.pkt(Date.parse(st.registration_closes_at), { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }) + " PKT." : "Open until further notice.")
      : "Public visitors cannot register. Admins can still add runners.";
    $("suRegOpenBox").hidden = open; $("suRegCloseBox").hidden = !open;
  }
  async function setRegistration(open) {
    let closesAt = null;
    if (open) {
      const v = $("suRegUntil").value;
      if (v) {
        closesAt = v.length === 16 ? `${v}:00+05:00` : `${v}+05:00`;
        if (Date.parse(closesAt) <= Date.now()) return note("suRegMsg", "The closing time must be in the future (Pakistan Time).", "bad");
      }
      if (!confirm(`Reopen public registration${closesAt ? " until " + v.replace("T", " ") + " PKT" : " until further notice"}?\n\nThe Register button returns for every visitor.`)) return;
    } else if (!confirm("Close public registration now?\n\nVisitors will see “Registration Closed”. Existing registrations are not changed and admins can still add runners.")) return;
    const btn = $(open ? "suRegOpen" : "suRegClose"); btn.disabled = true; note("suRegMsg", "Saving…");
    try {
      const { data, error } = await sb.rpc("owner_set_registration", { p_open: open, p_closes_at: closesAt });
      if (error) throw error;
      window.KMRSite.applyState(data); fillRegistration(window.KMRSite.state()); previewTicker();
      note("suRegMsg", open ? "Public registration reopened." : "Public registration closed.", "ok");
      toast(open ? "Registration reopened." : "Registration closed.");
    } catch (err) { note("suRegMsg", friendlyError(err), "bad"); }
    finally { btn.disabled = false; }
  }

  // ------------------------------------------------------------------ updates list
  let filter = "all";
  async function loadUpdates() {
    note("suUpdMsg", "Loading updates…");
    try {
      const { data, error } = await sb.from("site_updates").select("*")
        .order("is_pinned", { ascending: false }).order("published_on", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      S.updates = data || []; S.migrationMissing = false;
      note("suUpdMsg", "");
    } catch (err) {
      S.updates = [];
      const msg = friendlyError(err);
      S.migrationMissing = /has not been updated/.test(msg);
      note("suUpdMsg", msg, "bad");
    }
    const warn = $("suMigration");
    warn.hidden = !S.migrationMissing;
    warn.textContent = S.migrationMissing ? "Database update needed: run sql/migrations/20261125_021_reschedule_close_registration_site_updates.sql in the Supabase SQL Editor (then sql/verify_site_updates.sql). Until then the website shows the built-in defaults and nothing here can be saved." : "";
    drawList();
  }
  function drawList() {
    const list = $("suList");
    const items = S.updates.filter(u => filter === "all" || (filter === "current" && !u.is_archived && u.is_published) || (filter === "earlier" && u.is_archived) || (filter === "draft" && !u.is_published));
    if (!items.length) { list.innerHTML = `<li class="su-empty">${S.migrationMissing ? "Updates will appear here after the database update." : "Nothing here yet."}</li>`; return; }
    const cat = Object.fromEntries(CATS);
    list.innerHTML = items.map(u => `
      <li class="su-item${u.is_published ? "" : " is-draft"}${u.is_archived ? " is-archived" : ""}" data-id="${esc(u.id)}">
        <div class="su-item-main">
          <div class="su-item-tags"><span class="su-tag">${esc(cat[u.category] || "General")}</span>${u.is_pinned ? '<span class="su-tag pin">Pinned</span>' : ""}${u.is_archived ? '<span class="su-tag old">Earlier</span>' : ""}${u.is_published ? "" : '<span class="su-tag hidden-tag">Hidden</span>'}<time>${esc(window.KMRSite.format.dateLabel(u.published_on))}</time></div>
          <strong>${esc(u.title)}</strong>
          ${u.summary ? `<p>${esc(u.summary)}</p>` : ""}
        </div>
        <div class="su-item-actions">
          <button type="button" class="btn sm" data-act="edit">Edit</button>
          <button type="button" class="btn sm ghost" data-act="pin">${u.is_pinned ? "Unpin" : "Pin"}</button>
          <button type="button" class="btn sm ghost" data-act="archive">${u.is_archived ? "Move to current" : "Move to earlier"}</button>
          <button type="button" class="btn sm ghost" data-act="publish">${u.is_published ? "Hide" : "Publish"}</button>
          <button type="button" class="btn sm ghost danger-text" data-act="delete">Delete</button>
        </div>
      </li>`).join("");
  }
  async function quick(id, act) {
    const u = S.updates.find(x => x.id === id); if (!u) return;
    if (act === "edit") return openEditor(u);
    if (act === "delete") {
      if (!confirm(`Delete this update permanently?\n\n“${u.title}”\n\nTip: use “Hide” instead to keep it for later.`)) return;
      const { error } = await sb.from("site_updates").delete().eq("id", id);
      if (error) return note("suUpdMsg", friendlyError(error), "bad");
      toast("Update deleted.");
    } else {
      const patch = act === "pin" ? { is_pinned: !u.is_pinned } : act === "archive" ? { is_archived: !u.is_archived, is_pinned: u.is_archived ? u.is_pinned : false } : { is_published: !u.is_published };
      const { error } = await sb.from("site_updates").update(patch).eq("id", id);
      if (error) return note("suUpdMsg", friendlyError(error), "bad");
      toast("Update saved.");
    }
    await afterChange();
  }
  async function afterChange() {
    await loadUpdates();
    if (window.KMRSite) window.KMRSite.refreshUpdates();
  }

  // ------------------------------------------------------------------ editor
  function readForm() {
    return {
      title: $("suTitle").value.trim(), category: $("suCategory").value, published_on: $("suDate").value || todayPKT(),
      summary: $("suSummary").value.trim() || null, body: $("suBody").value.trim() || null,
      link_url: $("suLink").value.trim() || null, link_label: $("suLinkLabel").value.trim() || null,
      attachment_url: $("suFile").value.trim() || null, attachment_label: $("suFileLabel").value.trim() || null,
      is_pinned: $("suPinned").checked, is_archived: $("suArchived").checked, is_published: $("suPublished").checked
    };
  }
  function preview() {
    const u = readForm();
    $("suPreview").innerHTML = window.KMRSite.cardHTML(Object.assign({ title: u.title || "Title", slug: "" }, u));
  }
  function openEditor(u) {
    S.editing = u || null;
    $("suFormTitle").textContent = u ? "Edit update" : "New update";
    $("suSave").textContent = u ? "Save changes" : "Publish update";
    $("suTitle").value = u ? u.title : ""; $("suCategory").value = u ? u.category : "announcement";
    $("suDate").value = u ? u.published_on : todayPKT();
    $("suSummary").value = u && u.summary || ""; $("suBody").value = u && u.body || "";
    $("suLink").value = u && u.link_url || ""; $("suLinkLabel").value = u && u.link_label || "";
    $("suFile").value = u && u.attachment_url || ""; $("suFileLabel").value = u && u.attachment_label || "";
    $("suPinned").checked = !!(u && u.is_pinned); $("suArchived").checked = !!(u && u.is_archived);
    $("suPublished").checked = u ? !!u.is_published : true;
    note("suFormMsg", "");
    preview();
    const d = $("suDialog"); if (!d.open) d.showModal();
    setTimeout(() => $("suTitle").focus(), 30);
  }
  const badUrl = v => v && (/^\s*(javascript|data|vbscript|file):/i.test(v) || v.length > 500);
  async function saveEditor(e) {
    e.preventDefault();
    const u = readForm();
    if (u.title.length < 3) return note("suFormMsg", "Enter a title (at least 3 characters).", "bad");
    if (!u.summary && !u.body) return note("suFormMsg", "Write a short summary or some details.", "bad");
    if (badUrl(u.link_url) || badUrl(u.attachment_url)) return note("suFormMsg", "Links must be a page of this site (e.g. event-info/) or start with https://", "bad");
    if (u.is_archived) u.is_pinned = false;
    const btn = $("suSave"); btn.disabled = true;
    try {
      const q = S.editing ? sb.from("site_updates").update(u).eq("id", S.editing.id) : sb.from("site_updates").insert(u);
      const { error } = await q;
      if (error) throw error;
      $("suDialog").close();
      toast(S.editing ? "Update saved." : (u.is_published ? "Update published." : "Update saved as hidden."));
      await afterChange();
    } catch (err) { note("suFormMsg", friendlyError(err), "bad"); }
    finally { btn.disabled = false; }
  }

  // ------------------------------------------------------------------ wiring
  function wire() {
    $("suRaceForm").addEventListener("submit", saveRace);
    ["suRaceDate", "suRaceTime", "suVenue", "suTicker"].forEach(id => $(id).addEventListener("input", previewTicker));
    $("suRegOpen").addEventListener("click", () => setRegistration(true));
    $("suRegClose").addEventListener("click", () => setRegistration(false));
    $("suNew").addEventListener("click", () => openEditor(null));
    $("suList").addEventListener("click", e => {
      const b = e.target.closest("button[data-act]"); if (!b) return;
      const li = b.closest("[data-id]"); b.disabled = true;
      quick(li.dataset.id, b.dataset.act).finally(() => { b.disabled = false; });
    });
    document.querySelectorAll(".su-filter button").forEach(b => b.addEventListener("click", () => {
      filter = b.dataset.f;
      document.querySelectorAll(".su-filter button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
      drawList();
    }));
    $("suForm").addEventListener("submit", saveEditor);
    $("suForm").addEventListener("input", preview);
    $("suForm").addEventListener("change", preview);
    $("suDialog").querySelectorAll("[data-su-close]").forEach(b => b.addEventListener("click", () => $("suDialog").close()));
    $("suDialog").addEventListener("click", e => { if (e.target === $("suDialog")) $("suDialog").close(); });
  }

  // ------------------------------------------------------------------ public API (used by admin/index.html)
  window.KMRSiteAdmin = {
    async init(host) {
      if (!host || !window.KMRSite) return;
      if (!S.ready) { build(host); S.ready = true; }
      fillRace(window.KMRSite.state());
      const st = await window.KMRSite.refreshState();
      fillRace(st);
      await loadUpdates();
    }
  };
})();
