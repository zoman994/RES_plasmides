/**
 * skeleton-context — React Context-обёртка над useReducer skeleton-state.
 *
 * Provider mount'ит state с buildInitialState и раздаёт dispatch +
 * actions всем потомкам. Все компоненты CanvasSkeleton дёргают
 * useSkeletonState() для чтения и useSkeletonDispatch() для записи.
 *
 * Сброс state при unmount = react React автоматический (state живёт
 * в reducer'е под Provider; снос /canvas-skeleton route разрушает
 * Provider → state теряется).
 */
import { createContext, useContext, useReducer, useMemo, useCallback, useEffect, useRef } from 'react';
import { useStore } from '../../../store';
import { buildInitialState, skeletonReducer } from './skeleton-state';
import { deriveActiveContainerId } from './skeleton-state-editor';
import {
  buildHistoryReducer,
  wrapInitialState,
  selectPresent,
  selectCanUndo,
  selectCanRedo,
} from './skeleton-history';
import {
  loadSnapshot,
  createDebouncedSaver,
  clearSnapshot,
} from './skeleton-persistence';
import { selectAssemblyDraftSequence, selectAssemblyDraftById } from './selectors-assembly';
import { selectAssemblyTarget } from './selectors-pieces';

const EMPTY_ASSEMBLY = Object.freeze([]);
const StateContext = createContext(null);
const DispatchContext = createContext(null);
const HistoryContext = createContext(null);

// History-enhanced reducer (S1 — Undo/Redo).
const historyReducer = buildHistoryReducer(skeletonReducer);

// S3 — debounced saver (one per provider instance).
const debouncedSaver = createDebouncedSaver(500);

