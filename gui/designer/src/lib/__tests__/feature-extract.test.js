import { describe, it, expect } from 'vitest';
import { extractFeatureSequences } from '../feature-extract';

// CDS [0,30) with one in-frame intron [9,18). Unspliced, the intron's TGA at pos 9
// is a premature stop; splicing removes it → a clean protein.
//   exon1 ATGAAAGGG (M K G) | intron TGAAGTCAG | exon2 CCCTTTGGGTAA (P F G *)
const FULL = `${'ATGAAAGGG'}${'TGAAGTCAG'}${'CCCTTTGGGTAA'}`; // 30 nt
const CDS = { id: 'g1', name: 'glaA', type: 'CDS', start: 0, end: 30, strand: 1 };
const INTRON = { type: 'intron', regionId: 'g1', start: 9, end: 18, strand: 1 };

describe('extractFeatureSequences (FEAT-EXTRACT)', () => {
  it('removes introns → mature cDNA + clean protein (no premature stop)', () => {
    const r = extractFeatureSequences(FULL, CDS, [CDS, INTRON]);
    expect(r.cdna).toBe('ATGAAAGGGCCCTTTGGGTAA'); // exon1 + exon2, intron gone
    expect(r.cdna.length).toBe(21);
    expect(r.intronsRemoved).toBe(1);
    expect(r.protein).toBe('MKGPFG'); // trailing stop stripped, no internal *
    expect(r.protein).not.toContain('*');
    expect(r.cdnaName).toBe('glaA cDNA');
    expect(r.proteinName).toBe('glaA protein');
  });

  it('a CDS with no introns extracts its contiguous coding sequence', () => {
    const r = extractFeatureSequences(FULL, CDS, [CDS]);
    expect(r.cdna).toBe(FULL); // whole region, nothing spliced
    expect(r.intronsRemoved).toBe(0);
  });

  it('reverse-strand region extracts the reverse-complement cDNA', () => {
    const rev = { id: 'g2', name: 'rev', type: 'CDS', start: 0, end: 6, strand: -1 };
    const r = extractFeatureSequences('ATGCGT', rev, [rev]);
    expect(r.cdna).toBe('ACGCAT'); // RC of ATGCGT
    expect(r.strand).toBe(-1);
  });

  it('a non-coding region (promoter) yields cDNA but no protein', () => {
    const prom = { id: 'p1', name: 'PglaA', type: 'promoter', start: 0, end: 30, strand: 1 };
    const r = extractFeatureSequences(FULL, prom, [prom]);
    expect(r.cdna.length).toBe(30);
    expect(r.protein).toBeUndefined();
    expect(r.proteinName).toBeUndefined();
  });

  it('opts.translate forces protein on / off regardless of type', () => {
    const prom = { id: 'p1', name: 'x', type: 'promoter', start: 0, end: 30, strand: 1 };
    expect(extractFeatureSequences(FULL, prom, [prom], { translate: true }).protein).toBeTruthy();
    expect(extractFeatureSequences(FULL, CDS, [CDS], { translate: false }).protein).toBeUndefined();
  });

  it('nullish / invalid input → null', () => {
    expect(extractFeatureSequences('', CDS, [])).toBeNull();
    expect(extractFeatureSequences(FULL, null, [])).toBeNull();
    expect(extractFeatureSequences(FULL, { start: NaN, end: 5 }, [])).toBeNull();
  });
});
