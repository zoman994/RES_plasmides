import { describe, it, expect } from 'vitest';
import {
  segmentOverhangs, overhangLabel, stickyEndExtent, terminalStagger,
} from '../segment-overhangs.js';

const ENZ = {
  EcoRI: { site: 'GAATTC', cut: [1, 5], end: '5prime', overhang: 'AATT' },
  PstI: { site: 'CTGCAG', cut: [5, 1], end: '3prime', overhang: 'TGCA' },
  SmaI: { site: 'CCCGGG', cut: [3, 3], end: 'blunt', overhang: null },
};

const reSeg = (enzymes, positions) => ({
  acquisitionMethod: 'restriction',
  acquisitionParams: { enzymes, cutSites: positions.map((p) => ({ position: p })) },
});

describe('terminalStagger — strand-offset render geometry (feeds the staircase + seam + gate)', () => {
  const single = (enz) => ({
    acquisitionMethod: 'restriction',
    acquisitionParams: { enzymes: [enz], cutSites: [{ position: 10 }], single: true },
  });

  it('5′ overhang (EcoRI): left → top protrudes, right → bottom protrudes', () => {
    const st = terminalStagger(single('EcoRI'), ENZ);
    expect(st.left).toMatchObject({ end: 'left', protruding: 'top', recessed: 'bottom', len: 4, seq: 'AATT', type: '5prime' });
    expect(st.right).toMatchObject({ end: 'right', protruding: 'bottom', recessed: 'top', len: 4, seq: 'AATT' });
  });

  it('3′ overhang (PstI): left → bottom protrudes, right → top protrudes', () => {
    const st = terminalStagger(single('PstI'), ENZ);
    expect(st.left).toMatchObject({ protruding: 'bottom', type: '3prime', seq: 'TGCA', len: 4 });
    expect(st.right).toMatchObject({ protruding: 'top', type: '3prime' });
  });

  it('a 5′/3′ pair carries the per-end geometry (left=lower cut, right=higher cut)', () => {
    const st = terminalStagger(reSeg(['EcoRI', 'PstI'], [10, 50]), ENZ);
    expect(st.left).toMatchObject({ protruding: 'top', type: '5prime' });   // EcoRI@10
    expect(st.right).toMatchObject({ protruding: 'top', type: '3prime' });  // PstI@50
  });

  it('blunt ends (SmaI) → no stagger', () => {
    expect(terminalStagger(single('SmaI'), ENZ)).toBeNull();
  });

  it('non-restriction segment → null', () => {
    expect(terminalStagger({ acquisitionMethod: 'undefined' }, ENZ)).toBeNull();
  });
});

describe('segment-overhangs — single-cut (#4 linearize)', () => {
  it('one enzyme cut once (single flag) → BOTH ends carry its overhang', () => {
    const seg = {
      acquisitionMethod: 'restriction',
      acquisitionParams: { enzymes: ['EcoRI'], cutSites: [{ position: 10 }], single: true },
    };
    const r = segmentOverhangs(seg, ENZ);
    expect(r.left.enzyme).toBe('EcoRI');
    expect(r.right.enzyme).toBe('EcoRI');
    expect(r.left.seq).toBe('AATT');
    expect(r.right.seq).toBe('AATT');
  });

  it('also fires for exactly one enzyme + one cut without the flag', () => {
    const r = segmentOverhangs(reSeg(['PstI'], [5]), ENZ);
    expect(r.left.enzyme).toBe('PstI');
    expect(r.right.enzyme).toBe('PstI');
  });
});

describe('segment-overhangs — segmentOverhangs', () => {
  it('maps each end to its enzyme by cut position (left = lower)', () => {
    // EcoRI cut at 5 (left), PstI cut at 31 (right)
    const r = segmentOverhangs(reSeg(['EcoRI', 'PstI'], [5, 31]), ENZ);
    expect(r.left.type).toBe('5prime');
    expect(r.left.delta).toBe(4);
    expect(r.left.seq).toBe('AATT');
    expect(r.right.type).toBe('3prime');
    expect(r.right.delta).toBe(-4);
    expect(r.right.seq).toBe('TGCA');
  });
  it('respects cut order regardless of array order', () => {
    // PstI given first but cuts at the HIGHER position → it is the RIGHT end
    const r = segmentOverhangs(reSeg(['PstI', 'EcoRI'], [31, 5]), ENZ);
    expect(r.left.enzyme).toBe('EcoRI');
    expect(r.right.enzyme).toBe('PstI');
  });
  it('blunt cutter → delta 0', () => {
    const r = segmentOverhangs(reSeg(['SmaI', 'EcoRI'], [10, 50]), ENZ);
    expect(r.left.type).toBe('blunt');
    expect(r.left.delta).toBe(0);
  });
  it('returns null for non-restriction segments', () => {
    expect(segmentOverhangs({ acquisitionMethod: 'undefined' }, ENZ)).toBeNull();
    expect(segmentOverhangs({ acquisitionMethod: 'restriction', acquisitionParams: {} }, ENZ)).toBeNull();
    expect(segmentOverhangs(null, ENZ)).toBeNull();
  });
});

