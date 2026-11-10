/* Triplem VIP Inventory 2.0 - Phase 3: Products (list, add/edit with variants, barcodes,
 * units, tracking, icons, opening stock) and barcode-scanner input.
 *
 * USB and Bluetooth barcode scanners type like a keyboard and end with Enter, so the
 * search box and every barcode field accept them without extra software.
 */
(function () {
  "use strict";
  const I = () => window.TriplemInv2;
  const Shell = () => window.TriplemInventoryV2Shell;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const L = { query: "", category: "", status: "active", offset: 0, limit: 50 };
  const TRACKING = [["none", "Quantity only"], ["serial", "Serial numbers"], ["imei", "IMEI (phones)"], ["batch", "Batch & expiry"]];
  const STATUS = { in: ["In stock", "ok"], low: ["Low stock", "warn"], out: ["Out of stock", "bad"], service: ["Service", "muted"] };

  // ---- EAN-13 with an in-store prefix (20-29 are reserved for in-store use) --------------------
  function ean13Check(d12) { let s = 0; for (let i = 0; i < 12; i++) s += Number(d12[i]) * (i % 2 ? 3 : 1); return String((10 - (s % 10)) % 10); }
  function internalBarcode() {
    const r = crypto?.getRandomValues ? crypto.getRandomValues(new Uint32Array(2)) : [Math.random() * 1e9, Math.random() * 1e9];
    const body = ("2" + String(Math.floor(Math.random() * 9)) + String(r[0]).padStart(10, "0") + String(r[1])).replace(/\D/g, "").slice(0, 12);
    return body + ean13Check(body);
  }
  function symbologyOf(code) {
    if (/^\d{13}$/.test(code)) return ean13Check(code.slice(0, 12)) === code[12] ? "ean13" : "other";
    if (/^\d{8}$/.test(code)) return "ean8";
    if (/^\d{12}$/.test(code)) return "upca";
    return "code128";
  }

  // ---- list --------------------------------------------------------------------------------------
  async function render(el, opts = {}) {
    await I().loadBoot();
    if (I().needsSetup(el)) return;
    if (typeof opts.query === "string") { L.query = opts.query; L.offset = 0; }
    if (opts.status) { L.status = opts.status; L.offset = 0; }
    const cats = (I().boot().categories || []).filter(c => c.is_active);
    el.innerHTML = `
      <div class="inv2-section-head inv2-head-row"><h1><i class="fa-solid fa-box-open" aria-hidden="true"></i> Products</h1>
        ${I().canEdit() ? `<button type="button" class="inv2-btn primary" data-add><i class="fa-solid fa-plus" aria-hidden="true"></i> Add product</button>` : ""}</div>
      <div class="inv2-toolbar">
        <label class="inv2-search inv2-search-inline"><i class="fa-solid fa-barcode" aria-hidden="true"></i><input type="search" data-q placeholder="Scan a barcode or search name, SKU, brand…" value="${esc(L.query)}" aria-label="Search products"></label>
        <select class="inv2-input" data-cat aria-label="Category"><option value="">All categories</option>${cats.map(c => `<option value="${esc(c.id)}"${c.id === L.category ? " selected" : ""}>${esc(c.name)}</option>`).join("")}</select>
        <div class="inv2-seg inv2-seg-lg" role="tablist" aria-label="Stock status">${[["active", "Active"], ["low", "Low"], ["out", "Out"], ["archived", "Archived"]].map(([k, v]) => `<button type="button" role="tab" data-st="${k}" aria-selected="${L.status === k}">${v}</button>`).join("")}</div>
      </div>
      <section class="inv2-card inv2-table-card"><div data-rows><div class="inv2-loading"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Loading products…</div></div></section>`;
    const q = el.querySelector("[data-q]");
    let t = 0;
    q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { L.query = q.value.trim(); L.offset = 0; loadRows(el); }, 280); });
    q.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); clearTimeout(t); L.query = q.value.trim(); L.offset = 0; loadRows(el, { scan: true }); } });
    el.querySelector("[data-cat]").addEventListener("change", e => { L.category = e.target.value; L.offset = 0; loadRows(el); });
    el.querySelectorAll("[data-st]").forEach(b => b.addEventListener("click", () => { L.status = b.dataset.st; L.offset = 0; el.querySelectorAll("[data-st]").forEach(x => x.setAttribute("aria-selected", String(x === b))); loadRows(el); }));
    el.querySelector("[data-add]")?.addEventListener("click", () => openEditor(null, el));
    await loadRows(el);
    // Ready for a USB scanner on computers; no keyboard pop-up on phones and tablets.
    if (window.matchMedia("(pointer: fine)").matches) q.focus();
  }

  // After a save: refresh the list it came from, or the screen that is open (e.g. the dashboard).
  function refreshAfter(listEl) {
    if (listEl && listEl.isConnected && listEl.querySelector("[data-rows]")) return loadRows(listEl);
    Shell().show(Shell().current(), { force: true });
  }

  async function loadRows(el, opts = {}) {
    const box = el?.querySelector("[data-rows]");
    if (!box) return;
    let res;
    try { res = await I().rpc("app_inv2_products_list", { p_search: L.query || null, p_category_id: L.category || null, p_location_id: I().location() || null, p_status: L.status, p_limit: L.limit, p_offset: L.offset }); }
    catch (e) { box.innerHTML = `<div class="inv2-alert inv2-alert-error">${esc(e.message || e)}</div>`; return; }
    // A scan that matches exactly one product opens it straight away.
    if (opts.scan && res.total === 1) { openEditor(res.rows[0].product_id, el); return; }
    if (opts.scan && res.total === 0 && L.query && I().canEdit() && /^[A-Za-z0-9\-.]{6,}$/.test(L.query)) {
      box.innerHTML = `<div class="inv2-empty"><i class="fa-solid fa-barcode" aria-hidden="true"></i><p>No product has barcode ${esc(L.query)}.</p><button type="button" class="inv2-btn primary" data-new-from-scan>Add a product with this barcode</button></div>`;
      box.querySelector("[data-new-from-scan]").addEventListener("click", () => openEditor(null, el, { barcode: L.query }));
      return;
    }
    if (!res.rows.length) {
      box.innerHTML = `<div class="inv2-empty"><i class="fa-solid fa-box-open" aria-hidden="true"></i><p>${L.query || L.category || L.status !== "active" ? "No products match these filters." : "No products yet."}</p>${!L.query && L.status === "active" && I().canEdit() ? `<small>Add your first product, or scan its barcode in the search box.</small>` : ""}</div>`;
      return;
    }
    const locName = I().location() ? (I().activeLocations().find(l => l.id === I().location())?.name || "") : "All locations";
    box.innerHTML = `
      <div class="inv2-table" role="table" aria-label="Products">
        <div class="inv2-tr inv2-th" role="row"><span role="columnheader">Product</span><span role="columnheader">SKU / barcode</span><span role="columnheader">Category</span><span role="columnheader" class="num">Price</span><span role="columnheader" class="num">Stock <small>${esc(locName)}</small></span><span role="columnheader">Status</span></div>
        ${res.rows.map(r => {
          const [label, tone] = STATUS[r.stock_status] || ["", ""];
          return `<button type="button" class="inv2-tr" role="row" data-open="${esc(r.product_id)}">
            <span class="inv2-prod" role="cell"><span class="inv2-ico-tile">${I().iconHtml(r.icon_id || "general/package", "md")}</span><span><strong>${esc(r.name)}</strong>${r.variant_name ? `<small>${esc(r.variant_name)}</small>` : ""}${r.brand_name ? `<small>${esc(r.brand_name)}</small>` : ""}</span></span>
            <span role="cell"><code>${esc(r.sku || "—")}</code>${r.barcodes ? `<small class="mono">${esc(r.barcodes.split(" ")[0])}${r.barcodes.includes(" ") ? " +" : ""}</small>` : ""}</span>
            <span role="cell">${esc(r.category_name || "—")}</span>
            <span role="cell" class="num">${I().money(r.sell_price)}</span>
            <span role="cell" class="num"><strong>${r.product_type === "service" ? "—" : I().qty(r.qty)}</strong> <small>${esc(r.unit_code || "")}</small></span>
            <span role="cell"><span class="inv2-badge ${tone}">${label}</span>${r.tracking !== "none" ? `<span class="inv2-badge muted">${esc((TRACKING.find(t => t[0] === r.tracking) || [, ""])[1])}</span>` : ""}</span>
          </button>`;
        }).join("")}
      </div>
      <div class="inv2-pager"><span>${L.offset + 1}–${L.offset + res.rows.length} of ${res.total}</span>
        <button type="button" class="inv2-btn small" data-prev${L.offset === 0 ? " disabled" : ""}>Previous</button>
        <button type="button" class="inv2-btn small" data-next${L.offset + res.rows.length >= res.total ? " disabled" : ""}>Next</button></div>`;
    box.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => openEditor(b.dataset.open, el)));
    box.querySelector("[data-prev]")?.addEventListener("click", () => { L.offset = Math.max(0, L.offset - L.limit); loadRows(el); });
    box.querySelector("[data-next]")?.addEventListener("click", () => { L.offset += L.limit; loadRows(el); });
  }

  // ---- editor ---------------------------------------------------------------------------------
  function variantRow(v, i, multi) {
    const codes = (v.barcodes || []).filter(b => !b.product_unit_id).map(b => b.barcode).join(", ");
    return `<div class="inv2-variant" data-variant data-id="${esc(v.id || "")}">
      ${multi ? `<label class="inv2-field">Variant name<input class="inv2-input" name="v_name" maxlength="120" value="${esc(v.name || "")}" placeholder="e.g. 128GB Black / Size M"></label>` : ""}
      <label class="inv2-field">SKU<input class="inv2-input" name="v_sku" maxlength="60" value="${esc(v.sku || "")}" placeholder="Optional"></label>
      <label class="inv2-field inv2-field-barcode">Barcode(s)<span class="inv2-input-group"><input class="inv2-input" name="v_barcodes" value="${esc(codes)}" placeholder="Scan or type; separate with commas" autocomplete="off"><button type="button" class="inv2-btn small" data-gen title="Create an in-store barcode">Generate</button></span></label>
      <label class="inv2-field">Cost price<input class="inv2-input" name="v_cost" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(v.cost_price ?? "")}"></label>
      <label class="inv2-field">Selling price<input class="inv2-input" name="v_price" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(v.sell_price ?? "")}" required></label>
      <label class="inv2-field">Wholesale price<input class="inv2-input" name="v_wholesale" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(v.wholesale_price ?? "")}" placeholder="Optional"></label>
      <label class="inv2-field">Low-stock level<input class="inv2-input" name="v_min" type="number" min="0" step="1" inputmode="decimal" value="${esc(v.min_stock ?? 0)}"></label>
      ${multi ? `<button type="button" class="inv2-icon-btn small inv2-variant-remove" data-remove-variant aria-label="Remove variant ${i + 1}"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>` : ""}
    </div>`;
  }

  async function openEditor(productId, listEl, preset = {}) {
    let p = null;
    if (productId) {
      try { p = await I().rpc("app_inv2_product_get", { p_id: productId }); }
      catch (e) { Shell().toast(e.message || String(e)); return; }
    }
    const boot = I().boot();
    const editable = I().canEdit();
    const locked = !!p?.has_movements;
    let icon = p?.icon_id || "";
    let variants = p?.variants?.length ? p.variants.map(v => ({ ...v })) : [{ name: "", sku: "", barcodes: preset.barcode ? [{ barcode: preset.barcode }] : [], cost_price: "", sell_price: "", min_stock: 0 }];
    let multi = variants.length > 1 || (variants[0] && variants[0].name);
    const units = boot.units || [];
    const baseUnit = p?.base_unit_id || (units.find(u => u.code === "pcs") || units[0] || {}).id;
    const packs = (p?.units || []).map(u => ({ unit_id: u.unit_id, factor: u.factor }));
    const locs = I().activeLocations();
    const stockSummary = p ? p.variants.map(v => `<li><span>${esc(v.name || p.name)}</span><strong>${I().qty(v.stock_total)} ${esc(p.unit_code || "")}</strong>${v.serials_in_stock ? `<small>${v.serials_in_stock} serial/IMEI in stock</small>` : ""}</li>`).join("") : "";

    const body = `
      <div class="inv2-editor">
        <div class="inv2-editor-main">
          <section class="inv2-form-section"><h3>Basics</h3><div class="inv2-form-grid">
            <div class="inv2-field wide inv2-name-row"><button type="button" class="inv2-icon-tile" data-pick-icon aria-label="Choose an icon">${I().iconHtml(icon || "general/package", "xl")}<small>Icon</small></button>
              <label class="inv2-field grow">Product name<input class="inv2-input" name="name" maxlength="160" required value="${esc(p?.name || "")}" placeholder="e.g. Fresh Milk 1L"></label></div>
            <label class="inv2-field">Category<input class="inv2-input" name="category" list="inv2CatList" maxlength="80" value="${esc(p?.category_name || "")}" placeholder="Choose or type a new one"></label>
            <datalist id="inv2CatList">${(boot.categories || []).map(c => `<option value="${esc(c.name)}"></option>`).join("")}</datalist>
            <label class="inv2-field">Brand<input class="inv2-input" name="brand" list="inv2BrandList" maxlength="80" value="${esc(p?.brand_name || "")}" placeholder="Optional"></label>
            <datalist id="inv2BrandList">${(boot.brands || []).map(b => `<option value="${esc(b.name)}"></option>`).join("")}</datalist>
            <label class="inv2-field">Product type<select class="inv2-input" name="product_type"${locked ? " disabled" : ""}><option value="stock"${p?.product_type !== "service" ? " selected" : ""}>Stocked item</option><option value="service"${p?.product_type === "service" ? " selected" : ""}>Service (no stock)</option></select></label>
            <label class="inv2-field">Track by<select class="inv2-input" name="tracking"${locked ? " disabled" : ""}>${TRACKING.map(([k, v]) => `<option value="${k}"${(p?.tracking || "none") === k ? " selected" : ""}>${v}</option>`).join("")}</select>${locked ? `<small>Fixed because stock has been recorded.</small>` : ""}</label>
            <label class="inv2-field">Base unit<select class="inv2-input" name="base_unit"${locked ? " disabled" : ""}>${units.map(u => `<option value="${esc(u.id)}"${u.id === baseUnit ? " selected" : ""}>${esc(u.name)} (${esc(u.code)})</option>`).join("")}</select></label>
            <label class="inv2-field">Tax rate %<input class="inv2-input" name="tax_rate" type="number" min="0" max="100" step="0.01" value="${esc(p?.tax_rate ?? 0)}"></label>
            <label class="inv2-check">${`<input type="checkbox" name="incl"${p?.price_includes_tax !== false ? " checked" : ""}>`} Prices include tax</label>
          </div></section>

          <section class="inv2-form-section"><div class="inv2-form-section-head"><h3>Prices, SKU and barcodes</h3>
            <label class="inv2-check"><input type="checkbox" data-multi${multi ? " checked" : ""}> This product has variants (size, colour, storage…)</label></div>
            <div data-variants>${variants.map((v, i) => variantRow(v, i, multi)).join("")}</div>
            <button type="button" class="inv2-btn small" data-add-variant${multi ? "" : " hidden"}><i class="fa-solid fa-plus" aria-hidden="true"></i> Add variant</button>
          </section>

          <section class="inv2-form-section"><h3>Packs and cartons <small>optional</small></h3>
            <p class="inv2-note">Sell or receive in bigger units, for example 1 carton = 12 pieces. A pack barcode adds that many base units when scanned.</p>
            <div data-packs>${packs.map(pk => packRow(pk, units)).join("")}</div>
            <button type="button" class="inv2-btn small" data-add-pack><i class="fa-solid fa-plus" aria-hidden="true"></i> Add pack size</button>
          </section>

          <details class="inv2-form-section"${p && (p.manufacturer || p.model || p.warranty_months || p.description) ? " open" : ""}><summary><h3>More details <small>optional</small></h3></summary><div class="inv2-form-grid">
            <label class="inv2-field">Manufacturer<input class="inv2-input" name="manufacturer" maxlength="80" value="${esc(p?.manufacturer || "")}"></label>
            <label class="inv2-field">Model<input class="inv2-input" name="model" maxlength="80" value="${esc(p?.model || "")}"></label>
            <label class="inv2-field">Warranty (months)<input class="inv2-input" name="warranty" type="number" min="0" max="600" step="1" value="${esc(p?.warranty_months ?? "")}"></label>
            <label class="inv2-field">Country of origin<input class="inv2-input" name="origin" maxlength="60" value="${esc(p?.country_of_origin || "")}"></label>
            <label class="inv2-field wide">Description<textarea class="inv2-input" name="description" rows="2" maxlength="2000">${esc(p?.description || "")}</textarea></label>
            <label class="inv2-field wide">Notes<textarea class="inv2-input" name="notes" rows="2" maxlength="2000">${esc(p?.notes || "")}</textarea></label>
          </div></details>

          ${window.TriplemAttachments ? `<section class="inv2-form-section inv2-photos" data-photos-section><h3>Photos and documents <small>optional</small></h3>
            <p class="inv2-note">Product photos, warranty cards or supplier sheets. Photos are resized before upload and stored privately; if you are offline they upload when the connection is back.</p>
            <div data-att-anchor></div></section>` : ""}

          ${!p ? `<section class="inv2-form-section" data-opening-section><h3>Opening stock <small>optional</small></h3>
            <p class="inv2-note" data-opening-hint>Quantity you already have. You can also add stock later from Inventory / Stock.</p>
            <div class="inv2-form-grid">
              <label class="inv2-field">Location<select class="inv2-input" name="open_loc">${locs.map(l => `<option value="${esc(l.id)}"${l.id === (I().location() || I().settings().default_location_id) ? " selected" : ""}>${esc(l.name)}</option>`).join("")}</select></label>
              <label class="inv2-field">Quantity<input class="inv2-input" name="open_qty" type="number" min="0" step="any" inputmode="decimal" placeholder="0"></label>
              <label class="inv2-field">Cost per unit<input class="inv2-input" name="open_cost" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Uses cost price"></label>
              <label class="inv2-field" data-open-batch hidden>Batch number<input class="inv2-input" name="open_batch" maxlength="60"></label>
              <label class="inv2-field" data-open-batch hidden>Expiry date<input class="inv2-input" name="open_expiry" type="date"></label>
              <label class="inv2-field wide" data-open-serials hidden>Serial / IMEI numbers<textarea class="inv2-input mono" name="open_serials" rows="3" placeholder="One per line — scan each device"></textarea></label>
            </div>
            <p class="inv2-note" data-opening-multi hidden>Opening stock for products with variants is added per variant from Inventory / Stock after saving.</p>
          </section>` : ""}
        </div>
        ${p ? `<aside class="inv2-editor-side"><h3>Stock now</h3><ul class="inv2-stock-mini">${stockSummary}</ul>
          <button type="button" class="inv2-btn small" data-goto-stock><i class="fa-solid fa-warehouse" aria-hidden="true"></i> Open in stock</button>
          ${I().canDelete() ? `<button type="button" class="inv2-btn small ${p.is_active ? "danger-ghost" : ""}" data-archive>${p.is_active ? "Archive product" : "Restore product"}</button>` : ""}</aside>` : ""}
      </div>`;

    const dlg = I().dialog({
      title: p ? (editable ? "Edit product" : "Product") : "Add product", subtitle: p ? `${p.variants.length} variant${p.variants.length === 1 ? "" : "s"}` : "", wide: true,
      submitLabel: p ? "Save changes" : "Save product", body,
      onSubmit: editable ? async f => { await save(f, p); I().invalidateSummary(); refreshAfter(listEl); Shell().toast(p ? "Product saved." : "Product added."); } : null,
      onOpen(f) {
        Shell().setDirty(true);
        if (!editable) f.querySelectorAll("input,select,textarea,button:not([data-close])").forEach(x => { x.disabled = true; });
        f.querySelector("[data-pick-icon]")?.addEventListener("click", async () => { const r = await I().iconPicker(icon); if (r) { icon = r; f.dataset.icon = r; f.querySelector("[data-pick-icon]").innerHTML = `${I().iconHtml(icon, "xl")}<small>Icon</small>`; } });
        const vbox = f.querySelector("[data-variants]");
        const readVariants = () => [...vbox.querySelectorAll("[data-variant]")].map((r, i) => ({ id: r.dataset.id || "", name: r.querySelector("[name=v_name]")?.value || "", sku: r.querySelector("[name=v_sku]").value, barcodes: r.querySelector("[name=v_barcodes]").value.split(/[,\s]+/).filter(Boolean).map(b => ({ barcode: b })), cost_price: r.querySelector("[name=v_cost]").value, sell_price: r.querySelector("[name=v_price]").value, wholesale_price: r.querySelector("[name=v_wholesale]").value, min_stock: r.querySelector("[name=v_min]").value }));
        const redraw = () => { vbox.innerHTML = variants.map((v, i) => variantRow(v, i, multi)).join(""); bindVariantRows(); syncOpening(); };
        const bindVariantRows = () => {
          vbox.querySelectorAll("[data-gen]").forEach(b => b.addEventListener("click", () => { const inp = b.parentElement.querySelector("input"); inp.value = [inp.value.trim(), internalBarcode()].filter(Boolean).join(", "); inp.dispatchEvent(new Event("input", { bubbles: true })); }));
          vbox.querySelectorAll("[data-remove-variant]").forEach((b, i) => b.addEventListener("click", () => { variants = readVariants(); if (variants.length <= 1) return; variants.splice(i, 1); redraw(); }));
          // A scanner ends with Enter: keep it in the barcode field instead of submitting the form.
          vbox.querySelectorAll("[name=v_barcodes]").forEach(inp => inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); if (inp.value && !inp.value.trim().endsWith(",")) inp.value = inp.value.trim() + ", "; } }));
        };
        bindVariantRows();
        f.querySelector("[data-multi]").addEventListener("change", e => { variants = readVariants(); multi = e.target.checked; if (!multi) variants = variants.slice(0, 1).map(v => ({ ...v, name: "" })); f.querySelector("[data-add-variant]").hidden = !multi; redraw(); });
        f.querySelector("[data-add-variant]").addEventListener("click", () => { variants = readVariants(); variants.push({ name: "", sku: "", barcodes: [], cost_price: variants[0]?.cost_price || "", sell_price: variants[0]?.sell_price || "", min_stock: variants[0]?.min_stock || 0 }); redraw(); vbox.lastElementChild?.querySelector("input")?.focus(); });
        f.querySelector("[data-add-pack]").addEventListener("click", () => { f.querySelector("[data-packs]").insertAdjacentHTML("beforeend", packRow({}, units)); });
        f.querySelector("[data-packs]").addEventListener("click", e => { if (e.target.closest("[data-remove-pack]")) e.target.closest("[data-pack]").remove(); });
        const syncOpening = () => {
          const sec = f.querySelector("[data-opening-section]"); if (!sec) return;
          const trk = f.tracking.value, svc = f.product_type.value === "service";
          sec.hidden = svc;
          f.querySelectorAll("[data-open-batch]").forEach(x => { x.hidden = trk !== "batch" || multi; });
          f.querySelector("[data-open-serials]").hidden = !(trk === "serial" || trk === "imei") || multi;
          f.querySelector("[data-opening-multi]").hidden = !multi;
          f.querySelectorAll("[name=open_qty],[name=open_cost],[name=open_loc]").forEach(x => { x.closest("label").hidden = multi; });
          if (!multi && (trk === "serial" || trk === "imei")) f.open_qty.closest("label").hidden = true;
        };
        f.tracking.addEventListener("change", syncOpening); f.product_type.addEventListener("change", syncOpening);
        syncOpening();
        f.querySelector("[data-goto-stock]")?.addEventListener("click", () => { dlg.close(true); window.TriplemInv2Stock?.openProduct?.(p.id); });
        f.querySelector("[data-archive]")?.addEventListener("click", async () => {
          if (!confirm(p.is_active ? "Archive this product? It disappears from lists and sales; its history is kept." : "Restore this product?")) return;
          try { await I().rpc("app_inv2_product_archive", { p_id: p.id, p_active: !p.is_active }); dlg.close(true); I().invalidateSummary(); refreshAfter(listEl); }
          catch (ex) { f.querySelector("[data-error]").textContent = ex.message || String(ex); }
        });
        f._readVariants = readVariants;
        mountPhotos(f, p);
      }
    });
  }

  // Photos and documents use the shared Triplem VIP attachment service (module "inventory_product").
  const ATT_MODULE = "inventory_product";
  function mountPhotos(f, p) {
    const A = window.TriplemAttachments, anchor = f.querySelector("[data-att-anchor]");
    if (!A || !anchor) return;
    try {
      A.mount(f, { module: ATT_MODULE, before: anchor });
      const ctl = A.prepare(f, ATT_MODULE);
      if (ctl?.host) {
        ctl.host.classList.add("inv2-att");
        const add = ctl.host.querySelector(".tm-att-add");
        if (add) add.innerHTML = `<i class="fa-solid fa-camera" aria-hidden="true"></i> Add photo or document`;
      }
      // The section follows the storage switch: hidden when file storage is not set up.
      const sec = f.querySelector("[data-photos-section]");
      const sync = () => { if (sec && ctl?.host) sec.hidden = ctl.host.hidden; };
      sync(); new MutationObserver(sync).observe(ctl.host, { attributes: true, attributeFilter: ["hidden"] });
      if (p?.id) A.showExisting(f, { module: ATT_MODULE, id: p.id });
    } catch (e) { console.warn("Inventory 2.0 photos unavailable", e); }
  }
  async function savePhotos(f, snap, productId) {
    const A = window.TriplemAttachments;
    if (!A || !snap || (!snap.items.length && !snap.removed.length)) return;
    try {
      await A.commit(snap, { module: ATT_MODULE, id: productId });
      // Clear the picked files so a second press of Save (e.g. after an opening-stock error) does not queue them again.
      A.reset(f); A.showExisting(f, { module: ATT_MODULE, id: productId });
    }
    catch (e) { Shell().toast(`The product was saved, but its files could not be stored on this device: ${e.message || e}`); }
  }

  function packRow(pk, units) {
    return `<div class="inv2-pack" data-pack>
      <label class="inv2-field">Unit<select class="inv2-input" name="pk_unit">${units.map(u => `<option value="${esc(u.id)}"${u.id === pk.unit_id ? " selected" : ""}>${esc(u.name)} (${esc(u.code)})</option>`).join("")}</select></label>
      <label class="inv2-field">Contains (base units)<input class="inv2-input" name="pk_factor" type="number" min="0.000001" step="any" value="${esc(pk.factor ?? "")}" placeholder="e.g. 12"></label>
      <button type="button" class="inv2-icon-btn small" data-remove-pack aria-label="Remove pack size"><i class="fa-solid fa-trash" aria-hidden="true"></i></button></div>`;
  }

  async function save(f, p) {
    const name = f.name.value.trim();
    if (!name) throw new Error("Enter the product name.");
    const variants = f._readVariants();
    const multiOn = f.querySelector("[data-multi]").checked;
    if (multiOn && variants.some(v => !v.name.trim())) throw new Error("Give every variant a name (for example 128GB Black).");
    for (const v of variants) {
      if (v.sell_price === "" && f.product_type.value !== "service") throw new Error("Enter a selling price for every variant.");
      v.barcodes = v.barcodes.map(b => ({ barcode: b.barcode, symbology: symbologyOf(b.barcode), is_internal: /^2\d{12}$/.test(b.barcode) }));
    }
    const all = variants.flatMap(v => v.barcodes.map(b => b.barcode));
    if (new Set(all).size !== all.length) throw new Error("The same barcode is entered twice.");
    const packs = [...f.querySelectorAll("[data-pack]")].map(r => ({ unit_id: r.querySelector("[name=pk_unit]").value, factor: r.querySelector("[name=pk_factor]").value })).filter(x => x.factor);
    const boot = I().boot();
    const catName = f.category.value.trim(), brandName = f.brand.value.trim();
    const cat = (boot.categories || []).find(c => c.name.toLowerCase() === catName.toLowerCase());
    const brand = (boot.brands || []).find(b => b.name.toLowerCase() === brandName.toLowerCase());
    const payload = {
      id: p?.id || f._savedId || null, name, category_id: cat?.id || null, category_name: cat ? null : catName || null, brand_id: brand?.id || null, brand_name: brand ? null : brandName || null,
      product_type: f.product_type.value, tracking: f.tracking.value, base_unit_id: f.base_unit.value, tax_rate: f.tax_rate.value || 0, price_includes_tax: f.incl.checked,
      icon_id: f.dataset.icon || p?.icon_id || null, manufacturer: f.manufacturer.value, model: f.model.value, warranty_months: f.warranty.value,
      country_of_origin: f.origin.value, description: f.description.value, notes: f.notes.value, is_active: p ? p.is_active : true, units: packs, variants
    };
    if (!p && f._savedId && f._savedVariants) payload.variants = payload.variants.map((v, i) => ({ ...v, id: f._savedVariants[i] || "" }));
    const A = window.TriplemAttachments;
    if (A?.busy?.(f)) throw new Error("A photo is still being prepared. Wait a moment and save again.");
    const snap = A?.take?.(f) || null;
    let saved;
    try { saved = await I().rpc("app_inv2_product_save", { p_product: payload }); }
    catch (ex) { if (snap) A.restore(snap); throw ex; }
    await savePhotos(f, snap, saved.id);
    // Remember the new product so a retry (e.g. after an opening-stock error) updates it instead of adding a copy.
    if (!p) { f._savedId = saved.id; f._savedVariants = saved.variants.map(v => v.id); }
    // Opening stock for a new single-variant product.
    if (!p && f.product_type.value !== "service" && !multiOn) {
      const trk = f.tracking.value;
      const serials = (f.open_serials?.value || "").split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
      const qty = (trk === "serial" || trk === "imei") ? serials.length : Number(f.open_qty.value || 0);
      if (qty > 0) {
        const line = { variant_id: saved.variants[0].id, qty, unit_cost: f.open_cost.value || saved.variants[0].cost_price || 0 };
        if (trk === "batch") { line.batch_no = f.open_batch.value.trim(); line.expiry_date = f.open_expiry.value || null; }
        if (serials.length) line.serials = serials;
        try { await I().rpc("app_inv2_stock_adjust", { p_client_op_id: I().opId(), p_location_id: f.open_loc.value, p_type: "opening", p_lines: [line], p_note: "Opening stock" }); }
        catch (ex) { throw new Error(`The product was saved, but the opening stock was not: ${ex.message || ex}. Add it from Inventory / Stock.`); }
      }
    }
    await I().loadBoot(true);
    return saved;
  }

  function init() { Shell()?.register("products", { render }); }
  window.TriplemInv2Products = { openEditor, internalBarcode, symbologyOf, ean13Check };
  if (window.TriplemInventoryV2Shell) init(); else document.addEventListener("DOMContentLoaded", init);
})();