export function SkeletonProvider({ children }) {
  const [historyState, dispatch] = useReducer(
    historyReducer,
    undefined,
    () => wrapInitialState(buildInitialState()),
  );
  const state = selectPresent(historyState);

  // V65 — canvas is per-project. The active project keys persistence;
  // switching project reloads that project's canvas (or resets to a
  // fresh canvas when the new project has no snapshot yet).
  const currentProjectId = useStore((s) => s.currentProjectId);

  // S3 + V65 — rehydrate from IndexedDB, re-keyed on project change.
  // AUDIT-R2-A (14.05.2026): rehydratedRef → true ТОЛЬКО после того как
  // loadSnapshot resolved (иначе auto-save может перезатереть работу).
  const rehydratedRef = useRef(false);
  const loadedProjectRef = useRef(undefined);
  useEffect(() => {
    // Pause auto-save until this project's snapshot is (re)loaded so a
    // stale state isn't written under the new project's key.
    rehydratedRef.current = false;
    let cancelled = false;
    const isProjectSwitch = loadedProjectRef.current !== undefined
      && loadedProjectRef.current !== currentProjectId;
    loadSnapshot(currentProjectId).then((snapshot) => {
      if (cancelled) return;
      if (snapshot) {
        dispatch({ type: 'REPLACE_STATE', state: snapshot });
      } else if (isProjectSwitch) {
        // New project with no saved canvas — start fresh, don't inherit
        // the previous project's in-memory canvas.
        dispatch({ type: 'RESET' });
      }
      loadedProjectRef.current = currentProjectId;
      rehydratedRef.current = true;
    });
    return () => { cancelled = true; };
  }, [currentProjectId]);

  // S3 + V65 — auto-save (debounced) per active project after rehydration.
  useEffect(() => {
    if (!rehydratedRef.current) return;
    debouncedSaver(state, currentProjectId);
  }, [state, currentProjectId]);
  const actions = useMemo(() => ({
    setView: (view) => dispatch({ type: 'SET_VIEW', view }),
    // F1 M-CANVAS-WINDOW — multi-tab editor (DEC-CANVAS-WIN-01..04).
    openEditorTab: (containerId) => dispatch({ type: 'OPEN_EDITOR_TAB', containerId }),
    closeEditorTab: (tabId) => dispatch({ type: 'CLOSE_EDITOR_TAB', tabId }),
    switchEditorTab: (tabId) => dispatch({ type: 'SWITCH_EDITOR_TAB', tabId }),
    switchNextTab: () => dispatch({ type: 'SWITCH_NEXT_TAB' }),
    switchPrevTab: () => dispatch({ type: 'SWITCH_PREV_TAB' }),
    // F3 M-CANVAS-PCR (DEC-CANVAS-PCR-01/02/04).
    openEditorOpTab: (operationId) => dispatch({ type: 'OPEN_EDITOR_OP_TAB', operationId }),
    setPcrModeUserLevel: (level) => dispatch({ type: 'SET_PCR_MODE_USER_LEVEL', level }),
    opSetUserPrimers: (operationId, primers) => dispatch({ type: 'OP_SET_USER_PRIMERS', operationId, primers }),
    opConfirmOrder: (operationId, orderedAt) => dispatch({ type: 'OP_CONFIRM_ORDER', operationId, orderedAt }),
    // Backward-compat aliases — openEditorViewOnly → open/focus tab,
    // closeEditor → close-all-tabs.
    openEditorViewOnly: (containerId) => dispatch({ type: 'OPEN_EDITOR_VIEW_ONLY', containerId }),
    closeEditor: () => dispatch({ type: 'CLOSE_EDITOR' }),
    setHighlight: (containerId) => dispatch({ type: 'SET_HIGHLIGHT', containerId }),
    setSelection: (tabKey, selection) => dispatch({ type: 'SET_SELECTION', tabKey, selection }),
    // Legacy V1 commit pathway — kept until K9 retires it via OP_EXECUTE.
    commitOperation: (payload) => dispatch({ type: 'COMMIT_OPERATION', payload }),
    // Drag from Library tree → Canvas drop-target (NOTES §2).
    addContainerFromEntry: (entry, position) => dispatch({ type: 'ADD_CONTAINER_FROM_ENTRY', entry, position }),
    // R7-1 (14.05.2026): generic add container (для designed oligos, etc).
    addContainer: (container, position) => dispatch({ type: 'ADD_CONTAINER', container, position }),
    // V2 paradigma — fill placeholder in place (drop / pick).
    fillPlaceholder: (containerId, entry) => dispatch({ type: 'FILL_PLACEHOLDER', containerId, entry }),
    // Toolbar Cut: разрез в позиции cursorPos (circular → linearize,
    // linear → slice 0..cutPos).
    cutContainerAtCursor: (containerId, cutPos) => dispatch({ type: 'CUT_CONTAINER_AT_CURSOR', containerId, cutPos }),
    // Del / Backspace on highlighted container.
    removeContainer: (containerId) => dispatch({ type: 'REMOVE_CONTAINER', containerId }),
    // Auto-junction reconciliation (v0.5 paradigma — pointer-up triggers).
    reconcileAutoJunctions: (pairs) => dispatch({ type: 'RECONCILE_AUTO_JUNCTIONS', pairs }),
    removeJunction: (junctionId) => dispatch({ type: 'REMOVE_JUNCTION', junctionId }),
    setJunctionKind: (junctionId, kind) => dispatch({ type: 'SET_JUNCTION_KIND', junctionId, kind }),
    // F2 M-CANVAS-JUNCTION (DEC-CANVAS-JUNC-01/02).
    setJunctionParams: (junctionId, patch) => dispatch({ type: 'SET_JUNCTION_PARAMS', junctionId, patch }),
    resetJunctionToAuto: (junctionId) => dispatch({ type: 'RESET_JUNCTION_TO_AUTO', junctionId }),
    setPosition: (containerId, position) => dispatch({ type: 'SET_POSITION', containerId, position }),
    setSequenceViewMode: (tabKey, mode) => dispatch({ type: 'SET_SEQUENCE_VIEW_MODE', tabKey, mode }),
    commitAnnotationEdit: (containerId, edit) => dispatch({ type: 'COMMIT_ANNOTATION_EDIT', containerId, edit }),
    // DEC-CANVAS-V2-EDITOR-03 — pending edits per-container.
    setPendingEdits: (containerId, patch) => dispatch({ type: 'SET_PENDING_EDITS', containerId, patch }),
    commitPendingEdits: (containerId) => dispatch({ type: 'COMMIT_PENDING_EDITS', containerId }),
    discardPendingEdits: (containerId) => dispatch({ type: 'DISCARD_PENDING_EDITS', containerId }),
    setContainerName: (containerId, name) => dispatch({ type: 'SET_CONTAINER_NAME', containerId, name }),
    // K4 — Operation as data shape (DEC-OPS-03 / DEC-OPS-04).
    opAdd: (payload) => dispatch({ type: 'OP_ADD', payload }),
    opRemove: (operationId) => dispatch({ type: 'OP_REMOVE', operationId }),
    opSetPosition: (operationId, position) => dispatch({ type: 'OP_SET_POSITION', operationId, position }),
    opSetKind: (operationId, kind) => dispatch({ type: 'OP_SET_KIND', operationId, kind }),
    opSetParams: (operationId, params) => dispatch({ type: 'OP_SET_PARAMS', operationId, params }),
    opReset: (operationId) => dispatch({ type: 'OP_RESET', operationId }),
    // A5 — drag-to-connect.
    opAddInput: (operationId, containerId) => dispatch({ type: 'OP_ADD_INPUT', operationId, containerId }),
    opRemoveInput: (operationId, containerId) => dispatch({ type: 'OP_REMOVE_INPUT', operationId, containerId }),
    // A6 — multi-select.
    toggleSelection: (containerId) => dispatch({ type: 'TOGGLE_SELECTION', containerId }),
    clearSelection: () => dispatch({ type: 'CLEAR_SELECTION' }),
    setSelectionBulk: (ids) => dispatch({ type: 'SET_SELECTION_BULK', ids }),
    // K6 — wire дя OP_EXECUTE. K9 fills the reducer. До K9 — no-op
    // на reducer уровне; UI всё равно может вызвать (Execute button
    // в OpPopup), реакция придёт только когда K9 встанет.
    opExecute: (operationId) => dispatch({ type: 'OP_EXECUTE', operationId }),
    // K9 — Save As fork (clone frozen container w/o lock).
    opForkContainer: (containerId, newName, opts = {}) => dispatch({
      type: 'OP_FORK_CONTAINER',
      containerId,
      newName,
      applyPendingEdits: opts.applyPendingEdits !== false,
    }),
    clearToast: () => dispatch({ type: 'CLEAR_TOAST' }),
    showToast: (toast) => dispatch({ type: 'SHOW_TOAST', toast }),
    reset: () => dispatch({ type: 'RESET' }),
    // S1 — Undo/Redo.
    undo: () => dispatch({ type: 'UNDO' }),
    redo: () => dispatch({ type: 'REDO' }),
    // A1 M-CANVAS-ASSEMBLY-MODEL — AssemblyDraft entity. Container
    // source is resolved reducer-side (sub-reducer has full state), so
    // these are plain dispatch wrappers.
    // A2 / G2 — open the assembly editor tab (kind='assembly').
    openEditorAssemblyTab: (draftId) => dispatch({ type: 'OPEN_EDITOR_ASSEMBLY_TAB', draftId }),
    // A4 — reverse-engineer the draft into a DAG (atomic).
    realiseAssembly: (draftId, perBoundaryMethods) => dispatch({
      type: 'ASSEMBLY_REALISE', draftId, perBoundaryMethods,
    }),
    createAssemblyDraft: (opts = {}) => dispatch({ type: 'CREATE_ASSEMBLY_DRAFT', ...opts }),
    removeAssemblyDraft: (draftId) => dispatch({ type: 'REMOVE_ASSEMBLY_DRAFT', draftId }),
    renameAssemblyDraft: (draftId, name) => dispatch({ type: 'RENAME_ASSEMBLY_DRAFT', draftId, name }),
    setAssemblyDraftTopology: (draftId, circular) => dispatch({ type: 'SET_ASSEMBLY_DRAFT_TOPOLOGY', draftId, circular }),
    setAssemblyDraftPosition: (draftId, position) => dispatch({ type: 'SET_ASSEMBLY_DRAFT_POSITION', draftId, position }),
    insertSegment: (draftId, sourceContainerId, start, end, rc, insertAtIndex) => dispatch({
      type: 'INSERT_SEGMENT', draftId, sourceContainerId, start, end, rc, insertAtIndex,
    }),
    insertManualSegment: (draftId, params = {}, insertAtIndex) => dispatch({
      type: 'INSERT_MANUAL_SEGMENT', draftId, ...params, insertAtIndex,
    }),
    removeSegment: (draftId, segmentId) => dispatch({ type: 'REMOVE_SEGMENT', draftId, segmentId }),
    reorderSegments: (draftId, fromIndex, toIndex) => dispatch({ type: 'REORDER_SEGMENTS', draftId, fromIndex, toIndex }),
    updateSegment: (draftId, segmentId, patch) => dispatch({ type: 'UPDATE_SEGMENT', draftId, segmentId, patch }),
    updateSegmentRange: (draftId, segmentId, start, end) => dispatch({
      type: 'UPDATE_SEGMENT_RANGE', draftId, segmentId, start, end,
    }),
    toggleSegmentRc: (draftId, segmentId) => dispatch({ type: 'TOGGLE_SEGMENT_RC', draftId, segmentId }),
    splitSegment: (draftId, segmentId, atOffsetWithinSegment) => dispatch({
      type: 'SPLIT_SEGMENT', draftId, segmentId, atOffsetWithinSegment,
    }),
    // G2 DEC-CANVAS-ASM-19/20 — primers on the assembly sequence.
    writeAssemblyPrimer: ({
      draftId, range, direction, source, name, sequence,
    }) => dispatch({
      type: 'WRITE_ASSEMBLY_PRIMER', draftId, range, direction, source, name, sequence,
    }),
    removeAssemblyPrimer: (draftId, primerId) => dispatch({ type: 'REMOVE_ASSEMBLY_PRIMER', draftId, primerId }),
    updateAssemblyPrimer: (draftId, primerId, patch) => dispatch({
      type: 'UPDATE_ASSEMBLY_PRIMER', draftId, primerId, patch,
    }),
    updateAssemblyPrimerName: (draftId, primerId, value) => dispatch({
      type: 'UPDATE_ASSEMBLY_PRIMER_NAME', draftId, primerId, value,
    }),
    updateAssemblyPrimerNotes: (draftId, primerId, value) => dispatch({
      type: 'UPDATE_ASSEMBLY_PRIMER_NOTES', draftId, primerId, value,
    }),
    // T4 — zone wiring. moveNodeToZone for the drop-hit-detect path;
    // zoneDispatch is a thin raw-dispatch passthrough for ZoneLayer /
    // ZoneContextMenu (they emit CREATE_ZONE / DRAG_ZONE / etc.).
    moveNodeToZone: (nodeType, nodeId, targetZoneId) => dispatch({
      type: 'MOVE_NODE_TO_ZONE', nodeType, nodeId, targetZoneId,
    }),
    zoneDispatch: (action) => dispatch(action),
    // T4.5 — 3-lane auto-layout controls.
    setNodePinned: (nodeType, nodeId, pinned) => dispatch({
      type: 'SET_NODE_PINNED', nodeType, nodeId, pinned,
    }),
    setZoneLaneLayout: (zoneId, layout) => dispatch({ type: 'SET_ZONE_LANE_LAYOUT', zoneId, layout }),
    recomputeZoneLayout: (zoneId) => dispatch({ type: 'RECOMPUTE_ZONE_LAYOUT', zoneId }),
  }), []);

  const history = useMemo(() => ({
    canUndo: selectCanUndo(historyState),
    canRedo: selectCanRedo(historyState),
    pastSize: historyState.past.length,
    futureSize: historyState.future.length,
  }), [historyState]);

  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={actions}>
        <HistoryContext.Provider value={history}>
          {children}
        </HistoryContext.Provider>
      </DispatchContext.Provider>
    </StateContext.Provider>
  );
}

