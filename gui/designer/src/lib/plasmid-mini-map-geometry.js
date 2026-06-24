/**
 * plasmid-mini-map-geometry.js — pure geometry for PlasmidMiniMap.jsx.
 *
 * Extracted from the component (size-budget decomp, 17.06.2026: the file
 * pierced the 40 KB hard limit after the SnapGene-overview work — bp ruler +
 * strand arrows + centre label + click-to-set-origin). Everything here is
 * coordinate math with NO JSX / no React — the component keeps only rendering
 * + wiring. Unit-tested in `__tests__/plasmid-mini-map-geometry.test.js`;
 * visual behaviour is regression-guarded by PlasmidMiniMap*.test.jsx and
 * overview-tab*.test.jsx.
 *
 * Polar convention (shared with the component + plasmid-ruler): position 0 sits
 * at the TOP (12 o'clock), increasing CLOCKWISE. For a bp position p the draw
 * angle is `(p / length) · 2π − π/2` and the point is
 * `(cx + r·cos a, cy + r·sin a)` (SVG y-down).
 *
 * Label-selection / truncation rules live in plasmid-label-utils.js and are
 * shared with the canvas MiniPlasmidMap (different polar convention there, so
 * only the picking/truncation is shared — placement stays per-map).
 */

import { featureColorShaded } from '../feature-palette';
import { pickRegionsForLabels, truncateLabel } from './plasmid-label-utils';
import { angleForBp } from './plasmid-ruler';

export const LEADER_LEN = 10;             // px the leader sticks out past outer radius / above bar
const COLLISION_RAD = 0.26;               // ≈ 15° — circular labels closer than this get staggered
const COLLISION_PX = 40;                  // px — linear labels with anchors closer get staggered

// ── Directional feature shapes — вариант A «блок-стрелка» (Игорь 17.06.2026) ──
// A directional feature renders as ONE integrated filled shape: a band body
// that widens into a shouldered head tapering to a point at the leading edge
// (SnapGene / Benchling look). Features too short to fit a head fall back to a
// plain band + a NARROW flush triangle (Игорь — «узкий треугольник для коротких
// фич которые не помещаются»). Pure geometry; component renders the result.
const ARROW_HEAD_K = 1.5; // head length ≈ K × strokeWidth (÷r for circular angle)
const ARROW_SHOULDER_K = 0.38; // shoulder overhang past the band = K × strokeWidth
const ARROW_MIN_BLOCK_K = 2.6; // span must exceed K × strokeWidth (px-equiv) for a block head

function circFlags(from, to) {
  return `${Math.abs(to - from) > Math.PI ? 1 : 0} ${to > from ? 1 : 0}`;
}

// Circular directional feature over [a1,a2] (a2>a1), pointing per `dir` (±1).
// Returns { kind:'block', d } (SVG path) or { kind:'narrow', points } (polygon).
export function circularArrowShape(cx, cy, r, sw, a1, a2, dir) {
  const rIn = r - sw / 2;
  const rOut = r + sw / 2;
  const spanAng = a2 - a1;
  const P = (rad, a) => `${(cx + rad * Math.cos(a)).toFixed(2)} ${(cy + rad * Math.sin(a)).toFixed(2)}`;
  if (spanAng >= (sw * ARROW_MIN_BLOCK_K) / r) {
    const sh = sw * ARROW_SHOULDER_K;
    const headAng = Math.min(spanAng * 0.55, (sw * ARROW_HEAD_K) / r);
    let tail; let base; let tip;
    if (dir === 1) { tail = a1; base = a2 - headAng; tip = a2; } else { tail = a2; base = a1 + headAng; tip = a1; }
    const d = `M ${P(rOut, tail)} A ${rOut} ${rOut} 0 ${circFlags(tail, base)} ${P(rOut, base)} `
      + `L ${P(rOut + sh, base)} L ${P(r, tip)} L ${P(rIn - sh, base)} `
      + `L ${P(rIn, base)} A ${rIn} ${rIn} 0 ${circFlags(base, tail)} ${P(rIn, tail)} Z`;
    return { kind: 'block', d };
  }
  const hw = sw / 2;
  const aLead = dir === 1 ? a2 : a1;
  const tipAng = dir * Math.min(0.16, (sw * 0.95) / r);
  const Pc = (rad, a) => `${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`;
  return { kind: 'narrow', points: [Pc(r - hw, aLead), Pc(r + hw, aLead), Pc(r, aLead + tipAng)].join(' ') };
}

