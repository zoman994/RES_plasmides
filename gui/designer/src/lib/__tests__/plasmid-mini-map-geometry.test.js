/**
 * plasmid-mini-map-geometry.test.js — pure geometry extracted from
 * PlasmidMiniMap.jsx (size-budget decomp, 17.06.2026 — file pierced the
 * 40 KB hard limit after the SnapGene-overview work). These pin the math so
 * the component refactor is a behaviour-preserving move (regression guards
 * stay PlasmidMiniMap*.test.jsx / overview-tab*.test.jsx).
 *
 * Angle convention (shared with the component + plasmid-ruler): position 0 at
 * the TOP (12 o'clock), increasing CLOCKWISE; point = (cx+r·cosθ, cy+r·sinθ).
 */
import { describe, it, expect } from 'vitest';
import {
  LEADER_LEN,
  bpToLinearX,
  circularFeatureArc,
  circularTick,
  originMarkerGeom,
  circularArrowShape,
  linearArrowShape,
  featureGetsArrow,
  buildCircularLabels,
  buildLinearLabels,
  dedupeDominatedRegions,
  findDominatedRegions,
} from '../plasmid-mini-map-geometry';

describe('LEADER_LEN', () => {
  it('is the 10 px leader length the component reserves', () => {
    expect(LEADER_LEN).toBe(10);
  });
});

