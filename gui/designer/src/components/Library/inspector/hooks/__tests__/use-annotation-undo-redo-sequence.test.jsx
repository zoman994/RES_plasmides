/**
 * use-annotation-undo-redo-sequence.test.jsx — 17.06.2026.
 *
 * The Library undo stack now carries the SEQUENCE alongside annotations
 * so Ctrl+Z undoes nucleotide edits too (sequence editing flows through
 * the same transient buffer). Annotation-only snapshots omit the
 * sequence → undo restores only annotations (sequence untouched).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useAnnotationUndoRedo } from '../useAnnotationUndoRedo';

afterEach(cleanup);

describe('useAnnotationUndoRedo — sequence-aware', () => {
  it('undo restores BOTH editedAnnotations and editedSequence when a sequence was snapshotted', () => {
    const onUpdateEdits = vi.fn();
    const { result } = renderHook(() => useAnnotationUndoRedo({
      itemKey: 'k1',
      currentAnnotations: [{ id: 'a' }],
      currentSequence: 'ATGCT', // live (post-edit) state
      onUpdateEdits,
    }));
    // snapshot the PRE-edit state (annotations + sequence)
    act(() => result.current.pushSnapshot([], 'ATGC'));
    act(() => result.current.undo());
    expect(onUpdateEdits).toHaveBeenCalledWith({ editedAnnotations: [], editedSequence: 'ATGC' });
  });

  it('annotation-only snapshot (no sequence) restores annotations only', () => {
    const onUpdateEdits = vi.fn();
    const { result } = renderHook(() => useAnnotationUndoRedo({
      itemKey: 'k1', currentAnnotations: [{ id: 'a' }], currentSequence: 'ATGC', onUpdateEdits,
    }));
    act(() => result.current.pushSnapshot([])); // no beforeSequence
    act(() => result.current.undo());
    expect(onUpdateEdits).toHaveBeenCalledWith({ editedAnnotations: [] });
    // editedSequence must NOT be in the patch
    expect(onUpdateEdits.mock.calls[0][0]).not.toHaveProperty('editedSequence');
  });

  it('redo re-applies the post-edit sequence', () => {
    const onUpdateEdits = vi.fn();
    const { result, rerender } = renderHook(
      ({ seq }) => useAnnotationUndoRedo({
        itemKey: 'k1', currentAnnotations: [], currentSequence: seq, onUpdateEdits,
      }),
      { initialProps: { seq: 'ATGCT' } },
    );
    act(() => result.current.pushSnapshot([], 'ATGC'));
    act(() => result.current.undo()); // → ATGC
    // simulate the buffer now reflecting the undone state
    rerender({ seq: 'ATGC' });
    act(() => result.current.redo()); // → back to ATGCT
    const last = onUpdateEdits.mock.calls[onUpdateEdits.mock.calls.length - 1][0];
    expect(last.editedSequence).toBe('ATGCT');
  });
});
