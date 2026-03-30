/**
 * Tests for region-aware auto-annotation model.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { autoAnnotate, generateAutoAnnotations } from '../auto-annotate';
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

  it('promoter Part: creates 1 region + regulatory details', () => {
    const anns = autoAnnotate({ name: 'TestProm', type: 'promoter', sequence: PROMOTER_SEQ });

    const regions = anns.filter(a => a.level === 'region');
    expect(regions).toHaveLength(1);
    expect(regions[0].type).toBe('promoter');

    // Should detect TATA box
    const details = anns.filter(a => a.level === 'detail');
    const tata = details.find(d => d.name.includes('TATA'));
    expect(tata).toBeDefined();
    expect(tata.regionId).toBe(regions[0].id);
  });

  it('terminator Part: creates 1 region + poly-A detail', () => {
    const anns = autoAnnotate({ name: 'TestTerm', type: 'terminator', sequence: TERM_SEQ });

    const regions = anns.filter(a => a.level === 'region');
    expect(regions).toHaveLength(1);
    expect(regions[0].type).toBe('terminator');

    const details = anns.filter(a => a.level === 'detail');
    const polyA = details.find(d => d.type === 'polyA_signal');
    expect(polyA).toBeDefined();
    expect(polyA.regionId).toBe(regions[0].id);
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

    // Promoter details bound to r_prom
    const promDetails = anns.filter(a => a.level === 'detail' && a.regionId === 'r_prom');
    expect(promDetails.length).toBeGreaterThan(0);
    // All promoter detail coords should be within promoter region
    for (const d of promDetails) {
      expect(d.start).toBeGreaterThanOrEqual(0);
      expect(d.end).toBeLessThanOrEqual(junctionPos);
    }

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
