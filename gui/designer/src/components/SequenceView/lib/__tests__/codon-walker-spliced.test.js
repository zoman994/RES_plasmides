/**
 * codon-walker-spliced.test.js — walkSplicedRegion (Phase A3).
 *
 * Walks codons over a SPLICED (exon-joined) sequence and anchors each codon's
 * middle base back onto genomic coordinates via the exonMap, so the AA track
 * can render the spliced protein on the genomic grid. The amino-acid numbering
 * follows the spliced (mature mRNA) index, not raw genomic arithmetic.
 */
import { describe, it, expect } from 'vitest';
import { spliceRegion } from '../../../../intron-utils';
import { walkSplicedRegion, walkCodons } from '../codon-walker';

// V151 — a manually-typed base may arrive lowercase; the codon table is
// uppercase-keyed, so without normalization every lowercase codon → 'X'
// («XXXXX» in the AA track). translateDNA already uppercases; the walkers must too.
describe('codon-walker — case-insensitive translation (V151 defense)', () => {
  it('walkCodons translates LOWERCASE DNA to amino acids, not X', () => {
    const codons = walkCodons('atggcgaaa', 0, 1); // ATG GCG AAA = M A K
    expect(codons.map((c) => c.aa).join('')).toBe('MAK');
  });

  it('walkSplicedRegion translates a LOWERCASE spliced sequence to AA, not X', () => {
    const genomic = 'atggcgaaataa'; // ATG GCG AAA TAA = M A K *
    const { spliced, exonMap } = spliceRegion(genomic, { id: 'c', start: 0, end: genomic.length, strand: 1 }, []);
    const aa = walkSplicedRegion(spliced, exonMap, 0, 1).map((c) => c.aa).join('');
    expect(aa).toBe('MAK*');
    expect(aa).not.toContain('X');
  });
});

const EXON1 = 'ATGGCGAAAGCGGCGAAAGCGGCGAAAGCG'; // 30nt
const INTRON = 'GTATAAGCGAAAGCGGCGAAAGCGGCGAAAGCGGCGAAAGCGGCGAAAGCGGCGAAAGCAG';
const EXON2 = 'GCGAAAGCGGCGAAAGCGGCGAAAGCGTAA'; // 30nt, ends TAA
const GENOMIC = EXON1 + INTRON + EXON2;
const E1 = EXON1.length;
const EX2_G = E1 + INTRON.length; // genomic start of exon2

describe('walkSplicedRegion — clean codon-boundary intron', () => {
  const region = { id: 'cds1', start: 0, end: GENOMIC.length, strand: 1 };
  const { spliced, exonMap } = spliceRegion(GENOMIC, region, [{ start: E1, end: EX2_G }]);
  const codons = walkSplicedRegion(spliced, exonMap, 0, 1);

  it('produces one codon per spliced triplet', () => {
    expect(codons).toHaveLength(20); // 60 / 3
  });

  it('has no internal stop — only the terminal TAA', () => {
    const stops = codons.filter((c) => c.isStop);
    expect(stops).toHaveLength(1);
    expect(stops[0].splicedIndex).toBe(20);
  });

  it('starts at M with spliced index 1 anchored on genomic position 1', () => {
    expect(codons[0]).toMatchObject({ aa: 'M', isStart: true, splicedIndex: 1 });
    expect(codons[0].position).toBe(1); // middle base of codon 1 = genomic 1
  });

  it('numbers amino acids by spliced index across the intron', () => {
    // codon 11 is the first codon of exon2 (spliced i=30) → middle base genomic EX2_G+1
    const c11 = codons.find((c) => c.splicedIndex === 11);
    expect(c11.position).toBe(EX2_G + 1);
  });
});

describe('walkSplicedRegion — intron off the codon boundary (straddling codon)', () => {
  // Synthetic: exon1 = [0,4), intron = [4,7), exon2 = [7,12). The spliced codon
  // at i=3 spans spliced[3,4,5] = genomic[3, 7, 8] — bases straddle the intron.
  const full = 'AAACCCGGGTTT'; // 12nt
  const region = { id: 'cds1', start: 0, end: 12, strand: 1 };
  const { spliced, exonMap } = spliceRegion(full, region, [{ start: 4, end: 7 }]);
  const codons = walkSplicedRegion(spliced, exonMap, 0, 1);

  it('removes the intron from the spliced sequence', () => {
    expect(spliced).toBe('AAACGGTTT'); // exon1 'AAAC' + exon2 'GGTTT'
  });

  it('records the genomic positions of all three bases, reflecting the jump', () => {
    const straddler = codons.find((c) => c.g[0] === 3);
    expect(straddler).toBeDefined();
    expect(straddler.g).toEqual([3, 7, 8]); // base 1 in exon1, bases 2-3 in exon2
  });
});
