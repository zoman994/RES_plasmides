/**
 * `version` is a STORE INVARIANT, not a field some callers remember to set.
 *
 * A LibraryEntry without a top-level `version` is a molecule nobody can name:
 * `entryRevision` (search-document-adapters) returns null for it, so
 * `entryToDocument` stamps no `ref.revision`, so the stale-jump guard has
 * nothing to compare and a locus measured on the pre-edit molecule can be
 * applied to the post-edit one. Every canonical ingress must therefore hand
 * the store an entry that carries a finite version:
 *
 *   • addLibraryEntry            (single add / FEAT-EXTRACT / assembly picker)
 *   • addLibraryEntriesBulk      (.bodge project import, onboarding)
 *   • buildLibraryEntry          (file / paste import — the root builder)
 *   • cloneEntryToActiveProject  (duplication)
 *   • hydrateLibrary             (legacy rows already on disk)
 *
 * The project-import case is driven through the REAL flow: a real .bodge is
 * written with writeBodgeV2, read back with the real readBodge, and fed to the
 * real `openBodgeIntoLibrary` — only the OS file picker is stubbed.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from '../index';
import { resetDBForTests, getLibraryEntry, putLibraryEntry } from '../../db/dexie-schema';
import { entryToDocument } from '../../lib/search-document-adapters';
import { buildLibraryEntry } from '../../components/Library/lib/build-library-entry';
import { writeBodgeV2 } from '../../lib/bodge-zip';

vi.mock('../../lib/file-system', () => ({
  openBodgeFilePicker: vi.fn(),
}));
import { openBodgeFilePicker } from '../../lib/file-system';
import { openBodgeIntoLibrary } from '../../components/StartScreen/lib/open-bodge';

async function freshDB() {
  const name = `bodgegene-ver-${Math.random().toString(36).slice(2)}`;
  const db = resetDBForTests(name);
  await db.delete();
  await db.open();
  return db;
}

async function reset() {
  await freshDB();
  useStore.setState((state) => {
    state.libraryEntries = {};
    state._libraryHydrated = false;
    state.projects = {};
    state.currentProjectId = null;
    state.toasts = [];
  });
}

/** The doc the search layer actually builds from a stored entry. */
function revisionOf(id) {
  return entryToDocument(useStore.getState().libraryEntries[id]).ref.revision;
}