describe('segment-overhangs — orientation-aware (reversed fragment)', () => {
  // RC-ORIENT (Игорь 25.06) — a fragment placed REVERSED has its physical ends
  // swapped: the lower-source-position cut becomes its RIGHT end, the higher its
  // LEFT. Classical Type II overhangs are palindromic (self-complementary), so each
  // end's seq + polarity are RC-invariant — only WHICH end is left/right flips.
  it('a REVERSED fragment swaps which enzyme is the LEFT vs RIGHT end', () => {
    const fwd = segmentOverhangs(reSeg(['EcoRI', 'PstI'], [5, 31]), ENZ);
    expect(fwd.left.enzyme).toBe('EcoRI'); // @5
    expect(fwd.right.enzyme).toBe('PstI'); // @31
    const rev = segmentOverhangs({ ...reSeg(['EcoRI', 'PstI'], [5, 31]), reverseComplement: true }, ENZ);
    expect(rev.left.enzyme).toBe('PstI'); // physical left = old right
    expect(rev.right.enzyme).toBe('EcoRI');
    expect(rev.left.type).toBe('3prime'); // PstI polarity invariant under RC
    expect(rev.right.type).toBe('5prime'); // EcoRI
  });

  it('overhang seq is RC-invariant (palindromic Type II) — only the side swaps', () => {
    const rev = segmentOverhangs({ ...reSeg(['EcoRI', 'PstI'], [5, 31]), reverseComplement: true }, ENZ);
    expect(rev.left.seq).toBe('TGCA'); // PstI, unchanged
    expect(rev.right.seq).toBe('AATT'); // EcoRI, unchanged
  });

  it('same enzyme on both ends reversed → unchanged (swap is identity)', () => {
    const seg = {
      acquisitionMethod: 'restriction',
      acquisitionParams: { enzymes: ['EcoRI'], cutSites: [{ position: 10 }], single: true },
      reverseComplement: true,
    };
    const r = segmentOverhangs(seg, ENZ);
    expect(r.left.enzyme).toBe('EcoRI');
    expect(r.right.enzyme).toBe('EcoRI');
  });

  it('reverseComplement:false behaves exactly as forward (back-compat)', () => {
    const a = segmentOverhangs(reSeg(['EcoRI', 'PstI'], [5, 31]), ENZ);
    const b = segmentOverhangs({ ...reSeg(['EcoRI', 'PstI'], [5, 31]), reverseComplement: false }, ENZ);
    expect(b.left.enzyme).toBe(a.left.enzyme);
    expect(b.right.enzyme).toBe(a.right.enzyme);
  });
});

describe('segment-overhangs — stickyEndExtent', () => {
  const ext = (enzymes, positions, extra = {}) => stickyEndExtent({
    start: positions[0], end: positions[1],
    acquisitionParams: { enzymes, cutSites: positions.map((p) => ({ position: p })) },
    reEnzymes: ENZ,
    ...extra,
  });

  it('5′ overhang at the RIGHT end extends `end` outward (bottom strand protrudes past the top cut)', () => {
    // blunt left (SmaI) + 5′ right (EcoRI, delta +4): end 50 → 54, start unchanged
    expect(ext(['SmaI', 'EcoRI'], [10, 50])).toEqual({ start: 10, end: 54 });
  });
  it('3′ overhang at the LEFT end extends `start` outward (bottom strand protrudes before the top cut)', () => {
    // 3′ left (PstI, delta −4) + blunt right (SmaI): start 10 → 6, end unchanged
    expect(ext(['PstI', 'SmaI'], [10, 50])).toEqual({ start: 6, end: 50 });
  });
  it('3′ left + 5′ right extends BOTH ends', () => {
    expect(ext(['PstI', 'EcoRI'], [10, 50])).toEqual({ start: 6, end: 54 });
  });
  it('5′ LEFT does NOT extend (overhang sits on the top strand, already inside [start,end])', () => {
    // EcoRI both ends: left 5′ stays, right 5′ extends
    expect(ext(['EcoRI', 'EcoRI'], [10, 50])).toEqual({ start: 10, end: 54 });
  });
  it('3′ RIGHT does NOT extend (overhang sits on the top strand, already inside)', () => {
    expect(ext(['SmaI', 'PstI'], [10, 50])).toEqual({ start: 10, end: 50 });
  });
  it('both blunt → range unchanged', () => {
    expect(ext(['SmaI', 'SmaI'], [10, 50])).toEqual({ start: 10, end: 50 });
  });
  it('clamps the extended end to seqLen', () => {
    expect(ext(['SmaI', 'EcoRI'], [10, 50], { seqLen: 52 })).toEqual({ start: 10, end: 52 });
  });
  it('clamps the extended start to 0', () => {
    expect(ext(['PstI', 'SmaI'], [2, 50])).toEqual({ start: 0, end: 50 });
  });
  it('normalises start>end order before extending', () => {
    // positions reversed: cuts at 50 (EcoRI, the higher) and 10 (SmaI, lower)
    expect(stickyEndExtent({
      start: 50, end: 10,
      acquisitionParams: { enzymes: ['EcoRI', 'SmaI'], cutSites: [{ position: 50 }, { position: 10 }] },
      reEnzymes: ENZ,
    })).toEqual({ start: 10, end: 54 });
  });
  it('returns the plain [lo,hi] when params are missing (non-RE selection)', () => {
    expect(stickyEndExtent({ start: 10, end: 50, acquisitionParams: {}, reEnzymes: ENZ }))
      .toEqual({ start: 10, end: 50 });
    expect(stickyEndExtent({ start: 10, end: 50 })).toEqual({ start: 10, end: 50 });
  });
});

describe('segment-overhangs — overhangLabel', () => {
  it('formats 5′ / 3′ / blunt', () => {
    expect(overhangLabel({ type: '5prime', seq: 'AATT' })).toBe('5′ AATT');
    expect(overhangLabel({ type: '3prime', seq: 'TGCA' })).toBe('3′ TGCA');
    expect(overhangLabel({ type: 'blunt', seq: null })).toBe('тупой');
    expect(overhangLabel(null)).toBe('');
  });
});
