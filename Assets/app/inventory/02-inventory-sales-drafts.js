/* Modularized from script.js lines 8998-12029 — sales drafts / cart. Load order must be preserved. */
function renderLoanCards(container, direction, searchKey = direction, options = {}){
  let groups = getFilteredGroups(direction, searchKey, options);

  if (!groups.length){
    container.innerHTML = `<div class="empty">No entries found.</div>`;
    ensureLoanCardsDelegation(container);
    return;
  }

  container.innerHTML = groups.map(group => {
    const statusClass = group.status === "Closed" ? "green" : group.status === "Partial" ? "orange" : "blue";
    const directionLabel = direction === "given" ? "Given" : "Taken";
    const movementLabel = direction === "given" ? "Received back" : "Returned back";
    const openOnly = group.remaining > 0;

    const showInstallmentMove = direction === "taken" && !options.hideMoveToInstallments;
    const personName = String(group.person_name || "").trim();
    const unsyncedEntries = getUnsyncedEntriesForPerson(personName, direction);
    const hasUnsynced = unsyncedEntries.length > 0;
    return `
      <details class="loan loan-details-card">
        <summary>
          <div class="loan-top loan-details-banner" data-loan-details="1" data-person="${escapeHtml(group.person_name || "")}" data-direction="${escapeHtml(direction)}" role="button" tabindex="0" title="View loan details">
            <div class="lt-main">
              <div class="loan-name"><i class="fa-solid fa-user"></i> ${escapeHtml(group.person_name || "Unnamed")}</div>
              <div class="loan-sub">
                <span>${escapeHtml(directionLabel)}</span>
                <span>Opened ${escapeHtml(displayDate(group.loan_date || "—"))}</span>
                <span>Updated ${escapeHtml(displayDate(group.lastActivity || group.loan_date || "—"))}</span>
                <span>${currencySymbolHtml(group.currency || "")}</span>
                <span>${escapeHtml(`${group.groupCount || 1} loan${(group.groupCount || 1) > 1 ? "s" : ""}`)}</span>
                ${hasUnsynced ? `<span class="badge orange">Not in DB (${unsyncedEntries.length})</span>` : ""}
                ${openOnly ? '<span class="badge orange">Open</span>' : '<span class="badge green">Closed</span>'}
                ${(() => {
                  const memberEntries = group.entries || [];
                  const legacy = window.DomainLedger?.groupHasLegacyMeta?.(memberEntries);
                  if (!legacy) return "";
                  const seed = memberEntries.find(e => e.is_legacy_meta) || memberEntries[0];
                  return DomainLedger.legacyFixBadgeHtml(seed?.group_id, seed?.id);
                })()}
              </div>
            </div>
            <div class="cell lt-status"><small>Status</small><strong><span class="badge ${statusClass}">${escapeHtml(group.status)}</span></strong></div>
            <div class="cell lt-principal"><small>Principal</small><strong>${money(group.principalTotal, group.currency)}</strong></div>
            <div class="cell lt-movement"><small>${escapeHtml(movementLabel)}</small><strong>${money(group.paidTotal, group.currency)}</strong></div>
            <div class="cell lt-remaining"><small>Remaining</small><strong>${money(group.remaining, group.currency)}</strong></div>
            <div class="lt-action">
              <div class="card-action-grid loan-inline-actions${hasUnsynced ? " card-action-grid--triple" : ""}" role="group" aria-label="Loan actions">
                <button class="icon-btn ghost loanHistoryToggle" type="button" data-history-toggle title="Show timeline" aria-label="Show timeline" aria-expanded="false">▾</button>
                <div class="menu-wrap">
                  <button class="icon-btn ghost menu-trigger person-menu-btn" type="button" aria-label="More actions" title="More actions" data-person-menu="${escapeHtml(group.primaryGroupId || group.person_name || "menu")}">☰</button>
                  <div class="menu-dropdown" data-person-menu-panel="${escapeHtml(group.primaryGroupId || group.person_name || "menu")}">
                    <button class="menu-item personActionBtn" type="button" data-action="pdf" data-person="${encodeURIComponent(group.person_name || "")}" data-direction="${escapeHtml(direction)}"><i class="fa-solid fa-download"></i> Download PDF</button>
                    ${hasUnsynced ? `<button class="menu-item personActionBtn" type="button" data-action="save-db" data-person="${encodeURIComponent(group.person_name || "")}" data-direction="${escapeHtml(direction)}">Save to Database</button>` : ""}
                    ${teamCanShowEdit("entries") ? `<button class="menu-item personActionBtn" type="button" data-action="edit-name" data-person="${encodeURIComponent(group.person_name || "")}" data-direction="${escapeHtml(direction)}">Edit Name</button>` : ""}
                    ${showInstallmentMove && teamCanShowEdit("entries") ? `<button class="menu-item personActionBtn" type="button" data-action="move-installment" data-person="${encodeURIComponent(group.person_name || "")}" data-direction="${escapeHtml(direction)}">Move to Installments</button>` : ""}
                    ${teamCanShowDelete("entries") ? `<button class="menu-item danger personActionBtn" type="button" data-action="delete" data-person="${encodeURIComponent(group.person_name || "")}" data-direction="${escapeHtml(direction)}">Delete Record</button>` : ""}
                  </div>
                </div>
                ${hasUnsynced ? `<button class="icon-btn savePersonBtn" type="button" title="Save missing records to database" aria-label="Save to database" data-person="${encodeURIComponent(group.person_name || "")}" data-direction="${escapeHtml(direction)}">💾</button>` : ""}
              </div>
            </div>
          </div>
        </summary>
        <div class="detail">
          <div class="detail-head">
            <div>
              <h4>Timeline</h4>
              <p>Oldest to newest inside each loan. New activity still brings the loan card to the top.</p>
            </div>
            <div class="badge ${statusClass}">${currencySymbolHtml(group.currency || "")}</div>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Remaining</th>
                  <th>Notes</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${group.rows.map(row => `
                  <tr>
                    <td>${escapeHtml(displayDate(row.date))}</td>
                    <td><span class="badge ${row.kind === "principal" ? "blue" : row.kind === "partial" ? "orange" : "green"}">${row.kind === "principal" ? "Principal" : row.kind === "partial" ? "Partial" : "Full"}</span></td>
                    <td>${money(row.amount, group.currency)}</td>
                    <td><strong>${money(row.remainingAfter, group.currency)}</strong></td>
                    <td class="loan-note-cell">
                      <span class="loan-note-inline" title="${escapeHtml(row.note)}">${escapeHtml(row.note)}</span>
                    </td>
                    <td>
                       <div style="display:flex;gap:4px;">
                         ${teamCanShowEdit("entries") ? `<button class="tiny ghost editRowBtn" data-id="${escapeHtml(row.entryId)}" title="Edit entry">✎</button>` : ""}
                         ${teamCanShowDelete("entries") ? `<button class="tiny danger delRowBtn" data-id="${escapeHtml(row.entryId)}" title="Delete entry">✕</button>` : ""}
                       </div>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    `;
  }).join("");

  container.querySelectorAll(".editRowBtn").forEach(btn => btn.addEventListener("click", () => openEditModal(btn.dataset.id)));
  container.querySelectorAll(".delRowBtn").forEach(btn => btn.addEventListener("click", () => deleteEntry(btn.dataset.id)));
  container.querySelectorAll("[data-legacy-fix-id]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      fixLegacyMetaEntry(btn.dataset.legacyFixId, btn.dataset.legacyFixGroup);
    });
  });
  container.querySelectorAll(".personActionBtn").forEach(btn => btn.addEventListener("click", async e => {
    e.preventDefault();
    const action = btn.dataset.action;
    const person = btn.dataset.person;
    const dir = btn.dataset.direction;
    if (action === "pdf") {
      await downloadPersonPDF(person, dir);
    } else if (action === "save-db") {
      await savePersonRecordsToDatabase(person, dir);
    } else if (action === "delete") {
      await deletePersonRecords(person, dir);
    } else if (action === "edit-name") {
      await renamePersonRecords(person, dir);
    } else if (action === "move-installment") {
      await movePersonToInstallments(person, dir);
    }
  }));
  container.querySelectorAll(".savePersonBtn").forEach(btn => btn.addEventListener("click", async e => {
    e.preventDefault();
    await savePersonRecordsToDatabase(btn.dataset.person, btn.dataset.direction);
  }));
  container.querySelectorAll("[data-note-toggle]").forEach(btn => btn.addEventListener("click", e => {
    e.preventDefault();
    const popover = btn.parentElement?.querySelector(".note-popover");
    if (!popover) return;
    document.querySelectorAll(".note-popover").forEach(p => {
      if (p !== popover) p.classList.add("hide");
    });
    popover.classList.toggle("hide");
    if (!popover.classList.contains("hide")) {
      positionNotePopover(btn, popover);
    }
    updateNoteBackdropVisibility();
  }));
  container.querySelectorAll("[data-note-close]").forEach(btn => btn.addEventListener("click", e => {
    e.preventDefault();
    btn.closest(".note-popover")?.classList.add("hide");
    updateNoteBackdropVisibility();
  }));
  container.querySelectorAll("[data-person-menu]").forEach(btn => btn.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    const key = btn.dataset.personMenu;
    const panel = container.querySelector(`[data-person-menu-panel="${key}"]`);
    if (!panel) return;
    document.querySelectorAll(".menu-dropdown.open").forEach(openPanel => {
      if (openPanel !== panel) openPanel.classList.remove("open");
    });
    document.querySelectorAll(".menu-trigger[aria-expanded='true']").forEach(trigger => {
      if (trigger !== btn) trigger.setAttribute("aria-expanded", "false");
    });
    const nowOpen = panel.classList.toggle("open");
    btn.setAttribute("aria-expanded", nowOpen ? "true" : "false");

    // Position the dropdown using fixed positioning
    if (nowOpen) {
      const rect = btn.getBoundingClientRect();
      panel.style.top = `${rect.bottom + 6}px`;
      panel.style.left = `${rect.right - panel.offsetWidth}px`;
      // Ensure dropdown doesn't go off-screen to the right
      if (rect.right - panel.offsetWidth < 10) {
        panel.style.left = `${Math.max(10, rect.left)}px`;
      }
    }
  }));
  ensureLoanCardsDelegation(container);
}

function ensureLoanCardsDelegation(container){
  if (!container || container.dataset.loanDetailsDelegated === "1") return;
  container.dataset.loanDetailsDelegated = "1";

  const interactiveSel = "button, a, input, select, textarea, .menu-wrap, .menu-dropdown, .lt-action, .loan-inline-actions, .card-action-grid";

  container.addEventListener("click", e => {
    const historyBtn = e.target.closest("[data-history-toggle]");
    if (historyBtn && container.contains(historyBtn)) {
      e.preventDefault();
      e.stopPropagation();
      const details = historyBtn.closest("details");
      if (details) {
        details.open = !details.open;
        historyBtn.setAttribute("aria-expanded", details.open ? "true" : "false");
      }
      return;
    }

    if (e.target.closest(interactiveSel)) return;
    const banner = e.target.closest("[data-loan-details]");
    if (!banner || !container.contains(banner)) return;
    e.preventDefault();
    e.stopPropagation();
    openLoanDetailsOverlay(banner.dataset.person, banner.dataset.direction);
  });

  container.addEventListener("toggle", e => {
    if (!(e.target instanceof HTMLDetailsElement)) return;
    if (!e.target.classList.contains("loan-details-card")) return;
    const btn = e.target.querySelector("[data-history-toggle]");
    if (btn) btn.setAttribute("aria-expanded", e.target.open ? "true" : "false");
  }, true);

  container.addEventListener("keydown", e => {
    if (e.key !== "Enter" && e.key !== " ") return;
    if (e.target.closest(interactiveSel)) return;
    const banner = e.target.closest("[data-loan-details]");
    if (!banner || !container.contains(banner)) return;
    e.preventDefault();
    openLoanDetailsOverlay(banner.dataset.person, banner.dataset.direction);
  });
}

function positionNotePopover(toggleBtn, popover){
  if (!toggleBtn || !popover) return;
  const rect = toggleBtn.getBoundingClientRect();
  const viewportPadding = 8;
  const gap = 6;

  popover.style.position = "fixed";
  popover.style.left = `${Math.max(viewportPadding, rect.left)}px`;
  popover.style.top = `${rect.bottom + gap}px`;
  popover.style.right = "auto";
  popover.style.transform = "none";
  popover.style.zIndex = "9999";

  let popRect = popover.getBoundingClientRect();
  const overflowRight = popRect.right - (window.innerWidth - viewportPadding);
  if (overflowRight > 0){
    popover.style.left = `${Math.max(viewportPadding, rect.left - overflowRight)}px`;
    popRect = popover.getBoundingClientRect();
  }

  const overflowBottom = popRect.bottom - (window.innerHeight - viewportPadding);
  if (overflowBottom > 0){
    const top = Math.max(viewportPadding, rect.top - popRect.height - gap);
    popover.style.top = `${top}px`;
  }
}

function ensureNoteBackdrop(){
  let backdrop = document.getElementById("noteBackdrop");
  if (!backdrop){
    backdrop = document.createElement("div");
    backdrop.id = "noteBackdrop";
    backdrop.className = "note-backdrop hide";
    backdrop.addEventListener("click", () => {
      document.querySelectorAll(".note-popover").forEach(pop => pop.classList.add("hide"));
      backdrop.classList.add("hide");
    });
    document.body.appendChild(backdrop);
  }
  return backdrop;
}

function updateNoteBackdropVisibility(){
  const backdrop = ensureNoteBackdrop();
  const hasOpenPopover = Array.from(document.querySelectorAll(".note-popover")).some(pop => !pop.classList.contains("hide"));
  backdrop.classList.toggle("hide", !hasOpenPopover);
}

function repositionOpenNotePopovers(){
  document.querySelectorAll(".note-wrap").forEach(wrap => {
    const popover = wrap.querySelector(".note-popover");
    const toggle = wrap.querySelector("[data-note-toggle]");
    if (!popover || !toggle || popover.classList.contains("hide")) return;
    positionNotePopover(toggle, popover);
  });
}

function renderLoanSelectors(){
  const givenGroups = groupByLoan(getActiveEntries().filter(e => e.direction === "given")).filter(g => calculateLoan(g).remaining > 0);
  const takenBase = getActiveEntries().filter(e =>
    e.direction === "taken" &&
    !hasGoodsTag(e.notes) &&
    !hasExpenseAccountTag(e.notes)
  );
  const takenFiltered = state.modalInstallment
    ? takenBase.filter(e => hasInstallmentTag(e.notes))
    : takenBase.filter(e => !hasInstallmentTag(e.notes));
  const takenGroups = groupByLoan(takenFiltered).filter(g => calculateLoan(g).remaining > 0);

  const makeOptions = groups => groups.length
    ? `<option value="">Choose one</option>` + groups.map(g => {
        const remaining = calculateLoan(g).remaining;
        return `<option value="${escapeHtml(g.group_id)}">${escapeHtml(g.person_name)} — ${escapeHtml(formatReportAmount(remaining, g.currency))} remaining</option>`;
      }).join("")
    : `<option value="">No open ${state.modalInstallment ? "installment plans" : "loans"} available</option>`;

  els.modalLoanSelect.innerHTML = state.modalDirection === "given" ? makeOptions(givenGroups) : makeOptions(takenGroups);

  const hasOptions = (state.modalDirection === "given" ? givenGroups : takenGroups).length > 0;
  els.modalLoanSelect.disabled = !hasOptions;
  els.paymentSubmitBtn.disabled = !hasOptions;
}

function getInventorySelectableGroups(){
  return getGoodsGroups({ applyUiFilters: false }).filter(g => g.remainingQty > 0);
}

function getSelectedGoodsSaleGroupIds(exceptLine = null){
  if (!els.goodsSaleLines) return new Set();
  return new Set(
    Array.from(els.goodsSaleLines.querySelectorAll(".inventory-sale-line"))
      .filter(line => line !== exceptLine)
      .map(line => String(line.querySelector(".goods-sale-item")?.value || "").trim())
      .filter(Boolean)
  );
}

function inventorySaleItemOptionsHtml(selectedGroupId = "", excludeIds = null){
  const taken = excludeIds || getSelectedGoodsSaleGroupIds();
  const groups = getInventorySelectableGroups().filter(group =>
    group.group_id === selectedGroupId || !taken.has(group.group_id)
  );
  return ['<option value="">Select item</option>']
    .concat(groups.map(group =>
      `<option value="${escapeHtml(group.group_id)}" ${group.group_id === selectedGroupId ? "selected" : ""}>${escapeHtml(inventoryGroupOptionLabel(group))}</option>`
    ))
    .join("");
}

function refreshGoodsSaleItemOptions(preferFocusLine = null){
  if (!els.goodsSaleLines) return;
  els.goodsSaleLines.querySelectorAll(".inventory-sale-line").forEach(line => {
    const select = line.querySelector(".goods-sale-item");
    if (!select) return;
    const current = String(select.value || "");
    const keepFocus = preferFocusLine === line && document.activeElement === select;
    select.innerHTML = inventorySaleItemOptionsHtml(current, getSelectedGoodsSaleGroupIds(line));
    select.value = current;
    if (keepFocus) {
      try { select.focus({ preventScroll: true }); } catch {}
    }
  });
}

function inventoryGroupOptionLabel(group){
  const codePart = group.itemCode ? `${group.itemCode} - ` : "";
  return `${codePart}${group.person_name} - ${inventoryQtyLabel(group.remainingQty, group.itemCategory, group)} left`;
}

function renderGoodsCustomerOptions(){
  if (!els.goodsCustomerSelect) return;
  const names = getInventoryCustomerNames();
  els.goodsCustomerSelect.innerHTML = [
    '<option value="">Select customer</option>',
    ...names.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`),
    `<option value="${INVENTORY_NEW_CUSTOMER_VALUE}">+ Add new customer</option>`
  ].join("");
  if (!names.length) els.goodsCustomerSelect.value = INVENTORY_NEW_CUSTOMER_VALUE;
  syncGoodsCustomerFields();
}

function syncGoodsCustomerFields(){
  if (!els.goodsCustomerSelect || !els.goodsNewCustomerField || !els.goodsNewCustomerName) return;
  const isNew = els.goodsCustomerSelect.value === INVENTORY_NEW_CUSTOMER_VALUE;
  els.goodsNewCustomerField.classList.toggle("hide", !isNew);
  if (els.goodsNewCustomerPhoneField) els.goodsNewCustomerPhoneField.classList.toggle("hide", !isNew);
  if (els.goodsNewCustomerAddressField) els.goodsNewCustomerAddressField.classList.toggle("hide", !isNew);
  document.getElementById("goodsNewCustomerCompanyField")?.classList.toggle("hide", !isNew);
  document.getElementById("goodsNewCustomerTrnField")?.classList.toggle("hide", !isNew);
  document.getElementById("goodsNewCustomerEmailField")?.classList.toggle("hide", !isNew);
  els.goodsNewCustomerName.required = isNew;
  if (!isNew) {
    els.goodsNewCustomerName.value = "";
    if (els.goodsNewCustomerPhone) els.goodsNewCustomerPhone.value = "";
    if (els.goodsNewCustomerAddress) els.goodsNewCustomerAddress.value = "";
    const companyEl = document.getElementById("goodsNewCustomerCompany");
    const trnEl = document.getElementById("goodsNewCustomerTrn");
    const emailEl = document.getElementById("goodsNewCustomerEmail");
    if (companyEl) companyEl.value = "";
    if (trnEl) trnEl.value = "";
    if (emailEl) emailEl.value = "";
  }
}

