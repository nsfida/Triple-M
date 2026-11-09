/* Triplem VIP for Windows 3.9 - in-app PDF viewer and print preview.
 *
 * Runs only inside the Windows app (3.9+, capability "pdfview"); in browsers,
 * on phones and in older Windows apps it does nothing.
 *
 *  - Saved PDFs ("Open" on the "Saved …" notice) open here instead of another
 *    program: the real file path in an address bar, page navigation, zoom,
 *    text selection, Show in folder, Open in the default app and Print.
 *  - Print preview: the sheets exactly as they will print, with printer,
 *    copies, pages, layout, paper, margins (including custom), scale (fit,
 *    actual size or a percentage), colour and two-sided printing.
 *  - Printing the app itself (Ctrl+P, Print buttons, receipts) opens the same
 *    preview: the app prints the page to a temporary PDF with the chosen
 *    settings and shows it; changing a setting updates the preview.
 *
 * The app only hands over files it saved itself (the "Saved …" notice), PDFs
 * only, up to 40 MB. PDF.js is bundled with the site and loaded only when the
 * viewer opens; nothing runs while the viewer is closed.
 */
(() => {
  "use strict";
  if (window.TriplemPdfViewer) return;
  const kit = window.TriplemDesktop?.kit;
  if (!kit || !kit.caps.has("pdfview")) return;
  const { send, on, notice, esc, safe } = kit;

  const LIB = "Assets/app/lib/pdfjs-4.10.38/";
  const PT_TO_PX = 96 / 72;
  const MM_PER_PT = 25.4 / 72;
  const PRINT_DPI = 200;
  const PAPERS = [["a4", "A4"], ["letter", "Letter"], ["legal", "Legal"], ["a5", "A5"], ["a3", "A3"]];
  const MARGINS = [["none", "None"], ["narrow", "Narrow"], ["normal", "Normal"], ["wide", "Wide"], ["custom", "Custom…"]];
  const ZOOMS = [50, 75, 100, 125, 150, 200, 300];

  let libPromise = null;
  function loadLib() {
    if (!libPromise) {
      libPromise = import(new URL(LIB + "pdf.min.mjs", document.baseURI).href).then(lib => {
        lib.GlobalWorkerOptions.workerSrc = new URL(LIB + "pdf.worker.min.mjs", document.baseURI).href;
        return lib;
      }).catch(err => { libPromise = null; throw err; });
    }
    return libPromise;
  }

  // ---- Reading a saved file from the app ------------------------------------------------
  const reads = new Map();
  function decodeChunks(chunks) {
    const parts = chunks.map(c => atob(c));
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) { for (let i = 0; i < p.length; i += 1) out[o + i] = p.charCodeAt(i); o += p.length; }
    return out;
  }
  function readFile(id) {
    if (reads.has(id)) return reads.get(id).promise;
    const r = { chunks: [], got: 0, total: 0, meta: {} };
    r.promise = new Promise((resolve, reject) => { r.resolve = resolve; r.reject = reject; });
    r.timer = setTimeout(() => { reads.delete(id); r.reject(Object.assign(new Error("The file took too long to open."), { reason: "timeout" })); }, 60000);
    reads.set(id, r);
    send("file-read", { id });
    return r.promise;
  }
  on("file-data", msg => {
    const r = reads.get(safe(msg.id));
    const seq = Number(msg.seq);
    if (!r || !Number.isInteger(seq) || seq < 0 || typeof msg.chunk !== "string" || r.chunks[seq] !== undefined) return;
    if (seq === 0) r.meta = { name: safe(msg.name), path: safe(msg.path), size: Number(msg.size) || 0 };
    r.total = Number(msg.total) || 0;
    r.chunks[seq] = msg.chunk;
    r.got += 1;
    if (r.total > 0 && r.got >= r.total) {
      clearTimeout(r.timer);
      reads.delete(safe(msg.id));
      try { r.resolve({ ...r.meta, bytes: decodeChunks(r.chunks) }); } catch (err) { r.reject(err); }
    }
  });
  on("file-error", msg => {
    const r = reads.get(safe(msg.id));
    if (!r) return;
    clearTimeout(r.timer);
    reads.delete(safe(msg.id));
    r.reject(Object.assign(new Error("The file could not be opened."), { reason: safe(msg.reason) }));
  });

  // ---- Pure layout helpers (also used by the tests) ---------------------------------------
  function paperMm(key, orientation, firstPage) {
    let w; let h;
    if (key === "pdf" || !kit.PAPER_MM[key]) {
      w = (firstPage?.w || 595.28) * MM_PER_PT;
      h = (firstPage?.h || 841.89) * MM_PER_PT;
      return [w, h];
    }
    [w, h] = kit.PAPER_MM[key];
    const landscape = orientation === "landscape" || (orientation === "auto" && firstPage && firstPage.w > firstPage.h);
    return landscape ? [h, w] : [w, h];
  }
  function marginsMm(o) {
    if (o.margins === "custom" && Array.isArray(o.marginMm)) return o.marginMm.map(v => Math.max(0, Math.min(60, Number(v) || 0)));
    const m = kit.MARGIN_MM[o.margins];
    return [m ?? 0, m ?? 0, m ?? 0, m ?? 0];
  }
  // Where a PDF page (size in points) goes on a sheet: all values in mm.
  function placePage(page, sheet, margins, scaleMode, scalePct) {
    const [t, r, b, l] = margins;
    const area = { x: l, y: t, w: Math.max(1, sheet[0] - l - r), h: Math.max(1, sheet[1] - t - b) };
    const pw = page.w * MM_PER_PT;
    const ph = page.h * MM_PER_PT;
    let s = 1;
    if (scaleMode === "fit") s = Math.min(area.w / pw, area.h / ph);
    else if (scaleMode === "custom") s = Math.max(0.1, Math.min(2, (Number(scalePct) || 100) / 100));
    const w = pw * s;
    const h = ph * s;
    const x = w <= area.w ? (area.w - w) / 2 : 0;
    const y = scaleMode === "fit" && h <= area.h ? (area.h - h) / 2 : 0;
    return { area, img: { x, y, w, h }, scale: s };
  }
  function pageList(spec, count) {
    const all = Array.from({ length: count }, (_, i) => i + 1);
    const p = safe(spec).trim();
    if (!p) return all;
    if (!kit.validPages(p)) return null;
    const set = new Set();
    for (const part of p.replace(/\s/g, "").split(",")) {
      const [a, b = a] = part.split("-").map(Number);
      for (let i = a; i <= Math.min(b, count); i += 1) set.add(i);
    }
    return [...set].sort((x, y) => x - y);
  }
  function formatSize(n) {
    if (!(n > 0)) return "";
    if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  // ---- Styles ----------------------------------------------------------------------------
  function ensureStyles() {
    if (document.getElementById("triplemPdfViewerStyles")) return;
    const style = document.createElement("style");
    style.id = "triplemPdfViewerStyles";
    style.textContent = `
      .dpv-root{position:fixed;inset:0;z-index:2147482000;display:flex;flex-direction:column;background:var(--bg,#eef2f7);color:var(--text,#17212b);font-size:.86rem;
        --dpv-bar:var(--panel,#fff);--dpv-line:var(--line,rgba(71,85,105,.18));--dpv-muted:var(--muted,#667085);--dpv-primary:var(--primary,#2457d6);
        --dpv-stage:color-mix(in srgb,var(--text,#17212b) 9%,var(--bg,#eef2f7))}
      .dpv-root *{box-sizing:border-box}
      .dpv-root [hidden]{display:none!important}
      .dpv-bar{display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--dpv-bar);border-bottom:1px solid var(--dpv-line);min-width:0;flex-wrap:wrap}
      .dpv-title{display:flex;align-items:center;gap:8px;min-width:0;flex:0 1 auto;font-weight:700}
      .dpv-title i{color:#dc2626;font-size:1.05rem}
      .dpv-title span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:30vw}
      .dpv-address{flex:1 1 280px;min-width:180px;display:flex;align-items:center;gap:6px;height:34px;padding:0 4px 0 10px;border:1px solid var(--dpv-line);border-radius:10px;
        background:var(--control-bg,color-mix(in srgb,var(--text,#17212b) 4%,var(--dpv-bar)))}
      .dpv-address i{color:var(--dpv-muted);font-size:.8rem}
      .dpv-address input{flex:1;min-width:0;border:0;background:transparent;color:inherit;font:inherit;font-size:.8rem;font-family:ui-monospace,Consolas,monospace;outline:none;text-overflow:ellipsis}
      .dpv-tools{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
      .dpv-btn{font:inherit;font-size:.8rem;font-weight:600;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;min-width:32px;padding:0 10px;border-radius:9px;
        border:1px solid var(--dpv-line);background:var(--dpv-bar);color:inherit;cursor:pointer;white-space:nowrap}
      .dpv-btn:hover{background:color-mix(in srgb,var(--dpv-primary) 8%,var(--dpv-bar))}
      .dpv-btn:focus-visible,.dpv-root select:focus-visible,.dpv-root input:focus-visible{outline:2px solid var(--dpv-primary);outline-offset:1px}
      .dpv-btn.icon{padding:0;width:32px}
      .dpv-btn.ghost{border-color:transparent;background:transparent}
      .dpv-btn.ghost:hover{background:color-mix(in srgb,var(--text,#17212b) 7%,transparent)}
      .dpv-btn.primary{background:var(--dpv-primary);border-color:var(--dpv-primary);color:#fff}
      .dpv-btn.primary:hover{filter:brightness(1.08)}
      .dpv-btn:disabled{opacity:.55;cursor:not-allowed;filter:none}
      .dpv-sep{width:1px;height:22px;background:var(--dpv-line);margin:0 4px}
      .dpv-zoom select,.dpv-nav input{height:32px;border:1px solid var(--dpv-line);border-radius:9px;background:var(--dpv-bar);color:inherit;font:inherit;font-size:.8rem}
      .dpv-zoom select{padding:0 6px;width:118px}
      .dpv-nav{display:inline-flex;align-items:center;gap:4px;color:var(--dpv-muted);font-size:.8rem;white-space:nowrap}
      .dpv-nav input{width:52px;text-align:center;padding:0 4px;color:var(--text,#17212b)}
      .dpv-main{flex:1;min-height:0;display:flex;position:relative}
      .dpv-stage{flex:1;min-width:0;overflow:auto;background:var(--dpv-stage);position:relative;outline:none}
      .dpv-pages{display:flex;flex-direction:column;align-items:center;gap:14px;padding:18px 16px 28px;min-width:min-content}
      .dpv-page{position:relative;background:#fff;box-shadow:0 1px 3px rgba(15,23,42,.18),0 8px 24px rgba(15,23,42,.12);flex:0 0 auto}
      .dpv-page canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
      .dpv-page .dpv-pno{position:absolute;right:8px;bottom:-20px;font-size:.7rem;color:var(--dpv-muted)}
      .dpv-center{position:absolute;inset:0;display:grid;place-items:center;text-align:center;padding:24px;color:var(--dpv-muted)}
      .dpv-center .dpv-card{max-width:420px;display:grid;gap:10px;justify-items:center;background:var(--dpv-bar);border:1px solid var(--dpv-line);border-radius:16px;padding:22px 24px;color:var(--text,#17212b)}
      .dpv-center .dpv-card i.big{font-size:1.8rem;color:var(--dpv-primary)}
      .dpv-spin{width:28px;height:28px;border-radius:50%;border:3px solid color-mix(in srgb,var(--dpv-primary) 22%,transparent);border-top-color:var(--dpv-primary);animation:dpvSpin .8s linear infinite}
      @keyframes dpvSpin{to{transform:rotate(360deg)}}
      /* Text selection layer (PDF.js) */
      .dpv-page .textLayer{position:absolute;text-align:initial;inset:0;overflow:clip;opacity:1;line-height:1;-webkit-text-size-adjust:none;text-size-adjust:none;forced-color-adjust:none;transform-origin:0 0;caret-color:CanvasText;z-index:0}
      .dpv-page .textLayer :is(span,br){color:transparent;position:absolute;white-space:pre;cursor:text;transform-origin:0% 0%}
      .dpv-page .textLayer>:not(.markedContent),.dpv-page .textLayer .markedContent span:not(.markedContent){z-index:1}
      .dpv-page .textLayer span.markedContent{top:0;height:0}
      .dpv-page .textLayer ::selection{background:color-mix(in srgb,AccentColor,transparent 70%)}
      .dpv-page .textLayer br::selection{background:transparent}
      .dpv-page .textLayer .endOfContent{display:block;position:absolute;inset:100% 0 0;z-index:0;cursor:default;user-select:none}
      /* Print preview */
      .dpv-root.is-print .dpv-view-only{display:none!important}
      .dpv-root:not(.is-print) .dpv-print-only{display:none!important}
      .dpv-side{width:340px;max-width:44vw;flex:0 0 auto;display:flex;flex-direction:column;background:var(--dpv-bar);border-left:1px solid var(--dpv-line);min-height:0}
      .dpv-side-head{padding:14px 16px 8px;display:flex;align-items:baseline;justify-content:space-between;gap:8px}
      .dpv-side-head h3{margin:0;font-size:1rem;display:flex;align-items:center;gap:8px}
      .dpv-side-head span{color:var(--dpv-muted);font-size:.76rem;white-space:nowrap}
      .dpv-form{flex:1;min-height:0;overflow:auto;padding:4px 16px 12px;display:grid;gap:10px;align-content:start}
      .dpv-field{display:grid;gap:4px;min-width:0}
      .dpv-field>span{font-size:.72rem;font-weight:700;color:var(--dpv-muted);text-transform:uppercase;letter-spacing:.04em}
      .dpv-form select,.dpv-form input[type=number],.dpv-form input[type=text]{width:100%;min-width:0;height:34px;border:1px solid var(--dpv-line);border-radius:9px;padding:0 9px;
        background:var(--control-bg,var(--dpv-bar));color:inherit;font:inherit;font-size:.82rem}
      .dpv-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}
      .dpv-row4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
      .dpv-row4 label{display:grid;gap:2px;font-size:.68rem;color:var(--dpv-muted);text-align:center}
      .dpv-row4 input{text-align:center;padding:0 4px!important}
      .dpv-seg{display:flex;border:1px solid var(--dpv-line);border-radius:9px;overflow:hidden}
      .dpv-seg label{flex:1;position:relative;cursor:pointer}
      .dpv-seg input{position:absolute;opacity:0;pointer-events:none}
      .dpv-seg span{display:flex;align-items:center;justify-content:center;gap:6px;height:32px;font-size:.78rem;font-weight:600;color:var(--dpv-muted);border-left:1px solid var(--dpv-line)}
      .dpv-seg label:first-child span{border-left:0}
      .dpv-seg input:checked+span{background:color-mix(in srgb,var(--dpv-primary) 13%,transparent);color:var(--dpv-primary)}
      .dpv-seg input:focus-visible+span{outline:2px solid var(--dpv-primary);outline-offset:-2px}
      .dpv-checks{display:grid;gap:6px;font-size:.8rem}
      .dpv-checks label{display:flex;align-items:center;gap:8px;cursor:pointer}
      .dpv-error{margin:0;color:var(--danger,#dc2626);font-size:.78rem;font-weight:600}
      .dpv-foot{display:flex;gap:8px;align-items:center;justify-content:flex-end;padding:10px 16px 14px;border-top:1px solid var(--dpv-line);flex-wrap:wrap}
      .dpv-foot .dpv-link{flex:1 0 100%;text-align:left;padding:0 0 2px}
      .dpv-foot .dpv-spacer{display:none}
      .dpv-foot .dpv-btn.primary{min-width:96px}
      .dpv-link{font:inherit;font-size:.78rem;border:0;background:none;color:var(--dpv-primary);cursor:pointer;padding:4px 0;font-weight:600}
      .dpv-sheets{display:flex;flex-direction:column;align-items:center;gap:18px;padding:20px 16px 32px}
      .dpv-sheet{position:relative;background:#fff;box-shadow:0 1px 3px rgba(15,23,42,.2),0 10px 28px rgba(15,23,42,.14);flex:0 0 auto;transition:opacity .15s}
      .dpv-sheet.is-skipped{opacity:.35}
      .dpv-sheet .dpv-area{position:absolute;overflow:hidden;outline:1px dashed rgba(36,87,214,.28)}
      .dpv-sheet .dpv-area img{position:absolute;display:block;max-width:none}
      .dpv-sheet .dpv-full{position:absolute;inset:0;width:100%;height:100%;display:block}
      .dpv-sheet .dpv-sno{position:absolute;left:0;right:0;bottom:-19px;text-align:center;font-size:.7rem;color:var(--dpv-muted)}
      .dpv-sheet.is-bw img{filter:grayscale(1)}
      .dpv-updating{position:absolute;top:12px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;background:var(--dpv-bar);border:1px solid var(--dpv-line);box-shadow:0 6px 18px rgba(15,23,42,.14);font-size:.76rem;font-weight:600;z-index:2}
      .dpv-updating .dpv-spin{width:14px;height:14px;border-width:2px}
      @media (max-width:760px){.dpv-main{flex-direction:column}.dpv-side{width:auto;max-width:none;border-left:0;border-top:1px solid var(--dpv-line);max-height:52vh}.dpv-title span{max-width:46vw}}
      @media (prefers-reduced-motion:reduce){.dpv-spin{animation-duration:2s}.dpv-sheet{transition:none}}
      @media print{.dpv-root{display:none!important}}`;
    document.head.appendChild(style);
  }

  // ---- Viewer state ----------------------------------------------------------------------
  let V = null;

  function isOpen() { return !!V; }

  function shell(title, address, opts = {}) {
    ensureStyles();
    const root = document.createElement("div");
    root.className = "dpv-root";
    root.id = "triplemPdfViewer";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", opts.preview ? "Print preview" : `PDF viewer: ${title}`);
    root.tabIndex = -1;
    root.innerHTML = `
      <div class="dpv-bar">
        <div class="dpv-title"><i class="fa-solid ${opts.preview ? "fa-print" : "fa-file-pdf"}" aria-hidden="true"></i><span title="${esc(title)}">${esc(title)}</span></div>
        <div class="dpv-address" title="${esc(address)}"><i class="fa-solid ${opts.preview ? "fa-eye" : "fa-folder-open"}" aria-hidden="true"></i>
          <input type="text" readonly value="${esc(address)}" aria-label="${opts.preview ? "Preview of" : "File location"}" spellcheck="false">
          ${opts.preview ? "" : `<button type="button" class="dpv-btn icon ghost" data-dpv="copy" title="Copy file path" aria-label="Copy file path"><i class="fa-regular fa-copy" aria-hidden="true"></i></button>`}</div>
        <div class="dpv-tools">
          <span class="dpv-nav dpv-view-only"><button type="button" class="dpv-btn icon ghost" data-dpv="prev" title="Previous page (Page Up)" aria-label="Previous page"><i class="fa-solid fa-chevron-up" aria-hidden="true"></i></button>
            <input type="text" inputmode="numeric" data-dpv-page value="1" aria-label="Page number"> <span data-dpv-count>/ –</span>
            <button type="button" class="dpv-btn icon ghost" data-dpv="next" title="Next page (Page Down)" aria-label="Next page"><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button></span>
          <span class="dpv-sep dpv-view-only"></span>
          <span class="dpv-zoom dpv-view-only"><button type="button" class="dpv-btn icon ghost" data-dpv="zoom-out" title="Zoom out (Ctrl + -)" aria-label="Zoom out"><i class="fa-solid fa-minus" aria-hidden="true"></i></button>
            <select data-dpv-zoom aria-label="Zoom"><option value="width">Page width</option><option value="page">Whole page</option>${ZOOMS.map(z => `<option value="${z}">${z}%</option>`).join("")}</select>
            <button type="button" class="dpv-btn icon ghost" data-dpv="zoom-in" title="Zoom in (Ctrl + +)" aria-label="Zoom in"><i class="fa-solid fa-plus" aria-hidden="true"></i></button></span>
          ${opts.preview ? "" : `<span class="dpv-sep dpv-view-only"></span>
          <button type="button" class="dpv-btn ghost dpv-view-only" data-dpv="folder" title="Show in folder"><i class="fa-regular fa-folder-open" aria-hidden="true"></i><span>Folder</span></button>
          <button type="button" class="dpv-btn ghost dpv-view-only" data-dpv="external" title="Open in your default PDF program"><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i><span>Open with…</span></button>
          <button type="button" class="dpv-btn primary dpv-view-only" data-dpv="print" title="Print (Ctrl + P)"><i class="fa-solid fa-print" aria-hidden="true"></i><span>Print</span></button>`}
          <button type="button" class="dpv-btn icon ghost" data-dpv="close" title="Close (Esc)" aria-label="Close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
        </div>
      </div>
      <div class="dpv-main">
        <div class="dpv-stage" tabindex="0" aria-label="Pages"><div class="dpv-center"><div class="dpv-card"><div class="dpv-spin" aria-hidden="true"></div><span>${opts.preview ? "Preparing the preview…" : "Opening the PDF…"}</span></div></div></div>
        <aside class="dpv-side dpv-print-only" aria-label="Print settings"></aside>
      </div>`;
    document.body.appendChild(root);
    return root;
  }

  function stageMessage(html) {
    const stage = V?.root.querySelector(".dpv-stage");
    if (stage) stage.innerHTML = `<div class="dpv-center"><div class="dpv-card">${html}</div></div>`;
  }

  // ---- Opening ---------------------------------------------------------------------------
  async function openFile(file) {
    const id = safe(file?.id);
    if (!id) return false;
    close();
    const name = safe(file.name) || "Document.pdf";
    const path = safe(file.path) || name;
    V = newState({ source: "file", file: { id, name, path, size: Number(file.size) || 0 }, title: name, address: path });
    V.root = shell(name, path, {});
    bind();
    try {
      const [data, lib] = await Promise.all([readFile(id), loadLib()]);
      if (!V || V.file?.id !== id) return true;
      if (data.path) { V.file.path = data.path; V.root.querySelector(".dpv-address input").value = data.path; V.root.querySelector(".dpv-address").title = data.path; }
      await loadDocument(lib, data.bytes);
      if (V?.file?.id === id) renderView();
    } catch (err) {
      if (!V || V.file?.id !== id) return true;
      const reason = safe(err?.reason);
      if (reason === "size") {
        stageMessage(`<i class="fa-solid fa-file-pdf big" aria-hidden="true"></i><strong>This PDF is too large to show here</strong><span>Open it in your PDF program instead.</span><button type="button" class="dpv-btn primary" data-dpv="external">Open with…</button>`);
      } else if (reason === "missing") {
        stageMessage(`<i class="fa-solid fa-circle-exclamation big" aria-hidden="true"></i><strong>The file was moved or deleted</strong><span>${esc(path)}</span>`);
      } else {
        stageMessage(`<i class="fa-solid fa-circle-exclamation big" aria-hidden="true"></i><strong>This PDF could not be shown</strong><span>You can still open it in your PDF program.</span><button type="button" class="dpv-btn primary" data-dpv="external">Open with…</button>`);
        if (reason !== "type") console.warn("PDF viewer:", err);
      }
    }
    return true;
  }

  // Print preview of the app itself (Ctrl+P, Print buttons, receipts).
  function openPagePreview(context = {}) {
    close();
    const title = safe(context.title || document.title || "Triplem VIP");
    V = newState({ source: "page", ctx: { ...context, title }, title: "Print preview", address: title });
    V.root = shell("Print preview", title, { preview: true });
    V.mode = "print";
    V.root.classList.add("is-print");
    V.opts = initialOptions(null);
    bind();
    renderSide();
    requestPagePreview();
    if (!kit.printInfo()) kit.requestPrintInfo();
    return true;
  }

  function newState(extra) {
    return {
      source: "file", file: null, ctx: null, doc: null, lib: null, pages: [], zoom: "width", current: 1,
      mode: "view", opts: null, thumbs: new Map(), observer: null, pageEls: [], sheetEls: [],
      gen: 0, busy: false, pending: false, printing: false, cleanups: [], returnFocus: document.activeElement, ...extra
    };
  }

  async function loadDocument(lib, bytes) {
    V.lib = lib;
    const task = lib.getDocument({
      data: bytes,
      isEvalSupported: false,
      enableXfa: false,
      useSystemFonts: true,
      standardFontDataUrl: new URL(LIB + "standard_fonts/", document.baseURI).href,
      cMapUrl: new URL(LIB + "cmaps/", document.baseURI).href,
      cMapPacked: true
    });
    const doc = await task.promise;
    if (!V) { doc.destroy(); return; }
    if (V.doc) { try { V.doc.destroy(); } catch (_) {} }
    V.doc = doc;
    V.thumbs.forEach(url => URL.revokeObjectURL(url));
    V.thumbs.clear();
    const sizes = await Promise.all(Array.from({ length: doc.numPages }, (_, i) => doc.getPage(i + 1).then(p => {
      const vp = p.getViewport({ scale: 1 });
      return { w: vp.width, h: vp.height };
    })));
    V.pages = sizes;
  }

  // ---- View mode -------------------------------------------------------------------------
  function zoomScale() {
    const stage = V.root.querySelector(".dpv-stage");
    const maxW = Math.max(...V.pages.map(p => p.w), 1);
    const maxH = Math.max(...V.pages.map(p => p.h), 1);
    const availW = Math.max(200, stage.clientWidth - 40);
    const availH = Math.max(200, stage.clientHeight - 40);
    if (V.zoom === "width") return Math.min(availW / maxW, 4);
    if (V.zoom === "page") return Math.min(availW / maxW, availH / maxH);
    return (Number(V.zoom) / 100) * PT_TO_PX;
  }

  function renderView() {
    if (!V?.doc) return;
    const stage = V.root.querySelector(".dpv-stage");
    const keepRatio = stage.scrollHeight > 0 ? stage.scrollTop / stage.scrollHeight : 0;
    const scale = zoomScale();
    V.scale = scale;
    stage.innerHTML = `<div class="dpv-pages">${V.pages.map((p, i) => `<div class="dpv-page" data-page="${i + 1}" style="width:${Math.round(p.w * scale)}px;height:${Math.round(p.h * scale)}px;--scale-factor:${scale}"><span class="dpv-pno">${i + 1}</span></div>`).join("")}</div>`;
    V.pageEls = [...stage.querySelectorAll(".dpv-page")];
    V.root.querySelector("[data-dpv-count]").textContent = `/ ${V.pages.length}`;
    const zs = V.root.querySelector("[data-dpv-zoom]");
    if (zs) {
      const val = String(V.zoom);
      if (![...zs.options].some(o => o.value === val)) zs.insertAdjacentHTML("beforeend", `<option value="${esc(val)}" data-custom>${esc(val)}%</option>`);
      zs.value = val;
    }
    observe(V.pageEls, el => renderPage(el), el => releasePage(el));
    stage.scrollTop = keepRatio * stage.scrollHeight;
    if (V.returnToPage) { goPage(V.returnToPage); V.returnToPage = 0; }
  }

  function observe(els, onIn, onOut) {
    V.observer?.disconnect();
    const stage = V.root.querySelector(".dpv-stage");
    V.observer = new IntersectionObserver(entries => {
      for (const en of entries) (en.isIntersecting ? onIn : onOut)(en.target);
    }, { root: stage, rootMargin: "900px 0px" });
    els.forEach(el => V.observer.observe(el));
  }

  async function renderPage(el) {
    if (!V?.doc || el.dataset.state === "done" || el.dataset.state === "busy") return;
    el.dataset.state = "busy";
    const n = Number(el.dataset.page);
    const gen = V.gen;
    try {
      const page = await V.doc.getPage(n);
      if (!V || gen !== V.gen || !el.isConnected) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 3);
      const vp = page.getViewport({ scale: V.scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(vp.width * ratio);
      canvas.height = Math.floor(vp.height * ratio);
      const task = page.render({ canvasContext: canvas.getContext("2d", { alpha: false }), viewport: vp, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null });
      el._task = task;
      await task.promise;
      if (!V || gen !== V.gen || !el.isConnected || el.dataset.state !== "busy") return;
      el.querySelector("canvas")?.remove();
      el.prepend(canvas);
      const layer = document.createElement("div");
      layer.className = "textLayer";
      el.querySelector(".textLayer")?.remove();
      el.appendChild(layer);
      el.dataset.state = "done";
      try { await new V.lib.TextLayer({ textContentSource: page.streamTextContent(), container: layer, viewport: vp }).render(); } catch (_) {}
    } catch (err) {
      if (el.dataset.state === "busy") el.dataset.state = "";
      if (err?.name !== "RenderingCancelledException") console.warn("PDF page render failed:", err);
    }
  }
  function releasePage(el) {
    try { el._task?.cancel?.(); } catch (_) {}
    el._task = null;
    const c = el.querySelector("canvas");
    if (c) { c.width = 0; c.height = 0; c.remove(); }
    el.querySelector(".textLayer")?.remove();
    el.dataset.state = "";
  }

  function currentPageFromScroll() {
    const stage = V.root.querySelector(".dpv-stage");
    const mid = stage.scrollTop + stage.clientHeight * 0.35;
    let cur = 1;
    for (const el of V.pageEls) { if (el.offsetTop <= mid) cur = Number(el.dataset.page); else break; }
    return cur;
  }
  function goPage(n) {
    const el = V.pageEls[Math.max(1, Math.min(V.pages.length, n)) - 1];
    if (el) V.root.querySelector(".dpv-stage").scrollTop = el.offsetTop - 16;
  }
  function setZoom(z) {
    if (!V?.doc) return;
    V.returnToPage = V.current;
    V.zoom = z;
    V.gen += 1;
    renderView();
  }
  function stepZoom(dir) {
    const cur = V.scale ? Math.round((V.scale / PT_TO_PX) * 100) : 100;
    const list = ZOOMS;
    const next = dir > 0 ? list.find(z => z > cur + 1) : [...list].reverse().find(z => z < cur - 1);
    if (next) setZoom(next);
  }

  // ---- Print preview ---------------------------------------------------------------------
  function initialOptions(firstPage) {
    const p = kit.readPrintPrefs();
    const o = {
      printer: p.printer || "", copies: 1, pages: "", pagesMode: "all",
      orientation: V?.source === "file" ? "auto" : (p.orientation === "landscape" ? "landscape" : "portrait"),
      paper: PAPERS.some(([k]) => k === p.paper) ? p.paper : "a4",
      margins: ["none", "narrow", "normal", "wide", "custom"].includes(p.margins) ? p.margins : (V?.source === "file" ? "none" : "default"),
      marginMm: Array.isArray(p.marginMm) && p.marginMm.length === 4 ? p.marginMm.map(Number) : [10, 10, 10, 10],
      color: p.color || "default", duplex: p.duplex || "default",
      scaleMode: "fit", scale: Number(p.scale) || 100,
      backgrounds: p.backgrounds !== false, headers: p.headers === true
    };
    if (V?.source === "file") {
      // A PDF that already has its own paper size prints on that size by default.
      const match = firstPage && PAPERS.find(([k]) => {
        const [w, h] = kit.PAPER_MM[k];
        const pw = firstPage.w * MM_PER_PT; const ph = firstPage.h * MM_PER_PT;
        return (Math.abs(pw - w) < 3 && Math.abs(ph - h) < 3) || (Math.abs(pw - h) < 3 && Math.abs(ph - w) < 3);
      });
      o.paper = match ? match[0] : "pdf";
      if (match) o.margins = "none";
      o.scaleMode = match ? "actual" : "fit";
    } else {
      o.scaleMode = o.scale === 100 ? "default" : "custom";
    }
    return o;
  }

  function sideHtml() {
    const o = V.opts;
    const file = V.source === "file";
    const info = kit.printInfo();
    const printers = info?.printers || [];
    const def = info?.default || "";
    const opt = (v, t, cur) => `<option value="${esc(v)}"${String(cur) === String(v) ? " selected" : ""}>${esc(t)}</option>`;
    const floats = info ? info.floats !== false : window.__TRIPLEM_DESKTOP__?.arch !== "arm64";
    const papers = (file ? [["pdf", "Same as the PDF"]] : []).concat(PAPERS);
    const margins = (file ? [] : [["default", "Default"]]).concat(MARGINS);
    const scales = file ? [["fit", "Fit to printable area"], ["actual", "Actual size"], ["custom", "Custom"]] : (floats ? [["default", "Default (100%)"], ["custom", "Custom"]] : []);
    const count = V.pages.length;
    return `
      <div class="dpv-side-head"><h3><i class="fa-solid fa-print" aria-hidden="true"></i> Print</h3><span data-dpv-sheets>${count ? `${count} page${count === 1 ? "" : "s"}` : ""}</span></div>
      <form class="dpv-form" novalidate>
        <label class="dpv-field"><span>Printer</span><select name="printer">${[opt("", def ? `Default printer (${def})` : "Default printer", o.printer)].concat(printers.map(p => opt(p, p, o.printer))).join("")}</select></label>
        <div class="dpv-row">
          <label class="dpv-field"><span>Copies</span><input name="copies" type="number" min="1" max="99" step="1" value="${esc(o.copies)}"></label>
          <label class="dpv-field"><span>Pages</span><select name="pagesMode">${opt("all", "All", o.pagesMode)}${opt("custom", "Custom", o.pagesMode)}</select></label>
        </div>
        <label class="dpv-field" ${o.pagesMode === "custom" ? "" : "hidden"} data-dpv-pages><span>Page range</span><input name="pages" type="text" placeholder="e.g. 1-3, 5" value="${esc(o.pages)}" autocomplete="off"></label>
        <div class="dpv-field"><span>Layout</span><div class="dpv-seg" role="radiogroup" aria-label="Layout">
          ${file ? `<label><input type="radio" name="orientation" value="auto"${o.orientation === "auto" ? " checked" : ""}><span>Auto</span></label>` : ""}
          <label><input type="radio" name="orientation" value="portrait"${o.orientation === "portrait" ? " checked" : ""}><span><i class="fa-regular fa-file" aria-hidden="true"></i>Portrait</span></label>
          <label><input type="radio" name="orientation" value="landscape"${o.orientation === "landscape" ? " checked" : ""}><span><i class="fa-regular fa-file fa-rotate-90" aria-hidden="true"></i>Landscape</span></label></div></div>
        <label class="dpv-field"><span>Paper size</span><select name="paper">${papers.map(([v, t]) => opt(v, t, o.paper)).join("")}</select></label>
        <label class="dpv-field"><span>Margins</span><select name="margins">${margins.map(([v, t]) => opt(v, t, o.margins)).join("")}</select></label>
        <div class="dpv-field" ${o.margins === "custom" ? "" : "hidden"} data-dpv-custom-margins><span>Margins (mm)</span><div class="dpv-row4">
          ${["Top", "Right", "Bottom", "Left"].map((t, i) => `<label>${t}<input name="m${i}" type="number" min="0" max="60" step="0.5" value="${esc(o.marginMm[i])}"></label>`).join("")}</div></div>
        ${scales.length ? `<div class="dpv-row"><label class="dpv-field"><span>Scale</span><select name="scaleMode">${scales.map(([v, t]) => opt(v, t, o.scaleMode)).join("")}</select></label>
          <label class="dpv-field" ${o.scaleMode === "custom" ? "" : "hidden"} data-dpv-scale><span>Percent</span><input name="scale" type="number" min="10" max="200" step="5" value="${esc(o.scale)}"></label></div>` : ""}
        <div class="dpv-row">
          <label class="dpv-field"><span>Colour</span><select name="color">${[["default", "Printer default"], ["color", "Colour"], ["bw", "Black and white"]].map(([v, t]) => opt(v, t, o.color)).join("")}</select></label>
          <label class="dpv-field"><span>Two-sided</span><select name="duplex">${[["default", "Printer default"], ["one", "Off"], ["long", "Long edge"], ["short", "Short edge"]].map(([v, t]) => opt(v, t, o.duplex)).join("")}</select></label>
        </div>
        ${file ? "" : `<div class="dpv-checks">
          <label><input type="checkbox" name="backgrounds"${o.backgrounds ? " checked" : ""}> Background colours and images</label>
          <label><input type="checkbox" name="headers"${o.headers ? " checked" : ""}> Headers and footers</label></div>`}
        <p class="dpv-error" data-dpv-error role="alert" hidden></p>
      </form>
      <div class="dpv-foot">
        <button type="button" class="dpv-link" data-dpv="system" title="Open the Windows print dialog">More settings…</button>
        <span class="dpv-spacer"></span>
        ${file ? `<button type="button" class="dpv-btn" data-dpv="back">Back</button>` : `<button type="button" class="dpv-btn" data-dpv="close">Cancel</button>`}
        ${!file && kit.caps.has("printpdf") ? `<button type="button" class="dpv-btn" data-dpv="save-pdf" title="Save as PDF"><i class="fa-solid fa-file-pdf" aria-hidden="true"></i> PDF</button>` : ""}
        <button type="button" class="dpv-btn primary" data-dpv="do-print"><i class="fa-solid fa-print" aria-hidden="true"></i> Print</button>
      </div>`;
  }

  function renderSide() {
    const side = V.root.querySelector(".dpv-side");
    side.innerHTML = sideHtml();
    const form = side.querySelector("form");
    form.addEventListener("submit", e => e.preventDefault());
    form.addEventListener("input", e => onFormChange(e, form));
    form.addEventListener("change", e => onFormChange(e, form));
  }

  function readForm(form) {
    const f = new FormData(form);
    const o = { ...V.opts };
    o.printer = safe(f.get("printer"));
    o.copies = Math.max(1, Math.min(99, Math.round(Number(f.get("copies")) || 1)));
    o.pagesMode = f.get("pagesMode") === "custom" ? "custom" : "all";
    o.pages = o.pagesMode === "custom" ? safe(f.get("pages")).trim() : "";
    o.orientation = safe(f.get("orientation") || o.orientation);
    o.paper = safe(f.get("paper") || o.paper);
    o.margins = safe(f.get("margins") || o.margins);
    o.marginMm = [0, 1, 2, 3].map(i => { const v = Number(f.get(`m${i}`)); return Number.isFinite(v) ? Math.max(0, Math.min(60, v)) : o.marginMm[i]; });
    if (f.has("scaleMode")) o.scaleMode = safe(f.get("scaleMode"));
    const sc = Number(f.get("scale"));
    if (Number.isFinite(sc) && sc > 0) o.scale = Math.round(sc);
    o.color = safe(f.get("color") || "default");
    o.duplex = safe(f.get("duplex") || "default");
    if (V.source === "page") { o.backgrounds = f.get("backgrounds") === "on"; o.headers = f.get("headers") === "on"; }
    return o;
  }

  function validate(o) {
    if (o.pagesMode === "custom" && (!o.pages || !kit.validPages(o.pages))) return "Pages must look like 1-3, 5.";
    if (o.pagesMode === "custom" && V.pages.length && !(pageList(o.pages, V.pages.length) || []).length) return `This document has ${V.pages.length} page${V.pages.length === 1 ? "" : "s"}.`;
    if (o.scaleMode === "custom" && (o.scale < 10 || o.scale > 200)) return "Scale must be between 10 and 200 %.";
    return "";
  }

  // Settings that change how the app lays out the page (preview is rebuilt).
  const LAYOUT_KEYS = ["orientation", "paper", "margins", "marginMm", "scaleMode", "scale", "backgrounds", "headers"];
  function onFormChange(e, form) {
    const before = V.opts;
    const o = readForm(form);
    const side = V.root.querySelector(".dpv-side");
    side.querySelector("[data-dpv-pages]").hidden = o.pagesMode !== "custom";
    side.querySelector("[data-dpv-custom-margins]").hidden = o.margins !== "custom";
    const sc = side.querySelector("[data-dpv-scale]");
    if (sc) sc.hidden = o.scaleMode !== "custom";
    if (e.type === "change" && e.target?.name === "pagesMode" && o.pagesMode === "custom") side.querySelector('[name="pages"]')?.focus();
    const err = validate(o);
    const box = side.querySelector("[data-dpv-error]");
    box.textContent = err;
    box.hidden = !err;
    V.opts = o;
    if (err) return;
    if (V.source === "page") {
      const changed = LAYOUT_KEYS.some(k => JSON.stringify(before[k]) !== JSON.stringify(o[k]));
      if (changed) { clearTimeout(V.regenTimer); V.regenTimer = setTimeout(requestPagePreview, e.type === "input" ? 650 : 200); }
      else markSkipped();
    } else {
      layoutSheets();
    }
  }

  function enterPrint() {
    if (!V?.doc || V.source !== "file") return;
    V.mode = "print";
    V.root.classList.add("is-print");
    if (!V.opts) V.opts = initialOptions(V.pages[0]);
    renderSide();
    if (!kit.printInfo()) kit.requestPrintInfo();
    V.gen += 1;
    buildSheets();
    setTimeout(() => V?.root.querySelector('[data-dpv="do-print"]')?.focus(), 30);
  }
  function exitPrint() {
    if (!V || V.source !== "file") return;
    V.mode = "view";
    V.root.classList.remove("is-print");
    V.gen += 1;
    V.returnToPage = V.current;
    renderView();
    V.root.focus({ preventScroll: true });
  }

  // Sheet geometry in CSS pixels for the preview column.
  function previewPxPerMm(sheetW) {
    const stage = V.root.querySelector(".dpv-stage");
    const avail = Math.max(180, Math.min(stage.clientWidth - 48, 820));
    return avail / sheetW;
  }

  function buildSheets() {
    const stage = V.root.querySelector(".dpv-stage");
    stage.innerHTML = `<div class="dpv-sheets">${V.pages.map((_, i) => `<div class="dpv-sheet" data-page="${i + 1}">${V.source === "page" ? "" : `<div class="dpv-area"></div>`}<span class="dpv-sno">${i + 1}</span></div>`).join("")}</div>`;
    V.sheetEls = [...stage.querySelectorAll(".dpv-sheet")];
    layoutSheets();
    observe(V.sheetEls, el => fillSheet(el), () => {});
    const count = V.root.querySelector("[data-dpv-sheets]");
    if (count) count.textContent = `${V.pages.length} page${V.pages.length === 1 ? "" : "s"}`;
  }

  function layoutSheets() {
    if (!V?.sheetEls.length) return;
    const o = V.opts;
    if (V.source === "page") {
      const pxmm = previewPxPerMm(Math.max(...V.pages.map(p => p.w * MM_PER_PT)));
      V.sheetEls.forEach((el, i) => {
        const p = V.pages[i];
        el.style.width = `${Math.round(p.w * MM_PER_PT * pxmm)}px`;
        el.style.height = `${Math.round(p.h * MM_PER_PT * pxmm)}px`;
      });
    } else {
      const sheet = paperMm(o.paper, o.orientation, V.pages[0]);
      const pxmm = previewPxPerMm(sheet[0]);
      const margins = marginsMm(o);
      V.sheetEls.forEach((el, i) => {
        const sh = o.paper === "pdf" ? paperMm("pdf", "", V.pages[i]) : sheet;
        const pl = placePage(V.pages[i], sh, margins, o.scaleMode, o.scale);
        el.style.width = `${Math.round(sh[0] * pxmm)}px`;
        el.style.height = `${Math.round(sh[1] * pxmm)}px`;
        const area = el.querySelector(".dpv-area");
        Object.assign(area.style, { left: `${pl.area.x * pxmm}px`, top: `${pl.area.y * pxmm}px`, width: `${pl.area.w * pxmm}px`, height: `${pl.area.h * pxmm}px` });
        area.style.outlineColor = margins.some(m => m > 0) ? "" : "transparent";
        el._place = pl;
        el._pxmm = pxmm;
        positionImg(el);
      });
    }
    V.sheetEls.forEach(el => el.classList.toggle("is-bw", o.color === "bw"));
    markSkipped();
  }

  function positionImg(el) {
    const img = el.querySelector(".dpv-area img");
    const pl = el._place;
    const k = el._pxmm;
    if (img && pl && k) Object.assign(img.style, { left: `${pl.img.x * k}px`, top: `${pl.img.y * k}px`, width: `${pl.img.w * k}px`, height: `${pl.img.h * k}px` });
  }

  function markSkipped() {
    const list = pageList(V.opts.pagesMode === "custom" ? V.opts.pages : "", V.pages.length) || [];
    const set = new Set(list);
    V.sheetEls.forEach((el, i) => el.classList.toggle("is-skipped", !set.has(i + 1)));
    const count = V.root.querySelector("[data-dpv-sheets]");
    if (count && V.pages.length) count.textContent = set.size === V.pages.length ? `${V.pages.length} page${V.pages.length === 1 ? "" : "s"}` : `${set.size} of ${V.pages.length} pages`;
  }

  async function thumbUrl(n, widthPx) {
    const key = `${n}`;
    if (V.thumbs.has(key)) return V.thumbs.get(key);
    const page = await V.doc.getPage(n);
    const vp1 = page.getViewport({ scale: 1 });
    const scale = Math.min(3, Math.max(0.5, widthPx / vp1.width));
    const vp = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    await page.render({ canvasContext: canvas.getContext("2d", { alpha: false }), viewport: vp }).promise;
    const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
    canvas.width = 0; canvas.height = 0;
    const url = URL.createObjectURL(blob);
    if (!V) { URL.revokeObjectURL(url); return ""; }
    V.thumbs.set(key, url);
    return url;
  }

  async function fillSheet(el) {
    if (!V?.doc || el.dataset.filled) return;
    el.dataset.filled = "1";
    const gen = V.gen;
    const n = Number(el.dataset.page);
    try {
      const url = await thumbUrl(n, 900 * Math.min(window.devicePixelRatio || 1, 2));
      if (!V || gen !== V.gen || !url || !el.isConnected) return;
      const img = document.createElement("img");
      img.alt = `Page ${n}`;
      img.src = url;
      if (V.source === "page") { img.className = "dpv-full"; el.prepend(img); }
      else { el.querySelector(".dpv-area").appendChild(img); positionImg(el); }
    } catch (err) {
      delete el.dataset.filled;
      console.warn("Preview page failed:", err);
    }
  }

  // ---- Page preview: the app prints the page to a temporary PDF ---------------------------
  function pagePrintOptions(o) {
    return {
      printer: o.printer, copies: o.copies, pages: o.pagesMode === "custom" ? o.pages : "",
      orientation: o.orientation === "landscape" ? "landscape" : "portrait",
      paper: o.paper, margins: o.margins, marginMm: o.marginMm, color: o.color, duplex: o.duplex,
      scale: o.scaleMode === "custom" ? o.scale : 100, backgrounds: o.backgrounds, headers: o.headers
    };
  }
  function requestPagePreview() {
    if (!V || V.source !== "page") return;
    if (V.busy) { V.pending = true; return; }
    V.busy = true;
    V.pending = false;
    showUpdating(true);
    // The preview always contains every page; the chosen pages are marked.
    kit.startPrintJob("print-preview", { ...pagePrintOptions(V.opts), pages: "", printer: "", copies: 1 }, V.ctx);
  }
  function showUpdating(on) {
    const stage = V?.root.querySelector(".dpv-stage");
    if (!stage) return;
    let tag = V.root.querySelector(".dpv-updating");
    if (on && V.doc) {
      if (!tag) { tag = document.createElement("div"); tag.className = "dpv-updating"; tag.setAttribute("role", "status"); tag.innerHTML = `<div class="dpv-spin" aria-hidden="true"></div><span>Updating preview…</span>`; V.root.querySelector(".dpv-main").appendChild(tag); }
    } else tag?.remove();
  }
  on("print-preview", async msg => {
    if (!V || V.source !== "page") return;
    if (!msg.ok) {
      if (msg.busy) { V.busy = false; setTimeout(requestPagePreview, 600); return; }
      V.busy = false;
      showUpdating(false);
      if (!V.doc) {
        // The preview cannot be made on this PC: use the simple print panel.
        const ctx = V.ctx;
        kit.previewFailed();
        closeUi();
        window.TriplemDesktop?.openPrintPanel?.({ ...ctx, classic: true });
      } else {
        notice("The preview could not be updated", "warn", [], safe(msg.error));
      }
      return;
    }
    try {
      const [data, lib] = await Promise.all([readFile(safe(msg.id)), loadLib()]);
      if (!V || V.source !== "page") return;
      await loadDocument(lib, data.bytes);
      if (!V) return;
      V.gen += 1;
      buildSheets();
      renderSideCountOnly();
    } catch (err) {
      console.warn("Print preview failed:", err);
      if (V && !V.doc) stageMessage(`<i class="fa-solid fa-circle-exclamation big" aria-hidden="true"></i><strong>The preview could not be shown</strong><button type="button" class="dpv-btn primary" data-dpv="classic">Print without preview</button>`);
    } finally {
      if (V) {
        V.busy = false;
        showUpdating(false);
        if (V.pending) requestPagePreview();
      }
    }
  });
  // The printer list arrives from Windows after the preview opened.
  on("print-info", () => {
    if (!V || V.mode !== "print") return;
    const sel = V.root.querySelector('.dpv-form [name="printer"]');
    if (!sel) return;
    const info = kit.printInfo();
    const cur = sel.value;
    const def = info?.default || "";
    sel.innerHTML = [["", def ? `Default printer (${def})` : "Default printer"]].concat((info?.printers || []).map(p => [p, p]))
      .map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join("");
    sel.value = [...sel.options].some(o => o.value === cur) ? cur : (V.opts.printer && [...sel.options].some(o => o.value === V.opts.printer) ? V.opts.printer : "");
  });

  function renderSideCountOnly() {
    const err = validate(V.opts);
    const box = V.root.querySelector("[data-dpv-error]");
    if (box) { box.textContent = err; box.hidden = !err; }
    markSkipped();
  }

  // ---- Printing --------------------------------------------------------------------------
  async function doPrint(system = false) {
    if (!V || V.printing) return;
    const form = V.root.querySelector(".dpv-form");
    const o = form ? readForm(form) : V.opts;
    const err = validate(o);
    if (err) { const box = V.root.querySelector("[data-dpv-error]"); box.textContent = err; box.hidden = false; return; }
    V.opts = o;
    kit.savePrintPrefs({ ...kit.readPrintPrefs(), printer: o.printer, orientation: o.orientation === "landscape" ? "landscape" : "portrait", paper: o.paper === "pdf" ? kit.readPrintPrefs().paper : o.paper, margins: o.margins, marginMm: o.marginMm, color: o.color, duplex: o.duplex, scale: o.scaleMode === "custom" ? o.scale : 100, backgrounds: o.backgrounds, headers: o.headers });
    if (V.source === "page") {
      const ctx = V.ctx;
      closeUi();
      if (system) kit.systemPrint();
      else kit.startPrintJob("print-run", pagePrintOptions(o), ctx);
      return;
    }
    await printFilePages(o, system);
  }

  function savePagePdf() {
    if (!V || V.source !== "page") return;
    const form = V.root.querySelector(".dpv-form");
    const o = readForm(form);
    const err = validate(o);
    if (err) return;
    const ctx = V.ctx;
    closeUi();
    kit.startPrintJob("print-pdf", pagePrintOptions(o), ctx);
  }

  async function printFilePages(o, system) {
    const list = pageList(o.pagesMode === "custom" ? o.pages : "", V.pages.length);
    if (!list?.length) return;
    V.printing = true;
    const btn = V.root.querySelector('[data-dpv="do-print"]');
    const label = btn?.innerHTML;
    const setLabel = t => { if (btn) btn.innerHTML = `<span class="dpv-spin" style="width:14px;height:14px;border-width:2px" aria-hidden="true"></span> ${esc(t)}`; };
    if (btn) btn.disabled = true;
    const urls = [];
    try {
      const margins = marginsMm(o);
      const sheets = [];
      for (let i = 0; i < list.length; i += 1) {
        setLabel(`Preparing ${i + 1} / ${list.length}`);
        const n = list[i];
        const page = await V.doc.getPage(n);
        const size = V.pages[n - 1];
        const sheet = o.paper === "pdf" ? paperMm("pdf", "", size) : paperMm(o.paper, o.orientation, V.pages[0]);
        const pl = placePage(size, sheet, margins, o.scaleMode, o.scale);
        // Render at print resolution for the size the page is printed at.
        const px = Math.min(5000, (pl.img.w / 25.4) * PRINT_DPI);
        const scale = Math.max(1, px / size.w);
        const vp = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        await page.render({ canvasContext: canvas.getContext("2d", { alpha: false }), viewport: vp, intent: "print" }).promise;
        const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
        canvas.width = 0; canvas.height = 0;
        const url = URL.createObjectURL(blob);
        urls.push(url);
        sheets.push({ sheet, pl, url });
        if (!V) return;
      }
      const host = document.createElement("div");
      const r = v => `${Math.round(v * 100) / 100}mm`;
      const first = sheets[0].sheet;
      host.innerHTML = `<style>@media print{.dpvp-sheet{position:relative;overflow:hidden;break-after:page;page-break-after:always;margin:0;padding:0}.dpvp-sheet:last-child{break-after:auto;page-break-after:auto}
          .dpvp-area{position:absolute;overflow:hidden}.dpvp-area img{position:absolute;display:block;max-width:none}${o.color === "bw" ? ".dpvp-area img{filter:grayscale(1)}" : ""}}</style>` +
        sheets.map(s => `<div class="dpvp-sheet" style="width:${r(s.sheet[0])};height:${r(s.sheet[1])}"><div class="dpvp-area" style="left:${r(s.pl.area.x)};top:${r(s.pl.area.y)};width:${r(s.pl.area.w)};height:${r(s.pl.area.h)}"><img alt="" src="${s.url}" style="left:${r(s.pl.img.x)};top:${r(s.pl.img.y)};width:${r(s.pl.img.w)};height:${r(s.pl.img.h)}"></div></div>`).join("");
      setLabel("Sending…");
      await Promise.all([...host.querySelectorAll("img")].map(img => img.decode().catch(() => {})));
      const landscape = first[0] > first[1];
      const paperKey = o.paper !== "pdf" && kit.PAPER_MM[o.paper] ? o.paper : "default";
      const pageCss = `@page{size:${r(first[0])} ${r(first[1])};margin:0}@media print{html,body{margin:0!important;padding:0!important;background:#fff!important;min-height:0!important}}`;
      const jobOpts = { printer: o.printer, copies: o.copies, pages: "", orientation: landscape ? "landscape" : "portrait", paper: paperKey, margins: "none", color: o.color, duplex: o.duplex, scale: 100, backgrounds: true, headers: false, fileName: kit.printFileName({ fileName: V.file?.name }) };
      const off = on("print-done", () => { off(); setTimeout(() => urls.forEach(u => URL.revokeObjectURL(u)), 1000); });
      kit.printPreparedHost(host, jobOpts, pageCss, system);
      if (system) {
        const after = () => { window.removeEventListener("afterprint", after); setTimeout(() => urls.forEach(u => URL.revokeObjectURL(u)), 1000); };
        window.addEventListener("afterprint", after);
      }
      exitPrint();
    } catch (err) {
      urls.forEach(u => URL.revokeObjectURL(u));
      console.warn("Printing the PDF failed:", err);
      notice("The PDF could not be printed", "error", [], "Try again, or open it with your PDF program.");
    } finally {
      if (V) {
        V.printing = false;
        if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = label; }
      }
    }
  }

  // ---- Events ----------------------------------------------------------------------------
  function bind() {
    const root = V.root;
    root.addEventListener("click", e => {
      const btn = e.target.closest("[data-dpv]");
      if (!btn || !V) return;
      const a = btn.dataset.dpv;
      if (a === "close") close();
      else if (a === "copy") copyPath();
      else if (a === "folder" && V.file) send("download-show", { id: V.file.id });
      else if (a === "external" && V.file) send("download-open", { id: V.file.id });
      else if (a === "print") enterPrint();
      else if (a === "back") exitPrint();
      else if (a === "do-print") doPrint(false);
      else if (a === "system") doPrint(true);
      else if (a === "save-pdf") savePagePdf();
      else if (a === "classic") { const ctx = V.ctx; kit.previewFailed(); closeUi(); window.TriplemDesktop?.openPrintPanel?.({ ...ctx, classic: true }); }
      else if (a === "zoom-in") stepZoom(1);
      else if (a === "zoom-out") stepZoom(-1);
      else if (a === "prev") goPage(V.current - 1);
      else if (a === "next") goPage(V.current + 1);
    });
    root.querySelector("[data-dpv-zoom]")?.addEventListener("change", e => setZoom(/^\d+$/.test(e.target.value) ? Number(e.target.value) : e.target.value));
    const pageInput = root.querySelector("[data-dpv-page]");
    pageInput?.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); goPage(Number(pageInput.value) || 1); } });
    pageInput?.addEventListener("focus", () => pageInput.select());
    const stage = root.querySelector(".dpv-stage");
    let raf = 0;
    stage.addEventListener("scroll", () => {
      if (raf || V?.mode !== "view") return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (!V?.pageEls.length) return;
        V.current = currentPageFromScroll();
        if (document.activeElement !== pageInput) pageInput.value = String(V.current);
      });
    }, { passive: true });
    stage.addEventListener("wheel", e => {
      if (!e.ctrlKey || V?.mode !== "view") return;
      e.preventDefault();
      stepZoom(e.deltaY < 0 ? 1 : -1);
    }, { passive: false });
    root.addEventListener("keydown", onKey);
    // Esc and the viewer keys also work when focus left the viewer (after printing).
    const onDocKey = e => { if (V && !root.contains(e.target)) onKey(e); };
    document.addEventListener("keydown", onDocKey);
    V.cleanups.push(() => document.removeEventListener("keydown", onDocKey));
    let resizeTimer = 0;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!V?.doc) return;
        if (V.mode === "view" && (V.zoom === "width" || V.zoom === "page")) { V.returnToPage = V.current; V.gen += 1; renderView(); }
        else if (V.mode === "print") layoutSheets();
      }, 150);
    };
    window.addEventListener("resize", onResize);
    V.cleanups.push(() => window.removeEventListener("resize", onResize));
    setTimeout(() => root.focus({ preventScroll: true }), 20);
  }

  function onKey(e) {
    if (!V) return;
    const inField = e.target instanceof Element && e.target.matches("input,select,textarea");
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (V.mode === "print" && V.source === "file") exitPrint(); else close();
      return;
    }
    if (V.mode !== "view") return;
    if (e.ctrlKey && !e.altKey && (e.key === "=" || e.key === "+")) { e.preventDefault(); stepZoom(1); return; }
    if (e.ctrlKey && !e.altKey && e.key === "-") { e.preventDefault(); stepZoom(-1); return; }
    if (e.ctrlKey && !e.altKey && e.key === "0") { e.preventDefault(); setZoom("width"); return; }
    if (inField) return;
    if (e.key === "PageDown" || (e.key === "ArrowRight" && !e.ctrlKey)) { e.preventDefault(); goPage(V.current + 1); }
    else if (e.key === "PageUp" || (e.key === "ArrowLeft" && !e.ctrlKey)) { e.preventDefault(); goPage(V.current - 1); }
    else if (e.key === "Home" && e.ctrlKey) { e.preventDefault(); goPage(1); }
    else if (e.key === "End" && e.ctrlKey) { e.preventDefault(); goPage(V.pages.length); }
  }

  async function copyPath() {
    const path = V?.file?.path || "";
    try { await navigator.clipboard.writeText(path); notice("File path copied", "success"); }
    catch (_) { const input = V?.root.querySelector(".dpv-address input"); input?.focus(); input?.select(); }
  }

  // Ctrl+P while the viewer is open.
  function printKey() {
    if (!V) return;
    if (V.source === "file" && V.mode === "view") enterPrint();
    else if (V.mode === "print") V.root.querySelector('[data-dpv="do-print"]')?.focus();
  }

  // Closes the window only (a page print may still be running).
  function closeUi() {
    if (!V) return;
    const s = V;
    V = null;
    clearTimeout(s.regenTimer);
    s.observer?.disconnect();
    s.cleanups.forEach(f => { try { f(); } catch (_) {} });
    s.thumbs.forEach(url => URL.revokeObjectURL(url));
    s.thumbs.clear();
    try { s.doc?.destroy(); } catch (_) {}
    s.root?.remove();
    try { s.returnFocus?.focus?.({ preventScroll: true }); } catch (_) {}
  }
  function close() {
    if (!V) return;
    const page = V.source === "page";
    closeUi();
    if (page) kit.finishPrint(); // the preview was cancelled: undo the print setup
  }

  window.TriplemPdfViewer = Object.freeze({
    openFile, openPagePreview, isOpen, close, printKey,
    _test: Object.freeze({ paperMm, marginsMm, placePage, pageList, decodeChunks, formatSize })
  });
})();
