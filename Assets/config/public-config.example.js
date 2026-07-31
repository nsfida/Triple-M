/**
 * Copy to public-config.js and set values for your deployment.
 * public-config.js is loaded by the homepage (no secrets — public measurement IDs only).
 *
 * For build pipelines, you can generate public-config.js from env:
 *   TRIPLEM_GA4_MEASUREMENT_ID=G-XXXXXXXXXX
 */
window.TRIPLEM_PUBLIC_CONFIG = Object.assign({}, window.TRIPLEM_PUBLIC_CONFIG, {
  // Google Analytics 4 measurement ID (e.g. "G-XXXXXXXXXX"). Leave empty to disable.
  GA4_MEASUREMENT_ID: ""
});
