/* Modularized from script.js lines 27707-28569 — landing page. Load order must be preserved. */

/* Build 156 — localize public pricing and illustrative landing money without changing dashboard currency capability. */
function landingRegionalCurrency(){
  return typeof getRegionalCurrency === "function" ? getRegionalCurrency() : "USD";
}


function landingRegionLabel(countryCode){
  const code = String(countryCode || "").trim().toUpperCase();
  const configured = window.TriplemCurrencyRegistry?.landingRegions?.() || [];
  const configuredName = configured.find(region => region.code === code)?.name;
  if (configuredName) return configuredName;
  try {
    if (typeof Intl.DisplayNames === "function") return new Intl.DisplayNames([navigator.language || "en"], { type:"region" }).of(code) || code;
  } catch (_) {}
  return code || "Region";
}

function initLandingRegionPicker(){
  const select = document.getElementById("landingRegionSelect");
  if (!select) return;
  const configured = window.TriplemCurrencyRegistry?.landingRegions?.() || [];
  const regions = configured.length ? configured : [
    {code:"US",name:"USA"},{code:"GB",name:"UK"},{code:"IN",name:"India"},{code:"AE",name:"UAE"},
    {code:"SA",name:"Saudi Arabia"},{code:"PK",name:"Pakistan"},{code:"RU",name:"Russia"},{code:"CN",name:"China"}
  ];
  select.innerHTML = "";
  regions.forEach(region => {
    const option = document.createElement("option");
    option.value = region.code;
    option.textContent = region.name;
    select.appendChild(option);
  });
  const current = typeof getRegionalCountryCode === "function" ? getRegionalCountryCode() : "US";
  if (!regions.some(region => region.code === current)) {
    const option = document.createElement("option");
    option.value = current;
    option.textContent = landingRegionLabel(current) || current;
    select.prepend(option);
  }
  select.value = current;
  if (select.dataset.regionBound !== "1") {
    select.dataset.regionBound = "1";
    select.addEventListener("change", () => {
      const country = String(select.value || "").toUpperCase();
      if (typeof setRegionalCountryOverride === "function") setRegionalCountryOverride(country);
    });
    window.addEventListener("triplem:regional-currency", () => {
      const country = typeof getRegionalCountryCode === "function" ? getRegionalCountryCode() : select.value;
      if (Array.from(select.options).some(option => option.value === country)) select.value = country;
    });
  }
}

function landingIllustrativeValues(values, fromCurrency = "AED"){
  const target = landingRegionalCurrency();
  return (Array.isArray(values) ? values : []).map(value => convertIllustrativeCurrencyAmount(value, fromCurrency, target));
}

function landingLocalizedMoneyFromText(rawText){
  const raw = String(rawText || "").trim();
  const match = raw.match(/^([+−-]\s*)?(AED|SAR|PKR|USD|Rs\.)\s*([0-9][0-9,]*(?:\.[0-9]+)?)(k)?$/i);
  if (!match) return "";
  const prefix = match[1] || "";
  const sourceToken = match[2].toUpperCase();
  const sourceCurrency = sourceToken === "RS." ? "PKR" : sourceToken;
  const sourceAmount = Number(String(match[3]).replace(/,/g, ""));
  if (!Number.isFinite(sourceAmount)) return "";
  const target = landingRegionalCurrency();
  const converted = convertIllustrativeCurrencyAmount(sourceAmount, sourceCurrency, target);
  const suffixK = !!match[4];
  const maximumFractionDigits = target === "PKR" ? (suffixK ? 1 : 0) : (suffixK ? 2 : 2);
  const amountMarkup = regionalMoneyHtml(converted, target, { maximumFractionDigits, minimumFractionDigits: 0 });
  return `${escapeHtml(prefix)}${amountMarkup}${suffixK ? "k" : ""}`;
}

