/**
 * Tests for inline mutagenesis: substitution, deletion, codon selection.
 */
import { describe, it, expect } from 'vitest';
import {
  getCommonSubstitutions, chooseMutantCodon, inlineSubstitution, inlineDeletion,
  designInlineKLDPrimers, chooseStrategy, computeMutagenesisStrategy,
} from '../mutagenesis';

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

describe('chooseStrategy — V14 fragment context', () => {
  const mut = (pos) => ({ type: 'substitution', dnaPosition: pos, newCodon: 'GCG', label: `m${pos}` });

  // ── Default context (circular + standalone) — backwards compat ──

  it('defaults to circular+standalone: single mutation → kld (regression)', () => {
    expect(chooseStrategy([mut(300)])).toBe('kld');
  });

  it('defaults: two close mutations (<100bp) → kld (regression)', () => {
    expect(chooseStrategy([mut(300), mut(330)])).toBe('kld');
  });

  it('defaults: two distant mutations → two_fragment (regression)', () => {
    expect(chooseStrategy([mut(300), mut(1500)])).toBe('two_fragment');
  });

  it('defaults: three mutations → multi_fragment (regression)', () => {
    expect(chooseStrategy([mut(100), mut(500), mut(1500)])).toBe('multi_fragment');
  });

  // ── Linear topology → never KLD ──

  it('linear + single mutation → two_fragment (not kld — KLD needs circular)', () => {
    expect(chooseStrategy([mut(300)], { topology: 'linear', isStandalone: true })).toBe('two_fragment');
  });

  it('linear + two close mutations → two_fragment (not kld)', () => {
    expect(chooseStrategy([mut(300), mut(330)], { topology: 'linear', isStandalone: true })).toBe('two_fragment');
  });

  it('linear + three mutations → multi_fragment', () => {
    expect(chooseStrategy([mut(100), mut(500), mut(1500)], { topology: 'linear' })).toBe('multi_fragment');
  });

  // ── Circular but non-standalone (part of multi-fragment assembly) → never KLD ──

  it('circular + non-standalone + single mutation → two_fragment (not kld)', () => {
    expect(chooseStrategy([mut(300)], { topology: 'circular', isStandalone: false })).toBe('two_fragment');
  });

  it('circular + non-standalone + two close mutations → two_fragment', () => {
    expect(chooseStrategy([mut(300), mut(330)], { topology: 'circular', isStandalone: false })).toBe('two_fragment');
  });

  // ── Circular + standalone → KLD allowed (explicit) ──

  it('circular + standalone + single mutation → kld (explicit)', () => {
    expect(chooseStrategy([mut(300)], { topology: 'circular', isStandalone: true })).toBe('kld');
  });
});

describe('computeMutagenesisStrategy — fragmentContext propagation', () => {
  const templateSeq = 'ATG' + 'CCC'.repeat(999); // 3000 bp, divisible by 3
  const mutations = [{ type: 'substitution', dnaPosition: 300, newCodon: 'GCG', label: 'E100A' }];

  it('linear fragment context → strategy === two_fragment (not kld)', () => {
    const result = computeMutagenesisStrategy(templateSeq, mutations, {
      fragmentContext: { topology: 'linear', isStandalone: true, length: templateSeq.length },
    });
    expect(result.strategy).toBe('two_fragment');
    expect(result.fragments.length).toBeGreaterThan(1);
  });

  it('circular + non-standalone context → strategy === two_fragment (not kld)', () => {
    const result = computeMutagenesisStrategy(templateSeq, mutations, {
      fragmentContext: { topology: 'circular', isStandalone: false, length: templateSeq.length },
    });
    expect(result.strategy).toBe('two_fragment');
  });

  it('circular + standalone context → strategy === kld', () => {
    const result = computeMutagenesisStrategy(templateSeq, mutations, {
      fragmentContext: { topology: 'circular', isStandalone: true, length: templateSeq.length },
    });
    expect(result.strategy).toBe('kld');
  });

  it('no fragmentContext option → defaults to circular+standalone (backwards compat)', () => {
    const result = computeMutagenesisStrategy(templateSeq, mutations, {});
    expect(result.strategy).toBe('kld');
  });
});

