/**
 * skeleton-state-split.test.js — K2 split smoke + slice ownership tests.
 *
 * Sprint M-CANVAS-OPS K2 (12.05.2026 — DEC-OPS-01). Validates that the
 * router-pattern split preserves:
 *   1. buildInitialState shape (all keys present from the old monolith).
 *   2. Action semantics — actions previously handled in a single switch
 *      still produce identical state transitions through the chained
 *      sub-reducers.
 *   3. Slice-ownership boundaries — canvas / operations / editor
 *      sub-reducers each manage their own keys without trampling.
 *   4. Cross-domain effect — REMOVE_CONTAINER + COMMIT_OPERATION +
 *      COMMIT_PENDING_EDITS touch multiple slices in the right order.
 */
import { describe, it, expect } from 'vitest';
import { buildInitialState, skeletonReducer } from '../store/skeleton-state';
import { buildInitialCanvasState, canvasReducer } from '../store/skeleton-state-canvas';
import { buildInitialOperationsState, operationsReducer } from '../store/skeleton-state-operations';
import { buildInitialEditorState, editorReducer, deriveActiveContainerId } from '../store/skeleton-state-editor';

describe('K2 — state split smoke', () => {
  it('buildInitialState exposes all base + canvas + operations + editor fields (post-K3 GC shape)', () => {
    const s = buildInitialState();
    // Base
    expect(s.view).toBe('layout');
    expect(s.highlightedContainerId).toBeNull();
    expect(s.toast).toBeNull();
    expect(Array.isArray(s.primers)).toBe(true);
    // Canvas slice
    expect(Array.isArray(s.containers)).toBe(true);
    expect(Array.isArray(s.commits)).toBe(true);
    expect(typeof s.positions).toBe('object');
    expect(typeof s.cascadeIndex).toBe('number');
    expect(Array.isArray(s.junctions)).toBe(true);
    // Operations slice (K2 shell — empty list)
    expect(s.operations).toEqual([]);
    // Editor slice — F1 M-CANVAS-WINDOW (DEC-WIN-01): editorContext is
    // now multi-tab {tabs: [], activeTabId: null}.
    expect(s.editorOpen).toBe(false);
    expect(s.editorContext).toEqual({ tabs: [], activeTabId: null });
    expect(s.draftSessions).toBeUndefined();
    expect(s.activeDraftId).toBeUndefined();
    expect(typeof s.pendingEditsByContainer).toBe('object');
    expect(typeof s.selectionByTab).toBe('object');
    expect(typeof s.sequenceViewModeByTab).toBe('object');
  });

  it('base actions resolve through router (no sub-reducer touch)', () => {
    const s0 = buildInitialState();
    expect(skeletonReducer(s0, { type: 'SET_VIEW', view: 'graph' }).view).toBe('graph');
    expect(skeletonReducer(s0, { type: 'SET_HIGHLIGHT', containerId: 'x' }).highlightedContainerId).toBe('x');
    expect(skeletonReducer({ ...s0, toast: { message: 'x' } }, { type: 'CLEAR_TOAST' }).toast).toBeNull();
    // RESET yields a fresh initial state. DEC-T3-08 reversed
    // (17.05.2026) → no seeded default zone, so the state is fully
    // deterministic and RESET deep-equals a fresh buildInitialState.
    const reset = skeletonReducer(s0, { type: 'RESET' });
    expect(reset.zones).toEqual([]);
    expect({ ...reset, zones: null }).toEqual({ ...buildInitialState(), zones: null });
  });

  it('unknown action type → returns same reference (identity preserved)', () => {
    const s0 = buildInitialState();
    const s1 = skeletonReducer(s0, { type: 'TOTALLY_UNKNOWN' });
    expect(s1).toBe(s0);
  });

  it('operations slice initialises empty + identity preserved for no-ops (post-K4)', () => {
    const s0 = buildInitialState();
    expect(s0.operations).toEqual([]);
    // Unknown action → identity preserved.
    expect(operationsReducer(s0, { type: 'TOTALLY_UNKNOWN' })).toBe(s0);
    // REMOVE_CONTAINER with no referencing operations → identity preserved.
    expect(operationsReducer(s0, { type: 'REMOVE_CONTAINER', containerId: 'x' })).toBe(s0);
  });
});

