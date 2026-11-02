/* KMR image optimization: every stored image is a compressed JPEG.
   Full-size originals are NOT stored any more (they used a lot of database storage).
   - photo:    max 1000 px on the long side, JPEG quality 0.86 down to 0.74, aim for <= 260 KB
               (the photo is shown small on the site and printed in a passport-size box)
   - document: max 1600 px, JPEG quality 0.84 down to 0.72, aim for <= 520 KB (CNIC text stays readable)
   Quality is only lowered when the size target is not met at the better setting. */
(function () {
  "use strict";

  const MIME_BY_EXT = {
    jpg: "image/jpeg", jpeg: "image/jpeg", jpe: "image/jpeg",
    png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif"
  };
  const EXT_BY_MIME = Object.fromEntries(Object.entries(MIME_BY_EXT).map(([ext, mime]) => [mime, ext]));
  const MAX_SOURCE_BYTES = 24 * 1024 * 1024; // Largest file a person may choose; it is compressed before upload.

  function extension(file) {
    const declared = String(file && file.type || "").toLowerCase();
    if (EXT_BY_MIME[declared]) return declared === "image/jpeg" ? "jpg" : EXT_BY_MIME[declared].replace("image/", "");
    const nameExt = String(file && file.name || "").split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "");
    return MIME_BY_EXT[nameExt] ? (nameExt === "jpeg" || nameExt === "jpe" ? "jpg" : nameExt) : "jpg";
  }

  function mime(file) {
    const declared = String(file && file.type || "").toLowerCase();
    return EXT_BY_MIME[declared] ? declared : (MIME_BY_EXT[extension(file)] || "image/jpeg");
  }

  function validate(file) {
    if (!(file instanceof Blob) || !file.size) throw new Error("Choose a valid image file first.");
    if (file.size > MAX_SOURCE_BYTES) throw new Error("This image is larger than 24 MB. Please choose a smaller image file.");
    const type = mime(file);
    if (!["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].includes(type)) {
      throw new Error("Use a JPG, PNG, WebP or HEIC image.");
    }
    return type;
  }

  async function decode(file) {
    // createImageBitmap applies EXIF orientation in modern browsers and avoids an extra DOM image.
    if (typeof createImageBitmap === "function") {
      try { return { image: await createImageBitmap(file), close: true }; } catch (_) { /* fallback below */ }
    }
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("This browser could not read the image. Please convert it to JPG or PNG and try again."));
        img.src = url;
      });
      return { image, close: false, url };
    } catch (e) {
      URL.revokeObjectURL(url);
      throw e;
    }
  }

  function canvasBlob(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not optimize this image. Please choose another image.")), "image/jpeg", quality);
    });
  }

  async function optimize(file, profile = "photo") {
    validate(file);
    const settings = profile === "photo"
      ? { maxDimension: 1000, targetBytes: 260 * 1024, minDimension: 640, qualities: [0.86, 0.82, 0.78, 0.74] }
      : { maxDimension: 1600, targetBytes: 520 * 1024, minDimension: 1100, qualities: [0.84, 0.80, 0.76, 0.72] };
    const decoded = await decode(file);
    try {
      const source = decoded.image;
      if (!source.width || !source.height) throw new Error("The selected image has invalid dimensions.");
      let scale = Math.min(1, settings.maxDimension / Math.max(source.width, source.height));
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("Image optimization is not supported by this browser.");
      let best = null;
      // Start with the best quality of the profile and only reduce it when the size target is missed.
      for (let dimensionPass = 0; dimensionPass < 4; dimensionPass++) {
        canvas.width = Math.max(1, Math.round(source.width * scale));
        canvas.height = Math.max(1, Math.round(source.height * scale));
        ctx.fillStyle = "#ffffff"; // flatten transparent PNGs cleanly before JPEG encoding
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
        for (const quality of settings.qualities) {
          const candidate = await canvasBlob(canvas, quality);
          if (!best || candidate.size < best.size || (candidate.size <= settings.targetBytes && quality > best.quality)) {
            best = { blob: candidate, quality, width: canvas.width, height: canvas.height };
          }
          if (candidate.size <= settings.targetBytes) return candidate;
        }
        // Large camera images can still be oversized. Reduce dimensions gently rather than
        // crushing quality.
        if (Math.min(canvas.width, canvas.height) <= settings.minDimension) break;
        scale *= 0.88;
      }
      if (best && best.blob.size <= 2.75 * 1024 * 1024) return best.blob;
      throw new Error("The image could not be optimized to a safe upload size. Please choose a smaller image.");
    } finally {
      if (decoded.close) decoded.image.close();
      if (decoded.url) URL.revokeObjectURL(decoded.url);
    }
  }

  window.KMRImageOptimizer = { optimize, extension, mime, validate };
})();
