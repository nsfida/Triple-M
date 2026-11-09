/* Triplem VIP attachment image optimiser — core (runs in a Web Worker, or on
 * the page where workers or OffscreenCanvas are missing).
 *
 * Document-safe rules (chosen from tests on receipts, scans and screenshots):
 *  - The real file type is read from the bytes, never from the name.
 *  - PDFs are never changed. SVG, GIF and unknown types are refused.
 *  - Orientation from EXIF is applied, then all metadata (GPS, camera) is
 *    dropped by re-encoding. A kept original JPEG has no EXIF at all.
 *  - Longest side at most `maxEdge` (default 3000 px). Never upscaled, never
 *    cropped, aspect ratio kept.
 *  - Photos: WebP quality 0.90 (document preset), or JPEG 0.92 where the
 *    browser cannot encode WebP.
 *  - Screenshots, text-heavy and transparent images: lossless WebP (in
 *    Chromium quality 1.0 is lossless), or PNG; lossy WebP only when the
 *    lossless file would be far larger (photographic PNGs).
 *  - The original is kept when the result would not be meaningfully smaller
 *    (and needs no rotation, resize or metadata removal).
 */
(function (root) {
  "use strict";
  const VERSION = 1;
  const QUALITY = { document: 0.9, balanced: 0.85, compact: 0.8 };
  const JPEG_QUALITY = { document: 0.92, balanced: 0.88, compact: 0.82 };
  const MAX_PIXELS = 24e6;           // after scaling (memory safety on phones)
  const MAX_SOURCE_PIXELS = 120e6;   // refuse absurd sources before decoding
  const MIN_SAVING = 0.08;           // keep the original if we save less than 8 %

  class OptimizeError extends Error { constructor(code, message) { super(message); this.code = code; } }

  function sniff(b) {
    if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
    if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
    if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
    if (b.length > 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return "application/pdf";
    if (b.length > 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
    if (b.length > 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
      const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
      if (/^(heic|heix|hevc|hevx|heim|heis|mif1|msf1|heif)$/.test(brand)) return "image/heic";
      if (/^(avif|avis)$/.test(brand)) return "image/avif";
    }
    const head = new TextDecoder().decode(b.slice(0, 256)).trimStart().toLowerCase();
    if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "image/svg+xml";
    return "";
  }

  // JPEG: EXIF orientation and whether any EXIF/XMP block exists.
  function jpegInfo(b) {
    const out = { orientation: 1, hasMeta: false, w: 0, h: 0 };
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let i = 2;
    while (i + 4 < b.length) {
      if (b[i] !== 0xff) { i += 1; continue; }
      const m = b[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      if (m === 0xda || m === 0xd9) break;
      const len = dv.getUint16(i + 2);
      if (m === 0xe1) {
        out.hasMeta = true;
        if (b[i + 4] === 0x45 && b[i + 5] === 0x78 && b[i + 6] === 0x69 && b[i + 7] === 0x66) {
          try {
            const t = i + 10; const le = b[t] === 0x49;
            const g16 = o => dv.getUint16(t + o, le); const g32 = o => dv.getUint32(t + o, le);
            const ifd = g32(4); const n = g16(ifd);
            for (let k = 0; k < n; k++) { const e = ifd + 2 + k * 12; if (g16(e) === 0x0112) out.orientation = g16(e + 8) || 1; }
          } catch (_) { /* unreadable EXIF: treated as present */ }
        }
      }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) { out.h = dv.getUint16(i + 5); out.w = dv.getUint16(i + 7); }
      i += 2 + len;
    }
    return out;
  }
  function pngInfo(b) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const out = { w: dv.getUint32(16), h: dv.getUint32(20), colorType: b[25], hasMeta: false, hasAlphaChunk: false, keep: [] };
    let i = 8;
    const critical = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "iCCP", "sBIT", "pHYs"]);
    while (i + 12 <= b.length) {
      const len = dv.getUint32(i); const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
      const end = i + 12 + len;
      if (end > b.length) break;
      if (type === "tRNS") out.hasAlphaChunk = true;
      if (critical.has(type)) out.keep.push([i, end]); else out.hasMeta = true;
      if (type === "acTL") out.animated = true;
      i = end;
      if (type === "IEND") break;
    }
    return out;
  }
  // Lossless removal of PNG text/EXIF/time chunks (pixels untouched).
  function stripPng(b, info) {
    const parts = [b.slice(0, 8), ...info.keep.map(([s, e]) => b.slice(s, e))];
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
  function webpInfo(b) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const out = { w: 0, h: 0, hasMeta: false, animated: false, alpha: false, lossless: false };
    let i = 12;
    while (i + 8 <= b.length) {
      const t = String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]); const len = dv.getUint32(i + 4, true);
      if (t === "VP8X") { const f = b[i + 8]; out.animated = !!(f & 2); out.alpha = !!(f & 16); out.w = 1 + (b[i + 12] | b[i + 13] << 8 | b[i + 14] << 16); out.h = 1 + (b[i + 15] | b[i + 16] << 8 | b[i + 17] << 16); }
      else if (t === "VP8 " && !out.w) { out.w = dv.getUint16(i + 14, true) & 0x3fff; out.h = dv.getUint16(i + 16, true) & 0x3fff; }
      else if (t === "VP8L") { out.lossless = true; if (!out.w) { const bits = dv.getUint32(i + 9, true); out.w = (bits & 0x3fff) + 1; out.h = ((bits >> 14) & 0x3fff) + 1; out.alpha = !!((bits >> 28) & 1); } }
      else if (t === "EXIF" || t === "XMP ") out.hasMeta = true;
      else if (t === "ANIM") out.animated = true;
      i += 8 + len + (len & 1);
    }
    return out;
  }

  function makeCanvas(w, h) {
    if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(w, h);
    const c = document.createElement("canvas"); c.width = w; c.height = h; return c;
  }
  async function toBlob(c, type, quality) {
    if (c.convertToBlob) return c.convertToBlob({ type, quality });
    return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new OptimizeError("encode", "The image could not be encoded."))), type, quality));
  }
  async function decode(blob, w, h) {
    // Decoded with EXIF orientation applied; large images are scaled while decoding.
    const opts = { imageOrientation: "from-image", premultiplyAlpha: "none", colorSpaceConversion: "default" };
    if (w && h) Object.assign(opts, { resizeWidth: w, resizeHeight: h, resizeQuality: "high" });
    try { return await createImageBitmap(blob, opts); } catch (_) {
      if (typeof document === "undefined") throw new OptimizeError("decode", "decode");
      // Old browsers: <img> also applies EXIF orientation.
      const url = URL.createObjectURL(blob);
      try {
        const img = new Image(); img.decoding = "async"; img.src = url; await img.decode();
        if (!w || !h) return img;
        const c = makeCanvas(w, h); const x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(img, 0, 0, w, h); return c;
      } finally { URL.revokeObjectURL(url); }
    }
  }

  // Picture analysis on a small sample: transparency and how "graphic" it is
  // (few colours / flat areas = screenshot, scan of text, line art).
  function analyse(src, w, h) {
    const sw = Math.min(256, w), sh = Math.max(1, Math.round(h * sw / w));
    const c = makeCanvas(sw, sh); const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(src, 0, 0, sw, sh);
    const d = x.getImageData(0, 0, sw, sh).data;
    let alpha = false; const colours = new Set(); let flat = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 250) alpha = true;
      colours.add((d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | (d[i + 2] >> 3));
      if (i >= 4 && Math.abs(d[i] - d[i - 4]) + Math.abs(d[i + 1] - d[i - 3]) + Math.abs(d[i + 2] - d[i - 2]) < 3) flat += 1;
    }
    const px = d.length / 4;
    return { alpha, colours: colours.size, flatRatio: flat / px, graphic: colours.size < 2200 && flat / px > 0.55 };
  }

  async function optimize(input, settings = {}, onProgress = () => {}) {
    const started = Date.now();
    const optimizeOn = settings.optimize !== false;
    const maxEdge = Math.max(1200, Math.min(6000, Number(settings.maxEdge || settings.max_edge) || 3000));
    const preset = QUALITY[settings.preset] ? settings.preset : "document";
    const maxBytes = (Number(settings.maxUploadMb || settings.max_upload_mb) || 15) * 1048576;
    const name = String(input.name || "attachment");
    const bytes = new Uint8Array(await input.arrayBuffer());
    const type = sniff(bytes);
    const base = { originalName: name, originalMime: type || input.type || "", originalSize: bytes.length, version: VERSION };
    const done = (blob, info) => ({ blob, mime: blob.type || info.mime, size: blob.size, ...base, ...info, savedBytes: Math.max(0, bytes.length - blob.size), ms: Date.now() - started });

    if (!type) throw new OptimizeError("type", "Only JPG, PNG, WebP images and PDF documents can be attached.");
    if (type === "image/svg+xml") throw new OptimizeError("type", "SVG files cannot be attached. Please use a JPG, PNG or PDF.");
    if (type === "image/gif") throw new OptimizeError("type", "GIF images cannot be attached. Please use a JPG, PNG or PDF.");
    if (type === "application/pdf") {
      if (bytes.length > maxBytes) throw new OptimizeError("size", `The PDF is larger than ${Math.round(maxBytes / 1048576)} MB.`);
      return done(new Blob([bytes], { type }), { mime: type, method: "original-pdf", optimized: false });
    }

    let info = { w: 0, h: 0, hasMeta: false, orientation: 1 };
    if (type === "image/jpeg") info = jpegInfo(bytes);
    else if (type === "image/png") info = pngInfo(bytes);
    else if (type === "image/webp") info = webpInfo(bytes);
    if (info.animated) throw new OptimizeError("type", "Animated images cannot be attached.");
    if (info.w && info.h && info.w * info.h > MAX_SOURCE_PIXELS) throw new OptimizeError("size", "This image is too large to process.");
    const rotated = info.orientation >= 5 && info.orientation <= 8;
    let dispW = rotated ? info.h : info.w, dispH = rotated ? info.w : info.h;

    if (!optimizeOn && type !== "image/heic" && type !== "image/avif") {
      // Optimisation turned off by the admin: metadata is still removed where that is lossless.
      let out = bytes, method = "original";
      if (type === "image/png" && info.hasMeta) { out = stripPng(bytes, info); method = "original-stripped"; }
      if (out.length > maxBytes) throw new OptimizeError("size", `The image is larger than ${Math.round(maxBytes / 1048576)} MB.`);
      return done(new Blob([out], { type }), { mime: type, method, optimized: false, width: dispW, height: dispH, originalWidth: dispW, originalHeight: dispH });
    }

    onProgress({ step: "decode" });
    let src;
    try {
      const scaleDecode = dispW && dispH && Math.max(dispW, dispH) > maxEdge;
      let tw = 0, th = 0;
      if (scaleDecode) { const k = maxEdge / Math.max(dispW, dispH); tw = Math.max(1, Math.round(dispW * k)); th = Math.max(1, Math.round(dispH * k)); }
      src = await decode(new Blob([bytes], { type }), tw, th);
      if (!dispW) { dispW = src.width; dispH = src.height; }
    } catch (_) {
      if (type === "image/heic") throw new OptimizeError("heic", "This device cannot convert HEIC photos. Please choose “Most compatible” (JPEG) in your camera settings, take the photo with the Triplem VIP camera button, or attach a JPG or PNG.");
      throw new OptimizeError("decode", "The image could not be read. It may be damaged.");
    }
    let w = src.width, h = src.height;
    if (Math.max(w, h) > maxEdge) { const k = maxEdge / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }
    if (w * h > MAX_PIXELS) { const k = Math.sqrt(MAX_PIXELS / (w * h)); w = Math.floor(w * k); h = Math.floor(h * k); }
    const resized = w !== dispW || h !== dispH;
    const mustReencode = resized || type === "image/heic" || type === "image/avif" || (type === "image/jpeg" && info.hasMeta) || (type === "image/webp" && info.hasMeta);

    const canvas = makeCanvas(w, h);
    const ctx = canvas.getContext("2d", { alpha: true });
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, w, h);
    if (src.close) src.close();
    const a = analyse(canvas, w, h);
    onProgress({ step: "encode" });

    const candidates = [];
    const tryEncode = async (mime, q, label) => {
      const b = await toBlob(canvas, mime, q);
      if (b && b.type === mime) candidates.push({ blob: b, method: label, quality: q });
      return b && b.type === mime ? b : null;
    };
    const sourceIsGraphic = type === "image/png" || type === "image/webp" ? (a.graphic || a.alpha || info.lossless) : a.graphic;
    if (sourceIsGraphic) {
      // Text, screenshots, line art and transparency: pixel-exact.
      const lossless = await tryEncode("image/webp", 1, "webp-lossless");
      if (!lossless) await tryEncode("image/png", undefined, "png");
      if (!a.alpha && w * h <= 12e6) {
        const lossy = await tryEncode("image/webp", Math.max(QUALITY[preset], 0.92), "webp");
        // Photographic PNGs: use lossy only when lossless is much bigger.
        if (lossless && lossy && lossless.size <= lossy.size * 1.3) candidates.splice(candidates.indexOf(candidates.find(c => c.blob === lossy)), 1);
      }
    } else {
      const webp = await tryEncode("image/webp", QUALITY[preset], "webp");
      if (!webp) await tryEncode(a.alpha ? "image/png" : "image/jpeg", a.alpha ? undefined : JPEG_QUALITY[preset], a.alpha ? "png" : "jpeg");
    }
    if (!candidates.length) throw new OptimizeError("encode", "The image could not be optimised on this device.");
    // Small preview for the form (so the page never decodes the full image).
    let thumb = null;
    try {
      const k = Math.min(1, 160 / Math.max(w, h));
      const tc = makeCanvas(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)));
      const tx = tc.getContext("2d"); tx.imageSmoothingQuality = "high"; tx.drawImage(canvas, 0, 0, tc.width, tc.height);
      thumb = await toBlob(tc, "image/webp", 0.75);
    } catch (_) { thumb = null; }
    candidates.sort((x, y) => x.blob.size - y.blob.size);
    let best = candidates[0];
    const meta = { width: w, height: h, originalWidth: dispW, originalHeight: dispH, preset, maxEdge, thumb, analysis: { graphic: sourceIsGraphic, alpha: a.alpha, colours: a.colours } };

    // Keep the original when it is as good and needs nothing else.
    if (!mustReencode && (best.blob.size >= bytes.length * (1 - MIN_SAVING))) {
      let out = bytes, method = "original";
      if (type === "image/png" && info.hasMeta) { out = stripPng(bytes, info); method = "original-stripped"; }
      if (out.length > maxBytes) throw new OptimizeError("size", `The image is larger than ${Math.round(maxBytes / 1048576)} MB.`);
      return done(new Blob([out], { type }), { mime: type, method, optimized: false, ...meta });
    }
    if (best.blob.size > maxBytes) throw new OptimizeError("size", `The image is still larger than ${Math.round(maxBytes / 1048576)} MB after optimisation.`);
    return done(best.blob, { mime: best.blob.type, method: best.method, quality: best.quality ?? null, optimized: true, ...meta });
  }

  root.TriplemOptimizeCore = Object.freeze({ optimize, sniff, jpegInfo, pngInfo, webpInfo, stripPng, VERSION, OptimizeError });

  // Worker entry point.
  if (typeof WorkerGlobalScope !== "undefined" && root instanceof WorkerGlobalScope) {
    root.onmessage = async e => {
      const { id, file, settings } = e.data || {};
      try {
        const r = await optimize(file, settings, p => root.postMessage({ id, progress: p }));
        root.postMessage({ id, result: r });
      } catch (err) {
        root.postMessage({ id, error: { code: err.code || "error", message: err.message || "Optimisation failed." } });
      }
    };
  }
})(typeof self !== "undefined" ? self : this);
