/* Modularized from script.js lines 21806-22600 — loans create/payment/edit. Load order must be preserved. */
function closeModal(modalId){
  if (modalId === "btcWifQrScannerModal") {
    btcStopWifQrScanner();
  }
  if (modalId === "entryModal") {
    state.modalInstallment = false;
  }
  if (modalId === "sectionDetailsModal") {
    destroySectionDetailsCharts();
    clearSectionDetailsActions();
    inventoryDetailsSelectedCurrency = "";
    inventoryDetailsItemTypeFilter = "";
  }
  if (modalId === "assetDetailModal" && typeof destroyAssetCharts === "function") {
    destroyAssetCharts();
  }
  if (modalId === "inventorySectionModal") {
    state.inventoryActiveSection = "";
    state.inventoryActiveBrand = "";
    state.inventoryActiveProductLine = "";
  }
  if (modalId === "reminderAlertModal") {
    dismissReminderAlert("done");
    return;
  }
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.add("hide");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  if (modalId === "noteReminderModal") {
    try {
      queueMicrotask(() => {
        if (typeof presentNextReminderAlert === "function") presentNextReminderAlert();
      });
    } catch (_) {}
  }
}

function isBackupMode(){
  return state.dataSource === "backup";
}

function refreshBackupView(){
  applyEntries(state.entries, "backup");
}

async function createPrincipal(form){
  const fd = new FormData(form);
  const direction = String(fd.get("direction") || "");
  const groupId = crypto.randomUUID();
  const walletId = String(fd.get("loan_wallet_id") || "").trim();
  const downPayment = state.modalInstallment
    ? roundInstallmentMoney(fd.get("down_payment"), String(fd.get("currency") || "AED"))
    : 0;

  const payload = {
    group_id: groupId,
    direction,
    entry_kind: "principal",
    person_name: String(fd.get("person_name") || "").trim(),
    currency: String(fd.get("currency") || "").trim(),
    principal_amount: finiteMoney(fd.get("principal_amount")),
    action_amount: null,
    loan_date: fd.get("loan_date"),
    action_date: null,
    notes: String(fd.get("notes") || "").trim() || null
  };

  if (state.modalInstallment) {
    const count = Math.floor(finiteMoney(fd.get("installment_count")));
    if (count < 2 || count > 120) throw new Error("Enter between 2 and 120 installments.");
    if (downPayment < 0 || downPayment >= payload.principal_amount) {
      throw new Error("Down payment must be zero or less than the total plan amount.");
    }
    payload.notes = upsertInstallmentMetaInNote(
      payload.notes,
      buildInstallmentScheduleMeta(
        payload.principal_amount,
        count,
        payload.currency,
        payload.loan_date,
        downPayment
      )
    );
  }

  if (!payload.person_name || !payload.currency || !(payload.principal_amount > 0) || !payload.loan_date) {
    throw new Error("Complete all required fields.");
  }
  
  // Validate currency
  validateCurrencyForForm(fd);

  // Validate wallet balance before saving (loan given = money out)
  if (walletId && direction === "given") {
    const account = getExpenseAccounts({ applyUiFilters: false }).find(a => a.group_id === walletId);
    if (account) {
      if (account.currency !== payload.currency) throw new Error("Selected wallet currency does not match the loan currency.");
      if (payload.principal_amount > account.balance) throw new Error(`Insufficient wallet balance. Available: ${formatReportAmount(account.balance, account.currency)}.`);
    }
  }

  const entriesToSave = [payload];
  if (state.modalInstallment && downPayment > 0) {
    entriesToSave.push({
      group_id: groupId,
      direction,
      entry_kind: "partial",
      person_name: payload.person_name,
      currency: payload.currency,
      principal_amount: null,
      action_amount: downPayment,
      loan_date: payload.loan_date,
      action_date: payload.loan_date,
      notes: upsertInstallmentMetaInNote("Down payment", {
        paymentType: "down_payment"
      })
    });
  }
  saveEntriesImmediately(
    entriesToSave.length === 1 ? entriesToSave[0] : entriesToSave,
    { label: state.modalInstallment ? "Installment plan" : "Loan" }
  );

  // Create linked wallet entry (loan already saved — surface wallet sync failures clearly)
  if (walletId) {
    try {
      await createWalletEntryForLoanPrincipal(walletId, payload.principal_amount, payload.loan_date, payload.person_name, direction, payload.currency);
    } catch (err) {
      console.error("Linked wallet entry failed after loan save.", err);
      alert(`Loan was saved, but the linked wallet update failed: ${err?.message || err}. Check the wallet balance and add a matching expense/top-up if needed.`);
    }
  }

  form.reset();
  setCurrencyChoice(form, "AED");
  defaultDateInputs(form);
  closeModal("entryModal");
  if (state.modalInstallment) activate("installments");
  state.modalInstallment = false;
}

