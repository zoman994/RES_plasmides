/**
 * orient-solver-n3-v172 — GAP-5 / P1 / V172 (viability plan + /loop 28.06). The old
 * orientFragments was GREEDY: it anchored seg0 at its stored orientation and oriented
 * each next fragment to mate the previous. That misses a closable N≥3 ring whose ONLY
 * valid orientation needs seg0 flipped.
 *
 * Concrete failure (derived by hand, palindromic 5′ overhangs):
 *   f0 = EcoRI|BamHI   → ends (AATT, GATC)
 *   f1 = EcoRI|HindIII → ends (AATT, AGCT)
 *   f2 = HindIII|BamHI → ends (AGCT, GATC)
 *   Closes ONLY as: f0 reversed [GATC..AATT], f1 fwd, f2 fwd →
 *     AATT~AATT, AGCT~AGCT, GATC~GATC. Greedy (seg0 forward) finds no mate at f1 → false.
 *
 * Fix: backtracking solver, STORED-orientation-first (preserves a valid layout, no
 * gratuitous flips), greedy fallback when no full solution exists (linear / unclosable
 * cases unchanged).
 */
import { describe, it, expect } from 'vitest';
import { orientFragments } from '../segment-overhangs.js';

const ENZ = {
  EcoRI: { cut: [1, 5], end: '5prime', overhang: 'AATT' },
  BamHI: { cut: [1, 5], end: '5prime', overhang: 'GATC' },
  HindIII: { cut: [1, 5], end: '5prime', overhang: 'AGCT' },
};
const reSeg = (enzymes, positions) => ({
  acquisitionMethod: 'restriction',
  acquisitionParams: { enzymes, cutSites: positions.map((p) => ({ position: p })) },
});

describe('orientFragments — N≥3 ring closure solver (V172/GAP-5)', () => {
  it('3-fragment ring that closes ONLY with seg0 flipped — solver finds it (greedy missed)', () => {
    const f0 = reSeg(['EcoRI', 'BamHI'], [10, 40]); // (AATT, GATC)
    const f1 = reSeg(['EcoRI', 'HindIII'], [10, 40]); // (AATT, AGCT)
    const f2 = reSeg(['HindIII', 'BamHI'], [10, 40]); // (AGCT, GATC)
    const r = orientFragments([f0, f1, f2], ENZ, { circular: true });
    expect(r.closes).toBe(true);
    expect(r.chainMates).toBe(true);
    expect(r.orientations[0].reversed).toBe(true); // seg0 had to flip
  });

  it('all-forward closable ring keeps seg0 forward (stored-first, no gratuitous flip)', () => {
    const f0 = reSeg(['EcoRI', 'BamHI'], [10, 40]); // (AATT, GATC)
    const f1 = reSeg(['BamHI', 'HindIII'], [10, 40]); // (GATC, AGCT)
    const f2 = reSeg(['HindIII', 'EcoRI'], [10, 40]); // (AGCT, AATT)
    const r = orientFragments([f0, f1, f2], ENZ, { circular: true });
    expect(r.closes).toBe(true);
    expect(r.orientations[0].reversed).toBe(false);
  });

  it('genuinely unclosable 3-ring stays closes:false (no false solution)', () => {
    const f0 = reSeg(['EcoRI'], [10]); // AATT both ends
    const f1 = reSeg(['BamHI'], [10]); // GATC both ends
    const f2 = reSeg(['HindIII'], [10]); // AGCT both ends
    expect(orientFragments([f0, f1, f2], ENZ, { circular: true }).closes).toBe(false);
  });

  it('2-fragment palindromic ring still closes (regression)', () => {
    const f0 = reSeg(['EcoRI'], [10]);
    const f1 = reSeg(['EcoRI'], [50]);
    expect(orientFragments([f0, f1], ENZ, { circular: true }).closes).toBe(true);
  });

  it('linear 3-chain: internal mates reported, no closure required', () => {
    const f0 = reSeg(['EcoRI', 'BamHI'], [10, 40]); // (AATT, GATC)
    const f1 = reSeg(['BamHI', 'HindIII'], [10, 40]); // (GATC, AGCT)
    const f2 = reSeg(['HindIII', 'EcoRI'], [10, 40]); // (AGCT, AATT)
    const r = orientFragments([f0, f1, f2], ENZ, { circular: false });
    expect(r.chainMates).toBe(true);
    expect(r.closes).toBe(false); // linear
  });
});
