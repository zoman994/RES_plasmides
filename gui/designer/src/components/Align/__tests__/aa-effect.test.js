import { describe, it, expect } from 'vitest';
import { aaEffectAt, buildAAEffects } from '../aa-effect';

// Forward CDS: ATG AAA TAA  →  M  K  *   (region 0..9, strand +1)
const FWD = 'ATGAAATAA';
const fwdRegion = { start: 0, end: 9, strand: 1, type: 'CDS' };

describe('aaEffectAt — forward strand', () => {
  it('classifies a missense (K→Q at codon 2)', () => {
    const e = aaEffectAt(FWD, fwdRegion, 3, 'C'); // AAA→CAA
    expect(e.refAA).toBe('K');
    expect(e.altAA).toBe('Q');
    expect(e.effect).toBe('missense');
  });

  it('classifies a silent change (AAA→AAG, still K)', () => {
    const e = aaEffectAt(FWD, fwdRegion, 5, 'G');
    expect(e.effect).toBe('silent');
    expect(e.refAA).toBe('K');
    expect(e.altAA).toBe('K');
  });

  it('classifies a nonsense (AAA→TAA stop)', () => {
    const e = aaEffectAt(FWD, fwdRegion, 3, 'T');
    expect(e.altAA).toBe('*');
    expect(e.effect).toBe('nonsense');
  });

  it('returns null outside the region', () => {
    expect(aaEffectAt(FWD, fwdRegion, 20, 'C')).toBeNull();
  });
});

describe('aaEffectAt — reverse strand', () => {
  // top strand whose reverse-complement reads ATG AAA TAA (M K *)
  const TOP = 'TTATTTCAT';
  const revRegion = { start: 0, end: 9, strand: -1, type: 'CDS' };
  it('classifies a missense on the reverse-strand CDS (K→Q)', () => {
    // read top base G at pos 5 → coding C → CAA = Q
    const e = aaEffectAt(TOP, revRegion, 5, 'G');
    expect(e.refAA).toBe('K');
    expect(e.altAA).toBe('Q');
    expect(e.effect).toBe('missense');
  });
});

describe('buildAAEffects', () => {
  it('maps CDS-internal mismatches to their effect, skipping non-CDS / matches', () => {
    const readByRefPos = {
      3: { base: 'C', status: 'mismatch', bi: 3 }, // missense in CDS
      5: { base: 'G', status: 'mismatch', bi: 5 }, // silent in CDS
      4: { base: 'A', status: 'match', bi: 4 },    // a match — ignored
    };
    const effects = buildAAEffects(FWD, [fwdRegion], [3, 5, 4], readByRefPos);
    expect(effects[3].effect).toBe('missense');
    expect(effects[5].effect).toBe('silent');
    expect(effects[4]).toBeUndefined();
  });

  it('returns {} when there are no translatable regions', () => {
    const readByRefPos = { 3: { base: 'C', status: 'mismatch' } };
    expect(buildAAEffects(FWD, [{ start: 0, end: 9, type: 'misc_feature' }], [3], readByRefPos)).toEqual({});
  });
});
