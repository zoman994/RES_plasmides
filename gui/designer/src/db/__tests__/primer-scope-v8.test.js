/**
 * primer-scope-v8 — PRIMER-LIVE-1 root 1, persistence side.
 *
 * The freezer and the project are two different registers. A project record
 * and a personal-inventory record that happen to share a raw id are two
 * different things, and the store must be able to hold both at once — an id
 * collision that silently overwrites one of them destroys either the user's
 * design or their record of a real tube.
 *
 * Schema v8 is additive: it indexes the new scope and stamps every legacy row
 * with the project scope it always implicitly had. No wipe — the v4 wipe was a
 * dev-environment decision, not a licence to repeat it.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../../store';
import { resetDBForTests, getDB, listPrimers, DB_VERSION } from '../dexie-schema';
import { PRIMER_SCOPE_GLOBAL, PRIMER_SCOPE_PROJECT } from '../../lib/primer-identity';

async function freshDB() {
  const db = resetDBForTests(`bodgegene-test-${Math.random().toString(36).slice(2)}`);
  await db.delete();
  await db.open();
  return db;
}

beforeEach(async () => {
  await freshDB();
  useStore.setState((state) => {
    state.primersById = {};
    state._primersHydrated = false;
  });
});

describe('schema v8 — primer scope', () => {
  it('declares version 8 and indexes scope', () => {
    expect(DB_VERSION).toBe(8);
    const idx = getDB().primers.schema.indexes.map((i) => i.name);
    expect(idx).toContain('scope');
  });
});

describe('a project record and a global record can share a raw id', () => {
  it('keeps both in the pool without overwriting either', async () => {
    const add = useStore.getState().addPrimerToPool;
    await add({
      primer: { id: 'shared', name: 'project copy', sequence: 'ACGTACGTAC' },
      projectId: 'proj-1',
      status: 'designed',
    });
    await add({
      primer: {
        id: 'shared', name: 'freezer tube', sequence: 'ACGTACGTAC',
        scope: PRIMER_SCOPE_GLOBAL,
      },
      status: 'received',
    });

    const pool = Object.values(useStore.getState().primersById);
    const names = pool.map((p) => p.name).sort();
    expect(names).toEqual(['freezer tube', 'project copy']);

    const rows = await listPrimers();
    expect(rows).toHaveLength(2);
  });

  it('scopes the store key so the project record keeps the bare raw id', async () => {
    const add = useStore.getState().addPrimerToPool;
    await add({
      primer: { id: 'shared', name: 'project copy', sequence: 'ACGTACGTAC' },
      projectId: 'proj-1',
    });
    await add({
      primer: { id: 'shared', name: 'freezer tube', sequence: 'ACGTACGTAC', scope: PRIMER_SCOPE_GLOBAL },
      status: 'received',
    });
    const byId = useStore.getState().primersById;
    expect(byId.shared.name).toBe('project copy');
    expect(byId['global:shared'].name).toBe('freezer tube');
  });

  it('defaults an unscoped record to the project scope', async () => {
    await useStore.getState().addPrimerToPool({
      primer: { id: 'plain', sequence: 'ACGTACGTAC' },
    });
    expect(useStore.getState().primersById.plain.scope).toBe(PRIMER_SCOPE_PROJECT);
  });

  it('never puts a global inventory record inside a project', async () => {
    await useStore.getState().addPrimerToPool({
      primer: { id: 'g', sequence: 'ACGTACGTAC', scope: PRIMER_SCOPE_GLOBAL },
      projectId: 'proj-1',
      status: 'received',
    });
    const row = useStore.getState().primersById['global:g'];
    expect(row.scope).toBe(PRIMER_SCOPE_GLOBAL);
    expect(row.projectId).toBeNull();
  });
});

describe('mutators still address a record by its raw id', () => {
  it('removes and promotes a global record given only its raw id', async () => {
    const s = useStore.getState();
    await s.addPrimerToPool({
      primer: { id: 'g', sequence: 'ACGTACGTAC', scope: PRIMER_SCOPE_GLOBAL },
      status: 'ordered',
    });
    await useStore.getState().promotePrimerStatus('g', 'received');
    expect(useStore.getState().primersById['global:g'].status).toBe('received');
    await useStore.getState().removePrimerFromPool('g');
    expect(useStore.getState().primersById['global:g']).toBeUndefined();
    expect(await listPrimers()).toHaveLength(0);
  });

  it('prefers the project record when a bare raw id is ambiguous', async () => {
    const s = useStore.getState();
    await s.addPrimerToPool({ primer: { id: 'x', sequence: 'ACGTACGTAC' }, projectId: 'p' });
    await s.addPrimerToPool({
      primer: { id: 'x', sequence: 'ACGTACGTAC', scope: PRIMER_SCOPE_GLOBAL }, status: 'received',
    });
    await useStore.getState().updatePrimerFields('x', { name: 'renamed' });
    expect(useStore.getState().primersById.x.name).toBe('renamed');
    expect(useStore.getState().primersById['global:x'].name).not.toBe('renamed');
  });
});

/**
 * PRIMER-LIVE-1 correction — a donor file must not be able to reach into the
 * freezer, and a real tube has to be creatable through a real action.
 */
