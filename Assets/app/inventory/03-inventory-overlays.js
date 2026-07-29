/* Modularized from script.js lines 12030-14144 — section overlays + catalog menus. Load order must be preserved. */
const INVENTORY_GRID_SORT_KEY = "triplem-inventory-grid-sort-v1";

function inventorySectionGroupIsLowStock(group){
  if (typeof isInventoryLowStockGroup === "function") return isInventoryLowStockGroup(group);
  return Number(group?.remainingQty || 0) > 0.00000001
    && Number(group?.boughtQty || 0) > 0
    && (Number(group.remainingQty || 0) / Number(group.boughtQty || 0)) <= 0.15;
}

function inventorySectionStockMeta(items){
  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    return {
      inStockCount: 0,
      lowStockCount: 0,
      soldCount: 0,
      stockKey: "empty",
      stockLabelBadge: "Empty",
      badgeClass: "green"
    };
  }
  let inStockCount = 0;
  let lowStockCount = 0;
  let soldCount = 0;
  list.forEach(g => {
    const rem = Number(g.remainingQty || 0);
    if (rem <= 0.00000001) soldCount += 1;
    else if (inventorySectionGroupIsLowStock(g)) lowStockCount += 1;
    else inStockCount += 1;
  });
  if (soldCount === list.length) {
    return { inStockCount, lowStockCount, soldCount, stockKey: "sold", stockLabelBadge: "Sold", badgeClass: "badge-sold" };
  }
  if (lowStockCount > 0) {
    return { inStockCount, lowStockCount, soldCount, stockKey: "low", stockLabelBadge: "Low stock", badgeClass: "badge-low" };
  }
  if (inStockCount > 0) {
    return { inStockCount, lowStockCount, soldCount, stockKey: "stock", stockLabelBadge: "In stock", badgeClass: "orange" };
  }
  return { inStockCount, lowStockCount, soldCount, stockKey: "empty", stockLabelBadge: "Empty", badgeClass: "green" };
}

function getInventoryGridSortMode(){
  try {
    const raw = localStorage.getItem(INVENTORY_GRID_SORT_KEY);
    const mode = String(raw || "manual").trim().toLowerCase();
    if (["manual", "name", "stock", "low", "empty", "sold"].includes(mode)) return mode;
  } catch (_) {}
  return "manual";
}

function setInventoryGridSortMode(mode){
  const next = String(mode || "manual").trim().toLowerCase();
  const safe = ["manual", "name", "stock", "low", "empty", "sold"].includes(next) ? next : "manual";
  try { localStorage.setItem(INVENTORY_GRID_SORT_KEY, safe); } catch (_) {}
  const select = document.getElementById("inventoryGridSortSelect");
  if (select && select.value !== safe) select.value = safe;
  return safe;
}

function syncInventoryGridSortSelect(){
  const select = document.getElementById("inventoryGridSortSelect");
  if (!select) return;
  const mode = getInventoryGridSortMode();
  if (select.value !== mode) select.value = mode;
  if (select.dataset.bound === "1") return;
  select.dataset.bound = "1";
  select.addEventListener("change", () => {
    const next = setInventoryGridSortMode(select.value);
    applyInventoryGridArrange(next).catch(err => {
      alert(err?.message || "Could not arrange category grids.");
    });
  });
}

function sortInventorySectionsForGrid(sections, mode = "manual"){
  const list = Array.isArray(sections) ? sections.slice() : [];
  const key = String(mode || "manual").toLowerCase();
  const byName = (a, b) => String(a.type || "").localeCompare(String(b.type || ""), undefined, { sensitivity: "base" });
  if (key === "name") return list.sort(byName);
  if (key === "stock") {
    return list.sort((a, b) => {
      const rank = { stock: 0, low: 1, sold: 2, empty: 3 };
      return (rank[a.stockKey] ?? 9) - (rank[b.stockKey] ?? 9) || byName(a, b);
    });
  }
  if (key === "low") {
    return list.sort((a, b) => {
      const rank = { low: 0, stock: 1, sold: 2, empty: 3 };
      return (rank[a.stockKey] ?? 9) - (rank[b.stockKey] ?? 9) || byName(a, b);
    });
  }
  if (key === "empty") {
    return list.sort((a, b) => {
      const rank = { empty: 0, sold: 1, low: 2, stock: 3 };
      return (rank[a.stockKey] ?? 9) - (rank[b.stockKey] ?? 9) || byName(a, b);
    });
  }
  if (key === "sold") {
    return list.sort((a, b) => {
      const rank = { sold: 0, empty: 1, low: 2, stock: 3 };
      return (rank[a.stockKey] ?? 9) - (rank[b.stockKey] ?? 9) || byName(a, b);
    });
  }
  // manual / custom: catalog sort_order
  return list.sort((a, b) => {
    const ao = Number.isFinite(Number(a.sortOrder)) ? Number(a.sortOrder) : 9999;
    const bo = Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : 9999;
    return ao - bo || byName(a, b);
  });
}

async function persistInventorySectionsOrderFromDom(grid){
  if (!grid) return;
  const cards = Array.from(grid.querySelectorAll(".inventory-section-card[data-inventory-section]:not(.inventory-section-add-card)"));
  const ordered = cards.map((card, index) => ({
    id: card.dataset.categoryId || "",
    categoryId: card.dataset.categoryId || "",
    name: card.dataset.categoryName || card.dataset.inventorySection || "",
    type: card.dataset.inventorySection || "",
    index
  }));
  if (!ordered.length) return;
  setInventoryGridSortMode("manual");
  if (typeof persistInventoryCategoryOrder === "function") {
    await persistInventoryCategoryOrder(ordered);
  }
}

async function applyInventoryGridArrange(mode){
  const nextMode = setInventoryGridSortMode(mode);
  const groups = typeof getGoodsGroups === "function" ? getGoodsGroups() : [];
  // Persist arranged order so other devices keep the same grid sequence.
  if (nextMode !== "manual") {
    const sections = getInventorySectionsForGrid(groups);
    const ordered = sections.map((section, index) => ({
      id: section.categoryId || "",
      categoryId: section.categoryId || "",
      name: section.type,
      type: section.type,
      index
    }));
    if (typeof persistInventoryCategoryOrder === "function") {
      await persistInventoryCategoryOrder(ordered);
    }
    // Order is now stored as custom sort_order — keep select on Custom order.
    setInventoryGridSortMode("manual");
  }
  renderInventorySectionsGrid(groups);
}

function getInventorySections(groups){
  const map = new Map();
  for (const group of groups) {
    const type = normalizeInventoryItemType(group.itemType || "General");
    if (!map.has(type)) map.set(type, []);
    map.get(type).push(group);
  }
  return [...map.entries()]
    .map(([type, items]) => {
      const stockMeta = inventorySectionStockMeta(items);
      const brands = new Set(items.map(g => String(g.brand || "").trim()).filter(Boolean));
      const stockLabel = inventoryQtySummary(items, "remainingQty");
      return {
        type,
        items,
        inStock: stockMeta.inStockCount + stockMeta.lowStockCount,
        brandCount: brands.size,
        stockLabel,
        ...stockMeta
      };
    })
    .sort((a, b) => a.type.localeCompare(b.type));
}

function sortInventorySectionItems(items){
  return items.slice().sort((a, b) =>
    String(a.brand || "").localeCompare(String(b.brand || ""), undefined, { sensitivity: "base" }) ||
    String(a.variantLabel || "").localeCompare(String(b.variantLabel || ""), undefined, { sensitivity: "base" }) ||
    String(a.itemCode || "").localeCompare(String(b.itemCode || ""), undefined, { numeric: true, sensitivity: "base" }) ||
    String(a.person_name || "").localeCompare(String(b.person_name || ""), undefined, { sensitivity: "base" })
  );
}

function buildInventoryGroupHistoryRows(group){
  if (!group) return [];
  // Group sale lines by invoice so the same cart finalize shows as one Sale entry.
  // PDF / edit still expands all pours via getInventoryReceiptData.
  const saleByInvoice = new Map();
  (group.actions || []).forEach(row => {
    const meta = goodsMetaFromNotes(row.notes);
    const receipt = meta.receiptNumber || meta.invoiceNumber || meta.saleSetId || shortId(row.id);
    const key = String(receipt || row.id);
    if (!saleByInvoice.has(key)) {
      saleByInvoice.set(key, { rows: [], meta, receipt });
    }
    saleByInvoice.get(key).rows.push(row);
  });
  const saleRows = [...saleByInvoice.values()].map(bundle => {
    const primary = bundle.rows[0];
    const receiptData = getInventoryReceiptData(bundle.receipt, primary);
    const invoiceNumber = receiptData.invoiceNumber || inventoryInvoiceNumberFromMeta(bundle.meta, primary);
    const customer = receiptData.customerName || bundle.meta.customerName || "Walk-in customer";
    const amount = receiptData.saleRows.reduce((sum, r) => sum + Number(r.total || 0), 0)
      || bundle.rows.reduce((sum, r) => sum + Number(r.action_amount || 0), 0);
    const paid = receiptData.paidTotal;
    const balance = receiptData.balanceTotal;
    const paymentStatus = balance <= 0.00000001 ? "Full Paid" : "Partial Paid";
    const lineCount = Math.max(receiptData.saleRows.length, bundle.rows.length);
    return {
      kind: "Sale",
      badge: "green",
      date: primary.action_date,
      amount,
      note: `${customer} · ${invoiceNumber}${lineCount > 1 ? ` · ${lineCount} lines` : ""}`,
      paymentStatus,
      paymentBadge: paymentStatus === "Full Paid" ? "green" : "orange",
      paidDisplay: money(paid, group.currency),
      balanceDisplay: money(balance, group.currency),
      canSettle: balance > 0.00000001,
      entryId: primary.id,
      receiptNumber: bundle.receipt,
      lineCount,
      isSale: true,
      isPurchase: false,
      isInvoiceGroup: true
    };
  });
  return [
    {
      kind: "Purchase",
      badge: "blue",
      date: group.principal?.loan_date,
      amount: group.principal?.principal_amount,
      note: group.itemDescription || cleanGoodsDisplayNote(group.principal?.notes) || "Opening stock",
      paymentStatus: "—",
      paidDisplay: "—",
      balanceDisplay: "—",
      entryId: group.principal?.id || "",
      isSale: false,
      isPurchase: true
    },
    ...(group.purchaseActions || []).map(row => ({
      kind: "Purchase",
      badge: "blue",
      date: row.action_date,
      amount: row.action_amount,
      note: cleanGoodsDisplayNote(row.notes) || "Additional stock",
      paymentStatus: "—",
      paidDisplay: "—",
      balanceDisplay: "—",
      entryId: row.id,
      isSale: false,
      isPurchase: true
    })),
    ...saleRows,
    ...(group.settlementActions || []).map(row => {
      const meta = goodsMetaFromNotes(row.notes);
      const invoiceNumber = inventoryInvoiceNumberFromMeta(meta, row);
      const customer = meta.customerName || "Walk-in customer";
      const balance = inventoryLineBalanceAmount(meta, 0);
      const status = inventoryPaymentStatus(meta, balance);
      return {
        kind: "Settlement",
        badge: "orange",
        date: row.action_date,
        amount: row.action_amount,
        note: `${customer} · ${invoiceNumber || shortId(row.id)}`,
        paymentStatus: status,
        paymentBadge: status === "Full Paid" ? "green" : "orange",
        paidDisplay: money(row.action_amount || 0, group.currency),
        balanceDisplay: money(balance, group.currency),
        entryId: row.id,
        isSale: false,
        isPurchase: false
      };
    })
  ].sort((a, b) => dateStamp(b.date) - dateStamp(a.date));
}

function inventoryHistoryRowsHtml(group){
  const historyRows = buildInventoryGroupHistoryRows(group);
  if (!historyRows.length) {
    return `<tr><td colspan="8">No purchases or sales yet.</td></tr>`;
  }
  return historyRows.map(row => `
    <tr>
      <td><span class="badge ${escapeHtml(row.badge)}">${escapeHtml(row.kind)}</span></td>
      <td>${escapeHtml(displayDate(row.date || "—"))}</td>
      <td>${money(row.amount || 0, group.currency)}</td>
      <td>${row.paidDisplay || "—"}</td>
      <td>${row.balanceDisplay || "—"}</td>
      <td>${row.paymentStatus === "—" ? "—" : `<span class="badge ${escapeHtml(row.paymentBadge || "orange")}">${escapeHtml(row.paymentStatus)}</span>`}</td>
      <td>${escapeHtml(row.note || "—")}</td>
      <td>
        <div class="inventory-history-actions">
          ${row.isSale || row.kind === "Settlement"
            ? `<button class="tiny sectionHistoryBtn" data-action="receipt" data-id="${escapeHtml(row.entryId)}" title="Receipt PDF"><i class="fa-solid fa-download"></i></button>`
            : `<button class="tiny sectionHistoryBtn" data-action="item-pdf" data-group-id="${escapeHtml(group.group_id)}" title="Purchase PDF"><i class="fa-solid fa-file-invoice"></i></button>`}
          ${row.canSettle ? `<button class="tiny ghost sectionHistoryBtn" data-action="settle" data-id="${escapeHtml(row.entryId)}">Clear</button>` : ""}
          ${teamCanShowEdit("invoices") && row.entryId ? `<button class="tiny ghost sectionHistoryBtn" data-action="edit" data-id="${escapeHtml(row.entryId)}" title="Edit">✎</button>` : ""}
          ${teamCanShowDelete("invoices") && row.entryId ? `<button class="tiny danger sectionHistoryBtn" data-action="delete" data-id="${escapeHtml(row.entryId)}" title="Delete">✕</button>` : ""}
        </div>
      </td>
    </tr>
  `).join("");
}

function bindInventorySectionHistoryButtons(scope, sectionType){
  const type = normalizeInventoryItemType(sectionType || state.inventoryActiveSection);
  scope?.querySelectorAll(".sectionHistoryBtn").forEach(btn => {
    if (btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", async e => {
      e.preventDefault();
      e.stopPropagation();
      const action = btn.dataset.action;
      if (action === "receipt") downloadInventoryReceiptPDF(btn.dataset.id);
      if (action === "item-pdf") downloadGoodsItemPDF(btn.dataset.groupId);
      if (action === "settle") openGoodsSettlementModal(btn.dataset.id);
      if (action === "edit") openInventoryReceiptEditor(btn.dataset.id);
      if (action === "delete") {
        const entry = state.entries.find(e => e.id === btn.dataset.id);
        if (entry && isInventorySaleAction(entry)) {
          await deleteInventoryReceipt(btn.dataset.id);
        } else {
          await deleteEntry(btn.dataset.id);
        }
        await renderInventorySectionOverlayBody(type);
      }
    });
  });
}

async function deleteInventoryReceipt(entryId){
  const saleEntry = state.entries.find(e => e.id === entryId && e.entry_kind !== "principal" && hasGoodsTag(e.notes));
  if (!saleEntry) {
    alert("Invoice not found.");
    return false;
  }
  if (!teamCapability("can_delete_invoices")) {
    alert("You do not have permission to delete invoices.");
    return false;
  }
  const meta = goodsMetaFromNotes(saleEntry.notes);
  const receiptKey = meta.receiptNumber || meta.invoiceNumber || meta.saleSetId || shortId(saleEntry.id);
  const receiptData = getInventoryReceiptData(receiptKey, saleEntry);
  const invoiceNumber = receiptData.invoiceNumber || inventoryInvoiceNumberFromMeta(meta, saleEntry) || receiptKey;
  const saleRows = receiptData.saleRows || [];
  const settlements = receiptData.settlementEntries || [];
  const lineCount = Math.max(saleRows.length, 1);
  const ok = confirm(
    `Delete invoice ${invoiceNumber} (${lineCount} line${lineCount === 1 ? "" : "s"})?\n\n`
    + `Sold quantity will return to stock. This cannot be undone from here (recycle bin).`
  );
  if (!ok) return false;

  const saleSetId = String(meta.saleSetId || "").trim();
  const invoiceKey = String(meta.invoiceNumber || meta.receiptNumber || "").trim();
  // Also sweep any sibling sale/settlement rows that share the same set/invoice.
  const siblings = state.entries.filter(e => {
    if (e.entry_kind === "principal" || !hasGoodsTag(e.notes)) return false;
    const m = goodsMetaFromNotes(e.notes);
    if (saleSetId && String(m.saleSetId || "").trim() === saleSetId) return true;
    if (invoiceKey && (
      String(m.invoiceNumber || "").trim() === invoiceKey
      || String(m.receiptNumber || "").trim() === invoiceKey
    )) return true;
    return false;
  });
  const toRemove = [
    ...settlements,
    ...saleRows.map(r => r.entry).filter(Boolean),
    ...siblings
  ];
  // Ensure primary is included even if matching failed.
  if (!toRemove.some(e => e.id === saleEntry.id)) toRemove.push(saleEntry);
  const unique = [];
  const seen = new Set();
  toRemove.forEach(entry => {
    if (!entry?.id || seen.has(entry.id)) return;
    seen.add(entry.id);
    unique.push(entry);
  });

  unique.forEach(entry => addToRecycleBin(entry));
  unmarkDbSnapshotRows(unique);
  state.entries = state.entries.filter(e => !seen.has(e.id));
  state.inventorySalesLoaded = false;
  state.inventoryLazy.detailLoaded.clear();

  if (!isBackupMode()) {
    await Promise.all(unique.map(entry =>
      persistDeleteEntry(entry, { label: "Delete invoice" }).catch(err => {
        console.error("Invoice delete sync failed.", err);
      })
    ));
  }
  try { await invalidateAndRefreshInventoryLazy(); } catch (_) {}
  try { await loadInventorySalesForCustomers({ force: true }); } catch (_) {}
  if (getActiveTabKey() === "goods") {
    renderInventoryList();
    if (state.inventoryView === "customers") renderInventoryOutstandingSection();
  }
  return true;
}

