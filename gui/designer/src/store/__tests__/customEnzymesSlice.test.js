/**
 * customEnzymesSlice (RS-C1) — account-global store overlay for user-defined
 * restriction enzymes + named enzyme sets. Mirrors commonFeaturesSlice: hydrate
 * + CRUD persist to Dexie; selectors merge custom over built-ins and presets
 * over user sets.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  useStore,
  selectCustomEnzymes,
  selectAllEnzymeSets,
  selectMergedREEnzymes,
} from '../index';
import { RE_ENZYMES } from '../../restriction-db';
import {
  resetDBForTests,
  listCustomEnzymes,
  listEnzymeSets,
} from '../../db/dexie-schema';

async function freshDB() {
  const name = `bodgegene-ce-slice-${Math.random().toString(36).slice(2)}`;
  const db = resetDBForTests(name);
  await db.delete();
  await db.open();
  return db;
}

async function reset() {
  await freshDB();
  useStore.setState((state) => {
    state.customEnzymes.byId = {};
    state.customEnzymes.sets = {};
    state.customEnzymes._hydrated = false;
  });
}

const st = () => useStore.getState();

describe('customEnzymesSlice', () => {
  beforeEach(reset);

  it('addCustomEnzyme validates, normalises, stores + persists', async () => {
    const r = await st().addCustomEnzyme({ name: 'MyRI', site: 'gaattc', cut: [1, 5] });
    expect(r.ok).toBe(true);
    const rec = st().customEnzymes.byId[r.id];
    expect(rec.site).toBe('GAATTC');
    expect(rec.end).toBe('5prime');
    expect(rec.overhang).toBe('AATT');
    expect(rec.isCustom).toBe(true);
    const rows = await listCustomEnzymes();
    expect(rows.find((x) => x.id === r.id)).toBeTruthy();
  });

  it('addCustomEnzyme rejects an invalid payload (no write)', async () => {
    const r = await st().addCustomEnzyme({ name: '', site: 'GAZTTC', cut: [1, 5] });
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(Object.keys(st().customEnzymes.byId)).toHaveLength(0);
    expect(await listCustomEnzymes()).toHaveLength(0);
  });

  it('updateCustomEnzyme re-derives + persists; removeCustomEnzyme deletes', async () => {
    const { id } = await st().addCustomEnzyme({ name: 'MyRI', site: 'GAATTC', cut: [1, 5] });
    await st().updateCustomEnzyme(id, { cut: [3, 3] }); // → blunt
    expect(st().customEnzymes.byId[id].end).toBe('blunt');
    expect(st().customEnzymes.byId[id].overhang).toBeNull();
    await st().removeCustomEnzyme(id);
    expect(st().customEnzymes.byId[id]).toBeUndefined();
    expect(await listCustomEnzymes()).toHaveLength(0);
  });

  it('addEnzymeSet / removeEnzymeSet persist', async () => {
    const r = await st().addEnzymeSet('Мой набор', ['EcoRI', 'BamHI']);
    expect(r.ok).toBe(true);
    expect(st().customEnzymes.sets[r.id].enzymes).toEqual(['EcoRI', 'BamHI']);
    expect(await listEnzymeSets()).toHaveLength(1);
    await st().removeEnzymeSet(r.id);
    expect(await listEnzymeSets()).toHaveLength(0);
  });

  it('selectMergedREEnzymes includes the custom enzyme over the built-ins', async () => {
    const before = Object.keys(selectMergedREEnzymes(st())).length;
    expect(before).toBe(Object.keys(RE_ENZYMES).length);
    await st().addCustomEnzyme({ name: 'MyRI', site: 'GAATTC', cut: [1, 5] });
    const merged = selectMergedREEnzymes(st());
    expect(merged.MyRI).toBeTruthy();
    expect(Object.keys(merged).length).toBe(before + 1);
  });

  it('selectAllEnzymeSets = presets (origin:preset) + user sets (origin:user)', async () => {
    const presets = selectAllEnzymeSets(st());
    expect(presets.every((s) => s.origin === 'preset')).toBe(true);
    expect(presets.length).toBeGreaterThanOrEqual(2);
    await st().addEnzymeSet('Мой набор', ['EcoRI']);
    const all = selectAllEnzymeSets(st());
    expect(all.some((s) => s.origin === 'user' && s.name === 'Мой набор')).toBe(true);
  });

  it('a preset is editable — updateEnzymeSet stores an override; selectAllEnzymeSets reflects it', async () => {
    await st().updateEnzymeSet('preset:frequent', { enzymes: ['EcoRI'], name: 'Мои частые' });
    const sets = selectAllEnzymeSets(st());
    const freq = sets.find((s) => s.id === 'preset:frequent');
    expect(freq.origin).toBe('preset');
    expect(freq.edited).toBe(true);
    expect(freq.name).toBe('Мои частые');
    expect(freq.enzymes).toEqual(['EcoRI']);
    // override is NOT surfaced as a separate user set
    expect(sets.filter((s) => s.id === 'preset:frequent')).toHaveLength(1);
    expect(await listEnzymeSets()).toHaveLength(1);
  });

  it('removeEnzymeSet on a preset override RESETS it to the built-in default', async () => {
    const def = selectAllEnzymeSets(st()).find((s) => s.id === 'preset:frequent').enzymes;
    await st().updateEnzymeSet('preset:frequent', { enzymes: ['EcoRI'] });
    await st().removeEnzymeSet('preset:frequent');
    const freq = selectAllEnzymeSets(st()).find((s) => s.id === 'preset:frequent');
    expect(freq.edited).toBeFalsy();
    expect(freq.enzymes).toEqual(def); // back to built-in
  });

  it('hydrateCustomEnzymes loads enzymes + sets from Dexie', async () => {
    const { id } = await st().addCustomEnzyme({ name: 'MyRI', site: 'GAATTC', cut: [1, 5] });
    await st().addEnzymeSet('S', ['EcoRI']);
    // wipe in-memory, then hydrate from Dexie
    useStore.setState((state) => {
      state.customEnzymes.byId = {};
      state.customEnzymes.sets = {};
      state.customEnzymes._hydrated = false;
    });
    await st().hydrateCustomEnzymes();
    expect(st().customEnzymes.byId[id]).toBeTruthy();
    expect(Object.keys(st().customEnzymes.sets)).toHaveLength(1);
    expect(st().customEnzymes._hydrated).toBe(true);
  });

  it('selectCustomEnzymes returns the stored enzyme records', async () => {
    await st().addCustomEnzyme({ name: 'MyRI', site: 'GAATTC', cut: [1, 5] });
    const list = selectCustomEnzymes(st());
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('MyRI');
  });
});