function applyLandingRegionalCurrency(){
  const currency = landingRegionalCurrency();

  const heroMonthly = document.querySelector(".landing-plan-option.is-monthly .landing-plan-copy strong");
  const heroYearly = document.querySelector(".landing-plan-option.is-yearly .landing-plan-copy strong");
  if (heroMonthly) heroMonthly.innerHTML = `${regionalMoneyHtml(publicPlanPrice("monthly", currency), currency)} <b>+ 30 Days Free</b>`;
  if (heroYearly) heroYearly.innerHTML = `${regionalMoneyHtml(publicPlanPrice("yearly", currency), currency)} <b>+ 60 Days Free</b>`;

  const pricingIntro = document.querySelector(".landing-pricing-intro");
  if (pricingIntro) pricingIntro.textContent = `Monthly and yearly access, shown clearly in your regional ${currency} currency. Installation support included on eligible setup.`;

  document.querySelectorAll(".pricing-rate-list").forEach(list => {
    list.querySelectorAll("li").forEach(row => {
      const code = String(row.querySelector(".pricing-rate-code")?.textContent || "").trim().toUpperCase();
      const show = code === currency;
      row.hidden = !show;
      if (!show) return;
      const amount = row.querySelector(".pricing-rate-amount");
      const plan = row.closest(".pricing-plan-offer-yearly") ? "yearly" : "monthly";
      if (amount) amount.innerHTML = regionalMoneyHtml(publicPlanPrice(plan, currency), currency);
    });
  });

  const legacyCardCurrency = {
    "Pakistani Rupee": "PKR",
    "Saudi Riyal": "SAR",
    "UAE Dirham": "AED",
    "US Dollar": "USD"
  };
  document.querySelectorAll(".pricing-grid .pricing-card").forEach(card => {
    const cardCurrency = legacyCardCurrency[String(card.querySelector("h5")?.textContent || "").trim()] || "";
    if (!cardCurrency) return;
    card.hidden = cardCurrency !== currency;
    if (cardCurrency === currency) {
      const period = /per year/i.test(card.textContent || "") ? "yearly" : "monthly";
      const amount = Array.from(card.querySelectorAll("div")).find(el => /^\s*(?:AED|SAR|PKR|USD|Rs\.)\s*[0-9]/i.test(el.textContent || "") && el.children.length === 0);
      if (amount) amount.innerHTML = regionalMoneyHtml(publicPlanPrice(period, currency), currency);
    }
  });

  const roots = [document.querySelector(".landing-shell"), document.getElementById("trialPromoOverlay")].filter(Boolean);
  roots.forEach(root => {
    root.querySelectorAll("strong,b,span,div").forEach(el => {
      if (el.children.length) return;
      if (el.closest(".landing-plan-option,.pricing-rate-list,.pricing-grid")) return;
      if (!el.dataset.regionalOriginalMoney && landingLocalizedMoneyFromText(el.textContent)) el.dataset.regionalOriginalMoney = el.textContent.trim();
      if (!el.dataset.regionalOriginalMoney) return;
      const localized = landingLocalizedMoneyFromText(el.dataset.regionalOriginalMoney);
      if (localized) el.innerHTML = localized;
    });
  });

  const shortLabels = document.querySelectorAll(".landing-demo-wallet-copy p,.landing-demo-mock-head p,.landing-demo-wallet-card p,.landing-demo-account-card p");
  shortLabels.forEach(el => {
    if (!el.dataset.regionalOriginalLabel) el.dataset.regionalOriginalLabel = el.textContent || "";
    el.textContent = el.dataset.regionalOriginalLabel.replace(/\b(AED|SAR|PKR|USD)\b/g, currency);
  });
  const promoMeta = document.querySelector("#trialPromoOverlay .trial-promo-mini-meta");
  if (promoMeta) promoMeta.textContent = `3 active · ${currency}`;

  landingDemoChartsReady = false;
  while (landingDemoCharts.length) { try { landingDemoCharts.pop()?.destroy?.(); } catch (_) {} }
  if (document.getElementById("landingDemoAnalytics") && !document.getElementById("landingDemoAnalytics")?.closest(".hide")) buildLandingDemoCharts();
  const activeOverlay = document.querySelector("#landingContentOverlay [data-landing-panel]:not(.hide)");
  if (activeOverlay?.dataset?.landingPanel) syncLandingOverlayDemoCharts(activeOverlay.dataset.landingPanel);
}

function resolveLandingSection(value){
  const key = String(value || "").replace(/^#/, "").trim().toLowerCase();
  return LANDING_SECTION_ALIASES[key] || null;
}

function isLandingContentOverlayOpen(){
  const overlay = document.getElementById("landingContentOverlay");
  return !!(overlay && !overlay.classList.contains("hide"));
}

function isHigherLandingModalOpen(){
  const inquiry = document.getElementById("inquiryOverlay");
  const ios = document.getElementById("iosDownloadOverlay");
  const android = document.getElementById("androidDownloadOverlay");
  const trial = document.getElementById("trialSignupModal");
  const signIn = document.getElementById("signInOverlay");
  const fraud = document.getElementById("fraudAlertOverlay");
  const trialPromo = document.getElementById("trialPromoOverlay");
  return !!(
    (inquiry && !inquiry.classList.contains("hide")) ||
    (ios && !ios.classList.contains("hide")) ||
    (android && !android.classList.contains("hide")) ||
    (trial && !trial.classList.contains("hide")) ||
    (signIn && !signIn.classList.contains("hide")) ||
    (fraud && !fraud.classList.contains("hide")) ||
    (trialPromo && !trialPromo.classList.contains("hide"))
  );
}

function isSignInOverlayOpen(){
  const overlay = document.getElementById("signInOverlay");
  return !!(overlay && !overlay.classList.contains("hide"));
}

function openSignInOverlay(){
  const overlay = document.getElementById("signInOverlay");
  if (!overlay) return;
  try { setLandingMobileMenuOpen(false); } catch (_) {}
  try { if (typeof dismissTrialPromoOverlay === "function") dismissTrialPromoOverlay({ showFraud: false }); } catch (_) {}
  try { if (typeof dismissFraudAlertOverlay === "function") dismissFraudAlertOverlay(); } catch (_) {}
  try { closeLandingContentOverlay({ clearHash: true, focusLogin: false }); } catch (_) {}
  overlay.classList.remove("hide");
  overlay.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeSignInOverlay(){
  const overlay = document.getElementById("signInOverlay");
  if (!overlay) return;
  try { window.TriplemAuthSurface?.cancelActive?.(); } catch (_) {}
  overlay.classList.add("hide");
  overlay.setAttribute("aria-hidden", "true");
  // Don't clear body overflow if another modal is open
  if (!isHigherLandingModalOpen() && !isLandingContentOverlayOpen()) {
    document.body.style.overflow = "";
  }
}

function bindSignInOverlay(){
  const overlay = document.getElementById("signInOverlay");
  if (!overlay || overlay.dataset.signinBound === "1") return;
  overlay.dataset.signinBound = "1";
  overlay.addEventListener("click", e => {
    if (e.target === overlay || e.target.closest?.("[data-signin-dismiss]")) {
      e.preventDefault();
      closeSignInOverlay();
    }
  });
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape" || !isSignInOverlayOpen()) return;
    const inquiry = document.getElementById("inquiryOverlay");
    const trial = document.getElementById("trialSignupModal");
    const ios = document.getElementById("iosDownloadOverlay");
    const android = document.getElementById("androidDownloadOverlay");
    if (inquiry && !inquiry.classList.contains("hide")) return;
    if (trial && !trial.classList.contains("hide")) return;
    if (ios && !ios.classList.contains("hide")) return;
    if (android && !android.classList.contains("hide")) return;
    closeSignInOverlay();
  });
}

