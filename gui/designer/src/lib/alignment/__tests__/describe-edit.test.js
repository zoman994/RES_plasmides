import { describe, it, expect } from 'vitest';
import { enrichEditDescriptor, formatCorrection, mergeCorrection } from '../describe-edit';

describe('enrichEditDescriptor — capture the ORIGINAL bases an op touches', () => {
  it('replace: records the «from» slice read from the pre-edit sequence', () => {
    const d = enrichEditDescriptor({ kind: 'replace', start: 2, end: 5, replacement: 'A' }, 'ACGTACGT');
    expect(d).toMatchObject({ kind: 'replace', start: 2, end: 5, replacement: 'A', from: 'GTA' });
  });

  it('single-base replace: from is the one original base', () => {
    const d = enrichEditDescriptor({ kind: 'replace', start: 65, end: 66, replacement: 'A' }, 'G'.padStart(66, 'C'));
    expect(d.from).toBe('G'); // index 65 of 'CCC…CG'
  });

  it('delete: records the «removed» slice', () => {
    const d = enrichEditDescriptor({ kind: 'delete', pos: 1, length: 2 }, 'ACGT');
    expect(d).toMatchObject({ kind: 'delete', pos: 1, length: 2, removed: 'CG' });
  });

  it('insert: passes through (no «from» to capture)', () => {
    const d = enrichEditDescriptor({ kind: 'insert', pos: 1, char: 'A' }, 'CGT');
    expect(d).toMatchObject({ kind: 'insert', pos: 1, char: 'A' });
    expect(d.from).toBeUndefined();
  });
});

describe('formatCorrection — one human line, shows «было → стало»', () => {
  it('accept-base substitution {pos,from,to} reads «поз N: from → to»', () => {
    const s = formatCorrection({ pos: 65, from: 'G', to: 'A' });
    expect(s).toContain('поз 66');
    expect(s).toContain('G → A');
  });

  it('single-base replace with from: «поз N: from → repl» (no «N–N» range)', () => {
    const s = formatCorrection({ kind: 'replace', start: 65, end: 66, from: 'G', replacement: 'A' });
    expect(s).toContain('поз 66');
    expect(s).toContain('G → A');
    expect(s).not.toContain('66–66');
  });

  it('multi-base replace with from: shows both ends of the change', () => {
    const s = formatCorrection({ kind: 'replace', start: 2, end: 5, from: 'GTA', replacement: 'AC' });
    expect(s).toContain('поз 3–5');
    expect(s).toContain('GTA → AC');
  });

  it('replace WITHOUT from (committed directly) still renders the target', () => {
    const s = formatCorrection({ kind: 'replace', start: 4, end: 8, replacement: 'TTTT' });
    expect(s).toContain('5–8');
    expect(s).toContain('TTTT');
  });

  it('delete shows the removed bases', () => {
    const s = formatCorrection({ kind: 'delete', pos: 5, length: 3, removed: 'ACG' });
    expect(s).toContain('поз 6');
    expect(s).toContain('ACG');
  });

  it('insert shows the inserted base', () => {
    const s = formatCorrection({ kind: 'insert', pos: 5, char: 'T' });
    expect(s).toContain('поз 6');
    expect(s).toContain('T');
  });

  it('multi-base insert (coalesced run) shows a range + the whole text', () => {
    const s = formatCorrection({ kind: 'insert', pos: 4, text: 'AAAA' });
    expect(s).toContain('поз 5–8');
    expect(s).toContain('AAAA');
  });

  it('multi-base delete (coalesced run) shows a range + the removed bases', () => {
    const s = formatCorrection({ kind: 'delete', pos: 4, length: 4, removed: 'ACGT' });
    expect(s).toContain('поз 5–8');
    expect(s).toContain('ACGT');
  });
});

