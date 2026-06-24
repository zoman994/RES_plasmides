import { describe, it, expect } from 'vitest';
import { selectActiveProjectContext, selectRecentProjectsForSwitch, selectProjectsForPick } from '../project-context.js';

describe('project-context — selectActiveProjectContext', () => {
  it('hasProject=false when no current project', () => {
    expect(selectActiveProjectContext({ currentProjectId: null, projects: {} }))
      .toEqual({ hasProject: false, id: null, name: null, fileName: null, containerCount: 0 });
  });
  it('hasProject=false when currentProjectId points to a missing project', () => {
    const r = selectActiveProjectContext({ currentProjectId: 'gone', projects: {} });
    expect(r.hasProject).toBe(false);
  });
  it('returns name, fileName and container count for the active project', () => {
    const state = {
      currentProjectId: 'p1',
      fileName: 'pPICZ.bodge',
      projects: { p1: { id: 'p1', name: 'pPICZ_CBHI', containerIds: ['c1', 'c2', 'c3'] } },
    };
    expect(selectActiveProjectContext(state)).toEqual({
      hasProject: true, id: 'p1', name: 'pPICZ_CBHI', fileName: 'pPICZ.bodge', containerCount: 3,
    });
  });
  it('falls back to «Без имени» and null fileName / 0 containers', () => {
    const state = { currentProjectId: 'p1', projects: { p1: { id: 'p1' } } };
    const r = selectActiveProjectContext(state);
    expect(r.name).toBe('Без имени');
    expect(r.fileName).toBe(null);
    expect(r.containerCount).toBe(0);
  });
  it('guards null/undefined state', () => {
    expect(selectActiveProjectContext(undefined).hasProject).toBe(false);
    expect(selectActiveProjectContext(null).hasProject).toBe(false);
  });
  it('treats a soft-deleted (trashed) current project as no active project', () => {
    const state = {
      currentProjectId: 'p1',
      projects: { p1: { id: 'p1', name: 'Trashed', _pendingDelete: true } },
    };
    expect(selectActiveProjectContext(state).hasProject).toBe(false);
  });
});

describe('project-context — selectRecentProjectsForSwitch', () => {
  const state = {
    currentProjectId: 'b',
    recentProjectIds: ['b', 'a', 'gone', 'c'],
    projects: {
      a: { id: 'a', name: 'Alpha' },
      b: { id: 'b', name: 'Beta' },
      c: { id: 'c', name: 'Gamma' },
    },
  };
  it('maps recent ids to {id,name,isCurrent}, skipping missing projects', () => {
    expect(selectRecentProjectsForSwitch(state)).toEqual([
      { id: 'b', name: 'Beta', isCurrent: true },
      { id: 'a', name: 'Alpha', isCurrent: false },
      { id: 'c', name: 'Gamma', isCurrent: false },
    ]);
  });
  it('respects the limit', () => {
    expect(selectRecentProjectsForSwitch(state, 2).length).toBe(2);
  });
  it('returns empty for no recents', () => {
    expect(selectRecentProjectsForSwitch({ recentProjectIds: [], projects: {} })).toEqual([]);
    expect(selectRecentProjectsForSwitch(undefined)).toEqual([]);
  });
  it('skips soft-deleted (trashed) projects', () => {
    const trashed = {
      currentProjectId: 'b',
      recentProjectIds: ['a', 'b', 'c'],
      projects: {
        a: { id: 'a', name: 'Alpha' },
        b: { id: 'b', name: 'Beta', _pendingDelete: true },
        c: { id: 'c', name: 'Gamma' },
      },
    };
    expect(selectRecentProjectsForSwitch(trashed).map((p) => p.id)).toEqual(['a', 'c']);
  });
});

describe('project-context — selectProjectsForPick', () => {
  it('lists recent projects first, then the rest by name', () => {
    const state = {
      currentProjectId: null,
      recentProjectIds: ['c', 'a'],
      projects: {
        a: { id: 'a', name: 'Alpha' },
        b: { id: 'b', name: 'Beta' },
        c: { id: 'c', name: 'Gamma' },
        d: { id: 'd', name: 'Delta' },
      },
    };
    // recent order (c, a) preserved; remaining (b, d) sorted by name (Beta < Delta)
    expect(selectProjectsForPick(state).map((p) => p.id)).toEqual(['c', 'a', 'b', 'd']);
  });
  it('marks the current project and skips missing ids', () => {
    const state = {
      currentProjectId: 'a',
      recentProjectIds: ['a', 'gone'],
      projects: { a: { id: 'a', name: 'Alpha' }, b: { id: 'b', name: 'Beta' } },
    };
    const out = selectProjectsForPick(state);
    expect(out.find((p) => p.id === 'a').isCurrent).toBe(true);
    expect(out.map((p) => p.id)).toEqual(['a', 'b']);
  });
  it('does not duplicate a recent project that also exists in projects', () => {
    const state = {
      recentProjectIds: ['a', 'a'],
      projects: { a: { id: 'a', name: 'Alpha' } },
    };
    expect(selectProjectsForPick(state).map((p) => p.id)).toEqual(['a']);
  });
  it('respects the limit', () => {
    const state = {
      recentProjectIds: [],
      projects: { a: { id: 'a', name: 'A' }, b: { id: 'b', name: 'B' }, c: { id: 'c', name: 'C' } },
    };
    expect(selectProjectsForPick(state, 2).length).toBe(2);
  });
  it('guards null/undefined state', () => {
    expect(selectProjectsForPick(undefined)).toEqual([]);
    expect(selectProjectsForPick(null)).toEqual([]);
    expect(selectProjectsForPick({ projects: {} })).toEqual([]);
  });
  it('skips soft-deleted (trashed) projects (recent + rest)', () => {
    const state = {
      currentProjectId: null,
      recentProjectIds: ['b', 'a'],
      projects: {
        a: { id: 'a', name: 'Alpha' },
        b: { id: 'b', name: 'Beta', _pendingDelete: true },
        c: { id: 'c', name: 'Gamma', _pendingDelete: true },
        d: { id: 'd', name: 'Delta' },
      },
    };
    // b skipped (trashed recent), c skipped (trashed rest); a (recent) then d (rest)
    expect(selectProjectsForPick(state).map((p) => p.id)).toEqual(['a', 'd']);
  });
});
