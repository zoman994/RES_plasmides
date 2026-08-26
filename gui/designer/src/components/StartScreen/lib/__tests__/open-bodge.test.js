/**
 * open-bodge.test.js — BG-003. ONE controller owns every full-project `.bodge`
 * Open.
 *
 * The defect: `openBodgeIntoLibrary` returned only `project` + `libraryEntries`,
 * so the Sidebar / MainPanel routes opened a valid project with an EMPTY
 * assembly and an EMPTY primer pool — the Canvas snapshot and the file's primer
 * rows were parsed and then dropped on the floor. Ctrl+O had its own inline
 * copy of the flow (the only one that restored them), and the StartScreen drop
 * had a third, even thinner copy. Three routes, three different projects out of
 * the same file.
 *
 * These tests drive the REAL production path: a real `.bodge` written by the
 * real bridge + writeBodgeV2, read by the real readBodge, through the real
 * store and a real (fake-indexeddb) snapshot store. Only the OS file picker is
 * stubbed — it cannot be driven from a test — and `saveSnapshot` is faulted for
 * exactly one case, using its real failure signature (it resolves `false`, it
 * never throws).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from '../../../../store';
import { resetDBForTests } from '../../../../db/dexie-schema';
import { clearAllAutosaveTimers, clearAllLocks } from '../../../../store/projectSlice';
import { writeBodgeV2 } from '../../../../lib/bodge-zip';
import { skeletonToCanonical } from '../../../CanvasSkeleton/lib/skeleton-bodge-bridge';

vi.mock('../../../../lib/file-system', () => ({
  openBodgeFilePicker: vi.fn(),
}));

// The faults we inject, in the shape production actually produces: a failed
// IndexedDB write is swallowed inside `saveSnapshot` / `clearSnapshot` and
// reported as `false`; neither ever throws.
let failSaveSnapshot = false;
let failClearSnapshot = false;
vi.mock('../../../CanvasSkeleton/store/skeleton-persistence', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    saveSnapshot: (...args) => (
      failSaveSnapshot ? Promise.resolve(false) : actual.saveSnapshot(...args)
    ),
    clearSnapshot: (...args) => (
      failClearSnapshot ? Promise.resolve(false) : actual.clearSnapshot(...args)
    ),
  };
});

import { openBodgeFilePicker } from '../../../../lib/file-system';
import { loadSnapshot, saveSnapshot } from '../../../CanvasSkeleton/store/skeleton-persistence';
import { openBodgeIntoLibrary } from '../open-bodge';

const PROJECT_ID = 'bg003-project';

/** A real assembly: a zone, two pieces cut from a container, and layout. */
function assemblySnapshot() {
  return {
    view: 'layout',
    containers: [{
      id: 'src-bg003', name: 'pBG003', kind: 'molecule',
      sequence: 'ATGCATGCATGCATGCATGCATGCATGCATGCATGCATGC',
      topology: { circular: true }, annotations: [],
    }],
    zones: [{
      id: 'z-bg003', name: 'Сборка BG-003',
      topology: { circular: true },
      assemblyMethod: 'golden_gate', assemblyEnzyme: 'BsmBI', junctions: {},
    }],
    pieces: [
      { id: 'pc-a', name: 'pc-a', kind: 'sourced', zoneId: 'z-bg003', createdAt: 1, ranges: [{ sourceId: 'src-bg003', start: 0, end: 20, orientation: 'forward' }] },
      { id: 'pc-b', name: 'pc-b', kind: 'sourced', zoneId: 'z-bg003', createdAt: 2, ranges: [{ sourceId: 'src-bg003', start: 20, end: 40, orientation: 'forward' }] },
    ],
    operations: [],
    junctions: [],
    positions: { 'pc-a': { x: 42, y: 84 }, 'pc-b': { x: 126, y: 84 } },
    assemblyDraftPrimers: {},
  };
}

/**
 * A primer the biologist already ORDERED. Its lifecycle status is a fact about
 * the physical oligo, not an import detail: reopening the project must not
 * quietly demote it to `imported`.
 */
function projectPrimer() {
  return {
    id: 'pr-bg003', name: 'BG003_F', sequence: 'ACGTACGTACGTACGTACGT',
    projectId: PROJECT_ID, addedAt: '2026-05-01T00:00:00.000Z',
    status: 'ordered',
    description: 'заказан в IDT',
    sites: [{ containerId: 'src-bg003', start: 0, end: 20, strand: 1 }],
    origin: { kind: 'file_import', format: 'bodge', sourceRecordIndex: 3 },
  };
}

function libraryEntry(id = 'le-bg003') {
  return {
    id, kind: 'container', name: 'pBG003',
    payload: { sequence: 'ATGCATGCATGC', length: 12, topology: 'circular', annotations: [] },
  };
}

