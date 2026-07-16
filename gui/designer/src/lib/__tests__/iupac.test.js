/**
 * iupac — the degenerate-base engine (P1.5). A single source for IUPAC bit masks,
 * compatibility, complement and reverse-complement, so the sequence search can
 * treat `aa:` / `seq:` queries with N/R/Y… as «compatibility» (not identity) and
 * the buggy truncated {A,T,G,C,N} revcomp is retired.
 *
 * Bit convention: A=1, C=2, G=4, T=8 (U≡T). Ambiguity = OR of the members.
 */
import { describe, it, expect } from 'vitest';
import {
  iupacBits, iupacMatch, normalizeBase, normalizeSeq,
  iupacComplement, reverseComplementIupac, isDegenerate, degeneracy,
} from '../iupac';

describe('iupacBits', () => {
  it('assigns the canonical single-base bits (U≡T)', () => {
    expect(iupacBits('A')).toBe(1);
    expect(iupacBits('C')).toBe(2);
    expect(iupacBits('G')).toBe(4);
    expect(iupacBits('T')).toBe(8);
    expect(iupacBits('U')).toBe(8);
    expect(iupacBits('u')).toBe(8); // case-insensitive
  });
  it('assigns OR masks to the ambiguity codes', () => {
    expect(iupacBits('R')).toBe(1 | 4); // A|G = 5
    expect(iupacBits('Y')).toBe(2 | 8); // C|T = 10
    expect(iupacBits('S')).toBe(2 | 4); // C|G = 6
    expect(iupacBits('W')).toBe(1 | 8); // A|T = 9
    expect(iupacBits('N')).toBe(15);
    expect(iupacBits('B')).toBe(2 | 4 | 8); // not-A = 14
  });
  it('returns 0 for gaps / junk', () => {
    expect(iupacBits('-')).toBe(0);
    expect(iupacBits('')).toBe(0);
    expect(iupacBits('Z')).toBe(0);
  });
});

describe('iupacMatch — compatibility (shared concrete base)', () => {
  it('exact bases', () => {
    expect(iupacMatch('A', 'A')).toBe(true);
    expect(iupacMatch('A', 'C')).toBe(false);
  });
  it('an ambiguity matches any member', () => {
    expect(iupacMatch('R', 'A')).toBe(true); // R = A|G
    expect(iupacMatch('R', 'G')).toBe(true);
    expect(iupacMatch('R', 'C')).toBe(false);
    expect(iupacMatch('N', 'A')).toBe(true);
    expect(iupacMatch('A', 'N')).toBe(true); // symmetric
  });
  it('two ambiguities match iff their masks overlap', () => {
    expect(iupacMatch('R', 'Y')).toBe(false); // A|G vs C|T → disjoint
    expect(iupacMatch('R', 'S')).toBe(true); //  A|G vs C|G → share G
  });
  it('U is treated as T', () => {
    expect(iupacMatch('U', 'T')).toBe(true);
    expect(iupacMatch('U', 'A')).toBe(false);
  });
  it('a gap never matches', () => {
    expect(iupacMatch('-', 'A')).toBe(false);
    expect(iupacMatch('N', '-')).toBe(false);
  });
});

describe('normalizeBase / normalizeSeq', () => {
  it('uppercases and maps U→T', () => {
    expect(normalizeBase('u')).toBe('T');
    expect(normalizeBase('a')).toBe('A');
    expect(normalizeSeq('auGc')).toBe('ATGC');
  });
});

describe('iupacComplement — full IUPAC, U→A', () => {
  it('canonical pairs', () => {
    expect(iupacComplement('A')).toBe('T');
    expect(iupacComplement('T')).toBe('A');
    expect(iupacComplement('G')).toBe('C');
    expect(iupacComplement('C')).toBe('G');
    expect(iupacComplement('R')).toBe('Y');
    expect(iupacComplement('Y')).toBe('R');
    expect(iupacComplement('S')).toBe('S'); // self
    expect(iupacComplement('W')).toBe('W'); // self
    expect(iupacComplement('K')).toBe('M');
    expect(iupacComplement('B')).toBe('V');
    expect(iupacComplement('N')).toBe('N');
  });
  it('uracil complements to adenine', () => {
    expect(iupacComplement('U')).toBe('A');
  });
});

describe('reverseComplementIupac — fixes the truncated map', () => {
  it('plain DNA', () => {
    expect(reverseComplementIupac('ATGC')).toBe('GCAT');
  });
  it('preserves IUPAC codes (was silently → N in the old map)', () => {
    expect(reverseComplementIupac('RYSWKM')).toBe('KMWSRY');
    //  R Y S W K M  →comp→ Y R S W M K  →reverse→ K M W S R Y
  });
  it('normalizes RNA input (U→T) before complementing', () => {
    expect(reverseComplementIupac('AUGC')).toBe('GCAT');
  });
  it('is an involution over the full IUPAC alphabet', () => {
    const s = 'ATGCNRYSWKMBDHV';
    expect(reverseComplementIupac(reverseComplementIupac(s))).toBe(s);
  });
  it('empty / falsy', () => {
    expect(reverseComplementIupac('')).toBe('');
    expect(reverseComplementIupac(null)).toBe('');
  });
});

describe('isDegenerate / degeneracy', () => {
  it('a concrete base is not degenerate; an ambiguity is', () => {
    expect(isDegenerate('A')).toBe(false);
    expect(isDegenerate('R')).toBe(true);
    expect(isDegenerate('N')).toBe(true);
  });
  it('degeneracy = product of per-base member counts', () => {
    expect(degeneracy('ATGC')).toBe(1);
    expect(degeneracy('N')).toBe(4);
    expect(degeneracy('RY')).toBe(4); // 2 * 2
    expect(degeneracy('')).toBe(1); // neutral
  });
});
