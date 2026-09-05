/* Modularized from script.js lines 35231-37377 — Admin RAW + backup. Load order must be preserved. */
function adminMetaChips(user){
  const currencies = userAllowedCurrencies(user);
  const tabs = userAllowedTabs(user);
  return `
    <div class="admin-chip-row">
      <span class="admin-chip-label">Currencies</span>
      ${currencies.map(c => `<span class="admin-badge ok">${escapeHtml(c)}</span>`).join("") || `<span class="admin-badge muted">None</span>`}
    </div>
    <div class="admin-chip-row">
      <span class="admin-chip-label">Tabs</span>
      ${tabs.map(t => `<span class="admin-badge">${escapeHtml(String(t).replace(/_/g, " "))}</span>`).join("") || `<span class="admin-badge muted">None</span>`}
    </div>`;
}

/** Group team members under their company owner (members stay out of the main list). */
function groupAdminUsersForDisplay(rows){
  const list = Array.isArray(rows) ? rows : [];
  const membersByOwner = new Map();
  list.forEach(u => {
    const ownerId = u.team_owner_id;
    if (!ownerId) return;
    if (!membersByOwner.has(ownerId)) membersByOwner.set(ownerId, []);
    membersByOwner.get(ownerId).push(u);
  });
  membersByOwner.forEach(members => {
    members.sort((a, b) => String(a.username || "").localeCompare(String(b.username || "")));
  });
  // Main list: company / solo accounts only — never team members.
  const roots = list.filter(u => !u.team_owner_id);
  return { roots, membersByOwner };
}

function getAdminTeamMembersForOwner(ownerId){
  const id = String(ownerId || "").trim();
  if (!id) return [];
  return (state.adminUsersCache || [])
    .filter(u => String(u.team_owner_id || "") === id)
    .sort((a, b) => String(a.username || "").localeCompare(String(b.username || "")));
}

function adminPendingSubscriptionForUser(userId){
  return (state.adminSubscriptionRequests || []).find(r => String(r.user_id || "") === String(userId || "") && r.status === "pending") || null;
}
function adminLatestSubscriptionForUser(userId){
  return (state.adminSubscriptionRequests || [])
    .filter(r => String(r.user_id || "") === String(userId || ""))
    .sort((a,b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0] || null;
}

function renderAdminUserCardHtml(user, { nested = false, memberCount = 0, inTeamOverlay = false } = {}){
  const flags = getUserAccessFlags(user);
  const pendingSubscription = adminPendingSubscriptionForUser(user.id);
  const latestSubscription = adminLatestSubscriptionForUser(user.id);
  const statusBadge = user.is_active
    ? `<span class="admin-badge ok">On</span>`
    : `<span class="admin-badge warn">Off</span>`;
  const roleBadge = user.role === "admin"
    ? `<span class="admin-badge">Admin</span>`
    : "";
  const protectedBadge = user.is_protected ? `<span class="admin-badge">Lock</span>` : "";
  const teamAccountBadge = user.allow_team_members
    ? `<span class="admin-badge ok">Team ${escapeHtml(String(Math.max(1, Math.min(50, Number(user.max_team_members) || 3))))}</span>`
    : "";
  const teamMemberBadge = (nested || inTeamOverlay)
    ? `<span class="admin-badge">Member</span>`
    : "";
  const pinEnabled = !!(user.smart_pin_enabled || String(user.smart_pin_hash || "").trim());
  const pinBadge = pinEnabled ? `<span class="admin-badge">Pin</span>` : "";
  const forceBadge = user.must_change_password ? `<span class="admin-badge warn">Force PW</span>` : "";
  const paymentBadge = pendingSubscription ? `<span class="admin-badge warn admin-payment-pending-badge">Payment pending</span>` : "";
  let planBadge = `<span class="admin-badge ok">Full</span>`;
  if (flags.period_expired && flags.grace_active) {
    planBadge = `<span class="admin-badge warn">Grace ${escapeHtml(String(Math.floor(Number(flags.grace_days_left) || 0)))}d</span>`;
  } else if (flags.lock_active) {
    planBadge = `<span class="admin-badge warn">Locked ${escapeHtml(String(Math.floor(Number(flags.lock_days_left) || 0)))}d</span>`;
  } else if (flags.period_expired) {
    planBadge = `<span class="admin-badge warn">${flags.is_trial ? "Trial" : "Plan"} ended</span>`;
  } else if (flags.period_active) {
    planBadge = `<span class="admin-badge">${flags.is_trial ? "Trial" : "Dated"} ${escapeHtml(String(flags.trial_days_remaining ?? "?"))}d</span>`;
  } else if (flags.is_trial) {
    planBadge = `<span class="admin-badge warn">Trial</span>`;
  }
  const trialSummary = flags.has_access_period
    ? `<span class="admin-user-summary-expiry">${escapeHtml(formatAccessDateShort(flags.trial_expires_at))}</span>`
    : flags.unlimited_access
      ? `<span class="admin-user-summary-expiry">∞</span>`
      : "";
  const isTeamMember = !!(user.team_owner_id || nested || inTeamOverlay);
  const grantBtn = (!user.is_protected && !isTeamMember && (flags.is_trial || flags.has_access_period || flags.access_plan !== "full"))
    ? `<button type="button" class="btn soft tiny" data-admin-action="clear_unlimited">Unlimited</button>`
    : "";
  const trialBtn = (!user.is_protected && !isTeamMember && user.role !== "admin" && !flags.is_trial)
    ? `<button type="button" class="btn ghost tiny" data-admin-action="start_trial">14d trial</button>`
    : "";
  const managePlanBtn = (user.is_protected || isTeamMember)
    ? ""
    : `<button type="button" class="btn primary tiny" data-admin-action="manage_plan"><i class="fa-solid fa-calendar-check"></i> Plan</button>`;
  const paymentReviewBtn = pendingSubscription ? `<button type="button" class="btn primary tiny" data-admin-action="review_payment"><i class="fa-solid fa-receipt"></i> Review payment</button>` : "";
  const paymentReceiptBtn = (!pendingSubscription && latestSubscription?.receipt_exists) ? `<button type="button" class="btn soft tiny" data-admin-action="review_last_payment"><i class="fa-solid fa-receipt"></i> Payment receipt</button>` : "";
  const clearPinBtn = (pinEnabled && !user.is_protected && isProtectedAdminSession())
    ? `<button type="button" class="btn ghost tiny" data-admin-action="clear_pin" title="Clear Smart Pin for support"><i class="fa-solid fa-key"></i> Clear Pin</button>`
    : "";
  const showTeamBtn = !isTeamMember && (memberCount > 0 || !!user.allow_team_members);
  const teamBtn = "";
  const companyLine = (user.company_name || user.settings?.Company)
    ? `<p class="admin-user-meta"><strong>${escapeHtml(user.company_name || user.settings.Company)}</strong>${(user.vat_number || user.settings?.TRN) ? ` · ${escapeHtml(user.vat_number || user.settings.TRN)}` : ""}</p>`
    : "";
  const contactLine = (() => {
    const email = user.company_email || user.settings?.email || user.settings?.Email || "";
    const phone = user.company_phone || user.settings?.Mobile || user.settings?.Phone || "";
    const address = user.company_address || user.settings?.Address || user.settings?.address || "";
    if (!email && !phone && !address) return "";
    const bits = [email, phone].filter(Boolean).map(v => escapeHtml(v));
    return `<p class="admin-user-meta">${bits.join(" · ")}${address ? `<br>${escapeHtml(address)}` : ""}</p>`;
  })();
  const nestClass = (nested || inTeamOverlay) ? " admin-user-card--team-member" : "";
  const nestAttr = (nested || inTeamOverlay) ? ` data-team-owner-id="${escapeHtml(user.team_owner_id || "")}"` : "";
  const memberHint = !isTeamMember && memberCount > 0
    ? `<span class="admin-user-team-count">${memberCount} team</span>`
    : "";
  const planFollowsNote = isTeamMember
    ? `<p class="admin-user-meta admin-team-plan-note"><i class="fa-solid fa-link" aria-hidden="true"></i> Plan follows the company account.</p>`
    : "";
  return `
    <article class="admin-user-card${nestClass}" data-user-id="${escapeHtml(user.id)}"${nestAttr}>
      <div class="admin-user-summary" data-admin-toggle-card role="button" tabindex="0" aria-expanded="false">
        <div class="admin-user-summary-main">
          <div class="admin-user-summary-title-row">
            ${inTeamOverlay || nested ? `<span class="admin-user-nest-marker" aria-hidden="true"><i class="fa-solid fa-user"></i></span>` : ""}
            <h4>${escapeHtml(user.display_name || user.username)}</h4>
            <code class="admin-user-summary-user">@${escapeHtml(user.username)}</code>
            ${trialSummary}
            ${memberHint}
            <button type="button" class="btn ghost tiny admin-summary-copy" data-copy="${escapeHtml(user.username)}" title="Copy username"><i class="fa-regular fa-copy" aria-hidden="true"></i></button>
          </div>
          <div class="admin-user-summary-badges">
            ${statusBadge}${roleBadge}${planBadge}${paymentBadge}${pinBadge}${protectedBadge}${teamAccountBadge}${teamMemberBadge}${forceBadge}
          </div>
        </div>
        ${showTeamBtn ? `<button type="button" class="btn soft tiny admin-summary-team-btn" data-admin-action="view_team"><i class="fa-solid fa-users"></i> Team${memberCount ? ` (${escapeHtml(String(memberCount))})` : ""}</button>` : ""}
        <span class="admin-user-chevron" aria-hidden="true"><i class="fa-solid fa-chevron-down"></i></span>
      </div>
      <div class="admin-user-details" hidden>
        <p class="admin-user-meta">
          Created ${escapeHtml(formatAdminDate(user.created_at))} · Login ${escapeHtml(formatAdminDate(user.last_login_at))}
          ${isTeamMember ? ` · Team of @${escapeHtml(user.team_owner_username || "company")}` : ""}
        </p>
        ${planFollowsNote}
        ${companyLine}
        ${contactLine}
        ${adminMetaChips(user)}
        <div class="admin-user-actions">
          ${paymentReviewBtn}
          ${paymentReceiptBtn}
          ${managePlanBtn}
          <button type="button" class="btn soft tiny" data-admin-action="edit">Edit</button>
          <button type="button" class="btn ghost tiny" data-admin-action="raw"><i class="fa-solid fa-database"></i> Raw</button>
          ${clearPinBtn}
          ${grantBtn}
          ${trialBtn}
          <button type="button" class="btn ghost tiny" data-admin-action="toggle" ${user.is_protected ? "disabled" : ""}>${user.is_active ? "Disable" : "Enable / Reopen"}</button>
          <button type="button" class="btn ghost tiny" data-admin-action="delete" ${user.is_protected ? "disabled" : ""}>Delete</button>
        </div>
      </div>
    </article>`;
}

function adminUserLogoUrl(user){
  const direct = String(user?.logo_url || user?.settings?.logo || "").trim();
  return direct || "Assets/logo/logo.png";
}

function adminUserLogoImage(user, className = ""){
  const src = adminUserLogoUrl(user);
  const name = user?.display_name || user?.username || "Triplem VIP user";
  return `<img${className ? ` class="${escapeHtml(className)}"` : ""} src="${escapeHtml(src)}" alt="${escapeHtml(name)} logo" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='Assets/logo/logo.png'" />`;
}

function renderAdminUserTileHtml(user, memberCount = 0){
  const name = user.display_name || user.username || "User";
  const inactive = user.is_active === false;
  return `<button type="button" class="admin-user-tile${inactive ? " is-inactive" : ""}" data-admin-user-tile="${escapeHtml(user.id)}" title="Open ${escapeHtml(name)}">
    <span class="admin-user-tile-avatar">${adminUserLogoImage(user, "admin-user-tile-logo")}${memberCount > 0 ? `<span class="admin-user-tile-count">${escapeHtml(String(memberCount))}</span>` : ""}</span>
    <span class="admin-user-tile-name">${escapeHtml(name)}</span>
  </button>`;
}

function closeAdminUserDetailsOverlay(){
  const modal = document.getElementById("adminUserDetailsModal");
  if (!modal) return;
  modal.classList.add("hide");
  modal.setAttribute("aria-hidden", "true");
  if (!document.querySelector(".modal:not(.hide)")) document.body.style.overflow = "";
}

function openAdminUserDetailsOverlay(user){
  if (!user) return;
  let modal = document.getElementById("adminUserDetailsModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "adminUserDetailsModal";
    modal.className = "modal hide admin-user-details-modal";
    document.body.appendChild(modal);
  }
  const rows = Array.isArray(state.adminUsersCache) ? state.adminUsersCache : [];
  const members = rows.filter(row => String(row.team_owner_id || "") === String(user.id));
  modal.innerHTML = `<div class="modal-backdrop" data-admin-user-details-close></div>
    <div class="modal-dialog admin-user-details-dialog" role="dialog" aria-modal="true" aria-labelledby="adminUserDetailsTitle">
      <div class="modal-head admin-user-details-head"><div><p class="admin-user-details-kicker"><i class="fa-solid fa-user-shield"></i> User management</p><h3 id="adminUserDetailsTitle">${escapeHtml(user.display_name || user.username)}</h3><p>@${escapeHtml(user.username)}</p></div><button type="button" class="btn ghost tiny" data-admin-user-details-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="modal-body admin-user-details-body">${renderAdminUserCardHtml(user,{nested:false,memberCount:members.length})}</div>
    </div>`;
  modal.querySelectorAll("[data-admin-user-details-close]").forEach(el => el.onclick = closeAdminUserDetailsOverlay);
  wireAdminUserListInteractions(modal, rows);
  const card = modal.querySelector(".admin-user-card");
  if (card) expandAdminUserCard(card, true, modal);
  modal.classList.remove("hide"); modal.setAttribute("aria-hidden","false"); document.body.style.overflow="hidden";
}
window.openAdminUserDetailsOverlay = openAdminUserDetailsOverlay;

let adminUserSearchTerm = "";

function adminUserMatchesSearch(user, term){
  const q = String(term || "").trim().toLowerCase();
  if (!q) return true;
  return [user?.username, user?.display_name].some(value => String(value || "").toLowerCase().includes(q));
}

function renderAdminUsersGrid(){
  const list = document.getElementById("adminUsersList");
  if (!list) return;
  const rows = Array.isArray(state.adminUsersCache) ? state.adminUsersCache : [];
  const { roots, membersByOwner } = groupAdminUsersForDisplay(rows);
  const q = String(adminUserSearchTerm || "").trim();
  const visible = q ? rows.filter(user => adminUserMatchesSearch(user, q)) : roots;
  const meta = document.getElementById("adminUsersSearchMeta");
  const clear = document.getElementById("adminUsersSearchClear");
  clear?.classList.toggle("hide", !q);
  if (meta) meta.textContent = q ? `${visible.length} match${visible.length === 1 ? "" : "es"}` : `${roots.length} account${roots.length === 1 ? "" : "s"}`;
  list.classList.add("admin-users-grid");
  if (!visible.length) {
    list.innerHTML = `<div class="empty admin-themed-loading admin-user-search-empty"><i class="fa-solid fa-magnifying-glass"></i> No user matches “${escapeHtml(q)}”.</div>`;
    return;
  }
  list.innerHTML = visible.map(user => renderAdminUserTileHtml(user, (membersByOwner.get(user.id) || []).length)).join("");
  list.querySelectorAll("[data-admin-user-tile]").forEach(tile => tile.addEventListener("click", () => {
    const user = rows.find(row => String(row.id) === String(tile.dataset.adminUserTile));
    if (user) openAdminUserDetailsOverlay(user);
  }));
}

function bindAdminUserSearch(){
  const input = document.getElementById("adminUsersSearch");
  const clear = document.getElementById("adminUsersSearchClear");
  if (input && !input.dataset.bound) {
    input.dataset.bound = "1";
    input.addEventListener("input", () => {
      adminUserSearchTerm = input.value || "";
      renderAdminUsersGrid();
    });
  }
  if (clear && !clear.dataset.bound) {
    clear.dataset.bound = "1";
    clear.addEventListener("click", () => {
      adminUserSearchTerm = "";
      if (input) { input.value = ""; input.focus({ preventScroll: true }); }
      renderAdminUsersGrid();
    });
  }
}

async function loadAdminUsers(){
  if (document.getElementById("adminSecurityLock")
      && !document.getElementById("adminSecurityLock").classList.contains("hide")
      && typeof isProtectedAdminSession === "function"
      && isProtectedAdminSession()) return;
  const list=document.getElementById("adminUsersList");
  if(!list) return;
  bindAdminUserSearch();
  if(!userHasPermission("admin_panel","view")){ list.classList.remove("admin-users-grid"); list.innerHTML=`<div class="empty admin-themed-loading">Administrator access required.</div>`; return; }
  list.classList.remove("admin-users-grid");
  list.innerHTML=`<div class="empty admin-themed-loading"><i class="fa-solid fa-spinner btn-loader"></i> Loading users…</div>`;
  try{
    const users=await supabaseRpc("app_admin_list_users",{}); const rows=Array.isArray(users)?users:[];
    let subscriptionRows=[];
    try{ const paymentRows=await supabaseRpc("app_admin_list_subscription_requests",{p_status:"all",p_limit:250}); subscriptionRows=Array.isArray(paymentRows)?paymentRows:[]; }catch(_){ subscriptionRows=[]; }
    state.adminUsersCache=rows; state.adminSubscriptionRequests=subscriptionRows;
    if(!rows.length){ list.innerHTML=`<div class="empty admin-themed-loading">No users found. Create the first additional account.</div>`; return; }
    bindAdminUserSearch();
    renderAdminUsersGrid();
    refreshAdminTeamOverlayIfOpen();
  }catch(err){ list.classList.remove("admin-users-grid"); list.innerHTML=`<div class="empty admin-themed-loading">Could not load users. ${escapeHtml(err.message||String(err))}</div>`; }
}

function expandAdminUserCard(card, open, scopeEl){
  if (!card) return;
  const details = card.querySelector(".admin-user-details");
  const toggle = card.querySelector("[data-admin-toggle-card]");
  card.classList.toggle("is-expanded", open);
  if (details) details.hidden = !open;
  if (toggle) toggle.setAttribute("aria-expanded", open ? "true" : "false");
  if (open && scopeEl) {
    scopeEl.querySelectorAll(".admin-user-card.is-expanded").forEach(other => {
      if (other !== card) expandAdminUserCard(other, false);
    });
  }
}

function wireAdminUserListInteractions(list, rows){
  if (!list) return;
  const users = Array.isArray(rows) ? rows : (state.adminUsersCache || []);

  list.querySelectorAll("[data-admin-toggle-card]").forEach(btn => {
    const toggle = (e) => {
      if (e.target.closest("[data-copy], [data-admin-action]")) return;
      const card = btn.closest(".admin-user-card");
      if (!card) return;
      const willOpen = !card.classList.contains("is-expanded");
      expandAdminUserCard(card, willOpen, list);
    };
    btn.addEventListener("click", toggle);
    btn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle(e);
      }
    });
  });

  list.querySelectorAll("[data-admin-action]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const userId = btn.closest("[data-user-id]")?.dataset.userId;
      const user = users.find(u => u.id === userId) || (state.adminUsersCache || []).find(u => u.id === userId);
      if (!user) return;
      handleAdminUserAction(btn.dataset.adminAction, user);
    });
  });
  list.querySelectorAll("[data-copy]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const value = btn.getAttribute("data-copy") || "";
      try {
        await navigator.clipboard.writeText(value);
        if (btn.classList.contains("admin-cred-icon") || btn.classList.contains("admin-summary-copy")) {
          const icon = btn.querySelector("i");
          if (icon) {
            const prevClass = icon.className;
            icon.className = "fa-solid fa-check";
            setTimeout(() => { icon.className = prevClass; }, 900);
          }
        } else {
          const prev = btn.textContent;
          btn.textContent = "Copied";
          setTimeout(() => { btn.textContent = prev; }, 900);
        }
      } catch {
        prompt("Copy this value:", value);
      }
    });
  });
  list.querySelectorAll("[data-toggle-pw]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const el = document.getElementById(btn.getAttribute("data-toggle-pw"));
      if (!el) return;
      const raw = el.getAttribute("data-password") || "";
      if (el.tagName === "INPUT") {
        const currentlyHidden = el.type === "password" || el.dataset.showing !== "1";
        if (currentlyHidden) {
          el.type = "text";
          el.value = raw;
          el.dataset.showing = "1";
          setPasswordEyeState(btn, true);
        } else {
          el.type = "password";
          el.value = raw ? (el.classList.contains("admin-cred-pin") ? "•".repeat(Math.min(6, Math.max(4, raw.length))) : "••••••••") : "";
          el.dataset.showing = "0";
          setPasswordEyeState(btn, false);
        }
      }
    });
  });
}

function closeAdminTeamOverlay(){
  const modal = document.getElementById("adminTeamOverlayModal");
  if (!modal) return;
  modal.classList.add("hide");
  modal.setAttribute("aria-hidden", "true");
  delete modal.dataset.ownerId;
  if (!document.querySelector(".modal:not(.hide)")) {
    document.body.style.overflow = "";
  }
}

function refreshAdminTeamOverlayIfOpen(){
  const modal = document.getElementById("adminTeamOverlayModal");
  if (!modal || modal.classList.contains("hide")) return;
  const ownerId = modal.dataset.ownerId || "";
  if (!ownerId) return;
  const owner = (state.adminUsersCache || []).find(u => u.id === ownerId);
  if (!owner) {
    closeAdminTeamOverlay();
    return;
  }
  openAdminTeamOverlay(owner, { reuse: true });
}

function openAdminTeamOverlay(owner, opts = {}){
  if (!owner || owner.team_owner_id) return;
  let modal = document.getElementById("adminTeamOverlayModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "adminTeamOverlayModal";
    modal.className = "modal hide";
    document.body.appendChild(modal);
  }
  modal.dataset.ownerId = owner.id;
  const members = getAdminTeamMembersForOwner(owner.id);
  const companyName = owner.company_name || owner.settings?.Company || owner.display_name || owner.username;
  const seats = Math.max(1, Math.min(50, Number(owner.max_team_members) || 3));
  modal.innerHTML = `
    <div class="modal-backdrop" data-admin-team-close></div>
    <div class="modal-dialog settings-sheet admin-team-overlay-sheet" role="dialog" aria-modal="true" aria-labelledby="adminTeamOverlayTitle">
      <div class="settings-sheet-head">
        <div>
          <h3 id="adminTeamOverlayTitle"><i class="fa-solid fa-users" aria-hidden="true"></i> Company team</h3>
          <p>${escapeHtml(companyName)} · @${escapeHtml(owner.username)} · ${members.length}/${seats} members</p>
        </div>
        <button type="button" class="btn ghost tiny" data-admin-team-close aria-label="Close">✕</button>
      </div>
      <div class="modal-body settings-sheet-body admin-team-overlay-body">
        <p class="admin-team-overlay-note">Team members inherit the company plan. Change the company Plan to update everyone.</p>
        <div id="adminTeamOverlayList" class="admin-users-list admin-team-overlay-list">
          ${members.length
            ? members.map(m => renderAdminUserCardHtml(m, { nested: true, inTeamOverlay: true })).join("")
            : `<div class="empty">No team members yet for this company.</div>`}
        </div>
      </div>
    </div>`;

  modal.querySelectorAll("[data-admin-team-close]").forEach(el => {
    el.onclick = () => closeAdminTeamOverlay();
  });
  const list = modal.querySelector("#adminTeamOverlayList");
  wireAdminUserListInteractions(list, members);
  if (!opts.reuse) {
    modal.classList.remove("hide");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }
}

function ensureAdminReceiptViewerModal(){
  let modal = document.getElementById("adminReceiptViewerModal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "adminReceiptViewerModal";
  modal.className = "modal hide admin-receipt-viewer-modal";
  modal.setAttribute("aria-hidden","true");
  document.body.appendChild(modal);
  return modal;
}

function closeAdminReceiptViewerModal(){
  const modal = document.getElementById("adminReceiptViewerModal");
  if (!modal) return;
  const url = modal.dataset.objectUrl || "";
  if (url) { try { URL.revokeObjectURL(url); } catch (_) {} }
  delete modal.dataset.objectUrl;
  delete modal.dataset.requestId;
  modal.classList.add("hide");
  modal.setAttribute("aria-hidden","true");
  if (!document.querySelector(".modal:not(.hide)")) document.body.style.overflow = "";
}

async function openAdminSubscriptionReceipt(requestId){
  const data = await supabaseRpc("app_admin_get_subscription_receipt", { p_request_id: requestId });
  if (!data?.base64 || !data?.mime) throw new Error("Receipt could not be loaded.");
  const bin = atob(data.base64);
  const bytes = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: data.mime }));
  const modal = ensureAdminReceiptViewerModal();
  const previousUrl = modal.dataset.objectUrl || "";
  if (previousUrl) { try { URL.revokeObjectURL(previousUrl); } catch (_) {} }
  modal.dataset.objectUrl = url;
  modal.dataset.requestId = String(requestId || data.id || "");
  const isPdf = String(data.mime || "").toLowerCase() === "application/pdf";
  const safeUrl = escapeHtml(url);
  modal.innerHTML = `
    <div class="modal-backdrop" data-receipt-viewer-close></div>
    <div class="modal-dialog admin-receipt-viewer-dialog" role="dialog" aria-modal="true" aria-labelledby="adminReceiptViewerTitle">
      <div class="admin-receipt-viewer-head">
        <div><p class="section-kicker">Payment confirmation</p><h3 id="adminReceiptViewerTitle"><i class="fa-solid fa-receipt"></i> ${escapeHtml(data.name || "Payment receipt")}</h3></div>
        <div class="admin-receipt-viewer-head-actions">
          <button type="button" class="btn ghost tiny danger-text" data-receipt-viewer-delete><i class="fa-solid fa-trash-can"></i><span>Delete receipt</span></button>
          <button type="button" class="btn ghost tiny" data-receipt-viewer-close aria-label="Close receipt"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>
      <div class="admin-receipt-viewer-body">
        ${isPdf
          ? `<iframe class="admin-receipt-viewer-pdf" src="${safeUrl}" title="Payment receipt PDF"></iframe>`
          : `<img class="admin-receipt-viewer-image" src="${safeUrl}" alt="Payment receipt" />`}
      </div>
      <div class="admin-receipt-viewer-foot"><span><i class="fa-solid fa-lock"></i> Private administrator-only receipt</span><small>${escapeHtml(data.mime || "")}</small></div>
    </div>`;
  modal.querySelectorAll("[data-receipt-viewer-close]").forEach(btn => btn.onclick = closeAdminReceiptViewerModal);
  const deleteBtn = modal.querySelector("[data-receipt-viewer-delete]");
  if (deleteBtn) deleteBtn.onclick = async () => {
    const confirmed = typeof appConfirmDelete === "function"
      ? await appConfirmDelete("Delete this stored payment receipt? The subscription request and approval audit record will remain; only the uploaded receipt file is removed from database storage.", { title: "Delete payment receipt?", confirmLabel: "Delete receipt" })
      : confirm("Delete this stored payment receipt? The subscription audit record will remain.");
    if (!confirmed) return;
    try {
      deleteBtn.disabled = true;
      await supabaseRpc("app_admin_delete_subscription_receipt", { p_request_id: modal.dataset.requestId });
      closeAdminReceiptViewerModal();
      const review = document.getElementById("subscriptionReviewModal");
      if (review && !review.classList.contains("hide")) {
        const receiptBtn = review.querySelector("#subReviewReceipt");
        const directDelete = review.querySelector("#subDeleteReceipt");
        const status = review.querySelector("#subReviewReceiptStatus");
        if (receiptBtn) receiptBtn.disabled = true;
        if (directDelete) directDelete.disabled = true;
        if (status) status.textContent = "Deleted after review";
        try { await loadAdminReceiptArchive(review, { reset: true }); } catch (_) {}
      }
      try { await loadAdminUsers(); } catch (_) {}
    } catch (error) {
      deleteBtn.disabled = false;
      alert(error.message || "Could not delete receipt.");
    }
  };
  modal.classList.remove("hide");
  modal.setAttribute("aria-hidden","false");
  document.body.style.overflow = "hidden";
  return modal;
}

const adminReceiptArchiveState = {
  rows: [],
  offset: 0,
  total: 0,
  available: 0,
  loading: false,
  pageSize: 80
};

function adminReceiptArchiveRowHtml(row){
  const plan = row.billing_period === "yearly" ? "Yearly" : "Monthly";
  const context = row.request_context === "renewal" ? "Extension" : "Signup";
  const stored = row.receipt_exists !== false;
  const status = String(row.status || "pending");
  return `<article class="admin-receipt-record${stored ? "" : " is-deleted"}" data-receipt-record="${escapeHtml(row.id)}">
    <label class="admin-receipt-check" title="Select receipt">
      <input type="checkbox" data-receipt-select="${escapeHtml(row.id)}" ${stored ? "" : "disabled"} aria-label="Select ${escapeHtml(row.receipt_name || "receipt")}" />
    </label>
    <div class="admin-receipt-record-main">
      <div class="admin-receipt-record-title"><strong>${escapeHtml(row.display_name || row.username || "User")}</strong><code>@${escapeHtml(row.username || "")}</code><span class="admin-receipt-status is-${escapeHtml(status)}">${escapeHtml(status)}</span></div>
      <p>${escapeHtml(plan)} · ${escapeHtml(row.billing_currency || "")} ${escapeHtml(String(row.total_amount ?? ""))} · ${escapeHtml(context)} · ${escapeHtml(String(row.payment_bank || "").toUpperCase())}</p>
      <small>${escapeHtml(row.receipt_name || "Receipt")}${row.created_at ? ` · ${escapeHtml(formatAdminDate(row.created_at))}` : ""}${!stored && row.receipt_deleted_at ? ` · deleted ${escapeHtml(formatAdminDate(row.receipt_deleted_at))}` : ""}</small>
    </div>
    <div class="admin-receipt-record-actions">
      <button type="button" class="btn soft tiny" data-receipt-open="${escapeHtml(row.id)}" ${stored ? "" : "disabled"} title="Open receipt"><i class="fa-solid fa-arrow-up-right-from-square"></i><span>Open</span></button>
      <button type="button" class="btn ghost tiny" data-receipt-delete="${escapeHtml(row.id)}" ${stored ? "" : "disabled"} title="Delete stored receipt"><i class="fa-solid fa-trash-can"></i></button>
    </div>
  </article>`;
}

function renderAdminReceiptArchive(modal){
  const list = modal?.querySelector("#adminReceiptArchiveList");
  if (!list) return;
  const rows = adminReceiptArchiveState.rows;
  list.innerHTML = rows.length
    ? rows.map(adminReceiptArchiveRowHtml).join("")
    : `<div class="admin-receipt-empty">No payment receipt records yet.</div>`;
  const count = modal.querySelector("#adminReceiptArchiveCount");
  if (count) count.textContent = `${adminReceiptArchiveState.available} stored · ${adminReceiptArchiveState.total} records`;
  const more = modal.querySelector("#adminReceiptLoadMore");
  if (more) {
    more.hidden = adminReceiptArchiveState.rows.length >= adminReceiptArchiveState.total;
    more.disabled = adminReceiptArchiveState.loading;
  }
  const selectAll = modal.querySelector("#adminReceiptSelectVisible");
  if (selectAll) selectAll.checked = false;
}

