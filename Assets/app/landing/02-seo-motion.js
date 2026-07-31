/* SEO topic pages — scroll reveal (replays on scroll up/down). UI only. */
(function initSeoMotion(){
  if (typeof document === "undefined") return;
  const root = document.body;
  if (!root || !root.classList.contains("seo-page")) return;
  if (root.dataset.seoMotionBound === "1") return;
  root.dataset.seoMotionBound = "1";

  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const revealList = Array.from(root.querySelectorAll("[data-seo-reveal]"));
  const topRevealCount = 2;

  const setRevealed = (el, on) => {
    el.classList.toggle("is-seo-revealed", on);
  };

  if (reduceMotion || typeof IntersectionObserver !== "function") {
    revealList.forEach((el) => {
      el.classList.add("seo-reveal-ready");
      setRevealed(el, true);
    });
    return;
  }

  const marked = revealList.filter((el) => el.hasAttribute("data-seo-reveal-eager"));
  const eagerSections = marked.length ? marked : revealList.slice(0, topRevealCount);
  const eagerSet = new Set(eagerSections);
  const scrollSections = revealList.filter((el) => !eagerSet.has(el));

  const hideTimers = new WeakMap();
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const el = entry.target;
      const pending = hideTimers.get(el);
      if (entry.isIntersecting && entry.intersectionRatio > 0) {
        if (pending) {
          clearTimeout(pending);
          hideTimers.delete(el);
        }
        if (!el.classList.contains("is-seo-revealed")) setRevealed(el, true);
        continue;
      }
      if (entry.intersectionRatio > 0) continue;
      if (pending) clearTimeout(pending);
      hideTimers.set(el, setTimeout(() => {
        hideTimers.delete(el);
        setRevealed(el, false);
      }, 280));
    }
  }, { root: null, rootMargin: "0px 0px -10% 0px", threshold: [0, 0.12, 0.35] });

  scrollSections.forEach((el) => observer.observe(el));

  eagerSections.forEach((el) => {
    const arm = (evt) => {
      if (evt && evt.target !== el) return;
      if (el.classList.contains("seo-reveal-ready")) return;
      el.classList.add("seo-reveal-ready", "is-seo-revealed");
      observer.observe(el);
    };
    el.addEventListener("animationend", arm);
    setTimeout(() => arm(null), 1600);
  });
})();
