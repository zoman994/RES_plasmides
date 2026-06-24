/**
 * intron-detect.test.js — Phase 1 orchestrator: both strands, annotation-ready
 * regions (0-based half-open + ids), cryptic-site warnings.
 */
import { describe, it, expect } from 'vitest';
import { detectIntrons } from '../intron-detect';
import { reverseComplement } from '../../../sequence-utils';

const EXON1 = `ATG${'GCT'.repeat(6)}CAG`;
const INTRON = 'GTAAGTTGACCC' + 'TTTTTTTTTT' + 'CAG';
const EXON2 = `${'GCT'.repeat(6)}TAA`;
const GENE = EXON1 + INTRON + EXON2; // donor@24, acceptor@48, len 70

describe('detectIntrons', () => {
  it('forward strand: one intron at the right coordinates + flanking exons', () => {
    const res = detectIntrons(GENE);
    expect(res.strand).toBe(1);
    expect(res.introns).toHaveLength(1);
    expect(res.introns[0]).toMatchObject({ type: 'intron', strand: 1, start: 24, end: 49 }); // [24,49) half-open
    expect(res.introns[0].id).toBeTruthy();
    expect(res.exons.map((e) => [e.start, e.end])).toEqual([[0, 24], [49, 70]]);
  });

  it('reverse strand: detects the gene on the minus strand with mapped coordinates', () => {
    const res = detectIntrons(reverseComplement(GENE));
    expect(res.strand).toBe(-1);
    expect(res.introns).toHaveLength(1);
    // working intron [24,49) on revcomp(input) → forward input coords [70-49, 70-24) = [21,46)
    expect(res.introns[0]).toMatchObject({ strand: -1, start: 21, end: 46 });
  });

  it('flags a strong cryptic splice site not used by the model', () => {
    // a clean exon with an extra strong consensus DONOR but no usable downstream
    // acceptor → no intron called, but the donor is surfaced as cryptic.
    const seq = `ATG${'GCT'.repeat(10)}CAGGTAAGT${'GCT'.repeat(10)}TAA`;
    const res = detectIntrons(seq, { crypticGate: 3 });
    expect(res.introns).toHaveLength(0);
    expect(res.cryptic.some((c) => c.kind === 'donor')).toBe(true);
    expect(res.cryptic[0]).toHaveProperty('score');
    expect(res.cryptic[0]).toHaveProperty('pos');
  });

  it('returns empty structure for a too-short sequence', () => {
    const res = detectIntrons('ACGTACGT');
    expect(res.introns).toEqual([]);
    expect(res.exons).toEqual([]);
  });
});