// Linear analogue along baseline cy over px band [x1,x2] (x2>x1), pointing ±1.
export function linearArrowShape(x1, x2, cy, sw, dir) {
  const hw = sw / 2;
  const barW = x2 - x1;
  if (barW >= sw * ARROW_MIN_BLOCK_K) {
    const sh = sw * ARROW_SHOULDER_K;
    const headLen = Math.min(barW * 0.55, sw * ARROW_HEAD_K);
    const lead = dir === 1 ? x2 : x1;
    const tail = dir === 1 ? x1 : x2;
    const base = lead - dir * headLen;
    const points = [
      `${tail.toFixed(2)},${(cy - hw).toFixed(2)}`,
      `${base.toFixed(2)},${(cy - hw).toFixed(2)}`,
      `${base.toFixed(2)},${(cy - hw - sh).toFixed(2)}`,
      `${lead.toFixed(2)},${cy.toFixed(2)}`,
      `${base.toFixed(2)},${(cy + hw + sh).toFixed(2)}`,
      `${base.toFixed(2)},${(cy + hw).toFixed(2)}`,
      `${tail.toFixed(2)},${(cy + hw).toFixed(2)}`,
    ].join(' ');
    return { kind: 'block', points };
  }
  const lead = dir === 1 ? x2 : x1;
  const tipX = lead + dir * sw * 0.95;
  const points = [
    `${lead.toFixed(2)},${(cy - hw).toFixed(2)}`,
    `${lead.toFixed(2)},${(cy + hw).toFixed(2)}`,
    `${tipX.toFixed(2)},${cy.toFixed(2)}`,
  ].join(' ');
  return { kind: 'narrow', points };
}

// Only biologically directional elements carry a strand arrow (Игорь 17.06 —
// «не у каждого должны быть стрелки, только у промоторов и CDS»). Other stranded
// features (rep_origin, primer_bind, terminator, misc_feature…) stay plain bands.
const ARROW_TYPES = new Set(['cds', 'promoter']);
export function featureGetsArrow(region) {
  if (region.strand !== 1 && region.strand !== -1) return false;
  return ARROW_TYPES.has(String(region.type || '').trim().toLowerCase());
}

// Visual de-duplication of overlapping near-identical annotations (Игорь 17.06 —
// pUC18 had AmpR `CDS` + bla(M) `marker` on the same locus, so the red CDS
// arrow sat on a tan marker band and read as one broken shape). When a generic
// feature (marker / misc / source / primer_bind …) shares a NEAR-IDENTICAL span
// with a higher-priority specific feature (CDS / promoter / gene), the generic
// one is just a second label of the same locus — drop it so the map shows one
// shape per locus.
//
// Conservative on purpose: requires RECIPROCAL overlap ≥ `overlapMin` (BOTH
// features ~the same span), so genuinely nested sub-features (a short CAP site
// inside a promoter, a domain inside a CDS) are NOT hidden; and only a STRICTLY
// higher-priority neighbour can dominate, so two same-type overlaps (two CDS)
// are always both kept. Stable: filter preserves input order.
const RENDER_PRIORITY = { cds: 3, promoter: 3, gene: 2 };
function renderPriority(type) {
  return RENDER_PRIORITY[String(type || '').trim().toLowerCase()] ?? 1;
}

// Regions that are DOMINATED — a strictly higher-priority neighbour covers
// ~the same span (reciprocal overlap ≥ overlapMin). These are the redundant
// duplicates: hidden by the map and removable by the «Убрать дубли» action.
export function findDominatedRegions(regions, overlapMin = 0.8) {
  if (!Array.isArray(regions) || regions.length < 2) return [];
  const span = (a) => {
    const s = Math.max(0, a.start || 0);
    const e = Math.max(s, a.end || 0);
    return [s, e, (e - s) || 1];
  };
  return regions.filter((r) => {
    const pr = renderPriority(r.type);
    const [rs, re, rlen] = span(r);
    return regions.some((s) => {
      if (s === r || renderPriority(s.type) <= pr) return false;
      const [ss, se, slen] = span(s);
      const ov = Math.min(re, se) - Math.max(rs, ss);
      if (ov <= 0) return false;
      return ov / rlen >= overlapMin && ov / slen >= overlapMin;
    });
  });
}

export function dedupeDominatedRegions(regions, overlapMin = 0.8) {
  if (!Array.isArray(regions) || regions.length < 2) return regions;
  const dominated = new Set(findDominatedRegions(regions, overlapMin));
  return dominated.size ? regions.filter((r) => !dominated.has(r)) : regions;
}

// bp → linear x-coordinate. The bar lives inside [4, size-4] (4 px pad each
// side); bp 0 → 4, full length → size-4, midpoint → size/2.
export function bpToLinearX(bp, totalLen, size) {
  return (bp / Math.max(1, totalLen)) * (size - 8) + 4;
}

