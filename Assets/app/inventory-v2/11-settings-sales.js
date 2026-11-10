/* Triplem VIP Inventory 2.0 - Phase 5: Settings for selling.
 *
 * Business details printed on receipts and invoices, receipt width (58/80 mm),
 * team member price and discount rules, and the optional link to Accounting
 * (owner only): which accounts receive cash, card and bank money, receivables,
 * payables, inventory, sales, cost of goods sold and tax, plus anything waiting to post.
 */
(function () {
  "use strict";
  const I = () => window.TriplemInv2;
  const Shell = () => window.TriplemInventoryV2Shell;
  const Pr = () => window.TriplemInv2Print;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const KEYS = [["cash", "Cash received", "asset"], ["card", "Card payments", "asset"], ["bank", "Bank, cheque and wallet", "asset"], ["receivable", "Customer balances (receivable)", "asset"],
    ["payable", "Supplier balances (payable)", "liability"], ["inventory", "Inventory (stock asset)", "asset"], ["sales", "Sales", "income"], ["cogs", "Cost of goods sold", "expense"],
    ["output_tax", "Tax on sales (output)", "liability"], ["input_tax", "Tax on purchases (input)", "asset"], ["purchases_expense", "Purchases of services / non-stock", "expense"]];

  function render(el, { rerender }) {
    const grid = el.querySelector(".inv2-settings-grid");
    if (!grid) return;
    const s = I().settings(), owner = I().isOwner();
    const dis = owner ? "" : " disabled";
    grid.insertAdjacentHTML("beforeend", `
      <section class="inv2-card" data-sales-settings>
        <div class="inv2-card-head"><h2>Receipts &amp; invoices</h2><button type="button" class="inv2-btn small" data-test-print><i class="fa-solid fa-receipt" aria-hidden="true"></i> Test print</button></div>
        <form class="inv2-form-grid" data-rcpt novalidate>
          <label class="inv2-field wide">Business name on documents<input class="inv2-input" name="business_name" maxlength="120" value="${esc(s.business_name || "")}" placeholder="${esc(Shell().context()?.business_name || "")}" dir="auto"${dis}></label>
          <label class="inv2-field">Phone<input class="inv2-input" name="business_phone" maxlength="40" value="${esc(s.business_phone || "")}"${dis}></label>
          <label class="inv2-field">Tax number (TRN)<input class="inv2-input" name="tax_number" maxlength="40" value="${esc(s.tax_number || "")}"${dis}><small>Shown as "Tax invoice" when tax is charged.</small></label>
          <label class="inv2-field wide">Address<textarea class="inv2-input" name="business_address" rows="2" maxlength="300" dir="auto"${dis}>${esc(s.business_address || "")}</textarea></label>
          <label class="inv2-field">Receipt paper<select class="inv2-input" name="receipt_width"${dis}><option value="80"${s.receipt_width !== "58" ? " selected" : ""}>80 mm</option><option value="58"${s.receipt_width === "58" ? " selected" : ""}>58 mm</option></select><small>Any thermal printer with a Windows or browser driver.</small></label>
          <label class="inv2-field">Receipt footer<input class="inv2-input" name="receipt_footer" maxlength="200" value="${esc(s.receipt_footer || "")}" placeholder="Thank you for your business." dir="auto"${dis}></label>
          <label class="inv2-field wide">Invoice terms (A4)<textarea class="inv2-input" name="invoice_terms" rows="2" maxlength="1000" placeholder="e.g. Goods once sold are exchangeable within 7 days with the receipt." dir="auto"${dis}>${esc(s.invoice_terms || "")}</textarea></label>
          <h3 class="inv2-sub wide">Team members at the POS</h3>
          <label class="inv2-check wide"><input type="checkbox" name="staff_price_change"${s.staff_price_change ? " checked" : ""}${dis}> Team members may change selling prices</label>
          <label class="inv2-field">Largest discount team members may give<span class="inv2-input-group"><input class="inv2-input" name="staff_max_discount_pct" type="number" min="0" max="100" step="0.5" value="${esc(s.staff_max_discount_pct ?? 10)}"${dis}><span class="inv2-unit">%</span></span></label>
          ${owner ? `<div class="wide inv2-form-actions"><button type="submit" class="inv2-btn primary">Save</button></div>` : `<p class="inv2-note wide">Only the business owner can change these.</p>`}
        </form>
      </section>
      <section class="inv2-card" data-acct-card><div class="inv2-card-head"><h2>Accounting</h2></div><div data-acct><div class="inv2-loading"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i></div></div></section>`);
    const form = grid.querySelector("[data-rcpt]");
    form.addEventListener("submit", async e => {
      e.preventDefault(); const b = form.querySelector("button[type=submit]"); b.disabled = true;
      try {
        const fields = ["business_name", "business_phone", "tax_number", "business_address", "receipt_width", "receipt_footer", "invoice_terms", "staff_max_discount_pct"];
        const body = Object.fromEntries(fields.map(k => [k, form[k].value])); body.staff_price_change = form.staff_price_change.checked;
        I().setBoot(await I().rpc("app_inv2_settings_save", { p_settings: body })); Shell().toast("Settings saved.");
      } catch (ex) { Shell().toast(ex.message || String(ex)); } finally { b.disabled = false; }
    });
    grid.querySelector("[data-test-print]").addEventListener("click", () => {
      const now = new Date().toISOString();
      Pr().print(Pr().receiptHtml({ doc_type: "sale", doc_no: "TEST-000000", status: "completed", completed_at: now, location: { name: (I().activeLocations()[0] || {}).name }, cashier: Shell().context()?.user_name,
        lines: [{ description: "Test item", qty: 1, unit_price: 10, discount: 0, line_total: 10 }, { description: "منتج تجريبي (Arabic test)", qty: 2, unit_price: 2.5, discount: 0, line_total: 5 }],
        subtotal: 15, tax_total: 0, total: 15, payments: [{ method: "cash", amount: 20, direction: "in" }], change_given: 5 }));
    });
    loadAccounting(grid.querySelector("[data-acct]"), owner);
  }

  async function loadAccounting(box, owner) {
    let a;
    try { a = await I().rpc("app_inv2_accounting_status"); } catch (e) { box.innerHTML = `<p class="inv2-note">${esc(e.message || e)}</p>`; return; }
    const pending = a.pending || [];
    const head = `<p class="inv2-note">When switched on, every sale, return, purchase and payment posts one balanced journal to Accounting automatically: purchases go to the Inventory asset, sales to Sales with cost of goods sold at the recorded cost. Inventory 2.0 works fully without it.</p>`;
    const pend = pending.length ? `<div class="inv2-alert inv2-alert-warn"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><div><strong>${pending.length} document${pending.length === 1 ? " is" : "s are"} waiting to post.</strong>
        <ul class="inv2-pend">${pending.slice(0, 6).map(p => `<li>${esc(p.doc_no || p.source_type)} · ${esc(p.doc_date || "")} — ${esc(p.message || "")}</li>`).join("")}</ul>
        ${I().canEdit() ? `<button type="button" class="inv2-btn small" data-retry>Post now</button>` : ""}</div></div>` : "";
    if (!owner) { box.innerHTML = head + `<p><span class="inv2-badge ${a.enabled ? "ok" : "muted"}">${a.enabled ? "Connected" : "Not connected"}</span> ${a.enabled ? `${a.posted} posted` : ""}</p>` + pend; bindRetry(box, owner); return; }
    if (!a.accounting_ready) { box.innerHTML = head + `<p class="inv2-note"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Open the Accounting section of Triplem VIP once so its chart of accounts is created, then come back here to connect.</p>` + pend; bindRetry(box, owner); return; }
    const opts = (type, sel) => `<option value="">— choose —</option>` + (a.accounts || []).map(x => `<option value="${esc(x.id)}"${x.id === sel ? " selected" : ""}>${esc(x.code)} · ${esc(x.name)}${x.type !== type ? ` (${esc(x.type)})` : ""}</option>`).join("");
    const mismatch = a.accounting_currency && a.inventory_currency && a.accounting_currency !== a.inventory_currency;
    box.innerHTML = head + `
      <label class="inv2-switch-row"><span><strong>Post to Accounting</strong><small>${a.enabled ? `${a.posted} document${a.posted === 1 ? "" : "s"} posted` : "Off"}${mismatch ? ` · Accounting uses ${esc(a.accounting_currency)}, Inventory 2.0 uses ${esc(a.inventory_currency)}` : ""}</small></span>
        <span class="inv2-switch"><input type="checkbox" data-on${a.enabled ? " checked" : ""}${mismatch && !a.enabled ? " disabled" : ""}><span></span></span></label>
      <details class="inv2-map"${a.enabled ? "" : " open"}><summary>Accounts used</summary><div class="inv2-form-grid">${KEYS.map(([k, label, type]) => `<label class="inv2-field">${esc(label)}<select class="inv2-input" data-k="${k}">${opts(type, a.map?.[k])}</select></label>`).join("")}</div>
        <p class="inv2-note">Empty choices are filled from the standard chart (1000 cash, 1010 bank, 1100 receivable, 2000 payable, 1200 inventory, 4000 sales, 5000 cost of goods sold, 2100 output tax, 1150 input tax, 5100 purchases).</p>
        <div class="inv2-form-actions"><button type="button" class="inv2-btn primary small" data-save-map>Save accounts</button></div></details>` + pend;
    const save = async enabled => {
      const map = Object.fromEntries([...box.querySelectorAll("[data-k]")].map(s => [s.dataset.k, s.value]).filter(([, v]) => v));
      try { await I().rpc("app_inv2_accounting_connect", { p_enabled: enabled, p_map: map }); Shell().toast(enabled ? "Inventory 2.0 now posts to Accounting." : "Posting to Accounting is off."); await I().loadBoot(true); loadAccounting(box, owner); }
      catch (e) { Shell().toast(e.message || String(e)); loadAccounting(box, owner); }
    };
    box.querySelector("[data-on]").addEventListener("change", e => save(e.target.checked));
    box.querySelector("[data-save-map]").addEventListener("click", () => save(box.querySelector("[data-on]").checked));
    bindRetry(box, owner);
  }
  function bindRetry(box, owner) {
    box.querySelector("[data-retry]")?.addEventListener("click", async e => {
      e.target.disabled = true;
      try { const r = await I().rpc("app_inv2_accounting_retry"); Shell().toast(`${r.posted} posted${r.pending ? `, ${r.pending} still waiting` : ""}.`); await I().loadBoot(true); loadAccounting(box, owner); }
      catch (ex) { Shell().toast(ex.message || String(ex)); e.target.disabled = false; }
    });
  }

  window.TriplemInv2SettingsSales = { render };
})();
