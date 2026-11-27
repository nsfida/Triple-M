'use strict';

document.addEventListener('DOMContentLoaded', () => {
  // Show a clean text mark until the supplied PNG logo is added.
  document.querySelectorAll('[data-image-fallback]').forEach((container) => {
    const image = container.querySelector('img');
    if (!image) return;

    const showFallback = () => container.classList.add('is-fallback');
    image.addEventListener('error', showFallback, { once: true });

    // The load check also handles cached or already-failed local images.
    if (image.complete && image.naturalWidth === 0) showFallback();
  });

  const year = document.getElementById('current-year');
  if (year) year.textContent = new Date().getFullYear();
});