function getSelectedGoodsCustomerName(form){
  const selected = String(form.querySelector('[name="customer_name_select"]')?.value || "").trim();
  if (selected === INVENTORY_NEW_CUSTOMER_VALUE){
    return String(form.querySelector('[name="new_customer_name"]')?.value || "").trim();
  }
  return selected;
}

function getSelectedGoodsCustomerContact(form){
  const selected = String(form.querySelector('[name="customer_name_select"]')?.value || "").trim();
  if (selected === INVENTORY_NEW_CUSTOMER_VALUE){
    return {
      phone: String(form.querySelector('[name="new_customer_phone"]')?.value || "").trim(),
      address: String(form.querySelector('[name="new_customer_address"]')?.value || "").trim(),
      company: String(form.querySelector('[name="new_customer_company"]')?.value || "").trim(),
      trn: String(form.querySelector('[name="new_customer_trn"]')?.value || "").trim(),
      email: String(form.querySelector('[name="new_customer_email"]')?.value || "").trim()
    };
  }
  return getInventoryCustomerContact(selected);
}

function inventorySaleUnitOptions(group){
  return inventoryUnitSelectOptionsHtml(group?.itemCategory, group?.quantityUnit);
}

function buildGoodsSaleLine(groupId = ""){
  const groups = getInventorySelectableGroups();
  const options = inventorySaleItemOptionsHtml(groupId);
  const selectedGroup = groups.find(g => g.group_id === groupId);
  const selectedCategory = normalizeInventoryCategory(selectedGroup?.itemCategory);
  const isMeasured = inventoryIsDecimalCategory(selectedCategory);
  const taxDefault = inventoryTaxDefaultsForGroup(selectedGroup);
  const vatRateLabel = taxDefault.rate > 0 ? `${trimInventoryNumber(taxDefault.rate, 2)}%` : "";
  return `
    <div class="inventory-sale-line" data-tax-manual="false">
      <div class="inventory-sale-line-top">
        <select class="select goods-sale-item" aria-label="Item">${options}</select>
        <button class="icon-btn ghost goods-sale-remove" type="button" aria-label="Remove item" title="Remove">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <div class="inventory-sale-line-main">
        <div class="goods-sale-qty-unit" title="Quantity">
          <input class="input goods-sale-qty" type="number" min="${isMeasured ? "0.001" : "1"}" step="${isMeasured ? "0.001" : "1"}" value="1" placeholder="0" aria-label="Qty" />
          <select class="select goods-sale-unit" ${isMeasured ? "" : "disabled"} aria-label="Unit">${inventorySaleUnitOptions(selectedGroup)}</select>
        </div>
        <input class="input goods-sale-price" type="number" min="0" step="0.01" placeholder="Price" aria-label="Unit price" title="Unit price" />
        <input class="input goods-sale-line-total hide" type="text" readonly tabindex="-1" aria-hidden="true" />
        <label class="inventory-sale-vat-toggle" title="Applies the VAT % saved in settings for this currency">
          <input class="goods-sale-tax-applied" type="checkbox" ${taxDefault.rate > 0 ? "checked" : ""} />
          <span>VAT</span>
          <em class="goods-sale-tax-rate-label">${escapeHtml(vatRateLabel)}</em>
        </label>
        <select class="select goods-sale-tax-mode" aria-label="VAT mode" title="VAT treatment">
          <option value="ADD" ${taxDefault.mode === TAX_MODE_ADD ? "selected" : ""}>Add</option>
          <option value="INCLUDE" ${taxDefault.mode === TAX_MODE_INCLUDE ? "selected" : ""}>Incl</option>
        </select>
      </div>
      <div class="inventory-sale-line-meta">${selectedGroup ? escapeHtml(`${selectedGroup.currency} · Stock ${inventoryQtyLabel(selectedGroup.remainingQty, selectedCategory, selectedGroup)}`) : "Pick an item"}</div>
    </div>
  `;
}

function syncGoodsSaleLineMeta(line){
  if (!line) return;
  const groupId = line.querySelector(".goods-sale-item")?.value || "";
  const group = getInventorySelectableGroups().find(g => g.group_id === groupId);
  const meta = line.querySelector(".inventory-sale-line-meta");
  const totalInput = line.querySelector(".goods-sale-line-total");
  if (!meta) return;
  if (!group) {
    meta.textContent = "Pick an item";
    return;
  }
  const totalText = totalInput?.value
    ? `Total ${totalInput.value}`
    : "";
  const stockText = `Stock ${inventoryQtyLabel(group.remainingQty, group.itemCategory, group)}`;
  const taxBit = totalInput?.dataset.taxApplied === "1" && Number(totalInput.dataset.rawTax || 0)
    ? `VAT ${formatReportAmount(Number(totalInput.dataset.rawTax || 0), group.currency)}`
    : "";
  meta.textContent = [totalText, taxBit, `${group.currency} · ${stockText}`].filter(Boolean).join(" · ");
}

function getGoodsSaleTotalsByCurrency(){
  const totalsByCurrency = new Map();
  if (!els.goodsSaleLines) return totalsByCurrency;
  const lines = Array.from(els.goodsSaleLines.querySelectorAll(".inventory-sale-line"));
  for (const line of lines){
    const groupId = line.querySelector(".goods-sale-item")?.value || "";
    const group = getInventorySelectableGroups().find(g => g.group_id === groupId);
    const amount = Number(line.querySelector(".goods-sale-line-total")?.dataset.rawTotal || 0);
    if (!group || !amount) continue;
    totalsByCurrency.set(group.currency, (totalsByCurrency.get(group.currency) || 0) + amount);
  }
  return totalsByCurrency;
}

function formatInventoryTotalsByCurrency(totalsByCurrency, key = null, options = {}){
  const rows = totalsByCurrency instanceof Map
    ? Array.from(totalsByCurrency.entries())
    : Object.entries(totalsByCurrency || {});
  return rows
    .filter(([, value]) => key ? Number.isFinite(Number(value?.[key])) : Number(value || 0))
    .map(([currency, value]) => moneyText(key ? value[key] : value, currency, options))
    .join(" | ");
}

function updateGoodsSalePaymentFields(totalsByCurrency = getGoodsSaleTotalsByCurrency()){
  if (!els.goodsSalePaidAmount || !els.goodsSaleBalanceAmount) return;
  const totals = Array.from(totalsByCurrency.entries()).filter(([, amount]) => Number(amount || 0) > 0);
  if (!totals.length){
    els.goodsSalePaidAmount.disabled = false;
    els.goodsSalePaidAmount.value = "";
    els.goodsSaleBalanceAmount.value = "";
    els.goodsSalePaidAmount.removeAttribute("max");
    updateGoodsSaleWalletSelector(totalsByCurrency);
    return;
  }
  if (totals.length !== 1){
    els.goodsSalePaidAmount.disabled = true;
    els.goodsSalePaidAmount.value = "";
    els.goodsSalePaidAmount.dataset.autoPaid = "true";
    els.goodsSalePaidAmount.placeholder = "Multiple currencies";
    els.goodsSalePaidAmount.removeAttribute("max");
    els.goodsSaleBalanceAmount.value = formatInventoryTotalsByCurrency(totalsByCurrency);
    applyCurrencyFontClass(els.goodsSaleBalanceAmount, "");
    updateGoodsSaleWalletSelector(totalsByCurrency);
    return;
  }
  const [currency, total] = totals[0];
  els.goodsSalePaidAmount.disabled = false;
  els.goodsSalePaidAmount.placeholder = "0.00";
  els.goodsSalePaidAmount.max = trimInventoryNumber(total);
  if (els.goodsSalePaidAmount.dataset.autoPaid !== "false"){
    els.goodsSalePaidAmount.value = trimInventoryNumber(total);
    els.goodsSalePaidAmount.dataset.autoPaid = "true";
  }
  const paid = Math.max(Number(els.goodsSalePaidAmount.value || 0), 0);
  const balance = Math.max(Number(total || 0) - Math.min(paid, Number(total || 0)), 0);
  els.goodsSaleBalanceAmount.value = moneyText(balance, currency);
  applyCurrencyFontClass(els.goodsSaleBalanceAmount, currency);
  updateGoodsSaleWalletSelector(totalsByCurrency);
}

function updateGoodsSaleGrandTotal(){
  if (!els.goodsSaleGrandTotal || !els.goodsSaleLines) return;
  const totalsByCurrency = getGoodsSaleTotalsByCurrency();
  els.goodsSaleGrandTotal.value = totalsByCurrency.size
    ? formatInventoryTotalsByCurrency(totalsByCurrency)
    : "";
  const onlyCurrency = totalsByCurrency.size === 1 ? Array.from(totalsByCurrency.keys())[0] : "";
  applyCurrencyFontClass(els.goodsSaleGrandTotal, onlyCurrency);
  updateGoodsSalePaymentFields(totalsByCurrency);
}

function updateGoodsSaleLine(line, sourceEl = null){
  if (!line) return;
  const groupId = line.querySelector(".goods-sale-item")?.value || "";
  const group = getInventorySelectableGroups().find(g => g.group_id === groupId);
  const qtyInput = line.querySelector(".goods-sale-qty");
  const unitSelect = line.querySelector(".goods-sale-unit");
  const priceInput = line.querySelector(".goods-sale-price");
  const totalInput = line.querySelector(".goods-sale-line-total");
  const taxAppliedInput = line.querySelector(".goods-sale-tax-applied");
  const taxModeInput = line.querySelector(".goods-sale-tax-mode");
  const taxRateLabel = line.querySelector(".goods-sale-tax-rate-label");
  const category = normalizeInventoryCategory(group?.itemCategory);
  const itemChanged = sourceEl?.classList?.contains("goods-sale-item");
  const taxChanged = sourceEl?.classList?.contains("goods-sale-tax-applied") ||
    sourceEl?.classList?.contains("goods-sale-tax-mode");
  if (taxChanged) line.dataset.taxManual = "true";
  const isMeasured = inventoryIsDecimalCategory(category);
  if (unitSelect && group){
    const selectedUnit = normalizeInventoryUnit(unitSelect.value, category);
    unitSelect.innerHTML = inventorySaleUnitOptions(group);
    unitSelect.value = selectedUnit;
    unitSelect.disabled = !isMeasured;
  }
  if (qtyInput){
    qtyInput.min = isMeasured ? "0.001" : "1";
    qtyInput.step = isMeasured ? "0.001" : "1";
    qtyInput.placeholder = inventoryQtyFieldLabel(category);
  }
  if (priceInput) priceInput.placeholder = inventorySalePricePlaceholder(category);
  const rawQtyValue = String(qtyInput?.value || "").trim();
  const qty = rawQtyValue
    ? normalizeInventoryQuantityInput(rawQtyValue, category, unitSelect?.value || inventoryBaseUnitForCategory(category))
    : 0;
  const visibleQty = isMeasured
    ? Number(qtyInput?.value || 0)
    : qty;
  if (qtyInput && document.activeElement !== qtyInput && visibleQty > 0) qtyInput.value = trimInventoryNumber(visibleQty, isMeasured ? 3 : 0);
  const editingPrice = sourceEl === priceInput;
  if (group && priceInput && !editingPrice && (!priceInput.value || Number(priceInput.value) <= 0)){
    const defaultPrice = Number(group.defaultUnitSoldPrice || 0) || Number(group.unitActualPrice || 0);
    priceInput.value = defaultPrice ? trimInventoryNumber(defaultPrice) : "";
  }
  const taxDefault = inventoryTaxDefaultsForGroup(group || { currency: state.lastCurrency || "AED" });
  if (group && (itemChanged || line.dataset.taxManual !== "true")) {
    if (taxAppliedInput) taxAppliedInput.checked = taxDefault.rate > 0;
    if (taxModeInput) taxModeInput.value = taxDefault.mode;
    line.dataset.taxManual = "false";
  }
  if (taxRateLabel) {
    taxRateLabel.textContent = taxDefault.rate > 0 ? `${trimInventoryNumber(taxDefault.rate, 2)}%` : "";
  }
  const lineBase = qty * Number(priceInput?.value || 0);
  const vatOn = !!taxAppliedInput?.checked;
  const breakdown = calculateTaxBreakdown(
    lineBase,
    taxDefault.rate,
    taxModeInput?.value || taxDefault.mode,
    vatOn
  );
  if (totalInput){
    totalInput.dataset.rawNet = String(breakdown.net);
    totalInput.dataset.rawTax = String(breakdown.tax);
    totalInput.dataset.rawTotal = String(breakdown.total);
    totalInput.dataset.taxRate = String(breakdown.rate);
    totalInput.dataset.taxMode = breakdown.mode;
    totalInput.dataset.taxApplied = breakdown.applied ? "1" : "0";
    totalInput.value = group && breakdown.total ? moneyText(breakdown.total, group.currency) : "";
    applyCurrencyFontClass(totalInput, group?.currency || "");
    totalInput.title = group
      ? formatTaxSummary(breakdown, group.currency)
      : "Line total";
  }
  syncGoodsSaleLineMeta(line);
  if (itemChanged) refreshGoodsSaleItemOptions(line);
  updateGoodsSaleGrandTotal();
}

function addGoodsSaleLine(groupId = ""){
  if (!els.goodsSaleLines) return;
  const taken = getSelectedGoodsSaleGroupIds();
  const nextId = groupId && !taken.has(groupId) ? groupId : "";
  els.goodsSaleLines.insertAdjacentHTML("beforeend", buildGoodsSaleLine(nextId));
  const line = els.goodsSaleLines.lastElementChild;
  updateGoodsSaleLine(line);
  refreshGoodsSaleItemOptions(line);
  toggleGoodsSaleRemoveButtons();
  try {
    line?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    line?.querySelector(".goods-sale-item")?.focus({ preventScroll: true });
  } catch {}
}

function toggleGoodsSaleRemoveButtons(){
  if (!els.goodsSaleLines) return;
  const lines = els.goodsSaleLines.querySelectorAll(".inventory-sale-line");
  lines.forEach(line => {
    const btn = line.querySelector(".goods-sale-remove");
    if (btn) btn.disabled = lines.length === 1;
  });
}

function renderGoodsSaleLines(prefillGroupIds = []){
  if (!els.goodsSaleLines) return;
  const ids = prefillGroupIds.length ? prefillGroupIds : [""];
  els.goodsSaleLines.innerHTML = ids.map(groupId => buildGoodsSaleLine(groupId)).join("");
  els.goodsSaleLines.querySelectorAll(".inventory-sale-line").forEach(line => updateGoodsSaleLine(line));
  refreshGoodsSaleItemOptions();
  toggleGoodsSaleRemoveButtons();
}

function collectGoodsSaleLines(){
  if (!els.goodsSaleLines) return [];
  return Array.from(els.goodsSaleLines.querySelectorAll(".inventory-sale-line")).map(line => {
    const groupId = line.querySelector(".goods-sale-item")?.value || "";
    const group = getInventorySelectableGroups().find(g => g.group_id === groupId);
    const category = normalizeInventoryCategory(group?.itemCategory);
    const unit = normalizeInventoryUnit(line.querySelector(".goods-sale-unit")?.value, category);
    const qtyValue = String(line.querySelector(".goods-sale-qty")?.value || "").trim();
    const qty = qtyValue ? normalizeInventoryQuantityInput(qtyValue, category, unit) : 0;
    const unitPrice = Number(line.querySelector(".goods-sale-price")?.value || 0);
    const totalInput = line.querySelector(".goods-sale-line-total");
    return {
      groupId,
      qty,
      unitPrice,
      unit,
      itemCategory: category,
      taxApplied: totalInput?.dataset.taxApplied === "1",
      taxRate: normalizeTaxRate(totalInput?.dataset.taxRate),
      taxMode: normalizeTaxMode(totalInput?.dataset.taxMode),
      taxAmount: Number(totalInput?.dataset.rawTax || 0),
      netAmount: Number(totalInput?.dataset.rawNet || 0),
      grossAmount: Number(totalInput?.dataset.rawTotal || 0)
    };
  }).filter(line => line.groupId);
}

