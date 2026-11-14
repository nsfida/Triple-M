/* Triplem VIP Expenses v2 (2026-11-12)
 *
 * Expenses opens on Wallets/Accounts. "Expenses History" swaps the wallets for the expenses
 * list (search, filters, records, PDF, CSV); "Wallets/Accounts" swaps back. The records are
 * requested from the database only when the history is opened. Nothing about saving, syncing
 * or the records themselves changes.
 */
(function initTriplemExpensesV2(global){
  "use strict";

  const OPEN_CLASS = "ev2-history-open";
  let loading = null;

  const isOpen = () => document.body.classList.contains(OPEN_CLASS);

  function syncHead(on){
    const title = document.querySelector("#walletsOverviewSection .ev2-title");
    if (title) title.textContent = on ? "Expenses History" : "Wallets/Accounts";
    const btn = document.getElementById("ev2HistoryBtn");
    if (btn) {
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.classList.toggle("is-on", on);
      btn.innerHTML = on
        ? '<i class="fa-solid fa-wallet" aria-hidden="true"></i><span>Wallets<span class="ev2-long">/Accounts</span></span>'
        : '<i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i><span><span class="ev2-long">Expenses </span>History</span>';
    }
  }

  async function loadHistory(){
    if (loading) return loading;
    const panel = document.getElementById("expensesPanel");
    loading = (async () => {
      try {
        panel?.classList.add("ev2-loading");
        let changed = false;
        if (typeof global.ensureExpenseHistoryActivityLoaded === "function") changed = await global.ensureExpenseHistoryActivityLoaded();
        if (changed || state.expenseLazy?.listDirty || !document.querySelector("#expensesList > *")) {
          if (typeof renderExpensesList === "function") renderExpensesList();
        }
      } catch (err) {
        console.warn("Expenses history could not be loaded.", err);
      } finally {
        panel?.classList.remove("ev2-loading");
        loading = null;
      }
    })();
    return loading;
  }

  function setHistory(on, { focus = false } = {}){
    on = !!on;
    const was = isOpen();
    document.body.classList.toggle(OPEN_CLASS, on);
    syncHead(on);
    if (on) {
      loadHistory();
      if (focus) requestAnimationFrame(() => document.getElementById("searchExpenses")?.focus());
    }
    if (on !== was) {
      const head = document.getElementById("walletsOverviewSection");
      const top = head ? head.getBoundingClientRect().top + global.scrollY - 12 : 0;
      if (global.scrollY > top) global.scrollTo({ top, behavior: "auto" });
    }
  }

  // Segmented buttons for Records and Date. The original selects stay in the page (hidden) and
  // stay the source of truth: a click sets the select and fires its normal "change" handler.
  const SEGMENTS = [
    { id: "expenseRecordsViewFilter", wrap: ".expense-record-view-control", label: "Records", cls: "" },
    { id: "expenseDateRangeFilter", wrap: ".expense-date-range-control", label: "Date range", cls: " ev2-seg--dates" }
  ];
  function buildSegments(){
    SEGMENTS.forEach(seg => {
      const select = document.getElementById(seg.id);
      const host = select?.closest(seg.wrap);
      if (!select || !host || host.dataset.ev2Seg) return;
      host.dataset.ev2Seg = "1";
      const group = document.createElement("div");
      group.className = "ev2-seg" + seg.cls;
      group.setAttribute("role", "radiogroup");
      group.setAttribute("aria-label", seg.label);
      group.dataset.for = seg.id;
      Array.from(select.options).forEach(opt => {
        const b = document.createElement("button");
        b.type = "button";
        b.setAttribute("role", "radio");
        b.dataset.value = opt.value;
        b.textContent = opt.value === "transfers" ? "Transfers" : opt.value === "custom" ? "Custom" : opt.textContent.trim();
        group.appendChild(b);
      });
      group.addEventListener("click", e => {
        const b = e.target.closest("button[data-value]");
        if (!b || select.value === b.dataset.value && b.dataset.value !== "custom") return;
        select.value = b.dataset.value;
        syncSegments();
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      select.addEventListener("change", syncSegments);
      host.classList.add("ev2-replaced");
      host.insertAdjacentElement("afterend", group);
    });
    syncSegments();
  }
  // "Expenses ▾" beside Add: Expenses / Receiving / Transfers (drives the records select).
  const VIEW_LABELS = { history: "Expenses", topups: "Receiving", transfers: "Transfers" };
  function syncViewMenu(){
    const value = document.getElementById("expenseRecordsViewFilter")?.value || "history";
    const label = document.getElementById("ev2ViewLabel");
    if (label) label.textContent = VIEW_LABELS[value] || "Expenses";
    document.querySelectorAll("[data-ev2-view]").forEach(b => b.setAttribute("aria-checked", b.dataset.ev2View === value ? "true" : "false"));
  }
  function bindViewMenu(){
    const panel = document.querySelector('[data-entry-menu-panel="expenses-view"]');
    if (!panel || panel.dataset.ev2Bound) return;
    panel.dataset.ev2Bound = "1";
    panel.addEventListener("click", e => {
      const b = e.target.closest("[data-ev2-view]");
      if (!b) return;
      e.stopPropagation();
      panel.classList.remove("open");
      document.getElementById("ev2ViewBtn")?.setAttribute("aria-expanded", "false");
      const select = document.getElementById("expenseRecordsViewFilter");
      if (!select) return;
      if (!isOpen()) setHistory(true);
      if (select.value !== b.dataset.ev2View) {
        select.value = b.dataset.ev2View;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
      syncSegments();
    });
  }

  function syncSegments(){
    syncViewMenu();
    document.querySelectorAll("#expensesPanel .ev2-seg[data-for]").forEach(group => {
      const value = document.getElementById(group.dataset.for)?.value;
      group.querySelectorAll("button[data-value]").forEach(b => b.setAttribute("aria-checked", b.dataset.value === value ? "true" : "false"));
    });
  }

  // The history blocks (Expenses / Receiving / Transfers) sit directly on the page and never
  // collapse: kept open, and a click on the block heading does not close it.
  function openBlocks(){
    document.querySelectorAll("#expensesList details.expense-collapsible-section:not([open])").forEach(d => { d.open = true; });
  }
  function bindBlocks(){
    const list = document.getElementById("expensesList");
    if (!list || list.dataset.ev2Blocks) return;
    list.dataset.ev2Blocks = "1";
    list.addEventListener("click", e => {
      const head = e.target.closest("summary.expense-collapsible-header");
      if (!head || e.target.closest("button, a, input, select, [role='menu']")) return;
      e.preventDefault();
    }, true);
    list.addEventListener("keydown", e => {
      if ((e.key === "Enter" || e.key === " ") && e.target.matches?.("summary.expense-collapsible-header")) e.preventDefault();
    }, true);
  }

  const openHistory = () => setHistory(true);
  const toggleHistory = () => setHistory(!isOpen());

  function bind(){
    syncHead(false);
    try { buildSegments(); } catch (err) { console.warn("Expenses filters could not be built.", err); }
    bindBlocks();
    bindViewMenu();
    // Keep the buttons in step when the app changes the selects itself.
    if (typeof global.renderExpensesList === "function" && !global.renderExpensesList.__ev2) {
      const original = global.renderExpensesList;
      const wrapped = function(){ const out = original.apply(this, arguments); try { syncSegments(); openBlocks(); } catch (_) {} return out; };
      wrapped.__ev2 = true;
      global.renderExpensesList = wrapped;
    }
    document.getElementById("ev2HistoryBtn")?.addEventListener("click", toggleHistory);
    // "Add" (#ev2AddBtn) opens the New Entry menu (shared menu code in 02-bindings.js).
    // Ctrl+Alt+F (search expenses) opens the history first.
    document.addEventListener("keydown", e => {
      if (!(e.ctrlKey && e.altKey && String(e.key).toLowerCase() === "f")) return;
      if (typeof getActiveTabKey === "function" && getActiveTabKey() !== "expenses") return;
      if (!isOpen()) setHistory(true, { focus: true });
    }, true);
    global.addEventListener("hashchange", () => { if (location.hash === "#expensesPanel") openHistory(); });
    // Leaving Expenses resets the view, so it always opens on the wallets.
    // Opening Expenses builds the wallets if they changed while another section was open.
    const panel = document.getElementById("expensesPanel");
    if (panel && typeof MutationObserver === "function") {
      new MutationObserver(() => {
        const active = panel.classList.contains("active");
        if (!active && isOpen()) setHistory(false);
        if (active && state.expenseLazy?.walletsDirty && typeof renderExpenseOverviewWallets === "function") {
          try { renderExpenseOverviewWallets(); } catch (err) { console.error(err); }
        }
      }).observe(panel, { attributes: true, attributeFilter: ["class"] });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, { once: true });
  else bind();

  global.TriplemExpensesV2 = { openHistory, toggleHistory, setHistory, isHistoryOpen: isOpen };
})(typeof window !== "undefined" ? window : globalThis);
