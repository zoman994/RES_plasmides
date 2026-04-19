/**
 * V4-E: designPrimersLocal must prefer junction.overlapSequence (if provided)
 * over the WT flanks of neighboring fragments when building the overlap tail.
 * This is the hook that lets mutagenesis strategies inject a mutant-containing
 * overlap bridge into the primer tails even though the amplified fragments are WT.
 */
import { describe, it, expect } from 'vitest';
import { designPrimersLocal } from '../local-primer-design';

// Helper: build a reasonable-length WT fragment so findBinding produces a 18–30nt binding.
function wtFrag(name, bases) {
  const seq = bases.repeat(Math.ceil(60 / bases.length)).slice(0, 60);
  return { name, sequence: seq, length: seq.length, needsAmplification: true };
}

function rc(s) {
  const comp = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N' };
  return s.split('').reverse().map(c => comp[c.toUpperCase()] || 'N').join('');
}

describe('designPrimersLocal — junction.overlapSequence', () => {
  it('uses junction.overlapSequence as tail source (mutant bridge)', () => {
    // 30 nt overlap sequence with distinctive marker in each half.
    // First half (before cut): has GGGGG marker  (ends up on the fwd primer's tail, RC'd)
    // Second half (after cut):  has CCCCC marker (ends up on the rev primer's tail, no RC)
    const overlapSequence = 'AAAGGGGGAAAAAAA' + 'TTTCCCCCTTTTTTT'; // 30 nt
    const fragments = [
      wtFrag('left',  'AT'),
      wtFrag('right', 'GC'),
    ];
    const junctions = [{
      type: 'overlap',
      overlapMode: 'split',
      overlapLength: overlapSequence.length,
      overlapSequence,
      containsMutation: true,
    }];

    const { primers } = designPrimersLocal(fragments, junctions, false, {
      tmTarget: 40,  // allow short bindings on homopolymer-ish WT fragments
      primerPrefix: 'T',
      polymerase: 'phusion',
    });

    // Fwd primer of 'right' and rev primer of 'left' must carry slices of overlapSequence.
    const revOfLeft = primers.find(p => p.direction === 'reverse' && p.fragmentName === 'left');
    const fwdOfRight = primers.find(p => p.direction === 'forward' && p.fragmentName === 'right');
    expect(revOfLeft).toBeDefined();
    expect(fwdOfRight).toBeDefined();

    // rev primer of left frag: tail = second half of overlap (no RC) → should contain 'CCCCC'
    expect(revOfLeft.tailSequence).toContain('CCCCC');
    // fwd primer of right frag: tail = RC of first half of overlap → should contain rc('GGGGG')='CCCCC'
    expect(fwdOfRight.tailSequence).toContain(rc('GGGGG'));
  });

  it('falls back to WT flanks when junction.overlapSequence is absent (regression)', () => {
    // Distinctive last-15nt of left and first-15nt of right, so we can see which source was used.
    const leftSeq  = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' + 'TTTTTTTTTTTTTTT'; // last 15 = TTTTT...
    const rightSeq = 'CCCCCCCCCCCCCCC' + 'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG'; // first 15 = CCCCC...
    const fragments = [
      { name: 'left',  sequence: leftSeq,  length: leftSeq.length,  needsAmplification: true },
      { name: 'right', sequence: rightSeq, length: rightSeq.length, needsAmplification: true },
    ];
    const junctions = [{
      type: 'overlap',
      overlapMode: 'split',
      overlapLength: 30,
      // NO overlapSequence
    }];

    const { primers } = designPrimersLocal(fragments, junctions, false, {
      tmTarget: 40,
      primerPrefix: 'T',
      polymerase: 'phusion',
    });

    const revOfLeft = primers.find(p => p.direction === 'reverse' && p.fragmentName === 'left');
    const fwdOfRight = primers.find(p => p.direction === 'forward' && p.fragmentName === 'right');

    // rev-of-left: tail = first 15 of right frag = 'CCCCC...'
    expect(revOfLeft.tailSequence).toContain('CCCCC');
    // fwd-of-right: tail = rc of last 15 of left frag = rc('TTTTT...') = 'AAAAA...'
    expect(fwdOfRight.tailSequence).toContain('AAAAA');
  });
});
