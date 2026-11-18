/* Triplem VIP · Expenses history v3 (2026-11-17)
 *
 * The "Expenses" records list shows every transaction directly (no per-item banners to open):
 *  - one row per transaction with its item name, category, wallet, time, note, amount and VAT,
 *    grouped under day headings with the day's total (or sorted by amount / item);
 *  - a summary for the selected dates (exact server totals), category chips to narrow the list;
 *  - skeleton rows while the records load;
 *  - Select mode: pick transactions (or all on screen) and download them as one PDF (detailed
 *    or summary) or as CSV;
 *  - search can cover all dates or only the selected dates.
 *
 * Opening a transaction shows it in the side panel (TriplemDetailPanels) — see openTx() below.
 *
 * The list reads exactly what the app already loaded (state.entries, the current date range,
 * wallet and search); saving, editing and deleting still use the app's own functions.
 */
(function initTriplemExpenseHistory(global){
  "use strict";

  const esc = v => (typeof escapeHtml === "function" ? escapeHtml(v) : String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const m = (n, cur) => { try { return money(num(n), cur); } catch (_) { return esc(`${cur || ""} ${num(n).toFixed(2)}`); } };
  const plainMoney = (n, cur) => `${cur ? cur + " " : ""}${num(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const iso = d => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
  const todayIso = () => iso(new Date());
  const dayStamp = s => { const t = Date.parse(String(s || "").slice(0, 10) + "T12:00:00"); return Number.isFinite(t) ? t : 0; };

  const S = {
    selecting: false,
    sel: new Map(),          // id -> tx (kept while the transaction is on screen)
    sort: "newest",          // newest | oldest | high | low | item
    type: "all",             // category filter (client side, loaded rows)
    list: [],                // last rendered (filtered + sorted) transactions
    byId: new Map(),
    bound: false,
    limit: 50,               // rows on screen; "Load more" adds 50 (no automatic loading)
    limitKey: "",
    full: []                 // all filtered + sorted rows that are loaded
  };
  const STEP = 50;
  // Receiving / Internal transfers (records view): own sort and paging.
  const R = { sort: "newest", limit: STEP, limitKey: "", list: [] };

  // Category colours: the same category always gets the same tone.
  const TONES = ["#2563eb", "#16a34a", "#d97706", "#db2777", "#7c3aed", "#0891b2", "#dc2626", "#4f46e5", "#0d9488", "#c2410c"];
  function toneFor(type){
    const t = String(type || "Other").toLowerCase();
    let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
    return TONES[h % TONES.length];
  }
  const iconFor = (type, name) => { try { return expenseTypeIconClass(`${type || ""} ${name || ""}`); } catch (_) { return "fa-receipt"; } };
  const walletLogo = name => { try { return getWalletCustomLogoMap().get(String(name || "").trim().toLowerCase()) || ""; } catch (_) { return ""; } };
  const walletIcon = (name, size) => { try { return getWalletIconHtml(name || "Wallet", size, walletLogo(name)); } catch (_) { return ""; } };
  const ref = id => { try { return expensePublicTransactionReference(id); } catch (_) { return ""; } };

  function dayLabel(date){
    const d = String(date || "").slice(0, 10);
    if (!d) return "No date";
    const t = todayIso();
    const y = iso(new Date(Date.now() - 86400000));
    let long = d;
    try { long = new Date(`${d}T12:00:00`).toLocaleDateString((global.TriplemI18n && global.TriplemI18n.lang !== "en" ? global.TriplemI18n.locale : undefined), { weekday: "short", day: "numeric", month: "short", year: "numeric" }); } catch (_) {}
    if (d === t) return `Today · ${long}`;
    if (d === y) return `Yesterday · ${long}`;
    return long;
  }
  function timeOf(tx){
    const c = tx.createdAt ? new Date(tx.createdAt) : null;
    if (!c || Number.isNaN(c.getTime())) return "";
    if (iso(c) !== String(tx.date || "").slice(0, 10)) return "";
    try { return c.toLocaleTimeString((global.TriplemI18n && global.TriplemI18n.lang !== "en" ? global.TriplemI18n.locale : undefined), { hour: "2-digit", minute: "2-digit" }); } catch (_) { return ""; }
  }

  // ── data ────────────────────────────────────────────────────────────────────────────────
  /** Flattens the app's grouped items into transactions (item name + currency on each). */
  function flatten(items){
    const out = [];
    for (const item of items || []) for (const tx of item.txs || []) {
      out.push({ ...tx, itemName: item.displayName || tx.itemName || "Expense", itemKey: item.key, currency: item.currency || tx.currency || "AED",
        expenseType: tx.expenseType || item.expenseType || "Other" });
    }
    return out;
  }
  function sorted(list){
    const by = {
      newest: (a, b) => (dayStamp(b.date) - dayStamp(a.date)) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")) || String(b.id).localeCompare(String(a.id)),
      oldest: (a, b) => (dayStamp(a.date) - dayStamp(b.date)) || String(a.createdAt || "").localeCompare(String(b.createdAt || "")),
      high: (a, b) => num(b.amount) - num(a.amount),
      low: (a, b) => num(a.amount) - num(b.amount),
      item: (a, b) => String(a.itemName).localeCompare(String(b.itemName)) || (dayStamp(b.date) - dayStamp(a.date))
    }[S.sort] || ((a, b) => 0);
    return list.slice().sort(by);
  }
  /** Exact totals for the whole date range (server item summaries), when they match the query. */
  function serverTotals(){
    try {
      const L = state.expenseLazy;
      if (!(typeof isExpenseLazyMode === "function" && isExpenseLazyMode()) || L.itemHistoryRpcAvailable !== true) return null;
      if (L.itemSummaryQueryKey !== expenseLazyActivityQueryKey()) return null;
      if (num(L.itemSummaryTotalPages) > 1) return null; // more than one page of items: not complete
      const rows = (L.itemSummaries || []).filter(s => String(s?.expense_type || "").toLowerCase() !== "transfer");
      const byCur = new Map(); const types = new Map(); let count = 0;
      for (const s of rows) {
        const c = s.currency || "AED";
        const t = byCur.get(c) || { total: 0, tax: 0, count: 0 };
        t.total += num(s.total_amount); t.tax += num(s.tax_total); t.count += num(s.transaction_count);
        byCur.set(c, t); count += num(s.transaction_count);
        const k = String(s.expense_type || "Other");
        const ty = types.get(k) || { count: 0, byCur: new Map() };
        ty.count += num(s.transaction_count); ty.byCur.set(c, num(ty.byCur.get(c)) + num(s.total_amount));
        types.set(k, ty);
      }
      return { byCur, types, count, exact: true };
    } catch (_) { return null; }
  }
  function localTotals(list){
    const byCur = new Map(); const types = new Map();
    for (const tx of list) {
      if (tx.auditStatus) continue;
      const c = tx.currency || "AED";
      const t = byCur.get(c) || { total: 0, tax: 0, count: 0 };
      t.total += num(tx.amount); t.tax += num(tx.taxAmount); t.count += 1; byCur.set(c, t);
      const k = String(tx.expenseType || "Other");
      const ty = types.get(k) || { count: 0, byCur: new Map() };
      ty.count += 1; ty.byCur.set(c, num(ty.byCur.get(c)) + num(tx.amount)); types.set(k, ty);
    }
    return { byCur, types, count: [...byCur.values()].reduce((s, t) => s + t.count, 0), exact: false };
  }

  /**
   * Deleted transactions of the whole dates arrive at once, the others page by page. A deleted
   * transaction is shown only once the transactions around its date are loaded, so it sits in
   * its own place (its day, between the others) instead of all of them piling up at the bottom.
   */
  function placeInactive(list, ctx){
    if (!ctx.hasMore) return list;
    let oldest = Infinity;
    for (const t of list) if (!t.auditStatus) oldest = Math.min(oldest, dayStamp(t.date));
    if (oldest === Infinity) return list.filter(t => !t.auditStatus);
    return list.filter(t => !t.auditStatus || dayStamp(t.date) >= oldest);
  }
  const cleanNote = n => String(n || "").replace(/\s*\[(?:DELETED|ARCHIVED)\]\s*/gi, " ").replace(/\s{2,}/g, " ").trim();

  // ── html ────────────────────────────────────────────────────────────────────────────────
  function skeletonHtml(n = 6){
    const row = i => `<div class="exh-skel-row" style="--d:${i * 70}ms"><span class="exh-skel-ico"></span><span class="exh-skel-lines"><i style="width:${42 + (i * 13) % 30}%"></i><i style="width:${58 + (i * 7) % 26}%"></i></span><span class="exh-skel-amt"><i></i><i></i></span></div>`;
    return `<div class="exh-skel" role="status" aria-label="Loading transactions"><div class="exh-skel-day"><i></i></div>${Array.from({ length: n }, (_, i) => row(i)).join("")}</div>`;
  }
  function summaryHtml(T, shownCount){
    const curs = (typeof sortCurrenciesList === "function" ? sortCurrenciesList([...T.byCur.keys()]) : [...T.byCur.keys()]);
    const totals = curs.length ? curs.map(c => `<b>${m(T.byCur.get(c).total, c)}</b>`).join("") : `<b>${m(0, "")}</b>`;
    const vat = curs.filter(c => T.byCur.get(c).tax > 0).map(c => m(T.byCur.get(c).tax, c)).join(" · ");
    const topType = T.typesExact === false ? null : [...T.types.entries()].sort(typeOrder)[0];
    const showing = T.count > shownCount ? `<small class="exh-sum-more">Showing ${shownCount} of ${T.count} · load more below</small>` : "";
    return `<div class="exh-sum">
      <div class="exh-sum-card is-main"><span class="exh-sum-label"><i class="fa-solid fa-arrow-trend-up" aria-hidden="true"></i> Total spent</span><span class="exh-sum-total">${totals}</span>${showing}</div>
      <div class="exh-sum-card"><span class="exh-sum-label"><i class="fa-solid fa-receipt" aria-hidden="true"></i> Transactions</span><b>${esc(String(T.count))}</b><small>${esc(String(T.types.size))} ${T.types.size === 1 ? "category" : "categories"}</small></div>
      <div class="exh-sum-card"><span class="exh-sum-label"><i class="fa-solid fa-percent" aria-hidden="true"></i> VAT paid</span><b>${vat || "—"}</b><small>${vat ? "Included in the total" : "No VAT in these dates"}</small></div>
      <div class="exh-sum-card"><span class="exh-sum-label"><i class="fa-solid fa-crown" aria-hidden="true"></i> Most frequent</span><b class="exh-ellipsis">${topType ? esc(topType[0]) : "—"}</b><small>${topType ? `${topType[1].count} transaction${topType[1].count === 1 ? "" : "s"}` : "No transactions"}</small></div>
    </div>`;
  }
  // Largest first; equal counts by name, so the buttons keep their places.
  const typeOrder = (a, b) => (b[1].count - a[1].count) || String(a[0]).localeCompare(String(b[0]));
  function chipsHtml(T){
    const types = [...T.types.entries()].sort(typeOrder);
    if (types.length < 2 && S.type === "all") return "";
    // T.typesExact false: the counts for these dates are still being read — names only for now.
    const n = count => T.typesExact === false ? "" : `<small>${esc(String(count))}</small>`;
    const chip = (key, label, count, tone) => `<button type="button" class="exh-chip${S.type === key ? " is-on" : ""}" data-exh-type="${esc(key)}" aria-pressed="${S.type === key}"${tone ? ` style="--t:${tone}"` : ""}>${tone ? `<i class="exh-dot" aria-hidden="true"></i>` : ""}${esc(label)}${n(count)}</button>`;
    return `<div class="exh-chips" role="toolbar" aria-label="Filter by category">${chip("all", "All", T.count, "")}${types.map(([k, v]) => chip(k, k, v.count, toneFor(k))).join("")}</div>`;
  }
  function toolbarHtml(ctx){
    const n = S.sel.size;
    const selTotal = new Map();
    for (const tx of S.sel.values()) selTotal.set(tx.currency, num(selTotal.get(tx.currency)) + num(tx.amount));
    const selAmount = [...selTotal.entries()].map(([c, v]) => m(v, c)).join(" · ");
    const visibleIds = S.list.filter(t => !t.auditStatus).map(t => String(t.id));
    const allOn = visibleIds.length > 0 && visibleIds.every(id => S.sel.has(id));
    const sortSel = `<label class="exh-sort"><span class="sr-only">Sort</span><i class="fa-solid fa-arrow-down-wide-short" aria-hidden="true"></i>
      <select data-exh-sort aria-label="Sort transactions">${[["newest", "Newest first"], ["oldest", "Oldest first"], ["high", "Amount: high to low"], ["low", "Amount: low to high"], ["item", "Item name A–Z"]].map(([v, l]) => `<option value="${v}"${S.sort === v ? " selected" : ""}>${l}</option>`).join("")}</select></label>`;
    const scope = ctx.searching ? `<div class="exh-scope" role="radiogroup" aria-label="Search in">
        <span><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i> Search in</span>
        <button type="button" role="radio" data-exh-scope="all" aria-checked="${ctx.scope !== "range"}">All dates</button>
        <button type="button" role="radio" data-exh-scope="range" aria-checked="${ctx.scope === "range"}">${esc(ctx.rangeName)}</button></div>` : "";
    if (!S.selecting) {
      return `<div class="exh-bar">
        <div class="exh-bar-left">${scope || `<span class="exh-range"><i class="fa-regular fa-calendar" aria-hidden="true"></i> ${esc(ctx.rangeText)}</span>`}</div>
        <div class="exh-bar-right">${sortSel}<button type="button" class="exh-btn" data-exh-select="on"${visibleIds.length ? "" : " disabled"}><i class="fa-regular fa-square-check" aria-hidden="true"></i><span>Select</span></button></div>
      </div>`;
    }
    return `<div class="exh-bar is-selecting">
      <div class="exh-bar-left">
        <label class="exh-check-all"><input type="checkbox" data-exh-all ${allOn ? "checked" : ""} aria-label="Select all transactions on screen"><span>${allOn ? "All selected" : "Select all"}</span></label>
        <span class="exh-sel-count" aria-live="polite">${n ? `<b>${n}</b> selected${selAmount ? ` · ${selAmount}` : ""}` : "Choose transactions"}</span>
      </div>
      <div class="exh-bar-right">
        <span class="exh-pdf-wrap">
          <button type="button" class="exh-btn is-primary" data-exh-pdf-menu aria-haspopup="menu" aria-expanded="false"${n ? "" : " disabled"}><i class="fa-solid fa-file-pdf" aria-hidden="true"></i><span>PDF</span><i class="fa-solid fa-chevron-down exh-caret" aria-hidden="true"></i></button>
          <span class="exh-menu" role="menu" hidden>
            <button type="button" role="menuitem" data-exh-pdf="detailed"><i class="fa-solid fa-list" aria-hidden="true"></i><span><b>Detailed PDF</b><small>Every selected transaction</small></span></button>
            <button type="button" role="menuitem" data-exh-pdf="summary"><i class="fa-solid fa-table-cells-large" aria-hidden="true"></i><span><b>Summary PDF</b><small>Totals per item</small></span></button>
          </span>
        </span>
        <button type="button" class="exh-btn" data-exh-csv${n ? "" : " disabled"}><i class="fa-solid fa-file-csv" aria-hidden="true"></i><span>CSV</span></button>
        <button type="button" class="exh-btn is-ghost" data-exh-select="off"><i class="fa-solid fa-xmark" aria-hidden="true"></i><span>Done</span></button>
      </div>
    </div>`;
  }
  function rowHtml(tx){
    const id = esc(tx.id);
    const tone = toneFor(tx.expenseType);
    const inactive = !!tx.auditStatus;
    const checked = S.sel.has(String(tx.id));
    const time = timeOf(tx);
    const note = cleanNote(tx.notes);
    const meta = [
      `<span class="exh-wallet">${walletIcon(tx.wallet, 14)}<span translate="no">${esc(tx.wallet || "Wallet")}</span></span>`,
      time ? `<span>${esc(time)}</span>` : "",
      S.sort !== "newest" && S.sort !== "oldest" ? `<span>${esc(typeof displayDate === "function" ? displayDate(tx.date) : tx.date)}</span>` : "",
      note && note !== "—" ? `<span class="exh-note" translate="no" title="${esc(note)}">${esc(note)}</span>` : ""
    ].filter(Boolean).join(`<i class="exh-sep" aria-hidden="true"></i>`);
    const ai = (() => { try { return typeof isTriplemAiOrigin === "function" && isTriplemAiOrigin("expenses", tx.id) && typeof aiOriginBadgeHtml === "function" ? aiOriginBadgeHtml("AI") : ""; } catch (_) { return ""; } })();
    const att = (() => { try { return global.TriplemAttachments ? TriplemAttachments.iconForId(tx.id, "expense") : ""; } catch (_) { return ""; } })();
    const sync = (() => { try { return !inactive && typeof offlineSyncButtonHtml === "function" ? offlineSyncButtonHtml(tx.id) : ""; } catch (_) { return ""; } })();
    const canE = !inactive && (typeof teamCanShowEdit !== "function" || teamCanShowEdit("entries"));
    const canD = !inactive && (typeof teamCanShowDelete !== "function" || teamCanShowDelete("entries"));
    return `<div class="exh-row expense-tx-row${inactive ? ` is-inactive expense-record-disabled ${tx.auditStatus === "archived" ? "is-archived" : "is-deleted"}` : ""}${checked ? " is-checked" : ""}" data-expense-tx-id="${id}" tabindex="0" role="button" aria-label="${esc(tx.itemName)}, ${esc(plainMoney(tx.amount, tx.currency))}" style="--t:${tone}">
      ${S.selecting && !inactive ? `<label class="exh-cb" title="Select"><input type="checkbox" data-exh-pick="${id}" ${checked ? "checked" : ""} aria-label="Select ${esc(tx.itemName)}"></label>` : ""}
      <span class="exh-ico" aria-hidden="true"><i class="fa-solid ${iconFor(tx.expenseType, tx.itemName)}"></i></span>
      <span class="exh-main">
        <span class="exh-title"><b translate="no">${esc(tx.itemName)}</b><span class="exh-cat">${esc(tx.expenseType || "Other")}</span>${ai}${inactive ? `<span class="exh-del"><i class="fa-solid ${tx.auditStatus === "archived" ? "fa-ban" : "fa-trash-can"}" aria-hidden="true"></i>${tx.auditStatus === "archived" ? "Permanently deleted" : "Deleted"}</span>` : ""}</span>
        <span class="exh-meta">${meta}</span>
      </span>
      <span class="exh-amt"><b>−${m(tx.amount, tx.currency)}</b>${tx.taxAmount ? `<small>VAT ${m(tx.taxAmount, tx.currency)}</small>` : `<small class="exh-ref">${esc(ref(tx.id))}</small>`}</span>
      <span class="exh-act">${att}${sync}
        <span class="expense-tx-action-wrap">
          <button type="button" class="exh-kebab expense-tx-menu-btn" data-expense-tx-menu="${id}" aria-haspopup="menu" aria-expanded="false" title="Transaction actions"><i class="fa-solid fa-ellipsis-vertical"></i></button>
          <span class="expense-tx-menu" data-expense-tx-menu-panel="${id}" role="menu">
            ${canE ? `<button type="button" role="menuitem" data-expense-tx-edit-menu="${id}"><i class="fa-solid fa-pen"></i><span>Edit</span></button>` : ""}
            <button type="button" role="menuitem" data-expense-tx-pdf-menu="${id}"><i class="fa-solid fa-file-pdf"></i><span>Download PDF</span></button>
            ${canD ? `<button type="button" class="is-danger" role="menuitem" data-expense-tx-delete-menu="${id}"><i class="fa-solid fa-trash"></i><span>Delete</span></button>` : ""}
          </span>
        </span>
      </span>
    </div>`;
  }
  // "9 transactions · 1 deleted": deleted ones are not counted as transactions of the day.
  function dayCount(rows){
    const act = rows.filter(t => !t.auditStatus).length, del = rows.length - act;
    return `${act} ${act === 1 ? "transaction" : "transactions"}${del ? ` · ${del} deleted` : ""}`;
  }
  function listHtml(list){
    if (S.sort !== "newest" && S.sort !== "oldest") return `<div class="exh-group">${list.map(rowHtml).join("")}</div>`;
    const days = new Map();
    for (const tx of list) {
      const d = String(tx.date || "").slice(0, 10);
      if (!days.has(d)) days.set(d, []);
      days.get(d).push(tx);
    }
    return [...days.entries()].map(([d, rows]) => {
      const tot = new Map();
      rows.filter(t => !t.auditStatus).forEach(t => tot.set(t.currency, num(tot.get(t.currency)) + num(t.amount)));
      const totText = [...tot.entries()].map(([c, v]) => m(v, c)).join(" · ");
      return `<section class="exh-group" aria-label="${esc(dayLabel(d))}">
        <header class="exh-day"><span>${esc(dayLabel(d))}</span><span class="exh-day-tot">${totText ? `<b>${totText}</b>` : ""}<small>${dayCount(rows)}</small></span></header>
        ${rows.map(rowHtml).join("")}
      </section>`;
    }).join("");
  }

  /**
   * The whole "Expenses" block body. ctx: { items, loading, hasMore, loadingMore, rangeText,
   * rangeName, searching, scope }.
   */
  function bodyHtml(ctx){
    const all = placeInactive(flatten(ctx.items), ctx);
    // keep selected rows only while they are on screen
    const ids = new Set(all.map(t => String(t.id)));
    for (const id of [...S.sel.keys()]) if (!ids.has(id)) S.sel.delete(id);
    // One set of numbers whatever button is selected: totals for the whole dates (server when
    // exact), categories counted per transaction — from the rows on screen when they are all
    // loaded, otherwise from a one-time count of the whole dates.
    const local = localTotals(all);
    const T = { ...((!ctx.searching && serverTotals()) || local) };
    if (!ctx.hasMore) { T.types = local.types; T.typesExact = true; }
    else {
      const B = (() => { try { return global.expenseHistoryTypeBreakdown?.() || null; } catch (_) { return null; } })();
      if (B && !B.failed) { T.types = B.types; T.typesExact = true; }
      else {
        // Names of the loaded categories, without numbers, until the count arrives (or if the
        // dates hold too many transactions to count here).
        T.types = new Map([...local.types.keys()].map(k => [k, { count: 0, byCur: new Map() }]));
        T.typesExact = false;
      }
    }
    const types = new Set([...T.types.keys(), ...all.map(t => String(t.expenseType || "Other"))]);
    if (S.type !== "all" && !types.has(S.type)) S.type = "all";
    const filtered = S.type === "all" ? all : all.filter(t => String(t.expenseType || "Other") === S.type);
    // New dates / search / wallet / category / sort: start again with the first 50.
    const key = [ctx.rangeText, ctx.searching ? "s" : "", ctx.scope, S.type, S.sort, global.state?.expenseWalletFilter || "", global.state?.search?.expenses || ""].join("|");
    if (key !== S.limitKey) { S.limitKey = key; S.limit = STEP; }
    S.full = sorted(filtered);
    S.list = S.full.slice(0, S.limit);
    fill(S, key, ctx, S.full.length);
    S.byId = new Map(all.map(t => [String(t.id), t]));
    const shown = S.list.filter(t => !t.auditStatus).length;
    if (ctx.loading && !all.length) return `<div class="exh">${skeletonHtml(7)}</div>`;
    const empty = !S.list.length
      ? `<div class="exh-empty"><span class="exh-empty-ico" aria-hidden="true"><i class="fa-regular fa-calendar-xmark"></i></span><b>No transactions ${ctx.searching ? "match your search" : "on these dates"}</b><small>${esc(ctx.rangeText)}${ctx.searching && ctx.scope === "range" ? " · try searching all dates" : ""}</small></div>`
      : "";
    const more = moreHtml(S.full.length, S.list.length, ctx, "transactions");
    return `<div class="exh${S.selecting ? " is-selecting" : ""}${ctx.loading ? " is-loading" : ""}${ctx.refreshing ? " is-refreshing" : ""}">
      ${all.length || T.count ? summaryHtml(T, shown) : ""}
      ${chipsHtml(T)}
      ${toolbarHtml(ctx)}
      <div class="exh-list" role="list">${ctx.loading ? skeletonHtml(6) : (empty || listHtml(S.list))}</div>
      ${more}
    </div>`;
  }


  /**
   * "Load more": 50 more rows per click, never on its own. Rows already loaded are shown first;
   * when they run out and the server has more, the same click loads the next page.
   */
  function moreHtml(total, shownRows, ctx, noun){
    const server = ctx.hasMore === true;
    if (shownRows < total || server) {
      const left = total - shownRows;
      const label = ctx.loadingMore ? `<i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> Loading…`
        : `<i class="fa-solid fa-angles-down" aria-hidden="true"></i> ${left >= STEP || server ? `Load ${STEP} more` : `Load ${left} more`}`;
      return `<div class="exh-more"><span class="exh-more-count">${esc(`Showing ${shownRows} of ${server ? `${total}+` : total} ${noun}`)}</span>
        <button type="button" class="exh-btn" data-exh-more ${ctx.loadingMore ? "disabled" : ""}>${label}</button></div>`;
    }
    return shownRows > 6 ? `<div class="exh-end"><i class="fa-solid fa-check" aria-hidden="true"></i> All ${shownRows} ${noun} shown</div>` : "";
  }

  /**
   * Each batch is 50 rows. The server pages also hold the other record kinds, so one batch can
   * need more than one page: they are read one after another until the batch is full (or the
   * dates have nothing more). Only the batch that was asked for (first view, or a click on
   * "Load more") is read; scrolling never loads anything.
   */
  let filling = false;
  function fill(st, key, ctx, have){
    const k = `${key}#${st.limit}`;
    if (st.fillKey !== k) { st.fillKey = k; st.fills = 0; }
    if (filling || !ctx.hasMore || ctx.loading || ctx.loadingMore || have >= st.limit || st.fills >= 8) return;
    if (typeof loadExpenseActivityForCurrentQuery !== "function") return;
    st.fills++; filling = true;
    setTimeout(async () => {
      try { await loadExpenseActivityForCurrentQuery({ append: true }); } catch (err) { console.warn("More expense records could not be loaded.", err); }
      filling = false;
      rerender();
    }, 0);
  }

  // ── Receiving / Internal transfers in the same style ───────────────────────────────────
  /**
   * ctx: { kind: "receiving" | "transfers", records: [{ id, type, date, createdAt, currency, amount,
   *   wallet, walletLabel, counterparty, label, notes, auditStatus, rate, otherLeg, menu, sync }],
   *   hasMore, loadingMore, loading, rangeText, pdfType, hint }
   */
  function renderRecords(ctx){
    bind();
    const incoming = ctx.kind === "receiving";
    // wallet names can carry the app's hidden tags ("Cash [ATYPE:Cash Account]"): show the name only
    const plainName = v => String(v || "").replace(/\s*\[[A-Z_]+(?::[^\]]*)?\]?.*$/, "").trim();
    const recs = (ctx.records || []).map(r => ({ ...r, currency: r.currency || "AED", counterparty: plainName(r.counterparty), wallet: plainName(r.wallet) || r.wallet, walletLabel: plainName(r.walletLabel) || r.walletLabel }));
    const key = [ctx.kind, ctx.rangeText, R.sort, global.state?.expenseWalletFilter || "", global.state?.search?.expenses || ""].join("|");
    if (key !== R.limitKey) { R.limitKey = key; R.limit = STEP; }
    const by = {
      newest: (a, b) => (dayStamp(b.date) - dayStamp(a.date)) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
      oldest: (a, b) => (dayStamp(a.date) - dayStamp(b.date)) || String(a.createdAt || "").localeCompare(String(b.createdAt || "")),
      high: (a, b) => num(b.amount) - num(a.amount),
      low: (a, b) => num(a.amount) - num(b.amount)
    }[R.sort] || (() => 0);
    const full = recs.slice().sort(by);
    const list = full.slice(0, R.limit);
    fill(R, key, ctx, full.length);
    R.list = list;
    const active = recs.filter(r => !r.auditStatus);
    const byCur = new Map(), wallets = new Map();
    let largest = null;
    for (const r of active) {
      byCur.set(r.currency, num(byCur.get(r.currency)) + num(r.amount));
      const w = String(r.wallet || "Wallet"); wallets.set(w, num(wallets.get(w)) + 1);
      if (!largest || num(r.amount) > num(largest.amount)) largest = r;
    }
    const curs = (typeof sortCurrenciesList === "function" ? sortCurrenciesList([...byCur.keys()]) : [...byCur.keys()]);
    const topWallet = [...wallets.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    const icon = incoming ? "fa-arrow-down" : "fa-arrow-right-arrow-left";
    const tone = incoming ? "#16a34a" : "#d97706";
    if (ctx.loading && !recs.length) return `<div class="exh is-records">${skeletonHtml(6)}</div>`;
    const summary = recs.length ? `<div class="exh-sum">
        <div class="exh-sum-card is-main"><span class="exh-sum-label"><i class="fa-solid ${incoming ? "fa-arrow-trend-down" : "fa-arrow-right-arrow-left"}" aria-hidden="true"></i> ${esc(incoming ? "Total received" : "Total transferred")}</span><span class="exh-sum-total">${curs.length ? curs.map(c => `<b>${m(byCur.get(c), c)}</b>`).join("") : `<b>${m(0, "")}</b>`}</span>${full.length > list.length ? `<small class="exh-sum-more">Showing ${list.length} of ${full.length} · load more below</small>` : ""}</div>
        <div class="exh-sum-card"><span class="exh-sum-label"><i class="fa-solid fa-receipt" aria-hidden="true"></i> ${esc(incoming ? "Receipts" : "Transfers")}</span><b>${esc(String(active.length))}</b><small>${esc(`${curs.length} ${curs.length === 1 ? "currency" : "currencies"}`)}</small></div>
        <div class="exh-sum-card"><span class="exh-sum-label"><i class="fa-solid fa-wallet" aria-hidden="true"></i> ${esc("Most used wallet")}</span><b class="exh-ellipsis" translate="no">${topWallet ? esc(topWallet[0]) : "—"}</b><small>${topWallet ? esc(`${topWallet[1]} ${topWallet[1] === 1 ? "record" : "records"}`) : esc("No records")}</small></div>
        <div class="exh-sum-card"><span class="exh-sum-label"><i class="fa-solid fa-arrow-up-wide-short" aria-hidden="true"></i> ${esc("Largest")}</span><b>${largest ? m(largest.amount, largest.currency) : "—"}</b><small class="exh-ellipsis" translate="no">${largest ? esc(largest.wallet || "") : esc("No records")}</small></div>
      </div>` : "";
    const sortSel = `<label class="exh-sort"><span class="sr-only">Sort</span><i class="fa-solid fa-arrow-down-wide-short" aria-hidden="true"></i>
      <select data-exh-rsort aria-label="Sort">${[["newest", "Newest first"], ["oldest", "Oldest first"], ["high", "Amount: high to low"], ["low", "Amount: low to high"]].map(([v, l]) => `<option value="${v}"${R.sort === v ? " selected" : ""}>${l}</option>`).join("")}</select></label>`;
    const bar = `<div class="exh-bar"><div class="exh-bar-left"><span class="exh-range"><i class="fa-regular fa-calendar" aria-hidden="true"></i> ${esc(ctx.rangeText || "")}</span></div>
      <div class="exh-bar-right">${sortSel}${ctx.pdfType ? `<button type="button" class="exh-btn expenseActionBtn" data-action="pdf" data-type="${esc(ctx.pdfType)}"><i class="fa-solid fa-file-pdf" aria-hidden="true"></i><span>PDF</span></button>` : ""}</div></div>`;
    const row = r => {
      const inactive = !!r.auditStatus, time = timeOf(r), note = cleanNote(r.notes);
      const meta = [
        `<span class="exh-wallet">${walletIcon(r.wallet, 14)}<span translate="no">${esc(r.walletLabel || r.wallet || "Wallet")}</span></span>`,
        r.counterparty && r.counterparty !== "—" ? `<span translate="no"><i class="fa-solid ${incoming ? "fa-arrow-left" : "fa-arrow-right"} exh-dir" aria-hidden="true"></i> ${esc(r.counterparty)}</span>` : "",
        time ? `<span>${esc(time)}</span>` : "",
        R.sort !== "newest" && R.sort !== "oldest" ? `<span>${esc(typeof displayDate === "function" ? displayDate(r.date) : r.date)}</span>` : "",
        note && note !== "—" ? `<span class="exh-note" translate="no" title="${esc(note)}">${esc(note)}</span>` : ""
      ].filter(Boolean).join(`<i class="exh-sep" aria-hidden="true"></i>`);
      const sub = r.otherLeg && r.otherLeg !== "—" ? `<small>→ ${esc(r.otherLeg)}${r.rate && r.rate !== "1" ? ` · ${esc(`rate ${r.rate}`)}` : ""}</small>` : `<small class="exh-ref">${esc(ref(r.id))}</small>`;
      return `<div class="exh-row expense-record-row${incoming ? " is-in" : " is-transfer"}${inactive ? ` is-inactive expense-record-disabled ${r.auditStatus === "archived" ? "is-archived" : "is-deleted"}` : ""}" data-expense-record-type="${esc(r.type)}" data-expense-record-id="${esc(r.id)}" tabindex="0" role="button" aria-label="${esc(r.label)}, ${esc(plainMoney(r.amount, r.currency))}" style="--t:${tone}">
        <span class="exh-ico" aria-hidden="true"><i class="fa-solid ${icon}"></i></span>
        <span class="exh-main"><span class="exh-title"><b>${esc(r.label)}</b><span class="exh-cat">${esc(incoming ? "Money in" : "Transfer")}</span>${inactive ? `<span class="exh-del"><i class="fa-solid ${r.auditStatus === "archived" ? "fa-ban" : "fa-trash-can"}" aria-hidden="true"></i>${r.auditStatus === "archived" ? "Permanently deleted" : "Deleted"}</span>` : ""}</span><span class="exh-meta">${meta}</span></span>
        <span class="exh-amt"><b class="${incoming ? "is-plus" : ""}">${incoming ? "+" : "−"}${m(r.amount, r.currency)}</b>${sub}</span>
        <span class="exh-act">${r.sync || ""}${r.menu || ""}</span>
      </div>`;
    };
    let body;
    if (!list.length) body = `<div class="exh-empty"><span class="exh-empty-ico" aria-hidden="true"><i class="fa-regular fa-calendar-xmark"></i></span><b>${esc(incoming ? "No money received on these dates" : "No internal transfers on these dates")}</b><small>${esc(ctx.rangeText || "")}</small></div>`;
    else if (R.sort !== "newest" && R.sort !== "oldest") body = `<div class="exh-group">${list.map(row).join("")}</div>`;
    else {
      const days = new Map();
      for (const r of list) { const d = String(r.date || "").slice(0, 10); if (!days.has(d)) days.set(d, []); days.get(d).push(r); }
      body = [...days.entries()].map(([d, rows]) => {
        const tot = new Map();
        rows.filter(r => !r.auditStatus).forEach(r => tot.set(r.currency, num(tot.get(r.currency)) + num(r.amount)));
        const act = rows.filter(r => !r.auditStatus).length, del = rows.length - act;
        return `<section class="exh-group" aria-label="${esc(dayLabel(d))}"><header class="exh-day"><span>${esc(dayLabel(d))}</span><span class="exh-day-tot"><b>${[...tot.entries()].map(([c, v]) => m(v, c)).join(" · ")}</b><small>${esc(`${act} ${act === 1 ? "record" : "records"}${del ? ` · ${del} deleted` : ""}`)}</small></span></header>${rows.map(row).join("")}</section>`;
      }).join("");
    }
    return `<div class="exh is-records${ctx.loading ? " is-loading" : ""}">${summary}${ctx.hint ? `<p class="exh-hint"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ${esc(ctx.hint)}</p>` : ""}${bar}
      <div class="exh-list" role="list">${body}</div>${moreHtml(full.length, list.length, ctx, "records")}</div>`;
  }

  // ── selection, PDF, CSV ─────────────────────────────────────────────────────────────────
  function rerender(){ try { renderExpensesList(); } catch (_) {} }
  function itemsFromSelection(){
    const groups = new Map();
    const chosen = S.list.filter(t => S.sel.has(String(t.id)));
    for (const tx of chosen) {
      const key = `${tx.currency}||${String(tx.itemName).toLowerCase()}`;
      const g = groups.get(key) || { key, displayName: tx.itemName, expenseType: tx.expenseType, currency: tx.currency, total: 0, taxTotal: 0, netTotal: 0, txs: [] };
      g.total += num(tx.amount); g.taxTotal += num(tx.taxAmount); g.netTotal += num(tx.netAmount ?? (num(tx.amount) - num(tx.taxAmount)));
      g.txs.push(tx); groups.set(key, g);
    }
    return [...groups.values()].sort((a, b) => b.total - a.total);
  }
  async function pdfSelected(mode){
    const items = itemsFromSelection();
    if (!items.length) return;
    const dates = [...S.sel.values()].map(t => String(t.date || "").slice(0, 10)).filter(Boolean).sort();
    const span = dates.length ? (dates[0] === dates[dates.length - 1] ? displayDate(dates[0]) : `${displayDate(dates[0])} - ${displayDate(dates[dates.length - 1])}`) : "";
    await downloadExpenseTransactionsHistoryPDF(mode, { items, rangeLabel: `Selected: ${S.sel.size} transaction${S.sel.size === 1 ? "" : "s"}${span ? ` · ${span}` : ""}` });
  }
  function csvSelected(){
    const rows = S.list.filter(t => S.sel.has(String(t.id)));
    if (!rows.length) return;
    const q = v => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [["Date", "Item", "Category", "Wallet", "Currency", "Amount", "VAT", "Net", "Reference", "Notes"].join(",")];
    for (const t of rows) lines.push([t.date, t.itemName, t.expenseType, t.wallet, t.currency, num(t.amount).toFixed(2), num(t.taxAmount).toFixed(2), num(t.netAmount ?? (num(t.amount) - num(t.taxAmount))).toFixed(2), ref(t.id), t.notes].map(q).join(","));
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Expenses_Selected_${todayIso()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function closeMenus(except){
    document.querySelectorAll(".exh-menu:not([hidden])").forEach(menu => { if (menu === except) return; menu.hidden = true; menu.parentElement?.querySelector("[data-exh-pdf-menu]")?.setAttribute("aria-expanded", "false"); });
  }

  function bind(){
    const host = global.els?.expensesList || document.getElementById("expensesList");
    if (!host || S.bound) return;
    S.bound = true;
    // Capture: runs before the list's own click handler (which opens a transaction).
    host.addEventListener("click", async e => {
      const t = e.target;
      if (!t.closest(".exh")) return;
      const moreBtn = t.closest("[data-exh-more]");
      if (moreBtn) {
        // records view or expenses view: 50 more rows (fill() reads the next page if needed).
        e.stopPropagation();
        if (moreBtn.closest(".is-records")) R.limit += STEP; else S.limit += STEP;
        rerender();
        return;
      }
      const typeBtn = t.closest("[data-exh-type]");
      if (typeBtn) { S.type = typeBtn.dataset.exhType || "all"; rerender(); return; }
      const scopeBtn = t.closest("[data-exh-scope]");
      if (scopeBtn) { e.stopPropagation(); await setScope(scopeBtn.dataset.exhScope); return; }
      const selBtn = t.closest("[data-exh-select]");
      if (selBtn) { S.selecting = selBtn.dataset.exhSelect === "on"; if (!S.selecting) S.sel.clear(); rerender(); return; }
      const menuBtn = t.closest("[data-exh-pdf-menu]");
      if (menuBtn) {
        e.stopPropagation();
        const menu = menuBtn.parentElement.querySelector(".exh-menu");
        const open = menu.hidden;
        closeMenus();
        menu.hidden = !open;
        menuBtn.setAttribute("aria-expanded", String(open));
        return;
      }
      const pdfBtn = t.closest("[data-exh-pdf]");
      if (pdfBtn) { e.stopPropagation(); closeMenus(); await pdfSelected(pdfBtn.dataset.exhPdf); return; }
      if (t.closest("[data-exh-csv]")) { e.stopPropagation(); csvSelected(); return; }
      const all = t.closest("[data-exh-all]");
      if (all) {
        e.stopPropagation();
        const on = all.checked;
        S.list.filter(x => !x.auditStatus).forEach(x => { if (on) S.sel.set(String(x.id), x); else S.sel.delete(String(x.id)); });
        rerender(); return;
      }
      const pick = t.closest("[data-exh-pick]");
      if (pick) { e.stopPropagation(); toggle(pick.dataset.exhPick, pick.checked); return; }
      // While selecting, a click on a row ticks it instead of opening it.
      const row = t.closest(".exh-row[data-expense-tx-id]");
      if (row && S.selecting && !row.classList.contains("is-inactive") && !t.closest("button, a, label, input, [role=menu], .exh-act")) {
        e.preventDefault(); e.stopPropagation();
        toggle(row.dataset.expenseTxId, !S.sel.has(row.dataset.expenseTxId));
      }
    }, true);
    host.addEventListener("change", e => {
      const s = e.target.closest?.("[data-exh-sort]");
      if (s) { S.sort = s.value; rerender(); }
      const rs = e.target.closest?.("[data-exh-rsort]");
      if (rs) { R.sort = rs.value; rerender(); }
    });
    host.addEventListener("keydown", e => {
      if (!S.selecting || (e.key !== " " && e.key !== "Enter")) return;
      const row = e.target.closest?.(".exh-row[data-expense-tx-id]");
      if (!row || e.target !== row || row.classList.contains("is-inactive")) return;
      e.preventDefault(); e.stopPropagation();
      toggle(row.dataset.expenseTxId, !S.sel.has(row.dataset.expenseTxId));
    }, true);
    document.addEventListener("click", e => { if (!e.target.closest?.(".exh-pdf-wrap")) closeMenus(); });
  }
  function toggle(id, on){
    id = String(id);
    const tx = S.byId.get(id);
    if (on && tx) S.sel.set(id, tx); else S.sel.delete(id);
    // Update in place (keeps scroll and focus); the bar is redrawn.
    const host = document.querySelector("#expensesList .exh");
    if (!host) return rerender();
    host.querySelectorAll(`.exh-row[data-expense-tx-id="${CSS.escape(id)}"]`).forEach(r => {
      r.classList.toggle("is-checked", !!on);
      const cb = r.querySelector("[data-exh-pick]"); if (cb) cb.checked = !!on;
    });
    const bar = host.querySelector(".exh-bar");
    if (bar) bar.outerHTML = toolbarHtml(lastCtx || {});
  }
  let lastCtx = null;

  async function setScope(scope){
    state.expenseHistorySearchScope = scope === "range" ? "range" : "all";
    if (typeof isExpenseLazyMode === "function" && isExpenseLazyMode()) {
      showSkeleton();
      try { await loadExpenseActivityForCurrentQuery({ force: true }); } catch (err) { console.warn("Expense search reload failed:", err); }
    }
    rerender();
  }

  /** Called by the app while it reloads the records for a new date range / search. */
  function showSkeleton(){
    const list = document.querySelector("#expensesList .exh .exh-list");
    if (list) { list.innerHTML = skeletonHtml(6); list.closest(".exh")?.classList.add("is-loading"); return; }
    // First opening: nothing drawn yet — draw the block now (it shows skeleton rows while loading).
    if (!document.querySelector("#expensesList .exh")) rerender();
  }

  function render(ctx){
    bind();
    lastCtx = ctx;
    return bodyHtml(ctx);
  }

  global.TriplemExpenseHistory = Object.freeze({
    enabled: () => true,
    render,
    renderRecords,
    showSkeleton,
    skeletonHtml,
    /** Ordered ids of the transactions on screen (for Previous / Next in the side panel). */
    order: () => S.list.map(t => String(t.id)),
    txById: id => S.byId.get(String(id)) || null,
    toneFor,
    iconFor,
    dayLabel,
    timeOf,
    _test: Object.freeze({ flatten, sorted, localTotals, state: S })
  });
})(typeof window !== "undefined" ? window : globalThis);
