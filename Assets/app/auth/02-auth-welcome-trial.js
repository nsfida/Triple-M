/* Modularized from script.js lines 28570-29321 — trial/welcome + loan wallet helpers. Load order must be preserved. */
function openTrialSignupModal(preferredPlan = "free"){
  try { if (typeof closeSignInOverlay === "function") closeSignInOverlay(); } catch (_) {}
  let modal = document.getElementById("trialSignupModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "trialSignupModal";
    modal.className = "modal hide";
    document.body.appendChild(modal);
  }

  const workspaceCurrencies = ["AED", "SAR", "PKR", "USD", "BTC"];
  const prices = {
    monthly: { AED: 49, SAR: 49, PKR: 1799, USD: 13.99 },
    yearly: { AED: 449, SAR: 449, PKR: 19999, USD: 149 }
  };
  const teamPrices = {
    monthly: { AED: 10, SAR: 10, PKR: 75, USD: 4 },
    yearly: { AED: 80, SAR: 80, PKR: 7000, USD: 40 }
  };
  const normalizedPreferredPlan = ["free","monthly","yearly"].includes(String(preferredPlan || "").toLowerCase()) ? String(preferredPlan).toLowerCase() : "free";
  const stateSignup = { step: 1, plan: normalizedPreferredPlan, accountType: "individual", receiptBase64: "" };
  const money = (v, c) => `${c} ${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const priceLines = period => ["AED","SAR","PKR","USD"].map(c => `<span><b>${c}</b> ${money(prices[period][c], c).replace(c+" ","")}</span>`).join("");

  modal.innerHTML = `
    <div class="modal-backdrop" data-trial-close="1"></div>
    <div class="modal-dialog trial-signup-dialog signup-v2-dialog" role="dialog" aria-modal="true" aria-labelledby="trialSignupTitle">
      <div class="modal-head trial-signup-head signup-v2-head">
        <div class="signup-hero-copy">
          <p class="trial-signup-kicker"><i class="fa-solid fa-gem" aria-hidden="true"></i> Triplem VIP Membership</p>
          <h3 id="trialSignupTitle">Build your private finance workspace in minutes</h3>
          <p>One refined workspace for accounts, expenses, inventory, loans, assets, reports and secure support, personalized for you or your company.</p>
        </div>
        <button type="button" class="btn ghost trial-signup-close" data-trial-close="1" aria-label="Close">✕</button>
      </div>
      <div class="signup-offer-spotlight" role="note" aria-label="Limited-time Triplem VIP offers">
        <span class="signup-offer-icon" aria-hidden="true"><i class="fa-solid fa-bolt"></i></span>
        <div><small>Limited-time membership offer</small><strong>Start with 14 days free, or unlock bonus Pro time after payment approval.</strong><p>Pro Monthly includes <b>30 additional days free</b>. Pro Yearly includes <b>60 additional days free</b>.</p></div>
        <span class="signup-offer-seal"><i class="fa-solid fa-shield-halved"></i> Secure setup</span>
      </div>
      <div class="signup-v2-progress" aria-label="Signup progress">
        <span class="active" data-signup-progress="1">1 <small>Plan</small></span>
        <span data-signup-progress="2">2 <small>Account</small></span>
        <span data-signup-progress="3">3 <small>Details</small></span>
        <span data-signup-progress="4">4 <small>Payment</small></span>
      </div>
      <div class="signup-v2-value-strip" aria-label="Triplem VIP account benefits">
        <span><i class="fa-solid fa-shield-halved"></i><b>Authenticator 2FA</b><small>Optional second factor</small></span>
        <span><i class="fa-solid fa-headset"></i><b>Live Support</b><small>AI + human agents</small></span>
        <span><i class="fa-solid fa-building"></i><b>Private Workspace</b><small>Owner-isolated records</small></span>
        <span><i class="fa-solid fa-palette"></i><b>Personalized</b><small>Branding + themes</small></span>
      </div>
      <div class="modal-body trial-signup-body signup-v2-body">
        <section class="signup-v2-step" data-signup-step="1">
          <div class="signup-plan-grid">
            <button type="button" class="signup-plan-card signup-plan-card--free ${stateSignup.plan === "free" ? "selected" : ""}" data-signup-plan="free">
              <span class="signup-plan-badge"><i class="fa-solid fa-star"></i> Start free</span>
              <span class="signup-plan-icon"><i class="fa-solid fa-gift"></i></span><strong>Free 14 Days</strong>
              <b>No payment · no card</b><small>Explore the complete workspace before choosing a paid plan.</small>
              <span class="signup-plan-benefit"><i class="fa-solid fa-check"></i> Full workspace access</span>
            </button>
            <button type="button" class="signup-plan-card signup-plan-card--monthly ${stateSignup.plan === "monthly" ? "selected" : ""}" data-signup-plan="monthly">
              <span class="signup-plan-badge signup-plan-badge--offer"><i class="fa-solid fa-bolt"></i> +30 days free</span>
              <span class="signup-plan-icon"><i class="fa-solid fa-calendar-check"></i></span><strong>Pro Monthly</strong>
              <div class="signup-price-lines">${priceLines("monthly")}</div>
              <small>Limited offer applied after administrator payment approval.</small>
              <span class="signup-plan-benefit"><i class="fa-solid fa-check"></i> Flexible monthly membership</span>
            </button>
            <button type="button" class="signup-plan-card signup-plan-card--yearly ${stateSignup.plan === "yearly" ? "selected" : ""}" data-signup-plan="yearly">
              <span class="signup-plan-badge signup-plan-badge--best"><i class="fa-solid fa-crown"></i> Best value · +60 days</span>
              <span class="signup-plan-icon"><i class="fa-solid fa-crown"></i></span><strong>Pro Yearly</strong>
              <div class="signup-price-lines">${priceLines("yearly")}</div>
              <small>Limited offer applied after administrator payment approval.</small>
              <span class="signup-plan-benefit"><i class="fa-solid fa-check"></i> Longer uninterrupted access</span>
            </button>
          </div>
        </section>

        <section class="signup-v2-step hide" data-signup-step="2">
          <div class="signup-type-grid">
            <button type="button" class="signup-type-card selected" data-signup-type="individual"><i class="fa-solid fa-user"></i><strong>Individual</strong><small>Personal private workspace</small></button>
            <button type="button" class="signup-type-card" data-signup-type="company"><i class="fa-solid fa-building"></i><strong>Company</strong><small>Company branding, TRN, team option</small></button>
          </div>
        </section>

        <section class="signup-v2-step hide" data-signup-step="3">
          <div class="signup-details-stack">
            <div class="signup-detail-section">
              <div class="signup-detail-head"><span><i class="fa-solid fa-id-card"></i></span><div><strong>Account identity</strong><small>Your private sign-in and contact details</small></div></div>
              <div class="signup-v2-form-grid">
                <div class="form-group"><label class="form-label" for="trialDisplayName">Full name</label><input id="trialDisplayName" class="input" autocomplete="name" placeholder="Your full name" /></div>
                <div class="form-group"><label class="form-label" for="trialUsername">Username</label><input id="trialUsername" class="input" autocomplete="username" placeholder="Choose a username" /></div>
                <div class="form-group"><label class="form-label" for="trialEmail">Email</label><input id="trialEmail" class="input" type="email" autocomplete="email" placeholder="Email address" /></div>
                <div class="form-group"><label class="form-label" for="trialMobile">Mobile number</label><input id="trialMobile" class="input" type="tel" autocomplete="tel" placeholder="Mobile number" /></div>
              </div>
            </div>

            <div class="signup-detail-section company-signup-field hide">
              <div class="signup-detail-head"><span><i class="fa-solid fa-building"></i></span><div><strong>Company profile</strong><small>Business identity shown on workspace documents</small></div></div>
              <div class="signup-v2-form-grid">
                <div class="form-group"><label class="form-label" for="trialCompany">Company name</label><input id="trialCompany" class="input" autocomplete="organization" placeholder="Company name" /></div>
                <div class="form-group"><label class="form-label" for="trialTrn">TRN</label><input id="trialTrn" class="input" placeholder="Tax registration number" /></div>
                <div class="form-group signup-span-2"><label class="form-label" for="trialAddress">Company address</label><input id="trialAddress" class="input" autocomplete="street-address" placeholder="Street, city, country" /></div>
              </div>
            </div>

            <div class="signup-detail-section">
              <div class="signup-detail-head"><span><i class="fa-solid fa-sliders"></i></span><div><strong>Workspace setup</strong><small>Currency, identity mark and company team</small></div></div>
              <div class="signup-v2-form-grid">
                <div class="form-group signup-span-2"><label class="form-label">Workspace currencies</label>${checkboxGridHtml("trialCurrencies", workspaceCurrencies, ["AED"])}<p class="help">Choose one or more. BTC also enables the Bitcoin section.</p></div>
                <div class="form-group"><label class="form-label" for="trialBillingCurrency">Primary / billing currency</label><select id="trialBillingCurrency" class="input"><option>AED</option><option>SAR</option><option>PKR</option><option>USD</option></select></div>
                <div class="form-group"><label class="form-label" for="trialLogoFile">Logo <span class="trial-optional">optional</span></label><input id="trialLogoFile" class="input" type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif" /><input id="trialLogoUrl" type="hidden" value="" /><div class="admin-logo-preview-wrap"><img id="trialLogoPreview" class="admin-logo-preview hide" src="" alt="Logo preview" /><span id="trialLogoStatus" class="help">PNG, JPG, WebP or GIF.</span></div></div>
                <div class="form-group company-signup-field signup-span-2 signup-team-field hide">
                  <label class="signup-team-toggle" for="trialTeamEnabled"><input id="trialTeamEnabled" type="checkbox" /><span><strong>Add paid team members</strong><small>Team members share this company workspace and inherit its approved plan.</small></span></label>
                  <div id="trialTeamSeatWrap" class="signup-team-seat-wrap hide"><div><label class="form-label" for="trialTeamSeats">Number of team members</label><input id="trialTeamSeats" class="input" type="number" min="1" max="50" value="1" /></div><p id="trialTeamPriceHint" class="help signup-team-price"></p></div>
                </div>
              </div>
            </div>

            <div class="signup-detail-section signup-security-section">
              <div class="signup-detail-head"><span><i class="fa-solid fa-shield-halved"></i></span><div><strong>Secure your account</strong><small>Use a strong password you do not reuse elsewhere</small></div></div>
              <div class="signup-v2-form-grid">
                <div class="form-group"><label class="form-label" for="trialPassword">Password</label><div class="admin-password-row signup-password-row"><input id="trialPassword" class="input" type="password" autocomplete="new-password" placeholder="8+ chars, upper, lower, number" /><button type="button" class="pw-eye-btn" data-toggle-form-pw="trialPassword" aria-label="Show password"><i class="fa-solid fa-eye"></i></button></div></div>
                <div class="form-group"><label class="form-label" for="trialPasswordConfirm">Confirm password</label><div class="admin-password-row signup-password-row"><input id="trialPasswordConfirm" class="input" type="password" autocomplete="new-password" placeholder="Repeat password" /><button type="button" class="pw-eye-btn" data-toggle-form-pw="trialPasswordConfirm" aria-label="Show password"><i class="fa-solid fa-eye"></i></button></div></div>
              </div>
            </div>
          </div>
        </section>

        <section class="signup-v2-step hide" data-signup-step="4">
          <div class="signup-payment-summary" id="trialPaymentSummary"></div>
          <div class="signup-bank-grid">
            <label class="signup-bank-card selected"><input type="radio" name="trialPaymentBank" value="hbl" checked /><img src="Assets/logo/wallet_logos/HBL.png" alt="HBL" /><span><strong>HBL</strong><small>Account Title: NADEEM</small><small>Account Number: 19227900107403</small><small>IBAN: PK87HABB0019227900107403</small><small>Branch: KHAWARI</small></span></label>
            <label class="signup-bank-card"><input type="radio" name="trialPaymentBank" value="enbd" /><img src="Assets/logo/wallet_logos/Emirates NBD.png" alt="Emirates NBD" /><span><strong>Emirates NBD</strong><small>Name: Nadeem Shahzad Fida</small><small>IBAN: AE060260001015884837801</small><small>Account No: 1015884837801</small></span></label>
          </div>
          <div class="form-group signup-receipt-field"><label class="form-label" for="trialReceiptFile">Attach transfer receipt</label><input id="trialReceiptFile" class="input" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" /><p class="help">PNG, JPG, WebP or PDF · maximum 5MB. The receipt is kept private for administrator review.</p></div>
          <div class="signup-pending-note"><i class="fa-solid fa-shield-halved"></i><span>Your account opens immediately with provisional <strong>Pro access</strong>. Payment remains <strong>Pending approval</strong> until the administrator verifies the transfer.</span></div>
        </section>

        <div id="trialSignupError" class="lock-error"></div>
        <div class="modal-footer trial-signup-footer signup-v2-footer">
          <button type="button" class="btn ghost hide" id="trialSignupBack">Back</button>
          <span class="signup-v2-footer-spacer"></span>
          <button type="button" class="btn ghost" data-trial-close="1">Cancel</button>
          <button type="button" class="btn primary" id="trialSignupNext">Continue</button>
          <button type="button" class="btn primary hide" id="trialSignupSave">Sign up</button>
        </div>
      </div>
    </div>`;

  const err = modal.querySelector("#trialSignupError");
  const nextBtn = modal.querySelector("#trialSignupNext");
  const backBtn = modal.querySelector("#trialSignupBack");
  const saveBtn = modal.querySelector("#trialSignupSave");
  const close = () => {
    modal.classList.add("hide"); modal.setAttribute("aria-hidden", "true");
    try { document.body.style.overflow = ""; } catch (_) {}
    try { document.removeEventListener("keydown", onTrialEsc, true); } catch (_) {}
  };
  const onTrialEsc = e => { if (e.key === "Escape" && !modal.classList.contains("hide")) { e.preventDefault(); close(); } };
  modal.querySelectorAll("[data-trial-close]").forEach(el => { el.onclick = close; });
  document.addEventListener("keydown", onTrialEsc, true);

  const updateCompanyFields = () => {
    const company = stateSignup.accountType === "company";
    modal.querySelectorAll(".company-signup-field").forEach(el => el.classList.toggle("hide", !company));
  };
  const currentTeamSeats = () => {
    if (stateSignup.accountType !== "company" || !modal.querySelector("#trialTeamEnabled")?.checked) return 0;
    return Math.max(1, Math.min(50, Number(modal.querySelector("#trialTeamSeats")?.value || 1)));
  };
  const updateTeamPrice = () => {
    const wrap = modal.querySelector("#trialTeamSeatWrap");
    const enabled = !!modal.querySelector("#trialTeamEnabled")?.checked;
    if (wrap) wrap.classList.toggle("hide", !enabled);
    const hint = modal.querySelector("#trialTeamPriceHint");
    if (!hint) return;
    if (stateSignup.plan === "free") { hint.textContent = "Team seats are included during the 14-day free period."; return; }
    const c = modal.querySelector("#trialBillingCurrency")?.value || "AED";
    const seats = currentTeamSeats();
    const unit = teamPrices[stateSignup.plan][c];
    hint.textContent = `${money(unit, c)} per team member ${stateSignup.plan === "monthly" ? "monthly" : "yearly"} · ${seats} seat${seats === 1 ? "" : "s"} = ${money(unit * seats, c)}`;
  };
  const updatePaymentSummary = () => {
    const el = modal.querySelector("#trialPaymentSummary"); if (!el || stateSignup.plan === "free") return;
    const c = modal.querySelector("#trialBillingCurrency")?.value || "AED";
    const seats = currentTeamSeats();
    const base = prices[stateSignup.plan][c];
    const unit = teamPrices[stateSignup.plan][c];
    const team = unit * seats;
    el.innerHTML = `<p class="section-kicker">Bank transfer</p><h4>${stateSignup.plan === "monthly" ? "Pro Monthly" : "Pro Yearly"}</h4><div class="signup-payment-kv"><span>Base plan</span><strong>${money(base,c)}</strong></div>${seats ? `<div class="signup-payment-kv"><span>${seats} team member${seats===1?"":"s"}</span><strong>${money(team,c)}</strong></div>` : ""}<div class="signup-payment-kv total"><span>Total to transfer</span><strong>${money(base+team,c)}</strong></div><p>${stateSignup.plan === "monthly" ? "Limited offer includes 30 additional days free after approval." : "Limited offer includes 60 additional days free after approval."}</p>`;
  };
  const showStep = step => {
    stateSignup.step = step;
    modal.querySelectorAll("[data-signup-step]").forEach(el => el.classList.toggle("hide", Number(el.dataset.signupStep) !== step));
    modal.querySelectorAll("[data-signup-progress]").forEach(el => el.classList.toggle("active", Number(el.dataset.signupProgress) <= step));
    const paymentProgress = modal.querySelector('[data-signup-progress="4"]');
    if (paymentProgress) paymentProgress.classList.toggle("hide", stateSignup.plan === "free");
    const progress = modal.querySelector(".signup-v2-progress");
    if (progress) progress.style.gridTemplateColumns = stateSignup.plan === "free" ? "repeat(3,minmax(0,1fr))" : "repeat(4,minmax(0,1fr))";
    backBtn.classList.toggle("hide", step === 1);
    const finalStep = stateSignup.plan === "free" ? 3 : 4;
    nextBtn.classList.toggle("hide", step >= finalStep);
    saveBtn.classList.toggle("hide", step !== finalStep);
    if (step === 3) { updateCompanyFields(); updateTeamPrice(); }
    if (step === 4) updatePaymentSummary();
  };

  modal.querySelectorAll("[data-signup-plan]").forEach(card => card.onclick = () => {
    stateSignup.plan = card.dataset.signupPlan;
    modal.querySelectorAll("[data-signup-plan]").forEach(x => x.classList.toggle("selected", x === card));
  });
  modal.querySelectorAll("[data-signup-type]").forEach(card => card.onclick = () => {
    stateSignup.accountType = card.dataset.signupType;
    modal.querySelectorAll("[data-signup-type]").forEach(x => x.classList.toggle("selected", x === card));
    updateCompanyFields();
  });
  modal.querySelectorAll('.signup-bank-card input[type="radio"]').forEach(radio => radio.onchange = () => {
    modal.querySelectorAll(".signup-bank-card").forEach(x => x.classList.toggle("selected", !!x.querySelector("input")?.checked));
  });
  modal.querySelector("#trialTeamEnabled").onchange = updateTeamPrice;
  modal.querySelector("#trialTeamSeats").oninput = updateTeamPrice;
  modal.querySelector("#trialBillingCurrency").onchange = () => { updateTeamPrice(); updatePaymentSummary(); };

  const validateDetails = () => {
    const username = modal.querySelector("#trialUsername").value.trim();
    const password = modal.querySelector("#trialPassword").value;
    const confirm = modal.querySelector("#trialPasswordConfirm").value;
    const displayName = modal.querySelector("#trialDisplayName").value.trim();
    const email = modal.querySelector("#trialEmail").value.trim();
    const mobile = modal.querySelector("#trialMobile").value.trim();
    const company = modal.querySelector("#trialCompany").value.trim();
    const address = modal.querySelector("#trialAddress").value.trim();
    if (!displayName) throw new Error("Please enter your name.");
    if (!username) throw new Error("Please choose a username.");
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Please enter a valid email address.");
    if (!mobile || mobile.length < 6) throw new Error("Please enter a valid mobile number.");
    if (stateSignup.accountType === "company" && !company) throw new Error("Please enter the company name.");
    if (stateSignup.accountType === "company" && !address) throw new Error("Please enter the company address.");
    if (!readCheckboxGrid(modal, "trialCurrencies").length) throw new Error("Select at least one workspace currency.");
    assertPasswordPolicy(password);
    if (password !== confirm) throw new Error("Passwords do not match.");
  };

  nextBtn.onclick = () => {
    err.textContent = ""; err.classList.remove("show");
    try {
      if (stateSignup.step === 1) return showStep(2);
      if (stateSignup.step === 2) return showStep(3);
      if (stateSignup.step === 3) { validateDetails(); return showStep(stateSignup.plan === "free" ? 3 : 4); }
    } catch (ex) { err.textContent = ex.message || "Please check your details."; err.classList.add("show"); }
  };
  backBtn.onclick = () => showStep(stateSignup.step === 4 ? 3 : Math.max(1, stateSignup.step - 1));

  const fileToBase64 = file => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || "").split(",")[1] || "");
    r.onerror = () => reject(new Error("Could not read the payment receipt."));
    r.readAsDataURL(file);
  });

  saveBtn.onclick = async () => {
    err.textContent = ""; err.classList.remove("show");
    try {
      validateDetails();
      const paid = stateSignup.plan !== "free";
      const receiptFile = modal.querySelector("#trialReceiptFile")?.files?.[0] || null;
      if (paid) {
        if (!receiptFile) throw new Error("Please attach your bank transfer receipt.");
        if (receiptFile.size > 5 * 1024 * 1024) throw new Error("Payment receipt must be 5MB or smaller.");
        if (!["image/png","image/jpeg","image/webp","application/pdf"].includes(receiptFile.type)) throw new Error("Receipt must be PNG, JPG, WebP, or PDF.");
      }
      saveBtn.disabled = true; saveBtn.innerHTML = `<i class="fa-solid fa-spinner btn-loader"></i> Creating…`;
      const billingCurrency = modal.querySelector("#trialBillingCurrency").value;
      let currencies = readCheckboxGrid(modal, "trialCurrencies");
      if (!currencies.includes(billingCurrency)) currencies.unshift(billingCurrency);
      const teamEnabled = stateSignup.accountType === "company" && !!modal.querySelector("#trialTeamEnabled").checked;
      const result = await supabaseRpc("app_signup_v2", {
        p_plan: stateSignup.plan,
        p_account_type: stateSignup.accountType,
        p_username: modal.querySelector("#trialUsername").value.trim(),
        p_password: modal.querySelector("#trialPassword").value,
        p_display_name: modal.querySelector("#trialDisplayName").value.trim(),
        p_company_name: stateSignup.accountType === "company" ? (modal.querySelector("#trialCompany").value.trim() || null) : null,
        p_company_email: modal.querySelector("#trialEmail").value.trim(),
        p_company_phone: modal.querySelector("#trialMobile").value.trim(),
        p_company_address: stateSignup.accountType === "company" ? (modal.querySelector("#trialAddress").value.trim() || null) : null,
        p_vat_number: stateSignup.accountType === "company" ? (modal.querySelector("#trialTrn").value.trim() || null) : null,
        p_logo_url: modal.querySelector("#trialLogoUrl")?.value.trim() || null,
        p_currencies: currencies,
        p_billing_currency: billingCurrency,
        p_team_enabled: teamEnabled,
        p_team_seats: teamEnabled ? currentTeamSeats() : 0,
        p_payment_bank: paid ? (modal.querySelector('input[name="trialPaymentBank"]:checked')?.value || "hbl") : null,
        p_receipt_name: paid ? receiptFile.name : null,
        p_receipt_mime: paid ? receiptFile.type : null,
        p_receipt_base64: paid ? await fileToBase64(receiptFile) : null,
        p_user_agent: navigator.userAgent || "",
        p_ip: null
      });
      const sessionToken = result?.session_token || "";
      const user = result?.user || null;
      if (!sessionToken || !user?.id) throw new Error("Sign-up could not be completed. Please try again.");
      state.sessionToken = sessionToken;
      close();
      if (els.zipUsernameInput) els.zipUsernameInput.value = user.username || "";
      const ok = await completeAuthenticatedUnlock(user, sessionToken, { remember: readRememberMePreference() });
      if (!ok && els.lockError) { els.lockError.textContent = "Account created. Please sign in with your new credentials."; els.lockError.classList.add("show"); }
    } catch (ex) {
      err.textContent = ex.message || "Could not create your account."; err.classList.add("show");
      saveBtn.disabled = false; saveBtn.textContent = "Sign up";
    }
  };

  modal.classList.remove("hide"); modal.setAttribute("aria-hidden", "false");
  try { document.body.style.overflow = "hidden"; } catch (_) {}
  try { bindAdminLogoPicker("trial", null); } catch (_) {}
  try { bindAdminFormPasswordToggle(modal); } catch (_) {}
  showStep(1);
}

function startGuestMode(){
  // Guest / demo mode is retired — route users to trial signup instead.
  openTrialSignupModal();
}

function doLogout(){
  const wasGuestMode = isGuestMode();
  if (!wasGuestMode && state.sessionToken) {
    if (typeof lockAdminSecuritySession === "function") {
      lockAdminSecuritySession({ silent: true }).catch(() => {});
    }
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
  if (typeof applyTriplemPublicTheme === "function") applyTriplemPublicTheme();
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
  try {
    window.__triplemAuthResumeClaimed = false;
    window.__triplemEarlyAuthResumeActive = false;
    if (window.__triplemEarlyAuthResumeFailsafe) {
      clearTimeout(window.__triplemEarlyAuthResumeFailsafe);
      window.__triplemEarlyAuthResumeFailsafe = null;
    }
    if (window.__triplemAuthResumeFailsafe) {
      clearTimeout(window.__triplemAuthResumeFailsafe);
      window.__triplemAuthResumeFailsafe = null;
    }
  } catch (_) {}
  const splash = document.getElementById("authResumeSplash");
  if (splash) {
    splash.setAttribute("aria-busy", "false");
  }
}

function authResumeTimeoutError(label){
  const error = new Error(`${label || "Saved sign-in"} timed out. Please try again.`);
  error.name = "TriplemAuthResumeTimeout";
  error.code = "AUTH_RESUME_TIMEOUT";
  error.status = 0;
  error.isConnectivityError = true;
  return error;
}

function withAuthResumeTimeout(promise, timeoutMs, label){
  const ms = Math.max(1500, Number(timeoutMs) || 10000);
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(authResumeTimeoutError(label));
    }, ms);
    Promise.resolve(promise).then(value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    }, error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
  });
}

function armAuthResumeFailsafe(){
  try {
    if (window.__triplemAuthResumeFailsafe) clearTimeout(window.__triplemAuthResumeFailsafe);
    window.__triplemAuthResumeFailsafe = setTimeout(() => {
      window.__triplemAuthResumeFailsafe = null;
      try { document.documentElement.classList.remove("auth-resuming"); } catch (_) {}
      const splash = document.getElementById("authResumeSplash");
      if (splash) splash.setAttribute("aria-busy", "false");
      const pinModal = document.getElementById("secretPinGateModal");
      const pinVisible = !!pinModal && !pinModal.classList.contains("hide");
      const appVisible = !!els.app && !els.app.classList.contains("hide");
      if (!pinVisible && !appVisible && els.lockScreen) {
        els.lockScreen.classList.remove("hide");
        els.lockScreen.style.display = "";
        if (els.lockError && !String(els.lockError.textContent || "").trim()) {
          els.lockError.textContent = "Saved sign-in took too long to resume. Please sign in again; your locally saved entries are unchanged.";
          els.lockError.classList.add("show");
        }
      }
    }, 30000);
  } catch (_) {}
}

function showAuthResumingUi(){
  try {
    window.__triplemAuthResumeClaimed = true;
    window.__triplemEarlyAuthResumeActive = false;
    if (window.__triplemEarlyAuthResumeFailsafe) {
      clearTimeout(window.__triplemEarlyAuthResumeFailsafe);
      window.__triplemEarlyAuthResumeFailsafe = null;
    }
  } catch (_) {}
  armAuthResumeFailsafe();
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
  let credential = null;
  try {
    credential = await withAuthResumeTimeout(loadEncryptedSessionCredential(), 6000, "Secure sign-in storage");
  } catch (err) {
    console.warn("Saved sign-in credential could not be resumed.", err);
    clearAuthResumingUi();
    if (els.lockScreen) {
      els.lockScreen.classList.remove("hide");
      els.lockScreen.style.display = "";
    }
    if (els.lockError) {
      els.lockError.textContent = "Saved sign-in could not resume automatically. Please sign in again; your locally saved entries are unchanged.";
      els.lockError.classList.add("show");
    }
    return false;
  }
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
    // Resolve Smart PIN before waiting on nonessential workspace preferences.
    // On a remembered-session refresh the PIN gate is the next security step;
    // currency/tax settings must never hold it behind the loading splash.
    let pinReadyFromProfile = false;
    if (silentResume && user && (
      Object.prototype.hasOwnProperty.call(user, "smart_pin_hash")
      || Object.prototype.hasOwnProperty.call(user, "smart_pin_enabled")
    )) {
      const profilePin = String(user.smart_pin_hash || "").trim().toLowerCase();
      const enabled = !!user.smart_pin_enabled || /^[a-f0-9]{64}$/.test(profilePin);
      state.secretPinPreferenceId = null;
      // Sentinel only — server verification remains authoritative.
      state.secretPinHash = enabled ? (/^[a-f0-9]{64}$/.test(profilePin) ? profilePin : "enabled") : "";
      state.secretPinVerified = !state.secretPinHash;
      pinReadyFromProfile = true;
      try { renderSecretPinMenu(); } catch (_) {}
    }

    // Start preference loading in parallel, but do not await it before Smart PIN.
    const prefsPromise = Promise.all([
      loadPageCurrencyPreferenceFromDatabase(),
      loadTaxSettingsPreferenceFromDatabase()
    ]);
    // The user may spend time at Smart PIN while these finish in parallel.
    // Attach a handler immediately so an early network rejection never becomes
    // an unhandled promise before the bounded await below.
    prefsPromise.catch(() => {});

    if (!pinReadyFromProfile) {
      if (silentResume) {
        await withAuthResumeTimeout(loadSecretPinPreferenceFromDatabase(), 6000, "Smart Pin preference");
      } else {
        await loadSecretPinPreferenceFromDatabase();
      }
    }

    if (state.secretPinHash && !state.secretPinVerified) {
      // Keep the secure resume mask active behind Smart PIN. The gate already
      // renders above the splash, so the public landing can never flash between
      // remembered-session validation and PIN presentation.
      const pinOk = await requestSecretPinUnlock();
      if (!pinOk) {
        state.__silentResumeTabLoad = null;
        return false;
      }
      if (silentResume) showAuthResumingUi();
    } else if (!state.secretPinHash) {
      state.secretPinVerified = true;
    }

    // Once Smart PIN is satisfied, finish preference loading with a bounded wait.
    if (silentResume) {
      try {
        await withAuthResumeTimeout(prefsPromise, 8000, "Workspace preferences");
      } catch (prefErr) {
        console.warn("Saved session resumed before all workspace preferences finished loading.", prefErr);
      }
    } else {
      try {
        await withAuthResumeTimeout(prefsPromise, 10000, "Workspace preferences");
      } catch (prefErr) {
        console.warn("Workspace opened before all preferences finished loading.", prefErr);
      }
    }
    updateCurrencyFiltersFromConfig();

    const allowedCurrencies = getAllowedCurrencies();
    if (allowedCurrencies.length > 0 && !allowedCurrencies.includes(state.lastCurrency)) {
      state.lastCurrency = allowedCurrencies[0];
    }

    // Start the initial tab load only after PIN verification. It remains
    // background work and cannot block the gate or the shell reveal.
    let warmTabLoad = null;
    if (silentResume && state.secretPinVerified) {
      const warmTab = typeof resolveStartupTab === "function" ? resolveStartupTab() : "dashboard";
      warmTabLoad = warmTab === "dashboard" && typeof warmDashboardData === "function"
        ? warmDashboardData()
        : ensureTabDataLoaded(warmTab || "dashboard", { force: true });
      warmTabLoad.catch(err => console.warn("Startup tab warm load failed:", err));
    }

    if (warmTabLoad) state.__silentResumeTabLoad = warmTabLoad;
  } else {
    state.secretPinHash = "";
    state.secretPinVerified = true;
    applyPageCurrencySelection(PAGE_CURRENCY_DEFAULT);
  }

  if (user?.must_change_password && !state.trialLocked) {
    // The forced-password modal, like Smart PIN, is layered above the secure
    // resume mask. Do not expose the landing page during this security step.
    const changed = await requestForcedPasswordChange();
    if (!changed) {
      state.__silentResumeTabLoad = null;
      return false;
    }
    if (silentResume) showAuthResumingUi();
  }

  // Admin Security Key must re-lock on every page load / login (never stay unlocked after refresh).
  if (typeof prepareAdminSecurityForPageLoad === "function") {
    try {
      await prepareAdminSecurityForPageLoad();
    } catch (_) {
      if (typeof lockAdminSecuritySession === "function") {
        await lockAdminSecuritySession({ silent: true }).catch(() => {});
      }
    }
  } else if (typeof lockAdminSecuritySession === "function") {
    await lockAdminSecuritySession({ silent: true }).catch(() => {});
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
  if (typeof applySavedTriplemWorkspaceTheme === "function") applySavedTriplemWorkspaceTheme();
  if (typeof startOfflineSyncForSession === "function") {
    startOfflineSyncForSession();
  }
  updateGuestModeUi();
  applyPermissionGates();
  // Re-bind Web Push after the custom Triplem VIP session is fully unlocked.
  // Permission is never requested here; an existing granted subscription is only re-associated securely.
  try {
    window.TriplemPush?.refreshUi?.();
    window.TriplemPush?.syncExistingSubscription?.().catch(() => {});
    window.TriplemPush?.promptAfterLogin?.();
  } catch (_) {}

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
      modal.className = "modal hide force-password-modal";
      modal.setAttribute("aria-hidden", "true");
      modal.innerHTML = `
        <div class="modal-backdrop force-password-backdrop"></div>
        <div class="modal-dialog force-password-dialog" role="dialog" aria-modal="true" aria-labelledby="forcePasswordTitle" aria-describedby="forcePasswordDescription">
          <div class="modal-head force-password-head">
            <div class="force-password-head-copy">
              <span class="force-password-icon" aria-hidden="true"><i class="fa-solid fa-key"></i></span>
              <div>
                <p class="force-password-kicker">Secure credential update</p>
                <h3 id="forcePasswordTitle">Password change required</h3>
                <p id="forcePasswordDescription">Your current sign-in credential is temporary or has been marked for replacement. Create a private permanent password before entering the workspace.</p>
              </div>
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
            <div class="force-password-security-note"><i class="fa-solid fa-lock"></i><span>Your new password is verified and stored through the protected server-side password flow. Triplem VIP does not display the previous permanent password.</span></div>
            <div id="forcePwError" class="lock-error"></div>
            <div class="modal-footer force-password-footer">
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
    const previousFocus = document.activeElement;
    modal.classList.remove("hide");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("force-password-change-active");
    requestAnimationFrame(() => oldEl?.focus());

    const cleanup = (ok) => {
      modal.classList.add("hide");
      modal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("force-password-change-active");
      modal.querySelector("#forcePwSave").onclick = null;
      modal.querySelector("#forcePwCancel").onclick = null;
      try { if (previousFocus && previousFocus.isConnected) previousFocus.focus({ preventScroll: true }); } catch (_) {}
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
      const validated = await withAuthResumeTimeout(
        supabaseRpc("app_validate_session", {}),
        12000,
        "Saved session validation"
      );
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
      if (result?.ok === false) {
        throw new Error(result?.error || result?.message || "Invalid username or password");
      }
      if (result?.two_factor_required === true) {
        if (typeof window.requestTwoFactorLogin !== "function") {
          throw new Error("Two-factor verification is required, but the security module did not load. Refresh and try again.");
        }
        const verified = await window.requestTwoFactorLogin({
          challengeToken: result.challenge_token || "",
          username: result.username || safeUser,
          displayName: result.display_name || result.username || safeUser
        });
        if (!verified) throw new Error("Two-factor verification is required to sign in.");
        result = verified;
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
      const connectivityFailure = typeof isConnectivityFailure === "function" && isConnectivityFailure(err);
      // A lost connection must not destroy the encrypted Remember Me session.
      // Keep it intact so pending owner-scoped local entries can be recovered as
      // soon as connectivity returns; invalid/expired sessions are still cleared.
      if (!connectivityFailure) removeStoredSessionCredentials();
      if (connectivityFailure) {
        if (els.lockError) {
          els.lockError.textContent = "The saved session could not be verified right now. Your locally saved entries remain on this device. Reconnect or sign in again.";
          els.lockError.classList.add("show");
        }
      } else if (!silentResume && els.lockError) {
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
        try {
          await withAuthResumeTimeout(loadPromise, 12000, "Workspace startup");
        } catch (startupErr) {
          console.warn("Workspace shell opened before startup data finished loading.", startupErr);
          try { if (typeof resetAppDataLoadingOverlay === "function") resetAppDataLoadingOverlay(); } catch (_) {}
          try { renderAll(); } catch (_) {}
        }
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
      return `<option value="${escapeHtml(a.group_id)}" data-currency="${escapeHtml(a.currency || "")}">${escapeHtml(a.person_name)} (${escapeHtml(a.accountType)}) — ${escapeHtml(balDisplay)}</option>`;
    }).join("");
  syncCurrencySelectFonts(selectEl);
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
    syncCurrencySelectFonts(selectEl);
    return;
  }
  selectEl.disabled = false;
  selectEl.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` +
    accounts.map(a => {
      const balDisplay = formatReportAmount(a.balance, a.currency);
      return `<option value="${escapeHtml(a.group_id)}" data-currency="${escapeHtml(a.currency || "")}">${escapeHtml(a.person_name)} (${escapeHtml(a.accountType)}) - ${escapeHtml(balDisplay)}</option>`;
    }).join("");
  if (currentValue && accounts.some(a => a.group_id === currentValue)){
    selectEl.value = currentValue;
  }
  if (!accounts.length){
    selectEl.innerHTML = `<option value="">No wallet in ${escapeHtml(cur)}</option>`;
    selectEl.disabled = true;
  }
  syncCurrencySelectFonts(selectEl);
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
