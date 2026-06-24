/**
 * use-library-save-flow.test.js — version-only save (Игорь 17.06.2026).
 * Surfaces the working SEQUENCE + annotations + «что изменено» (editLog)
 * for the «Сохранить версию» form; clears the transient buffer after save.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useLibrarySaveFlow } from '../useLibrarySaveFlow';

afterEach(cleanup);

const mineItem = { _libraryEntryId: 'lib-id', name: 'pUC19', sequence: 'ATGC' };
const catalogItem = { name: 'Demo' }; // no _libraryEntryId

describe('useLibrarySaveFlow (version-only)', () => {
  it('visible=true for Mine entries (with _libraryEntryId)', () => {
    const { result } = renderHook(() => useLibrarySaveFlow({ item: mineItem, edits: {}, onUpdateEdits: () => {} }));
    expect(result.current.visible).toBe(true);
    expect(result.current.libraryEntryId).toBe('lib-id');
    expect(result.current.parentName).toBe('pUC19');
  });

  it('visible=false for non-Mine entries', () => {
    const { result } = renderHook(() => useLibrarySaveFlow({ item: catalogItem, edits: {}, onUpdateEdits: () => {} }));
    expect(result.current.visible).toBe(false);
    expect(result.current.libraryEntryId).toBeNull();
  });

  it('no overwrite path (version-only)', () => {
    const { result } = renderHook(() => useLibrarySaveFlow({ item: mineItem, edits: {}, onUpdateEdits: () => {} }));
    expect(result.current.onAfterOverwrite).toBeUndefined();
    expect(result.current.canOverwrite).toBeUndefined();
  });

  it('hasChanges=true on a sequence edit (editedSequence differs)', () => {
    const { result } = renderHook(() => useLibrarySaveFlow({
      item: mineItem, edits: { editedSequence: 'ATGCT', editLog: [{ kind: 'insert' }] }, onUpdateEdits: () => {},
    }));
    expect(result.current.hasChanges).toBe(true);
    expect(result.current.editedSequence).toBe('ATGCT');
  });

  it('annotation-ONLY edit does NOT trigger the version button (autosave in place, not versioned)', () => {
    const { result } = renderHook(() => useLibrarySaveFlow({ item: mineItem, edits: { editedAnnotations: [] }, onUpdateEdits: () => {} }));
    expect(result.current.hasChanges).toBe(false);
  });

  it('hasChanges=false with no edits; editedSequence falls back to source', () => {
    const { result } = renderHook(() => useLibrarySaveFlow({ item: mineItem, edits: {}, onUpdateEdits: () => {} }));
    expect(result.current.hasChanges).toBe(false);
    expect(result.current.editedSequence).toBe('ATGC');
  });

  it('onAfterSaveAsVersion clears the whole transient buffer (seq + anns + log)', () => {
    const onUpdateEdits = vi.fn();
    const { result } = renderHook(() => useLibrarySaveFlow({
      item: mineItem, edits: { editedSequence: 'ATGCT', editedAnnotations: [{}], editLog: [{}] }, onUpdateEdits,
    }));
    act(() => result.current.onAfterSaveAsVersion());
    expect(onUpdateEdits).toHaveBeenCalledWith({
      editedAnnotations: undefined, editedSequence: undefined, editLog: undefined,
    });
  });
});
