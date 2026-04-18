import { describe, it, expect } from 'vitest';
import {
  digest,
  checkDoubleDigest,
  checkInsertSites,
  checkReadingFrame,
  generateRETail,
} from '../restriction-db.js';

// ═══════════════════════════════════════════════════════
// Helper: build a circular plasmid with one site of each enzyme
// ═══════════════════════════════════════════════════════
function makePlasmid(seq, annotations = []) {
  return { sequence: seq, annotations };
}

// EcoRI site GAATTC at position 100 in a 500bp sequence
const SEQ_ECORI = 'A'.repeat(100) + 'GAATTC' + 'T'.repeat(394);
// PstI site CTGCAG at position 100
const SEQ_PSTI = 'A'.repeat(100) + 'CTGCAG' + 'T'.repeat(394);
// EcoRV site GATATC at position 100
const SEQ_ECORV = 'A'.repeat(100) + 'GATATC' + 'T'.repeat(394);
// EcoRI at 100 + BamHI (GGATCC) at 300
const SEQ_ECORI_BAMHI = 'A'.repeat(100) + 'GAATTC' + 'C'.repeat(194) + 'GGATCC' + 'T'.repeat(194);
// Two EcoRI sites at 100 and 300
const SEQ_ECORI_X2 = 'A'.repeat(100) + 'GAATTC' + 'C'.repeat(194) + 'GAATTC' + 'T'.repeat(194);
// No RE sites
const SEQ_NONE = 'A'.repeat(200) + 'C'.repeat(300);
// Three EcoRI sites
const SEQ_ECORI_X3 = 'A'.repeat(50) + 'GAATTC' + 'C'.repeat(94) + 'GAATTC' + 'G'.repeat(94) + 'GAATTC' + 'T'.repeat(244);

// ═══════════════════════════════════════════════════════
// 1a. digest()
// ═══════════════════════════════════════════════════════
describe('digest()', () => {
  it('linearizes with EcoRI (5\' overhang)', () => {
    const result = digest(SEQ_ECORI, [], 'EcoRI');
    expect(result.error).toBeUndefined();
    expect(result.type).toBe('linearize');
    expect(result.backbone.length).toBe(500);
    expect(result.backbone.leftEnd.overhangType).toBe('5prime');
    expect(result.backbone.leftEnd.overhang).toBe('AATT');
    expect(result.backbone.leftEnd.enzymeUsed).toBe('EcoRI');
    expect(result.backbone.rightEnd.overhangType).toBe('5prime');
    expect(result.backbone.rightEnd.overhang).toBe('AATT');
    expect(result.excised).toBeNull();
    expect(result.isDirectional).toBe(false);
    expect(result.selfLigationRisk).toBe(true); // same ends → self-ligation
  });

  it('linearizes with PstI (3\' overhang)', () => {
    const result = digest(SEQ_PSTI, [], 'PstI');
    expect(result.error).toBeUndefined();
    expect(result.type).toBe('linearize');
    expect(result.backbone.leftEnd.overhangType).toBe('3prime');
    expect(result.backbone.leftEnd.overhang).toBe('TGCA');
    expect(result.backbone.rightEnd.overhangType).toBe('3prime');
  });

  it('linearizes with EcoRV (blunt)', () => {
    const result = digest(SEQ_ECORV, [], 'EcoRV');
    expect(result.error).toBeUndefined();
    expect(result.type).toBe('linearize');
    expect(result.backbone.leftEnd.overhangType).toBe('blunt');
    expect(result.backbone.leftEnd.overhang).toBeNull();
    expect(result.selfLigationRisk).toBe(true); // blunt → self-ligation possible
  });

  it('excises with EcoRI + BamHI (directional)', () => {
    const result = digest(SEQ_ECORI_BAMHI, [], 'EcoRI', 'BamHI');
    expect(result.error).toBeUndefined();
    expect(result.type).toBe('excise');
    expect(result.backbone).toBeDefined();
    expect(result.excised).toBeDefined();
    expect(result.excised.length).toBeGreaterThan(0);
    expect(result.backbone.length + result.excised.length).toBe(500);
    expect(result.isDirectional).toBe(true); // different overhangs → directional
    expect(result.selfLigationRisk).toBe(false);
    // After excision & rotation: backbone = [BamHI_cut..end] + [0..EcoRI_cut]
    // Left end inherits BamHI (right cut), right end inherits EcoRI (left cut)
    expect(result.backbone.leftEnd.enzymeUsed).toBe('BamHI');
    expect(result.backbone.rightEnd.enzymeUsed).toBe('EcoRI');
  });

  it('excises with EcoRI + EcoRI (self-ligation risk)', () => {
    const result = digest(SEQ_ECORI_X2, [], 'EcoRI');
    expect(result.error).toBeUndefined();
    expect(result.type).toBe('excise');
    expect(result.excised).toBeDefined();
    expect(result.selfLigationRisk).toBe(true); // same enzyme → same overhangs
    expect(result.isDirectional).toBe(false);
  });

  it('returns error when enzyme cuts 0 times', () => {
    const result = digest(SEQ_NONE, [], 'EcoRI');
    expect(result.error).toBeDefined();
    expect(result.error).toContain('0');
  });

  it('returns error when enzyme cuts 3 times', () => {
    const result = digest(SEQ_ECORI_X3, [], 'EcoRI');
    expect(result.error).toBeDefined();
    expect(result.error).toContain('3');
  });

  it('shifts annotations correctly on linearize', () => {
    const annotations = [
      { name: 'GeneA', start: 200, end: 400, type: 'CDS', level: 'region' },
      { name: 'PromoterB', start: 10, end: 80, type: 'promoter', level: 'region' },
    ];
    const result = digest(SEQ_ECORI, annotations, 'EcoRI');
    expect(result.error).toBeUndefined();
    // Annotations should be shifted: cut at position 101 (EcoRI cut [1,5] → fwd cut at 100+1=101)
    // All annotations should still be present
    expect(result.backbone.annotations.length).toBe(2);
    // Each annotation should have valid start/end within [0, seqLen)
    for (const ann of result.backbone.annotations) {
      expect(ann.start).toBeGreaterThanOrEqual(0);
      expect(ann.end).toBeLessThanOrEqual(500);
    }
  });
});

