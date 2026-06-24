import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../index';

function seedEntry(id, over = {}) {
  useStore.setState((s) => {
    s.libraryEntries[id] = {
      id, name: 'pX', kind: 'container', version: 1, _pendingDelete: false, addedAt: '2026',
      origin: { kind: 'manual_edit', parentEntryId: 'p0' },
      payload: { sequence: 'ACGTACGT', topology: 'circular', annotations: [] },
      ...over,
    };
  });
}

beforeEach(() => {
  useStore.setState((s) => { s.libraryEntries = {}; s.libraryEditLog = {}; s.libraryUndo = {}; });
});

describe('Library edit log — «что изменено» via the aligner provenance engine', () => {
  it('applySequenceEditOnLibraryEntry accumulates a coalesced change log', async () => {
    seedEntry('e1');
    await useStore.getState().applySequenceEditOnLibraryEntry('e1', { kind: 'insert', pos: 4, char: 'A' });
    await useStore.getState().applySequenceEditOnLibraryEntry('e1', { kind: 'insert', pos: 5, char: 'A' });
    const log = useStore.getState().libraryEditLog.e1;
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ kind: 'insert', pos: 4, text: 'AA' });
  });

  it('a replace edit records «from» so the summary reads было → стало', async () => {
    seedEntry('e2');
    await useStore.getState().applySequenceEditOnLibraryEntry('e2', { kind: 'replace', start: 0, end: 1, replacement: 'T' });
    expect(useStore.getState().libraryEditLog.e2[0]).toMatchObject({ kind: 'replace', from: 'A', replacement: 'T' });
  });

  it('overwrite stamps provenance (changes + reason), bumps version, clears the log', async () => {
    seedEntry('e3');
    await useStore.getState().applySequenceEditOnLibraryEntry('e3', { kind: 'replace', start: 0, end: 1, replacement: 'T' });
    const res = await useStore.getState().overwriteLibraryEntryAnnotations('e3', [], { changes: 'замена 1: A→T', reason: 'фикс' });
    expect(res.ok).toBe(true);
    const e = useStore.getState().libraryEntries.e3;
    expect(e.version).toBe(2);
    expect(e.origin.kind).toBe('manual_edit'); // existing kind preserved
    expect(e.origin.changes).toBe('замена 1: A→T');
    expect(e.origin.reason).toBe('фикс');
    expect(useStore.getState().libraryEditLog.e3).toBeUndefined();
  });

  it('overwrite stays back-compatible with 2-arg callers (no provenance)', async () => {
    seedEntry('e3b');
    const res = await useStore.getState().overwriteLibraryEntryAnnotations('e3b', []);
    expect(res.ok).toBe(true);
    expect(useStore.getState().libraryEntries.e3b.version).toBe(2);
  });

  it('saveLibraryEntryAsVersion carries provenance into the new version + clears log', async () => {
    seedEntry('e4');
    await useStore.getState().applySequenceEditOnLibraryEntry('e4', { kind: 'replace', start: 0, end: 1, replacement: 'T' });
    const res = await useStore.getState().saveLibraryEntryAsVersion('e4', [], 'pX v2', { changes: 'замена 1: A→T', reason: 'правка' });
    expect(res.ok).toBe(true);
    const branch = Object.values(useStore.getState().libraryEntries).find((x) => x.origin?.kind === 'version' && x.parentEntryId === 'e4');
    expect(branch).toBeTruthy();
    expect(branch.origin.changes).toBe('замена 1: A→T');
    expect(branch.origin.reason).toBe('правка');
    expect(useStore.getState().libraryEditLog.e4).toBeUndefined();
  });

  it('clearLibraryEditLog drops the log for an entry', async () => {
    seedEntry('e5');
    await useStore.getState().applySequenceEditOnLibraryEntry('e5', { kind: 'insert', pos: 0, char: 'A' });
    expect(useStore.getState().libraryEditLog.e5).toHaveLength(1);
    useStore.getState().clearLibraryEditLog('e5');
    expect(useStore.getState().libraryEditLog.e5).toBeUndefined();
  });
});

