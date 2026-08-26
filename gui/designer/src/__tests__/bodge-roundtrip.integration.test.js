import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useStore } from '../store';
import {
  setAutosaveDelay, clearAllAutosaveTimers, DEFAULT_AUTOSAVE_DELAY_MS,
} from '../store/projectSlice';
import { clearAll } from '../db/dexie-schema';
import { writeBodge, writeBodgeV2, readBodge } from '../lib/bodge-zip';
import { canonicalToSkeleton } from '../components/CanvasSkeleton/lib/skeleton-bodge-bridge';
import {
  saveProjectToBodgeBlob, primersForProject, primersFromCanonical,
} from '../lib/project-bodge-state';
import { zipSync, strToU8 } from 'fflate';

async function reset() {
  clearAllAutosaveTimers();
  setAutosaveDelay(DEFAULT_AUTOSAVE_DELAY_MS);
  await clearAll();
  useStore.setState((state) => {
    state.projects = {};
    state.currentProjectId = null;
    state.recentProjectIds = [];
    state.fileHandle = null;
    state.fileName = null;
    state.lastSavedToFileAt = null;
    state.fileLastKnownModified = null;
    state.recoveredFromCrash = false;
    state.hasProjectLock = false;
    state.lockHolderTabId = null;
    state._projectLifecycle = {};
    state.canvas.activeFullscreen = 'start';
    state.canvas.navStack = [{ fullscreen: 'start', payload: null }];
    state.modals = { settings: false, projectInfo: false };
    state.toasts = [];
  });
}

describe('K8 — .bodge save / open round-trip', () => {
  beforeEach(reset);
  afterEach(() => clearAllAutosaveTimers());

  it('writeBodge → readBodge round-trip preserves project body', async () => {
    const id = useStore.getState().createProject('Persisted');
    useStore.getState().addTag('bacterial');
    useStore.getState().addTag('gfp');
    const original = useStore.getState().projects[id];
    const blob = writeBodge(original);
    const { manifest, project, warnings } = await readBodge(blob);
    expect(manifest.fileFormatVersion).toBe(1);
    expect(project.id).toBe(original.id);
    expect(project.name).toBe(original.name);
    expect(project.tags).toEqual(['bacterial', 'gfp']);
    expect(warnings).toEqual([]);
  });

  it('saveProjectToFile (synthetic): writeBodge + registerSavedFile makes project not dirty', async () => {
    const id = useStore.getState().createProject('Saveable');
    const proj = useStore.getState().projects[id];
    const blob = writeBodge(proj);
    expect(blob).toBeInstanceOf(Blob);
    useStore.getState().registerSavedFile({ fileHandle: null, fileName: 'Saveable.bodge', lastModified: 12345 });
    const { selectIsDirty } = await import('../store/projectSlice');
    expect(selectIsDirty(useStore.getState())).toBe(false);
    expect(useStore.getState().fileName).toBe('Saveable.bodge');
    expect(useStore.getState().lastSavedToFileAt).not.toBeNull();
  });

  it('openProjectFromFileData: reading + ingesting a .bodge gives DAG view', async () => {
    const tmp = useStore.getState().createProject('SourceProject');
    useStore.getState().addTag('alpha');
    const blob = writeBodge(useStore.getState().projects[tmp]);
    // Wipe state to simulate a fresh app
    useStore.setState((state) => {
      state.projects = {};
      state.currentProjectId = null;
      state.recentProjectIds = [];
      state._projectLifecycle = {};
      state.canvas.activeFullscreen = 'start';
      state.canvas.navStack = [{ fullscreen: 'start', payload: null }];
    });
    const { project } = await readBodge(blob);
    await useStore.getState().openProjectFromFileData({
      project,
      fileHandle: null,
      fileName: 'SourceProject.bodge',
      lastModified: 999,
    });
    expect(useStore.getState().currentProjectId).toBe(project.id);
    expect(useStore.getState().canvas.activeFullscreen).toBe('dag');
    expect(useStore.getState().projects[project.id].tags).toContain('alpha');
  });

  it('opening .bodge with M-B+ sections (containers/) returns warnings via readBodge', async () => {
    const proj = {
      id: '01900000-7000-7000-8000-000000000099',
      schemaVer: 1, name: 'WithExtras', description: '', tags: [],
      createdAt: 'x', updatedAt: 'x', agent: { name: '', email: '' },
      containerIds: [], projectCommitIds: [], primerIds: [],
      settings: {}, ext: {},
    };
    const zipped = zipSync({
      'manifest.json': strToU8(JSON.stringify({
        fileFormatVersion: 1, schemaVersion: 1, appVersion: '0.6.0-dev',
        createdAt: 'x', updatedAt: 'x',
      })),
      'project.json': strToU8(JSON.stringify(proj)),
      'containers/abc.json': strToU8('{}'),
    });
    const blob = new Blob([zipped]);
    const { warnings } = await readBodge(blob);
    expect(warnings.some(w => w.includes('containers'))).toBe(true);
  });
});

