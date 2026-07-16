import { describe, it, expect } from 'vitest';
import { deriveProtein, deriveProteinCached, clearDerivedProteinCache } from '../derived-protein.js';

// Canonical splice fixture reused from codon-walker-spliced.test.js:
// EXON1(30) + INTRON(60) + EXON2(30, ends TAA), forward CDS.
const EXON1 = 'ATGGCGAAAGCGGCGAAAGCGGCGAAAGCG'; // MAKAAKAAKA (10 codons)
const INTRON = 'GTATAAGCGAAAGCGGCGAAAGCGGCGAAAGCGGCGAAAGCGGCGAAAGCGGCGAAAGCAG';
const EXON2 = 'GCGAAAGCGGCGAAAGCGGCGAAAGCGTAA'; // AKAAKAAKA* (10 codons)
const GENOMIC = EXON1 + INTRON + EXON2;
const E1 = EXON1.length;       // 30
const EX2_G = E1 + INTRON.length; // 90 — genomic start of exon2

describe('deriveProtein — spliced forward CDS', () => {
  const region = { id: 'cds1', name: 'glaA', type: 'CDS', start: 0, end: GENOMIC.length, strand: 1 };
  const intron = { type: 'intron', regionId: 'cds1', start: E1, end: EX2_G };
  const dp = deriveProtein(GENOMIC, region, [intron]);

  it('translates the intron-excluded mature ORF (up to the terminal stop)', () => {
    expect(dp.proteinSequence).toBe('MAKAAKAAKAAKAAKAAKA'); // 19 aa, stop dropped
    expect(dp.hasStop).toBe(true);
  });
  it('reports strand + heuristic frame + intron count', () => {
    expect(dp.strand).toBe(1);
    expect(dp.codonStart).toBe(0);
    expect(dp.frameSource).toBe('heuristic');
    expect(dp.intronCount).toBe(1);
  });
  it('exposes exon segments (genomic ranges, intron excluded)', () => {
    expect(dp.exonSegments.map((e) => [e.start, e.end])).toEqual([[0, E1], [EX2_G, GENOMIC.length]]);
  });
  it('maps each residue to its per-base genomic coords (aaToGenomicMap)', () => {
    expect(dp.aaToGenomicMap).toHaveLength(19);
    expect(dp.aaToGenomicMap[0]).toEqual({ aa: 'M', index: 1, g: [0, 1, 2] });
    // residue 11 is the first codon of exon2 → jumps to genomic EX2_G
    expect(dp.aaToGenomicMap[10].g).toEqual([EX2_G, EX2_G + 1, EX2_G + 2]);
  });
});

describe('deriveProtein — codon_start honored over heuristic', () => {
  it('shifts the reading frame by codon_start=2 (frame offset 1)', () => {
    const full = 'GATGAAATAA'; // leading G; codon_start 2 → ATG AAA TAA
    const region = { id: 'c2', type: 'CDS', start: 0, end: full.length, strand: 1, qualifiers: { codon_start: '2' } };
    const dp = deriveProtein(full, region, []);
    expect(dp.proteinSequence).toBe('MK');
    expect(dp.codonStart).toBe(1);
    expect(dp.frameSource).toBe('codon_start');
    expect(dp.aaToGenomicMap[0].g).toEqual([1, 2, 3]);
  });
});

describe('deriveProtein — reverse CDS', () => {
  it('translates the reverse-complement mature protein on the − strand', () => {
    const full = 'TTATTTCAT'; // reverse-complement of ATGAAATAA (M K *)
    const region = { id: 'r1', type: 'CDS', start: 0, end: full.length, strand: -1 };
    const dp = deriveProtein(full, region, []);
    expect(dp.proteinSequence).toBe('MK');
    expect(dp.strand).toBe(-1);
    // M's codon reads antisense from the 3' genomic end downward.
    expect(dp.aaToGenomicMap[0].g).toEqual([8, 7, 6]);
  });
});

describe('deriveProtein — genetic code provenance', () => {
  it('defaults to standard table 1 and flags a non-standard transl_table', () => {
    const std = deriveProtein('ATGAAATAA', { id: 'a', start: 0, end: 9, strand: 1 }, []);
    expect(std.translationTable).toBe(1);
    expect(std.nonStandardCode).toBe(false);
    const mt = deriveProtein('ATGAAATAA', { id: 'b', start: 0, end: 9, strand: 1, qualifiers: { transl_table: '4' } }, []);
    expect(mt.translationTable).toBe(4);
    expect(mt.nonStandardCode).toBe(true);
  });
});

describe('deriveProtein — guards', () => {
  it('returns null for invalid input / too-short region', () => {
    expect(deriveProtein(null, { start: 0, end: 9 }, [])).toBeNull();
    expect(deriveProtein('AT', { start: 0, end: 2, strand: 1 }, [])).toBeNull();
  });
});

describe('deriveProteinCached', () => {
  it('memoizes by explicit cache key and clears on demand', () => {
    clearDerivedProteinCache();
    const region = { id: 'k', start: 0, end: 9, strand: 1 };
    const a = deriveProteinCached('ATGAAATAA', region, [], 'rev1:k');
    const b = deriveProteinCached('DIFFERENT', region, [], 'rev1:k'); // same key → cached (ignores new seq)
    expect(b).toBe(a);
    clearDerivedProteinCache();
    const c = deriveProteinCached('ATGAAATAA', region, [], 'rev1:k');
    expect(c).not.toBe(a);
  });
});