function ensureInventoryReceiptEditModal(){
  let modal = document.getElementById("inventoryReceiptEditModal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "inventoryReceiptEditModal";
  modal.className = "modal hide";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="modal-backdrop" data-close-receipt-edit="1"></div>
    <div class="modal-dialog compact-entry-dialog inventory-receipt-edit-dialog">
      <div class="modal-head">
        <div>
          <h3>Edit sales invoice</h3>
          <p class="help" id="inventoryReceiptEditHelp">Update customer / payment — all lines on this invoice stay together.</p>
        </div>
        <button class="icon-btn ghost" type="button" data-close-receipt-edit="1" aria-label="Close">×</button>
      </div>
      <div class="modal-body">
        <form id="inventoryReceiptEditForm" class="inventory-draft-form">
          <label class="inventory-edit-field inventory-edit-field-wide">
            <span>Invoice</span>
            <input class="input" id="inventoryReceiptEditInvoice" readonly />
          </label>
          <label class="inventory-edit-field">
            <span>Customer</span>
            <input class="input" id="inventoryReceiptEditCustomer" required autocomplete="name" />
          </label>
          <label class="inventory-edit-field">
            <span>Phone</span>
            <input class="input" id="inventoryReceiptEditPhone" autocomplete="tel" />
          </label>
          <label class="inventory-edit-field">
            <span>Sale date</span>
            <input class="input" id="inventoryReceiptEditDate" type="date" />
          </label>
          <label class="inventory-edit-field">
            <span>Paid amount</span>
            <input class="input" id="inventoryReceiptEditPaid" type="number" min="0" step="0.01" />
          </label>
          <p class="help" id="inventoryReceiptEditLines">—</p>
          <div class="inventory-add-wizard-actions" style="margin-top:8px">
            <button type="button" class="btn ghost" data-close-receipt-edit="1">Cancel</button>
            <button type="submit" class="btn primary">Save invoice</button>
          </div>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelectorAll("[data-close-receipt-edit]").forEach(el => {
    el.addEventListener("click", () => {
      modal.classList.add("hide");
      modal.setAttribute("aria-hidden", "true");
      const stillOpen = document.querySelector(".modal:not(.hide)");
      document.body.style.overflow = stillOpen ? "hidden" : "";
    });
  });
  return modal;
}

function openInventoryReceiptEditor(entryId){
  const saleEntry = state.entries.find(e => e.id === entryId && e.entry_kind !== "principal" && hasGoodsTag(e.notes));
  if (!saleEntry) {
    alert("Invoice not found.");
    return;
  }
  if (!teamCanShowEdit("invoices")) {
    alert("You do not have permission to edit invoices.");
    return;
  }
  const meta = goodsMetaFromNotes(saleEntry.notes);
  const receiptKey = meta.receiptNumber || meta.invoiceNumber || meta.saleSetId || shortId(saleEntry.id);
  const receiptData = getInventoryReceiptData(receiptKey, saleEntry);
  const modal = ensureInventoryReceiptEditModal();
  const form = modal.querySelector("#inventoryReceiptEditForm");
  const invoiceEl = modal.querySelector("#inventoryReceiptEditInvoice");
  const customerEl = modal.querySelector("#inventoryReceiptEditCustomer");
  const phoneEl = modal.querySelector("#inventoryReceiptEditPhone");
  const dateEl = modal.querySelector("#inventoryReceiptEditDate");
  const paidEl = modal.querySelector("#inventoryReceiptEditPaid");
  const linesEl = modal.querySelector("#inventoryReceiptEditLines");
  if (invoiceEl) invoiceEl.value = receiptData.invoiceNumber || receiptKey;
  if (customerEl) customerEl.value = receiptData.customerName || meta.customerName || "Walk-in customer";
  if (phoneEl) phoneEl.value = receiptData.customerPhone || meta.customerPhone || "";
  if (dateEl) dateEl.value = String(saleEntry.action_date || todayISO()).slice(0, 10);
  if (paidEl) paidEl.value = trimInventoryNumber(receiptData.paidTotal || 0);
  if (linesEl) {
    linesEl.textContent = `${receiptData.saleRows.length} line(s) · Total ${formatInventoryTotalsByCurrency(receiptData.totalsByCurrency, "total") || moneyText(receiptData.totalAmount, receiptData.currency)}. PDF keeps every pour as its own row.`;
  }
  form.onsubmit = async e => {
    e.preventDefault();
    const customerName = String(customerEl?.value || "").trim() || "Walk-in customer";
    const phone = String(phoneEl?.value || "").trim();
    const soldDate = String(dateEl?.value || "").trim();
    let paidRemaining = Math.max(0, Number(paidEl?.value || 0));
    if (!soldDate) {
      alert("Sale date is required.");
      return;
    }
    const saleRows = receiptData.saleRows.slice().sort((a, b) =>
      Number(a.entryMeta?.saleLineNo || 0) - Number(b.entryMeta?.saleLineNo || 0)
    );
    for (const row of saleRows) {
      const entry = state.entries.find(e => e.id === row.entry.id);
      if (!entry) continue;
      const lineTotal = Number(row.total || entry.action_amount || 0);
      const linePaid = Math.min(lineTotal, Math.max(paidRemaining, 0));
      paidRemaining = Math.max(paidRemaining - linePaid, 0);
      const lineBalance = Math.max(lineTotal - linePaid, 0);
      const nextMeta = {
        ...goodsMetaFromNotes(entry.notes),
        customerName,
        customerPhone: phone,
        paidAmount: linePaid,
        balanceAmount: lineBalance,
        paymentStatus: lineBalance <= 0.00000001 ? "FULL" : "PARTIAL"
      };
      entry.notes = upsertGoodsMetaInNote(entry.notes, nextMeta);
      entry.action_date = soldDate;
      queueDatabasePatch(entry.id, { notes: entry.notes, action_date: soldDate }, "Invoice edit", entry);
    }
    state.inventorySalesLoaded = false;
    modal.classList.add("hide");
    modal.setAttribute("aria-hidden", "true");
    const stillOpen = document.querySelector(".modal:not(.hide)");
    document.body.style.overflow = stillOpen ? "hidden" : "";
    try { await loadInventorySalesForCustomers({ force: true }); } catch (_) {}
    if (state.inventoryDraft.customerRecordName) {
      openInventoryCustomerModal(state.inventoryDraft.customerRecordName);
    }
    if (state.inventoryActiveSection) {
      try { await renderInventorySectionOverlayBody(state.inventoryActiveSection); } catch (_) {}
    }
    renderInventoryList();
  };
  modal.classList.remove("hide");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  customerEl?.focus();
}

async function fillInventorySectionHistoryPanel(groupId, panel, btn){
  if (!panel) return;
  const previousLabel = btn?.dataset.label || btn?.textContent || "Invoices";
  if (btn) {
    btn.dataset.label = previousLabel;
    btn.disabled = true;
    btn.textContent = "Loading…";
  }
  try {
    if (isInventoryLazyMode()) {
      // Always force so sales invoices appear (summaries alone only show purchases).
      await ensureInventoryItemDetailLoaded(groupId, { force: true });
    } else {
      try { await loadInventorySalesForCustomers({ force: false }); } catch (_) {}
    }
    const group = getGoodsGroups({ applyUiFilters: false }).find(g => String(g.group_id) === String(groupId));
    const tbody = panel.querySelector("tbody");
    if (tbody) {
      tbody.innerHTML = group
        ? inventoryHistoryRowsHtml(group)
        : `<tr><td colspan="8">Item not found.</td></tr>`;
    }
    bindInventorySectionHistoryButtons(panel, state.inventoryActiveSection);
    const count = group ? buildInventoryGroupHistoryRows(group).length : 0;
    panel.classList.remove("hide");
    delete panel.dataset.historyLoaded;
    panel.dataset.historyLoaded = "1";
    if (btn) {
      btn.disabled = false;
      btn.textContent = `Invoices (${count})`;
      btn.setAttribute("aria-expanded", "true");
    }
  } catch (err) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = previousLabel;
    }
    throw err;
  }
}

function ensureInventorySectionModal(){
  let modal = document.getElementById("inventorySectionModal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "inventorySectionModal";
  modal.className = "modal hide";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="modal-backdrop" data-close-modal="inventorySectionModal"></div>
    <div class="modal-dialog inventory-section-modal-dialog">
      <div class="modal-head">
        <div>
          <h3 id="inventorySectionModalTitle">Section</h3>
          <p class="help" id="inventorySectionModalDesc">Full item list for this section.</p>
        </div>
        <button class="icon-btn ghost" type="button" data-close-modal="inventorySectionModal" aria-label="Close">×</button>
      </div>
      <div class="modal-body inventory-section-modal-body" id="inventorySectionModalBody"></div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelectorAll("[data-close-modal]").forEach(el => {
    el.addEventListener("click", e => {
      e.preventDefault();
      closeModal(el.dataset.closeModal || "inventorySectionModal");
    });
  });
  modal.addEventListener("click", e => {
    if (e.target && e.target.matches(".modal-backdrop")) closeModal("inventorySectionModal");
  });
  return modal;
}

function closeInventorySectionModal(){
  state.inventoryActiveSection = "";
  state.inventoryActiveBrand = "";
  state.inventoryActiveProductLine = "";
  closeModal("inventorySectionModal");
}

function ensureInventoryCategoryBuilderModal(){
  let modal = document.getElementById("inventoryCategoryBuilderModal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "inventoryCategoryBuilderModal";
  modal.className = "modal hide";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="modal-backdrop" data-close-modal="inventoryCategoryBuilderModal"></div>
    <div class="modal-dialog inventory-category-builder-modal-dialog">
      <div class="modal-head">
        <div>
          <h3 id="inventoryCategoryBuilderTitle">Category</h3>
          <p class="help" id="inventoryCategoryBuilderDesc">Set brand / author structure and related options.</p>
        </div>
        <button class="icon-btn ghost" type="button" data-close-modal="inventoryCategoryBuilderModal" aria-label="Close">×</button>
      </div>
      <div class="modal-body inventory-category-builder-modal-body" id="inventoryCategoryBuilderBody"></div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelectorAll("[data-close-modal]").forEach(el => {
    el.addEventListener("click", e => {
      e.preventDefault();
      closeModal(el.dataset.closeModal || "inventoryCategoryBuilderModal");
    });
  });
  modal.addEventListener("click", e => {
    if (e.target && e.target.matches(".modal-backdrop")) closeModal("inventoryCategoryBuilderModal");
  });
  return modal;
}

function openInventoryCategoryBuilderOverlay({ mode = "create", categoryName = "", categoryId = "", cfg = null } = {}){
  ensureInventoryCategoryBuilderModal();
  const modal = document.getElementById("inventoryCategoryBuilderModal");
  const title = document.getElementById("inventoryCategoryBuilderTitle");
  const desc = document.getElementById("inventoryCategoryBuilderDesc");
  const body = document.getElementById("inventoryCategoryBuilderBody");
  if (!modal || !body) return;

  const isEdit = mode === "edit";
  const defaults = cfg || (typeof getCategoryConfig === "function"
    ? getCategoryConfig(isEdit ? categoryName : "General")
    : { usesBrands: true, usesProductLines: true, usesVariants: true, usesSubBrands: true, qtyPattern: "count", primaryLabel: "Brand", subBrandLabel: "Sub-brand", productLineLabel: "Type", variantLabelName: "Variant" });

  if (title) title.textContent = isEdit ? "Edit category" : "Add category";
  if (desc) {
    desc.textContent = isEdit
      ? "Update category labels, brand/author structure, and display options."
      : "Create a category grid and configure brand/author or other settings.";
  }

  body.innerHTML = typeof categoryBuilderFormHtml === "function"
    ? categoryBuilderFormHtml(isEdit ? defaults : {
        name: "",
        usesBrands: true,
        usesSubBrands: true,
        usesProductLines: true,
        usesVariants: true,
        qtyPattern: "count",
        primaryLabel: defaults.primaryLabel || "Brand",
        subBrandLabel: defaults.subBrandLabel || "Sub-brand",
        productLineLabel: defaults.productLineLabel || "Type",
        variantLabelName: defaults.variantLabelName || "Variant",
        hint: "Brand → Type → Variant"
      }, {
        idPrefix: isEdit ? "inventoryEditCategory" : "inventoryNewCategory",
        title: isEdit ? "Edit category" : "New category",
        badge: isEdit ? "Edit" : "Setup",
        actionsHtml: `
          <div class="inventory-section-card-actions" style="margin-top:12px">
            <button type="button" class="tiny primary" id="inventoryCategoryBuilderSaveBtn">${isEdit ? "Save changes" : "Save category"}</button>
            <button type="button" class="tiny ghost" id="inventoryCategoryBuilderCancelBtn">Cancel</button>
          </div>`
      })
    : `<p class="help">Category builder unavailable.</p>`;

  const builder = body.querySelector("[data-cat-builder]");
  if (builder && typeof bindCategoryBuilderPreview === "function") bindCategoryBuilderPreview(builder);
  const input = body.querySelector('[data-cat-field="name"]') || body.querySelector("#inventoryNewCategoryNameInput");

  body.querySelector("#inventoryCategoryBuilderCancelBtn")?.addEventListener("click", e => {
    e.preventDefault();
    closeModal("inventoryCategoryBuilderModal");
  });

  body.querySelector("#inventoryCategoryBuilderSaveBtn")?.addEventListener("click", async e => {
    e.preventDefault();
    const saveBtn = body.querySelector("#inventoryCategoryBuilderSaveBtn");
    const data = typeof readCategoryBuilderForm === "function" && builder
      ? readCategoryBuilderForm(builder)
      : { name: String(input?.value || "").replace(/\s+/g, " ").trim() };
    const cleaned = String(data?.name || "").replace(/\s+/g, " ").trim();
    if (!cleaned) {
      alert("Enter a category name.");
      input?.focus();
      return;
    }
    if (saveBtn) saveBtn.disabled = true;
    try {
      if (isEdit) {
        if (typeof renameCategoryInline !== "function") throw new Error("Catalog helper missing.");
        const oldName = categoryName;
        const renamed = await renameCategoryInline({
          categoryId,
          previousName: oldName,
          name: cleaned,
          qtyPattern: data.qtyPattern,
          usesBrands: data.usesBrands,
          usesProductLines: data.usesProductLines,
          usesVariants: data.usesVariants,
          usesSubBrands: data.usesSubBrands,
          hint: data.hint,
          sortOrder: defaults.sortOrder,
          primaryLabel: data.primaryLabel,
          primaryPlural: data.primaryPlural,
          subBrandLabel: data.subBrandLabel,
          productLineLabel: data.productLineLabel,
          productLinePlural: data.productLinePlural,
          variantLabelName: data.variantLabelName,
          variantPlural: data.variantPlural,
          examples: data.examples,
          breadcrumb: data.breadcrumb
        });
        if (cleaned !== oldName) {
          const oldSlug = String(defaults.slug || (typeof inventoryCategorySlugify === "function" ? inventoryCategorySlugify(oldName) : "") || "").trim();
          const newSlug = String(
            renamed?.slug
            || (typeof inventoryCategorySlugify === "function" ? inventoryCategorySlugify(cleaned) : "")
            || ""
          ).trim();
          const oldTypeKey = normalizeInventoryItemType(oldName).toLowerCase();
          syncInventoryCatalogMetaOnEntries(
            meta => {
              const typeKey = normalizeInventoryItemType(meta.itemType).toLowerCase();
              const slugKey = String(meta.categorySlug || "").trim().toLowerCase();
              return typeKey === oldTypeKey
                || (oldSlug && slugKey === oldSlug.toLowerCase());
            },
            {
              itemType: cleaned,
              ...(newSlug ? { categorySlug: newSlug } : {})
            }
          );
          if (Array.isArray(state.inventoryBrands)) {
            for (const brand of state.inventoryBrands) {
              if (!brand) continue;
              if (normalizeInventoryItemType(brand.item_type).toLowerCase() === oldTypeKey) {
                brand.item_type = cleaned;
              }
            }
          }
          if (normalizeInventoryItemType(state.inventoryActiveSection || "").toLowerCase() === oldTypeKey) {
            state.inventoryActiveSection = cleaned;
          }
        }
        closeModal("inventoryCategoryBuilderModal");
        state.inventoryLazy.detailLoaded.clear();
        renderInventoryList();
        if (state.inventoryActiveSection) {
          try { await renderInventorySectionOverlayBody(state.inventoryActiveSection); } catch (_) {}
        }
        invalidateAndRefreshInventoryLazy().then(() => {
          renderInventoryList();
          if (state.inventoryActiveSection) {
            renderInventorySectionOverlayBody(state.inventoryActiveSection).catch(() => {});
          }
        }).catch(() => {});
      } else {
        if (typeof addCustomCategory !== "function") throw new Error("Catalog helper missing.");
        await addCustomCategory(cleaned, data || {});
        try { if (typeof ensureCustomCategoriesHydrated === "function") ensureCustomCategoriesHydrated(); } catch (_) {}
        closeModal("inventoryCategoryBuilderModal");
        renderInventoryList();
        Promise.resolve(
          typeof loadInventoryCategories === "function" ? loadInventoryCategories(true) : null
        ).then(() => {
          if (typeof renderInventoryList === "function") renderInventoryList();
        }).catch(() => {});
      }
    } catch (err) {
      alert(err?.message || (isEdit ? "Could not save category." : "Could not create category."));
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  });

  modal?.classList.remove("hide");
  modal?.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  setTimeout(() => input?.focus(), 40);
}

function inventoryBrandKey(brand){
  return String(brand || "").trim().toLowerCase() || "__unbranded__";
}

function collectInventoryGroupIdsMatching(predicate){
  const gids = new Set();
  for (const entry of state.entries) {
    if (!entryBelongsToLedgerScope(entry, LEDGER_SCOPE_GOODS) || !hasGoodsTag(entry.notes)) continue;
    const meta = goodsMetaFromNotes(entry.notes);
    if (predicate(entry, meta)) gids.add(String(entry.group_id || ""));
  }
  return [...gids].filter(Boolean);
}

function snapshotInventoryGroupsByIds(groupIds){
  const ids = (Array.isArray(groupIds) ? groupIds : []).filter(Boolean);
  return ids.map(gid => ({
    gid: String(gid),
    entries: state.entries.filter(e => String(e.group_id) === String(gid))
  }));
}

async function softDeleteInventoryGroupSnapshots(snapshots, label = "Inventory cascade delete"){
  for (const row of (Array.isArray(snapshots) ? snapshots : [])) {
    if (!row?.gid) continue;
    try {
      await persistDeleteGroup(row.gid, { entries: row.entries || [], label });
    } catch (err) {
      console.warn(`${label}: failed for group ${row.gid}`, err);
    }
  }
}

/** Physically remove stock/sales/events for groups — no soft-deleted leftovers. */
async function hardDeleteInventoryGroupSnapshots(snapshots, label = "Inventory hard delete"){
  for (const row of (Array.isArray(snapshots) ? snapshots : [])) {
    if (!row?.gid) continue;
    try {
      if (window.DomainLedger?.hardDeleteDomainByGroupId) {
        await DomainLedger.hardDeleteDomainByGroupId(row.gid);
      }
    } catch (err) {
      console.warn(`${label}: domain hard-delete failed for ${row.gid}`, err);
    }
    try {
      if (typeof supabase === "function" && typeof CONFIG !== "undefined") {
        await supabase(
          `${CONFIG.table}?group_id=eq.${encodeURIComponent(row.gid)}${typeof ownerIdQuery === "function" ? ownerIdQuery() : ""}`,
          { method: "DELETE" }
        );
      }
    } catch (err) {
      console.warn(`${label}: ledger hard-delete failed for ${row.gid}`, err);
    }
  }
}

async function purgeInventoryEntriesForBrand(brandName, brandId = ""){
  const key = inventoryBrandKey(brandName);
  const gids = collectInventoryGroupIdsMatching((entry, meta) =>
    (brandId && String(meta.brandId || "") === String(brandId))
    || inventoryBrandKey(meta.brand) === key
  );
  const snapshots = snapshotInventoryGroupsByIds(gids);
  const idSet = new Set(gids.map(String));
  state.entries = state.entries.filter(e => !idSet.has(String(e.group_id || "")));
  // RPC 057 cascades server-side; this also covers pre-057 DBs via domain/ledger soft-delete.
  await softDeleteInventoryGroupSnapshots(snapshots, "Brand delete");
}

async function purgeInventoryEntriesForProductLine(lineName, lineId = "", brandName = ""){
  const lineKey = String(lineName || "").trim().toLowerCase();
  const brandKey = inventoryBrandKey(brandName);
  const gids = collectInventoryGroupIdsMatching((entry, meta) => {
    if (lineId && String(meta.productLineId || "") === String(lineId)) return true;
    if (String(meta.productLine || "").trim().toLowerCase() !== lineKey) return false;
    if (!brandName) return true;
    return inventoryBrandKey(meta.brand) === brandKey;
  });
  const snapshots = snapshotInventoryGroupsByIds(gids);
  const idSet = new Set(gids.map(String));
  state.entries = state.entries.filter(e => !idSet.has(String(e.group_id || "")));
  await softDeleteInventoryGroupSnapshots(snapshots, "Product line delete");
}

async function purgeInventoryEntriesForCategory(categoryName){
  const typeKey = normalizeInventoryItemType(categoryName).toLowerCase();
  const cfg = typeof getCategoryConfig === "function" ? getCategoryConfig(categoryName) : null;
  const slugKey = String(cfg?.slug || "").trim().toLowerCase();
  const brandIdsToDrop = new Set();
  if (Array.isArray(state.inventoryBrands)) {
    for (const brand of state.inventoryBrands) {
      const bt = normalizeInventoryItemType(brand?.item_type || "").toLowerCase();
      if (bt === typeKey || (slugKey && bt === slugKey)) {
        if (brand?.id) brandIdsToDrop.add(String(brand.id));
      }
    }
  }
  const gids = collectInventoryGroupIdsMatching((entry, meta) => {
    const typeOk = normalizeInventoryItemType(meta.itemType || "").toLowerCase() === typeKey
      || (slugKey && normalizeInventoryItemType(meta.itemType || "").toLowerCase() === slugKey);
    const slugOk = slugKey && String(meta.categorySlug || "").trim().toLowerCase() === slugKey;
    const brandOk = meta.brandId && brandIdsToDrop.has(String(meta.brandId));
    return typeOk || slugOk || brandOk;
  });
  for (const entry of state.entries) {
    if (!gids.includes(String(entry.group_id || ""))) continue;
    const meta = goodsMetaFromNotes(entry.notes);
    if (meta.brandId) brandIdsToDrop.add(String(meta.brandId));
  }
  const snapshots = snapshotInventoryGroupsByIds(gids);
  const idSet = new Set(gids.map(String));
  state.entries = state.entries.filter(e => !idSet.has(String(e.group_id || "")));
  // Hard purge — no soft-deleted inventory rows left in domain/ledger.
  await hardDeleteInventoryGroupSnapshots(snapshots, "Category delete");
  if (Array.isArray(state.inventoryCustomCategories)) {
    state.inventoryCustomCategories = state.inventoryCustomCategories.filter(c =>
      normalizeInventoryItemType(c.name).toLowerCase() !== typeKey
      && String(c.slug || "").toLowerCase() !== slugKey
    );
    if (typeof writeStoredCustomCategories === "function") {
      try { writeStoredCustomCategories(state.inventoryCustomCategories); } catch (_) {}
    } else {
      try {
        localStorage.setItem(
          "triplem-inventory-custom-categories-v1",
          JSON.stringify(state.inventoryCustomCategories)
        );
      } catch (_) {}
    }
  }
  if (Array.isArray(state.inventoryCategories)) {
    state.inventoryCategories = state.inventoryCategories.filter(c =>
      normalizeInventoryItemType(c.name).toLowerCase() !== typeKey
      && String(c.slug || "").toLowerCase() !== slugKey
    );
  }
  // Drop cached brands / lines / variants that belonged to this category so recreate starts empty.
  if (Array.isArray(state.inventoryBrands)) {
    state.inventoryBrands = state.inventoryBrands.filter(b => {
      if (b?.id && brandIdsToDrop.has(String(b.id))) return false;
      const bt = normalizeInventoryItemType(b?.item_type || "").toLowerCase();
      if (bt === typeKey || (slugKey && bt === slugKey)) return false;
      return true;
    });
  }
  state.inventoryBrandsLoaded = false;
  state.inventoryAddWizard = null;
  state.inventoryActiveSection = "";
  state.inventoryActiveBrand = "";
  state.inventoryActiveSubBrand = "";
  state.inventoryActiveSubBrandId = "";
  state.inventoryActiveProductLine = "";
}

function getInventorySectionBrandGroups(items){
  if (typeof groupItemsByBrand === "function") return groupItemsByBrand(items);
  const map = new Map();
  for (const item of items) {
    const brand = String(item.brand || "").trim() || "Unbranded";
    const key = inventoryBrandKey(brand);
    if (!map.has(key)) map.set(key, { key, brand, items: [], inStock: false });
    const row = map.get(key);
    row.items.push(item);
    if (Number(item.remainingQty || 0) > 0.00000001) row.inStock = true;
  }
  return [...map.values()]
    .map(row => ({
      ...row,
      items: sortInventorySectionItems(row.items),
      variantCount: row.items.length,
      stockLabel: inventoryQtySummary(row.items, "remainingQty")
    }))
    .sort((a, b) => a.brand.localeCompare(b.brand, undefined, { sensitivity: "base" }));
}

function inventoryVariantDisplayName(group){
  return String(group.variantLabel || "").trim()
    || String(group.itemCode || "").trim()
    || String(group.person_name || "").trim()
    || "Variant";
}

async function openInventorySectionOverlay(sectionType, { focusSell = false, brand = "", productLine = "", subBrand = "", subBrandId = "" } = {}){
  const type = normalizeInventoryItemType(sectionType);
  state.inventoryActiveSection = type;
  state.inventoryActiveBrand = brand ? String(brand) : "";
  state.inventoryActiveSubBrand = subBrand ? String(subBrand) : "";
  state.inventoryActiveSubBrandId = subBrandId ? String(subBrandId) : "";
  state.inventoryActiveProductLine = productLine ? String(productLine) : "";
  ensureInventorySectionModal();
  const modal = document.getElementById("inventorySectionModal");
  const title = document.getElementById("inventorySectionModalTitle");
  const desc = document.getElementById("inventorySectionModalDesc");
  const body = document.getElementById("inventorySectionModalBody");
  if (title) title.textContent = type;
  {
    const tax = typeof getCategoryTaxonomyLabels === "function"
      ? getCategoryTaxonomyLabels(type)
      : { breadcrumb: "Brand → Type → Variant" };
    if (desc) desc.textContent = `Category → ${tax.breadcrumb}`;
  }
  if (body) body.innerHTML = `<div class="empty inventory-loading-hint">Loading ${escapeHtml(type)}…</div>`;
  modal?.classList.remove("hide");
  modal?.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  try { if (typeof loadInventoryCategories === "function") await loadInventoryCategories(false); } catch (_) {}
  await renderInventorySectionOverlayBody(type);
  if (focusSell) {
    // Always open cart for this section (even when empty) so grid Cart can add items.
    if (typeof openSaleDraftModal === "function") openSaleDraftModal();
    if (typeof openSaleDraftAddItemsPicker === "function") {
      openSaleDraftAddItemsPicker({ itemType: type });
    }
  }
}

function updateInventorySkuAddButton(btn, groupId){
  if (!btn) return;
  const inDraft = getSaleDraftQtyForGroup(groupId);
  btn.innerHTML = `<i class="fa-solid fa-cart-plus"></i> Cart${inDraft ? ` · ${escapeHtml(trimInventoryNumber(inDraft, 3))}` : ""}`;
}

function bindInventorySectionVariantActions(body, type){
  body.querySelectorAll(".inventorySkuSellBtn").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.preventDefault();
      e.stopPropagation();
      if (btn.dataset.adding === "1" || btn.disabled) return;
      btn.dataset.adding = "1";
      btn.disabled = true;
      try {
        const ok = await addGroupToSaleDraft(btn.dataset.groupId);
        if (ok) updateInventorySkuAddButton(btn, btn.dataset.groupId);
      } finally {
        delete btn.dataset.adding;
        btn.disabled = false;
      }
    });
  });
  body.querySelectorAll(".inventorySkuRestockBtn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      openGoodsModal("bought", { groupId: btn.dataset.groupId, restockOnly: true });
    });
  });
  body.querySelectorAll(".inventorySkuHistoryBtn").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.preventDefault();
      e.stopPropagation();
      const gid = btn.dataset.groupId;
      const panel = body.querySelector(`[data-history-for="${gid}"]`);
      if (!panel) return;
      const willOpen = panel.classList.contains("hide");
      if (!willOpen) {
        panel.classList.add("hide");
        btn.setAttribute("aria-expanded", "false");
        return;
      }
      body.querySelectorAll(".inventory-section-item-history:not(.hide)").forEach(openPanel => {
        if (openPanel !== panel) openPanel.classList.add("hide");
      });
      body.querySelectorAll(".inventorySkuHistoryBtn[aria-expanded='true']").forEach(openBtn => {
        if (openBtn !== btn) openBtn.setAttribute("aria-expanded", "false");
      });
      try {
        // Always reload so newly finalized sales appear next to purchases.
        await fillInventorySectionHistoryPanel(gid, panel, btn);
      } catch (err) {
        alert(err?.message || "Could not load invoices.");
      }
    });
  });
  body.querySelectorAll(".sectionSkuActionBtn").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.preventDefault();
      e.stopPropagation();
      const action = btn.dataset.action;
      if (action === "details") openInventoryItemDetailsOverlay(btn.dataset.groupId);
      if (action === "pdf") await downloadGoodsItemPDF(btn.dataset.groupId);
      if (action === "restock") openGoodsModal("bought", { groupId: btn.dataset.groupId, restockOnly: true });
      if (action === "add-related") {
        if (typeof openInventoryAddItemWizard === "function") {
          openInventoryAddItemWizard({
            seedType: type,
            brand: state.inventoryActiveBrand,
            productLine: state.inventoryActiveProductLine
          });
        } else {
          openGoodsModal("bought", { seedFromGroupId: btn.dataset.groupId, addBrand: true });
        }
      }
      if (action === "edit-bought") openEditModal(btn.dataset.entryId);
      if (action === "rename-variant") {
        const list = body.querySelector(".inventory-variant-list") || body;
        openInventoryInlineRename(list, {
          placeholder: "Size / variant name",
          kind: "variant-rename",
          value: btn.dataset.variantLabel || "",
          onSave: async (label) => {
            if (typeof renameVariantInline !== "function") throw new Error("Catalog helper missing.");
            const variantId = btn.dataset.variantId || "";
            await renameVariantInline({
              variantId,
              brandName: state.inventoryActiveBrand,
              categoryName: type,
              productLineName: state.inventoryActiveProductLine,
              variantLabel: label,
              qtyPattern: (typeof getCategoryConfig === "function" ? getCategoryConfig(type)?.qtyPattern : "count") || "count"
            });
            syncInventoryCatalogMetaOnEntries(
              meta => String(meta.variantId || "") === String(variantId),
              { variantLabel: label }
            );
            await renderInventorySectionOverlayBody(type);
            renderInventoryList();
          }
        });
      }
      if (action === "delete-item") {
        await deleteEntry(btn.dataset.entryId);
        await renderInventorySectionOverlayBody(type);
        renderInventoryList();
      }
    });
  });
  body.querySelectorAll("[data-section-sku-menu]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      const key = btn.dataset.sectionSkuMenu;
      const panel = body.querySelector(`[data-section-sku-menu-panel="${key}"]`);
      if (!panel) return;
      document.querySelectorAll(".menu-dropdown.open").forEach(openPanel => {
        if (openPanel !== panel) openPanel.classList.remove("open");
      });
      const nowOpen = panel.classList.toggle("open");
      btn.setAttribute("aria-expanded", nowOpen ? "true" : "false");
      if (nowOpen) {
        const rect = btn.getBoundingClientRect();
        const panelWidth = Math.min(panel.offsetWidth || 180, window.innerWidth - 20);
        const left = Math.min(
          Math.max(10, rect.right - panelWidth),
          window.innerWidth - panelWidth - 10
        );
        const top = Math.min(rect.bottom + 6, window.innerHeight - 12);
        panel.style.position = "fixed";
        panel.style.top = `${top}px`;
        panel.style.left = `${left}px`;
        panel.style.right = "auto";
        panel.style.zIndex = "13000";
      }
    });
  });
}

