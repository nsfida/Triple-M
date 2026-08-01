/* Admin Analytics overlay — site traffic dashboard (requires Admin unlock). */
function analyticsEscapeHtml(str){
  if (typeof escapeHtml === "function") return escapeHtml(str);
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const adminAnalyticsState = {
  range: "7d",
  data: null,
  pollTimer: null,
  loading: false,
  bound: false
};

function formatAnalyticsCount(n){
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return "0";
  if (v >= 1000000) return `${(v / 1000000).toFixed(1).replace(/\.0$/, "")}M`;
  if (v >= 10000) return `${Math.round(v / 1000)}k`;
  if (v >= 1000) return `${(v / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(Math.round(v));
}

function formatAnalyticsDuration(seconds){
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return r ? `${m}m ${r}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}

function formatAnalyticsWhen(iso){
  if (!iso) return "—";
  try {
    if (typeof formatRelativeTime === "function") return formatRelativeTime(iso);
  } catch (_) {}
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function analyticsBarRows(items, valueKey = "count", labelKey = "label"){
  const list = Array.isArray(items) ? items : [];
  const max = Math.max(1, ...list.map(i => Number(i?.[valueKey] || 0)));
  if (!list.length) return `<div class="admin-analytics-empty">No data yet</div>`;
  return list.map(item => {
    const value = Number(item?.[valueKey] || 0);
    const pct = Math.max(4, Math.round((value / max) * 100));
    const label = String(item?.[labelKey] || item?.path || item?.name || "—");
    const detail = item?.detail ? String(item.detail) : "";
    const full = detail ? `${label} · ${detail}` : label;
    return `
      <div class="admin-analytics-bar-row">
        <div class="admin-analytics-bar-meta">
          <span class="admin-analytics-bar-label" title="${analyticsEscapeHtml(full)}">${analyticsEscapeHtml(full)}</span>
          <strong>${analyticsEscapeHtml(formatAnalyticsCount(value))}</strong>
        </div>
        <div class="admin-analytics-bar-track"><span style="width:${pct}%"></span></div>
      </div>`;
  }).join("");
}

function analyticsDeviceRows(devices){
  const d = devices || {};
  const items = [
    { label: "Mobile", count: d.mobile || 0 },
    { label: "Tablet", count: d.tablet || 0 },
    { label: "Desktop", count: d.desktop || 0 }
  ].filter(x => x.count > 0);
  if (!items.length) {
    return analyticsBarRows([
      { label: "Mobile", count: 0 },
      { label: "Tablet", count: 0 },
      { label: "Desktop", count: 0 }
    ]);
  }
  return analyticsBarRows(items);
}

function analyticsSourceRows(sources){
  const s = sources || {};
  const items = [
    { label: "Direct", count: s.direct || 0 },
    { label: "Search", count: s.search || 0 },
    { label: "Referral", count: s.referral || 0 },
    { label: "Social", count: s.social || 0 },
    { label: "Campaign", count: s.campaign || 0 }
  ].filter(x => x.count > 0);
  return analyticsBarRows(items.length ? items : [{ label: "Direct", count: 0 }]);
}

function analyticsSeriesSpark(series){
  const rows = Array.isArray(series) ? series.slice(-14) : [];
  if (!rows.length) return `<div class="admin-analytics-empty">No daily series yet</div>`;
  const max = Math.max(1, ...rows.map(r => Number(r.sessions || 0)));
  return `
    <div class="admin-analytics-spark" aria-hidden="true">
      ${rows.map(r => {
        const v = Number(r.sessions || 0);
        const h = Math.max(8, Math.round((v / max) * 100));
        const day = String(r.day || "").slice(5);
        return `<div class="admin-analytics-spark-col" title="${analyticsEscapeHtml(String(r.day || ""))}: ${v} visits">
          <span style="height:${h}%"></span>
          <small>${analyticsEscapeHtml(day)}</small>
        </div>`;
      }).join("")}
    </div>`;
}

function analyticsTimelineHtml(timeline){
  const items = Array.isArray(timeline) ? timeline : [];
  if (!items.length) return `<div class="admin-analytics-empty">No recent activity</div>`;
  return items.map(item => {
    const kind = String(item.kind || "event");
    const icon = kind === "pageview" ? "fa-eye"
      : kind === "session" ? "fa-user-clock"
      : "fa-computer-mouse";
    const detailBits = [
      item.detail,
      item.device,
      item.source
    ].filter(Boolean).map(String);
    return `
      <div class="admin-analytics-timeline-item">
        <div class="admin-analytics-timeline-icon ${analyticsEscapeHtml(kind)}"><i class="fa-solid ${icon}"></i></div>
        <div class="admin-analytics-timeline-body">
          <p class="admin-analytics-timeline-title">${analyticsEscapeHtml(String(item.label || kind))}</p>
          ${detailBits.length ? `<p class="admin-analytics-timeline-detail">${analyticsEscapeHtml(detailBits.join(" · "))}</p>` : ""}
          <span class="admin-analytics-timeline-meta">${analyticsEscapeHtml(formatAnalyticsWhen(item.at))}</span>
        </div>
      </div>`;
  }).join("");
}

function ensureAdminAnalyticsModal(){
  let modal = document.getElementById("adminAnalyticsModal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "adminAnalyticsModal";
  modal.className = "modal hide";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="modal-backdrop" data-admin-analytics-close></div>
    <div class="modal-dialog admin-modal-dialog admin-analytics-dialog" role="dialog" aria-modal="true" aria-labelledby="adminAnalyticsTitle">
      <div class="modal-head">
        <div>
          <h3 id="adminAnalyticsTitle">Analytics</h3>
          <p>Live website traffic, engagement, and visitor insights.</p>
        </div>
        <button type="button" class="btn ghost tiny" data-admin-analytics-close aria-label="Close">✕</button>
      </div>
      <div class="modal-body admin-analytics-body">
        <div class="admin-analytics-toolbar">
          <div class="admin-analytics-ranges" role="group" aria-label="Date range">
            <button type="button" class="btn soft tiny admin-analytics-range" data-analytics-range="today">Today</button>
            <button type="button" class="btn soft tiny admin-analytics-range is-active" data-analytics-range="7d">7 days</button>
            <button type="button" class="btn soft tiny admin-analytics-range" data-analytics-range="30d">30 days</button>
            <button type="button" class="btn soft tiny admin-analytics-range" data-analytics-range="all">All</button>
          </div>
          <button type="button" class="btn soft tiny admin-tool-btn admin-tool-btn--icon" id="adminAnalyticsRefreshBtn" title="Refresh" aria-label="Refresh">
            <i class="fa-solid fa-rotate"></i>
          </button>
          <span class="admin-analytics-hint" id="adminAnalyticsHint">Loading…</span>
        </div>
        <div class="admin-analytics-summary" id="adminAnalyticsSummary"></div>
        <div class="admin-analytics-grid">
          <section class="admin-analytics-card admin-analytics-card--wide">
            <h4>Visits over time</h4>
            <div id="adminAnalyticsSeries"></div>
          </section>
          <section class="admin-analytics-card">
            <h4>Devices</h4>
            <div id="adminAnalyticsDevices"></div>
          </section>
          <section class="admin-analytics-card">
            <h4>Traffic sources</h4>
            <div id="adminAnalyticsSources"></div>
          </section>
          <section class="admin-analytics-card">
            <h4>Top pages</h4>
            <div id="adminAnalyticsPages"></div>
          </section>
          <section class="admin-analytics-card">
            <h4>Top interactions</h4>
            <div id="adminAnalyticsEvents"></div>
          </section>
          <section class="admin-analytics-card">
            <h4>Browsers</h4>
            <div id="adminAnalyticsBrowsers"></div>
          </section>
          <section class="admin-analytics-card admin-analytics-card--wide">
            <h4>Activity timeline</h4>
            <div class="admin-analytics-timeline" id="adminAnalyticsTimeline"></div>
          </section>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);

  modal.querySelectorAll("[data-admin-analytics-close]").forEach(el => {
    el.addEventListener("click", () => closeAdminAnalyticsModal());
  });
  modal.querySelector("#adminAnalyticsRefreshBtn")?.addEventListener("click", () => {
    loadAdminAnalyticsSummary({ silent: false });
  });
  modal.querySelectorAll("[data-analytics-range]").forEach(btn => {
    btn.addEventListener("click", () => {
      adminAnalyticsState.range = btn.getAttribute("data-analytics-range") || "7d";
      modal.querySelectorAll("[data-analytics-range]").forEach(b => {
        b.classList.toggle("is-active", b === btn);
      });
      loadAdminAnalyticsSummary({ silent: false });
    });
  });
  return modal;
}

function renderAdminAnalyticsSummary(data){
  const modal = document.getElementById("adminAnalyticsModal");
  if (!modal || !data) return;
  const totals = data.totals || {};
  const summary = modal.querySelector("#adminAnalyticsSummary");
  if (summary) {
    summary.innerHTML = `
      <div class="admin-analytics-stat"><small>Visits</small><strong>${analyticsEscapeHtml(formatAnalyticsCount(totals.visits))}</strong></div>
      <div class="admin-analytics-stat"><small>Unique visitors</small><strong>${analyticsEscapeHtml(formatAnalyticsCount(totals.unique_visitors))}</strong></div>
      <div class="admin-analytics-stat"><small>Page views</small><strong>${analyticsEscapeHtml(formatAnalyticsCount(totals.pageviews))}</strong></div>
      <div class="admin-analytics-stat"><small>Interactions</small><strong>${analyticsEscapeHtml(formatAnalyticsCount(totals.events))}</strong></div>
      <div class="admin-analytics-stat"><small>Avg. session</small><strong>${analyticsEscapeHtml(formatAnalyticsDuration(totals.avg_session_seconds))}</strong></div>`;
  }

  const seriesEl = modal.querySelector("#adminAnalyticsSeries");
  if (seriesEl) seriesEl.innerHTML = analyticsSeriesSpark(data.series);

  const devicesEl = modal.querySelector("#adminAnalyticsDevices");
  if (devicesEl) devicesEl.innerHTML = analyticsDeviceRows(data.devices);

  const sourcesEl = modal.querySelector("#adminAnalyticsSources");
  if (sourcesEl) sourcesEl.innerHTML = analyticsSourceRows(data.sources);

  const pagesEl = modal.querySelector("#adminAnalyticsPages");
  if (pagesEl) {
    pagesEl.innerHTML = analyticsBarRows(
      (data.top_pages || []).map(p => ({ label: p.path, count: p.views })),
      "count",
      "label"
    );
  }

  const eventsEl = modal.querySelector("#adminAnalyticsEvents");
  if (eventsEl) {
    eventsEl.innerHTML = analyticsBarRows(
      (data.top_events || []).map(e => ({
        label: e.name,
        detail: e.label,
        count: e.count
      })),
      "count",
      "label"
    );
  }

  const browsersEl = modal.querySelector("#adminAnalyticsBrowsers");
  if (browsersEl) {
    browsersEl.innerHTML = analyticsBarRows(
      (data.browsers || []).map(b => ({ label: b.browser, count: b.count })),
      "count",
      "label"
    );
  }

  const timelineEl = modal.querySelector("#adminAnalyticsTimeline");
  if (timelineEl) timelineEl.innerHTML = analyticsTimelineHtml(data.timeline);

  const hint = modal.querySelector("#adminAnalyticsHint");
  if (hint) {
    const at = totals.generated_at || data.totals?.generated_at;
    hint.textContent = at ? `Updated ${formatAnalyticsWhen(at)} · live` : "Live";
  }
}

async function loadAdminAnalyticsSummary(options = {}){
  const silent = !!options.silent;
  const modal = document.getElementById("adminAnalyticsModal");
  if (!modal || modal.classList.contains("hide")) return;
  if (adminAnalyticsState.loading) return;
  adminAnalyticsState.loading = true;
  const hint = modal.querySelector("#adminAnalyticsHint");
  if (hint && !silent) hint.textContent = "Refreshing…";
  try {
    const data = await supabaseRpc("app_admin_analytics_summary", {
      p_range: adminAnalyticsState.range || "7d"
    });
    adminAnalyticsState.data = data;
    renderAdminAnalyticsSummary(data);
  } catch (err) {
    if (hint) hint.textContent = err?.message || "Could not load analytics";
    if (!silent && !adminAnalyticsState.data) {
      const summary = modal.querySelector("#adminAnalyticsSummary");
      if (summary) {
        summary.innerHTML = `<div class="admin-analytics-empty">${analyticsEscapeHtml(err?.message || "Could not load analytics")}</div>`;
      }
    }
  } finally {
    adminAnalyticsState.loading = false;
  }
}

function stopAdminAnalyticsPolling(){
  if (adminAnalyticsState.pollTimer) {
    clearInterval(adminAnalyticsState.pollTimer);
    adminAnalyticsState.pollTimer = null;
  }
}

function startAdminAnalyticsPolling(){
  stopAdminAnalyticsPolling();
  adminAnalyticsState.pollTimer = setInterval(() => {
    const modal = document.getElementById("adminAnalyticsModal");
    if (!modal || modal.classList.contains("hide")) {
      stopAdminAnalyticsPolling();
      return;
    }
    loadAdminAnalyticsSummary({ silent: true }).catch(() => {});
  }, 12000);
}

function closeAdminAnalyticsModal(){
  const modal = document.getElementById("adminAnalyticsModal");
  stopAdminAnalyticsPolling();
  if (!modal) return;
  modal.classList.add("hide");
  modal.setAttribute("aria-hidden", "true");
  if (!document.querySelector(".modal:not(.hide)")) {
    document.body.style.overflow = "";
  }
}

async function openAdminAnalyticsModal(){
  const modal = ensureAdminAnalyticsModal();
  modal.querySelectorAll("[data-analytics-range]").forEach(btn => {
    btn.classList.toggle("is-active", btn.getAttribute("data-analytics-range") === adminAnalyticsState.range);
  });
  modal.classList.remove("hide");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  await loadAdminAnalyticsSummary({ silent: false });
  startAdminAnalyticsPolling();
}

function bindAdminAnalyticsUi(){
  if (adminAnalyticsState.bound) return;
  adminAnalyticsState.bound = true;
  const btn = document.getElementById("adminAnalyticsBtn");
  if (btn) {
    btn.addEventListener("click", () => {
      openAdminAnalyticsModal().catch(err => {
        alert(err?.message || "Could not open analytics.");
      });
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const modal = document.getElementById("adminAnalyticsModal");
    if (modal && !modal.classList.contains("hide")) closeAdminAnalyticsModal();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bindAdminAnalyticsUi);
} else {
  bindAdminAnalyticsUi();
}
