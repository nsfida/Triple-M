/* SEO topic pages — scroll reveal (one-shot; no un-reveal thrash). UI only. */
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
      if (!entry.isIntersecting) continue;
      setRevealed(entry.target, true);
      observer.unobserve(entry.target);
    }
  }, { root: null, rootMargin: "0px 0px -8% 0px", threshold: 0.08 });

  scrollSections.forEach((el) => observer.observe(el));

  eagerSections.forEach((el) => {
    const arm = (evt) => {
      if (evt && evt.target !== el) return;
      if (el.classList.contains("seo-reveal-ready")) return;
      el.classList.add("seo-reveal-ready", "is-seo-revealed");
    };
    el.addEventListener("animationend", arm);
    setTimeout(() => arm(null), 1600);
  });
})();
