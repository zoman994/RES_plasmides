/**
 * bodge-hash — sha256 helper used by manifest + recovery + dedup.
 *
 * Uses Web Crypto API in browsers / test env (happy-dom).
 * Falls back to node:crypto when subtle is unavailable (raw vitest env).
 */

export async function sha256Hex(input) {
  const bytes = input instanceof Uint8Array
    ? input
    : new TextEncoder().encode(String(input ?? ''));
  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const buf = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return bufferToHex(new Uint8Array(buf));
  }
  // Node fallback for environments without SubtleCrypto.
  const nodeCrypto = await import('node:crypto');
  return nodeCrypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex');
}

function bufferToHex(arr) {
  let s = '';
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i].toString(16);
    s += v.length === 1 ? `0${v}` : v;
  }
  return s;
}

/**
 * Normalize a primer sequence for dedup hashing: uppercase + ATGC-only.
 * Returns the canonical key, NOT a sha256. Used by primer pool dedup
 * (K5) and assembly portable subset (K11).
 */
export function normalizePrimerSequence(seq) {
  if (!seq) return '';
  return String(seq).trim().toUpperCase().replace(/[^ATGCNRYKMSWBDHV]/g, '');
}

export async function primerSequenceHash(seq) {
  const norm = normalizePrimerSequence(seq);
  if (!norm) return '';
  return sha256Hex(norm);
}