describe('a donor namespace cannot touch the freezer', () => {
  it('a project record whose raw id reads like a freezer key leaves it alone', async () => {
    const add = useStore.getState().addPrimerToPool;
    // The user's real tube.
    await add({
      primer: { id: 'x', name: 'my real tube', sequence: 'ACGTACGTAC', scope: PRIMER_SCOPE_GLOBAL },
      status: 'received',
    });
    // A donor project record that names itself `global:x`.
    await add({
      primer: { id: 'global:x', name: 'donor record', sequence: 'TTTTTTTTTT' },
      projectId: 'proj-1',
    });

    const freezer = useStore.getState().primersById['global:x'];
    expect(freezer.name).toBe('my real tube');
    expect(freezer.sequence).toBe('ACGTACGTAC');
    expect(freezer.status).toBe('received');
    // The donor still landed — escaped into its own slot, losing nothing.
    const donor = useStore.getState().primersById['project:global:x'];
    expect(donor.name).toBe('donor record');
    expect(donor.rawId).toBe('global:x');
    expect(await listPrimers()).toHaveLength(2);
  });

  it('a prototype-shaped id is stored as a real row, not swallowed', async () => {
    await useStore.getState().addPrimerToPool({
      primer: { id: '__proto__', name: 'evil', sequence: 'ACGTACGTAC' },
      projectId: 'proj-1',
    });
    const byId = useStore.getState().primersById;
    expect(Object.prototype.hasOwnProperty.call(byId, 'project:__proto__')).toBe(true);
    expect(byId['project:__proto__'].name).toBe('evil');
    expect(await listPrimers()).toHaveLength(1);
  });
});

describe('modifications are part of the record everywhere', () => {
  it('survive normalization and the Dexie round-trip', async () => {
    await useStore.getState().addPrimerToPool({
      primer: {
        id: 'm1', sequence: 'ACGTACGTAC', modifications: [' 5-phos ', 'BIOTIN', 'biotin'],
      },
      projectId: 'proj-1',
    });
    expect(useStore.getState().primersById.m1.modifications).toEqual(['5-PHOS', 'BIOTIN']);
    const rows = await listPrimers();
    expect(rows[0].modifications).toEqual(['5-PHOS', 'BIOTIN']);
  });

  it('default to an empty list rather than undefined', async () => {
    await useStore.getState().addPrimerToPool({
      primer: { id: 'm2', sequence: 'ACGTACGTAC' }, projectId: 'proj-1',
    });
    expect(useStore.getState().primersById.m2.modifications).toEqual([]);
  });
});