async function loadAdminReceiptArchive(modal, { reset = false } = {}){
  if (!modal || adminReceiptArchiveState.loading) return;
  adminReceiptArchiveState.loading = true;
  const list = modal.querySelector("#adminReceiptArchiveList");
  if (reset && list) list.innerHTML = `<div class="admin-receipt-empty"><i class="fa-solid fa-spinner btn-loader"></i> Loading receipt records…</div>`;
  try {
    const offset = reset ? 0 : adminReceiptArchiveState.rows.length;
    const result = unwrapRpcJson(await supabaseRpc("app_admin_list_subscription_receipts", {
      p_limit: adminReceiptArchiveState.pageSize,
      p_offset: offset,
      p_receipt_state: "all"
    })) || {};
    const incoming = Array.isArray(result.rows) ? result.rows : [];
    adminReceiptArchiveState.rows = reset ? incoming : adminReceiptArchiveState.rows.concat(incoming);
    adminReceiptArchiveState.offset = adminReceiptArchiveState.rows.length;
    adminReceiptArchiveState.total = Math.max(0, Number(result.total) || 0);
    adminReceiptArchiveState.available = Math.max(0, Number(result.available) || 0);
    renderAdminReceiptArchive(modal);
  } catch (error) {
    const fallback = Array.isArray(state.adminSubscriptionRequests) ? state.adminSubscriptionRequests : [];
    if (reset && fallback.length) {
      adminReceiptArchiveState.rows = fallback.slice();
      adminReceiptArchiveState.total = fallback.length;
      adminReceiptArchiveState.available = fallback.filter(row => row.receipt_exists !== false).length;
      renderAdminReceiptArchive(modal);
    } else if (list) {
      list.innerHTML = `<div class="admin-receipt-empty">${escapeHtml(error.message || "Could not load receipt records.")}</div>`;
    }
  } finally {
    adminReceiptArchiveState.loading = false;
    const more = modal.querySelector("#adminReceiptLoadMore");
    if (more) more.disabled = false;
  }
}

async function deleteAdminReceiptArchiveIds(modal, ids, { all = false } = {}){
  const selected = Array.isArray(ids) ? ids.filter(Boolean) : [];
  if (!all && !selected.length) return;
  const message = all
    ? "Delete every stored Pro payment receipt? Subscription request records, approval history and user financial data will remain. Only the uploaded receipt files are removed."
    : `Delete ${selected.length} selected stored payment receipt${selected.length === 1 ? "" : "s"}? Request and approval records will remain.`;
  const confirmed = typeof appConfirmDelete === "function"
    ? await appConfirmDelete(message, { title: all ? "Delete all stored receipts?" : "Delete selected receipts?", confirmLabel: all ? "Delete all receipts" : "Delete selected" })
    : confirm(message);
  if (!confirmed) return;
  await supabaseRpc("app_admin_delete_subscription_receipts", { p_request_ids: all ? null : selected, p_delete_all: all });
  await loadAdminReceiptArchive(modal, { reset: true });
  try { await loadAdminUsers(); } catch (_) {}
}

function wireAdminReceiptArchive(modal){
  const host = modal?.querySelector("#adminReceiptArchive");
  if (!host || host.dataset.bound === "1") return;
  host.dataset.bound = "1";
  host.addEventListener("change", e => {
    const master = e.target.closest?.("#adminReceiptSelectVisible");
    if (!master) return;
    host.querySelectorAll("[data-receipt-select]:not(:disabled)").forEach(box => { box.checked = master.checked; });
  });
  host.addEventListener("click", async e => {
    const openBtn = e.target.closest?.("[data-receipt-open]");
    const deleteBtn = e.target.closest?.("[data-receipt-delete]");
    const deleteSelected = e.target.closest?.("#adminReceiptDeleteSelected");
    const deleteAll = e.target.closest?.("#adminReceiptDeleteAll");
    const loadMore = e.target.closest?.("#adminReceiptLoadMore");
    try {
      if (openBtn) {
        e.preventDefault();
        await openAdminSubscriptionReceipt(openBtn.dataset.receiptOpen);
      } else if (deleteBtn) {
        e.preventDefault();
        await deleteAdminReceiptArchiveIds(modal, [deleteBtn.dataset.receiptDelete]);
      } else if (deleteSelected) {
        e.preventDefault();
        const ids = Array.from(host.querySelectorAll("[data-receipt-select]:checked")).map(box => box.dataset.receiptSelect);
        if (!ids.length) return alert("Select at least one stored receipt.");
        await deleteAdminReceiptArchiveIds(modal, ids);
      } else if (deleteAll) {
        e.preventDefault();
        if (!adminReceiptArchiveState.available) return alert("There are no stored receipts to delete.");
        await deleteAdminReceiptArchiveIds(modal, [], { all: true });
      } else if (loadMore) {
        e.preventDefault();
        await loadAdminReceiptArchive(modal, { reset: false });
      }
    } catch (error) {
      alert(error.message || "Receipt action failed.");
    }
  });
}

function openAdminSubscriptionReviewModal(request){
  let modal = document.getElementById("subscriptionReviewModal");
  if (!modal) { modal = document.createElement("div"); modal.id = "subscriptionReviewModal"; modal.className = "modal hide"; document.body.appendChild(modal); }
  const plan = request.billing_period === "yearly" ? "Pro Yearly" : "Pro Monthly";
  const teamText = request.team_enabled ? `${request.team_seats} paid team seat${Number(request.team_seats)===1?"":"s"}` : "No paid team seats";
  const requestContext = request.request_context === "renewal" ? "Plan extension" : "New Pro signup";
  const requestPending = String(request.status || "pending") === "pending";
  const receiptExists = request.receipt_exists !== false;
  const proposedExpiry = request.proposed_expires_at ? formatTrialExpiry(request.proposed_expires_at) : "Calculated on approval";
  const previousOverflow = document.body.style.overflow;
  modal.innerHTML = `
    <div class="modal-backdrop" data-sub-review-close></div>
    <div class="modal-dialog settings-sheet admin-subscription-review-sheet" role="dialog" aria-modal="true" aria-labelledby="subReviewTitle">
      <div class="settings-sheet-head"><div><h3 id="subReviewTitle"><i class="fa-solid fa-receipt"></i> Payment approval</h3><p>${escapeHtml(request.display_name || request.username)} · @${escapeHtml(request.username || "")}</p></div><button type="button" class="btn ghost tiny" data-sub-review-close>✕</button></div>
      <div class="modal-body settings-sheet-body admin-subscription-review">
        <div class="admin-subscription-grid">
          <div class="admin-subscription-kv"><span>Plan</span><strong>${escapeHtml(plan)}</strong></div>
          <div class="admin-subscription-kv"><span>Amount</span><strong>${escapeHtml(request.billing_currency)} ${escapeHtml(String(request.total_amount))}</strong></div>
          <div class="admin-subscription-kv"><span>Account</span><strong>${escapeHtml(request.account_type || "individual")}</strong></div>
          <div class="admin-subscription-kv"><span>Team</span><strong>${escapeHtml(teamText)}</strong></div>
          <div class="admin-subscription-kv"><span>Request</span><strong>${escapeHtml(requestContext)}</strong></div>
          <div class="admin-subscription-kv"><span>Paid to</span><strong>${escapeHtml(String(request.payment_bank || "").toUpperCase())}</strong></div>
          <div class="admin-subscription-kv"><span>Proposed expiry</span><strong>${escapeHtml(proposedExpiry)}</strong></div>
          <div class="admin-subscription-kv"><span>Receipt</span><strong id="subReviewReceiptStatus">${receiptExists ? escapeHtml(request.receipt_name || "Attached") : "Deleted after review"}</strong></div>
        </div>
        <div class="admin-subscription-receipt-actions">
          <button type="button" class="btn soft tiny" id="subReviewReceipt" ${receiptExists ? "" : "disabled"}><i class="fa-solid fa-arrow-up-right-from-square"></i> Open receipt</button>
          <button type="button" class="btn ghost tiny" id="subDeleteReceipt" ${receiptExists ? "" : "disabled"}><i class="fa-solid fa-trash-can"></i> Delete receipt</button>
        </div>
        ${requestPending ? `<label class="settings-field admin-subscription-note">Admin note<input id="subReviewNote" class="input settings-input" placeholder="Optional approval / decline note" /></label>
        <div class="admin-subscription-actions">
          <button class="btn primary tiny" data-sub-action="approve">Approve paid plan</button>
          <button class="btn soft tiny" data-sub-action="grant_trial">Fresh 14 days</button>
          <button class="btn soft tiny" data-sub-action="grant_month">1 month</button>
          <button class="btn soft tiny" data-sub-action="grant_3_months">3 months</button>
          <button class="btn soft tiny" data-sub-action="grant_6_months">6 months</button>
          <button class="btn soft tiny" data-sub-action="grant_year">1 year</button>
          <button class="btn ghost tiny" data-sub-action="grant_unlimited">Unlimited</button>
          <button class="btn ghost tiny" data-sub-action="decline">Decline</button>
          <button class="btn ghost tiny" data-sub-action="decline_disable">Decline & disable</button>
          <button class="btn ghost tiny" data-sub-action="delete">Delete account</button>
        </div>` : `<div class="subscription-pending-card"><strong>Request ${escapeHtml(String(request.status || "resolved"))}</strong>${request.resolved_at ? `<br><span>Resolved ${escapeHtml(formatAdminDate(request.resolved_at))}</span>` : ""}${request.admin_note ? `<br><span>${escapeHtml(request.admin_note)}</span>` : ""}</div>`}
        <div id="subReviewError" class="lock-error"></div>
        <details class="admin-receipt-archive" id="adminReceiptArchive" open>
          <summary><span><i class="fa-solid fa-box-archive"></i> Receipt records</span><small id="adminReceiptArchiveCount">Loading…</small></summary>
          <div class="admin-receipt-archive-body">
            <div class="admin-receipt-toolbar">
              <label><input type="checkbox" id="adminReceiptSelectVisible" /> Select visible</label>
              <span></span>
              <button type="button" class="btn ghost tiny" id="adminReceiptDeleteSelected"><i class="fa-solid fa-trash-can"></i> Delete selected</button>
              <button type="button" class="btn ghost tiny" id="adminReceiptDeleteAll"><i class="fa-solid fa-broom-ball"></i> Delete all stored</button>
            </div>
            <div id="adminReceiptArchiveList" class="admin-receipt-archive-list"><div class="admin-receipt-empty"><i class="fa-solid fa-spinner btn-loader"></i> Loading receipt records…</div></div>
            <button type="button" class="btn soft tiny admin-receipt-load-more" id="adminReceiptLoadMore" hidden>Load more records</button>
          </div>
        </details>
      </div>
    </div>`;
  const close = () => { modal.classList.add("hide"); modal.setAttribute("aria-hidden","true"); document.body.style.overflow = previousOverflow; };
  modal.querySelectorAll("[data-sub-review-close]").forEach(el => el.onclick = close);
  const receiptBtn = modal.querySelector("#subReviewReceipt");
  if (receiptBtn) receiptBtn.onclick = async () => { try { await openAdminSubscriptionReceipt(request.id); } catch (e) { alert(e.message || "Could not open receipt."); } };
  const deleteReceiptBtn = modal.querySelector("#subDeleteReceipt");
  if (deleteReceiptBtn) deleteReceiptBtn.onclick = async () => {
    const confirmed = typeof appConfirmDelete === "function"
      ? await appConfirmDelete(`Delete the stored payment receipt for @${request.username}? The payment request and audit record will remain.`, { title: "Delete payment receipt?", confirmLabel: "Delete receipt" })
      : confirm(`Delete the stored payment receipt for @${request.username}? The payment request and audit record will remain.`);
    if (!confirmed) return;
    try {
      deleteReceiptBtn.disabled = true;
      await supabaseRpc("app_admin_delete_subscription_receipt", { p_request_id: request.id });
      request.receipt_exists = false;
      if (receiptBtn) receiptBtn.disabled = true;
      const status = modal.querySelector("#subReviewReceiptStatus");
      if (status) status.textContent = "Deleted after review";
      deleteReceiptBtn.innerHTML = `<i class="fa-solid fa-check"></i> Deleted`;
      try { await loadAdminUsers(); } catch (_) {}
      await loadAdminReceiptArchive(modal, { reset: true });
    } catch (e) {
      deleteReceiptBtn.disabled = false;
      alert(e.message || "Could not delete receipt.");
    }
  };
  modal.querySelectorAll("[data-sub-action]").forEach(btn => btn.onclick = async () => {
    const action = btn.dataset.subAction;
    const destructive = action === "delete" || action === "decline_disable";
    if (destructive && !confirm(action === "delete" ? `Delete @${request.username} permanently?` : `Decline payment and disable @${request.username}?`)) return;
    const err = modal.querySelector("#subReviewError"); err.textContent=""; err.classList.remove("show");
    try {
      modal.querySelectorAll("[data-sub-action]").forEach(x => x.disabled=true);
      await supabaseRpc("app_admin_resolve_subscription_request", { p_request_id: request.id, p_action: action, p_note: modal.querySelector("#subReviewNote")?.value || null });
      close();
      await loadAdminUsers();
      try { await loadAdminNotificationsDropdown(); } catch (_) {}
    } catch (e) {
      err.textContent=e.message || "Could not resolve payment request."; err.classList.add("show");
      modal.querySelectorAll("[data-sub-action]").forEach(x => x.disabled=false);
    }
  });
  wireAdminReceiptArchive(modal);
  modal.classList.remove("hide"); modal.setAttribute("aria-hidden","false");
  document.body.style.overflow = "hidden";
  loadAdminReceiptArchive(modal, { reset: true }).catch(() => {});
}


async function openAdminSubscriptionReviewById(requestId){
  if (!requestId) throw new Error("Payment request is missing.");
  const request = await supabaseRpc("app_admin_get_subscription_request", { p_request_id: requestId });
  if (!request?.id) throw new Error("Payment request could not be loaded.");
  openAdminSubscriptionReviewModal(request);
}

const TRIPLEM_SUBSCRIPTION_PRICES = Object.freeze({
  monthly: Object.freeze({ AED: 49, SAR: 49, PKR: 1799, USD: 13.99 }),
  yearly: Object.freeze({ AED: 449, SAR: 449, PKR: 19999, USD: 149 })
});
const TRIPLEM_TEAM_PRICES = Object.freeze({
  monthly: Object.freeze({ AED: 10, SAR: 10, PKR: 75, USD: 4 }),
  yearly: Object.freeze({ AED: 80, SAR: 80, PKR: 7000, USD: 40 })
});

function subscriptionMoney(value, currency){
  return `${currency} ${Number(value || 0).toLocaleString(undefined,{maximumFractionDigits:2})}`;
}

function subscriptionFileBase64(file){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(new Error("Could not read the payment receipt."));
    reader.readAsDataURL(file);
  });
}

async function openPlanSubscriptionModal(){
  if (isGuestMode()) return alert("Plan & Subscription is available after sign-in.");
  let modal = document.getElementById("planSubscriptionModal");
  if (!modal) { modal=document.createElement("div"); modal.id="planSubscriptionModal"; modal.className="modal hide"; document.body.appendChild(modal); }
  modal.innerHTML = `<div class="modal-backdrop" data-plan-sub-close></div><div class="modal-dialog settings-sheet plan-subscription-sheet"><div class="settings-sheet-head"><div><h3><i class="fa-solid fa-crown"></i> Plan &amp; Subscription</h3><p>Upgrade, extend and review your Triplem VIP access</p></div><button type="button" class="btn ghost tiny" data-plan-sub-close aria-label="Close">✕</button></div><div class="modal-body settings-sheet-body"><div class="plan-sub-loading"><i class="fa-solid fa-spinner btn-loader"></i> Loading subscription…</div></div></div>`;
  const previousOverflow = document.body.style.overflow;
  const close = () => { modal.classList.add("hide"); modal.setAttribute("aria-hidden","true"); try { document.body.style.overflow=previousOverflow; } catch (_) {} };
  modal.querySelectorAll("[data-plan-sub-close]").forEach(el=>el.onclick=close);
  modal.classList.remove("hide"); modal.setAttribute("aria-hidden","false");
  try { document.body.style.overflow="hidden"; } catch (_) {}

  let sub;
  try { sub = await supabaseRpc("app_my_subscription_status", {}); }
  catch (e) { modal.querySelector(".settings-sheet-body").innerHTML=`<div class="lock-error show">${escapeHtml(e.message || "Could not load subscription details.")}</div>`; return; }
  const body=modal.querySelector(".settings-sheet-body");
  const access=sub?.access || getUserAccessFlags();
  const isTeamMember=sub?.account_type === "team_member" || isTeamMemberAccount(state.sessionUser);
  const isProtected=!!state.sessionUser?.is_protected;
  const pending=!!sub?.pending || sub?.status === "pending";
  const currentPeriod = sub?.current_paid_period || (!pending ? sub?.plan : null);
  const currentPaidLabel = currentPeriod === "yearly" ? "Pro Yearly" : (currentPeriod === "monthly" ? "Pro Monthly" : "Pro");
  const currentLabel=access.is_trial ? "Free 14-Day Trial" : (access.unlimited_access ? "Pro Unlimited" : currentPaidLabel);
  const currentExpiry=access.unlimited_access ? "No expiry" : formatTrialExpiry(access.trial_expires_at);
  const promotionAvailable=sub?.promotion_available !== false;
  const pendingPlan=sub?.plan === "yearly" ? "Pro Yearly" : "Pro Monthly";
  const pendingExpiry=sub?.proposed_expires_at ? formatTrialExpiry(sub.proposed_expires_at) : currentExpiry;

  body.innerHTML = `
    <div class="plan-sub-current-card">
      <div><span class="section-kicker">Current access</span><h4>${escapeHtml(currentLabel)}</h4><p>${escapeHtml(currentExpiry)}</p></div>
      <span class="settings-pill ${pending ? "warn" : "ok"}">${pending ? "Payment pending" : "Active"}</span>
    </div>
    ${pending ? `<div class="plan-sub-pending"><i class="fa-solid fa-clock"></i><div><strong>Payment approval pending</strong><p>${escapeHtml(pendingPlan)} · ${escapeHtml(sub.currency || "")} ${escapeHtml(String(sub.amount ?? ""))}${sub.team_enabled ? ` · ${escapeHtml(String(sub.team_seats))} team member${Number(sub.team_seats)===1?"":"s"}` : ""}</p><p>Proposed expiry: <strong>${escapeHtml(pendingExpiry)}</strong>. Your workspace remains available while the administrator verifies the receipt.</p></div></div>` : ""}
    ${isTeamMember ? `<div class="plan-sub-managed"><i class="fa-solid fa-building-shield"></i><div><strong>Managed by company account</strong><p>Your plan and paid team access are controlled by the company main account.</p></div></div>` : ""}
    ${isProtected ? `<div class="plan-sub-managed"><i class="fa-solid fa-shield-halved"></i><div><strong>Protected administrator</strong><p>This account does not require self-service subscription renewal.</p></div></div>` : ""}
    ${(!pending && !isTeamMember && !isProtected) ? `
      <div class="plan-sub-offer-head"><div><span class="section-kicker">Choose extension</span><h4>${access.is_trial ? "Upgrade to Pro" : "Extend your Pro plan"}</h4></div>${promotionAvailable ? `<span class="plan-promo-pill"><i class="fa-solid fa-bolt"></i> First paid-plan bonus available</span>` : ""}</div>
      <div class="plan-sub-plan-grid">
        <button type="button" class="plan-sub-card selected" data-plan-period="monthly"><i class="fa-regular fa-calendar"></i><strong>Pro Monthly</strong><span id="planMonthlyPrice"></span><small>${promotionAvailable ? "First approval includes 1 additional month free" : "Adds 1 month from your current expiry"}</small></button>
        <button type="button" class="plan-sub-card" data-plan-period="yearly"><i class="fa-solid fa-crown"></i><strong>Pro Yearly</strong><span id="planYearlyPrice"></span><small>${promotionAvailable ? "First approval includes 2 additional months free" : "Adds 12 months from your current expiry"}</small></button>
      </div>
      <div class="plan-sub-controls">
        <label class="settings-field">Payment currency<select id="planBillingCurrency" class="input settings-input"><option>AED</option><option>SAR</option><option>PKR</option><option>USD</option></select></label>
        <div class="plan-sub-team-summary ${sub?.team_enabled ? "" : "hide"}"><i class="fa-solid fa-users"></i><div><strong>${escapeHtml(String(sub?.team_seats || 0))} paid team member${Number(sub?.team_seats)===1?"":"s"}</strong><small id="planTeamPrice"></small></div></div>
      </div>
      <div class="plan-sub-total" id="planSubscriptionTotal"></div>
      <div class="signup-bank-grid plan-bank-grid">
        <label class="signup-bank-card selected"><input type="radio" name="planPaymentBank" value="hbl" checked /><img src="Assets/logo/wallet_logos/HBL.png" alt="HBL" /><span><strong>HBL</strong><small>Account Title: NADEEM</small><small>Account Number: 19227900107403</small><small>IBAN: PK87HABB0019227900107403</small><small>Branch: KHAWARI</small></span></label>
        <label class="signup-bank-card"><input type="radio" name="planPaymentBank" value="enbd" /><img src="Assets/logo/wallet_logos/Emirates NBD.png" alt="Emirates NBD" /><span><strong>Emirates NBD</strong><small>Name: Nadeem Shahzad Fida</small><small>IBAN: AE060260001015884837801</small><small>Account No: 1015884837801</small></span></label>
      </div>
      <label class="settings-field plan-receipt-field">Payment receipt<input id="planReceiptFile" class="input settings-input" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" /><span class="settings-hint">PNG, JPG, WebP or PDF, maximum 5MB. The receipt remains private for administrator review.</span></label>
      <div id="planSubscriptionError" class="lock-error"></div>
      <div class="settings-sheet-footer plan-sub-footer"><button type="button" class="btn ghost" data-plan-sub-close>Cancel</button><button type="button" class="btn primary" id="planSubscriptionSubmit"><i class="fa-solid fa-paper-plane"></i> Submit payment for approval</button></div>
    ` : ""}`;
  body.querySelectorAll("[data-plan-sub-close]").forEach(el=>el.onclick=close);
  if (pending || isTeamMember || isProtected) return;

  let selectedPeriod="monthly";
  const currency=body.querySelector("#planBillingCurrency");
  const seats=Number(sub?.team_seats || 0);
  const updatePrice=()=>{
    const cur=currency.value;
    body.querySelector("#planMonthlyPrice").textContent=subscriptionMoney(TRIPLEM_SUBSCRIPTION_PRICES.monthly[cur],cur);
    body.querySelector("#planYearlyPrice").textContent=subscriptionMoney(TRIPLEM_SUBSCRIPTION_PRICES.yearly[cur],cur);
    const teamUnit=TRIPLEM_TEAM_PRICES[selectedPeriod][cur];
    const teamAmount=seats*teamUnit;
    const base=TRIPLEM_SUBSCRIPTION_PRICES[selectedPeriod][cur];
    if (body.querySelector("#planTeamPrice")) body.querySelector("#planTeamPrice").textContent=`${subscriptionMoney(teamUnit,cur)} each · ${subscriptionMoney(teamAmount,cur)} total`;
    const bonus=promotionAvailable ? (selectedPeriod === "yearly" ? 2 : 1) : 0;
    body.querySelector("#planSubscriptionTotal").innerHTML=`<span>Total to transfer</span><strong>${escapeHtml(subscriptionMoney(base+teamAmount,cur))}</strong><small>${bonus ? `On approval: ${selectedPeriod === "yearly" ? "12" : "1"} paid month${selectedPeriod==="yearly"?"s":""} + ${bonus} bonus month${bonus===1?"":"s"}` : `On approval: ${selectedPeriod === "yearly" ? "12 months" : "1 month"} added to your plan`}</small>`;
  };
  body.querySelectorAll("[data-plan-period]").forEach(card=>card.onclick=()=>{ selectedPeriod=card.dataset.planPeriod; body.querySelectorAll("[data-plan-period]").forEach(x=>x.classList.toggle("selected",x===card)); updatePrice(); });
  body.querySelectorAll('input[name="planPaymentBank"]').forEach(r=>r.onchange=()=>body.querySelectorAll(".plan-bank-grid .signup-bank-card").forEach(x=>x.classList.toggle("selected",!!x.querySelector("input")?.checked)));
  currency.onchange=updatePrice; updatePrice();
  const submit=body.querySelector("#planSubscriptionSubmit");
  submit.onclick=async()=>{
    const err=body.querySelector("#planSubscriptionError"); err.textContent=""; err.classList.remove("show");
    try {
      const file=body.querySelector("#planReceiptFile")?.files?.[0];
      if (!file) throw new Error("Please attach your bank transfer receipt.");
      if (file.size>5*1024*1024) throw new Error("Payment receipt must be 5MB or smaller.");
      if (!["image/png","image/jpeg","image/webp","application/pdf"].includes(file.type)) throw new Error("Receipt must be PNG, JPG, WebP, or PDF.");
      submit.disabled=true; submit.innerHTML=`<i class="fa-solid fa-spinner btn-loader"></i> Submitting…`;
      await supabaseRpc("app_request_pro_subscription",{
        p_period:selectedPeriod,p_billing_currency:currency.value,
        p_payment_bank:body.querySelector('input[name="planPaymentBank"]:checked')?.value || "hbl",
        p_receipt_name:file.name,p_receipt_mime:file.type,p_receipt_base64:await subscriptionFileBase64(file)
      });
      try { const validated=await supabaseRpc("app_validate_session",{}); if(validated?.user) applyUserProfileToConfig(validated.user); } catch (_) {}
      updateAccessBanner();
      close();
      alert("Payment submitted. Your request is pending administrator approval.");
      await openPlanSubscriptionModal();
    } catch(e){ err.textContent=e.message || "Could not submit your payment."; err.classList.add("show"); submit.disabled=false; submit.innerHTML=`<i class="fa-solid fa-paper-plane"></i> Submit payment for approval`; }
  };
}

async function handleAdminUserAction(action, user, opts = {}){
  try {
    if (action === "view_team") {
      openAdminTeamOverlay(user);
      return;
    }
    if (action === "review_payment") {
      const request = adminPendingSubscriptionForUser(user.id);
      if (!request) return alert("No pending payment request for this user.");
      await openAdminSubscriptionReviewById(request.id);
      return;
    }
    if (action === "review_last_payment") {
      const request = adminLatestSubscriptionForUser(user.id);
      if (!request) return alert("No payment record found for this user.");
      await openAdminSubscriptionReviewById(request.id);
      return;
    }
    if (action === "manage_plan") {
      if (user.team_owner_id) {
        return alert("Team member plans follow the company account. Open the company Plan instead.");
      }
      openAdminManagePlanModal(user);
      return;
    }
    if (action === "edit") {
      openAdminEditUserModal(user);
      return;
    }
    if (action === "raw") {
      openAdminRawDataOverlay(user);
      return;
    }
    if (action === "clear_pin") {
      if (!isProtectedAdminSession()) {
        return alert("Protected administrator access required.");
      }
      if (user.is_protected) return;
      if (!confirm(`Clear Smart Pin for "${user.username}"? Lockout attempts will also reset so they can set a new pin immediately.`)) return;
      await supabaseRpc("app_admin_clear_user_smart_pin", { p_user_id: user.id });
      // Belt-and-suspenders: ensure lockout row is cleared even if an older clear RPC is still deployed.
      try {
        await supabaseRpc("app_admin_reopen_smart_pin_lockout", { p_user_id: user.id });
      } catch (_) { /* ignore if unavailable / already cleared */ }
      await loadAdminUsers();
      return;
    }
    if (action === "grant_full" || action === "clear_unlimited") {
      if (user.is_protected) return;
      if (user.team_owner_id) {
        return alert("Team member plans follow the company account. Open the company Plan instead.");
      }
      if (!confirm(`Remove expiry for "${user.username}" and grant unlimited full access?`)) return;
      await supabaseRpc("app_admin_set_access_expiry", {
        p_user_id: user.id,
        p_until_date: null,
        p_clear_unlimited: true,
        p_note: "Cleared expiry · unlimited"
      });
      await loadAdminUsers();
      return;
    }
    if (action === "start_trial") {
      if (user.team_owner_id) {
        return alert("Team member plans follow the company account. Open the company Plan instead.");
      }
      if (user.is_protected || user.role === "admin") return alert("Admin accounts cannot be set to trial.");
      if (!confirm(`Start a fresh 14-day trial for "${user.username}"?`)) return;
      await supabaseRpc("app_admin_set_access_period", {
        p_user_id: user.id,
        p_days: 14,
        p_access_plan: "trial",
        p_period: "custom"
      });
      await loadAdminUsers();
      return;
    }
    if (action === "toggle") {
      if (user.is_protected) return alert("Protected administrator cannot be disabled.");
      const enabling = !user.is_active;
      if (enabling) {
        try {
          await supabaseRpc("app_admin_reopen_smart_pin_lockout", { p_user_id: user.id });
        } catch (reopenErr) {
          const msg = String(reopenErr?.message || reopenErr || "").toLowerCase();
          // Fallback if migration 085 is not applied yet.
          if (!(msg.includes("could not find the function") || msg.includes("pgrst202") || msg.includes("404"))) {
            throw reopenErr;
          }
          await supabaseRpc("app_admin_update_user_access", {
            p_user_id: user.id,
            p_is_active: true
          });
        }
      } else {
        await supabaseRpc("app_admin_update_user_access", {
          p_user_id: user.id,
          p_is_active: false
        });
      }
      await loadAdminUsers();
      return;
    }
    if (action === "delete") {
      if (user.is_protected) return alert("Protected administrator cannot be deleted.");
      if (!(await appConfirmDelete(`Delete user "${user.username}"? Their wallets and financial data will be permanently deleted.`, { title: "Delete user permanently?", confirmLabel: "Delete user", note: "The user account and its related financial data will be removed permanently." }))) return;
      await supabaseRpc("app_admin_delete_user", { p_user_id: user.id });
      await loadAdminUsers();
    }
  } catch (err) {
    alert(err.message || "Action failed.");
  }
}

const ADMIN_RAW_SECTIONS = [
  { id: "all", label: "All" },
  { id: "expenses", label: "Wallets / Expenses" },
  { id: "loans", label: "Loans" },
  { id: "inventory", label: "Inventory" },
  { id: "installments", label: "Installments" },
  { id: "bitcoin", label: "Bitcoin" },
  { id: "notes", label: "Notes" },
  { id: "system", label: "System" },
  { id: "other", label: "Other" }
];

const adminRawState = {
  user: null,
  section: "all",
  search: "",
  offset: 0,
  limit: 150,
  total: 0,
  items: [],
  sectionCounts: {},
  loading: false
};

function adminRawStateHtml(kind = "empty", message = "No raw data available."){
  const icon = kind === "loading" ? "fa-spinner fa-spin" : kind === "error" ? "fa-triangle-exclamation" : "fa-database";
  const title = kind === "loading" ? "Loading raw data" : kind === "error" ? "Raw data unavailable" : "No raw data to display";
  return `<div class="admin-raw-empty-state ${escapeHtml(kind)}"><span class="admin-raw-empty-icon"><i class="fa-solid ${icon}"></i></span><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p></div></div>`;
}

