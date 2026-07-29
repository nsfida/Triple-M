/* Modularized from script.js lines 14145-17622 — expense wallets + lazy summaries. Load order must be preserved. */
function buildExpenseAccountSearchBlob(account){
  const parts = [
    account.person_name || "",
    account.accountType || "",
    account.btcAddress || "",
    account.currency || "",
    cleanExpenseNote(account.principal?.notes),
    account.openingBalance,
    account.addedMoney,
    account.spentMoney,
    account.balance
  ];
  for (const s of account.spends || []) {
    const meta = s._expenseMeta || expenseMetaFromNotes(s.notes);
    parts.push(
      cleanExpenseNote(s.notes),
      meta.itemName,
      meta.expenseType,
      meta.accountType,
      s.action_amount,
      s.currency
    );
  }
  for (const t of account.topups || []) {
    parts.push(cleanExpenseNote(t.notes), t.action_amount, t.currency);
  }
  return parts.join(" ").toLowerCase();
}

function expenseSummaryToPrincipalEntry(summary){
  const s = summary || {};
  const notes = upsertExpenseMetaInNote(s.notes || null, {
    accountType: s.account_type || "Bank Account",
    rowType: "ACCOUNT",
    btcAddress: s.btc_address || "",
    btcNetwork: s.btc_network || "",
    customLogoUrl: s.custom_logo_url || ""
  });
  return {
    id: s.id,
    group_id: s.group_id,
    direction: "taken",
    entry_kind: "principal",
    person_name: s.account_name,
    currency: s.currency,
    principal_amount: Number(s.opening_balance || 0),
    action_amount: null,
    loan_date: s.account_date,
    action_date: null,
    notes,
    owner_id: currentOwnerId(),
    created_at: s.created_at,
    updated_at: s.updated_at,
    data_origin: s.data_origin === "ledger" ? "ledger" : "domain",
    domain_table: s.data_origin === "ledger" ? null : "expense_accounts",
    is_legacy_meta: s.data_origin === "ledger",
    _expenseLazySummary: true
  };
}

function expenseActivityToEntry(row){
  const r = row || {};
  const isTopup = String(r.row_type || "").toUpperCase() === "TOPUP";
  const existingTax = expenseMetaFromNotes(r.notes || "");
  // Keep VAT tags from DB notes — partial upsert used to strip them on every lazy reload.
  const notes = upsertExpenseMetaInNote(r.notes || null, {
    accountType: r.account_type || existingTax.accountType || "Bank Account",
    rowType: isTopup ? "TOPUP" : "EXPENSE",
    itemName: r.item_name || existingTax.itemName || "",
    expenseType: r.expense_type || existingTax.expenseType || "Other",
    taxApplied: existingTax.taxApplied,
    taxRate: existingTax.taxRate,
    taxMode: existingTax.taxMode,
    taxAmount: existingTax.taxAmount,
    netAmount: existingTax.netAmount,
    grossAmount: existingTax.grossAmount
  });
  return {
    id: r.id,
    group_id: r.group_id,
    direction: "taken",
    entry_kind: "partial",
    person_name: r.account_name,
    currency: r.currency,
    principal_amount: null,
    action_amount: Number(r.amount || 0),
    loan_date: r.activity_date,
    action_date: r.activity_date,
    notes,
    owner_id: currentOwnerId(),
    created_at: r.created_at,
    updated_at: r.updated_at,
    data_origin: "domain",
    domain_table: isTopup ? "expense_topups" : "expense_entries",
    is_legacy_meta: false,
    _expenseLazyActivity: true,
    _expenseMeta: expenseMetaFromNotes(notes)
  };
}

function applyExpenseLazyEntries(principals, actions){
  const scope = LEDGER_SCOPE_EXPENSES;
  const pending = state.entries.filter(entry =>
    entryBelongsToLedgerScope(entry, scope) && entry.id && state.pendingDbSyncIds.has(entry.id)
  );
  const pendingIds = new Set(pending.map(row => row.id));
  const previousScopeRows = state.entries.filter(entry => entryBelongsToLedgerScope(entry, scope));
  unmarkDbSnapshotRows(previousScopeRows);

  const nextPrincipals = (Array.isArray(principals) ? principals : []).filter(row => row?.id && !pendingIds.has(row.id));
  const nextActions = (Array.isArray(actions) ? actions : []).filter(row => row?.id && !pendingIds.has(row.id));
  const merged = nextPrincipals.concat(nextActions);

  state.entries = state.entries
    .filter(entry => !entryBelongsToLedgerScope(entry, scope) || pendingIds.has(entry.id))
    .concat(merged, pending)
    .sort((a, b) => dateStamp(b.created_at || b.action_date || b.loan_date) - dateStamp(a.created_at || a.action_date || a.loan_date));

  markDbSnapshotRows(merged.filter(row => !state.pendingDbSyncIds.has(row.id)));
  state.loadedLedgerScopes.add(scope);
  state.dataSource = "supabase";
  invalidateExpenseAccountsSyncCache();
}

async function fetchExpenseWalletSummariesRpc(){
  const res = unwrapRpcJson(await supabaseRpc("app_list_my_expense_wallet_summaries", {}));
  return Array.isArray(res?.items) ? res.items : [];
}

async function fetchExpenseActivityRpc({ from = null, to = null, search = "", groupId = "", limit = 800 } = {}){
  const res = unwrapRpcJson(await supabaseRpc("app_list_my_expense_activity", {
    p_from: from || null,
    p_to: to || null,
    p_search: search || null,
    p_group_id: groupId || null,
    p_limit: limit
  }));
  return Array.isArray(res?.items) ? res.items : [];
}

async function fetchExpenseWalletDetailRpc(groupId, limit = 2000){
  const res = unwrapRpcJson(await supabaseRpc("app_list_my_expense_wallet_detail", {
    p_group_id: String(groupId || ""),
    p_limit: limit
  }));
  return {
    summary: res?.summary && typeof res.summary === "object" ? res.summary : null,
    items: Array.isArray(res?.items) ? res.items : []
  };
}

function isExpenseLazyRpcMissingError(err){
  const msg = String(err?.message || err || "");
  return /app_list_my_expense_wallet_summaries|app_list_my_expense_activity|app_list_my_expense_wallet_detail|Could not find the function|PGRST202|404/i.test(msg);
}

async function loadExpenseWalletSummaries({ force = false } = {}){
  if (!databaseSessionCanLoad() && state.dataSource !== "supabase") return [];
  if (state.expenseLazy.rpcAvailable === false) return [];
  state.expenseLazy.loadingSummaries = true;
  try {
    const items = await fetchExpenseWalletSummariesRpc();
    state.expenseLazy.rpcAvailable = true;
    state.expenseLazy.summaries = items;
    state.expenseLazy.summaryByGroupId = new Map(
      items.map(item => [String(item.group_id), item])
    );
    const principals = items.map(expenseSummaryToPrincipalEntry);
    const existingActions = state.entries.filter(entry =>
      entryBelongsToLedgerScope(entry, LEDGER_SCOPE_EXPENSES)
      && entry.entry_kind !== "principal"
    );
    applyExpenseLazyEntries(principals, existingActions);
    state.expenseLazy.enabled = true;
    return items;
  } catch (err) {
    if (isExpenseLazyRpcMissingError(err)) {
      state.expenseLazy.rpcAvailable = false;
      state.expenseLazy.enabled = false;
      console.warn("Expense lazy RPCs unavailable; falling back to full expenses load.", err);
      return null;
    }
    state.expenseLazy.lastError = String(err?.message || err || "Summary load failed");
    throw err;
  } finally {
    state.expenseLazy.loadingSummaries = false;
  }
}

async function loadExpenseActivityForCurrentQuery({ force = false } = {}){
  if (!isExpenseLazyMode() && state.expenseLazy.rpcAvailable === false) return [];
  if (state.expenseLazy.rpcAvailable === false) return [];
  const queryKey = expenseLazyActivityQueryKey();
  if (!force && state.expenseLazy.activityQueryKey === queryKey && state.expenseLazy.enabled) {
    return state.entries.filter(e =>
      entryBelongsToLedgerScope(e, LEDGER_SCOPE_EXPENSES) && e.entry_kind !== "principal"
    );
  }
  const bounds = expenseHistoryRangeBounds();
  if (state.expenseHistoryRange === "custom" && !bounds.from && !bounds.to) {
    const principals = state.entries.filter(e =>
      entryBelongsToLedgerScope(e, LEDGER_SCOPE_EXPENSES) && e.entry_kind === "principal"
    );
    applyExpenseLazyEntries(principals, []);
    state.expenseLazy.activityQueryKey = queryKey;
    return [];
  }
  state.expenseLazy.loadingActivity = true;
  try {
    const search = String(state.search.expenses || "").trim();
    const groupId = state.expenseWalletFilter && state.expenseWalletFilter !== "all"
      ? String(state.expenseWalletFilter)
      : "";
    const limit = state.expenseHistoryRange === "all" ? 1500 : 800;
    const items = await fetchExpenseActivityRpc({
      from: bounds.from || null,
      to: bounds.to || null,
      search,
      groupId,
      limit
    });
    state.expenseLazy.rpcAvailable = true;
    state.expenseLazy.enabled = true;
    const actions = items.map(expenseActivityToEntry);
    const principals = state.entries.filter(e =>
      entryBelongsToLedgerScope(e, LEDGER_SCOPE_EXPENSES) && e.entry_kind === "principal"
    );
    // If summaries not yet loaded, keep whatever principals we have.
    applyExpenseLazyEntries(principals, actions);
    state.expenseLazy.activityQueryKey = queryKey;
    return actions;
  } catch (err) {
    if (isExpenseLazyRpcMissingError(err)) {
      state.expenseLazy.rpcAvailable = false;
      state.expenseLazy.enabled = false;
      console.warn("Expense activity RPC unavailable; falling back to full expenses load.", err);
      return null;
    }
    state.expenseLazy.lastError = String(err?.message || err || "Activity load failed");
    throw err;
  } finally {
    state.expenseLazy.loadingActivity = false;
  }
}

async function ensureExpenseWalletDetailLoaded(groupId, { force = false } = {}){
  const gid = String(groupId || "").trim();
  if (!gid || !isExpenseLazyMode()) return null;
  if (!force && state.expenseLazy.detailCache.has(gid)) {
    return state.expenseLazy.detailCache.get(gid);
  }
  const detail = await fetchExpenseWalletDetailRpc(gid);
  state.expenseLazy.detailCache.set(gid, detail);
  const detailActions = (detail.items || []).map(expenseActivityToEntry);
  const principals = state.entries.filter(e =>
    entryBelongsToLedgerScope(e, LEDGER_SCOPE_EXPENSES) && e.entry_kind === "principal"
  );
  const otherActions = state.entries.filter(e =>
    entryBelongsToLedgerScope(e, LEDGER_SCOPE_EXPENSES)
    && e.entry_kind !== "principal"
    && String(e.group_id) !== gid
  );
  applyExpenseLazyEntries(principals, otherActions.concat(detailActions));
  return detail;
}

async function invalidateAndRefreshExpenseLazy({ refreshActivity = true } = {}){
  if (state.expenseLazy.rpcAvailable === false) return false;
  state.expenseLazy.activityQueryKey = "";
  state.expenseLazy.detailCache = new Map();
  try {
    const summaries = await loadExpenseWalletSummaries({ force: true });
    if (summaries === null) return false;
    if (refreshActivity) {
      const activity = await loadExpenseActivityForCurrentQuery({ force: true });
      if (activity === null) return false;
    }
    return true;
  } catch (err) {
    console.warn("Expense lazy refresh failed:", err);
    return false;
  }
}

async function loadExpensesScopeLazyOrFull(options = {}){
  if (state.expenseLazy.rpcAvailable === false) {
    return { usedLazy: false };
  }
  try {
    const summaries = await loadExpenseWalletSummaries({ force: options.force === true });
    if (summaries === null) return { usedLazy: false };
    // Paint wallets immediately, then fill today's (or selected) activity.
    invalidateExpenseAccountsSyncCache();
    if (typeof renderExpenseWalletBar === "function" && getActiveTabKey() === "expenses") {
      try { renderExpensesList(); } catch (_) {}
    }
    const activity = await loadExpenseActivityForCurrentQuery({ force: true });
    if (activity === null) return { usedLazy: false };
    state.expenseLazy.enabled = true;
    return { usedLazy: true };
  } catch (err) {
    if (isExpenseLazyRpcMissingError(err)) {
      state.expenseLazy.rpcAvailable = false;
      state.expenseLazy.enabled = false;
      return { usedLazy: false };
    }
    throw err;
  }
}

function inventorySummaryToPrincipalEntry(summary){
  const s = summary || {};
  const existing = goodsMetaFromNotes(s.notes || "");
  const productLine = String(s.product_line || existing.productLine || "").trim();
  const productLineId = String(s.product_line_id || existing.productLineId || "").trim();
  const categorySlug = String(s.category_slug || existing.categorySlug || "").trim();
  const sellBy = String(s.sell_by || existing.sellBy || "").trim();
  const bottleSizeQty = Number(s.bottle_size_qty != null ? s.bottle_size_qty : existing.bottleSizeQty);
  const bottleSizeUnit = String(s.bottle_size_unit || existing.bottleSizeUnit || "").trim();
  const notes = upsertGoodsMetaInNote(s.notes || null, {
    ...existing,
    boughtQty: Number(s.bought_qty || 0) || existing.boughtQty || 1,
    unitActualPrice: Number(s.unit_actual_price || 0) || existing.unitActualPrice || 0,
    unitSoldPrice: Number(s.unit_sold_price || 0) || existing.unitSoldPrice || null,
    itemCode: s.item_code || existing.itemCode || "",
    itemDescription: s.item_description || existing.itemDescription || "",
    itemType: s.item_type || existing.itemType || "General",
    itemCategory: s.item_category || existing.itemCategory || "count",
    quantityUnit: s.quantity_unit || existing.quantityUnit || "item",
    brand: s.brand || existing.brand || "",
    variantLabel: s.variant_label || existing.variantLabel || "",
    brandId: s.brand_id || existing.brandId || "",
    variantId: s.variant_id || existing.variantId || "",
    productLine,
    productLineId,
    categorySlug,
    sellBy: sellBy || existing.sellBy || "",
    bottleSizeQty: Number.isFinite(bottleSizeQty) && bottleSizeQty > 0 ? bottleSizeQty : (existing.bottleSizeQty ?? null),
    bottleSizeUnit: bottleSizeUnit || existing.bottleSizeUnit || "",
    transactionType: existing.transactionType || "ITEM"
  });
  return {
    id: s.id,
    group_id: s.group_id,
    direction: "taken",
    entry_kind: "principal",
    person_name: s.item_name,
    currency: s.currency,
    principal_amount: Number(s.total_actual_price || 0),
    action_amount: null,
    loan_date: s.bought_date,
    action_date: null,
    notes,
    owner_id: currentOwnerId(),
    created_at: s.created_at,
    updated_at: s.updated_at,
    data_origin: "domain",
    domain_table: "goods_items",
    is_legacy_meta: false,
    _inventoryLazySummary: true,
    _lazySoldQty: Number(s.sold_qty || 0),
    _lazySoldTotal: Number(s.sold_total || 0),
    _lazyRemainingQty: Number(s.remaining_qty || 0),
    _lazyStockStatus: s.stock_status || ""
  };
}

function inventorySaleRowToEntry(row){
  const r = row || {};
  let notes = r.notes || "";
  if (!hasGoodsTag(notes)) notes = normalizeGoodsNote(notes, true);
  // Preserve CUST/RCPT/PAID/BAL and other invoice meta — never wipe tags on hydrate.
  const existing = goodsMetaFromNotes(notes);
  notes = upsertGoodsMetaInNote(notes, {
    ...existing,
    soldQty: existing.soldQty != null ? existing.soldQty : (Number(r.sold_qty || 0) || 1),
    unitSoldPrice: existing.unitSoldPrice != null ? existing.unitSoldPrice : (Number(r.unit_sold_price || 0) || null),
    transactionType: existing.transactionType || "SALE"
  });
  return {
    id: r.id,
    group_id: r.group_id,
    direction: "taken",
    entry_kind: "partial",
    person_name: r.item_name,
    currency: r.currency,
    principal_amount: null,
    action_amount: Number(r.total_sold_price || 0),
    loan_date: r.sold_date,
    action_date: r.sold_date,
    notes,
    owner_id: currentOwnerId(),
    created_at: r.created_at,
    updated_at: r.updated_at,
    data_origin: "domain",
    domain_table: "goods_sales",
    is_legacy_meta: false
  };
}

function inventoryEventRowToEntry(row){
  const r = row || {};
  const tx = String(r.tx_type || "EVENT").toUpperCase();
  const isPrincipal = String(r.entry_kind || "") === "principal";
  let notes = r.notes || "";
  if (!hasGoodsTag(notes)) notes = normalizeGoodsNote(notes, true);
  const existing = goodsMetaFromNotes(notes);
  notes = upsertGoodsMetaInNote(notes, {
    ...existing,
    transactionType: existing.transactionType || tx,
    boughtQty: existing.boughtQty != null
      ? existing.boughtQty
      : (tx === "PURCHASE" ? Number(r.qty || 0) || null : existing.boughtQty),
    soldQty: existing.soldQty != null
      ? existing.soldQty
      : (tx === "SALE" ? Number(r.qty || 0) || null : existing.soldQty)
  });
  return {
    id: r.id,
    group_id: r.group_id,
    direction: r.direction || "taken",
    entry_kind: r.entry_kind || "partial",
    person_name: r.item_name,
    currency: r.currency,
    principal_amount: isPrincipal ? Number(r.amount || 0) : null,
    action_amount: isPrincipal ? null : Number(r.amount || 0),
    loan_date: r.event_date,
    action_date: isPrincipal ? null : r.event_date,
    notes,
    owner_id: currentOwnerId(),
    created_at: r.created_at,
    updated_at: r.updated_at,
    data_origin: "domain",
    domain_table: "goods_events",
    is_legacy_meta: false
  };
}

function applyInventoryLazyEntries(principals, actions){
  const scope = LEDGER_SCOPE_GOODS;
  const pending = state.entries.filter(entry =>
    entryBelongsToLedgerScope(entry, scope) && entry.id && state.pendingDbSyncIds.has(entry.id)
  );
  const pendingIds = new Set(pending.map(row => row.id));
  const previousScopeRows = state.entries.filter(entry => entryBelongsToLedgerScope(entry, scope));
  unmarkDbSnapshotRows(previousScopeRows);

  const nextPrincipals = (Array.isArray(principals) ? principals : []).filter(row => row?.id && !pendingIds.has(row.id));
  const nextActions = (Array.isArray(actions) ? actions : []).filter(row => row?.id && !pendingIds.has(row.id));
  const merged = nextPrincipals.concat(nextActions);

  state.entries = state.entries
    .filter(entry => !entryBelongsToLedgerScope(entry, scope) || pendingIds.has(entry.id))
    .concat(merged, pending)
    .sort((a, b) => dateStamp(b.created_at || b.action_date || b.loan_date) - dateStamp(a.created_at || a.action_date || a.loan_date));

  markDbSnapshotRows(merged.filter(row => !state.pendingDbSyncIds.has(row.id)));
  state.loadedLedgerScopes.add(scope);
  state.dataSource = "supabase";
}

function isInventoryLazyRpcMissingError(err){
  const msg = String(err?.message || err || "");
  return /app_list_my_inventory_summaries|app_list_my_inventory_item_detail|app_list_my_inventory_sales|Could not find the function|PGRST202|404/i.test(msg);
}

async function repairLedgerGoodsSalesOnce(){
  if (state._inventorySalesRepairTried) return false;
  state._inventorySalesRepairTried = true;
  if (typeof supabaseRpc !== "function") return false;
  try {
    const res = unwrapRpcJson(await supabaseRpc("app_repair_my_ledger_goods_sales", { p_limit: 2500 }));
    return Number(res?.repaired || 0) > 0;
  } catch (err) {
    const msg = String(err?.message || err || "");
    if (!/app_repair_my_ledger_goods_sales|Could not find the function|PGRST202|404/i.test(msg)) {
      console.warn("Ledger goods sales repair skipped.", err);
    }
    return false;
  }
}

async function loadInventorySalesForCustomers({ force = false } = {}){
  if (!databaseSessionCanLoad() && state.dataSource !== "supabase") return false;
  if (!force && state.inventorySalesLoaded) return true;
  try {
    let res = unwrapRpcJson(await supabaseRpc("app_list_my_inventory_sales", { p_limit: 2500 }));
    let saleRows = Array.isArray(res?.sales) ? res.sales : [];
    // First empty load after login: recover any SALE rows stuck in the ledger.
    if (!saleRows.length) {
      const repaired = await repairLedgerGoodsSalesOnce();
      if (repaired) {
        res = unwrapRpcJson(await supabaseRpc("app_list_my_inventory_sales", { p_limit: 2500 }));
        saleRows = Array.isArray(res?.sales) ? res.sales : [];
      }
    }
    const saleEntries = saleRows.map(inventorySaleRowToEntry);
    const saleIds = new Set(saleEntries.map(e => e.id).filter(Boolean));
    const eventEntries = (Array.isArray(res?.events) ? res.events : [])
      .map(inventoryEventRowToEntry)
      .filter(e => !e.id || !saleIds.has(e.id))
      .filter(e => !isInventorySaleAction(e));
    const principals = state.entries.filter(e =>
      entryBelongsToLedgerScope(e, LEDGER_SCOPE_GOODS) && e.entry_kind === "principal"
    );
    // Keep any already-loaded non-principal rows that are not replaced by this payload.
    const incomingIds = new Set([...saleEntries, ...eventEntries].map(e => e.id).filter(Boolean));
    const otherActions = state.entries.filter(e =>
      entryBelongsToLedgerScope(e, LEDGER_SCOPE_GOODS)
      && e.entry_kind !== "principal"
      && !incomingIds.has(e.id)
      && !e._inventoryLazySummary
    );
    applyInventoryLazyEntries(
      principals,
      dedupeInventoryActionEntries(otherActions.concat(saleEntries, eventEntries))
    );
    state.inventorySalesLoaded = true;
    // Do NOT mark detailLoaded from the global sales list — per-item Invoices
    // must still fetch app_list_my_inventory_item_detail so sales rows show.
    return true;
  } catch (err) {
    if (isInventoryLazyRpcMissingError(err)) {
      console.warn("Inventory sales list RPC unavailable; falling back to full goods load.", err);
      try {
        state.loadedLedgerScopes.delete(LEDGER_SCOPE_GOODS);
        state.inventoryLazy.rpcAvailable = false;
        await loadLedgerScopeFromSupabase(LEDGER_SCOPE_GOODS, { force: true });
        state.inventorySalesLoaded = true;
        return true;
      } catch (fallbackErr) {
        console.warn("Inventory customers fallback load failed:", fallbackErr);
        state.inventorySalesLoaded = false;
        return false;
      }
    }
    console.warn("Failed to load inventory sales for customers:", err);
    state.inventorySalesLoaded = false;
    return false;
  }
}

