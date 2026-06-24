/**
 * Sprint M-B.1 K1 — primerSlice (DEC-IMP-11 ⚓ unified pool).
 *
 * Verifies actions, selectors, and the v2→v3 migration path that copies
 * legacy library kind='primer' rows into the new `primers` table with
 * default metadata.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore, selectPrimerPool } from '../index';
import {
  resetDBForTests,
  getPrimer,
  putLibraryEntry,
} from '../../db/dexie-schema';

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
    state.primersById = {};
    state._primersHydrated = false;
  });
}

function makePrimer(overrides = {}) {
  return {
    id: overrides.id || `p-${Math.random().toString(36).slice(2)}`,
    name: overrides.name || 'Fwd-1',
    sequence: overrides.sequence || 'ACGTACGTACGT',
    tm: overrides.tm ?? 60.5,
    length: overrides.length ?? 12,
    direction: overrides.direction ?? 'forward',
    resourceHash: overrides.resourceHash || null,
    ...overrides,
  };
}

describe('K1 — primerSlice (unified pool)', () => {
  beforeEach(reset);

  it('addPrimerToPool persists to state and IndexedDB with defaults', async () => {
    const p = makePrimer({ id: 'p1' });
    await useStore.getState().addPrimerToPool({
      primer: p, projectId: null, status: 'imported', origin: { kind: 'paste' },
    });
    const inState = useStore.getState().primersById.p1;
    expect(inState).toBeDefined();
    expect(inState.projectId).toBeNull();
    expect(inState.status).toBe('imported');
    expect(inState.origin.kind).toBe('paste');
    expect(inState.addedAt).toBeTruthy();
    const inDB = await getPrimer('p1');
    expect(inDB).toBeDefined();
    expect(inDB.sequence).toBe('ACGTACGTACGT');
  });

  it('getPrimerPoolByFilter filters by projectId (null = library, id = project)', async () => {
    await useStore.getState().addPrimerToPool({
      primer: makePrimer({ id: 'lib1' }), projectId: null, status: 'imported',
      origin: { kind: 'paste' },
    });
    await useStore.getState().addPrimerToPool({
      primer: makePrimer({ id: 'proj1' }), projectId: 'PROJ-A', status: 'imported',
      origin: { kind: 'file_import', sourceFile: 'pET28a.dna' },
    });
    await useStore.getState().addPrimerToPool({
      primer: makePrimer({ id: 'proj2' }), projectId: 'PROJ-A', status: 'designed',
      origin: { kind: 'designed' },
    });

    const lib = useStore.getState().getPrimerPoolByFilter({ projectId: null });
    expect(lib.map(r => r.id)).toEqual(['lib1']);

    const projAll = useStore.getState().getPrimerPoolByFilter({ projectId: 'PROJ-A' });
    expect(projAll.map(r => r.id).sort()).toEqual(['proj1', 'proj2']);

    const projDesigned = useStore.getState().getPrimerPoolByFilter({
      projectId: 'PROJ-A', status: 'designed',
    });
    expect(projDesigned.map(r => r.id)).toEqual(['proj2']);

    const all = useStore.getState().getPrimerPoolByFilter();
    expect(all.length).toBe(3);
  });

  it('checkPrimerDedup finds primers by resourceHash (in-mem then Dexie)', async () => {
    await useStore.getState().addPrimerToPool({
      primer: makePrimer({ id: 'p1', resourceHash: 'sha256:abc' }),
      projectId: null, status: 'imported', origin: { kind: 'paste' },
    });
    const hit = await useStore.getState().checkPrimerDedup('sha256:abc');
    expect(hit?.id).toBe('p1');
    const miss = await useStore.getState().checkPrimerDedup('sha256:zzz');
    expect(miss).toBeUndefined();
    const noHash = await useStore.getState().checkPrimerDedup(null);
    expect(noHash).toBeUndefined();
  });

  it('promotePrimerStatus updates state and persists', async () => {
    await useStore.getState().addPrimerToPool({
      primer: makePrimer({ id: 'p1' }),
      projectId: 'PROJ-A', status: 'imported', origin: { kind: 'file_import' },
    });
    const updated = await useStore.getState().promotePrimerStatus('p1', 'ordered');
    expect(updated.status).toBe('ordered');
    expect(useStore.getState().primersById.p1.status).toBe('ordered');
    const inDB = await getPrimer('p1');
    expect(inDB.status).toBe('ordered');
  });

  it('promotePrimerStatus rejects unknown status', async () => {
    await useStore.getState().addPrimerToPool({
      primer: makePrimer({ id: 'p1' }),
      projectId: null, status: 'imported', origin: { kind: 'paste' },
    });
    const out = await useStore.getState().promotePrimerStatus('p1', 'bogus');
    expect(out).toBeNull();
    expect(useStore.getState().primersById.p1.status).toBe('imported');
  });

  it('selectPrimerPool exposes the same filter contract', async () => {
    await useStore.getState().addPrimerToPool({
      primer: makePrimer({ id: 'p1' }), projectId: 'PROJ-A',
      status: 'imported', origin: { kind: 'designed' },
    });
    const view = selectPrimerPool(useStore.getState(), { projectId: 'PROJ-A' });
    expect(view.map(r => r.id)).toEqual(['p1']);
    const orphans = selectPrimerPool(useStore.getState(), { projectId: null });
    expect(orphans).toEqual([]);
  });
});

describe('M-X.7a v2 K1 — Dexie schema v4 wipes legacy primers (DEC-MX7A-V2-03)', () => {
  // The v2→v3 primer-migration code path is preserved in
  // dexie-schema.js (defensive — chained upgrade still runs) but
  // v3→v4 wipes everything per DEC-MX7A-V2-03. Tests below reflect
  // post-K1 reality: any pre-v4 entries are gone after the
  // upgrade.
  it('opens at v7 with all tables (+customEnzymes/+enzymeSets, RS-C1)', async () => {
    const db = await freshDB();
    expect(db.tables.map(t => t.name).sort()).toEqual(
      ['commonFeatures', 'containers', 'customEnzymes', 'enzymeSets', 'library', 'primers', 'projects', 'snippets'],
    );
    expect(db.verno).toBe(7);
  });

  it('upgrade chain v2 → v4 wipes legacy library primers (no migration survives)', async () => {
    // Open at v2 first, seed legacy primer entries, then re-open
    // via the app's BodgeDB which now runs through v3 (migrate) →
    // v4 (wipe). End state: primers + library tables empty.
    const Dexie = (await import('dexie')).default;
    const name = `bodgegene-mig-${Math.random().toString(36).slice(2)}`;
    const v2 = new Dexie(name);
    v2.version(2).stores({
      projects: 'id, name, createdAt, updatedAt',
      containers: 'id, projectId, kind, name, [projectId+kind]',
      library: 'id, kind, addedAt, [kind+addedAt], *tags',
    });
    await v2.open();
    await v2.table('library').put({
      id: 'lib-p1', kind: 'primer', name: 'M13 Forward', tags: [],
      addedAt: '2026-04-30T11:00:00Z',
      payload: { sequence: 'GTAAAACGACGGCCAGT', tm: 58.2, length: 17 },
      ext: {},
    });
    v2.close();

    // Re-open via app schema — chains upgrades v2 → v3 → v4.
    const db = resetDBForTests(name);
    await db.open();

    // v3 upgrade migrated the primer; v4 wipe cleared both tables.
    expect(await db.table('primers').count()).toBe(0);
    expect(await db.table('library').count()).toBe(0);
  });

  it('fresh v4 install leaves the primers table empty', async () => {
    await freshDB();
    // Add a library container; it must NOT show up in primers.
    await putLibraryEntry({
      id: 'c1', kind: 'container', name: 'pUC19', tags: [],
      addedAt: '2026-05-01T00:00:00Z',
      payload: { sequence: 'ATGC', topology: 'circular', length: 4 },
    });
    await useStore.getState().hydratePrimers();
    expect(Object.keys(useStore.getState().primersById)).toEqual([]);
  });
});
