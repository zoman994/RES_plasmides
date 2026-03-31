import { describe, it, expect } from 'vitest';
import { designPrimersLocal } from '../local-primer-design';

describe('designPrimersLocal', () => {
  const frag = (name, seq) => ({ name, sequence: seq, needsAmplification: true });

  it('designs 4 primers for 2 fragments', () => {
    const frags = [
      frag('A', 'ATGCGATCGATCGATCGATCGATCGATCG'),
      frag('B', 'CGATCGATCGATCGATCGATCGATCGATG'),
    ];
    const juncs = [{ type: 'overlap', overlapLength: 30, overlapMode: 'split' }];
    const { primers } = designPrimersLocal(frags, juncs, false);
    expect(primers).toHaveLength(4);
    expect(primers[0].direction).toBe('forward');
    expect(primers[1].direction).toBe('reverse');
    expect(primers[2].direction).toBe('forward');
    expect(primers[3].direction).toBe('reverse');
  });

  it('forward primer of first linear fragment has no tail', () => {
    const frags = [frag('A', 'ATGCGATCGATCGATCGATCGATCGATCG'), frag('B', 'CGATCGATCGATCGATCGATCGATCGATG')];
    const juncs = [{ type: 'overlap', overlapLength: 30, overlapMode: 'split' }];
    const { primers } = designPrimersLocal(frags, juncs, false);
    expect(primers[0].tailSequence).toBe('');
  });

  it('reverse primer has overlap tail', () => {
    const frags = [frag('A', 'ATGCGATCGATCGATCGATCGATCGATCG'), frag('B', 'CGATCGATCGATCGATCGATCGATCGATG')];
    const juncs = [{ type: 'overlap', overlapLength: 30, overlapMode: 'split' }];
    const { primers } = designPrimersLocal(frags, juncs, false);
    expect(primers[1].tailSequence.length).toBeGreaterThan(0);
  });

  it('skips fragments with needsAmplification = false', () => {
    const frags = [
      frag('A', 'ATGCGATCGATCGATCGATCGATCGATCG'),
      { name: 'B', sequence: 'CGATCGATCGATCGATCGATCGATCGATG', needsAmplification: false },
    ];
    const juncs = [{ type: 'overlap', overlapLength: 30, overlapMode: 'split' }];
    const { primers } = designPrimersLocal(frags, juncs, false);
    expect(primers).toHaveLength(4); // all fragments get primers (needsAmplification only affects protocol)
  });

  it('circular assembly: first fragment has tail', () => {
    const frags = [frag('A', 'ATGCGATCGATCGATCGATCGATCGATCG'), frag('B', 'CGATCGATCGATCGATCGATCGATCGATG')];
    const juncs = [
      { type: 'overlap', overlapLength: 30, overlapMode: 'split' },
      { type: 'overlap', overlapLength: 30, overlapMode: 'split' },
    ];
    const { primers } = designPrimersLocal(frags, juncs, true);
    expect(primers[0].tailSequence.length).toBeGreaterThan(0);
  });

  it('expands merged fragments and marks internal primers', () => {
    const merged = {
      name: 'AmpR+EGFP',
      sequence: 'ATGCGATCGATCGATCGATCGATCGATCG' + 'CGATCGATCGATCGATCGATCGATCGATG',
      needsAmplification: false,
      subFragments: [
        { name: 'AmpR', type: 'CDS', length: 29, pct: 50 },
        { name: 'EGFP', type: 'CDS', length: 29, pct: 50 },
      ],
    };
    const ga = { name: 'GA', sequence: 'TTTAAAGGGCCCAAATTTGGGCCCAAATTT', needsAmplification: true };
    const { primers } = designPrimersLocal([merged, ga], [{ type: 'overlap', overlapLength: 30, overlapMode: 'split' }], false);
    // 3 fragments expanded (AmpR, EGFP, GA) → 6 primers
    expect(primers).toHaveLength(6);
    // AmpR fwd = outer (first in merged)
    expect(primers[0].isInternal).toBe(false);
    // AmpR rev = internal (not last in merged)
    expect(primers[1].isInternal).toBe(true);
    // EGFP fwd = internal (not first in merged)
    expect(primers[2].isInternal).toBe(true);
    // EGFP rev = outer (last in merged)
    expect(primers[3].isInternal).toBe(false);
    // GA fwd/rev = not from merged
    expect(primers[4].isInternal).toBe(false);
    expect(primers[5].isInternal).toBe(false);
  });
});

