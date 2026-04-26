/**
 * Sprint X-fix-3 K-fix3-2 — pushUndo regression tests.
 *
 * The bug: pushUndo's setTimeout used to call shallowSnapshot AFTER the same-tick
 * `set()` already mutated state — so the snapshot in _undoStack was post-apply,
 * and undo restored the same state we were trying to leave.
 *
 * These tests run end-to-end through the real store with vi.useFakeTimers() to
 * step the 300ms debounce deterministically.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useStore } from '../index';

const ASM_ID = 'asm_undo_batch_test';
const SEQ = 'ATG' + 'GCT'.repeat(19); // 60 nt, M-A-A-A-...-A

function seedFragment() {
  useStore.setState({
    projectName: 'undo-batch',
    polymerase: 'phusion',
    primerPrefix: 'IS',
    parts: [],
    activeId: ASM_ID,
    assemblies: [{
      id: ASM_ID, name: 'undo-batch-test', circular: false,
      fragments: [{
        id: 'f1', name: 'frag', sequence: SEQ, length: SEQ.length,
        type: 'CDS', strand: 1, needsAmplification: true,
        annotations: [], mutations: [],
      }],
      junctions: [], primers: [], protocolSteps: [], apiWarnings: [], calculated: false,
    }],
    _undoStack: [],
    _redoStack: [],
    _undoPaused: false,
  });
}

function getFrag() {
  return useStore.getState().assemblies.find(a => a.id === ASM_ID).fragments[0];
}

describe('Sprint X-fix-3 — pushUndo captures snapshot synchronously', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    seedFragment();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('batch of 3 mutations → undo restores pre-apply baseline (sequence + commits)', () => {
    const preSequence = getFrag().sequence;
    const preLength = getFrag().length;
    const preCommitsLen = (getFrag().commits || []).length; // 0 — fresh

    // Three substitutions on disjoint codons (no auto-override).
    useStore.getState().applyMutationsBatch(0, [
      { type: 'substitution', dnaPosition: 0,  newCodon: 'ATA', label: 'M1I' },
      { type: 'substitution', dnaPosition: 9,  newCodon: 'GAA', label: 'A4E' },
      { type: 'substitution', dnaPosition: 18, newCodon: 'AAA', label: 'A7K' },
    ]);

    // Let the 300ms debounce fire so the pre-apply snapshot reaches _undoStack.
    vi.advanceTimersByTime(300);

    // Post-apply assertions.
    expect(getFrag().sequence).not.toBe(preSequence);
    expect(getFrag().commits).toHaveLength(3);
    expect(useStore.getState()._undoStack).toHaveLength(1);

    // Undo — the regression target.
    useStore.getState().undo();

    // Post-undo: full baseline restored, NOT the post-apply snapshot.
    expect(getFrag().sequence).toBe(preSequence);
    expect(getFrag().length).toBe(preLength);
    expect((getFrag().commits || []).length).toBe(preCommitsLen);
    expect(useStore.getState()._undoStack).toHaveLength(0);
    expect(useStore.getState()._redoStack).toHaveLength(1);

    // Redo brings the post-apply state back.
    useStore.getState().redo();
    expect(getFrag().sequence).not.toBe(preSequence);
    expect(getFrag().commits).toHaveLength(3);
  });

  it('single applyMutationGit → undo restores baseline (regression-guard for "accidentally working" path)', () => {
    const preSequence = getFrag().sequence;
    const preCommitsLen = (getFrag().commits || []).length;

    useStore.getState().applyMutationGit(0, {
      type: 'substitution', dnaPosition: 9, newCodon: 'GAA', label: 'A4E',
    });
    vi.advanceTimersByTime(300);

    expect(getFrag().sequence).not.toBe(preSequence);
    expect(getFrag().commits).toHaveLength(1);
    expect(useStore.getState()._undoStack).toHaveLength(1);

    useStore.getState().undo();

    expect(getFrag().sequence).toBe(preSequence);
    expect((getFrag().commits || []).length).toBe(preCommitsLen);
    expect(useStore.getState()._undoStack).toHaveLength(0);
  });
});
