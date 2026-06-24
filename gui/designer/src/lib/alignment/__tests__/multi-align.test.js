import { describe, it, expect } from 'vitest';
import {
  buildConsensus, alignReadsToReference, buildMultiAlign, phredToWeight,
} from '../multi-align';
import { reverseComplement } from '../../../sequence-utils';

describe('buildConsensus', () => {
  it('votes per reference column: majority base, depth, agreement, status vs reference', () => {
    const ref = 'ACGT';
    const perRead = [
      { alignToRef: { readByRefPos: { 0: { base: 'A' }, 1: { base: 'C' }, 2: { base: 'A' } } } },
      { alignToRef: { readByRefPos: { 0: { base: 'A' }, 1: { base: 'G' }, 2: { base: 'A' } } } },
      { alignToRef: { readByRefPos: { 0: { base: 'A' }, 1: { base: 'C' }, 3: { base: 'T' } } } },
    ];
    const { byRefPos, maxDepth } = buildConsensus(ref, perRead);
    expect(byRefPos[0].base).toBe('A');
    expect(byRefPos[0].depth).toBe(3);
    expect(byRefPos[0].status).toBe('match');
    // col 1: C,C,G → consensus C (2/3), but ref is C → match
    expect(byRefPos[1].base).toBe('C');
    expect(byRefPos[1].agree).toBe(2);
    // col 2: A,A (ref G) → consensus A, mismatch vs reference
    expect(byRefPos[2].base).toBe('A');
    expect(byRefPos[2].status).toBe('mismatch');
    expect(maxDepth).toBe(3);
  });

  it('encodes a 2-base tie as the IUPAC code (G/C → S, A/G → R)', () => {
    const sg = buildConsensus('A', [
      { alignToRef: { readByRefPos: { 0: { base: 'C' } } } },
      { alignToRef: { readByRefPos: { 0: { base: 'G' } } } },
    ]);
    expect(sg.byRefPos[0].base).toBe('S'); // C/G
    const rg = buildConsensus('A', [
      { alignToRef: { readByRefPos: { 0: { base: 'A' } } } },
      { alignToRef: { readByRefPos: { 0: { base: 'G' } } } },
    ]);
    expect(rg.byRefPos[0].base).toBe('R'); // A/G
  });

  it('falls back to N only for a 4-way tie', () => {
    const c = buildConsensus('A', [
      { alignToRef: { readByRefPos: { 0: { base: 'A' } } } },
      { alignToRef: { readByRefPos: { 0: { base: 'C' } } } },
      { alignToRef: { readByRefPos: { 0: { base: 'G' } } } },
      { alignToRef: { readByRefPos: { 0: { base: 'T' } } } },
    ]);
    expect(c.byRefPos[0].base).toBe('N');
  });

  it('Phred-weights votes: one high-quality base outvotes a low-quality majority', () => {
    // 2 reads say A at Q2 (unreliable), 1 read says G at Q40 (confident).
    // Count-voting would pick A (2:1); Phred-weighting must pick G.
    const perRead = [
      { qualities: [2], alignToRef: { readByRefPos: { 0: { base: 'A', bi: 0 } } } },
      { qualities: [2], alignToRef: { readByRefPos: { 0: { base: 'A', bi: 0 } } } },
      { qualities: [40], alignToRef: { readByRefPos: { 0: { base: 'G', bi: 0 } } } },
    ];
    const { byRefPos } = buildConsensus('N', perRead);
    expect(byRefPos[0].base).toBe('G');
    expect(byRefPos[0].depth).toBe(3);
    expect(byRefPos[0].agree).toBe(1); // one (high-Q) read supports the winner
  });

  it('equal qualities reduce to plain count-voting (backward compatible)', () => {
    const mk = (b) => ({ qualities: [30], alignToRef: { readByRefPos: { 0: { base: b, bi: 0 } } } });
    const { byRefPos } = buildConsensus('N', [mk('A'), mk('A'), mk('G')]);
    expect(byRefPos[0].base).toBe('A'); // majority wins when confidence is uniform
  });

  it('phredToWeight is bounded, monotonic, and defaults sanely', () => {
    expect(phredToWeight(0)).toBeCloseTo(0, 6);
    expect(phredToWeight(40)).toBeGreaterThan(0.999);
    expect(phredToWeight(40)).toBeGreaterThan(phredToWeight(10));
    expect(phredToWeight(undefined)).toBeCloseTo(0.99, 2); // DEFAULT_PHRED = 20
  });

  it('skips uncovered columns', () => {
    const ref = 'ACGT';
    const perRead = [{ alignToRef: { readByRefPos: { 1: { base: 'C' } } } }];
    const { byRefPos } = buildConsensus(ref, perRead);
    expect(byRefPos[0]).toBeUndefined();
    expect(byRefPos[1].base).toBe('C');
  });
});

describe('alignReadsToReference + buildMultiAlign', () => {
  const REF = 'ATGCCGTTAGGCATCCGATTACGGATCCGTTAACGGCATA';
  it('aligns each read and drops ones that cannot align', () => {
    const reads = [
      { id: 'r1', name: 'r1', sequence: REF }, // identical
      { id: 'r2', name: 'r2', sequence: REF.slice(5, 30) }, // a fragment
    ];
    const per = alignReadsToReference(REF, reads, { mode: 'semiglobal' });
    expect(per.length).toBe(2);
    expect(per[0].alignToRef.readByRefPos).toBeTruthy();
  });

  it('reverses the quality track for a reverse-strand read so bi lookups stay aligned', () => {
    const frag = REF.slice(0, 20);
    const read = reverseComplement(frag);          // aligns on the reverse strand
    const qualities = Array.from({ length: 20 }, (_, i) => i); // distinct per base
    const per = alignReadsToReference(REF, [{ id: 'r', name: 'r', sequence: read, qualities }], { tryRevComp: true });
    expect(per[0].strand).toBe('reverse');
    expect(per[0].qualities[0]).toBe(19); // reversed: first revcomp base ↔ last original
    expect(per[0].qualities[19]).toBe(0);
  });

  it('sources the Phred track from a parsed chromatogram when no top-level qualities', () => {
    const frag = REF.slice(0, 20); // forward strand → not reversed
    const per = alignReadsToReference(
      REF,
      [{ id: 't', name: 't', sequence: frag, chromatogram: { qualities: Array.from({ length: 20 }, () => 30) } }],
      { mode: 'semiglobal' },
    );
    expect(per[0].qualities).toBeTruthy();
    expect(per[0].qualities.length).toBe(20);
  });

  it('produces a consensus + stats across reads', () => {
    const reads = [
      { id: 'r1', name: 'r1', sequence: REF },
      { id: 'r2', name: 'r2', sequence: REF },
    ];
    const { consensus, stats } = buildMultiAlign(REF, reads, { mode: 'semiglobal' });
    expect(stats.reads).toBe(2);
    expect(stats.coverage).toBeGreaterThan(90);
    expect(consensus.refLen).toBe(REF.length);
    expect(consensus.maxDepth).toBe(2);
  });
});
