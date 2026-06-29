/**
 * protein-effect.js (UX-6) — classify the protein-level consequence of a
 * sequence edit within a CDS: silent / missense / truncation / extension /
 * frameshift / inframe-indel. The headline molbiol value is a loud FRAMESHIFT
 * verdict on a non-3× indel (sequence-diff only handled substitutions).
 */
import { describe, it, expect } from 'vitest';
import { classifyProteinEffect } from '../protein-effect';

// CDS: ATG GCC GCC TAA  (M A A *) — start 0, end 12, forward.
const ORIG = 'ATGGCCGCCTAA';
const CDS = { start: 0, end: 12, strand: 1 };

describe('classifyProteinEffect', () => {
  it('no change → silent (none of the bases differ)', () => {
    expect(classifyProteinEffect(ORIG, ORIG, CDS).kind).toBe('silent');
  });

  it('synonymous substitution → silent (GCC→GCA, both Ala)', () => {
    const edited = 'ATGGCAGCCTAA';
    expect(classifyProteinEffect(ORIG, edited, CDS).kind).toBe('silent');
  });

  it('non-synonymous substitution → missense (GCC→GAC, Ala→Asp)', () => {
    const edited = 'ATGGACGCCTAA';
    const r = classifyProteinEffect(ORIG, edited, CDS);
    expect(r.kind).toBe('missense');
    expect(r.changes?.[0]).toMatchObject({ from: 'A', to: 'D' });
  });

  it('premature stop → truncation (codon 2 GCC→TAA)', () => {
    const edited = 'ATGTAAGCCTAA';
    expect(classifyProteinEffect(ORIG, edited, CDS).kind).toBe('truncation');
  });

  it('1-bp insertion → frameshift', () => {
    const edited = 'ATGGACCGCCTAA'; // +1 nt inside CDS
    expect(classifyProteinEffect(ORIG, edited, CDS).kind).toBe('frameshift');
  });

  it('1-bp deletion → frameshift', () => {
    const edited = 'ATGGCGCCTAA'; // -1 nt
    expect(classifyProteinEffect(ORIG, edited, CDS).kind).toBe('frameshift');
  });

  it('3-bp in-frame insertion → inframe-indel (codon added, no shift)', () => {
    const edited = 'ATGGCCGGGGCCTAA'; // +GGG (Gly) in frame
    expect(classifyProteinEffect(ORIG, edited, CDS).kind).toBe('inframe-indel');
  });

  it('lost stop (extension) — stop codon mutated away', () => {
    // TAA → CAA (Gln): translation runs past the old stop → extension.
    const edited = 'ATGGCCGCCCAA';
    expect(classifyProteinEffect(ORIG, edited, CDS).kind).toBe('extension');
  });

  it('reverse-strand CDS is translated on the complement', () => {
    // RC(ORIG) as the template; the CDS on the minus strand reads back to MAA*.
    const rc = 'TTAGGCGGCCAT';
    const cdsRev = { start: 0, end: 12, strand: -1 };
    expect(classifyProteinEffect(rc, rc, cdsRev).kind).toBe('silent');
  });

  it('no / empty CDS → none', () => {
    expect(classifyProteinEffect(ORIG, 'ATGGACGCCTAA', null).kind).toBe('none');
  });
});