async function createPayment(form){
  const fd = new FormData(form);
  const direction = String(fd.get("direction") || "");
  const groupId = String(fd.get("group_id") || "");
  const count = parseInt(els.multiEntryCount.value) || 1;
  const walletId = String(fd.get("payment_wallet_id") || "").trim();

  if (!groupId) throw new Error("Please choose a loan.");

  const principalEntry = state.entries.find(e => e.group_id === groupId && e.entry_kind === "principal");
  if (!principalEntry) throw new Error("Selected loan could not be found.");
  
  // Validate that the principal's currency is allowed
  const tempFormData = new FormData();
  tempFormData.append('currency', principalEntry.currency);
  validateCurrencyForForm(tempFormData);

  const installmentPlan = (state.modalInstallment || hasInstallmentTag(principalEntry.notes))
    ? getInstallmentPlanGroup(groupId)
    : null;
  const scheduled = !!installmentPlan?.schedule;

  const group = groupByLoan(getActiveEntries().filter(e => e.group_id === groupId))[0];
  let currentRemaining = scheduled
    ? Number(installmentPlan.schedule.remainingTotal || 0)
    : calculateLoan(group).remaining;

  let totalAmount = 0;
  const paymentCount = scheduled ? 1 : count;
  for(let i=0; i<paymentCount; i++){
     const amt = finiteMoney(fd.get(`action_amount_${i}`));
     const dt = fd.get(`action_date_${i}`);
     if (!amt && !dt) continue;
     if (!Number.isFinite(amt) || amt <= 0 || !dt) {
       throw new Error("Each payment row needs both a valid amount and a date.");
     }
     totalAmount += amt;
  }
  totalAmount = roundInstallmentMoney(totalAmount, principalEntry.currency);

  if (!(totalAmount > 0)) throw new Error("Enter a payment amount.");
  if (totalAmount > currentRemaining + 0.00000001){
    throw new Error(`Total amount (${totalAmount}) exceeds remaining balance (${currentRemaining}).`);
  }

  // Validate wallet for returned back (money goes out)
  if (walletId && direction === "taken") {
    const account = getExpenseAccounts({ applyUiFilters: false }).find(a => a.group_id === walletId);
    if (account) {
      if (account.currency !== principalEntry.currency) throw new Error("Selected wallet currency does not match the loan currency.");
      if (totalAmount > account.balance) throw new Error(`Insufficient wallet balance for this repayment. Available: ${formatReportAmount(account.balance, account.currency)}.`);
    }
  }

  const payloads = [];
  if (scheduled) {
    const amt = Number(fd.get("action_amount_0") || 0);
    const dt = fd.get("action_date_0");
    const nt = String(fd.get("notes_0") || "").trim() || null;
    if (!amt || !dt) throw new Error("Please fill out amount and date.");
    const allocation = allocateInstallmentPayment(installmentPlan.schedule, amt);
    if (!(allocation.applied > 0)) throw new Error("No open installments to apply this payment to.");
    if (allocation.leftover > 0.00000001) {
      throw new Error(`Payment exceeds open installments by ${moneyText(allocation.leftover, principalEntry.currency)}.`);
    }
    const remainingAfter = roundInstallmentMoney(currentRemaining - allocation.applied, principalEntry.currency);
    let notes = upsertInstallmentMetaInNote(nt, {
      allocation: formatInstallmentAllocation(allocation.allocations)
    });
    payloads.push({
      group_id: groupId,
      direction,
      entry_kind: remainingAfter <= 0.00000001 ? "full" : "partial",
      person_name: principalEntry.person_name,
      currency: principalEntry.currency,
      principal_amount: null,
      action_amount: allocation.applied,
      loan_date: principalEntry.loan_date,
      action_date: dt,
      notes
    });
  } else {
    for(let i=0; i<count; i++){
      const amt = finiteMoney(fd.get(`action_amount_${i}`));
      const dt = fd.get(`action_date_${i}`);
      const nt = String(fd.get(`notes_${i}`) || "").trim() || null;

      if(!(amt > 0) || !dt) continue;

      currentRemaining = Math.max(currentRemaining - amt, 0);
      payloads.push({
        group_id: groupId,
        direction,
        entry_kind: currentRemaining <= 0 ? "full" : "partial",
        person_name: principalEntry.person_name,
        currency: principalEntry.currency,
        principal_amount: null,
        action_amount: amt,
        loan_date: principalEntry.loan_date,
        action_date: dt,
        notes: (state.modalInstallment || hasInstallmentTag(principalEntry.notes))
          ? normalizeInstallmentNote(nt, true)
          : nt
      });
    }
  }

  if(payloads.length === 0) throw new Error("Please fill out amount and date.");

  saveEntriesImmediately(payloads, { label: state.modalInstallment ? "Installment payment" : "Payment" });

  // Create linked wallet entries for each payment row
  if (walletId) {
    try {
      for (const p of payloads) {
        await createWalletEntryForPayment(walletId, p.action_amount, p.action_date, principalEntry.person_name, direction, principalEntry.currency);
      }
    } catch (err) {
      console.error("Linked wallet entry failed after payment save.", err);
      alert(`Payment was saved, but the linked wallet update failed: ${err?.message || err}. Check the wallet and add a matching entry if needed.`);
    }
  }

  form.reset();
  els.multiEntryCount.value = 1;
  renderMultiEntries(1);
  closeModal("entryModal");
  if (state.modalInstallment) activate("installments");
  state.modalInstallment = false;
}

