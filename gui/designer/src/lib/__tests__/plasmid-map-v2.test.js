import { describe, it, expect } from 'vitest';
import {
  polar, featureArrow, smallMarker, layoutLabels, rulerStep, reLabelRotation,
  featuresFromFragments, wrapLabel, arcBand, arcStrokePath, collectIntronsByParent, TAU,
  buildReMarkers,
} from '../plasmid-map-v2.js';

describe('plasmid-map-v2 — buildReMarkers (RE label clustering)', () => {
  const T = 1000;
  it('collapses adjacent same-enzyme cuts within clusterArc into one ×k marker', () => {
    // 3 EcoRI at 100/110/120 bp — within ~0.13 rad of each other on a 1000bp circle.
    const sites = [
      { enzyme: 'EcoRI', pos: 100 }, { enzyme: 'EcoRI', pos: 110 }, { enzyme: 'EcoRI', pos: 120 },
    ];
    const m = buildReMarkers(sites, T, { clusterArc: 0.2 });
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ enzyme: 'EcoRI', count: 3 });
    expect(m[0].positions).toEqual([100, 110, 120]);
  });

  it('keeps spread same-enzyme cuts as separate single markers', () => {
    const sites = [
      { enzyme: 'EcoRI', pos: 100 }, { enzyme: 'EcoRI', pos: 500 }, { enzyme: 'EcoRI', pos: 900 },
    ];
    const m = buildReMarkers(sites, T, { clusterArc: 0.1 });
    expect(m).toHaveLength(3);
    expect(m.every((x) => x.count === 1)).toBe(true);
  });

  it('does not merge different enzymes even when adjacent', () => {
    const sites = [{ enzyme: 'EcoRI', pos: 100 }, { enzyme: 'BamHI', pos: 105 }];
    const m = buildReMarkers(sites, T, { clusterArc: 0.5 });
    expect(m).toHaveLength(2);
    expect(m.map((x) => x.enzyme).sort()).toEqual(['BamHI', 'EcoRI']);
  });

  it('sorts markers by angle and carries a representative angle', () => {
    const sites = [{ enzyme: 'EcoRI', pos: 900 }, { enzyme: 'BamHI', pos: 100 }];
    const m = buildReMarkers(sites, T, {});
    expect(m[0].enzyme).toBe('BamHI');
    expect(m[0].angle).toBeCloseTo((100 / T) * TAU, 5);
  });

  it('returns [] for empty / no total', () => {
    expect(buildReMarkers([], T)).toEqual([]);
    expect(buildReMarkers([{ enzyme: 'EcoRI', pos: 1 }], 0)).toEqual([]);
  });
});

describe('plasmid-map-v2 — polar', () => {
  it('0 rad = top (12 o\'clock)', () => {
    const p = polar(100, 100, 50, 0);
    expect(p.x).toBeCloseTo(100, 3);
    expect(p.y).toBeCloseTo(50, 3);
  });
  it('quarter turn = right (3 o\'clock), clockwise', () => {
    const p = polar(100, 100, 50, Math.PI / 2);
    expect(p.x).toBeCloseTo(150, 3);
    expect(p.y).toBeCloseTo(100, 3);
  });
});

describe('plasmid-map-v2 — featureArrow / smallMarker', () => {
  it('forward arrow path closes (Z) and has the tip near a1', () => {
    const d = featureArrow(100, 100, 0.2, 1.0, 1, 80, 60);
    expect(d.startsWith('M ')).toBe(true);
    expect(d.endsWith(' Z')).toBe(true);
  });
  it('reverse arrow path closes (Z)', () => {
    const d = featureArrow(100, 100, 0.2, 1.0, -1, 80, 60);
    expect(d.endsWith(' Z')).toBe(true);
  });
  it('smallMarker is a triangle (3 points, closed)', () => {
    const d = smallMarker(100, 100, 0.5, 1, 80, 60);
    expect((d.match(/L /g) || []).length).toBe(2); // M + 2L + Z = triangle
    expect(d.endsWith(' Z')).toBe(true);
  });
});

