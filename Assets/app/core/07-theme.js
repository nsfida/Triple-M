/* Authenticated workspace themes. Preference only; no financial/session data is stored here. */
const TRIPLEM_THEME_STORAGE_KEY = "triplem-theme-v1";
const TRIPLEM_THEMES = Object.freeze([
  { id: "default", label: "Default", color: "#2457d6", description: "Original Triplem blue" },
  { id: "neon", label: "Neon", color: "#0d9f78", description: "Fresh mint with vivid premium accents" },
  { id: "navy", label: "Dark Navy Blue", color: "#4f8cff", description: "Deep navy with crisp blue accents" },
  { id: "red", label: "Red", color: "#d9364d", description: "Soft red surfaces with refined accents" },
  { id: "pink", label: "Pink", color: "#db2777", description: "Light rose surfaces with a romantic touch" },
  { id: "green", label: "Dark Green", color: "#19974f", description: "Refined green financial workspace" }
]);
const TRIPLEM_THEME_TOKENS = Object.freeze({
  neon: { "--bg":"#ecfff8", "--panel":"rgba(250,255,253,.95)", "--panel-2":"rgba(232,252,245,.92)", "--surface":"#fbfffd", "--surface-elevated":"#f1fff9", "--surface-soft":"#f4fdf9", "--surface-hover":"#ddf8ed", "--text":"#123b30", "--muted":"#5c8174", "--line":"rgba(39,143,111,.28)", "--line-strong":"rgba(13,159,120,.44)", "--primary":"#0d9f78", "--primary-soft":"rgba(13,159,120,.13)", "--on-primary":"#ffffff", "--success":"#16855a", "--warning":"#a86c0b", "--danger":"#d3445c", "--focus-ring":"rgba(13,159,120,.22)", "--shadow":"0 14px 34px rgba(15,92,68,.11)", "--shadow-strong":"0 20px 48px rgba(15,92,68,.16)" },
  navy: { "--bg":"#071326", "--panel":"rgba(12,30,56,.94)", "--panel-2":"rgba(16,39,72,.88)", "--surface":"#0d203b", "--surface-elevated":"#122b4e", "--surface-soft":"#0a1930", "--surface-hover":"#17365f", "--text":"#edf5ff", "--muted":"#9db0ca", "--line":"rgba(108,143,190,.28)", "--line-strong":"rgba(79,140,255,.48)", "--primary":"#4f8cff", "--primary-soft":"rgba(79,140,255,.15)", "--on-primary":"#ffffff", "--success":"#3ddc97", "--warning":"#f1b95b", "--danger":"#ff6b7a", "--focus-ring":"rgba(79,140,255,.24)", "--shadow":"0 14px 34px rgba(0,5,18,.38)", "--shadow-strong":"0 20px 48px rgba(0,5,18,.52)" },
  red: { "--bg":"#fff2f3", "--panel":"rgba(255,251,251,.95)", "--panel-2":"rgba(255,239,241,.92)", "--surface":"#fffafb", "--surface-elevated":"#fff3f4", "--surface-soft":"#fff6f7", "--surface-hover":"#ffe2e5", "--text":"#4a1d22", "--muted":"#89616a", "--line":"rgba(203,83,98,.28)", "--line-strong":"rgba(220,52,69,.44)", "--primary":"#d9364d", "--primary-soft":"rgba(217,54,77,.13)", "--on-primary":"#ffffff", "--success":"#16855a", "--warning":"#aa6b0c", "--danger":"#d1354c", "--focus-ring":"rgba(217,54,77,.22)", "--shadow":"0 14px 34px rgba(137,32,45,.11)", "--shadow-strong":"0 20px 48px rgba(137,32,45,.16)" },
  pink: { "--bg":"#fff0f6", "--panel":"rgba(255,250,253,.94)", "--panel-2":"rgba(255,241,248,.92)", "--surface":"#fffafd", "--surface-elevated":"#fff3f9", "--surface-soft":"#fff6fa", "--surface-hover":"#ffe5f0", "--text":"#4d1832", "--muted":"#8d5d74", "--line":"rgba(220,116,159,.30)", "--line-strong":"rgba(219,39,119,.50)", "--primary":"#db2777", "--primary-soft":"rgba(219,39,119,.13)", "--on-primary":"#ffffff", "--success":"#16855a", "--warning":"#a9670b", "--danger":"#d53463", "--focus-ring":"rgba(219,39,119,.22)", "--shadow":"0 14px 34px rgba(126,31,76,.12)", "--shadow-strong":"0 20px 48px rgba(126,31,76,.18)" },
  green: { "--bg":"#effbf4", "--panel":"rgba(252,255,253,.95)", "--panel-2":"rgba(235,249,240,.92)", "--surface":"#fbfffc", "--surface-elevated":"#f1fcf5", "--surface-soft":"#f4fbf7", "--surface-hover":"#def5e7", "--text":"#153c26", "--muted":"#5e806c", "--line":"rgba(53,142,86,.28)", "--line-strong":"rgba(25,151,79,.44)", "--primary":"#19974f", "--primary-soft":"rgba(25,151,79,.13)", "--on-primary":"#ffffff", "--success":"#16855a", "--warning":"#a76a0c", "--danger":"#cf4155", "--focus-ring":"rgba(25,151,79,.22)", "--shadow":"0 14px 34px rgba(25,105,57,.11)", "--shadow-strong":"0 20px 48px rgba(25,105,57,.16)" }
});
const TRIPLEM_THEME_TOKEN_NAMES = Object.freeze([...new Set(Object.values(TRIPLEM_THEME_TOKENS).flatMap(tokens => Object.keys(tokens)))]);

