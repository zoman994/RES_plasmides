/**
 * V124 + V125 — primer-tail strand-orientation invariants for Golden Gate
 * and RE-ligation junctions. These check the BIOLOGY (does the tail let the
 * enzyme cut and produce a usable/complementary end?), not just tail strings —
 * the gap that let V123/V124/V125 slip through.
 */
import { describe, it, expect } from 'vitest';
import { designPrimersLocal } from '../local-primer-design';
import { generateRETail } from '../restriction-db';
import { GG_ENZYMES } from '../golden-gate';

const RC = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N' };
const rc = (s) => s.split('').reverse().map((c) => RC[c.toUpperCase()] || 'N').join('');

// Minimal BsaI GGTCTC(1/5) digest on the TOP strand: returns the 4-nt 5' overhang
// exposed on the downstream fragment, or null if the recognition site cannot
// direct an in-bounds cut (site flush at the 3' terminus pointing outward).
function bsaiTopCut(top) {
  const t = top.indexOf('GGTCTC');
  if (t < 0) return null;
  const ohStart = t + 7;        // 6 (recognition) + 1 (top-strand spacer cut)
  const ohEnd = t + 11;         // bottom-strand cut 5 nt 3'
  if (ohEnd > top.length) return null; // cut runs off the molecule → no cut
  return top.slice(ohStart, ohEnd);
}
// BsaI can sit on either strand: try top, else the reverse complement.
const bsaiCut = (amplicon) => bsaiTopCut(amplicon) ?? bsaiTopCut(rc(amplicon));

const L = 'CAGTCAGTCAGTCAGTCAGTCAGTCAGTACGT'; // 32 nt, no BsaI/EcoRI site
const R = 'TGCATGCATGCATGCATGCATGCATGCACAGT'; // 32 nt

describe('Golden Gate primer tails — Type IIS cut feasibility (V124)', () => {
  it('both arms digest and expose complementary overhangs', () => {
    const oh = 'AATG';
    const junctions = [{ type: 'golden_gate', enzyme: 'BsaI', overhang: oh }];
    const { primers } = designPrimersLocal([
      { name: 'L', sequence: L, length: L.length, needsAmplification: true },
      { name: 'R', sequence: R, length: R.length, needsAmplification: true },
    ], junctions, false, { tmTarget: 45 });

    const fwdR = primers.find((p) => p.direction === 'forward' && p.fragmentName === 'R');
    const revL = primers.find((p) => p.direction === 'reverse' && p.fragmentName === 'L');

    // amplicon top strand = fwd.tail + fragment + rc(rev.tail)
    const ampR = fwdR.tailSequence + R; // R is downstream; fwd tail at 5'
    const ampL = L + rc(revL.tailSequence); // L upstream; rev tail → top 3'

    const ohR = bsaiCut(ampR); // R's left-end overhang
    const ohL = bsaiCut(ampL); // L's right-end overhang

    expect(ohR).not.toBeNull();          // forward arm digests
    expect(ohL).not.toBeNull();          // reverse arm digests (FAILS with V124 bug)
    expect(rc(ohR)).toBe(ohL);           // overhangs are complementary → ligate
    expect(ohR).toBe(oh);                // and equal the designed fusion site
  });

  it('reverse-primer GG tail starts with the recognition (site points inward)', () => {
    const junctions = [{ type: 'golden_gate', enzyme: 'BsaI', overhang: 'AATG' }];
    const { primers } = designPrimersLocal([
      { name: 'L', sequence: L, length: L.length, needsAmplification: true },
      { name: 'R', sequence: R, length: R.length, needsAmplification: true },
    ], junctions, false, { tmTarget: 45 });
    const revL = primers.find((p) => p.direction === 'reverse' && p.fragmentName === 'L');
    expect(revL.tailSequence.startsWith(GG_ENZYMES.BsaI.recognition)).toBe(true);
  });
});

describe('RE-ligation primer tails — protective bases outside the site (V125)', () => {
  it('forward arm RE site has 5\' protective flanking (cuttable)', () => {
    const junctions = [{ type: 'ligation', enzyme: 'EcoRI' }];
    const { primers } = designPrimersLocal([
      { name: 'L', sequence: L, length: L.length, needsAmplification: true },
      { name: 'R', sequence: R, length: R.length, needsAmplification: true },
    ], junctions, false, { tmTarget: 45 });

    const fwdR = primers.find((p) => p.direction === 'forward' && p.fragmentName === 'R');
    const ampR = fwdR.tailSequence + R;
    // EcoRI needs ≥1 bp 5' of GAATTC to cut → site must not be flush at the 5' end.
    expect(ampR.indexOf('GAATTC')).toBeGreaterThanOrEqual(1);
    // forward tail = protective+site as-is (matches generateRETail, matches the comment)
    expect(fwdR.tailSequence).toBe(generateRETail('EcoRI'));
  });
});