function ensureAdminRawModal(){
  let modal = document.getElementById("adminRawDataModal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "adminRawDataModal";
  modal.className = "modal hide";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="modal-backdrop" data-admin-raw-close="1"></div>
    <div class="modal-dialog admin-modal-dialog admin-raw-dialog">
      <div class="modal-head">
        <div>
          <h3 id="adminRawTitle">Raw data</h3>
          <p id="adminRawSubtitle">Inspect and fix ledger rows for this account.</p>
        </div>
        <button type="button" class="btn ghost tiny" data-admin-raw-close="1" aria-label="Close">✕</button>
      </div>
      <div class="modal-body admin-raw-body">
        <div class="admin-raw-toolbar">
          <div class="admin-raw-filters" id="adminRawSectionFilters"></div>
          <div class="admin-raw-search-row">
            <input id="adminRawSearch" class="input" type="search" placeholder="Search name, notes, id…" />
            <button type="button" class="btn soft tiny" id="adminRawSearchBtn" title="Search"><i class="fa-solid fa-magnifying-glass"></i></button>
            <button type="button" class="btn ghost tiny" id="adminRawRefreshBtn" title="Refresh"><i class="fa-solid fa-rotate"></i></button>
          </div>
        </div>
        <div id="adminRawStats" class="admin-raw-stats"></div>
        <div id="adminRawTableWrap" class="admin-raw-table-wrap">
          ${adminRawStateHtml("empty", "Select an account to inspect its stored workspace rows.")}
        </div>
        <div class="admin-raw-pager">
          <button type="button" class="btn ghost tiny" id="adminRawPrevBtn"><i class="fa-solid fa-chevron-left"></i></button>
          <span id="adminRawPageLabel" class="admin-raw-page-label">—</span>
          <button type="button" class="btn ghost tiny" id="adminRawNextBtn"><i class="fa-solid fa-chevron-right"></i></button>
        </div>
      </div>
    </div>
    <div id="adminRawEditSheet" class="admin-raw-edit-sheet hide" aria-hidden="true">
      <div class="admin-raw-edit-card">
        <div class="admin-raw-edit-head">
          <h4>Edit entry</h4>
          <button type="button" class="btn ghost tiny" id="adminRawEditCloseBtn" aria-label="Close editor">✕</button>
        </div>
        <div id="adminRawEditForm" class="admin-raw-edit-form"></div>
        <div id="adminRawEditError" class="lock-error"></div>
        <div class="admin-raw-edit-actions">
          <button type="button" class="btn ghost tiny" id="adminRawEditCancelBtn">Cancel</button>
          <button type="button" class="btn primary tiny" id="adminRawEditSaveBtn">Save</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);

  modal.querySelectorAll("[data-admin-raw-close]").forEach(el => {
    el.addEventListener("click", () => closeAdminRawDataOverlay());
  });
  const runRawSearch = () => {
    const searchEl = modal.querySelector("#adminRawSearch");
    adminRawState.search = String(searchEl?.value || "").trim();
    adminRawState.offset = 0;
    loadAdminRawData();
  };
  modal.querySelector("#adminRawRefreshBtn")?.addEventListener("click", () => {
    const searchEl = modal.querySelector("#adminRawSearch");
    adminRawState.search = String(searchEl?.value || "").trim();
    loadAdminRawData();
  });
  modal.querySelector("#adminRawSearchBtn")?.addEventListener("click", runRawSearch);
  modal.querySelector("#adminRawSearch")?.addEventListener("keydown", e => {
    if (e.key === "Enter") runRawSearch();
  });
  modal.querySelector("#adminRawPrevBtn")?.addEventListener("click", () => {
    adminRawState.offset = Math.max(0, adminRawState.offset - adminRawState.limit);
    loadAdminRawData();
  });
  modal.querySelector("#adminRawNextBtn")?.addEventListener("click", () => {
    if (adminRawState.offset + adminRawState.limit >= adminRawState.total) return;
    adminRawState.offset += adminRawState.limit;
    loadAdminRawData();
  });
  modal.querySelector("#adminRawEditCloseBtn")?.addEventListener("click", closeAdminRawEditSheet);
  modal.querySelector("#adminRawEditCancelBtn")?.addEventListener("click", closeAdminRawEditSheet);
  modal.querySelector("#adminRawEditSaveBtn")?.addEventListener("click", saveAdminRawEdit);
  return modal;
}

function closeAdminRawDataOverlay(){
  const modal = document.getElementById("adminRawDataModal");
  if (!modal) return;
  closeAdminRawEditSheet();
  modal.classList.add("hide");
  modal.setAttribute("aria-hidden", "true");
}

function openAdminRawDataOverlay(user){
  if (!userHasPermission("admin_panel", "view")) {
    alert("Administrator access required.");
    return;
  }
  const modal = ensureAdminRawModal();
  adminRawState.user = user;
  adminRawState.section = "all";
  adminRawState.search = "";
  adminRawState.offset = 0;
  const title = modal.querySelector("#adminRawTitle");
  const subtitle = modal.querySelector("#adminRawSubtitle");
  const search = modal.querySelector("#adminRawSearch");
  if (title) title.textContent = `Raw data · ${user.display_name || user.username}`;
  if (subtitle) {
    subtitle.textContent = `@${user.username} — wallets, loans, inventory, installments, bitcoin, notes, and system rows. Edits apply only to this account.`;
  }
  if (search) search.value = "";
  renderAdminRawSectionFilters();
  modal.classList.remove("hide");
  modal.setAttribute("aria-hidden", "false");
  loadAdminRawData();
}

function renderAdminRawSectionFilters(){
  const wrap = document.getElementById("adminRawSectionFilters");
  if (!wrap) return;
  wrap.innerHTML = ADMIN_RAW_SECTIONS.map(sec => {
    const count = sec.id === "all"
      ? adminRawState.total
      : Number(adminRawState.sectionCounts?.[sec.id] || 0);
    const active = adminRawState.section === sec.id ? "active" : "";
    const countLabel = sec.id === "all" && !adminRawState.items.length && !adminRawState.total
      ? ""
      : ` (${sec.id === "all" ? (adminRawState.total || 0) : count})`;
    return `<button type="button" class="admin-raw-chip ${active}" data-raw-section="${escapeHtml(sec.id)}">${escapeHtml(sec.label)}${escapeHtml(countLabel)}</button>`;
  }).join("");
  wrap.querySelectorAll("[data-raw-section]").forEach(btn => {
    btn.addEventListener("click", () => {
      adminRawState.section = btn.dataset.rawSection || "all";
      adminRawState.offset = 0;
      renderAdminRawSectionFilters();
      loadAdminRawData();
    });
  });
}

async function loadAdminRawData(){
  const wrap = document.getElementById("adminRawTableWrap");
  const stats = document.getElementById("adminRawStats");
  const pageLabel = document.getElementById("adminRawPageLabel");
  const prevBtn = document.getElementById("adminRawPrevBtn");
  const nextBtn = document.getElementById("adminRawNextBtn");
  if (!wrap || !adminRawState.user?.id) return;
  if (adminRawState.loading) return;
  adminRawState.loading = true;
  wrap.innerHTML = adminRawStateHtml("loading", "Fetching this account’s ledger and domain records…");
  try {
    const searchEl = document.getElementById("adminRawSearch");
    if (searchEl) adminRawState.search = searchEl.value.trim();
    const result = await supabaseRpc("app_admin_list_user_ledger", {
      p_user_id: adminRawState.user.id,
      p_section: adminRawState.section === "all" ? null : adminRawState.section,
      p_search: adminRawState.search || null,
      p_limit: adminRawState.limit,
      p_offset: adminRawState.offset
    });
    adminRawState.items = Array.isArray(result?.items) ? result.items : [];
    adminRawState.total = Number(result?.total || 0);
    adminRawState.sectionCounts = result?.section_counts && typeof result.section_counts === "object"
      ? result.section_counts
      : {};
    renderAdminRawSectionFilters();
    if (stats) {
      const parts = Object.entries(adminRawState.sectionCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k}: ${v}`);
      const domainHint = Number(result?.domain_row_count || 0) > 0
        ? ` · ${result.domain_row_count} domain-table row(s)`
        : "";
      const ledgerLeft = (adminRawState.items || []).some(r => !r.source || r.source === "loan_ledger_entries");
      stats.textContent = parts.length
        ? `Totals — ${parts.join(" · ")}${domainHint}${ledgerLeft ? " · leftover ledger rows may still use meta-tags" : ""}`
        : "No ledger/domain rows for this user yet.";
    }
    renderAdminRawTable(wrap, adminRawState.items);
    const from = adminRawState.total ? adminRawState.offset + 1 : 0;
    const to = Math.min(adminRawState.offset + adminRawState.limit, adminRawState.total);
    if (pageLabel) pageLabel.textContent = `${from}–${to} of ${adminRawState.total}`;
    if (prevBtn) prevBtn.disabled = adminRawState.offset <= 0;
    if (nextBtn) nextBtn.disabled = adminRawState.offset + adminRawState.limit >= adminRawState.total;
  } catch (err) {
    wrap.innerHTML = adminRawStateHtml("error", err.message || "Could not load raw data.");
  } finally {
    adminRawState.loading = false;
  }
}

function renderAdminRawTable(wrap, items){
  if (!items.length) {
    wrap.innerHTML = adminRawStateHtml("empty", "No records match the selected section or search.");
    return;
  }
  wrap.innerHTML = `
    <table class="admin-raw-table">
      <thead>
        <tr>
          <th>Section</th>
          <th>Source</th>
          <th>Kind</th>
          <th>Name</th>
          <th>Currency</th>
          <th>Amount</th>
          <th>Dates</th>
          <th>Notes</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${items.map(row => {
          const amount = row.entry_kind === "principal"
            ? row.principal_amount
            : row.action_amount;
          const dates = row.entry_kind === "principal"
            ? (row.loan_date || "—")
            : `${row.loan_date || "—"} / ${row.action_date || "—"}`;
          const notes = String(row.notes || "");
          const notesShort = notes.length > 90 ? `${notes.slice(0, 90)}…` : notes;
          const source = row.source || "loan_ledger_entries";
          const isLedger = source === "loan_ledger_entries" || source === "ledger";
          return `
            <tr class="${row.is_deleted ? "is-deleted" : ""}" data-raw-id="${escapeHtml(row.id)}" data-raw-source="${escapeHtml(source)}">
              <td data-label="Section"><span class="admin-raw-section-pill">${escapeHtml(row.section || "other")}</span></td>
              <td data-label="Source"><span class="admin-raw-source-pill ${isLedger ? "is-ledger" : ""}" title="${isLedger ? "Legacy meta-tag ledger row" : "Domain table row"}">${escapeHtml(isLedger ? "ledger" : source)}</span></td>
              <td data-label="Kind">${escapeHtml(row.direction)} · ${escapeHtml(row.entry_kind)}</td>
              <td data-label="Name" title="${escapeHtml(row.person_name || "")}">${escapeHtml(row.person_name || "—")}</td>
              <td data-label="Currency">${escapeHtml(row.currency || "—")}</td>
              <td data-label="Amount" class="mono">${escapeHtml(amount == null ? "—" : String(amount))}</td>
              <td data-label="Dates" class="mono">${escapeHtml(dates)}</td>
              <td data-label="Notes" class="admin-raw-notes" title="${escapeHtml(notes)}">${escapeHtml(notesShort || "—")}</td>
              <td data-label="Actions" class="admin-raw-row-actions">
                <button type="button" class="btn ghost tiny" data-raw-edit="${escapeHtml(row.id)}" title="${isLedger ? "Edit ledger row" : "Edit domain row"}">Edit</button>
                <button type="button" class="btn ghost tiny danger-text" data-raw-soft-delete="${escapeHtml(row.id)}">Delete</button>
                <button type="button" class="btn ghost tiny danger-text" data-raw-hard-delete="${escapeHtml(row.id)}" title="Permanently remove">Hard</button>
              </td>
            </tr>`;
        }).join("")}
      </tbody>
    </table>`;

  wrap.querySelectorAll("[data-raw-edit]").forEach(btn => {
    btn.addEventListener("click", () => {
      const row = adminRawState.items.find(r => r.id === btn.dataset.rawEdit);
      if (row) openAdminRawEditSheet(row);
    });
  });
  wrap.querySelectorAll("[data-raw-soft-delete]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const row = adminRawState.items.find(r => r.id === btn.dataset.rawSoftDelete);
      const isLedger = !row?.source || row.source === "loan_ledger_entries" || row.source === "ledger";
      const softDeleteMessage = isLedger
        ? "Mark this entry as deleted ([DELETED])? It can still be edited later."
        : "Soft-delete this domain row (is_deleted = true)?";
      if (!(await appConfirmDelete(softDeleteMessage, {
        title: "Delete raw data entry?",
        confirmLabel: "Delete entry",
        note: "This is a soft deletion where supported, so the record can remain recoverable or editable according to its source."
      }))) return;
      try {
        await supabaseRpc("app_admin_delete_ledger_entry", {
          p_entry_id: btn.dataset.rawSoftDelete,
          p_hard_delete: false
        });
        await loadAdminRawData();
      } catch (err) {
        alert(err.message || "Delete failed.");
      }
    });
  });
  wrap.querySelectorAll("[data-raw-hard-delete]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!(await appConfirmDelete("Permanently delete this row from the database? This cannot be undone.", { title: "Delete database row permanently?", confirmLabel: "Delete permanently", note: "This raw database deletion cannot be undone." }))) return;
      try {
        await supabaseRpc("app_admin_delete_ledger_entry", {
          p_entry_id: btn.dataset.rawHardDelete,
          p_hard_delete: true
        });
        await loadAdminRawData();
      } catch (err) {
        alert(err.message || "Hard delete failed.");
      }
    });
  });
}

function closeAdminRawEditSheet(){
  const sheet = document.getElementById("adminRawEditSheet");
  if (!sheet) return;
  sheet.classList.add("hide");
  sheet.setAttribute("aria-hidden", "true");
  sheet.dataset.entryId = "";
  sheet.dataset.entrySource = "";
}

function openAdminRawEditSheet(row){
  const sheet = document.getElementById("adminRawEditSheet");
  const form = document.getElementById("adminRawEditForm");
  const err = document.getElementById("adminRawEditError");
  if (!sheet || !form) return;
  if (err) {
    err.textContent = "";
    err.classList.remove("show");
  }
  sheet.dataset.entryId = row.id;
  sheet.dataset.entrySource = row.source || "loan_ledger_entries";
  const isPrincipal = row.entry_kind === "principal";
  const sourceLabel = row.source && row.source !== "loan_ledger_entries" && row.source !== "ledger"
    ? row.source
    : "ledger";
  form.innerHTML = `
    <p class="help mono">ID ${escapeHtml(row.id)} · Group ${escapeHtml(row.group_id)} · Source ${escapeHtml(sourceLabel)} · Section ${escapeHtml(row.section || "")}</p>
    <div class="admin-raw-edit-grid">
      <div class="form-group">
        <label class="form-label">Direction</label>
        <select id="rawEditDirection" class="input">
          ${["given", "taken", "goods"].map(v => `<option value="${v}" ${row.direction === v ? "selected" : ""}>${v}</option>`).join("")}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Entry kind</label>
        <select id="rawEditKind" class="input">
          ${["principal", "partial", "full"].map(v => `<option value="${v}" ${row.entry_kind === v ? "selected" : ""}>${v}</option>`).join("")}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Person / wallet / item name</label>
        <input id="rawEditPerson" class="input" value="${escapeHtml(row.person_name || "")}" />
      </div>
      <div class="form-group">
        <label class="form-label">Currency</label>
        <select id="rawEditCurrency" class="input">
          ${SUPPORTED_CURRENCIES.map(v => `<option value="${v}" ${row.currency === v ? "selected" : ""}>${v}</option>`).join("")}
          ${row.currency && !SUPPORTED_CURRENCIES.includes(row.currency)
            ? `<option value="${escapeHtml(row.currency)}" selected>${escapeHtml(row.currency)}</option>`
            : ""}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Group ID</label>
        <input id="rawEditGroupId" class="input mono" value="${escapeHtml(row.group_id || "")}" />
      </div>
      <div class="form-group">
        <label class="form-label">Loan / open date</label>
        <input id="rawEditLoanDate" class="input" type="date" value="${escapeHtml(String(row.loan_date || "").slice(0, 10))}" />
      </div>
      <div class="form-group">
        <label class="form-label">Principal amount</label>
        <input id="rawEditPrincipal" class="input" type="number" step="any" value="${isPrincipal && row.principal_amount != null ? escapeHtml(String(row.principal_amount)) : ""}" ${isPrincipal ? "" : "disabled"} />
      </div>
      <div class="form-group">
        <label class="form-label">Action amount</label>
        <input id="rawEditAction" class="input" type="number" step="any" value="${!isPrincipal && row.action_amount != null ? escapeHtml(String(row.action_amount)) : ""}" ${isPrincipal ? "disabled" : ""} />
      </div>
      <div class="form-group">
        <label class="form-label">Action date</label>
        <input id="rawEditActionDate" class="input" type="date" value="${escapeHtml(String(row.action_date || "").slice(0, 10))}" ${isPrincipal ? "disabled" : ""} />
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Notes / tags</label>
      <textarea id="rawEditNotes" class="input admin-raw-notes-input" rows="6">${escapeHtml(row.notes || "")}</textarea>
      <p class="help">Keep tags like [EXPENSE_ACCOUNT], [GOODS], [INSTALLMENT], [DELETED] intact unless you intend to change them.</p>
    </div>`;

  const kindSelect = form.querySelector("#rawEditKind");
  const syncKindFields = () => {
    const principal = kindSelect.value === "principal";
    form.querySelector("#rawEditPrincipal").disabled = !principal;
    form.querySelector("#rawEditAction").disabled = principal;
    form.querySelector("#rawEditActionDate").disabled = principal;
  };
  kindSelect?.addEventListener("change", syncKindFields);

  sheet.classList.remove("hide");
  sheet.setAttribute("aria-hidden", "false");
}

async function saveAdminRawEdit(){
  const sheet = document.getElementById("adminRawEditSheet");
  const err = document.getElementById("adminRawEditError");
  const entryId = sheet?.dataset.entryId;
  if (!entryId) return;
  if (err) {
    err.textContent = "";
    err.classList.remove("show");
  }
  try {
    const kind = document.getElementById("rawEditKind")?.value || "principal";
    const notesVal = document.getElementById("rawEditNotes")?.value ?? "";
    const groupRaw = String(document.getElementById("rawEditGroupId")?.value || "").trim();
    const payload = {
      p_entry_id: entryId,
      p_direction: document.getElementById("rawEditDirection")?.value || null,
      p_entry_kind: kind,
      p_person_name: document.getElementById("rawEditPerson")?.value || null,
      p_currency: document.getElementById("rawEditCurrency")?.value || null,
      p_loan_date: document.getElementById("rawEditLoanDate")?.value || null,
      p_notes: notesVal,
      p_clear_notes: false
    };
    if (groupRaw) payload.p_group_id = groupRaw;
    if (kind === "principal") {
      const p = document.getElementById("rawEditPrincipal")?.value;
      payload.p_principal_amount = p === "" || p == null ? null : Number(p);
      payload.p_clear_action = true;
      payload.p_clear_action_date = true;
    } else {
      const a = document.getElementById("rawEditAction")?.value;
      payload.p_action_amount = a === "" || a == null ? null : Number(a);
      payload.p_action_date = document.getElementById("rawEditActionDate")?.value || null;
      payload.p_clear_principal = true;
    }
    await supabaseRpc("app_admin_update_ledger_entry", payload);
    closeAdminRawEditSheet();
    await loadAdminRawData();
  } catch (ex) {
    if (err) {
      err.textContent = ex.message || "Could not save entry.";
      err.classList.add("show");
    } else {
      alert(ex.message || "Could not save entry.");
    }
  }
}

function passwordEyeButtonHtml({ toggleAttr, toggleValue, disabled = false, extraClass = "" } = {}){
  const disabledAttr = disabled ? "disabled" : "";
  return `<button type="button" class="pw-eye-btn ${extraClass}" ${toggleAttr}="${escapeHtml(toggleValue || "")}" ${disabledAttr} aria-label="Show password" title="Show password"><i class="fa-solid fa-eye" aria-hidden="true"></i></button>`;
}

function setPasswordEyeState(btn, visible){
  if (!btn) return;
  btn.classList.toggle("is-visible", !!visible);
  btn.setAttribute("aria-label", visible ? "Hide password" : "Show password");
  btn.setAttribute("title", visible ? "Hide password" : "Show password");
  const icon = btn.querySelector("i");
  if (icon) {
    icon.className = visible ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
  }
}

function bindAdminFormPasswordToggle(root){
  if (!root) return;
  root.querySelectorAll("[data-toggle-form-pw]").forEach(btn => {
    btn.onclick = () => {
      const el = root.querySelector(`#${btn.getAttribute("data-toggle-form-pw")}`)
        || document.getElementById(btn.getAttribute("data-toggle-form-pw"));
      if (!el) return;
      const show = el.type === "password";
      el.type = show ? "text" : "password";
      setPasswordEyeState(btn, show);
    };
  });
}

function buildAdminUserFormFields(prefix, user = null){
  const currencies = user ? userAllowedCurrencies(user) : ["AED"];
  const tabs = user ? userAllowedTabs(user) : ["dashboard", "expenses", "loans", "notes"];
  const disabledTabs = user?.is_protected ? ["admin_panel"] : [];
  const company = user?.company_name || user?.settings?.Company || "";
  const vat = user?.vat_number || user?.settings?.TRN || "";
  const logo = user?.logo_url || user?.settings?.logo || "";
  const email = user?.company_email || user?.settings?.email || user?.settings?.Email || "";
  const phone = user?.company_phone || user?.settings?.Mobile || user?.settings?.Phone || "";
  const address = user?.company_address || user?.settings?.Address || user?.settings?.address || "";
  const accessPlan = String(user?.access_plan || "full").toLowerCase() === "trial" ? "trial" : "full";
  const planDisabled = user?.is_protected ? "disabled" : "";
  return `
    <div class="admin-form-grid">
      <div class="form-group">
        <label class="form-label">Username</label>
        <input id="${prefix}Username" class="input" autocomplete="off" value="${escapeHtml(user?.username || "")}" ${user?.is_protected ? "readonly" : ""} />
      </div>
      <div class="form-group">
        <label class="form-label">Display name</label>
        <input id="${prefix}DisplayName" class="input" autocomplete="off" value="${escapeHtml(user?.display_name || "")}" />
      </div>
      ${!user ? `<div class="form-group">
        <label class="form-label">Initial password</label>
        <div class="admin-password-row">
          <input id="${prefix}Password" class="input" type="password" autocomplete="new-password" value="" placeholder="8+ chars, upper, lower, number" />
          <button type="button" class="pw-eye-btn" data-toggle-form-pw="${prefix}Password" aria-label="Show password" title="Show password"><i class="fa-solid fa-eye" aria-hidden="true"></i></button>
        </div>
        <p class="help">Used only to create the account. Triplem VIP stores the authentication credential as a one-way hash; it cannot be viewed later.</p>
      </div>` : ""}
      <div class="form-group">
        <label class="form-label">Role</label>
        <select id="${prefix}Role" class="input" ${user?.is_protected ? "disabled" : ""}>
          <option value="user" ${(user?.role || "user") === "user" ? "selected" : ""}>User</option>
          <option value="admin" ${user?.role === "admin" ? "selected" : ""}>Admin</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Access plan</label>
        <select id="${prefix}AccessPlan" class="input" ${planDisabled}>
          <option value="full" ${accessPlan === "full" ? "selected" : ""}>Full / Pro</option>
          <option value="trial" ${accessPlan === "trial" ? "selected" : ""}>Timed / trial</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Access period</label>
        <select id="${prefix}AccessPeriod" class="input" ${planDisabled} data-access-period-select>
          <option value="week">1 week</option>
          <option value="month">1 month</option>
          <option value="year">1 year</option>
          <option value="custom" selected>Custom days</option>
          <option value="date">Until date</option>
          ${user && accessPlan === "full" && !user.trial_expires_at ? `<option value="unlimited">Unlimited</option>` : ""}
          ${!user ? `<option value="unlimited">Unlimited (full only)</option>` : ""}
        </select>
      </div>
      <div class="form-group" data-access-days-wrap>
        <label class="form-label">Days</label>
        <input id="${prefix}AccessDays" class="input" type="number" min="1" max="3650" value="${escapeHtml(String((() => {
          if (!user?.trial_expires_at) return 14;
          const left = Math.ceil((new Date(user.trial_expires_at).getTime() - Date.now()) / 86400000);
          return Math.max(1, left > 0 ? left : 14);
        })()))}" ${planDisabled} />
      </div>
      <div class="form-group hide" data-access-until-wrap>
        <label class="form-label">Until date</label>
        <input id="${prefix}AccessUntil" class="input" type="date" min="${escapeHtml(minExtendDateValue())}" value="${escapeHtml(user?.trial_expires_at ? toInputDateValue(user.trial_expires_at) : minExtendDateValue())}" ${planDisabled} />
      </div>
      ${user && !user.is_protected ? `
      <div class="form-group" style="grid-column:1/-1">
        <label class="admin-inline-check">
          <input id="${prefix}ApplyPeriod" type="checkbox" />
          Apply access period on save
        </label>
        <p class="help" style="margin:4px 0 0">Current expiry: ${escapeHtml(formatTrialExpiry(user.trial_expires_at))}</p>
      </div>` : ""}
    </div>

    <div class="admin-branding-block">
      <h4 class="admin-section-title">Company account branding</h4>
      <p class="help">Shown in the app header and on all PDFs for this login. Edit anytime for existing accounts.</p>
      <div class="admin-form-grid">
        <div class="form-group">
          <label class="form-label">Company name</label>
          <input id="${prefix}Company" class="input" value="${escapeHtml(company)}" placeholder="Company / business name" />
        </div>
        <div class="form-group">
          <label class="form-label">VAT / TRN number</label>
          <input id="${prefix}Vat" class="input" value="${escapeHtml(vat)}" placeholder="Tax registration number" />
        </div>
        <div class="form-group">
          <label class="form-label">Company email</label>
          <input id="${prefix}Email" class="input" type="email" value="${escapeHtml(email)}" placeholder="accounts@company.com" autocomplete="off" />
        </div>
        <div class="form-group">
          <label class="form-label">Contact number</label>
          <input id="${prefix}Phone" class="input" type="tel" value="${escapeHtml(phone)}" placeholder="+971 50 000 0000" autocomplete="off" />
        </div>
      </div>
      <div class="form-group" style="margin-top:10px">
        <label class="form-label">Company address</label>
        <textarea id="${prefix}Address" class="input admin-address-input" rows="2" placeholder="Street, city, country">${escapeHtml(address)}</textarea>
      </div>
      <div class="form-group" style="margin-top:10px">
        <label class="form-label">Company logo (PNG / JPG)</label>
        <div class="admin-logo-row">
          <input id="${prefix}LogoFile" class="input" type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif" />
          <input id="${prefix}LogoUrl" class="input" type="hidden" value="${escapeHtml(logo)}" />
        </div>
        <div class="admin-logo-preview-wrap">
          <img id="${prefix}LogoPreview" class="admin-logo-preview ${logo ? "" : "hide"}" src="${escapeHtml(logo || "")}" alt="Logo preview" />
          <span id="${prefix}LogoStatus" class="help">${logo ? "Current logo loaded — PDFs keep natural proportions" : "No logo uploaded yet — default Triplem VIP logo will be used"}</span>
        </div>
      </div>
    </div>

    <div class="form-group" style="margin-top:12px">
      <label class="form-label">Allowed currencies</label>
      <p class="help">Only selected currencies will be available in this user’s workspace.</p>
      ${checkboxGridHtml(`${prefix}Currencies`, ADMIN_CURRENCY_OPTIONS, currencies)}
    </div>
    ${bitcoinAccessSelectHtml(prefix, deriveBitcoinAccessMode(currencies, tabs))}
    <div class="form-group" style="margin-top:12px">
      <label class="form-label">Allowed tabs / modules</label>
      <p class="help">Only checked tabs will appear for this user after login. Bitcoin tab follows the Bitcoin access setting above.</p>
      ${checkboxGridHtml(`${prefix}Tabs`, ADMIN_TAB_OPTIONS, tabs, { disabledIds: disabledTabs })}
    </div>
    <label class="admin-inline-check">
      <input id="${prefix}MustChange" type="checkbox" ${user?.must_change_password ? "checked" : ""} />
      Require password change on next login
    </label>
    ${!user?.is_protected ? `
    <label class="admin-inline-check">
      <input id="${prefix}AllowTeam" type="checkbox" ${user?.allow_team_members ? "checked" : ""} ${user?.team_owner_id ? "disabled" : ""} />
      Allow multiple users on this company account
    </label>
    <p class="help">Company owner can invite sub-users who share the same data, with edit/delete permissions and an activity log.</p>
    <div class="admin-team-limit-block ${user?.allow_team_members ? "" : "hide"}" id="${prefix}TeamLimitBlock">
      <label class="form-label">Max team members</label>
      <div class="admin-team-limit-row">
        <div class="admin-team-limit-presets" role="group" aria-label="Max team members preset">
          <button type="button" class="admin-team-limit-chip" data-limit-preset="1">1</button>
          <button type="button" class="admin-team-limit-chip" data-limit-preset="2">2</button>
          <button type="button" class="admin-team-limit-chip" data-limit-preset="3">3</button>
          <button type="button" class="admin-team-limit-chip" data-limit-preset="custom">Custom</button>
        </div>
        <input id="${prefix}MaxTeamMembers" class="input admin-team-limit-input" type="number" min="1" max="50" value="${escapeHtml(String(Math.max(1, Math.min(50, Number(user?.max_team_members) || 3))))}" />
      </div>
      <p class="help">Seats for sub-users sharing this company account (1–50).</p>
    </div>` : ""}
    ${user && !user.is_protected ? `
    <label class="admin-inline-check">
      <input id="${prefix}Active" type="checkbox" ${user.is_active !== false ? "checked" : ""} />
      Account is active (can sign in)
    </label>` : ""}
  `;
}

async function uploadCompanyLogoToStorage(userId, file){
  if (!file) return "";
  if (!String(file.type || "").startsWith("image/")) {
    throw new Error("Logo must be an image file (PNG or JPG).");
  }
  const uploadFile = (typeof fileOrCompressedForUpload === "function")
    ? await fileOrCompressedForUpload(file, { maxEdge: 640, quality: 0.84, preferJpeg: true })
    : file;
  if ((uploadFile.size || file.size) > 2 * 1024 * 1024) {
    throw new Error("Logo must be 2MB or smaller after compression.");
  }
  const dbConfig = getSupabaseConfig();
  const name = uploadFile.name || file.name || "logo.jpg";
  const ext = (name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${userId}/logo-${Date.now()}.${ext}`;
  const uploadUrl = `${dbConfig.supabaseUrl}/storage/v1/object/company-logos/${path}`;
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      apikey: dbConfig.supabaseKey,
      Authorization: `Bearer ${dbConfig.supabaseKey}`,
      "Content-Type": uploadFile.type || file.type || "image/jpeg",
      "x-upsert": "true"
    },
    body: uploadFile
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Logo upload failed (${res.status})`);
  }
  return `${dbConfig.supabaseUrl}/storage/v1/object/public/company-logos/${path}`;
}

function bindAccessPeriodFields(root){
  const scope = root || document;
  scope.querySelectorAll("[data-access-period-select]").forEach(sel => {
    const form = sel.closest(".admin-form-grid") || sel.parentElement?.parentElement || scope;
    const sync = () => {
      const p = sel.value;
      form.querySelectorAll("[data-access-days-wrap]").forEach(el => el.classList.toggle("hide", p === "date" || p === "unlimited"));
      form.querySelectorAll("[data-access-until-wrap]").forEach(el => el.classList.toggle("hide", p !== "date"));
    };
    sel.addEventListener("change", sync);
    sync();
  });
}