describe('K2 — canvas slice ownership', () => {
  it('canvasReducer handles SET_POSITION without touching editor fields', () => {
    const s0 = buildInitialState();
    const containerId = s0.containers[0]?.id;
    if (!containerId) return; // fixture-dependent
    const s1 = canvasReducer(s0, { type: 'SET_POSITION', containerId, position: { x: 999, y: 999 } });
    expect(s1.positions[containerId]).toEqual({ x: 999, y: 999 });
    // Editor slice untouched
    expect(s1.editorOpen).toBe(s0.editorOpen);
    expect(s1.draftSessions).toBe(s0.draftSessions);
    expect(s1.pendingEditsByContainer).toBe(s0.pendingEditsByContainer);
  });

  it('canvasReducer ADD_CONTAINER_FROM_ENTRY appends container + position + toast', () => {
    const s0 = buildInitialState();
    const entry = {
      id: 'lib-entry-x',
      name: 'TestPlasmid',
      payload: { sequence: 'ATGC', topology: 'circular', annotations: [] },
    };
    const s1 = canvasReducer(s0, {
      type: 'ADD_CONTAINER_FROM_ENTRY', entry, position: { x: 200, y: 300 },
    });
    expect(s1.containers.length).toBe(s0.containers.length + 1);
    const added = s1.containers[s1.containers.length - 1];
    expect(added.name).toBe('TestPlasmid');
    expect(s1.positions[added.id]).toEqual({ x: 200, y: 300 });
    expect(s1.toast).toBeTruthy();
    expect(s1.highlightedContainerId).toBe(added.id);
  });
});

describe('K2 — editor slice ownership', () => {
  it('editorReducer SET_PENDING_EDITS writes only to its slice + reads canvas containers', () => {
    const s0 = buildInitialState();
    const containerId = s0.containers[0]?.id;
    if (!containerId) return;
    const s1 = editorReducer(s0, {
      type: 'SET_PENDING_EDITS',
      containerId,
      patch: { editedName: 'NewName' },
    });
    expect(s1.pendingEditsByContainer[containerId]).toEqual({ editedName: 'NewName' });
    // Canvas slice untouched — name in containers[] still unchanged
    expect(s1.containers).toBe(s0.containers);
  });

  it('editorReducer SET_PENDING_EDITS on unknown container → no-op', () => {
    const s0 = buildInitialState();
    const s1 = editorReducer(s0, {
      type: 'SET_PENDING_EDITS',
      containerId: 'does-not-exist',
      patch: { editedName: 'X' },
    });
    expect(s1.pendingEditsByContainer).toBe(s0.pendingEditsByContainer);
  });

  it('editorReducer OPEN_EDITOR_VIEW_ONLY / CLOSE_EDITOR toggles editor slice only', () => {
    const s0 = buildInitialState();
    const s1 = editorReducer(s0, { type: 'OPEN_EDITOR_VIEW_ONLY', containerId: 'abc' });
    expect(s1.editorOpen).toBe(true);
    // F1 DEC-WIN-01: back-compat OPEN_EDITOR_VIEW_ONLY → opens a tab.
    expect(s1.editorContext.tabs).toHaveLength(1);
    expect(s1.editorContext.tabs[0].containerId).toBe('abc');
    expect(deriveActiveContainerId(s1.editorContext)).toBe('abc');
    // Canvas slice untouched
    expect(s1.containers).toBe(s0.containers);
    expect(s1.positions).toBe(s0.positions);
    const s2 = editorReducer(s1, { type: 'CLOSE_EDITOR' });
    expect(s2.editorOpen).toBe(false);
    // CLOSE_EDITOR closes all tabs.
    expect(s2.editorContext).toEqual({ tabs: [], activeTabId: null });
  });
});

