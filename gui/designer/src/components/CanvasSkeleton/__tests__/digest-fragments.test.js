/**
 * digest-fragments — all fragments of a multi-site digest (the «gel»).
 */
import { describe, it, expect } from 'vitest';
import { digestFragments, fragmentRanges } from '../lib/digest-fragments';

// EcoRI = GAATTC, cut[0] = 1 → top-strand cut at site.position + 1
const UNIT = `${'GAATTC'}${'AAAAAAAAAA'}`; // 16 bp, EcoRI recognition at index 0
const SEQ3 = UNIT.repeat(3); // 48 bp, EcoRI sites at 0,16,32 → cuts at 1,17,33

describe('digestFragments', () => {
  it('circular, 3 EcoRI sites → 3 fragments summing to length, one wraps', () => {
    const { fragments } = digestFragments(SEQ3, ['EcoRI'], true);
    expect(fragments).toHaveLength(3);
    expect(fragments.map((f) => f.length)).toEqual([16, 16, 16]);
    expect(fragments.reduce((s, f) => s + f.length, 0)).toBe(48);
    expect(fragments.filter((f) => f.wraps)).toHaveLength(1);
    fragments.forEach((f) => {
      expect(f.leftEnzyme).toBe('EcoRI');
      expect(f.rightEnzyme).toBe('EcoRI');
    });
  });

  it('linear, 3 cuts → 4 fragments, outer ends native (null enzyme)', () => {
    const { fragments } = digestFragments(SEQ3, ['EcoRI'], false);
    expect(fragments).toHaveLength(4);
    expect(fragments[0].leftEnzyme).toBeNull();
    expect(fragments[3].rightEnzyme).toBeNull();
    expect(fragments.reduce((s, f) => s + f.length, 0)).toBe(48);
  });

  it('no sites → empty', () => {
    expect(digestFragments('AAAATTTT', ['EcoRI'], true).fragments).toEqual([]);
  });
});

describe('fragmentRanges', () => {
  it('non-wrapping fragment → single range', () => {
    expect(fragmentRanges({ start: 1, end: 17, wraps: false }, 48)).toEqual([
      { start: 1, end: 17, orientation: 'forward' },
    ]);
  });

  it('wrapping fragment → two ranges around the origin', () => {
    expect(fragmentRanges({ start: 33, end: 1, wraps: true }, 48)).toEqual([
      { start: 33, end: 48, orientation: 'forward' },
      { start: 0, end: 1, orientation: 'forward' },
    ]);
  });
});