function themeUsesDarkColorScheme(id){
  return id === "navy";
}

function normalizeTriplemTheme(value){
  const id = String(value || "").trim().toLowerCase();
  return TRIPLEM_THEMES.some(theme => theme.id === id) ? id : "default";
}

function readTriplemTheme(){
  try { return normalizeTriplemTheme(localStorage.getItem(TRIPLEM_THEME_STORAGE_KEY)); }
  catch (_) { return "default"; }
}

function applyTriplemTheme(value, options = {}){
  const id = normalizeTriplemTheme(value);
  const root = document.documentElement;
  root.dataset.triplemTheme = id;
  TRIPLEM_THEME_TOKEN_NAMES.forEach(name => root.style.removeProperty(name));
  Object.entries(TRIPLEM_THEME_TOKENS[id] || {}).forEach(([name, token]) => root.style.setProperty(name, token));
  root.style.colorScheme = themeUsesDarkColorScheme(id) ? "dark" : "light";
  const theme = TRIPLEM_THEMES.find(item => item.id === id) || TRIPLEM_THEMES[0];
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme.color);
  if (options.persist !== false) {
    try { localStorage.setItem(TRIPLEM_THEME_STORAGE_KEY, id); } catch (_) {}
  }
  document.querySelectorAll("[data-theme-choice]").forEach(button => {
    const selected = button.dataset.themeChoice === id;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-checked", selected ? "true" : "false");
  });
  // Recalculate existing inline-heavy module views without a page reload or a data request.
  root.classList.add("triplem-theme-applying");
  void root.offsetWidth;
  requestAnimationFrame(() => root.classList.remove("triplem-theme-applying"));
  window.dispatchEvent(new CustomEvent("triplemthemechange", { detail: { theme: id } }));
  return id;
}

function ensureThemeModal(){
  let modal = document.getElementById("themeModal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "themeModal";
  modal.className = "modal hide theme-modal";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="modal-backdrop" data-theme-close></div>
    <div class="modal-dialog theme-dialog" role="dialog" aria-modal="true" aria-labelledby="themeModalTitle">
      <div class="modal-head">
        <div>
          <h3 id="themeModalTitle">Theme</h3>
          <p>Choose a complete workspace appearance. Your choice is remembered on this device.</p>
        </div>
        <button class="icon-btn ghost" type="button" data-theme-close aria-label="Close">×</button>
      </div>
      <div class="modal-body">
        <div class="theme-choice-grid" role="radiogroup" aria-label="Application theme">
          ${TRIPLEM_THEMES.map(theme => `
            <button class="theme-choice" type="button" role="radio" data-theme-choice="${theme.id}" aria-checked="false">
              <span class="theme-choice-preview theme-choice-preview-${theme.id}" aria-hidden="true">
                <span></span><span></span><span></span>
              </span>
              <span class="theme-choice-copy"><strong>${theme.label}</strong><small>${theme.description}</small></span>
              <i class="fa-solid fa-circle-check theme-choice-check" aria-hidden="true"></i>
            </button>
          `).join("")}
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn primary" type="button" data-theme-close>Done</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelectorAll("[data-theme-close]").forEach(el => {
    el.addEventListener("click", () => closeThemeModal());
  });
  modal.querySelectorAll("[data-theme-choice]").forEach(button => {
    button.addEventListener("click", () => applyTriplemTheme(button.dataset.themeChoice));
  });
  modal.addEventListener("keydown", event => {
    if (event.key === "Escape") closeThemeModal();
  });
  return modal;
}

function openThemeModal(){
  document.querySelectorAll(".menu-dropdown.open").forEach(panel => panel.classList.remove("open"));
  const modal = ensureThemeModal();
  applyTriplemTheme(readTriplemTheme(), { persist: false });
  modal.classList.remove("hide");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => modal.querySelector(".theme-choice.is-selected")?.focus());
}

function closeThemeModal(){
  const modal = document.getElementById("themeModal");
  if (!modal) return;
  modal.classList.add("hide");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  document.getElementById("themeSettingsBtn")?.focus();
}

function initThemeSystem(){
  applyTriplemTheme(readTriplemTheme(), { persist: false });
  const button = document.getElementById("themeSettingsBtn");
  if (button && button.dataset.themeBound !== "1") {
    button.dataset.themeBound = "1";
    button.addEventListener("click", openThemeModal);
  }
  window.addEventListener("triplemthemechange", () => {
    if (typeof renderDetailedDashboard === "function"
      && typeof getActiveTabKey === "function"
      && getActiveTabKey() === "dashboard") {
      requestAnimationFrame(() => renderDetailedDashboard({ preserveScroll: true }));
    }
  }, { once: false });
}

initThemeSystem();