describe('K2 — cross-domain via main router', () => {
  it('COMMIT_PENDING_EDITS chain order: canvas applies, editor clears', () => {
    const s0 = buildInitialState();
    const containerId = s0.containers[0]?.id;
    if (!containerId) return;
    // Stage pending edit (only editor slice mutated)
    const s1 = skeletonReducer(s0, {
      type: 'SET_PENDING_EDITS',
      containerId,
      patch: { editedName: 'RenamedViaPending' },
    });
    expect(s1.pendingEditsByContainer[containerId]).toEqual({ editedName: 'RenamedViaPending' });
    expect(s1.containers.find((c) => c.id === containerId).name).not.toBe('RenamedViaPending');
    // Commit — canvas writes container.name, editor clears pending entry
    const s2 = skeletonReducer(s1, { type: 'COMMIT_PENDING_EDITS', containerId });
    expect(s2.pendingEditsByContainer[containerId]).toBeUndefined();
    expect(s2.containers.find((c) => c.id === containerId).name).toBe('RenamedViaPending');
    expect(s2.toast).toBeTruthy();
  });

  it('REMOVE_CONTAINER cleans canvas + editor slices in one dispatch', () => {
    const s0 = buildInitialState();
    const containerId = s0.containers[0]?.id;
    if (!containerId) return;
    // Stage pending edit so editor slice has state to drop
    const s1 = skeletonReducer(s0, {
      type: 'SET_PENDING_EDITS',
      containerId,
      patch: { editedName: 'X' },
    });
    expect(s1.pendingEditsByContainer[containerId]).toBeTruthy();
    const s2 = skeletonReducer(s1, { type: 'REMOVE_CONTAINER', containerId });
    expect(s2.containers.find((c) => c.id === containerId)).toBeUndefined();
    expect(s2.positions[containerId]).toBeUndefined();
    expect(s2.pendingEditsByContainer[containerId]).toBeUndefined();
    expect(s2.toast).toBeTruthy();
  });

  it('REMOVE_CONTAINER for placeholder id whose container missing → state ref preserved (identity)', () => {
    const s0 = buildInitialState();
    const s1 = skeletonReducer(s0, { type: 'REMOVE_CONTAINER', containerId: 'nonexistent-id' });
    // Canvas slice: idx<0 → bail. Editor slice: no pending / no selection / no editor target → bail.
    // → main router returns same reference.
    expect(s1).toBe(s0);
  });

  it('cross-domain placeholder: REMOVE_CONTAINER passes through operations reducer untouched (K4 will add ref-cleanup)', () => {
    const s0 = buildInitialState();
    const containerId = s0.containers[0]?.id;
    if (!containerId) return;
    const s1 = skeletonReducer(s0, { type: 'REMOVE_CONTAINER', containerId });
    // K2: state.operations is and stays empty.
    expect(s1.operations).toEqual([]);
  });
});

describe('K3 — GC legacy (DEC-OPS-02)', () => {
  it('state.draftSessions / state.activeDraftId no longer present', () => {
    const s = buildInitialState();
    expect(s.draftSessions).toBeUndefined();
    expect(s.activeDraftId).toBeUndefined();
  });

  it('state.popup no longer present (was legacy operation popup slice)', () => {
    const s = buildInitialState();
    expect(s.popup).toBeUndefined();
  });

  it('state.editorContext is multi-tab shape {tabs, activeTabId} (DEC-WIN-01)', () => {
    const s = buildInitialState();
    expect(s.editorContext).toEqual({ tabs: [], activeTabId: null });
  });

  it('legacy reducer cases OPEN_EDITOR_DRAFT / SET_ACTIVE_DRAFT / SET_ACTIVE_TAB are no-ops', () => {
    const s0 = buildInitialState();
    // Each legacy action falls through default → state preserved by identity.
    expect(skeletonReducer(s0, { type: 'OPEN_EDITOR_DRAFT', draftId: 'x' })).toBe(s0);
    expect(skeletonReducer(s0, { type: 'SET_ACTIVE_DRAFT', draftId: 'x' })).toBe(s0);
    expect(skeletonReducer(s0, { type: 'SET_ACTIVE_TAB', draftId: 'x', tabId: 'y' })).toBe(s0);
  });
});

describe('K2 — sub-reducer initial state builders', () => {
  it('buildInitialCanvasState returns only canvas-slice keys', () => {
    const s = buildInitialCanvasState();
    expect(Object.keys(s).sort()).toEqual(
      ['cascadeIndex', 'commits', 'containers', 'junctions', 'positions'].sort(),
    );
  });

  it('buildInitialOperationsState returns only operations-slice keys', () => {
    const s = buildInitialOperationsState();
    expect(Object.keys(s)).toEqual(['operations']);
    expect(s.operations).toEqual([]);
  });

  it('buildInitialEditorState returns only editor-slice keys (F3: + pcrModeUserLevel)', () => {
    const s = buildInitialEditorState();
    expect(Object.keys(s).sort()).toEqual(
      [
        'editorContext',
        'editorOpen',
        'pendingEditsByContainer',
        'selectionByTab',
        'sequenceViewModeByTab',
        'pcrModeUserLevel',
      ].sort(),
    );
    expect(s.editorContext).toEqual({ tabs: [], activeTabId: null });
  });
});
