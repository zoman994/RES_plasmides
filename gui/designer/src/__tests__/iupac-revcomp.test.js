/**
 * V118 — sequence-utils reverseComplement must complement IUPAC ambiguity codes
 *        (was → N), since sanitizeSequence preserves them on entry.
 *
 * NOTE on V119 (RETRACTED): restriction-db.js has its OWN local reverseComplement
 * (with a full IUPAC table), so findSitesInSequence already skips degenerate
 * palindromes correctly and does NOT double-count. The findSitesInSequence block
 * below is a regression guard for that existing-correct behaviour, not a fix.
 */
import { describe, it, expect } from 'vitest';
import { reverseComplement } from '../sequence-utils';
import { findSitesInSequence } from '../restriction-db';

describe('reverseComplement — IUPAC ambiguity codes (V118)', () => {
  it('complements degenerate codes per IUPAC, not to N', () => {
    expect(reverseComplement('R')).toBe('Y'); // A/G ↔ C/T
    expect(reverseComplement('Y')).toBe('R');
    expect(reverseComplement('K')).toBe('M'); // G/T ↔ A/C
    expect(reverseComplement('M')).toBe('K');
    expect(reverseComplement('B')).toBe('V'); // C/G/T ↔ A/C/G
    expect(reverseComplement('V')).toBe('B');
    expect(reverseComplement('D')).toBe('H'); // A/G/T ↔ A/C/T
    expect(reverseComplement('H')).toBe('D');
    expect(reverseComplement('S')).toBe('S'); // self-complementary
    expect(reverseComplement('W')).toBe('W');
    expect(reverseComplement('N')).toBe('N');
  });

  it('degenerate-palindrome sites are their own reverse complement', () => {
    expect(reverseComplement('GTYRAC')).toBe('GTYRAC'); // HincII
    expect(reverseComplement('CCWWGG')).toBe('CCWWGG'); // StyI
    expect(reverseComplement('RGGWCCY')).toBe('RGGWCCY'); // PpuMI
  });

  it('plain ACGT/N unchanged (no regression)', () => {
    expect(reverseComplement('ATGC')).toBe('GCAT');
    expect(reverseComplement('ATNG')).toBe('CNAT');
  });
});

describe('findSitesInSequence — degenerate palindromes not double-counted (regression guard)', () => {
  it('HincII (GTYRAC) with one real site → exactly 1 hit', () => {
    // GTCAAC matches GTYRAC (Y=C, R=A); flanks have no GT..AC.
    const sites = findSitesInSequence('HincII', 'AAAAAAGTCAACAAAAAA');
    expect(sites).toHaveLength(1);
    expect(sites[0].position).toBe(6);
  });

  it('StyI (CCWWGG) with one real site → exactly 1 hit', () => {
    // CCAAGG matches CCWWGG (W=A, W=A).
    const sites = findSitesInSequence('StyI', 'TTTTTTCCAAGGTTTTTT');
    expect(sites).toHaveLength(1);
  });
});
