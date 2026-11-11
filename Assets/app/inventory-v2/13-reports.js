/* Triplem VIP Inventory 2.0 - Phase 8: Reports.
 *
 * Every figure is calculated on the server (app_inv2_report) from completed documents and the
 * stock ledger, so a report always agrees with the sales, the stock screen and Accounting.
 * Reports only read. Team members see sales and quantities; cost, profit and stock value are
 * shown to the owner, and to the team only when the owner allows it.
 *
 * Each report can be printed (A4, through the same print path as invoices) or exported as a
 * CSV file that opens in Excel with Arabic text intact.
 */
(function () {
  "use strict";
  const I = () => window.TriplemInv2;
  const Shell = () => window.TriplemInventoryV2Shell;
  const Pr = () => window.TriplemInv2Print;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // [key, label, type]; type: text | money | qty | int | pct | date | days | rate
  const C = {
    period: ["period", "Date", "date"], invoices: ["invoices", "Sales", "int"], sales: ["sales", "Sales value", "money"],
    returns: ["returns", "Returns", "money"], discounts: ["discounts", "Discounts", "money"], net: ["net", "Net (excl. tax)", "money"],
    tax: ["tax", "Tax", "money"], total: ["total", "Total (incl. tax)", "money"], cost: ["cost", "Cost", "money"],
    profit: ["profit", "Profit", "money"], margin: ["margin_pct", "Margin", "pct"], name: ["name", "Name", "text"], sku: ["sku", "SKU", "text"],
    qty_sold: ["qty_sold", "Sold", "qty"], qty_returned: ["qty_returned", "Returned", "qty"], qty_net: ["qty_net", "Net qty", "qty"],
    avg_sale: ["avg_sale", "Average sale", "money"], balance: ["balance", "Owes now", "money"], method: ["method", "Method", "method"],
    received: ["received", "Received", "money"], paid_out: ["paid_out", "Paid out", "money"], refunds: ["refunds", "Refunds", "money"],
    net_cash: ["net", "Net", "money"], rate: ["rate", "Tax rate", "rate"], sales_net: ["sales_net", "Sales (excl. tax)", "money"],
    output_tax: ["output_tax", "Tax collected", "money"], purchases_net: ["purchases_net", "Purchases (excl. tax)", "money"],
    input_tax: ["input_tax", "Tax paid", "money"], net_tax: ["net_tax", "Tax payable", "money"], bills: ["bills", "Bills", "int"],
    purchases: ["purchases", "Purchases", "money"], paid: ["paid", "Paid in period", "money"], category: ["category", "Category", "text"],
    location: ["location", "Location", "text"], qty: ["qty", "Quantity", "qty"], avg_cost: ["avg_cost", "Average cost", "money"],
    value: ["value", "Stock value", "money"], sell_price: ["sell_price", "Price", "money"], retail_value: ["retail_value", "Retail value", "money"],
    opening: ["opening", "Opening", "qty"], purchased: ["purchased", "Bought", "qty"], sold: ["sold", "Sold", "qty"],
    transferred: ["transferred", "Transfers", "qty"], adjusted: ["adjusted", "Adjustments", "qty"], closing: ["closing", "Closing", "qty"],
    min_stock: ["min_stock", "Minimum", "qty"], shortfall: ["shortfall", "Short by", "qty"], est_cost: ["est_cost", "Cost to restock", "money"],
    batch_no: ["batch_no", "Batch", "text"], expiry_date: ["expiry_date", "Expires", "date"], days_left: ["days_left", "Days left", "days"],
    last_sold: ["last_sold", "Last sold", "date"], days_since: ["days_since", "Days since", "int"]
  };
  const R = {
    sales_summary: { label: "Sales summary", group: "Sales", icon: "fa-chart-line", range: true, by: true,
      cols: ["period", "invoices", "sales", "returns", "discounts", "net", "tax", "total", "cost", "profit", "margin"],
      tiles: [["total", "Total sales", "money"], ["net", "Net (excl. tax)", "money"], ["profit", "Profit", "money"], ["margin_pct", "Margin", "pct"], ["invoices", "Sales", "int"], ["avg_sale", "Average sale", "money"]],
      note: "Completed sales minus returns, by document date." },
    sales_by_product: { label: "By product", group: "Sales", icon: "fa-box-open", range: true,
      cols: ["name", "sku", "qty_sold", "qty_returned", "net", "tax", "cost", "profit", "margin"],
      tiles: [["net", "Net sales", "money"], ["profit", "Profit", "money"], ["qty_net", "Units sold", "qty"], ["items", "Products", "int"]] },
    sales_by_category: { label: "By category", group: "Sales", icon: "fa-layer-group", range: true,
      cols: ["name", "qty_sold", "qty_returned", "net", "tax", "cost", "profit", "margin"],
      tiles: [["net", "Net sales", "money"], ["profit", "Profit", "money"], ["items", "Categories", "int"]] },
    sales_by_customer: { label: "By customer", group: "Sales", icon: "fa-user-group", range: true,
      cols: ["name", "invoices", "sales", "returns", "net", "profit", "avg_sale", "balance"],
      tiles: [["total", "Total sales", "money"], ["profit", "Profit", "money"], ["items", "Customers", "int"]] },
    sales_by_staff: { label: "By staff", group: "Sales", icon: "fa-id-badge", range: true,
      cols: ["name", "invoices", "sales", "returns", "net", "profit", "avg_sale"],
      tiles: [["total", "Total sales", "money"], ["invoices", "Sales", "int"], ["items", "People", "int"]] },
    payments: { label: "Payments", group: "Money", icon: "fa-money-bill-wave", range: true,
      cols: ["method", "received", "refunds", "paid_out", "net_cash"],
      tiles: [["received", "Received", "money"], ["paid_out", "Paid out", "money"], ["net", "Net", "money"]],
      note: "Money received from customers and paid to suppliers or refunded, by payment date." },
    tax: { label: "Tax summary", group: "Money", icon: "fa-percent", range: true,
      cols: ["rate", "sales_net", "output_tax", "purchases_net", "input_tax", "net_tax"],
      tiles: [["output_tax", "Tax collected", "money"], ["input_tax", "Tax paid", "money"], ["net_tax", "Tax payable", "money"]],
      note: "Tax on completed sales and supplier bills, less returns, by document date. A negative amount is reclaimable." },
    purchases_by_supplier: { label: "By supplier", group: "Purchases", icon: "fa-truck-ramp-box", range: true,
      cols: ["name", "bills", "net", "tax", "purchases", "returns", "paid", "balance"],
      tiles: [["total", "Purchases", "money"], ["paid", "Paid", "money"], ["items", "Suppliers", "int"]] },
    stock_valuation: { label: "Stock value", group: "Stock", icon: "fa-sack-dollar", asOf: true,
      cols: ["name", "sku", "category", "location", "qty", "avg_cost", "value", "sell_price", "retail_value"],
      tiles: [["value", "Stock value (cost)", "money"], ["retail_value", "Retail value", "money"], ["qty", "Units", "qty"], ["items", "Lines", "int"]],
      note: "Quantity on the chosen date times the average cost at that time." },
    stock_movement: { label: "Stock movement", group: "Stock", icon: "fa-right-left", range: true,
      cols: ["name", "sku", "opening", "purchased", "sold", "transferred", "adjusted", "closing"],
      tiles: [["opening", "Opening units", "qty"], ["qty_in", "In", "qty"], ["qty_out", "Out", "qty"], ["closing", "Closing units", "qty"]],
      note: "Units in and out by type. Opening plus every movement equals closing." },
    low_stock: { label: "Low stock", group: "Stock", icon: "fa-triangle-exclamation", now: true,
      cols: ["name", "sku", "location", "qty", "min_stock", "shortfall", "est_cost"],
      tiles: [["items", "Items", "int"], ["out_of_stock", "Out of stock", "int"], ["est_cost", "Cost to restock", "money"]] },
    expiry: { label: "Expiring soon", group: "Stock", icon: "fa-hourglass-half", now: true, days: [30, 60, 90, 180],
      cols: ["name", "batch_no", "expiry_date", "days_left", "location", "qty", "value"],
      tiles: [["items", "Batches", "int"], ["expired", "Already expired", "int"], ["qty", "Units", "qty"], ["value", "Value", "money"]] },
    dead_stock: { label: "Slow movers", group: "Stock", icon: "fa-snowflake", now: true, days: [30, 60, 90, 180, 365],
      cols: ["name", "sku", "location", "qty", "value", "last_sold", "days_since"],
      tiles: [["items", "Items", "int"], ["never_sold", "Never sold", "int"], ["value", "Value tied up", "money"]],
      note: "In stock but not sold at that location within the chosen number of days." }
  };
  const COST_KEYS = new Set(["cost", "profit", "margin_pct", "avg_cost", "value", "est_cost", "last_cost"]);
  const PRESETS = [["today", "Today"], ["yesterday", "Yesterday"], ["week", "This week"], ["month", "This month"], ["last_month", "Last month"], ["quarter", "This quarter"], ["year", "This year"], ["custom", "Custom"]];
  const S = { kind: "sales_summary", preset: "month", from: "", to: "", asOf: "", by: "day", days: 60, loc: "", data: null, sort: null, busy: 0 };

  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  function range(preset) {
    const t = new Date(); t.setHours(12, 0, 0, 0);
    const d = n => { const x = new Date(t); x.setDate(x.getDate() + n); return x; };
    switch (preset) {
      case "today": return [iso(t), iso(t)];
      case "yesterday": return [iso(d(-1)), iso(d(-1))];
      case "week": { const dow = (t.getDay() + 6) % 7; return [iso(d(-dow)), iso(t)]; }
      case "last_month": { const a = new Date(t.getFullYear(), t.getMonth() - 1, 1, 12), b = new Date(t.getFullYear(), t.getMonth(), 0, 12); return [iso(a), iso(b)]; }
      case "quarter": return [iso(new Date(t.getFullYear(), Math.floor(t.getMonth() / 3) * 3, 1, 12)), iso(t)];
      case "year": return [iso(new Date(t.getFullYear(), 0, 1, 12)), iso(t)];
      case "custom": return [S.from || iso(new Date(t.getFullYear(), t.getMonth(), 1, 12)), S.to || iso(t)];
      default: return [iso(new Date(t.getFullYear(), t.getMonth(), 1, 12)), iso(t)];
    }
  }
  const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (_) { return "UTC"; } };
  const dateTxt = v => { if (!v) return ""; try { return new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { dateStyle: "medium" }); } catch (_) { return String(v); } };
  const monthTxt = v => { try { return new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" }); } catch (_) { return String(v); } };
  function fmt(v, type, forCsv = false) {
    if (v === null || v === undefined || v === "") return forCsv ? "" : "—";
    switch (type) {
      case "money": return forCsv ? Number(v).toFixed(2) : I().money(v);
      case "qty": return forCsv ? String(Number(v)) : I().qty(v);
      case "int": return String(Math.round(Number(v)));
      case "pct": return forCsv ? String(v) : `${Number(v).toFixed(1)}%`;
      case "rate": return `${Number(v)}%`;
      case "date": return forCsv ? String(v).slice(0, 10) : (S.by === "month" && S.kind === "sales_summary" ? monthTxt(v) : dateTxt(v));
      case "days": return forCsv ? String(v) : (Number(v) < 0 ? `${-Number(v)} days ago` : Number(v) === 0 ? "Today" : `${Number(v)}`);
      case "method": return Pr()?.METHOD?.[v] || String(v);
      default: return String(v);
    }
  }
  const columns = (kind, d) => R[kind].cols.map(k => C[k]).filter(([key]) => !(d && d.costs_hidden && COST_KEYS.has(key)));
  const tiles = (kind, d) => R[kind].tiles.filter(([key]) => !(d && d.costs_hidden && COST_KEYS.has(key)));
  const numType = t => ["money", "qty", "int", "pct", "rate", "days"].includes(t);
  function periodText(d) {
    const r = R[d.kind];
    if (r.asOf) return `Stock on ${dateTxt(d.to)}`;
    if (r.now) return `As of today${r.days ? ` · ${d.totals?.days || S.days} days` : ""}`;
    return d.from === d.to ? dateTxt(d.from) : `${dateTxt(d.from)} – ${dateTxt(d.to)}`;
  }
  const locName = id => id ? ((I().activeLocations?.() || []).find(l => l.id === id)?.name || "") : "All locations";

  // ---- view ---------------------------------------------------------------------------------
  async function render(el) {
    await I().loadBoot();
    if (I().needsSetup(el)) return;
    if (S.loc === "" && I().location()) S.loc = I().location();
    const groups = [...new Set(Object.values(R).map(r => r.group))];
    const st = I().settings() || {};
    el.innerHTML = `
      <div class="inv2-section-head inv2-head-row"><h1><i class="fa-solid fa-chart-column" aria-hidden="true"></i> Reports</h1>
        <div class="inv2-head-actions"><button type="button" class="inv2-btn" data-csv><i class="fa-solid fa-file-csv" aria-hidden="true"></i> Export CSV</button>
        <button type="button" class="inv2-btn primary" data-print><i class="fa-solid fa-print" aria-hidden="true"></i> Print</button></div></div>
      <nav class="inv2-rep-picker" aria-label="Choose a report">${groups.map(g => `<div class="inv2-rep-group"><span>${esc(g)}</span><div>${Object.entries(R).filter(([, r]) => r.group === g).map(([k, r]) =>
        `<button type="button" class="inv2-chip" data-kind="${k}" aria-pressed="${S.kind === k}"><i class="fa-solid ${r.icon}" aria-hidden="true"></i> ${esc(r.label)}</button>`).join("")}</div></div>`).join("")}</nav>
      <div class="inv2-toolbar inv2-rep-filters" data-filters></div>
      <div class="inv2-rep-tiles" data-tiles></div>
      <section class="inv2-card inv2-table-card"><div data-out><div class="inv2-loading"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Loading…</div></div></section>
      ${I().isOwner() ? `<label class="inv2-check inv2-rep-perm"><input type="checkbox" data-staffcost${st.staff_view_costs ? " checked" : ""}> Team members can see costs, profit and stock value in reports</label>` : ""}`;
    el.querySelectorAll("[data-kind]").forEach(b => b.addEventListener("click", () => {
      S.kind = b.dataset.kind; S.sort = null;
      el.querySelectorAll("[data-kind]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
      if (R[S.kind].days && !R[S.kind].days.includes(S.days)) S.days = S.kind === "dead_stock" ? 90 : 60;
      filters(el); run(el);
    }));
    el.querySelector("[data-print]").addEventListener("click", () => printReport());
    el.querySelector("[data-csv]").addEventListener("click", () => exportCsv());
    el.querySelector("[data-staffcost]")?.addEventListener("change", async e => {
      try { const r = await I().rpc("app_inv2_report_settings_save", { p: { staff_view_costs: e.target.checked } }); I().settings().staff_view_costs = !!r.staff_view_costs;
        Shell().toast(r.staff_view_costs ? "Team members can now see costs and profit." : "Costs and profit are hidden from team members."); }
      catch (err) { e.target.checked = !e.target.checked; Shell().toast(err.message || String(err)); }
    });
    filters(el);
    await run(el);
  }

  function filters(el) {
    const r = R[S.kind], box = el.querySelector("[data-filters]");
    const [f, t] = range(S.preset);
    const locs = I().activeLocations?.() || [];
    box.innerHTML = `
      ${r.range ? `<label class="inv2-field-inline"><span>Period</span><select class="inv2-input" data-preset>${PRESETS.map(([k, v]) => `<option value="${k}"${S.preset === k ? " selected" : ""}>${v}</option>`).join("")}</select></label>
        <label class="inv2-field-inline"><span>From</span><input class="inv2-input" type="date" data-from value="${f}"${S.preset === "custom" ? "" : " disabled"}></label>
        <label class="inv2-field-inline"><span>To</span><input class="inv2-input" type="date" data-to value="${t}"${S.preset === "custom" ? "" : " disabled"}></label>` : ""}
      ${r.asOf ? `<label class="inv2-field-inline"><span>Stock on</span><input class="inv2-input" type="date" data-asof value="${S.asOf || iso(new Date())}" max="${iso(new Date())}"></label>` : ""}
      ${r.by ? `<div class="inv2-seg" role="group" aria-label="Group by">${[["day", "Daily"], ["month", "Monthly"]].map(([k, v]) => `<button type="button" data-by="${k}" aria-pressed="${S.by === k}">${v}</button>`).join("")}</div>` : ""}
      ${r.days ? `<label class="inv2-field-inline"><span>${S.kind === "expiry" ? "Within" : "Not sold for"}</span><select class="inv2-input" data-days>${r.days.map(n => `<option value="${n}"${S.days === n ? " selected" : ""}>${n} days</option>`).join("")}</select></label>` : ""}
      ${locs.length > 1 ? `<label class="inv2-field-inline"><span>Location</span><select class="inv2-input" data-loc><option value="">All locations</option>${locs.map(l => `<option value="${esc(l.id)}"${S.loc === l.id ? " selected" : ""}>${esc(l.name)}</option>`).join("")}</select></label>` : ""}`;
    const again = () => run(el);
    box.querySelector("[data-preset]")?.addEventListener("change", e => { S.preset = e.target.value; if (S.preset === "custom") { const [a, b] = range("month"); S.from = S.from || a; S.to = S.to || b; } filters(el); again(); });
    box.querySelector("[data-from]")?.addEventListener("change", e => { S.from = e.target.value; again(); });
    box.querySelector("[data-to]")?.addEventListener("change", e => { S.to = e.target.value; again(); });
    box.querySelector("[data-asof]")?.addEventListener("change", e => { S.asOf = e.target.value; again(); });
    box.querySelectorAll("[data-by]").forEach(b => b.addEventListener("click", () => { S.by = b.dataset.by; box.querySelectorAll("[data-by]").forEach(x => x.setAttribute("aria-pressed", String(x === b))); again(); }));
    box.querySelector("[data-days]")?.addEventListener("change", e => { S.days = Number(e.target.value); again(); });
    box.querySelector("[data-loc]")?.addEventListener("change", e => { S.loc = e.target.value; again(); });
  }

  async function run(el) {
    const r = R[S.kind], out = el.querySelector("[data-out]"), tl = el.querySelector("[data-tiles]");
    const my = ++S.busy;
    let from = null, to = null;
    if (r.range) [from, to] = range(S.preset);
    if (r.asOf) to = S.asOf && S.asOf <= iso(new Date()) ? S.asOf : iso(new Date());
    if (r.range && from > to) { out.innerHTML = `<div class="inv2-alert inv2-alert-error">The start date is after the end date.</div>`; return; }
    out.setAttribute("aria-busy", "true");
    let d;
    try { d = await I().rpc("app_inv2_report", { p_kind: S.kind, p_from: from, p_to: to, p_location_id: S.loc || null, p_opts: { tz: tz(), group: S.by, days: S.days } }); }
    catch (e) { if (my === S.busy) { out.innerHTML = `<div class="inv2-alert inv2-alert-error">${esc(e.message || e)}</div>`; out.removeAttribute("aria-busy"); } return; }
    if (my !== S.busy) return;
    S.data = d;
    out.removeAttribute("aria-busy");
    tl.innerHTML = tiles(S.kind, d).map(([k, label, type]) => `<div class="inv2-rep-tile${k === "profit" && Number(d.totals[k]) < 0 || k === "net_tax" && Number(d.totals[k]) > 0 || k === "expired" && Number(d.totals[k]) > 0 || k === "out_of_stock" && Number(d.totals[k]) > 0 ? " warn" : ""}">
      <span>${esc(label)}</span><strong>${esc(fmt(d.totals[k], type))}</strong></div>`).join("");
    table(el);
  }

  function sorted(d) {
    const rows = d.rows.slice();
    if (!S.sort) return rows;
    const [key, dir, type] = S.sort;
    return rows.sort((a, b) => {
      const x = a[key], y = b[key];
      if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
      const c = numType(type) ? Number(x) - Number(y) : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: "base" });
      return dir * c;
    });
  }

  function table(el) {
    const d = S.data, r = R[S.kind], out = el.querySelector("[data-out]");
    const cols = columns(S.kind, d);
    const note = [r.note, d.costs_hidden ? "Cost and profit figures are visible to the business owner." : "", d.truncated ? "Showing the first 5,000 lines; narrow the period or location to see everything." : ""].filter(Boolean);
    if (!d.rows.length) {
      out.innerHTML = `<div class="inv2-rep-meta">${esc(periodText(d))} · ${esc(locName(d.location_id))}</div><div class="inv2-empty"><i class="fa-solid ${r.icon}" aria-hidden="true"></i><p>Nothing to show for this ${r.range ? "period" : "selection"}.</p></div>`;
      return;
    }
    const totals = d.totals || {};
    out.innerHTML = `<div class="inv2-rep-meta">${esc(periodText(d))} · ${esc(locName(d.location_id))}${note.length ? `<small>${note.map(esc).join(" ")}</small>` : ""}</div>
      <div class="inv2-rep-scroll" tabindex="0" role="region" aria-label="${esc(r.label)}"><table class="inv2-rep-table">
        <thead><tr>${cols.map(([k, label, type]) => `<th scope="col" class="${numType(type) ? "num" : ""}"><button type="button" data-sort="${k}" data-type="${type}" aria-sort="${S.sort && S.sort[0] === k ? (S.sort[1] > 0 ? "ascending" : "descending") : "none"}">${esc(label)}${S.sort && S.sort[0] === k ? ` <i class="fa-solid fa-arrow-${S.sort[1] > 0 ? "up" : "down"}" aria-hidden="true"></i>` : ""}</button></th>`).join("")}</tr></thead>
        <tbody>${sorted(d).map(row => `<tr>${cols.map(([k, , type], i) => `<td class="${numType(type) ? "num" : ""}${(k === "profit" || k === "net_tax" || k === "days_left" || k === "qty") && Number(row[k]) < 0 ? " neg" : ""}"${i === 0 ? ' dir="auto"' : ""}>${i === 0 && (k === "name") && row.sku && !cols.some(c => c[0] === "sku") ? `${esc(row.name)}<small>${esc(row.sku)}</small>` : esc(fmt(row[k], type))}</td>`).join("")}</tr>`).join("")}</tbody>
        <tfoot><tr>${cols.map(([k, , type], i) => `<td class="${numType(type) ? "num" : ""}">${i === 0 ? "Total" : k in totals && !["rate", "avg_cost", "sell_price", "min_stock", "days_left", "days_since", "avg_sale"].includes(k) ? esc(fmt(totals[k], type)) : ""}</td>`).join("")}</tr></tfoot>
      </table></div>`;
    out.querySelectorAll("[data-sort]").forEach(b => b.addEventListener("click", () => {
      const k = b.dataset.sort; S.sort = S.sort && S.sort[0] === k ? [k, -S.sort[1], b.dataset.type] : [k, numType(b.dataset.type) ? -1 : 1, b.dataset.type]; table(el);
    }));
  }

  // ---- print and export ---------------------------------------------------------------------
  function reportHtml(d = S.data) {
    const r = R[d.kind], cols = columns(d.kind, d), t = d.totals || {};
    const P = Pr();
    const sub = `<div><b>${esc(periodText(d))}</b></div><div>${esc(locName(d.location_id))}</div><div>Printed ${esc(new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }))}</div>`;
    const tl = tiles(d.kind, d).map(([k, label, type]) => `<div class="box"><h3>${esc(label)}</h3><b style="font-size:15px">${esc(fmt(t[k], type))}</b></div>`).join("");
    const inner = `${P.header(`${r.group === "Sales" && r.label.startsWith("By") ? `Sales ${r.label.toLowerCase()}` : r.label}`, sub)}
      <div style="display:grid;grid-template-columns:repeat(${Math.min(4, tiles(d.kind, d).length)},1fr);gap:10px;margin-bottom:14px">${tl}</div>
      <table><thead><tr>${cols.map(([, label, type]) => `<th class="${numType(type) ? "n" : ""}">${esc(label)}</th>`).join("")}</tr></thead>
      <tbody>${sorted(d).map(row => `<tr>${cols.map(([k, , type], i) => `<td class="${numType(type) ? "n" : ""}"${i === 0 ? ' dir="auto"' : ""}>${esc(fmt(row[k], type))}</td>`).join("")}</tr>`).join("")}</tbody>
      <tfoot><tr>${cols.map(([k, , type], i) => `<td class="${numType(type) ? "n" : ""}" style="font-weight:700;border-top:2px solid #334155">${i === 0 ? "Total" : k in t && !["rate", "avg_cost", "sell_price", "min_stock", "days_left", "days_since", "avg_sale"].includes(k) ? esc(fmt(t[k], type)) : ""}</td>`).join("")}</tr></tfoot></table>
      ${[r.note, d.costs_hidden ? "Cost and profit figures are visible to the business owner." : ""].filter(Boolean).map(n => `<div class="foot">${esc(n)}</div>`).join("")}`;
    let html = P.a4Shell(`${r.label} ${d.from || ""} ${d.to || ""}`, inner);
    if (cols.length > 7) html = html.replace("@page{size:A4;margin:14mm}", "@page{size:A4 landscape;margin:12mm}");
    return html;
  }
  function printReport() { if (!S.data) return; Pr().print(reportHtml()); }

  function csvText(d = S.data) {
    const cols = columns(d.kind, d), t = d.totals || {};
    const q = v => { const s = String(v ?? ""); return /[",\r\n]/.test(s) || /^[=+\-@]/.test(s) && !/^-?\d/.test(s) ? `"${(/^[=+\-@]/.test(s) && !/^-?\d/.test(s) ? "'" : "") + s.replace(/"/g, '""')}"` : s; };
    const lines = [
      [R[d.kind].label, periodText(d), locName(d.location_id)].map(q).join(","),
      cols.map(([, label]) => q(label)).join(","),
      ...sorted(d).map(row => cols.map(([k, , type]) => q(fmt(row[k], type, true))).join(",")),
      cols.map(([k, , type], i) => q(i === 0 ? "Total" : k in t && !["rate", "avg_cost", "sell_price", "min_stock", "days_left", "days_since", "avg_sale"].includes(k) ? fmt(t[k], type, true) : "")).join(",")
    ];
    return "\uFEFF" + lines.join("\r\n");
  }
  function exportCsv() {
    if (!S.data) return;
    const d = S.data;
    const name = `Triplem-Inventory-${R[d.kind].label.replace(/[^A-Za-z0-9]+/g, "-")}-${d.from && R[d.kind].range ? `${d.from}-to-` : ""}${d.to || iso(new Date())}.csv`;
    const url = URL.createObjectURL(new Blob([csvText(d)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = name; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    window.__inv2LastCsv = { name, text: csvText(d) };
  }

  function init() { Shell()?.register("reports", { render }); }
  window.TriplemInv2Reports = { reportHtml, csvText, kinds: () => Object.keys(R), state: S };
  if (window.TriplemInventoryV2Shell) init(); else document.addEventListener("DOMContentLoaded", init);
})();
