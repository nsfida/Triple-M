/* Modularized from script.js lines 28570-29321 — trial/welcome + loan wallet helpers. Load order must be preserved. */
function openTrialSignupModal(){
  try { if (typeof closeSignInOverlay === "function") closeSignInOverlay(); } catch (_) {}
  let modal = document.getElementById("trialSignupModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "trialSignupModal";
    modal.className = "modal hide";
    document.body.appendChild(modal);
  }
  const currencyOptions = (typeof ADMIN_CURRENCY_OPTIONS !== "undefined" && ADMIN_CURRENCY_OPTIONS.length)
    ? ADMIN_CURRENCY_OPTIONS
    : ["AED", "SAR", "PKR", "USD", "BTC"];
  modal.innerHTML = `
    <div class="modal-backdrop" data-trial-close="1"></div>
    <div class="modal-dialog" style="width:min(520px,100%)">
      <div class="modal-head">
        <div>
          <h3>Start your free 14-day trial</h3>
          <p>Create your own account with full workspace access for 14 days.</p>
        </div>
        <button type="button" class="btn ghost" data-trial-close="1" aria-label="Close">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Username</label>
          <input id="trialUsername" class="input" autocomplete="username" placeholder="Choose a username" />
        </div>
        <div class="form-group">
          <label class="form-label">Display name</label>
          <input id="trialDisplayName" class="input" autocomplete="name" placeholder="Your name or business" />
        </div>
        <div class="form-group">
          <label class="form-label">Email</label>
          <input id="trialEmail" class="input" type="email" autocomplete="email" placeholder="Shown on PDFs" />
        </div>
        <div class="form-group">
          <label class="form-label">Mobile</label>
          <input id="trialMobile" class="input" type="tel" autocomplete="tel" placeholder="Shown on PDFs" />
        </div>
        <div class="form-group">
          <label class="form-label">Address</label>
          <input id="trialAddress" class="input" autocomplete="street-address" placeholder="Shown on PDFs" />
        </div>
        <div class="form-group">
          <label class="form-label">Company name (optional)</label>
          <input id="trialCompany" class="input" placeholder="Shown on PDFs and header" />
        </div>
        <div class="form-group">
          <label class="form-label">TRN (optional)</label>
          <input id="trialTrn" class="input" placeholder="Tax registration number" />
        </div>
        <div class="form-group">
          <label class="form-label">Company logo (optional)</label>
          <div class="admin-logo-row">
            <input id="trialLogoFile" class="input" type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif" />
            <input id="trialLogoUrl" class="input" type="hidden" value="" />
          </div>
          <div class="admin-logo-preview-wrap">
            <img id="trialLogoPreview" class="admin-logo-preview hide" src="" alt="Logo preview" />
            <span id="trialLogoStatus" class="help">Optional — PNG/JPG up to 2MB. Used on PDFs and the app header.</span>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Currencies</label>
          ${checkboxGridHtml("trialCurrencies", currencyOptions, ["AED"])}
          <p class="help">Select at least one currency for your workspace.</p>
        </div>
        <div class="form-group">
          <label class="form-label">Password</label>
          <div class="admin-password-row">
            <input id="trialPassword" class="input" type="password" autocomplete="new-password" placeholder="8+ chars, upper, lower, number" />
            <button type="button" class="pw-eye-btn" data-toggle-form-pw="trialPassword" aria-label="Show password" title="Show password"><i class="fa-solid fa-eye" aria-hidden="true"></i></button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Confirm password</label>
          <div class="admin-password-row">
            <input id="trialPasswordConfirm" class="input" type="password" autocomplete="new-password" placeholder="Repeat password" />
            <button type="button" class="pw-eye-btn" data-toggle-form-pw="trialPasswordConfirm" aria-label="Show password" title="Show password"><i class="fa-solid fa-eye" aria-hidden="true"></i></button>
          </div>
        </div>
        <p class="help">Email, mobile, and address appear on your PDFs. Company name, TRN, and logo are optional. After 14 days you keep normal access during a grace period, then a one-day lock, then auto-disable unless an administrator renews your plan.</p>
        <div id="trialSignupError" class="lock-error"></div>
        <div class="modal-footer">
          <button type="button" class="btn ghost" data-trial-close="1">Cancel</button>
          <button type="button" class="btn primary" id="trialSignupSave">Create trial account</button>
        </div>
      </div>
    </div>`;

  const err = modal.querySelector("#trialSignupError");
  const close = () => {
    modal.classList.add("hide");
    modal.setAttribute("aria-hidden", "true");
  };
  modal.querySelectorAll("[data-trial-close]").forEach(el => {
    el.onclick = close;
  });
  modal.classList.remove("hide");
  modal.setAttribute("aria-hidden", "false");
  bindAdminLogoPicker("trial", null);
  modal.querySelector("#trialUsername")?.focus();
  bindAdminFormPasswordToggle(modal);

  modal.querySelector("#trialSignupSave").onclick = async () => {
    err.textContent = "";
    err.classList.remove("show");
    const username = modal.querySelector("#trialUsername").value.trim();
    const password = modal.querySelector("#trialPassword").value;
    const confirm = modal.querySelector("#trialPasswordConfirm").value;
    const displayName = modal.querySelector("#trialDisplayName").value.trim();
    const email = modal.querySelector("#trialEmail").value.trim();
    const mobile = modal.querySelector("#trialMobile").value.trim();
    const address = modal.querySelector("#trialAddress").value.trim();
    const company = modal.querySelector("#trialCompany").value.trim();
    const trn = modal.querySelector("#trialTrn").value.trim();
    const logoUrl = modal.querySelector("#trialLogoUrl")?.value.trim() || "";
    const currencies = readCheckboxGrid(modal, "trialCurrencies");
    try {
      if (!username) throw new Error("Please enter a username.");
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error("Please enter a valid email address.");
      }
      if (!mobile || mobile.length < 6) throw new Error("Please enter a valid mobile number.");
      if (!address || address.length < 4) throw new Error("Please enter your address for PDFs.");
      if (!currencies.length) throw new Error("Select at least one currency.");
      assertPasswordPolicy(password);
      if (password !== confirm) throw new Error("Passwords do not match.");
      const saveBtn = modal.querySelector("#trialSignupSave");
      saveBtn.disabled = true;
      saveBtn.textContent = "Creating…";
      runtimeConfig = getEmbeddedSupabaseConfig();
      const result = await supabaseRpc("app_trial_signup", {
        p_username: username,
        p_password: password,
        p_display_name: displayName || username,
        p_company_name: company || null,
        p_company_email: email,
        p_company_phone: mobile,
        p_company_address: address,
        p_vat_number: trn || null,
        p_logo_url: logoUrl || null,
        p_currencies: currencies,
        p_user_agent: navigator.userAgent || "",
        p_ip: null
      });
      const sessionToken = result?.session_token || "";
      const user = result?.user || null;
      if (!sessionToken || !user?.id) throw new Error("Trial signup failed. Please try again.");
      state.sessionToken = sessionToken;
      close();
      if (els.zipUsernameInput) els.zipUsernameInput.value = user.username || username;
      const ok = await completeAuthenticatedUnlock(user, sessionToken, {
        remember: readRememberMePreference()
      });
      if (!ok) {
        if (els.lockError) {
          els.lockError.textContent = "Trial account created, but sign-in was cancelled. Please sign in.";
          els.lockError.classList.add("show");
        }
      }
    } catch (ex) {
      err.textContent = ex.message || "Could not create trial account.";
      err.classList.add("show");
      const saveBtn = modal.querySelector("#trialSignupSave");
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = "Create trial account";
      }
    }
  };
}

