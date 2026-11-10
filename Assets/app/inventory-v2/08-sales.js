/* Triplem VIP Inventory 2.0 - Phase 5: Orders / Sales, Invoices & Receipts, Outstanding Balances.
 *
 * Orders / Sales: every sale, return, quotation and proforma with what is still due.
 * A sale opens with its lines, payments, returns and Accounting posting status; from
 * there: print the receipt or A4 invoice, receive a payment, return items (stock goes
 * back at the original cost, money is refunded or credited), or convert a quotation
 * into a sale at the POS. Completed documents are never edited; corrections are
 * returns or new documents.
 */
(function () {
  "use strict";
  const I = () => window.TriplemInv2;
  const Shell = () => window.TriplemInventoryV2Shell;
  const Pr = () => window.TriplemInv2Print;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const r2 = v => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
  const TYPE = { sale: "Sale", return: "Return", quotation: "Quotation", proforma: "Proforma" };
  const STATUS = { completed: ["Completed", "ok"], held: ["Held", "muted"], open: ["Open", "info"], converted: ["Converted", "ok"], cancelled: ["Cancelled", "muted"] };
  const O = { tab: "sale", query: "", unpaid: false, offset: 0 };
  const LIMIT = 50;

  // ---- Orders / Sales --------------------------------------------------------------------
  async function renderOrders(el) {
    await I().loadBoot();
    if (I().needsSetup(el)) return;
    el.innerHTML = `
      <div class="inv2-section-head inv2-head-row"><h1><i class="fa-solid fa-receipt" aria-hidden="true"></i> Orders / Sales</h1>
        ${I().canEdit() ? `<button type="button" class="inv2-btn primary" data-pos><i class="fa-solid fa-cash-register" aria-hidden="true"></i> New sale</button>` : ""}</div>
      <div class="inv2-summary-strip inv2-strip-3" data-today></div>
      <div class="inv2-toolbar">
        <div class="inv2-seg inv2-seg-lg inv2-seg-wrap" role="tablist">${[["sale", "Sales"], ["return", "Returns"], ["quotes", "Quotations"], ["held", "Held"], ["review", `Needs review${Number(I().boot()?.sync_issues || 0) ? ` <span class="inv2-count">${Number(I().boot().sync_issues)}</span>` : ""}`]].map(([k, v]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${O.tab === k}">${v}</button>`).join("")}</div>
        <label class="inv2-search inv2-search-inline"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" data-q placeholder="Number, customer, product or IMEI" value="${esc(O.query)}" aria-label="Search sales"></label>
        <label class="inv2-check"><input type="checkbox" data-unpaid${O.unpaid ? " checked" : ""}> Unpaid only</label>
      </div>
      <section class="inv2-card inv2-table-card"><div data-rows><div class="inv2-loading"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Loading…</div></div></section>`;
    el.querySelector("[data-pos]")?.addEventListener("click", () => Shell().show("pos"));
    const q = el.querySelector("[data-q]"); let t = 0;
    q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { O.query = q.value.trim(); O.offset = 0; orderRows(el); }, 260); });
    el.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => { O.tab = b.dataset.tab; O.offset = 0; el.querySelectorAll("[data-tab]").forEach(x => x.setAttribute("aria-selected", String(x === b))); orderRows(el); }));
    el.querySelector("[data-unpaid]").addEventListener("change", e => { O.unpaid = e.target.checked; O.offset = 0; orderRows(el); });
    await orderRows(el);
  }

  async function orderRows(el) {
    const box = el.querySelector("[data-rows]");
    const type = O.tab === "held" || O.tab === "review" ? "sale" : O.tab;
    const status = O.tab === "held" ? "held" : O.tab === "review" ? "review" : (O.unpaid && O.tab === "sale" ? "unpaid" : null);
    let r;
    try { r = await I().rpc("app_inv2_sales_list", { p_type: type, p_status: status, p_search: O.query || null, p_customer_id: null, p_location_id: I().location() || null, p_from: null, p_to: null, p_limit: LIMIT, p_offset: O.offset }); }
    catch (e) { box.innerHTML = `<div class="inv2-alert inv2-alert-error">${esc(e.message || e)}</div>`; return; }
    const today = el.querySelector("[data-today]");
    if (today && r.totals) today.innerHTML = [["Today's sales", I().money(r.totals.sales), "fa-bag-shopping", ""], ["Sales today", r.totals.count, "fa-receipt", ""], ["Returns today", I().money(r.totals.returns), "fa-rotate-left", Number(r.totals.returns) ? "warn" : ""]]
      .map(([k, v, i, tone]) => `<div class="inv2-strip-item ${tone}"><i class="fa-solid ${i}" aria-hidden="true"></i><span>${k}</span><strong>${esc(String(v))}</strong></div>`).join("");
    if (!r.rows.length) { box.innerHTML = `<div class="inv2-empty"><i class="fa-solid fa-receipt" aria-hidden="true"></i><p>${O.query ? "Nothing matches." : O.tab === "held" ? "No held sales." : O.tab === "review" ? "No offline sales need review." : "Nothing here yet."}</p>${O.tab === "sale" && !O.query && I().canEdit() ? `<small>Sales made at the POS appear here.</small>` : ""}</div>`; return; }
    box.innerHTML = `<div class="inv2-table inv2-table-sales" role="table">
      <div class="inv2-tr inv2-th" role="row"><span>Number</span><span>Customer</span><span>Date</span><span class="num">Total</span><span class="num">Due</span><span>Status</span></div>
      ${r.rows.map((s, i) => { const [lab, tone] = STATUS[s.status] || [s.status, "muted"]; return `<button type="button" class="inv2-tr" role="row" data-open="${i}">
        <span class="inv2-prod" role="cell"><span class="inv2-ico-tile sm"><i class="fa-solid ${s.doc_type === "return" ? "fa-rotate-left" : s.doc_type === "sale" ? "fa-receipt" : "fa-file-lines"}" aria-hidden="true"></i></span><span><strong>${esc(s.doc_no || "Held sale")}</strong><small>${esc(TYPE[s.doc_type])} · ${s.line_count} line${s.line_count === 1 ? "" : "s"}${s.offline_no ? ` · offline ${esc(s.offline_no)}` : ""}${s.posting === "pending" ? " · posting waiting" : ""}</small></span></span>
        <span role="cell" dir="auto">${esc(s.customer_name || "Walk-in")}</span>
        <span role="cell">${esc(I().dateTime(s.created_at))}</span>
        <span role="cell" class="num"><strong>${esc(I().money(s.total))}</strong></span>
        <span role="cell" class="num">${Number(s.due) > 0 ? `<strong class="warn">${esc(I().money(s.due))}</strong>` : "—"}</span>
        <span role="cell"><span class="inv2-badge ${tone}">${lab}</span>${s.needs_review ? `<span class="inv2-badge bad">Review</span>` : ""}${Number(s.due) > 0 ? `<span class="inv2-badge warn">${Number(s.due) < Number(s.total) ? "Part paid" : "Unpaid"}</span>` : ""}</span></button>`; }).join("")}</div>
      <div class="inv2-pager"><span>${O.offset + 1}–${O.offset + r.rows.length} of ${r.total}</span>
        <button type="button" class="inv2-btn small" data-prev${O.offset === 0 ? " disabled" : ""}>Previous</button>
        <button type="button" class="inv2-btn small" data-next${O.offset + r.rows.length >= r.total ? " disabled" : ""}>Next</button></div>`;
    box.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => openSale(r.rows[Number(b.dataset.open)].id, () => orderRows(el))));
    box.querySelector("[data-prev]")?.addEventListener("click", () => { O.offset = Math.max(0, O.offset - LIMIT); orderRows(el); });
    box.querySelector("[data-next]")?.addEventListener("click", () => { O.offset += LIMIT; orderRows(el); });
  }

  function issueText(x) {
    const d = x.detail || {};
    switch (x.type) {
      case "stock_shortfall": return `${d.name || "Item"}: sold ${I().qty(d.short)} more than the system had in stock (balance now ${I().qty(d.balance_after)}).`;
      case "serial_conflict": return `${d.name || "Item"}: IMEI/serial ${d.serial} was ${d.serial_status === "sold" ? "already sold on another sale" : "not in stock here"}.`;
      case "price_changed": return `${d.name || "Item"}: sold at ${I().money(d.price)} instead of ${I().money(d.list_price)} by a team member.`;
      case "discount_over_limit": return `Discount above the ${d.allowed_pct}% allowed for team members.`;
      case "credit_limit": return `Customer went over the credit limit (${I().money(d.owed)} of ${I().money(d.limit)}).`;
      case "unpaid_walk_in": return `${I().money(d.due)} left unpaid by a walk-in customer.`;
      case "overpaid": return `${d.method} payment of ${I().money(d.amount)} was more than due and was not recorded.`;
      default: return x.type;
    }
  }

  // ---- one sale ---------------------------------------------------------------------------
  async function openSale(id, after) {
    let s;
    try { s = await I().rpc("app_inv2_sale_get", { p_id: id }); } catch (e) { Shell().toast(e.message || String(e)); return; }
    const [lab, tone] = STATUS[s.status] || [s.status, "muted"];
    const isSale = s.doc_type === "sale" && s.status === "completed";
    const returnable = isSale && s.lines.some(l => Number(l.qty) > Number(l.returned_qty));
    const d = I().dialog({
      title: `${TYPE[s.doc_type]} ${s.doc_no || ""}`.trim(), subtitle: `${I().dateTime(s.completed_at || s.created_at)} · ${s.location?.name || ""}${s.cashier ? ` · ${s.cashier}` : ""}`, wide: true,
      body: `<div class="inv2-docview">
        <div class="inv2-doc-top">
          <div><span class="inv2-badge ${tone}">${lab}</span>${s.source ? `<span class="inv2-badge muted">${s.doc_type === "return" ? "From" : "Converted from"} ${esc(s.source.doc_no)}</span>` : ""}${s.posting ? `<span class="inv2-badge ${s.posting.status === "posted" ? "ok" : "warn"}" title="${esc(s.posting.message || "")}">Accounting: ${esc(s.posting.status === "posted" ? s.posting.journal_no : s.posting.status)}</span>` : ""}</div>
          ${s.offline_at ? `<div class="inv2-doc-off"><i class="fa-solid fa-wifi" aria-hidden="true"></i> Made offline ${esc(I().dateTime(s.offline_at))}${s.offline_no ? ` as ${esc(s.offline_no)}` : ""}${s.device_id ? ` on till ${esc(s.device_id)}` : ""}</div>` : ""}
          <div class="inv2-doc-cust"><i class="fa-solid fa-user" aria-hidden="true"></i> <span dir="auto">${esc(s.customer?.name || "Walk-in customer")}</span>${s.customer?.phone ? ` · ${esc(s.customer.phone)}` : ""}</div>
        </div>
        ${(s.issues || []).length ? `<div class="inv2-issues"><h3 class="inv2-sub"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Checked when it synced</h3>
          <ul>${s.issues.map(x => `<li class="${x.status}"><span>${esc(issueText(x))}</span>${x.status === "reviewed" ? `<small>Reviewed${x.note ? ` — ${esc(x.note)}` : ""}</small>` : ""}</li>`).join("")}</ul>
          ${s.issues.some(x => x.status === "open") && I().canEdit() ? `<div class="inv2-form-actions"><input class="inv2-input" data-review-note placeholder="What was done (e.g. counted the shelf, customer paid)" maxlength="300"><button type="button" class="inv2-btn small primary" data-reviewed>Mark reviewed</button></div>` : ""}
          <p class="inv2-note">The sale is kept exactly as the customer got it. Correct anything with a stock count, a return or a payment, then mark it reviewed.</p></div>` : ""}
        <div class="inv2-table inv2-table-lines" role="table">
          <div class="inv2-tr inv2-th" role="row"><span>Item</span><span class="num">Qty</span><span class="num">Price</span><span class="num">Discount</span><span class="num">Tax</span><span class="num">Amount</span></div>
          ${s.lines.map(l => `<div class="inv2-tr" role="row"><span class="inv2-prod"><span class="inv2-ico-tile sm">${I().iconHtml(l.icon_id || "general/package")}</span><span><strong dir="auto">${esc(l.description)}</strong>${(l.serials || []).length ? `<small class="mono">${l.serials.map(esc).join(", ")}</small>` : ""}${Number(l.returned_qty) ? `<small class="warn">${I().qty(l.returned_qty)} returned</small>` : ""}</span></span>
            <span class="num">${I().qty(l.qty)}${l.unit_label ? ` <small>${esc(l.unit_label)}</small>` : ""}</span><span class="num">${esc(I().money(l.unit_price))}</span><span class="num">${Number(l.discount) ? esc(I().money(l.discount)) : "—"}</span><span class="num">${esc(I().money(l.tax_amount))}</span><span class="num"><strong>${esc(I().money(l.line_total))}</strong></span></div>`).join("")}
        </div>
        <div class="inv2-doc-foot">
          <div class="inv2-doc-pays">${(s.payments || []).length ? s.payments.map(p => `<div><span>${p.direction === "in" ? "Paid" : "Refunded"} · ${esc(Pr().METHOD[p.method] || p.method)} <small>${esc(p.doc_no)}${p.reference ? ` · ${esc(p.reference)}` : ""}</small></span><strong>${esc(I().money(p.amount))}</strong></div>`).join("") : `<p class="inv2-note">No payments.</p>`}
            ${(s.returns || []).map(x => `<div><span>Return <button type="button" class="inv2-link" data-ret="${esc(x.id)}">${esc(x.doc_no)}</button></span><strong>${esc(I().money(x.total))}</strong></div>`).join("")}
            ${s.notes ? `<p class="inv2-note">Note: ${esc(s.notes)}</p>` : ""}${s.reason ? `<p class="inv2-note">Reason: ${esc(s.reason)}</p>` : ""}</div>
          <div class="inv2-doc-tots"><div><span>Subtotal</span><span>${esc(I().money(s.subtotal))}</span></div>${Number(s.discount_total) ? `<div><span>Discounts</span><span>${esc(I().money(s.discount_total))}</span></div>` : ""}
            <div><span>Tax</span><span>${esc(I().money(s.tax_total))}</span></div><div class="grand"><span>Total</span><span>${esc(I().money(s.total))}</span></div>
            ${Number(s.change_given) ? `<div><span>Change given</span><span>${esc(I().money(s.change_given))}</span></div>` : ""}
            ${isSale ? `<div class="${Number(s.due) > 0 ? "warn" : "ok"}"><span>Due</span><span>${esc(I().money(s.due))}</span></div>` : ""}</div>
        </div></div>`,
      onOpen(f) {
        const foot = f.querySelector(".inv2-dialog-foot");
        const btns = [];
        if (s.doc_type !== "quotation" && s.doc_type !== "proforma" && s.status !== "held") btns.push(`<button type="button" class="inv2-btn" data-print="receipt"><i class="fa-solid fa-receipt" aria-hidden="true"></i> Receipt</button>`);
        if (s.status !== "held") btns.push(`<button type="button" class="inv2-btn" data-print="a4"><i class="fa-solid fa-print" aria-hidden="true"></i> ${s.doc_type === "sale" ? "A4 invoice" : "Print"}</button>`);
        if (I().canEdit()) {
          if (isSale && Number(s.due) > 0 && s.customer) btns.push(`<button type="button" class="inv2-btn" data-receive><i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i> Receive payment</button>`);
          if (returnable) btns.push(`<button type="button" class="inv2-btn" data-return><i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Return items</button>`);
          if ((s.doc_type === "quotation" || s.doc_type === "proforma") && s.status === "open") btns.push(`<button type="button" class="inv2-btn danger-ghost" data-cancel>Cancel</button><button type="button" class="inv2-btn primary" data-convert><i class="fa-solid fa-cash-register" aria-hidden="true"></i> Convert to sale</button>`);
          if (s.status === "held") btns.push(`<button type="button" class="inv2-btn danger-ghost" data-cancel>Discard</button><button type="button" class="inv2-btn primary" data-resume>Resume at POS</button>`);
        }
        foot.innerHTML = btns.join("") + `<button type="button" class="inv2-btn" data-close-x>Close</button>`;
        foot.querySelector("[data-close-x]").addEventListener("click", () => d.close(true));
        foot.querySelectorAll("[data-print]").forEach(b => b.addEventListener("click", () => Pr().printSale(s, b.dataset.print)));
        foot.querySelector("[data-receive]")?.addEventListener("click", () => { d.close(true); window.TriplemInv2Parties.paymentDialog("customer", { id: s.customer.id }, () => { after && after(); }, s.id); });
        foot.querySelector("[data-return]")?.addEventListener("click", () => { d.close(true); returnDialog(s, after); });
        foot.querySelector("[data-convert]")?.addEventListener("click", async () => { d.close(true); await window.TriplemInv2Pos.loadFromSale(s.id); });
        foot.querySelector("[data-resume]")?.addEventListener("click", async () => { d.close(true); await window.TriplemInv2Pos.loadFromSale(s.id, { resume: true }); });
        foot.querySelector("[data-cancel]")?.addEventListener("click", async () => {
          if (!confirm(s.status === "held" ? "Discard this held sale?" : `Cancel ${s.doc_no}?`)) return;
          try { await I().rpc("app_inv2_sale_cancel", { p_id: s.id, p_reason: null }); d.close(true); after && after(); } catch (e) { f.querySelector("[data-error]").textContent = e.message; }
        });
        f.querySelectorAll("[data-ret]").forEach(b => b.addEventListener("click", () => { d.close(true); openSale(b.dataset.ret, after); }));
        f.querySelector("[data-reviewed]")?.addEventListener("click", async () => {
          const open = s.issues.find(x => x.status === "open");
          try { await I().rpc("app_inv2_sync_issue_resolve", { p_id: open.id, p_note: f.querySelector("[data-review-note]").value.trim() || null, p_whole_sale: true }); await I().loadBoot(true); d.close(true); after && after(); openSale(s.id, after); }
          catch (e) { f.querySelector("[data-error]").textContent = e.message || String(e); }
        });
      }
    });
  }

  function returnDialog(s, after) {
    const opId = I().opId();
    const lines = s.lines.filter(l => Number(l.qty) > Number(l.returned_qty));
    const unitTotal = l => Number(l.line_total) / Number(l.qty);
    I().dialog({
      title: `Return items · ${s.doc_no}`, subtitle: s.customer ? s.customer.name : "Walk-in customer", wide: true, submitLabel: "Save return",
      body: `<div class="inv2-ret-lines">${lines.map((l, i) => `<div class="inv2-ret-line" data-rl="${i}">
          <span class="inv2-prod"><span class="inv2-ico-tile sm">${I().iconHtml(l.icon_id || "general/package")}</span><span><strong dir="auto">${esc(l.description)}</strong><small>Sold ${I().qty(l.qty)} · returned ${I().qty(l.returned_qty)} · ${esc(I().money(unitTotal(l)))} each</small></span></span>
          ${(l.serials || []).length ? `<fieldset class="inv2-serial-pick"><legend>Returned ${l.tracking === "imei" ? "IMEI" : "serial"}</legend>${l.serials.map(sn => `<label><input type="checkbox" name="sn${i}" value="${esc(sn)}"> <span class="mono">${esc(sn)}</span></label>`).join("")}</fieldset>`
            : `<label class="inv2-field">Quantity<input class="inv2-input" type="number" min="0" max="${Number(l.qty) - Number(l.returned_qty)}" step="any" inputmode="decimal" name="q${i}" value="0"></label>`}</div>`).join("")}</div>
        <div class="inv2-form-grid">
          <label class="inv2-field wide">Reason *<input class="inv2-input" name="reason" maxlength="300" placeholder="e.g. Faulty, wrong size, changed mind"></label>
          <label class="inv2-field">Refund method<select class="inv2-input" name="method"><option value="">${s.customer ? "No refund (credit the customer's account)" : "—"}</option>${Object.entries(Pr().METHOD).map(([k, v]) => `<option value="${k}"${!s.customer && k === "cash" ? " selected" : ""}>${esc(v)}</option>`).join("")}</select></label>
          <label class="inv2-field">Refund amount<input class="inv2-input" name="refund" type="number" min="0" step="0.01" inputmode="decimal"></label>
        </div>
        <div class="inv2-pay-sum" data-rsum></div>`,
      onOpen(f) {
        const sum = f.querySelector("[data-rsum]");
        const calc = () => {
          let tot = 0;
          lines.forEach((l, i) => { const q = (l.serials || []).length ? f.querySelectorAll(`[name="sn${i}"]:checked`).length / Number(l.factor || 1) : Number(f[`q${i}`]?.value || 0); tot += r2(q * unitTotal(l)); });
          tot = r2(tot);
          if (!f.refund.dataset.touched) f.refund.value = f.method.value ? tot.toFixed(2) : "";
          sum.innerHTML = `<div><span>Return value (approx.)</span><strong>${esc(I().money(tot))}</strong></div>${Number(s.due) > 0 ? `<p class="inv2-note">Anything not refunded first reduces what is still due on this sale (${esc(I().money(s.due))}).</p>` : ""}`;
        };
        f.addEventListener("input", e => { if (e.target === f.refund) f.refund.dataset.touched = "1"; calc(); });
        f.addEventListener("change", calc);
        calc();
      },
      async onSubmit(f) {
        const out = [];
        lines.forEach((l, i) => {
          if ((l.serials || []).length) { const sn = [...f.querySelectorAll(`[name="sn${i}"]:checked`)].map(x => x.value); if (sn.length) out.push({ sale_line_id: l.id, qty: sn.length / Number(l.factor || 1), serials: sn }); }
          else { const q = Number(f[`q${i}`].value || 0); if (q > 0) out.push({ sale_line_id: l.id, qty: q }); }
        });
        if (!out.length) throw new Error("Choose what is being returned.");
        if (!f.reason.value.trim()) throw new Error("Give a reason for the return.");
        const refund = f.method.value && Number(f.refund.value) > 0 ? [{ method: f.method.value, amount: Number(f.refund.value) }] : [];
        const r = await I().rpc("app_inv2_sale_return", { p_client_op_id: opId, p_return: { sale_id: s.id, reason: f.reason.value.trim(), lines: out, refund } });
        Shell().toast(`${r.doc_no} saved.${Number(r.refunded) ? ` Refunded ${I().money(r.refunded)}.` : ""}${Number(r.credited) > 0 ? ` ${I().money(r.credited)} credited.` : ""}`);
        I().invalidateSummary();
        after && after();
        setTimeout(() => openSale(r.id, after), 50);
      }
    });
  }

  // ---- Invoices & Receipts -----------------------------------------------------------------
  const D = { tab: "sale", query: "", offset: 0 };
  async function renderDocuments(el) {
    await I().loadBoot();
    if (I().needsSetup(el)) return;
    const tabs = [["sale", "Invoices"], ["return", "Credit notes"], ["quotes", "Quotations"], ["purchase", "Supplier bills"], ["order", "Purchase orders"], ["payments", "Payments"]];
    el.innerHTML = `
      <div class="inv2-section-head"><h1><i class="fa-solid fa-file-invoice" aria-hidden="true"></i> Invoices &amp; Receipts</h1></div>
      <div class="inv2-toolbar"><div class="inv2-seg inv2-seg-lg inv2-seg-wrap" role="tablist">${tabs.map(([k, v]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${D.tab === k}">${v}</button>`).join("")}</div>
        <label class="inv2-search inv2-search-inline"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" data-q placeholder="Number, customer, supplier or reference" value="${esc(D.query)}" aria-label="Search documents"></label></div>
      <section class="inv2-card inv2-table-card"><div data-rows></div></section>`;
    const q = el.querySelector("[data-q]"); let t = 0;
    q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { D.query = q.value.trim(); D.offset = 0; docRows(el); }, 260); });
    el.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => { D.tab = b.dataset.tab; D.offset = 0; el.querySelectorAll("[data-tab]").forEach(x => x.setAttribute("aria-selected", String(x === b))); docRows(el); }));
    await docRows(el);
  }
  async function docRows(el) {
    const box = el.querySelector("[data-rows]");
    box.innerHTML = `<div class="inv2-loading"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i></div>`;
    let rows = [], total = 0, kind = "sale";
    try {
      if (["sale", "return", "quotes"].includes(D.tab)) { const r = await I().rpc("app_inv2_sales_list", { p_type: D.tab, p_status: null, p_search: D.query || null, p_customer_id: null, p_location_id: null, p_from: null, p_to: null, p_limit: LIMIT, p_offset: D.offset }); rows = r.rows.filter(x => x.doc_no); total = r.total; }
      else if (D.tab === "payments") { kind = "payment"; const r = await I().rpc("app_inv2_payments_list", { p_search: D.query || null, p_direction: null, p_limit: LIMIT, p_offset: D.offset }); rows = r.rows; total = r.total; }
      else { kind = "purchase"; const r = await I().rpc("app_inv2_purchases_list", { p_type: D.tab, p_status: null, p_search: D.query || null, p_supplier_id: null, p_limit: LIMIT, p_offset: D.offset }); rows = r.rows; total = r.total; }
    } catch (e) { box.innerHTML = `<div class="inv2-alert inv2-alert-error">${esc(e.message || e)}</div>`; return; }
    if (!rows.length) { box.innerHTML = `<div class="inv2-empty"><i class="fa-solid fa-file-invoice" aria-hidden="true"></i><p>No documents here yet.</p></div>`; return; }
    box.innerHTML = `<div class="inv2-table inv2-table-docs" role="table">
      <div class="inv2-tr inv2-th" role="row"><span>Number</span><span>${kind === "purchase" ? "Supplier" : kind === "payment" ? "Customer / supplier" : "Customer"}</span><span>Date</span><span class="num">Amount</span><span><span class="inv2-sr">Print</span></span></div>
      ${rows.map((x, i) => `<div class="inv2-tr" role="row">
        <span class="inv2-prod"><span class="inv2-ico-tile sm"><i class="fa-solid ${kind === "payment" ? (x.direction === "in" ? "fa-arrow-down" : "fa-arrow-up") : "fa-file-lines"}" aria-hidden="true"></i></span><span><button type="button" class="inv2-link" data-open="${i}"><strong>${esc(x.doc_no)}</strong></button><small>${kind === "payment" ? `${x.direction === "in" ? "Received" : "Paid"} · ${esc(Pr().METHOD[x.method] || x.method)}${x.source_no ? ` · ${esc(x.source_no)}` : ""}` : esc(x.supplier_ref || "")}</small></span></span>
        <span dir="auto">${esc(x.customer_name || x.supplier_name || x.party_name || "Walk-in")}</span><span>${esc(x.doc_date || x.payment_date)}</span>
        <span class="num"><strong>${esc(I().money(x.total ?? x.amount))}</strong></span>
        <span class="inv2-row-actions">${kind === "sale" && D.tab !== "quotes" ? `<button type="button" class="inv2-icon-btn small" data-rc="${i}" title="Thermal receipt" aria-label="Thermal receipt"><i class="fa-solid fa-receipt" aria-hidden="true"></i></button>` : ""}<button type="button" class="inv2-icon-btn small" data-pr="${i}" title="Print A4" aria-label="Print A4"><i class="fa-solid fa-print" aria-hidden="true"></i></button></span></div>`).join("")}</div>
      <div class="inv2-pager"><span>${D.offset + 1}–${D.offset + rows.length} of ${total}</span>
        <button type="button" class="inv2-btn small" data-prev${D.offset === 0 ? " disabled" : ""}>Previous</button><button type="button" class="inv2-btn small" data-next${D.offset + rows.length >= total ? " disabled" : ""}>Next</button></div>`;
    const doPrint = async (x, mode) => {
      try {
        if (kind === "sale") await Pr().printSale(x.id, mode);
        else if (kind === "purchase") await Pr().printPurchase(x.id);
        else Pr().print(Pr().paymentHtml(x));
      } catch (e) { Shell().toast(e.message || String(e)); }
    };
    box.querySelectorAll("[data-pr]").forEach(b => b.addEventListener("click", () => doPrint(rows[Number(b.dataset.pr)], "a4")));
    box.querySelectorAll("[data-rc]").forEach(b => b.addEventListener("click", () => doPrint(rows[Number(b.dataset.rc)], "receipt")));
    box.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => { const x = rows[Number(b.dataset.open)]; if (kind === "sale") openSale(x.id, () => docRows(el)); else if (kind === "purchase") window.TriplemInv2Purchases?.openPurchase(x.id, () => docRows(el)); else doPrint(x); }));
    box.querySelector("[data-prev]")?.addEventListener("click", () => { D.offset = Math.max(0, D.offset - LIMIT); docRows(el); });
    box.querySelector("[data-next]")?.addEventListener("click", () => { D.offset += LIMIT; docRows(el); });
  }

  // ---- Outstanding Balances --------------------------------------------------------------
  let OUT_KIND = "customer";
  async function renderOutstanding(el) {
    await I().loadBoot();
    if (I().needsSetup(el)) return;
    el.innerHTML = `
      <div class="inv2-section-head"><h1><i class="fa-solid fa-scale-balanced" aria-hidden="true"></i> Outstanding Balances</h1></div>
      <div class="inv2-toolbar"><div class="inv2-seg inv2-seg-lg" role="tablist">${[["customer", "Customers owe you"], ["supplier", "You owe suppliers"]].map(([k, v]) => `<button type="button" role="tab" data-k="${k}" aria-selected="${OUT_KIND === k}">${v}</button>`).join("")}</div></div>
      <div class="inv2-summary-strip" data-sum></div>
      <section class="inv2-card inv2-table-card"><div data-rows><div class="inv2-loading"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i></div></div></section>`;
    el.querySelectorAll("[data-k]").forEach(b => b.addEventListener("click", () => { OUT_KIND = b.dataset.k; el.querySelectorAll("[data-k]").forEach(x => x.setAttribute("aria-selected", String(x === b))); outRows(el); }));
    await outRows(el);
  }
  async function outRows(el) {
    const box = el.querySelector("[data-rows]"), sum = el.querySelector("[data-sum]");
    let r;
    try { r = await I().rpc("app_inv2_outstanding", { p_kind: OUT_KIND }); } catch (e) { box.innerHTML = `<div class="inv2-alert inv2-alert-error">${esc(e.message || e)}</div>`; return; }
    const rows = r.rows || [];
    const t = k => rows.reduce((a, x) => a + Number(x[k] || 0), 0);
    sum.innerHTML = [["Total", t("balance")], ["Not yet due", t("due_now")], ["1–30 days late", t("d30")], ["31–60 days", t("d60")], ["Over 60 days", t("d90") + t("d90plus")]]
      .map(([k, v], i) => `<div class="inv2-strip-item ${i > 1 && v > 0 ? (i > 2 ? "bad" : "warn") : ""}"><i class="fa-solid ${i === 0 ? "fa-scale-balanced" : "fa-clock"}" aria-hidden="true"></i><span>${k}</span><strong>${esc(I().money(v))}</strong></div>`).join("");
    if (!rows.length) { box.innerHTML = `<div class="inv2-empty inv2-empty-ok"><i class="fa-solid fa-circle-check" aria-hidden="true"></i><p>Nothing outstanding.</p></div>`; return; }
    box.innerHTML = `<div class="inv2-table inv2-table-aging" role="table">
      <div class="inv2-tr inv2-th" role="row"><span>${OUT_KIND === "customer" ? "Customer" : "Supplier"}</span><span class="num">Not due</span><span class="num">1–30</span><span class="num">31–60</span><span class="num">61–90</span><span class="num">90+</span><span class="num">Balance</span></div>
      ${rows.map((x, i) => `<button type="button" class="inv2-tr" role="row" data-open="${i}"><span class="inv2-prod"><span class="inv2-ico-tile sm"><i class="fa-solid ${OUT_KIND === "customer" ? "fa-user" : "fa-truck"}" aria-hidden="true"></i></span><span><strong dir="auto">${esc(x.name)}</strong><small>${esc(x.phone || "")}${x.oldest ? ` · oldest due ${esc(x.oldest)}` : ""}</small></span></span>
        ${["due_now", "d30", "d60", "d90", "d90plus"].map(k => `<span class="num">${Number(x[k]) ? esc(I().money(x[k])) : "—"}</span>`).join("")}
        <span class="num"><strong class="${Number(x.balance) > 0 ? "warn" : "ok"}">${esc(I().money(x.balance))}</strong></span></button>`).join("")}</div>`;
    box.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => window.TriplemInv2Parties.openParty(OUT_KIND, rows[Number(b.dataset.open)].id, () => outRows(el))));
  }

  function init() {
    const sh = Shell(); if (!sh) return;
    sh.register("orders", { render: renderOrders });
    sh.register("documents", { render: renderDocuments });
    sh.register("outstanding", { render: renderOutstanding });
  }
  window.TriplemInv2Sales = { openSale, returnDialog };
  if (window.TriplemInventoryV2Shell) init(); else document.addEventListener("DOMContentLoaded", init);
})();
