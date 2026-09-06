/**
 * Shared DNA sequence utilities — sanitization, complement, reverse complement.
 * Single source of truth for sequence normalization on store entry.
 *
 * Canonical IUPAC order: ATGCNRYSWKMBDHV (alphabet → common IUPAC → rare IUPAC).
 */

// Full IUPAC complement table (V118 fix). sanitizeSequence preserves ambiguity
// codes on entry, so reverseComplement must complement them too — otherwise the
// reverse strand of any sequence carrying R/Y/S/W/K/M/B/D/H/V is silently
// corrupted (was → N). Pairs: A↔T, G↔C, R↔Y, M↔K, S↔S (self), W↔W (self),
// B↔V, D↔H, N↔N.
export const COMPLEMENT_MAP = {
  A: 'T', T: 'A', G: 'C', C: 'G', N: 'N',
  R: 'Y', Y: 'R', S: 'S', W: 'W', K: 'M', M: 'K',
  B: 'V', V: 'B', D: 'H', H: 'D',
  a: 't', t: 'a', g: 'c', c: 'g', n: 'n',
  r: 'y', y: 'r', s: 's', w: 'w', k: 'm', m: 'k',
  b: 'v', v: 'b', d: 'h', h: 'd',
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
 * Validate a prospective value for a controlled DNA-only field.
 * Empty is a valid intermediate edit; every non-empty value is accepted only
 * as a whole, so paste never silently drops or rewrites unsupported symbols.
 */
export function normalizeDnaFieldInput(value) {
  if (value === '') return { accepted: true, value: '' };
  if (!isValidDNA(value)) return { accepted: false, value: null };
  return { accepted: true, value: value.toUpperCase() };
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

/**
 * Reverse complement.
 *
 * Hot-path: ORF detection / primer design / annotation pipelines all hit
 * this on every plasmid. The previous `split('').reverse().map().join('')`
 * spelling allocated three intermediate arrays of length N — measurable
 * GC pressure on long plasmids on weak machines. The walk below builds
 * a single pre-sized array backwards through the input, no slice / no
 * intermediate strings.
 */
export function reverseComplement(seq) {
  if (!seq) return '';
  const len = seq.length;
  const out = new Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = COMPLEMENT_MAP[seq[len - 1 - i]] || 'N';
  }
  return out.join('');
}

const IUPAC_AMBIG_REGEX = /[RYSWKMBDHVNryswkmbdhvn]/g;

/**
 * Sanitize a DNA sequence and return a structured report of removed characters
 * by category (whitespace / digits / punctuation / bom / other) plus IUPAC
 * ambiguity flag.
 *
 * Used by ImportStartScreen paste flow to surface "removed: 47 digits, 32 spaces"
 * sanitize-report and the "содержит IUPAC: R, Y, N" warning card.
 *
 * @param {string} rawText
 * @returns {{ sequence: string, removed: { whitespace: number, digits: number, punctuation: number, bom: number, other: number }, hasIUPAC: boolean, iupacChars: string[] }}
 */
export function sanitizeWithReport(rawText) {
  const removed = { whitespace: 0, digits: 0, punctuation: 0, bom: 0, other: 0 };
  if (!rawText || typeof rawText !== 'string') {
    return { sequence: '', removed, hasIUPAC: false, iupacChars: [] };
  }
  for (const ch of rawText) {
    if (/[ATGCNRYSWKMBDHVatgcnryswkmbdhv]/.test(ch)) continue;
    if (ch === '﻿') removed.bom++;
    else if (/\s/.test(ch)) removed.whitespace++;
    else if (/[0-9]/.test(ch)) removed.digits++;
    else if (/[\p{P}\p{S}]/u.test(ch)) removed.punctuation++;
    else removed.other++;
  }
  const sequence = sanitizeSequence(rawText);
  const ambigSet = new Set();
  const ambigMatches = sequence.match(IUPAC_AMBIG_REGEX);
  if (ambigMatches) for (const c of ambigMatches) ambigSet.add(c.toUpperCase());
  // 'N' is technically ambiguous; spec says hasIUPAC excludes A/T/G/C — N counts.
  const iupacChars = [...ambigSet].sort();
  return {
    sequence,
    removed,
    hasIUPAC: iupacChars.length > 0,
    iupacChars,
  };
}
