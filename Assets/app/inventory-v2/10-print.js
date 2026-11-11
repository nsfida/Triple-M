/* Triplem VIP Inventory 2.0 - Phase 5: receipts and documents.
 *
 * Thermal receipts (58 or 80 mm, set in Settings) and A4 documents: tax invoice,
 * quotation, proforma, credit note, purchase order, goods received / supplier bill,
 * debit note, payment receipt and customer / supplier statement.
 *
 * Printing: the Windows app prints through its own print window (the same path as
 * Inventory V1 receipts); browsers print from a hidden frame, which also offers
 * "Save as PDF". Works with any installed printer driver; no printer model is assumed.
 * Text is Unicode and every free-text field is marked dir="auto", so Arabic names
 * print right-to-left on their own line.
 */
(function () {
  "use strict";
  const I = () => window.TriplemInv2;
  const Shell = () => window.TriplemInventoryV2Shell;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const T = (s, tag = "span") => `<${tag} dir="auto">${esc(s)}</${tag}>`;

  const METHOD = { cash: "Cash", card: "Card", bank: "Bank transfer", cheque: "Cheque", wallet: "Wallet", other: "Other" };
  const KIND = {
    sale: "Invoice", tax_invoice: "Tax invoice", quotation: "Quotation", proforma: "Proforma invoice", return: "Credit note",
    order: "Purchase order", purchase: "Goods received / supplier bill", purchase_return: "Debit note", receipt: "Payment receipt", payment: "Payment voucher"
  };

  function business() {
    const s = I().settings() || {}, ctx = Shell()?.context() || {};
    return { name: s.business_name || ctx.business_name || "", phone: s.business_phone || "", address: s.business_address || "", trn: s.tax_number || "",
      footer: s.receipt_footer || "Thank you for your business.", terms: s.invoice_terms || "", width: s.receipt_width === "58" ? 58 : 80, currency: s.currency || I().currency() };
  }
  const money = v => I().money(v);
  const num = v => Number(v || 0);
  const qty = v => I().qty(v);
  const dt = v => { try { return new Date(v).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); } catch (_) { return String(v || ""); } };
  const d = v => { try { return v ? new Date(String(v).length <= 10 ? `${v}T00:00:00` : v).toLocaleDateString(undefined, { dateStyle: "medium" }) : ""; } catch (_) { return String(v || ""); } };

  // ---- thermal receipt -------------------------------------------------------------------
  function receiptHtml(s) {
    const b = business();
    const w = b.width, body = w === 58 ? 48 : 72;
    const isReturn = s.doc_type === "return";
    const title = s.provisional ? "PROVISIONAL RECEIPT" : isReturn ? "CREDIT NOTE" : s.doc_type === "quotation" ? "QUOTATION" : s.doc_type === "proforma" ? "PROFORMA" : (num(s.tax_total) > 0 && b.trn ? "TAX INVOICE" : "RECEIPT");
    const lines = (s.lines || []).map(l => `
      <div class="ln">${T(l.description, "div")}
        <div class="row"><span>${qty(l.qty)}${l.unit_label ? " " + esc(l.unit_label) : ""} × ${esc(money(l.unit_price))}${num(l.discount) ? ` <i>−${esc(money(l.discount))}</i>` : ""}</span><b>${esc(money(l.line_total))}</b></div>
        ${(l.serials || []).length ? `<div class="sm">IMEI/SN: ${l.serials.map(esc).join(", ")}</div>` : ""}</div>`).join("");
    const pays = (s.payments || []).filter(p => isReturn ? p.direction === "out" : p.direction === "in");
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(s.doc_no || "Receipt")}</title><style>
      @page{size:${w}mm auto;margin:0}
      *{box-sizing:border-box}
      body{margin:0;padding:3mm;width:${w}mm;font:${w === 58 ? 10 : 11}px/1.35 "Segoe UI",Tahoma,Arial,sans-serif;color:#000;background:#fff}
      .c{text-align:center}.h{font-size:1.25em;font-weight:700}.sm{font-size:.86em}
      .hr{border-top:1px dashed #000;margin:2mm 0}
      .row{display:flex;justify-content:space-between;gap:2mm}
      .ln{margin:0 0 1.4mm}.ln i{font-style:normal}
      .tot{font-size:1.2em;font-weight:700}
      .doc{max-width:${body}mm;margin:0 auto}
    </style></head><body><div class="doc">
      <div class="c">${b.name ? `<div class="h">${T(b.name)}</div>` : ""}${b.address ? T(b.address, "div") : ""}${b.phone ? `<div>Tel ${esc(b.phone)}</div>` : ""}${b.trn ? `<div>TRN ${esc(b.trn)}</div>` : ""}
        <div class="hr"></div><div><b>${title}</b></div></div>
      <div class="row"><span>${esc(s.doc_no || (s.status === "held" ? "Held" : ""))}</span><span>${esc(dt(s.completed_at || s.created_at))}</span></div>
      ${s.location?.name ? `<div class="sm">${T(s.location.name)}${s.cashier ? ` · ${T(s.cashier)}` : ""}</div>` : ""}
      ${s.customer ? `<div class="sm">Customer: ${T(s.customer.name)}${s.customer.phone ? ` · ${esc(s.customer.phone)}` : ""}</div>` : ""}
      ${s.source?.doc_no ? `<div class="sm">${isReturn ? "Original sale" : "From"}: ${esc(s.source.doc_no)}</div>` : ""}
      ${s.provisional ? `<div class="sm"><b>Made offline.</b> The final invoice number is given when this till is back online.</div>` : s.offline_no ? `<div class="sm">Offline no.: ${esc(s.offline_no)}</div>` : ""}
      <div class="hr"></div>${lines}<div class="hr"></div>
      <div class="row"><span>Subtotal</span><span>${esc(money(s.subtotal))}</span></div>
      ${num(s.discount_total) ? `<div class="row"><span>Discount</span><span>−${esc(money(s.discount_total))}</span></div>` : ""}
      ${num(s.tax_total) ? `<div class="row"><span>Tax</span><span>${esc(money(s.tax_total))}</span></div>` : ""}
      <div class="row tot"><span>${isReturn ? "Credit" : "Total"}</span><span>${esc(money(s.total))}</span></div>
      ${pays.map(p => `<div class="row"><span>${isReturn ? "Refund " : ""}${esc(METHOD[p.method] || p.method)}</span><span>${esc(money(p.amount))}</span></div>`).join("")}
      ${num(s.change_given) ? `<div class="row"><span>Change</span><span>${esc(money(s.change_given))}</span></div>` : ""}
      ${!isReturn && num(s.due) > 0 ? `<div class="row tot"><span>Balance due</span><span>${esc(money(s.due))}</span></div>` : ""}
      ${s.reason ? `<div class="sm">Reason: ${T(s.reason)}</div>` : ""}
      <div class="hr"></div><div class="c sm">${T(b.footer, "div")}</div>
    </div></body></html>`;
  }

  // ---- A4 documents ---------------------------------------------------------------------
  function a4Shell(title, inner) {
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
      @page{size:A4;margin:14mm}
      *{box-sizing:border-box}
      body{margin:0;font:12px/1.45 "Segoe UI",Tahoma,Arial,sans-serif;color:#111827;background:#fff}
      .top{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;border-bottom:2px solid #1d4ed8;padding-bottom:12px;margin-bottom:16px}
      .biz b{font-size:18px;display:block;color:#0f172a}.biz div{color:#475569}
      .ttl{text-align:right}.ttl h1{margin:0;font-size:22px;color:#1d4ed8;letter-spacing:.02em;text-transform:uppercase}
      .ttl div{color:#475569}
      .meta{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
      .box{border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px}
      .box h3{margin:0 0 4px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#64748b}
      table{width:100%;border-collapse:collapse}
      th{background:#f1f5f9;color:#334155;font-weight:600;text-align:left;padding:7px 8px;font-size:11px}
      td{padding:7px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top}
      .n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
      .sm{color:#64748b;font-size:10.5px}
      .tots{margin-left:auto;margin-top:12px;width:300px}
      .tots div{display:flex;justify-content:space-between;padding:4px 0}
      .tots .g{border-top:2px solid #0f172a;font-weight:700;font-size:14px;margin-top:4px;padding-top:7px}
      .foot{margin-top:24px;color:#475569;font-size:11px;white-space:pre-wrap}
      .stamp{display:inline-block;padding:3px 8px;border-radius:6px;border:1px solid #cbd5e1;font-size:10px;font-weight:600;color:#334155}
    </style></head><body>${inner}</body></html>`;
  }

  function header(title, sub) {
    const b = business();
    return `<div class="top"><div class="biz"><b dir="auto">${esc(b.name)}</b>${b.address ? T(b.address, "div") : ""}${b.phone ? `<div>Tel ${esc(b.phone)}</div>` : ""}${b.trn ? `<div>TRN ${esc(b.trn)}</div>` : ""}</div>
      <div class="ttl"><h1>${esc(title)}</h1>${sub}</div></div>`;
  }
  const party = (label, p) => p ? `<div class="box"><h3>${esc(label)}</h3><b dir="auto">${esc(p.name)}</b>${p.address ? T(p.address, "div") : ""}${p.phone ? `<div>${esc(p.phone)}</div>` : ""}${p.email ? `<div>${esc(p.email)}</div>` : ""}${p.tax_number ? `<div>TRN ${esc(p.tax_number)}</div>` : ""}</div>` : `<div class="box"><h3>${esc(label)}</h3><b>Walk-in customer</b></div>`;

  function documentHtml(doc, kind) {
    const b = business();
    const isPurchase = ["order", "purchase", "purchase_return"].includes(kind);
    const taxInvoice = kind === "sale" && num(doc.tax_total) > 0 && b.trn;
    const title = doc.provisional ? "Provisional invoice" : taxInvoice ? KIND.tax_invoice : KIND[kind] || "Document";
    const sub = `<div><b>${esc(doc.doc_no || "")}</b></div><div>Date: ${esc(d(doc.doc_date))}</div>
      ${doc.due_date && (kind === "sale" || kind === "purchase") ? `<div>Due: ${esc(d(doc.due_date))}</div>` : ""}
      ${doc.valid_until && (kind === "quotation" || kind === "proforma") ? `<div>Valid until: ${esc(d(doc.valid_until))}</div>` : ""}
      ${doc.expected_date && kind === "order" ? `<div>Expected: ${esc(d(doc.expected_date))}</div>` : ""}
      ${doc.supplier_ref ? `<div>Supplier ref: ${esc(doc.supplier_ref)}</div>` : ""}
      ${doc.source?.doc_no ? `<div>Ref: ${esc(doc.source.doc_no)}</div>` : ""}
      ${doc.offline_no && doc.offline_no !== doc.doc_no ? `<div>Offline no.: ${esc(doc.offline_no)}</div>` : ""}
      ${doc.provisional ? `<div><b>Made offline — final number given when synced</b></div>` : ""}`;
    const priceLabel = isPurchase ? "Unit cost" : "Unit price";
    const rows = (doc.lines || []).map((l, i) => `<tr><td>${i + 1}</td><td>${T(l.description)}${l.sku ? `<div class="sm">${esc(l.sku)}</div>` : ""}${(l.serials || []).length ? `<div class="sm">IMEI/SN: ${l.serials.map(esc).join(", ")}</div>` : ""}${l.batch_no ? `<div class="sm">Batch ${esc(l.batch_no)}${l.expiry_date ? ` · exp ${esc(d(l.expiry_date))}` : ""}</div>` : ""}</td>
      <td class="n">${qty(l.qty)}${l.unit_label ? ` ${esc(l.unit_label)}` : ""}</td><td class="n">${esc(money(isPurchase ? l.unit_cost : l.unit_price))}</td><td class="n">${num(l.discount) ? esc(money(l.discount)) : "—"}</td>
      <td class="n">${num(l.tax_rate) ? `${num(l.tax_rate)}%` : "—"}</td><td class="n">${esc(money(l.tax_amount))}</td><td class="n">${esc(money(l.line_total))}</td></tr>`).join("");
    const pays = (doc.payments || []);
    const due = num(doc.due);
    const inner = `${header(title, sub)}
      <div class="meta">${isPurchase ? party("Supplier", doc.supplier) : party(kind === "return" ? "Customer" : "Bill to", doc.customer)}
        <div class="box"><h3>Details</h3>${doc.location?.name ? `<div>Location: ${T(doc.location.name)}</div>` : ""}${doc.cashier ? `<div>Prepared by: ${T(doc.cashier)}</div>` : ""}
          ${doc.reason ? `<div>Reason: ${T(doc.reason)}</div>` : ""}${doc.notes ? `<div>Notes: ${T(doc.notes)}</div>` : ""}
          ${kind === "sale" ? `<div><span class="stamp">${due > 0 ? (num(doc.paid_total) > 0 ? "Part paid" : "Unpaid") : "Paid"}</span></div>` : ""}</div></div>
      <table><thead><tr><th>#</th><th>Description</th><th class="n">Qty</th><th class="n">${priceLabel}</th><th class="n">Discount</th><th class="n">Tax %</th><th class="n">Tax</th><th class="n">Amount</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="tots"><div><span>Subtotal (excl. tax)</span><span class="n">${esc(money(doc.subtotal))}</span></div>
        ${num(doc.discount_total) ? `<div><span>Discounts included</span><span class="n">${esc(money(doc.discount_total))}</span></div>` : ""}
        <div><span>Tax</span><span class="n">${esc(money(doc.tax_total))}</span></div>
        <div class="g"><span>Total ${esc(b.currency)}</span><span class="n">${esc(money(doc.total))}</span></div>
        ${pays.map(p => `<div><span>${p.direction === (isPurchase ? "out" : "in") ? "Paid" : "Refunded"} · ${esc(METHOD[p.method] || p.method)} ${esc(p.doc_no || "")}</span><span class="n">${esc(money(p.amount))}</span></div>`).join("")}
        ${(kind === "sale" || kind === "purchase") ? `<div class="g"><span>Balance due</span><span class="n">${esc(money(due))}</span></div>` : ""}</div>
      ${b.terms && !isPurchase ? `<div class="foot">${T(b.terms)}</div>` : ""}`;
    return a4Shell(`${title} ${doc.doc_no || ""}`, inner);
  }

  function paymentHtml(p) {
    const inner = `${header(p.direction === "in" ? KIND.receipt : KIND.payment, `<div><b>${esc(p.doc_no)}</b></div><div>Date: ${esc(d(p.payment_date))}</div>`)}
      <div class="meta">${party(p.party === "supplier" ? "Paid to" : "Received from", p.party_obj || (p.party_name ? { name: p.party_name } : null))}
        <div class="box"><h3>Payment</h3><div>Method: ${esc(METHOD[p.method] || p.method)}</div>${p.reference ? `<div>Reference: ${esc(p.reference)}</div>` : ""}${p.source_no ? `<div>For: ${esc(p.source_no)}</div>` : ""}</div></div>
      <div class="tots"><div class="g"><span>Amount ${esc(business().currency)}</span><span class="n">${esc(money(p.amount))}</span></div></div>`;
    return a4Shell(`${p.doc_no}`, inner);
  }

  function statementHtml(p) {
    let bal = num(p.opening_balance);
    const rows = (p.statement || []).slice().reverse().reverse();
    const ordered = rows.slice().sort((a, b) => String(a.d).localeCompare(String(b.d)) || String(a.created_at).localeCompare(String(b.created_at)));
    const body = ordered.map(r => { bal += p.kind === "customer" ? num(r.debit) - num(r.credit) : num(r.credit) - num(r.debit);
      return `<tr><td>${esc(d(r.d))}</td><td>${esc(r.kind)}</td><td>${esc(r.doc_no)}</td><td class="n">${num(r.debit) ? esc(money(r.debit)) : ""}</td><td class="n">${num(r.credit) ? esc(money(r.credit)) : ""}</td><td class="n">${esc(money(bal))}</td></tr>`; }).join("");
    const inner = `${header("Statement of account", `<div>Date: ${esc(d(new Date().toISOString().slice(0, 10)))}</div>`)}
      <div class="meta">${party(p.kind === "customer" ? "Customer" : "Supplier", p)}<div class="box"><h3>Balance</h3><b style="font-size:18px">${esc(money(p.balance))}</b>
        <div class="sm">${p.kind === "customer" ? (num(p.balance) >= 0 ? "Owed to us" : "Credit in the customer's favour") : (num(p.balance) >= 0 ? "Owed to the supplier" : "Credit in our favour")}</div></div></div>
      <table><thead><tr><th>Date</th><th>Type</th><th>Number</th><th class="n">Debit</th><th class="n">Credit</th><th class="n">Balance</th></tr></thead><tbody>
        <tr><td></td><td>Opening balance</td><td></td><td></td><td></td><td class="n">${esc(money(p.opening_balance))}</td></tr>${body}</tbody></table>`;
    return a4Shell(`Statement ${p.name}`, inner);
  }

  // ---- print -----------------------------------------------------------------------------
  function print(html) {
    try { if (window.TriplemDesktop?.printHtml?.(html)) return true; } catch (_) {}
    let frame = document.getElementById("inv2PrintFrame");
    if (!frame) {
      frame = document.createElement("iframe");
      frame.id = "inv2PrintFrame"; frame.title = "Print"; frame.setAttribute("aria-hidden", "true");
      Object.assign(frame.style, { position: "fixed", right: "0", bottom: "0", width: "1px", height: "1px", border: "0", opacity: "0", pointerEvents: "none" });
      document.body.appendChild(frame);
    }
    const doc = frame.contentDocument || frame.contentWindow?.document;
    doc.open(); doc.write(html); doc.close();
    const go = () => { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) { Shell()?.toast("Printing is not available in this browser."); } };
    if (doc.readyState === "complete") setTimeout(go, 150); else frame.onload = () => setTimeout(go, 100);
    window.__inv2LastPrint = html; // kept for support and for automated checks
    return true;
  }

  async function printSale(id, mode = "receipt") {
    const s = typeof id === "object" ? id : await I().rpc("app_inv2_sale_get", { p_id: id });
    return print(mode === "a4" ? documentHtml(s, s.doc_type) : receiptHtml(s));
  }
  async function printPurchase(id) {
    const x = typeof id === "object" ? id : await I().rpc("app_inv2_purchase_get", { p_id: id });
    return print(documentHtml(x, x.doc_type === "return" ? "purchase_return" : x.doc_type));
  }

  window.TriplemInv2Print = { receiptHtml, documentHtml, paymentHtml, statementHtml, print, printSale, printPurchase, METHOD, a4Shell, header, business };
})();
