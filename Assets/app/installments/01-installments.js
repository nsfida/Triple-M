/* Modularized from script.js lines 21689-21805 — installment details/actions. Load order must be preserved. */
function renderInstallmentDetailsActions(plan){
  const host = els.sectionDetailsActions;
  if (!host) return;
  if (!plan) {
    clearSectionDetailsActions();
    return;
  }
  const groupId = String(plan.group_id || "").trim();
  const remaining = Number(plan.remaining || 0);
  const canPay = remaining > 0.00000001;
  host.dataset.groupId = groupId;
  host.classList.remove("hide");
  host.innerHTML = `
    <div class="card-action-grid section-details-action-grid${canPay ? " section-details-action-grid--triple" : ""}" role="group" aria-label="Installment actions">
      <button class="icon-btn ghost sectionDetailsActionBtn" type="button" data-action="pdf" data-group-id="${escapeHtml(groupId)}" title="Download PDF" aria-label="Download PDF">
        <i class="fa-solid fa-download" aria-hidden="true"></i>
      </button>
      <button class="icon-btn ghost sectionDetailsActionBtn" type="button" data-action="reminder" data-group-id="${escapeHtml(groupId)}" title="Set reminder" aria-label="Set reminder">
        <i class="fa-solid fa-bell" aria-hidden="true"></i>
      </button>
      ${canPay ? `
      <button class="icon-btn ghost sectionDetailsActionBtn" type="button" data-action="pay" data-group-id="${escapeHtml(groupId)}" title="Pay next installment" aria-label="Pay next installment">
        <i class="fa-solid fa-money-bill" aria-hidden="true"></i>
      </button>` : ""}
    </div>
  `;
  host.querySelectorAll(".sectionDetailsActionBtn").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.preventDefault();
      e.stopPropagation();
      const action = btn.dataset.action;
      const id = String(btn.dataset.groupId || host.dataset.groupId || "").trim();
      if (!id) return;
      if (action === "pdf") {
        try { await downloadInstallmentPlanPDF(id); }
        catch (err) { alert(err?.message || "Could not download PDF."); }
        return;
      }
      if (action === "reminder") {
        try { await window.openInstallmentReminderModal(id); }
        catch (err) { alert(err?.message || "Could not open reminder."); }
        return;
      }
      if (action === "pay") {
        openInstallmentPaymentModal(id);
      }
    });
  });
}

