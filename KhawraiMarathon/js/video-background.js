/* Native background-video playback. Never fetch the MP4 with fetch()/XHR:
   the browser's media pipeline can stream and buffer only the needed segments. */
(() => {
  'use strict';
  const video = document.getElementById('kmrBackgroundVideo');
  const background = document.getElementById('kmrVideoBackground');
  if (!video || !background) return;

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;

  const showFallback = () => background.classList.add('is-static');
  video.addEventListener('error', showFallback);
  video.addEventListener('playing', () => background.classList.remove('is-static'));

  if (reduceMotion) {
    video.pause();
    showFallback();
    return;
  }

  const startPlayback = () => {
    if (document.visibilityState === 'hidden') return;
    // Muted autoplay is allowed by mainstream browsers; handle policy/network failures gracefully.
    const playback = video.play();
    if (playback && typeof playback.catch === 'function') playback.catch(showFallback);
  };

  // Do not spend bandwidth playing a decorative background in a hidden tab.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') video.pause();
    else startPlayback();
  });
  window.addEventListener('pageshow', startPlayback);
  startPlayback();
})();
