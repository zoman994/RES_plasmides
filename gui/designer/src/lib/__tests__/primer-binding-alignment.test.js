import { describe, expect, it } from 'vitest';

import {
  alignPrimerBinding,
  alignPrimerBindingAtThreePrimeEnd,
  alignPrimerBindingLocallyAtThreePrimeEnd,
} from '../primer-binding-alignment';

const run = (op, queryStart, queryEnd, targetStart, targetEnd) => ({
  op, queryStart, queryEnd, targetStart, targetEnd,
});

describe('alignPrimerBinding — aligned-v1 M/X/I/D contract', () => {
  it('anchored local: keeps a one-base internal insertion between matching islands', () => {
    const core = 'ACGTCAGTACGATCGA';
    const result = alignPrimerBindingLocallyAtThreePrimeEnd(
      `GATTACAG${core}`,
      `GATTACA${core}`,
    );

    expect(result.querySpan).toEqual({ start: 0, end: 24 });
    expect(result.targetSpan).toEqual({ start: 0, end: 23 });
    expect(result.runs).toEqual([
      run('M', 0, 7, 0, 7),
      run('I', 7, 8, 7, 7),
      run('M', 8, 24, 7, 23),
    ]);
    expect(result.score).toBe(40);
  });

  it('anchored local: clips a 50%-identity 5′ coincidence instead of overextending', () => {
    const weakQuery = 'AACC'.repeat(4);
    const weakTarget = 'AAGG'.repeat(4);
    const core = 'ACGTCAGTACGATCGA';
    const result = alignPrimerBindingLocallyAtThreePrimeEnd(
      `${weakQuery}${core}`,
      `${weakTarget}${core}`,
    );

    expect(result.querySpan).toEqual({ start: weakQuery.length, end: weakQuery.length + core.length });
    expect(result.targetSpan).toEqual({ start: weakTarget.length, end: weakTarget.length + core.length });
    expect(result.runs).toEqual([
      run('M', weakQuery.length, weakQuery.length + core.length,
        weakTarget.length, weakTarget.length + core.length),
    ]);
  });

  it('anchored local: never promotes matching ambiguity codes as complementarity', () => {
    const ambiguous = 'NNNN';
    const core = 'ACGTCAGTACGATCGA';
    const result = alignPrimerBindingLocallyAtThreePrimeEnd(
      `${ambiguous}${core}`,
      `${ambiguous}${core}`,
    );

    expect(result.querySpan).toEqual({ start: ambiguous.length, end: 20 });
    expect(result.targetSpan).toEqual({ start: ambiguous.length, end: 20 });
    expect(result.runs).toEqual([
      run('M', ambiguous.length, 20, ambiguous.length, 20),
    ]);
  });

  it('classifies matching ambiguity codes as X inside the mandatory core too', () => {
    const result = alignPrimerBinding('ACGTNACGT', 'ACGTNACGT');

    expect(result.runs).toEqual([
      run('M', 0, 4, 0, 4),
      run('X', 4, 5, 4, 5),
      run('M', 5, 9, 5, 9),
    ]);
    expect(result.counts).toEqual({ M: 8, X: 1, I: 0, D: 0 });
  });

  it('fixed 3′: treats an equally long nonmatching 5′ prefix as query-only, not fake substitutions', () => {
    const core = 'ACGTCAGTACGATCGA';
    const result = alignPrimerBindingAtThreePrimeEnd(`GGG${core}`, `ACA${core}`);

    expect(result.runs).toEqual([
      run('I', 0, 3, 3, 3),
      run('M', 3, 19, 3, 19),
    ]);
    expect(result.targetSpan).toEqual({ start: 3, end: 19 });
    expect(result.counts).toEqual({ M: 16, X: 0, I: 3, D: 0 });
  });

  it('fixed 3′: preserves a true internal substitution instead of clipping the prefix around it', () => {
    const result = alignPrimerBindingAtThreePrimeEnd(
      'AACAGTCAGTACGATCGA',
      'AAAAGTCAGTACGATCGA',
    );

    expect(result.runs).toEqual([
      run('M', 0, 2, 0, 2),
      run('X', 2, 3, 2, 3),
      run('M', 3, 18, 3, 18),
    ]);
    expect(result.targetSpan).toEqual({ start: 0, end: 18 });
    expect(result.counts).toEqual({ M: 17, X: 1, I: 0, D: 0 });
  });

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
    // A distinctive 3' flank keeps a genuine internal multi-base deletion the
    // minimum-edit answer: clipping would cost more or lose the exact 3' anchor.
    expect(alignPrimerBinding('ACGTCAG', 'ACGTAACAG').counts)
      .toEqual({ M: 7, X: 0, I: 0, D: 2 });
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
    expect(alignPrimerBinding('ACGAGT', 'ACGT').threePrimeGap).toBe(false);
  });

  // P5 — the whole physical query lands on a SUBSPAN of the stored anchor. A
  // terminal trim shortens the honest landing; the anchor overhang is a free
  // suffix clip, NOT a run of 3' deletions. Old global alignment consumed the
  // whole target and reported the overhang as D.
  it('P5: clips a free target suffix instead of calling it a 3-prime deletion', () => {
    const result = alignPrimerBinding('CTCACTATAG', 'CTCACTATAGGGGAATTGTGAGCGGATAACA');
    expect(result.targetSpan).toEqual({ start: 0, end: 10 });
    expect(result.counts.D).toBe(0);
    expect(result.editDistance).toBe(0);
    expect(result.threePrimeMatchLength).toBe(10);
    expect(result.threePrimeGap).toBe(false);
  });

  // P5 — a free LEADING clip: an exactly trimmed 3' subsequence lands on the
  // anchor's suffix, and the skipped prefix is not a deletion.
  it('P5: clips a free target prefix for an exact 3-prime landing', () => {
    const result = alignPrimerBinding('GGGAATT', 'CTCACTATAGGGGAATT');
    expect(result.targetSpan).toEqual({ start: 10, end: 17 });
    expect(result.counts).toEqual({
      M: 7, X: 0, I: 0, D: 0,
    });
    expect(result.editDistance).toBe(0);
    expect(result.threePrimeMatchLength).toBe(7);
    expect(result.threePrimeGap).toBe(false);
  });

  // P5 — an internal target-only gap flanked by aligned query on BOTH sides
  // stays a real deletion, never a clip.
  it('P5: keeps an internal flanked target gap as a deletion', () => {
    const result = alignPrimerBinding('ACGGTAC', 'ACGAGTAC');
    expect(result.runs).toEqual([
      run('M', 0, 3, 0, 3),
      run('D', 3, 3, 3, 4),
      run('M', 3, 7, 4, 8),
    ]);
    expect(result.counts.D).toBe(1);
    expect(result.targetSpan).toEqual({ start: 0, end: 8 });
  });

  // P5 — a query-only base at the physical 3' edge is a real gap and zeroes the
  // 3' anchor; a target clip after an exact query is NOT a 3' gap.
  it('P5: a terminal query insertion is a 3-prime gap, a target clip is not', () => {
    const insertionEdge = alignPrimerBinding('ACGTG', 'ACGT');
    expect(insertionEdge.threePrimeGap).toBe(true);
    expect(insertionEdge.threePrimeMatchLength).toBe(0);

    const clippedEdge = alignPrimerBinding('ACGT', 'ACGTG');
    expect(clippedEdge.threePrimeGap).toBe(false);
    expect(clippedEdge.threePrimeMatchLength).toBe(4);
    expect(clippedEdge.targetSpan).toEqual({ start: 0, end: 4 });
    expect(clippedEdge.counts.D).toBe(0);
  });

  // P5 — a terminal query mismatch also zeroes the honest 3' anchor.
  it('P5: a terminal query mismatch zeroes the 3-prime match length', () => {
    const result = alignPrimerBinding('ACGT', 'ACGA');
    expect(result.threePrimeMatchLength).toBe(0);
    expect(result.threePrimeGap).toBe(false);
  });

  it('P5: equal-length long terminal mismatch keeps the full footprint and is X', () => {
    const query = 'ACGTTGCAACGTTGCC';
    const target = 'ACGTTGCAACGTTGCA';
    const result = alignPrimerBinding(query, target);
    expect(result.runs).toEqual([
      run('M', 0, 15, 0, 15),
      run('X', 15, 16, 15, 16),
    ]);
    expect(result.targetSpan).toEqual({ start: 0, end: 16 });
    expect(result.counts).toEqual({ M: 15, X: 1, I: 0, D: 0 });
    expect(result.threePrimeMatchLength).toBe(0);
    expect(result.threePrimeGap).toBe(false);
  });

  it('P5: equal-length full-footprint alignment is global, not forced Hamming', () => {
    const result = alignPrimerBinding('ACCCCGGGGAAA', 'AAAACCCCGGGG');
    expect(result.targetSpan).toEqual({ start: 0, end: 12 });
    expect(result.editDistance).toBe(6);
    expect(result.counts.I).toBe(3);
    expect(result.counts.D).toBe(3);
  });
});
