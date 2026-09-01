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

function renderAdminUserCardHtml(user, { nested = false, memberCount = 0, inTeamOverlay = false } = {}){
  const flags = getUserAccessFlags(user);
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
            ${statusBadge}${roleBadge}${planBadge}${pinBadge}${protectedBadge}${teamAccountBadge}${teamMemberBadge}${forceBadge}
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
        <div class="admin-cred-lock-row">
          <button type="button" class="admin-cred-lock-btn" data-admin-action="view_credentials" title="View credentials" aria-label="View credentials for ${escapeHtml(user.username)}">
            <i class="fa-solid fa-lock" aria-hidden="true"></i>
            <span>Credentials</span>
          </button>
        </div>
        ${adminMetaChips(user)}
        <div class="admin-user-actions">
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

async function loadAdminUsers(){
  if (document.getElementById("adminSecurityLock")
      && !document.getElementById("adminSecurityLock").classList.contains("hide")
      && typeof isProtectedAdminSession === "function"
      && isProtectedAdminSession()) {
    return;
  }
  const list = document.getElementById("adminUsersList");
  if (!list) return;
  if (!userHasPermission("admin_panel", "view")) {
    list.innerHTML = `<div class="empty">Administrator access required.</div>`;
    return;
  }
  const previouslyExpanded = list.querySelector(".admin-user-card.is-expanded")?.dataset.userId || "";
  list.innerHTML = `<div class="empty"><i class="fa-solid fa-spinner btn-loader"></i> Loading users…</div>`;
  try {
    const users = await supabaseRpc("app_admin_list_users", {});
    const rows = Array.isArray(users) ? users : [];
    state.adminUsersCache = rows;
    if (!rows.length) {
      list.innerHTML = `<div class="empty">No users found. Create the first additional account.</div>`;
      return;
    }
    const { roots, membersByOwner } = groupAdminUsersForDisplay(rows);
    list.innerHTML = roots.map(user => {
      const members = membersByOwner.get(user.id) || [];
      return renderAdminUserCardHtml(user, { nested: false, memberCount: members.length });
    }).join("");

    wireAdminUserListInteractions(list, rows);

    if (previouslyExpanded) {
      const safeId = (typeof CSS !== "undefined" && CSS.escape)
        ? CSS.escape(previouslyExpanded)
        : previouslyExpanded.replace(/["\\]/g, "\\$&");
      const restore = list.querySelector(`.admin-user-card[data-user-id="${safeId}"]`);
      if (restore) expandAdminUserCard(restore, true, list);
    }
    refreshAdminTeamOverlayIfOpen();
  } catch (err) {
    list.innerHTML = `<div class="empty">Could not load users. ${escapeHtml(err.message || String(err))}</div>`;
  }
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

async function handleAdminUserAction(action, user, opts = {}){
  try {
    if (action === "view_team") {
      openAdminTeamOverlay(user);
      return;
    }
    if (action === "view_credentials") {
      openAdminCredentialsOverlay(user);
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
          <div class="empty">Select a user to load raw data.</div>
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
  wrap.innerHTML = `<div class="empty"><i class="fa-solid fa-spinner btn-loader"></i> Loading raw entries…</div>`;
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
    wrap.innerHTML = `<div class="empty">${escapeHtml(err.message || "Could not load raw data")}</div>`;
  } finally {
    adminRawState.loading = false;
  }
}

function renderAdminRawTable(wrap, items){
  if (!items.length) {
    wrap.innerHTML = `<div class="empty">No entries match this filter.</div>`;
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
              <td><span class="admin-raw-section-pill">${escapeHtml(row.section || "other")}</span></td>
              <td><span class="admin-raw-source-pill ${isLedger ? "is-ledger" : ""}" title="${isLedger ? "Legacy meta-tag ledger row" : "Domain table row"}">${escapeHtml(isLedger ? "ledger" : source)}</span></td>
              <td>${escapeHtml(row.direction)} · ${escapeHtml(row.entry_kind)}</td>
              <td title="${escapeHtml(row.person_name || "")}">${escapeHtml(row.person_name || "—")}</td>
              <td>${escapeHtml(row.currency || "—")}</td>
              <td class="mono">${escapeHtml(amount == null ? "—" : String(amount))}</td>
              <td class="mono">${escapeHtml(dates)}</td>
              <td class="admin-raw-notes" title="${escapeHtml(notes)}">${escapeHtml(notesShort || "—")}</td>
              <td class="admin-raw-row-actions">
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
      <div class="form-group">
        <label class="form-label">${user ? "Password (leave blank to keep)" : "Password"}</label>
        <div class="admin-password-row">
          <input id="${prefix}Password" class="input" type="password" autocomplete="new-password" value="" data-original="${escapeHtml(user?.admin_visible_password || "")}" placeholder="${user ? (user.admin_visible_password ? "••••••••  (leave blank to keep)" : "No stored password — enter one to save") : "8+ chars, upper, lower, number"}" />
          <button type="button" class="pw-eye-btn" data-toggle-form-pw="${prefix}Password" aria-label="Show password" title="Show password"><i class="fa-solid fa-eye" aria-hidden="true"></i></button>
        </div>
        <p class="help">Shown to administrators only when revealed. Leave blank when editing to keep the current password.</p>
      </div>
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
          <p>Credentials, period, branding, tabs</p>
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
  const pwInput = modal.querySelector("#adminEditPassword");
  if (pwInput) {
    pwInput.value = "";
    pwInput.dataset.original = user.admin_visible_password || "";
    if (!String(user.admin_visible_password || "").trim()) {
      pwInput.placeholder = "No stored password yet — enter one to save it for admin view";
    }
  }
  const err = modal.querySelector("#adminEditError");
  err.textContent = "";
  err.classList.remove("show");
  modal.classList.remove("hide");
  modal.setAttribute("aria-hidden", "false");

  // Refresh credentials + branding from DB so edit form is always current
  (async () => {
    try {
      const fresh = await supabaseRpc("app_admin_get_user", { p_user_id: user.id });
      if (!fresh) return;
      if (pwInput) {
        const pw = String(fresh.admin_visible_password || "").trim();
        pwInput.value = "";
        pwInput.dataset.original = pw;
        if (!pw) {
          pwInput.placeholder = "No stored password yet — enter one to save it for admin view";
        } else {
          pwInput.placeholder = "••••••••  (leave blank to keep)";
        }
      }
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
      console.warn("Could not refresh user credentials.", fetchErr);
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
      const passwordValue = String(modal.querySelector("#adminEditPassword").value || "");
      const originalPassword = String(modal.querySelector("#adminEditPassword").dataset.original || "");
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
      // Only send password when the admin intentionally changes it (blank = keep)
      if (passwordValue && passwordValue !== originalPassword) {
        assertPasswordPolicy(passwordValue);
        payload.p_password = passwordValue;
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

function openAccountSettingsModal(){
  if (isGuestMode()) {
    alert("Account settings are not available in guest mode.");
    return;
  }
  const user = state.sessionUser || {};
  const settings = user.settings && typeof user.settings === "object" ? user.settings : {};
  const company = user.company_name || settings.Company || "";
  const vat = user.vat_number || settings.TRN || "";
  const logo = user.logo_url || settings.logo || "";
  const email = user.company_email || settings.email || settings.Email || "";
  const phone = user.company_phone || settings.Mobile || settings.Phone || settings.phone || "";
  const address = user.company_address || settings.Address || settings.address || "";
  const usernameLocked = !!user.is_protected;
  const brandingLocked = isTeamMemberAccount(user);
  const brandingAttrs = brandingLocked ? "readonly disabled" : "";
  let modal = document.getElementById("accountSettingsModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "accountSettingsModal";
    modal.className = "modal hide";
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div class="modal-backdrop" data-admin-modal-close="accountSettingsModal"></div>
    <div class="modal-dialog settings-sheet">
      <div class="settings-sheet-head">
        <div>
          <h3>Account settings</h3>
          <p>Profile, plan, and company details</p>
        </div>
        <button type="button" class="btn ghost tiny" data-admin-modal-close="accountSettingsModal" aria-label="Close">✕</button>
      </div>
      <div class="modal-body settings-sheet-body">
        <div id="acctPlanBlock" class="settings-card">
          <div class="settings-card-head">
            <span>Plan &amp; access</span>
            <span id="acctPlanBadge" class="settings-pill"></span>
          </div>
          <div id="acctPlanSummary" class="settings-plan-meta"></div>
          <div class="settings-renew-row">
            <select id="acctRenewPeriod" class="input settings-input" title="Renewal period">
              <option value="week">1 week</option>
              <option value="month" selected>1 month</option>
              <option value="year">1 year</option>
              <option value="custom">Custom days</option>
              <option value="date">Until date</option>
            </select>
            <input id="acctRenewDays" class="input settings-input settings-days" type="number" min="1" max="3650" value="30" title="Days" />
            <input id="acctRenewUntil" class="input settings-input settings-date hide" type="date" title="Until date" />
            <button type="button" class="btn primary tiny" id="acctRenewSubmit">Request</button>
          </div>
          <input id="acctRenewMessage" class="input settings-input" type="text" placeholder="Optional note to admin" />
          <p class="settings-status" id="acctRenewStatus"></p>
        </div>

        <div class="settings-card">
          <div class="settings-card-head"><span>Profile</span></div>
          <div class="settings-grid">
            <label class="settings-field">Display name
              <input id="acctDisplayName" class="input settings-input" autocomplete="name" />
            </label>
            <label class="settings-field">Username
              <input id="acctUsername" class="input settings-input" autocomplete="username" ${usernameLocked ? "readonly" : ""} />
            </label>
          </div>
        </div>

        <div class="settings-card${brandingLocked ? " settings-card-locked" : ""}">
          <div class="settings-card-head">
            <span>Company</span>
            ${brandingLocked ? `<span class="settings-pill">Read-only</span>` : ""}
          </div>
          ${brandingLocked ? `<p class="settings-readonly-note"><i class="fa-solid fa-lock" aria-hidden="true"></i> Managed by the company main account</p>` : ""}
          <div class="settings-grid">
            <label class="settings-field">Company
              <input id="acctCompany" class="input settings-input" autocomplete="organization" ${brandingAttrs} />
            </label>
            <label class="settings-field">VAT / TRN
              <input id="acctVat" class="input settings-input" ${brandingAttrs} />
            </label>
            <label class="settings-field">Email
              <input id="acctEmail" class="input settings-input" type="email" autocomplete="email" ${brandingAttrs} />
            </label>
            <label class="settings-field">Mobile
              <input id="acctPhone" class="input settings-input" type="tel" autocomplete="tel" ${brandingAttrs} />
            </label>
            <label class="settings-field settings-span-2">Address
              <input id="acctAddress" class="input settings-input" placeholder="Street, city, country" ${brandingAttrs} />
            </label>
            <label class="settings-field settings-span-2">Logo
              <div class="settings-logo-row">
                ${brandingLocked ? "" : `<input id="acctLogoFile" class="input settings-input" type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif" />`}
                <input id="acctLogoUrl" type="hidden" value="" />
                <img id="acctLogoPreview" class="settings-logo-preview hide" src="" alt="" />
              </div>
              <span id="acctLogoStatus" class="settings-hint">Optional · PNG/JPG</span>
            </label>
          </div>
        </div>

        <div class="settings-card settings-card--password">
          <div class="settings-card-head"><span>Password</span></div>
          <div class="settings-grid settings-password-grid">
            <label class="settings-field settings-span-2">Current password
              <div class="admin-password-row">
                <input id="acctOldPassword" class="input settings-input" type="password" autocomplete="current-password" placeholder="Current password" />
                <button type="button" class="pw-eye-btn" data-toggle-form-pw="acctOldPassword" aria-label="Show password" title="Show password"><i class="fa-solid fa-eye" aria-hidden="true"></i></button>
              </div>
            </label>
            <label class="settings-field">New password
              <div class="admin-password-row">
                <input id="acctNewPassword" class="input settings-input" type="password" autocomplete="new-password" placeholder="New password" aria-describedby="acctPasswordRules" />
                <button type="button" class="pw-eye-btn" data-toggle-form-pw="acctNewPassword" aria-label="Show password" title="Show password"><i class="fa-solid fa-eye" aria-hidden="true"></i></button>
              </div>
            </label>
            <label class="settings-field">Confirm password
              <div class="admin-password-row">
                <input id="acctConfirmPassword" class="input settings-input" type="password" autocomplete="new-password" placeholder="Repeat new password" aria-describedby="acctPasswordRules" />
                <button type="button" class="pw-eye-btn" data-toggle-form-pw="acctConfirmPassword" aria-label="Show password" title="Show password"><i class="fa-solid fa-eye" aria-hidden="true"></i></button>
              </div>
            </label>
            <p id="acctPasswordRules" class="settings-password-hint settings-span-2">Use at least 8 characters with one uppercase letter, one lowercase letter, and one number.</p>
          </div>
        </div>

        <div id="acctSettingsError" class="lock-error"></div>
        <div class="settings-sheet-footer">
          <button type="button" class="btn ghost tiny" id="acctSettingsCancel">Cancel</button>
          <button type="button" class="btn primary tiny" id="acctSettingsSave">Save</button>
        </div>
      </div>
    </div>`;

  modal.querySelector("#acctDisplayName").value = user.display_name || "";
  modal.querySelector("#acctUsername").value = user.username || state.currentUsername || "";
  modal.querySelector("#acctCompany").value = company;
  modal.querySelector("#acctVat").value = vat;
  modal.querySelector("#acctEmail").value = email;
  modal.querySelector("#acctPhone").value = phone;
  modal.querySelector("#acctAddress").value = address;
  modal.querySelector("#acctLogoUrl").value = logo || "";
  const logoPreview = modal.querySelector("#acctLogoPreview");
  const logoStatus = modal.querySelector("#acctLogoStatus");
  if (logo) {
    logoPreview.src = logo;
    logoPreview.classList.remove("hide");
    logoStatus.textContent = "Current logo loaded — PDFs keep natural proportions";
  }
  modal.querySelector("#acctOldPassword").value = "";
  modal.querySelector("#acctNewPassword").value = "";
  modal.querySelector("#acctConfirmPassword").value = "";
  bindAdminLogoPicker("acct", user.id || null);
  bindAdminFormPasswordToggle(modal);

  const flags = getUserAccessFlags(user);
  const planSummary = modal.querySelector("#acctPlanSummary");
  const planBadge = modal.querySelector("#acctPlanBadge");
  const planBlock = modal.querySelector("#acctPlanBlock");
  if (user.is_protected) {
    if (planBlock) planBlock.classList.add("hide");
  } else {
    let badgeText = "Unlimited";
    let badgeClass = "ok";
    if (flags.grace_active) {
      badgeText = `Grace ${Math.floor(Number(flags.grace_days_left) || 0)}d`;
      badgeClass = "warn";
    } else if (flags.lock_active) {
      badgeText = `Locked ${Math.floor(Number(flags.lock_days_left) || 0)}d`;
      badgeClass = "warn";
    } else if (flags.period_expired) {
      badgeText = "Expired";
      badgeClass = "warn";
    } else if (flags.period_active) {
      badgeText = `${flags.trial_days_remaining ?? "?"}d left`;
      badgeClass = Number(flags.trial_days_remaining) <= 14 ? "warn" : "ok";
    } else if (flags.is_trial) {
      badgeText = "Trial";
      badgeClass = "warn";
    }
    if (planBadge) {
      planBadge.textContent = badgeText;
      planBadge.className = `settings-pill ${badgeClass}`;
    }
    if (planSummary) {
      const warnBits = [];
      if (flags.period_expired && flags.grace_active) {
        warnBits.push(`Expired ${formatTrialExpiry(flags.trial_expires_at)}. Workspace stays usable during grace. Lock starts ${formatTrialExpiry(flags.lock_starts_at)}; auto-disable ${formatTrialExpiry(flags.access_disable_at)}.`);
      } else if (flags.lock_active) {
        warnBits.push(`Grace ended. Workspace locked until auto-disable on ${formatTrialExpiry(flags.access_disable_at)}.`);
      } else if (flags.period_expired) {
        warnBits.push(`Expired ${formatTrialExpiry(flags.trial_expires_at)}. Request renewal below.`);
      } else if (flags.period_active && Number(flags.trial_days_remaining) <= 14) {
        warnBits.push(`Plan ending soon — ${flags.trial_days_remaining} day(s) left.`);
      }
      planSummary.innerHTML = `
        <div class="settings-kv"><span>Plan</span><strong>${escapeHtml(flags.access_plan || "full")}</strong></div>
        <div class="settings-kv"><span>Expires</span><strong>${escapeHtml(flags.unlimited_access ? "Never" : formatTrialExpiry(flags.trial_expires_at))}</strong></div>
        ${warnBits.length ? `<p class="settings-warn">${escapeHtml(warnBits.join(" "))}</p>` : ""}
      `;
    }
  }

  const renewPeriod = modal.querySelector("#acctRenewPeriod");
  const renewDays = modal.querySelector("#acctRenewDays");
  const renewUntil = modal.querySelector("#acctRenewUntil");
  const syncRenewFields = () => {
    const p = renewPeriod?.value || "month";
    if (renewDays) renewDays.classList.toggle("hide", p !== "custom");
    if (renewUntil) {
      renewUntil.classList.toggle("hide", p !== "date");
      if (p === "date" && !renewUntil.value) renewUntil.min = minExtendDateValue();
      if (p === "date" && !renewUntil.value) renewUntil.value = minExtendDateValue();
    }
  };
  if (renewPeriod) renewPeriod.onchange = syncRenewFields;
  syncRenewFields();

  const renewStatus = modal.querySelector("#acctRenewStatus");
  const renewBtn = modal.querySelector("#acctRenewSubmit");
  if (renewBtn) {
    renewBtn.onclick = async () => {
      if (renewStatus) renewStatus.textContent = "";
      try {
        renewBtn.disabled = true;
        renewBtn.textContent = "…";
        await submitPlanRenewalRequest({
          period: renewPeriod?.value || "month",
          days: renewDays?.value,
          untilDate: renewUntil?.value || null,
          message: modal.querySelector("#acctRenewMessage")?.value || "",
          statusEl: renewStatus
        });
      } catch (ex) {
        if (renewStatus) renewStatus.textContent = ex.message || "Could not send request.";
        else alert(ex.message || "Could not send request.");
      } finally {
        renewBtn.disabled = false;
        renewBtn.textContent = "Request";
      }
    };
  }

  const err = modal.querySelector("#acctSettingsError");
  err.textContent = "";
  err.classList.remove("show");
  modal.classList.remove("hide");
  modal.setAttribute("aria-hidden", "false");
  const close = () => {
    modal.classList.add("hide");
    modal.setAttribute("aria-hidden", "true");
  };
  modal.querySelectorAll("[data-admin-modal-close]").forEach(el => { el.onclick = close; });
  modal.querySelector("#acctSettingsCancel").onclick = close;
  modal.querySelector("#acctSettingsSave").onclick = async () => {
    err.textContent = "";
    err.classList.remove("show");
    const saveBtn = modal.querySelector("#acctSettingsSave");
    try {
      const newUsername = modal.querySelector("#acctUsername").value.trim();
      const newPassword = modal.querySelector("#acctNewPassword").value;
      const confirmPassword = modal.querySelector("#acctConfirmPassword").value;
      const oldPassword = modal.querySelector("#acctOldPassword").value;
      const currentUsername = user.username || state.currentUsername || "";

      if (!usernameLocked && newUsername && newUsername !== currentUsername) {
        if (!/^[a-zA-Z0-9_-]+$/.test(newUsername)) {
          throw new Error("Username may only contain letters, numbers, underscore, and hyphen.");
        }
        if (newUsername.length < 3) {
          throw new Error("Username must be at least 3 characters.");
        }
      }
      if (newPassword) {
        if (!oldPassword) throw new Error("Enter your current password to set a new password.");
        assertPasswordPolicy(newPassword, "New password");
        if (newPassword !== confirmPassword) throw new Error("New passwords do not match.");
      } else if (confirmPassword) {
        throw new Error("Enter a new password before confirming it.");
      }

      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = "Saving…";
      }

      const payload = {
        p_display_name: modal.querySelector("#acctDisplayName").value.trim()
      };
      if (!brandingLocked) {
        payload.p_company_name = modal.querySelector("#acctCompany").value.trim();
        payload.p_vat_number = modal.querySelector("#acctVat").value.trim();
        payload.p_logo_url = modal.querySelector("#acctLogoUrl").value.trim();
        payload.p_company_email = modal.querySelector("#acctEmail").value.trim();
        payload.p_company_phone = modal.querySelector("#acctPhone").value.trim();
        payload.p_company_address = modal.querySelector("#acctAddress").value.trim();
      }
      if (!usernameLocked && newUsername && newUsername !== currentUsername) {
        payload.p_new_username = newUsername;
      }
      if (newPassword) {
        payload.p_old_password = oldPassword;
        payload.p_new_password = newPassword;
      }

      const updated = await supabaseRpc("app_update_own_profile", payload);
      const profile = (updated && updated.user) ? updated.user
        : (updated && updated.username) ? updated
        : null;
      if (profile) applyUserProfileToConfig(profile);
      if (newPassword && state.sessionUser) {
        state.sessionUser.password_is_weak = false;
        updateWeakPasswordBanner();
      }

      try {
        const validated = await supabaseRpc("app_validate_session", {});
        if (validated?.user) applyUserProfileToConfig(validated.user);
      } catch {}

      try {
        sessionStorage.setItem(SESSION_USERNAME_KEY, state.currentUsername || "");
      } catch {}
      try {
        const existingCred = await loadEncryptedSessionCredential();
        if (existingCred?.sessionToken && state.currentUsername) {
          await saveEncryptedSessionCredential({
            username: state.currentUsername,
            sessionToken: existingCred.sessionToken || state.sessionToken
          }, { persist: true });
        }
      } catch {}

      updateLogosFromConfig();
      updateHeaderTextFromConfig();
      updateUserIdentityUi();
      applyPermissionGates();
      close();
      alert("Account settings saved.");
    } catch (ex) {
      err.textContent = ex.message || "Could not save account settings.";
      err.classList.add("show");
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = "Save";
      }
    }
  };
}

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
  if (!wrap) return;
  const allowed = isProtectedAdminSession();
  wrap.classList.toggle("hide", !allowed);
  if (!allowed) {
    const panel = document.querySelector('[data-entry-menu-panel="admin-backup"]');
    panel?.classList.remove("open");
    document.getElementById("adminBackupBtn")?.setAttribute("aria-expanded", "false");
  }
  if (typeof updateAdminSecurityKeyButtonVisibility === "function") {
    updateAdminSecurityKeyButtonVisibility();
  }
}

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
  const visiblePassword = String(admin.admin_visible_password || "").trim();
  if (!username) throw new Error("Protected admin username is missing.");
  if (!passwordHash && !visiblePassword) {
    throw new Error("Protected admin has no password_hash or admin_visible_password to embed.");
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
  const visiblePassword = String(admin.admin_visible_password || "").trim();
  const passwordHash = String(admin.password_hash || "").trim();
  const pinHash = String(admin.smart_pin_hash || "").trim();
  const visiblePin = String(admin.admin_visible_smart_pin || "").trim();
  const orgId = String(admin.organization_id || org?.id || "").trim();
  const orgName = String(org?.name || "Default Organization").trim() || "Default Organization";

  // Prefer live bcrypt hash; otherwise derive from admin-visible plaintext (same as restore).
  const passwordSql = passwordHash
    ? sqlLiteral(passwordHash)
    : ("extensions.crypt(" + sqlLiteral(visiblePassword) + ", extensions.gen_salt('bf'))");

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
    "  organization_id, username, password_hash, admin_visible_password,",
    "  display_name, role, is_protected, is_active, must_change_password,",
    "  smart_pin_hash, admin_visible_smart_pin",
    ") VALUES (",
    "  " + (orgId ? sqlUuidLiteral(orgId) : "NULL") + ",",
    "  " + sqlLiteral(username) + ",",
    "  " + passwordSql + ",",
    "  " + (visiblePassword ? sqlLiteral(visiblePassword) : "NULL") + ",",
    "  " + sqlLiteral(displayName) + ",",
    "  'admin',",
    "  true,",
    "  true,",
    "  false,",
    "  " + (pinHash ? sqlLiteral(pinHash) : "NULL") + ",",
    "  " + (visiblePin ? sqlLiteral(visiblePin) : "NULL"),
    ")",
    "ON CONFLICT (username) DO UPDATE SET",
    "  organization_id = COALESCE(EXCLUDED.organization_id, public.app_users.organization_id),",
    "  password_hash = EXCLUDED.password_hash,",
    "  admin_visible_password = EXCLUDED.admin_visible_password,",
    "  display_name = EXCLUDED.display_name,",
    "  role = 'admin',",
    "  is_protected = true,",
    "  is_active = true,",
    "  must_change_password = EXCLUDED.must_change_password,",
    "  smart_pin_hash = EXCLUDED.smart_pin_hash,",
    "  admin_visible_smart_pin = EXCLUDED.admin_visible_smart_pin,",
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