function bindAdminTeamLimitControl(root, prefix){
  const scope = root || document;
  const allowEl = scope.querySelector(`#${prefix}AllowTeam`);
  const block = scope.querySelector(`#${prefix}TeamLimitBlock`);
  const input = scope.querySelector(`#${prefix}MaxTeamMembers`);
  if (!allowEl || !block || !input) return;
  const chips = Array.from(block.querySelectorAll("[data-limit-preset]"));
  const syncActiveChip = () => {
    const val = String(Math.max(1, Math.min(50, parseInt(input.value, 10) || 3)));
    chips.forEach(chip => {
      const preset = chip.dataset.limitPreset;
      const active = preset === "custom" ? !["1", "2", "3"].includes(val) : preset === val;
      chip.classList.toggle("is-active", active);
    });
  };
  chips.forEach(chip => {
    chip.onclick = () => {
      const preset = chip.dataset.limitPreset;
      if (preset === "custom") {
        input.focus();
        input.select();
      } else {
        input.value = preset;
      }
      syncActiveChip();
    };
  });
  input.oninput = syncActiveChip;
  const syncVisibility = () => block.classList.toggle("hide", !allowEl.checked);
  allowEl.addEventListener("change", syncVisibility);
  syncVisibility();
  syncActiveChip();
}

function readAccessPeriodPayload(prefix){
  const period = document.getElementById(`${prefix}AccessPeriod`)?.value || "custom";
  const daysRaw = document.getElementById(`${prefix}AccessDays`)?.value;
  const untilDate = document.getElementById(`${prefix}AccessUntil`)?.value || null;
  const accessPlan = document.getElementById(`${prefix}AccessPlan`)?.value || "full";
  return { period, daysRaw, untilDate, accessPlan };
}

async function applyAdminAccessPeriod(userId, { period, daysRaw, untilDate, accessPlan }){
  if (period === "unlimited") {
    if (accessPlan !== "full") throw new Error("Unlimited access requires Full / Pro plan.");
    await supabaseRpc("app_admin_grant_full_access", { p_user_id: userId });
    return;
  }
  if (period === "date") {
    if (!untilDate) throw new Error("Choose an until date.");
    await supabaseRpc("app_admin_set_access_period", {
      p_user_id: userId,
      p_access_plan: accessPlan,
      p_period: "date",
      p_until_date: untilDate,
      p_days: null
    });
    return;
  }
  const days = accessPeriodDaysFromUi(period, daysRaw);
  await supabaseRpc("app_admin_set_access_period", {
    p_user_id: userId,
    p_days: period === "custom" ? days : null,
    p_access_plan: accessPlan,
    p_period: period === "custom" ? "custom" : period,
    p_until_date: null
  });
}

function bindAdminLogoPicker(prefix, existingUserId = null){
  const fileInput = document.getElementById(`${prefix}LogoFile`);
  const urlInput = document.getElementById(`${prefix}LogoUrl`);
  const preview = document.getElementById(`${prefix}LogoPreview`);
  const status = document.getElementById(`${prefix}LogoStatus`);
  if (!fileInput || !urlInput) return;
  fileInput.onchange = async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    try {
      if (status) status.textContent = "Uploading logo…";
      // For create flow we may not have user id yet — use temp folder then re-key on save is complex.
      // Upload under pending/<timestamp> for create, or userId for edit.
      const folderId = existingUserId || `pending-${crypto.randomUUID()}`;
      const publicUrl = await uploadCompanyLogoToStorage(folderId, file);
      urlInput.value = publicUrl;
      if (preview) {
        preview.src = publicUrl;
        preview.classList.remove("hide");
      }
      if (status) status.textContent = "Logo uploaded. It will be saved with this account.";
    } catch (err) {
      if (status) status.textContent = err.message || "Logo upload failed.";
      alert(err.message || "Logo upload failed.");
    }
  };
}