export function useSkeletonHistory() {
  const h = useContext(HistoryContext);
  if (!h) throw new Error('useSkeletonHistory must be used inside <SkeletonProvider>');
  return h;
}

export function useSkeletonState() {
  const s = useContext(StateContext);
  if (!s) throw new Error('useSkeletonState must be used inside <SkeletonProvider>');
  return s;
}

export function useSkeletonActions() {
  const a = useContext(DispatchContext);
  if (!a) throw new Error('useSkeletonActions must be used inside <SkeletonProvider>');
  return a;
}

// Re-exports + convenience hooks for granular subscriptions.
export function useContainerById(containerId) {
  const state = useSkeletonState();
  return useMemo(
    () => state.containers.find((c) => c.id === containerId) || null,
    [state.containers, containerId],
  );
}

export function useEditorTabContext() {
  // Returns the active tab's containerId. After K3 GC (DEC-OPS-02) the
  // editor only supports a single view-only path — no more draft
  // sessions. Shape kept (`{tabContainerId, draftId, viewOnly}`) so
  // existing callers compile unchanged; `draftId` is always null and
  // `viewOnly` is always true when an id is present.
  const state = useSkeletonState();
  return useMemo(() => {
    const id = deriveActiveContainerId(state.editorContext);
    return { tabContainerId: id, draftId: null, viewOnly: !!id };
  }, [state.editorContext]);
}

