/* Triplem VIP · Account Settings side panel (2026-11-18)
 *
 * Account menu → Account Settings opens one side panel that now also holds Plan & Subscription,
 * Company Team and VAT Settings (they left the account menu):
 *   Profile   – profile, company identity (with the sign-up company details), language, Triplem AI
 *   Security  – password, two-step sign-in, passkeys, Smart PIN, signed-in devices (summary)
 *   Plan      – current access, days left, card renewal, quick Upgrade / Billing
 *   Team      – company accounts: seats, members, create / access / team billing / activity
 *   VAT       – the rate and mode of every currency, edit in the VAT panel
 * Editing keeps the app's own dialogs and saving code (profile, company, security centre,
 * company team) and the app's own panels (Plan & Subscription, VAT). Server data loads with a
 * skeleton. If the side panel is not available the previous Account settings dialog opens.
 */
(function initTriplemAccountHub(global){
  "use strict";

  const DP = () => global.TriplemDetailPanels || null;
  const esc = v => (typeof escapeHtml === "function" ? escapeHtml(v) : String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const call = (name, ...a) => { try { const f = global[name]; return typeof f === "function" ? f(...a) : undefined; } catch (_) { return undefined; } };
  const shown = id => { const b = document.getElementById(id); return !!b && !b.classList.contains("hide") && !b.hidden; };
  const day = v => { if (!v) return "—"; try { return new Date(v).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); } catch (_) { return String(v).slice(0, 10); } };
  const COMPANY_EXTRA = [["trade_license", "Trade licence no."], ["industry", "Industry"], ["size", "Company size"], ["city", "City"], ["website", "Website"], ["fiscal_year_start_month", "Financial year starts"]];

  let def = null, st = null;
  const isOpen = () => !!def && DP()?.custom?.current?.() === def;
  const paint = () => { if (isOpen()) DP().custom.render({ keepScroll: true }); };
  const closeMenus = () => { try { global.TriplemMenus?.closeAll?.(); } catch (_) {} document.querySelectorAll(".menu-dropdown.open").forEach(p => p.classList.remove("open")); };

  // ── what this account may see ────────────────────────────────────────────────────────
  function caps(){
    const user = global.state?.sessionUser || {};
    let teamMember = false; try { teamMember = isTeamMemberAccount(user); } catch (_) {}
    let teamView = false; try { teamView = canManageCompanyTeam() || isCompanyMainAccount(); } catch (_) { teamView = shown("companyTeamBtn"); }
    return {
      user, teamMember,
      plan: !!document.getElementById("planSubscriptionBtn") && !document.getElementById("planSubscriptionBtn").classList.contains("hide"),
      team: teamView,
      vat: !!document.getElementById("taxSettingsBtn") && !document.getElementById("taxSettingsBtn").classList.contains("hide") && !!global.TriplemAccountPanels?.vat
    };
  }

  // ── loading (each tab loads once, skeleton meanwhile) ───────────────────────────────
  async function loadCompany(){
    const user = global.state?.sessionUser || {};
    if (!user.id || st.company) return;
    try {
      const rows = await supabase(`app_user_prefs?select=pref_value&owner_id=eq.${encodeURIComponent(user.id)}&pref_key=eq.company_profile&limit=1`);
      const raw = Array.isArray(rows) ? rows[0]?.pref_value : null;
      st.company = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : {};
    } catch (_) { st.company = {}; }
    paint();
  }
  async function loadSecurity(){
    if (st.security) return;
    try {
      // the trusted-device secret of this browser, as Account security reads it (auth/05-account-security.js)
      let secret = null;
      try { const u = String(global.state?.sessionUser?.username || "").trim().toLowerCase(); const x = u ? JSON.parse(localStorage.getItem("triplem.vip.2fa-trusted.v1:" + u) || "null") : null; secret = x && String(x.secret || "").length >= 32 ? x.secret : null; } catch (_) {}
      st.security = await supabaseRpc("app_account_security_status", { p_two_factor_device_secret: secret }) || {};
    } catch (e) { st.security = { error: String(e?.message || "Could not load the security status.") }; }
    paint();
  }
  async function loadTeam(){
    if (st.team) return;
    try {
      const [status, members] = await Promise.all([supabaseRpc("app_team_status", {}), supabaseRpc("app_team_list_members", {}).catch(() => [])]);
      st.team = { status: status || {}, members: Array.isArray(members) ? members : [] };
    } catch (e) { st.team = { error: String(e?.message || "Could not load the team.") }; }
    paint();
  }
  async function loadPlan(){
    if (st.plan) return;
    try {
      const [sub] = await Promise.all([supabaseRpc("app_my_subscription_status", {}), global.TriplemCardPayments?.refreshStatus?.()?.catch?.(() => {})]);
      st.plan = sub || {};
      const bill = await global.TriplemCardPayments?.billing?.().catch?.(() => null);
      st.bill = bill || null;
    } catch (e) { st.plan = { error: String(e?.message || "Could not load your plan.") }; }
    paint();
  }
  const LOADERS = { profile: loadCompany, security: loadSecurity, team: loadTeam, plan: loadPlan };

  // ── tabs ─────────────────────────────────────────────────────────────────────────────
  const K = () => DP().kit;
  const acts = list => `<div class="tm-dp-txacts">${list.filter(Boolean).join("")}</div>`;
  const row = (act, icon, title, sub, extra = "", data = "") => `<button type="button" class="tm-ah-row" data-dp-act="${act}"${data ? " " + data : ""}>
      <span class="tm-ah-row-ico" aria-hidden="true"><i class="${icon}"></i></span><span class="tm-ah-row-text"><b>${esc(title)}</b><small>${sub}</small></span>${extra}<i class="fa-solid fa-chevron-right tm-ah-go" aria-hidden="true"></i></button>`;

  function profileTab(c){
    const k = K(), snap = call("accountSettingsSnapshot", c.user) || {};
    const logo = snap.logo || "Assets/logo/logo.png";
    const locked = c.teamMember;
    const extra = st.company || null;
    const i18n = global.TriplemI18n;
    const langs = i18n ? Object.entries(i18n.languages).map(([code, info]) => `<button type="button" class="tm-ah-lang${code === i18n.lang ? " is-on" : ""}" role="radio" aria-checked="${code === i18n.lang}" data-lang-choice="${code}" lang="${code}" dir="${info.dir}" translate="no"><span>${esc(info.native)}</span>${code === i18n.lang ? '<i class="fa-solid fa-circle-check" aria-hidden="true"></i>' : ""}</button>`).join("") : "";
    const ai = typeof global.triplemAiAccountSettingsCardHtml === "function" ? global.triplemAiAccountSettingsCardHtml() : "";
    return `<div class="tm-ah-hero"><img src="${esc(logo)}" alt="" onerror="this.onerror=null;this.src='Assets/logo/logo.png'"><div><b>${esc(snap.displayName || "—")}</b><span>@${esc(snap.username || "")}</span>${snap.company ? `<small>${esc(snap.company)}</small>` : ""}</div>
        ${k.btn("ah-profile", "Edit profile", "fa-solid fa-pen")}</div>
      ${k.section("Company", (locked ? k.note(esc("Company details are managed by the company main account."), "info", "fa-solid fa-lock") : "")
        + k.kv([["Company", esc(snap.company || "Not provided")], ["VAT / TRN", esc(snap.vat || "Not provided")], ["Email", esc(snap.email || "Not provided")], ["Mobile", esc(snap.phone || "Not provided")], ["Address", esc(snap.address || "Not provided")],
          ...(extra ? COMPANY_EXTRA.filter(([key]) => extra[key]).map(([key, label]) => [label, esc(String(extra[key]))]) : [])])
        + (!extra && !locked ? k.skel(2) : "")
        + (locked ? "" : acts([k.btn("ah-company", "Edit company", "fa-solid fa-building")])))}
      ${langs ? k.section("Language", `<p class="aum-muted">${esc("The app, invoices, receipts and PDFs use this language on every device.")}</p><div class="tm-ah-langs" role="radiogroup" aria-label="Language">${langs}</div>`) : ""}
      ${ai ? `<div class="tm-ah-legacy">${ai}</div>` : ""}`;
  }

  function securityTab(){
    const k = K(), s = st.security;
    if (!s) return `<div class="tm-dp-txhero is-transfer">${k.skel(2)}</div>` + k.section("Protection", k.skel(4));
    if (s.error) return k.note(esc(s.error), "bad", "fa-solid fa-triangle-exclamation") + acts([k.btn("ah-security", "Open Account security", "fa-solid fa-shield-halved", { primary: true })]);
    const on = [s.two_factor_enabled, s.passkey_enabled, s.smart_pin_enabled].filter(Boolean).length;
    const devices = num(s.active_session_count);
    const item = (ok, icon, title, sub, data) => row("ah-security", icon, title, esc(sub), k.pill(ok ? "On" : "Off", ok ? "ok" : ""), data);
    return `<div class="tm-dp-txhero ${on >= 2 ? "is-in" : "is-transfer"}"><small>${esc("Account security")}</small><strong>${esc(on >= 2 ? "Protected" : "Review recommended")}</strong><span>${esc(`${on}/3 core protections · ${devices} active device${devices === 1 ? "" : "s"}`)}</span></div>`
      + k.progress(Math.round((on / 3) * 100), `${on}/3`)
      + k.section("Protection", `<div class="tm-ah-rows">
          ${row("ah-security", "fa-solid fa-key", "Password", esc("Change your sign-in password"), "", 'data-v="password"')}
          ${item(!!s.two_factor_enabled, "fa-solid fa-mobile-screen", "Two-step sign-in", "Authenticator code when you sign in", 'data-v="2fa"')}
          ${item(!!s.passkey_enabled, "fa-solid fa-fingerprint", "Passkeys & biometrics", "Face, fingerprint or device PIN", 'data-v="passkey"')}
          ${item(!!s.smart_pin_enabled, "fa-solid fa-hashtag", "Smart PIN", "Quick unlock on this device", 'data-v="pin"')}
          ${row("ah-security", "fa-solid fa-laptop", "Signed-in devices", esc(`${devices} active`), "", 'data-v="devices"')}
        </div>`);
  }

  function planTab(){
    const k = K(), p = st.plan;
    if (!p) return `<div class="tm-dp-txhero is-transfer">${k.skel(3)}</div>` + k.section("Details", k.skel(4));
    if (p.error) return k.note(esc(p.error), "bad", "fa-solid fa-triangle-exclamation") + acts([k.btn("ah-plan", "Open Plan & Subscription", "fa-solid fa-crown", { primary: true })]);
    let a = p.access; if (!a) { try { a = getUserAccessFlags(); } catch (_) { a = {}; } }
    const period = p.current_paid_period || null;
    const label = a.is_trial ? "Free 14-Day Trial" : a.unlimited_access ? "Pro Unlimited" : period === "yearly" ? "Pro Yearly" : period === "monthly" ? "Pro Monthly" : "Pro";
    const t = Date.parse(a.trial_expires_at || ""); const left = a.unlimited_access || !Number.isFinite(t) ? null : Math.max(0, Math.ceil((t - Date.now()) / 86400000));
    const total = a.is_trial ? 14 : period === "yearly" ? 365 : 31;
    const sub = st.bill?.subscription || null;
    const renewing = !!sub && ["active", "trialing", "past_due"].includes(sub.status) && sub.scheduled_action !== "cancel";
    const pending = !!p.pending || p.status === "pending";
    return `<div class="tm-dp-txhero ${pending || a.is_trial ? "is-transfer" : "is-in"}"><small>${esc("Current access")}</small><strong>${esc(label)}</strong><span>${esc(a.unlimited_access ? "No expiry" : (call("formatTrialExpiry", a.trial_expires_at) || day(a.trial_expires_at)))}</span>
        <div class="tm-dp-txsplit"><span><small>${esc("Days left")}</small><b>${esc(left == null ? "∞" : String(left))}</b></span><span><small>${esc("Team seats")}</small><b>${esc(String(num(p.team_seats)))}</b></span><span><small>${esc("Renewal")}</small><b>${esc(renewing ? "Card" : "Manual")}</b></span></div></div>`
      + (left != null ? k.progress(Math.max(0, Math.min(100, Math.round((left / total) * 100))), left === 1 ? "1 day left" : `${left} days left`) : "")
      + (pending ? k.note(`<b>${esc("Payment approval pending")}</b><br>${esc("Your workspace remains available while the administrator verifies the receipt.")}`, "warn", "fa-solid fa-clock") : "")
      + k.section("Actions", acts([
        k.btn("ah-plan", a.is_trial ? "Upgrade to Pro" : "Extend plan", "fa-solid fa-crown", { primary: !pending, data: 'data-v="extend"' }),
        k.btn("ah-plan", "Billing", "fa-solid fa-file-invoice", { data: 'data-v="billing"' }),
        k.btn("ah-plan", "Overview", "fa-solid fa-gauge-high", { data: 'data-v="overview"' })]))
      + k.section("Details", k.kv([
        ["Current plan", esc(label)],
        sub?.card_last4 ? ["Card", `${esc(String(sub.card_brand || "Card").replace(/^./, x => x.toUpperCase()))} •••• ${esc(sub.card_last4)}`] : null,
        renewing && sub.next_billed_at ? ["Next payment", esc(day(sub.next_billed_at))] : null,
        p.has_request ? ["Last request", esc(`${p.plan === "yearly" ? "Pro Yearly" : "Pro Monthly"} · ${day(p.resolved_at || p.created_at)}`)] : null
      ]));
  }

  function teamTab(){
    const k = K(), t = st.team;
    if (!t) return k.stats([["—", "Active"], ["—", "Paid seats"], ["—", "Available"]]) + k.section("Members", k.skel(5));
    if (t.error) return k.note(esc(t.error), "bad", "fa-solid fa-triangle-exclamation") + acts([k.btn("ah-team", "Open Company Team", "fa-solid fa-users", { primary: true, data: 'data-v="members"' })]);
    const s = t.status || {}, rows = t.members || [];
    const active = num(s.active_members ?? rows.filter(m => m.is_active !== false).length), seats = num(s.seat_entitlement), free = Math.max(0, seats - active);
    let manage = false; try { manage = canManageCompanyTeam(); } catch (_) {}
    let main = false; try { main = isCompanyMainAccount(); } catch (_) {}
    const list = rows.length ? `<ul class="tm-dp-rows">${rows.map(m => {
      const name = m.display_name || m.username || "Member";
      return `<li class="tm-ah-member" data-dp-act="${manage ? "ah-team" : ""}" data-v="members" role="${manage ? "button" : "listitem"}" tabindex="${manage ? 0 : -1}">
        <span class="tm-dp-row-ico tm-ah-initial" aria-hidden="true"><b>${esc(String(name).trim().charAt(0).toUpperCase() || "?")}</b></span>
        <span class="tm-dp-row-main"><b>${esc(name)}</b><small>${esc(m.team_title || "Team Member")} · @${esc(m.username || "")}</small></span>
        <span class="tm-dp-row-amt">${k.pill(m.is_active === false ? "Disabled" : "Active", m.is_active === false ? "" : "ok")}</span></li>`;
    }).join("")}</ul>` : k.empty("No team members yet. Use Create member after purchasing a seat.");
    return k.stats([[esc(String(active)), "Active"], [esc(String(seats)), "Paid seats"], [esc(String(free)), "Available"], [esc(String(num(s.total_members ?? rows.length))), "Total"]])
      + (s.company_name ? `<p class="aum-muted tm-ah-company"><i class="fa-solid fa-building" aria-hidden="true"></i> ${esc(s.company_name)}</p>` : "")
      + (manage || main ? k.section("Manage", `<div class="tm-ah-rows">
          ${manage ? row("ah-team", "fa-solid fa-users", "Members", esc("Edit, disable or reset a member"), "", 'data-v="members"') : ""}
          ${manage ? row("ah-team", "fa-solid fa-user-plus", "Create member", esc(free > 0 ? `${free} seat${free === 1 ? "" : "s"} available` : "Buy a seat first"), "", 'data-v="add"') : ""}
          ${manage ? row("ah-team", "fa-solid fa-user-shield", "Access control", esc("Titles and privileges at a glance"), "", 'data-v="access"') : ""}
          ${main ? row("ah-team", "fa-solid fa-credit-card", "Team billing", esc("Buy more seats by bank transfer"), "", 'data-v="billing"') : ""}
          ${main ? row("ah-team", "fa-solid fa-clock-rotate-left", "Activity", esc("What your team did, newest first"), "", 'data-v="activity"') : ""}
        </div>`) : "")
      + k.section(`Members · ${rows.length}`, list);
  }

  function vatTab(){
    const k = K();
    let rows = [];
    try { rows = Object.entries(global.state?.taxSettings || {}); } catch (_) {}
    const isAdd = mode => { try { return normalizeTaxMode(mode) === TAX_MODE_ADD; } catch (_) { return String(mode || "").toUpperCase() !== "INCLUDE"; } };
    const set = rows.filter(([, r]) => num(r?.rate) > 0);
    const list = rows.length ? `<ul class="tm-dp-rows">${rows.map(([cur, r]) => {
      const rate = num(r?.rate);
      return `<li><span class="tm-dp-row-ico${rate > 0 ? " is-in" : ""}" aria-hidden="true"><b>${esc(cur)}</b></span>
        <span class="tm-dp-row-main"><b>${esc(rate > 0 ? `${rate}%` : "No VAT")}</b><small>${esc(rate > 0 ? (isAdd(r.mode) ? "Added on top of the amount" : "Included in the amount") : "Nothing is added")}</small></span>
        <span class="tm-dp-row-amt">${rate > 0 ? k.pill(isAdd(r.mode) ? "Add on top" : "Included", "info") : ""}</span></li>`;
    }).join("")}</ul>` : k.empty("Default VAT per currency.");
    return k.stats([[esc(String(set.length)), "With VAT"], [esc(String(rows.length - set.length)), "No VAT"], [esc(String(rows.length)), "Currencies"]])
      + k.section("Actions", acts([k.btn("ah-vat", "Edit VAT settings", "fa-solid fa-percent", { primary: true })]))
      + k.section("VAT by currency", list);
  }

  // ── open ─────────────────────────────────────────────────────────────────────────────
  let fallback = null;
  function open(opts = {}){
    try { if (isGuestMode()) { alert("Account settings are not available in guest mode."); return; } } catch (_) {}
    const dp = DP();
    if (!dp?.custom?.open || !dp.kit) return fallback ? fallback.apply(global, arguments) : undefined;
    closeMenus();
    const c = caps();
    const tabs = [["profile", "Profile", "fa-solid fa-user"], ["security", "Security", "fa-solid fa-shield-halved"]];
    if (c.plan) tabs.push(["plan", "Plan", "fa-solid fa-crown"]);
    if (c.team) tabs.push(["team", "Team", "fa-solid fa-users"]);
    if (c.vat) tabs.push(["vat", "VAT", "fa-solid fa-percent"]);
    const first = typeof opts === "object" && opts && tabs.some(t => t[0] === opts.tab) ? opts.tab : "profile";
    st = { company: null, security: null, team: null, plan: null, bill: null };
    const k = dp.kit;
    def = {
      icon: "account", tabs, tab: first, state: st,
      head(){
        const snap = call("accountSettingsSnapshot", global.state?.sessionUser || {}) || {};
        const pills = [];
        if (c.user.is_protected) pills.push(k.pill("Main Admin", "info", "fa-solid fa-shield-halved"));
        else if (c.teamMember) pills.push(k.pill("Team member", "", "fa-solid fa-user-tie"));
        else if (snap.company) pills.push(k.pill("Company", "", "fa-solid fa-building"));
        return { title: "Account settings", sub: esc(`${snap.displayName || ""}${snap.username ? ` · @${snap.username}` : ""}`),
          avatar: `<span class="tm-dp-txico" style="--t:var(--primary,#2563eb)"><i class="fa-solid fa-user-gear"></i></span>`, pills };
      },
      render(tab){
        LOADERS[tab]?.();
        if (tab === "security") return securityTab();
        if (tab === "plan") return planTab();
        if (tab === "team") return teamTab();
        if (tab === "vat") return vatTab();
        return profileTab(c);
      },
      actions: {
        "ah-profile": () => call("openAccountProfileEditModal", null),
        "ah-company": () => call("openAccountCompanyEditModal", null),
        "ah-security": () => { DP().close(); setTimeout(() => global.openAccountSecurityCenter?.(), 0); },
        "ah-plan": b => { const tab = b.dataset.v || "overview"; DP().close(); setTimeout(() => global.TriplemPlanPanel ? global.TriplemPlanPanel.open({ tab }) : global.openPlanSubscriptionModal?.(), 0); },
        "ah-vat": () => { DP().close(); setTimeout(() => global.TriplemAccountPanels?.vat?.(), 0); },
        "ah-team": async b => {
          const tab = b.dataset.v || "members";
          DP().close();
          await new Promise(r => setTimeout(r, 0));
          try { await openCompanyTeamModal(); ensureCompanyTeamModal()?._switchTeamPanel?.(tab); } catch (e) { console.error(e); }
        }
      }
    };
    dp.custom.open(def);
    // Triplem AI card inside Profile keeps its own button
    setTimeout(() => {
      const b = DP()?.custom?.body?.()?.querySelector?.("#accountTriplemAiBtn");
      if (b && !b.dataset.tmAh) { b.dataset.tmAh = "1"; b.addEventListener("click", () => global.openTriplemAiSettingsModal?.()); }
    }, 0);
  }

  // After Edit profile / Edit company the app re-renders "the summary": refresh this panel.
  function installRefresh(){
    const base = global.renderAccountSettingsSummary;
    if (typeof base !== "function" || base.__tmAh) return;
    const f = function(modal){
      if (!modal && isOpen()) { st.company = null; paint(); return; }
      return base.apply(this, arguments);
    };
    f.__tmAh = true;
    global.renderAccountSettingsSummary = f;
  }
  function install(){
    const prev = global.openAccountSettingsModal;
    if (typeof prev !== "function" || prev.__tmAh) return false;
    fallback = prev;
    const f = function(){ return open.apply(this, arguments); };
    f.__tmAh = true;
    global.openAccountSettingsModal = f;
    installRefresh();
    return true;
  }
  if (!install()) document.addEventListener("DOMContentLoaded", install, { once: true });

  global.TriplemAccountHub = Object.freeze({ open, isOpen });
})(window);