function getGoodsGroups(options = {}){
  const applyUiFilters = options.applyUiFilters !== false;
  const groups = groupByLoan(getActiveEntries().filter(e =>
    (e.direction === "goods" || (e.direction === "taken" && hasGoodsTag(e.notes))) &&
    !isInventoryCustomerOnlyEntry(e)
  ))
    .map(group => {
      const principalMeta = goodsMetaFromNotes(group.principal?.notes);
      const purchaseActions = group.actions.filter(row => inferGoodsActionType(row) === INVENTORY_TX_PURCHASE);
      const settlementActions = group.actions.filter(isInventorySettlementAction);
      const saleActions = dedupeInventoryActionEntries(group.actions.filter(isInventorySaleAction));
      const purchaseMetas = purchaseActions.map(row => goodsMetaFromNotes(row.notes));
      const itemType = normalizeInventoryItemType(
        principalMeta.itemType || purchaseMetas.find(meta => meta.itemType)?.itemType
      );
      const itemCategory = resolveInventoryItemCategory({
        itemCategory: principalMeta.itemCategory || purchaseMetas.find(meta => meta.itemCategory)?.itemCategory,
        itemType
      });
      const quantityUnit = normalizeInventoryUnit(
        principalMeta.quantityUnit || purchaseMetas.find(meta => meta.quantityUnit)?.quantityUnit,
        itemCategory
      );
      const principalBoughtQty = normalizeStoredInventoryQty(principalMeta.boughtQty, itemCategory, 0);
      const restockQty = purchaseMetas.reduce((sum, meta) => sum + normalizeStoredInventoryQty(meta.boughtQty, itemCategory, 0), 0);
      const boughtQty = principalBoughtQty + restockQty;
      const principalBought = Number(group.principal?.principal_amount || 0);
      const restockTotal = purchaseActions.reduce((sum, row) => sum + Number(row.action_amount || 0), 0);
      const bought = principalBought + restockTotal;
      const principalPurchaseTax = taxBreakdownFromMeta(principalMeta, principalBought);
      const purchaseNetTotal = Number(principalPurchaseTax.net || 0) + purchaseActions.reduce((sum, row) => {
        return sum + Number(taxBreakdownFromMeta(goodsMetaFromNotes(row.notes), row.action_amount || 0).net || 0);
      }, 0);
      const storedUnitCostSum =
        (Number(principalMeta.unitActualPrice) > 0 ? Number(principalMeta.unitActualPrice) * principalBoughtQty : 0) +
        purchaseMetas.reduce((sum, meta) => {
          const qty = normalizeStoredInventoryQty(meta.boughtQty, itemCategory, 0);
          const unit = Number(meta.unitActualPrice || 0);
          return sum + (unit > 0 && qty > 0 ? unit * qty : 0);
        }, 0);
      const storedUnitCostQty =
        (Number(principalMeta.unitActualPrice) > 0 ? principalBoughtQty : 0) +
        purchaseMetas.reduce((sum, meta) => {
          const qty = normalizeStoredInventoryQty(meta.boughtQty, itemCategory, 0);
          return sum + (Number(meta.unitActualPrice || 0) > 0 && qty > 0 ? qty : 0);
        }, 0);
      const unitActualPrice = storedUnitCostQty > 0
        ? (storedUnitCostSum / storedUnitCostQty)
        : (boughtQty > 0 ? (purchaseNetTotal / boughtQty) : 0);
      let soldQty = saleActions.reduce((sum, row) => sum + normalizeStoredInventoryQty(goodsMetaFromNotes(row.notes).soldQty, itemCategory, 0), 0);
      let soldTotal = saleActions.reduce((sum, row) => sum + Number(row.action_amount || 0), 0);
      let soldNetTotal = saleActions.reduce((sum, row) => {
        return sum + Number(taxBreakdownFromMeta(goodsMetaFromNotes(row.notes), row.action_amount || 0).net || 0);
      }, 0);
      // Lazy summaries carry aggregate sold qty/total until item detail is loaded.
      if (group.principal?._inventoryLazySummary && !saleActions.length) {
        soldQty = Number(group.principal._lazySoldQty || 0);
        soldTotal = Number(group.principal._lazySoldTotal || 0);
        soldNetTotal = soldTotal;
      }
      const initialPaidTotal = saleActions.reduce((sum, row) => sum + inventoryLinePaidAmount(goodsMetaFromNotes(row.notes), row.action_amount || 0), 0);
      const settlementTotal = settlementActions.reduce((sum, row) => sum + Number(row.action_amount || 0), 0);
      const paidTotal = Math.min(soldTotal, initialPaidTotal + settlementTotal);
      const balanceTotal = Math.max(soldTotal - paidTotal, 0);
      const remainingQty = Math.max(boughtQty - soldQty, 0);
      const status = boughtQty > 0 && soldQty + 0.00000001 >= boughtQty ? "Sold" : soldQty > 0 ? "Partial" : "In Stock";
      const soldCostBasis = soldQty > 0 ? unitActualPrice * soldQty : 0;
      const profitLoss = soldQty > 0 ? (soldNetTotal - soldCostBasis) : 0;
      const purchaseDefaultPrice = purchaseMetas
        .map(meta => Number(meta.unitSoldPrice || 0))
        .filter(price => price > 0)
        .pop() || 0;
      const defaultUnitSoldPrice = Number(principalMeta.unitSoldPrice || 0) || purchaseDefaultPrice;
      const taxDefaultMeta = (principalMeta.taxRate != null || principalMeta.taxMode)
        ? principalMeta
        : (purchaseMetas.filter(meta => meta.taxRate != null || meta.taxMode).pop() || principalMeta);
      const currencyTaxDefault = getTaxSettingForCurrency(group.currency);
      const defaultTaxRate = taxDefaultMeta.taxRate != null ? normalizeTaxRate(taxDefaultMeta.taxRate) : currencyTaxDefault.rate;
      const defaultTaxMode = taxDefaultMeta.taxMode ? normalizeTaxMode(taxDefaultMeta.taxMode) : currencyTaxDefault.mode;
      const purchaseTaxTotal = Number(principalPurchaseTax.tax || 0) + purchaseActions.reduce((sum, row) => sum + taxBreakdownFromMeta(goodsMetaFromNotes(row.notes), row.action_amount || 0).tax, 0);
      const salesTaxTotal = saleActions.reduce((sum, row) => sum + taxBreakdownFromMeta(goodsMetaFromNotes(row.notes), row.action_amount || 0).tax, 0);
      return {
        ...group,
        actions: saleActions,
        purchaseActions,
        settlementActions,
        bought,
        boughtQty,
        soldQty,
        remainingQty,
        unitActualPrice,
        soldTotal,
        soldNetTotal,
        purchaseNetTotal,
        paidTotal,
        balanceTotal,
        soldCostBasis,
        soldCount: saleActions.length,
        profitLoss,
        status,
        itemCode: principalMeta.itemCode || "",
        itemDescription: principalMeta.itemDescription || cleanGoodsDisplayNote(group.principal?.notes) || "",
        itemCategory,
        itemType,
        quantityUnit,
        brand: principalMeta.brand || "",
        brandId: principalMeta.brandId || "",
        subBrand: principalMeta.subBrand || "",
        subBrandId: principalMeta.subBrandId || "",
        productLine: principalMeta.productLine || "",
        productLineId: principalMeta.productLineId || "",
        variantLabel: principalMeta.variantLabel || "",
        variantId: principalMeta.variantId || "",
        variantStorage: principalMeta.variantStorage || "",
        variantColor: principalMeta.variantColor || "",
        variantOther: principalMeta.variantOther || "",
        sellBy: principalMeta.sellBy
          ? normalizeInventorySellBy(principalMeta.sellBy, "volume")
          : "",
        bottleSizeQty: principalMeta.bottleSizeQty,
        bottleSizeUnit: principalMeta.bottleSizeUnit || "",
        categorySlug: principalMeta.categorySlug || "",
        defaultUnitSoldPrice,
        defaultTaxRate,
        defaultTaxMode,
        purchaseTaxTotal,
        salesTaxTotal,
        latestSoldDate: saleActions.length
          ? saleActions.slice().sort((a, b) => dateStamp(b.action_date) - dateStamp(a.action_date))[0]?.action_date
          : null
      };
    });

  if (!applyUiFilters) return groups;

  return groups.filter(group => {
      const searchTerm = String(state.search.goods || "").trim().toLowerCase();
      if (searchTerm) {
        const blob = `${group.person_name || ""} ${group.itemCode || ""} ${group.itemDescription || ""} ${group.itemType || ""} ${group.brand || ""} ${group.subBrand || ""} ${group.productLine || ""} ${group.variantLabel || ""} ${group.variantStorage || ""} ${group.variantColor || ""} ${group.principal?.notes || ""}`.toLowerCase();
        if (!blob.includes(searchTerm)) return false;
      }
      const brandFilter = String(state.inventoryBrandFilter || "all");
      if (brandFilter !== "all" && String(group.brand || "").trim().toLowerCase() !== brandFilter.toLowerCase()) {
        return false;
      }
      const typeFilter = String(state.inventoryItemTypeFilter || "all");
      if (typeFilter !== "all" && normalizeInventoryItemType(group.itemType).toLowerCase() !== typeFilter.toLowerCase()) {
        return false;
      }
      const f = state.statusFilter.goods;
      if (f === "Open") return group.status === "In Stock" || group.status === "Partial";
      if (f === "LowStock") return group.remainingQty > 0.00000001 && group.boughtQty > 0 && (group.remainingQty / group.boughtQty) <= 0.15;
      if (f === "Closed") return group.status === "Sold";
      return true;
    });
}

function renderGoodsSelectors(){
  const groups = getGoodsGroups().filter(g => g.remainingQty > 0);
  els.goodsItemSelect.innerHTML = groups.length
    ? `<option value="">Choose purchased item</option>${groups.map(g => `<option value="${escapeHtml(g.group_id)}">${escapeHtml(g.person_name)} - ${escapeHtml(inventoryQtyLabel(g.remainingQty, g.itemCategory, g))} left</option>`).join("")}`
    : `<option value="">No in-stock items</option>`;
}

async function downloadGoodsItemPDF(groupId){
  const group = getGoodsGroups().find(g => g.group_id === groupId);
  if (!group){
    alert("Item not found.");
    return;
  }
  if (!window.jspdf){
    alert("PDF library loading. Please try again.");
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // Load custom fonts for currency symbols
  await loadCustomFontsForPdf(doc);

  const logoData = await getPdfLogo();
  const title = "Inventory Item Invoice";
  const subtitle = `Item: ${group.itemCode || shortId(group.group_id) || "N/A"}`;
  drawPdfHeader(doc, logoData, title, subtitle);
  drawPdfOwnerBlock(doc, 48);

  const fmt = amt => formatPdfAmount(amt, group.currency);
  doc.setTextColor(23, 33, 43);
  doc.setFontSize(10);
  doc.text(`Item: ${group.person_name || "Unnamed item"}`, 132, 48);
  doc.text(`Type: ${normalizeInventoryItemType(group.itemType)} · ${inventoryCategoryLabel(group.itemCategory)}`, 132, 54);
  doc.text(`In Stock: ${inventoryQtyLabel(group.remainingQty, group.itemCategory)}`, 132, 60);
  doc.text(`Purchase Date: ${displayDate(group.principal?.loan_date || "—")}`, 132, 66);
  doc.text(`Status: ${group.status} · Net ${group.profitLoss >= 0 ? "Profit" : "Loss"}: ${fmt(Math.abs(group.profitLoss))}`, 132, 72);

  const summaryTop = pdfContentStartY(doc, 78, 6);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, summaryTop, 182, 28, 2, 2, "F");
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, summaryTop, 182, 28, 2, 2, "S");
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.text(`Purchase Total: ${fmt(group.bought || 0)}`, 18, summaryTop + 8);
  doc.text(`Sales Total: ${fmt(group.soldTotal || 0)}`, 18, summaryTop + 15);
  doc.text(`Paid Total: ${fmt(group.paidTotal || 0)}`, 105, summaryTop + 8);
  doc.text(`Balance Amount: ${fmt(group.balanceTotal || 0)}`, 105, summaryTop + 15);
  doc.text(`Purchase Qty: ${inventoryQtyLabel(group.boughtQty, group.itemCategory)}`, 18, summaryTop + 22);
  doc.text(`Sold Qty: ${inventoryQtyLabel(group.soldQty, group.itemCategory)}`, 105, summaryTop + 22);
  doc.text(`VAT: ${fmt((group.purchaseTaxTotal || 0) + (group.salesTaxTotal || 0))}`, 150, summaryTop + 22);

  const principalTax = taxBreakdownFromMeta(goodsMetaFromNotes(group.principal?.notes), group.principal?.principal_amount || 0);
  const rows = [
    {
      type: "Purchase",
      date: group.principal?.loan_date,
      qty: inventoryQtyLabel(group.boughtQty - group.purchaseActions.reduce((sum, row) => sum + normalizeStoredInventoryQty(goodsMetaFromNotes(row.notes).boughtQty, group.itemCategory, 0), 0), group.itemCategory),
      net: fmt(principalTax.net || 0),
      vat: principalTax.tax ? fmt(principalTax.tax) : "-",
      amount: fmt(principalTax.total || group.principal?.principal_amount || 0),
      paid: "—",
      balance: "—",
      status: "—",
      note: group.itemDescription || cleanGoodsDisplayNote(group.principal?.notes) || "Opening stock"
    },
    ...group.purchaseActions.map(row => {
      const meta = goodsMetaFromNotes(row.notes);
      const tax = taxBreakdownFromMeta(meta, row.action_amount || 0);
      return {
        type: "Purchase",
        date: row.action_date,
        qty: inventoryQtyLabel(meta.boughtQty || 0, group.itemCategory),
        net: fmt(tax.net || 0),
        vat: tax.tax ? fmt(tax.tax) : "-",
        amount: fmt(tax.total || row.action_amount || 0),
        paid: "—",
        balance: "—",
        status: "—",
        note: cleanGoodsDisplayNote(row.notes) || "Additional stock"
      };
    }),
    ...group.actions.map(row => {
      const meta = goodsMetaFromNotes(row.notes);
      const receipt = meta.receiptNumber || shortId(row.id);
      const receiptData = getInventoryReceiptData(receipt, row);
      const invoiceNumber = receiptData.invoiceNumber || inventoryInvoiceNumberFromMeta(meta, row);
      const saleSummary = receiptData.saleRows.find(saleRow => saleRow.entry.id === row.id);
      return {
        type: "Sold",
        date: row.action_date,
        qty: inventoryQtyLabel(meta.soldQty || 0, group.itemCategory),
        net: fmt(saleSummary?.netAmount || 0),
        vat: saleSummary?.taxAmount ? fmt(saleSummary.taxAmount) : "-",
        amount: fmt(row.action_amount || 0),
        paid: fmt(saleSummary?.paid || inventoryLinePaidAmount(meta, row.action_amount || 0)),
        balance: fmt(saleSummary?.balance || 0),
        status: saleSummary?.paymentStatus || inventoryPaymentStatus(meta, row.action_amount || 0),
        note: `${meta.customerName || "Walk-in customer"} | ${invoiceNumber}`
      };
    }),
    ...group.settlementActions.map(row => {
      const meta = goodsMetaFromNotes(row.notes);
      const balance = inventoryLineBalanceAmount(meta, 0);
      return {
        type: "Settlement",
        date: row.action_date,
        qty: "—",
        amount: fmt(row.action_amount || 0),
        paid: fmt(row.action_amount || 0),
        balance: fmt(balance),
        status: inventoryPaymentStatus(meta, balance),
        note: `${meta.customerName || "Walk-in customer"} | ${inventoryInvoiceNumberFromMeta(meta, row)} | ${cleanGoodsDisplayNote(row.notes) || "Balance settlement"}`
      };
    })
  ].sort((a, b) => dateStamp(a.date) - dateStamp(b.date));
  doc.autoTable({
    startY: summaryTop + 36,
    head: [["Type", "Date", "Notes/Description", "Qty", "Status", "Net", "VAT", "Paid", "Balance", "Total"]],
    body: rows.map(row => [row.type, displayDate(row.date || "-"), row.note, row.qty, row.status, row.net || "-", row.vat || "-", row.paid, row.balance, row.amount]),
    theme: "grid",
    tableWidth: 170,
    headStyles: { fillColor: [36, 87, 214], textColor: 255, fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 7.2, cellPadding: 1.8, overflow: "linebreak", cellWidth: "wrap" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 12, halign: "center" },
      1: { cellWidth: 14 },
      2: { cellWidth: 46 },
      3: { cellWidth: 12, halign: "right" },
      4: { cellWidth: 14 },
      5: { cellWidth: 16, halign: "right" },
      6: { cellWidth: 14, halign: "right" },
      7: { cellWidth: 14, halign: "right" },
      8: { cellWidth: 14, halign: "right" },
      9: { cellWidth: 18, halign: "right" }
    },
    margin: { left: 16, right: 16, top: 50, bottom: 40 },
    didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
  });
  doc.save(`Goods_${String(group.person_name || "item").replace(/\s+/g, "_")}.pdf`);
}

async function downloadGoodsSoldReceiptPDF(entryId){
  return downloadInventoryReceiptPDF(entryId);
}

