/**
 * Tests for region-aware split, fuse, and mutate operations.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { createFragmentSlice } from '../store/fragmentSlice';
import { convertDomainsToAnnotations } from '../assembly-utils';

function createTestStore() {
  return create(immer((set, get) => ({
    ...createFragmentSlice(set, get),
    assemblies: [],
    activeId: null,
  })));
}

// ═══ Test data ═══

// A fusion-like Part with two regions: promoter (0-90) + CDS (90-180)
const PROM_SEQ = 'AAAGGGCCC'.repeat(10); // 90bp
const CDS_SEQ  = 'ATGATGATG'.repeat(10); // 90bp
const FUSED_SEQ = PROM_SEQ + CDS_SEQ;    // 180bp

function makeFusedPart() {
  return {
    id: 'fused_1',
    name: 'PglaA-AsCpf1',
    type: 'fusion',
    sequence: FUSED_SEQ,
    length: FUSED_SEQ.length,
    annotations: [
      { id: 'r_prom', name: 'PglaA', type: 'promoter', start: 0, end: 90, level: 'region' },
      { id: 'r_cds', name: 'AsCpf1', type: 'CDS', start: 90, end: 180, level: 'region' },
      { name: 'TATA box', type: 'core_promoter', start: 70, end: 77, level: 'detail', regionId: 'r_prom' },
      { name: 'Signal', type: 'signal_peptide', start: 90, end: 120, level: 'detail', regionId: 'r_cds' },
      { name: 'RuvC', type: 'catalytic', start: 120, end: 165, level: 'detail', regionId: 'r_cds' },
      { name: 'BsaI', type: 'restriction_site', start: 50, end: 56, level: 'point' },
    ],
  };
}

// Simple single-region Parts for fusion test
function makePartA() {
  return {
    id: 'pA', name: 'PartA', type: 'promoter',
    sequence: PROM_SEQ, length: 90,
    annotations: [
      { id: 'rA', name: 'PartA', type: 'promoter', start: 0, end: 90, level: 'region' },
      { name: 'TATA', type: 'core_promoter', start: 70, end: 77, level: 'detail', regionId: 'rA' },
    ],
  };
}
function makePartB() {
  return {
    id: 'pB', name: 'PartB', type: 'CDS',
    sequence: CDS_SEQ, length: 90,
    annotations: [
      { id: 'rB', name: 'PartB', type: 'CDS', start: 0, end: 90, level: 'region' },
      { name: 'Signal', type: 'signal_peptide', start: 0, end: 30, level: 'detail', regionId: 'rB' },
    ],
  };
}

// ─── splitPart ─────────────────────────────────────────────

describe('splitPart — region-aware', () => {
  let store;
  beforeEach(() => { store = createTestStore(); store.getState().addPart(makeFusedPart()); });

  it('split at region boundary: clean split, no trimming', () => {
    const [id1, id2] = store.getState().splitPart('fused_1', 90);
    const p1 = store.getState().parts.find(p => p.id === id1);
    const p2 = store.getState().parts.find(p => p.id === id2);

    // Part 1 gets promoter region + its details
    const r1 = p1.annotations.filter(a => a.level === 'region');
    expect(r1).toHaveLength(1);
    expect(r1[0].type).toBe('promoter');
    expect(r1[0].end).toBe(90);

    const d1 = p1.annotations.filter(a => a.level === 'detail');
    expect(d1.some(a => a.name === 'TATA box')).toBe(true);

    // Part 2 gets CDS region + its details, shifted to 0-based
    const r2 = p2.annotations.filter(a => a.level === 'region');
    expect(r2).toHaveLength(1);
    expect(r2[0].type).toBe('CDS');
    expect(r2[0].start).toBe(0);
    expect(r2[0].end).toBe(90);

    const d2 = p2.annotations.filter(a => a.level === 'detail');
    expect(d2.some(a => a.name === 'Signal')).toBe(true);
    expect(d2.find(a => a.name === 'Signal').start).toBe(0);
    expect(d2.find(a => a.name === 'Signal').end).toBe(30);

    // No trimmed annotations
    expect(p1.annotations.some(a => a.trimmed)).toBe(false);
    expect(p2.annotations.some(a => a.trimmed)).toBe(false);
  });

  it('split mid-region: region cloned to both parts with new IDs', () => {
    // Split CDS region in the middle (position 135 = inside CDS at 90-180)
    const [id1, id2] = store.getState().splitPart('fused_1', 135);
    const p1 = store.getState().parts.find(p => p.id === id1);
    const p2 = store.getState().parts.find(p => p.id === id2);

    // Part 1: promoter region (intact) + CDS region (trimmed to 90-135)
    const r1 = p1.annotations.filter(a => a.level === 'region');
    expect(r1).toHaveLength(2);
    const cdsLeft = r1.find(a => a.type === 'CDS');
    expect(cdsLeft).toBeDefined();
    expect(cdsLeft.end).toBe(135);
    expect(cdsLeft.trimmed).toBe(true);
    expect(cdsLeft.id).not.toBe('r_cds'); // new ID

    // Part 2: CDS region (trimmed, 0 to 45)
    const r2 = p2.annotations.filter(a => a.level === 'region');
    expect(r2).toHaveLength(1);
    expect(r2[0].type).toBe('CDS');
    expect(r2[0].start).toBe(0);
    expect(r2[0].end).toBe(45);
    expect(r2[0].trimmed).toBe(true);
    expect(r2[0].id).not.toBe('r_cds'); // new ID
    expect(r2[0].id).not.toBe(cdsLeft.id); // different from left's new ID
  });

  it('split mid-detail: detail cloned to both parts', () => {
    // Split at 140 — RuvC (120-165) spans the cut
    const [id1, id2] = store.getState().splitPart('fused_1', 140);
    const p1 = store.getState().parts.find(p => p.id === id1);
    const p2 = store.getState().parts.find(p => p.id === id2);

    // RuvC should appear in both parts
    const ruvcLeft = p1.annotations.find(a => a.name?.includes('RuvC'));
    const ruvcRight = p2.annotations.find(a => a.name?.includes('RuvC'));
    expect(ruvcLeft).toBeDefined();
    expect(ruvcRight).toBeDefined();
    expect(ruvcLeft.end).toBe(140);   // clamped
    expect(ruvcRight.start).toBe(0);  // shifted
    expect(ruvcRight.end).toBe(25);   // 165 - 140
  });

  it('detail regionId is remapped to new region ID after split', () => {
    // Split at 135 — CDS region is split, details should point to new region IDs
    const [id1, id2] = store.getState().splitPart('fused_1', 135);
    const p1 = store.getState().parts.find(p => p.id === id1);
    const p2 = store.getState().parts.find(p => p.id === id2);

    const cdsRegionLeft = p1.annotations.find(a => a.level === 'region' && a.type === 'CDS');
    const signalLeft = p1.annotations.find(a => a.name === 'Signal');
    // Signal (90-120) is fully in left part — regionId should point to left CDS region
    expect(signalLeft.regionId).toBe(cdsRegionLeft.id);

    const cdsRegionRight = p2.annotations.find(a => a.level === 'region' && a.type === 'CDS');
    const ruvcRight = p2.annotations.filter(a => a.name?.includes('RuvC'));
    // RuvC that spans into right part should have right CDS region ID
    if (ruvcRight.length > 0) {
      expect(ruvcRight[0].regionId).toBe(cdsRegionRight.id);
    }
  });

  it('point annotations assigned to correct part', () => {
    // BsaI at 50-56, fully in left part when split at 90
    const [id1, id2] = store.getState().splitPart('fused_1', 90);
    const p1 = store.getState().parts.find(p => p.id === id1);
    const p2 = store.getState().parts.find(p => p.id === id2);

    expect(p1.annotations.some(a => a.name === 'BsaI')).toBe(true);
    expect(p2.annotations.some(a => a.name === 'BsaI')).toBe(false);
  });
});

// ─── fuseParts ─────────────────────────────────────────────

describe('fuseParts — region-aware', () => {
  let store;
  beforeEach(() => {
    store = createTestStore();
    store.getState().addPart(makePartA());
    store.getState().addPart(makePartB());
  });

  it('fused part has type=fusion and both regions', () => {
    const fusedId = store.getState().fuseParts('pA', 'pB', 'Fusion');
    const fused = store.getState().parts.find(p => p.id === fusedId);

    expect(fused.type).toBe('fusion');

    const regions = fused.annotations.filter(a => a.level === 'region');
    expect(regions).toHaveLength(2);
    expect(regions[0].type).toBe('promoter');
    expect(regions[0].start).toBe(0);
    expect(regions[0].end).toBe(90);
    expect(regions[1].type).toBe('CDS');
    expect(regions[1].start).toBe(90);   // shifted
    expect(regions[1].end).toBe(180);
  });

  it('detail regionIds are preserved through shift', () => {
    const fusedId = store.getState().fuseParts('pA', 'pB', 'Fusion');
    const fused = store.getState().parts.find(p => p.id === fusedId);

    const cdsRegion = fused.annotations.find(a => a.level === 'region' && a.type === 'CDS');
    const signal = fused.annotations.find(a => a.name === 'Signal');

    expect(signal.regionId).toBe(cdsRegion.id);
    expect(signal.start).toBe(90);   // shifted by junction
    expect(signal.end).toBe(120);
  });

  it('appears in children of BOTH parents', () => {
    const fusedId = store.getState().fuseParts('pA', 'pB', 'Fusion');
    const pA = store.getState().parts.find(p => p.id === 'pA');
    const pB = store.getState().parts.find(p => p.id === 'pB');

    expect(pA.children).toContain(fusedId);
    expect(pB.children).toContain(fusedId);
  });
});

// ─── createMutant ──────────────────────────────────────────

describe('createMutant — region annotations preserved', () => {
  let store;
  beforeEach(() => { store = createTestStore(); store.getState().addPart(makeFusedPart()); });

  it('mutant preserves all region and detail annotations', () => {
    const mutations = [
      { dnaPosition: 100, type: 'substitution', newCodon: 'GCG', label: 'X34A' },
    ];
    const mutantId = store.getState().createMutant('fused_1', mutations);
    const mutant = store.getState().parts.find(p => p.id === mutantId);

    const regions = mutant.annotations.filter(a => a.level === 'region');
    expect(regions).toHaveLength(2);
    expect(regions.map(r => r.type)).toEqual(['promoter', 'CDS']);

    const details = mutant.annotations.filter(a => a.level === 'detail');
    expect(details.length).toBeGreaterThanOrEqual(3); // TATA, Signal, RuvC
  });

  it('insertion shifts all downstream annotations', () => {
    const mutations = [
      { dnaPosition: 50, type: 'insertion', insertSequence: 'AAAAAA', label: 'ins6' },
    ];
    const mutantId = store.getState().createMutant('fused_1', mutations);
    const mutant = store.getState().parts.find(p => p.id === mutantId);

    // CDS region was at 90-180, should now be at 96-186
    const cds = mutant.annotations.find(a => a.level === 'region' && a.type === 'CDS');
    expect(cds.start).toBe(96);
    expect(cds.end).toBe(186);

    // Signal was at 90-120, now 96-126
    const signal = mutant.annotations.find(a => a.name === 'Signal');
    expect(signal.start).toBe(96);
    expect(signal.end).toBe(126);
  });
});

// ─── convertDomainsToAnnotations ───────────────────────────

describe('convertDomainsToAnnotations', () => {
  it('converts AA-based domains to nucleotide detail annotations', () => {
    const domains = [
      { name: 'Signal', type: 'signal', startAA: 1, endAA: 20, color: '#CC79A7' },
      { name: 'His6-tag', type: 'tag', startAA: 100, endAA: 106, color: '#F0E442' },
    ];

    const result = convertDomainsToAnnotations(domains, 'r1', 0);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      name: 'Signal', type: 'signal', start: 0, end: 60,
      level: 'detail', regionId: 'r1', migrated: true,
    });
    expect(result[1]).toMatchObject({
      name: 'His6-tag', type: 'tag', start: 297, end: 318,
      level: 'detail', regionId: 'r1',
    });
  });

  it('applies regionStart offset', () => {
    const domains = [{ name: 'D1', type: 'domain', startAA: 1, endAA: 10, color: '#56B4E9' }];
    const result = convertDomainsToAnnotations(domains, 'r2', 500);

    expect(result[0].start).toBe(500);
    expect(result[0].end).toBe(530);
  });

  it('returns empty for null/empty domains', () => {
    expect(convertDomainsToAnnotations(null, 'r1', 0)).toEqual([]);
    expect(convertDomainsToAnnotations([], 'r1', 0)).toEqual([]);
  });
});
