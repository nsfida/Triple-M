/**
 * Inventory catalog taxonomy + add-item wizard + cart chrome.
 * Hierarchy: Category → Brand → Product line → Variant → Cart
 * Perfumes use Brand → Fragrance → Size (bottle).
 */
(function inventoryCatalogModule(global){
  const PRESETS = [
    {
      name: "Electronics", slug: "electronics", usesBrands: true, usesProductLines: true, usesVariants: true, usesSubBrands: true,
      qtyPattern: "count", sortOrder: 10, hint: "Brand → Type → Variant (storage / color)",
      productLineLabel: "Type", variantLabelName: "Variant", primaryLabel: "Brand", primaryPlural: "Brands", subBrandLabel: "Sub-brand",
      examples: { primary: "e.g. Device maker", subBrand: "e.g. Pro line", productLine: "e.g. Phone model", variant: "e.g. 256 GB · Black", storage: "e.g. 256 GB", color: "e.g. Black", other: "e.g. Region" },
      variantAttrMode: "storage_color", defaultSellBy: null
    },
    {
      name: "Perfumes", slug: "perfumes", usesBrands: true, usesProductLines: true, usesVariants: true, usesSubBrands: true,
      qtyPattern: "volume", sortOrder: 20, hint: "Brand → Fragrance → Size",
      productLineLabel: "Fragrance", variantLabelName: "Size", primaryLabel: "Brand", primaryPlural: "Brands", subBrandLabel: "Sub-brand",
      examples: { primary: "e.g. Fragrance house", subBrand: "e.g. Collection", productLine: "e.g. Scent name", variant: "e.g. 100 ml", storage: "", color: "", other: "" },
      variantAttrMode: "none", defaultSellBy: "volume"
    },
    {
      name: "Liquids", slug: "liquids", usesBrands: true, usesProductLines: true, usesVariants: true, usesSubBrands: true,
      qtyPattern: "volume", sortOrder: 30, hint: "Brand → Product → Volume",
      productLineLabel: "Product", variantLabelName: "Volume", primaryLabel: "Brand", primaryPlural: "Brands", subBrandLabel: "Sub-brand",
      examples: { primary: "e.g. Maker name", subBrand: "e.g. Range", productLine: "e.g. Drink / oil name", variant: "e.g. 1 L bottle", storage: "", color: "", other: "" },
      variantAttrMode: "none", defaultSellBy: "bottle"
    },
    {
      name: "Food & Grocery", slug: "food-grocery", usesBrands: true, usesProductLines: false, usesVariants: true, usesSubBrands: false,
      qtyPattern: "weight", sortOrder: 40, hint: "Brand → Pack / weight",
      productLineLabel: "Type", variantLabelName: "Pack", primaryLabel: "Brand", primaryPlural: "Brands", subBrandLabel: "Sub-brand",
      examples: { primary: "e.g. Food brand", subBrand: "", productLine: "e.g. Product type", variant: "e.g. 500 g pack", storage: "", color: "", other: "" },
      variantAttrMode: "none", defaultSellBy: null
    },
    {
      name: "Clothing", slug: "clothing", usesBrands: true, usesProductLines: true, usesVariants: true, usesSubBrands: true,
      qtyPattern: "count", sortOrder: 50, hint: "Brand → Style → Size / Color",
      productLineLabel: "Style", variantLabelName: "Size", primaryLabel: "Brand", primaryPlural: "Brands", subBrandLabel: "Sub-brand",
      examples: { primary: "e.g. Apparel brand", subBrand: "e.g. Line", productLine: "e.g. Shirt style", variant: "e.g. M", storage: "", color: "e.g. Navy", other: "" },
      variantAttrMode: "color_size", defaultSellBy: null
    },
    {
      name: "Hardware", slug: "hardware", usesBrands: true, usesProductLines: true, usesVariants: true, usesSubBrands: true,
      qtyPattern: "count", sortOrder: 60, hint: "Brand → Product → Spec",
      productLineLabel: "Product", variantLabelName: "Spec", primaryLabel: "Brand", primaryPlural: "Brands", subBrandLabel: "Sub-brand",
      examples: { primary: "e.g. Hardware brand", subBrand: "e.g. Series", productLine: "e.g. Fastener type", variant: "e.g. M8 × 40 mm", storage: "", color: "", other: "e.g. Material" },
      variantAttrMode: "none", defaultSellBy: null
    },
    {
      name: "Tools", slug: "tools", usesBrands: true, usesProductLines: true, usesVariants: true, usesSubBrands: true,
      qtyPattern: "count", sortOrder: 70, hint: "Brand → Tool → Spec",
      productLineLabel: "Tool", variantLabelName: "Spec", primaryLabel: "Brand", primaryPlural: "Brands", subBrandLabel: "Sub-brand",
      examples: { primary: "e.g. Tool brand", subBrand: "e.g. Series", productLine: "e.g. Wrench type", variant: "e.g. 12 mm", storage: "", color: "", other: "" },
      variantAttrMode: "none", defaultSellBy: null
    },
    {
      name: "Stationery", slug: "stationery", usesBrands: true, usesProductLines: false, usesVariants: true, usesSubBrands: false,
      qtyPattern: "count", sortOrder: 80, hint: "Brand → Item",
      productLineLabel: "Type", variantLabelName: "Item", primaryLabel: "Brand", primaryPlural: "Brands", subBrandLabel: "Sub-brand",
      examples: { primary: "e.g. Stationery brand", subBrand: "", productLine: "e.g. Pen type", variant: "e.g. Blue ink · medium", storage: "", color: "e.g. Blue", other: "" },
      variantAttrMode: "none", defaultSellBy: null
    },
    {
      name: "Furniture", slug: "furniture", usesBrands: true, usesProductLines: true, usesVariants: true, usesSubBrands: true,
      qtyPattern: "count", sortOrder: 90, hint: "Brand → Piece → Finish",
      productLineLabel: "Piece", variantLabelName: "Finish", primaryLabel: "Brand", primaryPlural: "Brands", subBrandLabel: "Sub-brand",
      examples: { primary: "e.g. Furniture brand", subBrand: "e.g. Collection", productLine: "e.g. Chair model", variant: "e.g. Oak finish", storage: "", color: "e.g. Oak", other: "" },
      variantAttrMode: "none", defaultSellBy: null
    },
    {
      name: "Cables & Pipes", slug: "cables-pipes", usesBrands: true, usesProductLines: true, usesVariants: true, usesSubBrands: false,
      qtyPattern: "length", sortOrder: 100, hint: "Brand → Type → Length",
      productLineLabel: "Type", variantLabelName: "Length", primaryLabel: "Brand", primaryPlural: "Brands", subBrandLabel: "Sub-brand",
      examples: { primary: "e.g. Cable brand", subBrand: "", productLine: "e.g. Cable type", variant: "e.g. 5 m / 10 m", storage: "", color: "", other: "e.g. Gauge" },
      variantAttrMode: "none", defaultSellBy: null
    },
    {
      name: "Books", slug: "books", usesBrands: true, usesProductLines: true, usesVariants: true, usesSubBrands: true,
      qtyPattern: "count", sortOrder: 110, hint: "Author → Book title → Edition / Format",
      productLineLabel: "Book title", variantLabelName: "Edition / Format", productLinePlural: "book titles", variantPlural: "editions / formats",
      primaryLabel: "Author", primaryPlural: "Authors", subBrandLabel: "Series",
      examples: { primary: "e.g. Author name", subBrand: "e.g. Series name", productLine: "e.g. Book title", variant: "e.g. Paperback", storage: "e.g. ISBN", color: "e.g. Language", other: "" },
      variantAttrMode: "isbn_language", defaultSellBy: null
    },
    {
      name: "General", slug: "general", usesBrands: false, usesProductLines: false, usesVariants: false, usesSubBrands: false,
      qtyPattern: "count", sortOrder: 999, hint: "Simple item with quantity",
      productLineLabel: "Type", variantLabelName: "Variant", primaryLabel: "Brand", primaryPlural: "Brands", subBrandLabel: "Sub-brand",
      examples: { primary: "e.g. Maker", subBrand: "", productLine: "e.g. Item type", variant: "e.g. Size / pack", storage: "", color: "", other: "" },
      variantAttrMode: "none", defaultSellBy: null
    }
  ];

  /** Resolve app state whether exposed on window or as a script-global const. */
  function appState(){
    try {
      if (typeof state !== "undefined" && state) return state;
    } catch (_) {}
    return global.state || null;
  }

  function slugify(value){
    return String(value || "")
      .trim()
      .toLowerCase()
      // Match DB slug rules: "&" is a separator ("Food & Grocery" → food-grocery), not "and".
      .replace(/&/g, " ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "general";
  }

  /** Collapse food-and-grocery ↔ food-grocery style mismatches from older client slugify. */
  function compactCategorySlug(slug){
    return String(slug || "")
      .trim()
      .toLowerCase()
      .replace(/-and-/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function findPresetCategory(rowOrNameOrSlug){
    const presets = presetCategories();
    if (rowOrNameOrSlug && typeof rowOrNameOrSlug === "object") {
      const nameKey = String(rowOrNameOrSlug.name || "").trim().toLowerCase();
      const slugKey = compactCategorySlug(rowOrNameOrSlug.slug || slugify(rowOrNameOrSlug.name || ""));
      return presets.find(p =>
        (nameKey && p.name.toLowerCase() === nameKey)
        || (slugKey && (p.slug === slugKey || compactCategorySlug(p.slug) === slugKey || compactCategorySlug(slugify(p.name)) === slugKey))
      ) || null;
    }
    const raw = String(rowOrNameOrSlug || "").trim();
    if (!raw) return null;
    const nameKey = raw.toLowerCase();
    const slugKey = compactCategorySlug(raw.includes(" ") || raw.includes("&") ? slugify(raw) : raw);
    return presets.find(p =>
      p.name.toLowerCase() === nameKey
      || p.slug === slugKey
      || compactCategorySlug(p.slug) === slugKey
      || compactCategorySlug(slugify(p.name)) === slugKey
    ) || null;
  }

  function isPresetCategory(rowOrNameOrSlug){
    return !!findPresetCategory(rowOrNameOrSlug);
  }

  function categoryGridVisible(row){
    const meta = row?.meta && typeof row.meta === "object" ? row.meta : {};
    const value = row?.grid_visible ?? row?.gridVisible ?? meta.grid_visible ?? meta.gridVisible;
    if (typeof value === "boolean") return value;
    return /^(true|1|yes)$/i.test(String(value || "").trim());
  }

  function scrubPresetCategoriesFromCustoms(list){
    return (Array.isArray(list) ? list : []).filter(c => !isPresetCategory(c));
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

  function taxonomyDefaultsFor(name, slug){
    const key = compactCategorySlug(slug || slugify(name) || "").toLowerCase();
    const label = String(name || "").toLowerCase();
    const preset = PRESETS.find(p => p.slug === key || compactCategorySlug(p.slug) === key || p.name.toLowerCase() === label);
    if (preset) {
      return {
        productLineLabel: preset.productLineLabel || "Type",
        variantLabelName: preset.variantLabelName || "Variant",
        productLinePlural: preset.productLinePlural || `${String(preset.productLineLabel || "Type").toLowerCase()}s`,
        variantPlural: preset.variantPlural || `${String(preset.variantLabelName || "Variant").toLowerCase()}s`,
        primaryLabel: preset.primaryLabel || "Brand",
        primaryPlural: preset.primaryPlural || "Brands",
        subBrandLabel: preset.subBrandLabel || "Sub-brand",
        breadcrumb: preset.hint || "",
        hint: preset.hint || "",
        examples: { ...(preset.examples || {}) },
        usesSubBrands: preset.usesSubBrands !== false,
        variantAttrMode: preset.variantAttrMode || "none",
        defaultSellBy: preset.defaultSellBy || null,
        qtyPattern: preset.qtyPattern || "count",
        usesBrands: preset.usesBrands !== false,
        usesProductLines: !!preset.usesProductLines,
        usesVariants: !!preset.usesVariants
      };
    }
    if (key === "books" || /\bbooks?\b/.test(label)) {
      return taxonomyDefaultsFor("Books", "books");
    }
    if (key === "perfumes" || /perfume/.test(label)) {
      return taxonomyDefaultsFor("Perfumes", "perfumes");
    }
    if (key === "liquids" || /liquid/.test(label)) {
      return taxonomyDefaultsFor("Liquids", "liquids");
    }
    if (key === "clothing" || /cloth/.test(label)) {
      return taxonomyDefaultsFor("Clothing", "clothing");
    }
    return {
      productLineLabel: "Type",
      variantLabelName: "Variant",
      productLinePlural: "types",
      variantPlural: "variants",
      primaryLabel: "Brand",
      primaryPlural: "Brands",
      subBrandLabel: "Sub-brand",
      breadcrumb: "Brand → Type → Variant",
      hint: "Brand → Type → Variant",
      examples: {
        primary: "e.g. Brand name",
        subBrand: "e.g. Sub-brand",
        productLine: "e.g. Type name",
        variant: "e.g. Size / pack",
        storage: "",
        color: "",
        other: ""
      },
      usesSubBrands: true,
      variantAttrMode: "none",
      defaultSellBy: null,
      qtyPattern: "count",
      usesBrands: true,
      usesProductLines: true,
      usesVariants: true
    };
  }

  function readTaxonomyMeta(row){
    const meta = row?.meta && typeof row.meta === "object" ? row.meta : {};
    const tax = meta.taxonomy && typeof meta.taxonomy === "object" ? meta.taxonomy : {};
    return tax;
  }

  function buildTaxonomyPayload(cfg = {}){
    return {
      primaryLabel: String(cfg.primaryLabel || "Brand"),
      primaryPlural: String(cfg.primaryPlural || "Brands"),
      subBrandLabel: String(cfg.subBrandLabel || "Sub-brand"),
      productLineLabel: String(cfg.productLineLabel || "Type"),
      productLinePlural: String(cfg.productLinePlural || "types"),
      variantLabelName: String(cfg.variantLabelName || "Variant"),
      variantPlural: String(cfg.variantPlural || "variants"),
      breadcrumb: String(cfg.breadcrumb || cfg.hint || ""),
      hint: String(cfg.hint || ""),
      examples: cfg.examples && typeof cfg.examples === "object" ? cfg.examples : {},
      usesSubBrands: cfg.usesSubBrands !== false,
      variantAttrMode: String(cfg.variantAttrMode || "none"),
      defaultSellBy: cfg.defaultSellBy || null
    };
  }

  function normalizePreset(row){
    const name = String(row?.name || "General").trim() || "General";
    const slug = String(row?.slug || slugify(name));
    const tax = taxonomyDefaultsFor(name, slug);
    const meta = row?.meta && typeof row.meta === "object" ? row.meta : {};
    const metaTax = readTaxonomyMeta(row);
    const productLineLabel = String(metaTax.productLineLabel || row?.product_line_label || row?.productLineLabel || tax.productLineLabel || "Type");
    const variantLabelName = String(metaTax.variantLabelName || row?.variant_label_name || row?.variantLabelName || tax.variantLabelName || "Variant");
    const primaryLabel = String(metaTax.primaryLabel || row?.primary_label || row?.primaryLabel || tax.primaryLabel || "Brand");
    const primaryPlural = String(metaTax.primaryPlural || row?.primary_plural || row?.primaryPlural || tax.primaryPlural || `${primaryLabel}s`);
    const subBrandLabel = String(metaTax.subBrandLabel || row?.sub_brand_label || row?.subBrandLabel || tax.subBrandLabel || "Sub-brand");
    const productLinePlural = String(metaTax.productLinePlural || row?.productLinePlural || tax.productLinePlural || `${productLineLabel.toLowerCase()}s`);
    const variantPlural = String(metaTax.variantPlural || row?.variantPlural || tax.variantPlural || `${variantLabelName.toLowerCase()}s`);
    const examples = {
      ...(tax.examples || {}),
      ...(metaTax.examples && typeof metaTax.examples === "object" ? metaTax.examples : {}),
      ...(row?.examples && typeof row.examples === "object" ? row.examples : {})
    };
    const usesSubBrands = metaTax.usesSubBrands != null
      ? !!metaTax.usesSubBrands
      : (row?.usesSubBrands != null ? !!row.usesSubBrands : tax.usesSubBrands !== false);
    const hint = String(metaTax.hint || row?.hint || tax.hint || "");
    const breadcrumb = String(metaTax.breadcrumb || row?.breadcrumb || hint || tax.breadcrumb || `${primaryLabel} → ${productLineLabel} → ${variantLabelName}`);
    return {
      id: row?.id || "",
      name,
      slug,
      meta,
      gridVisible: categoryGridVisible(row),
      usesBrands: row?.uses_brands != null ? !!row.uses_brands : (row?.usesBrands != null ? !!row.usesBrands : (tax.usesBrands !== false)),
      usesProductLines: row?.uses_product_lines != null ? !!row.uses_product_lines : (row?.usesProductLines != null ? !!row.usesProductLines : !!tax.usesProductLines),
      usesVariants: row?.uses_variants != null ? !!row.uses_variants : (row?.usesVariants != null ? !!row.usesVariants : !!tax.usesVariants),
      usesSubBrands,
      qtyPattern: String(row?.qty_pattern || row?.qtyPattern || tax.qtyPattern || "count").toLowerCase(),
      sortOrder: Number(row?.sort_order ?? row?.sortOrder ?? 100),
      hint,
      productLineLabel,
      variantLabelName,
      productLinePlural,
      variantPlural,
      primaryLabel,
      primaryPlural,
      subBrandLabel,
      breadcrumb,
      examples,
      variantAttrMode: String(metaTax.variantAttrMode || row?.variantAttrMode || tax.variantAttrMode || "none"),
      defaultSellBy: metaTax.defaultSellBy != null ? metaTax.defaultSellBy : (row?.defaultSellBy != null ? row.defaultSellBy : tax.defaultSellBy)
    };
  }

  function getCategoryTaxonomyLabels(nameOrCfg){
    const cfg = nameOrCfg && typeof nameOrCfg === "object"
      ? normalizePreset(nameOrCfg)
      : getCategoryConfig(nameOrCfg);
    return {
      productLine: cfg.productLineLabel || "Type",
      variant: cfg.variantLabelName || "Variant",
      productLinePlural: cfg.productLinePlural || "types",
      variantPlural: cfg.variantPlural || "variants",
      primary: cfg.primaryLabel || "Brand",
      primaryPlural: cfg.primaryPlural || "Brands",
      subBrand: cfg.subBrandLabel || "Sub-brand",
      breadcrumb: cfg.breadcrumb || "Brand → Type → Variant",
      qtyPattern: cfg.qtyPattern || "count",
      name: cfg.name || "",
      slug: cfg.slug || "",
      examples: cfg.examples || {},
      usesSubBrands: cfg.usesSubBrands !== false,
      variantAttrMode: cfg.variantAttrMode || "none",
      defaultSellBy: cfg.defaultSellBy || null,
      usesBrands: cfg.usesBrands !== false,
      usesProductLines: !!cfg.usesProductLines,
      usesVariants: !!cfg.usesVariants
    };
  }

  function categoryExample(cfgOrName, key, fallback = ""){
    const tax = getCategoryTaxonomyLabels(cfgOrName);
    const value = tax.examples?.[key];
    return String(value != null && value !== "" ? value : fallback);
  }

  function categoryBuilderFormHtml(values = {}, options = {}){
    const v = {
      name: values.name || "",
      usesBrands: values.usesBrands !== false,
      usesSubBrands: values.usesSubBrands !== false,
      usesProductLines: !!values.usesProductLines,
      usesVariants: values.usesVariants !== false,
      qtyPattern: String(values.qtyPattern || "count").toLowerCase(),
      primaryLabel: values.primaryLabel || "Brand",
      subBrandLabel: values.subBrandLabel || "Sub-brand",
      productLineLabel: values.productLineLabel || "Type",
      variantLabelName: values.variantLabelName || "Variant",
      hint: values.hint || ""
    };
    const idPrefix = options.idPrefix || "catBuilder";
    const title = options.title || "Category setup";
    return `
      <div class="inventory-category-builder" data-cat-builder="${h(idPrefix)}">
        <div class="inventory-section-card-top">
          <strong>${h(title)}</strong>
          <span class="badge green">${options.badge || "Setup"}</span>
        </div>
        <label class="inventory-edit-field inventory-edit-field-wide">
          <span>Category name</span>
          <input class="input" data-cat-field="name" value="${h(v.name)}" placeholder="e.g. Cosmetics, Auto parts" autocomplete="off" />
        </label>
        <div class="inventory-category-builder-flags">
          <label class="inventory-edit-check"><input type="checkbox" data-cat-field="usesBrands" ${v.usesBrands ? "checked" : ""} /> Brand / Author level</label>
          <label class="inventory-edit-check"><input type="checkbox" data-cat-field="usesSubBrands" ${v.usesSubBrands ? "checked" : ""} /> Sub-brand / Series</label>
          <label class="inventory-edit-check"><input type="checkbox" data-cat-field="usesProductLines" ${v.usesProductLines ? "checked" : ""} /> Type / Product line</label>
          <label class="inventory-edit-check"><input type="checkbox" data-cat-field="usesVariants" ${v.usesVariants ? "checked" : ""} /> Variant / Size / Spec</label>
        </div>
        <label class="inventory-edit-field">
          <span>Measure as</span>
          <select class="input" data-cat-field="qtyPattern">
            <option value="count" ${v.qtyPattern === "count" ? "selected" : ""}>Count (pcs)</option>
            <option value="weight" ${v.qtyPattern === "weight" ? "selected" : ""}>Weight</option>
            <option value="length" ${v.qtyPattern === "length" ? "selected" : ""}>Length</option>
            <option value="volume" ${v.qtyPattern === "volume" ? "selected" : ""}>Volume</option>
          </select>
        </label>
        <div class="inventory-category-builder-labels">
          <label class="inventory-edit-field"><span>Primary label</span><input class="input" data-cat-field="primaryLabel" value="${h(v.primaryLabel)}" placeholder="Brand or Author" /></label>
          <label class="inventory-edit-field"><span>Sub level label</span><input class="input" data-cat-field="subBrandLabel" value="${h(v.subBrandLabel)}" placeholder="Sub-brand or Series" /></label>
          <label class="inventory-edit-field"><span>Type label</span><input class="input" data-cat-field="productLineLabel" value="${h(v.productLineLabel)}" placeholder="Type / Fragrance / Style" /></label>
          <label class="inventory-edit-field"><span>Variant label</span><input class="input" data-cat-field="variantLabelName" value="${h(v.variantLabelName)}" placeholder="Size / Spec / Pack" /></label>
        </div>
        <p class="help inventory-category-builder-preview" data-cat-preview>Preview: ${h(v.hint || `${v.primaryLabel} → ${v.productLineLabel} → ${v.variantLabelName}`)}</p>
        ${options.actionsHtml || ""}
      </div>
    `;
  }

  function readCategoryBuilderForm(root){
    if (!root) return null;
    const val = (field) => root.querySelector(`[data-cat-field="${field}"]`);
    const name = String(val("name")?.value || "").replace(/\s+/g, " ").trim();
    const usesBrands = !!val("usesBrands")?.checked;
    const usesSubBrands = !!val("usesSubBrands")?.checked;
    const usesProductLines = !!val("usesProductLines")?.checked;
    const usesVariants = !!val("usesVariants")?.checked;
    const qtyPattern = String(val("qtyPattern")?.value || "count").toLowerCase();
    const primaryLabel = String(val("primaryLabel")?.value || "Brand").trim() || "Brand";
    const subBrandLabel = String(val("subBrandLabel")?.value || "Sub-brand").trim() || "Sub-brand";
    const productLineLabel = String(val("productLineLabel")?.value || "Type").trim() || "Type";
    const variantLabelName = String(val("variantLabelName")?.value || "Variant").trim() || "Variant";
    const parts = [];
    if (usesBrands) parts.push(primaryLabel);
    if (usesBrands && usesSubBrands) parts.push(subBrandLabel);
    if (usesProductLines) parts.push(productLineLabel);
    if (usesVariants) parts.push(variantLabelName);
    if (!parts.length) parts.push("Item");
    const hint = parts.join(" → ");
    return {
      name,
      usesBrands,
      usesSubBrands: usesBrands && usesSubBrands,
      usesProductLines,
      usesVariants,
      qtyPattern: ["count", "weight", "length", "volume"].includes(qtyPattern) ? qtyPattern : "count",
      primaryLabel,
      primaryPlural: `${primaryLabel}s`,
      subBrandLabel,
      productLineLabel,
      productLinePlural: `${productLineLabel.toLowerCase()}s`,
      variantLabelName,
      variantPlural: `${variantLabelName.toLowerCase()}s`,
      hint,
      breadcrumb: hint,
      examples: {
        primary: `e.g. ${primaryLabel} name`,
        subBrand: `e.g. ${subBrandLabel} name`,
        productLine: `e.g. ${productLineLabel} name`,
        variant: `e.g. ${variantLabelName}`,
        storage: "",
        color: "",
        other: ""
      }
    };
  }

  function bindCategoryBuilderPreview(root){
    if (!root || root.dataset.previewBound === "1") return;
    root.dataset.previewBound = "1";
    const refresh = () => {
      const data = readCategoryBuilderForm(root);
      const preview = root.querySelector("[data-cat-preview]");
      if (preview && data) preview.textContent = `Preview: ${data.hint}`;
    };
    root.addEventListener("input", refresh);
    root.addEventListener("change", refresh);
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
    const st = appState();
    const custom = ensureCustomCategoriesHydrated();
    const current = Array.isArray(st?.inventoryCategories) ? st.inventoryCategories : [];
    if (current.length) {
      st.inventoryCategories = mergeCategoryLists(current, custom);
      return st.inventoryCategories;
    }
    const fallback = mergeCategoryLists(presetCategories(), custom);
    if (st) {
      st.inventoryCategories = fallback;
      // Do NOT set inventoryCategoriesLoaded here — presets-only is not a DB load.
      // Leaving it false forces loadInventoryCategories to fetch from Supabase on refresh.
    }
    return fallback;
  }

  function getWizardCategories(){
    const list = ensureCategoriesLoaded();
    return list.length ? list : presetCategories();
  }

  async function loadInventoryCategories(force = false){
    const st = appState();
    if (!st) return presetCategories();
    ensureCustomCategoriesHydrated();

    // Early-return only after a real load attempt. Never skip RPC just because presets
    // were seeded into inventoryCategories (that caused empty customs to vanish on refresh).
    if (!force && st.inventoryCategoriesLoaded) {
      st.inventoryCategories = mergeCategoryLists(
        presetCategories(),
        st.inventoryCategories || [],
        st.inventoryCustomCategories || []
      );
      return st.inventoryCategories;
    }

    let rpcItems = [];
    try {
      if (typeof supabaseRpc === "function" && typeof databaseSessionCanLoad === "function" && databaseSessionCanLoad()) {
        const raw = await supabaseRpc("app_list_my_goods_categories", {});
        const res = typeof unwrapRpcJson === "function" ? unwrapRpcJson(raw) : raw;
        rpcItems = Array.isArray(res?.items) ? res.items.map(normalizePreset) : [];
      }
    } catch (err) {
      console.warn("Category config RPC unavailable; using presets + local customs.", err);
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
      sortOrder: 200,
      isCustom: true
    })).filter(row => !isPresetCategory(row));

    const custom = ensureCustomCategoriesHydrated();
    // User-created / non-preset DB categories → always kept in customs so empty grids survive refresh.
    const rpcCustoms = rpcItems
      .filter(r => r && !isPresetCategory(r))
      .map(r => ({ ...r, isCustom: true }));
    st.inventoryCustomCategories = scrubPresetCategoriesFromCustoms(
      mergeCategoryLists(custom, rpcCustoms, discoveredRows)
    );
    writeStoredCustomCategories(st.inventoryCustomCategories);
    st.inventoryCategories = mergeCategoryLists(
      presetCategories(),
      discoveredRows,
      st.inventoryCustomCategories,
      rpcItems
    );
    if (!st.inventoryCategories.length) st.inventoryCategories = presetCategories();
    // Only mark loaded after a DB session was available (RPC attempted). If the session
    // is not ready yet, leave false so the next inventory paint retries and restores
    // empty custom grids from Supabase after login/refresh.
    if (typeof databaseSessionCanLoad === "function" && databaseSessionCanLoad()) {
      st.inventoryCategoriesLoaded = true;
    } else if (typeof databaseSessionCanLoad !== "function") {
      st.inventoryCategoriesLoaded = true;
    }
    return st.inventoryCategories;
  }

  const CUSTOM_CATEGORIES_KEY = "triplem-inventory-custom-categories-v1";

  function readStoredCustomCategories(){
    try {
      const raw = global.localStorage?.getItem(CUSTOM_CATEGORIES_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.map(normalizePreset) : [];
    } catch (_) {
      return [];
    }
  }

  function writeStoredCustomCategories(list){
    try {
      global.localStorage?.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(Array.isArray(list) ? list : []));
    } catch (_) {}
  }

  function ensureCustomCategoriesHydrated(){
    const st = appState();
    if (!st) return [];
    const stored = readStoredCustomCategories();
    if (!Array.isArray(st.inventoryCustomCategories)) st.inventoryCustomCategories = [];
    const merged = mergeCategoryLists(st.inventoryCustomCategories, stored);
    const scrubbed = scrubPresetCategoriesFromCustoms(merged);
    st.inventoryCustomCategories = scrubbed;
    // Persist when sticky presets (e.g. Food & Grocery) were stripped from cache.
    if (scrubbed.length !== merged.length) writeStoredCustomCategories(scrubbed);
    return st.inventoryCustomCategories;
  }

  async function addCustomCategory(name, options = {}){
    const cleaned = String(name || "").replace(/\s+/g, " ").trim();
    if (!cleaned) throw new Error("Category name is required.");
    const st = appState();
    if (!st) throw new Error("App state is not ready. Refresh and try again.");
    // A built-in category (e.g. Perfumes) is already a DB configuration row.
    // Adding it means "show this grid", not "insert a duplicate category".
    const preset = findPresetCategory(cleaned);
    const source = preset
      ? {
          ...preset,
          usesBrands: options.usesBrands != null ? !!options.usesBrands : preset.usesBrands,
          usesProductLines: options.usesProductLines != null ? !!options.usesProductLines : preset.usesProductLines,
          usesVariants: options.usesVariants != null ? !!options.usesVariants : preset.usesVariants,
          usesSubBrands: options.usesSubBrands != null ? !!options.usesSubBrands : preset.usesSubBrands,
          qtyPattern: options.qtyPattern || preset.qtyPattern,
          sortOrder: options.sortOrder || preset.sortOrder,
          hint: options.hint || preset.hint,
          primaryLabel: options.primaryLabel || preset.primaryLabel,
          primaryPlural: options.primaryPlural || preset.primaryPlural,
          subBrandLabel: options.subBrandLabel || preset.subBrandLabel,
          productLineLabel: options.productLineLabel || preset.productLineLabel,
          productLinePlural: options.productLinePlural || preset.productLinePlural,
          variantLabelName: options.variantLabelName || preset.variantLabelName,
          variantPlural: options.variantPlural || preset.variantPlural,
          examples: options.examples || preset.examples,
          breadcrumb: options.breadcrumb || options.hint || preset.hint
        }
      : {
          name: cleaned,
          slug: slugify(cleaned),
          usesBrands: options.usesBrands != null ? !!options.usesBrands : true,
          usesProductLines: options.usesProductLines != null ? !!options.usesProductLines : true,
          usesVariants: options.usesVariants != null ? !!options.usesVariants : true,
          usesSubBrands: options.usesSubBrands != null ? !!options.usesSubBrands : true,
          qtyPattern: options.qtyPattern || "count",
          sortOrder: options.sortOrder || 150,
          hint: options.hint || "Custom category",
          primaryLabel: options.primaryLabel || "Brand",
          primaryPlural: options.primaryPlural || "Brands",
          subBrandLabel: options.subBrandLabel || "Sub-brand",
          productLineLabel: options.productLineLabel || "Type",
          productLinePlural: options.productLinePlural || "types",
          variantLabelName: options.variantLabelName || "Variant",
          variantPlural: options.variantPlural || "variants",
          examples: options.examples || {},
          breadcrumb: options.breadcrumb || options.hint || ""
        };
    let row = {
      ...normalizePreset(source),
      gridVisible: true,
      isCustom: !preset
    };
    const taxonomy = buildTaxonomyPayload(row);
    ensureCustomCategoriesHydrated();
    const knownRows = []
      .concat(Array.isArray(st.inventoryCategories) ? st.inventoryCategories : [])
      .concat(Array.isArray(st.inventoryCustomCategories) ? st.inventoryCustomCategories : []);
    const known = knownRows.find(c =>
      compactCategorySlug(c?.slug || slugify(c?.name || "")) === compactCategorySlug(row.slug)
      || String(c?.name || "").trim().toLowerCase() === row.name.toLowerCase()
    );
    // Persist to DB first so the category survives reload.
    if (typeof supabaseRpc === "function" && typeof databaseSessionCanLoad === "function" && databaseSessionCanLoad()) {
      try {
        const res = unwrapRpcJson(await supabaseRpc("app_upsert_goods_category", {
          // Existing hidden presets must update their real row, never insert a duplicate.
          p_id: known?.id || null,
          p_name: row.name,
          p_slug: row.slug,
          p_uses_brands: row.usesBrands,
          p_uses_product_lines: row.usesProductLines,
          p_uses_variants: row.usesVariants,
          p_qty_pattern: row.qtyPattern,
          p_sort_order: row.sortOrder,
          p_hint: row.hint,
          p_taxonomy: taxonomy
        }));
        if (res?.item) row = { ...normalizePreset({ ...row, ...res.item, id: res.item.id || row.id }), gridVisible: true, isCustom: !preset };
        else if (res?.id) row = { ...row, id: res.id, gridVisible: true };
        else if (res?.ok === false) throw new Error(res?.error || "Could not save category.");
      } catch (err) {
        console.warn("Could not persist new category to database.", err);
        // Do not create a local-only ghost when a live DB rejected the category.
        const message = String(err?.message || err || "");
        if (!/app_upsert_goods_category|Could not find the function|PGRST202|404/i.test(message)) {
          throw new Error(`Could not save “${row.name}”. Apply migration 070 and try again.`);
        }
      }
    }
    if (!preset) {
      if (!Array.isArray(st.inventoryCustomCategories)) st.inventoryCustomCategories = [];
      const existsIdx = st.inventoryCustomCategories.findIndex(c =>
        compactCategorySlug(c.slug || slugify(c.name)) === compactCategorySlug(row.slug)
      );
      if (existsIdx >= 0) st.inventoryCustomCategories[existsIdx] = { ...st.inventoryCustomCategories[existsIdx], ...row };
      else st.inventoryCustomCategories.push(row);
      writeStoredCustomCategories(st.inventoryCustomCategories);
    }
    // Keep the new category first in the live catalog list so empty tiles never drop it.
    st.inventoryCategories = mergeCategoryLists(
      [row],
      presetCategories(),
      st.inventoryCategories,
      st.inventoryCustomCategories
    );
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
    // Prefer "Brand · SubBrand? · Type · Variant" display names.
    if (name.includes("·")) {
      const parts = name.split("·").map(p => p.trim()).filter(Boolean);
      if (parts.length >= 4) return parts[2];
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
  function mergeProductLinesForBrand(brandName, stockItems = [], options = {}){
    const subBrandId = String(options.subBrandId || "").trim();
    const subBrandOnly = !!options.subBrandOnly;
    const fromStock = groupItemsByProductLine(
      (stockItems || []).filter(item => {
        const itemSub = String(item.subBrandId || "").trim();
        if (subBrandId) return itemSub === subBrandId;
        return !itemSub;
      })
    );
    const map = new Map(fromStock.map(row => [row.key, { ...row, fromCatalog: false }]));
    const brand = findBrandCatalogEntry(brandName);
    for (const line of (brand?.product_lines || [])) {
      const lineSub = String(line.sub_brand_id || line.subBrandId || "").trim();
      if (subBrandId && lineSub !== subBrandId) continue;
      if (subBrandOnly && !subBrandId && lineSub) continue;
      if (!subBrandOnly && !subBrandId && lineSub) continue;
      const name = String(line.name || "").trim();
      if (!name) continue;
      const key = productLineKey(name);
      if (map.has(key)) {
        const existing = map.get(key);
        existing.id = existing.id || line.id || "";
        existing.subBrandId = existing.subBrandId || lineSub;
        existing.catalogVariants = Array.isArray(line.variants) ? line.variants : [];
        continue;
      }
      map.set(key, {
        key,
        name,
        id: line.id || "",
        subBrandId: lineSub,
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

  async function renameBrandInline({ brandId, brandName, categoryName }){
    const name = String(brandName || "").replace(/\s+/g, " ").trim();
    const id = String(brandId || "").trim();
    if (!name) throw new Error("Brand name is required.");
    if (!id) throw new Error("Brand id is required to rename.");
    const res = unwrapRpcJson(await supabaseRpc("app_upsert_goods_brand", {
      p_id: id,
      p_name: name,
      p_item_type: categoryName || "General",
      p_notes: null
    }));
    if (typeof ensureInventoryBrandsLoaded === "function") await ensureInventoryBrandsLoaded(true);
    return { id: res?.id || id, name };
  }

  async function deleteBrandInline(brandId){
    const id = String(brandId || "").trim();
    if (!id) throw new Error("Brand id is required.");
    const res = unwrapRpcJson(await supabaseRpc("app_delete_goods_brand", { p_id: id }));
    if (typeof ensureInventoryBrandsLoaded === "function") await ensureInventoryBrandsLoaded(true);
    return res;
  }

  async function createProductLineInline({ brandName, categoryName, lineName, subBrandId = null }){
    const name = String(lineName || "").replace(/\s+/g, " ").trim();
    const brand = String(brandName || "").trim();
    const tax = getCategoryTaxonomyLabels(categoryName);
    if (!name) throw new Error(`${tax.productLine} name is required.`);
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
      p_sort_order: 0,
      p_sub_brand_id: subBrandId || null
    }));
    if (typeof ensureInventoryBrandsLoaded === "function") await ensureInventoryBrandsLoaded(true);
    return { id: res?.id || "", name, brandId: brandEntry.id, subBrandId: subBrandId || "" };
  }

  async function createSubBrandInline({ brandName, categoryName, subBrandName }){
    const name = String(subBrandName || "").replace(/\s+/g, " ").trim();
    const brand = String(brandName || "").trim();
    if (!name) throw new Error("Sub-brand name is required.");
    if (!brand) throw new Error("Brand is required.");
    let brandEntry = findBrandCatalogEntry(brand);
    if (!brandEntry?.id) {
      const created = await createBrandInline({ brandName: brand, categoryName });
      brandEntry = findBrandCatalogEntry(brand) || { id: created.id, name: brand };
    }
    const res = unwrapRpcJson(await supabaseRpc("app_upsert_goods_sub_brand", {
      p_id: null,
      p_brand_id: brandEntry.id,
      p_name: name,
      p_sort_order: 0
    }));
    if (typeof ensureInventoryBrandsLoaded === "function") await ensureInventoryBrandsLoaded(true);
    return { id: res?.id || "", name, brandId: brandEntry.id };
  }

  async function deleteSubBrandInline(subBrandId){
    const id = String(subBrandId || "").trim();
    if (!id) throw new Error("Sub-brand id is required.");
    const res = unwrapRpcJson(await supabaseRpc("app_delete_goods_sub_brand", { p_id: id }));
    if (typeof ensureInventoryBrandsLoaded === "function") await ensureInventoryBrandsLoaded(true);
    return res;
  }

  async function renameProductLineInline({ lineId, brandId, brandName, categoryName, lineName }){
    const name = String(lineName || "").replace(/\s+/g, " ").trim();
    const id = String(lineId || "").trim();
    const tax = getCategoryTaxonomyLabels(categoryName);
    if (!name) throw new Error(`${tax.productLine} name is required.`);
    if (!id) throw new Error(`${tax.productLine} id is required to rename.`);
    let resolvedBrandId = String(brandId || "").trim();
    if (!resolvedBrandId && brandName) {
      const brandEntry = findBrandCatalogEntry(brandName);
      resolvedBrandId = brandEntry?.id || "";
    }
    if (!resolvedBrandId) throw new Error("Brand is required.");
    const res = unwrapRpcJson(await supabaseRpc("app_upsert_goods_product_line", {
      p_id: id,
      p_brand_id: resolvedBrandId,
      p_name: name,
      p_category_name: categoryName || "General",
      p_sort_order: 0
    }));
    if (typeof ensureInventoryBrandsLoaded === "function") await ensureInventoryBrandsLoaded(true);
    return { id: res?.id || id, name, brandId: resolvedBrandId };
  }

  async function deleteProductLineInline(lineId){
    const id = String(lineId || "").trim();
    if (!id) throw new Error("Product line id is required.");
    const res = unwrapRpcJson(await supabaseRpc("app_delete_goods_product_line", { p_id: id }));
    if (typeof ensureInventoryBrandsLoaded === "function") await ensureInventoryBrandsLoaded(true);
    return res;
  }

  async function createVariantInline({ brandName, categoryName, productLineName, variantLabel, qtyPattern = "count" }){
    const label = String(variantLabel || "").replace(/\s+/g, " ").trim();
    const brand = String(brandName || "").trim();
    const lineName = String(productLineName || "").trim();
    const tax = getCategoryTaxonomyLabels(categoryName);
    if (!label) throw new Error(`${tax.variant} name is required.`);
    if (!brand) throw new Error("Brand is required.");
    if (!lineName) throw new Error(`${tax.productLine} is required.`);
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

  async function renameVariantInline({
    variantId,
    brandId,
    brandName,
    categoryName = "",
    productLineId = "",
    productLineName = "",
    variantLabel,
    qtyPattern = "count"
  }){
    const label = String(variantLabel || "").replace(/\s+/g, " ").trim();
    const id = String(variantId || "").trim();
    const tax = getCategoryTaxonomyLabels(categoryName || brandName);
    if (!label) throw new Error(`${tax.variant} name is required.`);
    if (!id) throw new Error(`${tax.variant} id is required to rename.`);
    let resolvedBrandId = String(brandId || "").trim();
    let brandEntry = resolvedBrandId
      ? (typeof getInventoryBrandCatalog === "function" ? getInventoryBrandCatalog() : []).find(b => String(b.id) === resolvedBrandId)
      : findBrandCatalogEntry(brandName);
    if (!resolvedBrandId) resolvedBrandId = brandEntry?.id || "";
    if (!resolvedBrandId) throw new Error("Brand is required.");
    let resolvedLineId = String(productLineId || "").trim();
    if (!resolvedLineId && productLineName) {
      const line = (brandEntry?.product_lines || findBrandCatalogEntry(brandName)?.product_lines || [])
        .find(l => productLineKey(l.name) === productLineKey(productLineName));
      resolvedLineId = line?.id || "";
    }
    const unit = typeof inventoryBaseUnitForCategory === "function" ? inventoryBaseUnitForCategory(qtyPattern) : "item";
    const res = unwrapRpcJson(await supabaseRpc("app_upsert_goods_brand_variant", {
      p_id: id,
      p_brand_id: resolvedBrandId,
      p_label: label,
      p_item_category: qtyPattern || "count",
      p_quantity_value: 1,
      p_quantity_unit: unit,
      p_sort_order: 0,
      p_product_line_id: resolvedLineId || null
    }));
    if (typeof ensureInventoryBrandsLoaded === "function") await ensureInventoryBrandsLoaded(true);
    return { id: res?.id || id, label, productLineId: resolvedLineId, brandId: resolvedBrandId };
  }

  async function deleteVariantInline(variantId){
    const id = String(variantId || "").trim();
    if (!id) throw new Error("Variant id is required.");
    const res = unwrapRpcJson(await supabaseRpc("app_delete_goods_brand_variant", { p_id: id }));
    if (typeof ensureInventoryBrandsLoaded === "function") await ensureInventoryBrandsLoaded(true);
    return res;
  }

  async function renameCategoryInline({
    categoryId,
    previousName = "",
    name,
    qtyPattern,
    usesBrands,
    usesProductLines,
    usesVariants,
    usesSubBrands,
    hint,
    sortOrder,
    primaryLabel,
    primaryPlural,
    subBrandLabel,
    productLineLabel,
    productLinePlural,
    variantLabelName,
    variantPlural,
    examples,
    breadcrumb,
    variantAttrMode,
    defaultSellBy,
    skipCatalogReload = false
  }){
    const cleaned = String(name || "").replace(/\s+/g, " ").trim();
    if (!cleaned) throw new Error("Category name is required.");
    const previous = getCategoryConfig(previousName || cleaned);
    let id = String(categoryId || previous.id || "").trim();
    // Prefer matching existing DB row by previous slug/name so rename updates instead of insert-dupe.
    if (!id && previousName) {
      const prevCfg = getCategoryConfig(previousName);
      id = String(prevCfg?.id || "").trim();
    }
    const previousSlug = String(previous.slug || slugify(previousName || cleaned)).trim();
    const nextSlug = slugify(cleaned);
    const mergedCfg = {
      ...previous,
      name: cleaned,
      usesBrands: usesBrands != null ? !!usesBrands : (previous.usesBrands !== false),
      usesProductLines: usesProductLines != null ? !!usesProductLines : !!previous.usesProductLines,
      usesVariants: usesVariants != null ? !!usesVariants : (previous.usesVariants !== false),
      usesSubBrands: usesSubBrands != null ? !!usesSubBrands : (previous.usesSubBrands !== false),
      qtyPattern: qtyPattern || previous.qtyPattern || "count",
      hint: hint != null ? hint : (previous.hint || null),
      primaryLabel: primaryLabel || previous.primaryLabel,
      primaryPlural: primaryPlural || previous.primaryPlural,
      subBrandLabel: subBrandLabel || previous.subBrandLabel,
      productLineLabel: productLineLabel || previous.productLineLabel,
      productLinePlural: productLinePlural || previous.productLinePlural,
      variantLabelName: variantLabelName || previous.variantLabelName,
      variantPlural: variantPlural || previous.variantPlural,
      examples: examples || previous.examples,
      breadcrumb: breadcrumb || hint || previous.breadcrumb,
      variantAttrMode: variantAttrMode || previous.variantAttrMode,
      defaultSellBy: defaultSellBy !== undefined ? defaultSellBy : previous.defaultSellBy
    };
    const taxonomy = buildTaxonomyPayload(mergedCfg);
    const res = unwrapRpcJson(await supabaseRpc("app_upsert_goods_category", {
      p_id: id || null,
      p_name: cleaned,
      // Always send the intended slug; server resolves collisions / cascades links.
      p_slug: nextSlug,
      p_uses_brands: mergedCfg.usesBrands,
      p_uses_product_lines: mergedCfg.usesProductLines,
      p_uses_variants: mergedCfg.usesVariants,
      p_qty_pattern: mergedCfg.qtyPattern,
      p_sort_order: sortOrder != null ? Number(sortOrder) : (previous.sortOrder || 100),
      p_hint: mergedCfg.hint,
      p_taxonomy: taxonomy
    }));
    if (!skipCatalogReload) await loadInventoryCategories(true);
    const item = res?.item || {};
    return {
      id: item.id || id,
      name: item.name || cleaned,
      slug: item.slug || nextSlug,
      previousSlug,
      item: item.id ? normalizePreset({ ...mergedCfg, ...item }) : normalizePreset(mergedCfg)
    };
  }

  async function persistInventoryCategoryOrder(orderedRows){
    const rows = (Array.isArray(orderedRows) ? orderedRows : [])
      .map((row, index) => ({
        id: String(row?.id || row?.categoryId || "").trim(),
        name: String(row?.name || row?.type || "").trim(),
        index
      }))
      .filter(row => row.id || row.name);
    if (!rows.length) return { ok: true, updated: 0 };

    const st = appState();
    ensureCustomCategoriesHydrated();

    const applyLocalSort = (list) => {
      if (!Array.isArray(list)) return false;
      let touched = false;
      rows.forEach(row => {
        const hit = list.find(c =>
          (row.id && String(c.id || "") === row.id)
          || (row.name && normalizeInventoryItemType(c.name).toLowerCase() === normalizeInventoryItemType(row.name).toLowerCase())
        );
        if (!hit) return;
        const nextOrder = row.index * 10;
        if (Number(hit.sortOrder) === nextOrder) return;
        hit.sortOrder = nextOrder;
        touched = true;
      });
      return touched;
    };

    const customTouched = applyLocalSort(st?.inventoryCustomCategories);
    const catalogTouched = applyLocalSort(st?.inventoryCategories);
    if (customTouched) writeStoredCustomCategories(st.inventoryCustomCategories);

    const ids = rows.map(r => r.id).filter(Boolean);
    if (!ids.length) {
      return { ok: true, updated: 0, localOnly: true };
    }

    try {
      const res = unwrapRpcJson(await supabaseRpc("app_reorder_goods_categories", {
        p_ordered_ids: ids
      }));
      // Keep local catalog in sync without a full reload flicker.
      applyLocalSort(st?.inventoryCategories);
      applyLocalSort(st?.inventoryCustomCategories);
      if (customTouched || catalogTouched) {
        try { writeStoredCustomCategories(st.inventoryCustomCategories || []); } catch (_) {}
      }
      return { ok: true, updated: Number(res?.updated || ids.length), ...(res || {}) };
    } catch (err) {
      const message = String(err?.message || err || "");
      // Fallback if migration 073 is not applied yet: update one-by-one via upsert.
      if (!/app_reorder_goods_categories|Could not find the function|PGRST202|404/i.test(message)) {
        throw err;
      }
      let updated = 0;
      for (const row of rows) {
        if (!row.id && !row.name) continue;
        const cfg = getCategoryConfig(row.name) || {};
        const categoryId = row.id || cfg.id || "";
        if (!categoryId && !row.name) continue;
        try {
          await renameCategoryInline({
            categoryId,
            previousName: row.name || cfg.name,
            name: row.name || cfg.name,
            sortOrder: row.index * 10,
            qtyPattern: cfg.qtyPattern,
            usesBrands: cfg.usesBrands,
            usesProductLines: cfg.usesProductLines,
            usesVariants: cfg.usesVariants,
            usesSubBrands: cfg.usesSubBrands,
            hint: cfg.hint,
            primaryLabel: cfg.primaryLabel,
            primaryPlural: cfg.primaryPlural,
            subBrandLabel: cfg.subBrandLabel,
            productLineLabel: cfg.productLineLabel,
            productLinePlural: cfg.productLinePlural,
            variantLabelName: cfg.variantLabelName,
            variantPlural: cfg.variantPlural,
            examples: cfg.examples,
            breadcrumb: cfg.breadcrumb,
            variantAttrMode: cfg.variantAttrMode,
            defaultSellBy: cfg.defaultSellBy,
            skipCatalogReload: true
          });
          updated += 1;
        } catch (inner) {
          console.warn("Category order upsert fallback failed:", row.name, inner);
        }
      }
      return { ok: true, updated, fallback: true };
    }
  }

  async function deleteCategoryInline(categoryId){
    const id = String(categoryId || "").trim();
    if (!id) throw new Error("Category id is required.");
    const st = appState();
    if (!st) throw new Error("App state is not ready. Refresh and try again.");
    const before = (Array.isArray(st.inventoryCategories) ? st.inventoryCategories : [])
      .concat(Array.isArray(st.inventoryCustomCategories) ? st.inventoryCustomCategories : [])
      .find(c => String(c.id || "") === id);
    const res = unwrapRpcJson(await supabaseRpc("app_delete_goods_category", { p_id: id }));
    ensureCustomCategoriesHydrated();
    const beforeSlug = String(before?.slug || "").trim().toLowerCase();
    const beforeName = String(before?.name || "").trim().toLowerCase();
    st.inventoryCustomCategories = (st.inventoryCustomCategories || []).filter(c => {
      if (String(c.id || "") === id) return false;
      if (beforeSlug && String(c.slug || "").trim().toLowerCase() === beforeSlug) return false;
      if (beforeName && String(c.name || "").trim().toLowerCase() === beforeName) return false;
      return true;
    });
    writeStoredCustomCategories(st.inventoryCustomCategories);
    if (Array.isArray(st.inventoryCategories)) {
      st.inventoryCategories = st.inventoryCategories.filter(c => {
        if (String(c.id || "") === id) return false;
        if (beforeSlug && String(c.slug || "").trim().toLowerCase() === beforeSlug) return false;
        if (beforeName && String(c.name || "").trim().toLowerCase() === beforeName) return false;
        return true;
      });
    }
    await loadInventoryCategories(true);
    return res;
  }

  function isBooksItemSource(src = {}){
    const type = String(src.category || src.itemType || src.item_type || "").trim();
    return /\bbooks?\b/i.test(type);
  }

  function buildItemDisplayName({ brand, subBrand, productLine, variantLabel, itemName, variantStorage, variantColor, category, itemType }){
    const primary = String(brand || "").trim();
    const parts = [
      isBooksItemSource({ category, itemType }) && primary ? `Author: ${primary}` : primary,
      subBrand,
      productLine,
      variantLabel
    ].map(v => String(v || "").trim()).filter(Boolean);
    let base = parts.length ? parts.join(" · ") : (String(itemName || "Item").trim() || "Item");
    const attrs = [variantStorage, variantColor].map(v => String(v || "").trim()).filter(Boolean);
    if (attrs.length) base = `${base} (${attrs.join(", ")})`;
    return base;
  }

  function formatInventoryReceiptLineName(src = {}){
    const primary = String(src.brand || "").trim();
    const parts = [
      isBooksItemSource(src) && primary ? `Author: ${primary}` : primary,
      src.subBrand,
      src.productLine,
      src.variantLabel
    ]
      .map(v => String(v || "").trim())
      .filter(Boolean);
    let base = parts.length
      ? parts.join(" · ")
      : (String(src.itemName || src.person_name || "Item").trim() || "Item");
    const attrs = [src.variantStorage, src.variantColor, src.storage, src.color]
      .map(v => String(v || "").trim())
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i);
    if (attrs.length) base = `${base} (${attrs.join(", ")})`;
    return base;
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
        topIntent: "",
        brand: "",
        brandId: "",
        branchPath: "",
        subBrand: "",
        subBrandId: "",
        productLine: "",
        productLineId: "",
        variantLabel: "",
        variantId: "",
        variantStorage: "",
        variantColor: "",
        variantOther: "",
        itemName: "",
        qty: "1",
        unit: "item",
        qtyPatternOverride: "",
        sellBy: "",
        bottles: "1",
        unitCost: "",
        unitSell: "",
        currency: state.lastCurrency || "AED",
        description: "",
        boughtDate: typeof todayISO === "function" ? todayISO() : ""
      };
    }
    return state.inventoryAddWizard;
  }

  /** Dynamic wizard steps from intent + branch (see inventory add-flow plan). */
  function buildAddWizardSteps(w, cfg){
    const steps = [];
    if (!w.categoryLocked) steps.push("category");

    if (!cfg.usesBrands) {
      if (cfg.usesProductLines) steps.push("productLine");
      if (cfg.usesVariants) steps.push("variant");
      steps.push("stock");
      return steps;
    }

    steps.push("intent");
    const intent = String(w.topIntent || "");
    if (!intent) return steps;

    if (intent === "brands") {
      steps.push("multiBrand");
      return steps;
    }
    if (intent === "directStock") {
      steps.push("stock");
      return steps;
    }

    // chooseBrand — pick/create one brand, then branch
    steps.push("brand");
    steps.push("branch");
    if (w.branchPath === "subBrand") {
      steps.push("multiSubBrand");
      if (cfg.usesProductLines) steps.push("multiType");
      if (cfg.usesVariants) steps.push("variant");
    } else if (w.branchPath === "type") {
      if (cfg.usesProductLines) steps.push("multiType");
      if (cfg.usesVariants) steps.push("variant");
    }
    // branchPath === "directStock": brand → stock (optional name on stock step)
    steps.push("stock");
    return steps;
  }

  function wizardQtyPattern(w, cfg){
    const override = String(w.qtyPatternOverride || "").toLowerCase();
    if (["count", "weight", "length", "volume"].includes(override)) return override;
    return String(cfg.qtyPattern || "count").toLowerCase();
  }

  function collectWizardMultiNames(rootId){
    const root = document.getElementById(rootId);
    if (!root) return [];
    const seen = new Set();
    const names = [];
    root.querySelectorAll(".inventory-multi-inline-input").forEach(input => {
      const value = String(input.value || "").replace(/\s+/g, " ").trim();
      if (!value) return;
      const key = value.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      names.push(value);
    });
    return names;
  }

  function wizardMultiListHtml(rootId, placeholder, rows = 2){
    const rowHtml = Array.from({ length: Math.max(1, rows) }, () => `
      <div class="inventory-multi-inline-row">
        <input class="input inventory-multi-inline-input" type="text" maxlength="120" placeholder="${h(placeholder)}" autocomplete="off" />
      </div>`).join("");
    return `
      <div class="inventory-multi-inline-editor" id="${h(rootId)}">
        <div class="inventory-multi-inline-rows">${rowHtml}</div>
        <div class="inventory-multi-inline-actions">
          <button type="button" class="tiny ghost" data-wizard-multi-add="${h(rootId)}">+ Another</button>
        </div>
        <p class="help inventory-multi-inline-hint">One name per row. Continue saves all.</p>
      </div>`;
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
    const categoryKey = String(w.category || "").trim().toLowerCase();
    const brands = brandCatalog
      .filter(b => {
        if (!categoryKey) return true;
        const bt = String(b.item_type || "").trim().toLowerCase();
        if (!bt) return false; // don't leak untyped brands across categories
        if (bt === categoryKey) return true;
        // Soft match Perfumes / Perfume etc.
        return bt.includes(categoryKey) || categoryKey.includes(bt.replace(/s$/, ""));
      })
      .slice()
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" }));
    const selectedBrand = brands.find(b => String(b.id) === String(w.brandId) || String(b.name).toLowerCase() === String(w.brand).toLowerCase());
    const subBrands = (Array.isArray(selectedBrand?.sub_brands) ? selectedBrand.sub_brands : [])
      .slice()
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" }));
    const selectedSubBrand = subBrands.find(s => String(s.id) === String(w.subBrandId) || String(s.name).toLowerCase() === String(w.subBrand).toLowerCase());
    const productLines = (Array.isArray(selectedBrand?.product_lines) ? selectedBrand.product_lines : [])
      .filter(l => {
        if (w.branchPath !== "subBrand") return !l.sub_brand_id;
        if (!w.subBrandId || w.subBrandId === "__custom__") return false;
        return String(l.sub_brand_id || "") === String(w.subBrandId);
      })
      .slice()
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" }));
    const selectedLine = productLines.find(l => String(l.id) === String(w.productLineId) || String(l.name).toLowerCase() === String(w.productLine).toLowerCase());
    const variants = (Array.isArray(selectedLine?.variants)
      ? selectedLine.variants
      : (Array.isArray(selectedBrand?.variants) ? selectedBrand.variants.filter(v => !w.productLineId || String(v.product_line_id || "") === String(w.productLineId)) : []))
      .slice()
      .sort((a, b) => String(a.label || a.name || "").localeCompare(String(b.label || b.name || ""), undefined, { sensitivity: "base" }));

    const tax = getCategoryTaxonomyLabels(cfg);
    const isBooks = tax.primary === "Author";
    const primaryArticle = /^[aeiou]/i.test(tax.primary) ? "an" : "a";
    const ex = tax.examples || {};
    const primaryExample = categoryExample(cfg, "primary", isBooks ? "e.g. Author name" : "e.g. Brand name");
    const subBrandExample = categoryExample(cfg, "subBrand", isBooks ? "e.g. Series name" : `e.g. ${tax.subBrand} name`);
    const lineExample = categoryExample(cfg, "productLine", `e.g. ${tax.productLine} name`);
    const variantExample = categoryExample(cfg, "variant", `e.g. ${tax.variant}`);
    const storagePlaceholder = categoryExample(cfg, "storage", isBooks ? "e.g. ISBN" : "e.g. Storage");
    const colorPlaceholder = categoryExample(cfg, "color", isBooks ? "e.g. Language" : "e.g. Color");
    const otherPlaceholder = categoryExample(cfg, "other", "Optional note");
    const linePlaceholder = lineExample;
    const variantPlaceholder = variantExample;
    const steps = buildAddWizardSteps(w, cfg);
    // Keep step index valid after category lock / intent changes the step list.
    if (w.step > steps.length) w.step = steps.length;
    if (w.step < 1) w.step = 1;
    const stepLabel = (key) => ({
      category: "Category",
      intent: "What to add",
      multiBrand: tax.primaryPlural,
      brand: tax.primary,
      branch: "Continue with",
      multiSubBrand: `${tax.subBrand}(s)`,
      multiType: tax.productLinePlural || `${tax.productLine}s`,
      subBrand: tax.subBrand,
      productLine: tax.productLine,
      variant: tax.variant,
      stock: "Stock"
    }[key] || key);

    if (title) {
      title.textContent = w.categoryLocked
        ? `Add ${w.category || "inventory"}`
        : "Add inventory item";
    }
    if (help) {
      help.textContent = w.categoryLocked
        ? `${w.category} · ${steps.map((s, i) => (i + 1 === w.step ? `· ${stepLabel(s)}` : stepLabel(s))).join(" → ")}`
        : `${steps.map((s, i) => (i + 1 === w.step ? `· ${stepLabel(s)}` : stepLabel(s))).join(" → ")}`;
    }

    let fields = "";
    const currentStep = steps[w.step - 1] || (w.categoryLocked ? "intent" : "category");
    if (currentStep === "category") {
      const sortedCategories = categories.slice().sort((a, b) =>
        (a.sortOrder - b.sortOrder) || String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" })
      );
      fields = `
        <div class="inventory-add-category-block">
          <div class="inventory-add-category-head">
            <strong>Choose category</strong>
            <span>${h(String(sortedCategories.length))} available</span>
          </div>
          <div class="inventory-add-category-grid" id="addWizardCategoryGrid">
            ${sortedCategories.map(c => `
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
    } else if (currentStep === "intent") {
      fields = `
        <p class="help">Choose what to add under <strong>${h(w.category || "this category")}</strong>.</p>
        <div class="inventory-add-branch-grid">
          <button type="button" class="inventory-add-category-card ${w.topIntent === "brands" ? "is-selected" : ""}" data-top-intent="brands">
            <strong>Add ${h(tax.primary.toLowerCase())}(s)</strong>
            <span>Create one or many ${h(tax.primary.toLowerCase())} names</span>
          </button>
          <button type="button" class="inventory-add-category-card ${w.topIntent === "chooseBrand" ? "is-selected" : ""}" data-top-intent="chooseBrand">
            <strong>Use ${primaryArticle} ${h(tax.primary.toLowerCase())}</strong>
            <span>Pick or create one ${h(tax.primary.toLowerCase())}, then ${h(tax.subBrand.toLowerCase())} / ${h(tax.productLine.toLowerCase())} / item</span>
          </button>
          <button type="button" class="inventory-add-category-card ${w.topIntent === "directStock" ? "is-selected" : ""}" data-top-intent="directStock">
            <strong>Add item with stock</strong>
            <span>Skip brand — add stock now (Unbranded)</span>
          </button>
        </div>`;
    } else if (currentStep === "multiBrand") {
      fields = `
        <p class="help">Add one or more ${h(tax.primary.toLowerCase())} names for <strong>${h(w.category)}</strong>.</p>
        ${wizardMultiListHtml("addWizardMultiBrand", primaryExample, 2)}`;
    } else if (currentStep === "brand") {
      fields = `
        ${w.categoryLocked ? `<p class="help">Adding under <strong>${h(w.category)}</strong> only. ${h(tax.primaryPlural)} and items stay in this category.</p>` : ""}
        <label class="inventory-edit-field inventory-edit-field-wide">
          <span>${h(tax.primary)}</span>
          <select class="select" id="addWizardBrand">
            <option value="">Select ${h(tax.primary.toLowerCase())}…</option>
            ${brands.map(b => `<option value="${h(b.id)}" ${String(b.id) === String(w.brandId) ? "selected" : ""}>${h(b.name)}</option>`).join("")}
            <option value="__custom__">+ New ${h(tax.primary.toLowerCase())}…</option>
          </select>
        </label>
        <label class="inventory-edit-field inventory-edit-field-wide ${w.brandId === "__custom__" || (!w.brandId && w.brand) ? "" : "hide"}" id="addWizardBrandCustomWrap">
          <span>New ${h(tax.primary.toLowerCase())} name</span>
          <input class="input" id="addWizardBrandCustom" value="${h(w.brandId === "__custom__" || !w.brandId ? w.brand : "")}" placeholder="${h(primaryExample)}" />
        </label>`;
    } else if (currentStep === "branch") {
      fields = `
        <p class="help">${h(tax.primary)} <strong>${h(w.brand || "selected")}</strong> — what next?</p>
        <div class="inventory-add-branch-grid">
          ${tax.usesSubBrands !== false ? `
          <button type="button" class="inventory-add-category-card ${w.branchPath === "subBrand" ? "is-selected" : ""}" data-branch-path="subBrand">
            <strong>${h(tax.subBrand)}(s)</strong>
            <span>${h(tax.primary)} → ${h(tax.subBrand)} → ${h(tax.productLine)} → ${h(tax.variant)}</span>
          </button>` : ""}
          ${cfg.usesProductLines ? `
          <button type="button" class="inventory-add-category-card ${w.branchPath === "type" ? "is-selected" : ""}" data-branch-path="type">
            <strong>${h(tax.productLine)}(s)</strong>
            <span>${h(tax.primary)} → ${h(tax.productLine)} → ${h(tax.variant)}</span>
          </button>` : ""}
          <button type="button" class="inventory-add-category-card ${w.branchPath === "directStock" ? "is-selected" : ""}" data-branch-path="directStock">
            <strong>Add item with stock</strong>
            <span>Skip to stock under this brand</span>
          </button>
        </div>`;
    } else if (currentStep === "multiSubBrand") {
      fields = `
        <p class="help">Add ${h(tax.subBrand.toLowerCase())}(s) under <strong>${h(w.brand)}</strong>.</p>
        ${wizardMultiListHtml("addWizardMultiSubBrand", subBrandExample, 2)}
        ${subBrands.length ? `<p class="help">Existing: ${h(subBrands.map(s => s.name).join(", "))}</p>` : ""}`;
    } else if (currentStep === "multiType") {
      fields = `
        <p class="help">Add ${h(tax.productLinePlural || (tax.productLine + "s")).toLowerCase()} under <strong>${h(w.brand)}${w.subBrand ? ` · ${h(w.subBrand)}` : ""}</strong>.</p>
        ${wizardMultiListHtml("addWizardMultiType", lineExample, 2)}
        ${productLines.length ? `<p class="help">Existing: ${h(productLines.map(l => l.name).join(", "))}</p>` : ""}`;
    } else if (currentStep === "subBrand") {
      fields = `
        <label class="inventory-edit-field inventory-edit-field-wide">
          <span>${h(tax.subBrand)}</span>
          <select class="select" id="addWizardSubBrand">
            <option value="">Select ${h(tax.subBrand.toLowerCase())}…</option>
            ${subBrands.map(s => `<option value="${h(s.id)}" ${String(s.id) === String(w.subBrandId) ? "selected" : ""}>${h(s.name)}</option>`).join("")}
            <option value="__custom__">+ New ${h(tax.subBrand.toLowerCase())}…</option>
          </select>
        </label>
        <label class="inventory-edit-field inventory-edit-field-wide ${w.subBrandId === "__custom__" || (!w.subBrandId && w.subBrand) ? "" : "hide"}" id="addWizardSubBrandCustomWrap">
          <span>New ${h(tax.subBrand.toLowerCase())} name</span>
          <input class="input" id="addWizardSubBrandCustom" value="${h(w.subBrandId === "__custom__" || !w.subBrandId ? w.subBrand : "")}" placeholder="${h(subBrandExample)}" />
        </label>`;
    } else if (currentStep === "productLine") {
      fields = `
        <label class="inventory-edit-field inventory-edit-field-wide">
          <span>${h(tax.productLine)}</span>
          <select class="select" id="addWizardProductLine">
            <option value="">Select ${h(tax.productLine.toLowerCase())}…</option>
            ${productLines.map(l => `<option value="${h(l.id)}" ${String(l.id) === String(w.productLineId) ? "selected" : ""}>${h(l.name)}</option>`).join("")}
            <option value="__custom__">+ New ${h(tax.productLine.toLowerCase())}…</option>
          </select>
        </label>
        <label class="inventory-edit-field inventory-edit-field-wide ${w.productLineId === "__custom__" || (!w.productLineId && w.productLine) ? "" : "hide"}" id="addWizardLineCustomWrap">
          <span>New ${h(tax.productLine.toLowerCase())} name</span>
          <input class="input" id="addWizardProductLineCustom" value="${h(w.productLineId === "__custom__" || !w.productLineId ? w.productLine : "")}" placeholder="${h(linePlaceholder)}" />
        </label>
        <p class="help">${h(tax.breadcrumb)}</p>`;
    } else if (currentStep === "variant") {
      const storageLabel = tax.variantAttrMode === "isbn_language" || isBooks ? "ISBN" : "Storage";
      const colorLabel = tax.variantAttrMode === "isbn_language" || isBooks ? "Language" : "Color";
      fields = `
        <label class="inventory-edit-field inventory-edit-field-wide">
          <span>${h(tax.variant)}</span>
          <select class="select" id="addWizardVariant">
            <option value="">Select ${h(tax.variant.toLowerCase())}…</option>
            ${variants.map(v => `<option value="${h(v.id)}" ${String(v.id) === String(w.variantId) ? "selected" : ""}>${h(v.label)}</option>`).join("")}
            <option value="__custom__">+ New ${h(tax.variant.toLowerCase())}…</option>
          </select>
        </label>
        <label class="inventory-edit-field inventory-edit-field-wide ${w.variantId === "__custom__" || (!w.variantId && w.variantLabel) ? "" : "hide"}" id="addWizardVariantCustomWrap">
          <span>New ${h(tax.variant.toLowerCase())}</span>
          <input class="input" id="addWizardVariantCustom" value="${h(w.variantId === "__custom__" || !w.variantId ? w.variantLabel : "")}" placeholder="${h(variantPlaceholder)}" />
        </label>
        <div class="inventory-draft-form" style="margin-top:8px">
          <label class="inventory-edit-field">
            <span>${h(storageLabel)} <em class="optional-label">optional</em></span>
            <input class="input" id="addWizardVariantStorage" value="${h(w.variantStorage || "")}" placeholder="${h(storagePlaceholder)}" />
          </label>
          <label class="inventory-edit-field">
            <span>${h(colorLabel)} <em class="optional-label">optional</em></span>
            <input class="input" id="addWizardVariantColor" value="${h(w.variantColor || "")}" placeholder="${h(colorPlaceholder)}" />
          </label>
          <label class="inventory-edit-field inventory-edit-field-wide">
            <span>Other specs <em class="optional-label">optional</em></span>
            <input class="input" id="addWizardVariantOther" value="${h(w.variantOther || "")}" placeholder="${h(otherPlaceholder)}" />
          </label>
        </div>`;
    } else {
      const pattern = wizardQtyPattern(w, cfg);
      const sizeHint = typeof parseInventorySizeHint === "function" ? parseInventorySizeHint(w.variantLabel) : null;
      const sizeLocked = pattern === "volume" && !!sizeHint;
      const defaultSellBy = typeof defaultInventorySellBy === "function"
        ? defaultInventorySellBy({ categorySlug: cfg.slug, categoryName: cfg.name || w.category, qtyPattern: pattern })
        : "volume";
      const sellBy = pattern === "volume"
        ? (typeof normalizeInventorySellBy === "function"
          ? normalizeInventorySellBy(w.sellBy || "", defaultSellBy)
          : (w.sellBy || defaultSellBy))
        : "volume";
      if (pattern === "volume" && !w.sellBy) w.sellBy = sellBy;
      const useBottleCost = sizeLocked || (pattern === "volume" && sellBy === "bottle");
      const defaultPriceUnit = w.priceUnit || w.unit || (pattern === "volume" ? "ml" : (typeof inventoryBaseUnitForCategory === "function" ? inventoryBaseUnitForCategory(pattern) : "item"));
      const defaultQty = sizeHint ? String(sizeHint.qty) : (w.qty || (pattern === "volume" ? "100" : "1"));
      const sizeUnit = sizeHint?.unit || (pattern === "volume" ? "ml" : defaultPriceUnit);
      const unitOptions = typeof inventoryUnitSelectOptionsHtml === "function"
        ? inventoryUnitSelectOptionsHtml(pattern, defaultPriceUnit)
        : `<option value="item">Pcs</option>`;
      const volLabels = pattern === "volume"
        ? (useBottleCost && typeof inventoryVolumeBottleCostLabels === "function"
          ? inventoryVolumeBottleCostLabels()
          : (typeof inventoryVolumeBottleLabels === "function"
            ? inventoryVolumeBottleLabels(defaultQty, defaultPriceUnit)
            : null))
        : null;
      const qtyLabel = pattern === "volume" ? "Bottle size" : pattern === "weight" ? "Weight" : pattern === "length" ? "Length" : "Quantity";
      const costLabel = useBottleCost
        ? "Bottle cost"
        : (volLabels?.cost || (pattern === "volume" ? "Cost / ml" : "Cost / unit"));
      const sellLabel = useBottleCost
        ? "Bottle sell"
        : (volLabels?.sell || (pattern === "volume" ? "Sell / ml" : "Sell / unit"));
      const sizeText = sizeHint
        ? `${typeof trimInventoryNumber === "function" ? trimInventoryNumber(sizeHint.qty, 3) : sizeHint.qty} ${sizeHint.unit === "l" ? "L" : "ml"}`
        : "";
      const measureHtml = `
        <div class="inventory-edit-field inventory-edit-field-wide">
          <span>Measure as</span>
          <div class="inventory-add-branch-grid" style="margin-top:6px">
            ${[
              ["count", "Pcs / count", "Whole pieces"],
              ["weight", "Weight", "kg / g"],
              ["length", "Length", "m / cm"],
              ["volume", "Volume", "L / ml · pours or bottles"]
            ].map(([key, title, sub]) => `
              <button type="button" class="inventory-add-category-card ${pattern === key ? "is-selected" : ""}" data-qty-pattern="${key}">
                <strong>${title}</strong>
                <span>${sub}</span>
              </button>`).join("")}
          </div>
        </div>`;
      const sellByHtml = pattern === "volume"
        ? `<div class="inventory-edit-field inventory-edit-field-wide">
            <span>How will you sell this?</span>
            <div class="inventory-add-branch-grid" style="margin-top:6px">
              <button type="button" class="inventory-add-category-card ${sellBy === "volume" ? "is-selected" : ""}" data-sell-by="volume">
                <strong>By volume</strong>
                <span>Pour / measure (3 ml, 5 ml, custom)</span>
              </button>
              <button type="button" class="inventory-add-category-card ${sellBy === "bottle" ? "is-selected" : ""}" data-sell-by="bottle">
                <strong>By bottle</strong>
                <span>Whole bottles only (shampoo, sealed)</span>
              </button>
            </div>
          </div>`
        : "";
      const sizeLockHtml = (sizeLocked || (pattern === "volume" && sellBy === "bottle" && sizeHint))
        ? `<input type="hidden" id="addWizardQty" value="${h(defaultQty)}" />
          <input type="hidden" id="addWizardSizeUnit" value="${h(sizeUnit)}" />
          <label class="inventory-edit-field">
            <span>Bottles <em class="optional-label">${h(sizeText || `${defaultQty} ${sizeUnit === "l" ? "L" : "ml"}`)}</em></span>
            <input class="input" id="addWizardBottles" type="number" min="1" step="1" value="${h(w.bottles || "1")}" />
          </label>`
        : (pattern === "volume" && sellBy === "bottle"
          ? `<label class="inventory-edit-field">
              <span>${h(qtyLabel)}</span>
              <input class="input" id="addWizardQty" type="number" min="0.001" step="any" value="${h(defaultQty)}" />
            </label>
            <label class="inventory-edit-field">
              <span>Size unit</span>
              <select class="select" id="addWizardSizeUnit">${unitOptions}</select>
            </label>
            <label class="inventory-edit-field">
              <span>Bottles in stock</span>
              <input class="input" id="addWizardBottles" type="number" min="1" step="1" value="${h(w.bottles || "1")}" />
            </label>`
          : `<label class="inventory-edit-field">
              <span>${h(qtyLabel)}</span>
              <input class="input" id="addWizardQty" type="number" min="0.001" step="any" value="${h(defaultQty)}" />
            </label>`);
      const unitFieldHtml = useBottleCost
        ? `<input type="hidden" id="addWizardUnit" value="${h(sizeUnit)}" />`
        : `<label class="inventory-edit-field">
            <span>${pattern === "volume" ? "Price unit" : "Unit"}</span>
            <select class="select" id="addWizardUnit">${unitOptions}</select>
          </label>`;
      const needName = w.branchPath === "directStock" || w.topIntent === "directStock" || !w.variantLabel;
      fields = `
        ${needName ? `<label class="inventory-edit-field inventory-edit-field-wide">
          <span>Item name ${w.variantLabel ? `<em class="optional-label">optional</em>` : ""}</span>
          <input class="input" id="addWizardItemName" value="${h(w.itemName || buildItemDisplayName(w))}" placeholder="Display name" />
        </label>` : `<label class="inventory-edit-field inventory-edit-field-wide">
          <span>Item display name <em class="optional-label">auto</em></span>
          <input class="input" id="addWizardItemName" value="${h(w.itemName || buildItemDisplayName(w))}" />
        </label>`}
        ${(!w.variantLabel && (cfg.usesVariants || w.branchPath === "directStock")) ? `
          <label class="inventory-edit-field inventory-edit-field-wide">
            <span>${h(tax.variant)} <em class="optional-label">optional</em></span>
            <input class="input" id="addWizardVariantCustom" value="${h(w.variantLabel || "")}" placeholder="e.g. 100 ml, 512 GB" />
          </label>` : ""}
        ${measureHtml}
        ${sellByHtml}
        <div class="inventory-draft-form">
          ${sizeLockHtml}
          ${unitFieldHtml}
          <label class="inventory-edit-field">
            <span id="addWizardCostLabel">${h(costLabel)}</span>
            <input class="input" id="addWizardCost" type="number" min="0" step="0.01" value="${h(w.unitCost || "")}" placeholder="${useBottleCost ? "AED / bottle" : (pattern === "volume" ? `Per ${volLabels?.priceUnit || "ml"}` : "")}" />
          </label>
          <label class="inventory-edit-field">
            <span id="addWizardSellLabel">${h(sellLabel)} <em class="optional-label">optional</em></span>
            <input class="input" id="addWizardSell" type="number" min="0" step="0.01" value="${h(w.unitSell || "")}" placeholder="${useBottleCost ? "Optional" : (pattern === "volume" ? `Per ${volLabels?.priceUnit || "ml"}` : "Optional")}" />
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

    const onLastStep = w.step >= steps.length;
    const lastIsStock = currentStep === "stock";
    body.innerHTML = `
      <div class="inventory-add-wizard-steps">
        ${steps.map((s, i) => `<span class="${i + 1 === w.step ? "is-active" : (i + 1 < w.step ? "is-done" : "")}">${h(stepLabel(s))}</span>`).join("")}
      </div>
      ${fields}
      ${currentStep === "stock" && wizardQtyPattern(w, cfg) === "volume"
        ? `<p class="help">${(w.sellBy || "") === "bottle"
          ? "Sell by bottle: cart asks for whole bottles. Stock is still tracked as volume from bottle size × count."
          : ((typeof parseInventorySizeHint === "function" && parseInventorySizeHint(w.variantLabel))
            ? "Sell by volume: enter bottle cost (e.g. 100 ml for AED 100). Cart pours (3/5/10 ml) use the stored per-liter price."
            : "Sell by volume: choose price unit (ml or L). Cart pours calculate from the stored per-liter price.")}</p>`
        : ""}
      <div class="inventory-add-wizard-actions">
        <button type="button" class="btn ghost" id="addWizardBackBtn" ${w.step <= 1 ? "disabled" : ""}>Back</button>
        ${onLastStep && lastIsStock
          ? `<button type="button" class="btn soft" id="addWizardSaveAnotherBtn">Save &amp; add another</button>
             <button type="button" class="btn primary" id="addWizardNextBtn">Save item</button>`
          : `<button type="button" class="btn primary" id="addWizardNextBtn">${onLastStep ? (currentStep === "multiBrand" || currentStep === "multiSubBrand" || currentStep === "multiType" ? "Save" : "Save item") : "Continue"}</button>`}
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
    body.querySelector("#addWizardCreateCategoryBtn")?.addEventListener("click", async () => {
      const input = body.querySelector("#addWizardNewCategory");
      const name = String(input?.value || "").trim();
      if (!name) {
        alert("Enter a category name.");
        return;
      }
      const btn = body.querySelector("#addWizardCreateCategoryBtn");
      if (btn) btn.disabled = true;
      try {
        const created = await addCustomCategory(name);
        w.category = created.name;
        w.categoryLocked = false;
        if (input) input.value = "";
        try { await loadInventoryCategories(true); } catch (_) {}
        // Ensure the new category stays visible even if DB list RPC lags.
        ensureCustomCategoriesHydrated();
        state.inventoryCategories = mergeCategoryLists(
          presetCategories(),
          state.inventoryCategories || [],
          state.inventoryCustomCategories || [],
          [created]
        );
        renderAddItemWizard();
      } catch (err) {
        alert(err?.message || "Could not create category.");
      } finally {
        if (btn) btn.disabled = false;
      }
    });
    body.querySelector("#addWizardNewCategory")?.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        body.querySelector("#addWizardCreateCategoryBtn")?.click();
      }
    });
    body.querySelectorAll("[data-top-intent]").forEach(btn => {
      btn.addEventListener("click", () => {
        w.topIntent = btn.dataset.topIntent || "";
        if (w.topIntent === "directStock") {
          w.brand = "Unbranded";
          w.brandId = "";
          w.branchPath = "directStock";
          w.subBrand = "";
          w.subBrandId = "";
          w.productLine = "";
          w.productLineId = "";
        } else if (w.topIntent === "brands") {
          w.branchPath = "";
        } else if (w.topIntent === "chooseBrand") {
          w.branchPath = "";
          if (w.brand === "Unbranded") {
            w.brand = "";
            w.brandId = "";
          }
        }
        const nextSteps = buildAddWizardSteps(w, cfg);
        const intentIdx = nextSteps.indexOf("intent");
        w.step = intentIdx >= 0 ? intentIdx + 2 : 2;
        if (w.step > nextSteps.length) w.step = nextSteps.length;
        renderAddItemWizard();
      });
    });
    body.querySelectorAll("[data-wizard-multi-add]").forEach(btn => {
      btn.addEventListener("click", () => {
        const rootId = btn.dataset.wizardMultiAdd;
        const root = document.getElementById(rootId);
        const rows = root?.querySelector(".inventory-multi-inline-rows");
        if (!rows) return;
        const row = document.createElement("div");
        row.className = "inventory-multi-inline-row";
        row.innerHTML = `<input class="input inventory-multi-inline-input" type="text" maxlength="120" placeholder="Name" autocomplete="off" />`;
        rows.appendChild(row);
        row.querySelector("input")?.focus();
      });
    });
    body.querySelectorAll("[data-qty-pattern]").forEach(btn => {
      btn.addEventListener("click", () => {
        syncWizardFieldsFromDom();
        w.qtyPatternOverride = btn.dataset.qtyPattern || "";
        if (w.qtyPatternOverride !== "volume") w.sellBy = "";
        else if (!w.sellBy) {
          w.sellBy = typeof defaultInventorySellBy === "function"
            ? defaultInventorySellBy({ categorySlug: cfg.slug, categoryName: cfg.name || w.category, qtyPattern: "volume" })
            : "volume";
        }
        const base = typeof inventoryBaseUnitForCategory === "function"
          ? inventoryBaseUnitForCategory(w.qtyPatternOverride)
          : "item";
        w.unit = w.qtyPatternOverride === "volume" ? "ml" : base;
        w.priceUnit = w.unit;
        renderAddItemWizard();
      });
    });
    body.querySelector("#addWizardBrand")?.addEventListener("change", e => {
      w.brandId = e.target.value;
      const wrap = body.querySelector("#addWizardBrandCustomWrap");
      wrap?.classList.toggle("hide", w.brandId !== "__custom__");
      if (w.brandId && w.brandId !== "__custom__") {
        const b = brands.find(x => String(x.id) === String(w.brandId));
        w.brand = b?.name || "";
      }
      w.subBrand = "";
      w.subBrandId = "";
      w.productLine = "";
      w.productLineId = "";
      w.variantLabel = "";
      w.variantId = "";
    });
    body.querySelectorAll("[data-branch-path]").forEach(btn => {
      btn.addEventListener("click", () => {
        w.branchPath = btn.dataset.branchPath || "type";
        if (w.branchPath !== "subBrand") {
          w.subBrand = "";
          w.subBrandId = "";
        }
        body.querySelectorAll("[data-branch-path]").forEach(card => {
          card.classList.toggle("is-selected", card.dataset.branchPath === w.branchPath);
        });
        // Rebuild steps immediately so Continue lands on the right next page.
        const nextSteps = buildAddWizardSteps(w, cfg);
        const branchIdx = nextSteps.indexOf("branch");
        w.step = branchIdx >= 0 ? branchIdx + 1 : w.step;
        renderAddItemWizard();
      });
    });
    body.querySelector("#addWizardSubBrand")?.addEventListener("change", e => {
      w.subBrandId = e.target.value;
      body.querySelector("#addWizardSubBrandCustomWrap")?.classList.toggle("hide", w.subBrandId !== "__custom__");
      if (w.subBrandId && w.subBrandId !== "__custom__") {
        const s = subBrands.find(x => String(x.id) === String(w.subBrandId));
        w.subBrand = s?.name || "";
      }
      w.productLine = "";
      w.productLineId = "";
      w.variantLabel = "";
      w.variantId = "";
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
    body.querySelectorAll("[data-sell-by]").forEach(btn => {
      btn.addEventListener("click", () => {
        syncWizardFieldsFromDom();
        w.sellBy = btn.dataset.sellBy || "volume";
        renderAddItemWizard();
      });
    });
    body.querySelector("#addWizardBackBtn")?.addEventListener("click", () => {
      syncWizardFieldsFromDom();
      w.step = Math.max(1, w.step - 1);
      if (w.categoryLocked && steps[w.step - 1] === "category") w.step = Math.min(w.step + 1, steps.length);
      renderAddItemWizard();
    });
    const advanceOrSave = async ({ addAnother = false } = {}) => {
      syncWizardFieldsFromDom();
      const stepKey = steps[w.step - 1];
      if (w.step < steps.length) {
        if (!(await validateWizardStepAsync(stepKey, cfg))) return;
        w.step += 1;
        while (w.step <= steps.length) {
          const key = steps[w.step - 1];
          if (key === "brand" && !cfg.usesBrands) { w.step += 1; continue; }
          if (key === "branch" && !cfg.usesBrands) { w.step += 1; continue; }
          if (key === "subBrand" && w.branchPath !== "subBrand") { w.step += 1; continue; }
          if (key === "multiSubBrand" && w.branchPath !== "subBrand") { w.step += 1; continue; }
          if (key === "productLine" && (!cfg.usesProductLines || w.branchPath === "directStock")) { w.step += 1; continue; }
          if (key === "multiType" && (!cfg.usesProductLines || w.branchPath === "directStock")) { w.step += 1; continue; }
          if (key === "variant" && (!cfg.usesVariants || w.branchPath === "directStock")) { w.step += 1; continue; }
          break;
        }
        renderAddItemWizard();
        return;
      }
      if (!(await validateWizardStepAsync(stepKey, cfg))) return;
      // Catalog-only multi steps finish without stock.
      if (stepKey === "multiBrand" || stepKey === "multiSubBrand" || stepKey === "multiType") {
        if (stepKey === "multiBrand") {
          w.topIntent = "chooseBrand";
          w.branchPath = "";
          const nextSteps = buildAddWizardSteps(w, cfg);
          const branchIdx = nextSteps.indexOf("branch");
          w.step = branchIdx >= 0 ? branchIdx + 1 : nextSteps.length;
          renderAddItemWizard();
          return;
        }
        closeAddItemWizard();
        state.inventoryAddWizard = null;
        if (typeof renderInventoryList === "function") renderInventoryList();
        if (state.inventoryActiveSection) {
          try { await renderInventorySectionOverlayBody(state.inventoryActiveSection); } catch (_) {}
        }
        alert(stepKey === "multiSubBrand" ? "Sub-brand(s) saved." : `${tax.productLine}(s) saved.`);
        return;
      }
      try {
        await commitAddItemWizard({ addAnother });
      } catch (err) {
        alert(err?.message || "Could not save item.");
      }
    };
    body.querySelector("#addWizardNextBtn")?.addEventListener("click", () => {
      advanceOrSave({ addAnother: false }).catch(() => {});
    });
    body.querySelector("#addWizardSaveAnotherBtn")?.addEventListener("click", () => {
      advanceOrSave({ addAnother: true }).catch(() => {});
    });

    if (currentStep === "stock" && wizardQtyPattern(w, cfg) === "volume") {
      const sizeHintNow = typeof parseInventorySizeHint === "function" ? parseInventorySizeHint(w.variantLabel) : null;
      if (!sizeHintNow) {
        const refreshWizardPriceLabels = () => {
          const unitEl = body.querySelector("#addWizardUnit");
          const labels = typeof inventoryVolumeBottleLabels === "function"
            ? inventoryVolumeBottleLabels(body.querySelector("#addWizardQty")?.value, unitEl?.value)
            : { cost: "Cost / ml", sell: "Sell / ml", priceUnit: "ml" };
          const costLabel = body.querySelector("#addWizardCostLabel");
          const sellLabel = body.querySelector("#addWizardSellLabel");
          const costInput = body.querySelector("#addWizardCost");
          const sellInput = body.querySelector("#addWizardSell");
          if (costLabel) costLabel.textContent = labels.cost;
          if (sellLabel) sellLabel.textContent = `${labels.sell}`;
          if (costInput) costInput.placeholder = `Per ${labels.priceUnit}`;
          if (sellInput) sellInput.placeholder = `Per ${labels.priceUnit}`;
        };
        body.querySelector("#addWizardUnit")?.addEventListener("change", refreshWizardPriceLabels);
        refreshWizardPriceLabels();
      }
    }
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
    const branchSelected = document.querySelector("[data-branch-path].is-selected");
    if (branchSelected?.dataset?.branchPath) w.branchPath = branchSelected.dataset.branchPath;
    const subBrand = document.getElementById("addWizardSubBrand");
    if (subBrand) {
      w.subBrandId = subBrand.value;
      if (w.subBrandId === "__custom__") w.subBrand = String(document.getElementById("addWizardSubBrandCustom")?.value || "").trim();
      else if (w.subBrandId) {
        const brands = typeof getInventoryBrandCatalog === "function" ? getInventoryBrandCatalog() : (state.inventoryBrands || []);
        const b = brands.find(x => String(x.id) === String(w.brandId));
        const s = (b?.sub_brands || []).find(x => String(x.id) === String(w.subBrandId));
        w.subBrand = s?.name || w.subBrand;
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
    const storage = document.getElementById("addWizardVariantStorage");
    if (storage) w.variantStorage = String(storage.value || "").trim();
    const color = document.getElementById("addWizardVariantColor");
    if (color) w.variantColor = String(color.value || "").trim();
    const other = document.getElementById("addWizardVariantOther");
    if (other) w.variantOther = String(other.value || "").trim();
    const name = document.getElementById("addWizardItemName");
    if (name) w.itemName = name.value.trim();
    // Stock-step optional variant field (direct stock path)
    const variantOnStock = document.getElementById("addWizardVariantCustom");
    if (variantOnStock && !document.getElementById("addWizardVariant")) {
      w.variantLabel = String(variantOnStock.value || "").trim();
      w.variantId = w.variantLabel ? "__custom__" : "";
    }
    const qty = document.getElementById("addWizardQty");
    if (qty) w.qty = qty.value;
    const sizeUnit = document.getElementById("addWizardSizeUnit");
    if (sizeUnit) w.sizeUnit = sizeUnit.value;
    const bottles = document.getElementById("addWizardBottles");
    if (bottles) w.bottles = bottles.value;
    const sellBySelected = document.querySelector("[data-sell-by].is-selected");
    if (sellBySelected?.dataset?.sellBy) w.sellBy = sellBySelected.dataset.sellBy;
    const patternSelected = document.querySelector("[data-qty-pattern].is-selected");
    if (patternSelected?.dataset?.qtyPattern) w.qtyPatternOverride = patternSelected.dataset.qtyPattern;
    const unit = document.getElementById("addWizardUnit");
    if (unit) {
      w.priceUnit = unit.value;
      // Keep legacy unit field as price unit for open forms; size unit is separate when locked.
      w.unit = unit.value;
    }
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

  function validateWizardStep(stepKey, cfgInput){
    const w = wizardState();
    const cfg = cfgInput || getCategoryConfig(w.category);
    const tax = getCategoryTaxonomyLabels(cfg);
    const isBooks = tax.primary === "Author";
    if (stepKey === "category" && !w.category) {
      alert("Select a category.");
      return false;
    }
    if (stepKey === "intent" && !w.topIntent) {
      alert(`Choose what to add: ${tax.primaryPlural.toLowerCase()}, a ${tax.primary.toLowerCase()} path, or item with stock.`);
      return false;
    }
    if (stepKey === "brand") {
      const brandName = w.brandId === "__custom__" || !w.brandId
        ? String(document.getElementById("addWizardBrandCustom")?.value || w.brand || "").trim()
        : w.brand;
      if (!brandName) { alert(`Enter or select ${/^[aeiou]/i.test(tax.primary) ? "an" : "a"} ${tax.primary.toLowerCase()}.`); return false; }
      w.brand = brandName;
    }
    if (stepKey === "branch") {
      if (!w.branchPath) {
        alert(`Choose ${tax.subBrand}(s), ${tax.productLine}(s), or Add item with stock.`);
        return false;
      }
      if (!["subBrand", "type", "directStock"].includes(w.branchPath)) {
        alert(`Choose ${tax.subBrand}(s), ${tax.productLine}(s), or Add item with stock.`);
        return false;
      }
      if (w.branchPath !== "subBrand") {
        w.subBrand = "";
        w.subBrandId = "";
      }
    }
    if (stepKey === "subBrand") {
      const name = w.subBrandId === "__custom__" || !w.subBrandId
        ? String(document.getElementById("addWizardSubBrandCustom")?.value || w.subBrand || "").trim()
        : w.subBrand;
      if (!name) { alert(`Enter or select a ${tax.subBrand.toLowerCase()}.`); return false; }
      w.subBrand = name;
    }
    if (stepKey === "productLine") {
      const lineName = w.productLineId === "__custom__" || !w.productLineId
        ? String(document.getElementById("addWizardProductLineCustom")?.value || w.productLine || "").trim()
        : w.productLine;
      if (!lineName) {
        alert(`Enter or select a ${tax.productLine.toLowerCase()} (e.g. ${isBooks ? "1984 or The Great Gatsby" : (/perfume/i.test(cfg.name || "") ? "fragrance name" : "phone model, product name")}).`);
        return false;
      }
      w.productLine = lineName;
    }
    if (stepKey === "variant") {
      const variant = w.variantId === "__custom__" || !w.variantId
        ? String(document.getElementById("addWizardVariantCustom")?.value || w.variantLabel || "").trim()
        : w.variantLabel;
      if (!variant) {
        alert(`Enter or select a ${tax.variant.toLowerCase()} (e.g. ${isBooks ? "Paperback, Hardcover, 1st edition" : (/perfume/i.test(cfg.name || "") ? "100 ml, 50 ml" : "512 GB Black, 3 ml")}).`);
        return false;
      }
      w.variantLabel = variant;
      w.variantStorage = String(document.getElementById("addWizardVariantStorage")?.value || w.variantStorage || "").trim();
      w.variantColor = String(document.getElementById("addWizardVariantColor")?.value || w.variantColor || "").trim();
      w.variantOther = String(document.getElementById("addWizardVariantOther")?.value || w.variantOther || "").trim();
    }
    if (stepKey === "stock") {
      const display = String(w.itemName || buildItemDisplayName(w) || "").trim();
      if (!display && !w.variantLabel) {
        alert("Enter an item name.");
        return false;
      }
      if (!w.itemName) w.itemName = display;
    }
    return true;
  }

  async function validateWizardStepAsync(stepKey, cfgInput){
    if (!validateWizardStep(stepKey, cfgInput)) return false;
    const w = wizardState();
    const cfg = cfgInput || getCategoryConfig(w.category);
    const tax = getCategoryTaxonomyLabels(cfg);
    try {
      if (stepKey === "multiBrand") {
        const names = collectWizardMultiNames("addWizardMultiBrand");
        if (!names.length) {
          alert(`Enter at least one ${tax.primary.toLowerCase()} name.`);
          return false;
        }
        let last = null;
        for (const name of names) {
          last = await createBrandInline({ brandName: name, categoryName: w.category });
        }
        w.brand = last?.name || names[names.length - 1];
        w.brandId = last?.id || "";
        return true;
      }
      if (stepKey === "multiSubBrand") {
        const names = collectWizardMultiNames("addWizardMultiSubBrand");
        if (!names.length) {
          alert(`Enter at least one ${tax.subBrand.toLowerCase()} name.`);
          return false;
        }
        if (!w.brand) {
          alert(`${tax.primary} is required before ${tax.subBrand.toLowerCase()}s.`);
          return false;
        }
        let last = null;
        for (const name of names) {
          last = await createSubBrandInline({
            brandName: w.brand,
            categoryName: w.category,
            subBrandName: name
          });
        }
        w.subBrand = last?.name || names[names.length - 1];
        w.subBrandId = last?.id || "";
        return true;
      }
      if (stepKey === "multiType") {
        const names = collectWizardMultiNames("addWizardMultiType");
        if (!names.length) {
          alert(`Enter at least one ${tax.productLine.toLowerCase()} name.`);
          return false;
        }
        if (!w.brand) {
          alert(`${tax.primary} is required before ${tax.productLine.toLowerCase()}s.`);
          return false;
        }
        let last = null;
        for (const name of names) {
          last = await createProductLineInline({
            brandName: w.brand,
            categoryName: w.category,
            lineName: name,
            subBrandId: w.branchPath === "subBrand" ? (w.subBrandId || null) : null
          });
        }
        w.productLine = last?.name || names[names.length - 1];
        w.productLineId = last?.id || "";
        return true;
      }
    } catch (err) {
      alert(err?.message || "Could not save catalog names.");
      return false;
    }
    return true;
  }

  async function ensureWizardCatalogIds(){
    const w = wizardState();
    const cfg = getCategoryConfig(w.category);
    const qtyPattern = wizardQtyPattern(w, cfg);
    if (cfg.usesBrands && w.brand && String(w.brand).trim().toLowerCase() !== "unbranded") {
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
    } else if (String(w.brand || "").trim().toLowerCase() === "unbranded") {
      w.brand = "";
      w.brandId = "";
    }
    if (w.branchPath === "subBrand" && w.brandId && w.subBrand) {
      const brandEntry = (typeof getInventoryBrandCatalog === "function" ? getInventoryBrandCatalog() : [])
        .find(b => String(b.id) === String(w.brandId));
      const matched = (brandEntry?.sub_brands || []).find(s =>
        String(s.name || "").trim().toLowerCase() === String(w.subBrand || "").trim().toLowerCase()
      );
      if (matched?.id) {
        w.subBrandId = matched.id;
      } else if (!w.subBrandId || w.subBrandId === "__custom__") {
        try {
          const res = unwrapRpcJson(await supabaseRpc("app_upsert_goods_sub_brand", {
            p_id: null,
            p_brand_id: w.brandId,
            p_name: w.subBrand,
            p_sort_order: 0
          }));
          w.subBrandId = res?.id || "";
        } catch (err) {
          console.warn("Sub-brand RPC unavailable; saving in item meta only.", err);
          w.subBrandId = "";
        }
        if (typeof ensureInventoryBrandsLoaded === "function") await ensureInventoryBrandsLoaded(true);
      }
    } else {
      w.subBrand = "";
      w.subBrandId = "";
    }
    if (cfg.usesProductLines && w.brandId && w.productLine) {
      const brandEntry = (typeof getInventoryBrandCatalog === "function" ? getInventoryBrandCatalog() : [])
        .find(b => String(b.id) === String(w.brandId));
      const wantSub = w.branchPath === "subBrand" ? String(w.subBrandId || "") : "";
      const matchedLine = (brandEntry?.product_lines || []).find(l =>
        productLineKey(l.name) === productLineKey(w.productLine)
        && String(l.sub_brand_id || "") === wantSub
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
            p_sort_order: 0,
            p_sub_brand_id: wantSub || null
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
              p_sort_order: 0,
              p_sub_brand_id: wantSub || null
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
      }
      if (!w.variantId || w.variantId === "__custom__" || w.variantStorage || w.variantColor || w.variantOther || w.qtyPatternOverride) {
        try {
          const res = unwrapRpcJson(await supabaseRpc("app_upsert_goods_brand_variant", {
            p_id: (w.variantId && w.variantId !== "__custom__") ? w.variantId : null,
            p_brand_id: w.brandId,
            p_label: w.variantLabel,
            p_item_category: qtyPattern,
            p_quantity_value: 1,
            p_quantity_unit: typeof inventoryBaseUnitForCategory === "function" ? inventoryBaseUnitForCategory(qtyPattern) : "item",
            p_sort_order: 0,
            p_product_line_id: w.productLineId || null,
            p_storage: w.variantStorage || null,
            p_color: w.variantColor || null,
            p_other: w.variantOther || null
          }));
          w.variantId = res?.id || w.variantId || "";
        } catch (err) {
          console.warn("Variant RPC failed; saving label in meta only.", err);
          if (!w.variantId || w.variantId === "__custom__") w.variantId = "";
        }
        if (typeof ensureInventoryBrandsLoaded === "function") await ensureInventoryBrandsLoaded(true);
      }
    }
  }

  async function persistInventoryStockItem(payload = {}){
    const categoryName = payload.category || payload.itemType || "General";
    const cfg = getCategoryConfig(categoryName);
    const qtyPattern = payload.qtyPattern || cfg.qtyPattern || "count";
    const sizeUnit = payload.unit || (typeof inventoryBaseUnitForCategory === "function" ? inventoryBaseUnitForCategory(qtyPattern) : "item");
    const bottles = Math.max(1, Math.floor(Number(payload.bottles || 1)) || 1);
    const qtyPerBottle = typeof normalizeInventoryQuantityInput === "function"
      ? normalizeInventoryQuantityInput(payload.qty, qtyPattern, sizeUnit)
      : Number(payload.qty || 0);
    const qty = qtyPerBottle * bottles;
    // Volume: price unit (ml/L) can differ from bottle size unit; store cost/sell per liter.
    const priceUnit = qtyPattern === "volume"
      ? (typeof normalizeInventoryUnit === "function"
        ? normalizeInventoryUnit(payload.priceUnit || sizeUnit, qtyPattern)
        : (payload.priceUnit || sizeUnit))
      : sizeUnit;
    const enteredCost = Number(payload.unitCost || 0);
    const enteredSell = Number(payload.unitSell || 0);
    const sellBy = qtyPattern === "volume"
      ? (typeof normalizeInventorySellBy === "function"
        ? normalizeInventorySellBy(payload.sellBy || "", "volume")
        : (payload.sellBy === "bottle" ? "bottle" : "volume"))
      : "";
    const costMode = String(payload.costMode || "").toLowerCase() === "bottle"
      || (!!payload.sizeLocked && qtyPattern === "volume")
      || (qtyPattern === "volume" && sellBy === "bottle");
    if (!(qty > 0)) throw new Error("Enter a valid quantity / volume / weight / length.");
    if (!(enteredCost > 0)) {
      throw new Error(costMode
        ? "Enter bottle cost."
        : (qtyPattern === "volume"
          ? `Enter cost per ${String(priceUnit).toLowerCase() === "l" ? "L" : "ml"}.`
          : "Enter cost per unit."));
    }
    let unitCost;
    let unitSell;
    if (qtyPattern === "volume" && costMode) {
      // Bottle cost AED 100 for 100 ml → per-liter cost = 100 / 0.1 = 1000.
      unitCost = typeof inventoryBottlePriceToPerLiter === "function"
        ? inventoryBottlePriceToPerLiter(enteredCost, qtyPerBottle)
        : (qtyPerBottle > 0 ? enteredCost / qtyPerBottle : 0);
      unitSell = enteredSell > 0
        ? (typeof inventoryBottlePriceToPerLiter === "function"
          ? inventoryBottlePriceToPerLiter(enteredSell, qtyPerBottle)
          : (qtyPerBottle > 0 ? enteredSell / qtyPerBottle : 0))
        : 0;
    } else if (qtyPattern === "volume") {
      unitCost = typeof inventoryVolumePriceToPerLiter === "function"
        ? inventoryVolumePriceToPerLiter(enteredCost, priceUnit)
        : (String(priceUnit).toLowerCase() === "ml" ? enteredCost * 1000 : enteredCost);
      unitSell = enteredSell > 0
        ? (typeof inventoryVolumePriceToPerLiter === "function"
          ? inventoryVolumePriceToPerLiter(enteredSell, priceUnit)
          : (String(priceUnit).toLowerCase() === "ml" ? enteredSell * 1000 : enteredSell))
        : 0;
    } else {
      unitCost = enteredCost;
      unitSell = enteredSell;
    }
    const purchaseTotal = unitCost * qty;

    const draft = {
      category: categoryName,
      brand: String(payload.brand || "").trim(),
      brandId: payload.brandId || "",
      branchPath: payload.branchPath || (payload.subBrand || payload.subBrandId ? "subBrand" : "type"),
      subBrand: String(payload.subBrand || "").trim(),
      subBrandId: payload.subBrandId || "",
      productLine: String(payload.productLine || "").trim(),
      productLineId: payload.productLineId || "",
      variantLabel: String(payload.variantLabel || "").trim(),
      variantId: payload.variantId || "",
      variantStorage: String(payload.variantStorage || "").trim(),
      variantColor: String(payload.variantColor || "").trim(),
      variantOther: String(payload.variantOther || "").trim(),
      itemName: String(payload.itemName || "").trim(),
      qty: String(payload.qty ?? qtyPerBottle),
      unit: sizeUnit,
      bottles: String(bottles),
      qtyPatternOverride: qtyPattern,
      priceUnit,
      sellBy: sellBy || "",
      unitCost: String(enteredCost),
      unitSell: enteredSell > 0 ? String(enteredSell) : "",
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
      const lineTotal = purchaseTotal;
      const tax = typeof calculateTaxBreakdown === "function"
        ? calculateTaxBreakdown(lineTotal, taxDefault.rate, taxDefault.mode, taxDefault.rate > 0)
        : { net: lineTotal, tax: 0, total: lineTotal, applied: false, rate: 0, mode: "exclusive" };

      const uuidOk = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || "").trim());
      const brandId = w.brandId && w.brandId !== "__custom__" && uuidOk(w.brandId) ? String(w.brandId).trim() : "";
      const subBrandId = w.subBrandId && w.subBrandId !== "__custom__" && uuidOk(w.subBrandId) ? String(w.subBrandId).trim() : "";
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
        subBrand: w.subBrand || "",
        subBrandId,
        productLine: w.productLine || "",
        productLineId,
        variantLabel: w.variantLabel || "",
        variantId,
        variantStorage: w.variantStorage || "",
        variantColor: w.variantColor || "",
        variantOther: w.variantOther || "",
        sellBy: sellBy || "",
        bottleSizeQty: qtyPattern === "volume" && Number(payload.qty) > 0 ? Number(payload.qty) : null,
        bottleSizeUnit: qtyPattern === "volume" && Number(payload.qty) > 0
          ? (String(sizeUnit || "ml").toLowerCase() === "l" ? "l" : "ml")
          : "",
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
            p_quantity_unit: meta.quantityUnit || "item",
            p_sub_brand: meta.subBrand || null,
            p_sub_brand_id: subBrandId || null,
            p_variant_storage: meta.variantStorage || null,
            p_variant_color: meta.variantColor || null,
            p_sell_by: meta.sellBy || null,
            p_bottle_size_qty: meta.bottleSizeQty != null ? Number(meta.bottleSizeQty) : null,
            p_bottle_size_unit: meta.bottleSizeUnit || null
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

  async function commitAddItemWizard({ addAnother = false } = {}){
    const w = wizardState();
    const cfg = getCategoryConfig(w.category);
    syncWizardFieldsFromDom();
    const qtyPattern = wizardQtyPattern(w, cfg);
    const sizeHint = typeof parseInventorySizeHint === "function" ? parseInventorySizeHint(w.variantLabel) : null;
    const sizeLocked = !!(qtyPattern === "volume" && sizeHint);
    const ctx = {
      category: w.category,
      categoryLocked: !!w.categoryLocked,
      topIntent: w.topIntent || "",
      brand: w.brand || "",
      brandId: w.brandId || "",
      branchPath: w.branchPath || "",
      subBrand: w.subBrand || "",
      subBrandId: w.subBrandId || "",
      productLine: w.productLine || "",
      productLineId: w.productLineId || "",
      qtyPatternOverride: w.qtyPatternOverride || "",
      sellBy: w.sellBy || "",
      currency: w.currency || "AED"
    };
    const result = await persistInventoryStockItem({
      category: w.category,
      brand: w.brand === "Unbranded" ? "" : w.brand,
      brandId: w.brandId,
      branchPath: w.branchPath,
      subBrand: w.subBrand,
      subBrandId: w.subBrandId,
      productLine: w.productLine,
      productLineId: w.productLineId,
      variantLabel: w.variantLabel,
      variantId: w.variantId,
      variantStorage: w.variantStorage,
      variantColor: w.variantColor,
      variantOther: w.variantOther,
      itemName: w.itemName,
      qty: w.qty,
      unit: w.sizeUnit || sizeHint?.unit || w.unit,
      bottles: w.bottles || 1,
      priceUnit: w.priceUnit || w.unit,
      unitCost: w.unitCost,
      unitSell: w.unitSell,
      currency: w.currency,
      description: w.description,
      boughtDate: w.boughtDate,
      qtyPattern,
      sizeLocked,
      sellBy: qtyPattern === "volume"
        ? (w.sellBy || (typeof defaultInventorySellBy === "function"
          ? defaultInventorySellBy({ categorySlug: cfg.slug, categoryName: cfg.name || w.category, qtyPattern })
          : "volume"))
        : "",
      costMode: (sizeLocked || w.sellBy === "bottle") ? "bottle" : "unit"
    });

    if (typeof renderInventoryList === "function") renderInventoryList();
    if (state.inventoryActiveSection) {
      try { await renderInventorySectionOverlayBody(state.inventoryActiveSection); } catch (_) {}
    }

    if (addAnother) {
      await openInventoryAddItemWizard({
        seedType: ctx.category,
        brand: ctx.brand,
        brandId: ctx.brandId,
        branchPath: ctx.branchPath || "directStock",
        subBrand: ctx.subBrand,
        subBrandId: ctx.subBrandId,
        productLine: ctx.productLine,
        productLineId: ctx.productLineId,
        topIntent: ctx.topIntent === "brands" ? "chooseBrand" : (ctx.topIntent || "directStock"),
        qtyPatternOverride: ctx.qtyPatternOverride,
        sellBy: ctx.sellBy,
        currency: ctx.currency,
        jumpToStock: true
      });
      return result;
    }

    closeAddItemWizard();
    state.inventoryAddWizard = null;
    if (result) alert("Item added to inventory.");
    return result;
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
    const seededCategory = String(options.seedType || options.category || "").trim();
    const categoryLocked = !!seededCategory;
    const category = seededCategory || cats[0]?.name || "General";
    const cfg = getCategoryConfig(category);
    const seededBranch = options.branchPath
      || (options.subBrand || options.subBrandId ? "subBrand"
        : (options.productLine || options.productLineId ? "type" : ""));
    let topIntent = options.topIntent || "";
    if (!topIntent) {
      if (!cfg.usesBrands) topIntent = "directStock";
      else if (options.brand || options.brandId || options.jumpToStock) topIntent = "chooseBrand";
      else if (categoryLocked) topIntent = ""; // show intent
      else topIntent = "";
    }
    if (options.jumpToStock && !topIntent) {
      topIntent = (options.brand || options.brandId) ? "chooseBrand" : "directStock";
    }
    if (topIntent === "directStock" && !(options.brand || options.brandId)) {
      options.brand = options.brand || "Unbranded";
    }

    state.inventoryAddWizard = {
      step: 1,
      categoryLocked,
      category,
      topIntent,
      brand: options.brand || "",
      brandId: options.brandId || "",
      branchPath: seededBranch || (topIntent === "directStock" ? "directStock" : ""),
      subBrand: options.subBrand || "",
      subBrandId: options.subBrandId || "",
      productLine: options.productLine || "",
      productLineId: options.productLineId || "",
      variantLabel: options.variantLabel || "",
      variantId: options.variantId || "",
      variantStorage: options.variantStorage || "",
      variantColor: options.variantColor || "",
      variantOther: options.variantOther || "",
      itemName: "",
      qty: options.qty || (cfg.qtyPattern === "volume" ? "100" : "1"),
      unit: options.unit || (cfg.qtyPattern === "volume" ? "ml" : "item"),
      qtyPatternOverride: options.qtyPatternOverride || "",
      sellBy: options.sellBy || (cfg.qtyPattern === "volume"
        ? (typeof defaultInventorySellBy === "function"
          ? defaultInventorySellBy({ categorySlug: cfg.slug, categoryName: cfg.name || category, qtyPattern: cfg.qtyPattern })
          : "volume")
        : ""),
      bottles: options.bottles || "1",
      unitCost: "",
      unitSell: "",
      currency: options.currency || state.lastCurrency || "AED",
      description: "",
      boughtDate: typeof todayISO === "function" ? todayISO() : ""
    };
    if (!options.unit) {
      state.inventoryAddWizard.unit = cfg.qtyPattern === "volume"
        ? "ml"
        : (typeof inventoryBaseUnitForCategory === "function"
          ? inventoryBaseUnitForCategory(cfg.qtyPattern)
          : "item");
    }

    const stepKeys = buildAddWizardSteps(state.inventoryAddWizard, cfg);
    let desiredKey = "intent";
    if (!cfg.usesBrands) desiredKey = "stock";
    if (options.jumpToStock) desiredKey = "stock";
    else if (options.brand || options.brandId) {
      desiredKey = seededBranch === "directStock"
        ? "stock"
        : (seededBranch ? "branch" : "brand");
    } else if (categoryLocked && !topIntent) {
      desiredKey = "intent";
    } else if (!categoryLocked) {
      desiredKey = "category";
    }
    if (options.subBrand || options.subBrandId) {
      desiredKey = cfg.usesProductLines ? "multiType" : (cfg.usesVariants ? "variant" : "stock");
    }
    if (options.productLine || options.productLineId) {
      desiredKey = cfg.usesVariants ? "variant" : "stock";
    }
    if (options.variantLabel || options.variantId) desiredKey = "stock";
    const idx = stepKeys.indexOf(desiredKey);
    state.inventoryAddWizard.step = Math.max(1, (idx >= 0 ? idx : 0) + 1);

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
  global.writeStoredCustomCategories = writeStoredCustomCategories;
  global.ensureCustomCategoriesHydrated = ensureCustomCategoriesHydrated;
  global.isPresetCategory = isPresetCategory;
  global.getCategoryConfig = getCategoryConfig;
  global.getCategoryTaxonomyLabels = getCategoryTaxonomyLabels;
  global.categoryExample = categoryExample;
  global.categoryBuilderFormHtml = categoryBuilderFormHtml;
  global.readCategoryBuilderForm = readCategoryBuilderForm;
  global.bindCategoryBuilderPreview = bindCategoryBuilderPreview;
  global.buildTaxonomyPayload = buildTaxonomyPayload;
  global.groupItemsByBrand = groupItemsByBrand;
  global.groupItemsByProductLine = groupItemsByProductLine;
  global.mergeProductLinesForBrand = mergeProductLinesForBrand;
  global.mergeVariantsForProductLine = mergeVariantsForProductLine;
  global.createBrandInline = createBrandInline;
  global.renameBrandInline = renameBrandInline;
  global.deleteBrandInline = deleteBrandInline;
  global.createSubBrandInline = createSubBrandInline;
  global.deleteSubBrandInline = deleteSubBrandInline;
  global.createProductLineInline = createProductLineInline;
  global.renameProductLineInline = renameProductLineInline;
  global.deleteProductLineInline = deleteProductLineInline;
  global.createVariantInline = createVariantInline;
  global.renameVariantInline = renameVariantInline;
  global.deleteVariantInline = deleteVariantInline;
  global.renameCategoryInline = renameCategoryInline;
  global.deleteCategoryInline = deleteCategoryInline;
  global.persistInventoryCategoryOrder = persistInventoryCategoryOrder;
  global.persistInventoryStockItem = persistInventoryStockItem;
  global.resolveItemProductLine = resolveItemProductLine;
  global.productLineKey = productLineKey;
  global.buildItemDisplayName = buildItemDisplayName;
  global.formatInventoryReceiptLineName = formatInventoryReceiptLineName;
  global.openInventoryAddItemWizard = openInventoryAddItemWizard;
  global.closeAddItemWizard = closeAddItemWizard;
  global.applyCartChrome = applyCartChrome;
  global.inventoryCategorySlugify = slugify;
})(window);
