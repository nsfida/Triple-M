(() => {
'use strict';
const requests = new WeakMap();
const loadedSources = new WeakMap();

function trimSignatureWhitespace(image) {
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (!width || !height) return null;

  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!sourceContext) return null;

  sourceContext.drawImage(image, 0, 0);
  const pixels = sourceContext.getImageData(0, 0, width, height).data;
  let left = width, top = height, right = -1, bottom = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const alpha = pixels[i + 3];
      if (alpha > 24 && (pixels[i] < 235 || pixels[i + 1] < 235 || pixels[i + 2] < 235)) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }

  if (right < left || bottom < top) return null;
  const padding = Math.max(3, Math.round(Math.min(width, height) * 0.05));
  left = Math.max(0, left - padding);
  top = Math.max(0, top - padding);
  right = Math.min(width - 1, right + padding);
  bottom = Math.min(height - 1, bottom + padding);

  const cropWidth = right - left + 1;
  const cropHeight = bottom - top + 1;
  if (cropWidth >= width * 0.96 && cropHeight >= height * 0.96) return null;

  const cropped = document.createElement('canvas');
  cropped.width = cropWidth;
  cropped.height = cropHeight;
  const context = cropped.getContext('2d');
  if (!context) return null;
  context.drawImage(image, left, top, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  return cropped.toDataURL('image/png');
}

function load(image, driverName) {
  if (!image) return Promise.resolve(false);
  const name = String(driverName || '').trim();
  const previous = requests.get(image) || 0;
  const request = previous + 1;
  requests.set(image, request);
  image.hidden = true;
  image.alt = name ? `Signature of ${name}` : '';
  image.removeAttribute('data-signature-trimmed');

  if (!name) {
    image.removeAttribute('src');
    image.removeAttribute('data-signature-source');
    loadedSources.delete(image);
    return Promise.resolve(false);
  }

  const source = new URL(`signs/${encodeURIComponent(name)}.png`, document.baseURI).href;
  if (loadedSources.get(image) === source && image.complete && image.naturalWidth > 0) {
    image.hidden = false;
    return Promise.resolve(true);
  }
  image.setAttribute('data-signature-source', source);

  return new Promise(resolve => {
    let settled = false;
    const finish = available => {
      if (settled) return;
      settled = true;
      if (requests.get(image) === request) {
        image.hidden = !available;
        if (available) loadedSources.set(image, source);
        else loadedSources.delete(image);
      }
      resolve(available);
    };

    image.onload = () => {
      const valid = image.naturalWidth > 0 && image.naturalHeight > 0;
      if (valid && !image.dataset.signatureTrimmed) {
        image.dataset.signatureTrimmed = '1';
        try {
          const cropped = trimSignatureWhitespace(image);
          if (cropped) {
            image.src = cropped;
            return;
          }
        } catch (_) {
          // If canvas processing is unavailable, keep the original PNG.
        }
      }
      finish(valid);
    };
    image.onerror = () => finish(false);
    image.src = source;
  });
}

window.NRMSignatures = Object.freeze({ load });
})();
