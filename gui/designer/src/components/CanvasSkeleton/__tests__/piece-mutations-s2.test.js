/**
 * piece-mutations-s2.test.js — SPEC_EDITABLE_ASSEMBLY_S2 §5.3 / §7.1.
 *
 * applyPieceMutations(seq, mutations) — the shared, pure overwrite of
 * position-by-position bases. Extracted byte-identically from
 * primer-derive.pieceSequence so the engine, draftFromZone and the
 * future single calculator all apply mutations the same way.
 */
import { describe, it, expect } from 'vitest';
import { applyPieceMutations } from '../lib/piece-mutations';

describe('applyPieceMutations', () => {
  it('returns the sequence unchanged with no mutations', () => {
    expect(applyPieceMutations('ATGC', [])).toBe('ATGC');
    expect(applyPieceMutations('ATGC', undefined)).toBe('ATGC');
    expect(applyPieceMutations('ATGC', null)).toBe('ATGC');
  });

  it('overwrites a single position', () => {
    expect(applyPieceMutations('ATGC', [{ position: 1, toBase: 'C' }])).toBe('ACGC');
  });

  it('uppercases the replacement base', () => {
    expect(applyPieceMutations('ATGC', [{ position: 0, toBase: 'g' }])).toBe('GTGC');
  });

  it('applies multiple mutations', () => {
    expect(applyPieceMutations('AAAA', [
      { position: 0, toBase: 'C' },
      { position: 3, toBase: 'G' },
    ])).toBe('CAAG');
  });

  it('ignores out-of-range / malformed mutations', () => {
    expect(applyPieceMutations('ATGC', [{ position: 9, toBase: 'C' }])).toBe('ATGC');
    expect(applyPieceMutations('ATGC', [{ position: -1, toBase: 'C' }])).toBe('ATGC');
    expect(applyPieceMutations('ATGC', [{ position: 1, toBase: 'CC' }])).toBe('ATGC');
    expect(applyPieceMutations('ATGC', [{ position: 1 }])).toBe('ATGC');
  });

  it('is safe on an empty sequence / non-string input', () => {
    expect(applyPieceMutations('', [{ position: 0, toBase: 'C' }])).toBe('');
    expect(applyPieceMutations(undefined, [{ position: 0, toBase: 'C' }])).toBe('');
  });
});
