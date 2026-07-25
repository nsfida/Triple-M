/**
 * Inventory catalog taxonomy + add-item wizard + cart chrome.
 * Hierarchy: Category → Brand → Product type → Variant → Cart
 */
(function inventoryCatalogModule(global){
  const PRESETS = [
    { name: "Electronics", slug: "electronics", usesBrands: true, usesProductLines: true, usesVariants: true, qtyPattern: "count", sortOrder: 10, hint: "Brand → Type (iPhone) → Variant (512 GB Black)" },
    { name: "Perfumes", slug: "perfumes", usesBrands: true, usesProductLines: true, usesVariants: true, qtyPattern: "volume", sortOrder: 20, hint: "Brand → Fragrance → Size (3 ml)" },
    { name: "Liquids", slug: "liquids", usesBrands: true, usesProductLines: true, usesVariants: true, qtyPattern: "volume", sortOrder: 30, hint: "Brand → Product → Volume" },
    { name: "Food & Grocery", slug: "food-grocery", usesBrands: true, usesProductLines: false, usesVariants: true, qtyPattern: "weight", sortOrder: 40, hint: "Brand → Pack / weight" },
    { name: "Clothing", slug: "clothing", usesBrands: true, usesProductLines: true, usesVariants: true, qtyPattern: "count", sortOrder: 50, hint: "Brand → Style → Size / Color" },
    { name: "Hardware", slug: "hardware", usesBrands: true, usesProductLines: true, usesVariants: true, qtyPattern: "count", sortOrder: 60, hint: "Brand → Product → Spec" },
    { name: "Tools", slug: "tools", usesBrands: true, usesProductLines: true, usesVariants: true, qtyPattern: "count", sortOrder: 70, hint: "Brand → Tool → Spec" },
    { name: "Stationery", slug: "stationery", usesBrands: true, usesProductLines: false, usesVariants: true, qtyPattern: "count", sortOrder: 80, hint: "Brand → Item" },
    { name: "Furniture", slug: "furniture", usesBrands: true, usesProductLines: true, usesVariants: true, qtyPattern: "count", sortOrder: 90, hint: "Brand → Piece → Finish" },
    { name: "Cables & Pipes", slug: "cables-pipes", usesBrands: true, usesProductLines: true, usesVariants: true, qtyPattern: "length", sortOrder: 100, hint: "Brand → Type → Length" },
    { name: "General", slug: "general", usesBrands: false, usesProductLines: false, usesVariants: false, qtyPattern: "count", sortOrder: 999, hint: "Simple item with quantity" }
  ];

  function slugify(value){
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "general";
  }

  function h(value){
    if (typeof global.escapeHtml === "function") return global.escapeHtml(value);
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizePreset(row){
    const name = String(row?.name || "General").trim() || "General";
    return {
      id: row?.id || "",
      name,
      slug: String(row?.slug || slugify(name)),
      usesBrands: row?.uses_brands != null ? !!row.uses_brands : (row?.usesBrands != null ? !!row.usesBrands : true),
      usesProductLines: row?.uses_product_lines != null ? !!row.uses_product_lines : (row?.usesProductLines != null ? !!row.usesProductLines : true),
      usesVariants: row?.uses_variants != null ? !!row.uses_variants : (row?.usesVariants != null ? !!row.usesVariants : true),
      qtyPattern: String(row?.qty_pattern || row?.qtyPattern || "count").toLowerCase(),
      sortOrder: Number(row?.sort_order ?? row?.sortOrder ?? 100),
      hint: String(row?.hint || "")
    };
  }

  function presetCategories(){
    return PRESETS.map(normalizePreset);
  }

  function mergeCategoryLists(...lists){
    const bySlug = new Map();
    for (const list of lists) {
      for (const raw of (Array.isArray(list) ? list : [])) {
        const row = normalizePreset(raw);
        if (!row.slug) continue;
        const prev = bySlug.get(row.slug);
        bySlug.set(row.slug, prev ? { ...prev, ...row, name: row.name || prev.name } : row);
      }
    }
    return [...bySlug.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }

  function ensureCategoriesLoaded(){
    const current = Array.isArray(global.state?.inventoryCategories) ? state.inventoryCategories : [];
    if (current.length) return current;
    const fallback = presetCategories();
    if (global.state) {
      state.inventoryCategories = fallback;
      state.inventoryCategoriesLoaded = true;
    }
    return fallback;
  }

  function getWizardCategories(){
    const list = ensureCategoriesLoaded();
    return list.length ? list : presetCategories();
  }

  async function loadInventoryCategories(force = false){
    ensureCategoriesLoaded();
    if (!global.state) return presetCategories();
    if (!force && Array.isArray(state.inventoryCategories) && state.inventoryCategories.length) {
      return state.inventoryCategories;
    }
    let rpcItems = [];
    try {
      if (typeof supabaseRpc === "function" && typeof databaseSessionCanLoad === "function" && databaseSessionCanLoad()) {
        const raw = await supabaseRpc("app_list_my_goods_categories", {});
        const res = typeof unwrapRpcJson === "function" ? unwrapRpcJson(raw) : raw;
        rpcItems = Array.isArray(res?.items) ? res.items.map(normalizePreset) : [];
      }
    } catch (err) {
      console.warn("Category config RPC unavailable; using presets.", err);
      rpcItems = [];
    }
    let discovered = [];
    try {
      discovered = typeof getInventoryItemTypes === "function" ? getInventoryItemTypes() : [];
    } catch (_) {
      discovered = [];
    }
    const discoveredRows = discovered.map(name => ({
      name,
      slug: slugify(name),
      usesBrands: true,
      usesProductLines: true,
      usesVariants: true,
      qtyPattern: /perfume|liquid/i.test(name) ? "volume" : (/cable|pipe|wire/i.test(name) ? "length" : (/food|grocery|weight/i.test(name) ? "weight" : "count")),
      sortOrder: 200
    }));
    const custom = Array.isArray(state.inventoryCustomCategories) ? state.inventoryCustomCategories : [];
    state.inventoryCategories = mergeCategoryLists(presetCategories(), discoveredRows, custom, rpcItems);
    if (!state.inventoryCategories.length) state.inventoryCategories = presetCategories();
    state.inventoryCategoriesLoaded = true;
    return state.inventoryCategories;
  }

  function addCustomCategory(name, options = {}){
    const cleaned = String(name || "").replace(/\s+/g, " ").trim();
    if (!cleaned) throw new Error("Category name is required.");
    const row = normalizePreset({
      name: cleaned,
      slug: slugify(cleaned),
      usesBrands: options.usesBrands != null ? !!options.usesBrands : true,
      usesProductLines: options.usesProductLines != null ? !!options.usesProductLines : true,
      usesVariants: options.usesVariants != null ? !!options.usesVariants : true,
      qtyPattern: options.qtyPattern || "count",
      sortOrder: options.sortOrder || 150,
      hint: options.hint || "Custom category"
    });
    if (!global.state) return row;
    if (!Array.isArray(state.inventoryCustomCategories)) state.inventoryCustomCategories = [];
    const exists = state.inventoryCustomCategories.some(c => slugify(c.name) === row.slug || c.slug === row.slug);
    if (!exists) state.inventoryCustomCategories.push(row);
    state.inventoryCategories = mergeCategoryLists(presetCategories(), state.inventoryCategories, state.inventoryCustomCategories, [row]);
    // Best-effort persist to DB when migration 051 is available.
    if (typeof supabaseRpc === "function" && typeof databaseSessionCanLoad === "function" && databaseSessionCanLoad()) {
      supabaseRpc("app_upsert_goods_category", {
        p_id: null,
        p_name: row.name,
        p_slug: row.slug,
        p_uses_brands: row.usesBrands,
        p_uses_product_lines: row.usesProductLines,
        p_uses_variants: row.usesVariants,
        p_qty_pattern: row.qtyPattern,
        p_sort_order: row.sortOrder,
        p_hint: row.hint
      }).catch(err => console.warn("Could not persist new category to database.", err));
    }
    return row;
  }

  function getCategoryConfig(nameOrSlug){
    const key = String(nameOrSlug || "").trim().toLowerCase();
    const list = getWizardCategories();
    return list.find(c => c.name.toLowerCase() === key || c.slug === key || slugify(c.name) === key)
      || normalizePreset({ name: nameOrSlug || "General", slug: slugify(nameOrSlug), usesBrands: true, usesProductLines: true, usesVariants: true, qtyPattern: "count" });
  }

  function productLineKey(value){
    return String(value || "").trim().toLowerCase() || "__items__";
  }

  function resolveItemProductLine(group){
    // Prefer explicit stored product line — never overwrite/merge distinct types (9PM vs 9PM Rebel).
    const explicit = String(group?.productLine || "").trim();
    if (explicit) return explicit;
    const name = String(group?.person_name || "").trim();
    const brand = String(group?.brand || "").trim();
    const variant = String(group?.variantLabel || "").trim();
    // Prefer "Brand · Type · Variant" display names.
    if (name.includes("·")) {
      const parts = name.split("·").map(p => p.trim()).filter(Boolean);
      if (parts.length >= 3) return parts[1];
      if (parts.length === 2 && brand && parts[0].toLowerCase() === brand.toLowerCase()) return parts[1];
    }
    if (name && brand && name.toLowerCase().startsWith(brand.toLowerCase())) {
      let rest = name.slice(brand.length).replace(/^[\s·\-|]+/, "").trim();
      if (variant && rest.toLowerCase().endsWith(variant.toLowerCase())) {
        rest = rest.slice(0, rest.length - variant.length).replace(/[\s·\-|]+$/, "").trim();
      }
      if (rest && rest.toLowerCase() !== variant.toLowerCase()) return rest;
    }
    if (name && variant && name.toLowerCase() !== variant.toLowerCase()) {
      const cleaned = name.replace(new RegExp(`${variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"), "").replace(/[\s·\-|]+$/, "").trim();
      if (cleaned && cleaned.toLowerCase() !== brand.toLowerCase() && cleaned.toLowerCase() !== variant.toLowerCase()) {
        return cleaned;
      }
    }
    return "Items";
  }

  function findBrandCatalogEntry(brandName){
    const key = String(brandName || "").trim().toLowerCase();
    if (!key) return null;
    const catalog = typeof getInventoryBrandCatalog === "function"
      ? getInventoryBrandCatalog()
      : (Array.isArray(state?.inventoryBrands) ? state.inventoryBrands : []);
    return catalog.find(b => String(b.name || "").trim().toLowerCase() === key) || null;
  }

  function groupItemsByBrand(items){
    const map = new Map();
    for (const item of items) {
      const brand = String(item.brand || "").trim() || "Unbranded";
      const key = brand.toLowerCase();
      if (!map.has(key)) map.set(key, { key, brand, items: [], inStock: false });
      const row = map.get(key);
      row.items.push(item);
      if (Number(item.remainingQty || 0) > 0.00000001) row.inStock = true;
    }
    return [...map.values()]
      .map(row => ({
        ...row,
        items: typeof sortInventorySectionItems === "function" ? sortInventorySectionItems(row.items) : row.items,
        lineCount: mergeProductLinesForBrand(row.brand, row.items).length,
        stockLabel: typeof inventoryQtySummary === "function" ? inventoryQtySummary(row.items, "remainingQty") : String(row.items.length)
      }))
      .sort((a, b) => a.brand.localeCompare(b.brand, undefined, { sensitivity: "base" }));
  }

  function groupItemsByProductLine(items){
    const map = new Map();
    for (const item of items) {
      const line = resolveItemProductLine(item);
      const key = productLineKey(line);
      if (!map.has(key)) map.set(key, { key, name: line, items: [], inStock: false, id: String(item.productLineId || "") });
      const row = map.get(key);
      row.items.push(item);
      if (!row.id && item.productLineId) row.id = String(item.productLineId);
      if (Number(item.remainingQty || 0) > 0.00000001) row.inStock = true;
    }
    return [...map.values()]
      .map(row => ({
        ...row,
        items: typeof sortInventorySectionItems === "function" ? sortInventorySectionItems(row.items) : row.items,
        variantCount: row.items.length,
        stockLabel: typeof inventoryQtySummary === "function" ? inventoryQtySummary(row.items, "remainingQty") : String(row.items.length)
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }

  /** Merge stock-derived types with catalog product lines so empty types stay visible. */
  function mergeProductLinesForBrand(brandName, stockItems = []){
    const fromStock = groupItemsByProductLine(stockItems);
    const map = new Map(fromStock.map(row => [row.key, { ...row, fromCatalog: false }]));
    const brand = findBrandCatalogEntry(brandName);
    for (const line of (brand?.product_lines || [])) {
      const name = String(line.name || "").trim();
      if (!name) continue;
      const key = productLineKey(name);
      if (map.has(key)) {
        const existing = map.get(key);
        existing.id = existing.id || line.id || "";
        existing.catalogVariants = Array.isArray(line.variants) ? line.variants : [];
        continue;
      }
      map.set(key, {
        key,
        name,
        id: line.id || "",
        items: [],
        inStock: false,
        variantCount: Array.isArray(line.variants) ? line.variants.length : 0,
        stockLabel: "0",
        fromCatalog: true,
        catalogVariants: Array.isArray(line.variants) ? line.variants : []
      });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }

  function mergeVariantsForProductLine(brandName, productLineName, stockItems = []){
    const lineKey = productLineKey(productLineName);
    const stockForLine = (stockItems || []).filter(item => productLineKey(resolveItemProductLine(item)) === lineKey);
    const rows = stockForLine.map(group => ({
      key: String(group.group_id || group.variantId || group.variantLabel || group.person_name),
      group,
      label: String(group.variantLabel || group.person_name || "Variant").trim(),
      variantId: group.variantId || "",
      inStock: Number(group.remainingQty || 0) > 0.00000001,
      fromCatalog: false
    }));
    const seen = new Set(rows.map(r => r.label.toLowerCase()).filter(Boolean));
    const brand = findBrandCatalogEntry(brandName);
    const catalogLine = (brand?.product_lines || []).find(l => productLineKey(l.name) === lineKey);
    const catalogVariants = Array.isArray(catalogLine?.variants)
      ? catalogLine.variants
      : (Array.isArray(brand?.variants)
        ? brand.variants.filter(v => {
            if (!catalogLine?.id) return !v.product_line_id;
            return String(v.product_line_id || "") === String(catalogLine.id);
          })
        : []);
    for (const variant of catalogVariants) {
      const label = String(variant.label || "").trim();
      if (!label || seen.has(label.toLowerCase())) continue;
      seen.add(label.toLowerCase());
      rows.push({
        key: `catalog:${variant.id || label}`,
        group: null,
        label,
        variantId: variant.id || "",
        inStock: false,
        fromCatalog: true,
        catalogVariant: variant
      });
    }
    return rows.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }

  async function createBrandInline({ brandName, categoryName }){
    const name = String(brandName || "").replace(/\s+/g, " ").trim();
    if (!name) throw new Error("Brand name is required.");
    const existing = findBrandCatalogEntry(name);
    if (existing?.id) return { id: existing.id, name: existing.name || name };
    const res = unwrapRpcJson(await supabaseRpc("app_upsert_goods_brand", {
      p_id: null,
      p_name: name,
      p_item_type: categoryName || "General",
      p_notes: null
    }));
    if (typeof ensureInventoryBrandsLoaded === "function") await ensureInventoryBrandsLoaded(true);
    const refreshed = findBrandCatalogEntry(name);
    return { id: refreshed?.id || res?.id || "", name: refreshed?.name || name };
  }

  async function createProductLineInline({ brandName, categoryName, lineName }){
    const name = String(lineName || "").replace(/\s+/g, " ").trim();
    const brand = String(brandName || "").trim();
    if (!name) throw new Error("Type name is required.");
    if (!brand) throw new Error("Brand is required.");
    let brandEntry = findBrandCatalogEntry(brand);
    if (!brandEntry?.id) {
      const created = await createBrandInline({ brandName: brand, categoryName });
      brandEntry = findBrandCatalogEntry(brand) || { id: created.id, name: brand, product_lines: [] };
    }
    const res = unwrapRpcJson(await supabaseRpc("app_upsert_goods_product_line", {
      p_id: null,
      p_brand_id: brandEntry.id,
      p_name: name,
      p_category_name: categoryName || "General",
      p_sort_order: 0
    }));
    if (typeof ensureInventoryBrandsLoaded === "function") await ensureInventoryBrandsLoaded(true);
    return { id: res?.id || "", name, brandId: brandEntry.id };
  }

  async function createVariantInline({ brandName, categoryName, productLineName, variantLabel, qtyPattern = "count" }){
    const label = String(variantLabel || "").replace(/\s+/g, " ").trim();
    const brand = String(brandName || "").trim();
    const lineName = String(productLineName || "").trim();
    if (!label) throw new Error("Variant name is required.");
    if (!brand) throw new Error("Brand is required.");
    if (!lineName) throw new Error("Product type is required.");
    let brandEntry = findBrandCatalogEntry(brand);
    if (!brandEntry?.id) {
      await createProductLineInline({ brandName: brand, categoryName, lineName });
      brandEntry = findBrandCatalogEntry(brand);
    }
    let line = (brandEntry?.product_lines || []).find(l => productLineKey(l.name) === productLineKey(lineName));
    if (!line?.id) {
      const created = await createProductLineInline({ brandName: brand, categoryName, lineName });
      if (typeof ensureInventoryBrandsLoaded === "function") await ensureInventoryBrandsLoaded(true);
      brandEntry = findBrandCatalogEntry(brand);
      line = (brandEntry?.product_lines || []).find(l => String(l.id) === String(created.id) || productLineKey(l.name) === productLineKey(lineName));
    }
    const unit = typeof inventoryBaseUnitForCategory === "function" ? inventoryBaseUnitForCategory(qtyPattern) : "item";
    const res = unwrapRpcJson(await supabaseRpc("app_upsert_goods_brand_variant", {
      p_id: null,
      p_brand_id: brandEntry.id,
      p_label: label,
      p_item_category: qtyPattern || "count",
      p_quantity_value: 1,
      p_quantity_unit: unit,
      p_sort_order: 0,
      p_product_line_id: line?.id || null
    }));
    if (typeof ensureInventoryBrandsLoaded === "function") await ensureInventoryBrandsLoaded(true);
    return { id: res?.id || "", label, productLineId: line?.id || "", brandId: brandEntry.id };
  }

  function buildItemDisplayName({ brand, productLine, variantLabel, itemName }){
    const parts = [brand, productLine, variantLabel].map(v => String(v || "").trim()).filter(Boolean);
    if (parts.length) return parts.join(" · ");
    return String(itemName || "Item").trim() || "Item";
  }

  function ensureAddItemWizardModal(){
    let modal = document.getElementById("inventoryAddItemWizardModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "inventoryAddItemWizardModal";
    modal.className = "modal hide";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <div class="modal-backdrop" data-close-add-wizard="1"></div>
      <div class="modal-dialog compact-entry-dialog inventory-add-wizard-dialog">
        <div class="modal-head">
          <div>
            <h3 id="inventoryAddWizardTitle">Add inventory item</h3>
            <p class="help" id="inventoryAddWizardHelp">Category-driven item setup</p>
          </div>
          <button class="icon-btn ghost" type="button" data-close-add-wizard="1" aria-label="Close">×</button>
        </div>
        <div class="modal-body" id="inventoryAddWizardBody"></div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelectorAll("[data-close-add-wizard]").forEach(el => {
      el.addEventListener("click", e => {
        e.preventDefault();
        closeAddItemWizard();
      });
    });
    return modal;
  }

  function closeAddItemWizard(){
    const modal = document.getElementById("inventoryAddItemWizardModal");
    if (!modal) return;
    modal.classList.add("hide");
    modal.setAttribute("aria-hidden", "true");
    const stillOpen = document.querySelector(".modal:not(.hide)");
    document.body.style.overflow = stillOpen ? "hidden" : "";
  }

  function wizardState(){
    if (!state.inventoryAddWizard || typeof state.inventoryAddWizard !== "object") {
      state.inventoryAddWizard = {
        step: 1,
        category: "",
        brand: "",
        brandId: "",
        productLine: "",
        productLineId: "",
        variantLabel: "",
        variantId: "",
        itemName: "",
        qty: "1",
        unit: "item",
        unitCost: "",
        unitSell: "",
        currency: state.lastCurrency || "AED",
        description: "",
        boughtDate: typeof todayISO === "function" ? todayISO() : ""
      };
    }
    return state.inventoryAddWizard;
  }

  function renderAddItemWizard(){
    const body = document.getElementById("inventoryAddWizardBody");
    const title = document.getElementById("inventoryAddWizardTitle");
    const help = document.getElementById("inventoryAddWizardHelp");
    if (!body) return;
    const w = wizardState();
    const categories = getWizardCategories();
    if (!w.category && categories[0]) w.category = categories[0].name;
    const cfg = getCategoryConfig(w.category || "General");
    const brandCatalog = typeof getInventoryBrandCatalog === "function"
      ? getInventoryBrandCatalog()
      : (Array.isArray(state.inventoryBrands) ? state.inventoryBrands : []);
    const brands = brandCatalog
      .filter(b => !w.category || String(b.item_type || "").toLowerCase() === String(w.category).toLowerCase() || !b.item_type);
    const selectedBrand = brands.find(b => String(b.id) === String(w.brandId) || String(b.name).toLowerCase() === String(w.brand).toLowerCase());
    const productLines = Array.isArray(selectedBrand?.product_lines) ? selectedBrand.product_lines : [];
    const selectedLine = productLines.find(l => String(l.id) === String(w.productLineId) || String(l.name).toLowerCase() === String(w.productLine).toLowerCase());
    const variants = Array.isArray(selectedLine?.variants)
      ? selectedLine.variants
      : (Array.isArray(selectedBrand?.variants) ? selectedBrand.variants.filter(v => !w.productLineId || String(v.product_line_id || "") === String(w.productLineId)) : []);

    const steps = ["Category"];
    if (cfg.usesBrands) steps.push("Brand");
    if (cfg.usesProductLines) steps.push("Type");
    if (cfg.usesVariants) steps.push("Variant");
    steps.push("Stock");

    if (title) title.textContent = "Add inventory item";
    if (help) help.textContent = `${steps.map((s, i) => (i + 1 === w.step ? `· ${s}` : s)).join(" → ")}`;

    let fields = "";
    if (w.step === 1) {
      fields = `
        <div class="inventory-add-category-block">
          <div class="inventory-add-category-head">
            <strong>Choose category</strong>
            <span>${h(String(categories.length))} available</span>
          </div>
          <div class="inventory-add-category-grid" id="addWizardCategoryGrid">
            ${categories.map(c => `
              <button type="button" class="inventory-add-category-card ${c.name === w.category ? "is-selected" : ""}" data-category-name="${h(c.name)}">
                <strong>${h(c.name)}</strong>
                <span>${h(c.hint || c.qtyPattern || "Items")}</span>
              </button>
            `).join("")}
          </div>
          <div class="inventory-add-category-create">
            <label class="inventory-edit-field inventory-edit-field-wide">
              <span>Or create new category</span>
              <div class="inventory-add-category-create-row">
                <input class="input" id="addWizardNewCategory" placeholder="e.g. Cosmetics, Auto parts" autocomplete="off" />
                <button type="button" class="btn soft tiny" id="addWizardCreateCategoryBtn">Create</button>
              </div>
            </label>
          </div>
          <p class="help" id="addWizardCategoryHint">${h(cfg.hint || "Choose how this item is organized.")}</p>
          <input type="hidden" id="addWizardCategory" value="${h(w.category || "")}" />
        </div>`;
    } else if (steps[w.step - 1] === "Brand") {
      fields = `
        <label class="inventory-edit-field inventory-edit-field-wide">
          <span>Brand</span>
          <select class="select" id="addWizardBrand">
            <option value="">Select brand…</option>
            ${brands.map(b => `<option value="${h(b.id)}" ${String(b.id) === String(w.brandId) ? "selected" : ""}>${h(b.name)}</option>`).join("")}
            <option value="__custom__">+ New brand…</option>
          </select>
        </label>
        <label class="inventory-edit-field inventory-edit-field-wide ${w.brandId === "__custom__" || (!w.brandId && w.brand) ? "" : "hide"}" id="addWizardBrandCustomWrap">
          <span>New brand name</span>
          <input class="input" id="addWizardBrandCustom" value="${h(w.brandId === "__custom__" || !w.brandId ? w.brand : "")}" placeholder="e.g. Apple, Afnan" />
        </label>`;
    } else if (steps[w.step - 1] === "Type") {
      fields = `
        <label class="inventory-edit-field inventory-edit-field-wide">
          <span>Product type</span>
          <select class="select" id="addWizardProductLine">
            <option value="">Select type…</option>
            ${productLines.map(l => `<option value="${h(l.id)}" ${String(l.id) === String(w.productLineId) ? "selected" : ""}>${h(l.name)}</option>`).join("")}
            <option value="__custom__">+ New type…</option>
          </select>
        </label>
        <label class="inventory-edit-field inventory-edit-field-wide ${w.productLineId === "__custom__" || (!w.productLineId && w.productLine) ? "" : "hide"}" id="addWizardLineCustomWrap">
          <span>New type name</span>
          <input class="input" id="addWizardProductLineCustom" value="${h(w.productLineId === "__custom__" || !w.productLineId ? w.productLine : "")}" placeholder="e.g. iPhone, 9PM, MacBook" />
        </label>
        <p class="help">Example: Apple → iPhone, Afnan → 9PM</p>`;
    } else if (steps[w.step - 1] === "Variant") {
      fields = `
        <label class="inventory-edit-field inventory-edit-field-wide">
          <span>Variant</span>
          <select class="select" id="addWizardVariant">
            <option value="">Select variant…</option>
            ${variants.map(v => `<option value="${h(v.id)}" ${String(v.id) === String(w.variantId) ? "selected" : ""}>${h(v.label)}</option>`).join("")}
            <option value="__custom__">+ New variant…</option>
          </select>
        </label>
        <label class="inventory-edit-field inventory-edit-field-wide ${w.variantId === "__custom__" || (!w.variantId && w.variantLabel) ? "" : "hide"}" id="addWizardVariantCustomWrap">
          <span>New variant</span>
          <input class="input" id="addWizardVariantCustom" value="${h(w.variantId === "__custom__" || !w.variantId ? w.variantLabel : "")}" placeholder="e.g. 512 GB Black, 3 ml, 100 ml" />
        </label>`;
    } else {
      const pattern = cfg.qtyPattern || "count";
      const unitOptions = typeof inventoryUnitSelectOptionsHtml === "function"
        ? inventoryUnitSelectOptionsHtml(pattern, w.unit || (typeof inventoryBaseUnitForCategory === "function" ? inventoryBaseUnitForCategory(pattern) : "item"))
        : `<option value="item">Pcs</option>`;
      const qtyLabel = pattern === "volume" ? "Volume" : pattern === "weight" ? "Weight" : pattern === "length" ? "Length" : "Quantity";
      fields = `
        <label class="inventory-edit-field inventory-edit-field-wide">
          <span>Item display name <em class="optional-label">auto</em></span>
          <input class="input" id="addWizardItemName" value="${h(w.itemName || buildItemDisplayName(w))}" />
        </label>
        <div class="inventory-draft-form">
          <label class="inventory-edit-field">
            <span>${h(qtyLabel)}</span>
            <input class="input" id="addWizardQty" type="number" min="0.001" step="any" value="${h(w.qty || "1")}" />
          </label>
          <label class="inventory-edit-field">
            <span>Unit</span>
            <select class="select" id="addWizardUnit">${unitOptions}</select>
          </label>
          <label class="inventory-edit-field">
            <span>Cost / unit</span>
            <input class="input" id="addWizardCost" type="number" min="0" step="any" value="${h(w.unitCost || "")}" />
          </label>
          <label class="inventory-edit-field">
            <span>Sell / unit</span>
            <input class="input" id="addWizardSell" type="number" min="0" step="any" value="${h(w.unitSell || "")}" />
          </label>
          <label class="inventory-edit-field">
            <span>Currency</span>
            <input class="input" id="addWizardCurrency" value="${h(w.currency || "AED")}" />
          </label>
          <label class="inventory-edit-field">
            <span>Date</span>
            <input class="input" id="addWizardDate" type="date" value="${h(w.boughtDate || "")}" />
          </label>
          <label class="inventory-edit-field inventory-edit-field-wide">
            <span>Notes</span>
            <input class="input" id="addWizardDesc" value="${h(w.description || "")}" />
          </label>
        </div>`;
    }

    body.innerHTML = `
      <div class="inventory-add-wizard-steps">
        ${steps.map((s, i) => `<span class="${i + 1 === w.step ? "is-active" : (i + 1 < w.step ? "is-done" : "")}">${h(s)}</span>`).join("")}
      </div>
      ${fields}
      <div class="inventory-add-wizard-actions">
        <button type="button" class="btn ghost" id="addWizardBackBtn" ${w.step <= 1 ? "disabled" : ""}>Back</button>
        <button type="button" class="btn primary" id="addWizardNextBtn">${w.step >= steps.length ? "Save item" : "Continue"}</button>
      </div>
    `;

    body.querySelectorAll("[data-category-name]").forEach(btn => {
      btn.addEventListener("click", () => {
        w.category = btn.dataset.categoryName || "";
        const hidden = body.querySelector("#addWizardCategory");
        if (hidden) hidden.value = w.category;
        body.querySelectorAll("[data-category-name]").forEach(card => {
          card.classList.toggle("is-selected", card.dataset.categoryName === w.category);
        });
        const next = getCategoryConfig(w.category);
        const hint = document.getElementById("addWizardCategoryHint");
        if (hint) hint.textContent = next.hint || "";
      });
    });
    body.querySelector("#addWizardCreateCategoryBtn")?.addEventListener("click", () => {
      const input = body.querySelector("#addWizardNewCategory");
      const name = String(input?.value || "").trim();
      if (!name) {
        alert("Enter a category name.");
        return;
      }
      try {
        const created = addCustomCategory(name);
        w.category = created.name;
        if (input) input.value = "";
        renderAddItemWizard();
      } catch (err) {
        alert(err?.message || "Could not create category.");
      }
    });
    body.querySelector("#addWizardNewCategory")?.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        body.querySelector("#addWizardCreateCategoryBtn")?.click();
      }
    });
    body.querySelector("#addWizardBrand")?.addEventListener("change", e => {
      w.brandId = e.target.value;
      const wrap = body.querySelector("#addWizardBrandCustomWrap");
      wrap?.classList.toggle("hide", w.brandId !== "__custom__");
      if (w.brandId && w.brandId !== "__custom__") {
        const b = brands.find(x => String(x.id) === String(w.brandId));
        w.brand = b?.name || "";
      }
    });
    body.querySelector("#addWizardProductLine")?.addEventListener("change", e => {
      w.productLineId = e.target.value;
      body.querySelector("#addWizardLineCustomWrap")?.classList.toggle("hide", w.productLineId !== "__custom__");
      if (w.productLineId && w.productLineId !== "__custom__") {
        const l = productLines.find(x => String(x.id) === String(w.productLineId));
        w.productLine = l?.name || "";
      }
    });
    body.querySelector("#addWizardVariant")?.addEventListener("change", e => {
      w.variantId = e.target.value;
      body.querySelector("#addWizardVariantCustomWrap")?.classList.toggle("hide", w.variantId !== "__custom__");
      if (w.variantId && w.variantId !== "__custom__") {
        const v = variants.find(x => String(x.id) === String(w.variantId));
        w.variantLabel = v?.label || "";
      }
    });
    body.querySelector("#addWizardBackBtn")?.addEventListener("click", () => {
      syncWizardFieldsFromDom();
      w.step = Math.max(1, w.step - 1);
      renderAddItemWizard();
    });
    body.querySelector("#addWizardNextBtn")?.addEventListener("click", async () => {
      syncWizardFieldsFromDom();
      if (w.step < steps.length) {
        if (!validateWizardStep(steps[w.step - 1])) return;
        w.step += 1;
        // Skip unused steps if category changed mid-way
        while (w.step <= steps.length) {
          const label = steps[w.step - 1];
          if (label === "Brand" && !cfg.usesBrands) { w.step += 1; continue; }
          if (label === "Type" && !cfg.usesProductLines) { w.step += 1; continue; }
          if (label === "Variant" && !cfg.usesVariants) { w.step += 1; continue; }
          break;
        }
        renderAddItemWizard();
        return;
      }
      try {
        await commitAddItemWizard();
      } catch (err) {
        alert(err?.message || "Could not save item.");
      }
    });
  }

  function syncWizardFieldsFromDom(){
    const w = wizardState();
    const cat = document.getElementById("addWizardCategory");
    if (cat) w.category = cat.value;
    const brand = document.getElementById("addWizardBrand");
    if (brand) {
      w.brandId = brand.value;
      if (w.brandId === "__custom__") w.brand = String(document.getElementById("addWizardBrandCustom")?.value || "").trim();
      else if (w.brandId) {
        const catalog = typeof getInventoryBrandCatalog === "function" ? getInventoryBrandCatalog() : (state.inventoryBrands || []);
        const b = catalog.find(x => String(x.id) === String(w.brandId));
        w.brand = b?.name || w.brand;
      }
    }
    const line = document.getElementById("addWizardProductLine");
    if (line) {
      w.productLineId = line.value;
      if (w.productLineId === "__custom__") w.productLine = String(document.getElementById("addWizardProductLineCustom")?.value || "").trim();
      else if (w.productLineId) {
        const brands = typeof getInventoryBrandCatalog === "function" ? getInventoryBrandCatalog() : (state.inventoryBrands || []);
        const b = brands.find(x => String(x.id) === String(w.brandId));
        const l = (b?.product_lines || []).find(x => String(x.id) === String(w.productLineId));
        w.productLine = l?.name || w.productLine;
      }
    }
    const variant = document.getElementById("addWizardVariant");
    if (variant) {
      w.variantId = variant.value;
      if (w.variantId === "__custom__") w.variantLabel = String(document.getElementById("addWizardVariantCustom")?.value || "").trim();
      else if (w.variantId) {
        w.variantLabel = variant.options[variant.selectedIndex]?.text || w.variantLabel;
      }
    }
    const name = document.getElementById("addWizardItemName");
    if (name) w.itemName = name.value.trim();
    const qty = document.getElementById("addWizardQty");
    if (qty) w.qty = qty.value;
    const unit = document.getElementById("addWizardUnit");
    if (unit) w.unit = unit.value;
    const cost = document.getElementById("addWizardCost");
    if (cost) w.unitCost = cost.value;
    const sell = document.getElementById("addWizardSell");
    if (sell) w.unitSell = sell.value;
    const currency = document.getElementById("addWizardCurrency");
    if (currency) w.currency = currency.value.trim() || "AED";
    const date = document.getElementById("addWizardDate");
    if (date) w.boughtDate = date.value;
    const desc = document.getElementById("addWizardDesc");
    if (desc) w.description = desc.value.trim();
  }

  function validateWizardStep(stepLabel){
    const w = wizardState();
    if (stepLabel === "Category" && !w.category) {
      alert("Select a category.");
      return false;
    }
    if (stepLabel === "Brand") {
      const brandName = w.brandId === "__custom__" || !w.brandId
        ? String(document.getElementById("addWizardBrandCustom")?.value || w.brand || "").trim()
        : w.brand;
      if (!brandName) { alert("Enter or select a brand."); return false; }
      w.brand = brandName;
    }
    if (stepLabel === "Type") {
      const lineName = w.productLineId === "__custom__" || !w.productLineId
        ? String(document.getElementById("addWizardProductLineCustom")?.value || w.productLine || "").trim()
        : w.productLine;
      if (!lineName) { alert("Enter or select a product type (e.g. iPhone, 9PM)."); return false; }
      w.productLine = lineName;
    }
    if (stepLabel === "Variant") {
      const variant = w.variantId === "__custom__" || !w.variantId
        ? String(document.getElementById("addWizardVariantCustom")?.value || w.variantLabel || "").trim()
        : w.variantLabel;
      if (!variant) { alert("Enter or select a variant (e.g. 512 GB Black, 3 ml)."); return false; }
      w.variantLabel = variant;
    }
    return true;
  }

  async function ensureWizardCatalogIds(){
    const w = wizardState();
    const cfg = getCategoryConfig(w.category);
    if (cfg.usesBrands && w.brand) {
      if (!w.brandId || w.brandId === "__custom__") {
        const res = unwrapRpcJson(await supabaseRpc("app_upsert_goods_brand", {
          p_id: null,
          p_name: w.brand,
          p_item_type: w.category || "General",
          p_notes: null
        }));
        w.brandId = res?.id || "";
        if (typeof ensureInventoryBrandsLoaded === "function") await ensureInventoryBrandsLoaded(true);
      }
    }
    if (cfg.usesProductLines && w.brandId && w.productLine) {
      const brandEntry = (typeof getInventoryBrandCatalog === "function" ? getInventoryBrandCatalog() : [])
        .find(b => String(b.id) === String(w.brandId));
      const matchedLine = (brandEntry?.product_lines || []).find(l =>
        productLineKey(l.name) === productLineKey(w.productLine)
      );
      // Never reuse another type's id when the typed name differs (prevents 9PM → 9PM Rebel rename).
      if (matchedLine?.id) {
        w.productLineId = matchedLine.id;
      } else if (!w.productLineId || w.productLineId === "__custom__") {
        try {
          const res = unwrapRpcJson(await supabaseRpc("app_upsert_goods_product_line", {
            p_id: null,
            p_brand_id: w.brandId,
            p_name: w.productLine,
            p_category_name: w.category || "General",
            p_sort_order: 0
          }));
          w.productLineId = res?.id || "";
        } catch (err) {
          console.warn("Product line RPC unavailable; saving line in item meta only.", err);
          w.productLineId = "";
        }
        if (typeof ensureInventoryBrandsLoaded === "function") await ensureInventoryBrandsLoaded(true);
      } else {
        const selected = (brandEntry?.product_lines || []).find(l => String(l.id) === String(w.productLineId));
        if (!selected || productLineKey(selected.name) !== productLineKey(w.productLine)) {
          try {
            const res = unwrapRpcJson(await supabaseRpc("app_upsert_goods_product_line", {
              p_id: null,
              p_brand_id: w.brandId,
              p_name: w.productLine,
              p_category_name: w.category || "General",
              p_sort_order: 0
            }));
            w.productLineId = res?.id || "";
          } catch (err) {
            console.warn("Product line create failed; saving meta only.", err);
            w.productLineId = "";
          }
          if (typeof ensureInventoryBrandsLoaded === "function") await ensureInventoryBrandsLoaded(true);
        }
      }
    }
    if (cfg.usesVariants && w.brandId && w.variantLabel) {
      const brandEntry = (typeof getInventoryBrandCatalog === "function" ? getInventoryBrandCatalog() : [])
        .find(b => String(b.id) === String(w.brandId));
      const lineVariants = (brandEntry?.product_lines || [])
        .find(l => String(l.id) === String(w.productLineId))?.variants
        || (brandEntry?.variants || []).filter(v => !w.productLineId || String(v.product_line_id || "") === String(w.productLineId));
      const matchedVariant = (lineVariants || []).find(v =>
        String(v.label || "").trim().toLowerCase() === String(w.variantLabel || "").trim().toLowerCase()
      );
      if (matchedVariant?.id) {
        w.variantId = matchedVariant.id;
      } else if (!w.variantId || w.variantId === "__custom__") {
        try {
          const res = unwrapRpcJson(await supabaseRpc("app_upsert_goods_brand_variant", {
            p_id: null,
            p_brand_id: w.brandId,
            p_label: w.variantLabel,
            p_item_category: cfg.qtyPattern || "count",
            p_quantity_value: 1,
            p_quantity_unit: typeof inventoryBaseUnitForCategory === "function" ? inventoryBaseUnitForCategory(cfg.qtyPattern) : "item",
            p_sort_order: 0,
            p_product_line_id: w.productLineId || null
          }));
          w.variantId = res?.id || "";
        } catch (err) {
          console.warn("Variant RPC failed; saving label in meta only.", err);
          w.variantId = "";
        }
        if (typeof ensureInventoryBrandsLoaded === "function") await ensureInventoryBrandsLoaded(true);
      }
    }
  }

  async function persistInventoryStockItem(payload = {}){
    const categoryName = payload.category || payload.itemType || "General";
    const cfg = getCategoryConfig(categoryName);
    const qtyPattern = payload.qtyPattern || cfg.qtyPattern || "count";
    const unit = payload.unit || (typeof inventoryBaseUnitForCategory === "function" ? inventoryBaseUnitForCategory(qtyPattern) : "item");
    const qty = typeof normalizeInventoryQuantityInput === "function"
      ? normalizeInventoryQuantityInput(payload.qty, qtyPattern, unit)
      : Number(payload.qty || 0);
    const unitCost = Number(payload.unitCost || 0);
    const unitSell = Number(payload.unitSell || 0);
    if (!(qty > 0)) throw new Error("Enter a valid quantity / volume / weight / length.");
    if (!(unitCost > 0)) throw new Error("Enter cost per unit.");

    const draft = {
      category: categoryName,
      brand: String(payload.brand || "").trim(),
      brandId: payload.brandId || "",
      productLine: String(payload.productLine || "").trim(),
      productLineId: payload.productLineId || "",
      variantLabel: String(payload.variantLabel || "").trim(),
      variantId: payload.variantId || "",
      itemName: String(payload.itemName || "").trim(),
      qty: String(payload.qty ?? qty),
      unit,
      unitCost: String(unitCost),
      unitSell: unitSell > 0 ? String(unitSell) : "",
      currency: payload.currency || state.lastCurrency || "AED",
      description: payload.description || "",
      boughtDate: payload.boughtDate || (typeof todayISO === "function" ? todayISO() : "")
    };
    state.inventoryAddWizard = { ...draft, step: 99 };
    try {
      await ensureWizardCatalogIds();
      const w = wizardState();
      if (!w.itemName) w.itemName = buildItemDisplayName(w);

      const taxDefault = typeof getTaxSettingForCurrency === "function"
        ? getTaxSettingForCurrency(w.currency || "AED")
        : { rate: 0, mode: "exclusive" };
      const lineTotal = unitCost * qty;
      const tax = typeof calculateTaxBreakdown === "function"
        ? calculateTaxBreakdown(lineTotal, taxDefault.rate, taxDefault.mode, taxDefault.rate > 0)
        : { net: lineTotal, tax: 0, total: lineTotal, applied: false, rate: 0, mode: "exclusive" };

      const uuidOk = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || "").trim());
      const brandId = w.brandId && w.brandId !== "__custom__" && uuidOk(w.brandId) ? String(w.brandId).trim() : "";
      const productLineId = w.productLineId && w.productLineId !== "__custom__" && uuidOk(w.productLineId) ? String(w.productLineId).trim() : "";
      const variantId = w.variantId && w.variantId !== "__custom__" && uuidOk(w.variantId) ? String(w.variantId).trim() : "";
      const currency = String(w.currency || "AED").trim().toUpperCase() || "AED";
      const boughtDate = String(w.boughtDate || (typeof todayISO === "function" ? todayISO() : "")).trim().slice(0, 10)
        || new Date().toISOString().slice(0, 10);

      const meta = {
        boughtQty: qty,
        unitActualPrice: unitCost,
        unitSoldPrice: unitSell || null,
        itemCode: typeof nextInventoryCode === "function" ? nextInventoryCode() : "",
        itemDescription: w.description || "",
        itemType: w.category || "General",
        itemCategory: qtyPattern,
        quantityUnit: typeof inventoryBaseUnitForCategory === "function" ? inventoryBaseUnitForCategory(qtyPattern) : unit,
        brand: w.brand || "",
        brandId,
        productLine: w.productLine || "",
        productLineId,
        variantLabel: w.variantLabel || "",
        variantId,
        categorySlug: cfg.slug,
        // Match classic purchase save path (domain maps ITEM principals → goods_items).
        transactionType: "ITEM",
        taxApplied: tax.applied,
        taxRate: tax.rate,
        taxMode: tax.mode,
        taxAmount: tax.tax,
        netAmount: tax.net,
        grossAmount: tax.total
      };

      const notes = typeof upsertGoodsMetaInNote === "function"
        ? upsertGoodsMetaInNote(typeof normalizeGoodsNote === "function" ? normalizeGoodsNote(null, true) : "", meta)
        : "";

      const groupId = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `g-${Date.now()}`;
      const entryId = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `i-${Date.now()}`;
      const entry = {
        id: entryId,
        group_id: groupId,
        direction: "taken",
        entry_kind: "principal",
        person_name: w.itemName,
        currency,
        principal_amount: tax.total,
        action_amount: null,
        loan_date: boughtDate,
        action_date: null,
        notes
      };

      // Prefer dedicated RPC (054) so stock sync matches brand/variant reliability.
      let syncedViaRpc = false;
      if (typeof supabaseRpc === "function" && typeof databaseSessionCanLoad === "function" && databaseSessionCanLoad()) {
        try {
          const res = unwrapRpcJson(await supabaseRpc("app_upsert_goods_item", {
            p_id: entryId,
            p_group_id: groupId,
            p_item_name: w.itemName,
            p_currency: currency,
            p_unit_actual_price: unitCost,
            p_bought_qty: qty,
            p_total_actual_price: tax.total,
            p_bought_date: boughtDate,
            p_notes: notes,
            p_item_code: meta.itemCode || null,
            p_brand: meta.brand || null,
            p_variant_label: meta.variantLabel || null,
            p_brand_id: brandId || null,
            p_variant_id: variantId || null,
            p_product_line: meta.productLine || null,
            p_product_line_id: productLineId || null,
            p_category_slug: meta.categorySlug || null,
            p_item_category: qtyPattern,
            p_quantity_unit: meta.quantityUnit || "item"
          }));
          if (res?.ok !== false) syncedViaRpc = true;
        } catch (rpcErr) {
          const msg = String(rpcErr?.message || rpcErr || "");
          if (!/app_upsert_goods_item|Could not find the function|PGRST202|404/i.test(msg)) {
            throw rpcErr;
          }
          console.warn("app_upsert_goods_item unavailable; falling back to standard sync.", rpcErr);
        }
      }

      if (syncedViaRpc) {
        // Local optimistic row + mark synced (RPC already wrote DB).
        const local = typeof withLocalEntryIdentity === "function"
          ? withLocalEntryIdentity(entry)
          : entry;
        local.data_origin = "domain";
        local.domain_table = "goods_items";
        local.is_legacy_meta = false;
        if (Array.isArray(state.entries)) state.entries.unshift(local);
        if (typeof markDbSnapshotRows === "function") markDbSnapshotRows([local]);
        if (typeof renderAll === "function") renderAll();
        else if (typeof renderInventoryList === "function") renderInventoryList();
      } else {
        saveEntriesImmediately(entry, { label: "Inventory item" });
      }

      return { itemName: w.itemName, qty, unitCost, unitSell, currency: w.currency, syncedViaRpc };
    } finally {
      state.inventoryAddWizard = null;
    }
  }

  async function commitAddItemWizard(){
    const w = wizardState();
    const cfg = getCategoryConfig(w.category);
    if (!validateWizardStep("Stock") && false) return;
    const result = await persistInventoryStockItem({
      category: w.category,
      brand: w.brand,
      brandId: w.brandId,
      productLine: w.productLine,
      productLineId: w.productLineId,
      variantLabel: w.variantLabel,
      variantId: w.variantId,
      itemName: w.itemName,
      qty: w.qty,
      unit: w.unit,
      unitCost: w.unitCost,
      unitSell: w.unitSell,
      currency: w.currency,
      description: w.description,
      boughtDate: w.boughtDate,
      qtyPattern: cfg.qtyPattern
    });

    closeAddItemWizard();
    state.inventoryAddWizard = null;
    if (typeof renderInventoryList === "function") renderInventoryList();
    if (state.inventoryActiveSection) {
      try { await renderInventorySectionOverlayBody(state.inventoryActiveSection); } catch (_) {}
    }
    if (result) alert("Item added to inventory.");
  }

  async function openInventoryAddItemWizard(options = {}){
    ensureAddItemWizardModal();
    ensureCategoriesLoaded();
    try { await loadInventoryCategories(false); } catch (err) {
      console.warn("Category load failed; using presets.", err);
      ensureCategoriesLoaded();
    }
    try { if (typeof ensureInventoryBrandsLoaded === "function") await ensureInventoryBrandsLoaded(false); } catch (_) {}
    const cats = getWizardCategories();
    state.inventoryAddWizard = {
      step: 1,
      category: options.seedType || options.category || cats[0]?.name || "General",
      brand: options.brand || "",
      brandId: options.brandId || "",
      productLine: options.productLine || "",
      productLineId: options.productLineId || "",
      variantLabel: options.variantLabel || "",
      variantId: options.variantId || "",
      itemName: "",
      qty: options.qty || "1",
      unit: options.unit || "item",
      unitCost: "",
      unitSell: "",
      currency: options.currency || state.lastCurrency || "AED",
      description: "",
      boughtDate: typeof todayISO === "function" ? todayISO() : ""
    };
    const cfg = getCategoryConfig(state.inventoryAddWizard.category);
    state.inventoryAddWizard.unit = typeof inventoryBaseUnitForCategory === "function"
      ? inventoryBaseUnitForCategory(cfg.qtyPattern)
      : "item";
    try {
      renderAddItemWizard();
    } catch (err) {
      console.error("Add-item wizard render failed:", err);
      const body = document.getElementById("inventoryAddWizardBody");
      if (body) {
        body.innerHTML = `<div class="empty">Could not open add-item form. ${h(err?.message || "Please refresh and try again.")}</div>`;
      }
    }
    const modal = document.getElementById("inventoryAddItemWizardModal");
    modal?.classList.remove("hide");
    modal?.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function applyCartChrome(){
    // Rename draft dock / labels to professional cart.
    const dock = document.getElementById("inventorySaleDraftDock");
    if (dock) {
      dock.classList.add("inventory-cart-dock");
      const label = dock.querySelector(".inventory-sale-draft-dock-label");
      if (label) label.innerHTML = `<i class="fa-solid fa-cart-shopping"></i> Cart`;
    }
    const title = document.getElementById("inventorySaleDraftTitle");
    if (title && /draft/i.test(title.textContent || "")) {
      // keep dynamic proforma number; prefix handled in render
    }
    const help = document.getElementById("inventorySaleDraftHelp");
    if (help) help.textContent = "Cart / proforma — stock reduces only when finalized.";
    document.querySelectorAll("#openInventoryDraftBtn").forEach(btn => {
      btn.innerHTML = `<i class="fa-solid fa-cart-shopping"></i> Open cart`;
    });
    document.querySelectorAll("#openInventoryDraftsMenuBtn").forEach(btn => {
      btn.innerHTML = `<i class="fa-solid fa-folder-open"></i> Saved carts`;
    });
    const draftsBtn = document.getElementById("openInventoryDraftsBtn");
    if (draftsBtn) draftsBtn.innerHTML = `<i class="fa-solid fa-cart-flatbed"></i> Carts`;
  }

  global.INVENTORY_CATEGORY_PRESETS = PRESETS;
  global.loadInventoryCategories = loadInventoryCategories;
  global.getWizardCategories = getWizardCategories;
  global.addCustomCategory = addCustomCategory;
  global.getCategoryConfig = getCategoryConfig;
  global.groupItemsByBrand = groupItemsByBrand;
  global.groupItemsByProductLine = groupItemsByProductLine;
  global.mergeProductLinesForBrand = mergeProductLinesForBrand;
  global.mergeVariantsForProductLine = mergeVariantsForProductLine;
  global.createBrandInline = createBrandInline;
  global.createProductLineInline = createProductLineInline;
  global.createVariantInline = createVariantInline;
  global.persistInventoryStockItem = persistInventoryStockItem;
  global.resolveItemProductLine = resolveItemProductLine;
  global.productLineKey = productLineKey;
  global.buildItemDisplayName = buildItemDisplayName;
  global.openInventoryAddItemWizard = openInventoryAddItemWizard;
  global.closeAddItemWizard = closeAddItemWizard;
  global.applyCartChrome = applyCartChrome;
  global.inventoryCategorySlugify = slugify;
})(window);