async function submitEdit(){
  const id = state.editId;
  if (!id) return;
  const currentEntry = state.entries.find(e => e.id === id);
  if (!currentEntry) return;

  assertTeamCapability(
    hasGoodsTag(currentEntry.notes) ? "can_edit_invoices" : "can_edit_entries",
    hasGoodsTag(currentEntry.notes) ? "You do not have permission to edit invoices." : "You do not have permission to edit entries."
  );

  const amt = finiteMoney(document.getElementById('editAmount').value);
  const dt = document.getElementById('editDate').value;
  const nt = document.getElementById('editNotes').value.trim() || null;

  if(state.editKind === "principal"){
    const nm = document.getElementById('editName').value.trim();
    const curr = document.getElementById('editCurrency').value;
    if (!nm || !curr || !(amt > 0) || !dt) throw new Error("Complete required fields.");
    
    let updatedNotes = nt;
    
    // Handle goods entries - update metadata when price/amount changes
    if (hasGoodsTag(currentEntry.notes)) {
      const currentMeta = goodsMetaFromNotes(currentEntry.notes);
      const itemCategory = normalizeInventoryCategory(currentMeta.itemCategory);
      const currentBoughtQty = normalizeStoredInventoryQty(currentMeta.boughtQty, itemCategory, 1);
      const newUnitActualPrice = amt / currentBoughtQty;
      
      updatedNotes = upsertGoodsMetaInNote(nt, {
        ...currentMeta,
        boughtQty: currentBoughtQty,
        unitActualPrice: newUnitActualPrice,
        ...getEditTaxMeta(currentEntry, amt)
      });
    } else if (hasExpenseAccountTag(currentEntry.notes)) {
      const accountTypeSelect = document.getElementById("editAccountType");
      const nextAccountType = String(accountTypeSelect?.value || expenseMetaFromNotes(currentEntry.notes).accountType || "Bank Account").trim() || "Bank Account";
      updatedNotes = upsertExpenseMetaInNote(nt, {
        ...expenseMetaFromNotes(currentEntry.notes),
        rowType: "ACCOUNT",
        accountType: nextAccountType
      });
    }
    
    const updatedEntry = { ...currentEntry, person_name: nm, currency: curr, principal_amount: amt, loan_date: dt, notes: updatedNotes };
    const patchBody = { person_name: nm, currency: curr, principal_amount: amt, loan_date: dt, notes: updatedNotes };
    state.entries = state.entries.map(entry => entry.id === id ? updatedEntry : entry);
    if (!isBackupMode()) queueDatabasePatch(id, patchBody, "Entry", updatedEntry);
  } else {
    if (!(amt > 0) || !dt) throw new Error("Complete required fields.");
    let editedNotes = nt;
    
    // Handle goods sold entries - update metadata when sold amount changes
    if (hasGoodsTag(currentEntry.notes)) {
      const currentMeta = goodsMetaFromNotes(currentEntry.notes);
      const itemCategory = normalizeInventoryCategory(currentMeta.itemCategory);
      const currentSoldQty = normalizeStoredInventoryQty(currentMeta.soldQty, itemCategory, 1);
      const newUnitSoldPrice = amt / currentSoldQty;
      
      editedNotes = upsertGoodsMetaInNote(nt, {
        ...currentMeta,
        soldQty: currentSoldQty,
        unitSoldPrice: newUnitSoldPrice,
        ...getEditTaxMeta(currentEntry, amt)
      });
    } else if (hasExpenseAccountTag(currentEntry.notes)) {
      const expenseMeta = expenseMetaFromNotes(currentEntry.notes);
      editedNotes = upsertExpenseMetaInNote(nt, {
        ...expenseMeta,
        ...getEditTaxMeta(currentEntry, amt)
      });
    }
    
    const updatedEntry = { ...currentEntry, action_amount: amt, action_date: dt, notes: editedNotes };
    const patchBody = { action_amount: amt, action_date: dt, notes: editedNotes };
    state.entries = state.entries.map(entry => entry.id === id ? updatedEntry : entry);
    if (!isBackupMode()) queueDatabasePatch(id, patchBody, "Entry", updatedEntry);
  }

  closeModal("editModal");
  if (isBackupMode()) refreshBackupView();
  else {
    renderAll();
    if (hasExpenseAccountTag(currentEntry.notes) && state.expenseLazy.rpcAvailable !== false) {
      Promise.resolve()
        .then(() => new Promise(resolve => setTimeout(resolve, 280)))
        .then(() => invalidateAndRefreshExpenseLazy({ refreshActivity: true }))
        .then(ok => {
          if (!ok) return;
          invalidateExpenseAccountsSyncCache();
          renderExpenseOverviewWallets();
          if (getActiveTabKey() === "expenses") renderExpensesList();
        })
        .catch(() => {});
    }
  }
  const edited = state.entries.find(e => e.id === id);
  if (edited) logEntryUpdated(edited);
}

