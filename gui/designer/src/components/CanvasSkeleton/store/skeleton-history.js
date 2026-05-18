/**
 * skeleton-history — Undo/Redo middleware над skeletonReducer.
 *
 * S1 (14.05.2026 — TIER-S improvement). Stack-based history с limit.
 * После каждого мутирующего action сохраняем prev state в past.
 * UNDO → past.pop() → state. REDO → future.pop() → state.
 *
 * Не записываем:
 *   - SET_VIEW (toggle Layout/Graph — purely UI, не data)
 *   - SET_HIGHLIGHT (visual focus)
 *   - CLEAR_TOAST (housekeeping)
 *   - UNDO / REDO themselves (rewind / fast-forward)
 *   - actions без реального изменения state (reference equality check)
 *
 * Public API:
 *   buildHistoryReducer(baseReducer, opts) → enhanced reducer that:
 *     - Wraps state as { present, past[], future[] }.
 *     - Handles UNDO / REDO actions internally.
 *     - Forwards all other actions to baseReducer; appends to past on
 *       state-changing actions.
 *
 *   selectPresent(historyState) → present state (для useReducer).
 *   canUndo / canRedo selectors.
 */

const DEFAULT_LIMIT = 50;

// Actions skipped from history (UI-only / housekeeping / high-frequency).
const SKIPPED_ACTIONS = new Set([
  // UI-only.
  'SET_VIEW',
  'SET_HIGHLIGHT',
  'CLEAR_TOAST',
  'SET_SELECTION',
  'SET_SEQUENCE_VIEW_MODE',
  // Audit-pass fixes: multi-select shouldn't be undoable.
  'TOGGLE_SELECTION',
  'CLEAR_SELECTION',
  'SET_SELECTION_BULK',
  // Drag positions fire on every pointermove — pollutes past stack.
  'SET_POSITION',
  'OP_SET_POSITION',
  // DEC-CANVAS-WIN-04 — editor tab nav is not a data mutation.
  // OPEN/CLOSE_EDITOR_VIEW_ONLY/CLOSE_EDITOR delegate to tab open/close
  // (F1) so they belong to the same nav class.
  'OPEN_EDITOR_TAB',
  'OPEN_EDITOR_OP_TAB',
  'OPEN_EDITOR_ASSEMBLY_TAB',
  'CLOSE_EDITOR_TAB',
  'SWITCH_EDITOR_TAB',
  'SWITCH_NEXT_TAB',
  'SWITCH_PREV_TAB',
  'OPEN_EDITOR_VIEW_ONLY',
  'CLOSE_EDITOR',
  // F3 — PCR-mode UX level is a persisted preference, not a data edit.
  'SET_PCR_MODE_USER_LEVEL',
  // Lifecycle / rehydration — these are not user-mutations.
  'REPLACE_STATE',
  'RESET',
]);

export function buildHistoryReducer(baseReducer, opts = {}) {
  const limit = opts.limit || DEFAULT_LIMIT;

  return function historyReducer(historyState, action) {
    const { present, past, future } = historyState;

    if (action.type === 'UNDO') {
      if (past.length === 0) return historyState;
      const prev = past[past.length - 1];
      return {
        present: prev,
        past: past.slice(0, -1),
        future: [present, ...future].slice(0, limit),
      };
    }
    if (action.type === 'REDO') {
      if (future.length === 0) return historyState;
      const next = future[0];
      return {
        present: next,
        past: [...past, present].slice(-limit),
        future: future.slice(1),
      };
    }

    const nextPresent = baseReducer(present, action);
    if (nextPresent === present) return historyState;
    if (SKIPPED_ACTIONS.has(action.type)) {
      return { present: nextPresent, past, future };
    }
    return {
      present: nextPresent,
      past: [...past, present].slice(-limit),
      future: [],
    };
  };
}

/**
 * wrapInitialState — converts a base state into a history-wrapped state.
 */
export function wrapInitialState(present) {
  return { present, past: [], future: [] };
}

export function selectPresent(historyState) {
  return historyState.present;
}

export function selectCanUndo(historyState) {
  return historyState.past.length > 0;
}

export function selectCanRedo(historyState) {
  return historyState.future.length > 0;
}