function setLandingMobileMenuOpen(open){
  const menu = document.getElementById("landingMobileMenu");
  const toggle = document.getElementById("landingMenuToggle");
  if (!menu || !toggle) return;
  const shouldOpen = !!open;
  menu.classList.toggle("hide", !shouldOpen);
  menu.hidden = !shouldOpen;
  toggle.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
  toggle.setAttribute("aria-label", shouldOpen ? "Close menu" : "Open menu");
  const icon = toggle.querySelector("i");
  if (icon) {
    icon.className = shouldOpen ? "fa-solid fa-xmark" : "fa-solid fa-bars";
  }
  const mobileProjects = document.getElementById("landingMobileProjects");
  if (mobileProjects) mobileProjects.open = false;
  if (shouldOpen) {
    document.querySelectorAll(".landing-projects-dropdown.open").forEach(panel => panel.classList.remove("open"));
    document.querySelectorAll("#landingOtherProjectsBtn[aria-expanded='true']").forEach(trigger => {
      trigger.setAttribute("aria-expanded", "false");
    });
  }
}

function syncLandingNavActive(section){
  const active = section || "";
  document.querySelectorAll("[data-landing-section]").forEach(el => {
    const isActive = el.getAttribute("data-landing-section") === active;
    el.classList.toggle("is-active", isActive);
    if (el.getAttribute("role") === "tab") {
      el.setAttribute("aria-selected", isActive ? "true" : "false");
    }
  });
}

function openLandingContentOverlay(sectionKey, options = {}){
  const section = resolveLandingSection(sectionKey) || sectionKey;
  const meta = LANDING_SECTION_META[section];
  let overlay = document.getElementById("landingContentOverlay");
  if (!meta || !overlay) return;

  // Keep overlay usable after sign-in (it lives under #lockScreen in markup).
  if (overlay.parentElement !== document.body) {
    document.body.appendChild(overlay);
  }

  const inApp = !!state.unlocked;
  overlay.classList.toggle("is-app-overlay", inApp);

  setLandingMobileMenuOpen(false);

  const titleEl = document.getElementById("landingContentTitle");
  const kickerEl = document.getElementById("landingContentKicker");
  const closeBtn = document.getElementById("landingContentCloseBtn");
  if (titleEl) titleEl.textContent = meta.title;
  if (kickerEl) kickerEl.textContent = meta.kicker;
  if (closeBtn) {
    closeBtn.setAttribute(
      "aria-label",
      inApp ? "Close about overlay" : "Close and return to sign in"
    );
  }

  overlay.querySelectorAll("[data-landing-panel]").forEach(panel => {
    const match = panel.getAttribute("data-landing-panel") === section;
    panel.classList.toggle("hide", !match);
    panel.hidden = !match;
  });

  overlay.classList.remove("hide");
  overlay.hidden = false;
  overlay.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => overlay.classList.add("is-open"));

  if (els.lockScreen && !inApp) els.lockScreen.classList.add("landing-overlay-open");
  else if (els.lockScreen) els.lockScreen.classList.remove("landing-overlay-open");
  syncLandingNavActive(section);

  if (!inApp) {
    if (!options.fromHash) {
      history.replaceState(null, "", `#${meta.hash}`);
    } else if (window.location.hash.replace(/^#/, "").toLowerCase() !== meta.hash) {
      history.replaceState(null, "", `#${meta.hash}`);
    }
  }

  const sheet = overlay.querySelector(".landing-content-sheet");
  const body = overlay.querySelector(".landing-content-body");
  const activeTab = overlay.querySelector('.landing-content-tab[aria-selected="true"], .landing-content-tab.is-active');
  const resetOverlayScroll = () => {
    if (sheet) sheet.scrollTop = 0;
    if (body) body.scrollTop = 0;
  };
  resetOverlayScroll();
  requestAnimationFrame(() => {
    resetOverlayScroll();
    try {
      activeTab?.scrollIntoView({ block: "nearest", inline: "center", behavior: "auto" });
    } catch {
      activeTab?.scrollIntoView({ block: "nearest", inline: "center" });
    }
    syncLandingOverlayDemoCharts(section);
  });

  try {
    closeBtn?.focus({ preventScroll: true });
  } catch {
    closeBtn?.focus();
  }
}

