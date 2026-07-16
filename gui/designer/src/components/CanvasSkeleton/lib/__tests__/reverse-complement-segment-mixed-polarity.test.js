/**
 * reverseComplementSegment — mixed-polarity guard (combinatorics-hunt candidate,
 * verify-CONFIRMED but REFUTED here by direct trace).
 *
 * Claim: for a fragment with a 5′ overhang on the LEFT (δL>0) and a 3′ overhang
 * on the RIGHT (δR<0), reverseComplementSegment "drops both overhangs and
 * restores nothing → product length wrong / sites lost".
 *
 * Reality (traced): the stored segment is the TOP-strand slice between the two
 * TOP cuts; the flipped top strand is RC(source[a+δL : b+δR]) — the doc's own
 * formula. For a 5′-left/3′-right end the bases `mid` drops (front δL, tail |δR|)
 * are exactly the bases OUTSIDE [a+δL, b+δR], so NO extras are due. The flipped
 * length is `len + δR − δL` by construction (each shared overhang is owned by
 * exactly one neighbour — the convention that makes forward concat reconstitute
 * every site once). This test pins that the mixed-polarity path is correct.
 */
import { describe, it, expect } from 'vitest';
import { reverseComplementSegment, segmentOverhangs } from '../segment-overhangs';
import { reverseComplement } from '../../../../sequence-utils';

// Custom enzyme map: EcoRI-like 5′ overhang (δ=+4) and PstI-like 3′ overhang (δ=−4).
const RE = {
  Eco: { cut: [1, 5], overhang: 'AATT', end: '5prime' }, // 5′, palindromic
  Pst: { cut: [5, 1], overhang: 'TGCA', end: '3prime' }, // 3′, palindromic
};

function mixedSeg(top) {
  return {
    sequence: top,
    acquisitionMethod: 'restriction',
    // Eco at the lower source position (→ LEFT), Pst higher (→ RIGHT)
    acquisitionParams: { enzymes: ['Eco', 'Pst'], cutSites: [{ position: 10 }, { position: 30 }] },
  };
}

describe('reverseComplementSegment — 5′-left / 3′-right (mixed polarity)', () => {
  const top = 'AATTCGGGGTTTTCCCCTGCA'; // 21 nt, arbitrary
  const seg = mixedSeg(top);

  it('derives δL>0 (5′ left) and δR<0 (3′ right)', () => {
    const oh = segmentOverhangs(seg, RE);
    expect(oh.left.delta).toBeGreaterThan(0);   // 5′
    expect(oh.right.delta).toBeLessThan(0);      // 3′
  });

  it('flipped length = len + δR − δL (overhangs owned once, not dropped erroneously)', () => {
    const oh = segmentOverhangs(seg, RE);
    const dL = oh.left.delta;   // +4
    const dR = oh.right.delta;  // −4
    const out = reverseComplementSegment(seg, RE);
    expect(out.length).toBe(top.length + dR - dL); // 21 − 8 = 13
    // exactly RC of the top slice between the two BOTTOM cuts
    expect(out).toBe(reverseComplement(top.slice(Math.max(0, dL), top.length + Math.min(0, dR))));
  });

  it('all four polarity combos conserve length = len + δR − δL', () => {
    const cases = [
      { L: { cut: [1, 5], overhang: 'AATT' }, R: { cut: [1, 5], overhang: 'AATT' } }, // 5′/5′
      { L: { cut: [5, 1], overhang: 'TGCA' }, R: { cut: [5, 1], overhang: 'TGCA' } }, // 3′/3′
      { L: { cut: [1, 5], overhang: 'AATT' }, R: { cut: [5, 1], overhang: 'TGCA' } }, // 5′/3′
      { L: { cut: [5, 1], overhang: 'TGCA' }, R: { cut: [1, 5], overhang: 'AATT' } }, // 3′/5′
    ];
    for (const c of cases) {
      const re = { L: c.L, R: c.R };
      const s = { sequence: top, acquisitionMethod: 'restriction', acquisitionParams: { enzymes: ['L', 'R'], cutSites: [{ position: 10 }, { position: 30 }] } };
      const oh = segmentOverhangs(s, re);
      const out = reverseComplementSegment(s, re);
      expect(out.length).toBe(top.length + oh.right.delta - oh.left.delta);
    }
  });
});
