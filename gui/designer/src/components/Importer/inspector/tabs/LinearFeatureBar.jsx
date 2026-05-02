import { useMemo, useRef, useState, useLayoutEffect } from 'react';
import { featureColor } from '../../../../feature-palette';
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
    // sort by left edge, stagger Y when neighbours within COLLISION_PX.
    const small = its.filter((x) => !x.labelInside).sort((a, b) => a.left - b.left);
    let lastX = -Infinity;
    let row = 0;
    const ll = small.map((x) => {
      const cx = x.left + x.width / 2;
      if (cx - lastX < COLLISION_PX) row += 1; else row = 0;
      lastX = cx;
      return {
        idx: x.idx, ann: x.ann, color: x.color,
        cx,
        // y of label baseline (relative to top of leader area)
        y: row * (LABEL_H + LABEL_GAP_PX),
      };
    });

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

        {/* leader lines + outside labels for small features */}
        {leaderLabels.map((l) => {
          const lineY1 = BAR_H;
          const lineY2 = BAR_H + LEADER_LEN + l.y;
          const labelY = lineY2 + LABEL_H - 2;
          return (
            <g key={`l-${l.idx}`} onClick={() => onSelect?.(l.ann)} style={{ cursor: 'pointer' }}>
              <line
                x1={l.cx} y1={lineY1}
                x2={l.cx} y2={lineY2}
                stroke={l.color}
                strokeWidth={1}
                opacity={0.7}
              />
              <circle cx={l.cx} cy={lineY2} r={1.5} fill={l.color} opacity={0.85} />
              <text
                x={l.cx + 4}
                y={labelY}
                textAnchor="start"
                fontSize={10}
                fontFamily="var(--font-ui)"
                fill="var(--text-primary)"
                style={{ paintOrder: 'stroke fill', stroke: 'var(--surface-1)', strokeWidth: 2 }}
              >{l.ann.name || l.ann.type}</text>
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
