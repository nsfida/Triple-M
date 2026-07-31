/**
 * Public runtime config (safe to expose in the browser).
 * Set GA4_MEASUREMENT_ID from your GA4 property, or inject via deploy env → this file.
 */
window.TRIPLEM_PUBLIC_CONFIG = Object.assign({}, window.TRIPLEM_PUBLIC_CONFIG, {
  GA4_MEASUREMENT_ID: "" // e.g. "G-XXXXXXXXXX"
});