async function renamePersonRecords(personNameEncoded, direction){
  if (!teamCapability("can_edit_entries")) {
    alert("You do not have permission to edit entries.");
    return;
  }
  const currentName = decodeURIComponent(personNameEncoded || "").trim();
  if (!currentName || !direction) return;
  const nextName = prompt("Enter new person name:", currentName);
  if (nextName === null) return;
  const cleanedName = nextName.trim();
  if (!cleanedName) {
    alert("Name cannot be empty.");
    return;
  }
  if (cleanedName === currentName) return;

  const matchingIds = state.entries
    .filter(e => e.direction === direction && String(e.person_name || "").trim() === currentName)
    .map(e => e.id)
    .filter(Boolean);

  if (!matchingIds.length) return;

  if (isBackupMode()){
    state.entries = state.entries.map(entry => (
      entry.direction === direction && String(entry.person_name || "").trim() === currentName
        ? { ...entry, person_name: cleanedName }
        : entry
    ));
    refreshBackupView();
    return;
  }

  const updatedRows = [];
  state.entries = state.entries.map(entry => {
    if (entry.direction === direction && String(entry.person_name || "").trim() === currentName) {
      const updated = { ...entry, person_name: cleanedName };
      updatedRows.push(updated);
      return updated;
    }
    return entry;
  });
  updatedRows.forEach(row => queueDatabasePatch(row.id, { person_name: cleanedName }, "Name change", row));
  renderAll();
}

