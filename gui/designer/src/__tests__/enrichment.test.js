import { describe, it, expect, vi } from 'vitest';

// Mock feature-detection module (dynamic import in enrichWithCommonFeatures).
// orf-detection is no longer imported here after Sprint M-X.1 K3 — ORFs
// are produced transiently by `runPredictors()` in the SequenceView
// consumer (DEC-PRED-06), not by `enrichWithCommonFeatures`.
vi.mock('../feature-detection', () => ({
  detectCommonFeaturesAsync: vi.fn().mockResolvedValue([]),
}));

import { enrichWithCommonFeatures } from '../auto-annotate';
import { detectCommonFeaturesAsync } from '../feature-detection';

describe('enrichWithCommonFeatures', () => {
  const genericMisc = (seqLen) => ({
    id: 'r1',
    name: 'Unknown',
    type: 'misc_feature',
    start: 0,
    end: seqLen,
    level: 'region',
    auto: true,
    detector: 'base',
  });

  it('generic misc_feature removed when real regions found', async () => {
    const seqLen = 4000;
    const sequence = 'A'.repeat(seqLen);
    const annotations = [genericMisc(seqLen)];

    detectCommonFeaturesAsync.mockResolvedValueOnce([
      { feature: { name: 'AmpR', type: 'marker', description: 'TEM-1' }, start: 100, end: 900, strand: 1, identity: 1.0, method: 'protein_exact' },
      { feature: { name: 'ori', type: 'rep_origin', description: 'pMB1' }, start: 1500, end: 2100, strand: 1, identity: 0.98, method: 'dna_identity' },
    ]);

    const enriched = await enrichWithCommonFeatures(sequence, annotations);

    // Generic misc_feature (0-4000, covers 100% > 80%) should be removed
    const miscFeatures = enriched.filter(a => a.type === 'misc_feature');
    expect(miscFeatures).toHaveLength(0);

    // Real regions should be present
    expect(enriched.find(a => a.name === 'AmpR')).toBeDefined();
    expect(enriched.find(a => a.name === 'ori')).toBeDefined();
  });

  it('misc_feature kept if no real regions found from DB', async () => {
    const seqLen = 4000;
    const sequence = 'A'.repeat(seqLen);
    const annotations = [genericMisc(seqLen)];

    detectCommonFeaturesAsync.mockResolvedValueOnce([]);

    const enriched = await enrichWithCommonFeatures(sequence, annotations);
    expect(enriched.filter(a => a.type === 'misc_feature')).toHaveLength(1);
  });

  it('existing named regions preserved and enriched (not overwritten)', async () => {
    const seqLen = 4000;
    const sequence = 'A'.repeat(seqLen);
    const existingAmpR = {
      name: 'AmpR',
      type: 'marker',
      start: 105,
      end: 905,
      level: 'region',
      auto: false,
    };
    const annotations = [existingAmpR];

    detectCommonFeaturesAsync.mockResolvedValueOnce([
      { feature: { name: 'AmpR', type: 'marker', description: 'TEM-1', aliases: ['bla'] }, start: 100, end: 900, strand: 1, identity: 1.0, method: 'protein_exact' },
    ]);

    const enriched = await enrichWithCommonFeatures(sequence, annotations);

    // Should enrich the existing annotation, not add a duplicate
    const amprs = enriched.filter(a => a.name === 'AmpR');
    expect(amprs).toHaveLength(1);
    expect(amprs[0].knownFeature).toBe('AmpR');
    expect(amprs[0].description).toBe('TEM-1');
  });

  // The «ORF detection runs ...» case from M-B.1 was deleted in
  // Sprint M-X.1 K3 — `enrichWithCommonFeatures` no longer imports or
  // calls `detectORFs`. ORF prediction is now transient (DEC-PRED-06)
  // and lives in `runPredictors()`/SequenceView. Coverage of the
  // ORF→render path is in `components/SequenceView/__tests__/
  // index-composition.test.jsx` cases 4–7.

  it('small misc_feature (<80% coverage) is preserved', async () => {
    const seqLen = 4000;
    const sequence = 'A'.repeat(seqLen);
    const smallMisc = {
      name: 'cloning scar',
      type: 'misc_feature',
      start: 1000,
      end: 1500,
      level: 'region',
      auto: true,
    };
    const annotations = [smallMisc];

    detectCommonFeaturesAsync.mockResolvedValueOnce([
      { feature: { name: 'AmpR', type: 'marker', description: 'TEM-1' }, start: 100, end: 900, strand: 1, identity: 1.0, method: 'protein_exact' },
    ]);

    const enriched = await enrichWithCommonFeatures(sequence, annotations);
    expect(enriched.filter(a => a.name === 'cloning scar')).toHaveLength(1);
  });
});