describe('dedupeDominatedRegions', () => {
  it('drops a generic marker covered by a near-identical CDS (the pUC18 AmpR/bla case)', () => {
    const regions = [
      { id: 'ampR', type: 'CDS', name: 'AmpR', start: 200, end: 1061, strand: 1 },
      { id: 'bla', type: 'marker', name: 'bla(M)', start: 266, end: 1061, strand: 1 },
    ];
    const kept = dedupeDominatedRegions(regions);
    expect(kept.map((r) => r.id)).toEqual(['ampR']); // marker dropped, CDS kept
  });

  it('keeps genuinely nested sub-features (short site inside a promoter — not near-identical)', () => {
    const regions = [
      { id: 'prom', type: 'promoter', name: 'lac', start: 100, end: 300, strand: 1 },
      { id: 'cap', type: 'protein_bind', name: 'CAP', start: 110, end: 140, strand: 1 },
    ];
    expect(dedupeDominatedRegions(regions).map((r) => r.id)).toEqual(['prom', 'cap']);
  });

  it('keeps two same-priority overlaps (two CDS) — only a strictly higher priority dominates', () => {
    const regions = [
      { id: 'a', type: 'CDS', name: 'a', start: 100, end: 500, strand: 1 },
      { id: 'b', type: 'CDS', name: 'b', start: 110, end: 495, strand: 1 },
    ];
    expect(dedupeDominatedRegions(regions).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('drops a near-identical "gene" in favour of the CDS (higher priority), preserves order', () => {
    const regions = [
      { id: 'gene', type: 'gene', name: 'g', start: 100, end: 500, strand: 1 },
      { id: 'cds', type: 'CDS', name: 'g', start: 100, end: 500, strand: 1 },
      { id: 'ori', type: 'rep_origin', name: 'ori', start: 800, end: 1200, strand: 1 },
    ];
    expect(dedupeDominatedRegions(regions).map((r) => r.id)).toEqual(['cds', 'ori']);
  });

  it('returns the input untouched for 0 or 1 region', () => {
    expect(dedupeDominatedRegions([])).toEqual([]);
    const one = [{ id: 'x', type: 'CDS', start: 0, end: 10 }];
    expect(dedupeDominatedRegions(one)).toBe(one);
  });
});

describe('findDominatedRegions (inverse — the removable duplicates)', () => {
  it('returns the dominated generic feature(s), the complement of the kept set', () => {
    const regions = [
      { id: 'ampR', type: 'CDS', name: 'AmpR', start: 200, end: 1061, strand: 1 },
      { id: 'bla', type: 'marker', name: 'bla(M)', start: 266, end: 1061, strand: 1 },
      { id: 'ori', type: 'rep_origin', name: 'ori', start: 1500, end: 2200, strand: 1 },
    ];
    expect(findDominatedRegions(regions).map((r) => r.id)).toEqual(['bla']);
    expect(dedupeDominatedRegions(regions).map((r) => r.id)).toEqual(['ampR', 'ori']);
  });

  it('is empty when nothing is dominated', () => {
    expect(findDominatedRegions([{ id: 'a', type: 'CDS', start: 0, end: 100 }])).toEqual([]);
    expect(findDominatedRegions([
      { id: 'a', type: 'CDS', start: 0, end: 100 },
      { id: 'b', type: 'CDS', start: 200, end: 300 },
    ])).toEqual([]);
  });
});

describe('rotation (rotationRad) — origin-rotate preview bakes angle into geometry', () => {
  it('circularFeatureArc adds rotationRad to the arc angles', () => {
    const base = circularFeatureArc(0, 100, 1000, 100, 100, 80, 0);
    const rotated = circularFeatureArc(0, 100, 1000, 100, 100, 80, Math.PI / 2);
    expect(base.a1).toBeCloseTo(-Math.PI / 2, 6); // bp 0 → top
    expect(rotated.a1).toBeCloseTo(0, 6); // -π/2 + π/2 → east (3 o'clock)
  });

  it('circularTick rotates the tick angle by rotationRad (bp 0 top → east after +π/2)', () => {
    const t = circularTick(0, 1000, 100, 100, 80, 5, null, Math.PI / 2);
    expect(t.x2).toBeGreaterThan(100); // moved clockwise to the east side
    expect(t.y2).toBeCloseTo(100, 0); // ~on the horizontal axis
  });

  it('rotationRad defaults to 0 — unchanged for existing callers', () => {
    expect(circularFeatureArc(0, 100, 1000, 100, 100, 80).a1)
      .toBe(circularFeatureArc(0, 100, 1000, 100, 100, 80, 0).a1);
  });
});

describe('bpToLinearX', () => {
  it('maps bp 0 → left pad (4 px) and full length → right pad (size-4)', () => {
    expect(bpToLinearX(0, 1000, 200)).toBe(4);
    expect(bpToLinearX(1000, 1000, 200)).toBe(196); // 200 - 4
  });
  it('maps the midpoint to the geometric centre (size/2)', () => {
    expect(bpToLinearX(500, 1000, 200)).toBe(100);
  });
  it('guards against a zero total (no divide-by-zero)', () => {
    expect(Number.isFinite(bpToLinearX(0, 0, 200))).toBe(true);
  });
});

describe('circularFeatureArc', () => {
  it('returns a full-circle sentinel when the span covers the whole length', () => {
    expect(circularFeatureArc(0, 1000, 1000, 100, 100, 80)).toEqual({ fullCircle: true });
    // off-by-1 imports (end = total-1) still collapse to a full circle
    expect(circularFeatureArc(0, 999, 1000, 100, 100, 80)).toEqual({ fullCircle: true });
  });

  it('builds an arc path (M…A…) for a partial span with a1/a2 angles', () => {
    const arc = circularFeatureArc(0, 250, 1000, 100, 100, 80);
    expect(arc.fullCircle).toBe(false);
    // start at top: a1 = 0/1000·2π − π/2 = −π/2
    expect(arc.a1).toBeCloseTo(-Math.PI / 2, 6);
    // quarter turn: a2 = 0.25·2π − π/2 = 0
    expect(arc.a2).toBeCloseTo(0, 6);
    expect(arc.arcPath.startsWith('M ')).toBe(true);
    expect(arc.arcPath).toContain(' A 80 80 0 ');
  });

  it('sets the large-arc flag to 1 only when the span exceeds half the circle', () => {
    expect(circularFeatureArc(0, 200, 1000, 100, 100, 80).arcPath).toContain(' 0 1 ');
    expect(circularFeatureArc(0, 700, 1000, 100, 100, 80).arcPath).toContain(' 1 1 ');
  });
});

describe('circularTick', () => {
  it('at bp 0 (12 o\'clock) the tick points straight up and centres its label', () => {
    const t = circularTick(0, 1000, 100, 100, 80, 5, 90);
    expect(t.x1).toBeCloseTo(100, 6);
    expect(t.y1).toBeCloseTo(20, 6); // cy - tickInner = 100 - 80
    expect(t.x2).toBeCloseTo(100, 6);
    expect(t.y2).toBeCloseTo(15, 6); // cy - (tickInner + len) = 100 - 85
    expect(t.anchor).toBe('middle');
  });

  it('at bp ¼ (3 o\'clock) the tick points right and left-anchors its label', () => {
    const t = circularTick(250, 1000, 100, 100, 80, 5, 90);
    expect(t.x1).toBeCloseTo(180, 6); // cx + tickInner
    expect(t.y1).toBeCloseTo(100, 6);
    expect(t.anchor).toBe('start');
  });

  it('omits label fields when no label radius is given', () => {
    const t = circularTick(0, 1000, 100, 100, 80, 5);
    expect(t).not.toHaveProperty('lx');
    expect(t).not.toHaveProperty('anchor');
  });
});

describe('originMarkerGeom', () => {
  it('marks the candidate origin with inner→outer line + label point (1-based bp)', () => {
    // bp 251 → 0-based 250 → angle 0 (due east of centre)
    const m = originMarkerGeom(251, 1000, 100, 100, 80, 10, 85, 5);
    expect(m.ix).toBeCloseTo(174, 6); // cx + (r - sw/2 - 1)
    expect(m.iy).toBeCloseTo(100, 6);
    expect(m.ox).toBeCloseTo(192, 6); // cx + (rOuterBand + majorLen + 2)
    expect(m.oy).toBeCloseTo(100, 6);
    expect(m.lx).toBeCloseTo(195, 6); // cx + (mo + 3)
    expect(m.anchor).toBe('start');
  });

  it('right-anchors the label when the marker sits on the west half', () => {
    // bp 751 → 0-based 750 → angle π (due west) → cos < 0 → end
    const m = originMarkerGeom(751, 1000, 100, 100, 80, 10, 85, 5);
    expect(m.anchor).toBe('end');
  });
});

describe('circularArrowShape', () => {
  it('returns a filled block path when the span fits a shouldered head', () => {
    const s = circularArrowShape(100, 100, 80, 10, 0, 1.2, 1);
    expect(s.kind).toBe('block');
    expect(typeof s.d).toBe('string');
    expect(s.d.startsWith('M ')).toBe(true);
  });

  it('falls back to a narrow triangle (3 points) for a span too short for a head', () => {
    const s = circularArrowShape(100, 100, 80, 10, 0, 0.05, 1);
    expect(s.kind).toBe('narrow');
    expect(s.points.trim().split(/\s+/).length).toBe(3);
  });
});

describe('linearArrowShape', () => {
  it('returns a 7-point block polygon for a wide enough bar', () => {
    const s = linearArrowShape(0, 100, 50, 10, 1);
    expect(s.kind).toBe('block');
    expect(s.points.trim().split(/\s+/).length).toBe(7);
  });

  it('falls back to a 3-point narrow triangle for a short bar', () => {
    const s = linearArrowShape(0, 8, 50, 10, 1);
    expect(s.kind).toBe('narrow');
    expect(s.points.trim().split(/\s+/).length).toBe(3);
  });

  it('points the head per the dir flag (lead edge differs for ±1)', () => {
    const fwd = linearArrowShape(0, 100, 50, 10, 1).points;
    const rev = linearArrowShape(0, 100, 50, 10, -1).points;
    expect(fwd).not.toBe(rev);
  });
});

describe('featureGetsArrow', () => {
  it('only CDS / promoter with a defined strand get an arrow (Игорь 17.06)', () => {
    expect(featureGetsArrow({ type: 'CDS', strand: 1 })).toBe(true);
    expect(featureGetsArrow({ type: 'promoter', strand: -1 })).toBe(true);
    expect(featureGetsArrow({ type: 'cds', strand: 1 })).toBe(true); // case-insensitive
  });
  it('non-directional types stay plain bands even with a strand', () => {
    expect(featureGetsArrow({ type: 'terminator', strand: 1 })).toBe(false);
    expect(featureGetsArrow({ type: 'rep_origin', strand: -1 })).toBe(false);
  });
  it('an undefined / 0 strand never gets an arrow', () => {
    expect(featureGetsArrow({ type: 'CDS', strand: 0 })).toBe(false);
    expect(featureGetsArrow({ type: 'CDS' })).toBe(false);
  });
});

describe('buildCircularLabels', () => {
  it('returns [] when no region is label-worthy', () => {
    expect(buildCircularLabels([], 1000, 100, 100, 80)).toEqual([]);
  });

  it('places a single region label with the top=0 clockwise convention', () => {
    const regions = [{ id: 'a', type: 'CDS', name: 'GeneA', start: 100, end: 400 }];
    const out = buildCircularLabels(regions, 1000, 100, 100, 80);
    expect(out).toHaveLength(1);
    const l = out[0];
    expect(l.key).toBe('a');
    expect(l.label).toBe('GeneA');
    // mid = 250 → frac 0.25 → ang 0 → due east of centre
    expect(l.ang).toBeCloseTo(0, 6);
    expect(l.innerX).toBeCloseTo(180, 6); // cx + r
    expect(l.outerX).toBeCloseTo(190, 6); // cx + r + LEADER_LEN
    expect(l.anchor).toBe('start');
    expect(typeof l.color).toBe('string');
  });

  it('staggers a second label that sits within the collision angle', () => {
    const regions = [
      { id: 'a', type: 'CDS', name: 'A', start: 100, end: 400 },   // mid 250 → ang 0
      { id: 'b', type: 'CDS', name: 'B', start: 110, end: 410 },   // mid 260 → ang ≈0.063
    ];
    const out = buildCircularLabels(regions, 1000, 100, 100, 80);
    const a = out.find((l) => l.key === 'a');
    const b = out.find((l) => l.key === 'b');
    expect(b.textY).toBeCloseTo(a.textY + 11, 6);
  });
});

describe('buildLinearLabels', () => {
  it('returns [] when no region is label-worthy', () => {
    expect(buildLinearLabels([], 1000, 200, 100, 10)).toEqual([]);
  });

  it('places a single region label above the bar (leader up by LEADER_LEN)', () => {
    const regions = [{ id: 'a', type: 'CDS', name: 'GeneA', start: 100, end: 400 }];
    const out = buildLinearLabels(regions, 1000, 200, 100, 10);
    expect(out).toHaveLength(1);
    const l = out[0];
    expect(l.key).toBe('a');
    expect(l.anchor).toBe('middle');
    expect(l.innerX).toBeCloseTo(52, 6);  // bpToLinearX(250, 1000, 200)
    expect(l.innerY).toBeCloseTo(95, 6);  // cy - strokeWidth/2
    expect(l.outerY).toBeCloseTo(85, 6);  // innerY - LEADER_LEN
  });
});
