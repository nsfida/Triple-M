/* Triplem VIP · Side panels for every overlay (2026-11-14)
 *
 * The Admin user panel (admin/04-admin-user-manager.js) set the look: one surface that slides in
 * from the right, a calm header with the section icon, small section labels, regular text and
 * pill buttons. This file gives every overlay of Admin, Loans, Installments, Assets /
 * Depreciation and Notes the same panel.
 *
 * Nothing about how an overlay works changes: the same element, fields, buttons and save code
 * are used. When one of these overlays opens, it is marked "tm-sheet" (and "tm-sheet-wide" for
 * the ones with charts or tables), and the stylesheet draws it as a side panel. Short
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
    modal.classList.toggle("tm-sheet-wide", size === "wide");
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

  // ── Extra actions ──────────────────────────────────────────────────────────────────────
  const esc = v => (typeof escapeHtml === "function" ? escapeHtml(v) : String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  const plainMoney = (n, cur) => {
    const v = Number(n || 0);
    try { return `${cur ? cur + " " : ""}${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; } catch (_) { return `${cur} ${v.toFixed(2)}`; }
  };
  const fmtDate = d => { try { return d ? displayDate(d) : ""; } catch (_) { return String(d || ""); } };
  const companyName = () => {
    try { const c = getPdfCompanyContact(); if (c?.isCompany && c.name) return c.name; } catch (_) {}
    try { return state?.sessionUser?.display_name || ""; } catch (_) { return ""; }
  };

  function flash(host, text, ok = true){
    let t = host.querySelector(".tm-sheet-flash");
    if (!t) { t = document.createElement("span"); t.className = "tm-sheet-flash"; t.setAttribute("role", "status"); host.appendChild(t); }
    t.textContent = text;
    t.classList.toggle("is-bad", !ok);
    t.classList.add("is-on");
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("is-on"), 2400);
  }
  async function copy(text, host){
    try { await navigator.clipboard.writeText(text); flash(host, "Copied"); }
    catch (_) { flash(host, "Could not copy", false); }
  }
  const whatsapp = text => { try { window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener"); } catch (_) {} };
  const email = (subject, body) => { try { window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`; } catch (_) {} };

  // A small menu button used by the reminder / share actions.
  function menuButton(label, icon, items){
    const wrap = document.createElement("div");
    wrap.className = "tm-sheet-menu";
    wrap.innerHTML = `<button type="button" class="tm-sheet-btn" aria-haspopup="menu" aria-expanded="false"><i class="${icon}" aria-hidden="true"></i><span>${esc(label)}</span><i class="fa-solid fa-chevron-down tm-sheet-caret" aria-hidden="true"></i></button>
      <div class="tm-sheet-menu-list" role="menu">${items.map((it, i) => `<button type="button" role="menuitem" data-i="${i}"><i class="${it.icon}" aria-hidden="true"></i><span>${esc(it.label)}</span></button>`).join("")}</div>`;
    const btn = wrap.firstElementChild, list = wrap.lastElementChild;
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const on = !wrap.classList.contains("is-open");
      document.querySelectorAll(".tm-sheet-menu.is-open").forEach(m => { m.classList.remove("is-open"); m.firstElementChild.setAttribute("aria-expanded", "false"); });
      wrap.classList.toggle("is-open", on);
      btn.setAttribute("aria-expanded", String(on));
    });
    list.addEventListener("click", e => {
      const b = e.target.closest("[data-i]"); if (!b) return;
      wrap.classList.remove("is-open"); btn.setAttribute("aria-expanded", "false");
      items[Number(b.dataset.i)].run(wrap);
    });
    return wrap;
  }
  document.addEventListener("click", e => {
    if (!e.target.closest?.(".tm-sheet-menu")) document.querySelectorAll(".tm-sheet-menu.is-open").forEach(m => { m.classList.remove("is-open"); m.firstElementChild.setAttribute("aria-expanded", "false"); });
  });
  const plainButton = (label, icon, run, extra = "") => {
    const b = document.createElement("button");
    b.type = "button"; b.className = `tm-sheet-btn ${extra}`.trim();
    b.innerHTML = `<i class="${icon}" aria-hidden="true"></i><span>${esc(label)}</span>`;
    b.addEventListener("click", () => run(b));
    return b;
  };

  // Loans: record a payment, add a loan, remind, rename, progress bar ───────────────────
  function loanGroup(name, dir){
    try {
      const groups = getFilteredGroups(dir, dir, {}) || [];
      return groups.find(g => String(g.person_name || "").trim().toLowerCase() === name.toLowerCase()) || null;
    } catch (_) { return null; }
  }
  function loanReminder(name, dir){
    const g = loanGroup(name, dir);
    if (!g) return "";
    const from = companyName();
    const lines = dir === "given"
      ? [`Dear ${name},`, ``, `This is a friendly reminder that ${plainMoney(g.remaining, g.currency)} is still outstanding on the amount given to you${g.loan_date ? ` on ${fmtDate(g.loan_date)}` : ""}.`,
         `Total ${plainMoney(g.principalTotal, g.currency)} · received back ${plainMoney(g.paidTotal, g.currency)}.`, ``, `Kindly arrange the payment at your earliest convenience. Thank you.`]
      : [`Dear ${name},`, ``, `For your records: the remaining balance I owe you is ${plainMoney(g.remaining, g.currency)} (total ${plainMoney(g.principalTotal, g.currency)}, returned ${plainMoney(g.paidTotal, g.currency)}).`, ``, `Thank you.`];
    if (from) lines.push(``, from);
    return lines.join("\n");
  }
  function enhanceLoanDetails(){
    const modal = document.getElementById("sectionDetailsModal");
    if (!modal || modal.dataset.detailsKind !== "loan") return;
    const host = document.getElementById("sectionDetailsActions");
    const name = modal.dataset.detailsPerson || "", dir = modal.dataset.detailsDirection === "given" ? "given" : "taken";
    if (!host || !name || host.querySelector(".tm-sheet-actions")) return;
    const g = loanGroup(name, dir);
    const bar = document.createElement("div");
    bar.className = "tm-sheet-actions";
    const canEdit = typeof teamCanShowEdit !== "function" || teamCanShowEdit("entries");
    if (g && g.remaining > 0 && canEdit) bar.appendChild(plainButton(dir === "given" ? "Record received" : "Record returned", "fa-solid fa-hand-holding-dollar", () => {
      const open = (typeof groupByLoan === "function" ? groupByLoan(g.entries || []) : []).find(x => calculateLoan(x).remaining > 0);
      closeModal("sectionDetailsModal");
      openEntryModal("payment", dir, { groupId: open?.group_id || "" });
    }, "is-primary"));
    if (canEdit) bar.appendChild(plainButton(dir === "given" ? "Give more" : "Take more", "fa-solid fa-plus", () => {
      closeModal("sectionDetailsModal");
      openEntryModal("principal", dir, { personName: name, currency: g?.currency || "" });
    }));
    if (g && g.remaining > 0) bar.appendChild(menuButton("Remind", "fa-regular fa-bell", [
      { label: "Copy reminder message", icon: "fa-regular fa-copy", run: w => copy(loanReminder(name, dir), w) },
      { label: "Send on WhatsApp", icon: "fa-brands fa-whatsapp", run: () => whatsapp(loanReminder(name, dir)) },
      { label: "Send by email", icon: "fa-regular fa-envelope", run: () => email(`Payment reminder · ${name}`, loanReminder(name, dir)) }
    ]));
    if (canEdit && typeof renamePersonRecords === "function") bar.appendChild(plainButton("Rename", "fa-solid fa-pen", async () => {
      closeModal("sectionDetailsModal");
      await renamePersonRecords(encodeURIComponent(name), dir);
    }));
    host.prepend(bar);
    // Progress bar under the title
    if (g && g.principalTotal > 0) {
      const desc = document.getElementById("sectionDetailsDesc");
      const pct = Math.max(0, Math.min(100, Math.round((Number(g.paidTotal || 0) / Number(g.principalTotal)) * 100)));
      const prog = document.createElement("div");
      prog.className = "tm-sheet-progress";
      prog.innerHTML = `<span style="--p:${pct}%"></span><small>${pct}% ${dir === "given" ? "received back" : "returned"}${g.lastActivity ? ` · last activity ${esc(fmtDate(g.lastActivity))}` : ""}</small>`;
      desc?.parentElement?.querySelector(".tm-sheet-progress")?.remove();
      desc?.after(prog);
    }
  }

  // Installments: remind with the next due amount ───────────────────────────────────────
  function enhanceInstallmentPlan(){
    const body = document.getElementById("installmentPlanBody");
    const id = body?.dataset.groupId;
    const head = document.querySelector("#installmentPlanModal .modal-head");
    if (!id || !head || head.querySelector(".tm-sheet-actions")) return;
    let plan = null;
    try { plan = getInstallmentPlanGroup(id); } catch (_) {}
    if (!plan || Number(plan.remaining || 0) <= 0) return;
    const next = plan.schedule?.nextOpen;
    const bought = String(plan.plan_type || plan.installment_plan_type || "").toLowerCase() === "bought";
    const text = () => {
      const lines = [`Dear ${plan.person_name},`, ``,
        next ? `A friendly reminder: installment ${next.index ? "#" + next.index + " " : ""}of ${plainMoney(next.balance, plan.currency)} is due on ${fmtDate(next.dueDate)}.` : `A friendly reminder about the installment plan.`,
        `Paid so far ${plainMoney(plan.paidTotal, plan.currency)} · remaining ${plainMoney(plan.remaining, plan.currency)}.`, ``, `Thank you.`];
      const from = companyName(); if (from) lines.push(``, from);
      return lines.join("\n");
    };
    const bar = document.createElement("div");
    bar.className = "tm-sheet-actions";
    if (!bought) bar.appendChild(menuButton("Remind", "fa-regular fa-bell", [
      { label: "Copy reminder message", icon: "fa-regular fa-copy", run: w => copy(text(), w) },
      { label: "Send on WhatsApp", icon: "fa-brands fa-whatsapp", run: () => whatsapp(text()) },
      { label: "Send by email", icon: "fa-regular fa-envelope", run: () => email(`Installment reminder · ${plan.person_name}`, text()) }
    ]));
    if (next) {
      const due = document.createElement("span");
      due.className = "tm-sheet-chip" + (plan.status === "Overdue" ? " is-bad" : "");
      due.innerHTML = `<i class="fa-regular fa-calendar" aria-hidden="true"></i> Next ${esc(plainMoney(next.balance, plan.currency))} · ${esc(fmtDate(next.dueDate))}`;
      bar.prepend(due);
    }
    head.querySelector(".installment-plan-dialog-title")?.after(bar);
  }

  // Notes: copy, share, download, print, counts ─────────────────────────────────────────
  function noteText(){
    const title = document.getElementById("noteDetailTitle")?.textContent?.trim() || "Note";
    const content = document.getElementById("noteDetailContent")?.innerText?.trim() || "";
    return { title, content, all: `${title}\n\n${content}` };
  }
  function enhanceNoteDetail(){
    const actions = document.getElementById("noteDetailActions");
    if (!actions || actions.querySelector(".tm-sheet-note-tools")) return;
    const tools = document.createElement("div");
    tools.className = "tm-sheet-actions tm-sheet-note-tools";
    tools.appendChild(plainButton("Copy", "fa-regular fa-copy", b => copy(noteText().all, tools)));
    tools.appendChild(menuButton("Share", "fa-solid fa-share-nodes", [
      { label: "Send on WhatsApp", icon: "fa-brands fa-whatsapp", run: () => whatsapp(noteText().all) },
      { label: "Send by email", icon: "fa-regular fa-envelope", run: () => { const t = noteText(); email(t.title, t.content); } },
      ...(navigator.share ? [{ label: "More…", icon: "fa-solid fa-arrow-up-from-bracket", run: () => { const t = noteText(); navigator.share({ title: t.title, text: t.content }).catch(() => {}); } }] : [])
    ]));
    tools.appendChild(menuButton("Save", "fa-solid fa-download", [
      { label: "Download as text file", icon: "fa-regular fa-file-lines", run: () => {
        const t = noteText();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([t.all], { type: "text/plain;charset=utf-8" }));
        a.download = `${t.title.replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 80) || "note"}.txt`;
        document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      } },
      { label: "Print", icon: "fa-solid fa-print", run: () => {
        const t = noteText();
        const w = window.open("", "_blank", "noopener,width=720,height=900");
        if (!w) return;
        w.document.write(`<!doctype html><title>${esc(t.title)}</title><body style="font:15px/1.6 system-ui,sans-serif;padding:32px;max-width:680px;margin:auto"><h2 style="font-weight:500">${esc(t.title)}</h2><div style="white-space:pre-wrap">${esc(t.content)}</div></body>`);
        w.document.close(); w.focus(); setTimeout(() => w.print(), 200);
      } }
    ]));
    actions.prepend(tools);
  }
  function noteCounts(){
    const meta = document.getElementById("noteDetailMeta");
    const content = document.getElementById("noteDetailContent")?.innerText || "";
    if (!meta) return;
    const words = (content.trim().match(/\S+/g) || []).length;
    let span = meta.parentElement.querySelector(".tm-sheet-counts");
    if (!span) { span = document.createElement("p"); span.className = "tm-sheet-counts"; meta.after(span); }
    const text = `${words} word${words === 1 ? "" : "s"} · ${content.trim().length} characters`;
    if (span.textContent !== text) span.textContent = text; // no change, no new mutation
  }

  // Run the enhancements whenever those overlays open or are redrawn.
  const enhancer = new MutationObserver(() => {
    const d = document.getElementById("sectionDetailsModal");
    if (d && !d.classList.contains("hide")) enhanceLoanDetails();
    const i = document.getElementById("installmentPlanModal");
    if (i && !i.classList.contains("hide")) enhanceInstallmentPlan();
    const n = document.getElementById("noteDetailModal");
    if (n && !n.classList.contains("hide")) { enhanceNoteDetail(); noteCounts(); }
  });
  function startEnhancer(){
    ["sectionDetailsModal", "installmentPlanModal", "noteDetailModal"].forEach(id => {
      const el = document.getElementById(id);
      if (el) enhancer.observe(el, { attributes: true, attributeFilter: ["class"], childList: true, subtree: true });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startEnhancer, { once: true });
  else startEnhancer();

  global.TriplemSideSheets = Object.freeze({ decorate, SHEETS, loanReminder });
})(typeof window !== "undefined" ? window : globalThis);