function startGuestMode(){
  // Guest / demo mode is retired — route users to trial signup instead.
  openTrialSignupModal();
}

function doLogout(){
  const wasGuestMode = isGuestMode();
  if (!wasGuestMode && state.sessionToken) {
    supabaseRpc("app_logout", {}).catch(() => {});
  }
  runtimeConfig = getEmbeddedSupabaseConfig();
  fullConfigData = null;
  cachedPdfLogo = null;
  state.unlocked = false;
  state.guestMode = false;
  state.trialLocked = false;
  hideTrialExpiredOverlay();
  state.pageCurrencyPreferenceId = null;
  state.taxPreferenceId = null;
  state.currentUsername = "";
  state.sessionToken = "";
  state.sessionRememberMe = false;
  state.sessionUser = null;
  state.permissions = [];
  state.secretPinPreferenceId = null;
  state.secretPinHash = "";
  state.secretPinVerified = false;
  state.pendingDbSyncIds = new Set();
  state.hasImportedFile = false;
  state.dataSource = "supabase";
  sessionStorage.removeItem(IMPORT_SESSION_KEY);
  resetLazyDataState({ clearEntries: true });
  applyPageCurrencySelection(PAGE_CURRENCY_DEFAULT);
  renderSecretPinMenu();
  applyPermissionGates();
  if (!wasGuestMode) {
    removeStoredSessionCredentials();
  } else {
    resetGuestSessionData();
  }
  if (els.zipPasswordInput) els.zipPasswordInput.value = "";
  if (els.app) els.app.classList.add("hide");
  if (els.lockScreen) els.lockScreen.classList.remove("hide");
  updateGuestModeUi();
  btcClearSession();
  stopInstallmentDueChecker();
  stopMessagingLiveSync();
  messagingLiveState.fingerprint = null;
  messagingLiveState.fallbackFingerprint = null;
  messagingLiveState.syncRpcAvailable = null;
  messagingLiveState.lastThreadSig = null;
  messagingLiveState.lastNoteReminderDispatchAt = 0;
  clearNoteReminderWakeTimer();
  noteReminderUiState.pendingNoteIds = new Set();
  noteReminderUiState.pendingReminders = [];
  noteReminderUiState.loadedAt = 0;
  noteReminderUiState.inFlight = null;
  noteReminderUiState.modalMode = "note";
  noteReminderUiState.modalNoteId = null;
  noteReminderUiState.modalPlanGroupId = null;
  noteReminderUiState.modalPending = [];
  noteReminderUiState.toastedReminderIds = new Set();
  try { resetReminderAlertUi(); } catch (_) {}
  updateAdminCommsVisibility();
  resetActivePanelToDefault();
  clearAuthResumingUi();
  // Return to marketing landing — do not auto-open the sign-in overlay.
  if (els.lockError) els.lockError.textContent = "";
  try { if (typeof closeSignInOverlay === "function") closeSignInOverlay(); } catch (_) {}
  try { if (typeof closeLandingContentOverlay === "function") closeLandingContentOverlay({ clearHash: true, focusLogin: false }); } catch (_) {}
  try { applyRememberMeCheckboxFromPreference(); } catch {}
}

