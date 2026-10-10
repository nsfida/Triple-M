/* Triplem VIP — first-party site analytics DISABLED (2026-10-10 low-log release).
 *
 * The previous tracker called the `app_site_analytics_ingest` RPC on every
 * page view, every click, every 8 s flush and every 25 s heartbeat for every
 * visitor. Each call is a Supabase API-gateway + PostgREST + Postgres log
 * line, which is what exhausted the log-ingestion quota. Google Analytics
 * (Assets/app/core/00-analytics.js) is unaffected and still available.
 *
 * The public helpers are kept as no-ops so existing callers do not break.
 */
(() => {
  "use strict";
  window.triplemTrackEvent = function triplemTrackEvent() {};
  window.triplemTrackPageview = function triplemTrackPageview() {};
})();
