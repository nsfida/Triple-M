/* Authenticated workspace themes. Preference only; no financial/session data is stored here. */

const TRIPLEM_LOW_POWER_CLASS = "triplem-low-power";
function detectTriplemLowPowerUi(){
  const memory = Number(navigator.deviceMemory || 0);
  const cores = Number(navigator.hardwareConcurrency || 0);
  const saveData = !!navigator.connection?.saveData;
  const reducedMotion = !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  // Be conservative: only opt into the lighter compositor profile when the
  // browser exposes a meaningful low-memory/CPU signal, data saver, or the user
  // explicitly requests reduced motion. This does not alter application logic.
  const lowMemory = memory > 0 && memory <= 4;
  const constrainedCpu = cores > 0 && cores <= 4 && (memory === 0 || memory <= 6);
  const lowPower = saveData || reducedMotion || lowMemory || constrainedCpu;
  document.documentElement.classList.toggle(TRIPLEM_LOW_POWER_CLASS, lowPower);
  return lowPower;
}
detectTriplemLowPowerUi();

const TRIPLEM_THEME_STORAGE_KEY = "triplem-theme-v1";
const TRIPLEM_THEME_REGISTRY = window.TRIPLEM_THEME_REGISTRY || {};
const TRIPLEM_THEMES = Object.freeze(
  Object.entries(TRIPLEM_THEME_REGISTRY).map(([id, theme]) => Object.freeze({
    id,
    label: theme.label || id,
    color: theme.themeColor || theme.swatch || theme.tokens?.["--primary"] || "#2457d6",
    swatch: theme.swatch || theme.tokens?.["--primary"] || "#2457d6",
    description: theme.description || "",
    mode: theme.mode || "light"
  }))
);

function themeUsesDarkColorScheme(id){
  return (TRIPLEM_THEME_REGISTRY?.[normalizeTriplemTheme(id)]?.mode || "light") === "dark";
}

function normalizeTriplemTheme(value){
  const id = String(value || "").trim().toLowerCase();
  return TRIPLEM_THEMES.some(theme => theme.id === id) ? id : "default";
}

function isTriplemThemeId(value){
  const id = String(value || "").trim().toLowerCase();
  return TRIPLEM_THEMES.some(theme => theme.id === id);
}

function readTriplemLocalTheme(){
  try { return normalizeTriplemTheme(localStorage.getItem(TRIPLEM_THEME_STORAGE_KEY)); }
  catch (_) { return "default"; }
}

function readTriplemAccountTheme(){
  try {
    const raw = state?.sessionUser?.settings?.Theme ?? state?.sessionUser?.settings?.theme ?? fullConfigData?.Theme ?? "";
    return isTriplemThemeId(raw) ? String(raw).trim().toLowerCase() : "";
  } catch (_) {
    return "";
  }
}

function readTriplemTheme(){
  return readTriplemAccountTheme() || readTriplemLocalTheme();
}

let triplemThemeSyncQueue = Promise.resolve();
function syncTriplemThemeToAccount(value){
  const id = normalizeTriplemTheme(value);
  if (!isTriplemWorkspaceAuthenticated() || typeof supabaseRpc !== "function") return Promise.resolve(false);
  // Serialize preference writes so rapid theme changes cannot complete out of order
  // and leave an older selection as the account-level value.
  triplemThemeSyncQueue = triplemThemeSyncQueue.catch(() => false).then(async () => {
    try {
      const updated = await supabaseRpc("app_update_own_settings", { p_settings: { Theme: id } });
      if (updated && typeof updated === "object") {
        if (typeof applyUserProfileToConfig === "function") applyUserProfileToConfig(updated);
        else if (state?.sessionUser) state.sessionUser.settings = { ...(state.sessionUser.settings || {}), Theme: id };
      } else if (state?.sessionUser) {
        state.sessionUser.settings = { ...(state.sessionUser.settings || {}), Theme: id };
      }
      if (fullConfigData && typeof fullConfigData === "object") fullConfigData.Theme = id;
      return true;
    } catch (err) {
      console.warn("Could not sync Triplem VIP theme to account settings:", err);
      return false;
    }
  });
  return triplemThemeSyncQueue;
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
  const requestedId = workspaceThemeAllowed ? normalizeTriplemTheme(value) : "default";
  const root = document.documentElement;

  // Freeze component transitions before any theme token changes. This prevents
  // a one-frame interpolation through the previous palette on glass surfaces,
  // native controls, overlays and chart shells during runtime switching.
  root.classList.toggle("triplem-workspace-themed", workspaceThemeAllowed);
  if (workspaceThemeAllowed) {
    root.classList.add("triplem-theme-applying");
    void root.offsetWidth;
  } else {
    root.classList.remove("triplem-theme-applying");
  }

  const id = typeof window.applyTriplemThemeTokens === "function"
    ? window.applyTriplemThemeTokens(requestedId, { dataset: true, meta: true })
    : requestedId;

  const theme = TRIPLEM_THEME_REGISTRY[id] || TRIPLEM_THEME_REGISTRY.default || {};
  root.dataset.triplemTheme = id;
  root.dataset.triplemThemeMode = theme.mode || (themeUsesDarkColorScheme(id) ? "dark" : "light");
  root.style.colorScheme = root.dataset.triplemThemeMode;

  if (workspaceThemeAllowed && options.persist !== false) {
    try { localStorage.setItem(TRIPLEM_THEME_STORAGE_KEY, id); } catch (_) {}
    if (options.syncAccount !== false) syncTriplemThemeToAccount(id).catch(() => {});
  }

  document.querySelectorAll("[data-theme-choice]").forEach(button => {
    const selected = button.dataset.themeChoice === id;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-checked", selected ? "true" : "false");
  });

  if (workspaceThemeAllowed) {
    requestAnimationFrame(() => root.classList.remove("triplem-theme-applying"));
  }
  window.dispatchEvent(new CustomEvent("triplemthemechange", { detail: { theme: id, mode: root.dataset.triplemThemeMode } }));
  return id;
}

