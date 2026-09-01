/* Asset Management — CRUD, transactions, sale/disposal, reports & charts. */
const ASSET_TYPE_OPTIONS = [
  { id: "car", label: "Car" },
  { id: "vehicle", label: "Vehicle" },
  { id: "flat_apartment", label: "Flat / Apartment" },
  { id: "house", label: "House" },
  { id: "building", label: "Building" },
  { id: "land_property", label: "Land / Property" },
  { id: "office", label: "Office" },
  { id: "equipment", label: "Equipment" },
  { id: "machinery", label: "Machinery" },
  { id: "computer_electronics", label: "Computer / Electronics" },
  { id: "furniture", label: "Furniture" },
  { id: "investment", label: "Investment" },
  { id: "other", label: "Other" }
];

const ASSET_TX_TYPE_OPTIONS = [
  { id: "maintenance", label: "Maintenance", kind: "expense" },
  { id: "repair", label: "Repair", kind: "expense" },
  { id: "operating", label: "Operating cost", kind: "expense" },
  { id: "other_expense", label: "Other expense", kind: "expense" },
  { id: "additional_investment", label: "Additional investment", kind: "expense" },
  { id: "revenue", label: "Revenue / Income", kind: "income" }
];

const ASSET_STATUS_OPTIONS = [
  { id: "active", label: "Active / Owned" },
  { id: "sold", label: "Sold" },
  { id: "disposed", label: "Disposed" }
];

const ASSET_CUSTOM_TYPE_PREFIX = "__ctype__:";
const ASSET_CUSTOM_EXPENSE_PREFIX = "__clabel__:";

const assetUi = {
  search: "",
  status: "all",
  selectedId: null,
  reportMode: "all", // all | monthly | yearly | custom
  reportFrom: "",
  reportTo: "",
  chartInstances: [],
  formMode: "create",
  editingAssetId: null,
  editingTxId: null
};

function assetMath() {
  return window.TripleMAssetMath || {};
}

function assetCustomCatalogKey() {
  const oid = typeof currentOwnerId === "function" ? currentOwnerId() : null;
  return `triplem-asset-custom-options-v1:${oid || "guest"}`;
}

function normalizeAssetCustomLabel(raw) {
  return String(raw || "").replace(/\s+/g, " ").trim().slice(0, 80);
}

function readAssetCustomCatalog() {
  try {
    const raw = localStorage.getItem(assetCustomCatalogKey());
    const parsed = raw ? JSON.parse(raw) : null;
    return {
      types: Array.isArray(parsed?.types) ? parsed.types.map(normalizeAssetCustomLabel).filter(Boolean) : [],
      expenseLabels: Array.isArray(parsed?.expenseLabels)
        ? parsed.expenseLabels.map(normalizeAssetCustomLabel).filter(Boolean)
        : []
    };
  } catch (_) {
    return { types: [], expenseLabels: [] };
  }
}

