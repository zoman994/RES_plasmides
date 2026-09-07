/**
 * Tests for scanAllSites(), detectMCS(), COMPATIBLE_OVERHANGS
 */
import { describe, it, expect } from 'vitest';
import {
  scanAllSites,
  detectMCS,
  COMPATIBLE_OVERHANGS,
  RE_ENZYMES,
  findSitesInSequence,
} from '../restriction-db';

// ═══ pUC19 MCS region (positions ~396–452) contains EcoRI, SacI, KpnI, XmaI/SmaI, BamHI, XbaI, SalI, PstI, SphI, HindIII
// We use a simplified test sequence with known RE sites embedded

// Build a 3000bp test sequence with known sites
const BACKBONE = 'ATGCATGCATGCATGCATGCATGCATGCATGC'.repeat(50); // 1600bp filler, no 6-cutters
const MCS_REGION =
  'AAGCTT' +   // HindIII  pos 0
  'GGATCC' +   // BamHI    pos 6
  'GAATTC' +   // EcoRI    pos 12
  'TCTAGA' +   // XbaI     pos 18
  'GTCGAC' +   // SalI     pos 24
  'CTGCAG' +   // PstI     pos 30
  'GCATGC' +   // SphI     pos 36
  'GATATC' +   // EcoRV    pos 42
  'CATATG' +   // NdeI     pos 48
  'GCGGCCGC';  // NotI     pos 54 (8-cutter)
// MCS = 62bp

const TEST_SEQ = BACKBONE.slice(0, 1000) + MCS_REGION + BACKBONE.slice(0, 938);
// Total = 1000 + 62 + 938 = 2000bp

describe('scanAllSites()', () => {
  it('finds known RE sites in test sequence', () => {
    const results = scanAllSites(TEST_SEQ, { circular: false });
    const enzymes = results.map(r => r.enzyme);

    expect(enzymes).toContain('EcoRI');
    expect(enzymes).toContain('BamHI');
    expect(enzymes).toContain('HindIII');
    expect(enzymes).toContain('XbaI');
    expect(enzymes).toContain('EcoRV');
    expect(enzymes).toContain('NotI');
  });

  it('returns correct positions for EcoRI', () => {
    const results = scanAllSites(TEST_SEQ, { circular: false });
    const ecori = results.find(r => r.enzyme === 'EcoRI');
    expect(ecori).toBeDefined();
    expect(ecori.positions.length).toBe(1);
    expect(ecori.positions[0].position).toBe(1012); // 1000 + 12
    expect(ecori.isUnique).toBe(true);
  });

  it('marks unique cutters correctly', () => {
    const results = scanAllSites(TEST_SEQ, { circular: false });
    const ecori = results.find(r => r.enzyme === 'EcoRI');
    expect(ecori.isUnique).toBe(true);
    expect(ecori.cutCount).toBe(1);
  });

  it('respects minSiteLen filter', () => {
    const results6 = scanAllSites(TEST_SEQ, { minSiteLen: 6 });
    const results8 = scanAllSites(TEST_SEQ, { minSiteLen: 8 });

    // 8-cutter filter should exclude 6-cutters
    const enzymes8 = results8.map(r => r.enzyme);
    expect(enzymes8).not.toContain('EcoRI'); // 6-cutter
    expect(enzymes8).toContain('NotI');       // 8-cutter
  });

  it('counts every IUPAC position when applying minSiteLen', () => {
    const xcmConcrete = `CCA${'A'.repeat(9)}TGG`;
    const results = scanAllSites(xcmConcrete, { circular: false, minSiteLen: 10 });

    expect(results.find((row) => row.enzyme === 'XcmI')).toMatchObject({
      site: 'CCANNNNNNNNNTGG',
      siteLength: 15,
      cutCount: 1,
    });
  });

  it('sorts by cutCount then enzyme name', () => {
    const results = scanAllSites(TEST_SEQ, { circular: false });
    for (let i = 1; i < results.length; i++) {
      const prev = results[i - 1], curr = results[i];
      if (prev.cutCount === curr.cutCount) {
        expect(prev.enzyme.localeCompare(curr.enzyme)).toBeLessThanOrEqual(0);
      } else {
        expect(prev.cutCount).toBeLessThanOrEqual(curr.cutCount);
      }
    }
  });

  it('skips DpnI, DpnII, MboI (methylation-dependent)', () => {
    const results = scanAllSites(TEST_SEQ, { circular: false });
    const enzymes = results.map(r => r.enzyme);
    expect(enzymes).not.toContain('DpnI');
    expect(enzymes).not.toContain('DpnII');
    expect(enzymes).not.toContain('MboI');
  });

  it('includes enzyme metadata in results', () => {
    const results = scanAllSites(TEST_SEQ, { circular: false });
    const ecori = results.find(r => r.enzyme === 'EcoRI');
    expect(ecori.site).toBe('GAATTC');
    expect(ecori.end).toBe('5prime');
    expect(ecori.overhang).toBe('AATT');
    expect(ecori.buffer).toBe('CutSmart');
  });

  it('handles circular wrap-around sites', () => {
    // Place half of EcoRI (GAA) at end and (TTC) at start
    const circSeq = 'TTCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAA';
    // circular: TTCAA...AAGAA → wraps to GAATTC
    const results = scanAllSites(circSeq, { circular: true });
    const ecori = results.find(r => r.enzyme === 'EcoRI');
    expect(ecori).toBeDefined();
    expect(ecori.cutCount).toBeGreaterThanOrEqual(1);
  });

  it('returns empty for sequence with no RE sites', () => {
    // All As — no 6-cutter site
    const results = scanAllSites('A'.repeat(100), { circular: false });
    expect(results.length).toBe(0);
  });
});

