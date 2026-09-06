/**
 * use-library-save-flow.test.js — version-only save (Игорь 17.06.2026).
 * Surfaces the working SEQUENCE + annotations + «что изменено» (editLog)
 * for the «Сохранить версию» form; clears the transient buffer after save.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useLibrarySaveFlow } from '../useLibrarySaveFlow';

afterEach(cleanup);

const mineItem = {
  _libraryEntryId: 'lib-id', name: 'pUC19', sequence: 'ATGC', topology: 'circular',
};
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

  it('topology-only divergence enables version save and names the real transition', () => {
    const { result } = renderHook(() => useLibrarySaveFlow({
      item: mineItem,
      edits: {
        editedTopology: 'linear',
        editLog: [{ kind: 'topology', from: 'circular', to: 'linear' }],
      },
      onUpdateEdits: () => {},
    }));
    expect(result.current.hasChanges).toBe(true);
    expect(result.current.editedTopology).toBe('linear');
    expect(result.current.changesSummary).toEqual(['топология · кольцевая → линейная']);
    expect(result.current.changeText).not.toContain('правка');
  });

  it('an undone buffer equal to the saved molecule is clean despite lingering properties', () => {
    const { result } = renderHook(() => useLibrarySaveFlow({
      item: mineItem,
      edits: { editedSequence: 'ATGC', editedTopology: 'circular', editLog: [] },
      onUpdateEdits: () => {},
    }));
    expect(result.current.hasChanges).toBe(false);
    expect(result.current.changesSummary).toEqual([]);
  });

  it('onAfterSaveAsVersion clears the whole transient buffer (seq + anns + topology + log)', () => {
    const onUpdateEdits = vi.fn();
    const { result } = renderHook(() => useLibrarySaveFlow({
      item: mineItem,
      edits: { editedSequence: 'ATGCT', editedAnnotations: [{}], editedTopology: 'linear', editLog: [{}] },
      onUpdateEdits,
    }));
    act(() => result.current.onAfterSaveAsVersion());
    expect(onUpdateEdits).toHaveBeenCalledWith({
      editedAnnotations: undefined,
      editedSequence: undefined,
      editedTopology: undefined,
      editLog: undefined,
    });
  });
});
