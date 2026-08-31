/* Google Analytics 4 — head tag is primary; this only adds CTA events / fallback load. */
(function initTriplemAnalytics(){
  const cfg = window.TRIPLEM_PUBLIC_CONFIG || {};
  const id = String(cfg.GA4_MEASUREMENT_ID || cfg.ga4MeasurementId || "").trim();

  function bindCtaEvents(){
    if (window.__triplemGa4CtaBound) return;
    window.__triplemGa4CtaBound = true;
    document.addEventListener("click", (ev) => {
      const t = ev.target?.closest?.("[data-landing-trial],[data-landing-signin],a.landing-footer-link,a.seo-btn");
      if (!t || typeof window.gtag !== "function") return;
      let name = "cta_click";
      if (t.matches("[data-landing-trial]")) name = "trial_cta";
      else if (t.matches("[data-landing-signin]")) name = "signin_cta";
      window.gtag("event", name, { event_category: "engagement" });
    }, { passive: true });
  }

  // Head snippet already installed — do not inject a second Google tag.
  if (window.__triplemGa4Loaded || typeof window.gtag === "function") {
    window.__triplemGa4Loaded = true;
    bindCtaEvents();
    return;
  }

  if (!id || !/^G-[A-Z0-9]+$/i.test(id)) return;
  window.__triplemGa4Loaded = true;

  window.dataLayer = window.dataLayer || [];
  function gtag(){ window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;
  gtag("js", new Date());
  gtag("config", id, { anonymize_ip: true, send_page_view: true });

  const s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
  document.head.appendChild(s);

  bindCtaEvents();
})();
