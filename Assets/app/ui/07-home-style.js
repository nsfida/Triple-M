/* Triplem VIP Home Style (2026-11-12): icon pack, layout, sizes, text and cards of Home.
 *
 * Theme menu › Home Style opens a side panel (a bottom sheet on phones) next to Home, so every
 * change is seen at once. The choice is saved to the user's own account settings with the
 * existing app_update_own_settings RPC (key HomeStyle: { pack, layout, size, gap, weight,
 * captions, text, backdrop, motion, greeting, tips, hidden, at }), so
 * every device shows the same Home. A copy on this device applies it at start-up and keeps an
 * offline change until it reaches the account. Size and spacing only change two CSS variables
 * (no re-render); pack and layout re-render the Home cards once. No database migration.
 *
 * Nothing is written until the person changes something: everyone starts with the Standard
 * icons (the owner's pack) at normal size. Older value HomeIconPack ("new" / "classic") is read.
 */
(function initTriplemHomeStyle(global){
  "use strict";

  const SETTINGS_KEY = "HomeStyle";
  const LOCAL_PREFIX = "triplem-home-style-v1:";
  const ICON_VERSION = "20261114";
  const SAMPLE_KEYS = ["dashboard", "expenses", "inventory2", "notes"];
  const CLASSIC_FILES = {
    dashboard: "dashboard.png", expenses: "expenses.png", accounting: "accounting.png", assets: "assets.png",
    loans: "loans.png", audit: "audit.png", admin: "admin.png", bitcoin: "bitcoin.png", "triplem-ai": "triplem_ai.png",
    goods: "inventory.png", inventory2: "inventory.png", insurance: "insurance.png", installments: "installments.png",
    notes: "notes.png", messages: "message.png"
  };
  const PACKS = [
    { id: "standard", label: "Standard", note: "Colourful flat icons" },
    { id: "classic", label: "Classic 3D", note: "The original glossy icons" },
    { id: "jewel", label: "Jewel", note: "Jewel tiles with a gold rim" },
    { id: "pastel", label: "Pastel", note: "Soft tiles, bright symbols" },
    { id: "neon", label: "Midnight Neon", note: "Dark tiles that glow" },
    { id: "luxe", label: "Luxe Teal", note: "Triplem VIP teal and gold" },
    { id: "outline", label: "Outline", note: "Clean coloured lines, no background" },
    { id: "duotone", label: "Duotone", note: "Soft tint with coloured lines" },
    { id: "gradient", label: "Vivid Gradient", note: "Bright gradient shapes" },
    { id: "solid", label: "Solid Teal", note: "One calm colour, simple shapes" }
  ];
  const LAYOUTS = [
    { id: "grid", label: "Icons", note: "Large icons, no frames" },
    { id: "cards", label: "Cards", note: "Framed cards" },
    { id: "list", label: "List", note: "Rows with descriptions" },
    { id: "compact", label: "Compact", note: "Small, more per row" }
  ];
  const SIZE = { min: 70, max: 140, step: 5, def: 100 };
  const GAP = { min: 40, max: 180, step: 10, def: 100 };
  // Choices shown as small segmented buttons: [value, label]
  const CHOICES = {
    weight: [["normal", "Regular"], ["bold", "Bold"]],
    text: [["s", "Small"], ["m", "Medium"], ["l", "Large"]],
    backdrop: [["none", "None"], ["circle", "Circle"], ["square", "Square"]],
    motion: [["zoom", "Zoom"], ["lift", "Lift"], ["none", "None"]]
  };
  const SWITCHES = ["captions", "greeting", "tips"];
  const TEXT_SCALE = { s: 0.9, m: 1, l: 1.12 };
  const DEFAULTS = Object.freeze({
    pack: "standard", layout: "grid", size: SIZE.def, gap: GAP.def,
    weight: "normal", captions: true, text: "m", backdrop: "none", motion: "zoom",
    greeting: true, tips: true, hidden: Object.freeze([])
  });
  const KEY_RE = /^[a-z][a-z0-9-]{0,39}$/;

  const packIds = PACKS.map(p => p.id);
  const layoutIds = LAYOUTS.map(l => l.id);
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clampNum = (v, r) => {
    const n = Math.round(Number(v) / r.step) * r.step;
    return Number.isFinite(n) ? Math.min(r.max, Math.max(r.min, n)) : r.def;
  };

  function st(){ try { return typeof state !== "undefined" ? state : global.state; } catch (_) { return global.state; } }
  function isGuest(){ try { return typeof isGuestMode === "function" && isGuestMode(); } catch (_) { return false; } }
  function signedIn(){ const s = st(); return !!(s?.unlocked && s?.sessionToken && s?.sessionUser && !isGuest()); }
  function userId(){ const s = st(); return String(s?.sessionUser?.id || s?.currentUsername || "device").trim() || "device"; }

  const pick = (v, name) => (CHOICES[name].some(c => c[0] === v) ? v : DEFAULTS[name]);
  function normalize(value){
    const v = value && typeof value === "object" ? value : {};
    const hidden = Array.isArray(v.hidden) ? [...new Set(v.hidden.map(String).filter(k => KEY_RE.test(k)))].slice(0, 40) : [];
    return {
      pack: packIds.includes(v.pack) ? v.pack : DEFAULTS.pack,
      layout: layoutIds.includes(v.layout) ? v.layout : DEFAULTS.layout,
      size: clampNum(v.size ?? SIZE.def, SIZE),
      gap: clampNum(v.gap ?? GAP.def, GAP),
      weight: pick(v.weight, "weight"),
      captions: v.captions !== false,
      text: pick(v.text, "text"),
      backdrop: pick(v.backdrop, "backdrop"),
      motion: pick(v.motion, "motion"),
      greeting: v.greeting !== false,
      tips: v.tips !== false,
      hidden
    };
  }
  function readServer(){
    try {
      const settings = st()?.sessionUser?.settings || {};
      const raw = settings[SETTINGS_KEY];
      if (raw && typeof raw === "object" && Number(raw.at) > 0) return { style: normalize(raw), at: Number(raw.at) };
      if (settings.HomeIconPack === "classic") return { style: normalize({ pack: "classic", layout: "cards" }), at: 1 };
      if (settings.HomeIconPack === "new") return { style: normalize({}), at: 1 };
    } catch (_) {}
    return null;
  }
  function readLocal(uid = userId()){
    try {
      const raw = JSON.parse(localStorage.getItem(LOCAL_PREFIX + uid) || "null");
      if (!raw || !(Number(raw.at) > 0)) return null;
      return { style: normalize(raw.style), at: Number(raw.at), synced: raw.synced === true };
    } catch (_) { return null; }
  }
  function writeLocal(rec, uid = userId()){ try { localStorage.setItem(LOCAL_PREFIX + uid, JSON.stringify(rec)); } catch (_) {} }

  /** The Home style in use. */
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

  // ── saving ──────────────────────────────────────────────────────────────
  let queue = Promise.resolve();
  let pushTimer = 0;
  function pushPending(){
    queue = queue.catch(() => false).then(async () => {
      const uid = userId();
      const local = readLocal(uid);
      if (!local || local.synced || !signedIn() || typeof supabaseRpc !== "function") return false;
      if (navigator.onLine === false) return false;
      const value = { ...local.style, at: local.at };
      try {
        // HomeIconPack is kept for the earlier client of the same day.
        const legacy = local.style.layout === "cards" && local.style.pack === "classic" ? "classic" : "new";
        const updated = await supabaseRpc("app_update_own_settings", { p_settings: { [SETTINGS_KEY]: value, HomeIconPack: legacy } }, { offlineCache: false });
        if (userId() !== uid) return false;
        if (updated && typeof updated === "object" && typeof applyUserProfileToConfig === "function") applyUserProfileToConfig(updated);
        const s = st();
        if (s?.sessionUser) s.sessionUser.settings = { ...(s.sessionUser.settings || {}), [SETTINGS_KEY]: value, HomeIconPack: legacy };
        const now = readLocal(uid);
        if (now && now.at === local.at) writeLocal({ ...now, synced: true }, uid);
        return true;
      } catch (err) {
        console.warn("Home style will be saved to the account later:", err?.message || err);
        return false;
      }
    });
    return queue;
  }
  function schedulePush(delay = 600){
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { pushPending(); }, delay);
  }
  global.addEventListener("online", () => schedulePush(50));

  // ── applying ────────────────────────────────────────────────────────────
  function iconSrc(key, pack){
    let k = String(key || "").trim();
    if (k === "inventory") k = "goods";
    if (k === "message") k = "messages";
    if (pack === "classic") return `Assets/logo/icons/${CLASSIC_FILES[k] || "dashboard.png"}`;
    if (!Object.prototype.hasOwnProperty.call(CLASSIC_FILES, k)) k = "dashboard";
    if (pack === "standard") return `Assets/logo/icons/home/${k}.svg?v=20261114`;
    return `Assets/logo/icons/packs/${pack}/${k}.svg?v=${ICON_VERSION}`;
  }

  /** Classes and CSS variables on #workspaceHome (no re-render). */
  function applyFrame(style = get()){
    const home = document.getElementById("workspaceHome");
    if (!home) return style;
    for (const l of layoutIds) home.classList.toggle(`home-layout-${l}`, style.layout === l);
    home.classList.toggle("home-pack-classic", style.layout === "cards"); // earlier class name
    home.dataset.homePack = style.pack;
    home.style.setProperty("--wh-icon-scale", String(style.size / 100));
    home.style.setProperty("--wh-gap-scale", String(style.gap / 100));
    home.style.setProperty("--wh-text-scale", String(TEXT_SCALE[style.text] || 1));
    home.classList.toggle("home-title-normal", style.weight === "normal");
    home.classList.toggle("home-no-captions", !style.captions);
    home.classList.toggle("home-no-greeting", !style.greeting);
    home.classList.toggle("home-no-tips", !style.tips);
    for (const [b] of CHOICES.backdrop) home.classList.toggle(`home-backdrop-${b}`, style.backdrop === b && b !== "none");
    for (const [m] of CHOICES.motion) home.classList.toggle(`home-motion-${m}`, style.motion === m && m !== "zoom");
    return style;
  }

  function homeVisible(){
    const home = document.getElementById("workspaceHome");
    return !!home && !home.classList.contains("hide");
  }
  function rerender(){
    if (!homeVisible() || typeof renderWorkspaceHome !== "function") return;
    const home = document.getElementById("workspaceHome");
    home.classList.add("home-pack-switching");
    renderWorkspaceHome();
    requestAnimationFrame(() => requestAnimationFrame(() => home.classList.remove("home-pack-switching")));
  }

  /** Changes part of the style. Pack and layout re-render Home; size and spacing do not. */
  function set(patch){
    const before = get();
    const next = normalize({ ...before, ...patch });
    const hiddenChanged = JSON.stringify(next.hidden) !== JSON.stringify(before.hidden);
    const prev = readLocal();
    const at = Math.max(Date.now(), (prev?.at || 0) + 1, (readServer()?.at || 0) + 1);
    writeLocal({ style: next, at, synced: !signedIn() });
    if (next.pack !== before.pack || next.layout !== before.layout || hiddenChanged) rerender();
    else applyFrame(next);
    syncControls(next);
    updateSummary(next);
    try { global.dispatchEvent(new CustomEvent("triplem:home-style-changed", { detail: { ...next } })); } catch (_) {}
    if (signedIn()) schedulePush();
    return next;
  }
  /** Reset keeps the hidden cards (they have their own "Show all"). */
  function reset(){ const { hidden } = get(); return set({ ...normalize({}), hidden }); }
  function isHidden(key){ return get().hidden.includes(String(key || "")); }
  function hide(key){ key = String(key || ""); if (!KEY_RE.test(key)) return get(); const h = get().hidden; return h.includes(key) ? get() : set({ hidden: [...h, key] }); }
  function show(key){ return set({ hidden: key ? get().hidden.filter(k => k !== key) : [] }); }

  function summaryText(style = get()){
    const p = PACKS.find(x => x.id === style.pack)?.label || "Standard";
    const l = LAYOUTS.find(x => x.id === style.layout)?.label || "Icons";
    return `${p} · ${l}`;
  }
  function updateSummary(style = get()){
    document.querySelectorAll("[data-home-style-summary]").forEach(el => { el.textContent = summaryText(style); });
  }

  // ── panel ───────────────────────────────────────────────────────────────
  let panel = null;
  let prevFocus = null;

  const LAYOUT_ART = {
    grid: '<svg viewBox="0 0 48 32" aria-hidden="true"><g fill="currentColor"><rect x="5" y="4" width="10" height="10" rx="3"/><rect x="19" y="4" width="10" height="10" rx="3"/><rect x="33" y="4" width="10" height="10" rx="3"/><rect x="5" y="18" width="10" height="10" rx="3"/><rect x="19" y="18" width="10" height="10" rx="3"/><rect x="33" y="18" width="10" height="10" rx="3"/></g></svg>',
    cards: '<svg viewBox="0 0 48 32" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="19" height="12" rx="3"/><rect x="26" y="3" width="19" height="12" rx="3"/><rect x="3" y="18" width="19" height="12" rx="3"/><rect x="26" y="18" width="19" height="12" rx="3"/></g><g fill="currentColor"><rect x="9.5" y="6" width="6" height="6" rx="2"/><rect x="32.5" y="6" width="6" height="6" rx="2"/><rect x="9.5" y="21" width="6" height="6" rx="2"/><rect x="32.5" y="21" width="6" height="6" rx="2"/></g></svg>',
    list: '<svg viewBox="0 0 48 32" aria-hidden="true"><g fill="currentColor"><rect x="4" y="4" width="8" height="7" rx="2"/><rect x="4" y="13" width="8" height="7" rx="2"/><rect x="4" y="22" width="8" height="7" rx="2"/><rect x="15" y="6" width="28" height="3" rx="1.5"/><rect x="15" y="15" width="22" height="3" rx="1.5"/><rect x="15" y="24" width="26" height="3" rx="1.5"/></g></svg>',
    compact: '<svg viewBox="0 0 48 32" aria-hidden="true"><g fill="currentColor"><rect x="3" y="4" width="7" height="7" rx="2"/><rect x="12.5" y="4" width="7" height="7" rx="2"/><rect x="22" y="4" width="7" height="7" rx="2"/><rect x="31.5" y="4" width="7" height="7" rx="2"/><rect x="41" y="4" width="4" height="7" rx="2"/><rect x="3" y="13" width="7" height="7" rx="2"/><rect x="12.5" y="13" width="7" height="7" rx="2"/><rect x="22" y="13" width="7" height="7" rx="2"/><rect x="31.5" y="13" width="7" height="7" rx="2"/><rect x="41" y="13" width="4" height="7" rx="2"/><rect x="3" y="22" width="7" height="7" rx="2"/><rect x="12.5" y="22" width="7" height="7" rx="2"/><rect x="22" y="22" width="7" height="7" rx="2"/></g></svg>'
  };

  const seg = (name, label, style) => `
          <div class="hs-row">
            <span class="hs-row-label" id="hs-${name}-l">${esc(label)}</span>
            <div class="hs-seg" role="radiogroup" aria-labelledby="hs-${name}-l">
              ${CHOICES[name].map(([v, t]) => `<button type="button" role="radio" data-hs-set="${name}" data-hs-value="${v}" aria-checked="${style[name] === v}">${esc(t)}</button>`).join("")}
            </div>
          </div>`;
  const sw = (name, label, note, style) => `
          <button type="button" class="hs-switch" role="switch" data-hs-toggle="${name}" aria-checked="${!!style[name]}">
            <span class="hs-switch-copy"><b>${esc(label)}</b><small>${esc(note)}</small></span>
            <span class="hs-switch-track" aria-hidden="true"><i></i></span>
          </button>`;

  function hiddenHtml(style){
    if (!style.hidden.length) return `<p class="hs-empty">No hidden cards. Use a card's <i class="fa-solid fa-ellipsis-vertical" aria-hidden="true"></i> menu › Hide from Home.</p>`;
    let label = k => k;
    try { label = k => (typeof workspaceDisplayLabel === "function" ? workspaceDisplayLabel(k) : k); } catch (_) {}
    return `<div class="hs-hidden-list">${style.hidden.map(k => `
              <span class="hs-hidden-item"><img src="${esc(iconSrc(k, style.pack))}" alt="" aria-hidden="true"><b>${esc(label(k))}</b>
                <button type="button" data-hs-show="${esc(k)}">Show</button></span>`).join("")}</div>
            <button type="button" class="hs-link" data-hs-show-all>Show all cards</button>`;
  }

  function panelHtml(style){
    return `
      <div class="hs-head">
        <div><strong id="hsTitle">Home Style</strong><small>Changes show at once and are saved to your account.</small></div>
        <button type="button" class="hs-close" data-hs-close aria-label="Close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
      </div>
      <div class="hs-body">
        <section class="hs-section">
          <h3 id="hsPacksTitle">Icon pack</h3>
          <div class="hs-packs" role="radiogroup" aria-labelledby="hsPacksTitle">
            ${PACKS.map(p => `
              <button type="button" class="hs-pack hs-pack--${p.id}" role="radio" data-hs-pack="${p.id}" aria-checked="${style.pack === p.id}">
                <span class="hs-pack-icons">${SAMPLE_KEYS.map(k => `<img src="${esc(iconSrc(k, p.id))}" alt="" aria-hidden="true" loading="lazy" decoding="async" draggable="false">`).join("")}</span>
                <span class="hs-pack-name"><b>${esc(p.label)}${p.id === "standard" ? ' <em class="hs-default">Default</em>' : ""}</b><small>${esc(p.note)}</small></span>
                <i class="fa-solid fa-circle-check hs-check" aria-hidden="true"></i>
              </button>`).join("")}
          </div>
        </section>
        <section class="hs-section">
          <h3 id="hsLayoutTitle">Layout</h3>
          <div class="hs-layouts" role="radiogroup" aria-labelledby="hsLayoutTitle">
            ${LAYOUTS.map(l => `
              <button type="button" class="hs-layout" role="radio" data-hs-layout="${l.id}" aria-checked="${style.layout === l.id}" title="${esc(l.note)}">
                ${LAYOUT_ART[l.id]}<b>${esc(l.label)}</b>
              </button>`).join("")}
          </div>
        </section>
        <section class="hs-section">
          <h3>Icons</h3>
          <label class="hs-range" for="hsSize">
            <span class="hs-range-head"><b>Icon size</b><output data-hs-size-out>${style.size}%</output></span>
            <span class="hs-range-row"><i class="fa-solid fa-minus" aria-hidden="true"></i>
              <input id="hsSize" type="range" min="${SIZE.min}" max="${SIZE.max}" step="${SIZE.step}" value="${style.size}" data-hs-size aria-valuetext="${style.size}%">
            <i class="fa-solid fa-plus" aria-hidden="true"></i></span>
          </label>
          <label class="hs-range" for="hsGap">
            <span class="hs-range-head"><b>Spacing</b><output data-hs-gap-out>${style.gap}%</output></span>
            <span class="hs-range-row"><i class="fa-solid fa-compress" aria-hidden="true"></i>
              <input id="hsGap" type="range" min="${GAP.min}" max="${GAP.max}" step="${GAP.step}" value="${style.gap}" data-hs-gap aria-valuetext="${style.gap}%">
            <i class="fa-solid fa-expand" aria-hidden="true"></i></span>
          </label>
          ${seg("backdrop", "Icon background", style)}
          ${seg("motion", "Hover effect", style)}
        </section>
        <section class="hs-section">
          <h3>Text</h3>
          ${seg("weight", "Titles", style)}
          ${seg("text", "Text size", style)}
          ${sw("captions", "Descriptions", "Short text under each title", style)}
          ${sw("greeting", "Greeting and date", "“Good morning” heading at the top", style)}
          ${sw("tips", "Help line", "“Hold a card to move it” under the cards", style)}
        </section>
        <section class="hs-section">
          <h3>Hidden cards</h3>
          <div data-hs-hidden>${hiddenHtml(style)}</div>
        </section>
      </div>
      <div class="hs-foot">
        <button type="button" class="btn ghost" data-hs-reset title="Standard icons, Icons layout, normal size (hidden cards stay hidden)"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Reset to default</button>
        <button type="button" class="btn primary" data-hs-close>Done</button>
      </div>`;
  }

  function syncControls(style = get()){
    if (!panel) return;
    panel.querySelectorAll("[data-hs-pack]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.hsPack === style.pack)));
    panel.querySelectorAll("[data-hs-layout]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.hsLayout === style.layout)));
    panel.querySelectorAll("[data-hs-set]").forEach(b => b.setAttribute("aria-checked", String(style[b.dataset.hsSet] === b.dataset.hsValue)));
    panel.querySelectorAll("[data-hs-toggle]").forEach(b => b.setAttribute("aria-checked", String(!!style[b.dataset.hsToggle])));
    const hiddenBox = panel.querySelector("[data-hs-hidden]");
    const hiddenSig = style.hidden.join(",") + "|" + style.pack;
    if (hiddenBox && hiddenBox.dataset.sig !== hiddenSig) { hiddenBox.innerHTML = hiddenHtml(style); hiddenBox.dataset.sig = hiddenSig; }
    const size = panel.querySelector("[data-hs-size]"); const gap = panel.querySelector("[data-hs-gap]");
    if (size && Number(size.value) !== style.size) size.value = String(style.size);
    if (gap && Number(gap.value) !== style.gap) gap.value = String(style.gap);
    const so = panel.querySelector("[data-hs-size-out]"); if (so) so.textContent = `${style.size}%`;
    const go = panel.querySelector("[data-hs-gap-out]"); if (go) go.textContent = `${style.gap}%`;
    size?.setAttribute("aria-valuetext", `${style.size}%`);
    gap?.setAttribute("aria-valuetext", `${style.gap}%`);
    for (const r of [size, gap]) if (r) r.style.setProperty("--hs-fill", `${((Number(r.value) - Number(r.min)) / (Number(r.max) - Number(r.min))) * 100}%`);
  }

  /** Desktop: start the panel just under the header buttons (and the Windows app bar). */
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

  function close(){
    if (!panel) return;
    global.removeEventListener("resize", placePanel);
    const el = panel;
    panel = null;
    el.classList.remove("is-open");
    document.documentElement.classList.remove("home-style-open");
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("pointerdown", onOutside, true);
    setTimeout(() => el.remove(), 220);
    clearTimeout(pushTimer);
    pushPending();
    try { prevFocus?.focus?.({ preventScroll: true }); } catch (_) {}
  }
  function onKey(e){
    if (!panel) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
    const radio = e.target.closest?.("[data-hs-pack],[data-hs-layout],[data-hs-set]");
    if (radio && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
      const group = [...radio.parentElement.children];
      const i = group.indexOf(radio);
      const next = group[(i + (e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1) + group.length) % group.length];
      next.focus();
      next.click();
    }
  }
  function onOutside(e){
    if (!panel || panel.contains(e.target)) return;
    // keep the panel open while the person uses Home itself (opening a card closes it anyway)
    if (e.target.closest?.("#themeDropdown, #themeSettingsBtn, .home-card-menu, .home-rename-backdrop")) return;
    if (e.target.closest?.("#workspaceHomeGrid")) return;
    close();
  }

  /** Opens the Home Style panel (shows Home first, so changes are seen). */
  function open(){
    if (panel) { panel.querySelector("[data-hs-pack][aria-checked='true']")?.focus(); return; }
    try {
      const s = st();
      if (s?.unlocked && !homeVisible() && typeof showWorkspaceHome === "function") showWorkspaceHome();
    } catch (_) {}
    const style = get();
    prevFocus = document.activeElement;
    panel = document.createElement("aside");
    panel.className = "home-style-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");
    panel.setAttribute("aria-labelledby", "hsTitle");
    panel.innerHTML = panelHtml(style);
    document.body.appendChild(panel);
    placePanel();
    global.addEventListener("resize", placePanel);
    syncControls(style);
    panel.addEventListener("click", e => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.hsPack) set({ pack: b.dataset.hsPack });
      else if (b.dataset.hsLayout) set({ layout: b.dataset.hsLayout });
      else if (b.dataset.hsSet) set({ [b.dataset.hsSet]: b.dataset.hsValue });
      else if (b.dataset.hsToggle) set({ [b.dataset.hsToggle]: !get()[b.dataset.hsToggle] });
      else if (b.dataset.hsShow) show(b.dataset.hsShow);
      else if (b.hasAttribute("data-hs-show-all")) show("");
      else if (b.hasAttribute("data-hs-reset")) reset();
      else if (b.hasAttribute("data-hs-close")) close();
    });
    panel.addEventListener("input", e => {
      if (e.target.matches("[data-hs-size]")) set({ size: e.target.value });
      else if (e.target.matches("[data-hs-gap]")) set({ gap: e.target.value });
    });
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onOutside, true);
    document.documentElement.classList.add("home-style-open");
    // Close when Home is left (a section opened, signed out).
    const home = document.getElementById("workspaceHome");
    if (home && typeof MutationObserver === "function") {
      const mo = new MutationObserver(() => { if (!panel) { mo.disconnect(); return; } if (!homeVisible()) { mo.disconnect(); close(); } });
      mo.observe(home, { attributes: true, attributeFilter: ["class"] });
    }
    requestAnimationFrame(() => {
      panel?.classList.add("is-open");
      panel?.querySelector("[data-hs-pack][aria-checked='true']")?.focus({ preventScroll: true });
    });
  }


  global.TriplemHomeStyle = {
    get, set, reset, open, close, applyFrame, iconSrc, updateSummary, summaryText, pushPending,
    isHidden, hide, show, PACKS, LAYOUTS, CHOICES, SIZE, GAP, DEFAULTS, normalize
  };
  // earlier name used by Inventory 2.0 and older code
  global.triplemHomeIconPack = () => (get().layout === "cards" ? "classic" : "new");
  global.syncTriplemHomePackToAccount = () => pushPending();
})(typeof window !== "undefined" ? window : globalThis);
