/**
 * Tests for region-aware auto-annotation model.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { autoAnnotate, generateAutoAnnotations, enrichWithCommonFeatures } from '../auto-annotate';
import { resetRegionCounter } from '../domain-detection';

beforeEach(() => resetRegionCounter());

// Helper: CDS sequence with signal peptide + His-tag at C-terminus
// Signal: MKFAIVLLAT... (hydrophobic), His-tag: HHHHHH at the end, stop TAA
const SIGNAL = 'ATGAAATTTGCGATTGTGCTGCTGGCGACC'; // M K F A I V L L A T (30bp, 10aa)
const CORE   = 'GAAGATCTGCGTAAGCCGGCG'.repeat(5);  // 105bp, 35aa of middle
const HISTAG = 'CATCATCATCATCATCAT';                 // H H H H H H (18bp, 6aa)
const STOP   = 'TAA';
const CDS_SEQ = SIGNAL + CORE + HISTAG + STOP;       // CDS with features

// Promoter with TATA box near end (TATA must be in last 50nt but not last 15nt)
// 60bp filler + TATAAAG (7bp) + 20bp after = 87bp
const PROMOTER_SEQ = 'AAAGGGCCC'.repeat(6) + 'CCAATGGGAAA' + 'TATAAAG' + 'AACCGGTTAACCGGTTAACC'; // 87bp

// Terminator with poly-A signal
const TERM_SEQ = 'GGGCCCAAATTT'.repeat(3) + 'AATAAA' + 'TTGGCCAA'; // ~50bp

describe('autoAnnotate — single-region Parts', () => {
  it('CDS Part: creates 1 region + detail annotations', () => {
    const anns = autoAnnotate({ name: 'TestCDS', type: 'CDS', sequence: CDS_SEQ });

    // Should have at least 1 region
    const regions = anns.filter(a => a.level === 'region');
    expect(regions).toHaveLength(1);
    expect(regions[0].type).toBe('CDS');
    expect(regions[0].start).toBe(0);
    expect(regions[0].end).toBe(CDS_SEQ.length);
    expect(regions[0].id).toBeTruthy();

    // Should have details with regionId pointing to the region
    const details = anns.filter(a => a.level === 'detail');
    expect(details.length).toBeGreaterThan(0);
    for (const d of details) {
      expect(d.regionId).toBe(regions[0].id);
    }

    // Should detect His-tag
    const hisTag = details.find(d => d.type === 'tag' && d.name.includes('His'));
    expect(hisTag).toBeDefined();

    // Should detect start codon (point level)
    const start = anns.find(a => a.type === 'start_codon');
    expect(start).toBeDefined();
    expect(start.level).toBe('point');
    expect(start.start).toBe(0);
    expect(start.end).toBe(3);

    // Should detect stop codon (point level)
    const stop = anns.find(a => a.type === 'stop_codon');
    expect(stop).toBeDefined();
    expect(stop.level).toBe('point');
    expect(stop.start).toBe(CDS_SEQ.length - 3);
    expect(stop.end).toBe(CDS_SEQ.length);
  });

  it('promoter Part: creates 1 region, no auto sub-features', () => {
    // Sub-feature scan (-10, -35, TATA, CAAT, RBS) was removed because 6-bp
    // consensus produced too many false positives. Region annotation stays.
    const anns = autoAnnotate({ name: 'TestProm', type: 'promoter', sequence: PROMOTER_SEQ });

    const regions = anns.filter(a => a.level === 'region');
    expect(regions).toHaveLength(1);
    expect(regions[0].type).toBe('promoter');

    const promoterDetails = anns.filter(a => a.level === 'detail' && a.type === 'core_promoter');
    expect(promoterDetails).toEqual([]);
  });

  it('terminator Part: creates 1 region, no auto poly-A', () => {
    const anns = autoAnnotate({ name: 'TestTerm', type: 'terminator', sequence: TERM_SEQ });

    const regions = anns.filter(a => a.level === 'region');
    expect(regions).toHaveLength(1);
    expect(regions[0].type).toBe('terminator');

    const polyA = anns.find(a => a.type === 'polyA_signal');
    expect(polyA).toBeUndefined();
  });
});

describe('autoAnnotate — multi-region (fusion) Parts', () => {
  it('respects pre-existing regions and runs detectors per-region', () => {
    const fusedSeq = PROMOTER_SEQ + CDS_SEQ;
    const junctionPos = PROMOTER_SEQ.length;

    const existingRegions = [
      { id: 'r_prom', name: 'PglaA', type: 'promoter', start: 0, end: junctionPos, level: 'region' },
      { id: 'r_cds', name: 'AsCpf1', type: 'CDS', start: junctionPos, end: fusedSeq.length, level: 'region' },
    ];

    const anns = autoAnnotate({
      name: 'PglaA-AsCpf1',
      type: 'fusion',
      sequence: fusedSeq,
      annotations: existingRegions,
    });

    // Both regions preserved
    const regions = anns.filter(a => a.level === 'region');
    expect(regions).toHaveLength(2);
    expect(regions.map(r => r.id)).toContain('r_prom');
    expect(regions.map(r => r.id)).toContain('r_cds');

    // Promoter no longer has auto details; CDS still does.
    const promDetails = anns.filter(a => a.level === 'detail' && a.regionId === 'r_prom');
    expect(promDetails).toEqual([]);

    // CDS details bound to r_cds
    const cdsDetails = anns.filter(a => a.level === 'detail' && a.regionId === 'r_cds');
    expect(cdsDetails.length).toBeGreaterThan(0);
    // All CDS detail coords should be offset by junctionPos
    for (const d of cdsDetails) {
      expect(d.start).toBeGreaterThanOrEqual(junctionPos);
      expect(d.end).toBeLessThanOrEqual(fusedSeq.length);
    }

    // Stop codon should be at the end of the CDS region (point level)
    const stop = anns.find(a => a.type === 'stop_codon' && a.regionId === 'r_cds');
    expect(stop).toBeDefined();
    expect(stop.level).toBe('point');
    expect(stop.start).toBe(fusedSeq.length - 3);
  });
});

describe('autoAnnotate — manual annotation preservation', () => {
  it('keeps manual annotations (without auto: true)', () => {
    const manual = { name: 'My region', type: 'misc', start: 10, end: 50, level: 'detail' };
    const anns = autoAnnotate({
      name: 'TestCDS', type: 'CDS', sequence: CDS_SEQ,
      annotations: [manual],
    });

    // Manual annotation preserved
    const found = anns.find(a => a.name === 'My region');
    expect(found).toBeDefined();
    expect(found.auto).toBeUndefined();
  });
});

describe('autoAnnotate — edge cases', () => {
  it('returns empty array for no sequence', () => {
    expect(autoAnnotate({ name: 'X', type: 'CDS' })).toEqual([]);
    expect(autoAnnotate({ name: 'X', type: 'CDS', sequence: '' })).toEqual([]);
  });

  it('misc type: creates region but no type-specific details', () => {
    const anns = autoAnnotate({ name: 'Spacer', type: 'misc_feature', sequence: 'ATGATGATG' });
    const regions = anns.filter(a => a.level === 'region');
    expect(regions).toHaveLength(1);
    expect(regions[0].type).toBe('misc_feature');
    const details = anns.filter(a => a.level === 'detail');
    expect(details).toHaveLength(0);
  });
});

describe('generateAutoAnnotations — compat wrapper', () => {
  it('returns existing annotations without modification', () => {
    const existing = [{ name: 'X', type: 'CDS', start: 0, end: 100 }];
    const result = generateAutoAnnotations({ name: 'T', type: 'CDS', sequence: 'ATG', annotations: existing });
    expect(result).toBe(existing); // same reference
  });

  it('generates region-aware annotations for new parts', () => {
    const result = generateAutoAnnotations({ name: 'T', type: 'CDS', sequence: CDS_SEQ });
    const regions = result.filter(a => a.level === 'region');
    expect(regions).toHaveLength(1);
    expect(regions[0].type).toBe('CDS');
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// ANN-0J Block 4 — ONE real enrichment path.
//
// Enrichment ADDS recognition; it must not rewrite where an annotation came
// from. Overwriting `source` made an imported feature indistinguishable from a
// database guess, and the Workspace — which counted `source === 'common_db'` —
// then reported zero recognised genes for exactly the files that had them.
//
// The bundled feature DB is empty under test, so a hit is guaranteed by
// stubbing the DB itself. The MERGE LOGIC under test is the real one.
// ═══════════════════════════════════════════════════════════════════════════

// 60 nt of a non-CDS element; matched on the DNA path at 100% identity.
const KNOWN_DNA = 'TTGACAGCTAGCTCAGTCCTAGGTATAATGCTAGCTACTAGAGAAAGAGGAGAAATACTA';

vi.mock('../store/commonFeaturesSlice', () => ({
  getMergedFeatureDB: async () => ({
    features: [{
      name: 'J23100_promoter',
      type: 'promoter',
      sequence: KNOWN_DNA,
      length: KNOWN_DNA.length,
    }],
  }),
}));

describe('ANN-0J/4 — enrichment preserves provenance', () => {
  function importedRegion(over = {}) {
    return {
      id: 'r1',
      name: 'my_own_label',
      type: 'promoter',
      start: 0,
      end: KNOWN_DNA.length,
      strand: 1,
      level: 'region',
      source: 'import',
      ...over,
    };
  }

  it('the fixture really does produce a homology hit', async () => {
    // Guards every assertion below: without a hit the provenance branch is
    // never reached and the rest of this block would be decorative.
    const [ann] = await enrichWithCommonFeatures(KNOWN_DNA, [importedRegion()]);
    expect(ann.knownFeature).toBe('J23100_promoter');
  }, 30000);

  it('an imported annotation stays source:import after enrichment', async () => {
    const [ann] = await enrichWithCommonFeatures(KNOWN_DNA, [importedRegion()]);
    expect(ann.knownFeature).toBeTruthy();
    expect(ann.source).toBe('import');
  }, 30000);

  it('the pre-enrichment name is recoverable after the rename', async () => {
    const [ann] = await enrichWithCommonFeatures(KNOWN_DNA, [importedRegion()]);
    expect(ann.knownFeature).toBeTruthy();
    const original = ann.importedName ?? ann.originalName;
    expect(original).toBe('my_own_label');
  }, 30000);

  it('a NEW detection with no prior source becomes common_db', async () => {
    const fresh = importedRegion();
    delete fresh.source;
    const [ann] = await enrichWithCommonFeatures(KNOWN_DNA, [fresh]);
    expect(ann.knownFeature).toBeTruthy();
    expect(ann.source).toBe('common_db');
  }, 30000);

  it('recognised imported annotations are countable without reading source', async () => {
    // The Workspace counter contract: recognition is knownFeature/detector,
    // provenance is source. Conflating them reported 0 genes for an
    // imported-and-recognised molecule.
    const anns = await enrichWithCommonFeatures(KNOWN_DNA, [importedRegion()]);
    const recognised = anns.filter((a) => a.knownFeature || a.source === 'common_db');
    const imported = anns.filter((a) => a.source === 'import');

    expect(recognised.length).toBeGreaterThan(0);
    expect(imported.length).toBeGreaterThan(0);
  }, 30000);
});
