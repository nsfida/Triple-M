/* Triplem VIP Expenses Style (2026-11-12): how the wallets look, chosen by each user.
 *
 * The palette button next to "Expenses History" opens a side panel (a bottom sheet on phones)
 * beside the wallets, so every change is seen at once. Saved to the user's own account settings
 * with the existing app_update_own_settings RPC (key ExpensesStyle), so every device shows the
 * same; a copy on this device applies it at start-up and keeps an offline change until it
 * reaches the account. Nothing is written until the person changes something. No migration.
 */
(function initTriplemExpensesStyle(global){
  "use strict";

  const SETTINGS_KEY = "ExpensesStyle";
  const LOCAL_PREFIX = "triplem-expenses-style-v1:";
  const SIZE = { min: 80, max: 120, step: 5, def: 100 };
  const CHOICES = {
    look: [["soft", "Soft"], ["solid", "Solid"], ["vivid", "Vivid"]],
    accent: [["wallet", "Per wallet"], ["brand", "Teal & gold"], ["mono", "Neutral"]],
    motion: [["zoom", "Zoom"], ["lift", "Lift"], ["none", "None"]],
    sort: [["custom", "My order"], ["balance", "Balance"], ["spent", "Spent"], ["name", "Name"]],
    phone: [["2", "2 per row"], ["1", "1 per row"]],
    corners: [["round", "Round"], ["soft", "Soft"], ["square", "Square"]],
    density: [["comfortable", "Comfortable"], ["compact", "Compact"]],
    labels: [["text", "Icon + text"], ["icons", "Icons only"]],
    wt: [["regular", "Regular"], ["bold", "Bold"]],
    bal: [["regular", "Regular"], ["bold", "Bold"]],
    st: [["regular", "Regular"], ["bold", "Bold"]],
    sb: [["regular", "Regular"], ["bold", "Bold"]],
    sl: [["regular", "Regular"], ["bold", "Bold"]],
    sum: [["center", "Centred"], ["classic", "Classic"]]
  };
  const CLASS_CHOICES = ["look", "accent", "motion", "phone", "corners", "density", "labels", "wt", "bal", "st", "sb", "sl", "sum"];
  const SWITCHES = ["meter", "summary", "privacy", "logo", "shadow", "hicons"];
  const DEFAULTS = Object.freeze({ size: 100, look: "soft", accent: "wallet", motion: "zoom", sort: "custom", phone: "2",
    corners: "round", density: "comfortable", labels: "text", wt: "regular", bal: "regular", st: "regular", sb: "regular", sl: "regular", sum: "center",
    meter: true, summary: true, privacy: false, logo: true, shadow: true, hicons: true });

  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pick = (v, name) => (CHOICES[name].some(c => c[0] === String(v)) ? String(v) : DEFAULTS[name]);
  function normalize(v){
    v = v && typeof v === "object" ? v : {};
    const size = Math.round(Number(v.size ?? SIZE.def) / SIZE.step) * SIZE.step;
    return {
      size: Number.isFinite(size) ? Math.min(SIZE.max, Math.max(SIZE.min, size)) : SIZE.def,
      look: pick(v.look, "look"), accent: pick(v.accent, "accent"), motion: pick(v.motion, "motion"),
      sort: pick(v.sort, "sort"), phone: pick(v.phone, "phone"),
      corners: pick(v.corners, "corners"), density: pick(v.density, "density"), labels: pick(v.labels, "labels"),
      wt: pick(v.wt, "wt"), bal: pick(v.bal, "bal"), st: pick(v.st, "st"), sb: pick(v.sb, "sb"), sl: pick(v.sl, "sl"), sum: pick(v.sum, "sum"),
      meter: v.meter !== false, summary: v.summary !== false, privacy: v.privacy === true,
      logo: v.logo !== false, shadow: v.shadow !== false, hicons: v.hicons !== false
    };
  }

  function st(){ try { return typeof state !== "undefined" ? state : global.state; } catch (_) { return global.state; } }
  function isGuest(){ try { return typeof isGuestMode === "function" && isGuestMode(); } catch (_) { return false; } }
  function signedIn(){ const s = st(); return !!(s?.unlocked && s?.sessionToken && s?.sessionUser && !isGuest()); }
  function userId(){ const s = st(); return String(s?.sessionUser?.id || s?.currentUsername || "device").trim() || "device"; }
  function readServer(){
    try { const raw = st()?.sessionUser?.settings?.[SETTINGS_KEY]; if (raw && Number(raw.at) > 0) return { style: normalize(raw), at: Number(raw.at) }; } catch (_) {}
    return null;
  }
  function readLocal(uid = userId()){
    try { const raw = JSON.parse(localStorage.getItem(LOCAL_PREFIX + uid) || "null"); if (raw && Number(raw.at) > 0) return { style: normalize(raw.style), at: Number(raw.at), synced: raw.synced === true }; } catch (_) {}
    return null;
  }
  function writeLocal(rec, uid = userId()){ try { localStorage.setItem(LOCAL_PREFIX + uid, JSON.stringify(rec)); } catch (_) {} }

  function get(){
    const local = readLocal();
    const server = readServer();
    if (local && !local.synced && (!server || local.at >= server.at)) return local.style;
    if (server) {
      if (!local || local.at !== server.at || !local.synced) writeLocal({ style: server.style, at: server.at, synced: true });
      return server.style;
    }
    return local ? local.style : normalize({});
  }

  let queue = Promise.resolve();
  let timer = 0;
  function pushPending(){
    queue = queue.catch(() => false).then(async () => {
      const uid = userId();
      const local = readLocal(uid);
      if (!local || local.synced || !signedIn() || typeof supabaseRpc !== "function" || navigator.onLine === false) return false;
      const value = { ...local.style, at: local.at };
      try {
        const updated = await supabaseRpc("app_update_own_settings", { p_settings: { [SETTINGS_KEY]: value } }, { offlineCache: false });
        if (userId() !== uid) return false;
        if (updated && typeof updated === "object" && typeof applyUserProfileToConfig === "function") applyUserProfileToConfig(updated);
        const s = st();
        if (s?.sessionUser) s.sessionUser.settings = { ...(s.sessionUser.settings || {}), [SETTINGS_KEY]: value };
        const now = readLocal(uid);
        if (now && now.at === local.at) writeLocal({ ...now, synced: true }, uid);
        return true;
      } catch (err) { console.warn("Expenses style will be saved to the account later:", err?.message || err); return false; }
    });
    return queue;
  }
  const schedulePush = (ms = 600) => { clearTimeout(timer); timer = setTimeout(pushPending, ms); };
  global.addEventListener("online", () => schedulePush(50));

  /** Classes and variables only (no re-render). */
  function apply(style = get()){
    const root = document.documentElement;
    const sec = document.getElementById("walletsOverviewSection");
    root.classList.toggle("ev-privacy", style.privacy);
    root.classList.toggle("ev-no-hicons", !style.hicons);
    if (!sec) return style;
    sec.style.setProperty("--ev-card-zoom", String(style.size / 100));
    for (const name of CLASS_CHOICES) {
      for (const [v] of CHOICES[name]) sec.classList.toggle(`ev-${name}-${v}`, style[name] === v);
    }
    sec.classList.toggle("ev-no-meter", !style.meter);
    sec.classList.toggle("ev-no-summary", !style.summary);
    sec.classList.toggle("ev-no-logo", !style.logo);
    sec.classList.toggle("ev-no-shadow", !style.shadow);
    const eye = document.getElementById("ev2PrivacyBtn");
    if (eye) {
      eye.setAttribute("aria-pressed", String(style.privacy));
      eye.title = style.privacy ? "Show amounts" : "Hide amounts";
      eye.setAttribute("aria-label", eye.title);
      eye.innerHTML = `<i class="fa-solid ${style.privacy ? "fa-eye-slash" : "fa-eye"}" aria-hidden="true"></i>`;
    }
    return style;
  }

  /** Wallet order for the cards (custom = the order the person arranged). */
  function sortAccounts(accounts){
    const s = get().sort;
    if (s === "custom" || !Array.isArray(accounts)) return accounts;
    const list = accounts.slice();
    if (s === "balance") list.sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0));
    else if (s === "spent") list.sort((a, b) => Number(b.spentMoney || 0) - Number(a.spentMoney || 0));
    else if (s === "name") list.sort((a, b) => String(a.person_name || "").localeCompare(String(b.person_name || ""), undefined, { sensitivity: "base" }));
    return list;
  }

  function set(patch){
    const before = get();
    const next = normalize({ ...before, ...patch });
    const prev = readLocal();
    const at = Math.max(Date.now(), (prev?.at || 0) + 1, (readServer()?.at || 0) + 1);
    writeLocal({ style: next, at, synced: !signedIn() });
    apply(next);
    if (next.sort !== before.sort && typeof renderExpenseOverviewWallets === "function") {
      try { renderExpenseOverviewWallets(); } catch (_) {}
    }
    syncControls(next);
    if (signedIn()) schedulePush();
    return next;
  }
  const reset = () => set(normalize({}));

  // ── panel ────────────────────────────────────────────────────────────────
  let panel = null;
  const seg = (name, label, style) => `
      <div class="hs-row">
        <span class="hs-row-label" id="es-${name}-l">${esc(label)}</span>
        <div class="hs-seg" role="radiogroup" aria-labelledby="es-${name}-l">
          ${CHOICES[name].map(([v, t]) => `<button type="button" role="radio" data-es-set="${name}" data-es-value="${v}" aria-checked="${style[name] === v}">${esc(t)}</button>`).join("")}
        </div>
      </div>`;
  const sw = (name, label, note, style) => `
      <button type="button" class="hs-switch" role="switch" data-es-toggle="${name}" aria-checked="${!!style[name]}">
        <span class="hs-switch-copy"><b>${esc(label)}</b><small>${esc(note)}</small></span>
        <span class="hs-switch-track" aria-hidden="true"><i></i></span>
      </button>`;

  function html(style){
    return `
      <div class="hs-head">
        <div><strong id="esTitle">Expenses Style</strong><small>Changes show at once and are saved to your account.</small></div>
        <button type="button" class="hs-close" data-es-close aria-label="Close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
      </div>
      <div class="hs-body">
        <section class="hs-section">
          <h3>Cards</h3>
          <label class="hs-range" for="esSize">
            <span class="hs-range-head"><b>Card size</b><output data-es-size-out>${style.size}%</output></span>
            <span class="hs-range-row"><i class="fa-solid fa-minus" aria-hidden="true"></i>
              <input id="esSize" type="range" min="${SIZE.min}" max="${SIZE.max}" step="${SIZE.step}" value="${style.size}" data-es-size>
            <i class="fa-solid fa-plus" aria-hidden="true"></i></span>
          </label>
          ${seg("look", "Card look", style)}
          ${seg("accent", "Colours", style)}
          ${seg("corners", "Corners", style)}
          ${seg("density", "Spacing", style)}
          ${seg("motion", "Hover effect", style)}
          ${seg("phone", "On phones", style)}
          ${sw("shadow", "Card shadow", "Soft shadow under each card", style)}
        </section>
        <section class="hs-section">
          <h3>Text</h3>
          ${seg("wt", "Wallet name", style)}
          ${seg("bal", "Wallet balance", style)}
          ${seg("st", "Summary title", style)}
          ${seg("sb", "Summary balance", style)}
          ${seg("sl", "Summary totals", style)}
          ${seg("sum", "Summary layout", style)}
        </section>
        <section class="hs-section">
          <h3>Wallets</h3>
          ${seg("sort", "Order", style)}
          ${seg("labels", "Card buttons", style)}
          ${sw("logo", "Wallet logos", "Logo beside each wallet name", style)}
          ${sw("meter", "Spent bar", "How much of the money received is spent", style)}
          ${sw("summary", "Summary card", "Totals per currency", style)}
          ${sw("privacy", "Hide amounts", "Blur figures until you point at a card", style)}
        </section>
        <section class="hs-section">
          <h3>Expenses History</h3>
          ${sw("hicons", "Category icons", "Icon at the start of each row", style)}
        </section>
      </div>
      <div class="hs-foot">
        <button type="button" class="btn ghost" data-es-reset><i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Reset to default</button>
        <button type="button" class="btn primary" data-es-close>Done</button>
      </div>`;
  }

  function syncControls(style = get()){
    if (!panel) return;
    panel.querySelectorAll("[data-es-set]").forEach(b => b.setAttribute("aria-checked", String(style[b.dataset.esSet] === b.dataset.esValue)));
    panel.querySelectorAll("[data-es-toggle]").forEach(b => b.setAttribute("aria-checked", String(!!style[b.dataset.esToggle])));
    const r = panel.querySelector("[data-es-size]");
    if (r && Number(r.value) !== style.size) r.value = String(style.size);
    if (r) r.style.setProperty("--hs-fill", `${((style.size - SIZE.min) / (SIZE.max - SIZE.min)) * 100}%`);
    const o = panel.querySelector("[data-es-size-out]"); if (o) o.textContent = `${style.size}%`;
  }

  function placePanel(){
    if (!panel) return;
    if (global.innerWidth <= 700) { panel.style.top = ""; return; }
    let bottom = 60;
    for (const sel of ["#themeSettingsBtn", ".desktop-appbar"]) {
      const r = document.querySelector(sel)?.getBoundingClientRect();
      if (r && r.height && r.bottom > 0 && r.bottom < global.innerHeight / 2) bottom = Math.max(bottom, r.bottom);
    }
    panel.style.top = `${Math.round(bottom + 12)}px`;
  }
  function onKey(e){
    if (!panel) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
    const radio = e.target.closest?.("[data-es-set]");
    if (radio && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
      const g = [...radio.parentElement.children];
      const n = g[(g.indexOf(radio) + (e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1) + g.length) % g.length];
      n.focus(); n.click();
    }
  }
  function onOutside(e){
    if (!panel || panel.contains(e.target)) return;
    if (e.target.closest?.("#ev2StyleBtn, #walletsOverviewSection, .modal")) return;
    close();
  }
  function close(){
    if (!panel) return;
    const el = panel; panel = null;
    el.classList.remove("is-open");
    document.documentElement.classList.remove("expenses-style-open");
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("pointerdown", onOutside, true);
    global.removeEventListener("resize", placePanel);
    setTimeout(() => el.remove(), 220);
    clearTimeout(timer); pushPending();
    document.getElementById("ev2StyleBtn")?.setAttribute("aria-expanded", "false");
  }
  function open(){
    if (panel) { close(); return; }
    const style = get();
    panel = document.createElement("aside");
    panel.className = "home-style-panel expenses-style-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");
    panel.setAttribute("aria-labelledby", "esTitle");
    panel.innerHTML = html(style);
    document.body.appendChild(panel);
    placePanel();
    syncControls(style);
    panel.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.esSet) set({ [b.dataset.esSet]: b.dataset.esValue });
      else if (b.dataset.esToggle) set({ [b.dataset.esToggle]: !get()[b.dataset.esToggle] });
      else if (b.hasAttribute("data-es-reset")) reset();
      else if (b.hasAttribute("data-es-close")) close();
    });
    panel.addEventListener("input", e => { if (e.target.matches("[data-es-size]")) set({ size: e.target.value }); });
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onOutside, true);
    global.addEventListener("resize", placePanel);
    document.documentElement.classList.add("expenses-style-open");
    document.getElementById("ev2StyleBtn")?.setAttribute("aria-expanded", "true");
    const exp = document.getElementById("expensesPanel");
    if (exp && typeof MutationObserver === "function") {
      const mo = new MutationObserver(() => { if (!panel) { mo.disconnect(); return; } if (!exp.classList.contains("active")) { mo.disconnect(); close(); } });
      mo.observe(exp, { attributes: true, attributeFilter: ["class"] });
    }
    requestAnimationFrame(() => { panel?.classList.add("is-open"); panel?.querySelector("[aria-checked='true']")?.focus({ preventScroll: true }); });
  }

  function bind(){
    apply();
    document.getElementById("ev2StyleBtn")?.addEventListener("click", e => { e.stopPropagation(); open(); });
    document.getElementById("ev2PrivacyBtn")?.addEventListener("click", () => set({ privacy: !get().privacy }));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, { once: true });
  else bind();

  global.TriplemExpensesStyle = { get, set, reset, apply, open, close, sortAccounts, normalize, pushPending, CHOICES, SIZE, DEFAULTS };
})(typeof window !== "undefined" ? window : globalThis);
