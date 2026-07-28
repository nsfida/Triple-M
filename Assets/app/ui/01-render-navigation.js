/* Modularized from script.js lines 17623-21688 — renderAll and navigation shell. Load order must be preserved. */
function renderAll(){
  invalidateExpenseAccountsSyncCache();
  renderOverviewCards();
  renderLoanSelectors();
  renderGoodsSelectors();
  renderLoanCards(els.givenList, "given", "given");
  renderLoanCards(els.receivedList, "given", "received");
  renderLoanCards(els.takenList, "taken", "taken", {
    groupFilter: group => !group.rows.some(row => hasInstallmentTag(row.note) || hasGoodsTag(row.note) || hasExpenseAccountTag(row.note)) && group.person_name !== "SYSTEM"
  });
  renderLoanCards(els.returnedList, "taken", "returned", {
    groupFilter: group => !group.rows.some(row => hasInstallmentTag(row.note) || hasGoodsTag(row.note) || hasExpenseAccountTag(row.note)) && group.person_name !== "SYSTEM"
  });
  renderInstallmentPlans();
  renderInventoryList();
  renderExpensesList();
  renderExpenseOverviewWallets();
  syncLegacyFixAllButtons();
}


function installmentStatusBadgeClass(status){
  const value = String(status || "").toLowerCase();
  if (value === "closed" || value === "paid") return "green";
  if (value === "overdue") return "red";
  if (value === "partial") return "orange";
  return "blue";
}

function renderInstallmentPlans(){
  const container = els.installmentsList;
  if (!container) return;
  let plans = getInstallmentPlanGroups();
  const searchTerm = String(state.search.installments || "").trim().toLowerCase();
  if (searchTerm) {
    plans = plans.filter(plan => `${plan.person_name || ""} ${plan.principal?.notes || ""}`.toLowerCase().includes(searchTerm));
  }
  const statusFilter = String(state.statusFilter.installments || "All");
  if (statusFilter === "Active") plans = plans.filter(plan => plan.remaining > 0.00000001);
  if (statusFilter === "Closed") plans = plans.filter(plan => plan.remaining <= 0.00000001);
  const currencyFilter = String(state.currencyFilter.installments || "All");
  if (currencyFilter !== "All") plans = plans.filter(plan => plan.currency === currencyFilter);

  if (!plans.length){
    container.innerHTML = `<div class="empty">No installment plans found.</div>`;
    return;
  }

  container.innerHTML = plans.map(plan => {
    const schedule = plan.schedule;
    const status = plan.status;
    const statusClass = installmentStatusBadgeClass(status);
    const monthlyLabel = schedule
      ? `${moneyText(schedule.installmentAmount, plan.currency)}${schedule.lastAmount !== schedule.installmentAmount ? ` · last ${moneyText(schedule.lastAmount, plan.currency)}` : ""}`
      : "Open balance";
    const progressLabel = schedule
      ? `${schedule.paidCount}/${schedule.count} paid`
      : `${plan.payments.length} payment${plan.payments.length === 1 ? "" : "s"}`;
    const paidPct = plan.principalTotal > 0
      ? Math.min(100, Math.round((plan.paidTotal / plan.principalTotal) * 100))
      : 0;
    const next = schedule?.nextOpen;
    const nextLabel = next
      ? `#${next.index} · ${displayDate(next.dueDate)}`
      : (plan.remaining > 0 ? "Open balance" : "Paid in full");
    const needsSchedule = !schedule;

    return `
      <article class="loan installment-plan-card" data-group-id="${escapeHtml(plan.group_id)}" tabindex="0" role="button" aria-label="Open installment plan for ${escapeHtml(plan.person_name || "plan")}">
        <div class="ip-card">
          <div class="ip-card-head">
            <div class="ip-card-title">
              <div class="loan-name">
                <i class="fa-solid fa-calendar-check"></i>
                <span>${escapeHtml(plan.person_name || "Unnamed plan")}</span>
                <span class="badge ${statusClass}">${escapeHtml(status)}</span>
                ${needsSchedule ? `<span class="badge orange">Needs schedule</span>` : ""}
              </div>
              <div class="ip-card-meta">
                <span>${escapeHtml(displayDate(plan.loan_date || "—"))}</span>
                <span>${currencySymbolHtml(plan.currency || "")}</span>
                <span>${escapeHtml(progressLabel)}</span>
                <span>${schedule ? `${escapeHtml(monthlyLabel)} / mo` : escapeHtml(monthlyLabel)}</span>
              </div>
            </div>
            <div class="ip-card-actions">
              <div class="card-action-grid card-action-grid--single" role="group" aria-label="Plan actions">
                <div class="menu-wrap">
                  <button class="icon-btn ghost menu-trigger person-menu-btn" type="button" aria-label="More actions" title="More actions" data-person-menu="${escapeHtml(plan.group_id)}" aria-expanded="false">☰</button>
                  <div class="menu-dropdown" data-person-menu-panel="${escapeHtml(plan.group_id)}">
                    <button class="menu-item installmentActionBtn" type="button" data-action="details" data-group-id="${escapeHtml(plan.group_id)}"><i class="fa-solid fa-chart-pie"></i> View charts</button>
                    <button class="menu-item installmentActionBtn" type="button" data-action="schedule" data-group-id="${escapeHtml(plan.group_id)}"><i class="fa-solid fa-list-ol"></i> View schedule</button>
                    ${teamCanShowEdit("entries") ? `<button class="menu-item installmentActionBtn" type="button" data-action="edit" data-group-id="${escapeHtml(plan.group_id)}"><i class="fa-solid fa-pen-to-square"></i> Edit plan / schedule</button>` : ""}
                    <button class="menu-item installmentActionBtn" type="button" data-action="pay" data-group-id="${escapeHtml(plan.group_id)}"><i class="fa-solid fa-money-bill"></i> Pay installment</button>
                    <button class="menu-item installmentActionBtn" type="button" data-action="reminder" data-group-id="${escapeHtml(plan.group_id)}"><i class="fa-solid fa-bell"></i> Reminder</button>
                    <button class="menu-item installmentActionBtn" type="button" data-action="pdf" data-group-id="${escapeHtml(plan.group_id)}"><i class="fa-solid fa-download"></i> Download statement</button>
                    ${teamCanShowDelete("entries") ? `<button class="menu-item danger installmentActionBtn" type="button" data-action="delete" data-person="${encodeURIComponent(plan.person_name || "")}" data-direction="taken">Delete Record</button>` : ""}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="ip-card-metrics">
            <div class="ip-metric"><small>Total</small><strong>${money(plan.principalTotal, plan.currency)}</strong></div>
            <div class="ip-metric"><small>Paid</small><strong>${money(plan.paidTotal, plan.currency)}</strong></div>
            <div class="ip-metric"><small>Remaining</small><strong>${money(plan.remaining, plan.currency)}</strong></div>
            <div class="ip-metric"><small>Next</small><strong>${escapeHtml(nextLabel)}</strong></div>
          </div>
          <div class="ip-progress">
            <div class="ip-progress-track"><div class="ip-progress-fill" style="width:${paidPct}%"></div></div>
            <div class="ip-progress-label"><span>${paidPct}% paid</span><span>Tap to open</span></div>
          </div>
        </div>
      </article>
    `;
  }).join("");

  container.querySelectorAll(".installment-plan-card").forEach(card => {
    const open = () => openInstallmentItemDetailsOverlay(card.dataset.groupId);
    card.addEventListener("click", e => {
      if (e.target.closest(".menu-wrap, .menu-dropdown, .person-menu-btn, .installmentActionBtn, button, a")) return;
      open();
    });
    card.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  });
  container.querySelectorAll(".person-menu-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      const panel = btn.closest(".menu-wrap")?.querySelector(".menu-dropdown");
      if (!panel) return;
      document.querySelectorAll(".menu-dropdown.open").forEach(openPanel => {
        if (openPanel !== panel) openPanel.classList.remove("open");
      });
      document.querySelectorAll(".menu-trigger[aria-expanded='true']").forEach(trigger => {
        if (trigger !== btn) trigger.setAttribute("aria-expanded", "false");
      });
      const nowOpen = panel.classList.toggle("open");
      btn.setAttribute("aria-expanded", nowOpen ? "true" : "false");
      const wrap = btn.closest(".menu-wrap");
      wrap?.classList.toggle("open", nowOpen);
      document.querySelectorAll(".menu-wrap.open").forEach(openWrap => {
        if (openWrap !== wrap) openWrap.classList.remove("open");
      });
      if (nowOpen) {
        const rect = btn.getBoundingClientRect();
        panel.style.top = `${rect.bottom + 6}px`;
        panel.style.left = `${rect.right - panel.offsetWidth}px`;
        if (rect.right - panel.offsetWidth < 10) {
          panel.style.left = `${Math.max(10, rect.left)}px`;
        }
      }
    });
  });
  container.querySelectorAll(".installmentActionBtn").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.preventDefault();
      e.stopPropagation();
      document.querySelectorAll(".menu-dropdown.open").forEach(panel => panel.classList.remove("open"));
      document.querySelectorAll(".menu-wrap.open").forEach(wrap => wrap.classList.remove("open"));
      document.querySelectorAll(".menu-trigger[aria-expanded='true']").forEach(trigger => trigger.setAttribute("aria-expanded", "false"));
      const action = btn.dataset.action;
      if (action === "details") openInstallmentItemDetailsOverlay(btn.dataset.groupId);
      if (action === "schedule") openInstallmentPlanOverlay(btn.dataset.groupId);
      if (action === "edit") openInstallmentEditModal(btn.dataset.groupId);
      if (action === "pay") openInstallmentPaymentModal(btn.dataset.groupId);
      if (action === "reminder") {
        try { await window.openInstallmentReminderModal(btn.dataset.groupId); }
        catch (err) { alert(err?.message || "Could not open reminder."); }
      }
      if (action === "pdf") await downloadInstallmentPlanPDF(btn.dataset.groupId);
      if (action === "delete") await deletePersonRecords(btn.dataset.person, btn.dataset.direction);
    });
  });
}

function renderInstallmentPlanOverlayBody(plan){
  const schedule = plan.schedule;
  const needsSchedule = !schedule;
  const next = schedule?.nextOpen;
  const currency = plan.currency || plan.principal?.currency || "AED";
  const principalTotal = Number(plan.principalTotal ?? plan.principal?.principal_amount ?? 0);
  const paidTotal = Number(
    plan.paidTotal ??
    schedule?.paidTotal ??
    (plan.payments || []).reduce((sum, row) => sum + Number(row.action_amount || 0), 0)
  );
  const remaining = Number(
    plan.remaining ??
    schedule?.remainingTotal ??
    Math.max(principalTotal - paidTotal, 0)
  );
  const status = plan.status || schedule?.planStatus || (remaining <= 0 ? "Closed" : paidTotal > 0 ? "Partial" : "Open");
  const progressLabel = schedule
    ? `${schedule.paidCount}/${schedule.count} paid`
    : `${(plan.payments || []).length} payment${(plan.payments || []).length === 1 ? "" : "s"}`;
  const paidPct = principalTotal > 0
    ? Math.min(100, Math.round((paidTotal / principalTotal) * 100))
    : 0;

  const scheduleRows = schedule
    ? schedule.slots.map(slot => `
        <div class="ipo-row ${slot.balance > 0.00000001 ? "is-open" : "is-done"}">
          <div class="ipo-row-main">
            <strong>#${slot.index}</strong>
            <span>${escapeHtml(displayDate(slot.dueDate))}</span>
            <span class="badge ${installmentStatusBadgeClass(slot.status)}">${escapeHtml(slot.status)}</span>
          </div>
          <div class="ipo-row-amt">
            <span>${money(slot.paid, currency)} / ${money(slot.scheduled, currency)}</span>
            ${slot.balance > 0.00000001
              ? `<button class="tiny ghost installmentPayBalanceBtn" type="button" data-group-id="${escapeHtml(plan.group_id)}" data-amount="${slot.balance}">Pay ${moneyText(slot.balance, currency)}</button>`
              : `<em>Clear</em>`}
          </div>
        </div>
      `).join("")
    : `<div class="ip-empty">No monthly schedule yet. Set one to track each installment.</div>`;

  const paymentRows = (plan.payments || []).slice().sort((a, b) => dateStamp(b.action_date) - dateStamp(a.action_date)).map(row => {
    const alloc = parseInstallmentAllocation(installmentMetaFromNotes(row.notes).allocation);
    const allocText = alloc.length
      ? alloc.map(a => `#${a.index}`).join(" · ")
      : (schedule ? "—" : "Balance");
    return `
      <div class="ipo-row">
        <div class="ipo-row-main">
          <strong>${escapeHtml(displayDate(row.action_date || "—"))}</strong>
          <span>${escapeHtml(row.entry_kind === "full" ? "Final" : "Partial")}</span>
          <span class="ipo-muted">${escapeHtml(allocText)}</span>
        </div>
        <div class="ipo-row-amt"><strong>${money(row.action_amount || 0, currency)}</strong></div>
      </div>
    `;
  }).join("") || `<div class="ip-empty">No payments yet.</div>`;

  return `
    <div class="ipo-summary">
      <div><small>Total</small><strong>${money(principalTotal, currency)}</strong></div>
      <div><small>Paid</small><strong>${money(paidTotal, currency)}</strong></div>
      <div><small>Left</small><strong>${money(remaining, currency)}</strong></div>
      <div><small>Status</small><strong><span class="badge ${installmentStatusBadgeClass(status)}">${escapeHtml(status)}</span></strong></div>
    </div>
    <div class="ipo-progress">
      <div class="ip-progress-track"><div class="ip-progress-fill" style="width:${paidPct}%"></div></div>
      <div class="ipo-progress-meta">
        <span>${paidPct}% · ${escapeHtml(progressLabel)}</span>
        <span>${next ? `Next #${next.index} · ${moneyText(next.balance, currency)}` : (remaining > 0 ? "Open balance" : "Complete")}</span>
      </div>
    </div>
    <div class="ipo-actions">
      ${teamCanShowEdit("entries") ? `<button class="btn ghost tiny installmentOverlayBtn" type="button" data-action="edit" data-group-id="${escapeHtml(plan.group_id)}">${needsSchedule ? "Set schedule" : "Edit"}</button>` : ""}
      ${remaining > 0 ? `<button class="btn primary tiny installmentOverlayBtn" type="button" data-action="pay" data-group-id="${escapeHtml(plan.group_id)}">Pay</button>` : ""}
      <button class="btn ghost tiny installmentOverlayBtn" type="button" data-action="pdf" data-group-id="${escapeHtml(plan.group_id)}">PDF</button>
    </div>
    <div class="ipo-tabs" role="tablist">
      <button class="ipo-tab active" type="button" data-ipo-tab="schedule">Schedule${schedule ? ` (${schedule.count})` : ""}</button>
      <button class="ipo-tab" type="button" data-ipo-tab="payments">Payments (${(plan.payments || []).length})</button>
    </div>
    <div class="ipo-panel active" data-ipo-panel="schedule">${scheduleRows}</div>
    <div class="ipo-panel" data-ipo-panel="payments">${paymentRows}</div>
  `;
}

function openInstallmentPlanOverlay(groupId){
  const plan = getInstallmentPlanGroup(groupId);
  if (!plan || !els.installmentPlanModal || !els.installmentPlanBody) {
    alert("Installment plan not found.");
    return;
  }
  if (els.installmentPlanTitle) els.installmentPlanTitle.textContent = plan.person_name || "Installment plan";
  if (els.installmentPlanDesc) {
    const started = displayDate(plan.loan_date || "—");
    els.installmentPlanDesc.textContent = plan.schedule
      ? `${plan.schedule.count} installments · started ${started}`
      : `Legacy plan · started ${started}`;
  }
  els.installmentPlanBody.innerHTML = renderInstallmentPlanOverlayBody(plan);
  els.installmentPlanBody.dataset.groupId = plan.group_id;

  els.installmentPlanBody.querySelectorAll(".ipo-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const key = tab.dataset.ipoTab;
      els.installmentPlanBody.querySelectorAll(".ipo-tab").forEach(t => t.classList.toggle("active", t === tab));
      els.installmentPlanBody.querySelectorAll(".ipo-panel").forEach(panel => {
        panel.classList.toggle("active", panel.dataset.ipoPanel === key);
      });
    });
  });
  els.installmentPlanBody.querySelectorAll(".installmentOverlayBtn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const action = btn.dataset.action;
      const id = btn.dataset.groupId;
      if (action === "edit") {
        closeModal("installmentPlanModal");
        openInstallmentEditModal(id);
      }
      if (action === "pay") {
        closeModal("installmentPlanModal");
        openInstallmentPaymentModal(id);
      }
      if (action === "pdf") await downloadInstallmentPlanPDF(id);
    });
  });
  els.installmentPlanBody.querySelectorAll(".installmentPayBalanceBtn").forEach(btn => {
    btn.addEventListener("click", () => {
      closeModal("installmentPlanModal");
      openInstallmentPaymentModal(btn.dataset.groupId, Number(btn.dataset.amount || 0));
    });
  });

  els.installmentPlanModal.classList.remove("hide");
  els.installmentPlanModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

async function downloadInstallmentPlanPDF(groupId){
  const plan = getInstallmentPlanGroup(groupId);
  if (!plan){
    alert("Installment plan not found.");
    return;
  }
  if (!window.jspdf){
    alert("PDF library loading. Please try again.");
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  await loadCustomFontsForPdf(doc);
  const logoData = await getPdfLogo();
  const title = "Installment Plan Statement";
  const subtitle = plan.person_name || plan.principal?.person_name || "Plan";
  const currency = plan.currency || "AED";
  const formatMon = (amt) => formatPdfAmount(amt, currency);
  const schedule = plan.schedule;
  const principalTotal = Number(plan.principalTotal ?? plan.principal?.principal_amount ?? 0);
  const paidTotal = Number(
    plan.paidTotal ??
    schedule?.paidTotal ??
    plan.payments.reduce((sum, row) => sum + Number(row.action_amount || 0), 0)
  );
  const remaining = Number(
    plan.remaining ??
    schedule?.remainingTotal ??
    Math.max(principalTotal - paidTotal, 0)
  );
  const status = plan.status || schedule?.planStatus || (remaining <= 0 ? "Closed" : paidTotal > 0 ? "Partial" : "Open");
  const monthlyLabel = schedule
    ? (schedule.lastAmount !== schedule.installmentAmount
      ? `${formatMon(schedule.installmentAmount)} (last ${formatMon(schedule.lastAmount)})`
      : formatMon(schedule.installmentAmount))
    : "Open balance";
  const nextDue = schedule?.nextOpen;

  drawPdfHeader(doc, logoData, title, subtitle);
  const partiesBottom = drawCompactPdfPartiesAndMeta(doc, {
    rightLabel: "CLIENT",
    partyName: subtitle,
    meta: [
      { label: "Start date", value: displayDate(plan.loan_date || plan.principal?.loan_date || "—") },
      { label: "Currency", value: pdfCurrencyLabel(currency) },
      { label: "Installments", value: schedule ? String(schedule.count) : "Legacy" },
      { label: "Monthly", value: schedule ? formatMon(schedule.installmentAmount) : "—" }
    ]
  });

  let y = partiesBottom + 7;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.2);
  doc.setTextColor(15, 23, 42);
  doc.text(schedule ? "Installment schedule" : "Payment history", 14, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    schedule
      ? "Each installment once - due date, amount due, amount paid, and open balance."
      : "All payments on this plan in date order.",
    14,
    y + 4
  );
  y += 8;

  if (schedule){
    const slotNotes = collectInstallmentSlotNotes(schedule, plan.payments || []);
    doc.autoTable({
      startY: y,
      head: [["#", "Due date", "Amount due", "Paid", "Balance", "Status", "Notes"]],
      body: schedule.slots.map(slot => [
        String(slot.index),
        displayDate(slot.dueDate),
        formatMon(slot.scheduled),
        formatMon(slot.paid),
        formatMon(slot.balance),
        slot.status,
        slotNotes.get(slot.index) || "—"
      ]),
      theme: "grid",
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold", fontSize: 6.8 },
      styles: { font: "helvetica", fontSize: 6.8, cellPadding: 1.3, overflow: "linebreak", valign: "middle" },
      tableWidth: 182,
      columnStyles: {
        0: { cellWidth: 9, halign: "center" },
        1: { cellWidth: 22 },
        2: { cellWidth: 24, halign: "right" },
        3: { cellWidth: 22, halign: "right" },
        4: { cellWidth: 22, halign: "right" },
        5: { cellWidth: 20, halign: "center" },
        6: { cellWidth: 63 }
      },
      margin: { top: 42, bottom: 42, left: 14, right: 14 },
      didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
    });
  } else {
    let running = principalTotal;
    const rows = plan.payments
      .slice()
      .sort((a, b) => dateStamp(a.action_date) - dateStamp(b.action_date))
      .map(row => {
        running = Math.max(running - Number(row.action_amount || 0), 0);
        return [
          displayDate(row.action_date || "—"),
          row.entry_kind === "full" ? "Final payment" : "Partial payment",
          formatMon(row.action_amount || 0),
          formatMon(running),
          cleanInstallmentDisplayNote(row.notes) || "—"
        ];
      });
    doc.autoTable({
      startY: y,
      head: [["Date", "Type", "Amount", "Balance after", "Notes"]],
      body: rows.length ? rows : [["—", "No payments yet", "—", formatMon(principalTotal), "—"]],
      theme: "grid",
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold", fontSize: 7.4 },
      styles: { font: "helvetica", fontSize: 7.5, cellPadding: 1.6, overflow: "linebreak" },
      tableWidth: 182,
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 34 },
        2: { cellWidth: 32,halign: "right" },
        3: { cellWidth: 34,halign: "right" },
        4: { cellWidth: 54 }
      },
      margin: { top: 42, bottom: 42, left: 14, right: 14 },
      didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
    });
  }

  const pageHeight = doc.internal.pageSize.getHeight();
  const footerSafeY = pageHeight - 38;
  const summaryNeeded = 54;
  let summaryTop = (doc.lastAutoTable?.finalY || y) + 8;
  if (summaryTop + summaryNeeded > footerSafeY) {
    doc.addPage();
    drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false);
    summaryTop = 48;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.2);
  doc.setTextColor(15, 23, 42);
  doc.text("Plan summary", 14, summaryTop);

  drawCompactPdfTotals(doc, summaryTop + 5, [
    { label: "Plan total", value: formatMon(principalTotal) },
    { label: "Monthly installment", value: monthlyLabel },
    {
      label: "Progress",
      value: schedule
        ? `${schedule.paidCount} of ${schedule.count} paid`
        : `${plan.payments.length} payment${plan.payments.length === 1 ? "" : "s"}`
    },
    { label: "Total paid", value: formatMon(paidTotal) },
    {
      label: "Next due",
      value: nextDue
        ? `#${nextDue.index} · ${displayDate(nextDue.dueDate)} · ${formatMon(nextDue.balance)}`
        : (remaining > 0 ? "Open balance" : "Fully paid")
    },
    { label: "Status", value: status },
    { label: "Remaining balance", value: formatMon(remaining), strong: true }
  ]);

  doc.save(`Installment_Plan_${String(subtitle).replace(/\s+/g, "_")}.pdf`);
}
function syncLoanModeSwitch(tab){
  const mode = (tab === "taken" || tab === "returned") ? "taken" : "given";
  document.querySelectorAll(".loan-mode-btn").forEach(btn => {
    const isActive = btn.dataset.loanMode === mode;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  });
}

