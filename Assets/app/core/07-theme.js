/* Authenticated workspace themes. Preference only; no financial/session data is stored here. */
const TRIPLEM_THEME_STORAGE_KEY = "triplem-theme-v1";
const TRIPLEM_THEMES = Object.freeze([
  { id: "default", label: "Default", color: "#2457d6", description: "Original Triplem VIP blue" },
  { id: "neon", label: "Neon", color: "#0284c7", description: "Light sky blue with a clean cyan glow" },
  { id: "navy", label: "Dark Navy Blue", color: "#4f8cff", description: "Deep navy with crisp blue accents" },
  { id: "red", label: "Red", color: "#c1121f", description: "Confident crimson with warm red surfaces" },
  { id: "pink", label: "Pink", color: "#db2777", description: "Light rose surfaces with a romantic touch" },
  { id: "green", label: "Dark Green", color: "#19974f", description: "Refined green financial workspace" }
]);
const TRIPLEM_THEME_TOKENS = Object.freeze({
  neon: { "--bg":"#edfaff", "--panel":"rgba(248,253,255,.78)", "--panel-2":"rgba(226,247,255,.60)", "--surface":"rgba(251,254,255,.72)", "--surface-elevated":"rgba(234,249,255,.64)", "--surface-soft":"rgba(242,251,255,.56)", "--surface-hover":"rgba(217,243,255,.64)", "--text":"#0c3447", "--muted":"#52778a", "--line":"rgba(2,132,199,.12)", "--line-strong":"rgba(8,145,178,.25)", "--primary":"#0284c7", "--primary-soft":"rgba(2,132,199,.13)", "--on-primary":"#ffffff", "--success":"#087f5b", "--warning":"#a86607", "--danger":"#cf3f58", "--focus-ring":"rgba(14,165,233,.20)", "--shadow":"0 12px 30px rgba(3,105,161,.08)", "--shadow-strong":"0 20px 48px rgba(3,105,161,.14)" },
  navy: { "--bg":"#071326", "--panel":"rgba(12,30,56,.78)", "--panel-2":"rgba(16,39,72,.60)", "--surface":"rgba(13,32,59,.74)", "--surface-elevated":"rgba(18,43,78,.66)", "--surface-soft":"rgba(10,25,48,.58)", "--surface-hover":"rgba(23,54,95,.66)", "--text":"#edf5ff", "--muted":"#9db0ca", "--line":"rgba(137,166,205,.16)", "--line-strong":"rgba(79,140,255,.28)", "--primary":"#4f8cff", "--primary-soft":"rgba(79,140,255,.15)", "--on-primary":"#ffffff", "--success":"#3ddc97", "--warning":"#f1b95b", "--danger":"#ff6b7a", "--focus-ring":"rgba(79,140,255,.22)", "--shadow":"0 12px 30px rgba(0,5,18,.30)", "--shadow-strong":"0 20px 48px rgba(0,5,18,.46)" },
  red: { "--bg":"#fff6f3", "--panel":"rgba(255,250,247,.78)", "--panel-2":"rgba(255,235,229,.60)", "--surface":"rgba(255,253,251,.72)", "--surface-elevated":"rgba(255,240,235,.64)", "--surface-soft":"rgba(255,247,244,.56)", "--surface-hover":"rgba(255,227,220,.64)", "--text":"#3b1013", "--muted":"#805b5e", "--line":"rgba(193,18,31,.12)", "--line-strong":"rgba(193,18,31,.25)", "--primary":"#c1121f", "--primary-soft":"rgba(193,18,31,.13)", "--on-primary":"#ffffff", "--success":"#147a52", "--warning":"#a85d0a", "--danger":"#a70b18", "--focus-ring":"rgba(193,18,31,.20)", "--shadow":"0 12px 30px rgba(104,15,23,.08)", "--shadow-strong":"0 20px 48px rgba(104,15,23,.15)" },
  pink: { "--bg":"#fff0f6", "--panel":"rgba(255,250,253,.78)", "--panel-2":"rgba(255,241,248,.60)", "--surface":"rgba(255,250,253,.72)", "--surface-elevated":"rgba(255,243,249,.64)", "--surface-soft":"rgba(255,246,250,.56)", "--surface-hover":"rgba(255,229,240,.64)", "--text":"#4d1832", "--muted":"#8d5d74", "--line":"rgba(219,39,119,.13)", "--line-strong":"rgba(219,39,119,.25)", "--primary":"#db2777", "--primary-soft":"rgba(219,39,119,.13)", "--on-primary":"#ffffff", "--success":"#16855a", "--warning":"#a9670b", "--danger":"#d53463", "--focus-ring":"rgba(219,39,119,.20)", "--shadow":"0 12px 30px rgba(126,31,76,.08)", "--shadow-strong":"0 20px 48px rgba(126,31,76,.15)" },
  green: { "--bg":"#effbf4", "--panel":"rgba(252,255,253,.78)", "--panel-2":"rgba(235,249,240,.60)", "--surface":"rgba(251,255,252,.72)", "--surface-elevated":"rgba(241,252,245,.64)", "--surface-soft":"rgba(244,251,247,.56)", "--surface-hover":"rgba(222,245,231,.64)", "--text":"#153c26", "--muted":"#5e806c", "--line":"rgba(25,151,79,.13)", "--line-strong":"rgba(25,151,79,.25)", "--primary":"#19974f", "--primary-soft":"rgba(25,151,79,.13)", "--on-primary":"#ffffff", "--success":"#16855a", "--warning":"#a76a0c", "--danger":"#cf4155", "--focus-ring":"rgba(25,151,79,.20)", "--shadow":"0 12px 30px rgba(25,105,57,.08)", "--shadow-strong":"0 20px 48px rgba(25,105,57,.14)" }
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

function isTriplemWorkspaceAuthenticated(){
  try {
    return typeof state !== "undefined" && state?.unlocked === true && state?.guestMode !== true;
  } catch (_) {
    return false;
  }
}

function applyTriplemTheme(value, options = {}){
  const workspaceThemeAllowed = options.forceWorkspace === true
    || (options.forcePublic !== true && isTriplemWorkspaceAuthenticated());
  const id = workspaceThemeAllowed ? normalizeTriplemTheme(value) : "default";
  const root = document.documentElement;
  root.dataset.triplemTheme = id;
  TRIPLEM_THEME_TOKEN_NAMES.forEach(name => root.style.removeProperty(name));
  Object.entries(TRIPLEM_THEME_TOKENS[id] || {}).forEach(([name, token]) => root.style.setProperty(name, token));
  root.style.colorScheme = themeUsesDarkColorScheme(id) ? "dark" : "light";
  const theme = TRIPLEM_THEMES.find(item => item.id === id) || TRIPLEM_THEMES[0];
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme.color);
  if (workspaceThemeAllowed && options.persist !== false) {
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

function applyTriplemPublicTheme(){
  return applyTriplemTheme("default", { persist: false, forcePublic: true });
}

function applySavedTriplemWorkspaceTheme(){
  if (!isTriplemWorkspaceAuthenticated()) return applyTriplemPublicTheme();
  return applyTriplemTheme(readTriplemTheme(), { persist: false, forceWorkspace: true });
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
  if (!isTriplemWorkspaceAuthenticated()) {
    applyTriplemPublicTheme();
    return;
  }
  document.querySelectorAll(".menu-dropdown.open").forEach(panel => panel.classList.remove("open"));
  const modal = ensureThemeModal();
  applySavedTriplemWorkspaceTheme();
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
  // Public pages always start in Triplem VIP Default. The saved preference is
  // restored only after completeAuthenticatedUnlock marks the workspace ready.
  applyTriplemPublicTheme();
  const button = document.getElementById("themeSettingsBtn");
  if (button && button.dataset.themeBound !== "1") {
    button.dataset.themeBound = "1";
    button.addEventListener("click", openThemeModal);
  }
  window.addEventListener("triplemthemechange", () => {
    requestAnimationFrame(() => {
      if (typeof renderDetailedDashboard === "function"
        && typeof getActiveTabKey === "function"
        && getActiveTabKey() === "dashboard") {
        renderDetailedDashboard({ preserveScroll: true });
      }

      const infoOverlay = document.getElementById("landingContentOverlay");
      if (infoOverlay?.classList.contains("is-app-overlay") && infoOverlay.classList.contains("is-open")
        && typeof syncLandingOverlayDemoCharts === "function") {
        const activePanel = infoOverlay.querySelector('[data-landing-panel]:not(.hide):not([hidden])');
        const section = activePanel?.getAttribute("data-landing-panel");
        if (section) syncLandingOverlayDemoCharts(section);
      }

      const detailsModal = document.getElementById("sectionDetailsModal");
      if (detailsModal && !detailsModal.classList.contains("hide")) {
        const kind = detailsModal.dataset.detailsKind || "";
        if (kind === "section" && typeof openSectionDetailsOverlay === "function") {
          openSectionDetailsOverlay(detailsModal.dataset.detailsSection || "", { itemType: detailsModal.dataset.detailsItemType || "" });
        } else if (kind === "wallet" && typeof openWalletDetailsOverlay === "function") {
          openWalletDetailsOverlay(detailsModal.dataset.detailsId || "");
        } else if (kind === "inventory-item" && typeof openInventoryItemDetailsOverlay === "function") {
          openInventoryItemDetailsOverlay(detailsModal.dataset.detailsId || "");
        } else if (kind === "loan" && typeof openLoanDetailsOverlay === "function") {
          openLoanDetailsOverlay(detailsModal.dataset.detailsPerson || "", detailsModal.dataset.detailsDirection || "taken");
        } else if (kind === "installment-item" && typeof openInstallmentItemDetailsOverlay === "function") {
          openInstallmentItemDetailsOverlay(detailsModal.dataset.detailsId || "");
        }
      }

      const assetModal = document.getElementById("assetDetailModal");
      if (assetModal && !assetModal.classList.contains("hide") && typeof renderAssetDetail === "function") {
        const id = typeof assetUi !== "undefined" ? assetUi?.selectedId : "";
        if (id) renderAssetDetail(id);
      }
    });
  }, { once: false });
}

initThemeSystem();