function closeLandingContentOverlay(options = {}){
  const overlay = document.getElementById("landingContentOverlay");
  if (!overlay || overlay.classList.contains("hide")) {
    syncLandingNavActive("");
    destroyLandingOverlayCharts();
    return;
  }

  const inApp = !!state.unlocked;
  overlay.classList.remove("is-open");
  overlay.classList.remove("is-app-overlay");
  overlay.setAttribute("aria-hidden", "true");
  if (els.lockScreen) els.lockScreen.classList.remove("landing-overlay-open");
  syncLandingNavActive("");
  destroyLandingOverlayCharts();

  const finish = () => {
    overlay.classList.add("hide");
    overlay.hidden = true;
    overlay.querySelectorAll("[data-landing-panel]").forEach(panel => {
      panel.classList.add("hide");
      panel.hidden = true;
    });
  };

  window.setTimeout(finish, 220);

  const hash = String(window.location.hash || "").replace(/^#/, "").toLowerCase();
  if (!inApp && options.clearHash !== false && resolveLandingSection(hash)) {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }

  if (options.focusLogin === true && !inApp) focusUnlockForm();
}

function bindLandingContentNav(){
  if (!els.lockScreen) return;
  const shell = els.lockScreen.querySelector(".landing-shell") || els.lockScreen;
  if (shell.dataset.landingNavBound === "1") return;
  shell.dataset.landingNavBound = "1";

  const menuToggle = document.getElementById("landingMenuToggle");
  const mobileMenu = document.getElementById("landingMobileMenu");
  const overlay = document.getElementById("landingContentOverlay");

  menuToggle?.addEventListener("click", e => {
    e.stopPropagation();
    const open = menuToggle.getAttribute("aria-expanded") !== "true";
    setLandingMobileMenuOpen(open);
  });

  document.addEventListener("click", e => {
    if (!mobileMenu || mobileMenu.classList.contains("hide")) return;
    if (mobileMenu.contains(e.target) || menuToggle?.contains(e.target)) return;
    setLandingMobileMenuOpen(false);
  });

  window.addEventListener("resize", () => {
    if (window.matchMedia("(min-width: 961px)").matches) {
      setLandingMobileMenuOpen(false);
    }
  });

  shell.addEventListener("click", e => {
    const projectLink = e.target.closest("[data-landing-project-link]");
    if (projectLink) {
      setLandingMobileMenuOpen(false);
      document.querySelectorAll(".menu-dropdown.open").forEach(panel => panel.classList.remove("open"));
      document.querySelectorAll(".menu-trigger[aria-expanded='true']").forEach(trigger => {
        trigger.setAttribute("aria-expanded", "false");
      });
      return;
    }

    const inquiryTrigger = e.target.closest("[data-landing-inquiry]");
    if (inquiryTrigger) {
      e.preventDefault();
      setLandingMobileMenuOpen(false);
      document.getElementById("sendInquiryBtn")?.click();
      return;
    }

    const signinTrigger = e.target.closest("[data-landing-signin]");
    if (signinTrigger) {
      e.preventDefault();
      setLandingMobileMenuOpen(false);
      closeLandingContentOverlay({ clearHash: true, focusLogin: false });
      focusUnlockForm();
      return;
    }

    const trialTrigger = e.target.closest("[data-landing-trial]");
    if (trialTrigger) {
      e.preventDefault();
      setLandingMobileMenuOpen(false);
      closeLandingContentOverlay({ clearHash: true, focusLogin: false });
      if (typeof openTrialSignupModal === "function") openTrialSignupModal(trialTrigger.dataset.signupPlanPrefill || "free");
      else document.getElementById("trialSignupBtn")?.click();
      return;
    }

    const home = e.target.closest("[data-landing-home]");
    if (home) {
      e.preventDefault();
      setLandingMobileMenuOpen(false);
      closeLandingContentOverlay({ clearHash: true, focusLogin: false });
      closeSignInOverlay();
      return;
    }

    const closer = e.target.closest("[data-landing-close]");
    if (closer) {
      e.preventDefault();
      closeLandingContentOverlay({ clearHash: true });
      return;
    }

    const sectionBtn = e.target.closest("[data-landing-section]");
    if (sectionBtn) {
      e.preventDefault();
      const section = sectionBtn.getAttribute("data-landing-section");
      openLandingContentOverlay(section);
    }
  });

  // Overlay may be reparented to <body> for in-app use — keep every CTA working there too.
  overlay?.addEventListener("click", e => {
    const inquiryTrigger = e.target.closest("[data-landing-inquiry]");
    if (inquiryTrigger) {
      e.preventDefault();
      e.stopPropagation();
      closeLandingContentOverlay({ clearHash: true, focusLogin: false });
      // Let the content sheet clear its top layer before opening the access request dialog.
      window.setTimeout(() => document.getElementById("sendInquiryBtn")?.click(), 230);
      return;
    }
    const closer = e.target.closest("[data-landing-close]");
    if (closer) {
      e.preventDefault();
      closeLandingContentOverlay({ clearHash: true });
      return;
    }
    const sectionBtn = e.target.closest("[data-landing-section]");
    if (sectionBtn) {
      e.preventDefault();
      const section = sectionBtn.getAttribute("data-landing-section");
      openLandingContentOverlay(section);
    }
  });

  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if (isHigherLandingModalOpen()) return;
    if (mobileMenu && !mobileMenu.classList.contains("hide")) {
      setLandingMobileMenuOpen(false);
      return;
    }
    if (isLandingContentOverlayOpen()) {
      e.preventDefault();
      closeLandingContentOverlay({ clearHash: true });
    }
  });

  window.addEventListener("hashchange", () => {
    if (state.unlocked) return;
    handleUrlHash();
  });

  // Keep legacy hash anchors (if any remain) from forcing page scroll
  shell.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener("click", e => {
      const hash = anchor.getAttribute("href");
      if (!hash || hash === "#") return;
      const section = resolveLandingSection(hash);
      if (section) {
        e.preventDefault();
        openLandingContentOverlay(section);
        return;
      }
      if (hash === "#top" || hash === "#login") {
        e.preventDefault();
        closeLandingContentOverlay({ clearHash: true, focusLogin: false });
        if (hash === "#login") focusUnlockForm();
        else closeSignInOverlay();
      }
    });
  });

  if (overlay) {
    overlay.addEventListener("click", e => {
      if (e.target === overlay || e.target.classList?.contains("landing-content-backdrop")) {
        closeLandingContentOverlay({ clearHash: true });
      }
    });
  }
}

