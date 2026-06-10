/**
 * common-features plugin — bug-rush #24 coverage.
 *
 * `detectCommonFeaturesAsync` returns rows shaped
 * `{ feature, start, end, strand, identity, method }` — the wrapping
 * `feature` object holds `name` / `type` / `description`. The plugin
 * USED to forward those rows verbatim to the Annotator UI, so every
 * row showed «(unnamed)» (ResultRow reads `merged.name`). This test
 * locks in the flatten-into-region-shape contract.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectCommonFeaturesAsync } from '../../../feature-detection.js';

vi.mock('../../../feature-detection.js', async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    detectCommonFeaturesAsync: vi.fn(async () => [
    {
      feature: {
        id: 'cf_amp',
        name: 'AmpR',
        type: 'marker',
        description: '<html><body>ampicillin resistance</body></html>',
      },
      start: 100,
      end: 961,
      strand: 1,
      identity: 1.0,
      method: 'protein_exact',
    },
    {
      feature: {
        id: 'cf_lac',
        name: 'lacZα',
        type: 'CDS',
      },
      start: 50,
      end: 380,
      strand: -1,
      identity: 0.97,
      method: 'dna_identity',
    },
    ]),
  };
});

let commonFeaturesPlugin;
beforeEach(async () => {
  const mod = await import('../common-features.js');
  commonFeaturesPlugin = mod.commonFeaturesPlugin;
});

describe('common-features plugin — region shape (bug-rush #24)', () => {
  it('flattens raw detector rows so each region has name/type/level/confidence', async () => {
    const res = await commonFeaturesPlugin.run('ATGC'.repeat(500), null, {});
    expect(res.regions.length).toBe(2);
    for (const r of res.regions) {
      expect(typeof r.name).toBe('string');
      expect(r.name.length).toBeGreaterThan(0);
      expect(typeof r.type).toBe('string');
      expect(r.level).toBe('region');
      expect(typeof r.confidence).toBe('number');
      expect(typeof r.start).toBe('number');
      expect(typeof r.end).toBe('number');
      expect([1, -1]).toContain(r.strand);
    }
    const amp = res.regions.find((r) => r.name === 'AmpR');
    expect(amp).toBeTruthy();
    expect(amp.type).toBe('marker');
    expect(amp.confidence).toBe(1.0);
    expect(amp.start).toBe(100);
    expect(amp.end).toBe(961);
    expect(amp.strand).toBe(1);
  });

  it('shifts coordinates by region.start when run on a sub-region', async () => {
    const res = await commonFeaturesPlugin.run('A'.repeat(2000), { start: 1000, end: 2000 }, {});
    const amp = res.regions.find((r) => r.name === 'AmpR');
    expect(amp.start).toBe(1100);
    expect(amp.end).toBe(1961);
  });

  it('strips simple HTML tags from feature.description so the UI shows plain text', async () => {
    const res = await commonFeaturesPlugin.run('A'.repeat(2000), null, {});
    const amp = res.regions.find((r) => r.name === 'AmpR');
    expect(amp.description).not.toMatch(/<[a-z][^>]*>/i);
    expect(amp.description).toMatch(/ampicillin resistance/i);
  });
});

describe('common-features plugin — partial rows (SPEC_FEATURE_DETECTION_PARTIAL)', () => {
  it('partial row -> region.name has _part_ suffix, coverage and featureRange fields', async () => {
    vi.mocked(detectCommonFeaturesAsync).mockResolvedValueOnce([
      {
        feature: { name: 'KanR', type: 'marker' },
        start: 100, end: 350, strand: 1,
        identity: 0.92, method: 'protein_partial',
        featureStart: 39, featureEnd: 288, coverage: 0.31,
      },
    ]);
    const res = await commonFeaturesPlugin.run('ATGC'.repeat(500), null, {});
    expect(res.regions).toHaveLength(1);
    expect(res.regions[0].name).toBe('KanR_part_40-288');
    expect(res.regions[0].coverage).toBe(0.31);
    expect(res.regions[0].featureRange).toEqual([39, 288]);
  });

  it('split partial -> two regions with distinct _part_ names', async () => {
    vi.mocked(detectCommonFeaturesAsync).mockResolvedValueOnce([
      {
        feature: { name: 'KanR', type: 'marker' },
        start: 0, end: 400, strand: 1, identity: 1.0,
        method: 'dna_partial', featureStart: 0, featureEnd: 400, coverage: 0.5,
      },
      {
        feature: { name: 'KanR', type: 'marker' },
        start: 500, end: 800, strand: 1, identity: 1.0,
        method: 'dna_partial', featureStart: 500, featureEnd: 800, coverage: 0.375,
      },
    ]);
    const res = await commonFeaturesPlugin.run('ATGC'.repeat(500), null, {});
    expect(res.regions).toHaveLength(2);
    const names = res.regions.map((r) => r.name).sort();
    expect(names).toEqual(['KanR_part_1-400', 'KanR_part_501-800']);
  });
});