function tabIsAllowed(tab){
  let key = String(tab || "").trim();
  if (!key) return false;
  if (key === "loans") key = "given";
  if (!state.unlocked) return false;
  if (key === "messages") {
    return !isGuestMode();
  }
  if (key === "admin") {
    return !isGuestMode()
      && !getUserAccessFlags().is_trial
      && userHasPermission("admin_panel", "view");
  }
  const tabModuleMap = {
    expenses: "expenses",
    goods: "inventory",
    given: "loans",
    received: "loans",
    taken: "loans",
    returned: "loans",
    installments: "installments",
    notes: "notes",
    bitcoin: "bitcoin",
    about: null
  };
  const requiredModule = tabModuleMap[key];
  if (requiredModule == null && key === "about") return true;
  if (!(key in tabModuleMap) && key !== "about") return false;
  if (requiredModule && !isGuestMode() && !userHasPermission(requiredModule, "view")) return false;
  return !!document.getElementById(`${key}Panel`);
}

/** Pick a tab the current user can open (avoids restoring Admin after switching accounts). */
function resolveStartupTab(){
  const preferred = getActiveTabKey() || "expenses";
  if (tabIsAllowed(preferred)) return preferred === "loans" ? "given" : preferred;
  const fallbacks = ["expenses", "given", "goods", "notes", "bitcoin", "messages"];
  for (const tab of fallbacks) {
    if (tabIsAllowed(tab)) return tab;
  }
  return "expenses";
}

function resetActivePanelToDefault(){
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
  const expensesPanel = document.getElementById("expensesPanel");
  const expensesTab = document.querySelector('.tab[data-tab="expenses"]');
  if (expensesPanel) expensesPanel.classList.add("active");
  if (expensesTab) expensesTab.classList.add("active");
  const walletsOverview = document.getElementById("walletsOverviewSection");
  if (walletsOverview) walletsOverview.style.display = "block";
  const mainOverview = document.getElementById("mainOverview");
  if (mainOverview) mainOverview.style.display = "none";
}

