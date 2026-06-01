/**
 * Overlay merge in detection (SPEC_COMMON_FEATURES step 4, DEC-CF-03).
 * detectCommonFeaturesAsync runs against getMergedFeatureDB (built-in +
 * account overlay): net-new user features are detected, an override beats
 * the factory record by baseId, and the merged cache invalidates on any
 * overlay mutation. Built-in DB is supplied via a mocked fetch.
 *
 * (Named *-overlay to avoid collision with feature-detection-merge-v134,
 * which covers mergeCollinearPartials — SPEC §5 called this
 * "feature-detection-merge.test.js"; see sprint report.)
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from '../store/index';
import { getMergedFeatureDB, invalidateMergedCache } from '../store/commonFeaturesSlice';
import { detectCommonFeaturesAsync } from '../feature-detection';
import { resetDBForTests } from '../db/dexie-schema';

const DNA_FAC = 'AAAACCCCGGGGTTTTAAAACCCCGGGGTTTTAAAACCCCGGGGTTTTAAAACCCCGGGG';
const DNA_USER = 'TTTTGGGGCCCCAAAATTTTGGGGCCCCAAAATTTTGGGGCCCCAAAATTTTGGGGCCCC';
const DNA_OV = 'ACGTACGTTGCATGCAACGTACGTTGCATGCAACGTACGTTGCATGCAACGTACGTTGCA';

const BUILTIN = {
  features: [
    { id: 'cf_fac', name: 'FactoryOnly', type: 'misc', sequence: DNA_FAC, length: DNA_FAC.length },
  ],
};

beforeEach(async () => {
  const name = `bodgegene-overlay-${Math.random().toString(36).slice(2)}`;
  const db = resetDBForTests(name);
  await db.delete();
  await db.open();
  global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(BUILTIN) }));
  invalidateMergedCache();
  useStore.setState((s) => {
    s.commonFeatures.userFeatures = {};
    s.commonFeatures.overrides = {};
    s.commonFeatures._hydrated = false;
  });
});

describe('detection over merged overlay DB', () => {
  it('net-new user feature is detected through the merged DB', async () => {
    await useStore.getState().promoteFeature({ name: 'MyUser', type: 'misc', sequence: DNA_USER });
    const hits = await detectCommonFeaturesAsync(DNA_USER);
    expect(hits.some((h) => h.feature.name === 'MyUser')).toBe(true);
  });

  it('built-in factory feature is still detected (merge keeps both)', async () => {
    const hits = await detectCommonFeaturesAsync(DNA_FAC);
    expect(hits.some((h) => h.feature.id === 'cf_fac')).toBe(true);
  });

  it('override beats factory by baseId', async () => {
    await useStore.getState().overrideCommonFeature('cf_fac', { sequence: DNA_OV });
    const onOverride = await detectCommonFeaturesAsync(DNA_OV);
    expect(onOverride.some((h) => h.feature.id === 'cf_fac')).toBe(true);
    // The factory sequence is no longer in the merged DB.
    const onFactory = await detectCommonFeaturesAsync(DNA_FAC);
    expect(onFactory.some((h) => h.feature.id === 'cf_fac')).toBe(false);
  });

  it('merged cache invalidates after a mutation', async () => {
    const before = (await getMergedFeatureDB()).features.length;
    await useStore.getState().promoteFeature({ name: 'X', type: 'misc', sequence: DNA_USER });
    const after = (await getMergedFeatureDB()).features.length;
    expect(after).toBe(before + 1);
  });
});
