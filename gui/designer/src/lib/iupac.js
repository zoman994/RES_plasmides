/**
 * iupac — the degenerate-base engine (P1.5).
 *
 * The DNA search must treat ambiguity codes (N/R/Y/…) as *compatibility* — a
 * query `GN` matches `GA` and `GT` — which is a bit-mask overlap test, not a
 * character comparison. This module is the single source for that, plus the
 * canonical complement / reverse-complement (retiring the truncated
 * `{A,T,G,C,N}` map in sequence-search.js that silently N-ified R/Y/S/W/… and
 * left U un-complemented).
 *
 * Bit convention: A=1, C=2, G=4, T=8; U is normalized to T. An ambiguity code is
 * the OR of its members (R=A|G, N=A|C|G|T, …). Pure; reuses the canonical
 * COMPLEMENT_MAP (sequence-utils) so there is exactly one complement table.
 */
import { COMPLEMENT_MAP } from '../sequence-utils';

const A = 1; const C = 2; const G = 4; const T = 8;

// Single-source bit table (uppercase). U shares T's bit.
const BITS = {
  A, C, G, T, U: T,
  R: A | G, Y: C | T, S: C | G, W: A | T, K: G | T, M: A | C,
  B: C | G | T, D: A | G | T, H: A | C | T, V: A | C | G,
  N: A | C | G | T,
};

/** IUPAC symbol → 4-bit mask over {A,C,G,T}. 0 for gaps / junk / empty. */
export function iupacBits(base) {
  if (!base) return 0;
  return BITS[base.toUpperCase()] || 0;
}

/**
 * Compatibility: do two (possibly ambiguous) symbols share ≥1 concrete base?
 * `iupacMatch('R','A') === true`. A gap (mask 0) never matches.
 */
export function iupacMatch(a, b) {
  const x = iupacBits(a);
  if (x === 0) return false;
  const y = iupacBits(b);
  if (y === 0) return false;
  return (x & y) !== 0;
}

/** Uppercase + U→T for a single base. */
export function normalizeBase(base) {
  if (!base) return '';
  const u = base.toUpperCase();
  return u === 'U' ? 'T' : u;
}

/** Uppercase + U→T for a whole sequence (RNA → DNA alphabet). */
export function normalizeSeq(seq) {
  if (!seq) return '';
  return seq.toUpperCase().replace(/U/g, 'T');
}

/**
 * Canonical IUPAC complement (U→A). Uses COMPLEMENT_MAP after U→T normalization,
 * so uracil complements to adenine and every ambiguity code is handled.
 */
export function iupacComplement(base) {
  const n = normalizeBase(base);
  return COMPLEMENT_MAP[n] || n;
}

/** Reverse-complement respecting the full IUPAC alphabet (RNA input normalized). */
export function reverseComplementIupac(seq) {
  if (!seq) return '';
  const s = normalizeSeq(seq);
  const out = new Array(s.length);
  for (let i = 0; i < s.length; i++) {
    out[i] = COMPLEMENT_MAP[s[s.length - 1 - i]] || s[s.length - 1 - i];
  }
  return out.join('');
}

// popcount over the 4-bit masks (tiny lookup).
const POPCOUNT = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

/** True if a symbol represents more than one concrete base (R/Y/…/N). */
export function isDegenerate(base) {
  return POPCOUNT[iupacBits(base)] > 1;
}

/**
 * How many concrete sequences a (possibly ambiguous) string represents —
 * the product of per-base member counts. Empty → 1 (neutral). Used to guard
 * against a degeneracy explosion before an exhaustive expansion.
 */
export function degeneracy(seq) {
  if (!seq) return 1;
  let n = 1;
  for (let i = 0; i < seq.length; i++) {
    const c = POPCOUNT[iupacBits(seq[i])];
    if (c > 0) n *= c;
  }
  return n;
}
