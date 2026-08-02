/**
 * Defect characterisation for SEARCH-GAPPED-DNA — the K0→K3 self-flip.
 *
 * In K0 this file PINNED the defects of the old DNA search as measured (all three were GREEN
 * against the then-current engine). K3 rerouted `seqMatch` to the unified gapped core, so the
 * first two flipped: the same inputs now produce the spec-correct answer, and asserting that is
 * the proof the defect is gone.
 *
 * The third defect lives in `sequence-search.js` (`searchSequence`), which K3 does NOT rewire —
 * it survives only as the Alignment-homolog helper. So it is pinned BOTH ways here: the legacy
 * function still reports its false/asymmetric numbers, while the search path (`seqMatch`) now
 * reports the honest symmetric ones. Keeping both sides visible is deliberate — it stops anyone
 * from treating `searchSequence` as a source of truth for DNA search again.
 *
 * Defects (SPEC §0): 1. short-indel miss; 2. threshold bypass (maxMismatches was the real gate);
 * 3. gap metric — identity 1 with a NEGATIVE mismatch count, and direction-asymmetric penalty.
 */
import { describe, it, expect } from 'vitest';
import { seqMatch as seqMatchSummary } from '../seq-match';

/**
 * U5-A — `seqMatch` answers with the SUMMARY model `{occurrences, locationCount, bestIndex}`, because
 * a row and an inspector must report the same number of loci as the engine found rather than the
 * length of a list that may have been capped. These contracts were written against the bare array and
 * are about the OCCURRENCES, so they unwrap it here — once, explicitly — instead of restating the
 * shape in every assertion.
 */
const seqMatch = (...args) => seqMatchSummary(...args).occurrences;

import { searchSequence } from '../sequence-search';

const CORE20 = 'ACGTACGTACGTACGTACGT';
const doc = (seq, topology = 'linear') => ({ seq, topology });
const flip = (ch) => (ch === 'A' ? 'C' : 'A');
const at = (hits, start) => hits.find((h) => h.location.segments[0].start === start) || null;

describe('defect 1 — short-indel miss is FIXED (SPEC §0.1)', () => {
  it('a 20-mer present with ONE inserted target base is now FOUND as 20/21', () => {
    // Biologically a 20/21 = 95.24% hit. The old window scanner could not represent the gap and
    // returned [] — pinned in K0. The unified core represents it as a single deletion.
    const target = `${CORE20.slice(0, 10)}G${CORE20.slice(10)}`; // 21 nt
    const hits = seqMatch(CORE20, doc(target), {}, { identityThreshold: 0.8, bothStrands: false });
    expect(hits.length).toBeGreaterThan(0); // <-- the miss is gone
    const h = at(hits, 0);
    expect(h).toBeTruthy();
    expect(h.metrics.deletions).toBe(1);
    expect(h.metrics.alignmentLength).toBe(21);
    expect(h.metrics.identity).toBeCloseTo(20 / 21, 12);
  });
});

describe('defect 2 — the threshold is now the real gate (SPEC §0.2)', () => {
  it('a 1-substitution 20-mer (95%) is FOUND at threshold 0.8', () => {
    const t = [...CORE20]; t[5] = flip(t[5]);
    // Old: default maxMismatches=0 rejected it, so the visible 80% threshold was decorative.
    const hits = seqMatch(CORE20, doc(t.join('')), {}, { identityThreshold: 0.8, bothStrands: false });
    const h = at(hits, 0);
    expect(h).toBeTruthy();
    expect(h.metrics.identity).toBeCloseTo(0.95, 12);
    expect(h.metrics.substitutions).toBe(1);
  });

  it('a 5-substitution 20-mer (75%) is REJECTED even with a generous legacy maxMismatches', () => {
    const f = [...CORE20]; for (const i of [0, 4, 8, 12, 16]) f[i] = flip(f[i]);
    // Old: maxMismatches:6 admitted this 75% hit. Now maxMismatches executes nowhere (§5.1).
    const hits = seqMatch(CORE20, doc(f.join('')), {}, { identityThreshold: 0.8, maxMismatches: 6 });
    expect(hits).toEqual([]);
  });
});

describe('defect 3 — gap metric: fixed on the search path, still present in the legacy helper', () => {
  const LONG = CORE20 + CORE20; // 40 nt
  const targetIns = `${LONG.slice(0, 20)}G${LONG.slice(20)}`; // extra base in the TARGET (41 nt)

  it('LEGACY searchSequence still reports identity 1 and a NEGATIVE mismatch count', () => {
    // Not rewired by K3 — it remains only for Alignment homologs. Pinned so the defect cannot be
    // mistaken for current search behaviour.
    const [hit] = searchSequence(LONG, targetIns, { identityThreshold: 0.8, bothStrands: false });
    expect(hit.identity).toBe(1); //    falsely perfect: the extra target base is uncounted
    expect(hit.mismatches).toBe(-1); // the denominator error surfaces as a negative count
  });

  it('the SEARCH PATH now reports the honest 40/41 with a real deletion', () => {
    const h = at(seqMatch(LONG, doc(targetIns), {}, { identityThreshold: 0.8, bothStrands: false }), 0);
    expect(h).toBeTruthy();
    expect(h.metrics.identity).toBeCloseTo(40 / 41, 12);
    expect(h.metrics.deletions).toBe(1);
    expect(h.metrics.substitutions).toBe(0);
    expect(h.metrics.alignmentLength).toBe(41);
  });

  it('and it is now SYMMETRIC: the same base inserted the other way scores identically', () => {
    const queryIns = `${LONG.slice(0, 20)}G${LONG.slice(20)}`; // extra base in the QUERY
    const tgt = at(seqMatch(LONG, doc(targetIns), {}, { identityThreshold: 0.8, bothStrands: false }), 0);
    const qry = at(seqMatch(queryIns, doc(LONG), {}, { identityThreshold: 0.8, bothStrands: false }), 0);
    expect(tgt.metrics.identity).toBeCloseTo(qry.metrics.identity, 12);
    expect(tgt.metrics.deletions).toBe(1);
    expect(qry.metrics.insertions).toBe(1); // old engine: 1.0 vs 0.9756 — asymmetric
  });
});
