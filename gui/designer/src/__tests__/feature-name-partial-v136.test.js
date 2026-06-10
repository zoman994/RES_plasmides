/**
 * feature-name-partial-v136.test.js — the partial-feature name (`_part_X-Y`)
 * must be produced by ONE shared helper at EVERY detector consumer, not just
 * the Annotator plugin. Биолог: кусок на импорте получал полное имя без
 * координат, потому что enrich/file-import именовали хит плоско `hit.feature.name`.
 *
 * featureRegionName(feature-detection.js) is the single source; common-features
 * rowToRegion, auto-annotate enrichWithCommonFeatures (both branches) and
 * file-import enrichAnnotations all route through it.
 */
import { describe, it, expect, vi } from 'vitest';

// Keep the real module — featureRegionName is a pure helper we want to exercise —
// but stub the async DB lookup so we can inject specific partial/full hits.
vi.mock('../feature-detection', async (importActual) => {
  const actual = await importActual();
  return { ...actual, detectCommonFeaturesAsync: vi.fn().mockResolvedValue([]) };
});

import { featureRegionName, detectCommonFeaturesAsync } from '../feature-detection';
import { enrichWithCommonFeatures } from '../auto-annotate';
import { enrichAnnotations } from '../file-import';

describe('featureRegionName (V136)', () => {
  it('protein_partial → name_part_(start+1)-end', () => {
    expect(featureRegionName({ name: 'KanR', method: 'protein_partial', featureStart: 39, featureEnd: 288 }))
      .toBe('KanR_part_40-288');
  });

  it('dna_partial → name_part_(start+1)-end', () => {
    expect(featureRegionName({ name: 'ori', method: 'dna_partial', featureStart: 0, featureEnd: 200 }))
      .toBe('ori_part_1-200');
  });

  it('partial with null featureEnd → collapses to a single-base range', () => {
    expect(featureRegionName({ name: 'X', method: 'dna_partial', featureStart: 10 }))
      .toBe('X_part_11-11');
  });

  it('full hit (protein_exact / dna_identity) → flat name', () => {
    expect(featureRegionName({ name: 'AmpR', method: 'protein_exact' })).toBe('AmpR');
    expect(featureRegionName({ name: 'AmpR', method: 'dna_identity' })).toBe('AmpR');
  });

  it('missing name → (unnamed)', () => {
    expect(featureRegionName({ method: 'protein_partial' })).toBe('(unnamed)');
    expect(featureRegionName({})).toBe('(unnamed)');
  });
});

describe('enrichWithCommonFeatures — partial name (V136)', () => {
  it('promote branch: partial hit names the stub *_part_X-Y, knownFeature stays flat', async () => {
    const sequence = 'A'.repeat(300);
    const annotations = [{ name: 'imported', type: 'misc_feature', start: 0, end: 300, level: 'region', auto: true }];
    detectCommonFeaturesAsync.mockResolvedValueOnce([
      { feature: { name: 'KanR', type: 'marker' }, start: 0, end: 300, strand: 1, identity: 0.95, method: 'protein_partial', featureStart: 39, featureEnd: 288, coverage: 0.31 },
    ]);
    const enriched = await enrichWithCommonFeatures(sequence, annotations);
    const reg = enriched.find((a) => a.knownFeature === 'KanR');
    expect(reg).toBeDefined();
    expect(reg.name).toBe('KanR_part_40-288');
    expect(reg.knownFeature).toBe('KanR'); // flat canonical identity (tooltips/aliases)
    expect(reg.featureRange).toEqual([39, 288]);
    expect(reg.coverage).toBe(0.31);
    expect(reg.detector).toBe('protein_partial');
  });

  it('else branch: partial hit with no matching region → new *_part_X-Y region', async () => {
    const sequence = 'A'.repeat(4000);
    detectCommonFeaturesAsync.mockResolvedValueOnce([
      { feature: { name: 'KanR', type: 'marker' }, start: 1000, end: 1250, strand: 1, identity: 1.0, method: 'dna_partial', featureStart: 500, featureEnd: 750, coverage: 0.4 },
    ]);
    const enriched = await enrichWithCommonFeatures(sequence, []);
    const reg = enriched.find((a) => a.knownFeature === 'KanR');
    expect(reg).toBeDefined();
    expect(reg.name).toBe('KanR_part_501-750');
    expect(reg.knownFeature).toBe('KanR');
    expect(reg.detector).toBe('dna_partial');
    expect(reg.featureRange).toEqual([500, 750]);
    expect(reg.coverage).toBe(0.4);
  });

  it('full hit keeps a flat name and no partial fields (regression)', async () => {
    const sequence = 'A'.repeat(4000);
    detectCommonFeaturesAsync.mockResolvedValueOnce([
      { feature: { name: 'AmpR', type: 'marker' }, start: 100, end: 900, strand: 1, identity: 1.0, method: 'protein_exact' },
    ]);
    const enriched = await enrichWithCommonFeatures(sequence, []);
    const reg = enriched.find((a) => a.knownFeature === 'AmpR');
    expect(reg.name).toBe('AmpR');
    expect(reg.featureRange).toBeUndefined();
  });
});

describe('file-import enrichAnnotations — partial name survives (V136)', () => {
  it('"has annotations" branch does NOT flatten a promoted partial name back to flat', async () => {
    const parsed = {
      name: 'frag',
      sequence: 'A'.repeat(300),
      annotations: [{ name: 'myfrag', type: 'misc_feature', start: 0, end: 300, level: 'region', auto: true }],
    };
    detectCommonFeaturesAsync.mockResolvedValueOnce([
      { feature: { name: 'KanR', type: 'marker' }, start: 0, end: 300, strand: 1, identity: 0.95, method: 'protein_partial', featureStart: 39, featureEnd: 288, coverage: 0.31 },
    ]);
    const out = await enrichAnnotations(parsed, { autoAnnotate: true });
    const reg = out.annotations.find((a) => a.knownFeature === 'KanR' && a.level === 'region');
    expect(reg).toBeDefined();
    expect(reg.name).toBe('KanR_part_40-288'); // not the flat 'KanR'
    expect(reg.knownFeature).toBe('KanR');
  });
});

describe('rowToRegion (plugin) regression anchor (V136)', () => {
  it('partial hit still emits a *_part_X-Y name via the shared helper', async () => {
    const { commonFeaturesPlugin } = await import('../lib/annotator-plugins/common-features.js');
    detectCommonFeaturesAsync.mockResolvedValueOnce([
      { feature: { name: 'KanR', type: 'marker' }, start: 100, end: 350, strand: 1, identity: 0.92, method: 'protein_partial', featureStart: 39, featureEnd: 288, coverage: 0.31 },
    ]);
    const res = await commonFeaturesPlugin.run('ATGC'.repeat(500), null, {});
    expect(res.regions[0].name).toBe('KanR_part_40-288');
  });
});
