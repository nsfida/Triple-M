/* Triplem VIP Inventory 2.0 - Phase 5: POS terminal.
 *
 * Scan or tap products into the cart, choose a customer, give discounts (within the
 * owner's rules), hold and resume carts (held carts are kept on the server, so they
 * can be resumed on another till), take split payments (cash, card, bank, wallet,
 * cheque) or leave a balance on the customer's account, then print a thermal
 * receipt or an A4 tax invoice. Quotations and proformas are made from the same cart.
 *
 * Every sale is one server call with a client operation id created when the payment
 * window opens: pressing Pay again after a network error never charges twice.
 * Prices, discounts, stock and credit limits are checked again on the server.
 * The cart is kept on this device until the sale is completed (survives a reload).
 * Offline selling comes with the offline update (phase 6).
 */
(function () {
  "use strict";
  const I = () => window.TriplemInv2;
  const Shell = () => window.TriplemInventoryV2Shell;
  const Pr = () => window.TriplemInv2Print;
  const Off = () => window.TriplemInv2Offline;
  const isOnline = () => !Off() || Off().online();
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const r2 = v => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
  const CART_KEY = "triplem-inv2-cart-v1";
  const ownerKey = () => { const u = (typeof state !== "undefined" ? state : null)?.sessionUser; return u ? (u.team_owner_id || u.id) : "anon"; };

  const P = { cart: null, items: [], category: "", query: "", el: null, keyBuf: "", keyAt: 0, heldCount: 0 };
  const emptyCart = () => ({ id: null, source_id: null, source_no: "", customer: null, lines: [], discount: 0, notes: "" });

  function loadCart() {
    if (P.cart) return P.cart;
    try { P.cart = JSON.parse(localStorage.getItem(CART_KEY) || "{}")[ownerKey()] || emptyCart(); } catch (_) { P.cart = emptyCart(); }
    return P.cart;
  }
  function saveCart() {
    try { const all = JSON.parse(localStorage.getItem(CART_KEY) || "{}"); all[ownerKey()] = P.cart; localStorage.setItem(CART_KEY, JSON.stringify(all)); } catch (_) {}
  }
  function resetCart() { P.cart = emptyCart(); saveCart(); }

  // Same arithmetic as the server (app_inv2__line_amounts and the cart discount spread).
  function totals(cart = P.cart) {
    const gross = cart.lines.map(l => r2(l.qty * l.price) - r2(l.discount || 0));
    const G = gross.reduce((a, b) => a + b, 0);
    const D = Math.min(r2(cart.discount || 0), G);
    let given = 0, sub = 0, tax = 0, disc = 0;
    const rows = cart.lines.map((l, i) => {
      const share = i === cart.lines.length - 1 ? r2(D - given) : (G ? r2(D * gross[i] / G) : 0);
      given = r2(given + share);
      const g = r2(gross[i] - share);
      let net, t;
      if (l.incl !== false) { net = r2(g / (1 + Number(l.tax_rate || 0) / 100)); t = r2(g - net); } else { net = g; t = r2(net * Number(l.tax_rate || 0) / 100); }
      sub += net; tax += t; disc += r2(l.discount || 0) + share;
      return { net, tax: t, total: r2(net + t) };
    });
    return { rows, sub: r2(sub), tax: r2(tax), disc: r2(disc), total: r2(sub + tax), gross: r2(G), cartDisc: D };
  }

  const settings = () => I().settings() || {};
  const canChangePrice = () => I().isOwner() || !!settings().staff_price_change;
  const loc = () => I().location() || settings().default_location_id;
  const locName = () => (I().activeLocations().find(l => l.id === loc()) || {}).name || "";

  // ---- view ------------------------------------------------------------------------------
  async function render(el) {
    await I().loadBoot();
    if (I().needsSetup(el)) return;
    P.el = el; loadCart();
    const cats = (I().boot().categories || []).filter(c => c.is_active && c.products > 0);
    el.innerHTML = `
      <div class="inv2-pos" data-pos>
        <section class="inv2-pos-left" aria-label="Products">
          <div class="inv2-pos-head"><h1><i class="fa-solid fa-cash-register" aria-hidden="true"></i> POS <small>${esc(locName())}</small></h1>
            <div class="inv2-actions">
              <button type="button" class="inv2-btn small" data-held><i class="fa-solid fa-pause" aria-hidden="true"></i> Held <span class="inv2-count-pill" data-held-count></span></button>
              <button type="button" class="inv2-btn small" data-orders><i class="fa-solid fa-receipt" aria-hidden="true"></i> Sales</button>
            </div></div>
          <div class="inv2-pos-offline" data-offline-note hidden><i class="fa-solid fa-wifi" aria-hidden="true"></i><span>Offline — sales are kept on this device and sent when the connection is back.</span></div>
          <label class="inv2-search inv2-search-inline inv2-pos-scan"><i class="fa-solid fa-barcode" aria-hidden="true"></i>
            <input type="search" data-q placeholder="Scan a barcode or IMEI, or search a product" aria-label="Scan or search products" autocomplete="off" value="${esc(P.query)}"></label>
          <div class="inv2-chiprow" role="tablist" aria-label="Categories"><button type="button" role="tab" data-cat="" aria-selected="${!P.category}">All</button>${cats.map(c => `<button type="button" role="tab" data-cat="${esc(c.id)}" aria-selected="${P.category === c.id}">${I().iconHtml(c.icon_id || "general/category")} ${esc(c.name)}</button>`).join("")}</div>
          <div class="inv2-pos-grid" data-items><div class="inv2-loading"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Loading products…</div></div>
        </section>
        <aside class="inv2-pos-cart" aria-label="Cart" data-cart></aside>
        <button type="button" class="inv2-pos-cartbar" data-cartbar aria-label="Show cart"></button>
      </div>`;
    const q = el.querySelector("[data-q]"); let t = 0;
    q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { P.query = q.value.trim(); loadItems(); }, 250); });
    q.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); clearTimeout(t); scan(q.value.trim(), q); } });
    el.querySelectorAll("[data-cat]").forEach(b => b.addEventListener("click", () => { P.category = b.dataset.cat; el.querySelectorAll("[data-cat]").forEach(x => x.setAttribute("aria-selected", String(x === b))); loadItems(); }));
    el.querySelector("[data-held]").addEventListener("click", heldDialog);
    el.querySelector("[data-orders]").addEventListener("click", () => Shell().show("orders"));
    el.querySelector("[data-cartbar]").addEventListener("click", () => el.querySelector("[data-pos]").classList.toggle("show-cart"));
    // A USB/Bluetooth scanner types fast and ends with Enter; catch it even when the search box is not focused.
    el.querySelector("[data-pos]").addEventListener("keydown", e => {
      if (e.target.closest("input, textarea, select")) return;
      const now = Date.now();
      if (e.key === "Enter") { if (P.keyBuf.length >= 4) { e.preventDefault(); scan(P.keyBuf); } P.keyBuf = ""; return; }
      if (e.key.length === 1) { P.keyBuf = (now - P.keyAt < 60 ? P.keyBuf : "") + e.key; P.keyAt = now; }
    });
    drawCart();
    paintOffline();
    // Keep this till's offline copy fresh (one call each time the POS opens), then send anything waiting.
    if (isOnline() && Off()) Off().refreshCatalog(loc()).then(() => Off().sync()).catch(() => {});
    loadItems();
    refreshHeldCount();
    if (window.matchMedia("(pointer: fine)").matches) q.focus();
  }

  function paintOffline() {
    const n = P.el?.querySelector("[data-offline-note]");
    if (n) n.hidden = isOnline();
  }
  async function localItems() {
    const data = Off() ? await Off().getCatalog(loc()) : null;
    if (!data) return null;
    return Off().searchLocal(data, P.query, P.category);
  }
  async function loadItems() {
    const box = P.el?.querySelector("[data-items]");
    if (!box) return;
    paintOffline();
    try {
      if (!isOnline()) throw Object.assign(new Error("offline"), { offline: true });
      P.items = await I().rpc("app_inv2_pos_items", { p_search: P.query || null, p_category_id: P.category || null, p_location_id: loc(), p_limit: 60 });
    } catch (e) {
      const local = Off() && Off().isNetworkError(e) ? await localItems() : null;
      if (!local) { box.innerHTML = `<div class="inv2-alert inv2-alert-error">${esc(Off() && Off().isNetworkError(e) ? "Offline, and this till has no saved product list yet. Open the POS once while online." : (e.message || e))}</div>`; return; }
      P.items = local;
    }
    if (!P.items.length) { box.innerHTML = `<div class="inv2-empty"><i class="fa-solid fa-box-open" aria-hidden="true"></i><p>${P.query ? "No product matches." : "No products yet."}</p>${P.query ? "" : `<small>Add products in Products first.</small>`}</div>`; return; }
    box.innerHTML = P.items.map((it, i) => {
      const out = it.product_type === "stock" && Number(it.qty) <= 0;
      return `<button type="button" class="inv2-pos-item${out ? " is-out" : ""}" data-i="${i}" title="${esc(it.name)}${it.variant_name ? " · " + esc(it.variant_name) : ""}">
        <span class="inv2-ico-tile">${I().iconHtml(it.icon_id || "general/package", "md")}</span>
        <span class="inv2-pos-item-name">${esc(it.name)}${it.variant_name ? `<small>${esc(it.variant_name)}</small>` : ""}</span>
        <span class="inv2-pos-item-foot"><strong>${esc(I().money(it.sell_price))}</strong>${it.product_type === "stock" ? `<small class="${out ? "bad" : Number(it.qty) <= 5 ? "warn" : ""}">${I().qty(it.qty)} ${esc(it.unit_code || "")}</small>` : `<small>Service</small>`}</span></button>`;
    }).join("");
    box.querySelectorAll("[data-i]").forEach(b => b.addEventListener("click", () => addItem(P.items[Number(b.dataset.i)])));
  }

  async function scan(code, input) {
    if (!code) return;
    let hit = null;
    if (!isOnline()) return scanLocal(code, input);
    try { hit = await I().rpc("app_inv2_lookup_code", { p_code: code }); }
    catch (e) { if (Off() && Off().isNetworkError(e)) return scanLocal(code, input); Shell().toast(e.message || String(e)); return; }
    if (!hit) {
      // Not a code: treat as a search; one result is added straight away.
      P.query = code; await loadItems();
      if (P.items.length === 1) { addItem(P.items[0]); if (input) { input.value = ""; P.query = ""; loadItems(); } }
      else if (!P.items.length) Shell().toast(`Nothing found for ${code}.`);
      return;
    }
    if (hit.serial_location_id && hit.serial_location_id !== loc()) { Shell().toast(`IMEI/serial ${hit.serial_no} is in stock at another location.`); return; }
    const items = await I().rpc("app_inv2_pos_items", { p_search: null, p_category_id: null, p_location_id: loc(), p_limit: 100 }).catch(() => []);
    let it = items.find(x => x.variant_id === hit.variant_id);
    if (!it) { const one = await I().rpc("app_inv2_products_list", { p_search: code, p_category_id: null, p_location_id: loc(), p_status: "active", p_limit: 5, p_offset: 0 }).catch(() => null); it = one?.rows?.find(x => x.variant_id === hit.variant_id); }
    if (!it) { Shell().toast("This product is archived."); return; }
    const factor = Number(hit.factor || 1);
    addItem(it, { product_unit_id: hit.product_unit_id || null, factor, serial: hit.serial_no || null });
    if (input) { input.value = ""; }
    beep();
  }
  async function scanLocal(code, input) {
    const data = Off() ? await Off().getCatalog(loc()) : null;
    const hit = Off()?.lookupLocal(data, code);
    if (!hit) {
      P.query = code; await loadItems();
      if (P.items.length === 1) { addItem(P.items[0]); if (input) { input.value = ""; P.query = ""; loadItems(); } }
      else if (!P.items.length) Shell().toast(`Nothing found for ${code} on this device.`);
      return;
    }
    addItem(hit.item, { product_unit_id: hit.product_unit_id || null, factor: hit.factor, serial: hit.serial || null, unit_label: hit.unit_label });
    if (input) input.value = "";
    beep();
  }
  function beep() { try { const c = new (window.AudioContext || window.webkitAudioContext)(); const o = c.createOscillator(); const g = c.createGain(); o.frequency.value = 1150; g.gain.value = 0.04; o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.07); setTimeout(() => c.close(), 200); } catch (_) {} }

  async function addItem(it, opts = {}) {
    const cart = P.cart;
    const factor = Number(opts.factor || 1);
    const tracked = it.tracking === "serial" || it.tracking === "imei";
    if (tracked) {
      const serials = opts.serial ? [opts.serial] : await pickSerials(it);
      if (!serials || !serials.length) return;
      let line = cart.lines.find(l => l.variant_id === it.variant_id && !l.product_unit_id);
      if (!line) { line = newLine(it, 1); line.serials = []; line.qty = 0; cart.lines.push(line); }
      serials.forEach(s => { if (!line.serials.includes(s)) line.serials.push(s); });
      line.qty = line.serials.length;
    } else {
      const key = `${it.variant_id}|${opts.product_unit_id || ""}`;
      const line = cart.lines.find(l => l.key === key);
      if (line) line.qty = Number(line.qty) + 1;
      else { const l = newLine(it, factor); l.key = key; l.product_unit_id = opts.product_unit_id || null; if (opts.unit_label) l.unit_label = opts.unit_label; cart.lines.push(l); }
    }
    saveCart(); drawCart(true);
  }
  function newLine(it, factor) {
    return { key: `${it.variant_id}|`, variant_id: it.variant_id, name: it.name, variant_name: it.variant_name || "", icon_id: it.icon_id, tracking: it.tracking, product_type: it.product_type,
      unit_code: it.unit_code, allow_decimal: !!it.allow_decimal, qty: 1, factor, list_price: r2(Number(it.sell_price) * factor), price: r2(Number(it.sell_price) * factor),
      wholesale: it.wholesale_price != null ? r2(Number(it.wholesale_price) * factor) : null, price_edited: false, discount: 0, tax_rate: Number(it.tax_rate || 0),
      incl: it.price_includes_tax !== false, stock: Number(it.qty || 0), serials: [], product_unit_id: null };
  }

  function pickSerials(it) {
    return new Promise(async resolve => {
      let avail = [];
      try {
        if (!isOnline()) throw Object.assign(new Error("offline"), { offline: true });
        avail = (await I().rpc("app_inv2_tracking_stock", { p_variant_id: it.variant_id, p_location_id: loc() })).serials || [];
      } catch (e) { if (Off() && Off().isNetworkError(e)) avail = Off().serialsFor(await Off().getCatalog(loc()), it.variant_id); }
      const inCart = new Set(P.cart.lines.filter(l => l.variant_id === it.variant_id).flatMap(l => l.serials || []));
      avail = avail.filter(s => !inCart.has(s));
      if (!avail.length) { Shell().toast(`No ${it.tracking === "imei" ? "IMEI" : "serial"} numbers of ${it.name} in stock here.`); resolve(null); return; }
      const dlg = I().dialog({
        title: `${it.name}${it.variant_name ? " · " + it.variant_name : ""}`, subtitle: `Scan or tick the ${it.tracking === "imei" ? "IMEI" : "serial"} number(s) being sold`, submitLabel: "Add to cart",
        body: `<label class="inv2-search inv2-search-inline"><i class="fa-solid fa-barcode" aria-hidden="true"></i><input type="search" data-sscan placeholder="Scan ${it.tracking === "imei" ? "IMEI" : "serial"}" autocomplete="off"></label>
          <div class="inv2-serial-list" data-slist>${avail.map(s => `<label class="inv2-check"><input type="checkbox" value="${esc(s)}"> <span class="mono">${esc(s)}</span></label>`).join("")}</div>`,
        onOpen(f) {
          const sc = f.querySelector("[data-sscan]");
          sc.addEventListener("keydown", e => { if (e.key !== "Enter") return; e.preventDefault(); const v = sc.value.trim(); const box = [...f.querySelectorAll("[data-slist] input")].find(x => x.value === v); if (box) { box.checked = true; sc.value = ""; } else f.querySelector("[data-error]").textContent = `${v} is not in stock here.`; });
          if (window.matchMedia("(pointer: fine)").matches) setTimeout(() => sc.focus(), 40);
        },
        async onSubmit(f) { const v = [...f.querySelectorAll("[data-slist] input:checked")].map(x => x.value); if (!v.length) throw new Error("Choose at least one."); resolve(v); }
      });
      dlg.el.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => resolve(null)));
    });
  }

  // ---- cart ------------------------------------------------------------------------------
  function drawCart(flash) {
    const box = P.el?.querySelector("[data-cart]");
    if (!box) return;
    const c = P.cart, T = totals();
    const policy = settings().negative_stock_policy || "warn";
    box.innerHTML = `
      <div class="inv2-cart-head">
        <button type="button" class="inv2-icon-btn inv2-cart-back" data-cart-back aria-label="Back to products"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i></button>
        <button type="button" class="inv2-cust" data-cust><span class="inv2-cust-ico"><i class="fa-solid fa-user" aria-hidden="true"></i></span>
          <span><strong>${esc(c.customer ? c.customer.name : "Walk-in customer")}</strong><small>${c.customer ? (c.customer.balance != null && Number(c.customer.balance) !== 0 ? `Balance ${esc(I().money(c.customer.balance))}` : esc(c.customer.phone || "Customer account")) : "Tap to choose a customer"}</small></span></button>
        ${c.customer ? `<button type="button" class="inv2-icon-btn small" data-cust-clear aria-label="Remove customer"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>` : ""}
      </div>
      ${c.source_no ? `<div class="inv2-cart-note"><i class="fa-solid fa-file-lines" aria-hidden="true"></i> Converting ${esc(c.source_no)}</div>` : ""}
      ${c.id ? `<div class="inv2-cart-note"><i class="fa-solid fa-pause" aria-hidden="true"></i> Resumed held sale</div>` : ""}
      <div class="inv2-cart-lines" data-lines>${c.lines.length ? c.lines.map((l, i) => {
        const short = l.product_type === "stock" && !(l.serials || []).length && l.qty * l.factor > l.stock;
        return `<div class="inv2-cart-line${short ? " is-short" : ""}" data-l="${i}">
          <button type="button" class="inv2-cart-main" data-edit="${i}">
            <strong>${esc(l.name)}${l.variant_name ? ` <small>${esc(l.variant_name)}</small>` : ""}</strong>
            <small>${esc(I().money(l.price))}${l.factor !== 1 ? ` / ${esc(l.unit_label || "pack")} of ${I().qty(l.factor)}` : ""}${l.discount ? ` · −${esc(I().money(l.discount))}` : ""}${l.price_edited ? " · price changed" : ""}</small>
            ${(l.serials || []).length ? `<small class="mono">${l.serials.map(esc).join(", ")}</small>` : ""}
            ${short ? `<small class="warn">Only ${I().qty(l.stock)} in stock${policy === "block" ? " — cannot be sold" : ""}</small>` : ""}</button>
          <div class="inv2-qty">${(l.serials || []).length ? "" : `<button type="button" data-minus="${i}" aria-label="One less">−</button>`}
            <span>${I().qty(l.qty)}</span>${(l.serials || []).length ? "" : `<button type="button" data-plus="${i}" aria-label="One more">+</button>`}</div>
          <strong class="inv2-cart-amt">${esc(I().money(T.rows[i]?.total || 0))}</strong></div>`; }).join("")
        : `<div class="inv2-empty"><i class="fa-solid fa-cart-shopping" aria-hidden="true"></i><p>The cart is empty.</p><small>Scan a barcode or tap a product.</small></div>`}</div>
      <div class="inv2-cart-tots">
        <div><span>Subtotal</span><span>${esc(I().money(T.sub))}</span></div>
        ${T.disc ? `<div><span>Discount</span><span>−${esc(I().money(T.disc))}</span></div>` : ""}
        <div><span>Tax</span><span>${esc(I().money(T.tax))}</span></div>
        <div class="grand"><span>Total</span><span>${esc(I().money(T.total))}</span></div>
      </div>
      <div class="inv2-cart-actions">
        <button type="button" class="inv2-btn" data-hold${c.lines.length ? "" : " disabled"}><i class="fa-solid fa-pause" aria-hidden="true"></i> Hold</button>
        <button type="button" class="inv2-btn" data-disc${c.lines.length ? "" : " disabled"}><i class="fa-solid fa-tag" aria-hidden="true"></i> Discount</button>
        <div class="inv2-more"><button type="button" class="inv2-btn" data-more aria-haspopup="menu" aria-expanded="false"${c.lines.length ? "" : " disabled"}><i class="fa-solid fa-ellipsis" aria-hidden="true"></i> More</button>
          <div class="inv2-menu-pop inv2-menu-up" role="menu" hidden>
            <button type="button" role="menuitem" data-quote="quotation"><i class="fa-solid fa-file-lines" aria-hidden="true"></i> Save as quotation</button>
            <button type="button" role="menuitem" data-quote="proforma"><i class="fa-solid fa-file-invoice" aria-hidden="true"></i> Save as proforma</button>
            <button type="button" role="menuitem" data-note><i class="fa-solid fa-pen" aria-hidden="true"></i> Note on the sale</button>
            <button type="button" role="menuitem" data-clear><i class="fa-solid fa-trash" aria-hidden="true"></i> Clear cart</button></div></div>
      </div>
      <button type="button" class="inv2-btn primary inv2-pay" data-pay${c.lines.length ? "" : " disabled"}><i class="fa-solid fa-bag-shopping" aria-hidden="true"></i> Pay ${esc(I().money(T.total))}</button>`;
    const bar = P.el.querySelector("[data-cartbar]");
    const n = c.lines.reduce((a, l) => a + Number(l.qty || 0), 0);
    if (bar) bar.innerHTML = `<span><i class="fa-solid fa-cart-shopping" aria-hidden="true"></i> ${I().qty(n)} item${n === 1 ? "" : "s"}</span><strong>${esc(I().money(T.total))}</strong>`;
    if (flash) { box.classList.remove("flash"); void box.offsetWidth; box.classList.add("flash"); }
    bindCart(box);
  }

  function bindCart(box) {
    const c = P.cart;
    box.querySelector("[data-cust]").addEventListener("click", customerDialog);
    box.querySelector("[data-cart-back]").addEventListener("click", () => P.el.querySelector("[data-pos]").classList.remove("show-cart"));
    box.querySelector("[data-cust-clear]")?.addEventListener("click", () => { c.customer = null; saveCart(); drawCart(); });
    box.querySelectorAll("[data-plus]").forEach(b => b.addEventListener("click", () => { const l = c.lines[b.dataset.plus]; l.qty = Number(l.qty) + 1; saveCart(); drawCart(); }));
    box.querySelectorAll("[data-minus]").forEach(b => b.addEventListener("click", () => { const i = Number(b.dataset.minus), l = c.lines[i]; l.qty = Number(l.qty) - 1; if (l.qty <= 0) c.lines.splice(i, 1); saveCart(); drawCart(); }));
    box.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => editLine(Number(b.dataset.edit))));
    box.querySelector("[data-hold]").addEventListener("click", hold);
    box.querySelector("[data-disc]").addEventListener("click", discountDialog);
    box.querySelector("[data-pay]").addEventListener("click", payDialog);
    const more = box.querySelector("[data-more]");
    more?.addEventListener("click", () => { const m = more.nextElementSibling; m.hidden = !m.hidden; more.setAttribute("aria-expanded", String(!m.hidden)); });
    box.querySelectorAll("[data-quote]").forEach(b => b.addEventListener("click", () => saveQuote(b.dataset.quote)));
    box.querySelector("[data-note]")?.addEventListener("click", () => {
      I().dialog({ title: "Note on the sale", body: `<label class="inv2-field">Note (printed on the invoice)<textarea class="inv2-input" name="n" rows="3" maxlength="500">${esc(c.notes || "")}</textarea></label>`,
        async onSubmit(f) { c.notes = f.n.value.trim(); saveCart(); drawCart(); } });
    });
    box.querySelector("[data-clear]")?.addEventListener("click", () => { if (!confirm("Clear the cart?")) return; resetCart(); drawCart(); });
  }

  function editLine(i) {
    const l = P.cart.lines[i];
    const tracked = (l.serials || []).length > 0;
    I().dialog({
      title: l.name + (l.variant_name ? ` · ${l.variant_name}` : ""), submitLabel: "Update",
      body: `<div class="inv2-form-grid">
        <label class="inv2-field">Quantity<input class="inv2-input" name="qty" type="number" min="0" step="${l.allow_decimal ? "any" : "1"}" inputmode="decimal" value="${esc(l.qty)}"${tracked ? " disabled" : ""}>${tracked ? `<small>Set by the ${l.tracking === "imei" ? "IMEI" : "serial"} numbers.</small>` : ""}</label>
        <label class="inv2-field">Price${l.factor !== 1 ? ` per ${esc(l.unit_label || "pack")}` : ""}<input class="inv2-input" name="price" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(l.price)}"${canChangePrice() ? "" : " disabled"}>
          ${canChangePrice() ? (l.wholesale != null ? `<small><button type="button" class="inv2-link" data-ws>Use wholesale price ${esc(I().money(l.wholesale))}</button></small>` : `<small>List price ${esc(I().money(l.list_price))}</small>`) : `<small>Only the owner can change prices.</small>`}</label>
        <label class="inv2-field">Discount on this line (amount)<input class="inv2-input" name="disc" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(l.discount || 0)}">${I().isOwner() ? "" : `<small>Up to ${esc(settings().staff_max_discount_pct ?? 10)}% for team members.</small>`}</label>
        ${tracked ? `<div class="inv2-field wide">Serial / IMEI<div class="inv2-chips">${l.serials.map(s => `<span class="inv2-chip mono">${esc(s)} <button type="button" class="inv2-link" data-rm-serial="${esc(s)}" aria-label="Remove ${esc(s)}">×</button></span>`).join("")}</div></div>` : ""}
      </div>`,
      onOpen(f, d) {
        f.querySelector("[data-ws]")?.addEventListener("click", () => { f.price.value = l.wholesale; });
        f.querySelectorAll("[data-rm-serial]").forEach(b => b.addEventListener("click", () => { l.serials = l.serials.filter(s => s !== b.dataset.rmSerial); l.qty = l.serials.length; if (!l.qty) P.cart.lines.splice(i, 1); saveCart(); drawCart(); d.close(true); }));
        f.querySelector(".inv2-dialog-foot")?.insertAdjacentHTML("afterbegin", `<button type="button" class="inv2-btn danger-ghost" data-remove style="margin-right:auto"><i class="fa-solid fa-trash" aria-hidden="true"></i> Remove</button>`);
        f.querySelector("[data-remove]").addEventListener("click", () => { P.cart.lines.splice(i, 1); saveCart(); drawCart(); d.close(true); });
      },
      async onSubmit(f) {
        const q = Number(f.qty.value), price = Number(f.price.value), disc = Number(f.disc.value || 0);
        if (!tracked) { if (!(q > 0)) throw new Error("Enter a quantity, or remove the line."); if (!l.allow_decimal && q * l.factor !== Math.trunc(q * l.factor)) throw new Error("This unit only allows whole quantities."); l.qty = q; }
        if (!(price >= 0)) throw new Error("Enter a valid price.");
        if (disc < 0 || disc > r2(l.qty * price)) throw new Error("The discount cannot be more than the line amount.");
        l.price_edited = Math.abs(price - l.list_price) > 0.004; l.price = r2(price); l.discount = r2(disc);
        saveCart(); drawCart();
      }
    });
  }

  function discountDialog() {
    const T = totals();
    I().dialog({
      title: "Discount on the whole sale", submitLabel: "Apply",
      body: `<div class="inv2-form-grid">
        <label class="inv2-field">Amount<input class="inv2-input" name="amt" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(P.cart.discount || "")}"></label>
        <label class="inv2-field">or percent<input class="inv2-input" name="pct" type="number" min="0" max="100" step="0.5" inputmode="decimal" placeholder="%"></label></div>
        <p class="inv2-note">Sale before this discount: ${esc(I().money(T.gross))}. ${I().isOwner() ? "" : `Team members can give up to ${esc(settings().staff_max_discount_pct ?? 10)}% in total.`}</p>`,
      onOpen(f) { f.pct.addEventListener("input", () => { if (f.pct.value) f.amt.value = r2(T.gross * Number(f.pct.value) / 100); }); },
      async onSubmit(f) { const a = r2(Number(f.amt.value || 0)); if (a < 0 || a > T.gross) throw new Error("The discount cannot be more than the sale."); P.cart.discount = a; saveCart(); drawCart(); }
    });
  }

  // ---- customers -------------------------------------------------------------------------
  function customerDialog() {
    const d = I().dialog({
      title: "Choose a customer",
      body: `<label class="inv2-search inv2-search-inline"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" data-cq placeholder="Name, phone or code" autocomplete="off"></label>
        <div class="inv2-pick-list" data-clist><div class="inv2-loading"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i></div></div>
        ${I().canEdit() ? `<details class="inv2-quick-add"><summary><i class="fa-solid fa-user-plus" aria-hidden="true"></i> New customer</summary>
          <div class="inv2-form-grid"><label class="inv2-field">Name<input class="inv2-input" name="nname" maxlength="120"></label><label class="inv2-field">Phone<input class="inv2-input" name="nphone" type="tel" maxlength="40"></label>
          <div class="wide inv2-form-actions"><button type="button" class="inv2-btn primary small" data-cadd>Add and choose</button></div></div></details>` : ""}`,
      onOpen(f) {
        const list = f.querySelector("[data-clist]"), q = f.querySelector("[data-cq]"); let t = 0;
        const load = async () => {
          let r;
          try {
            if (!isOnline()) throw Object.assign(new Error("offline"), { offline: true });
            r = await I().rpc("app_inv2_parties_list", { p_kind: "customer", p_search: q.value.trim() || null, p_status: "active", p_limit: 30, p_offset: 0 });
          } catch (e) {
            if (!(Off() && Off().isNetworkError(e))) { list.innerHTML = `<p class="inv2-form-error">${esc(e.message)}</p>`; return; }
            const t = q.value.trim().toLowerCase(), data = await Off().getCatalog(loc());
            r = { rows: (data?.customers || []).filter(c => !t || [c.name, c.phone, c.code].some(v => String(v || "").toLowerCase().includes(t))).slice(0, 30) };
          }
          list.innerHTML = r.rows.length ? r.rows.map((c, i) => `<button type="button" data-ci="${i}"><span><strong>${esc(c.name)}</strong><small>${esc([c.phone, c.code].filter(Boolean).join(" · "))}</small></span><span class="${Number(c.balance) > 0 ? "warn" : ""}">${Number(c.balance) ? esc(I().money(c.balance)) : ""}</span></button>`).join("") : `<p class="inv2-note">No customers found.</p>`;
          list.querySelectorAll("[data-ci]").forEach(b => b.addEventListener("click", () => { const c = r.rows[Number(b.dataset.ci)]; P.cart.customer = { id: c.id, name: c.name, phone: c.phone, balance: c.balance, credit_limit: c.credit_limit }; saveCart(); drawCart(); d.close(true); }));
        };
        q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(load, 250); });
        f.querySelector("[data-cadd]")?.addEventListener("click", async () => {
          const name = f.nname.value.trim(); if (!name) { f.querySelector("[data-error]").textContent = "Enter the customer's name."; return; }
          if (!isOnline()) { f.querySelector("[data-error]").textContent = "New customers can be added when the connection is back."; return; }
          try { const c = await I().rpc("app_inv2_party_save", { p_kind: "customer", p_party: { name, phone: f.nphone.value.trim() } }); P.cart.customer = { id: c.id, name: c.name, phone: c.phone, balance: 0 }; saveCart(); drawCart(); d.close(true); }
          catch (e) { f.querySelector("[data-error]").textContent = e.message || String(e); }
        });
        load();
      }
    });
  }

  // ---- hold / quotations -----------------------------------------------------------------
  const payload = (action, extra = {}) => ({
    id: P.cart.id || null, action, source_id: P.cart.source_id || null, location_id: loc(), customer_id: P.cart.customer?.id || null,
    discount: P.cart.discount || 0, notes: P.cart.notes || "",
    lines: P.cart.lines.map(l => ({ variant_id: l.variant_id, qty: l.qty, unit_price: l.price_edited ? l.price : undefined, discount: l.discount || 0, product_unit_id: l.product_unit_id || undefined, serials: l.serials || [], factor: l.factor || 1 })),
    ...extra
  });

  async function hold() {
    if (!P.cart.lines.length) return;
    if (!isOnline()) { Shell().toast("Holding a sale needs the connection (held sales are shared between tills)."); return; }
    try { await I().rpc("app_inv2_sale_save", { p_client_op_id: I().opId(), p_sale: payload("hold") }); resetCart(); drawCart(); refreshHeldCount(); Shell().toast("Sale held. Resume it from Held."); }
    catch (e) { Shell().toast(e.message || String(e)); }
  }
  async function saveQuote(kind) {
    if (!isOnline()) { Shell().toast("Quotations need the connection."); return; }
    if (P.cart.id) { Shell().toast("Complete or discard the resumed held sale first."); return; }
    try {
      const r = await I().rpc("app_inv2_sale_save", { p_client_op_id: I().opId(), p_sale: { ...payload(kind), id: null } });
      resetCart(); drawCart();
      doneDialog(r, kind === "quotation" ? "Quotation saved" : "Proforma saved", true);
    } catch (e) { Shell().toast(e.message || String(e)); }
  }
  async function refreshHeldCount() {
    if (!isOnline()) return;
    try { const r = await I().rpc("app_inv2_sales_list", { p_type: "sale", p_status: "held", p_search: null, p_customer_id: null, p_location_id: null, p_from: null, p_to: null, p_limit: 1, p_offset: 0 }); P.heldCount = r.total; }
    catch (_) { P.heldCount = 0; }
    const pill = P.el?.querySelector("[data-held-count]"); if (pill) pill.textContent = P.heldCount ? String(P.heldCount) : "";
  }
  async function heldDialog() {
    if (!isOnline()) { Shell().toast("Held sales need the connection."); return; }
    let r; try { r = await I().rpc("app_inv2_sales_list", { p_type: "sale", p_status: "held", p_search: null, p_customer_id: null, p_location_id: null, p_from: null, p_to: null, p_limit: 50, p_offset: 0 }); }
    catch (e) { Shell().toast(e.message || String(e)); return; }
    const d = I().dialog({
      title: "Held sales", subtitle: "Held on any till of this business",
      body: r.rows.length ? `<div class="inv2-pick-list">${r.rows.map((s, i) => `<div class="inv2-pick-row"><span><strong>${esc(s.customer_name || "Walk-in customer")}</strong><small>${esc(I().dateTime(s.created_at))} · ${s.line_count} line${s.line_count === 1 ? "" : "s"} · ${esc(s.location_name)}</small></span>
          <strong>${esc(I().money(s.total))}</strong><button type="button" class="inv2-btn small primary" data-resume="${i}">Resume</button><button type="button" class="inv2-icon-btn small" data-discard="${i}" aria-label="Discard"><i class="fa-solid fa-trash" aria-hidden="true"></i></button></div>`).join("")}</div>`
        : `<div class="inv2-empty"><p>No held sales.</p></div>`,
      onOpen(f) {
        f.querySelectorAll("[data-resume]").forEach(b => b.addEventListener("click", async () => {
          if (P.cart.lines.length && !confirm("Replace the current cart with this held sale?")) return;
          try { await loadFromSale(r.rows[Number(b.dataset.resume)].id, { resume: true }); d.close(true); } catch (e) { f.querySelector("[data-error]").textContent = e.message; }
        }));
        f.querySelectorAll("[data-discard]").forEach(b => b.addEventListener("click", async () => {
          if (!confirm("Discard this held sale?")) return;
          try { await I().rpc("app_inv2_sale_cancel", { p_id: r.rows[Number(b.dataset.discard)].id, p_reason: "Discarded at POS" }); d.close(true); refreshHeldCount(); heldDialog(); } catch (e) { f.querySelector("[data-error]").textContent = e.message; }
        }));
      }
    });
  }

  // Loads a held sale (resume) or a quotation / proforma (convert) into the cart.
  async function loadFromSale(id, { resume = false } = {}) {
    const s = await I().rpc("app_inv2_sale_get", { p_id: id });
    const items = await I().rpc("app_inv2_pos_items", { p_search: null, p_category_id: null, p_location_id: s.location_id, p_limit: 100 }).catch(() => []);
    const cart = emptyCart();
    if (resume) cart.id = s.id; else { cart.source_id = s.id; cart.source_no = s.doc_no; }
    if (s.customer) cart.customer = { id: s.customer.id, name: s.customer.name, phone: s.customer.phone };
    cart.notes = s.notes || "";
    for (const l of s.lines) {
      const it = items.find(x => x.variant_id === l.variant_id) || { variant_id: l.variant_id, name: l.description, tracking: l.tracking, product_type: "stock", sell_price: l.unit_price / (l.factor || 1), tax_rate: l.tax_rate, price_includes_tax: l.price_includes_tax, qty: 0 };
      const nl = newLine(it, Number(l.factor || 1));
      nl.name = it.name || l.description; nl.qty = Number(l.qty); nl.price = Number(l.unit_price); nl.price_edited = Math.abs(nl.price - nl.list_price) > 0.004;
      nl.discount = Number(l.discount || 0); nl.serials = resume ? (l.serials || []) : []; nl.tax_rate = Number(l.tax_rate); nl.incl = l.price_includes_tax;
      nl.key = `${l.variant_id}|`;
      cart.lines.push(nl);
    }
    P.cart = cart; saveCart();
    if (Shell().current() !== "pos") Shell().show("pos", { force: true }); else drawCart();
    if (!resume && cart.lines.some(l => l.tracking === "serial" || l.tracking === "imei")) Shell().toast("Scan the IMEI/serial numbers for tracked items before payment.");
  }

  // ---- payment ---------------------------------------------------------------------------
  function payDialog() {
    const c = P.cart, T = totals();
    if (!c.lines.length) return;
    const missingSerials = c.lines.find(l => (l.tracking === "serial" || l.tracking === "imei") && (l.serials || []).length !== Number(l.qty) * Number(l.factor || 1));
    if (missingSerials) { Shell().toast(`Scan the ${missingSerials.tracking === "imei" ? "IMEI" : "serial"} number(s) for ${missingSerials.name}.`); return; }
    const short = c.lines.filter(l => l.product_type === "stock" && !(l.serials || []).length && l.qty * l.factor > l.stock);
    const policy = settings().negative_stock_policy || "warn";
    if (short.length && policy === "block") { Shell().toast(`Not enough stock for ${short.map(l => l.name).join(", ")}.`); return; }
    if (short.length && policy === "warn" && !confirm(`Stock is lower than the quantity for ${short.map(l => l.name).join(", ")}. Sell anyway?`)) return;
    const opId = I().opId(); // one id for this payment window: retries never charge twice
    const methods = [["cash", "Cash", "fa-money-bill-wave"], ["card", "Card", "fa-credit-card"], ["bank", "Bank", "fa-building-columns"], ["wallet", "Wallet", "fa-wallet"], ["cheque", "Cheque", "fa-money-check"], ["other", "Other", "fa-circle-dot"]];
    let pays = [{ method: "cash", amount: T.total, reference: "" }];
    const quick = [...new Set([T.total, Math.ceil(T.total / 5) * 5, Math.ceil(T.total / 10) * 10, Math.ceil(T.total / 50) * 50, Math.ceil(T.total / 100) * 100].map(r2))].filter(v => v >= T.total).slice(0, 5);
    const d = I().dialog({
      title: "Payment", subtitle: c.customer ? c.customer.name : "Walk-in customer", submitLabel: "Complete sale", wide: false,
      body: `<div class="inv2-pay-total"><span>Total</span><strong>${esc(I().money(T.total))}</strong></div>
        <div class="inv2-pay-methods" data-methods>${methods.map(([k, l, ic]) => `<button type="button" data-m="${k}"><i class="fa-solid ${ic}" aria-hidden="true"></i> ${l}</button>`).join("")}</div>
        <div data-rows></div>
        <div class="inv2-chips" data-quick>${quick.map(v => `<button type="button" class="inv2-chip" data-qv="${v}">${esc(I().money(v))}</button>`).join("")}</div>
        <div class="inv2-pay-sum" data-sum></div>`,
      onOpen(f) {
        const rows = f.querySelector("[data-rows]"), sum = f.querySelector("[data-sum]");
        const draw = () => {
          rows.innerHTML = pays.map((p, i) => `<div class="inv2-pay-row"><span class="inv2-badge muted">${esc(Pr().METHOD[p.method])}</span>
            <input class="inv2-input" type="number" min="0" step="0.01" inputmode="decimal" data-amt="${i}" value="${esc(p.amount)}" aria-label="Amount">
            ${p.method !== "cash" ? `<input class="inv2-input" data-ref="${i}" placeholder="Reference (optional)" value="${esc(p.reference)}" maxlength="80">` : ""}
            ${pays.length > 1 ? `<button type="button" class="inv2-icon-btn small" data-rm="${i}" aria-label="Remove"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>` : ""}</div>`).join("");
          rows.querySelectorAll("[data-amt]").forEach(x => x.addEventListener("input", () => { pays[x.dataset.amt].amount = Number(x.value || 0); summary(); }));
          rows.querySelectorAll("[data-ref]").forEach(x => x.addEventListener("input", () => { pays[x.dataset.ref].reference = x.value; }));
          rows.querySelectorAll("[data-rm]").forEach(x => x.addEventListener("click", () => { pays.splice(Number(x.dataset.rm), 1); draw(); }));
          summary();
        };
        const summary = () => {
          const paid = r2(pays.reduce((a, p) => a + Number(p.amount || 0), 0));
          const nonCash = r2(pays.filter(p => p.method !== "cash").reduce((a, p) => a + Number(p.amount || 0), 0));
          const due = r2(T.total - paid), change = paid > T.total ? r2(paid - T.total) : 0;
          sum.innerHTML = `<div><span>Paid</span><strong>${esc(I().money(paid))}</strong></div>
            ${change ? `<div class="ok"><span>Change</span><strong>${esc(I().money(change))}</strong></div>` : ""}
            ${due > 0 ? `<div class="${c.customer ? "warn" : "bad"}"><span>${c.customer ? "Left on the customer's account" : "Still due"}</span><strong>${esc(I().money(due))}</strong></div>` : ""}
            ${due > 0 && !c.customer ? `<p class="inv2-note">Choose a customer to leave a balance (sale on credit).</p>` : ""}
            ${nonCash > T.total ? `<p class="inv2-form-error">Card, bank and other payments cannot be more than the total.</p>` : ""}`;
          f.querySelector("[data-submit]").disabled = (due > 0 && !c.customer) || nonCash > T.total;
        };
        f.querySelectorAll("[data-m]").forEach(b => b.addEventListener("click", () => {
          const paid = r2(pays.reduce((a, p) => a + Number(p.amount || 0), 0));
          const left = Math.max(r2(T.total - paid), 0);
          if (pays.length === 1 && paid === T.total && pays[0].method === "cash" && !pays[0].touched) { pays[0].method = b.dataset.m; pays[0].touched = true; }
          else pays.push({ method: b.dataset.m, amount: left, reference: "" });
          draw();
        }));
        f.querySelectorAll("[data-qv]").forEach(b => b.addEventListener("click", () => { const cash = pays.find(p => p.method === "cash") || (pays.push({ method: "cash", amount: 0, reference: "" }), pays[pays.length - 1]); const other = r2(pays.filter(p => p !== cash).reduce((a, p) => a + Number(p.amount || 0), 0)); cash.amount = r2(Number(b.dataset.qv) - other); draw(); }));
        draw();
      },
      async onSubmit() {
        const body = payload("complete", { payments: pays.filter(p => Number(p.amount) > 0).map(p => ({ method: p.method, amount: r2(p.amount), reference: p.reference || "" })) });
        if (!isOnline()) return completeOffline(opId, body, T, pays, false);
        let r;
        const send = () => I().rpc("app_inv2_sale_save", { p_client_op_id: opId, p_sale: body });
        try {
          try { r = await send(); }
          catch (e) {
            // A dropped reply on a working connection: ask once more with the same operation id. The server
            // returns the sale it already saved, or saves it now; it never sells twice.
            if (!(Off() && Off().isNetworkError(e) && isOnline())) throw e;
            await new Promise(res => setTimeout(res, 600));
            r = await send();
          }
        }
        catch (e) {
          // No answer from the server: the sale may or may not have been saved. Keep it on this device with the
          // same operation id; sending it again later saves it once either way.
          if (Off() && Off().isNetworkError(e) && !c.id && !c.source_id) return completeOffline(opId, body, T, pays, true);
          throw e;
        }
        Off()?.noteSale(loc(), body).catch(() => {});
        resetCart(); drawCart(); loadItems(); refreshHeldCount(); I().invalidateSummary();
        setTimeout(() => doneDialog(r, "Sale completed"), 30);
      }
    });
    return d;
  }

  // Completes the sale on this device: provisional number, receipt marked provisional, sent by the sync.
  async function completeOffline(opId, body, T, pays, sent) {
    const c = P.cart;
    if (!Off()) throw new Error("This device cannot keep sales offline.");
    if (c.id || c.source_id) throw new Error("Resumed held sales and quotations need the connection.");
    const s = settings();
    const short = c.lines.filter(l => l.product_type === "stock" && !(l.serials || []).length && l.qty * l.factor > l.stock);
    if (short.length && s.offline_sale_policy === "block") throw new Error(`Offline sales are blocked when stock is short (${short.map(l => l.name).join(", ")}). Ask the owner, or wait for the connection.`);
    const paid = r2(pays.reduce((a, p) => a + Number(p.amount || 0), 0));
    if (paid < T.total && !c.customer) throw new Error("Choose a customer to leave a balance.");
    const now = new Date();
    const offlineNo = Off().nextOfflineNo();
    const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const full = { ...body, offline: true, offline_no: offlineNo, offline_at: now.toISOString(), device_id: Off().device(), doc_date: localDate };
    const change = paid > T.total ? r2(paid - T.total) : 0;
    const receipt = { doc_type: "sale", status: "completed", provisional: true, offline_no: offlineNo, doc_no: offlineNo, completed_at: now.toISOString(), doc_date: localDate,
      location: { name: locName() }, cashier: Shell().context()?.user_name, customer: c.customer ? { name: c.customer.name, phone: c.customer.phone } : null,
      lines: c.lines.map((l, i) => ({ description: l.name + (l.variant_name ? ` ${l.variant_name}` : ""), qty: l.qty, unit_label: l.unit_label, unit_price: l.price, discount: r2(l.discount || 0), line_total: T.rows[i].total, serials: l.serials || [] })),
      subtotal: T.sub, discount_total: T.disc, tax_total: T.tax, total: T.total,
      payments: pays.filter(p => Number(p.amount) > 0).map(p => ({ method: p.method, amount: p.method === "cash" ? r2(Number(p.amount) - change) : r2(p.amount), direction: "in" })), change_given: change,
      due: Math.max(r2(T.total - paid), 0), notes: c.notes };
    await Off().enqueue(opId, full, { total: T.total, customer: c.customer?.name || "", receipt, sent });
    resetCart(); drawCart(); loadItems();
    setTimeout(() => doneDialog({ id: null, doc_no: offlineNo, total: T.total, paid: Math.min(paid, T.total), change, due: Math.max(r2(T.total - paid), 0), offline: true, receipt, sent }, sent ? "Saved on this device" : "Sale saved offline"), 30);
  }

  function doneDialog(r, title, isQuote = false) {
    I().dialog({
      title, subtitle: r.doc_no || "",
      body: `<div class="inv2-done"><span class="inv2-done-ico"><i class="fa-solid fa-check" aria-hidden="true"></i></span>
        <div class="inv2-done-grid"><div><span>Total</span><strong>${esc(I().money(r.total))}</strong></div>
          ${isQuote ? "" : `<div><span>Paid</span><strong>${esc(I().money(r.paid))}</strong></div>`}
          ${Number(r.change) ? `<div class="ok"><span>Change</span><strong>${esc(I().money(r.change))}</strong></div>` : ""}
          ${!isQuote && Number(r.due) > 0 ? `<div class="warn"><span>On account</span><strong>${esc(I().money(r.due))}</strong></div>` : ""}</div>
        ${r.posting === "pending" ? `<p class="inv2-note"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Saved. Posting to Accounting is waiting for setup (see Settings).</p>` : ""}
        ${r.offline ? `<p class="inv2-note inv2-offline-note"><i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i> ${r.sent ? "The connection dropped while saving. The sale is kept on this device and sent again automatically; it is saved only once." : "Provisional number. The sale is sent automatically when the connection is back and then gets its final invoice number."}</p>` : ""}
        <div class="inv2-done-actions">
          ${isQuote ? "" : `<button type="button" class="inv2-btn" data-pr="receipt"><i class="fa-solid fa-receipt" aria-hidden="true"></i> Print receipt</button>`}
          <button type="button" class="inv2-btn" data-pr="a4"><i class="fa-solid fa-file-invoice" aria-hidden="true"></i> ${isQuote ? "Print" : "A4 invoice"}</button>
        </div></div>`,
      onOpen(f, d) {
        f.querySelectorAll("[data-pr]").forEach(b => b.addEventListener("click", () => {
          if (r.offline) { Pr().print(b.dataset.pr === "a4" ? Pr().documentHtml(r.receipt, "sale") : Pr().receiptHtml(r.receipt)); return; }
          Pr().printSale(r.id, b.dataset.pr).catch(e => Shell().toast(e.message));
        }));
        const foot = f.querySelector(".inv2-dialog-foot"); foot.innerHTML = `<button type="button" class="inv2-btn primary" data-new><i class="fa-solid fa-plus" aria-hidden="true"></i> New sale</button>`;
        foot.querySelector("[data-new]").addEventListener("click", () => { d.close(true); P.el?.querySelector("[data-q]")?.focus(); });
      }
    });
  }

  function init() { Shell()?.register("pos", { render }); }
  window.addEventListener("online", () => { if (P.el?.isConnected) { paintOffline(); loadItems(); refreshHeldCount(); } });
  window.addEventListener("offline", () => { if (P.el?.isConnected) paintOffline(); });
  window.TriplemInv2Pos = { loadFromSale, totals, addItem };
  if (window.TriplemInventoryV2Shell) init(); else document.addEventListener("DOMContentLoaded", init);
})();
