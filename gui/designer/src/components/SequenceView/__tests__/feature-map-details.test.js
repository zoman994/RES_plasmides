/**
 * feature-map-details.test.js — Sprint M-X.3 follow-up coverage.
 *
 * Biolog: «сплит не отражается визуально, только в навигационной
 * "колбасе" вижу потомков». Pre-fix `buildFeatureMap` filtered to
 * `level === 'region'` only via `getRegions`, so detail-level sub-
 * features (created by FeatureEditorModal's Split flow) never
 * reached the AnnotationTrack render. They DID reach the
 * LinearFeatureBar because that uses raw `annotations` directly.
 *
 * Now `buildFeatureMap` also emits detail-level features with
 * `level: 'detail'` + `parentId` so the per-line track stacks them
 * under their parent.
 */
import { describe, it, expect } from 'vitest';
import { buildFeatureMap, flattenRawOccurrences } from '../lib/feature-map.js';

const PARENT = {
  id: 'cds-1', name: 'lacZα', type: 'CDS',
  start: 100, end: 900, strand: 1, level: 'region',
};

const SUB_1 = {
  id: 'sf-1', name: 'signal-peptide', type: 'signal_peptide',
  start: 100, end: 300, strand: 1, level: 'detail', regionId: 'cds-1',
};

const SUB_2 = {
  id: 'sf-2', name: 'mature', type: 'misc_feature',
  start: 300, end: 900, strand: 1, level: 'detail', regionId: 'cds-1',
};

describe('buildFeatureMap — detail-level features included', () => {
  it('emits region + every detail in the same features array', () => {
    const out = buildFeatureMap([
      { id: 'frag', name: 'p', sequence: 'A'.repeat(1000), annotations: [PARENT, SUB_1, SUB_2] },
    ]);
    expect(out.features).toHaveLength(3); // 1 region + 2 details
  });

  it('detail features carry level:"detail" and parentId', () => {
    const out = buildFeatureMap([
      { id: 'frag', name: 'p', sequence: 'A'.repeat(1000), annotations: [PARENT, SUB_1] },
    ]);
    const detail = out.features.find((f) => f.level === 'detail');
    expect(detail).toBeTruthy();
    expect(detail.parentId).toBe('cds-1');
    expect(detail.name).toBe('signal-peptide');
  });

  it('region without details still emits exactly one region feature', () => {
    const out = buildFeatureMap([
      { id: 'frag', name: 'p', sequence: 'A'.repeat(1000), annotations: [PARENT] },
    ]);
    expect(out.features).toHaveLength(1);
    expect(out.features[0].level).toBe('region');
  });

  it('multiple parents each get their own details', () => {
    const otherRegion = { id: 'cds-2', name: 'other', type: 'CDS', start: 1000, end: 2000, strand: 1, level: 'region' };
    const otherSub = { id: 'sf-3', name: 'inner', type: 'misc_feature', start: 1100, end: 1200, strand: 1, level: 'detail', regionId: 'cds-2' };
    const out = buildFeatureMap([
      { id: 'frag', name: 'p', sequence: 'A'.repeat(3000),
        annotations: [PARENT, SUB_1, otherRegion, otherSub] },
    ]);
    expect(out.features).toHaveLength(4); // 2 regions + 2 details
    const details = out.features.filter((f) => f.level === 'detail');
    expect(details).toHaveLength(2);
    expect(details.map((d) => d.parentId).sort()).toEqual(['cds-1', 'cds-2']);
  });

  it('detail coords are offset by the fragment\'s start (multi-fragment correctness)', () => {
    const f1 = { id: 'a', name: 'a', sequence: 'A'.repeat(500), annotations: [] };
    const f2 = {
      id: 'b', name: 'b', sequence: 'A'.repeat(1000),
      annotations: [PARENT, SUB_1], // PARENT starts at 100 within f2 → 600 absolute
    };
    const out = buildFeatureMap([f1, f2]);
    const sub = out.features.find((f) => f.level === 'detail');
    expect(sub.start).toBe(600);  // 500 (f1 length) + 100
    expect(sub.end).toBe(800);    // 500 + 300
  });
});

/**
 * P4 context — raw recognition occurrence adapter. Unlike flattenSites (which
 * emits ONE cut position per site, shifted by the top-strand cut offset), this
 * emits ONE row per recognition occurrence and preserves the real recognition
 * geometry the unified primer inspector projects (enzyme, motif, recognition
 * start, site length, strand). Filtering still runs through the shared filter.
 */
describe('flattenRawOccurrences — raw recognition adapter', () => {
  const SCAN = [
    {
      enzyme: 'EcoRI', site: 'GAATTC', siteLength: 6, cutCount: 1, isUnique: true,
      positions: [{ position: 10, strand: '+' }],
    },
    {
      enzyme: 'BamHI', site: 'GGATCC', siteLength: 6, cutCount: 2, isUnique: false,
      positions: [{ position: 20, strand: '+' }, { position: 40, strand: '-' }],
    },
  ];

  it('preserves enzyme, motif, recognition start (unshifted), length and strand', () => {
    const rows = flattenRawOccurrences(SCAN, { mode: 'all' });
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      enzyme: 'EcoRI', site: 'GAATTC', start: 10, length: 6, strand: 1,
    });
    // recognition start is NOT the cut position — EcoRI cut offset 1 must not leak in.
    expect(rows[0].start).toBe(10);
    const minus = rows.find((r) => r.enzyme === 'BamHI' && r.start === 40);
    expect(minus.strand).toBe(-1);
  });

  it('honours the shared enzyme allow-list and cut-count filter', () => {
    expect(flattenRawOccurrences(SCAN, { enzymes: ['EcoRI'] })
      .every((r) => r.enzyme === 'EcoRI')).toBe(true);
    expect(flattenRawOccurrences(SCAN, { mode: 'unique' })
      .every((r) => r.enzyme === 'EcoRI')).toBe(true);
  });

  it('returns an empty array for a non-array input', () => {
    expect(flattenRawOccurrences(null)).toEqual([]);
  });
});
