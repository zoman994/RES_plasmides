/**
 * bodge-attachments — runtime attachment lifecycle.
 *
 * Spec §4. Manages the runtime Map<attId, {blobUrl, blob, manifest}>
 * that the markdown renderer + UI consume.
 *
 *   loadAttachments(notebookSection, blobs) → Map
 *     Called on open project; pairs manifest metadata with raw bytes
 *     from the ZIP, creates blob URLs.
 *
 *   revokeAttachments(map) → void
 *     Called on close project / unmount; revokes all blob URLs to
 *     prevent memory leaks (50 photos × 1 MB = 50 MB otherwise).
 *
 *   attachFileToNotebookEntry(file, map) → {attId, markdownSnippet}
 *     Upload entry-point. Detects mime, recompresses images via
 *     image-compress, generates attId via uuidv7, stamps manifest,
 *     adds blob URL.
 */
import { v7 as uuidv7 } from 'uuid';
import { compressImage, shouldCompressMimeType } from './image-compress';

const ATT_PREFIX = 'att';

/**
 * Build runtime attachment map from a parsed notebook section.
 *
 * @param {object} notebookSection — `{ entries, attachmentsManifest }`.
 * @param {Map<string, Uint8Array>|Record<string,Uint8Array>} blobsByPath
 *   — raw bytes from the ZIP keyed by `notebook/attachments/<filename>`.
 * @returns {Map<string, {blobUrl, blob, manifest}>}
 */
export function loadAttachments(notebookSection, blobsByPath = {}) {
  const map = new Map();
  if (!notebookSection?.attachmentsManifest) return map;
  const getter = blobsByPath instanceof Map
    ? (k) => blobsByPath.get(k)
    : (k) => blobsByPath[k];
  for (const [attId, manifest] of Object.entries(notebookSection.attachmentsManifest)) {
    const filename = attachmentFilename(attId, manifest.mimeType);
    const key = `notebook/attachments/${filename}`;
    const bytes = getter(key);
    if (!bytes) continue; // missing — UI shows placeholder
    const blob = new Blob([bytes], { type: manifest.mimeType || 'application/octet-stream' });
    let blobUrl = '';
    try {
      blobUrl = typeof URL !== 'undefined' && URL.createObjectURL
        ? URL.createObjectURL(blob) : '';
    } catch {
      blobUrl = '';
    }
    map.set(attId, { blobUrl, blob, manifest });
  }
  return map;
}

/**
 * Revoke every blob URL in the map. Critical for memory hygiene on
 * project close + notebook unmount.
 */
export function revokeAttachments(map) {
  if (!map?.forEach) return;
  for (const [, att] of map) {
    if (att?.blobUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
      try { URL.revokeObjectURL(att.blobUrl); } catch { /* swallow */ }
    }
  }
  map.clear?.();
}

/**
 * Upload a single file (from drag-drop, paste, or file picker).
 *
 * Returns { attId, markdownSnippet } so callers can insert the
 * snippet at the cursor. Image files get recompressed per §4.1
 * whitelist; everything else is stored bit-perfect.
 */
export async function attachFileToNotebookEntry(file, attachmentsMap, opts = {}) {
  if (!file) throw new Error('attachFileToNotebookEntry: file required');
  const compressOpt = opts.compress !== false; // default ON for whitelist
  const mimeType = file.type || 'application/octet-stream';
  let blob = file;
  let compressed = false;
  let originalSize = file.size;
  let outMime = mimeType;
  let extHint = inferExtFromMime(mimeType, file.name);

  if (compressOpt && shouldCompressMimeType(mimeType)) {
    const r = await compressImage(file, opts.compressOpts);
    blob = r.blob;
    compressed = r.compressed;
    if (r.compressed) {
      outMime = 'image/jpeg';
      extHint = 'jpg';
    }
  }

  const attId = `${ATT_PREFIX}${uuidv7().slice(0, 12)}`;
  const displayName = opts.displayName || file.name || attId;
  const now = new Date().toISOString();
  const manifest = {
    displayName,
    mimeType: outMime,
    size: blob.size,
    uploadedAt: now,
    compressed,
    ...(compressed ? { originalSize } : {}),
  };
  let blobUrl = '';
  try {
    blobUrl = typeof URL !== 'undefined' && URL.createObjectURL
      ? URL.createObjectURL(blob) : '';
  } catch {
    blobUrl = '';
  }
  attachmentsMap.set(attId, { blobUrl, blob, manifest });
  const altText = displayName.replace(/\]/g, '');
  const markdownSnippet = `![${altText}](${attId}.${extHint})`;
  return { attId, markdownSnippet };
}

/**
 * Construct the ZIP-internal filename for an attachment, given the
 * attId + mime type. Used by writer (CORE K6 already plumbs the kind;
 * NB-K17 fills in the binary path).
 */
export function attachmentFilename(attId, mimeType) {
  const ext = inferExtFromMime(mimeType, '');
  return `${attId}.${ext}`;
}

function inferExtFromMime(mimeType, filename) {
  if (filename) {
    const m = /\.([a-zA-Z0-9]+)$/.exec(filename);
    if (m) return m[1].toLowerCase();
  }
  if (!mimeType) return 'bin';
  const m = mimeType.toLowerCase();
  if (m === 'image/png') return 'png';
  if (m === 'image/jpeg' || m === 'image/jpg') return 'jpg';
  if (m === 'image/gif') return 'gif';
  if (m === 'image/svg+xml') return 'svg';
  if (m === 'application/pdf') return 'pdf';
  if (m === 'chemical/x-ab1') return 'ab1';
  if (m === 'chemical/seq-na-genbank') return 'gb';
  if (m === 'application/json') return 'json';
  if (m === 'text/markdown') return 'md';
  if (m === 'text/plain') return 'txt';
  return 'bin';
}

export { ATT_PREFIX };