describe('plasmid-map-v2 — layoutLabels', () => {
  const cx = 300; const cy = 300;
  it('assigns right side for the top-right half, left for the rest', () => {
    const feats = [
      { name: 'A', midAngle: 1.0 }, // right
      { name: 'B', midAngle: 4.0 }, // left
    ];
    const out = layoutLabels(feats, cx, cy, 150, 250, 20, 580, 15);
    expect(out.find((f) => f.name === 'A').side).toBe(1);
    expect(out.find((f) => f.name === 'B').side).toBe(-1);
    expect(out.find((f) => f.name === 'A').labelX).toBe(cx + 250);
    expect(out.find((f) => f.name === 'B').labelX).toBe(cx - 250);
  });
  it('stacks overlapping labels on the same side with a minimum gap', () => {
    // three features clustered at the same angle on the right
    const feats = [
      { name: 'A', midAngle: 1.50 },
      { name: 'B', midAngle: 1.52 },
      { name: 'C', midAngle: 1.54 },
    ];
    const out = layoutLabels(feats, cx, cy, 150, 250, 20, 580, 15).sort((p, q) => p.labelY - q.labelY);
    expect(out[1].labelY - out[0].labelY).toBeGreaterThanOrEqual(15 - 0.01);
    expect(out[2].labelY - out[1].labelY).toBeGreaterThanOrEqual(15 - 0.01);
  });
  it('clamps the stack within [yTop, yBottom]', () => {
    const feats = Array.from({ length: 12 }, (_, i) => ({ name: `f${i}`, midAngle: 1.4 + i * 0.001 }));
    const out = layoutLabels(feats, cx, cy, 150, 250, 20, 580, 15);
    for (const it of out) { expect(it.labelY).toBeGreaterThanOrEqual(20 - 0.01); expect(it.labelY).toBeLessThanOrEqual(580 + 0.01); }
  });

  // --- height-aware generalization (rotation relayout + 2-line labels) ---
  it('compat lock: legacy 8-arg call equals 9-arg with lineH=0 (byte-identical layout)', () => {
    const feats = [
      { name: 'A', midAngle: 1.50 }, { name: 'B', midAngle: 1.52 }, { name: 'C', midAngle: 4.0 },
    ];
    const fmt = (out) => out.map((i) => [i.side, +i.labelX.toFixed(6), +i.labelY.toFixed(6)]);
    const legacy = layoutLabels(feats.map((f) => ({ ...f })), cx, cy, 150, 250, 20, 580, 15);
    const aware = layoutLabels(feats.map((f) => ({ ...f, lineCount: 1 })), cx, cy, 150, 250, 20, 580, 15, 0);
    expect(fmt(aware)).toEqual(fmt(legacy));
  });

  it('height-aware: stacks mixed 1/2-line labels with no box overlap (edge clearance >= gap)', () => {
    const lineH = 15; const gap = 6;
    const feats = [
      { name: 'A', midAngle: 1.50, lineCount: 2 },
      { name: 'B', midAngle: 1.52, lineCount: 1 },
      { name: 'C', midAngle: 1.54, lineCount: 2 },
    ];
    const out = layoutLabels(feats, cx, cy, 150, 250, 20, 580, gap, lineH).sort((p, q) => p.labelY - q.labelY);
    for (let k = 1; k < out.length; k++) {
      const prevBottom = out[k - 1].labelY + out[k - 1].h / 2;
      const curTop = out[k].labelY - out[k].h / 2;
      expect(curTop - prevBottom).toBeGreaterThanOrEqual(gap - 0.01);
    }
  });

  it('height-aware: tall first/last labels stay inside [yTop,yBottom] by their box edges', () => {
    const yTop = 20; const yBottom = 580; const lineH = 15;
    const feats = Array.from({ length: 6 }, (_, i) => ({ name: `f${i}`, midAngle: 1.45 + i * 0.005, lineCount: i % 2 ? 2 : 1 }));
    const out = layoutLabels(feats, cx, cy, 150, 250, yTop, yBottom, 6, lineH);
    for (const it of out) {
      expect(it.labelY - it.h / 2).toBeGreaterThanOrEqual(yTop - 0.5);
      expect(it.labelY + it.h / 2).toBeLessThanOrEqual(yBottom + 0.5);
    }
  });

  it('normalizes rotated angles: negative/over-TAU midAngle picks the correct screen side', () => {
    // unrotated 0.05 rotated by -10° → ~-0.124 → normalizes to ~6.16 (just left of top) → side -1
    const a1 = layoutLabels([{ name: 'X', midAngle: 0.05 - (10 * Math.PI / 180) }], cx, cy, 150, 250, 20, 580, 15);
    expect(a1[0].side).toBe(-1);
    // unrotated 0.3 rotated by -200° → ~-3.19 → normalizes to ~3.09 (< π, right half) → side +1
    const a2 = layoutLabels([{ name: 'Y', midAngle: 0.3 + (-200 * Math.PI / 180) }], cx, cy, 150, 250, 20, 580, 15);
    expect(a2[0].side).toBe(1);
  });
});

