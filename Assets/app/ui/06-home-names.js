/* Triplem VIP Home - your own names for the section cards (2026-11-11).
 *
 * Every card on Triplem VIP Home has a ⋮ button with "Rename" and "Restore original name".
 * Names are saved to the user's own account settings with the existing app_update_own_settings
 * RPC (key HomeNames: { names: { <section>: "<name>" }, at }), so every device shows the same
 * names. A copy is kept on this device, so a rename also works offline and is saved to the
 * account as soon as the connection is back. Nothing else changes: the section itself, its
 * records and other users are not affected, and no database migration is needed.
 */
(function initTriplemHomeNames(global){
  "use strict";

  const SETTINGS_KEY = "HomeNames";
  const LOCAL_PREFIX = "triplem-home-names-v1:";
  const MAX_LEN = 32;
  const KEY_RE = /^[a-z][a-z0-9-]{0,39}$/;

  function st(){ try { return typeof state !== "undefined" ? state : global.state; } catch (_) { return global.state; } }
  function userId(){ const s = st(); return String(s?.sessionUser?.id || s?.currentUsername || "guest").trim() || "guest"; }
  function isGuest(){ try { return typeof isGuestMode === "function" && isGuestMode(); } catch (_) { return false; } }
  function signedIn(){ const s = st(); return !!(s?.unlocked && s?.sessionToken && s?.sessionUser && !isGuest()); }
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /** Trims, removes control characters and collapses spaces; "" means "use the original name". */
  function cleanName(value){
    return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_LEN).trim();
  }
  function normalizeNames(value){
    const out = {};
    if (!value || typeof value !== "object" || Array.isArray(value)) return out;
    for (const [k, v] of Object.entries(value)) {
      const key = String(k || "").trim();
      const name = cleanName(v);
      if (KEY_RE.test(key) && name) out[key] = name;
      if (Object.keys(out).length >= 40) break;
    }
    return out;
  }
  function normalizeRecord(value){
    if (!value || typeof value !== "object") return null;
    const at = Number(value.at);
    if (!Number.isFinite(at) || at <= 0) return null;
    return { names: normalizeNames(value.names), at };
  }
  function readLocal(uid = userId()){
    try {
      const raw = JSON.parse(localStorage.getItem(LOCAL_PREFIX + uid) || "null");
      const rec = normalizeRecord(raw);
      return rec ? { ...rec, synced: raw.synced === true } : null;
    } catch (_) { return null; }
  }
  function writeLocal(rec, uid = userId()){ try { localStorage.setItem(LOCAL_PREFIX + uid, JSON.stringify(rec)); } catch (_) {} }
  function readServer(){ try { return normalizeRecord(st()?.sessionUser?.settings?.[SETTINGS_KEY]); } catch (_) { return null; } }

  /** A rename on this device that is not on the account yet wins, unless the account has a newer one. */
  function effective(){
    const uid = userId();
    const local = readLocal(uid);
    const server = readServer();
    if (local && !local.synced && (!server || local.at >= server.at)) return local.names;
    if (server) {
      if (!local || local.at !== server.at || !local.synced) writeLocal({ ...server, synced: true }, uid);
      return server.names;
    }
    return local ? local.names : {};
  }

  let queue = Promise.resolve();
  function pushPending(){
    queue = queue.catch(() => false).then(async () => {
      const uid = userId();
      const local = readLocal(uid);
      if (!local || local.synced || !signedIn() || typeof supabaseRpc !== "function") return false;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
      const rec = { names: local.names, at: local.at };
      try {
        const updated = await supabaseRpc("app_update_own_settings", { p_settings: { [SETTINGS_KEY]: rec } }, { offlineCache: false });
        if (userId() !== uid) return false;
        const s = st();
        if (updated && typeof updated === "object" && typeof applyUserProfileToConfig === "function") applyUserProfileToConfig(updated);
        if (s?.sessionUser) s.sessionUser.settings = { ...(s.sessionUser.settings || {}), [SETTINGS_KEY]: rec };
        const now = readLocal(uid);
        if (now && now.at === rec.at) writeLocal({ ...rec, synced: true }, uid);
        return true;
      } catch (err) {
        console.warn("Home card names will sync later:", err?.message || err);
        return false;
      }
    });
    return queue;
  }
  let lastRetry = 0;
  function retrySoon(){
    const local = readLocal();
    if (local && !local.synced && Date.now() - lastRetry > 30000) { lastRetry = Date.now(); pushPending(); }
  }

  function custom(key){ return effective()[String(key || "")] || ""; }
  function label(key, fallback){ return custom(key) || fallback; }
  function set(key, name){
    key = String(key || "").trim();
    if (!KEY_RE.test(key)) return Promise.resolve(false);
    const names = { ...effective() };
    const clean = cleanName(name);
    if (clean) names[key] = clean; else delete names[key];
    const prev = readLocal();
    const at = Math.max(Date.now(), (prev?.at || 0) + 1, (readServer()?.at || 0) + 1);
    writeLocal({ names, at, synced: isGuest() });
    try { global.dispatchEvent(new CustomEvent("triplem:home-names-changed", { detail: { key, name: clean } })); } catch (_) {}
    if (isGuest()) return Promise.resolve(true);
    return pushPending();
  }
  function reset(key){ return set(key, ""); }

  // ── ⋮ menu ────────────────────────────────────────────────────────────────

  let menuEl = null;
  let menuFor = null;
  function closeMenu(){
    if (!menuEl) return;
    menuEl.remove();
    menuEl = null;
    if (menuFor) { menuFor.setAttribute("aria-expanded", "false"); menuFor.closest(".workspace-home-card")?.classList.remove("is-menu-open"); }
    menuFor = null;
    document.removeEventListener("pointerdown", onOutside, true);
    document.removeEventListener("keydown", onMenuKey, true);
    global.removeEventListener("resize", closeMenu);
    global.removeEventListener("scroll", closeMenu, true);
  }
  function onOutside(e){ if (menuEl && !menuEl.contains(e.target) && e.target !== menuFor && !menuFor?.contains(e.target)) closeMenu(); }
  function onMenuKey(e){
    if (!menuEl) return;
    const items = [...menuEl.querySelectorAll("button")];
    const i = items.indexOf(document.activeElement);
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); const b = menuFor; closeMenu(); b?.focus(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === "Tab") closeMenu();
  }

  /** Opens the ⋮ menu of a Home card. opts: { key, defaultLabel, onOpen } */
  function openMenu(button, opts){
    if (menuFor === button) { closeMenu(); return; }
    closeMenu();
    const key = opts.key;
    const renamed = !!custom(key);
    menuEl = document.createElement("div");
    menuEl.className = "home-card-menu";
    menuEl.setAttribute("role", "menu");
    menuEl.setAttribute("aria-label", `${opts.currentLabel} options`);
    menuEl.innerHTML = `
      <button type="button" role="menuitem" data-act="open"><i class="fa-solid fa-arrow-right-to-bracket" aria-hidden="true"></i>Open</button>
      <button type="button" role="menuitem" data-act="rename"><i class="fa-solid fa-pen" aria-hidden="true"></i>Rename</button>
      ${renamed ? `<button type="button" role="menuitem" data-act="reset"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i>Restore “${esc(opts.defaultLabel)}”</button>` : ""}
      ${opts.onHide ? `<button type="button" role="menuitem" data-act="hide"><i class="fa-regular fa-eye-slash" aria-hidden="true"></i>Hide from Home</button>` : ""}`;
    document.body.appendChild(menuEl);
    menuFor = button;
    button.setAttribute("aria-expanded", "true");
    button.closest(".workspace-home-card")?.classList.add("is-menu-open");
    const r = button.getBoundingClientRect();
    const mw = menuEl.offsetWidth, mh = menuEl.offsetHeight;
    const vw = document.documentElement.clientWidth, vh = global.innerHeight;
    let left = r.right - mw;
    if (left < 8) left = Math.min(r.left, vw - mw - 8);
    let top = r.bottom + 6;
    if (top + mh > vh - 8) top = Math.max(8, r.top - mh - 6);
    menuEl.style.left = `${Math.max(8, left)}px`;
    menuEl.style.top = `${top}px`;
    menuEl.addEventListener("click", e => {
      const act = e.target.closest("button")?.dataset.act;
      if (!act) return;
      closeMenu();
      if (act === "open") opts.onOpen?.();
      else if (act === "rename") openRename(opts);
      else if (act === "reset") reset(key);
      else if (act === "hide") opts.onHide?.();
    });
    document.addEventListener("pointerdown", onOutside, true);
    document.addEventListener("keydown", onMenuKey, true);
    global.addEventListener("resize", closeMenu);
    global.addEventListener("scroll", closeMenu, true);
    requestAnimationFrame(() => menuEl?.querySelector("button")?.focus({ preventScroll: true }));
  }

  // ── Rename dialog ─────────────────────────────────────────────────────────

  function openRename(opts){
    const back = document.createElement("div");
    back.className = "home-rename-backdrop";
    back.innerHTML = `
      <form class="home-rename-dialog" role="dialog" aria-modal="true" aria-labelledby="homeRenameTitle" novalidate>
        <div class="home-rename-head">
          <img src="${esc(opts.icon)}" alt="" aria-hidden="true">
          <div><strong id="homeRenameTitle">Rename card</strong><small>Only your Home screen changes. The section and its records stay the same.</small></div>
        </div>
        <label class="home-rename-field"><span>Card name</span>
          <input type="text" name="name" maxlength="${MAX_LEN}" autocomplete="off" spellcheck="false" value="${esc(opts.currentLabel)}" placeholder="${esc(opts.defaultLabel)}">
          <em class="home-rename-count" aria-live="polite"></em>
        </label>
        <p class="home-rename-hint">Original name: <b>${esc(opts.defaultLabel)}</b>. Leave empty to restore it.</p>
        <div class="home-rename-actions">
          <button type="button" class="btn ghost" data-cancel>Cancel</button>
          <button type="submit" class="btn primary">Save name</button>
        </div>
      </form>`;
    document.body.appendChild(back);
    const form = back.querySelector("form");
    const input = form.querySelector("input");
    const count = form.querySelector(".home-rename-count");
    const upd = () => { count.textContent = `${input.value.length}/${MAX_LEN}`; };
    const prevFocus = document.activeElement;
    const close = () => {
      back.remove();
      document.removeEventListener("keydown", onKey, true);
      try { prevFocus?.focus?.({ preventScroll: true }); } catch (_) {}
    };
    const onKey = e => {
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); close(); }
      else if (e.key === "Tab") {
        const f = [...form.querySelectorAll("input,button")];
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener("keydown", onKey, true);
    input.addEventListener("input", upd);
    upd();
    form.querySelector("[data-cancel]").addEventListener("click", close);
    back.addEventListener("pointerdown", e => { if (e.target === back) close(); });
    form.addEventListener("submit", e => {
      e.preventDefault();
      const name = cleanName(input.value);
      set(opts.key, name === opts.defaultLabel ? "" : name);
      close();
    });
    requestAnimationFrame(() => { input.focus(); input.select(); });
  }

  global.addEventListener("online", () => pushPending());
  global.TriplemHomeNames = { label, custom, set, reset, openMenu, closeMenu, retrySoon, cleanName, normalizeNames, MAX_LEN };
})(typeof window !== "undefined" ? window : globalThis);