/**
 * Soft-delete one entry in every store dual-read can load from:
 * - domain tables via is_deleted=true (when a domain table can be resolved)
 * - legacy loan_ledger_entries via [DELETED] notes tag
 * Does not touch local state / recycle bin — callers own that.
 */
async function persistDeleteEntry(entry, options = {}) {
  if (!entry?.id || isBackupMode()) return;
  const label = options.label || "Delete";
  const deletedNotes = addDeletedTag(entry.notes || "");

  if (window.DomainLedger) {
    try {
      await DomainLedger.softDeleteDomainEntry(entry);
    } catch (err) {
      console.warn(`${label}: domain soft-delete failed for ${entry.id}`, err);
    }
  }

  try {
    await supabase(`${CONFIG.table}?id=eq.${encodeURIComponent(entry.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ notes: deletedNotes })
    });
  } catch (err) {
    // Missing ledger row after migrate is expected
    console.warn(`${label}: ledger soft-delete skipped/failed for ${entry.id}`, err);
  }
}

/**
 * Soft-delete an entire group_id in domain tables + ledger so refresh cannot resurrect
 * wallets/loans/installments/inventory after dual-read merge.
 */
async function persistDeleteGroup(groupId, options = {}) {
  if (!groupId || isBackupMode()) return;
  const label = options.label || "Delete group";
  const entries = Array.isArray(options.entries)
    ? options.entries
    : state.entries.filter(e => e.group_id === groupId);

  if (window.DomainLedger?.softDeleteDomainByGroupId) {
    try {
      await DomainLedger.softDeleteDomainByGroupId(groupId);
    } catch (err) {
      console.error(`${label}: domain group soft-delete failed`, err);
    }
  }

  // Tag every known in-memory member (covers ledger + inferred domain table by id)
  await Promise.all(entries.map(entry => persistDeleteEntry(entry, { label })));

  // Sweep leftover ledger rows for this group that may not be in memory
  try {
    const leftover = await supabase(
      `${CONFIG.table}?select=id,notes&group_id=eq.${encodeURIComponent(groupId)}${ownerIdQuery()}`
    );
    const rows = Array.isArray(leftover) ? leftover : [];
    const handled = new Set(entries.map(e => e.id).filter(Boolean));
    await Promise.all(rows.filter(r => r?.id && !handled.has(r.id)).map(row =>
      supabase(`${CONFIG.table}?id=eq.${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ notes: addDeletedTag(row.notes || "") })
      }).catch(err => console.warn(`${label}: leftover ledger soft-delete failed`, err))
    ));
  } catch (err) {
    console.warn(`${label}: ledger group sweep failed`, err);
  }
}

