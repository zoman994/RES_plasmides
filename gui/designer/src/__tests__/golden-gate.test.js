/**
 * Tests for Golden Gate overhang design and validation.
 */
import { describe, it, expect } from 'vitest';
import { reverseComplement, checkInternalSites, designOverhangs, resolveConflicts, suggestBestEnzyme, GG_ENZYMES } from '../golden-gate';

describe('reverseComplement', () => {
  it('computes correct RC', () => {
    expect(reverseComplement('ATGC')).toBe('GCAT');
  });

  it('handles single nucleotide', () => {
    expect(reverseComplement('A')).toBe('T');
  });

  it('is an involution (RC of RC = original)', () => {
    const seq = 'ATGCGATCGATCG';
    expect(reverseComplement(reverseComplement(seq))).toBe(seq);
  });

  it('handles N bases', () => {
    expect(reverseComplement('ATNG')).toBe('CNAT');
  });
});

describe('checkInternalSites', () => {
  it('returns ok:true when no sites found', () => {
    const frags = [{ name: 'A', sequence: 'ATGATGATGATGATGATG' }];
    expect(checkInternalSites(frags, 'BsaI').ok).toBe(true);
  });

  it('detects BsaI site (GGTCTC)', () => {
    const frags = [{ name: 'A', sequence: 'ATGGGTCTCATG' }];
    const result = checkInternalSites(frags, 'BsaI');
    expect(result.ok).toBe(false);
    expect(result.problems.length).toBeGreaterThan(0);
  });

  it('detects reverse complement of recognition site', () => {
    const frags = [{ name: 'A', sequence: 'ATGGAGACCATG' }]; // GAGACC = RC of GGTCTC
    const result = checkInternalSites(frags, 'BsaI');
    expect(result.ok).toBe(false);
  });

  it('suggests alternatives when site found', () => {
    const frags = [{ name: 'A', sequence: 'ATGGGTCTCATG' }];
    const result = checkInternalSites(frags, 'BsaI');
    expect(result.alternatives?.length).toBeGreaterThan(0);
  });
});

describe('designOverhangs', () => {
  it('extracts overhangs from junction sequences', () => {
    const frags = [
      { name: 'A', sequence: 'ATGATGATGAC' },
      { name: 'B', sequence: 'TGATGATGATG' },
    ];
    const result = designOverhangs(frags, 'BsaI', false);
    expect(result.overhangs).toHaveLength(1);
    expect(result.overhangs[0].sequence).toHaveLength(4);
  });

  it('detects palindrome overhangs', () => {
    // Force a palindrome: ATAT = RC(ATAT)
    const frags = [
      { name: 'A', sequence: 'XXXXXXXXAT' },
      { name: 'B', sequence: 'ATXXXXXXXX' },
    ];
    const result = designOverhangs(frags, 'BsaI', false);
    const isPalin = result.issues.some(i => i.type === 'palindrome');
    expect(isPalin).toBe(true);
  });

  it('detects duplicate overhangs between identical fragments', () => {
    const seq = 'ATGATGATGATG';
    const frags = [
      { name: 'A', sequence: seq },
      { name: 'B', sequence: seq },
      { name: 'C', sequence: seq },
    ];
    const result = designOverhangs(frags, 'BsaI', false);
    const hasDup = result.issues.some(i => i.type === 'duplicate');
    expect(hasDup).toBe(true);
  });
});

describe('resolveConflicts', () => {
  it('assigns unique orthogonal overhangs for identical fragments', () => {
    const seq = 'ATGATGATGATG';
    const frags = Array.from({ length: 5 }, (_, i) => ({ name: `F${i}`, sequence: seq }));
    const result = resolveConflicts(frags, 'BsaI', false);
    const overhangs = result.overhangs.map(o => o.sequence);
    // All should be unique
    const unique = new Set(overhangs);
    expect(unique.size).toBe(overhangs.length);
  });
});

describe('suggestBestEnzyme', () => {
  it('returns BsaI for fragments without BsaI sites', () => {
    const frags = [{ name: 'A', sequence: 'ATGATGATGATG' }];
    expect(suggestBestEnzyme(frags)).toBe('BsaI');
  });
});

describe('GG_ENZYMES database', () => {
  it('has at least 5 enzymes', () => {
    expect(Object.keys(GG_ENZYMES).length).toBeGreaterThanOrEqual(5);
  });

  it('BsaI has correct recognition site', () => {
    expect(GG_ENZYMES.BsaI.recognition).toBe('GGTCTC');
    expect(GG_ENZYMES.BsaI.overhangLength).toBe(4);
  });

  it('SapI has 3-nt overhangs', () => {
    expect(GG_ENZYMES.SapI.overhangLength).toBe(3);
  });
});
