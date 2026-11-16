/* Triplem VIP · Arabic / Urdu PDFs (2026-11-16)
   Loaded after jsPDF and jspdf-autotable. On the English site it does nothing.

   On /ar/ and /ur/ it changes every PDF the app builds, without touching the code
   that builds them:
   1. Words: every label passed to doc.text, doc.splitTextToSize and doc.autoTable is
      translated with the same dictionary as the screen (names, numbers and other data
      that are not in the dictionary stay as they are).
   2. Script: jsPDF's built-in fonts cannot draw Arabic letters. Text that contains
      Arabic or Urdu is drawn by the browser (which joins the letters correctly and uses
      the Noto Naskh Arabic / Noto Nastaliq Urdu fonts already loaded by the page) and
      placed in the PDF as a sharp, transparent image at the same spot and size.
   3. Layout: the page is mirrored, as the screen is. Every x coordinate of text, lines,
      boxes, images and links is reflected around the page centre and left/right text
      alignment is swapped, so tables start on the right and read right to left.
      Pictures themselves (logos, QR codes, charts) are placed mirrored but not flipped. */
(function () {
  "use strict";
  var T = window.TriplemI18n;
  if (!T || !T.lang || T.lang === "en") return;
  var jsPDF = window.jspdf && window.jspdf.jsPDF;
  if (!jsPDF || !jsPDF.API || jsPDF.API.__tmI18nPdf) return;
  var API = jsPDF.API;
  try { Object.defineProperty(API, "__tmI18nPdf", { value: true }); } catch (_) {}

  var LANG = T.lang;
  var URDU = LANG === "ur";
  var ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
  var FONT = URDU
    ? '"Noto Nastaliq Urdu","Noto Naskh Arabic",Inter,system-ui,sans-serif'
    : '"Noto Naskh Arabic",Inter,system-ui,sans-serif';
  var PX_PER_PT = 4;              // ≈ 288 dpi, crisp on screen and in print
  var GLYPH_SCALE = URDU ? 0.9 : 1; // Nastaliq is taller than Latin at the same size
  var URDU_LINE_FACTOR = 1.85;     // table rows get room for Nastaliq
  var ARABIC_LINE_FACTOR = 1.35;

  // Make sure the fonts are ready before the first PDF is drawn.
  try {
    if (document.fonts && document.fonts.load) {
      ["400", "700"].forEach(function (w) {
        document.fonts.load(w + " 24px " + (URDU ? '"Noto Nastaliq Urdu"' : '"Noto Naskh Arabic"'), "ابپ ٹ ے");
        if (URDU) document.fonts.load(w + ' 24px "Noto Naskh Arabic"', "ابت");
      });
    }
  } catch (_) {}

  var canvas = document.createElement("canvas");
  var ctx = canvas.getContext("2d");
  var depth = 0;      // > 0 while inside a patched call (internal calls are not mirrored twice)
  var inTable = 0;    // > 0 while autoTable is drawing

  function hasArabic(s) { return typeof s === "string" && ARABIC.test(s); }
  function tr(s) {
    if (typeof s !== "string" || !s.trim() || hasArabic(s)) return s;
    var out = s;
    try { out = T.translateMessage(s); } catch (_) { out = s; }
    // Labels printed in capitals ("BALANCE", "BILL TO") are stored in normal case.
    if (out === s && /[A-Z]{2}/.test(s) && s === s.toUpperCase()) {
      var lower = s.toLowerCase();
      var forms = [lower.charAt(0).toUpperCase() + lower.slice(1), lower.replace(/\b([a-z])/g, function (m) { return m.toUpperCase(); }), lower];
      for (var i = 0; i < forms.length; i++) {
        var t2 = s;
        try { t2 = T.translateMessage(forms[i]); } catch (_) {}
        if (t2 !== forms[i]) return t2;
      }
    }
    return out;
  }
  function trAny(v) {
    if (typeof v === "string") return tr(v);
    if (Array.isArray(v)) return v.map(trAny);
    return v;
  }
  function pageWidth(doc) {
    try { return doc.internal.pageSize.getWidth(); } catch (_) { return doc.internal.pageSize.width; }
  }
  function sf(doc) { return doc.internal.scaleFactor || 1; }
  function fontSizePt(doc, opts) { return (opts && opts.fontSize) || doc.internal.getFontSize(); }
  function isBold(doc) {
    try { var f = doc.getFont(); return /bold/i.test((f.fontStyle || "") + " " + (f.fontName || "")); } catch (_) { return false; }
  }
  function cssFont(doc, sizePt) {
    return (isBold(doc) ? "700 " : "400 ") + (sizePt * PX_PER_PT * GLYPH_SCALE).toFixed(2) + "px " + FONT;
  }
  function measureUnits(doc, s, sizePt) {
    ctx.font = cssFont(doc, sizePt);
    ctx.direction = "rtl";
    return ctx.measureText(s).width / PX_PER_PT / sf(doc);
  }
  function swapAlign(a) {
    if (!a || a === "left" || a === "justify") return "right";
    if (a === "right") return "left";
    return a; // center
  }
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }

  // Split Arabic-script text into lines that fit maxWidth (document units).
  function splitArabic(doc, text, maxWidth, sizePt) {
    var out = [];
    String(text).split(/\r?\n/).forEach(function (para) {
      var words = para.split(/\s+/).filter(Boolean);
      if (!words.length) { out.push(""); return; }
      var line = "";
      words.forEach(function (w) {
        var next = line ? line + " " + w : w;
        if (!line || measureUnits(doc, next, sizePt) <= maxWidth) line = next;
        else { out.push(line); line = w; }
      });
      out.push(line);
    });
    return out;
  }

  // Draw one Arabic-script line as an image. xEdge/align are already mirrored.
  function drawArabicLine(doc, s, xEdge, yBase, align, baseline, sizePt) {
    if (!s) return;
    var font = cssFont(doc, sizePt);
    ctx.font = font; ctx.direction = "rtl";
    var m = ctx.measureText(s);
    var emPx = sizePt * PX_PER_PT;
    var asc = Math.ceil(Math.max(m.actualBoundingBoxAscent || 0, emPx * 0.8)) + 2;
    var desc = Math.ceil(Math.max(m.actualBoundingBoxDescent || 0, emPx * 0.25)) + 2;
    var wPx = Math.ceil(Math.max(m.width, (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || 0))) + 4;
    var hPx = asc + desc;
    var color = "#000000";
    try { color = doc.getTextColor() || color; } catch (_) {}
    if (!/^#/.test(color)) color = "#000000";
    var key = "tmi18n_" + hash(font + "|" + color + "|" + s);

    var c = document.createElement("canvas");
    c.width = Math.max(1, wPx); c.height = Math.max(1, hPx);
    var g = c.getContext("2d");
    g.font = font; g.direction = "rtl"; g.textAlign = "right"; g.textBaseline = "alphabetic";
    g.fillStyle = color;
    g.fillText(s, wPx - 2, asc);

    var k = sf(doc);
    var wU = wPx / PX_PER_PT / k;
    var hU = hPx / PX_PER_PT / k;
    var ascU = asc / PX_PER_PT / k;
    var em = sizePt / k;

    // Horizontal position from the (mirrored) alignment edge.
    var x = align === "right" ? xEdge - wU : align === "center" ? xEdge - wU / 2 : xEdge;
    // Vertical: put the text on the requested baseline.
    var y;
    if (baseline === "top" || baseline === "hanging") y = yBase + (URDU ? 0.1 * em : 0) - (ascU - 0.8 * em);
    else if (baseline === "middle") y = yBase - hU / 2;
    else if (baseline === "bottom" || baseline === "ideographic") y = yBase - hU;
    else y = yBase - ascU; // alphabetic (jsPDF default)
    if (URDU) {
      // Nastaliq letters rise and fall far from the baseline. Every Urdu string uses the
      // same font box (not its own ink), so words on one row share a baseline; the box is
      // centred on the Latin em box (baseline − 0.3 em), or on the taller row inside tables.
      var fAsc = (m.fontBoundingBoxAscent || emPx * 1.2) / PX_PER_PT / k;
      var fDesc = (m.fontBoundingBoxDescent || emPx * 0.6) / PX_PER_PT / k;
      var centre;
      if (baseline === "top" || baseline === "hanging") centre = yBase + 0.5 * em;
      else if (baseline === "middle") centre = yBase;
      else if (baseline === "bottom" || baseline === "ideographic") centre = yBase - 0.5 * em;
      else centre = inTable ? (yBase - 0.85 * em + (URDU_LINE_FACTOR * em) / 2) : (yBase - 0.3 * em);
      var base = centre + (fAsc - fDesc) / 2;
      y = base - ascU;
    }
    callOrig(doc, "addImage", [c, "PNG", x, y, wU, hU, key, "FAST"]);
  }

  // jsPDF defines its drawing methods on each new document, so the wrappers are installed
  // on every document right after it is created (jsPDF's "initialized" event).
  var WRAPPERS = {};
  function callOrig(doc, name, args) {
    var orig = doc.__tmI18nOrig && doc.__tmI18nOrig[name];
    if (typeof orig !== "function") return undefined;
    depth++;
    try { return orig.apply(doc, args); } finally { depth--; }
  }
  function wrap(name, fn) { WRAPPERS[name] = fn; }
  function patchDocument(doc) {
    if (!doc || doc.__tmI18nOrig) return;
    var orig = {};
    try { Object.defineProperty(doc, "__tmI18nOrig", { value: orig, enumerable: false }); } catch (_) { doc.__tmI18nOrig = orig; }
    Object.keys(WRAPPERS).forEach(function (name) {
      if (typeof doc[name] !== "function") return;
      var o = orig[name] = doc[name];
      var fn = WRAPPERS[name];
      doc[name] = function () {
        if (depth > 0) return o.apply(this, arguments);
        return fn.call(this, Array.prototype.slice.call(arguments));
      };
    });
  }

  // ── measuring ──────────────────────────────────────────────────────────
  wrap("getStringUnitWidth", function (args) {
    var s = tr(args[0]);
    if (hasArabic(s)) {
      var size = fontSizePt(this, args[1]);
      return (measureUnits(this, s, size) * sf(this)) / size;
    }
    args[0] = s;
    return callOrig(this, "getStringUnitWidth", args);
  });
  wrap("getTextWidth", function (args) {
    var s = tr(args[0]);
    if (hasArabic(s)) return measureUnits(this, s, fontSizePt(this));
    args[0] = s;
    return callOrig(this, "getTextWidth", args);
  });
  wrap("splitTextToSize", function (args) {
    var text = args[0];
    if (Array.isArray(text)) text = text.join("\n");
    text = tr(text);
    if (hasArabic(text)) return splitArabic(this, text, args[1], fontSizePt(this, args[2]));
    args[0] = text;
    return callOrig(this, "splitTextToSize", args);
  });

  // ── text ───────────────────────────────────────────────────────────────
  wrap("text", function (args) {
    var text = args[0], x = args[1], y = args[2], opts = args[3], transform = args[4];
    if (typeof text === "number" && typeof x === "number" && typeof y !== "number") {
      // legacy signature text(x, y, text, flags, angle, align)
      var lx = text, ly = x; text = y; x = lx; y = ly;
      opts = { align: args[5], angle: args[4] }; transform = undefined;
    }
    opts = opts && typeof opts === "object" ? Object.assign({}, opts) : {};
    text = trAny(text);
    var W = pageWidth(this);
    var mx = W - Number(x || 0);
    var align = swapAlign(opts.align);
    var size = fontSizePt(this);
    var anyArabic = Array.isArray(text) ? text.some(hasArabic) : hasArabic(text);
    if (!anyArabic || opts.angle || transform) {
      opts.align = align;
      if (URDU && inTable && !opts.baseline) y = y + ((URDU_LINE_FACTOR - 1.15) * size) / sf(this) / 2;
      return callOrig(this, "text", [text, mx, y, opts, transform]);
    }
    var lines;
    if (Array.isArray(text)) lines = text.map(function (t) { return String(t == null ? "" : t); });
    else if (opts.maxWidth) lines = splitArabic(this, text, opts.maxWidth, size);
    else lines = String(text).split(/\r?\n/);
    var lhf = 1.15;
    try { lhf = this.getLineHeightFactor ? this.getLineHeightFactor() : 1.15; } catch (_) {}
    var step = (size * (opts.lineHeightFactor || lhf)) / sf(this);
    var self = this;
    lines.forEach(function (line, i) {
      var yy = y + i * step;
      if (hasArabic(line)) drawArabicLine(self, line, mx, yy, align, opts.baseline, size);
      else if (line) {
        var ly = (URDU && inTable && !opts.baseline) ? yy + ((URDU_LINE_FACTOR - 1.15) * size) / sf(self) / 2 : yy;
        callOrig(self, "text", [line, mx, ly, { align: align, baseline: opts.baseline }]);
      }
    });
    return this;
  });

  // ── shapes, images and links: mirror the x axis ────────────────────────
  wrap("rect", function (a) { a[0] = pageWidth(this) - a[0] - a[2]; return callOrig(this, "rect", a); });
  wrap("roundedRect", function (a) { a[0] = pageWidth(this) - a[0] - a[2]; return callOrig(this, "roundedRect", a); });
  wrap("line", function (a) { var W = pageWidth(this); a[0] = W - a[0]; a[2] = W - a[2]; return callOrig(this, "line", a); });
  wrap("circle", function (a) { a[0] = pageWidth(this) - a[0]; return callOrig(this, "circle", a); });
  wrap("ellipse", function (a) { a[0] = pageWidth(this) - a[0]; return callOrig(this, "ellipse", a); });
  wrap("triangle", function (a) { var W = pageWidth(this); a[0] = W - a[0]; a[2] = W - a[2]; a[4] = W - a[4]; return callOrig(this, "triangle", a); });
  wrap("lines", function (a) {
    var W = pageWidth(this);
    var segs = Array.isArray(a[0]) ? a[0].map(function (s) { return s.map(function (v, i) { return i % 2 === 0 ? -v : v; }); }) : a[0];
    a[0] = segs; a[1] = W - a[1];
    return callOrig(this, "lines", a);
  });
  wrap("moveTo", function (a) { a[0] = pageWidth(this) - a[0]; return callOrig(this, "moveTo", a); });
  wrap("lineTo", function (a) { a[0] = pageWidth(this) - a[0]; return callOrig(this, "lineTo", a); });
  wrap("curveTo", function (a) { var W = pageWidth(this); a[0] = W - a[0]; a[2] = W - a[2]; a[4] = W - a[4]; return callOrig(this, "curveTo", a); });
  wrap("link", function (a) { a[0] = pageWidth(this) - a[0] - (a[2] || 0); return callOrig(this, "link", a); });
  wrap("addImage", function (a) {
    var W = pageWidth(this);
    if (a[0] && typeof a[0] === "object" && !Array.isArray(a[0]) && a.length === 1 && "imageData" in a[0]) {
      var o = Object.assign({}, a[0]);
      if (o.width) o.x = W - o.x - o.width;
      return callOrig(this, "addImage", [o]);
    }
    var xi = typeof a[1] === "string" ? 2 : 1;
    if (typeof a[xi] === "number" && typeof a[xi + 2] === "number" && a[xi + 2]) a[xi] = W - a[xi] - a[xi + 2];
    return callOrig(this, "addImage", a);
  });

  // ── tables ─────────────────────────────────────────────────────────────
  function trCell(c) {
    if (typeof c === "string") return tr(c);
    if (c && typeof c === "object" && !Array.isArray(c) && typeof c.content === "string") {
      var o = Object.assign({}, c); o.content = tr(c.content); return o;
    }
    if (c && typeof c === "object" && !Array.isArray(c) && typeof c.title === "string") {
      var t = Object.assign({}, c); t.title = tr(c.title); return t;
    }
    return c;
  }
  function trRows(rows) {
    if (!Array.isArray(rows)) return rows;
    return rows.map(function (r) {
      if (Array.isArray(r)) return r.map(trCell);
      if (r && typeof r === "object") { var o = {}; Object.keys(r).forEach(function (k) { o[k] = trCell(r[k]); }); return o; }
      return trCell(r);
    });
  }
  wrap("autoTable", function (args) {
    var o = args[0] && typeof args[0] === "object" ? Object.assign({}, args[0]) : args[0];
    if (o && typeof o === "object") {
      ["head", "body", "foot"].forEach(function (k) { if (o[k]) o[k] = trRows(o[k]); });
      if (Array.isArray(o.columns)) o.columns = o.columns.map(trCell);
    }
    args[0] = o;
    var doc = this, prevLhf = null;
    try {
      if (doc.getLineHeightFactor && doc.setLineHeightFactor) {
        prevLhf = doc.getLineHeightFactor();
        doc.setLineHeightFactor(Math.max(prevLhf, URDU ? URDU_LINE_FACTOR : ARABIC_LINE_FACTOR));
      }
    } catch (_) { prevLhf = null; }
    // autoTable draws with the document's own text/rect/line calls, which are mirrored, so it
    // runs outside the re-entry guard.
    inTable++;
    try { return doc.__tmI18nOrig.autoTable.apply(doc, args); }
    finally {
      inTable--;
      if (prevLhf != null) { try { doc.setLineHeightFactor(prevLhf); } catch (_) {} }
    }
  });

  // ── document metadata ──────────────────────────────────────────────────
  wrap("setProperties", function (a) {
    var p = a[0] && typeof a[0] === "object" ? Object.assign({}, a[0]) : a[0];
    if (p && typeof p === "object") ["title", "subject"].forEach(function (k) { if (typeof p[k] === "string") p[k] = tr(p[k]); });
    a[0] = p;
    return callOrig(this, "setProperties", a);
  });
  wrap("setLanguage", function (a) { return callOrig(this, "setLanguage", [LANG === "ur" ? "ur-PK" : "ar-AE"]); });

  if (!Array.isArray(API.events)) API.events = [];
  API.events.push(["initialized", function () { patchDocument(this); }]);

  window.TriplemI18nPdf = Object.freeze({ translate: tr, mirrored: true });
})();
