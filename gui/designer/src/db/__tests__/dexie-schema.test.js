import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { BodgeDB, resetDBForTests } from '../dexie-schema';
import {
  putProject, getProject, listAllProjects, listRecentProjects, deleteProject, clearAll,
} from '../dexie-schema';

let db;

async function freshDB() {
  const name = `bodgegene-test-${Math.random().toString(36).slice(2)}`;
  db = resetDBForTests(name);
  await db.delete();
  await db.open();
  return db;
}

describe('K1 — Dexie schema v4 (M-X.7a v2 K1 bump from v3)', () => {
  beforeEach(async () => {
    await freshDB();
  });

  it('opens schema with projects + containers + library + primers tables', async () => {
    expect(db.tables.map(t => t.name).sort()).toEqual(
      ['containers', 'library', 'primers', 'projects'],
    );
    expect(db.verno).toBe(4);
  });

  it('round-trips a project record via put/get', async () => {
    const rec = { id: 'p-1', name: 'Demo', createdAt: '2026-04-30T00:00:00Z', updatedAt: '2026-04-30T00:00:00Z', body: { tags: ['a'] } };
    await putProject(rec);
    const got = await getProject('p-1');
    expect(got).toMatchObject({ id: 'p-1', name: 'Demo' });
    expect(got.body.tags).toEqual(['a']);
  });

  it('listRecentProjects sorts by updatedAt desc and respects limit', async () => {
    await putProject({ id: 'a', name: 'A', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z' });
    await putProject({ id: 'b', name: 'B', createdAt: '2026-04-02T00:00:00Z', updatedAt: '2026-04-15T00:00:00Z' });
    await putProject({ id: 'c', name: 'C', createdAt: '2026-04-03T00:00:00Z', updatedAt: '2026-04-10T00:00:00Z' });
    const recent = await listRecentProjects(2);
    expect(recent.map(r => r.id)).toEqual(['b', 'c']);
  });

  it('deleteProject removes the project and its containers', async () => {
    await putProject({ id: 'p-1', name: 'P1', createdAt: 'x', updatedAt: 'x' });
    await db.containers.put({ id: 'c-1', projectId: 'p-1', kind: 'molecule', name: 'cont' });
    await db.containers.put({ id: 'c-2', projectId: 'p-1', kind: 'molecule', name: 'cont2' });
    await deleteProject('p-1');
    expect(await getProject('p-1')).toBeUndefined();
    const left = await db.containers.where('projectId').equals('p-1').toArray();
    expect(left.length).toBe(0);
  });

  it('clearAll empties both tables', async () => {
    await putProject({ id: 'p-1', name: 'A', createdAt: 'x', updatedAt: 'x' });
    await db.containers.put({ id: 'c-1', projectId: 'p-1', kind: 'molecule', name: 'cont' });
    await clearAll();
    expect((await listAllProjects()).length).toBe(0);
    expect(await db.containers.count()).toBe(0);
  });

  it('[projectId+kind] compound index queries containers', async () => {
    await db.containers.bulkPut([
      { id: 'c-1', projectId: 'p-1', kind: 'molecule', name: 'a' },
      { id: 'c-2', projectId: 'p-1', kind: 'molecule', name: 'b' },
      { id: 'c-3', projectId: 'p-2', kind: 'molecule', name: 'c' },
    ]);
    const filtered = await db.containers.where('[projectId+kind]').equals(['p-1', 'molecule']).toArray();
    expect(filtered.map(c => c.id).sort()).toEqual(['c-1', 'c-2']);
  });
});