function activate(tab){
  if (!tab) return;
  // Loans tab opens the Given / Received Back surface by default
  if (tab === "loans") tab = "given";
  // Prevent access to app tabs when not logged in
  if (!state.unlocked) {
    return;
  }
  const tabModuleMap = {
    expenses: "expenses",
    goods: "inventory",
    given: "loans",
    received: "loans",
    taken: "loans",
    returned: "loans",
    installments: "installments",
    notes: "notes",
    bitcoin: "bitcoin",
    admin: "admin_panel"
  };
  const requiredModule = tabModuleMap[tab];
  if (tab === "messages") {
    if (!state.unlocked || isGuestMode()) return;
  } else if (tab === "admin") {
    if (isGuestMode() || getUserAccessFlags().is_trial || !userHasPermission("admin_panel", "view")) {
      // Previous session may have left Admin active — bounce to a permitted tab.
      if (getActiveTabKey() === "admin") {
        const fallback = resolveStartupTab();
        if (fallback && fallback !== "admin") activate(fallback);
        else resetActivePanelToDefault();
      }
      return;
    }
  } else if (requiredModule && !isGuestMode() && !userHasPermission(requiredModule, "view")) {
    return;
  }
  if (tab === "admin" && isGuestMode()) return;
  const targetPanel = document.getElementById(`${tab}Panel`);
  if (!targetPanel) return;

  document.querySelectorAll(".tab").forEach(b => {
    const isLoanTab = b.id === "loansTabBtn" && ["given", "received", "taken", "returned"].includes(tab);
    b.classList.toggle("active", b.dataset.tab === tab || isLoanTab);
  });
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
  targetPanel.classList.add("active");
  syncLoanModeSwitch(tab);
  const mainOverview = document.getElementById("mainOverview");
  const walletsOverview = document.getElementById("walletsOverviewSection");
  const loanOverviewTabs = new Set(["given", "received", "taken", "returned", "installments"]);
  const showMainOverview = loanOverviewTabs.has(tab) || tab === "goods";

  if (mainOverview) {
    if (showMainOverview) {
      renderOverviewCards(tab);
      mainOverview.style.display = "block";
    } else {
      mainOverview.style.display = "none";
    }
  }

  if (walletsOverview) {
    if (tab === "bitcoin" || tab === "notes" || tab === "admin" || tab === "about" || tab === "messages") {
      walletsOverview.style.display = "none";
    } else if (tab === "expenses") {
      walletsOverview.style.display = "block";
    } else {
      walletsOverview.style.display = "none";
    }
  }

  if (tab === "admin") {
    loadAdminUsers().catch(err => console.error("Admin users load failed:", err));
    refreshAdminCommsBadges().catch(() => {});
  } else if (tab === "messages") {
    if (state.trialLocked) hideTrialExpiredOverlay();
    renderMessagesPanel().catch(err => console.error("Messages load failed:", err));
  } else {
    if (state.trialLocked) showTrialExpiredOverlay();
    ensureTabDataLoaded(tab).catch(err => console.error("Tab data load failed:", err));
  }

  try { updateSaleDraftDock(); } catch (_) {}

  // Load notes from database when Notes tab is activated
  if (tab === "notes") {
    loadNotesFromDatabase().catch(err => console.error("Notes load failed:", err));
  }
  
  // Load Bitcoin wallets from database when Bitcoin tab is activated
  if (tab === "bitcoin") {
    loadBitcoinWalletsFromDatabase().catch(err => console.error("Bitcoin wallet load failed:", err));
  }
  
  // Fetch Bitcoin price when expense tab is activated to ensure USD values are displayed
  if (tab === "expenses") {
    // Always fetch fresh price when expense tab loads
    btcFetchPrice().then(priceData => {
      if (priceData) {
        console.log('Bitcoin price fetched for expense section:', priceData);
        // Update expense wallets to show BTC USD equivalents
        renderExpenseWalletBar(getExpenseAccounts());
        
        // Force update USD values after a delay
        setTimeout(() => {
          const accounts = getExpenseAccounts({ applyUiFilters: false });
          const btcAccounts = accounts.filter(a => a.currency === 'BTC');
          btcAccounts.forEach(account => {
            const balance = Number(account.balance || 0);
            if (balance > 0 && priceData.price) {
              const usdValue = (balance * priceData.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              console.log(`Updating BTC wallet ${account.group_id} with USD value: $${usdValue}`);
              
              // Find and update the USD equivalent element
              const walletCard = document.querySelector(`[data-group-id="${account.group_id}"]`);
              if (walletCard) {
                const usdElement = walletCard.querySelector('.btc-usd-equivalent');
                if (usdElement) {
                  usdElement.innerHTML = `<span class="btc-usd-equivalent"><em>≈ $</em> <strong>${usdValue}</strong></span>`;
                } else {
                  // Create USD element if it doesn't exist
                  const statsDiv = walletCard.querySelector('.expense-wallet-stats');
                  if (statsDiv) {
                    const usdSpan = document.createElement('span');
                    usdSpan.className = 'btc-usd-equivalent';
                    usdSpan.innerHTML = `<em>≈ $</em> <strong>${usdValue}</strong>`;
                    statsDiv.appendChild(usdSpan);
                  }
                }
              }
            }
          });
        }, 500);
      }
    }).catch(err => console.error('Failed to fetch Bitcoin price:', err));
  }
}

// Function to set initial overview visibility for Expenses tab
function setInitialOverviewForExpenses() {
  const mainOverview = document.getElementById("mainOverview");
  const walletsOverview = document.getElementById("walletsOverviewSection");
  
  if (mainOverview) mainOverview.style.display = "none";
  if (walletsOverview) walletsOverview.style.display = "block";
}

function setCurrencyChoice(form, currency){
  const hidden = form.querySelector('input[name="currency"]');
  if (hidden) hidden.value = currency;
  const select = form.querySelector('select[name="currency"]');
  if (select) select.value = currency;
  form.querySelectorAll(".currency-chip").forEach(btn => btn.classList.toggle("active", btn.dataset.currency === currency));
  state.lastCurrency = currency;

  // Refresh loan wallet selector if present in this form
  const walletSel = form.querySelector('[name="loan_wallet_id"]') || form.querySelector('[name="payment_wallet_id"]');
  if (walletSel) populateLoanWalletSelector(currency, walletSel);
  if (form === els.goodsBoughtForm) {
    updateGoodsPurchaseWalletSelector();
  }
  syncExpenseBtcAccountFields(form);
}

function openEntryModal(mode, direction, options = {}){
  state.modalDirection = direction;
  state.modalInstallment = !!options.installment;

  els.entryModal.classList.remove("hide");
  els.entryModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  const principalDate = document.getElementById("entryPrincipalDateInline");
  if (els.modalDesc) els.modalDesc.classList.add("hide");

  if (mode === "principal"){
    if (state.modalInstallment) {
      els.modalTitle.textContent = "New installment plan";
      els.principalSubmitBtn.textContent = "Save installment plan";
    } else {
      els.modalTitle.textContent = direction === "given" ? "New loan given" : "New loan taken";
      els.principalSubmitBtn.textContent = direction === "given" ? "Save given loan" : "Save taken loan";
    }
    els.principalModalForm.classList.remove("hide");
    els.paymentModalForm.classList.add("hide");
    if (principalDate) {
      principalDate.classList.remove("hide");
      principalDate.required = true;
      principalDate.value = todayISO();
    }
    els.principalModalForm.reset();
    els.principalModalForm.querySelector('input[name="direction"]').value = direction;
    els.principalModalForm.querySelector('input[name="person_name"]').placeholder =
      state.modalInstallment ? "Lender / plan name" : (direction === "given" ? "Full name" : "Lender name");
    setCurrencyChoice(els.principalModalForm, state.lastCurrency || "AED");
    if (principalDate) principalDate.value = todayISO();
    defaultDateInputs(els.principalModalForm);
    if (principalDate && !principalDate.value) principalDate.value = todayISO();
    syncInstallmentPlanFormFields();
    updateInstallmentPlanPreview();

    // Wallet selector badge & population
    const walletBadge = document.getElementById("principalWalletBadge");
    if (walletBadge) {
      if (direction === "given") {
        walletBadge.textContent = "Loan Given → Deduct from wallet";
        walletBadge.className = "badge orange";
      } else {
        walletBadge.textContent = state.modalInstallment
          ? "Installment Plan → Add to wallet"
          : "Loan Taken → Add to wallet";
        walletBadge.className = "badge green";
      }
    }
    populateLoanWalletSelector(state.lastCurrency || "AED", document.getElementById("modalLoanWalletSelect"));
  } else {
    if (state.modalInstallment) {
      els.modalTitle.textContent = "Installment payment";
      els.paymentSubmitBtn.textContent = "Save installment payment";
    } else {
      els.modalTitle.textContent = direction === "given" ? "New received back entry" : "New returned back entry";
      els.paymentSubmitBtn.textContent = direction === "given" ? "Save received back" : "Save returned back";
    }
    els.paymentModalForm.classList.remove("hide");
    els.principalModalForm.classList.add("hide");
    if (principalDate) {
      principalDate.classList.add("hide");
      principalDate.required = false;
      principalDate.removeAttribute("required");
    }
    els.paymentModalForm.reset();
    els.paymentModalForm.querySelector('input[name="direction"]').value = direction;
    els.multiEntryCount.value = 1;
    renderMultiEntries(1);
    renderLoanSelectors();
    syncInstallmentPaymentFormFields(options.groupId || "", options.amount || null);
    updateInstallmentPaymentPreview();

    // Wallet selector badge
    const walletBadge = document.getElementById("paymentWalletBadge");
    if (walletBadge) {
      if (direction === "given") {
        walletBadge.textContent = "Received Back → Add to wallet";
        walletBadge.className = "badge green";
      } else {
        walletBadge.textContent = state.modalInstallment
          ? "Installment payment → Deduct from wallet"
          : "Returned Back → Deduct from wallet";
        walletBadge.className = "badge orange";
      }
    }
    // Populate wallet selector based on first open loan's currency (if available)
    const firstLoanOption = els.modalLoanSelect.options[els.modalLoanSelect.selectedIndex];
    const selectedGroup = options.groupId || firstLoanOption?.value;
    let loanCurrency = null;
    if (selectedGroup) {
      const principalEntry = state.entries.find(e => e.group_id === selectedGroup && e.entry_kind === "principal");
      if (principalEntry) loanCurrency = principalEntry.currency;
      if (options.groupId) els.modalLoanSelect.value = options.groupId;
    }
    populateLoanWalletSelector(loanCurrency, document.getElementById("modalPaymentWalletSelect"));
    if (options.amount != null && Number(options.amount) > 0) {
      const amountInput = els.paymentModalForm.querySelector('[name="action_amount_0"]');
      if (amountInput) amountInput.value = trimInventoryNumber(options.amount);
      updateInstallmentPaymentPreview();
    }
  }
}

function syncInstallmentPlanFormFields(){
  const show = !!state.modalInstallment;
  ["installmentCountGroup", "installmentMonthlyPreviewField", "installmentSchedulePreviewWrap"].forEach(id => {
    document.getElementById(id)?.classList.toggle("hide", !show);
  });
  const countInput = document.getElementById("installmentCountInput");
  if (countInput) {
    countInput.required = show;
    if (!show) countInput.value = "";
  }
}

function updateInstallmentPlanPreview(){
  const previewInput = document.getElementById("installmentMonthlyPreview");
  const previewWrap = document.getElementById("installmentSchedulePreview");
  if (!previewInput || !previewWrap || !state.modalInstallment) return;
  const form = els.principalModalForm;
  const total = Number(form?.querySelector('[name="principal_amount"]')?.value || 0);
  const count = Math.floor(Number(document.getElementById("installmentCountInput")?.value || 0));
  const currency = String(form?.querySelector('[name="currency"]')?.value || "AED");
  const startDate = String(
    document.getElementById("entryPrincipalDateInline")?.value ||
    form?.elements?.namedItem?.("loan_date")?.value ||
    todayISO()
  );
  if (!(total > 0) || count < 2) {
    previewInput.value = "";
    previewWrap.innerHTML = `<strong>Schedule preview</strong><p>Enter total amount and at least 2 installments.</p>`;
    return;
  }
  const amounts = computeInstallmentAmounts(total, count, currency);
  previewInput.value = `${moneyText(amounts.installmentAmount, currency)} × ${count - 1} + last ${moneyText(amounts.lastAmount, currency)}`;
  const sample = Array.from({ length: Math.min(count, 4) }, (_, i) => {
    const due = addMonthsToISODate(startDate, i);
    const amt = i === count - 1 ? amounts.lastAmount : amounts.installmentAmount;
    return `<li><span>#${i + 1} · ${escapeHtml(displayDate(due))}</span><strong>${money(amt, currency)}</strong></li>`;
  }).join("");
  const more = count > 4 ? `<li class="installment-preview-more">+ ${count - 4} more monthly installment${count - 4 === 1 ? "" : "s"}</li>` : "";
  previewWrap.innerHTML = `
    <strong>Schedule preview</strong>
    <p>${escapeHtml(String(count))} months · total ${money(total, currency)}</p>
    <ul class="installment-preview-list">${sample}${more}</ul>
  `;
}

function syncInstallmentPaymentFormFields(preferredGroupId = "", preferredAmount = null){
  const show = !!state.modalInstallment;
  document.getElementById("installmentPaymentPreviewWrap")?.classList.toggle("hide", !show);
  const multiGroup = document.getElementById("paymentMultiCountGroup");
  if (multiGroup) multiGroup.classList.toggle("hide", show);
  if (show) {
    els.multiEntryCount.value = 1;
    renderMultiEntries(1);
  }
  if (preferredGroupId && els.modalLoanSelect) {
    els.modalLoanSelect.value = preferredGroupId;
  }
  if (preferredAmount != null && Number(preferredAmount) > 0) {
    const amountInput = els.paymentModalForm?.querySelector('[name="action_amount_0"]');
    if (amountInput) amountInput.value = trimInventoryNumber(preferredAmount);
  }
}

function updateInstallmentPaymentPreview(){
  const box = document.getElementById("installmentPaymentPreview");
  if (!box || !state.modalInstallment) return;
  const groupId = String(els.modalLoanSelect?.value || "").trim();
  const plan = getInstallmentPlanGroup(groupId);
  const amount = Number(els.paymentModalForm?.querySelector('[name="action_amount_0"]')?.value || 0);
  if (!plan) {
    box.innerHTML = `<strong>Allocation preview</strong><p>Select an installment plan.</p>`;
    return;
  }
  if (!plan.schedule) {
    box.innerHTML = `
      <strong>Legacy plan</strong>
      <p>Remaining balance: <strong>${money(Math.max(Number(plan.principal.principal_amount || 0) - plan.payments.reduce((s, p) => s + Number(p.action_amount || 0), 0), 0), plan.currency)}</strong></p>
      <p class="installment-preview-hint">No monthly schedule yet. Use <strong>Edit plan / schedule</strong> to convert this plan; until then payments apply to the open balance.</p>
    `;
    return;
  }
  const next = plan.schedule.nextOpen;
  const allocation = amount > 0 ? allocateInstallmentPayment(plan.schedule, amount) : { allocations: [], applied: 0, leftover: 0 };
  const rows = allocation.allocations.map(row =>
    `<li><span>#${row.index} due ${escapeHtml(displayDate(row.dueDate))}</span><strong>${money(row.amount, plan.currency)}</strong></li>`
  ).join("");
  box.innerHTML = `
    <strong>Allocation preview</strong>
    <p>Next due: <strong>#${next ? next.index : "—"}</strong> · ${next ? money(next.balance, plan.currency) : "—"} · Remaining plan ${money(plan.schedule.remainingTotal, plan.currency)}</p>
    ${amount > 0 ? `<ul class="installment-preview-list">${rows || "<li>No open installments</li>"}</ul>` : `<p class="installment-preview-hint">Enter a payment amount to preview under/over allocation.</p>`}
    ${allocation.leftover > 0.00000001 ? `<p class="installment-preview-warn">Extra ${money(allocation.leftover, plan.currency)} exceeds open installments.</p>` : ""}
  `;
}

function openInstallmentPaymentModal(groupId, amount = null){
  openEntryModal("payment", "taken", { installment: true, groupId, amount });
}

function openInstallmentEditModal(groupId){
  if (!teamCapability("can_edit_entries")) {
    alert("You do not have permission to edit entries.");
    return;
  }
  const plan = getInstallmentPlanGroup(groupId);
  const form = els.installmentEditForm;
  if (!plan?.principal || !form || !els.installmentEditModal) {
    alert("Installment plan not found.");
    return;
  }
  const principal = plan.principal;
  const meta = installmentMetaFromNotes(principal.notes);
  form.querySelector('[name="group_id"]').value = plan.group_id;
  form.querySelector('[name="person_name"]').value = principal.person_name || "";
  setCurrencyChoice(form, principal.currency || "AED");
  form.querySelector('[name="principal_amount"]').value = principal.principal_amount || "";
  const dateEl = document.getElementById("installmentEditDateInline") || form.elements.namedItem("loan_date");
  if (dateEl) dateEl.value = principal.loan_date || todayISO();
  form.querySelector('[name="installment_count"]').value = meta.count && meta.count >= 2 ? meta.count : "";
  form.querySelector('[name="notes"]').value = cleanInstallmentDisplayNote(principal.notes) || "";

  const title = document.getElementById("installmentEditTitle");
  const desc = document.getElementById("installmentEditDesc");
  if (title) title.textContent = plan.schedule ? "Edit installment schedule" : "Convert to installment schedule";
  if (desc) {
    desc.classList.add("hide");
    desc.textContent = plan.schedule
      ? "Change the monthly plan. Existing payments stay and are re-applied in date order."
      : "Set installment count for this legacy plan. Existing payments stay and are applied oldest-first across the new schedule.";
  }
  if (els.installmentEditSummary) {
    els.installmentEditSummary.innerHTML = `
      <div><small>Paid so far</small><strong>${money(plan.paidTotal, plan.currency)}</strong></div>
      <div><small>Remaining</small><strong>${money(plan.remaining, plan.currency)}</strong></div>
      <div><small>Payments</small><strong>${plan.payments.length}</strong></div>
      <div><small>Current setup</small><strong>${plan.schedule ? `${plan.schedule.count} installments` : "Legacy balance"}</strong></div>
    `;
  }

  updateInstallmentEditPreview();
  els.installmentEditModal.classList.remove("hide");
  els.installmentEditModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function updateInstallmentEditPreview(){
  const form = els.installmentEditForm;
  const preview = document.getElementById("installmentEditPreview");
  const monthlyInput = document.getElementById("installmentEditMonthly");
  if (!form || !preview) return;
  const groupId = String(form.querySelector('[name="group_id"]')?.value || "").trim();
  const plan = getInstallmentPlanGroup(groupId);
  const total = Number(form.querySelector('[name="principal_amount"]')?.value || 0);
  const count = Math.floor(Number(form.querySelector('[name="installment_count"]')?.value || 0));
  const currency = String(form.querySelector('[name="currency"]')?.value || "AED");
  const startDate = String(
    document.getElementById("installmentEditDateInline")?.value ||
    form.elements?.namedItem?.("loan_date")?.value ||
    todayISO()
  );
  if (!(total > 0) || count < 2) {
    if (monthlyInput) monthlyInput.value = "";
    preview.innerHTML = `<strong>Updated schedule</strong><p>Enter total amount and at least 2 installments.</p>`;
    return;
  }
  const amounts = computeInstallmentAmounts(total, count, currency);
  if (monthlyInput) {
    monthlyInput.value = `${moneyText(amounts.installmentAmount, currency)} × ${count - 1} + last ${moneyText(amounts.lastAmount, currency)}`;
  }
  const draftPrincipal = {
    ...(plan?.principal || {}),
    principal_amount: total,
    currency,
    loan_date: startDate,
    notes: upsertInstallmentMetaInNote("", buildInstallmentScheduleMeta(total, count, currency, startDate))
  };
  const remapped = remapInstallmentPaymentsToSchedule(draftPrincipal, plan?.payments || []);
  const schedule = remapped.schedule;
  const sample = (schedule?.slots || []).slice(0, 4).map(slot =>
    `<li><span>#${slot.index} · ${escapeHtml(displayDate(slot.dueDate))} · ${escapeHtml(slot.status)}</span><strong>${money(slot.paid, currency)} / ${money(slot.scheduled, currency)}</strong></li>`
  ).join("");
  const more = count > 4 ? `<li class="installment-preview-more">+ ${count - 4} more</li>` : "";
  preview.innerHTML = `
    <strong>Updated schedule with existing payments</strong>
    <p>${count} months · total ${money(total, currency)} · after remap: paid ${money(schedule?.paidTotal || 0, currency)}, remaining ${money(schedule?.remainingTotal || total, currency)}</p>
    <ul class="installment-preview-list">${sample}${more}</ul>
    ${remapped.leftoverTotal > 0.00000001
      ? `<p class="installment-preview-warn">Note: ${money(remapped.leftoverTotal, currency)} of past payments exceeds this schedule total and cannot be slotted.</p>`
      : `<p class="installment-preview-hint">${(plan?.payments || []).length} existing payment(s) will be re-applied oldest first (FIFO).</p>`}
  `;
}

async function submitInstallmentEdit(){
  assertTeamCapability("can_edit_entries", "You do not have permission to edit entries.");
  const form = els.installmentEditForm;
  if (!form) return;
  const groupId = String(form.querySelector('[name="group_id"]')?.value || "").trim();
  const plan = getInstallmentPlanGroup(groupId);
  if (!plan?.principal) throw new Error("Installment plan not found.");

  const personName = String(form.querySelector('[name="person_name"]')?.value || "").trim();
  const currency = String(form.querySelector('[name="currency"]')?.value || "").trim();
  const amount = Number(form.querySelector('[name="principal_amount"]')?.value || 0);
  const loanDate = String(
    document.getElementById("installmentEditDateInline")?.value ||
    form.elements?.namedItem?.("loan_date")?.value ||
    ""
  ).trim();
  const count = Math.floor(Number(form.querySelector('[name="installment_count"]')?.value || 0));
  const displayNote = String(form.querySelector('[name="notes"]')?.value || "").trim();

  if (!personName || !currency || !(amount > 0) || !loanDate) throw new Error("Complete all required fields.");
  if (count < 2 || count > 120) throw new Error("Enter between 2 and 120 installments.");

  const paidTotal = plan.payments.reduce((sum, row) => sum + Number(row.action_amount || 0), 0);
  if (amount + 0.00000001 < paidTotal) {
    throw new Error(`Total amount cannot be less than payments already recorded (${moneyText(paidTotal, currency)}).`);
  }

  const scheduleMeta = buildInstallmentScheduleMeta(amount, count, currency, loanDate);
  const principalNotes = upsertInstallmentMetaInNote(displayNote, scheduleMeta);
  const draftPrincipal = {
    ...plan.principal,
    person_name: personName,
    currency,
    principal_amount: amount,
    loan_date: loanDate,
    notes: principalNotes
  };
  const remapped = remapInstallmentPaymentsToSchedule(draftPrincipal, plan.payments);
  if (remapped.leftoverTotal > 0.00000001) {
    const ok = confirm(
      `${moneyText(remapped.leftoverTotal, currency)} of existing payments exceeds the new schedule total and will stay on payment history without a slot. Continue?`
    );
    if (!ok) return;
  }

  const updatedPrincipal = { ...draftPrincipal };
  state.entries = state.entries.map(entry => entry.id === plan.principal.id ? updatedPrincipal : entry);
  if (!isBackupMode()) {
    queueDatabasePatch(plan.principal.id, {
      person_name: personName,
      currency,
      principal_amount: amount,
      loan_date: loanDate,
      notes: principalNotes
    }, "Installment plan", updatedPrincipal);
  }

  for (const row of remapped.remaps){
    const updatedPayment = {
      ...row.payment,
      person_name: personName,
      currency,
      loan_date: loanDate,
      entry_kind: row.entry_kind,
      notes: row.notes
    };
    state.entries = state.entries.map(entry => entry.id === row.id ? updatedPayment : entry);
    if (!isBackupMode()) {
      queueDatabasePatch(row.id, {
        person_name: personName,
        currency,
        loan_date: loanDate,
        entry_kind: row.entry_kind,
        notes: row.notes
      }, "Installment payment remap", updatedPayment);
    }
  }

  closeModal("installmentEditModal");
  if (isBackupMode()) refreshBackupView();
  else renderAll();
  logCompanyActivity(
    "edit",
    "installments",
    `Updated installment plan "${personName}" (${moneyText(amount, currency)}, ${count} installments)`,
    { entityType: "installment", entityId: groupId }
  );
  activate("installments");
}

async function openGoodsModal(mode, options = {}){
  els.goodsModal.classList.remove("hide");
  els.goodsModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  els.goodsBoughtForm.classList.toggle("hide", mode !== "bought");
  els.goodsSoldForm.classList.toggle("hide", mode !== "sold");
  const dialog = document.getElementById("goodsModalDialog");
  const soldDateInline = document.getElementById("goodsSoldDateInline");
  const boughtDateInline = els.goodsBoughtDateInline || document.getElementById("goodsBoughtDateInline");
  dialog?.classList.add("goods-sale-dialog");
  if (soldDateInline) {
    soldDateInline.classList.toggle("hide", mode !== "sold");
    soldDateInline.required = mode === "sold";
    if (mode !== "sold") soldDateInline.removeAttribute("required");
  }
  if (boughtDateInline) {
    boughtDateInline.classList.toggle("hide", mode !== "bought");
    boughtDateInline.required = mode === "bought";
    if (mode !== "bought") boughtDateInline.removeAttribute("required");
  }
  const seedFromGroupId = String(options.seedFromGroupId || "").trim();
  const addBrandMode = options.addBrand === true || options.relatedOnly === true;
  const restockOnly = !addBrandMode && (
    options.restockOnly === true || (!!options.groupId && !seedFromGroupId && options.allowRelated !== true)
  );
  // Legacy groupId without seed = restock-only. seedFromGroupId = section family purchase.
  state.inventoryDraft.purchaseGroupId = restockOnly ? String(options.groupId || options.seedFromGroupId || "") : "";
  state.inventoryDraft.purchaseSeedType = String(options.seedType || "").trim();
  state.inventoryDraft.purchaseSeedCategory = String(options.seedCategory || "").trim();
  state.inventoryDraft.purchaseSeedCurrency = String(options.seedCurrency || "").trim();
  state.inventoryDraft.saleGroupIds = (options.groupId || seedFromGroupId)
    ? [String(options.groupId || seedFromGroupId)]
    : [];
  if (els.goodsNewItemFields) els.goodsNewItemFields.classList.add("hide");
  if (els.goodsNewItemToggleBtn) els.goodsNewItemToggleBtn.textContent = "+ Add New";

  if (mode === "bought"){
    try { await ensureInventoryBrandsLoaded(false); } catch (_) {}
    const seedGroupId = seedFromGroupId || (restockOnly ? state.inventoryDraft.purchaseGroupId : "");
    const seedGroup = seedGroupId
      ? getGoodsGroups({ applyUiFilters: false }).find(g => g.group_id === seedGroupId)
      : null;
    const familyMode = !!seedGroup && !restockOnly && !addBrandMode;

    if (seedGroup) {
      state.inventoryDraft.purchaseSeedType = normalizeInventoryItemType(seedGroup.itemType || "General");
      state.inventoryDraft.purchaseSeedCategory = normalizeInventoryCategory(seedGroup.itemCategory);
      state.inventoryDraft.purchaseSeedCurrency = seedGroup.currency || state.lastCurrency || "AED";
    } else if (options.seedType) {
      state.inventoryDraft.purchaseSeedType = normalizeInventoryItemType(options.seedType);
      if (options.seedCategory) {
        state.inventoryDraft.purchaseSeedCategory = normalizeInventoryCategory(options.seedCategory);
      }
    }

    if (addBrandMode) {
      const typeLabel = state.inventoryDraft.purchaseSeedType || seedGroup?.itemType || "section";
      els.goodsModalTitle.textContent = `Add brand / variant · ${typeLabel}`;
      els.goodsModalDesc.textContent = `Create new ${typeLabel} stock. Each brand + variant becomes its own sellable item in this section.`;
    } else if (familyMode) {
      els.goodsModalTitle.textContent = `Add ${normalizeInventoryItemType(seedGroup.itemType)} purchase`;
      els.goodsModalDesc.textContent = `Restock this item, or add more brands/variants under ${normalizeInventoryItemType(seedGroup.itemType)}.`;
    } else if (seedGroup) {
      els.goodsModalTitle.textContent = "Restock inventory item";
      els.goodsModalDesc.textContent = "Record additional stock for this exact item.";
    } else {
      els.goodsModalTitle.textContent = "Add Inventory Item";
      els.goodsModalDesc.textContent = "Add purchased stock. Item type becomes a section (Perfumes, Electronics…). Brand + variant are sellable lines inside it.";
    }
    els.goodsModalDesc.classList.toggle("hide", false);
    els.goodsBoughtForm.reset();
    if (boughtDateInline) boughtDateInline.value = todayISO();

    if (addBrandMode) {
      const seed = {
        itemType: state.inventoryDraft.purchaseSeedType || seedGroup?.itemType || "General",
        itemCategory: state.inventoryDraft.purchaseSeedCategory || seedGroup?.itemCategory || INVENTORY_CATEGORY_COUNT,
        currency: state.inventoryDraft.purchaseSeedCurrency || seedGroup?.currency || state.lastCurrency || "AED"
      };
      if (els.goodsPurchaseLines) els.goodsPurchaseLines.innerHTML = "";
      addGoodsPurchaseLine(seed);
    } else if (seedGroup) {
      const restockPrefill = {
        restockGroupId: seedGroup.group_id,
        locked: true,
        itemName: seedGroup.person_name || "",
        itemType: seedGroup.itemType || "General",
        itemCategory: seedGroup.itemCategory,
        quantityUnit: seedGroup.quantityUnit,
        brand: seedGroup.brand || "",
        brandId: seedGroup.brandId || "",
        variantLabel: seedGroup.variantLabel || "",
        variantId: seedGroup.variantId || "",
        currency: seedGroup.currency || state.lastCurrency || "AED",
        sellingPrice: seedGroup.defaultUnitSoldPrice ? trimInventoryNumber(seedGroup.defaultUnitSoldPrice) : "",
        itemDescription: seedGroup.itemDescription || "",
        defaultTaxRate: seedGroup.defaultTaxRate,
        defaultTaxMode: seedGroup.defaultTaxMode
      };
      if (familyMode) {
        if (els.goodsPurchaseLines) els.goodsPurchaseLines.innerHTML = "";
        addGoodsPurchaseLine(restockPrefill);
        addGoodsPurchaseLine({
          ...inventoryPurchaseLineSeedPrefill(),
          itemCategory: seedGroup.itemCategory,
          currency: seedGroup.currency || state.lastCurrency || "AED"
        });
      } else {
        renderGoodsPurchaseLines(restockPrefill);
      }
    } else {
      renderGoodsPurchaseLines({
        currency: state.lastCurrency || "AED",
        itemType: state.inventoryDraft.purchaseSeedType || "General",
        itemCategory: state.inventoryDraft.purchaseSeedCategory || INVENTORY_CATEGORY_COUNT
      });
    }
    defaultDateInputs(els.goodsBoughtForm);
    if (boughtDateInline && !boughtDateInline.value) boughtDateInline.value = todayISO();
    updateGoodsBoughtTotal();
    syncGoodsPurchaseAddButtonLabel();
  } else {
    const saleFocusId = options.groupId || seedFromGroupId;
    const addingCustomerOnly = options.addCustomer && !saleFocusId;
    els.goodsModalTitle.textContent = addingCustomerOnly ? "Add Customer" : "Create Sales Invoice";
    els.goodsModalDesc.textContent = addingCustomerOnly
      ? "Save customer details now, or choose items if you also want to create an invoice."
      : "";
    els.goodsModalDesc.classList.toggle("hide", !addingCustomerOnly);
    els.goodsSoldForm.reset();
    els.goodsSoldForm.dataset.addCustomerOnly = addingCustomerOnly ? "1" : "0";
    const soldSubmit = els.goodsSoldForm.querySelector('button[type="submit"]');
    if (soldSubmit) soldSubmit.textContent = addingCustomerOnly ? "Save Customer" : "Save Sale";
    if (soldDateInline) soldDateInline.value = todayISO();
    if (els.goodsReceiptNumber) els.goodsReceiptNumber.value = nextInvoiceNumber();
    if (els.goodsSalePaidAmount) {
      els.goodsSalePaidAmount.dataset.autoPaid = "true";
      els.goodsSalePaidAmount.disabled = false;
      els.goodsSalePaidAmount.value = "";
      els.goodsSalePaidAmount.placeholder = "0.00";
    }
    if (els.goodsSaleBalanceAmount) els.goodsSaleBalanceAmount.value = "";
    renderGoodsCustomerOptions();
    if (options.addCustomer && els.goodsCustomerSelect) {
      els.goodsCustomerSelect.value = INVENTORY_NEW_CUSTOMER_VALUE;
      syncGoodsCustomerFields();
      els.goodsNewCustomerName?.focus();
    }
    syncGoodsCustomerFields();
    renderGoodsSaleLines(state.inventoryDraft.saleGroupIds || []);
    renderGoodsSelectors();
    defaultDateInputs(els.goodsSoldForm);
    if (soldDateInline && !soldDateInline.value) soldDateInline.value = todayISO();
    updateGoodsSaleGrandTotal();
    updateGoodsSaleWalletSelector();
  }
}

async function saveGoodsBought(form){
  const fd = new FormData(form);
  const legacyRestockGroupId = String(state.inventoryDraft.purchaseGroupId || "").trim();
  const allGroups = getGoodsGroups({ applyUiFilters: false });
  const groupsById = new Map(allGroups.map(g => [String(g.group_id), g]));
  const walletId = String(fd.get("purchase_wallet_id") || "").trim();
  const boughtDate = String(fd.get("bought_date") || "");
  const lines = collectGoodsPurchaseLines();
  if (!boughtDate) throw new Error("Purchase date is required.");
  if (!lines.length) throw new Error("Add at least one purchase item.");

  const prepared = lines.map((line, index) => {
    // Restock-only modal uses purchaseGroupId; family mode stamps data-restock-group-id per line.
    // Prefer per-line restock stamp. Fall back to restock-only modal group only when there is a single line.
    const restockGroupId = String(line.restockGroupId || "").trim()
      || (legacyRestockGroupId && lines.length === 1 ? legacyRestockGroupId : "");
    const restockGroup = restockGroupId ? groupsById.get(restockGroupId) : null;
    const hasPrice = Number(line.unitActualPrice || 0) > 0;
    // Skip unused restock row when user only adds a new brand/variant.
    if (restockGroup && !hasPrice) return null;
    // Skip empty extra lines (e.g. unused "Add brand / variant" row).
    if (!restockGroup && !String(line.itemName || "").trim() && !hasPrice) return null;

    const itemName = restockGroup ? restockGroup.person_name : line.itemName;
    const currency = restockGroup ? restockGroup.currency : line.currency;
    const itemCategory = restockGroup
      ? normalizeInventoryCategory(restockGroup.itemCategory)
      : normalizeInventoryCategory(line.itemCategory);
    const itemType = restockGroup
      ? normalizeInventoryItemType(restockGroup.itemType)
      : normalizeInventoryItemType(line.itemType);
    const quantityUnit = inventoryBaseUnitForCategory(itemCategory);
    const boughtQty = normalizeStoredInventoryQty(line.boughtQty, itemCategory, 0);
    const unitActualPrice = Number(line.unitActualPrice || 0);
    const sellingPrice = Number(line.sellingPrice || 0);
    const itemDescription = restockGroup
      ? (restockGroup.itemDescription || line.itemDescription || "")
      : line.itemDescription;
    const brand = restockGroup ? (restockGroup.brand || "") : String(line.brand || "").trim();
    const brandId = restockGroup ? (restockGroup.brandId || "") : String(line.brandId || "").trim();
    const variantLabel = restockGroup ? (restockGroup.variantLabel || "") : String(line.variantLabel || "").trim();
    const variantId = restockGroup ? (restockGroup.variantId || "") : String(line.variantId || "").trim();
    if (!itemName || !currency) throw new Error(`Complete all required fields on item ${index + 1}.`);
    if (!(unitActualPrice > 0)) throw new Error(`Enter a valid purchase price on item ${index + 1}.`);
    if (!(boughtQty > 0)) throw new Error(`Enter a valid ${inventoryQtyFieldLabel(itemCategory).toLowerCase()} on item ${index + 1}.`);
    if (!itemType) throw new Error(`Select or enter an item type on item ${index + 1}.`);
    const allowedCurrencies = getAllowedCurrencies();
    const pageCurrencies = getPageScopedCurrencies();
    const normalizedCurrency = normalizeCurrencyCode(currency);
    if (!allowedCurrencies.includes(normalizedCurrency) || !pageCurrencies.includes(normalizedCurrency)) {
      throw new Error(`Currency "${currency}" is not supported on item ${index + 1}.`);
    }
    const purchaseTax = calculateTaxBreakdown(
      unitActualPrice * boughtQty,
      line.taxRate,
      line.taxMode,
      line.taxApplied
    );
    return {
      restockGroup,
      itemName,
      currency: normalizedCurrency,
      itemCategory,
      itemType,
      quantityUnit,
      brand,
      brandId,
      variantLabel,
      variantId,
      boughtQty,
      unitActualPrice,
      sellingPrice,
      itemDescription,
      purchaseTax,
      totalActualPrice: purchaseTax.total
    };
  }).filter(Boolean);

  if (!prepared.length) throw new Error("Add at least one purchase item with a name and cost.");

  const currencies = new Set(prepared.map(line => line.currency));
  const singleCurrency = currencies.size === 1;
  const walletCurrency = singleCurrency ? prepared[0].currency : "";
  const walletTotal = prepared.reduce((sum, line) => sum + Number(line.totalActualPrice || 0), 0);
  if (walletId) {
    if (!singleCurrency) throw new Error("Wallet deduction is available only when all purchase items share one currency.");
    validateInventoryWallet(walletId, walletCurrency, walletTotal, "deduct");
  }

  // Persist any custom brand names into the catalog for future filtering/variants.
  if (!isGuestMode() && state.sessionUser) {
    for (const line of prepared) {
      if (!line.brand || line.brandId || line.restockGroup) continue;
      const existing = getInventoryBrandCatalog().find(b =>
        String(b.name || "").trim().toLowerCase() === line.brand.toLowerCase()
      );
      if (existing) {
        line.brandId = existing.id;
        continue;
      }
      try {
        const res = unwrapRpcJson(await supabaseRpc("app_upsert_goods_brand", {
          p_id: null,
          p_name: line.brand,
          p_item_type: line.itemType || "General",
          p_notes: null
        }));
        if (res?.id) line.brandId = res.id;
      } catch (err) {
        console.warn("Could not auto-save inventory brand:", err);
      }
    }
    try { await ensureInventoryBrandsLoaded(true); } catch (_) {}
  }

  const payloads = [];
  const usedCodes = getExistingInventoryCodes();
  for (const line of prepared) {
    if (line.restockGroup) {
      const currentGroup = line.restockGroup;
      const itemCode = currentGroup.itemCode || nextPrefixedHexCode("ITM", usedCodes);
      payloads.push({
        group_id: currentGroup.group_id,
        direction: "taken",
        entry_kind: "partial",
        person_name: currentGroup.person_name,
        currency: currentGroup.currency,
        principal_amount: null,
        action_amount: line.totalActualPrice,
        loan_date: currentGroup.principal?.loan_date,
        action_date: boughtDate,
        notes: upsertGoodsMetaInNote(normalizeGoodsNote(null, true), {
          boughtQty: line.boughtQty,
          unitActualPrice: line.unitActualPrice,
          unitSoldPrice: line.sellingPrice > 0 ? line.sellingPrice : null,
          itemCode,
          itemDescription: line.itemDescription,
          itemType: line.itemType,
          itemCategory: line.itemCategory,
          quantityUnit: line.quantityUnit,
          brand: line.brand || currentGroup.brand || "",
          brandId: line.brandId || currentGroup.brandId || "",
          variantLabel: line.variantLabel || currentGroup.variantLabel || "",
          variantId: line.variantId || currentGroup.variantId || "",
          transactionType: "PURCHASE",
          ...taxMetaFromBreakdown(line.purchaseTax)
        })
      });
      continue;
    }

    const itemCode = nextPrefixedHexCode("ITM", usedCodes);
    payloads.push({
      group_id: crypto.randomUUID(),
      direction: "taken",
      entry_kind: "principal",
      person_name: line.itemName,
      currency: line.currency,
      principal_amount: line.totalActualPrice,
      action_amount: null,
      loan_date: boughtDate,
      action_date: null,
      notes: upsertGoodsMetaInNote(normalizeGoodsNote(null, true), {
        boughtQty: line.boughtQty,
        unitActualPrice: line.unitActualPrice,
        unitSoldPrice: line.sellingPrice > 0 ? line.sellingPrice : null,
        itemCode,
        itemDescription: line.itemDescription,
        itemType: line.itemType,
        itemCategory: line.itemCategory,
        quantityUnit: line.quantityUnit,
        brand: line.brand || "",
        brandId: line.brandId || "",
        variantLabel: line.variantLabel || "",
        variantId: line.variantId || "",
        transactionType: "ITEM",
        ...taxMetaFromBreakdown(line.purchaseTax)
      })
    });
  }

  const restockCount = prepared.filter(line => line.restockGroup).length;
  const newCount = prepared.length - restockCount;
  saveEntriesImmediately(payloads, {
    label: newCount && restockCount
      ? "Inventory purchase"
      : (restockCount ? "Inventory purchase" : (payloads.length > 1 ? "Inventory items" : "Inventory item"))
  });
  if (walletId) {
    const walletLabel = prepared.length === 1
      ? {
          itemName: prepared[0].itemName,
          itemCode: prepared[0].restockGroup?.itemCode || ""
        }
      : {
          itemName: `${prepared.length} items`,
          itemCode: ""
        };
    await createWalletEntryForInventory(walletId, walletTotal, boughtDate, walletCurrency, "purchase", walletLabel);
  }
  closeModal("goodsModal");
}

async function saveInventoryCustomerOnly(form, customerName, customerContact, fd){
  const today = String(fd.get("sold_date") || "") || todayISO();
  const allowedCurrencies = getPageScopedCurrencies();
  const currency = allowedCurrencies.includes(state.lastCurrency)
    ? state.lastCurrency
    : (allowedCurrencies[0] || "AED");
  const payload = {
    group_id: crypto.randomUUID(),
    direction: "taken",
    entry_kind: "partial",
    person_name: customerName,
    currency,
    principal_amount: null,
    action_amount: 0,
    loan_date: today,
    action_date: today,
    notes: upsertGoodsMetaInNote(normalizeGoodsNote("Customer record", true), {
      customerName,
      customerPhone: customerContact.phone || "",
      customerAddress: customerContact.address || "",
      customerCompany: customerContact.company || "",
      customerTrn: customerContact.trn || "",
      customerEmail: customerContact.email || "",
      transactionType: INVENTORY_TX_CUSTOMER
    })
  };
  // Await the domain write so a standalone customer survives refresh immediately.
  await saveEntriesImmediately(payload, { label: "Customer", awaitSync: true });
  state.inventorySalesLoaded = false;
  try {
    if (typeof loadInventorySalesForCustomers === "function") {
      await loadInventorySalesForCustomers({ force: true });
    }
  } catch (_) {
    // The local optimistic customer event remains visible; retry on next Customers open.
    state.inventorySalesLoaded = false;
  }
  form.reset();
  closeModal("goodsModal");
  if (state.inventoryView === "customers" && typeof renderInventoryOutstandingSection === "function") {
    renderInventoryOutstandingSection();
  }
}

async function saveGoodsSold(form){
  const fd = new FormData(form);
  const soldDate = String(fd.get("sold_date") || "");
  const customerName = getSelectedGoodsCustomerName(form);
  const customerContact = getSelectedGoodsCustomerContact(form);
  const receiptNumber = String(fd.get("receipt_number") || "").trim() || nextInvoiceNumber();
  const soldNotes = String(fd.get("notes") || "").trim() || null;
  const walletId = String(fd.get("sale_wallet_id") || "").trim();
  const saleLines = collectGoodsSaleLines();
  if (!customerName) throw new Error("Customer name is required.");
  if (!saleLines.length) {
    await saveInventoryCustomerOnly(form, customerName, customerContact, fd);
    return;
  }
  if (!soldDate) throw new Error("Sold date is required.");
  closeModal("goodsModal");
  await commitInventorySaleInvoice({
    soldDate,
    customerName,
    customerContact,
    receiptNumber,
    soldNotes,
    walletId,
    paidAmountRaw: String(fd.get("paid_amount") || "").trim(),
    saleLines
  });
}

function addInventorySettlementPayloads(payloads, receiptData, remainingSettlement, settlementDate, settlementNotes, settlementId, paymentReceiptNumber = ""){
  const rows = receiptData.saleRows
    .filter(saleRow => saleRow.balance > 0.00000001)
    .sort((a, b) =>
      dateStamp(a.entry.action_date || a.entry.created_at) - dateStamp(b.entry.action_date || b.entry.created_at) ||
      String(a.entry.id || "").localeCompare(String(b.entry.id || ""))
    );
  for (const row of rows){
    if (remainingSettlement.amount <= 0.00000001) break;
    const paidForLine = Math.min(row.balance, remainingSettlement.amount);
    remainingSettlement.amount = Math.max(remainingSettlement.amount - paidForLine, 0);
    const lineBalance = Math.max(row.balance - paidForLine, 0);
    payloads.push({
      group_id: row.entry.group_id,
      direction: "taken",
      entry_kind: lineBalance <= 0.00000001 ? "full" : "partial",
      person_name: row.principalEntry?.person_name || row.itemName,
      currency: row.currency,
      principal_amount: null,
      action_amount: paidForLine,
      loan_date: row.entry.loan_date,
      action_date: settlementDate,
      notes: upsertGoodsMetaInNote(normalizeGoodsNote(settlementNotes, true), {
        itemCode: row.itemCode,
        itemCategory: row.itemCategory,
        quantityUnit: inventoryBaseUnitForCategory(row.itemCategory),
        customerName: receiptData.customerName,
        customerPhone: receiptData.customerPhone || "",
        customerAddress: receiptData.customerAddress || "",
        customerCompany: receiptData.customerCompany || "",
        customerTrn: receiptData.customerTrn || "",
        customerEmail: receiptData.customerEmail || "",
        receiptNumber: receiptData.receiptNumber,
        invoiceNumber: receiptData.invoiceNumber,
        paymentReceiptNumber,
        transactionType: INVENTORY_TX_SETTLEMENT,
        paidAmount: paidForLine,
        balanceAmount: lineBalance,
        paymentStatus: lineBalance <= 0.00000001 ? "FULL" : "PARTIAL",
        settlementForEntryId: row.entry.id,
        settlementId
      })
    });
  }
}

function renderGoodsSettlementInvoiceList(invoices){
  if (!els.goodsSettlementInvoiceListField || !els.goodsSettlementInvoiceList) return;
  if (!invoices.length){
    els.goodsSettlementInvoiceListField.classList.add("hide");
    els.goodsSettlementInvoiceList.innerHTML = "";
    return;
  }
  els.goodsSettlementInvoiceListField.classList.remove("hide");
  els.goodsSettlementInvoiceList.innerHTML = invoices.map(invoice => `
    <label class="settlement-invoice-option">
      <input type="checkbox" class="goods-settlement-invoice-check" value="${escapeHtml(invoice.receiptNumber)}" data-entry-id="${escapeHtml(invoice.entryId)}" data-currency="${escapeHtml(invoice.currency || "")}" data-balance="${escapeHtml(invoice.balanceTotal)}" data-date="${escapeHtml(invoice.oldestDate || invoice.date || "")}" checked>
      <span>
        <strong>${escapeHtml(invoice.invoiceNumber || invoice.receiptNumber)}</strong>
        <small>${escapeHtml(displayDate(invoice.oldestDate || invoice.date || "—"))} • Balance ${escapeHtml(invoice.balanceText)}</small>
      </span>
    </label>
  `).join("");
}

function selectedGoodsSettlementInvoices(){
  if (!els.goodsSettlementInvoiceList) return [];
  return Array.from(els.goodsSettlementInvoiceList.querySelectorAll(".goods-settlement-invoice-check:checked"))
    .map(input => ({
      receiptNumber: input.value,
      entryId: input.dataset.entryId || "",
      currency: input.dataset.currency || "",
      balance: Number(input.dataset.balance || 0),
      date: input.dataset.date || ""
    }))
    .filter(invoice => invoice.receiptNumber && invoice.balance > 0.00000001);
}

function updateGoodsSettlementSelectionTotals(){
  const draft = state.inventoryDraft.settlement;
  if (draft?.mode !== "customer") return;
  const selected = selectedGoodsSettlementInvoices();
  const currencies = new Set(selected.map(invoice => invoice.currency).filter(Boolean));
  const total = selected.reduce((sum, invoice) => sum + Number(invoice.balance || 0), 0);
  const currency = currencies.size === 1 ? Array.from(currencies)[0] : "";
  if (els.goodsSettlementBalance) {
    els.goodsSettlementBalance.value = selected.length && currency ? moneyText(total, currency) : (selected.length ? "Select one currency only" : "Select invoices");
    applyCurrencyFontClass(els.goodsSettlementBalance, currency);
  }
  if (els.goodsSettlementAmount) {
    els.goodsSettlementAmount.disabled = !selected.length || currencies.size !== 1;
    if (currency) els.goodsSettlementAmount.max = trimInventoryNumber(total);
    else els.goodsSettlementAmount.removeAttribute("max");
    const current = Number(els.goodsSettlementAmount.value || 0);
    if (!current || current > total || currencies.size !== 1) {
      els.goodsSettlementAmount.value = currency ? trimInventoryNumber(total) : "";
    }
  }
  state.inventoryDraft.settlement.currency = currency;
  state.inventoryDraft.settlement.balance = total;
  updateGoodsSettlementWalletSelector(currency);
}

function openGoodsSettlementModal(entryId){
  const entry = state.entries.find(e => e.id === entryId && e.entry_kind !== "principal" && hasGoodsTag(e.notes));
  if (!entry){
    alert("Sale entry not found.");
    return;
  }
  const meta = goodsMetaFromNotes(entry.notes);
  const receiptNumber = meta.receiptNumber || meta.invoiceNumber || meta.saleSetId || shortId(entry.id) || "";
  const receiptData = getInventoryReceiptData(receiptNumber, entry);
  if (receiptData.totalsByCurrency.size !== 1){
    alert("Balance clearance is available only for a single-currency receipt.");
    return;
  }
  if (receiptData.balanceTotal <= 0.00000001){
    alert("This invoice has no balance amount to clear.");
    return;
  }
  state.inventoryDraft.settlement = {
    mode: "receipt",
    entryId,
    receiptNumber,
    currency: receiptData.currency,
    balance: receiptData.balanceTotal
  };
  if (els.goodsSettlementForm) els.goodsSettlementForm.reset();
  renderGoodsSettlementInvoiceList([]);
  if (els.goodsSettlementReceipt) els.goodsSettlementReceipt.value = receiptData.invoiceNumber || receiptNumber;
  if (els.goodsSettlementCustomer) els.goodsSettlementCustomer.value = receiptData.customerName || "Walk-in customer";
  if (els.goodsSettlementBalance) {
    els.goodsSettlementBalance.value = moneyText(receiptData.balanceTotal, receiptData.currency);
    applyCurrencyFontClass(els.goodsSettlementBalance, receiptData.currency);
  }
  if (els.goodsSettlementAmount) {
    els.goodsSettlementAmount.disabled = false;
    els.goodsSettlementAmount.value = trimInventoryNumber(receiptData.balanceTotal);
    els.goodsSettlementAmount.max = trimInventoryNumber(receiptData.balanceTotal);
  }
  if (els.goodsSettlementDate) els.goodsSettlementDate.value = todayISO();
  updateGoodsSettlementWalletSelector(receiptData.currency);
  els.goodsSettlementModal.classList.remove("hide");
  els.goodsSettlementModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function openGoodsCustomerSettlementModal(customerName){
  const invoices = outstandingInvoicesForCustomer(customerName).filter(invoice => invoice.canSettle);
  if (!invoices.length){
    alert("No single-currency outstanding invoices found for this customer.");
    return;
  }
  state.inventoryDraft.settlement = {
    mode: "customer",
    customerName,
    receiptNumber: "Multiple invoices",
    currency: "",
    balance: 0
  };
  if (els.goodsSettlementForm) els.goodsSettlementForm.reset();
  if (els.goodsSettlementReceipt) els.goodsSettlementReceipt.value = "Multiple invoices";
  if (els.goodsSettlementCustomer) els.goodsSettlementCustomer.value = customerName || "Walk-in customer";
  renderGoodsSettlementInvoiceList(invoices);
  if (els.goodsSettlementDate) els.goodsSettlementDate.value = todayISO();
  updateGoodsSettlementSelectionTotals();
  els.goodsSettlementModal.classList.remove("hide");
  els.goodsSettlementModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

async function saveGoodsSettlement(form){
  const draft = state.inventoryDraft.settlement;
  if (!draft?.receiptNumber) throw new Error("Settlement invoice was not selected.");
  const fd = new FormData(form);
  const settlementAmount = Number(fd.get("settlement_amount") || 0);
  const settlementDate = String(fd.get("settlement_date") || "");
  const settlementNotes = String(fd.get("notes") || "").trim() || "Balance settlement";
  const walletId = String(fd.get("settlement_wallet_id") || "").trim();
  if (!settlementDate) throw new Error("Settlement date is required.");
  if (!Number.isFinite(settlementAmount) || settlementAmount <= 0) throw new Error("Settlement amount must be greater than zero.");

  let remainingSettlement = { amount: settlementAmount };
  const settlementId = crypto.randomUUID();
  const paymentReceiptNumber = nextPaymentReceiptNumber();
  const payloads = [];
  let settlementCurrency = String(draft.currency || "").trim();
  let customerName = "";
  let receiptLabel = draft.receiptNumber || "";

  if (draft.mode === "customer"){
    const selected = selectedGoodsSettlementInvoices()
      .sort((a, b) => dateStamp(a.date) - dateStamp(b.date) || String(a.receiptNumber).localeCompare(String(b.receiptNumber)));
    if (!selected.length) throw new Error("Select at least one invoice to settle.");
    const selectedCurrencies = new Set(selected.map(invoice => invoice.currency).filter(Boolean));
    if (selectedCurrencies.size !== 1) throw new Error("Select invoices from one currency only.");
    settlementCurrency = Array.from(selectedCurrencies)[0];
    customerName = draft.customerName || "";
    receiptLabel = selected.map(invoice => invoice.invoiceNumber || invoice.receiptNumber).filter(Boolean).join(", ") || "Multiple invoices";
    const selectedBalance = selected.reduce((sum, invoice) => sum + Number(invoice.balance || 0), 0);
    if (settlementAmount > selectedBalance + 0.00000001) throw new Error("Settlement amount cannot exceed the selected balance.");

    for (const invoice of selected){
      if (remainingSettlement.amount <= 0.00000001) break;
      const fallbackEntry = state.entries.find(e => e.id === invoice.entryId) || null;
      const receiptData = getInventoryReceiptData(invoice.receiptNumber, fallbackEntry);
      if (receiptData.totalsByCurrency.size !== 1) continue;
      if (!customerName) customerName = receiptData.customerName || "";
      addInventorySettlementPayloads(payloads, receiptData, remainingSettlement, settlementDate, settlementNotes, settlementId, paymentReceiptNumber);
    }
  } else {
    const fallbackEntry = state.entries.find(e => e.id === draft.entryId) || null;
    const receiptData = getInventoryReceiptData(draft.receiptNumber, fallbackEntry);
    if (receiptData.totalsByCurrency.size !== 1) throw new Error("Balance clearance is available only for a single-currency receipt.");
    if (settlementAmount > receiptData.balanceTotal + 0.00000001) throw new Error("Settlement amount cannot exceed the current balance.");
    settlementCurrency = receiptData.currency || settlementCurrency;
    customerName = receiptData.customerName || "";
    receiptLabel = receiptData.invoiceNumber || receiptData.receiptNumber || receiptLabel;
    addInventorySettlementPayloads(payloads, receiptData, remainingSettlement, settlementDate, settlementNotes, settlementId, paymentReceiptNumber);
  }
  if (!payloads.length) throw new Error("No outstanding balance found for the selected invoice(s).");
  if (remainingSettlement.amount > 0.00000001) throw new Error("Settlement amount exceeds the current outstanding balance.");

  if (walletId) {
    if (!settlementCurrency) throw new Error("Wallet top-up requires a single settlement currency.");
    validateInventoryWallet(walletId, settlementCurrency, settlementAmount, "topup");
  }

  saveEntriesImmediately(payloads, { label: "Settlement" });
  if (walletId) {
    await createWalletEntryForInventory(walletId, settlementAmount, settlementDate, settlementCurrency, "settlement", {
      customerName,
      receiptNumber: receiptLabel
    });
  }
  state.inventoryDraft.settlement = null;
  closeModal("goodsSettlementModal");
}

function openEditModal(id) {
  const entry = state.entries.find(e => e.id === id);
  if (!entry) return;
  if (entry.entry_kind === "principal" && hasGoodsTag(entry.notes)) {
    openInventoryEditItemModal(id);
    return;
  }
  if (entry.entry_kind === "principal" && hasInstallmentTag(entry.notes) && !hasExpenseAccountTag(entry.notes)) {
    openInstallmentEditModal(entry.group_id);
    return;
  }
  const isGoodsSaleEntry = hasGoodsTag(entry.notes);
  const requiredCapability = isGoodsSaleEntry ? "can_edit_invoices" : "can_edit_entries";
  if (!teamCapability(requiredCapability)) {
    alert(isGoodsSaleEntry ? "You do not have permission to edit invoices." : "You do not have permission to edit entries.");
    return;
  }
  state.editId = id;
  state.editKind = entry.entry_kind;
  const isExpenseAccountPrincipal = entry.entry_kind === "principal" && hasExpenseAccountTag(entry.notes);
  const accountTypeGroup = document.getElementById("editAccountTypeGroup");
  const accountTypeSelect = document.getElementById("editAccountType");
  const nameLabel = document.getElementById("editNameLabel");

  if (entry.entry_kind === "principal") {
    document.getElementById('editPersonGroup').classList.remove('hide');
    document.getElementById('editCurrencyGroup').classList.remove('hide');
    document.getElementById('editName').value = entry.person_name || "";
    document.getElementById('editName').required = true;
    setCurrencyChoice(els.editForm, entry.currency || "AED");
    if (isExpenseAccountPrincipal) {
      if (nameLabel) nameLabel.textContent = "Account name";
      document.getElementById('editAmountLabel').textContent = "Available balance";
      document.getElementById('editDateLabel').textContent = "Account date";
      if (accountTypeGroup) accountTypeGroup.classList.remove("hide");
      if (accountTypeSelect) {
        const currentType = expenseMetaFromNotes(entry.notes).accountType || "Bank Account";
        const known = Array.from(accountTypeSelect.options).some(opt => opt.value === currentType);
        if (!known && currentType) {
          const opt = document.createElement("option");
          opt.value = currentType;
          opt.textContent = currentType;
          accountTypeSelect.appendChild(opt);
        }
        accountTypeSelect.value = currentType;
        accountTypeSelect.required = true;
      }
    } else {
      if (nameLabel) nameLabel.textContent = "Person name";
      document.getElementById('editAmountLabel').textContent = "Principal Amount";
      document.getElementById('editDateLabel').textContent = "Loan Date";
      if (accountTypeGroup) accountTypeGroup.classList.add("hide");
      if (accountTypeSelect) {
        accountTypeSelect.required = false;
        accountTypeSelect.value = "Bank Account";
      }
    }
    document.getElementById('editAmount').value = entry.principal_amount || "";
    document.getElementById('editDate').value = entry.loan_date || "";
  } else {
    document.getElementById('editPersonGroup').classList.add('hide');
    document.getElementById('editCurrencyGroup').classList.add('hide');
    if (accountTypeGroup) accountTypeGroup.classList.add("hide");
    if (accountTypeSelect) accountTypeSelect.required = false;
    if (nameLabel) nameLabel.textContent = "Person name";
    document.getElementById('editName').required = false;
    document.getElementById('editAmountLabel').textContent = "Payment Amount";
    document.getElementById('editAmount').value = entry.action_amount || "";
    document.getElementById('editDateLabel').textContent = "Payment Date";
    document.getElementById('editDate').value = entry.action_date || "";
  }
  document.getElementById('editNotes').value = hasExpenseAccountTag(entry.notes)
    ? cleanExpenseNoteForEdit(entry.notes)
    : (entry.notes || "");
  syncEditTaxControls(entry);

  els.editModal.classList.remove("hide");
  els.editModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function getInventoryEditItemGroup(entryId){
  const entry = state.entries.find(e => e.id === entryId);
  if (!entry || !hasGoodsTag(entry.notes)) return null;
  return getGoodsGroups({ applyUiFilters: false }).find(group =>
    group.principal?.id === entryId || group.group_id === entry.group_id
  ) || null;
}

function getInventoryEditTaxBreakdown(){
  const form = els.inventoryEditItemForm;
  if (!form) return calculateTaxBreakdown(0, 0, TAX_MODE_ADD, false);
  const price = Number(form.querySelector('[name="actual_price"]')?.value || 0);
  const category = normalizeInventoryCategory(form.querySelector('[name="item_category"]')?.value);
  const unit = form.querySelector('[name="quantity_unit"]')?.value || inventoryBaseUnitForCategory(category);
  const qty = normalizeInventoryQuantityInput(form.querySelector('[name="bought_qty"]')?.value, category, unit);
  const net = Math.max(price, 0) * Math.max(qty, 0);
  const applied = !!form.querySelector('[name="edit_tax_applied"]')?.checked;
  const rate = normalizeTaxRate(form.querySelector('[name="edit_tax_rate"]')?.value);
  const mode = normalizeTaxMode(form.querySelector('[name="edit_tax_mode"]')?.value);
  return calculateTaxBreakdown(net, rate, mode, applied);
}

function updateInventoryEditItemTotals(){
  const form = els.inventoryEditItemForm;
  if (!form) return;
  const breakdown = getInventoryEditTaxBreakdown();
  const totalInput = form.querySelector('[name="total_amount"]');
  const preview = document.getElementById("inventoryEditTaxPreview");
  const currency = String(form.querySelector('[name="currency"]')?.value || "AED");
  if (totalInput) totalInput.value = breakdown.total ? trimInventoryNumber(breakdown.total) : "";
  if (preview) preview.textContent = formatTaxSummary(breakdown, currency);
}

function syncInventoryEditItemCategoryFields(){
  const form = els.inventoryEditItemForm;
  if (!form) return;
  const categorySelect = form.querySelector('[name="item_category"]');
  const unitSelect = form.querySelector('[name="quantity_unit"]');
  const unitWrap = form.querySelector("[data-inventory-unit-wrap]");
  const qtyInput = form.querySelector('[name="bought_qty"]');
  const priceLabel = form.querySelector("[data-inventory-price-label]");
  const sellingLabel = form.querySelector("[data-inventory-selling-label]");
  const qtyLabel = form.querySelector("[data-inventory-qty-label]");
  const sellByWrap = form.querySelector("[data-inventory-sellby-wrap]");
  const bottleSizeWrap = form.querySelector("[data-inventory-bottle-size-wrap]");
  const bottleUnitWrap = form.querySelector("[data-inventory-bottle-unit-wrap]");
  const sellByInput = form.querySelector('[name="sell_by"]');
  const category = normalizeInventoryCategory(categorySelect?.value);
  const isMeasured = inventoryIsDecimalCategory(category);
  const selectedUnit = unitSelect ? normalizeInventoryUnit(unitSelect.value, category) : inventoryBaseUnitForCategory(category);
  const sellBy = category === "volume"
    ? (typeof normalizeInventorySellBy === "function"
      ? normalizeInventorySellBy(sellByInput?.value || "", "volume")
      : (sellByInput?.value === "bottle" ? "bottle" : "volume"))
    : "";
  const useBottle = category === "volume" && sellBy === "bottle";

  if (unitWrap) unitWrap.classList.toggle("hide", !isMeasured || useBottle);
  if (unitSelect){
    unitSelect.disabled = !isMeasured || !!categorySelect?.disabled || useBottle;
    unitSelect.innerHTML = inventoryUnitSelectOptionsHtml(category, selectedUnit);
    unitSelect.value = normalizeInventoryUnit(selectedUnit, category);
  }
  if (sellByWrap) sellByWrap.classList.toggle("hide", category !== "volume");
  if (bottleSizeWrap) bottleSizeWrap.classList.toggle("hide", !useBottle);
  if (bottleUnitWrap) bottleUnitWrap.classList.toggle("hide", !useBottle);
  form.querySelectorAll("[data-edit-sell-by]").forEach(btn => {
    btn.classList.toggle("is-selected", btn.dataset.editSellBy === sellBy);
  });
  if (qtyInput){
    qtyInput.min = isMeasured ? "0.001" : "1";
    qtyInput.step = isMeasured ? "0.001" : "1";
    qtyInput.placeholder = useBottle ? "Total volume in base unit (from bottle size × count stored)" : inventoryQtyFieldLabel(category);
  }
  if (priceLabel) {
    priceLabel.textContent = useBottle
      ? "Purchase price / liter (stored)"
      : inventoryPurchasePriceLabel(category);
  }
  if (sellingLabel) {
    sellingLabel.textContent = useBottle
      ? "Selling price / liter (stored)"
      : inventorySellingPriceLabel(category);
  }
  if (qtyLabel) qtyLabel.textContent = inventoryQtyFieldLabel(category);
  updateInventoryEditItemTotals();
}

function renderInventoryEditItemSummary(group, principalMeta){
  if (!els.inventoryEditItemSummary) return;
  const category = normalizeInventoryCategory(group?.itemCategory || principalMeta?.itemCategory);
  const soldQty = Number(group?.soldQty || 0);
  const remainingQty = Number(group?.remainingQty || 0);
  const restockQty = Math.max(Number(group?.boughtQty || 0) - normalizeStoredInventoryQty(principalMeta?.boughtQty, category, 0), 0);
  els.inventoryEditItemSummary.innerHTML = `
    <div><small>Type</small><strong>${escapeHtml(normalizeInventoryItemType(group?.itemType || principalMeta?.itemType))}</strong></div>
    <div><small>In stock</small><strong>${escapeHtml(inventoryQtyLabel(remainingQty, category, group))}</strong></div>
    <div><small>Sold</small><strong>${escapeHtml(inventoryQtyLabel(soldQty, category, group))}</strong></div>
    <div><small>Extra stock</small><strong>${escapeHtml(inventoryQtyLabel(restockQty, category, group))}</strong></div>
  `;
}

function openInventoryEditItemModal(id){
  const entry = state.entries.find(e => e.id === id);
  if (!entry || entry.entry_kind !== "principal" || !hasGoodsTag(entry.notes)) return;
  if (!teamCapability("can_edit_invoices")) {
    alert("You do not have permission to edit invoices.");
    return;
  }
  const form = els.inventoryEditItemForm;
  if (!form || !els.inventoryEditItemModal) return;

  const group = getInventoryEditItemGroup(id);
  const meta = goodsMetaFromNotes(entry.notes);
  const itemCategory = normalizeInventoryCategory(meta.itemCategory || group?.itemCategory);
  const quantityUnit = normalizeInventoryUnit(meta.quantityUnit || group?.quantityUnit, itemCategory);
  const boughtQty = normalizeStoredInventoryQty(meta.boughtQty, itemCategory, 0);
  const unitActualPrice = Number(meta.unitActualPrice || 0) > 0
    ? Number(meta.unitActualPrice)
    : (boughtQty > 0 ? Number(entry.principal_amount || 0) / boughtQty : 0);
  const sellingPrice = Number(meta.unitSoldPrice || group?.defaultUnitSoldPrice || 0);
  const hasSales = Number(group?.soldQty || 0) > 0;
  const taxDefaults = getTaxSettingForCurrency(entry.currency || "AED");
  const taxApplied = isTaxAppliedFromMeta({
    taxApplied: meta.taxApplied,
    taxRate: meta.taxRate != null ? meta.taxRate : (meta.taxApplied == null ? taxDefaults.rate : 0),
    taxAmount: meta.taxAmount
  });
  const taxRate = meta.taxRate != null ? normalizeTaxRate(meta.taxRate) : taxDefaults.rate;
  const taxMode = meta.taxMode ? normalizeTaxMode(meta.taxMode) : taxDefaults.mode;

  state.editId = id;
  state.editKind = "principal";
  form.reset();
  form.dataset.hasSales = hasSales ? "1" : "0";
  form.dataset.minPrincipalQty = String(Math.max(
    Number(group?.soldQty || 0) - Math.max(Number(group?.boughtQty || 0) - boughtQty, 0),
    0
  ));

  const cleanedNote = cleanGoodsDisplayNote(entry.notes) || "";
  const itemDescription = meta.itemDescription || cleanedNote;
  const notesOnly = meta.itemDescription ? cleanedNote : "";

  form.querySelector('[name="item_code"]').value = meta.itemCode || group?.itemCode || "";
  form.querySelector('[name="item_name"]').value = entry.person_name || "";
  form.querySelector('[name="item_description"]').value = itemDescription;
  const brandInput = form.querySelector('[name="brand"]');
  const variantInput = form.querySelector('[name="variant_label"]');
  if (brandInput) brandInput.value = meta.brand || group?.brand || "";
  if (variantInput) variantInput.value = meta.variantLabel || group?.variantLabel || "";
  form.querySelector('[name="item_category"]').value = itemCategory;
  form.querySelector('[name="item_category"]').disabled = hasSales;
  form.querySelector('[name="quantity_unit"]').value = quantityUnit;
  const sellBy = itemCategory === "volume"
    ? (typeof normalizeInventorySellBy === "function"
      ? normalizeInventorySellBy(meta.sellBy || group?.sellBy || "", typeof defaultInventorySellBy === "function"
        ? defaultInventorySellBy({ categoryName: meta.itemType || group?.itemType, qtyPattern: itemCategory })
        : "volume")
      : (meta.sellBy === "bottle" ? "bottle" : "volume"))
    : "";
  const sellByInput = form.querySelector('[name="sell_by"]');
  if (sellByInput) sellByInput.value = sellBy || "volume";
  const bottleQtyInput = form.querySelector('[name="bottle_size_qty"]');
  const bottleUnitInput = form.querySelector('[name="bottle_size_unit"]');
  if (bottleQtyInput) {
    bottleQtyInput.value = meta.bottleSizeQty != null && Number(meta.bottleSizeQty) > 0
      ? trimInventoryNumber(meta.bottleSizeQty, 3)
      : (group?.bottleSizeQty != null ? trimInventoryNumber(group.bottleSizeQty, 3) : "");
  }
  if (bottleUnitInput) {
    bottleUnitInput.value = String(meta.bottleSizeUnit || group?.bottleSizeUnit || "ml").toLowerCase() === "l" ? "l" : "ml";
  }
  form.querySelector('[name="actual_price"]').value = unitActualPrice ? trimInventoryNumber(unitActualPrice) : "";
  form.querySelector('[name="selling_price"]').value = sellingPrice > 0 ? trimInventoryNumber(sellingPrice) : "";
  form.querySelector('[name="bought_qty"]').value = boughtQty > 0 ? trimInventoryNumber(boughtQty) : "";
  form.querySelector('[name="bought_date"]').value = entry.loan_date || "";
  form.querySelector('[name="notes"]').value = notesOnly;
  form.querySelector('[name="edit_tax_applied"]').checked = !!taxApplied;
  form.querySelector('[name="edit_tax_rate"]').value = taxRate ? trimInventoryNumber(taxRate, 2) : "";
  form.querySelector('[name="edit_tax_mode"]').value = taxMode;
  setCurrencyChoice(form, entry.currency || "AED");
  form.querySelectorAll(".currency-chip").forEach(chip => {
    chip.disabled = hasSales;
    chip.classList.toggle("is-locked", hasSales);
  });
  syncInventoryItemTypeFields(form, meta.itemType || group?.itemType || "General");
  syncInventoryEditItemCategoryFields();
  renderInventoryEditItemSummary(group, meta);

  // Sell-by card clicks (re-bind each open)
  form.querySelectorAll("[data-edit-sell-by]").forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      if (hasSales) return;
      const next = btn.dataset.editSellBy || "volume";
      if (sellByInput) sellByInput.value = next;
      syncInventoryEditItemCategoryFields();
    };
  });
  const catSel = form.querySelector('[name="item_category"]');
  if (catSel) catSel.onchange = () => syncInventoryEditItemCategoryFields();

  els.inventoryEditItemModal.classList.remove("hide");
  els.inventoryEditItemModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  form.querySelector('[name="item_name"]')?.focus();
}

async function submitInventoryEditItem(){
  assertTeamCapability("can_edit_invoices", "You do not have permission to edit invoices.");
  const id = state.editId;
  if (!id) return;
  const form = els.inventoryEditItemForm;
  const currentEntry = state.entries.find(e => e.id === id);
  if (!form || !currentEntry || !hasGoodsTag(currentEntry.notes)) return;

  const fd = new FormData(form);
  const group = getInventoryEditItemGroup(id);
  const currentMeta = goodsMetaFromNotes(currentEntry.notes);
  const hasSales = form.dataset.hasSales === "1";
  const itemName = String(fd.get("item_name") || "").trim();
  const itemCode = String(fd.get("item_code") || "").trim();
  const itemDescription = String(fd.get("item_description") || "").trim();
  const itemType = readGoodsBoughtItemType(form);
  const itemCategory = hasSales
    ? normalizeInventoryCategory(currentMeta.itemCategory || group?.itemCategory)
    : normalizeInventoryCategory(fd.get("item_category"));
  const quantityUnit = hasSales
    ? normalizeInventoryUnit(currentMeta.quantityUnit || group?.quantityUnit, itemCategory)
    : normalizeInventoryUnit(fd.get("quantity_unit"), itemCategory);
  const boughtQty = normalizeInventoryQuantityInput(fd.get("bought_qty"), itemCategory, quantityUnit);
  const unitActualPrice = Number(fd.get("actual_price") || 0);
  const sellingPrice = Number(fd.get("selling_price") || 0);
  const currency = hasSales
    ? String(currentEntry.currency || "AED").trim()
    : String(fd.get("currency") || currentEntry.currency || "AED").trim();
  const boughtDate = String(fd.get("bought_date") || "");
  const displayNote = String(fd.get("notes") || "").trim();
  const minPrincipalQty = Number(form.dataset.minPrincipalQty || 0);
  const taxBreakdown = getInventoryEditTaxBreakdown();

  if (!itemName || !currency || !boughtDate) throw new Error("Complete all required fields.");
  if (!itemType) throw new Error("Select or enter an item type.");
  if (!(unitActualPrice > 0)) throw new Error("Enter a valid purchase price.");
  if (!(boughtQty > 0)) throw new Error(`Enter a valid ${inventoryQtyFieldLabel(itemCategory).toLowerCase()}.`);
  if (boughtQty + 0.00000001 < minPrincipalQty) {
    throw new Error(`Opening quantity cannot be below ${inventoryQtyLabel(minPrincipalQty, itemCategory)} because of existing sales.`);
  }
  if (!hasSales) validateCurrencyForForm(fd);

  const brand = String(fd.get("brand") || "").trim();
  const variantLabel = String(fd.get("variant_label") || "").trim();
  const sellBy = itemCategory === "volume"
    ? (typeof normalizeInventorySellBy === "function"
      ? normalizeInventorySellBy(fd.get("sell_by") || currentMeta.sellBy || "", "volume")
      : (String(fd.get("sell_by") || "") === "bottle" ? "bottle" : "volume"))
    : "";
  const bottleSizeQty = itemCategory === "volume" ? Number(fd.get("bottle_size_qty") || currentMeta.bottleSizeQty || 0) : 0;
  const bottleSizeUnit = itemCategory === "volume"
    ? (String(fd.get("bottle_size_unit") || currentMeta.bottleSizeUnit || "ml").toLowerCase() === "l" ? "l" : "ml")
    : "";
  if (itemCategory === "volume" && sellBy === "bottle" && !(bottleSizeQty > 0)) {
    throw new Error("Enter bottle size (e.g. 100 ml) when selling by bottle.");
  }
  const sharedMeta = {
    itemCode,
    itemDescription,
    itemType,
    itemCategory,
    quantityUnit: inventoryBaseUnitForCategory(itemCategory),
    brand,
    variantLabel,
    brandId: currentMeta.brandId || "",
    variantId: currentMeta.variantId || "",
    unitSoldPrice: sellingPrice > 0 ? sellingPrice : null,
    sellBy: sellBy || "",
    bottleSizeQty: bottleSizeQty > 0 ? bottleSizeQty : null,
    bottleSizeUnit: bottleSizeQty > 0 ? bottleSizeUnit : ""
  };

  const updatedNotes = upsertGoodsMetaInNote(normalizeGoodsNote(displayNote || null, true), {
    ...currentMeta,
    ...sharedMeta,
    boughtQty,
    unitActualPrice,
    transactionType: currentMeta.transactionType || "ITEM",
    ...taxMetaFromBreakdown(taxBreakdown)
  });

  const updatedEntry = {
    ...currentEntry,
    person_name: itemName,
    currency,
    principal_amount: taxBreakdown.total,
    loan_date: boughtDate,
    notes: updatedNotes
  };
  const patchBody = {
    person_name: itemName,
    currency,
    principal_amount: taxBreakdown.total,
    loan_date: boughtDate,
    notes: updatedNotes
  };

  state.entries = state.entries.map(entry => entry.id === id ? updatedEntry : entry);
  if (!isBackupMode()) queueDatabasePatch(id, patchBody, "Inventory item", updatedEntry);

  // Keep restock purchase rows aligned on shared item identity fields.
  const purchaseRows = (group?.purchaseActions || []).filter(row => row?.id);
  for (const row of purchaseRows){
    const rowMeta = goodsMetaFromNotes(row.notes);
    const nextNotes = upsertGoodsMetaInNote(row.notes, {
      ...rowMeta,
      itemCode: sharedMeta.itemCode || rowMeta.itemCode,
      itemDescription: sharedMeta.itemDescription || rowMeta.itemDescription,
      itemType: sharedMeta.itemType,
      itemCategory: sharedMeta.itemCategory,
      quantityUnit: sharedMeta.quantityUnit,
      unitSoldPrice: sharedMeta.unitSoldPrice,
      sellBy: sharedMeta.sellBy || rowMeta.sellBy || "",
      bottleSizeQty: sharedMeta.bottleSizeQty != null ? sharedMeta.bottleSizeQty : rowMeta.bottleSizeQty,
      bottleSizeUnit: sharedMeta.bottleSizeUnit || rowMeta.bottleSizeUnit || ""
    });
    const nextRow = { ...row, person_name: itemName, currency, notes: nextNotes };
    state.entries = state.entries.map(entry => entry.id === row.id ? nextRow : entry);
    if (!isBackupMode()) queueDatabasePatch(row.id, { person_name: itemName, currency, notes: nextNotes }, "Inventory stock", nextRow);
  }

  // Keep sale rows' item name in sync (customer stays in notes meta).
  const saleRows = (group?.actions || []).filter(row => row?.id);
  for (const row of saleRows){
    if (row.person_name === itemName) continue;
    const nextRow = { ...row, person_name: itemName };
    state.entries = state.entries.map(entry => entry.id === row.id ? nextRow : entry);
    if (!isBackupMode()) queueDatabasePatch(row.id, { person_name: itemName }, "Inventory sale", nextRow);
  }

  closeModal("inventoryEditItemModal");
  if (isBackupMode()) refreshBackupView();
  else renderAll();
}

function syncEditTaxControls(entry) {
  const group = document.getElementById("editTaxGroup");
  if (!group) return;
  const amount = Number(entry.entry_kind === "principal" ? entry.principal_amount : entry.action_amount || 0);
  const isExpense = hasExpenseAccountTag(entry.notes) && expenseMetaFromNotes(entry.notes).rowType === "EXPENSE";
  const isGoods = hasGoodsTag(entry.notes);
  const show = isGoods || isExpense;
  group.classList.toggle("hide", !show);
  if (!show) return;
  const meta = isGoods ? goodsMetaFromNotes(entry.notes) : expenseMetaFromNotes(entry.notes);
  const defaults = getTaxSettingForCurrency(entry.currency || "AED");
  const rate = meta.taxRate != null ? normalizeTaxRate(meta.taxRate) : defaults.rate;
  const mode = meta.taxMode ? normalizeTaxMode(meta.taxMode) : defaults.mode;
  const applied = isTaxAppliedFromMeta({
    taxApplied: meta.taxApplied,
    taxRate: meta.taxRate != null ? meta.taxRate : (meta.taxApplied == null ? defaults.rate : 0),
    taxAmount: meta.taxAmount
  });
  document.getElementById("editTaxApplied").checked = applied;
  document.getElementById("editTaxRate").value = rate ? trimInventoryNumber(rate, 2) : "";
  document.getElementById("editTaxMode").value = mode;
  updateEditTaxPreview(amount, entry.currency || "AED");
}

function updateEditTaxPreview(amountValue = null, currencyValue = null) {
  const preview = document.getElementById("editTaxPreview");
  if (!preview || document.getElementById("editTaxGroup")?.classList.contains("hide")) return;
  const entry = state.entries.find(e => e.id === state.editId);
  const amount = amountValue != null ? Number(amountValue || 0) : Number(document.getElementById("editAmount")?.value || 0);
  const currency = currencyValue || entry?.currency || "AED";
  const applied = !!document.getElementById("editTaxApplied")?.checked;
  const rate = normalizeTaxRate(document.getElementById("editTaxRate")?.value);
  const mode = normalizeTaxMode(document.getElementById("editTaxMode")?.value);
  preview.textContent = formatTaxSummary(calculateTaxBreakdownFromGross(amount, rate, mode, applied), currency);
}

function getEditTaxMeta(entry, amount) {
  const group = document.getElementById("editTaxGroup");
  if (!group || group.classList.contains("hide")) return {};
  const applied = !!document.getElementById("editTaxApplied")?.checked;
  const rate = normalizeTaxRate(document.getElementById("editTaxRate")?.value);
  const mode = normalizeTaxMode(document.getElementById("editTaxMode")?.value);
  return taxMetaFromBreakdown(calculateTaxBreakdownFromGross(amount, rate, mode, applied));
}

const sectionDetailsChartInstances = [];
let inventoryDetailsSelectedCurrency = "";

function destroySectionDetailsCharts(){
  while (sectionDetailsChartInstances.length) {
    const chart = sectionDetailsChartInstances.pop();
    try { chart?.destroy?.(); } catch (_) {}
  }
}

function clearSectionDetailsActions(){
  const host = els.sectionDetailsActions;
  if (!host) return;
  host.innerHTML = "";
  host.classList.add("hide");
  delete host.dataset.groupId;
}

function sectionDetailsThemeColors(){
  const styles = getComputedStyle(document.documentElement);
  const read = (name, fallback) => String(styles.getPropertyValue(name) || "").trim() || fallback;
  const bg = read("--bg", "#edf1f7");
  const bodyBg = String(getComputedStyle(document.body).backgroundColor || "").trim();
  const luminanceOf = (raw) => {
    const rgba = String(raw || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (rgba) {
      const r = Number(rgba[1]) / 255;
      const g = Number(rgba[2]) / 255;
      const b = Number(rgba[3]) / 255;
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    const hex = String(raw || "").match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!hex) return 0.92;
    let h = hex[1];
    if (h.length === 3) h = h.split("").map(ch => ch + ch).join("");
    const r = parseInt(h.slice(0, 2), 16) / 255;
    const g = parseInt(h.slice(2, 4), 16) / 255;
    const b = parseInt(h.slice(4, 6), 16) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const isDark = Math.min(luminanceOf(bg), luminanceOf(bodyBg || bg)) < 0.35;
  return {
    primary: read("--primary", "#2457d6"),
    primarySoft: read("--primary-soft", "rgba(36,87,214,.10)"),
    success: read("--success", "#067647"),
    warning: read("--warning", "#b54708"),
    danger: read("--danger", "#b42318"),
    muted: read("--muted", "#667085"),
    text: read("--text", "#17212b"),
    line: read("--line", "rgba(208,213,221,.70)"),
    bg,
    panel: isDark ? "rgba(22,28,36,.92)" : "#ffffff",
    tooltipBg: isDark ? "rgba(12,16,22,.94)" : "rgba(23,33,43,.92)",
    crosshair: isDark ? "rgba(255,255,255,.18)" : "rgba(23,33,43,.16)",
    doughnutBorder: isDark ? "rgba(22,28,36,.95)" : "#ffffff",
    isDark
  };
}

function sectionDetailsColorAlpha(color, alpha){
  const c = String(color || "").trim();
  const a = Math.max(0, Math.min(1, Number(alpha)));
  if (!c) return `rgba(36,87,214,${a})`;
  const rgbaMatch = c.match(/^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)$/i);
  if (rgbaMatch) return `rgba(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]}, ${a})`;
  const hex = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map(ch => ch + ch).join("");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  return c;
}

function sectionDetailsAreaFill(ctx, color, alphaTop = 0.2, alphaBottom = 0.02){
  try {
    const area = ctx?.chart?.chartArea;
    const canvasCtx = ctx?.chart?.ctx;
    if (!area || !canvasCtx || area.top == null || area.bottom == null) {
      return sectionDetailsColorAlpha(color, alphaTop * 0.45);
    }
    const gradient = canvasCtx.createLinearGradient(0, area.top, 0, area.bottom);
    gradient.addColorStop(0, sectionDetailsColorAlpha(color, alphaTop));
    gradient.addColorStop(1, sectionDetailsColorAlpha(color, alphaBottom));
    return gradient;
  } catch (_) {
    return sectionDetailsColorAlpha(color, alphaTop * 0.45);
  }
}

/** Shared “pro chart” defaults — TradingView-like thin lines, subtle grid, index tooltips. */
function sectionDetailsProChartDefaults(){
  const colors = sectionDetailsThemeColors();
  const gridColor = sectionDetailsColorAlpha(colors.muted, colors.isDark ? 0.16 : 0.12);
  return {
    colors,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 360, easing: "easeOutQuart" },
      interaction: { mode: "index", intersect: false },
      hover: { mode: "index", intersect: false },
      plugins: {
        legend: {
          labels: {
            color: colors.text,
            boxWidth: 8,
            boxHeight: 8,
            usePointStyle: true,
            pointStyle: "circle",
            font: { size: 11, weight: "600" },
            padding: 12
          }
        },
        tooltip: {
          enabled: true,
          backgroundColor: colors.tooltipBg,
          titleColor: "#fff",
          bodyColor: "rgba(255,255,255,.92)",
          borderColor: sectionDetailsColorAlpha(colors.line, 0.55),
          borderWidth: 1,
          cornerRadius: 6,
          padding: 10,
          displayColors: true,
          boxPadding: 4,
          titleFont: { size: 11, weight: "700" },
          bodyFont: { size: 11 },
          caretSize: 5,
          mode: "index",
          intersect: false
        }
      },
      scales: {
        x: {
          grid: {
            color: gridColor,
            drawBorder: false,
            tickLength: 0,
            borderDash: [3, 3]
          },
          border: { display: false },
          ticks: {
            color: colors.muted,
            font: { size: 10, weight: "600" },
            maxRotation: 0,
            autoSkipPadding: 10
          }
        },
        y: {
          beginAtZero: true,
          grid: {
            color: gridColor,
            drawBorder: false,
            tickLength: 0,
            borderDash: [3, 3]
          },
          border: { display: false },
          ticks: {
            color: colors.muted,
            font: { size: 10, weight: "600" },
            padding: 6
          }
        }
      }
    }
  };
}

function sectionDetailsChartDefaults(){
  return sectionDetailsProChartDefaults();
}

function sectionDetailsLineDataset(label, data, color, opts = {}){
  const fill = opts.fill !== false;
  const tension = opts.tension ?? 0.38;
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: fill
      ? (ctx) => sectionDetailsAreaFill(ctx, color, opts.alphaTop ?? 0.2, opts.alphaBottom ?? 0.015)
      : "transparent",
    fill,
    tension,
    pointRadius: opts.pointRadius ?? 0,
    pointHoverRadius: opts.pointHoverRadius ?? 4,
    pointHitRadius: 10,
    pointBackgroundColor: color,
    pointBorderColor: opts.pointBorderColor ?? "#fff",
    pointBorderWidth: 1.5,
    borderWidth: opts.borderWidth ?? 1.75,
    borderDash: opts.borderDash || [],
    cubicInterpolationMode: "monotone"
  };
}