function openInstallmentItemDetailsOverlay(groupId){
  if (!els.sectionDetailsModal || !els.sectionDetailsBody) return;
  const id = String(groupId || "").trim();
  if (!id) return;
  els.sectionDetailsModal.dataset.detailsKind = "installment-item";
  els.sectionDetailsModal.dataset.detailsId = id;

  destroySectionDetailsCharts();
  clearSectionDetailsActions();
  const plan = getInstallmentPlanGroup(id);
  if (!plan) {
    if (els.sectionDetailsTitle) els.sectionDetailsTitle.textContent = "Installment details";
    if (els.sectionDetailsDesc) els.sectionDetailsDesc.textContent = "Plan not found.";
    els.sectionDetailsBody.innerHTML = `<div class="section-details-empty">Installment plan not found.</div>`;
  } else {
    const data = buildInstallmentItemDetailsPayload(id);
    if (els.sectionDetailsTitle) {
      els.sectionDetailsTitle.innerHTML = `<i class="fa-solid fa-calendar-check"></i><span class="section-details-title-text">${escapeHtml(plan.person_name || "Installment plan")}</span>`;
    }
    if (els.sectionDetailsDesc) {
      const pct = data?.metrics?.progressPct ?? 0;
      els.sectionDetailsDesc.textContent = `${data?.metrics?.status || plan.status} · ${pct}% paid · Remaining ${formatReportAmount(plan.remaining, plan.currency)} · ${plan.currency || "—"}`;
    }
    renderInstallmentDetailsActions(plan);
    if (!sectionDetailsEnsureChartLib()) {
      els.sectionDetailsBody.innerHTML = `<div class="section-details-empty">Chart library is still loading. Close and open Details again.</div>`;
    } else {
      renderInstallmentItemDetailsOverlay(id);
    }
  }

  els.sectionDetailsModal.classList.remove("hide");
  els.sectionDetailsModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function openSectionDetailsOverlay(section, options = {}){
  if (!els.sectionDetailsModal || !els.sectionDetailsBody) return;
  const key = String(section || "").toLowerCase();
  els.sectionDetailsModal.dataset.detailsKind = "section";
  els.sectionDetailsModal.dataset.detailsSection = key;
  els.sectionDetailsModal.dataset.detailsItemType = String(options.itemType || "").trim();
  destroySectionDetailsCharts();
  clearSectionDetailsActions();
  if (key === "inventory") {
    inventoryDetailsSelectedCurrency = "";
    inventoryDetailsItemTypeFilter = String(options.itemType || "").trim();
  } else if (key === "expenses") {
    expenseDetailsSelectedCurrency = "";
    inventoryDetailsItemTypeFilter = "";
  } else {
    inventoryDetailsItemTypeFilter = "";
  }

  const titles = {
    inventory: inventoryDetailsItemTypeFilter
      ? {
          title: `${inventoryDetailsItemTypeFilter} · Detailed chart`,
          desc: `Live stock, sales, profit, and invoice summary for the ${inventoryDetailsItemTypeFilter} category.`
        }
      : { title: "Inventory details", desc: "Live stock, sales, profit, and outstanding invoice summary by currency." },
    expenses: { title: "Expenses details", desc: "Live wallet top-ups, spending, and balances by currency." },
    installments: { title: "Installment details", desc: "Live plan progress, overdue status, and payment activity." },
    assets: { title: "Asset details", desc: "Portfolio performance, ownership, revenue, expenses, and profit/loss by asset." }
  };
  const meta = titles[key] || { title: "Details", desc: "Summary and graphs from live section records." };
  if (els.sectionDetailsTitle) els.sectionDetailsTitle.textContent = meta.title;
  if (els.sectionDetailsDesc) els.sectionDetailsDesc.textContent = meta.desc;

  const renderBody = () => {
    if (!sectionDetailsEnsureChartLib()) {
      els.sectionDetailsBody.innerHTML = `<div class="section-details-empty">Chart library is still loading. Close and open Details again.</div>`;
    } else if (key === "inventory") {
      renderInventoryDetailsOverlay();
    } else if (key === "expenses") {
      renderExpenseDetailsOverlay();
    } else if (key === "installments") {
      renderInstallmentDetailsOverlay();
    } else if (key === "assets") {
      if (typeof renderAssetsDetailsOverlay === "function") renderAssetsDetailsOverlay();
      else els.sectionDetailsBody.innerHTML = `<div class="section-details-empty">Asset details are unavailable.</div>`;
    } else {
      els.sectionDetailsBody.innerHTML = `<div class="section-details-empty">Unknown section.</div>`;
    }
  };

  const openAndRender = () => {
    els.sectionDetailsModal.classList.remove("hide");
    els.sectionDetailsModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";

    if (sectionDetailsEnsureChartLib()) {
      renderBody();
      return;
    }
    els.sectionDetailsBody.innerHTML = `<div class="section-details-empty">Loading charts…</div>`;
    ensureChartLibLoaded().then(ok => {
      if (!ok) {
        els.sectionDetailsBody.innerHTML = `<div class="section-details-empty">Chart library could not load.</div>`;
        return;
      }
      renderBody();
    });
  };

  if (key === "assets" && typeof loadAssetsFromDatabase === "function" && !state.assetsLoaded) {
    els.sectionDetailsModal.classList.remove("hide");
    els.sectionDetailsModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    els.sectionDetailsBody.innerHTML = `<div class="section-details-empty">Loading assets…</div>`;
    loadAssetsFromDatabase({ force: true })
      .catch(() => {})
      .finally(() => openAndRender());
    return;
  }

  openAndRender();
}