function clearAuthResumingUi(){
  try { document.documentElement.classList.remove("auth-resuming"); } catch (_) {}
  const splash = document.getElementById("authResumeSplash");
  if (splash) {
    splash.setAttribute("aria-busy", "false");
  }
}

function showAuthResumingUi(){
  if (document.documentElement.classList.contains("auth-resuming")) {
    if (els.lockScreen) els.lockScreen.classList.add("hide");
    if (els.welcomeScreen) els.welcomeScreen.classList.add("hide");
    return;
  }
  try { document.documentElement.classList.add("auth-resuming"); } catch (_) {}
  const splash = document.getElementById("authResumeSplash");
  if (splash) splash.setAttribute("aria-busy", "true");
  if (els.lockScreen) els.lockScreen.classList.add("hide");
  if (els.welcomeScreen) els.welcomeScreen.classList.add("hide");
}

async function autoLogin(){
  clearLegacyZipStorage();
  applyRememberMeCheckboxFromPreference();
  // Drop any leftover non-Remember credentials from earlier builds (sessionStorage).
  try { sessionStorage.removeItem(SESSION_EPHEMERAL_STORAGE_KEY); } catch {}
  // Only auto-sign-in when Remember Me was used (localStorage). Refresh without it → login screen.
  const credential = await loadEncryptedSessionCredential();
  if (!credential?.username || !credential?.sessionToken) {
    clearAuthResumingUi();
    return false;
  }
  showAuthResumingUi();
  if (els.zipUsernameInput){
    els.zipUsernameInput.value = credential.username;
  }
  if (els.rememberMeCheckbox) {
    els.rememberMeCheckbox.checked = true;
  }
  const ok = await attemptUnlock({
    username: credential.username,
    rememberedCredential: credential,
    remember: true,
    silentResume: true
  });
  if (!ok) {
    clearAuthResumingUi();
    if (els.lockScreen) {
      els.lockScreen.classList.remove("hide");
      els.lockScreen.style.display = "";
    }
  }
  return !!ok;
}