/** A real `.bodge` v2 file: project meta + library entry + assembly + primer. */
async function realBodgeFile(entries = [libraryEntry()]) {
  const canonical = skeletonToCanonical(
    assemblySnapshot(),
    { id: PROJECT_ID, name: 'BG-003 проект', createdAt: '2026-05-01T09:00:00.000Z', tags: [] },
    [projectPrimer()],
  );
  canonical.libraryEntries = entries;
  return writeBodgeV2(canonical);
}

/** An externally-authored v2 file with nothing assembly-like in it. */
async function emptyV2File() {
  return writeBodgeV2({
    projectMeta: { id: PROJECT_ID, name: 'BG-003 внешний', createdAt: '2026-05-02T09:00:00.000Z', tags: [] },
    containers: [], zones: [], pieces: [], operations: [], junctions: [],
    primers: [], libraryEntries: [],
  });
}

async function pickFile(file, fileName = 'bg003.bodge') {
  openBodgeFilePicker.mockResolvedValue({ file, handle: null, fileName, lastModified: 555 });
}

function toasts() { return useStore.getState().toasts || []; }
function hasKind(kind) { return toasts().some((t) => (t.kind || t.type) === kind); }
function projectPool() {
  return Object.values(useStore.getState().primersById || {})
    .filter((p) => p && p.projectId === PROJECT_ID);
}

beforeEach(async () => {
  failSaveSnapshot = false;
  failClearSnapshot = false;
  openBodgeFilePicker.mockReset();
  clearAllAutosaveTimers();
  clearAllLocks();
  const db = resetDBForTests(`bodgegene-bg003-${Math.random().toString(36).slice(2)}`);
  await db.delete();
  await db.open();
  useStore.setState((state) => {
    state.projects = {};
    state.currentProjectId = null;
    state.recentProjectIds = [];
    state.libraryEntries = {};
    state._libraryHydrated = false;
    state.primersById = {};
    state.fileHandle = null;
    state.fileName = null;
    state.toasts = [];
  });
});

