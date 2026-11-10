/* Triplem VIP Inventory 2.0 - Phase 3 core: data access, local cache, setup, dashboard
 * figures, settings (locations, units, categories, stock policy), icons and dialogs.
 *
 * Server functions (migration 217) are the authority for every change. The small
 * bootstrap (settings, locations, categories, brands, units) is cached per business so
 * the app opens quickly; it is refreshed once per opening and after each change.
 * No polling.
 */
(function () {
  "use strict";
  const Shell = () => window.TriplemInventoryV2Shell;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const st = () => (typeof state !== "undefined" ? state : null);
  const ownerKey = () => { const u = st()?.sessionUser; return u ? (u.team_owner_id || u.id) : "anon"; };
  const CACHE = "triplem-inv2-boot-v1";
  const LOC_KEY = "triplem-inv2-location-v1";

  const D = { boot: null, icons: null, location: "", summary: null };

  // ---- server --------------------------------------------------------------------------------
  // These functions return a JSON list. The shared RPC helper turns a one-item list into the item itself,
  // so the list is restored here (otherwise a single product or movement would look like "nothing").
  const LIST_RPCS = new Set(["app_inv2_pos_items", "app_inv2_movements"]);
  async function rpc(name, args = {}) {
    if (typeof supabaseRpc !== "function") throw new Error("Not connected");
    const r = await supabaseRpc(name, args, { offlineCache: false });
    if (LIST_RPCS.has(name)) return Array.isArray(r) ? r : (r && typeof r === "object" ? [r] : []);
    return r;
  }
  const opId = () => (crypto?.randomUUID ? crypto.randomUUID() : `op-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`);

  function readCache() { try { return JSON.parse(localStorage.getItem(CACHE) || "{}")[ownerKey()] || null; } catch (_) { return null; } }
  function writeCache(b) { try { const all = JSON.parse(localStorage.getItem(CACHE) || "{}"); all[ownerKey()] = b; localStorage.setItem(CACHE, JSON.stringify(all)); } catch (_) {} }

  async function loadBoot(force = false) {
    if (D.boot && !force) return D.boot;
    if (!D.boot) D.boot = readCache();
    if (navigator.onLine === false) return D.boot;
    D.boot = await rpc("app_inv2_bootstrap");
    writeCache(D.boot);
    try { D.location = JSON.parse(localStorage.getItem(LOC_KEY) || "{}")[ownerKey()] || ""; } catch (_) { D.location = ""; }
    if (D.location && !(D.boot.locations || []).some(l => l.id === D.location && l.is_active)) D.location = "";
    paintOutlets();
    return D.boot;
  }
  function setBoot(b) { D.boot = b; writeCache(b); paintOutlets(); }

  const settings = () => D.boot?.settings || null;
  const currency = () => settings()?.currency || preferredCurrency();
  // The user's allowed currencies (Admin > Edit > currencies); Bitcoin is not a shop currency.
  function allowedCurrencies() {
    let list = [];
    try { list = typeof getAllowedCurrencies === "function" ? getAllowedCurrencies() : []; } catch (_) {}
    if (!list.length) { const c = st()?.sessionUser?.settings?.Currency; list = Array.isArray(c) ? c : (c ? [c] : []); }
    list = [...new Set(list.map(c => String(c).toUpperCase()))].filter(c => c && c !== "BTC" && c !== "ALL");
    return list.length ? list : ["AED"];
  }
  function preferredCurrency() {
    const list = allowedCurrencies();
    let page = "";
    try { page = typeof getPageCurrencySelection === "function" ? String(getPageCurrencySelection() || "").toUpperCase() : ""; } catch (_) {}
    return list.includes(page) ? page : (list.includes("AED") ? "AED" : list[0]);
  }
  const activeLocations = () => (D.boot?.locations || []).filter(l => l.is_active);
  const location = () => D.location;
  const canEdit = () => !!D.boot?.can_edit;
  const canDelete = () => !!D.boot?.can_delete;
  const isOwner = () => !!D.boot?.is_owner;

  function setLocation(id) {
    D.location = id || "";
    try { const all = JSON.parse(localStorage.getItem(LOC_KEY) || "{}"); all[ownerKey()] = D.location; localStorage.setItem(LOC_KEY, JSON.stringify(all)); } catch (_) {}
  }

  function paintOutlets() {
    const sel = Shell()?.root()?.querySelector("[data-inv2-outlet]");
    if (!sel) return;
    const locs = activeLocations();
    sel.innerHTML = `<option value="">All locations</option>` + locs.map(l => `<option value="${esc(l.id)}">${esc(l.name)}${l.kind === "warehouse" ? " (warehouse)" : ""}</option>`).join("");
    sel.value = D.location;
    sel.disabled = locs.length === 0;
    if (!sel.dataset.bound) {
      sel.dataset.bound = "1";
      sel.addEventListener("change", () => { setLocation(sel.value); D.summary = null; Shell()?.show(Shell().current(), { force: true }); });
    }
  }

  // ---- formatting ------------------------------------------------------------------------------
  function money(v, cur = currency()) {
    const n = Number(v || 0);
    try { return new Intl.NumberFormat(undefined, { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(n); }
    catch (_) { return `${cur} ${n.toFixed(2)}`; }
  }
  const qty = v => { const n = Number(v || 0); return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, "").replace(/\.$/, ""); };
  const dateTime = v => { try { return new Date(v).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); } catch (_) { return String(v || ""); } };

  // ---- icons -------------------------------------------------------------------------------------
  async function icons() {
    if (D.icons) return D.icons;
    const res = await fetch("Assets/inventory-v2/icons/icon-manifest.json", { cache: "force-cache" });
    D.icons = await res.json();
    return D.icons;
  }
  function iconFile(id) {
    const m = /^([a-z]+)\/([a-z0-9-]+)$/.exec(String(id || ""));
    return m ? `Assets/inventory-v2/icons/categories/${m[1]}/${m[2]}.svg` : "Assets/inventory-v2/icons/categories/general/package.svg";
  }
  function iconHtml(id, cls = "") {
    // The url is written directly on the element (not through a CSS variable) so it resolves against
    // the page, not against the stylesheet folder.
    const u = esc(iconFile(id));
    return `<span class="inv2-ico ${cls}" style="-webkit-mask-image:url('${u}');mask-image:url('${u}')" aria-hidden="true"></span>`;
  }

  // ---- dialogs ---------------------------------------------------------------------------------
  // Opens a sheet inside the Inventory 2.0 app. Returns {el, close}. onSubmit(form) may throw.
  function dialog({ title, subtitle = "", body, submitLabel = "Save", wide = false, onSubmit, onOpen, danger = false }) {
    const host = Shell().root();
    const wrap = document.createElement("div");
    wrap.className = "inv2-dialog-wrap";
    wrap.innerHTML = `
      <div class="inv2-dialog-backdrop" data-close></div>
      <form class="inv2-dialog${wide ? " wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="inv2DlgTitle" novalidate>
        <header class="inv2-dialog-head"><div><h2 id="inv2DlgTitle">${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ""}</div>
          <button type="button" class="inv2-icon-btn" data-close aria-label="Close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></header>
        <div class="inv2-dialog-body">${body}</div>
        <p class="inv2-form-error" role="alert" data-error></p>
        <footer class="inv2-dialog-foot">
          <button type="button" class="inv2-btn" data-close>Cancel</button>
          ${onSubmit ? `<button type="submit" class="inv2-btn ${danger ? "danger" : "primary"}" data-submit>${esc(submitLabel)}</button>` : ""}
        </footer>
      </form>`;
    host.appendChild(wrap);
    const form = wrap.querySelector("form");
    let dirty = false;
    form.addEventListener("input", () => { dirty = true; });
    const close = (force = false) => {
      if (!force && dirty && onSubmit && !confirm("Discard the changes in this form?")) return;
      wrap.remove(); Shell().setDirty(false);
    };
    wrap.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => close()));
    wrap.addEventListener("keydown", e => { if (e.key === "Escape") { e.preventDefault(); close(); } });
    form.addEventListener("submit", async e => {
      e.preventDefault();
      if (!onSubmit) return;
      const btn = form.querySelector("[data-submit]"); const err = form.querySelector("[data-error]");
      err.textContent = ""; btn.disabled = true; btn.classList.add("busy");
      try { await onSubmit(form); close(true); }
      catch (ex) { err.textContent = ex?.message || String(ex); }
      finally { btn.disabled = false; btn.classList.remove("busy"); }
    });
    if (onOpen) onOpen(form, { close });
    // Focus the first field on computers; on touch screens the keyboard would cover the sheet.
    setTimeout(() => { if (window.matchMedia("(pointer: fine)").matches) form.querySelector("input:not([type=hidden]):not([disabled]), select, textarea")?.focus(); else form.querySelector("[data-close]")?.focus({ preventScroll: true }); }, 30);
    return { el: form, close };
  }

  async function iconPicker(current) {
    const lib = await icons();
    return new Promise(resolve => {
      let chosen = current || "";
      const cats = Object.entries(lib.categories);
      const grid = list => list.map(it => `<button type="button" class="inv2-icon-cell${it.id === chosen ? " active" : ""}" data-icon="${esc(it.id)}" title="${esc(it.label)}" aria-label="${esc(it.label)}">${iconHtml(it.id)}</button>`).join("");
      const all = cats.flatMap(([, c]) => c.icons);
      const d = dialog({
        title: "Choose an icon", subtitle: `${lib.count} icons included with Triplem VIP · works offline`, wide: true, submitLabel: "Use icon",
        body: `<div class="inv2-icon-tools"><input type="search" class="inv2-input" placeholder="Search icons (milk, phone, shirt…)" data-q aria-label="Search icons">
          <select class="inv2-input" data-cat aria-label="Icon category"><option value="">All categories</option>${cats.map(([k, c]) => `<option value="${esc(k)}">${esc(c.label)}</option>`).join("")}</select></div>
          <div class="inv2-icon-grid" data-grid>${grid(all)}</div>`,
        onOpen(form) {
          const g = form.querySelector("[data-grid]"), q = form.querySelector("[data-q]"), c = form.querySelector("[data-cat]");
          const filter = () => {
            const t = q.value.trim().toLowerCase(), k = c.value;
            g.innerHTML = grid((k ? lib.categories[k].icons : all).filter(it => !t || it.label.toLowerCase().includes(t) || it.tags.some(x => x.includes(t))));
          };
          q.addEventListener("input", filter); c.addEventListener("change", filter);
          g.addEventListener("click", e => { const b = e.target.closest("[data-icon]"); if (!b) return; chosen = b.dataset.icon; g.querySelectorAll(".active").forEach(x => x.classList.remove("active")); b.classList.add("active"); });
          g.addEventListener("dblclick", e => { if (e.target.closest("[data-icon]")) form.requestSubmit(); });
        },
        async onSubmit() { resolve(chosen); }
      });
      d.el.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => resolve(null)));
    });
  }

  // ---- setup -------------------------------------------------------------------------------------
  const BUSINESS_TYPES = [["general", "General retail"], ["grocery", "Grocery / supermarket"], ["electronics", "Electronics"], ["smartphones", "Mobile phones"],
    ["computers", "Computers & laptops"], ["perfumes", "Perfumes"], ["cosmetics", "Cosmetics"], ["fashion", "Clothing & fashion"], ["footwear", "Footwear"],
    ["hardware", "Hardware"], ["stationery", "Stationery"], ["automotive", "Auto parts"], ["furniture", "Furniture"], ["wholesale", "Wholesale / distribution"], ["other", "Other"]];

  function currencyOptions(sel) {
    return allowedCurrencies().map(c => `<option value="${esc(c)}"${c === sel ? " selected" : ""}>${esc(c)}</option>`).join("");
  }

  function renderSetup(el) {
    if (!isOwner()) {
      el.innerHTML = `<section class="inv2-card inv2-coming"><div class="inv2-empty"><i class="fa-solid fa-store" aria-hidden="true"></i><p>Inventory 2.0 has not been set up for this business yet.</p><small>Ask the business owner to open Inventory 2.0 once to complete the short setup.</small></div></section>`;
      return;
    }
    const cur = preferredCurrency();
    el.innerHTML = `
      <section class="inv2-card inv2-setup">
        <div class="inv2-setup-hero"><span class="inv2-setup-badge"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i></span>
          <div><h1>Set up Inventory 2.0</h1><p>Three quick choices. You can change the business type and add more outlets or warehouses later.</p></div></div>
        <form class="inv2-form-grid" data-setup novalidate>
          <label class="inv2-field">Type of business<select class="inv2-input" name="business_type">${BUSINESS_TYPES.map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select><small>Only used to suggest sensible settings; every product type stays available.</small></label>
          <label class="inv2-field">Currency<select class="inv2-input" name="currency">${currencyOptions(cur)}</select><small>Prices and stock value are kept in this currency.</small></label>
          <label class="inv2-field wide">First outlet name<input class="inv2-input" name="location" maxlength="80" value="Main outlet" required></label>
          <p class="inv2-form-error wide" data-error role="alert"></p>
          <div class="wide inv2-form-actions"><button type="submit" class="inv2-btn primary"><i class="fa-solid fa-check" aria-hidden="true"></i> Start using Inventory 2.0</button></div>
        </form>
      </section>`;
    const form = el.querySelector("[data-setup]");
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const btn = form.querySelector("button[type=submit]"); btn.disabled = true;
      try {
        setBoot(await rpc("app_inv2_setup", { p_business_type: form.business_type.value, p_currency: form.currency.value, p_location_name: form.location.value.trim() }));
        Shell().toast("Inventory 2.0 is ready. Add your first product.");
        Shell().show("products", { force: true });
      } catch (ex) { form.querySelector("[data-error]").textContent = ex.message || String(ex); btn.disabled = false; }
    });
  }

  // Sections that need setup first call this; returns true when it rendered the setup screen.
  function needsSetup(el) {
    if (settings()) return false;
    renderSetup(el);
    return true;
  }

  // ---- dashboard figures ------------------------------------------------------------------------
  async function enhanceDashboard(el) {
    if (!settings()) {
      // First visit by the owner: go straight to the short setup.
      if (isOwner() && D.boot) { renderSetup(el); return; }
      const banner = el.querySelector(".inv2-setup-banner div");
      if (banner && isOwner()) banner.innerHTML = `<strong>Welcome to Inventory 2.0.</strong> Complete the short setup to start adding products. <button type="button" class="inv2-link" data-go-setup>Set up now</button>`;
      el.querySelector("[data-go-setup]")?.addEventListener("click", () => Shell().show("settings", { force: true }));
      return;
    }
    try {
      const s = D.summary && D.summary.loc === D.location ? D.summary : { loc: D.location, ...(await rpc("app_inv2_stock_summary", { p_location_id: D.location || null })) };
      D.summary = s;
      const tiles = el.querySelectorAll(".inv2-summary-grid .inv2-sum strong");
      if (tiles.length === 4) { tiles[0].textContent = String(s.products); tiles[1].textContent = String(s.low); tiles[2].textContent = String(s.out); tiles[3].textContent = money(s.value); }
      const kpis = el.querySelectorAll(".inv2-kpi");
      if (kpis[2]) { kpis[2].querySelector(".inv2-kpi-value").textContent = String(s.products); kpis[2].querySelector(".inv2-kpi-hint").textContent = s.products ? `${s.low} low · ${s.out} out of stock` : "No products yet"; }
      const banner = el.querySelector(".inv2-setup-banner div");
      if (banner) banner.innerHTML = `<strong>Products and stock are live.</strong> Sales, customers and the POS arrive in the next updates; the sales figures stay empty until then. Your Inventory V1 records are not affected.`;
      if (s.expiring_30d) el.querySelector(".inv2-summary")?.insertAdjacentHTML("beforeend", `<p class="inv2-note"><i class="fa-solid fa-hourglass-half" aria-hidden="true"></i> ${s.expiring_30d} batch${s.expiring_30d === 1 ? "" : "es"} expire within 30 days.</p>`);
    } catch (e) { /* figures stay "—" when offline */ }
  }

  // ---- settings ------------------------------------------------------------------------------
  async function renderSettings(el) {
    await loadBoot();
    if (needsSetup(el)) return;
    const s = settings();
    const owner = isOwner();
    const locs = D.boot.locations || [];
    el.innerHTML = `
      <div class="inv2-section-head"><h1><i class="fa-solid fa-gear" aria-hidden="true"></i> Settings</h1></div>
      <div class="inv2-settings-grid">
        <section class="inv2-card">
          <div class="inv2-card-head"><h2>Business</h2></div>
          <form class="inv2-form-grid" data-biz novalidate>
            <label class="inv2-field">Type of business<select class="inv2-input" name="business_type"${owner ? "" : " disabled"}>${BUSINESS_TYPES.map(([k, v]) => `<option value="${k}"${k === s.business_type ? " selected" : ""}>${esc(v)}</option>`).join("")}</select></label>
            <label class="inv2-field">Currency<input class="inv2-input" value="${esc(s.currency)}" disabled><small>Fixed after setup.</small></label>
            <label class="inv2-field">Costing method<input class="inv2-input" value="Moving weighted average" disabled><small>FIFO will be offered in a later update.</small></label>
            <label class="inv2-field">Default location<select class="inv2-input" name="default_location_id"${owner ? "" : " disabled"}>${locs.filter(l => l.is_active).map(l => `<option value="${esc(l.id)}"${l.id === s.default_location_id ? " selected" : ""}>${esc(l.name)}</option>`).join("")}</select></label>
            <label class="inv2-field">When stock would go below zero<select class="inv2-input" name="negative_stock_policy"${owner ? "" : " disabled"}>
              <option value="warn"${s.negative_stock_policy === "warn" ? " selected" : ""}>Warn the cashier</option>
              <option value="block"${s.negative_stock_policy === "block" ? " selected" : ""}>Block the sale</option>
              <option value="allow"${s.negative_stock_policy === "allow" ? " selected" : ""}>Allow and report</option></select><small>Applies to sales (POS update).</small></label>
            <label class="inv2-field">Offline sales<select class="inv2-input" name="offline_sale_policy"${owner ? "" : " disabled"}>
              <option value="allow"${s.offline_sale_policy === "allow" ? " selected" : ""}>Allow and report shortfalls</option>
              <option value="block"${s.offline_sale_policy === "block" ? " selected" : ""}>Block when known stock is too low</option></select></label>
            ${owner ? `<div class="wide inv2-form-actions"><button type="submit" class="inv2-btn primary">Save business settings</button></div>` : `<p class="inv2-note wide">Only the business owner can change these.</p>`}
          </form>
        </section>
        <section class="inv2-card">
          <div class="inv2-card-head"><h2>Outlets &amp; warehouses</h2>${canEdit() ? `<button type="button" class="inv2-btn small" data-add-loc><i class="fa-solid fa-plus" aria-hidden="true"></i> Add</button>` : ""}</div>
          <ul class="inv2-list">${locs.map(l => `<li class="${l.is_active ? "" : "muted"}"><span class="inv2-list-icon"><i class="fa-solid ${l.kind === "warehouse" ? "fa-warehouse" : "fa-store"}" aria-hidden="true"></i></span>
            <div><strong>${esc(l.name)}</strong><small>${l.kind === "warehouse" ? "Warehouse" : "Outlet"}${l.id === s.default_location_id ? " · default" : ""}${l.is_active ? "" : " · closed"}${l.code ? ` · ${esc(l.code)}` : ""}</small></div>
            ${canEdit() ? `<button type="button" class="inv2-icon-btn small" data-edit-loc="${esc(l.id)}" aria-label="Edit ${esc(l.name)}"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>` : ""}</li>`).join("")}</ul>
        </section>
        <section class="inv2-card">
          <div class="inv2-card-head"><h2>Categories</h2>${canEdit() ? `<button type="button" class="inv2-btn small" data-add-cat><i class="fa-solid fa-plus" aria-hidden="true"></i> Add</button>` : ""}</div>
          ${(D.boot.categories || []).length ? `<ul class="inv2-list">${D.boot.categories.map(c => `<li class="${c.is_active ? "" : "muted"}"><span class="inv2-list-icon">${iconHtml(c.icon_id || "general/category")}</span><div><strong>${esc(c.name)}</strong><small>${c.products} product${c.products === 1 ? "" : "s"}${c.is_active ? "" : " · hidden"}</small></div>
            ${canEdit() ? `<button type="button" class="inv2-icon-btn small" data-edit-cat="${esc(c.id)}" aria-label="Edit ${esc(c.name)}"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>` : ""}</li>`).join("")}</ul>` : `<p class="inv2-note">Categories are created as you add products, or add them here.</p>`}
        </section>
        <section class="inv2-card">
          <div class="inv2-card-head"><h2>Units</h2>${canEdit() ? `<button type="button" class="inv2-btn small" data-add-unit><i class="fa-solid fa-plus" aria-hidden="true"></i> Add</button>` : ""}</div>
          <div class="inv2-chips">${(D.boot.units || []).map(u => `<span class="inv2-chip" title="${esc(u.name)}">${esc(u.code)} <small>${esc(u.name)}${u.allow_decimal ? " · decimals" : ""}</small></span>`).join("")}</div>
          <p class="inv2-note">Pack, box and carton sizes are set per product (for example 1 carton = 12 pieces).</p>
        </section>
      </div>`;
    el.querySelector("[data-biz]")?.addEventListener("submit", async e => {
      e.preventDefault(); const f = e.currentTarget; const b = f.querySelector("button[type=submit]"); b.disabled = true;
      try { setBoot(await rpc("app_inv2_settings_save", { p_settings: { business_type: f.business_type.value, default_location_id: f.default_location_id.value, negative_stock_policy: f.negative_stock_policy.value, offline_sale_policy: f.offline_sale_policy.value } })); Shell().toast("Settings saved."); }
      catch (ex) { Shell().toast(ex.message || String(ex)); }
      finally { b.disabled = false; }
    });
    el.querySelector("[data-add-loc]")?.addEventListener("click", () => locationDialog(null, el));
    el.querySelectorAll("[data-edit-loc]").forEach(b => b.addEventListener("click", () => locationDialog(locs.find(l => l.id === b.dataset.editLoc), el)));
    el.querySelector("[data-add-cat]")?.addEventListener("click", () => categoryDialog(null, el));
    el.querySelectorAll("[data-edit-cat]").forEach(b => b.addEventListener("click", () => categoryDialog(D.boot.categories.find(c => c.id === b.dataset.editCat), el)));
    el.querySelector("[data-add-unit]")?.addEventListener("click", () => unitDialog(el));
    // Receipts, team rules and the Accounting link (phase 5) add their own cards.
    try { window.TriplemInv2SettingsSales?.render(el, { rerender: () => renderSettings(el) }); } catch (e) { console.error(e); }
  }

  function locationDialog(loc, el) {
    dialog({
      title: loc ? "Edit location" : "Add outlet or warehouse",
      body: `<div class="inv2-form-grid">
        <label class="inv2-field wide">Name<input class="inv2-input" name="name" maxlength="80" required value="${esc(loc?.name || "")}"></label>
        <label class="inv2-field">Type<select class="inv2-input" name="kind"><option value="outlet"${loc?.kind !== "warehouse" ? " selected" : ""}>Outlet (shop)</option><option value="warehouse"${loc?.kind === "warehouse" ? " selected" : ""}>Warehouse</option></select></label>
        <label class="inv2-field">Short code<input class="inv2-input" name="code" maxlength="12" value="${esc(loc?.code || "")}" placeholder="Optional"></label>
        <label class="inv2-field wide">Address<input class="inv2-input" name="address" maxlength="200" value="${esc(loc?.address || "")}" placeholder="Optional"></label>
        ${loc ? `<label class="inv2-check wide"><input type="checkbox" name="active"${loc.is_active ? " checked" : ""}> Open (untick to close a location that holds no stock)</label>` : ""}</div>`,
      async onSubmit(f) {
        if (!f.name.value.trim()) throw new Error("Enter a name.");
        await rpc("app_inv2_location_save", { p_id: loc?.id || null, p_name: f.name.value.trim(), p_kind: f.kind.value, p_code: f.code.value, p_address: f.address.value, p_is_active: loc ? f.active.checked : true });
        await loadBoot(true); renderSettings(el);
      }
    });
  }

  function categoryDialog(cat, el) {
    let icon = cat?.icon_id || "";
    dialog({
      title: cat ? "Edit category" : "Add category",
      body: `<div class="inv2-form-grid">
        <label class="inv2-field wide">Name<input class="inv2-input" name="name" maxlength="80" required value="${esc(cat?.name || "")}"></label>
        <div class="inv2-field wide">Icon<div class="inv2-icon-pick"><span data-preview>${iconHtml(icon || "general/category", "lg")}</span><button type="button" class="inv2-btn small" data-pick>Choose icon</button></div></div>
        ${cat ? `<label class="inv2-check wide"><input type="checkbox" name="active"${cat.is_active ? " checked" : ""}> Show this category</label>` : ""}</div>`,
      onOpen(f) { f.querySelector("[data-pick]").addEventListener("click", async () => { const r = await iconPicker(icon); if (r) { icon = r; f.querySelector("[data-preview]").innerHTML = iconHtml(icon, "lg"); } }); },
      async onSubmit(f) {
        if (!f.name.value.trim()) throw new Error("Enter a name.");
        await rpc("app_inv2_category_save", { p_id: cat?.id || null, p_name: f.name.value.trim(), p_icon_id: icon || null, p_parent_id: null, p_is_active: cat ? f.active.checked : true });
        await loadBoot(true); renderSettings(el);
      }
    });
  }

  function unitDialog(el) {
    dialog({
      title: "Add unit",
      body: `<div class="inv2-form-grid">
        <label class="inv2-field">Code<input class="inv2-input" name="code" maxlength="16" required placeholder="e.g. roll"></label>
        <label class="inv2-field">Name<input class="inv2-input" name="name" maxlength="40" required placeholder="e.g. Roll"></label>
        <label class="inv2-check wide"><input type="checkbox" name="dec"> Allow decimal quantities (for weight, length or volume)</label></div>`,
      async onSubmit(f) {
        if (!f.code.value.trim() || !f.name.value.trim()) throw new Error("Enter a code and a name.");
        await rpc("app_inv2_unit_save", { p_id: null, p_code: f.code.value.trim(), p_name: f.name.value.trim(), p_allow_decimal: f.dec.checked });
        await loadBoot(true); renderSettings(el);
      }
    });
  }

  // ---- wiring ---------------------------------------------------------------------------------
  function init() {
    const sh = Shell();
    if (!sh) return;
    sh.onReady(async () => { try { await loadBoot(true); } catch (e) { if (!D.boot) throw e; } });
    sh.register("settings", { render: renderSettings });
    sh.register("dashboard:after", { render: el => { enhanceDashboard(el); } });
  }

  window.TriplemInv2 = {
    rpc, opId, loadBoot, setBoot, settings, currency, activeLocations, location, setLocation, canEdit, canDelete, isOwner,
    money, qty, dateTime, esc, icons, iconHtml, iconFile, iconPicker, dialog, needsSetup, invalidateSummary: () => { D.summary = null; },
    boot: () => D.boot
  };
  if (window.TriplemInventoryV2Shell) init(); else document.addEventListener("DOMContentLoaded", init);
})();
