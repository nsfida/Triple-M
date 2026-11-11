/* Triplem VIP Inventory 2.0 - access control (Phase 2, migration 215).
 *
 * - Reads which inventory versions the signed-in business may use
 *   (app_inventory_access). Team members always follow the owner.
 * - Hides Inventory V1 everywhere in the app when the Main Admin switched it off
 *   (V1 code and data are not touched).
 * - Adds the "Inventory 2.0" card to the home screen when 2.0 is on.
 * - Adds the Inventory block to the Main Admin's Admin > Edit user form (beside Accounting
 *   and Triplem AI): V1 on/off, 2.0 on/off, which opens first, plan exception.
 *
 * The server is the authority: every Inventory 2.0 function checks access again
 * (app_inv2_require_access). The cached copy only lets the card show while offline.
 * No polling: access is read once per session and when the Main Admin changes it.
 */
(function () {
  "use strict";

  const CACHE_KEY = "triplem-inv2-access-v1";
  const S = { access: null, loadedFor: "", promise: null };

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const st = () => (typeof state !== "undefined" ? state : null);
  const sessionKey = () => { const s = st(); return s && s.unlocked && s.sessionUser ? `${s.sessionUser.id}|${s.sessionToken || ""}` : ""; };
  const ownerId = () => { const u = st()?.sessionUser; return u ? (u.team_owner_id || u.id) : ""; };

  function readCache() {
    try { const all = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); return all[ownerId()] || null; } catch (_) { return null; }
  }
  function writeCache(a) {
    try { const all = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); all[ownerId()] = { ...a, cached_at: Date.now() }; localStorage.setItem(CACHE_KEY, JSON.stringify(all)); } catch (_) {}
  }

  function access() { return S.access || null; }
  function v2Enabled() { return !!(S.access && S.access.v2_enabled); }
  function v1Hidden() { return !!(S.access && S.access.v1_enabled === false); }

  function apply() {
    const root = document.documentElement;
    root.classList.toggle("tm-inv-v1-off", v1Hidden());
    root.classList.toggle("tm-inv-v2-on", v2Enabled());
    // Leave V1 if it was open when it got switched off.
    try {
      if (v1Hidden() && document.querySelector('#app > .tabs .tab[data-tab="goods"].active') && typeof activate === "function") activate("home");
    } catch (_) {}
    try { if (typeof renderWorkspaceHome === "function" && st()?.unlocked) renderWorkspaceHome(); } catch (_) {}
    try { window.TriplemInventoryV2Shell?.onAccessChanged?.(S.access); } catch (_) {}
  }

  async function refreshAccess(force = false) {
    const key = sessionKey();
    if (!key) return null;
    if (!force && S.loadedFor === key && S.access) return S.access;
    if (S.promise && !force) return S.promise;
    if (!S.access) { S.access = readCache(); if (S.access) apply(); }
    if (typeof isGuestMode === "function" && isGuestMode()) { S.access = null; apply(); return null; }
    if (navigator.onLine === false || typeof supabaseRpc !== "function") return S.access;
    S.promise = (async () => {
      try {
        const a = await supabaseRpc("app_inventory_access", {}, { offlineCache: false });
        if (sessionKey() !== key) return S.access;
        S.access = a && typeof a === "object" ? a : null;
        S.loadedFor = key;
        if (S.access) writeCache(S.access);
        apply();
      } catch (_) { /* older database without migration 215: behave exactly as before */ }
      return S.access;
    })().finally(() => { S.promise = null; });
    return S.promise;
  }

  function reset() {
    S.access = null; S.loadedFor = ""; S.promise = null;
    document.documentElement.classList.remove("tm-inv-v1-off", "tm-inv-v2-on");
    try { window.TriplemInventoryV2Shell?.close?.({ force: true }); } catch (_) {}
  }

  // ---- Home screen card -----------------------------------------------------------------
  function decorateHome(grid) {
    if (!grid || !v2Enabled()) return;
    if (grid.querySelector('[data-workspace-tab="inventory2"]')) return;
    const tpl = document.createElement("template");
    if (typeof window.workspaceHomeCardHtml === "function") {
      tpl.innerHTML = window.workspaceHomeCardHtml({ key: "inventory2", rawKey: "inventory2", label: "Inventory 2.0", copy: "POS, stock, purchases, customers and suppliers." }).trim();
    } else {
      tpl.innerHTML = `<div class="workspace-home-card wh2-card workspace-home-card--inventory2" role="button" tabindex="0" data-workspace-tab="inventory2" data-home-key="inventory2" data-default-label="Inventory 2.0"><span class="wh2-icon"><img class="wh2-img" src="Assets/logo/icons/home/inventory2.svg" alt="" aria-hidden="true"></span><span class="wh2-text"><strong class="wh2-label">Inventory 2.0</strong></span></div>`;
    }
    const card = tpl.content.firstElementChild;
    // Opening and the ⋮ menu are handled by the Home grid (01-render-navigation.js).
    // Primary version first; otherwise next to where V1 sits (or at the end).
    const v1Card = grid.querySelector('[data-workspace-tab="goods"]');
    if (S.access?.primary_version === "v2") grid.insertBefore(card, grid.firstElementChild);
    else if (v1Card) v1Card.after(card);
    else grid.appendChild(card);
    card.style.setProperty("--workspace-card-index", String([...grid.children].indexOf(card)));
  }

  function open() {
    if (!v2Enabled()) return;
    try { window.TriplemInventoryV2Shell?.open?.(); } catch (e) { console.error(e); }
  }

  // ---- Main Admin: Inventory access in Admin > Edit user (beside Accounting / Triplem AI) -----
  function isProtectedAdmin() {
    try { return typeof isProtectedAdminSession === "function" ? !!isProtectedAdminSession() : !!(st()?.sessionUser?.role === "admin" && st()?.sessionUser?.is_protected); } catch (_) { return false; }
  }
  const PLAN_LABEL = { trial: "Trial", full: "Full / Pro", legacy: "No plan (legacy)" };
  const v1TabBox = root => root.querySelector('[data-check-group$="Tabs"] input[value="inventory"]');

  // Called after the Edit form is built. Loads the switches and keeps the V1 switch in
  // step with the "Inventory & Customers" tab (which is what enforces V1 on the server).
  async function mountEditSection(body, user) {
    if (!body || !user || !isProtectedAdmin() || typeof supabaseRpc !== "function") return;
    let box = body.querySelector("[data-inv2-edit]");
    if (!box) {
      box = document.createElement("div");
      box.className = "inv2-edit-block";
      box.dataset.inv2Edit = "";
      const anchor = body.querySelector("[data-admin-triplem-ai-access]") || body.querySelector("[data-admin-insurance-access]");
      if (anchor) anchor.after(box); else body.prepend(box);
    }
    box.innerHTML = `<div class="inv2-edit-head"><span class="inv2-edit-icon"><i class="fa-solid fa-boxes-stacked" aria-hidden="true"></i></span><div><strong>Inventory</strong><small>Loading access…</small></div></div>`;
    let a;
    try { a = await supabaseRpc("app_admin_inventory_access_get", { p_user_id: user.id }, { offlineCache: false }); }
    catch (e) { box.innerHTML = `<div class="inv2-edit-head"><span class="inv2-edit-icon"><i class="fa-solid fa-boxes-stacked" aria-hidden="true"></i></span><div><strong>Inventory</strong><small>Inventory 2.0 settings are not available yet (database migration 215 is needed).</small></div></div>`; return; }
    box._inv2 = { user, initial: a };
    renderEditSection(box, a);
  }

  function sw(key, label, hint, on, disabled) {
    return `<label class="inv2-edit-row${disabled ? " is-locked" : ""}">
      <span class="inv2-edit-copy"><strong>${label}</strong><small>${hint}</small></span>
      <span class="inv2-switch"><input type="checkbox" data-inv2="${key}"${on ? " checked" : ""}${disabled ? " disabled" : ""}><span aria-hidden="true"></span><em>${on ? "On" : "Off"}</em></span>
    </label>`;
  }

  function renderEditSection(box, a) {
    const body = box.closest("#adminEditFormBody") || box.parentElement;
    const team = !!a.is_team_member, mainAdmin = !!a.is_main_admin;
    const tabBox = body ? v1TabBox(body) : null;
    const v1On = tabBox ? (tabBox.checked && a.v1_enabled) : a.v1_enabled;
    const planLine = mainAdmin ? "Main Admin: always included" : `${esc(PLAN_LABEL[a.plan] || a.plan)} plan · ${a.plan_includes_v2 ? "includes Inventory 2.0" : "does not include Inventory 2.0"}`;
    box.innerHTML = `
      <div class="inv2-edit-head">
        <span class="inv2-edit-icon"><i class="fa-solid fa-boxes-stacked" aria-hidden="true"></i></span>
        <div><strong>Inventory</strong><small>${team ? "Team members follow their company account; change it on the company account." : "Main Admin controlled. Switching a version off hides it and never deletes its data."}</small></div>
        <span class="inv2-edit-plan">${planLine}</span>
      </div>
      <div class="inv2-edit-rows">
        ${sw("v1", "Inventory V1", "The current Inventory &amp; Customers section", v1On, team)}
        ${sw("v2", "Inventory 2.0", "Point of sale, stock, purchases, customers and suppliers", a.v2_switch, team)}
        <div class="inv2-edit-row inv2-edit-primary" data-inv2="primary-row">
          <span class="inv2-edit-copy"><strong>Opens first</strong><small>When both versions are on</small></span>
          <span class="inv2-seg" role="radiogroup" aria-label="Primary inventory version">
            <button type="button" role="radio" data-inv2-primary="v1" aria-checked="${a.primary_version !== "v2"}">V1</button>
            <button type="button" role="radio" data-inv2-primary="v2" aria-checked="${a.primary_version === "v2"}">2.0</button>
          </span>
        </div>
        ${!mainAdmin && !a.plan_includes_v2 ? sw("override", "Allow 2.0 outside the plan", "This plan does not include Inventory 2.0; allow it for this account only", a.v2_plan_override, team) : ""}
      </div>
      <div class="inv2-edit-foot"><button type="button" class="inv2-edit-link" data-inv2="plans"><i class="fa-solid fa-sliders" aria-hidden="true"></i> Inventory 2.0 by plan</button></div>`;
    box.dataset.primary = a.primary_version === "v2" ? "v2" : "v1";
    const q = k => box.querySelector(`[data-inv2="${k}"]`);
    const sync = () => {
      box.querySelectorAll(".inv2-switch").forEach(l => { const i = l.querySelector("input"); l.querySelector("em").textContent = i.checked ? "On" : "Off"; });
      const both = q("v1")?.checked && q("v2")?.checked;
      q("primary-row").classList.toggle("is-disabled", !both || team);
      box.querySelectorAll("[data-inv2-primary]").forEach(b => { b.disabled = !both || team; b.setAttribute("aria-checked", String(b.dataset.inv2Primary === box.dataset.primary)); });
    };
    box.querySelectorAll("[data-inv2-primary]").forEach(b => b.addEventListener("click", () => { box.dataset.primary = b.dataset.inv2Primary; sync(); }));
    box.querySelectorAll(".inv2-switch input").forEach(i => i.addEventListener("change", sync));
    // V1 switch <-> "Inventory & Customers" tab checkbox (server permission for V1).
    if (tabBox && !team) {
      q("v1").addEventListener("change", () => { tabBox.checked = q("v1").checked; });
      tabBox.addEventListener("change", () => { q("v1").checked = tabBox.checked; sync(); });
    }
    q("plans")?.addEventListener("click", () => openPlanDefaults());
    sync();
  }

  // Called by the Edit form's Save, after the user's tabs were saved.
  async function saveEditSection(modal, user) {
    const box = modal?.querySelector("[data-inv2-edit]");
    if (!box || !box._inv2 || box._inv2.initial.is_team_member) return null;
    const a = box._inv2.initial;
    const q = k => box.querySelector(`[data-inv2="${k}"]`);
    const next = { v1: !!q("v1")?.checked, v2: !!q("v2")?.checked, primary: box.dataset.primary || "v1", override: q("override") ? !!q("override").checked : !!a.v2_plan_override };
    const changed = next.v1 !== !!a.v1_enabled || next.v2 !== !!a.v2_switch || next.override !== !!a.v2_plan_override
      || (next.v1 && next.v2 && next.primary !== (a.primary_version || "v1")) || !a.configured;
    if (!changed) return null;
    if (!next.v1 && !next.v2 && !confirm("Both inventory versions will be off for this account. Their data is kept. Continue?")) throw new Error("Not saved: both inventory versions would be off.");
    const res = await supabaseRpc("app_admin_inventory_access_set", { p_user_id: user.id, p_v1_enabled: next.v1, p_v2_enabled: next.v2, p_primary_version: next.primary, p_v2_plan_override: next.override }, { offlineCache: false });
    if (ownerId() === res.owner_id) refreshAccess(true);
    return res;
  }

  async function openPlanDefaults() {
    let m = document.getElementById("inv2PlanDefaultsModal");
    if (!m) { m = document.createElement("div"); m.id = "inv2PlanDefaultsModal"; m.className = "modal"; document.body.appendChild(m); }
    const close = () => { m.classList.add("hide"); m.innerHTML = ""; };
    m.classList.remove("hide");
    m.innerHTML = `<div class="modal-backdrop" data-close></div><div class="modal-dialog settings-sheet inv2-plan-sheet" role="dialog" aria-modal="true" aria-labelledby="inv2PlanTitle"><div class="settings-sheet-head"><div><h3 id="inv2PlanTitle">Inventory 2.0 by plan</h3><p>Which plans include Inventory 2.0. Accounts still need it switched on.</p></div><button type="button" class="btn ghost tiny" data-close aria-label="Close">✕</button></div><div class="modal-body settings-sheet-body" data-body><p class="inv2-admin-muted">Loading…</p></div></div>`;
    m.querySelectorAll("[data-close]").forEach(el => el.addEventListener("click", close));
    const body = m.querySelector("[data-body]");
    const label = { trial: "Trial", full: "Full / Pro", legacy: "No plan (legacy accounts)" };
    const render = rows => {
      body.innerHTML = rows.map(r => `<label class="inv2-admin-switch"><input type="checkbox" data-plan="${esc(r.access_plan)}"${r.includes_v2 ? " checked" : ""}><span><strong>${esc(label[r.access_plan] || r.access_plan)}</strong><small>${r.includes_v2 ? "Includes Inventory 2.0" : "Does not include Inventory 2.0"}</small></span></label>`).join("") + `<p class="inv2-admin-error" data-err role="alert"></p>`;
      body.querySelectorAll("[data-plan]").forEach(cb => cb.addEventListener("change", async () => {
        cb.disabled = true;
        try { render(await supabaseRpc("app_admin_inventory_plan_set", { p_access_plan: cb.dataset.plan, p_includes_v2: cb.checked }, { offlineCache: false })); }
        catch (e) { cb.checked = !cb.checked; cb.disabled = false; body.querySelector("[data-err]").textContent = e.message || String(e); }
      }));
    };
    try { render(await supabaseRpc("app_admin_inventory_plans_get", {}, { offlineCache: false })); }
    catch (e) { body.innerHTML = `<p class="inv2-admin-error">${esc(e.message || e)}</p>`; }
  }

  window.addEventListener("online", () => { if (sessionKey() && S.loadedFor !== sessionKey()) refreshAccess(); });

  window.TriplemInventoryV2 = { refreshAccess, access, v2Enabled, v1Hidden, decorateHome, open, reset, mountEditSection, saveEditSection };
})();