describe('marking a primer received creates REAL physical stock', () => {
  it('ensures a global/received/projectId-null tube and keeps the project usage', async () => {
    const add = useStore.getState().addPrimerToPool;
    await add({
      primer: {
        id: 'p-usage', name: 'my fwd', sequence: 'GAATTCACGTACGTAC',
        bindingSequence: 'ACGTACGTAC', tail: 'GAATTC',
      },
      projectId: 'proj-1',
      status: 'designed',
    });

    const tube = await useStore.getState().ensureLabStockPrimer('p-usage');
    expect(tube.scope).toBe(PRIMER_SCOPE_GLOBAL);
    expect(tube.status).toBe('received');
    expect(tube.projectId).toBeNull();
    expect(tube.sequence).toBe('GAATTCACGTACGTAC');

    // The project usage is NOT moved or deleted — the design still belongs to
    // the project; the tube is a separate, physical fact.
    const usage = useStore.getState().primersById['p-usage'];
    expect(usage).toBeDefined();
    expect(usage.projectId).toBe('proj-1');
    expect(usage.scope).toBe(PRIMER_SCOPE_PROJECT);
  });

  it('is idempotent on physical identity — no duplicate tubes', async () => {
    const add = useStore.getState().addPrimerToPool;
    await add({ primer: { id: 'a', name: 'A', sequence: 'ACGTACGTAC' }, projectId: 'p' });
    await add({ primer: { id: 'b', name: 'B', sequence: 'ACGTACGTAC' }, projectId: 'p' });
    const first = await useStore.getState().ensureLabStockPrimer('a');
    const second = await useStore.getState().ensureLabStockPrimer('b');
    expect(second.id).toBe(first.id);
    const stock = Object.values(useStore.getState().primersById)
      .filter((r) => r.scope === PRIMER_SCOPE_GLOBAL);
    expect(stock).toHaveLength(1);
  });

  it('treats a different modification as a DIFFERENT tube', async () => {
    const add = useStore.getState().addPrimerToPool;
    await add({ primer: { id: 'plain', sequence: 'ACGTACGTAC' }, projectId: 'p' });
    await add({
      primer: { id: 'phos', sequence: 'ACGTACGTAC', modifications: ['5-phos'] }, projectId: 'p',
    });
    const t1 = await useStore.getState().ensureLabStockPrimer('plain');
    const t2 = await useStore.getState().ensureLabStockPrimer('phos');
    expect(t2.id).not.toBe(t1.id);
    expect(Object.values(useStore.getState().primersById)
      .filter((r) => r.scope === PRIMER_SCOPE_GLOBAL)).toHaveLength(2);
  });
});

describe('v7 -> v8 upgrade rekeys a legacy row that squats a reserved key', () => {
  it('moves it into the escaped project slot without losing it', async () => {
    const Dexie = (await import('dexie')).default;
    const name = `bodgegene-mig-${Math.random().toString(36).slice(2)}`;
    const v7 = new Dexie(name);
    v7.version(7).stores({
      projects: 'id, name, createdAt, updatedAt',
      containers: 'id, projectId, kind, name, [projectId+kind]',
      library: 'id, kind, addedAt, [kind+addedAt], *tags, zone, projectId',
      primers: 'id, name, projectId, status, addedAt, resourceHash, [projectId+status]',
      snippets: 'id, name, category, createdAt',
      commonFeatures: 'id, kind, baseId',
      customEnzymes: 'id, name, createdAt',
      enzymeSets: 'id, name, createdAt',
    });
    await v7.open();
    await v7.table('primers').bulkPut([
      { id: 'ordinary', name: 'plain', sequence: 'ACGT', projectId: 'p1', status: 'designed' },
      { id: 'global:x', name: 'legacy squatter', sequence: 'TTTT', projectId: 'p1', status: 'designed' },
    ]);
    v7.close();

    const db = resetDBForTests(name);
    await db.open();
    const rows = await db.table('primers').toArray();
    expect(rows).toHaveLength(2);

    const plain = rows.find((r) => r.id === 'ordinary');
    expect(plain.scope).toBe(PRIMER_SCOPE_PROJECT);
    expect(plain.rawId).toBe('ordinary');

    // The squatter keeps its raw id, but no longer occupies the freezer's key.
    const moved = rows.find((r) => r.rawId === 'global:x');
    expect(moved).toBeDefined();
    expect(moved.name).toBe('legacy squatter');
    expect(moved.id).toBe('project:global:x');
    expect(rows.some((r) => r.id === 'global:x')).toBe(false);
    db.close();
  });
});
