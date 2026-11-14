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
    adminLiveChatTranscriptModal: "", adminReceiptViewerModal: "wide", adminUserDetailsModal: ""
  };
  // Sections whose other overlays (made on the fly, without a fixed id) also become panels.
  const SECTION_KEYS = new Set(["given", "received", "taken", "returned", "loans", "installments", "assets", "notes", "admin"]);
  // Never panels: confirmations, alerts, the test-account notice, Expenses' own overlays.
  const KEEP_CENTERED = ".app-confirm-modal, #reminderAlertModal, .tm-test-notice, #expenseModal, #transferModal, #expenseAccountDetailsModal, #walletLogoPickerModal, #accountSettingsModal, .account-settings-child-modal, #sectionShortcutsModal, #adminSecurityKeyModal";
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
    const head = modal.querySelector(":scope > .modal-dialog .modal-head, :scope > .modal-dialog .settings-sheet-head, :scope > .modal-dialog > form > .modal-head");
    const section = sectionFor(modal);
    const url = iconUrl(section);
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

  function syncOpenState(){
    const any = document.querySelector(".modal.tm-sheet:not(.hide)");
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
        touched = true;
      } else {
        r.addedNodes.forEach(n => {
          if (n.nodeType !== 1) return;
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