describe('plasmid-map-v2 — wrapLabel', () => {
  it('returns [""] for empty / null / undefined', () => {
    expect(wrapLabel('')).toEqual(['']);
    expect(wrapLabel(undefined)).toEqual(['']);
    expect(wrapLabel(null)).toEqual(['']);
  });
  it('keeps a name <= maxChars on one line (no split at exact length)', () => {
    expect(wrapLabel('lac promoter', 12)).toEqual(['lac promoter']); // exactly 12
    expect(wrapLabel('AmpR', 12)).toEqual(['AmpR']);
  });
  it('wraps on spaces into up to 2 lines', () => {
    expect(wrapLabel('AOX1 promoter', 12)).toEqual(['AOX1', 'promoter']);
  });
  it('hard-splits a single over-long token', () => {
    expect(wrapLabel('AAAAAAAAAAAAAAAA', 12, 2)).toEqual(['AAAAAAAAAAAA', 'AAAA']); // 16 → 12 + 4
  });
  it('ellipsizes the last line when content exceeds maxLines', () => {
    const out = wrapLabel('one two three four five', 6, 2);
    expect(out.length).toBe(2);
    expect(out[1].endsWith('…')).toBe(true);
  });
  it('collapses repeated / leading / trailing whitespace', () => {
    expect(wrapLabel('  foo   bar  ', 12)).toEqual(['foo bar']);
  });
});

describe('plasmid-map-v2 — rulerStep', () => {
  it('scales the step with total length', () => {
    expect(rulerStep(1500)).toBe(250);
    expect(rulerStep(5000)).toBe(500);
    expect(rulerStep(8432)).toBe(1000);
    expect(rulerStep(20000)).toBe(2000);
  });
});

describe('plasmid-map-v2 — reLabelRotation (radial, upright)', () => {
  it('right side ~horizontal, top ~vertical', () => {
    expect(reLabelRotation(Math.PI / 2)).toBeCloseTo(0, 3); // 90° → 0 (horizontal)
    expect(reLabelRotation(0)).toBeCloseTo(-90, 3); // top → vertical
  });
  it('left half flips to stay upright (no upside-down text)', () => {
    // 252° (lower-left) → 252-270 = -18 (near-horizontal, upright)
    expect(reLabelRotation(252 * Math.PI / 180)).toBeCloseTo(-18, 1);
    // every angle maps into (-90, 90]
    for (let d = 0; d < 360; d += 7) {
      const r = reLabelRotation(d * Math.PI / 180);
      expect(r).toBeGreaterThan(-90.001);
      expect(r).toBeLessThanOrEqual(90.001);
    }
  });
});

describe('plasmid-map-v2 — arcBand / arcStrokePath (intron-aware exon rendering)', () => {
  it('arcBand is a closed annular sector (M … Z)', () => {
    const d = arcBand(300, 300, 0.2, 1.0, 166, 138);
    expect(d.startsWith('M ')).toBe(true);
    expect(d.endsWith(' Z')).toBe(true);
    expect((d.match(/A /g) || []).length).toBe(2); // outer + inner arc
  });
  it('arcStrokePath is an OPEN single arc (no Z) for the intron connector', () => {
    const d = arcStrokePath(300, 300, 0.2, 1.0, 152);
    expect(d.startsWith('M ')).toBe(true);
    expect(d.endsWith(' Z')).toBe(false);
    expect((d.match(/A /g) || []).length).toBe(1);
  });
});