function renderGoodsList(){
  const groups = getGoodsGroups();
  if (!groups.length){
    els.goodsList.innerHTML = `<div class="empty">No goods entries found.</div>`;
    return;
  }
  const boughtCount = inventoryQtySummary(groups, "boughtQty");
  const soldCount = inventoryQtySummary(groups, "soldQty");
  const stockCount = inventoryQtySummary(groups, "remainingQty");
  els.goodsList.innerHTML = groups.map(group => {
    const statusClass = group.status === "Sold" ? "green" : "orange";
    const pnlClass = group.profitLoss >= 0 ? "green" : "red";
    const pnlLabel = group.profitLoss >= 0 ? "Profit" : "Loss";
    const soldRows = group.actions
      .slice()
      .sort((a, b) => dateStamp(b.action_date) - dateStamp(a.action_date));
    return `
      <details class="loan">
        <summary>
          <div class="loan-top">
            <div class="lt-main">
              <div class="loan-name"><i class="fa-solid fa-box"></i> ${escapeHtml(group.person_name || "Unnamed item")}</div>
              <div class="loan-sub">
                <span>Purchase ${escapeHtml(displayDate(group.principal?.loan_date || "—"))}</span>
                <span>${currencySymbolHtml(group.currency || "")}</span>
                <span class="badge blue inventory-category-badge">${escapeHtml(inventoryCategoryLabel(group.itemCategory))}</span>
                <span class="badge inventory-type-badge">${escapeHtml(normalizeInventoryItemType(group.itemType))}</span>
                <span>Qty ${escapeHtml(inventoryQtyLabel(group.soldQty, group.itemCategory))}/${escapeHtml(inventoryQtyLabel(group.boughtQty, group.itemCategory))}</span>
                <span class="badge ${statusClass}">${escapeHtml(group.status)}</span>
              </div>
            </div>
            <div class="cell lt-principal">
              <div class="inventory-metric"><small>Purchase total</small><strong>${money(group.bought, group.currency)}</strong></div>
              <div class="inventory-metric inventory-metric-sub"><small>Unit cost</small><strong>${money(group.unitActualPrice || 0, group.currency)}</strong></div>
            </div>
            <div class="cell lt-movement">
              <div class="inventory-metric"><small>Sold total</small><strong>${money(group.soldTotal, group.currency)}</strong></div>
              <div class="inventory-metric inventory-metric-sub"><small>Paid</small><strong>${money(group.paidTotal || 0, group.currency)}</strong></div>
            </div>
            <div class="cell lt-remaining">
              <div class="inventory-metric"><small>${pnlLabel}</small><strong><span class="badge ${pnlClass}">${money(Math.abs(group.profitLoss), group.currency)}</span></strong></div>
              <div class="inventory-metric inventory-metric-sub"><small>Due</small><strong>${money(group.balanceTotal || 0, group.currency)}</strong></div>
            </div>
            <div class="lt-action">
              <div class="menu-wrap">
                <button class="icon-btn ghost menu-trigger person-menu-btn" type="button" data-goods-menu="${escapeHtml(group.group_id)}" aria-label="Item menu">☰</button>
                <div class="menu-dropdown" data-goods-menu-panel="${escapeHtml(group.group_id)}">
                  <button class="menu-item goodsActionBtn" type="button" data-action="pdf" data-group-id="${escapeHtml(group.group_id)}"><i class="fa-solid fa-download"></i> Download PDF</button>
                  ${teamCanShowEdit("invoices") ? `<button class="menu-item goodsActionBtn" type="button" data-action="edit-bought" data-entry-id="${escapeHtml(group.principal?.id || "")}">Edit Purchase</button>` : ""}
                  ${teamCanShowDelete("invoices") ? `<button class="menu-item danger goodsActionBtn" type="button" data-action="delete-item" data-entry-id="${escapeHtml(group.principal?.id || "")}">Delete Item</button>` : ""}
                </div>
              </div>
            </div>
          </div>
        </summary>
        <div class="detail">
          <div class="table-wrap">
            <table>
              <thead><tr><th>Type</th><th>Date</th><th>Amount</th><th>VAT</th><th>Notes</th><th>Action</th></tr></thead>
              <tbody>
                ${soldRows.length ? soldRows.map(row => `
                  <tr>
                    <td><span class="badge green">Sold</span></td>
                    <td>${escapeHtml(displayDate(row.action_date || "—"))}</td>
                    <td>${money(row.action_amount || 0, group.currency)}</td>
                    <td>${taxBreakdownFromMeta(goodsMetaFromNotes(row.notes), row.action_amount || 0).tax ? money(taxBreakdownFromMeta(goodsMetaFromNotes(row.notes), row.action_amount || 0).tax, group.currency) : "-"}</td>
                    <td>${escapeHtml(row.notes || "—")}</td>
                    <td>
                      <div style="display:flex;gap:4px;">
                        <button class="tiny soldReceiptBtn" data-id="${escapeHtml(row.id)}">PDF</button>
                        <button class="tiny soft inventoryThermalPrintBtn" type="button" data-entry-id="${escapeHtml(row.id)}" title="Thermal merchant receipt"><i class="fa-solid fa-receipt"></i></button>
                        ${teamCanShowEdit("invoices") ? `<button class="tiny ghost editRowBtn" data-id="${escapeHtml(row.id)}">✎</button>` : ""}
                        ${teamCanShowDelete("invoices") ? `<button class="tiny danger delRowBtn" data-id="${escapeHtml(row.id)}">✕</button>` : ""}
                      </div>
                    </td>
                  </tr>
                `).join("") : `<tr><td colspan="6">No sold entries yet.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    `;
  }).join("") + `
    <div class="summary" style="margin-top:8px">
      <span>Goods Summary</span>
      <strong>Purchase Qty: ${escapeHtml(boughtCount)} | Sold Qty: ${escapeHtml(soldCount)} | In Stock Qty: ${escapeHtml(stockCount)}</strong>
    </div>
  `;

  els.goodsList.querySelectorAll(".goodsActionBtn").forEach(btn => btn.addEventListener("click", async e => {
    e.preventDefault();
    const action = btn.dataset.action;
    if (action === "pdf") await downloadGoodsItemPDF(btn.dataset.groupId);
    if (action === "edit-bought") openEditModal(btn.dataset.entryId);
    if (action === "delete-item") await deleteEntry(btn.dataset.entryId);
  }));
  els.goodsList.querySelectorAll(".soldReceiptBtn").forEach(btn => btn.addEventListener("click", () => downloadInventoryReceiptPDF(btn.dataset.id)));
  els.goodsList.querySelectorAll(".editRowBtn").forEach(btn => btn.addEventListener("click", () => openEditModal(btn.dataset.id)));
  els.goodsList.querySelectorAll(".delRowBtn").forEach(btn => btn.addEventListener("click", () => deleteEntry(btn.dataset.id)));
  els.goodsList.querySelectorAll("[data-legacy-fix-id]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      fixLegacyMetaEntry(btn.dataset.legacyFixId, btn.dataset.legacyFixGroup);
    });
  });
  els.goodsList.querySelectorAll("[data-goods-menu]").forEach(btn => btn.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    const key = btn.dataset.goodsMenu;
    const panel = els.goodsList.querySelector(`[data-goods-menu-panel="${key}"]`);
    if (!panel) return;
    document.querySelectorAll(".menu-dropdown.open").forEach(openPanel => {
      if (openPanel !== panel) openPanel.classList.remove("open");
    });
    const nowOpen = panel.classList.toggle("open");
    btn.setAttribute("aria-expanded", nowOpen ? "true" : "false");

    // Position the dropdown using fixed positioning
    if (nowOpen) {
      const rect = btn.getBoundingClientRect();
      panel.style.top = `${rect.bottom + 6}px`;
      panel.style.left = `${rect.right - panel.offsetWidth}px`;
      // Ensure dropdown doesn't go off-screen to the right
      if (rect.right - panel.offsetWidth < 10) {
        panel.style.left = `${Math.max(10, rect.left)}px`;
      }
    }
  }));
}

async function downloadInventoryReceiptPDF(entryId){
  const saleEntry = state.entries.find(e => e.id === entryId && e.entry_kind !== "principal" && hasGoodsTag(e.notes));
  if (!saleEntry){
    alert("Sold entry not found.");
    return;
  }
  if (!window.jspdf){
    alert("PDF library loading. Please try again.");
    return;
  }
  try { await loadInventorySalesForCustomers({ force: false }); } catch (_) {}
  const meta = goodsMetaFromNotes(saleEntry.notes);
  const receiptNumber = meta.receiptNumber || meta.invoiceNumber || meta.saleSetId || shortId(saleEntry.id) || "N/A";
  const receiptData = getInventoryReceiptData(receiptNumber, saleEntry);
  const invoiceNumber = receiptData.invoiceNumber || inventoryInvoiceNumberFromMeta(meta, saleEntry);
  const receiptRows = receiptData.saleRows;
  if (!receiptRows.length){
    alert("No sale lines found for this invoice.");
    return;
  }
  const totalsByCurrency = receiptData.totalsByCurrency;
  const currency = receiptData.currency || saleEntry.currency || receiptRows[0]?.currency || "AED";
  const customerName = receiptData.customerName || meta.customerName || "Walk-in customer";
  const customerPhone = receiptData.customerPhone || meta.customerPhone || "";
  const customerAddress = receiptData.customerAddress || meta.customerAddress || "";
  const customerCompany = receiptData.customerCompany || meta.customerCompany || "";
  const customerTrn = receiptData.customerTrn || meta.customerTrn || "";
  const customerEmail = receiptData.customerEmail || meta.customerEmail || "";
  const totalQtyText = inventoryQtySummary(receiptRows, "qty");
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  await loadCustomFontsForPdf(doc);
  const logoData = await getPdfLogo();
  const title = "Sales Invoice";
  const subtitle = `Invoice ${invoiceNumber}`;
  const paymentStatus = receiptData.balanceTotal > 0.00000001 ? "Partial" : "Paid";
  const invoiceDate = displayDate(receiptData.paymentRows[0]?.date || saleEntry.action_date || "—");
  drawPdfHeader(doc, logoData, title, subtitle);
  const partiesBottom = drawInventoryPdfPartiesAndMeta(doc, {
    customerName,
    customerCompany,
    customerTrn,
    customerPhone,
    customerEmail,
    customerAddress,
    meta: [
      { label: "Invoice", value: invoiceNumber },
      { label: "Date", value: invoiceDate },
      { label: "Items", value: String(receiptRows.length) },
      { label: "Status", value: paymentStatus }
    ]
  });

  doc.autoTable({
    startY: partiesBottom + 5,
    head: [["#", "Code", "Item", "Qty", "Unit", "Net", "VAT", "Total"]],
    body: receiptRows.map(row => [
      String(row.sr),
      row.itemCode || "—",
      row.itemName,
      row.qtyDisplay || "—",
      formatPdfAmount(inventoryLineRateForDisplay(row.unitPrice, row.qty, row.itemCategory) || 0, row.currency), // /ml when qty < 1 L
      formatPdfAmount(row.netAmount || 0, row.currency),
      row.taxAmount ? `${formatPdfAmount(row.taxAmount, row.currency)} (${trimInventoryNumber(row.taxRate, 2)}%)` : "—",
      formatPdfAmount(row.total, row.currency)
    ]),
    theme: "grid",
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold", fontSize: 7.6 },
    styles: { font: "helvetica", fontSize: 7.8, cellPadding: 1.8, overflow: "linebreak" },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: 22 },
      2: { cellWidth: 46 },
      3: { cellWidth: 20, halign: "right" },
      4: { cellWidth: 22, halign: "right" },
      5: { cellWidth: 22, halign: "right" },
      6: { cellWidth: 22, halign: "right" },
      7: { cellWidth: 20, halign: "right" }
    },
    margin: { top: 42, bottom: 32 },
    didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
  });

  let afterTableY = doc.lastAutoTable.finalY + 5;
  const settlementRows = (receiptData.paymentRows || []).filter(row =>
    String(row.type || "").toLowerCase().includes("settlement") ||
    String(row.type || "").toLowerCase().includes("balance")
  );
  const showPaymentHistory = settlementRows.length > 0 || (receiptData.paymentRows || []).length > 1;
  if (showPaymentHistory){
    doc.autoTable({
      startY: afterTableY,
      head: [["Payment", "Date", "Paid", "Balance"]],
      body: receiptData.paymentRows.map(row => [
        row.type,
        displayDate(row.date || "—"),
        formatPdfAmount(row.amount || 0, row.currency || currency),
        formatPdfAmount(row.balanceAfter || 0, row.currency || currency)
      ]),
      theme: "grid",
      headStyles: { fillColor: [51, 65, 85], textColor: 255, fontStyle: "bold", fontSize: 7.4 },
      styles: { font: "helvetica", fontSize: 7.6, cellPadding: 1.6 },
      columnStyles: {
        0: { cellWidth: 52 },
        1: { cellWidth: 32 },
        2: { cellWidth: 48, halign: "right" },
        3: { cellWidth: 50, halign: "right" }
      },
      margin: { top: 42, bottom: 32 },
      didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
    });
    afterTableY = doc.lastAutoTable.finalY + 5;
  }

  const showCurrencyInSummary = totalsByCurrency.size > 1;
  const summaryRows = Array.from(totalsByCurrency.entries()).flatMap(([rowCurrency, amounts]) => [
    { label: showCurrencyInSummary ? `${pdfCurrencyLabel(rowCurrency)} Net` : "Net", value: formatPdfAmount(amounts.net || 0, rowCurrency) },
    { label: showCurrencyInSummary ? `${pdfCurrencyLabel(rowCurrency)} VAT` : "VAT", value: formatPdfAmount(amounts.tax || 0, rowCurrency) },
    { label: showCurrencyInSummary ? `${pdfCurrencyLabel(rowCurrency)} Total` : "Total", value: formatPdfAmount(amounts.total, rowCurrency), strong: true },
    { label: showCurrencyInSummary ? `${pdfCurrencyLabel(rowCurrency)} Paid` : "Paid", value: formatPdfAmount(amounts.paid, rowCurrency) },
    { label: showCurrencyInSummary ? `${pdfCurrencyLabel(rowCurrency)} Balance` : "Balance", value: formatPdfAmount(amounts.balance, rowCurrency), strong: true }
  ]);
  drawInventoryPdfTotals(doc, afterTableY + 1, summaryRows);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.4);
  doc.setTextColor(100, 116, 139);
  doc.text(`Qty: ${totalQtyText}`, 14, afterTableY + 5);
  const noteText = cleanGoodsDisplayNote(saleEntry.notes) || "";
  if (noteText){
    const noteLines = pdfClampLines(doc, `Note: ${noteText}`, 108, 2);
    doc.text(noteLines, 14, afterTableY + 9.2);
  }
  doc.save(`Invoice_${String(invoiceNumber).replace(/\s+/g, "_")}.pdf`);
}

const SALE_DRAFT_STORAGE_KEY = "triplem-inventory-sale-draft-v1";
const SALE_DRAFTS_LIBRARY_KEY = "triplem-inventory-sale-drafts-v2";

function createEmptySaleDraft(){
  return {
    id: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `draft-${Date.now()}`,
    draftNumber: "",
    status: "draft",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lines: [],
    customerMode: "walkin",
    customerName: "",
    customerPhone: "",
    customerAddress: "",
    customerCompany: "",
    customerTrn: "",
    customerEmail: "",
    notes: "",
    paidAmount: "",
    walletId: "",
    soldDate: todayISO()
  };
}

function nextProformaNumber(extraNumbers = []){
  const used = getExistingInventoryDocumentNumbers(extraNumbers);
  (state.saleDrafts || []).forEach(d => {
    const n = String(d?.draftNumber || "").trim();
    if (n) used.add(n.toUpperCase());
  });
  const active = String(state.saleDraft?.draftNumber || "").trim();
  if (active) used.add(active.toUpperCase());
  return nextPrefixedHexCode("PI", used);
}

function cloneSaleDraft(draft){
  return JSON.parse(JSON.stringify(draft || createEmptySaleDraft()));
}

function loadSaleDraftLibrary(){
  try {
    const raw = localStorage.getItem(SALE_DRAFTS_LIBRARY_KEY);
    if (!raw) {
      state.saleDrafts = Array.isArray(state.saleDrafts) ? state.saleDrafts : [];
      return state.saleDrafts;
    }
    const parsed = JSON.parse(raw);
    state.saleDrafts = Array.isArray(parsed) ? parsed.filter(d => d && typeof d === "object") : [];
  } catch (_) {
    state.saleDrafts = [];
  }
  return state.saleDrafts;
}

function persistSaleDraftLibrary(){
  try {
    localStorage.setItem(SALE_DRAFTS_LIBRARY_KEY, JSON.stringify(state.saleDrafts || []));
  } catch (_) {}
}

function loadSaleDraftFromStorage(){
  try {
    const raw = localStorage.getItem(SALE_DRAFT_STORAGE_KEY);
    if (!raw) {
      if (!state.saleDraft?.id) state.saleDraft = createEmptySaleDraft();
      return;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;
    state.saleDraft = {
      ...createEmptySaleDraft(),
      ...parsed,
      lines: Array.isArray(parsed.lines) ? parsed.lines : [],
      customerMode: String(parsed.customerMode || (parsed.customerName ? "existing" : "walkin")),
      customerName: String(parsed.customerName || ""),
      customerPhone: String(parsed.customerPhone || ""),
      customerAddress: String(parsed.customerAddress || ""),
      customerCompany: String(parsed.customerCompany || ""),
      customerTrn: String(parsed.customerTrn || ""),
      customerEmail: String(parsed.customerEmail || ""),
      notes: String(parsed.notes || ""),
      paidAmount: String(parsed.paidAmount || ""),
      walletId: String(parsed.walletId || ""),
      soldDate: String(parsed.soldDate || todayISO()),
      id: String(parsed.id || ""),
      draftNumber: String(parsed.draftNumber || ""),
      status: "draft",
      createdAt: String(parsed.createdAt || ""),
      updatedAt: String(parsed.updatedAt || "")
    };
  } catch (_) {}
  loadSaleDraftLibrary();
}

function persistSaleDraft(){
  try {
    const draft = ensureSaleDraftShape();
    draft.updatedAt = new Date().toISOString();
    localStorage.setItem(SALE_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch (_) {}
}

function ensureSaleDraftShape(){
  if (!state.saleDraft || typeof state.saleDraft !== "object") {
    state.saleDraft = createEmptySaleDraft();
  }
  if (!Array.isArray(state.saleDraft.lines)) state.saleDraft.lines = [];
  if (!state.saleDraft.customerMode) {
    state.saleDraft.customerMode = state.saleDraft.customerName ? "existing" : "walkin";
  }
  if (!state.saleDraft.id) state.saleDraft.id = createEmptySaleDraft().id;
  if (!state.saleDraft.createdAt) state.saleDraft.createdAt = new Date().toISOString();
  if (!state.saleDraft.status) state.saleDraft.status = "draft";
  return state.saleDraft;
}

function getSaleDraftQtyForGroup(groupId){
  const gid = String(groupId || "");
  return ensureSaleDraftShape().lines
    .filter(line => String(line.groupId) === gid)
    .reduce((sum, line) => sum + Number(line.qty || 0), 0);
}

function saleDraftLineCount(){
  return ensureSaleDraftShape().lines.length;
}

function saleDraftQtyCount(){
  return ensureSaleDraftShape().lines.reduce((sum, line) => sum + Number(line.qty || 0), 0);
}

function saleDraftMoneySummary(draft = null){
  const lines = Array.isArray(draft?.lines) ? draft.lines : ensureSaleDraftShape().lines;
  const totals = new Map();
  for (const line of lines) {
    const currency = String(line.currency || "AED");
    const amount = Number(line.grossAmount != null ? line.grossAmount : (Number(line.unitPrice || 0) * Number(line.qty || 0)));
    totals.set(currency, (totals.get(currency) || 0) + amount);
  }
  if (!totals.size) return "0";
  return [...totals.entries()].map(([c, a]) => moneyText(a, c)).join(" · ");
}

/** HTML money summary for cart UI (never put through escapeHtml / textContent). */
function saleDraftMoneySummaryHtml(draft = null){
  const lines = Array.isArray(draft?.lines) ? draft.lines : ensureSaleDraftShape().lines;
  const totals = new Map();
  for (const line of lines) {
    const currency = String(line.currency || "AED");
    const amount = Number(line.grossAmount != null ? line.grossAmount : (Number(line.unitPrice || 0) * Number(line.qty || 0)));
    totals.set(currency, (totals.get(currency) || 0) + amount);
  }
  if (!totals.size) return money(0, state.lastCurrency || "AED");
  return [...totals.entries()].map(([c, a]) => money(a, c)).join(" · ");
}

function clearSaleDraft({ silent = false, keepNumber = false } = {}){
  const prevNumber = keepNumber ? String(state.saleDraft?.draftNumber || "") : "";
  state.saleDraft = createEmptySaleDraft();
  if (keepNumber && prevNumber) state.saleDraft.draftNumber = prevNumber;
  persistSaleDraft();
  updateSaleDraftDock();
  if (!silent) {
    const modal = document.getElementById("inventorySaleDraftModal");
    if (modal && !modal.classList.contains("hide")) renderSaleDraftModalBody();
  }
}

function getSaleDraftLineStockInfo(line){
  const group = getGoodsGroups({ applyUiFilters: false }).find(g => String(g.group_id) === String(line?.groupId || ""));
  const category = normalizeInventoryCategory(line?.itemCategory || group?.itemCategory);
  if (!group) {
    return { status: "missing", available: 0, label: "Item missing", category };
  }
  const available = Number(group.remainingQty || 0);
  const need = Number(line?.qty || 0);
  if (available <= 0.00000001) {
    return { status: "out", available: 0, label: "Out of stock", category, group };
  }
  if (need > available + 0.00000001) {
    return {
      status: "short",
      available,
      label: `Only ${inventoryQtyLabel(available, category, group)} left`,
      category,
      group
    };
  }
  return {
    status: "ok",
    available,
    label: inventoryQtyLabel(available, category, group),
    category,
    group
  };
}

function saleDraftHasStockIssues(draft = null){
  const lines = Array.isArray(draft?.lines) ? draft.lines : ensureSaleDraftShape().lines;
  return lines.some(line => {
    const info = getSaleDraftLineStockInfo(line);
    return info.status !== "ok";
  });
}

function upsertSaleDraftInLibrary(draft){
  loadSaleDraftLibrary();
  const copy = cloneSaleDraft(draft);
  copy.status = "draft";
  copy.updatedAt = new Date().toISOString();
  if (!copy.createdAt) copy.createdAt = copy.updatedAt;
  if (!copy.draftNumber) copy.draftNumber = nextProformaNumber();
  const idx = state.saleDrafts.findIndex(d => String(d.id) === String(copy.id));
  if (idx >= 0) state.saleDrafts[idx] = copy;
  else state.saleDrafts.unshift(copy);
  state.saleDrafts = state.saleDrafts
    .filter(d => d && d.status !== "finalized")
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  persistSaleDraftLibrary();
  return copy;
}

function removeSaleDraftFromLibrary(draftId){
  loadSaleDraftLibrary();
  state.saleDrafts = state.saleDrafts.filter(d => String(d.id) !== String(draftId || ""));
  persistSaleDraftLibrary();
}

function saveCurrentSaleDraft({ silent = false } = {}){
  syncSaleDraftFormFromModal();
  const draft = ensureSaleDraftShape();
  if (!draft.lines.length) throw new Error("Add at least one item before saving the draft.");
  if (!draft.draftNumber) draft.draftNumber = nextProformaNumber();
  draft.updatedAt = new Date().toISOString();
  if (!draft.createdAt) draft.createdAt = draft.updatedAt;
  const saved = upsertSaleDraftInLibrary(draft);
  state.saleDraft = cloneSaleDraft(saved);
  persistSaleDraft();
  updateSaleDraftDock();
  if (!silent) {
    renderSaleDraftModalBody();
    if (state.inventoryView === "drafts") renderInventoryDraftsSection();
  }
  return saved;
}

async function startNewSaleDraft({ askSave = false } = {}){
  const draft = ensureSaleDraftShape();
  if (askSave && draft.lines.length) {
    const choice = confirm("Save the current draft before starting a new one?");
    if (choice) {
      try { saveCurrentSaleDraft({ silent: true }); }
      catch (err) { alert(err?.message || "Could not save draft."); return false; }
    }
  }
  clearSaleDraft({ silent: true });
  ensureSaleDraftShape().draftNumber = nextProformaNumber();
  persistSaleDraft();
  updateSaleDraftDock();
  return true;
}

function openSavedSaleDraft(draftId){
  loadSaleDraftLibrary();
  loadSaleDraftFromStorage();
  const id = String(draftId || "").trim();
  let found = state.saleDrafts.find(d => String(d.id) === id);
  // Active cart shown in the list before Save — open that directly.
  if (!found && String(state.saleDraft?.id || "") === id) {
    found = state.saleDraft;
  }
  // Fallback: match by proforma number if id drifted.
  if (!found) {
    found = state.saleDrafts.find(d => String(d.draftNumber || "") === id)
      || (String(state.saleDraft?.draftNumber || "") === id ? state.saleDraft : null);
  }
  if (!found) {
    alert("Saved cart not found. Add items again, or tap Save in the cart first.");
    return false;
  }
  state.saleDraft = cloneSaleDraft(found);
  ensureSaleDraftShape();
  // Keep library + active cart in sync so Open always works next time.
  try { upsertSaleDraftInLibrary(state.saleDraft); } catch (_) {}
  persistSaleDraft();
  updateSaleDraftDock();
  openSaleDraftModal();
  return true;
}

function deleteSavedSaleDraft(draftId){
  loadSaleDraftLibrary();
  loadSaleDraftFromStorage();
  const id = String(draftId || "").trim();
  const target = (state.saleDrafts || []).find(d => String(d.id) === id)
    || (String(state.saleDraft?.id || "") === id ? state.saleDraft : null);
  const draftNumber = String(target?.draftNumber || "").trim();
  // Remove by id and by proforma number so no ghost cart remains in library/storage.
  state.saleDrafts = (state.saleDrafts || []).filter(d => {
    if (String(d.id) === id) return false;
    if (draftNumber && String(d.draftNumber || "").trim() === draftNumber) return false;
    return true;
  });
  persistSaleDraftLibrary();
  const active = ensureSaleDraftShape();
  if (
    String(active.id || "") === id
    || (draftNumber && String(active.draftNumber || "").trim() === draftNumber)
  ) {
    clearSaleDraft({ silent: true });
  }
  if (state.inventoryView === "drafts") renderInventoryDraftsSection();
  updateSaleDraftDock();
}

function renderInventoryDraftsSection(){
  const root = els.inventoryDraftsList;
  if (!root) return;
  loadSaleDraftLibrary();
  loadSaleDraftFromStorage();
  const drafts = [...(state.saleDrafts || [])];
  const active = ensureSaleDraftShape();
  if (active.lines.length && !drafts.some(d => String(d.id) === String(active.id))) {
    drafts.unshift(cloneSaleDraft(active));
  }
  if (!drafts.length) {
    root.innerHTML = `<div class="empty">No draft invoices yet. Add items from stock, then tap <strong>Save draft</strong>.</div>`;
    return;
  }
  root.innerHTML = `
    <div class="inventory-drafts-list">
      ${drafts.map(draft => {
        const issues = saleDraftHasStockIssues(draft);
        const customer = draft.customerMode === "walkin" || !draft.customerName
          ? "Walk-in"
          : draft.customerName;
        const when = draft.updatedAt || draft.createdAt || "";
        return `
          <article class="inventory-draft-card ${issues ? "has-stock-issue" : ""}" data-draft-id="${escapeHtml(draft.id)}">
            <div class="inventory-draft-card-main">
              <div>
                <strong>${escapeHtml(draft.draftNumber || "Draft")}</strong>
                <div class="inventory-draft-card-meta">
                  <span>${escapeHtml(customer)}</span>
                  <span>${escapeHtml(String(draft.lines?.length || 0))} line${(draft.lines?.length || 0) === 1 ? "" : "s"}</span>
                  <span>${escapeHtml(saleDraftMoneySummary(draft))}</span>
                  ${when ? `<span>${escapeHtml(displayDate(when.slice(0, 10)))}</span>` : ""}
                </div>
              </div>
              <div class="inventory-draft-card-flags">
                <span class="badge blue">Proforma</span>
                ${issues ? `<span class="badge orange">Stock issue</span>` : `<span class="badge green">Ready</span>`}
              </div>
            </div>
            <div class="inventory-draft-card-actions">
              <button type="button" class="tiny ghost inventoryDraftOpenBtn" data-draft-id="${escapeHtml(draft.id)}">Open</button>
              <button type="button" class="tiny ghost inventoryDraftPdfBtn" data-draft-id="${escapeHtml(draft.id)}">PDF</button>
              <button type="button" class="tiny danger inventoryDraftDeleteBtn" data-draft-id="${escapeHtml(draft.id)}">Delete</button>
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
  root.querySelectorAll(".inventoryDraftOpenBtn").forEach(btn => {
    btn.addEventListener("click", () => openSavedSaleDraft(btn.dataset.draftId));
  });
  root.querySelectorAll(".inventoryDraftPdfBtn").forEach(btn => {
    btn.addEventListener("click", () => {
      const draft = state.saleDrafts.find(d => String(d.id) === String(btn.dataset.draftId))
        || (String(state.saleDraft?.id) === String(btn.dataset.draftId) ? state.saleDraft : null);
      if (draft) downloadSaleDraftPDF(draft);
    });
  });
  root.querySelectorAll(".inventoryDraftDeleteBtn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (!confirm("Delete this draft invoice?")) return;
      deleteSavedSaleDraft(btn.dataset.draftId);
    });
  });
}

function ensureInventoryQtyPromptModal(){
  let modal = document.getElementById("inventoryQtyPromptModal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "inventoryQtyPromptModal";
  modal.className = "modal hide";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="modal-backdrop" data-qty-cancel="1"></div>
    <div class="modal-dialog compact-entry-dialog inventory-qty-prompt-dialog">
      <div class="modal-head">
        <div>
          <h3 id="inventoryQtyPromptTitle">Add to cart</h3>
          <p class="help" id="inventoryQtyPromptDesc">Choose quantity</p>
        </div>
        <button class="icon-btn ghost" type="button" data-qty-cancel="1" aria-label="Close">×</button>
      </div>
      <div class="modal-body" id="inventoryQtyPromptBody">
        <div class="inventory-qty-prompt-item" id="inventoryQtyPromptItem"></div>
        <div class="inventory-qty-prompt-presets hide" id="inventoryQtyPromptPresets" role="group" aria-label="Quick quantity"></div>
        <div class="inventory-qty-prompt-fields">
          <label class="inventory-edit-field">
            <span>Quantity</span>
            <input class="input" id="inventoryQtyPromptInput" type="number" min="0.001" step="any" />
          </label>
          <label class="inventory-edit-field">
            <span>Unit</span>
            <select class="select" id="inventoryQtyPromptUnit"></select>
          </label>
          <label class="inventory-edit-field hide" id="inventoryQtyPromptSellWrap">
            <span id="inventoryQtyPromptSellLabel">Sale price</span>
            <input class="input" id="inventoryQtyPromptSell" type="number" min="0" step="any" placeholder="Required" />
          </label>
        </div>
        <div class="inventory-qty-prompt-price" id="inventoryQtyPromptPrice"></div>
        <div class="inventory-qty-prompt-actions">
          <button type="button" class="btn ghost" data-qty-cancel="1">Cancel</button>
          <button type="button" class="btn primary" id="inventoryQtyPromptConfirm">Add</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

let inventoryQtyPromptAbort = null;

function promptInventoryAddQty(group, { title = "Add to cart" } = {}){
  return new Promise(resolve => {
    if (inventoryQtyPromptAbort) {
      try { inventoryQtyPromptAbort.abort(); } catch (_) {}
    }
    inventoryQtyPromptAbort = new AbortController();
    const { signal } = inventoryQtyPromptAbort;
    const modal = ensureInventoryQtyPromptModal();
    const category = resolveInventoryItemCategory(group);
    const sellByBottle = category === INVENTORY_CATEGORY_VOLUME && inventorySellsByBottle(group);
    const bottleHint = sellByBottle ? inventoryBottleSizeFromGroup(group) : null;
    const bottleLiters = sellByBottle ? inventoryBottleSizeLiters(group) : 0;
    const measured = inventoryIsDecimalCategory(category) && !sellByBottle;
    const preferredUnit = sellByBottle
      ? "bottle"
      : (category === INVENTORY_CATEGORY_VOLUME
        ? INVENTORY_UNIT_ML
        : preferredDraftQtyUnit(category, measured ? 1 : 1));
    let activeUnit = preferredUnit;
    const titleEl = modal.querySelector("#inventoryQtyPromptTitle");
    const descEl = modal.querySelector("#inventoryQtyPromptDesc");
    const itemEl = modal.querySelector("#inventoryQtyPromptItem");
    const presetsEl = modal.querySelector("#inventoryQtyPromptPresets");
    const priceEl = modal.querySelector("#inventoryQtyPromptPrice");
    const qtyInput = modal.querySelector("#inventoryQtyPromptInput");
    const unitSelect = modal.querySelector("#inventoryQtyPromptUnit");
    const sellWrap = modal.querySelector("#inventoryQtyPromptSellWrap");
    const sellInput = modal.querySelector("#inventoryQtyPromptSell");
    const sellLabel = modal.querySelector("#inventoryQtyPromptSellLabel");
    const displayName = (typeof formatInventoryReceiptLineName === "function"
      ? formatInventoryReceiptLineName(group)
      : [group.brand, group.subBrand, group.productLine || group.variantLabel].filter(Boolean).join(" · "))
      || group.person_name
      || "Item";
    let unitSellPerBase = Number(group.defaultUnitSoldPrice || 0);
    const bottleSellDefault = (sellByBottle && bottleLiters > 0 && unitSellPerBase > 0)
      ? unitSellPerBase * bottleLiters
      : 0;
    const needsSellPrice = sellByBottle
      ? !(bottleSellDefault > 0)
      : !(unitSellPerBase > 0);
    if (titleEl) titleEl.textContent = title;
    if (descEl) {
      const stockText = inventoryQtyLabel(group.remainingQty, category, group);
      descEl.textContent = needsSellPrice
        ? `In stock: ${stockText} · Enter sale price`
        : `In stock: ${stockText}`;
    }
    if (itemEl) {
      itemEl.innerHTML = `
        <strong>${escapeHtml(displayName)}</strong>
        <span>${escapeHtml([group.variantLabel, group.itemCode, group.person_name].filter(Boolean).join(" · "))}</span>
      `;
    }
    if (unitSelect) {
      if (sellByBottle) {
        const sizeText = bottleHint
          ? `${trimInventoryNumber(bottleHint.qty, 3)}${bottleHint.unit === INVENTORY_UNIT_L ? "L" : "ml"}`
          : "";
        unitSelect.innerHTML = `<option value="bottle" selected>Bottle${sizeText ? ` (${sizeText})` : ""}</option>`;
        unitSelect.disabled = true;
        unitSelect.value = "bottle";
        unitSelect.classList.add("is-disabled");
      } else {
        unitSelect.innerHTML = inventoryUnitSelectOptionsHtml(category, preferredUnit);
        unitSelect.disabled = !measured;
        unitSelect.value = preferredUnit;
        unitSelect.classList.toggle("is-disabled", !measured);
      }
    }
    if (qtyInput) {
      qtyInput.value = sellByBottle
        ? "1"
        : (measured
          ? (category === INVENTORY_CATEGORY_VOLUME && preferredUnit === INVENTORY_UNIT_ML ? "3" : "1")
          : "1");
      qtyInput.step = sellByBottle ? "1" : (measured ? "any" : "1");
      qtyInput.min = sellByBottle ? "1" : "0.001";
    }
    if (sellWrap && sellInput) {
      sellWrap.classList.toggle("hide", !needsSellPrice);
      sellInput.value = "";
      if (sellLabel) {
        sellLabel.textContent = sellByBottle
          ? "Sale / bottle"
          : (category === INVENTORY_CATEGORY_VOLUME
            ? (preferredUnit === INVENTORY_UNIT_ML ? "Sale / ml" : "Sale / L")
            : "Sale price");
      }
      sellInput.placeholder = sellByBottle
        ? "AED per bottle"
        : (category === INVENTORY_CATEGORY_VOLUME
          ? (preferredUnit === INVENTORY_UNIT_ML ? "AED per ml" : "AED per L")
          : "Required");
      sellInput.step = sellByBottle ? "0.01" : "any";
    }
    if (presetsEl) {
      if (sellByBottle) {
        presetsEl.classList.remove("hide");
        presetsEl.innerHTML = `
          <button type="button" class="tiny ghost inventory-qty-preset" data-qty="1" data-unit="bottle">1 bottle</button>
          <button type="button" class="tiny ghost inventory-qty-preset" data-qty="2" data-unit="bottle">2 bottles</button>
          <button type="button" class="tiny ghost inventory-qty-preset" data-qty="3" data-unit="bottle">3 bottles</button>
          <button type="button" class="tiny ghost inventory-qty-preset" data-qty="6" data-unit="bottle">6 bottles</button>
          <button type="button" class="tiny ghost inventory-qty-preset" data-qty="custom" data-unit="bottle">Custom</button>
        `;
      } else if (category === INVENTORY_CATEGORY_VOLUME) {
        presetsEl.classList.remove("hide");
        presetsEl.innerHTML = `
          <button type="button" class="tiny ghost inventory-qty-preset" data-qty="3" data-unit="ml">3 ml</button>
          <button type="button" class="tiny ghost inventory-qty-preset" data-qty="5" data-unit="ml">5 ml</button>
          <button type="button" class="tiny ghost inventory-qty-preset" data-qty="10" data-unit="ml">10 ml</button>
          <button type="button" class="tiny ghost inventory-qty-preset" data-qty="1" data-unit="l">1 L</button>
          <button type="button" class="tiny ghost inventory-qty-preset" data-qty="custom" data-unit="ml">Custom</button>
        `;
      } else {
        presetsEl.classList.add("hide");
        presetsEl.innerHTML = "";
      }
    }
    const resolveSellPerBase = () => {
      if (sellByBottle) {
        if (!needsSellPrice) return unitSellPerBase;
        const entered = Number(sellInput?.value || 0);
        if (!(entered > 0) || !(bottleLiters > 0)) return 0;
        return inventoryBottlePriceToPerLiter(entered, bottleLiters);
      }
      if (!needsSellPrice) return unitSellPerBase;
      const unit = normalizeInventoryUnit(unitSelect?.value || activeUnit, category);
      const entered = Number(sellInput?.value || 0);
      if (!(entered > 0)) return 0;
      if (category === INVENTORY_CATEGORY_VOLUME) {
        return inventoryVolumePriceToPerLiter(entered, unit);
      }
      return entered;
    };
    const resolveBaseQty = () => {
      if (sellByBottle) {
        const bottles = Math.max(0, Math.floor(Number(qtyInput?.value || 0)));
        if (!(bottles > 0) || !(bottleLiters > 0)) return 0;
        return bottles * bottleLiters;
      }
      const unit = normalizeInventoryUnit(unitSelect?.value || activeUnit, category);
      return normalizeInventoryQuantityInput(qtyInput?.value, category, unit);
    };
    const refreshPricePreview = () => {
      if (!priceEl) return;
      if (sellByBottle) {
        activeUnit = "bottle";
        if (sellLabel && needsSellPrice) sellLabel.textContent = "Sale / bottle";
        const bottles = Math.max(0, Math.floor(Number(qtyInput?.value || 0)));
        const sellPerBase = resolveSellPerBase();
        const bottlePrice = bottleLiters > 0 ? sellPerBase * bottleLiters : 0;
        if (!(bottles > 0) || !(sellPerBase > 0) || !(bottleLiters > 0)) {
          priceEl.innerHTML = needsSellPrice
            ? `<span>Enter bottles and sale price</span>`
            : `<span>Enter bottles to see sell price</span>`;
          return;
        }
        const lineSell = bottlePrice * bottles;
        priceEl.innerHTML = `
          <strong>This line: ${money(lineSell, group.currency)}</strong>
          <span>${escapeHtml(`${moneyText(bottlePrice, group.currency)} / bottle`)}</span>
        `;
        return;
      }
      const unit = normalizeInventoryUnit(unitSelect?.value || activeUnit, category);
      activeUnit = unit;
      if (sellLabel && needsSellPrice) {
        sellLabel.textContent = category === INVENTORY_CATEGORY_VOLUME
          ? (unit === INVENTORY_UNIT_ML ? "Sale / ml" : "Sale / L")
          : "Sale price";
      }
      const baseQty = normalizeInventoryQuantityInput(qtyInput?.value, category, unit);
      const sellPerBase = resolveSellPerBase();
      if (!(baseQty > 0) || !(sellPerBase > 0)) {
        priceEl.innerHTML = needsSellPrice
          ? `<span>Enter quantity and sale price</span>`
          : `<span>Enter quantity to see sell price</span>`;
        return;
      }
      const lineSell = sellPerBase * baseQty;
      const rate = inventoryLineRateForDisplay(sellPerBase, baseQty, category, unit);
      const rateLabel = category === INVENTORY_CATEGORY_VOLUME && unit === INVENTORY_UNIT_ML
        ? `${moneyText(rate, group.currency)} / ml`
        : `${moneyText(sellPerBase, group.currency)} / ${inventoryBaseUnitForCategory(category)}`;
      priceEl.innerHTML = `
        <strong>This line: ${money(lineSell, group.currency)}</strong>
        <span>${escapeHtml(rateLabel)}</span>
      `;
    };
    let settled = false;
    const cleanup = (value) => {
      if (settled) return;
      settled = true;
      modal.classList.add("hide");
      modal.setAttribute("aria-hidden", "true");
      const stillOpen = document.querySelector(".modal:not(.hide)");
      document.body.style.overflow = stillOpen ? "hidden" : "";
      try { inventoryQtyPromptAbort?.abort(); } catch (_) {}
      resolve(value);
    };
    modal.querySelectorAll("[data-qty-cancel]").forEach(el => {
      el.addEventListener("click", e => {
        e.preventDefault();
        cleanup(null);
      }, { signal });
    });
    modal.querySelector("#inventoryQtyPromptPresets")?.querySelectorAll(".inventory-qty-preset").forEach(btn => {
      btn.addEventListener("click", e => {
        e.preventDefault();
        const presetQty = btn.dataset.qty;
        const presetUnit = btn.dataset.unit || (sellByBottle ? "bottle" : INVENTORY_UNIT_ML);
        activeUnit = presetUnit;
        if (unitSelect && !sellByBottle) {
          unitSelect.value = normalizeInventoryUnit(presetUnit, category);
          unitSelect.disabled = false;
        }
        if (presetQty === "custom") {
          if (qtyInput) {
            qtyInput.value = "";
            qtyInput.focus();
          }
        } else if (qtyInput) {
          qtyInput.value = String(presetQty || "");
        }
        refreshPricePreview();
      }, { signal });
    });
    modal.querySelector("#inventoryQtyPromptConfirm")?.addEventListener("click", e => {
      e.preventDefault();
      if (sellByBottle && !(bottleLiters > 0)) {
        alert("This item is set to sell by bottle, but bottle size is missing. Use a size like 250 ml on the variant, then try again.");
        return;
      }
      const baseQty = resolveBaseQty();
      if (!(baseQty > 0)) {
        alert(sellByBottle ? "Enter a valid number of bottles." : "Enter a valid quantity.");
        return;
      }
      const sellPerBase = resolveSellPerBase();
      if (!(sellPerBase > 0)) {
        alert(sellByBottle
          ? "Enter the sale price per bottle."
          : (category === INVENTORY_CATEGORY_VOLUME
            ? "Enter the sale price (per ml or per L)."
            : "Enter the sale price."));
        sellInput?.focus();
        return;
      }
      cleanup({
        qty: baseQty,
        displayUnit: sellByBottle ? "bottle" : normalizeInventoryUnit(unitSelect?.value || activeUnit, category),
        unitPrice: sellPerBase
      });
    }, { signal });
    qtyInput?.addEventListener("input", refreshPricePreview, { signal });
    sellInput?.addEventListener("input", refreshPricePreview, { signal });
    unitSelect?.addEventListener("change", () => {
      if (sellByBottle) return;
      const prevUnit = activeUnit;
      const nextUnit = normalizeInventoryUnit(unitSelect.value, category);
      const typed = Number(qtyInput?.value || 0);
      if (Number.isFinite(typed) && typed > 0 && prevUnit !== nextUnit) {
        const asBase = normalizeInventoryQuantityInput(typed, category, prevUnit);
        qtyInput.value = trimInventoryNumber(
          inventoryQtyInUnit(asBase, category, nextUnit),
          inventoryIsDecimalCategory(category) ? 3 : 0
        );
      }
      activeUnit = nextUnit;
      refreshPricePreview();
    }, { signal });
    qtyInput?.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        modal.querySelector("#inventoryQtyPromptConfirm")?.click();
      }
      if (e.key === "Escape") cleanup(null);
    }, { signal });
    sellInput?.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        modal.querySelector("#inventoryQtyPromptConfirm")?.click();
      }
    }, { signal });
    refreshPricePreview();
    modal.classList.remove("hide");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    setTimeout(() => {
      if (needsSellPrice) {
        sellInput?.focus();
        sellInput?.select();
      } else {
        qtyInput?.focus();
        qtyInput?.select();
      }
    }, 30);
  });
}

let addGroupToSaleDraftBusy = false;

async function addGroupToSaleDraft(groupId, qtyOverride = null){
  if (addGroupToSaleDraftBusy) return false;
  addGroupToSaleDraftBusy = true;
  try {
    const group = getGoodsGroups({ applyUiFilters: false }).find(g => g.group_id === groupId);
    if (!group) {
      alert("Item not found.");
      return false;
    }
    if (group.remainingQty <= 0.00000001) {
      alert("This item is out of stock.");
      return false;
    }
    const category = resolveInventoryItemCategory(group);
    let addQty = qtyOverride;
    let chosenUnit = null;
    let chosenUnitPrice = null;
    if (addQty == null) {
      const picked = await promptInventoryAddQty(group);
      if (picked == null) return false;
      if (picked && typeof picked === "object") {
        addQty = picked.qty;
        chosenUnit = picked.displayUnit || null;
        if (picked.unitPrice != null) chosenUnitPrice = Number(picked.unitPrice);
      } else {
        addQty = picked;
      }
    } else if (typeof addQty === "object" && addQty) {
      chosenUnit = addQty.displayUnit || null;
      if (addQty.unitPrice != null) chosenUnitPrice = Number(addQty.unitPrice);
      addQty = addQty.qty;
    }
    addQty = Number(addQty || 0);
    if (!(addQty > 0)) {
      alert("Enter a valid quantity.");
      return false;
    }
    const already = getSaleDraftQtyForGroup(group.group_id);
    if (already + addQty > group.remainingQty + 0.00000001) {
      alert(`Only ${inventoryQtyLabel(group.remainingQty - already, category, group)} left for this item.`);
      return false;
    }
    const draft = ensureSaleDraftShape();
    if (!draft.draftNumber) draft.draftNumber = nextProformaNumber();
    let unitPrice = Number(chosenUnitPrice);
    if (!(unitPrice > 0)) unitPrice = Number(group.defaultUnitSoldPrice || 0);
    if (!(unitPrice > 0)) {
      alert("Set a sale price for this item before adding to cart.");
      return false;
    }
    const taxDefault = inventoryTaxDefaultsForGroup(group);
    const tax = calculateTaxBreakdown(unitPrice * addQty, taxDefault.rate, taxDefault.mode, taxDefault.rate > 0);
    const displayUnit = normalizeInventoryUnit(
      chosenUnit || preferredDraftQtyUnit(category, addQty),
      category
    );
    const bottleLiters = inventorySellsByBottle(group) ? inventoryBottleSizeLiters(group) : 0;
    // Always keep each Add-to-cart as its own line (perfume pours, PDF rows, stock reduce per line).
    draft.lines.push({
      lineId: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `line-${Date.now()}-${draft.lines.length}`,
      groupId: group.group_id,
      itemName: group.person_name || "Item",
      itemCode: group.itemCode || "",
      brand: group.brand || "",
      subBrand: group.subBrand || "",
      productLine: group.productLine || "",
      variantLabel: group.variantLabel || "",
      variantStorage: group.variantStorage || "",
      variantColor: group.variantColor || "",
      itemType: group.itemType || "General",
      itemCategory: category,
      currency: group.currency || "AED",
      qty: addQty,
      displayUnit,
      sellBy: (typeof resolveInventorySellBy === "function"
        ? resolveInventorySellBy(group)
        : (group.sellBy || "")),
      bottleSizeQty: group.bottleSizeQty ?? inventoryBottleSizeFromGroup(group)?.qty,
      bottleSizeUnit: group.bottleSizeUnit || inventoryBottleSizeFromGroup(group)?.unit || "",
      bottleLiters: bottleLiters || null,
      unitPrice,
      taxApplied: tax.applied,
      taxRate: tax.rate,
      taxMode: tax.mode,
      netAmount: tax.net,
      taxAmount: tax.tax,
      grossAmount: tax.total
    });
    if (!draft.soldDate) draft.soldDate = todayISO();
    if (!draft.draftNumber) draft.draftNumber = nextProformaNumber();
    persistSaleDraft();
    // Auto-mirror into Saved carts so Open/finalize always finds this cart.
    try { upsertSaleDraftInLibrary(draft); } catch (_) {}
    updateSaleDraftDock();
    const dock = document.getElementById("inventorySaleDraftDock");
    if (dock) {
      dock.classList.add("is-pulse");
      setTimeout(() => dock.classList.remove("is-pulse"), 320);
    }
    return true;
  } finally {
    addGroupToSaleDraftBusy = false;
  }
}

function refreshSaleDraftLineTax(line, group){
  if (!line) return;
  const taxDefault = inventoryTaxDefaultsForGroup(group || {
    currency: line.currency,
    defaultTaxRate: line.taxRate,
    defaultTaxMode: line.taxMode
  });
  const tax = calculateTaxBreakdown(
    Number(line.unitPrice || 0) * Number(line.qty || 0),
    line.taxRate ?? taxDefault.rate,
    line.taxMode || taxDefault.mode,
    !!line.taxApplied || taxDefault.rate > 0
  );
  line.netAmount = tax.net;
  line.taxAmount = tax.tax;
  line.grossAmount = tax.total;
  line.taxApplied = tax.applied;
  line.taxRate = tax.rate;
  line.taxMode = tax.mode;
}

function updateSaleDraftLineFields(index, patch = {}, { refreshUi = false } = {}){
  const draft = ensureSaleDraftShape();
  const line = draft.lines[index];
  if (!line) return false;
  const group = getGoodsGroups({ applyUiFilters: false }).find(g => g.group_id === line.groupId);
  const category = resolveInventoryItemCategory({
    itemCategory: line.itemCategory || group?.itemCategory,
    itemType: line.itemType || group?.itemType
  });
  if (patch.displayUnit != null) {
    line.displayUnit = normalizeInventoryUnit(patch.displayUnit, category);
  }
  const bottleLiters = Number(line.bottleLiters)
    || inventoryBottleSizeLiters(group || line)
    || 0;
  if (bottleLiters > 0) line.bottleLiters = bottleLiters;
  if (patch.qtyDisplay != null || patch.qty != null) {
    const unit = normalizeInventoryUnit(patch.displayUnit ?? line.displayUnit, category);
    const nextQty = patch.qty != null
      ? normalizeStoredInventoryQty(patch.qty, category, 0)
      : normalizeInventoryQuantityInput(patch.qtyDisplay, category, unit, bottleLiters);
    if (!(nextQty > 0)) {
      draft.lines.splice(index, 1);
      persistSaleDraft();
      updateSaleDraftDock();
      renderSaleDraftModalBody();
      return true;
    }
    const remaining = Number(group?.remainingQty || 0);
    const others = draft.lines.reduce((sum, row, i) =>
      i === index || row.groupId !== line.groupId ? sum : sum + Number(row.qty || 0), 0);
    if (group && nextQty + others > remaining + 0.00000001) {
      alert(`Only ${inventoryQtyLabel(Math.max(remaining - others, 0), category, group)} left.`);
      if (refreshUi) renderSaleDraftModalBody();
      return false;
    }
    line.qty = nextQty;
    line.displayUnit = unit || preferredDraftQtyUnit(category, nextQty);
  }
  if (patch.unitPrice != null) {
    // Cart UI shows rate in display units (e.g. /ml or /bottle); store per base unit (e.g. /L).
    line.unitPrice = inventoryDisplayRateToUnitPrice(
      patch.unitPrice,
      category,
      line.displayUnit,
      line.qty,
      bottleLiters
    );
  }
  refreshSaleDraftLineTax(line, group);
  persistSaleDraft();
  updateSaleDraftDock();
  if (refreshUi) {
    renderSaleDraftModalBody();
  } else {
    const row = document.querySelector(`#inventorySaleDraftBody [data-draft-index="${index}"]`);
    const totalEl = row?.querySelector(".inventory-draft-line-total");
    if (totalEl) totalEl.innerHTML = money(line.grossAmount || 0, line.currency);
    const footerTotal = document.querySelector("#inventorySaleDraftBody .inventory-draft-footer strong");
    if (footerTotal) footerTotal.innerHTML = saleDraftMoneySummaryHtml();
    const stockEl = row?.querySelector(".inventory-draft-line-stock");
    if (stockEl) {
      const info = getSaleDraftLineStockInfo(line);
      stockEl.className = `inventory-draft-line-stock is-${info.status}`;
      stockEl.textContent = info.status === "ok" ? `Stock ${info.label}` : info.label;
    }
  }
  return true;
}

function updateSaleDraftLineQty(index, qty){
  updateSaleDraftLineFields(index, { qty }, { refreshUi: true });
}

function removeSaleDraftLine(index){
  const draft = ensureSaleDraftShape();
  draft.lines.splice(index, 1);
  persistSaleDraft();
  updateSaleDraftDock();
  renderSaleDraftModalBody();
}

function ensureSaleDraftDock(){
  let dock = document.getElementById("inventorySaleDraftDock");
  if (dock) return dock;
  dock = document.createElement("div");
  dock.id = "inventorySaleDraftDock";
  dock.className = "inventory-sale-draft-dock hide";
  dock.classList.add("inventory-cart-dock");
  dock.innerHTML = `
    <button type="button" class="inventory-sale-draft-dock-main" id="openSaleDraftBtn">
      <span class="inventory-sale-draft-dock-label"><i class="fa-solid fa-cart-shopping"></i> Cart</span>
      <strong id="saleDraftDockCount">0</strong>
      <em id="saleDraftDockTotal">0</em>
    </button>
    <button type="button" class="tiny ghost" id="openSaleDraftsDockBtn" title="Saved carts">All</button>
    <button type="button" class="tiny ghost" id="clearSaleDraftBtn" title="Clear cart">Clear</button>
  `;
  document.body.appendChild(dock);
  dock.querySelector("#openSaleDraftBtn")?.addEventListener("click", () => openSaleDraftModal());
  dock.querySelector("#openSaleDraftsDockBtn")?.addEventListener("click", () => setInventorySubView("drafts"));
  dock.querySelector("#clearSaleDraftBtn")?.addEventListener("click", () => {
    if (!ensureSaleDraftShape().lines.length) return;
    if (!confirm("Clear the current cart?")) return;
    clearSaleDraft();
  });
  return dock;
}

function updateSaleDraftDock(){
  const dock = ensureSaleDraftDock();
  const count = saleDraftLineCount();
  const countEl = document.getElementById("saleDraftDockCount");
  const totalEl = document.getElementById("saleDraftDockTotal");
  if (countEl) countEl.textContent = String(count);
  if (totalEl) totalEl.textContent = saleDraftMoneySummary();
  const onGoods = getActiveTabKey() === "goods" && state.inventoryView !== "customers";
  dock.classList.toggle("hide", !onGoods || count <= 0);
}

function ensureSaleDraftModal(){
  let modal = document.getElementById("inventorySaleDraftModal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "inventorySaleDraftModal";
  modal.className = "modal hide";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="modal-backdrop" data-close-modal="inventorySaleDraftModal"></div>
    <div class="modal-dialog compact-entry-dialog inventory-sale-draft-dialog">
      <div class="modal-head">
        <div>
          <h3 id="inventorySaleDraftTitle">Cart</h3>
          <p class="help" id="inventorySaleDraftHelp">Proforma cart — stock reduces only on finalize.</p>
        </div>
        <button class="icon-btn ghost" type="button" data-close-modal="inventorySaleDraftModal" aria-label="Close">×</button>
      </div>
      <div class="modal-body" id="inventorySaleDraftBody"></div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelectorAll("[data-close-modal]").forEach(el => {
    el.addEventListener("click", e => {
      e.preventDefault();
      closeModal(el.dataset.closeModal || "inventorySaleDraftModal");
    });
  });
  modal.addEventListener("click", e => {
    if (e.target && e.target.matches(".modal-backdrop")) closeModal("inventorySaleDraftModal");
  });
  return modal;
}

function applySaleDraftCustomerToForm(body, contact = {}, name = ""){
  const setVal = (id, value) => {
    const el = body?.querySelector(`#${id}`);
    if (el) el.value = value || "";
  };
  setVal("saleDraftCustomerName", name);
  setVal("saleDraftCustomerPhone", contact.phone || "");
  setVal("saleDraftCustomerCompany", contact.company || "");
  setVal("saleDraftCustomerEmail", contact.email || "");
  setVal("saleDraftCustomerTrn", contact.trn || "");
  setVal("saleDraftCustomerAddress", contact.address || "");
}

function syncSaleDraftCustomerModeUi(body){
  const draft = ensureSaleDraftShape();
  const mode = draft.customerMode || "walkin";
  body?.querySelectorAll("[data-draft-customer-mode]").forEach(btn => {
    btn.classList.toggle("is-active", btn.dataset.draftCustomerMode === mode);
  });
  body?.querySelector("#saleDraftExistingWrap")?.classList.toggle("hide", mode !== "existing");
  body?.querySelector("#saleDraftDetailsWrap")?.classList.toggle("hide", mode === "walkin");
  const nameInput = body?.querySelector("#saleDraftCustomerName");
  if (nameInput) {
    nameInput.readOnly = mode === "existing";
    nameInput.placeholder = mode === "existing" ? "Select from list" : "Customer name";
  }
}

function renderSaleDraftCustomerResults(body, { append = false } = {}){
  const draft = ensureSaleDraftShape();
  const wrap = body?.querySelector("#saleDraftCustomerResults");
  if (!wrap) return;
  const search = String(body.querySelector("#saleDraftCustomerSearch")?.value || "");
  const stateKey = "__saleDraftCustomerPage";
  const pageSize = 20;
  if (!append) wrap[stateKey] = 0;
  const offset = Number(wrap[stateKey] || 0);
  const page = inventoryCustomerDirectory({ search, offset, limit: pageSize });
  const rowsHtml = page.items.map(item => {
    const meta = [item.phone, item.company, item.email].filter(Boolean).join(" · ");
    const selected = String(draft.customerName || "") === item.name;
    return `
      <button type="button" class="inventory-draft-customer-row ${selected ? "is-selected" : ""}" data-customer-name="${escapeHtml(item.name)}">
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(meta || "No contact details")}</span>
      </button>
    `;
  }).join("");
  const moreHtml = page.hasMore
    ? `<button type="button" class="inventory-draft-customer-more" id="saleDraftCustomerMore">Show more (${page.total - offset - page.items.length} left)</button>`
    : "";
  if (!append) {
    wrap.innerHTML = page.items.length
      ? `${rowsHtml}${moreHtml}`
      : `<div class="empty" style="padding:8px;font-size:.72rem">No customers found.</div>`;
  } else {
    wrap.querySelector("#saleDraftCustomerMore")?.remove();
    wrap.insertAdjacentHTML("beforeend", `${rowsHtml}${moreHtml}`);
  }
  wrap[stateKey] = offset + page.items.length;
  wrap.querySelectorAll("[data-customer-name]").forEach(btn => {
    if (btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", () => {
      const name = btn.dataset.customerName || "";
      const contact = getInventoryCustomerContact(name);
      draft.customerMode = "existing";
      draft.customerName = name;
      draft.customerPhone = contact.phone || "";
      draft.customerCompany = contact.company || "";
      draft.customerEmail = contact.email || "";
      draft.customerTrn = contact.trn || "";
      draft.customerAddress = contact.address || "";
      applySaleDraftCustomerToForm(body, contact, name);
      persistSaleDraft();
      wrap.querySelectorAll(".inventory-draft-customer-row").forEach(row => {
        row.classList.toggle("is-selected", row.dataset.customerName === name);
      });
    });
  });
  wrap.querySelector("#saleDraftCustomerMore")?.addEventListener("click", () => {
    renderSaleDraftCustomerResults(body, { append: true });
  });
}

function bindSaleDraftCustomerUi(body){
  const draft = ensureSaleDraftShape();
  syncSaleDraftCustomerModeUi(body);
  body.querySelectorAll("[data-draft-customer-mode]").forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.draftCustomerMode || "walkin";
      draft.customerMode = mode;
      if (mode === "walkin") {
        draft.customerName = "";
        draft.customerPhone = "";
        draft.customerCompany = "";
        draft.customerEmail = "";
        draft.customerTrn = "";
        draft.customerAddress = "";
        applySaleDraftCustomerToForm(body, {}, "");
      } else if (mode === "existing") {
        renderSaleDraftCustomerResults(body);
      }
      persistSaleDraft();
      syncSaleDraftCustomerModeUi(body);
    });
  });
  let searchTimer = 0;
  body.querySelector("#saleDraftCustomerSearch")?.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => renderSaleDraftCustomerResults(body), 160);
  });
  if (draft.customerMode === "existing") renderSaleDraftCustomerResults(body);
}