async function fetchInventorySummariesRpc({ search = "", brand = "", itemType = "", status = "", limit = 500 } = {}){
  const res = unwrapRpcJson(await supabaseRpc("app_list_my_inventory_summaries", {
    p_search: search || null,
    p_brand: brand || null,
    p_item_type: itemType || null,
    p_status: status || null,
    p_limit: limit
  }));
  return Array.isArray(res?.items) ? res.items : [];
}

function buildInventoryItemDetailLocalFallback(groupId, limit = 2000){
  const gid = String(groupId || "").trim();
  const lim = Math.max(1, Math.min(Number(limit) || 2000, 5000));
  const sales = state.entries
    .filter(e => String(e.group_id) === gid && e.entry_kind !== "principal" && hasGoodsTag(e.notes) && isInventorySaleAction(e))
    .slice(0, lim)
    .map(e => {
      const meta = goodsMetaFromNotes(e.notes);
      return {
        id: e.id,
        group_id: e.group_id,
        item_name: e.person_name,
        currency: e.currency,
        unit_sold_price: meta.unitSoldPrice,
        sold_qty: meta.soldQty,
        total_sold_price: e.action_amount,
        sold_date: e.action_date,
        notes: e.notes,
        created_at: e.created_at,
        updated_at: e.updated_at
      };
    });
  const events = state.entries
    .filter(e => String(e.group_id) === gid && e.entry_kind !== "principal" && hasGoodsTag(e.notes) && !isInventorySaleAction(e))
    .slice(0, lim)
    .map(e => ({
      id: e.id,
      group_id: e.group_id,
      tx_type: inferGoodsActionType(e),
      item_name: e.person_name,
      currency: e.currency,
      entry_kind: e.entry_kind,
      direction: e.direction,
      amount: e.action_amount,
      qty: goodsMetaFromNotes(e.notes).boughtQty || goodsMetaFromNotes(e.notes).soldQty,
      event_date: e.action_date,
      notes: e.notes,
      created_at: e.created_at,
      updated_at: e.updated_at
    }));
  const principal = state.entries.find(e => String(e.group_id) === gid && e.entry_kind === "principal");
  return {
    item: principal ? {
      id: principal.id,
      group_id: principal.group_id,
      item_name: principal.person_name,
      currency: principal.currency,
      notes: principal.notes
    } : null,
    sales,
    events
  };
}

async function fetchInventoryItemDetailRpc(groupId, limit = 2000){
  const gid = String(groupId || "").trim();
  try {
    const res = unwrapRpcJson(await supabaseRpc("app_list_my_inventory_item_detail", {
      p_group_id: gid,
      p_limit: limit
    }));
    return {
      item: res?.item && typeof res.item === "object" ? res.item : null,
      sales: Array.isArray(res?.sales) ? res.sales : [],
      events: Array.isArray(res?.events) ? res.events : []
    };
  } catch (err) {
    // Never surface missing-RPC / schema-cache errors to the Invoices button.
    console.warn("Item detail RPC unavailable; using local sale/event fallback. Run migrations/056_inventory_item_detail_rpc_restore.sql.", err);
    return buildInventoryItemDetailLocalFallback(gid, limit);
  }
}

async function loadInventorySummaries({ force = false } = {}){
  if (!databaseSessionCanLoad() && state.dataSource !== "supabase") return [];
  if (state.inventoryLazy.rpcAvailable === false) return [];
  const queryKey = "inventory-summaries";
  if (!force && state.inventoryLazy.queryKey === queryKey && state.inventoryLazy.enabled) {
    return state.inventoryLazy.summaries;
  }
  state.inventoryLazy.loading = true;
  try {
    // Load stock summaries once; brand/type/status/search filter client-side for snappy UX.
    const items = await fetchInventorySummariesRpc({ limit: 1000 });
    state.inventoryLazy.rpcAvailable = true;
    state.inventoryLazy.summaries = items;
    state.inventoryLazy.queryKey = queryKey;
    const principals = items.map(inventorySummaryToPrincipalEntry);
    // Keep ALL prior sale/customer/settlement actions across refresh so Customers
    // never goes blank after adding stock. Detail panels still lazy-load per SKU.
    const existingActions = state.entries.filter(entry =>
      entryBelongsToLedgerScope(entry, LEDGER_SCOPE_GOODS)
      && entry.entry_kind !== "principal"
      && !entry._inventoryLazySummary
    );
    applyInventoryLazyEntries(principals, existingActions);
    state.inventoryLazy.enabled = true;
    ensureInventoryBrandsLoaded(false).catch(() => {});
    return items;
  } catch (err) {
    if (isInventoryLazyRpcMissingError(err)) {
      state.inventoryLazy.rpcAvailable = false;
      state.inventoryLazy.enabled = false;
      console.warn("Inventory lazy RPCs unavailable; falling back to full inventory load.", err);
      return null;
    }
    state.inventoryLazy.lastError = String(err?.message || err || "Inventory summary load failed");
    throw err;
  } finally {
    state.inventoryLazy.loading = false;
  }
}

async function ensureInventoryItemDetailLoaded(groupId, { force = false } = {}){
  const gid = String(groupId || "").trim();
  if (!gid || !isInventoryLazyMode()) return null;
  const principalHint = state.entries.find(e => String(e.group_id) === gid && e.entry_kind === "principal");
  const localSaleCount = state.entries.filter(e =>
    String(e.group_id) === gid && e.entry_kind !== "principal" && hasGoodsTag(e.notes) && isInventorySaleAction(e)
  ).length;
  const expectsSales = Number(principalHint?._lazySoldQty || 0) > 0.00000001;
  if (!force && state.inventoryLazy.detailLoaded.has(gid)) {
    // Stale empty cache: summary says sold but no sale rows hydrated yet.
    if (!(expectsSales && !localSaleCount)) return true;
    state.inventoryLazy.detailLoaded.delete(gid);
  }
  let detail;
  try {
    detail = await fetchInventoryItemDetailRpc(gid);
  } catch (err) {
    console.warn("Inventory item detail failed; using local fallback.", err);
    detail = buildInventoryItemDetailLocalFallback(gid);
  }
  // If detail came back without sales but stock summary shows sold qty, hydrate global sales then rebuild.
  if (!(detail.sales || []).length && expectsSales) {
    try { await loadInventorySalesForCustomers({ force: true }); } catch (_) {}
    try {
      detail = await fetchInventoryItemDetailRpc(gid);
    } catch (_) {
      detail = buildInventoryItemDetailLocalFallback(gid);
    }
    if (!(detail.sales || []).length) {
      detail = buildInventoryItemDetailLocalFallback(gid);
    }
  }
  const saleEntries = (detail.sales || []).map(inventorySaleRowToEntry);
  const saleIds = new Set(saleEntries.map(e => e.id).filter(Boolean));
  const eventEntries = (detail.events || []).map(inventoryEventRowToEntry)
    .filter(row => row.entry_kind !== "principal")
    // Never keep the same row twice when an event mirrors a sale id.
    .filter(row => !row.id || !saleIds.has(row.id))
    // Sale-shaped events already live in goods_sales — skip TX:SALE duplicates.
    .filter(row => !isInventorySaleAction(row));
  const principals = state.entries
    .filter(e => entryBelongsToLedgerScope(e, LEDGER_SCOPE_GOODS) && e.entry_kind === "principal")
    .map(p => {
      if (String(p.group_id) !== gid) return p;
      const next = { ...p };
      delete next._inventoryLazySummary;
      delete next._lazySoldQty;
      delete next._lazySoldTotal;
      delete next._lazyRemainingQty;
      delete next._lazyStockStatus;
      return next;
    });
  // Keep any local sale lines for this group that the RPC/fallback missed (e.g. just finalized).
  const incomingIds = new Set([...saleEntries, ...eventEntries].map(e => e.id).filter(Boolean));
  const localSiblings = dedupeInventoryActionEntries(state.entries.filter(e =>
    entryBelongsToLedgerScope(e, LEDGER_SCOPE_GOODS)
    && e.entry_kind !== "principal"
    && String(e.group_id) === gid
    && !incomingIds.has(e.id)
    && !e._inventoryLazySummary
  ));
  const otherActions = state.entries.filter(e =>
    entryBelongsToLedgerScope(e, LEDGER_SCOPE_GOODS)
    && e.entry_kind !== "principal"
    && String(e.group_id) !== gid
  );
  applyInventoryLazyEntries(
    principals,
    dedupeInventoryActionEntries(otherActions.concat(saleEntries, eventEntries, localSiblings))
  );
  // Only mark loaded when we have sales or there is nothing expected to load.
  const loadedSales = saleEntries.length + localSiblings.filter(isInventorySaleAction).length;
  if (loadedSales > 0 || !expectsSales) {
    state.inventoryLazy.detailLoaded.add(gid);
  }
  return detail;
}

async function invalidateAndRefreshInventoryLazy(){
  if (state.inventoryLazy.rpcAvailable === false) return false;
  state.inventoryLazy.queryKey = "";
  // Keep detailLoaded + sales cache; only refresh stock summaries.
  // Customers list must remain available without a full re-fetch wait.
  try {
    const summaries = await loadInventorySummaries({ force: true });
    return summaries !== null;
  } catch (err) {
    console.warn("Inventory lazy refresh failed:", err);
    return false;
  }
}

async function loadGoodsScopeLazyOrFull(options = {}){
  if (state.inventoryLazy.rpcAvailable === false) {
    return { usedLazy: false };
  }
  try {
    const summaries = await loadInventorySummaries({ force: options.force === true });
    if (summaries === null) return { usedLazy: false };
    state.inventoryLazy.enabled = true;
    // Prefetch sales/customers in the background so Customers view is ready.
    loadInventorySalesForCustomers({ force: !!options.force }).catch(() => {});
    return { usedLazy: true };
  } catch (err) {
    if (isInventoryLazyRpcMissingError(err)) {
      state.inventoryLazy.rpcAvailable = false;
      state.inventoryLazy.enabled = false;
      return { usedLazy: false };
    }
    throw err;
  }
}

function buildExpenseAccountsUnfiltered(){
  const accounts = groupByLoan(getActiveEntries().filter(e => e.direction === "taken" && hasExpenseAccountTag(e.notes)))
    .map(group => {
      const principal = group.principal;
      const principalMeta = expenseMetaFromNotes(principal?.notes);
      const isBtcLive = String(principal?.currency || "").trim() === "BTC" && !!principalMeta.btcAddress;
      const btcNetwork = isBtcLive ? expenseBtcNetworkFromMeta(principalMeta) : "";
      const btcCache = isBtcLive ? expenseBtcGetCache(principalMeta.btcAddress, btcNetwork) : null;
      const topups = [];
      const spends = [];
      if (!isBtcLive) {
        for (const action of group.actions || []) {
          const meta = expenseMetaFromNotes(action.notes);
          action._expenseMeta = meta;
          if (meta.rowType === "TOPUP") topups.push(action);
          else if (meta.rowType === "EXPENSE") spends.push(action);
        }
      }
      let openingBalance = finiteMoney(principal?.principal_amount);
      let addedMoney = topups.reduce((sum, row) => sum + finiteMoney(row.action_amount), 0);
      let spentMoney = spends.reduce((sum, row) => sum + finiteMoney(row.action_amount), 0);
      let balance = openingBalance + addedMoney - spentMoney;

      // Prefer SQL aggregate balances in lazy mode so wallet figures stay accurate
      // even when only a date-scoped activity window is loaded in memory.
      // While a wallet mutation is still syncing, keep local/optimistic figures.
      const hasPendingWalletMutation = [group.principal, ...(group.actions || [])]
        .some(row => row?.id && state.pendingDbSyncIds.has(row.id));
      const lazySummary = isExpenseLazyMode() && !hasPendingWalletMutation
        ? state.expenseLazy.summaryByGroupId.get(String(group.group_id || ""))
        : null;
      if (lazySummary && !isBtcLive) {
        openingBalance = finiteMoney(lazySummary.opening_balance);
        addedMoney = finiteMoney(lazySummary.topup_total);
        spentMoney = finiteMoney(lazySummary.spend_total);
        balance = finiteMoney(lazySummary.balance);
      }

      if (isBtcLive && btcCache && btcCache.balanceSat != null) {
        openingBalance = btcSatToBtc(btcCache.fundedSat || 0);
        addedMoney = 0;
        spentMoney = btcSatToBtc(btcCache.sentSat || 0);
        balance = btcSatToBtc(btcCache.balanceSat || 0);
      }

      const status = balance > 0 ? "Open" : "Closed";
      const walletSortOrder = Number.isFinite(Number(principalMeta.walletSortOrder))
        ? Math.round(Number(principalMeta.walletSortOrder))
        : null;
      const account = {
        ...group,
        accountType: principalMeta.accountType || lazySummary?.account_type || "Bank Account",
        btcAddress: principalMeta.btcAddress || lazySummary?.btc_address || "",
        customLogoUrl: principalMeta.customLogoUrl || lazySummary?.custom_logo_url || "",
        btcNetwork,
        btcCache,
        isBtcLive,
        openingBalance,
        addedMoney,
        spentMoney,
        balance,
        status,
        topups,
        spends,
        actions: isBtcLive ? [] : group.actions,
        chainTransactions: isBtcLive && btcCache && Array.isArray(btcCache.transactions) ? btcCache.transactions : [],
        walletSortOrder
      };
      account.searchBlob = buildExpenseAccountSearchBlob(account);
      return account;
    });

  // Stable user order: sort_order first, then creation date, then group_id.
  // Activity dates must NOT reshuffle cards.
  return accounts.sort((a, b) => {
    const ao = a.walletSortOrder;
    const bo = b.walletSortOrder;
    const aHas = ao != null && Number.isFinite(ao);
    const bHas = bo != null && Number.isFinite(bo);
    if (aHas && bHas && ao !== bo) return ao - bo;
    if (aHas && !bHas) return -1;
    if (!aHas && bHas) return 1;
    const aCreated = dateStamp(a.principal?.loan_date || a.loan_date || a.principal?.created_at);
    const bCreated = dateStamp(b.principal?.loan_date || b.loan_date || b.principal?.created_at);
    if (aCreated !== bCreated) return aCreated - bCreated;
    return String(a.group_id || "").localeCompare(String(b.group_id || ""));
  });
}

function getExpenseAccounts(options = {}){
  const applyUiFilters = options.applyUiFilters !== false;
  const cache = getExpenseAccountsSyncCache();
  if (!cache.unfiltered) {
    cache.unfiltered = buildExpenseAccountsUnfiltered();
    cache.logoByName = null;
  }
  const groups = cache.unfiltered;
  if (!applyUiFilters) return groups;

  const searchTerm = String(state.search.expenses || "").trim().toLowerCase();
  const status = state.statusFilter.expenses;
  const currency = state.currencyFilter.expenses || "All";
  // In lazy mode, search is applied server-side to activity rows — keep wallet cards visible.
  const applyClientSearch = !isExpenseLazyMode();
  return groups.filter(group => {
    if (applyClientSearch && searchTerm && !(group.searchBlob || "").includes(searchTerm)) return false;
    if (currency !== "All" && group.currency !== currency) return false;
    if (status === "Active") return group.status === "Open";
    if (status === "Closed") return group.status === "Closed";
    return true;
  });
}

function getExistingItemNamesLowerForCurrency(currency){
  const set = new Set();
  const cur = String(currency || "").trim();
  for (const account of getExpenseAccounts({ applyUiFilters: false })){
    if (account.currency !== cur) continue;
    for (const row of account.spends){
      const meta = expenseMetaFromNotes(row.notes);
      const n = String(meta.itemName || "").trim().toLowerCase();
      if (n) set.add(n);
    }
  }
  return set;
}

function refreshExpenseItemIntentUi(){
  const wrap = els.expenseItemIntentWrap;
  if (!wrap || !els.expenseEntryForm || els.expenseEntryForm.classList.contains("hide")) return;
  const fd = new FormData(els.expenseEntryForm);
  const item = String(fd.get("item_name") || "").trim().toLowerCase();
  const cur = String(fd.get("currency") || "").trim();
  if (!item || !cur){
    wrap.classList.add("hide");
    return;
  }
  const exists = getExistingItemNamesLowerForCurrency(cur).has(item);
  wrap.classList.toggle("hide", !exists);
  if (!exists){
    const r = els.expenseEntryForm.querySelector('input[name="expense_item_intent"][value="additional"]');
    if (r) r.checked = true;
  }
}

function isInDateRange(dateStr){
  if (!state.expenseDateFrom && !state.expenseDateTo) return true;
  const d = dateStamp(dateStr);
  if (!d) return true;
  if (state.expenseDateFrom && d < dateStamp(state.expenseDateFrom)) return false;
  if (state.expenseDateTo && d > dateStamp(state.expenseDateTo + "T23:59:59")) return false;
  return true;
}