function sectionDetailsCandleBarDataset(label, data, color, opts = {}){
  return {
    label,
    data,
    backgroundColor: sectionDetailsColorAlpha(color, opts.alpha ?? 0.78),
    hoverBackgroundColor: color,
    borderColor: color,
    borderWidth: 0,
    borderRadius: opts.borderRadius ?? 2,
    maxBarThickness: opts.maxBarThickness ?? 11,
    categoryPercentage: opts.categoryPercentage ?? 0.55,
    barPercentage: opts.barPercentage ?? 0.72
  };
}

function sectionDetailsDoughnutDataset(values, palette, opts = {}){
  const colors = sectionDetailsThemeColors();
  return {
    data: values,
    backgroundColor: palette,
    borderWidth: opts.borderWidth ?? 2,
    borderColor: opts.borderColor ?? colors.doughnutBorder,
    hoverOffset: opts.hoverOffset ?? 5,
    spacing: opts.spacing ?? 1
  };
}

function sectionDetailsDoughnutOptions(baseOptions, cutout = "62%"){
  return {
    ...baseOptions,
    cutout,
    plugins: {
      ...baseOptions.plugins,
      legend: { ...baseOptions.plugins.legend, position: "bottom" }
    },
    scales: undefined
  };
}

function sectionDetailsMetricHtml(label, value, tone = ""){
  const toneClass = tone ? ` is-${tone}` : "";
  return `<div class="section-details-metric${toneClass}"><small>${escapeHtml(label)}</small><strong>${value}</strong></div>`;
}

