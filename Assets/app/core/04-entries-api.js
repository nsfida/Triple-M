/* Modularized from script.js lines 4266-4479 — DB write queue + saveEntriesImmediately. Load order must be preserved. */
/** Serialize ledger writes so concurrent inserts/patches cannot interleave mid-flight. */
let databaseWriteChain = Promise.resolve();
function enqueueDatabaseWrite(task){
  const run = databaseWriteChain.then(task, task);
  databaseWriteChain = run.then(() => undefined, () => undefined);
  return run;
}

/* Expenses figures (2026-11-12): wallet balances are reloaded from the server only after the
   writes that change them have finished. Earlier a fixed 280 ms delay could read the totals
   before a save or delete reached the database, and the old figure stayed until a page refresh. */
const pendingExpenseWrites = new Set();
function trackExpenseWrite(promise){
  if (!promise || typeof promise.then !== "function") return promise;
  const p = Promise.resolve(promise).catch(() => {});
  pendingExpenseWrites.add(p);
  p.finally(() => pendingExpenseWrites.delete(p));
  return promise;
}
function waitForExpenseWrites(timeoutMs = 15000){
  const all = Promise.allSettled([databaseWriteChain, ...pendingExpenseWrites]);
  return Promise.race([all, new Promise(resolve => setTimeout(resolve, timeoutMs))]);
}
window.trackExpenseWrite = trackExpenseWrite;
window.waitForExpenseWrites = waitForExpenseWrites;

/**
 * Persist one ledger-shaped row exactly the way an online save does (domain
 * table first, legacy ledger fallback). Shared by live saves and offline replay
 * so a queued entry lands in the same tables as one saved while online.
 */
async function writeLedgerRowToDatabase(row, label = "Entry"){
  const isGoodsSale = hasGoodsTag(row?.notes) && isInventorySaleAction(row);
  try {
    const result = await DomainLedger.insertDomainEntry(row);
    if (result.usedLedger) {
      // Inventory sales must land in goods_sales for lazy reload after refresh.
      if (isGoodsSale) {
        throw new Error(
          "Sale could not be saved to goods_sales. Run migrations/058_inventory_sales_upsert_and_owner_fix.sql in Supabase SQL Editor."
        );
      }
      row.data_origin = "ledger";
      row.is_legacy_meta = DomainLedger.classifyLedgerEntry(row) !== "system_prefs";
      await supabase(CONFIG.table, {
        method: "POST",
        body: JSON.stringify(databaseInsertPayload(row))
      });
    } else if (result.table) {
      row.domain_table = result.table;
      row.data_origin = "domain";
      row.is_legacy_meta = false;
    }
  } catch (err) {
    // Connection failures must reach the caller unchanged so the entry is kept
    // in the offline queue. Writing a degraded ledger copy while offline would
    // only fail again and could misclassify the entry.
    if (typeof isConnectivityFailure === "function" && isConnectivityFailure(err)) throw err;
    // Any other domain insert failure → try ledger fallback so stock never dies silently.
    // Exception: inventory SALE rows — ledger-only writes vanish after refresh in lazy mode.
    const msg = String(err?.message || err || "");
    if (isGoodsSale) {
      console.error(`${label} goods_sales sync failed.`, err);
      throw new Error(
        msg
        || "Sale database sync failed. Run migrations/058_inventory_sales_upsert_and_owner_fix.sql in Supabase SQL Editor."
      );
    }
    console.warn(`${label} domain insert failed; trying ledger fallback.`, err);
    try {
      row.data_origin = "ledger";
      row.is_legacy_meta = true;
      const ledgerRow = {
        ...row,
        direction: row.direction === "goods" ? "goods" : "taken"
      };
      await supabase(CONFIG.table, {
        method: "POST",
        body: JSON.stringify(databaseInsertPayload(ledgerRow)),
        headers: { Prefer: "return=minimal" }
      });
    } catch (ledgerErr) {
      if (typeof isConnectivityFailure === "function" && isConnectivityFailure(ledgerErr)) throw ledgerErr;
      const detail = String(ledgerErr?.message || ledgerErr || msg || "Unknown sync error");
      const wrapped = new Error(detail);
      wrapped.status = ledgerErr?.status || err?.status || 0;
      throw wrapped;
    }
  }
}