let landingDemoCharts = [];
let landingDemoChartsReady = false;
let landingOverlayCharts = [];

function destroyLandingOverlayCharts(){
  while (landingOverlayCharts.length) {
    const chart = landingOverlayCharts.pop();
    try { chart?.destroy?.(); } catch (_) {}
  }
}

function createLandingOverlayChart(canvas, config){
  if (!canvas || !window.Chart) return null;
  const existing = window.Chart.getChart?.(canvas);
  if (existing) {
    try { existing.destroy(); } catch (_) {}
  }
  const chart = new window.Chart(canvas.getContext("2d"), config);
  landingOverlayCharts.push(chart);
  return chart;
}

function buildLandingFeaturesDemoCharts(){
  if (!window.Chart) return;
  const c = landingDemoChartPalette();
  const base = landingDemoBaseOptions(c);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];

  createLandingOverlayChart(document.getElementById("featuresChartSpend"), {
    type: "line",
    data: {
      labels: months,
      datasets: [
        {
          label: "Operations",
          data: landingIllustrativeValues([2100, 1980, 2450, 2320, 2180, 2560]),
          borderColor: c.primary,
          backgroundColor: c.primarySoft,
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointHoverRadius: 5,
          borderWidth: 2.5
        },
        {
          label: "Personal",
          data: landingIllustrativeValues([980, 1120, 1040, 1280, 1190, 1350]),
          borderColor: c.warning,
          backgroundColor: c.warningSoft,
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointHoverRadius: 5,
          borderWidth: 2.5
        }
      ]
    },
    options: {
      ...base,
      plugins: {
        ...base.plugins,
        legend: {
          ...base.plugins.legend,
          position: "bottom",
          labels: { ...base.plugins.legend.labels, padding: 12 }
        }
      }
    }
  });

  createLandingOverlayChart(document.getElementById("featuresChartWalletMix"), {
    type: "doughnut",
    data: {
      labels: ["Emirates NBD", "Cash", "HBL", "Bitcoin", "Other"],
      datasets: [{
        data: [38, 12, 22, 14, 14],
        backgroundColor: [c.primary, c.success, c.warning, c.series4, c.slate],
        borderColor: c.doughnutBorder,
        borderWidth: 2,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      animation: base.animation,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: c.text,
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            pointStyle: "circle",
            font: { size: 11, weight: "600" },
            padding: 12
          }
        },
        tooltip: base.plugins.tooltip
      }
    }
  });
}

function buildLandingServicesDemoCharts(){
  if (!window.Chart) return;
  const c = landingDemoChartPalette();
  const base = landingDemoBaseOptions(c);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];

  createLandingOverlayChart(document.getElementById("servicesChartReports"), {
    type: "bar",
    data: {
      labels: months,
      datasets: [
        {
          label: "Invoices",
          data: [28, 32, 30, 41, 38, 46],
          backgroundColor: c.primarySoft,
          borderColor: c.primary,
          borderWidth: 1.5,
          borderRadius: 6,
          maxBarThickness: 20
        },
        {
          label: "Statements",
          data: [12, 14, 13, 16, 18, 19],
          backgroundColor: c.successSoft,
          borderColor: c.success,
          borderWidth: 1.5,
          borderRadius: 6,
          maxBarThickness: 20
        }
      ]
    },
    options: {
      ...base,
      plugins: {
        ...base.plugins,
        legend: {
          ...base.plugins.legend,
          position: "bottom",
          labels: { ...base.plugins.legend.labels, padding: 12 }
        }
      }
    }
  });

  createLandingOverlayChart(document.getElementById("servicesChartExports"), {
    type: "doughnut",
    data: {
      labels: ["Invoices", "Expense PDFs", "Inventory", "BTC", "Backups"],
      datasets: [{
        data: [34, 22, 18, 12, 14],
        backgroundColor: [c.primary, c.warning, c.success, c.series4, c.slate],
        borderColor: c.doughnutBorder,
        borderWidth: 2,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      animation: base.animation,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: c.text,
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            pointStyle: "circle",
            font: { size: 11, weight: "600" },
            padding: 12
          }
        },
        tooltip: base.plugins.tooltip
      }
    }
  });

  createLandingOverlayChart(document.getElementById("servicesChartAudit"), {
    type: "bar",
    data: {
      labels: ["In", "Low", "Sold"],
      datasets: [{
        label: `Stock value (${landingRegionalCurrency()} k)`,
        data: landingIllustrativeValues([28.4, 11.2, 8.6]),
        backgroundColor: [c.successSoft, c.warningSoft, c.primarySoft],
        borderColor: [c.success, c.warning, c.slate],
        borderWidth: 1.5,
        borderRadius: 6,
        maxBarThickness: 28
      }]
    },
    options: {
      ...base,
      plugins: {
        ...base.plugins,
        legend: { display: false }
      },
      scales: {
        ...base.scales,
        y: {
          ...base.scales.y,
          ticks: {
            ...base.scales.y.ticks,
            callback: value => `${value}k`
          }
        }
      }
    }
  });
}

