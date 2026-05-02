import { useMemo, useRef, useState, useLayoutEffect } from 'react';
import { featureColor, FEATURE_STROKE } from '../../../../feature-palette';
import { ANNOTATION_COLORS } from '../../../../auto-annotate';
import { getTextColor } from '../../../../lib/color-utils';

/**
 * LinearFeatureBar — SVG-based linear feature strip with leader-labels
 * for small features (M-B.2 polish round 4).
 *
 * Replaces the AnnotationEditor's built-in <hideBar=false> strip in
 * Importer's AnnotationsTab. The built-in version only shows the label
 * INSIDE the block, so anything narrower than ~10% (ATG, 3xFLAG, NLS,
 * promoter regions, RBS sites) stays nameless. Here:
 *
 *   - Bar row 22 px: filled coloured rects per region, label inside if
 *     width >= IN_LABEL_THRESHOLD_PCT.
 *   - Leader row underneath: each region with width below threshold
 *     emits a 1 px vertical leader + label down with horizontal
 *     collision-staggering (similar to PlasmidMiniMap circular labels).
 *
 * Colour source: featureColor(type, name) — same A+v2 palette PlasmidMap
 * + AnnotationEditor (with ignoreOwnColor) use. Per-annotation `color`
 * field from .dna files is intentionally ignored — Importer is read-only
 * catalog context, palette must be unified.
 */

const BAR_H = 22;
const LEADER_LEN = 8;
const LABEL_H = 12;
const LABEL_GAP_PX = 2;
const IN_LABEL_THRESHOLD_PCT = 6.5;
const COLLISION_PX = 80;
const DENSITY_WINDOW_PX = 140;   // sample neighbours within this window
const ANGLED_SHIFT_PX = 32;      // how far the label slides sideways
const ANGLED_THRESHOLD = 1;      // density delta required to angle

function annColorPalette(ann) {
  return featureColor(ann?.type, ann?.name) || ANNOTATION_COLORS[ann?.type] || ANNOTATION_COLORS.misc;
}

