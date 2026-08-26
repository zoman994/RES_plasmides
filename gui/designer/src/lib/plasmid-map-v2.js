/**
 * plasmid-map-v2.js — pure geometry for the redesigned circular plasmid map
 * (Claude Designer «BodgeGene Design System (1)» PlasmidMap.jsx, принят Игорем
 * 20.06.2026). Feature ARROWS pointed by strand, a ruler, an origin marker, and
 * — ключевое — внешние подписи фич с лидер-линиями в две колонки (мелкие фичи
 * читаемы), RE-подписи РАДИАЛЬНЫЕ (не лезут на дуги/лидеры). Чистая половина —
 * здесь (юнит-тест без DOM); рендер — в PlasmidMap.jsx за флагом plasmidMapV2.
 */

import { getSegments } from './annotation-location';

export const TAU = Math.PI * 2;

/** Polar → cartesian, 0 rad = top (12 o'clock), clockwise. */
export function polar(cx, cy, r, a) {
  return { x: cx + r * Math.cos(a - Math.PI / 2), y: cy + r * Math.sin(a - Math.PI / 2) };
}

const f1 = (v) => (Math.round(v * 10) / 10);

/**
 * Strand-pointed feature arrow path between angles [a0,a1] in the band [iR,oR].
 * strand < 0 → arrowhead at a0 (ccw); else at a1 (cw). head = shorter (0.10).
 */
export function featureArrow(cx, cy, a0, a1, strand, oR, iR) {
  const mR = (oR + iR) / 2;
  const span = a1 - a0;
  const head = Math.min(0.10, span * 0.5);
  if (strand < 0) {
    const bA = a0 + head;
    const tip = polar(cx, cy, mR, a0);
    const o1 = polar(cx, cy, oR, bA); const o2 = polar(cx, cy, oR, a1);
    const i2 = polar(cx, cy, iR, a1); const i1 = polar(cx, cy, iR, bA);
    const lg = (a1 - bA) > Math.PI ? 1 : 0;
    return `M ${f1(tip.x)} ${f1(tip.y)} L ${f1(o1.x)} ${f1(o1.y)} A ${oR} ${oR} 0 ${lg} 1 ${f1(o2.x)} ${f1(o2.y)} L ${f1(i2.x)} ${f1(i2.y)} A ${iR} ${iR} 0 ${lg} 0 ${f1(i1.x)} ${f1(i1.y)} Z`;
  }
  const bA = a1 - head;
  const o0 = polar(cx, cy, oR, a0); const o1 = polar(cx, cy, oR, bA);
  const tip = polar(cx, cy, mR, a1);
  const i1 = polar(cx, cy, iR, bA); const i0 = polar(cx, cy, iR, a0);
  const lg = (bA - a0) > Math.PI ? 1 : 0;
  return `M ${f1(o0.x)} ${f1(o0.y)} A ${oR} ${oR} 0 ${lg} 1 ${f1(o1.x)} ${f1(o1.y)} L ${f1(tip.x)} ${f1(tip.y)} L ${f1(i1.x)} ${f1(i1.y)} A ${iR} ${iR} 0 ${lg} 0 ${f1(i0.x)} ${f1(i0.y)} Z`;
}

/**
 * Plain annular sector (band) between angles [a0,a1] in radii [iR,oR] — an exon
 * block with NO arrowhead. Spliced genes draw their non-terminal exons with this
 * (the terminal exon keeps the strand arrow via featureArrow) so introns show as
 * visible gaps between the bands.
 */
export function arcBand(cx, cy, a0, a1, oR, iR) {
  const o0 = polar(cx, cy, oR, a0); const o1 = polar(cx, cy, oR, a1);
  const i1 = polar(cx, cy, iR, a1); const i0 = polar(cx, cy, iR, a0);
  const lg = (a1 - a0) > Math.PI ? 1 : 0;
  return `M ${f1(o0.x)} ${f1(o0.y)} A ${oR} ${oR} 0 ${lg} 1 ${f1(o1.x)} ${f1(o1.y)} L ${f1(i1.x)} ${f1(i1.y)} A ${iR} ${iR} 0 ${lg} 0 ${f1(i0.x)} ${f1(i0.y)} Z`;
}

/** Open single arc (stroke path, no fill/close) at radius r — the dashed intron
 *  connector spanning the gap so the exon blocks still read as one gene. */
export function arcStrokePath(cx, cy, a0, a1, r) {
  const p0 = polar(cx, cy, r, a0); const p1 = polar(cx, cy, r, a1);
  const lg = (a1 - a0) > Math.PI ? 1 : 0;
  return `M ${f1(p0.x)} ${f1(p0.y)} A ${r} ${r} 0 ${lg} 1 ${f1(p1.x)} ${f1(p1.y)}`;
}

