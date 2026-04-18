/**
 * Shared DNA sequence utilities — sanitization, complement, reverse complement.
 * Single source of truth for sequence normalization on store entry.
 *
 * Canonical IUPAC order: ATGCNRYSWKMBDHV (alphabet → common IUPAC → rare IUPAC).
 */

// TODO (v1.1): COMPLEMENT_MAP does not yet support IUPAC R/Y/S/W/K/M/B/D/H/V.
//   → reverseComplement() converts them to N. If real plasmid data with ambiguity
//   codes breaks primer design, extend to the full IUPAC table.
export const COMPLEMENT_MAP = {
  A: 'T', T: 'A', G: 'C', C: 'G', N: 'N',
  a: 't', t: 'a', g: 'c', c: 'g', n: 'n',
};

/**
 * Canonical IUPAC DNA regex — "characters NOT in the DNA alphabet" (case-insensitive).
 * Exported so downstream cursor-position / display logic can stay in sync with
 * sanitizeSequence. Do not inline this regex anywhere else.
 */
export const IUPAC_DNA_REGEX = /[^ATGCNRYSWKMBDHVatgcnryswkmbdhv]/g;

/** Counterpart: "character IS in the IUPAC DNA alphabet" (case-insensitive). */
export const IUPAC_DNA_CHAR_REGEX = /[ATGCNRYSWKMBDHVatgcnryswkmbdhv]/;

const STRICT_DNA_REGEX = /^[ATGCNRYSWKMBDHV]+$/i;

/**
 * Sanitize a DNA sequence: remove BOM, null bytes, whitespace, digits,
 * non-nucleotide characters. Preserves IUPAC ambiguity codes.
 *
 * Call this ONCE at every data entry point (paste, file import, API response).
 * Downstream code must not sanitize again.
 *
 * @param {string} seq — raw sequence
 * @returns {string} — cleaned uppercase sequence [ATGCNRYSWKMBDHV]
 */
export function sanitizeSequence(seq) {
  if (!seq || typeof seq !== 'string') return '';
  return seq.toUpperCase().replace(IUPAC_DNA_REGEX, '');
}

/**
 * True if the sequence contains only valid DNA characters (IUPAC included).
 * Note: whitespace makes this return false — use sanitizeSequence first if needed.
 *
 * @param {string} seq
 * @returns {boolean}
 */
export function isValidDNA(seq) {
  if (!seq || typeof seq !== 'string') return false;
  return STRICT_DNA_REGEX.test(seq);
}

/**
 * Inspect which non-IUPAC characters would be stripped by sanitizeSequence.
 * Whitespace is ignored (it is stripped but not considered "invalid" — it is
 * a formatting artifact, not illegal content).
 *
 * @param {string} seq
 * @returns {{ hasInvalid: boolean, invalidChars: string[] }}
 */
export function hasInvalidChars(seq) {
  if (!seq || typeof seq !== 'string') return { hasInvalid: false, invalidChars: [] };
  const invalid = new Set();
  for (const ch of seq.toUpperCase()) {
    if (!/[ATGCNRYSWKMBDHV\s]/.test(ch)) invalid.add(ch);
  }
  return { hasInvalid: invalid.size > 0, invalidChars: [...invalid] };
}

export function complement(nt) {
  return COMPLEMENT_MAP[nt] || 'N';
}

export function reverseComplement(seq) {
  return seq.split('').reverse().map(c => complement(c)).join('');
}
