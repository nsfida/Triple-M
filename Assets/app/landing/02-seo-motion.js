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

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      setRevealed(entry.target, entry.isIntersecting);
    }
  }, { root: null, rootMargin: "-6% 0px -12% 0px", threshold: 0.12 });

  scrollSections.forEach((el) => observer.observe(el));

  // Top sections animate via CSS on first paint — arm scroll replay after boot
  eagerSections.forEach((el) => {
    const arm = () => {
      if (el.classList.contains("seo-reveal-ready")) return;
      el.classList.add("seo-reveal-ready", "is-seo-revealed");
      observer.observe(el);
    };
    el.addEventListener("animationend", arm, { once: true });
    setTimeout(arm, 1600);
  });
})();
