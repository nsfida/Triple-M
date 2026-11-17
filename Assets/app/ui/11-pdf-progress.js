/* Triplem VIP · PDF progress (2026-11-17)
 *
 * A small bar at the bottom of the screen while a PDF is being prepared, anywhere in the app
 * (Expenses, Loans, Inventory, Installments, Bitcoin, Assets, Insurance, Accounting, …).
 *
 * How it knows:
 *  - A click on a PDF button (PDF icon, "PDF" in its label or title, data-action="pdf") starts
 *    the bar at once, while the app is still reading the data it needs.
 *  - Every PDF the app builds uses jsPDF. Creating a document, adding pages and tables move the
 *    bar on; saving the document (download) or handing it over (output) completes it.
 *  - Long exports that know their own progress (Expenses history) report exact percentages
 *    through TriplemPdfProgress.begin().
 *
 * The bar never blocks the page (pointer-events: none) and disappears by itself. A click that
 * opens a PDF menu, or that ends without a PDF (an error, a "nothing to export" message), hides
 * it again quietly.
 */
(function initTriplemPdfProgress(global){
  "use strict";
  if (global.TriplemPdfProgress) return;

  const reduce = () => { try { return global.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) { return false; } };
  let el = null, seq = 0, tick = 0;
  const jobs = new Map(); // id -> { label, pct, manual, phase, started, docs }

  function ui(){
    if (el) return el;
    el = document.createElement("div");
    el.id = "tmPdfProgress";
    el.className = "tm-pdfp";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.innerHTML = `<span class="tm-pdfp-ico" aria-hidden="true"><i class="fa-solid fa-file-pdf"></i></span>
      <span class="tm-pdfp-main"><span class="tm-pdfp-text"><b data-pdfp-label>Preparing PDF</b><small data-pdfp-pct></small></span>
      <span class="tm-pdfp-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span data-pdfp-bar></span></span></span>`;
    document.body.appendChild(el);
    return el;
  }

  function current(){
    let last = null;
    for (const j of jobs.values()) if (!last || j.started > last.started) last = j;
    return last;
  }

  function paint(){
    const j = current();
    if (!j) return;
    const root = ui();
    const pct = Math.max(1, Math.min(100, Math.round(j.pct)));
    const more = jobs.size > 1 ? ` · ${jobs.size} PDFs` : "";
    root.querySelector("[data-pdfp-label]").textContent = j.phase === "done" ? "PDF ready" : `${j.label || "Preparing PDF"}${more}`;
    root.querySelector("[data-pdfp-pct]").textContent = j.phase === "done" ? "" : `${pct}%`;
    root.querySelector("[data-pdfp-bar]").style.width = `${pct}%`;
    root.querySelector(".tm-pdfp-track").setAttribute("aria-valuenow", String(pct));
    root.classList.toggle("is-done", j.phase === "done");
    root.classList.add("is-on");
  }

  function hide(){
    if (!el) return;
    el.classList.remove("is-on", "is-done");
  }

  // Automatic jobs creep toward a ceiling that depends on how far the PDF has got, so the bar
  // always moves but never claims to be finished before the file is saved.
  function step(){
    tick = 0;
    let any = false;
    const now = Date.now();
    for (const [id, j] of jobs) {
      if (j.phase === "done") continue;
      if (!j.manual) {
        const ceiling = j.phase === "intent" ? 42 : j.phase === "building" ? 92 : 96;
        j.pct += Math.max(0.15, (ceiling - j.pct) * 0.06);
        if (j.pct > ceiling) j.pct = ceiling;
        // A click that never produced a PDF (menu, error, nothing to export) ends quietly.
        if (j.phase === "intent" && now - j.started > 20000) { jobs.delete(id); continue; }
        if (now - j.started > 180000) { jobs.delete(id); continue; }
      }
      any = true;
    }
    if (!jobs.size) { hide(); return; }
    paint();
    if (any) tick = setTimeout(step, reduce() ? 400 : 160);
  }
  function run(){ if (!tick) tick = setTimeout(step, 120); }

  function begin(label, { manual = false, phase = "intent" } = {}){
    // An export that reports its own progress replaces the bar its click started.
    if (manual) for (const [k, j] of jobs) if (!j.manual && j.phase === "intent") jobs.delete(k);
    const id = ++seq;
    jobs.set(id, { id, label: label || "Preparing PDF", pct: manual ? 2 : 6, manual, phase, started: Date.now(), docs: 0 });
    // Show after a short moment so instant PDFs do not flash an empty bar.
    setTimeout(() => { if (jobs.has(id)) { paint(); run(); } }, manual ? 0 : 140);
    return id;
  }
  function finish(id, { ok = true } = {}){
    const j = jobs.get(id);
    if (!j) return;
    if (!ok) { jobs.delete(id); if (!jobs.size) hide(); else paint(); return; }
    j.phase = "done"; j.pct = 100;
    paint();
    setTimeout(() => {
      jobs.delete(id);
      if (jobs.size) paint(); else hide();
    }, 1400);
  }

  // The newest unfinished automatic job, or a new one (a PDF built without a click: shortcut, AI…).
  function autoJob(create){
    let best = null;
    for (const j of jobs.values()) if (!j.manual && j.phase !== "done" && (!best || j.started > best.started)) best = j;
    if (best || !create) return best;
    const id = begin("Preparing PDF", { phase: "building" });
    return jobs.get(id);
  }
  function manualJob(){
    let best = null;
    for (const j of jobs.values()) if (j.manual && j.phase !== "done" && (!best || j.started > best.started)) best = j;
    return best;
  }

  // ── jsPDF ──────────────────────────────────────────────────────────────────────────────
  function instrument(doc){
    if (!doc || doc.__tmPdfp) return doc;
    doc.__tmPdfp = true;
    // Only a document that really grows into a report moves the bar: a jsPDF used just to
    // measure text never shows anything.
    let job = null;
    const touch = (bump) => {
      if (!job || !jobs.has(job.id)) job = manualJob() || autoJob(true);
      if (!job) return;
      if (!job.manual) {
        if (job.phase === "intent") { job.phase = "building"; job.pct = Math.max(job.pct, 45); }
        job.pct = Math.min(94, job.pct + bump);
        paint(); run();
      }
    };
    const wrap = (name, fn) => {
      const orig = doc[name];
      if (typeof orig !== "function") return;
      doc[name] = function(){ fn.apply(this, arguments); return orig.apply(this, arguments); };
    };
    wrap("addPage", () => touch(4));
    wrap("autoTable", () => touch(3));
    wrap("addImage", () => touch(1));
    const done = () => {
      const j = (job && jobs.has(job.id) && jobs.get(job.id)) || manualJob() || autoJob(false);
      if (!j) return;
      if (j.manual) { j.pct = Math.max(j.pct, 99); paint(); return; } // the export finishes it
      finish(j.id);
    };
    const origSave = doc.save;
    if (typeof origSave === "function") {
      doc.save = function(){
        const r = origSave.apply(this, arguments);
        if (r && typeof r.then === "function") r.then(done, done); else done();
        return r;
      };
    }
    const origOutput = doc.output;
    if (typeof origOutput === "function") {
      doc.output = function(type){
        const r = origOutput.apply(this, arguments);
        // Output used for a download, preview, print or attachment = the PDF is ready.
        if (type && /blob|bloburl|datauristring|dataurlstring|arraybuffer|dataurlnewwindow|pdfobjectnewwindow|pdfjsnewwindow/i.test(String(type))) done();
        return r;
      };
    }
    // A job that already exists (the click) moves into "building" as soon as the document exists.
    const pending = manualJob() || autoJob(false);
    if (pending && !pending.manual && pending.phase === "intent") { pending.phase = "building"; pending.pct = Math.max(pending.pct, 45); job = pending; paint(); run(); }
    return doc;
  }

  function patchJsPdf(){
    const ns = global.jspdf;
    const Orig = ns && ns.jsPDF;
    if (!Orig || Orig.__tmPdfp) return !!Orig;
    function jsPDF(){
      const doc = new Orig(...arguments);
      try { instrument(doc); } catch (_) {}
      return doc;
    }
    try {
      Object.setPrototypeOf(jsPDF, Orig);
      jsPDF.prototype = Orig.prototype;
      Object.defineProperty(jsPDF, "__tmPdfp", { value: true });
      ns.jsPDF = jsPDF;
      if (global.jsPDF === Orig) global.jsPDF = jsPDF;
    } catch (_) { return false; }
    return true;
  }
  let tries = 0;
  (function waitForLib(){
    if (patchJsPdf()) return;
    if (++tries < 240) setTimeout(waitForLib, 250);
  })();
  global.addEventListener("load", patchJsPdf);

  // ── PDF buttons ────────────────────────────────────────────────────────────────────────
  const PDF_WORD = /(^|[^a-z])pdf([^a-z]|$)/i;
  function isPdfTrigger(btn){
    if (!btn || btn.disabled) return false;
    if (btn.closest("#tmPdfProgress")) return false;
    if (btn.getAttribute("aria-haspopup") === "true" || btn.getAttribute("aria-haspopup") === "menu") return false;
    const action = String(btn.dataset.action || "");
    if (action === "pdf-menu" || btn.hasAttribute("data-pdf-menu") || btn.hasAttribute("data-no-pdf-progress")) return false;
    if (action === "pdf" || btn.hasAttribute("data-pdf-progress")) return true;
    // A row or card that merely contains PDF buttons (a list row, a menu) is not itself one.
    if (btn.querySelector("button, a, [role=menuitem], select, input")) return false;
    if (btn.querySelector(":scope > .fa-file-pdf, :scope > * > .fa-file-pdf")) return true;
    for (const [name, value] of Object.entries(btn.dataset)) {
      if (/menu/i.test(name)) continue;
      if (/pdf/i.test(name) || String(value).toLowerCase() === "pdf") return true;
    }
    const words = `${btn.getAttribute("title") || ""} ${btn.getAttribute("aria-label") || ""} ${btn.textContent || ""}`;
    return PDF_WORD.test(words) && !/print/i.test(words) && words.length < 140;
  }
  document.addEventListener("click", e => {
    const btn = e.target.closest?.("button, a, [role=button], [role=menuitem]");
    if (!isPdfTrigger(btn)) return;
    // One click → one job (double clicks reuse the running one).
    const open = autoJob(false);
    if (open && Date.now() - open.started < 1500) return;
    begin("Preparing PDF");
  }, true);

  // A message box or an error while a click is still waiting for its PDF means there will be
  // no PDF (for example "No transactions found"): end the waiting bar.
  const cancelWaiting = () => {
    for (const [id, j] of jobs) if (!j.manual && j.phase === "intent") jobs.delete(id);
    if (!jobs.size) hide(); else paint();
  };
  ["alert", "confirm"].forEach(name => {
    const orig = global[name];
    if (typeof orig !== "function" || orig.__tmPdfp) return;
    const wrapped = function(){ cancelWaiting(); return orig.apply(this, arguments); };
    wrapped.__tmPdfp = true;
    try { global[name] = wrapped; } catch (_) {}
  });
  global.addEventListener("unhandledrejection", cancelWaiting);

  global.TriplemPdfProgress = Object.freeze({
    /** Exact progress for long exports: returns { update(percent, message), finish(ok) }. */
    begin(label){
      const id = begin(label || "Preparing PDF", { manual: true, phase: "building" });
      return {
        update(percent, message){
          const j = jobs.get(id); if (!j || j.phase === "done") return;
          j.pct = Math.max(j.pct, Math.min(99, Number(percent) || 0));
          paint();
        },
        finish(ok = true){ finish(id, { ok }); }
      };
    },
    patch: patchJsPdf,
    isBusy: () => jobs.size > 0
  });
})(typeof window !== "undefined" ? window : globalThis);
