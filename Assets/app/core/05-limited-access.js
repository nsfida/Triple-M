/* Triplem VIP · Grace period and limited access after a free trial or plan ends (2026-11-11)
 *
 * Lifecycle (server: migration 224, app_user_access_flags):
 *   trial / plan  -> full access
 *   grace period  -> 3 days, full access, the end date is announced
 *   limited access-> account stays active; everything can be viewed and downloaded; no new
 *                    entries, changes or deletions in any section until a plan is approved.
 *
 * The database refuses every write of a limited account (statement triggers), so this file
 * only explains the state well: a banner text helper, a detailed notice dialog shown once per
 * day, a notice whenever the server refuses a change, and a guard that stops offline queueing
 * (a change that the server will refuse must not wait in an offline queue).
 */
(function () {
  "use strict";

  const SEEN_KEY = "triplem.accessNotice.v1";

  function esc(v) {
    return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function when(v, withTime = true) {
    const d = v ? new Date(v) : null;
    if (!d || isNaN(d)) return "";
    return d.toLocaleString(undefined, withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" });
  }
  function flags() {
    try {
      if (typeof isGuestMode === "function" && isGuestMode()) return null;
      if (typeof state === "undefined" || !state.unlocked || !state.sessionUser || state.sessionUser.is_protected === true) return null;
      return typeof getUserAccessFlags === "function" ? getUserAccessFlags(state.sessionUser) : null;
    } catch (_) { return null; }
  }
  function phase(f = flags()) {
    if (!f || f.payment_approval_pending) return "";
    if (f.read_only) return "limited";
    if (f.period_expired && f.grace_active) return "grace";
    return "";
  }
  function graceEnd(f) {
    if (f.grace_ends_at) return f.grace_ends_at;
    const t = f.trial_expires_at ? new Date(f.trial_expires_at).getTime() : NaN;
    return Number.isFinite(t) ? new Date(t + 3 * 86400000).toISOString() : null;
  }
  function noun(f) { return f.is_trial ? "free trial" : "plan"; }

  // Short text for the banner at the top of the workspace.
  function bannerText(f = flags()) {
    const p = phase(f);
    if (p === "grace") {
      return {
        kind: "grace",
        title: f.is_trial ? "Your free trial has ended · grace period" : "Your plan has ended · grace period",
        message: `Your ${noun(f)} ended on ${when(f.trial_expires_at)}. You have full access until ${when(graceEnd(f))}. After that, new entries are paused (limited access): you can still sign in, view and download all your records, but you cannot add or change entries until a Pro plan is approved. Your data is never deleted.`
      };
    }
    if (p === "limited") {
      return {
        kind: "limited",
        title: "Limited access · new entries are paused",
        message: `Your ${noun(f)} ended on ${when(f.trial_expires_at, false)} and the grace period ended on ${when(graceEnd(f), false)}. Your account stays active: view, search and download every record, report, PDF, CSV file, receipt, invoice, document and backup. Adding, editing or deleting entries resumes as soon as a Pro plan is approved.`
      };
    }
    return null;
  }

  function dialogHtml(f, reason) {
    const p = phase(f) || "limited";
    const grace = p === "grace";
    const ended = when(f.trial_expires_at);
    const gEnd = when(graceEnd(f));
    const title = grace
      ? (f.is_trial ? "Your free trial has ended" : "Your plan has ended")
      : "Limited access: new entries are paused";
    const intro = grace
      ? `Your ${noun(f)} ended on <strong>${esc(ended)}</strong>. You keep <strong>full access during a 3-day grace period, until ${esc(gEnd)}</strong>. Choose a plan before then to continue without interruption.`
      : `Your ${noun(f)} ended on <strong>${esc(ended)}</strong> and the grace period ended on <strong>${esc(gEnd)}</strong>. Your account remains active and <strong>all of your data is kept safe</strong>. Until a Pro plan is approved, the account is in limited access.`;
    const refusal = reason === "refused"
      ? `<p class="la-refused" role="alert"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> This change was not saved because new entries are paused on this account.</p>`
      : reason === "offline"
        ? `<p class="la-refused" role="alert"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> This change was not saved or queued for offline sync because new entries are paused on this account.</p>`
        : "";
    const can = ["Sign in on all your devices, as usual",
      "View, search and filter every record in every section",
      "Open and download reports, PDFs, CSV and Excel exports, receipts, invoices and documents",
      "Download account backups and attachments",
      "Use Account Settings, security, notifications and Live Support",
      "Choose a plan in Plan & Subscription"];
    const paused = ["Adding new entries in any section (expenses, wallets, inventory, sales, purchases, loans, installments, assets, notes, accounting and others)",
      "Editing or deleting existing entries",
      "Imports, restoring a backup into the account, uploading new attachments, offline entries and AI drafts"];
    const lists = grace
      ? `<div class="la-cols"><section><h4><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Until ${esc(gEnd)}</h4><ul><li>Everything works as before: add, edit, import and export</li><li>Your records, settings and team stay as they are</li></ul></section>
         <section><h4><i class="fa-solid fa-hourglass-end" aria-hidden="true"></i> After ${esc(gEnd)}, without a plan</h4><ul><li>You can still sign in, view and download everything</li><li>New entries, changes and deletions are paused</li><li>Nothing is deleted, and the account is not switched off</li></ul></section></div>`
      : `<div class="la-cols"><section><h4><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Still available</h4><ul>${can.map(x => `<li>${esc(x)}</li>`).join("")}</ul></section>
         <section><h4><i class="fa-solid fa-circle-pause" aria-hidden="true"></i> Paused until a plan is approved</h4><ul>${paused.map(x => `<li>${esc(x)}</li>`).join("")}</ul></section></div>`;
    return `<div class="modal-backdrop" data-la-close></div>
      <div class="modal-dialog la-dialog la-${p}" role="dialog" aria-modal="true" aria-labelledby="laTitle" tabindex="-1">
        <div class="modal-head">
          <div><span class="la-kicker"><i class="fa-solid ${grace ? "fa-hourglass-half" : "fa-lock"}" aria-hidden="true"></i> Account access</span><h3 id="laTitle">${esc(title)}</h3></div>
          <button type="button" class="icon-btn ghost" data-la-close aria-label="Close">×</button>
        </div>
        <div class="modal-body la-body">
          ${refusal}
          <p class="la-intro">${intro}</p>
          ${lists}
          <p class="la-restore"><i class="fa-solid fa-rotate" aria-hidden="true"></i> <span><strong>Restoring full access:</strong> choose Pro Monthly or Pro Yearly in Plan &amp; Subscription and send the bank transfer. Full access returns as soon as the payment is approved; every record is exactly where you left it.</span></p>
          <p class="la-links"><button type="button" class="signup-terms-link" data-open-terms="trial">Free Trial Terms</button> · <button type="button" class="signup-terms-link" data-open-terms="terms">Terms and Conditions</button></p>
        </div>
        <div class="modal-footer"><button type="button" class="btn ghost" data-la-close>Not now</button><button type="button" class="btn primary" data-la-plan><i class="fa-solid fa-crown" aria-hidden="true"></i> Choose a plan</button></div>
      </div>`;
  }

  let lastFocus = null;
  function close() {
    const m = document.getElementById("limitedAccessModal");
    if (!m) return;
    m.classList.add("hide"); m.setAttribute("aria-hidden", "true"); m.innerHTML = "";
    window.removeEventListener("keydown", onKey, true);
    try { if (lastFocus && document.contains(lastFocus)) lastFocus.focus(); } catch (_) {}
  }
  function onKey(e) {
    if (e.key !== "Escape") return;
    // The terms overlay may be open on top: it closes first.
    const t = document.getElementById("trialTermsOverlay");
    if (t && !t.classList.contains("hide")) return;
    e.preventDefault(); e.stopImmediatePropagation(); close();
  }
  function open(reason = "") {
    const f = flags();
    if (!f || (!phase(f) && reason !== "refused" && reason !== "offline")) return false;
    let m = document.getElementById("limitedAccessModal");
    if (!m) {
      m = document.createElement("div");
      m.id = "limitedAccessModal";
      m.className = "modal hide limited-access-modal";
      document.body.appendChild(m);
      m.addEventListener("click", e => {
        if (e.target.closest("[data-la-close]")) close();
        else if (e.target.closest("[data-la-plan]")) {
          close();
          try { if (typeof openPlanSubscriptionModal === "function") openPlanSubscriptionModal(); } catch (_) {}
        }
      });
    }
    lastFocus = document.activeElement;
    m.innerHTML = dialogHtml(f, reason);
    m.classList.remove("hide"); m.setAttribute("aria-hidden", "false");
    window.addEventListener("keydown", onKey, true);
    requestAnimationFrame(() => m.querySelector(".la-dialog")?.focus());
    return true;
  }

  // Once per day and phase, after sign-in.
  function maybeShow() {
    const p = phase();
    if (!p) return;
    const key = `${state.sessionUser?.id || ""}:${p}:${new Date().toISOString().slice(0, 10)}`;
    try { if (localStorage.getItem(SEEN_KEY) === key) return; localStorage.setItem(SEEN_KEY, key); } catch (_) {}
    setTimeout(() => open(""), 900);
  }

  function apply() {
    const p = phase();
    document.documentElement.classList.toggle("triplem-limited-access", p === "limited");
    document.documentElement.classList.toggle("triplem-grace-period", p === "grace");
  }

  let lastRefusal = 0;
  function onRefused() {
    // Re-read the account state (the server decided), then explain once per few seconds.
    if (Date.now() - lastRefusal < 4000) return;
    lastRefusal = Date.now();
    try { if (state.sessionUser) state.sessionUser.read_only = true; } catch (_) {}
    apply();
    try { if (typeof updateAccessBanner === "function") updateAccessBanner(); } catch (_) {}
    open("refused");
  }
  function isRefusal(error) {
    const d = error && error.responseData;
    return !!(error && (error.isLimitedAccess || (d && d.hint === "TRIPLEM_LIMITED_ACCESS") || /^Limited access:/.test(String(error.message || ""))));
  }
  // Offline queues ask before they keep a change for later.
  function blocksWrites() { return phase() === "limited"; }
  function refuseOffline() { open("offline"); return true; }

  document.addEventListener("click", e => {
    const t = e.target && e.target.closest ? e.target : null;
    if (!t) return;
    if (t.closest("[data-banner-plan]")) {
      e.preventDefault();
      try { if (typeof openPlanSubscriptionModal === "function") openPlanSubscriptionModal(); } catch (_) {}
    } else if (t.closest("[data-banner-details]")) {
      e.preventDefault();
      if (!open("")) window.TriplemTerms?.open?.("trial");
    }
  });

  window.TriplemLimitedAccess = Object.freeze({ phase, bannerText, open, close, maybeShow, apply, onRefused, isRefusal, blocksWrites, refuseOffline });
})();
