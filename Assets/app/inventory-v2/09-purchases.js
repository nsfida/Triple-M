/* Triplem VIP Inventory 2.0 - Phase 5: Purchases.
 *
 * Purchase orders (no stock until received), goods received / supplier bills (stock
 * in at the net cost, which updates the moving average; tax is kept apart), receiving
 * against an order in one or more deliveries, purchase returns, and payments to
 * suppliers. With Accounting connected, received goods are posted to the Inventory
 * asset (not to expenses) and the supplier's balance to Accounts Payable.
 */
(function () {
  "use strict";
  const I = () => window.TriplemInv2;
  const Shell = () => window.TriplemInventoryV2Shell;
  const Pr = () => window.TriplemInv2Print;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const r2 = v => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
  const STATUS = { completed: ["Received", "ok"], open: ["Open", "info"], partial: ["Part received", "warn"], received: ["Received", "ok"], cancelled: ["Cancelled", "muted"] };
  const V = { tab: "purchase", query: "", offset: 0 };
  const LIMIT = 50;

  async function render(el) {
    await I().loadBoot();
    if (I().needsSetup(el)) return;
    el.innerHTML = `
      <div class="inv2-section-head inv2-head-row"><h1><i class="fa-solid fa-truck-ramp-box" aria-hidden="true"></i> Purchases</h1>
        ${I().canEdit() ? `<div class="inv2-actions"><button type="button" class="inv2-btn" data-new="order"><i class="fa-solid fa-file-lines" aria-hidden="true"></i> New order</button>
          <button type="button" class="inv2-btn primary" data-new="receive"><i class="fa-solid fa-dolly" aria-hidden="true"></i> Receive goods</button></div>` : ""}</div>
      <div class="inv2-toolbar"><div class="inv2-seg inv2-seg-lg" role="tablist">${[["purchase", "Received"], ["order", "Orders"], ["return", "Returns"], ["unpaid", "Unpaid"]].map(([k, v]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${V.tab === k}">${v}</button>`).join("")}</div>
        <label class="inv2-search inv2-search-inline"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" data-q placeholder="Number, supplier or supplier reference" value="${esc(V.query)}" aria-label="Search purchases"></label></div>
      <section class="inv2-card inv2-table-card"><div data-rows><div class="inv2-loading"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i></div></div></section>`;
    el.querySelectorAll("[data-new]").forEach(b => b.addEventListener("click", () => editor(b.dataset.new, () => rows(el))));
    const q = el.querySelector("[data-q]"); let t = 0;
    q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { V.query = q.value.trim(); V.offset = 0; rows(el); }, 260); });
    el.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => { V.tab = b.dataset.tab; V.offset = 0; el.querySelectorAll("[data-tab]").forEach(x => x.setAttribute("aria-selected", String(x === b))); rows(el); }));
    await rows(el);
  }

  async function rows(el) {
    const box = el.querySelector("[data-rows]");
    let r;
    try { r = await I().rpc("app_inv2_purchases_list", { p_type: V.tab === "unpaid" ? "purchase" : V.tab, p_status: V.tab === "unpaid" ? "unpaid" : null, p_search: V.query || null, p_supplier_id: null, p_limit: LIMIT, p_offset: V.offset }); }
    catch (e) { box.innerHTML = `<div class="inv2-alert inv2-alert-error">${esc(e.message || e)}</div>`; return; }
    if (!r.rows.length) { box.innerHTML = `<div class="inv2-empty"><i class="fa-solid fa-truck-ramp-box" aria-hidden="true"></i><p>${V.query ? "Nothing matches." : "Nothing here yet."}</p>${!V.query && V.tab === "purchase" ? `<small>Use Receive goods when a delivery arrives; stock and cost update at once.</small>` : ""}</div>`; return; }
    box.innerHTML = `<div class="inv2-table inv2-table-sales" role="table">
      <div class="inv2-tr inv2-th" role="row"><span>Number</span><span>Supplier</span><span>Date</span><span class="num">Total</span><span class="num">Due</span><span>Status</span></div>
      ${r.rows.map((x, i) => { const [lab, tone] = STATUS[x.status] || [x.status, "muted"]; return `<button type="button" class="inv2-tr" role="row" data-open="${i}">
        <span class="inv2-prod"><span class="inv2-ico-tile sm"><i class="fa-solid ${x.doc_type === "order" ? "fa-file-lines" : x.doc_type === "return" ? "fa-rotate-left" : "fa-dolly"}" aria-hidden="true"></i></span><span><strong>${esc(x.doc_no || "")}</strong><small>${esc(x.supplier_ref || x.location_name)}${x.posting === "pending" ? " · posting waiting" : ""}</small></span></span>
        <span dir="auto">${esc(x.supplier_name)}</span><span>${esc(x.doc_date)}${x.expected_date && x.doc_type === "order" ? ` <small>· expected ${esc(x.expected_date)}</small>` : ""}</span>
        <span class="num"><strong>${esc(I().money(x.total))}</strong></span><span class="num">${Number(x.due) > 0 ? `<strong class="warn">${esc(I().money(x.due))}</strong>` : "—"}</span>
        <span><span class="inv2-badge ${tone}">${x.doc_type === "return" ? "Returned" : lab}</span></span></button>`; }).join("")}</div>
      <div class="inv2-pager"><span>${V.offset + 1}–${V.offset + r.rows.length} of ${r.total}</span>
        <button type="button" class="inv2-btn small" data-prev${V.offset === 0 ? " disabled" : ""}>Previous</button><button type="button" class="inv2-btn small" data-next${V.offset + r.rows.length >= r.total ? " disabled" : ""}>Next</button></div>`;
    box.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => openPurchase(r.rows[Number(b.dataset.open)].id, () => rows(el))));
    box.querySelector("[data-prev]")?.addEventListener("click", () => { V.offset = Math.max(0, V.offset - LIMIT); rows(el); });
    box.querySelector("[data-next]")?.addEventListener("click", () => { V.offset += LIMIT; rows(el); });
  }

  // ---- new order / receive goods -----------------------------------------------------------
  function editor(action, after) {
    const opId = I().opId();
    const receive = action === "receive";
    const locs = I().activeLocations();
    let supplier = null, lines = [];
    const d = I().dialog({
      title: receive ? "Receive goods" : "New purchase order", subtitle: receive ? "Stock is added now and the supplier's balance goes up." : "Nothing is added to stock until the order is received.",
      wide: true, submitLabel: receive ? "Receive and save" : "Save order",
      body: `<div class="inv2-form-grid inv2-form-grid-3">
          <div class="inv2-field">Supplier *<button type="button" class="inv2-input inv2-picker" data-sup>Choose a supplier…</button></div>
          <label class="inv2-field">Location<select class="inv2-input" name="loc">${locs.map(l => `<option value="${esc(l.id)}"${l.id === (I().location() || I().settings().default_location_id) ? " selected" : ""}>${esc(l.name)}</option>`).join("")}</select></label>
          <label class="inv2-field">Date<input class="inv2-input" name="date" type="date" value="${new Date().toISOString().slice(0, 10)}"></label>
          ${receive ? `<label class="inv2-field">Supplier invoice no.<input class="inv2-input" name="ref" maxlength="60"></label><label class="inv2-field">Due date<input class="inv2-input" name="due" type="date"><small>Empty = supplier's terms</small></label>`
            : `<label class="inv2-field">Expected delivery<input class="inv2-input" name="expected" type="date"></label>`}
        </div>
        <label class="inv2-search inv2-search-inline inv2-scan-line"><i class="fa-solid fa-barcode" aria-hidden="true"></i><input type="search" data-scan placeholder="Scan a barcode or type a product name, then press Enter" autocomplete="off"></label>
        <div class="inv2-suggest" data-suggest hidden></div>
        <div class="inv2-op-lines" data-lines></div>
        <div class="inv2-form-grid inv2-form-grid-3">
          <label class="inv2-field">Discount on the whole bill<input class="inv2-input" name="disc" type="number" min="0" step="0.01" value="0"></label>
          ${receive ? `<label class="inv2-field">Paid now<input class="inv2-input" name="paid" type="number" min="0" step="0.01" placeholder="0 = on account"></label>
            <label class="inv2-field">Paid by<select class="inv2-input" name="method">${Object.entries(Pr().METHOD).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select></label>` : ""}
          <label class="inv2-field wide">Notes<input class="inv2-input" name="notes" maxlength="500"></label>
        </div>
        <div class="inv2-pay-sum" data-tot></div>`,
      onOpen(f) {
        const linesEl = f.querySelector("[data-lines]"), scan = f.querySelector("[data-scan]"), sug = f.querySelector("[data-suggest]");
        f.querySelector("[data-sup]").addEventListener("click", async () => { const s = await window.TriplemInv2Parties.pickParty("supplier"); if (s) { supplier = s; f.querySelector("[data-sup]").textContent = s.name; } });
        const totals = () => {
          let sub = 0, tax = 0; const disc = Number(f.disc.value || 0), gross = lines.reduce((a, l) => a + r2(l.qty * l.cost) , 0);
          lines.forEach(l => { const g = r2(l.qty * l.cost); const share = gross ? disc * g / gross : 0; const net = r2(g - share); sub += net; tax += r2(net * Number(l.tax_rate || 0) / 100); });
          f.querySelector("[data-tot]").innerHTML = `<div><span>Subtotal</span><strong>${esc(I().money(sub))}</strong></div><div><span>Tax</span><strong>${esc(I().money(tax))}</strong></div><div class="grand"><span>Total</span><strong>${esc(I().money(sub + tax))}</strong></div>`;
        };
        const draw = () => {
          linesEl.innerHTML = lines.length ? lines.map((l, i) => `<div class="inv2-op-line" data-i="${i}">
            <div class="inv2-prod"><span class="inv2-ico-tile">${I().iconHtml(l.icon_id || "general/package", "md")}</span><span><strong>${esc(l.name)}</strong>${l.variant_name ? `<small>${esc(l.variant_name)}</small>` : ""}${l.tracking !== "none" ? `<small>${l.tracking === "batch" ? "Batch tracked" : l.tracking === "imei" ? "IMEI tracked" : "Serial tracked"}</small>` : ""}</span></div>
            <div class="inv2-op-fields">
              ${receive && (l.tracking === "imei" || l.tracking === "serial") ? `<label class="inv2-field grow">${l.tracking === "imei" ? "IMEI" : "Serial"} numbers (one per line)<textarea class="inv2-input mono" rows="2" data-f="serials">${esc(l.serials)}</textarea></label>`
                : `<label class="inv2-field">Quantity<input class="inv2-input" type="number" min="0" step="any" inputmode="decimal" data-f="qty" value="${esc(l.qty)}"></label>`}
              <label class="inv2-field">Unit cost (excl. tax)<input class="inv2-input" type="number" min="0" step="0.01" inputmode="decimal" data-f="cost" value="${esc(l.cost)}"></label>
              <label class="inv2-field">Tax %<input class="inv2-input" type="number" min="0" max="100" step="0.01" data-f="tax_rate" value="${esc(l.tax_rate)}"></label>
              ${receive && l.tracking === "batch" ? `<label class="inv2-field">Batch *<input class="inv2-input" data-f="batch_no" value="${esc(l.batch_no)}"></label><label class="inv2-field">Expiry<input class="inv2-input" type="date" data-f="expiry_date" value="${esc(l.expiry_date)}"></label>` : ""}
            </div>
            <button type="button" class="inv2-icon-btn small" data-rm="${i}" aria-label="Remove"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>`).join("")
            : `<div class="inv2-empty small"><i class="fa-solid fa-barcode" aria-hidden="true"></i><p>Scan or search products to add them.</p></div>`;
          linesEl.querySelectorAll("[data-f]").forEach(inp => inp.addEventListener("input", () => {
            const l = lines[Number(inp.closest("[data-i]").dataset.i)], k = inp.dataset.f;
            if (k === "serials") { l.serials = inp.value; l.qty = inp.value.split(/[\n,]+/).map(s => s.trim()).filter(Boolean).length; } else l[k] = ["qty", "cost", "tax_rate"].includes(k) ? Number(inp.value || 0) : inp.value;
            totals();
          }));
          linesEl.querySelectorAll("[data-rm]").forEach(b => b.addEventListener("click", () => { lines.splice(Number(b.dataset.rm), 1); draw(); }));
          totals();
        };
        const add = it => {
          const ex = lines.find(l => l.variant_id === it.variant_id);
          if (ex && !(it.tracking === "imei" || it.tracking === "serial")) ex.qty = Number(ex.qty) + 1;
          else if (!ex) lines.push({ variant_id: it.variant_id, name: it.name, variant_name: it.variant_name, icon_id: it.icon_id, tracking: it.tracking, qty: it.tracking === "imei" || it.tracking === "serial" ? 0 : 1, cost: Number(it.cost_price || 0), tax_rate: Number(it.tax_rate || 0), batch_no: "", expiry_date: "", serials: "" });
          draw(); scan.value = ""; sug.hidden = true; scan.focus();
        };
        const search = async () => {
          const q = scan.value.trim(); if (!q) { sug.hidden = true; return; }
          const items = await I().rpc("app_inv2_pos_items", { p_search: q, p_category_id: null, p_location_id: null, p_limit: 8 }).catch(() => []);
          if (items.length === 1 && /^\S{6,}$/.test(q)) { add(items[0]); return; }
          sug.hidden = !items.length;
          sug.innerHTML = items.map((it, i) => `<button type="button" data-s="${i}"><span class="inv2-ico-tile sm">${I().iconHtml(it.icon_id || "general/package")}</span><span>${esc(it.name)}${it.variant_name ? ` <small>${esc(it.variant_name)}</small>` : ""}</span><small>${esc(I().money(it.cost_price))}</small></button>`).join("");
          sug.querySelectorAll("[data-s]").forEach(b => b.addEventListener("click", () => add(items[Number(b.dataset.s)])));
        };
        let t = 0;
        scan.addEventListener("input", () => { clearTimeout(t); t = setTimeout(search, 250); });
        scan.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); clearTimeout(t); search(); } });
        f.disc.addEventListener("input", totals);
        draw();
      },
      async onSubmit(f) {
        if (!supplier) throw new Error("Choose a supplier.");
        if (!lines.length) throw new Error("Add at least one product.");
        const doc = { action, supplier_id: supplier.id, location_id: f.loc.value, doc_date: f.date.value, discount: Number(f.disc.value || 0), notes: f.notes.value,
          lines: lines.map(l => ({ variant_id: l.variant_id, qty: l.qty, unit_cost: l.cost, tax_rate: l.tax_rate, batch_no: l.batch_no || undefined, expiry_date: l.expiry_date || undefined,
            serials: receive && (l.tracking === "imei" || l.tracking === "serial") ? l.serials.split(/[\n,]+/).map(s => s.trim()).filter(Boolean) : undefined })) };
        if (receive) { doc.supplier_ref = f.ref.value; doc.due_date = f.due.value || undefined; if (Number(f.paid.value) > 0) doc.payments = [{ method: f.method.value, amount: Number(f.paid.value) }]; }
        else doc.expected_date = f.expected.value || undefined;
        const r = await I().rpc("app_inv2_purchase_save", { p_client_op_id: opId, p_doc: doc });
        Shell().toast(`${r.doc_no} saved.${r.posting === "pending" ? " Accounting posting is waiting for setup." : ""}`);
        I().invalidateSummary();
        after && after();
        setTimeout(() => openPurchase(r.id, after), 50);
      }
    });
    return d;
  }

  // ---- one document ----------------------------------------------------------------------
  async function openPurchase(id, after) {
    let x;
    try { x = await I().rpc("app_inv2_purchase_get", { p_id: id }); } catch (e) { Shell().toast(e.message || String(e)); return; }
    const [lab, tone] = x.doc_type === "return" ? ["Returned", "muted"] : (STATUS[x.status] || [x.status, "muted"]);
    const title = { order: "Purchase order", purchase: "Goods received", return: "Purchase return" }[x.doc_type];
    const d = I().dialog({
      title: `${title} ${x.doc_no || ""}`, subtitle: `${x.supplier?.name || ""} · ${x.doc_date}${x.supplier_ref ? ` · ref ${x.supplier_ref}` : ""}`, wide: true,
      body: `<div class="inv2-docview">
        <div class="inv2-doc-top"><div><span class="inv2-badge ${tone}">${lab}</span>${x.source ? `<span class="inv2-badge muted">From ${esc(x.source.doc_no)}</span>` : ""}${x.posting ? `<span class="inv2-badge ${x.posting.status === "posted" ? "ok" : "warn"}" title="${esc(x.posting.message || "")}">Accounting: ${esc(x.posting.status === "posted" ? x.posting.journal_no : x.posting.status)}</span>` : ""}</div>
          <div class="inv2-doc-cust"><i class="fa-solid fa-truck" aria-hidden="true"></i> <span dir="auto">${esc(x.supplier?.name || "")}</span> · ${esc(x.location?.name || "")}</div></div>
        <div class="inv2-table inv2-table-lines" role="table">
          <div class="inv2-tr inv2-th" role="row"><span>Item</span><span class="num">Qty</span><span class="num">Cost</span><span class="num">${x.doc_type === "order" ? "Received" : "Discount"}</span><span class="num">Tax</span><span class="num">Amount</span></div>
          ${x.lines.map(l => `<div class="inv2-tr" role="row"><span class="inv2-prod"><span class="inv2-ico-tile sm">${I().iconHtml(l.icon_id || "general/package")}</span><span><strong dir="auto">${esc(l.description)}</strong>${(l.serials || []).length ? `<small class="mono">${l.serials.map(esc).join(", ")}</small>` : ""}${l.batch_no ? `<small>Batch ${esc(l.batch_no)}${l.expiry_date ? ` · exp ${esc(l.expiry_date)}` : ""}</small>` : ""}${Number(l.returned_qty) ? `<small class="warn">${I().qty(l.returned_qty)} returned</small>` : ""}</span></span>
            <span class="num">${I().qty(l.qty)}</span><span class="num">${esc(I().money(l.unit_cost))}</span><span class="num">${x.doc_type === "order" ? I().qty(l.received_qty) : (Number(l.discount) ? esc(I().money(l.discount)) : "—")}</span><span class="num">${esc(I().money(l.tax_amount))}</span><span class="num"><strong>${esc(I().money(l.line_total))}</strong></span></div>`).join("")}</div>
        <div class="inv2-doc-foot"><div class="inv2-doc-pays">${(x.payments || []).map(p => `<div><span>${p.direction === "out" ? "Paid" : "Refund received"} · ${esc(Pr().METHOD[p.method] || p.method)} <small>${esc(p.doc_no)}</small></span><strong>${esc(I().money(p.amount))}</strong></div>`).join("")}
            ${(x.receipts || []).map(y => `<div><span>${y.doc_type === "return" ? "Return" : "Received"} <button type="button" class="inv2-link" data-sub="${esc(y.id)}">${esc(y.doc_no)}</button> · ${esc(y.doc_date)}</span><strong>${esc(I().money(y.total))}</strong></div>`).join("")}
            ${x.notes ? `<p class="inv2-note">Note: ${esc(x.notes)}</p>` : ""}${x.reason ? `<p class="inv2-note">Reason: ${esc(x.reason)}</p>` : ""}</div>
          <div class="inv2-doc-tots"><div><span>Subtotal</span><span>${esc(I().money(x.subtotal))}</span></div><div><span>Tax</span><span>${esc(I().money(x.tax_total))}</span></div>
            <div class="grand"><span>Total</span><span>${esc(I().money(x.total))}</span></div>${x.doc_type === "purchase" ? `<div class="${Number(x.due) > 0 ? "warn" : "ok"}"><span>Due</span><span>${esc(I().money(x.due))}</span></div>` : ""}</div></div></div>`,
      onOpen(f) {
        const foot = f.querySelector(".inv2-dialog-foot"), b = [];
        b.push(`<button type="button" class="inv2-btn" data-print><i class="fa-solid fa-print" aria-hidden="true"></i> Print</button>`);
        if (I().canEdit()) {
          if (x.doc_type === "order" && ["open", "partial"].includes(x.status)) b.push(`${x.status === "open" ? `<button type="button" class="inv2-btn danger-ghost" data-cancel>Cancel order</button>` : ""}<button type="button" class="inv2-btn primary" data-receive><i class="fa-solid fa-dolly" aria-hidden="true"></i> Receive</button>`);
          if (x.doc_type === "purchase" && Number(x.due) > 0) b.push(`<button type="button" class="inv2-btn" data-pay><i class="fa-solid fa-money-bill-transfer" aria-hidden="true"></i> Pay</button>`);
          if (x.doc_type === "purchase" && x.lines.some(l => Number(l.qty) > Number(l.returned_qty))) b.push(`<button type="button" class="inv2-btn" data-return><i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Return to supplier</button>`);
        }
        foot.innerHTML = b.join("") + `<button type="button" class="inv2-btn" data-close-x>Close</button>`;
        foot.querySelector("[data-close-x]").addEventListener("click", () => d.close(true));
        foot.querySelector("[data-print]").addEventListener("click", () => Pr().printPurchase(x));
        foot.querySelector("[data-receive]")?.addEventListener("click", () => { d.close(true); receiveDialog(x, after); });
        foot.querySelector("[data-pay]")?.addEventListener("click", () => { d.close(true); window.TriplemInv2Parties.paymentDialog("supplier", { id: x.supplier_id }, () => after && after(), x.id); });
        foot.querySelector("[data-return]")?.addEventListener("click", () => { d.close(true); returnDialog(x, after); });
        foot.querySelector("[data-cancel]")?.addEventListener("click", async () => {
          if (!confirm(`Cancel ${x.doc_no}?`)) return;
          try { await I().rpc("app_inv2_purchase_cancel", { p_id: x.id, p_reason: null }); d.close(true); after && after(); } catch (e) { f.querySelector("[data-error]").textContent = e.message; }
        });
        f.querySelectorAll("[data-sub]").forEach(s => s.addEventListener("click", () => { d.close(true); openPurchase(s.dataset.sub, after); }));
      }
    });
  }

  function receiveDialog(o, after) {
    const opId = I().opId();
    const open = o.lines.filter(l => Number(l.qty) > Number(l.received_qty));
    I().dialog({
      title: `Receive ${o.doc_no}`, subtitle: o.supplier?.name || "", wide: true, submitLabel: "Receive",
      body: `<div class="inv2-form-grid inv2-form-grid-3"><label class="inv2-field">Supplier invoice no.<input class="inv2-input" name="ref" maxlength="60"></label>
          <label class="inv2-field">Date<input class="inv2-input" name="date" type="date" value="${new Date().toISOString().slice(0, 10)}"></label>
          <label class="inv2-field">Paid now<input class="inv2-input" name="paid" type="number" min="0" step="0.01" placeholder="0 = on account"></label>
          <label class="inv2-field">Paid by<select class="inv2-input" name="method">${Object.entries(Pr().METHOD).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select></label></div>
        <div class="inv2-op-lines">${open.map((l, i) => `<div class="inv2-op-line" data-i="${i}"><div class="inv2-prod"><span class="inv2-ico-tile">${I().iconHtml(l.icon_id || "general/package", "md")}</span><span><strong>${esc(l.description)}</strong><small>Ordered ${I().qty(l.qty)} · received ${I().qty(l.received_qty)} · ${esc(I().money(l.unit_cost))}</small></span></div>
          <div class="inv2-op-fields">${l.tracking === "imei" || l.tracking === "serial" ? `<label class="inv2-field grow">${l.tracking === "imei" ? "IMEI" : "Serial"} numbers (one per line)<textarea class="inv2-input mono" rows="2" name="sn${i}"></textarea></label>`
            : `<label class="inv2-field">Receiving now<input class="inv2-input" type="number" min="0" max="${Number(l.qty) - Number(l.received_qty)}" step="any" name="q${i}" value="${Number(l.qty) - Number(l.received_qty)}"></label>`}
            <label class="inv2-field">Unit cost<input class="inv2-input" type="number" min="0" step="0.01" name="c${i}" value="${esc(l.unit_cost)}"></label>
            ${l.tracking === "batch" ? `<label class="inv2-field">Batch *<input class="inv2-input" name="b${i}"></label><label class="inv2-field">Expiry<input class="inv2-input" type="date" name="e${i}"></label>` : ""}</div><span></span></div>`).join("")}</div>`,
      async onSubmit(f) {
        const lines = [];
        open.forEach((l, i) => {
          const sn = f[`sn${i}`] ? f[`sn${i}`].value.split(/[\n,]+/).map(s => s.trim()).filter(Boolean) : null;
          const q = sn ? sn.length : Number(f[`q${i}`].value || 0);
          if (q > 0) lines.push({ order_line_id: l.id, qty: q, unit_cost: Number(f[`c${i}`].value), batch_no: f[`b${i}`]?.value || undefined, expiry_date: f[`e${i}`]?.value || undefined, serials: sn || undefined });
        });
        if (!lines.length) throw new Error("Enter what is being received.");
        const r = await I().rpc("app_inv2_purchase_receive", { p_client_op_id: opId, p_doc: { order_id: o.id, supplier_ref: f.ref.value, doc_date: f.date.value, lines, payments: Number(f.paid.value) > 0 ? [{ method: f.method.value, amount: Number(f.paid.value) }] : [] } });
        Shell().toast(`${r.doc_no} received. Order ${r.order_status === "received" ? "complete" : "part received"}.`);
        I().invalidateSummary(); after && after();
        setTimeout(() => openPurchase(r.id, after), 50);
      }
    });
  }

  function returnDialog(x, after) {
    const opId = I().opId();
    const open = x.lines.filter(l => Number(l.qty) > Number(l.returned_qty));
    I().dialog({
      title: `Return to supplier · ${x.doc_no}`, subtitle: x.supplier?.name || "", wide: true, submitLabel: "Save return",
      body: `<div class="inv2-ret-lines">${open.map((l, i) => `<div class="inv2-ret-line"><span class="inv2-prod"><span class="inv2-ico-tile sm">${I().iconHtml(l.icon_id || "general/package")}</span><span><strong>${esc(l.description)}</strong><small>Received ${I().qty(l.qty)} · returned ${I().qty(l.returned_qty)} · ${esc(I().money(l.unit_cost))}</small></span></span>
          ${(l.serials || []).length ? `<fieldset class="inv2-serial-pick"><legend>Returned serial/IMEI</legend>${l.serials.map(sn => `<label><input type="checkbox" name="sn${i}" value="${esc(sn)}"> <span class="mono">${esc(sn)}</span></label>`).join("")}</fieldset>`
            : `<label class="inv2-field">Quantity<input class="inv2-input" type="number" min="0" max="${Number(l.qty) - Number(l.returned_qty)}" step="any" name="q${i}" value="0"></label>`}</div>`).join("")}</div>
        <div class="inv2-form-grid"><label class="inv2-field wide">Reason *<input class="inv2-input" name="reason" maxlength="300" placeholder="e.g. Damaged on delivery"></label>
          <label class="inv2-field">Refund received<input class="inv2-input" name="refund" type="number" min="0" step="0.01" placeholder="0 = credit from supplier"></label>
          <label class="inv2-field">Method<select class="inv2-input" name="method">${Object.entries(Pr().METHOD).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select></label></div>`,
      async onSubmit(f) {
        const lines = [];
        open.forEach((l, i) => {
          if ((l.serials || []).length) { const sn = [...f.querySelectorAll(`[name="sn${i}"]:checked`)].map(z => z.value); if (sn.length) lines.push({ purchase_line_id: l.id, qty: sn.length / Number(l.factor || 1), serials: sn }); }
          else { const q = Number(f[`q${i}`].value || 0); if (q > 0) lines.push({ purchase_line_id: l.id, qty: q }); }
        });
        if (!lines.length) throw new Error("Choose what is being returned.");
        if (!f.reason.value.trim()) throw new Error("Give a reason for the return.");
        const r = await I().rpc("app_inv2_purchase_return", { p_client_op_id: opId, p_doc: { purchase_id: x.id, reason: f.reason.value.trim(), lines, refund: Number(f.refund.value) > 0 ? [{ method: f.method.value, amount: Number(f.refund.value) }] : [] } });
        Shell().toast(`${r.doc_no} saved.`);
        I().invalidateSummary(); after && after();
        setTimeout(() => openPurchase(r.id, after), 50);
      }
    });
  }

  function init() { Shell()?.register("purchases", { render }); }
  window.TriplemInv2Purchases = { openPurchase, editor };
  if (window.TriplemInventoryV2Shell) init(); else document.addEventListener("DOMContentLoaded", init);
})();