function queueDatabaseInsert(rows, label = "Entry", renderOptions = {}){
  if (isBackupMode()) return Promise.resolve([]);
  const localRows = asEntryArray(rows);
  localRows.forEach(row => {
    if (!row) return;
    row.is_legacy_meta = false;
    row.data_origin = row.data_origin || "domain";
    if (row.id) state.pendingDbSyncIds.add(row.id);
  });
  let queuedOffline = false;
  const notify = renderOptions.notify !== false;
  const confirmSaved = message => {
    if (notify && typeof showEntryConfirmation === "function") showEntryConfirmation(message, "success");
  };
  const confirmFailed = message => {
    if (notify && typeof showEntryConfirmation === "function") showEntryConfirmation(message, "error");
  };

  const run = async () => {
    if (window.DomainLedger?.insertDomainEntry) {
      for (const row of localRows) {
        await writeLedgerRowToDatabase(row, label);
      }
      return;
    }
    const payload = localRows.map(databaseInsertPayload);
    const body = payload.length === 1 ? payload[0] : payload;
    await supabase(CONFIG.table, { method: "POST", body: JSON.stringify(body) });
  };

  if (navigator.onLine === false
    && typeof queueOfflineLedgerInsert === "function"
    && queueOfflineLedgerInsert(localRows, label)) {
    queuedOffline = true;
    confirmSaved(`${label} saved on this device. It will sync automatically when the internet returns.`);
    if (renderOptions.renderOnSettle !== false) renderAll();
    return Promise.resolve(localRows);
  }

  return enqueueDatabaseWrite(run)
    .then(() => {
      markDbSnapshotRows(localRows);
      confirmSaved(`${label} saved successfully.`);
      // If a scope merge raced and dropped optimistic rows, put them back.
      localRows.forEach(row => {
        if (!row?.id) return;
        if (!state.entries.some(entry => entry.id === row.id)) {
          state.entries.unshift(row);
        }
      });
      return localRows;
    })
    .catch(err => {
      unmarkDbSnapshotRows(localRows);
      console.error(`${label} database sync failed.`, err);
      if (typeof isConnectivityFailure === "function"
        && typeof queueOfflineLedgerInsert === "function"
        && isConnectivityFailure(err)
        && queueOfflineLedgerInsert(localRows, label)) {
        queuedOffline = true;
        confirmSaved(`${label} saved on this device. It will sync automatically when the internet returns.`);
        return localRows;
      }
      const detail = String(err?.message || err || "").trim();
      confirmFailed(`${label} failed${detail ? `: ${detail}` : "."}`);
      alert(
        `${label} was added on this screen, but database sync failed.`
        + (detail ? `\n\nDetails: ${detail}` : "")
        + `\n\nIf this mentions app_upsert_goods_sale / goods_sales, run migrations/058_inventory_sales_upsert_and_owner_fix.sql in Supabase SQL Editor.`
        + `\n\nIf this mentions app_upsert_goods_item / function not found, run migrations/054_inventory_upsert_goods_item_rpc.sql in Supabase SQL Editor.`
      );
      throw err;
    })
    .finally(() => {
      if (!queuedOffline) {
        localRows.forEach(row => row?.id && state.pendingDbSyncIds.delete(row.id));
      }
      if (renderOptions.renderOnSettle !== false) renderAll();
    });
}

function expenseVisualSignature(){
  if (typeof getExpenseAccounts !== "function") return "";
  try {
    if (typeof invalidateExpenseAccountsSyncCache === "function") invalidateExpenseAccountsSyncCache();
    return getExpenseAccounts({ applyUiFilters: false }).map(account => [
      String(account.group_id || ""),
      String(account.person_name || ""),
      String(account.currency || ""),
      Number(account.openingBalance || 0).toFixed(8),
      Number(account.addedMoney || 0).toFixed(8),
      Number(account.spentMoney || 0).toFixed(8),
      Number(account.balance || 0).toFixed(8),
      String(account.customLogoUrl || "")
    ].join("~")).join("|");
  } catch (_) {
    return "";
  }
}

