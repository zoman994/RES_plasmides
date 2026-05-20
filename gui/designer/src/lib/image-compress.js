/**
 * image-compress — Canvas-based PNG/JPEG recompression.
 *
 * Spec §4.1 whitelist. Images > 2400 px on longest side get scaled
 * down preserving aspect; PNG/JPEG always re-encode at JPEG quality 85
 * (matches biolog screenshot quality without paying for lossless PNG).
 *
 * Test env (happy-dom) doesn't provide a working <canvas>.toBlob, so
 * the helper falls back to returning the original blob unchanged
 * when canvas operations aren't available. Production browsers run
 * the full pipeline.
 */

const DEFAULT_OPTS = {
  maxDim: 2400,
  quality: 0.85,
  outputType: 'image/jpeg',
};

/**
 * Compress an image Blob/File. Returns the compressed Blob and
 * metadata. Falls back to original blob in environments without
 * working canvas APIs.
 */
export async function compressImage(file, opts = {}) {
  const { maxDim, quality, outputType } = { ...DEFAULT_OPTS, ...opts };
  if (!file) throw new Error('compressImage: file required');

  // Bail in non-browser env (tests).
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return { blob: file, compressed: false, originalSize: file.size };
  }

  // Attempt the canvas pipeline; on any error fall back to original.
  try {
    const img = await loadImageFromBlob(file);
    const { width, height } = scaleToMax(img.width, img.height, maxDim);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { blob: file, compressed: false, originalSize: file.size };
    }
    ctx.drawImage(img, 0, 0, width, height);
    const compressed = await canvasToBlob(canvas, outputType, quality);
    if (!compressed) {
      return { blob: file, compressed: false, originalSize: file.size };
    }
    return {
      blob: compressed,
      compressed: true,
      originalSize: file.size,
      width,
      height,
    };
  } catch {
    return { blob: file, compressed: false, originalSize: file.size };
  }
}

function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    let settled = false;
    const cleanup = () => {
      settled = true;
      try { URL.revokeObjectURL(url); } catch { /* swallow */ }
    };
    // Timeout guard — happy-dom doesn't actually decode image bytes so
    // onload/onerror never fire on synthetic Uint8Array fixtures. Bail
    // after 300ms so the production canvas pipeline still works but
    // tests fall through to the original-blob path.
    const timer = setTimeout(() => {
      if (settled) return;
      cleanup();
      reject(new Error('image load timeout'));
    }, 300);
    img.onload = () => {
      if (settled) return;
      clearTimeout(timer);
      cleanup();
      resolve(img);
    };
    img.onerror = () => {
      if (settled) return;
      clearTimeout(timer);
      cleanup();
      reject(new Error('image load failed'));
    };
    img.src = url;
  });
}

function scaleToMax(width, height, maxDim) {
  if (width <= maxDim && height <= maxDim) return { width, height };
  const scale = maxDim / Math.max(width, height);
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob !== 'function') {
      resolve(null);
      return;
    }
    canvas.toBlob(blob => resolve(blob), type, quality);
  });
}

/**
 * Decide whether a file mime type should be auto-recompressed.
 * Spec §4.1 whitelist: image/png + image/jpeg only.
 * Blacklist for bit-perfect preservation: AB1 / PDF / chemical/* /
 * audio / video / unknown binary.
 */
export function shouldCompressMimeType(mimeType) {
  if (!mimeType) return false;
  const m = mimeType.toLowerCase();
  return m === 'image/png' || m === 'image/jpeg' || m === 'image/jpg';
}
