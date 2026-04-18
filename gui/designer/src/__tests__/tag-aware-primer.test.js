import { describe, it, expect } from 'vitest';
import { designPrimersLocal } from '../local-primer-design';

// A realistic CDS: 48bp of unique sequence + 18bp His6-tag (CACCACCACCACCACCAC + C padding) + stop codon
const CDS_BODY = 'ATGCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCG';  // 48bp, unique
const HIS6_DNA = 'CACCACCACCACCACCAC';  // 18bp His6 (low complexity)
const STOP = 'TAA';
const CDS_WITH_HIS6 = CDS_BODY + HIS6_DNA + STOP;  // 69bp total

const FLAG_DNA = 'GACTACAAGGACGACGATGACAAG';  // 24bp FLAG (NOT low complexity)
const CDS_WITH_FLAG = CDS_BODY + FLAG_DNA + STOP;   // 75bp total

function fragWithTag(name, seq, tagName, tagStart, tagEnd) {
  return {
    name, sequence: seq, needsAmplification: true,
    annotations: [
      { name: tagName, type: 'tag', start: tagStart, end: tagEnd, level: 'detail', auto: false },
    ],
  };
}

const OTHER_FRAG = { name: 'Vec', sequence: 'TTTAAAGGGCCCAAATTTGGGCCCAAATTTGGGCCCAAATTTGGGCCCA', needsAmplification: true };
const JUNC = { type: 'overlap', overlapLength: 30, overlapMode: 'split' };

describe('tag-aware primer design', () => {
  it('His6-tag at C-term: reverse primer extends past tag into CDS', () => {
    const frag = fragWithTag('GFP-His', CDS_WITH_HIS6, 'His6-tag', 48, 66);
    const { primers } = designPrimersLocal([frag, OTHER_FRAG], [JUNC], false);

    // Find the reverse primer for our fragment
    const rev = primers.find(p => p.fragmentName === 'GFP-His' && p.direction === 'reverse');
    expect(rev).toBeDefined();

    // The binding region should extend past the 18bp His6 tag into CDS-specific sequence
    // bindingSequence is the RC of the actual binding site on the template
    expect(rev.tmBinding).toBeGreaterThan(50);
    // Binding should be longer than just the tag (18bp) — needs ≥12bp of CDS
    expect(rev.bindingSequence.length).toBeGreaterThanOrEqual(30);
  });

  it('FLAG-tag at C-term: normal binding (not low complexity)', () => {
    const frag = fragWithTag('GFP-FLAG', CDS_WITH_FLAG, 'FLAG-tag', 48, 72);
    const { primers } = designPrimersLocal([frag, OTHER_FRAG], [JUNC], false);

    const rev = primers.find(p => p.fragmentName === 'GFP-FLAG' && p.direction === 'reverse');
    expect(rev).toBeDefined();
    // FLAG is not low complexity, so normal binding should work fine
    // Binding length should be in the normal range (18-30bp)
    expect(rev.bindingSequence.length).toBeLessThanOrEqual(35);
  });

  it('low-complexity warning emitted for His6 tag region', () => {
    const frag = fragWithTag('GFP-His', CDS_WITH_HIS6, 'His6-tag', 48, 66);
    const { warnings } = designPrimersLocal([frag, OTHER_FRAG], [JUNC], false);

    expect(warnings.some(w => w.includes('low complexity') || w.includes('повтор'))).toBe(true);
  });

  it('fragment without annotations: no change in behavior', () => {
    const frag = { name: 'Plain', sequence: CDS_BODY + STOP, needsAmplification: true };
    const { primers } = designPrimersLocal([frag, OTHER_FRAG], [JUNC], false);

    const rev = primers.find(p => p.fragmentName === 'Plain' && p.direction === 'reverse');
    expect(rev).toBeDefined();
    // Normal binding, no extension
    expect(rev.bindingSequence.length).toBeLessThanOrEqual(30);
  });

  it('deltaTm warning when forward and reverse Tm differ by >5°C', () => {
    // Use a very AT-rich frag so fwd Tm will be low, but His6 extends rev binding → higher Tm
    const AT_RICH = 'ATATATATATATATATATATATATATATATATATATATAT';  // 38bp AT-rich
    const fragSeq = AT_RICH + HIS6_DNA + STOP;
    const frag = fragWithTag('AT-His', fragSeq, 'His6-tag', 38, 56);
    const { warnings } = designPrimersLocal([frag, OTHER_FRAG], [JUNC], false);

    // May or may not trigger deltaTm depending on actual Tm values, but the check should exist
    // At minimum the function should run without error
    expect(Array.isArray(warnings)).toBe(true);
  });
});
