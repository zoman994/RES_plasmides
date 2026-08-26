import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  resetDBForTests,
  putLibraryEntry,
  getLibraryEntry,
  listLibraryEntries,
  deleteLibraryEntry,
  listAllLibraryTags,
} from '../dexie-schema';

let db;

async function freshDB() {
  const name = `bodgegene-test-${Math.random().toString(36).slice(2)}`;
  db = resetDBForTests(name);
  await db.delete();
  await db.open();
  return db;
}

describe('K1 — Dexie schema v2 + library table', () => {
  beforeEach(async () => {
    await freshDB();
  });

  // PRIMER-LIVE-1 bumped v7 -> v8 additively; the library table is untouched.
  it('opens schema v8 with projects + containers + library + primers + snippets + commonFeatures + custom-enzyme tables', async () => {
    expect(db.tables.map(t => t.name).sort()).toEqual(
      ['commonFeatures', 'containers', 'customEnzymes', 'enzymeSets', 'library', 'primers', 'projects', 'snippets'],
    );
    expect(db.verno).toBe(8);
    // The bump must not have disturbed the library schema it rides along with.
    expect(db.table('library').schema.indexes.map((i) => i.name)).toContain('kind');
  });

  it('listLibraryEntries({ kind: "primer" }) returns only primer entries', async () => {
    await putLibraryEntry({
      id: 'lib-c1', kind: 'container', name: 'Plasmid A',
      tags: ['bacterial'], addedAt: '2026-04-30T10:00:00Z',
      payload: { sequence: 'ATGC', topology: 'circular', length: 4 },
      ext: {},
    });
    await putLibraryEntry({
      id: 'lib-p1', kind: 'primer', name: 'Fwd-1',
      tags: [], addedAt: '2026-04-30T11:00:00Z',
      payload: { sequence: 'AAAA' },
      ext: {},
    });
    const primers = await listLibraryEntries({ kind: 'primer' });
    expect(primers.map(e => e.id)).toEqual(['lib-p1']);
    const containers = await listLibraryEntries({ kind: 'container' });
    expect(containers.map(e => e.id)).toEqual(['lib-c1']);
  });

  it('listLibraryEntries() returns both kinds sorted by addedAt desc', async () => {
    await putLibraryEntry({
      id: 'a', kind: 'container', name: 'A', tags: [],
      addedAt: '2026-04-01T00:00:00Z', payload: {}, ext: {},
    });
    await putLibraryEntry({
      id: 'b', kind: 'primer', name: 'B', tags: [],
      addedAt: '2026-04-15T00:00:00Z', payload: {}, ext: {},
    });
    await putLibraryEntry({
      id: 'c', kind: 'container', name: 'C', tags: [],
      addedAt: '2026-04-10T00:00:00Z', payload: {}, ext: {},
    });
    const all = await listLibraryEntries();
    expect(all.map(e => e.id)).toEqual(['b', 'c', 'a']);
  });

  it('listLibraryEntries excludes _pendingDelete by default, includes with includeDeleted', async () => {
    await putLibraryEntry({
      id: 'a', kind: 'container', name: 'A', tags: [],
      addedAt: '2026-04-01T00:00:00Z', payload: {},
    });
    await putLibraryEntry({
      id: 'b', kind: 'container', name: 'B', tags: [],
      addedAt: '2026-04-02T00:00:00Z', payload: {},
      _pendingDelete: true,
    });
    const visible = await listLibraryEntries();
    expect(visible.map(e => e.id)).toEqual(['a']);
    const all = await listLibraryEntries({ includeDeleted: true });
    expect(all.map(e => e.id).sort()).toEqual(['a', 'b']);
  });

  it('deleteLibraryEntry removes the row', async () => {
    await putLibraryEntry({
      id: 'x', kind: 'container', name: 'X', tags: [],
      addedAt: '2026-04-01T00:00:00Z', payload: {},
    });
    expect(await getLibraryEntry('x')).toBeDefined();
    await deleteLibraryEntry('x');
    expect(await getLibraryEntry('x')).toBeUndefined();
  });

  it('listAllLibraryTags returns distinct tags from non-deleted entries', async () => {
    await putLibraryEntry({
      id: '1', kind: 'container', name: '1', tags: ['bacterial', 'gfp'],
      addedAt: '2026-04-01T00:00:00Z', payload: {},
    });
    await putLibraryEntry({
      id: '2', kind: 'container', name: '2', tags: ['bacterial', 'cds'],
      addedAt: '2026-04-02T00:00:00Z', payload: {},
    });
    await putLibraryEntry({
      id: '3', kind: 'primer', name: '3', tags: ['hidden'],
      addedAt: '2026-04-03T00:00:00Z', payload: {},
      _pendingDelete: true,
    });
    const tags = (await listAllLibraryTags()).sort();
    expect(tags).toEqual(['bacterial', 'cds', 'gfp']);
  });
});