function writeAssetCustomCatalog(catalog) {
  try {
    localStorage.setItem(assetCustomCatalogKey(), JSON.stringify({
      types: [...new Set((catalog.types || []).map(normalizeAssetCustomLabel).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
      expenseLabels: [...new Set((catalog.expenseLabels || []).map(normalizeAssetCustomLabel).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    }));
  } catch (_) {}
}

function mergeAssetCustomLabels(existing, extras) {
  const map = new Map();
  [...(existing || []), ...(extras || [])].forEach(label => {
    const clean = normalizeAssetCustomLabel(label);
    if (!clean) return;
    const key = clean.toLowerCase();
    if (!map.has(key)) map.set(key, clean);
  });
  return [...map.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function harvestAssetCustomTypes() {
  const fromAssets = (state.assets || [])
    .filter(a => String(a.asset_type || "") === "other")
    .map(a => a.asset_type_other);
  return mergeAssetCustomLabels(readAssetCustomCatalog().types, fromAssets);
}

function harvestAssetCustomExpenseLabels() {
  const fromTx = (state.assetTransactions || [])
    .filter(tx => String(tx.tx_type || "") === "other_expense")
    .map(tx => tx.tx_label || tx.meta?.tx_label || "");
  return mergeAssetCustomLabels(readAssetCustomCatalog().expenseLabels, fromTx);
}

function rememberAssetCustomType(label) {
  const clean = normalizeAssetCustomLabel(label);
  if (!clean) return;
  const catalog = readAssetCustomCatalog();
  catalog.types = mergeAssetCustomLabels(catalog.types, [clean]);
  writeAssetCustomCatalog(catalog);
}

function rememberAssetCustomExpenseLabel(label) {
  const clean = normalizeAssetCustomLabel(label);
  if (!clean) return;
  const catalog = readAssetCustomCatalog();
  catalog.expenseLabels = mergeAssetCustomLabels(catalog.expenseLabels, [clean]);
  writeAssetCustomCatalog(catalog);
}

function populateAssetTypeSelect(selectedValue = "") {
  const typeSel = document.getElementById("assetFormType");
  if (!typeSel) return;
  const wanted = String(selectedValue || "");
  let customs = harvestAssetCustomTypes();
  if (wanted.startsWith(ASSET_CUSTOM_TYPE_PREFIX)) {
    customs = mergeAssetCustomLabels(customs, [wanted.slice(ASSET_CUSTOM_TYPE_PREFIX.length)]);
  }
  const builtIn = ASSET_TYPE_OPTIONS.filter(o => o.id !== "other");
  const otherOpt = ASSET_TYPE_OPTIONS.find(o => o.id === "other");
  const parts = [
    ...builtIn.map(o => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.label)}</option>`),
    customs.length
      ? `<optgroup label="Saved custom types">${customs.map(label =>
          `<option value="${escapeHtml(ASSET_CUSTOM_TYPE_PREFIX + label)}">${escapeHtml(label)}</option>`
        ).join("")}</optgroup>`
      : "",
    otherOpt
      ? `<option value="other">${escapeHtml(otherOpt.label)} (add new…)</option>`
      : ""
  ];
  typeSel.innerHTML = parts.join("");
  if (wanted && [...typeSel.options].some(o => o.value === wanted)) {
    typeSel.value = wanted;
  } else {
    typeSel.value = builtIn[0]?.id || "other";
  }
}

function populateAssetTxTypeSelect(selectedValue = "") {
  const txType = document.getElementById("assetTxType");
  if (!txType) return;
  const wanted = String(selectedValue || "");
  let customs = harvestAssetCustomExpenseLabels();
  if (wanted.startsWith(ASSET_CUSTOM_EXPENSE_PREFIX)) {
    customs = mergeAssetCustomLabels(customs, [wanted.slice(ASSET_CUSTOM_EXPENSE_PREFIX.length)]);
  }
  const builtIn = ASSET_TX_TYPE_OPTIONS.filter(o => o.id !== "other_expense");
  const otherOpt = ASSET_TX_TYPE_OPTIONS.find(o => o.id === "other_expense");
  const parts = [
    ...builtIn.map(o => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.label)}</option>`),
    customs.length
      ? `<optgroup label="Saved other expenses">${customs.map(label =>
          `<option value="${escapeHtml(ASSET_CUSTOM_EXPENSE_PREFIX + label)}">${escapeHtml(label)}</option>`
        ).join("")}</optgroup>`
      : "",
    otherOpt
      ? `<option value="other_expense">${escapeHtml(otherOpt.label)} (add new…)</option>`
      : ""
  ];
  txType.innerHTML = parts.join("");
  if (wanted && [...txType.options].some(o => o.value === wanted)) {
    txType.value = wanted;
  } else {
    txType.value = "maintenance";
  }
}

function resolveAssetTypeSelection(selectValue, otherInputValue) {
  const raw = String(selectValue || "");
  if (raw.startsWith(ASSET_CUSTOM_TYPE_PREFIX)) {
    const label = normalizeAssetCustomLabel(raw.slice(ASSET_CUSTOM_TYPE_PREFIX.length));
    return { asset_type: "other", asset_type_other: label, ok: !!label, error: label ? "" : "Select a custom type." };
  }
  if (raw === "other") {
    const label = normalizeAssetCustomLabel(otherInputValue);
    return {
      asset_type: "other",
      asset_type_other: label,
      ok: !!label,
      error: label ? "" : "Please enter a name for the new asset type."
    };
  }
  if (!ASSET_TYPE_OPTIONS.some(o => o.id === raw)) {
    return { asset_type: "other", asset_type_other: "", ok: false, error: "Select a valid asset type." };
  }
  return { asset_type: raw, asset_type_other: "", ok: true, error: "" };
}

function resolveAssetTxTypeSelection(selectValue, labelInputValue) {
  const raw = String(selectValue || "");
  if (raw.startsWith(ASSET_CUSTOM_EXPENSE_PREFIX)) {
    const label = normalizeAssetCustomLabel(raw.slice(ASSET_CUSTOM_EXPENSE_PREFIX.length));
    return {
      tx_type: "other_expense",
      tx_label: label,
      ok: !!label,
      error: label ? "" : "Select a custom expense name."
    };
  }
  if (raw === "other_expense") {
    const label = normalizeAssetCustomLabel(labelInputValue);
    return {
      tx_type: "other_expense",
      tx_label: label,
      ok: !!label,
      error: label ? "" : "Please enter a name for this other expense."
    };
  }
  if (!ASSET_TX_TYPE_OPTIONS.some(o => o.id === raw)) {
    return { tx_type: "", tx_label: "", ok: false, error: "Select a valid transaction type." };
  }
  return { tx_type: raw, tx_label: "", ok: true, error: "" };
}

function assetTypeSelectValueFor(asset) {
  if (!asset) return "car";
  if (String(asset.asset_type || "") === "other") {
    const label = normalizeAssetCustomLabel(asset.asset_type_other);
    if (label) {
      const customs = harvestAssetCustomTypes();
      const hit = customs.find(c => c.toLowerCase() === label.toLowerCase());
      if (hit) return ASSET_CUSTOM_TYPE_PREFIX + hit;
      return ASSET_CUSTOM_TYPE_PREFIX + label;
    }
    return "other";
  }
  return asset.asset_type || "car";
}

function assetTxSelectValueFor(tx) {
  if (!tx) return "maintenance";
  if (String(tx.tx_type || "") === "other_expense") {
    const label = normalizeAssetCustomLabel(tx.tx_label || tx.meta?.tx_label || "");
    if (label) {
      const customs = harvestAssetCustomExpenseLabels();
      const hit = customs.find(c => c.toLowerCase() === label.toLowerCase());
      if (hit) return ASSET_CUSTOM_EXPENSE_PREFIX + hit;
      return ASSET_CUSTOM_EXPENSE_PREFIX + label;
    }
    return "other_expense";
  }
  return tx.tx_type || "maintenance";
}

function assertAssetsFeatureAccess() {
  if (isGuestMode()) {
    throw new Error("Asset Management is not available in guest mode.");
  }
  if (!userHasPermission("assets", "view")) {
    throw new Error("Asset Management is not enabled for your account. Ask an administrator to enable it.");
  }
}

function canUseAssetsFeature() {
  try {
    return !isGuestMode() && !!userHasPermission("assets", "view");
  } catch (_) {
    return false;
  }
}

function assetTypeLabel(type, other) {
  const id = String(type || "other");
  if (id === "other" && other) return String(other);
  const hit = ASSET_TYPE_OPTIONS.find(o => o.id === id);
  return hit ? hit.label : id;
}

function assetStatusLabel(status) {
  const hit = ASSET_STATUS_OPTIONS.find(o => o.id === String(status || "active"));
  return hit ? hit.label : String(status || "active");
}

function assetTxTypeLabel(type, label) {
  const custom = normalizeAssetCustomLabel(label);
  if (String(type || "") === "other_expense" && custom) return custom;
  const hit = ASSET_TX_TYPE_OPTIONS.find(o => o.id === String(type || ""));
  return hit ? hit.label : String(type || "");
}

function assetCurrencyOptionsHtml(selected) {
  const list = ["AED", "SAR", "PKR", "USD"];
  const cur = String(selected || "AED").toUpperCase();
  return list.map(c => `<option value="${c}" ${c === cur ? "selected" : ""}>${c}</option>`).join("");
}

function openAssetsModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove("hide");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function destroyAssetCharts() {
  (assetUi.chartInstances || []).forEach(ch => {
    try { ch.destroy(); } catch (_) {}
  });
  assetUi.chartInstances = [];
}

function createAssetChart(canvas, config) {
  if (!canvas || typeof ensureChartLibLoaded !== "function") return null;
  try {
    const existing = window.Chart?.getChart?.(canvas);
    if (existing) existing.destroy();
  } catch (_) {}
  if (!window.Chart) return null;
  const chart = new window.Chart(canvas.getContext("2d"), config);
  assetUi.chartInstances.push(chart);
  return chart;
}

function getAssetById(id) {
  return (state.assets || []).find(a => a.id === id) || null;
}

function getAssetTransactions(assetId) {
  return (state.assetTransactions || [])
    .filter(t => t.asset_id === assetId && !t.is_deleted)
    .slice()
    .sort((a, b) => String(b.tx_date || "").localeCompare(String(a.tx_date || ""))
      || String(b.created_at || "").localeCompare(String(a.created_at || "")));
}

function assetSummaryTransactions(asset) {
  const summary = asset?._financial_summary;
  if (!summary || typeof summary !== "object") return [];
  const txDate = asset.sale_date || new Date().toISOString().slice(0, 10);
  return [
    ["maintenance", summary.maintenance],
    ["repair", summary.repair],
    ["operating", summary.operating],
    ["other_expense", summary.other_expense],
    ["additional_investment", summary.additional_investment],
    ["revenue", summary.revenue]
  ].filter(([, amount]) => Number(amount || 0) !== 0).map(([tx_type, amount]) => ({
    tx_type,
    amount: Number(amount || 0),
    tx_date: txDate,
    is_deleted: false
  }));
}

function summarizeAssetById(assetId, options = {}) {
  const asset = getAssetById(assetId);
  if (!asset) return null;
  const detailLoaded = state.assetTransactionLoadedIds?.has(assetId);
  const transactions = detailLoaded ? getAssetTransactions(assetId) : assetSummaryTransactions(asset);
  return assetMath().summarizeAsset?.(asset, transactions, options) || null;
}

function mapAssetRow(row) {
  const asset = {
    id: row.id,
    owner_id: row.owner_id,
    name: row.name || "",
    asset_type: row.asset_type || "other",
    asset_type_other: row.asset_type_other || "",
    description: row.description || "",
    currency: row.currency || "AED",
    purchase_date: row.purchase_date,
    purchase_price: Number(row.purchase_price || 0),
    status: row.status || "active",
    sale_date: row.sale_date || null,
    sale_price: row.sale_price == null ? null : Number(row.sale_price),
    sale_costs: Number(row.sale_costs || 0),
    sale_notes: row.sale_notes || "",
    meta: row.meta || {},
    created_at: row.created_at,
    updated_at: row.updated_at
  };
  if (row._financial_summary && typeof row._financial_summary === "object") {
    asset._financial_summary = row._financial_summary;
  }
  return asset;
}

function mapAssetSummaryRpcRow(row) {
  const source = row?.asset && typeof row.asset === "object" ? row.asset : row;
  const asset = mapAssetRow(source || {});
  asset._financial_summary = row?.summary && typeof row.summary === "object"
    ? row.summary
    : (source?._financial_summary || {});
  return asset;
}

function mapAssetTxRow(row) {
  const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
  return {
    id: row.id,
    asset_id: row.asset_id,
    owner_id: row.owner_id,
    tx_type: row.tx_type,
    tx_label: normalizeAssetCustomLabel(row.tx_label || meta.tx_label || ""),
    amount: Number(row.amount || 0),
    tx_date: row.tx_date,
    notes: row.notes || "",
    meta,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_deleted: !!row.is_deleted
  };
}

async function loadAssetsFromDatabase(options = {}) {
  const force = options.force === true;
  if (!canUseAssetsFeature()) {
    state.assets = [];
    state.assetTransactions = [];
    state.assetsLoaded = true;
    renderAssetsList();
    return;
  }
  if (state.assetsLoaded && !force) {
    renderAssetsList();
    return;
  }
  if (state.assetsLoading && !force) return;

  if (!runtimeConfig?.supabaseUrl || !runtimeConfig?.supabaseKey) {
    state.assets = [];
    state.assetTransactions = [];
    state.assetsLoaded = true;
    renderAssetsList();
    return;
  }

  try {
    state.assetsLoading = true;
    const listEl = document.getElementById("assetsList");
    if (listEl) {
      listEl.innerHTML = '<div class="empty"><i class="fa-solid fa-spinner btn-loader"></i> Loading assets...</div>';
    }
    let assetRows;
    try {
      const result = unwrapRpcJson(await supabaseRpc("app_list_my_asset_summaries", { p_limit: 5000 }));
      assetRows = Array.isArray(result?.items) ? result.items.map(mapAssetSummaryRpcRow) : [];
    } catch (summaryError) {
      if (!/app_list_my_asset_summaries|Could not find the function|PGRST202|404/i.test(String(summaryError?.message || summaryError || ""))) {
        throw summaryError;
      }
      // Backward-compatible fallback until the additive performance migration is applied.
      const [legacyAssets, legacyTransactions] = await Promise.all([
        supabase(`app_assets?select=*&is_deleted=eq.false${ownerIdQuery()}&order=purchase_date.desc`),
        supabase(`app_asset_transactions?select=*&is_deleted=eq.false${ownerIdQuery()}&order=tx_date.desc`)
      ]);
      assetRows = filterRowsForCurrentUser(legacyAssets || []).map(mapAssetRow);
      state.assetTransactions = filterRowsForCurrentUser(legacyTransactions || []).map(mapAssetTxRow);
      state.assetTransactionLoadedIds = new Set(assetRows.map(asset => asset.id));
    }
    state.assets = assetRows;
    // Keep local custom catalogs in sync with live records
    writeAssetCustomCatalog({
      types: harvestAssetCustomTypes(),
      expenseLabels: harvestAssetCustomExpenseLabels()
    });
    state.assetsLoaded = true;
    renderAssetsList();
    if (assetUi.selectedId) {
      const still = getAssetById(assetUi.selectedId);
      if (still && state.assetTransactionLoadedIds?.has(still.id)) renderAssetDetail(still.id);
      else {
        assetUi.selectedId = null;
        closeModal("assetDetailModal");
      }
    }
  } catch (err) {
    console.error("Failed to load assets:", err);
    state.assets = [];
    state.assetTransactions = [];
    renderAssetsList();
    if (String(err?.message || "").toLowerCase().includes("permission") ||
        String(err?.message || "").includes("app_can_use_assets")) {
      // Feature not enabled or RLS blocked — leave empty quietly
    } else if (force) {
      alert("Failed to load assets: " + (err.message || err));
    }
  } finally {
    state.assetsLoading = false;
  }
}

async function ensureAssetTransactionsLoaded(assetId, options = {}) {
  const id = String(assetId || "");
  if (!id) return [];
  const force = options.force === true;
  if (!force && state.assetTransactionLoadedIds?.has(id)) return getAssetTransactions(id);
  const root = document.getElementById("assetDetailBody");
  if (root && assetUi.selectedId === id) {
    root.innerHTML = '<div class="empty"><i class="fa-solid fa-spinner btn-loader"></i> Loading asset details...</div>';
  }
  const rows = await supabase(
    `app_asset_transactions?select=*&asset_id=eq.${encodeURIComponent(id)}&is_deleted=eq.false${ownerIdQuery()}&order=tx_date.desc`
  );
  const mapped = filterRowsForCurrentUser(rows || []).map(mapAssetTxRow);
  state.assetTransactions = (state.assetTransactions || []).filter(tx => tx.asset_id !== id).concat(mapped);
  if (!(state.assetTransactionLoadedIds instanceof Set)) state.assetTransactionLoadedIds = new Set();
  state.assetTransactionLoadedIds.add(id);
  return mapped;
}

function invalidateAssetTransactions(assetId) {
  const id = String(assetId || "");
  state.assetTransactionLoadedIds?.delete(id);
  state.assetTransactions = (state.assetTransactions || []).filter(tx => tx.asset_id !== id);
}

function filteredAssets() {
  const q = String(assetUi.search || "").trim().toLowerCase();
  const st = String(assetUi.status || "all");
  return (state.assets || []).filter(a => {
    if (st !== "all" && a.status !== st) return false;
    if (!q) return true;
    const blob = [
      a.name,
      assetTypeLabel(a.asset_type, a.asset_type_other),
      a.description,
      a.status
    ].join(" ").toLowerCase();
    return blob.includes(q);
  });
}

function assetCardMenuHtml(asset, { canEdit, canDelete } = {}){
  const id = escapeHtml(asset.id);
  const active = String(asset.status || "") === "active";
  return `
    <div class="menu-wrap asset-card-menu" data-asset-menu-wrap="${id}">
      <button type="button" class="icon-btn ghost tiny asset-card-menu-btn" data-asset-menu-trigger="${id}" title="Asset actions" aria-label="Asset actions" aria-haspopup="menu" aria-expanded="false">
        <i class="fa-solid fa-ellipsis-vertical" aria-hidden="true"></i>
      </button>
      <div class="menu-dropdown asset-card-dropdown" data-asset-menu-panel="${id}" role="menu" hidden>
        <button type="button" class="menu-item" role="menuitem" data-asset-card-action="open" data-asset-id="${id}">
          <i class="fa-solid fa-eye" aria-hidden="true"></i> View details
        </button>
        ${canEdit ? `
        <button type="button" class="menu-item" role="menuitem" data-asset-card-action="add-tx" data-asset-id="${id}">
          <i class="fa-solid fa-plus" aria-hidden="true"></i> Add transaction
        </button>
        <button type="button" class="menu-item" role="menuitem" data-asset-card-action="edit" data-asset-id="${id}">
          <i class="fa-solid fa-pen" aria-hidden="true"></i> Edit asset
        </button>
        ${active ? `
        <button type="button" class="menu-item" role="menuitem" data-asset-card-action="sell" data-asset-id="${id}">
          <i class="fa-solid fa-handshake" aria-hidden="true"></i> Sell / dispose
        </button>` : ""}` : ""}
        <button type="button" class="menu-item" role="menuitem" data-asset-card-action="pdf-full" data-asset-id="${id}">
          <i class="fa-solid fa-file-pdf" aria-hidden="true"></i> Full detailed report
        </button>
        <button type="button" class="menu-item" role="menuitem" data-asset-card-action="pdf-revenue" data-asset-id="${id}">
          <i class="fa-solid fa-chart-line" aria-hidden="true"></i> Revenue report
        </button>
        <button type="button" class="menu-item" role="menuitem" data-asset-card-action="pdf-expenses" data-asset-id="${id}">
          <i class="fa-solid fa-receipt" aria-hidden="true"></i> Expenses report
        </button>
        ${canDelete ? `
        <button type="button" class="menu-item danger" role="menuitem" data-asset-card-action="delete" data-asset-id="${id}">
          <i class="fa-solid fa-trash" aria-hidden="true"></i> Delete
        </button>` : ""}
      </div>
    </div>`;
}

function closeAllAssetCardMenus(){
  document.querySelectorAll(".asset-card-dropdown.open").forEach(panel => {
    panel.classList.remove("open");
    panel.hidden = true;
    panel.style.top = "";
    panel.style.left = "";
  });
  document.querySelectorAll("[data-asset-menu-trigger][aria-expanded='true']").forEach(btn => {
    btn.setAttribute("aria-expanded", "false");
  });
  document.querySelectorAll(".asset-card-menu.open").forEach(wrap => wrap.classList.remove("open"));
}

function openAssetCardMenu(trigger){
  const id = trigger?.getAttribute("data-asset-menu-trigger");
  const wrap = trigger?.closest(".asset-card-menu");
  const panel = wrap?.querySelector(`[data-asset-menu-panel="${id}"]`) || wrap?.querySelector(".asset-card-dropdown");
  if (!panel || !trigger) return;
  const alreadyOpen = panel.classList.contains("open");
  closeAllAssetCardMenus();
  if (alreadyOpen) return;
  panel.hidden = false;
  panel.classList.add("open");
  wrap?.classList.add("open");
  if (typeof positionFixedMenuDropdown === "function") {
    positionFixedMenuDropdown(panel, trigger, { minWidth: 210 });
  } else {
    const rect = trigger.getBoundingClientRect();
    const panelWidth = Math.max(panel.offsetWidth || 210, 210);
    let left = rect.right - panelWidth;
    if (left < 10) left = 10;
    if (left + panelWidth > window.innerWidth - 10) {
      left = Math.max(10, window.innerWidth - panelWidth - 10);
    }
    panel.style.top = `${Math.round(rect.bottom + 6)}px`;
    panel.style.left = `${Math.round(left)}px`;
  }
  trigger.setAttribute("aria-expanded", "true");
}

function renderAssetsList() {
  const listEl = document.getElementById("assetsList");
  if (!listEl) return;
  if (!canUseAssetsFeature()) {
    listEl.innerHTML = `<div class="empty">Asset Management is not enabled for your account.</div>`;
    return;
  }
  const rows = filteredAssets();
  if (!rows.length) {
    listEl.innerHTML = `<div class="empty">No assets yet. Use <strong>Add Asset</strong> to start tracking ownership and financial performance.</div>`;
    return;
  }
  const canEdit = typeof teamCanShowEdit === "function" ? teamCanShowEdit("entries") : true;
  const canDelete = typeof teamCanShowDelete === "function" ? teamCanShowDelete("entries") : true;
  listEl.innerHTML = rows.map(asset => {
    const sum = summarizeAssetById(asset.id) || {};
    const net = Number(sum.net || 0);
    const netTone = net > 0 ? "profit" : net < 0 ? "loss" : "flat";
    const own = sum.ownership || {};
    return `
      <article class="asset-card" data-asset-id="${escapeHtml(asset.id)}">
        <div class="asset-card-top">
          <button type="button" class="asset-card-main" data-asset-open="${escapeHtml(asset.id)}">
            <h4 class="asset-card-title">${escapeHtml(asset.name)}</h4>
            <div class="asset-card-meta">
              <span>${escapeHtml(assetTypeLabel(asset.asset_type, asset.asset_type_other))}</span>
              <span class="asset-status asset-status-${escapeHtml(asset.status)}">${escapeHtml(assetStatusLabel(asset.status))}</span>
              <span class="asset-card-owned">${escapeHtml(own.label || "—")}${own.ongoing ? " · ongoing" : ""}</span>
            </div>
          </button>
          <div class="asset-card-aside">
            <div class="asset-card-net asset-net-${netTone}">
              <small>Net</small>
              <strong>${money(net, asset.currency)}</strong>
            </div>
            ${assetCardMenuHtml(asset, { canEdit, canDelete })}
          </div>
        </div>
        <button type="button" class="asset-card-stats" data-asset-open="${escapeHtml(asset.id)}">
          <span><em>Buy</em> ${money(sum.purchasePrice || 0, asset.currency)}</span>
          <span><em>Spent</em> ${money(sum.investedSpent || 0, asset.currency)}</span>
          <span><em>Revenue</em> ${money(sum.revenue || 0, asset.currency)}</span>
          <span><em>Sale</em> ${money(sum.salePrice || 0, asset.currency)}</span>
        </button>
      </article>`;
  }).join("");
}

function fillAssetForm(asset) {
  const isEdit = !!asset;
  assetUi.formMode = isEdit ? "edit" : "create";
  assetUi.editingAssetId = asset?.id || null;
  const title = document.getElementById("assetFormTitle");
  if (title) title.textContent = isEdit ? "Edit Asset" : "Add Asset";
  populateAssetTypeSelect(assetTypeSelectValueFor(asset));
  document.getElementById("assetFormName").value = asset?.name || "";
  const typeVal = document.getElementById("assetFormType")?.value || "";
  const otherInput = document.getElementById("assetFormTypeOther");
  if (otherInput) {
    otherInput.value = typeVal === "other" ? normalizeAssetCustomLabel(asset?.asset_type_other || "") : "";
  }
  document.getElementById("assetFormDescription").value = asset?.description || "";
  document.getElementById("assetFormCurrency").value = asset?.currency || "AED";
  document.getElementById("assetFormPurchaseDate").value = asset?.purchase_date || new Date().toISOString().slice(0, 10);
  document.getElementById("assetFormPurchasePrice").value = asset ? String(asset.purchase_price ?? "") : "";
  toggleAssetTypeOther();
}

function toggleAssetTypeOther() {
  const type = document.getElementById("assetFormType")?.value;
  const wrap = document.getElementById("assetFormTypeOtherWrap");
  const show = type === "other";
  if (wrap) wrap.classList.toggle("hide", !show);
  if (!show) {
    const input = document.getElementById("assetFormTypeOther");
    if (input) input.value = "";
  }
}

function openAssetFormModal(assetId) {
  try { assertAssetsFeatureAccess(); } catch (err) { alert(err.message); return; }
  fillAssetForm(assetId ? getAssetById(assetId) : null);
  openAssetsModal("assetFormModal");
  document.getElementById("assetFormName")?.focus();
}

async function saveAssetForm() {
  try {
    assertAssetsFeatureAccess();
    if (!teamCanShowEdit("entries")) throw new Error("You do not have permission to edit entries.");
  } catch (err) {
    alert(err.message);
    return;
  }
  const name = String(document.getElementById("assetFormName")?.value || "").trim();
  const typeResolved = resolveAssetTypeSelection(
    document.getElementById("assetFormType")?.value,
    document.getElementById("assetFormTypeOther")?.value
  );
  if (!typeResolved.ok) {
    alert(typeResolved.error || "Select a valid asset type.");
    return;
  }
  const asset_type = typeResolved.asset_type;
  const asset_type_other = typeResolved.asset_type_other;
  const description = String(document.getElementById("assetFormDescription")?.value || "").trim();
  const currency = String(document.getElementById("assetFormCurrency")?.value || "AED").toUpperCase();
  const purchase_date = String(document.getElementById("assetFormPurchaseDate")?.value || "").trim();
  const purchase_price = Number(document.getElementById("assetFormPurchasePrice")?.value || 0);
  if (!name) { alert("Please enter an asset name."); return; }
  if (!purchase_date) { alert("Please enter a purchase date."); return; }
  if (!(purchase_price >= 0)) { alert("Purchase price must be zero or greater."); return; }

  const payload = {
    name,
    asset_type,
    asset_type_other: asset_type === "other" ? asset_type_other : null,
    description: description || null,
    currency,
    purchase_date,
    purchase_price,
    owner_id: currentOwnerId(),
    updated_at: new Date().toISOString()
  };

  const btn = document.getElementById("assetFormSaveBtn");
  if (btn) btn.disabled = true;
  try {
    if (assetUi.formMode === "edit" && assetUi.editingAssetId) {
      await supabase(`app_assets?id=eq.${encodeURIComponent(assetUi.editingAssetId)}${ownerIdQuery()}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
    } else {
      payload.id = crypto.randomUUID();
      payload.status = "active";
      payload.is_deleted = false;
      payload.created_at = new Date().toISOString();
      await supabase("app_assets", { method: "POST", body: JSON.stringify(payload) });
      assetUi.selectedId = payload.id;
    }
    if (asset_type === "other" && asset_type_other) rememberAssetCustomType(asset_type_other);
    if (typeof invalidateDashboardSummary === "function") invalidateDashboardSummary({ refreshIfVisible: true });
    closeModal("assetFormModal");
    await loadAssetsFromDatabase({ force: true });
    if (assetUi.selectedId) openAssetDetail(assetUi.selectedId);
  } catch (err) {
    console.error(err);
    alert("Failed to save asset: " + (err.message || err));
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function openAssetDetail(assetId) {
  try { assertAssetsFeatureAccess(); } catch (err) { alert(err.message); return; }
  const asset = getAssetById(assetId);
  if (!asset) return;
  assetUi.selectedId = assetId;
  openAssetsModal("assetDetailModal");
  try {
    await ensureAssetTransactionsLoaded(assetId);
    if (assetUi.selectedId === assetId) renderAssetDetail(assetId);
  } catch (error) {
    const root = document.getElementById("assetDetailBody");
    if (root && assetUi.selectedId === assetId) {
      root.innerHTML = `<div class="empty">Unable to load asset details. <button type="button" class="btn soft tiny" data-asset-open="${escapeHtml(assetId)}">Retry</button></div>`;
    }
  }
}

function assetReportOptionsFor(asset) {
  const mode = assetUi.reportMode || "all";
  if (mode === "custom") {
    return { fromDate: assetUi.reportFrom || null, toDate: assetUi.reportTo || null };
  }
  if (mode === "monthly") {
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return { fromDate: `${key}-01`, toDate: `${key}-31` };
  }
  if (mode === "yearly") {
    const y = String(new Date().getFullYear());
    return { fromDate: `${y}-01-01`, toDate: `${y}-12-31` };
  }
  return {
    fromDate: asset?.purchase_date || null,
    toDate: asset?.sale_date || new Date().toISOString().slice(0, 10)
  };
}

function renderAssetDetail(assetId) {
  const asset = getAssetById(assetId);
  const root = document.getElementById("assetDetailBody");
  if (!asset || !root) return;
  const reportOpts = assetReportOptionsFor(asset);
  const sum = assetMath().summarizeAsset?.(asset, getAssetTransactions(assetId), reportOpts) || {};
  const own = sum.ownership || {};
  const txs = getAssetTransactions(assetId);
  const netTone = sum.net > 0 ? "profit" : sum.net < 0 ? "loss" : "flat";
  const canEdit = teamCanShowEdit("entries");
  const canDelete = teamCanShowDelete("entries");

  document.getElementById("assetDetailTitle").textContent = asset.name;
  document.getElementById("assetDetailSubtitle").textContent =
    `${assetTypeLabel(asset.asset_type, asset.asset_type_other)} · ${assetStatusLabel(asset.status)}`;

  root.innerHTML = `
    <div class="asset-detail-toolbar">
      <div class="asset-detail-actions">
        <div class="menu-wrap asset-detail-reports-menu">
          <button type="button" class="btn ghost tiny asset-detail-reports-btn" id="assetDetailReportsBtn" title="Download reports" aria-haspopup="menu" aria-expanded="false">
            <i class="fa-solid fa-download" aria-hidden="true"></i> Reports
          </button>
          <div class="menu-dropdown asset-detail-reports-dropdown" id="assetDetailReportsMenu" role="menu" hidden>
            <button type="button" class="menu-item" role="menuitem" data-asset-action="pdf-full">
              <i class="fa-solid fa-file-pdf" aria-hidden="true"></i> Full detailed report
            </button>
            <button type="button" class="menu-item" role="menuitem" data-asset-action="pdf-revenue">
              <i class="fa-solid fa-chart-line" aria-hidden="true"></i> Revenue report
            </button>
            <button type="button" class="menu-item" role="menuitem" data-asset-action="pdf-expenses">
              <i class="fa-solid fa-receipt" aria-hidden="true"></i> Expenses report
            </button>
          </div>
        </div>
        ${canEdit ? `<button type="button" class="btn ghost tiny" data-asset-action="edit" title="Edit asset"><i class="fa-solid fa-pen" aria-hidden="true"></i> Edit</button>` : ""}
        ${canEdit && asset.status === "active" ? `<button type="button" class="btn primary tiny" data-asset-action="sell" title="Sell or dispose"><i class="fa-solid fa-handshake" aria-hidden="true"></i> Sell</button>` : ""}
        ${canEdit ? `<button type="button" class="btn soft tiny" data-asset-action="add-tx" title="Add transaction"><i class="fa-solid fa-plus" aria-hidden="true"></i> Add</button>` : ""}
        ${canDelete ? `<button type="button" class="btn ghost tiny" data-asset-action="delete" title="Delete asset"><i class="fa-solid fa-trash" aria-hidden="true"></i> Delete</button>` : ""}
      </div>
      <div class="asset-report-controls">
        <label>Period
          <select id="assetReportMode" class="select input">
            <option value="all" ${assetUi.reportMode === "all" ? "selected" : ""}>Entire ownership</option>
            <option value="monthly" ${assetUi.reportMode === "monthly" ? "selected" : ""}>This month</option>
            <option value="yearly" ${assetUi.reportMode === "yearly" ? "selected" : ""}>This year</option>
            <option value="custom" ${assetUi.reportMode === "custom" ? "selected" : ""}>Custom range</option>
          </select>
        </label>
        <div class="asset-report-custom ${assetUi.reportMode === "custom" ? "" : "hide"}" id="assetReportCustomWrap">
          <input type="date" id="assetReportFrom" class="input" value="${escapeHtml(assetUi.reportFrom || "")}" />
          <input type="date" id="assetReportTo" class="input" value="${escapeHtml(assetUi.reportTo || "")}" />
        </div>
      </div>
    </div>

    <div class="asset-kpi-grid">
      <div class="asset-kpi"><small>Purchase price</small><strong>${money(sum.purchasePrice || 0, asset.currency)}</strong></div>
      <div class="asset-kpi"><small>Invested / spent</small><strong>${money(sum.investedSpent || 0, asset.currency)}</strong></div>
      <div class="asset-kpi"><small>Total revenue</small><strong>${money(sum.revenue || 0, asset.currency)}</strong></div>
      <div class="asset-kpi"><small>Sale proceeds</small><strong>${money(sum.salePrice || 0, asset.currency)}</strong></div>
      <div class="asset-kpi asset-net-${netTone}"><small>Net profit / loss</small><strong>${money(sum.net || 0, asset.currency)}</strong></div>
    </div>

    <div class="asset-info-grid">
      <div>
        <h4>Asset information</h4>
        <dl class="asset-dl">
          <div><dt>Type</dt><dd>${escapeHtml(assetTypeLabel(asset.asset_type, asset.asset_type_other))}</dd></div>
          <div><dt>Status</dt><dd>${escapeHtml(assetStatusLabel(asset.status))}</dd></div>
          <div><dt>Currency</dt><dd>${escapeHtml(asset.currency)}</dd></div>
          <div><dt>Purchase date</dt><dd>${escapeHtml(asset.purchase_date || "—")}</dd></div>
          <div><dt>Ownership</dt><dd>${escapeHtml(own.label || "—")} · ${Number(own.days || 0)} days${own.ongoing ? " (ongoing)" : ""}</dd></div>
          <div><dt>Description</dt><dd>${escapeHtml(asset.description || "—")}</dd></div>
        </dl>
      </div>
      <div>
        <h4>Expense breakdown</h4>
        <dl class="asset-dl">
          <div><dt>Maintenance</dt><dd>${money(sum.maintenance || 0, asset.currency)}</dd></div>
          <div><dt>Repairs</dt><dd>${money(sum.repair || 0, asset.currency)}</dd></div>
          <div><dt>Operating</dt><dd>${money(sum.operating || 0, asset.currency)}</dd></div>
          <div><dt>Other expenses</dt><dd>${money(sum.otherExpense || 0, asset.currency)}</dd></div>
          <div><dt>Additional investment</dt><dd>${money(sum.additionalInvestment || 0, asset.currency)}</dd></div>
          <div><dt>Sale costs</dt><dd>${money(sum.saleCosts || 0, asset.currency)}</dd></div>
        </dl>
      </div>
      <div>
        <h4>Sale / disposal</h4>
        <dl class="asset-dl">
          <div><dt>Sale date</dt><dd>${escapeHtml(asset.sale_date || "—")}</dd></div>
          <div><dt>Sale price</dt><dd>${asset.status === "sold" ? money(asset.sale_price || 0, asset.currency) : "—"}</dd></div>
          <div><dt>Sale costs</dt><dd>${(asset.status === "sold" || asset.status === "disposed") ? money(asset.sale_costs || 0, asset.currency) : "—"}</dd></div>
          <div><dt>Notes</dt><dd>${escapeHtml(asset.sale_notes || "—")}</dd></div>
        </dl>
        <p class="help asset-calc-help">
          Invested / spent = maintenance + repairs + operating + other + additional investment + sale costs (excludes purchase price).<br/>
          Net = (revenue + sale proceeds) − (purchase price + invested / spent).
        </p>
      </div>
    </div>

    <div class="asset-revenue-period card soft-card">
      <h4>Revenue for selected period</h4>
      <p class="asset-revenue-figure">${money(sum.rangeRevenue || 0, asset.currency)}</p>
      <p class="help">${(sum.rangeRevenue || 0) === 0 ? "No revenue recorded for this period (shown as 0)." : "Revenue total for the selected date range."}</p>
    </div>

    <div class="asset-charts-grid">
      <div class="asset-chart-card"><h4>Income vs expenses</h4><div class="asset-chart-wrap"><canvas id="assetChartIncomeExpense"></canvas></div></div>
      <div class="asset-chart-card"><h4>Expense mix</h4><div class="asset-chart-wrap is-doughnut"><canvas id="assetChartExpenseMix"></canvas></div></div>
      <div class="asset-chart-card"><h4>Monthly performance</h4><div class="asset-chart-wrap"><canvas id="assetChartMonthly"></canvas></div></div>
      <div class="asset-chart-card"><h4>Yearly performance</h4><div class="asset-chart-wrap"><canvas id="assetChartYearly"></canvas></div></div>
      <div class="asset-chart-card is-wide"><h4>Cumulative revenue &amp; expense</h4><div class="asset-chart-wrap is-wide"><canvas id="assetChartCumulative"></canvas></div></div>
    </div>

    <div class="asset-tx-section">
      <div class="asset-tx-head">
        <h4>Transaction history</h4>
        ${canEdit ? `<button type="button" class="btn soft tiny" data-asset-action="add-tx"><i class="fa-solid fa-plus"></i> Add</button>` : ""}
      </div>
      <div class="asset-tx-list">
        ${txs.length ? txs.map(tx => `
          <div class="asset-tx-row" data-tx-id="${escapeHtml(tx.id)}">
            <div class="asset-tx-main">
              <strong class="asset-tx-type">${escapeHtml(assetTxTypeLabel(tx.tx_type, tx.tx_label))}</strong>
              <span class="asset-tx-date">${escapeHtml(tx.tx_date || "")}</span>
              ${tx.notes ? `<span class="asset-tx-notes" title="${escapeHtml(tx.notes)}">${escapeHtml(tx.notes)}</span>` : ""}
            </div>
            <div class="asset-tx-amount ${tx.tx_type === "revenue" ? "is-income" : "is-expense"}">
              ${tx.tx_type === "revenue" ? "+" : "−"}${money(Math.abs(tx.amount || 0), asset.currency)}
            </div>
            <div class="asset-tx-actions">
              ${canEdit ? `<button type="button" class="tiny ghost" data-asset-tx-action="edit" data-tx-id="${escapeHtml(tx.id)}">Edit</button>` : ""}
              ${canDelete ? `<button type="button" class="tiny ghost" data-asset-tx-action="delete" data-tx-id="${escapeHtml(tx.id)}">Delete</button>` : ""}
            </div>
          </div>`).join("") : `<div class="empty">No transactions yet. Revenue shows as 0 until you add income entries.</div>`}
      </div>
    </div>
  `;

  ensureChartLibLoaded().then(ok => {
    if (!ok || assetUi.selectedId !== assetId) return;
    paintAssetCharts(asset, txs, reportOpts);
  });
  bindAssetDetailReportsMenu();
}

function bindAssetDetailReportsMenu(){
  const trigger = document.getElementById("assetDetailReportsBtn");
  const panel = document.getElementById("assetDetailReportsMenu");
  if (!trigger || !panel) return;
  const closeMenu = () => {
    panel.classList.remove("open");
    panel.hidden = true;
    panel.style.top = "";
    panel.style.left = "";
    trigger.setAttribute("aria-expanded", "false");
  };
  const openMenu = () => {
    panel.hidden = false;
    panel.classList.add("open");
    panel.style.visibility = "hidden";
    if (typeof positionFixedMenuDropdown === "function") {
      positionFixedMenuDropdown(panel, trigger, { minWidth: 200, gap: 6 });
    }
    panel.style.visibility = "";
    trigger.setAttribute("aria-expanded", "true");
  };
  trigger.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (panel.classList.contains("open")) closeMenu();
    else openMenu();
  };
  if (!document._assetDetailReportsDocBound) {
    document._assetDetailReportsDocBound = true;
    document.addEventListener("click", (e) => {
      const wrap = document.querySelector(".asset-detail-reports-menu");
      const menu = document.getElementById("assetDetailReportsMenu");
      if (!menu || menu.hidden) return;
      if (wrap && wrap.contains(e.target)) return;
      menu.classList.remove("open");
      menu.hidden = true;
      document.getElementById("assetDetailReportsBtn")?.setAttribute("aria-expanded", "false");
    });
  }
}

function assetChartBaseOptions({ text, muted, legend = true, maxTicksX } = {}) {
  const compact = typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches;
  const line = getComputedStyle(document.documentElement).getPropertyValue("--line").trim() || "rgba(148,163,184,.18)";
  const tickFont = { size: compact ? 9 : 11 };
  const legendFont = { size: compact ? 9 : 11 };
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: compact ? 220 : 360 },
    layout: { padding: compact ? 2 : 4 },
    plugins: {
      legend: legend
        ? {
            position: "bottom",
            labels: {
              color: text,
              boxWidth: compact ? 8 : 10,
              boxHeight: compact ? 8 : 10,
              font: legendFont,
              padding: compact ? 8 : 12
            }
          }
        : { display: false }
    },
    scales: {
      x: {
        ticks: {
          color: muted,
          font: tickFont,
          maxRotation: compact ? 0 : 45,
          autoSkip: true,
          maxTicksLimit: maxTicksX || (compact ? 5 : 8)
        },
        grid: { color: line }
      },
      y: {
        beginAtZero: true,
        ticks: { color: muted, font: tickFont, maxTicksLimit: compact ? 5 : 8 },
        grid: { color: line }
      }
    }
  };
}

function paintAssetCharts(asset, txs, reportOpts) {
  destroyAssetCharts();
  const sum = assetMath().summarizeAsset?.(asset, txs, reportOpts) || {};
  const months = assetMath().monthlyBuckets?.(txs, reportOpts) || [];
  const years = assetMath().yearlyBuckets?.(txs, reportOpts) || [];
  const cum = assetMath().cumulativeSeries?.(txs, reportOpts) || [];
  const themed = typeof sectionDetailsThemeColors === "function" ? sectionDetailsThemeColors() : null;
  const text = themed?.text || getComputedStyle(document.documentElement).getPropertyValue("--text").trim() || "#1f2937";
  const muted = themed?.muted || getComputedStyle(document.documentElement).getPropertyValue("--muted").trim() || "#6b7280";
  const primary = themed?.primary || "#2563eb";
  const success = themed?.success || "#0ea5e9";
  const warning = themed?.warning || "#f59e0b";
  const danger = themed?.danger || "#ef4444";
  const accentPalette = themed?.palette || [primary, success, warning, danger, "#64748b"];
  const compact = typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches;

  createAssetChart(document.getElementById("assetChartIncomeExpense"), {
    type: "bar",
    data: {
      labels: ["Purchase", "Invested / spent", "Revenue", "Sale", "Net"],
      datasets: [{
        label: asset.currency,
        data: [
          sum.purchasePrice || 0,
          sum.investedSpent || 0,
          sum.revenue || 0,
          sum.salePrice || 0,
          sum.net || 0
        ],
        backgroundColor: [
          accentPalette[4] || themed?.black || "#334155",
          danger,
          primary,
          success,
          (sum.net || 0) >= 0 ? success : danger
        ]
      }]
    },
    options: {
      ...assetChartBaseOptions({ text, muted, legend: false }),
      plugins: { legend: { display: false } }
    }
  });

  const mixValues = [
    sum.maintenance || 0,
    sum.repair || 0,
    sum.operating || 0,
    sum.otherExpense || 0,
    sum.additionalInvestment || 0,
    sum.saleCosts || 0,
    sum.purchasePrice || 0
  ];
  createAssetChart(document.getElementById("assetChartExpenseMix"), {
    type: "doughnut",
    data: {
      labels: ["Maintenance", "Repairs", "Operating", "Other", "Extra invest.", "Sale costs", "Purchase"],
      datasets: [{
        data: mixValues,
        backgroundColor: [warning, danger, accentPalette[1] || primary, accentPalette[4] || muted, primary, accentPalette[2] || warning, themed?.black || accentPalette[4] || "#334155"],
        borderColor: themed?.doughnutBorder || getComputedStyle(document.documentElement).getPropertyValue("--surface").trim() || "#ffffff",
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: compact ? 220 : 360 },
      cutout: compact ? "58%" : "55%",
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: text,
            boxWidth: compact ? 8 : 10,
            font: { size: compact ? 8 : 10 },
            padding: compact ? 6 : 10
          }
        }
      }
    }
  });

  createAssetChart(document.getElementById("assetChartMonthly"), {
    type: "line",
    data: {
      labels: months.map(m => m.month),
      datasets: [
        { label: "Revenue", data: months.map(m => m.revenue), borderColor: success, tension: 0.25, pointRadius: compact ? 2 : 3 },
        { label: "Expenses", data: months.map(m => m.expense), borderColor: danger, tension: 0.25, pointRadius: compact ? 2 : 3 }
      ]
    },
    options: assetChartBaseOptions({ text, muted, maxTicksX: compact ? 4 : 8 })
  });

  createAssetChart(document.getElementById("assetChartYearly"), {
    type: "bar",
    data: {
      labels: years.map(y => y.year),
      datasets: [
        { label: "Revenue", data: years.map(y => y.revenue), backgroundColor: success },
        { label: "Expenses", data: years.map(y => y.expense), backgroundColor: danger }
      ]
    },
    options: assetChartBaseOptions({ text, muted })
  });

  createAssetChart(document.getElementById("assetChartCumulative"), {
    type: "line",
    data: {
      labels: cum.map(p => p.date),
      datasets: [
        { label: "Cumulative revenue", data: cum.map(p => p.revenue), borderColor: primary, fill: false, tension: 0.2, pointRadius: compact ? 0 : 2 },
        { label: "Cumulative expense", data: cum.map(p => p.expense), borderColor: danger, fill: false, tension: 0.2, pointRadius: compact ? 0 : 2 }
      ]
    },
    options: assetChartBaseOptions({ text, muted, maxTicksX: compact ? 4 : 8 })
  });
}

function openAssetTxModal(txId) {
  try { assertAssetsFeatureAccess(); } catch (err) { alert(err.message); return; }
  if (!assetUi.selectedId) return;
  const tx = txId ? getAssetTransactions(assetUi.selectedId).find(t => t.id === txId) : null;
  assetUi.editingTxId = tx?.id || null;
  document.getElementById("assetTxFormTitle").textContent = tx ? "Edit transaction" : "Add transaction";
  populateAssetTxTypeSelect(assetTxSelectValueFor(tx));
  const typeVal = document.getElementById("assetTxType")?.value || "";
  const labelInput = document.getElementById("assetTxLabel");
  if (labelInput) {
    labelInput.value = typeVal === "other_expense"
      ? normalizeAssetCustomLabel(tx?.tx_label || tx?.meta?.tx_label || "")
      : "";
  }
  document.getElementById("assetTxAmount").value = tx ? String(tx.amount) : "";
  document.getElementById("assetTxDate").value = tx?.tx_date || new Date().toISOString().slice(0, 10);
  document.getElementById("assetTxNotes").value = tx?.notes || "";
  toggleAssetTxLabel();
  openAssetsModal("assetTxModal");
}

function toggleAssetTxLabel() {
  const type = document.getElementById("assetTxType")?.value;
  const wrap = document.getElementById("assetTxLabelWrap");
  const show = type === "other_expense";
  if (wrap) wrap.classList.toggle("hide", !show);
  if (!show) {
    const input = document.getElementById("assetTxLabel");
    if (input) input.value = "";
  }
}

async function saveAssetTxForm() {
  try {
    assertAssetsFeatureAccess();
    if (!teamCanShowEdit("entries")) throw new Error("You do not have permission to edit entries.");
  } catch (err) {
    alert(err.message);
    return;
  }
  const assetId = assetUi.selectedId;
  if (!assetId) return;
  const resolved = resolveAssetTxTypeSelection(
    document.getElementById("assetTxType")?.value,
    document.getElementById("assetTxLabel")?.value
  );
  if (!resolved.ok) {
    alert(resolved.error || "Select a valid transaction type.");
    return;
  }
  const tx_type = resolved.tx_type;
  const tx_label = resolved.tx_label;
  const amount = Number(document.getElementById("assetTxAmount")?.value || 0);
  const tx_date = String(document.getElementById("assetTxDate")?.value || "").trim();
  const notes = String(document.getElementById("assetTxNotes")?.value || "").trim();
  if (!(amount > 0)) { alert("Amount must be greater than zero."); return; }
  if (!tx_date) { alert("Please enter a date."); return; }

  const existing = assetUi.editingTxId
    ? getAssetTransactions(assetId).find(t => t.id === assetUi.editingTxId)
    : null;
  const meta = {
    ...(existing?.meta && typeof existing.meta === "object" ? existing.meta : {})
  };
  if (tx_type === "other_expense" && tx_label) meta.tx_label = tx_label;
  else delete meta.tx_label;

  const payload = {
    asset_id: assetId,
    owner_id: currentOwnerId(),
    tx_type,
    tx_label: tx_type === "other_expense" ? (tx_label || null) : null,
    amount,
    tx_date,
    notes: notes || null,
    meta,
    updated_at: new Date().toISOString()
  };
  const btn = document.getElementById("assetTxSaveBtn");
  if (btn) btn.disabled = true;
  try {
    if (assetUi.editingTxId) {
      await supabase(`app_asset_transactions?id=eq.${encodeURIComponent(assetUi.editingTxId)}${ownerIdQuery()}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
    } else {
      payload.id = crypto.randomUUID();
      payload.is_deleted = false;
      payload.created_at = new Date().toISOString();
      await supabase("app_asset_transactions", { method: "POST", body: JSON.stringify(payload) });
    }
    if (tx_type === "other_expense" && tx_label) rememberAssetCustomExpenseLabel(tx_label);
    invalidateAssetTransactions(assetId);
    if (typeof invalidateDashboardSummary === "function") invalidateDashboardSummary({ refreshIfVisible: true });
    closeModal("assetTxModal");
    await loadAssetsFromDatabase({ force: true });
    if (assetUi.selectedId === assetId) await openAssetDetail(assetId);
  } catch (err) {
    console.error(err);
    // Fallback if tx_label column is not migrated yet — keep label in meta only
    const msg = String(err?.message || err || "");
    if (/tx_label|PGRST204|Could not find/i.test(msg) && payload.tx_label != null) {
      try {
        const fallback = { ...payload };
        delete fallback.tx_label;
        if (assetUi.editingTxId) {
          await supabase(`app_asset_transactions?id=eq.${encodeURIComponent(assetUi.editingTxId)}${ownerIdQuery()}`, {
            method: "PATCH",
            body: JSON.stringify(fallback)
          });
        } else {
          await supabase("app_asset_transactions", { method: "POST", body: JSON.stringify(fallback) });
        }
        if (tx_type === "other_expense" && tx_label) rememberAssetCustomExpenseLabel(tx_label);
        invalidateAssetTransactions(assetId);
        if (typeof invalidateDashboardSummary === "function") invalidateDashboardSummary({ refreshIfVisible: true });
        closeModal("assetTxModal");
        await loadAssetsFromDatabase({ force: true });
        if (assetUi.selectedId === assetId) await openAssetDetail(assetId);
        return;
      } catch (err2) {
        console.error(err2);
        alert("Failed to save transaction: " + (err2.message || err2));
        return;
      }
    }
    alert("Failed to save transaction: " + (err.message || err));
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function deleteAssetTransaction(txId) {
  try {
    assertAssetsFeatureAccess();
    if (!teamCanShowDelete("entries")) throw new Error("You do not have permission to delete entries.");
  } catch (err) {
    alert(err.message);
    return;
  }
  if (!(await appConfirmDelete("Delete this transaction?", { title: "Delete asset transaction?", confirmLabel: "Delete transaction" }))) return;
  try {
    await supabase(`app_asset_transactions?id=eq.${encodeURIComponent(txId)}${ownerIdQuery()}`, {
      method: "PATCH",
      body: JSON.stringify({ is_deleted: true, updated_at: new Date().toISOString() })
    });
    const assetId = assetUi.selectedId;
    invalidateAssetTransactions(assetId);
    if (typeof invalidateDashboardSummary === "function") invalidateDashboardSummary({ refreshIfVisible: true });
    await loadAssetsFromDatabase({ force: true });
    if (assetId) await openAssetDetail(assetId);
  } catch (err) {
    alert("Failed to delete transaction: " + (err.message || err));
  }
}

function openAssetSaleModal() {
  try { assertAssetsFeatureAccess(); } catch (err) { alert(err.message); return; }
  const asset = getAssetById(assetUi.selectedId);
  if (!asset) return;
  document.getElementById("assetSaleStatus").value = asset.status === "active" ? "sold" : asset.status;
  document.getElementById("assetSaleDate").value = asset.sale_date || new Date().toISOString().slice(0, 10);
  document.getElementById("assetSalePrice").value = asset.sale_price != null ? String(asset.sale_price) : "";
  document.getElementById("assetSaleCosts").value = asset.sale_costs ? String(asset.sale_costs) : "0";
  document.getElementById("assetSaleNotes").value = asset.sale_notes || "";
  toggleAssetSalePriceFields();
  openAssetsModal("assetSaleModal");
}

function toggleAssetSalePriceFields() {
  const status = document.getElementById("assetSaleStatus")?.value;
  const priceWrap = document.getElementById("assetSalePriceWrap");
  if (priceWrap) priceWrap.classList.toggle("hide", status !== "sold");
}

async function saveAssetSaleForm() {
  try {
    assertAssetsFeatureAccess();
    if (!teamCanShowEdit("entries")) throw new Error("You do not have permission to edit entries.");
  } catch (err) {
    alert(err.message);
    return;
  }
  const asset = getAssetById(assetUi.selectedId);
  if (!asset) return;
  const status = String(document.getElementById("assetSaleStatus")?.value || "sold");
  const sale_date = String(document.getElementById("assetSaleDate")?.value || "").trim();
  const sale_price = Number(document.getElementById("assetSalePrice")?.value || 0);
  const sale_costs = Number(document.getElementById("assetSaleCosts")?.value || 0);
  const sale_notes = String(document.getElementById("assetSaleNotes")?.value || "").trim();
  if (!["sold", "disposed", "active"].includes(status)) {
    alert("Invalid status.");
    return;
  }
  if ((status === "sold" || status === "disposed") && !sale_date) {
    alert("Please enter a sale / disposal date.");
    return;
  }
  if (status === "sold" && !(sale_price >= 0)) {
    alert("Sale price must be zero or greater.");
    return;
  }
  const payload = {
    status,
    sale_date: status === "active" ? null : sale_date,
    sale_price: status === "sold" ? sale_price : null,
    sale_costs: status === "active" ? 0 : Math.max(0, sale_costs),
    sale_notes: sale_notes || null,
    updated_at: new Date().toISOString()
  };
  const btn = document.getElementById("assetSaleSaveBtn");
  if (btn) btn.disabled = true;
  try {
    await supabase(`app_assets?id=eq.${encodeURIComponent(asset.id)}${ownerIdQuery()}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
    if (typeof invalidateDashboardSummary === "function") invalidateDashboardSummary({ refreshIfVisible: true });
    closeModal("assetSaleModal");
    await loadAssetsFromDatabase({ force: true });
  } catch (err) {
    alert("Failed to update asset status: " + (err.message || err));
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function deleteAsset(assetId) {
  try {
    assertAssetsFeatureAccess();
    if (!teamCanShowDelete("entries")) throw new Error("You do not have permission to delete entries.");
  } catch (err) {
    alert(err.message);
    return;
  }
  const asset = getAssetById(assetId);
  if (!asset) return;
  if (!(await appConfirmDelete(`Delete asset "${asset.name}" and its transactions?`, { title: "Delete asset?", confirmLabel: "Delete asset" }))) return;
  try {
    await supabase(`app_asset_transactions?asset_id=eq.${encodeURIComponent(assetId)}${ownerIdQuery()}`, {
      method: "PATCH",
      body: JSON.stringify({ is_deleted: true, updated_at: new Date().toISOString() })
    }).catch(() => {});
    await supabase(`app_assets?id=eq.${encodeURIComponent(assetId)}${ownerIdQuery()}`, {
      method: "PATCH",
      body: JSON.stringify({ is_deleted: true, updated_at: new Date().toISOString() })
    });
    invalidateAssetTransactions(assetId);
    if (typeof invalidateDashboardSummary === "function") invalidateDashboardSummary({ refreshIfVisible: true });
    assetUi.selectedId = null;
    closeModal("assetDetailModal");
    await loadAssetsFromDatabase({ force: true });
  } catch (err) {
    alert("Failed to delete asset: " + (err.message || err));
  }
}

let assetsDetailsSelectedCurrency = "";

function collectAssetPortfolioRows(preferredCurrency = "") {
  const all = (state.assets || []).slice();
  const currencies = [...new Set(all.map(a => String(a.currency || "AED").toUpperCase()).filter(Boolean))].sort();
  let selected = String(preferredCurrency || assetsDetailsSelectedCurrency || "").toUpperCase();
  if (selected && !currencies.includes(selected)) selected = "";
  if (!selected && currencies.length === 1) selected = currencies[0];
  if (!selected && !isPageCurrencyAll?.()) {
    const page = (typeof getSelectedPageCurrencies === "function" ? getSelectedPageCurrencies() : [])
      .map(c => String(c || "").toUpperCase())
      .find(c => currencies.includes(c));
    if (page) selected = page;
  }
  if (!selected && currencies.length) selected = currencies[0];

  const filtered = selected ? all.filter(a => String(a.currency || "").toUpperCase() === selected) : all;
  const rows = filtered.map(asset => {
    const txs = state.assetTransactionLoadedIds?.has(asset.id) ? getAssetTransactions(asset.id) : [];
    const sum = summarizeAssetById(asset.id) || {};
    return { asset, txs, sum };
  }).sort((a, b) => String(a.asset.name || "").localeCompare(String(b.asset.name || ""), undefined, { sensitivity: "base" }));

  const totals = rows.reduce((acc, row) => {
    acc.purchase += Number(row.sum.purchasePrice || 0);
    acc.investedSpent += Number(row.sum.investedSpent || 0);
    acc.expenses += Number(row.sum.totalExpenses || 0);
    acc.revenue += Number(row.sum.revenue || 0);
    acc.sale += Number(row.sum.salePrice || 0);
    acc.income += Number(row.sum.totalIncome || 0);
    acc.net += Number(row.sum.net || 0);
    acc.maintenance += Number(row.sum.maintenance || 0);
    acc.repair += Number(row.sum.repair || 0);
    acc.operating += Number(row.sum.operating || 0);
    acc.otherExpense += Number(row.sum.otherExpense || 0);
    acc.additionalInvestment += Number(row.sum.additionalInvestment || 0);
    acc.saleCosts += Number(row.sum.saleCosts || 0);
    const st = String(row.asset.status || "active");
    acc.status[st] = (acc.status[st] || 0) + 1;
    const typeLabel = assetTypeLabel(row.asset.asset_type, row.asset.asset_type_other);
    acc.typeCounts.set(typeLabel, (acc.typeCounts.get(typeLabel) || 0) + 1);
    return acc;
  }, {
    purchase: 0, investedSpent: 0, expenses: 0, revenue: 0, sale: 0, income: 0, net: 0,
    maintenance: 0, repair: 0, operating: 0, otherExpense: 0, additionalInvestment: 0, saleCosts: 0,
    status: { active: 0, sold: 0, disposed: 0 },
    typeCounts: new Map()
  });

  const monthMap = new Map();
  rows.forEach(row => {
    (assetMath().monthlyBuckets?.(row.txs) || []).forEach(m => {
      if (!monthMap.has(m.month)) monthMap.set(m.month, { revenue: 0, expense: 0 });
      const bucket = monthMap.get(m.month);
      bucket.revenue += Number(m.revenue || 0);
      bucket.expense += Number(m.expense || 0);
    });
  });

  return {
    currencies,
    selectedCurrency: selected,
    rows,
    totals,
    monthMap,
    count: rows.length
  };
}

function buildAssetsDetailsPayload(preferredCurrency = "") {
  return collectAssetPortfolioRows(preferredCurrency);
}

/** Dashboard-shaped payload (formatted metrics + chart inputs). */
function buildAssetsDashboardPayload(preferredCurrency = "") {
  const data = collectAssetPortfolioRows(preferredCurrency);
  const cur = data.selectedCurrency || "";
  const fmt = (n) => {
    if (typeof formatReportAmount === "function") {
      return cur ? formatReportAmount(n, cur) : formatReportAmount(n, "");
    }
    if (typeof moneyText === "function") return moneyText(n || 0, cur || "AED");
    return String(n || 0);
  };
  const t = data.totals || {};
  const status = t.status || { active: 0, sold: 0, disposed: 0 };
  return {
    currencies: data.currencies || [],
    selectedCurrency: cur,
    count: data.count || 0,
    metrics: {
      assets: data.count || 0,
      active: status.active || 0,
      sold: status.sold || 0,
      disposed: status.disposed || 0,
      invested: fmt(t.investedSpent || 0),
      investedValue: Number(t.investedSpent || 0),
      revenue: fmt(t.revenue || 0),
      revenueValue: Number(t.revenue || 0),
      sale: fmt(t.sale || 0),
      saleValue: Number(t.sale || 0),
      net: fmt(t.net || 0),
      netValue: Number(t.net || 0),
      purchase: fmt(t.purchase || 0),
      purchaseValue: Number(t.purchase || 0)
    },
    statusCounts: status,
    typeCounts: t.typeCounts instanceof Map ? t.typeCounts : new Map(),
    expenseBreakdown: {
      maintenance: Number(t.maintenance || 0),
      repair: Number(t.repair || 0),
      operating: Number(t.operating || 0),
      otherExpense: Number(t.otherExpense || 0),
      additionalInvestment: Number(t.additionalInvestment || 0),
      saleCosts: Number(t.saleCosts || 0),
      purchase: Number(t.purchase || 0)
    },
    monthMap: data.monthMap instanceof Map ? data.monthMap : new Map(),
    rows: data.rows || [],
    totals: t
  };
}

function assetsDetailsCurrencyChipsHtml(currencies, selected) {
  if (typeof sectionDetailsCurrencyChipsHtml === "function") {
    return sectionDetailsCurrencyChipsHtml(currencies, selected, {
      ariaLabel: "Asset currency",
      dataAttr: "assets-details-currency"
    });
  }
  if (!currencies?.length) return "";
  return `<div class="section-details-currency-chips" role="group" aria-label="Asset currency">
    ${currencies.map(c => `
      <button type="button" class="section-details-currency-chip${c === selected ? " active" : ""}" data-assets-details-currency="${escapeHtml(c)}">${escapeHtml(c)}</button>
    `).join("")}
  </div>`;
}

function setAssetsDetailsActions() {
  const host = els.sectionDetailsActions;
  if (!host) return;
  try { host._assetsPdfMenuCleanup?.(); } catch (_) {}
  host.classList.remove("hide");
  host.innerHTML = `
    <div class="assets-pdf-menu-wrap">
      <button class="icon-btn ghost" type="button" id="assetsDetailsPdfMenuBtn" title="Download PDF" aria-label="Download PDF" aria-haspopup="menu" aria-expanded="false">
        <i class="fa-solid fa-download" aria-hidden="true"></i>
      </button>
      <div class="assets-pdf-menu" id="assetsDetailsPdfMenu" role="menu" hidden>
        <button type="button" class="menu-item" role="menuitem" data-assets-details-pdf="summary">
          <i class="fa-solid fa-file-pdf" aria-hidden="true"></i> Summary PDF
        </button>
        <button type="button" class="menu-item" role="menuitem" data-assets-details-pdf="details">
          <i class="fa-solid fa-file-pdf" aria-hidden="true"></i> Detailed PDF
        </button>
      </div>
    </div>
  `;
  const trigger = host.querySelector("#assetsDetailsPdfMenuBtn");
  const panel = host.querySelector("#assetsDetailsPdfMenu");
  const closeMenu = () => {
    if (!panel || !trigger) return;
    panel.classList.remove("open");
    panel.hidden = true;
    panel.style.top = "";
    panel.style.left = "";
    trigger.setAttribute("aria-expanded", "false");
  };
  const openMenu = () => {
    if (!panel || !trigger) return;
    panel.hidden = false;
    panel.classList.add("open");
    // Keep the report menu anchored to its trigger even inside glass/modal stacking contexts.
    panel.style.visibility = "hidden";
    if (typeof positionFixedMenuDropdown === "function") {
      positionFixedMenuDropdown(panel, trigger, { minWidth: 176, gap: 6 });
    }
    panel.style.visibility = "";
    trigger.setAttribute("aria-expanded", "true");
  };
  trigger?.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    if (panel?.classList.contains("open")) closeMenu();
    else openMenu();
  });
  host.querySelectorAll("[data-assets-details-pdf]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      closeMenu();
      const mode = btn.dataset.assetsDetailsPdf;
      const runner = mode === "summary" ? downloadAssetsSummaryPDF : downloadAssetsDetailsPDF;
      if (typeof runner === "function") {
        Promise.resolve(runner()).catch(err => alert(err?.message || err || "Could not create PDF."));
      }
    });
  });
  const onDocClick = e => {
    if (!host.contains(e.target) && !panel?.contains(e.target)) closeMenu();
  };
  document.addEventListener("click", onDocClick);
  host._assetsPdfMenuCleanup = () => {
    document.removeEventListener("click", onDocClick);
    closeMenu();
  };
}

function renderAssetsDetailsOverlay(preferredCurrency = "") {
  if (typeof destroySectionDetailsCharts === "function") destroySectionDetailsCharts();
  const data = buildAssetsDetailsPayload(preferredCurrency || assetsDetailsSelectedCurrency);
  assetsDetailsSelectedCurrency = data.selectedCurrency || "";
  setAssetsDetailsActions();

  const cur = data.selectedCurrency || "AED";
  const t = data.totals;
  const mText = (n) => money(n || 0, cur);
  const metricsHtml = [
    sectionDetailsMetricHtml("Assets", escapeHtml(String(data.count)), "primary"),
    sectionDetailsMetricHtml("Active", escapeHtml(String(t.status.active || 0)), "success"),
    sectionDetailsMetricHtml("Sold", escapeHtml(String(t.status.sold || 0))),
    sectionDetailsMetricHtml("Disposed", escapeHtml(String(t.status.disposed || 0))),
    sectionDetailsMetricHtml("Purchase total", mText(t.purchase)),
    sectionDetailsMetricHtml("Invested / spent", mText(t.investedSpent)),
    sectionDetailsMetricHtml("Total revenue", mText(t.revenue), "success"),
    sectionDetailsMetricHtml("Sale proceeds", mText(t.sale)),
    sectionDetailsMetricHtml("Net P/L", mText(t.net), t.net >= 0 ? "success" : "danger")
  ].join("");

  const tableRows = data.rows.map(row => {
    const a = row.asset;
    const s = row.sum;
    const netTone = Number(s.net || 0) > 0 ? "is-success" : Number(s.net || 0) < 0 ? "is-danger" : "";
    return `<tr data-open-asset-id="${escapeHtml(a.id)}" class="assets-details-row" role="button" tabindex="0">
      <td><strong>${escapeHtml(a.name)}</strong><div class="help">${escapeHtml(assetTypeLabel(a.asset_type, a.asset_type_other))}</div></td>
      <td>${escapeHtml(assetStatusLabel(a.status))}</td>
      <td>${escapeHtml(a.purchase_date || "—")}</td>
      <td>${escapeHtml(s.ownership?.label || "—")}</td>
      <td class="num">${mText(s.investedSpent)}</td>
      <td class="num">${mText(s.revenue)}</td>
      <td class="num ${netTone}">${mText(s.net)}</td>
    </tr>`;
  }).join("");

  els.sectionDetailsBody.innerHTML = `
    ${assetsDetailsCurrencyChipsHtml(data.currencies, data.selectedCurrency)}
    <p class="section-details-note">Portfolio view for ${escapeHtml(cur)}. Click a row to open that asset. Use the download icon for Summary or Detailed PDF.</p>
    <div class="section-details-metrics">${metricsHtml}</div>
    <div class="section-details-charts">
      <div class="section-details-chart-card">
        <h4>Status mix</h4>
        <div class="section-details-chart-wrap"><canvas id="sectionDetailsChart1"></canvas></div>
      </div>
      <div class="section-details-chart-card">
        <h4>Income vs investment</h4>
        <div class="section-details-chart-wrap"><canvas id="sectionDetailsChart2"></canvas></div>
      </div>
      <div class="section-details-chart-card">
        <h4>Asset type mix</h4>
        <div class="section-details-chart-wrap"><canvas id="sectionDetailsChart3"></canvas></div>
      </div>
      <div class="section-details-chart-card">
        <h4>Expense breakdown</h4>
        <div class="section-details-chart-wrap"><canvas id="sectionDetailsChart4"></canvas></div>
      </div>
      <div class="section-details-chart-card is-wide">
        <h4>Monthly revenue &amp; expenses</h4>
        <div class="section-details-chart-wrap"><canvas id="sectionDetailsChart5"></canvas></div>
      </div>
      <div class="section-details-chart-card is-wide">
        <h4>Net result by asset</h4>
        <div class="section-details-chart-wrap"><canvas id="sectionDetailsChart6"></canvas></div>
      </div>
    </div>
    <div class="assets-details-table-wrap">
      <h4>Asset-wise performance</h4>
      ${data.rows.length ? `
      <div class="table-scroll">
        <table class="assets-details-table">
          <thead>
            <tr>
              <th>Asset</th><th>Status</th><th>Purchased</th><th>Owned</th><th>Invested / spent</th><th>Revenue</th><th>Net</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>` : `<div class="section-details-empty">No assets in ${escapeHtml(cur)} yet.</div>`}
    </div>
  `;

  els.sectionDetailsBody.querySelectorAll("[data-assets-details-currency]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      const next = String(btn.dataset.assetsDetailsCurrency || "").trim();
      if (!next || next === assetsDetailsSelectedCurrency) return;
      assetsDetailsSelectedCurrency = next;
      renderAssetsDetailsOverlay(next);
    });
  });

  const openRow = (id) => {
    if (!id) return;
    closeModal("sectionDetailsModal");
    openAssetDetail(id);
  };
  els.sectionDetailsBody.querySelectorAll("[data-open-asset-id]").forEach(row => {
    row.addEventListener("click", () => openRow(row.dataset.openAssetId));
    row.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openRow(row.dataset.openAssetId);
      }
    });
  });

  const { colors, options } = sectionDetailsChartDefaults();
  createSectionDetailsChart(document.getElementById("sectionDetailsChart1"), {
    type: "doughnut",
    data: {
      labels: ["Active", "Sold", "Disposed"],
      datasets: [sectionDetailsDoughnutDataset(
        [t.status.active || 0, t.status.sold || 0, t.status.disposed || 0],
        [colors.success, colors.primary, colors.muted]
      )]
    },
    options: sectionDetailsDoughnutOptions(options, "64%")
  });

  createSectionDetailsChart(document.getElementById("sectionDetailsChart2"), {
    type: "bar",
    data: {
      labels: ["Purchase", "Invested / spent", "Revenue", "Sale", "Net"],
      datasets: [{
        data: [t.purchase, t.investedSpent, t.revenue, t.sale, t.net],
        backgroundColor: [colors.black || "#334155", colors.danger, colors.sky, colors.success, t.net >= 0 ? colors.success : colors.danger],
        borderRadius: 8
      }]
    },
    options: {
      ...options,
      plugins: { ...(options.plugins || {}), legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });

  const typeEntries = [...t.typeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  createSectionDetailsChart(document.getElementById("sectionDetailsChart3"), {
    type: "bar",
    data: {
      labels: typeEntries.length ? typeEntries.map(([l]) => l) : ["—"],
      datasets: [{
        label: "Assets",
        data: typeEntries.length ? typeEntries.map(([, n]) => n) : [0],
        backgroundColor: colors.primary,
        borderRadius: 8
      }]
    },
    options: {
      ...options,
      plugins: { ...(options.plugins || {}), legend: { display: false } },
      scales: {
        x: { ticks: { maxRotation: 40, font: { size: 10 } } },
        y: { beginAtZero: true, ticks: { precision: 0 } }
      }
    }
  });

  createSectionDetailsChart(document.getElementById("sectionDetailsChart4"), {
    type: "doughnut",
    data: {
      labels: ["Purchase", "Maintenance", "Repair", "Operating", "Other", "Extra invest.", "Sale costs"],
      datasets: [sectionDetailsDoughnutDataset(
        [t.purchase, t.maintenance, t.repair, t.operating, t.otherExpense, t.additionalInvestment, t.saleCosts],
        sectionDetailsAccentPalette(7)
      )]
    },
    options: sectionDetailsDoughnutOptions(options, "58%")
  });

  const months = sectionDetailsSortedMonthKeys(data.monthMap.keys());
  createSectionDetailsChart(document.getElementById("sectionDetailsChart5"), {
    type: "line",
    data: {
      labels: months.length ? months.map(sectionDetailsMonthLabel) : ["—"],
      datasets: [
        sectionDetailsLineDataset("Revenue", months.map(k => Number(data.monthMap.get(k)?.revenue || 0)), colors.sky),
        sectionDetailsLineDataset("Expenses", months.map(k => Number(data.monthMap.get(k)?.expense || 0)), colors.danger)
      ]
    },
    options
  });

  const topNet = data.rows.slice().sort((a, b) => Math.abs(b.sum.net || 0) - Math.abs(a.sum.net || 0)).slice(0, 10);
  createSectionDetailsChart(document.getElementById("sectionDetailsChart6"), {
    type: "bar",
    data: {
      labels: topNet.length ? topNet.map(r => r.asset.name) : ["—"],
      datasets: [{
        label: "Net",
        data: topNet.length ? topNet.map(r => Number(r.sum.net || 0)) : [0],
        backgroundColor: topNet.map(r => Number(r.sum.net || 0) >= 0 ? colors.success : colors.danger),
        borderRadius: 6
      }]
    },
    options: {
      ...options,
      indexAxis: "y",
      plugins: { ...(options.plugins || {}), legend: { display: false } },
      scales: { x: { beginAtZero: true } }
    }
  });
}

function assetsBindUI() {
  document.getElementById("openAddAssetBtn")?.addEventListener("click", () => openAssetFormModal(null));
  document.getElementById("openAddAssetBtnMenu")?.addEventListener("click", () => openAssetFormModal(null));
  document.getElementById("assetFormType")?.addEventListener("change", toggleAssetTypeOther);
  document.getElementById("assetTxType")?.addEventListener("change", toggleAssetTxLabel);
  document.getElementById("assetFormSaveBtn")?.addEventListener("click", () => saveAssetForm());
  document.getElementById("assetTxSaveBtn")?.addEventListener("click", () => saveAssetTxForm());
  document.getElementById("assetSaleSaveBtn")?.addEventListener("click", () => saveAssetSaleForm());
  document.getElementById("assetSaleStatus")?.addEventListener("change", toggleAssetSalePriceFields);

  document.getElementById("searchAssets")?.addEventListener("input", e => {
    assetUi.search = e.target.value || "";
    renderAssetsList();
  });
  document.querySelectorAll('input[name="assetStatusFilter"]').forEach(r => {
    r.addEventListener("change", e => {
      assetUi.status = e.target.value || "all";
      renderAssetsList();
    });
  });

  document.getElementById("assetsList")?.addEventListener("click", e => {
    const menuTrigger = e.target.closest("[data-asset-menu-trigger]");
    if (menuTrigger) {
      e.preventDefault();
      e.stopPropagation();
      openAssetCardMenu(menuTrigger);
      return;
    }
    const actionBtn = e.target.closest("[data-asset-card-action]");
    if (actionBtn) {
      e.preventDefault();
      e.stopPropagation();
      const assetId = actionBtn.getAttribute("data-asset-id");
      const action = actionBtn.getAttribute("data-asset-card-action");
      closeAllAssetCardMenus();
      if (!assetId) return;
      if (action === "open") openAssetDetail(assetId);
      else if (action === "add-tx") {
        assetUi.selectedId = assetId;
        openAssetTxModal(null);
      } else if (action === "edit") openAssetFormModal(assetId);
      else if (action === "sell") {
        assetUi.selectedId = assetId;
        openAssetSaleModal();
      } else if (action === "pdf-full") {
        if (typeof downloadSingleAssetPDF === "function") {
          downloadSingleAssetPDF(assetId).catch(err => alert(err?.message || err));
        }
      } else if (action === "pdf-revenue") {
        if (typeof downloadSingleAssetRevenuePDF === "function") {
          downloadSingleAssetRevenuePDF(assetId).catch(err => alert(err?.message || err));
        }
      } else if (action === "pdf-expenses") {
        if (typeof downloadSingleAssetExpensesPDF === "function") {
          downloadSingleAssetExpensesPDF(assetId).catch(err => alert(err?.message || err));
        }
      } else if (action === "delete") deleteAsset(assetId);
      return;
    }
    const openBtn = e.target.closest("[data-asset-open]");
    if (openBtn) {
      openAssetDetail(openBtn.getAttribute("data-asset-open"));
      return;
    }
  });
  document.addEventListener("click", e => {
    if (!e.target.closest(".asset-card-menu")) closeAllAssetCardMenus();
  });

  document.getElementById("assetDetailBody")?.addEventListener("click", e => {
    const actionBtn = e.target.closest("[data-asset-action]");
    if (actionBtn) {
      const action = actionBtn.dataset.assetAction;
      if (action === "pdf" || action === "pdf-full") {
        if (typeof downloadSingleAssetPDF === "function") {
          downloadSingleAssetPDF(assetUi.selectedId).catch(err => alert(err?.message || err));
        }
      } else if (action === "pdf-revenue") {
        if (typeof downloadSingleAssetRevenuePDF === "function") {
          downloadSingleAssetRevenuePDF(assetUi.selectedId).catch(err => alert(err?.message || err));
        }
      } else if (action === "pdf-expenses") {
        if (typeof downloadSingleAssetExpensesPDF === "function") {
          downloadSingleAssetExpensesPDF(assetUi.selectedId).catch(err => alert(err?.message || err));
        }
      } else if (action === "edit") openAssetFormModal(assetUi.selectedId);
      else if (action === "sell") openAssetSaleModal();
      else if (action === "add-tx") openAssetTxModal(null);
      else if (action === "delete") deleteAsset(assetUi.selectedId);
      return;
    }
    const txBtn = e.target.closest("[data-asset-tx-action]");
    if (!txBtn) return;
    const txId = txBtn.dataset.txId;
    if (txBtn.dataset.assetTxAction === "edit") openAssetTxModal(txId);
    else if (txBtn.dataset.assetTxAction === "delete") deleteAssetTransaction(txId);
  });

  document.getElementById("assetDetailBody")?.addEventListener("change", e => {
    if (e.target?.id === "assetReportMode") {
      assetUi.reportMode = e.target.value || "all";
      if (assetUi.selectedId) renderAssetDetail(assetUi.selectedId);
    } else if (e.target?.id === "assetReportFrom") {
      assetUi.reportFrom = e.target.value || "";
      if (assetUi.selectedId) renderAssetDetail(assetUi.selectedId);
    } else if (e.target?.id === "assetReportTo") {
      assetUi.reportTo = e.target.value || "";
      if (assetUi.selectedId) renderAssetDetail(assetUi.selectedId);
    }
  });

  // Seed selects (rebuilt again whenever forms open)
  populateAssetTypeSelect("car");
  populateAssetTxTypeSelect("maintenance");
  const curSel = document.getElementById("assetFormCurrency");
  if (curSel && !curSel.options.length) {
    curSel.innerHTML = assetCurrencyOptionsHtml("AED");
  }
}
