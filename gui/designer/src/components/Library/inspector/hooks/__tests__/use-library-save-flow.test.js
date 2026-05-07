/**
 * use-library-save-flow.test.js — M-X.6 K0 unit coverage for the
 * K7 save buttons props bundle (DEC-MX6-01 / DEC-LIB-13 ⚓).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useLibrarySaveFlow } from '../useLibrarySaveFlow';

afterEach(cleanup);

const mineItem = { _libraryEntryId: 'lib-id', name: 'pUC19' };
const catalogItem = { name: 'Demo' }; // no _libraryEntryId

describe('useLibrarySaveFlow', () => {
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

  it('hasChanges=true only when editedAnnotations is an array', () => {
    const { result: r1 } = renderHook(() => useLibrarySaveFlow({ item: mineItem, edits: { editedAnnotations: [] }, onUpdateEdits: () => {} }));
    expect(r1.current.hasChanges).toBe(true);
    const { result: r2 } = renderHook(() => useLibrarySaveFlow({ item: mineItem, edits: {}, onUpdateEdits: () => {} }));
    expect(r2.current.hasChanges).toBe(false);
  });

  it('editedAnnotations defaults to empty array when edits is undefined', () => {
    const { result } = renderHook(() => useLibrarySaveFlow({ item: mineItem, edits: undefined, onUpdateEdits: () => {} }));
    expect(result.current.editedAnnotations).toEqual([]);
  });

  it('onAfterOverwrite clears editedAnnotations via onUpdateEdits', () => {
    const onUpdateEdits = vi.fn();
    const { result } = renderHook(() => useLibrarySaveFlow({ item: mineItem, edits: { editedAnnotations: [{}] }, onUpdateEdits }));
    act(() => result.current.onAfterOverwrite());
    expect(onUpdateEdits).toHaveBeenCalledWith({ editedAnnotations: undefined });
  });

  it('onAfterSaveAsVersion clears editedAnnotations via onUpdateEdits', () => {
    const onUpdateEdits = vi.fn();
    const { result } = renderHook(() => useLibrarySaveFlow({ item: mineItem, edits: { editedAnnotations: [{}] }, onUpdateEdits }));
    act(() => result.current.onAfterSaveAsVersion());
    expect(onUpdateEdits).toHaveBeenCalledWith({ editedAnnotations: undefined });
  });
});
