/* Modularized from script.js lines 28570-29321 — trial/welcome + loan wallet helpers. Load order must be preserved. */
/* Sign-up (2026-11-17): one side panel, the same size as every other panel. Short steps, no
 * marketing text: Plan → Account → Company (company accounts) → Workspace → Payment (Pro).
 * Pro is paid by card through Paddle by default (bank transfer stays available); the Terms open
 * inside the panel. The account is created with app_signup_v4 exactly as before. */
async function openTrialSignupModal(preferredPlan = "free"){
  try { if (typeof closeSignInOverlay === "function") closeSignInOverlay(); } catch (_) {}
  try { if (window.TRIPLEM_REGIONAL_CURRENCY_READY) await window.TRIPLEM_REGIONAL_CURRENCY_READY; } catch (_) {}
  // Whether the Main Admin has switched card payments on (migration 235).
  try { await window.TriplemCardPayments?.refreshStatus?.(true); } catch (_) {}
  let modal = document.getElementById("trialSignupModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "trialSignupModal";
    modal.className = "modal hide";
    document.body.appendChild(modal);
  }

  // Microsoft Store version: no Bitcoin (Store policy 10.2.6), so BTC is not offered at sign-up there.
  const storeNoCrypto = typeof cryptoFeaturesHidden === "function" && cryptoFeaturesHidden();
  const storeEdition = !!window.TriplemStore?.active;
  const workspaceCurrencies = (window.TriplemCurrencyRegistry?.codes?.() || SUPPORTED_CURRENCIES || []).slice()
    .filter(code => !(storeNoCrypto && String(code).toUpperCase() === "BTC"));
  const regionalCurrency = typeof getRegionalCurrency === "function" ? getRegionalCurrency() : "USD";
  const prices = TRIPLEM_PUBLIC_PLAN_PRICES;
  const teamPrices = TRIPLEM_PUBLIC_TEAM_PRICES;
  const card = window.TriplemCardPayments || null;
  const cardUsd = card?.config?.usd || { monthly: 13.99, yearly: 149 };
  const normalizedPreferredPlan = ["free","monthly","yearly"].includes(String(preferredPlan || "").toLowerCase()) ? String(preferredPlan).toLowerCase() : "free";
  const S = { step: "plan", plan: normalizedPreferredPlan, accountType: "individual", pay: "card", terms: null };
  const money = (v, c = regionalCurrency) => regionalMoneyHtml(v, c);
  const usd = n => `US$${Number(n).toLocaleString("en-US", { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
  const periodName = p => (p === "yearly" ? "Pro Yearly" : "Pro Monthly");
  // 2026-11-11: the modules the new workspace starts with (app_signup_v4, migration 223).
  // Selected by default; the user can change them. The Microsoft Store edition has no Bitcoin module.
  const SIGNUP_MODULES = [
    { key: "expenses", icon: "fa-wallet", title: "Expenses & Wallets", on: true },
    { key: "inventory_v2", icon: "fa-boxes-stacked", title: "Inventory 2.0", on: true },
    { key: "assets", icon: "fa-building-columns", title: "Assets", on: true },
    { key: "loans", icon: "fa-hand-holding-dollar", title: "Loans", on: true },
    { key: "installments", icon: "fa-calendar-days", title: "Installments", on: true },
    { key: "notes", icon: "fa-note-sticky", title: "Notes & Reminders", on: true },
    ...(storeNoCrypto ? [] : [{ key: "bitcoin", icon: "fa-brands fa-bitcoin", title: "Bitcoin", on: true }]),
    { key: "accounting", icon: "fa-book", title: "Accounting", on: false }
  ];
  const INDUSTRIES = ["Retail & e-commerce", "Wholesale & distribution", "Restaurants & food", "Construction & real estate", "Professional services", "Manufacturing", "Transport & logistics", "Healthcare", "Education", "Technology", "Other"];
  const SIZES = ["1–5", "6–20", "21–50", "51–200", "200+"];
  const COUNTRIES = [["AE", "United Arab Emirates"], ["SA", "Saudi Arabia"], ["PK", "Pakistan"], ["QA", "Qatar"], ["OM", "Oman"], ["KW", "Kuwait"], ["BH", "Bahrain"], ["IN", "India"], ["GB", "United Kingdom"], ["US", "United States"], ["ZZ", "Other"]];
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const regionCode = String((typeof getRegionalCountryCode === "function" ? getRegionalCountryCode() : "") || "").toUpperCase();
  const defaultCountry = COUNTRIES.some(c => c[0] === regionCode) ? regionCode : "ZZ";
  const defaultVat = (() => { try { const r = Number(window.TriplemCurrencyRegistry?.taxDefault?.(regionalCurrency)?.rate); return Number.isFinite(r) ? r : 0; } catch (_) { return 0; } })();
  const termsVersion = window.TriplemTerms?.VERSION || "2026-11-11";
  const opt = (v, label, sel) => `<option value="${escapeHtml(v)}"${sel ? " selected" : ""}>${escapeHtml(label)}</option>`;
  const field = (id, label, input, cls = "") => `<label class="su-field${cls ? ` ${cls}` : ""}" for="${id}"><span>${label}</span>${input}</label>`;
  const optional = `<em class="su-opt">optional</em>`;

  modal.innerHTML = `
    <div class="modal-backdrop" data-trial-close="1"></div>
    <div class="modal-dialog settings-sheet su-dialog" role="dialog" aria-modal="true" aria-labelledby="trialSignupTitle">
      <div class="settings-sheet-head su-head">
        <div><h3 id="trialSignupTitle">Create your account</h3><p id="trialSignupStepLabel"></p></div>
        <div class="signup-lang-row" data-lang-picker="compact"></div>
        <button type="button" class="btn ghost tiny" data-trial-close="1" aria-label="Close">✕</button>
      </div>
      <div class="su-steps" aria-hidden="true"></div>
      <div class="modal-body settings-sheet-body su-body">
        <section class="su-step" data-su-step="plan">
          <div class="su-label">Account type</div>
          <div class="su-seg" role="radiogroup" aria-label="Account type">
            <button type="button" class="su-seg-btn selected" data-signup-type="individual" role="radio" aria-checked="true"><i class="fa-solid fa-user" aria-hidden="true"></i> Individual</button>
            <button type="button" class="su-seg-btn" data-signup-type="company" role="radio" aria-checked="false"><i class="fa-solid fa-building" aria-hidden="true"></i> Company</button>
          </div>
          <div class="su-label">Plan</div>
          <div class="su-plans" role="radiogroup" aria-label="Plan">
            <button type="button" class="su-plan" data-signup-plan="free" role="radio"><span class="su-radio" aria-hidden="true"></span><span class="su-plan-main"><strong class="signup-plan-title">Free 14 Days</strong><small>No payment</small></span><span class="su-plan-price">Free</span></button>
            <button type="button" class="su-plan" data-signup-plan="monthly" role="radio"><span class="su-radio" aria-hidden="true"></span><span class="su-plan-main"><strong class="signup-plan-title">Pro Monthly</strong><small>+1 month free</small></span><span class="su-plan-price">${money(prices.monthly[regionalCurrency])}<small>/ month</small></span></button>
            <button type="button" class="su-plan" data-signup-plan="yearly" role="radio"><span class="su-radio" aria-hidden="true"></span><span class="su-plan-main"><strong class="signup-plan-title">Pro Yearly</strong><small>+2 months free</small></span><span class="su-plan-price">${money(prices.yearly[regionalCurrency])}<small>/ year</small></span></button>
          </div>
        </section>

        <section class="su-step hide" data-su-step="account">
          <div class="su-grid">
            ${field("trialDisplayName", "Full name", `<input id="trialDisplayName" class="input" autocomplete="name" />`)}
            ${field("trialUsername", "Username", `<input id="trialUsername" class="input" autocomplete="username" autocapitalize="off" spellcheck="false" />`)}
            ${field("trialEmail", "Email", `<input id="trialEmail" class="input" type="email" autocomplete="email" />`)}
            ${field("trialMobile", "Mobile number", `<input id="trialMobile" class="input" type="tel" autocomplete="tel" />`)}
            ${field("trialPassword", "Password", `<div class="admin-password-row signup-password-row"><input id="trialPassword" class="input" type="password" autocomplete="new-password" placeholder="8+ characters, A–z, 0–9" /><button type="button" class="pw-eye-btn" data-toggle-form-pw="trialPassword" aria-label="Show password"><i class="fa-solid fa-eye"></i></button></div>`)}
            ${field("trialPasswordConfirm", "Confirm password", `<div class="admin-password-row signup-password-row"><input id="trialPasswordConfirm" class="input" type="password" autocomplete="new-password" /><button type="button" class="pw-eye-btn" data-toggle-form-pw="trialPasswordConfirm" aria-label="Show password"><i class="fa-solid fa-eye"></i></button></div>`)}
          </div>
          <label class="su-check" for="trialRecoverySetup"><input id="trialRecoverySetup" type="checkbox" checked /><span>Set up password recovery after sign-up</span></label>
        </section>

        <section class="su-step hide" data-su-step="company">
          <div class="su-grid">
            ${field("trialCompany", "Company name", `<input id="trialCompany" class="input" autocomplete="organization" />`, "su-span-2")}
            ${field("trialLicense", `Trade licence no. ${optional}`, `<input id="trialLicense" class="input" />`)}
            ${field("trialTrn", `TRN / VAT no. ${optional}`, `<input id="trialTrn" class="input" />`)}
            ${field("trialIndustry", "Industry", `<select id="trialIndustry" class="input">${opt("", "Select…", true)}${INDUSTRIES.map(i => opt(i, i)).join("")}</select>`)}
            ${field("trialCompanySize", "Company size", `<select id="trialCompanySize" class="input">${opt("", "Select…", true)}${SIZES.map(z => opt(z, `${z} people`)).join("")}</select>`)}
            ${field("trialCountry", "Country", `<select id="trialCountry" class="input">${COUNTRIES.map(([c, n]) => opt(c, n, c === defaultCountry)).join("")}</select>`)}
            ${field("trialCity", "City", `<input id="trialCity" class="input" autocomplete="address-level2" />`)}
            ${field("trialAddress", "Address", `<input id="trialAddress" class="input" autocomplete="street-address" />`, "su-span-2")}
            ${field("trialCompanyEmail", `Company email ${optional}`, `<input id="trialCompanyEmail" class="input" type="email" autocomplete="off" />`)}
            ${field("trialCompanyPhone", `Company phone ${optional}`, `<input id="trialCompanyPhone" class="input" type="tel" autocomplete="off" />`)}
            ${field("trialWebsite", `Website ${optional}`, `<input id="trialWebsite" class="input" type="url" inputmode="url" placeholder="https://" />`)}
            ${field("trialFiscalStart", "Financial year starts", `<select id="trialFiscalStart" class="input">${MONTHS.map((m, i) => opt(String(i + 1), m, i === 0)).join("")}</select>`)}
            ${field("trialVatRate", `VAT rate (%)`, `<input id="trialVatRate" class="input" type="number" min="0" max="100" step="0.01" value="${escapeHtml(String(defaultVat))}" />`)}
          </div>
          <div class="su-team">
            <label class="su-check" for="trialTeamEnabled"><input id="trialTeamEnabled" type="checkbox" /><span>Add team members</span></label>
            <div id="trialTeamSeatWrap" class="su-team-seats hide">
              <input id="trialTeamSeats" class="input" type="number" min="1" max="50" value="1" aria-label="Number of team members" />
              <span id="trialTeamPriceHint" class="su-muted"></span>
            </div>
          </div>
        </section>

        <section class="su-step hide" data-su-step="workspace">
          <div class="su-label">Modules</div>
          <div class="su-chips" role="group" aria-label="Modules">${SIGNUP_MODULES.map(m => `<label class="su-chip"><input type="checkbox" name="trialModules" value="${m.key}"${m.on ? " checked" : ""} /><i class="${m.icon.startsWith("fa-brands") ? m.icon : `fa-solid ${m.icon}`}" aria-hidden="true"></i><span>${escapeHtml(m.title)}</span></label>`).join("")}</div>
          <div class="su-label">Currencies</div>
          ${checkboxGridHtml("trialCurrencies", workspaceCurrencies, [regionalCurrency])}
          <select id="trialBillingCurrency" class="hide" aria-hidden="true" tabindex="-1"><option value="${escapeHtml(regionalCurrency)}">${escapeHtml(regionalCurrency)}</option></select>
          <div class="su-label">Logo ${optional}</div>
          <div class="su-logo">
            <img id="trialLogoPreview" class="admin-logo-preview hide" src="" alt="Logo preview" />
            <input id="trialLogoFile" class="input" type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif" aria-label="Logo" />
            <input id="trialLogoUrl" type="hidden" value="" />
            <span id="trialLogoStatus" class="su-muted"></span>
          </div>
        </section>

        <section class="su-step hide" data-su-step="payment">
          <div class="su-seg su-pay-seg" role="radiogroup" aria-label="Payment method">
            <button type="button" class="su-seg-btn" data-su-pay="card" role="radio"><i class="fa-regular fa-credit-card" aria-hidden="true"></i> Card</button>
            <button type="button" class="su-seg-btn" data-su-pay="bank" role="radio"><i class="fa-solid fa-building-columns" aria-hidden="true"></i> Bank transfer</button>
          </div>
          <p class="su-muted su-pay-note hide" id="trialPayNote"></p>
          <div class="su-summary" id="trialPaymentSummary"></div>
          <div class="su-bank hide" data-su-bank>
            <div class="su-banks">
              <label class="su-bank-opt selected"><input type="radio" name="trialPaymentBank" value="hbl" checked /><img src="Assets/logo/wallet_logos/HBL.png" alt="" /><span><strong>HBL</strong><small>NADEEM · 19227900107403</small><small>IBAN PK87HABB0019227900107403 · Khawari</small></span></label>
              <label class="su-bank-opt"><input type="radio" name="trialPaymentBank" value="enbd" /><img src="Assets/logo/wallet_logos/Emirates NBD.png" alt="" /><span><strong>Emirates NBD</strong><small>Nadeem Shahzad Fida · 1015884837801</small><small>IBAN AE060260001015884837801</small></span></label>
            </div>
            ${field("trialReceiptFile", "Transfer receipt", `<input id="trialReceiptFile" class="input" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" />`)}
          </div>
          <label class="su-check su-confirm" for="trialPurchaseConfirm"><input id="trialPurchaseConfirm" type="checkbox" /><span id="trialPurchaseConfirmText"></span></label>
        </section>

        <section class="su-terms hide" data-su-terms-view>
          <div class="su-seg" role="tablist" aria-label="Documents">
            <button type="button" class="su-seg-btn" data-su-terms-tab="terms" role="tab">Terms and Conditions</button>
            <button type="button" class="su-seg-btn" data-su-terms-tab="trial" role="tab">Free Trial Terms</button>
          </div>
          <div class="su-terms-body trial-terms-body"></div>
        </section>

        <label class="su-check su-accept hide" id="trialTermsBlock" for="trialTermsAccept"><input id="trialTermsAccept" type="checkbox" /><span>I accept the <button type="button" class="su-link" data-su-terms="terms">Terms and Conditions</button> and the <button type="button" class="su-link" data-su-terms="trial">Free Trial Terms</button>, and I am 18 or older.</span></label>
        <div id="trialSignupError" class="lock-error"></div>
      </div>
      <div class="settings-sheet-footer su-foot">
        <button type="button" class="btn ghost" id="trialSignupBack">Back</button>
        <span class="su-foot-spacer"></span>
        <button type="button" class="btn primary" id="trialSignupNext">Continue</button>
        <button type="button" class="btn primary hide" id="trialSignupSave">Create account</button>
      </div>
    </div>`;

  const $ = sel => modal.querySelector(sel);
  const err = $("#trialSignupError");
  const nextBtn = $("#trialSignupNext");
  const backBtn = $("#trialSignupBack");
  const saveBtn = $("#trialSignupSave");
  const showError = m => { err.textContent = m; err.classList.add("show"); err.scrollIntoView?.({ block: "nearest" }); };
  const clearError = () => { err.textContent = ""; err.classList.remove("show"); };
  const close = () => {
    try { const p = $("#trialPassword"), c = $("#trialPasswordConfirm"); if (p) p.value = ""; if (c) c.value = ""; } catch (_) {}
    modal.classList.add("hide"); modal.setAttribute("aria-hidden", "true");
    try { document.body.style.overflow = ""; } catch (_) {}
    try { document.removeEventListener("keydown", onTrialEsc, true); } catch (_) {}
  };
  const onTrialEsc = e => {
    if (e.key !== "Escape" || modal.classList.contains("hide")) return;
    e.preventDefault();
    if (S.terms) return showTerms(null);
    close();
  };
  modal.querySelectorAll("[data-trial-close]").forEach(el => { el.onclick = close; });
  document.addEventListener("keydown", onTrialEsc, true);
  modal.addEventListener("input", () => { if (err.classList.contains("show")) clearError(); });

  // ── what the user chose ──
  const company = () => S.accountType === "company";
  const paid = () => S.plan !== "free";
  const currentTeamSeats = () => {
    if (!company() || !$("#trialTeamEnabled")?.checked) return 0;
    return Math.max(1, Math.min(50, Number($("#trialTeamSeats")?.value || 1)));
  };
  const cardSwitchedOn = () => !!card && !storeEdition && card.enabled?.() === true;
  const cardAvailable = () => cardSwitchedOn() && !currentTeamSeats();
  const payMethod = () => (cardAvailable() && S.pay === "card" ? "card" : "bank");
  const steps = () => ["plan", "account", ...(company() ? ["company"] : []), "workspace", ...(paid() ? ["payment"] : [])];
  const STEP_NAMES = { plan: "Plan", account: "Account", company: "Company", workspace: "Workspace", payment: "Payment" };
  const selectedModules = () => [...modal.querySelectorAll('input[name="trialModules"]:checked')].map(i => i.value);

  const updateTeamPrice = () => {
    const enabled = !!$("#trialTeamEnabled")?.checked;
    $("#trialTeamSeatWrap")?.classList.toggle("hide", !enabled);
    const hint = $("#trialTeamPriceHint"); if (!hint) return;
    if (!paid()) { hint.textContent = "Included during the free days"; return; }
    const seats = currentTeamSeats(), unit = teamPrices[S.plan][regionalCurrency];
    hint.innerHTML = `× ${money(unit)} / ${S.plan === "monthly" ? "month" : "year"} = ${money(unit * seats)}`;
  };
  const updatePayment = () => {
    const method = payMethod();
    const seg = modal.querySelector(".su-pay-seg");
    // The card choice is always shown (not in the Microsoft Store edition); until the Main Admin
    // switches card payments on it is marked "Coming soon" and cannot be chosen.
    seg?.classList.toggle("hide", !card || storeEdition);
    const cardBtn = modal.querySelector('[data-su-pay="card"]');
    if (cardBtn) {
      cardBtn.disabled = !cardAvailable();
      cardBtn.querySelector(".su-soon")?.remove();
      if (!cardSwitchedOn()) cardBtn.insertAdjacentHTML("beforeend", `<em class="su-soon">Coming soon</em>`);
    }
    modal.querySelectorAll("[data-su-pay]").forEach(b => { const on = b.dataset.suPay === method; b.classList.toggle("selected", on); b.setAttribute("aria-checked", String(on)); });
    const note = $("#trialPayNote");
    const teamNote = !!currentTeamSeats() && cardSwitchedOn();
    note?.classList.toggle("hide", !teamNote);
    if (note && teamNote) note.textContent = "Plans with team members are paid by bank transfer.";
    modal.querySelector("[data-su-bank]")?.classList.toggle("hide", method !== "bank");
    const el = $("#trialPaymentSummary");
    const p = S.plan, bonus = p === "yearly" ? 2 : 1;
    if (el && paid()) {
      if (method === "card") {
        el.innerHTML = `<div class="su-row"><span>${escapeHtml(periodName(p))}</span><strong>${escapeHtml(usd(cardUsd[p]))} <small>/ ${p === "yearly" ? "year" : "month"}</small></strong></div>
          <div class="su-row"><span>Bonus</span><strong>+${bonus} month${bonus > 1 ? "s" : ""}</strong></div>
          <div class="su-row su-muted"><span>Renews automatically · cancel any time</span><span>Paddle</span></div>`;
      } else {
        const seats = currentTeamSeats(), base = prices[p][regionalCurrency], team = teamPrices[p][regionalCurrency] * seats;
        el.innerHTML = `<div class="su-row"><span>${escapeHtml(periodName(p))}</span><strong>${money(base)}</strong></div>
          ${seats ? `<div class="su-row"><span>${seats} team member${seats === 1 ? "" : "s"}</span><strong>${money(team)}</strong></div>` : ""}
          <div class="su-row"><span>Bonus</span><strong>+${bonus} month${bonus > 1 ? "s" : ""}</strong></div>
          <div class="su-row su-total"><span>Total to transfer</span><strong>${money(base + team)}</strong></div>`;
      }
    }
    const confirm = $("#trialPurchaseConfirmText");
    if (confirm) confirm.textContent = method === "card"
      ? `I am buying ${periodName(p)} for ${usd(cardUsd[p])} per ${p === "yearly" ? "year" : "month"}. Paddle.com is the Merchant of Record for this order. The plan renews automatically until I cancel it.`
      : `I am starting a purchase of this plan. I pay by bank transfer directly to Triplem VIP (payment provider: the bank account I choose above); the plan does not renew automatically.${storeNoCrypto ? " Microsoft is not the seller of Triplem VIP plans." : ""}`;
  };

  const showStep = name => {
    const list = steps();
    if (!list.includes(name)) name = list[list.length - 1];
    S.step = name;
    const i = list.indexOf(name), last = i === list.length - 1;
    modal.querySelectorAll("[data-su-step]").forEach(el => el.classList.toggle("hide", el.dataset.suStep !== name));
    $("#trialSignupStepLabel").textContent = `Step ${i + 1} of ${list.length} · ${STEP_NAMES[name]}`;
    modal.querySelector(".su-steps").innerHTML = list.map((s, k) => `<span class="${k <= i ? "on" : ""}"></span>`).join("");
    backBtn.classList.toggle("hide", i === 0);
    nextBtn.classList.toggle("hide", last);
    saveBtn.classList.toggle("hide", !last);
    $("#trialTermsBlock").classList.toggle("hide", !last);
    if (last) saveBtn.innerHTML = paid() && payMethod() === "card" ? `<i class="fa-solid fa-lock" aria-hidden="true"></i> Create account and pay` : "Create account";
    if (name === "company") updateTeamPrice();
    if (name === "payment") updatePayment();
    clearError();
    const body = modal.querySelector(".su-body"); if (body) body.scrollTop = 0;
  };

  // ── Terms inside the panel ──
  const termsPrices = () => {
    try {
      return (window.TriplemCurrencyRegistry?.billingCurrencies?.() || []).filter(c => !(window.TriplemStore?.isCryptoCode?.(c.code)))
        .map(c => ({ code: c.code, monthly: c.billing?.monthly, yearly: c.billing?.yearly, teamMonthly: c.billing?.teamMonthly, teamYearly: c.billing?.teamYearly }));
    } catch (_) { return []; }
  };
  const showTerms = which => {
    S.terms = which;
    const view = modal.querySelector("[data-su-terms-view]");
    const T = window.TriplemTerms;
    if (which && T?.sectionsHtml) {
      view.querySelector(".su-terms-body").innerHTML = T.sectionsHtml(which === "trial" ? T.TRIAL : T.TERMS, { prices: termsPrices(), regional: regionalCurrency, toc: false });
      view.querySelectorAll("[data-su-terms-tab]").forEach(b => { const on = b.dataset.suTermsTab === which; b.classList.toggle("selected", on); b.setAttribute("aria-selected", String(on)); });
    }
    const on = !!which;
    view.classList.toggle("hide", !on);
    modal.querySelectorAll("[data-su-step]").forEach(el => el.classList.toggle("hide", on || el.dataset.suStep !== S.step));
    $("#trialTermsBlock").classList.toggle("hide", on || S.step !== steps().at(-1));
    modal.querySelector(".su-foot").classList.toggle("is-terms", on);
    nextBtn.classList.toggle("hide", on || S.step === steps().at(-1));
    saveBtn.classList.toggle("hide", on || S.step !== steps().at(-1));
    backBtn.classList.toggle("hide", !on && S.step === steps()[0]);
    $("#trialSignupStepLabel").textContent = on ? `Version ${termsVersion}` : `Step ${steps().indexOf(S.step) + 1} of ${steps().length} · ${STEP_NAMES[S.step]}`;
    $("#trialSignupTitle").textContent = on ? (which === "trial" ? "Free Trial Terms" : "Terms and Conditions") : "Create your account";
    const body = modal.querySelector(".su-body"); if (body) body.scrollTop = 0;
  };
  modal.querySelectorAll("[data-su-terms]").forEach(b => b.onclick = e => { e.preventDefault(); showTerms(b.dataset.suTerms); });
  modal.querySelectorAll("[data-su-terms-tab]").forEach(b => b.onclick = () => showTerms(b.dataset.suTermsTab));

  // ── choices ──
  const markPlan = () => modal.querySelectorAll("[data-signup-plan]").forEach(x => { const on = x.dataset.signupPlan === S.plan; x.classList.toggle("selected", on); x.setAttribute("aria-checked", String(on)); });
  modal.querySelectorAll("[data-signup-plan]").forEach(btn => btn.onclick = () => { S.plan = btn.dataset.signupPlan; markPlan(); showStep("plan"); });
  modal.querySelectorAll("[data-signup-type]").forEach(btn => btn.onclick = () => {
    S.accountType = btn.dataset.signupType;
    modal.querySelectorAll("[data-signup-type]").forEach(x => { const on = x === btn; x.classList.toggle("selected", on); x.setAttribute("aria-checked", String(on)); });
    showStep("plan");
  });
  modal.querySelectorAll("[data-su-pay]").forEach(btn => btn.onclick = () => { if (btn.disabled) return; S.pay = btn.dataset.suPay; updatePayment(); showStep("payment"); });
  modal.querySelectorAll('.su-bank-opt input[type="radio"]').forEach(radio => radio.onchange = () => {
    modal.querySelectorAll(".su-bank-opt").forEach(x => x.classList.toggle("selected", !!x.querySelector("input")?.checked));
  });
  $("#trialTeamEnabled").onchange = updateTeamPrice;
  $("#trialTeamSeats").oninput = updateTeamPrice;
  markPlan();

  // ── checks per step ──
  const validEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const validate = name => {
    if (name === "account") {
      if (!$("#trialDisplayName").value.trim()) throw new Error("Please enter your name.");
      if (!$("#trialUsername").value.trim()) throw new Error("Please choose a username.");
      if (!validEmail($("#trialEmail").value.trim())) throw new Error("Please enter a valid email address.");
      if ($("#trialMobile").value.trim().length < 6) throw new Error("Please enter a valid mobile number.");
      const password = $("#trialPassword").value;
      assertPasswordPolicy(password);
      if (password !== $("#trialPasswordConfirm").value) throw new Error("Passwords do not match.");
    }
    if (name === "company") {
      if (!$("#trialCompany").value.trim()) throw new Error("Please enter the company name.");
      if (!$("#trialAddress").value.trim()) throw new Error("Please enter the company address.");
      const ce = $("#trialCompanyEmail").value.trim();
      if (ce && !validEmail(ce)) throw new Error("Please enter a valid company email address.");
      const vat = Number($("#trialVatRate").value);
      if ($("#trialVatRate").value !== "" && (!Number.isFinite(vat) || vat < 0 || vat > 100)) throw new Error("Please enter a VAT rate between 0 and 100.");
    }
    if (name === "workspace") {
      if (!selectedModules().length) throw new Error("Choose at least one workspace module.");
      if (!readCheckboxGrid(modal, "trialCurrencies").length) throw new Error("Select at least one workspace currency.");
    }
  };

  nextBtn.onclick = () => {
    clearError();
    try {
      validate(S.step);
      const list = steps();
      showStep(list[list.indexOf(S.step) + 1]);
    } catch (ex) { showError(ex.message || "Please check your details."); }
  };
  backBtn.onclick = () => {
    if (S.terms) return showTerms(null);
    const list = steps();
    showStep(list[Math.max(0, list.indexOf(S.step) - 1)]);
  };

  const fileToBase64 = file => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || "").split(",")[1] || "");
    r.onerror = () => reject(new Error("Could not read the payment receipt."));
    r.readAsDataURL(file);
  });

  // Company details that have no column of their own are kept in the account's preferences.
  const companyProfile = () => company() ? {
    trade_license: $("#trialLicense").value.trim(), industry: $("#trialIndustry").value, size: $("#trialCompanySize").value,
    country: $("#trialCountry").value, city: $("#trialCity").value.trim(), website: $("#trialWebsite").value.trim(),
    fiscal_year_start_month: Number($("#trialFiscalStart").value || 1)
  } : null;
  const saveAfterSignup = async (user, profile, vatRate) => {
    if (profile) {
      try {
        await supabase("app_user_prefs?on_conflict=owner_id,pref_key", {
          method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({ owner_id: user.id, pref_key: "company_profile", pref_value: JSON.stringify(profile) })
        });
      } catch (e) { console.warn("Company details could not be saved", e); }
    }
    if (vatRate !== null && Number(vatRate) !== Number(defaultVat) && typeof saveTaxSettingsPreferenceToDatabase === "function") {
      try {
        const next = cloneTaxSettings(state.taxSettings);
        if (next[regionalCurrency]) { next[regionalCurrency] = { ...next[regionalCurrency], rate: Number(vatRate) }; await saveTaxSettingsPreferenceToDatabase(next); }
      } catch (e) { console.warn("VAT rate could not be saved", e); }
    }
  };

  saveBtn.onclick = async () => {
    clearError();
    try {
      for (const s of steps()) validate(s);
      let signupPassword = $("#trialPassword").value;
      const setupRecoveryAfterSignup = !!$("#trialRecoverySetup")?.checked;
      const isPaid = paid();
      const method = isPaid ? payMethod() : null;
      const bank = method === "bank";
      const receiptFile = $("#trialReceiptFile")?.files?.[0] || null;
      const modules = selectedModules();
      if (!modules.length) throw new Error("Choose at least one workspace module.");
      if (isPaid && !$("#trialPurchaseConfirm")?.checked) throw new Error("Please confirm that you are starting a purchase.");
      if (bank) {
        if (!receiptFile) throw new Error("Please attach your bank transfer receipt.");
        if (receiptFile.size > 5 * 1024 * 1024) throw new Error("Payment receipt must be 5MB or smaller.");
        if (!["image/png","image/jpeg","image/webp","application/pdf"].includes(receiptFile.type)) throw new Error("Receipt must be PNG, JPG, WebP, or PDF.");
      }
      if (!$("#trialTermsAccept")?.checked) throw new Error("Please accept the Terms and Conditions and the Free Trial Terms.");
      saveBtn.disabled = true; saveBtn.innerHTML = `<i class="fa-solid fa-spinner btn-loader"></i> Creating…`;
      const billingCurrency = $("#trialBillingCurrency").value;
      let currencies = readCheckboxGrid(modal, "trialCurrencies");
      currencies = [billingCurrency, ...currencies.filter(currency => currency !== billingCurrency)];
      // BTC follows the Bitcoin module (never in the Microsoft Store edition).
      const wantsBitcoin = !storeNoCrypto && modules.includes("bitcoin");
      currencies = currencies.filter(currency => String(currency).toUpperCase() !== "BTC" || wantsBitcoin);
      if (wantsBitcoin && !currencies.includes("BTC")) currencies.push("BTC");
      const teamEnabled = company() && !!$("#trialTeamEnabled").checked;
      const email = $("#trialEmail").value.trim(), mobile = $("#trialMobile").value.trim();
      // A card plan is created on the free days and becomes Pro when Paddle confirms the payment.
      const serverPlan = method === "card" ? "free" : S.plan;
      const signupPayload = {
        p_plan: serverPlan,
        p_account_type: S.accountType,
        p_username: $("#trialUsername").value.trim(),
        p_password: signupPassword,
        p_display_name: $("#trialDisplayName").value.trim(),
        p_company_name: company() ? ($("#trialCompany").value.trim() || null) : null,
        p_company_email: (company() && $("#trialCompanyEmail").value.trim()) || email,
        p_company_phone: (company() && $("#trialCompanyPhone").value.trim()) || mobile,
        p_company_address: company() ? ([$("#trialAddress").value.trim(), $("#trialCity").value.trim()].filter(Boolean).join(", ") || null) : null,
        p_vat_number: company() ? ($("#trialTrn").value.trim() || null) : null,
        p_logo_url: $("#trialLogoUrl")?.value.trim() || null,
        p_currencies: currencies,
        p_billing_currency: billingCurrency,
        p_team_enabled: teamEnabled,
        p_team_seats: teamEnabled ? currentTeamSeats() : 0,
        p_payment_bank: bank ? ($('input[name="trialPaymentBank"]:checked')?.value || "hbl") : null,
        p_receipt_name: bank ? receiptFile.name : null,
        p_receipt_mime: bank ? receiptFile.type : null,
        p_receipt_base64: bank ? await fileToBase64(receiptFile) : null,
        p_user_agent: navigator.userAgent || "",
        p_ip: null,
        p_country_code: typeof getRegionalCountryCode === "function" ? getRegionalCountryCode() : "ZZ"
      };
      const missingFn = e => /function.*does not exist|could not find the function|pgrst202|schema cache/i.test(String(e?.message || e || ""));
      let result;
      try {
        // Modules + recorded acceptance of the terms (migration 223).
        result = await supabaseRpc("app_signup_v4", {
          ...signupPayload,
          p_modules: modules,
          p_client: (window.TriplemStore && window.TriplemStore.clientTag) || "web",
          p_terms_accepted: true,
          p_terms_version: termsVersion
        });
      } catch (v4Error) {
        // Only an older database without migration 223 falls back to the previous sign-up.
        if (!missingFn(v4Error)) throw v4Error;
        try {
          result = await supabaseRpc("app_signup_v3", signupPayload);
        } catch (regionalSignupError) {
          const message = String(regionalSignupError?.message || regionalSignupError || "");
          if (!/app_signup_v3/i.test(message) && !missingFn(regionalSignupError)) throw regionalSignupError;
          const fallbackPayload = { ...signupPayload };
          delete fallbackPayload.p_country_code;
          result = await supabaseRpc("app_signup_v2", fallbackPayload);
        }
      }
      const sessionToken = result?.session_token || "";
      const user = result?.user || null;
      if (!sessionToken || !user?.id) throw new Error("Sign-up could not be completed. Please try again.");
      state.sessionToken = sessionToken;
      const profile = companyProfile();
      const vatRate = company() && $("#trialVatRate").value !== "" ? Number($("#trialVatRate").value) : null;
      const cardPeriod = method === "card" ? S.plan : null;
      close();
      if (els.zipUsernameInput) els.zipUsernameInput.value = user.username || "";
      const ok = await completeAuthenticatedUnlock(user, sessionToken, { remember: readRememberMePreference() });
      if (ok) saveAfterSignup(user, profile, vatRate);
      let recoveryPassword = setupRecoveryAfterSignup ? signupPassword : "";
      signupPassword = "";
      const openRecovery = () => {
        if (!recoveryPassword || typeof window.openPostSignupRecoverySetup !== "function") return;
        const pw = recoveryPassword; recoveryPassword = "";
        setTimeout(() => { try { window.openPostSignupRecoverySetup({ currentPassword: pw }); } catch (_) {} }, 240);
      };
      if (ok && cardPeriod && card?.payFromSignup) {
        // Paddle's checkout opens right away; recovery set-up follows once the payment step ends.
        setTimeout(() => { card.payFromSignup(cardPeriod, { onDone: openRecovery }); }, 240);
      } else if (ok) {
        openRecovery();
      } else {
        recoveryPassword = "";
      }
      if (!ok && els.lockError) { els.lockError.textContent = "Account created. Please sign in with your new credentials."; els.lockError.classList.add("show"); }
    } catch (ex) {
      showError(ex.message || "Could not create your account.");
      saveBtn.disabled = false;
      saveBtn.innerHTML = paid() && payMethod() === "card" ? `<i class="fa-solid fa-lock" aria-hidden="true"></i> Create account and pay` : "Create account";
    }
  };

  modal.classList.remove("hide"); modal.setAttribute("aria-hidden", "false");
  try { document.body.style.overflow = "hidden"; } catch (_) {}
  try { bindAdminLogoPicker("trial", null); } catch (_) {}
  try { bindAdminFormPasswordToggle(modal); } catch (_) {}
  S.pay = cardAvailable() ? "card" : "bank";
  showStep("plan");
}

function startGuestMode(){
  // Guest / demo mode is retired — route users to trial signup instead.
  openTrialSignupModal();
}

function doLogout(){
  try { window.stopAccountSecurityBackground?.(); } catch (_) {}
  // Windows app 3.6: stop this PC's Store notifications for the account that
  // is signing out (no-op in browsers and on mobile).
  try { window.TriplemDesktop?.beforeLogout?.(); } catch (_) {}
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
  try { window.TriplemInventoryV2?.reset?.(); } catch (_) {}
  try { window.resetTriplemAiState?.({ keepMessages: false }); } catch (_) {}
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
    // A language switch in this tab handed the current session over (01-config-constants.js).
    try { credential = await takeLanguageSwitchHandoff(); } catch (_) { credential = null; }
  }
  if (!credential?.username || !credential?.sessionToken) {
    clearAuthResumingUi();
    return false;
  }
  const keepRemember = credential.handoff !== true;
  showAuthResumingUi();
  if (els.zipUsernameInput){
    els.zipUsernameInput.value = credential.username;
  }
  if (els.rememberMeCheckbox && keepRemember) {
    els.rememberMeCheckbox.checked = true;
  }
  if (!keepRemember) { try { sessionStorage.setItem(SESSION_USERNAME_KEY, credential.username); } catch (_) {} }
  const ok = await attemptUnlock({
    username: credential.username,
    rememberedCredential: credential,
    remember: keepRemember,
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

async function completeAuthenticatedUnlock(user, sessionToken, { remember = false, silentResume = false, biometricVerified = false } = {}){
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
  // Older servers: workspace lock after the grace period. From migration 224 there is no lock
  // (lock_active is always false): the account becomes read-only instead (05-limited-access.js).
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
      // Smart PIN is required on browsers that are not explicitly trusted.
      // Trust is never inferred from user-agent or a plain local flag: the
      // browser must present its cryptographically-random device secret and the
      // authenticated server must confirm the matching keyed hash is still valid.
      let trustedBrowserOk = false;
      if (typeof window.isCurrentBrowserTrustedForSmartPin === "function") {
        try {
          trustedBrowserOk = await withAuthResumeTimeout(
            window.isCurrentBrowserTrustedForSmartPin(),
            4500,
            "Trusted browser verification"
          );
        } catch (_) { trustedBrowserOk = false; }
      }
      if (trustedBrowserOk) {
        state.secretPinVerified = true;
      } else {
        // A configured biometric/passkey may satisfy the workspace lock first.
        // If it is unavailable, cancelled, or fails, Smart PIN remains the
        // authoritative fallback for every untrusted browser.
        let biometricOk = !!biometricVerified;
        const wantsBiometric = !!user?.settings?.security_biometric_smart_pin_bypass;
        if (!biometricOk && wantsBiometric && typeof window.tryBiometricWorkspaceUnlock === "function") {
          try { biometricOk = await window.tryBiometricWorkspaceUnlock(); } catch (_) { biometricOk = false; }
        }
        if (biometricOk) {
          state.secretPinVerified = true;
        } else {
          // Keep the secure resume mask active behind Smart PIN. The gate already
          // renders above the splash, so the public landing can never flash between
          // remembered-session validation and PIN presentation.
          const pinOk = await requestSecretPinUnlock();
          if (!pinOk) {
            state.__silentResumeTabLoad = null;
            return false;
          }
        }
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
      const warmTab = typeof resolveStartupTab === "function" ? resolveStartupTab() : "home";
      warmTabLoad = warmTab === "home"
        ? Promise.resolve()
        : (warmTab === "dashboard" && typeof warmDashboardData === "function"
          ? warmDashboardData()
          : ensureTabDataLoaded(warmTab || "dashboard", { force: true }));
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
  try { window.startAccountSecurityBackground?.(); } catch (_) {}
  if (typeof applySavedTriplemWorkspaceTheme === "function") applySavedTriplemWorkspaceTheme();
  if (typeof startOfflineSyncForSession === "function") {
    startOfflineSyncForSession();
  }
  // Keep an encrypted profile snapshot (Remember Me only) so the workspace can
  // be reopened offline after a reload. Never refreshed from offline data.
  if (!state.offlineSync.offlineSession) {
    try { window.TriplemOfflineCache?.saveProfile?.(user); } catch (_) {}
  } else {
    try { window.TriplemOfflineCache?.refreshBanner?.(); } catch (_) {}
  }
  updateGuestModeUi();
  try { await window.refreshTriplemAiAccessState?.({ force: true }); } catch (_) {}
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
  // Switching language opens the same app in another language in this tab and hands the
  // session over (saveLanguageSwitchHandoff): do not end it on the way.
  if (window.__triplemLangHandoff && Date.now() - window.__triplemLangHandoff < 15000) return;
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
    const submitForcedPassword = async () => {
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
    modal.querySelector("#forcePwSave").onclick = submitForcedPassword;
    [oldEl,newEl,confirmEl].forEach(input => input?.addEventListener("keydown", event => { if(event.key === "Enter"){ event.preventDefault(); submitForcedPassword(); } }, { once:false }));
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
      state.offlineSync.offlineSession = false;
      let validated = null;
      try {
        validated = await withAuthResumeTimeout(
          supabaseRpc("app_validate_session", {}, { offlineCache: false }),
          12000,
          "Saved session validation"
        );
      } catch (validateErr) {
        // No connection: reopen the workspace from the encrypted copy saved on
        // this device so the user can keep working. The session is verified
        // with the server as soon as the connection returns.
        const offlineResume = typeof isConnectivityFailure === "function" && isConnectivityFailure(validateErr)
          && window.TriplemOfflineCache?.resumeProfile
          ? await window.TriplemOfflineCache.resumeProfile(safeUser)
          : null;
        if (!offlineResume?.user) {
          if (offlineResume?.refused) validateErr.offlineRefusal = offlineResume.refused;
          throw validateErr;
        }
        state.offlineSync.offlineSession = true;
        validated = { user: offlineResume.user };
      }
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
      let twoFactorInteractiveResult = null;
      if (result?.two_factor_required === true) {
        // A previously trusted browser gets the first chance to satisfy 2FA.
        // Invalid/expired local trust silently falls back to the Authenticator.
        let verified = null;
        if (typeof window.attemptTrustedTwoFactorLogin === "function") {
          verified = await window.attemptTrustedTwoFactorLogin({
            challengeToken: result.challenge_token || "",
            username: result.username || safeUser
          });
        }
        if (!verified) {
          if (typeof window.requestTwoFactorLogin !== "function") {
            throw new Error("Two-factor verification is required, but the security module did not load. Refresh and try again.");
          }
          verified = await window.requestTwoFactorLogin({
            challengeToken: result.challenge_token || "",
            username: result.username || safeUser,
            displayName: result.display_name || result.username || safeUser
          });
          if (!verified) throw new Error("Two-factor verification is required to sign in.");
          twoFactorInteractiveResult = verified;
        }
        result = verified;
      }
      sessionToken = result?.session_token || "";
      user = result?.user || null;
      if (!sessionToken || !user?.id) {
        throw new Error("Login failed. Please try again.");
      }
      state.sessionToken = sessionToken;
      if (twoFactorInteractiveResult) {
        const method = twoFactorInteractiveResult.two_factor_method === "recovery" ? "two_factor_recovery_code" : "two_factor_totp";
        try { await window.tagCurrentSessionSecurityMethod?.(method); } catch (_) {}
        if (twoFactorInteractiveResult.trust_browser_requested) {
          try {
            await window.enrollTrustedBrowserAfterTwoFactor?.({
              password, username: safeUser, user, requested: true
            });
          } catch (_) {}
        }
      }
    }

    const ok = await completeAuthenticatedUnlock(user, sessionToken, {
      remember: !!remember,
      silentResume,
      biometricVerified: options.biometricVerified === true
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
          els.lockError.textContent = err?.offlineRefusal
            ? `You are offline. ${err.offlineRefusal}`
            : "The saved session could not be verified right now. Your locally saved entries remain on this device. Reconnect or sign in again.";
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
      const startupTab = typeof resolveStartupTab === "function" ? resolveStartupTab() : "home";
      activate(startupTab || "home");
      const warm = state.__silentResumeTabLoad;
      state.__silentResumeTabLoad = null;
      const loadPromise = warm || (startupTab === "home"
        ? Promise.resolve()
        : (startupTab === "dashboard"
          ? (typeof warmDashboardData === "function" ? warmDashboardData() : Promise.resolve())
          : ensureTabDataLoaded(startupTab || "dashboard", { force: true })));
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

let loanWalletSelectorLoadPromise = null;

function renderLoanWalletSelectorOptions(currency, selectEl, options = {}) {
  if (!selectEl) return { accounts: [], matchingAccounts: [] };
  const normalizedCurrency = String(currency || "").trim();
  const accounts = getExpenseAccounts({ applyUiFilters: false }).filter(a => a.currency !== "BTC");
  const matchingAccounts = normalizedCurrency
    ? accounts.filter(a => a.currency === normalizedCurrency)
    : accounts;
  const rows = [`<option value="">Skip wallet entry</option>`];
  rows.push(...matchingAccounts.map(a => {
    const balDisplay = formatReportAmount(a.balance, a.currency);
    return `<option value="${escapeHtml(a.group_id)}" data-currency="${escapeHtml(a.currency || "")}">${escapeHtml(a.person_name)} (${escapeHtml(a.accountType)}) — ${escapeHtml(balDisplay)}</option>`;
  }));
  if (!matchingAccounts.length) {
    const label = options.loading
      ? `Loading ${normalizedCurrency || "available"} wallets…`
      : normalizedCurrency
        ? `No ${normalizedCurrency} wallets available`
        : "No wallets available";
    rows.push(`<option value="" disabled>${escapeHtml(label)}</option>`);
  }
  const previous = String(options.preserveValue ?? selectEl.value ?? "");
  selectEl.innerHTML = rows.join("");
  if (previous && Array.from(selectEl.options).some(opt => opt.value === previous && !opt.disabled)) {
    selectEl.value = previous;
  }
  syncCurrencySelectFonts(selectEl);
  return { accounts, matchingAccounts };
}

async function ensureLoanWalletSelectorDataLoaded() {
  const accounts = getExpenseAccounts({ applyUiFilters: false }).filter(a => a.currency !== "BTC");
  const expenseScopeLoaded = !!state.loadedLedgerScopes?.has?.(typeof LEDGER_SCOPE_EXPENSES !== "undefined" ? LEDGER_SCOPE_EXPENSES : "expenses");
  const canLoad = typeof databaseSessionCanLoad === "function" ? databaseSessionCanLoad() : state.dataSource === "supabase";
  if (accounts.length || expenseScopeLoaded || !canLoad || state.dataSource === "backup") return;
  if (!loanWalletSelectorLoadPromise) {
    loanWalletSelectorLoadPromise = (async () => {
      let lazyResult = null;
      if (typeof loadExpenseWalletSummaries === "function" && state.expenseLazy?.rpcAvailable !== false) {
        lazyResult = await loadExpenseWalletSummaries({ force: false });
      }
      if (lazyResult === null && typeof loadLedgerScopeFromSupabase === "function") {
        await loadLedgerScopeFromSupabase(
          typeof LEDGER_SCOPE_EXPENSES !== "undefined" ? LEDGER_SCOPE_EXPENSES : "expenses",
          { force: false, throwOnError: true }
        );
      }
    })().finally(() => { loanWalletSelectorLoadPromise = null; });
  }
  await loanWalletSelectorLoadPromise;
}

function populateLoanWalletSelector(currency, selectEl) {
  if (!selectEl) return;
  const normalizedCurrency = String(currency || "").trim();
  const requestId = String((Number(selectEl.dataset.walletLoadRequest || 0) || 0) + 1);
  selectEl.dataset.walletLoadRequest = requestId;
  const previous = String(selectEl.value || "");
  const rendered = renderLoanWalletSelectorOptions(normalizedCurrency, selectEl, { preserveValue: previous });
  const expenseScopeLoaded = !!state.loadedLedgerScopes?.has?.(typeof LEDGER_SCOPE_EXPENSES !== "undefined" ? LEDGER_SCOPE_EXPENSES : "expenses");
  const canLoad = typeof databaseSessionCanLoad === "function" ? databaseSessionCanLoad() : state.dataSource === "supabase";
  if (rendered.accounts.length || expenseScopeLoaded || !canLoad || state.dataSource === "backup") return;

  renderLoanWalletSelectorOptions(normalizedCurrency, selectEl, { loading: true, preserveValue: previous });
  ensureLoanWalletSelectorDataLoaded().then(() => {
    if (!selectEl.isConnected || selectEl.dataset.walletLoadRequest !== requestId) return;
    renderLoanWalletSelectorOptions(normalizedCurrency, selectEl, { preserveValue: previous });
  }).catch(err => {
    console.warn("Wallet selector refresh failed:", err);
    if (!selectEl.isConnected || selectEl.dataset.walletLoadRequest !== requestId) return;
    renderLoanWalletSelectorOptions(normalizedCurrency, selectEl, { preserveValue: previous });
  });
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