function openAdminCreateUserModal(){
  let modal = document.getElementById("adminCreateUserModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "adminCreateUserModal";
    modal.className = "modal hide";
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div class="modal-backdrop" data-admin-modal-close="adminCreateUserModal"></div>
    <div class="modal-dialog admin-modal-dialog settings-sheet admin-settings-sheet">
      <div class="settings-sheet-head">
        <div>
          <h3>Create user</h3>
          <p>Credentials, access period, branding</p>
        </div>
        <button type="button" class="btn ghost tiny" data-admin-modal-close="adminCreateUserModal" aria-label="Close">✕</button>
      </div>
      <div class="modal-body settings-sheet-body">
        <div id="adminCreateFormBody"></div>
        <div id="adminCreateError" class="lock-error"></div>
        <div class="modal-footer settings-sheet-footer">
          <button type="button" class="btn ghost tiny" id="adminCreateCancel">Cancel</button>
          <button type="button" class="btn primary tiny" id="adminCreateSave">Create</button>
        </div>
      </div>
    </div>`;
  const body = modal.querySelector("#adminCreateFormBody");
  body.innerHTML = buildAdminUserFormFields("adminNew");
  bindAdminLogoPicker("adminNew", null);
  bindAdminFormPasswordToggle(modal);
  bindAccessPeriodFields(modal);
  bindAdminTeamLimitControl(modal, "adminNew");
  bindBitcoinAccessControls(body, "adminNew");
  const err = modal.querySelector("#adminCreateError");
  err.textContent = "";
  err.classList.remove("show");
  modal.classList.remove("hide");
  modal.setAttribute("aria-hidden", "false");
  modal.querySelectorAll("[data-admin-modal-close]").forEach(el => {
    el.onclick = () => {
      modal.classList.add("hide");
      modal.setAttribute("aria-hidden", "true");
    };
  });
  modal.querySelector("#adminCreateCancel").onclick = () => {
    modal.classList.add("hide");
    modal.setAttribute("aria-hidden", "true");
  };
  modal.querySelector("#adminCreateSave").onclick = async () => {
    err.textContent = "";
    err.classList.remove("show");
    try {
      const username = modal.querySelector("#adminNewUsername").value.trim();
      const password = modal.querySelector("#adminNewPassword").value;
      const accessBits = readCurrenciesAndTabsWithBitcoinAccess(body, "adminNew");
      const currencies = accessBits.currencies;
      const tabs = accessBits.tabs;
      if (!currencies.length) throw new Error("Select at least one currency.");
      if (!tabs.length) throw new Error("Select at least one tab.");
      const accessPlan = modal.querySelector("#adminNewAccessPlan")?.value || "full";
      const periodPayload = readAccessPeriodPayload("adminNew");
      if (accessPlan === "trial" && modal.querySelector("#adminNewRole").value === "admin") {
        throw new Error("Trial accounts cannot be admins.");
      }
      if (accessPlan === "trial" && periodPayload.period === "unlimited") {
        throw new Error("Trial access requires a period (week, month, year, days, or until date).");
      }
      assertPasswordPolicy(password);
      const created = await supabaseRpc("app_admin_create_user", {
        p_username: username,
        p_password: password,
        p_display_name: modal.querySelector("#adminNewDisplayName").value.trim(),
        p_role: accessPlan === "trial" ? "user" : modal.querySelector("#adminNewRole").value,
        p_must_change_password: modal.querySelector("#adminNewMustChange").checked,
        p_settings: {
          Company: "",
          TRN: "",
          logo: "",
          BitcoinAccess: accessBits.mode || "none"
        },
        p_currencies: currencies,
        p_tabs: accessPlan === "trial" ? tabs.filter(t => t !== "admin_panel") : tabs,
        p_company_name: modal.querySelector("#adminNewCompany").value.trim(),
        p_vat_number: modal.querySelector("#adminNewVat").value.trim(),
        p_logo_url: modal.querySelector("#adminNewLogoUrl").value.trim(),
        p_company_email: modal.querySelector("#adminNewEmail").value.trim(),
        p_company_phone: modal.querySelector("#adminNewPhone").value.trim(),
        p_company_address: modal.querySelector("#adminNewAddress").value.trim(),
        p_allow_team_members: !!modal.querySelector("#adminNewAllowTeam")?.checked,
        p_max_team_members: Math.max(1, Math.min(50, parseInt(modal.querySelector("#adminNewMaxTeamMembers")?.value, 10) || 3))
      });
      if (created?.id) {
        await applyAdminAccessPeriod(created.id, periodPayload);
      }

      modal.classList.add("hide");
      modal.setAttribute("aria-hidden", "true");
      await loadAdminUsers();
    } catch (ex) {
      err.textContent = ex.message || "Could not create user.";
      err.classList.add("show");
    }
  };
}

function openAdminEditUserModal(user){
  let modal = document.getElementById("adminEditUserModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "adminEditUserModal";
    modal.className = "modal hide";
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div class="modal-backdrop" data-admin-modal-close="adminEditUserModal"></div>
    <div class="modal-dialog admin-modal-dialog settings-sheet admin-settings-sheet">
      <div class="settings-sheet-head">
        <div>
          <h3 id="adminEditTitle">Edit access</h3>
          <p>Access, branding, permissions and plan controls</p>
        </div>
        <button type="button" class="btn ghost tiny" data-admin-modal-close="adminEditUserModal" aria-label="Close">✕</button>
      </div>
      <div class="modal-body settings-sheet-body">
        <div id="adminEditFormBody"></div>
        <div id="adminEditError" class="lock-error"></div>
        <div class="modal-footer settings-sheet-footer">
          <button type="button" class="btn ghost tiny" id="adminEditCancel">Cancel</button>
          <button type="button" class="btn primary tiny" id="adminEditSave">Save</button>
        </div>
      </div>
    </div>`;
  modal.querySelector("#adminEditTitle").textContent = `Edit access — ${user.username}`;
  const body = modal.querySelector("#adminEditFormBody");
  body.innerHTML = buildAdminUserFormFields("adminEdit", user);
  bindAdminLogoPicker("adminEdit", user.id);
  bindAdminFormPasswordToggle(modal);
  bindAccessPeriodFields(modal);
  bindAdminTeamLimitControl(modal, "adminEdit");
  bindBitcoinAccessControls(body, "adminEdit");
  const err = modal.querySelector("#adminEditError");
  err.textContent = "";
  err.classList.remove("show");
  modal.classList.remove("hide");
  modal.setAttribute("aria-hidden", "false");

  // Refresh profile + branding from DB so edit form is always current
  (async () => {
    try {
      const fresh = await supabaseRpc("app_admin_get_user", { p_user_id: user.id });
      if (!fresh) return;
      const setVal = (id, value) => {
        const el = modal.querySelector(id);
        if (el) el.value = value || "";
      };
      setVal("#adminEditCompany", fresh.company_name || fresh.settings?.Company || "");
      setVal("#adminEditVat", fresh.vat_number || fresh.settings?.TRN || "");
      setVal("#adminEditEmail", fresh.company_email || fresh.settings?.email || fresh.settings?.Email || "");
      setVal("#adminEditPhone", fresh.company_phone || fresh.settings?.Mobile || fresh.settings?.Phone || "");
      setVal("#adminEditAddress", fresh.company_address || fresh.settings?.Address || fresh.settings?.address || "");
      const maxTeamEl = modal.querySelector("#adminEditMaxTeamMembers");
      if (maxTeamEl && fresh.max_team_members) {
        maxTeamEl.value = Math.max(1, Math.min(50, Number(fresh.max_team_members) || 3));
        maxTeamEl.dispatchEvent(new Event("input"));
      }
      const logoUrl = fresh.logo_url || fresh.settings?.logo || "";
      setVal("#adminEditLogoUrl", logoUrl);
      const preview = modal.querySelector("#adminEditLogoPreview");
      const status = modal.querySelector("#adminEditLogoStatus");
      if (preview) {
        preview.src = logoUrl || "";
        preview.classList.toggle("hide", !logoUrl);
      }
      if (status) {
        status.textContent = logoUrl
          ? "Current logo loaded — PDFs keep natural proportions"
          : "No logo uploaded yet — default Triplem VIP logo will be used";
      }
    } catch (fetchErr) {
      console.warn("Could not refresh user profile.", fetchErr);
    }
  })();

  modal.querySelectorAll("[data-admin-modal-close]").forEach(el => {
    el.onclick = () => {
      modal.classList.add("hide");
      modal.setAttribute("aria-hidden", "true");
    };
  });
  modal.querySelector("#adminEditCancel").onclick = () => {
    modal.classList.add("hide");
    modal.setAttribute("aria-hidden", "true");
  };
  modal.querySelector("#adminEditSave").onclick = async () => {
    err.textContent = "";
    err.classList.remove("show");
    try {
      const accessBits = readCurrenciesAndTabsWithBitcoinAccess(body, "adminEdit");
      const currencies = accessBits.currencies;
      const tabs = accessBits.tabs;
      if (!currencies.length) throw new Error("Select at least one currency.");
      if (!tabs.length) throw new Error("Select at least one tab.");
      const payload = {
        p_user_id: user.id,
        p_username: modal.querySelector("#adminEditUsername").value.trim(),
        p_display_name: modal.querySelector("#adminEditDisplayName").value.trim(),
        p_role: modal.querySelector("#adminEditRole").value,
        p_must_change_password: modal.querySelector("#adminEditMustChange").checked,
        p_currencies: currencies,
        p_tabs: tabs,
        p_company_name: modal.querySelector("#adminEditCompany").value.trim(),
        p_vat_number: modal.querySelector("#adminEditVat").value.trim(),
        p_logo_url: modal.querySelector("#adminEditLogoUrl").value.trim(),
        p_company_email: modal.querySelector("#adminEditEmail").value.trim(),
        p_company_phone: modal.querySelector("#adminEditPhone").value.trim(),
        p_company_address: modal.querySelector("#adminEditAddress").value.trim(),
        p_access_plan: modal.querySelector("#adminEditAccessPlan")?.value || "full"
      };
      if (payload.p_access_plan === "trial") {
        payload.p_role = "user";
        payload.p_tabs = tabs.filter(t => t !== "admin_panel");
      }
      const activeEl = modal.querySelector("#adminEditActive");
      if (activeEl) payload.p_is_active = activeEl.checked;
      await supabaseRpc("app_admin_update_user_access", payload);

      const allowTeamEl = modal.querySelector("#adminEditAllowTeam");
      if (allowTeamEl && !allowTeamEl.disabled) {
        const maxTeamEl = modal.querySelector("#adminEditMaxTeamMembers");
        const nextMax = Math.max(1, Math.min(50, parseInt(maxTeamEl?.value, 10) || 3));
        const allowChanged = !!allowTeamEl.checked !== !!user.allow_team_members;
        const maxChanged = nextMax !== Math.max(1, Math.min(50, Number(user.max_team_members) || 3));
        if (allowChanged || maxChanged) {
          await supabaseRpc("app_admin_set_team_limits", {
            p_user_id: user.id,
            p_allow: allowTeamEl.checked,
            p_max_team_members: nextMax
          });
        }
      }

      const applyPeriod = modal.querySelector("#adminEditApplyPeriod")?.checked === true;
      if (!user.is_protected && applyPeriod) {
        await applyAdminAccessPeriod(user.id, readAccessPeriodPayload("adminEdit"));
      }

      modal.classList.add("hide");
      modal.setAttribute("aria-hidden", "true");
      await loadAdminUsers();
      if (state.sessionUser?.id === user.id) {
        try {
          const validated = await supabaseRpc("app_validate_session", {});
          if (validated?.user) {
            applyUserProfileToConfig(validated.user);
            state.trialLocked = getUserAccessFlags(validated.user).lock_active === true;
            if (state.trialLocked) {
              resetLazyDataState({ clearEntries: true });
              showTrialExpiredOverlay();
            } else {
              hideTrialExpiredOverlay();
            }
            updateLogosFromConfig();
            updateHeaderTextFromConfig();
            updateCurrencyFiltersFromConfig();
            updateGuestModeUi();
            applyPermissionGates();
          }
        } catch {}
      }
    } catch (ex) {
      err.textContent = ex.message || "Could not save changes.";
      err.classList.add("show");
    }
  };
}

function accountSettingsSnapshot(user = state.sessionUser || {}){
  const settings = user.settings && typeof user.settings === "object" ? user.settings : {};
  return {
    displayName: user.display_name || user.username || "",
    username: user.username || state.currentUsername || "",
    company: user.company_name || settings.Company || "",
    vat: user.vat_number || settings.TRN || "",
    logo: user.logo_url || settings.logo || "",
    email: user.company_email || settings.email || settings.Email || "",
    phone: user.company_phone || settings.Mobile || settings.Phone || settings.phone || "",
    address: user.company_address || settings.Address || settings.address || ""
  };
}

function accountSettingsSummaryValue(label, value, { wide = false } = {}){
  const clean = String(value || "").trim();
  return `<div class="account-summary-value${wide ? " is-wide" : ""}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(clean || "Not provided")}</strong></div>`;
}

async function syncAccountSettingsSession(updated = null){
  const profile = updated?.user || (updated?.username ? updated : null);
  if (profile) applyUserProfileToConfig(profile);
  try {
    const validated = await supabaseRpc("app_validate_session", {});
    if (validated?.user) applyUserProfileToConfig(validated.user);
  } catch (_) {}
  try { sessionStorage.setItem(SESSION_USERNAME_KEY, state.currentUsername || ""); } catch (_) {}
  try {
    const existingCred = await loadEncryptedSessionCredential();
    if (existingCred?.sessionToken && state.currentUsername) {
      await saveEncryptedSessionCredential({ username: state.currentUsername, sessionToken: existingCred.sessionToken || state.sessionToken }, { persist: true });
    }
  } catch (_) {}
  updateLogosFromConfig();
  updateHeaderTextFromConfig();
  updateUserIdentityUi();
  applyPermissionGates();
}

function ensureAccountSettingsChildModal(id){
  let modal = document.getElementById(id);
  if (!modal) {
    modal = document.createElement("div");
    modal.id = id;
    modal.className = "modal hide account-settings-child-modal";
    modal.setAttribute("aria-hidden", "true");
    document.body.appendChild(modal);
  }
  return modal;
}

function closeAccountSettingsChild(modal){
  if (!modal) return;
  modal.classList.add("hide");
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = "";
}

function openAccountProfileEditModal(parentModal){
  const user = state.sessionUser || {};
  const snap = accountSettingsSnapshot(user);
  const usernameLocked = !!user.is_protected;
  const modal = ensureAccountSettingsChildModal("accountProfileEditModal");
  modal.innerHTML = `
    <div class="modal-backdrop" data-account-child-close></div>
    <div class="modal-dialog settings-sheet account-settings-editor" role="dialog" aria-modal="true" aria-labelledby="accountProfileEditTitle">
      <div class="settings-sheet-head"><div><p class="account-settings-kicker">Profile</p><h3 id="accountProfileEditTitle">Edit profile</h3><p>Update the identity shown across your Triplem VIP workspace.</p></div><button type="button" class="btn ghost tiny" data-account-child-close aria-label="Close">✕</button></div>
      <div class="modal-body settings-sheet-body account-settings-editor-body">
        <label class="settings-field">Display name<input id="acctProfileDisplayName" class="input settings-input" autocomplete="name" value="${escapeHtml(snap.displayName)}" /></label>
        <label class="settings-field">Username<input id="acctProfileUsername" class="input settings-input" autocomplete="username" value="${escapeHtml(snap.username)}" ${usernameLocked ? "readonly" : ""} /></label>
        ${usernameLocked ? `<p class="settings-readonly-note"><i class="fa-solid fa-lock"></i> The protected Main Admin username is locked.</p>` : ""}
        <div id="acctProfileEditError" class="lock-error"></div>
        <div class="settings-sheet-footer"><button type="button" class="btn ghost" data-account-child-close>Cancel</button><button type="button" class="btn primary" id="acctProfileEditSave">Save profile</button></div>
      </div>
    </div>`;
  const close = () => closeAccountSettingsChild(modal);
  modal.querySelectorAll("[data-account-child-close]").forEach(el => el.onclick = close);
  modal.classList.remove("hide"); modal.setAttribute("aria-hidden", "false");
  setTimeout(() => modal.querySelector("#acctProfileDisplayName")?.focus(), 50);
  modal.querySelector("#acctProfileEditSave").onclick = async e => {
    const btn = e.currentTarget;
    const err = modal.querySelector("#acctProfileEditError");
    err.textContent = ""; err.classList.remove("show");
    try {
      const displayName = modal.querySelector("#acctProfileDisplayName").value.trim();
      const newUsername = modal.querySelector("#acctProfileUsername").value.trim();
      if (!displayName) throw new Error("Display name is required.");
      if (!usernameLocked && newUsername !== snap.username) {
        if (!/^[a-zA-Z0-9_-]+$/.test(newUsername)) throw new Error("Username may only contain letters, numbers, underscore, and hyphen.");
        if (newUsername.length < 3) throw new Error("Username must be at least 3 characters.");
      }
      btn.disabled = true;
      const payload = { p_display_name: displayName };
      if (!usernameLocked && newUsername && newUsername !== snap.username) payload.p_new_username = newUsername;
      const updated = await supabaseRpc("app_update_own_profile", payload);
      await syncAccountSettingsSession(updated);
      close();
      renderAccountSettingsSummary(parentModal);
    } catch (ex) {
      err.textContent = ex.message || "Could not update profile."; err.classList.add("show");
    } finally { if (btn?.isConnected) btn.disabled = false; }
  };
}

function openAccountCompanyEditModal(parentModal){
  const user = state.sessionUser || {};
  if (isTeamMemberAccount(user)) return;
  const snap = accountSettingsSnapshot(user);
  const modal = ensureAccountSettingsChildModal("accountCompanyEditModal");
  modal.innerHTML = `
    <div class="modal-backdrop" data-account-child-close></div>
    <div class="modal-dialog settings-sheet account-settings-editor account-company-editor" role="dialog" aria-modal="true" aria-labelledby="accountCompanyEditTitle">
      <div class="settings-sheet-head"><div><p class="account-settings-kicker">Company</p><h3 id="accountCompanyEditTitle">Edit company details</h3><p>Branding and contact information used throughout your workspace and reports.</p></div><button type="button" class="btn ghost tiny" data-account-child-close aria-label="Close">✕</button></div>
      <div class="modal-body settings-sheet-body account-settings-editor-body">
        <div class="settings-grid">
          <label class="settings-field">Company<input id="acctCompanyEditCompany" class="input settings-input" autocomplete="organization" value="${escapeHtml(snap.company)}" /></label>
          <label class="settings-field">VAT / TRN<input id="acctCompanyEditVat" class="input settings-input" value="${escapeHtml(snap.vat)}" /></label>
          <label class="settings-field">Email<input id="acctCompanyEditEmail" class="input settings-input" type="email" autocomplete="email" value="${escapeHtml(snap.email)}" /></label>
          <label class="settings-field">Mobile<input id="acctCompanyEditPhone" class="input settings-input" type="tel" autocomplete="tel" value="${escapeHtml(snap.phone)}" /></label>
          <label class="settings-field settings-span-2">Address<input id="acctCompanyEditAddress" class="input settings-input" value="${escapeHtml(snap.address)}" placeholder="Street, city, country" /></label>
          <label class="settings-field settings-span-2">Company logo<div class="settings-logo-row"><input id="acctCompanyEditLogoFile" class="input settings-input" type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif" /><input id="acctCompanyEditLogoUrl" type="hidden" value="${escapeHtml(snap.logo)}" /><img id="acctCompanyEditLogoPreview" class="settings-logo-preview ${snap.logo ? "" : "hide"}" src="${escapeHtml(snap.logo)}" alt="Company logo preview" /></div><span id="acctCompanyEditLogoStatus" class="settings-hint">${snap.logo ? "Current logo loaded" : "Optional · PNG/JPG/WebP"}</span></label>
        </div>
        <div id="acctCompanyEditError" class="lock-error"></div>
        <div class="settings-sheet-footer"><button type="button" class="btn ghost" data-account-child-close>Cancel</button><button type="button" class="btn primary" id="acctCompanyEditSave">Save company</button></div>
      </div>
    </div>`;
  bindAdminLogoPicker("acctCompanyEdit", user.id || null);
  const close = () => closeAccountSettingsChild(modal);
  modal.querySelectorAll("[data-account-child-close]").forEach(el => el.onclick = close);
  modal.classList.remove("hide"); modal.setAttribute("aria-hidden", "false");
  modal.querySelector("#acctCompanyEditSave").onclick = async e => {
    const btn = e.currentTarget;
    const err = modal.querySelector("#acctCompanyEditError");
    err.textContent = ""; err.classList.remove("show");
    try {
      btn.disabled = true;
      const updated = await supabaseRpc("app_update_own_profile", {
        p_company_name: modal.querySelector("#acctCompanyEditCompany").value.trim(),
        p_vat_number: modal.querySelector("#acctCompanyEditVat").value.trim(),
        p_logo_url: modal.querySelector("#acctCompanyEditLogoUrl").value.trim(),
        p_company_email: modal.querySelector("#acctCompanyEditEmail").value.trim(),
        p_company_phone: modal.querySelector("#acctCompanyEditPhone").value.trim(),
        p_company_address: modal.querySelector("#acctCompanyEditAddress").value.trim()
      });
      await syncAccountSettingsSession(updated);
      close();
      renderAccountSettingsSummary(parentModal);
    } catch (ex) {
      err.textContent = ex.message || "Could not update company details."; err.classList.add("show");
    } finally { if (btn?.isConnected) btn.disabled = false; }
  };
}

function openAccountPasswordChangeModal(){
  const modal = ensureAccountSettingsChildModal("accountPasswordChangeModal");
  modal.innerHTML = `
    <div class="modal-backdrop" data-account-child-close></div>
    <div class="modal-dialog settings-sheet account-settings-editor account-password-editor" role="dialog" aria-modal="true" aria-labelledby="accountPasswordChangeTitle">
      <div class="settings-sheet-head"><div><p class="account-settings-kicker">Security</p><h3 id="accountPasswordChangeTitle">Change password</h3><p>Confirm your current password before replacing it.</p></div><button type="button" class="btn ghost tiny" data-account-child-close aria-label="Close">✕</button></div>
      <div class="modal-body settings-sheet-body account-settings-editor-body">
        <label class="settings-field">Current password<div class="admin-password-row"><input id="acctPasswordCurrent" class="input settings-input" type="password" autocomplete="current-password" /><button type="button" class="pw-eye-btn" data-toggle-form-pw="acctPasswordCurrent" aria-label="Show password"><i class="fa-solid fa-eye"></i></button></div></label>
        <label class="settings-field">New password<div class="admin-password-row"><input id="acctPasswordNew" class="input settings-input" type="password" autocomplete="new-password" aria-describedby="acctPasswordChangeRules" /><button type="button" class="pw-eye-btn" data-toggle-form-pw="acctPasswordNew" aria-label="Show password"><i class="fa-solid fa-eye"></i></button></div></label>
        <label class="settings-field">Confirm new password<div class="admin-password-row"><input id="acctPasswordConfirm" class="input settings-input" type="password" autocomplete="new-password" aria-describedby="acctPasswordChangeRules" /><button type="button" class="pw-eye-btn" data-toggle-form-pw="acctPasswordConfirm" aria-label="Show password"><i class="fa-solid fa-eye"></i></button></div></label>
        <p id="acctPasswordChangeRules" class="settings-password-hint">Use at least 8 characters with one uppercase letter, one lowercase letter, and one number.</p>
        <div id="acctPasswordChangeError" class="lock-error"></div>
        <div class="settings-sheet-footer"><button type="button" class="btn ghost" data-account-child-close>Cancel</button><button type="button" class="btn primary" id="acctPasswordChangeSave">Change password</button></div>
      </div>
    </div>`;
  bindAdminFormPasswordToggle(modal);
  const close = () => closeAccountSettingsChild(modal);
  modal.querySelectorAll("[data-account-child-close]").forEach(el => el.onclick = close);
  modal.classList.remove("hide"); modal.setAttribute("aria-hidden", "false");
  setTimeout(() => modal.querySelector("#acctPasswordCurrent")?.focus(), 50);
  const submitAccountPasswordChange = async e => {
    const btn = e.currentTarget;
    const err = modal.querySelector("#acctPasswordChangeError");
    err.textContent = ""; err.classList.remove("show");
    try {
      const current = modal.querySelector("#acctPasswordCurrent").value;
      const next = modal.querySelector("#acctPasswordNew").value;
      const confirm = modal.querySelector("#acctPasswordConfirm").value;
      if (!current) throw new Error("Enter your current password.");
      assertPasswordPolicy(next, "New password");
      if (next !== confirm) throw new Error("New passwords do not match.");
      btn.disabled = true;
      const updated = await supabaseRpc("app_update_own_profile", { p_old_password: current, p_new_password: next });
      await syncAccountSettingsSession(updated);
      if (state.sessionUser) state.sessionUser.password_is_weak = false;
      updateWeakPasswordBanner();
      close();
      alert("Password changed securely.");
    } catch (ex) {
      err.textContent = ex.message || "Could not change password."; err.classList.add("show");
    } finally { if (btn?.isConnected) btn.disabled = false; }
  };
  modal.querySelector("#acctPasswordChangeSave").onclick = submitAccountPasswordChange;
  ["acctPasswordCurrent","acctPasswordNew","acctPasswordConfirm"].forEach(id => modal.querySelector(`#${id}`)?.addEventListener("keydown", event => { if(event.key === "Enter"){ event.preventDefault(); submitAccountPasswordChange({ currentTarget: modal.querySelector("#acctPasswordChangeSave") }); } }));
}

function renderAccountSettingsSummary(modal){
  if (!modal) return;
  const user = state.sessionUser || {};
  const snap = accountSettingsSnapshot(user);
  const brandingLocked = isTeamMemberAccount(user);
  const body = modal.querySelector("#accountSettingsSummaryBody");
  if (!body) return;
  const logo = snap.logo || "Assets/logo/logo.png";
  body.innerHTML = `
    <section class="settings-card account-summary-card">
      <div class="settings-card-head"><span><i class="fa-solid fa-user"></i> Profile</span><button type="button" class="account-settings-edit-icon" id="accountProfileEditBtn" aria-label="Edit profile" title="Edit profile"><i class="fa-solid fa-pen"></i></button></div>
      <div class="account-summary-profile"><img src="${escapeHtml(logo)}" alt="${escapeHtml(snap.displayName)}" onerror="this.onerror=null;this.src='Assets/logo/logo.png'" /><div><strong>${escapeHtml(snap.displayName)}</strong><span>@${escapeHtml(snap.username)}</span></div></div>
      <div class="account-summary-grid">${accountSettingsSummaryValue("Display name", snap.displayName)}${accountSettingsSummaryValue("Username", `@${snap.username}`)}</div>
    </section>
    <section class="settings-card account-summary-card${brandingLocked ? " settings-card-locked" : ""}">
      <div class="settings-card-head"><span><i class="fa-solid fa-building"></i> Company</span>${brandingLocked ? `<span class="settings-pill">Managed</span>` : `<button type="button" class="account-settings-edit-icon" id="accountCompanyEditBtn" aria-label="Edit company details" title="Edit company"><i class="fa-solid fa-pen"></i></button>`}</div>
      ${brandingLocked ? `<p class="settings-readonly-note"><i class="fa-solid fa-lock"></i> Company details are managed by the company main account.</p>` : ""}
      <div class="account-summary-grid account-company-summary">${accountSettingsSummaryValue("Company", snap.company)}${accountSettingsSummaryValue("VAT / TRN", snap.vat)}${accountSettingsSummaryValue("Email", snap.email)}${accountSettingsSummaryValue("Mobile", snap.phone)}${accountSettingsSummaryValue("Address", snap.address, {wide:true})}</div>
    </section>
    <section class="settings-card account-security-card account-security-launch-card">
      <div class="settings-card-head"><span><i class="fa-solid fa-shield-halved"></i> Account Security</span></div>
      <button type="button" class="account-settings-action-row account-security-launch-row" id="accountSecurityBtn"><span class="account-settings-action-icon"><i class="fa-solid fa-shield-heart"></i></span><span><strong>Account Security</strong><small id="accountSecuritySummaryText">Checking password, 2FA, biometrics, Smart PIN and devices…</small></span><span class="settings-pill account-security-summary-pill is-loading" id="accountSecuritySummaryPill">Checking…</span><i class="fa-solid fa-chevron-right"></i></button>
    </section>`;
  body.querySelector("#accountProfileEditBtn")?.addEventListener("click", () => openAccountProfileEditModal(modal));
  body.querySelector("#accountCompanyEditBtn")?.addEventListener("click", () => openAccountCompanyEditModal(modal));
  body.querySelector("#accountSecurityBtn")?.addEventListener("click", () => {
    if (typeof window.openAccountSecurityCenter === "function") window.openAccountSecurityCenter();
  });
  try { window.refreshAccountSecuritySummary?.(modal); } catch (_) {}
}

function openAccountSettingsModal(){
  if (isGuestMode()) { alert("Account settings are not available in guest mode."); return; }
  let modal = document.getElementById("accountSettingsModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "accountSettingsModal";
    modal.className = "modal hide account-settings-overview-modal";
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div class="modal-backdrop" data-admin-modal-close="accountSettingsModal"></div>
    <div class="modal-dialog settings-sheet account-settings-overview" role="dialog" aria-modal="true" aria-labelledby="accountSettingsTitle">
      <div class="settings-sheet-head"><div><h3 id="accountSettingsTitle">Account settings</h3><p>Your profile, company identity, sign-in and recovery security in one place.</p></div><button type="button" class="btn ghost tiny" data-admin-modal-close="accountSettingsModal" aria-label="Close">✕</button></div>
      <div class="modal-body settings-sheet-body account-settings-overview-body" id="accountSettingsSummaryBody"></div>
    </div>`;
  const close = () => { modal.classList.add("hide"); modal.setAttribute("aria-hidden", "true"); };
  modal.querySelectorAll("[data-admin-modal-close]").forEach(el => el.onclick = close);
  renderAccountSettingsSummary(modal);
  modal.classList.remove("hide"); modal.setAttribute("aria-hidden", "false");
}

window.openAccountPasswordChangeModal = openAccountPasswordChangeModal;
window.renderAccountSettingsSummary = renderAccountSettingsSummary;

function isAppAdminSession(){
  return !!(
    state.sessionUser
    && !isGuestMode()
    && !getUserAccessFlags().is_trial
    && userHasPermission("admin_panel", "view")
  );
}

/** Protected main admin only (is_protected) — not company owners / sub-admins. */
function isProtectedAdminSession(){
  return !!(
    state.sessionUser
    && !isGuestMode()
    && state.sessionUser.role === "admin"
    && state.sessionUser.is_protected === true
  );
}

function updateAdminBackupVisibility(){
  const wrap = document.getElementById("adminBackupWrap");
  const allowed = isProtectedAdminSession();
  if (wrap) wrap.classList.toggle("hide", !allowed);
  document.getElementById("adminPasswordRecoveryBtn")?.classList.toggle("hide", !allowed);
  if (!wrap) {
    if (typeof updateAdminSecurityKeyButtonVisibility === "function") updateAdminSecurityKeyButtonVisibility();
    return;
  }
  if (!allowed) {
    const panel = document.querySelector('[data-entry-menu-panel="admin-backup"]');
    panel?.classList.remove("open");
    document.getElementById("adminBackupBtn")?.setAttribute("aria-expanded", "false");
  }
  if (typeof updateAdminSecurityKeyButtonVisibility === "function") {
    updateAdminSecurityKeyButtonVisibility();
  }
}


function ensureAdminPasswordRecoveryModal(){
  let modal = document.getElementById("adminPasswordRecoveryModal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "adminPasswordRecoveryModal";
  modal.className = "modal hide admin-password-recovery-modal";
  modal.setAttribute("aria-hidden", "true");
  document.body.appendChild(modal);
  return modal;
}

function closeAdminPasswordRecoveryModal(){
  const modal = document.getElementById("adminPasswordRecoveryModal");
  if (!modal) return;
  modal.classList.add("hide");
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = "";
}

function openAdminPasswordRecoveryModal(){
  if (!isProtectedAdminSession()) return alert("Protected Main Admin access is required.");
  const modal = ensureAdminPasswordRecoveryModal();
  modal.innerHTML = `
    <div class="modal-backdrop" data-admin-password-recovery-close></div>
    <div class="modal-dialog settings-sheet admin-password-recovery-dialog" role="dialog" aria-modal="true" aria-labelledby="adminPasswordRecoveryTitle">
      <div class="settings-sheet-head">
        <div><p class="account-settings-kicker">Secure account recovery</p><h3 id="adminPasswordRecoveryTitle"><i class="fa-solid fa-key"></i> Temporary password</h3><p>Verify the account identity before issuing a one-time recovery password. Existing sessions are revoked immediately.</p></div>
        <button type="button" class="btn ghost tiny" data-admin-password-recovery-close aria-label="Close">✕</button>
      </div>
      <div class="modal-body settings-sheet-body admin-password-recovery-body">
        <div class="admin-password-recovery-warning"><i class="fa-solid fa-shield-halved"></i><div><strong>No existing password is revealed</strong><span>The server replaces the current password with a temporary recovery credential. If 2FA is enabled, the user must still verify Authenticator before entering the workspace.</span></div></div>
        <div class="settings-grid admin-password-recovery-grid">
          <label class="settings-field">Username<input id="adminRecoveryUsername" class="input settings-input" autocomplete="off" placeholder="Exact account username" /></label>
          <label class="settings-field">Email address<input id="adminRecoveryEmail" class="input settings-input" type="email" autocomplete="off" placeholder="Stored account email" /></label>
          <label class="settings-field settings-span-2">Mobile number<input id="adminRecoveryMobile" class="input settings-input" inputmode="tel" autocomplete="off" placeholder="Stored mobile number with country code" /></label>
        </div>
        <p class="settings-hint">All three identity fields must match the account. The temporary password expires after 24 hours, can be used for one successful sign-in, and forces the user to create a new password before continuing.</p>
        <p class="lock-error" id="adminRecoveryError"></p>
        <div class="settings-sheet-footer"><button type="button" class="btn ghost" data-admin-password-recovery-close>Cancel</button><button type="button" class="btn primary" id="adminRecoveryIssueBtn"><i class="fa-solid fa-wand-magic-sparkles"></i> Create temporary password</button></div>
      </div>
    </div>`;
  modal.querySelectorAll("[data-admin-password-recovery-close]").forEach(el => el.onclick = closeAdminPasswordRecoveryModal);
  const issueBtn = modal.querySelector("#adminRecoveryIssueBtn");
  issueBtn.onclick = async () => {
    const error = modal.querySelector("#adminRecoveryError");
    if (error) { error.textContent = ""; error.classList.remove("show"); }
    const username = String(modal.querySelector("#adminRecoveryUsername")?.value || "").trim();
    const email = String(modal.querySelector("#adminRecoveryEmail")?.value || "").trim();
    const mobile = String(modal.querySelector("#adminRecoveryMobile")?.value || "").trim();
    if (!username || !email || !mobile) {
      if (error) { error.textContent = "Username, email address and mobile number are all required."; error.classList.add("show"); }
      return;
    }
    issueBtn.disabled = true;
    try {
      const result = await supabaseRpc("app_admin_create_temporary_password", { p_username: username, p_email: email, p_mobile: mobile });
      if (!result?.temporary_password) throw new Error(result?.error || "A temporary password could not be created.");
      const temp = String(result.temporary_password);
      const expiry = result.expires_at ? new Date(result.expires_at).toLocaleString() : "24 hours";
      modal.querySelector(".admin-password-recovery-body").innerHTML = `
        <div class="admin-password-recovery-success"><i class="fa-solid fa-circle-check"></i><div><strong>Temporary password created</strong><span>The previous password is no longer valid and all prior sessions were revoked.</span></div></div>
        <div class="admin-temp-password-card"><span>Temporary password · shown once</span><div><code id="adminRecoveryTempPassword">${escapeHtml(temp)}</code><button type="button" class="admin-temp-password-copy" id="adminRecoveryCopyBtn" aria-label="Copy temporary password" title="Copy temporary password"><i class="fa-regular fa-copy" aria-hidden="true"></i></button></div><small>Expires: ${escapeHtml(expiry)}</small></div>
        <div class="admin-password-recovery-instructions"><i class="fa-solid fa-user-lock"></i><div><strong>Give this password only to the verified account owner</strong><span>At the next sign-in, Authenticator verification still applies if 2FA is enabled. Triplem VIP then requires a new permanent password before dashboard access.</span></div></div>
        <div class="settings-sheet-footer"><button type="button" class="btn primary" data-admin-password-recovery-close>Done</button></div>`;
      modal.querySelectorAll("[data-admin-password-recovery-close]").forEach(el => el.onclick = closeAdminPasswordRecoveryModal);
      modal.querySelector("#adminRecoveryCopyBtn")?.addEventListener("click", async e => {
        const btn = e.currentTarget;
        let copied = false;
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(temp);
            copied = true;
          }
        } catch (_) {}
        if (!copied) {
          const helper = document.createElement("textarea");
          helper.value = temp;
          helper.setAttribute("readonly", "");
          helper.setAttribute("aria-hidden", "true");
          helper.style.cssText = "position:fixed;opacity:0;pointer-events:none;left:-9999px;top:0";
          document.body.appendChild(helper);
          helper.focus({ preventScroll: true });
          helper.select();
          try { helper.setSelectionRange(0, helper.value.length); } catch (_) {}
          try { copied = document.execCommand("copy"); } catch (_) { copied = false; }
          helper.remove();
        }
        btn.classList.toggle("is-copied", copied);
        btn.classList.toggle("is-copy-error", !copied);
        btn.innerHTML = copied ? '<i class="fa-solid fa-check" aria-hidden="true"></i>' : '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>';
        btn.setAttribute("aria-label", copied ? "Temporary password copied" : "Could not copy temporary password");
        btn.title = copied ? "Copied" : "Copy unavailable";
        window.setTimeout(() => {
          if (!btn?.isConnected) return;
          btn.classList.remove("is-copied", "is-copy-error");
          btn.innerHTML = '<i class="fa-regular fa-copy" aria-hidden="true"></i>';
          btn.setAttribute("aria-label", "Copy temporary password");
          btn.title = "Copy temporary password";
        }, 1600);
      });
      try { await loadAdminUsers(); } catch (_) {}
    } catch (err) {
      if (error) { error.textContent = err?.message || "Temporary password creation failed."; error.classList.add("show"); }
    } finally { if (issueBtn?.isConnected) issueBtn.disabled = false; }
  };
  modal.classList.remove("hide");
  modal.setAttribute("aria-hidden", "false");
  setTimeout(() => modal.querySelector("#adminRecoveryUsername")?.focus(), 60);
}

function bindAdminPasswordRecoveryTool(){
  const btn = document.getElementById("adminPasswordRecoveryBtn");
  if (!btn || btn.dataset.bound === "1") return;
  btn.dataset.bound = "1";
  btn.addEventListener("click", openAdminPasswordRecoveryModal);
  updateAdminBackupVisibility();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindAdminPasswordRecoveryTool, { once:true }); else bindAdminPasswordRecoveryTool();
window.openAdminPasswordRecoveryModal = openAdminPasswordRecoveryModal;

const ADMIN_BACKUP_FORMAT = TripleMAdminBackup.ADMIN_BACKUP_FORMAT;
const ADMIN_BACKUP_VERSION = TripleMAdminBackup.ADMIN_BACKUP_VERSION;

function setAdminBackupStatus(message, kind = ""){
  const el = document.getElementById("adminBackupStatus");
  if (!el) return;
  el.textContent = message || "";
  el.classList.toggle("is-busy", kind === "busy");
  el.classList.toggle("is-error", kind === "error");
  el.classList.toggle("is-ok", kind === "ok");
}

function requireProtectedAdminBackup(){
  if (!isProtectedAdminSession()) {
    throw new Error("Protected administrator access required.");
  }
  if (!state.sessionToken) {
    throw new Error("Authentication required. Please sign in again, then retry Upload Backup.");
  }
}

function triggerAdminBackupDownload(filename, blob){
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Canonical admin backup envelope shared by Download JSON/CSV and Upload Backup.
 * Shape matches app_admin_export_full_backup / app_admin_import_full_backup.
 */
function canonicalizeAdminBackupPayload(raw, options = {}){
  return TripleMAdminBackup.canonicalizeAdminBackupPayload(raw, options);
}

async function fetchAdminFullBackupPayload(){
  requireProtectedAdminBackup();
  setAdminBackupStatus("Exporting database…", "busy");
  const payload = await supabaseRpc("app_admin_export_full_backup", {});
  if (!payload || payload.format !== ADMIN_BACKUP_FORMAT) {
    throw new Error("Unexpected backup response from server. Apply migration 034_admin_backup_restore.sql.");
  }
  return canonicalizeAdminBackupPayload(payload);
}

async function downloadAdminBackupJson(){
  try {
    const payload = await fetchAdminFullBackupPayload();
    // Same envelope Upload Backup accepts (format/version/tableOrder/counts/tables).
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    triggerAdminBackupDownload(`TripleM_Admin_Backup_${todayISO()}.json`, blob);
    const total = Object.values(payload.counts || {}).reduce((s, n) => s + Number(n || 0), 0);
    setAdminBackupStatus(`JSON ready · ${total} rows`, "ok");
  } catch (err) {
    setAdminBackupStatus(err.message || String(err), "error");
    alert(err.message || err);
  }
}

/** Encode one CSV cell so adminBackupCsvDecodeCell restores the same JS value. */
function adminBackupCsvEncodeCell(val){
  return TripleMAdminBackup.adminBackupCsvEncodeCell(val);
}

function adminBackupCsvDecodeCell(value){
  return TripleMAdminBackup.adminBackupCsvDecodeCell(value);
}

function adminBackupTableColumnOrder(rows){
  return TripleMAdminBackup.adminBackupTableColumnOrder(rows);
}

function adminBackupTablesToCsv(payload){
  return TripleMAdminBackup.adminBackupTablesToCsv(payload);
}

function parseAdminBackupCsv(text){
  return TripleMAdminBackup.parseAdminBackupCsv(text);
}

async function downloadAdminBackupCsv(){
  try {
    const payload = await fetchAdminFullBackupPayload();
    const csvText = adminBackupTablesToCsv(payload);
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
    triggerAdminBackupDownload(`TripleM_Admin_Backup_${todayISO()}.csv`, blob);
    const total = Object.values(payload.counts || {}).reduce((s, n) => s + Number(n || 0), 0);
    setAdminBackupStatus(`CSV ready · ${total} rows`, "ok");
  } catch (err) {
    setAdminBackupStatus(err.message || String(err), "error");
    alert(err.message || err);
  }
}

/** Bundled full DDL for Download SQL (reset + schema + migrations). */
const ADMIN_FULL_SCHEMA_SQL_URL = "Assets/sql/triplem_full_schema.sql";

/** Escape a JS value as a PostgreSQL string literal (or NULL). */
function sqlLiteral(value){
  if (value === null || value === undefined) return "NULL";
  return "'" + String(value).replace(/'/g, "''") + "'";
}

/** Escape a UUID for SQL (`'…'::uuid` or NULL). */
function sqlUuidLiteral(value){
  const s = String(value || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
    return "NULL";
  }
  return sqlLiteral(s) + "::uuid";
}

/**
 * Load the protected main admin row (+ optional org) for Download SQL.
 * Uses PostgREST (own-row / admin RLS) so password_hash is included.
 */
async function fetchProtectedAdminCredentialsForSql(){
  requireProtectedAdminBackup();
  const uid = String(state.sessionUser?.id || "").trim();
  if (!uid) throw new Error("No protected admin session.");

  // password_hash / admin_visible_* columns are revoked from PostgREST; use security-definer RPC.
  const exported = unwrapRpcJson(await supabaseRpc("app_admin_export_self_credentials", {}));
  const admin = exported?.admin && typeof exported.admin === "object" ? exported.admin : null;
  if (!admin || admin.role !== "admin" || admin.is_protected !== true) {
    throw new Error("Could not load protected admin credentials for SQL export.");
  }
  if (String(admin.id || "").trim() && String(admin.id).trim() !== uid) {
    throw new Error("Protected admin credentials do not match the current session.");
  }

  const username = String(admin.username || "").trim();
  const passwordHash = String(admin.password_hash || "").trim();
  if (!username) throw new Error("Protected admin username is missing.");
  if (!passwordHash) {
    throw new Error("Protected admin password hash is unavailable for SQL export.");
  }

  let org = exported?.org && typeof exported.org === "object" ? exported.org : null;
  const orgId = String(admin.organization_id || org?.id || "").trim();
  if (!org && orgId) {
    org = { id: orgId, name: "Default Organization" };
  }
  return { admin, org };
}

/**
 * Append-only SQL: one org (if needed) + protected main admin upsert.
 * No other users or business data.
 */
function buildProtectedAdminCredentialsSql(admin, org){
  const username = String(admin.username || "").trim();
  const displayName = String(admin.display_name || username || "Admin").trim() || "Admin";
  const passwordHash = String(admin.password_hash || "").trim();
  const pinHash = String(admin.smart_pin_hash || "").trim();
  const orgId = String(admin.organization_id || org?.id || "").trim();
  const orgName = String(org?.name || "Default Organization").trim() || "Default Organization";

  // Export only one-way hashes. Recoverable passwords and Smart PINs are never embedded.
  if (!passwordHash) throw new Error("Protected admin password hash is unavailable.");
  const passwordSql = sqlLiteral(passwordHash);

  const lines = [
    "",
    "-- ============================================================================",
    "-- Protected main admin credentials (live snapshot at download time).",
    "-- Upserts over schema seed defaults so login matches this admin.",
    "-- No other users or business data rows are included.",
    "-- ============================================================================",
    ""
  ];

  if (orgId) {
    lines.push(
      "INSERT INTO public.app_organizations (id, name)",
      "VALUES (" + sqlUuidLiteral(orgId) + ", " + sqlLiteral(orgName) + ")",
      "ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;",
      ""
    );
  }

  lines.push(
    "INSERT INTO public.app_users (",
    "  organization_id, username, password_hash,",
    "  display_name, role, is_protected, is_active, must_change_password,",
    "  smart_pin_hash",
    ") VALUES (",
    "  " + (orgId ? sqlUuidLiteral(orgId) : "NULL") + ",",
    "  " + sqlLiteral(username) + ",",
    "  " + passwordSql + ",",
    "  " + sqlLiteral(displayName) + ",",
    "  'admin',",
    "  true,",
    "  true,",
    "  false,",
    "  " + (pinHash ? sqlLiteral(pinHash) : "NULL"),
    ")",
    "ON CONFLICT (username) DO UPDATE SET",
    "  organization_id = COALESCE(EXCLUDED.organization_id, public.app_users.organization_id),",
    "  password_hash = EXCLUDED.password_hash,",
    "  admin_visible_password = NULL,",
    "  display_name = EXCLUDED.display_name,",
    "  role = 'admin',",
    "  is_protected = true,",
    "  is_active = true,",
    "  must_change_password = EXCLUDED.must_change_password,",
    "  smart_pin_hash = EXCLUDED.smart_pin_hash,",
    "  admin_visible_smart_pin = NULL,",
    "  updated_at = now();",
    ""
  );

  return lines.join("\n");
}

async function downloadAdminBackupSql(){
  try {
    requireProtectedAdminBackup();
    setAdminBackupStatus("Fetching full schema SQL…", "busy");
    const response = await fetch(ADMIN_FULL_SCHEMA_SQL_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Could not load schema SQL (" + response.status + "). Ensure Assets/sql/triplem_full_schema.sql is deployed.");
    }
    const sqlBody = await response.text();
    if (!sqlBody || !sqlBody.includes("app_admin_export_full_backup") || !sqlBody.includes("create table")) {
      throw new Error("Schema SQL asset looks incomplete. Rebuild with: node scripts/build_full_schema_sql.js");
    }

    setAdminBackupStatus("Embedding protected admin credentials…", "busy");
    const { admin, org } = await fetchProtectedAdminCredentialsForSql();
    const credentialsSql = buildProtectedAdminCredentialsSql(admin, org);

    const stamp = new Date().toISOString();
    const sqlText =
      "-- Downloaded: " + stamp + "\n" +
      "-- Source asset: " + ADMIN_FULL_SCHEMA_SQL_URL + "\n" +
      "-- Includes: full schema DDL + protected main admin credentials only (no other data).\n" +
      "-- After this schema runs, use Admin Upload Backup (JSON/CSV) for full data restore.\n" +
      sqlBody +
      credentialsSql;
    const blob = new Blob([sqlText], { type: "application/sql;charset=utf-8;" });
    triggerAdminBackupDownload("TripleM_Full_Schema_" + todayISO() + ".sql", blob);
    setAdminBackupStatus(
      "SQL ready · full DDL + protected admin @" + String(admin.username || "").trim(),
      "ok"
    );
  } catch (err) {
    setAdminBackupStatus(err.message || String(err), "error");
    alert(err.message || err);
  }
}

function detectAdminBackupKind(file, text){
  const name = String(file?.name || "").toLowerCase();
  const head = String(text || "").trim().slice(0, 200);
  if (name.endsWith(".json") || head.startsWith("{")) return "json";
  if (name.endsWith(".csv") || head.startsWith("#") || head.includes("###TABLE:")) return "csv";
  if (head.startsWith("{")) return "json";
  return "csv";
}

function normalizeAdminBackupPayload(parsed){
  return canonicalizeAdminBackupPayload(parsed);
}

async function uploadAdminBackupFile(file){
  requireProtectedAdminBackup();
  if (!file) return;
  setAdminBackupStatus("Reading backup…", "busy");
  const text = await file.text();
  const kind = detectAdminBackupKind(file, text);
  let payload;
  try {
    if (kind === "json") {
      // Same canonical envelope as Download Backup (JSON).
      payload = normalizeAdminBackupPayload(JSON.parse(text));
    } else {
      // parseAdminBackupCsv already returns the canonical envelope Download CSV writes.
      payload = normalizeAdminBackupPayload(parseAdminBackupCsv(text));
    }
  } catch (err) {
    setAdminBackupStatus(err.message || String(err), "error");
    throw err;
  }

  const tableNames = Object.keys(payload.tables || {});
  const rowCount = tableNames.reduce((s, t) => s + (Array.isArray(payload.tables[t]) ? payload.tables[t].length : 0), 0);
  const ok = confirm(
    `Restore full admin backup?\n\n` +
    `This DESTRUCTIVELY replaces exported tables with ${rowCount} row(s) across ${tableNames.length} table(s).\n` +
    `Other users’ sessions will be cleared. Continue only for disaster recovery.`
  );
  if (!ok) {
    setAdminBackupStatus("Restore cancelled", "");
    return;
  }

  setAdminBackupStatus("Restoring database…", "busy");
  let result;
  try {
    result = await supabaseRpc("app_admin_import_full_backup", { p_payload: payload });
  } catch (err) {
    const detail = err?.message || String(err);
    setAdminBackupStatus(detail, "error");
    throw new Error(`Restore failed: ${detail}. The previous database state may be partially applied — re-export a fresh backup before retrying.`);
  }
  setAdminBackupStatus("Restore complete", "ok");
  alert(result?.warning || "Database restore finished. Refresh recommended.");
  try {
    await loadAdminUsers();
  } catch { /* ignore */ }
}

function bindAdminBackupEvents(){
  const jsonBtn = document.getElementById("adminBackupDownloadJsonBtn");
  const csvBtn = document.getElementById("adminBackupDownloadCsvBtn");
  const sqlBtn = document.getElementById("adminBackupDownloadSqlBtn");
  const uploadInput = document.getElementById("adminBackupUploadInput");
  jsonBtn?.addEventListener("click", () => {
    downloadAdminBackupJson().catch(err => alert(err.message || err));
  });
  csvBtn?.addEventListener("click", () => {
    downloadAdminBackupCsv().catch(err => alert(err.message || err));
  });
  sqlBtn?.addEventListener("click", () => {
    downloadAdminBackupSql().catch(err => alert(err.message || err));
  });
  uploadInput?.addEventListener("change", async e => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      await uploadAdminBackupFile(file);
    } catch (err) {
      setAdminBackupStatus(err.message || String(err), "error");
      alert(err.message || err);
    }
  });
  updateAdminBackupVisibility();
}

function formatRelativeTime(value){
  if (!value) return "";
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return formatAdminDate(value);
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatAdminDate(value);
}

function formatStorageBytes(bytes){
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

let adminStorageCharts = { mix: null, top: null };
let adminStorageState = {
  totals: null,
  users: [],
  selectedUserId: "all",
  listQuery: "",
  listFilter: "top5",
  scopeQuery: "",
  analytics: null,
  analyticsBusy: false
};

function destroyAdminStorageCharts(){
  try { adminStorageCharts.mix?.destroy?.(); } catch (_) {}
  try { adminStorageCharts.top?.destroy?.(); } catch (_) {}
  adminStorageCharts = { mix: null, top: null };
}

function getAdminStorageSortedUsers(){
  return [...(adminStorageState.users || [])].sort(
    (a, b) => (Number(b.total_bytes) || 0) - (Number(a.total_bytes) || 0)
  );
}

function getAdminStorageListUsers(){
  let users = getAdminStorageSortedUsers();
  const q = String(adminStorageState.listQuery || "").trim().toLowerCase();
  const filter = adminStorageState.listFilter || "top5";
  if (filter === "photos") {
    users = users.filter(u => Number(u.photo_bytes) > 0);
  }
  if (q) {
    users = users.filter(u => {
      const name = String(u.username || "").toLowerCase();
      const display = String(u.display_name || "").toLowerCase();
      return name.includes(q) || display.includes(q);
    });
  } else if (filter === "top5") {
    users = users.slice(0, 5);
  }
  return users;
}

function adminStorageSelectedUserLabel(){
  const selected = adminStorageState.selectedUserId || "all";
  if (selected === "all") return "All accounts";
  const user = (adminStorageState.users || []).find(u => String(u.id) === String(selected));
  if (!user) return "All accounts";
  const name = user.display_name || user.username || "user";
  return `${name} (@${user.username || "user"})`;
}

function getAdminStorageChartSource(){
  const users = adminStorageState.users || [];
  const selectedId = adminStorageState.selectedUserId || "all";
  if (selectedId === "all") {
    return { scope: "all", totals: adminStorageState.totals || {}, users };
  }
  const user = users.find(u => String(u.id) === String(selectedId));
  if (!user) return { scope: "all", totals: adminStorageState.totals || {}, users };
  return {
    scope: "user",
    totals: {
      total_bytes: user.total_bytes,
      text_bytes: user.text_bytes,
      photo_bytes: user.photo_bytes,
      ledger_bytes: user.ledger_bytes,
      expense_bytes: user.expense_bytes,
      inventory_bytes: user.inventory_bytes,
      notes_bytes: user.notes_bytes,
      bitcoin_bytes: user.bitcoin_bytes,
      assets_bytes: user.assets_bytes,
      profile_bytes: user.profile_bytes,
      user_count: 1
    },
    users: [user],
    user
  };
}

async function openAdminStorageManagementModal(){
  let modal = document.getElementById("adminStorageModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "adminStorageModal";
    modal.className = "modal hide";
    document.body.appendChild(modal);
  }
  adminStorageState.selectedUserId = "all";
  adminStorageState.listQuery = "";
  adminStorageState.listFilter = "top5";
  adminStorageState.scopeQuery = "";
  modal.innerHTML = `
    <div class="modal-backdrop" data-admin-storage-close></div>
    <div class="modal-dialog admin-modal-dialog admin-storage-dialog" role="dialog" aria-modal="true" aria-labelledby="adminStorageTitle">
      <div class="modal-head">
        <div>
          <h3 id="adminStorageTitle">Storage Management</h3>
          <p>Pick a user for charts, or browse top storage accounts below.</p>
        </div>
        <button type="button" class="btn ghost tiny" data-admin-storage-close aria-label="Close">✕</button>
      </div>
      <div class="modal-body admin-storage-body">
        <div class="admin-storage-toolbar">
          <button type="button" class="btn soft tiny admin-tool-btn admin-tool-btn--icon" id="adminStorageRefreshBtn" title="Refresh" aria-label="Refresh"><i class="fa-solid fa-rotate"></i></button>
          <span class="admin-storage-hint" id="adminStorageHint">Loading…</span>
        </div>
        <div class="admin-storage-scope" id="adminStorageUserPicks"></div>
        <div class="admin-storage-summary" id="adminStorageSummary"></div>
        <section class="admin-storage-analytics" id="adminStorageAnalytics" aria-labelledby="adminStorageAnalyticsTitle">
          <div class="admin-storage-analytics-head">
            <div>
              <h4 id="adminStorageAnalyticsTitle">Analytics Storage</h4>
              <p class="admin-storage-analytics-lead">Site analytics tables only — user ledgers stay untouched.</p>
            </div>
            <span class="admin-storage-analytics-status" id="adminStorageAnalyticsStatus">Loading…</span>
          </div>
          <div class="admin-storage-summary admin-storage-analytics-summary" id="adminStorageAnalyticsSummary">
            <div class="admin-storage-stat"><span>Records</span><strong>—</strong></div>
            <div class="admin-storage-stat"><span>Used</span><strong>—</strong></div>
            <div class="admin-storage-stat"><span>Of database</span><strong>—</strong></div>
          </div>
          <div class="admin-storage-analytics-actions" id="adminStorageAnalyticsActions">
            <button type="button" class="btn soft tiny" data-analytics-cleanup="3">Older than 3 days</button>
            <button type="button" class="btn soft tiny" data-analytics-cleanup="7">Older than 7 days</button>
            <button type="button" class="btn soft tiny" data-analytics-cleanup="14">Older than 14 days</button>
            <button type="button" class="btn soft tiny" data-analytics-cleanup="30">Older than 30 days</button>
            <button type="button" class="btn soft tiny danger-text" data-analytics-cleanup="all">Delete all analytics</button>
          </div>
        </section>
        <div class="admin-storage-charts">
          <div class="admin-storage-chart-card">
            <h4 id="adminStorageMixTitle">Storage mix</h4>
            <div class="admin-storage-chart-wrap"><canvas id="adminStorageMixChart"></canvas></div>
          </div>
          <div class="admin-storage-chart-card">
            <h4 id="adminStorageTopTitle">Top accounts</h4>
            <div class="admin-storage-chart-wrap"><canvas id="adminStorageTopChart"></canvas></div>
          </div>
        </div>
        <div class="admin-storage-list-head">
          <div class="admin-storage-list-tools">
            <input type="search" class="input admin-storage-list-search" id="adminStorageListSearch" placeholder="Search username…" autocomplete="off" />
            <select class="input admin-storage-list-filter" id="adminStorageListFilter" aria-label="User list filter">
              <option value="top5" selected>Top 5 storage</option>
              <option value="photos">With photos</option>
              <option value="all">All users</option>
            </select>
          </div>
          <p class="admin-storage-list-meta" id="adminStorageListMeta"></p>
        </div>
        <div class="admin-storage-table-wrap" id="adminStorageTableWrap">
          <div class="empty"><i class="fa-solid fa-spinner btn-loader"></i> Loading storage…</div>
        </div>
      </div>
    </div>`;

  const close = () => {
    destroyAdminStorageCharts();
    modal.classList.add("hide");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  };
  modal.querySelectorAll("[data-admin-storage-close]").forEach(el => { el.onclick = close; });
  modal.querySelector("#adminStorageRefreshBtn").onclick = () => loadAdminStorageUsage(modal);
  modal.querySelector("#adminStorageAnalyticsActions")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-analytics-cleanup]");
    if (!btn || adminStorageState.analyticsBusy) return;
    runAdminAnalyticsStorageCleanup(modal, btn.getAttribute("data-analytics-cleanup"));
  });
  const listSearch = modal.querySelector("#adminStorageListSearch");
  const listFilter = modal.querySelector("#adminStorageListFilter");
  if (listSearch) {
    listSearch.oninput = () => {
      adminStorageState.listQuery = listSearch.value || "";
      renderAdminStorageUserCards(modal);
    };
  }
  if (listFilter) {
    listFilter.onchange = () => {
      adminStorageState.listFilter = listFilter.value || "top5";
      renderAdminStorageUserCards(modal);
    };
  }
  modal.classList.remove("hide");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  await loadAdminStorageUsage(modal);
}

function renderAdminAnalyticsStorageSection(modal, stats){
  const summary = modal?.querySelector("#adminStorageAnalyticsSummary");
  const status = modal?.querySelector("#adminStorageAnalyticsStatus");
  if (!summary) return;
  const data = stats || adminStorageState.analytics || {};
  const records = Number(data.records || 0);
  const bytes = Number(data.bytes || 0);
  const percent = Number(data.percent || 0);
  const breakdown = data.breakdown || {};
  summary.innerHTML = `
    <div class="admin-storage-stat"><span>Records</span><strong>${escapeHtml(String(records.toLocaleString()))}</strong></div>
    <div class="admin-storage-stat"><span>Used</span><strong>${escapeHtml(formatStorageBytes(bytes))}</strong></div>
    <div class="admin-storage-stat"><span>Of database</span><strong>${escapeHtml(percent.toFixed(2))}%</strong></div>`;
  if (status) {
    const parts = [
      `S ${Number(breakdown.sessions || 0)}`,
      `PV ${Number(breakdown.pageviews || 0)}`,
      `Ev ${Number(breakdown.events || 0)}`
    ];
    status.textContent = data.generated_at
      ? `${parts.join(" · ")} · ${formatAdminDate(data.generated_at)}`
      : parts.join(" · ");
  }
}

async function loadAdminAnalyticsStorageStats(modal){
  const status = modal?.querySelector("#adminStorageAnalyticsStatus");
  if (status && !adminStorageState.analytics) status.textContent = "Loading…";
  try {
    const data = await supabaseRpc("app_admin_analytics_storage_stats", {});
    adminStorageState.analytics = data || null;
    renderAdminAnalyticsStorageSection(modal, data);
  } catch (err) {
    if (status) {
      status.textContent = err?.message || "Analytics storage unavailable (run migration 091)";
    }
  }
}

async function refreshAdminAnalyticsDashboardIfOpen(){
  try {
    const analyticsModal = document.getElementById("adminAnalyticsModal");
    if (!analyticsModal || analyticsModal.classList.contains("hide")) return;
    if (typeof loadAdminAnalyticsSummary === "function") {
      await loadAdminAnalyticsSummary({ silent: true });
    }
  } catch (_) {}
}

async function runAdminAnalyticsStorageCleanup(modal, mode){
  const key = String(mode || "");
  const isAll = key === "all";
  const days = isAll ? null : Number(key);
  if (!isAll && ![3, 7, 14, 30].includes(days)) return;

  const confirmMsg = isAll
    ? "Delete ALL analytics records?\n\nThis only removes site analytics tables. User ledgers and other app data are not affected.\n\nThis cannot be undone."
    : `Delete analytics records older than ${days} days?\n\nOnly site analytics data will be removed. User ledgers and other app data stay untouched.`;
  if (!(await appConfirmDelete(confirmMsg, { title: "Delete analytics data?", confirmLabel: "Delete analytics", note: "Only the analytics records described above will be removed." }))) return;

  adminStorageState.analyticsBusy = true;
  const status = modal?.querySelector("#adminStorageAnalyticsStatus");
  const actions = modal?.querySelector("#adminStorageAnalyticsActions");
  actions?.querySelectorAll("button").forEach(b => { b.disabled = true; });
  if (status) status.textContent = "Cleaning analytics…";
  try {
    const result = await supabaseRpc("app_admin_analytics_storage_cleanup", {
      p_older_than_days: isAll ? null : days
    });
    const deleted = Number(result?.deleted?.total || 0);
    adminStorageState.analytics = result?.stats || null;
    if (adminStorageState.analytics) {
      renderAdminAnalyticsStorageSection(modal, adminStorageState.analytics);
    } else {
      await loadAdminAnalyticsStorageStats(modal);
    }
    if (status) status.textContent = `Removed ${deleted.toLocaleString()} analytics row${deleted === 1 ? "" : "s"}`;
    await refreshAdminAnalyticsDashboardIfOpen();
  } catch (err) {
    alert(err?.message || "Could not clean analytics storage.");
    if (status) status.textContent = "Cleanup failed";
  } finally {
    adminStorageState.analyticsBusy = false;
    actions?.querySelectorAll("button").forEach(b => { b.disabled = false; });
  }
}

function renderAdminStorageUserPicks(modal){
  const wrap = modal.querySelector("#adminStorageUserPicks");
  if (!wrap) return;
  const selected = adminStorageState.selectedUserId || "all";
  const label = adminStorageSelectedUserLabel();
  wrap.innerHTML = `
    <label class="admin-storage-scope-label" for="adminStorageScopeInput">Chart focus</label>
    <div class="admin-storage-combo" id="adminStorageCombo">
      <div class="admin-storage-combo-row">
        <input type="search" class="input admin-storage-combo-input" id="adminStorageScopeInput" placeholder="All accounts — type username…" autocomplete="off" value="${selected === "all" ? "" : escapeHtml(label)}" aria-autocomplete="list" aria-controls="adminStorageScopeList" aria-expanded="false" />
        <button type="button" class="btn soft tiny admin-storage-combo-all" id="adminStorageScopeAll" title="Show all accounts">All</button>
      </div>
      <div class="admin-storage-combo-list hide" id="adminStorageScopeList" role="listbox"></div>
    </div>`;

  const input = wrap.querySelector("#adminStorageScopeInput");
  const list = wrap.querySelector("#adminStorageScopeList");
  const allBtn = wrap.querySelector("#adminStorageScopeAll");
  const combo = wrap.querySelector("#adminStorageCombo");

  const closeList = () => {
    list?.classList.add("hide");
    input?.setAttribute("aria-expanded", "false");
  };

  const selectUser = (id) => {
    adminStorageState.selectedUserId = id || "all";
    adminStorageState.scopeQuery = "";
    closeList();
    renderAdminStorageUserPicks(modal);
    applyAdminStorageSelection(modal);
    renderAdminStorageUserCards(modal);
  };

  const renderOptions = (query = "") => {
    const q = String(query || "").trim().toLowerCase();
    const users = getAdminStorageSortedUsers().filter(u => {
      if (!q) return true;
      const name = String(u.username || "").toLowerCase();
      const display = String(u.display_name || "").toLowerCase();
      return name.includes(q) || display.includes(q);
    }).slice(0, 40);
    const rows = [
      `<button type="button" class="admin-storage-combo-option${selected === "all" ? " is-active" : ""}" data-storage-user="all" role="option">All accounts</button>`,
      ...users.map(u => `
        <button type="button" class="admin-storage-combo-option${String(selected) === String(u.id) ? " is-active" : ""}" data-storage-user="${escapeHtml(String(u.id))}" role="option">
          <strong>@${escapeHtml(u.username || "user")}</strong>
          <span>${escapeHtml(u.display_name || "")} · ${escapeHtml(formatStorageBytes(u.total_bytes))}</span>
        </button>`)
    ];
    list.innerHTML = rows.join("") || `<div class="admin-storage-combo-empty">No users match.</div>`;
    list.querySelectorAll("[data-storage-user]").forEach(btn => {
      btn.onclick = () => selectUser(btn.getAttribute("data-storage-user") || "all");
    });
  };

  const openList = () => {
    renderOptions(input.value);
    list.classList.remove("hide");
    input.setAttribute("aria-expanded", "true");
  };

  if (input) {
    input.onfocus = () => {
      if (selected !== "all") input.select();
      openList();
    };
    input.oninput = () => {
      adminStorageState.scopeQuery = input.value || "";
      openList();
    };
    input.onkeydown = (e) => {
      if (e.key === "Escape") {
        closeList();
        input.blur();
      } else if (e.key === "Enter") {
        e.preventDefault();
        const first = list.querySelector("[data-storage-user]");
        if (first) selectUser(first.getAttribute("data-storage-user") || "all");
      }
    };
  }
  if (allBtn) allBtn.onclick = () => selectUser("all");
  if (!modal._storageComboOutsideBound) {
    modal._storageComboOutsideBound = true;
    modal.addEventListener("click", (ev) => {
      const box = modal.querySelector("#adminStorageCombo");
      const dropdown = modal.querySelector("#adminStorageScopeList");
      if (!box || !dropdown || dropdown.classList.contains("hide")) return;
      if (!box.contains(ev.target)) {
        dropdown.classList.add("hide");
        modal.querySelector("#adminStorageScopeInput")?.setAttribute("aria-expanded", "false");
      }
    });
  }
}

function applyAdminStorageSelection(modal){
  const source = getAdminStorageChartSource();
  const summary = modal.querySelector("#adminStorageSummary");
  const mixTitle = modal.querySelector("#adminStorageMixTitle");
  const topTitle = modal.querySelector("#adminStorageTopTitle");
  const totals = source.totals || {};
  if (summary) {
    const label = source.scope === "user"
      ? `@${source.user?.username || "user"}`
      : "All accounts";
    summary.innerHTML = `
      <div class="admin-storage-stat"><span>Scope</span><strong>${escapeHtml(label)}</strong></div>
      <div class="admin-storage-stat"><span>Total</span><strong>${escapeHtml(formatStorageBytes(totals.total_bytes))}</strong></div>
      <div class="admin-storage-stat"><span>Text</span><strong>${escapeHtml(formatStorageBytes(totals.text_bytes))}</strong></div>
      <div class="admin-storage-stat"><span>Photos</span><strong>${escapeHtml(formatStorageBytes(totals.photo_bytes))}</strong></div>`;
  }
  if (mixTitle) {
    mixTitle.textContent = source.scope === "user"
      ? `Mix · @${source.user?.username || "user"}`
      : "Storage mix · All";
  }
  if (topTitle) {
    topTitle.textContent = source.scope === "user"
      ? `Breakdown · @${source.user?.username || "user"}`
      : "Top accounts";
  }
  renderAdminStorageCharts(source);
}

function renderAdminStorageUserCards(modal){
  const tableWrap = modal.querySelector("#adminStorageTableWrap");
  const meta = modal.querySelector("#adminStorageListMeta");
  if (!tableWrap) return;
  const allUsers = adminStorageState.users || [];
  if (!allUsers.length) {
    tableWrap.innerHTML = `<div class="empty">No user storage data found.</div>`;
    if (meta) meta.textContent = "";
    return;
  }
  const users = getAdminStorageListUsers();
  const filter = adminStorageState.listFilter || "top5";
  const q = String(adminStorageState.listQuery || "").trim();
  if (meta) {
    const filterLabel = filter === "photos" ? "with photos" : (filter === "all" ? "all users" : "top storage");
    meta.textContent = q
      ? `${users.length} match${users.length === 1 ? "" : "es"} for “${q}”`
      : `Showing ${users.length} · ${filterLabel}`;
  }
  if (!users.length) {
    tableWrap.innerHTML = `<div class="empty">${q ? "No users match that search." : "No users in this filter."}</div>`;
    return;
  }
  tableWrap.innerHTML = `
    <div class="admin-storage-cards">
      ${users.map(u => `
        <div class="admin-storage-user-card${String(adminStorageState.selectedUserId) === String(u.id) ? " is-active" : ""}" data-storage-user-card="${escapeHtml(String(u.id))}">
          <button type="button" class="admin-storage-user-card-main" data-storage-user="${escapeHtml(String(u.id))}">
            <div class="admin-storage-user-card-head">
              <div>
                <strong>${escapeHtml(u.display_name || u.username || "—")}</strong>
                <code>@${escapeHtml(u.username || "")}</code>
              </div>
              <span class="admin-storage-user-total">${escapeHtml(formatStorageBytes(u.total_bytes))}</span>
            </div>
            <div class="admin-storage-user-meta">
              <span>Text ${escapeHtml(formatStorageBytes(u.text_bytes))}</span>
              <span>Photos ${escapeHtml(formatStorageBytes(u.photo_bytes))}</span>
              <span>Ledger ${escapeHtml(formatStorageBytes(u.ledger_bytes))}</span>
              <span>Exp ${escapeHtml(formatStorageBytes(u.expense_bytes))}</span>
              <span>Inv ${escapeHtml(formatStorageBytes(u.inventory_bytes))}</span>
              <span>Notes ${escapeHtml(formatStorageBytes(u.notes_bytes))}</span>
              <span>Assets ${escapeHtml(formatStorageBytes(u.assets_bytes))}</span>
              <span>BTC ${escapeHtml(formatStorageBytes(u.bitcoin_bytes))}</span>
            </div>
          </button>
          ${(Number(u.photo_bytes) > 0) ? `
            <button type="button" class="btn soft tiny admin-storage-compress-btn" data-storage-compress="${escapeHtml(String(u.id))}" data-storage-compress-user="${escapeHtml(u.username || "")}">
              <i class="fa-solid fa-compress" aria-hidden="true"></i> Compress photos
            </button>` : ""}
        </div>`).join("")}
    </div>`;
  tableWrap.querySelectorAll("[data-storage-user]").forEach(btn => {
    btn.onclick = () => {
      adminStorageState.selectedUserId = btn.getAttribute("data-storage-user") || "all";
      renderAdminStorageUserPicks(modal);
      applyAdminStorageSelection(modal);
      renderAdminStorageUserCards(modal);
    };
  });
  tableWrap.querySelectorAll("[data-storage-compress]").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      openAdminPhotoCompressModal({
        id: btn.getAttribute("data-storage-compress"),
        username: btn.getAttribute("data-storage-compress-user") || ""
      }, modal);
    };
  });
}

async function loadAdminStorageUsage(modal){
  const hint = modal.querySelector("#adminStorageHint");
  const tableWrap = modal.querySelector("#adminStorageTableWrap");
  if (hint) hint.textContent = "Refreshing…";
  if (tableWrap) tableWrap.innerHTML = `<div class="empty"><i class="fa-solid fa-spinner btn-loader"></i> Loading storage…</div>`;
  const analyticsPromise = loadAdminAnalyticsStorageStats(modal).catch(() => {});
  try {
    const data = await supabaseRpc("app_admin_storage_usage", {});
    adminStorageState.totals = data?.totals || {};
    adminStorageState.users = Array.isArray(data?.users) ? data.users : [];
    if (!adminStorageState.users.some(u => String(u.id) === String(adminStorageState.selectedUserId))) {
      adminStorageState.selectedUserId = "all";
    }
    if (hint) {
      const when = data?.generated_at ? formatAdminDate(data.generated_at) : "";
      hint.textContent = when ? `Updated ${when}` : "Ready";
    }
    const listSearch = modal.querySelector("#adminStorageListSearch");
    const listFilter = modal.querySelector("#adminStorageListFilter");
    if (listSearch && listSearch.value !== adminStorageState.listQuery) {
      listSearch.value = adminStorageState.listQuery || "";
    }
    if (listFilter) listFilter.value = adminStorageState.listFilter || "top5";
    renderAdminStorageUserPicks(modal);
    applyAdminStorageSelection(modal);
    renderAdminStorageUserCards(modal);
  } catch (err) {
    if (hint) hint.textContent = "Failed";
    if (tableWrap) {
      tableWrap.innerHTML = `<div class="empty">${escapeHtml(err.message || "Could not load storage usage. Run migration 078_admin_storage_management.sql.")}</div>`;
    }
  } finally {
    await analyticsPromise;
  }
}

function adminStorageChartFontSize(){
  return window.matchMedia("(max-width: 720px)").matches ? 8 : 10;
}

function adminStorageChartTheme(){
  const cs = getComputedStyle(document.documentElement);
  const read = (name, fallback) => (cs.getPropertyValue(name) || "").trim() || fallback;
  return {
    text: read("--text", "#17212b"),
    muted: read("--muted", "#667085"),
    line: read("--line", "rgba(148,163,184,.18)"),
    lineStrong: read("--line-strong", "rgba(100,116,139,.28)"),
    surface: read("--surface-glass-strong", "rgba(255,255,255,.92)"),
    primary: read("--primary", "#2457d6"),
    danger: read("--danger", "#c73545")
  };
}

function renderAdminStorageCharts(source){
  destroyAdminStorageCharts();
  if (typeof Chart !== "function") return;
  const totals = source?.totals || {};
  const users = source?.users || [];
  const fontSize = adminStorageChartFontSize();
  const chartTheme = adminStorageChartTheme();
  const commonLegend = {
    color: chartTheme.text,
    boxWidth: 8,
    boxHeight: 8,
    padding: 6,
    font: { size: fontSize }
  };
  const commonTooltip = {
    backgroundColor: chartTheme.surface,
    titleColor: chartTheme.text,
    bodyColor: chartTheme.text,
    borderColor: chartTheme.lineStrong,
    borderWidth: 1,
    displayColors: true
  };
  const mixEl = document.getElementById("adminStorageMixChart");
  const topEl = document.getElementById("adminStorageTopChart");
  const mixData = [
    Number(totals.ledger_bytes) || 0,
    Number(totals.expense_bytes) || 0,
    Number(totals.inventory_bytes) || 0,
    Number(totals.notes_bytes) || 0,
    Number(totals.assets_bytes) || 0,
    Number(totals.bitcoin_bytes) || 0,
    Number(totals.photo_bytes) || 0,
    Number(totals.profile_bytes) || 0
  ];
  if (mixEl) {
    adminStorageCharts.mix = new Chart(mixEl, {
      type: "doughnut",
      data: {
        labels: ["Ledger", "Exp", "Inv", "Notes", "Assets", "BTC", "Photos", "Profile"],
        datasets: [{
          data: mixData,
          backgroundColor: ["#2457d6", "#0f766e", "#b45309", "#7c3aed", "#0369a1", "#f59e0b", "#dc2626", "#64748b"]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: 2 },
        plugins: {
          legend: {
            position: "bottom",
            labels: commonLegend
          },
          tooltip: {
            ...commonTooltip,
            callbacks: {
              label: (ctx) => `${ctx.label}: ${formatStorageBytes(ctx.raw || 0)}`
            }
          }
        }
      }
    });
  }
  if (topEl) {
    const isUser = source?.scope === "user";
    if (isUser) {
      adminStorageCharts.top = new Chart(topEl, {
        type: "bar",
        data: {
          labels: ["Ledger", "Exp", "Inv", "Notes", "Assets", "BTC", "Photos", "Profile"],
          datasets: [{
            label: "Bytes",
            data: mixData,
            backgroundColor: ["#2457d6", "#0f766e", "#b45309", "#7c3aed", "#0369a1", "#f59e0b", "#dc2626", "#64748b"]
          }]
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          layout: { padding: 2 },
          scales: {
            x: {
              ticks: {
                color: chartTheme.muted,
                font: { size: fontSize },
                maxRotation: 0,
                callback: (v) => formatStorageBytes(v)
              },
              grid: { color: chartTheme.line }
            },
            y: {
              ticks: { color: chartTheme.text, font: { size: fontSize } },
              grid: { color: chartTheme.line }
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              ...commonTooltip,
              callbacks: {
                label: (ctx) => formatStorageBytes(ctx.raw || 0)
              }
            }
          }
        }
      });
    } else {
      const top = (users || []).slice(0, 8);
      adminStorageCharts.top = new Chart(topEl, {
        type: "bar",
        data: {
          labels: top.map(u => {
            const name = String(u.username || "user");
            return name.length > 8 ? `${name.slice(0, 7)}…` : name;
          }),
          datasets: [
            {
              label: "Text",
              data: top.map(u => Number(u.text_bytes) || 0),
              backgroundColor: "#2457d6"
            },
            {
              label: "Photos",
              data: top.map(u => Number(u.photo_bytes) || 0),
              backgroundColor: "#dc2626"
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: { padding: 2 },
          scales: {
            x: {
              stacked: true,
              ticks: { color: chartTheme.text, font: { size: fontSize }, maxRotation: 0, autoSkip: true },
              grid: { color: chartTheme.line }
            },
            y: {
              stacked: true,
              ticks: {
                color: chartTheme.muted,
                font: { size: fontSize },
                callback: (v) => formatStorageBytes(v)
              },
              grid: { color: chartTheme.line }
            }
          },
          plugins: {
            legend: {
              position: "bottom",
              labels: commonLegend
            },
            tooltip: {
              ...commonTooltip,
              callbacks: {
                label: (ctx) => `${ctx.dataset.label}: ${formatStorageBytes(ctx.raw || 0)}`
              }
            }
          }
        }
      });
    }
  }
}

let adminPhotoCompressState = {
  userId: "",
  username: "",
  photos: [],
  previews: {},
  selected: {},
  objectUrls: []
};

function adminPhotoPublicUrl(path){
  const p = String(path || "").replace(/^\/+/, "").trim();
  if (!p) return "";
  const dbConfig = getSupabaseConfig();
  return `${dbConfig.supabaseUrl}/storage/v1/object/public/company-logos/${p}`;
}

function adminPhotoResolveSrc(photo){
  const url = String(photo?.url || "").trim();
  if (url) return url;
  return adminPhotoPublicUrl(photo?.path);
}

function adminPhotoRevokeObjectUrls(){
  (adminPhotoCompressState.objectUrls || []).forEach(u => {
    try { URL.revokeObjectURL(u); } catch (_) {}
  });
  adminPhotoCompressState.objectUrls = [];
}

function adminPhotoTrackObjectUrl(url){
  if (url && String(url).startsWith("blob:")) {
    adminPhotoCompressState.objectUrls.push(url);
  }
  return url;
}

function dataUrlToFile(dataUrl, name = "photo.jpg"){
  const str = String(dataUrl || "");
  const comma = str.indexOf(",");
  if (comma < 0) throw new Error("Invalid image data.");
  const header = str.slice(0, comma);
  const b64 = str.slice(comma + 1);
  const mime = (header.match(/:(.*?);/) || [])[1] || "image/jpeg";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  try {
    return new File([arr], name, { type: mime, lastModified: Date.now() });
  } catch {
    const blob = new Blob([arr], { type: mime });
    blob.name = name;
    return blob;
  }
}

async function blobToDataUrl(blob){
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read image."));
    reader.readAsDataURL(blob);
  });
}

async function fetchAdminPhotoAsFile(photo){
  const src = adminPhotoResolveSrc(photo);
  if (!src) throw new Error("Photo URL missing.");
  const baseName = String(photo.path || photo.label || "photo").split("/").pop() || "photo.jpg";
  if (src.startsWith("data:image/")) {
    return dataUrlToFile(src, baseName);
  }
  const res = await fetch(src, { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not load photo (${res.status}).`);
  const blob = await res.blob();
  const type = blob.type || photo.mime || "image/jpeg";
  try {
    return new File([blob], baseName, { type, lastModified: Date.now() });
  } catch {
    blob.name = baseName;
    return blob;
  }
}

async function compressAdminPhotoFile(file){
  if (typeof compressImageFileForUpload !== "function") {
    throw new Error("Image compression helper is unavailable.");
  }
  let input = file;
  const type = String(file.type || "").toLowerCase();
  if (!type.startsWith("image/") || type === "image/*" || type === "application/octet-stream") {
    const name = String(file.name || "").toLowerCase();
    const inferred = name.endsWith(".png") ? "image/png"
      : name.endsWith(".webp") ? "image/webp"
      : name.endsWith(".gif") ? "image/gif"
      : (name.endsWith(".jpg") || name.endsWith(".jpeg")) ? "image/jpeg"
      : "";
    if (inferred) {
      try {
        input = new File([file], file.name || "photo", { type: inferred, lastModified: Date.now() });
      } catch {
        const blob = file.slice(0, file.size, inferred);
        blob.name = file.name || "photo";
        input = blob;
      }
    }
  }

  // Multi-pass: keep trying smaller edges / lower quality while preserving format (PNG alpha stays PNG).
  const passes = [
    { maxEdge: 1280, quality: 0.82 },
    { maxEdge: 960, quality: 0.78 },
    { maxEdge: 720, quality: 0.72 },
    { maxEdge: 640, quality: 0.68 },
    { maxEdge: 512, quality: 0.64 }
  ];
  const origSize = Number(input.size) || 0;
  let best = null;
  for (const pass of passes) {
    const blob = await compressImageFileForUpload(input, {
      maxEdge: pass.maxEdge,
      quality: pass.quality,
      preferJpeg: false,
      preserveFormat: true
    });
    if (!blob || !blob.size) continue;
    if (!best || blob.size < best.size) best = blob;
    // Stop early when we already got a meaningful shrink
    if (origSize > 0 && blob.size < origSize * 0.92) break;
  }
  if (!best || !best.size) throw new Error("Compression produced no image.");
  return best;
}

async function upsertAdminStoragePhoto(path, blob){
  const p = String(path || "").replace(/^\/+/, "").trim();
  if (!p) throw new Error("Storage path missing.");
  if (!blob) throw new Error("Compressed image missing.");
  const dbConfig = getSupabaseConfig();
  const uploadUrl = `${dbConfig.supabaseUrl}/storage/v1/object/company-logos/${p}`;
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      apikey: dbConfig.supabaseKey,
      Authorization: `Bearer ${dbConfig.supabaseKey}`,
      "Content-Type": blob.type || "image/jpeg",
      "x-upsert": "true"
    },
    body: blob
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Storage overwrite failed (${res.status})`);
  }
  return adminPhotoPublicUrl(p);
}

async function applyAdminCompressedPhoto(photo, preview){
  const userId = adminPhotoCompressState.userId;
  const source = String(photo.source || "").toLowerCase();
  const path = String(photo.path || "").trim();
  const oldUrl = String(photo.url || "").trim();
  const blob = preview?.blob;
  if (!blob) throw new Error("Compress first.");

  let newUrl = "";
  if (path) {
    newUrl = await upsertAdminStoragePhoto(path, blob);
  } else {
    newUrl = preview.dataUrl || await blobToDataUrl(blob);
  }

  if (source === "profile" || source === "expense_account") {
    const needsDbReplace = !path
      || oldUrl.startsWith("data:")
      || (oldUrl && path && !oldUrl.includes(path));
    if (needsDbReplace || !path) {
      await supabaseRpc("app_admin_replace_photo_url", {
        p_user_id: userId,
        p_source: source,
        p_ref_id: photo.ref_id || null,
        p_old_url: oldUrl || null,
        p_new_url: path ? adminPhotoPublicUrl(path) : newUrl
      });
    }
  } else if (source === "storage") {
    // Path overwrite is enough — public URL stays the same.
  } else if (path) {
    // Unknown source with storage path: overwrite only.
  } else {
    throw new Error("Unsupported photo source.");
  }

  photo.bytes = blob.size;
  if (!path && newUrl) photo.url = newUrl;
  return true;
}

function renderAdminPhotoCompressList(modal){
  const list = modal.querySelector("#adminPhotoCompressList");
  if (!list) return;
  const photos = adminPhotoCompressState.photos || [];
  if (!photos.length) {
    list.innerHTML = `<div class="empty">No photos found for this user.</div>`;
    return;
  }
  list.innerHTML = photos.map((photo, idx) => {
    const preview = adminPhotoCompressState.previews[photo.id] || null;
    const src = adminPhotoResolveSrc(photo);
    const origBytes = Number(preview?.origBytes ?? photo.bytes) || 0;
    const done = !!preview?.applied;
    const hasPreview = !!preview?.compressedUrl;
    const selected = !!adminPhotoCompressState.selected[photo.id];
    const savePct = hasPreview && origBytes > 0
      ? Math.max(0, Math.round((1 - (preview.bytes / origBytes)) * 100))
      : 0;
    return `
      <div class="admin-photo-item${done ? " is-done" : ""}${selected ? " is-selected" : ""}" data-photo-idx="${idx}">
        <div class="admin-photo-item-top">
          <label class="admin-photo-select">
            <input type="checkbox" data-photo-select="${idx}" ${selected ? "checked" : ""} ${done ? "disabled" : ""} />
            <span class="admin-photo-item-meta">
              <strong>${escapeHtml(photo.label || "Photo")}</strong>
              <span>${escapeHtml(photo.source || "")}${origBytes ? ` · ${escapeHtml(formatStorageBytes(origBytes))}` : ""}</span>
            </span>
          </label>
          <div class="admin-photo-item-actions">
            ${!hasPreview && !done ? `
              <button type="button" class="btn soft tiny" data-photo-compress-one="${idx}">
                <i class="fa-solid fa-compress" aria-hidden="true"></i> Compress
              </button>` : ""}
            ${hasPreview && !done ? `
              <button type="button" class="btn primary tiny" data-photo-apply-one="${idx}">
                Update
              </button>
              <button type="button" class="btn ghost tiny" data-photo-discard-one="${idx}">
                Discard
              </button>` : ""}
            ${done ? `<span class="admin-photo-compress-hint">Saved in place</span>` : ""}
          </div>
        </div>
        ${hasPreview ? `
          <div class="admin-photo-compare">
            <div class="admin-photo-pane">
              <span>Original</span>
              <img src="${escapeHtml(preview.originalUrl || src)}" alt="Original" loading="lazy" />
              <strong>${escapeHtml(formatStorageBytes(origBytes))}</strong>
            </div>
            <div class="admin-photo-pane">
              <span>Compressed${savePct ? ` (−${savePct}%)` : (preview.noSavings ? " (same size)" : "")}</span>
              <img src="${escapeHtml(preview.compressedUrl)}" alt="Compressed" loading="lazy" />
              <strong>${escapeHtml(formatStorageBytes(preview.bytes))}</strong>
            </div>
          </div>` : (src ? `
          <div class="admin-photo-compare" style="grid-template-columns:1fr">
            <div class="admin-photo-pane">
              <span>Current</span>
              <img src="${escapeHtml(src)}" alt="Current photo" loading="lazy" />
              <strong>${escapeHtml(formatStorageBytes(origBytes))}</strong>
            </div>
          </div>` : "")}
      </div>`;
  }).join("");

  list.querySelectorAll("[data-photo-select]").forEach(input => {
    input.onchange = () => {
      const idx = Number(input.getAttribute("data-photo-select"));
      const photo = adminPhotoCompressState.photos[idx];
      if (!photo) return;
      if (input.checked) adminPhotoCompressState.selected[photo.id] = true;
      else delete adminPhotoCompressState.selected[photo.id];
      const item = input.closest(".admin-photo-item");
      if (item) item.classList.toggle("is-selected", input.checked);
      updateAdminPhotoCompressHint(modal);
      syncAdminPhotoSelectAll(modal);
    };
  });
  list.querySelectorAll("[data-photo-compress-one]").forEach(btn => {
    btn.onclick = async () => {
      const idx = Number(btn.getAttribute("data-photo-compress-one"));
      const photo = adminPhotoCompressState.photos[idx];
      if (photo) adminPhotoCompressState.selected[photo.id] = true;
      await compressAdminPhotoAtIndex(modal, idx);
    };
  });
  list.querySelectorAll("[data-photo-apply-one]").forEach(btn => {
    btn.onclick = async () => {
      const idx = Number(btn.getAttribute("data-photo-apply-one"));
      await applyAdminPhotoAtIndex(modal, idx);
    };
  });
  list.querySelectorAll("[data-photo-discard-one]").forEach(btn => {
    btn.onclick = () => {
      const idx = Number(btn.getAttribute("data-photo-discard-one"));
      const photo = adminPhotoCompressState.photos[idx];
      if (!photo) return;
      const prev = adminPhotoCompressState.previews[photo.id];
      if (prev?.compressedUrl) {
        try { URL.revokeObjectURL(prev.compressedUrl); } catch (_) {}
      }
      delete adminPhotoCompressState.previews[photo.id];
      renderAdminPhotoCompressList(modal);
      updateAdminPhotoCompressHint(modal);
      syncAdminPhotoSelectAll(modal);
    };
  });
  syncAdminPhotoSelectAll(modal);
}

function getAdminPhotoSelectedIndexes({ readyOnly = false, compressableOnly = false } = {}){
  const photos = adminPhotoCompressState.photos || [];
  const out = [];
  photos.forEach((photo, idx) => {
    if (!adminPhotoCompressState.selected[photo.id]) return;
    const preview = adminPhotoCompressState.previews[photo.id];
    if (preview?.applied) return;
    if (readyOnly && !(preview?.blob && !preview.applied)) return;
    if (compressableOnly && preview?.compressedUrl) return;
    out.push(idx);
  });
  return out;
}

function syncAdminPhotoSelectAll(modal){
  const master = modal.querySelector("#adminPhotoSelectAll");
  if (!master) return;
  const photos = (adminPhotoCompressState.photos || []).filter(p => !adminPhotoCompressState.previews[p.id]?.applied);
  if (!photos.length) {
    master.checked = false;
    master.indeterminate = false;
    master.disabled = true;
    return;
  }
  master.disabled = false;
  const selectedCount = photos.filter(p => adminPhotoCompressState.selected[p.id]).length;
  master.checked = selectedCount === photos.length;
  master.indeterminate = selectedCount > 0 && selectedCount < photos.length;
}

function updateAdminPhotoCompressHint(modal, text){
  const hint = modal.querySelector("#adminPhotoCompressHint");
  if (!hint) return;
  if (text) {
    hint.textContent = text;
    return;
  }
  const photos = adminPhotoCompressState.photos || [];
  const selected = photos.filter(p => adminPhotoCompressState.selected[p.id] && !adminPhotoCompressState.previews[p.id]?.applied).length;
  const pending = photos.filter(p => adminPhotoCompressState.previews[p.id]?.compressedUrl && !adminPhotoCompressState.previews[p.id]?.applied).length;
  const done = photos.filter(p => adminPhotoCompressState.previews[p.id]?.applied).length;
  hint.textContent = `${photos.length} photo${photos.length === 1 ? "" : "s"}${selected ? ` · ${selected} selected` : ""}${pending ? ` · ${pending} ready` : ""}${done ? ` · ${done} updated` : ""}`;
}

async function compressAdminPhotoAtIndex(modal, idx, { quiet } = {}){
  const photo = adminPhotoCompressState.photos[idx];
  if (!photo || adminPhotoCompressState.previews[photo.id]?.applied) return false;
  const hint = modal.querySelector("#adminPhotoCompressHint");
  try {
    if (!quiet && hint) hint.textContent = `Compressing ${photo.label || "photo"}…`;
    const file = await fetchAdminPhotoAsFile(photo);
    const origBytes = file.size || Number(photo.bytes) || 0;
    const blob = await compressAdminPhotoFile(file);
    const compressedUrl = adminPhotoTrackObjectUrl(URL.createObjectURL(blob));
    const originalUrl = adminPhotoResolveSrc(photo);
    const dataUrl = (!String(photo.path || "").trim())
      ? await blobToDataUrl(blob)
      : "";
    const saved = origBytes > 0 ? Math.max(0, origBytes - blob.size) : 0;
    adminPhotoCompressState.previews[photo.id] = {
      blob,
      bytes: blob.size,
      origBytes,
      compressedUrl,
      originalUrl,
      dataUrl,
      applied: false,
      noSavings: origBytes > 0 && blob.size >= origBytes
    };
    renderAdminPhotoCompressList(modal);
    if (!quiet) {
      updateAdminPhotoCompressHint(
        modal,
        saved > 0
          ? `Ready — saves ${formatStorageBytes(saved)}. Review, then Update.`
          : "Ready — little/no size change. You can still Update to apply."
      );
    } else {
      updateAdminPhotoCompressHint(modal);
    }
    return true;
  } catch (err) {
    if (!quiet) {
      updateAdminPhotoCompressHint(modal, err.message || "Compression failed.");
      alert(err.message || "Compression failed.");
    }
    return false;
  }
}

async function applyAdminPhotoAtIndex(modal, idx){
  const photo = adminPhotoCompressState.photos[idx];
  const preview = photo ? adminPhotoCompressState.previews[photo.id] : null;
  if (!photo || !preview?.blob) return;
  const hint = modal.querySelector("#adminPhotoCompressHint");
  try {
    if (hint) hint.textContent = `Updating ${photo.label || "photo"}…`;
    await applyAdminCompressedPhoto(photo, preview);
    preview.applied = true;
    delete adminPhotoCompressState.selected[photo.id];
    renderAdminPhotoCompressList(modal);
    updateAdminPhotoCompressHint(modal);
  } catch (err) {
    updateAdminPhotoCompressHint(modal, err.message || "Update failed.");
    alert(err.message || "Update failed.");
  }
}

async function openAdminPhotoCompressModal(user, storageModal){
  const userId = user?.id;
  if (!userId) return;
  adminPhotoRevokeObjectUrls();
  adminPhotoCompressState = {
    userId: String(userId),
    username: user.username || "",
    photos: [],
    previews: {},
    selected: {},
    objectUrls: []
  };

  let modal = document.getElementById("adminPhotoCompressModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "adminPhotoCompressModal";
    modal.className = "modal hide";
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="modal-backdrop" data-photo-compress-close></div>
    <div class="modal-dialog admin-modal-dialog admin-photo-compress-dialog" role="dialog" aria-modal="true" aria-labelledby="adminPhotoCompressTitle">
      <div class="modal-head">
        <div>
          <h3 id="adminPhotoCompressTitle">Compress photos</h3>
          <p>@${escapeHtml(user.username || "user")} — select photos, preview, then update</p>
        </div>
        <button type="button" class="btn ghost tiny" data-photo-compress-close aria-label="Close">✕</button>
      </div>
      <div class="modal-body admin-photo-compress-body">
        <div class="admin-photo-compress-toolbar">
          <label class="admin-photo-select-all">
            <input type="checkbox" id="adminPhotoSelectAll" />
            <span>Select all</span>
          </label>
          <button type="button" class="btn soft tiny" id="adminPhotoCompressSelectedBtn">
            <i class="fa-solid fa-compress" aria-hidden="true"></i> Compress selected
          </button>
          <button type="button" class="btn primary tiny" id="adminPhotoApplySelectedBtn">Update selected</button>
          <p class="admin-photo-compress-hint" id="adminPhotoCompressHint">Loading…</p>
        </div>
        <div class="admin-photo-compress-list" id="adminPhotoCompressList">
          <div class="empty"><i class="fa-solid fa-spinner btn-loader"></i> Loading photos…</div>
        </div>
      </div>
    </div>`;

  const close = () => {
    adminPhotoRevokeObjectUrls();
    modal.classList.add("hide");
    modal.setAttribute("aria-hidden", "true");
    if (storageModal && typeof loadAdminStorageUsage === "function") {
      loadAdminStorageUsage(storageModal).catch(() => {});
    }
  };
  modal.querySelectorAll("[data-photo-compress-close]").forEach(el => { el.onclick = close; });
  modal.querySelector("#adminPhotoSelectAll").onchange = (e) => {
    const on = !!e.target.checked;
    (adminPhotoCompressState.photos || []).forEach(photo => {
      if (adminPhotoCompressState.previews[photo.id]?.applied) return;
      if (on) adminPhotoCompressState.selected[photo.id] = true;
      else delete adminPhotoCompressState.selected[photo.id];
    });
    renderAdminPhotoCompressList(modal);
    updateAdminPhotoCompressHint(modal);
  };
  modal.querySelector("#adminPhotoCompressSelectedBtn").onclick = async () => {
    const indexes = getAdminPhotoSelectedIndexes();
    if (!indexes.length) {
      updateAdminPhotoCompressHint(modal, "Select one or more photos first.");
      return;
    }
    let ok = 0;
    let skip = 0;
    for (const i of indexes) {
      const photo = adminPhotoCompressState.photos[i];
      if (adminPhotoCompressState.previews[photo.id]?.compressedUrl) { ok += 1; continue; }
      const did = await compressAdminPhotoAtIndex(modal, i, { quiet: true });
      if (did) ok += 1;
      else skip += 1;
    }
    updateAdminPhotoCompressHint(modal, skip
      ? `Compressed ${ok}. ${skip} failed to process.`
      : `Compressed ${ok} photo${ok === 1 ? "" : "s"}. Review, then Update selected.`);
  };
  modal.querySelector("#adminPhotoApplySelectedBtn").onclick = async () => {
    const indexes = getAdminPhotoSelectedIndexes({ readyOnly: true });
    if (!indexes.length) {
      updateAdminPhotoCompressHint(modal, "Select compressed photos ready to update.");
      return;
    }
    let n = 0;
    for (const i of indexes) {
      const photo = adminPhotoCompressState.photos[i];
      const preview = adminPhotoCompressState.previews[photo.id];
      if (!preview?.blob || preview.applied) continue;
      try {
        await applyAdminCompressedPhoto(photo, preview);
        preview.applied = true;
        delete adminPhotoCompressState.selected[photo.id];
        n += 1;
      } catch (err) {
        updateAdminPhotoCompressHint(modal, err.message || "Update failed.");
        alert(err.message || "Update failed.");
        renderAdminPhotoCompressList(modal);
        return;
      }
    }
    renderAdminPhotoCompressList(modal);
    updateAdminPhotoCompressHint(modal, n ? `Updated ${n} photo${n === 1 ? "" : "s"} in place.` : "Nothing ready to update.");
  };

  modal.classList.remove("hide");
  modal.setAttribute("aria-hidden", "false");

  try {
    const data = await supabaseRpc("app_admin_list_user_photos", { p_user_id: userId });
    adminPhotoCompressState.photos = Array.isArray(data?.photos) ? data.photos : [];
    renderAdminPhotoCompressList(modal);
    updateAdminPhotoCompressHint(modal);
  } catch (err) {
    const list = modal.querySelector("#adminPhotoCompressList");
    if (list) {
      list.innerHTML = `<div class="empty">${escapeHtml(err.message || "Could not load photos. Run migration 080_fix_admin_list_user_photos_account_name.sql.")}</div>`;
    }
    updateAdminPhotoCompressHint(modal, "Failed to load");
  }
}

