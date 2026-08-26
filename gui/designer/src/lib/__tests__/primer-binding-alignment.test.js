import { describe, expect, it } from 'vitest';

import { alignPrimerBinding } from '../primer-binding-alignment';

const run = (op, queryStart, queryEnd, targetStart, targetEnd) => ({
  op, queryStart, queryEnd, targetStart, targetEnd,
});

describe('alignPrimerBinding — aligned-v1 M/X/I/D contract', () => {
  it('reports exact half-open M/X runs without changing the target span', () => {
    const result = alignPrimerBinding('ACGT', 'ACAT');
    expect(result.runs).toEqual([
      run('M', 0, 2, 0, 2),
      run('X', 2, 3, 2, 3),
      run('M', 3, 4, 3, 4),
    ]);
    expect(result.counts).toEqual({ M: 3, X: 1, I: 0, D: 0 });
    expect(result.targetSpan).toEqual({ start: 0, end: 4 });
  });

  it('uses the supplied primer orientation and never auto-reverse-complements it', () => {
    const result = alignPrimerBinding('TCGT', 'ACGT');
    expect(result.runs).toEqual([
      run('X', 0, 1, 0, 1),
      run('M', 1, 4, 1, 4),
    ]);
  });

  it('represents one and several query-only bases as insertion runs', () => {
    expect(alignPrimerBinding('ACGAGTAC', 'ACGGTAC').runs).toEqual([
      run('M', 0, 3, 0, 3),
      run('I', 3, 4, 3, 3),
      run('M', 4, 8, 3, 7),
    ]);
    expect(alignPrimerBinding('ACGAAAGTAC', 'ACGGTAC').counts)
      .toEqual({ M: 7, X: 0, I: 3, D: 0 });
  });

  it('represents one and several target-only bases as deletion runs', () => {
    expect(alignPrimerBinding('ACGGTAC', 'ACGAGTAC').runs).toEqual([
      run('M', 0, 3, 0, 3),
      run('D', 3, 3, 3, 4),
      run('M', 3, 7, 4, 8),
    ]);
    expect(alignPrimerBinding('ACGGTAC', 'ACGAAAGTAC').counts)
      .toEqual({ M: 7, X: 0, I: 0, D: 3 });
  });

  it('breaks a homopolymer tie toward the 5-prime side to preserve 3-prime complementarity', () => {
    const result = alignPrimerBinding('AAAA', 'AAA');
    expect(result.runs).toEqual([
      run('I', 0, 1, 0, 0),
      run('M', 1, 4, 0, 3),
    ]);
    expect(result.threePrimeMatchLength).toBe(3);
    expect(result.threePrimeGap).toBe(false);
  });

  it('flags a gap at either physical 3-prime edge without blocking the alignment', () => {
    expect(alignPrimerBinding('ACGTG', 'ACGT').threePrimeGap).toBe(true);
    expect(alignPrimerBinding('ACGT', 'ACGTG').threePrimeGap).toBe(true);
    expect(alignPrimerBinding('ACGAGT', 'ACGT').threePrimeGap).toBe(false);
  });
});
