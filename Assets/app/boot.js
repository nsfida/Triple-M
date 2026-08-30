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

boot();