describe('detectMCS()', () => {
  it('detects MCS in sequence with dense unique sites', () => {
    const sites = scanAllSites(TEST_SEQ, { circular: false });
    const uniqueSites = sites.filter(s => s.isUnique);
    const mcs = detectMCS(uniqueSites, TEST_SEQ.length);

    expect(mcs).not.toBeNull();
    // MCS should be roughly around position 1000-1062
    expect(mcs.start).toBeGreaterThanOrEqual(990);
    expect(mcs.end).toBeLessThanOrEqual(1100);
    expect(mcs.siteCount).toBeGreaterThanOrEqual(4);
  });

  it('returns null for sequence without dense sites', () => {
    // Only 2 unique sites — not enough for MCS
    const fakeSites = [
      { isUnique: true, positions: [{ position: 100 }] },
      { isUnique: true, positions: [{ position: 500 }] },
    ];
    const mcs = detectMCS(fakeSites, 1000);
    expect(mcs).toBeNull();
  });

  it('returns null for empty sites', () => {
    const mcs = detectMCS([], 1000);
    expect(mcs).toBeNull();
  });
});

describe('COMPATIBLE_OVERHANGS', () => {
  it('groups BamHI and BglII under GATC_5prime', () => {
    expect(COMPATIBLE_OVERHANGS['GATC_5prime']).toContain('BamHI');
    expect(COMPATIBLE_OVERHANGS['GATC_5prime']).toContain('BglII');
  });

  it('groups EcoRI and MfeI under AATT_5prime', () => {
    expect(COMPATIBLE_OVERHANGS['AATT_5prime']).toContain('EcoRI');
    expect(COMPATIBLE_OVERHANGS['AATT_5prime']).toContain('MfeI');
  });

  it('separates 5prime and 3prime GGCC overhangs', () => {
    // NotI/EagI = 5' GGCC, ApaI = 3' GGCC — NOT compatible!
    expect(COMPATIBLE_OVERHANGS['GGCC_5prime']).toContain('NotI');
    expect(COMPATIBLE_OVERHANGS['GGCC_3prime']).toContain('ApaI');
    expect(COMPATIBLE_OVERHANGS['GGCC_5prime']).not.toContain('ApaI');
  });

  it('blunt end group includes EcoRV, SmaI, etc.', () => {
    expect(COMPATIBLE_OVERHANGS['blunt']).toContain('EcoRV');
    expect(COMPATIBLE_OVERHANGS['blunt']).toContain('SmaI');
    expect(COMPATIBLE_OVERHANGS['blunt']).toContain('NruI');
  });

  it('all enzymes in table exist in RE_ENZYMES', () => {
    for (const [group, enzymes] of Object.entries(COMPATIBLE_OVERHANGS)) {
      for (const enz of enzymes) {
        expect(RE_ENZYMES[enz], `${enz} from ${group} not in RE_ENZYMES`).toBeDefined();
      }
    }
  });
});

describe('RE_ENZYMES extended fields', () => {
  it('EcoRI has damSensitive and minFlanking', () => {
    expect(RE_ENZYMES.EcoRI.damSensitive).toBe(false);
    expect(RE_ENZYMES.EcoRI.minFlanking).toBe(1);
  });

  it('XbaI is Dam-sensitive', () => {
    expect(RE_ENZYMES.XbaI.damSensitive).toBe(true);
  });

  it('SmaI is Dcm-sensitive', () => {
    expect(RE_ENZYMES.SmaI.dcmSensitive).toBe(true);
  });

  it('NotI has minFlanking 6', () => {
    expect(RE_ENZYMES.NotI.minFlanking).toBe(6);
  });

  it('all enzymes have damSensitive and dcmSensitive fields', () => {
    for (const [name, info] of Object.entries(RE_ENZYMES)) {
      expect(typeof info.damSensitive, `${name} missing damSensitive`).toBe('boolean');
      expect(typeof info.dcmSensitive, `${name} missing dcmSensitive`).toBe('boolean');
    }
  });

  it('all enzymes have minFlanking field', () => {
    for (const [name, info] of Object.entries(RE_ENZYMES)) {
      expect(typeof info.minFlanking, `${name} missing minFlanking`).toBe('number');
    }
  });

  it('EcoRI has heatInactivation', () => {
    expect(RE_ENZYMES.EcoRI.heatInactivation).toBe('65°C/20min');
  });
});