function buildLandingAboutDemoCharts(){
  if (!window.Chart) return;
  const c = landingDemoChartPalette();
  const base = landingDemoBaseOptions(c);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];

  createLandingOverlayChart(document.getElementById("aboutChartCashflow"), {
    type: "bar",
    data: {
      labels: months,
      datasets: [
        {
          label: "Money in",
          data: landingIllustrativeValues([9200, 10100, 9800, 11200, 12050, 12800]),
          backgroundColor: c.successSoft,
          borderColor: c.success,
          borderWidth: 1.5,
          borderRadius: 6,
          maxBarThickness: 18
        },
        {
          label: "Money out",
          data: landingIllustrativeValues([6400, 7100, 6900, 7600, 8200, 7900]),
          backgroundColor: c.primarySoft,
          borderColor: c.primary,
          borderWidth: 1.5,
          borderRadius: 6,
          maxBarThickness: 18
        }
      ]
    },
    options: {
      ...base,
      plugins: {
        ...base.plugins,
        legend: {
          ...base.plugins.legend,
          position: "bottom",
          labels: { ...base.plugins.legend.labels, padding: 12 }
        }
      }
    }
  });

  createLandingOverlayChart(document.getElementById("aboutChartExpenseMix"), {
    type: "doughnut",
    data: {
      labels: ["Operations", "Inventory", "Personal", "Loans", "Other"],
      datasets: [{
        data: [32, 26, 18, 14, 10],
        backgroundColor: [c.primary, c.success, c.warning, c.series4, c.slate],
        borderColor: c.doughnutBorder,
        borderWidth: 2,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      animation: base.animation,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: c.text,
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            pointStyle: "circle",
            font: { size: 11, weight: "600" },
            padding: 12
          }
        },
        tooltip: base.plugins.tooltip
      }
    }
  });

  createLandingOverlayChart(document.getElementById("aboutChartWalletLiquidity"), {
    type: "bar",
    data: {
      labels: ["ENBD", "ADCB", "Cash", "HBL", "Meezan"],
      datasets: [{
        label: `Available value (${landingRegionalCurrency()} k equivalent)`,
        data: landingIllustrativeValues([18.6, 9.2, 1.85, 8.1, 3.6]),
        backgroundColor: [c.primarySoft, c.primarySoft, c.successSoft, c.warningSoft, c.successSoft],
        borderColor: [c.primary, c.primary, c.success, c.warning, c.success],
        borderWidth: 1.5,
        borderRadius: 6,
        maxBarThickness: 22
      }]
    },
    options: {
      ...base,
      plugins: { ...base.plugins, legend: { display: false } },
      scales: {
        ...base.scales,
        y: { ...base.scales.y, ticks: { ...base.scales.y.ticks, callback: value => `${value}k` } }
      }
    }
  });

  createLandingOverlayChart(document.getElementById("aboutChartOperatingRhythm"), {
    type: "line",
    data: {
      labels: ["1", "5", "10", "15", "20", "25", "30"],
      datasets: [
        { label: "Income", data: landingIllustrativeValues([1.6, 2.8, 2.1, 3.4, 2.9, 4.2, 3.8]), borderColor: c.success, backgroundColor: c.successSoft, fill: true, tension: .34, pointRadius: 2.5, borderWidth: 2.2 },
        { label: "Expenses", data: landingIllustrativeValues([1.1, 1.7, 1.4, 2.2, 1.8, 2.6, 2.1]), borderColor: c.primary, backgroundColor: c.primarySoft, fill: true, tension: .34, pointRadius: 2.5, borderWidth: 2.2 }
      ]
    },
    options: {
      ...base,
      plugins: { ...base.plugins, legend: { ...base.plugins.legend, position: "bottom", labels: { ...base.plugins.legend.labels, padding: 10 } } },
      scales: {
        ...base.scales,
        y: { ...base.scales.y, ticks: { ...base.scales.y.ticks, callback: value => `${value}k` } }
      }
    }
  });
}

function buildLandingSecurityDemoCharts(){
  if (!window.Chart) return;
  const c = landingDemoChartPalette();
  const base = landingDemoBaseOptions(c);

  createLandingOverlayChart(document.getElementById("securityChartLayers"), {
    type: "doughnut",
    data: {
      labels: ["Hashing", "Sessions", "Isolation", "HTTPS", "Smart PIN"],
      datasets: [{
        data: [26, 22, 20, 18, 14],
        backgroundColor: [c.primary, c.success, c.series4, c.warning, c.slate],
        borderColor: c.doughnutBorder,
        borderWidth: 2,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "64%",
      animation: base.animation,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: c.text,
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            pointStyle: "circle",
            font: { size: 10, weight: "600" },
            padding: 10
          }
        },
        tooltip: base.plugins.tooltip
      }
    }
  });
}

function syncLandingOverlayDemoCharts(section){
  destroyLandingOverlayCharts();
  const paint = () => {
    if (!window.Chart) return;
    if (section === "about") {
      buildLandingAboutDemoCharts();
    } else if (section === "features") {
      buildLandingFeaturesDemoCharts();
    } else if (section === "services") {
      buildLandingServicesDemoCharts();
    } else if (section === "security") {
      buildLandingSecurityDemoCharts();
    }
  };
  if (window.Chart) {
    paint();
    return;
  }
  if (typeof ensureChartLibLoaded === "function") {
    ensureChartLibLoaded().then(ok => { if (ok) paint(); });
  }
}