describe('Library sequence undo/redo (Ctrl+Z этап 2)', () => {
  it('undo restores the prior sequence + annotations; redo re-applies', async () => {
    seedEntry('u1');
    await useStore.getState().applySequenceEditOnLibraryEntry('u1', { kind: 'replace', start: 0, end: 1, replacement: 'T' });
    expect(useStore.getState().libraryEntries.u1.payload.sequence).toBe('TCGTACGT');

    const r = await useStore.getState().undoLibrarySequenceEdit('u1');
    expect(r.ok).toBe(true);
    expect(useStore.getState().libraryEntries.u1.payload.sequence).toBe('ACGTACGT');

    const r2 = await useStore.getState().redoLibrarySequenceEdit('u1');
    expect(r2.ok).toBe(true);
    expect(useStore.getState().libraryEntries.u1.payload.sequence).toBe('TCGTACGT');
  });

  it('undo steps back through multiple edits one at a time', async () => {
    seedEntry('u2');
    await useStore.getState().applySequenceEditOnLibraryEntry('u2', { kind: 'replace', start: 0, end: 1, replacement: 'T' }); // TCGTACGT
    await useStore.getState().applySequenceEditOnLibraryEntry('u2', { kind: 'replace', start: 7, end: 8, replacement: 'C' }); // TCGTACGC
    expect(useStore.getState().libraryEntries.u2.payload.sequence).toBe('TCGTACGC');
    await useStore.getState().undoLibrarySequenceEdit('u2');
    expect(useStore.getState().libraryEntries.u2.payload.sequence).toBe('TCGTACGT');
    await useStore.getState().undoLibrarySequenceEdit('u2');
    expect(useStore.getState().libraryEntries.u2.payload.sequence).toBe('ACGTACGT');
  });

  it('a fresh edit abandons the redo branch', async () => {
    seedEntry('u3');
    await useStore.getState().applySequenceEditOnLibraryEntry('u3', { kind: 'replace', start: 0, end: 1, replacement: 'T' });
    await useStore.getState().undoLibrarySequenceEdit('u3'); // back to ACGTACGT
    await useStore.getState().applySequenceEditOnLibraryEntry('u3', { kind: 'replace', start: 1, end: 2, replacement: 'A' }); // AAGTACGT
    const r = await useStore.getState().redoLibrarySequenceEdit('u3');
    expect(r.ok).toBe(false);
    expect(useStore.getState().libraryEntries.u3.payload.sequence).toBe('AAGTACGT');
  });

  it('undo also reverts the «что изменено» log so the summary stays accurate', async () => {
    seedEntry('u4');
    await useStore.getState().applySequenceEditOnLibraryEntry('u4', { kind: 'insert', pos: 0, char: 'A' });
    expect(useStore.getState().libraryEditLog.u4).toHaveLength(1);
    await useStore.getState().undoLibrarySequenceEdit('u4');
    expect(useStore.getState().libraryEditLog.u4 || []).toHaveLength(0);
  });

  it('undo on an entry with no history is a no-op', async () => {
    seedEntry('u5');
    const r = await useStore.getState().undoLibrarySequenceEdit('u5');
    expect(r.ok).toBe(false);
  });

  it('a version-bumping commit (overwrite) clears the undo stack — Ctrl+Z cannot revert below the saved version (C3)', async () => {
    seedEntry('cb1');
    await useStore.getState().applySequenceEditOnLibraryEntry('cb1', { kind: 'replace', start: 0, end: 1, replacement: 'T' });
    expect(useStore.getState().libraryUndo.cb1.past).toHaveLength(1);
    await useStore.getState().overwriteLibraryEntryAnnotations('cb1', [], { changes: 'фикс' });
    expect((useStore.getState().libraryUndo.cb1?.past || [])).toHaveLength(0);
    const r = await useStore.getState().undoLibrarySequenceEdit('cb1');
    expect(r.ok).toBe(false);
    expect(useStore.getState().libraryEntries.cb1.payload.sequence).toBe('TCGTACGT'); // stays at committed state
  });

  it('saveAsVersion drops the parent undo stack so its hash cannot dangle (C2)', async () => {
    seedEntry('cb2');
    await useStore.getState().applySequenceEditOnLibraryEntry('cb2', { kind: 'insert', pos: 0, char: 'A' });
    await useStore.getState().saveLibraryEntryAsVersion('cb2', [], 'cb2 v2', { changes: 'y' });
    expect((useStore.getState().libraryUndo.cb2?.past || [])).toHaveLength(0);
  });
});