async function deleteEntry(id){
  if (!id) return;
  const entry = state.entries.find(e => e.id === id);
  if (!entry) return;

  const isGoodsEntry = hasGoodsTag(entry.notes);
  const requiredCapability = isGoodsEntry ? "can_delete_invoices" : "can_delete_entries";
  if (!teamCapability(requiredCapability)) {
    alert(isGoodsEntry ? "You do not have permission to delete invoices." : "You do not have permission to delete entries.");
    return;
  }

  // Check if this is a transfer record
  const isTransfer = hasExpenseAccountTag(entry.notes) && 
                     expenseMetaFromNotes(entry.notes).expenseType === "Transfer";
  const isExpenseWallet = entry.entry_kind === "principal" && hasExpenseAccountTag(entry.notes);

  if(entry.entry_kind === "principal"){
    const groupEntries = state.entries.filter(e => e.group_id === entry.group_id);
    if (isExpenseWallet) {
      const ok = await requireSmartPinConfirm({
        title: "Delete wallet",
        description: `Enter your Smart Pin to permanently delete the wallet "${entry.person_name}" and move ${groupEntries.length} linked transaction${groupEntries.length === 1 ? "" : "s"} to the recycle bin.`,
        confirmLabel: "Delete Wallet",
        accent: "danger"
      });
      if (!ok) return;
    } else {
      if (!confirm(`Delete the entire loan for ${entry.person_name}? This will move ALL linked repayments to recycle bin.`)) return;
    }
    groupEntries.forEach(e => addToRecycleBin(e));
    unmarkDbSnapshotRows(groupEntries);
    state.entries = state.entries.filter(e => e.group_id !== entry.group_id);
    if (isBackupMode()){
      refreshBackupView();
    } else {
      persistDeleteGroup(entry.group_id, { entries: groupEntries, label: "Delete" }).catch(err => {
        console.error("Delete group sync failed.", err);
        alert("Item was moved to recycle bin on this screen, but database sync failed. Please refresh after the connection improves.");
      });
    }
    if (isExpenseWallet) {
      logCompanyActivity("wallet_deleted", "expenses", `Deleted wallet "${entry.person_name}" (${groupEntries.length} transaction${groupEntries.length === 1 ? "" : "s"})`, {
        entityType: "wallet",
        entityId: entry.group_id
      });
    } else {
      logEntryDeleted(entry, "Deleted");
    }
  } else if (isTransfer) {
    // Handle transfer deletion - move both expense and top-up parts to recycle bin
    await deleteTransfer(entry);
  } else {
    if (!confirm(`Move this entry to recycle bin?`)) return;
    addToRecycleBin(entry);
    unmarkDbSnapshotRows([entry]);
    state.entries = state.entries.filter(e => e.id !== id);
    if (!isBackupMode()) {
      persistDeleteEntry(entry, { label: "Delete" }).catch(err => {
        console.error("Delete sync failed.", err);
        alert("Item was moved to recycle bin on this screen, but database sync failed. Please refresh after the connection improves.");
      });
    }
    logEntryDeleted(entry, "Deleted");
  }
  if (isBackupMode()) {
    refreshBackupView();
    renderAll();
  } else {
    renderAll();
    if (hasExpenseAccountTag(entry.notes) && state.expenseLazy.rpcAvailable !== false) {
      Promise.resolve()
        .then(() => new Promise(resolve => setTimeout(resolve, 280)))
        .then(() => invalidateAndRefreshExpenseLazy({ refreshActivity: true }))
        .then(ok => {
          if (!ok) return;
          invalidateExpenseAccountsSyncCache();
          renderExpenseOverviewWallets();
          if (getActiveTabKey() === "expenses") renderExpensesList();
        })
        .catch(() => {});
    }
    if (hasGoodsTag(entry.notes) && state.inventoryLazy.rpcAvailable !== false) {
      Promise.resolve()
        .then(() => new Promise(resolve => setTimeout(resolve, 280)))
        .then(() => invalidateAndRefreshInventoryLazy())
        .then(ok => {
          if (ok && getActiveTabKey() === "goods") renderInventoryList();
        })
        .catch(() => {});
    }
  }
  renderRecycleBinDropdown();
}