describe('single-base substitution (одна буква, не кодон)', () => {
  const template = `ATG${'GCC'.repeat(300)}TAA`; // 906 bp; index 300 = 'G'

  it('1-nt замена не съедает соседние 2 базы (length preserved)', () => {
    const mut = { type: 'substitution', dnaPosition: 300, newCodon: 'T', label: 'G301T' };
    const result = computeMutagenesisStrategy(template, [mut]);
    expect(result.mutantSequence).toHaveLength(template.length);
    expect(result.mutantSequence[300]).toBe('T');
    expect(result.mutantSequence.slice(301, 303)).toBe(template.slice(301, 303));
    expect(result.strategy).toBe('kld');
  });

  it('KLD fwd праймер для 1-nt замены начинается с новой базы + следующий nt (не пропускает 2)', () => {
    const mut = { type: 'substitution', dnaPosition: 300, newCodon: 'T', label: 'G301T' };
    const result = computeMutagenesisStrategy(template, [mut]);
    const fwd = result.primers.find((p) => p.direction === 'forward');
    expect(fwd.sequence[0]).toBe('T');
    expect(fwd.sequence[1]).toBe(template[301]);
  });

  it('codon-замена (newCodon length 3) — регрессия, поведение не изменилось', () => {
    const mut = { type: 'substitution', dnaPosition: 300, newCodon: 'GAT', label: 'A101D' };
    const result = computeMutagenesisStrategy(template, [mut]);
    expect(result.mutantSequence).toHaveLength(template.length);
    expect(result.mutantSequence.slice(300, 303)).toBe('GAT');
  });
});

describe('V11: KLD primers carry computed Tm and GC%, not placeholder zeros', () => {
  it('substitution KLD primers report realistic Tm and GC%', () => {
    const template = 'ATG' + 'GCC'.repeat(300) + 'TAA';
    const mut = { type: 'substitution', dnaPosition: 300, newCodon: 'GCG', label: 'A100A' };
    const result = computeMutagenesisStrategy(template, [mut]);
    expect(result.strategy).toBe('kld');
    expect(result.primers).toHaveLength(2);
    for (const p of result.primers) {
      expect(p.tmBinding).toBeGreaterThan(40);
      expect(p.tmBinding).toBeLessThan(90);
      expect(p.tmFull).toBe(p.tmBinding); // KLD has no tail → full == binding
      expect(p.gcPercent).toBeGreaterThan(0);
      expect(p.gcPercent).toBeLessThanOrEqual(100);
    }
  });

  it('insertion KLD primers report non-zero Tm/GC', () => {
    const template = 'ATG' + 'GCC'.repeat(100) + 'TAA';
    const mut = { type: 'insertion', dnaPosition: 150, insertSequence: 'CATCATCAT', label: 'ins50' };
    const result = computeMutagenesisStrategy(template, [mut]);
    expect(result.strategy).toBe('kld');
    for (const p of result.primers) {
      expect(p.tmBinding).toBeGreaterThan(0);
      expect(p.gcPercent).toBeGreaterThan(0);
    }
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

describe('forceStrategy — expert mechanism swap (Кирпич 4)', () => {
  const big = `ATG${'CCC'.repeat(999)}`; // 3000 bp
  const mut = [{ type: 'substitution', dnaPosition: 300, newCodon: 'GCG' }];

  it('forces overlap (two_fragment) on a circular standalone where auto would be KLD', () => {
    const r = computeMutagenesisStrategy(big, mut, {
      fragmentContext: { topology: 'circular', isStandalone: true, length: 3000 },
      forceStrategy: 'two_fragment',
    });
    expect(r.strategy).toBe('two_fragment');
  });

  it('forcing KLD on a linear template is invalid → falls back to auto (two_fragment)', () => {
    const r = computeMutagenesisStrategy(big, mut, {
      fragmentContext: { topology: 'linear', isStandalone: true, length: 3000 },
      forceStrategy: 'kld',
    });
    expect(r.strategy).toBe('two_fragment');
  });

  it('no forceStrategy → auto (kld on circular standalone)', () => {
    const r = computeMutagenesisStrategy(big, mut, {
      fragmentContext: { topology: 'circular', isStandalone: true, length: 3000 },
    });
    expect(r.strategy).toBe('kld');
  });
});
