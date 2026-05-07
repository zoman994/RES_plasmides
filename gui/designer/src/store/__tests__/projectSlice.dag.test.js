/**
 * projectSlice.dag — Sprint M-C.1 K1 unit tests.
 *
 * Covers the DAG schema extension on Project (DEC-MC1-04):
 *   • `ensureDagShape(project)` lazy migration for legacy projects.
 *   • `addContainerToCurrentProject(id, position?)` accepts an optional
 *     position and persists it into `Project.dag.positions[id]`. Legacy
 *     callsites (M-X.5 K8 quick-add) — no `position` argument — keep
 *     working.
 *   • `setDagPositions`, `addDagEdge`, `removeDagEdge`, `setDagViewport`,
 *     `removeContainerFromProject` — new actions on the slice.
 *
 * Autosave round-trip covered by a short delay (overridden via
 * `setAutosaveDelay`).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useStore } from '../index';
import { clearAll, getProject } from '../../db/dexie-schema';
import {
  setAutosaveDelay,
  clearAllAutosaveTimers,
  DEFAULT_AUTOSAVE_DELAY_MS,
  ensureDagShape,
} from '../projectSlice';

async function reset() {
  clearAllAutosaveTimers();
  setAutosaveDelay(0);
  await clearAll();
  useStore.setState((state) => {
    state.projects = {};
    state.currentProjectId = null;
    state.recentProjectIds = [];
    state._projectLifecycle = {};
    state.canvas.activeFullscreen = 'start';
    state.canvas.navStack = [{ fullscreen: 'start', payload: null }];
  });
}

function makeLegacyProject(id = 'p-legacy') {
  return {
    id,
    schemaVer: 1,
    name: 'legacy',
    description: '',
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    agent: { name: '', email: '' },
    containerIds: ['c-1', 'c-2'],
    projectCommitIds: [],
    primerIds: [],
    settings: {},
    ext: {},
    // No `dag` field — pre-M-C.1 shape.
  };
}

async function flushAutosave() {
  // Tests use delay=0 so the timer fires on next microtask tick.
  await new Promise((r) => setTimeout(r, 5));
}

describe('M-C.1 K1 — projectSlice.dag', () => {
  beforeEach(reset);
  afterEach(() => {
    clearAllAutosaveTimers();
    setAutosaveDelay(DEFAULT_AUTOSAVE_DELAY_MS);
  });

  it('ensureDagShape on legacy project returns dag={positions:{},edges:[],viewport:{x:0,y:0,zoom:1}}', () => {
    const proj = makeLegacyProject();
    const out = ensureDagShape(proj);
    expect(out.dag).toBeDefined();
    expect(out.dag.positions).toEqual({});
    expect(out.dag.edges).toEqual([]);
    expect(out.dag.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    // Other fields preserved.
    expect(out.containerIds).toEqual(['c-1', 'c-2']);
  });

  it('ensureDagShape is idempotent on a project that already has a dag', () => {
    const proj = makeLegacyProject();
    proj.dag = { positions: { 'c-1': { x: 50, y: 80 } }, edges: [], viewport: { x: 0, y: 0, zoom: 1.5 } };
    const out = ensureDagShape(proj);
    expect(out.dag.positions['c-1']).toEqual({ x: 50, y: 80 });
    expect(out.dag.viewport.zoom).toBe(1.5);
  });

  it('createProject seeds Project.dag with empty shape', () => {
    const id = useStore.getState().createProject('p1');
    const proj = useStore.getState().projects[id];
    expect(proj.dag).toBeDefined();
    expect(proj.dag.positions).toEqual({});
    expect(proj.dag.edges).toEqual([]);
    expect(proj.dag.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('addContainerToCurrentProject without position keeps legacy contract (no breaking change)', () => {
    const id = useStore.getState().createProject('p1');
    useStore.getState().addContainerToCurrentProject('lib-1');
    const proj = useStore.getState().projects[id];
    expect(proj.containerIds).toEqual(['lib-1']);
    expect(proj.dag.positions['lib-1']).toBeUndefined();
  });

  it('addContainerToCurrentProject with position records both containerIds and dag.positions', () => {
    const id = useStore.getState().createProject('p1');
    useStore.getState().addContainerToCurrentProject('lib-1', { x: 200, y: 150 });
    const proj = useStore.getState().projects[id];
    expect(proj.containerIds).toEqual(['lib-1']);
    expect(proj.dag.positions['lib-1']).toEqual({ x: 200, y: 150 });
  });

  it('addContainerToCurrentProject with same id twice is idempotent — second call does NOT overwrite position', () => {
    const id = useStore.getState().createProject('p1');
    useStore.getState().addContainerToCurrentProject('lib-1', { x: 100, y: 100 });
    useStore.getState().addContainerToCurrentProject('lib-1', { x: 999, y: 999 });
    const proj = useStore.getState().projects[id];
    expect(proj.containerIds).toEqual(['lib-1']);
    expect(proj.dag.positions['lib-1']).toEqual({ x: 100, y: 100 });
  });

  it('setDagPositions merges a batch of positions', () => {
    const id = useStore.getState().createProject('p1');
    useStore.getState().addContainerToCurrentProject('lib-1');
    useStore.getState().addContainerToCurrentProject('lib-2');
    useStore.getState().setDagPositions({
      'lib-1': { x: 10, y: 20 },
      'lib-2': { x: 30, y: 40 },
    });
    const proj = useStore.getState().projects[id];
    expect(proj.dag.positions['lib-1']).toEqual({ x: 10, y: 20 });
    expect(proj.dag.positions['lib-2']).toEqual({ x: 30, y: 40 });
  });

  it('addDagEdge creates an edge with a generated id and from/to', () => {
    const id = useStore.getState().createProject('p1');
    useStore.getState().addContainerToCurrentProject('lib-1');
    useStore.getState().addContainerToCurrentProject('lib-2');
    useStore.getState().addDagEdge({ from: 'lib-1', to: 'lib-2' });
    const proj = useStore.getState().projects[id];
    expect(proj.dag.edges).toHaveLength(1);
    expect(proj.dag.edges[0]).toMatchObject({ from: 'lib-1', to: 'lib-2' });
    expect(proj.dag.edges[0].id).toBeTruthy();
  });

  it('addDagEdge dedups (no second copy of same from→to)', () => {
    useStore.getState().createProject('p1');
    useStore.getState().addContainerToCurrentProject('lib-1');
    useStore.getState().addContainerToCurrentProject('lib-2');
    useStore.getState().addDagEdge({ from: 'lib-1', to: 'lib-2' });
    useStore.getState().addDagEdge({ from: 'lib-1', to: 'lib-2' });
    const proj = Object.values(useStore.getState().projects)[0];
    expect(proj.dag.edges).toHaveLength(1);
  });

  it('removeDagEdge removes by id', () => {
    const pid = useStore.getState().createProject('p1');
    useStore.getState().addContainerToCurrentProject('lib-1');
    useStore.getState().addContainerToCurrentProject('lib-2');
    useStore.getState().addDagEdge({ from: 'lib-1', to: 'lib-2' });
    const eid = useStore.getState().projects[pid].dag.edges[0].id;
    useStore.getState().removeDagEdge(eid);
    expect(useStore.getState().projects[pid].dag.edges).toEqual([]);
  });

  it('setDagViewport updates the viewport object', () => {
    const id = useStore.getState().createProject('p1');
    useStore.getState().setDagViewport({ x: 100, y: 50, zoom: 2 });
    const proj = useStore.getState().projects[id];
    expect(proj.dag.viewport).toEqual({ x: 100, y: 50, zoom: 2 });
  });

  it('removeContainerFromProject drops containerIds entry, dag.positions, AND any edges touching the node', () => {
    const id = useStore.getState().createProject('p1');
    useStore.getState().addContainerToCurrentProject('lib-1', { x: 10, y: 20 });
    useStore.getState().addContainerToCurrentProject('lib-2', { x: 30, y: 40 });
    useStore.getState().addContainerToCurrentProject('lib-3', { x: 50, y: 60 });
    useStore.getState().addDagEdge({ from: 'lib-1', to: 'lib-2' });
    useStore.getState().addDagEdge({ from: 'lib-2', to: 'lib-3' });
    useStore.getState().removeContainerFromProject('lib-2');
    const proj = useStore.getState().projects[id];
    expect(proj.containerIds).toEqual(['lib-1', 'lib-3']);
    expect(proj.dag.positions['lib-2']).toBeUndefined();
    // Both edges touched lib-2 → both gone.
    expect(proj.dag.edges).toEqual([]);
  });

  it('setDagPositions persists through autosave (putProject called)', async () => {
    const id = useStore.getState().createProject('p1');
    useStore.getState().addContainerToCurrentProject('lib-1');
    useStore.getState().setDagPositions({ 'lib-1': { x: 7, y: 8 } });
    await flushAutosave();
    const rec = await getProject(id);
    expect(rec).toBeTruthy();
    expect(rec.body.dag.positions['lib-1']).toEqual({ x: 7, y: 8 });
  });

  it('addContainerToCurrentProject works on a freshly hydrated legacy project (no dag field) without crashing', async () => {
    // Simulate a project loaded from Dexie that pre-dates M-C.1.
    const legacy = makeLegacyProject('p-legacy');
    useStore.setState((state) => {
      state.projects[legacy.id] = legacy;
      state.currentProjectId = legacy.id;
      state._projectLifecycle[legacy.id] = {
        fileName: null,
        lastSavedToFileAt: null,
        lastModifiedInIndexedDBAt: legacy.updatedAt,
        fileLastKnownModified: null,
        cleanShutdown: false,
      };
    });
    useStore.getState().addContainerToCurrentProject('new-lib', { x: 11, y: 22 });
    const proj = useStore.getState().projects[legacy.id];
    expect(proj.dag).toBeDefined();
    expect(proj.dag.positions['new-lib']).toEqual({ x: 11, y: 22 });
    expect(proj.containerIds).toContain('new-lib');
  });
});
