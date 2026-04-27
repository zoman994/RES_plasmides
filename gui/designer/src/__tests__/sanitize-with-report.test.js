import { describe, it, expect } from 'vitest';
import { sanitizeWithReport } from '../sequence-utils';

describe('sanitizeWithReport', () => {
  it('clean ATGCATGC → all zeros, no IUPAC', () => {
    const r = sanitizeWithReport('ATGCATGC');
    expect(r.sequence).toBe('ATGCATGC');
    expect(r.removed).toEqual({ whitespace: 0, digits: 0, punctuation: 0, bom: 0, other: 0 });
    expect(r.hasIUPAC).toBe(false);
    expect(r.iupacChars).toEqual([]);
  });

  it('GenBank-style numbered/spaced text → counts whitespace and digits separately', () => {
    const r = sanitizeWithReport('AT GC\n123 ATG');
    expect(r.sequence).toBe('ATGCATG');
    expect(r.removed.digits).toBe(3);
    // 1 space + 1 newline + 1 space = 3 whitespace chars
    expect(r.removed.whitespace).toBe(3);
    expect(r.removed.bom).toBe(0);
    expect(r.removed.punctuation).toBe(0);
    expect(r.hasIUPAC).toBe(false);
  });

  it('ATGCNNRYW → hasIUPAC true with sorted iupacChars', () => {
    const r = sanitizeWithReport('ATGCNNRYW');
    expect(r.sequence).toBe('ATGCNNRYW');
    expect(r.hasIUPAC).toBe(true);
    expect(r.iupacChars).toEqual(['N', 'R', 'W', 'Y']);
  });

  it('empty input → empty sequence and zero counters', () => {
    const r = sanitizeWithReport('');
    expect(r.sequence).toBe('');
    expect(r.removed).toEqual({ whitespace: 0, digits: 0, punctuation: 0, bom: 0, other: 0 });
    expect(r.hasIUPAC).toBe(false);
    expect(r.iupacChars).toEqual([]);
  });
});
