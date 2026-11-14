/* Triplem VIP · Admin user manager (2026-11-14)
 *
 * Admin → click a user opens this panel. It replaces the old "User management" dialog, which
 * stacked an Edit dialog and a Plan dialog on top of each other, showed old information after a
 * change and lost changes unless a separate box was ticked.
 *
 * Layout: the Home Style side panel design. A header with the account and its status, tabs
 * (Overview · Plan · Sections · Company · Team · Security · Data), small section labels.
 * Every change is saved by itself the moment it is made (a switch, a chip, an Apply/Save
 * button), the result is read back from the server and shown straight away, and every error is
 * shown in the panel. Nothing here changes data the admin did not touch.
 *
 * Server functions: the existing admin RPCs, plus migration 228 (devices, activity and the
 * "sign out on every device" action) and 227 (test account password). Without them those two
 * parts say so and everything else keeps working.
 */
(function initTriplemAdminUserManager(global){
  "use strict";

  const TABS = [
    ["overview", "Overview", "fa-solid fa-gauge-high"],
    ["plan", "Plan", "fa-solid fa-calendar-check"],
    ["sections", "Sections", "fa-solid fa-table-cells-large"],
    ["company", "Company", "fa-solid fa-building"],
    ["team", "Team", "fa-solid fa-users"],
    ["security", "Security", "fa-solid fa-shield-halved"],
    ["data", "Data", "fa-solid fa-database"]
  ];
  // Sections that are switched one by one. Accounting, Insurance, Bitcoin and Inventory have
  // their own controls because each one does more than show a tab.
  const SECTION_SWITCHES = [
    ["dashboard", "Dashboard", "Live figures, charts and performance", "fa-solid fa-chart-pie"],
    ["expenses", "Expenses & wallets", "Wallets, spending, receipts and transfers", "fa-solid fa-wallet"],
    ["loans", "Loans", "Money given and taken, with repayments", "fa-solid fa-hand-holding-dollar"],
    ["installments", "Installments", "Bought and sold payment plans", "fa-solid fa-calendar-days"],
    ["assets", "Assets & depreciation", "Asset records, depreciation and value", "fa-solid fa-building-columns"],
    ["notes", "Notes", "Notes and reminders", "fa-solid fa-note-sticky"],
    ["reports", "Reports & PDF export", "Audit report, PDF and CSV downloads", "fa-solid fa-file-pdf"],
    ["currency_settings", "Currency & settings", "Currency and VAT settings", "fa-solid fa-sliders"],
    ["admin_panel", "Admin panel", "Only for administrator accounts", "fa-solid fa-user-shield"]
  ];
  const RECORD_LABELS = [
    ["wallets", "Wallets"], ["expenses", "Expenses"], ["loans", "Loans"], ["installments", "Installment plans"],
    ["inventory", "Inventory items"], ["inventory_v2_sales", "Inventory 2.0 sales"],
    ["accounting_documents", "Accounting documents"], ["assets", "Assets"], ["notes", "Notes"]
  ];

  let el = null;          // panel root
  let cur = null;         // { user, tab, inv, overview, history, test, listDirty }
  let toastTimer = 0;

  // ── helpers ────────────────────────────────────────────────────────────────────────────
  const esc = v => (typeof escapeHtml === "function" ? escapeHtml(v) : String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  const rpc = (fn, args) => global.supabaseRpc(fn, args || {}, { offlineCache: false });
  const isMainAdmin = () => { try { return typeof isProtectedAdminSession === "function" && isProtectedAdminSession(); } catch (_) { return false; } };
  const flagsOf = u => { try { return getUserAccessFlags(u) || {}; } catch (_) { return {}; } };
  const day = v => { try { return v ? formatAccessDateShort(v) : "—"; } catch (_) { return v ? String(v).slice(0, 10) : "—"; } };
  const when = v => { if (!v) return "—"; try { return new Date(v).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); } catch (_) { return String(v); } };
  // Plan end dates are stored as the last second of the chosen day in UTC (23:59:59Z). Shown in a
  // later time zone that is already the next morning, so the chosen day is read back from UTC.
  const endDate = v => {
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    return (d.getUTCHours() === 23 && d.getUTCMinutes() === 59) ? new Date(`${d.toISOString().slice(0, 10)}T12:00:00`) : d;
  };
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const addDays = (base, n) => { const d = new Date(base); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return d; };
  const logo = u => { try { return adminUserLogoUrl(u); } catch (_) { return "Assets/logo/logo.png"; } };
  const tabsOf = u => { try { return new Set(userAllowedTabs(u).map(t => String(t).toLowerCase())); } catch (_) { return new Set(); } };
  const currenciesOf = u => { try { return userAllowedCurrencies(u).map(c => String(c).toUpperCase()); } catch (_) { return []; } };
  const storeEdition = () => global.TriplemStore?.active === true;

  function planState(u){
    const f = flagsOf(u);
    if (u.is_protected) return { label: "Main Admin · always full access", tone: "ok" };
    if (f.payment_approval_pending || u.payment_approval_pending) return { label: "Payment waiting for approval", tone: "warn" };
    if (f.read_only || f.limited_access) return { label: "Limited access · view only", tone: "bad" };
    if (f.period_expired && f.grace_active) return { label: `Grace period · ${Math.max(1, Math.floor(Number(f.grace_days_left) || 0))} day(s) left`, tone: "warn" };
    if (f.unlimited_access) return { label: "Full / Pro · no end date", tone: "ok" };
    if (f.period_active) {
      const n = Math.max(0, Math.floor(Number(f.trial_days_remaining) || 0));
      return { label: `${f.is_trial ? "Trial" : "Full / Pro"} · ${n} day${n === 1 ? "" : "s"} left`, tone: n <= 3 ? "warn" : "ok" };
    }
    return { label: f.is_trial ? "Trial" : "Full / Pro", tone: "" };
  }
  const pill = (text, tone = "", icon = "") => `<span class="aum-pill${tone ? " is-" + tone : ""}">${icon ? `<i class="${icon}" aria-hidden="true"></i>` : ""}${esc(text)}</span>`;
  const sw = (key, title, note, on, { disabled = false, icon = "" } = {}) => `
    <button type="button" class="aum-switch" role="switch" data-aum-switch="${esc(key)}" aria-checked="${on ? "true" : "false"}"${disabled ? " disabled" : ""}>
      ${icon ? `<span class="aum-ico" aria-hidden="true"><i class="${icon}"></i></span>` : ""}
      <span class="aum-switch-copy"><b>${esc(title)}</b>${note ? `<small>${esc(note)}</small>` : ""}</span>
      <span class="aum-track" aria-hidden="true"><i></i></span>
    </button>`;
  const section = (title, body, extra = "") => `<section class="aum-section"${extra}><h3>${esc(title)}</h3>${body}</section>`;
  const note = (html, tone = "info", icon = "fa-solid fa-circle-info") => `<div class="aum-note is-${tone}"><i class="${icon}" aria-hidden="true"></i><div>${html}</div></div>`;
  const kv = rows => `<dl class="aum-kv">${rows.filter(Boolean).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("")}</dl>`;

  // ── toast and running an action ───────────────────────────────────────────────────────
  function toast(msg, tone = "ok"){
    const t = el?.querySelector(".aum-toast");
    if (!t) return;
    t.className = `aum-toast is-${tone} is-on`;
    t.innerHTML = `<i class="fa-solid ${tone === "ok" ? "fa-circle-check" : "fa-triangle-exclamation"}" aria-hidden="true"></i><span>${esc(msg)}</span>`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("is-on"), tone === "ok" ? 2600 : 6000);
  }
  async function run(btn, fn, okMsg){
    if (btn?.dataset.busy === "1") return false;
    if (btn) { btn.dataset.busy = "1"; btn.classList.add("is-busy"); btn.setAttribute("aria-busy", "true"); }
    try {
      await fn();
      if (okMsg) toast(okMsg, "ok");
      return true;
    } catch (err) {
      const msg = String(err?.message || err || "The change was not saved.");
      if (typeof isAdminSecurityKeyError === "function" && isAdminSecurityKeyError(err)) {
        toast("Admin security key needed. Unlock it, then try again.", "bad");
        try { await ensureAdminSecurityAccess?.(); } catch (_) {}
      } else {
        toast(msg.replace(/^Error:\s*/, ""), "bad");
      }
      return false;
    } finally {
      if (btn && btn.isConnected) { btn.dataset.busy = "0"; btn.classList.remove("is-busy"); btn.removeAttribute("aria-busy"); }
    }
  }

  // Reads the account back from the server and redraws (keeps the scroll position).
  async function reload(){
    if (!cur) return;
    try {
      const fresh = await rpc("app_admin_get_user", { p_user_id: cur.user.id });
      if (fresh?.id) {
        cur.user = { ...cur.user, ...fresh };
        try { mergeAdminUserCache(cur.user); } catch (_) {}
      }
    } catch (_) {}
    cur.listDirty = true;
    render({ keepScroll: true });
  }

  // ── open / close ──────────────────────────────────────────────────────────────────────
  function open(user, tab = "overview"){
    if (!user?.id) return;
    if (!el) {
      el = document.createElement("div");
      el.id = "adminUserManager";
      el.className = "aum-root";
      el.innerHTML = `<div class="aum-backdrop" data-aum-close></div>
        <aside class="aum-panel" role="dialog" aria-modal="true" aria-labelledby="aumTitle">
          <div class="aum-frame"></div>
          <div class="aum-toast" role="status" aria-live="polite"></div>
        </aside>`;
      document.body.appendChild(el);
      el.addEventListener("click", onClick);
      el.addEventListener("change", onChange);
      el.addEventListener("keydown", e => {
        if (e.key === "Escape" && !document.querySelector(".modal:not(.hide)")) { e.stopPropagation(); close(); }
      });
    }
    const keepDirty = cur?.listDirty;
    cur = { user: { ...user }, tab, inv: null, overview: null, history: null, test: null, listDirty: !!keepDirty, plan: null };
    render();
    el.classList.add("is-open");
    document.documentElement.classList.add("aum-open");
    requestAnimationFrame(() => el.querySelector(".aum-close")?.focus({ preventScroll: true }));
    // Fresh copy from the server (the list can be a few minutes old).
    rpc("app_admin_get_user", { p_user_id: user.id }).then(fresh => {
      if (!cur || cur.user.id !== user.id || !fresh?.id) return;
      cur.user = { ...cur.user, ...fresh };
      render({ keepScroll: true });
    }).catch(() => {});
    loadExtras();
  }
  function close(){
    if (!el) return;
    el.classList.remove("is-open");
    document.documentElement.classList.remove("aum-open");
    const dirty = cur?.listDirty;
    cur = null;
    if (dirty && typeof loadAdminUsers === "function") loadAdminUsers().catch?.(() => {});
  }

  // Data that is not part of the user row: devices and records, inventory access, test flag.
  function loadExtras(){
    const id = cur.user.id;
    const keep = fn => v => { if (cur && cur.user.id === id) { fn(v); render({ keepScroll: true }); } };
    rpc("app_admin_user_overview", { p_user_id: id }).then(keep(v => { cur.overview = v || {}; }), keep(e => { cur.overview = { error: String(e?.message || e) }; }));
    if (isMainAdmin()) {
      rpc("app_admin_inventory_access_get", { p_user_id: id }).then(keep(v => { cur.inv = v || {}; }), keep(e => { cur.inv = { error: String(e?.message || e) }; }));
      rpc("app_admin_test_account_info", { p_user_id: id }).then(keep(v => { cur.test = v?.test_account === true; }), keep(() => { cur.test = false; }));
    } else {
      cur.inv = { error: "Only the Main Admin can change inventory access." };
      cur.test = false;
    }
  }

  // ── rendering ─────────────────────────────────────────────────────────────────────────
  function render({ keepScroll = false } = {}){
    if (!el || !cur) return;
    const frame = el.querySelector(".aum-frame");
    const scroller = frame.querySelector(".aum-body");
    const top = keepScroll && scroller ? scroller.scrollTop : 0;
    const u = cur.user;
    const ps = planState(u);
    const company = u.company_name || u.settings?.Company || "";
    const pills = [
      u.is_active === false ? pill("Disabled", "bad", "fa-solid fa-ban") : pill("Active", "ok", "fa-solid fa-circle"),
      pill(u.is_protected ? "Main Admin" : (u.role === "admin" ? "Administrator" : "User"), "", u.role === "admin" ? "fa-solid fa-user-shield" : ""),
      pill(ps.label, ps.tone),
      u.team_owner_id ? pill(`Team · ${u.team_title || u.account_title || "member"}`, "", "fa-solid fa-link") : "",
      (!u.team_owner_id && (Number(u.team_total_count) > 0 || u.allow_team_members)) ? pill(`Team owner · ${Math.max(0, Number(u.team_total_count) || 0)}`, "", "fa-solid fa-users") : "",
      cur.test ? pill("Shared test account", "info", "fa-solid fa-flask") : "",
      u.triplem_ai_access ? pill("Triplem AI", "", "fa-solid fa-wand-magic-sparkles") : ""
    ].join("");
    frame.innerHTML = `
      <header class="aum-head">
        <img class="aum-avatar" src="${esc(logo(u))}" alt="" onerror="this.onerror=null;this.src='Assets/logo/logo.png'">
        <div class="aum-id">
          <strong id="aumTitle">${esc(u.display_name || u.username)}</strong>
          <small>@${esc(u.username)}${company ? ` · ${esc(company)}` : ""}</small>
          <div class="aum-pills">${pills}</div>
        </div>
        <button type="button" class="aum-close" data-aum-close aria-label="Close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
      </header>
      <nav class="aum-tabs" role="tablist" aria-label="User settings">
        ${TABS.map(([k, label, icon]) => `<button type="button" role="tab" data-aum-tab="${k}" aria-selected="${cur.tab === k}"><i class="${icon}" aria-hidden="true"></i><span>${label}</span></button>`).join("")}
      </nav>
      <div class="aum-body" role="tabpanel">${body()}</div>`;
    const sc = frame.querySelector(".aum-body");
    if (sc && top) sc.scrollTop = top;
    afterRender();
  }

  function body(){
    switch (cur.tab) {
      case "plan": return planTab();
      case "sections": return sectionsTab();
      case "company": return companyTab();
      case "team": return teamTab();
      case "security": return securityTab();
      case "data": return dataTab();
      default: return overviewTab();
    }
  }
  const skel = n => `<div class="aum-skel">${Array.from({ length: n }, () => "<span></span>").join("")}</div>`;

  // Overview ─────────────────────────────────────────────────────────────────────────────
  function overviewTab(){
    const u = cur.user, f = flagsOf(u), notes = [];
    const pending = typeof adminPendingSubscriptionForUser === "function" ? adminPendingSubscriptionForUser(u.id) : null;
    const latest = typeof adminLatestSubscriptionForUser === "function" ? adminLatestSubscriptionForUser(u.id) : null;
    if (u.is_active === false) notes.push(note("This account is <b>disabled</b>. It cannot sign in until you enable it.", "bad", "fa-solid fa-ban") );
    if (pending) notes.push(note(`A <b>payment is waiting for approval</b>. <button type="button" class="aum-link" data-aum-act="review-payment">Review payment</button>`, "warn", "fa-solid fa-receipt"));
    if (!u.is_protected && (f.read_only || f.limited_access)) notes.push(note(`The plan has ended, so the account is in <b>limited access</b> (view and download only). <button type="button" class="aum-link" data-aum-tab="plan">Give access</button>`, "bad", "fa-solid fa-lock"));
    if (u.team_owner_id) notes.push(note(`Member of the company account <b>${esc(u.team_owner_display_name || u.team_owner_username || "")}</b>. The plan and inventory follow the company account. <button type="button" class="aum-link" data-aum-act="open-owner">Open company account</button>`, "info", "fa-solid fa-link"));
    if (cur.test) notes.push(note("Shared test account: testers cannot change its security settings or delete records. You can set its password in <b>Security</b>.", "info", "fa-solid fa-flask"));
    if (u.must_change_password) notes.push(note("The user must choose a new password at the next sign-in.", "warn", "fa-solid fa-key"));
    const ov = cur.overview;
    const usage = !ov ? skel(3) : ov.error ? `<p class="aum-muted">Usage needs database update 228.</p>` : kv([
      ["Signed in on", `${esc(String(ov.sessions?.active ?? 0))} device(s)`],
      ["Last activity", esc(when(ov.sessions?.last_seen_at || u.last_login_at))],
      ["Records", esc(String(Object.values(ov.records || {}).reduce((a, b) => a + Number(b || 0), 0)))]
    ]);
    return `
      ${notes.join("")}
      ${section("Account", kv([
        ["Username", `@${esc(u.username)}`],
        ["Display name", esc(u.display_name || "—")],
        ["Role", esc(u.is_protected ? "Main Admin (protected)" : u.role === "admin" ? "Administrator" : "User")],
        ["Account type", esc(u.team_owner_id ? "Team member" : (u.allow_team_members || Number(u.team_total_count) > 0) ? "Company account with team" : "Individual")],
        ["Created", esc(when(u.created_at))],
        ["Last sign-in", esc(when(u.last_login_at))]
      ]))}
      ${section("Plan", kv([
        ["Status", esc(planState(u).label)],
        ["Started", esc(day(u.trial_started_at || f.trial_started_at))],
        ["Ends", esc(f.unlimited_access || u.is_protected ? "No end date" : day(endDate(f.trial_expires_at || u.trial_expires_at)))]
      ]) + (u.is_protected || u.team_owner_id ? "" : `<div class="aum-actions"><button type="button" class="aum-btn" data-aum-tab="plan"><i class="fa-solid fa-calendar-check" aria-hidden="true"></i> Change plan</button></div>`))}
      ${section("Usage", usage)}
      ${section("Quick actions", `<div class="aum-actions is-wrap">
        <button type="button" class="aum-btn" data-aum-act="message"><i class="fa-regular fa-paper-plane" aria-hidden="true"></i> Send a message</button>
        <button type="button" class="aum-btn" data-aum-act="copy"><i class="fa-regular fa-copy" aria-hidden="true"></i> Copy username</button>
        <button type="button" class="aum-btn" data-aum-act="raw"><i class="fa-solid fa-database" aria-hidden="true"></i> View records</button>
        ${latest?.receipt_exists ? `<button type="button" class="aum-btn" data-aum-act="last-payment"><i class="fa-solid fa-receipt" aria-hidden="true"></i> Last payment</button>` : ""}
      </div>
      <form class="aum-compose hide" data-aum-form="message">
        <label class="aum-field"><span>Subject</span><input name="subject" maxlength="140" required placeholder="Subject"></label>
        <label class="aum-field"><span>Message</span><textarea name="body" rows="3" maxlength="4000" required placeholder="Write your message"></textarea></label>
        <div class="aum-actions"><button type="button" class="aum-btn" data-aum-act="message-cancel">Cancel</button><button type="submit" class="aum-btn is-primary"><i class="fa-regular fa-paper-plane" aria-hidden="true"></i> Send</button></div>
      </form>`)}`;
  }

  // Plan ─────────────────────────────────────────────────────────────────────────────────
  function planDraft(){
    const u = cur.user, f = flagsOf(u);
    if (!cur.plan) cur.plan = { type: f.access_plan === "trial" ? "trial" : "full", mode: f.unlimited_access ? "unlimited" : "days", days: 30, until: ymd(addDays(new Date(), 30)) };
    return cur.plan;
  }
  function planEnd(p){
    if (p.mode === "unlimited") return null;
    if (p.mode === "date") return p.until ? new Date(`${p.until}T12:00:00`) : null;
    return addDays(new Date(), Math.max(1, Math.floor(Number(p.days) || 0)));
  }
  function planTab(){
    const u = cur.user, f = flagsOf(u);
    if (u.is_protected) return note("The Main Admin account always has full access. Its plan cannot be changed.", "info", "fa-solid fa-crown");
    if (u.team_owner_id) return note(`A team member's plan follows the company account. <button type="button" class="aum-link" data-aum-act="open-owner">Open company account</button>`, "info", "fa-solid fa-link");
    const p = planDraft();
    const end = planEnd(p);
    const adminRole = u.role === "admin";
    const base = f.trial_expires_at && new Date(f.trial_expires_at) > new Date() ? endDate(f.trial_expires_at) : new Date();
    const pending = typeof adminPendingSubscriptionForUser === "function" ? adminPendingSubscriptionForUser(u.id) : null;
    return `
      ${pending ? note(`A payment is waiting for approval. <button type="button" class="aum-link" data-aum-act="review-payment">Review payment</button>`, "warn", "fa-solid fa-receipt") : ""}
      ${section("Current plan", `<div class="aum-status is-${planState(u).tone || "plain"}"><b>${esc(planState(u).label)}</b><span>${esc(f.unlimited_access ? "No end date" : `Ends ${day(endDate(f.trial_expires_at))}`)} · started ${esc(day(u.trial_started_at || f.trial_started_at))}</span></div>`)}
      ${section("Set access", `
        <div class="aum-row"><span class="aum-row-label">Plan</span>
          <div class="aum-seg" role="radiogroup" aria-label="Plan">
            <button type="button" role="radio" data-aum-plan="type" data-v="full" aria-checked="${p.type === "full"}">Full / Pro</button>
            <button type="button" role="radio" data-aum-plan="type" data-v="trial" aria-checked="${p.type === "trial"}"${adminRole ? " disabled title=\"Administrator accounts cannot be on a trial\"" : ""}>Trial</button>
          </div></div>
        <div class="aum-row"><span class="aum-row-label">Length</span>
          <div class="aum-seg" role="radiogroup" aria-label="Length">
            <button type="button" role="radio" data-aum-plan="mode" data-v="days" aria-checked="${p.mode === "days"}">Days</button>
            <button type="button" role="radio" data-aum-plan="mode" data-v="date" aria-checked="${p.mode === "date"}">Until a date</button>
            <button type="button" role="radio" data-aum-plan="mode" data-v="unlimited" aria-checked="${p.mode === "unlimited"}"${p.type === "trial" ? " disabled title=\"A trial always has an end date\"" : ""}>No end date</button>
          </div></div>
        ${p.mode === "days" ? `<div class="aum-chips">${[7, 14, 30, 90, 180, 365].map(d => `<button type="button" class="aum-chip" data-aum-plan="days" data-v="${d}" aria-pressed="${Number(p.days) === d}">${d === 365 ? "1 year" : d === 180 ? "6 months" : d === 90 ? "3 months" : d + " days"}</button>`).join("")}</div>
          <label class="aum-field is-inline"><span>Days from today</span><input type="number" min="1" max="3650" step="1" inputmode="numeric" data-aum-plan-input="days" value="${esc(String(p.days))}"></label>` : ""}
        ${p.mode === "date" ? `<label class="aum-field is-inline"><span>Last day of access</span><input type="date" min="${esc(ymd(new Date()))}" data-aum-plan-input="until" value="${esc(p.until)}"></label>` : ""}
        <p class="aum-summary">${p.mode === "unlimited" ? "Full / Pro access with no end date." : `${p.type === "trial" ? "Trial" : "Full / Pro"} access until <b>${esc(end ? day(end) : "—")}</b>.`} The account becomes active straight away.</p>
        <div class="aum-actions"><button type="button" class="aum-btn is-primary" data-aum-act="plan-apply"><i class="fa-solid fa-check" aria-hidden="true"></i> Apply</button></div>`)}
      ${f.unlimited_access ? "" : section("Extend from the current end date", `
        <p class="aum-muted">Adds time to ${esc(f.period_active ? `the current end date (${day(endDate(f.trial_expires_at))})` : "today, because the plan has already ended")}.</p>
        <div class="aum-chips">${[[7, "+7 days"], [30, "+1 month"], [90, "+3 months"], [365, "+1 year"]].map(([d, t]) => `<button type="button" class="aum-chip" data-aum-act="extend" data-v="${d}" title="Until ${esc(day(addDays(base, d)))}">${t}</button>`).join("")}</div>`)}
      ${section("History", cur.history && !cur.history.pending ? historyHtml() : skel(2), ` data-aum-history`)}`;
  }
  function historyHtml(){
    const items = Array.isArray(cur.history?.items) ? cur.history.items : [];
    if (cur.history?.error) return `<p class="aum-muted">${esc(cur.history.error)}</p>`;
    if (!items.length) return `<p class="aum-muted">No plan changes recorded yet.</p>`;
    return `<ul class="aum-list">${items.map(it => `<li><span><b>${esc(typeof adminAccessActionLabel === "function" ? adminAccessActionLabel(it.action) : it.action)}</b> ${esc(it.previous_expires_at ? day(endDate(it.previous_expires_at)) : "—")} → ${esc(it.new_expires_at ? day(endDate(it.new_expires_at)) : "No end date")}</span><small>${esc(when(it.created_at))} · ${esc(it.admin_display_name || it.admin_username || "Admin")}</small></li>`).join("")}</ul>`;
  }

  // Sections ─────────────────────────────────────────────────────────────────────────────
  function sectionsTab(){
    const u = cur.user, tabs = tabsOf(u), locked = !!u.is_protected;
    const curr = currenciesOf(u);
    const btcMode = typeof deriveBitcoinAccessMode === "function" ? deriveBitcoinAccessMode(curr, [...tabs]) : "none";
    const main = isMainAdmin();
    const lockNote = locked ? note("The Main Admin account always has every section.", "info", "fa-solid fa-crown") : "";
    const memberNote = u.team_owner_id ? note("A team member can never see more than the company account allows.", "info", "fa-solid fa-link") : "";
    const sections = SECTION_SWITCHES
      .filter(([k]) => k !== "admin_panel" || u.role === "admin")
      .map(([k, t, n, i]) => sw(`tab:${k}`, t, n, tabs.has(k), { disabled: locked, icon: i })).join("");
    const features = [
      sw("feature:accounting", "Accounting", "Double-entry books, invoices, VAT and statements", tabs.has("accounting"), { disabled: locked, icon: "fa-solid fa-calculator" }),
      main ? sw("feature:insurance", "Insurance", "Policies, sales, commissions and customers", locked || tabs.has("insurance"), { disabled: locked, icon: "fa-solid fa-shield-heart" }) : "",
      main ? sw("feature:ai", "Triplem AI", "The user connects their own Gemini key. Turning it off deletes their stored key.", !!u.triplem_ai_access, { disabled: locked, icon: "fa-solid fa-wand-magic-sparkles" }) : ""
    ].join("");
    const btc = storeEdition() ? "" : `<div class="aum-row is-stack"><span class="aum-row-label"><i class="fa-brands fa-bitcoin" aria-hidden="true"></i> Bitcoin</span>
      <div class="aum-seg is-wrap" role="radiogroup" aria-label="Bitcoin access">
        ${[["none", "Off"], ["currency_only", "BTC currency"], ["tab_only", "Bitcoin section"], ["both", "Both"]].map(([v, t]) => `<button type="button" role="radio" data-aum-btc="${v}" aria-checked="${btcMode === v}"${locked ? " disabled" : ""}>${t}</button>`).join("")}
      </div></div>`;
    const currencies = (typeof ADMIN_CURRENCY_OPTIONS !== "undefined" ? ADMIN_CURRENCY_OPTIONS : curr)
      .filter(c => String(c).toUpperCase() !== "BTC")
      .filter(c => !(storeEdition() && global.TriplemStore?.isCryptoCode?.(c)))
      .map(c => `<button type="button" class="aum-chip" data-aum-currency="${esc(c)}" aria-pressed="${curr.includes(String(c).toUpperCase())}"${locked ? " disabled" : ""}>${esc(c)}</button>`).join("");
    return `${lockNote}${memberNote}
      ${section("Workspace sections", `<div class="aum-switches">${sections}</div>`)}
      ${section("Features", `<div class="aum-switches">${features}</div>${btc}`)}
      ${section("Inventory", inventoryHtml())}
      ${section("Currencies", `<p class="aum-muted">The user can only use the currencies switched on here.</p><div class="aum-chips">${currencies}</div>`)}`;
  }
  function inventoryHtml(){
    const a = cur.inv;
    if (!a) return skel(3);
    if (a.error) return `<p class="aum-muted">${esc(/function|schema/i.test(a.error) ? "Inventory 2.0 controls need database updates 215 and 216." : a.error)}</p>`;
    const team = !!a.is_team_member, mainAdmin = !!a.is_main_admin;
    const v1 = !!a.v1_enabled && tabsOf(cur.user).has("inventory");
    const v2 = !!a.v2_switch;
    const both = v1 && v2;
    const planLine = mainAdmin ? "Main Admin: always included" : `${a.plan === "trial" ? "Trial" : a.plan === "full" ? "Full / Pro" : "No plan"} plan ${a.plan_includes_v2 ? "includes" : "does not include"} Inventory 2.0`;
    return `${team ? note("Inventory follows the company account. Change it there.", "info", "fa-solid fa-link") : ""}
      <p class="aum-muted">${esc(planLine)}. Switching a version off hides it and keeps its data.</p>
      <div class="aum-switches">
        ${sw("inv:v1", "Inventory (classic)", "The original Inventory & Customers section", v1, { disabled: team, icon: "fa-solid fa-boxes-stacked" })}
        ${sw("inv:v2", "Inventory 2.0", "Point of sale, stock, purchases, customers and suppliers", v2, { disabled: team, icon: "fa-solid fa-cash-register" })}
        ${!mainAdmin && !a.plan_includes_v2 ? sw("inv:override", "Allow 2.0 outside the plan", "Only for this account", !!a.v2_plan_override, { disabled: team, icon: "fa-solid fa-unlock" }) : ""}
      </div>
      <div class="aum-row"><span class="aum-row-label">Opens first</span>
        <div class="aum-seg" role="radiogroup" aria-label="Inventory that opens first">
          <button type="button" role="radio" data-aum-inv-primary="v1" aria-checked="${a.primary_version !== "v2"}"${!both || team ? " disabled" : ""}>Classic</button>
          <button type="button" role="radio" data-aum-inv-primary="v2" aria-checked="${a.primary_version === "v2"}"${!both || team ? " disabled" : ""}>2.0</button>
        </div></div>`;
  }

  // Company ──────────────────────────────────────────────────────────────────────────────
  function companyTab(){
    const u = cur.user, s = u.settings || {};
    const v = (a, b, c) => esc(a || b || c || "");
    const lg = u.logo_url || s.logo || "";
    return section("Company details", `
      <form class="aum-form" data-aum-form="company">
        <div class="aum-grid">
          <label class="aum-field"><span>Display name</span><input name="display" maxlength="120" value="${v(u.display_name)}"></label>
          <label class="aum-field"><span>Company name</span><input name="company" maxlength="160" value="${v(u.company_name, s.Company)}"></label>
          <label class="aum-field"><span>VAT / TRN</span><input name="vat" maxlength="60" value="${v(u.vat_number, s.TRN)}"></label>
          <label class="aum-field"><span>Email</span><input name="email" type="email" maxlength="160" value="${v(u.company_email, s.email, s.Email)}"></label>
          <label class="aum-field"><span>Phone</span><input name="phone" type="tel" maxlength="40" value="${v(u.company_phone, s.Mobile, s.Phone)}"></label>
          <label class="aum-field is-wide"><span>Address</span><textarea name="address" rows="2" maxlength="400">${v(u.company_address, s.Address, s.address)}</textarea></label>
        </div>
        <div class="aum-logo">
          <img src="${esc(lg || "Assets/logo/logo.png")}" alt="Company logo" data-aum-logo-preview onerror="this.onerror=null;this.src='Assets/logo/logo.png'">
          <div><b>Logo</b><small>Shown in the header and on PDFs. PNG or JPG, up to 2 MB.</small>
            <div class="aum-actions is-left">
              <label class="aum-btn"><i class="fa-solid fa-upload" aria-hidden="true"></i> Choose logo<input type="file" accept="image/png,image/jpeg,image/webp" data-aum-logo-file hidden></label>
              ${lg ? `<button type="button" class="aum-btn" data-aum-act="logo-remove">Use default logo</button>` : ""}
            </div></div>
        </div>
        <input type="hidden" name="logo" value="${esc(lg)}">
        <div class="aum-actions"><button type="submit" class="aum-btn is-primary"><i class="fa-solid fa-check" aria-hidden="true"></i> Save company details</button></div>
      </form>`) ;
  }

  // Team ─────────────────────────────────────────────────────────────────────────────────
  function teamTab(){
    const u = cur.user;
    if (u.team_owner_id) {
      return section("Company account", `${kv([["Company account", esc(u.team_owner_display_name || u.team_owner_username || "—")], ["Title", esc(u.team_title || u.account_title || "Team member")]])}
        <div class="aum-actions"><button type="button" class="aum-btn" data-aum-act="open-owner"><i class="fa-solid fa-building" aria-hidden="true"></i> Open company account</button></div>`);
    }
    if (u.is_protected || u.role === "admin") return note("Administrator accounts cannot host a team. Only standard user accounts can.", "info");
    const rows = (Array.isArray(state.adminUsersCache) ? state.adminUsersCache : []).filter(r => String(r.team_owner_id || "") === String(u.id));
    const max = Math.max(1, Math.min(50, Number(u.max_team_members) || 3));
    return `${section("Team access", `
        ${sw("team:allow", "Allow team members", "The company owner can invite people who share this account's data", !!u.allow_team_members, { icon: "fa-solid fa-user-plus" })}
        <div class="aum-row"><span class="aum-row-label">Seats</span>
          <div class="aum-chips">${[1, 2, 3, 5, 10].map(n => `<button type="button" class="aum-chip" data-aum-seats="${n}" aria-pressed="${max === n}">${n}</button>`).join("")}
          <input type="number" class="aum-mini" min="1" max="50" value="${max}" data-aum-seats-input aria-label="Seats"><button type="button" class="aum-btn" data-aum-act="seats-save">Save seats</button></div></div>
        <p class="aum-muted">Turning team access off stops new invitations. Existing members are kept.</p>`)}
      ${section(`Members (${rows.length})`, rows.length ? `<ul class="aum-list">${rows.map(r => `<li class="is-row">
          <img src="${esc(logo(r))}" alt="" onerror="this.onerror=null;this.src='Assets/logo/logo.png'">
          <span><b>${esc(r.display_name || r.username)}</b><small>@${esc(r.username)} · ${esc(r.team_title || r.account_title || "Member")}${r.is_active === false ? " · disabled" : ""}</small></span>
          <button type="button" class="aum-btn" data-aum-open-user="${esc(r.id)}">Open</button></li>`).join("")}</ul>` : `<p class="aum-muted">No team members yet.</p>`)}`;
  }

  // Security ─────────────────────────────────────────────────────────────────────────────
  function securityTab(){
    const u = cur.user, locked = !!u.is_protected, main = isMainAdmin(), ov = cur.overview;
    const pin = !!(u.smart_pin_enabled || String(u.smart_pin_hash || "").trim());
    const devices = !ov ? skel(2) : ov.error ? `<p class="aum-muted">Device list needs database update 228.</p>`
      : (ov.sessions?.devices || []).length ? `<ul class="aum-list">${ov.sessions.devices.map(d => `<li><span><b>${esc(deviceName(d.device))}</b></span><small>Signed in ${esc(when(d.created_at))} · last active ${esc(when(d.last_seen_at))}</small></li>`).join("")}</ul>`
      : `<p class="aum-muted">Not signed in on any device.</p>`;
    const passwordBlock = cur.test === null ? skel(1) : cur.test ? `
        ${note("Shared test account: only you can change its password. Everyone signed in is signed out and uses the new password.", "info", "fa-solid fa-flask")}
        <form class="aum-form" data-aum-form="test-password">
          <div class="aum-grid">
            <label class="aum-field"><span>New password</span><input name="p1" type="password" autocomplete="new-password" placeholder="8+ characters, upper, lower, number" required></label>
            <label class="aum-field"><span>Repeat new password</span><input name="p2" type="password" autocomplete="new-password" required></label>
          </div>
          <div class="aum-actions"><button type="submit" class="aum-btn is-primary"><i class="fa-solid fa-key" aria-hidden="true"></i> Set password</button></div>
        </form>` : `
        ${sw("sec:must-change", "Ask for a new password at next sign-in", "The user chooses a new password before continuing", !!u.must_change_password, { disabled: locked, icon: "fa-solid fa-key" })}
        <div class="aum-actions is-left"><button type="button" class="aum-btn" data-aum-act="temp-password"${locked ? " disabled" : ""}><i class="fa-solid fa-life-ring" aria-hidden="true"></i> Issue a temporary password</button></div>
        <p class="aum-muted">Passwords are never visible to administrators. A temporary password is checked against the account's email and mobile first.</p>`;
    return `
      ${section("Sign-in", `
        ${sw("sec:active", "Account can sign in", "Turning this off signs the user out everywhere", u.is_active !== false, { disabled: locked, icon: "fa-solid fa-power-off" })}
        <form class="aum-form" data-aum-form="username">
          <label class="aum-field is-inline"><span>Username</span><input name="username" maxlength="40" pattern="[A-Za-z0-9_\\-]+" value="${esc(u.username)}"${locked || cur.test ? " disabled" : ""}></label>
          ${locked || cur.test ? "" : `<button type="submit" class="aum-btn">Rename</button>`}
        </form>
        <div class="aum-row"><span class="aum-row-label">Role</span>
          <div class="aum-seg" role="radiogroup" aria-label="Role">
            <button type="button" role="radio" data-aum-role="user" aria-checked="${u.role !== "admin"}"${locked ? " disabled" : ""}>User</button>
            <button type="button" role="radio" data-aum-role="admin" aria-checked="${u.role === "admin"}"${locked || flagsOf(u).is_trial ? " disabled title=\"Trial accounts cannot be administrators\"" : ""}>Administrator</button>
          </div></div>`)}
      ${section("Password", passwordBlock)}
      ${section("Smart PIN", `${kv([["Smart PIN", pin ? "On" : "Not set"]])}
        <div class="aum-actions is-left">
          ${main && pin && !locked ? `<button type="button" class="aum-btn" data-aum-act="pin-clear"><i class="fa-solid fa-eraser" aria-hidden="true"></i> Clear Smart PIN</button>` : ""}
          ${!locked ? `<button type="button" class="aum-btn" data-aum-act="pin-reopen"><i class="fa-solid fa-unlock" aria-hidden="true"></i> Reset PIN lock-out</button>` : ""}
        </div>`)}
      ${section("Devices", `${devices}${main && !locked ? `<div class="aum-actions is-left"><button type="button" class="aum-btn is-danger" data-aum-act="signout-all"><i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i> Sign out on every device</button></div>` : ""}`)}`;
  }
  function deviceName(ua){
    const s = String(ua || "");
    if (/TriplemVIP|Triplem VIP Windows|WebView2/i.test(s)) return "Windows app";
    const os = /Windows/i.test(s) ? "Windows" : /iPhone|iPad/i.test(s) ? "iPhone / iPad" : /Android/i.test(s) ? "Android" : /Mac OS/i.test(s) ? "Mac" : /Linux/i.test(s) ? "Linux" : "Device";
    const br = /Edg\//.test(s) ? "Edge" : /Chrome\//.test(s) ? "Chrome" : /Safari\//.test(s) ? "Safari" : /Firefox\//.test(s) ? "Firefox" : "Browser";
    return `${br} on ${os}`;
  }

  // Data ─────────────────────────────────────────────────────────────────────────────────
  function dataTab(){
    const u = cur.user, ov = cur.overview, locked = !!u.is_protected;
    const records = !ov ? skel(3) : ov.error ? `<p class="aum-muted">Record counts need database update 228.</p>`
      : `<div class="aum-stats">${RECORD_LABELS.map(([k, t]) => `<div><b>${esc(String(ov.records?.[k] ?? 0))}</b><small>${esc(t)}</small></div>`).join("")}</div>`;
    return `
      ${section("Records", `${records}${u.team_owner_id ? `<p class="aum-muted">Counts are for the company workspace this member shares.</p>` : ""}
        <div class="aum-actions is-left"><button type="button" class="aum-btn" data-aum-act="raw"><i class="fa-solid fa-database" aria-hidden="true"></i> View and edit records</button></div>`)}
      ${locked ? "" : section("Danger zone", `
        <div class="aum-danger">
          <div><b>${u.is_active === false ? "Enable this account" : "Disable this account"}</b><small>${u.is_active === false ? "The user can sign in again." : "The user is signed out and cannot sign in. Data is kept."}</small></div>
          <button type="button" class="aum-btn${u.is_active === false ? "" : " is-danger"}" data-aum-act="toggle-active">${u.is_active === false ? "Enable" : "Disable"}</button>
        </div>
        <div class="aum-danger">
          <div><b>Delete this account</b><small>The account and all of its records are removed permanently.${cur.test ? " Not available for the shared test account." : ""}</small></div>
          <button type="button" class="aum-btn is-danger" data-aum-act="delete"${cur.test ? " disabled" : ""}>Delete</button>
        </div>`)}`;
  }

  // After drawing: lazy parts of the active tab
  function afterRender(){
    if (cur.tab === "plan" && !cur.history && !cur.user.is_protected && !cur.user.team_owner_id) {
      cur.history = null;
      const id = cur.user.id;
      rpc("app_admin_list_access_extensions", { p_user_id: id, p_limit: 8 }).then(v => {
        if (!cur || cur.user.id !== id) return; cur.history = v || { items: [] };
        const box = el.querySelector("[data-aum-history]"); if (box) box.innerHTML = `<h3>History</h3>${historyHtml()}`;
      }).catch(e => { if (cur && cur.user.id === id) { cur.history = { error: String(e?.message || e) }; const box = el.querySelector("[data-aum-history]"); if (box) box.innerHTML = `<h3>History</h3>${historyHtml()}`; } });
      cur.history = { pending: true, items: null };
    }
  }

  // ── actions ───────────────────────────────────────────────────────────────────────────
  const userTabsList = () => {
    const t = tabsOf(cur.user);
    return (typeof ADMIN_TAB_OPTIONS !== "undefined" ? ADMIN_TAB_OPTIONS.map(o => o.id) : [...t]).filter(id => t.has(id));
  };
  async function saveAccess({ tabs, currencies }){
    const args = { p_user_id: cur.user.id };
    if (tabs) args.p_tabs = [...new Set(tabs)];
    if (currencies) {
      if (!currencies.length) throw new Error("Keep at least one currency switched on.");
      args.p_currencies = [...new Set(currencies)];
    }
    if (tabs && !tabs.length) throw new Error("Keep at least one section switched on.");
    const updated = await rpc("app_admin_update_user_access", args);
    if (updated?.id) cur.user = { ...cur.user, ...updated };
  }

  async function onSwitch(btn){
    const key = btn.dataset.aumSwitch;
    const next = btn.getAttribute("aria-checked") !== "true";
    const u = cur.user;
    btn.setAttribute("aria-checked", String(next)); // immediate feedback; reverted on error
    const ok = await run(btn, async () => {
      if (key.startsWith("tab:") || key === "feature:accounting" || key === "feature:insurance") {
        const id = key.startsWith("tab:") ? key.slice(4) : key.slice(8);
        const list = userTabsList().filter(t => t !== id);
        if (next) list.push(id);
        await saveAccess({ tabs: list });
      } else if (key === "feature:ai") {
        if (!next && !confirm(`Turn off Triplem AI for ${u.username}? Their stored Gemini key is deleted.`)) throw new Error("Not changed.");
        await rpc("app_admin_set_triplem_ai_access", { p_user_id: u.id, p_allowed: next });
      } else if (key.startsWith("inv:")) {
        await saveInventory(key.slice(4), next);
      } else if (key === "team:allow") {
        const max = Math.max(1, Math.min(50, Number(u.max_team_members) || 3));
        await rpc("app_admin_set_team_limits", { p_user_id: u.id, p_allow: next, p_max_team_members: max });
      } else if (key === "sec:active") {
        await setActive(next);
      } else if (key === "sec:must-change") {
        await rpc("app_admin_force_password_change", { p_user_id: u.id, p_force: next });
      }
    }, "Saved");
    if (!ok) btn.setAttribute("aria-checked", String(!next));
    await reload();
  }

  async function saveInventory(which, value){
    const a = cur.inv || {};
    const nextState = { v1: !!a.v1_enabled && tabsOf(cur.user).has("inventory"), v2: !!a.v2_switch, primary: a.primary_version === "v2" ? "v2" : "v1", override: !!a.v2_plan_override };
    if (which === "v1") nextState.v1 = value;
    if (which === "v2") nextState.v2 = value;
    if (which === "override") nextState.override = value;
    if (which === "primary") nextState.primary = value;
    if (!nextState.v1 && !nextState.v2 && !confirm("Both inventory versions will be off for this account. Their data is kept. Continue?")) throw new Error("Not changed.");
    if (!nextState.v1 || !nextState.v2) nextState.primary = nextState.v2 ? "v2" : "v1";
    if (which === "v1") {
      // The classic inventory is also the "Inventory & Customers" section permission.
      const list = userTabsList().filter(t => t !== "inventory");
      if (value) list.push("inventory");
      await saveAccess({ tabs: list });
    }
    const res = await rpc("app_admin_inventory_access_set", { p_user_id: cur.user.id, p_v1_enabled: nextState.v1, p_v2_enabled: nextState.v2, p_primary_version: nextState.primary, p_v2_plan_override: nextState.override });
    try { cur.inv = await rpc("app_admin_inventory_access_get", { p_user_id: cur.user.id }); } catch (_) { cur.inv = { ...a, ...res }; }
  }

  async function setActive(on){
    const u = cur.user;
    if (!on && !confirm(`Disable ${u.username}? They are signed out everywhere and cannot sign in until enabled again.`)) throw new Error("Not changed.");
    await rpc("app_admin_update_user_access", { p_user_id: u.id, p_is_active: on });
    if (on) { try { await rpc("app_admin_reopen_smart_pin_lockout", { p_user_id: u.id }); } catch (_) {} }
  }

  async function applyPlan(btn){
    const u = cur.user, f = flagsOf(u), p = planDraft();
    await run(btn, async () => {
      if (p.mode === "unlimited") {
        if (p.type !== "full") throw new Error("A trial always has an end date.");
        await rpc("app_admin_set_access_expiry", { p_user_id: u.id, p_until_date: null, p_clear_unlimited: true, p_note: "No end date (Full / Pro)" });
        return;
      }
      let until;
      if (p.mode === "date") {
        if (!p.until) throw new Error("Choose the last day of access.");
        if (p.until < ymd(new Date())) throw new Error("The date cannot be in the past.");
        until = p.until;
      } else {
        const n = Math.floor(Number(p.days));
        if (!(n >= 1 && n <= 3650)) throw new Error("Enter between 1 and 3650 days.");
        until = ymd(addDays(new Date(), n));
      }
      const currentType = f.access_plan === "trial" ? "trial" : "full";
      if (p.type !== currentType || (f.unlimited_access && p.type === "full")) {
        // Changing the plan type (or giving an unlimited account an end date) goes through the
        // plan function, which also sets the role correctly for a trial.
        await rpc("app_admin_set_access_period", { p_user_id: u.id, p_days: null, p_access_plan: p.type, p_period: "date", p_until_date: until });
        // …and is written to the history with the same end date.
        try { await rpc("app_admin_set_access_expiry", { p_user_id: u.id, p_until_date: until, p_clear_unlimited: false, p_note: `${p.type === "trial" ? "Trial" : "Full / Pro"} until ${until}` }); } catch (_) {}
      } else {
        await rpc("app_admin_set_access_expiry", { p_user_id: u.id, p_until_date: until, p_clear_unlimited: false, p_note: `${p.type === "trial" ? "Trial" : "Full / Pro"} until ${until}` });
      }
    }, "Plan updated");
    cur.plan = null; cur.history = null;
    await reload();
  }

  async function extend(btn, days){
    const u = cur.user, f = flagsOf(u);
    const base = f.trial_expires_at && new Date(f.trial_expires_at) > new Date() ? endDate(f.trial_expires_at) : new Date();
    const until = ymd(addDays(base, days));
    await run(btn, () => rpc("app_admin_set_access_expiry", { p_user_id: u.id, p_until_date: until, p_clear_unlimited: false, p_note: `Extended by ${days} days` }), `Extended until ${day(new Date(`${until}T12:00:00`))}`);
    cur.history = null;
    await reload();
  }

  async function onAction(btn){
    const act = btn.dataset.aumAct, u = cur.user;
    switch (act) {
      case "plan-apply": return applyPlan(btn);
      case "extend": return extend(btn, Number(btn.dataset.v));
      case "copy":
        try { await navigator.clipboard.writeText(u.username); toast("Username copied"); } catch (_) { toast("Could not copy.", "bad"); }
        return;
      case "message": el.querySelector('[data-aum-form="message"]')?.classList.remove("hide"); el.querySelector('[data-aum-form="message"] input')?.focus(); return;
      case "message-cancel": el.querySelector('[data-aum-form="message"]')?.classList.add("hide"); return;
      case "raw": try { openAdminRawDataOverlay(u); } catch (e) { toast(String(e?.message || e), "bad"); } return;
      case "review-payment": {
        const r = adminPendingSubscriptionForUser(u.id);
        if (r) await run(btn, () => openAdminSubscriptionReviewById(r.id));
        cur.listDirty = true;
        return;
      }
      case "last-payment": {
        const r = adminLatestSubscriptionForUser(u.id);
        if (r) await run(btn, () => openAdminSubscriptionReviewById(r.id));
        return;
      }
      case "open-owner": {
        const owner = (state.adminUsersCache || []).find(r => String(r.id) === String(u.team_owner_id));
        if (owner) open(owner, cur.tab === "plan" ? "plan" : "overview");
        else toast("The company account was not found in the list.", "bad");
        return;
      }
      case "temp-password": {
        try {
          openAdminPasswordRecoveryModal();
          setTimeout(() => { const i = document.getElementById("adminRecoveryUsername"); if (i) { i.value = u.username; i.dispatchEvent(new Event("input", { bubbles: true })); document.getElementById("adminRecoveryEmail")?.focus(); } }, 60);
        } catch (e) { toast(String(e?.message || e), "bad"); }
        return;
      }
      case "pin-clear":
        if (!confirm(`Clear the Smart PIN of ${u.username}? They can set a new one after signing in.`)) return;
        await run(btn, async () => {
          await rpc("app_admin_clear_user_smart_pin", { p_user_id: u.id });
          try { await rpc("app_admin_reopen_smart_pin_lockout", { p_user_id: u.id }); } catch (_) {}
        }, "Smart PIN cleared");
        return reload();
      case "pin-reopen":
        await run(btn, () => rpc("app_admin_reopen_smart_pin_lockout", { p_user_id: u.id }), "PIN lock-out reset");
        return reload();
      case "signout-all":
        if (!confirm(`Sign ${u.username} out on every device?`)) return;
        await run(btn, async () => {
          const r = await rpc("app_admin_revoke_user_sessions", { p_user_id: u.id });
          toast(`Signed out on ${Number(r?.revoked || 0)} device(s)`);
        });
        cur.overview = null; loadExtras(); return;
      case "toggle-active":
        await run(btn, () => setActive(u.is_active === false), u.is_active === false ? "Account enabled" : "Account disabled");
        return reload();
      case "delete": {
        let ok = false;
        try { ok = await appConfirmDelete(`Delete the account "${u.username}"? All of its records are deleted permanently.`, { title: "Delete account permanently?", confirmLabel: "Delete account", note: "This cannot be undone. Make a backup first if you may need the records." }); } catch (_) { ok = confirm(`Delete the account "${u.username}" permanently?`); }
        if (!ok) return;
        const typed = prompt(`Type the username to confirm: ${u.username}`);
        if (String(typed || "").trim().toLowerCase() !== String(u.username).toLowerCase()) { toast("Not deleted: the username did not match.", "bad"); return; }
        const done = await run(btn, () => rpc("app_admin_delete_user", { p_user_id: u.id }), "Account deleted");
        if (done) { cur.listDirty = true; close(); }
        return;
      }
      case "logo-remove": {
        const form = el.querySelector('[data-aum-form="company"]');
        form.elements.logo.value = "";
        form.querySelector("[data-aum-logo-preview]").src = "Assets/logo/logo.png";
        toast("Default logo chosen. Save to keep it.");
        return;
      }
      case "seats-save": {
        const n = Math.floor(Number(el.querySelector("[data-aum-seats-input]")?.value));
        await run(btn, async () => {
          if (!(n >= 1 && n <= 50)) throw new Error("Seats must be between 1 and 50.");
          await rpc("app_admin_set_team_limits", { p_user_id: u.id, p_allow: !!u.allow_team_members, p_max_team_members: n });
        }, "Seats saved");
        return reload();
      }
    }
  }

  async function onSubmit(form, e){
    e.preventDefault();
    const u = cur.user, kind = form.dataset.aumForm, btn = form.querySelector('[type="submit"]');
    if (kind === "company") {
      const d = Object.fromEntries(new FormData(form));
      await run(btn, () => rpc("app_admin_set_company_branding", {
        p_user_id: u.id, p_company_name: d.company || "", p_vat_number: d.vat || "", p_logo_url: d.logo || "",
        p_display_name: d.display || "", p_company_email: d.email || "", p_company_phone: d.phone || "", p_company_address: d.address || ""
      }), "Company details saved");
      return reload();
    }
    if (kind === "username") {
      const name = String(form.elements.username.value || "").trim();
      if (name === u.username) return;
      await run(btn, async () => {
        if (!/^[A-Za-z0-9_-]{3,40}$/.test(name)) throw new Error("Use 3 to 40 letters, numbers, _ or -.");
        await rpc("app_admin_rename_user", { p_user_id: u.id, p_new_username: name });
      }, "Username changed");
      return reload();
    }
    if (kind === "test-password") {
      const p1 = form.elements.p1.value, p2 = form.elements.p2.value;
      const ok = await run(btn, async () => {
        assertPasswordPolicy(p1);
        if (p1 !== p2) throw new Error("The two passwords are not the same.");
        await rpc("app_admin_set_test_account_password", { p_user_id: u.id, p_new_password: p1 });
      }, "Password changed. Testers sign in again with the new password.");
      if (ok) form.reset();
      return;
    }
    if (kind === "message") {
      const d = Object.fromEntries(new FormData(form));
      const ok = await run(btn, async () => {
        if (!String(d.subject || "").trim() || !String(d.body || "").trim()) throw new Error("Write a subject and a message.");
        await rpc("app_admin_start_conversation", { p_user_id: u.id, p_subject: d.subject, p_body: d.body });
      }, "Message sent");
      if (ok) { form.reset(); form.classList.add("hide"); }
    }
  }

  async function onClick(e){
    if (!cur) return;
    const t = e.target;
    if (t.closest("[data-aum-close]")) return close();
    const tab = t.closest("[data-aum-tab]");
    if (tab) { cur.tab = tab.dataset.aumTab; render(); el.querySelector(".aum-body")?.scrollTo(0, 0); return; }
    const swb = t.closest("[data-aum-switch]");
    if (swb && !swb.disabled) return onSwitch(swb);
    const planBtn = t.closest("[data-aum-plan]");
    if (planBtn && !planBtn.disabled) {
      const p = planDraft(), k = planBtn.dataset.aumPlan, v = planBtn.dataset.v;
      if (k === "type") { p.type = v; if (v === "trial" && p.mode === "unlimited") p.mode = "days"; }
      if (k === "mode") p.mode = v;
      if (k === "days") p.days = Number(v);
      return render({ keepScroll: true });
    }
    const cur2 = t.closest("[data-aum-currency]");
    if (cur2 && !cur2.disabled) {
      const code = String(cur2.dataset.aumCurrency).toUpperCase();
      const list = currenciesOf(cur.user);
      const next = list.includes(code) ? list.filter(c => c !== code) : list.concat(code);
      await run(cur2, () => saveAccess({ currencies: next }), next.includes(code) ? `${code} switched on` : `${code} switched off`);
      return reload();
    }
    const btc = t.closest("[data-aum-btc]");
    if (btc && !btc.disabled) {
      const m = applyBitcoinAccessMode(currenciesOf(cur.user), userTabsList(), btc.dataset.aumBtc);
      await run(btc, () => saveAccess({ currencies: m.currencies.length ? m.currencies : currenciesOf(cur.user).filter(c => c !== "BTC"), tabs: m.tabs }), "Bitcoin access saved");
      return reload();
    }
    const prim = t.closest("[data-aum-inv-primary]");
    if (prim && !prim.disabled) { await run(prim, () => saveInventory("primary", prim.dataset.aumInvPrimary), "Saved"); return render({ keepScroll: true }); }
    const role = t.closest("[data-aum-role]");
    if (role && !role.disabled && role.getAttribute("aria-checked") !== "true") {
      const r = role.dataset.aumRole;
      if (r === "admin" && !confirm(`Make ${cur.user.username} an administrator? Administrators can manage other accounts.`)) return;
      await run(role, () => rpc("app_admin_set_role", { p_user_id: cur.user.id, p_role: r }), "Role changed");
      return reload();
    }
    const seats = t.closest("[data-aum-seats]");
    if (seats) { const i = el.querySelector("[data-aum-seats-input]"); if (i) i.value = seats.dataset.aumSeats; el.querySelectorAll("[data-aum-seats]").forEach(c => c.setAttribute("aria-pressed", String(c === seats))); return; }
    const openUser = t.closest("[data-aum-open-user]");
    if (openUser) { const r = (state.adminUsersCache || []).find(x => String(x.id) === String(openUser.dataset.aumOpenUser)); if (r) open(r); return; }
    const act = t.closest("[data-aum-act]");
    if (act && !act.disabled) return onAction(act);
  }

  function onChange(e){
    if (!cur) return;
    const t = e.target;
    if (t.matches("[data-aum-plan-input]")) {
      const p = planDraft();
      if (t.dataset.aumPlanInput === "days") p.days = Math.floor(Number(t.value) || 0);
      if (t.dataset.aumPlanInput === "until") p.until = t.value;
      render({ keepScroll: true });
      return;
    }
    if (t.matches("[data-aum-logo-file]")) {
      const file = t.files?.[0]; if (!file) return;
      const form = t.closest("form"), label = t.closest("label");
      run(label, async () => {
        const url = await uploadCompanyLogoToStorage(cur.user.id, file);
        form.elements.logo.value = url;
        form.querySelector("[data-aum-logo-preview]").src = url;
      }, "Logo uploaded. Save to keep it.");
    }
  }
  document.addEventListener("submit", e => {
    const form = e.target.closest?.("#adminUserManager form[data-aum-form]");
    if (form) onSubmit(form, e);
  }, true);

  document.addEventListener("keydown", e => {
    if (e.key !== "Escape" || !cur || !el?.classList.contains("is-open")) return;
    if (document.querySelector(".modal:not(.hide)")) return; // a dialog on top closes first
    e.stopPropagation();
    close();
  });

  global.TriplemAdminUserManager = Object.freeze({ open, close, isOpen: () => !!cur, current: () => cur?.user || null });
  // The user tiles call this name.
  global.openAdminUserDetailsOverlay = user => open(user);
})(typeof window !== "undefined" ? window : globalThis);
