/* Triplem VIP - your own card order (2026-11, released with Windows app 3.7).
 *
 * Long-press a card and drag it to a new spot, exactly like wallets in
 * Expenses:
 *  - Triplem VIP Home: the section cards (Dashboard, Expenses, Inventory, ...).
 *  - Detailed Dashboard: the summary cards, the chart blocks (they move
 *    together) and, on phones, the section tabs.
 *
 * Each order is saved to the user's own account settings with the existing
 * app_update_own_settings RPC (keys HomeOrder and DashboardOrder), so every
 * device shows the same order. A copy is kept on this device: the order also
 * works offline and is saved to the account as soon as the connection is
 * back. Nothing else changes - no records are touched and no database
 * migration is needed.
 */
(function initTriplemCardOrder(global){
  "use strict";

  const LONG_MS = 450;
  const MOVE_CANCEL_PX = 14;

  function st(){ try { return typeof state !== "undefined" ? state : global.state; } catch (_) { return global.state; } }
  function userId(){
    const s = st();
    return String(s?.sessionUser?.id || s?.currentUsername || "guest").trim() || "guest";
  }
  function isGuest(){ try { return typeof isGuestMode === "function" && isGuestMode(); } catch (_) { return false; } }
  function signedIn(){ const s = st(); return !!(s?.unlocked && s?.sessionToken && s?.sessionUser && !isGuest()); }

  // ── Saved order (account + this device) ───────────────────────────────────

  function createOrderStore({ settingsKey, localPrefix, validId, maxItems = 40 }){
    const normalizeOrder = value => {
      const out = [];
      for (const raw of Array.isArray(value) ? value : []) {
        const id = String(raw ?? "").trim();
        if (validId(id) && !out.includes(id)) out.push(id);
        if (out.length >= maxItems) break;
      }
      return out;
    };
    const normalizeRecord = value => {
      if (!value || typeof value !== "object") return null;
      const order = normalizeOrder(value.order);
      const at = Number(value.at);
      if (!order.length || !Number.isFinite(at) || at <= 0) return null;
      return { order, at };
    };
    const readLocal = (uid = userId()) => {
      try {
        const rec = JSON.parse(localStorage.getItem(localPrefix + uid) || "null");
        const norm = normalizeRecord(rec);
        return norm ? { ...norm, synced: rec.synced === true } : null;
      } catch (_) { return null; }
    };
    const writeLocal = (rec, uid = userId()) => { try { localStorage.setItem(localPrefix + uid, JSON.stringify(rec)); } catch (_) {} };
    const readServer = () => { try { return normalizeRecord(st()?.sessionUser?.settings?.[settingsKey]); } catch (_) { return null; } };

    /** A change on this device that is not on the account yet wins, unless the account has a newer one (another device). */
    const effectiveOrder = () => {
      const uid = userId();
      const local = readLocal(uid);
      const server = readServer();
      if (local && !local.synced && (!server || local.at >= server.at)) return local.order;
      if (server) {
        if (!local || local.at !== server.at || !local.synced) writeLocal({ ...server, synced: true }, uid);
        return server.order;
      }
      return local ? local.order : [];
    };

    /** Sorts items by the saved order; items not in it keep their default place after the known ones. */
    const sort = (list, getId) => {
      const items = Array.isArray(list) ? list.slice() : [];
      const order = effectiveOrder();
      if (!order.length || items.length < 2) return items;
      const rank = (item, index) => { const i = order.indexOf(String(getId(item) ?? "")); return i < 0 ? order.length + index : i; };
      return items.map((item, index) => ({ item, r: rank(item, index), index }))
        .sort((a, b) => (a.r - b.r) || (a.index - b.index))
        .map(x => x.item);
    };

    let queue = Promise.resolve();
    const pushPending = () => {
      queue = queue.catch(() => false).then(async () => {
        const uid = userId();
        const local = readLocal(uid);
        if (!local || local.synced || !signedIn() || typeof supabaseRpc !== "function") return false;
        if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
        const rec = { order: local.order, at: local.at };
        try {
          const updated = await supabaseRpc("app_update_own_settings", { p_settings: { [settingsKey]: rec } }, { offlineCache: false });
          if (userId() !== uid) return false; // signed out meanwhile
          const s = st();
          if (updated && typeof updated === "object" && typeof applyUserProfileToConfig === "function") applyUserProfileToConfig(updated);
          if (s?.sessionUser) s.sessionUser.settings = { ...(s.sessionUser.settings || {}), [settingsKey]: rec };
          const now = readLocal(uid);
          if (now && now.at === rec.at) writeLocal({ ...rec, synced: true }, uid);
          return true;
        } catch (err) {
          // Kept on this device; retried when the connection is back or the cards are shown again.
          console.warn(`${settingsKey} will sync later:`, err?.message || err);
          return false;
        }
      });
      return queue;
    };

    /** Saves a new order of the visible cards; hidden ones keep their saved places at the end. */
    const save = ids => {
      const visible = normalizeOrder(ids);
      if (!visible.length) return Promise.resolve(false);
      const previous = effectiveOrder();
      const full = normalizeOrder(visible.concat(previous.filter(id => !visible.includes(id))));
      const prevLocal = readLocal();
      const at = Math.max(Date.now(), (prevLocal?.at || 0) + 1, (readServer()?.at || 0) + 1);
      writeLocal({ order: full, at, synced: isGuest() });
      if (isGuest()) return Promise.resolve(true);
      return pushPending();
    };

    let lastRetry = 0;
    const retrySoon = () => {
      const local = readLocal();
      if (local && !local.synced && Date.now() - lastRetry > 30000) { lastRetry = Date.now(); pushPending(); }
    };

    return { settingsKey, normalizeOrder, normalizeRecord, readLocal, writeLocal, effectiveOrder, sort, save, pushPending, retrySoon };
  }

  // ── Long-press drag (same feel as wallets) ────────────────────────────────

  /**
   * kinds: [{ item: selector, id: el => string, container: selector }]
   * onDrop(order, kind, container) runs after a card was moved.
   */
  function attachLongPressReorder(root, { kinds, onDrop, lockClass = "card-order-drag-lock", ignore = "a, input, select, textarea, canvas, button" }){
    if (!root || root.dataset.cardOrderBound === "1") return;
    root.dataset.cardOrderBound = "1";
    const anyItem = kinds.map(k => k.item).join(", ");
    const kindOf = el => kinds.find(k => el.matches(k.item)) || null;
    const itemsIn = (container, kind) => Array.from(container.children).filter(el => el.matches(kind.item) && kind.id(el));

    let pressTimer = null;
    let dragging = false;
    let suppressClick = false;
    let source = null;
    let kind = null;
    let container = null;
    let ghost = null;
    let lastOver = null;
    let lastX = 0;
    let lastY = 0;
    const dragSession = typeof createCardReorderDragSession === "function" ? createCardReorderDragSession(lockClass) : null;

    const clearPress = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
    const clearSelection = () => { try { const sel = global.getSelection?.(); if (sel && sel.rangeCount) sel.removeAllRanges(); } catch (_) {} };

    const cleanup = () => {
      clearPress();
      dragging = false;
      root.classList.remove("card-order-reordering", "card-order-press-armed");
      root.querySelectorAll(".card-order-pressing, .card-order-source, .card-order-target").forEach(el => {
        el.classList.remove("card-order-pressing", "card-order-source", "card-order-target");
      });
      dragSession?.stop();
      document.documentElement.classList.remove(lockClass);
      document.body.classList.remove(lockClass);
      if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
      ghost = null;
      source = null;
      kind = null;
      container = null;
      lastOver = null;
    };

    const makeGhost = el => {
      let g;
      const rect = el.getBoundingClientRect();
      if (typeof kind.ghost === "function") {
        g = kind.ghost(el);
      } else {
        g = el.cloneNode(true);
        g.removeAttribute("id");
        g.querySelectorAll("[id]").forEach(n => n.removeAttribute("id"));
        g.style.width = `${rect.width}px`;
        g.style.height = `${rect.height}px`;
      }
      g.classList.add("card-order-ghost");
      g.setAttribute("aria-hidden", "true");
      g.style.animation = "none";
      document.body.appendChild(g);
      return g;
    };
    const moveGhost = (x, y) => {
      if (!ghost) return;
      ghost.style.left = `${x - 24}px`;
      ghost.style.top = `${y - 18}px`;
    };
    const findTarget = (x, y) => {
      const under = document.elementFromPoint(x, y);
      const target = under?.closest?.(kind.item);
      if (!target || target === source || target.parentElement !== container) return null;
      return target;
    };
    const liveReorder = target => {
      const items = itemsIn(container, kind);
      const from = items.indexOf(source);
      const to = items.indexOf(target);
      if (from < 0 || to < 0 || from === to) return;
      if (from < to) target.after(source); else target.before(source);
    };
    const syncTarget = (x, y) => {
      const over = findTarget(x, y);
      if (lastOver && lastOver !== over) lastOver.classList.remove("card-order-target");
      if (over) { over.classList.add("card-order-target"); liveReorder(over); }
      lastOver = over;
    };
    const begin = (el, x, y, pointerId) => {
      dragging = true;
      suppressClick = true;
      source = el;
      clearSelection();
      // Moving cards must not replay their entrance animation.
      container.classList.add("card-order-settled");
      root.classList.remove("card-order-press-armed");
      root.classList.add("card-order-reordering");
      el.classList.remove("card-order-pressing");
      el.classList.add("card-order-source");
      try { if (pointerId != null) el.setPointerCapture?.(pointerId); } catch (_) {}
      try { navigator.vibrate?.(12); } catch (_) {}
      ghost = makeGhost(el);
      moveGhost(x, y);
      dragSession?.start(root, y, { clientX: x, onAutoScroll: (ax, ay) => syncTarget(ax, ay) });
    };
    const finish = () => {
      if (!dragging || !source) { cleanup(); return; }
      const k = kind;
      const c = container;
      const order = itemsIn(c, k).map(k.id).filter(Boolean);
      cleanup();
      try { onDrop(order, k, c); } catch (err) { console.warn("Card order could not be saved:", err); }
      setTimeout(() => { suppressClick = false; }, 0);
    };

    root.addEventListener("pointerdown", e => {
      if (e.button != null && e.button !== 0) return;
      if (dragging) return;
      const el = e.target.closest?.(anyItem);
      if (!el || !root.contains(el)) return;
      const k = kindOf(el);
      if (!k) return;
      const interactive = e.target.closest(ignore);
      if (interactive && interactive !== el) return;
      const parent = el.parentElement;
      if (!parent || !parent.matches(k.container) || itemsIn(parent, k).length < 2) return;
      clearPress();
      kind = k;
      container = parent;
      lastX = e.clientX;
      lastY = e.clientY;
      const startX = e.clientX;
      const startY = e.clientY;
      const pid = e.pointerId;
      el.classList.add("card-order-pressing");
      root.classList.add("card-order-press-armed");
      pressTimer = setTimeout(() => { pressTimer = null; begin(el, lastX, lastY, pid); }, LONG_MS);

      const onMove = ev => {
        if (pid != null && ev.pointerId != null && ev.pointerId !== pid) return;
        lastX = ev.clientX;
        lastY = ev.clientY;
        if (!dragging) {
          if (Math.abs(ev.clientX - startX) > MOVE_CANCEL_PX || Math.abs(ev.clientY - startY) > MOVE_CANCEL_PX) {
            clearPress();
            el.classList.remove("card-order-pressing");
            root.classList.remove("card-order-press-armed");
          }
          return;
        }
        if (ev.cancelable) ev.preventDefault();
        clearSelection();
        moveGhost(ev.clientX, ev.clientY);
        dragSession?.update(ev.clientX, ev.clientY);
        syncTarget(ev.clientX, ev.clientY);
      };
      const onUp = ev => {
        if (pid != null && ev?.pointerId != null && ev.pointerId !== pid) return;
        document.removeEventListener("pointermove", onMove, true);
        document.removeEventListener("pointerup", onUp, true);
        document.removeEventListener("pointercancel", onUp, true);
        if (dragging) finish();
        else {
          clearPress();
          el.classList.remove("card-order-pressing");
          root.classList.remove("card-order-press-armed");
          kind = null;
          container = null;
        }
      };
      document.addEventListener("pointermove", onMove, { passive: false, capture: true });
      document.addEventListener("pointerup", onUp, { capture: true });
      document.addEventListener("pointercancel", onUp, { capture: true });
    }, { passive: true });

    // A long-press must not also "click" (open a section, switch a tab).
    root.addEventListener("click", e => {
      if (!suppressClick) return;
      e.preventDefault();
      e.stopPropagation();
      suppressClick = false;
    }, true);
    root.addEventListener("selectstart", e => { if (dragging || pressTimer) e.preventDefault(); });
    root.addEventListener("contextmenu", e => {
      if ((dragging || pressTimer) && e.target.closest?.(anyItem)) e.preventDefault();
    });
  }

  function markReorderable(root, kinds, title){
    if (!root) return;
    for (const kind of kinds) {
      root.querySelectorAll(kind.container).forEach(container => {
        const items = Array.from(container.children).filter(el => el.matches(kind.item) && kind.id(el));
        const on = items.length > 1;
        items.forEach(el => {
          el.classList.toggle("card-order-reorderable", on);
          if (on && title && kind.title !== false && !el.hasAttribute("title")) el.setAttribute("title", title);
        });
      });
    }
  }

  // ── Triplem VIP Home (section cards) ──────────────────────────────────────

  const homeStore = createOrderStore({
    settingsKey: "HomeOrder",
    localPrefix: "triplem-home-order-v1:",
    validId: id => /^[a-z][a-z0-9-]{0,39}$/.test(id)
  });
  const HOME_KINDS = [{ item: ".workspace-home-card[data-workspace-tab]", id: el => el.dataset.workspaceTab, container: "#workspaceHomeGrid" }];

  /** Sorts the Home tab buttons (elements with data-tab) by the saved order. */
  function orderHomeTabs(buttons){
    return homeStore.sort(buttons, btn => btn?.dataset?.tab);
  }

  function bindHomeReorder(grid){
    if (!grid) return;
    grid.classList.remove("card-order-settled"); // a fresh render may animate in
    markReorderable(grid.parentElement || grid, HOME_KINDS, "");
    homeStore.retrySoon();
    attachLongPressReorder(grid.parentElement || grid, {
      kinds: HOME_KINDS,
      lockClass: "card-order-drag-lock",
      onDrop(order){
        homeStore.save(order);
        try { global.dispatchEvent(new CustomEvent("triplem:home-order-changed", { detail: { order } })); } catch (_) {}
      }
    });
  }

  // ── Detailed Dashboard ────────────────────────────────────────────────────

  const DASHBOARD_IDS = ["expenses", "inventory", "assets", "loans", "installments"];
  const dashboardStore = createOrderStore({
    settingsKey: "DashboardOrder",
    localPrefix: "triplem-dashboard-order-v1:",
    validId: id => DASHBOARD_IDS.includes(id)
  });
  const DASHBOARD_KINDS = [
    { item: "[data-dashboard-hero-card]", id: el => el.dataset.dashboardHeroCard, container: "[data-dashboard-hero]" },
    {
      item: "[data-dashboard-block]", id: el => el.dataset.dashboardBlock, container: "[data-dashboard-section-host]",
      // A compact card instead of a copy of the whole chart block.
      ghost(el){
        const g = document.createElement("div");
        g.className = "card-order-ghost-compact";
        const head = el.querySelector(".dashboard-block-head h4");
        g.innerHTML = head ? head.outerHTML : "";
        g.style.width = `${Math.min(320, el.getBoundingClientRect().width)}px`;
        return g;
      }
    },
    { item: "[data-dashboard-view-section]", id: el => el.dataset.dashboardViewSection, container: ".dashboard-section-switch", title: false }
  ];

  function orderDashboardSections(list){
    return dashboardStore.sort(list, item => item?.id);
  }

  /** Moves the cards of every dashboard container to the order (no re-render, so charts stay). */
  function applyDashboardDomOrder(root, order){
    if (!root || !order.length) return;
    for (const kind of DASHBOARD_KINDS) {
      root.querySelectorAll(kind.container).forEach(container => {
        const items = Array.from(container.children).filter(el => el.matches(kind.item) && kind.id(el));
        if (items.length < 2) return;
        const rank = el => { const i = order.indexOf(kind.id(el)); return i < 0 ? 999 : i; };
        const sorted = items.slice().sort((a, b) => rank(a) - rank(b));
        if (sorted.every((el, i) => el === items[i])) return;
        const anchor = items[items.length - 1].nextSibling;
        sorted.forEach(el => container.insertBefore(el, anchor));
      });
    }
  }

  function bindDashboardReorder(root){
    if (!root) return;
    markReorderable(root, DASHBOARD_KINDS, "Long-press to move this card");
    dashboardStore.retrySoon();
    attachLongPressReorder(root, {
      kinds: DASHBOARD_KINDS,
      lockClass: "card-order-drag-lock",
      ignore: "a, input, select, textarea, canvas, button, [data-dashboard-section-currency], .dashboard-assets-details",
      onDrop(order){
        applyDashboardDomOrder(root, order);
        dashboardStore.save(order);
      }
    });
  }

  // Retry unsaved changes when the connection returns.
  global.addEventListener?.("online", () => { homeStore.pushPending(); dashboardStore.pushPending(); });

  global.orderHomeTabs = orderHomeTabs;
  global.bindHomeReorder = bindHomeReorder;
  global.orderDashboardSections = orderDashboardSections;
  global.bindDashboardReorder = bindDashboardReorder;
  global.TriplemCardOrder = Object.freeze({
    home: Object.freeze({ order: orderHomeTabs, bind: bindHomeReorder, save: homeStore.save, sync: homeStore.pushPending, effectiveOrder: homeStore.effectiveOrder }),
    dashboard: Object.freeze({ order: orderDashboardSections, bind: bindDashboardReorder, save: dashboardStore.save, sync: dashboardStore.pushPending, effectiveOrder: dashboardStore.effectiveOrder }),
    _test: Object.freeze({ createOrderStore, applyDashboardDomOrder })
  });
})(typeof window !== "undefined" ? window : globalThis);
