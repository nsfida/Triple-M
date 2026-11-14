/* Triplem VIP skeleton loading (2026-11-14).
 *
 * While a section's records are on their way, its list shows soft placeholder shapes (the same
 * outline as the real rows) instead of an empty area or a "Loading…" line. Nothing here loads
 * data: a section calls show() before it starts and its normal render replaces the placeholders.
 * If a load ends without a render (for example an error that keeps the old view), done() puts
 * the earlier content back, so a placeholder can never stay on screen.
 */
(function initTriplemSkeleton(global){
  "use strict";

  const bar = (w, h = 10) => `<span class="tm-skel-bar" style="width:${w};height:${h}px"></span>`;
  const SHAPES = {
    rows: () => `<div class="tm-skel-row">${bar("34%", 13)}<div class="tm-skel-cols">${bar("70%")}${bar("60%")}${bar("65%")}</div></div>`,
    wallets: () => `<div class="tm-skel-card">${bar("55%", 13)}${bar("80%")}${bar("70%")}${bar("45%", 16)}<div class="tm-skel-cols">${bar("80%", 22)}${bar("80%", 22)}</div></div>`,
    cards: () => `<div class="tm-skel-card">${bar("60%", 13)}${bar("85%")}${bar("75%")}${bar("40%")}</div>`,
    tiles: () => `<div class="tm-skel-tile"><span class="tm-skel-dot"></span>${bar("60%", 11)}</div>`,
    stats: () => `<div class="tm-skel-card tm-skel-stat">${bar("45%")}${bar("65%", 18)}</div>`
  };
  const GRID = { wallets: true, cards: true, tiles: true, stats: true };

  function html(kind = "rows", count = 4, label = "Loading"){
    const shape = SHAPES[kind] || SHAPES.rows;
    const safe = String(label).replace(/[&<>"]/g, "");
    return `<div class="tm-skel tm-skel-${SHAPES[kind] ? kind : "rows"}${GRID[kind] ? " tm-skel-grid" : ""}" role="status" aria-busy="true" aria-label="${safe}">`
      + `<span class="tm-skel-sr">${safe}…</span>${Array.from({ length: Math.max(1, Math.min(12, count)) }, shape).join("")}</div>`;
  }

  const saved = new Map(); // container -> earlier html
  function show(container, kind, count, label){
    if (!container || container.querySelector(":scope > .tm-skel")) return false;
    // Only where nothing real is shown yet: an empty list or an "empty / loading" note.
    const real = [...container.children].some(c => !c.classList.contains("empty") && !c.classList.contains("notes-empty") && !/loading/i.test(c.className));
    if (real) return false;
    saved.set(container, container.innerHTML);
    container.innerHTML = html(kind, count, label);
    return true;
  }
  function done(container){
    if (!container || !saved.has(container)) return;
    const before = saved.get(container);
    saved.delete(container);
    if (container.querySelector(":scope > .tm-skel")) container.innerHTML = before;
  }

  // Lists of each section: [element id, shape, how many]
  const TAB_LISTS = {
    expenses: [["expenseOverviewWallets", "wallets", 5], ["expensesList", "wallets", 4]],
    given: [["givenList", "rows", 4], ["receivedList", "rows", 4]],
    received: [["givenList", "rows", 4], ["receivedList", "rows", 4]],
    taken: [["takenList", "rows", 4], ["returnedList", "rows", 4]],
    returned: [["takenList", "rows", 4], ["returnedList", "rows", 4]],
    installments: [["installmentsList", "cards", 3]],
    goods: [["goodsList", "cards", 6]],
    notes: [["notesList", "cards", 5]],
    assets: [["assetsList", "rows", 3], ["depAssetsList", "rows", 3]],
    admin: [["adminUsersList", "tiles", 12]],
    messages: [["messagesThreadList", "rows", 5]],
    dashboard: [["dashboardRoot", "stats", 8]],
    bitcoin: [["btcHistoryList", "rows", 3]]
  };
  function containers(tab){
    return (TAB_LISTS[tab] || []).map(([id, kind, n]) => [document.getElementById(id), kind, n]).filter(x => x[0]);
  }
  /** Placeholders for a section whose data is about to be fetched. Returns a function to call when the load ends. */
  function tab(tabKey){
    let needs = true;
    try { if (typeof appTabLikelyNeedsFetch === "function") needs = appTabLikelyNeedsFetch(tabKey); } catch (_) {}
    if (!needs) return () => {};
    const shown = containers(tabKey).filter(([el, kind, n]) => show(el, kind, n, "Loading"));
    return () => shown.forEach(([el]) => done(el));
  }

  global.TriplemSkeleton = Object.freeze({ html, show, done, tab });
})(typeof window !== "undefined" ? window : globalThis);