// ===========================================================================
// ANN-0M / RED 1 (root A) - Save must not depend on the assembly canvas.
//
// A biologist imports primers into a project and saves it. If they never
// opened the assembly canvas there is NO CanvasSkeleton snapshot, and that is
// the ordinary case, not an edge case. `loadSnapshot` returns null, and the
// file written in that state must still carry the pool.
//
// The previous proof passed a hand-built empty snapshot object, so it entered
// the branch that already worked and never touched the one that loses data.
// Here `snapshot` is null - exactly what `loadSnapshot` hands App.
// ===========================================================================
describe('ANN-0M root A - Save with no canvas snapshot', () => {
  const RECORDS = [
    {
      id: 'pr-dup-a', name: 'T7-fwd', sequence: 'ATACGACTCACTATAGG',
      schemaVersion: 2, sequenceSource: 'source',
      description: 'ordered from IDT, lot 4471',
      addedAt: '2026-05-01T09:00:00.000Z',
      origin: { kind: 'file_import', format: 'snapgene', sourceRecordIndex: 0 },
      sites: [], tail: null,
    },
    {
      // same NAME and same SEQUENCE as the previous one
      id: 'pr-dup-b', name: 'T7-fwd', sequence: 'ATACGACTCACTATAGG',
      schemaVersion: 2, sequenceSource: 'source',
      addedAt: '2026-05-01T09:30:00.000Z',
      origin: { kind: 'file_import', format: 'snapgene', sourceRecordIndex: 1 },
      sites: [], tail: null,
    },
    {
      id: 'pr-noseq', name: 'inventory-only', sequence: null,
      schemaVersion: 2, sequenceSource: 'unknown',
      description: 'freezer box 3',
      addedAt: '2026-05-01T10:00:00.000Z',
      origin: { kind: 'file_import', format: 'snapgene', sourceRecordIndex: 2 },
      sites: [
        {
          id: 'st-w', sourceIndex: 0,
          target: { entryId: 'c-1', resourceHash: 'sha256:committed' },
          location: { kind: 'join', segments: [{ start: 36, end: 40 }, { start: 0, end: 6 }] },
          strand: 1, annealedSequence: 'GAATTATGCAT',
          tail: null, meltingTemperature: null,
          sourceVisibility: 'shown', sourceForms: ['full'],
        },
        {
          id: 'st-h', sourceIndex: 1,
          target: { entryId: 'c-1', resourceHash: 'sha256:committed' },
          location: { kind: 'single', segments: [{ start: 10, end: 20 }] },
          strand: -1, annealedSequence: 'AAGCTTATAT',
          tail: '', meltingTemperature: 58.2,
          sourceVisibility: 'hidden', sourceForms: ['full'],
        },
      ],
    },
  ];

  async function seedPool(projectId) {
    for (const r of RECORDS) {
      await useStore.getState().addPrimerToPool({ primer: r, projectId, status: 'imported' });
    }
  }

  function poolOf(projectId) {
    return Object.values(useStore.getState().primersById)
      .filter((p) => (p.projectId ?? null) === projectId)
      .sort((a, b) => String(a.addedAt).localeCompare(String(b.addedAt)));
  }

  // Ctrl+S for a project that has never had an assembly: snapshot IS null.
  async function saveWithoutCanvas(projectId) {
    const st = useStore.getState();
    return saveProjectToBodgeBlob({
      project: st.projects[projectId],
      snapshot: null,
      primers: primersForProject(st.primersById, projectId),
    });
  }

  async function openIntoStore(blob, projectId) {
    const { state } = await readBodge(blob);
    canonicalToSkeleton(state);
    for (const rec of primersFromCanonical(state)) {
      await useStore.getState().addPrimerToPool({ primer: rec, projectId });
    }
  }

  async function wipePool() {
    for (const r of RECORDS) await useStore.getState().removePrimerFromPool(r.id);
    useStore.setState((st) => { st.primersById = {}; st._primersHydrated = false; });
    await useStore.getState().hydratePrimers();
  }

  it('writes a canonical container even with no assembly at all', async () => {
    const id = useStore.getState().createProject('no canvas');
    await seedPool(id);
    const { state } = await readBodge(await saveWithoutCanvas(id));
    // v1 has no canonical state at all - falling back to it is how the pool
    // was dropped without a single error being raised
    expect(state).toBeTruthy();
    expect(Array.isArray(state.primers)).toBe(true);
  });

  it('keeps every record through two full save/open cycles', async () => {
    const id = useStore.getState().createProject('no canvas cycles');
    await seedPool(id);

    const blob1 = await saveWithoutCanvas(id);
    await wipePool();
    expect(poolOf(id)).toHaveLength(0);

    await openIntoStore(blob1, id);
    const once = poolOf(id);
    expect(once.map((p) => p.id)).toEqual(['pr-dup-a', 'pr-dup-b', 'pr-noseq']);

    const blob2 = await saveWithoutCanvas(id);
    await wipePool();
    await openIntoStore(blob2, id);
    expect(poolOf(id)).toEqual(once);
  });

  it('keeps two records that share a name AND a sequence', async () => {
    const id = useStore.getState().createProject('no canvas dup');
    await seedPool(id);
    const blob = await saveWithoutCanvas(id);
    await wipePool();
    await openIntoStore(blob, id);
    expect(poolOf(id).filter((p) => p.name === 'T7-fwd')).toHaveLength(2);
  });

  it('keeps the record whose oligo is unknown, with both of its sites', async () => {
    const id = useStore.getState().createProject('no canvas noseq');
    await seedPool(id);
    const blob = await saveWithoutCanvas(id);
    await wipePool();
    await openIntoStore(blob, id);

    const back = poolOf(id).find((p) => p.id === 'pr-noseq');
    expect(back).toBeTruthy();
    expect(back.sequence).toBe(null);
    expect(back.sites).toHaveLength(2);
    expect(back.sites[0].location.segments)
      .toEqual([{ start: 36, end: 40 }, { start: 0, end: 6 }]);
    expect(back.sites[1].sourceVisibility).toBe('hidden');
  });

  it('preserves description, provenance, order, and unknown vs absent tail', async () => {
    const id = useStore.getState().createProject('no canvas fields');
    await seedPool(id);
    const blob = await saveWithoutCanvas(id);
    await wipePool();
    await openIntoStore(blob, id);

    const back = poolOf(id);
    expect(back.map((p) => p.addedAt)).toEqual([
      '2026-05-01T09:00:00.000Z', '2026-05-01T09:30:00.000Z', '2026-05-01T10:00:00.000Z',
    ]);
    expect(back[0].description).toBe('ordered from IDT, lot 4471');
    expect(back.map((p) => p.origin.sourceRecordIndex)).toEqual([0, 1, 2]);
    const noseq = back.find((p) => p.id === 'pr-noseq');
    expect(noseq.sites[0].tail).toBe(null);   // unknown
    expect(noseq.sites[1].tail).toBe('');     // proven absent
  });

  it('lands in Dexie, not only in the in-memory map', async () => {
    const id = useStore.getState().createProject('no canvas dexie');
    await seedPool(id);
    const blob = await saveWithoutCanvas(id);
    await wipePool();

    await openIntoStore(blob, id);
    useStore.setState((st) => { st.primersById = {}; st._primersHydrated = false; });
    await useStore.getState().hydratePrimers();
    expect(poolOf(id).map((p) => p.id)).toEqual(['pr-dup-a', 'pr-dup-b', 'pr-noseq']);
  });

  it('still carries an assembly when there IS a snapshot', async () => {
    const id = useStore.getState().createProject('with canvas');
    await seedPool(id);
    const st = useStore.getState();
    const blob = await saveProjectToBodgeBlob({
      project: st.projects[id],
      snapshot: {
        containers: [{ id: 'c-1', name: 'p1', sequence: 'ATGC', topology: 'linear', annotations: [] }],
        zones: [], pieces: [], operations: [], junctions: [],
      },
      primers: primersForProject(st.primersById, id),
    });
    const { state } = await readBodge(blob);
    expect(state.containers.map((c) => c.id)).toEqual(['c-1']);
    expect(state.primers).toHaveLength(3);
  });
});