describe('designPrimersLocal — all block combinations', () => {
  const R = (name, seq) => ({ name, sequence: seq, needsAmplification: true });
  const N = (name, seq) => ({ name, sequence: seq, needsAmplification: false });
  const M = (name, seq, subs) => ({
    name, sequence: seq, needsAmplification: false,
    subFragments: subs, assemblyMethod: 'overlap_pcr',
  });
  const J = { type: 'overlap', overlapMode: 'split', overlapLength: 30, tmTarget: 62, calcMode: 'length' };
  const seq48 = 'ATGCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCG';
  const seq48b = 'CGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATG';

  it('R+R: 4 primers, half overlap tails', () => {
    const { primers } = designPrimersLocal([R('A', seq48), R('B', seq48b)], [J], false);
    expect(primers).toHaveLength(4);
    expect(primers[1].tailSequence.length).toBe(15);
    expect(primers[2].tailSequence.length).toBe(15);
  });

  it('R+N: 4 primers, Regular carries FULL overlap', () => {
    const { primers } = designPrimersLocal([R('A', seq48), N('B', seq48b)], [J], false);
    expect(primers).toHaveLength(4);
    expect(primers[1].tailSequence.length).toBe(30);
  });

  it('N+R: 4 primers, Regular carries FULL overlap', () => {
    const { primers } = designPrimersLocal([N('A', seq48), R('B', seq48b)], [J], false);
    expect(primers).toHaveLength(4);
    expect(primers[2].tailSequence.length).toBe(30);
  });

  it('N+N: 4 primers + warning about impossible overlap', () => {
    const { primers, warnings } = designPrimersLocal([N('A', seq48), N('B', seq48b)], [J], false);
    expect(primers).toHaveLength(4);
    expect(warnings.some(w => w.includes('без ПЦР'))).toBe(true);
  });

  it('R+M: expands merged, 6 primers, internal marked', () => {
    const m = M('BC', seq48 + seq48b, [
      { name: 'B', type: 'CDS', length: 48, pct: 50 },
      { name: 'C', type: 'CDS', length: 48, pct: 50 },
    ]);
    const { primers } = designPrimersLocal([R('A', seq48), m], [J], false);
    expect(primers).toHaveLength(6);
    // fwd_B = first in merged → NOT internal
    expect(primers[2].isInternal).toBe(false);
    // rev_B = not last in merged → internal
    expect(primers[3].isInternal).toBe(true);
  });

  it('M+M: 8 primers, correct junction order', () => {
    const m1 = M('AB', seq48 + seq48b, [
      { name: 'A', type: 'CDS', length: 48, pct: 50 },
      { name: 'B', type: 'CDS', length: 48, pct: 50 },
    ]);
    const m2 = M('CD', seq48b + seq48, [
      { name: 'C', type: 'CDS', length: 48, pct: 50 },
      { name: 'D', type: 'CDS', length: 48, pct: 50 },
    ]);
    const { primers } = designPrimersLocal([m1, m2], [J], false);
    expect(primers).toHaveLength(8);
  });

  it('N+M: No-PCR + Merged → first sub gets FULL overlap', () => {
    const m = M('BC', seq48 + seq48b, [
      { name: 'B', type: 'CDS', length: 48, pct: 50 },
      { name: 'C', type: 'CDS', length: 48, pct: 50 },
    ]);
    const { primers } = designPrimersLocal([N('Vec', seq48), m], [J], false);
    expect(primers).toHaveLength(6);
    const fwdB = primers.find(p => p.fragmentName === 'B' && p.direction === 'forward');
    expect(fwdB.tailSequence.length).toBe(30);
  });

  it('circular: wrap-around tails exist', () => {
    const { primers } = designPrimersLocal(
      [R('A', seq48), R('B', seq48b)], [J, J], true
    );
    expect(primers).toHaveLength(4);
    expect(primers[0].tailSequence.length).toBeGreaterThan(0);
    expect(primers[3].tailSequence.length).toBeGreaterThan(0);
  });

  it('BUG-49: warns when fragment sequence < 15bp', () => {
    const shortFrag = { name: 'Short', sequence: 'ATGCGATCG', needsAmplification: true }; // 9bp
    const normalFrag = R('Normal', seq48);
    const { primers, warnings } = designPrimersLocal([shortFrag, normalFrag], [J], false);
    // Should still produce primers but with a warning
    expect(primers.length).toBeGreaterThan(0);
    expect(warnings.some(w => w.includes('Short') && w.includes('короткая'))).toBe(true);
  });
});
