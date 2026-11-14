/* Triplem VIP text weight (2026-11-14): Theme menu › Text weight.
 *
 * Titles, headings, buttons, labels and tabs use a Regular weight by default. People who prefer
 * the earlier look can choose Medium or Bold. The choice is saved to the user's own account
 * settings with the existing app_update_own_settings RPC (key TextStyle: { weight, at }), so every
 * device shows the same; a copy on this device applies it at start-up (no flash) and keeps an
 * offline change until it reaches the account. No database migration.
 *
 * html.tm-tw-regular / html.tm-tw-medium switch the weight (Assets/style/66-workspace-home-v2.css);
 * Bold adds no class, so the app's original weights apply.
 */
(function initTriplemTextStyle(global){
  "use strict";

  const SETTINGS_KEY = "TextStyle";
  const LOCAL_PREFIX = "triplem-text-style-v1:";
  const LAST_KEY = "triplem-text-style-v1-last";
  const WEIGHTS = [["regular", "Regular"], ["medium", "Medium"], ["bold", "Bold"]];
  const DEFAULT = "regular";

  const valid = v => (WEIGHTS.some(w => w[0] === v) ? v : DEFAULT);
  function st(){ try { return typeof state !== "undefined" ? state : global.state; } catch (_) { return global.state; } }
  function isGuest(){ try { return typeof isGuestMode === "function" && isGuestMode(); } catch (_) { return false; } }
  function signedIn(){ const s = st(); return !!(s?.unlocked && s?.sessionToken && s?.sessionUser && !isGuest()); }
  function userId(){ const s = st(); return String(s?.sessionUser?.id || s?.currentUsername || "").trim(); }

  function readServer(){
    try {
      const raw = st()?.sessionUser?.settings?.[SETTINGS_KEY];
      if (raw && typeof raw === "object" && Number(raw.at) > 0) return { weight: valid(raw.weight), at: Number(raw.at) };
    } catch (_) {}
    return null;
  }
  function readLocal(uid = userId()){
    if (!uid) return null;
    try {
      const raw = JSON.parse(localStorage.getItem(LOCAL_PREFIX + uid) || "null");
      if (!raw || !(Number(raw.at) > 0)) return null;
      return { weight: valid(raw.weight), at: Number(raw.at), synced: raw.synced === true };
    } catch (_) { return null; }
  }
  function writeLocal(rec, uid = userId()){
    try {
      if (uid) localStorage.setItem(LOCAL_PREFIX + uid, JSON.stringify(rec));
      localStorage.setItem(LAST_KEY, rec.weight);
    } catch (_) {}
  }

  /** The weight in use: an unsaved change on this device wins, otherwise the newer of device/account. */
  function get(){
    const local = readLocal();
    const server = readServer();
    if (local && !local.synced && (!server || local.at >= server.at)) return local.weight;
    if (server) {
      if (!local || local.at !== server.at || !local.synced) writeLocal({ weight: server.weight, at: server.at, synced: true });
      return server.weight;
    }
    if (local) return local.weight;
    try { return valid(localStorage.getItem(LAST_KEY)); } catch (_) { return DEFAULT; }
  }

  function apply(weight = get()){
    const root = document.documentElement;
    root.classList.toggle("tm-tw-regular", weight === "regular");
    root.classList.toggle("tm-tw-medium", weight === "medium");
    root.dataset.textWeight = weight;
    syncMenu(weight);
    return weight;
  }

  let queue = Promise.resolve();
  function push(){
    queue = queue.catch(() => false).then(async () => {
      const uid = userId();
      const local = readLocal(uid);
      if (!local || local.synced || !signedIn() || typeof supabaseRpc !== "function" || navigator.onLine === false) return false;
      const value = { weight: local.weight, at: local.at };
      try {
        await supabaseRpc("app_update_own_settings", { p_settings: { [SETTINGS_KEY]: value } }, { offlineCache: false });
        if (userId() !== uid) return false;
        const s = st();
        if (s?.sessionUser) s.sessionUser.settings = { ...(s.sessionUser.settings || {}), [SETTINGS_KEY]: value };
        const now = readLocal(uid);
        if (now && now.at === local.at) writeLocal({ ...now, synced: true }, uid);
        return true;
      } catch (err) {
        console.warn("Text weight will be saved to the account later:", err?.message || err);
        return false;
      }
    });
    return queue;
  }
  global.addEventListener("online", () => { push(); });

  function set(weight){
    weight = valid(weight);
    writeLocal({ weight, at: Date.now(), synced: false });
    apply(weight);
    push();
    return weight;
  }

  // ── Theme menu row ────────────────────────────────────────────────────────
  function menuHtml(){
    return `
      <div class="theme-menu-weight" role="group" aria-labelledby="tmTwLabel">
        <span class="theme-menu-toggle-icon" aria-hidden="true"><i class="fa-solid fa-font"></i></span>
        <span class="theme-menu-copy"><strong id="tmTwLabel">Text weight</strong><small>Titles, buttons and labels</small></span>
        <span class="theme-menu-seg" role="radiogroup" aria-labelledby="tmTwLabel">
          ${WEIGHTS.map(([v, l]) => `<button type="button" role="radio" data-text-weight="${v}" aria-checked="false">${l}</button>`).join("")}
        </span>
      </div>`;
  }
  function syncMenu(weight = get()){
    document.querySelectorAll("[data-text-weight]").forEach(b => b.setAttribute("aria-checked", b.dataset.textWeight === weight ? "true" : "false"));
  }
  /** Adds the row to the Theme menu (once) and wires it. */
  function mount(dropdown){
    if (!dropdown || dropdown.querySelector(".theme-menu-weight")) { syncMenu(); return; }
    const anchor = dropdown.querySelector("[data-home-customize]");
    const wrap = document.createElement("div");
    wrap.innerHTML = menuHtml().trim();
    const row = wrap.firstElementChild;
    if (anchor) anchor.insertAdjacentElement("afterend", row); else dropdown.appendChild(row);
    row.addEventListener("click", e => {
      const b = e.target.closest("[data-text-weight]");
      if (!b) return;
      e.stopPropagation();
      set(b.dataset.textWeight);
    });
    syncMenu();
  }

  // Start-up: last choice on this device straight away; the account value once signed in.
  apply();
  const mountMenu = () => { try { mount(document.getElementById("themeDropdown")); } catch (_) {} };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountMenu, { once: true });
  else mountMenu();
  // The Theme menu is rebuilt by 07-theme.js in some cases: add the row again when it opens.
  document.addEventListener("click", e => { if (e.target.closest?.("#themeSettingsBtn")) { mountMenu(); apply(); } }, true);
  global.addEventListener("triplemthemechange", () => { apply(); push(); });

  // Focus rings only for keyboard use (html.tm-kbd): a click or tap never leaves a ring around
  // the section picker or the search bar (66-workspace-home-v2.css).
  document.addEventListener("keydown", e => { if (e.key === "Tab") document.documentElement.classList.add("tm-kbd"); }, true);
  document.addEventListener("pointerdown", () => document.documentElement.classList.remove("tm-kbd"), true);

  global.TriplemTextStyle = Object.freeze({ get, set, apply, mount, push, WEIGHTS, DEFAULT });
})(typeof window !== "undefined" ? window : globalThis);