// Used by the popup callback hooks — get a tabKey unique per (draftId, tabId)
// so selection state doesn't collide across drafts even when tabs share
// containerIds.
export function makeTabKey(draftId, tabId) {
  return draftId ? `${draftId}::${tabId}` : `view::${tabId}`;
}

// Defensive hook to silence lint on actions not yet wired — keeps the
// API discoverable.
// Returns actions if Provider mounted; otherwise empty object. Used by
// popups that may be rendered standalone in unit tests.
export function useSkeletonActionsSafe() {
  const a = useContext(DispatchContext);
  return a || {};
}

// DEC-CANVAS-V2-EDITOR-03 — convenience hook for pending edits buffer.
export function usePendingEdits(containerId) {
  const state = useSkeletonState();
  return useMemo(
    () => (containerId ? state.pendingEditsByContainer[containerId] || null : null),
    [state.pendingEditsByContainer, containerId],
  );
}

// K4 — convenience hooks for operations slice (DEC-OPS-03).
export function useOperations() {
  const state = useSkeletonState();
  return state.operations;
}

export function useOperationById(operationId) {
  const state = useSkeletonState();
  return useMemo(
    () => (operationId
      ? state.operations.find((o) => o.id === operationId) || null
      : null),
    [state.operations, operationId],
  );
}

