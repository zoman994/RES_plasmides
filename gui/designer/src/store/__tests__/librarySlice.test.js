import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore, selectVisibleLibraryEntries, selectAllLibraryTags } from '../index';
import { resetDBForTests, getLibraryEntry } from '../../db/dexie-schema';

async function freshDB() {
  const name = `bodgegene-test-${Math.random().toString(36).slice(2)}`;
  const db = resetDBForTests(name);
  await db.delete();
  await db.open();
  return db;
}

function makeEntry(overrides = {}) {
  return {
    id: overrides.id || `e-${Math.random().toString(36).slice(2)}`,
    kind: overrides.kind || 'container',
    name: overrides.name || 'Entry',
    tags: overrides.tags || [],
    addedAt: overrides.addedAt || new Date().toISOString(),
    payload: overrides.payload || {},
    ext: overrides.ext || {},
    ...overrides,
  };
}

async function reset() {
  await freshDB();
  useStore.setState((state) => {
    state.libraryEntries = {};
    state.filterKind = 'container';
    state.filterTopology = 'all';
    state.editingTagsEntryId = null;
    state._libraryHydrated = false;
  });
}

describe('K2 — librarySlice', () => {
  beforeEach(reset);

  it('addLibraryEntry persists to state and IndexedDB', async () => {
    const entry = makeEntry({ id: 'e1', name: 'pUC19', kind: 'container' });
    await useStore.getState().addLibraryEntry(entry);
    const inState = useStore.getState().libraryEntries.e1;
    expect(inState).toBeDefined();
    expect(inState.name).toBe('pUC19');
    const inDB = await getLibraryEntry('e1');
    expect(inDB).toBeDefined();
    expect(inDB.name).toBe('pUC19');
  });

  it('markLibraryEntryPendingDelete sets flag and selector hides entry', async () => {
    await useStore.getState().addLibraryEntry(makeEntry({ id: 'e1' }));
    expect(selectVisibleLibraryEntries(useStore.getState()).map(e => e.id)).toEqual(['e1']);
    useStore.getState().markLibraryEntryPendingDelete('e1');
    expect(useStore.getState().libraryEntries.e1._pendingDelete).toBe(true);
    expect(selectVisibleLibraryEntries(useStore.getState())).toEqual([]);
  });

  it('unmarkLibraryEntryPendingDelete restores entry to visible', async () => {
    await useStore.getState().addLibraryEntry(makeEntry({ id: 'e1' }));
    useStore.getState().markLibraryEntryPendingDelete('e1');
    useStore.getState().unmarkLibraryEntryPendingDelete('e1');
    expect(useStore.getState().libraryEntries.e1._pendingDelete).toBe(false);
    expect(selectVisibleLibraryEntries(useStore.getState()).map(e => e.id)).toEqual(['e1']);
  });

  it('commitLibraryEntryPendingDelete removes from state and IndexedDB', async () => {
    await useStore.getState().addLibraryEntry(makeEntry({ id: 'e1' }));
    useStore.getState().markLibraryEntryPendingDelete('e1');
    await useStore.getState().commitLibraryEntryPendingDelete('e1');
    expect(useStore.getState().libraryEntries.e1).toBeUndefined();
    expect(await getLibraryEntry('e1')).toBeUndefined();
  });

  it('commitLibraryEntryPendingDelete is silent when _pendingDelete is false', async () => {
    await useStore.getState().addLibraryEntry(makeEntry({ id: 'e1' }));
    await useStore.getState().commitLibraryEntryPendingDelete('e1');
    expect(useStore.getState().libraryEntries.e1).toBeDefined();
    expect(await getLibraryEntry('e1')).toBeDefined();
  });

  it('updateLibraryEntryTags updates tags in state and IndexedDB', async () => {
    await useStore.getState().addLibraryEntry(makeEntry({ id: 'e1', tags: ['old'] }));
    await useStore.getState().updateLibraryEntryTags('e1', ['bacterial', 'gfp']);
    expect(useStore.getState().libraryEntries.e1.tags).toEqual(['bacterial', 'gfp']);
    const inDB = await getLibraryEntry('e1');
    expect(inDB.tags).toEqual(['bacterial', 'gfp']);
  });

  it('selectVisibleLibraryEntries filters by kind and topology', async () => {
    await useStore.getState().addLibraryEntry(makeEntry({
      id: 'c1', kind: 'container',
      payload: { topology: 'circular' },
      addedAt: '2026-04-01T00:00:00Z',
    }));
    await useStore.getState().addLibraryEntry(makeEntry({
      id: 'c2', kind: 'container',
      payload: { topology: 'linear' },
      addedAt: '2026-04-02T00:00:00Z',
    }));
    await useStore.getState().addLibraryEntry(makeEntry({
      id: 'p1', kind: 'primer',
      addedAt: '2026-04-03T00:00:00Z',
    }));
    // default: container + all → both containers, sorted desc
    expect(selectVisibleLibraryEntries(useStore.getState()).map(e => e.id)).toEqual(['c2', 'c1']);
    useStore.getState().setLibraryFilterTopology('circular');
    expect(selectVisibleLibraryEntries(useStore.getState()).map(e => e.id)).toEqual(['c1']);
    useStore.getState().setLibraryFilterTopology('all');
    useStore.getState().setLibraryFilterKind('primer');
    expect(selectVisibleLibraryEntries(useStore.getState()).map(e => e.id)).toEqual(['p1']);
  });

  it('selectAllLibraryTags returns distinct tags sorted by frequency desc then alpha', async () => {
    await useStore.getState().addLibraryEntry(makeEntry({ id: '1', tags: ['bacterial', 'gfp'] }));
    await useStore.getState().addLibraryEntry(makeEntry({ id: '2', tags: ['bacterial', 'cds'] }));
    await useStore.getState().addLibraryEntry(makeEntry({ id: '3', tags: ['hidden'] }));
    useStore.getState().markLibraryEntryPendingDelete('3');
    expect(selectAllLibraryTags(useStore.getState())).toEqual(['bacterial', 'cds', 'gfp']);
  });
});