function sectionDetailsMonthKey(dateStr){
  const raw = String(dateStr || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : null;
}

function sectionDetailsMonthLabel(monthKey){
  const match = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return String(monthKey || "");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[Number(match[2]) - 1] || match[2]} ${match[1].slice(2)}`;
}

function sectionDetailsSortedMonthKeys(mapOrSet){
  return [...mapOrSet].filter(Boolean).sort();
}

function sectionDetailsEnsureChartLib(){
  return !!(window.Chart);
}

function createSectionDetailsChart(canvas, config){
  if (!canvas || !sectionDetailsEnsureChartLib()) return null;
  try {
    const existing = window.Chart.getChart?.(canvas);
    if (existing) existing.destroy();
  } catch (_) {}
  const chart = new window.Chart(canvas.getContext("2d"), config);
  sectionDetailsChartInstances.push(chart);
  return chart;
}

function resolveInventoryDetailsCurrency(currencies, preferred){
  const list = Array.isArray(currencies) ? currencies.filter(Boolean) : [];
  if (!list.length) return "";
  if (preferred && list.includes(preferred)) return preferred;
  if (!isPageCurrencyAll()) {
    const selected = getSelectedPageCurrencies();
    if (selected.length === 1 && list.includes(selected[0])) return selected[0];
    const pageHit = selected.find(c => list.includes(c));
    if (pageHit) return pageHit;
  }
  const goodsFilter = String(state.currencyFilter?.goods || "All");
  if (goodsFilter !== "All" && list.includes(goodsFilter)) return goodsFilter;
  return list[0];
}

function inventoryDetailsCurrencyChipsHtml(currencies, selected){
  if (!currencies.length) return "";
  return `
    <div class="section-details-currency-bar" role="tablist" aria-label="Inventory currency">
      ${currencies.map(currency => `
        <button
          type="button"
          class="section-details-currency-chip${currency === selected ? " active" : ""}"
          data-inventory-details-currency="${escapeHtml(currency)}"
          role="tab"
          aria-selected="${currency === selected ? "true" : "false"}"
          title="${escapeHtml(currency)}"
        >${currencySymbolHtml(currency)}<span>${escapeHtml(currency)}</span></button>
      `).join("")}
    </div>
  `;
}

function isInventoryLowStockGroup(group){
  return Number(group.remainingQty || 0) > 0.00000001
    && Number(group.boughtQty || 0) > 0
    && (Number(group.remainingQty || 0) / Number(group.boughtQty || 0)) <= 0.15;
}

function buildInventoryDetailsPayload(currencyFilter = ""){
  const goodsUniverse = getGoodsGroups({ applyUiFilters: false });
  const currencies = sortCurrenciesList([
    ...new Set(goodsUniverse.map(g => String(g.currency || "").trim()).filter(Boolean))
  ]);
  const selectedCurrency = resolveInventoryDetailsCurrency(currencies, currencyFilter);
  const goodsAll = selectedCurrency
    ? goodsUniverse.filter(g => String(g.currency || "").trim() === selectedCurrency)
    : goodsUniverse;

  const inStock = goodsAll.filter(g => Number(g.remainingQty || 0) > 0.00000001 && !isInventoryLowStockGroup(g));
  const lowStock = goodsAll.filter(isInventoryLowStockGroup);
  const soldOut = goodsAll.filter(g => Number(g.remainingQty || 0) <= 0.00000001);
  const profitGroups = goodsAll.filter(g => Number(g.profitLoss || 0) > 0);
  const lossGroups = goodsAll.filter(g => Number(g.profitLoss || 0) < 0);
  const stockValueTotals = inventoryOverviewTotals(goodsAll, g => Number(g.unitActualPrice || 0) * Number(g.remainingQty || 0));
  const purchaseTotals = inventoryOverviewTotals(goodsAll, g => g.bought);
  const salesTotals = inventoryOverviewTotals(goodsAll, g => g.soldTotal);
  const paidTotals = inventoryOverviewTotals(goodsAll, g => g.paidTotal);
  const profitTotals = inventoryOverviewTotals(profitGroups, g => Math.max(Number(g.profitLoss || 0), 0));
  const lossTotals = inventoryOverviewTotals(lossGroups, g => Math.abs(Number(g.profitLoss || 0)));

  const outstandingInvoicesAll = collectOutstandingInventoryInvoices();
  const outstandingInvoices = selectedCurrency
    ? outstandingInvoicesAll.filter(invoice => Number(invoice.balanceByCurrency?.get?.(selectedCurrency) || 0) > 0.00000001)
    : outstandingInvoicesAll;
  const outstandingBalance = new Map();
  outstandingInvoices.forEach(invoice => {
    if (selectedCurrency) {
      addCurrencyTotal(outstandingBalance, selectedCurrency, Number(invoice.balanceByCurrency?.get?.(selectedCurrency) || 0));
      return;
    }
    invoice.balanceByCurrency.forEach((amount, currency) => addCurrencyTotal(outstandingBalance, currency, amount));
  });

  const amountText = (totals) => {
    if (selectedCurrency) {
      return formatReportAmount(Number(totals?.[selectedCurrency] || 0), selectedCurrency);
    }
    return inventoryOverviewAmountText(totals);
  };

  const typeCounts = new Map();
  goodsAll.forEach(g => {
    const type = normalizeInventoryItemType(g.itemType);
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
  });

  const monthMap = new Map();
  const bumpMonth = (key, field, amount) => {
    if (!key) return;
    const n = Number(amount) || 0;
    if (!n) return;
    if (field !== "profit" && !(n > 0)) return;
    if (!monthMap.has(key)) monthMap.set(key, { purchase: 0, sales: 0, profit: 0 });
    monthMap.get(key)[field] += n;
  };
  goodsAll.forEach(group => {
    const purchaseDate = group.principal?.loan_date;
    bumpMonth(sectionDetailsMonthKey(purchaseDate), "purchase", Number(group.principal?.principal_amount || 0));
    (group.purchaseActions || []).forEach(row => {
      bumpMonth(sectionDetailsMonthKey(row.action_date), "purchase", row.action_amount);
    });
    (group.actions || []).forEach(row => {
      bumpMonth(sectionDetailsMonthKey(row.action_date), "sales", row.action_amount);
    });
    if (Number(group.profitLoss || 0) && group.latestSoldDate) {
      bumpMonth(sectionDetailsMonthKey(group.latestSoldDate), "profit", Number(group.profitLoss || 0));
    }
  });

  return {
    goodsAll,
    goodsUniverse,
    currencies,
    selectedCurrency,
    metrics: {
      items: goodsAll.length,
      stockQty: inventoryQtySummary(goodsAll, "remainingQty"),
      stockValue: amountText(stockValueTotals),
      inStock: inStock.length,
      lowStock: lowStock.length,
      soldOut: soldOut.length,
      purchaseTotal: amountText(purchaseTotals),
      salesTotal: amountText(salesTotals),
      paidTotal: amountText(paidTotals),
      profitTotal: amountText(profitTotals),
      lossTotal: amountText(lossTotals),
      outstanding: selectedCurrency
        ? formatReportAmount(Number(outstandingBalance.get(selectedCurrency) || 0), selectedCurrency)
        : (inventoryCurrencyTotalsText(outstandingBalance) || "0"),
      outstandingCount: outstandingInvoices.length
    },
    statusCounts: {
      inStock: inStock.length,
      lowStock: lowStock.length,
      sold: soldOut.length
    },
    typeCounts,
    monthMap
  };
}

function buildExpenseDetailsPayload(){
  const accounts = getExpenseAccounts({ applyUiFilters: false });
  const currencies = sortCurrenciesList([...new Set(accounts.map(a => a.currency).filter(Boolean))]);
  const byCurrency = currencies.map(currency => {
    const s = summarizeExpenseByCurrency(currency);
    return {
      currency,
      toppedUp: s.totalAmount,
      spent: s.totalExpenses,
      balance: s.availableBalance,
      wallets: accounts.filter(a => a.currency === currency).length
    };
  });
  const toppedUpText = byCurrency.length
    ? byCurrency.map(row => formatReportAmount(row.toppedUp, row.currency)).join(" | ")
    : "0";
  const spentText = byCurrency.length
    ? byCurrency.map(row => formatReportAmount(row.spent, row.currency)).join(" | ")
    : "0";
  const balanceText = byCurrency.length
    ? byCurrency.map(row => formatReportAmount(row.balance, row.currency)).join(" | ")
    : "0";

  const walletSpend = accounts
    .map(account => ({
      name: account.person_name || "Wallet",
      spent: Number(account.spentMoney || 0),
      topped: Number(account.openingBalance || 0) + Number(account.addedMoney || 0),
      currency: account.currency
    }))
    .filter(row => row.spent > 0 || row.topped > 0)
    .sort((a, b) => b.spent - a.spent);

  const monthMap = new Map();
  accounts.forEach(account => {
    (account.topups || []).forEach(row => {
      const key = sectionDetailsMonthKey(row.action_date);
      if (!key) return;
      if (!monthMap.has(key)) monthMap.set(key, { spend: 0, topup: 0 });
      monthMap.get(key).topup += Number(row.action_amount || 0);
    });
    (account.spends || []).forEach(row => {
      const key = sectionDetailsMonthKey(row.action_date);
      if (!key) return;
      if (!monthMap.has(key)) monthMap.set(key, { spend: 0, topup: 0 });
      monthMap.get(key).spend += Number(row.action_amount || 0);
    });
    const openKey = sectionDetailsMonthKey(account.principal?.loan_date);
    if (openKey && Number(account.openingBalance || 0) > 0) {
      if (!monthMap.has(openKey)) monthMap.set(openKey, { spend: 0, topup: 0 });
      monthMap.get(openKey).topup += Number(account.openingBalance || 0);
    }
  });

  return {
    accounts,
    metrics: {
      wallets: accounts.length,
      activeWallets: accounts.filter(a => a.status === "Open").length,
      currencies: currencies.length || 0,
      toppedUp: toppedUpText,
      spent: spentText,
      balance: balanceText
    },
    byCurrency,
    walletSpend,
    monthMap
  };
}

function buildInstallmentDetailsPayload(){
  const plans = getInstallmentPlanGroups();
  const overdue = plans.filter(p =>
    p.status === "Overdue" ||
    (Number(p.schedule?.overdueCount || 0) > 0 && Number(p.remaining || 0) > 0.00000001)
  );
  const completed = plans.filter(p => Number(p.remaining || 0) <= 0.00000001);
  const active = plans.filter(p =>
    Number(p.remaining || 0) > 0.00000001 &&
    !overdue.some(o => o.group_id === p.group_id)
  );
  const principalTotals = inventoryOverviewTotals(plans, p => p.principalTotal);
  const paidTotals = inventoryOverviewTotals(plans, p => p.paidTotal);
  const remainingTotals = inventoryOverviewTotals(plans, p => p.remaining);
  const principalSum = plans.reduce((sum, p) => sum + Number(p.principalTotal || 0), 0);
  const paidSum = plans.reduce((sum, p) => sum + Number(p.paidTotal || 0), 0);
  const progressPct = principalSum > 0 ? Math.min(100, Math.round((paidSum / principalSum) * 100)) : 0;

  const statusCounts = {
    Open: 0,
    Partial: 0,
    Overdue: 0,
    Closed: 0
  };
  plans.forEach(plan => {
    if (Number(plan.remaining || 0) <= 0.00000001) {
      statusCounts.Closed += 1;
      return;
    }
    if (plan.status === "Overdue" || Number(plan.schedule?.overdueCount || 0) > 0) {
      statusCounts.Overdue += 1;
      return;
    }
    if (plan.status === "Partial" || Number(plan.paidTotal || 0) > 0) {
      statusCounts.Partial += 1;
      return;
    }
    statusCounts.Open += 1;
  });

  const monthMap = new Map();
  plans.forEach(plan => {
    (plan.payments || []).forEach(row => {
      const key = sectionDetailsMonthKey(row.action_date);
      if (!key) return;
      if (!monthMap.has(key)) monthMap.set(key, 0);
      monthMap.set(key, monthMap.get(key) + Number(row.action_amount || 0));
    });
  });

  return {
    plans,
    metrics: {
      plans: plans.length,
      active: active.length,
      overdue: overdue.length,
      completed: completed.length,
      principal: inventoryOverviewAmountText(principalTotals),
      paid: inventoryOverviewAmountText(paidTotals),
      remaining: inventoryOverviewAmountText(remainingTotals),
      progressPct
    },
    statusCounts,
    paidSum,
    remainingSum: plans.reduce((sum, p) => sum + Number(p.remaining || 0), 0),
    monthMap
  };
}

function renderInventoryDetailsOverlay(preferredCurrency = ""){
  destroySectionDetailsCharts();
  const data = buildInventoryDetailsPayload(preferredCurrency || inventoryDetailsSelectedCurrency);
  inventoryDetailsSelectedCurrency = data.selectedCurrency || "";
  const m = data.metrics;
  const curLabel = data.selectedCurrency ? ` · ${data.selectedCurrency}` : "";
  const metricsHtml = [
    sectionDetailsMetricHtml("Items", escapeHtml(String(m.items)), "primary"),
    sectionDetailsMetricHtml("In stock qty", escapeHtml(m.stockQty)),
    sectionDetailsMetricHtml("Stock value", escapeHtml(m.stockValue)),
    sectionDetailsMetricHtml("In stock", escapeHtml(String(m.inStock)), "success"),
    sectionDetailsMetricHtml("Low stock", escapeHtml(String(m.lowStock)), "warning"),
    sectionDetailsMetricHtml("Sold / out", escapeHtml(String(m.soldOut))),
    sectionDetailsMetricHtml("Purchase total", escapeHtml(m.purchaseTotal)),
    sectionDetailsMetricHtml("Sales total", escapeHtml(m.salesTotal)),
    sectionDetailsMetricHtml("Profit", escapeHtml(m.profitTotal), "success"),
    sectionDetailsMetricHtml("Loss", escapeHtml(m.lossTotal), "danger"),
    sectionDetailsMetricHtml("Outstanding", escapeHtml(m.outstanding), m.outstandingCount ? "warning" : ""),
    sectionDetailsMetricHtml("Open invoices", escapeHtml(String(m.outstandingCount)))
  ].join("");

  els.sectionDetailsBody.innerHTML = `
    ${inventoryDetailsCurrencyChipsHtml(data.currencies, data.selectedCurrency)}
    <p class="section-details-note">Uses inventory records for the selected currency (not list filters). Totals refresh from live stock, sales, and invoice data${escapeHtml(curLabel)}.</p>
    <div class="section-details-metrics">${metricsHtml}</div>
    <div class="section-details-charts">
      <div class="section-details-chart-card">
        <h4>Stock status</h4>
        <div class="section-details-chart-wrap"><canvas id="sectionDetailsChart1"></canvas></div>
      </div>
      <div class="section-details-chart-card">
        <h4>Item type mix</h4>
        <div class="section-details-chart-wrap"><canvas id="sectionDetailsChart2"></canvas></div>
      </div>
      <div class="section-details-chart-card is-wide">
        <h4>Purchase, sales &amp; profit over time</h4>
        <div class="section-details-chart-wrap"><canvas id="sectionDetailsChart3"></canvas></div>
      </div>
    </div>
  `;

  els.sectionDetailsBody.querySelectorAll("[data-inventory-details-currency]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      const next = String(btn.dataset.inventoryDetailsCurrency || "").trim();
      if (!next || next === inventoryDetailsSelectedCurrency) return;
      inventoryDetailsSelectedCurrency = next;
      renderInventoryDetailsOverlay(next);
    });
  });

  if (!data.goodsUniverse.length) {
    els.sectionDetailsBody.insertAdjacentHTML("beforeend", `<div class="section-details-empty">No inventory records yet.</div>`);
  } else if (!data.goodsAll.length) {
    els.sectionDetailsBody.insertAdjacentHTML("beforeend", `<div class="section-details-empty">No inventory records for ${escapeHtml(data.selectedCurrency || "this currency")}.</div>`);
  }

  const { colors, options } = sectionDetailsChartDefaults();
  const statusLabels = ["In stock", "Low stock", "Sold / out"];
  const statusValues = [data.statusCounts.inStock, data.statusCounts.lowStock, data.statusCounts.sold];
  createSectionDetailsChart(document.getElementById("sectionDetailsChart1"), {
    type: "doughnut",
    data: {
      labels: statusLabels,
      datasets: [sectionDetailsDoughnutDataset(statusValues, [colors.success, colors.warning, colors.muted])]
    },
    options: sectionDetailsDoughnutOptions(options, "64%")
  });

  const typeEntries = [...data.typeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  createSectionDetailsChart(document.getElementById("sectionDetailsChart2"), {
    type: "bar",
    data: {
      labels: typeEntries.length ? typeEntries.map(([label]) => label) : ["—"],
      datasets: [
        sectionDetailsCandleBarDataset(
          "Items",
          typeEntries.length ? typeEntries.map(([, count]) => count) : [0],
          colors.primary,
          { maxBarThickness: 12 }
        )
      ]
    },
    options: {
      ...options,
      plugins: { ...options.plugins, legend: { display: false } },
      indexAxis: typeEntries.length > 4 ? "y" : "x"
    }
  });

  const months = sectionDetailsSortedMonthKeys(data.monthMap.keys());
  createSectionDetailsChart(document.getElementById("sectionDetailsChart3"), {
    type: "line",
    data: {
      labels: months.length ? months.map(sectionDetailsMonthLabel) : ["—"],
      datasets: [
        sectionDetailsLineDataset(
          "Purchases",
          months.map(key => Number(data.monthMap.get(key)?.purchase || 0)),
          colors.primary
        ),
        sectionDetailsLineDataset(
          "Sales",
          months.map(key => Number(data.monthMap.get(key)?.sales || 0)),
          colors.success
        ),
        sectionDetailsLineDataset(
          "Profit / loss",
          months.map(key => Number(data.monthMap.get(key)?.profit || 0)),
          colors.warning,
          { fill: false, borderDash: [5, 4], borderWidth: 1.5, alphaTop: 0 }
        )
      ]
    },
    options
  });
}

function renderExpenseDetailsOverlay(){
  const data = buildExpenseDetailsPayload();
  const m = data.metrics;
  const metricsHtml = [
    sectionDetailsMetricHtml("Wallets", escapeHtml(String(m.wallets)), "primary"),
    sectionDetailsMetricHtml("Active wallets", escapeHtml(String(m.activeWallets)), "success"),
    sectionDetailsMetricHtml("Currencies", escapeHtml(String(m.currencies))),
    sectionDetailsMetricHtml("Topped up", escapeHtml(m.toppedUp)),
    sectionDetailsMetricHtml("Spent", escapeHtml(m.spent), "warning"),
    sectionDetailsMetricHtml("Wallet balances", escapeHtml(m.balance), "success")
  ].join("");

  els.sectionDetailsBody.innerHTML = `
    <p class="section-details-note">Uses all expense wallets and entries (not list filters or history date range). Totals match wallet overview logic.</p>
    <div class="section-details-metrics">${metricsHtml}</div>
    <div class="section-details-charts">
      <div class="section-details-chart-card">
        <h4>Top-up vs spend by currency</h4>
        <div class="section-details-chart-wrap"><canvas id="sectionDetailsChart1"></canvas></div>
      </div>
      <div class="section-details-chart-card">
        <h4>Spend by wallet</h4>
        <div class="section-details-chart-wrap"><canvas id="sectionDetailsChart2"></canvas></div>
      </div>
      <div class="section-details-chart-card is-wide">
        <h4>Spending &amp; top-ups over time</h4>
        <div class="section-details-chart-wrap"><canvas id="sectionDetailsChart3"></canvas></div>
      </div>
    </div>
  `;

  if (!data.accounts.length) {
    els.sectionDetailsBody.insertAdjacentHTML("beforeend", `<div class="section-details-empty">No expense wallets yet.</div>`);
  }

  const { colors, options } = sectionDetailsChartDefaults();
  const currencyLabels = data.byCurrency.map(row => row.currency);
  createSectionDetailsChart(document.getElementById("sectionDetailsChart1"), {
    type: "bar",
    data: {
      labels: currencyLabels.length ? currencyLabels : ["—"],
      datasets: [
        sectionDetailsCandleBarDataset("Topped up", data.byCurrency.map(row => row.toppedUp), colors.primary),
        sectionDetailsCandleBarDataset("Spent", data.byCurrency.map(row => row.spent), colors.warning)
      ]
    },
    options
  });

  const topWallets = data.walletSpend.slice(0, 8);
  const walletPalette = [colors.primary, colors.success, colors.warning, colors.danger, "#0f766e", "#334155", "#be185d", "#0369a1"];
  createSectionDetailsChart(document.getElementById("sectionDetailsChart2"), {
    type: "doughnut",
    data: {
      labels: topWallets.length ? topWallets.map(w => w.name) : ["No spend"],
      datasets: [
        sectionDetailsDoughnutDataset(
          topWallets.length ? topWallets.map(w => w.spent) : [1],
          topWallets.length ? walletPalette.slice(0, Math.max(topWallets.length, 1)) : ["rgba(208,213,221,.55)"]
        )
      ]
    },
    options: sectionDetailsDoughnutOptions(options, "58%")
  });

  const months = sectionDetailsSortedMonthKeys(data.monthMap.keys());
  createSectionDetailsChart(document.getElementById("sectionDetailsChart3"), {
    type: "line",
    data: {
      labels: months.length ? months.map(sectionDetailsMonthLabel) : ["—"],
      datasets: [
        sectionDetailsLineDataset(
          "Spent",
          months.map(key => Number(data.monthMap.get(key)?.spend || 0)),
          colors.warning
        ),
        sectionDetailsLineDataset(
          "Topped up",
          months.map(key => Number(data.monthMap.get(key)?.topup || 0)),
          colors.primary
        )
      ]
    },
    options
  });
}

function renderInstallmentDetailsOverlay(){
  const data = buildInstallmentDetailsPayload();
  const m = data.metrics;
  const metricsHtml = [
    sectionDetailsMetricHtml("Plans", escapeHtml(String(m.plans)), "primary"),
    sectionDetailsMetricHtml("Active", escapeHtml(String(m.active)), "success"),
    sectionDetailsMetricHtml("Overdue", escapeHtml(String(m.overdue)), m.overdue ? "danger" : ""),
    sectionDetailsMetricHtml("Completed", escapeHtml(String(m.completed))),
    sectionDetailsMetricHtml("Principal", escapeHtml(m.principal)),
    sectionDetailsMetricHtml("Paid", escapeHtml(m.paid), "success"),
    sectionDetailsMetricHtml("Remaining", escapeHtml(m.remaining), "warning"),
    sectionDetailsMetricHtml("Progress", escapeHtml(`${m.progressPct}%`), "primary")
  ].join("");

  els.sectionDetailsBody.innerHTML = `
    <p class="section-details-note">Uses all installment plans (not list filters). Progress and overdue counts come from live schedules and payments.</p>
    <div class="section-details-metrics">${metricsHtml}</div>
    <div class="section-details-charts">
      <div class="section-details-chart-card">
        <h4>Status breakdown</h4>
        <div class="section-details-chart-wrap"><canvas id="sectionDetailsChart1"></canvas></div>
      </div>
      <div class="section-details-chart-card">
        <h4>Overall progress</h4>
        <div class="section-details-chart-wrap"><canvas id="sectionDetailsChart2"></canvas></div>
      </div>
      <div class="section-details-chart-card is-wide">
        <h4>Payments over time</h4>
        <div class="section-details-chart-wrap"><canvas id="sectionDetailsChart3"></canvas></div>
      </div>
    </div>
  `;

  if (!data.plans.length) {
    els.sectionDetailsBody.insertAdjacentHTML("beforeend", `<div class="section-details-empty">No installment plans yet.</div>`);
  }

  const { colors, options } = sectionDetailsChartDefaults();
  const statusLabels = ["Open", "Partial", "Overdue", "Closed"];
  const statusValues = statusLabels.map(label => Number(data.statusCounts[label] || 0));
  createSectionDetailsChart(document.getElementById("sectionDetailsChart1"), {
    type: "doughnut",
    data: {
      labels: statusLabels,
      datasets: [sectionDetailsDoughnutDataset(statusValues, [colors.primary, colors.warning, colors.danger, colors.success])]
    },
    options: sectionDetailsDoughnutOptions(options, "64%")
  });

  createSectionDetailsChart(document.getElementById("sectionDetailsChart2"), {
    type: "doughnut",
    data: {
      labels: ["Paid", "Remaining"],
      datasets: [sectionDetailsDoughnutDataset(
        [Math.max(data.paidSum, 0), Math.max(data.remainingSum, 0)],
        [colors.success, "rgba(208,213,221,.75)"]
      )]
    },
    options: sectionDetailsDoughnutOptions(options, "68%")
  });

  const months = sectionDetailsSortedMonthKeys(data.monthMap.keys());
  createSectionDetailsChart(document.getElementById("sectionDetailsChart3"), {
    type: "line",
    data: {
      labels: months.length ? months.map(sectionDetailsMonthLabel) : ["—"],
      datasets: [
        sectionDetailsLineDataset(
          "Payments",
          months.map(key => Number(data.monthMap.get(key) || 0)),
          colors.primary
        )
      ]
    },
    options: {
      ...options,
      plugins: { ...options.plugins, legend: { display: false } }
    }
  });
}

function isWalletTransferTopup(row){
  return /Transfer from\s+/i.test(String(row?.notes || ""));
}

function isWalletTransferSpend(row){
  return expenseMetaFromNotes(row?.notes).expenseType === "Transfer";
}

function buildWalletDetailsPayload(groupId){
  const accounts = getExpenseAccounts({ applyUiFilters: false });
  const account = accounts.find(a => a.group_id === groupId);
  if (!account) return null;

  const currency = account.currency || "";
  const isBtcLive = currency === "BTC";
  const opening = Number(account.openingBalance || 0);
  const topups = account.topups || [];
  const spends = account.spends || [];

  let pureTopup = opening;
  let transferIn = 0;
  let pureSpend = 0;
  let transferOut = 0;
  const monthMap = new Map();
  const bumpMonth = (key, field, amount) => {
    if (!key || !(Number(amount) > 0)) return;
    if (!monthMap.has(key)) monthMap.set(key, { topup: 0, spend: 0, transferIn: 0, transferOut: 0 });
    monthMap.get(key)[field] += Number(amount) || 0;
  };

  const flowEvents = [];
  if (opening > 0) {
    const openDate = account.principal?.loan_date || account.loan_date || "";
    flowEvents.push({
      date: openDate,
      stamp: dateStamp(openDate),
      kind: "opening",
      label: "Opening balance",
      amount: opening,
      delta: opening,
      note: cleanExpenseNote(account.principal?.notes)
    });
    bumpMonth(sectionDetailsMonthKey(openDate), "topup", opening);
  }

  topups.forEach(row => {
    const amount = Number(row.action_amount || 0);
    const isTransfer = isWalletTransferTopup(row);
    if (isTransfer) transferIn += amount;
    else pureTopup += amount;
    bumpMonth(sectionDetailsMonthKey(row.action_date), isTransfer ? "transferIn" : "topup", amount);
    flowEvents.push({
      date: row.action_date,
      stamp: dateStamp(row.action_date),
      kind: isTransfer ? "transfer-in" : "topup",
      label: isTransfer ? "Transfer in" : (isBtcLive ? "Received" : "Top-up"),
      amount,
      delta: amount,
      note: cleanExpenseNote(row.notes)
    });
  });

  spends.forEach(row => {
    const amount = Number(row.action_amount || 0);
    const isTransfer = isWalletTransferSpend(row);
    if (isTransfer) transferOut += amount;
    else pureSpend += amount;
    bumpMonth(sectionDetailsMonthKey(row.action_date), isTransfer ? "transferOut" : "spend", amount);
    const item = expenseMetaFromNotes(row.notes).itemName;
    flowEvents.push({
      date: row.action_date,
      stamp: dateStamp(row.action_date),
      kind: isTransfer ? "transfer-out" : "spend",
      label: isTransfer ? "Transfer out" : (item || (isBtcLive ? "Sent" : "Expense")),
      amount,
      delta: -amount,
      note: cleanExpenseNote(row.notes)
    });
  });

  flowEvents.sort((a, b) => (a.stamp - b.stamp) || String(a.kind).localeCompare(String(b.kind)));
  let running = 0;
  const balancePoints = [];
  flowEvents.forEach(ev => {
    running += Number(ev.delta || 0);
    balancePoints.push({
      date: ev.date,
      label: displayDate(ev.date),
      balance: running,
      kind: ev.kind
    });
  });

  const monthKeys = sectionDetailsSortedMonthKeys(monthMap.keys());
  const monthEndBalance = [];
  let monthRunning = 0;
  monthKeys.forEach(key => {
    const row = monthMap.get(key) || { topup: 0, spend: 0, transferIn: 0, transferOut: 0 };
    monthRunning += Number(row.topup || 0) + Number(row.transferIn || 0) - Number(row.spend || 0) - Number(row.transferOut || 0);
    monthEndBalance.push(monthRunning);
  });

  const recent = flowEvents
    .slice()
    .sort((a, b) => (b.stamp - a.stamp) || String(b.kind).localeCompare(String(a.kind)))
    .slice(0, 8);

  const totalTopup = opening + Number(account.addedMoney || 0);
  const totalSpend = Number(account.spentMoney || 0);

  return {
    account,
    currency,
    isBtcLive,
    metrics: {
      balance: Number(account.balance || 0),
      toppedUp: totalTopup,
      spent: totalSpend,
      pureTopup,
      pureSpend,
      transferIn,
      transferOut,
      status: account.status || (Number(account.balance || 0) > 0 ? "Open" : "Closed"),
      accountType: account.accountType || "",
      topupCount: topups.length + (opening > 0 ? 1 : 0),
      spendCount: spends.length,
      transferCount: flowEvents.filter(ev => ev.kind === "transfer-in" || ev.kind === "transfer-out").length
    },
    monthMap,
    monthKeys,
    monthEndBalance,
    balancePoints,
    recent,
    composition: {
      topup: Math.max(pureTopup, 0),
      spend: Math.max(pureSpend, 0),
      transferIn: Math.max(transferIn, 0),
      transferOut: Math.max(transferOut, 0)
    }
  };
}

function walletDetailsActivityHtml(data){
  if (!data.recent.length) {
    return `<div class="section-details-empty">No wallet activity yet.</div>`;
  }
  const currency = data.currency;
  const rows = data.recent.map(ev => {
    const tone = ev.delta >= 0 ? "is-in" : "is-out";
    const sign = ev.delta >= 0 ? "+" : "−";
    return `
      <div class="section-details-activity-row ${tone}">
        <div class="section-details-activity-main">
          <strong>${escapeHtml(ev.label)}</strong>
          <span>${escapeHtml(displayDate(ev.date))} · ${escapeHtml(ev.note || "—")}</span>
        </div>
        <div class="section-details-activity-amt">${sign}${escapeHtml(formatReportAmount(Math.abs(ev.amount), currency))}</div>
      </div>
    `;
  }).join("");
  return `<div class="section-details-activity">${rows}</div>`;
}

function renderWalletDetailsOverlay(groupId){
  const data = buildWalletDetailsPayload(groupId);
  if (!data || !els.sectionDetailsBody) {
    if (els.sectionDetailsBody) {
      els.sectionDetailsBody.innerHTML = `<div class="section-details-empty">Wallet not found.</div>`;
    }
    return;
  }

  const m = data.metrics;
  const cur = data.currency;
  const inLabel = data.isBtcLive ? "Received" : "Topped up";
  const outLabel = data.isBtcLive ? "Sent" : "Spent";
  const metricsHtml = [
    sectionDetailsMetricHtml("Balance", escapeHtml(formatReportAmount(m.balance, cur)), "success"),
    sectionDetailsMetricHtml(inLabel, escapeHtml(formatReportAmount(m.toppedUp, cur)), "primary"),
    sectionDetailsMetricHtml(outLabel, escapeHtml(formatReportAmount(m.spent, cur)), "warning"),
    sectionDetailsMetricHtml("Transfers in", escapeHtml(formatReportAmount(m.transferIn, cur)), "success"),
    sectionDetailsMetricHtml("Transfers out", escapeHtml(formatReportAmount(m.transferOut, cur)), "danger"),
    sectionDetailsMetricHtml("Status", escapeHtml(m.status), m.status === "Open" ? "success" : ""),
    sectionDetailsMetricHtml("Currency", escapeHtml(cur || "—")),
    sectionDetailsMetricHtml("Type", escapeHtml(m.accountType || "—")),
    sectionDetailsMetricHtml("Movements", escapeHtml(String(m.topupCount + m.spendCount)))
  ].join("");

  els.sectionDetailsBody.innerHTML = `
    <p class="section-details-note">Live records for this wallet only (all dates). Charts cover top-ups, spending, transfers, and balance flow.</p>
    <div class="section-details-metrics">${metricsHtml}</div>
    <div class="section-details-charts">
      <div class="section-details-chart-card">
        <h4>Money mix</h4>
        <div class="section-details-chart-wrap"><canvas id="walletDetailsChart1"></canvas></div>
      </div>
      <div class="section-details-chart-card">
        <h4>Inflows vs outflows</h4>
        <div class="section-details-chart-wrap"><canvas id="walletDetailsChart2"></canvas></div>
      </div>
      <div class="section-details-chart-card is-wide">
        <h4>Balance over time</h4>
        <div class="section-details-chart-wrap"><canvas id="walletDetailsChart3"></canvas></div>
      </div>
    </div>
    <div class="section-details-chart-card section-details-activity-card">
      <h4>Recent activity</h4>
      ${walletDetailsActivityHtml(data)}
    </div>
  `;

  // Defer Chart.js work so metrics + activity paint on this click frame.
  const chartToken = String(groupId || "");
  requestAnimationFrame(() => {
    if (!els.sectionDetailsModal || els.sectionDetailsModal.classList.contains("hide")) return;
    if (els.sectionDetailsModal.dataset.walletDetailsId !== chartToken) return;
    if (!sectionDetailsEnsureChartLib()) return;

    const { colors, options } = sectionDetailsChartDefaults();
    const mixLabels = data.isBtcLive
      ? ["Received", "Sent", "Transfers in", "Transfers out"]
      : ["Top-ups", "Spending", "Transfers in", "Transfers out"];
    const mixValues = [
      data.composition.topup,
      data.composition.spend,
      data.composition.transferIn,
      data.composition.transferOut
    ];
    const mixTotal = mixValues.reduce((sum, n) => sum + Number(n || 0), 0);
    createSectionDetailsChart(document.getElementById("walletDetailsChart1"), {
      type: "doughnut",
      data: {
        labels: mixTotal > 0 ? mixLabels : ["No activity"],
        datasets: [
          sectionDetailsDoughnutDataset(
            mixTotal > 0 ? mixValues : [1],
            mixTotal > 0
              ? [colors.primary, colors.warning, colors.success, colors.danger]
              : ["rgba(208,213,221,.55)"]
          )
        ]
      },
      options: sectionDetailsDoughnutOptions(options, "60%")
    });

    const months = data.monthKeys;
    createSectionDetailsChart(document.getElementById("walletDetailsChart2"), {
      type: "bar",
      data: {
        labels: months.length ? months.map(sectionDetailsMonthLabel) : ["—"],
        datasets: [
          sectionDetailsCandleBarDataset(
            data.isBtcLive ? "Received" : "Top-ups",
            months.map(key => Number(data.monthMap.get(key)?.topup || 0)),
            colors.primary,
            { maxBarThickness: 10 }
          ),
          sectionDetailsCandleBarDataset(
            "Transfers in",
            months.map(key => Number(data.monthMap.get(key)?.transferIn || 0)),
            colors.success,
            { maxBarThickness: 10 }
          ),
          sectionDetailsCandleBarDataset(
            data.isBtcLive ? "Sent" : "Spent",
            months.map(key => Number(data.monthMap.get(key)?.spend || 0)),
            colors.warning,
            { maxBarThickness: 10 }
          ),
          sectionDetailsCandleBarDataset(
            "Transfers out",
            months.map(key => Number(data.monthMap.get(key)?.transferOut || 0)),
            colors.danger,
            { maxBarThickness: 10 }
          )
        ]
      },
      options
    });

    const balanceLabels = months.length
      ? months.map(sectionDetailsMonthLabel)
      : (data.balancePoints.length ? data.balancePoints.map(p => p.label) : ["—"]);
    const balanceValues = months.length
      ? data.monthEndBalance
      : (data.balancePoints.length ? data.balancePoints.map(p => p.balance) : [Number(m.balance || 0)]);

    createSectionDetailsChart(document.getElementById("walletDetailsChart3"), {
      type: "line",
      data: {
        labels: balanceLabels,
        datasets: [
          sectionDetailsLineDataset("Balance", balanceValues, colors.primary)
        ]
      },
      options: {
        ...options,
        scales: {
          ...options.scales,
          y: {
            ...options.scales.y,
            beginAtZero: false
          }
        }
      }
    });
  });
}

async function openWalletDetailsOverlay(groupId){
  if (!els.sectionDetailsModal || !els.sectionDetailsBody) return;
  const id = String(groupId || "").trim();
  if (!id) return;

  destroySectionDetailsCharts();
  clearSectionDetailsActions();

  const paintWalletDetails = () => {
    destroySectionDetailsCharts();
    invalidateExpenseAccountsSyncCache();
    const account = getExpenseAccounts({ applyUiFilters: false }).find(a => a.group_id === id);
    if (!account) {
      if (els.sectionDetailsTitle) els.sectionDetailsTitle.textContent = "Wallet details";
      if (els.sectionDetailsDesc) els.sectionDetailsDesc.textContent = "Wallet not found.";
      els.sectionDetailsBody.innerHTML = `<div class="section-details-empty">Wallet not found.</div>`;
      return false;
    }
    const name = account.person_name || "Wallet";
    if (els.sectionDetailsTitle) {
      els.sectionDetailsTitle.innerHTML = `${getWalletIconHtml(name, 22, account.customLogoUrl || "")}<span class="section-details-title-text">${escapeHtml(name)}</span>`;
    }
    if (els.sectionDetailsDesc) {
      const typeBit = account.accountType ? `${account.accountType} · ` : "";
      els.sectionDetailsDesc.textContent = `${typeBit}${account.currency || "—"} · Balance ${formatReportAmount(account.balance, account.currency)}`;
    }
    if (!sectionDetailsEnsureChartLib()) {
      els.sectionDetailsBody.innerHTML = `<div class="section-details-empty">Chart library is still loading. Close and open Details again.</div>`;
      return true;
    }
    renderWalletDetailsOverlay(id);
    return true;
  };

  // Open the overlay immediately — never block the click on a network round-trip.
  els.sectionDetailsModal.dataset.walletDetailsId = id;
  paintWalletDetails();
  els.sectionDetailsModal.classList.remove("hide");
  els.sectionDetailsModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  // Lazy mode: if full wallet history isn't cached yet, load it in the background and refresh once.
  if (isExpenseLazyMode() && !state.expenseLazy?.detailCache?.has?.(id)) {
    ensureExpenseWalletDetailLoaded(id, { force: false })
      .then(() => {
        if (!els.sectionDetailsModal || els.sectionDetailsModal.classList.contains("hide")) return;
        if (els.sectionDetailsModal.dataset.walletDetailsId !== id) return;
        paintWalletDetails();
      })
      .catch(err => console.warn("Wallet detail load failed:", err));
  }
}

function inventoryItemStockStatus(group){
  if (Number(group.remainingQty || 0) <= 0.00000001) return { label: "Sold", tone: "" };
  if (isInventoryLowStockGroup(group)) return { label: "Low stock", tone: "warning" };
  return { label: "In stock", tone: "success" };
}

function buildInventoryItemDetailsPayload(groupId){
  const group = getGoodsGroups({ applyUiFilters: false }).find(g => g.group_id === groupId);
  if (!group) return null;

  const currency = group.currency || "";
  const category = group.itemCategory;
  const principalMeta = goodsMetaFromNotes(group.principal?.notes);
  const restockQty = (group.purchaseActions || []).reduce(
    (sum, row) => sum + normalizeStoredInventoryQty(goodsMetaFromNotes(row.notes).boughtQty, category, 0),
    0
  );
  const openQty = Math.max(Number(group.boughtQty || 0) - restockQty, 0);
  const events = [];

  if (group.principal) {
    events.push({
      date: group.principal.loan_date,
      stamp: dateStamp(group.principal.loan_date),
      kind: "purchase",
      label: "Opening purchase",
      qty: openQty,
      amount: Number(group.principal.principal_amount || 0),
      note: group.itemDescription || cleanGoodsDisplayNote(group.principal.notes) || "Opening stock"
    });
  }
  (group.purchaseActions || []).forEach(row => {
    const meta = goodsMetaFromNotes(row.notes);
    events.push({
      date: row.action_date,
      stamp: dateStamp(row.action_date),
      kind: "purchase",
      label: "Restock",
      qty: normalizeStoredInventoryQty(meta.boughtQty, category, 0),
      amount: Number(row.action_amount || 0),
      note: cleanGoodsDisplayNote(row.notes) || "Additional stock"
    });
  });
  (group.actions || []).forEach(row => {
    const meta = goodsMetaFromNotes(row.notes);
    const invoice = inventoryInvoiceNumberFromMeta(meta, row) || meta.receiptNumber || shortId(row.id);
    events.push({
      date: row.action_date,
      stamp: dateStamp(row.action_date),
      kind: "sale",
      label: "Sale",
      qty: normalizeStoredInventoryQty(meta.soldQty, category, 0),
      amount: Number(row.action_amount || 0),
      note: `${meta.customerName || "Walk-in"} · ${invoice}`
    });
  });
  (group.settlementActions || []).forEach(row => {
    const meta = goodsMetaFromNotes(row.notes);
    events.push({
      date: row.action_date,
      stamp: dateStamp(row.action_date),
      kind: "settlement",
      label: "Settlement",
      qty: 0,
      amount: Number(row.action_amount || 0),
      note: `${meta.customerName || "Walk-in"} · ${cleanGoodsDisplayNote(row.notes) || "Balance settlement"}`
    });
  });

  events.sort((a, b) => (a.stamp - b.stamp) || String(a.kind).localeCompare(String(b.kind)));
  let runningQty = 0;
  const stockPoints = [];
  const monthMap = new Map();
  const bumpMonth = (key, field, amount) => {
    if (!key || !(Number(amount) > 0)) return;
    if (!monthMap.has(key)) monthMap.set(key, { purchase: 0, sales: 0 });
    monthMap.get(key)[field] += Number(amount) || 0;
  };

  events.forEach(ev => {
    if (ev.kind === "purchase") {
      runningQty += Number(ev.qty || 0);
      bumpMonth(sectionDetailsMonthKey(ev.date), "purchase", ev.amount);
    } else if (ev.kind === "sale") {
      runningQty = Math.max(runningQty - Number(ev.qty || 0), 0);
      bumpMonth(sectionDetailsMonthKey(ev.date), "sales", ev.amount);
    }
    if (ev.kind === "purchase" || ev.kind === "sale") {
      stockPoints.push({
        date: ev.date,
        label: displayDate(ev.date),
        remaining: runningQty,
        kind: ev.kind
      });
    }
  });

  const recent = events
    .slice()
    .sort((a, b) => (b.stamp - a.stamp) || String(b.kind).localeCompare(String(a.kind)))
    .slice(0, 8);
  const stockStatus = inventoryItemStockStatus(group);
  const vatTotal = Number(group.purchaseTaxTotal || 0) + Number(group.salesTaxTotal || 0);

  return {
    group,
    currency,
    stockStatus,
    metrics: {
      boughtQty: group.boughtQty,
      soldQty: group.soldQty,
      remainingQty: group.remainingQty,
      status: stockStatus.label,
      unitCost: Number(group.unitActualPrice || 0),
      unitSold: Number(group.defaultUnitSoldPrice || 0),
      purchaseTotal: Number(group.bought || 0),
      salesTotal: Number(group.soldTotal || 0),
      purchaseNet: Number(group.purchaseNetTotal || 0),
      salesNet: Number(group.soldNetTotal || 0),
      profitLoss: Number(group.profitLoss || 0),
      paidTotal: Number(group.paidTotal || 0),
      balanceTotal: Number(group.balanceTotal || 0),
      purchaseVat: Number(group.purchaseTaxTotal || 0),
      salesVat: Number(group.salesTaxTotal || 0),
      vatTotal,
      stockValue: Number(group.unitActualPrice || 0) * Number(group.remainingQty || 0)
    },
    monthMap,
    stockPoints,
    recent,
    qtyMix: {
      bought: Math.max(Number(group.boughtQty || 0), 0),
      sold: Math.max(Number(group.soldQty || 0), 0),
      remaining: Math.max(Number(group.remainingQty || 0), 0)
    },
    valueMix: {
      stock: Math.max(Number(group.unitActualPrice || 0) * Number(group.remainingQty || 0), 0),
      soldCost: Math.max(Number(group.soldCostBasis || 0), 0),
      profit: Math.max(Number(group.profitLoss || 0), 0),
      loss: Math.max(-Number(group.profitLoss || 0), 0)
    }
  };
}

function inventoryItemActivityHtml(data){
  if (!data.recent.length) {
    return `<div class="section-details-empty">No stock activity yet.</div>`;
  }
  const currency = data.currency;
  const category = data.group.itemCategory;
  const rows = data.recent.map(ev => {
    const tone = ev.kind === "sale" ? "is-out" : "is-in";
    const qtyBit = Number(ev.qty || 0) > 0
      ? ` · ${escapeHtml(inventoryQtyLabel(ev.qty, category))}`
      : "";
    return `
      <div class="section-details-activity-row ${tone}">
        <div class="section-details-activity-main">
          <strong>${escapeHtml(ev.label)}${qtyBit}</strong>
          <span>${escapeHtml(displayDate(ev.date))} · ${escapeHtml(ev.note || "—")}</span>
        </div>
        <div class="section-details-activity-amt">${escapeHtml(formatReportAmount(ev.amount, currency))}</div>
      </div>
    `;
  }).join("");
  return `<div class="section-details-activity">${rows}</div>`;
}

function renderInventoryItemDetailsOverlay(groupId){
  const data = buildInventoryItemDetailsPayload(groupId);
  if (!data || !els.sectionDetailsBody) {
    if (els.sectionDetailsBody) {
      els.sectionDetailsBody.innerHTML = `<div class="section-details-empty">Item not found.</div>`;
    }
    return;
  }

  const m = data.metrics;
  const g = data.group;
  const cur = data.currency;
  const cat = g.itemCategory;
  const pnlTone = m.profitLoss >= 0 ? "success" : "danger";
  const pnlLabel = m.profitLoss >= 0 ? "Profit" : "Loss";
  const metricsHtml = [
    sectionDetailsMetricHtml("Bought qty", escapeHtml(inventoryQtyLabel(m.boughtQty, cat, g)), "primary"),
    sectionDetailsMetricHtml("Sold qty", escapeHtml(inventoryQtyLabel(m.soldQty, cat, g))),
    sectionDetailsMetricHtml("Remaining", escapeHtml(inventoryQtyLabel(m.remainingQty, cat, g)), data.stockStatus.tone),
    sectionDetailsMetricHtml("Status", escapeHtml(m.status), data.stockStatus.tone),
    sectionDetailsMetricHtml("Unit cost", escapeHtml(formatReportAmount(m.unitCost, cur))),
    sectionDetailsMetricHtml("Default sell", escapeHtml(formatReportAmount(m.unitSold, cur))),
    sectionDetailsMetricHtml("Purchase total", escapeHtml(formatReportAmount(m.purchaseTotal, cur))),
    sectionDetailsMetricHtml("Sales total", escapeHtml(formatReportAmount(m.salesTotal, cur)), "success"),
    sectionDetailsMetricHtml(pnlLabel, escapeHtml(formatReportAmount(Math.abs(m.profitLoss), cur)), pnlTone),
    sectionDetailsMetricHtml("Stock value", escapeHtml(formatReportAmount(m.stockValue, cur))),
    sectionDetailsMetricHtml("Paid", escapeHtml(formatReportAmount(m.paidTotal, cur)), "success"),
    sectionDetailsMetricHtml("Due", escapeHtml(formatReportAmount(m.balanceTotal, cur)), m.balanceTotal > 0 ? "warning" : ""),
    sectionDetailsMetricHtml("Purchase VAT", escapeHtml(formatReportAmount(m.purchaseVat, cur))),
    sectionDetailsMetricHtml("Sales VAT", escapeHtml(formatReportAmount(m.salesVat, cur))),
    sectionDetailsMetricHtml("VAT total", escapeHtml(formatReportAmount(m.vatTotal, cur)))
  ].join("");

  els.sectionDetailsBody.innerHTML = `
    <p class="section-details-note">Live records for this stock item only. Charts cover quantity movement, purchases vs sales, and value mix.</p>
    <div class="section-details-metrics">${metricsHtml}</div>
    <div class="section-details-charts">
      <div class="section-details-chart-card">
        <h4>Qty mix</h4>
        <div class="section-details-chart-wrap"><canvas id="itemDetailsChart1"></canvas></div>
      </div>
      <div class="section-details-chart-card">
        <h4>Sales vs purchases</h4>
        <div class="section-details-chart-wrap"><canvas id="itemDetailsChart2"></canvas></div>
      </div>
      <div class="section-details-chart-card is-wide">
        <h4>Stock remaining over time</h4>
        <div class="section-details-chart-wrap"><canvas id="itemDetailsChart3"></canvas></div>
      </div>
    </div>
    <div class="section-details-chart-card section-details-activity-card">
      <h4>Recent activity</h4>
      ${inventoryItemActivityHtml(data)}
    </div>
  `;

  const { colors, options } = sectionDetailsChartDefaults();
  const qtyLabels = ["Bought", "Sold", "Remaining"];
  const qtyValues = [data.qtyMix.bought, data.qtyMix.sold, data.qtyMix.remaining];
  const qtyTotal = qtyValues.reduce((sum, n) => sum + Number(n || 0), 0);
  createSectionDetailsChart(document.getElementById("itemDetailsChart1"), {
    type: "doughnut",
    data: {
      labels: qtyTotal > 0 ? qtyLabels : ["No stock"],
      datasets: [
        sectionDetailsDoughnutDataset(
          qtyTotal > 0 ? qtyValues : [1],
          qtyTotal > 0
            ? [colors.primary, colors.success, colors.warning]
            : ["rgba(208,213,221,.55)"]
        )
      ]
    },
    options: sectionDetailsDoughnutOptions(options, "60%")
  });

  const months = sectionDetailsSortedMonthKeys(data.monthMap.keys());
  createSectionDetailsChart(document.getElementById("itemDetailsChart2"), {
    type: "line",
    data: {
      labels: months.length ? months.map(sectionDetailsMonthLabel) : ["—"],
      datasets: [
        sectionDetailsLineDataset(
          "Purchases",
          months.map(key => Number(data.monthMap.get(key)?.purchase || 0)),
          colors.primary
        ),
        sectionDetailsLineDataset(
          "Sales",
          months.map(key => Number(data.monthMap.get(key)?.sales || 0)),
          colors.success
        )
      ]
    },
    options
  });

  const stockLabels = data.stockPoints.length
    ? data.stockPoints.map(p => p.label)
    : ["—"];
  const stockValues = data.stockPoints.length
    ? data.stockPoints.map(p => p.remaining)
    : [Number(m.remainingQty || 0)];
  createSectionDetailsChart(document.getElementById("itemDetailsChart3"), {
    type: "line",
    data: {
      labels: stockLabels,
      datasets: [
        sectionDetailsLineDataset("Remaining qty", stockValues, colors.primary)
      ]
    },
    options: {
      ...options,
      scales: {
        ...options.scales,
        y: { ...options.scales.y, beginAtZero: true }
      }
    }
  });
}

async function openInventoryItemDetailsOverlay(groupId){
  if (!els.sectionDetailsModal || !els.sectionDetailsBody) return;
  const id = String(groupId || "").trim();
  if (!id) return;

  destroySectionDetailsCharts();
  clearSectionDetailsActions();
  if (isInventoryLazyMode()) {
    try { await ensureInventoryItemDetailLoaded(id); } catch (err) {
      console.warn("Inventory detail load failed:", err);
    }
  }
  const group = getGoodsGroups({ applyUiFilters: false }).find(g => g.group_id === id);
  if (!group) {
    if (els.sectionDetailsTitle) els.sectionDetailsTitle.textContent = "Item details";
    if (els.sectionDetailsDesc) els.sectionDetailsDesc.textContent = "Item not found.";
    els.sectionDetailsBody.innerHTML = `<div class="section-details-empty">Item not found.</div>`;
  } else {
    const status = inventoryItemStockStatus(group);
    if (els.sectionDetailsTitle) {
      els.sectionDetailsTitle.innerHTML = `<i class="fa-solid fa-box"></i><span class="section-details-title-text">${escapeHtml(group.person_name || "Item")}</span>`;
    }
    if (els.sectionDetailsDesc) {
      const code = group.itemCode ? `${group.itemCode} · ` : "";
      const brandBit = group.brand ? `${group.brand}${group.variantLabel ? ` · ${group.variantLabel}` : ""} · ` : "";
      els.sectionDetailsDesc.textContent = `${code}${brandBit}${normalizeInventoryItemType(group.itemType)} · ${status.label} · ${inventoryQtyLabel(group.remainingQty, group.itemCategory, group)} left · ${group.currency || "—"}`;
    }
    if (!sectionDetailsEnsureChartLib()) {
      els.sectionDetailsBody.innerHTML = `<div class="section-details-empty">Chart library is still loading. Close and open Details again.</div>`;
    } else {
      renderInventoryItemDetailsOverlay(id);
    }
  }

  els.sectionDetailsModal.classList.remove("hide");
  els.sectionDetailsModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function buildLoanPersonDetailsPayload(personName, direction){
  const name = String(personName || "").trim();
  const dir = direction === "given" ? "given" : "taken";
  if (!name) return null;

  const entries = getActiveEntries().filter(e =>
    e.direction === dir &&
    String(e.person_name || "").trim() === name &&
    !hasGoodsTag(e.notes) &&
    !hasExpenseAccountTag(e.notes) &&
    !hasInstallmentTag(e.notes)
  );
  if (!entries.length) return null;

  const principalRows = entries.filter(e => e.entry_kind === "principal");
  const actionRows = entries.filter(e => e.entry_kind !== "principal");
  const principalTotal = principalRows.reduce((sum, e) => sum + Number(e.principal_amount || 0), 0);
  const paidTotal = actionRows.reduce((sum, e) => sum + Number(e.action_amount || 0), 0);
  const remaining = Math.max(principalTotal - paidTotal, 0);
  const status = remaining <= 0 ? "Closed" : paidTotal > 0 ? "Partial" : "Open";
  const currency = principalRows[0]?.currency || actionRows[0]?.currency || "";
  const groupIds = new Set(entries.map(e => e.group_id).filter(Boolean));

  const timeline = entries.slice().sort((a, b) => {
    const aStamp = dateStamp(a.entry_kind === "principal" ? a.loan_date : a.action_date);
    const bStamp = dateStamp(b.entry_kind === "principal" ? b.loan_date : b.action_date);
    if (aStamp !== bStamp) return aStamp - bStamp;
    return (a.entry_kind === "principal" ? -1 : 1) - (b.entry_kind === "principal" ? -1 : 1);
  });

  let running = 0;
  const balancePoints = [];
  const monthMap = new Map();
  const flowEvents = [];
  timeline.forEach(entry => {
    const isPrincipal = entry.entry_kind === "principal";
    const amount = Number(isPrincipal ? entry.principal_amount : entry.action_amount || 0);
    const date = isPrincipal ? entry.loan_date : entry.action_date;
    running = isPrincipal ? running + amount : Math.max(running - amount, 0);
    balancePoints.push({ date, label: displayDate(date), remaining: running });
    if (!isPrincipal) {
      const key = sectionDetailsMonthKey(date);
      if (key) monthMap.set(key, (monthMap.get(key) || 0) + amount);
    }
    flowEvents.push({
      date,
      stamp: dateStamp(date),
      kind: isPrincipal ? "principal" : (entry.entry_kind === "partial" ? "partial" : "full"),
      label: isPrincipal ? "Principal" : (entry.entry_kind === "partial" ? "Partial payment" : "Full payment"),
      amount,
      note: String(entry.notes || "—").trim() || "—",
      delta: isPrincipal ? amount : -amount
    });
  });

  const recent = flowEvents
    .slice()
    .sort((a, b) => (b.stamp - a.stamp) || String(b.kind).localeCompare(String(a.kind)))
    .slice(0, 8);
  const firstDate = timeline[0]
    ? (timeline[0].entry_kind === "principal" ? timeline[0].loan_date : timeline[0].action_date)
    : null;
  const lastActivity = [...entries]
    .map(e => e.action_date || e.loan_date)
    .filter(Boolean)
    .sort((a, b) => dateStamp(b) - dateStamp(a))[0] || firstDate;

  return {
    person_name: name,
    direction: dir,
    currency,
    metrics: {
      principalTotal,
      paidTotal,
      remaining,
      status,
      loanCount: groupIds.size || 1,
      paymentCount: actionRows.length,
      opened: firstDate,
      updated: lastActivity
    },
    monthMap,
    balancePoints,
    recent,
    composition: {
      paid: Math.max(paidTotal, 0),
      remaining: Math.max(remaining, 0)
    }
  };
}

function loanDetailsActivityHtml(data){
  if (!data.recent.length) {
    return `<div class="section-details-empty">No loan activity yet.</div>`;
  }
  const currency = data.currency;
  const rows = data.recent.map(ev => {
    const tone = ev.delta >= 0 ? "is-in" : "is-out";
    return `
      <div class="section-details-activity-row ${tone}">
        <div class="section-details-activity-main">
          <strong>${escapeHtml(ev.label)}</strong>
          <span>${escapeHtml(displayDate(ev.date))} · ${escapeHtml(String(ev.note || "—"))}</span>
        </div>
        <div class="section-details-activity-amt">${escapeHtml(formatReportAmount(ev.amount, currency))}</div>
      </div>
    `;
  }).join("");
  return `<div class="section-details-activity">${rows}</div>`;
}

function renderLoanDetailsOverlay(personName, direction){
  const data = buildLoanPersonDetailsPayload(personName, direction);
  if (!data || !els.sectionDetailsBody) {
    if (els.sectionDetailsBody) {
      els.sectionDetailsBody.innerHTML = `<div class="section-details-empty">Loan not found.</div>`;
    }
    return;
  }

  const m = data.metrics;
  const cur = data.currency;
  const dirLabel = data.direction === "given" ? "Given" : "Taken";
  const paidLabel = data.direction === "given" ? "Received back" : "Returned back";
  const statusTone = m.status === "Closed" ? "success" : m.status === "Partial" ? "warning" : "primary";
  const metricsHtml = [
    sectionDetailsMetricHtml("Principal", escapeHtml(formatReportAmount(m.principalTotal, cur)), "primary"),
    sectionDetailsMetricHtml(paidLabel, escapeHtml(formatReportAmount(m.paidTotal, cur)), "success"),
    sectionDetailsMetricHtml("Remaining", escapeHtml(formatReportAmount(m.remaining, cur)), m.remaining > 0 ? "warning" : "success"),
    sectionDetailsMetricHtml("Status", escapeHtml(m.status), statusTone),
    sectionDetailsMetricHtml("Currency", escapeHtml(cur || "—")),
    sectionDetailsMetricHtml("Counterpart", escapeHtml(data.person_name || "—")),
    sectionDetailsMetricHtml("Direction", escapeHtml(dirLabel)),
    sectionDetailsMetricHtml("Loans", escapeHtml(String(m.loanCount))),
    sectionDetailsMetricHtml("Payments", escapeHtml(String(m.paymentCount))),
    sectionDetailsMetricHtml("Opened", escapeHtml(displayDate(m.opened || "—"))),
    sectionDetailsMetricHtml("Updated", escapeHtml(displayDate(m.updated || "—")))
  ].join("");

  els.sectionDetailsBody.innerHTML = `
    <p class="section-details-note">Live loan records for this person (${escapeHtml(dirLabel.toLowerCase())}). Charts cover payments over time and paid vs remaining.</p>
    <div class="section-details-metrics">${metricsHtml}</div>
    <div class="section-details-charts">
      <div class="section-details-chart-card">
        <h4>Paid vs remaining</h4>
        <div class="section-details-chart-wrap"><canvas id="loanDetailsChart1"></canvas></div>
      </div>
      <div class="section-details-chart-card">
        <h4>Payments over time</h4>
        <div class="section-details-chart-wrap"><canvas id="loanDetailsChart2"></canvas></div>
      </div>
      <div class="section-details-chart-card is-wide">
        <h4>Remaining balance over time</h4>
        <div class="section-details-chart-wrap"><canvas id="loanDetailsChart3"></canvas></div>
      </div>
    </div>
    <div class="section-details-chart-card section-details-activity-card">
      <h4>Recent payments &amp; principals</h4>
      ${loanDetailsActivityHtml(data)}
    </div>
  `;

  const { colors, options } = sectionDetailsChartDefaults();
  const mixTotal = data.composition.paid + data.composition.remaining;
  createSectionDetailsChart(document.getElementById("loanDetailsChart1"), {
    type: "doughnut",
    data: {
      labels: mixTotal > 0 ? [paidLabel, "Remaining"] : ["No balance"],
      datasets: [
        sectionDetailsDoughnutDataset(
          mixTotal > 0 ? [data.composition.paid, data.composition.remaining] : [1],
          mixTotal > 0
            ? [colors.success, "rgba(208,213,221,.75)"]
            : ["rgba(208,213,221,.55)"]
        )
      ]
    },
    options: sectionDetailsDoughnutOptions(options, "62%")
  });

  const months = sectionDetailsSortedMonthKeys(data.monthMap.keys());
  createSectionDetailsChart(document.getElementById("loanDetailsChart2"), {
    type: "line",
    data: {
      labels: months.length ? months.map(sectionDetailsMonthLabel) : ["—"],
      datasets: [
        sectionDetailsLineDataset(
          "Payments",
          months.map(key => Number(data.monthMap.get(key) || 0)),
          colors.primary
        )
      ]
    },
    options: {
      ...options,
      plugins: { ...options.plugins, legend: { display: false } }
    }
  });

  const balLabels = data.balancePoints.length ? data.balancePoints.map(p => p.label) : ["—"];
  const balValues = data.balancePoints.length ? data.balancePoints.map(p => p.remaining) : [Number(m.remaining || 0)];
  createSectionDetailsChart(document.getElementById("loanDetailsChart3"), {
    type: "line",
    data: {
      labels: balLabels,
      datasets: [
        sectionDetailsLineDataset("Remaining", balValues, colors.warning)
      ]
    },
    options: {
      ...options,
      scales: {
        ...options.scales,
        y: { ...options.scales.y, beginAtZero: true }
      }
    }
  });
}

function openLoanDetailsOverlay(personName, direction){
  if (!els.sectionDetailsModal || !els.sectionDetailsBody) return;
  const name = String(personName || "").trim();
  const dir = direction === "given" ? "given" : "taken";
  if (!name) return;

  destroySectionDetailsCharts();
  clearSectionDetailsActions();
  const data = buildLoanPersonDetailsPayload(name, dir);
  if (!data) {
    if (els.sectionDetailsTitle) els.sectionDetailsTitle.textContent = "Loan details";
    if (els.sectionDetailsDesc) els.sectionDetailsDesc.textContent = "Loan not found.";
    els.sectionDetailsBody.innerHTML = `<div class="section-details-empty">Loan not found.</div>`;
  } else {
    const dirLabel = dir === "given" ? "Given" : "Taken";
    if (els.sectionDetailsTitle) {
      els.sectionDetailsTitle.innerHTML = `<i class="fa-solid fa-user"></i><span class="section-details-title-text">${escapeHtml(data.person_name)}</span>`;
    }
    if (els.sectionDetailsDesc) {
      els.sectionDetailsDesc.textContent = `${dirLabel} · ${data.metrics.status} · Remaining ${formatReportAmount(data.metrics.remaining, data.currency)} · ${data.currency || "—"}`;
    }
    if (!sectionDetailsEnsureChartLib()) {
      els.sectionDetailsBody.innerHTML = `<div class="section-details-empty">Chart library is still loading. Close and open Details again.</div>`;
    } else {
      renderLoanDetailsOverlay(name, dir);
    }
  }

  els.sectionDetailsModal.classList.remove("hide");
  els.sectionDetailsModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function buildInstallmentItemDetailsPayload(groupId){
  const plan = getInstallmentPlanGroup(groupId);
  if (!plan) return null;

  const currency = plan.currency || "";
  const schedule = plan.schedule;
  const principalTotal = Number(plan.principalTotal || 0);
  const paidTotal = Number(plan.paidTotal || 0);
  const remaining = Number(plan.remaining || 0);
  const progressPct = principalTotal > 0 ? Math.min(100, Math.round((paidTotal / principalTotal) * 100)) : 0;
  const overdue = plan.status === "Overdue" || Number(schedule?.overdueCount || 0) > 0;
  const completed = remaining <= 0.00000001;
  const statusLabel = completed ? "Completed" : overdue ? "Overdue" : (plan.status || "Active");

  const monthMap = new Map();
  (plan.payments || []).forEach(row => {
    const key = sectionDetailsMonthKey(row.action_date);
    if (!key) return;
    monthMap.set(key, (monthMap.get(key) || 0) + Number(row.action_amount || 0));
  });

  const scheduleMix = { paid: 0, open: 0, overdue: 0 };
  if (schedule?.slots?.length) {
    schedule.slots.forEach(slot => {
      const st = String(slot.status || "").toLowerCase();
      if (Number(slot.balance || 0) <= 0.00000001 || st === "paid" || st === "closed") scheduleMix.paid += 1;
      else if (st === "overdue") scheduleMix.overdue += 1;
      else scheduleMix.open += 1;
    });
  }

  const recent = (plan.payments || [])
    .slice()
    .sort((a, b) => dateStamp(b.action_date) - dateStamp(a.action_date))
    .slice(0, 8)
    .map(row => {
      const alloc = parseInstallmentAllocation(installmentMetaFromNotes(row.notes).allocation);
      const allocText = alloc.length ? alloc.map(a => `#${a.index}`).join(" · ") : (schedule ? "—" : "Balance");
      return {
        date: row.action_date,
        stamp: dateStamp(row.action_date),
        label: row.entry_kind === "full" ? "Final payment" : "Partial payment",
        amount: Number(row.action_amount || 0),
        note: `${allocText}${cleanInstallmentDisplayNote(row.notes) ? ` · ${cleanInstallmentDisplayNote(row.notes)}` : ""}`
      };
    });

  return {
    plan,
    currency,
    metrics: {
      principalTotal,
      paidTotal,
      remaining,
      progressPct,
      status: statusLabel,
      overdue,
      completed,
      active: !completed && !overdue,
      installmentCount: schedule?.count || 0,
      paidCount: schedule?.paidCount || 0,
      paymentCount: (plan.payments || []).length,
      nextDue: schedule?.nextOpen?.dueDate || null,
      nextAmount: schedule?.nextOpen?.balance || 0
    },
    monthMap,
    scheduleMix,
    recent,
    composition: {
      paid: Math.max(paidTotal, 0),
      remaining: Math.max(remaining, 0)
    }
  };
}

