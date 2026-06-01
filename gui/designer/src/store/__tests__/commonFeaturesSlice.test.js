/**
 * commonFeaturesSlice (SPEC_COMMON_FEATURES, step 3). Overlay store for the
 * common-features DB: promote (success + PSO-dup reject), override/reset,
 * delete-user, the origin-tagged merged selector, hydrate, and the additive
 * v5→v6 Dexie migration (no wipe — account-global, like snippets).
 */
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore, selectMergedCommonFeatures } from '../index';
import { invalidateMergedCache } from '../commonFeaturesSlice';
import {
  resetDBForTests,
  listCommonFeatures,
  putCommonFeature,
} from '../../db/dexie-schema';

async function freshDB() {
  const name = `bodgegene-cf-${Math.random().toString(36).slice(2)}`;
  const db = resetDBForTests(name);
  await db.delete();
  await db.open();
  return db;
}

async function reset() {
  await freshDB();
  // No built-in DB in tests — fail fast (404) so loadFeatureDB returns null
  // without a real socket attempt (avoids ECONNREFUSED latency that adds
  // parallel-suite contention). Merged DB then = the overlay only.
  global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404 }));
  invalidateMergedCache();
  useStore.setState((state) => {
    state.commonFeatures.userFeatures = {};
    state.commonFeatures.overrides = {};
    state.commonFeatures._hydrated = false;
  });
}

const DNA = 'ATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGC';