function saveEntriesImmediately(entryOrEntries, options = {}){
  const timestamp = new Date().toISOString();
  const rows = asEntryArray(entryOrEntries).map(entry => withLocalEntryIdentity(entry, timestamp));
  state.entries.unshift(...rows);
  // Attachments (2026-11): lets a form link its files to the row it just saved.
  try { window.TriplemAttachments?.reportSaved?.(rows); } catch (_) {}
  const touchesExpenses = rows.some(row => hasExpenseAccountTag(row?.notes) || entryBelongsToLedgerScope(row, LEDGER_SCOPE_EXPENSES));
  const touchesGoods = rows.some(row => hasGoodsTag(row?.notes) || entryBelongsToLedgerScope(row, LEDGER_SCOPE_GOODS));
  let syncPromise = Promise.resolve(rows);
  if (isBackupMode()) {
    refreshBackupView();
    if (options.notify !== false && typeof showEntryConfirmation === "function") {
      const localLabel = options.label || (rows.length === 1 ? "Entry" : "Entries");
      showEntryConfirmation(`${localLabel} saved locally.`, "success");
    }
  } else {
    if (touchesExpenses) {
      applyOptimisticExpenseLazySummaryForRows(rows);
    }
    // Expenses already receive an immediate optimistic repaint below. Avoid a
    // second full-app repaint when the database write settles; the later lazy
    // reconciliation will repaint only if the server result materially differs.
    const rawSync = queueDatabaseInsert(
      rows,
      options.label || (rows.length === 1 ? "Entry" : "Entries"),
      { renderOnSettle: !(touchesExpenses && !touchesGoods), notify: options.notify !== false }
    ).then(() => {
        if (typeof invalidateDashboardSummary === "function") {
          invalidateDashboardSummary({ refreshIfVisible: true });
        }
        return rows;
      });
    // Default fire-and-forget keeps local rows even if sync fails; awaitSync callers need the real result.
    syncPromise = options.awaitSync ? rawSync : rawSync.catch(() => rows);
    renderAll();
    if (touchesExpenses && state.expenseLazy.rpcAvailable !== false) {
      // Refresh accurate balances after DB write. Prefer awaiting sync for transfers/wallet links
      // so the receiving wallet is not left behind a premature summary reload.
      const scheduleRefresh = () => {
        const optimisticSignature = expenseVisualSignature();
        return invalidateAndRefreshExpenseLazy({ refreshActivity: true })
          .then(ok => {
            if (!ok) return;
            const serverSignature = expenseVisualSignature();
            // In the normal path optimistic and persisted totals are identical.
            // Keep the live DOM intact so wallet cards do not blink/restart
            // animations. Repaint only when the server actually changed data.
            if (optimisticSignature && serverSignature && optimisticSignature === serverSignature) return;
            if (typeof invalidateExpenseAccountsSyncCache === "function") invalidateExpenseAccountsSyncCache();
            if (typeof renderExpenseOverviewWallets === "function") renderExpenseOverviewWallets();
            if (typeof getActiveTabKey === "function" && getActiveTabKey() === "expenses" && typeof renderExpensesList === "function") {
              renderExpensesList();
            }
          })
          .catch(() => {});
      };
      // Reload the server totals once this save has reached the database (not after a guess).
      rawSync.catch(() => {}).then(() => scheduleRefresh()).catch(() => {});
    }
    if (touchesGoods && state.inventoryLazy.rpcAvailable !== false && !options.awaitSync) {
      Promise.resolve()
        .then(() => new Promise(resolve => setTimeout(resolve, 280)))
        .then(() => invalidateAndRefreshInventoryLazy())
        .then(ok => {
          if (ok && getActiveTabKey() === "goods") renderInventoryList();
        })
        .catch(() => {});
    }
  }
  const label = String(options.label || "").toLowerCase();
  if (label === "transfer" && rows.length >= 2) {
    const from = rows[0];
    const to = rows[1];
    logCompanyActivity(
      "transfer",
      "expenses",
      `Transferred ${moneyText(from.action_amount || 0, from.currency)} from "${from.person_name}" to "${to.person_name}"${from.currency !== to.currency ? ` (${moneyText(to.action_amount || 0, to.currency)})` : ""}`,
      { entityType: "transfer", entityId: from.group_id, meta: { toGroupId: to.group_id } }
    );
  } else if (!options.skipActivityLog) {
    logEntriesCreated(rows);
  }
  if (options.awaitSync) return syncPromise;
  return Array.isArray(entryOrEntries) ? rows : rows[0];
}

