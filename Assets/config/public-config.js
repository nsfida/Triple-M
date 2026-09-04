/**
 * Public runtime config (safe to expose in the browser).
 * GA4 tag is also embedded in page <head>; this ID keeps 00-analytics in sync
 * and avoids a second loader when the head tag is already present.
 */
window.TRIPLEM_PUBLIC_CONFIG = Object.assign({}, window.TRIPLEM_PUBLIC_CONFIG, {
  GA4_MEASUREMENT_ID: "G-TBKZB3FEVZ"
});
