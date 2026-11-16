/* Triplem VIP · signed-in marker (2026-11-14).
 *
 * The themes style the signed-in app with rules that used to start with
 * `body:has(#app:not(.hide))`. Browsers re-check such a rule after every change anywhere on
 * the page, which made every panel, list and form redraw slower (about 10–15 ms each time).
 * The rules now start with `body.tm-app-on:not(#tmAppOff)` (same weight), and this file keeps
 * that class in step with the app being shown. Nothing else changes.
 */
(function initTriplemAppVisible(){
  "use strict";
  function start(){
    const app = document.getElementById("app");
    if (!app || !document.body) return;
    const sync = () => document.body.classList.toggle("tm-app-on", !app.classList.contains("hide"));
    sync();
    new MutationObserver(sync).observe(app, { attributes: true, attributeFilter: ["class"] });
  }
  if (document.getElementById("app")) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
})();
