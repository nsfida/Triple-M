/* Depreciation Assets — independent module under Asset Management.
   ADDITIVE ONLY. Does not touch app_assets / app_asset_transactions / 01-assets.js logic. */
(function () {
  "use strict";

  const DEP_TYPE_OPTIONS = [
    { id: "car", label: "Car" },
    { id: "truck", label: "Truck" },
    { id: "machine", label: "Machine" },
    { id: "building", label: "Building" },
    { id: "office_equipment", label: "Office equipment" },
    { id: "electronics", label: "Electronics" },
    { id: "furniture", label: "Furniture" },
    { id: "other", label: "Other" }
  ];

  const DEP_STATUS_OPTIONS = [
    { id: "active", label: "Active" },
    { id: "sold", label: "Sold" },
    { id: "disposed", label: "Disposed" }
  ];

  const depUi = {
    module: "owned", // owned | depreciation
    search: "",
    status: "all",
    type: "all",
    assets: [],
    historyByAsset: {},
    loaded: false,
    loading: false,
    selectedId: null,
    formMode: "create",
    editingId: null,
    disposeId: null,
    reportKind: "monthly",
    bound: false
  };

  function esc(v) {
    if (typeof escapeHtml === "function") return escapeHtml(v);
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function moneyPlain(amount, currency) {
    if (typeof moneyText === "function") return moneyText(amount, currency);
    if (typeof money === "function") {
      const html = money(amount, currency);
      return String(html || "").replace(/<[^>]+>/g, "");
    }
    const n = Number(amount || 0);
    const code = String(currency || "").trim();
    return `${code ? code + " " : ""}${n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`.trim();
  }

  function moneyHtml(amount, currency) {
    if (typeof money === "function") return money(amount, currency);
    return esc(moneyPlain(amount, currency));
  }

  function canUse() {
    try {
      if (typeof canUseAssetsFeature === "function") return !!canUseAssetsFeature();
      return !isGuestMode() && !!userHasPermission("assets", "view");
    } catch (_) {
      return false;
    }
  }

  function assertAccess() {
    if (typeof assertAssetsFeatureAccess === "function") {
      assertAssetsFeatureAccess();
      return;
    }
    if (typeof isGuestMode === "function" && isGuestMode()) {
      throw new Error("Depreciation Assets is not available in guest mode.");
    }
    if (typeof userHasPermission === "function" && !userHasPermission("assets", "view")) {
      throw new Error("Asset Management is not enabled for your account.");
    }
  }

  function openModal(id) {
    if (typeof openAssetsModal === "function") {
      openAssetsModal(id);
      return;
    }
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove("hide");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeDepModal(id) {
    if (typeof closeModal === "function") closeModal(id);
    else {
      const modal = document.getElementById(id);
      if (!modal) return;
      modal.classList.add("hide");
      modal.setAttribute("aria-hidden", "true");
    }
  }

  function typeLabel(id) {
    const hit = DEP_TYPE_OPTIONS.find(o => o.id === String(id || ""));
    return hit ? hit.label : String(id || "Other");
  }

  function statusLabel(id) {
    const hit = DEP_STATUS_OPTIONS.find(o => o.id === String(id || "active"));
    return hit ? hit.label : String(id || "Active");
  }

  function parseDateOnly(s) {
    const raw = String(s || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const [y, m, d] = raw.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function toDateKey(d) {
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function monthStart(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  function addMonths(d, n) {
    return new Date(d.getFullYear(), d.getMonth() + n, 1);
  }

  function roundMoney(n) {
    return Math.round((Number(n) || 0) * 1e8) / 1e8;
  }

  /** Straight-line schedule through asOf (inclusive month). */
  function computeStraightLine(input, asOfDate) {
    const purchasePrice = Math.max(0, Number(input.purchase_price) || 0);
    const salvage = Math.max(0, Number(input.salvage_value) || 0);
    const lifeYears = Math.max(0.01, Number(input.useful_life_years) || 1);
    const purchase = parseDateOnly(input.purchase_date);
    const disposal = parseDateOnly(input.disposal_date);
    const status = String(input.status || "active");
    const asOf = asOfDate instanceof Date ? asOfDate : new Date();

    const totalMonths = Math.max(1, Math.round(lifeYears * 12));
    const depreciable = Math.max(0, purchasePrice - Math.min(salvage, purchasePrice));
    const monthly = totalMonths > 0 ? roundMoney(depreciable / totalMonths) : 0;
    const annual = roundMoney(monthly * 12);

    const periods = [];
    if (!purchase || depreciable <= 0 || monthly <= 0) {
      return {
        monthly_depreciation: monthly,
        annual_depreciation: annual,
        accumulated_depreciation: 0,
        current_book_value: purchasePrice,
        remaining_months: totalMonths,
        remaining_label: formatRemaining(totalMonths),
        total_months: totalMonths,
        periods
      };
    }

    let endCap = monthStart(asOf);
    if ((status === "sold" || status === "disposed") && disposal) {
      const dispMonth = monthStart(disposal);
      if (dispMonth < endCap) endCap = dispMonth;
    }
    const lastUseful = addMonths(monthStart(purchase), totalMonths - 1);
    if (lastUseful < endCap) endCap = lastUseful;

    let book = purchasePrice;
    let accumulated = 0;
    let cursor = monthStart(purchase);
    let posted = 0;

    while (cursor <= endCap && posted < totalMonths && book > salvage + 1e-12) {
      const before = book;
      const room = Math.max(0, book - salvage);
      const amount = roundMoney(Math.min(monthly, room));
      if (amount <= 0) break;
      book = roundMoney(before - amount);
      accumulated = roundMoney(accumulated + amount);
      periods.push({
        period_date: toDateKey(cursor),
        depreciation_amount: amount,
        book_value_before: before,
        book_value_after: book
      });
      posted += 1;
      cursor = addMonths(cursor, 1);
    }

    const remaining = Math.max(0, totalMonths - posted);
    return {
      monthly_depreciation: monthly,
      annual_depreciation: annual,
      accumulated_depreciation: accumulated,
      current_book_value: book,
      remaining_months: remaining,
      remaining_label: formatRemaining(remaining),
      total_months: totalMonths,
      periods
    };
  }

  function formatRemaining(months) {
    const m = Math.max(0, Number(months) || 0);
    if (m <= 0) return "Fully depreciated";
    const y = Math.floor(m / 12);
    const r = m % 12;
    if (y && r) return `${y}y ${r}m`;
    if (y) return `${y} year${y === 1 ? "" : "s"}`;
    return `${r} month${r === 1 ? "" : "s"}`;
  }

  function mapAssetRow(row) {
    const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
    return {
      id: row.id,
      owner_id: row.owner_id,
      name: row.name || "",
      description: row.description || "",
      asset_type: row.asset_type || "other",
      purchase_date: row.purchase_date,
      purchase_price: Number(row.purchase_price || 0),
      salvage_value: Number(row.salvage_value || 0),
      useful_life_years: Number(row.useful_life_years || 1),
      depreciation_method: row.depreciation_method || "straight_line",
      currency: String(row.currency || "AED").toUpperCase(),
      status: row.status || "active",
      disposal_date: row.disposal_date || null,
      disposal_notes: row.disposal_notes || "",
      monthly_depreciation: Number(row.monthly_depreciation || 0),
      annual_depreciation: Number(row.annual_depreciation || 0),
      accumulated_depreciation: Number(row.accumulated_depreciation || 0),
      current_book_value: Number(row.current_book_value || 0),
      meta,
      created_at: row.created_at,
      updated_at: row.updated_at,
      is_deleted: !!row.is_deleted
    };
  }

  function getById(id) {
    return (depUi.assets || []).find(a => a.id === id) || null;
  }

  function filteredAssets() {
    const q = String(depUi.search || "").trim().toLowerCase();
    const st = String(depUi.status || "all");
    const tp = String(depUi.type || "all");
    return (depUi.assets || []).filter(a => {
      if (st !== "all" && a.status !== st) return false;
      if (tp !== "all" && a.asset_type !== tp) return false;
      if (!q) return true;
      const blob = [a.name, typeLabel(a.asset_type), a.description, a.status].join(" ").toLowerCase();
      return blob.includes(q);
    });
  }

  function populateTypeSelect(selectEl, selected, includeAll) {
    if (!selectEl) return;
    const opts = [];
    if (includeAll) opts.push(`<option value="all">All types</option>`);
    DEP_TYPE_OPTIONS.forEach(o => {
      opts.push(`<option value="${esc(o.id)}">${esc(o.label)}</option>`);
    });
    selectEl.innerHTML = opts.join("");
    const wanted = String(selected || (includeAll ? "all" : "car"));
    if ([...selectEl.options].some(o => o.value === wanted)) selectEl.value = wanted;
  }

  function refreshTypeFilters() {
    const filter = document.getElementById("depAssetTypeFilter");
    if (filter) {
      const cur = filter.value || depUi.type || "all";
      populateTypeSelect(filter, cur, true);
    }
    populateTypeSelect(document.getElementById("depAssetReportType"), "all", true);
  }

  function setModule(module) {
    const next = module === "depreciation" ? "depreciation" : "owned";
    depUi.module = next;
    document.querySelectorAll(".assets-module-tab").forEach(btn => {
      const on = btn.getAttribute("data-assets-module") === next;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll("[data-assets-module-view]").forEach(view => {
      const on = view.getAttribute("data-assets-module-view") === next;
      view.classList.toggle("hide", !on);
    });
    if (next === "depreciation") {
      loadDepreciationAssetsFromDatabase().catch(err => console.error(err));
    }
  }

  async function loadDepreciationAssetsFromDatabase(options = {}) {
    const force = options.force === true;
    if (!canUse()) {
      depUi.assets = [];
      depUi.historyByAsset = {};
      depUi.loaded = true;
      renderAll();
      return;
    }
    if (depUi.loaded && !force) {
      renderAll();
      return;
    }
    if (depUi.loading && !force) return;
    if (!runtimeConfig?.supabaseUrl || !runtimeConfig?.supabaseKey) {
      depUi.assets = [];
      depUi.loaded = true;
      renderAll();
      return;
    }

    try {
      depUi.loading = true;
      const listEl = document.getElementById("depAssetsList");
      if (listEl && depUi.module === "depreciation") {
        listEl.innerHTML = '<div class="empty"><i class="fa-solid fa-spinner btn-loader"></i> Loading depreciation assets...</div>';
      }
      const ownerQ = typeof ownerIdQuery === "function" ? ownerIdQuery() : "";
      const rows = await supabase(
        `depreciation_assets?select=*&is_deleted=eq.false${ownerQ}&order=purchase_date.desc`
      );
      depUi.assets = (typeof filterRowsForCurrentUser === "function"
        ? filterRowsForCurrentUser(rows || [])
        : (rows || [])
      ).map(mapAssetRow);

      const hist = await supabase(
        `depreciation_history?select=*${ownerQ}&order=period_date.desc`
      );
      const histRows = typeof filterRowsForCurrentUser === "function"
        ? filterRowsForCurrentUser(hist || [])
        : (hist || []);
      const byAsset = {};
      histRows.forEach(h => {
        const aid = h.depreciation_asset_id;
        if (!byAsset[aid]) byAsset[aid] = [];
        byAsset[aid].push({
          id: h.id,
          depreciation_asset_id: aid,
          period_date: h.period_date,
          depreciation_amount: Number(h.depreciation_amount || 0),
          book_value_before: Number(h.book_value_before || 0),
          book_value_after: Number(h.book_value_after || 0),
          notes: h.notes || "",
          created_at: h.created_at
        });
      });
      depUi.historyByAsset = byAsset;
      depUi.loaded = true;
      renderAll();
      if (depUi.selectedId) {
        const still = getById(depUi.selectedId);
        if (still) renderDetail(still.id);
        else {
          depUi.selectedId = null;
          closeDepModal("depAssetDetailModal");
        }
      }
    } catch (err) {
      console.error("Failed to load depreciation assets:", err);
      depUi.assets = [];
      depUi.historyByAsset = {};
      renderAll();
      if (force) alert("Failed to load depreciation assets: " + (err.message || err));
    } finally {
      depUi.loading = false;
    }
  }

  async function syncAssetSchedule(asset, { quiet } = {}) {
    const calc = computeStraightLine(asset, new Date());
    const ownerQ = typeof ownerIdQuery === "function" ? ownerIdQuery() : "";
    const patch = {
      monthly_depreciation: calc.monthly_depreciation,
      annual_depreciation: calc.annual_depreciation,
      accumulated_depreciation: calc.accumulated_depreciation,
      current_book_value: calc.current_book_value,
      updated_at: new Date().toISOString()
    };
    const changed =
      Math.abs(Number(asset.monthly_depreciation) - calc.monthly_depreciation) > 1e-8 ||
      Math.abs(Number(asset.accumulated_depreciation) - calc.accumulated_depreciation) > 1e-8 ||
      Math.abs(Number(asset.current_book_value) - calc.current_book_value) > 1e-8;

    if (changed) {
      await supabase(`depreciation_assets?id=eq.${encodeURIComponent(asset.id)}${ownerQ}`, {
        method: "PATCH",
        body: JSON.stringify(patch)
      });
      Object.assign(asset, patch);
    }

    const existing = await supabase(
      `depreciation_history?select=period_date&depreciation_asset_id=eq.${encodeURIComponent(asset.id)}${ownerQ}`
    );
    const have = new Set((existing || []).map(r => String(r.period_date).slice(0, 10)));
    const missing = calc.periods.filter(p => !have.has(p.period_date));
    if (missing.length) {
      const payload = missing.map(p => ({
        id: crypto.randomUUID(),
        depreciation_asset_id: asset.id,
        owner_id: typeof currentOwnerId === "function" ? currentOwnerId() : asset.owner_id,
        period_date: p.period_date,
        depreciation_amount: p.depreciation_amount,
        book_value_before: p.book_value_before,
        book_value_after: p.book_value_after,
        created_at: new Date().toISOString()
      }));
      // PostgREST accepts batch insert
      await supabase("depreciation_history", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    }
    if (!quiet) return calc;
    return calc;
  }

  function renderAll() {
    refreshTypeFilters();
    renderSummary();
    renderList();
  }

  function renderSummary() {
    const host = document.getElementById("depAssetsSummary");
    if (!host) return;
    if (!canUse()) {
      host.innerHTML = "";
      return;
    }
    const rows = depUi.assets || [];
    const byCur = {};
    rows.forEach(a => {
      const c = a.currency || "AED";
      const calc = computeStraightLine(a, new Date());
      if (!byCur[c]) byCur[c] = { count: 0, original: 0, accum: 0, book: 0 };
      byCur[c].count += 1;
      byCur[c].original += Number(a.purchase_price || 0);
      byCur[c].accum += Number(calc.accumulated_depreciation || 0);
      byCur[c].book += Number(calc.current_book_value || 0);
    });
    const focus =
      (typeof getPageCurrency === "function" && getPageCurrency()) ||
      Object.keys(byCur)[0] ||
      "AED";
    const t = byCur[focus] || { count: rows.length, original: 0, accum: 0, book: 0 };
    const totalCount = rows.length;
    host.innerHTML = `
      <div class="dep-summary-grid">
        <div class="dep-summary-card">
          <small>Total assets</small>
          <strong>${esc(String(totalCount))}</strong>
        </div>
        <div class="dep-summary-card">
          <small>Original value (${esc(focus)})</small>
          <strong>${moneyHtml(t.original, focus)}</strong>
        </div>
        <div class="dep-summary-card">
          <small>Accumulated dep. (${esc(focus)})</small>
          <strong>${moneyHtml(t.accum, focus)}</strong>
        </div>
        <div class="dep-summary-card">
          <small>Current value (${esc(focus)})</small>
          <strong>${moneyHtml(t.book, focus)}</strong>
        </div>
      </div>
      ${Object.keys(byCur).length > 1
        ? `<p class="help dep-summary-note">Summary amounts shown for ${esc(focus)}. Other currencies: ${esc(
            Object.keys(byCur).filter(c => c !== focus).join(", ")
          )}.</p>`
        : ""}`;
  }

  function renderList() {
    const listEl = document.getElementById("depAssetsList");
    if (!listEl) return;
    if (!canUse()) {
      listEl.innerHTML = `<div class="empty">Asset Management is not enabled for your account.</div>`;
      return;
    }
    const rows = filteredAssets();
    if (!rows.length) {
      listEl.innerHTML = `<div class="empty">No depreciation assets yet. Use <strong>Add depreciation asset</strong> to start straight-line tracking.</div>`;
      return;
    }
    const canEdit = typeof teamCanShowEdit === "function" ? teamCanShowEdit("entries") : true;
    const canDelete = typeof teamCanShowDelete === "function" ? teamCanShowDelete("entries") : true;
    listEl.innerHTML = rows.map(asset => {
      const calc = computeStraightLine(asset, new Date());
      return `
        <article class="asset-card dep-asset-card" data-dep-asset-id="${esc(asset.id)}">
          <div class="asset-card-top">
            <button type="button" class="asset-card-main" data-dep-open="${esc(asset.id)}">
              <h4 class="asset-card-title">${esc(asset.name)}</h4>
              <div class="asset-card-meta">
                <span>${esc(typeLabel(asset.asset_type))}</span>
                <span class="asset-status asset-status-${esc(asset.status)}">${esc(statusLabel(asset.status))}</span>
                <span class="asset-card-owned">Bought ${esc(asset.purchase_date || "—")}</span>
              </div>
            </button>
            <div class="asset-card-aside">
              <div class="asset-card-net">
                <small>Book</small>
                <strong>${moneyHtml(calc.current_book_value, asset.currency)}</strong>
              </div>
              <div class="menu-wrap asset-card-menu">
                <button type="button" class="icon-btn ghost tiny asset-card-menu-btn" data-dep-menu-trigger="${esc(asset.id)}" title="Actions" aria-label="Actions" aria-haspopup="menu" aria-expanded="false">
                  <i class="fa-solid fa-ellipsis-vertical" aria-hidden="true"></i>
                </button>
                <div class="menu-dropdown asset-card-dropdown" data-dep-menu-panel="${esc(asset.id)}" role="menu" hidden>
                  <button type="button" class="menu-item" role="menuitem" data-dep-card-action="open" data-dep-id="${esc(asset.id)}"><i class="fa-solid fa-eye"></i> Open</button>
                  ${canEdit ? `<button type="button" class="menu-item" role="menuitem" data-dep-card-action="edit" data-dep-id="${esc(asset.id)}"><i class="fa-solid fa-pen"></i> Edit</button>` : ""}
                  ${canEdit && asset.status === "active" ? `<button type="button" class="menu-item" role="menuitem" data-dep-card-action="dispose" data-dep-id="${esc(asset.id)}"><i class="fa-solid fa-handshake"></i> Sell / dispose</button>` : ""}
                  ${canDelete ? `<button type="button" class="menu-item danger" role="menuitem" data-dep-card-action="delete" data-dep-id="${esc(asset.id)}"><i class="fa-solid fa-trash"></i> Delete</button>` : ""}
                </div>
              </div>
            </div>
          </div>
          <button type="button" class="asset-card-stats" data-dep-open="${esc(asset.id)}">
            <span><em>Purchase</em> ${moneyHtml(asset.purchase_price, asset.currency)}</span>
            <span><em>Depreciated</em> ${moneyHtml(calc.accumulated_depreciation, asset.currency)}</span>
            <span><em>Monthly</em> ${moneyHtml(calc.monthly_depreciation, asset.currency)}</span>
            <span><em>Life left</em> ${esc(calc.remaining_label)}</span>
          </button>
        </article>`;
    }).join("");
  }

  function formInputs() {
    return {
      name: String(document.getElementById("depAssetFormName")?.value || "").trim(),
      asset_type: String(document.getElementById("depAssetFormType")?.value || "other"),
      currency: String(document.getElementById("depAssetFormCurrency")?.value || "AED").toUpperCase(),
      purchase_date: String(document.getElementById("depAssetFormPurchaseDate")?.value || "").trim(),
      purchase_price: Number(document.getElementById("depAssetFormPurchasePrice")?.value || 0),
      salvage_value: Number(document.getElementById("depAssetFormSalvage")?.value || 0),
      useful_life_years: Number(document.getElementById("depAssetFormLifeYears")?.value || 0),
      description: String(document.getElementById("depAssetFormDescription")?.value || "").trim(),
      depreciation_method: "straight_line",
      status: "active"
    };
  }

  function updateFormPreview() {
    const host = document.getElementById("depAssetFormPreview");
    if (!host) return;
    const input = formInputs();
    if (!(input.purchase_price >= 0) || !(input.useful_life_years > 0) || !input.purchase_date) {
      host.innerHTML = `<p class="help">Enter purchase price, salvage, useful life, and date to preview depreciation.</p>`;
      return;
    }
    if (input.salvage_value > input.purchase_price) {
      host.innerHTML = `<p class="help" style="color:var(--danger,#b91c1c)">Salvage value cannot exceed purchase price.</p>`;
      return;
    }
    const calc = computeStraightLine(input, new Date());
    const cur = input.currency;
    host.innerHTML = `
      <div class="dep-preview-grid">
        <div><small>Monthly</small><strong>${esc(moneyPlain(calc.monthly_depreciation, cur))}</strong></div>
        <div><small>Annual</small><strong>${esc(moneyPlain(calc.annual_depreciation, cur))}</strong></div>
        <div><small>Accumulated</small><strong>${esc(moneyPlain(calc.accumulated_depreciation, cur))}</strong></div>
        <div><small>Book value</small><strong>${esc(moneyPlain(calc.current_book_value, cur))}</strong></div>
        <div><small>Remaining life</small><strong>${esc(calc.remaining_label)}</strong></div>
      </div>`;
  }

  function fillForm(asset) {
    const isEdit = !!asset;
    depUi.formMode = isEdit ? "edit" : "create";
    depUi.editingId = asset?.id || null;
    const title = document.getElementById("depAssetFormTitle");
    if (title) title.textContent = isEdit ? "Edit depreciation asset" : "Add depreciation asset";
    populateTypeSelect(document.getElementById("depAssetFormType"), asset?.asset_type || "car", false);
    document.getElementById("depAssetFormName").value = asset?.name || "";
    document.getElementById("depAssetFormCurrency").value = asset?.currency || "AED";
    document.getElementById("depAssetFormPurchaseDate").value =
      asset?.purchase_date || new Date().toISOString().slice(0, 10);
    document.getElementById("depAssetFormPurchasePrice").value = asset ? String(asset.purchase_price ?? "") : "";
    document.getElementById("depAssetFormSalvage").value = asset ? String(asset.salvage_value ?? "") : "0";
    document.getElementById("depAssetFormLifeYears").value = asset ? String(asset.useful_life_years ?? "") : "5";
    document.getElementById("depAssetFormDescription").value = asset?.description || "";
    updateFormPreview();
  }

  function openForm(assetId) {
    try { assertAccess(); } catch (err) { alert(err.message); return; }
    fillForm(assetId ? getById(assetId) : null);
    openModal("depAssetFormModal");
    document.getElementById("depAssetFormName")?.focus();
  }

  async function saveForm() {
    try {
      assertAccess();
      if (typeof teamCanShowEdit === "function" && !teamCanShowEdit("entries")) {
        throw new Error("You do not have permission to edit entries.");
      }
    } catch (err) {
      alert(err.message);
      return;
    }
    const input = formInputs();
    if (!input.name) { alert("Please enter an asset name."); return; }
    if (!input.purchase_date) { alert("Please enter a purchase date."); return; }
    if (!(input.purchase_price >= 0)) { alert("Purchase price must be zero or greater."); return; }
    if (!(input.salvage_value >= 0)) { alert("Salvage value must be zero or greater."); return; }
    if (input.salvage_value > input.purchase_price) {
      alert("Salvage value cannot exceed purchase price.");
      return;
    }
    if (!(input.useful_life_years > 0)) { alert("Useful life must be greater than zero."); return; }

    const existing = depUi.formMode === "edit" ? getById(depUi.editingId) : null;
    const calcInput = {
      ...input,
      status: existing?.status || "active",
      disposal_date: existing?.disposal_date || null
    };
    const calc = computeStraightLine(calcInput, new Date());
    const ownerQ = typeof ownerIdQuery === "function" ? ownerIdQuery() : "";
    const payload = {
      name: input.name,
      description: input.description || null,
      asset_type: input.asset_type,
      purchase_date: input.purchase_date,
      purchase_price: input.purchase_price,
      salvage_value: input.salvage_value,
      useful_life_years: input.useful_life_years,
      depreciation_method: "straight_line",
      currency: input.currency,
      monthly_depreciation: calc.monthly_depreciation,
      annual_depreciation: calc.annual_depreciation,
      accumulated_depreciation: calc.accumulated_depreciation,
      current_book_value: calc.current_book_value,
      owner_id: typeof currentOwnerId === "function" ? currentOwnerId() : null,
      updated_at: new Date().toISOString()
    };

    const btn = document.getElementById("depAssetFormSaveBtn");
    if (btn) btn.disabled = true;
    try {
      let assetId = depUi.editingId;
      if (depUi.formMode === "edit" && assetId) {
        await supabase(`depreciation_assets?id=eq.${encodeURIComponent(assetId)}${ownerQ}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
        // Rebuild history when basis changes
        await supabase(
          `depreciation_history?depreciation_asset_id=eq.${encodeURIComponent(assetId)}${ownerQ}`,
          { method: "DELETE" }
        );
      } else {
        assetId = crypto.randomUUID();
        payload.id = assetId;
        payload.status = "active";
        payload.is_deleted = false;
        payload.created_at = new Date().toISOString();
        await supabase("depreciation_assets", { method: "POST", body: JSON.stringify(payload) });
      }

      const histPayload = calc.periods.map(p => ({
        id: crypto.randomUUID(),
        depreciation_asset_id: assetId,
        owner_id: payload.owner_id,
        period_date: p.period_date,
        depreciation_amount: p.depreciation_amount,
        book_value_before: p.book_value_before,
        book_value_after: p.book_value_after,
        created_at: new Date().toISOString()
      }));
      if (histPayload.length) {
        await supabase("depreciation_history", {
          method: "POST",
          body: JSON.stringify(histPayload)
        });
      }

      closeDepModal("depAssetFormModal");
      depUi.loaded = false;
      await loadDepreciationAssetsFromDatabase({ force: true });
      depUi.selectedId = assetId;
      openDetail(assetId);
    } catch (err) {
      console.error(err);
      alert("Failed to save depreciation asset: " + (err.message || err));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function openDetail(assetId) {
    try { assertAccess(); } catch (err) { alert(err.message); return; }
    const asset = getById(assetId);
    if (!asset) return;
    depUi.selectedId = assetId;
    openModal("depAssetDetailModal");
    renderDetail(assetId);
    // Catch up posted periods if calendar advanced since last save
    if (asset.status === "active") {
      try {
        const before = (depUi.historyByAsset[assetId] || []).length;
        await syncAssetSchedule(asset, { quiet: true });
        const ownerQ = typeof ownerIdQuery === "function" ? ownerIdQuery() : "";
        const hist = await supabase(
          `depreciation_history?select=*&depreciation_asset_id=eq.${encodeURIComponent(assetId)}${ownerQ}&order=period_date.asc`
        );
        depUi.historyByAsset[assetId] = (hist || []).map(h => ({
          id: h.id,
          depreciation_asset_id: assetId,
          period_date: h.period_date,
          depreciation_amount: Number(h.depreciation_amount || 0),
          book_value_before: Number(h.book_value_before || 0),
          book_value_after: Number(h.book_value_after || 0),
          notes: h.notes || "",
          created_at: h.created_at
        }));
        const calc = computeStraightLine(asset, new Date());
        asset.monthly_depreciation = calc.monthly_depreciation;
        asset.annual_depreciation = calc.annual_depreciation;
        asset.accumulated_depreciation = calc.accumulated_depreciation;
        asset.current_book_value = calc.current_book_value;
        if ((depUi.historyByAsset[assetId] || []).length !== before) {
          renderDetail(assetId);
          renderSummary();
          renderList();
        }
      } catch (err) {
        console.warn("Depreciation catch-up skipped:", err);
      }
    }
  }

  function renderDetail(assetId) {
    const asset = getById(assetId);
    const root = document.getElementById("depAssetDetailBody");
    const title = document.getElementById("depAssetDetailTitle");
    const sub = document.getElementById("depAssetDetailSubtitle");
    if (!asset || !root) return;
    if (title) title.textContent = asset.name;
    if (sub) sub.textContent = `${typeLabel(asset.asset_type)} · ${statusLabel(asset.status)}`;
    const calc = computeStraightLine(asset, new Date());
    const hist = (depUi.historyByAsset[assetId] || []).slice().sort((a, b) =>
      String(a.period_date).localeCompare(String(b.period_date))
    );
    const canEdit = typeof teamCanShowEdit === "function" ? teamCanShowEdit("entries") : true;
    const canDelete = typeof teamCanShowDelete === "function" ? teamCanShowDelete("entries") : true;
    const cur = asset.currency;

    root.innerHTML = `
      <div class="asset-detail-actions">
        ${canEdit ? `<button type="button" class="btn ghost tiny" data-dep-action="edit"><i class="fa-solid fa-pen"></i> Edit</button>` : ""}
        ${canEdit && asset.status === "active" ? `<button type="button" class="btn ghost tiny" data-dep-action="dispose"><i class="fa-solid fa-handshake"></i> Sell / dispose</button>` : ""}
        ${canDelete ? `<button type="button" class="btn ghost tiny" data-dep-action="delete"><i class="fa-solid fa-trash"></i> Delete</button>` : ""}
      </div>
      <div class="asset-kpi-grid dep-kpi-grid">
        <div class="asset-kpi"><small>Purchase price</small><strong>${moneyHtml(asset.purchase_price, cur)}</strong></div>
        <div class="asset-kpi"><small>Current book value</small><strong>${moneyHtml(asset.current_book_value ?? calc.current_book_value, cur)}</strong></div>
        <div class="asset-kpi"><small>Total depreciation</small><strong>${moneyHtml(asset.accumulated_depreciation ?? calc.accumulated_depreciation, cur)}</strong></div>
        <div class="asset-kpi"><small>Monthly depreciation</small><strong>${moneyHtml(asset.monthly_depreciation ?? calc.monthly_depreciation, cur)}</strong></div>
        <div class="asset-kpi"><small>Remaining useful life</small><strong>${esc(calc.remaining_label)}</strong></div>
        <div class="asset-kpi"><small>Purchase date</small><strong>${esc(asset.purchase_date || "—")}</strong></div>
      </div>
      <dl class="asset-detail-dl">
        <div><dt>Method</dt><dd>Straight-line</dd></div>
        <div><dt>Salvage value</dt><dd>${moneyHtml(asset.salvage_value, cur)}</dd></div>
        <div><dt>Useful life</dt><dd>${esc(String(asset.useful_life_years))} years (${esc(String(calc.total_months))} months)</dd></div>
        <div><dt>Annual depreciation</dt><dd>${moneyHtml(asset.annual_depreciation ?? calc.annual_depreciation, cur)}</dd></div>
        <div><dt>Status</dt><dd>${esc(statusLabel(asset.status))}</dd></div>
        ${asset.disposal_date ? `<div><dt>Disposal date</dt><dd>${esc(asset.disposal_date)}</dd></div>` : ""}
        <div><dt>Description</dt><dd>${esc(asset.description || "—")}</dd></div>
      </dl>
      <h4 class="dep-history-title">Depreciation history</h4>
      ${hist.length
        ? `<div class="dep-history-table-wrap"><table class="dep-history-table">
            <thead><tr><th>Period</th><th>Amount</th><th>Book before</th><th>Book after</th></tr></thead>
            <tbody>
              ${hist.map(h => `<tr>
                <td>${esc(String(h.period_date).slice(0, 10))}</td>
                <td>${esc(moneyPlain(h.depreciation_amount, cur))}</td>
                <td>${esc(moneyPlain(h.book_value_before, cur))}</td>
                <td>${esc(moneyPlain(h.book_value_after, cur))}</td>
              </tr>`).join("")}
            </tbody>
          </table></div>`
        : `<div class="empty">No depreciation posted yet.</div>`}
    `;
  }

  function openDispose(assetId) {
    try { assertAccess(); } catch (err) { alert(err.message); return; }
    const asset = getById(assetId || depUi.selectedId);
    if (!asset) return;
    depUi.disposeId = asset.id;
    document.getElementById("depAssetDisposeStatus").value =
      asset.status === "active" ? "sold" : asset.status;
    document.getElementById("depAssetDisposeDate").value =
      asset.disposal_date || new Date().toISOString().slice(0, 10);
    document.getElementById("depAssetDisposeNotes").value = asset.disposal_notes || "";
    openModal("depAssetDisposeModal");
  }

  async function saveDispose() {
    try {
      assertAccess();
      if (typeof teamCanShowEdit === "function" && !teamCanShowEdit("entries")) {
        throw new Error("You do not have permission to edit entries.");
      }
    } catch (err) {
      alert(err.message);
      return;
    }
    const asset = getById(depUi.disposeId);
    if (!asset) return;
    const status = String(document.getElementById("depAssetDisposeStatus")?.value || "sold");
    const disposal_date = String(document.getElementById("depAssetDisposeDate")?.value || "").trim();
    const disposal_notes = String(document.getElementById("depAssetDisposeNotes")?.value || "").trim();
    if (status !== "active" && !disposal_date) {
      alert("Please enter a sale / disposal date.");
      return;
    }
    const next = {
      ...asset,
      status,
      disposal_date: status === "active" ? null : disposal_date,
      disposal_notes: disposal_notes || null
    };
    const calc = computeStraightLine(next, new Date());
    const ownerQ = typeof ownerIdQuery === "function" ? ownerIdQuery() : "";
    const btn = document.getElementById("depAssetDisposeSaveBtn");
    if (btn) btn.disabled = true;
    try {
      await supabase(`depreciation_assets?id=eq.${encodeURIComponent(asset.id)}${ownerQ}`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          disposal_date: next.disposal_date,
          disposal_notes: next.disposal_notes,
          monthly_depreciation: calc.monthly_depreciation,
          annual_depreciation: calc.annual_depreciation,
          accumulated_depreciation: calc.accumulated_depreciation,
          current_book_value: calc.current_book_value,
          updated_at: new Date().toISOString()
        })
      });
      // Rebuild history capped at disposal
      await supabase(
        `depreciation_history?depreciation_asset_id=eq.${encodeURIComponent(asset.id)}${ownerQ}`,
        { method: "DELETE" }
      );
      if (calc.periods.length) {
        await supabase("depreciation_history", {
          method: "POST",
          body: JSON.stringify(calc.periods.map(p => ({
            id: crypto.randomUUID(),
            depreciation_asset_id: asset.id,
            owner_id: typeof currentOwnerId === "function" ? currentOwnerId() : asset.owner_id,
            period_date: p.period_date,
            depreciation_amount: p.depreciation_amount,
            book_value_before: p.book_value_before,
            book_value_after: p.book_value_after,
            created_at: new Date().toISOString()
          })))
        });
      }
      closeDepModal("depAssetDisposeModal");
      depUi.loaded = false;
      await loadDepreciationAssetsFromDatabase({ force: true });
      if (depUi.selectedId === asset.id) renderDetail(asset.id);
    } catch (err) {
      console.error(err);
      alert("Failed to update status: " + (err.message || err));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function deleteAsset(assetId) {
    try {
      assertAccess();
      if (typeof teamCanShowDelete === "function" && !teamCanShowDelete("entries")) {
        throw new Error("You do not have permission to delete entries.");
      }
    } catch (err) {
      alert(err.message);
      return;
    }
    const asset = getById(assetId);
    if (!asset) return;
    if (!(await appConfirmDelete(`Delete depreciation asset “${asset.name}”? This cannot be undone.`, { title: "Delete depreciation asset?", confirmLabel: "Delete asset", note: "This destructive action cannot be undone." }))) return;
    const ownerQ = typeof ownerIdQuery === "function" ? ownerIdQuery() : "";
    try {
      await supabase(`depreciation_assets?id=eq.${encodeURIComponent(assetId)}${ownerQ}`, {
        method: "PATCH",
        body: JSON.stringify({ is_deleted: true, updated_at: new Date().toISOString() })
      });
      closeDepModal("depAssetDetailModal");
      depUi.selectedId = null;
      depUi.loaded = false;
      await loadDepreciationAssetsFromDatabase({ force: true });
    } catch (err) {
      console.error(err);
      alert("Failed to delete: " + (err.message || err));
    }
  }

  function openReportModal(kind) {
    try { assertAccess(); } catch (err) { alert(err.message); return; }
    depUi.reportKind = kind || "monthly";
    const titles = {
      monthly: "Monthly depreciation report",
      yearly: "Yearly depreciation report",
      valuation: "Asset valuation report",
      disposal: "Asset disposal report"
    };
    document.getElementById("depAssetReportTitle").textContent = titles[depUi.reportKind] || "Report";
    document.getElementById("depAssetReportKind").value = depUi.reportKind;
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    if (depUi.reportKind === "monthly") {
      document.getElementById("depAssetReportFrom").value = `${y}-${m}-01`;
      document.getElementById("depAssetReportTo").value = toDateKey(new Date(y, now.getMonth() + 1, 0));
    } else if (depUi.reportKind === "yearly") {
      document.getElementById("depAssetReportFrom").value = `${y}-01-01`;
      document.getElementById("depAssetReportTo").value = `${y}-12-31`;
    } else {
      document.getElementById("depAssetReportFrom").value = "";
      document.getElementById("depAssetReportTo").value = toDateKey(now);
    }
    populateTypeSelect(document.getElementById("depAssetReportType"), "all", true);
    document.getElementById("depAssetReportStatus").value =
      depUi.reportKind === "disposal" ? "all" : "all";
    openModal("depAssetReportModal");
  }

  function reportFilterAssets() {
    const from = String(document.getElementById("depAssetReportFrom")?.value || "").trim();
    const to = String(document.getElementById("depAssetReportTo")?.value || "").trim();
    const type = String(document.getElementById("depAssetReportType")?.value || "all");
    const status = String(document.getElementById("depAssetReportStatus")?.value || "all");
    const kind = String(document.getElementById("depAssetReportKind")?.value || depUi.reportKind);
    let rows = (depUi.assets || []).slice();
    if (type !== "all") rows = rows.filter(a => a.asset_type === type);
    if (status !== "all") rows = rows.filter(a => a.status === status);
    if (kind === "disposal") {
      rows = rows.filter(a => a.status === "sold" || a.status === "disposed");
      if (from) rows = rows.filter(a => !a.disposal_date || a.disposal_date >= from);
      if (to) rows = rows.filter(a => !a.disposal_date || a.disposal_date <= to);
    }
    return { rows, from, to, type, status, kind };
  }

  function historyInRange(assetId, from, to) {
    return (depUi.historyByAsset[assetId] || []).filter(h => {
      const d = String(h.period_date).slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }

  async function runReportPdf() {
    if (!window.jspdf) {
      alert("PDF library loading. Please try again in a moment.");
      return;
    }
    if (!depUi.loaded) {
      await loadDepreciationAssetsFromDatabase({ force: true });
    }
    const { rows, from, to, kind } = reportFilterAssets();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    if (typeof loadCustomFontsForPdf === "function") {
      try { await loadCustomFontsForPdf(doc); } catch (_) {}
    }
    const titles = {
      monthly: "Monthly Depreciation Report",
      yearly: "Yearly Depreciation Report",
      valuation: "Asset Valuation Report",
      disposal: "Asset Disposal Report"
    };
    const title = titles[kind] || "Depreciation Report";
    doc.setFontSize(14);
    doc.text(title, 14, 18);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(
      `Generated ${new Date().toLocaleString()} · Filters: ${from || "…"} → ${to || "…"}${kind === "disposal" ? " (disposal dates)" : ""}`,
      14,
      26
    );
    doc.setTextColor(0);

    let body = [];
    let head = [];

    if (kind === "valuation") {
      head = [["Asset", "Type", "Status", "Purchase", "Book value", "Accum. dep.", "Monthly"]];
      body = rows.map(a => [
        a.name,
        typeLabel(a.asset_type),
        statusLabel(a.status),
        moneyPlain(a.purchase_price, a.currency),
        moneyPlain(a.current_book_value, a.currency),
        moneyPlain(a.accumulated_depreciation, a.currency),
        moneyPlain(a.monthly_depreciation, a.currency)
      ]);
    } else if (kind === "disposal") {
      head = [["Asset", "Type", "Status", "Disposal date", "Book value", "Accum. dep.", "Notes"]];
      body = rows.map(a => [
        a.name,
        typeLabel(a.asset_type),
        statusLabel(a.status),
        a.disposal_date || "—",
        moneyPlain(a.current_book_value, a.currency),
        moneyPlain(a.accumulated_depreciation, a.currency),
        (a.disposal_notes || "—").slice(0, 40)
      ]);
    } else if (kind === "yearly") {
      head = [["Asset", "Currency", "Year", "Depreciation", "Periods"]];
      rows.forEach(a => {
        const hist = historyInRange(a.id, from, to);
        const byYear = {};
        hist.forEach(h => {
          const y = String(h.period_date).slice(0, 4);
          if (!byYear[y]) byYear[y] = { amount: 0, n: 0 };
          byYear[y].amount += Number(h.depreciation_amount || 0);
          byYear[y].n += 1;
        });
        Object.keys(byYear).sort().forEach(y => {
          body.push([
            a.name,
            a.currency,
            y,
            moneyPlain(byYear[y].amount, a.currency),
            String(byYear[y].n)
          ]);
        });
      });
    } else {
      // monthly
      head = [["Asset", "Period", "Amount", "Book before", "Book after", "Currency"]];
      rows.forEach(a => {
        historyInRange(a.id, from, to)
          .sort((x, y) => String(x.period_date).localeCompare(String(y.period_date)))
          .forEach(h => {
            body.push([
              a.name,
              String(h.period_date).slice(0, 10),
              moneyPlain(h.depreciation_amount, a.currency),
              moneyPlain(h.book_value_before, a.currency),
              moneyPlain(h.book_value_after, a.currency),
              a.currency
            ]);
          });
      });
    }

    if (!body.length) {
      doc.setFontSize(11);
      doc.text("No rows match the selected filters.", 14, 40);
    } else if (typeof doc.autoTable === "function") {
      doc.autoTable({
        startY: 32,
        head: [head],
        body,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [30, 41, 59] }
      });
    } else {
      let y = 36;
      body.slice(0, 40).forEach(row => {
        doc.text(row.join(" | ").slice(0, 95), 14, y);
        y += 6;
      });
    }

    doc.save(`Depreciation_${kind}_${new Date().toISOString().slice(0, 10)}.pdf`);
    closeDepModal("depAssetReportModal");
  }

  function closeDepMenus() {
    document.querySelectorAll("[data-dep-menu-panel].open").forEach(panel => {
      panel.classList.remove("open");
      panel.hidden = true;
      panel.style.top = "";
      panel.style.left = "";
    });
    document.querySelectorAll("[data-dep-menu-trigger][aria-expanded='true']").forEach(btn => {
      btn.setAttribute("aria-expanded", "false");
    });
    document.querySelectorAll(".dep-asset-card .asset-card-menu.open").forEach(wrap => wrap.classList.remove("open"));
  }

  function openDepCardMenu(trigger) {
    const id = trigger?.getAttribute("data-dep-menu-trigger");
    const wrap = trigger?.closest(".asset-card-menu");
    const panel = wrap?.querySelector(`[data-dep-menu-panel="${id}"]`);
    if (!panel || !trigger) return;
    const alreadyOpen = panel.classList.contains("open");
    closeDepMenus();
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

  function bindUI() {
    if (depUi.bound) return;
    depUi.bound = true;

    document.querySelectorAll(".assets-module-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        setModule(btn.getAttribute("data-assets-module"));
      });
    });

    document.getElementById("openAddDepAssetBtn")?.addEventListener("click", () => openForm(null));
    document.getElementById("depAssetFormSaveBtn")?.addEventListener("click", () => saveForm());
    document.getElementById("depAssetDisposeSaveBtn")?.addEventListener("click", () => saveDispose());
    document.getElementById("depAssetReportRunBtn")?.addEventListener("click", () => {
      runReportPdf().catch(err => alert(err?.message || err));
    });

    ["depAssetFormPurchasePrice", "depAssetFormSalvage", "depAssetFormLifeYears", "depAssetFormPurchaseDate", "depAssetFormCurrency"]
      .forEach(id => {
        document.getElementById(id)?.addEventListener("input", updateFormPreview);
        document.getElementById(id)?.addEventListener("change", updateFormPreview);
      });

    document.getElementById("searchDepAssets")?.addEventListener("input", e => {
      depUi.search = e.target.value || "";
      renderList();
    });
    document.getElementById("depAssetTypeFilter")?.addEventListener("change", e => {
      depUi.type = e.target.value || "all";
      renderList();
    });
    document.querySelectorAll('input[name="depAssetStatusFilter"]').forEach(r => {
      r.addEventListener("change", e => {
        depUi.status = e.target.value || "all";
        renderList();
      });
    });

    document.querySelectorAll("[data-dep-report]").forEach(btn => {
      btn.addEventListener("click", () => {
        openReportModal(btn.getAttribute("data-dep-report"));
      });
    });

    document.getElementById("depAssetsList")?.addEventListener("click", e => {
      const menuTrigger = e.target.closest("[data-dep-menu-trigger]");
      if (menuTrigger) {
        e.preventDefault();
        e.stopPropagation();
        openDepCardMenu(menuTrigger);
        return;
      }
      const actionBtn = e.target.closest("[data-dep-card-action]");
      if (actionBtn) {
        e.preventDefault();
        e.stopPropagation();
        const id = actionBtn.getAttribute("data-dep-id");
        const action = actionBtn.getAttribute("data-dep-card-action");
        closeDepMenus();
        if (action === "open") openDetail(id);
        else if (action === "edit") openForm(id);
        else if (action === "dispose") openDispose(id);
        else if (action === "delete") deleteAsset(id);
        return;
      }
      const openBtn = e.target.closest("[data-dep-open]");
      if (openBtn) openDetail(openBtn.getAttribute("data-dep-open"));
    });

    document.getElementById("depAssetDetailBody")?.addEventListener("click", e => {
      const btn = e.target.closest("[data-dep-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-dep-action");
      if (action === "edit") openForm(depUi.selectedId);
      else if (action === "dispose") openDispose(depUi.selectedId);
      else if (action === "delete") deleteAsset(depUi.selectedId);
    });

    document.addEventListener("click", e => {
      if (!e.target.closest(".dep-asset-card .asset-card-menu")) closeDepMenus();
    });

    populateTypeSelect(document.getElementById("depAssetFormType"), "car", false);
    populateTypeSelect(document.getElementById("depAssetTypeFilter"), "all", true);
  }

  window.loadDepreciationAssetsFromDatabase = loadDepreciationAssetsFromDatabase;
  window.depreciationAssetsBindUI = bindUI;
  window.renderDepreciationAssetsList = renderList;

  document.addEventListener("DOMContentLoaded", bindUI);
  if (document.readyState !== "loading") bindUI();
})();
