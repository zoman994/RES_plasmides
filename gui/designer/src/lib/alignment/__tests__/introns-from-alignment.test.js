/**
 * introns-from-alignment.test.js — candidate introns = runs of reference
 * positions the read skips (deletions) within the aligned span.
 */
import { describe, it, expect } from 'vitest';
import { intronsFromAlignment } from '../introns-from-alignment';

// ref = exon1(4) + intron(24, GT…AG) + exon2(4) = 32nt; read covers the exons,
// skips the intron (gapB on positions 4..27).
const REF = 'AAAA' + 'GT' + 'N'.repeat(20) + 'AG' + 'CCCC';

function alignToRef({ gapStart, gapEnd, end = REF.length - 1 }) {
  const readByRefPos = {};
  for (let p = 0; p <= end; p++) {
    readByRefPos[p] = (p >= gapStart && p < gapEnd)
      ? { base: '-', status: 'gapB', bi: null }
      : { base: REF[p], status: 'match', bi: p };
  }
  return { span: { start: 0, end }, readByRefPos };
}

describe('intronsFromAlignment', () => {
  it('calls a GT…AG intron from the read deletion run', () => {
    const introns = intronsFromAlignment(alignToRef({ gapStart: 4, gapEnd: 28 }), REF);
    expect(introns).toHaveLength(1);
    expect(introns[0]).toMatchObject({ start: 4, end: 28, donor: 'GT', acceptor: 'AG', canonical: true });
  });

  it('ignores a gap shorter than minGap', () => {
    // a 10nt gap with default minGap 20 → nothing
    const introns = intronsFromAlignment(alignToRef({ gapStart: 4, gapEnd: 14 }), REF);
    expect(introns).toHaveLength(0);
  });

  it('respects a custom minGap', () => {
    const introns = intronsFromAlignment(alignToRef({ gapStart: 4, gapEnd: 14 }), REF, { minGap: 8 });
    expect(introns).toHaveLength(1);
    expect(introns[0]).toMatchObject({ start: 4, end: 14 });
  });

  it('flags a non-canonical gap (not GT…AG)', () => {
    const ref = 'AAAA' + 'CC' + 'N'.repeat(20) + 'TT' + 'CCCC';
    const introns = intronsFromAlignment(alignToRef({ gapStart: 4, gapEnd: 28 }), ref);
    expect(introns[0]).toMatchObject({ donor: 'CC', acceptor: 'TT', canonical: false });
  });

  it('returns nothing when the read covers the whole span', () => {
    const at = alignToRef({ gapStart: -1, gapEnd: -1 });
    expect(intronsFromAlignment(at, REF)).toEqual([]);
  });

  it('handles a trailing gap that runs to the end of the span', () => {
    // gap from 8 to the end (24nt) → one intron [8, 32)
    const introns = intronsFromAlignment(alignToRef({ gapStart: 8, gapEnd: 32 }), REF);
    expect(introns).toHaveLength(1);
    expect(introns[0]).toMatchObject({ start: 8, end: 32 });
  });
});
