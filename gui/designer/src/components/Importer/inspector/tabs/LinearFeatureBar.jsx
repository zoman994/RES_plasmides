import { useMemo, useRef, useState, useLayoutEffect } from 'react';
import { featureColor, FEATURE_STROKE } from '../../../../feature-palette';
import { ANNOTATION_COLORS } from '../../../../auto-annotate';
import { getTextColor } from '../../../../lib/color-utils';

/**
 * LinearFeatureBar — SVG-based compact linear feature strip.
 *
 * Compact mode (04.05.2026): single-row 22 px coloured-rect strip,
 * inside-only labels. Outside leader-line labels were dropped per
 * biolog «компактный элемент». Narrow rects render as colour ticks
 * — name surfaces via SVG `<title>` tooltip on hover. Click on any
 * rect calls `onSelect(annotation)`.
 *
 * Colour source: featureColor(type, name) — same A+v2 palette
 * PlasmidMap + AnnotationEditor (with ignoreOwnColor) use.
 * Per-annotation `color` field from .dna files is intentionally
 * ignored — palette stays unified.
 */

const BAR_H = 22;
const IN_LABEL_THRESHOLD_PCT = 6.5;
// Leader-label constants removed (compact mode 04.05.2026): LEADER_LEN /
// LABEL_H / LABEL_GAP_PX / DENSITY_WINDOW_PX / ANGLED_SHIFT_PX /
// ANGLED_THRESHOLD. Bar no longer renders outside leader labels.

function annColorPalette(ann) {
  return featureColor(ann?.type, ann?.name) || ANNOTATION_COLORS[ann?.type] || ANNOTATION_COLORS.misc;
}

export default function LinearFeatureBar({
  annotations = [],
  seqLength = 0,
  onSelect,
  cursorPosition = null, // absolute seq pos (nullable) — vertical marker
}) {
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

  const { items, totalH } = useMemo(() => {
    if (!annotations.length || !seqLength) {
      return { items: [], totalH: BAR_H };
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

    // Compact mode (Importer-merge-tabs follow-up, 04.05.2026) — biolog:
    // «у колбасы убрать выносные подписи. пишем только то что влезает.
    // она должна оставаться компактным элементом». Outside leader-line
    // labels removed entirely; only inside-rect labels survive. Total
    // height collapses to BAR_H (22 px) — fits in the inspector header
    // without eating tab content space.
    return { items: its, totalH: BAR_H };
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

        {/*
          * Outside leader-line labels removed in compact mode (biolog
          * 04.05.2026). Only `labelInside` rects keep their text;
          * narrow rects show as plain coloured ticks (hover tooltip
          * via the `<title>` element above provides the name).
          */}
        {/* Cursor marker (04.05.2026 evening — биолог: «не вижу
            курсора»). Vertical line + small downward triangle at the
            x corresponding to the last-clicked feature start. Hidden
            when cursorPosition is null. The marker is decorative —
            doesn't intercept clicks. */}
        {cursorPosition != null && seqLength > 0 && (() => {
          const cx = (cursorPosition / seqLength) * width;
          const clamped = Math.max(0, Math.min(width, cx));
          return (
            <g
              data-testid="importer-linear-feature-bar-cursor"
              style={{ pointerEvents: 'none' }}
            >
              <line
                x1={clamped} x2={clamped}
                y1={0} y2={BAR_H}
                stroke="var(--accent-500, #f97316)"
                strokeWidth={1.5}
                opacity={0.95}
              />
              <polygon
                points={`${clamped - 4},${BAR_H + 1} ${clamped + 4},${BAR_H + 1} ${clamped},${BAR_H + 6}`}
                fill="var(--accent-500, #f97316)"
                opacity={0.95}
              />
            </g>
          );
        })()}
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