describe('plasmid-map-v2 — collectIntronsByParent', () => {
  it('groups intron details by parentId, skipping non-introns / no-parent / bad coords', () => {
    const anns = [
      { id: 'g', level: 'region', type: 'gene', start: 100, end: 900 },
      { id: 'i1', level: 'detail', type: 'intron', parentId: 'g', start: 300, end: 400 },
      { id: 'i2', level: 'detail', type: 'intron', parentId: 'g', start: 600, end: 650 },
      { id: 'd', level: 'detail', type: 'domain', parentId: 'g', start: 100, end: 200 }, // not an intron
      { id: 'orphan', level: 'detail', type: 'intron', start: 10, end: 20 }, // no parentId
      { id: 'bad', level: 'detail', type: 'intron', parentId: 'g', start: null, end: 20 }, // bad coords
    ];
    const m = collectIntronsByParent(anns);
    expect(m.get('g')).toEqual([[300, 400], [600, 650]]);
    expect(m.size).toBe(1);
  });
  it('returns an empty Map for empty / nullish input', () => {
    expect(collectIntronsByParent(null).size).toBe(0);
    expect(collectIntronsByParent([]).size).toBe(0);
  });
});

describe('plasmid-map-v2 — featuresFromFragments', () => {
  it('attaches offset-adjusted intron spans to a gene feature', () => {
    const frags = [
      { length: 1000, annotations: [{ id: 'a', name: 'A', type: 'CDS', start: 100, end: 400, strand: 1 }] },
      { length: 1000, annotations: [
        { id: 'g', name: 'glaA', type: 'gene', start: 100, end: 800, strand: 1, level: 'region' },
        { id: 'in', type: 'intron', level: 'detail', parentId: 'g', start: 300, end: 360 },
      ] },
    ];
    const identity = (anns) => anns.filter((a) => a.level !== 'detail');
    const out = featuresFromFragments(frags, identity);
    const gene = out.find((f) => f.id === 'g');
    expect(gene.start).toBe(1100); // 1000 offset + 100
    expect(gene.introns).toEqual([[1300, 1360]]); // 1000 offset + 300/360
    expect(out.find((f) => f.id === 'a').introns).toEqual([]); // no introns
  });
});

describe('plasmid-map-v2 — featuresFromFragments (legacy region shape)', () => {
  const identity = (anns) => anns;
  it('flattens a single fragment\'s annotations to absolute features', () => {
    const frags = [{ length: 5000, annotations: [
      { id: 'a', name: 'PglaA', type: 'promoter', start: 250, end: 950, strand: 1 },
      { id: 'b', name: 'XynTL', type: 'CDS', start: 971, end: 1990, strand: 1 },
    ] }];
    const out = featuresFromFragments(frags, identity);
    expect(out).toEqual([
      { id: 'a', name: 'PglaA', type: 'promoter', start: 250, end: 950, strand: 1, introns: [] },
      { id: 'b', name: 'XynTL', type: 'CDS', start: 971, end: 1990, strand: 1, introns: [] },
    ]);
  });
  it('offsets later fragments by accumulated length', () => {
    const frags = [
      { length: 1000, annotations: [{ id: 'x', name: 'A', type: 'CDS', start: 100, end: 400, strand: 1 }] },
      { length: 1000, annotations: [{ id: 'y', name: 'B', type: 'ori', start: 50, end: 300, strand: -1 }] },
    ];
    const out = featuresFromFragments(frags, identity);
    expect(out[1].start).toBe(1050); // 1000 offset + 50
    expect(out[1].end).toBe(1300);
    expect(out[1].strand).toBe(-1);
  });
  it('defaults strand to 1 and skips non-finite coords', () => {
    const frags = [{ length: 500, annotations: [
      { id: 'a', name: 'A', type: 'CDS', start: 10, end: 80 },
      { id: 'b', name: 'bad', type: 'CDS', start: null, end: 80 },
    ] }];
    const out = featuresFromFragments(frags, identity);
    expect(out).toHaveLength(1);
    expect(out[0].strand).toBe(1);
  });
  it('guards null fragments', () => {
    expect(featuresFromFragments(null, identity)).toEqual([]);
  });
});

describe('plasmid-map-v2 — TAU', () => {
  it('is 2π', () => { expect(TAU).toBeCloseTo(Math.PI * 2, 9); });
});
