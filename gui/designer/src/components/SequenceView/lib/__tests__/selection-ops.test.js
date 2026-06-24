import { describe, it, expect } from 'vitest';
import { complementSegments, invertedSlice, stickyEnds } from '../selection-ops.js';

describe('selection-ops — complementSegments (invert overlay)', () => {
  it('mid-sequence feature → two main segments [0,lo) + [hi,len)', () => {
    expect(complementSegments(100, 300, 1000)).toEqual([
      { kind: 'main', start: 0, end: 100 },
      { kind: 'main', start: 300, end: 1000 },
    ]);
  });
  it('feature touching the start → one segment [hi,len)', () => {
    expect(complementSegments(0, 300, 1000)).toEqual([
      { kind: 'main', start: 300, end: 1000 },
    ]);
  });
  it('feature touching the end → one segment [0,lo)', () => {
    expect(complementSegments(700, 1000, 1000)).toEqual([
      { kind: 'main', start: 0, end: 700 },
    ]);
  });
  it('whole sequence selected → empty (nothing to invert)', () => {
    expect(complementSegments(0, 1000, 1000)).toEqual([]);
  });
  it('clamps out-of-range bounds', () => {
    expect(complementSegments(-50, 1500, 1000)).toEqual([]);
  });
});

describe('selection-ops — invertedSlice (copy complement)', () => {
  const seq = 'AAAACCCCGGGGTTTT'; // len 16
  it('linear → [0,lo) + [hi,len)', () => {
    // feature [4,12) = CCCCGGGG → complement = AAAA + TTTT
    expect(invertedSlice(seq, 4, 12, 16, false)).toBe('AAAATTTT');
  });
  it('circular → reads through the origin [hi,len) + [0,lo)', () => {
    expect(invertedSlice(seq, 4, 12, 16, true)).toBe('TTTTAAAA');
  });
  it('whole sequence selected → empty string', () => {
    expect(invertedSlice(seq, 0, 16, 16, false)).toBe('');
  });
});

describe('selection-ops — stickyEnds (overhang detection)', () => {
  // Minimal enzyme table mirroring restriction-db shape.
  const ENZ = {
    EcoRI: { site: 'GAATTC', cut: [1, 5], end: '5prime', overhang: 'AATT' },
    PstI: { site: 'CTGCAG', cut: [5, 1], end: '3prime', overhang: 'TGCA' },
    SmaI: { site: 'CCCGGG', cut: [3, 3], end: 'blunt', overhang: null },
  };
  // flattenSites stores position = recognition + cut[0] (the TOP cut).
  // EcoRI recog@100 → topCut 101; PstI recog@200 → topCut 205.
  const sites = [
    { enzyme: 'EcoRI', position: 101 },
    { enzyme: 'PstI', position: 205 },
    { enzyme: 'SmaI', position: 300 },
  ];

  it('both ends on EcoRI/PstI cuts → per-end deltas (5′ / 3′)', () => {
    const r = stickyEnds({ selStart: 101, selEnd: 205, sites, enzymes: ENZ });
    expect(r.leftDelta).toBe(4); // EcoRI: cut[1]-cut[0] = 5-1
    expect(r.rightDelta).toBe(-4); // PstI: 1-5
    expect(r.left.type).toBe('5prime');
    expect(r.right.type).toBe('3prime');
    expect(r.left.overhang).toBe('AATT');
  });
  it('blunt cutter → delta 0 (no sticky end)', () => {
    // PstI (left, 3′) → SmaI (right, blunt)
    const r = stickyEnds({ selStart: 205, selEnd: 300, sites, enzymes: ENZ });
    expect(r.leftDelta).toBe(-4); // PstI 3′
    expect(r.rightDelta).toBe(0); // SmaI blunt
    expect(r.right.type).toBe('blunt');
  });
  it('only one end on a cut → other delta 0', () => {
    const r = stickyEnds({ selStart: 101, selEnd: 999, sites, enzymes: ENZ });
    expect(r.leftDelta).toBe(4);
    expect(r.rightDelta).toBe(0);
    expect(r.right).toBeNull();
  });
  it('neither end on a cut → null', () => {
    expect(stickyEnds({ selStart: 50, selEnd: 60, sites, enzymes: ENZ })).toBeNull();
  });
  it('guards empty / no sites', () => {
    expect(stickyEnds({ selStart: 1, selEnd: 2, sites: [], enzymes: ENZ })).toBeNull();
    expect(stickyEnds({ selStart: 1, selEnd: 1, sites, enzymes: ENZ })).toBeNull();
  });
});
