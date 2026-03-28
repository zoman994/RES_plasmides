/**
 * Tests for inline mutagenesis: substitution, deletion, codon selection.
 */
import { describe, it, expect } from 'vitest';
import { getCommonSubstitutions, chooseMutantCodon, inlineSubstitution, inlineDeletion, designInlineKLDPrimers } from '../mutagenesis';

describe('getCommonSubstitutions', () => {
  it('returns substitutions for all standard amino acids', () => {
    'ACDEFGHIKLMNPQRSTVWY'.split('').forEach(aa => {
      const subs = getCommonSubstitutions(aa);
      expect(subs.length).toBeGreaterThan(0);
      subs.forEach(s => {
        expect(s.to).toMatch(/^[A-Z]$/);
        expect(s.note).toBeTruthy();
      });
    });
  });

  it('E has charge-removing and conservative substitutions', () => {
    const subs = getCommonSubstitutions('E');
    expect(subs.some(s => s.to === 'A')).toBe(true);
    expect(subs.some(s => s.to === 'D')).toBe(true);
  });

  it('S has phosphomimetic substitutions', () => {
    const subs = getCommonSubstitutions('S');
    expect(subs.some(s => s.to === 'D' && s.note.includes('фосфо'))).toBe(true);
  });
});

describe('chooseMutantCodon', () => {
  it('selects codon with minimum nucleotide changes', () => {
    // GAG (Glu) → Ala: GCG has 1 change, GCT has 2 changes
    const result = chooseMutantCodon('GAG', 'A');
    expect(result.codon).toBe('GCG');
    expect(result.changes).toBe(1);
  });

  it('returns null for invalid target', () => {
    expect(chooseMutantCodon('ATG', 'X')).toBeNull();
  });

  it('changing to same AA returns 0 changes', () => {
    const result = chooseMutantCodon('ATG', 'M');
    expect(result.codon).toBe('ATG');
    expect(result.changes).toBe(0);
  });
});

describe('inlineSubstitution', () => {
  it('substitutes amino acid in sequence', () => {
    // ATG GCG TAA — M A *
    const result = inlineSubstitution('ATGGCGTAA', 1, 'V'); // A→V at position 1
    expect(result).not.toBeNull();
    expect(result.sequence).toHaveLength(9);
    expect(result.label).toContain('A2V');
  });

  it('preserves sequence length', () => {
    const seq = 'ATGATGATGATG';
    const result = inlineSubstitution(seq, 0, 'A');
    expect(result.sequence).toHaveLength(seq.length);
  });
});

describe('inlineDeletion', () => {
  it('removes codons from sequence', () => {
    const seq = 'ATGGCGAAA'; // 9 nt, 3 codons
    const result = inlineDeletion(seq, 1, 1); // delete AA at position 1
    expect(result.sequence).toHaveLength(6); // 2 codons left
    expect(result.deletedBp).toBe(3);
  });

  it('generates correct label for single deletion', () => {
    const result = inlineDeletion('ATGGCGAAA', 1, 1);
    expect(result.label).toContain('Δ');
  });

  it('generates range label for multi-AA deletion', () => {
    const result = inlineDeletion('ATGGCGAAATTT', 1, 2);
    expect(result.label).toContain('Δ2-3');
  });
});

describe('designInlineKLDPrimers', () => {
  it('designs forward and reverse primers around mutation site', () => {
    const seq = 'ATGATGATGATGATGATGATGATGATGATGATGATGATGATGATGATGATGATG'; // 54 nt
    const result = designInlineKLDPrimers(seq, 24, 55); // mutation at position 24
    expect(result.forward.sequence.length).toBeGreaterThan(15);
    expect(result.reverse.sequence.length).toBeGreaterThan(15);
    expect(result.forward.tm).toBeGreaterThan(40);
    expect(result.reverse.tm).toBeGreaterThan(40);
  });
});