/**
 * Group intron `detail` annotations by their parent gene id. Introns live as
 * `{ level:'detail', type:'intron', regionId: <gene.id> }` — the model STANDARD
 * link (annotate-genes emits `regionId`; getDetails filters by `regionId`). V182:
 * legacy `parentId` is still accepted as a fallback, but `regionId` is canonical;
 * reading only `parentId` left standard introns un-split on the map. Returns
 * Map<geneId, [[start,end), …]>.
 */
export function collectIntronsByParent(annotations) {
  const m = new Map();
  for (const a of (annotations || [])) {
    if (!a || a.type !== 'intron') continue;
    const parent = a.regionId != null ? a.regionId : a.parentId;
    if (parent == null) continue;
    if (!Number.isFinite(a.start) || !Number.isFinite(a.end) || a.end <= a.start) continue;
    if (!m.has(parent)) m.set(parent, []);
    m.get(parent).push([a.start, a.end]);
  }
  return m;
}

/** Tiny triangular marker for features too short to draw a proper arrow. */
export function smallMarker(cx, cy, a, strand, oR, iR) {
  const w = 0.05;
  const ahead = strand < 0 ? a - w : a + w;
  const tip = polar(cx, cy, (oR + iR) / 2, ahead);
  const b1 = polar(cx, cy, oR, strand < 0 ? a + w : a - w);
  const b2 = polar(cx, cy, iR, strand < 0 ? a + w : a - w);
  return `M ${f1(tip.x)} ${f1(tip.y)} L ${f1(b1.x)} ${f1(b1.y)} L ${f1(b2.x)} ${f1(b2.y)} Z`;
}

/**
 * Two-column callout layout: anchor each label on its feature, then stack
 * labels down each side so their glyph boxes never overlap. Returns each input
 * feature augmented with {a, anchor, side(1=right/-1=left), labelX, labelY, h}.
 *
 * `a` (and therefore `side`/`anchor`) is NORMALIZED into [0,TAU) — load-bearing:
 * the rotating minimap feeds midAngle+rotRad which goes negative or past TAU, and
 * the side rule `(a>0 && a<PI)` would otherwise pick the wrong screen column.
 *
 * Height-aware (optional `lineH`): a label of `lineCount` lines has box height
 * h = lineCount*lineH, and stacking keeps an edge-to-edge clearance `gap` between
 * boxes (clamp uses labelY±h/2 so a 2-line label can't poke past the band). When
 * `lineH` is omitted, h=0 and the recurrence collapses to the legacy
 * center-to-center spacing `prevY+gap` — byte-identical to the pre-height layout
 * (the 8-arg callers and their tests are unaffected). If a column would overstack
 * the band, the gap is compressed proportionally so it still (mostly) fits.
 */
export function layoutLabels(feats, cx, cy, anchorR, colX, yTop, yBottom, gap, lineH) {
  const items = feats.map((f) => {
    const a = ((f.midAngle % TAU) + TAU) % TAU;
    const anchor = polar(cx, cy, anchorR, a);
    const side = (a > 0 && a < Math.PI) ? 1 : -1;
    const h = lineH ? (f.lineCount || 1) * lineH : 0;
    return { ...f, a, anchor, side, idealY: anchor.y, h };
  });
  for (const side of [1, -1]) {
    const col = items.filter((i) => i.side === side).sort((p, q) => p.idealY - q.idealY);
    if (!col.length) continue;
    const n = col.length;
    const sumH = col.reduce((s, it) => s + it.h, 0);
    const band = yBottom - yTop;
    // Compress the gap only if the column would overflow the band (dense plasmids).
    // Floor at 0 (not 2): a feasible column (sumH < band) must always pack inside
    // the band — a 2px floor would make a dense-but-feasible column overflow and
    // then fight the edge clamp.
    const needed = sumH + (n - 1) * gap;
    const gapEff = (n > 1 && needed > band) ? Math.max(0, (band - sumH) / (n - 1)) : gap;
    let prevBottom = -Infinity; // legacy (h=0) path must reduce to prevY+gap
    for (const it of col) {
      it.labelY = Math.max(it.idealY, prevBottom + gapEff + it.h / 2);
      prevBottom = it.labelY + it.h / 2;
    }
    // Edge-based clamp: keep the full glyph box within [yTop, yBottom].
    const lastBottom = col[n - 1].labelY + col[n - 1].h / 2;
    if (lastBottom > yBottom) for (const it of col) it.labelY -= (lastBottom - yBottom);
    const firstTop = col[0].labelY - col[0].h / 2;
    if (firstTop < yTop) for (const it of col) it.labelY += (yTop - firstTop);
    for (const it of col) { it.labelX = cx + side * colX; }
  }
  return items;
}

/**
 * Wrap a feature name into up to `maxLines` lines of <= `maxChars` each, for SVG
 * <tspan> rendering (SVG text has no auto-wrap). Greedy word-pack; a single token
 * longer than maxChars is hard-split; if content still overflows maxLines the last
 * kept line is ellipsised. Empty/nullish → [''] (never a literal "undefined").
 */
