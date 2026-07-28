/* Modularized from script.js lines 27707-28569 — landing page. Load order must be preserved. */
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
  return !!(
    (inquiry && !inquiry.classList.contains("hide")) ||
    (ios && !ios.classList.contains("hide")) ||
    (android && !android.classList.contains("hide")) ||
    (trial && !trial.classList.contains("hide"))
  );
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
  const overlay = document.getElementById("landingContentOverlay");
  if (!meta || !overlay || state.unlocked) return;

  setLandingMobileMenuOpen(false);

  const titleEl = document.getElementById("landingContentTitle");
  const kickerEl = document.getElementById("landingContentKicker");
  if (titleEl) titleEl.textContent = meta.title;
  if (kickerEl) kickerEl.textContent = meta.kicker;

  overlay.querySelectorAll("[data-landing-panel]").forEach(panel => {
    const match = panel.getAttribute("data-landing-panel") === section;
    panel.classList.toggle("hide", !match);
    panel.hidden = !match;
  });

  overlay.classList.remove("hide");
  overlay.hidden = false;
  overlay.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => overlay.classList.add("is-open"));

  if (els.lockScreen) els.lockScreen.classList.add("landing-overlay-open");
  syncLandingNavActive(section);

  if (!options.fromHash) {
    history.replaceState(null, "", `#${meta.hash}`);
  } else if (window.location.hash.replace(/^#/, "").toLowerCase() !== meta.hash) {
    history.replaceState(null, "", `#${meta.hash}`);
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

  const closeBtn = document.getElementById("landingContentCloseBtn");
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

  overlay.classList.remove("is-open");
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
  if (options.clearHash !== false && resolveLandingSection(hash)) {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }

  if (options.focusLogin !== false) focusUnlockForm();
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
      closeLandingContentOverlay({ clearHash: true });
      focusUnlockForm();
      return;
    }

    const home = e.target.closest("[data-landing-home]");
    if (home) {
      e.preventDefault();
      setLandingMobileMenuOpen(false);
      closeLandingContentOverlay({ clearHash: true });
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
        closeLandingContentOverlay({ clearHash: true });
        if (hash === "#login") focusUnlockForm();
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
          data: [2100, 1980, 2450, 2320, 2180, 2560],
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
          data: [980, 1120, 1040, 1280, 1190, 1350],
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
        backgroundColor: [c.primary, c.success, c.warning, "#0f766e", c.slate],
        borderColor: "#ffffff",
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
        backgroundColor: [c.primary, c.warning, c.success, "#0f766e", c.slate],
        borderColor: "#ffffff",
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
        label: "Stock value (AED k)",
        data: [28.4, 11.2, 8.6],
        backgroundColor: [c.successSoft, "rgba(181,71,8,.18)", "rgba(102,112,133,.18)"],
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
          data: [9200, 10100, 9800, 11200, 12050, 12800],
          backgroundColor: c.successSoft,
          borderColor: c.success,
          borderWidth: 1.5,
          borderRadius: 6,
          maxBarThickness: 18
        },
        {
          label: "Money out",
          data: [6400, 7100, 6900, 7600, 8200, 7900],
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
        backgroundColor: [c.primary, c.success, c.warning, "#0f766e", c.slate],
        borderColor: "#ffffff",
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
        backgroundColor: [c.primary, c.success, "#0f766e", c.warning, c.slate],
        borderColor: "#ffffff",
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
}

function landingDemoChartPalette(){
  return {
    text: "#17212b",
    muted: "#667085",
    primary: "#2457d6",
    primarySoft: "rgba(36,87,214,.16)",
    success: "#067647",
    successSoft: "rgba(6,118,71,.14)",
    warning: "#b54708",
    warningSoft: "rgba(181,71,8,.14)",
    slate: "#475467",
    grid: "rgba(208,213,221,.38)"
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
        backgroundColor: "rgba(23,33,43,.92)",
        titleColor: "#fff",
        bodyColor: "#fff",
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
        label: "Expenses (AED)",
        data: [4200, 3850, 5100, 4600, 3900, 4450],
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
          data: [8200, 9100, 8800, 10400, 11200, 12100],
          backgroundColor: c.primarySoft,
          borderColor: c.primary,
          borderWidth: 1.5,
          borderRadius: 6,
          maxBarThickness: 22
        },
        {
          label: "Collected",
          data: [6400, 7800, 7200, 9100, 9800, 10900],
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
        label: "Wallet balance (AED)",
        data: [18600, 19250, 17800, 21400, 23100, 24850],
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
        borderColor: "#ffffff",
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

function bindLandingAnchorScroll(){
  bindLandingContentNav();
  initLandingDemoCharts();
  const yearEl = document.getElementById("landingFooterYear");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
}
