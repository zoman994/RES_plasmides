/**
 * buildPromoteCandidate (SPEC_COMMON_FEATURES DEC-CF-D) — the protein-pathway
 * translation rule for promoted features. CDS/marker/reporter get a frame-0
 * protein (trailing stop stripped); non-CDS get sequence only.
 */
import { describe, it, expect } from 'vitest';
import { buildPromoteCandidate } from '../usePromoteToCommon';

// 36 nt: M K L ... ending in a TAA stop.
const CDS = 'ATGAAACTGGTGACCTATGCGTGCGATGAATTCTAA';

describe('buildPromoteCandidate', () => {
  it('CDS gets a translated protein with the trailing stop stripped', () => {
    const c = buildPromoteCandidate({ name: 'g', type: 'CDS', sequence: CDS });
    expect(c.sequence).toBe(CDS);
    expect(c.protein).toBeDefined();
    expect(c.protein[0]).toBe('M');
    expect(c.protein.endsWith('*')).toBe(false);
  });

  it('marker and reporter are also protein-pathway', () => {
    expect(buildPromoteCandidate({ name: 'm', type: 'marker', sequence: CDS }).protein).toBeDefined();
    expect(buildPromoteCandidate({ name: 'r', type: 'reporter', sequence: CDS }).protein).toBeDefined();
  });

  it('non-CDS types carry no protein', () => {
    const c = buildPromoteCandidate({ name: 'p', type: 'promoter', sequence: CDS });
    expect(c.protein).toBeUndefined();
  });

  it('cleans non-letters and uppercases the sequence', () => {
    const c = buildPromoteCandidate({ name: 'x', type: 'misc_feature', sequence: 'atg c-g\nta' });
    expect(c.sequence).toBe('ATGCGTA');
  });
});
