/**
 * gene-model.test.js — decoder (Phase 1): weighted-interval intron selection,
 * splicing, ORF, and the ORF-guided pruning that gives single-gene «quality».
 */
import { describe, it, expect } from 'vitest';
import {
  chooseIntrons, spliceOut, longestOrf, detectGeneStructure,
} from '../gene-model';

// A synthetic gene: ATG…CAG | GT…(in-frame TGA stop)…CAG | …TAA. Spliced ORF is
// long & clean; the intron interrupts the reading frame when retained.
const EXON1 = `ATG${'GCT'.repeat(6)}CAG`;                 // 24 nt, frame-clean, ends CAG
const INTRON = 'GTAAGTTGACCC' + 'TTTTTTTTTT' + 'CAG';     // 25 nt, GT…AG, TGA stop, polyY+CAG
const EXON2 = `${'GCT'.repeat(6)}TAA`;                    // 21 nt, ends TAA
const GENE = EXON1 + INTRON + EXON2;                      // donor@24, acceptor@48

describe('chooseIntrons', () => {
  it('recovers a single intron from a donor/acceptor pair', () => {
    const got = chooseIntrons([{ pos: 10, score: 6 }], [{ pos: 35, score: 6 }], { minIntron: 20 });
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ start: 10, end: 35 });
  });
  it('respects the minimum intron length', () => {
    expect(chooseIntrons([{ pos: 10, score: 6 }], [{ pos: 20, score: 6 }], { minIntron: 20 })).toEqual([]);
  });
  it('respects the score gate', () => {
    expect(chooseIntrons([{ pos: 10, score: 1 }], [{ pos: 40, score: 1 }], { scoreGate: 4 })).toEqual([]);
  });
  it('selects multiple non-overlapping introns', () => {
    const got = chooseIntrons(
      [{ pos: 10, score: 5 }, { pos: 100, score: 5 }],
      [{ pos: 40, score: 5 }, { pos: 200, score: 5 }],
      { minIntron: 20, maxIntron: 1000 },
    );
    expect(got).toHaveLength(2);
  });
});

describe('spliceOut + longestOrf', () => {
  it('removes the inclusive intron interval', () => {
    expect(spliceOut('ABCDEFGHIJ', [{ start: 3, end: 6 }])).toBe('ABCHIJ');
  });
  it('counts the longest ORF in aa across forward frames', () => {
    expect(longestOrf('ATGGCTGCTTAA')).toBe(3); // ATG GCT GCT | TAA
    expect(longestOrf('GGGGGGGGG')).toBe(0);
  });
});

describe('detectGeneStructure — ORF-guided', () => {
  it('finds the consensus intron; splicing lengthens the ORF', () => {
    const res = detectGeneStructure(GENE);
    expect(res.introns).toHaveLength(1);
    expect(res.introns[0].start).toBe(24); // donor G
    expect(res.introns[0].end).toBe(48);   // acceptor G
    expect(res.orf).toBeGreaterThan(longestOrf(GENE)); // spliced ORF beats unspliced
  });
  it('without ORF guidance still finds the splice-optimal intron', () => {
    const res = detectGeneStructure(GENE, { orfGuided: false });
    expect(res.introns).toHaveLength(1);
    expect(res.introns[0].start).toBe(24);
  });
  it('prunes a spurious intron that would shorten the ORF', () => {
    // a clean single-ORF gene with NO real intron: ORF guidance should keep it intron-free
    const cleanGene = `ATG${'GCT'.repeat(40)}TAA`;
    const res = detectGeneStructure(cleanGene);
    expect(res.introns).toHaveLength(0);
  });
});
