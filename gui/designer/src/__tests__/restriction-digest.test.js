import { describe, it, expect } from 'vitest';
import {
  digest,
  checkDoubleDigest,
  checkInsertSites,
  checkReadingFrame,
  generateRETail,
} from '../restriction-db.js';
import { digestCircular } from '../lib/restriction-digest.js';
import {
  getSegments, makeLocation, normalizeLocation,
} from '../lib/annotation-location.js';

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

  it('uses concrete XcmI overhang bases for directionality', () => {
    const first = `CCA${'A'.repeat(9)}TGG`;
    const second = `CCA${'C'.repeat(9)}TGG`;
    const result = digest(`${first}${'T'.repeat(10)}${second}${'T'.repeat(10)}`, [], 'XcmI');

    expect(result.error).toBeUndefined();
    expect(result.enzymes.map((cut) => cut.occurrence.overhang.seq)).toEqual(['A', 'C']);
    expect(result.isDirectional).toBe(true);
    expect(result.selfLigationRisk).toBe(false);
  });

  it('keeps BauI forward and reverse concrete overhangs distinct', () => {
    const result = digest(`CACGAG${'A'.repeat(10)}CTCGTG${'A'.repeat(10)}`, [], 'BauI');

    expect(result.error).toBeUndefined();
    expect(result.enzymes.map((cut) => cut.occurrence.overhang.seq)).toEqual(['ACGA', 'TCGT']);
    expect(result.isDirectional).toBe(true);
    expect(result.selfLigationRisk).toBe(false);
  });

  it('fails closed when opposite strands claim incompatible cuts at one locus', () => {
    const enzymes = {
      OverlapI: { site: 'AN', cut: [0, 1], end: '5prime', overhang: 'A', isCustom: true },
    };
    const result = digestCircular('ATGGGG', [], 'OverlapI', null, enzymes);

    expect(result.error).toMatch(/ambiguous opposite-strand occurrence/i);
  });

  it('deduplicates different recognition starts that resolve to one physical DSB', () => {
    const enzymes = {
      CoincidentI: { site: 'ACGTAA', cut: [1, 3], isCustom: true },
    };
    const result = digestCircular('TTACGTAA', [], 'CoincidentI', null, enzymes);

    expect(result.error).toBeUndefined();
    expect(result.type).toBe('linearize');
    expect(result.excised).toBeNull();
    expect(result.enzymes).toHaveLength(1);
    expect(result.enzymes[0].occurrence).toMatchObject({ topCut: 3, bottomCut: 5 });
  });

  it('fails closed when two enzymes share a top cut but claim different duplex geometry', () => {
    const enzymes = {
      IsoA: { site: 'ACGTTA', cut: [1, 4], isCustom: true },
      NeoB: { site: 'ACGTTA', cut: [1, 3], isCustom: true },
    };
    const result = digestCircular('GGGACGTTACCC', [], 'IsoA', 'NeoB', enzymes);

    expect(result.error).toMatch(/conflicting cut geometry/i);
    expect(result.backbone).toBeUndefined();
    expect(result.excised).toBeUndefined();
  });

  it('derives a blunt end from occurrence geometry, not inconsistent catalog text', () => {
    const enzymes = {
      FlatI: { site: 'GATATC', cut: [3, 3], end: '5prime', overhang: 'ATA', isCustom: true },
    };
    const result = digestCircular('AAAGATATCAAA', [], 'FlatI', null, enzymes);

    expect(result.error).toBeUndefined();
    expect(result.backbone.leftEnd).toMatchObject({ overhangType: 'blunt', overhang: null });
  });

  it('preserves canonical compound annotation geometry while rotating', () => {
    const annotation = {
      id: 'compound', name: 'compound', level: 'region', start: 120, end: 180,
      location: makeLocation('join', [
        { start: 120, end: 140 },
        { start: 160, end: 180 },
      ]),
    };
    const result = digest(SEQ_ECORI, [annotation], 'EcoRI');
    const [projected] = result.backbone.annotations;

    expect(getSegments(projected)).toEqual([
      { start: 19, end: 39 },
      { start: 59, end: 79 },
    ]);
    expect(projected).toMatchObject({ start: 19, end: 79 });
    expect(() => normalizeLocation(projected, { length: 500, topology: 'linear' }))
      .not.toThrow();
  });

  it('does not coalesce adjacent join components away from the circular origin seam', () => {
    const annotation = {
      id: 'adjacent-join', name: 'adjacent-join', level: 'region', start: 120, end: 160,
      location: makeLocation('join', [
        { start: 120, end: 140 },
        { start: 140, end: 160 },
      ]),
    };
    const result = digest(SEQ_ECORI, [annotation], 'EcoRI');
    const [projected] = result.backbone.annotations;

    expect(projected.location).toEqual({
      kind: 'join',
      segments: [{ start: 19, end: 39 }, { start: 39, end: 59 }],
    });
    expect(projected).toMatchObject({ start: 19, end: 59 });
  });

  it('does not infer an origin seam from endpoint coordinates in the wrong source order', () => {
    const annotation = {
      id: 'endpoint-join', name: 'endpoint-join', level: 'region', start: 0, end: 500,
      location: makeLocation('join', [
        { start: 0, end: 50 },
        { start: 450, end: 500 },
      ]),
    };
    const result = digest(SEQ_ECORI, [annotation], 'EcoRI');
    const [projected] = result.backbone.annotations;

    expect(projected.location).toEqual({
      kind: 'join',
      segments: [{ start: 349, end: 399 }, { start: 399, end: 449 }],
    });
    expect(projected).toMatchObject({ start: 349, end: 449 });
  });

  it('canonicalizes an origin-spanning feature that becomes contiguous after rotation', () => {
    const annotation = {
      id: 'origin-compound',
      name: 'origin-compound',
      level: 'region',
      strand: 1,
      start: 450,
      end: 50,
      location: makeLocation('join', [
        { start: 450, end: 500 },
        { start: 0, end: 50 },
      ]),
      qualifiers: { note: ['keep'] },
    };
    const result = digest(SEQ_ECORI, [annotation], 'EcoRI');

    expect(result.backbone.annotations).toEqual([
      expect.objectContaining({
        id: 'origin-compound',
        start: 349,
        end: 449,
        strand: 1,
        location: { kind: 'single', segments: [{ start: 349, end: 449 }] },
        qualifiers: { note: ['keep'] },
      }),
    ]);
    expect(result.backbone.annotations[0].segments).toBeUndefined();
  });

  it('sorts and coalesces a compound cut at the new linear boundary', () => {
    const annotation = {
      id: 'cut-compound',
      name: 'cut-compound',
      level: 'region',
      strand: 1,
      start: 450,
      end: 150,
      location: makeLocation('join', [
        { start: 450, end: 500 },
        { start: 0, end: 150 },
      ]),
    };
    const result = digest(SEQ_ECORI, [annotation], 'EcoRI');
    const [projected] = result.backbone.annotations;

    expect(projected).toMatchObject({
      id: 'cut-compound',
      start: 0,
      end: 500,
      location: {
        kind: 'join',
        segments: [{ start: 0, end: 49 }, { start: 349, end: 500 }],
      },
    });
    expect(() => normalizeLocation(projected, { length: 500, topology: 'linear' }))
      .not.toThrow();
  });

  it('preserves an excised annotation and both physical RE ends', () => {
    const annotation = {
      id: 'insert', name: 'insert', level: 'region', start: 150, end: 200,
      location: makeLocation('single', [{ start: 150, end: 200 }]),
    };
    const result = digest(SEQ_ECORI_BAMHI, [annotation], 'EcoRI', 'BamHI');

    expect(result.excised.annotations).toHaveLength(1);
    expect(getSegments(result.excised.annotations[0])).toEqual([{ start: 49, end: 99 }]);
    expect(result.excised.leftEnd.enzymeUsed).toBe('EcoRI');
    expect(result.excised.rightEnd.enzymeUsed).toBe('BamHI');
    expect(() => normalizeLocation(result.excised.annotations[0], {
      length: result.excised.length, topology: 'linear',
    })).not.toThrow();
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

  it('V122: a feature straddling the linearization cut is split into valid arcs', () => {
    // Cut at 101 (EcoRI). [50,200] straddles it. Old code rotated it into a
    // single start>end annotation (invalid on a linear molecule).
    const annotations = [{ name: 'WrapGene', start: 50, end: 200, type: 'CDS', level: 'region' }];
    const result = digest(SEQ_ECORI, annotations, 'EcoRI');
    const pieces = result.backbone.annotations.filter((a) => a.name === 'WrapGene');
    expect(pieces.length).toBe(2);              // split into two arcs
    for (const p of pieces) {
      expect(p.start).toBeLessThan(p.end);      // VALID (was start>end before fix)
      expect(p.start).toBeGreaterThanOrEqual(0);
      expect(p.end).toBeLessThanOrEqual(500);
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

  it('RC-BIO-5 — EcoRI → addedBases = 6 (reconstituted GAATTC), IN frame', () => {
    // After ligation the full ds recognition site sits in the product: GAATTC = 6 bp →
    // 6%3=0 → in frame. (The old code used the 4-bp ss overhang and wrongly said «not in
    // frame».) The frame quantity is the SITE length, not the overhang.
    const result = checkReadingFrame('EcoRI');
    expect(result.addedBases).toBe(6);
    expect(result.inFrame).toBe(true);
  });

  it('RC-BIO-5 — NcoI CCATGG → addedBases = 6, in frame', () => {
    const result = checkReadingFrame('NcoI');
    expect(result.addedBases).toBe(6);
    expect(result.inFrame).toBe(true);
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
