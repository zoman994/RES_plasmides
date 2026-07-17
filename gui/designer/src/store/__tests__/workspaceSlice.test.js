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
    useStore.getState().setActiveWorkspace('align');
    const s = useStore.getState();
    expect(s.workspace.active).toBe('align');
    expect(s.workspace.history).toEqual(['library']);
    expect(selectIsInLibrary(s)).toBe(false);
  });

  it('setActiveWorkspace called twice — history accumulates', () => {
    useStore.getState().setActiveWorkspace('align');
    useStore.getState().setActiveWorkspace('restriction-sites');
    const s = useStore.getState();
    expect(s.workspace.active).toBe('restriction-sites');
    expect(s.workspace.history).toEqual(['library', 'align']);
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

  it('setActiveWorkspace ignores the retired importer workspace', () => {
    useStore.getState().setActiveWorkspace('importer');
    expect(useStore.getState().workspace.active).toBe('library');
    expect(useStore.getState().workspace.history).toEqual([]);
  });

  it('goBack pops history and sets active to popped value', () => {
    useStore.getState().setActiveWorkspace('align');
    useStore.getState().setActiveWorkspace('primer-pool');
    useStore.getState().goBack();
    const s = useStore.getState();
    expect(s.workspace.active).toBe('align');
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
    const names = ['align', 'restriction-sites', 'mix', 'construct', 'startup',
                   'align', 'primer-pool', 'mix', 'construct', 'startup',
                   'align', 'restriction-sites'];
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
    useStore.getState().setActiveWorkspace('align');
    expect(selectCanGoBack(useStore.getState())).toBe(true);
    useStore.getState().goBack();
    expect(selectCanGoBack(useStore.getState())).toBe(false);
  });

  it('setActiveWorkspace accepts an optional context object (e.g. { projectId })', () => {
    // Context forwarding is a general slice feature — it records the
    // active name + history + an opaque context object; the payload
    // itself lives in canvas / project slices. (Was demoed with 'flow'
    // per the retracted DEC-MX7A-V2-09; now any workspace.)
    useStore.getState().setActiveWorkspace('construct', { projectId: 'p-42' });
    expect(useStore.getState().workspace.active).toBe('construct');
    expect(useStore.getState().workspace.context).toEqual({ projectId: 'p-42' });
  });

  it('context is reset when switching to a workspace without context', () => {
    useStore.getState().setActiveWorkspace('construct', { projectId: 'p-42' });
    useStore.getState().setActiveWorkspace('library');
    expect(useStore.getState().workspace.context).toEqual({});
  });
});
