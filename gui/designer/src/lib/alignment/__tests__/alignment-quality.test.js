import { describe, it, expect } from 'vitest';
import { assessAlignmentQuality, alignmentVerdict } from '../alignment-quality';

describe('assessAlignmentQuality', () => {
  it('flags a zero-length (empty) alignment as no-match', () => {
    const q = assessAlignmentQuality({ alignedLength: 0, alignedB: '', coverageB: 0 });
    expect(q.significant).toBe(false);
    expect(q.flags).toContain('no-match');
    expect(q.warnings.length).toBeGreaterThan(0);
  });

  it('flags a mostly-N read as high-ambiguity', () => {
    const q = assessAlignmentQuality({ alignedLength: 10, alignedB: 'NNNNNNNNAC', coverageB: 100 });
    expect(q.ambiguousFraction).toBeCloseTo(0.8, 5);
    expect(q.flags).toContain('high-ambiguity');
  });

  it('does NOT flag a clean read', () => {
    const q = assessAlignmentQuality({ alignedLength: 10, alignedB: 'ACGTACGTAC', coverageB: 100 });
    expect(q.ambiguousFraction).toBe(0);
    expect(q.flags).toEqual([]);
  });

  it('counts ambiguity over read bases only (ignores gaps)', () => {
    const q = assessAlignmentQuality({ alignedLength: 6, alignedB: 'A--N-C', coverageB: 100 });
    // read bases = A, N, C (3); ambiguous = N (1) → 1/3
    expect(q.ambiguousFraction).toBeCloseTo(1 / 3, 5);
  });

  it('flags low coverage', () => {
    const q = assessAlignmentQuality({ alignedLength: 5, alignedB: 'ACGTA', coverageB: 12 });
    expect(q.flags).toContain('low-coverage');
  });
});

describe('alignmentVerdict — N-aware', () => {
  it('an all-N read is NOT «высокое сходство» despite identity 100%', () => {
    const q = assessAlignmentQuality({ alignedLength: 16, alignedB: 'NNNNNNNNNNNNNNNN', coverageB: 100 });
    const v = alignmentVerdict(100, 100, q);
    expect(v.text).not.toBe('высокое сходство');
    expect(v.text).toContain('много N');
  });

  it('empty alignment reads «нет совпадения»', () => {
    const q = assessAlignmentQuality({ alignedLength: 0, alignedB: '', coverageB: 0 });
    expect(alignmentVerdict(0, 0, q).text).toBe('нет совпадения');
  });

  it('a real homologous read still reads «высокое сходство»', () => {
    const q = assessAlignmentQuality({ alignedLength: 100, alignedB: 'ACGT'.repeat(25), coverageB: 100 });
    expect(alignmentVerdict(98, 100, q).text).toBe('высокое сходство');
  });

  it('low coverage still wins over high identity', () => {
    const q = assessAlignmentQuality({ alignedLength: 11, alignedB: 'ACGTACGTACG', coverageB: 3 });
    expect(alignmentVerdict(100, 3, q).text).toContain('локальное совпадение');
  });
});
