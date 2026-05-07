/**
 * library-sequence-edit.test.js — M-X.6 K2 unit coverage for the
 * pure helper (DEC-MX6-02). Indel-aware annotation shift across
 * insert / delete / replace ops.
 */
import { describe, it, expect } from 'vitest';
import { applySequenceEditToEntry } from '../library-sequence-edit';

const mkEntry = (sequence, annotations = []) => ({
  payload: { sequence, length: sequence.length, annotations, topology: 'linear', ends: null },
});

describe('applySequenceEditToEntry — insert', () => {
  it('inserts a single char and shifts annotations after the insertion', () => {
    const entry = mkEntry('ACGT', [{ id: 'a', start: 2, end: 4 }]);
    const result = applySequenceEditToEntry(entry, { kind: 'insert', pos: 1, char: 'N' });
    expect(result.ok).toBe(true);
    expect(result.sequence).toBe('ANCGT');
    expect(result.length).toBe(5);
    expect(result.annotations[0]).toMatchObject({ start: 3, end: 5 });
    expect(result.caretAfter).toBe(2);
  });

  it('inserts INSIDE annotation extends end', () => {
    const entry = mkEntry('ACGTAC', [{ id: 'a', start: 0, end: 5 }]);
    const result = applySequenceEditToEntry(entry, { kind: 'insert', pos: 3, char: 'X' });
    expect(result.ok).toBe(true);
    expect(result.sequence).toBe('ACGXTAC');
    expect(result.annotations[0]).toMatchObject({ start: 0, end: 6 });
  });

  it('insert AT annotation start shifts both bounds', () => {
    const entry = mkEntry('ACGT', [{ id: 'a', start: 1, end: 3 }]);
    const result = applySequenceEditToEntry(entry, { kind: 'insert', pos: 1, char: 'N' });
    expect(result.annotations[0]).toMatchObject({ start: 2, end: 4 });
  });
});

describe('applySequenceEditToEntry — delete', () => {
  it('deletes one char and shifts trailing annotations', () => {
    const entry = mkEntry('ACGTAC', [{ id: 'a', start: 4, end: 6 }]);
    const result = applySequenceEditToEntry(entry, { kind: 'delete', pos: 2, length: 1 });
    expect(result.ok).toBe(true);
    expect(result.sequence).toBe('ACTAC');
    expect(result.annotations[0]).toMatchObject({ start: 3, end: 5 });
    expect(result.caretAfter).toBe(2);
  });

  it('drops annotations fully inside the delete range', () => {
    const entry = mkEntry('ACGTACGT', [{ id: 'a', start: 2, end: 4 }, { id: 'b', start: 5, end: 7 }]);
    const result = applySequenceEditToEntry(entry, { kind: 'delete', pos: 1, length: 5 });
    expect(result.ok).toBe(true);
    expect(result.sequence).toBe('AGT');
    // 'a' fully inside [1, 6) → drop. 'b' partial overlap → clip.
    const ids = result.annotations.map((a) => a.id);
    expect(ids).not.toContain('a');
    expect(ids).toContain('b');
  });

  it('clips annotation right edge when delete starts inside it', () => {
    const entry = mkEntry('ACGTACGT', [{ id: 'a', start: 0, end: 5 }]);
    const result = applySequenceEditToEntry(entry, { kind: 'delete', pos: 3, length: 3 });
    expect(result.ok).toBe(true);
    expect(result.sequence).toBe('ACGGT');
    expect(result.annotations[0]).toMatchObject({ id: 'a', start: 0, end: 3 });
  });
});

describe('applySequenceEditToEntry — replace', () => {
  it('replaces selection with a single char (caret advances by 1)', () => {
    const entry = mkEntry('ACGT', [{ id: 'a', start: 2, end: 4 }]);
    const result = applySequenceEditToEntry(entry, { kind: 'replace', start: 1, end: 3, replacement: 'N' });
    expect(result.ok).toBe(true);
    expect(result.sequence).toBe('ANT');
    expect(result.caretAfter).toBe(2);
  });

  it('replace with empty replacement is equivalent to delete', () => {
    // 'ACGTAC' minus [1,3) ('CG') = 'A' + 'TAC' = 'ATAC'.
    const entry = mkEntry('ACGTAC', [{ id: 'a', start: 4, end: 6 }]);
    const result = applySequenceEditToEntry(entry, { kind: 'replace', start: 1, end: 3, replacement: '' });
    expect(result.ok).toBe(true);
    expect(result.sequence).toBe('ATAC');
    expect(result.annotations[0]).toMatchObject({ id: 'a', start: 2, end: 4 });
  });

  it('keeps length consistency after replace', () => {
    const entry = mkEntry('ACGTACGT', []);
    const result = applySequenceEditToEntry(entry, { kind: 'replace', start: 2, end: 5, replacement: 'XX' });
    expect(result.length).toBe(result.sequence.length);
    expect(result.length).toBe(7);
  });
});

describe('applySequenceEditToEntry — invalid args', () => {
  it('returns ok=false on unknown kind', () => {
    const entry = mkEntry('ACGT');
    const result = applySequenceEditToEntry(entry, { kind: 'wat', pos: 0 });
    expect(result.ok).toBe(false);
  });

  it('rejects out-of-range insert pos', () => {
    const entry = mkEntry('ACGT');
    const result = applySequenceEditToEntry(entry, { kind: 'insert', pos: 99, char: 'A' });
    expect(result.ok).toBe(false);
  });
});
