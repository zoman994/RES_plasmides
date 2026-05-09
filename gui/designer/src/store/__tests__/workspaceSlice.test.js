/**
 * workspaceSlice — Sprint M-X.7a v2 K1.
 *
 * Top-level workspace router (DEC-MX7A-V2-01). Independent of canvas
 * fullscreen overlay state — Container Window / DAG fullscreen
 * continue to render via `canvas.activeFullscreen` over the active
 * workspace.
 *
 * Default landing: 'library' (DEC-MX7A-V2-08).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../index';
import {
  selectActiveWorkspace,
  selectIsInLibrary,
  selectCanGoBack,
  WORKSPACE_HISTORY_LIMIT,
} from '../workspaceSlice';

function reset() {
  useStore.setState((state) => {
    state.workspace = { active: 'library', history: [] };
  });
}

describe('M-X.7a v2 K1 — workspaceSlice', () => {
  beforeEach(reset);

  it('default active workspace is "library" (DEC-MX7A-V2-08)', () => {
    expect(selectActiveWorkspace(useStore.getState())).toBe('library');
    expect(selectIsInLibrary(useStore.getState())).toBe(true);
  });

  it('setActiveWorkspace pushes prev to history and sets new active', () => {
    useStore.getState().setActiveWorkspace('flow');
    const s = useStore.getState();
    expect(s.workspace.active).toBe('flow');
    expect(s.workspace.history).toEqual(['library']);
    expect(selectIsInLibrary(s)).toBe(false);
  });

  it('setActiveWorkspace called twice — history accumulates', () => {
    useStore.getState().setActiveWorkspace('flow');
    useStore.getState().setActiveWorkspace('importer');
    const s = useStore.getState();
    expect(s.workspace.active).toBe('importer');
    expect(s.workspace.history).toEqual(['library', 'flow']);
  });

  it('setActiveWorkspace with same name as active — no-op (no history push)', () => {
    useStore.getState().setActiveWorkspace('library');
    expect(useStore.getState().workspace.history).toEqual([]);
    expect(useStore.getState().workspace.active).toBe('library');
  });

  it('setActiveWorkspace ignores unknown workspace name', () => {
    useStore.getState().setActiveWorkspace('nonexistent');
    expect(useStore.getState().workspace.active).toBe('library');
    expect(useStore.getState().workspace.history).toEqual([]);
  });

  it('goBack pops history and sets active to popped value', () => {
    useStore.getState().setActiveWorkspace('flow');
    useStore.getState().setActiveWorkspace('importer');
    useStore.getState().goBack();
    const s = useStore.getState();
    expect(s.workspace.active).toBe('flow');
    expect(s.workspace.history).toEqual(['library']);
  });

  it('goBack on empty history is a no-op', () => {
    useStore.getState().goBack();
    const s = useStore.getState();
    expect(s.workspace.active).toBe('library');
    expect(s.workspace.history).toEqual([]);
  });

  it('history is capped at WORKSPACE_HISTORY_LIMIT entries', () => {
    expect(WORKSPACE_HISTORY_LIMIT).toBe(10);
    const names = ['flow', 'importer', 'mix', 'construct', 'startup',
                   'flow', 'importer', 'mix', 'construct', 'startup',
                   'flow', 'importer'];
    for (const n of names) useStore.getState().setActiveWorkspace(n);
    const h = useStore.getState().workspace.history;
    expect(h.length).toBe(WORKSPACE_HISTORY_LIMIT);
    // Oldest entries dropped from the head — initial 'library'
    // (pushed at first switch) shouldn't survive 12 pushes through
    // a cap of 10.
    expect(h).not.toContain('library');
  });

  it('selectCanGoBack reflects history length', () => {
    expect(selectCanGoBack(useStore.getState())).toBe(false);
    useStore.getState().setActiveWorkspace('flow');
    expect(selectCanGoBack(useStore.getState())).toBe(true);
    useStore.getState().goBack();
    expect(selectCanGoBack(useStore.getState())).toBe(false);
  });

  it('setActiveWorkspace accepts an optional context object (e.g. { projectId })', () => {
    // Per DEC-MX7A-V2-09: setActiveWorkspace('flow', { projectId })
    // should not throw — context is forwarded to consumers via slice
    // state but the projectId itself lives elsewhere (canvas / project
    // slices). Workspace slice just records the active name + history.
    useStore.getState().setActiveWorkspace('flow', { projectId: 'p-42' });
    expect(useStore.getState().workspace.active).toBe('flow');
    expect(useStore.getState().workspace.context).toEqual({ projectId: 'p-42' });
  });

  it('context is reset when switching to a workspace without context', () => {
    useStore.getState().setActiveWorkspace('flow', { projectId: 'p-42' });
    useStore.getState().setActiveWorkspace('library');
    expect(useStore.getState().workspace.context).toEqual({});
  });
});