async function completeAuthenticatedUnlock(user, sessionToken, { remember = false, silentResume = false } = {}){
  runtimeConfig = getEmbeddedSupabaseConfig();
  state.sessionToken = sessionToken || state.sessionToken || "";
  state.sessionRememberMe = !!remember;
  applyUserProfileToConfig(user);
  state.pendingDbSyncIds = new Set();
  cachedPdfLogo = null;
  sessionStorage.removeItem(IMPORT_SESSION_KEY);
  state.hasImportedFile = false;
  state.dataSource = "supabase";
  resetLazyDataState({ clearEntries: true });
  updateLogosFromConfig();
  updateHeaderTextFromConfig();

  const access = getUserAccessFlags(user);
  // Lock only after grace ends (1-day lock window). Grace keeps normal workspace access.
  state.trialLocked = access.lock_active === true
    || (typeof isAccessWorkspaceLocked === "function" && isAccessWorkspaceLocked(user));

  if (silentResume) {
    showAuthResumingUi();
  }

  if (!state.trialLocked) {
    // Smart PIN from profile first so we can warm Expenses in parallel with prefs when no PIN.
    let pinReadyFromProfile = false;
    if (silentResume && user && Object.prototype.hasOwnProperty.call(user, "smart_pin_hash")) {
      const profilePin = String(user.smart_pin_hash || "").trim().toLowerCase();
      state.secretPinPreferenceId = null;
      state.secretPinHash = /^[a-f0-9]{64}$/.test(profilePin) ? profilePin : "";
      state.secretPinVerified = !state.secretPinHash;
      pinReadyFromProfile = true;
      try { renderSecretPinMenu(); } catch (_) {}
    }

    const prefsPromise = Promise.all([
      loadPageCurrencyPreferenceFromDatabase(),
      loadTaxSettingsPreferenceFromDatabase()
    ]);

    // No PIN: start Expenses fetch while currency/tax load (largest splash wait).
    let warmTabLoad = null;
    if (silentResume && state.secretPinVerified) {
      const warmTab = typeof resolveStartupTab === "function" ? resolveStartupTab() : "dashboard";
      warmTabLoad = warmTab === "dashboard" && typeof warmDashboardData === "function"
        ? warmDashboardData()
        : ensureTabDataLoaded(warmTab || "dashboard", { force: true });
      warmTabLoad.catch(err => console.warn("Startup tab warm load failed:", err));
    }

    await prefsPromise;
    updateCurrencyFiltersFromConfig();

    const allowedCurrencies = getAllowedCurrencies();
    if (allowedCurrencies.length > 0 && !allowedCurrencies.includes(state.lastCurrency)) {
      state.lastCurrency = allowedCurrencies[0];
    }

    if (!pinReadyFromProfile) {
      await loadSecretPinPreferenceFromDatabase();
    }
    if (state.secretPinHash && !state.secretPinVerified) {
      // Drop splash while PIN is shown so resume doesn't feel "stuck loading".
      if (silentResume) clearAuthResumingUi();
      const pinOk = await requestSecretPinUnlock();
      if (!pinOk) {
        state.__silentResumeTabLoad = null;
        return false;
      }
      if (silentResume) showAuthResumingUi();
      if (silentResume && !warmTabLoad) {
        const warmTab = typeof resolveStartupTab === "function" ? resolveStartupTab() : "dashboard";
        warmTabLoad = warmTab === "dashboard" && typeof warmDashboardData === "function"
          ? warmDashboardData()
          : ensureTabDataLoaded(warmTab || "dashboard", { force: true });
        warmTabLoad.catch(err => console.warn("Startup tab warm load failed:", err));
      }
    } else if (!state.secretPinHash) {
      state.secretPinVerified = true;
    }

    // Stash so enterApp can reuse the in-flight load instead of starting over.
    if (warmTabLoad) state.__silentResumeTabLoad = warmTabLoad;
  } else {
    state.secretPinHash = "";
    state.secretPinVerified = true;
    applyPageCurrencySelection(PAGE_CURRENCY_DEFAULT);
  }

  if (user?.must_change_password && !state.trialLocked) {
    if (silentResume) clearAuthResumingUi();
    const changed = await requestForcedPasswordChange();
    if (!changed) {
      state.__silentResumeTabLoad = null;
      return false;
    }
    if (silentResume) showAuthResumingUi();
  }

  sessionStorage.setItem(SESSION_USERNAME_KEY, state.currentUsername);
  // Remember Me credential is already on disk during silent resume — skip re-encrypt.
  if (remember && state.sessionToken && !silentResume) {
    try {
      await saveEncryptedSessionCredential({
        username: state.currentUsername,
        sessionToken: state.sessionToken
      }, { persist: true });
    } catch (storeErr) {
      console.warn("Could not save encrypted session for Remember Me.", storeErr);
      try { localStorage.removeItem(SESSION_ENCRYPTED_STORAGE_KEY); } catch {}
    }
  } else if (!remember) {
    // Explicitly clear any prior Remember Me / ephemeral login so refresh shows sign-in.
    try {
      await saveEncryptedSessionCredential({
        username: state.currentUsername || "",
        sessionToken: ""
      }, { persist: false });
    } catch {
      try { localStorage.removeItem(SESSION_ENCRYPTED_STORAGE_KEY); } catch {}
      try { sessionStorage.removeItem(SESSION_EPHEMERAL_STORAGE_KEY); } catch {}
      try { localStorage.setItem(REMEMBER_ME_PREF_KEY, "0"); } catch {}
    }
  }

  if (els.zipPasswordInput) els.zipPasswordInput.value = "";
  state.unlocked = true;
  state.guestMode = false;
  updateGuestModeUi();
  applyPermissionGates();

  const displayName = getLoggedInUserDisplayName();
  if (els.welcomeName) els.welcomeName.textContent = displayName;
  try { closeLandingContentOverlay({ clearHash: true, focusLogin: false }); } catch (_) {}
  try { if (typeof closeSignInOverlay === "function") closeSignInOverlay(); } catch (_) {}
  if (els.lockScreen) els.lockScreen.classList.add("hide");

  if (silentResume) {
    if (els.welcomeScreen) els.welcomeScreen.classList.add("hide");
    // Show shell immediately; load Expenses in the background so splash is not held on data fetch.
    await enterAppAfterUnlock(false, { instant: true, deferTabLoad: true });
    await new Promise(resolve => requestAnimationFrame(resolve));
    clearAuthResumingUi();
    return true;
  }

  if (els.welcomeScreen) els.welcomeScreen.classList.remove("hide");
  clearAuthResumingUi();
  setTimeout(() => {
    showWelcomeAndTransitionToApp(false);
  }, 1200);
  return true;
}

