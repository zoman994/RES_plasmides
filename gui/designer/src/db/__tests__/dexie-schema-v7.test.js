/**
 * Dexie v7 (RS-C1) — account-global custom restriction enzymes + named enzyme
 * sets. Purely ADDITIVE (no wipe), mirror of snippets/commonFeatures: excluded
 * from clearAll so the biolog's enzyme catalog survives project churn.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  resetDBForTests,
  DB_VERSION,
  putCustomEnzyme,
  listCustomEnzymes,
  deleteCustomEnzyme,
  putEnzymeSet,
  listEnzymeSets,
  deleteEnzymeSet,
  putLibraryEntry,
  clearAll,
} from '../dexie-schema';

async function freshDB() {
  const name = `bodgegene-ce-${Math.random().toString(36).slice(2)}`;
  const db = resetDBForTests(name);
  await db.delete();
  await db.open();
  return db;
}

describe('Dexie v7 — customEnzymes + enzymeSets', () => {
  beforeEach(freshDB);

  it('DB_VERSION is at least 7', () => {
    expect(DB_VERSION).toBeGreaterThanOrEqual(7);
  });

  it('put/list/delete a custom enzyme', async () => {
    await putCustomEnzyme({ id: 'e1', name: 'MyRI', site: 'GAATTC', cut: [1, 5], createdAt: 'T0' });
    let rows = await listCustomEnzymes();
    expect(rows.map((r) => r.id)).toEqual(['e1']);
    expect(rows[0].name).toBe('MyRI');
    await deleteCustomEnzyme('e1');
    rows = await listCustomEnzymes();
    expect(rows).toHaveLength(0);
  });

  it('put/list/delete an enzyme set', async () => {
    await putEnzymeSet({ id: 's1', name: 'Мой набор', enzymes: ['EcoRI', 'BamHI'], createdAt: 'T0' });
    let sets = await listEnzymeSets();
    expect(sets.map((s) => s.id)).toEqual(['s1']);
    expect(sets[0].enzymes).toEqual(['EcoRI', 'BamHI']);
    await deleteEnzymeSet('s1');
    sets = await listEnzymeSets();
    expect(sets).toHaveLength(0);
  });

  it('custom enzymes + sets SURVIVE clearAll (account-global)', async () => {
    await putCustomEnzyme({ id: 'e1', name: 'MyRI', site: 'GAATTC', cut: [1, 5], createdAt: 'T0' });
    await putEnzymeSet({ id: 's1', name: 'set', enzymes: ['EcoRI'], createdAt: 'T0' });
    await putLibraryEntry({ id: 'lib1', kind: 'container', name: 'p', addedAt: 'T0' });
    await clearAll();
    expect(await listCustomEnzymes()).toHaveLength(1);
    expect(await listEnzymeSets()).toHaveLength(1);
  });
});
