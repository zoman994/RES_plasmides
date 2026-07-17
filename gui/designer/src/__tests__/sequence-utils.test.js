import { describe, it, expect } from 'vitest';
import {
  sanitizeSequence,
  isValidDNA,
  hasInvalidChars,
  complement,
  reverseComplement,
  IUPAC_DNA_REGEX,
  IUPAC_DNA_CHAR_REGEX,
} from '../sequence-utils';

describe('sanitizeSequence', () => {
  it('strips BOM', () => {
    expect(sanitizeSequence('\uFEFFATGC')).toBe('ATGC');
  });

  it('strips null bytes', () => {
    expect(sanitizeSequence('AT\0GC')).toBe('ATGC');
  });

  it('strips whitespace (spaces, newlines, tabs)', () => {
    expect(sanitizeSequence('ATG\nGC  \tC')).toBe('ATGGCC');
  });

  it('strips digits from GenBank numbered format', () => {
    expect(sanitizeSequence('1 atgc 4')).toBe('ATGC');
  });

  it('uppercases lowercase input', () => {
    expect(sanitizeSequence('atgc')).toBe('ATGC');
  });

  it('preserves canonical IUPAC codes in canonical order', () => {
    expect(sanitizeSequence('ATGCNRYSWKMBDHV')).toBe('ATGCNRYSWKMBDHV');
  });

  it('preserves IUPAC codes regardless of input order', () => {
    // Was broken in SequenceEditor which used ATGCNRYWSMKHBVD order
    expect(sanitizeSequence('RYSWKMBDHV')).toBe('RYSWKMBDHV');
  });

  it('removes non-IUPAC letters (U for RNA, X, Z)', () => {
    expect(sanitizeSequence('ATGCU')).toBe('ATGC');
    expect(sanitizeSequence('ATGCXZ')).toBe('ATGC');
  });

  it('returns empty string for falsy input', () => {
    expect(sanitizeSequence('')).toBe('');
    expect(sanitizeSequence(null)).toBe('');
    expect(sanitizeSequence(undefined)).toBe('');
  });

  it('returns empty string for non-string input', () => {
    expect(sanitizeSequence(42)).toBe('');
    expect(sanitizeSequence({})).toBe('');
    expect(sanitizeSequence([])).toBe('');
  });

  it('handles a real GenBank sequence block', () => {
    const raw = `
        1 atgcatgcat gcatgcatgc atgcatgcat gcatgcatgc atgcatgcat gcatgcatgc
       61 atgcatgcat gcatgcatgc`;
    // Line 1: 60 nt (6×10), Line 2: 20 nt (2×10) → 80 nt total
    expect(sanitizeSequence(raw)).toBe('ATGC'.repeat(20));
  });

  it('strips the ∅ empty-set symbol (P2 regression)', () => {
    expect(sanitizeSequence('∅GAATTCCC')).toBe('GAATTCCC');
  });

  it('preserves IUPAC that a legacy strict [^ATGCN] sanitizer would have dropped', () => {
    // P-wizard-iupac: wizard used to strip R/Y/S/W/K/M/B/D/H/V — this test guards the fix
    expect(sanitizeSequence('ATGCRYSWKMBDHV')).toBe('ATGCRYSWKMBDHV');
  });
});

describe('isValidDNA', () => {
  it('true for clean DNA', () => {
    expect(isValidDNA('ATGC')).toBe(true);
    expect(isValidDNA('ATGCN')).toBe(true);
    expect(isValidDNA('atgc')).toBe(true);
  });

  it('true for full IUPAC alphabet', () => {
    expect(isValidDNA('ATGCNRYSWKMBDHV')).toBe(true);
  });

  it('false for dirty DNA', () => {
    expect(isValidDNA('ATG\nC')).toBe(false);
    expect(isValidDNA('ATGXYZ')).toBe(false);
    expect(isValidDNA('')).toBe(false);
    expect(isValidDNA(null)).toBe(false);
  });
});

