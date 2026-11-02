"use strict";

(function initTriplemAppDownloads(){
  const overlay = document.getElementById("appDownloadHubOverlay");
  const accountButton = document.getElementById("downloadAppBtn");
  const windowsButton = document.getElementById("windowsDownloadBtn");
  const closeButton = document.getElementById("closeAppDownloadHubBtn");
  const tabs = Array.from(document.querySelectorAll("[data-app-platform]"));
  const panels = Array.from(document.querySelectorAll("[data-app-panel]"));
  if (!overlay || !tabs.length || !panels.length) return;

  function preferredPlatform(){
    const ua = String(navigator.userAgent || navigator.platform || "").toLowerCase();
    if (/android/.test(ua)) return "android";
    if (/iphone|ipad|ipod/.test(ua)) return "ios";
    return "windows";
  }

  function selectPlatform(platform){
    const key = ["android", "ios", "windows"].includes(platform) ? platform : preferredPlatform();
    tabs.forEach(tab => {
      const active = tab.dataset.appPlatform === key;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
      tab.tabIndex = active ? 0 : -1;
    });
    panels.forEach(panel => panel.classList.toggle("hide", panel.dataset.appPanel !== key));
  }

  function closeAccountMenu(){
    const accountPanel = document.querySelector('[data-entry-menu-panel="account"]');
    if (accountPanel) accountPanel.classList.remove("open");
    const accountTrigger = document.querySelector('[data-entry-menu="account"]');
    if (accountTrigger) accountTrigger.setAttribute("aria-expanded", "false");
  }

  function openOverlay(platform){
    closeAccountMenu();
    // Keep the fixed overlay outside transformed/scrolling app containers. On mobile,
    // a transformed ancestor can otherwise make position:fixed behave like absolute.
    if (overlay.parentElement !== document.body) document.body.appendChild(overlay);
    selectPlatform(platform || preferredPlatform());
    document.documentElement.classList.add("triplem-apps-open");
    document.body.classList.add("triplem-apps-open");
    overlay.classList.remove("hide");
    overlay.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => closeButton?.focus());
  }

  function closeOverlay(){
    overlay.classList.add("hide");
    overlay.setAttribute("aria-hidden", "true");
    document.documentElement.classList.remove("triplem-apps-open");
    document.body.classList.remove("triplem-apps-open");
  }

  tabs.forEach(tab => tab.addEventListener("click", () => selectPlatform(tab.dataset.appPlatform)));
  accountButton?.addEventListener("click", () => openOverlay(preferredPlatform()));
  windowsButton?.addEventListener("click", () => openOverlay("windows"));
  closeButton?.addEventListener("click", closeOverlay);
  overlay.querySelectorAll("[data-app-download-dismiss]").forEach(el => el.addEventListener("click", closeOverlay));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !overlay.classList.contains("hide")) {
      event.preventDefault();
      closeOverlay();
    }
  }, true);
})();