function applyTriplemPublicTheme(){
  document.documentElement.classList.remove("triplem-workspace-themed");
  return applyTriplemTheme("default", { persist: false, forcePublic: true });
}

function applySavedTriplemWorkspaceTheme(){
  if (!isTriplemWorkspaceAuthenticated()) return applyTriplemPublicTheme();
  const accountTheme = readTriplemAccountTheme();
  const localTheme = readTriplemLocalTheme();
  const resolvedTheme = accountTheme || localTheme;
  const applied = applyTriplemTheme(resolvedTheme, { persist: false, forceWorkspace: true, syncAccount: false });
  try { localStorage.setItem(TRIPLEM_THEME_STORAGE_KEY, applied); } catch (_) {}
  // Existing users may already have a local theme from older builds. Migrate it
  // once into the account settings JSON so another browser/device can restore it.
  if (!accountTheme) syncTriplemThemeToAccount(applied).catch(() => {});
  return applied;
}

function renderThemeDropdown(){
  const dropdown = document.getElementById("themeDropdown");
  if (!dropdown) return null;
  if (dropdown.dataset.themeRendered !== "1") {
    dropdown.innerHTML = `
      <div class="theme-menu-heading" aria-hidden="true">
        <span>Theme</span>
        <small>Workspace appearance</small>
      </div>
      <div class="theme-menu-options" role="radiogroup" aria-label="Application theme">
        ${TRIPLEM_THEMES.map(theme => `
          <button class="theme-menu-choice" type="button" role="radio" data-theme-choice="${theme.id}" aria-checked="false" style="--theme-swatch:${theme.swatch || theme.color}">
            <span class="theme-menu-swatch" aria-hidden="true"></span>
            <span class="theme-menu-copy">
              <strong>${theme.label}</strong>
            </span>
            <i class="fa-solid fa-check theme-menu-check" aria-hidden="true"></i>
          </button>
        `).join("")}
      </div>`;
    dropdown.dataset.themeRendered = "1";
    dropdown.querySelectorAll("[data-theme-choice]").forEach(button => {
      button.addEventListener("click", event => {
        event.stopPropagation();
        if (!isTriplemWorkspaceAuthenticated()) {
          applyTriplemPublicTheme();
          return;
        }
        applyTriplemTheme(button.dataset.themeChoice);
        dropdown.classList.remove("open");
        const trigger = document.getElementById("themeSettingsBtn");
        trigger?.setAttribute("aria-expanded", "false");
        trigger?.focus({ preventScroll: true });
      });
    });
  }
  const activeTheme = isTriplemWorkspaceAuthenticated() ? readTriplemTheme() : "default";
  dropdown.querySelectorAll("[data-theme-choice]").forEach(button => {
    const selected = button.dataset.themeChoice === activeTheme;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-checked", selected ? "true" : "false");
  });
  return dropdown;
}

function initThemeSystem(){
  // Public pages always start in Triplem VIP Default. The saved preference is
  // restored only after completeAuthenticatedUnlock marks the workspace ready.
  applyTriplemPublicTheme();
  renderThemeDropdown();
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

      const storageModal = document.getElementById("adminStorageModal");
      if (storageModal && !storageModal.classList.contains("hide")
        && typeof renderAdminStorageCharts === "function"
        && typeof getAdminStorageChartSource === "function") {
        renderAdminStorageCharts(getAdminStorageChartSource());
      }
    });
  }, { once: false });
}

initThemeSystem();
