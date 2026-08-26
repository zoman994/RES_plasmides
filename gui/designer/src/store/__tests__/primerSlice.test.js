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
import { PRIMER_SCOPE_GLOBAL, makePrimerKey } from '../../lib/primer-identity';

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
    const p = makePrimer({ id: 'p1', bindingModel: 'aligned-v1' });
    await useStore.getState().addPrimerToPool({
      primer: p, projectId: null, status: 'imported', origin: { kind: 'paste' },
    });
    const inState = useStore.getState().primersById.p1;
    expect(inState).toBeDefined();
    expect(inState.projectId).toBeNull();
    expect(inState.status).toBe('imported');
    expect(inState.origin.kind).toBe('paste');
    expect(inState.bindingModel).toBe('aligned-v1');
    expect(inState.addedAt).toBeTruthy();
    const inDB = await getPrimer('p1');
    expect(inDB).toBeDefined();
    expect(inDB.sequence).toBe('ACGTACGTACGT');
    expect(inDB.bindingModel).toBe('aligned-v1');
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
  // PRIMER-LIVE-1 bumped v7 → v8. The bump is ADDITIVE: same tables, and
  // `primers` gains the scope indexes that let a project record and a personal
  // inventory record with the same raw id coexist.
  it('opens at v8 with all tables and the primer scope indexes', async () => {
    const db = await freshDB();
    expect(db.tables.map(t => t.name).sort()).toEqual(
      ['commonFeatures', 'containers', 'customEnzymes', 'enzymeSets', 'library', 'primers', 'projects', 'snippets'],
    );
    expect(db.verno).toBe(8);
    const primerIdx = db.table('primers').schema.indexes.map((i) => i.name).sort();
    expect(primerIdx).toContain('scope');
    expect(primerIdx).toContain('rawId');
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

/**
 * PRIMER-LIVE-1B — editing a primer must stay ONE primer.
 *
 * The dialog behind «E» / double-click sends a patch that never mentions the
 * anchor, because an ordinary edit must not re-anchor the oligo. That makes
 * two things load-bearing at this layer: the record keeps its scope-qualified
 * key (so the pool does not gain a second entry, and a global tube with the
 * same raw id is not overwritten), and `sites` survive a patch that omits them.
 *
 * Existing behaviour, pinned here because the edit path above now depends on
 * it; sensitivity is shown by mutation, not by the test being new.
 */
describe('editPrimerInPlace keeps one record under one key', () => {
  beforeEach(reset);

  const SITES = [{
    id: 's1',
    target: { entryId: 'e1', resourceHash: 'h1', topology: 'linear' },
    location: { kind: 'single', segments: [{ start: 120, end: 132 }] },
    strand: 1,
    annealedSequence: 'TTAGCATCGATT',
    tail: '',
  }];

  it('a rename + substitution does not add a record and keeps the anchor', async () => {
    await useStore.getState().addPrimerToPool({
      primer: makePrimer({
        id: 'prm-1', sequence: 'TTAGCATCGATT', bindingSequence: 'TTAGCATCGATT',
        sites: SITES,
      }),
      projectId: 'PROJ-A', status: 'designed', origin: { kind: 'selection' },
    });
    const keysBefore = Object.keys(useStore.getState().primersById).sort();
    expect(keysBefore).toEqual(['prm-1']); // project scope → bare raw id

    const mutated = 'ATAGCATCGATT'; // one base, same length
    const next = await useStore.getState().editPrimerInPlace('prm-1', {
      name: 'M13-fwd', sequence: mutated, bindingSequence: mutated, tail: '',
      direction: 'forward', bindingModel: 'aligned-v1',
      // deliberately no `sites` — this is what the edit dialog sends
    });

    expect(Object.keys(useStore.getState().primersById).sort()).toEqual(keysBefore);
    expect(next.id).toBe('prm-1');
    expect(next.bindingSequence).toBe(mutated);
    expect(next.bindingModel).toBe('aligned-v1');
    expect(next.name).toBe('M13-fwd');
    // The anchor is untouched, so the mismatch stays computable against it.
    expect(next.sites).toEqual(SITES);
    expect((await getPrimer('prm-1')).bindingSequence).toBe(mutated);
    expect((await getPrimer('prm-1')).bindingModel).toBe('aligned-v1');
  });

  it('clears stale physical identity after the oligo sequence changes', async () => {
    await useStore.getState().addPrimerToPool({
      primer: makePrimer({
        id: 'prm-hash', sequence: 'TTAGCATCGATT', bindingSequence: 'TTAGCATCGATT',
        resourceHash: 'sha256:old-physical-oligo', sites: SITES,
      }),
      projectId: 'PROJ-A', status: 'designed', origin: { kind: 'selection' },
    });

    const next = await useStore.getState().editPrimerInPlace('prm-hash', {
      sequence: 'TTAGCATCGAATT', bindingSequence: 'TTAGCATCGAATT',
      bindingModel: 'aligned-v1', tail: '',
    });

    expect(next.resourceHash).toBeNull();
    expect((await getPrimer('prm-hash')).resourceHash).toBeNull();
  });

  it('accepts an explicit unknown Tm for a gapped aligned edit', async () => {
    await useStore.getState().addPrimerToPool({
      primer: makePrimer({
        id: 'prm-gap', sequence: 'TTAGCATCGATT', bindingSequence: 'TTAGCATCGATT',
        tm: 61.4, sites: SITES,
      }),
      projectId: 'PROJ-A', status: 'designed', origin: { kind: 'selection' },
    });

    const next = await useStore.getState().editPrimerInPlace('prm-gap', {
      sequence: 'TTAGCATCGAATT', bindingSequence: 'TTAGCATCGAATT',
      bindingModel: 'aligned-v1', tail: '', tm: null,
    });

    expect(next.tm).toBeNull();
    expect((await getPrimer('prm-gap')).tm).toBeNull();
  });

  it('does not reach across scopes to a global tube with the same raw id', async () => {
    await useStore.getState().addPrimerToPool({
      primer: makePrimer({ id: 'dup', sequence: 'TTAGCATCGATT', sites: SITES }),
      projectId: 'PROJ-A', status: 'designed', origin: { kind: 'selection' },
    });
    await useStore.getState().addPrimerToPool({
      primer: makePrimer({ id: 'dup', sequence: 'GGGGGGGGGGGG' }),
      projectId: null, status: 'received', origin: { kind: 'inventory' },
      scope: PRIMER_SCOPE_GLOBAL,
    });
    const keys = Object.keys(useStore.getState().primersById).sort();
    expect(keys).toEqual(['dup', makePrimerKey(PRIMER_SCOPE_GLOBAL, 'dup')].sort());

    await useStore.getState().editPrimerInPlace('dup', { name: 'renamed-project-one' });

    expect(Object.keys(useStore.getState().primersById).sort()).toEqual(keys);
    expect(useStore.getState().primersById.dup.name).toBe('renamed-project-one');
    // The freezer record keeps its own name and its own oligo.
    const global = useStore.getState().primersById[makePrimerKey(PRIMER_SCOPE_GLOBAL, 'dup')];
    expect(global.name).not.toBe('renamed-project-one');
    expect(global.sequence).toBe('GGGGGGGGGGGG');
  });
});