export default function LinearFeatureBar({ annotations = [], seqLength = 0, onSelect }) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(800);

  useLayoutEffect(() => {
    if (!wrapRef.current) return undefined;
    const measure = () => {
      if (!wrapRef.current) return;
      const w = wrapRef.current.clientWidth;
      if (w > 0) setWidth(w);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const { items, leaderLabels, totalH } = useMemo(() => {
    if (!annotations.length || !seqLength) {
      return { items: [], leaderLabels: [], totalH: BAR_H };
    }
    const visible = annotations.filter((a) => a.level !== 'point');
    const its = visible.map((a, i) => {
      const startFrac = (a.start || 0) / seqLength;
      const widthFrac = Math.max(0, ((a.end || 0) - (a.start || 0))) / seqLength;
      const left = startFrac * width;
      const w = Math.max(2, widthFrac * width);
      const widthPct = widthFrac * 100;
      const color = annColorPalette(a);
      return {
        idx: i, ann: a,
        left, width: w, widthPct,
        color,
        labelInside: widthPct >= IN_LABEL_THRESHOLD_PCT,
        opacity: a.level === 'region' ? 0.92 : 0.7,
      };
    });

    // Leader labels for small items: pick those without inside label,
    // sort by left edge. For each, choose a horizontal direction toward
    // the lower-density side (angled leaders away from clusters), then
    // stagger Y when post-shift neighbours still collide.
    const small = its.filter((x) => !x.labelInside).sort((a, b) => a.left - b.left);
    const small_cx = small.map((x) => x.left + x.width / 2);

    // Pre-compute dirX (-1 left / +1 right / 0 straight) per item by
    // comparing neighbour count on each side within DENSITY_WINDOW_PX.
    const dirs = small_cx.map((cx) => {
      let leftN = 0, rightN = 0;
      for (const ocx of small_cx) {
        if (ocx === cx) continue;
        if (Math.abs(ocx - cx) > DENSITY_WINDOW_PX) continue;
        if (ocx < cx) leftN += 1; else rightN += 1;
      }
      if (leftN - rightN >= ANGLED_THRESHOLD) return 1;   // crowded left → angle right
      if (rightN - leftN >= ANGLED_THRESHOLD) return -1;  // crowded right → angle left
      return 0;
    });

    // Y staggering uses the post-shift label X (cx + dir * SHIFT). After
    // shifting, clamp label X within the SVG width so labels never spill
    // outside the visible bar — and compute available text width so we
    // can truncate names that don't fit.
    const PADDING = 8;
    const MIN_LABEL_W = 40;
    const ll = [];
    let lastLabelEdge = -Infinity;
    let row = 0;
    for (let i = 0; i < small.length; i++) {
      const x = small[i];
      const cx = small_cx[i];
      const dir = dirs[i];
      let labelX = cx + dir * ANGLED_SHIFT_PX;
      // Clamp: keep ≥PADDING from edges. If clamp pushes label opposite
      // to declared dir, recompute dir so anchor stays consistent.
      if (labelX < PADDING) { labelX = PADDING; }
      if (labelX > width - PADDING) { labelX = width - PADDING; }
      // Available text width depends on dir + remaining space on that side.
      const availW = dir > 0
        ? Math.max(MIN_LABEL_W, width - labelX - 4)
        : dir < 0
          ? Math.max(MIN_LABEL_W, labelX - 4)
          : Math.max(MIN_LABEL_W, Math.min(labelX, width - labelX) * 2 - 4);
      if (labelX - lastLabelEdge < COLLISION_PX) row += 1; else row = 0;
      lastLabelEdge = labelX;
      ll.push({
        idx: x.idx, ann: x.ann, color: x.color,
        cx, dir, labelX, availW,
        y: row * (LABEL_H + LABEL_GAP_PX),
      });
    }

    const maxRow = ll.reduce((m, x) => Math.max(m, x.y), 0);
    const leaderH = ll.length > 0 ? LEADER_LEN + maxRow + LABEL_H : 0;
    const total = BAR_H + leaderH + (ll.length > 0 ? 4 : 0);

    return { items: its, leaderLabels: ll, totalH: total };
  }, [annotations, seqLength, width]);

  if (!annotations.length || !seqLength) return null;

  return (
    <div ref={wrapRef} style={{ width: '100%', minWidth: 0 }}>
      <svg
        width={width}
        height={totalH}
        style={{ display: 'block', overflow: 'visible' }}
        data-testid="importer-linear-feature-bar"
      >
        {/* background track */}
        <rect x={0} y={0} width={width} height={BAR_H}
          fill="var(--surface-2)" rx={3} ry={3} />

        {/* feature blocks + inside labels */}
        {items.map((it) => (
          <g key={it.idx} onClick={() => onSelect?.(it.ann)} style={{ cursor: 'pointer' }}>
            <title>{`${it.ann.name || it.ann.type}: ${(it.ann.start || 0) + 1}..${it.ann.end || 0}`}</title>
            <rect
              x={it.left}
              y={0}
              width={it.width}
              height={BAR_H}
              fill={it.color}
              opacity={it.opacity}
              stroke={FEATURE_STROKE}
              strokeWidth={0.5}
              rx={2}
              ry={2}
            />
            {it.labelInside && it.width > 24 && (
              <text
                x={it.left + it.width / 2}
                y={BAR_H / 2 + 3}
                textAnchor="middle"
                fontSize={10}
                fontWeight={500}
                fill={getTextColor(it.color)}
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >{truncate(it.ann.name || it.ann.type, Math.floor(it.width / 7))}</text>
            )}
          </g>
        ))}

        {/* Leader lines + outside labels for small features. Two-segment
            polyline: drop straight from bar to leader-row Y, then jog
            sideways to the chosen direction (away from cluster). Pure
            vertical when dir=0 (no neighbours to dodge). */}
        {leaderLabels.map((l) => {
          const lineY1 = BAR_H;
          const dropY = BAR_H + LEADER_LEN + l.y;       // joint y where line bends
          const jointX = l.labelX - (l.dir * 4);         // tiny inset before label start
          const labelY = dropY + LABEL_H - 2;
          const textAnchor = l.dir > 0 ? 'start' : l.dir < 0 ? 'end' : 'start';
          const textXOffset = l.dir > 0 ? 4 : l.dir < 0 ? -4 : 4;
          return (
            <g key={`l-${l.idx}`} onClick={() => onSelect?.(l.ann)} style={{ cursor: 'pointer' }}>
              <polyline
                points={l.dir === 0
                  ? `${l.cx},${lineY1} ${l.cx},${dropY}`
                  : `${l.cx},${lineY1} ${l.cx},${dropY - 3} ${jointX},${dropY}`
                }
                fill="none"
                stroke={l.color}
                strokeWidth={1}
                strokeLinejoin="round"
                opacity={0.75}
              />
              <circle cx={l.cx} cy={lineY1} r={1.5} fill={l.color} opacity={0.85} />
              <text
                x={l.labelX + textXOffset}
                y={labelY}
                textAnchor={textAnchor}
                fontSize={10}
                fontFamily="var(--font-ui)"
                fill="var(--text-primary)"
                style={{ paintOrder: 'stroke fill', stroke: 'var(--surface-1)', strokeWidth: 2 }}
              >{truncate(l.ann.name || l.ann.type, Math.max(4, Math.floor(l.availW / 6)))}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function truncate(s, max) {
  if (!s) return '';
  if (max < 3) return '';
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)) + '…';
}
