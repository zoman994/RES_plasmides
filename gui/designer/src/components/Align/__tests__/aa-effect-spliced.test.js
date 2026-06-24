/**
 * aa-effect-spliced.test.js — buildAAEffects judges a mismatch on the MATURE
 * spliced CDS when the reference carries introns (Phase F). A mismatch in an
 * exon uses the spliced reading frame; a mismatch inside an intron has no
 * protein consequence (no badge).
 */
import { describe, it, expect } from 'vitest';
import { buildAAEffects } from '../aa-effect';

const EXON1 = 'ATGGCGAAAGCGGCGAAAGCGGCGAAAGCG'; // 30nt
const INTRON = 'GTATAAGCGAAAGCGGCGAAAGCGGCGAAAGCGGCGAAAGCGGCGAAAGCGGCGAAAGCAG';
const EXON2 = 'GCGAAAGCGGCGAAAGCGGCGAAAGCGTAA'; // 30nt
const GENOMIC = EXON1 + INTRON + EXON2;
const E1 = EXON1.length;
const EX2_G = E1 + INTRON.length; // genomic start of exon2 ('GCG' = Ala)

const cds = { id: 'cds1', type: 'CDS', level: 'region', start: 0, end: GENOMIC.length, strand: 1 };
const intron = { id: 'i1', type: 'intron', level: 'region', start: E1, end: EX2_G, strand: 1 };
const mm = (pos, base) => ({ [pos]: { base, status: 'mismatch' } });

describe('buildAAEffects — spliced CDS', () => {
  it('judges an exon mismatch on the spliced reading frame (missense)', () => {
    // first base of exon2 = spliced codon "GCG" (Ala); G→T ⇒ "TCG" (Ser)
    const eff = buildAAEffects(GENOMIC, [cds, intron], [EX2_G], mm(EX2_G, 'T'));
    expect(eff[EX2_G]).toMatchObject({ effect: 'missense', refAA: 'A', altAA: 'S' });
  });

  it('reports a silent exon mismatch (wobble base)', () => {
    // third base of that "GCG" codon: G→A ⇒ "GCA" still Ala
    const p = EX2_G + 2;
    const eff = buildAAEffects(GENOMIC, [cds, intron], [p], mm(p, 'A'));
    expect(eff[p]).toMatchObject({ effect: 'silent', refAA: 'A', altAA: 'A' });
  });

  it('emits no badge for a mismatch inside an intron (spliced out)', () => {
    const p = E1 + 10; // well inside the intron [E1, EX2_G)
    const eff = buildAAEffects(GENOMIC, [cds, intron], [p], mm(p, 'A'));
    expect(eff[p]).toBeUndefined();
  });

  it('still works for a CDS without introns (raw path unchanged)', () => {
    const clean = 'ATG' + 'GCG'.repeat(8) + 'TAA'; // M + 8×Ala + stop
    const c2 = { id: 'c2', type: 'CDS', level: 'region', start: 0, end: clean.length, strand: 1 };
    // codon 2 = "GCG" (Ala) at genomic 3..5; first base G→T ⇒ "TCG" (Ser)
    const eff = buildAAEffects(clean, [c2], [3], mm(3, 'T'));
    expect(eff[3]).toMatchObject({ effect: 'missense', refAA: 'A', altAA: 'S' });
  });
});