function renderSaleDraftModalBody(){
  const body = document.getElementById("inventorySaleDraftBody");
  if (!body) return;
  const draft = ensureSaleDraftShape();
  if (!draft.draftNumber) draft.draftNumber = nextProformaNumber();
  const title = document.getElementById("inventorySaleDraftTitle");
  const help = document.getElementById("inventorySaleDraftHelp");
  if (title) title.textContent = draft.draftNumber ? `Cart · ${draft.draftNumber}` : "Cart";
  if (help) help.textContent = "Proforma cart — stock is reduced only when finalized.";
  const wallets = typeof getExpenseAccounts === "function"
    ? getExpenseAccounts({ applyUiFilters: false }).filter(a => String(a.currency || "") !== "BTC")
    : [];
  if (!draft.lines.length) {
    body.innerHTML = `
      <div class="empty">Cart is empty. Tap <strong>Scan</strong> or <strong>Add items</strong> to build the sale.</div>
      <div class="inventory-draft-footer">
        <div class="inventory-draft-footer-actions">
          <button type="button" class="btn soft" id="saleDraftScanBtn"><i class="fa-solid fa-camera"></i> Scan</button>
          <button type="button" class="btn primary" id="saleDraftAddItemsBtn">Add items</button>
          <button type="button" class="btn ghost" id="saleDraftNewBtn">New cart</button>
          <button type="button" class="btn ghost" id="saleDraftKeepBtn">Close</button>
        </div>
      </div>`;
    body.querySelector("#saleDraftKeepBtn")?.addEventListener("click", () => closeModal("inventorySaleDraftModal"));
    body.querySelector("#saleDraftAddItemsBtn")?.addEventListener("click", () => openSaleDraftAddItemsPicker());
    body.querySelector("#saleDraftScanBtn")?.addEventListener("click", () => {
      if (typeof openInventoryBarcodeScannerFromCart === "function") openInventoryBarcodeScannerFromCart();
      else if (typeof openInventoryBarcodeScanner === "function") openInventoryBarcodeScanner();
    });
    body.querySelector("#saleDraftNewBtn")?.addEventListener("click", async () => {
      await startNewSaleDraft({ askSave: false });
      renderSaleDraftModalBody();
    });
    return;
  }
  body.innerHTML = `
    <div class="inventory-draft-lines">
      ${draft.lines.map((line, index) => {
        const category = resolveInventoryItemCategory({ itemCategory: line.itemCategory, itemType: line.itemType });
        const stock = getSaleDraftLineStockInfo(line);
        const bottleLiters = Number(line.bottleLiters)
          || inventoryBottleSizeLiters(stock.group || line)
          || 0;
        const sellByBottle = (line.displayUnit === INVENTORY_UNIT_BOTTLE)
          || (stock.group && inventorySellsByBottle(stock.group));
        const unit = sellByBottle
          ? INVENTORY_UNIT_BOTTLE
          : normalizeInventoryUnit(line.displayUnit || preferredDraftQtyUnit(category, line.qty), category);
        const qtyDisplay = inventoryQtyInUnit(line.qty, category, unit, bottleLiters);
        const measured = inventoryIsDecimalCategory(category) && !sellByBottle;
        const rateDisplay = inventoryLineRateForDisplay(line.unitPrice, line.qty, category, unit, bottleLiters);
        const rateLabel = sellByBottle
          ? "Price / bottle"
          : (category === INVENTORY_CATEGORY_VOLUME && unit === INVENTORY_UNIT_ML
            ? "Price / ml"
            : (category === INVENTORY_CATEGORY_VOLUME ? "Price / L" : "Sell price"));
        return `
        <div class="inventory-draft-line ${stock.status !== "ok" ? "has-stock-issue" : ""}" data-draft-index="${index}">
          <div class="inventory-draft-line-main">
            <strong>${escapeHtml(line.itemName)}</strong>
            <span>${escapeHtml([line.brand, line.subBrand, line.productLine, line.variantLabel, line.variantStorage, line.variantColor, line.itemCode || line.itemType].filter(Boolean).join(" · "))}</span>
            <span class="inventory-draft-line-stock is-${stock.status}">${escapeHtml(stock.status === "ok" ? `Stock ${stock.label}` : stock.label)}</span>
          </div>
          <div class="inventory-draft-line-controls">
            <div class="inventory-draft-qty-wrap">
              <input class="input inventory-draft-qty" type="number" min="${sellByBottle ? "1" : "0.001"}" step="${sellByBottle ? "1" : "any"}" value="${escapeHtml(trimInventoryNumber(qtyDisplay, measured ? 3 : 0))}" aria-label="Quantity" />
              <select class="select inventory-draft-unit" aria-label="Unit" ${measured && !sellByBottle ? "" : "disabled"}>
                ${sellByBottle
                  ? `<option value="bottle" selected>Bottle</option>`
                  : inventoryUnitSelectOptionsHtml(category, unit)}
              </select>
            </div>
            <input class="input inventory-draft-price" type="number" min="0" step="0.01" value="${escapeHtml(String(rateDisplay || 0))}" aria-label="${escapeHtml(rateLabel)}" title="${escapeHtml(rateLabel)}" />
            <strong class="inventory-draft-line-total">${money(line.grossAmount || 0, line.currency)}</strong>
            <button type="button" class="tiny danger inventory-draft-remove" aria-label="Remove">✕</button>
          </div>
        </div>`;
      }).join("")}
    </div>
    <div class="inventory-draft-customer-mode" role="tablist" aria-label="Customer type">
      <button type="button" data-draft-customer-mode="walkin">Walk-in</button>
      <button type="button" data-draft-customer-mode="existing">Existing</button>
      <button type="button" data-draft-customer-mode="new">New</button>
    </div>
    <div id="saleDraftExistingWrap" class="inventory-draft-existing hide">
      <label class="inventory-edit-field inventory-edit-field-wide">
        <span>Search customers</span>
        <input class="input" id="saleDraftCustomerSearch" placeholder="Name, mobile, company, email, TRN…" autocomplete="off" />
      </label>
      <div id="saleDraftCustomerResults" class="inventory-draft-customer-results"></div>
    </div>
    <div id="saleDraftDetailsWrap" class="inventory-draft-form">
      <label class="inventory-edit-field">
        <span>Customer name</span>
        <input class="input" id="saleDraftCustomerName" value="${escapeHtml(draft.customerName || "")}" placeholder="Customer name" autocomplete="off" />
      </label>
      <label class="inventory-edit-field">
        <span>Phone</span>
        <input class="input" id="saleDraftCustomerPhone" value="${escapeHtml(draft.customerPhone || "")}" autocomplete="off" />
      </label>
      <label class="inventory-edit-field">
        <span>Company</span>
        <input class="input" id="saleDraftCustomerCompany" value="${escapeHtml(draft.customerCompany || "")}" autocomplete="organization" />
      </label>
      <label class="inventory-edit-field">
        <span>Email</span>
        <input class="input" id="saleDraftCustomerEmail" type="email" value="${escapeHtml(draft.customerEmail || "")}" autocomplete="email" />
      </label>
      <label class="inventory-edit-field">
        <span>TRN</span>
        <input class="input" id="saleDraftCustomerTrn" value="${escapeHtml(draft.customerTrn || "")}" autocomplete="off" />
      </label>
      <label class="inventory-edit-field">
        <span>Address</span>
        <input class="input" id="saleDraftCustomerAddress" value="${escapeHtml(draft.customerAddress || "")}" autocomplete="street-address" />
      </label>
    </div>
    <div class="inventory-draft-form" style="margin-top:6px">
      <label class="inventory-edit-field">
        <span>Sale date</span>
        <input class="input" id="saleDraftSoldDate" type="date" value="${escapeHtml(draft.soldDate || todayISO())}" />
      </label>
      <label class="inventory-edit-field">
        <span>Paid <em class="optional-label">blank = full</em></span>
        <input class="input" id="saleDraftPaidAmount" type="number" min="0" step="0.01" value="${escapeHtml(draft.paidAmount || "")}" placeholder="Full" />
      </label>
      <label class="inventory-edit-field">
        <span>Wallet <em class="optional-label">optional</em></span>
        <select class="select" id="saleDraftWalletSelect">
          <option value="">Skip</option>
          ${wallets.map(w => `<option value="${escapeHtml(w.group_id)}" ${draft.walletId === w.group_id ? "selected" : ""}>${escapeHtml(w.person_name)} (${escapeHtml(w.currency)})</option>`).join("")}
        </select>
      </label>
      <label class="inventory-edit-field">
        <span>Notes</span>
        <input class="input" id="saleDraftNotes" value="${escapeHtml(draft.notes || "")}" />
      </label>
    </div>
    <div class="inventory-draft-footer">
      <div>
        <small>Total</small>
        <strong>${saleDraftMoneySummaryHtml()}</strong>
      </div>
      <div class="inventory-draft-footer-actions">
        <button type="button" class="btn soft" id="saleDraftScanBtn"><i class="fa-solid fa-camera"></i> Scan</button>
        <button type="button" class="btn ghost" id="saleDraftAddItemsBtn">Add items</button>
        <button type="button" class="btn ghost" id="saleDraftPdfBtn">PDF</button>
        <button type="button" class="btn ghost" id="saleDraftThermalBtn" title="Print thermal merchant receipt"><i class="fa-solid fa-receipt"></i> Thermal</button>
        <button type="button" class="btn ghost" id="saleDraftSaveBtn">Save</button>
        <button type="button" class="btn ghost" id="saleDraftNewBtn">New</button>
        <button type="button" class="btn primary" id="saleDraftFinalizeBtn">Finalize</button>
      </div>
    </div>
  `;

  const commitLineInputs = (row, { refreshUi = false } = {}) => {
    const idx = Number(row?.dataset.draftIndex);
    if (!Number.isFinite(idx)) return;
    const qtyInput = row.querySelector(".inventory-draft-qty");
    const unitSelect = row.querySelector(".inventory-draft-unit");
    const priceInput = row.querySelector(".inventory-draft-price");
    updateSaleDraftLineFields(idx, {
      qtyDisplay: qtyInput?.value,
      displayUnit: unitSelect?.value,
      unitPrice: priceInput?.value
    }, { refreshUi });
  };
  body.querySelectorAll(".inventory-draft-qty, .inventory-draft-price").forEach(input => {
    input.addEventListener("change", () => commitLineInputs(input.closest("[data-draft-index]")));
    input.addEventListener("blur", () => commitLineInputs(input.closest("[data-draft-index]")));
  });
  body.querySelectorAll(".inventory-draft-unit").forEach(select => {
    select.addEventListener("change", () => {
      const row = select.closest("[data-draft-index]");
      const idx = Number(row?.dataset.draftIndex);
      const line = ensureSaleDraftShape().lines[idx];
      if (!line) return;
      const category = resolveInventoryItemCategory({ itemCategory: line.itemCategory, itemType: line.itemType });
      const bottleLiters = Number(line.bottleLiters) || inventoryBottleSizeLiters(line) || 0;
      const prevUnit = normalizeInventoryUnit(line.displayUnit || preferredDraftQtyUnit(category, line.qty), category);
      const nextUnit = normalizeInventoryUnit(select.value, category);
      const qtyInput = row.querySelector(".inventory-draft-qty");
      // Commit the currently typed qty with the previous unit before converting.
      if (qtyInput && prevUnit !== nextUnit) {
        const typed = Number(qtyInput.value || 0);
        if (Number.isFinite(typed) && typed > 0) {
          line.qty = normalizeInventoryQuantityInput(typed, category, prevUnit, bottleLiters);
        }
      }
      line.displayUnit = nextUnit;
      if (qtyInput) {
        qtyInput.value = trimInventoryNumber(
          inventoryQtyInUnit(line.qty, category, nextUnit, bottleLiters),
          inventoryIsDecimalCategory(category) && nextUnit !== INVENTORY_UNIT_BOTTLE ? 3 : 0
        );
      }
      const priceInput = row.querySelector(".inventory-draft-price");
      if (priceInput) {
        priceInput.value = String(inventoryLineRateForDisplay(line.unitPrice, line.qty, category, nextUnit, bottleLiters) || 0);
        priceInput.title = nextUnit === INVENTORY_UNIT_BOTTLE
          ? "Price / bottle"
          : (category === INVENTORY_CATEGORY_VOLUME && nextUnit === INVENTORY_UNIT_ML
            ? "Price / ml"
            : (category === INVENTORY_CATEGORY_VOLUME ? "Price / L" : "Sell price"));
      }
      refreshSaleDraftLineTax(line);
      persistSaleDraft();
      updateSaleDraftDock();
    });
  });
  body.querySelectorAll(".inventory-draft-remove").forEach(btn => {
    btn.addEventListener("click", () => {
      const row = btn.closest("[data-draft-index]");
      removeSaleDraftLine(Number(row?.dataset.draftIndex));
    });
  });
  bindSaleDraftCustomerUi(body);
  body.querySelector("#saleDraftAddItemsBtn")?.addEventListener("click", () => {
    syncSaleDraftFormFromModal();
    openSaleDraftAddItemsPicker();
  });
  body.querySelector("#saleDraftScanBtn")?.addEventListener("click", () => {
    syncSaleDraftFormFromModal();
    if (typeof openInventoryBarcodeScannerFromCart === "function") openInventoryBarcodeScannerFromCart();
    else if (typeof openInventoryBarcodeScanner === "function") openInventoryBarcodeScanner();
  });
  body.querySelector("#saleDraftPdfBtn")?.addEventListener("click", async () => {
    try {
      syncSaleDraftFormFromModal();
      await downloadSaleDraftPDF(ensureSaleDraftShape());
    } catch (err) {
      alert(err?.message || "Could not create PDF.");
    }
  });
  body.querySelector("#saleDraftThermalBtn")?.addEventListener("click", async () => {
    try {
      syncSaleDraftFormFromModal();
      if (typeof printScannerCartThermal === "function") await printScannerCartThermal();
      else alert("Thermal print is not available yet. Refresh the page.");
    } catch (err) {
      alert(err?.message || "Could not print thermal receipt.");
    }
  });
  body.querySelector("#saleDraftSaveBtn")?.addEventListener("click", () => {
    try {
      const saved = saveCurrentSaleDraft();
      alert(`Draft saved as ${saved.draftNumber}. Stock is unchanged until finalize.`);
    } catch (err) {
      alert(err?.message || "Could not save draft.");
    }
  });
  body.querySelector("#saleDraftNewBtn")?.addEventListener("click", async () => {
    await startNewSaleDraft({ askSave: true });
    renderSaleDraftModalBody();
  });
  body.querySelector("#saleDraftFinalizeBtn")?.addEventListener("click", async () => {
    const btn = body.querySelector("#saleDraftFinalizeBtn");
    if (btn?.disabled) return;
    if (btn) btn.disabled = true;
    try {
      syncSaleDraftFormFromModal();
      await finalizeSaleDraft();
    } catch (err) {
      alert(err?.message || "Could not finalize sale.");
      if (btn) btn.disabled = false;
    }
  });
}