function landingDemoChartPalette(){
  const styles = getComputedStyle(document.documentElement);
  const read = (name, fallback) => String(styles.getPropertyValue(name) || "").trim() || fallback;
  const series = Array.from({ length: 8 }, (_, index) => read(`--chart-series-${index + 1}`, read("--primary", "")));
  const text = read("--text", "");
  const muted = read("--chart-axis", read("--muted", ""));
  return {
    text,
    muted,
    primary: series[0],
    primarySoft: read("--primary-soft", ""),
    success: read("--success", series[1]),
    successSoft: read("--success-soft", ""),
    warning: read("--warning", series[2]),
    warningSoft: read("--warning-soft", ""),
    slate: series[7] || muted,
    series4: series[3] || read("--info", series[0]),
    grid: read("--chart-grid", read("--line", "")),
    tooltipBg: read("--chart-tooltip-bg", read("--surface-elevated", "")),
    tooltipText: read("--chart-tooltip-text", text),
    doughnutBorder: read("--chart-border", read("--surface", "")),
    danger: read("--danger", series[5]),
    series
  };
}

function landingDemoBaseOptions(c){
  const reduceMotion = typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: reduceMotion ? false : { duration: 520, easing: "easeOutQuart" },
    plugins: {
      legend: {
        labels: {
          color: c.text,
          boxWidth: 10,
          boxHeight: 10,
          usePointStyle: true,
          pointStyle: "circle",
          font: { size: 11, weight: "600" }
        }
      },
      tooltip: {
        backgroundColor: c.tooltipBg,
        titleColor: c.tooltipText,
        bodyColor: c.tooltipText,
        cornerRadius: 8,
        padding: 10,
        displayColors: true,
        titleFont: { size: 11, weight: "700" },
        bodyFont: { size: 11 }
      }
    },
    scales: {
      x: {
        grid: { color: c.grid, drawBorder: false },
        ticks: { color: c.muted, font: { size: 10, weight: "600" }, maxRotation: 0, autoSkip: true }
      },
      y: {
        beginAtZero: true,
        grid: { color: c.grid, drawBorder: false },
        ticks: { color: c.muted, font: { size: 10, weight: "600" } }
      }
    }
  };
}

function createLandingDemoChart(canvas, config){
  if (!canvas || !window.Chart) return null;
  const existing = window.Chart.getChart?.(canvas);
  if (existing) existing.destroy();
  const chart = new window.Chart(canvas.getContext("2d"), config);
  landingDemoCharts.push(chart);
  return chart;
}

function buildLandingDemoCharts(){
  if (landingDemoChartsReady || !window.Chart) return;
  const section = document.getElementById("landingDemoAnalytics");
  if (!section || section.closest(".hide")) return;

  const c = landingDemoChartPalette();
  const base = landingDemoBaseOptions(c);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
  landingDemoCharts = [];

  createLandingDemoChart(document.getElementById("landingChartExpenses"), {
    type: "line",
    data: {
      labels: months,
      datasets: [{
        label: `Expenses (${landingRegionalCurrency()})`,
        data: landingIllustrativeValues([4200, 3850, 5100, 4600, 3900, 4450]),
        borderColor: c.primary,
        backgroundColor: c.primarySoft,
        fill: true,
        tension: 0.35,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderWidth: 2.5
      }]
    },
    options: {
      ...base,
      plugins: { ...base.plugins, legend: { display: false } }
    }
  });

  createLandingDemoChart(document.getElementById("landingChartCollections"), {
    type: "bar",
    data: {
      labels: months,
      datasets: [
        {
          label: "Invoiced",
          data: landingIllustrativeValues([8200, 9100, 8800, 10400, 11200, 12100]),
          backgroundColor: c.primarySoft,
          borderColor: c.primary,
          borderWidth: 1.5,
          borderRadius: 6,
          maxBarThickness: 22
        },
        {
          label: "Collected",
          data: landingIllustrativeValues([6400, 7800, 7200, 9100, 9800, 10900]),
          backgroundColor: c.successSoft,
          borderColor: c.success,
          borderWidth: 1.5,
          borderRadius: 6,
          maxBarThickness: 22
        }
      ]
    },
    options: {
      ...base,
      plugins: {
        ...base.plugins,
        legend: {
          ...base.plugins.legend,
          position: "bottom",
          labels: { ...base.plugins.legend.labels, padding: 12 }
        }
      }
    }
  });

  createLandingDemoChart(document.getElementById("landingChartWallet"), {
    type: "line",
    data: {
      labels: months,
      datasets: [{
        label: `Wallet balance (${landingRegionalCurrency()})`,
        data: landingIllustrativeValues([18600, 19250, 17800, 21400, 23100, 24850]),
        borderColor: c.success,
        backgroundColor: c.successSoft,
        fill: true,
        tension: 0.35,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderWidth: 2.5
      }]
    },
    options: {
      ...base,
      plugins: { ...base.plugins, legend: { display: false } },
      scales: {
        ...base.scales,
        y: { ...base.scales.y, beginAtZero: false }
      }
    }
  });

  createLandingDemoChart(document.getElementById("landingChartProfit"), {
    type: "doughnut",
    data: {
      labels: ["Inventory sales", "Services", "Other"],
      datasets: [{
        data: [48, 34, 18],
        backgroundColor: [c.primary, c.success, c.warning],
        borderColor: c.doughnutBorder,
        borderWidth: 2,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      animation: base.animation,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: c.text,
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            pointStyle: "circle",
            font: { size: 11, weight: "600" },
            padding: 12
          }
        },
        tooltip: base.plugins.tooltip
      }
    }
  });

  landingDemoChartsReady = landingDemoCharts.length > 0;
}