describe('mergeCorrection — coalesce a contiguous typing/deletion run into ONE record', () => {
  it('extends a run of single-base inserts at adjacent positions', () => {
    let acc = [];
    acc = mergeCorrection(acc, { kind: 'insert', pos: 5, char: 'A' });
    acc = mergeCorrection(acc, { kind: 'insert', pos: 6, char: 'C' });
    acc = mergeCorrection(acc, { kind: 'insert', pos: 7, char: 'G' });
    expect(acc).toEqual([{ kind: 'insert', pos: 5, text: 'ACG' }]);
  });

  it('does NOT merge inserts when the caret jumps (non-contiguous)', () => {
    let acc = [];
    acc = mergeCorrection(acc, { kind: 'insert', pos: 5, char: 'A' });
    acc = mergeCorrection(acc, { kind: 'insert', pos: 20, char: 'T' });
    expect(acc).toHaveLength(2);
  });

  it('folds a leading replace + the following insert-run into ONE «было → стало» (Игорь screen)', () => {
    let acc = [];
    // «selected TG, typed aaaaa»: replace TG→a, then 4 contiguous inserts.
    acc = mergeCorrection(acc, { kind: 'replace', start: 221, end: 223, from: 'TG', replacement: 'a' });
    acc = mergeCorrection(acc, { kind: 'insert', pos: 222, char: 'a' });
    acc = mergeCorrection(acc, { kind: 'insert', pos: 223, char: 'a' });
    acc = mergeCorrection(acc, { kind: 'insert', pos: 224, char: 'a' });
    acc = mergeCorrection(acc, { kind: 'insert', pos: 225, char: 'a' });
    expect(acc).toHaveLength(1);
    expect(acc[0]).toMatchObject({ kind: 'replace', start: 221, end: 223, from: 'TG', replacement: 'aaaaa' });
    expect(formatCorrection(acc[0])).toContain('TG → aaaaa');
  });

  it('grows a backspace run leftwards', () => {
    let acc = [];
    acc = mergeCorrection(acc, { kind: 'delete', pos: 10, length: 1, removed: 'G' });
    acc = mergeCorrection(acc, { kind: 'delete', pos: 9, length: 1, removed: 'C' });
    acc = mergeCorrection(acc, { kind: 'delete', pos: 8, length: 1, removed: 'A' });
    expect(acc).toEqual([{ kind: 'delete', pos: 8, length: 3, removed: 'ACG' }]);
  });

  it('grows a forward-delete run rightwards', () => {
    let acc = [];
    acc = mergeCorrection(acc, { kind: 'delete', pos: 5, length: 1, removed: 'A' });
    acc = mergeCorrection(acc, { kind: 'delete', pos: 5, length: 1, removed: 'C' });
    expect(acc).toEqual([{ kind: 'delete', pos: 5, length: 2, removed: 'AC' }]);
  });

  it('backspace shrinks a just-typed run instead of adding a delete record', () => {
    let acc = [];
    acc = mergeCorrection(acc, { kind: 'insert', pos: 5, char: 'A' });
    acc = mergeCorrection(acc, { kind: 'insert', pos: 6, char: 'B' });
    acc = mergeCorrection(acc, { kind: 'delete', pos: 6, length: 1, removed: 'B' }); // erase 'B'
    expect(acc).toEqual([{ kind: 'insert', pos: 5, text: 'A' }]);
    acc = mergeCorrection(acc, { kind: 'delete', pos: 5, length: 1, removed: 'A' }); // erase 'A' → run gone
    expect(acc).toEqual([]);
  });

  it('accept-base substitutions stay per-position (discrete clicks, never merge)', () => {
    let acc = [];
    acc = mergeCorrection(acc, { pos: 5, from: 'A', to: 'C' });
    acc = mergeCorrection(acc, { pos: 6, from: 'G', to: 'T' });
    expect(acc).toEqual([{ pos: 5, from: 'A', to: 'C' }, { pos: 6, from: 'G', to: 'T' }]);
  });
});

describe('formatCorrection / mergeCorrection — origin rotation', () => {
  it('formats an origin correction as «смена начала отсчёта → поз N»', () => {
    expect(formatCorrection({ kind: 'origin', position: 432 })).toBe('смена начала отсчёта → поз 432');
  });

  it('mergeCorrection appends an origin descriptor untouched (no run-merging)', () => {
    const acc = mergeCorrection([], { kind: 'origin', position: 100 });
    expect(acc).toEqual([{ kind: 'origin', position: 100 }]);
  });
});
