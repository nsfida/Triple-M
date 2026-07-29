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
  const hit = ASSET_TYPE_OPTIONS.find(o => o.id === id);
  if (id === "other" && other) return String(other);
  return hit ? hit.label : id;
}

function assetStatusLabel(status) {
  const hit = ASSET_STATUS_OPTIONS.find(o => o.id === String(status || "active"));
  return hit ? hit.label : String(status || "active");
}

function assetTxTypeLabel(type) {
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

function summarizeAssetById(assetId, options = {}) {
  const asset = getAssetById(assetId);
  if (!asset) return null;
  return assetMath().summarizeAsset?.(asset, getAssetTransactions(assetId), options) || null;
}

function mapAssetRow(row) {
  return {
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
}

function mapAssetTxRow(row) {
  return {
    id: row.id,
    asset_id: row.asset_id,
    owner_id: row.owner_id,
    tx_type: row.tx_type,
    amount: Number(row.amount || 0),
    tx_date: row.tx_date,
    notes: row.notes || "",
    meta: row.meta || {},
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
    const [assetRows, txRows] = await Promise.all([
      supabase(`app_assets?select=*&is_deleted=eq.false${ownerIdQuery()}&order=purchase_date.desc`),
      supabase(`app_asset_transactions?select=*&is_deleted=eq.false${ownerIdQuery()}&order=tx_date.desc`)
    ]);
    state.assets = filterRowsForCurrentUser(assetRows || []).map(mapAssetRow);
    state.assetTransactions = filterRowsForCurrentUser(txRows || []).map(mapAssetTxRow);
    state.assetsLoaded = true;
    renderAssetsList();
    if (assetUi.selectedId) {
      const still = getAssetById(assetUi.selectedId);
      if (still) renderAssetDetail(still.id);
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
  listEl.innerHTML = rows.map(asset => {
    const sum = assetMath().summarizeAsset?.(asset, getAssetTransactions(asset.id)) || {};
    const net = Number(sum.net || 0);
    const netTone = net > 0 ? "profit" : net < 0 ? "loss" : "flat";
    const own = sum.ownership || {};
    return `
      <article class="asset-card" data-asset-id="${escapeHtml(asset.id)}" role="button" tabindex="0">
        <div class="asset-card-top">
          <div>
            <h4 class="asset-card-title">${escapeHtml(asset.name)}</h4>
            <div class="asset-card-meta">
              <span>${escapeHtml(assetTypeLabel(asset.asset_type, asset.asset_type_other))}</span>
              <span class="asset-status asset-status-${escapeHtml(asset.status)}">${escapeHtml(assetStatusLabel(asset.status))}</span>
            </div>
          </div>
          <div class="asset-card-net asset-net-${netTone}">
            <small>Net</small>
            <strong>${money(net, asset.currency)}</strong>
          </div>
        </div>
        <div class="asset-card-stats">
          <span><em>Purchased</em> ${escapeHtml(asset.purchase_date || "—")}</span>
          <span><em>Owned</em> ${escapeHtml(own.label || "—")}${own.ongoing ? " (to date)" : ""}</span>
          <span><em>Spent</em> ${money(sum.totalExpenses || 0, asset.currency)}</span>
          <span><em>Revenue</em> ${money(sum.revenue || 0, asset.currency)}</span>
        </div>
      </article>`;
  }).join("");
}

function fillAssetForm(asset) {
  const isEdit = !!asset;
  assetUi.formMode = isEdit ? "edit" : "create";
  assetUi.editingAssetId = asset?.id || null;
  const title = document.getElementById("assetFormTitle");
  if (title) title.textContent = isEdit ? "Edit Asset" : "Add Asset";
  document.getElementById("assetFormName").value = asset?.name || "";
  document.getElementById("assetFormType").value = asset?.asset_type || "car";
  document.getElementById("assetFormTypeOther").value = asset?.asset_type_other || "";
  document.getElementById("assetFormDescription").value = asset?.description || "";
  document.getElementById("assetFormCurrency").value = asset?.currency || "AED";
  document.getElementById("assetFormPurchaseDate").value = asset?.purchase_date || new Date().toISOString().slice(0, 10);
  document.getElementById("assetFormPurchasePrice").value = asset ? String(asset.purchase_price ?? "") : "";
  toggleAssetTypeOther();
}

function toggleAssetTypeOther() {
  const type = document.getElementById("assetFormType")?.value;
  const wrap = document.getElementById("assetFormTypeOtherWrap");
  if (wrap) wrap.classList.toggle("hide", type !== "other");
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
  const asset_type = String(document.getElementById("assetFormType")?.value || "other");
  const asset_type_other = String(document.getElementById("assetFormTypeOther")?.value || "").trim();
  const description = String(document.getElementById("assetFormDescription")?.value || "").trim();
  const currency = String(document.getElementById("assetFormCurrency")?.value || "AED").toUpperCase();
  const purchase_date = String(document.getElementById("assetFormPurchaseDate")?.value || "").trim();
  const purchase_price = Number(document.getElementById("assetFormPurchasePrice")?.value || 0);
  if (!name) { alert("Please enter an asset name."); return; }
  if (!purchase_date) { alert("Please enter a purchase date."); return; }
  if (!(purchase_price >= 0)) { alert("Purchase price must be zero or greater."); return; }
  if (asset_type === "other" && !asset_type_other) {
    alert("Please describe the asset type for Other.");
    return;
  }

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

function openAssetDetail(assetId) {
  try { assertAssetsFeatureAccess(); } catch (err) { alert(err.message); return; }
  const asset = getAssetById(assetId);
  if (!asset) return;
  assetUi.selectedId = assetId;
  openAssetsModal("assetDetailModal");
  renderAssetDetail(assetId);
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
        <button type="button" class="btn ghost tiny" data-asset-action="pdf" title="Download PDF"><i class="fa-solid fa-file-pdf" aria-hidden="true"></i> PDF</button>
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
      <div class="asset-kpi"><small>Total invested / spent</small><strong>${money(sum.totalExpenses || 0, asset.currency)}</strong></div>
      <div class="asset-kpi"><small>Total revenue</small><strong>${money(sum.revenue || 0, asset.currency)}</strong></div>
      <div class="asset-kpi"><small>Sale proceeds</small><strong>${money(sum.salePrice || 0, asset.currency)}</strong></div>
      <div class="asset-kpi"><small>Total income</small><strong>${money(sum.totalIncome || 0, asset.currency)}</strong></div>
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
          Total expenses = purchase + maintenance + repairs + operating + other + additional investment + sale costs.<br/>
          Total income = revenue + sale proceeds. Net = income − expenses. Purchase price is counted once.
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
            <div>
              <strong>${escapeHtml(assetTxTypeLabel(tx.tx_type))}</strong>
              <span class="asset-tx-date">${escapeHtml(tx.tx_date || "")}</span>
              ${tx.notes ? `<p class="asset-tx-notes">${escapeHtml(tx.notes)}</p>` : ""}
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
}

function assetChartBaseOptions({ text, muted, legend = true, maxTicksX } = {}) {
  const compact = typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches;
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
        grid: { color: "rgba(148,163,184,.18)" }
      },
      y: {
        beginAtZero: true,
        ticks: { color: muted, font: tickFont, maxTicksLimit: compact ? 5 : 8 },
        grid: { color: "rgba(148,163,184,.18)" }
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
  const text = getComputedStyle(document.documentElement).getPropertyValue("--text").trim() || "#1f2937";
  const muted = getComputedStyle(document.documentElement).getPropertyValue("--muted").trim() || "#6b7280";
  const compact = typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches;

  createAssetChart(document.getElementById("assetChartIncomeExpense"), {
    type: "bar",
    data: {
      labels: ["Expenses", "Revenue", "Sale", "Net"],
      datasets: [{
        label: asset.currency,
        data: [sum.totalExpenses || 0, sum.revenue || 0, sum.salePrice || 0, sum.net || 0],
        backgroundColor: ["#ef4444", "#0ea5e9", "#22c55e", (sum.net || 0) >= 0 ? "#16a34a" : "#dc2626"]
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
        backgroundColor: ["#f59e0b", "#ef4444", "#8b5cf6", "#64748b", "#0ea5e9", "#ec4899", "#334155"]
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
        { label: "Revenue", data: months.map(m => m.revenue), borderColor: "#0ea5e9", tension: 0.25, pointRadius: compact ? 2 : 3 },
        { label: "Expenses", data: months.map(m => m.expense), borderColor: "#ef4444", tension: 0.25, pointRadius: compact ? 2 : 3 }
      ]
    },
    options: assetChartBaseOptions({ text, muted, maxTicksX: compact ? 4 : 8 })
  });

  createAssetChart(document.getElementById("assetChartYearly"), {
    type: "bar",
    data: {
      labels: years.map(y => y.year),
      datasets: [
        { label: "Revenue", data: years.map(y => y.revenue), backgroundColor: "#0ea5e9" },
        { label: "Expenses", data: years.map(y => y.expense), backgroundColor: "#ef4444" }
      ]
    },
    options: assetChartBaseOptions({ text, muted })
  });

  createAssetChart(document.getElementById("assetChartCumulative"), {
    type: "line",
    data: {
      labels: cum.map(p => p.date),
      datasets: [
        { label: "Cumulative revenue", data: cum.map(p => p.revenue), borderColor: "#0284c7", fill: false, tension: 0.2, pointRadius: compact ? 0 : 2 },
        { label: "Cumulative expense", data: cum.map(p => p.expense), borderColor: "#b91c1c", fill: false, tension: 0.2, pointRadius: compact ? 0 : 2 }
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
  document.getElementById("assetTxType").value = tx?.tx_type || "maintenance";
  document.getElementById("assetTxAmount").value = tx ? String(tx.amount) : "";
  document.getElementById("assetTxDate").value = tx?.tx_date || new Date().toISOString().slice(0, 10);
  document.getElementById("assetTxNotes").value = tx?.notes || "";
  openAssetsModal("assetTxModal");
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
  const tx_type = String(document.getElementById("assetTxType")?.value || "");
  const amount = Number(document.getElementById("assetTxAmount")?.value || 0);
  const tx_date = String(document.getElementById("assetTxDate")?.value || "").trim();
  const notes = String(document.getElementById("assetTxNotes")?.value || "").trim();
  if (!ASSET_TX_TYPE_OPTIONS.some(o => o.id === tx_type)) {
    alert("Select a valid transaction type.");
    return;
  }
  if (!(amount > 0)) { alert("Amount must be greater than zero."); return; }
  if (!tx_date) { alert("Please enter a date."); return; }

  const payload = {
    asset_id: assetId,
    owner_id: currentOwnerId(),
    tx_type,
    amount,
    tx_date,
    notes: notes || null,
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
    closeModal("assetTxModal");
    await loadAssetsFromDatabase({ force: true });
  } catch (err) {
    console.error(err);
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
  if (!confirm("Delete this transaction?")) return;
  try {
    await supabase(`app_asset_transactions?id=eq.${encodeURIComponent(txId)}${ownerIdQuery()}`, {
      method: "PATCH",
      body: JSON.stringify({ is_deleted: true, updated_at: new Date().toISOString() })
    });
    await loadAssetsFromDatabase({ force: true });
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
  if (!confirm(`Delete asset "${asset.name}" and its transactions?`)) return;
  try {
    await supabase(`app_asset_transactions?asset_id=eq.${encodeURIComponent(assetId)}${ownerIdQuery()}`, {
      method: "PATCH",
      body: JSON.stringify({ is_deleted: true, updated_at: new Date().toISOString() })
    }).catch(() => {});
    await supabase(`app_assets?id=eq.${encodeURIComponent(assetId)}${ownerIdQuery()}`, {
      method: "PATCH",
      body: JSON.stringify({ is_deleted: true, updated_at: new Date().toISOString() })
    });
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
    const txs = getAssetTransactions(asset.id);
    const sum = assetMath().summarizeAsset?.(asset, txs) || {};
    return { asset, txs, sum };
  }).sort((a, b) => String(a.asset.name || "").localeCompare(String(b.asset.name || ""), undefined, { sensitivity: "base" }));

  const totals = rows.reduce((acc, row) => {
    acc.purchase += Number(row.sum.purchasePrice || 0);
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
    purchase: 0, expenses: 0, revenue: 0, sale: 0, income: 0, net: 0,
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
    // Fixed coords under the icon (modal overflow would clip absolute menus)
    const rect = trigger.getBoundingClientRect();
    const panelWidth = Math.max(panel.offsetWidth || 176, 176);
    let left = rect.right - panelWidth;
    if (left < 10) left = 10;
    if (left + panelWidth > window.innerWidth - 10) {
      left = Math.max(10, window.innerWidth - panelWidth - 10);
    }
    panel.style.top = `${Math.round(rect.bottom + 6)}px`;
    panel.style.left = `${Math.round(left)}px`;
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
  const mText = (n) => escapeHtml(moneyText(n || 0, cur));
  const metricsHtml = [
    sectionDetailsMetricHtml("Assets", escapeHtml(String(data.count)), "primary"),
    sectionDetailsMetricHtml("Active", escapeHtml(String(t.status.active || 0)), "success"),
    sectionDetailsMetricHtml("Sold", escapeHtml(String(t.status.sold || 0))),
    sectionDetailsMetricHtml("Disposed", escapeHtml(String(t.status.disposed || 0))),
    sectionDetailsMetricHtml("Total invested", mText(t.expenses)),
    sectionDetailsMetricHtml("Total revenue", mText(t.revenue), "success"),
    sectionDetailsMetricHtml("Sale proceeds", mText(t.sale)),
    sectionDetailsMetricHtml("Total income", mText(t.income), "success"),
    sectionDetailsMetricHtml("Net P/L", mText(t.net), t.net >= 0 ? "success" : "danger"),
    sectionDetailsMetricHtml("Purchase total", mText(t.purchase))
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
      <td class="num">${mText(s.totalExpenses)}</td>
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
              <th>Asset</th><th>Status</th><th>Purchased</th><th>Owned</th><th>Spent</th><th>Revenue</th><th>Net</th>
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
      labels: ["Invested", "Revenue", "Sale", "Income", "Net"],
      datasets: [{
        data: [t.expenses, t.revenue, t.sale, t.income, t.net],
        backgroundColor: [colors.danger, colors.sky, colors.success, colors.primary, t.net >= 0 ? colors.success : colors.danger],
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
    const card = e.target.closest("[data-asset-id]");
    if (!card) return;
    openAssetDetail(card.dataset.assetId);
  });
  document.getElementById("assetsList")?.addEventListener("keydown", e => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const card = e.target.closest("[data-asset-id]");
    if (!card) return;
    e.preventDefault();
    openAssetDetail(card.dataset.assetId);
  });

  document.getElementById("assetDetailBody")?.addEventListener("click", e => {
    const actionBtn = e.target.closest("[data-asset-action]");
    if (actionBtn) {
      const action = actionBtn.dataset.assetAction;
      if (action === "pdf") {
        if (typeof downloadSingleAssetPDF === "function") {
          downloadSingleAssetPDF(assetUi.selectedId).catch(err => alert(err?.message || err));
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

  // Populate static selects once
  const typeSel = document.getElementById("assetFormType");
  if (typeSel && !typeSel.options.length) {
    typeSel.innerHTML = ASSET_TYPE_OPTIONS.map(o =>
      `<option value="${escapeHtml(o.id)}">${escapeHtml(o.label)}</option>`
    ).join("");
  }
  const curSel = document.getElementById("assetFormCurrency");
  if (curSel && !curSel.options.length) {
    curSel.innerHTML = assetCurrencyOptionsHtml("AED");
  }
  const txType = document.getElementById("assetTxType");
  if (txType && !txType.options.length) {
    txType.innerHTML = ASSET_TX_TYPE_OPTIONS.map(o =>
      `<option value="${escapeHtml(o.id)}">${escapeHtml(o.label)}</option>`
    ).join("");
  }
}
