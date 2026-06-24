/**
 * wfa.test.js — validate the Wavefront aligner against the (already
 * oracle-verified) Gotoh engine. WFA minimises a cost; Gotoh maximises a
 * score. Feeding Gotoh the NEGATED WFA penalties makes them solve the identical
 * problem, so `wfaGlobal.cost === −alignPairwise.score` must hold exactly — a
 * rigorous cross-check with no shared code path. We also verify the
 * score-space transform (`wfaAlignByScore`) and that tracebacks re-score to the
 * reported cost and reconstruct the inputs.
 */
import { describe, it, expect } from 'vitest';
import { wfaGlobal, wfaAlignByScore } from '../wfa';
import { alignPairwise, basesCompatible } from '../align-pairwise';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const randSeq = (rng, len) => {
  let s = '';
  for (let i = 0; i < len; i++) s += 'ACGT'[Math.floor(rng() * 4)];
  return s;
};
const stripGaps = (s) => s.replace(/-/g, '');

/** Re-score a WFA alignment in the cost model: mismatch x, gap run o+ℓ·e. */
function rescoreCost(aA, aB, x, o, e) {
  let c = 0;
  let inGapA = false;
  let inGapB = false;
  for (let t = 0; t < aA.length; t++) {
    const ca = aA[t];
    const cb = aB[t];
    if (ca === '-') { c += inGapA ? e : (o + e); inGapA = true; inGapB = false; } else if (cb === '-') { c += inGapB ? e : (o + e); inGapB = true; inGapA = false; } else { c += basesCompatible(ca, cb) ? 0 : x; inGapA = false; inGapB = false; }
  }
  return c;
}

