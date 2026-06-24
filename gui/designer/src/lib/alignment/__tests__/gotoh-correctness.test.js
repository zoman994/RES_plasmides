/**
 * gotoh-correctness.test.js — audit of the affine-gap engine against an
 * INDEPENDENT oracle (рекомендация литобзора §1; Flouri, Kobert, Rognes,
 * Stamatakis «Are all global alignment algorithms and implementations
 * correct?», bioRxiv 2015 — 5 of 10 inspected Gotoh implementations returned
 * sub-optimal alignments due to gap-matrix initialisation / index bugs).
 *
 * Oracle = `enumScore`: a brute, model-faithful affine DP that enumerates EVERY
 * gap length explicitly (the definition of an affine gap), with no 3-matrix
 * optimisation, no rolled rows and no banding — i.e. it shares none of the code
 * paths where init/index bugs hide. For our penalty set (match>0>mismatch,
 * gapOpen,gapExtend ≤ 0) an opposite-adjacent gap pair is never strictly
 * beneficial, so the enumeration optimum equals the standard 3-state optimum;
 * any divergence is a real engine bug, not a model difference.
 *
 * We fuzz `alignPairwise` (full Gotoh path on short inputs) against the oracle
 * across global / semiglobal / local, check returned alignments re-score to the
 * reported score (traceback consistency), and pin a few adversarial cases.
 */
import { describe, it, expect } from 'vitest';
import { alignPairwise, basesCompatible } from '../align-pairwise';

const P = { match: 2, mismatch: -1, gapOpen: -5, gapExtend: -1 };
const NEG = -Infinity;
const sub = (a, b) => (basesCompatible(a, b) ? P.match : P.mismatch);
const gapCost = (k) => P.gapOpen + (k - 1) * P.gapExtend;

/** Independent oracle: optimal affine score via explicit gap-length enumeration. */
function enumScore(A, B, mode) {
  const n = A.length;
  const m = B.length;
  const local = mode === 'local';
  const semi = mode === 'semiglobal';
  const S = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(NEG));
  S[0][0] = 0;
  for (let i = 1; i <= n; i++) S[i][0] = (local || semi) ? 0 : gapCost(i);
  for (let j = 1; j <= m; j++) S[0][j] = (local || semi) ? 0 : gapCost(j);
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      let best = S[i - 1][j - 1] + sub(A[i - 1], B[j - 1]);
      for (let k = 1; k <= i; k++) if (S[i - k][j] > NEG) best = Math.max(best, S[i - k][j] + gapCost(k));
      for (let k = 1; k <= j; k++) if (S[i][j - k] > NEG) best = Math.max(best, S[i][j - k] + gapCost(k));
      if (local) best = Math.max(best, 0);
      S[i][j] = best;
    }
  }
  if (local) {
    let mx = 0;
    for (let i = 0; i <= n; i++) for (let j = 0; j <= m; j++) mx = Math.max(mx, S[i][j]);
    return mx;
  }
  if (semi) {
    let mx = NEG;
    for (let j = 0; j <= m; j++) mx = Math.max(mx, S[n][j]);
    for (let i = 0; i <= n; i++) mx = Math.max(mx, S[i][m]);
    return mx;
  }
  return S[n][m];
}

/**
 * Re-score an alignment with the affine model — must equal the reported score.
 * Mode-aware: under `semiglobal` the leading/trailing gap columns are FREE
 * terminal gaps, so they are trimmed before scoring the interior (otherwise a
 * legitimate score-0 empty overlap re-scores as a penalised internal gap).
 */