async function deleteTransfer(entry) {
  const meta = expenseMetaFromNotes(entry.notes);
  const isExpenseTransfer = meta.rowType === "EXPENSE";
  const isTopupTransfer = meta.rowType === "TOPUP";
  
  // Find the matching transfer partner
  let transferPartner = null;
  let transferType = "";
  
  if (isExpenseTransfer) {
    // This is the expense (money out) part, find the top-up (money in) part
    const transferMatch = entry.notes.match(/Transfer to ([^:]+):/);
    if (transferMatch) {
      const toWalletName = transferMatch[1];
      transferPartner = state.entries.find(e => 
        e.id !== entry.id &&
        hasExpenseAccountTag(e.notes) &&
        expenseMetaFromNotes(e.notes).rowType === "TOPUP" &&
        e.notes.includes(`Transfer from ${entry.person_name}`)
      );
      transferType = "expense";
    }
  } else if (isTopupTransfer) {
    // This is the top-up (money in) part, find the expense (money out) part
    const transferMatch = entry.notes.match(/Transfer from ([^:]+):/);
    if (transferMatch) {
      const fromWalletName = transferMatch[1];
      transferPartner = state.entries.find(e => 
        e.id !== entry.id &&
        hasExpenseAccountTag(e.notes) &&
        expenseMetaFromNotes(e.notes).rowType === "EXPENSE" &&
        e.notes.includes(`Transfer to ${entry.person_name}`)
      );
      transferType = "topup";
    }
  }
  
  if (!transferPartner) {
    // No partner found, just move this entry to recycle bin
    if (!confirm(`Move this transfer record to recycle bin? No matching transfer partner found.`)) return;
    addToRecycleBin(entry);
    unmarkDbSnapshotRows([entry]);
    state.entries = state.entries.filter(e => e.id !== entry.id);
    if (isBackupMode()) {
      refreshBackupView();
    } else {
      persistDeleteEntry(entry, { label: "Delete" }).catch(err => console.error(err));
    }
    logCompanyActivity("delete", "expenses", `Deleted transfer record on "${entry.person_name}" (${moneyText(entry.action_amount || 0, entry.currency)})`, {
      entityType: "transfer",
      entityId: entry.id
    });
    renderAll();
    renderRecycleBinDropdown();
    return;
  }
  
  // Found transfer partner, ask to move both to recycle bin
  const confirmMessage = transferType === "expense" 
    ? `Move this transfer from ${entry.person_name} to ${transferPartner.person_name} to recycle bin?\n\nThis will move BOTH:\n- The expense record (money out) from ${entry.person_name}\n- The top-up record (money in) to ${transferPartner.person_name}\n\nYou can restore them later from the recycle bin.`
    : `Move this transfer from ${transferPartner.person_name} to ${entry.person_name} to recycle bin?\n\nThis will move BOTH:\n- The expense record (money out) from ${transferPartner.person_name}\n- The top-up record (money in) to ${entry.person_name}\n\nYou can restore them later from the recycle bin.`;
  
  if (!confirm(confirmMessage)) return;
  
  // Move both transfer records to recycle bin
  addToRecycleBin(entry);
  addToRecycleBin(transferPartner);
  unmarkDbSnapshotRows([entry, transferPartner]);
  state.entries = state.entries.filter(e => e.id !== entry.id && e.id !== transferPartner.id);
  if (isBackupMode()) {
    refreshBackupView();
  } else {
    Promise.all([
      persistDeleteEntry(entry, { label: "Delete" }),
      persistDeleteEntry(transferPartner, { label: "Delete" })
    ]).catch(err => console.error(err));
  }
  const fromName = transferType === "expense" ? entry.person_name : transferPartner.person_name;
  const toName = transferType === "expense" ? transferPartner.person_name : entry.person_name;
  const amountEntry = transferType === "expense" ? entry : transferPartner;
  logCompanyActivity(
    "delete",
    "expenses",
    `Deleted transfer ${moneyText(amountEntry.action_amount || 0, amountEntry.currency)} from "${fromName}" to "${toName}"`,
    { entityType: "transfer", entityId: entry.id }
  );
  renderAll();
  renderRecycleBinDropdown();
}

async function deletePersonRecords(personNameEncoded, direction){
  if (!teamCapability("can_delete_entries")) {
    alert("You do not have permission to delete entries.");
    return;
  }
  const personName = decodeURIComponent(personNameEncoded || "").trim();
  if (!personName || !direction) return;

  const matchingEntries = state.entries.filter(e =>
    e.direction === direction && String(e.person_name || "").trim() === personName
  );

  if (!matchingEntries.length) {
    alert("No records found for this person.");
    return;
  }

  const directionLabel = direction === "given" ? "given" : "taken";
  if (!confirm(`Move full record for ${personName} to recycle bin? This will move ${matchingEntries.length} entr${matchingEntries.length === 1 ? "y" : "ies"} from ${directionLabel} to recycle bin.`)) return;

  matchingEntries.forEach(e => addToRecycleBin(e));
  unmarkDbSnapshotRows(matchingEntries);
  state.entries = state.entries.filter(e => !(e.direction === direction && String(e.person_name || "").trim() === personName));

  if (isBackupMode()){
    refreshBackupView();
  } else {
    // Soft-delete each entry in both stores; also soft-delete domain by each distinct group_id
    const groupIds = [...new Set(matchingEntries.map(e => e.group_id).filter(Boolean))];
    Promise.all([
      ...matchingEntries.map(entry => persistDeleteEntry(entry, { label: "Delete" })),
      ...groupIds.map(gid =>
        window.DomainLedger?.softDeleteDomainByGroupId
          ? DomainLedger.softDeleteDomainByGroupId(gid)
          : Promise.resolve()
      )
    ]).catch(err => console.error("Person delete sync failed.", err));
  }
  renderAll();
  renderRecycleBinDropdown();
}

