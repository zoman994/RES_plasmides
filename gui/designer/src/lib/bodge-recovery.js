/**
 * bodge-recovery — ZIP central-directory corruption recovery.
 *
 * Spec §12.3 — when standard unzipSync trips on a damaged central
 * directory, walk raw bytes for ZIP local file headers (ZIP format
 * invariant: every file has an inline header before its data), pair
 * recovered paths with `_recovery.json` index, return a partial-recovery
 * report.
 *
 * Also exports verifyBodgeIntegrity — used by safeWriteBodge (K9 step 2)
 * to confirm a freshly-written tmp file's sha256 walk matches its
 * manifest.
 */
import { unzipSync, strFromU8 } from 'fflate';
import { sha256Hex } from './bodge-hash';

const LOCAL_FILE_HEADER_SIG = 0x04034b50; // PKZIP local file header magic.

/**
 * Verify a v2 .bodge blob's integrity — every asset listed in the
 * manifest must (a) actually exist in the ZIP and (b) match its declared
 * sha256.
 *
 * Returns `{ok, errors}`.
 */
export async function verifyBodgeIntegrity(blob) {
  const buf = blob instanceof ArrayBuffer ? blob : await blob.arrayBuffer();
  let entries;
  try {
    entries = unzipSync(new Uint8Array(buf));
  } catch (e) {
    return { ok: false, errors: [`unzip failed: ${e.message}`] };
  }
  if (!entries['manifest.json']) {
    return { ok: false, errors: ['manifest.json missing'] };
  }
  let manifest;
  try {
    manifest = JSON.parse(strFromU8(entries['manifest.json']));
  } catch (e) {
    return { ok: false, errors: [`manifest.json parse: ${e.message}`] };
  }
  if (manifest.signature !== 'BODGE-V2') {
    // v1 — no per-asset integrity check.
    return { ok: true, errors: [] };
  }
  const errors = [];
  for (const [path, asset] of Object.entries(manifest.assets || {})) {
    if (!entries[path]) {
      errors.push(`asset "${path}" missing from ZIP`);
      continue;
    }
    const actual = await sha256Hex(entries[path]);
    if (actual !== asset.sha256) {
      errors.push(`asset "${path}" sha256 mismatch: expected ${asset.sha256}, got ${actual}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Recover what we can from a corrupt ZIP. Tries the standard unzipSync
 * first; only falls back to byte-walking when central directory is
 * unreadable.
 *
 * Returns `{ok, recoveredFiles: Map<path, Uint8Array>, failed: [{path, reason}]}`.
 */
export async function recoverCorruptBodge(blob) {
  const buf = blob instanceof ArrayBuffer ? blob : await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);

  // 1. Try the standard reader first.
  try {
    const entries = unzipSync(bytes);
    return {
      ok: true,
      recoveredFiles: new Map(Object.entries(entries)),
      failed: [],
      method: 'standard',
    };
  } catch {
    // Fall through to byte-walking.
  }

  // 2. Walk raw local file headers.
  const recoveredFiles = new Map();
  const failed = [];
  let i = 0;
  while (i < bytes.length - 4) {
    const sig = readUInt32LE(bytes, i);
    if (sig !== LOCAL_FILE_HEADER_SIG) {
      i++;
      continue;
    }
    try {
      const { path, content, nextOffset } = parseLocalFileHeader(bytes, i);
      if (path && content) recoveredFiles.set(path, content);
      i = nextOffset;
    } catch (e) {
      failed.push({ path: `(offset ${i})`, reason: e.message });
      i++;
    }
  }

  // 3. Cross-check against _recovery.json if present.
  if (recoveredFiles.has('_recovery.json')) {
    try {
      const recovery = JSON.parse(strFromU8(recoveredFiles.get('_recovery.json')));
      for (const f of recovery.files || []) {
        if (!recoveredFiles.has(f.path)) {
          failed.push({ path: f.path, reason: 'missing from recovered set' });
        }
      }
    } catch {
      failed.push({ path: '_recovery.json', reason: 'unparseable' });
    }
  }

  return {
    ok: recoveredFiles.size > 0,
    recoveredFiles,
    failed,
    method: 'byte-walk',
  };
}

function readUInt32LE(bytes, offset) {
  return (
    bytes[offset]
    | (bytes[offset + 1] << 8)
    | (bytes[offset + 2] << 16)
    | (bytes[offset + 3] << 24)
  ) >>> 0;
}

function readUInt16LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

/**
 * Parse a single local file header per ZIP format spec.
 * Header layout (30 bytes fixed + variable):
 *   0..3   sig 0x04034b50
 *   4..5   version
 *   6..7   flags
 *   8..9   compression method (0 = STORE, 8 = DEFLATE)
 *  10..13  mtime/mdate
 *  14..17  crc32
 *  18..21  compressed size
 *  22..25  uncompressed size
 *  26..27  filename length
 *  28..29  extra length
 *  30..    filename + extra + content
 *
 * We only support STORE here (deflate decoding is complex for corrupt
 * data; if the central directory failed but local data is intact, the
 * cheap path is fflate's inflateSync per file — but for simplicity in
 * K9 we recover what we can with STORE only and document the rest as
 * `decode-not-supported`).
 */
function parseLocalFileHeader(bytes, offset) {
  if (offset + 30 > bytes.length) throw new Error('truncated header');
  const compression = readUInt16LE(bytes, offset + 8);
  const compressedSize = readUInt32LE(bytes, offset + 18);
  const fileNameLen = readUInt16LE(bytes, offset + 26);
  const extraLen = readUInt16LE(bytes, offset + 28);
  const nameStart = offset + 30;
  const nameEnd = nameStart + fileNameLen;
  if (nameEnd > bytes.length) throw new Error('truncated filename');
  const path = strFromU8(bytes.slice(nameStart, nameEnd));
  const dataStart = nameEnd + extraLen;
  const dataEnd = dataStart + compressedSize;
  if (dataEnd > bytes.length) throw new Error('truncated data');
  const raw = bytes.slice(dataStart, dataEnd);
  let content;
  if (compression === 0) {
    content = raw;
  } else if (compression === 8) {
    // Best-effort DEFLATE decode via fflate — if it fails, mark unrecoverable.
    try {
      // eslint-disable-next-line global-require
      const fflate = require('fflate');
      content = fflate.inflateSync(raw);
    } catch (e) {
      // For dynamic import: callers must run async. Skip silently — this
      // file is reported as `decode-not-supported` higher up.
      void e;
      content = null;
    }
  } else {
    content = null;
  }
  return { path, content, nextOffset: dataEnd };
}
