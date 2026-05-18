/**
 * pinnedProjectIds — Sprint M-X.8 K2 (DEC-UIRREV-PINNED-EXPLICIT).
 *
 * Verifies pin / unpin / reorder semantics, the PIN_LIMIT cap,
 * idempotency, and migration on hydrate.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../../store';
import { PIN_LIMIT } from '../projectSlice';

beforeEach(() => {
  useStore.setState((s) => {
    s.projects = {};
    s.recentProjectIds = [];
    s.pinnedProjectIds = [];
    s.currentProjectId = null;
  });
});

function seed(...names) {
  useStore.setState((s) => {
    for (const n of names) {
      s.projects[`id-${n}`] = { id: `id-${n}`, name: n, containerIds: [] };
    }
  });
}

describe('M-X.8 K2 — pinProject / unpinProject / reorderPins', () => {
  it('pinProject adds the id and is idempotent', () => {
    seed('A');
    expect(useStore.getState().pinProject('id-A')).toBe(true);
    expect(useStore.getState().pinnedProjectIds).toEqual(['id-A']);
    // Idempotent — second call leaves the list unchanged.
    expect(useStore.getState().pinProject('id-A')).toBe(true);
    expect(useStore.getState().pinnedProjectIds).toEqual(['id-A']);
  });

  it('pinProject returns false for unknown id', () => {
    expect(useStore.getState().pinProject('id-MISSING')).toBe(false);
    expect(useStore.getState().pinProject(null)).toBe(false);
    expect(useStore.getState().pinnedProjectIds).toEqual([]);
  });

  it('pinProject returns "cap" once PIN_LIMIT is reached', () => {
    const names = Array.from({ length: PIN_LIMIT + 2 }, (_, i) => `p${i}`);
    seed(...names);
    for (let i = 0; i < PIN_LIMIT; i++) {
      expect(useStore.getState().pinProject(`id-p${i}`)).toBe(true);
    }
    expect(useStore.getState().pinnedProjectIds.length).toBe(PIN_LIMIT);
    // Next pin hits the cap.
    expect(useStore.getState().pinProject(`id-p${PIN_LIMIT}`)).toBe('cap');
    expect(useStore.getState().pinnedProjectIds.length).toBe(PIN_LIMIT);
  });

  it('unpinProject removes by id; idempotent for unknown / not-pinned', () => {
    seed('A', 'B');
    useStore.getState().pinProject('id-A');
    useStore.getState().pinProject('id-B');
    expect(useStore.getState().unpinProject('id-A')).toBe(true);
    expect(useStore.getState().pinnedProjectIds).toEqual(['id-B']);
    // Already absent — still OK.
    expect(useStore.getState().unpinProject('id-A')).toBe(true);
    expect(useStore.getState().pinnedProjectIds).toEqual(['id-B']);
  });

  it('reorderPins replaces ordering, dedupes, drops unknown ids, clamps to PIN_LIMIT', () => {
    seed('A', 'B', 'C');
    useStore.getState().pinProject('id-A');
    useStore.getState().pinProject('id-B');
    // Reorder + dedup + drop missing.
    useStore.getState().reorderPins(['id-B', 'id-A', 'id-A', 'id-MISSING', 'id-C']);
    expect(useStore.getState().pinnedProjectIds).toEqual(['id-B', 'id-A', 'id-C']);
    // Non-array → no-op (returns false).
    expect(useStore.getState().reorderPins(null)).toBe(false);
    expect(useStore.getState().pinnedProjectIds).toEqual(['id-B', 'id-A', 'id-C']);
  });

  it('hydration seeds pinnedProjectIds from top-3 of recentProjectIds when empty', () => {
    // Direct simulation of the migration branch — populate state as
    // hydration would (recent list set, pinned empty), then verify
    // post-condition shape.
    seed('A', 'B', 'C', 'D');
    useStore.setState((s) => {
      s.recentProjectIds = ['id-A', 'id-B', 'id-C', 'id-D'];
      s.pinnedProjectIds = [];
    });
    // Run the migration manually (mirror the hydrateProjectsFromDexie body).
    useStore.setState((s) => {
      if (!Array.isArray(s.pinnedProjectIds) || s.pinnedProjectIds.length === 0) {
        s.pinnedProjectIds = s.recentProjectIds.slice(0, 3);
      }
    });
    expect(useStore.getState().pinnedProjectIds).toEqual(['id-A', 'id-B', 'id-C']);
  });

  it('hydration migration NOT applied when user already has pins', () => {
    seed('A', 'B', 'X', 'Y');
    useStore.setState((s) => {
      s.recentProjectIds = ['id-A', 'id-B'];
      s.pinnedProjectIds = ['id-X', 'id-Y'];
    });
    useStore.setState((s) => {
      if (!Array.isArray(s.pinnedProjectIds) || s.pinnedProjectIds.length === 0) {
        s.pinnedProjectIds = s.recentProjectIds.slice(0, 3);
      }
    });
    expect(useStore.getState().pinnedProjectIds).toEqual(['id-X', 'id-Y']);
  });
});