async function movePersonToInstallments(personNameEncoded, direction){
  const personName = decodeURIComponent(personNameEncoded || "").trim();
  if (!personName || direction !== "taken") return;

  const matchedEntries = state.entries.filter(e =>
    e.direction === "taken" &&
    String(e.person_name || "").trim() === personName &&
    !hasGoodsTag(e.notes) &&
    !hasExpenseAccountTag(e.notes) &&
    !hasDeletedTag(e.notes)
  );

  if (!matchedEntries.length){
    alert("No records found for this person.");
    return;
  }

  if (!confirm(`Move ${personName} to Installment Plans?`)) return;

  if (isBackupMode()){
    state.entries = state.entries.map(entry => (
      entry.direction === "taken" && String(entry.person_name || "").trim() === personName
        ? { ...entry, notes: normalizeInstallmentNote(entry.notes, true) }
        : entry
    ));
    refreshBackupView();
    activate("installments");
    return;
  }

  try {
    let updatedRows = matchedEntries.map(entry => ({
      ...entry,
      notes: normalizeInstallmentNote(entry.notes, true),
      direction: "taken"
    }));

    if (window.DomainLedger?.moveLoanEntriesToInstallments) {
      updatedRows = await DomainLedger.moveLoanEntriesToInstallments(matchedEntries);
    } else {
      // Fallback: tag + patch only (legacy behavior)
      for (const entry of matchedEntries) {
        const nextNotes = normalizeInstallmentNote(entry.notes, true);
        const updatedEntry = { ...entry, notes: nextNotes };
        state.entries = state.entries.map(row => row.id === entry.id ? updatedEntry : row);
        queueDatabasePatch(entry.id, { notes: nextNotes }, "Installment move", updatedEntry);
      }
      renderAll();
      activate("installments");
      return;
    }

    const updatedById = new Map(updatedRows.filter(r => r?.id).map(r => [r.id, r]));
    state.entries = state.entries.map(row => updatedById.get(row.id) || row);
    // Ensure any newly shaped domain installment rows are present
    for (const row of updatedRows) {
      if (row?.id && !state.entries.some(e => e.id === row.id)) {
        state.entries.unshift(row);
      }
    }
    markDbSnapshotRows(updatedRows);

    // Refresh both scopes so dual-read cannot resurrect moved loan rows
    state.loadedLedgerScopes.delete(LEDGER_SCOPE_LOANS_TAKEN);
    state.loadedLedgerScopes.delete(LEDGER_SCOPE_INSTALLMENTS);
    if (databaseSessionCanLoad()) {
      await loadLedgerScopeFromSupabase(LEDGER_SCOPE_LOANS_TAKEN, { force: true }).catch(() => {});
      await loadLedgerScopeFromSupabase(LEDGER_SCOPE_INSTALLMENTS, { force: true }).catch(() => {});
    }
    renderAll();
    activate("installments");
  } catch (err) {
    console.error("Installment move failed", err);
    alert(`Could not move to Installment Plans: ${err.message || err}`);
  }
}

async function getBase64ImageFromUrl(imageUrl) {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    return null;
  }
}

async function measureImageDataUrl(dataUrl) {
  return new Promise(resolve => {
    if (!dataUrl) {
      resolve({ width: 0, height: 0 });
      return;
    }
    const img = new Image();
    img.onload = () => resolve({
      width: img.naturalWidth || img.width || 0,
      height: img.naturalHeight || img.height || 0
    });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = dataUrl;
  });
}
