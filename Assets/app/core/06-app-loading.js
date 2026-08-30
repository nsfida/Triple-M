/* Global in-app data loading overlay — refcounted, delay-show to avoid flash on cache hits. */
const appDataLoadingState = {
  depth: 0,
  showTimer: null,
  visible: false,
  message: "Refreshing your workspace…",
  sub: "Syncing your latest records securely",
  bound: false
};

const APP_DATA_LOAD_SHOW_DELAY_MS = 140;

function appDataLoadingMessageForTab(tab){
  const key = String(tab || "");
  if (key === "dashboard") {
    return { title: "Preparing your dashboard…", sub: "Fetching the latest summaries" };
  }
  if (key === "expenses") {
    return { title: "Loading expenses…", sub: "Syncing wallets and activity" };
  }
  if (key === "goods") {
    return { title: "Loading inventory…", sub: "Syncing stock and catalog data" };
  }
  if (key === "assets") {
    return { title: "Loading assets…", sub: "Fetching asset records" };
  }
  if (key === "notes") {
    return { title: "Loading notes…", sub: "Fetching your secure notes" };
  }
  if (key === "bitcoin") {
    return { title: "Loading Bitcoin…", sub: "Syncing wallets and balances" };
  }
  if (key === "installments") {
    return { title: "Loading installments…", sub: "Fetching payment schedules" };
  }
  if (["given", "received", "taken", "returned"].includes(key)) {
    return { title: "Loading loans…", sub: "Syncing loan records" };
  }
  if (key === "messages") {
    return { title: "Loading messages…", sub: "Fetching conversations" };
  }
  if (key === "admin") {
    return { title: "Loading admin…", sub: "Fetching account controls" };
  }
  if (key === "about") {
    return { title: "Loading…", sub: "Please wait a moment" };
  }
  return { title: "Refreshing your workspace…", sub: "Syncing your latest records securely" };
}

function ensureAppDataLoadingOverlay(){
  let el = document.getElementById("appDataLoadingOverlay");
  if (el) return el;
  el = document.createElement("div");
  el.id = "appDataLoadingOverlay";
  el.className = "app-data-loading hide";
  el.setAttribute("aria-hidden", "true");
  el.setAttribute("aria-live", "polite");
  el.setAttribute("role", "status");
  el.innerHTML = `
    <div class="app-data-loading-card">
      <div class="app-data-loading-visual" aria-hidden="true">
        <span class="app-data-loading-orbit"></span>
        <span class="app-data-loading-dot app-data-loading-dot-one"></span>
        <span class="app-data-loading-dot app-data-loading-dot-two"></span>
        <span class="app-data-loading-core"><i class="fa-solid fa-arrows-rotate"></i></span>
      </div>
      <p class="app-data-loading-title" id="appDataLoadingTitle">Refreshing your workspace…</p>
      <p class="app-data-loading-sub" id="appDataLoadingSub">Syncing your latest records securely</p>
      <div class="app-data-loading-track" aria-hidden="true"><span></span></div>
      <div class="app-data-loading-steps" aria-hidden="true"><span>Secure sync</span><span>Latest records</span></div>
    </div>`;
  const host = document.getElementById("app") || document.body;
  host.appendChild(el);
  return el;
}

function updateAppDataLoadingCopy(message){
  const title = typeof message === "string"
    ? message
    : (message?.title || appDataLoadingState.message);
  const sub = typeof message === "string"
    ? appDataLoadingState.sub
    : (message?.sub || appDataLoadingState.sub);
  appDataLoadingState.message = title;
  appDataLoadingState.sub = sub;
  const titleEl = document.getElementById("appDataLoadingTitle");
  const subEl = document.getElementById("appDataLoadingSub");
  if (titleEl) titleEl.textContent = title;
  if (subEl) subEl.textContent = sub;
}

function showAppDataLoadingOverlay(){
  const el = ensureAppDataLoadingOverlay();
  updateAppDataLoadingCopy({ title: appDataLoadingState.message, sub: appDataLoadingState.sub });
  el.classList.remove("hide");
  el.setAttribute("aria-hidden", "false");
  appDataLoadingState.visible = true;
  document.documentElement.classList.add("app-data-loading-active");
}

function hideAppDataLoadingOverlay(){
  const el = document.getElementById("appDataLoadingOverlay");
  if (el) {
    el.classList.add("hide");
    el.setAttribute("aria-hidden", "true");
  }
  appDataLoadingState.visible = false;
  document.documentElement.classList.remove("app-data-loading-active");
}

function beginAppDataLoad(message, options = {}){
  appDataLoadingState.depth += 1;
  if (message) updateAppDataLoadingCopy(message);
  else updateAppDataLoadingCopy({ title: appDataLoadingState.message, sub: appDataLoadingState.sub });

  const immediate = options.immediate === true;
  if (appDataLoadingState.visible) return;

  if (immediate) {
    if (appDataLoadingState.showTimer) {
      clearTimeout(appDataLoadingState.showTimer);
      appDataLoadingState.showTimer = null;
    }
    showAppDataLoadingOverlay();
    return;
  }

  if (appDataLoadingState.showTimer) return;
  appDataLoadingState.showTimer = setTimeout(() => {
    appDataLoadingState.showTimer = null;
    if (appDataLoadingState.depth > 0) showAppDataLoadingOverlay();
  }, APP_DATA_LOAD_SHOW_DELAY_MS);
}

function endAppDataLoad(){
  appDataLoadingState.depth = Math.max(0, appDataLoadingState.depth - 1);
  if (appDataLoadingState.depth > 0) return;
  if (appDataLoadingState.showTimer) {
    clearTimeout(appDataLoadingState.showTimer);
    appDataLoadingState.showTimer = null;
  }
  hideAppDataLoadingOverlay();
}

async function withAppDataLoad(message, fn, options = {}){
  beginAppDataLoad(message, options);
  try {
    return await fn();
  } finally {
    endAppDataLoad();
  }
}

function appTabLikelyNeedsFetch(tab){
  try {
    if (typeof state === "undefined" || !state?.unlocked) return false;
    if (state.trialLocked) return false;
    const key = String(tab || "");
    if (key === "dashboard" || key === "admin" || key === "messages") return true;
    if (key === "notes") return !state.notesLoaded;
    if (key === "assets") return !state.assetsLoaded;
    if (key === "bitcoin") return !state.bitcoinWalletsLoaded;
    if (typeof ledgerScopeForTab === "function" && state.loadedLedgerScopes) {
      const scope = ledgerScopeForTab(key);
      if (scope && !state.loadedLedgerScopes.has(scope)) return true;
      // Dashboard-warmed scopes may still need render pass; skip overlay if cached
      if (scope && state.loadedLedgerScopes.has(scope)) return false;
    }
  } catch (_) {}
  return true;
}
