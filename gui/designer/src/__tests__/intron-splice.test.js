/**
 * intron-splice.test.js — splice-aware translation primitives (Phase A).
 *
 * getIntronsForRegion: normalise the two intron shapes (detail+regionId from
 * manual / intron-utils, region-level no-parent from the gene parser) at the
 * consumption boundary.
 * spliceRegion: CDS region minus its introns → mature spliced sequence +
 * a bidirectional spliced↔genomic coordinate map. Reverse-strand aware.
 */
import { describe, it, expect } from 'vitest';
import {
  getIntronsForRegion,
  spliceRegion,
  splicedToGenomic,
  genomicToSpliced,
} from '../intron-utils';
import { reverseComplement } from '../sequence-utils';

// Reuse the canonical fixture geometry: exon1 (30) + intron + exon2 (30).
const EXON1 = 'ATGGCGAAAGCGGCGAAAGCGGCGAAAGCG'; // 30nt, starts ATG
const INTRON = 'GTATAAGCGAAAGCGGCGAAAGCGGCGAAAGCGGCGAAAGCGGCGAAAGCGGCGAAAGCAG'; // GT…AG
const EXON2 = 'GCGAAAGCGGCGAAAGCGGCGAAAGCGTAA'; // 30nt, ends TAA
const GENOMIC = EXON1 + INTRON + EXON2;

// Boundaries derived from the constants — never hardcode the intron length.
const E1 = EXON1.length;            // 30
const E2 = EXON2.length;            // 30
const GLEN = GENOMIC.length;        // 30 + |INTRON| + 30
const EX2_G = E1 + INTRON.length;   // genomic start of exon2
const SLEN = E1 + E2;               // spliced length (60)
const INTRON_RANGE = { start: E1, end: EX2_G };

describe('getIntronsForRegion', () => {
  const region = { id: 'cds1', start: 0, end: GLEN, strand: 1 };

  it('includes a detail intron linked by regionId', () => {
    const anns = [{ type: 'intron', level: 'detail', regionId: 'cds1', start: E1, end: EX2_G }];
    expect(getIntronsForRegion(anns, region)).toHaveLength(1);
  });

  it('includes a region-level intron geometrically inside, same strand', () => {
    const anns = [{ type: 'intron', level: 'region', start: E1, end: EX2_G, strand: 1 }];
    expect(getIntronsForRegion(anns, region)).toHaveLength(1);
  });

  it('includes a detail intron linked by parentId (feature-map shape)', () => {
    // buildFeatureMap renames the annotation regionId → parentId
    const anns = [{ type: 'intron', level: 'detail', parentId: 'cds1', start: E1, end: EX2_G }];
    expect(getIntronsForRegion(anns, region)).toHaveLength(1);
  });

  it('excludes an intron outside the region bounds', () => {
    const anns = [{ type: 'intron', start: GLEN + 50, end: GLEN + 110, strand: 1 }];
    expect(getIntronsForRegion(anns, region)).toHaveLength(0);
  });

  it('excludes an opposite-strand intron (avoids capturing the other strand CDS)', () => {
    const anns = [{ type: 'intron', start: E1, end: EX2_G, strand: -1 }];
    expect(getIntronsForRegion(anns, region)).toHaveLength(0);
  });

  it('excludes a detail intron that belongs to a different region', () => {
    const anns = [{ type: 'intron', level: 'detail', regionId: 'OTHER', start: E1, end: EX2_G }];
    expect(getIntronsForRegion(anns, region)).toHaveLength(0);
  });

  it('ignores non-intron annotations', () => {
    const anns = [{ type: 'CDS', start: E1, end: EX2_G }, { type: 'exon', start: E1, end: EX2_G }];
    expect(getIntronsForRegion(anns, region)).toHaveLength(0);
  });
});

describe('spliceRegion — forward strand', () => {
  const region = { id: 'cds1', start: 0, end: GLEN, strand: 1 };

  it('removes the intron and yields the mature spliced sequence', () => {
    const { spliced } = spliceRegion(GENOMIC, region, [INTRON_RANGE]);
    expect(spliced).toBe(EXON1 + EXON2);
    expect(spliced).toHaveLength(SLEN);
  });

  it('returns the whole region unchanged when there are no introns', () => {
    const { spliced } = spliceRegion(GENOMIC, region, []);
    expect(spliced).toBe(GENOMIC);
  });

  it('maps spliced positions back to genomic across the intron gap', () => {
    const { exonMap } = spliceRegion(GENOMIC, region, [INTRON_RANGE]);
    expect(splicedToGenomic(exonMap, 0)).toBe(0);          // first base of exon1
    expect(splicedToGenomic(exonMap, E1 - 1)).toBe(E1 - 1); // last base of exon1
    expect(splicedToGenomic(exonMap, E1)).toBe(EX2_G);      // first base of exon2 (jump)
    expect(splicedToGenomic(exonMap, SLEN - 1)).toBe(GLEN - 1);
  });

  it('maps genomic positions to spliced, and intron bases map to -1', () => {
    const { exonMap } = spliceRegion(GENOMIC, region, [INTRON_RANGE]);
    expect(genomicToSpliced(exonMap, 0)).toBe(0);
    expect(genomicToSpliced(exonMap, EX2_G)).toBe(E1);
    expect(genomicToSpliced(exonMap, E1 + 1)).toBe(-1); // inside intron
  });

  it('round-trips spliced→genomic→spliced for every position', () => {
    const { spliced, exonMap } = spliceRegion(GENOMIC, region, [INTRON_RANGE]);
    for (let i = 0; i < spliced.length; i++) {
      expect(genomicToSpliced(exonMap, splicedToGenomic(exonMap, i))).toBe(i);
    }
  });
});

describe('spliceRegion — reverse strand', () => {
  const region = { id: 'cds1', start: 0, end: GLEN, strand: -1 };

  it('yields the reverse-complement of the joined exons (mature mRNA 5′→3′)', () => {
    const { spliced } = spliceRegion(GENOMIC, region, [INTRON_RANGE]);
    expect(spliced).toBe(reverseComplement(EXON1 + EXON2));
    expect(spliced).toHaveLength(SLEN);
  });

  it('maps spliced index 0 to the 3′-most genomic base and walks down', () => {
    const { exonMap } = spliceRegion(GENOMIC, region, [INTRON_RANGE]);
    expect(splicedToGenomic(exonMap, 0)).toBe(GLEN - 1);  // mRNA start = highest genomic exon base
    expect(splicedToGenomic(exonMap, E2 - 1)).toBe(EX2_G); // last base of exon2 (genomic)
    expect(splicedToGenomic(exonMap, E2)).toBe(E1 - 1);    // jump to exon1 high end
    expect(splicedToGenomic(exonMap, SLEN - 1)).toBe(0);
  });

  it('spliced base equals the complement of its mapped genomic base', () => {
    const { spliced, exonMap } = spliceRegion(GENOMIC, region, [INTRON_RANGE]);
    const COMP = { A: 'T', T: 'A', G: 'C', C: 'G' };
    for (let i = 0; i < spliced.length; i++) {
      expect(spliced[i]).toBe(COMP[GENOMIC[splicedToGenomic(exonMap, i)]]);
    }
  });
});