/** Without Remember Me, revoke the server session when the tab/page is closed or refreshed. */
function revokeNonRememberedSessionOnUnload(){
  if (state.sessionRememberMe) return;
  if (!state.unlocked || !state.sessionToken) return;
  try {
    const dbConfig = typeof getSupabaseConfig === "function"
      ? getSupabaseConfig()
      : (typeof getEmbeddedSupabaseConfig === "function" ? getEmbeddedSupabaseConfig() : null);
    if (!dbConfig?.supabaseUrl || !dbConfig?.supabaseKey) return;
    const headers = {
      "apikey": dbConfig.supabaseKey,
      "Authorization": `Bearer ${dbConfig.supabaseKey}`,
      "Content-Type": "application/json",
      "X-Session-Token": state.sessionToken
    };
    const url = `${dbConfig.supabaseUrl}/rest/v1/rpc/app_logout`;
    const body = "{}";
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      // sendBeacon cannot set custom headers; fall through to keepalive fetch
    }
    fetch(url, {
      method: "POST",
      headers,
      body,
      keepalive: true,
      credentials: "omit"
    }).catch(() => {});
  } catch (_) {}
  try { sessionStorage.removeItem(SESSION_EPHEMERAL_STORAGE_KEY); } catch {}
  try { localStorage.removeItem(SESSION_ENCRYPTED_STORAGE_KEY); } catch {}
}

function bindNonRememberedSessionUnloadGuard(){
  if (window.__triplemNonRememberUnloadBound) return;
  window.__triplemNonRememberUnloadBound = true;
  window.addEventListener("pagehide", () => {
    revokeNonRememberedSessionOnUnload();
  });
}

async function requestForcedPasswordChange(){
  return new Promise((resolve) => {
    let modal = document.getElementById("forcePasswordModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "forcePasswordModal";
      modal.className = "modal hide";
      modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-dialog" style="width:min(420px,100%)">
          <div class="modal-head">
            <div>
              <h3>Password change required</h3>
              <p>Your administrator requires you to set a new password before continuing.</p>
            </div>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Current password</label>
              <div class="admin-password-row">
                <input id="forcePwOld" class="input" type="password" autocomplete="current-password" />
                <button type="button" class="pw-eye-btn" data-toggle-form-pw="forcePwOld" aria-label="Show password" title="Show password"><i class="fa-solid fa-eye" aria-hidden="true"></i></button>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">New password</label>
              <div class="admin-password-row">
                <input id="forcePwNew" class="input" type="password" autocomplete="new-password" placeholder="8+ chars, upper, lower, number" />
                <button type="button" class="pw-eye-btn" data-toggle-form-pw="forcePwNew" aria-label="Show password" title="Show password"><i class="fa-solid fa-eye" aria-hidden="true"></i></button>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Confirm new password</label>
              <div class="admin-password-row">
                <input id="forcePwConfirm" class="input" type="password" autocomplete="new-password" />
                <button type="button" class="pw-eye-btn" data-toggle-form-pw="forcePwConfirm" aria-label="Show password" title="Show password"><i class="fa-solid fa-eye" aria-hidden="true"></i></button>
              </div>
            </div>
            <div id="forcePwError" class="lock-error"></div>
            <div class="modal-footer">
              <button type="button" class="btn ghost" id="forcePwCancel">Cancel</button>
              <button type="button" class="btn primary" id="forcePwSave">Save password</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(modal);
    }
    const errEl = modal.querySelector("#forcePwError");
    const oldEl = modal.querySelector("#forcePwOld");
    const newEl = modal.querySelector("#forcePwNew");
    const confirmEl = modal.querySelector("#forcePwConfirm");
    bindAdminFormPasswordToggle(modal);
    errEl.textContent = "";
    errEl.classList.remove("show");
    oldEl.value = "";
    newEl.value = "";
    confirmEl.value = "";
    modal.classList.remove("hide");

    const cleanup = (ok) => {
      modal.classList.add("hide");
      modal.querySelector("#forcePwSave").onclick = null;
      modal.querySelector("#forcePwCancel").onclick = null;
      resolve(ok);
    };

    modal.querySelector("#forcePwCancel").onclick = () => {
      removeStoredSessionCredentials();
      state.sessionToken = "";
      cleanup(false);
    };
    modal.querySelector("#forcePwSave").onclick = async () => {
      errEl.textContent = "";
      errEl.classList.remove("show");
      const oldPw = oldEl.value;
      const newPw = newEl.value;
      try {
        assertPasswordPolicy(newPw, "New password");
      } catch (policyErr) {
        errEl.textContent = policyErr.message || PASSWORD_POLICY_HELP;
        errEl.classList.add("show");
        return;
      }
      if (newPw !== confirmEl.value) {
        errEl.textContent = "New passwords do not match.";
        errEl.classList.add("show");
        return;
      }
      try {
        await supabaseRpc("app_change_password", {
          p_old_password: oldPw,
          p_new_password: newPw
        });
        if (state.sessionUser) {
          state.sessionUser.must_change_password = false;
          state.sessionUser.password_is_weak = false;
        }
        updateWeakPasswordBanner();
        cleanup(true);
      } catch (err) {
        errEl.textContent = err.message || "Could not change password.";
        errEl.classList.add("show");
      }
    };
  });
}

