/* Dashboard Financial Timeline — read-only chronological workspace view. */
(function(){
  "use strict";

  const timelineState = {
    bound: false,
    active: false,
    loaded: false,
    loading: false,
    items: [],
    hasMore: false,
    nextBefore: null,
    module: "",
    currency: "",
    range: "90",
    search: "",
    requestSeq: 0,
    searchTimer: null
  };

  const MODULES = [
    ["", "All activity", "fa-solid fa-stream"],
    ["expenses", "Expenses", "fa-solid fa-wallet"],
    ["loans", "Loans", "fa-solid fa-hand-holding-dollar"],
    ["installments", "Installments", "fa-solid fa-calendar-check"],
    ["inventory", "Inventory", "fa-solid fa-boxes-stacked"],
    ["assets", "Assets", "fa-solid fa-building"],
    ["accounting", "Accounting", "fa-solid fa-book"],
    ["notes", "Notes", "fa-solid fa-note-sticky"],
    ["bitcoin", "Bitcoin", "fa-brands fa-bitcoin"]
  ];

  const ICONS = {
    expense: "fa-solid fa-receipt",
    top_up: "fa-solid fa-arrow-down",
    wallet_transfer: "fa-solid fa-arrow-right-arrow-left",
    loan: "fa-solid fa-hand-holding-dollar",
    loan_payment: "fa-solid fa-money-bill-transfer",
    installment_plan: "fa-solid fa-calendar-check",
    inventory_item: "fa-solid fa-box",
    inventory_sale: "fa-solid fa-bag-shopping",
    asset: "fa-solid fa-building",
    document: "fa-solid fa-file-invoice",
    bank_transaction: "fa-solid fa-building-columns",
    note: "fa-solid fa-note-sticky",
    bitcoin_wallet: "fa-brands fa-bitcoin"
  };

  const esc = (value) => typeof escapeHtml === "function"
    ? escapeHtml(String(value == null ? "" : value))
    : String(value == null ? "" : value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));

  function timelineRoots(){
    return {
      tabs: document.querySelector(".dashboard-main-tabs"),
      overview: document.getElementById("dashboardOverviewView"),
      timeline: document.getElementById("financialTimelineView"),
      root: document.getElementById("financialTimelineRoot")
    };
  }

  function formatTimelineDate(value){
    if (!value) return "Unknown date";
    try {
      const date = new Date(`${String(value).slice(0,10)}T12:00:00`);
      if (Number.isNaN(date.getTime())) return String(value);
      const today = new Date();
      const yesterday = new Date(today); yesterday.setDate(today.getDate()-1);
      const key = date.toISOString().slice(0,10);
      if (key === today.toISOString().slice(0,10)) return "Today";
      if (key === yesterday.toISOString().slice(0,10)) return "Yesterday";
      return date.toLocaleDateString(undefined,{weekday:"short",day:"numeric",month:"short",year:date.getFullYear()===today.getFullYear()?undefined:"numeric"});
    } catch (_) { return String(value); }
  }

  function formatTimelineTime(value){
    const d = value ? new Date(value) : null;
    if (!d || Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"});
  }

  function moneyHtml(value, currency, flow){
    if (value == null || value === "" || !currency) return "";
    const n = Number(value || 0);
    const formatted = typeof formatReportAmount === "function" ? formatReportAmount(n, currency) : `${currency} ${n.toLocaleString()}`;
    const prefix = flow === "inflow" ? "+" : flow === "outflow" ? "−" : "";
    const body = typeof currencyTextHtml === "function" ? currencyTextHtml(formatted, currency) : esc(formatted);
    return `<span class="timeline-amount is-${esc(flow || "neutral")}">${prefix}${body}</span>`;
  }

  function moduleMeta(module){
    return MODULES.find(row => row[0] === module) || [module || "", module || "Activity", "fa-solid fa-circle"];
  }

  function rangeFrom(){
    const days = Number(timelineState.range || 0);
    if (!days) return null;
    const d = new Date();
    d.setHours(12,0,0,0);
    d.setDate(d.getDate() - days + 1);
    return d.toISOString().slice(0,10);
  }

  function allCurrencies(){ return window.TriplemCurrencyRegistry?.codes?.() || []; }

  function totalByCurrency(flow){
    const out = new Map();
    timelineState.items.forEach(item => {
      if (item.flow !== flow || !item.currency || item.amount == null) return;
      out.set(item.currency,(out.get(item.currency)||0)+Number(item.amount||0));
    });
    return out;
  }

  function totalsHtml(map){
    if (!map.size) return `<span class="timeline-summary-empty">0</span>`;
    return Array.from(map.entries()).map(([currency,value]) => {
      const text = typeof formatReportAmount === "function" ? formatReportAmount(value,currency) : `${currency} ${value.toLocaleString()}`;
      return `<span class="timeline-summary-currency">${typeof currencyTextHtml === "function" ? currencyTextHtml(text,currency) : esc(text)}</span>`;
    }).join("");
  }

  function netByCurrency(items = timelineState.items){
    const out = new Map();
    items.forEach(item => {
      if (!item.currency || item.amount == null) return;
      const amount = Number(item.amount || 0);
      if (item.flow === "inflow") out.set(item.currency, (out.get(item.currency) || 0) + amount);
      if (item.flow === "outflow") out.set(item.currency, (out.get(item.currency) || 0) - amount);
    });
    return out;
  }

  function summaryHtml(){
    return `<div class="timeline-summary-grid">
      <article><span>Events</span><strong>${timelineState.items.length}</strong></article>
      <article class="is-inflow"><span>Inflow</span><strong>${totalsHtml(totalByCurrency("inflow"))}</strong></article>
      <article class="is-outflow"><span>Outflow</span><strong>${totalsHtml(totalByCurrency("outflow"))}</strong></article>
      <article><span>Net</span><strong>${totalsHtml(netByCurrency())}</strong></article>
    </div>`;
  }

  function filtersHtml(){
    return `<div class="timeline-toolbar">
      <label class="timeline-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input id="timelineSearchInput" type="search" value="${esc(timelineState.search)}" placeholder="Search activity" autocomplete="off"></label>
      <select id="timelineModuleFilter" class="timeline-filter" aria-label="Module">
        ${MODULES.map(([value,label])=>`<option value="${esc(value)}"${timelineState.module===value?" selected":""}>${esc(label)}</option>`).join("")}
      </select>
      <select id="timelineCurrencyFilter" class="timeline-filter" aria-label="Currency">
        <option value="">All currencies</option>${allCurrencies().map(cur=>`<option value="${cur}"${timelineState.currency===cur?" selected":""}>${cur}</option>`).join("")}
      </select>
      <select id="timelineRangeFilter" class="timeline-filter" aria-label="Period">
        <option value="30"${timelineState.range==="30"?" selected":""}>30 days</option>
        <option value="90"${timelineState.range==="90"?" selected":""}>90 days</option>
        <option value="365"${timelineState.range==="365"?" selected":""}>1 year</option>
        <option value="0"${timelineState.range==="0"?" selected":""}>All time</option>
      </select>
      <button type="button" class="timeline-refresh-btn" id="timelineRefreshBtn" title="Refresh" aria-label="Refresh Financial Timeline"><i class="fa-solid fa-rotate-right"></i></button>
    </div>`;
  }

  function eventCardHtml(item){
    const meta = moduleMeta(item.module);
    const icon = ICONS[item.record_type] || meta[2];
    const amount = moneyHtml(item.amount,item.currency,item.flow);
    const secondary = item.secondary_amount != null && item.secondary_currency
      ? `<span class="timeline-secondary-amount">→ ${moneyHtml(item.secondary_amount,item.secondary_currency,"neutral")}</span>` : "";
    const status = item.status ? `<span class="timeline-status">${esc(String(item.status).replace(/_/g," "))}</span>` : "";
    return `<button type="button" class="timeline-event-card is-${esc(item.flow || "neutral")}" data-timeline-key="${esc(item.event_key)}">
      <span class="timeline-event-icon"><i class="${esc(icon)}" aria-hidden="true"></i></span>
      <span class="timeline-event-main">
        <span class="timeline-event-kicker"><b>${esc(item.event_label || meta[1])}</b><em>${esc(meta[1])}</em>${status}</span>
        <strong>${esc(item.title || item.event_label || "Activity")}</strong>
        ${item.subtitle ? `<small>${esc(item.subtitle)}</small>` : ""}
      </span>
      <span class="timeline-event-side">${amount}${secondary}<time>${esc(formatTimelineTime(item.event_ts))}</time></span>
      <i class="fa-solid fa-chevron-right timeline-event-open" aria-hidden="true"></i>
    </button>`;
  }

  function timelineListHtml(){
    if (!timelineState.items.length) {
      return `<div class="timeline-empty"><i class="fa-regular fa-clock"></i><strong>No matching activity</strong><span>Try a wider period or clear the filters.</span></div>`;
    }
    const groups = new Map();
    timelineState.items.forEach(item => {
      const key = String(item.event_date || "Unknown");
      if (!groups.has(key)) groups.set(key,[]);
      groups.get(key).push(item);
    });
    return Array.from(groups.entries()).map(([date,items])=>`<section class="timeline-day">
      <header><div><strong>${esc(formatTimelineDate(date))}</strong><span>${items.length} event${items.length===1?"":"s"}</span><small class="timeline-day-net">Net ${totalsHtml(netByCurrency(items))}</small></div></header>
      <div class="timeline-day-list">${items.map(eventCardHtml).join("")}</div>
    </section>`).join("");
  }

  function render(){
    const { root } = timelineRoots();
    if (!root) return;
    root.innerHTML = `${filtersHtml()}${summaryHtml()}<div class="timeline-stream" aria-live="polite">${timelineListHtml()}</div>${timelineState.hasMore?`<div class="timeline-more-wrap"><button type="button" class="btn ghost timeline-more-btn" id="timelineLoadMoreBtn">Load more</button></div>`:""}`;
    bindRootControls(root);
  }

  function renderLoading(reset){
    const { root } = timelineRoots();
    if (!root) return;
    if (!reset && timelineState.items.length) {
      root.querySelector("#timelineLoadMoreBtn")?.setAttribute("disabled","");
      return;
    }
    root.innerHTML = `${filtersHtml()}<div class="timeline-loading" aria-busy="true"><span></span><span></span><span></span></div>`;
    bindRootControls(root);
  }

  function normalizeResult(result){
    if (typeof unwrapRpcJson === "function") return unwrapRpcJson(result);
    return result?.data ?? result;
  }

  async function loadTimeline({ reset = true } = {}){
    const { root } = timelineRoots();
    if (!root || timelineState.loading) return;
    if (typeof isGuestMode === "function" && isGuestMode()) {
      timelineState.items=[]; timelineState.hasMore=false; timelineState.loaded=true;
      root.innerHTML=`<div class="timeline-empty"><i class="fa-solid fa-lock"></i><strong>Signed-in timeline</strong><span>Financial Timeline uses your authenticated workspace records.</span></div>`;
      return;
    }
    timelineState.loading=true;
    const seq=++timelineState.requestSeq;
    if (reset) { timelineState.nextBefore=null; renderLoading(true); } else renderLoading(false);
    try {
      const raw = await supabaseRpc("app_get_my_financial_timeline", {
        p_limit: 50,
        p_before: reset ? null : timelineState.nextBefore,
        p_module: timelineState.module || null,
        p_currency: timelineState.currency || null,
        p_from: rangeFrom(),
        p_to: null,
        p_search: timelineState.search || null
      });
      if (seq !== timelineState.requestSeq) return;
      const result=normalizeResult(raw)||{};
      if (result.ok===false) throw new Error(result.error||"Timeline could not be loaded.");
      const rows=Array.isArray(result.items)?result.items:[];
      const seen=new Set(reset?[]:timelineState.items.map(item=>item.event_key));
      const next=rows.filter(row=>row?.event_key&&!seen.has(row.event_key));
      timelineState.items=reset?next:[...timelineState.items,...next];
      timelineState.hasMore=!!result.has_more;
      timelineState.nextBefore=result.next_before||null;
      timelineState.loaded=true;
      render();
    } catch (error) {
      console.error("Financial Timeline load failed:",error);
      root.innerHTML=`${filtersHtml()}<div class="timeline-empty is-error"><i class="fa-solid fa-triangle-exclamation"></i><strong>Timeline unavailable</strong><span>${esc(error?.message||"Could not load financial activity.")}</span><button type="button" class="btn ghost tiny" id="timelineRetryBtn">Retry</button></div>`;
      bindRootControls(root);
    } finally {
      timelineState.loading=false;
    }
  }

  function bindRootControls(root){
    root.querySelector("#timelineModuleFilter")?.addEventListener("change",e=>{timelineState.module=e.target.value;loadTimeline({reset:true});});
    root.querySelector("#timelineCurrencyFilter")?.addEventListener("change",e=>{timelineState.currency=e.target.value;loadTimeline({reset:true});});
    root.querySelector("#timelineRangeFilter")?.addEventListener("change",e=>{timelineState.range=e.target.value;loadTimeline({reset:true});});
    root.querySelector("#timelineRefreshBtn")?.addEventListener("click",()=>loadTimeline({reset:true}));
    root.querySelector("#timelineRetryBtn")?.addEventListener("click",()=>loadTimeline({reset:true}));
    root.querySelector("#timelineLoadMoreBtn")?.addEventListener("click",()=>loadTimeline({reset:false}));
    const search=root.querySelector("#timelineSearchInput");
    search?.addEventListener("input",e=>{
      timelineState.search=e.target.value.trim();
      clearTimeout(timelineState.searchTimer);
      timelineState.searchTimer=setTimeout(()=>loadTimeline({reset:true}),320);
    });
    root.querySelectorAll("[data-timeline-key]").forEach(card=>card.addEventListener("click",()=>openEvent(card.dataset.timelineKey)));
  }

  async function openEvent(key){
    const item=timelineState.items.find(row=>row.event_key===key);
    if (!item) return;
    const record={
      module:item.module,
      record_type:item.record_type,
      record_id:item.record_id,
      group_id:item.group_id,
      parent_id:item.parent_id,
      title:item.title,
      record_date:item.event_date,
      details:item.details||{},
      currency:item.currency,
      amount:item.amount,
      status:item.status
    };
    if (typeof window.openTriplemAiRecord === "function") {
      try { await window.openTriplemAiRecord(record); return; } catch (error) { console.warn("Timeline record overlay failed",error); }
    }
  }

  function setMainView(view,{load=true}={}){
    const { tabs,overview,timeline }=timelineRoots();
    if (!tabs||!overview||!timeline) return;
    const next=view==="timeline"?"timeline":"overview";
    timelineState.active=next==="timeline";
    overview.classList.toggle("hide",timelineState.active);
    timeline.classList.toggle("hide",!timelineState.active);
    tabs.querySelectorAll("[data-dashboard-main-view]").forEach(btn=>{
      const active=btn.dataset.dashboardMainView===next;
      btn.classList.toggle("active",active);
      btn.setAttribute("aria-selected",active?"true":"false");
    });
    try { localStorage.setItem("triplem-dashboard-main-view",next); } catch (_) {}
    if (timelineState.active&&load&&(!timelineState.loaded||!timelineState.items.length)) loadTimeline({reset:true});
  }

  function bind(){
    if (timelineState.bound) return;
    const { tabs }=timelineRoots();
    if (!tabs) return;
    timelineState.bound=true;
    tabs.addEventListener("click",e=>{
      const btn=e.target.closest("[data-dashboard-main-view]");
      if (!btn||!tabs.contains(btn)) return;
      setMainView(btn.dataset.dashboardMainView);
    });
    let saved="overview";
    try { saved=localStorage.getItem("triplem-dashboard-main-view")||"overview"; } catch (_) {}
    setMainView(saved,{load:false});
  }

  window.prepareFinancialTimelineDashboard=function(){
    bind();
    if (timelineState.active) return loadTimeline({reset:!timelineState.loaded});
  };
  window.refreshFinancialTimeline=function(){ if(timelineState.active) return loadTimeline({reset:true}); };
  window.setDashboardMainView=setMainView;
  bind();
})();