// Circular feature arc over [start,end] bp. Returns { fullCircle:true } when the
// visible span equals the total length (e.g. a single feature spanning the whole
// backbone — the standard arc math collapses a1≈a2 into a degenerate slice, so
// the component draws a full <circle> instead). Otherwise returns the arc path
// string + its a1/a2 angles (the component needs them for the strand arrow).
export function circularFeatureArc(start, end, totalLen, cx, cy, r, rotationRad = 0) {
  const span = end - start;
  if (span >= totalLen - 1) return { fullCircle: true };
  const a1 = (start / totalLen) * 2 * Math.PI - Math.PI / 2 + rotationRad;
  const a2 = (end / totalLen) * 2 * Math.PI - Math.PI / 2 + rotationRad;
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const x2 = cx + r * Math.cos(a2);
  const y2 = cy + r * Math.sin(a2);
  const large = (a2 - a1) > Math.PI ? 1 : 0;
  const arcPath = `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  return { fullCircle: false, a1, a2, arcPath };
}

// Ruler tick geometry at bp `p`: a mark from `tickInner` outward by `tickLen`.
// When `labelR` is given, also returns the label anchor point + text-anchor
// (start east, end west, middle top/bottom).
export function circularTick(p, totalLen, cx, cy, tickInner, tickLen, labelR = null, rotationRad = 0) {
  const a = angleForBp(p, totalLen) + rotationRad;
  const x1 = cx + tickInner * Math.cos(a);
  const y1 = cy + tickInner * Math.sin(a);
  const x2 = cx + (tickInner + tickLen) * Math.cos(a);
  const y2 = cy + (tickInner + tickLen) * Math.sin(a);
  const out = { x1, y1, x2, y2 };
  if (labelR != null) {
    out.lx = cx + labelR * Math.cos(a);
    out.ly = cy + labelR * Math.sin(a);
    out.anchor = Math.cos(a) >= 0.2 ? 'start' : (Math.cos(a) <= -0.2 ? 'end' : 'middle');
  }
  return out;
}

// Candidate-origin marker at 1-based bp `bp1`: a radial line from just inside
// the band (`ix,iy`) out past the ruler (`ox,oy`) plus the label anchor point
// (`lx,ly`) + text-anchor (east → start, west → end).
export function originMarkerGeom(bp1, totalLen, cx, cy, r, strokeWidth, rOuterBand, majorLen) {
  const a = angleForBp(bp1 - 1, totalLen);
  const mi = r - strokeWidth / 2 - 1;
  const mo = rOuterBand + majorLen + 2;
  return {
    ix: cx + mi * Math.cos(a),
    iy: cy + mi * Math.sin(a),
    ox: cx + mo * Math.cos(a),
    oy: cy + mo * Math.sin(a),
    lx: cx + (mo + 3) * Math.cos(a),
    ly: cy + (mo + 3) * Math.sin(a),
    anchor: Math.cos(a) >= 0 ? 'start' : 'end',
  };
}

export function buildCircularLabels(regions, totalLen, cx, cy, r, leaderLen = LEADER_LEN, rotationRad = 0) {
  const picked = pickRegionsForLabels(regions, totalLen);
  if (!picked.length) return [];

  const items = picked.map((region) => {
    const start = Math.max(0, region.start);
    const end = Math.max(start, region.end);
    const midFrac = ((start + end) / 2) / Math.max(1, totalLen);
    // rotationRad rotates the label's anchor angle so it follows the spinning
    // plasmid; the TEXT itself stays horizontal (no SVG rotate transform), and
    // the anchor (east→start / west→end) is recomputed from the rotated angle.
    const ang = midFrac * 2 * Math.PI - Math.PI / 2 + rotationRad;
    const innerX = cx + r * Math.cos(ang);
    const innerY = cy + r * Math.sin(ang);
    const outerR = r + leaderLen;
    const outerX = cx + outerR * Math.cos(ang);
    const outerY = cy + outerR * Math.sin(ang);
    const anchor = Math.cos(ang) >= 0 ? 'start' : 'end';
    const textX = outerX + (anchor === 'start' ? 2 : -2);
    return {
      key: region.id,
      ang,
      label: truncateLabel(region.name || region.type || 'region'),
      color: featureColorShaded(region.type, region.name),
      innerX, innerY, outerX, outerY, anchor,
      textX, textY: outerY + 3,
    };
  });

  items.sort((a, b) => a.ang - b.ang);
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1];
    const cur = items[i];
    if (Math.abs(cur.ang - prev.ang) < COLLISION_RAD) {
      cur.textY = prev.textY + 11;
    }
  }
  return items;
}

export function buildLinearLabels(regions, totalLen, size, cy, strokeWidth) {
  const picked = pickRegionsForLabels(regions, totalLen);
  if (!picked.length) return [];

  const items = picked.map((region) => {
    const start = Math.max(0, region.start);
    const end = Math.max(start, region.end);
    const innerX = bpToLinearX((start + end) / 2, totalLen, size);
    const innerY = cy - strokeWidth / 2;
    const outerX = innerX;
    const outerY = innerY - LEADER_LEN;
    return {
      key: region.id,
      anchor: 'middle',
      label: truncateLabel(region.name || region.type || 'region'),
      color: featureColorShaded(region.type, region.name),
      innerX, innerY, outerX, outerY,
      textX: outerX, textY: outerY - 2,
    };
  });

  // Sort left-to-right; if anchors are within COLLISION_PX, stagger upward.
  items.sort((a, b) => a.innerX - b.innerX);
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1];
    const cur = items[i];
    if (Math.abs(cur.innerX - prev.innerX) < COLLISION_PX) {
      cur.outerY = prev.outerY - 11;
      cur.textY = cur.outerY - 2;
    }
  }
  return items;
}
