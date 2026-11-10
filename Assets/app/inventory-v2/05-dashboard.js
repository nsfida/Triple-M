/* Triplem VIP Inventory 2.0 - Phase 4: Dashboard (sales figures added in phase 5).
 *
 * One read-only server call per opening (app_inv2_dashboard, migration 218) for the
 * selected outlet or all locations. The last figures are kept on this device per
 * business and location, so the dashboard still shows something useful offline,
 * clearly marked with the time it was taken. No polling: figures refresh when the
 * dashboard is opened, the location changes or the Refresh button is pressed.
 */
(function () {
  "use strict";
  const I = () => window.TriplemInv2;
  const Shell = () => window.TriplemInventoryV2Shell;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const CACHE = "triplem-inv2-dash-v1";
  const MOVE = {
    opening: ["Opening stock", "in"], adjust_in: ["Stock added", "in"], adjust_out: ["Stock removed", "out"], damage: ["Damaged", "out"], expired: ["Expired", "out"],
    count: ["Stock count", ""], transfer_in: ["Transfer in", "move"], transfer_out: ["Transfer out", "move"], purchase: ["Purchase received", "in"],
    purchase_return: ["Purchase return", "out"], sale: ["Sale", "out"], sale_return: ["Sale return", "in"], reserve: ["Reserved", ""], release: ["Released", ""]
  };

  const ownerKey = () => { const u = (typeof state !== "undefined" ? state : null)?.sessionUser; return u ? (u.team_owner_id || u.id) : "anon"; };
  const cacheKey = () => `${ownerKey()}|${I().location() || "all"}`;
  function readCache() { try { return JSON.parse(localStorage.getItem(CACHE) || "{}")[cacheKey()] || null; } catch (_) { return null; } }
  function writeCache(d) {
    try {
      const all = JSON.parse(localStorage.getItem(CACHE) || "{}");
      all[cacheKey()] = { at: Date.now(), d };
      // Keep only the most recent few entries.
      const keys = Object.keys(all).sort((a, b) => (all[b].at || 0) - (all[a].at || 0));
      keys.slice(12).forEach(k => delete all[k]);
      localStorage.setItem(CACHE, JSON.stringify(all));
    } catch (_) {}
  }

  const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };
  const relDay = iso => {
    const d = new Date(iso), now = new Date();
    const days = Math.round((new Date(now.toDateString()) - new Date(d.toDateString())) / 86400000);
    const t = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    return days === 0 ? `Today ${t}` : days === 1 ? `Yesterday ${t}` : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  };

  // ---- render --------------------------------------------------------------------------------------
  async function render(el, opts = {}) {
    await I().loadBoot();
    if (I().needsSetup(el)) return;
    const loc = I().activeLocations().find(l => l.id === I().location());
    const ctx = Shell().context() || {};
    const firstName = String(ctx.user_name || "").split(" ")[0];
    el.innerHTML = `
      <div class="inv2-dash-head">
        <div><h1>${esc(greeting())}${firstName ? `, ${esc(firstName)}` : ""}</h1>
          <p>${esc(new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }))} · <span data-scope>${esc(loc ? loc.name : "All locations")}</span> <span class="inv2-stale" data-stale hidden></span></p></div>
        <div class="inv2-actions">
          <button type="button" class="inv2-btn" data-refresh title="Refresh figures"><i class="fa-solid fa-rotate" aria-hidden="true"></i><span class="inv2-hide-sm"> Refresh</span></button>
          ${I().canEdit() ? `<button type="button" class="inv2-btn primary" data-new-product><i class="fa-solid fa-plus" aria-hidden="true"></i> Add product</button>` : ""}
        </div>
      </div>
      ${I().canEdit() ? `<nav class="inv2-quick" aria-label="Quick actions">
        <button type="button" data-quick-view="pos"><span class="inv2-quick-ico tone-blue"><i class="fa-solid fa-cash-register" aria-hidden="true"></i></span><span><strong>New sale</strong><small>Open the POS</small></span></button>
        <button type="button" data-quick-view="purchases"><span class="inv2-quick-ico tone-violet"><i class="fa-solid fa-dolly" aria-hidden="true"></i></span><span><strong>Receive goods</strong><small>From a supplier</small></span></button>
        <button type="button" data-quick="add"><span class="inv2-quick-ico tone-green"><i class="fa-solid fa-arrow-down" aria-hidden="true"></i></span><span><strong>Add stock</strong><small>Receive items</small></span></button>
        <button type="button" data-quick="count"><span class="inv2-quick-ico tone-blue"><i class="fa-solid fa-clipboard-check" aria-hidden="true"></i></span><span><strong>Stock count</strong><small>Scan and count</small></span></button>
        <button type="button" data-quick="transfer"${I().activeLocations().length < 2 ? " disabled" : ""}><span class="inv2-quick-ico tone-violet"><i class="fa-solid fa-right-left" aria-hidden="true"></i></span><span><strong>Transfer</strong><small>${I().activeLocations().length < 2 ? "Needs 2 locations" : "Between locations"}</small></span></button>
        <button type="button" data-quick="damage"><span class="inv2-quick-ico tone-orange"><i class="fa-solid fa-heart-crack" aria-hidden="true"></i></span><span><strong>Damaged</strong><small>Write off items</small></span></button>
      </nav>` : ""}
      <div data-body><div class="inv2-loading" role="status"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Loading figures…</div></div>`;

    el.querySelector("[data-refresh]")?.addEventListener("click", () => load(el, true));
    el.querySelector("[data-new-product]")?.addEventListener("click", () => window.TriplemInv2Products?.openEditor(null, null));
    el.querySelectorAll("[data-quick]").forEach(b => b.addEventListener("click", () => window.TriplemInv2Stock?.openOperation(b.dataset.quick, [], el)));
    el.querySelectorAll("[data-quick-view]").forEach(b => b.addEventListener("click", () => {
      if (b.dataset.quickView === "purchases" && window.TriplemInv2Purchases) { window.TriplemInv2Purchases.editor("receive", () => load(el, false)); return; }
      Shell().show(b.dataset.quickView);
    }));
    const cached = readCache();
    if (cached) paint(el, cached.d, cached.at);
    await load(el, false, cached);
  }

  async function load(el, manual, cached) {
    const btn = el.querySelector("[data-refresh]");
    if (btn) btn.disabled = true;
    try {
      if (navigator.onLine === false) throw Object.assign(new Error("offline"), { offline: true });
      const d = await I().rpc("app_inv2_dashboard", { p_location_id: I().location() || null });
      writeCache(d);
      if (el.isConnected) paint(el, d, 0);
      if (manual) Shell().toast("Figures updated.");
    } catch (e) {
      if (!el.isConnected) return;
      const c = cached || readCache();
      if (c) paint(el, c.d, c.at);
      else el.querySelector("[data-body]").innerHTML = `<section class="inv2-card"><div class="inv2-empty"><i class="fa-solid fa-wifi" aria-hidden="true"></i><p>${e.offline ? "You are offline." : esc(e.message || e)}</p><small>The figures appear when the connection is back.</small></div></section>`;
    } finally { if (btn) btn.disabled = false; }
  }

  function paint(el, d, cachedAt) {
    const body = el.querySelector("[data-body]");
    if (!body) return;
    const stale = el.querySelector("[data-stale]");
    if (stale) { stale.hidden = !cachedAt; stale.textContent = cachedAt ? `· Saved figures from ${relDay(new Date(cachedAt).toISOString())}` : ""; }
    const s = d.summary || {}, c = d.counts || {};
    const money = v => I().money(v), qty = v => I().qty(v);
    const kpi = (label, value, icon, tone, hint, view) => `
      <${view ? "button type=\"button\"" : "div"} class="inv2-kpi inv2-tone-${tone}${view ? "" : " is-static"}"${view ? ` data-go="${view}"` : ""}>
        <span class="inv2-kpi-icon" aria-hidden="true"><i class="fa-solid ${icon}"></i></span>
        <span class="inv2-kpi-text"><span class="inv2-kpi-label">${esc(label)}</span><strong class="inv2-kpi-value">${esc(String(value))}</strong><span class="inv2-kpi-hint">${esc(hint)}</span></span>
      </${view ? "button" : "div"}>`;
    const empty = !s.products;
    const sa = d.sales || null;
    const salesRow = sa ? `<section class="inv2-kpis inv2-kpis-5" aria-label="Sales at a glance">
        ${kpi("Today's sales", money(sa.today), "fa-bag-shopping", "blue", `${sa.today_count} sale${sa.today_count === 1 ? "" : "s"}${sa.held ? ` · ${sa.held} held` : ""}`, "orders")}
        ${kpi("This month", money(sa.month), "fa-chart-line", "violet", "Sales less returns", "orders")}
        ${kpi("Gross profit (month)", money(sa.month_profit), "fa-sack-dollar", Number(sa.month_profit) < 0 ? "red" : "green", "Sales excl. tax − cost of goods", "")}
        ${kpi("Customers owe you", money(sa.receivable), "fa-hand-holding-dollar", Number(sa.receivable) ? "orange" : "slate", `${sa.customers} customer${sa.customers === 1 ? "" : "s"}`, "outstanding")}
        ${kpi("You owe suppliers", money(sa.payable), "fa-file-invoice-dollar", Number(sa.payable) ? "orange" : "slate", "Unpaid supplier bills", "outstanding")}
      </section>` : "";
    body.innerHTML = `${salesRow}
      <section class="inv2-kpis inv2-kpis-6" aria-label="Stock at a glance">
        ${kpi("Stock value", money(s.value), "fa-coins", "green", `${qty(c.units_on_hand)} units on hand`, "stock")}
        ${kpi("Products", s.products ?? 0, "fa-cube", "blue", `${c.categories ?? 0} categor${c.categories === 1 ? "y" : "ies"} · ${c.locations ?? 0} location${c.locations === 1 ? "" : "s"}`, "products")}
        ${kpi("Low stock", s.low ?? 0, "fa-arrow-trend-down", s.low ? "orange" : "slate", s.low ? "At or below the low-stock level" : "Nothing running low", "stock:low")}
        ${kpi("Out of stock", s.out ?? 0, "fa-ban", s.out ? "red" : "slate", s.out ? "Cannot be sold until restocked" : "Everything is available", "stock:out")}
        ${kpi("Expiring in 30 days", s.expiring_30d ?? 0, "fa-hourglass-half", s.expiring_30d ? "orange" : "slate", "Batches still in stock", "")}
        ${kpi("Serial / IMEI in stock", c.serials_in_stock ?? 0, "fa-barcode", "violet", "Individually tracked units", "")}
      </section>
      ${empty ? `<section class="inv2-card inv2-welcome"><div class="inv2-empty"><i class="fa-solid fa-box-open" aria-hidden="true"></i><p><strong>No products yet.</strong></p><small>Add your first product with its barcode and opening stock; the dashboard fills in from there.</small>
        ${I().canEdit() ? `<button type="button" class="inv2-btn primary" data-new-product2><i class="fa-solid fa-plus" aria-hidden="true"></i> Add your first product</button>` : ""}</div></section>` : ""}
      <div class="inv2-dash-grid">
        <div class="inv2-dash-col">
          ${sa ? `<section class="inv2-card" aria-labelledby="inv2SalesTitle">
            <div class="inv2-card-head"><h2 id="inv2SalesTitle">Sales</h2><span class="inv2-legend">last 14 days</span></div>
            ${salesChart(sa.by_day || [])}
          </section>` : ""}
          <section class="inv2-card" aria-labelledby="inv2ActTitle">
            <div class="inv2-card-head"><h2 id="inv2ActTitle">Stock in and out</h2><span class="inv2-legend"><i class="in"></i> In <i class="out"></i> Out · last 14 days</span></div>
            ${chart(d.activity || [])}
          </section>
          <section class="inv2-card" aria-labelledby="inv2RecentTitle">
            <div class="inv2-card-head"><h2 id="inv2RecentTitle">Recent activity</h2><button type="button" class="inv2-link" data-go="stock">Open stock</button></div>
            ${(d.recent || []).length ? `<ul class="inv2-feed">${d.recent.map(m => { const [label, dir] = MOVE[m.movement_type] || [m.movement_type, ""]; return `
              <li><span class="inv2-feed-dot ${dir}" aria-hidden="true"></span>
                <span class="inv2-ico-tile sm">${I().iconHtml(m.icon_id || "general/package")}</span>
                <span class="inv2-feed-main"><strong>${esc(m.name)}${m.variant_name ? ` <small>${esc(m.variant_name)}</small>` : ""}</strong><small>${esc(label)} · ${esc(m.location_name)}${m.user_name ? ` · ${esc(m.user_name)}` : ""}</small></span>
                <span class="inv2-feed-side"><strong class="${m.qty > 0 ? "in" : "out"}">${m.qty > 0 ? "+" : "−"}${qty(Math.abs(m.qty))}</strong><small>${esc(relDay(m.created_at))}</small></span></li>`; }).join("")}</ul>`
              : `<div class="inv2-empty"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i><p>No stock activity yet.</p></div>`}
          </section>
        </div>
        <div class="inv2-dash-col">
          <section class="inv2-card" aria-labelledby="inv2AttnTitle">
            <div class="inv2-card-head"><h2 id="inv2AttnTitle">Needs attention</h2>${(d.low_stock || []).length ? `<span class="inv2-count">${d.low_stock.length}</span>` : ""}</div>
            ${(d.low_stock || []).length ? `<ul class="inv2-attn">${d.low_stock.map((r, i) => `
              <li><span class="inv2-ico-tile sm">${I().iconHtml(r.icon_id || "general/package")}</span>
                <span class="inv2-feed-main"><strong>${esc(r.name)}${r.variant_name ? ` <small>${esc(r.variant_name)}</small>` : ""}</strong><small>${Number(r.qty) <= 0 ? "Out of stock" : `${qty(r.qty)} left · low at ${qty(r.min_stock)}`}</small></span>
                <span class="inv2-badge ${Number(r.qty) <= 0 ? "bad" : "warn"}">${Number(r.qty) <= 0 ? "Out" : "Low"}</span>
                ${I().canEdit() ? `<button type="button" class="inv2-icon-btn small" data-restock="${i}" title="Add stock" aria-label="Add stock for ${esc(r.name)}"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>` : ""}</li>`).join("")}</ul>`
              : `<div class="inv2-empty inv2-empty-ok"><i class="fa-solid fa-circle-check" aria-hidden="true"></i><p>All stock levels are fine.</p></div>`}
          </section>
          ${(d.expiring || []).length ? `<section class="inv2-card" aria-labelledby="inv2ExpTitle">
            <div class="inv2-card-head"><h2 id="inv2ExpTitle">Expiring soon</h2><span class="inv2-muted">next 60 days</span></div>
            <ul class="inv2-attn">${d.expiring.map(b => `<li><span class="inv2-ico-tile sm">${I().iconHtml(b.icon_id || "general/package")}</span>
              <span class="inv2-feed-main"><strong>${esc(b.name)}${b.variant_name ? ` <small>${esc(b.variant_name)}</small>` : ""}</strong><small>Batch ${esc(b.batch_no)} · ${qty(b.qty)} in stock</small></span>
              <span class="inv2-badge ${b.days_left < 0 ? "bad" : b.days_left <= 30 ? "warn" : "info"}">${b.days_left < 0 ? "Expired" : b.days_left === 0 ? "Today" : `${b.days_left} day${b.days_left === 1 ? "" : "s"}`}</span></li>`).join("")}</ul>
          </section>` : ""}
          <section class="inv2-card" aria-labelledby="inv2LocTitle">
            <div class="inv2-card-head"><h2 id="inv2LocTitle">Value by location</h2></div>
            ${bars((d.by_location || []).map(l => ({ label: l.name, sub: l.kind === "warehouse" ? "Warehouse" : "Outlet", value: Number(l.value), text: money(l.value), icon: l.kind === "warehouse" ? "fa-warehouse" : "fa-store" })))}
          </section>
          <section class="inv2-card" aria-labelledby="inv2CatTitle">
            <div class="inv2-card-head"><h2 id="inv2CatTitle">Value by category</h2></div>
            ${bars((d.by_category || []).map(x => ({ label: x.name, sub: `${x.products} product${x.products === 1 ? "" : "s"}`, value: Number(x.value), text: money(x.value), ico: x.icon_id || "general/category" })))}
          </section>
          ${sa ? `<section class="inv2-card" aria-labelledby="inv2TopTitle">
            <div class="inv2-card-head"><h2 id="inv2TopTitle">Best sellers</h2><span class="inv2-muted">last 30 days</span></div>
            ${bars((sa.top || []).map(x => ({ label: x.name + (x.variant_name ? ` · ${x.variant_name}` : ""), sub: `${qty(x.qty)} sold`, value: Number(x.amount), text: money(x.amount), ico: x.icon_id || "general/package" })))}
          </section>` : ""}
        </div>
      </div>`;

    body.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => {
      const [view, status] = b.dataset.go.split(":");
      Shell().show(view, { force: true, status });
    }));
    body.querySelector("[data-new-product2]")?.addEventListener("click", () => window.TriplemInv2Products?.openEditor(null, null));
    body.querySelectorAll("[data-restock]").forEach(b => b.addEventListener("click", () => {
      const r = d.low_stock[Number(b.dataset.restock)];
      window.TriplemInv2Stock?.openOperation("add", [{ variant_id: r.variant_id, name: r.name, variant_name: r.variant_name, tracking: r.tracking || "none", unit_code: r.unit_code, icon_id: r.icon_id, cost: r.cost_price, qty: "" }], el);
    }));
  }

  function salesChart(rows) {
    if (!rows.some(r => Number(r.total))) return `<div class="inv2-empty inv2-chart-empty"><i class="fa-solid fa-chart-line" aria-hidden="true"></i><p>No sales in the last 14 days.</p></div>`;
    const W = 560, H = 170, padB = 22, padT = 8, n = rows.length, slot = W / n, bw = Math.max(6, slot * 0.56);
    const max = Math.max(1, ...rows.map(r => Math.abs(Number(r.total) || 0)));
    const y = v => H - padB - (Math.max(v, 0) / max) * (H - padB - padT);
    const sum = rows.reduce((a, r) => a + Number(r.total || 0), 0);
    return `<div class="inv2-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Sales of ${esc(I().money(sum))} over the last 14 days" preserveAspectRatio="none">
      <line class="axis" x1="0" x2="${W}" y1="${H - padB}" y2="${H - padB}"/>${rows.map((r, i) => { const v = Number(r.total) || 0, x = i * slot + (slot - bw) / 2, dd = new Date(String(r.day).slice(0, 10) + "T00:00:00");
        return `<g><title>${esc(dd.toLocaleDateString(undefined, { day: "numeric", month: "short" }))}: ${esc(I().money(v))}</title>${v > 0 ? `<rect class="bar-sale" x="${x.toFixed(1)}" y="${y(v).toFixed(1)}" width="${bw.toFixed(1)}" height="${(H - padB - y(v)).toFixed(1)}" rx="3"/>` : ""}
        ${i % 2 === (n - 1) % 2 ? `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(dd.toLocaleDateString(undefined, { day: "numeric" }))}</text>` : ""}</g>`; }).join("")}</svg>
      <div class="inv2-chart-totals"><span>${esc(I().money(sum))} in 14 days</span></div></div>`;
  }

  // Simple bar chart (inline SVG, colours from the theme).
  function chart(rows) {
    if (!rows.length || !rows.some(r => Number(r.in) || Number(r.out))) {
      return `<div class="inv2-empty inv2-chart-empty"><i class="fa-solid fa-chart-column" aria-hidden="true"></i><p>No stock movements in the last 14 days.</p></div>`;
    }
    const W = 560, H = 170, padB = 22, padT = 8, n = rows.length, slot = W / n, bw = Math.max(4, slot / 2 - 3);
    const max = Math.max(1, ...rows.map(r => Math.max(Number(r.in) || 0, Number(r.out) || 0)));
    const y = v => H - padB - (v / max) * (H - padB - padT);
    const day = iso => new Date(`${iso}T00:00:00`);
    const totalIn = rows.reduce((a, r) => a + Number(r.in || 0), 0), totalOut = rows.reduce((a, r) => a + Number(r.out || 0), 0);
    const bars = rows.map((r, i) => {
      const x = i * slot + slot / 2, vi = Number(r.in) || 0, vo = Number(r.out) || 0, d = day(String(r.day).slice(0, 10));
      const label = d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
      return `<g><title>${esc(label)}: ${I().qty(vi)} in, ${I().qty(vo)} out</title>
        ${vi ? `<rect class="bar-in" x="${(x - bw - 1).toFixed(1)}" y="${y(vi).toFixed(1)}" width="${bw.toFixed(1)}" height="${(H - padB - y(vi)).toFixed(1)}" rx="3"/>` : ""}
        ${vo ? `<rect class="bar-out" x="${(x + 1).toFixed(1)}" y="${y(vo).toFixed(1)}" width="${bw.toFixed(1)}" height="${(H - padB - y(vo)).toFixed(1)}" rx="3"/>` : ""}
        ${i % 2 === (n - 1) % 2 ? `<text x="${x.toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(d.toLocaleDateString(undefined, { day: "numeric" }))}</text>` : ""}</g>`;
    }).join("");
    return `<div class="inv2-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Stock in ${esc(I().qty(totalIn))} units and out ${esc(I().qty(totalOut))} units over the last 14 days" preserveAspectRatio="none">
      <line class="axis" x1="0" x2="${W}" y1="${H - padB}" y2="${H - padB}"/>${bars}</svg>
      <div class="inv2-chart-totals"><span><i class="in"></i> ${esc(I().qty(totalIn))} in</span><span><i class="out"></i> ${esc(I().qty(totalOut))} out</span></div></div>`;
  }

  function bars(items) {
    if (!items.length || !items.some(x => x.value > 0)) return `<div class="inv2-empty"><p>No stock value yet.</p></div>`;
    const max = Math.max(...items.map(x => x.value), 1);
    return `<ul class="inv2-bars">${items.map(x => `<li>
      <span class="inv2-bars-label">${x.ico ? `<span class="inv2-ico-tile xs">${I().iconHtml(x.ico)}</span>` : `<span class="inv2-ico-tile xs"><i class="fa-solid ${x.icon}" aria-hidden="true"></i></span>`}<span><strong>${esc(x.label)}</strong><small>${esc(x.sub)}</small></span></span>
      <span class="inv2-bars-track" aria-hidden="true"><span style="width:${Math.max(2, Math.round(x.value / max * 100))}%"></span></span>
      <strong class="inv2-bars-value">${esc(x.text)}</strong></li>`).join("")}</ul>`;
  }

  function init() { Shell()?.register("dashboard", { render }); }
  window.TriplemInv2Dashboard = { render };
  if (window.TriplemInventoryV2Shell) init(); else document.addEventListener("DOMContentLoaded", init);
})();