describe('library entry `version` — the store invariant', () => {
  beforeEach(reset);

  it('addLibraryEntry stamps a finite version, in state and on disk', async () => {
    await useStore.getState().addLibraryEntry({
      id: 'e1', kind: 'container', name: 'pUC19', payload: { sequence: 'ACGT' },
    });
    const inState = useStore.getState().libraryEntries.e1;
    expect(Number.isFinite(inState.version)).toBe(true);
    expect(inState.version).toBe(1);
    const inDB = await getLibraryEntry('e1');
    expect(inDB.version).toBe(1);
    expect(revisionOf('e1')).toBe(1);
  });

  it('addLibraryEntry never overwrites a version the caller supplied', async () => {
    await useStore.getState().addLibraryEntry({
      id: 'e2', kind: 'container', name: 'saved-thrice', version: 3, payload: {},
    });
    expect(useStore.getState().libraryEntries.e2.version).toBe(3);
    expect(revisionOf('e2')).toBe(3);
  });

  it('addLibraryEntriesBulk stamps a version on a .bodge-shaped row (origin, no version)', async () => {
    // The exact shape a foreign / older .bodge carries: a top-level `origin`
    // and no `version`. This is the class hydrate can never repair, because
    // deriveOriginForExisting short-circuits on `origin`.
    await useStore.getState().addLibraryEntriesBulk([
      { id: 'b1', kind: 'container', name: 'from-bodge', origin: { kind: 'file_import' }, payload: { sequence: 'ACGT' } },
    ]);
    const inState = useStore.getState().libraryEntries.b1;
    expect(Number.isFinite(inState.version)).toBe(true);
    expect(inState.version).toBe(1);
    const inDB = await getLibraryEntry('b1');
    expect(inDB.version).toBe(1);
    expect(revisionOf('b1')).toBe(1);
  });

  it('hydrateLibrary backfills a legacy row that carries origin but no version', async () => {
    // Seed Dexie BEHIND the store so the persisted row is genuinely version-less.
    await putLibraryEntry({
      id: 'leg-origin', kind: 'container', name: 'legacy',
      addedAt: '2026-04-01T00:00:00Z',
      origin: { kind: 'file_import', sourceFileName: 'legacy.gb' },
      payload: { sequence: 'ACGT' },
    });
    await useStore.getState().hydrateLibrary();
    const hydrated = useStore.getState().libraryEntries['leg-origin'];
    expect(hydrated).toBeDefined();
    expect(Number.isFinite(hydrated.version)).toBe(true);
    expect(hydrated.version).toBe(1);
    expect(revisionOf('leg-origin')).toBe(1);
    // The origin it arrived with is untouched.
    expect(hydrated.origin.kind).toBe('file_import');
  });

  it('hydrateLibrary leaves an already-numbered version alone', async () => {
    await putLibraryEntry({
      id: 'leg-v3', kind: 'container', name: 'saved-twice',
      origin: { kind: 'manual_edit' }, version: 3, payload: {},
    });
    await useStore.getState().hydrateLibrary();
    expect(useStore.getState().libraryEntries['leg-v3'].version).toBe(3);
  });

  it('a file import carries a version — builder output, and after the project stamp', async () => {
    // Verbatim reproduction of LibraryWorkspace.importFiles (LibraryWorkspace.jsx:189-195):
    // build → stamp projectId → stamp a top-level file_import origin → addLibraryEntry.
    const entry = buildLibraryEntry(
      { sequence: 'ACGTACGT', length: 8, topology: 'circular', annotations: [] },
      'imported.gb', null,
    );
    expect(Number.isFinite(entry.version)).toBe(true);
    entry.projectId = 'proj-1';
    entry.origin = { kind: 'file_import', sourceFileName: 'imported.gb', importedAt: '2026-07-31T00:00:00Z' };
    await useStore.getState().addLibraryEntry(entry);
    const stored = useStore.getState().libraryEntries[entry.id];
    expect(Number.isFinite(stored.version)).toBe(true);
    expect(entryToDocument(stored).ref.revision).toBe(stored.version);
  });

  it('duplication carries a version even when the source has none', async () => {
    useStore.setState((s) => {
      s.libraryEntries['src-nover'] = {
        id: 'src-nover', kind: 'container', name: 'src', payload: { sequence: 'ACGT' },
      };
      s.projects['p1'] = { id: 'p1', name: 'P' };
      s.currentProjectId = 'p1';
    });
    const r = await useStore.getState().cloneEntryToActiveProject('src-nover');
    expect(r.ok).toBe(true);
    expect(useStore.getState().libraryEntries[r.id].version).toBe(1);
    expect(revisionOf(r.id)).toBe(1);
  });

  it('the REAL .bodge project import lands entries that carry a version', async () => {
    const blob = await writeBodgeV2({
      projectMeta: {
        id: 'p01IMPORTED', name: 'Imported Project',
        createdAt: '2026-04-01T10:00:00.000Z', tags: [],
      },
      containers: [], pieces: [], operations: [], zones: [], junctions: [], primers: [],
      // A row exactly as an older build serialised it: origin present, version absent.
      libraryEntries: [
        {
          id: 'le-imported', kind: 'container', name: 'pFromBodge',
          origin: { kind: 'file_import', sourceFileName: 'pFromBodge.gb' },
          payload: { sequence: 'ATGCATGCATGC', length: 12, topology: 'circular', annotations: [] },
        },
      ],
    });
    openBodgeFilePicker.mockResolvedValue({
      file: blob, handle: null, fileName: 'Imported.bodge', lastModified: 123,
    });

    await openBodgeIntoLibrary();

    const landed = useStore.getState().libraryEntries['le-imported'];
    expect(landed).toBeDefined();
    expect(Number.isFinite(landed.version)).toBe(true);
    expect(landed.version).toBe(1);
    // Linking to the loaded project still happened.
    expect(landed.projectId).toBe('p01IMPORTED');
    // And it is durable, not only in memory.
    const inDB = await getLibraryEntry('le-imported');
    expect(inDB.version).toBe(1);
    expect(revisionOf('le-imported')).toBe(1);
  });
});
