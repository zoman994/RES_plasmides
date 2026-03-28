/**
 * Tests for codon table, translation, and codon optimization.
 */
import { describe, it, expect } from 'vitest';
import { CODON_TABLE, translateDNA, translateCodon, getBestCodon } from '../codons';

describe('CODON_TABLE', () => {
  it('has 64 entries (all codons)', () => {
    expect(Object.keys(CODON_TABLE)).toHaveLength(64);
  });

  it('ATG codes for Met', () => {
    expect(CODON_TABLE['ATG']).toBe('M');
  });

  it('TAA/TAG/TGA are stop codons', () => {
    expect(CODON_TABLE['TAA']).toBe('*');
    expect(CODON_TABLE['TAG']).toBe('*');
    expect(CODON_TABLE['TGA']).toBe('*');
  });

  it('all amino acids are single uppercase letters or *', () => {
    Object.values(CODON_TABLE).forEach(aa => {
      expect(aa).toMatch(/^[ACDEFGHIKLMNPQRSTVWY*]$/);
    });
  });
});

describe('translateDNA', () => {
  it('translates ATG to M', () => {
    expect(translateDNA('ATG')).toBe('M');
  });

  it('translates a complete ORF', () => {
    expect(translateDNA('ATGGCGTAA')).toBe('MA*');
  });

  it('handles lowercase', () => {
    expect(translateDNA('atggcgtaa')).toBe('MA*');
  });

  it('returns empty for empty input', () => {
    expect(translateDNA('')).toBe('');
  });

  it('ignores trailing nucleotides not forming a complete codon', () => {
    const protein = translateDNA('ATGGCG');
    expect(protein).toBe('MA');
    const protein2 = translateDNA('ATGGCGA');
    expect(protein2).toBe('MA');
  });

  it('translation length = floor(DNA length / 3)', () => {
    const dna = 'ATGATGATGATGATGATGATG'; // 21 nt
    expect(translateDNA(dna).length).toBe(7);
  });
});

describe('translateCodon', () => {
  it('translates individual codons', () => {
    expect(translateCodon('ATG')).toBe('M');
    expect(translateCodon('GCG')).toBe('A');
  });
});

describe('getBestCodon', () => {
  it('returns a valid codon for each amino acid', () => {
    const aa = 'A';
    const codon = getBestCodon(aa, 'E. coli');
    expect(codon).toHaveLength(3);
    expect(CODON_TABLE[codon]).toBe(aa);
  });

  it('returns different optimal codons for different organisms', () => {
    // E. coli and S. cerevisiae may prefer different Leu codons
    const ecoli = getBestCodon('L', 'E. coli');
    const yeast = getBestCodon('L', 'S. cerevisiae');
    expect(CODON_TABLE[ecoli]).toBe('L');
    expect(CODON_TABLE[yeast]).toBe('L');
  });
});