export function wrapLabel(name, maxChars = 12, maxLines = 2) {
  const s = (name == null ? '' : String(name)).trim().replace(/\s+/g, ' ');
  if (!s) return [''];
  if (s.length <= maxChars) return [s];
  const tokens = [];
  for (const w of s.split(' ')) {
    let t = w;
    while (t.length > maxChars) { tokens.push(t.slice(0, maxChars)); t = t.slice(maxChars); }
    if (t) tokens.push(t);
  }
  const lines = [];
  let line = '';
  for (const t of tokens) {
    if (!line) line = t;
    else if (line.length + 1 + t.length <= maxChars) line += ` ${t}`;
    else { lines.push(line); line = t; }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let lastLine = kept[maxLines - 1];
  if (lastLine.length > maxChars - 1) lastLine = lastLine.slice(0, maxChars - 1);
  kept[maxLines - 1] = `${lastLine}…`;
  return kept;
}

/** Ruler major-tick step (bp) by total length. */
export function rulerStep(total) {
  if (total <= 2000) return 250;
  if (total <= 6000) return 500;
  if (total <= 12000) return 1000;
  return 2000;
}

/**
 * Radial RE-label rotation (deg) so the enzyme name reads along the spoke and
 * stays inside its angular sector (never bleeds sideways onto a feature arc or
 * a leader line). Kept upright: left half (aDeg>180) flips.
 */
export function reLabelRotation(a) {
  const aDeg = (a * 180) / Math.PI;
  return aDeg > 180 ? (aDeg - 270) : (aDeg - 90);
}

/**
 * Group RE cut sites into labelled markers for the de-collided external label
 * layout (Игорь 21.06 — «хинды налезают»: the old radial inner labels overlapped
 * when cuts clustered). Consecutive cuts of the SAME enzyme that fall within
 * `clusterArc` radians collapse into one «Enzyme ×k» marker (positions kept for
 * the tooltip); everything else stays a single «Enzyme · pos» marker. The rest
 * (still-overlapping but distinct markers) are spread by layoutLabels downstream.
 * Pure; markers sorted by angle. `pos` is bp; `angle = (pos/total)·TAU`.
 */
export function buildReMarkers(reSites, total, opts = {}) {
  const clusterArc = opts.clusterArc != null ? opts.clusterArc : 0.12; // ~6.9°
  if (!total || !Array.isArray(reSites) || !reSites.length) return [];
  const sorted = reSites
    .filter((s) => s && Number.isFinite(s.pos))
    .map((s) => ({ enzyme: s.enzyme, pos: s.pos, angle: (s.pos / total) * TAU }))
    .sort((a, b) => a.angle - b.angle);
  const groups = [];
  for (const s of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.enzyme === s.enzyme && (s.angle - last.lastAngle) <= clusterArc) {
      last.positions.push(s.pos);
      last.lastAngle = s.angle;
    } else {
      groups.push({ enzyme: s.enzyme, positions: [s.pos], firstAngle: s.angle, lastAngle: s.angle });
    }
  }
  return groups.map((g) => ({
    enzyme: g.enzyme,
    positions: g.positions,
    count: g.positions.length,
    angle: (g.firstAngle + g.lastAngle) / 2,
  }));
}

/**
 * Flatten assembly fragments' region-annotations into a flat feature list for
 * the feature-centric map: [{start,end,type,strand,name,id}] in absolute bp.
 * `getRegionsFn` is annotation-model::getRegions (region-level only), injected
 * to keep this module pure/testable.
 */
export function featuresFromFragments(fragments, getRegionsFn) {
  const out = [];
  let offset = 0;
  for (const f of (fragments || [])) {
    const len = f.length || (f.sequence ? f.sequence.length : 0);
    const anns = f.annotations || [];
    const regions = typeof getRegionsFn === 'function'
      ? (getRegionsFn(anns) || [])
      : anns;
    const intronsByParent = collectIntronsByParent(anns);
    for (const r of regions) {
      if (!Number.isFinite(r.start) || !Number.isFinite(r.end)) continue;
      const kids = intronsByParent.get(r.id) || [];
      out.push({
        id: r.id,
        name: r.name || r.type || '—',
        type: r.type || 'misc',
        // ANN-0A — carry the canonical segments (shifted into concatenated
        // coordinates) so a compound feature survives this reshape too.
        segments: getSegments(r).map((s) => ({
          start: offset + s.start, end: offset + s.end,
        })),
        start: offset + r.start,
        end: offset + r.end,
        strand: Number.isFinite(r.strand) ? r.strand : 1,
        introns: kids.map(([s, e]) => [offset + s, offset + e]),
      });
    }
    offset += len;
  }
  return out;
}
