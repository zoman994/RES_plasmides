/**
 * Tests for construct validation and primer quality checks.
 */
import { describe, it, expect } from 'vitest';
import { validateConstruct, checkPrimerQuality, pcrProductSize, groupIdenticalFragments } from '../validate';

describe('validateConstruct', () => {
  it('returns empty for valid simple construct', () => {
    const frags = [
      { name: 'P1', type: 'promoter', sequence: 'ATGATGATG', length: 9 },
      { name: 'G1', type: 'CDS', sequence: 'ATGGCGTAA', length: 9 },
      { name: 'T1', type: 'terminator', sequence: 'AAAAAAA', length: 7 },
    ];
    const w = validateConstruct(frags);
    expect(w.filter(x => x.startsWith('⚠'))).toHaveLength(0);
  });

  it('warns about missing ATG in CDS', () => {
    const frags = [{ name: 'G1', type: 'CDS', sequence: 'GCGGCGTAA', length: 9 }];
    const w = validateConstruct(frags);
    expect(w.some(x => x.includes('ATG'))).toBe(true);
  });

  it('warns about frameshift (length not divisible by 3)', () => {
    const frags = [{ name: 'G1', type: 'CDS', sequence: 'ATGGCGT', length: 7 }];
    const w = validateConstruct(frags);
    expect(w.some(x => x.includes('делится на 3'))).toBe(true);
  });

  it('detects identical adjacent fragments', () => {
    const seq = 'ATGATGATGATG';
    const frags = [
      { name: 'A', type: 'CDS', sequence: seq },
      { name: 'B', type: 'CDS', sequence: seq },
    ];
    const w = validateConstruct(frags);
    expect(w.some(x => x.includes('идентичны'))).toBe(true);
  });

  it('detects identical non-adjacent fragments', () => {
    const seq = 'ATGATGATGATG';
    const frags = [
      { name: 'A', type: 'CDS', sequence: seq },
      { name: 'B', type: 'CDS', sequence: 'GCGGCG' },
      { name: 'C', type: 'CDS', sequence: seq },
    ];
    const w = validateConstruct(frags);
    expect(w.some(x => x.includes('идентичны'))).toBe(true);
  });
});

describe('checkPrimerQuality', () => {
  it('returns empty for good primer', () => {
    // Sequence with GC clamp, no homopolymer, no self-complementarity
    const w = checkPrimerQuality({ bindingSequence: 'ATGAGTCAGTACGATCGC', length: 18 });
    expect(w).toHaveLength(0);
  });

  it('warns about homopolymer runs', () => {
    const w = checkPrimerQuality({ bindingSequence: 'ATGAAAAAGATCGATCGC', length: 18 });
    expect(w.some(x => x.includes('Гомополимер'))).toBe(true);
  });

  it('warns about missing GC clamp', () => {
    const w = checkPrimerQuality({ bindingSequence: 'GCGATCGATCGATCGATA', length: 18 });
    expect(w.some(x => x.includes('GC-клэмп'))).toBe(true);
  });
});

describe('pcrProductSize', () => {
  it('returns null for non-amplified fragments', () => {
    expect(pcrProductSize({ needsAmplification: false, length: 100 }, null, null)).toBeNull();
  });

  it('adds junction lengths to fragment size', () => {
    const frag = { needsAmplification: true, length: 500, sequence: 'A'.repeat(500) };
    const leftJ = { overlapLength: 30 };
    const rightJ = { overlapLength: 25 };
    expect(pcrProductSize(frag, leftJ, rightJ)).toBe(555);
  });
});

describe('groupIdenticalFragments', () => {
  it('groups identical sequences', () => {
    const frags = [
      { name: 'A', sequence: 'ATGATG', needsAmplification: true },
      { name: 'B', sequence: 'GCGGCG', needsAmplification: true },
      { name: 'C', sequence: 'ATGATG', needsAmplification: true },
    ];
    const groups = groupIdenticalFragments(frags);
    expect(groups.size).toBe(2); // two unique sequences
    const atgGroup = groups.get('ATGATG');
    expect(atgGroup.count).toBe(2);
    expect(atgGroup.indices).toEqual([0, 2]);
  });
});
