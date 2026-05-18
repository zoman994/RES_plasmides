/**
 * skeleton-codon-optimize-r7.test.jsx — E.coli codon optimization.
 *
 * R7-3 (14.05.2026). Verifies:
 *   - translateDNA correctness для known codons + stop.
 *   - optimizeCdsForEcoli заменяет на preferred codons.
 *   - codonScore counts preferred % per AA.
 *   - findRareCodons returns positions of non-preferred codons.
 *   - Optimized CDS translates back в same aa sequence (silent mutations).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import {
  translateDNA,
  optimizeCdsForEcoli,
  codonScore,
  findRareCodons,
} from '../../../lib/bio/codon-optimize-ecoli';

describe('R7-3 — translateDNA', () => {
  it('translates ATG-stop CDS', () => {
    const result = translateDNA('ATGGCCAAGCATCGCTAA');
    expect(result.aa).toBe('MAKHR*');
    expect(result.errors).toHaveLength(0);
  });

  it('reports error для not-multiple-of-3', () => {
    const result = translateDNA('ATGGCC');
    expect(result.aa).toBe('MA');
    expect(result.errors).toHaveLength(0);
    const result2 = translateDNA('ATGGCCT');
    expect(result2.errors).toContainEqual(expect.stringMatching(/не делится/));
  });

  it('returns X для invalid codon', () => {
    const result = translateDNA('ATGNNNAAA');
    expect(result.aa).toContain('X');
  });
});

describe('R7-3 — optimizeCdsForEcoli', () => {
  it('replaces non-preferred codons', () => {
    // 'TTT' (F, rare; preferred TTC) + 'TTA' (L, rare; preferred CTG) +
    // 'ATA' (I, rare; preferred ATC) + 'TAA' (stop, already preferred).
    const cds = 'ATGTTTTTAATATAA';
    const result = optimizeCdsForEcoli(cds);
    expect(result.errors).toHaveLength(0);
    expect(result.changes).toBe(3); // TTT→TTC, TTA→CTG, ATA→ATC.
    expect(result.optimized).toBe('ATGTTCCTGATCTAA');
    expect(result.aaSeq).toBe('MFLI*');
  });

  it('keeps already-preferred codons', () => {
    const cds = 'ATGTTCCTGATCTAA'; // all preferred.
    const result = optimizeCdsForEcoli(cds);
    expect(result.changes).toBe(0);
    expect(result.optimized).toBe(cds);
  });

  it('preserves amino acid sequence (silent mutations)', () => {
    const cds = 'ATGTTTTTAATATAA';
    const result = optimizeCdsForEcoli(cds);
    const origTranslation = translateDNA(cds).aa;
    const optTranslation = translateDNA(result.optimized).aa;
    expect(optTranslation).toBe(origTranslation);
  });

  it('replaced array contains position/from/to/aa', () => {
    const cds = 'ATGTTT'; // 'TTT' (F) → 'TTC'
    const result = optimizeCdsForEcoli(cds);
    expect(result.replaced).toHaveLength(1);
    expect(result.replaced[0]).toEqual({ position: 3, from: 'TTT', to: 'TTC', aa: 'F' });
  });
});

describe('R7-3 — codonScore', () => {
  it('all-preferred CDS → 100%', () => {
    const cds = 'ATGTTCCTGATCTAA';
    const result = codonScore(cds);
    expect(result.percent).toBe(100);
    expect(result.preferredCount).toBe(result.totalCodons);
  });

  it('mixed CDS — counts preferred per AA', () => {
    // ATG(M, preferred) + TTT(F, rare) + TTC(F, preferred) + TAA(stop, preferred).
    const cds = 'ATGTTTTTCTAA';
    const result = codonScore(cds);
    expect(result.totalCodons).toBe(4);
    expect(result.preferredCount).toBe(3); // ATG, TTC, TAA preferred; TTT rare.
    expect(result.percent).toBe(75);
    expect(result.byAA.F.total).toBe(2);
    expect(result.byAA.F.preferred).toBe(1);
    expect(result.byAA.F.percent).toBe(50);
  });
});

describe('R7-3 — findRareCodons', () => {
  it('returns positions of non-preferred', () => {
    const cds = 'ATGTTTGCCTAA'; // TTT(F, rare), GCC(A, rare).
    const rare = findRareCodons(cds);
    expect(rare).toHaveLength(2);
    expect(rare[0]).toEqual({ position: 3, codon: 'TTT', aa: 'F', preferred: 'TTC' });
    expect(rare[1]).toEqual({ position: 6, codon: 'GCC', aa: 'A', preferred: 'GCG' });
  });

  it('всё optimized → empty', () => {
    const cds = 'ATGTTCGCGTAA';
    expect(findRareCodons(cds)).toHaveLength(0);
  });
});
