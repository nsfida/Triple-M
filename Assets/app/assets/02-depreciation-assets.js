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
    usageByAsset: {},
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
    const purchase = parseDateOnly(input.in_service_date || input.purchase_date);
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

  function computeDiminishingBalance(input, asOfDate) {
    const purchasePrice = Math.max(0, Number(input.purchase_price) || 0);
    const salvage = Math.max(0, Math.min(Number(input.salvage_value) || 0, purchasePrice));
    const lifeYears = Math.max(.01, Number(input.useful_life_years) || 1);
    const rate = Math.max(.01, Math.min(100, Number(input.declining_rate) || Math.min(100, 200 / lifeYears)));
    const start = parseDateOnly(input.in_service_date || input.purchase_date);
    const disposal = parseDateOnly(input.disposal_date);
    const asOf = asOfDate instanceof Date ? asOfDate : new Date();
    const totalMonths = Math.max(1, Math.round(lifeYears * 12));
    const monthlyRate = rate / 100 / 12;
    const periods=[];
    if (!start || purchasePrice <= salvage) return {monthly_depreciation:0,annual_depreciation:0,accumulated_depreciation:0,current_book_value:purchasePrice,remaining_months:totalMonths,remaining_label:formatRemaining(totalMonths),total_months:totalMonths,periods,rate};
    let endCap=monthStart(asOf); if ((input.status==='sold'||input.status==='disposed')&&disposal&&monthStart(disposal)<endCap) endCap=monthStart(disposal);
    const lastUseful=addMonths(monthStart(start),totalMonths-1); if(lastUseful<endCap)endCap=lastUseful;
    let cursor=monthStart(start),book=purchasePrice,accum=0,posted=0;
    while(cursor<=endCap&&posted<totalMonths&&book>salvage+1e-12){const before=book;const room=Math.max(0,book-salvage);const isFinalUsefulPeriod=posted===totalMonths-1;const amount=roundMoney(isFinalUsefulPeriod?room:Math.min(room,before*monthlyRate));if(amount<=0)break;book=roundMoney(before-amount);accum=roundMoney(accum+amount);periods.push({period_date:toDateKey(cursor),depreciation_amount:amount,book_value_before:before,book_value_after:book});cursor=addMonths(cursor,1);posted++;}
    const currentMonthly=periods.length?periods[periods.length-1].depreciation_amount:roundMoney(Math.min(purchasePrice-salvage,purchasePrice*monthlyRate));
    return {monthly_depreciation:currentMonthly,annual_depreciation:roundMoney(currentMonthly*12),accumulated_depreciation:accum,current_book_value:book,remaining_months:Math.max(0,totalMonths-posted),remaining_label:formatRemaining(Math.max(0,totalMonths-posted)),total_months:totalMonths,periods,rate};
  }

  function computeUnitsOfProduction(input, usageEntries = [], asOfDate = new Date()) {
    const purchasePrice=Math.max(0,Number(input.purchase_price)||0); const salvage=Math.max(0,Math.min(Number(input.salvage_value)||0,purchasePrice));
    const capacity=Math.max(0,Number(input.units_capacity)||0); const perUnit=capacity>0?roundMoney((purchasePrice-salvage)/capacity):0;
    const asOfKey=toDateKey(asOfDate instanceof Date ? asOfDate : new Date());
    const disposalKey=(input.status==='sold'||input.status==='disposed')?String(input.disposal_date||'').slice(0,10):'';
    const endKey=disposalKey && disposalKey < asOfKey ? disposalKey : asOfKey;
    const sorted=(usageEntries||[]).filter(e=>!endKey||String(e.usage_date||'').slice(0,10)<=endKey).slice().sort((a,b)=>String(a.usage_date).localeCompare(String(b.usage_date)));
    let book=purchasePrice,accum=0,used=0; const periods=[];
    for(const entry of sorted){const units=Math.max(0,Number(entry.units)||0);if(!units)continue;const before=book;const room=Math.max(0,book-salvage);const amount=roundMoney(Math.min(room,units*perUnit));book=roundMoney(before-amount);accum=roundMoney(accum+amount);used+=units;periods.push({period_date:String(entry.usage_date).slice(0,10),depreciation_amount:amount,book_value_before:before,book_value_after:book,units});if(book<=salvage+1e-12)break;}
    const last=periods.length?periods[periods.length-1].depreciation_amount:0;
    return {monthly_depreciation:last,annual_depreciation:0,accumulated_depreciation:accum,current_book_value:book,remaining_months:0,remaining_label:capacity?`${Math.max(0,capacity-used).toLocaleString()} units remaining`:'Set production capacity',total_months:0,periods,per_unit:perUnit,units_used:used,units_remaining:Math.max(0,capacity-used)};
  }

  function computeDepreciation(input, asOfDate = new Date()) {
    const method=String(input.depreciation_method||'straight_line');
    if(method==='diminishing_balance') return computeDiminishingBalance(input,asOfDate);
    if(method==='units_of_production') return computeUnitsOfProduction(input, depUi.usageByAsset[input.id] || input.usage_entries || [], asOfDate);
    return computeStraightLine(input,asOfDate);
  }

  function methodLabel(method){return ({straight_line:'Straight-line',diminishing_balance:'Diminishing balance',units_of_production:'Units of production'})[String(method||'straight_line')]||'Straight-line';}

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
      in_service_date: row.in_service_date || row.purchase_date || null,
      declining_rate: row.declining_rate == null ? null : Number(row.declining_rate),
      units_capacity: row.units_capacity == null ? null : Number(row.units_capacity),
      last_review_date: row.last_review_date || null,
      disposal_proceeds: row.disposal_proceeds == null ? null : Number(row.disposal_proceeds),
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

  function pendingOfflineDepreciationAssets() {
    if (typeof getOfflineTableRows !== "function") return [];
    return getOfflineTableRows("depreciation_assets").map(row => ({ ...mapAssetRow(row), _syncStatus: "pending" }));
  }

  function pendingOfflineDepreciationHistory() {
    if (typeof getOfflineTableRows !== "function") return [];
    return getOfflineTableRows("depreciation_history").map(row => ({ ...row, _syncStatus: "pending" }));
  }

  function pendingOfflineDepreciationUsage() {
    if (typeof getOfflineTableRows !== "function") return [];
    return getOfflineTableRows("depreciation_usage_entries").map(row => ({ ...row, _syncStatus: "pending" }));
  }

  function usageRowsByAsset(rows) {
    return (rows || []).reduce((out, row) => {
      const aid = row?.depreciation_asset_id;
      if (!aid) return out;
      if (!out[aid]) out[aid] = [];
      out[aid].push(row);
      return out;
    }, {});
  }

  function mergePendingById(serverRows, pendingRows) {
    const pending = Array.isArray(pendingRows) ? pendingRows : [];
    if (!pending.length) return Array.isArray(serverRows) ? serverRows : [];
    const ids = new Set(pending.map(row => String(row.id || "")));
    return pending.concat((Array.isArray(serverRows) ? serverRows : []).filter(row => !ids.has(String(row?.id || ""))));
  }

  async function loadDepreciationAssetsFromDatabase(options = {}) {
    const force = options.force === true;
    if (!canUse()) {
      depUi.assets = pendingOfflineDepreciationAssets();
      depUi.historyByAsset = pendingOfflineDepreciationHistory().reduce((out, row) => {
        const aid = row.depreciation_asset_id;
        if (!out[aid]) out[aid] = [];
        out[aid].push(row);
        return out;
      }, {});
      depUi.usageByAsset = usageRowsByAsset(pendingOfflineDepreciationUsage());
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
      depUi.assets = pendingOfflineDepreciationAssets();
      const pendingHistory = pendingOfflineDepreciationHistory();
      depUi.historyByAsset = pendingHistory.reduce((out, row) => {
        const aid = row.depreciation_asset_id;
        if (!out[aid]) out[aid] = [];
        out[aid].push(row);
        return out;
      }, {});
      depUi.usageByAsset = usageRowsByAsset(pendingOfflineDepreciationUsage());
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
      depUi.assets = mergePendingById(
        (typeof filterRowsForCurrentUser === "function" ? filterRowsForCurrentUser(rows || []) : (rows || [])).map(mapAssetRow),
        pendingOfflineDepreciationAssets()
      );

      const hist = await supabase(
        `depreciation_history?select=*${ownerQ}&order=period_date.desc`
      );
      const histRows = mergePendingById(
        typeof filterRowsForCurrentUser === "function" ? filterRowsForCurrentUser(hist || []) : (hist || []),
        pendingOfflineDepreciationHistory()
      );
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
      try {
        const usage = await supabase(`depreciation_usage_entries?select=*${ownerQ}&order=usage_date.asc`);
        const usageRows = mergePendingById(
          typeof filterRowsForCurrentUser === "function" ? filterRowsForCurrentUser(usage || []) : (usage || []),
          pendingOfflineDepreciationUsage()
        );
        depUi.usageByAsset = usageRowsByAsset(usageRows);
      } catch (usageError) {
        console.warn("Depreciation usage entries unavailable until migration 145 is deployed.", usageError);
        depUi.usageByAsset = usageRowsByAsset(pendingOfflineDepreciationUsage());
      }
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
      depUi.assets = pendingOfflineDepreciationAssets();
      depUi.historyByAsset = pendingOfflineDepreciationHistory().reduce((out, row) => {
        const aid = row.depreciation_asset_id;
        if (!out[aid]) out[aid] = [];
        out[aid].push(row);
        return out;
      }, {});
      depUi.usageByAsset = usageRowsByAsset(pendingOfflineDepreciationUsage());
      depUi.loaded = true;
      renderAll();
      if (force) alert("Failed to load depreciation assets: " + (err.message || err));
    } finally {
      depUi.loading = false;
    }
  }

  async function syncAssetSchedule(asset, { quiet } = {}) {
    const calc = computeDepreciation(asset, new Date());
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

    // Usage-based depreciation is driven by immutable usage entries.  Do not mirror it
    // into the month-keyed history table because multiple usage events may occur on the
    // same day/month and historical rows must never be silently overwritten.
    if (String(asset.depreciation_method || "straight_line") !== "units_of_production") {
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
        await supabase("depreciation_history", {
          method: "POST",
          body: JSON.stringify(payload)
        });
      }
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
      const calc = computeDepreciation(a, new Date());
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
    const hasPendingLocalAssets = (depUi.assets || []).some(asset => asset?._syncStatus === "pending" || (asset?.id && typeof hasPendingOfflineEntity === "function" && hasPendingOfflineEntity(asset.id)));
    if (!canUse() && !hasPendingLocalAssets) {
      listEl.innerHTML = `<div class="empty">Asset Management is not enabled for your account.</div>`;
      return;
    }
    const rows = filteredAssets();
    if (!rows.length) {
      listEl.innerHTML = `<div class="empty">No depreciation assets yet. Use <strong>Add depreciation asset</strong> to start depreciation tracking.</div>`;
      return;
    }
    const canEdit = typeof teamCanShowEdit === "function" ? teamCanShowEdit("entries") : true;
    const canDelete = typeof teamCanShowDelete === "function" ? teamCanShowDelete("entries") : true;
    listEl.innerHTML = rows.map(asset => {
      const calc = computeDepreciation(asset, new Date());
      return `
        <article class="asset-card dep-asset-card" data-dep-asset-id="${esc(asset.id)}">
          <div class="asset-card-top">
            <button type="button" class="asset-card-main" data-dep-open="${esc(asset.id)}">
              <h4 class="asset-card-title">${esc(asset.name)}</h4>
              <div class="asset-card-meta">
                <span>${esc(typeLabel(asset.asset_type))}</span>
                <span class="asset-status asset-status-${esc(asset.status)}">${esc(statusLabel(asset.status))}</span>
                <span class="asset-card-owned">${esc(methodLabel(asset.depreciation_method))}</span>
                <span class="asset-card-owned">In service ${esc(asset.in_service_date || asset.purchase_date || "—")}</span>
                ${typeof offlinePendingBadgeHtml === "function" ? offlinePendingBadgeHtml(asset.id) : ""}
              </div>
            </button>
            <div class="asset-card-aside">
              <div class="asset-card-net">
                <small>Book</small>
                <strong>${moneyHtml(calc.current_book_value, asset.currency)}</strong>
              </div>
              ${typeof offlineSyncButtonHtml === "function" ? offlineSyncButtonHtml(asset.id) : ""}
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
      in_service_date: String(document.getElementById("depAssetFormInServiceDate")?.value || "").trim(),
      depreciation_method: String(document.getElementById("depAssetFormMethod")?.value || "straight_line"),
      declining_rate: Number(document.getElementById("depAssetFormDecliningRate")?.value || 0) || null,
      units_capacity: Number(document.getElementById("depAssetFormUnitsCapacity")?.value || 0) || null,
      last_review_date: String(document.getElementById("depAssetFormLastReviewDate")?.value || "").trim() || null,
      description: String(document.getElementById("depAssetFormDescription")?.value || "").trim(),
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
    const calc = computeDepreciation(input, new Date());
    const cur = input.currency;
    host.innerHTML = `
      <div class="dep-preview-grid">
        <div><small>Monthly</small><strong>${moneyHtml(calc.monthly_depreciation, cur)}</strong></div>
        <div><small>Annual</small><strong>${moneyHtml(calc.annual_depreciation, cur)}</strong></div>
        <div><small>Accumulated</small><strong>${moneyHtml(calc.accumulated_depreciation, cur)}</strong></div>
        <div><small>Book value</small><strong>${moneyHtml(calc.current_book_value, cur)}</strong></div>
        <div><small>Remaining life</small><strong>${esc(calc.remaining_label)}</strong></div>
      </div>`;
  }

  function updateDepMethodFields(){
    const method=String(document.getElementById("depAssetFormMethod")?.value||"straight_line");
    document.getElementById("depDecliningRateField")?.classList.toggle("hide",method!=="diminishing_balance");
    document.getElementById("depUnitsCapacityField")?.classList.toggle("hide",method!=="units_of_production");
    const hint=document.getElementById("depAssetMethodHint"); if(hint) hint.textContent = method==='straight_line'?'Equal depreciation over useful life.':method==='diminishing_balance'?'Higher depreciation in earlier periods using an annual percentage of carrying amount.':'Depreciation follows actual usage. Record production usage from the asset detail view.';
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
    document.getElementById("depAssetFormInServiceDate").value = asset?.in_service_date || asset?.purchase_date || new Date().toISOString().slice(0,10);
    document.getElementById("depAssetFormMethod").value = asset?.depreciation_method || "straight_line";
    document.getElementById("depAssetFormDecliningRate").value = asset?.declining_rate ? String(asset.declining_rate) : "";
    document.getElementById("depAssetFormUnitsCapacity").value = asset?.units_capacity ? String(asset.units_capacity) : "";
    document.getElementById("depAssetFormLastReviewDate").value = asset?.last_review_date || "";
    document.getElementById("depAssetFormDescription").value = asset?.description || "";
    updateDepMethodFields();
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
      if (typeof teamCanShowEdit === "function" && !teamCanShowEdit("entries")) throw new Error("You do not have permission to edit entries.");
    } catch (err) { alert(err.message); return; }
    const input = formInputs();
    if (!input.name) { alert("Please enter an asset name."); return; }
    if (!input.purchase_date) { alert("Please enter a purchase date."); return; }
    if (!input.in_service_date) { alert("Please enter the date the asset became available for use."); return; }
    if (input.in_service_date < input.purchase_date) { alert("In-service date cannot be earlier than the purchase date."); return; }
    if (!(input.purchase_price >= 0)) { alert("Purchase price must be zero or greater."); return; }
    if (!(input.salvage_value >= 0)) { alert("Salvage value must be zero or greater."); return; }
    if (input.salvage_value > input.purchase_price) { alert("Salvage value cannot exceed purchase price."); return; }
    if (!(input.useful_life_years > 0)) { alert("Useful life must be greater than zero."); return; }
    if (input.depreciation_method === "diminishing_balance" && !(input.declining_rate > 0 && input.declining_rate <= 100)) { alert("Enter an annual diminishing-balance rate between 0 and 100%."); return; }
    if (input.depreciation_method === "units_of_production" && !(input.units_capacity > 0)) { alert("Enter the asset's expected total production capacity."); return; }

    const existing = depUi.formMode === "edit" ? getById(depUi.editingId) : null;
    const creating = !existing;
    const calcInput = { ...input, id: existing?.id || null, status: existing?.status || "active", disposal_date: existing?.disposal_date || null };
    const calc = computeDepreciation(calcInput, new Date());
    const ownerQ = typeof ownerIdQuery === "function" ? ownerIdQuery() : "";
    const payload = {
      name: input.name,
      description: input.description || null,
      asset_type: input.asset_type,
      purchase_date: input.purchase_date,
      purchase_price: input.purchase_price,
      salvage_value: input.salvage_value,
      useful_life_years: input.useful_life_years,
      in_service_date: input.in_service_date || input.purchase_date,
      depreciation_method: input.depreciation_method,
      declining_rate: input.depreciation_method === "diminishing_balance" ? input.declining_rate : null,
      units_capacity: input.depreciation_method === "units_of_production" ? input.units_capacity : null,
      last_review_date: input.last_review_date,
      currency: input.currency,
      monthly_depreciation: calc.monthly_depreciation,
      annual_depreciation: calc.annual_depreciation,
      accumulated_depreciation: calc.accumulated_depreciation,
      current_book_value: calc.current_book_value,
      owner_id: typeof currentOwnerId === "function" ? currentOwnerId() : null,
      updated_at: new Date().toISOString()
    };
    let assetId = existing?.id || crypto.randomUUID();
    if (creating) {
      payload.id = assetId;
      payload.status = "active";
      payload.is_deleted = false;
      payload.created_at = new Date().toISOString();
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
    const keepLocal = () => {
      if (!creating || typeof queueOfflineTableInsert !== "function") return false;
      const steps = [{ table: "depreciation_assets", rows: [payload] }];
      if (histPayload.length) steps.push({ table: "depreciation_history", rows: histPayload });
      if (!queueOfflineTableInsert("depreciation_assets", payload, "Depreciation asset", { entityIds: [assetId], steps })) return false;
      depUi.assets = mergePendingById(depUi.assets, [{ ...mapAssetRow(payload), _syncStatus: "pending" }]);
      depUi.historyByAsset[assetId] = histPayload.map(row => ({ ...row, _syncStatus: "pending" }));
      depUi.loaded = true;
      depUi.selectedId = assetId;
      renderAll();
      return true;
    };

    const btn = document.getElementById("depAssetFormSaveBtn");
    if (btn) btn.disabled = true;
    try {
      if (creating && navigator.onLine === false) {
        if (!keepLocal()) throw new Error("The depreciation asset could not be stored locally.");
        closeDepModal("depAssetFormModal");
        if (typeof showEntryConfirmation === "function") showEntryConfirmation(`Depreciation asset “${input.name}” saved locally. Use Save to sync when internet returns.`, "success");
        return;
      }
      if (!creating) {
        await supabase(`depreciation_assets?id=eq.${encodeURIComponent(assetId)}${ownerQ}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await supabase("depreciation_assets", { method: "POST", body: JSON.stringify(payload) });
      }
      if (creating && histPayload.length && input.depreciation_method !== "units_of_production") await supabase("depreciation_history", { method: "POST", body: JSON.stringify(histPayload) });
      closeDepModal("depAssetFormModal");
      depUi.loaded = false;
      await loadDepreciationAssetsFromDatabase({ force: true });
      depUi.selectedId = assetId;
      openDetail(assetId);
      if (typeof showEntryConfirmation === "function") showEntryConfirmation(`Depreciation asset ${creating ? "created" : "updated"}: ${input.name}.`, "success");
    } catch (err) {
      if (creating && typeof isConnectivityFailure === "function" && isConnectivityFailure(err) && keepLocal()) {
        closeDepModal("depAssetFormModal");
        if (typeof showEntryConfirmation === "function") showEntryConfirmation(`Depreciation asset “${input.name}” saved locally. Use Save to sync when internet returns.`, "success");
        return;
      }
      console.error(err);
      if (typeof showEntryConfirmation === "function") showEntryConfirmation(`Depreciation asset failed: ${err.message || err}`, "error");
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
        const calc = computeDepreciation(asset, new Date());
        asset.monthly_depreciation = calc.monthly_depreciation;
        asset.annual_depreciation = calc.annual_depreciation;
        asset.accumulated_depreciation = calc.accumulated_depreciation;
        asset.current_book_value = calc.current_book_value;
        // Repaint unconditionally after schedule sync. Units-of-production updates
        // carrying value from usage entries without adding month-keyed history rows.
        renderDetail(assetId);
        renderSummary();
        renderList();
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
    const calc = computeDepreciation(asset, new Date());
    const hist = (calc.periods || []).slice().sort((a, b) =>
      String(a.period_date).localeCompare(String(b.period_date))
    );
    const canEdit = typeof teamCanShowEdit === "function" ? teamCanShowEdit("entries") : true;
    const canDelete = typeof teamCanShowDelete === "function" ? teamCanShowDelete("entries") : true;
    const cur = asset.currency;

    root.innerHTML = `
      <div class="asset-detail-actions">
        ${canEdit ? `<button type="button" class="btn ghost tiny" data-dep-action="edit"><i class="fa-solid fa-pen"></i> Edit</button>` : ""}
        ${canEdit && asset.status === "active" && asset.depreciation_method === "units_of_production" ? `<button type="button" class="btn primary tiny" data-dep-action="usage"><i class="fa-solid fa-gauge-high"></i> Record usage</button>` : ""}
        ${canEdit && asset.status === "active" ? `<button type="button" class="btn ghost tiny" data-dep-action="dispose"><i class="fa-solid fa-handshake"></i> Sell / dispose</button>` : ""}
        ${canDelete ? `<button type="button" class="btn ghost tiny" data-dep-action="delete"><i class="fa-solid fa-trash"></i> Delete</button>` : ""}
      </div>
      <div class="dep-accounting-basis">
        <span><i class="fa-solid fa-scale-balanced"></i> <strong>${esc(methodLabel(asset.depreciation_method))}</strong></span>
        <span>Cost ${moneyHtml(asset.purchase_price,cur)} · Residual ${moneyHtml(asset.salvage_value,cur)} · In service ${esc(asset.in_service_date || asset.purchase_date || "—")}</span>
        ${!asset.last_review_date || (Date.now() - new Date(asset.last_review_date).getTime()) > 365*86400000 ? `<span class="dep-review-due"><i class="fa-solid fa-triangle-exclamation"></i> Residual value and useful life review due</span>` : `<span><i class="fa-solid fa-circle-check"></i> Estimates reviewed ${esc(asset.last_review_date)}</span>`}
      </div>
      <div class="asset-kpi-grid dep-kpi-grid">
        <div class="asset-kpi"><small>Purchase price</small><strong>${moneyHtml(asset.purchase_price, cur)}</strong></div>
        <div class="asset-kpi"><small>Method</small><strong>${esc(methodLabel(asset.depreciation_method))}</strong></div>
        <div class="asset-kpi"><small>Current book value</small><strong>${moneyHtml(asset.current_book_value ?? calc.current_book_value, cur)}</strong></div>
        <div class="asset-kpi"><small>Total depreciation</small><strong>${moneyHtml(asset.accumulated_depreciation ?? calc.accumulated_depreciation, cur)}</strong></div>
        <div class="asset-kpi"><small>Monthly depreciation</small><strong>${moneyHtml(asset.monthly_depreciation ?? calc.monthly_depreciation, cur)}</strong></div>
        <div class="asset-kpi"><small>Remaining useful life</small><strong>${esc(calc.remaining_label)}</strong></div>
        <div class="asset-kpi"><small>Purchase date</small><strong>${esc(asset.purchase_date || "—")}</strong></div>
      </div>
      <dl class="asset-detail-dl">
        <div><dt>Method</dt><dd>${esc(methodLabel(asset.depreciation_method))}</dd></div>
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
                <td>${moneyHtml(h.depreciation_amount, cur)}</td>
                <td>${moneyHtml(h.book_value_before, cur)}</td>
                <td>${moneyHtml(h.book_value_after, cur)}</td>
              </tr>`).join("")}
            </tbody>
          </table></div>`
        : `<div class="empty">No depreciation posted yet.</div>`}
    `;
  }

  function openDepUsageModal(assetId){
    const asset=getById(assetId||depUi.selectedId); if(!asset||asset.depreciation_method!=="units_of_production")return;
    let modal=document.getElementById("depUsageModal"); if(!modal){modal=document.createElement("div");modal.id="depUsageModal";modal.className="modal hide";document.body.appendChild(modal);}
    const calc=computeDepreciation(asset,new Date());
    modal.innerHTML=`<div class="modal-backdrop" data-dep-usage-close></div><div class="modal-dialog compact-entry-dialog dep-usage-dialog" role="dialog" aria-modal="true"><div class="modal-head"><div><p class="dep-method-kicker"><i class="fa-solid fa-gauge-high"></i> Units of production</p><h3>Record asset usage</h3><p>${esc(asset.name)} · ${esc(calc.remaining_label)}</p></div><button class="icon-btn ghost" data-dep-usage-close type="button">×</button></div><div class="modal-body"><div class="asset-form-grid"><div class="form-group"><label class="form-label">Usage date</label><input id="depUsageDate" class="input" type="date" value="${toDateKey(new Date())}"></div><div class="form-group"><label class="form-label">Units used</label><input id="depUsageUnits" class="input" type="number" min="0.00000001" step="any" placeholder="0"></div><div class="form-group form-span-2"><label class="form-label">Notes</label><input id="depUsageNotes" class="input" maxlength="300" placeholder="Optional meter / production note"></div></div><div class="dep-usage-summary"><span>Depreciation per unit</span><strong>${moneyHtml(calc.per_unit||0,asset.currency)}</strong></div><div class="modal-footer"><button class="btn ghost" data-dep-usage-close type="button">Cancel</button><button class="btn primary" id="depUsageSave" type="button">Record usage</button></div></div></div>`;
    modal.querySelectorAll("[data-dep-usage-close]").forEach(el=>el.onclick=()=>closeDepModal("depUsageModal"));
    modal.querySelector("#depUsageSave").onclick = async () => {
      const usage_date = String(modal.querySelector("#depUsageDate")?.value || "");
      const units = Number(modal.querySelector("#depUsageUnits")?.value || 0);
      const notes = String(modal.querySelector("#depUsageNotes")?.value || "").trim();
      if (!usage_date || !(units > 0)) { alert("Enter a usage date and units greater than zero."); return; }
      if (usage_date > toDateKey(new Date())) { alert("Usage date cannot be in the future."); return; }
      if (Number.isFinite(calc.units_remaining) && units > calc.units_remaining + 1e-8) {
        alert(`Usage exceeds the remaining production capacity (${calc.units_remaining.toLocaleString()} units).`);
        return;
      }
      const usageRow = {
        id: crypto.randomUUID(),
        depreciation_asset_id: asset.id,
        owner_id: typeof currentOwnerId === "function" ? currentOwnerId() : asset.owner_id,
        usage_date,
        units,
        notes: notes || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      try {
        await supabase("depreciation_usage_entries", { method: "POST", body: JSON.stringify(usageRow) });
      } catch (err) {
        if (typeof isConnectivityFailure === "function" && isConnectivityFailure(err)
            && typeof queueOfflineTableInsert === "function"
            && queueOfflineTableInsert("depreciation_usage_entries", usageRow, "Depreciation usage", { entityIds: [usageRow.id] })) {
          if (!depUi.usageByAsset[asset.id]) depUi.usageByAsset[asset.id] = [];
          depUi.usageByAsset[asset.id].push({ ...usageRow, _syncStatus: "pending" });
          if (typeof showEntryConfirmation === "function") showEntryConfirmation("Usage saved locally and will sync when online.", "warning");
          closeDepModal("depUsageModal");
          renderDetail(asset.id);
          return;
        }
        alert("Could not record usage: " + (err.message || err));
        return;
      }
      closeDepModal("depUsageModal");
      depUi.loaded = false;
      await loadDepreciationAssetsFromDatabase({ force: true });
      renderDetail(asset.id);
    };
    modal.classList.remove("hide");modal.setAttribute("aria-hidden","false");document.body.style.overflow="hidden";
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
    const proceeds=document.getElementById("depAssetDisposeProceeds"); if(proceeds) proceeds.value = asset.disposal_proceeds == null ? "" : String(asset.disposal_proceeds);
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
    const disposal_proceeds_raw = String(document.getElementById("depAssetDisposeProceeds")?.value || "").trim();
    const disposal_proceeds = disposal_proceeds_raw === "" ? null : Number(disposal_proceeds_raw);
    if (disposal_proceeds != null && !(disposal_proceeds >= 0)) { alert("Disposal proceeds must be zero or greater."); return; }
    if (status !== "active" && !disposal_date) {
      alert("Please enter a sale / disposal date.");
      return;
    }
    const next = {
      ...asset,
      status,
      disposal_date: status === "active" ? null : disposal_date,
      disposal_notes: disposal_notes || null,
      disposal_proceeds
    };
    const calc = computeDepreciation(next, new Date());
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
          disposal_proceeds: next.disposal_proceeds,
          monthly_depreciation: calc.monthly_depreciation,
          annual_depreciation: calc.annual_depreciation,
          accumulated_depreciation: calc.accumulated_depreciation,
          current_book_value: calc.current_book_value,
          updated_at: new Date().toISOString()
        })
      });
      // Historical depreciation rows are preserved as an audit trail; reports use the current calculated schedule.
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
      if (typeof showEntryConfirmation === "function") showEntryConfirmation(`Depreciation asset deleted: ${asset.name}.`, "success");
    } catch (err) {
      console.error(err);
      if (typeof showEntryConfirmation === "function") showEntryConfirmation(`Depreciation asset delete failed: ${err?.message || err}`, "error");
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
    const asset = getById(assetId);
    if (!asset) return [];
    const asOf = parseDateOnly(to) || new Date();
    const calc = computeDepreciation(asset, asOf);
    return (calc.periods || []).filter(h => {
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
    const subtitle = `${from || "All dates"} → ${to || "Current"} · Generated ${new Date().toLocaleString()}`;
    const logoData = typeof getPdfLogo === "function" ? await getPdfLogo() : null;

    const useAssetPdfStyle =
      typeof drawAssetPdfPageChrome === "function" &&
      typeof drawAssetPdfTableChrome === "function" &&
      typeof assetPdfLayout === "function" &&
      typeof assetPdfHeaderHeight === "function" &&
      typeof drawAssetPdfHeadingBlock === "function" &&
      typeof drawAssetPdfKpiCards === "function" &&
      typeof drawAssetPdfSectionLabel === "function" &&
      typeof assetPdfTableTheme === "function";

    let reportStartY = 32;
    let assetLayout = null;
    if (useAssetPdfStyle) {
      drawAssetPdfPageChrome(doc, logoData, title, subtitle, { cover: true });
      assetLayout = assetPdfLayout(doc);
      let y = assetPdfHeaderHeight(true) + 10;
      y = drawAssetPdfHeadingBlock(doc, "Depreciation assets", title, assetLayout.leftX, y, assetLayout.width);
      const methodCount = new Set(rows.map(a => String(a.depreciation_method || "straight_line"))).size;
      const activeCount = rows.filter(a => a.status === "active").length;
      y = drawAssetPdfKpiCards(doc, [
        { label: "Assets", value: String(rows.length), accent: ASSET_PDF_THEME.teal },
        { label: "Active", value: String(activeCount), accent: ASSET_PDF_THEME.emerald },
        { label: "Methods", value: String(methodCount), accent: ASSET_PDF_THEME.amber },
        { label: "Report", value: (titles[kind] || kind).replace(" Report", ""), accent: ASSET_PDF_THEME.ink }
      ], assetLayout.leftX, y, assetLayout.width);
      reportStartY = drawAssetPdfSectionLabel(doc, "Report details", assetLayout.leftX, y);
    } else if (typeof drawPdfHeader === "function") {
      drawPdfHeader(doc, logoData, title, subtitle);
      reportStartY = typeof drawCompactPdfPartiesAndMeta === "function"
        ? drawCompactPdfPartiesAndMeta(doc, {
            rightLabel: "REPORT",
            partyName: "Depreciation Assets",
            meta: [
              { label: "Report", value: titles[kind] || kind },
              { label: "Assets", value: String(rows.length) },
              { label: "From", value: from || "All" },
              { label: "To", value: to || "Current" }
            ]
          }) + 5
        : 32;
    } else {
      doc.setFontSize(14);
      doc.text(title, 14, 18);
    }

    let body = [];
    let head = [];

    if (kind === "valuation") {
      head = [["Asset", "Method", "Status", "Cost", "Residual", "Book value", "Accum. dep."]];
      body = rows.map(a => {
        const c = computeDepreciation(a, new Date());
        return [
          a.name,
          methodLabel(a.depreciation_method),
          statusLabel(a.status),
          moneyPlain(a.purchase_price, a.currency),
          moneyPlain(a.salvage_value, a.currency),
          moneyPlain(c.current_book_value, a.currency),
          moneyPlain(c.accumulated_depreciation, a.currency)
        ];
      });
    } else if (kind === "disposal") {
      head = [["Asset", "Status", "Disposal date", "Book value", "Proceeds", "Gain / (Loss)", "Notes"]];
      body = rows.map(a => {
        const c = computeDepreciation(a, parseDateOnly(a.disposal_date) || new Date());
        const proceeds = Number(a.disposal_proceeds || 0);
        return [
          a.name,
          statusLabel(a.status),
          a.disposal_date || "—",
          moneyPlain(c.current_book_value, a.currency),
          a.disposal_proceeds == null ? "—" : moneyPlain(proceeds, a.currency),
          a.disposal_proceeds == null ? "—" : moneyPlain(proceeds - c.current_book_value, a.currency),
          (a.disposal_notes || "—").slice(0, 40)
        ];
      });
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
          body.push([a.name, a.currency, y, moneyPlain(byYear[y].amount, a.currency), String(byYear[y].n)]);
        });
      });
    } else {
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
      doc.setFontSize(10);
      doc.setTextColor(102, 112, 133);
      doc.text("No rows match the selected filters.", useAssetPdfStyle ? assetLayout.leftX : 14, reportStartY + 3);
      if (useAssetPdfStyle) {
        if (typeof drawAssetPdfTableChrome === "function") drawAssetPdfTableChrome(doc, logoData, title, subtitle);
      } else if (typeof drawPdfFooter === "function") {
        drawPdfFooter(doc);
      }
    } else if (typeof doc.autoTable === "function") {
      const tableConfig = useAssetPdfStyle
        ? {
            ...assetPdfTableTheme(doc),
            margin: { left: assetLayout.leftX, right: assetLayout.leftX },
            didDrawPage: () => drawAssetPdfTableChrome(doc, logoData, title, subtitle)
          }
        : {
            theme: "grid",
            headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold", fontSize: 7.5 },
            styles: { font: "helvetica", fontSize: 7.6, cellPadding: 1.8, overflow: "linebreak" },
            margin: { top: 42, bottom: 32 },
            didDrawPage: () => {
              if (typeof drawPdfHeaderAndFooter === "function") drawPdfHeaderAndFooter(doc, logoData, title, subtitle, false);
            }
          };
      doc.autoTable({
        startY: reportStartY,
        head: [head],
        body,
        ...tableConfig
      });
    }

    doc.save(`Assets_Depreciation_${kind}_${new Date().toISOString().slice(0, 10)}.pdf`);
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

    document.getElementById("depAssetFormMethod")?.addEventListener("change", () => { updateDepMethodFields(); updateFormPreview(); });
        ["depAssetFormPurchasePrice", "depAssetFormSalvage", "depAssetFormLifeYears", "depAssetFormPurchaseDate", "depAssetFormInServiceDate", "depAssetFormCurrency", "depAssetFormDecliningRate", "depAssetFormUnitsCapacity"]
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
    document.getElementById("depAssetStatusFilter")?.addEventListener("change", e => {
      depUi.status = e.target.value || "all";
      renderList();
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
        else if (action === "usage") openDepUsageModal(id);
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
      else if (action === "usage") openDepUsageModal(depUi.selectedId);
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
  window.addEventListener("triplem:offline-entry-synced", event => {
    const ids = new Set((event.detail?.ids || []).map(String));
    if (!ids.size) return;
    let touched = false;
    (depUi.assets || []).forEach(asset => {
      if (ids.has(String(asset.id))) { delete asset._syncStatus; touched = true; }
    });
    if (touched) renderAll();
  });

})();
