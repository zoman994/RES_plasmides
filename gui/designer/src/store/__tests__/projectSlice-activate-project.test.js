/**
 * activateProject — Sprint M-X.7c K8.
 *
 * Single point of activation per DEC-PROJECT-OPEN-MERGE-01.
 * Verifies:
 *   • setting currentProjectId
 *   • bumping recent list (MRU, capped)
 *   • routing canvas to DAG
 *   • no-op for unknown id
 *   • idempotency for the already-active project
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../../store';

beforeEach(() => {
  useStore.setState((s) => {
    s.projects = {};
    s.recentProjectIds = [];
    s.currentProjectId = null;
    s.canvas = { ...(s.canvas || {}), activeFullscreen: 'start', navStack: [] };
  });
});

function seed(...names) {
  useStore.setState((s) => {
    for (const n of names) {
      s.projects[`id-${n}`] = { id: `id-${n}`, name: n, containerIds: [] };
    }
  });
}

describe('M-X.7c K8 — activateProject(id)', () => {
  it('sets currentProjectId + bumps MRU recent list (mode left untouched per FAIL-fix-pass 4)', () => {
    seed('A', 'B');
    useStore.setState((s) => { s.recentProjectIds = ['id-A']; });
    const ok = useStore.getState().activateProject('id-B');
    expect(ok).toBe(true);
    const s = useStore.getState();
    expect(s.currentProjectId).toBe('id-B');
    expect(s.recentProjectIds[0]).toBe('id-B');
    // Mode is the caller's responsibility — `activateProject` only
    // touches identity (currentProjectId + MRU list).
  });

  it('no-op for unknown id (returns false; currentProjectId unchanged)', () => {
    seed('A');
    useStore.setState((s) => { s.currentProjectId = 'id-A'; });
    const ok = useStore.getState().activateProject('id-MISSING');
    expect(ok).toBe(false);
    expect(useStore.getState().currentProjectId).toBe('id-A');
  });

  it('idempotent for already-active project — recent list still bumped', () => {
    seed('A', 'B');
    useStore.setState((s) => {
      s.recentProjectIds = ['id-B', 'id-A'];
      s.currentProjectId = 'id-B';
    });
    useStore.getState().activateProject('id-B');
    expect(useStore.getState().currentProjectId).toBe('id-B');
    expect(useStore.getState().recentProjectIds[0]).toBe('id-B');
  });

  it('null / empty id is a no-op (returns false)', () => {
    seed('A');
    useStore.setState((s) => { s.currentProjectId = 'id-A'; });
    expect(useStore.getState().activateProject(null)).toBe(false);
    expect(useStore.getState().activateProject('')).toBe(false);
    expect(useStore.getState().currentProjectId).toBe('id-A');
  });

  // FAIL-fix-pass 4 — activateProject() must NOT touch
  // canvas.activeFullscreen. The Tree-click flow (mode=library)
  // was being yanked into DAG view as a side-effect.
  it('does NOT mutate canvas.activeFullscreen (mode is the caller\'s responsibility)', () => {
    seed('A');
    useStore.setState((s) => {
      s.canvas = { ...(s.canvas || {}), activeFullscreen: 'library', navStack: [] };
    });
    useStore.getState().activateProject('id-A');
    expect(useStore.getState().canvas.activeFullscreen).toBe('library');
  });
});
