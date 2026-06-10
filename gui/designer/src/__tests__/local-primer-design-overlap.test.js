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

    // V123 fix orientation: fwd-of-right tail = first half of overlap as-is → contains 'GGGGG';
    // rev-of-left tail = rc(second half) → rc('…CCCCC…') contains 'GGGGG'.
    expect(fwdOfRight.tailSequence).toContain('GGGGG');
    expect(revOfLeft.tailSequence).toContain('GGGGG');
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

    // V123 fix: rev-of-left tail = rc(first 15 of right) = rc('CCC…') = 'GGGGG…'
    expect(revOfLeft.tailSequence).toContain('GGGGG');
    // fwd-of-right tail = last 15 of left as-is = 'TTTTT…'
    expect(fwdOfRight.tailSequence).toContain('TTTTT');
  });

  // V123 — biology invariant: the two amplicons must SHARE the junction overlap
  // (top strand), else Gibson/OE-PCR cannot join them. This guards the actual
  // assembly chemistry, not just the tail strings.
  it('V123: the two amplicons share the correct junction overlap', () => {
    const left  = 'CAGTCAGTCAGTCAGTCAGTCAGTCAGT' + 'TTGGCCAATTGGCCAA';
    const right = 'GAATTCGGATCCAAGC' + 'TGCATGCATGCATGCATGCATGCATGCA';
    const fragments = [
      { name: 'left',  sequence: left,  length: left.length,  needsAmplification: true },
      { name: 'right', sequence: right, length: right.length, needsAmplification: true },
    ];
    const junctions = [{ type: 'overlap', overlapMode: 'split', overlapLength: 30 }];
    const { primers } = designPrimersLocal(fragments, junctions, false, { tmTarget: 50, primerPrefix: 'T' });
    const get = (dir, f) => primers.find(p => p.direction === dir && p.fragmentName === f);

    // amplicon top strand = fwd.tail + fragment + rc(rev.tail)
    const ampL = get('forward', 'left').tailSequence  + left  + rc(get('reverse', 'left').tailSequence);
    const ampR = get('forward', 'right').tailSequence + right + rc(get('reverse', 'right').tailSequence);

    const overlap = left.slice(-15) + right.slice(0, 15); // the seamless junction overlap
    expect(ampL.endsWith(overlap)).toBe(true);    // left amplicon ends with the overlap
    expect(ampR.startsWith(overlap)).toBe(true);  // right amplicon starts with the same overlap
    // stitching on the shared overlap reproduces left+right seamlessly
    expect(ampL + ampR.slice(overlap.length)).toBe(left + right);
  });
});
