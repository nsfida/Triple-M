/* ============================================================================
 * Khawrai Marathon Race – Season Three
 * admin-full-registration-pdf.js
 *
 * Generates a single consolidated PDF with every registered (non-cancelled)
 * player's data:
 *   Page 1 of 3  — full registration form (all personal + race details)
 *   Page 2 of 3  — CNIC / ID front photo (full A4 portrait)
 *   Page 3 of 3  — CNIC / ID back photo  (full A4 portrait)
 *   … repeat for every player sorted by reg_no …
 *
 * SECURITY:
 *   • JS side: button only appears when permissions.is_owner === true.
 *   • DB side: admin_get_full_registration_data() raises 42501 for any
 *     session that is not nsfida@khawrai.app. The JS check is UI-only.
 *
 * CNIC images are fetched from the 'documents' Supabase storage bucket
 * via short-lived (600 s) signed URLs. Photos come from the 'photos' bucket
 * via the public window.photoUrl() helper (or signed URL fallback).
 * ========================================================================== */
(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------
  const PAGE_W  = 595.28;  // A4 portrait width  (pt)
  const PAGE_H  = 841.89;  // A4 portrait height (pt)
  const M       = 36;      // page margin (pt)
  const CONTENT_W = PAGE_W - M * 2;

  // Colour palette
  const COL = {
    dark:    [22,  60,  74],
    mid:     [56,  76,  84],
    light:   [100, 115, 122],
    green:   [8,   127, 91],
    lime:    [201, 245, 106],
    bg:      [246, 249, 249],
    border:  [218, 229, 226],
    rowAlt:  [247, 250, 249],
    white:   [255, 255, 255],
    red:     [168, 39,  58]
  };

  // ---------------------------------------------------------------------------
  // jsPDF loader (shared with player-list-pdf.js but kept self-contained)
  // ---------------------------------------------------------------------------
  function ensureJsPDF() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
    const SRC = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    return new Promise((resolve, reject) => {
      let script = [...document.scripts].find(s => s.src && s.src.includes("jspdf.umd.min.js"));
      if (script) {
        if (window.jspdf && window.jspdf.jsPDF) { resolve(); return; }
        script.addEventListener("load",  () => window.jspdf && window.jspdf.jsPDF ? resolve() : reject(new Error("jsPDF did not initialise.")), { once: true });
        script.addEventListener("error", () => reject(new Error("Could not load jsPDF. Check your internet connection.")), { once: true });
        return;
      }
      script = document.createElement("script");
      script.src = SRC; script.async = true;
      script.onload  = () => window.jspdf && window.jspdf.jsPDF ? resolve() : reject(new Error("jsPDF did not initialise."));
      script.onerror = () => reject(new Error("Could not load jsPDF. Check your internet connection."));
      document.head.appendChild(script);
    });
  }

  // ---------------------------------------------------------------------------
  // Image fetch + canvas downscale
  // ---------------------------------------------------------------------------
  const imgSizeCache = new Map();

  async function fetchImage(url, opts) {
    if (!url) return null;
    const maxSide   = (opts && opts.maxSide)  || 800;
    const asJpeg    = !(opts && opts.png);
    const quality   = (opts && opts.quality) || 0.82;
    try {
      const res = await fetch(url, { mode: "cors", credentials: "omit", cache: "force-cache" });
      if (!res.ok) return null;
      const blob = await res.blob();
      if (!blob.type.startsWith("image/")) return null;
      const objectUrl = URL.createObjectURL(blob);
      try {
        const img = new Image();
        img.decoding = "async";
        img.src = objectUrl;
        if (img.decode) await img.decode();
        else await new Promise((ok, fail) => { img.onload = ok; img.onerror = fail; });
        const srcW = Math.max(1, img.naturalWidth  || img.width);
        const srcH = Math.max(1, img.naturalHeight || img.height);
        const scale = Math.min(1, maxSide / Math.max(srcW, srcH));
        const canvas = document.createElement("canvas");
        canvas.width  = Math.max(1, Math.round(srcW * scale));
        canvas.height = Math.max(1, Math.round(srcH * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.imageSmoothingQuality = "high";
        if (asJpeg) { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = asJpeg
          ? canvas.toDataURL("image/jpeg", quality)
          : canvas.toDataURL("image/png");
        imgSizeCache.set(dataUrl, [canvas.width, canvas.height]);
        return dataUrl;
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch (_) { return null; }
  }

  async function mapLimit(items, limit, worker, progress) {
    const results = new Array(items.length);
    let next = 0;
    const count = Math.min(Math.max(1, limit), items.length);
    await Promise.all(Array.from({ length: count }, async () => {
      while (true) {
        const idx = next++;
        if (idx >= items.length) return;
        try { results[idx] = await worker(items[idx], idx); }
        catch (_) { results[idx] = null; }
        if (progress) progress(idx + 1, items.length);
      }
    }));
    return results;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const clean = v => String(v == null || v === "" ? "—" : v).replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
  const fmtCnic = d => { d = String(d || ""); return d.length === 13 ? `${d.slice(0,5)}-${d.slice(5,12)}-${d.slice(12)}` : d; };
  const fmtMob  = d => { d = String(d || ""); return d.length === 11 ? `${d.slice(0,4)}-${d.slice(4)}` : d; };
  const fmtDate = d => { const x = new Date(d); return isNaN(x) ? "—" : String(x.getDate()).padStart(2,"0") + "/" + String(x.getMonth()+1).padStart(2,"0") + "/" + x.getFullYear(); };
  const ageOf   = d => { const b = new Date(d), n = new Date(); if (isNaN(b)) return null; let a = n.getFullYear()-b.getFullYear(); if (n < new Date(n.getFullYear(),b.getMonth(),b.getDate())) a--; return a; };

  // ---------------------------------------------------------------------------
  // Generate signed URL for CNIC images in 'documents' bucket
  // ---------------------------------------------------------------------------
  async function signedDocUrl(path) {
    if (!path) return null;
    try {
      const { data, error } = await window.sb.storage.from("documents").createSignedUrl(path, 600);
      if (error || !data || !data.signedUrl) return null;
      return data.signedUrl;
    } catch (_) { return null; }
  }

  // ---------------------------------------------------------------------------
  // Logo
  // ---------------------------------------------------------------------------
  async function logoData() {
    const url = (window.KMR && window.KMR.LOGO_URL) || "";
    if (!url) return null;
    return fetchImage(url, { png: true, maxSide: 240 });
  }

  // ---------------------------------------------------------------------------
  // ── Page 1: Registration form ──────────────────────────────────────────────
  // ---------------------------------------------------------------------------

  /* Draws the page header common to all form pages */
  function drawPageHeader(doc, logo, playerIndex, playerTotal, pageName, pageInPlayer) {
    // Top brand stripe
    doc.setFillColor(...COL.dark);
    doc.rect(0, 0, PAGE_W, 54, "F");

    // Logo (white bg circle behind it)
    if (logo) {
      try { doc.addImage(logo, "PNG", M, 7, 40, 40, "logo-brand", "FAST"); }
      catch (_) {}
    }

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...COL.white);
    doc.text("Khawrai Marathon Race", M + 48, 24);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...COL.lime);
    doc.text("SEASON THREE  ·  OFFICIAL REGISTRATION EXPORT  ·  ADMIN EYES ONLY", M + 48, 38);

    // Right: player counter
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...COL.white);
    doc.text(`Player ${playerIndex} of ${playerTotal}`, PAGE_W - M, 22, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...COL.lime);
    doc.text(`Page ${pageInPlayer} of 3  ·  ${pageName}`, PAGE_W - M, 36, { align: "right" });

    // Separator below header
    doc.setDrawColor(...COL.border);
    doc.setLineWidth(0.6);
    doc.line(M, 60, PAGE_W - M, 60);
  }

  /* Draws a coloured section heading */
  function drawSectionHeading(doc, label, y) {
    doc.setFillColor(...COL.dark);
    doc.setDrawColor(...COL.dark);
    doc.roundedRect(M, y, CONTENT_W, 20, 3, 3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...COL.white);
    doc.text(label, M + 8, y + 13.5);
    return y + 20;
  }

  /* Renders a two-column key-value row inside a section */
  function drawKVRow(doc, pairs, y, rowH, even) {
    if (even) {
      doc.setFillColor(...COL.rowAlt);
      doc.rect(M, y, CONTENT_W, rowH, "F");
    }
    doc.setDrawColor(...COL.border);
    doc.line(M, y + rowH, M + CONTENT_W, y + rowH);

    const colW  = CONTENT_W / 2;
    const labelX = M + 6;
    const valX1  = M + 6 + 95;
    const valX2  = M + colW + 6 + 95;

    pairs.forEach((pair, col) => {
      if (!pair) return;
      const [label, value] = pair;
      const ox = col === 0 ? 0 : colW;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...COL.light);
      doc.text(String(label || "").toUpperCase(), labelX + ox, y + 11);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...COL.dark);
      const valStr = clean(value);
      const maxW   = colW - 100;
      const lines  = doc.splitTextToSize(valStr, maxW);
      doc.text(lines.slice(0, 2), (col === 0 ? valX1 : valX2), y + 11, { maxWidth: maxW });
    });

    return y + rowH;
  }

  /* Renders wide single-column KV row */
  function drawKVRowWide(doc, label, value, y, rowH, even) {
    if (even) {
      doc.setFillColor(...COL.rowAlt);
      doc.rect(M, y, CONTENT_W, rowH, "F");
    }
    doc.setDrawColor(...COL.border);
    doc.line(M, y + rowH, M + CONTENT_W, y + rowH);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...COL.light);
    doc.text(String(label || "").toUpperCase(), M + 6, y + 11);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...COL.dark);
    const valStr = clean(value);
    const maxW = CONTENT_W - 100;
    const lines = doc.splitTextToSize(valStr, maxW);
    doc.text(lines.slice(0, 2), M + 6 + 95, y + 11, { maxWidth: maxW });

    return y + rowH;
  }

  /* Renders the player photo in a portrait box (right of name section) */
  function drawPlayerPhoto(doc, photoData, photoInitial, bx, by, bw, bh) {
    doc.setFillColor(...COL.bg);
    doc.setDrawColor(...COL.border);
    doc.roundedRect(bx, by, bw, bh, 4, 4, "FD");
    if (photoData) {
      try {
        const [iw, ih] = imgSizeCache.get(photoData) || [3, 4];
        const pad = 4, aw = bw - pad*2, ah = bh - pad*2;
        const scale = Math.min(aw/iw, ah/ih);
        const dw = iw*scale, dh = ih*scale;
        doc.addImage(photoData, "JPEG", bx+pad+(aw-dw)/2, by+pad+(ah-dh)/2, dw, dh, undefined, "FAST");
        return;
      } catch (_) {}
    }
    // Fallback: initial letter
    doc.setFont("helvetica", "bold");
    doc.setFontSize(28);
    doc.setTextColor(...COL.green);
    doc.text(String(photoInitial || "K").toUpperCase().slice(0,1), bx + bw/2, by + bh/2 + 8, { align: "center" });
  }

  /* Draws the registration form page for one player */
  function drawFormPage(doc, logo, row, playerIndex, playerTotal, photoData) {
    drawPageHeader(doc, logo, playerIndex, playerTotal, "Registration Form", 1);

    let y = 68;

    // ── Player name + reg number banner ──────────────────────────────────────
    const bannerH = 56;
    doc.setFillColor(...COL.bg);
    doc.setDrawColor(...COL.border);
    doc.roundedRect(M, y, CONTENT_W, bannerH, 5, 5, "FD");

    // Photo box inside banner
    const photoW = 44, photoH = 50;
    const photoX = M + 8, photoY = y + (bannerH - photoH)/2;
    drawPlayerPhoto(doc, photoData, row.name, photoX, photoY, photoW, photoH);

    // Name & reg no
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...COL.dark);
    doc.text(clean(row.name), M + photoW + 18, y + 22, { maxWidth: CONTENT_W - photoW - 24 });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COL.green);
    doc.text(clean(row.reg_no), M + photoW + 18, y + 36);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...COL.light);
    const statusLabel = row.is_cancelled ? "Cancelled" : (String(row.status || "pending").toLowerCase() === "confirmed" ? "Confirmed" : "Pending");
    doc.text(`Status: ${statusLabel}  ·  Registered: ${fmtDate(row.created_at)}`, M + photoW + 18, y + 48);

    y += bannerH + 10;

    const RH  = 22;  // row height for single-line KV rows
    const RH2 = 32;  // row height for potentially multi-line values
    let even  = false;

    // ── Personal details ──────────────────────────────────────────────────────
    y = drawSectionHeading(doc, "Personal Details", y);
    even = false;

    y = drawKVRow(doc, [["Full Name", row.name], ["Father's Name", row.father_name]], y, RH, even); even = !even;
    y = drawKVRow(doc, [["CNIC / B-Form", fmtCnic(row.cnic)], ["Date of Birth", fmtDate(row.dob)]], y, RH, even); even = !even;
    y = drawKVRow(doc, [["Age", ageOf(row.dob) != null ? String(ageOf(row.dob)) + " years" : "—"], ["Gender", row.gender || "—"]], y, RH, even); even = !even;
    y = drawKVRow(doc, [["Mobile", fmtMob(row.mobile)], ["Email", row.email || "—"]], y, RH, even); even = !even;
    y = drawKVRowWide(doc, "Permanent Address", (row.address || "—") + (row.district_tehsil ? ", " + row.district_tehsil : ""), y, RH, even); even = !even;

    y += 8;

    // ── Sport & experience ────────────────────────────────────────────────────
    y = drawSectionHeading(doc, "Sport & Experience", y);
    even = false;

    y = drawKVRow(doc, [["Sport", row.sport], ["Association", row.association || "—"]], y, RH, even); even = !even;
    y = drawKVRow(doc, [["Player Level", row.player_level || "—"], ["Years of Experience", row.years_experience || "—"]], y, RH, even); even = !even;
    y = drawKVRow(doc, [["Education", row.education || "—"], [null, null]], y, RH, even); even = !even;

    y += 8;

    // ── Official participation history (if any) ───────────────────────────────
    if (row.official_participation) {
      y = drawSectionHeading(doc, "Official Participation History", y);
      even = false;
      y = drawKVRow(doc, [["Event Name", row.event_name], ["Event Date", row.event_date || "—"]], y, RH, even); even = !even;
      y = drawKVRow(doc, [["Event Level", row.event_level || "—"], ["Organiser", row.event_org || "—"]], y, RH, even); even = !even;
      y += 8;
    }

    // ── Administrative / payment ──────────────────────────────────────────────
    y = drawSectionHeading(doc, "Administrative", y);
    even = false;

    y = drawKVRow(doc, [["Payment Ref.", row.payment_ref || "—"], ["Entered By", row.entered_by ? "Admin: " + row.entered_by : "Self-registered"]], y, RH, even); even = !even;
    y = drawKVRow(doc, [["Declaration", row.declaration_accepted ? "Accepted" : "Not accepted"], ["Signature Name", row.signature_name || "—"]], y, RH, even);

    // ── Page footer ───────────────────────────────────────────────────────────
    _drawFooter(doc, playerIndex, playerTotal, 1);
  }

  // ---------------------------------------------------------------------------
  // ── Pages 2 & 3: CNIC photo pages ─────────────────────────────────────────
  // ---------------------------------------------------------------------------
  function drawCnicPage(doc, logo, row, playerIndex, playerTotal, cnicData, side) {
    const pageNum  = side === "front" ? 2 : 3;
    const pageName = side === "front" ? "CNIC / ID Front" : "CNIC / ID Back";
    const sideLabel = side === "front" ? "FRONT" : "BACK";

    drawPageHeader(doc, logo, playerIndex, playerTotal, pageName, pageNum);

    // Player name label below header
    let y = 70;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...COL.dark);
    doc.text(`${clean(row.reg_no)}  ·  ${clean(row.name)}`, M, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...COL.light);
    doc.text(`CNIC / National ID Card  ·  ${sideLabel}`, M, y + 14);
    y += 28;

    // Image area
    const availW  = CONTENT_W;
    const availH  = PAGE_H - y - M - 28; // bottom margin + footer
    const imgAreaX = M;
    const imgAreaY = y;

    if (cnicData) {
      try {
        const [iw, ih] = imgSizeCache.get(cnicData) || [4, 3]; // CNIC is typically landscape
        const scale = Math.min(availW / iw, availH / ih);
        const dw = iw * scale, dh = ih * scale;
        // Centre the image in the available area
        const dx = imgAreaX + (availW - dw) / 2;
        const dy = imgAreaY + (availH - dh) / 2;

        // Light border box around the image area
        doc.setFillColor(...COL.bg);
        doc.setDrawColor(...COL.border);
        doc.roundedRect(imgAreaX, imgAreaY, availW, availH, 5, 5, "FD");

        doc.addImage(cnicData, "JPEG", dx, dy, dw, dh, undefined, "FAST");
      } catch (_) {
        _drawMissingCnic(doc, imgAreaX, imgAreaY, availW, availH, "Image could not be rendered.");
      }
    } else {
      _drawMissingCnic(doc, imgAreaX, imgAreaY, availW, availH, "CNIC photo not uploaded.");
    }

    _drawFooter(doc, playerIndex, playerTotal, pageNum);
  }

  function _drawMissingCnic(doc, x, y, w, h, msg) {
    doc.setFillColor(...COL.bg);
    doc.setDrawColor(...COL.border);
    doc.roundedRect(x, y, w, h, 5, 5, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...COL.light);
    doc.text(msg, x + w/2, y + h/2 - 6, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text("No document was uploaded for this player.", x + w/2, y + h/2 + 10, { align: "center" });
  }

  function _drawFooter(doc, playerIndex, playerTotal, pageInPlayer) {
    const fy = PAGE_H - 18;
    doc.setDrawColor(...COL.border);
    doc.setLineWidth(0.6);
    doc.line(M, fy - 6, PAGE_W - M, fy - 6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...COL.light);
    const generated = new Date().toLocaleString("en-GB", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
    doc.text(`Khawrai Marathon Race · Season Three · Admin Export · Generated ${generated} · CONFIDENTIAL`, M, fy);
    doc.text(`Player ${playerIndex}/${playerTotal}  ·  Page ${pageInPlayer}/3`, PAGE_W - M, fy, { align: "right" });
  }

  // ---------------------------------------------------------------------------
  // Main: generate and download the PDF
  // ---------------------------------------------------------------------------
  async function download(button) {
    // ── JS-side permission guard ──────────────────────────────────────────────
    const perms = window.KMRAuth && window.KMRAuth.permissions && window.KMRAuth.permissions();
    if (!perms || perms.is_owner !== true) {
      if (window.toast) window.toast("This export is only available to nsfida.", true);
      return;
    }

    const oldText = button ? button.innerHTML : "";
    const setLabel = t => { if (button) button.innerHTML = t; };
    if (button) button.disabled = true;

    try {
      if (window.toast) window.toast("Preparing full registration export…");
      setLabel("Connecting to database…");

      // ── Fetch registration data via nsfida-only RPC ───────────────────────
      const { data: rows, error: rpcErr } = await window.sb.rpc("admin_get_full_registration_data");
      if (rpcErr) {
        const msg = rpcErr.message || String(rpcErr);
        if (window.toast) window.toast("Could not load registration data: " + msg, true);
        return;
      }
      if (!Array.isArray(rows) || rows.length === 0) {
        if (window.toast) window.toast("No active registrations found to export.", true);
        return;
      }

      const total = rows.length;
      setLabel(`Preparing ${total} player${total !== 1 ? "s" : ""}…`);

      // ── Load jsPDF ────────────────────────────────────────────────────────
      await ensureJsPDF();
      const { jsPDF } = window.jspdf;

      // ── Fetch logo ────────────────────────────────────────────────────────
      setLabel("Loading assets…");
      const logo = await logoData();

      // ── Fetch all images concurrently (max 4 at a time) ───────────────────
      // For each player: [photoDataUrl, cnicFrontDataUrl, cnicBackDataUrl]
      const imageGroups = await mapLimit(rows, 4, async (row, idx) => {
        setLabel(`Fetching images ${idx + 1}/${total}…`);

        // Player photo (from public 'photos' bucket)
        const photoUrl = window.photoUrl ? window.photoUrl(row.photo_path) : "";
        const photoData = photoUrl
          ? await fetchImage(photoUrl, { maxSide: 320, quality: 0.75 })
          : null;

        // CNIC front (signed URL from 'documents' bucket)
        const frontUrl = await signedDocUrl(row.cnic_front_path);
        const frontData = frontUrl
          ? await fetchImage(frontUrl, { maxSide: 1200, quality: 0.88 })
          : null;

        // CNIC back (signed URL from 'documents' bucket)
        const backUrl = await signedDocUrl(row.cnic_back_path);
        const backData = backUrl
          ? await fetchImage(backUrl, { maxSide: 1200, quality: 0.88 })
          : null;

        return { photoData, frontData, backData };
      });

      // ── Build PDF ─────────────────────────────────────────────────────────
      setLabel("Composing PDF…");

      const doc = new jsPDF({
        orientation: "portrait",
        unit: "pt",
        format: "a4",
        compress: true
      });

      doc.setProperties({
        title: "Khawrai Marathon Race S3 – Full Registration Export",
        subject: "Complete registration forms with CNIC documents",
        author: "Khawrai Marathon Race Season Three",
        creator: "KMR Season Three Admin Portal",
        keywords: "CONFIDENTIAL ADMIN ONLY"
      });

      rows.forEach((row, idx) => {
        const playerIndex   = idx + 1;
        const { photoData, frontData, backData } = imageGroups[idx] || {};

        // Page 1: Registration form
        if (idx > 0) doc.addPage("a4", "portrait");
        drawFormPage(doc, logo, row, playerIndex, total, photoData || null);

        // Page 2: CNIC front
        doc.addPage("a4", "portrait");
        drawCnicPage(doc, logo, row, playerIndex, total, frontData || null, "front");

        // Page 3: CNIC back
        doc.addPage("a4", "portrait");
        drawCnicPage(doc, logo, row, playerIndex, total, backData || null, "back");
      });

      // ── Save ──────────────────────────────────────────────────────────────
      const now = new Date();
      const stamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
      doc.save(`KMR-S3-Full-Registrations-${stamp}.pdf`);

      if (window.toast) window.toast(`Full registration PDF downloaded — ${total} player${total !== 1 ? "s" : ""}.`);

    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      if (window.toast) window.toast("Full registration PDF failed: " + msg, true);
      console.error("[KMRFullRegPDF]", err);
    } finally {
      if (button) { button.disabled = false; button.innerHTML = oldText; }
    }
  }

  // Expose on window so the admin page inline script can call it.
  window.KMRFullRegPDF = { download };
})();