function installmentItemActivityHtml(data){
  if (!data.recent.length) {
    return `<div class="section-details-empty">No payments yet.</div>`;
  }
  const currency = data.currency;
  const rows = data.recent.map(ev => `
    <div class="section-details-activity-row is-in">
      <div class="section-details-activity-main">
        <strong>${escapeHtml(ev.label)}</strong>
        <span>${escapeHtml(displayDate(ev.date))} · ${escapeHtml(ev.note || "—")}</span>
      </div>
      <div class="section-details-activity-amt">${escapeHtml(formatReportAmount(ev.amount, currency))}</div>
    </div>
  `).join("");
  return `<div class="section-details-activity">${rows}</div>`;
}

function renderInstallmentItemDetailsOverlay(groupId){
  const data = buildInstallmentItemDetailsPayload(groupId);
  if (!data || !els.sectionDetailsBody) {
    if (els.sectionDetailsBody) {
      els.sectionDetailsBody.innerHTML = `<div class="section-details-empty">Installment plan not found.</div>`;
    }
    return;
  }

  const m = data.metrics;
  const cur = data.currency;
  const statusTone = m.completed ? "success" : m.overdue ? "danger" : "primary";
  const metricsHtml = [
    sectionDetailsMetricHtml("Progress", escapeHtml(`${m.progressPct}%`), "primary"),
    sectionDetailsMetricHtml("Principal", escapeHtml(formatReportAmount(m.principalTotal, cur))),
    sectionDetailsMetricHtml("Paid", escapeHtml(formatReportAmount(m.paidTotal, cur)), "success"),
    sectionDetailsMetricHtml("Remaining", escapeHtml(formatReportAmount(m.remaining, cur)), m.remaining > 0 ? "warning" : "success"),
    sectionDetailsMetricHtml("Status", escapeHtml(m.status), statusTone),
    sectionDetailsMetricHtml("Currency", escapeHtml(cur || "—")),
    sectionDetailsMetricHtml("Counterpart", escapeHtml(data.plan.person_name || "—")),
    sectionDetailsMetricHtml("Installments", escapeHtml(m.installmentCount ? `${m.paidCount}/${m.installmentCount}` : String(m.paymentCount))),
    sectionDetailsMetricHtml("Next due", escapeHtml(m.nextDue ? displayDate(m.nextDue) : (m.completed ? "Complete" : "—"))),
    sectionDetailsMetricHtml("Next amount", escapeHtml(m.nextAmount ? formatReportAmount(m.nextAmount, cur) : "—"))
  ].join("");

  const hasScheduleMix = (data.scheduleMix.paid + data.scheduleMix.open + data.scheduleMix.overdue) > 0;

  els.sectionDetailsBody.innerHTML = `
    <p class="section-details-note">Live installment plan for this counterpart. Charts cover progress, schedule status, and payment activity.</p>
    <div class="section-details-metrics">${metricsHtml}</div>
    <div class="section-details-charts">
      <div class="section-details-chart-card">
        <h4>Paid vs remaining</h4>
        <div class="section-details-chart-wrap"><canvas id="installmentItemChart1"></canvas></div>
      </div>
      <div class="section-details-chart-card">
        <h4>${hasScheduleMix ? "Schedule status" : "Plan status"}</h4>
        <div class="section-details-chart-wrap"><canvas id="installmentItemChart2"></canvas></div>
      </div>
      <div class="section-details-chart-card is-wide">
        <h4>Payments over time</h4>
        <div class="section-details-chart-wrap"><canvas id="installmentItemChart3"></canvas></div>
      </div>
    </div>
    <div class="section-details-chart-card section-details-activity-card">
      <h4>Recent payments</h4>
      ${installmentItemActivityHtml(data)}
    </div>
  `;

  const { colors, options } = sectionDetailsChartDefaults();
  const mixTotal = data.composition.paid + data.composition.remaining;
  createSectionDetailsChart(document.getElementById("installmentItemChart1"), {
    type: "doughnut",
    data: {
      labels: mixTotal > 0 ? ["Paid", "Remaining"] : ["No balance"],
      datasets: [
        sectionDetailsDoughnutDataset(
          mixTotal > 0 ? [data.composition.paid, data.composition.remaining] : [1],
          mixTotal > 0
            ? [colors.success, "rgba(208,213,221,.75)"]
            : ["rgba(208,213,221,.55)"]
        )
      ]
    },
    options: sectionDetailsDoughnutOptions(options, "62%")
  });

  if (hasScheduleMix) {
    createSectionDetailsChart(document.getElementById("installmentItemChart2"), {
      type: "doughnut",
      data: {
        labels: ["Paid", "Open", "Overdue"],
        datasets: [
          sectionDetailsDoughnutDataset(
            [data.scheduleMix.paid, data.scheduleMix.open, data.scheduleMix.overdue],
            [colors.success, colors.primary, colors.danger]
          )
        ]
      },
      options: sectionDetailsDoughnutOptions(options, "58%")
    });
  } else {
    createSectionDetailsChart(document.getElementById("installmentItemChart2"), {
      type: "doughnut",
      data: {
        labels: ["Active", "Overdue", "Completed"],
        datasets: [
          sectionDetailsDoughnutDataset(
            [m.active ? 1 : 0, m.overdue ? 1 : 0, m.completed ? 1 : 0],
            [colors.primary, colors.danger, colors.success]
          )
        ]
      },
      options: sectionDetailsDoughnutOptions(options, "58%")
    });
  }

  const months = sectionDetailsSortedMonthKeys(data.monthMap.keys());
  createSectionDetailsChart(document.getElementById("installmentItemChart3"), {
    type: "line",
    data: {
      labels: months.length ? months.map(sectionDetailsMonthLabel) : ["—"],
      datasets: [
        sectionDetailsLineDataset(
          "Payments",
          months.map(key => Number(data.monthMap.get(key) || 0)),
          colors.primary
        )
      ]
    },
    options: {
      ...options,
      plugins: { ...options.plugins, legend: { display: false } }
    }
  });
}