function rescore(alignedA, alignedB, mode) {
  let a = alignedA;
  let b = alignedB;
  if (mode === 'semiglobal') {
    while (a.length && (a[0] === '-' || b[0] === '-')) { a = a.slice(1); b = b.slice(1); }
    while (a.length && (a[a.length - 1] === '-' || b[b.length - 1] === '-')) { a = a.slice(0, -1); b = b.slice(0, -1); }
  }
  let s = 0;
  let inGapA = false;
  let inGapB = false;
  for (let t = 0; t < a.length; t++) {
    const ca = a[t];
    const cb = b[t];
    if (ca === '-') { s += inGapA ? P.gapExtend : P.gapOpen; inGapA = true; inGapB = false; } else if (cb === '-') { s += inGapB ? P.gapExtend : P.gapOpen; inGapB = true; inGapA = false; } else { s += sub(ca, cb); inGapA = false; inGapB = false; }
  }
  return s;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randSeq(rng, len) {
  const A = 'ACGT';
  let s = '';
  for (let i = 0; i < len; i++) s += A[Math.floor(rng() * 4)];
  return s;
}

describe('Gotoh engine — fuzz vs independent oracle (Flouri et al. audit)', () => {
  for (const mode of ['global', 'semiglobal', 'local']) {
    it(`${mode}: optimal score matches the enumeration oracle over random pairs`, () => {
      const rng = mulberry32(0xA11 + mode.length);
      let checked = 0;
      const fails = [];
      for (let t = 0; t < 600; t++) {
        const A = randSeq(rng, 1 + Math.floor(rng() * 9));
        const B = randSeq(rng, 1 + Math.floor(rng() * 9));
        const res = alignPairwise(A, B, { ...P, mode });
        const want = enumScore(A, B, mode);
        if (res.score !== want) fails.push({ A, B, got: res.score, want });
        checked += 1;
      }
      expect(checked).toBe(600);
      expect(fails.slice(0, 5)).toEqual([]); // surfaces the first counterexamples on failure
    });

    it(`${mode}: returned alignment re-scores to the reported score (traceback consistency)`, () => {
      const rng = mulberry32(0xB22 + mode.length);
      const fails = [];
      for (let t = 0; t < 400; t++) {
        const A = randSeq(rng, 2 + Math.floor(rng() * 8));
        const B = randSeq(rng, 2 + Math.floor(rng() * 8));
        const res = alignPairwise(A, B, { ...P, mode });
        if (!res.alignedA) continue;
        const rs = rescore(res.alignedA, res.alignedB, mode);
        if (rs !== res.score) fails.push({ A, B, aA: res.alignedA, aB: res.alignedB, rs, score: res.score });
      }
      expect(fails.slice(0, 5)).toEqual([]);
    });
  }

  it('adversarial: gap-then-match cases where naive affine init/extension misfires', () => {
    // Crafted so a leading/trailing affine gap competes with a diagonal — the
    // exact shape Flouri et al. show breaks incorrect initialisations.
    const cases = [
      ['GGGG', 'AGGGGT', 'global'],
      ['AAAA', 'AA', 'global'],
      ['ACGTACGT', 'ACGAACGT', 'global'],
      ['TTTTAAAA', 'AAAA', 'semiglobal'],
      ['GATTACA', 'GCATGCU'.replace('U', 'T'), 'local'],
      ['ACACACAC', 'ACAC', 'semiglobal'],
    ];
    for (const [A, B, mode] of cases) {
      const res = alignPairwise(A, B, { ...P, mode });
      expect(res.score).toBe(enumScore(A, B, mode));
      if (res.alignedA) expect(rescore(res.alignedA, res.alignedB, mode)).toBe(res.score);
    }
  });

  it('IUPAC-aware scoring agrees with the oracle (degenerate bases match their set)', () => {
    const cases = [
      ['ACGT', 'ARGT', 'global'], // R = A|G → matches A
      ['NNNN', 'ACGT', 'global'], // N matches anything
      ['ACGT', 'ACNT', 'semiglobal'],
    ];
    for (const [A, B, mode] of cases) {
      const res = alignPairwise(A, B, { ...P, mode });
      expect(res.score).toBe(enumScore(A, B, mode));
    }
  });

  // §A6 review: traceback must never index A[-1]/B[-1] (no «undefined» in the
  // alignment) and the aligned rows must reconstruct contiguous spans of A/B.
  it('no traceback boundary leak: alignments are clean and reconstruct A/B', () => {
    const strip = (s) => s.replace(/-/g, '');
    for (const mode of ['global', 'semiglobal', 'local']) {
      const rng = mulberry32(0xCAFE + mode.length);
      for (let t = 0; t < 400; t++) {
        const A = randSeq(rng, 1 + Math.floor(rng() * 10));
        const B = randSeq(rng, 1 + Math.floor(rng() * 10));
        const res = alignPairwise(A, B, { ...P, mode });
        expect(res.alignedA.includes('undefined')).toBe(false);
        expect(res.alignedB.includes('undefined')).toBe(false);
        expect(A.includes(strip(res.alignedA))).toBe(true); // A-row is a contiguous slice of A
        expect(B.includes(strip(res.alignedB))).toBe(true);
      }
    }
  });

  // §A6 review: the WFA fast path, routed through alignPairwise (wfa:true), must
  // match the same oracle — closing the gap that the small-input fuzz (which
  // never triggers WFA on its own) left open. Default scoring has 2e≥x, so WFA
  // and the 3-state model coincide.
  it('WFA path (wfa:true) matches the enumeration oracle for global', () => {
    const rng = mulberry32(0x7FA);
    for (let t = 0; t < 400; t++) {
      const A = randSeq(rng, 1 + Math.floor(rng() * 14));
      const B = randSeq(rng, 1 + Math.floor(rng() * 14));
      const res = alignPairwise(A, B, { ...P, mode: 'global', wfa: true });
      expect(res.engine).toBe('wfa');
      expect(res.score).toBe(enumScore(A, B, 'global'));
      expect(res.alignedA.includes('undefined')).toBe(false);
    }
  });

  // §A6 review: exercise the BANDED Gotoh path (init + traceback) against the
  // oracle. A band ≥ the indel span is exact; substitution-only mutants stay on
  // the main diagonal so band=8 is plenty.
  it('banded Gotoh matches the oracle when the band covers the divergence', () => {
    const rng = mulberry32(0xBA9D);
    for (let t = 0; t < 200; t++) {
      const A = randSeq(rng, 20 + Math.floor(rng() * 12));
      const arr = A.split('');
      const subs = Math.floor(rng() * 4);
      for (let s = 0; s < subs; s++) arr[Math.floor(rng() * arr.length)] = 'ACGT'[Math.floor(rng() * 4)];
      const B = arr.join('');
      const res = alignPairwise(A, B, {
        ...P, mode: 'global', band: 8, wfa: false,
      });
      expect(res.banded).toBe(true);
      expect(res.score).toBe(enumScore(A, B, 'global'));
    }
  });
});
