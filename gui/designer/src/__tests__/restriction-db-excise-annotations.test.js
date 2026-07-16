/**
 * digest() excise — straddling annotations must be CLIPPED onto the backbone, not
 * dropped (CH-4, combinatorics-hunt confirmed). _linearize splits a feature that
 * spans the cut (V122); the excise paths used to `return null` for any feature
 * whose start/end crossed a cut → silently losing it from the digest product.
 *
 * SEQ has two EcoRI sites (GAATTC). EcoRI cut = site+1 → pos1=5, pos2=19;
 * excised = [5,19), backbone = source [19,29) ++ [0,5) (length 15).
 */
import { describe, it, expect } from 'vitest';
import { digest } from '../restriction-db';

const SEQ = 'AAAAGAATTCTTTTTTTTGAATTCCCCC'; // length 29, 2× GAATTC

const ANNS = [
  { name: 'inBackboneLow', start: 0, end: 4 },
  { name: 'straddleLeft', start: 2, end: 8 }, // crosses pos1=5
  { name: 'inExcised', start: 8, end: 14 }, // fully inside excised
  { name: 'straddleRight', start: 16, end: 22 }, // crosses pos2=19
  { name: 'inBackboneHigh', start: 24, end: 28 },
  { name: 'straddleBoth', start: 3, end: 25 }, // spans the whole excised
];

describe('digest excise — CH-4 straddling annotations clipped, not dropped', () => {
  const r = digest(SEQ, ANNS, 'EcoRI');

  it('takes the excise path (2 EcoRI sites → backbone + excised = whole molecule)', () => {
    expect(r.error).toBeUndefined();
    expect(r.type).toBe('excise');
    expect(r.backbone.length).toBeGreaterThan(0);
    // backbone + excised partition the circular molecule
    expect(r.backbone.length + r.excised.length).toBe(SEQ.length);
  });

  it('straddling features SURVIVE, clipped to the backbone (were dropped before)', () => {
    const names = r.backbone.annotations.map((a) => a.name);
    expect(names).toContain('straddleLeft');
    expect(names).toContain('straddleRight');
  });

  it('a feature fully inside the excised region is NOT on the backbone', () => {
    expect(r.backbone.annotations.map((a) => a.name)).not.toContain('inExcised');
  });

  it('a feature spanning BOTH cuts becomes two backbone arcs', () => {
    expect(r.backbone.annotations.filter((a) => a.name === 'straddleBoth')).toHaveLength(2);
  });

  it('every backbone annotation has valid coords within the backbone', () => {
    for (const a of r.backbone.annotations) {
      expect(a.start).toBeLessThan(a.end);
      expect(a.start).toBeGreaterThanOrEqual(0);
      expect(a.end).toBeLessThanOrEqual(r.backbone.length);
    }
  });

  it('non-straddling features keep their FULL length on the backbone (no clipping regression)', () => {
    const low = r.backbone.annotations.find((a) => a.name === 'inBackboneLow');
    const high = r.backbone.annotations.find((a) => a.name === 'inBackboneHigh');
    expect(low).toBeTruthy();
    expect(high).toBeTruthy();
    // fully-in-backbone features are not straddling → length preserved (4 nt each)
    expect(low.end - low.start).toBe(4);
    expect(high.end - high.start).toBe(4);
  });
});
