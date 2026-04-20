/**
 * K9 / V15 (Sprint 1.7) — mutationHitsAA uses numeric comparison, not
 * label substring.
 *
 * Before this fix, protein rendering checked `m.label?.includes(String(pos))`
 * which false-positives any AA whose number appears as substring in another
 * mutation's label (pos=26 matches "G26A", "R135A", "C403G", ...).
 */
import { describe, it, expect } from 'vitest';
import { mutationHitsAA } from '../components/FragmentEditor';

describe('K9/V15 — mutationHitsAA numeric comparison', () => {
  it('AA substitution at codonStart=75 hits AA pos 26 (not pos 3 or 7)', () => {
    const m = { type: 'substitution', codonStart: 75, label: 'G26A' };
    expect(mutationHitsAA(m, 26)).toBe(true);
    expect(mutationHitsAA(m, 25)).toBe(false);
    expect(mutationHitsAA(m, 27)).toBe(false);
    expect(mutationHitsAA(m, 3)).toBe(false);   // substring '26' was the bug
    expect(mutationHitsAA(m, 7)).toBe(false);
  });

  it('G26A does NOT hit AA 135 or 403 (the V15 false-positive set)', () => {
    const m = { type: 'substitution', codonStart: 75, label: 'G26A' };
    expect(mutationHitsAA(m, 135)).toBe(false);
    expect(mutationHitsAA(m, 403)).toBe(false);
  });

  it('nt substitution at position 100 hits AA 34 (codon 34 = nt 99..102)', () => {
    const m = { type: 'nt_substitution', codonStart: 100, position: 100, label: 'A101T' };
    expect(mutationHitsAA(m, 34)).toBe(true);
  });

  it('deletion of 6 bp starting at nt 300 hits AA 101 and 102', () => {
    const m = { type: 'nt_deletion', codonStart: 300, deletedBp: 6, label: 'Δ301-306' };
    expect(mutationHitsAA(m, 101)).toBe(true);
    expect(mutationHitsAA(m, 102)).toBe(true);
    expect(mutationHitsAA(m, 103)).toBe(false);
  });

  it('insertion with insertSequence of 9 bp at nt 30 hits AA 11, 12, 13', () => {
    const m = { type: 'nt_insertion', codonStart: 30, insertSequence: 'ATGATGATG', label: 'ins31+9п.н.' };
    expect(mutationHitsAA(m, 11)).toBe(true);
    expect(mutationHitsAA(m, 12)).toBe(true);
    expect(mutationHitsAA(m, 13)).toBe(true);
  });

  it('mutation with null/undefined codonStart and position returns false', () => {
    expect(mutationHitsAA({ label: 'G26A' }, 26)).toBe(false);
  });
});
