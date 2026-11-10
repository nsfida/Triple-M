/* Triplem VIP Inventory 2.0 - Phase 3: Inventory / Stock.
 *
 * Stock per outlet / warehouse, and the stock operations: add stock, remove stock,
 * damaged, expired, transfer between locations and physical count. Every operation
 * gets one client operation id when its form opens, so a double click or a retried
 * request never moves stock twice. Movement history explains every quantity.
 */
(function () {
  "use strict";
  const I = () => window.TriplemInv2;
  const Shell = () => window.TriplemInventoryV2Shell;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const V = { query: "", status: "active", offset: 0, limit: 50, focusProduct: "" };
  const MOVE_LABEL = {
    opening: "Opening stock", adjust_in: "Stock added", adjust_out: "Stock removed", damage: "Damaged", expired: "Expired", count: "Stock count",
    transfer_in: "Transfer in", transfer_out: "Transfer out", purchase: "Purchase received", purchase_return: "Purchase return",
    sale: "Sale", sale_return: "Sale return", reserve: "Reserved", release: "Released"
  };
  const OPS = {
    add: { title: "Add stock", icon: "fa-plus", rpcType: "adjust", sign: 1, cost: true, reason: "Reason", reasonHint: "e.g. Delivery received before purchases are set up" },
    remove: { title: "Remove stock", icon: "fa-minus", rpcType: "adjust", sign: -1, reason: "Reason", reasonHint: "e.g. Correction, given as sample" },
    damage: { title: "Record damaged goods", icon: "fa-heart-crack", rpcType: "damage", sign: -1, reason: "What happened", reasonHint: "e.g. Broken in storage" },
    expired: { title: "Record expired goods", icon: "fa-hourglass-end", rpcType: "expired", sign: -1, reason: "Note", reasonHint: "e.g. Expired on shelf" },
    opening: { title: "Opening stock", icon: "fa-box", rpcType: "opening", sign: 1, cost: true, reason: "Note", reasonHint: "Optional", optionalReason: true },
    transfer: { title: "Transfer stock", icon: "fa-right-left", transfer: true, reason: "Note", reasonHint: "Optional", optionalReason: true },
    count: { title: "Stock count", icon: "fa-clipboard-check", count: true, reason: "Note", reasonHint: "e.g. Monthly count", optionalReason: true }
  };

  // ---- view --------------------------------------------------------------------------------------
  async function render(el, opts = {}) {
    if (opts.status) { V.status = opts.status; V.offset = 0; }
    await I().loadBoot();
    if (I().needsSetup(el)) return;
    const loc = I().activeLocations().find(l => l.id === I().location());
    el.innerHTML = `
      <div class="inv2-section-head inv2-head-row"><h1><i class="fa-solid fa-warehouse" aria-hidden="true"></i> Inventory / Stock <small>${esc(loc ? loc.name : "All locations")}</small></h1>
        ${I().canEdit() ? `<div class="inv2-actions">
          <button type="button" class="inv2-btn primary" data-op="add"><i class="fa-solid fa-plus" aria-hidden="true"></i> Add stock</button>
          <button type="button" class="inv2-btn" data-op="transfer"${I().activeLocations().length < 2 ? " disabled title=\"Add a second outlet or warehouse in Settings first\"" : ""}><i class="fa-solid fa-right-left" aria-hidden="true"></i> Transfer</button>
          <button type="button" class="inv2-btn" data-op="count"><i class="fa-solid fa-clipboard-check" aria-hidden="true"></i> Count</button>
          <div class="inv2-more"><button type="button" class="inv2-btn" data-more aria-haspopup="menu" aria-expanded="false"><i class="fa-solid fa-ellipsis" aria-hidden="true"></i> More</button>
            <div class="inv2-menu-pop" role="menu" hidden>
              <button type="button" role="menuitem" data-op="remove"><i class="fa-solid fa-minus" aria-hidden="true"></i> Remove stock</button>
              <button type="button" role="menuitem" data-op="damage"><i class="fa-solid fa-heart-crack" aria-hidden="true"></i> Damaged goods</button>
              <button type="button" role="menuitem" data-op="expired"><i class="fa-solid fa-hourglass-end" aria-hidden="true"></i> Expired goods</button>
            </div></div></div>` : ""}
      </div>
      <div class="inv2-summary-strip" data-strip></div>
      <div class="inv2-toolbar">
        <label class="inv2-search inv2-search-inline"><i class="fa-solid fa-barcode" aria-hidden="true"></i><input type="search" data-q placeholder="Scan or search a product…" value="${esc(V.query)}" aria-label="Search stock"></label>
        <div class="inv2-seg inv2-seg-lg" role="tablist" aria-label="Stock status">${[["active", "All"], ["low", "Low"], ["out", "Out of stock"]].map(([k, v]) => `<button type="button" role="tab" data-st="${k}" aria-selected="${V.status === k}">${v}</button>`).join("")}</div>
      </div>
      <section class="inv2-card inv2-table-card"><div data-rows><div class="inv2-loading"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Loading stock…</div></div></section>`;
    el.querySelectorAll("[data-op]").forEach(b => b.addEventListener("click", () => { closeMenus(el); openOperation(b.dataset.op, [], el); }));
    const more = el.querySelector("[data-more]");
    more?.addEventListener("click", () => { const m = more.nextElementSibling; m.hidden = !m.hidden; more.setAttribute("aria-expanded", String(!m.hidden)); });
    const q = el.querySelector("[data-q]"); let t = 0;
    q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { V.query = q.value.trim(); V.offset = 0; loadRows(el); }, 280); });
    q.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); V.query = q.value.trim(); V.offset = 0; loadRows(el); } });
    el.querySelectorAll("[data-st]").forEach(b => b.addEventListener("click", () => { V.status = b.dataset.st; V.offset = 0; el.querySelectorAll("[data-st]").forEach(x => x.setAttribute("aria-selected", String(x === b))); loadRows(el); }));
    loadStrip(el);
    await loadRows(el);
  }
  function closeMenus(el) { el.querySelectorAll(".inv2-menu-pop").forEach(m => { m.hidden = true; }); el.querySelector("[data-more]")?.setAttribute("aria-expanded", "false"); }

  async function loadStrip(el) {
    const box = el.querySelector("[data-strip]");
    try {
      const s = await I().rpc("app_inv2_stock_summary", { p_location_id: I().location() || null });
      box.innerHTML = [["Products", s.products, "fa-cube", ""], ["Low stock", s.low, "fa-arrow-trend-down", s.low ? "warn" : ""], ["Out of stock", s.out, "fa-ban", s.out ? "bad" : ""],
        ["Stock value", I().money(s.value), "fa-coins", ""], ["Expiring in 30 days", s.expiring_30d, "fa-hourglass-half", s.expiring_30d ? "warn" : ""]]
        .map(([k, v, i, tone]) => `<div class="inv2-strip-item ${tone}"><i class="fa-solid ${i}" aria-hidden="true"></i><span>${k}</span><strong>${esc(String(v))}</strong></div>`).join("");
    } catch (_) { box.innerHTML = ""; }
  }

  async function loadRows(el) {
    const box = el.querySelector("[data-rows]");
    let res;
    try { res = await I().rpc("app_inv2_products_list", { p_search: V.query || null, p_category_id: null, p_location_id: I().location() || null, p_status: V.status, p_limit: V.limit, p_offset: V.offset }); }
    catch (e) { box.innerHTML = `<div class="inv2-alert inv2-alert-error">${esc(e.message || e)}</div>`; return; }
    const rows = res.rows.filter(r => r.product_type !== "service");
    if (!rows.length) { box.innerHTML = `<div class="inv2-empty"><i class="fa-solid fa-warehouse" aria-hidden="true"></i><p>${V.query || V.status !== "active" ? "Nothing matches these filters." : "No stocked products yet."}</p><small>Add products first; then add opening stock here.</small></div>`; return; }
    box.innerHTML = `
      <div class="inv2-table inv2-table-stock" role="table" aria-label="Stock">
        <div class="inv2-tr inv2-th" role="row"><span role="columnheader">Product</span><span role="columnheader" class="num">On hand</span><span role="columnheader" class="num">Low at</span><span role="columnheader" class="num">Value</span><span role="columnheader">Status</span><span role="columnheader"><span class="inv2-sr">Actions</span></span></div>
        ${rows.map(r => `<div class="inv2-tr" role="row" data-variant="${esc(r.variant_id)}">
          <span class="inv2-prod" role="cell"><span class="inv2-ico-tile">${I().iconHtml(r.icon_id || "general/package", "md")}</span><span><strong>${esc(r.name)}</strong>${r.variant_name ? `<small>${esc(r.variant_name)}</small>` : ""}<small class="mono">${esc(r.sku || "")}</small></span></span>
          <span role="cell" class="num"><strong>${I().qty(r.qty)}</strong> <small>${esc(r.unit_code || "")}</small></span>
          <span role="cell" class="num">${I().qty(r.min_stock)}</span>
          <span role="cell" class="num">${I().money(r.value)}</span>
          <span role="cell"><span class="inv2-badge ${r.stock_status === "out" ? "bad" : r.stock_status === "low" ? "warn" : "ok"}">${r.stock_status === "out" ? "Out of stock" : r.stock_status === "low" ? "Low stock" : "In stock"}</span></span>
          <span role="cell" class="inv2-row-actions">
            <button type="button" class="inv2-icon-btn small" data-history title="Movement history" aria-label="Movement history for ${esc(r.name)}"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i></button>
            ${I().canEdit() ? `<button type="button" class="inv2-icon-btn small" data-quick-add title="Add stock" aria-label="Add stock for ${esc(r.name)}"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>` : ""}
          </span></div>`).join("")}
      </div>
      <div class="inv2-pager"><span>${V.offset + 1}–${V.offset + res.rows.length} of ${res.total}</span>
        <button type="button" class="inv2-btn small" data-prev${V.offset === 0 ? " disabled" : ""}>Previous</button>
        <button type="button" class="inv2-btn small" data-next${V.offset + res.rows.length >= res.total ? " disabled" : ""}>Next</button></div>`;
    const byId = id => rows.find(r => r.variant_id === id);
    box.querySelectorAll("[data-history]").forEach(b => b.addEventListener("click", () => history(byId(b.closest("[data-variant]").dataset.variant))));
    box.querySelectorAll("[data-quick-add]").forEach(b => b.addEventListener("click", () => openOperation("add", [toLine(byId(b.closest("[data-variant]").dataset.variant))], el)));
    box.querySelector("[data-prev]")?.addEventListener("click", () => { V.offset = Math.max(0, V.offset - V.limit); loadRows(el); });
    box.querySelector("[data-next]")?.addEventListener("click", () => { V.offset += V.limit; loadRows(el); });
  }

  const toLine = r => ({ variant_id: r.variant_id, name: r.name, variant_name: r.variant_name, tracking: r.tracking, unit_code: r.unit_code, icon_id: r.icon_id, cost: r.cost_price, qty: "" });

  // ---- operation form ----------------------------------------------------------------------------
  function openOperation(kind, lines, viewEl) {
    const op = OPS[kind];
    const clientOp = I().opId();
    const locs = I().activeLocations();
    const defaultLoc = I().location() || I().settings().default_location_id || locs[0]?.id;
    const locOptions = sel => locs.map(l => `<option value="${esc(l.id)}"${l.id === sel ? " selected" : ""}>${esc(l.name)}</option>`).join("");
    let items = lines.slice();
    I().dialog({
      title: op.title, wide: true, submitLabel: op.count ? "Post count" : op.transfer ? "Transfer" : "Save",
      subtitle: op.count ? "Enter what you counted; the difference is recorded as a stock count." : op.transfer ? "Stock moves at the source location's average cost." : "",
      body: `
        <div class="inv2-form-grid">
          <label class="inv2-field">${op.transfer ? "From" : "Location"}<select class="inv2-input" name="loc">${locOptions(defaultLoc)}</select></label>
          ${op.transfer ? `<label class="inv2-field">To<select class="inv2-input" name="to">${locOptions(locs.find(l => l.id !== defaultLoc)?.id)}</select></label>` : ""}
          <label class="inv2-field ${op.transfer ? "wide" : ""}">${op.reason}${op.optionalReason ? "" : " *"}<input class="inv2-input" name="note" maxlength="300" placeholder="${esc(op.reasonHint)}"></label>
        </div>
        <label class="inv2-search inv2-search-inline inv2-scan-line"><i class="fa-solid fa-barcode" aria-hidden="true"></i><input type="search" data-scan placeholder="Scan a barcode or type a product name, then press Enter" aria-label="Add product by barcode or name" autocomplete="off"></label>
        <div class="inv2-suggest" data-suggest hidden></div>
        <div class="inv2-op-lines" data-lines></div>`,
      onOpen(f) {
        const linesEl = f.querySelector("[data-lines]");
        const draw = () => {
          if (!items.length) { linesEl.innerHTML = `<div class="inv2-empty small"><i class="fa-solid fa-barcode" aria-hidden="true"></i><p>Scan or search products to add them.</p></div>`; return; }
          linesEl.innerHTML = items.map((it, i) => lineHtml(it, i, op)).join("");
          items.forEach((it, i) => { if (it.tracking !== "none" && !it._tracking) loadTracking(i); });
          Shell().setDirty(true);
        };
        const loadTracking = async i => {
          const it = items[i];
          if (op.sign === 1 && !op.transfer) return;  // incoming: typed in
          try { it._tracking = await I().rpc("app_inv2_tracking_stock", { p_variant_id: it.variant_id, p_location_id: f.loc.value }); } catch (_) { it._tracking = { batches: [], serials: [] }; }
          const row = linesEl.querySelector(`[data-line="${i}"]`);
          if (row) row.outerHTML = lineHtml(it, i, op);
        };
        linesEl.addEventListener("input", e => {
          const row = e.target.closest("[data-line]"); if (!row) return;
          const it = items[Number(row.dataset.line)]; it[e.target.name] = e.target.value;
        });
        linesEl.addEventListener("change", e => {
          const row = e.target.closest("[data-line]"); if (!row) return;
          const it = items[Number(row.dataset.line)];
          if (e.target.type === "checkbox" && e.target.name === "serial_pick") {
            it.serials = [...row.querySelectorAll("[name=serial_pick]:checked")].map(x => x.value);
          } else it[e.target.name] = e.target.value;
        });
        linesEl.addEventListener("click", e => { const r = e.target.closest("[data-remove-line]"); if (!r) return; items.splice(Number(r.closest("[data-line]").dataset.line), 1); draw(); });
        f.loc.addEventListener("change", () => { items.forEach(it => { delete it._tracking; it.serials = []; }); draw(); });
        const scan = f.querySelector("[data-scan]"), sug = f.querySelector("[data-suggest]");
        const add = r => { if (items.some(x => x.variant_id === r.variant_id)) { const ix = items.findIndex(x => x.variant_id === r.variant_id); if (items[ix].tracking === "none") items[ix].qty = String(Number(items[ix].qty || 0) + 1); }
          else items.push({ ...toLine(r), qty: op.count ? "" : (r.tracking === "none" ? "1" : "") }); draw(); scan.value = ""; sug.hidden = true; scan.focus(); };
        let t = 0;
        const search = async (term, exact) => {
          if (!term) { sug.hidden = true; return; }
          const res = await I().rpc("app_inv2_products_list", { p_search: term, p_status: "active", p_limit: 8, p_location_id: f.loc.value });
          const rows = res.rows.filter(r => r.product_type !== "service");
          if (exact && rows.length === 1) return add(rows[0]);
          sug.hidden = false;
          sug.innerHTML = rows.length ? rows.map(r => `<button type="button" data-pick="${esc(r.variant_id)}">${I().iconHtml(r.icon_id || "general/package")}<span><strong>${esc(r.name)}</strong> ${r.variant_name ? `<small>${esc(r.variant_name)}</small>` : ""}</span><small>${I().qty(r.qty)} ${esc(r.unit_code || "")}</small></button>`).join("") : `<p class="inv2-note">No product found for "${esc(term)}".</p>`;
          sug.querySelectorAll("[data-pick]").forEach(b => b.addEventListener("click", () => add(rows.find(r => r.variant_id === b.dataset.pick))));
        };
        scan.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => search(scan.value.trim(), false), 250); });
        scan.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); clearTimeout(t); search(scan.value.trim(), true); } });
        f._items = () => items;
        draw();
        if (window.matchMedia("(pointer: fine)").matches) setTimeout(() => scan.focus(), 50);
      },
      async onSubmit(f) {
        const note = f.note.value.trim();
        if (!op.optionalReason && !note) throw new Error(`Enter: ${op.reason.toLowerCase()}.`);
        const its = f._items();
        if (!its.length) throw new Error("Add at least one product.");
        const out = [];
        for (const it of its) {
          const name = it.name + (it.variant_name ? ` (${it.variant_name})` : "");
          const serials = (it.tracking === "serial" || it.tracking === "imei")
            ? (op.sign === 1 && !op.transfer ? String(it.serials_text || "").split(/[\n,]+/).map(s => s.trim()).filter(Boolean) : (it.serials || []))
            : null;
          let q = serials ? serials.length : Number(it.qty);
          if (op.count) {
            if (it.qty === "" || !(Number(it.qty) >= 0)) throw new Error(`Enter the counted quantity for ${name}.`);
            out.push({ variant_id: it.variant_id, counted: Number(it.qty) }); continue;
          }
          if (!(q > 0)) throw new Error(`Enter a quantity for ${name}.`);
          const line = { variant_id: it.variant_id, qty: op.sign === -1 ? -q : q };
          if (op.cost && it.cost !== "" && it.cost != null) line.unit_cost = it.cost;
          if (it.tracking === "batch") {
            if (!it.batch_no) throw new Error(`Enter the batch for ${name}.`);
            line.batch_no = it.batch_no; if (it.expiry_date) line.expiry_date = it.expiry_date;
          }
          if (serials) line.serials = serials;
          if (op.transfer) line.qty = q;
          out.push(line);
        }
        let res;
        if (op.count) res = await I().rpc("app_inv2_stock_count", { p_client_op_id: clientOp, p_location_id: f.loc.value, p_lines: out, p_note: note || null });
        else if (op.transfer) {
          if (f.loc.value === f.to.value) throw new Error("Choose two different locations.");
          res = await I().rpc("app_inv2_stock_transfer", { p_client_op_id: clientOp, p_from: f.loc.value, p_to: f.to.value, p_lines: out, p_note: note || null });
        } else res = await I().rpc("app_inv2_stock_adjust", { p_client_op_id: clientOp, p_location_id: f.loc.value, p_type: op.rpcType, p_lines: out, p_note: note || null });
        I().invalidateSummary();
        Shell().toast(op.count ? `Count posted: ${res.movements} change${res.movements === 1 ? "" : "s"}.` : `${op.title}: saved.`);
        if (viewEl && Shell().current() === "stock") render(viewEl); else if (viewEl) Shell().show(Shell().current(), { force: true });
      }
    });
  }

  function lineHtml(it, i, op) {
    const incoming = op.sign === 1 && !op.transfer;
    const serialTracked = it.tracking === "serial" || it.tracking === "imei";
    let fields = "";
    if (op.count) fields = `<label class="inv2-field">Counted<input class="inv2-input" name="qty" type="number" min="0" step="any" inputmode="decimal" value="${esc(it.qty)}"></label>`;
    else if (serialTracked && incoming) fields = `<label class="inv2-field grow">${it.tracking === "imei" ? "IMEI numbers" : "Serial numbers"}<textarea class="inv2-input mono" name="serials_text" rows="2" placeholder="One per line — scan each device">${esc(it.serials_text || "")}</textarea></label>`;
    else if (serialTracked) {
      const list = it._tracking?.serials;
      fields = list ? (list.length ? `<fieldset class="inv2-serial-pick"><legend>Choose ${it.tracking === "imei" ? "IMEI" : "serial"} numbers</legend>${list.map(s => `<label><input type="checkbox" name="serial_pick" value="${esc(s)}"${(it.serials || []).includes(s) ? " checked" : ""}> <code>${esc(s)}</code></label>`).join("")}</fieldset>` : `<p class="inv2-note">None in stock at this location.</p>`) : `<p class="inv2-note">Loading serial numbers…</p>`;
    } else fields = `<label class="inv2-field">Quantity<input class="inv2-input" name="qty" type="number" min="0" step="any" inputmode="decimal" value="${esc(it.qty)}"></label>`;
    if (it.tracking === "batch" && !op.count) {
      if (incoming) fields += `<label class="inv2-field">Batch<input class="inv2-input" name="batch_no" maxlength="60" value="${esc(it.batch_no || "")}"></label><label class="inv2-field">Expiry<input class="inv2-input" name="expiry_date" type="date" value="${esc(it.expiry_date || "")}"></label>`;
      else { const b = it._tracking?.batches || []; fields += `<label class="inv2-field">Batch<select class="inv2-input" name="batch_no"><option value="">Choose…</option>${b.map(x => `<option value="${esc(x.batch_no)}"${x.batch_no === it.batch_no ? " selected" : ""}>${esc(x.batch_no)} · ${I().qty(x.qty)}${x.expiry_date ? ` · exp ${esc(x.expiry_date)}` : ""}</option>`).join("")}</select></label>`; }
    }
    if (op.cost && !op.count) fields += `<label class="inv2-field">Cost per unit<input class="inv2-input" name="cost" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(it.cost ?? "")}"></label>`;
    return `<div class="inv2-op-line" data-line="${i}">
      <div class="inv2-prod"><span class="inv2-ico-tile">${I().iconHtml(it.icon_id || "general/package", "md")}</span><span><strong>${esc(it.name)}</strong>${it.variant_name ? `<small>${esc(it.variant_name)}</small>` : ""}${it.tracking !== "none" ? `<small>${it.tracking === "batch" ? "Batch tracked" : it.tracking === "imei" ? "IMEI tracked" : "Serial tracked"}</small>` : ""}</span></div>
      <div class="inv2-op-fields">${fields}</div>
      <button type="button" class="inv2-icon-btn small" data-remove-line aria-label="Remove ${esc(it.name)}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>`;
  }

  // ---- history ---------------------------------------------------------------------------------
  async function history(r) {
    if (!r) return;
    let rows = [];
    try { rows = await I().rpc("app_inv2_movements", { p_variant_id: r.variant_id, p_location_id: I().location() || null, p_limit: 100 }); }
    catch (e) { Shell().toast(e.message || String(e)); return; }
    I().dialog({
      title: `${r.name}${r.variant_name ? ` · ${r.variant_name}` : ""}`, subtitle: "Every change to this product's stock, newest first", wide: true,
      body: rows.length ? `<div class="inv2-table inv2-table-history" role="table" aria-label="Stock movements">
        <div class="inv2-tr inv2-th" role="row"><span>Date</span><span>Activity</span><span>Location</span><span class="num">In</span><span class="num">Out</span><span class="num">Balance</span><span>By / note</span></div>
        ${rows.map(m => `<div class="inv2-tr" role="row"><span>${esc(I().dateTime(m.created_at))}</span><span>${esc(MOVE_LABEL[m.movement_type] || m.movement_type)}${m.batch_no ? `<small>Batch ${esc(m.batch_no)}</small>` : ""}${m.serial_no ? `<small class="mono">${esc(m.serial_no)}</small>` : ""}</span>
          <span>${esc(m.location_name)}</span><span class="num in">${m.qty > 0 ? I().qty(m.qty) : ""}</span><span class="num out">${m.qty < 0 ? I().qty(-m.qty) : ""}</span><span class="num"><strong>${I().qty(m.balance_after)}</strong></span>
          <span>${esc(m.user_name || "")}${m.note ? `<small>${esc(m.note)}</small>` : ""}</span></div>`).join("")}</div>` : `<div class="inv2-empty"><p>No stock movements yet.</p></div>`
    });
  }

  async function openProduct(productId) {
    const sh = Shell();
    sh.show("stock", { force: true });
  }

  function init() { Shell()?.register("stock", { render }); }
  window.TriplemInv2Stock = { openOperation, openProduct };
  if (window.TriplemInventoryV2Shell) init(); else document.addEventListener("DOMContentLoaded", init);
})();
