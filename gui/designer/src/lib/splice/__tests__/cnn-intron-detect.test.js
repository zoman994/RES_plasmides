/**
 * cnn-intron-detect.test.js — the CNN scorer drives the gene-model decoder
 * (Phase 2 integration). A constructed gene with consensus splice sites embedded
 * in ≥100 bp flanks (so the CNN windows have full context) must yield exactly the
 * planted intron, on the forward strand, when scoreSpliceSitesCNN is injected.
 */
import { describe, it, expect } from 'vitest';
import { detectIntrons } from '../intron-detect.js';
import { detectGeneStructure } from '../gene-model.js';
import { scoreSpliceSitesCNN } from '../cnn-scorer.js';

// EXON1 (120bp, frame0, no stop, ends CAG) | INTRON (30bp, GTAAGT…pyrimidine…CAG,
// contains an in-frame stop) | EXON2 (123bp, ends TAA)
const EXON1 = 'ATG' + 'GCT'.repeat(38) + 'CAG';            // len 120
const INTRON = 'GTAAGT' + 'TAA' + 'CCCC' + 'TTTTCTTTCTTTCC' + 'CAG'; // len 30
const EXON2 = 'GCT'.repeat(40) + 'TAA';                    // len 123
const GENE = EXON1 + INTRON + EXON2;                       // 273
const DONOR_POS = 120;       // G of GT (intron first base)
const ACCEPTOR_POS = 149;    // G of AG (intron last base)

describe('CNN scorer → gene-model decoder', () => {
  it('detectGeneStructure picks the planted intron with the CNN scorer', () => {
    const r = detectGeneStructure(GENE, { scorer: scoreSpliceSitesCNN, scoreGate: 0 });
    expect(r.introns.length).toBe(1);
    expect(r.introns[0]).toMatchObject({ start: DONOR_POS, end: ACCEPTOR_POS });
    // spliced ORF must beat the unspliced one (that's why the intron is kept)
    expect(r.orf).toBeGreaterThan(60);
  });

  it('detectIntrons returns the intron on the forward strand (half-open coords)', () => {
    const r = detectIntrons(GENE, { scorer: scoreSpliceSitesCNN, scoreGate: 0 });
    expect(r.strand).toBe(1);
    expect(r.introns.length).toBe(1);
    expect(r.introns[0]).toMatchObject({ start: DONOR_POS, end: ACCEPTOR_POS + 1, type: 'intron' });
    expect(r.exons.length).toBe(2);
  });

  it('the PWM scorer remains the default (no scorer injected)', () => {
    // sanity: default path still runs and returns the documented shape
    const r = detectIntrons(GENE);
    expect(r).toHaveProperty('introns');
    expect(r).toHaveProperty('cryptic');
    expect(Array.isArray(r.introns)).toBe(true);
  });
});