describe('hasInvalidChars', () => {
  it('detects non-IUPAC chars', () => {
    const result = hasInvalidChars('ATG\0XC');
    expect(result.hasInvalid).toBe(true);
    expect(result.invalidChars).toContain('\0');
    expect(result.invalidChars).toContain('X');
  });

  it('clean sequence has no invalid chars', () => {
    const result = hasInvalidChars('ATGCN');
    expect(result.hasInvalid).toBe(false);
    expect(result.invalidChars).toHaveLength(0);
  });

  it('whitespace is not counted as invalid (it is stripped, not illegal)', () => {
    const result = hasInvalidChars('ATG CG');
    expect(result.hasInvalid).toBe(false);
  });

  it('handles null/empty gracefully', () => {
    expect(hasInvalidChars('').hasInvalid).toBe(false);
    expect(hasInvalidChars(null).hasInvalid).toBe(false);
  });
});

describe('IUPAC_DNA_REGEX / IUPAC_DNA_CHAR_REGEX exports', () => {
  it('IUPAC_DNA_REGEX matches characters to strip (non-DNA, non-IUPAC)', () => {
    // Note: Y is a valid IUPAC code (pyrimidine) — only \0, X, Z get stripped
    expect('ATG\0XYZ'.replace(IUPAC_DNA_REGEX, '')).toBe('ATGY');
    expect('ATG\0XQZ'.replace(IUPAC_DNA_REGEX, '')).toBe('ATG');
  });

  it('IUPAC_DNA_REGEX preserves all 15 canonical IUPAC codes case-insensitively', () => {
    expect('ATGCNRYSWKMBDHVatgcnryswkmbdhv'.replace(IUPAC_DNA_REGEX, ''))
      .toBe('ATGCNRYSWKMBDHVatgcnryswkmbdhv');
  });

  it('IUPAC_DNA_CHAR_REGEX tests a single valid DNA char (true)', () => {
    expect(IUPAC_DNA_CHAR_REGEX.test('A')).toBe(true);
    expect(IUPAC_DNA_CHAR_REGEX.test('R')).toBe(true);
    expect(IUPAC_DNA_CHAR_REGEX.test('v')).toBe(true);
  });

  it('IUPAC_DNA_CHAR_REGEX false for non-DNA char', () => {
    expect(IUPAC_DNA_CHAR_REGEX.test('X')).toBe(false);
    expect(IUPAC_DNA_CHAR_REGEX.test(' ')).toBe(false);
    expect(IUPAC_DNA_CHAR_REGEX.test('1')).toBe(false);
  });

  it('regex and sanitizeSequence stay in sync (anti-drift)', () => {
    const raw = 'ATG\0XR YZ\n1';
    const viaRegex = raw.toUpperCase().replace(IUPAC_DNA_REGEX, '');
    const viaFn = sanitizeSequence(raw);
    expect(viaFn).toBe(viaRegex);
  });
});

describe('existing functions unchanged', () => {
  it('complement works', () => {
    expect(complement('A')).toBe('T');
    expect(complement('T')).toBe('A');
    expect(complement('G')).toBe('C');
    expect(complement('C')).toBe('G');
    expect(complement('N')).toBe('N');
  });

  it('reverseComplement works', () => {
    expect(reverseComplement('ATGC')).toBe('GCAT');
  });

  it('complement supports the full IUPAC table (V118 fix)', () => {
    // COMPLEMENT_MAP now complements R/Y/S/W/K/M/B/D/H/V per IUPAC
    // (was → N; sanitizeSequence preserves these codes on entry).
    expect(complement('R')).toBe('Y');
    expect(complement('Y')).toBe('R');
    expect(complement('S')).toBe('S');
    expect(complement('W')).toBe('W');
    expect(complement('K')).toBe('M');
    expect(complement('B')).toBe('V');
    expect(complement('N')).toBe('N');
  });
});
