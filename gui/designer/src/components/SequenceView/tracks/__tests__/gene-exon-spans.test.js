/**
 * gene-exon-spans.test.js — exon (gap) intervals for the «вариант A» intron
 * rendering: a gene minus its introns, clipped to the visible window.
 */
import { describe, it, expect } from 'vitest';
import { exonSegments } from '../gene-exon-spans';

describe('exonSegments', () => {
  it('splits a gene into exons around one intron', () => {
    expect(exonSegments(0, 120, [[30, 90]])).toEqual([[0, 30], [90, 120]]);
  });

  it('returns the whole window when there are no introns', () => {
    expect(exonSegments(0, 120, [])).toEqual([[0, 120]]);
  });

  it('handles two introns → three exons', () => {
    expect(exonSegments(0, 500, [[100, 200], [300, 400]]))
      .toEqual([[0, 100], [200, 300], [400, 500]]);
  });

  it('clips introns to the visible window (wrapped line)', () => {
    // window [50,150); intron [30,90) clips to [50,90) → exon [90,150)
    expect(exonSegments(50, 150, [[30, 90]])).toEqual([[90, 150]]);
  });

  it('merges overlapping introns', () => {
    expect(exonSegments(0, 200, [[40, 90], [80, 120]])).toEqual([[0, 40], [120, 200]]);
  });

  it('drops a leading exon when an intron starts at the window edge', () => {
    expect(exonSegments(0, 120, [[0, 30]])).toEqual([[30, 120]]);
  });

  it('returns no exons when the window is fully intronic', () => {
    expect(exonSegments(40, 80, [[0, 200]])).toEqual([]);
  });

  it('returns nothing for a zero-width window', () => {
    expect(exonSegments(50, 50, [[10, 20]])).toEqual([]);
  });
});