async function attemptUnlock(options = {}){
  els.lockError.textContent = "";
  els.lockError.classList.remove("show");
  const usernameRaw = options.username || (els.zipUsernameInput ? els.zipUsernameInput.value.trim() : "");
  const rememberedCredential = options.rememberedCredential || null;
  const password = rememberedCredential ? "" : (els.zipPasswordInput ? els.zipPasswordInput.value : "");
  const remember = typeof options.remember === "boolean"
    ? options.remember
    : readRememberMePreference();
  const silentResume = options.silentResume === true;
  if (!usernameRaw){
    els.lockError.textContent = "Please enter your username.";
    els.lockError.classList.add("show");
    return false;
  }
  if (!rememberedCredential && !password){
    els.lockError.textContent = "Please enter your password.";
    els.lockError.classList.add("show");
    return false;
  }
  if (els.unlockBtn) {
    els.unlockBtn.disabled = true;
    els.unlockBtn.textContent = "Signing In…";
  }
  try{
    const safeUser = sanitizeUsername(usernameRaw);
    runtimeConfig = getEmbeddedSupabaseConfig();
    let user = null;
    let sessionToken = "";

    if (rememberedCredential){
      if (rememberedCredential.username !== safeUser) {
        throw new Error("Saved login does not match this username.");
      }
      state.sessionToken = rememberedCredential.sessionToken;
      const validated = await supabaseRpc("app_validate_session", {});
      user = validated?.user || validated;
      sessionToken = rememberedCredential.sessionToken;
      if (!user?.id) throw new Error("Session expired or invalid");
    } else {
      let result = null;
      try {
        result = await supabaseRpc("app_login", {
          p_username: safeUser,
          p_password: password,
          p_user_agent: navigator.userAgent || "",
          p_ip: null,
          p_remember: !!remember
        });
      } catch (loginErr) {
        const msg = String(loginErr?.message || loginErr || "");
        // Older DB without p_remember still accepts the classic 4-arg login.
        if (/p_remember|Could not find the function|PGRST202|404/i.test(msg)) {
          result = await supabaseRpc("app_login", {
            p_username: safeUser,
            p_password: password,
            p_user_agent: navigator.userAgent || "",
            p_ip: null
          });
        } else {
          throw loginErr;
        }
      }
      sessionToken = result?.session_token || "";
      user = result?.user || null;
      if (!sessionToken || !user?.id) {
        throw new Error("Login failed. Please try again.");
      }
      state.sessionToken = sessionToken;
    }

    const ok = await completeAuthenticatedUnlock(user, sessionToken, {
      remember: !!remember,
      silentResume
    });
    if (!ok) {
      if (!silentResume) {
        els.lockError.textContent = "Sign-in was cancelled.";
        els.lockError.classList.add("show");
      }
      state.unlocked = false;
      removeStoredSessionCredentials();
      return false;
    }
    return true;
  }catch(err){
    if (rememberedCredential){
      removeStoredSessionCredentials();
      if (!silentResume) {
        els.lockError.textContent = "Saved login could not be used. Please enter your password again.";
        els.lockError.classList.add("show");
      }
    } else {
      els.lockError.textContent = err.message || "Sign-in failed.";
      els.lockError.classList.add("show");
    }
    return false;
  }finally{
    if (els.unlockBtn) {
      els.unlockBtn.disabled = false;
      els.unlockBtn.textContent = "Sign In";
    }
  }
}

async function enterAppAfterUnlock(keepCurrentBackup, { instant = false, deferTabLoad = false } = {}){
  if (els.welcomeScreen) {
    if (instant) {
      els.welcomeScreen.classList.add("hide");
      els.welcomeScreen.classList.remove("exit-animation");
    } else {
      els.welcomeScreen.classList.add("exit-animation");
    }
  }

  if (els.app) {
    els.app.classList.remove("hide");
    if (!instant) els.app.classList.add("app-enter-animation");
  }
  updateGuestModeUi();
  applyPermissionGates();

  const finish = async () => {
    if (els.welcomeScreen) {
      els.welcomeScreen.classList.add("hide");
      els.welcomeScreen.classList.remove("exit-animation");
    }
    if (els.app) els.app.classList.remove("app-enter-animation");

    defaultDateInputs(document);

    if (state.dataSource === "backup") {
      loadRecycleBinFromStorage();
      renderRecycleBinDropdown();
    }

    if (keepCurrentBackup){
      await refreshDbSnapshot();
      updateUploadButtonVisibility();
      updateConnectButtonVisibility();
      renderAll();
    } else if (state.trialLocked) {
      resetLazyDataState({ clearEntries: true });
      renderAll();
      updateAccessBanner();
      showTrialExpiredOverlay();
    } else {
      hideTrialExpiredOverlay();
      const startupTab = typeof resolveStartupTab === "function" ? resolveStartupTab() : "dashboard";
      activate(startupTab || "dashboard");
      const warm = state.__silentResumeTabLoad;
      state.__silentResumeTabLoad = null;
      const loadPromise = warm || (startupTab === "dashboard"
        ? (typeof warmDashboardData === "function" ? warmDashboardData() : Promise.resolve())
        : ensureTabDataLoaded(startupTab || "dashboard", { force: true }));
      if (deferTabLoad) {
        loadPromise.catch(err => console.warn("Startup tab load failed:", err));
      } else {
        await loadPromise;
      }
    }
  };

  if (instant) {
    await finish();
    return;
  }
  setTimeout(() => { finish().catch(() => {}); }, 1200);
}

