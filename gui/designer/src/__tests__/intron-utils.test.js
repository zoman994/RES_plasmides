/**
 * Tests for intron detection, cDNA extraction, and exon range calculation.
 */
import { describe, it, expect } from 'vitest';
import { detectIntrons, intronsToAnnotations, getCDNA, getExonRanges } from '../intron-utils';

// Build a sequence with a known intron:
// exon1 (30nt = 10 codons) + intron (60nt, GT...AG, contains TAA at codon boundary) + exon2 (30nt, ends TAA)
// EXON1: 30nt, divisible by 3, starts with ATG
const EXON1 = 'ATGGCGAAAGCGGCGAAAGCGGCGAAAGCG'; // 30nt, 10 codons
// INTRON: 60nt, starts GT, ends AG, has in-frame TAA when read with exon1
// Position 30 in genomic = start of intron. After 30nt (10 codons), next codon boundary at 30.
// So intron body: need TAA at position 30+offset where offset%3=0
// GT + 1nt padding + TAA + 51nt filler + AG = 2+1+3+51+2 = 59... let's be exact:
// GT (2) + A (1) + TAA (3) + GCGAAAGCGGCGAAAGCGGCGAAAGCGGCGAAAGCGGCGAAAGCGGCGAAAGCG (52) + AG (2) = 60
const INTRON = 'GTATAAGCGAAAGCGGCGAAAGCGGCGAAAGCGGCGAAAGCGGCGAAAGCGGCGAAAGCAG'; // 60nt
const EXON2 = 'GCGAAAGCGGCGAAAGCGGCGAAAGCGTAA'; // 30nt, ends with TAA
const GENOMIC = EXON1 + INTRON + EXON2; // 120nt

describe('detectIntrons', () => {
  it('detects GT...AG intron that removes premature stop', () => {
    const candidates = detectIntrons(GENOMIC);
    expect(candidates.length).toBeGreaterThan(0);

    // Should find an intron starting at position 30 (after exon1)
    const found = candidates.find(c => c.start === 30);
    expect(found).toBeDefined();
    expect(found.donor).toBe('GT');
    expect(found.acceptor).toBe('AG');
    expect(found.removesStops).toBeGreaterThan(0);
  });

  it('returns empty for sequence without premature stops', () => {
    const cleanCDS = 'ATGGCGAAAGCGTAA'; // no internal stops
    expect(detectIntrons(cleanCDS)).toEqual([]);
  });

  it('candidates are sorted by start position', () => {
    const candidates = detectIntrons(GENOMIC);
    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i].start).toBeGreaterThanOrEqual(candidates[i - 1].start);
    }
  });
});

describe('intronsToAnnotations', () => {
  it('converts intron candidates to detail annotations', () => {
    const introns = [{ start: 30, end: 90, length: 60, framePreserving: true }];
    const anns = intronsToAnnotations(introns, 'r_cds', 0);

    expect(anns).toHaveLength(1);
    expect(anns[0]).toMatchObject({
      name: 'intron 1',
      type: 'intron',
      start: 30,
      end: 90,
      level: 'detail',
      regionId: 'r_cds',
    });
  });

  it('applies regionStart offset', () => {
    const introns = [{ start: 30, end: 90, length: 60, framePreserving: true }];
    const anns = intronsToAnnotations(introns, 'r1', 500);

    expect(anns[0].start).toBe(530);
    expect(anns[0].end).toBe(590);
  });

  it('numbers multiple introns', () => {
    const introns = [
      { start: 100, end: 200, length: 100, framePreserving: true },
      { start: 300, end: 400, length: 100, framePreserving: true },
    ];
    const anns = intronsToAnnotations(introns, 'r1', 0);
    expect(anns[0].name).toBe('intron 1');
    expect(anns[1].name).toBe('intron 2');
  });
});

describe('getCDNA', () => {
  it('removes introns and joins exons', () => {
    const introns = [{ start: 30, end: 30 + INTRON.length }]; // the intron in GENOMIC
    const cdna = getCDNA(GENOMIC, introns);

    expect(cdna).toBe(EXON1 + EXON2);
    expect(cdna.length).toBe(EXON1.length + EXON2.length);
  });

  it('returns original sequence when no introns', () => {
    expect(getCDNA('ATGATG', [])).toBe('ATGATG');
    expect(getCDNA('ATGATG', null)).toBe('ATGATG');
  });

  it('handles multiple introns', () => {
    // seq with two introns: exon1 + intron1 + exon2 + intron2 + exon3
    const e1 = 'AAAA', e2 = 'CCCC', e3 = 'GGGG';
    const i1 = 'TTTTTT', i2 = 'AAAAAA';
    const full = e1 + i1 + e2 + i2 + e3;
    const introns = [
      { start: 4, end: 10 },   // i1
      { start: 14, end: 20 },  // i2
    ];
    expect(getCDNA(full, introns)).toBe(e1 + e2 + e3);
  });
});

describe('getExonRanges', () => {
  it('returns single exon when no introns', () => {
    const exons = getExonRanges(0, 100, []);
    expect(exons).toEqual([{ start: 0, end: 100, name: 'exon 1' }]);
  });

  it('splits region by introns into exon ranges', () => {
    const intronEnd = 30 + INTRON.length;
    const introns = [{ start: 30, end: intronEnd }];
    const exons = getExonRanges(0, GENOMIC.length, introns);

    expect(exons).toHaveLength(2);
    expect(exons[0]).toEqual({ start: 0, end: 30, name: 'exon 1' });
    expect(exons[1]).toEqual({ start: intronEnd, end: GENOMIC.length, name: 'exon 2' });
  });

  it('handles multiple introns', () => {
    const introns = [
      { start: 100, end: 200 },
      { start: 300, end: 400 },
    ];
    const exons = getExonRanges(0, 500, introns);
    expect(exons).toHaveLength(3);
    expect(exons[0].name).toBe('exon 1');
    expect(exons[1].name).toBe('exon 2');
    expect(exons[2].name).toBe('exon 3');
  });
});