let adminCommsPollTimer = null;
const adminCommsState = {
  notifications: [],
  inquiryPreview: [],
  unreadNotifications: 0,
  unreadInquiries: 0
};

// Migration 100 — Live Chat Support routing settings.
(() => {
  const ensureModal = () => {
    let modal = document.getElementById("adminLiveChatAgentsModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "adminLiveChatAgentsModal";
    modal.className = "modal hide";
    document.body.appendChild(modal);
    return modal;
  };

  async function openAdminLiveChatAgentsModal(){
    const modal = ensureModal();
    modal.innerHTML = `
      <div class="modal-backdrop" data-live-agent-close></div>
      <div class="modal-dialog settings-sheet admin-live-agent-sheet" role="dialog" aria-modal="true" aria-labelledby="adminLiveAgentTitle">
        <div class="settings-sheet-head">
          <div>
            <h3 id="adminLiveAgentTitle"><i class="fa-solid fa-headset" aria-hidden="true"></i> Live Chat Support</h3>
            <p>Assign trusted Triplem VIP users to the live-support queue.</p>
          </div>
          <button type="button" class="btn ghost tiny" data-live-agent-close aria-label="Close">✕</button>
        </div>
        <div class="modal-body settings-sheet-body admin-live-agent-body">
          <section class="admin-aziz-mode" id="adminAzizModeCard">
            <div class="admin-aziz-mode-icon"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i></div>
            <div class="admin-aziz-mode-copy"><span>Visitor AI assistance</span><strong>Aziz</strong><small id="adminAzizModeDetail">Loading current support mode…</small></div>
            <label class="admin-aziz-switch" title="Turn Aziz AI visitor support on or off">
              <input id="adminAzizSupportToggle" type="checkbox" aria-label="Enable Aziz AI visitor support" />
              <span aria-hidden="true"></span>
            </label>
          </section>
          <div class="admin-aziz-mode-note"><i class="fa-solid fa-circle-info" aria-hidden="true"></i><span>When Aziz is ON, new website visitor chats use Aziz AI. Your current human Live Chat routing below is preserved and resumes unchanged when Aziz is turned OFF.</span></div>
          <div class="admin-live-agent-info">
            <i class="fa-solid fa-shield-halved" aria-hidden="true"></i>
            <p>New landing-page chats remain visible to Admin until an assigned support user accepts them. After acceptance, the handoff is internal and the visitor continues seeing only Triplem VIP Support.</p>
          </div>
          <div id="adminLiveAgentList" class="admin-live-agent-list"><div class="empty">Loading users…</div></div>
          <p id="adminLiveAgentError" class="lock-error"></p>
          <div class="admin-live-agent-actions">
            <span id="adminLiveAgentCount" class="help">0 support users selected</span>
            <div><button type="button" class="btn ghost tiny" data-live-agent-close>Cancel</button><button type="button" class="btn primary tiny" id="adminLiveAgentSave"><i class="fa-solid fa-check"></i> Save routing</button></div>
          </div>
        </div>
      </div>`;

    const close = () => {
      modal.classList.add("hide");
      modal.setAttribute("aria-hidden", "true");
    };
    modal.querySelectorAll("[data-live-agent-close]").forEach(el => { el.onclick = close; });
    modal.classList.remove("hide");
    modal.setAttribute("aria-hidden", "false");

    const list = modal.querySelector("#adminLiveAgentList");
    const count = modal.querySelector("#adminLiveAgentCount");
    const error = modal.querySelector("#adminLiveAgentError");
    const azizToggle = modal.querySelector("#adminAzizSupportToggle");
    const azizDetail = modal.querySelector("#adminAzizModeDetail");
    const azizCard = modal.querySelector("#adminAzizModeCard");
    const setAzizVisual = (enabled) => {
      const on = enabled === true;
      if (azizToggle) azizToggle.checked = on;
      azizCard?.classList.toggle("is-enabled", on);
      if (azizDetail) azizDetail.textContent = on ? "Aziz is handling new visitor support chats." : "Current Live Chat Support is active.";
    };
    const updateCount = () => {
      const n = modal.querySelectorAll('[data-live-agent-user]:checked').length;
      if (count) count.textContent = n ? `${n} support user${n === 1 ? "" : "s"} selected` : "Admin handles all live chats";
    };

    try {
      const [data, aiData] = await Promise.all([
        supabaseRpc("app_admin_live_chat_agent_settings", {}),
        supabaseRpc("app_admin_live_chat_ai_settings", {}).catch(() => ({ aziz_enabled:false }))
      ]);
      setAzizVisual(aiData?.aziz_enabled === true);
      const rows = Array.isArray(data?.items) ? data.items : [];
      if (!rows.length) {
        list.innerHTML = `<div class="empty">No active users are available for assignment.</div>`;
      } else {
        list.innerHTML = rows.map(u => `
          <label class="admin-live-agent-row">
            <input type="checkbox" data-live-agent-user value="${escapeHtml(String(u.id || ""))}" ${u.enabled ? "checked" : ""} />
            <span class="admin-live-agent-avatar">${adminUserLogoImage(u, "admin-live-agent-logo")}</span>
            <span class="admin-live-agent-copy"><strong>${escapeHtml(u.display_name || u.username || "User")}</strong><small>@${escapeHtml(u.username || "user")}${u.role === "admin" ? " · admin" : ""}</small></span>
            <span class="admin-live-agent-state">${u.enabled ? "Assigned" : "Available"}</span>
          </label>`).join("");
        list.querySelectorAll('[data-live-agent-user]').forEach(input => input.addEventListener("change", updateCount));
      }
      updateCount();
    } catch (ex) {
      list.innerHTML = `<div class="empty">${escapeHtml(ex.message || "Could not load live-chat users.")}</div>`;
    }

    if (azizToggle) azizToggle.addEventListener("change", async () => {
      const requested = azizToggle.checked === true;
      azizToggle.disabled = true;
      if (error) { error.textContent = ""; error.classList.remove("show"); }
      try {
        const result = await supabaseRpc("app_admin_set_live_chat_ai_enabled", { p_enabled: requested });
        setAzizVisual(result?.aziz_enabled === true);
        if (typeof showEntryConfirmation === "function") showEntryConfirmation(result?.aziz_enabled === true ? "Aziz AI visitor support is now ON." : "Current Live Chat Support is restored.", "success", { duration:2200 });
      } catch (ex) {
        setAzizVisual(!requested);
        if (error) { error.textContent = ex.message || "Could not update Aziz support mode."; error.classList.add("show"); }
      } finally { azizToggle.disabled = false; }
    });

    modal.querySelector("#adminLiveAgentSave").onclick = async (e) => {
      const btn = e.currentTarget;
      try {
        btn.disabled = true;
        if (error) { error.textContent = ""; error.classList.remove("show"); }
        const ids = Array.from(modal.querySelectorAll('[data-live-agent-user]:checked')).map(el => el.value).filter(Boolean);
        const result = await supabaseRpc("app_admin_set_live_chat_agents", { p_user_ids: ids });
        if (count) count.textContent = Number(result?.enabled_count || 0) > 0
          ? `${result.enabled_count} support user${Number(result.enabled_count) === 1 ? "" : "s"} assigned`
          : "Admin handles all live chats";
        setTimeout(close, 450);
      } catch (ex) {
        if (error) { error.textContent = ex.message || "Could not save live-chat routing."; error.classList.add("show"); }
      } finally { btn.disabled = false; }
    };
  }

  const bind = () => {
    const btn = document.getElementById("adminLiveChatAgentsBtn");
    if (btn && !btn.dataset.liveChatBound) {
      btn.dataset.liveChatBound = "1";
      btn.addEventListener("click", () => openAdminLiveChatAgentsModal().catch(err => alert(err.message || "Could not open Live Chat settings.")));
    }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, { once: true });
  else bind();
  window.openAdminLiveChatAgentsModal = openAdminLiveChatAgentsModal;
})();

// Migration 101 — Admin Live Chat records, transcript review, and explicit permanent deletion.
(() => {
  const fmt = (value) => {
    if (!value) return "—";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  };
  const liveRecordLifecycleEvent = (message) => {
    const body = String(message?.body || "").trim();
    if (!body) return null;
    const role = String(message?.sender_role || "").toLowerCase();
    const automated = role !== "guest" && !message?.sender_id;
    if (!automated) return null;
    const rules = [
      [/^this live chat has (?:now )?closed(?: due to inactivity)?[.!]?/i, "Chat closed", "fa-circle-check"],
      [/^we have not heard back from you yet[.!]?/i, "Inactivity notice", "fa-clock"],
      [/^this live chat (?:has|was) ended(?: by .+)?[.!]?/i, "Chat ended", "fa-circle-check"],
      [/^the visitor left triplem vip[.!]?/i, "Visitor left website", "fa-person-walking-arrow-right"],
      [/^this conversation has (?:been )?transferred/i, "Support transfer", "fa-right-left"],
      [/^a (?:real )?triplem vip support agent/i, "Agent update", "fa-headset"]
    ];
    for (const [pattern, label, icon] of rules) {
      if (pattern.test(body)) return { label, icon, body };
    }
    return null;
  };
  const ensureRecordsModal = () => {
    let modal = document.getElementById("adminLiveChatRecordsModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "adminLiveChatRecordsModal";
    modal.className = "modal hide";
    modal.setAttribute("aria-hidden", "true");
    document.body.appendChild(modal);
    return modal;
  };
  const ensureTranscriptModal = () => {
    let modal = document.getElementById("adminLiveChatTranscriptModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "adminLiveChatTranscriptModal";
    modal.className = "modal hide";
    modal.setAttribute("aria-hidden", "true");
    document.body.appendChild(modal);
    return modal;
  };

  const liveRecordPdfText = (value) => String(value ?? "")
    .replace(/\u00a0/g, " ").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-").replace(/\u2026/g, "...").replace(/\s+/g, " ").trim();

  const liveRecordNeedsBrowserUnicodePdf = (data) => {
    const rows = Array.isArray(data?.messages) ? data.messages : [];
    const chat = data?.chat || {};
    const combined = [chat.guest_name, chat.guest_email, chat.guest_phone, ...rows.map(row => row?.body), ...rows.map(row => row?.sender_name)].join("\n");
    // Hebrew/Arabic-family presentation ranges include Urdu/Persian/Arabic.
    return /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u.test(combined);
  };

  const ensureLiveRecordHtml2Canvas = async () => {
    if (typeof window.html2canvas === "function") return window.html2canvas;
    throw new Error("Unicode PDF renderer is unavailable. Please hard-refresh Triplem VIP and try again.");
  };

  async function createAdminLiveChatUnicodePdf(data) {
    if (!window.jspdf?.jsPDF) throw new Error("PDF generator is unavailable. Please refresh the page and try again.");
    const html2canvas = await ensureLiveRecordHtml2Canvas();
    const { jsPDF } = window.jspdf;
    const chat = data?.chat || {};
    const messages = Array.isArray(data?.messages) ? data.messages : [];
    const transfers = Array.isArray(data?.transfers) ? data.transfers : [];
    const representative = chat.agent_name || (String(chat.support_mode || "").toLowerCase() === "aziz" ? "Aziz" : "Admin / unassigned");
    const representativeTitle = String(chat.support_mode || "").toLowerCase() === "aziz" && !chat.agent_id ? "AI" : chat.agent_id || chat.agent_name ? "Agent" : "Triplem VIP";
    const status = chat.routing_status || chat.support_mode || chat.status || "open";
    const endedBy = chat.closed_by
      ? (String(chat.closed_by).toLowerCase() === "visitor" ? `Visitor · ${chat.closed_by_name || chat.guest_name || "Visitor"}`
        : String(chat.closed_by).toLowerCase() === "agent" ? `Agent · ${chat.closed_by_name || representative}`
        : `Triplem VIP · ${chat.closed_by_name || "System"}`)
      : "";

    const host = document.createElement("div");
    host.className = "admin-live-chat-pdf-render-host";
    Object.assign(host.style, {
      position: "fixed", left: "-12000px", top: "0", width: "794px", zIndex: "-1",
      background: "#eef2f7", fontFamily: '"Segoe UI", Tahoma, Arial, sans-serif',
      fontKerning: "normal", textRendering: "optimizeLegibility"
    });
    document.body.appendChild(host);

    const pages = [];
    const pageHeight = 1123;
    const pageWidth = 794;
    const contentHeight = 1008;
    const escText = value => String(value ?? "");
    const actorInfo = (m) => {
      const actor = String(m?.message_actor || "").toLowerCase();
      const supportActor = String(m?.support_actor || "").toLowerCase();
      const role = String(m?.sender_role || "").toLowerCase();
      if (role === "guest" || actor === "visitor") return { label: m.sender_name || chat.guest_name || "Visitor", title: "Visitor", bg: "#edf4ff", accent: "#2457d6" };
      if (supportActor === "aziz" || actor === "ai" || m?.is_ai) return { label: "Aziz", title: "AI", bg: "#f4f0ff", accent: "#704ac6" };
      if (actor === "agent" || m?.sender_id) return { label: m.sender_name || representative || "Support Agent", title: "Agent", bg: "#edf9f4", accent: "#1c845d" };
      return { label: m.sender_name || "Triplem VIP Support", title: "Triplem VIP", bg: "#f5f7fa", accent: "#64748b" };
    };

    const makePage = (first = false) => {
      const page = document.createElement("section");
      page.className = "admin-live-chat-pdf-page";
      Object.assign(page.style, {
        position: "relative", width: `${pageWidth}px`, height: `${pageHeight}px`, boxSizing: "border-box",
        padding: "42px 54px 52px", background: "#ffffff", color: "#182234", overflow: "hidden"
      });
      const content = document.createElement("div");
      Object.assign(content.style, { height: `${contentHeight}px`, overflow: "hidden", boxSizing: "border-box" });
      page.appendChild(content);
      const footer = document.createElement("div");
      footer.className = "admin-live-chat-pdf-footer";
      Object.assign(footer.style, {
        position: "absolute", left: "54px", right: "54px", bottom: "24px", height: "22px",
        borderTop: "1px solid #e2e8f0", paddingTop: "9px", display: "flex", justifyContent: "space-between",
        color: "#64748b", fontSize: "10px", lineHeight: "1"
      });
      footer.innerHTML = `<span>Triplem VIP | Confidential support transcript</span><span data-pdf-page-number></span>`;
      page.appendChild(footer);
      host.appendChild(page);
      pages.push({ page, content, footer, first });
      if (!first) {
        const compact = document.createElement("div");
        compact.innerHTML = `<div style="font-weight:850;font-size:12px;color:#2457d6;letter-spacing:.04em">TRIPLEM VIP | LIVE CHAT TRANSCRIPT</div><div style="height:1px;background:#e2e8f0;margin:9px 0 16px"></div>`;
        content.appendChild(compact);
      }
      return pages[pages.length - 1];
    };

    let current = makePage(true);
    const appendIfFits = (node) => {
      current.content.appendChild(node);
      if (current.content.scrollHeight <= current.content.clientHeight + 1) return true;
      current.content.removeChild(node);
      return false;
    };
    const newContinuationPage = () => { current = makePage(false); return current; };

    const header = document.createElement("div");
    header.innerHTML = `
      <div style="display:flex;align-items:center;gap:18px;padding:18px 20px;background:#f7f9fd;border-radius:15px">
        <img src="Assets/logo/logo.png" alt="Triplem VIP" style="width:76px;height:46px;object-fit:contain;flex:0 0 auto" />
        <div><div style="font-size:25px;font-weight:900;color:#2457d6;line-height:1.05">Live Chat Transcript</div>
        <div style="font-size:12px;color:#64748b;margin-top:6px">Permanent Triplem VIP support record</div>
        <div style="font-size:11px;color:#64748b;margin-top:4px">Generated ${escText(fmt(new Date().toISOString()))}</div></div>
      </div>`;
    current.content.appendChild(header);

    const summary = document.createElement("div");
    Object.assign(summary.style, { marginTop: "18px", padding: "15px 17px", background: "#fafbfd", borderRadius: "12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "13px 24px" });
    const summaryRows = [
      ["Visitor", chat.guest_name || "Visitor"],
      ["Contact", [chat.guest_email, chat.guest_phone].filter(Boolean).join(" | ") || "No contact details"],
      ["Representative", `${representativeTitle} | ${representative}`],
      ["Status", status],
      ...(endedBy ? [["Ended by", endedBy], ["Ended at", fmt(chat.closed_at) || "-"]] : [])
    ];
    for (const [label, value] of summaryRows) {
      const cell = document.createElement("div");
      cell.innerHTML = `<div style="font-size:9px;font-weight:850;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-bottom:4px">${label}</div>`;
      const valueNode = document.createElement("div");
      valueNode.textContent = escText(value || "-");
      Object.assign(valueNode.style, { fontSize: "12px", fontWeight: "780", color: "#182234", overflowWrap: "anywhere", wordBreak: "break-word" });
      cell.appendChild(valueNode); summary.appendChild(cell);
    }
    current.content.appendChild(summary);

    const conversationTitle = document.createElement("div");
    conversationTitle.textContent = "Conversation";
    Object.assign(conversationTitle.style, { margin: "19px 0 10px", color: "#2457d6", fontSize: "14px", fontWeight: "900" });
    current.content.appendChild(conversationTitle);

    const makeMessageBlock = (m, text, continuation = false) => {
      const info = actorInfo(m);
      const block = document.createElement("article");
      Object.assign(block.style, {
        margin: "0 0 10px", padding: "10px 12px 11px 15px", borderRadius: "11px",
        background: info.bg, borderLeft: `4px solid ${info.accent}`, boxSizing: "border-box", breakInside: "avoid"
      });
      const meta = document.createElement("div");
      Object.assign(meta.style, { display: "flex", alignItems: "center", gap: "8px", minWidth: "0", marginBottom: "7px" });
      const tag = document.createElement("span");
      tag.textContent = continuation ? "CONTINUED" : info.title.toUpperCase();
      Object.assign(tag.style, { flex: "0 0 auto", padding: "4px 7px", borderRadius: "6px", background: info.accent, color: "white", fontSize: "8px", fontWeight: "900", letterSpacing: ".04em" });
      const name = document.createElement("strong");
      name.textContent = continuation ? `${info.label} continued` : info.label;
      Object.assign(name.style, { minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: info.accent, fontSize: "11px" });
      const time = document.createElement("span");
      time.textContent = continuation ? "" : escText(fmt(m?.created_at));
      Object.assign(time.style, { marginLeft: "auto", flex: "0 0 auto", color: "#64748b", fontSize: "9px" });
      meta.append(tag, name, time);
      const body = document.createElement("div");
      body.textContent = escText(text);
      body.setAttribute("dir", "auto");
      body.setAttribute("lang", "und");
      Object.assign(body.style, {
        color: "#182234", fontSize: "12px", lineHeight: "1.58", whiteSpace: "pre-wrap",
        overflowWrap: "anywhere", wordBreak: "break-word", unicodeBidi: "plaintext", textAlign: "start",
        fontFamily: '"Segoe UI", Tahoma, Arial, sans-serif'
      });
      block.append(meta, body);
      return block;
    };

    const fitMessageText = (m, remainingText, continuation) => {
      const segments = remainingText.match(/\S+\s*/gu) || Array.from(remainingText || "");
      if (!segments.length) return { used: "", rest: "" };
      let lo = 1, hi = segments.length, best = 0;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const probe = makeMessageBlock(m, segments.slice(0, mid).join(""), continuation);
        current.content.appendChild(probe);
        const fits = current.content.scrollHeight <= current.content.clientHeight + 1;
        current.content.removeChild(probe);
        if (fits) { best = mid; lo = mid + 1; } else hi = mid - 1;
      }
      if (best < 1) return { used: "", rest: remainingText };
      return { used: segments.slice(0, best).join("").trimEnd(), rest: segments.slice(best).join("").trimStart() };
    };

    const renderMessage = (m) => {
      let remaining = escText(m?.body || "");
      if (!remaining.trim()) return;
      let continuation = false;
      while (remaining) {
        const full = makeMessageBlock(m, remaining, continuation);
        if (appendIfFits(full)) return;
        if (current.content.children.length > 2 || !current.first) newContinuationPage();
        const retryFull = makeMessageBlock(m, remaining, continuation);
        if (appendIfFits(retryFull)) return;
        const fitted = fitMessageText(m, remaining, continuation);
        if (!fitted.used) {
          // A single unbroken token can be wider/taller than a page. Binary-search
          // Unicode code points too, so even pathological Arabic/Urdu or pasted
          // identifiers are never appended beyond the printable page boundary.
          const chars = Array.from(remaining);
          let lo = 1, hi = chars.length, best = 0;
          while (lo <= hi) {
            const mid = Math.floor((lo + hi) / 2);
            const probe = makeMessageBlock(m, chars.slice(0, mid).join(""), continuation);
            current.content.appendChild(probe);
            const fits = current.content.scrollHeight <= current.content.clientHeight + 1;
            current.content.removeChild(probe);
            if (fits) { best = mid; lo = mid + 1; } else hi = mid - 1;
          }
          if (best < 1) {
            // A normal continuation page always has room for at least one glyph.
            // If layout metrics are temporarily unavailable, move to a fresh page
            // and retry instead of forcing overflowing content into the PDF.
            newContinuationPage();
            continue;
          }
          current.content.appendChild(makeMessageBlock(m, chars.slice(0, best).join(""), continuation));
          remaining = chars.slice(best).join("");
        } else {
          current.content.appendChild(makeMessageBlock(m, fitted.used, continuation));
          remaining = fitted.rest;
        }
        continuation = true;
        if (remaining) newContinuationPage();
      }
    };

    if (!messages.length) {
      const empty = document.createElement("div"); empty.textContent = "No messages were stored in this chat record.";
      Object.assign(empty.style, { color: "#64748b", fontSize: "12px", padding: "8px 0" }); current.content.appendChild(empty);
    } else messages.forEach(renderMessage);

    if (transfers.length) {
      const transferTitle = document.createElement("div"); transferTitle.textContent = "Support handoff history";
      Object.assign(transferTitle.style, { margin: "18px 0 9px", color: "#2457d6", fontSize: "13px", fontWeight: "900" });
      if (!appendIfFits(transferTitle)) { newContinuationPage(); current.content.appendChild(transferTitle); }
      transfers.forEach(t => {
        const row = document.createElement("div");
        Object.assign(row.style, { padding: "8px 10px", marginBottom: "6px", borderRadius: "8px", background: "#f7f9fc", fontSize: "10px", color: "#182234", overflowWrap: "anywhere" });
        row.textContent = `${t.from_name || "Support"}  >  ${t.to_name || "Support"}  |  ${t.status || "unknown"}  |  ${fmt(t.requested_at)}`;
        if (!appendIfFits(row)) { newContinuationPage(); current.content.appendChild(row); }
      });
    }

    pages.forEach((entry, index) => {
      const target = entry.footer.querySelector("[data-pdf-page-number]");
      if (target) target.textContent = `Page ${index + 1} of ${pages.length}`;
    });

    try {
      if (document.fonts?.ready) await document.fonts.ready.catch(() => {});
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
      for (let index = 0; index < pages.length; index++) {
        if (index > 0) doc.addPage();
        const canvas = await html2canvas(pages[index].page, {
          backgroundColor: "#ffffff", scale: 2, useCORS: true, logging: false,
          width: pageWidth, height: pageHeight, windowWidth: pageWidth, windowHeight: pageHeight
        });
        const image = canvas.toDataURL("image/jpeg", 0.94);
        doc.addImage(image, "JPEG", 0, 0, 210, 297, undefined, "FAST");
      }
      const safeName = liveRecordPdfText(chat.guest_name || "Visitor").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "Visitor";
      const date = new Date(chat.created_at || Date.now()).toISOString().slice(0, 10);
      doc.save(`Triplem-VIP-Live-Chat-${safeName}-${date}.pdf`);
    } finally {
      host.remove();
    }
  }

  async function createAdminLiveChatPdf(data) {
    if (liveRecordNeedsBrowserUnicodePdf(data)) return createAdminLiveChatUnicodePdf(data);
    if (!window.jspdf?.jsPDF) throw new Error("PDF generator is unavailable. Please refresh the page and try again.");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentW = pageW - margin * 2;
    const chat = data?.chat || {};
    const messages = Array.isArray(data?.messages) ? data.messages : [];
    const transfers = Array.isArray(data?.transfers) ? data.transfers : [];
    const brand = [36, 87, 214];
    const ink = [24, 34, 52];
    const muted = [100, 116, 139];
    let y = 16;

    const setInk = () => doc.setTextColor(...ink);
    const ensureSpace = (needed = 12) => {
      if (y + needed <= pageH - 18) return;
      doc.addPage();
      y = 17;
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...brand);
      doc.text("TRIPLEM VIP  |  LIVE CHAT TRANSCRIPT", margin, y);
      y += 8;
    };
    const writeLabelValue = (label, value, x, top, width) => {
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.3); doc.setTextColor(...muted);
      doc.text(liveRecordPdfText(label).toUpperCase(), x, top);
      doc.setFont("helvetica", "bold"); doc.setFontSize(9.2); setInk();
      const lines = doc.splitTextToSize(liveRecordPdfText(value) || "-", width);
      doc.text(lines.slice(0, 2), x, top + 5);
    };
    const fitPdfSingleLine = (value, width) => {
      let text = liveRecordPdfText(value) || "-";
      if (doc.getTextWidth(text) <= width) return text;
      while (text.length > 4 && doc.getTextWidth(`${text}...`) > width) text = text.slice(0, -1);
      return `${text.trim()}...`;
    };

    doc.setFillColor(247, 249, 253); doc.roundedRect(margin, y, contentW, 29, 4, 4, "F");
    try {
      if (typeof loadPdfLogoAsset === "function" && typeof drawFittedPdfImage === "function") {
        const logo = await loadPdfLogoAsset("Assets/logo/logo.png");
        if (logo) drawFittedPdfImage(doc, logo, margin + 5, y + 4, 35, 18, { align: "left", valign: "middle" });
      }
    } catch (_) {}
    doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(...brand);
    doc.text("Live Chat Transcript", margin + 47, y + 11);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...muted);
    doc.text("Permanent Triplem VIP support record", margin + 47, y + 18);
    doc.text(`Generated ${liveRecordPdfText(fmt(new Date().toISOString()))}`, margin + 47, y + 23);
    y += 36;

    const representative = chat.agent_name || (String(chat.support_mode || "").toLowerCase() === "aziz" ? "Aziz" : "Admin / unassigned");
    const representativeTitle = String(chat.support_mode || "").toLowerCase() === "aziz" && !chat.agent_id ? "AI" : chat.agent_id || chat.agent_name ? "Agent" : "Triplem VIP";
    const status = chat.routing_status || chat.support_mode || chat.status || "open";
    const cellW = (contentW - 6) / 2;
    doc.setFillColor(250, 251, 253); doc.roundedRect(margin, y, contentW, 35, 3, 3, "F");
    writeLabelValue("Visitor", chat.guest_name || "Visitor", margin + 4, y + 7, cellW - 6);
    writeLabelValue("Contact", [chat.guest_email, chat.guest_phone].filter(Boolean).join(" | ") || "No contact details", margin + cellW + 7, y + 7, cellW - 8);
    writeLabelValue("Representative", `${representativeTitle} | ${representative}`, margin + 4, y + 21, cellW - 6);
    writeLabelValue("Status", status, margin + cellW + 7, y + 21, cellW - 8);
    y += 42;

    doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(...brand);
    doc.text("Conversation", margin, y); y += 6;

    const actorInfo = (m) => {
      const actor = String(m?.message_actor || "").toLowerCase();
      const supportActor = String(m?.support_actor || "").toLowerCase();
      const role = String(m?.sender_role || "").toLowerCase();
      if (role === "guest" || actor === "visitor") return { label: m.sender_name || chat.guest_name || "Visitor", title: "Visitor", fill: [237, 244, 255], accent: [36, 87, 214] };
      if (supportActor === "aziz" || actor === "ai" || m?.is_ai) return { label: "Aziz", title: "AI", fill: [244, 240, 255], accent: [112, 74, 198] };
      if (actor === "agent" || m?.sender_id) return { label: m.sender_name || representative || "Support Agent", title: "Agent", fill: [237, 249, 244], accent: [28, 132, 93] };
      return { label: m.sender_name || "Triplem VIP Support", title: "Triplem VIP", fill: [245, 247, 250], accent: [100, 116, 139] };
    };

    const renderMessage = (m) => {
      const info = actorInfo(m);
      const raw = liveRecordPdfText(m?.body || "");
      if (!raw) return;
      const maxTextW = contentW - 14;
      let lines = doc.splitTextToSize(raw, maxTextW);
      if (!Array.isArray(lines)) lines = [String(lines || raw)];
      let firstChunk = true;
      while (lines.length) {
        const available = Math.max(18, pageH - 20 - y);
        const maxLines = Math.max(1, Math.floor((available - 13) / 4.2));
        if (maxLines < 2 && lines.length > 1) { ensureSpace(pageH); continue; }
        const chunk = lines.splice(0, maxLines);
        const h = 13 + chunk.length * 4.2;
        ensureSpace(h + 3);
        doc.setFillColor(...info.fill); doc.roundedRect(margin, y, contentW, h, 3, 3, "F");
        doc.setFillColor(...info.accent); doc.roundedRect(margin, y, 2.2, h, 1, 1, "F");
        const roleTitle = firstChunk ? liveRecordPdfText(info.title).toUpperCase() : "CONTINUED";
        doc.setFont("helvetica", "bold"); doc.setFontSize(6.1);
        const roleW = Math.max(11, Math.min(29, doc.getTextWidth(roleTitle) + 5));
        doc.setFillColor(...info.accent); doc.roundedRect(margin + 5, y + 2.0, roleW, 5.1, 1.6, 1.6, "F");
        doc.setTextColor(255, 255, 255);
        doc.text(roleTitle, margin + 5 + roleW / 2, y + 5.45, { align: "center" });
        const time = firstChunk ? liveRecordPdfText(fmt(m?.created_at)) : "";
        const timeReserve = time ? 39 : 6;
        const nameX = margin + 7 + roleW;
        const nameW = Math.max(22, pageW - margin - timeReserve - nameX);
        doc.setFont("helvetica", "bold"); doc.setFontSize(8.1); doc.setTextColor(...info.accent);
        const displayName = firstChunk ? liveRecordPdfText(info.label) : `${liveRecordPdfText(info.label)} continued`;
        doc.text(fitPdfSingleLine(displayName, nameW), nameX, y + 5.4);
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.2); doc.setTextColor(...muted);
        if (time) doc.text(time, pageW - margin - 4, y + 5.2, { align: "right" });
        doc.setFontSize(9); setInk(); doc.text(chunk, margin + 5, y + 10.5);
        y += h + 3;
        firstChunk = false;
      }
    };

    if (!messages.length) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...muted);
      doc.text("No messages were stored in this chat record.", margin, y + 3); y += 10;
    } else messages.forEach(renderMessage);

    if (transfers.length) {
      ensureSpace(18);
      y += 2; doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...brand); doc.text("Support handoff history", margin, y); y += 6;
      transfers.forEach(t => {
        ensureSpace(9);
        doc.setFont("helvetica", "normal"); doc.setFontSize(8.2); setInk();
        const route = `${liveRecordPdfText(t.from_name || "Support")}  >  ${liveRecordPdfText(t.to_name || "Support")}  |  ${liveRecordPdfText(t.status || "unknown")}`;
        doc.text(doc.splitTextToSize(route, contentW - 35), margin + 2, y);
        doc.setTextColor(...muted); doc.text(liveRecordPdfText(fmt(t.requested_at)), pageW - margin, y, { align: "right" }); y += 6;
      });
    }

    const pages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i); doc.setDrawColor(226, 232, 240); doc.line(margin, pageH - 12, pageW - margin, pageH - 12);
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.2); doc.setTextColor(...muted);
      doc.text("Triplem VIP | Confidential support transcript", margin, pageH - 7);
      doc.text(`Page ${i} of ${pages}`, pageW - margin, pageH - 7, { align: "right" });
    }
    const safeName = liveRecordPdfText(chat.guest_name || "Visitor").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "Visitor";
    const date = new Date(chat.created_at || Date.now()).toISOString().slice(0, 10);
    doc.save(`Triplem-VIP-Live-Chat-${safeName}-${date}.pdf`);
  }

  async function downloadAdminLiveChatPdf(inquiryId, triggerButton = null, transcriptData = null) {
    const btn = triggerButton;
    const oldHtml = btn?.innerHTML;
    try {
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }
      const data = transcriptData || await supabaseRpc("app_admin_live_chat_transcript", { p_inquiry_id: inquiryId });
      await createAdminLiveChatPdf(data);
    } catch (error) {
      alert(error?.message || "Could not create the Live Chat PDF.");
    } finally {
      if (btn?.isConnected) { btn.disabled = false; if (oldHtml != null) btn.innerHTML = oldHtml; }
    }
  }

  async function openAdminLiveChatTranscript(inquiryId, onDeleted){
    const modal = ensureTranscriptModal();
    modal.innerHTML = `
      <div class="modal-backdrop" data-live-record-thread-close></div>
      <div class="modal-dialog settings-sheet admin-live-record-thread-sheet" role="dialog" aria-modal="true" aria-labelledby="adminLiveRecordThreadTitle">
        <div class="settings-sheet-head">
          <div><h3 id="adminLiveRecordThreadTitle"><i class="fa-solid fa-comments"></i> Live Chat transcript</h3><p>Permanent support record</p></div>
          <button type="button" class="btn ghost tiny" data-live-record-thread-close aria-label="Close">✕</button>
        </div>
        <div class="modal-body settings-sheet-body admin-live-record-thread-body"><div class="empty">Loading transcript…</div></div>
      </div>`;
    const close = () => { modal.classList.add("hide"); modal.setAttribute("aria-hidden", "true"); };
    modal.querySelectorAll("[data-live-record-thread-close]").forEach(el => el.onclick = close);
    modal.classList.remove("hide"); modal.setAttribute("aria-hidden", "false");
    const body = modal.querySelector(".admin-live-record-thread-body");
    try {
      const data = await supabaseRpc("app_admin_live_chat_transcript", { p_inquiry_id: inquiryId });
      const chat = data?.chat || {};
      const messages = Array.isArray(data?.messages) ? data.messages : [];
      const transfers = Array.isArray(data?.transfers) ? data.transfers : [];
      body.innerHTML = `
        <div class="admin-live-record-summary">
          <div><span>Visitor</span><strong>${escapeHtml(chat.guest_name || "Visitor")}</strong><small>${escapeHtml([chat.guest_email, chat.guest_phone].filter(Boolean).join(" · ") || "No contact details")}</small></div>
          <div><span>Representative</span><strong>${escapeHtml(chat.agent_name || "Admin / unassigned")}</strong><small>${chat.agent_username ? `@${escapeHtml(chat.agent_username)}` : "Triplem VIP Support"}</small></div>
          <div><span>Started</span><strong>${escapeHtml(fmt(chat.created_at))}</strong><small>${chat.accepted_at ? `Accepted ${escapeHtml(fmt(chat.accepted_at))}` : "Not formally accepted"}</small></div>
          <div><span>Status</span><strong>${escapeHtml(chat.routing_status || chat.status || "open")}</strong><small>${chat.closed_at ? `Closed ${escapeHtml(fmt(chat.closed_at))}${chat.closed_by ? ` · ended by ${escapeHtml(String(chat.closed_by).toLowerCase() === "agent" ? (chat.closed_by_name || "Agent") : String(chat.closed_by).toLowerCase() === "visitor" ? "Visitor" : "Triplem VIP")}` : ""}` : "Conversation record retained"}</small></div>
        </div>
        ${transfers.length ? `<div class="admin-live-record-handoffs"><div class="admin-live-record-handoffs-title"><i class="fa-solid fa-right-left"></i><strong>Support handoff history</strong><span>${transfers.length} transfer${transfers.length === 1 ? "" : "s"}</span></div>${transfers.map(t => `<div class="admin-live-record-handoff"><span class="admin-live-record-handoff-route"><strong>${escapeHtml(t.from_name || "Support")}</strong><i class="fa-solid fa-arrow-right"></i><strong>${escapeHtml(t.to_name || "Support")}</strong></span><span class="admin-live-record-handoff-status ${escapeHtml(String(t.status || "").toLowerCase())}">${escapeHtml(t.status || "unknown")}</span><small>${escapeHtml(fmt(t.requested_at))}${t.resolved_at ? ` · resolved ${escapeHtml(fmt(t.resolved_at))}` : ""}</small></div>`).join("")}</div>` : ""}
        <div class="admin-live-record-transcript" role="log">${messages.length ? messages.map(m => {
          const guest = String(m.sender_role || "").toLowerCase() === "guest";
          const lifecycle = liveRecordLifecycleEvent(m);
          if (lifecycle) {
            return `<div class="admin-live-record-event"><i class="fa-solid ${escapeHtml(lifecycle.icon)}" aria-hidden="true"></i><div><strong>${escapeHtml(lifecycle.label)}</strong><span>${escapeHtml(lifecycle.body)}</span></div><time>${escapeHtml(fmt(m.created_at))}</time></div>`;
          }
          const actorClass = guest ? "guest" : (String(m.support_actor || "").toLowerCase() === "aziz" || m.is_ai ? "aziz" : (String(m.message_actor || "").toLowerCase() === "agent" || m.sender_id ? "agent" : "support"));
          const actorTitle = guest ? "Visitor" : actorClass === "aziz" ? "AI" : actorClass === "agent" ? "Agent" : "Triplem VIP";
          const actorName = m.sender_name || (guest ? chat.guest_name : actorClass === "aziz" ? "Aziz" : "Triplem VIP Support");
          return `<div class="admin-live-record-msg ${actorClass}"><div class="admin-live-record-msg-meta"><strong><em class="admin-live-record-role-badge ${actorClass}">${escapeHtml(actorTitle)}</em><span>${escapeHtml(actorName)}</span></strong><span>${escapeHtml(fmt(m.created_at))}</span></div><p dir="auto">${escapeHtml(m.body || "")}</p></div>`;
        }).join("") : `<div class="empty">No messages stored in this record.</div>`}</div>
        <div class="admin-live-record-thread-actions">
          <button type="button" class="btn ghost tiny" data-live-record-thread-close>Close</button>
          <button type="button" class="btn soft tiny admin-live-record-pdf-action" data-live-record-pdf="${escapeHtml(String(inquiryId))}"><i class="fa-solid fa-file-pdf"></i> Download PDF</button>
          <button type="button" class="btn ghost tiny danger-text" data-live-record-delete="${escapeHtml(String(inquiryId))}"><i class="fa-solid fa-trash"></i> Delete permanently</button>
        </div>`;
      body.querySelectorAll("[data-live-record-thread-close]").forEach(el => el.onclick = close);
      body.querySelector("[data-live-record-pdf]")?.addEventListener("click", e => downloadAdminLiveChatPdf(inquiryId, e.currentTarget, data));
      body.querySelector("[data-live-record-delete]")?.addEventListener("click", async e => {
        // Capture synchronously: Event.currentTarget becomes null after an await.
        const btn = e.currentTarget;
        const ok = await appConfirmDelete("Permanently delete this complete Live Chat record and every message in it?", {
          title: "Delete Live Chat permanently?",
          confirmLabel: "Delete permanently",
          note: "This action removes the chat transcript from the database and cannot be undone. User financial and account data are not affected."
        });
        if (!ok) return;
        try {
          if (btn) btn.disabled = true;
          await supabaseRpc("app_admin_delete_live_chat_record", { p_inquiry_id: inquiryId });
          close();
          if (typeof onDeleted === "function") await onDeleted();
          noteMessagingLocalMutation?.();
          refreshAdminCommsBadges?.().catch(() => {});
        } catch (ex) { alert(ex.message || "Could not delete this Live Chat record."); }
        finally { if (btn?.isConnected) btn.disabled = false; }
      });
    } catch (ex) {
      body.innerHTML = `<div class="empty">${escapeHtml(ex.message || "Could not load Live Chat transcript.")}</div>`;
    }
  }

  async function openAdminLiveChatRecordsModal(){
    const modal = ensureRecordsModal();
    const stateRecords = { offset: 0, limit: 60, search: "", loading: false, items: [], total: 0, hasMore: false, selected: new Set() };
    modal.innerHTML = `
      <div class="modal-backdrop" data-live-records-close></div>
      <div class="modal-dialog settings-sheet admin-live-records-sheet" role="dialog" aria-modal="true" aria-labelledby="adminLiveRecordsTitle">
        <div class="settings-sheet-head">
          <div><h3 id="adminLiveRecordsTitle"><i class="fa-solid fa-clock-rotate-left"></i> Live Chat Records</h3><p>Visitor, representative and complete conversation history</p></div>
          <button type="button" class="btn ghost tiny" data-live-records-close aria-label="Close">✕</button>
        </div>
        <div class="modal-body settings-sheet-body admin-live-records-body">
          <div class="admin-live-records-toolbar">
            <label class="admin-live-record-search"><i class="fa-solid fa-magnifying-glass"></i><input id="adminLiveRecordsSearch" class="input" type="search" placeholder="Search visitor, agent, email or message…" /></label>
            <button type="button" class="btn soft tiny" id="adminLiveRecordsRefresh"><i class="fa-solid fa-rotate"></i> Refresh</button>
          </div>
          <div class="admin-live-record-bulkbar">
            <button type="button" class="btn ghost tiny" id="adminLiveRecordsSelectVisible"><i class="fa-regular fa-square-check"></i> Select visible</button>
            <button type="button" class="btn ghost tiny danger-text" id="adminLiveRecordsDeleteSelected" disabled><i class="fa-solid fa-trash"></i> Delete selected</button>
            <button type="button" class="btn ghost tiny danger-text" id="adminLiveRecordsDeleteAll"><i class="fa-solid fa-trash-can"></i> Delete all</button>
            <span id="adminLiveRecordsSelected" class="admin-live-record-selected">0 selected</span>
          </div>
          <div class="admin-live-records-meta"><span id="adminLiveRecordsCount">Loading…</span><small>Records stay available until Admin deliberately deletes them.</small></div>
          <div id="adminLiveRecordsList" class="admin-live-records-list"><div class="empty">Loading Live Chat records…</div></div>
          <button type="button" class="btn soft tiny admin-live-records-more hide" id="adminLiveRecordsMore">Load older chats</button>
        </div>
      </div>`;
    const close = () => { modal.classList.add("hide"); modal.setAttribute("aria-hidden", "true"); };
    modal.querySelectorAll("[data-live-records-close]").forEach(el => el.onclick = close);
    modal.classList.remove("hide"); modal.setAttribute("aria-hidden", "false");
    const list = modal.querySelector("#adminLiveRecordsList");
    const count = modal.querySelector("#adminLiveRecordsCount");
    const more = modal.querySelector("#adminLiveRecordsMore");
    const search = modal.querySelector("#adminLiveRecordsSearch");
    const selectedLabel = modal.querySelector("#adminLiveRecordsSelected");
    const deleteSelectedBtn = modal.querySelector("#adminLiveRecordsDeleteSelected");
    const selectVisibleBtn = modal.querySelector("#adminLiveRecordsSelectVisible");
    const deleteAllBtn = modal.querySelector("#adminLiveRecordsDeleteAll");

    const syncBulkState = () => {
      const selectedCount = stateRecords.selected.size;
      if (selectedLabel) selectedLabel.textContent = `${selectedCount} selected`;
      if (deleteSelectedBtn) deleteSelectedBtn.disabled = selectedCount === 0;
      list?.querySelectorAll("[data-live-record-id]").forEach(card => card.classList.toggle("is-selected", stateRecords.selected.has(String(card.dataset.liveRecordId))));
    };

    const render = () => {
      if (count) count.textContent = `${stateRecords.total} saved Live Chat${stateRecords.total === 1 ? "" : "s"}`;
      if (!stateRecords.items.length) {
        list.innerHTML = `<div class="empty">No Live Chat records match this view.</div>`;
      } else {
        list.innerHTML = stateRecords.items.map(item => `
          <article class="admin-live-record-card${stateRecords.selected.has(String(item.id)) ? " is-selected" : ""}" data-live-record-id="${escapeHtml(String(item.id))}">
            <label class="admin-live-record-check" title="Select this chat"><input type="checkbox" data-live-record-select="${escapeHtml(String(item.id))}" ${stateRecords.selected.has(String(item.id)) ? "checked" : ""} /><span><i class="fa-solid fa-check"></i></span></label>
            <button type="button" class="admin-live-record-main" data-live-record-open="${escapeHtml(String(item.id))}">
              <span class="admin-live-record-avatar"><i class="fa-solid fa-user"></i></span>
              <span class="admin-live-record-copy">
                <span class="admin-live-record-top"><strong>${escapeHtml(item.guest_name || "Visitor")}</strong><time>${escapeHtml(fmt(item.last_message_at || item.created_at))}</time></span>
                <span class="admin-live-record-contact">${escapeHtml([item.guest_email, item.guest_phone].filter(Boolean).join(" · ") || "Landing visitor")}</span>
                <span class="admin-live-record-preview">${escapeHtml(item.last_message_preview || "No message preview")}</span>
                <span class="admin-live-record-foot"><em><i class="fa-solid fa-headset"></i> ${escapeHtml(item.agent_name || "Admin / unassigned")}</em><em>${escapeHtml(String(item.message_count || 0))} messages</em><em class="status">${escapeHtml(item.routing_status || item.status || "open")}</em></span>
              </span>
            </button>
            <div class="admin-live-record-card-actions">
              <button type="button" class="admin-live-record-pdf" data-live-record-pdf-card="${escapeHtml(String(item.id))}" title="Download transcript PDF" aria-label="Download Live Chat PDF"><i class="fa-solid fa-file-pdf"></i></button>
              <button type="button" class="admin-live-record-trash" data-live-record-delete-card="${escapeHtml(String(item.id))}" title="Delete permanently" aria-label="Delete Live Chat permanently"><i class="fa-solid fa-trash"></i></button>
            </div>
          </article>`).join("");
      }
      more?.classList.toggle("hide", !stateRecords.hasMore);
      syncBulkState();
    };

    const load = async (reset = true) => {
      if (stateRecords.loading) return;
      stateRecords.loading = true;
      try {
        if (reset) { stateRecords.offset = 0; stateRecords.items = []; stateRecords.selected.clear(); list.innerHTML = `<div class="empty">Loading Live Chat records…</div>`; syncBulkState(); }
        const data = await supabaseRpc("app_admin_live_chat_records", { p_limit: stateRecords.limit, p_offset: stateRecords.offset, p_search: stateRecords.search || null });
        const rows = Array.isArray(data?.items) ? data.items : [];
        const combined = reset ? rows : stateRecords.items.concat(rows);
        // Defensive UI dedupe by the server's logical conversation id. Migration 142
        // already returns one row per canonical Live Chat, but this also prevents a
        // stale schema cache or repeated page response from painting the same card twice.
        stateRecords.items = Array.from(new Map(combined.filter(Boolean).map(item => [String(item.id || ""), item])).values()).filter(item => item?.id);
        stateRecords.total = Number(data?.total ?? stateRecords.items.length);
        stateRecords.hasMore = !!data?.has_more;
        stateRecords.offset = Number(data?.offset || 0) + rows.length;
        render();
      } catch (ex) { list.innerHTML = `<div class="empty">${escapeHtml(ex.message || "Could not load Live Chat records.")}</div>`; }
      finally { stateRecords.loading = false; }
    };

    list.addEventListener("click", async e => {
      const selector = e.target.closest("[data-live-record-select]");
      if (selector) {
        const id = String(selector.dataset.liveRecordSelect || "");
        if (selector.checked) stateRecords.selected.add(id); else stateRecords.selected.delete(id);
        syncBulkState();
        return;
      }
      const pdf = e.target.closest("[data-live-record-pdf-card]");
      const open = e.target.closest("[data-live-record-open]");
      const del = e.target.closest("[data-live-record-delete-card]");
      if (pdf) { await downloadAdminLiveChatPdf(pdf.dataset.liveRecordPdfCard, pdf); return; }
      if (open) { await openAdminLiveChatTranscript(open.dataset.liveRecordOpen, () => load(true)); return; }
      if (del) {
        const id = del.dataset.liveRecordDeleteCard;
        const ok = await appConfirmDelete("Permanently delete this Live Chat record and its complete transcript?", { title: "Delete Live Chat permanently?", confirmLabel: "Delete permanently", note: "This cannot be undone. It does not affect the visitor's unrelated account or financial data." });
        if (!ok) return;
        try { del.disabled = true; await supabaseRpc("app_admin_delete_live_chat_record", { p_inquiry_id: id }); await load(true); noteMessagingLocalMutation?.(); refreshAdminCommsBadges?.().catch(() => {}); }
        catch (ex) { alert(ex.message || "Could not delete this Live Chat record."); }
        finally { del.disabled = false; }
      }
    });
    selectVisibleBtn.onclick = () => {
      const visibleIds = stateRecords.items.map(item => String(item.id));
      const allSelected = visibleIds.length > 0 && visibleIds.every(id => stateRecords.selected.has(id));
      visibleIds.forEach(id => allSelected ? stateRecords.selected.delete(id) : stateRecords.selected.add(id));
      render();
    };
    deleteSelectedBtn.onclick = async () => {
      const ids = [...stateRecords.selected];
      if (!ids.length) return;
      const ok = await appConfirmDelete(`Permanently delete ${ids.length} selected Live Chat record${ids.length === 1 ? "" : "s"}?`, {
        title: "Delete selected Live Chats?", confirmLabel: "Delete selected",
        note: "The selected transcripts will be permanently removed from the database. User accounts and financial data are not affected."
      });
      if (!ok) return;
      try {
        deleteSelectedBtn.disabled = true;
        await supabaseRpc("app_admin_delete_live_chat_records", { p_inquiry_ids: ids, p_delete_all: false });
        await load(true);
        noteMessagingLocalMutation?.(); refreshAdminCommsBadges?.().catch(() => {});
      } catch (ex) { alert(ex.message || "Could not delete the selected Live Chat records."); }
      finally { syncBulkState(); }
    };
    deleteAllBtn.onclick = async () => {
      if (!stateRecords.total) return;
      const ok = await appConfirmDelete(`Permanently delete all ${stateRecords.total} saved Live Chat records?`, {
        title: "Delete all Live Chat records?", confirmLabel: "Delete all records",
        note: "This removes every saved landing Live Chat transcript from the database and cannot be undone. User accounts and financial data are not affected."
      });
      if (!ok) return;
      try {
        deleteAllBtn.disabled = true;
        await supabaseRpc("app_admin_delete_live_chat_records", { p_inquiry_ids: null, p_delete_all: true });
        await load(true);
        noteMessagingLocalMutation?.(); refreshAdminCommsBadges?.().catch(() => {});
      } catch (ex) { alert(ex.message || "Could not delete all Live Chat records."); }
      finally { deleteAllBtn.disabled = false; }
    };

    let timer = null;
    search.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => { stateRecords.search = search.value.trim(); load(true); }, 240); });
    modal.querySelector("#adminLiveRecordsRefresh").onclick = () => load(true);
    more.onclick = () => load(false);
    await load(true);
  }

  const bind = () => {
    const btn = document.getElementById("adminLiveChatRecordsBtn");
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = "1";
      btn.addEventListener("click", () => openAdminLiveChatRecordsModal().catch(err => alert(err.message || "Could not open Live Chat records.")));
    }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, { once: true }); else bind();
  window.openAdminLiveChatRecordsModal = openAdminLiveChatRecordsModal;
})();