function initLandingDemoCharts(){
  const section = document.getElementById("landingDemoAnalytics");
  if (!section || section.dataset.chartsBound === "1") return;
  section.dataset.chartsBound = "1";

  const tryBuild = () => {
    if (landingDemoChartsReady) return;
    if (!window.Chart) return;
    const lock = document.getElementById("lockScreen");
    if (lock && lock.classList.contains("hide")) return;
    buildLandingDemoCharts();
  };

  if (typeof IntersectionObserver === "function") {
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      tryBuild();
      if (landingDemoChartsReady) observer.disconnect();
    }, { root: null, rootMargin: "80px 0px", threshold: 0.12 });
    observer.observe(section);
  }

  // Build once when landing is already in view / Chart is ready
  requestAnimationFrame(tryBuild);
  window.addEventListener("load", tryBuild, { once: true });
}

function initLandingScrollEffects(){
  const lock = document.getElementById("lockScreen");
  if (!lock || lock.dataset.landingMotionBound === "1") return;
  lock.dataset.landingMotionBound = "1";

  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const saveData = !!connection?.saveData;
  const deviceMemory = Number(navigator.deviceMemory || 0);
  const logicalCores = Number(navigator.hardwareConcurrency || 0);
  const compactViewport = window.matchMedia?.("(max-width: 620px)")?.matches;
  const lowPowerLanding = !!(saveData || (deviceMemory > 0 && deviceMemory <= 4) || (logicalCores > 0 && logicalCores <= 4));
  lock.classList.toggle("landing-low-power", lowPowerLanding);
  const reveals = lock.querySelectorAll("[data-landing-reveal]");
  const scrollRoot = lock; // landing scrolls inside #lockScreen, not the window

  const setRevealed = (el, on) => {
    el.classList.toggle("is-landing-revealed", on);
  };
  const revealList = Array.from(reveals);
  const topRevealCount = 2;

  if (reduceMotion || typeof IntersectionObserver !== "function") {
    revealList.forEach((el) => {
      el.classList.add("landing-reveal-ready");
      setRevealed(el, true);
    });
  } else {
    // Prefer explicitly marked eager sections; fallback to first two
    const topSections = revealList.filter((el) => el.hasAttribute("data-landing-reveal-eager"));
    const eagerSections = topSections.length ? topSections : revealList.slice(0, topRevealCount);
    const eagerSet = new Set(eagerSections);
    const scrollSections = revealList.filter((el) => !eagerSet.has(el));

    // One-shot reveal only (never un-reveal). Re-toggling caused image/section blink storms.
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        setRevealed(entry.target, true);
        observer.unobserve(entry.target);
      }
    }, { root: scrollRoot, rootMargin: "0px 0px -8% 0px", threshold: 0.08 });

    scrollSections.forEach((el) => observer.observe(el));

    // Top sections animate via CSS on first paint — lock end state, do not re-observe
    eagerSections.forEach((el) => {
      const arm = (evt) => {
        if (evt && evt.target !== el) return;
        if (el.classList.contains("landing-reveal-ready")) return;
        el.classList.add("landing-reveal-ready", "is-landing-revealed");
      };
      el.addEventListener("animationend", arm);
      setTimeout(() => arm(null), 1600);
    });
  }

  // Subtle Apple-like hero parallax while scrolling the landing screen (GPU-friendly)
  const parallaxHost = lock.querySelector("[data-landing-parallax]");
  const parallaxInner = parallaxHost?.querySelector(".landing-hero-marketing-inner");
  if (!parallaxInner || reduceMotion || lowPowerLanding || compactViewport) return;

  let ticking = false;
  const updateParallax = () => {
    ticking = false;
    if (lock.classList.contains("hide")) {
      parallaxInner.style.transform = "";
      parallaxInner.style.opacity = "";
      return;
    }
    const y = Math.max(0, scrollRoot.scrollTop || 0);
    const shift = Math.min(y * 0.16, 36);
    const fade = Math.max(0.78, 1 - y / 520);
    const scale = 1 - Math.min(y, 200) / 5000;
    parallaxInner.style.transform = `translate3d(0, ${shift.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
    parallaxInner.style.opacity = fade.toFixed(3);
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(updateParallax);
  };
  scrollRoot.addEventListener("scroll", onScroll, { passive: true });
  updateParallax();
}

function bindLandingAnchorScroll(){
  bindLandingContentNav();
  bindSignInOverlay();
  initLandingRegionPicker();
  applyLandingRegionalCurrency();
  if (!window.__triplemRegionalLandingBound) {
    window.__triplemRegionalLandingBound = true;
    window.addEventListener("triplem:regional-currency", () => { initLandingRegionPicker(); applyLandingRegionalCurrency(); });
  }
  initLandingDemoCharts();
  initLandingScrollEffects();
  const yearEl = document.getElementById("landingFooterYear");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
}