// A1 — AssemblyDraft slice hooks.
export function useAssemblyDrafts() {
  const state = useSkeletonState();
  return state.assemblyDrafts || EMPTY_ASSEMBLY;
}

export function useAssemblyDraftById(draftId) {
  const state = useSkeletonState();
  // T6 K10 — dual-resolve (zone id → pieces-shaped draft-like, else
  // legacy assemblyDrafts) via the shared selector chokepoint.
  return useMemo(
    () => (draftId ? selectAssemblyDraftById(state, draftId) : null),
    [state, draftId],
  );
}

/**
 * T6 K7 — dual-source resolve for the assembly-mode shell. A targetId
 * that matches a zone resolves to a zone-projected draft-like
 * (zoneMode=true, pieces shape via selectZoneAsDraftLike); otherwise it
 * falls back to the legacy assemblyDrafts slice (transition window,
 * R-T6-4). Returns `{ draft, zoneMode }` — draft is null when neither
 * resolves (shell shows the "removed" guard).
 */
export function useAssemblyTarget(targetId) {
  const state = useSkeletonState();
  return useMemo(
    () => selectAssemblyTarget(state, targetId),
    [state, targetId],
  );
}

export function useAssemblyDraftSequence(draftId) {
  const state = useSkeletonState();
  return useMemo(
    () => selectAssemblyDraftSequence(state, draftId),
    [state.assemblyDrafts, state.containers, draftId],
  );
}

// Suppress unused-import warnings for the helper above when not yet
// referenced by every K-step. (No-op call kept private to module.)
useCallback;
