/**
 * Dexie schema v4 — Sprint M-X.7a v2 K1.
 *
 * DEC-MX7A-V2-03: bump from v3 to v4 wipes IndexedDB. No migration —
 * dev environment, no live data. Pre-K1 entries are gone after the
 * upgrade so the new entry shape (zone / projectId / inLabStock /
 * parentEntry*) starts clean.
 */
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, it, expect } from 'vitest';
import {
  DB_VERSION,
  resetDBForTests,
  putLibraryEntry,
  putPrimer,
  listLibraryEntries,
  listPrimers,
} from '../dexie-schema';

describe('M-X.7a v2 K1 — dexie-schema v4', () => {
  it('DB_VERSION is 4', () => {
    expect(DB_VERSION).toBe(4);
  });

  it('fresh v4 DB starts with empty library + primers tables', async () => {
    const name = `bodgegene-test-${Math.random().toString(36).slice(2)}`;
    const db = resetDBForTests(name);
    await db.delete();
    await db.open();
    const lib = await listLibraryEntries();
    const pr = await listPrimers();
    expect(lib).toEqual([]);
    expect(pr).toEqual([]);
  });

  it('upgrading from v3 with existing entries wipes them (DEC-MX7A-V2-03)', async () => {
    const name = `bodgegene-upgrade-${Math.random().toString(36).slice(2)}`;
    // Step 1: open v3-shape database directly via raw Dexie, seed entries.
    const v3 = new Dexie(name);
    v3.version(3).stores({
      projects: 'id, name, createdAt, updatedAt',
      containers: 'id, projectId, kind, name, [projectId+kind]',
      library: 'id, kind, addedAt, [kind+addedAt], *tags',
      primers: 'id, name, projectId, status, addedAt, resourceHash, [projectId+status]',
    });
    await v3.open();
    await v3.table('library').put({ id: 'old1', kind: 'container', name: 'legacy', addedAt: '2026-05-01', payload: {}, tags: [] });
    await v3.table('primers').put({ id: 'p-old', kind: 'primer', name: 'leg-pr', projectId: null, status: 'imported', addedAt: '2026-05-01' });
    v3.close();

    // Step 2: reopen via the app's BodgeDB (now v4) — onUpgrade should wipe.
    const v4 = resetDBForTests(name);
    await v4.open();
    const lib = await listLibraryEntries();
    const pr = await listPrimers();
    expect(lib).toEqual([]);
    expect(pr).toEqual([]);
  });

  it('post-upgrade writes use the new shape fields', async () => {
    const name = `bodgegene-upgrade-write-${Math.random().toString(36).slice(2)}`;
    const db = resetDBForTests(name);
    await db.delete();
    await db.open();
    await putLibraryEntry({
      id: 'e1', kind: 'container', name: 'X', addedAt: '2026-05-09',
      payload: { sequence: 'A', length: 1 }, tags: [],
      zone: 'loose', projectId: null, inLabStock: false,
      parentEntryId: null, parentEntryHash: null,
    });
    const got = (await listLibraryEntries())[0];
    expect(got.zone).toBe('loose');
    expect(got.inLabStock).toBe(false);
    expect(got.parentEntryId).toBeNull();
  });
});