function syncSaleDraftFormFromModal(){
  const draft = ensureSaleDraftShape();
  const modal = document.getElementById("inventorySaleDraftModal");
  const modalOpen = !!(modal && !modal.classList.contains("hide") && document.getElementById("inventorySaleDraftBody"));
  if (!modalOpen) {
    persistSaleDraft();
    return;
  }
  draft.customerMode = draft.customerMode || "walkin";
  if (draft.customerMode === "walkin") {
    draft.customerName = "";
    draft.customerPhone = "";
    draft.customerCompany = "";
    draft.customerEmail = "";
    draft.customerTrn = "";
    draft.customerAddress = "";
  } else {
    draft.customerName = String(document.getElementById("saleDraftCustomerName")?.value || "").trim();
    draft.customerPhone = String(document.getElementById("saleDraftCustomerPhone")?.value || "").trim();
    draft.customerCompany = String(document.getElementById("saleDraftCustomerCompany")?.value || "").trim();
    draft.customerEmail = String(document.getElementById("saleDraftCustomerEmail")?.value || "").trim();
    draft.customerTrn = String(document.getElementById("saleDraftCustomerTrn")?.value || "").trim();
    draft.customerAddress = String(document.getElementById("saleDraftCustomerAddress")?.value || "").trim();
  }
  const soldDateEl = document.getElementById("saleDraftSoldDate");
  if (soldDateEl) draft.soldDate = String(soldDateEl.value || todayISO());
  const paidEl = document.getElementById("saleDraftPaidAmount");
  if (paidEl) draft.paidAmount = String(paidEl.value || "").trim();
  const walletEl = document.getElementById("saleDraftWalletSelect");
  if (walletEl) draft.walletId = String(walletEl.value || "").trim();
  const notesEl = document.getElementById("saleDraftNotes");
  if (notesEl) draft.notes = String(notesEl.value || "").trim();
  document.querySelectorAll("#inventorySaleDraftBody [data-draft-index]").forEach(row => {
    const idx = Number(row.dataset.draftIndex);
    const qtyInput = row.querySelector(".inventory-draft-qty");
    const unitSelect = row.querySelector(".inventory-draft-unit");
    const priceInput = row.querySelector(".inventory-draft-price");
    if (!Number.isFinite(idx) || !qtyInput) return;
    updateSaleDraftLineFields(idx, {
      qtyDisplay: qtyInput.value,
      displayUnit: unitSelect?.value,
      unitPrice: priceInput?.value
    });
  });
  persistSaleDraft();
}

