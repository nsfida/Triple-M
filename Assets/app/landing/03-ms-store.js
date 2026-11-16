/* Triplem VIP · Microsoft Store availability (2026-11-16)
 *
 * Triplem VIP for Windows is published on the Microsoft Store (Store ID 9MV028GH5NPX).
 * This file only wires the website's "Get it from Microsoft" buttons. It uses the two
 * mechanisms Microsoft documents for a Store listing; no package file is linked or hosted:
 *
 *   * Every visitor: the official listing https://apps.microsoft.com/detail/9MV028GH5NPX
 *     (works on any device; on Windows its Install button uses Microsoft's installer).
 *   * Windows 10/11 desktops: the same listing with `mode=direct`, which starts Microsoft's
 *     own Store Web Installer straight away (documented for the Microsoft Store badge), plus
 *     the ms-windows-store:// link that opens the listing in the Microsoft Store app.
 *
 * Inside the Windows apps (Setup and Store editions) the promotion is hidden: the app is
 * already installed there. Nothing here reads or writes account data.
 */
(function initTriplemMicrosoftStore(){
  "use strict";
  const PRODUCT_ID = "9MV028GH5NPX";
  const LISTING = `https://apps.microsoft.com/detail/${PRODUCT_ID}?hl=en-us&gl=AE`;
  const DIRECT = `https://apps.microsoft.com/detail/${PRODUCT_ID}?mode=direct`;
  const STORE_APP = `ms-windows-store://pdp/?ProductId=${PRODUCT_ID}`;

  function inWindowsApp(){
    const html = document.documentElement;
    return window.TRIPLEM_WINDOWS_APP === true || window.TRIPLEM_STORE_APP === true
      || html.classList.contains("triplem-windows-app") || html.classList.contains("triplem-store-app");
  }
  // Windows 10/11 desktop (not Windows phones, Xbox or a phone asking for the desktop site).
  function isWindowsDesktop(){
    try {
      const uad = navigator.userAgentData;
      if (uad && typeof uad.platform === "string" && uad.platform) return uad.platform === "Windows" && uad.mobile !== true;
    } catch (_) {}
    const ua = String(navigator.userAgent || "");
    return /Windows NT (10|11)\./.test(ua) && !/Xbox|Windows Phone|Mobile/i.test(ua);
  }

  function wire(){
    if (inWindowsApp()) {
      document.querySelectorAll("[data-ms-store-promo]").forEach(el => { el.hidden = true; });
      return;
    }
    const windows = isWindowsDesktop();
    document.documentElement.classList.toggle("msstore-windows", windows);

    document.querySelectorAll("a[data-msstore-get]").forEach(a => {
      a.href = windows ? DIRECT : LISTING;
      a.target = "_blank"; // Microsoft's page opens in a new tab; triplem.vip stays open
      a.rel = "noopener";
    });
    document.querySelectorAll("a[data-msstore-app]").forEach(a => { a.href = STORE_APP; a.hidden = !windows; });
    document.querySelectorAll("a[data-msstore-listing]").forEach(a => { a.href = LISTING; });
    document.querySelectorAll("[data-msstore-note]").forEach(n => { n.hidden = windows; });

    // Official badge artwork is served by Microsoft; if it cannot load, show a text button.
    document.querySelectorAll("img[data-msstore-badge-img]").forEach(img => {
      const fallback = () => {
        img.hidden = true;
        const alt = img.parentElement?.querySelector(".msstore-badge-fallback");
        if (alt) alt.hidden = false;
      };
      if (img.complete && img.naturalWidth === 0 && img.getAttribute("src")) fallback();
      else img.addEventListener("error", fallback, { once: true });
    });

    document.querySelectorAll("[data-msstore-copy]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const label = btn.innerHTML;
        let ok = false;
        try { await navigator.clipboard.writeText(LISTING); ok = true; } catch (_) {}
        if (!ok && navigator.share) { try { await navigator.share({ title: "Triplem VIP on the Microsoft Store", url: LISTING }); ok = true; } catch (_) {} }
        btn.innerHTML = ok ? '<i class="fa-solid fa-check" aria-hidden="true"></i> Link copied' : '<i class="fa-solid fa-link" aria-hidden="true"></i> ' + LISTING;
        setTimeout(() => { btn.innerHTML = label; }, 2400);
      });
    });

    document.querySelectorAll("a[data-msstore-scroll]").forEach(a => {
      a.addEventListener("click", e => {
        const target = document.getElementById("microsoft-store");
        if (!target || target.hidden) return;
        e.preventDefault();
        const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      });
    });
  }

  window.TriplemMicrosoftStore = Object.freeze({ PRODUCT_ID, LISTING, DIRECT, STORE_APP, isWindowsDesktop });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire, { once: true });
  else wire();
})();