// ═══════════════════════════════════════════════════════
// 1b. checkDoubleDigest()
// ═══════════════════════════════════════════════════════
describe('checkDoubleDigest()', () => {
  it('both CutSmart 37C → simultaneous', () => {
    const result = checkDoubleDigest('EcoRI', 'BamHI');
    expect(result.simultaneous).toBe(true);
    expect(result.buffer).toBe('CutSmart');
    expect(result.temp).toBe(37);
    expect(result.warnings.length).toBe(0);
  });

  it('different buffers → sequential warning', () => {
    // BglII uses NEBuffer 3.1, EcoRI uses CutSmart
    const result = checkDoubleDigest('EcoRI', 'BglII');
    expect(result.simultaneous).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some(w => /sequential|buffer/i.test(w))).toBe(true);
  });

  it('dam-sensitive enzyme → warning', () => {
    // XbaI is damSensitive
    const result = checkDoubleDigest('EcoRI', 'XbaI');
    expect(result.warnings.some(w => /dam/i.test(w))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════
// 1c. checkInsertSites()
// ═══════════════════════════════════════════════════════
describe('checkInsertSites()', () => {
  it('insert without sites → empty', () => {
    const insert = 'ATGCCCGGGTTTAAACCC';
    const result = checkInsertSites(insert, 'EcoRI', 'BamHI');
    expect(result).toEqual([]);
  });

  it('insert with EcoRI site → warning + alternatives', () => {
    const insert = 'ATGCCCGAATTCAAACCC';
    const result = checkInsertSites(insert, 'EcoRI', 'BamHI');
    expect(result.length).toBeGreaterThan(0);
    const ecoriWarning = result.find(w => w.enzyme === 'EcoRI');
    expect(ecoriWarning).toBeDefined();
    expect(ecoriWarning.level).toBe('error');
    expect(ecoriWarning.alternatives).toContain('MfeI');
  });

  it('insert with BamHI site → warning + alternatives', () => {
    const insert = 'ATGCCCGGATCCAAACCC';
    const result = checkInsertSites(insert, 'EcoRI', 'BamHI');
    const bamhiWarning = result.find(w => w.enzyme === 'BamHI');
    expect(bamhiWarning).toBeDefined();
    expect(bamhiWarning.alternatives).toContain('BglII');
    expect(bamhiWarning.alternatives).toContain('BclI');
  });
});

// ═══════════════════════════════════════════════════════
// 1d. checkReadingFrame()
// ═══════════════════════════════════════════════════════
describe('checkReadingFrame()', () => {
  it('NcoI → containsATG true', () => {
    // NcoI: CCATGG, cut [1,5] → 1bp added between vector and insert
    const result = checkReadingFrame('NcoI');
    expect(result.containsATG).toBe(true);
    // site is CCATGG → contains ATG
  });

  it('EcoRI → addedBases = 4, not in frame', () => {
    // EcoRI: GAATTC, cut [1,5] → overhang AATT = 4bp → 4%3=1 → not in frame
    const result = checkReadingFrame('EcoRI');
    expect(result.addedBases).toBe(4);
    expect(result.inFrame).toBe(false);
  });

  it('NdeI → containsATG true', () => {
    // NdeI: CATATG → contains ATG
    const result = checkReadingFrame('NdeI');
    expect(result.containsATG).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════
// 1e. generateRETail()
// ═══════════════════════════════════════════════════════
describe('generateRETail()', () => {
  it('EcoRI → minFlanking=1 → protective + site', () => {
    const tail = generateRETail('EcoRI');
    // 1bp protective + GAATTC = 7bp total
    expect(tail.length).toBe(7);
    expect(tail.endsWith('GAATTC')).toBe(true);
  });

  it('BamHI → minFlanking=4 → 4bp protective + GGATCC', () => {
    const tail = generateRETail('BamHI');
    expect(tail.length).toBe(10);
    expect(tail.endsWith('GGATCC')).toBe(true);
  });

  it('unknown enzyme → empty string', () => {
    expect(generateRETail('FakeEnzyme')).toBe('');
  });

  it('blunt cutter EcoRV → protective + site', () => {
    const tail = generateRETail('EcoRV');
    // minFlanking=1 → 1bp + GATATC = 7bp
    expect(tail.endsWith('GATATC')).toBe(true);
    expect(tail.length).toBeGreaterThanOrEqual(7);
  });
});
