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
      itemKey: 'k1',
      currentAnnotations: [{ id: 'a' }],
      currentSequence: 'ATGC',
      currentTopology: 'linear',
      currentEditLog: [{ kind: 'topology', from: 'circular', to: 'linear' }],
      onUpdateEdits,
    }));
    act(() => result.current.pushSnapshot([])); // no beforeSequence
    act(() => result.current.undo());
    expect(onUpdateEdits).toHaveBeenCalledWith({ editedAnnotations: [] });
    // editedSequence must NOT be in the patch
    expect(onUpdateEdits.mock.calls[0][0]).not.toHaveProperty('editedSequence');
    expect(onUpdateEdits.mock.calls[0][0]).not.toHaveProperty('editedTopology');
    expect(onUpdateEdits.mock.calls[0][0]).not.toHaveProperty('editLog');
  });

  it('undo/redo restores one coherent sequence + annotations + topology + editLog snapshot', () => {
    const onUpdateEdits = vi.fn();
    const post = {
      anns: [{ id: 'shifted' }],
      seq: 'ATGCTA',
      topology: 'linear',
      log: [
        { kind: 'topology', from: 'circular', to: 'linear' },
        { kind: 'insert', pos: 5, text: 'A' },
      ],
    };
    const { result, rerender } = renderHook(
      ({ state }) => useAnnotationUndoRedo({
        itemKey: 'k1',
        currentAnnotations: state.anns,
        currentSequence: state.seq,
        currentTopology: state.topology,
        currentEditLog: state.log,
        onUpdateEdits,
      }),
      { initialProps: { state: post } },
    );

    act(() => result.current.pushSnapshot([{ id: 'saved' }], 'ATGCT', 'circular', []));
    act(() => result.current.undo());
    expect(onUpdateEdits).toHaveBeenLastCalledWith({
      editedAnnotations: [{ id: 'saved' }],
      editedSequence: 'ATGCT',
      editedTopology: 'circular',
      editLog: [],
    });

    rerender({ state: { anns: [{ id: 'saved' }], seq: 'ATGCT', topology: 'circular', log: [] } });
    act(() => result.current.redo());
    expect(onUpdateEdits).toHaveBeenLastCalledWith({
      editedAnnotations: post.anns,
      editedSequence: post.seq,
      editedTopology: post.topology,
      editLog: post.log,
    });
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
