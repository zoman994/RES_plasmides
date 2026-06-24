/**
 * paste-op.test.js — clipboard paste → sequence-edit op (Игорь «вставка
 * последовательности не работает»).
 */
import { describe, it, expect } from 'vitest';
import { buildSequencePasteOp, sanitizePastedBases } from '../paste-op';

describe('sanitizePastedBases', () => {
  it('strips whitespace + non-base chars, upper-cases', () => {
    expect(sanitizePastedBases('  atg c\nTT ')).toBe('ATGCTT');
    expect(sanitizePastedBases('ATG12 3!!.C')).toBe('ATGC'); // digits/punct dropped (note: Y/R/etc. are IUPAC, kept)
  });
  it('keeps IUPAC degenerate codes', () => {
    expect(sanitizePastedBases('acgtryswkmbdhvn')).toBe('ACGTRYSWKMBDHVN');
  });
  it('returns empty string for junk / non-string', () => {
    expect(sanitizePastedBases('12 34 !!')).toBe('');
    expect(sanitizePastedBases(null)).toBe('');
  });
});

describe('buildSequencePasteOp', () => {
  it('caret only → insert (replace [pos,pos)) at the caret', () => {
    const op = buildSequencePasteOp('atgc', 5, 5);
    expect(op).toEqual({ kind: 'replace', start: 5, end: 5, replacement: 'ATGC' });
  });

  it('selection [a,b) → replace that range (order-independent)', () => {
    expect(buildSequencePasteOp('gg', 3, 9)).toEqual({ kind: 'replace', start: 3, end: 9, replacement: 'GG' });
    expect(buildSequencePasteOp('gg', 9, 3)).toEqual({ kind: 'replace', start: 3, end: 9, replacement: 'GG' });
  });

  it('null caret → insert at 0', () => {
    expect(buildSequencePasteOp('AAA', null, null)).toEqual({ kind: 'replace', start: 0, end: 0, replacement: 'AAA' });
  });

  it('only one of anchor/pos set → caret insert at that position', () => {
    expect(buildSequencePasteOp('A', null, 7)).toEqual({ kind: 'replace', start: 7, end: 7, replacement: 'A' });
  });

  it('nothing pasteable → null (no op)', () => {
    expect(buildSequencePasteOp('!!! 123', 2, 2)).toBeNull();
    expect(buildSequencePasteOp('', 0, 0)).toBeNull();
  });
});