function localDateInputValue(date = new Date()){
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function addLocalDays(date, days){
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function monthStartISO(date = new Date()){
  return localDateInputValue(new Date(date.getFullYear(), date.getMonth(), 1));
}

function expenseHistoryRangeBounds(range = state.expenseHistoryRange){
  const today = new Date();
  const todayIso = localDateInputValue(today);
  if (range === "today"){
    return { from: todayIso, to: todayIso, label: "Today" };
  }
  if (range === "last7"){
    return { from: localDateInputValue(addLocalDays(today, -6)), to: todayIso, label: "Last 7 Days" };
  }
  if (range === "all"){
    return { from: "", to: "", label: "All" };
  }
  if (range === "custom"){
    return {
      from: state.expenseHistoryCustomFrom || "",
      to: state.expenseHistoryCustomTo || "",
      label: "Custom"
    };
  }
  return { from: monthStartISO(today), to: todayIso, label: "This Month" };
}

function expenseHistoryRangeText(){
  const bounds = expenseHistoryRangeBounds();
  if (!bounds.from && !bounds.to) return bounds.label;
  if (bounds.from && bounds.to) return `${bounds.label}: ${displayDate(bounds.from)} - ${displayDate(bounds.to)}`;
  if (bounds.from) return `${bounds.label}: from ${displayDate(bounds.from)}`;
  return `${bounds.label}: until ${displayDate(bounds.to)}`;
}

function isInExpenseHistoryRange(dateStr){
  const bounds = expenseHistoryRangeBounds();
  if (state.expenseHistoryRange === "custom" && !bounds.from && !bounds.to) return false;
  if (!bounds.from && !bounds.to) return true;
  const d = dateStamp(dateStr);
  if (!d) return true;
  if (bounds.from && d < dateStamp(bounds.from)) return false;
  if (bounds.to && d > dateStamp(bounds.to + "T23:59:59")) return false;
  return true;
}

function filterExpenseHistoryRows(spendAttached){
  const bounds = expenseHistoryRangeBounds();
  if (state.expenseHistoryRange === "custom" && !bounds.from && !bounds.to) return [];
  if (!bounds.from && !bounds.to) return spendAttached;
  const fromStamp = bounds.from ? dateStamp(bounds.from) : null;
  const toStamp = bounds.to ? dateStamp(bounds.to + "T23:59:59") : null;
  return spendAttached.filter(({ row }) => {
    const d = dateStamp(row.action_date);
    if (!d) return true;
    if (fromStamp && d < fromStamp) return false;
    if (toStamp && d > toStamp) return false;
    return true;
  });
}

async function setExpenseHistoryRange(range, keepHistoryOpen = false){
  const allowed = new Set(["month", "today", "last7", "all", "custom"]);
  state.expenseHistoryRange = allowed.has(range) ? range : "today";
  state.expenseLazy.historyPreferOpen = true;
  if (state.expenseHistoryRange === "custom"){
    state.expenseHistoryCustomFrom = "";
    state.expenseHistoryCustomTo = "";
  }
  if (isExpenseLazyMode() && state.expenseHistoryRange !== "custom") {
    try {
      await loadExpenseActivityForCurrentQuery({ force: true });
    } catch (err) {
      console.warn("Expense history range reload failed:", err);
    }
  }
  renderExpensesList();
  renderExpenseOverviewWallets();
  if (keepHistoryOpen || state.expenseLazy.historyPreferOpen){
    const section = document.getElementById("transactionsHistorySection");
    if (section) section.open = true;
  }
}

function collectExpenseSpendRows(accounts){
  const out = [];
  const wf = state.expenseWalletFilter;
  for (const account of accounts){
    if (wf !== "all" && account.group_id !== wf) continue;
    if (account.currency === "BTC") continue;
    for (const row of account.spends){
      if (!isInDateRange(row.action_date)) continue;
      out.push({ row, account });
    }
  }
  return out;
}

function btcTxDirectionForAddress(tx, walletAddress) {
  let received = 0;
  let sent = 0;

  for (const out of (tx.vout || [])) {
    if (out && out.scriptpubkey_address === walletAddress) {
      received += Number(out.value || 0);
    }
  }

  for (const input of (tx.vin || [])) {
    const prev = input && input.prevout;
    if (prev && prev.scriptpubkey_address === walletAddress) {
      sent += Number(prev.value || 0);
    }
  }

  const net = received - sent;
  let label = "self";
  let cls = "self";
  if (net > 0) { label = "received"; cls = "in"; }
  else if (net < 0) { label = "sent"; cls = "out"; }

  return { label, cls, netSat: net, receivedSat: received, sentSat: sent };
}

function expenseBtcExplorerUrl(txid, networkKey = "mainnet"){
  const safeTxid = encodeURIComponent(String(txid || ""));
  if (networkKey === "testnet") return `https://blockstream.info/testnet/tx/${safeTxid}`;
  if (networkKey === "signet") return `https://blockstream.info/signet/tx/${safeTxid}`;
  return `https://blockstream.info/tx/${safeTxid}`;
}

function expenseBtcTxDateIso(tx){
  return tx?.status?.confirmed && tx.status.block_time
    ? new Date(Number(tx.status.block_time) * 1000).toISOString().slice(0, 10)
    : "";
}

function expenseBtcAccountsForCurrentFilters(accounts){
  const currency = state.currencyFilter.expenses || "All";
  const status = state.statusFilter.expenses || "All";
  const walletFilter = state.expenseWalletFilter || "all";
  return (accounts || []).filter(account => {
    if (account.currency !== "BTC" || !account.btcAddress) return false;
    if (currency !== "All" && currency !== "BTC") return false;
    if (walletFilter !== "all" && account.group_id !== walletFilter) return false;
    if (status === "Active" && account.status !== "Open") return false;
    if (status === "Closed" && account.status !== "Closed") return false;
    return true;
  });
}

function renderExpenseBtcTransactionsSection(accounts, isOpen){
  const btcAccounts = expenseBtcAccountsForCurrentFilters(accounts);
  if (!btcAccounts.length) return "";

  const searchTerm = String(state.search.expenses || "").trim().toLowerCase();
  const rows = [];
  const notices = [];

  for (const account of btcAccounts){
    const cache = account.btcCache;
    if (cache?.loading) {
      notices.push(`<div class="empty">Loading blockchain records for ${escapeHtml(account.person_name || "BTC Wallet")}...</div>`);
    } else if (cache?.error) {
      notices.push(`<div class="empty">Could not load ${escapeHtml(account.person_name || "BTC Wallet")}: ${escapeHtml(cache.error)}</div>`);
    } else if (!account.chainTransactions.length) {
      notices.push(`<div class="empty">No blockchain transactions for ${escapeHtml(account.person_name || "BTC Wallet")}.</div>`);
    }

    for (const tx of account.chainTransactions){
      const dateIso = expenseBtcTxDateIso(tx);
      if (dateIso && !isInDateRange(dateIso)) continue;
      const dir = btcTxDirectionForAddress(tx, account.btcAddress);
      const type = dir.label === "received" ? "Received" : dir.label === "sent" ? "Sent" : "Self / change";
      const amount = dir.netSat === 0
        ? btcFormatBtcFromSat(0)
        : `${dir.netSat > 0 ? "+" : "-"}${btcFormatBtcFromSat(Math.abs(dir.netSat))}`;
      const status = tx.status?.confirmed
        ? (tx.status.block_height ? `confirmed @ ${tx.status.block_height}` : "confirmed")
        : "unconfirmed";
      const blob = `${account.person_name || ""} ${account.btcAddress || ""} ${tx.txid || ""} ${type} ${status}`.toLowerCase();
      if (searchTerm && !blob.includes(searchTerm)) continue;
      rows.push({
        account,
        tx,
        type,
        amount,
        amountStyle: dir.netSat < 0 ? "color: var(--danger);" : dir.netSat > 0 ? "color: var(--success);" : "",
        badgeClass: dir.netSat < 0 ? "orange" : dir.netSat > 0 ? "green" : "blue",
        status,
        dateText: tx.status?.confirmed ? btcFormatDate(tx.status.block_time || 0) : "mempool"
      });
    }
  }

  rows.sort((a, b) => Number(b.tx?.status?.block_time || 0) - Number(a.tx?.status?.block_time || 0));
  const statementAccount = btcAccounts.length === 1 ? btcAccounts[0] : null;
  const statementTitle = statementAccount
    ? `Download full statement for ${statementAccount.person_name || "BTC Wallet"}`
    : "Select one BTC wallet to download its full statement";

  const body = rows.length ? `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Date</th><th>Wallet</th><th>Type</th><th>Amount</th><th>Status</th><th>Txid</th><th>Action</th></tr></thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              <td>${escapeHtml(row.dateText)}</td>
              <td>
                ${getWalletIconHtml(row.account.person_name || "Wallet", 16, row.account.customLogoUrl || "")} ${escapeHtml(row.account.person_name || "BTC Wallet")}
                <span class="expense-wallet-address mono" title="${escapeHtml(row.account.btcAddress)}">${escapeHtml(row.account.btcAddress)}</span>
              </td>
              <td><span class="badge ${row.badgeClass}">${escapeHtml(row.type)}</span></td>
              <td style="${row.amountStyle}">${escapeHtml(row.amount)}</td>
              <td>${escapeHtml(row.status)}</td>
              <td class="mono">${escapeHtml(btcShortHash(row.tx.txid))}</td>
              <td>
                <div class="expense-tx-actions">
                  <button type="button" class="tiny ghost expenseBtcTxPdfBtn" data-group-id="${escapeHtml(row.account.group_id)}" data-tx-id="${escapeHtml(row.tx.txid)}" title="Download transaction receipt" aria-label="Download transaction receipt"><i class="fa-solid fa-download"></i></button>
                  <button type="button" class="tiny ghost expenseBtcTxBtn" data-url="${escapeHtml(expenseBtcExplorerUrl(row.tx.txid, row.account.btcNetwork))}" title="View on chain" aria-label="View on chain"><i class="fa-solid fa-link"></i></button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  ` : (notices.join("") || `<div class="empty">No blockchain transactions found.</div>`);

  return `<details class="expense-collapsible-section" id="btcBlockchainRecordsSection" ${isOpen ? "open" : ""}>
    <summary class="expense-collapsible-header">
      <h4 class="expense-section-title"><i class="fa-brands fa-bitcoin"></i> BTC Blockchain Transactions</h4>
      <span class="expense-section-actions">
        <button type="button" class="tiny ghost expenseBtcStatementBtn" data-group-id="${escapeHtml(statementAccount?.group_id || "")}" title="${escapeHtml(statementTitle)}"><i class="fa-solid fa-download"></i> Statement</button>
        <span class="expand-icon">▶</span>
      </span>
    </summary>
    <div class="expense-collapsible-content">${body}</div>
  </details>`;
}


function groupExpenseItems(spendAttached){
  const map = new Map();
  for (const { row, account } of spendAttached){
    const meta = row._expenseMeta || expenseMetaFromNotes(row.notes);
    const nameRaw = String(meta.itemName || "").trim();
    if (!nameRaw) continue;
    const currency = account.currency || "AED";
    const key = `${currency}||${nameRaw.toLowerCase()}`;
    if (!map.has(key)){
      map.set(key, {
        key,
        displayName: nameRaw,
        expenseType: meta.expenseType || "",
        currency,
        total: 0,
        taxTotal: 0,
        netTotal: 0,
        txs: []
      });
    }
    const g = map.get(key);
    const gross = Number(row.action_amount || 0);
    const tax = taxBreakdownFromMeta(meta, gross);
    g.total += gross;
    g.taxTotal += Number(tax.tax || 0);
    g.netTotal += Number(tax.net || 0);
    const notes = cleanExpenseNote(row.notes);
    g.txs.push({
      id: row.id,
      date: row.action_date,
      wallet: account.person_name,
      group_id: account.group_id,
      amount: gross,
      netAmount: Number(tax.net || 0),
      taxAmount: Number(tax.tax || 0),
      taxRate: Number(tax.rate || 0),
      taxMode: tax.mode,
      expenseType: meta.expenseType || "",
      notes
    });
  }
  for (const g of map.values()){
    g.txs.sort((a, b) => dateStamp(b.date) - dateStamp(a.date));
    g.searchBlob = expenseSearchBlob(
      g.displayName,
      g.expenseType,
      g.currency,
      g.total,
      g.txs.map(tx => [tx.wallet, tx.notes, tx.expenseType, tx.amount, tx.date])
    );
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

function walletRadioSafeId(groupId){
  return String(groupId || "").replace(/[^a-zA-Z0-9-]/g, "-");
}

function renderExpenseWalletBar(accounts){
  const host = els.expenseWalletFilters;
  if (!host) return;

  const blocks = [];
  const allId = "f_exp_wallet_all";
  const allChecked = state.expenseWalletFilter === "all" ? "checked" : "";
  blocks.push(`
    <div class="expense-wallet-card-wrap">
      <input type="radio" id="${allId}" name="f_exp_wallet" value="all" class="filter-radio expense-wallet-radio" ${allChecked}>
      <label for="${allId}" class="expense-wallet-card expense-wallet-card-all">
        <span class="expense-wallet-title">All wallets</span>
        <span class="expense-wallet-sub">Expense statement includes every wallet below.</span>
      </label>
    </div>
  `);

  for (const a of accounts){
    const rid = `f_exp_wallet_${walletRadioSafeId(a.group_id)}`;
    const ck = state.expenseWalletFilter === a.group_id ? "checked" : "";
    const totalTopup = Number(a.openingBalance || 0) + Number(a.addedMoney || 0);
    const gid = escapeHtml(a.group_id);
    const isBtcLive = a.currency === "BTC";
    const titleAmount = isBtcLive ? Number(a.balance || 0) : totalTopup;
    const walletAddressLine = a.btcAddress
      ? `<span class="expense-wallet-address mono" title="${escapeHtml(a.btcAddress)}">${escapeHtml(a.btcAddress)}</span>`
      : "";
    const inLabel = isBtcLive ? "Received" : "Top-up";
    const outLabel = isBtcLive ? "Sent" : "Spent";
    const btcStatusLine = isBtcLive && a.btcCache?.loading
      ? `<span><em>Blockchain</em> <strong>Loading...</strong></span>`
      : isBtcLive && a.btcCache?.error
      ? `<span><em>Blockchain</em> <strong title="${escapeHtml(a.btcCache.error)}">Needs refresh</strong></span>`
      : "";
    const walletActions = isBtcLive
      ? `
          <button type="button" class="expenseWalletQuick" data-action="details" data-group-id="${gid}">Details</button>
          <button type="button" class="expenseWalletQuick" data-action="pdf" data-group-id="${gid}">PDF</button>
          <button type="button" class="expenseWalletQuick" data-action="edit-account" data-entry-id="${escapeHtml(a.principal?.id || "")}">Edit</button>
          <button type="button" class="expenseWalletQuick danger" data-action="delete-account" data-entry-id="${escapeHtml(a.principal?.id || "")}">Delete</button>
        `
      : `
          <button type="button" class="expenseWalletQuick" data-action="details" data-group-id="${gid}">Details</button>
          <button type="button" class="expenseWalletQuick" data-action="topup" data-group-id="${gid}">Add money</button>
          <button type="button" class="expenseWalletQuick" data-action="expense" data-group-id="${gid}">Add expense</button>
          <button type="button" class="expenseWalletQuick" data-action="pdf" data-group-id="${gid}">PDF</button>
          <button type="button" class="expenseWalletQuick" data-action="edit-account" data-entry-id="${escapeHtml(a.principal?.id || "")}">Edit</button>
          <button type="button" class="expenseWalletQuick danger" data-action="delete-account" data-entry-id="${escapeHtml(a.principal?.id || "")}">Delete</button>
        `;
    
    // Calculate USD equivalent for BTC wallets
    let btcUsdEquivalent = "";
    if (a.currency === "BTC") {
      const btcBalance = Number(a.balance || 0);
      console.log(`Rendering BTC wallet ${a.group_id} with balance: ${btcBalance}, price available: ${!!state.bitcoin.btcPrice}`);
      
      if (btcBalance > 0) {
        // Always calculate USD equivalent, even if price is not available
        const usdValue = state.bitcoin.btcPrice ? 
          (btcBalance * state.bitcoin.btcPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) :
          '0.00';
        
        btcUsdEquivalent = `<span class="btc-usd-equivalent"><em>≈ $</em> <strong>${usdValue}</strong></span>`;
        
        // If no price available, fetch it and update
        if (!state.bitcoin.btcPrice) {
          console.log('No price available, fetching for BTC wallet');
          btcFetchPrice().then(priceData => {
            if (priceData && priceData.price) {
              const updatedUsd = (btcBalance * priceData.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              console.log(`Updating BTC wallet ${a.group_id} with USD: ${updatedUsd}`);
              
              // Find and update the USD equivalent element
              setTimeout(() => {
                const walletElement = document.querySelector(`[data-group-id="${gid}"] .btc-usd-equivalent`);
                if (walletElement) {
                  console.log('Found USD element, updating with:', updatedUsd);
                  walletElement.innerHTML = `<span class="btc-usd-equivalent"><em>≈ $</em> <strong>${updatedUsd}</strong></span>`;
                } else {
                  console.log('USD element not found for wallet:', a.group_id);
                }
              }, 100);
            }
          }).catch(err => console.error('Failed to fetch price for BTC wallet:', err));
        }
      }
    }
    
    blocks.push(`
      <div class="expense-wallet-card-wrap">
        ${walletLogoPhotoMenuHtml(a.group_id, a.person_name || "Wallet", { hasCustomLogo: !!String(a.customLogoUrl || "").trim() })}
        <input type="radio" id="${rid}" name="f_exp_wallet" value="${gid}" class="filter-radio expense-wallet-radio" ${ck}>
        <label for="${rid}" class="expense-wallet-card wallet-details-card" data-group-id="${gid}" data-wallet-details="${gid}" title="View wallet details · Long-press to reorder">
          <span class="expense-wallet-title">${getWalletIconHtml(a.person_name || "Wallet", 18, a.customLogoUrl || "")} ${escapeHtml(a.person_name || "Wallet")} (${escapeHtml(formatReportAmount(titleAmount, a.currency))})</span>
          ${walletAddressLine}
          <span class="expense-wallet-sub">${escapeHtml(a.accountType || "")} · ${currencySymbolHtml(a.currency)}${isBtcLive ? " · Live blockchain" : ""}</span>
          <div class="expense-wallet-stats">
            <span><em>${inLabel}</em> <strong>${escapeHtml(formatReportAmount(totalTopup, a.currency))}</strong></span>
            <span><em>${outLabel}</em> <strong>${escapeHtml(formatReportAmount(a.spentMoney, a.currency))}</strong></span>
            <span class="available-label"><em style="color: var(--success) !important;">Available</em> <strong class="available-amount">${escapeHtml(formatReportAmount(a.balance, a.currency))}</strong></span>
            ${btcUsdEquivalent}
            ${btcStatusLine}
          </div>
        </label>
        <div class="expense-wallet-actions">
          ${walletActions}
          ${(() => {
            const seed = state.entries.find(e => e.group_id === a.group_id && e.is_legacy_meta);
            if (!seed || !window.DomainLedger) return "";
            return DomainLedger.legacyFixBadgeHtml(a.group_id, seed.id);
          })()}
        </div>
      </div>
    `);
  }

  host.innerHTML = blocks.join("");
  ensureExpenseWalletBarDelegation();
  bindWalletLogoMenus(host);
  ensureExpenseWalletReorder(host, {
    itemSelector: ".expense-wallet-card-wrap:has([data-wallet-details])",
    getGroupId: el => el.querySelector("[data-wallet-details]")?.dataset?.walletDetails
      || el.querySelector("[data-group-id]")?.dataset?.groupId
  });
}

function syncExpenseWalletDomOrder(orderedGroupIds){
  const ids = (Array.isArray(orderedGroupIds) ? orderedGroupIds : [])
    .map(id => String(id || "").trim())
    .filter(Boolean);
  if (!ids.length) return;

  const overview = document.getElementById("expenseOverviewWallets");
  if (overview) {
    const grid = overview.querySelector(".wallets-grid") || overview;
    const cards = Array.from(grid.querySelectorAll(".summary.wallet-details-card[data-wallet-details]"));
    const byId = new Map(cards.map(card => [String(card.dataset.walletDetails || ""), card]));
    ids.forEach(id => {
      const card = byId.get(id);
      if (card && card.parentNode === grid) grid.appendChild(card);
    });
    if (Array.isArray(overview.accounts) && overview.accounts.length) {
      const accountById = new Map(overview.accounts.map(a => [String(a.group_id || ""), a]));
      const orderedAccounts = ids.map(id => accountById.get(id)).filter(Boolean);
      const leftovers = overview.accounts.filter(a => !ids.includes(String(a.group_id || "")));
      overview.accounts = orderedAccounts.concat(leftovers);
    }
  }

  const bar = els.expenseWalletFilters;
  if (bar) {
    const wraps = Array.from(bar.querySelectorAll(".expense-wallet-card-wrap")).filter(wrap =>
      !!wrap.querySelector("[data-wallet-details]")
    );
    const byId = new Map();
    wraps.forEach(wrap => {
      const gid = String(
        wrap.querySelector("[data-wallet-details]")?.dataset?.walletDetails
        || wrap.querySelector("[data-group-id]")?.dataset?.groupId
        || ""
      );
      if (gid) byId.set(gid, wrap);
    });
    ids.forEach(id => {
      const wrap = byId.get(id);
      if (wrap && wrap.parentNode === bar) bar.appendChild(wrap);
    });
  }
}

function persistExpenseWalletOrder(orderedGroupIds){
  const ids = (Array.isArray(orderedGroupIds) ? orderedGroupIds : [])
    .map(id => String(id || "").trim())
    .filter(Boolean);
  if (!ids.length) return;
  const byGroup = new Map();
  for (const entry of state.entries || []) {
    if (!entry || entry.entry_kind !== "principal") continue;
    if (!hasExpenseAccountTag(entry.notes)) continue;
    const gid = String(entry.group_id || "").trim();
    if (gid) byGroup.set(gid, entry);
  }
  let changed = false;
  ids.forEach((gid, index) => {
    const entry = byGroup.get(gid);
    if (!entry) return;
    const nextNotes = upsertExpenseMetaInNote(entry.notes || null, {
      ...expenseMetaFromNotes(entry.notes),
      walletSortOrder: index
    });
    if (nextNotes === entry.notes) return;
    entry.notes = nextNotes;
    if (entry.meta && typeof entry.meta === "object") {
      entry.meta = { ...entry.meta, etype: "ACCOUNT", sort_order: index };
    } else {
      entry.meta = { etype: "ACCOUNT", sort_order: index };
    }
    changed = true;
    // Silent: avoid renderAll() flicker while wallet cards are already live-reordered.
    queueDatabasePatch(entry.id, { notes: nextNotes }, "Wallet order", entry, { silent: true });
  });
  if (!changed) {
    syncExpenseWalletDomOrder(ids);
    return;
  }
  invalidateExpenseAccountsSyncCache();
  // Keep existing amount HTML intact — only mirror card order across wallet lists.
  syncExpenseWalletDomOrder(ids);
}

function ensureExpenseWalletReorder(host, options = {}){
  if (!host || host.dataset.walletReorderBound === "1") return;
  host.dataset.walletReorderBound = "1";

  const LONG_MS = 450;
  const MOVE_CANCEL_PX = 14;
  const itemSelector = options.itemSelector || "[data-wallet-details]";
  const getGroupId = typeof options.getGroupId === "function"
    ? options.getGroupId
    : (el) => el?.dataset?.walletDetails || el?.dataset?.groupId;

  let pressTimer = null;
  let dragging = false;
  let suppressClick = false;
  let sourceEl = null;
  let pointerId = null;
  let ghost = null;
  let lastOver = null;
  let pressCard = null;
  let lastX = 0;
  let lastY = 0;
  const dragSession = typeof createCardReorderDragSession === "function"
    ? createCardReorderDragSession("expense-wallet-drag-lock")
    : null;

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
    host.classList.remove("expense-wallet-press-armed");
    if (pressCard) {
      pressCard.classList.remove("expense-wallet-pressing");
      pressCard = null;
    }
  };

  const cleanupDrag = () => {
    clearPress();
    clearPressUi();
    dragging = false;
    sourceEl = null;
    pointerId = null;
    lastOver = null;
    host.classList.remove("expense-wallet-reordering");
    dragSession?.stop();
    document.documentElement.classList.remove("expense-wallet-drag-lock");
    document.body.classList.remove("expense-wallet-drag-lock");
    host.querySelectorAll(".expense-wallet-drag-source, .expense-wallet-drop-target").forEach(el => {
      el.classList.remove("expense-wallet-drag-source", "expense-wallet-drop-target");
    });
    if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
    ghost = null;
  };

  const reorderableItems = () => Array.from(host.querySelectorAll(itemSelector))
    .filter(el => !!getGroupId(el));

  const beginDrag = (el, point) => {
    const gid = getGroupId(el);
    if (!gid) return;
    clearSelection();
    dragging = true;
    suppressClick = true;
    sourceEl = el;
    pointerId = point?.pointerId;
    host.classList.add("expense-wallet-reordering");
    document.documentElement.classList.add("expense-wallet-drag-lock");
    document.body.classList.add("expense-wallet-drag-lock");
    el.classList.add("expense-wallet-drag-source");
    try {
      if (point?.pointerId != null) el.setPointerCapture?.(point.pointerId);
    } catch (_) {}
    try {
      if (navigator.vibrate) navigator.vibrate(12);
    } catch (_) {}

    ghost = el.cloneNode(true);
    ghost.classList.add("expense-wallet-drag-ghost");
    ghost.querySelectorAll("button, a, input, .wallet-logo-menu-wrap").forEach(node => {
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
      if (lastOver && lastOver !== over) lastOver.classList.remove("expense-wallet-drop-target");
      if (over) {
        over.classList.add("expense-wallet-drop-target");
        applyLiveReorder(over);
      }
      lastOver = over;
    };
    dragSession?.start(host, gy, {
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
    if (!target || !host.contains(target) || target === sourceEl) return null;
    return getGroupId(target) ? target : null;
  };

  const applyLiveReorder = (target) => {
    if (!sourceEl || !target || sourceEl === target) return;
    const items = reorderableItems();
    const from = items.indexOf(sourceEl);
    const to = items.indexOf(target);
    if (from < 0 || to < 0 || from === to) return;
    if (from < to) target.after(sourceEl);
    else target.before(sourceEl);
  };

  const finishDrag = () => {
    if (!dragging || !sourceEl) {
      cleanupDrag();
      return;
    }
    const ordered = reorderableItems().map(getGroupId).filter(Boolean);
    cleanupDrag();
    persistExpenseWalletOrder(ordered);
    setTimeout(() => { suppressClick = false; }, 0);
  };

  host.addEventListener("pointerdown", (e) => {
    if (e.button != null && e.button !== 0) return;
    if (e.target.closest("button, a, input, select, textarea, .expenseWalletQuick, .overview-card-actions, .wallet-logo-menu-wrap")) return;
    const card = e.target.closest(itemSelector);
    if (!card || !host.contains(card) || !getGroupId(card)) return;
    // Don't start reorder from the "All wallets" card
    if (card.classList?.contains?.("expense-wallet-card-all") || card.querySelector?.(".expense-wallet-card-all")) return;

    clearPress();
    clearPressUi();
    clearSelection();
    pressCard = card;
    card.classList.add("expense-wallet-pressing");
    host.classList.add("expense-wallet-press-armed");

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
      if (lastOver && lastOver !== over) lastOver.classList.remove("expense-wallet-drop-target");
      if (over) {
        over.classList.add("expense-wallet-drop-target");
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

    // Document + capture so mobile drag keeps working outside the host / after scroll.
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
    if (dragging || pressTimer || host.classList.contains("expense-wallet-press-armed") || host.classList.contains("expense-wallet-reordering")) {
      e.preventDefault();
    }
  });

  host.addEventListener("contextmenu", (e) => {
    if (!e.target.closest(itemSelector)) return;
    // Prevent long-press context menu on mobile while reordering
    if (dragging || pressTimer || host.classList.contains("expense-wallet-press-armed")) e.preventDefault();
  });
}

function ensureExpenseWalletBarDelegation(){
  const host = els.expenseWalletFilters;
  if (!host || host.dataset.delegated === "1") return;
  host.dataset.delegated = "1";

  host.addEventListener("click", async e => {
    if (host.classList.contains("expense-wallet-reordering")) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const legacyBtn = e.target.closest("[data-legacy-fix-id]");
    if (legacyBtn && host.contains(legacyBtn)) {
      e.preventDefault();
      e.stopPropagation();
      fixLegacyMetaEntry(legacyBtn.dataset.legacyFixId, legacyBtn.dataset.legacyFixGroup);
      return;
    }
    const quick = e.target.closest(".expenseWalletQuick");
    if (quick && host.contains(quick)) {
      e.preventDefault();
      e.stopPropagation();
      const action = quick.dataset.action;
      if (action === "details") openWalletDetailsOverlay(quick.dataset.groupId);
      if (action === "pdf") await downloadExpenseAccountPDF(quick.dataset.groupId);
      if (action === "topup") openExpenseModal("topup", quick.dataset.groupId);
      if (action === "expense") openExpenseModal("expense", quick.dataset.groupId);
      if (action === "edit-account") openEditModal(quick.dataset.entryId);
      if (action === "delete-account") await deleteEntry(quick.dataset.entryId);
      return;
    }
    if (e.target.closest(".wallet-logo-menu-wrap")) return;
    const card = e.target.closest(".expense-wallet-card[data-wallet-details]");
    if (card && host.contains(card)) {
      const groupId = card.dataset.walletDetails || card.dataset.groupId;
      if (groupId) openWalletDetailsOverlay(groupId);
    }
  });

  host.addEventListener("change", async e => {
    const inp = e.target.closest('input[name="f_exp_wallet"]');
    if (!inp || !host.contains(inp)) return;
    state.expenseWalletFilter = inp.value;
    if (isExpenseLazyMode()) {
      try {
        await loadExpenseActivityForCurrentQuery({ force: true });
      } catch (err) {
        console.warn("Wallet filter reload failed:", err);
      }
    }
    renderExpensesList();
    renderExpenseOverviewWallets();
  });
}

function renderExpenseAccountSelectors(){
  const accounts = getExpenseAccounts({ applyUiFilters: false }).filter(a => a.currency !== "BTC");
  const byCurrency = accounts.reduce((acc, account) => {
    const key = account.currency || "";
    acc[key] = acc[key] || [];
    acc[key].push(account);
    return acc;
  }, {});

  els.expenseTopupAccountSelect.innerHTML = accounts.length
    ? `<option value="">Choose account</option>${accounts.map(a => `<option value="${escapeHtml(a.group_id)}">${escapeHtml(a.person_name)} (${escapeHtml(a.accountType)}) - ${escapeHtml(formatReportAmount(a.balance, a.currency))}</option>`).join("")}`
    : `<option value="">No accounts found</option>`;

  const chosenCurrency = els.expenseCurrencySelect.value || "AED";
  const currencyAccounts = byCurrency[chosenCurrency] || [];
  els.expenseSpendAccountSelect.innerHTML = currencyAccounts.length
    ? `<option value="">Choose account</option>${currencyAccounts.map(a => `<option value="${escapeHtml(a.group_id)}">${escapeHtml(a.person_name)} (${escapeHtml(a.accountType)}) - ${escapeHtml(formatReportAmount(a.balance, a.currency))}</option>`).join("")}`
    : `<option value="">No account in ${escapeHtml(chosenCurrency)}</option>`;
}

function syncExpenseTaxDefaults(force = false) {
  if (!els.expenseEntryForm) return;
  const currency = String(els.expenseCurrencySelect?.value || state.lastCurrency || "AED");
  const defaults = getTaxSettingForCurrency(currency);
  if (force || els.expenseEntryForm.dataset.taxManual !== "true") {
    if (els.expenseTaxApplied) els.expenseTaxApplied.checked = false;
    if (els.expenseTaxRate) els.expenseTaxRate.value = defaults.rate ? trimInventoryNumber(defaults.rate, 2) : "";
    if (els.expenseTaxMode) els.expenseTaxMode.value = TAX_MODE_INCLUDE;
  }
  updateExpenseTaxPreview();
}

function getExpenseTaxBreakdown() {
  if (!els.expenseEntryForm) return calculateTaxBreakdown(0, 0, TAX_MODE_INCLUDE, false);
  const amount = Number(els.expenseEntryForm.querySelector('[name="amount"]')?.value || 0);
  const applied = !!els.expenseTaxApplied?.checked;
  const rate = normalizeTaxRate(els.expenseTaxRate?.value);
  const mode = normalizeTaxMode(els.expenseTaxMode?.value);
  return calculateTaxBreakdown(amount, rate, mode, applied);
}

function updateExpenseTaxPreview() {
  if (!els.expenseTaxPreview) return;
  const currency = String(els.expenseCurrencySelect?.value || state.lastCurrency || "AED");
  const breakdown = getExpenseTaxBreakdown();
  els.expenseTaxPreview.textContent = formatTaxSummary(breakdown, currency);
}

function openExpenseModal(mode, presetGroupId = ""){
  if ((mode === "topup" || mode === "expense") && presetGroupId) {
    const presetAccount = getExpenseAccounts({ applyUiFilters: false }).find(a => a.group_id === presetGroupId);
    if (presetAccount?.currency === "BTC") {
      alert("BTC wallet balances and transactions are loaded directly from the blockchain.");
      return;
    }
  }

  els.expenseModal.classList.remove("hide");
  els.expenseModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  els.expenseAccountForm.classList.toggle("hide", mode !== "account");
  els.expenseTopupForm.classList.toggle("hide", mode !== "topup");
  els.expenseEntryForm.classList.toggle("hide", mode !== "expense");
  renderExpenseAccountSelectors();

  const accountDate = document.getElementById("expenseAccountDateInline");
  const topupDate = document.getElementById("expenseTopupDateInline");
  const entryDate = document.getElementById("expenseEntryDateInline");
  if (accountDate) {
    accountDate.classList.toggle("hide", mode !== "account");
    accountDate.required = mode === "account";
    if (mode !== "account") accountDate.removeAttribute("required");
  }
  if (topupDate) {
    topupDate.classList.toggle("hide", mode !== "topup");
    topupDate.required = mode === "topup";
    if (mode !== "topup") topupDate.removeAttribute("required");
  }
  if (entryDate) {
    entryDate.classList.toggle("hide", mode !== "expense");
    entryDate.required = mode === "expense";
    if (mode !== "expense") entryDate.removeAttribute("required");
  }
  if (els.expenseModalDesc) els.expenseModalDesc.classList.add("hide");

  if (mode === "account"){
    els.expenseModalTitle.textContent = "Add Expense Account";
    els.expenseAccountForm.reset();
    setCurrencyChoice(els.expenseAccountForm, state.lastCurrency || "AED");
    syncExpenseBtcAccountFields(els.expenseAccountForm);
    bindExpenseAccountCustomLogoUi(els.expenseAccountForm);
    syncExpenseAccountCustomLogoFields(els.expenseAccountForm);
    if (accountDate) accountDate.value = todayISO();
    defaultDateInputs(els.expenseAccountForm);
    if (accountDate && !accountDate.value) accountDate.value = todayISO();
  } else if (mode === "topup"){
    els.expenseModalTitle.textContent = "Add Money";
    els.expenseTopupForm.reset();
    if (topupDate) topupDate.value = todayISO();
    defaultDateInputs(els.expenseTopupForm);
    if (topupDate && !topupDate.value) topupDate.value = todayISO();
    if (presetGroupId) els.expenseTopupAccountSelect.value = presetGroupId;
  } else {
    els.expenseModalTitle.textContent = "Add Expense";
    els.expenseEntryForm.reset();
    els.expenseEntryForm.dataset.taxManual = "false";
    els.expenseCurrencySelect.value = state.lastCurrency || "AED";
    renderExpenseAccountSelectors();
    syncExpenseTaxDefaults(true);
    if (entryDate) entryDate.value = todayISO();
    defaultDateInputs(els.expenseEntryForm);
    if (entryDate && !entryDate.value) entryDate.value = todayISO();
    if (presetGroupId) els.expenseSpendAccountSelect.value = presetGroupId;
    const intentAdd = els.expenseEntryForm.querySelector('input[name="expense_item_intent"][value="additional"]');
    if (intentAdd) intentAdd.checked = true;
    if (els.expenseItemIntentWrap) els.expenseItemIntentWrap.classList.add("hide");
    refreshExpenseItemIntentUi();
  }
}

async function uploadWalletLogoToStorage(userId, groupId, file){
  if (!file) return "";
  if (!String(file.type || "").startsWith("image/")) {
    throw new Error("Wallet logo must be an image file (PNG, JPG, or WebP).");
  }
  if (file.size > 2 * 1024 * 1024) {
    throw new Error("Wallet logo must be 2MB or smaller.");
  }
  const dbConfig = getSupabaseConfig();
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const path = `${userId}/wallet-${groupId || "new"}-${Date.now()}.${ext}`;
  const uploadUrl = `${dbConfig.supabaseUrl}/storage/v1/object/company-logos/${path}`;
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      apikey: dbConfig.supabaseKey,
      Authorization: `Bearer ${dbConfig.supabaseKey}`,
      "Content-Type": file.type || "image/png",
      "x-upsert": "true"
    },
    body: file
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Wallet logo upload failed (${res.status})`);
  }
  return `${dbConfig.supabaseUrl}/storage/v1/object/public/company-logos/${path}`;
}

async function deleteWalletLogoFromStorage(url){
  const path = typeof walletLogoStorageObjectPath === "function" ? walletLogoStorageObjectPath(url) : "";
  if (!path) return false;
  if (typeof isStoredWalletLogoUrl === "function" && !isStoredWalletLogoUrl(url)) return false;
  const dbConfig = getSupabaseConfig();
  const deleteUrl = `${dbConfig.supabaseUrl}/storage/v1/object/company-logos/${path}`;
  try {
    const res = await fetch(deleteUrl, {
      method: "DELETE",
      headers: {
        apikey: dbConfig.supabaseKey,
        Authorization: `Bearer ${dbConfig.supabaseKey}`
      }
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn("Wallet logo storage delete failed:", res.status, text);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("Wallet logo storage delete error:", err);
    return false;
  }
}

function findExpenseWalletPrincipal(groupId){
  const gid = String(groupId || "").trim();
  if (!gid) return null;
  return (state.entries || []).find(e =>
    e
    && String(e.group_id || "") === gid
    && e.entry_kind === "principal"
    && hasExpenseAccountTag(e.notes)
  ) || null;
}

function getExpenseWalletLogoState(groupId){
  const accounts = typeof getExpenseAccounts === "function" ? getExpenseAccounts({ applyUiFilters: false }) : [];
  const account = accounts.find(a => String(a.group_id) === String(groupId));
  const name = account?.person_name || findExpenseWalletPrincipal(groupId)?.person_name || "Wallet";
  const custom = String(account?.customLogoUrl || expenseMetaFromNotes(findExpenseWalletPrincipal(groupId)?.notes || "").customLogoUrl || "").trim();
  const src = typeof resolveWalletLogoSrc === "function" ? resolveWalletLogoSrc(name, custom) : custom;
  return { groupId, name, customLogoUrl: custom, src, account };
}

function ensureWalletLogoViewerModal(){
  let modal = document.getElementById("walletLogoViewerModal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "walletLogoViewerModal";
  modal.className = "modal hide wallet-logo-viewer-modal";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="modal-backdrop" data-close-wallet-logo-viewer></div>
    <div class="modal-dialog wallet-logo-viewer-dialog" role="dialog" aria-modal="true" aria-labelledby="walletLogoViewerTitle">
      <div class="modal-head">
        <div>
          <h3 id="walletLogoViewerTitle">Wallet logo</h3>
          <p class="help" id="walletLogoViewerDesc">Full-size wallet photo</p>
        </div>
        <button class="icon-btn ghost" type="button" data-close-wallet-logo-viewer aria-label="Close">×</button>
      </div>
      <div class="modal-body wallet-logo-viewer-body">
        <img id="walletLogoViewerImg" alt="Wallet logo" />
      </div>
      <div class="modal-actions wallet-logo-viewer-actions">
        <button type="button" class="btn soft" id="walletLogoViewerChangeBtn"><i class="fa-solid fa-camera"></i> Change</button>
        <button type="button" class="btn ghost" data-close-wallet-logo-viewer>Close</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelectorAll("[data-close-wallet-logo-viewer]").forEach(el => {
    el.addEventListener("click", e => {
      e.preventDefault();
      closeWalletLogoViewer();
    });
  });
  modal.addEventListener("click", e => {
    if (e.target && e.target.matches(".modal-backdrop")) closeWalletLogoViewer();
  });
  document.getElementById("walletLogoViewerChangeBtn")?.addEventListener("click", e => {
    e.preventDefault();
    const gid = modal.dataset.groupId || "";
    closeWalletLogoViewer();
    if (gid) startExpenseWalletLogoChange(gid);
  });
  return modal;
}

function closeWalletLogoViewer(){
  const modal = document.getElementById("walletLogoViewerModal");
  if (!modal) return;
  modal.classList.add("hide");
  modal.setAttribute("aria-hidden", "true");
  modal.dataset.groupId = "";
  const img = document.getElementById("walletLogoViewerImg");
  if (img) img.removeAttribute("src");
  document.body.style.overflow = "";
}

function openWalletLogoViewer(groupId){
  const info = getExpenseWalletLogoState(groupId);
  const modal = ensureWalletLogoViewerModal();
  const title = document.getElementById("walletLogoViewerTitle");
  const desc = document.getElementById("walletLogoViewerDesc");
  const img = document.getElementById("walletLogoViewerImg");
  modal.dataset.groupId = String(groupId || "");
  if (title) title.textContent = info.name || "Wallet logo";
  if (desc) {
    desc.textContent = info.customLogoUrl
      ? "Custom wallet logo"
      : "Default / predefined wallet logo";
  }
  if (img) {
    img.alt = `${info.name || "Wallet"} logo`;
    img.onerror = function () {
      if (this.dataset.fallbackApplied === "1") {
        this.onerror = null;
        return;
      }
      this.dataset.fallbackApplied = "1";
      this.onerror = null;
      this.src = DEFAULT_WALLET_LOGO_PATH;
    };
    img.dataset.fallbackApplied = "";
    img.src = info.src || DEFAULT_WALLET_LOGO_PATH;
  }
  const changeBtn = document.getElementById("walletLogoViewerChangeBtn");
  if (changeBtn) {
    const canEdit = typeof teamCanShowEdit !== "function" || teamCanShowEdit("entries");
    changeBtn.classList.toggle("hide", !canEdit);
  }
  modal.classList.remove("hide");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function ensureWalletLogoFileInput(){
  let input = document.getElementById("walletLogoChangeFileInput");
  if (input) return input;
  input = document.createElement("input");
  input.id = "walletLogoChangeFileInput";
  input.type = "file";
  input.accept = "image/png,image/jpeg,image/webp,image/*";
  input.className = "hide";
  input.hidden = true;
  document.body.appendChild(input);
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    const groupId = input.dataset.groupId || "";
    input.value = "";
    input.dataset.groupId = "";
    if (!file || !groupId) return;
    try {
      await changeExpenseWalletLogo(groupId, file);
    } catch (err) {
      alert(err?.message || "Could not change wallet logo.");
    }
  });
  return input;
}

function startExpenseWalletLogoChange(groupId){
  if (typeof teamCanShowEdit === "function" && !teamCanShowEdit("entries")) {
    alert("You do not have permission to change wallet logos.");
    return;
  }
  const input = ensureWalletLogoFileInput();
  input.dataset.groupId = String(groupId || "");
  input.click();
}

async function changeExpenseWalletLogo(groupId, file){
  const gid = String(groupId || "").trim();
  if (!gid) throw new Error("Wallet not found.");
  if (!file) throw new Error("Choose a logo image.");
  const principal = findExpenseWalletPrincipal(gid);
  if (!principal) throw new Error("Wallet account not found.");

  const prevMeta = expenseMetaFromNotes(principal.notes || "");
  const previousLogo = String(prevMeta.customLogoUrl || "").trim();
  const ownerId = state.sessionUser?.id || "";

  let nextLogo = "";
  if (!isGuestMode() && ownerId) {
    try {
      nextLogo = await uploadWalletLogoToStorage(ownerId, gid, file);
    } catch (err) {
      console.warn("Wallet logo storage upload failed; using embedded image.", err);
    }
  }
  if (!nextLogo) nextLogo = await compressWalletLogoDataUrl(file);

  const nextNotes = upsertExpenseMetaInNote(principal.notes || null, {
    ...prevMeta,
    customLogoUrl: nextLogo
  });
  principal.notes = nextNotes;
  if (typeof queueDatabasePatch === "function") {
    queueDatabasePatch(principal.id, { notes: nextNotes }, "Wallet logo", principal);
  }

  if (state.expenseLazy?.summaryByGroupId?.has?.(gid)) {
    const prev = state.expenseLazy.summaryByGroupId.get(gid) || {};
    state.expenseLazy.summaryByGroupId.set(gid, { ...prev, custom_logo_url: nextLogo });
  }

  invalidateExpenseAccountsSyncCache();
  renderExpenseOverviewWallets();
  renderExpenseWalletBar(getExpenseAccounts());
  if (typeof renderExpensesList === "function") renderExpensesList();

  // Only delete previous logos that live in Supabase storage — never touch default/predefined files.
  if (
    previousLogo
    && previousLogo !== nextLogo
    && typeof isStoredWalletLogoUrl === "function"
    && isStoredWalletLogoUrl(previousLogo)
  ) {
    deleteWalletLogoFromStorage(previousLogo).catch(() => {});
  }
}

function ensureWalletLogoDefaultConfirmModal(){
  let modal = document.getElementById("walletLogoDefaultConfirmModal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "walletLogoDefaultConfirmModal";
  modal.className = "modal hide wallet-logo-default-confirm-modal";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="modal-backdrop" data-close-wallet-logo-default></div>
    <div class="modal-dialog wallet-logo-default-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="walletLogoDefaultConfirmTitle">
      <div class="modal-head smart-pin-confirm-head is-danger">
        <div class="smart-pin-confirm-icon" aria-hidden="true"><i class="fa-solid fa-triangle-exclamation"></i></div>
        <div>
          <h3 id="walletLogoDefaultConfirmTitle">Restore default logo?</h3>
          <p class="help" id="walletLogoDefaultConfirmDesc">The uploaded wallet logo will be deleted and the default or predefined wallet logo will be applied.</p>
        </div>
        <button class="icon-btn ghost" type="button" data-close-wallet-logo-default aria-label="Close">×</button>
      </div>
      <div class="modal-body">
        <p class="wallet-logo-default-warning" id="walletLogoDefaultConfirmWarn">
          This removes the custom photo from this wallet. If it was stored online, the uploaded file will also be deleted. This cannot be undone.
        </p>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn ghost" data-close-wallet-logo-default>Cancel</button>
        <button type="button" class="btn danger" id="walletLogoDefaultConfirmBtn">Use default</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelectorAll("[data-close-wallet-logo-default]").forEach(el => {
    el.addEventListener("click", e => {
      e.preventDefault();
      closeWalletLogoDefaultConfirm(false);
    });
  });
  modal.addEventListener("click", e => {
    if (e.target && e.target.matches(".modal-backdrop")) closeWalletLogoDefaultConfirm(false);
  });
  document.getElementById("walletLogoDefaultConfirmBtn")?.addEventListener("click", e => {
    e.preventDefault();
    closeWalletLogoDefaultConfirm(true);
  });
  return modal;
}

let walletLogoDefaultConfirmResolve = null;

function closeWalletLogoDefaultConfirm(confirmed){
  const modal = document.getElementById("walletLogoDefaultConfirmModal");
  if (modal) {
    modal.classList.add("hide");
    modal.setAttribute("aria-hidden", "true");
    modal.dataset.groupId = "";
  }
  document.body.style.overflow = "";
  const resolve = walletLogoDefaultConfirmResolve;
  walletLogoDefaultConfirmResolve = null;
  if (typeof resolve === "function") resolve(!!confirmed);
}

function openWalletLogoDefaultConfirm(groupId){
  const info = getExpenseWalletLogoState(groupId);
  const modal = ensureWalletLogoDefaultConfirmModal();
  const title = document.getElementById("walletLogoDefaultConfirmTitle");
  const desc = document.getElementById("walletLogoDefaultConfirmDesc");
  const warn = document.getElementById("walletLogoDefaultConfirmWarn");
  modal.dataset.groupId = String(groupId || "");
  if (title) title.textContent = `Restore default logo?`;
  if (desc) {
    desc.textContent = info.name
      ? `“${info.name}” is using an uploaded logo.`
      : "This wallet is using an uploaded logo.";
  }
  if (warn) {
    warn.textContent = "The uploaded wallet logo will be deleted and the default or predefined wallet logo will be applied. This cannot be undone.";
  }
  modal.classList.remove("hide");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  return new Promise(resolve => {
    walletLogoDefaultConfirmResolve = resolve;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      document.removeEventListener("keydown", onKey);
      closeWalletLogoDefaultConfirm(false);
    };
    document.addEventListener("keydown", onKey);
    const prevResolve = resolve;
    walletLogoDefaultConfirmResolve = (value) => {
      document.removeEventListener("keydown", onKey);
      prevResolve(value);
    };
  });
}

async function startExpenseWalletLogoDefault(groupId){
  if (typeof teamCanShowEdit === "function" && !teamCanShowEdit("entries")) {
    alert("You do not have permission to change wallet logos.");
    return;
  }
  const gid = String(groupId || "").trim();
  if (!gid) return;
  const info = getExpenseWalletLogoState(gid);
  if (!info.customLogoUrl) {
    alert("This wallet is already using the default logo.");
    return;
  }
  const ok = await openWalletLogoDefaultConfirm(gid);
  if (!ok) return;
  try {
    await resetExpenseWalletLogoToDefault(gid);
  } catch (err) {
    alert(err?.message || "Could not restore the default wallet logo.");
  }
}

async function resetExpenseWalletLogoToDefault(groupId){
  const gid = String(groupId || "").trim();
  if (!gid) throw new Error("Wallet not found.");
  const principal = findExpenseWalletPrincipal(gid);
  if (!principal) throw new Error("Wallet account not found.");

  const prevMeta = expenseMetaFromNotes(principal.notes || "");
  const previousLogo = String(prevMeta.customLogoUrl || "").trim();
  if (!previousLogo) return;

  const nextNotes = upsertExpenseMetaInNote(principal.notes || null, {
    ...prevMeta,
    customLogoUrl: ""
  });
  principal.notes = nextNotes;
  if (typeof queueDatabasePatch === "function") {
    queueDatabasePatch(principal.id, { notes: nextNotes }, "Wallet logo", principal);
  }

  if (state.expenseLazy?.summaryByGroupId?.has?.(gid)) {
    const prev = state.expenseLazy.summaryByGroupId.get(gid) || {};
    state.expenseLazy.summaryByGroupId.set(gid, { ...prev, custom_logo_url: "" });
  }

  invalidateExpenseAccountsSyncCache();
  renderExpenseOverviewWallets();
  renderExpenseWalletBar(getExpenseAccounts());
  if (typeof renderExpensesList === "function") renderExpensesList();

  if (
    previousLogo
    && typeof isStoredWalletLogoUrl === "function"
    && isStoredWalletLogoUrl(previousLogo)
  ) {
    deleteWalletLogoFromStorage(previousLogo).catch(() => {});
  }
}

function syncWalletLogoMenuDefaultVisibility(panel, groupId){
  if (!panel) return;
  const info = getExpenseWalletLogoState(groupId);
  const hasCustom = !!String(info.customLogoUrl || "").trim();
  const canEdit = typeof teamCanShowEdit !== "function" || teamCanShowEdit("entries");
  const defaultBtn = panel.querySelector('.walletLogoMenuAction[data-action="default"]');
  if (defaultBtn) defaultBtn.classList.toggle("hide", !(hasCustom && canEdit));
}

function closeAllWalletLogoMenus(exceptPanel = null){
  document.querySelectorAll(".wallet-logo-menu-dropdown.open").forEach(panel => {
    if (exceptPanel && panel === exceptPanel) return;
    panel.classList.remove("open");
  });
  document.querySelectorAll(".wallet-logo-photo-btn[aria-expanded='true']").forEach(btn => {
    if (exceptPanel && exceptPanel.previousElementSibling === btn) return;
    const key = btn.dataset.walletLogoTrigger;
    if (exceptPanel && exceptPanel.getAttribute("data-wallet-logo-panel") === key) return;
    btn.setAttribute("aria-expanded", "false");
  });
}

function bindWalletLogoMenus(root){
  if (!root || root.dataset.walletLogoMenusBound === "1") return;
  root.dataset.walletLogoMenusBound = "1";

  root.addEventListener("click", e => {
    const actionBtn = e.target.closest(".walletLogoMenuAction");
    if (actionBtn && root.contains(actionBtn)) {
      e.preventDefault();
      e.stopPropagation();
      closeAllWalletLogoMenus();
      const groupId = actionBtn.dataset.groupId || "";
      const action = actionBtn.dataset.action;
      if (action === "view") openWalletLogoViewer(groupId);
      if (action === "change") startExpenseWalletLogoChange(groupId);
      if (action === "default") startExpenseWalletLogoDefault(groupId);
      return;
    }

    const trigger = e.target.closest("[data-wallet-logo-trigger]");
    if (trigger && root.contains(trigger)) {
      e.preventDefault();
      e.stopPropagation();
      const key = trigger.dataset.walletLogoTrigger;
      const panel = root.querySelector(`[data-wallet-logo-panel="${CSS.escape ? CSS.escape(key) : key}"]`)
        || root.querySelector(`[data-wallet-logo-panel="${key}"]`);
      if (!panel) return;
      const willOpen = !panel.classList.contains("open");
      closeAllWalletLogoMenus(willOpen ? panel : null);
      panel.classList.toggle("open", willOpen);
      trigger.setAttribute("aria-expanded", willOpen ? "true" : "false");
      if (willOpen) {
        syncWalletLogoMenuDefaultVisibility(panel, key);
        const rect = trigger.getBoundingClientRect();
        const panelWidth = Math.min(panel.offsetWidth || 120, window.innerWidth - 16);
        const left = Math.min(Math.max(8, rect.right - panelWidth), window.innerWidth - panelWidth - 8);
        const top = Math.min(rect.bottom + 4, window.innerHeight - 12);
        panel.style.position = "fixed";
        panel.style.top = `${top}px`;
        panel.style.left = `${left}px`;
        panel.style.right = "auto";
        panel.style.zIndex = "13000";
      }
    }
  });
}

document.addEventListener("click", e => {
  if (e.target.closest(".wallet-logo-menu-wrap")) return;
  closeAllWalletLogoMenus();
});
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  const defaultModal = document.getElementById("walletLogoDefaultConfirmModal");
  if (defaultModal && !defaultModal.classList.contains("hide")) {
    closeWalletLogoDefaultConfirm(false);
    return;
  }
  if (document.getElementById("walletLogoViewerModal") && !document.getElementById("walletLogoViewerModal").classList.contains("hide")) {
    closeWalletLogoViewer();
    return;
  }
  closeAllWalletLogoMenus();
});

function readFileAsDataUrl(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read logo file."));
    reader.readAsDataURL(file);
  });
}

async function compressWalletLogoDataUrl(file, maxSize = 128){
  const raw = await readFileAsDataUrl(file);
  if (!raw || typeof createImageBitmap !== "function") return raw;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height, 1));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return raw;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    return canvas.toDataURL("image/png");
  } catch {
    return raw;
  }
}

async function resolveWalletCustomLogoFromForm(form, groupId){
  const useCustom = !!form.querySelector('[name="use_custom_logo"]')?.checked;
  if (!useCustom) return "";
  const file = form.querySelector('[name="custom_logo_file"]')?.files?.[0];
  if (!file) throw new Error("Choose a logo image, or uncheck Use custom logo.");
  const ownerId = state.sessionUser?.id || "";
  if (!isGuestMode() && ownerId) {
    try {
      return await uploadWalletLogoToStorage(ownerId, groupId, file);
    } catch (err) {
      console.warn("Wallet logo storage upload failed; using embedded image.", err);
    }
  }
  return compressWalletLogoDataUrl(file);
}

function syncExpenseAccountCustomLogoFields(form = els.expenseAccountForm){
  if (!form) return;
  const checkbox = form.querySelector('[name="use_custom_logo"]');
  const field = form.querySelector("#expenseCustomLogoField");
  const preview = form.querySelector("#expenseCustomLogoPreview");
  const fileInput = form.querySelector('[name="custom_logo_file"]');
  const enabled = !!checkbox?.checked;
  if (field) field.classList.toggle("hide", !enabled);
  if (!enabled) {
    if (fileInput) fileInput.value = "";
    if (preview) {
      preview.src = "";
      preview.classList.add("hide");
    }
  }
}

function bindExpenseAccountCustomLogoUi(form = els.expenseAccountForm){
  if (!form || form.dataset.customLogoBound === "1") return;
  form.dataset.customLogoBound = "1";
  const checkbox = form.querySelector('[name="use_custom_logo"]');
  const fileInput = form.querySelector('[name="custom_logo_file"]');
  const preview = form.querySelector("#expenseCustomLogoPreview");
  checkbox?.addEventListener("change", () => syncExpenseAccountCustomLogoFields(form));
  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file || !preview) return;
    try {
      preview.src = await compressWalletLogoDataUrl(file);
      preview.classList.remove("hide");
    } catch {
      preview.src = "";
      preview.classList.add("hide");
    }
  });
}

async function saveExpenseAccount(form){
  const fd = new FormData(form);
  const currency = String(fd.get("currency") || "AED").trim();
  const accountType = String(fd.get("account_type") || "Bank Account");
  let openingBalance = Number(fd.get("opening_balance") || 0);
  let btcAddress = "";
  let btcNetwork = "";
  const groupId = crypto.randomUUID();

  if (currency === "BTC") {
    btcAddress = String(fd.get("btc_address") || "").trim();
    if (!btcAddress) throw new Error("Bitcoin wallet address is required.");
    const btcData = await fetchExpenseBtcWalletData(btcAddress);
    btcAddress = btcData.address;
    btcNetwork = btcData.networkKey;
    openingBalance = btcSatToBtc(btcData.balanceSat);
    expenseBtcSetCache(btcAddress, btcNetwork, btcData);
  }

  const customLogoUrl = await resolveWalletCustomLogoFromForm(form, groupId);

  const existingAccounts = getExpenseAccounts({ applyUiFilters: false });
  const maxSort = existingAccounts.reduce((max, a) => {
    const n = Number(a.walletSortOrder);
    return Number.isFinite(n) ? Math.max(max, n) : max;
  }, -1);
  const nextSortOrder = maxSort + 1;

  const payload = {
    group_id: groupId,
    direction: "taken",
    entry_kind: "principal",
    person_name: String(fd.get("account_name") || "").trim(),
    currency,
    principal_amount: openingBalance,
    action_amount: null,
    loan_date: String(fd.get("account_date") || ""),
    action_date: null,
    notes: upsertExpenseMetaInNote(String(fd.get("notes") || "").trim() || null, {
      accountType,
      rowType: "ACCOUNT",
      btcAddress,
      btcNetwork,
      customLogoUrl,
      walletSortOrder: nextSortOrder
    }),
    meta: { etype: "ACCOUNT", sort_order: nextSortOrder }
  };
  if (!payload.person_name || !payload.currency || payload.principal_amount === "" || payload.principal_amount === null || payload.principal_amount === undefined || !payload.loan_date){
    throw new Error("Complete all required fields.");
  }
  validateCurrencyForForm(fd);
  if (currency === "BTC") state.expenseWalletFilter = payload.group_id;
  saveEntriesImmediately(payload, { label: "Expense account" });
  closeModal("expenseModal");
}

async function saveExpenseTopup(form){
  const fd = new FormData(form);
  const groupId = String(fd.get("group_id") || "");
  const amount = finiteMoney(fd.get("amount"));
  const date = String(fd.get("date") || "");
  const notes = String(fd.get("notes") || "").trim() || null;
  if (!groupId || !(amount > 0) || !date) throw new Error("Complete all required fields.");
  const principal = state.entries.find(e => e.group_id === groupId && e.direction === "taken" && e.entry_kind === "principal" && hasExpenseAccountTag(e.notes));
  if (!principal) throw new Error("Account not found.");
  if (principal.currency === "BTC") throw new Error("BTC wallet balances and transactions are loaded directly from the blockchain.");
  const payload = {
    group_id: groupId,
    direction: "taken",
    entry_kind: "partial",
    person_name: principal.person_name,
    currency: principal.currency,
    principal_amount: null,
    action_amount: amount,
    loan_date: principal.loan_date,
    action_date: date,
    notes: upsertExpenseMetaInNote(notes, {
      accountType: expenseMetaFromNotes(principal.notes).accountType || "Bank Account",
      rowType: "TOPUP"
    })
  };
  saveEntriesImmediately(payload, { label: "Top-up" });
  
  // Show money added success overlay
  showMoneyAddedSuccessOverlay(principal.person_name, amount, principal.currency);
  
  closeModal("expenseModal");
}

async function saveExpenseEntry(form){
  const fd = new FormData(form);
  const groupId = String(fd.get("group_id") || "");
  const selectedCurrency = String(fd.get("currency") || "").trim();
  const enteredAmount = finiteMoney(fd.get("amount"));
  const taxBreakdown = getExpenseTaxBreakdown();
  const amount = taxBreakdown.total;
  const date = String(fd.get("date") || "");
  const itemName = String(fd.get("item_name") || "").trim();
  const expenseType = String(fd.get("custom_expense_type") || "").trim() || String(fd.get("expense_type") || "").trim() || "Other";
  const notes = String(fd.get("notes") || "").trim() || null;
  const itemIntent = String(fd.get("expense_item_intent") || "additional");
  if (!groupId || !(enteredAmount > 0) || !date || !itemName) throw new Error("Complete all required fields.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid expense amount.");
  const account = getExpenseAccounts({ applyUiFilters: false }).find(a => a.group_id === groupId);
  if (!account) throw new Error("Account not found.");
  if (account.currency === "BTC") throw new Error("BTC wallet transactions are loaded directly from the blockchain.");
  if (selectedCurrency && account.currency !== selectedCurrency){
    throw new Error("Selected currency does not match the account currency.");
  }
  const nameLower = itemName.toLowerCase();
  const existingNames = getExistingItemNamesLowerForCurrency(account.currency);
  if (existingNames.has(nameLower) && itemIntent === "new_distinct"){
    throw new Error("This item name already exists. Either choose \"More spending on the same item\" or enter a different item name.");
  }
  if (amount > account.balance) throw new Error(`Insufficient balance. Available: ${formatReportAmount(account.balance, account.currency)}.`);
  const payload = {
    group_id: groupId,
    direction: "taken",
    entry_kind: "partial",
    person_name: account.person_name,
    currency: account.currency,
    principal_amount: null,
    action_amount: amount,
    loan_date: account.principal?.loan_date || todayISO(),
    action_date: date,
    notes: upsertExpenseMetaInNote(notes, {
      accountType: account.accountType,
      rowType: "EXPENSE",
      itemName,
      expenseType,
      ...taxMetaFromBreakdown(taxBreakdown)
    })
  };
  saveEntriesImmediately(payload, { label: "Expense" });
  closeModal("expenseModal");
}

async function downloadExpenseAccountPDF(groupId){
  if (isGuestMode()){
    showGuestRestrictionOverlay("download");
    return;
  }
  if (isExpenseLazyMode()) {
    try {
      await ensureExpenseWalletDetailLoaded(groupId, { force: true });
      invalidateExpenseAccountsSyncCache();
    } catch (err) {
      console.warn("Wallet PDF detail load failed:", err);
    }
  }
  const account = getExpenseAccounts({ applyUiFilters: false }).find(a => a.group_id === groupId);
  if (!account){
    alert("Account not found.");
    return;
  }
  if (account.isBtcLive) {
    await downloadExpenseBtcAccountPDF(account);
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
  const title = "Expense Account Report";
  const subtitle = `Account: ${account.person_name}`;
  drawPdfHeader(doc, logoData, title, subtitle);
  const expenseMeta = [
    { label: "Type", value: account.accountType || "—" },
    { label: "Currency", value: pdfCurrencyLabel(account.currency) },
    { label: "Balance", value: formatPdfAmount(account.balance, account.currency) }
  ];
  if (account.currency === "BTC" && account.balance > 0 && state.bitcoin.btcPrice) {
    const usdValue = (account.balance * state.bitcoin.btcPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    expenseMeta.push({ label: "Approx USD", value: usdValue });
  }
  const expensePartiesBottom = drawCompactPdfPartiesAndMeta(doc, {
    rightLabel: "ACCOUNT",
    partyName: account.person_name,
    meta: expenseMeta
  });

  let runningBalance = Number(account.openingBalance || 0);
  const rows = [
    ["Opening", displayDate(account.principal?.loan_date || "—"), "—", formatPdfAmount(account.openingBalance, account.currency), formatPdfAmount(runningBalance, account.currency), cleanExpenseNote(account.principal?.notes)]
  ];
  const timeline = account.actions.slice().sort((a, b) => dateStamp(a.action_date) - dateStamp(b.action_date));
  timeline.forEach(row => {
    const meta = expenseMetaFromNotes(row.notes);
    const isExpense = meta.rowType === "EXPENSE";
    const amt = Number(row.action_amount || 0);
    const tax = taxBreakdownFromMeta(meta, amt);
    runningBalance = isExpense ? runningBalance - amt : runningBalance + amt;
    rows.push([
      isExpense ? `Expense (${meta.expenseType || "Other"})` : "Topup",
      displayDate(row.action_date || "—"),
      isExpense ? (meta.itemName || "—") : "—",
      formatPdfAmount(amt, account.currency),
      isExpense && tax.tax ? formatPdfAmount(tax.tax, account.currency) : "-",
      formatPdfAmount(runningBalance, account.currency),
      cleanExpenseNote(row.notes)
    ]);
  });

  doc.autoTable({
    startY: expensePartiesBottom + 5,
    head: [["Type", "Date", "Item", "Notes", "VAT", "Amount", "Balance"]],
    body: rows.map(row => row.length === 6
      ? [row[0], row[1], row[2], row[5], "-", row[3], row[4]]
      : [row[0], row[1], row[2], row[6], row[4], row[3], row[5]]
    ),
    theme: "grid",
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold", fontSize: 7.4 },
    styles: { font: "helvetica", fontSize: 7.4, cellPadding: 1.6, overflow: "linebreak" },
    tableWidth: 182,
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 22 },
      2: { cellWidth: 24 },
      3: { cellWidth: 45 },
      4: { cellWidth: 15, halign: "right" },
      5: { cellWidth: 26, halign: "right" },
      6: { cellWidth: 26, halign: "right" }
    },
    margin: { top: 50, bottom: 40 },
    didDrawPage: () => drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false)
  });
  doc.save(`Expense_Account_${String(account.person_name || "account").replace(/\s+/g, "_")}.pdf`);
}

function expenseBtcWalletPdfContext(account){
  const networkKey = account.btcNetwork || "mainnet";
  const networkInfo = btcGetNetworkInfo(networkKey);
  return {
    key: networkKey,
    label: networkInfo.label,
    address: account.btcAddress,
    isWatchOnly: true
  };
}

async function getExpenseBtcAccountForPdf(groupIdOrAccount, options = {}){
  const groupId = typeof groupIdOrAccount === "string" ? groupIdOrAccount : groupIdOrAccount?.group_id;
  let account = typeof groupIdOrAccount === "object" && groupIdOrAccount
    ? groupIdOrAccount
    : getExpenseAccounts({ applyUiFilters: false }).find(a => a.group_id === groupId);
  if (!account?.isBtcLive || !account.btcAddress) throw new Error("BTC wallet not found.");

  const needAll = options.fetchAll === true;
  const loadedCount = Number(account.chainTransactions?.length || 0);
  const maxNeeded = Math.min(Number(account.btcCache?.txCount || 0), MAX_BTC_HISTORY);
  const hasNeededTransactions = !needAll || loadedCount >= maxNeeded;
  const needsRefresh = !account.btcCache || account.btcCache.error || account.btcCache.loading || !hasNeededTransactions;

  if (needsRefresh) {
    const data = needAll
      ? await fetchExpenseBtcAllWalletData(account.btcAddress, account.btcNetwork || "mainnet")
      : await fetchExpenseBtcWalletData(account.btcAddress, account.btcNetwork || "mainnet");
    expenseBtcSetCache(data.address, data.networkKey, data);
    account = getExpenseAccounts({ applyUiFilters: false }).find(a => a.group_id === account.group_id) || account;
  }

  return account;
}

async function downloadExpenseBtcStatementPDF(groupIdOrAccount){
  try {
    const account = await getExpenseBtcAccountForPdf(groupIdOrAccount, { fetchAll: true });
    await btcDownloadPDF({
      wallet: expenseBtcWalletPdfContext(account),
      transactions: account.chainTransactions || [],
      balanceSat: account.btcCache?.balanceSat ?? Math.round(Number(account.balance || 0) * 1e8)
    });
  } catch (err) {
    alert(`Could not download BTC statement: ${err.message || err}`);
  }
}

async function downloadExpenseBtcTransactionReceiptPDF(groupId, txid){
  try {
    let account = await getExpenseBtcAccountForPdf(groupId, { fetchAll: false });
    let tx = (account.chainTransactions || []).find(row => row.txid === txid);
    if (!tx) {
      account = await getExpenseBtcAccountForPdf(account, { fetchAll: true });
      tx = (account.chainTransactions || []).find(row => row.txid === txid);
    }
    if (!tx) throw new Error("Transaction not found.");
    await btcDownloadTransactionPDF(tx, expenseBtcWalletPdfContext(account));
  } catch (err) {
    alert(`Could not download BTC transaction receipt: ${err.message || err}`);
  }
}

async function downloadExpenseBtcAccountPDF(account){
  await downloadExpenseBtcStatementPDF(account);
}

function expenseSearchBlob(...parts){
  return parts
    .flatMap(part => Array.isArray(part) ? part : [part])
    .map(part => {
      if (part == null) return "";
      if (typeof part === "number" && Number.isFinite(part)) return String(part);
      return String(part);
    })
    .join(" ")
    .toLowerCase();
}

function filterExpensesBySearch(expenses, searchTerm){
  if (!searchTerm || searchTerm.trim() === "") return expenses;

  const term = searchTerm.toLowerCase().trim();
  return expenses.filter(expense => {
    if (expense.searchBlob) return expense.searchBlob.includes(term);

    // For expense items (from groupExpenseItems)
    if (expense.displayName !== undefined) {
      const itemBlob = expenseSearchBlob(
        expense.displayName,
        expense.expenseType,
        expense.currency,
        expense.total
      );
      if (itemBlob.includes(term)) return true;
      return !!(expense.txs && expense.txs.some(tx => expenseSearchBlob(
        tx.wallet,
        tx.notes,
        tx.expenseType,
        tx.amount,
        tx.taxAmount,
        tx.date
      ).includes(term)));
    }

    // For transfer events (from buildTransferEvents)
    if (expense.fromWallet !== undefined) {
      return expenseSearchBlob(
        expense.fromWallet,
        expense.toWallet,
        expense.fromAccountType,
        expense.toAccountType,
        cleanExpenseNote(expense.notesExpense),
        cleanExpenseNote(expense.notesTopup),
        expense.amtOut,
        expense.amtIn,
        expense.curOut,
        expense.curIn,
        expense.rate,
        expense.date
      ).includes(term);
    }

    // For topup transactions (from collectTopupTransactionsFlat)
    if (expense.person_name !== undefined) {
      return expenseSearchBlob(
        expense.person_name,
        cleanExpenseNote(expense.notes),
        expense.accountType,
        expense.action_amount,
        expense.principal_amount,
        expense.currency,
        expense.isOpeningBalance ? "opening balance" : "top-up",
        expense.action_date,
        expense.loan_date
      ).includes(term);
    }

    return expenseSearchBlob(
      expense.displayName,
      expense.wallet,
      cleanExpenseNote(expense.notes),
      expense.expenseType,
      expense.person_name,
      expense.accountType,
      expense.amount,
      expense.action_amount,
      expense.currency
    ).includes(term);
  });
}

function renderExpenseHistoryRangeControls(){
  const active = state.expenseHistoryRange || "today";
  const options = [
    ["today", "Today"],
    ["last7", "Last 7 Days"],
    ["month", "This Month"],
    ["all", "All"],
    ["custom", "Custom"]
  ];
  return `<span class="expense-history-controls">
    ${options.map(([value, label]) => `
      <button type="button" class="tiny ghost expense-history-range-btn ${active === value ? "active" : ""}" data-expense-history-range="${escapeHtml(value)}">${escapeHtml(label)}</button>
    `).join("")}
    <span class="expense-history-download-wrap">
      <button type="button" class="icon-btn ghost expenseActionBtn expense-history-download" data-action="pdf-menu" data-type="transactions-history" title="Download Transactions History PDF" aria-haspopup="true" aria-expanded="false"><i class="fa-solid fa-download"></i></button>
      <div class="expense-history-pdf-menu hide" role="menu" aria-label="PDF download options">
        <button type="button" class="expense-history-pdf-option" role="menuitem" data-action="pdf" data-type="transactions-history" data-mode="detailed">
          <strong>Detailed PDF</strong>
          <span>Each item with full transaction list</span>
        </button>
        <button type="button" class="expense-history-pdf-option" role="menuitem" data-action="pdf" data-type="transactions-history" data-mode="summary">
          <strong>Summarize PDF</strong>
          <span>Totals per item for the selected dates</span>
        </button>
      </div>
    </span>
  </span>`;
}

function renderExpenseHistoryToolbar(transactionCount){
  const customOpen = state.expenseHistoryRange === "custom";
  return `<div class="expense-section-toolbar expense-history-toolbar">
    <span class="expense-toolbar-hint">Showing ${escapeHtml(expenseHistoryRangeText())}. ${transactionCount} transaction(s) in this selection.</span>
    <span class="expense-history-custom ${customOpen ? "" : "hide"}">
      <input type="date" class="input" data-expense-history-date="from" value="${escapeHtml(state.expenseHistoryCustomFrom || "")}" aria-label="Transactions history from date">
      <input type="date" class="input" data-expense-history-date="to" value="${escapeHtml(state.expenseHistoryCustomTo || "")}" aria-label="Transactions history to date">
      <button type="button" class="tiny primary expense-history-custom-apply">Ok</button>
    </span>
  </div>`;
}

function getExpenseDetailsOpenState(){
  if (!els.expensesList) return new Set();
  const openDetails = new Set();
  els.expensesList.querySelectorAll("details").forEach(detail => {
    if (!detail.open) return;
    const key = detail.dataset.expenseDetailsId || detail.id;
    if (key) openDetails.add(key);
  });
  return openDetails;
}

function restoreExpenseDetailsOpenState(openDetails){
  if (!els.expensesList || !openDetails?.size) return;
  els.expensesList.querySelectorAll("details").forEach(detail => {
    const key = detail.dataset.expenseDetailsId || detail.id;
    if (key && openDetails.has(key)) detail.open = true;
  });
}

function renderExpensesList(){
  const openExpenseDetails = getExpenseDetailsOpenState();
  if (state.expenseLazy.historyPreferOpen) openExpenseDetails.add("transactionsHistorySection");
  let accountsForSections = getExpenseAccounts({ applyUiFilters: false });
  if (refreshExpenseBtcWallets(accountsForSections)) {
    // BTC refresh may flip loading flags synchronously — rebuild once for this turn.
    invalidateExpenseAccountsSyncCache();
    accountsForSections = getExpenseAccounts({ applyUiFilters: false });
  }
  const accounts = getExpenseAccounts();
  const logoByName = getWalletCustomLogoMap();
  const walletLogo = name => logoByName.get(String(name || "").trim().toLowerCase()) || "";
  const validIds = new Set(accounts.map(a => a.group_id));
  if (state.expenseWalletFilter !== "all" && !validIds.has(state.expenseWalletFilter)){
    state.expenseWalletFilter = "all";
  }
  renderExpenseWalletBar(accounts);

  if (!accounts.length){
    const loadingHint = state.expenseLazy.loadingSummaries
      ? `<div class="empty">Loading wallets…</div>`
      : `<div class="empty">No expense accounts found.</div>`;
    els.expensesList.innerHTML = loadingHint;
    ensureExpensesListDelegation();
    return;
  }

  let html = "";
  if (state.expenseLazy.loadingActivity && isExpenseLazyMode()) {
    html += `<div class="expense-toolbar-hint" style="margin:0.35rem 0 0.75rem;">Loading ${escapeHtml(expenseHistoryRangeText())}…</div>`;
  }
  html += renderExpenseBtcTransactionsSection(accountsForSections, false);

  let topupTransactions = collectTopupTransactionsFlat(accountsForSections);
  
  // Server-side search already applied in lazy mode; keep client filter as fallback.
  if (!isExpenseLazyMode() && state.search.expenses && state.search.expenses.trim() !== "") {
    topupTransactions = filterExpensesBySearch(topupTransactions, state.search.expenses);
  }
  
  const topupByCurrency = new Map();
  for (const tx of topupTransactions){
    const c = tx.currency || "AED";
    if (!topupByCurrency.has(c)) topupByCurrency.set(c, []);
    topupByCurrency.get(c).push(tx);
  }
  const topupCurrencies = sortCurrenciesList([...topupByCurrency.keys()]);

  if (topupTransactions.length > 0){
    html += `<details class="expense-collapsible-section" id="topupRecordsSection" data-expense-details-id="topupRecordsSection">
      <summary class="expense-collapsible-header">
        <h4 class="expense-section-title"><i class="fa-solid fa-money-bill-wave"></i> Top-Up Records</h4>
        <span class="expand-icon">▶</span>
      </summary>
      <div class="expense-collapsible-content">
        <div class="expense-section-toolbar"><span class="expense-toolbar-hint">PDF per currency row below. Combined report covers every currency.</span>
          <button type="button" class="icon-btn ghost expenseActionBtn" data-action="pdf" data-type="all-topups" title="Download PDF (all currencies)"><i class="fa-solid fa-download"></i></button>
        </div>`;
    for (const cur of topupCurrencies){
      const txs = topupByCurrency.get(cur).slice().sort((a, b) => dateStamp(b.action_date || b.loan_date) - dateStamp(a.action_date || a.loan_date));
      const totalCur = txs.reduce((sum, tx) => sum + Number(tx.action_amount || 0), 0);
      html += `
      <details class="loan expense-item-row expense-by-currency" data-expense-details-id="topup-${escapeHtml(cur)}">
        <summary>
          <div class="loan-top">
            <div class="lt-main">
              <div class="loan-name">Top-Up — ${currencySymbolHtml(cur)}</div>
              <div class="loan-sub">
                <span class="badge green">Money In</span>
                <span>${txs.length} transaction(s)</span>
                ${currencySymbolHtml(cur)}
              </div>
            </div>
            <div class="cell expense-item-total">
              <small>Total (${currencySymbolHtml(cur)})</small>
              <strong>${money(totalCur, cur)}</strong>
            </div>
            <div class="lt-action">
              <button type="button" class="icon-btn ghost expenseActionBtn" data-action="pdf" data-type="topups-by-currency" data-currency="${escapeHtml(cur)}" title="Download PDF (${escapeHtml(cur)})" style="font-size: 0.9rem;"><i class="fa-solid fa-download"></i></button>
            </div>
          </div>
        </summary>
        <div class="detail">
          <div class="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Wallet</th><th>Type</th><th>Amount</th><th>Notes</th><th>Action</th></tr></thead>
              <tbody>
                ${txs.map(tx => `
                  <tr>
                    <td>${escapeHtml(displayDate(tx.action_date || tx.loan_date || "—"))}</td>
                    <td>${getWalletIconHtml(tx.person_name || "Wallet", 16, walletLogo(tx.person_name))} ${escapeHtml(tx.person_name || "—")} (${escapeHtml(tx.accountType || "")})</td>
                    <td><span class="badge green">${tx.isOpeningBalance ? "Opening Balance" : "Top-up"}</span></td>
                    <td style="color: var(--success);">${money(tx.action_amount, cur)}</td>
                    <td class="expense-item-detail-note">${escapeHtml(cleanExpenseNote(tx.notes))}</td>
                    <td>
                      <div style="display:flex;gap:4px;">
                        ${teamCanShowEdit("entries") ? `<button class="tiny ghost editRowBtn" data-id="${escapeHtml(tx.id)}">✎</button>` : ""}
                        ${teamCanShowDelete("entries") ? `<button class="tiny danger delRowBtn" data-id="${escapeHtml(tx.id)}">✕</button>` : ""}
                      </div>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </details>`;
    }
    html += `</div></details>`;
  }

  let transferEvents = buildTransferEvents(accountsForSections);
  
  // Apply search filtering to transfer events
  if (!isExpenseLazyMode() && state.search.expenses && state.search.expenses.trim() !== "") {
    transferEvents = filterExpensesBySearch(transferEvents, state.search.expenses);
  }
  
  const transferCurrencySet = new Set();
  const selectedPageCurrencies = new Set(getSelectedPageCurrencies());
  const allPageCurrencies = isPageCurrencyAll();
  for (const ev of transferEvents){
    if (allPageCurrencies || selectedPageCurrencies.has(ev.curOut)) {
      transferCurrencySet.add(ev.curOut);
    }
    if (allPageCurrencies || selectedPageCurrencies.has(ev.curIn)) {
      transferCurrencySet.add(ev.curIn);
    }
  }
  const transferCurrencies = sortCurrenciesList([...transferCurrencySet]);

  if (transferEvents.length > 0 && transferCurrencies.length > 0){
    html += `<details class="expense-collapsible-section" id="transferRecordsSection" data-expense-details-id="transferRecordsSection">
      <summary class="expense-collapsible-header">
        <h4 class="expense-section-title"><i class="fa-solid fa-arrow-right-arrow-left"></i> Transfer Records</h4>
        <span class="expand-icon">▶</span>
      </summary>
      <div class="expense-collapsible-content">
        <div class="expense-section-toolbar"><span class="expense-toolbar-hint">Sent and received are shown per currency using the conversion rate recorded on transfer.</span>
          <button type="button" class="icon-btn ghost expenseActionBtn" data-action="pdf" data-type="all-transfers" title="Download PDF (all currencies)"><i class="fa-solid fa-download"></i></button>
        </div>`;
    for (const cur of transferCurrencies){
      const rows = getTransferRowsForCurrency(cur, transferEvents);
      if (!rows.length) continue;
      const { sent, received } = transferCurrencyTotals(cur, transferEvents);
      html += `
      <details class="loan expense-item-row expense-by-currency" data-expense-details-id="transfer-${escapeHtml(cur)}">
        <summary>
          <div class="loan-top">
            <div class="lt-main">
              <div class="loan-name">Transfers — ${currencySymbolHtml(cur)}</div>
              <div class="loan-sub">
                <span class="badge orange">Money moved</span>
                <span>${rows.length} row(s)</span>
                ${currencySymbolHtml(cur)}
              </div>
            </div>
            <div class="cell expense-item-total expense-transfer-totals">
              <div><small>Sent (${currencySymbolHtml(cur)})</small><strong>${money(sent, cur)}</strong></div>
              <div><small>Received (${currencySymbolHtml(cur)})</small><strong>${money(received, cur)}</strong></div>
            </div>
            <div class="lt-action">
              <button type="button" class="icon-btn ghost expenseActionBtn" data-action="pdf" data-type="transfers-by-currency" data-currency="${escapeHtml(cur)}" title="Download PDF (${escapeHtml(cur)})" style="font-size: 0.9rem;"><i class="fa-solid fa-download"></i></button>
            </div>
          </div>
        </summary>
        <div class="detail">
          <div class="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Type</th><th>Wallet</th><th>With</th><th>Amount</th><th>Rate<br/><span style="font-weight:normal">(1 From = ? To)</span></th><th>Converted leg</th><th>Notes</th><th>Action</th></tr></thead>
              <tbody>
                ${rows.map(r => {
                  const amountStyle = r.kind === "Sent" ? "color: var(--danger);" : "color: var(--success);";
                  const badgeCls = r.kind === "Sent" ? "orange" : "green";
                  return `
                    <tr>
                      <td>${escapeHtml(displayDate(r.date || "—"))}</td>
                      <td><span class="badge ${badgeCls}">${escapeHtml(r.kind)}</span></td>
                      <td>${getWalletIconHtml(r.walletName || "Wallet", 16, walletLogo(r.walletName))} ${escapeHtml(r.walletLabel)}</td>
                      <td>${escapeHtml(r.counterparty || "—")}</td>
                      <td style="${amountStyle}">${money(r.amount, cur)}</td>
                      <td>${escapeHtml(r.rateDisplay)}</td>
                      <td>${escapeHtml(r.otherLegDisplay)}</td>
                      <td class="expense-item-detail-note">${escapeHtml(r.notes)}</td>
                      <td>
                        <div style="display:flex;gap:4px;">
                          ${teamCanShowEdit("entries") ? `<button class="tiny ghost editRowBtn" data-id="${escapeHtml(r.editId)}">✎</button>` : ""}
                          ${teamCanShowDelete("entries") ? `<button class="tiny danger delRowBtn" data-id="${escapeHtml(r.editId)}">✕</button>` : ""}
                        </div>
                      </td>
                    </tr>`;
                }).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </details>`;
    }
    html += `</div></details>`;
  }

  // Expense items (non-transfer spending), grouped by item
  const spendAttached = collectExpenseSpendRows(accounts);
  // Lazy mode already fetched the selected date window from the DB.
  const historySpendAttached = isExpenseLazyMode() ? spendAttached : filterExpenseHistoryRows(spendAttached);
  let items = groupExpenseItems(historySpendAttached);
  
  // Apply search filtering to expense items
  if (!isExpenseLazyMode() && state.search.expenses && state.search.expenses.trim() !== "") {
    items = filterExpensesBySearch(items, state.search.expenses);
  }
  
  {
    const visibleTransactionCount = items.reduce((sum, item) => sum + item.txs.length, 0);
    const historyOpen = state.expenseLazy.historyPreferOpen || openExpenseDetails.has("transactionsHistorySection");
    html += `<details class="expense-collapsible-section" id="transactionsHistorySection" data-expense-details-id="transactionsHistorySection"${historyOpen ? " open" : ""}>
      <summary class="expense-collapsible-header expense-history-header">
        <h4 class="expense-section-title"><i class="fa-solid fa-list-ul"></i> Transactions History</h4>
        ${renderExpenseHistoryRangeControls()}
        <span class="expand-icon">▶</span>
      </summary>
      <div class="expense-collapsible-content">
      ${renderExpenseHistoryToolbar(visibleTransactionCount)}`;
    if (items.length) {
      html += items.map(item => `
      <details class="loan expense-item-row" data-expense-details-id="history-${escapeHtml(item.key)}">
        <summary>
          <div class="loan-top">
            <div class="lt-main">
              <div class="loan-name">${escapeHtml(item.displayName)}</div>
              <div class="loan-sub">
                ${item.expenseType ? `<span class="badge blue">${escapeHtml(item.expenseType)}</span>` : `<span class="badge blue">Other</span>`}
                <span>${item.txs.length} transaction(s)</span>
                <span>${currencySymbolHtml(item.currency || "")}</span>
              </div>
            </div>
            <div class="cell expense-item-total">
              <small>Total spent</small>
              <strong>${money(item.total, item.currency)}</strong>
              ${item.taxTotal ? `<small>VAT ${money(item.taxTotal, item.currency)}</small>` : ""}
            </div>
            <div class="lt-action">
              <button class="icon-btn ghost" onclick="downloadExpenseItemPDF('${escapeHtml(item.key)}')" title="Download PDF" style="font-size: 0.9rem;"><i class="fa-solid fa-download"></i></button>
            </div>
          </div>
        </summary>
        <div class="detail">
          <div class="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Wallet</th><th>Type</th><th>Amount</th><th>VAT</th><th>Notes</th><th>Action</th></tr></thead>
              <tbody>
                ${item.txs.map(tx => `
                  <tr>
                    <td>${escapeHtml(displayDate(tx.date || "—"))}</td>
                    <td>${getWalletIconHtml(tx.wallet || "Wallet", 16, walletLogo(tx.wallet))} ${escapeHtml(tx.wallet || "—")}</td>
                    <td>${escapeHtml(tx.expenseType || "—")}</td>
                    <td>${money(tx.amount, item.currency)}</td>
                    <td>${tx.taxAmount ? `${money(tx.taxAmount, item.currency)} (${escapeHtml(trimInventoryNumber(tx.taxRate, 2))}%)` : "-"}</td>
                    <td class="expense-item-detail-note">${escapeHtml(tx.notes)}</td>
                    <td>
                      <div style="display:flex;gap:4px;">
                        ${teamCanShowEdit("entries") ? `<button class="tiny ghost editRowBtn" data-id="${escapeHtml(tx.id)}">✎</button>` : ""}
                        ${teamCanShowDelete("entries") ? `<button class="tiny danger delRowBtn" data-id="${escapeHtml(tx.id)}">✕</button>` : ""}
                      </div>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    `).join("");
    } else {
      html += `<div class="empty" style="padding:0.75rem 0;">No transactions in ${escapeHtml(expenseHistoryRangeText())}.</div>`;
    }
    html += `</div></details>`;
  }

  if (!html) {
    els.expensesList.innerHTML = `<div class="empty">No transactions found.</div>`;
  } else {
    els.expensesList.innerHTML = html;
  }

  restoreExpenseDetailsOpenState(openExpenseDetails);
  ensureExpensesListDelegation();
}

function ensureExpensesListDelegation(){
  if (!els.expensesList || els.expensesList.dataset.delegated === "1") return;
  els.expensesList.dataset.delegated = "1";

  els.expensesList.addEventListener("click", async e => {
    const editBtn = e.target.closest(".editRowBtn");
    if (editBtn && els.expensesList.contains(editBtn)) {
      openEditModal(editBtn.dataset.id);
      return;
    }
    const delBtn = e.target.closest(".delRowBtn");
    if (delBtn && els.expensesList.contains(delBtn)) {
      deleteEntry(delBtn.dataset.id);
      return;
    }

    const historyOption = e.target.closest(".expense-history-pdf-option");
    if (historyOption && els.expensesList.contains(historyOption)) {
      e.preventDefault();
      e.stopPropagation();
      closeExpenseHistoryPdfMenus();
      if (historyOption.dataset.type === "transactions-history") {
        await downloadExpenseTransactionsHistoryPDF(historyOption.dataset.mode || "detailed");
      }
      return;
    }

    const rangeBtn = e.target.closest(".expense-history-range-btn");
    if (rangeBtn && els.expensesList.contains(rangeBtn)) {
      e.preventDefault();
      e.stopPropagation();
      await setExpenseHistoryRange(rangeBtn.dataset.expenseHistoryRange || "today", true);
      return;
    }

    const customApply = e.target.closest(".expense-history-custom-apply");
    if (customApply && els.expensesList.contains(customApply)) {
      e.preventDefault();
      const wrap = customApply.closest(".expense-history-custom");
      const fromValue = String(wrap?.querySelector('[data-expense-history-date="from"]')?.value || "");
      const toValue = String(wrap?.querySelector('[data-expense-history-date="to"]')?.value || "");
      const completeDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value);
      if (!completeDate(fromValue) || !completeDate(toValue)){
        alert("Please enter both custom dates first.");
        return;
      }
      state.expenseHistoryRange = "custom";
      state.expenseHistoryCustomFrom = fromValue;
      state.expenseHistoryCustomTo = toValue;
      state.expenseLazy.historyPreferOpen = true;
      if (isExpenseLazyMode()) {
        try {
          await loadExpenseActivityForCurrentQuery({ force: true });
        } catch (err) {
          console.warn("Custom expense history reload failed:", err);
        }
      }
      renderExpensesList();
      renderExpenseOverviewWallets();
      const section = document.getElementById("transactionsHistorySection");
      if (section) section.open = true;
      return;
    }

    const statementBtn = e.target.closest(".expenseBtcStatementBtn");
    if (statementBtn && els.expensesList.contains(statementBtn)) {
      e.preventDefault();
      e.stopPropagation();
      const groupId = statementBtn.dataset.groupId || "";
      if (!groupId) {
        alert("Select one BTC wallet to download its full statement.");
        return;
      }
      await downloadExpenseBtcStatementPDF(groupId);
      return;
    }

    const txPdfBtn = e.target.closest(".expenseBtcTxPdfBtn");
    if (txPdfBtn && els.expensesList.contains(txPdfBtn)) {
      e.preventDefault();
      await downloadExpenseBtcTransactionReceiptPDF(txPdfBtn.dataset.groupId, txPdfBtn.dataset.txId);
      return;
    }

    const txLinkBtn = e.target.closest(".expenseBtcTxBtn");
    if (txLinkBtn && els.expensesList.contains(txLinkBtn)) {
      e.preventDefault();
      const url = txLinkBtn.dataset.url;
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    const actionBtn = e.target.closest(".expenseActionBtn");
    if (actionBtn && els.expensesList.contains(actionBtn)) {
      e.preventDefault();
      e.stopPropagation();
      const action = actionBtn.dataset.action;
      const type = actionBtn.dataset.type;

      if (action === "pdf-menu") {
        const wrap = actionBtn.closest(".expense-history-download-wrap");
        const menu = wrap?.querySelector(".expense-history-pdf-menu");
        if (!menu) return;
        const willOpen = menu.classList.contains("hide");
        closeExpenseHistoryPdfMenus();
        if (willOpen) {
          menu.classList.remove("hide");
          actionBtn.setAttribute("aria-expanded", "true");
        }
        return;
      }

      if (action === "pdf") {
        closeExpenseHistoryPdfMenus();
        if (type === "topups-by-currency"){
          await downloadAllTopupsPDF(actionBtn.dataset.currency);
        } else if (type === "all-topups"){
          await downloadAllTopupsPDF(null);
        } else if (type === "transfers-by-currency"){
          await downloadAllTransfersPDF(actionBtn.dataset.currency);
        } else if (type === "all-transfers"){
          await downloadAllTransfersPDF(null);
        } else if (type === "transactions-history"){
          await downloadExpenseTransactionsHistoryPDF(actionBtn.dataset.mode || "detailed");
        }
      }
    }
  });
}


function defaultDateInputs(root = document){
  root.querySelectorAll('input[type="date"]').forEach(i => {
    if (!i.value && i.dataset.defaultToday === "true") i.value = todayISO();
  });
}

function renderMultiEntries(count) {
  let html = `
    <div class="multi-row-header">
      <div>Date</div>
      <div>Amount</div>
      <div>Remarks</div>
    </div>
  `;
  for(let i=0; i<count; i++){
    html += `
      <div class="multi-row">
        <input class="input" name="action_date_${i}" type="date" required data-default-today="true" aria-label="Date ${i+1}" />
        <input class="input" name="action_amount_${i}" type="number" min="0" step="0.01" required placeholder="0.00" aria-label="Amount ${i+1}" />
        <input class="input" name="notes_${i}" placeholder="Notes" aria-label="Remarks ${i+1}" />
      </div>
    `;
  }
  els.multiEntryContainer.innerHTML = html;
  defaultDateInputs(els.multiEntryContainer);
}

function parseEntriesPayload(payload){
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.entries)) return payload.entries;
  return [];
}

function csvEscape(value){
  const str = String(value ?? "");
  if (!/[",\n\r]/.test(str)) return str;
  return `"${str.replace(/"/g, '""')}"`;
}

function toCsv(entries){
  const headers = [
    "id","group_id","direction","entry_kind","person_name","currency",
    "principal_amount","action_amount","loan_date","action_date","notes","created_at",
    "data_origin","domain_table"
  ];
  const dateFields = new Set(["loan_date", "action_date"]);
  const lines = [headers.join(",")];
  for (const entry of entries){
    lines.push(headers.map(h => {
      if (dateFields.has(h)) return formatCsvDate(entry[h]) || "";
      if (h === "created_at") {
        const raw = String(entry[h] || "").trim();
        if (!raw) return "";
        const isoDay = normalizeDateForDb(raw);
        if (isoDay && /^\d{4}-\d{2}-\d{2}/.test(raw)) {
          const safe = raw.includes("T") ? raw.replace(/"/g, "") : isoDay;
          return `"=""${safe}"""`;
        }
        return csvEscape(raw);
      }
      return csvEscape(entry[h]);
    }).join(","));
  }
  return `\uFEFF${lines.join("\n")}`;
}

function parseCsvLine(line){
  const out = [];
  let value = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++){
    const ch = line[i];
    if (ch === '"'){
      if (inQuotes && line[i + 1] === '"'){
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes){
      out.push(value);
      value = "";
    } else {
      value += ch;
    }
  }
  out.push(value);
  return out;
}

function parseCsvRows(text){
  const rows = [];
  let row = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++){
    const ch = text[i];
    if (ch === '"'){
      if (inQuotes && text[i + 1] === '"'){
        row += '""';
        i += 1;
      } else {
        inQuotes = !inQuotes;
        row += ch;
      }
      continue;
    }
    if ((ch === "\n" || ch === "\r") && !inQuotes){
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      if (row.trim()) rows.push(parseCsvLine(row));
      row = "";
      continue;
    }
    row += ch;
  }
  if (row.trim()) rows.push(parseCsvLine(row));
  return rows;
}

function parseEntriesCsv(csvText){
  const rows = parseCsvRows(csvText);
  if (!rows.length) return [];
  const header = rows[0].map(v => String(v || "").trim());
  const idx = key => header.indexOf(key);
  // group_id / id may be empty — section import auto-assigns them
  const required = ["direction","entry_kind","person_name","currency"];
  if (required.some(k => idx(k) === -1)){
    throw new Error("Invalid CSV format. Missing required columns (direction, entry_kind, person_name, currency).");
  }
  return rows.slice(1).map(cols => {
    const get = key => {
      const i = idx(key);
      return i >= 0 ? (cols[i] ?? "").trim() : "";
    };
    const valOrNull = key => {
      const v = get(key);
      return v === "" ? null : v;
    };
    const numOrNull = key => {
      const v = get(key);
      if (v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const loanDate = normalizeDateForDb(get("loan_date") || get("action_date") || "") || "";
    const actionDate = normalizeDateForDb(get("action_date") || "") || null;
    return {
      id: valOrNull("id"),
      group_id: get("group_id") || "",
      direction: get("direction"),
      entry_kind: get("entry_kind"),
      person_name: get("person_name"),
      currency: get("currency"),
      principal_amount: numOrNull("principal_amount"),
      action_amount: numOrNull("action_amount"),
      loan_date: loanDate,
      action_date: actionDate,
      notes: valOrNull("notes"),
      created_at: valOrNull("created_at") || new Date().toISOString(),
      data_origin: valOrNull("data_origin"),
      domain_table: valOrNull("domain_table")
    };
  }).filter(entry => entry.direction && entry.entry_kind && entry.person_name && entry.currency && entry.loan_date);
}

function saveBackupEntries(entries){
  if (isGuestMode()) {
    clearGuestStorageArtifacts();
    return;
  }
  const payload = {
    exportedAt: new Date().toISOString(),
    entries: Array.isArray(entries) ? entries : []
  };
  localStorage.setItem(backupStorageKey(), JSON.stringify(payload));
}

function loadBackupEntriesFromStorage(){
  if (isGuestMode()) return [];
  const raw = localStorage.getItem(backupStorageKey());
  if (!raw) return [];
  try{
    return parseEntriesPayload(JSON.parse(raw));
  }catch{
    return [];
  }
}

function updateUploadButtonVisibility(){
  const shouldShow = !isGuestMode() && state.hasImportedFile && state.dataSource === "backup";
  els.uploadBackupBtn.classList.toggle("hide", !shouldShow);
}

function updateConnectButtonVisibility(){
  const showConnect = !isGuestMode() && state.hasImportedFile && !state.unlocked;
  els.connectSupabaseBtn.classList.toggle("hide", !showConnect);
}

function applyEntries(entries, source = "backup", options = {}){
  const list = Array.isArray(entries) ? entries : [];
  state.entries = (source === "supabase" && !isGuestMode())
    ? filterRowsForCurrentUser(list)
    : list;
  state.dataSource = source;
  if (typeof options.hasImportedFile === "boolean"){
    state.hasImportedFile = options.hasImportedFile;
    if (state.hasImportedFile && !isGuestMode()){
      sessionStorage.setItem(IMPORT_SESSION_KEY, "1");
    } else {
      sessionStorage.removeItem(IMPORT_SESSION_KEY);
    }
  }
  saveBackupEntries(state.entries);
  updateUploadButtonVisibility();
  updateConnectButtonVisibility();
  renderAll();
}

function databaseSessionCanLoad(){
  return !isGuestMode() &&
    state.unlocked &&
    !!runtimeConfig?.supabaseUrl &&
    !!runtimeConfig?.supabaseKey &&
    !!state.sessionToken &&
    !(state.dataSource === "backup" && state.hasImportedFile);
}

function normalizeLedgerScope(scope){
  return LEDGER_DATA_SCOPES.includes(scope) ? scope : LEDGER_SCOPE_EXPENSES;
}

function ledgerScopeForTab(tab){
  if (tab === "expenses") return LEDGER_SCOPE_EXPENSES;
  if (tab === "goods") return LEDGER_SCOPE_GOODS;
  if (tab === "installments") return LEDGER_SCOPE_INSTALLMENTS;
  if (tab === "given" || tab === "received") return LEDGER_SCOPE_LOANS_GIVEN;
  if (tab === "taken" || tab === "returned") return LEDGER_SCOPE_LOANS_TAKEN;
  return "";
}

function ledgerScopeForSection(section){
  return ledgerScopeForTab(section);
}

function ledgerScopeLabel(scope){
  return scope === LEDGER_SCOPE_EXPENSES ? "expenses"
    : scope === LEDGER_SCOPE_GOODS ? "inventory"
    : scope === LEDGER_SCOPE_INSTALLMENTS ? "installment plans"
    : scope === LEDGER_SCOPE_LOANS_GIVEN ? "given loans"
    : "taken loans";
}

function ledgerScopeContainers(scope){
  if (scope === LEDGER_SCOPE_EXPENSES) return [els.expensesList];
  if (scope === LEDGER_SCOPE_GOODS) return [els.goodsList];
  if (scope === LEDGER_SCOPE_INSTALLMENTS) return [els.installmentsList];
  if (scope === LEDGER_SCOPE_LOANS_GIVEN) return [els.givenList, els.receivedList];
  if (scope === LEDGER_SCOPE_LOANS_TAKEN) return [els.takenList, els.returnedList];
  return [];
}

function loadingStateHtml(label){
  return `<div class="empty"><i class="fa-solid fa-spinner btn-loader"></i> Loading ${escapeHtml(label)}...</div>`;
}

function errorStateHtml(label, err){
  return `<div class="empty">Could not load ${escapeHtml(label)}. ${escapeHtml(err?.message || String(err || ""))}</div>`;
}

function setLedgerScopeLoading(scope, loading, err = null){
  const html = err ? errorStateHtml(ledgerScopeLabel(scope), err) : loadingStateHtml(ledgerScopeLabel(scope));
  ledgerScopeContainers(scope).forEach(container => {
    if (!container) return;
    if (loading || err) container.innerHTML = html;
  });
}

function entryBelongsToLedgerScope(entry, scope){
  if (!entry || isPageCurrencyPreferenceRow(entry) || isSecretPinPreferenceRow(entry) || isTaxSettingsPreferenceRow(entry)) return false;
  if (scope === LEDGER_SCOPE_EXPENSES) {
    return entry.direction === "taken" && hasExpenseAccountTag(entry.notes);
  }
  if (scope === LEDGER_SCOPE_GOODS) {
    return entry.direction === "goods" || hasGoodsTag(entry.notes);
  }
  if (scope === LEDGER_SCOPE_INSTALLMENTS) {
    return entry.direction === "taken" &&
      hasInstallmentTag(entry.notes) &&
      !hasGoodsTag(entry.notes) &&
      !hasExpenseAccountTag(entry.notes);
  }
  if (scope === LEDGER_SCOPE_LOANS_GIVEN) {
    return entry.direction === "given";
  }
  if (scope === LEDGER_SCOPE_LOANS_TAKEN) {
    return entry.direction === "taken" &&
      String(entry.person_name || "").trim().toUpperCase() !== "SYSTEM" &&
      !hasInstallmentTag(entry.notes) &&
      !hasGoodsTag(entry.notes) &&
      !hasExpenseAccountTag(entry.notes);
  }
  return false;
}

function encodedTagValue(tag){
  return encodeURIComponent(String(tag || ""));
}

function selectedCurrencyQuery(){
  const selectedCurrencies = getSelectedPageCurrencies();
  if (!isPageCurrencyAll() && !selectedCurrencies.length) return { blocked: true, query: "" };
  if (isPageCurrencyAll()) return { blocked: false, query: "" };
  if (selectedCurrencies.length === 1) {
    return { blocked: false, query: `&currency=eq.${encodeURIComponent(selectedCurrencies[0])}` };
  }
  return {
    blocked: false,
    query: `&currency=in.(${selectedCurrencies.map(currency => encodeURIComponent(currency)).join(",")})`
  };
}

function ledgerScopeQuery(scope, { fallback = false } = {}){
  const { blocked, query: currencyQuery } = selectedCurrencyQuery();
  if (blocked) return "";
  const expenses = encodedTagValue(EXPENSE_ACCOUNT_TAG);
  const goods = encodedTagValue(GOODS_TAG);
  const installments = encodedTagValue(INSTALLMENT_TAG);
  let scopeQuery = "";
  if (scope === LEDGER_SCOPE_EXPENSES) {
    scopeQuery = `&direction=eq.taken&notes=ilike.*${expenses}*`;
  } else if (scope === LEDGER_SCOPE_GOODS) {
    scopeQuery = fallback
      ? `&direction=eq.taken`
      : `&or=(direction.eq.goods,notes.ilike.*${goods}*)`;
  } else if (scope === LEDGER_SCOPE_INSTALLMENTS) {
    scopeQuery = `&direction=eq.taken&notes=ilike.*${installments}*`;
  } else if (scope === LEDGER_SCOPE_LOANS_GIVEN) {
    scopeQuery = `&direction=eq.given`;
  } else if (scope === LEDGER_SCOPE_LOANS_TAKEN) {
    scopeQuery = fallback
      ? `&direction=eq.taken`
      : `&direction=eq.taken&person_name=neq.SYSTEM&or=(notes.is.null,and(notes.not.ilike.*${goods}*,notes.not.ilike.*${installments}*,notes.not.ilike.*${expenses}*))`;
  }
  return `${CONFIG.table}?select=*${scopeQuery}${currencyQuery}${ownerIdQuery()}&order=created_at.desc`;
}

function mergeRecycleBinRowsForScope(scope, rows){
  const incoming = filterRowsForCurrentUser(rows)
    .filter(row => entryBelongsToLedgerScope(row, scope))
    .map(row => ({
      ...row,
      deletedAt: row.updated_at || new Date().toISOString(),
      originalSection: getEntrySection(row)
    }));
  const incomingIds = new Set(incoming.map(row => row.id).filter(Boolean));
  state.recycleBin = state.recycleBin
    .filter(item => rowBelongsToCurrentUser(item))
    .filter(item => !entryBelongsToLedgerScope(item, scope) || (item.id && !incomingIds.has(item.id)))
    .concat(incoming);
  saveRecycleBinToStorage();
  renderRecycleBinDropdown();
}

async function fixLegacyMetaEntry(entryId, groupId){
  if (!window.DomainLedger?.migrateEntry) {
    alert("Migration helpers are not loaded. Hard-refresh the app and ensure migrations 020–021 are applied.");
    return;
  }
  if (!entryId && !groupId) return;
  if (!confirm("Move this meta-tag ledger record into the proper section table? The old ledger row will be permanently removed after a successful move.")) return;
  try {
    if (entryId) {
      await DomainLedger.migrateEntry(entryId);
    } else {
      await supabaseRpc("app_migrate_ledger_group", { p_group_id: groupId, p_section: null });
    }
    state.loadedLedgerScopes.clear();
    await loadEntriesFromSupabase({ force: true });
    if (typeof loadBitcoinWalletsFromDatabase === "function") {
      await loadBitcoinWalletsFromDatabase({ force: true }).catch(() => {});
    }
    if (typeof loadNotesFromDatabase === "function") {
      await loadNotesFromDatabase({ force: true }).catch(() => {});
    }
    renderAll();
    if (typeof renderNotes === "function") renderNotes(els.searchNotes?.value || "");
    syncLegacyFixAllButtons();
    alert("Entry fixed and moved to the section table.");
  } catch (err) {
    alert(err.message || "Could not fix this entry.");
  }
}

function sectionHasLegacyToFix(sectionKey){
  const sec = String(sectionKey || "").trim();
  if (!sec) return false;
  const isLegacy = (entry) => {
    if (window.DomainLedger?.entryIsLegacyMeta) return DomainLedger.entryIsLegacyMeta(entry);
    return entry?.is_legacy_meta === true || entry?.data_origin === "ledger";
  };
  if (sec === "bitcoin") {
    return (state.bitcoinWallets || []).some(w => isLegacy(w) || w.is_legacy_meta === true);
  }
  if (sec === "notes") {
    return (state.notes || []).some(n => isLegacy(n) || n.is_legacy_meta === true);
  }
  const scopeMap = {
    loans_given: LEDGER_SCOPE_LOANS_GIVEN,
    loans_taken: LEDGER_SCOPE_LOANS_TAKEN,
    installments: LEDGER_SCOPE_INSTALLMENTS,
    expenses: LEDGER_SCOPE_EXPENSES,
    inventory: LEDGER_SCOPE_GOODS,
    goods: LEDGER_SCOPE_GOODS
  };
  const scope = scopeMap[sec];
  if (!scope) return false;
  return (state.entries || []).some(entry =>
    isLegacy(entry) &&
    entryBelongsToLedgerScope(entry, scope) &&
    !hasDeletedTag(entry.notes)
  );
}

function syncLegacyFixAllButtons(){
  document.querySelectorAll(".legacy-fix-all-btn").forEach(btn => {
    const section = btn.dataset.legacyFixSection || btn.dataset.legacyFixAll || "";
    const needFix = sectionHasLegacyToFix(section);
    btn.classList.toggle("hide", !needFix);
    btn.hidden = !needFix;
    btn.style.display = needFix ? "" : "none";
  });
}

async function fixLegacySectionBatch(sectionKey){
  if (!window.DomainLedger?.migrateSectionBatch) {
    alert("Migration helpers are not loaded. Hard-refresh the app and ensure migrations 020–021 are applied.");
    return;
  }
  const section = sectionKey || DomainLedger.sectionBatchKeyForTab(state.activeTab);
  if (!section) {
    alert("Open a section first (Loans, Expenses, Inventory, Installments, Bitcoin, or Notes).");
    return;
  }
  if (!sectionHasLegacyToFix(section)) {
    syncLegacyFixAllButtons();
    return;
  }
  if (!confirm(`Fix all meta-tag entries on this page (${section})? Each group moves into the proper table; old ledger rows are deleted after success.`)) return;
  try {
    const result = await DomainLedger.migrateSectionBatch(section, 100);
    state.loadedLedgerScopes.clear();
    await loadEntriesFromSupabase({ force: true });
    if (section === "bitcoin" && typeof loadBitcoinWalletsFromDatabase === "function") {
      await loadBitcoinWalletsFromDatabase({ force: true }).catch(() => {});
    }
    if (section === "notes" && typeof loadNotesFromDatabase === "function") {
      await loadNotesFromDatabase({ force: true }).catch(() => {});
    }
    renderAll();
    if (typeof renderNotes === "function") renderNotes(els.searchNotes?.value || "");
    syncLegacyFixAllButtons();
    const errs = Array.isArray(result?.errors) ? result.errors.length : 0;
    alert(`Fixed ${result?.migrated_groups_or_rows || 0} group(s)/row(s).${errs ? ` ${errs} failed — try Fix on those individually.` : ""}`);
  } catch (err) {
    alert(err.message || "Batch fix failed.");
  }
}

function mergeLedgerRowsFromSupabase(scope, rows, options = {}){
  const domainRows = Array.isArray(options.domainRows) ? options.domainRows : [];
  const dataRows = filterRowsForCurrentUser(rows)
    .filter(row => !isPageCurrencyPreferenceRow(row) && !isSecretPinPreferenceRow(row) && !isTaxSettingsPreferenceRow(row))
    .map(row => (window.DomainLedger ? DomainLedger.markLegacy(row) : { ...row, is_legacy_meta: true, data_origin: "ledger" }));
  const domainActive = filterRowsForCurrentUser(domainRows)
    .filter(row => entryBelongsToLedgerScope(row, scope) && !hasDeletedTag(row.notes) && !row.is_deleted);
  const domainDeleted = filterRowsForCurrentUser(domainRows)
    .filter(row => entryBelongsToLedgerScope(row, scope) && (hasDeletedTag(row.notes) || row.is_deleted));
  // Domain wins on id collision so dual-read never double-counts after a migrate.
  const domainIds = new Set(domainActive.map(r => r.id).filter(Boolean));
  const domainDeletedIds = new Set(domainDeleted.map(r => r.id).filter(Boolean));
  const ledgerActive = dataRows
    .filter(row => entryBelongsToLedgerScope(row, scope) && !hasDeletedTag(row.notes) && !domainIds.has(row.id));
  const ledgerDeleted = dataRows
    .filter(row => entryBelongsToLedgerScope(row, scope) && hasDeletedTag(row.notes) && !domainDeletedIds.has(row.id));
  const activeRows = ledgerActive.concat(domainActive);
  const deletedRows = ledgerDeleted.concat(domainDeleted);
  const previousScopeRows = state.entries.filter(entry => entryBelongsToLedgerScope(entry, scope));
  const activeIds = new Set(activeRows.map(row => row.id).filter(Boolean));
  const deletedIds = new Set(deletedRows.map(row => row.id).filter(Boolean));
  // Capture before unmarking snapshots so a concurrent save/edit is not wiped by this merge.
  const preservedLocalRows = state.entries.filter(entry =>
    shouldPreserveLocalLedgerEntry(entry, scope, activeIds, deletedIds)
  );
  const preservedIds = new Set(preservedLocalRows.map(row => row.id));
  const pendingPreserveIds = new Set(
    preservedLocalRows
      .filter(row => state.pendingDbSyncIds.has(row.id))
      .map(row => row.id)
  );
  const mergedActiveRows = activeRows.filter(row => !pendingPreserveIds.has(row.id));

  unmarkDbSnapshotRows(previousScopeRows);
  // Drop any leftover rows from another account that somehow remained in memory
  state.entries = state.entries
    .filter(entry => rowBelongsToCurrentUser(entry) || (entry.id && state.pendingDbSyncIds.has(entry.id)))
    .filter(entry => {
      if (entry.id && preservedIds.has(entry.id)) return true;
      return !entryBelongsToLedgerScope(entry, scope) && !(entry.id && activeIds.has(entry.id));
    })
    .concat(mergedActiveRows)
    .sort((a, b) => dateStamp(b.created_at || b.action_date || b.loan_date) - dateStamp(a.created_at || a.action_date || a.loan_date));
  state.dataSource = "supabase";
  state.hasImportedFile = false;
  sessionStorage.removeItem(IMPORT_SESSION_KEY);
  markDbSnapshotRows(mergedActiveRows);
  // Keep snapshot marks for preserved locals that already synced (stale-fetch race)
  markDbSnapshotRows(preservedLocalRows.filter(row => !state.pendingDbSyncIds.has(row.id)));
  mergeRecycleBinRowsForScope(scope, deletedRows);
  updateUploadButtonVisibility();
  updateConnectButtonVisibility();
}

async function loadEntries(){
  if (databaseSessionCanLoad()) {
    await loadEntriesFromSupabase({ force: true });
    return;
  }
  if (state.dataSource === "backup"){
    if (isGuestMode()) {
      applyEntries(state.entries, "backup");
      renderRecycleBinDropdown();
      return;
    }
    applyEntries(loadBackupEntriesFromStorage(), "backup");
    // Load recycle bin from localStorage for backup mode
    loadRecycleBinFromStorage();
    renderRecycleBinDropdown();
    return;
  }
  await loadEntriesFromSupabase();
}

async function loadAllEntriesFromSupabase(){
  if (state.trialLocked) {
    applyEntries([], "supabase", { hasImportedFile: false });
    state.recycleBin = [];
    renderRecycleBinDropdown();
    return;
  }
  if (state.secretPinHash && !state.secretPinVerified) {
    applyEntries([], "supabase", { hasImportedFile: false });
    return;
  }
  const { blocked, query: currencyQuery } = selectedCurrencyQuery();
  if (blocked) {
    applyEntries([], "supabase", { hasImportedFile: false });
    state.recycleBin = [];
    renderRecycleBinDropdown();
    return;
  }
  // Prefer per-scope dual-read so domain + ledger merge consistently (no double-count).
  for (const scope of LEDGER_DATA_SCOPES) {
    state.loadedLedgerScopes.delete(scope);
    await loadLedgerScopeFromSupabase(scope, { force: true });
  }
  LEDGER_DATA_SCOPES.forEach(scope => state.loadedLedgerScopes.add(scope));
  // Keep currencyQuery referenced so older call sites that expected a full ledger pull stay clear.
  void currencyQuery;
}

async function loadLedgerScopeFromSupabase(scope, options = {}){
  if (state.trialLocked) {
    mergeLedgerRowsFromSupabase(normalizeLedgerScope(scope), []);
    return;
  }
  const normalizedScope = normalizeLedgerScope(scope);
  const force = options.force === true;
  if (!databaseSessionCanLoad() && state.dataSource === "backup") return;
  if (!force && state.loadedLedgerScopes.has(normalizedScope)) {
    renderAll();
    return;
  }
  if (state.ledgerLoadPromises.has(normalizedScope)) {
    return state.ledgerLoadPromises.get(normalizedScope);
  }

  const loadPromise = (async () => {
    if (state.secretPinHash && !state.secretPinVerified) {
      mergeLedgerRowsFromSupabase(normalizedScope, []);
      return;
    }
    state.loadingLedgerScopes.add(normalizedScope);
    setLedgerScopeLoading(normalizedScope, true);

    // Expenses: prefer wallet summaries + date-scoped activity (fast path).
    if (normalizedScope === LEDGER_SCOPE_EXPENSES && state.expenseLazy.rpcAvailable !== false) {
      try {
        const lazyResult = await loadExpensesScopeLazyOrFull({ force });
        if (lazyResult?.usedLazy) {
          state.loadedLedgerScopes.add(normalizedScope);
          renderAll();
          return;
        }
      } catch (lazyErr) {
        console.warn("Expense lazy load failed; using full scope load.", lazyErr);
      }
    }

    // Inventory: prefer stock summaries (detail on expand) for faster first paint.
    if (normalizedScope === LEDGER_SCOPE_GOODS && state.inventoryLazy.rpcAvailable !== false) {
      try {
        const lazyResult = await loadGoodsScopeLazyOrFull({ force });
        if (lazyResult?.usedLazy) {
          state.loadedLedgerScopes.add(normalizedScope);
          renderAll();
          return;
        }
      } catch (lazyErr) {
        console.warn("Inventory lazy load failed; using full scope load.", lazyErr);
      }
    }

    const query = ledgerScopeQuery(normalizedScope);
    if (!query) {
      mergeLedgerRowsFromSupabase(normalizedScope, []);
      return;
    }
    let rows;
    try {
      rows = await supabase(query);
    } catch (err) {
      const fallbackQuery = ledgerScopeQuery(normalizedScope, { fallback: true });
      if (!fallbackQuery || fallbackQuery === query) throw err;
      rows = await supabase(fallbackQuery);
    }
    const scopeRows = filterRowsForCurrentUser(rows)
      .filter(row => entryBelongsToLedgerScope(row, normalizedScope));
    if (normalizedScope === LEDGER_SCOPE_GOODS) await ensureInventoryItemCodesForRows(scopeRows.filter(row => !hasDeletedTag(row.notes)));
    let domainRows = [];
    if (window.DomainLedger?.loadDomainRowsForScope) {
      try {
        // Expenses full fallback still needs all tables; other scopes unchanged.
        domainRows = await DomainLedger.loadDomainRowsForScope(normalizedScope);
        if (normalizedScope === LEDGER_SCOPE_GOODS) {
          await ensureInventoryItemCodesForRows(domainRows.filter(row => !hasDeletedTag(row.notes)));
        }
      } catch (domainErr) {
        console.warn("Domain table load skipped:", domainErr);
      }
    }
    mergeLedgerRowsFromSupabase(normalizedScope, scopeRows, { domainRows });
    if (normalizedScope === LEDGER_SCOPE_EXPENSES) {
      state.expenseLazy.enabled = false;
    }
    if (normalizedScope === LEDGER_SCOPE_GOODS) {
      state.inventoryLazy.enabled = false;
    }
    state.loadedLedgerScopes.add(normalizedScope);
    renderAll();
  })();

  state.ledgerLoadPromises.set(normalizedScope, loadPromise);
  try {
    await loadPromise;
  } catch (err) {
    console.error(`Failed to load ${ledgerScopeLabel(normalizedScope)}.`, err);
    setLedgerScopeLoading(normalizedScope, false, err);
    if (options.throwOnError) throw err;
  } finally {
    state.loadingLedgerScopes.delete(normalizedScope);
    state.ledgerLoadPromises.delete(normalizedScope);
  }
}

async function loadEntriesFromSupabase(options = {}){
  if (options.full === true) {
    await loadAllEntriesFromSupabase();
    return;
  }
  const scope = normalizeLedgerScope(options.scope || ledgerScopeForTab(getActiveTabKey()) || LEDGER_SCOPE_EXPENSES);
  await loadLedgerScopeFromSupabase(scope, options);
}

async function ensureTabDataLoaded(tab, options = {}){
  if (state.trialLocked) {
    resetLazyDataState({ clearEntries: true });
    renderAll();
    return;
  }
  const scope = ledgerScopeForTab(tab);
  if (!scope || isGuestMode()) return;
  if (databaseSessionCanLoad() || state.dataSource === "supabase") {
    await loadLedgerScopeFromSupabase(scope, options);
  }
}

async function ensureSectionDataLoaded(section, options = {}){
  const scope = ledgerScopeForSection(section);
  if (!scope || isGuestMode()) return;
  if (databaseSessionCanLoad() || state.dataSource === "supabase") {
    await loadLedgerScopeFromSupabase(scope, options);
  }
}

async function ensureAllLedgerDataLoaded(options = {}){
  if (isGuestMode()) return;
  if (databaseSessionCanLoad() || state.dataSource === "supabase") {
    await loadEntriesFromSupabase({ ...options, full: true });
  }
}

async function ensureInventoryItemCodesForRows(rows){
  const goodsRows = Array.isArray(rows) ? rows.filter(row => hasGoodsTag(row.notes)) : [];
  if (!goodsRows.length) return;

  const existingCodes = new Set();
  const codeByGroup = new Map();
  for (const row of goodsRows){
    const meta = goodsMetaFromNotes(row.notes);
    if (!meta.itemCode) continue;
    const code = String(meta.itemCode).trim();
    if (!code) continue;
    existingCodes.add(code.toUpperCase());
    if (row.group_id && !codeByGroup.has(row.group_id)) codeByGroup.set(row.group_id, code);
  }

  for (const row of goodsRows){
    if (!row.group_id || codeByGroup.has(row.group_id)) continue;
    const itemCode = nextPrefixedHexCode("ITM", existingCodes);
    existingCodes.add(itemCode.toUpperCase());
    codeByGroup.set(row.group_id, itemCode);
  }

  const patches = [];
  for (const row of goodsRows){
    const meta = goodsMetaFromNotes(row.notes);
    if (meta.itemCode || !row.group_id) continue;
    const itemCode = codeByGroup.get(row.group_id);
    if (!itemCode) continue;
    const nextNotes = upsertGoodsMetaInNote(row.notes, { ...meta, itemCode });
    row.notes = nextNotes;
    if (row.id){
      patches.push({ id: row.id, notes: nextNotes });
    }
  }

  if (!patches.length) return;
  try {
    // Batch backfill patches (was N+1 sequential) — fail soft per row
    const results = await Promise.allSettled(patches.map(patch =>
      supabase(`${CONFIG.table}?id=eq.${encodeURIComponent(patch.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ notes: patch.notes })
      })
    ));
    const failed = results.filter(r => r.status === "rejected").length;
    if (failed) console.warn(`Inventory item code backfill: ${failed}/${patches.length} patch(es) failed.`);
  } catch (err) {
    console.warn("Inventory item code backfill failed:", err);
  }
}

function renderExpenseOverviewWallets(){
  const container = document.getElementById("expenseOverviewWallets");
  if (!container) return;
  const accounts = getExpenseAccounts({ applyUiFilters: false });
  if (!accounts.length){
    container.innerHTML = `
      <div class="empty" style="grid-column:1/-1; display:flex; flex-direction:column; align-items:center; gap:10px; padding:18px 12px;">
        <span>No expense accounts yet.</span>
        <button type="button" class="btn soft" onclick="openExpenseModal('account')">Add Account</button>
      </div>`;
    return;
  }
  
  // Store original data for resize handling
  container.accounts = accounts;
  
  const expenseCurrencies = [...new Set(accounts.map(account => account.currency).filter(Boolean))];
  const expenseSummaryCard = expenseCurrencies.length ? `
      <div class="summary currency-summary expense-overview">
        ${overviewWatermarkFloatingWalletLogos(accounts)}
        <div class="currency-head">Summary ${expenseCurrencies.map(currency => currencySymbolHtml(currency)).join(' ')}</div>
        ${expenseCurrencies.map((currency, index) => {
          const s = summarizeExpenseByCurrency(currency);
          const isLastCurrency = index === expenseCurrencies.length - 1;
          
          // Calculate USD equivalent for BTC available balance
          let btcUsdEquivalent = "";
          if (currency === "BTC") {
            const btcBalance = Number(s.availableBalance || 0);
            if (btcBalance > 0 && state.bitcoin.btcPrice) {
              const usdValue = (btcBalance * state.bitcoin.btcPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              btcUsdEquivalent = usdValue;
            }
          }
          
          return `
            ${overviewExpenseLine(currency, "Total Amount:", money(s.totalAmount, currency))}
            ${overviewExpenseLine(currency, "Total Expenses:", money(s.totalExpenses, currency))}
            <div class="summary-line summary-line-one available-label">
              <span class="summary-line-one-label summary-line-one-label--with-symbol strong-success">
                <span class="summary-currency-mark">${currencySymbolHtml(currency)}</span>
                <span class="summary-label-suffix strong-success">Available Balance:</span>
              </span>
              <span class="summary-line-one-value available-amount strong-success">${money(s.availableBalance, currency)}</span>
            </div>
            ${btcUsdEquivalent ? `<div class="summary-line summary-line-one" style="margin-top: 2px;"><span class="summary-line-one-label"></span><span class="summary-line-one-value" style="color: var(--muted); font-size: 0.8rem; font-weight: 600;">≈ $${btcUsdEquivalent}</span></div>` : ''}
            ${!isLastCurrency ? '<div class="currency-separator"></div>' : ''}
          `;
        }).join("")}
        <div class="overview-card-actions" style="margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap;">
          <button class="tiny ghost" onclick="window.location.href='#expensesPanel'">View Expenses</button>
          <button class="tiny ghost" onclick="openExpenseModal('account')">Add Account</button>
          <button class="tiny ghost" onclick="downloadExpensesPDF()"><i class="fa-solid fa-download"></i></button>
        </div>
      </div>
  ` : "";

  // Check screen width to determine layout
  const isDesktop = window.innerWidth > 768;
  
  if (isDesktop) {
    // Desktop layout: two columns
    const walletCardsHtml = accounts.map(expenseOverviewWalletCardHtml).join("");
    
    if (expenseSummaryCard) {
      container.innerHTML = `
        <div class="wallets-desktop-layout">
          <div class="summary-column">
            ${expenseSummaryCard}
          </div>
          <div class="wallets-column">
            <div class="wallets-grid">
              ${walletCardsHtml}
            </div>
          </div>
        </div>
      `;
    } else {
      // No summary card - show only wallet cards in full width
      container.innerHTML = `
        <div class="wallets-full-width">
          <div class="wallets-grid">
            ${walletCardsHtml}
          </div>
        </div>
      `;
    }
  } else {
    // Mobile layout: original simple grid
    container.innerHTML = expenseSummaryCard + accounts.map(expenseOverviewWalletCardHtml).join("");
  }
  ensureExpenseOverviewWalletDelegation();
  bindWalletLogoMenus(container);
  ensureExpenseWalletReorder(container, {
    itemSelector: ".summary.wallet-details-card[data-wallet-details]",
    getGroupId: el => el.dataset.walletDetails
  });
}

function ensureExpenseOverviewWalletDelegation(){
  const container = document.getElementById("expenseOverviewWallets");
  if (!container || container.dataset.walletDetailsDelegated === "1") return;
  container.dataset.walletDetailsDelegated = "1";

  const openFromCard = (card) => {
    const groupId = card?.dataset?.walletDetails;
    if (groupId) openWalletDetailsOverlay(groupId);
  };

  container.addEventListener("click", e => {
    if (container.classList.contains("expense-wallet-reordering")) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.target.closest("button, a, input, select, textarea, .overview-card-actions, .wallet-logo-menu-wrap")) return;
    const card = e.target.closest("[data-wallet-details]");
    if (!card || !container.contains(card)) return;
    openFromCard(card);
  });

  container.addEventListener("keydown", e => {
    if (e.key !== "Enter" && e.key !== " ") return;
    if (e.target.closest("button, a, input, select, textarea, .overview-card-actions, .wallet-logo-menu-wrap")) return;
    const card = e.target.closest("[data-wallet-details]");
    if (!card || !container.contains(card)) return;
    e.preventDefault();
    openFromCard(card);
  });
}

// Function to update wallets layout on window resize
function updateWalletsLayoutOnResize() {
  const container = document.getElementById("expenseOverviewWallets");
  if (!container || !container.accounts) return;
  
  // Re-render with current screen width
  const isDesktop = window.innerWidth > 768;
  const accounts = container.accounts;
  
  // Recalculate expense summary card
  const expenseCurrencies = [...new Set(accounts.map(account => account.currency).filter(Boolean))];
  const expenseSummaryCard = expenseCurrencies.length ? `
      <div class="summary currency-summary expense-overview">
        ${overviewWatermarkFloatingWalletLogos(accounts)}
        <div class="currency-head">Summary ${expenseCurrencies.map(currency => currencySymbolHtml(currency)).join(' ')}</div>
        ${expenseCurrencies.map((currency, index) => {
          const s = summarizeExpenseByCurrency(currency);
          const isLastCurrency = index === expenseCurrencies.length - 1;
          
          // Calculate USD equivalent for BTC available balance
          let btcUsdEquivalent = "";
          if (currency === "BTC") {
            const btcBalance = Number(s.availableBalance || 0);
            if (btcBalance > 0 && state.bitcoin.btcPrice) {
              const usdValue = (btcBalance * state.bitcoin.btcPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              btcUsdEquivalent = usdValue;
            }
          }
          
          return `
            ${overviewExpenseLine(currency, "Total Amount:", money(s.totalAmount, currency))}
            ${overviewExpenseLine(currency, "Total Expenses:", money(s.totalExpenses, currency))}
            <div class="summary-line summary-line-one available-label">
              <span class="summary-line-one-label summary-line-one-label--with-symbol strong-success">
                <span class="summary-currency-mark">${currencySymbolHtml(currency)}</span>
                <span class="summary-label-suffix strong-success">Available Balance:</span>
              </span>
              <span class="summary-line-one-value available-amount strong-success">${money(s.availableBalance, currency)}</span>
            </div>
            ${btcUsdEquivalent ? `<div class="summary-line summary-line-one" style="margin-top: 2px;"><span class="summary-line-one-label"></span><span class="summary-line-one-value" style="color: var(--muted); font-size: 0.8rem; font-weight: 600;">≈ $${btcUsdEquivalent}</span></div>` : ''}
            ${!isLastCurrency ? '<div class="currency-separator"></div>' : ''}
          `;
        }).join("")}
        <div class="overview-card-actions" style="margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap;">
          <button class="tiny ghost" onclick="window.location.href='#expensesPanel'">View Expenses</button>
          <button class="tiny ghost" onclick="openExpenseModal('account')">Add Account</button>
          <button class="tiny ghost" onclick="downloadExpensesPDF()"><i class="fa-solid fa-download"></i></button>
        </div>
      </div>
  ` : "";

  if (isDesktop) {
    // Desktop layout: two columns
    const walletCardsHtml = accounts.map(expenseOverviewWalletCardHtml).join("");
    
    if (expenseSummaryCard) {
      container.innerHTML = `
        <div class="wallets-desktop-layout">
          <div class="summary-column">
            ${expenseSummaryCard}
          </div>
          <div class="wallets-column">
            <div class="wallets-grid">
              ${walletCardsHtml}
            </div>
          </div>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div class="wallets-full-width">
          <div class="wallets-grid">
            ${walletCardsHtml}
          </div>
        </div>
      `;
    }
  } else {
    // Mobile layout: original simple grid
    container.innerHTML = expenseSummaryCard + accounts.map(expenseOverviewWalletCardHtml).join("");
  }
  ensureExpenseOverviewWalletDelegation();
}

function renderSearchResults(key){
  switch (key) {
    case "expenses":
      renderExpensesList();
      renderExpenseOverviewWallets();
      break;
    case "goods":
      renderInventoryList();
      break;
    case "installments":
      renderInstallmentPlans();
      break;
    case "given":
      renderLoanCards(els.givenList, "given", "given");
      break;
    case "received":
      renderLoanCards(els.receivedList, "given", "received");
      break;
    case "taken":
      renderLoanCards(els.takenList, "taken", "taken", {
        groupFilter: group => !group.rows.some(row => hasInstallmentTag(row.note) || hasGoodsTag(row.note) || hasExpenseAccountTag(row.note)) && group.person_name !== "SYSTEM"
      });
      break;
    case "returned":
      renderLoanCards(els.returnedList, "taken", "returned", {
        groupFilter: group => !group.rows.some(row => hasInstallmentTag(row.note) || hasGoodsTag(row.note) || hasExpenseAccountTag(row.note)) && group.person_name !== "SYSTEM"
      });
      break;
    default:
      renderAll();
  }
}
