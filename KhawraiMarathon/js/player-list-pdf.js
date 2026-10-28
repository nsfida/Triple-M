/* Admin-only, public-safe player directory PDF exports for index.html. */
(function () {
  "use strict";

  const MARGIN = 24;
  const ROW_H = 50;
  const HEAD_H = 24;
  const STATUS = {
    confirmed: { label: "Confirmed", fill: [231, 246, 237], text: [20, 103, 69], border: [191, 225, 204] },
    pending: { label: "Pending", fill: [255, 246, 224], text: [135, 90, 16], border: [239, 220, 173] },
    cancelled: { label: "Cancelled", fill: [255, 239, 241], text: [168, 39, 58], border: [239, 194, 201] }
  };
  const REPORTS = {
    all: { title: "All Players", filename: "KMR-S3-Player-List-All" },
    confirmed: { title: "Confirmed Players", filename: "KMR-S3-Player-List-Confirmed" },
    pending: { title: "Pending Players", filename: "KMR-S3-Player-List-Pending" },
    cancelled: { title: "Cancelled Players", filename: "KMR-S3-Player-List-Cancelled" }
  };
  const photoCache = new Map();
  const imageSizeCache = new Map();

  function ensureJsPDF() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
    const src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    return new Promise((resolve, reject) => {
      let script = [...document.scripts].find(s => s.src && s.src.includes("jspdf.umd.min.js"));
      if (script) {
        const done = () => window.jspdf && window.jspdf.jsPDF ? resolve() : reject(new Error("PDF generator did not initialise."));
        script.addEventListener("load", done, { once: true });
        script.addEventListener("error", () => reject(new Error("Could not load the PDF generator. Check your internet connection.")), { once: true });
        if (window.jspdf && window.jspdf.jsPDF) resolve();
        return;
      }
      script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => window.jspdf && window.jspdf.jsPDF ? resolve() : reject(new Error("PDF generator did not initialise."));
      script.onerror = () => reject(new Error("Could not load the PDF generator. Check your internet connection."));
      document.head.appendChild(script);
    });
  }

  function readFileAsDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Unable to read image."));
      reader.readAsDataURL(blob);
    });
  }

  async function fetchPng(url) {
    if (!url) return null;
    try {
      const response = await fetch(url, { mode: "cors", credentials: "omit", cache: "force-cache" });
      if (!response.ok) return null;
      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) return null;
      const objectUrl = URL.createObjectURL(blob);
      try {
        const image = new Image();
        image.decoding = "async";
        image.src = objectUrl;
        if (image.decode) await image.decode();
        else await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, image.naturalWidth || image.width);
        canvas.height = Math.max(1, image.naturalHeight || image.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(image, 0, 0);
        const dataUrl = canvas.toDataURL("image/png");
        imageSizeCache.set(dataUrl, [canvas.width, canvas.height]);
        return dataUrl;
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch (_) {
      return null;
    }
  }

  async function logoData() {
    const url = (window.KMR && window.KMR.LOGO_URL) || document.getElementById("logo")?.src || "";
    return fetchPng(url);
  }

  async function playerPhoto(row) {
    const path = String(row.photo_path || "").trim();
    if (!path) return null;
    if (!photoCache.has(path)) {
      const url = window.photoUrl ? window.photoUrl(path) : "";
      photoCache.set(path, fetchPng(url).then(data => {
        if (!data) photoCache.delete(path);
        return data;
      }));
    }
    return photoCache.get(path);
  }

  async function mapLimit(items, limit, worker, progress) {
    const results = new Array(items.length);
    let next = 0;
    const count = Math.min(Math.max(1, limit), items.length);
    await Promise.all(Array.from({ length: count }, async () => {
      while (true) {
        const index = next++;
        if (index >= items.length) return;
        try { results[index] = await worker(items[index], index); }
        catch (_) { results[index] = null; }
        if (progress) progress(index + 1, items.length);
      }
    }));
    return results;
  }

  function cleanText(value) {
    return String(value == null || value === "" ? "-" : value).replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
  }

  function drawFallbackMark(doc, x, y, size) {
    // Vector fallback keeps the PDF branded even when the hosted page logo blocks cross-origin access.
    doc.setDrawColor(8, 127, 91);
    doc.setLineWidth(1.5);
    doc.circle(x + size / 2, y + size / 2, size / 2 - 1.5, "S");
    doc.setDrawColor(201, 245, 106);
    doc.setLineWidth(2.4);
    doc.line(x + size * .26, y + size * .64, x + size * .47, y + size * .39);
    doc.line(x + size * .47, y + size * .39, x + size * .62, y + size * .53);
    doc.line(x + size * .62, y + size * .53, x + size * .76, y + size * .31);
    doc.setTextColor(23, 57, 74);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.8);
    doc.text("KMR", x + size / 2, y + size * .83, { align: "center" });
  }

  function drawBrand(doc, logo, report, count, pageW) {
    const x = MARGIN, y = 17, size = 42;
    if (logo) {
      try { doc.addImage(logo, "PNG", x, y, size, size, "kmr-brand-logo", "FAST"); }
      catch (_) { drawFallbackMark(doc, x, y, size); }
    } else drawFallbackMark(doc, x, y, size);

    doc.setTextColor(22, 60, 74);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16.5);
    doc.text("Khawrai Marathon Race", x + size + 10, 31);
    doc.setFontSize(9.3);
    doc.setTextColor(8, 127, 91);
    doc.text("SEASON THREE  /  PLAYER DIRECTORY", x + size + 10, 46);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.2);
    doc.setTextColor(86, 105, 114);
    doc.text(report.title + "  ·  " + count + (count === 1 ? " player" : " players"), x + size + 10, 61);

    const generated = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(56, 76, 84);
    doc.text("OFFICIAL ADMIN EXPORT", pageW - MARGIN, 29, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 115, 122);
    doc.text("Generated " + generated, pageW - MARGIN, 44, { align: "right" });
    doc.setDrawColor(219, 230, 229);
    doc.setLineWidth(.8);
    doc.line(MARGIN, 74, pageW - MARGIN, 74);
  }

  function wrapCell(doc, value, width, maxLines, fontSize) {
    const usable = Math.max(12, width - 12);
    const text = cleanText(value);
    doc.setFontSize(fontSize);
    let lines = doc.splitTextToSize(text, usable);
    if (!Array.isArray(lines)) lines = [String(lines)];
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      let tail = String(lines[maxLines - 1]).replace(/[\s.,;:]+$/, "");
      while (tail.length && doc.getTextWidth(tail + "…") > usable) tail = tail.slice(0, -1);
      lines[maxLines - 1] = (tail || "").trimEnd() + "...";
    }
    return lines;
  }

  function drawCellText(doc, value, x, y, width, maxLines, opts = {}) {
    const size = opts.size || 8;
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...(opts.color || [45, 61, 69]));
    const lines = wrapCell(doc, value, width, maxLines, size);
    const lineH = opts.lineH || 9.3;
    const baseline = y + (ROW_H - lines.length * lineH) / 2 + lineH * .73;
    const tx = opts.align === "center" ? x + width / 2 : x + 6;
    doc.text(lines, tx, baseline, { align: opts.align || "left", maxWidth: width - 10 });
  }

  function drawPhoto(doc, row, data, x, y, width) {
    const boxW = Math.min(31, width - 8), boxH = 40;
    const px = x + (width - boxW) / 2, py = y + (ROW_H - boxH) / 2;
    doc.setFillColor(242, 247, 245);
    doc.setDrawColor(218, 229, 226);
    doc.roundedRect(px, py, boxW, boxH, 3, 3, "FD");
    if (data) {
      try {
        const [iw, ih] = imageDimensions(data);
        const pad = 2, availW = boxW - pad * 2, availH = boxH - pad * 2;
        const scale = Math.min(availW / iw, availH / ih);
        const iw2 = iw * scale, ih2 = ih * scale;
        doc.addImage(data, "PNG", px + (boxW - iw2) / 2, py + (boxH - ih2) / 2, iw2, ih2, undefined, "FAST");
        return;
      } catch (_) {}
    }
    const initial = cleanText(row.name).replace(/^-$/, "K").slice(0, 1).toUpperCase() || "K";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(8, 127, 91);
    doc.text(initial, px + boxW / 2, py + boxH / 2 + 4, { align: "center" });
  }

  function imageDimensions(data) {
    // Keep original aspect ratios from the decoded source image so portraits are not stretched.
    return imageSizeCache.get(data) || [3, 4];
  }

  function statusOf(row) {
    return row.is_cancelled ? "cancelled" : (String(row.status || "pending").toLowerCase() === "confirmed" ? "confirmed" : "pending");
  }

  function drawTableHeader(doc, widths, x, y) {
    const headers = ["PHOTO", "REG. NO.", "PLAYER NAME", "AGE", "GENDER", "ADDRESS / MOHALLAH", "STATUS"];
    const totalW = widths.reduce((sum, w) => sum + w, 0);
    doc.setFillColor(23, 57, 74);
    doc.setDrawColor(23, 57, 74);
    doc.roundedRect(x, y, totalW, HEAD_H, 3, 3, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.4);
    doc.setTextColor(255, 255, 255);
    let cx = x;
    headers.forEach((head, i) => {
      const centered = [0, 3, 4, 6].includes(i);
      doc.text(head, centered ? cx + widths[i] / 2 : cx + 6, y + 15.2, { align: centered ? "center" : "left", maxWidth: widths[i] - 10 });
      cx += widths[i];
    });
  }

  function drawRows(doc, rows, photos, widths, x, y, pageH) {
    const totalW = widths.reduce((sum, w) => sum + w, 0);
    for (let i = 0; i < rows.length; i++) {
      if (y + ROW_H > pageH - 24) {
        doc.addPage("a4", "landscape");
        y = 28;
        drawTableHeader(doc, widths, x, y);
        y += HEAD_H;
      }
      const row = rows[i], status = statusOf(row), canceled = status === "cancelled";
      const base = canceled ? [255, 248, 249] : (i % 2 ? [247, 250, 249] : [255, 255, 255]);
      doc.setFillColor(...base);
      doc.setDrawColor(224, 232, 231);
      doc.rect(x, y, totalW, ROW_H, "FD");
      if (canceled) {
        doc.setFillColor(190, 45, 65);
        doc.rect(x, y, 2.5, ROW_H, "F");
      }

      const starts = [x];
      for (let j = 0; j < widths.length - 1; j++) starts.push(starts[j] + widths[j]);
      for (let j = 1; j < widths.length; j++) {
        doc.setDrawColor(235, 240, 239);
        doc.line(starts[j], y, starts[j], y + ROW_H);
      }
      drawPhoto(doc, row, photos[i], starts[0], y, widths[0]);
      drawCellText(doc, row.reg_no, starts[1], y, widths[1], 2, { size: 7.4, color: [73, 91, 98] });
      drawCellText(doc, row.name, starts[2], y, widths[2], 2, { size: 8.1, bold: true, color: canceled ? [150, 55, 68] : [28, 49, 60] });
      drawCellText(doc, row.age == null || row.age === "" ? "-" : String(row.age), starts[3], y, widths[3], 1, { size: 8, align: "center" });
      drawCellText(doc, row.gender || "-", starts[4], y, widths[4], 2, { size: 7.5, align: "center" });
      drawCellText(doc, row.address || "-", starts[5], y, widths[5], 2, { size: 7.7, color: [75, 91, 98] });

      const cfg = STATUS[status] || STATUS.pending;
      const pillW = Math.min(widths[6] - 12, status === "cancelled" ? 73 : status === "confirmed" ? 70 : 58);
      const pillH = 19;
      const pillX = starts[6] + (widths[6] - pillW) / 2;
      const pillY = y + (ROW_H - pillH) / 2;
      doc.setFillColor(...cfg.fill);
      doc.setDrawColor(...cfg.border);
      doc.roundedRect(pillX, pillY, pillW, pillH, 5, 5, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.3);
      doc.setTextColor(...cfg.text);
      doc.text(cfg.label, pillX + pillW / 2, pillY + 12.3, { align: "center", maxWidth: pillW - 7 });
      y += ROW_H;
    }
    return y;
  }

  async function download(rows, kind, button) {
    if (!window.KMRAuth || !(await window.KMRAuth.current())) {
      if (window.toast) window.toast("Sign in as an administrator to download player lists.", true);
      return;
    }
    if (!Array.isArray(rows) || !rows.length || !REPORTS[kind]) {
      if (window.toast) window.toast("There are no player records to export.", true);
      return;
    }

    const oldText = button ? button.innerHTML : "";
    if (button) { button.disabled = true; button.innerHTML = "Preparing PDF…"; }
    try {
      if (window.toast) window.toast("Preparing the player list PDF…");
      await ensureJsPDF();
      const { jsPDF } = window.jspdf;
      // Restrict this export to public information even if the caller passes a full admin record.
      const safeRows = rows.map(r => ({
        reg_no: cleanText(r.reg_no), name: cleanText(r.name), age: r.age == null ? "" : cleanText(r.age),
        gender: cleanText(r.gender), address: cleanText(r.address), photo_path: r.photo_path || "",
        status: cleanText(r.status).toLowerCase(), is_cancelled: !!r.is_cancelled
      }));
      const photos = await mapLimit(safeRows, 5, row => playerPhoto(row), (done, total) => {
        if (button) button.innerHTML = `Preparing photos ${done}/${total}…`;
      });
      const logo = await logoData();
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4", compress: true });
      doc.setProperties({ title: `Khawrai Marathon Race - ${REPORTS[kind].title}`, subject: "Public player directory", author: "Khawrai Marathon Race Season Three", creator: "KMR Season Three Admin Portal" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const usableW = pageW - MARGIN * 2;
      const weights = [44, 66, 136, 34, 52, 349, 113];
      const factor = usableW / weights.reduce((a, b) => a + b, 0);
      const widths = weights.map(w => w * factor);
      const report = REPORTS[kind];
      drawBrand(doc, logo, report, safeRows.length, pageW);
      let y = 88;
      drawTableHeader(doc, widths, MARGIN, y);
      y += HEAD_H;
      drawRows(doc, safeRows, photos, widths, MARGIN, y, pageH);

      // The logo/title intentionally appear on page one only. Add unobtrusive page numbering to all pages.
      const pages = doc.getNumberOfPages();
      for (let page = 1; page <= pages; page++) {
        doc.setPage(page);
        doc.setDrawColor(227, 234, 233);
        doc.setLineWidth(.6);
        doc.line(MARGIN, pageH - 18, pageW - MARGIN, pageH - 18);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.2);
        doc.setTextColor(114, 128, 133);
        doc.text("Administrative player directory export", MARGIN, pageH - 7);
        doc.text(`Page ${page} of ${pages}`, pageW - MARGIN, pageH - 7, { align: "right" });
      }
      const now = new Date();
      const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      doc.save(`${report.filename}-${day}.pdf`);
      if (window.toast) window.toast(`${report.title} PDF downloaded.`);
    } catch (error) {
      if (window.toast) window.toast("Player-list PDF failed: " + (error && error.message ? error.message : "Unknown error"), true);
    } finally {
      if (button) { button.disabled = false; button.innerHTML = oldText; }
    }
  }

  window.KMRPlayerListPDF = { download };
})();