async function openSaleDraftModal(){
  ensureSaleDraftModal();
  ensureSaleDraftShape();
  try { await loadInventorySalesForCustomers({ force: false }); } catch (_) {}
  renderSaleDraftModalBody();
  const modal = document.getElementById("inventorySaleDraftModal");
  modal?.classList.remove("hide");
  modal?.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function ensureSaleDraftAddItemsModal(){
  let modal = document.getElementById("inventorySaleDraftAddItemsModal");
  if (modal && !modal.querySelector("#saleDraftAddItemsScanBtn")) {
    modal.remove();
    modal = null;
  }
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "inventorySaleDraftAddItemsModal";
  modal.className = "modal hide";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="modal-backdrop" data-close-add-items="1"></div>
    <div class="modal-dialog compact-entry-dialog inventory-add-items-dialog">
      <div class="modal-head">
        <div>
          <h3>Add items to cart</h3>
          <p class="help" id="saleDraftAddItemsDesc">Select an in-stock item. Quantity and price are asked next.</p>
        </div>
        <button class="icon-btn ghost" type="button" data-close-add-items="1" aria-label="Close">×</button>
      </div>
      <div class="modal-body">
        <label class="inventory-edit-field inventory-edit-field-wide">
          <span>Search</span>
          <input class="input" id="saleDraftAddItemsSearch" placeholder="Brand, fragrance, size, code…" autocomplete="off" />
        </label>
        <div id="saleDraftAddItemsList" class="inventory-add-items-list"></div>
        <div class="inventory-add-wizard-actions" style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn soft" id="saleDraftAddItemsScanBtn"><i class="fa-solid fa-camera"></i> Scan instead</button>
          <button type="button" class="btn ghost" data-close-add-items="1">Done</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelectorAll("[data-close-add-items]").forEach(el => {
    el.addEventListener("click", () => {
      state.inventoryAddItemsTypeFilter = "";
      modal.classList.add("hide");
      modal.setAttribute("aria-hidden", "true");
      const stillOpen = document.querySelector(".modal:not(.hide)");
      document.body.style.overflow = stillOpen ? "hidden" : "";
      renderSaleDraftModalBody();
      updateSaleDraftDock();
    });
  });
  modal.querySelector("#saleDraftAddItemsScanBtn")?.addEventListener("click", () => {
    state.inventoryAddItemsTypeFilter = "";
    modal.classList.add("hide");
    modal.setAttribute("aria-hidden", "true");
    if (typeof openInventoryBarcodeScannerFromCart === "function") openInventoryBarcodeScannerFromCart();
    else if (typeof openInventoryBarcodeScanner === "function") openInventoryBarcodeScanner();
  });
  let searchTimer = 0;
  modal.querySelector("#saleDraftAddItemsSearch")?.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => renderSaleDraftAddItemsList(), 140);
  });
  return modal;
}

