/**
 * K3.0 SCOPE — the ACGT-only rule applies to interactive DNA Search and to NOTHING ELSE.
 *
 * Removing degeneracy from the DNA hot path is only correct if it stays there. Three other
 * subsystems depend on IUPAC codes for real biology and must be untouched:
 *
 *   • `lib/iupac.js` — the shared degenerate-base engine (masks, compatibility, complement);
 *   • restriction enzymes — a great many recognition sites ARE degenerate (ApoI R^AATTY,
 *     HincII GTY^RAC). An enzyme search that refused `R`/`Y` would simply lose those enzymes;
 *   • protein search — `X` is an unknown residue, not a typo.
 *
 * Degenerate primer binding is likewise a normal wet-lab practice (a primer designed against a
 * conserved motif). This file is the regression net for that boundary: if a later cleanup pass
 * reaches past DNA Search, one of these fails.
 */
import { describe, it, expect } from 'vitest';
import { iupacBits, iupacMatch, reverseComplementIupac, normalizeSeq } from '../iupac';
import { makeReMatch } from '../re-match';
import { makeProteinMatch } from '../protein-match';
import { scanLibraryForPrimer } from '../primer-binding-search';
import { dnaGappedSearch } from '../dna-gapped-search';

describe('the shared IUPAC layer is intact', () => {
  it('still resolves degenerate codes to base masks', () => {
    expect(iupacBits('N')).toBe(0b1111);
    expect(iupacBits('R')).toBe(iupacBits('A') | iupacBits('G'));
    expect(iupacBits('Y')).toBe(iupacBits('C') | iupacBits('T'));
  });

  it('still answers compatibility questions', () => {
    expect(iupacMatch('R', 'A')).toBe(true);
    expect(iupacMatch('R', 'C')).toBe(false);
    expect(iupacMatch('N', 'T')).toBe(true);
  });

  it('still complements the full alphabet, and still folds U→T on ITS OWN input', () => {
    // This normalisation is right HERE (a shared helper serving RNA-aware callers) and wrong in
    // DNA Search — which is exactly why DNA Search stopped calling it rather than changing it.
    expect(reverseComplementIupac('RYSWKM')).toBe('KMWSRY');
    expect(normalizeSeq('ACGU')).toBe('ACGT');
  });
});

describe('restriction enzymes keep their degenerate recognition sites', () => {
  const doc = (seq) => ({
    ref: { kind: 'entry', id: 'e' },
    sequence: { seq, topology: 'linear' },
  });

  it('a degenerate site (ApoI R^AATTY) still finds its concrete occurrences', () => {
    // RAATTY matches AAATTC (R=A, Y=C) — an ACGT-only matcher would find nothing here.
    const reMatch = makeReMatch({});
    const occ = reMatch('ApoI', doc('TTTTAAATTCTTTT'), null, {}) || [];
    expect(occ.length).toBeGreaterThan(0);
  });

  it('…and reports it honestly as compatibility, not proven identity', () => {
    const reMatch = makeReMatch({});
    const [hit] = reMatch('ApoI', doc('TTTTAAATTCTTTT'), null, {}) || [];
    expect(hit.metrics.identity).toBeNull(); // «IUPAC-сайт», not «100% идентичность»
    expect(hit.metrics.compatibility).toBe(1);
  });
});

describe('protein search keeps its unknown-residue handling', () => {
  it('X in the query is a wildcard residue, and the hit says so', () => {
    const proteinMatch = makeProteinMatch({});
    const doc = {
      ref: { kind: 'entry', id: 'p' },
      sequence: { seq: 'ATGCATCATCATCATCATCATTAA', topology: 'linear' },
      features: [{ id: 'c', name: 'g', type: 'CDS', start: 0, end: 24, strand: 1 }],
    };
    const occ = proteinMatch('HHXHHH', doc, null, {}) || [];
    expect(occ.length).toBeGreaterThan(0);
    expect(occ[0].metrics.uncertainMatches).toBe(1);
  });
});

describe('primer binding keeps mismatch tolerance', () => {
  it('a weakly-complementary site is still found when the caller allows a mismatch', () => {
    const entries = [{ id: 'e', name: 'pX', sequence: 'TTTTGGGCATCAGGATCCAATTTT' }];
    // One mismatch in the 5′ half. Deliberately NOT near the 3′ end: that region is clamped
    // (a 3′ mismatch kills priming), so a 3′-proximal variant would be rejected on purpose.
    const primer = { id: 'pr', name: 'p1', sequence: 'GGTCATCAGGATCCAA' };
    const exact = scanLibraryForPrimer(primer, entries, { maxMismatches: 0 });
    const fuzzy = scanLibraryForPrimer(primer, entries, { maxMismatches: 1 });
    // Both halves asserted: `fuzzy >= exact` alone would pass with 0 and 0, proving nothing.
    expect(fuzzy.length).toBeGreaterThan(0);
    expect(exact.length).toBe(0);
  });
});

describe('…while interactive DNA search itself stays ACGT-only', () => {
  it('the same degenerate motif that an enzyme may carry is refused as a DNA query', () => {
    // The contrast is the point: `RAATTY` is a legitimate ENZYME site and an illegitimate DNA
    // QUERY. One alphabet rule per subsystem, not one global rule.
    let thrown = null;
    try { dnaGappedSearch('RAATTY', 'TTTTAAATTCTTTT', { thresholdBps: 8000 }); } catch (e) { thrown = e; }
    expect(thrown).toBeTruthy();
    expect(thrown.code).toBe('INVALID_DNA');
  });
});