async function showWelcomeAndTransitionToApp(keepCurrentBackup) {
  await enterAppAfterUnlock(keepCurrentBackup, { instant: false });
}

function populateLoanWalletSelector(currency, selectEl) {
  if (!selectEl) return;
  const accounts = getExpenseAccounts({ applyUiFilters: false }).filter(a => a.currency !== "BTC");
  const matchingAccounts = currency
    ? accounts.filter(a => a.currency === currency)
    : accounts;

  selectEl.innerHTML = `<option value="">Skip wallet entry</option>` +
    matchingAccounts.map(a => {
      const balDisplay = formatReportAmount(a.balance, a.currency);
      return `<option value="${escapeHtml(a.group_id)}">${escapeHtml(a.person_name)} (${escapeHtml(a.accountType)}) — ${escapeHtml(balDisplay)}</option>`;
    }).join("");
}

function populateInventoryWalletSelector(selectEl, currency, placeholder, emptyLabel){
  if (!selectEl) return;
  const cur = String(currency || "").trim();
  const currentValue = String(selectEl.value || "");
  const accounts = getExpenseAccounts({ applyUiFilters: false })
    .filter(a => a.currency !== "BTC" && (!cur || a.currency === cur));
  if (!cur){
    selectEl.innerHTML = `<option value="">${escapeHtml(emptyLabel || placeholder)}</option>`;
    selectEl.disabled = true;
    return;
  }
  selectEl.disabled = false;
  selectEl.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` +
    accounts.map(a => {
      const balDisplay = formatReportAmount(a.balance, a.currency);
      return `<option value="${escapeHtml(a.group_id)}">${escapeHtml(a.person_name)} (${escapeHtml(a.accountType)}) - ${escapeHtml(balDisplay)}</option>`;
    }).join("");
  if (currentValue && accounts.some(a => a.group_id === currentValue)){
    selectEl.value = currentValue;
  }
  if (!accounts.length){
    selectEl.innerHTML = `<option value="">No wallet in ${escapeHtml(cur)}</option>`;
    selectEl.disabled = true;
  }
}

function updateGoodsPurchaseWalletSelector(){
  if (!els.goodsPurchaseWalletSelect || !els.goodsPurchaseLines) return;
  const currencies = new Set(
    Array.from(els.goodsPurchaseLines.querySelectorAll(".goods-buy-currency"))
      .map(el => String(el.value || "").trim())
      .filter(Boolean)
  );
  if (currencies.size !== 1){
    els.goodsPurchaseWalletSelect.innerHTML = `<option value="">${currencies.size ? "Wallet requires one currency" : "Skip wallet deduction"}</option>`;
    els.goodsPurchaseWalletSelect.disabled = currencies.size !== 0;
    return;
  }
  populateInventoryWalletSelector(
    els.goodsPurchaseWalletSelect,
    Array.from(currencies)[0],
    "Skip wallet deduction",
    "Select item currency first"
  );
}

function updateGoodsSaleWalletSelector(totalsByCurrency = getGoodsSaleTotalsByCurrency()){
  if (!els.goodsSaleWalletSelect) return;
  const totals = Array.from((totalsByCurrency || new Map()).entries())
    .filter(([, amount]) => Number(amount || 0) > 0);
  if (totals.length !== 1){
    els.goodsSaleWalletSelect.innerHTML = `<option value="">${totals.length ? "Wallet requires one currency invoice" : "Skip wallet top-up"}</option>`;
    els.goodsSaleWalletSelect.disabled = totals.length !== 0;
    return;
  }
  populateInventoryWalletSelector(
    els.goodsSaleWalletSelect,
    totals[0][0],
    "Skip wallet top-up",
    "Select sale item first"
  );
}

function updateGoodsSettlementWalletSelector(currency = ""){
  if (!els.goodsSettlementWalletSelect) return;
  const cur = String(currency || state.inventoryDraft?.settlement?.currency || "").trim();
  if (!cur){
    els.goodsSettlementWalletSelect.innerHTML = `<option value="">Skip wallet top-up</option>`;
    els.goodsSettlementWalletSelect.disabled = true;
    return;
  }
  populateInventoryWalletSelector(
    els.goodsSettlementWalletSelect,
    cur,
    "Skip wallet top-up",
    "Select invoice currency first"
  );
}

function validateInventoryWallet(walletGroupId, currency, amount, mode){
  const account = getExpenseAccounts({ applyUiFilters: false }).find(a => a.group_id === walletGroupId);
  if (!account) throw new Error("Selected wallet was not found.");
  if (account.currency === "BTC") throw new Error("BTC wallet balances and transactions are loaded directly from the blockchain.");
  if (account.currency !== currency) throw new Error("Selected wallet currency does not match the inventory currency.");
  if (mode === "deduct" && Number(amount || 0) > Number(account.balance || 0)){
    throw new Error(`Insufficient wallet balance. Available: ${formatReportAmount(account.balance, account.currency)}.`);
  }
  return account;
}

async function createWalletEntryForInventory(walletGroupId, amount, date, currency, mode, context = {}){
  const account = getExpenseAccounts({ applyUiFilters: false }).find(a => a.group_id === walletGroupId);
  if (!account || account.currency === "BTC" || account.currency !== currency || !Number(amount || 0)) return;
  const isTopup = mode === "sale" || mode === "settlement";
  const itemName = String(context.itemName || context.customerName || "Inventory").trim();
  const noteText = mode === "settlement"
    ? `Inventory settlement ${context.receiptNumber ? `invoice ${context.receiptNumber}` : ""}`.trim()
    : isTopup
      ? `Inventory sale ${context.receiptNumber ? `invoice ${context.receiptNumber}` : ""}`.trim()
      : `Inventory purchase ${itemName}`.trim();

  const payload = {
    group_id: walletGroupId,
    direction: "taken",
    entry_kind: "partial",
    person_name: account.person_name,
    currency: account.currency,
    principal_amount: null,
    action_amount: Number(amount || 0),
    loan_date: account.principal?.loan_date || date,
    action_date: date,
    notes: upsertExpenseMetaInNote(noteText, {
      accountType: account.accountType,
      rowType: isTopup ? "TOPUP" : "EXPENSE",
      itemName,
      expenseType: mode === "settlement" ? "Inventory Settlement" : (isTopup ? "Inventory Sale" : "Inventory Purchase")
    })
  };

  saveEntriesImmediately(payload, { label: "Wallet entry" });
}

async function createWalletEntryForLoanPrincipal(walletGroupId, amount, date, personName, direction, currency) {
  const account = getExpenseAccounts({ applyUiFilters: false }).find(a => a.group_id === walletGroupId);
  if (!account) return;
  if (account.currency === "BTC") return;
  if (account.currency !== currency) {
    console.warn("Wallet currency mismatch, skipping wallet entry.");
    return;
  }
  // Loan Given  → money GOES OUT of wallet → EXPENSE
  // Loan Taken  → money COMES INTO wallet  → TOPUP
  const isExpense = direction === "given";
  const noteText = isExpense
    ? `Loan Given to ${personName}`
    : `Loan Received from ${personName}`;

  const payload = {
    group_id: walletGroupId,
    direction: "taken",
    entry_kind: "partial",
    person_name: account.person_name,
    currency: account.currency,
    principal_amount: null,
    action_amount: amount,
    loan_date: account.principal?.loan_date || date,
    action_date: date,
    notes: upsertExpenseMetaInNote(noteText, {
      accountType: account.accountType,
      rowType: isExpense ? "EXPENSE" : "TOPUP",
      itemName: personName,
      expenseType: isExpense ? "Loan Given" : "Loan Received"
    })
  };

  await saveEntriesImmediately(payload, { label: "Wallet entry", awaitSync: true });
}

async function createWalletEntryForPayment(walletGroupId, amount, date, personName, direction, currency) {
  const account = getExpenseAccounts({ applyUiFilters: false }).find(a => a.group_id === walletGroupId);
  if (!account) return;
  if (account.currency === "BTC") return;
  if (account.currency !== currency) {
    console.warn("Wallet currency mismatch, skipping wallet entry.");
    return;
  }
  // Received Back (given)  → money COMES BACK   → TOPUP
  // Returned Back (taken)  → money GOES OUT      → EXPENSE
  const isTopup = direction === "given";
  const noteText = isTopup
    ? `Received Back from ${personName}`
    : `Returned Back to ${personName}`;

  const payload = {
    group_id: walletGroupId,
    direction: "taken",
    entry_kind: "partial",
    person_name: account.person_name,
    currency: account.currency,
    principal_amount: null,
    action_amount: amount,
    loan_date: account.principal?.loan_date || date,
    action_date: date,
    notes: upsertExpenseMetaInNote(noteText, {
      accountType: account.accountType,
      rowType: isTopup ? "TOPUP" : "EXPENSE",
      itemName: personName,
      expenseType: isTopup ? "Received Back" : "Returned Back"
    })
  };

  await saveEntriesImmediately(payload, { label: "Wallet entry", awaitSync: true });
}
