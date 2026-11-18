/* Triplem VIP · Side panels for every overlay (2026-11-14)
 *
 * The Admin user panel (admin/04-admin-user-manager.js) set the look: one surface that slides in
 * from the right, a calm header with the section icon, small section labels, regular text and
 * pill buttons. This file gives every overlay of Admin, Loans, Installments, Assets /
 * Depreciation and Notes the same panel.
 *
 * Nothing about how an overlay works changes: the same element, fields, buttons and save code
 * are used. When one of these overlays opens, it is marked "tm-sheet" (and "tm-sheet-wide" for
 * no longer used: every panel has the same size), and the stylesheet draws it as a side panel. Short
 * confirmations ("Delete this?") and reminders that pop up stay small dialogs in the middle.
 *
 * It also adds the extra actions these panels were missing (loan reminders, record payment,
 * note sharing and more); see the bottom of the file.
 */
(function initTriplemSideSheets(global){
  "use strict";

  // Overlays of these sections, by element id. Value: "wide" for charts / tables, "" otherwise.
  const SHEETS = {
    // Loans (also the forms Installments use)
    entryModal: "", editModal: "", sectionDetailsModal: "wide", loanTransactionDetailModal: "", loanPdfSelectionModal: "",
    // Installments
    installmentPlanModal: "wide", installmentEditModal: "",
    // Assets / Depreciation
    assetFormModal: "", assetDetailModal: "wide", assetTxModal: "", assetSaleModal: "",
    depAssetFormModal: "", depAssetDetailModal: "wide", depAssetDisposeModal: "", depAssetReportModal: "wide",
    // Notes
    noteCreateModal: "", noteReminderModal: "", noteDetailModal: "",
    // Admin (created by the admin pages when first opened)
    adminCreateUserModal: "", adminEditUserModal: "", adminRawDataModal: "wide", subscriptionReviewModal: "",
    adminTeamOverlayModal: "", adminStorageModal: "wide", adminAnalyticsModal: "wide", adminPhotoCompressModal: "wide",
    adminPasswordRecoveryModal: "", adminManagePlanModal: "", adminLiveChatAgentsModal: "wide", adminLiveChatRecordsModal: "wide",
    adminLiveChatTranscriptModal: "", adminReceiptViewerModal: "wide", adminUserDetailsModal: "",
    // Account menu (2026-11-17): settings, security, team, plan, backup — and the dialogs they open
    accountSettingsModal: "", accountSecurityCenterModal: "", companyTeamModal: "wide", planSubscriptionModal: "",
    userBackupModal: "", taxSettingsModal: "", defaultStartPageModal: "", userHelpSupportModal: "",
    accountProfileEditModal: "", accountCompanyEditModal: "", accountPasswordChangeModal: "", accountAiIntegrationModal: "",
    // Sign-up and subscription notices (2026-11-17)
    trialSignupModal: "", subscriptionNotificationModal: ""
  };
  // Account dialogs show their own icon in the header (Font Awesome) instead of a section icon.
  const ICONS = {
    accountSettingsModal: "fa-solid fa-user-gear", accountSecurityCenterModal: "fa-solid fa-shield-halved",
    companyTeamModal: "fa-solid fa-users", planSubscriptionModal: "fa-solid fa-crown", userBackupModal: "fa-solid fa-box-archive",
    taxSettingsModal: "fa-solid fa-percent", defaultStartPageModal: "fa-solid fa-house-chimney", userHelpSupportModal: "fa-solid fa-circle-question",
    accountProfileEditModal: "fa-solid fa-id-card", accountCompanyEditModal: "fa-solid fa-building", accountPasswordChangeModal: "fa-solid fa-key",
    accountAiIntegrationModal: "fa-solid fa-wand-magic-sparkles",
    trialSignupModal: "fa-solid fa-user-plus", subscriptionNotificationModal: "fa-solid fa-receipt"
  };
  // Every other "account settings" dialog (they share one class) becomes a panel too.
  const ACCOUNT_CHILD = ".account-settings-child-modal";
  // Sections whose other overlays (made on the fly, without a fixed id) also become panels.
  const SECTION_KEYS = new Set(["given", "received", "taken", "returned", "loans", "installments", "assets", "notes", "admin"]);
  // Never panels: confirmations, alerts, the test-account notice, Expenses' own overlays.
  // (Account settings and its dialogs became panels on 2026-11-17; short security prompts —
  // "enter your password", recovery approval — stay small dialogs in the middle.)
  const KEEP_CENTERED = ".app-confirm-modal, #reminderAlertModal, .tm-test-notice, #expenseModal, #transferModal, #expenseAccountDetailsModal, #walletLogoPickerModal, #sectionShortcutsModal, #adminSecurityKeyModal, .account-security-password-prompt, .trusted-recovery-incoming-modal";
  const WIDE_HINT = /raw|analytics|storage|records|report|receipt|photo|detail-dialog|charts?/i;

  const SECTION_OF_MODAL = {
    installmentPlanModal: "installments", installmentEditModal: "installments",
    assetFormModal: "assets", assetDetailModal: "assets", assetTxModal: "assets", assetSaleModal: "assets",
    depAssetFormModal: "assets", depAssetDetailModal: "assets", depAssetDisposeModal: "assets", depAssetReportModal: "assets",
    noteCreateModal: "notes", noteReminderModal: "notes", noteDetailModal: "notes"
  };

  function currentSection(){
    const s = String(document.body?.dataset?.workspaceSection || "").toLowerCase();
    if (s) return s;
    return String(document.querySelector(".panel.active")?.id || "").replace(/Panel$/, "").toLowerCase();
  }
  function sectionFor(modal){
    if (SECTION_OF_MODAL[modal.id]) return SECTION_OF_MODAL[modal.id];
    if (/^admin|subscriptionReview/.test(modal.id)) return "admin";
    const s = currentSection();
    if (["given", "received"].includes(s)) return "loans";
    if (["taken", "returned"].includes(s)) return "loans";
    return s || "home";
  }
  function wants(modal){
    if (!modal?.classList?.contains("modal") || modal.matches(KEEP_CENTERED)) return null;
    if (Object.prototype.hasOwnProperty.call(SHEETS, modal.id)) return SHEETS[modal.id];
    if (modal.matches(ACCOUNT_CHILD) && modal.querySelector(":scope > .modal-dialog")) return "";
    if (SECTION_KEYS.has(currentSection()) && modal.querySelector(":scope > .modal-dialog")) {
      // A small yes/no prompt stays a dialog; anything with a form or a body becomes a panel.
      const dialog = modal.querySelector(":scope > .modal-dialog");
      if (/confirm|prompt|alert/i.test(dialog.className) || !dialog.querySelector(".modal-body, form, .settings-sheet-body")) return null;
      return WIDE_HINT.test(dialog.className + " " + modal.id) ? "wide" : "";
    }
    return null;
  }

  function iconUrl(section){
    // Absolute address: a url() inside a CSS variable is otherwise read relative to the stylesheet.
    try { if (typeof workspaceNavIconUrl === "function") return new URL(workspaceNavIconUrl(section), document.baseURI).href; } catch (_) {}
    return "";
  }

  function decorate(modal){
    const size = wants(modal);
    if (size === null) { modal.classList.remove("tm-sheet", "tm-sheet-wide"); return; }
    modal.classList.add("tm-sheet");
    modal.classList.remove("tm-sheet-wide"); // 2026-11-14 b: every panel has the same size
    document.documentElement.classList.add("tm-sheet-open");
    // Section icon in the header, like the user panel's picture.
    const head = modal.querySelector(":scope > .modal-dialog .modal-head, :scope > .modal-dialog .settings-sheet-head, :scope > .modal-dialog > form > .modal-head, :scope > .modal-dialog > .tvb-head");
    const fa = ICONS[modal.id] || (modal.matches(ACCOUNT_CHILD) ? "fa-solid fa-user-gear" : "");
    if (head && fa) {
      let ico = head.querySelector(":scope > .tm-sheet-icon");
      if (!ico) {
        ico = document.createElement("span");
        ico.setAttribute("aria-hidden", "true");
        head.prepend(ico);
      }
      ico.className = "tm-sheet-icon is-fa";
      ico.innerHTML = `<i class="${fa}"></i>`;
      modal.classList.add("tm-sheet-account");
    }
    const section = sectionFor(modal);
    const url = fa ? "" : iconUrl(section);
    if (head && url) {
      let ico = head.querySelector(":scope > .tm-sheet-icon");
      if (!ico) {
        ico = document.createElement("span");
        ico.className = "tm-sheet-icon";
        ico.setAttribute("aria-hidden", "true");
        head.prepend(ico);
      }
      ico.style.setProperty("--tm-sheet-icon", `url("${url}")`);
    }
    // Restart the slide-in each time it opens.
    modal.classList.remove("tm-sheet-in");
    void modal.offsetWidth;
    modal.classList.add("tm-sheet-in");
  }

  // Closing (2026-11-17): every panel slides back out to the side. Panels are closed in many
  // places by adding "hide", which removes them at once; a copy of the panel as it was is shown
  // for the length of the slide and then removed. The copy cannot be clicked or focused.
  const reducedMotion = () => { try { return global.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) { return false; } };
  function slideOut(modal){
    if (reducedMotion() || modal.dataset.tmGhost) return;
    const dialog = modal.querySelector(":scope > .modal-dialog");
    if (!dialog || !document.body) return;
    const ghost = modal.cloneNode(true);
    ghost.dataset.tmGhost = "1";
    ghost.removeAttribute("id");
    ghost.querySelectorAll("[id]").forEach(el => el.removeAttribute("id"));
    ghost.setAttribute("aria-hidden", "true");
    ghost.inert = true;
    ghost.classList.remove("hide", "tm-sheet-in");
    ghost.classList.add("tm-sheet-out");
    // Typed values are not copied by cloneNode; copy them so the panel looks the same while leaving.
    const from = modal.querySelectorAll("input, textarea, select"), to = ghost.querySelectorAll("input, textarea, select");
    from.forEach((el, i) => { const t = to[i]; if (!t) return; try { if (el.type === "checkbox" || el.type === "radio") t.checked = el.checked; else if (el.type !== "file") t.value = el.value; } catch (_) {} });
    const scroller = modal.querySelector(".modal-body, .settings-sheet-body"), gScroller = ghost.querySelector(".modal-body, .settings-sheet-body");
    const overflowBefore = document.body.style.overflow;
    document.body.appendChild(ghost);
    if (scroller && gScroller) gScroller.scrollTop = scroller.scrollTop;
    let gone = false;
    const done = () => {
      if (gone) return; gone = true;
      ghost.remove();
      syncOpenState();
      // Code that closed another dialog during the slide may have seen the copy as "still open".
      if (overflowBefore !== "hidden" && document.body.style.overflow === "hidden" && !document.querySelector(".modal:not(.hide):not([data-tm-ghost])")) document.body.style.overflow = overflowBefore;
    };
    ghost.addEventListener("animationend", e => { if (e.target === ghost.querySelector(":scope > .modal-dialog")) done(); });
    setTimeout(done, 520);
  }

  function syncOpenState(){
    const any = document.querySelector(".modal.tm-sheet:not(.hide):not([data-tm-ghost])");
    document.documentElement.classList.toggle("tm-sheet-open", !!any);
  }

  // Watch overlays opening ("hide" removed) and new overlays being added to the page.
  const seen = new WeakSet();
  const watcher = new MutationObserver(records => {
    let touched = false;
    for (const r of records) {
      if (r.type === "attributes") {
        const m = r.target;
        if (m.classList?.contains("modal") && !m.classList.contains("hide") && r.oldValue && /\bhide\b/.test(r.oldValue)) decorate(m);
        else if (m.classList?.contains("tm-sheet") && m.classList.contains("hide") && r.oldValue && !/\bhide\b/.test(r.oldValue)) slideOut(m);
        touched = true;
      } else {
        r.addedNodes.forEach(n => {
          if (n.nodeType !== 1 || n.dataset?.tmGhost) return;
          const list = n.classList?.contains("modal") ? [n] : [...(n.querySelectorAll?.(".modal") || [])];
          list.forEach(m => { if (!seen.has(m)) { seen.add(m); watch(m); } if (!m.classList.contains("hide")) decorate(m); });
        });
      }
    }
    if (touched) syncOpenState();
  });
  function watch(m){ watcher.observe(m, { attributes: true, attributeFilter: ["class"], attributeOldValue: true }); }
  function start(){
    document.querySelectorAll(".modal").forEach(m => { seen.add(m); watch(m); });
    watcher.observe(document.body, { childList: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();

  // The detail views (loans, installments, assets, depreciation, notes) are no longer overlays:
  // they open in the shared detail panel (ui/10-detail-panels.js) with their own actions.

  global.TriplemSideSheets = Object.freeze({ decorate, SHEETS });
})(typeof window !== "undefined" ? window : globalThis);