function renderSaleDraftAddItemsList(){
  const list = document.getElementById("saleDraftAddItemsList");
  if (!list) return;
  const q = String(document.getElementById("saleDraftAddItemsSearch")?.value || "").trim().toLowerCase();
  const typeFilter = String(state.inventoryAddItemsTypeFilter || "").trim().toLowerCase();
  const groups = getGoodsGroups({ applyUiFilters: false })
    .filter(g => Number(g.remainingQty || 0) > 0.00000001)
    .filter(g => {
      if (!typeFilter) return true;
      return normalizeInventoryItemType(g.itemType).toLowerCase() === typeFilter;
    })
    .filter(g => {
      if (!q) return true;
      const hay = [
        g.person_name, g.brand, g.subBrand, g.productLine, g.variantLabel, g.variantStorage, g.variantColor, g.itemCode, g.itemType
      ].map(v => String(v || "").toLowerCase()).join(" ");
      return hay.includes(q);
    })
    .sort((a, b) =>
      String(a.brand || "").localeCompare(String(b.brand || ""), undefined, { sensitivity: "base" })
      || String(a.subBrand || "").localeCompare(String(b.subBrand || ""), undefined, { sensitivity: "base" })
      || String(a.productLine || "").localeCompare(String(b.productLine || ""), undefined, { sensitivity: "base" })
      || String(a.variantLabel || "").localeCompare(String(b.variantLabel || ""), undefined, { sensitivity: "base" })
    )
    .slice(0, 80);
  if (!groups.length) {
    list.innerHTML = `<div class="empty">${typeFilter ? "No in-stock items in this category." : "No matching in-stock items."}</div>`;
    return;
  }
  list.innerHTML = groups.map(g => {
    const category = resolveInventoryItemCategory(g);
    const title = (typeof formatInventoryReceiptLineName === "function"
      ? formatInventoryReceiptLineName(g)
      : [g.brand, g.subBrand, g.productLine || g.variantLabel].filter(Boolean).join(" · "))
      || g.person_name || "Item";
    const meta = [g.variantLabel, g.itemCode, inventoryQtyLabel(g.remainingQty, category, g)].filter(Boolean).join(" · ");
    const hasSell = Number(g.defaultUnitSoldPrice || 0) > 0;
    return `
      <button type="button" class="inventory-add-items-row" data-add-item-group="${escapeHtml(g.group_id)}">
        <span class="inventory-add-items-row-main">
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(meta)}</span>
        </span>
        <span class="badge ${hasSell ? "green" : "orange"}">${hasSell ? "Priced" : "Set price"}</span>
      </button>`;
  }).join("");
  list.querySelectorAll("[data-add-item-group]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (btn.dataset.adding === "1") return;
      btn.dataset.adding = "1";
      btn.disabled = true;
      try {
        const ok = await addGroupToSaleDraft(btn.dataset.addItemGroup);
        if (ok) {
          renderSaleDraftAddItemsList();
          updateSaleDraftDock();
        }
      } finally {
        delete btn.dataset.adding;
        btn.disabled = false;
      }
    });
  });
}

function openSaleDraftAddItemsPicker(options = {}){
  const modal = ensureSaleDraftAddItemsModal();
  const search = modal.querySelector("#saleDraftAddItemsSearch");
  const typeFilter = options.itemType != null && String(options.itemType).trim()
    ? normalizeInventoryItemType(options.itemType)
    : "";
  state.inventoryAddItemsTypeFilter = typeFilter;
  const desc = modal.querySelector("#saleDraftAddItemsDesc");
  if (desc) {
    desc.textContent = typeFilter
      ? `In-stock items in ${typeFilter}. Tap to add to cart.`
      : "Select an in-stock item. Quantity and price are asked next.";
  }
  if (search) search.value = "";
  renderSaleDraftAddItemsList();
  modal.classList.remove("hide");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  setTimeout(() => search?.focus(), 30);
}

async function downloadSaleDraftPDF(draftInput){
  const draft = draftInput || ensureSaleDraftShape();
  if (!draft.lines?.length) throw new Error("Draft is empty.");
  if (!window.jspdf) throw new Error("PDF library loading. Please try again.");
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  await loadCustomFontsForPdf(doc);
  const logoData = await getPdfLogo();
  const invoiceNumber = draft.draftNumber || nextProformaNumber();
  const customerName = draft.customerMode === "walkin" || !draft.customerName
    ? "Walk-in customer"
    : draft.customerName;
  const title = "Proforma Invoice";
  const subtitle = `${invoiceNumber} · Draft`;
  drawPdfHeader(doc, logoData, title, subtitle);
  const partiesBottom = drawInventoryPdfPartiesAndMeta(doc, {
    customerName,
    customerCompany: draft.customerCompany || "",
    customerTrn: draft.customerTrn || "",
    customerPhone: draft.customerPhone || "",
    customerEmail: draft.customerEmail || "",
    customerAddress: draft.customerAddress || "",
    meta: [
      { label: "Proforma", value: invoiceNumber },
      { label: "Date", value: displayDate(draft.soldDate || todayISO()) },
      { label: "Items", value: String(draft.lines.length) },
      { label: "Status", value: "Draft / Not finalized" }
    ]
  });
  doc.autoTable({
    startY: partiesBottom + 5,
    head: [["#", "Code", "Item", "Qty", "Unit", "Net", "VAT", "Total"]],
    body: draft.lines.map((line, index) => {
      const category = resolveInventoryItemCategory({ itemCategory: line.itemCategory, itemType: line.itemType });
      const stock = getSaleDraftLineStockInfo(line);
      const itemLabel = (typeof formatInventoryReceiptLineName === "function"
        ? formatInventoryReceiptLineName(line)
        : [line.itemName, line.brand, line.subBrand, line.productLine, line.variantLabel]
          .filter(Boolean)
          .filter((part, i, arr) => arr.indexOf(part) === i)
          .join(" · "));
      const stockNote = stock.status === "ok" ? "" : ` (${stock.label})`;
      const rate = inventoryLineRateForDisplay(line.unitPrice, line.qty, category, line.displayUnit);
      return [
        String(index + 1),
        line.itemCode || "—",
        `${itemLabel}${stockNote}`,
        inventoryQtyLabel(line.qty, category, line),
        formatPdfAmount(rate || 0, line.currency),
        formatPdfAmount(line.netAmount || 0, line.currency),
        line.taxAmount ? `${formatPdfAmount(line.taxAmount, line.currency)} (${trimInventoryNumber(line.taxRate, 2)}%)` : "—",
        formatPdfAmount(line.grossAmount || 0, line.currency)
      ];
    }),
    theme: "grid",
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold", fontSize: 7.6 },
    styles: { font: "helvetica", fontSize: 7.8, cellPadding: 1.8, overflow: "linebreak" },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: 22 },
      2: { cellWidth: 46 },
      3: { cellWidth: 20, halign: "right" },
      4: { cellWidth: 22, halign: "right" },
      5: { cellWidth: 22, halign: "right" },
      6: { cellWidth: 22, halign: "right" },
      7: { cellWidth: 20, halign: "right" }
    },
    margin: { top: 42, bottom: 32 },
    didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
  });
  const totals = new Map();
  for (const line of draft.lines) {
    const c = line.currency || "AED";
    const cur = totals.get(c) || { net: 0, tax: 0, total: 0 };
    cur.net += Number(line.netAmount || 0);
    cur.tax += Number(line.taxAmount || 0);
    cur.total += Number(line.grossAmount || 0);
    totals.set(c, cur);
  }
  const summaryRows = [...totals.entries()].flatMap(([c, amounts]) => [
    { label: totals.size > 1 ? `${pdfCurrencyLabel(c)} Net` : "Net", value: formatPdfAmount(amounts.net, c) },
    { label: totals.size > 1 ? `${pdfCurrencyLabel(c)} VAT` : "VAT", value: formatPdfAmount(amounts.tax, c) },
    { label: totals.size > 1 ? `${pdfCurrencyLabel(c)} Total` : "Total", value: formatPdfAmount(amounts.total, c), strong: true }
  ]);
  drawInventoryPdfTotals(doc, doc.lastAutoTable.finalY + 6, summaryRows);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.4);
  doc.setTextColor(100, 116, 139);
  doc.text("This is a proforma / draft invoice. Stock is not reduced until finalized.", 14, doc.lastAutoTable.finalY + 28);
  doc.save(`Proforma_${String(invoiceNumber).replace(/\s+/g, "_")}.pdf`);
}

let saleDraftFinalizeInFlight = false;

async function finalizeSaleDraft(){
  if (saleDraftFinalizeInFlight) return;
  saleDraftFinalizeInFlight = true;
  try {
    const draft = ensureSaleDraftShape();
    draft.lines = dedupeSaleDraftLines(draft.lines);
    persistSaleDraft();
    if (!draft.lines.length) throw new Error("Draft is empty.");
    if (draft.customerMode === "new" && !String(draft.customerName || "").trim()) {
      throw new Error("Enter a customer name for the new customer.");
    }
    if (draft.customerMode === "existing" && !String(draft.customerName || "").trim()) {
      throw new Error("Select an existing customer.");
    }
    const stockProblems = draft.lines
      .map(line => ({ line, info: getSaleDraftLineStockInfo(line) }))
      .filter(row => row.info.status !== "ok");
    if (stockProblems.length) {
      const detail = stockProblems
        .slice(0, 4)
        .map(row => `${row.line.itemName}: ${row.info.label}`)
        .join("\n");
      throw new Error(`Cannot finalize — stock issue:\n${detail}`);
    }
    const customerName = draft.customerMode === "walkin"
      ? "Walk-in customer"
      : (String(draft.customerName || "").trim() || "Walk-in customer");
    const customerContact = draft.customerMode === "walkin"
      ? { phone: "", address: "", company: "", trn: "", email: "" }
      : {
          phone: draft.customerPhone || "",
          address: draft.customerAddress || "",
          company: draft.customerCompany || "",
          trn: draft.customerTrn || "",
          email: draft.customerEmail || ""
        };
    const soldDate = draft.soldDate || todayISO();
    // Freeze the exact cart lines so later UI refreshes cannot multiply the invoice.
    const frozenLines = draft.lines.map(line => ({ ...line }));
    const saleLines = frozenLines.map(line => ({
      groupId: line.groupId,
      qty: line.qty,
      unitPrice: line.unitPrice,
      unit: inventoryBaseUnitForCategory(line.itemCategory),
      itemCategory: line.itemCategory,
      taxApplied: !!line.taxApplied,
      taxRate: normalizeTaxRate(line.taxRate),
      taxMode: normalizeTaxMode(line.taxMode),
      taxAmount: Number(line.taxAmount || 0),
      netAmount: Number(line.netAmount || 0),
      grossAmount: Number(line.grossAmount || 0),
      lineId: line.lineId || ""
    }));
    const draftId = draft.id;
    const draftNumber = String(draft.draftNumber || "").trim();
    await commitInventorySaleInvoice({
      soldDate,
      customerName,
      customerContact,
      receiptNumber: nextInvoiceNumber([draft.draftNumber]),
      soldNotes: draft.notes || null,
      walletId: draft.walletId || "",
      paidAmountRaw: draft.paidAmount,
      saleLines
    });
    removeSaleDraftFromLibrary(draftId);
    if (draftNumber) {
      state.saleDrafts = (state.saleDrafts || []).filter(d => String(d.draftNumber || "").trim() !== draftNumber);
      persistSaleDraftLibrary();
    }
    clearSaleDraft({ silent: true });
    closeModal("inventorySaleDraftModal");
    closeModal("inventorySaleDraftAddItemsModal");
    if (state.inventoryView === "drafts") renderInventoryDraftsSection();
    renderInventoryList();
  } finally {
    saleDraftFinalizeInFlight = false;
  }
}


async function commitInventorySaleInvoice({
  soldDate,
  customerName,
  customerContact,
  receiptNumber,
  soldNotes,
  walletId,
  paidAmountRaw,
  saleLines
}){
  const invoiceNumber = receiptNumber;
  const requestedQtyByGroup = new Map();
  for (const line of saleLines){
    requestedQtyByGroup.set(line.groupId, (requestedQtyByGroup.get(line.groupId) || 0) + Number(line.qty || 0));
  }
  const preparedLines = saleLines.map(line => {
    const principalEntry = state.entries.find(e =>
      e.group_id === line.groupId &&
      e.entry_kind === "principal" &&
      (e.direction === "goods" || (e.direction === "taken" && hasGoodsTag(e.notes)))
    );
    if (!principalEntry) throw new Error("One of the selected items no longer exists.");
    const soldPrice = Number(line.unitPrice || 0);
    const selectedGroup = getGoodsGroups({ applyUiFilters: false }).find(g => g.group_id === line.groupId);
    const itemCategory = normalizeInventoryCategory(selectedGroup?.itemCategory || line.itemCategory);
    const soldQty = normalizeStoredInventoryQty(line.qty, itemCategory, 0);
    if (!soldPrice || !soldQty) throw new Error("Each selected item needs quantity and unit selling price.");
    const principalMeta = goodsMetaFromNotes(principalEntry.notes);
    const totalBoughtQty = selectedGroup?.boughtQty || normalizeStoredInventoryQty(principalMeta.boughtQty, itemCategory, 1);
    const soldQtyAlready = selectedGroup?.soldQty || 0;
    const remainingQty = Math.max(totalBoughtQty - soldQtyAlready, 0);
    if ((requestedQtyByGroup.get(line.groupId) || soldQty) > remainingQty){
      throw new Error(`Only ${inventoryQtyLabel(remainingQty, itemCategory)} left for ${principalEntry.person_name}.`);
    }
    const fallbackTax = calculateTaxBreakdown(soldPrice * soldQty, line.taxRate, line.taxMode, line.taxApplied);
    const lineNet = Number.isFinite(Number(line.netAmount)) && Number(line.netAmount) > 0 ? Number(line.netAmount) : fallbackTax.net;
    const lineTax = Number.isFinite(Number(line.taxAmount)) ? Number(line.taxAmount) : fallbackTax.tax;
    const lineTotal = Number.isFinite(Number(line.grossAmount)) && Number(line.grossAmount) > 0 ? Number(line.grossAmount) : fallbackTax.total;
    return {
      ...line,
      principalEntry,
      principalMeta,
      itemCategory,
      soldQty,
      soldPrice,
      lineNet,
      lineTax,
      lineTotal,
      currency: principalEntry.currency
    };
  });

  const saleCurrencies = new Set(preparedLines.map(line => line.currency));
  const singleCurrencyReceipt = saleCurrencies.size === 1;
  const receiptTotal = preparedLines.reduce((sum, line) => sum + Number(line.lineTotal || 0), 0);
  let receiptPaidTotal = receiptTotal;
  if (singleCurrencyReceipt){
    const paidRaw = String(paidAmountRaw || "").trim();
    receiptPaidTotal = paidRaw ? Number(paidRaw) : receiptTotal;
    if (!Number.isFinite(receiptPaidTotal) || receiptPaidTotal < 0) throw new Error("Paid amount must be zero or more.");
    if (receiptPaidTotal > receiptTotal + 0.00000001) throw new Error("Paid amount cannot exceed invoice total.");
  }
  const receiptPaymentStatus = !singleCurrencyReceipt || receiptPaidTotal + 0.00000001 >= receiptTotal ? "FULL" : "PARTIAL";
  const paymentReceiptNumber = receiptPaidTotal > 0.00000001 ? nextPaymentReceiptNumber([invoiceNumber]) : "";
  let paidRemaining = receiptPaidTotal;
  const saleCurrency = singleCurrencyReceipt ? preparedLines[0]?.currency : "";
  const saleSetId = (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `sset-${Date.now()}`;
  if (walletId){
    if (!singleCurrencyReceipt) throw new Error("Wallet top-up is available only for single-currency sale invoices.");
    if (receiptPaidTotal <= 0) throw new Error("Paid amount must be greater than zero to add money to a wallet.");
    validateInventoryWallet(walletId, saleCurrency, receiptPaidTotal, "topup");
  }

  const payloads = preparedLines.map((line, lineIndex) => {
    const linePaid = singleCurrencyReceipt ? Math.min(line.lineTotal, Math.max(paidRemaining, 0)) : line.lineTotal;
    if (singleCurrencyReceipt) paidRemaining = Math.max(paidRemaining - linePaid, 0);
    const lineBalance = Math.max(line.lineTotal - linePaid, 0);
    const saleLineId = (typeof crypto !== "undefined" && crypto.randomUUID)
      ? crypto.randomUUID()
      : `sl-${Date.now()}-${lineIndex}`;
    return {
      id: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `sale-${Date.now()}-${lineIndex}`,
      group_id: line.groupId,
      direction: "taken",
      entry_kind: receiptPaymentStatus === "FULL" ? "full" : "partial",
      person_name: line.principalEntry.person_name,
      currency: line.principalEntry.currency,
      principal_amount: null,
      action_amount: line.lineTotal,
      loan_date: line.principalEntry.loan_date,
      action_date: soldDate,
      notes: upsertGoodsMetaInNote(normalizeGoodsNote(soldNotes, true), {
        soldQty: line.soldQty,
        unitSoldPrice: line.soldPrice,
        itemCode: line.principalMeta.itemCode,
        itemCategory: line.itemCategory,
        quantityUnit: inventoryBaseUnitForCategory(line.itemCategory),
        brand: line.principalMeta.brand || "",
        brandId: line.principalMeta.brandId || "",
        subBrand: line.principalMeta.subBrand || "",
        subBrandId: line.principalMeta.subBrandId || "",
        productLine: line.principalMeta.productLine || "",
        productLineId: line.principalMeta.productLineId || "",
        variantLabel: line.principalMeta.variantLabel || "",
        variantId: line.principalMeta.variantId || "",
        variantStorage: line.principalMeta.variantStorage || "",
        variantColor: line.principalMeta.variantColor || "",
        variantOther: line.principalMeta.variantOther || "",
        itemType: line.principalMeta.itemType || "",
        customerName,
        customerPhone: customerContact.phone || "",
        customerAddress: customerContact.address || "",
        customerCompany: customerContact.company || "",
        customerTrn: customerContact.trn || "",
        customerEmail: customerContact.email || "",
        receiptNumber,
        invoiceNumber,
        paymentReceiptNumber,
        transactionType: "SALE",
        saleLineNo: lineIndex + 1,
        saleLineId,
        saleSetId,
        paidAmount: linePaid,
        balanceAmount: lineBalance,
        paymentStatus: receiptPaymentStatus,
        ...taxMetaFromBreakdown({
          applied: line.taxApplied,
          rate: line.taxRate,
          mode: line.taxMode,
          tax: line.lineTax,
          net: line.lineNet,
          total: line.lineTotal
        })
      })
    };
  });
  // Await domain sync so sales land in goods_sales before any lazy reload/refresh.
  const savedSaleRows = await saveEntriesImmediately(payloads, {
    label: "Sales invoice",
    awaitSync: true
  });
  if (walletId) {
    await createWalletEntryForInventory(walletId, receiptPaidTotal, soldDate, saleCurrency, "sale", { customerName, receiptNumber });
  }
  // Keep newly saved sale lines available for customer PDFs immediately.
  if (Array.isArray(savedSaleRows) && savedSaleRows.length) {
    const missing = savedSaleRows.filter(row => !state.entries.some(e => e.id === row.id));
    if (missing.length) state.entries.unshift(...missing);
    savedSaleRows.forEach(row => {
      if (row?.group_id) state.inventoryLazy.detailLoaded.delete(String(row.group_id));
    });
  }
  // Force Customers / Invoices to refetch so new receipts appear right away.
  state.inventorySalesLoaded = false;
  try {
    await loadInventorySalesForCustomers({ force: true });
  } catch (_) {
    // Keep unloaded so the next Customers open retries.
    state.inventorySalesLoaded = false;
  }
  try { await invalidateAndRefreshInventoryLazy(); } catch (_) {}
  const primarySaleEntry = Array.isArray(savedSaleRows) ? savedSaleRows[0] : savedSaleRows;
  showSalesInvoiceSuccessOverlay({
    entryId: primarySaleEntry?.id || "",
    invoiceNumber,
    receiptNumber,
    customerName,
    totalText: singleCurrencyReceipt
      ? moneyText(receiptTotal, saleCurrency)
      : `${preparedLines.length} line(s)`
  });
}