describe('WFA — exact gap-affine wavefront aligner', () => {
  it('cost == Gotoh cost for sane penalties (o≥x); never worse for any penalty', () => {
    // WFA and our 3-state Gotoh implement slightly different affine models: WFA
    // closes a gap into M for free and may re-open the opposite gap type
    // (I↔D adjacency), Gotoh reaches M only via the diagonal so forbids it.
    // WFA's model is therefore a RELAXATION ⇒ wfa.cost ≤ gotohCost always, and
    // the two COINCIDE once a gap-open is at least as costly as a mismatch
    // (o ≥ x) — the only regime we use (default gapOpen=−5 ⇒ o=4 ≥ x=3).
    const gotohCostOf = (A, B, x, o, e) => -alignPairwise(A, B, {
      // gap length ℓ = o+ℓ·e ⇒ gapOpen = −(o+e) (first base), gapExtend = −e.
      mode: 'global', match: 0, mismatch: -x, gapOpen: -(o + e), gapExtend: -e,
    }).score;

    // (1) Relaxation invariant — for ANY penalties WFA is never worse.
    const relaxFails = [];
    let rng = mulberry32(0x5EED);
    for (let t = 0; t < 800; t++) {
      const A = randSeq(rng, 1 + Math.floor(rng() * 12));
      const B = randSeq(rng, 1 + Math.floor(rng() * 12));
      const x = 1 + Math.floor(rng() * 5);
      const e = 1 + Math.floor(rng() * 3);
      const o = Math.floor(rng() * 8);
      if (wfaGlobal(A, B, { x, o, e }).cost > gotohCostOf(A, B, x, o, e)) relaxFails.push({ A, B, x, o, e });
    }
    expect(relaxFails.slice(0, 6)).toEqual([]);

    // (2) Exact agreement in the coincidence regime (2e ≥ x ⇒ separating two
    // bases into opposite gap runs never beats a mismatch; our default scoring
    // x=3,e=2 lives here). This is the regime the product uses.
    const eqFails = [];
    rng = mulberry32(0x9A9A);
    for (let t = 0; t < 800; t++) {
      const A = randSeq(rng, 1 + Math.floor(rng() * 12));
      const B = randSeq(rng, 1 + Math.floor(rng() * 12));
      const e = 1 + Math.floor(rng() * 3);
      const x = 1 + Math.floor(rng() * (2 * e)); // x ≤ 2e
      const o = 1 + Math.floor(rng() * 6);
      const wfaCost = wfaGlobal(A, B, { x, o, e }).cost;
      const gotohCost = gotohCostOf(A, B, x, o, e);
      if (wfaCost !== gotohCost) eqFails.push({ A, B, x, o, e, wfaCost, gotohCost });
    }
    expect(eqFails.slice(0, 6)).toEqual([]);
  });

  it('traceback re-scores to the optimal cost and reconstructs A and B', () => {
    const rng = mulberry32(0xC0FFEE);
    const fails = [];
    for (let t = 0; t < 500; t++) {
      const A = randSeq(rng, 1 + Math.floor(rng() * 14));
      const B = randSeq(rng, 1 + Math.floor(rng() * 14));
      const x = 1 + Math.floor(rng() * 4);
      const e = 1 + Math.floor(rng() * 2);
      const o = Math.floor(rng() * 4);
      const { cost, alignedA, alignedB } = wfaGlobal(A, B, { x, o, e });
      const ok = alignedA.length === alignedB.length
        && stripGaps(alignedA) === A && stripGaps(alignedB) === B
        && rescoreCost(alignedA, alignedB, x, o, e) === cost;
      if (!ok) fails.push({ A, B, x, o, e, cost, alignedA, alignedB, rs: rescoreCost(alignedA, alignedB, x, o, e) });
    }
    expect(fails.slice(0, 6)).toEqual([]);
  });

  it('score-space transform matches Gotoh global score on the default scoring', () => {
    const rng = mulberry32(0xBEEF);
    const scoring = { match: 2, mismatch: -1, gapOpen: -5, gapExtend: -1 };
    const fails = [];
    for (let t = 0; t < 500; t++) {
      const A = randSeq(rng, 1 + Math.floor(rng() * 16));
      const B = randSeq(rng, 1 + Math.floor(rng() * 16));
      const w = wfaAlignByScore(A, B, scoring);
      const g = alignPairwise(A, B, { ...scoring, mode: 'global' });
      if (!w || w.score !== g.score) fails.push({ A, B, wfa: w && w.score, gotoh: g.score });
    }
    expect(fails.slice(0, 6)).toEqual([]);
  });

  it('high-similarity long pair: identical and near-identical sequences', () => {
    const rng = mulberry32(0x1234);
    const base = randSeq(rng, 800);
    // identical
    let w = wfaAlignByScore(base, base, { match: 2, mismatch: -1, gapOpen: -5, gapExtend: -1 });
    expect(w.cost).toBe(0);
    expect(w.score).toBe(2 * base.length);
    // a couple of substitutions + a small indel
    const mut = `${base.slice(0, 100)}A${base.slice(101, 400)}${base.slice(403)}`; // 1 sub + 3-del
    w = wfaAlignByScore(base, mut, { match: 2, mismatch: -1, gapOpen: -5, gapExtend: -1 });
    const g = alignPairwise(base, mut, { match: 2, mismatch: -1, gapOpen: -5, gapExtend: -1, mode: 'global' });
    expect(w.score).toBe(g.score);
  });

  it('alignPairwise routes large global pairs to WFA and matches Gotoh exactly', () => {
    const rng = mulberry32(0x77);
    const A = randSeq(rng, 300);
    const B = `${A.slice(0, 150)}T${A.slice(151)}`; // 1 substitution
    const viaWfa = alignPairwise(A, B, { mode: 'global', maxFullCells: 100 }); // tiny budget ⇒ "large" ⇒ WFA
    const viaGotoh = alignPairwise(A, B, { mode: 'global', wfa: false });        // full Gotoh (90k < 36e6)
    expect(viaWfa.engine).toBe('wfa');
    expect(viaGotoh.engine).toBe('gotoh');
    expect(viaWfa.score).toBe(viaGotoh.score);
    expect(viaWfa.identity).toBeCloseTo(viaGotoh.identity, 6);
  });

  it('falls back to banded Gotoh when WFA exceeds the divergence cap', () => {
    const rng = mulberry32(0x88);
    const A = randSeq(rng, 200);
    const B = randSeq(rng, 200); // unrelated ⇒ high cost ⇒ exceeds the cap
    const res = alignPairwise(A, B, { mode: 'global', maxFullCells: 100 });
    expect(res.engine).toBe('gotoh'); // WFA aborted, banded Gotoh took over
  });

  it('handles empty input as one terminal gap run', () => {
    expect(wfaGlobal('', '', { x: 3, o: 4, e: 2 }).cost).toBe(0);
    expect(wfaGlobal('ACGT', '', { x: 3, o: 4, e: 2 })).toEqual({ cost: 4 + 4 * 2, alignedA: 'ACGT', alignedB: '----' });
  });
});