describe('commonFeaturesSlice', () => {
  beforeEach(reset);

  it('promoteFeature adds a user feature + persists to Dexie', async () => {
    const r = await useStore.getState().promoteFeature({ name: 'ori1', type: 'rep_origin', sequence: DNA });
    expect(r.ok).toBe(true);
    const uf = useStore.getState().commonFeatures.userFeatures[r.id];
    expect(uf).toBeDefined();
    expect(uf.kind).toBe('user');
    expect(uf.length).toBe(DNA.length);
    const rows = await listCommonFeatures();
    expect(rows.find((x) => x.id === r.id)).toBeTruthy();
  });

  it('promoteFeature stores protein for protein-pathway promotes', async () => {
    const r = await useStore.getState().promoteFeature({
      name: 'GFP', type: 'reporter', sequence: 'ATGGTG', protein: 'MKLVTYACDEFG',
    });
    expect(r.ok).toBe(true);
    expect(useStore.getState().commonFeatures.userFeatures[r.id].protein).toBe('MKLVTYACDEFG');
  });

  it('promoteFeature rejects a PSO duplicate with dupBy', async () => {
    await useStore.getState().promoteFeature({ name: 'ori1', type: 'misc', sequence: DNA });
    const dup = await useStore.getState().promoteFeature({ name: 'ori2', type: 'misc', sequence: DNA });
    expect(dup.ok).toBe(false);
    expect(dup.dupBy.by).toBe('dna');
  });

  it('overrideCommonFeature writes an override keyed by baseId', async () => {
    await useStore.getState().overrideCommonFeature('cf_x', { name: 'Renamed', type: 'CDS' });
    const ov = useStore.getState().commonFeatures.overrides.cf_x;
    expect(ov.name).toBe('Renamed');
    expect(ov.baseId).toBe('cf_x');
    const rows = await listCommonFeatures();
    expect(rows.find((x) => x.id === 'cf_x' && x.kind === 'override')).toBeTruthy();
  });

  it('resetCommonFeature removes the override (factory restored)', async () => {
    await useStore.getState().overrideCommonFeature('cf_x', { name: 'Renamed' });
    await useStore.getState().resetCommonFeature('cf_x');
    expect(useStore.getState().commonFeatures.overrides.cf_x).toBeUndefined();
    const rows = await listCommonFeatures();
    expect(rows.find((x) => x.id === 'cf_x')).toBeFalsy();
  });

  it('deleteUserFeature removes a net-new feature', async () => {
    const r = await useStore.getState().promoteFeature({ name: 'u1', type: 'misc', sequence: DNA });
    await useStore.getState().deleteUserFeature(r.id);
    expect(useStore.getState().commonFeatures.userFeatures[r.id]).toBeUndefined();
    const rows = await listCommonFeatures();
    expect(rows.find((x) => x.id === r.id)).toBeFalsy();
  });

  it('selectMergedCommonFeatures tags origin factory/user/overridden', async () => {
    const builtin = [
      { id: 'cf_a', name: 'AmpR', type: 'marker', length: 861 },
      { id: 'cf_b', name: 'KanR', type: 'marker', length: 795 },
    ];
    await useStore.getState().overrideCommonFeature('cf_a', { name: 'AmpR*' });
    await useStore.getState().promoteFeature({ name: 'MyFeat', type: 'misc', sequence: DNA });
    const merged = selectMergedCommonFeatures(useStore.getState(), builtin);
    const byOrigin = (o) => merged.filter((m) => m.origin === o);
    expect(byOrigin('overridden').length).toBe(1);
    expect(byOrigin('overridden')[0].name).toBe('AmpR*');
    expect(byOrigin('factory').length).toBe(1);
    expect(byOrigin('factory')[0].name).toBe('KanR');
    expect(byOrigin('user').length).toBe(1);
    expect(byOrigin('user')[0].name).toBe('MyFeat');
  });

  it('hydrateCommonFeatures loads rows from Dexie into state', async () => {
    await useStore.getState().promoteFeature({ name: 'u1', type: 'misc', sequence: DNA });
    await useStore.getState().overrideCommonFeature('cf_z', { name: 'Z' });
    useStore.setState((s) => {
      s.commonFeatures.userFeatures = {};
      s.commonFeatures.overrides = {};
      s.commonFeatures._hydrated = false;
    });
    await useStore.getState().hydrateCommonFeatures();
    const cf = useStore.getState().commonFeatures;
    expect(Object.keys(cf.userFeatures).length).toBe(1);
    expect(cf.overrides.cf_z.name).toBe('Z');
  });

  it('hydrateCommonFeatures is idempotent (guarded second call does not re-read)', async () => {
    await useStore.getState().hydrateCommonFeatures();
    expect(useStore.getState().commonFeatures._hydrated).toBe(true);
    // Write straight to Dexie (bypasses state). Guarded hydrate must NOT pull it.
    await putCommonFeature({ id: 'sneaky', kind: 'user', name: 'X', type: 'misc', length: 1 });
    await useStore.getState().hydrateCommonFeatures();
    expect(useStore.getState().commonFeatures.userFeatures.sneaky).toBeUndefined();
  });

  it('v5→v6 migration is additive: other tables survive, commonFeatures starts empty', async () => {
    const name = `bodgegene-cf-mig-${Math.random().toString(36).slice(2)}`;
    // Seed a v5-shape DB with a library row.
    const v5 = new Dexie(name);
    v5.version(5).stores({
      projects: 'id, name, createdAt, updatedAt',
      containers: 'id, projectId, kind, name, [projectId+kind]',
      library: 'id, kind, addedAt, [kind+addedAt], *tags, zone, projectId',
      primers: 'id, name, projectId, status, addedAt, resourceHash, [projectId+status]',
      snippets: 'id, name, category, createdAt',
    });
    await v5.open();
    await v5.table('library').put({ id: 'keep1', kind: 'container', name: 'survivor', addedAt: '2026-05-01', payload: {}, tags: [] });
    v5.close();

    // Reopen via the app's BodgeDB (now v6) — additive upgrade, no wipe.
    const v6 = resetDBForTests(name);
    await v6.open();
    const lib = await v6.table('library').toArray();
    expect(lib.length).toBe(1);
    expect(lib[0].id).toBe('keep1');
    const cf = await v6.table('commonFeatures').toArray();
    expect(cf).toEqual([]);
  });
});
