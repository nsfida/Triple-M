/* Triplem VIP Inventory 2.0 - full-screen application shell (Phase 2; phone tab bar and tablet rail in Phase 4).
 *
 * Opens inside the existing Triplem VIP session (no new window, no second login)
 * and returns to the home screen with the Home button, without reloading.
 * Every open asks the server (app_inv2_context), so a user whose access was
 * switched off cannot use the app by calling it directly.
 *
 * Phase 2 contains the navigation, layout and empty states only. Sections show
 * real data as each later phase adds it; no demonstration figures are shown.
 */
(function () {
  "use strict";

  const NAV = [
    { key: "dashboard", label: "Dashboard", icon: "fa-table-cells-large" },
    { key: "pos", label: "POS Terminal", icon: "fa-cash-register" },
    { key: "orders", label: "Orders / Sales", icon: "fa-receipt" },
    { key: "products", label: "Products", icon: "fa-box-open" },
    { key: "stock", label: "Inventory / Stock", icon: "fa-warehouse" },
    { key: "purchases", label: "Purchases", icon: "fa-truck-ramp-box" },
    { key: "customers", label: "Customers", icon: "fa-user-group" },
    { key: "suppliers", label: "Suppliers", icon: "fa-handshake" },
    { key: "documents", label: "Invoices & Receipts", icon: "fa-file-invoice" },
    { key: "outstanding", label: "Outstanding Balances", icon: "fa-scale-balanced" },
    { key: "reports", label: "Reports", icon: "fa-chart-column" },
    { key: "labels", label: "Labels & Barcodes", icon: "fa-tags" },
    { key: "settings", label: "Settings", icon: "fa-gear" }
  ];
  // What each section will hold, and in which planned phase it arrives.
  const PLANNED = {
    pos: ["Fast checkout with barcode scanning, cart, discounts, split and credit payments, hold and resume, thermal receipts.", 5],
    orders: ["Every sale, quotation and proforma with its status, payments and returns.", 5],
    products: ["Products, variants, units, barcodes, serial/IMEI and batch tracking, photos or icons.", 3],
    stock: ["Stock per outlet and warehouse, movement history, counts, adjustments and transfers.", 3],
    purchases: ["Purchase orders, goods receiving by barcode, supplier invoices and returns.", 5],
    customers: ["Customer accounts, credit limits, statements and payment allocation.", 5],
    suppliers: ["Supplier accounts, payables, payments and purchase history.", 5],
    documents: ["Invoices, receipts, credit notes, delivery notes and A4/thermal printing.", 5],
    outstanding: ["What customers owe you and what you owe suppliers, with ageing.", 5],
    reports: ["Sales, profit, stock value, slow movers, tax summary and exports.", 8],
    labels: ["Price and barcode labels for shelves, products and received goods.", 8],
    settings: ["Business details, outlets, taxes, numbering, receipts and staff roles.", 3]
  };

  // Phone tab bar: the most used sections; "Menu" opens the full list.
  const TABS = [
    { key: "dashboard", label: "Home", icon: "fa-table-cells-large" },
    { key: "products", label: "Products", icon: "fa-box-open" },
    { key: "stock", label: "Stock", icon: "fa-warehouse" },
    { key: "settings", label: "Settings", icon: "fa-gear" },
    { key: "menu", label: "Menu", icon: "fa-bars" }
  ];
  const RAIL = "(max-width: 1100px)";
  const S = { root: null, ctx: null, view: "dashboard", dirty: false, offline: false, prevOverflow: "" };
  // Sections built in later phases register here: VIEWS[key] = { render(el, api) }.
  const VIEWS = {};
  let readyHook = null;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const st = () => (typeof state !== "undefined" ? state : null);

  function isOpen() { return !!(S.root && !S.root.hidden); }

  async function open() {
    if (isOpen()) return;
    build();
    S.root.hidden = false;
    S.prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.classList.add("tm-inv2-open");
    document.getElementById("app")?.setAttribute("aria-hidden", "true");
    S.root.querySelector("[data-inv2-content]").innerHTML = `<div class="inv2-loading" role="status"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Opening Inventory 2.0…</div>`;
    setTimeout(() => S.root.querySelector(".inv2-home")?.focus(), 30);
    await loadContext();
    if (!isOpen()) return;
    try { if (readyHook) await readyHook(S.ctx); } catch (e) { console.error(e); }
    show(S.view, { force: true });
  }

  async function loadContext() {
    const u = st()?.sessionUser || {};
    const fallback = { business_name: u.company_name || u.display_name || u.username || "", user_name: u.display_name || u.username || "", team_title: u.team_title || "", is_owner: !u.team_owner_id };
    if (navigator.onLine === false || typeof supabaseRpc !== "function") { S.offline = true; S.ctx = S.ctx || fallback; paintIdentity(); return; }
    try {
      S.ctx = await supabaseRpc("app_inv2_context", {}, { offlineCache: false });
      S.offline = false;
      paintIdentity();
    } catch (e) {
      const msg = String(e?.message || e || "");
      if (/not enabled/i.test(msg) || /Authentication required/i.test(msg)) {
        close({ force: true });
        try { await window.TriplemInventoryV2?.refreshAccess?.(true); } catch (_) {}
        alert(/not enabled/i.test(msg) ? "Inventory 2.0 is not enabled for this account." : "Please sign in again.");
        return;
      }
      S.offline = true; S.ctx = S.ctx || fallback; paintIdentity();
    }
  }

  function close(opts = {}) {
    if (!S.root || S.root.hidden) return true;
    if (S.dirty && !opts.force && !confirm("You have unsaved changes in Inventory 2.0. Leave and discard them?")) return false;
    S.dirty = false;
    S.root.hidden = true;
    document.body.style.overflow = S.prevOverflow || "";
    document.documentElement.classList.remove("tm-inv2-open");
    document.getElementById("app")?.removeAttribute("aria-hidden");
    return true;
  }

  function goHome() {
    if (!close()) return;
    try { if (typeof activate === "function") activate("home"); } catch (_) {}
  }

  function build() {
    if (S.root) return;
    const root = document.createElement("div");
    root.id = "inv2App";
    root.className = "inv2-app";
    root.hidden = true;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Triplem VIP Inventory 2.0");
    root.innerHTML = `
      <aside class="inv2-sidebar" aria-label="Inventory 2.0 sections">
        <div class="inv2-brand">
          <img src="Assets/logo/logo.webp" alt="" class="inv2-brand-logo" width="40" height="40" decoding="async">
          <div class="inv2-brand-text"><strong>Triplem VIP</strong><span>Inventory 2.0</span></div>
        </div>
        <nav class="inv2-nav">
          ${NAV.map(n => `<button type="button" class="inv2-nav-item" data-inv2-view="${n.key}" title="${esc(n.label)}"><i class="fa-solid ${n.icon}" aria-hidden="true"></i><span>${esc(n.label)}</span></button>`).join("")}
        </nav>
        <div class="inv2-identity" data-inv2-identity>
          <div class="inv2-avatar" aria-hidden="true"><i class="fa-solid fa-store"></i></div>
          <div class="inv2-identity-text"><strong data-inv2-business>&nbsp;</strong><span data-inv2-user>&nbsp;</span></div>
        </div>
      </aside>
      <div class="inv2-scrim" data-inv2-scrim></div>
      <div class="inv2-main">
        <header class="inv2-topbar">
          <button type="button" class="inv2-icon-btn inv2-home" title="Back to Triplem VIP home" aria-label="Back to Triplem VIP home"><i class="fa-solid fa-house" aria-hidden="true"></i></button>
          <button type="button" class="inv2-icon-btn inv2-menu" title="Show or hide the menu" aria-label="Show or hide the menu" aria-expanded="true"><i class="fa-solid fa-bars" aria-hidden="true"></i></button>
          <label class="inv2-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" placeholder="Search products, barcodes, orders, customers…" aria-label="Search Inventory 2.0" data-inv2-search></label>
          <span class="inv2-offline" data-inv2-offline hidden><i class="fa-solid fa-wifi" aria-hidden="true"></i> Offline</span>
          <button type="button" class="inv2-icon-btn" data-inv2-alerts title="Inventory alerts" aria-label="Inventory alerts"><i class="fa-regular fa-bell" aria-hidden="true"></i></button>
          <button type="button" class="inv2-icon-btn" data-inv2-help title="Help" aria-label="Help"><i class="fa-regular fa-circle-question" aria-hidden="true"></i></button>
          <label class="inv2-outlet"><span class="inv2-sr">Outlet</span><select class="inv2-outlet-select" data-inv2-outlet aria-label="Outlet" disabled><option>All locations</option></select></label>
        </header>
        <main class="inv2-content" data-inv2-content tabindex="-1"></main>
        <nav class="inv2-tabbar" aria-label="Inventory 2.0 quick navigation">
          ${TABS.map(t => `<button type="button" data-inv2-tab="${t.key}"><i class="fa-solid ${t.icon}" aria-hidden="true"></i><span>${esc(t.label)}</span></button>`).join("")}
        </nav>
      </div>`;
    document.body.appendChild(root);
    S.root = root;

    root.querySelector(".inv2-home").addEventListener("click", goHome);
    root.querySelectorAll("[data-inv2-view]").forEach(b => b.addEventListener("click", () => { show(b.dataset.inv2View); if (window.matchMedia(RAIL).matches) toggleMenu(false); }));
    root.querySelectorAll("[data-inv2-tab]").forEach(b => b.addEventListener("click", () => { if (b.dataset.inv2Tab === "menu") toggleMenu(true); else show(b.dataset.inv2Tab); }));
    root.addEventListener("keydown", e => { if (e.key === "Escape" && root.classList.contains("inv2-menu-open") && !root.querySelector(".inv2-dialog-wrap")) toggleMenu(false); });
    root.querySelector(".inv2-menu").addEventListener("click", () => toggleMenu());
    root.querySelector("[data-inv2-scrim]").addEventListener("click", () => toggleMenu(false));
    root.querySelector("[data-inv2-search]").addEventListener("keydown", ev => {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      const q = ev.currentTarget.value.trim();
      if (VIEWS.products) { show("products", { query: q }); } else toast("Search becomes available when products are added.");
    });
    root.querySelector("[data-inv2-alerts]").addEventListener("click", () => toast("No inventory alerts."));
    root.querySelector("[data-inv2-help]").addEventListener("click", () => toast("Inventory 2.0 is being set up in stages. Your Inventory V1 data is not affected."));
    window.addEventListener("online", () => { if (isOpen()) loadContext(); });
    window.addEventListener("offline", () => { if (isOpen()) { S.offline = true; paintIdentity(); } });
  }

  function toggleMenu(force) {
    // Phone and tablet: the menu opens over the page. Computer: the sidebar folds to icons.
    const narrow = window.matchMedia(RAIL).matches;
    const cls = narrow ? "inv2-menu-open" : "inv2-collapsed";
    const on = typeof force === "boolean" ? (narrow ? force : !force) : !S.root.classList.contains(cls);
    S.root.classList.toggle(cls, on);
    S.root.querySelector(".inv2-menu")?.setAttribute("aria-expanded", String(narrow ? on : !on));
  }

  function paintIdentity() {
    if (!S.root) return;
    const c = S.ctx || {};
    S.root.querySelector("[data-inv2-business]").textContent = c.business_name || "";
    S.root.querySelector("[data-inv2-user]").textContent = [c.user_name, c.is_owner ? "Owner" : (c.team_title || "Team member")].filter(Boolean).join(" · ");
    S.root.querySelector("[data-inv2-offline]").hidden = !S.offline;
  }

  function toast(msg) {
    if (typeof showEntryConfirmation === "function") { try { showEntryConfirmation(msg, "info"); return; } catch (_) {} }
    alert(msg);
  }

  function show(view, opts = {}) {
    if (!S.root) return;
    if (!NAV.some(n => n.key === view)) view = "dashboard";
    if ((view !== S.view || opts.query) && S.dirty && !opts.force && !confirm("Leave this screen and discard unsaved changes?")) return;
    S.dirty = false;
    S.view = view;
    S.root.querySelectorAll("[data-inv2-view]").forEach(b => { const on = b.dataset.inv2View === view; b.classList.toggle("active", on); if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    S.root.querySelectorAll("[data-inv2-tab]").forEach(b => { const on = b.dataset.inv2Tab === view; b.classList.toggle("active", on); if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    const content = S.root.querySelector("[data-inv2-content]");
    content.scrollTop = 0;
    const custom = VIEWS[view];
    if (custom && typeof custom.render === "function") {
      content.innerHTML = "";
      try { const r = custom.render(content, { ...opts, ctx: S.ctx, offline: S.offline }); if (r && r.catch) r.catch(e => showError(content, e)); }
      catch (e) { showError(content, e); }
      return;
    }
    content.innerHTML = view === "dashboard" ? dashboardHtml() : sectionHtml(view);
    if (view === "dashboard") { try { VIEWS["dashboard:after"]?.render?.(content, { ctx: S.ctx, offline: S.offline }); } catch (_) {} }
  }

  function showError(content, e) {
    console.error(e);
    content.insertAdjacentHTML("afterbegin", `<div class="inv2-alert inv2-alert-error" role="alert"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> ${esc(e?.message || e)}</div>`);
  }

  const kpi = (label, icon, tone, hint) => `
    <article class="inv2-kpi inv2-tone-${tone}">
      <span class="inv2-kpi-icon" aria-hidden="true"><i class="fa-solid ${icon}"></i></span>
      <div><span class="inv2-kpi-label">${esc(label)}</span><strong class="inv2-kpi-value">—</strong><span class="inv2-kpi-hint">${esc(hint)}</span></div>
    </article>`;

  function dashboardHtml() {
    return `
      <div class="inv2-setup-banner" role="status">
        <i class="fa-solid fa-person-digging" aria-hidden="true"></i>
        <div><strong>Inventory 2.0 is being set up.</strong> Products and stock arrive in the next update, then the POS. Figures appear here from your own sales — nothing below is sample data. Your Inventory V1 records are not affected.</div>
      </div>
      <section class="inv2-kpis" aria-label="Today at a glance">
        ${kpi("Today's Sales", "fa-bag-shopping", "blue", "No sales yet")}
        ${kpi("Total Orders", "fa-file-lines", "violet", "No orders yet")}
        ${kpi("Total Products", "fa-cube", "green", "No products yet")}
        ${kpi("Total Customers", "fa-users", "orange", "No customers yet")}
      </section>
      <div class="inv2-dash-grid">
        <div class="inv2-dash-col">
        <section class="inv2-card inv2-pos-preview" aria-labelledby="inv2PosTitle">
          <div class="inv2-card-head"><h2 id="inv2PosTitle">POS Terminal</h2></div>
          <label class="inv2-scan"><input type="text" placeholder="Scan barcode or search product…" disabled aria-label="Scan barcode or search product"><i class="fa-solid fa-barcode" aria-hidden="true"></i></label>
          <div class="inv2-table-head" aria-hidden="true"><span>Product</span><span>Price</span><span>Qty</span><span>Total</span></div>
          <div class="inv2-empty"><i class="fa-solid fa-cart-shopping" aria-hidden="true"></i><p>The cart is empty.</p><small>Quick sales open here once products are registered.</small></div>
          <div class="inv2-pos-foot"><span>Total Amount</span><strong>—</strong></div>
          <div class="inv2-pos-actions"><button type="button" class="inv2-btn" disabled><i class="fa-solid fa-pause" aria-hidden="true"></i> Hold Order</button><button type="button" class="inv2-btn" disabled><i class="fa-solid fa-tag" aria-hidden="true"></i> Discount</button><button type="button" class="inv2-btn primary" disabled><i class="fa-solid fa-bag-shopping" aria-hidden="true"></i> Pay Now</button></div>
        </section>
        <section class="inv2-card inv2-summary" aria-labelledby="inv2SumTitle">
          <div class="inv2-card-head"><h2 id="inv2SumTitle">Inventory Summary</h2></div>
          <div class="inv2-summary-grid">
            <div class="inv2-sum inv2-tone-blue"><strong>—</strong><span>Total Products</span></div>
            <div class="inv2-sum inv2-tone-orange"><strong>—</strong><span>Low Stock</span></div>
            <div class="inv2-sum inv2-tone-red"><strong>—</strong><span>Out of Stock</span></div>
            <div class="inv2-sum inv2-tone-green"><strong>—</strong><span>Inventory Value</span></div>
          </div>
        </section>
        </div>
        <div class="inv2-dash-col">
        <section class="inv2-card" aria-labelledby="inv2SalesTitle">
          <div class="inv2-card-head"><h2 id="inv2SalesTitle">Sales Overview</h2><select class="inv2-mini-select" disabled aria-label="Period"><option>This week</option></select></div>
          <div class="inv2-empty inv2-chart-empty"><i class="fa-solid fa-chart-line" aria-hidden="true"></i><p>No sales to chart yet.</p></div>
        </section>
        <section class="inv2-card" aria-labelledby="inv2TopTitle">
          <div class="inv2-card-head"><h2 id="inv2TopTitle">Top Products</h2></div>
          <div class="inv2-empty"><i class="fa-solid fa-ranking-star" aria-hidden="true"></i><p>Best sellers appear after the first sales.</p></div>
        </section>
        </div>

      </div>`;
  }

  function sectionHtml(view) {
    const n = NAV.find(x => x.key === view);
    const [what, phase] = PLANNED[view] || ["", ""];
    return `
      <div class="inv2-section-head"><h1><i class="fa-solid ${n.icon}" aria-hidden="true"></i> ${esc(n.label)}</h1></div>
      <section class="inv2-card inv2-coming">
        <div class="inv2-empty"><i class="fa-solid ${n.icon}" aria-hidden="true"></i>
          <p>${esc(what)}</p>
          <small>Arrives with update ${esc(String(phase))} of the Inventory 2.0 rollout.</small>
        </div>
      </section>`;
  }

  function onAccessChanged(a) { if (isOpen() && !(a && a.v2_enabled)) close({ force: true }); }

  function register(key, view) { VIEWS[key] = view; }
  function onReady(fn) { readyHook = fn; }
  function root() { return S.root; }
  function current() { return S.view; }
  function context() { return S.ctx; }
  function isOffline() { return S.offline; }

  window.TriplemInventoryV2Shell = { open, close, isOpen, show, onAccessChanged, setDirty: v => { S.dirty = !!v; }, register, onReady, root, current, context, isOffline, toast, esc };
})();
