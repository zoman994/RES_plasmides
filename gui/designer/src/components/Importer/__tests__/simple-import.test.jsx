/**
 * Sprint M-B.1 K3 — Simple-mode import handler integration tests.
 *
 * The handler is pure (no React), so we drive it directly through the real
 * Zustand store. Three flows are covered: single-file import in-project, a
 * multi-file parallel import, and a hash-collision case where the silent
 * autoname applies (no modal).
 *
 * Auto-annotate is mocked because parseFile -> enrichAnnotations isn't on the
 * Simple path (DEC-IMP-09: simple = file features only) but the import
 * sub-graph still pulls auto-annotate.js for advanced consumers.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from '../../../store';
import { resetDBForTests, listLibraryEntries } from '../../../db/dexie-schema';
import { handleSimpleImport } from '../lib/simple-import';
import { computeResourceHash } from '../lib/resource-hash';

vi.mock('../../../auto-annotate', () => ({
  autoAnnotate: vi.fn(({ annotations = [] }) => annotations),
  enrichWithCommonFeatures: vi.fn(async (_seq, anns) => anns),
}));

async function freshDB() {
  const name = `bodgegene-test-${Math.random().toString(36).slice(2)}`;
  const db = resetDBForTests(name);
  await db.delete();
  await db.open();
  return db;
}

async function reset() {
  await freshDB();
  useStore.setState((state) => {
    state.libraryEntries = {};
    state._libraryHydrated = true;
    state.projects = {};
    state.currentProjectId = null;
    state._projectLifecycle = {};
    state.recentProjectIds = [];
    state.toasts = [];
    state.canvas.activeFullscreen = 'importer';
    state.canvas.navStack = [{ fullscreen: 'importer', payload: { target: 'project' } }];
  });
}

function makeParsedItem(overrides = {}) {
  return {
    name: overrides.name || 'pUC19',
    sequence: overrides.sequence || 'ATGCATGCATGCATGCATGCATGC',
    length: (overrides.sequence || 'ATGCATGCATGCATGCATGCATGC').length,
    topology: overrides.topology || 'circular',
    annotations: overrides.annotations || [],
    organism: overrides.organism || '',
    description: overrides.description || '',
    _fileName: overrides._fileName || 'pUC19.gb',
    _fromFileCount: 0,
    _ext: '.gb',
    ...overrides,
  };
}

describe('M-B.1 K3 — handleSimpleImport', () => {
  beforeEach(reset);

  it('1) single-file simple import → instant Library entry pinned to current project', async () => {
    const projectId = useStore.getState().createProject('Test project');
    const item = makeParsedItem({ name: 'pUC19' });

    const result = await handleSimpleImport({
      parsedItems: [item],
      target: 'project',
      currentProjectId: projectId,
      store: useStore.getState(),
    });

    expect(result.added.length).toBe(1);
    expect(result.skipped).toEqual([]);
    const added = result.added[0];
    expect(added.name).toBe('pUC19');
    expect(added._wasCollision).toBe(false);
    expect(added.payload.resourceHash).toMatch(/^sha256:/);

    const entries = Object.values(useStore.getState().libraryEntries);
    expect(entries.length).toBe(1);
    expect(entries[0].kind).toBe('container');
    expect(entries[0].payload.annotations).toEqual([]);

    const proj = useStore.getState().projects[projectId];
    expect(proj.containerIds).toContain(added.id);

    const dbRows = await listLibraryEntries({ kind: 'container' });
    expect(dbRows.length).toBe(1);
    expect(dbRows[0].id).toBe(added.id);
  });

  it('2) multi-file simple import → 3 entries persisted in parallel order', async () => {
    const items = [
      makeParsedItem({ name: 'pET28a', _fileName: 'pET28a.gb', sequence: 'GGGGTTTTAAAACCCCGGGGTTTTAA' }),
      makeParsedItem({ name: 'pUC19', _fileName: 'pUC19.gb', sequence: 'AAAATTTTGGGGCCCCAAAATTTT' }),
      makeParsedItem({ name: 'sfGFP', _fileName: 'sfGFP.fa', sequence: 'CCCCAAAATTTTGGGGCCCCAAAA', topology: 'linear' }),
    ];

    const result = await handleSimpleImport({
      parsedItems: items,
      target: 'library',
      currentProjectId: null,
      store: useStore.getState(),
    });

    expect(result.added.map(a => a.name)).toEqual(['pET28a', 'pUC19', 'sfGFP']);
    expect(result.skipped).toEqual([]);

    const inDb = await listLibraryEntries({ kind: 'container' });
    expect(inDb.length).toBe(3);

    // target='library' must NOT touch any project's containerIds.
    expect(useStore.getState().currentProjectId).toBeNull();
  });

  it('3) hash collision → silent autoname applied (pUC19 → pUC19 (1)), no skip, _wasCollision flagged', async () => {
    const item = makeParsedItem({ name: 'pUC19', sequence: 'ATGCATGCATGCATGCATGCATGC' });

    const first = await handleSimpleImport({
      parsedItems: [item],
      target: 'library',
      currentProjectId: null,
      store: useStore.getState(),
    });
    expect(first.added[0].name).toBe('pUC19');
    expect(first.added[0]._wasCollision).toBe(false);

    const sameHash = await computeResourceHash(item);
    expect(sameHash).toMatch(/^sha256:/);
    expect(first.added[0].payload.resourceHash).toBe(sameHash);

    // Re-import the identical item — same canonical sequence + topology.
    const second = await handleSimpleImport({
      parsedItems: [makeParsedItem({ name: 'pUC19', sequence: 'ATGCATGCATGCATGCATGCATGC' })],
      target: 'library',
      currentProjectId: null,
      store: useStore.getState(),
    });
    expect(second.added.length).toBe(1);
    expect(second.skipped).toEqual([]);
    expect(second.added[0]._wasCollision).toBe(true);
    expect(second.added[0]._baseName).toBe('pUC19');
    expect(second.added[0].name).toBe('pUC19 (1)');

    // Both entries persist.
    const inDb = await listLibraryEntries({ kind: 'container' });
    expect(inDb.length).toBe(2);
    expect(inDb.map(e => e.name).sort()).toEqual(['pUC19', 'pUC19 (1)']);
  });
});