describe('BG-003 — one controller restores the whole project', () => {
  it('the no-arg picker route restores project, library, Canvas snapshot AND primers', async () => {
    openBodgeFilePicker.mockResolvedValue({
      file: await realBodgeFile(), handle: null,
      fileName: 'bg003.bodge', lastModified: 555,
    });

    await openBodgeIntoLibrary();

    // What already worked.
    expect(useStore.getState().currentProjectId).toBe(PROJECT_ID);
    const entry = useStore.getState().libraryEntries['le-bg003'];
    expect(entry).toBeDefined();
    expect(entry.projectId).toBe(PROJECT_ID);

    // What was silently dropped: the assembly.
    const snap = await loadSnapshot(PROJECT_ID);
    expect(snap).toBeTruthy();
    expect(snap.zones.map((z) => z.id)).toEqual(['z-bg003']);
    expect(snap.zones[0].assemblyMethod).toBe('golden_gate');
    expect(snap.pieces.map((p) => p.id).sort()).toEqual(['pc-a', 'pc-b']);
    expect(snap.positions['pc-a']).toEqual({ x: 42, y: 84 });

    // …and the project's primer pool, with its lifecycle intact.
    expect(projectPool().map((p) => p.id)).toEqual(['pr-bg003']);
    const primer = projectPool()[0];
    expect(primer.sequence).toBe('ACGTACGTACGTACGTACGT');
    // An ordered oligo reopens ORDERED. `addPrimerToPool` defaults `status` to
    // 'imported' and an explicit valid status WINS over the record's own, so a
    // caller that omits it silently rewrites the physical lifecycle.
    expect(primer.status).toBe('ordered');
    expect(primer.description).toBe('заказан в IDT');
    expect(primer.sites).toHaveLength(1);
    expect(primer.sites[0]).toMatchObject({ containerId: 'src-bg003', start: 0, end: 20 });
    expect(primer.origin).toMatchObject({ format: 'bodge', sourceRecordIndex: 3 });
  });

  it('a direct pick opens no OS picker and restores the same full state', async () => {
    const file = await realBodgeFile();

    await openBodgeIntoLibrary({
      pick: { file, fileName: 'dropped.bodge', lastModified: 777 },
    });

    expect(openBodgeFilePicker).not.toHaveBeenCalled();
    expect(useStore.getState().currentProjectId).toBe(PROJECT_ID);
    expect(useStore.getState().fileName).toBe('dropped.bodge');
    expect(useStore.getState().libraryEntries['le-bg003']).toBeDefined();
    const snap = await loadSnapshot(PROJECT_ID);
    expect(snap?.zones.map((z) => z.id)).toEqual(['z-bg003']);
    expect(projectPool().map((p) => p.id)).toEqual(['pr-bg003']);
  });

  it('a failed canonical-state hydration reports it and activates no project', async () => {
    failSaveSnapshot = true;
    openBodgeFilePicker.mockResolvedValue({
      file: await realBodgeFile(), handle: null,
      fileName: 'bg003.bodge', lastModified: 555,
    });

    await openBodgeIntoLibrary();

    // A valid assembly must never degrade to an empty opened project.
    expect(useStore.getState().currentProjectId).toBeNull();
    expect(hasKind('success')).toBe(false);
    expect(toasts().length).toBeGreaterThan(0);
    expect(hasKind('error') || hasKind('warning')).toBe(true);
  });

  it('an unreadable file activates no project and never reports success', async () => {
    openBodgeFilePicker.mockResolvedValue({
      file: new Blob(['not a zip at all']), handle: null,
      fileName: 'broken.bodge', lastModified: 1,
    });

    await openBodgeIntoLibrary();

    expect(useStore.getState().currentProjectId).toBeNull();
    expect(hasKind('success')).toBe(false);
    expect(toasts().length).toBeGreaterThan(0);
  });

  it('a rejected durable library write never activates the project', async () => {
    useStore.setState((s) => {
      s.addLibraryEntriesBulk = async () => { throw new Error('quota exceeded'); };
    });
    await pickFile(await realBodgeFile());

    await openBodgeIntoLibrary();

    expect(useStore.getState().currentProjectId).toBeNull();
    expect(hasKind('success')).toBe(false);
    expect(hasKind('error')).toBe(true);
  });

  it('a short/filtered commit receipt is a hydration failure, not a success', async () => {
    // The slice returns the rows it actually persisted. A receipt that does not
    // account for every requested row means part of the library never landed —
    // reporting success from what we SENT is how the loss stayed invisible.
    useStore.setState((s) => { s.addLibraryEntriesBulk = async () => []; });
    await pickFile(await realBodgeFile([libraryEntry('le-a'), libraryEntry('le-b')]));

    await openBodgeIntoLibrary();

    expect(useStore.getState().currentProjectId).toBeNull();
    expect(hasKind('success')).toBe(false);
    expect(hasKind('error')).toBe(true);
  });

  it('rejects a blank or duplicate library id before it is ever committed', async () => {
    const bulk = vi.fn(async (rows) => rows);
    useStore.setState((s) => { s.addLibraryEntriesBulk = bulk; });
    await pickFile(await realBodgeFile([libraryEntry('le-a'), { ...libraryEntry('le-a'), name: 'dup' }]));

    await openBodgeIntoLibrary();

    expect(bulk).not.toHaveBeenCalled();
    expect(useStore.getState().currentProjectId).toBeNull();
    expect(hasKind('error')).toBe(true);

    useStore.setState((s) => { s.toasts = []; });
    await pickFile(await realBodgeFile([libraryEntry('le-a'), { ...libraryEntry(''), name: 'blank' }]));

    await openBodgeIntoLibrary();

    expect(bulk).not.toHaveBeenCalled();
    expect(useStore.getState().currentProjectId).toBeNull();
    expect(hasKind('error')).toBe(true);
  });

  it('a rejected primer write never activates the project', async () => {
    useStore.setState((s) => {
      s.addPrimerToPool = async () => { throw new Error('primer store unavailable'); };
    });
    await pickFile(await realBodgeFile());

    await openBodgeIntoLibrary();

    expect(useStore.getState().currentProjectId).toBeNull();
    expect(hasKind('success')).toBe(false);
    expect(hasKind('error')).toBe(true);
  });

  it('a file with no restorable assembly does not inherit a stale local snapshot', async () => {
    // Same project id, an older local snapshot on disk. The file says this
    // project has no assembly; the leftover must not become its biology.
    await saveSnapshot({
      containers: [], zones: [{ id: 'z-stale', name: 'из прошлой жизни' }],
      pieces: [], operations: [], junctions: [], positions: {}, assemblyDraftPrimers: {},
    }, PROJECT_ID);
    expect((await loadSnapshot(PROJECT_ID)).zones[0].id).toBe('z-stale');

    await pickFile(await emptyV2File(), 'external.bodge');
    await openBodgeIntoLibrary();

    expect(useStore.getState().currentProjectId).toBe(PROJECT_ID);
    expect(await loadSnapshot(PROJECT_ID)).toBeNull();
  });

  it('a failed snapshot clear is the same visible hydration failure', async () => {
    await saveSnapshot({
      containers: [], zones: [{ id: 'z-stale' }],
      pieces: [], operations: [], junctions: [], positions: {}, assemblyDraftPrimers: {},
    }, PROJECT_ID);
    failClearSnapshot = true;

    await pickFile(await emptyV2File(), 'external.bodge');
    await openBodgeIntoLibrary();

    expect(useStore.getState().currentProjectId).toBeNull();
    expect(hasKind('success')).toBe(false);
    expect(hasKind('error')).toBe(true);
  });

  it('picker cancel is a neutral no-op', async () => {
    openBodgeFilePicker.mockResolvedValue(null);

    await openBodgeIntoLibrary();

    expect(useStore.getState().currentProjectId).toBeNull();
    expect(toasts()).toEqual([]);
  });
});