function inventoryGroupBottlePriceDisplay(group){
  const category = resolveInventoryItemCategory(group);
  const sellPerBase = Number(group.defaultUnitSoldPrice || 0);
  const costPerBase = Number(group.unitActualPrice || 0);
  if (category === INVENTORY_CATEGORY_VOLUME) {
    return {
      sellLabel: "Sell/ml",
      costLabel: "Cost/ml",
      sell: sellPerBase > 0 ? sellPerBase / 1000 : 0,
      cost: costPerBase > 0 ? costPerBase / 1000 : 0
    };
  }
  return {
    sellLabel: "Sell",
    costLabel: "Cost",
    sell: sellPerBase,
    cost: costPerBase
  };
}

function renderInventoryVariantRowsHtml(items){
  return items.map((group, index) => {
    const inDraft = getSaleDraftQtyForGroup(group.group_id);
    const inStock = group.remainingQty > 0.00000001;
    const statusClass = inStock ? "orange" : "green";
    const name = inventoryVariantDisplayName(group);
    const category = resolveInventoryItemCategory(group);
    const prices = inventoryGroupBottlePriceDisplay(group);
    const fullName = String(group.person_name || "").trim();
    const showFullName = fullName && fullName.toLowerCase() !== String(name || "").trim().toLowerCase();
    return `
      <article class="inventory-variant-row ${inStock ? "" : "is-empty"}" data-sku-group="${escapeHtml(group.group_id)}">
        <div class="inventory-variant-main">
          <div class="inventory-variant-identity">
            <span class="inventory-section-item-index" aria-hidden="true">${index + 1}</span>
            <div class="inventory-variant-identity-text">
              <strong title="${escapeHtml(name)}">${escapeHtml(name)}</strong>
              <div class="inventory-section-item-sub">
                ${group.itemCode ? `<span class="badge inventory-code-badge">${escapeHtml(group.itemCode)}</span>` : ""}
                ${showFullName ? `<span class="inventory-variant-fullname-name">${escapeHtml(fullName)}</span>` : ""}
              </div>
            </div>
          </div>
          <div class="inventory-variant-metrics" aria-label="Stock and prices">
            <div><small>Stock</small><strong class="badge ${statusClass}">${escapeHtml(inventoryQtyLabel(group.remainingQty, category, group))}</strong></div>
            <div><small>${escapeHtml(prices.costLabel)}</small><strong>${money(prices.cost || 0, group.currency)}</strong></div>
            <div><small>${escapeHtml(prices.sellLabel)}</small><strong>${money(prices.sell || 0, group.currency)}</strong></div>
          </div>
          <div class="inventory-variant-actions">
            <button type="button" class="btn soft tiny inventorySkuSellBtn" data-group-id="${escapeHtml(group.group_id)}" ${inStock ? "" : "disabled"} title="Add to cart">
              <i class="fa-solid fa-cart-plus" aria-hidden="true"></i><span>Cart${inDraft ? ` · ${escapeHtml(trimInventoryNumber(inDraft, 3))}` : ""}</span>
            </button>
            <button type="button" class="tiny ghost inventorySkuRestockBtn" data-group-id="${escapeHtml(group.group_id)}">Restock</button>
            <button type="button" class="tiny ghost inventorySkuHistoryBtn" data-group-id="${escapeHtml(group.group_id)}" aria-expanded="false">Invoices</button>
            <div class="menu-wrap">
              <button class="icon-btn ghost menu-trigger" type="button" data-section-sku-menu="${escapeHtml(group.group_id)}" aria-label="More">☰</button>
              <div class="menu-dropdown" data-section-sku-menu-panel="${escapeHtml(group.group_id)}">
                <button class="menu-item sectionSkuActionBtn" type="button" data-action="details" data-group-id="${escapeHtml(group.group_id)}">Details</button>
                <button class="menu-item inventorySkuRestockBtn inventory-menu-restock" type="button" data-group-id="${escapeHtml(group.group_id)}">Restock</button>
                <button class="menu-item inventorySkuHistoryBtn inventory-menu-history" type="button" data-group-id="${escapeHtml(group.group_id)}" aria-expanded="false">Invoices</button>
                <button class="menu-item sectionSkuActionBtn" type="button" data-action="pdf" data-group-id="${escapeHtml(group.group_id)}">Item PDF</button>
                <button class="menu-item sectionSkuActionBtn" type="button" data-action="add-related" data-group-id="${escapeHtml(group.group_id)}">Add related</button>
                ${group.variantId && teamCanShowEdit("invoices") ? `<button class="menu-item sectionSkuActionBtn" type="button" data-action="rename-variant" data-variant-id="${escapeHtml(group.variantId || "")}" data-variant-label="${escapeHtml(group.variantLabel || "")}" data-group-id="${escapeHtml(group.group_id)}">Rename size</button>` : ""}
                ${teamCanShowEdit("invoices") ? `<button class="menu-item sectionSkuActionBtn" type="button" data-action="edit-bought" data-entry-id="${escapeHtml(group.principal?.id || "")}">Edit item</button>` : ""}
                ${teamCanShowDelete("invoices") ? `<button class="menu-item danger sectionSkuActionBtn" type="button" data-action="delete-item" data-entry-id="${escapeHtml(group.principal?.id || "")}">Delete item</button>` : ""}
              </div>
            </div>
          </div>
        </div>
        <div class="inventory-section-item-history hide" data-history-for="${escapeHtml(group.group_id)}" data-history-loaded="0">
          <div class="table-wrap inventory-history-table-wrap">
            <table>
              <thead><tr><th>Type</th><th>Date</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Payment</th><th>Notes</th><th>Action</th></tr></thead>
              <tbody><tr><td colspan="8">Loading…</td></tr></tbody>
            </table>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function resolveCatalogVariantQtyPattern(row, itemType = "", fallback = "count"){
  const variant = row?.catalogVariant || row || {};
  const label = String(row?.label || variant.label || "").trim();
  const normalizedFallback = normalizeInventoryCategory(
    variant.item_category || variant.itemCategory || fallback
  );
  if (typeof parseInventorySizeHint === "function" && parseInventorySizeHint(label)) {
    return INVENTORY_CATEGORY_VOLUME;
  }
  if (/\b\d+(?:\.\d+)?\s*(?:kg|g|gram|grams)\b/i.test(label)) {
    return INVENTORY_CATEGORY_WEIGHT;
  }
  if (/\b\d+(?:\.\d+)?\s*(?:m|meter|metre|cm)\b/i.test(label)) {
    return INVENTORY_CATEGORY_LENGTH;
  }
  if (typeof resolveInventoryItemCategory === "function") {
    return resolveInventoryItemCategory({
      itemCategory: variant.item_category || variant.itemCategory || normalizedFallback,
      itemType,
      variantLabel: label
    }, normalizedFallback);
  }
  return normalizedFallback;
}

function renderInventoryCatalogVariantRowsHtml(catalogRows = [], { menuKind = "variant", itemType = "", qtyPattern = "count" } = {}){
  return catalogRows.map((row, index) => {
    const menuKey = `catalog-variant-${row.variantId || row.label || index}`;
    const rowQtyPattern = resolveCatalogVariantQtyPattern(row, itemType, qtyPattern);
    return `
    <article class="inventory-variant-row is-empty is-catalog-only"
      data-catalog-kind="${escapeHtml(menuKind)}"
      data-catalog-variant="${escapeHtml(row.variantId || row.label)}"
      data-variant-id="${escapeHtml(row.variantId || "")}"
      data-variant-label="${escapeHtml(row.label || "")}">
      <div class="inventory-variant-main">
        <div class="inventory-variant-identity">
          <span class="inventory-section-item-index">#${index + 1}</span>
          <div>
            <strong>${escapeHtml(row.label)}</strong>
            <div class="inventory-section-item-sub"><span>No stock yet</span></div>
          </div>
        </div>
        <div class="inventory-variant-actions">
          <button type="button" class="btn soft tiny inventoryCatalogAddStockBtn"
            data-variant-label="${escapeHtml(row.label)}"
            data-variant-id="${escapeHtml(row.variantId || "")}"
            data-variant-qty-pattern="${escapeHtml(rowQtyPattern)}">
            <i class="fa-solid fa-plus"></i> Stock
          </button>
          ${row.variantId ? inventoryCatalogRowMenuHtml(menuKey, { editLabel: "Edit", deleteLabel: "Delete" }) : ""}
        </div>
      </div>
      <div class="inventory-inline-stock hide" data-inline-stock-for="${escapeHtml(row.variantId || row.label)}"></div>
    </article>`;
  }).join("");
}

function inventoryInlineStockFormHtml(qtyPattern = "count", {
  qty = "",
  unit = "",
  sizeLocked = false,
  sizeLabel = "",
  bottles = "1",
  priceUnit = "",
  sellBy = "volume",
  categorySlug = "",
  categoryName = "",
  unitCost = "",
  unitSell = "",
  currency = state.lastCurrency || "AED"
} = {}){
  const pattern = normalizeInventoryCategory(qtyPattern || "count");
  const defaultUnit = inventoryBaseUnitForCategory(pattern);
  const selectedPriceUnit = priceUnit
    || unit
    || (pattern === INVENTORY_CATEGORY_VOLUME ? INVENTORY_UNIT_ML : defaultUnit);
  const qtyValue = qty !== "" && qty != null
    ? String(qty)
    : (pattern === "count" ? "1" : "");
  const defaultSellBy = typeof defaultInventorySellBy === "function"
    ? defaultInventorySellBy({ categorySlug, categoryName, qtyPattern: pattern })
    : "volume";
  const resolvedSellBy = pattern === INVENTORY_CATEGORY_VOLUME
    ? normalizeInventorySellBy(sellBy || "", defaultSellBy)
    : "volume";
  const useBottleCost = pattern === INVENTORY_CATEGORY_VOLUME
    && (sizeLocked || resolvedSellBy === "bottle");
  const bottleLabels = pattern === INVENTORY_CATEGORY_VOLUME
    ? (useBottleCost ? inventoryVolumeBottleCostLabels() : inventoryVolumeBottleLabels(qtyValue || 100, selectedPriceUnit))
    : null;
  const costLabel = bottleLabels?.cost || "Cost";
  const sellLabel = useBottleCost ? "Bottle sell" : (bottleLabels?.sell || "Sell");
  const unitOptions = inventoryUnitSelectOptionsHtml(pattern, selectedPriceUnit);
  const measureAsHtml = `
    <div class="inventory-inline-stock-field inventory-inline-stock-measure" style="grid-column:1/-1">
      <span>Measure as</span>
      <div class="inventory-add-branch-grid inventory-inline-measure-cards" style="margin-top:4px">
        ${[
          [INVENTORY_CATEGORY_COUNT, "Pcs", "Whole pieces"],
          [INVENTORY_CATEGORY_WEIGHT, "Weight", "kg / g"],
          [INVENTORY_CATEGORY_LENGTH, "Length", "m / cm"],
          [INVENTORY_CATEGORY_VOLUME, "Volume", "L / ml"]
        ].map(([value, title, detail]) => `
          <button type="button" class="inventory-add-category-card ${pattern === value ? "is-selected" : ""}" data-inline-qty-pattern="${escapeHtml(value)}">
            <strong>${escapeHtml(title)}</strong>
            <span>${escapeHtml(detail)}</span>
          </button>
        `).join("")}
      </div>
    </div>`;
  const sellByHtml = pattern === INVENTORY_CATEGORY_VOLUME
    ? `<div class="inventory-inline-stock-field inventory-inline-stock-sellby" style="grid-column:1/-1">
        <span>How will you sell this?</span>
        <div class="inventory-add-branch-grid inventory-inline-sellby-cards" style="margin-top:4px">
          <button type="button" class="inventory-add-category-card ${resolvedSellBy === "volume" ? "is-selected" : ""}" data-inline-sell-by="volume">
            <strong>By volume</strong>
            <span>Pour / measure</span>
          </button>
          <button type="button" class="inventory-add-category-card ${resolvedSellBy === "bottle" ? "is-selected" : ""}" data-inline-sell-by="bottle">
            <strong>By bottle</strong>
            <span>Whole bottles only</span>
          </button>
        </div>
      </div>`
    : "";
  const showBottles = pattern === INVENTORY_CATEGORY_VOLUME && (sizeLocked || resolvedSellBy === "bottle");
  const sizeLockedHtml = showBottles
    ? `${sizeLocked
        ? `<input type="hidden" class="inventory-inline-stock-qty" value="${escapeHtml(qtyValue)}" />
          <input type="hidden" class="inventory-inline-stock-size-unit" value="${escapeHtml(unit || INVENTORY_UNIT_ML)}" />`
        : `<label class="inventory-inline-stock-field">
            <span class="inventory-inline-stock-qty-label">Bottle size</span>
            <input class="input inventory-inline-stock-qty" type="number" min="0.001" step="any" value="${escapeHtml(qtyValue)}" inputmode="decimal" />
          </label>
          <label class="inventory-inline-stock-field">
            <span>Size unit</span>
            <select class="select inventory-inline-stock-size-unit">${inventoryUnitSelectOptionsHtml(INVENTORY_CATEGORY_VOLUME, unit || INVENTORY_UNIT_ML)}</select>
          </label>`}
      <label class="inventory-inline-stock-field">
        <span>Bottles <em class="optional-label">${escapeHtml(sizeLabel || `${qtyValue} ${unit || "ml"}`)}</em></span>
        <input class="input inventory-inline-stock-bottles" type="number" min="1" step="1" value="${escapeHtml(String(bottles || "1"))}" inputmode="numeric" />
      </label>`
    : `<label class="inventory-inline-stock-field">
        <span class="inventory-inline-stock-qty-label">${escapeHtml(
          bottleLabels?.qty
          || (pattern === INVENTORY_CATEGORY_VOLUME
            ? "Bottle size"
            : pattern === "weight"
              ? "Weight"
              : pattern === "length"
                ? "Length"
                : "Stock")
        )}</span>
        <input class="input inventory-inline-stock-qty" type="number" min="0.001" step="any" value="${escapeHtml(qtyValue)}" inputmode="decimal" />
      </label>`;
  const unitFieldHtml = useBottleCost
    ? `<input type="hidden" class="inventory-inline-stock-unit" value="${escapeHtml(unit || INVENTORY_UNIT_ML)}" />`
    : `<label class="inventory-inline-stock-field">
        <span>${pattern === INVENTORY_CATEGORY_VOLUME ? "Price unit" : "Unit"}</span>
        <select class="select inventory-inline-stock-unit">${unitOptions}</select>
      </label>`;
  return `
    <div class="inventory-inline-stock-form${sizeLocked ? " is-size-locked" : ""}${useBottleCost ? " is-bottle-cost" : ""}" data-sell-by="${escapeHtml(resolvedSellBy)}">
      ${measureAsHtml}
      ${sellByHtml}
      ${sizeLockedHtml}
      ${unitFieldHtml}
      <label class="inventory-inline-stock-field">
        <span class="inventory-inline-stock-cost-label">${escapeHtml(costLabel)}</span>
        <input class="input inventory-inline-stock-cost" type="number" min="0" step="0.01" value="${escapeHtml(unitCost)}" placeholder="${useBottleCost ? "AED / bottle" : (pattern === INVENTORY_CATEGORY_VOLUME ? `Per ${bottleLabels?.priceUnit || "ml"}` : "0")}" inputmode="decimal" />
      </label>
      <label class="inventory-inline-stock-field">
        <span class="inventory-inline-stock-sell-label">${escapeHtml(sellLabel)} <em class="optional-label">optional</em></span>
        <input class="input inventory-inline-stock-sell" type="number" min="0" step="0.01" value="${escapeHtml(unitSell)}" placeholder="${useBottleCost ? "Optional" : (pattern === INVENTORY_CATEGORY_VOLUME ? `Per ${bottleLabels?.priceUnit || "ml"}` : "Optional")}" inputmode="decimal" />
      </label>
      <label class="inventory-inline-stock-field">
        <span>Cur</span>
        <input class="input inventory-inline-stock-currency" value="${escapeHtml(currency)}" maxlength="8" />
      </label>
      <div class="inventory-inline-stock-actions">
        <button type="button" class="tiny inventory-inline-stock-save" title="Save stock" aria-label="Save"><i class="fa-solid fa-check"></i></button>
        <button type="button" class="tiny ghost inventory-inline-stock-cancel" title="Cancel" aria-label="Cancel"><i class="fa-solid fa-xmark"></i></button>
      </div>
    </div>
  `;
}

function openInventoryInlineStockEditor(rowEl, {
  categoryName,
  brandName,
  productLineName,
  productLineId = "",
  variantLabel = "",
  variantId = "",
  qtyPattern = "count",
  onSaved
} = {}){
  if (!rowEl) return;
  const panel = rowEl.querySelector(".inventory-inline-stock");
  if (!panel) return;
  // Toggle closed if this row's form is already open.
  if (!panel.classList.contains("hide") && panel.querySelector(".inventory-inline-stock-form")) {
    panel.classList.add("hide");
    panel.innerHTML = "";
    rowEl.classList.remove("is-adding-stock");
    return;
  }
  // Close any other open inline stock panels in this list.
  rowEl.closest(".inventory-variant-list")?.querySelectorAll(".inventory-inline-stock:not(.hide)").forEach(openPanel => {
    if (openPanel !== panel) {
      openPanel.classList.add("hide");
      openPanel.innerHTML = "";
      openPanel.closest(".inventory-variant-row")?.classList.remove("is-adding-stock");
    }
  });
  const sizeHint = parseInventorySizeHint(variantLabel);
  const cfg = typeof getCategoryConfig === "function" ? getCategoryConfig(categoryName) : null;
  const categorySlug = cfg?.slug || "";
  let currentPattern = normalizeInventoryCategory(qtyPattern || cfg?.qtyPattern || "count");
  let currentSellBy = currentPattern === INVENTORY_CATEGORY_VOLUME
    ? (typeof defaultInventorySellBy === "function"
      ? defaultInventorySellBy({ categorySlug, categoryName, qtyPattern: currentPattern })
      : "volume")
    : "volume";
  const formState = {
    qty: "",
    sizeUnit: "",
    priceUnit: "",
    bottles: "1",
    unitCost: "",
    unitSell: "",
    currency: state.lastCurrency || "AED"
  };

  const defaultUnitForPattern = () => currentPattern === INVENTORY_CATEGORY_VOLUME
    ? INVENTORY_UNIT_ML
    : inventoryBaseUnitForCategory(currentPattern);
  const currentSizeLocked = () => currentPattern === INVENTORY_CATEGORY_VOLUME && !!sizeHint;
  const defaultQtyForPattern = () => {
    if (formState.qty !== "") return formState.qty;
    if (currentPattern === INVENTORY_CATEGORY_VOLUME) return String(sizeHint?.qty ?? 100);
    return currentPattern === INVENTORY_CATEGORY_COUNT ? "1" : "";
  };
  const readFormState = () => {
    const qty = panel.querySelector(".inventory-inline-stock-qty");
    const sizeUnit = panel.querySelector(".inventory-inline-stock-size-unit");
    const unit = panel.querySelector(".inventory-inline-stock-unit");
    const bottles = panel.querySelector(".inventory-inline-stock-bottles");
    const cost = panel.querySelector(".inventory-inline-stock-cost");
    const sell = panel.querySelector(".inventory-inline-stock-sell");
    const currency = panel.querySelector(".inventory-inline-stock-currency");
    if (qty) formState.qty = qty.value;
    if (sizeUnit) formState.sizeUnit = sizeUnit.value;
    if (unit) formState.priceUnit = unit.value;
    if (bottles) formState.bottles = bottles.value;
    if (cost) formState.unitCost = cost.value;
    if (sell) formState.unitSell = sell.value;
    if (currency) formState.currency = currency.value;
  };

  const mountForm = () => {
    const sizeLocked = currentSizeLocked();
    const sizeUnit = formState.sizeUnit
      || sizeHint?.unit
      || defaultUnitForPattern();
    const priceUnit = formState.priceUnit || defaultUnitForPattern();
    panel.innerHTML = inventoryInlineStockFormHtml(currentPattern, {
      qty: defaultQtyForPattern(),
      unit: sizeUnit,
      sizeLocked,
      sizeLabel: sizeHint
        ? `${trimInventoryNumber(sizeHint.qty, 3)} ${sizeHint.unit === INVENTORY_UNIT_L ? "L" : "ml"}`
        : (variantLabel || ""),
      bottles: formState.bottles || "1",
      priceUnit,
      sellBy: currentSellBy,
      categorySlug,
      categoryName,
      unitCost: formState.unitCost,
      unitSell: formState.unitSell,
      currency: formState.currency
    });
    bindForm();
  };

  const bindForm = () => {
    const qtyInput = panel.querySelector(".inventory-inline-stock-qty");
    const bottlesInput = panel.querySelector(".inventory-inline-stock-bottles");
    const sizeUnitInput = panel.querySelector(".inventory-inline-stock-size-unit");
    const unitSelect = panel.querySelector("select.inventory-inline-stock-unit, input.inventory-inline-stock-unit");
    const costInput = panel.querySelector(".inventory-inline-stock-cost");
    const sellInput = panel.querySelector(".inventory-inline-stock-sell");
    const currencyInput = panel.querySelector(".inventory-inline-stock-currency");
    const saveBtn = panel.querySelector(".inventory-inline-stock-save");
    const cancelBtn = panel.querySelector(".inventory-inline-stock-cancel");
    const sizeLocked = currentSizeLocked();
    const useBottleCost = currentPattern === INVENTORY_CATEGORY_VOLUME
      && (sizeLocked || currentSellBy === "bottle");

    panel.querySelectorAll("[data-inline-qty-pattern]").forEach(btn => {
      btn.addEventListener("click", () => {
        readFormState();
        currentPattern = normalizeInventoryCategory(btn.dataset.inlineQtyPattern || "count");
        formState.priceUnit = defaultUnitForPattern();
        if (currentPattern !== INVENTORY_CATEGORY_VOLUME) {
          currentSellBy = "volume";
          formState.sizeUnit = "";
          formState.bottles = "1";
        } else {
          currentSellBy = typeof defaultInventorySellBy === "function"
            ? defaultInventorySellBy({ categorySlug, categoryName, qtyPattern: currentPattern })
            : "volume";
          formState.sizeUnit = sizeHint?.unit || INVENTORY_UNIT_ML;
        }
        mountForm();
        requestAnimationFrame(() => panel.querySelector(".inventory-inline-stock-bottles, .inventory-inline-stock-cost, .inventory-inline-stock-qty")?.focus());
      });
    });

    panel.querySelectorAll("[data-inline-sell-by]").forEach(btn => {
      btn.addEventListener("click", () => {
        readFormState();
        currentSellBy = btn.dataset.inlineSellBy || "volume";
        mountForm();
        requestAnimationFrame(() => panel.querySelector(".inventory-inline-stock-cost, .inventory-inline-stock-qty")?.focus());
      });
    });

    const refreshPriceUnitLabels = () => {
      if (currentPattern !== INVENTORY_CATEGORY_VOLUME || useBottleCost) return;
      const labels = inventoryVolumeBottleLabels(qtyInput?.value, unitSelect?.value);
      const costLabel = panel.querySelector(".inventory-inline-stock-cost-label");
      const sellLabel = panel.querySelector(".inventory-inline-stock-sell-label");
      if (costLabel) costLabel.textContent = labels.cost;
      if (sellLabel) sellLabel.textContent = labels.sell;
      if (costInput) costInput.placeholder = `Per ${labels.priceUnit}`;
      if (sellInput) sellInput.placeholder = `Per ${labels.priceUnit}`;
    };
    if (unitSelect && unitSelect.tagName === "SELECT") {
      unitSelect.addEventListener("change", refreshPriceUnitLabels);
    }
    refreshPriceUnitLabels();

    const close = () => {
      panel.classList.add("hide");
      panel.innerHTML = "";
      rowEl.classList.remove("is-adding-stock");
    };

    cancelBtn?.addEventListener("click", close);
    saveBtn?.addEventListener("click", async () => {
      if (typeof persistInventoryStockItem !== "function") {
        alert("Stock helper missing. Refresh and try again.");
        return;
      }
      saveBtn.disabled = true;
      cancelBtn.disabled = true;
      try {
        const unit = currentPattern === INVENTORY_CATEGORY_VOLUME
          ? (sizeUnitInput?.value || formState.sizeUnit || unitSelect?.value || INVENTORY_UNIT_ML)
          : (unitSelect?.value || inventoryBaseUnitForCategory(currentPattern));
        const bottles = (sizeLocked || currentSellBy === "bottle")
          ? Math.max(1, Math.floor(Number(bottlesInput?.value || 1)))
          : 1;
        await persistInventoryStockItem({
          category: categoryName,
          brand: brandName,
          productLine: productLineName,
          productLineId,
          variantLabel,
          variantId,
          qty: qtyInput?.value,
          unit,
          bottles,
          priceUnit: unitSelect?.value || formState.priceUnit || unit,
          unitCost: costInput?.value,
          unitSell: sellInput?.value,
          currency: currencyInput?.value || "AED",
          qtyPattern: currentPattern,
          sizeLocked,
          sellBy: currentPattern === INVENTORY_CATEGORY_VOLUME ? currentSellBy : "",
          costMode: useBottleCost ? "bottle" : "unit"
        });
        close();
        if (typeof invalidateAndRefreshInventoryLazy === "function") {
          await invalidateAndRefreshInventoryLazy().catch(() => {});
        }
        if (typeof renderInventoryList === "function") renderInventoryList();
        if (typeof onSaved === "function") await onSaved();
      } catch (err) {
        alert(err?.message || "Could not save stock.");
        saveBtn.disabled = false;
        cancelBtn.disabled = false;
        (costInput || qtyInput)?.focus();
      }
    });
  };

  panel.classList.remove("hide");
  rowEl.classList.add("is-adding-stock");
  mountForm();
  requestAnimationFrame(() => panel.querySelector(".inventory-inline-stock-bottles, .inventory-inline-stock-cost, .inventory-inline-stock-qty")?.focus());
}

function inventoryInlineEditorRowHtml(placeholder, kind, value = ""){
  return `
    <div class="inventory-inline-editor" data-inline-kind="${escapeHtml(kind)}">
      <input class="input inventory-inline-editor-input" type="text" maxlength="120" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(value || "")}" autocomplete="off" />
      <button type="button" class="tiny inventory-inline-editor-save" title="Save" aria-label="Save"><i class="fa-solid fa-check"></i></button>
      <button type="button" class="tiny ghost inventory-inline-editor-cancel" title="Cancel" aria-label="Cancel"><i class="fa-solid fa-xmark"></i></button>
    </div>
  `;
}

function inventoryMultiInlineEditorHtml(placeholder, kind){
  return `
    <div class="inventory-multi-inline-editor" data-inline-kind="${escapeHtml(kind)}">
      <div class="inventory-multi-inline-rows">
        <div class="inventory-multi-inline-row">
          <input class="input inventory-multi-inline-input" type="text" maxlength="120" placeholder="${escapeHtml(placeholder)}" autocomplete="off" />
        </div>
      </div>
      <div class="inventory-multi-inline-actions">
        <button type="button" class="tiny ghost inventory-multi-inline-add" title="Add another row">+ Another</button>
        <button type="button" class="tiny primary inventory-multi-inline-save" title="Save all" aria-label="Save all"><i class="fa-solid fa-check"></i></button>
        <button type="button" class="tiny ghost inventory-multi-inline-cancel" title="Cancel" aria-label="Cancel"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <p class="help inventory-multi-inline-hint">Enter one name per row. Tick saves all.</p>
    </div>
  `;
}

function bindInventoryInlineEditor(root, { onSave } = {}){
  const editor = root?.querySelector(".inventory-inline-editor");
  if (!editor) return;
  const input = editor.querySelector(".inventory-inline-editor-input");
  const saveBtn = editor.querySelector(".inventory-inline-editor-save");
  const cancelBtn = editor.querySelector(".inventory-inline-editor-cancel");
  const finish = () => editor.remove();
  cancelBtn?.addEventListener("click", finish);
  const commit = async () => {
    const value = String(input?.value || "").replace(/\s+/g, " ").trim();
    if (!value) {
      input?.focus();
      return;
    }
    saveBtn.disabled = true;
    cancelBtn.disabled = true;
    if (input) input.disabled = true;
    try {
      await onSave?.(value);
    } catch (err) {
      alert(err?.message || "Could not save.");
      saveBtn.disabled = false;
      cancelBtn.disabled = false;
      if (input) {
        input.disabled = false;
        input.focus();
      }
    }
  };
  saveBtn?.addEventListener("click", () => { commit().catch(() => {}); });
  input?.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit().catch(() => {});
    }
    if (e.key === "Escape") {
      e.preventDefault();
      finish();
    }
  });
  requestAnimationFrame(() => {
    input?.focus();
    if (input?.value) input.select();
  });
}

function bindInventoryMultiInlineEditor(root, { onSaveAll, placeholder = "" } = {}){
  const editor = root?.querySelector(".inventory-multi-inline-editor");
  if (!editor) return;
  const rowsHost = editor.querySelector(".inventory-multi-inline-rows");
  const addBtn = editor.querySelector(".inventory-multi-inline-add");
  const saveBtn = editor.querySelector(".inventory-multi-inline-save");
  const cancelBtn = editor.querySelector(".inventory-multi-inline-cancel");
  const finish = () => editor.remove();

  const addRow = (focus = true) => {
    const row = document.createElement("div");
    row.className = "inventory-multi-inline-row";
    row.innerHTML = `<input class="input inventory-multi-inline-input" type="text" maxlength="120" placeholder="${escapeHtml(placeholder)}" autocomplete="off" />`;
    rowsHost?.appendChild(row);
    const input = row.querySelector("input");
    wireInput(input);
    if (focus) requestAnimationFrame(() => input?.focus());
    return input;
  };

  const collectNames = () => {
    const seen = new Set();
    const names = [];
    editor.querySelectorAll(".inventory-multi-inline-input").forEach(input => {
      const value = String(input.value || "").replace(/\s+/g, " ").trim();
      if (!value) return;
      const key = value.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      names.push(value);
    });
    return names;
  };

  const wireInput = (input) => {
    if (!input || input.dataset.wired === "1") return;
    input.dataset.wired = "1";
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        const inputs = [...editor.querySelectorAll(".inventory-multi-inline-input")];
        if (input === inputs[inputs.length - 1] && String(input.value || "").trim()) {
          addRow(true);
        } else {
          const idx = inputs.indexOf(input);
          inputs[idx + 1]?.focus();
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        finish();
      }
    });
  };

  cancelBtn?.addEventListener("click", finish);
  addBtn?.addEventListener("click", () => addRow(true));
  editor.querySelectorAll(".inventory-multi-inline-input").forEach(wireInput);

  const commit = async () => {
    const names = collectNames();
    if (!names.length) {
      editor.querySelector(".inventory-multi-inline-input")?.focus();
      return;
    }
    saveBtn.disabled = true;
    addBtn.disabled = true;
    cancelBtn.disabled = true;
    editor.querySelectorAll(".inventory-multi-inline-input").forEach(el => { el.disabled = true; });
    try {
      await onSaveAll?.(names);
    } catch (err) {
      alert(err?.message || "Could not save.");
      saveBtn.disabled = false;
      addBtn.disabled = false;
      cancelBtn.disabled = false;
      editor.querySelectorAll(".inventory-multi-inline-input").forEach(el => { el.disabled = false; });
      editor.querySelector(".inventory-multi-inline-input")?.focus();
    }
  };
  saveBtn?.addEventListener("click", () => { commit().catch(() => {}); });
  requestAnimationFrame(() => editor.querySelector(".inventory-multi-inline-input")?.focus());
}

function openInventoryMultiCreate(listRoot, { placeholder, kind, onSaveAll }){
  if (!listRoot) return;
  listRoot.querySelector(".inventory-inline-editor")?.remove();
  listRoot.querySelector(".inventory-multi-inline-editor")?.remove();
  listRoot.querySelector(".empty")?.remove();
  const wrap = document.createElement("div");
  wrap.innerHTML = inventoryMultiInlineEditorHtml(placeholder, kind);
  listRoot.prepend(wrap.firstElementChild);
  bindInventoryMultiInlineEditor(listRoot, { onSaveAll, placeholder });
}

function teamCanManageInventoryCatalog(){
  // Catalog rename/delete is structure management — allow when the user can edit
  // inventory, or delete invoices, or is the account owner (not a restricted member).
  if (typeof isTeamMemberAccount === "function" && !isTeamMemberAccount()) return true;
  if (typeof teamCanShowEdit === "function" && teamCanShowEdit("invoices")) return true;
  if (typeof teamCanShowDelete === "function" && teamCanShowDelete("invoices")) return true;
  return typeof teamCapability === "function" ? teamCapability("can_edit_invoices") : true;
}

function inventoryCatalogRowMenuHtml(menuKey, {
  editLabel = "Edit",
  deleteLabel = "Delete",
  canEdit = true,
  canDelete = true,
  showChart = false,
  chartLabel = "Detailed Chart"
} = {}){
  const canManage = teamCanManageInventoryCatalog();
  const showEdit = canEdit && canManage;
  const showDelete = canDelete && canManage;
  if (!showEdit && !showDelete && !showChart) return "";
  return `
    <div class="menu-wrap inventory-catalog-menu-wrap">
      <button class="icon-btn ghost menu-trigger inventory-catalog-menu-btn" type="button" data-catalog-menu="${escapeHtml(menuKey)}" aria-label="More" aria-expanded="false"><i class="fa-solid fa-ellipsis-vertical" aria-hidden="true"></i></button>
      <div class="menu-dropdown" data-catalog-menu-panel="${escapeHtml(menuKey)}">
        ${showEdit ? `<button class="menu-item inventoryCatalogActionBtn" type="button" data-action="edit">${escapeHtml(editLabel)}</button>` : ""}
        ${showDelete ? `<button class="menu-item danger inventoryCatalogActionBtn" type="button" data-action="delete">${escapeHtml(deleteLabel)}</button>` : ""}
        ${showChart ? `<button class="menu-item inventoryCatalogActionBtn" type="button" data-action="chart"><i class="fa-solid fa-chart-column" aria-hidden="true"></i> ${escapeHtml(chartLabel)}</button>` : ""}
      </div>
    </div>
  `;
}

function bindInventoryCatalogMenus(root, onAction){
  if (!root) return;
  root.querySelectorAll("[data-catalog-menu]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      const key = btn.dataset.catalogMenu;
      const panel = root.querySelector(`[data-catalog-menu-panel="${key}"]`);
      if (!panel) return;
      document.querySelectorAll(".menu-dropdown.open").forEach(openPanel => {
        if (openPanel !== panel) openPanel.classList.remove("open");
      });
      const nowOpen = panel.classList.toggle("open");
      btn.setAttribute("aria-expanded", nowOpen ? "true" : "false");
      if (nowOpen) {
        const rect = btn.getBoundingClientRect();
        const panelWidth = Math.min(panel.offsetWidth || 160, window.innerWidth - 20);
        const left = Math.min(Math.max(10, rect.right - panelWidth), window.innerWidth - panelWidth - 10);
        const top = Math.min(rect.bottom + 6, window.innerHeight - 12);
        panel.style.position = "fixed";
        panel.style.top = `${top}px`;
        panel.style.left = `${left}px`;
        panel.style.right = "auto";
        panel.style.zIndex = "13000";
      }
    });
  });
  root.querySelectorAll(".inventoryCatalogActionBtn").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.preventDefault();
      e.stopPropagation();
      document.querySelectorAll(".menu-dropdown.open").forEach(panel => panel.classList.remove("open"));
      const wrap = btn.closest(".menu-wrap");
      const menuBtn = wrap?.querySelector("[data-catalog-menu]");
      const row = btn.closest("[data-catalog-kind]") || btn.closest(".inventory-brand-row") || btn.closest(".inventory-variant-row") || btn.closest(".inventory-section-card");
      try {
        await onAction?.(btn.dataset.action, {
          row,
          menuKey: menuBtn?.dataset.catalogMenu || "",
          dataset: { ...(row?.dataset || {}), ...(menuBtn?.dataset || {}), ...(btn.dataset || {}) }
        });
      } catch (err) {
        alert(err?.message || "Action failed.");
      }
    });
  });
}

function inventoryResolveBrandCatalogId(brandName){
  const name = String(brandName || "").trim();
  if (!name || typeof getInventoryBrandCatalog !== "function") return "";
  const hit = getInventoryBrandCatalog().find(b => inventoryBrandKey(b.name) === inventoryBrandKey(name));
  return hit?.id || "";
}

function syncInventoryCatalogMetaOnEntries(matcher, patch){
  if (!Array.isArray(state.entries) || !patch) return [];
  const updated = [];
  for (const entry of state.entries) {
    if (!entry || entry.entry_kind !== "principal") continue;
    if (!hasGoodsTag(entry.notes)) continue;
    const meta = goodsMetaFromNotes(entry.notes);
    if (!matcher(meta, entry)) continue;
    const nextMeta = { ...meta, ...patch };
    // Merge into existing meta — never pass a partial patch alone (would wipe other tags).
    entry.notes = upsertGoodsMetaInNote(entry.notes, nextMeta);
    if (
      patch.brand != null
      || patch.subBrand != null
      || patch.productLine != null
      || patch.variantLabel != null
      || patch.itemType != null
    ) {
      const nextName = typeof buildItemDisplayName === "function"
        ? buildItemDisplayName({
            brand: nextMeta.brand,
            subBrand: nextMeta.subBrand,
            productLine: nextMeta.productLine,
            variantLabel: nextMeta.variantLabel,
            variantStorage: nextMeta.variantStorage,
            variantColor: nextMeta.variantColor,
            category: nextMeta.itemType,
            itemType: nextMeta.itemType,
            itemName: entry.person_name
          })
        : entry.person_name;
      if (nextName) entry.person_name = nextName;
    }
    updated.push(entry);
    if (typeof queueDatabasePatch === "function") {
      queueDatabasePatch(entry.id, {
        notes: entry.notes,
        person_name: entry.person_name
      }, "Catalog rename", entry);
    }
  }
  return updated;
}

function openInventoryInlineRename(listRoot, {
  placeholder,
  kind,
  value,
  onSave
}){
  if (!listRoot) return;
  listRoot.querySelector(".inventory-inline-editor")?.remove();
  const wrap = document.createElement("div");
  wrap.innerHTML = inventoryInlineEditorRowHtml(placeholder, kind, value || "");
  listRoot.prepend(wrap.firstElementChild);
  bindInventoryInlineEditor(listRoot, { onSave });
}

async function renderInventorySectionOverlayBody(sectionType){
  const type = normalizeInventoryItemType(sectionType || state.inventoryActiveSection);
  const body = document.getElementById("inventorySectionModalBody");
  if (!body) return;
  try { await ensureInventoryBrandsLoaded(false); } catch (_) {}
  const cfg = typeof getCategoryConfig === "function" ? getCategoryConfig(type) : { usesBrands: true, usesProductLines: true, usesVariants: true };
  const tax = typeof getCategoryTaxonomyLabels === "function"
    ? getCategoryTaxonomyLabels(cfg)
    : { productLine: "Type", variant: "Variant", productLinePlural: "types", variantPlural: "variants", breadcrumb: "Brand → Type → Variant" };
  const primaryLabel = tax.primary || "Brand";
  const primaryPlural = tax.primaryPlural || "Brands";
  const subBrandLabel = tax.subBrand || "Sub-brand";
  const isBooks = primaryLabel === "Author";
  const freshItems = sortInventorySectionItems(
    getGoodsGroups({ applyUiFilters: false }).filter(g => normalizeInventoryItemType(g.itemType) === type)
  );
  const brands = getInventorySectionBrandGroups(freshItems);
  // Include catalog-only brands (no stock yet) so +Type can still target them.
  const typeKey = String(type || "").trim().toLowerCase();
  const catalogBrands = getInventoryBrandCatalog()
    .filter(b => {
      const bt = String(b.item_type || "").trim().toLowerCase();
      if (!bt) return true;
      return bt === typeKey || bt.includes(typeKey) || typeKey.includes(bt.replace(/s$/, ""));
    })
    .filter(b => !brands.some(row => inventoryBrandKey(row.brand) === inventoryBrandKey(b.name)))
    .map(b => ({
      key: inventoryBrandKey(b.name),
      brand: b.name,
      brandId: b.id || "",
      items: [],
      inStock: false,
      lineCount: Array.isArray(b.product_lines) ? b.product_lines.length : 0,
      stockLabel: "0",
      fromCatalog: true
    }));
  const allBrands = [...brands, ...catalogBrands]
    .map(row => ({
      ...row,
      brandId: row.brandId || inventoryResolveBrandCatalogId(row.brand) || row.items?.[0]?.brandId || ""
    }))
    .sort((a, b) => a.brand.localeCompare(b.brand, undefined, { sensitivity: "base" }));
  const activeBrandKey = inventoryBrandKey(state.inventoryActiveBrand);
  const activeBrand = state.inventoryActiveBrand
    ? allBrands.find(b => b.key === activeBrandKey) || {
        key: activeBrandKey,
        brand: state.inventoryActiveBrand,
        items: [],
        inStock: false,
        stockLabel: "0",
        lineCount: 0
      }
    : null;
  const productLines = activeBrand
    ? (typeof mergeProductLinesForBrand === "function"
      ? mergeProductLinesForBrand(activeBrand.brand, activeBrand.items || [], {
          subBrandId: state.inventoryActiveSubBrandId || "",
          subBrandOnly: !!state.inventoryActiveSubBrandId
        })
      : (typeof groupItemsByProductLine === "function"
        ? groupItemsByProductLine(activeBrand.items || [])
        : [{ key: "items", name: "Items", items: activeBrand.items || [], inStock: activeBrand.inStock, stockLabel: activeBrand.stockLabel, variantCount: (activeBrand.items || []).length }]))
    : [];
  const catalogBrandEntry = activeBrand
    ? (typeof getInventoryBrandCatalog === "function"
      ? getInventoryBrandCatalog().find(b =>
        String(b.id) === String(activeBrand.brandId || "")
        || inventoryBrandKey(b.name) === inventoryBrandKey(activeBrand.brand)
      )
      : null)
    : null;
  const subBrandRows = (Array.isArray(catalogBrandEntry?.sub_brands) ? catalogBrandEntry.sub_brands : [])
    .map(sb => {
      const id = String(sb.id || "");
      const name = String(sb.name || "").trim();
      const lines = typeof mergeProductLinesForBrand === "function"
        ? mergeProductLinesForBrand(activeBrand.brand, activeBrand.items || [], { subBrandId: id, subBrandOnly: true })
        : [];
      const items = (activeBrand.items || []).filter(it => String(it.subBrandId || "") === id);
      const inStock = items.some(it => Number(it.remainingQty || 0) > 0.00000001)
        || lines.some(l => l.inStock);
      return {
        id,
        name,
        lineCount: lines.length,
        inStock,
        stockLabel: inventoryQtySummary(items, "remainingQty")
      };
    })
    .filter(sb => sb.name)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  const activeSubBrand = state.inventoryActiveSubBrandId
    ? (subBrandRows.find(s => String(s.id) === String(state.inventoryActiveSubBrandId))
      || { id: state.inventoryActiveSubBrandId, name: state.inventoryActiveSubBrand || "Sub-brand" })
    : null;
  const activeLineKey = String(state.inventoryActiveProductLine || "").trim().toLowerCase();
  const activeLine = state.inventoryActiveProductLine
    ? productLines.find(l => l.key === activeLineKey || l.name.toLowerCase() === activeLineKey)
    : null;
  const stockLabel = inventoryQtySummary(freshItems, "remainingQty");
  const title = document.getElementById("inventorySectionModalTitle");
  const desc = document.getElementById("inventorySectionModalDesc");

  const openAddWizard = (seed = {}) => {
    if (typeof openInventoryAddItemWizard === "function") {
      openInventoryAddItemWizard({
        seedType: type,
        brand: state.inventoryActiveBrand,
        brandId: activeBrand?.brandId || "",
        subBrand: state.inventoryActiveSubBrand,
        subBrandId: state.inventoryActiveSubBrandId,
        branchPath: state.inventoryActiveSubBrandId ? "subBrand" : (seed.branchPath || ""),
        productLine: state.inventoryActiveProductLine,
        ...seed
      });
    } else {
      openGoodsModal("bought", { seedType: type, addBrand: true });
    }
  };

  const showInlineTypeEditor = () => {
    const list = body.querySelector(".inventory-brand-list") || body;
    const placeholder = isBooks
      ? "Book title (e.g. 1984, The Great Gatsby)"
      : (/perfume/i.test(type)
        ? `${tax.productLine} (e.g. fragrance name, wood scent)`
        : `${tax.productLine} name (e.g. product name)`);
    openInventoryMultiCreate(list, {
      placeholder,
      kind: "type",
      onSaveAll: async (names) => {
        if (typeof createProductLineInline !== "function") throw new Error("Catalog helper missing.");
        for (const lineName of names) {
          await createProductLineInline({
            brandName: activeBrand.brand,
            categoryName: type,
            lineName,
            subBrandId: state.inventoryActiveSubBrandId || null
          });
        }
        state.inventoryActiveProductLine = "";
        await renderInventorySectionOverlayBody(type);
        renderInventoryList();
      }
    });
  };

  const showInlineSubBrandEditor = () => {
    const list = body.querySelector(".inventory-brand-list") || body;
    openInventoryMultiCreate(list, {
      placeholder: isBooks ? "Series name (e.g. Classic novels)" : "Sub-brand name",
      kind: "sub-brand",
      onSaveAll: async (names) => {
        if (typeof createSubBrandInline !== "function") throw new Error("Catalog helper missing.");
        let last = null;
        for (const subBrandName of names) {
          last = await createSubBrandInline({
            brandName: activeBrand.brand,
            categoryName: type,
            subBrandName
          });
        }
        if (last) {
          state.inventoryActiveSubBrand = last.name || "";
          state.inventoryActiveSubBrandId = last.id || "";
        }
        state.inventoryActiveProductLine = "";
        await renderInventorySectionOverlayBody(type);
        renderInventoryList();
      }
    });
  };

  const showInlineVariantEditor = () => {
    const list = body.querySelector(".inventory-variant-list") || body;
    const placeholder = isBooks
      ? "Edition / format (e.g. Paperback, Hardcover, 1st edition)"
      : (/perfume/i.test(type)
        ? `${tax.variant} (e.g. 100 ml, 50 ml, 1 L)`
        : `${tax.variant} (e.g. 3ml, 100ml)`);
    openInventoryMultiCreate(list, {
      placeholder,
      kind: "variant",
      onSaveAll: async (names) => {
        if (typeof createVariantInline !== "function") throw new Error("Catalog helper missing.");
        for (const variantLabel of names) {
          await createVariantInline({
            brandName: activeBrand.brand,
            categoryName: type,
            productLineName: activeLine.name,
            variantLabel,
            qtyPattern: resolveCatalogVariantQtyPattern(
              { label: variantLabel },
              type,
              cfg.qtyPattern || "count"
            )
          });
        }
        await renderInventorySectionOverlayBody(type);
        renderInventoryList();
      }
    });
  };

  // Level 3: variants under product type
  if (activeBrand && activeLine && (cfg.usesProductLines || cfg.usesVariants)) {
    const variantRows = typeof mergeVariantsForProductLine === "function"
      ? mergeVariantsForProductLine(activeBrand.brand, activeLine.name, activeBrand.items || [])
      : (activeLine.items || []).map(group => ({
          key: group.group_id,
          group,
          label: inventoryVariantDisplayName(group),
          variantId: group.variantId || "",
          inStock: Number(group.remainingQty || 0) > 0.00000001,
          fromCatalog: false
        }));
    const stockVariants = variantRows.filter(r => r.group);
    const catalogOnly = variantRows.filter(r => !r.group);
    if (title) title.textContent = activeLine.name;
    if (desc) {
      const path = [activeBrand.brand, activeSubBrand?.name, activeLine.name].filter(Boolean).join(" · ");
      desc.textContent = `${path} · ${variantRows.length} ${variantRows.length === 1 ? tax.variant.toLowerCase() : tax.variantPlural} · Stock ${activeLine.stockLabel || inventoryQtySummary(activeLine.items || [], "remainingQty")}`;
    }
    body.innerHTML = `
      <div class="inventory-section-detail-head inventory-section-brand-head">
        <button type="button" class="tiny ghost" id="inventorySectionBackBtn"><i class="fa-solid fa-arrow-left"></i> ${escapeHtml(activeSubBrand?.name || activeBrand.brand)}</button>
        <div class="inventory-section-detail-actions">
          <button type="button" class="tiny ghost" id="inventorySectionAddVariantBtn"><i class="fa-solid fa-plus"></i> ${escapeHtml(tax.variant)}</button>
          <button type="button" class="tiny ghost" id="inventorySectionAddStockWizardBtn"><i class="fa-solid fa-plus"></i> Stock</button>
          <button type="button" class="tiny ghost" id="inventorySectionOpenDraftBtn"><i class="fa-solid fa-cart-shopping"></i> Cart</button>
        </div>
      </div>
      <div class="inventory-variant-list">
        ${stockVariants.length ? renderInventoryVariantRowsHtml(stockVariants.map(r => r.group)) : ""}
        ${catalogOnly.length ? renderInventoryCatalogVariantRowsHtml(catalogOnly, {
          itemType: type,
          qtyPattern: cfg.qtyPattern || "count"
        }) : ""}
        ${!variantRows.length ? `<div class="empty">No ${escapeHtml(tax.variantPlural)} yet. Tap + ${escapeHtml(tax.variant)}.</div>` : ""}
      </div>
    `;
    body.querySelector("#inventorySectionBackBtn")?.addEventListener("click", () => {
      state.inventoryActiveProductLine = "";
      renderInventorySectionOverlayBody(type);
    });
    body.querySelector("#inventorySectionAddVariantBtn")?.addEventListener("click", showInlineVariantEditor);
    body.querySelector("#inventorySectionAddStockWizardBtn")?.addEventListener("click", () => openAddWizard());
    body.querySelector("#inventorySectionOpenDraftBtn")?.addEventListener("click", () => openSaleDraftModal());
    body.querySelectorAll(".inventoryCatalogAddStockBtn").forEach(btn => {
      btn.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();
        const row = btn.closest(".inventory-variant-row");
        openInventoryInlineStockEditor(row, {
          categoryName: type,
          brandName: activeBrand.brand,
          productLineName: activeLine.name,
          productLineId: activeLine.id || "",
          variantLabel: btn.dataset.variantLabel || "",
          variantId: btn.dataset.variantId || "",
          qtyPattern: btn.dataset.variantQtyPattern || cfg.qtyPattern || "count",
          onSaved: () => renderInventorySectionOverlayBody(type)
        });
      });
    });
    bindInventorySectionVariantActions(body, type);
    bindInventoryCatalogMenus(body, async (action, { dataset }) => {
      const variantId = dataset.variantId || "";
      const oldLabel = dataset.variantLabel || "";
      if (!variantId) throw new Error("This size is not saved in the catalog yet.");
      if (action === "edit") {
        const list = body.querySelector(".inventory-variant-list") || body;
        openInventoryInlineRename(list, {
          placeholder: `${tax.variant} name`,
          kind: "variant-rename",
          value: oldLabel,
          onSave: async (label) => {
            await renameVariantInline({
              variantId,
              brandName: activeBrand.brand,
              categoryName: type,
              productLineId: activeLine.id || "",
              productLineName: activeLine.name,
              variantLabel: label,
              qtyPattern: cfg.qtyPattern || "count"
            });
            syncInventoryCatalogMetaOnEntries(
              meta => String(meta.variantId || "") === String(variantId),
              { variantLabel: label }
            );
            await renderInventorySectionOverlayBody(type);
          }
        });
        return;
      }
      if (action === "delete") {
        if (!confirm(`Delete ${tax.variant.toLowerCase()} “${oldLabel}”?`)) return;
        await deleteVariantInline(variantId);
        await renderInventorySectionOverlayBody(type);
      }
    });
    return;
  }

  // Auto-skip a single placeholder "Items" type only when there are no other catalog types.
  if (
    activeBrand && cfg.usesProductLines && !activeLine
    && productLines.length === 1
    && /^items$/i.test(productLines[0].name)
    && !(productLines[0].catalogVariants?.length)
  ) {
    state.inventoryActiveProductLine = productLines[0].name;
    return renderInventorySectionOverlayBody(type);
  }

  // Level 2: sub-brands and/or product types under brand
  if (activeBrand && cfg.usesProductLines) {
    const showSubBrandLevel = !!activeSubBrand;
    if (title) title.textContent = showSubBrandLevel ? activeSubBrand.name : activeBrand.brand;
    if (desc) {
      desc.textContent = showSubBrandLevel
        ? `${activeBrand.brand} · ${productLines.length} ${productLines.length === 1 ? tax.productLine.toLowerCase() : tax.productLinePlural}`
        : `${subBrandRows.length ? `${subBrandRows.length} ${subBrandLabel.toLowerCase()}${subBrandRows.length === 1 ? "" : "s"} · ` : ""}${productLines.length} ${productLines.length === 1 ? tax.productLine.toLowerCase() : tax.productLinePlural} · Stock ${activeBrand.stockLabel || inventoryQtySummary(activeBrand.items || [], "remainingQty")}`;
    }
    const subBrandListHtml = (!showSubBrandLevel && subBrandRows.length)
      ? subBrandRows.map((sb, index) => `
          <div class="inventory-brand-row ${sb.inStock ? "" : "is-empty"}"
            data-catalog-kind="sub-brand"
            data-sub-brand-id="${escapeHtml(sb.id)}"
            data-sub-brand-name="${escapeHtml(sb.name)}">
            <button type="button" class="inventory-brand-row-hit" data-section-sub-brand="${escapeHtml(sb.id)}" data-section-sub-brand-name="${escapeHtml(sb.name)}">
              <span class="inventory-section-item-index">#${index + 1}</span>
              <span class="inventory-brand-row-main">
                <strong>${escapeHtml(sb.name)}</strong>
                <span>${escapeHtml(subBrandLabel)} · ${escapeHtml(String(sb.lineCount || 0))} ${tax.productLinePlural} · Stock ${escapeHtml(sb.stockLabel || "0")}</span>
              </span>
              <span class="badge ${sb.inStock ? "orange" : "green"}">${sb.inStock ? "In stock" : "Empty"}</span>
              <i class="fa-solid fa-chevron-right inventory-brand-chevron" aria-hidden="true"></i>
            </button>
            ${inventoryCatalogRowMenuHtml(`sub-${sb.id}`, { editLabel: "Delete sub-brand", deleteLabel: "Delete sub-brand", canEdit: false, canDelete: true })}
          </div>`).join("")
      : "";
    body.innerHTML = `
      <div class="inventory-section-detail-head inventory-section-brand-head">
        <button type="button" class="tiny ghost" id="inventorySectionBackBtn"><i class="fa-solid fa-arrow-left"></i> ${escapeHtml(showSubBrandLevel ? activeBrand.brand : type)}</button>
        <div class="inventory-section-detail-actions">
          ${showSubBrandLevel ? "" : `<button type="button" class="tiny ghost" id="inventorySectionAddSubBrandBtn"><i class="fa-solid fa-plus"></i> ${escapeHtml(subBrandLabel)}</button>`}
          <button type="button" class="tiny ghost" id="inventorySectionAddTypeBtn"><i class="fa-solid fa-plus"></i> ${escapeHtml(tax.productLine)}</button>
          <button type="button" class="tiny ghost" id="inventorySectionAddStockWizardBtn"><i class="fa-solid fa-plus"></i> Stock</button>
          <button type="button" class="tiny ghost" id="inventorySectionOpenDraftBtn"><i class="fa-solid fa-cart-shopping"></i> Cart</button>
        </div>
      </div>
      <div class="inventory-brand-list">
        ${subBrandListHtml}
        ${productLines.length ? productLines.map((line, index) => {
          const sizeCount = Number(line.variantCount || line.items.length || 0);
          const lineId = line.id || "";
          const menuKey = `line-${lineId || line.key || index}`;
          return `
          <div class="inventory-brand-row ${line.inStock ? "" : "is-empty"}"
            data-catalog-kind="product-line"
            data-section-line="${escapeHtml(line.name)}"
            data-line-id="${escapeHtml(lineId)}"
            data-line-name="${escapeHtml(line.name)}">
            <button type="button" class="inventory-brand-row-hit" data-section-line="${escapeHtml(line.name)}">
              <span class="inventory-section-item-index">#${index + 1}</span>
              <span class="inventory-brand-row-main">
                <strong>${escapeHtml(line.name)}</strong>
                <span>${escapeHtml(String(sizeCount))} ${sizeCount === 1 ? tax.variant.toLowerCase() : tax.variantPlural} · Stock ${escapeHtml(line.stockLabel || "0")}</span>
              </span>
              <span class="badge ${line.inStock ? "orange" : "green"}">${line.inStock ? "In stock" : "Empty"}</span>
              <i class="fa-solid fa-chevron-right inventory-brand-chevron" aria-hidden="true"></i>
            </button>
          ${lineId ? inventoryCatalogRowMenuHtml(menuKey, { editLabel: `Edit ${tax.productLine.toLowerCase()}`, deleteLabel: `Delete ${tax.productLine.toLowerCase()}` }) : ""}
          </div>`;
        }).join("") : (showSubBrandLevel || !subBrandRows.length ? `<div class="empty">No ${escapeHtml(tax.productLinePlural)} yet. Tap + ${escapeHtml(tax.productLine)} or + Sub-brand.</div>` : "")}
      </div>
    `;
    body.querySelector("#inventorySectionBackBtn")?.addEventListener("click", () => {
      if (showSubBrandLevel) {
        state.inventoryActiveSubBrand = "";
        state.inventoryActiveSubBrandId = "";
        state.inventoryActiveProductLine = "";
      } else {
        state.inventoryActiveBrand = "";
        state.inventoryActiveSubBrand = "";
        state.inventoryActiveSubBrandId = "";
        state.inventoryActiveProductLine = "";
      }
      renderInventorySectionOverlayBody(type);
    });
    body.querySelector("#inventorySectionAddSubBrandBtn")?.addEventListener("click", showInlineSubBrandEditor);
    body.querySelector("#inventorySectionAddTypeBtn")?.addEventListener("click", showInlineTypeEditor);
    body.querySelector("#inventorySectionAddStockWizardBtn")?.addEventListener("click", () => openAddWizard());
    body.querySelector("#inventorySectionOpenDraftBtn")?.addEventListener("click", () => openSaleDraftModal());
    body.querySelectorAll(".inventory-brand-row-hit[data-section-sub-brand]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.inventoryActiveSubBrandId = btn.dataset.sectionSubBrand || "";
        state.inventoryActiveSubBrand = btn.dataset.sectionSubBrandName || "";
        state.inventoryActiveProductLine = "";
        renderInventorySectionOverlayBody(type);
      });
    });
    body.querySelectorAll(".inventory-brand-row-hit[data-section-line]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.inventoryActiveProductLine = btn.dataset.sectionLine || "";
        renderInventorySectionOverlayBody(type);
      });
    });
    bindInventoryCatalogMenus(body, async (action, { dataset }) => {
      if (dataset.catalogKind === "sub-brand" || dataset.subBrandId) {
        if (action !== "delete") return;
        const subId = dataset.subBrandId || "";
        if (!subId) throw new Error("Sub-brand id missing.");
        if (!confirm(`Delete ${subBrandLabel.toLowerCase()} “${dataset.subBrandName || ""}” and its ${tax.productLinePlural}/${tax.variantPlural}/stock?`)) return;
        if (typeof deleteSubBrandInline !== "function") throw new Error("Catalog helper missing.");
        await deleteSubBrandInline(subId);
        if (String(state.inventoryActiveSubBrandId) === String(subId)) {
          state.inventoryActiveSubBrand = "";
          state.inventoryActiveSubBrandId = "";
        }
        await renderInventorySectionOverlayBody(type);
        renderInventoryList();
        return;
      }
      const lineId = dataset.lineId || "";
      const oldName = dataset.lineName || dataset.sectionLine || "";
      if (!lineId) throw new Error(`Save this ${tax.productLine.toLowerCase()} first, then edit/delete.`);
      if (action === "edit") {
        const list = body.querySelector(".inventory-brand-list") || body;
        openInventoryInlineRename(list, {
          placeholder: `${tax.productLine} name`,
          kind: "type-rename",
          value: oldName,
          onSave: async (lineName) => {
            await renameProductLineInline({
              lineId,
              brandName: activeBrand.brand,
              categoryName: type,
              lineName
            });
            syncInventoryCatalogMetaOnEntries(
              meta => String(meta.productLineId || "") === String(lineId)
                || (inventoryBrandKey(meta.brand) === inventoryBrandKey(activeBrand.brand)
                  && String(meta.productLine || "").toLowerCase() === String(oldName).toLowerCase()),
              { productLine: lineName, productLineId: lineId }
            );
            if (String(state.inventoryActiveProductLine || "").toLowerCase() === String(oldName).toLowerCase()) {
              state.inventoryActiveProductLine = lineName;
            }
            await renderInventorySectionOverlayBody(type);
          }
        });
        return;
      }
      if (action === "delete") {
        const lineRow = productLines.find(l => String(l.id) === String(lineId));
        const stockCount = (lineRow?.items || []).length;
        if (!confirm(stockCount
          ? `Delete ${tax.productLine.toLowerCase()} “${oldName}” and ${stockCount} stock item${stockCount === 1 ? "" : "s"}?`
          : `Delete ${tax.productLine.toLowerCase()} “${oldName}”?`)) return;
        await deleteProductLineInline(lineId);
        if (String(state.inventoryActiveProductLine || "").toLowerCase() === String(oldName).toLowerCase()) {
          state.inventoryActiveProductLine = "";
        }
        await renderInventorySectionOverlayBody(type);
        renderInventoryList();
      }
    });
    return;
  }

  // Brand without product lines → show variants directly
  if (activeBrand && !cfg.usesProductLines) {
    if (title) title.textContent = activeBrand.brand;
    if (desc) desc.textContent = `${(activeBrand.items || []).length} item${(activeBrand.items || []).length === 1 ? "" : "s"} · Stock ${activeBrand.stockLabel || inventoryQtySummary(activeBrand.items || [], "remainingQty")}`;
    body.innerHTML = `
      <div class="inventory-section-detail-head inventory-section-brand-head">
        <button type="button" class="tiny ghost" id="inventorySectionBackBtn"><i class="fa-solid fa-arrow-left"></i> ${escapeHtml(type)}</button>
        <div class="inventory-section-detail-actions">
          <button type="button" class="tiny ghost" id="inventorySectionAddBrandBtn"><i class="fa-solid fa-plus"></i> Stock</button>
          <button type="button" class="tiny ghost" id="inventorySectionOpenDraftBtn"><i class="fa-solid fa-cart-shopping"></i> Cart</button>
        </div>
      </div>
      <div class="inventory-variant-list">
        ${(activeBrand.items || []).length ? renderInventoryVariantRowsHtml(activeBrand.items) : `<div class="empty">No items yet.</div>`}
      </div>
    `;
    body.querySelector("#inventorySectionBackBtn")?.addEventListener("click", () => {
      state.inventoryActiveBrand = "";
      renderInventorySectionOverlayBody(type);
    });
    body.querySelector("#inventorySectionAddBrandBtn")?.addEventListener("click", () => openAddWizard({ brand: activeBrand.brand }));
    body.querySelector("#inventorySectionOpenDraftBtn")?.addEventListener("click", () => openSaleDraftModal());
    bindInventorySectionVariantActions(body, type);
    return;
  }

  // No brands: flat item list
  if (!cfg.usesBrands) {
    if (title) title.textContent = type;
    if (desc) desc.textContent = `${freshItems.length} item${freshItems.length === 1 ? "" : "s"} · Stock ${stockLabel}`;
    body.innerHTML = `
      <div class="inventory-section-detail-head">
        <div class="inventory-section-detail-actions">
          <button type="button" class="tiny ghost" id="inventorySectionAddBrandBtn"><i class="fa-solid fa-plus"></i> Item</button>
          <button type="button" class="tiny ghost" id="inventorySectionOpenDraftBtn"><i class="fa-solid fa-cart-shopping"></i> Cart</button>
        </div>
        <span class="help">${escapeHtml(cfg.hint || "Simple items in this category.")}</span>
      </div>
      <div class="inventory-variant-list">
        ${freshItems.length ? renderInventoryVariantRowsHtml(freshItems) : `<div class="empty">No items yet. Tap Item to add one.</div>`}
      </div>
    `;
    body.querySelector("#inventorySectionAddBrandBtn")?.addEventListener("click", () => openAddWizard());
    body.querySelector("#inventorySectionOpenDraftBtn")?.addEventListener("click", () => openSaleDraftModal());
    bindInventorySectionVariantActions(body, type);
    return;
  }

  // Level 1: brands in category
  if (title) title.textContent = type;
  if (desc) {
    desc.textContent = `${allBrands.length} ${primaryLabel.toLowerCase()}${allBrands.length === 1 ? "" : "s"} · ${freshItems.length} SKU${freshItems.length === 1 ? "" : "s"} · Stock ${stockLabel}`;
  }

  const showInlineBrandEditor = () => {
    const list = body.querySelector(".inventory-brand-list") || body;
    openInventoryMultiCreate(list, {
      placeholder: isBooks ? "Author name (e.g. George Orwell)" : "Brand name (e.g. Afnan, Apple, Nike)",
      kind: "brand",
      onSaveAll: async (names) => {
        if (typeof createBrandInline !== "function") throw new Error("Catalog helper missing.");
        let last = null;
        for (const brandName of names) {
          last = await createBrandInline({
            brandName,
            categoryName: type
          });
        }
        state.inventoryActiveBrand = last?.name || names[names.length - 1] || "";
        state.inventoryActiveSubBrand = "";
        state.inventoryActiveSubBrandId = "";
        state.inventoryActiveProductLine = "";
        await renderInventorySectionOverlayBody(type);
        renderInventoryList();
      }
    });
  };

  body.innerHTML = `
    <div class="inventory-section-detail-head">
      <div class="inventory-section-detail-actions">
        <button type="button" class="tiny ghost" id="inventorySectionAddBrandBtn"><i class="fa-solid fa-plus"></i> ${escapeHtml(primaryLabel)}</button>
        <button type="button" class="tiny ghost" id="inventorySectionAddStockWizardBtn"><i class="fa-solid fa-plus"></i> Stock</button>
        <button type="button" class="tiny ghost" id="inventorySectionOpenDraftBtn"><i class="fa-solid fa-cart-shopping"></i> Cart</button>
      </div>
      <span class="help">${escapeHtml(cfg.hint || tax.breadcrumb || `Tap an ${primaryLabel.toLowerCase()}, then continue.`)}</span>
    </div>
    <div class="inventory-brand-list">
      ${allBrands.length ? allBrands.map((brand, index) => {
        const brandId = brand.brandId || inventoryResolveBrandCatalogId(brand.brand);
        const menuKey = `brand-${brandId || brand.key || index}`;
        return `
        <div class="inventory-brand-row ${brand.inStock ? "" : "is-empty"}"
          data-catalog-kind="brand"
          data-section-brand="${escapeHtml(brand.brand)}"
          data-brand-id="${escapeHtml(brandId || "")}"
          data-brand-name="${escapeHtml(brand.brand)}">
          <button type="button" class="inventory-brand-row-hit" data-section-brand="${escapeHtml(brand.brand)}">
            <span class="inventory-section-item-index">#${index + 1}</span>
            <span class="inventory-brand-row-main">
              <strong>${escapeHtml(brand.brand)}</strong>
              <span>${escapeHtml(String(brand.lineCount || brand.variantCount || brand.items.length || 0))} ${tax.productLinePlural}/item · Stock ${escapeHtml(brand.stockLabel || "0")}</span>
            </span>
            <span class="badge ${brand.inStock ? "orange" : "green"}">${brand.inStock ? "In stock" : "Empty"}</span>
            <i class="fa-solid fa-chevron-right inventory-brand-chevron" aria-hidden="true"></i>
          </button>
          ${brandId ? inventoryCatalogRowMenuHtml(menuKey, { editLabel: `Edit ${primaryLabel.toLowerCase()}`, deleteLabel: `Delete ${primaryLabel.toLowerCase()}` }) : ""}
        </div>`;
      }).join("") : `<div class="empty">No ${escapeHtml(primaryPlural.toLowerCase())} yet. Tap + ${escapeHtml(primaryLabel)}.</div>`}
    </div>
  `;

  body.querySelector("#inventorySectionAddBrandBtn")?.addEventListener("click", showInlineBrandEditor);
  body.querySelector("#inventorySectionAddStockWizardBtn")?.addEventListener("click", () => openAddWizard());
  body.querySelector("#inventorySectionOpenDraftBtn")?.addEventListener("click", () => openSaleDraftModal());
  body.querySelectorAll(".inventory-brand-row-hit[data-section-brand]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.inventoryActiveBrand = btn.dataset.sectionBrand || "";
      state.inventoryActiveSubBrand = "";
      state.inventoryActiveSubBrandId = "";
      state.inventoryActiveProductLine = "";
      renderInventorySectionOverlayBody(type);
    });
  });
  bindInventoryCatalogMenus(body, async (action, { dataset }) => {
    const brandId = dataset.brandId || "";
    const oldName = dataset.brandName || dataset.sectionBrand || "";
    if (!brandId) throw new Error("Save this brand first, then edit/delete.");
    if (action === "edit") {
      const list = body.querySelector(".inventory-brand-list") || body;
      openInventoryInlineRename(list, {
        placeholder: "Brand name",
        kind: "brand-rename",
        value: oldName,
        onSave: async (brandName) => {
          await renameBrandInline({ brandId, brandName, categoryName: type });
          syncInventoryCatalogMetaOnEntries(
            meta => String(meta.brandId || "") === String(brandId)
              || inventoryBrandKey(meta.brand) === inventoryBrandKey(oldName),
            { brand: brandName, brandId }
          );
          if (inventoryBrandKey(state.inventoryActiveBrand) === inventoryBrandKey(oldName)) {
            state.inventoryActiveBrand = brandName;
          }
          await renderInventorySectionOverlayBody(type);
          renderInventoryList();
        }
      });
      return;
    }
    if (action === "delete") {
      const brandRow = allBrands.find(b => inventoryBrandKey(b.brand) === inventoryBrandKey(oldName));
      const stockCount = (brandRow?.items || []).length;
      const msg = stockCount
        ? `Delete ${primaryLabel.toLowerCase()} “${oldName}” and ALL ${stockCount} stock item${stockCount === 1 ? "" : "s"} (including sales history for those items)? This cannot be undone.`
        : `Delete ${primaryLabel.toLowerCase()} “${oldName}” and its ${tax.productLinePlural}/${tax.variantPlural}?`;
      if (!confirm(msg)) return;
      if (brandId) {
        try {
          await deleteBrandInline(brandId);
        } catch (err) {
          // Still purge stock even if catalog RPC fails / brand id missing.
          console.warn("Brand catalog delete failed; continuing stock purge.", err);
        }
      }
      // Drop local + domain stock rows for this brand so the UI updates immediately.
      await purgeInventoryEntriesForBrand(oldName, brandId);
      state.inventoryLazy.detailLoaded.clear();
      state.inventorySalesLoaded = false;
      if (inventoryBrandKey(state.inventoryActiveBrand) === inventoryBrandKey(oldName)) {
        state.inventoryActiveBrand = "";
        state.inventoryActiveProductLine = "";
      }
      try { await invalidateAndRefreshInventoryLazy(); } catch (_) {}
      await renderInventorySectionOverlayBody(type);
      renderInventoryList();
    }
  });
}


function inventorySearchMatchScore(group, term){
  const t = String(term || "").trim().toLowerCase();
  if (!t) return 0;
  const name = String(group.person_name || "").toLowerCase();
  const code = String(group.itemCode || "").toLowerCase();
  const brand = String(group.brand || "").toLowerCase();
  const line = String(group.productLine || "").toLowerCase();
  const variant = String(group.variantLabel || "").toLowerCase();
  const display = String(inventoryVariantDisplayName(group) || "").toLowerCase();
  if (code === t || name === t || display === t) return 100;
  if (variant === t || line === t || brand === t) return 90;
  if (code.startsWith(t) || name.startsWith(t) || display.startsWith(t) || variant.startsWith(t)) return 80;
  if (name.includes(t) || display.includes(t) || code.includes(t)) return 60;
  if (brand.includes(t) || line.includes(t) || variant.includes(t)) return 40;
  return 10;
}

function rankInventorySearchMatches(groups, term){
  const t = String(term || "").trim().toLowerCase();
  return [...(groups || [])]
    .map(group => ({ group, score: inventorySearchMatchScore(group, t) }))
    .filter(row => row.score > 0)
    .sort((a, b) =>
      b.score - a.score
      || String(a.group.person_name || "").localeCompare(String(b.group.person_name || ""), undefined, { sensitivity: "base" })
    )
    .map(row => row.group);
}

function renderInventorySearchResults(groups){
  const term = String(state.search.goods || "").trim();
  const ranked = rankInventorySearchMatches(groups, term);
  if (!ranked.length) {
    els.goodsList.innerHTML = `<div class="empty">No items match “${escapeHtml(term)}”. Try another name, brand, type, or code.</div>`;
    return;
  }
  const sections = getInventorySections(groups);
  els.goodsList.innerHTML = `
    <div class="inventory-search-results">
      <div class="inventory-search-results-head">
        <div>
          <strong>${escapeHtml(String(ranked.length))} match${ranked.length === 1 ? "" : "es"}</strong>
          <span>for “${escapeHtml(term)}” · Cart / Restock here</span>
        </div>
        <button type="button" class="tiny ghost" id="inventorySearchClearBtn">Clear search</button>
      </div>
      <div class="inventory-variant-list inventory-search-sku-list">
        ${renderInventoryVariantRowsHtml(ranked)}
      </div>
      ${sections.length ? `
        <details class="inventory-search-sections">
          <summary>Also in ${escapeHtml(String(sections.length))} categor${sections.length === 1 ? "y" : "ies"}</summary>
          <div class="inventory-sections-grid inventory-search-sections-grid">
            ${sections.map(section => `
              <button type="button" class="inventory-section-card inventory-search-section-card" data-inventory-section="${escapeHtml(section.type)}">
                <strong>${escapeHtml(section.type)}</strong>
                <span>${escapeHtml(String(section.items.length))} match${section.items.length === 1 ? "" : "es"}</span>
              </button>
            `).join("")}
          </div>
        </details>
      ` : ""}
    </div>
  `;

  els.goodsList.querySelector("#inventorySearchClearBtn")?.addEventListener("click", () => {
    state.search.goods = "";
    const input = document.getElementById("searchGoods");
    if (input) input.value = "";
    renderInventoryList();
  });
  els.goodsList.querySelectorAll("[data-inventory-section]").forEach(btn => {
    btn.addEventListener("click", () => {
      openInventorySectionOverlay(btn.dataset.inventorySection).catch(err => {
        alert(err?.message || "Could not open section.");
      });
    });
  });
  bindInventorySectionVariantActions(els.goodsList, "");
}

function getInventorySectionsForGrid(groups){
  // One rule: stock-backed sections + user-created empty categories.
  // Never flood the grid with unused preset categories (Electronics, etc.).
  const fromStock = getInventorySections(groups);
  const byType = new Map(fromStock.map(section => [normalizeInventoryItemType(section.type).toLowerCase(), section]));

  if (typeof ensureCustomCategoriesHydrated === "function") {
    try { ensureCustomCategoriesHydrated(); } catch (_) {}
  }

  const upsertEmpty = (cfg) => {
    if (!cfg) return;
    const type = normalizeInventoryItemType(cfg.name || cfg.slug || "");
    if (!type) return;
    const key = type.toLowerCase();
    const sortOrder = Number.isFinite(Number(cfg.sortOrder)) ? Number(cfg.sortOrder) : 9999;
    if (byType.has(key)) {
      const existing = byType.get(key);
      existing.categoryId = existing.categoryId || cfg.id || "";
      if (!Number.isFinite(Number(existing.sortOrder))) existing.sortOrder = sortOrder;
      return;
    }
    const emptyMeta = inventorySectionStockMeta([]);
    byType.set(key, {
      type,
      items: [],
      inStock: 0,
      brandCount: 0,
      stockLabel: "0",
      categoryId: cfg.id || "",
      sortOrder,
      empty: true,
      ...emptyMeta
    });
  };

  // Non-preset categories are always explicit grids. Built-in presets stay hidden
  // until stock exists or the user explicitly adds that preset (gridVisible).
  const catalog = typeof getWizardCategories === "function"
    ? getWizardCategories()
    : (Array.isArray(state.inventoryCategories) ? state.inventoryCategories : []);
  for (const cfg of catalog) {
    if (!cfg) continue;
    const isPreset = typeof isPresetCategory === "function" && isPresetCategory(cfg);
    if (isPreset && !cfg.gridVisible) continue;
    upsertEmpty(cfg);
  }

  const enriched = [...byType.values()].map(section => {
    const cfg = typeof getCategoryConfig === "function" ? getCategoryConfig(section.type) : null;
    const sortOrder = Number.isFinite(Number(section.sortOrder))
      ? Number(section.sortOrder)
      : (Number.isFinite(Number(cfg?.sortOrder)) ? Number(cfg.sortOrder) : 9999);
    const stockMeta = section.stockKey
      ? {
          inStockCount: section.inStockCount,
          lowStockCount: section.lowStockCount,
          soldCount: section.soldCount,
          stockKey: section.stockKey,
          stockLabelBadge: section.stockLabelBadge,
          badgeClass: section.badgeClass
        }
      : inventorySectionStockMeta(section.items || []);
    return {
      ...section,
      ...stockMeta,
      categoryId: section.categoryId || cfg?.id || "",
      sortOrder
    };
  });

  return sortInventorySectionsForGrid(enriched, getInventoryGridSortMode());
}

function ensureInventorySectionReorder(host){
  if (!host || host.dataset.inventoryGridReorderBound === "1") return;
  host.dataset.inventoryGridReorderBound = "1";

  const LONG_MS = 450;
  const MOVE_CANCEL_PX = 14;
  const itemSelector = ".inventory-section-card[data-inventory-section]:not(.inventory-section-add-card)";

  let pressTimer = null;
  let dragging = false;
  let suppressClick = false;
  let sourceEl = null;
  let ghost = null;
  let lastOver = null;
  let pressCard = null;
  let lastX = 0;
  let lastY = 0;
  const dragSession = typeof createCardReorderDragSession === "function"
    ? createCardReorderDragSession("inventory-grid-drag-lock")
    : null;

  const getGrid = () => host.querySelector(".inventory-sections-grid:not(.inventory-search-sections-grid)");

  const clearPress = () => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  };

  const clearSelection = () => {
    try {
      const sel = window.getSelection?.();
      if (sel && sel.rangeCount) sel.removeAllRanges();
    } catch (_) {}
  };

  const clearPressUi = () => {
    const grid = getGrid();
    grid?.classList.remove("inventory-grid-press-armed");
    if (pressCard) {
      pressCard.classList.remove("inventory-grid-pressing");
      pressCard = null;
    }
  };

  const cleanupDrag = () => {
    clearPress();
    clearPressUi();
    dragging = false;
    sourceEl = null;
    lastOver = null;
    const grid = getGrid();
    grid?.classList.remove("inventory-grid-reordering");
    dragSession?.stop();
    document.documentElement.classList.remove("inventory-grid-drag-lock");
    document.body.classList.remove("inventory-grid-drag-lock");
    host.querySelectorAll(".inventory-grid-drag-source, .inventory-grid-drop-target").forEach(el => {
      el.classList.remove("inventory-grid-drag-source", "inventory-grid-drop-target");
    });
    if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
    ghost = null;
  };

  const reorderableItems = () => {
    const grid = getGrid();
    if (!grid) return [];
    return Array.from(grid.querySelectorAll(itemSelector));
  };

  const beginDrag = (el, point) => {
    clearSelection();
    dragging = true;
    suppressClick = true;
    sourceEl = el;
    const grid = getGrid();
    grid?.classList.add("inventory-grid-reordering");
    document.documentElement.classList.add("inventory-grid-drag-lock");
    document.body.classList.add("inventory-grid-drag-lock");
    el.classList.add("inventory-grid-drag-source");
    try {
      if (point?.pointerId != null) el.setPointerCapture?.(point.pointerId);
    } catch (_) {}
    try {
      if (navigator.vibrate) navigator.vibrate(12);
    } catch (_) {}

    ghost = el.cloneNode(true);
    ghost.classList.add("inventory-grid-drag-ghost");
    ghost.querySelectorAll("button, a, input, select, textarea, .inventory-catalog-menu-wrap").forEach(node => {
      try { node.remove(); } catch (_) {}
    });
    ghost.style.width = `${el.getBoundingClientRect().width}px`;
    document.body.appendChild(ghost);
    const gx = Number(point?.clientX ?? lastX);
    const gy = Number(point?.clientY ?? lastY);
    ghost.style.left = `${gx - 24}px`;
    ghost.style.top = `${gy - 24}px`;
    const syncDropFromPoint = (x, y) => {
      const over = findDropTarget(x, y);
      if (lastOver && lastOver !== over) lastOver.classList.remove("inventory-grid-drop-target");
      if (over) {
        over.classList.add("inventory-grid-drop-target");
        applyLiveReorder(over);
      }
      lastOver = over;
    };
    dragSession?.start(grid || host, gy, {
      clientX: gx,
      onAutoScroll: (x, y) => syncDropFromPoint(x, y)
    });
  };

  const moveGhost = (clientX, clientY) => {
    if (!ghost) return;
    ghost.style.left = `${clientX - 24}px`;
    ghost.style.top = `${clientY - 24}px`;
  };

  const findDropTarget = (clientX, clientY) => {
    const under = document.elementFromPoint(clientX, clientY);
    const target = under?.closest?.(itemSelector);
    const grid = getGrid();
    if (!target || !grid || !grid.contains(target) || target === sourceEl) return null;
    return target;
  };

  const applyLiveReorder = (target) => {
    if (!sourceEl || !target || sourceEl === target) return;
    const items = reorderableItems();
    const from = items.indexOf(sourceEl);
    const to = items.indexOf(target);
    if (from < 0 || to < 0 || from === to) return;
    if (from < to) target.after(sourceEl);
    else target.before(sourceEl);
    const grid = getGrid();
    const addTile = grid?.querySelector?.(".inventory-section-add-card");
    if (addTile && grid) grid.appendChild(addTile);
  };

  const finishDrag = () => {
    if (!dragging || !sourceEl) {
      cleanupDrag();
      return;
    }
    const grid = getGrid();
    cleanupDrag();
    persistInventorySectionsOrderFromDom(grid).catch(err => {
      console.warn("Inventory grid order save failed:", err);
      alert(err?.message || "Could not save category order.");
    });
    setTimeout(() => { suppressClick = false; }, 0);
  };

  host.addEventListener("pointerdown", (e) => {
    if (e.button != null && e.button !== 0) return;
    if (e.target.closest("button, a, input, select, textarea, .inventory-catalog-menu-wrap, .inventory-section-card-actions, .inventory-section-add-card")) return;
    const card = e.target.closest(itemSelector);
    const grid = getGrid();
    if (!card || !grid || !grid.contains(card)) return;

    clearPress();
    clearPressUi();
    clearSelection();
    pressCard = card;
    card.classList.add("inventory-grid-pressing");
    grid.classList.add("inventory-grid-press-armed");

    const startX = e.clientX;
    const startY = e.clientY;
    lastX = startX;
    lastY = startY;
    const activePointerId = e.pointerId;

    pressTimer = setTimeout(() => {
      pressTimer = null;
      beginDrag(card, { clientX: lastX, clientY: lastY, pointerId: activePointerId });
    }, LONG_MS);

    const onMove = (ev) => {
      if (activePointerId != null && ev.pointerId != null && ev.pointerId !== activePointerId) return;
      lastX = ev.clientX;
      lastY = ev.clientY;
      if (!dragging) {
        const dx = Math.abs(ev.clientX - startX);
        const dy = Math.abs(ev.clientY - startY);
        if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) {
          clearPress();
          clearPressUi();
        }
        return;
      }
      if (ev.cancelable) ev.preventDefault();
      clearSelection();
      moveGhost(ev.clientX, ev.clientY);
      dragSession?.update(ev.clientX, ev.clientY);
      const over = findDropTarget(ev.clientX, ev.clientY);
      if (lastOver && lastOver !== over) lastOver.classList.remove("inventory-grid-drop-target");
      if (over) {
        over.classList.add("inventory-grid-drop-target");
        applyLiveReorder(over);
      }
      lastOver = over;
    };

    const onUp = (ev) => {
      if (activePointerId != null && ev?.pointerId != null && ev.pointerId !== activePointerId) return;
      document.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("pointerup", onUp, true);
      document.removeEventListener("pointercancel", onUp, true);
      if (dragging) finishDrag();
      else {
        clearPress();
        clearPressUi();
      }
    };

    document.addEventListener("pointermove", onMove, { passive: false, capture: true });
    document.addEventListener("pointerup", onUp, { capture: true });
    document.addEventListener("pointercancel", onUp, { capture: true });
  }, { passive: true });

  host.addEventListener("click", (e) => {
    if (!suppressClick) return;
    e.preventDefault();
    e.stopPropagation();
    suppressClick = false;
  }, true);

  host.addEventListener("selectstart", (e) => {
    const grid = getGrid();
    if (dragging || pressTimer || grid?.classList.contains("inventory-grid-press-armed") || grid?.classList.contains("inventory-grid-reordering")) {
      e.preventDefault();
    }
  });

  host.addEventListener("contextmenu", (e) => {
    if (!e.target.closest(itemSelector)) return;
    if (dragging || pressTimer || getGrid()?.classList.contains("inventory-grid-press-armed")) e.preventDefault();
  });
}

function renderInventorySectionsGrid(groups){
  syncInventoryGridSortSelect();
  const sections = getInventorySectionsForGrid(groups);
  const cardsHtml = sections.map((section, index) => {
        const cfgId = section.categoryId
          || (typeof getCategoryConfig === "function" ? (getCategoryConfig(section.type)?.id || "") : "");
        const menuKey = `section-${cfgId || section.type || index}`;
        const badgeClass = section.badgeClass || (section.inStock ? "orange" : "green");
        const badgeLabel = section.stockLabelBadge || (section.inStock ? "In stock" : "Empty");
        return `
        <article class="inventory-section-card"
          data-inventory-section="${escapeHtml(section.type)}"
          data-catalog-kind="category"
          data-category-id="${escapeHtml(cfgId || "")}"
          data-category-name="${escapeHtml(section.type)}"
          role="button" tabindex="0">
          <div class="inventory-section-card-top">
            <strong>${escapeHtml(section.type)}</strong>
            <span class="badge ${escapeHtml(badgeClass)}">${escapeHtml(badgeLabel)}</span>
          </div>
          <div class="inventory-section-card-meta">
            <span>${escapeHtml(String(section.items.length))} item${section.items.length === 1 ? "" : "s"}</span>
            <span>${escapeHtml(String(section.brandCount))} brand${section.brandCount === 1 ? "" : "s"}</span>
            <span>Stock ${escapeHtml(section.stockLabel || "0")}</span>
          </div>
          <div class="inventory-section-card-actions" onclick="event.stopPropagation()">
            <button type="button" class="tiny ghost inventorySectionActionBtn" data-action="open" data-section="${escapeHtml(section.type)}">Open</button>
            <button type="button" class="tiny ghost inventorySectionActionBtn" data-action="add-brand" data-section="${escapeHtml(section.type)}" title="Add item in this category">+ Add</button>
            <button type="button" class="btn soft tiny inventorySectionActionBtn inventory-section-cart-btn" data-action="sell" data-section="${escapeHtml(section.type)}" title="Open cart for this category"><i class="fa-solid fa-cart-shopping" aria-hidden="true"></i><span>Cart</span></button>
            ${inventoryCatalogRowMenuHtml(menuKey, {
              editLabel: "Edit",
              deleteLabel: "Delete",
              canEdit: true,
              canDelete: true,
              showChart: true,
              chartLabel: "Detailed Chart"
            })}
          </div>
        </article>`;
      }).join("");
  els.goodsList.innerHTML = `
    <div class="inventory-sections-grid">
      ${cardsHtml}
      <article class="inventory-section-card inventory-section-add-card" id="inventoryAddCategoryTile" role="button" tabindex="0" title="Add category">
        <div class="inventory-section-add-inner">
          <span class="inventory-section-add-plus" aria-hidden="true">+</span>
          <strong>Add category</strong>
          <span>Create a new grid</span>
        </div>
      </article>
    </div>
  `;
  ensureInventorySectionReorder(els.goodsList);

  const openSection = (type, focusSell = false) => {
    openInventorySectionOverlay(type, { focusSell }).catch(err => {
      console.warn("Section overlay failed:", err);
      alert(err?.message || "Could not open section.");
    });
  };

  const startCategoryCreateOverlay = () => {
    openInventoryCategoryBuilderOverlay({ mode: "create" });
  };

  els.goodsList.querySelector("#inventoryAddCategoryTile")?.addEventListener("click", startCategoryCreateOverlay);
  els.goodsList.querySelector("#inventoryAddCategoryTile")?.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      startCategoryCreateOverlay();
    }
  });
  els.goodsList.querySelectorAll(".inventory-section-card[data-inventory-section]:not(.inventory-section-add-card)").forEach(card => {
    card.addEventListener("click", () => openSection(card.dataset.inventorySection));
    card.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openSection(card.dataset.inventorySection);
      }
    });
  });
  els.goodsList.querySelectorAll(".inventorySectionActionBtn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      const type = btn.dataset.section;
      if (btn.dataset.action === "open") {
        openSection(type, false);
        return;
      }
      if (btn.dataset.action === "sell") {
        openSection(type, true);
        return;
      }
      if (btn.dataset.action === "add-brand") {
        if (typeof openInventoryAddItemWizard === "function") openInventoryAddItemWizard({ seedType: type });
        else {
          const sample = groups.find(g => normalizeInventoryItemType(g.itemType) === type);
          openGoodsModal("bought", {
            seedFromGroupId: sample?.group_id || "",
            seedType: type,
            addBrand: true
          });
        }
      }
    });
  });
  bindInventoryCatalogMenus(els.goodsList, async (action, { dataset }) => {
    const oldName = dataset.categoryName || dataset.inventorySection || "";
    const cfg = typeof getCategoryConfig === "function" ? getCategoryConfig(oldName) : {};
    const categoryId = dataset.categoryId || cfg.id || "";
    if (action === "chart") {
      if (typeof openSectionDetailsOverlay === "function") {
        openSectionDetailsOverlay("inventory", { itemType: oldName });
      }
      return;
    }
    if (action === "edit") {
      openInventoryCategoryBuilderOverlay({
        mode: "edit",
        categoryName: oldName,
        categoryId,
        cfg
      });
      return;
    }
    if (action === "delete") {
      const section = sections.find(s => normalizeInventoryItemType(s.type) === normalizeInventoryItemType(oldName));
      const stockCount = (section?.items || []).length;
      const isLocalCustom = (Array.isArray(state.inventoryCustomCategories) ? state.inventoryCustomCategories : [])
        .some(c => normalizeInventoryItemType(c.name).toLowerCase() === normalizeInventoryItemType(oldName).toLowerCase());
      // Empty local-only customs (no DB id yet) are still deletable from the grid.
      if (!categoryId && !stockCount && !isLocalCustom) {
        throw new Error(`“${oldName}” is not saved as a catalog category yet. Run migration 051/055/057/061, or recreate it with +.`);
      }
      const warn = `Delete category “${oldName}”?\n\nThis permanently removes all brands, sub-brands, types, variants, stock items, and related sales inside it. Recreating the same name starts empty.\n\nThis cannot be undone.`;
      if (!confirm(warn)) return;
      if (typeof requireSmartPinConfirm !== "function") {
        throw new Error("Smart PIN confirmation is unavailable.");
      }
      const pinOk = await requireSmartPinConfirm({
        title: "Delete category",
        description: `Enter your Smart Pin to permanently delete “${oldName}” and everything inside it.`,
        confirmLabel: "Delete category",
        accent: "danger"
      });
      if (!pinOk) return;
      // Capture brand ids before purge so we can force-delete catalog leftovers.
      const typeKey = normalizeInventoryItemType(oldName).toLowerCase();
      const brandsToWipe = (Array.isArray(state.inventoryBrands) ? state.inventoryBrands : [])
        .filter(b => normalizeInventoryItemType(b?.item_type || "").toLowerCase() === typeKey)
        .map(b => b.id)
        .filter(Boolean);
      if (categoryId) {
        await deleteCategoryInline(categoryId);
      } else {
        // Local-only custom (or missing id): drop from memory + localStorage.
        if (Array.isArray(state.inventoryCustomCategories)) {
          state.inventoryCustomCategories = state.inventoryCustomCategories.filter(c =>
            normalizeInventoryItemType(c.name).toLowerCase() !== typeKey
          );
          try {
            if (typeof writeStoredCustomCategories === "function") {
              writeStoredCustomCategories(state.inventoryCustomCategories);
            }
          } catch (_) {}
        }
        for (const brandId of brandsToWipe) {
          try {
            if (typeof deleteBrandInline === "function") await deleteBrandInline(brandId);
          } catch (err) {
            console.warn("Brand wipe during category delete failed", brandId, err);
          }
        }
      }
      await purgeInventoryEntriesForCategory(oldName);
      // Extra belt-and-suspenders: drop any brand that survived the RPC matching gap.
      for (const brandId of brandsToWipe) {
        try {
          if (typeof deleteBrandInline === "function") await deleteBrandInline(brandId);
        } catch (_) {}
      }
      state.inventoryLazy.detailLoaded.clear();
      state.inventorySalesLoaded = false;
      state.inventoryBrandsLoaded = false;
      if (typeof loadInventoryCategories === "function") {
        try { await loadInventoryCategories(true); } catch (_) {}
      }
      if (typeof ensureInventoryBrandsLoaded === "function") {
        try { await ensureInventoryBrandsLoaded(true); } catch (_) {}
      }
      renderInventoryList();
      invalidateAndRefreshInventoryLazy().then(() => renderInventoryList()).catch(() => {});
    }
  });
}

function renderInventoryList(){
  refreshInventoryTypeFilterOptions();
  refreshInventoryBrandFilterOptions();
  loadSaleDraftFromStorage();
  if (typeof applyCartChrome === "function") applyCartChrome();
  const paint = () => {
    try { if (typeof ensureCustomCategoriesHydrated === "function") ensureCustomCategoriesHydrated(); } catch (_) {}
    const groups = getGoodsGroups();
    if (state.inventoryView === "customers") renderInventoryOutstandingSection();
    // Never hide category grids behind a loading blank — empty customs must stay visible.
    if (state.inventoryLazy.loading && !groups.length){
      if ((state.inventoryStockLayout || "category") === "list") {
        renderInventoryStockListView([]);
      } else {
        renderInventorySectionsGrid([]);
      }
      updateSaleDraftDock();
      return;
    }
    if (!groups.length){
      const filters = [];
      if (state.inventoryItemTypeFilter && state.inventoryItemTypeFilter !== "all") filters.push("type");
      if (state.inventoryBrandFilter && state.inventoryBrandFilter !== "all") filters.push("brand");
      const searching = String(state.search.goods || "").trim();
      if (searching) {
        els.goodsList.innerHTML = `<div class="empty">No items match “${escapeHtml(searching)}”. Try another name, brand, type, or code.</div>`;
      } else if (filters.length) {
        els.goodsList.innerHTML = `<div class="empty">No inventory items found for this filter. Use + to add an item.</div>`;
      } else if ((state.inventoryStockLayout || "category") === "list") {
        els.goodsList.innerHTML = `<div class="empty">No inventory stock to list. Use + to add an item.</div>`;
      } else {
        renderInventorySectionsGrid([]);
      }
      updateSaleDraftDock();
      return;
    }
    if (String(state.search.goods || "").trim()) {
      renderInventorySearchResults(groups);
    } else if ((state.inventoryStockLayout || "category") === "list") {
      renderInventoryStockListView(groups);
    } else {
      renderInventorySectionsGrid(groups);
    }
    const sectionModal = document.getElementById("inventorySectionModal");
    if (sectionModal && !sectionModal.classList.contains("hide") && state.inventoryActiveSection) {
      renderInventorySectionOverlayBody(state.inventoryActiveSection).catch(() => {});
    }
    updateSaleDraftDock();
    ensureInventoryItemDetailsDelegation();
  };
  // Paint from local customs immediately, then load DB categories once and re-paint.
  paint();
  if (typeof loadInventoryCategories === "function") {
    const forceDb = !state.inventoryCategoriesLoaded;
    Promise.resolve(loadInventoryCategories(forceDb))
      .catch(() => {})
      .then(() => paint());
  }
}

function inventoryStockListItemName(group){
  const full = String(group?.person_name || "").trim();
  if (full) return full;
  if (typeof inventoryVariantDisplayName === "function") {
    const variant = String(inventoryVariantDisplayName(group) || "").trim();
    if (variant) return variant;
  }
  const bits = [group?.brand, group?.productLine || group?.variantLabel, group?.itemCode].filter(Boolean);
  return bits.join(" · ") || "Unnamed item";
}

function renderInventoryStockListView(groups){
  const list = Array.isArray(groups) ? groups.slice() : [];
  list.sort((a, b) => inventoryStockListItemName(a).localeCompare(inventoryStockListItemName(b), undefined, { sensitivity: "base" }));
  if (!list.length) {
    els.goodsList.innerHTML = `<div class="empty">No inventory stock to list.</div>`;
    return;
  }
  const rows = list.map(group => {
    const name = inventoryStockListItemName(group);
    const category = resolveInventoryItemCategory(group);
    const totalQty = inventoryQtyLabel(group.boughtQty, category, group);
    const soldQty = inventoryQtyLabel(group.soldQty, category, group);
    const stockQty = inventoryQtyLabel(group.remainingQty, category, group);
    const pl = Number(group.profitLoss || 0);
    const profit = pl > 0.00000001 ? money(pl, group.currency) : money(0, group.currency);
    const loss = pl < -0.00000001 ? money(Math.abs(pl), group.currency) : money(0, group.currency);
    const inStock = Number(group.remainingQty || 0) > 0.00000001;
    return `
      <button type="button" class="inventory-stock-list-row${inStock ? "" : " is-sold"}" data-inventory-stock-open="${escapeHtml(group.group_id)}" title="${escapeHtml(name)}">
        <span class="inventory-stock-list-name">${escapeHtml(name)}</span>
        <span class="inventory-stock-list-cell" data-label="Total"><small>Total</small><strong>${escapeHtml(totalQty)}</strong></span>
        <span class="inventory-stock-list-cell" data-label="Sold"><small>Sold</small><strong>${escapeHtml(soldQty)}</strong></span>
        <span class="inventory-stock-list-cell" data-label="Stock"><small>In stock</small><strong class="${inStock ? "is-stock" : "is-empty"}">${escapeHtml(stockQty)}</strong></span>
        <span class="inventory-stock-list-cell is-profit" data-label="Profit"><small>Profit</small><strong>${profit}</strong></span>
        <span class="inventory-stock-list-cell is-loss" data-label="Loss"><small>Loss</small><strong>${loss}</strong></span>
      </button>
    `;
  }).join("");

  els.goodsList.innerHTML = `
    <div class="inventory-stock-list" role="list">
      <div class="inventory-stock-list-head" aria-hidden="true">
        <span class="inventory-stock-list-name">Item</span>
        <span>Total</span>
        <span>Sold</span>
        <span>In stock</span>
        <span>Profit</span>
        <span>Loss</span>
      </div>
      ${rows}
    </div>
  `;

  els.goodsList.querySelectorAll("[data-inventory-stock-open]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.inventoryStockOpen;
      if (!id) return;
      if (typeof openInventoryItemDetailsOverlay === "function") {
        Promise.resolve(openInventoryItemDetailsOverlay(id)).catch(() => {});
      }
    });
  });
}


function syncInventoryInvoicesBtn(details){
  if (!details) return;
  const btn = details.querySelector("[data-inventory-invoices]");
  if (btn) btn.setAttribute("aria-expanded", details.open ? "true" : "false");
}

function ensureInventoryItemDetailsDelegation(){
  const container = els.goodsList;
  if (!container || container.dataset.itemDetailsDelegated === "1") return;
  container.dataset.itemDetailsDelegated = "1";

  const interactiveSel = "button, a, input, select, textarea, .menu-wrap, .menu-dropdown, .lt-action, .inventory-inline-actions, .card-action-grid, .inventory-item-history";

  container.addEventListener("click", e => {
    const invoicesBtn = e.target.closest("[data-inventory-invoices]");
    if (invoicesBtn && container.contains(invoicesBtn)) {
      e.preventDefault();
      e.stopPropagation();
      const details = invoicesBtn.closest("details.inventory-item-card");
      if (!details) return;
      const groupId = invoicesBtn.dataset.inventoryInvoices || details.querySelector("[data-inventory-item-details]")?.dataset.inventoryItemDetails || "";
      const willOpen = !details.open;
      details.open = willOpen;
      syncInventoryInvoicesBtn(details);
      if (willOpen && groupId && isInventoryLazyMode()) {
        ensureInventoryItemDetailLoaded(groupId)
          .then(() => {
            if (getActiveTabKey() === "goods") renderInventoryList();
            const again = Array.from(els.goodsList?.querySelectorAll("[data-inventory-invoices]") || [])
              .find(btn => btn.dataset.inventoryInvoices === groupId)
              ?.closest("details");
            if (again) {
              again.open = true;
              syncInventoryInvoicesBtn(again);
            }
          })
          .catch(err => console.warn("Inventory detail load failed:", err));
      }
      return;
    }

    if (e.target.closest(interactiveSel)) {
      // Keep native <summary> from toggling when using action controls.
      if (e.target.closest("summary") && e.target.closest("button, a, .menu-wrap, .menu-dropdown, .lt-action, .inventory-inline-actions, .card-action-grid")) {
        e.preventDefault();
      }
      return;
    }
    const banner = e.target.closest("[data-inventory-item-details]");
    if (!banner || !container.contains(banner)) return;
    e.preventDefault();
    e.stopPropagation();
    openInventoryItemDetailsOverlay(banner.dataset.inventoryItemDetails);
  });

  container.addEventListener("toggle", e => {
    if (!(e.target instanceof HTMLDetailsElement)) return;
    if (!e.target.classList.contains("inventory-item-card")) return;
    syncInventoryInvoicesBtn(e.target);
  }, true);

  container.addEventListener("keydown", e => {
    if (e.key !== "Enter" && e.key !== " ") return;
    if (e.target.closest(interactiveSel)) return;
    const banner = e.target.closest("[data-inventory-item-details]");
    if (!banner || !container.contains(banner)) return;
    e.preventDefault();
    openInventoryItemDetailsOverlay(banner.dataset.inventoryItemDetails);
  });
}
