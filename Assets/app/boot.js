/* Modularized from script.js lines 39298-39310 — DOM ready + boot(). Load order must be preserved. */
// Initialize inquiry overlay when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initInquiryOverlay();
    initAppDownloadOverlay();
  });
} else {
  initInquiryOverlay();
  initAppDownloadOverlay();
}

(async function bootWithCurrencyRegistry(){
  try { if (window.TRIPLEM_CURRENCY_REGISTRY_READY) await window.TRIPLEM_CURRENCY_REGISTRY_READY; } catch (_) {}
  try { window.TriplemCurrencyRegistry?.hydrate?.(document); } catch (_) {}
  boot();
})();