/** Apply one ledger PATCH exactly as an online edit does. Shared with offline replay. */
async function writeLedgerPatchToDatabase(id, body, entry, label = "Entry"){
  const isSoftDeletePatch = body &&
    Object.prototype.hasOwnProperty.call(body, "notes") &&
    hasDeletedTag(body.notes) &&
    Object.keys(body).length === 1;

  if (window.DomainLedger && entry && isSoftDeletePatch) {
    // Soft-delete domain AND continue to ledger so dual-read cannot resurrect
    await DomainLedger.softDeleteDomainEntry(entry).catch(err => {
      if (typeof isConnectivityFailure === "function" && isConnectivityFailure(err)) throw err;
      console.warn(`${label}: domain soft-delete via patch failed`, err);
    });
  } else if (window.DomainLedger && entry?.data_origin === "domain" && entry.domain_table) {
    const result = await DomainLedger.patchDomainEntry(entry, body);
    if (!result.usedLedger) return result.row || null;
  }
  const rows = await supabase(`${CONFIG.table}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body)
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

/** Keep the server's updated_at on local copies after a successful edit. */
function rememberServerUpdatedAt(id, serverRow){
  const updatedAt = serverRow?.updated_at;
  if (!id || !updatedAt) return;
  [state.entries, state.recycleBin].forEach(collection => {
    (collection || []).forEach(row => { if (row?.id === id) row.updated_at = updatedAt; });
  });
}

function queueDatabasePatch(id, body, label = "Entry", snapshotRow = null, options = {}){
  if (isBackupMode() || !id) return;
  state.pendingDbSyncIds.add(id);
  const entry = snapshotRow || state.entries.find(e => e.id === id) || state.recycleBin.find(e => e.id === id);
  const silent = !!(options && options.silent);
  // updated_at as last read from the server; used to detect a newer edit made
  // elsewhere before an offline change is replayed.
  const baseEntry = state.entries.find(e => e.id === id) || state.recycleBin.find(e => e.id === id) || entry;
  const baseUpdatedAt = baseEntry?.updated_at || "";
  const keepOffline = () => typeof queueOfflineLedgerPatch === "function"
    && queueOfflineLedgerPatch(id, body, entry, label, { baseUpdatedAt });

  if (navigator.onLine === false && keepOffline()) {
    if (!silent && typeof showEntryConfirmation === "function") {
      showEntryConfirmation(`${label} change saved on this device. It will sync automatically when the internet returns.`, "warning");
    }
    if (!silent) renderAll();
    return;
  }

  const run = async () => writeLedgerPatchToDatabase(id, body, entry, label);

  let queuedOffline = false;
  const patchWrite = enqueueDatabaseWrite(run);
  if (entry && (hasExpenseAccountTag(entry.notes) || entryBelongsToLedgerScope(entry, LEDGER_SCOPE_EXPENSES))) trackExpenseWrite(patchWrite);
  patchWrite
    .then(serverRow => {
      rememberServerUpdatedAt(id, serverRow);
      if (snapshotRow) markDbSnapshotRows([snapshotRow]);
      if (typeof invalidateDashboardSummary === "function") {
        invalidateDashboardSummary({ refreshIfVisible: true });
      }
      if (!silent && typeof showEntryConfirmation === "function") {
        showEntryConfirmation(`${label} updated successfully.`, "success");
      }
    })
    .catch(err => {
      if (typeof isConnectivityFailure === "function" && isConnectivityFailure(err) && keepOffline()) {
        queuedOffline = true;
        if (!silent && typeof showEntryConfirmation === "function") {
          showEntryConfirmation(`${label} change saved on this device. It will sync automatically when the internet returns.`, "warning");
        }
        return;
      }
      console.error(`${label} database sync failed.`, err);
      if (!silent && typeof showEntryConfirmation === "function") {
        showEntryConfirmation(`${label} update failed: ${err?.message || err || "Database sync failed."}`, "error");
      }
      alert(`${label} was updated on this screen, but database sync failed. Please refresh after the connection improves.`);
    })
    .finally(() => {
      if (!queuedOffline) state.pendingDbSyncIds.delete(id);
      if (!silent) renderAll();
    });
}
