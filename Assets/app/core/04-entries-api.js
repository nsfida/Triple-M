/* Modularized from script.js lines 4266-4479 — DB write queue + saveEntriesImmediately. Load order must be preserved. */
/** Serialize ledger writes so concurrent inserts/patches cannot interleave mid-flight. */
let databaseWriteChain = Promise.resolve();
function enqueueDatabaseWrite(task){
  const run = databaseWriteChain.then(task, task);
  databaseWriteChain = run.then(() => undefined, () => undefined);
  return run;
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

  const run = async () => {
    if (window.DomainLedger?.insertDomainEntry) {
      for (const row of localRows) {
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
          // Any domain insert failure → try ledger fallback so stock never dies silently.
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
            const detail = String(ledgerErr?.message || ledgerErr || msg || "Unknown sync error");
            throw new Error(detail);
          }
        }
      }
      return;
    }
    const payload = localRows.map(databaseInsertPayload);
    const body = payload.length === 1 ? payload[0] : payload;
    await supabase(CONFIG.table, { method: "POST", body: JSON.stringify(body) });
  };

  let queuedOffline = false;
  return enqueueDatabaseWrite(run)
    .then(() => {
      markDbSnapshotRows(localRows);
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
        return localRows;
      }
      const detail = String(err?.message || err || "").trim();
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
  const touchesExpenses = rows.some(row => hasExpenseAccountTag(row?.notes) || entryBelongsToLedgerScope(row, LEDGER_SCOPE_EXPENSES));
  const touchesGoods = rows.some(row => hasGoodsTag(row?.notes) || entryBelongsToLedgerScope(row, LEDGER_SCOPE_GOODS));
  let syncPromise = Promise.resolve(rows);
  if (isBackupMode()) {
    refreshBackupView();
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
      { renderOnSettle: !(touchesExpenses && !touchesGoods) }
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
      if (options.awaitSync) {
        syncPromise.then(() => scheduleRefresh()).catch(() => {});
      } else {
        Promise.resolve()
          .then(() => new Promise(resolve => setTimeout(resolve, 280)))
          .then(() => scheduleRefresh())
          .catch(() => {});
      }
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

function queueDatabasePatch(id, body, label = "Entry", snapshotRow = null, options = {}){
  if (isBackupMode() || !id) return;
  state.pendingDbSyncIds.add(id);
  const entry = snapshotRow || state.entries.find(e => e.id === id) || state.recycleBin.find(e => e.id === id);
  const silent = !!(options && options.silent);

  const run = async () => {
    const isSoftDeletePatch = body &&
      Object.prototype.hasOwnProperty.call(body, "notes") &&
      hasDeletedTag(body.notes) &&
      Object.keys(body).length === 1;

    if (window.DomainLedger && entry && isSoftDeletePatch) {
      // Soft-delete domain AND continue to ledger so dual-read cannot resurrect
      await DomainLedger.softDeleteDomainEntry(entry).catch(err => {
        console.warn(`${label}: domain soft-delete via patch failed`, err);
      });
    } else if (window.DomainLedger && entry?.data_origin === "domain" && entry.domain_table) {
      const result = await DomainLedger.patchDomainEntry(entry, body);
      if (!result.usedLedger) return;
    }
    await supabase(`${CONFIG.table}?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body)
    });
  };

  enqueueDatabaseWrite(run)
    .then(() => {
      if (snapshotRow) markDbSnapshotRows([snapshotRow]);
      if (typeof invalidateDashboardSummary === "function") {
        invalidateDashboardSummary({ refreshIfVisible: true });
      }
    })
    .catch(err => {
      console.error(`${label} database sync failed.`, err);
      alert(`${label} was updated on this screen, but database sync failed. Please refresh after the connection improves.`);
    })
    .finally(() => {
      state.pendingDbSyncIds.delete(id);
      if (!silent) renderAll();
    });
}
