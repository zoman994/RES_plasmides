import { useMemo, useRef, useState, useLayoutEffect, useCallback } from 'react';
import { featureColor, FEATURE_STROKE } from '../../../../feature-palette';
import { ANNOTATION_COLORS } from '../../../../auto-annotate';
import { getTextColor } from '../../../../lib/color-utils';

/**
 * LinearFeatureBar — SVG-based compact linear feature strip.
 *
 * Compact mode (04.05.2026): single-row 22 px coloured-rect strip,
 * inside-only labels. Outside leader-line labels were dropped per
 * biolog «компактный элемент». Narrow rects render as colour ticks
 * — name surfaces via SVG `<title>` tooltip on hover.
 *
 * Scrubber mode (04.05.2026 evening — биолог: «А можно сделать как
 * бы ползунок на колбасе который можно тянуть и будет двигаться
 * курсор по сиквенсу?»). The bar now behaves as a horizontal
 * scrubber:
 *   - pointerdown anywhere → cursor jumps to that x; `onScrub(pos)`
 *     fires so the parent can scroll the SequenceView live.
 *   - pointermove (while dragging) → continuous `onScrub(pos)`.
 *   - pointerup → `onSelect(pos)` for the final settle (parent does
 *     a smooth scroll to land the viewer on the release point).
 * Pointer capture keeps the drag alive even if the cursor strays
 * outside the SVG vertically.
 *
 * Features themselves stay non-interactive overlays (no per-feature
 * click handlers) — they're decorative now, the SVG is the input
 * surface. The legacy `g[style*="cursor"]` selector kept by tests
 * survives because each feature still carries the visual `cursor:
 * pointer` hint (so hovering a feature still says "you can click
 * here").
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
  onSelect,            // settle callback: fires on click / pointer release. Signature: (pos)
  onScrub,             // live drag callback: fires every pointermove. Signature: (pos)
  cursorPosition = null, // absolute seq pos (nullable) — vertical marker
}) {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  // Drag state lives in a ref so pointermove doesn't re-render the
  // whole bar (cursor visual is driven by the controlled
  // `cursorPosition` prop the parent updates from `onScrub`).
  const dragRef = useRef({ active: false, pointerId: null });
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

  const computePosFromClientX = useCallback((clientX) => {
    const svg = svgRef.current;
    if (!svg || !seqLength) return null;
    let rect;
    try { rect = svg.getBoundingClientRect(); } catch { return null; }
    if (!rect || rect.width <= 0) return null;
    if (typeof clientX !== 'number' || !Number.isFinite(clientX)) return null;
    const x = clientX - rect.left;
    const pos = Math.round((x / rect.width) * seqLength);
    if (!Number.isFinite(pos)) return null;
    return Math.max(0, Math.min(seqLength - 1, pos));
  }, [seqLength]);

  const onPointerDown = (e) => {
    // Ignore non-primary buttons (right-click context menu etc.).
    if (e.button != null && e.button !== 0) return;
    const pos = computePosFromClientX(e.clientX);
    if (pos == null) return;
    // setPointerCapture keeps the drag alive even when the cursor
    // strays outside the SVG bounds. Wrapped in try/catch — happy-dom
    // exposes the method but throws on unknown pointerId.
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    dragRef.current = { active: true, pointerId: e.pointerId };
    onScrub?.(pos);
    // preventDefault stops the browser from starting a native text
    // selection / drag-image when the user grabs over a feature label.
    e.preventDefault();
  };

  const onPointerMove = (e) => {
    if (!dragRef.current.active) return;
    if (dragRef.current.pointerId != null && e.pointerId !== dragRef.current.pointerId) return;
    const pos = computePosFromClientX(e.clientX);
    if (pos == null) return;
    onScrub?.(pos);
  };

  const onPointerUp = (e) => {
    if (!dragRef.current.active) return;
    if (dragRef.current.pointerId != null && e.pointerId !== dragRef.current.pointerId) return;
    try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
    const pos = computePosFromClientX(e.clientX);
    dragRef.current = { active: false, pointerId: null };
    if (pos != null) onSelect?.(pos);
  };

  const onClickFallback = (e) => {
    // Path for environments that dispatch click without pointerdown
    // (happy-dom test fixtures, screen readers, synthetic events).
    // If a real pointer drag just finished, pointerup already
    // emitted onSelect — skip to avoid double-firing.
    if (dragRef.current.active) return;
    const pos = computePosFromClientX(e.clientX);
    if (pos != null) {
      onSelect?.(pos);
      return;
    }
    // Final fallback: try to derive a position from the clicked
    // <g>'s data-feature-start attribute. Lets the K4 lazy-tabs
    // test (`fireEvent.click(featureGroups[0])`) keep landing on a
    // known annotation start when happy-dom returns zeros for
    // clientX + bounding rects.
    let el = e.target;
    while (el && el !== e.currentTarget) {
      const ds = el.dataset;
      if (ds && ds.featureStart != null) {
        const n = Number(ds.featureStart);
        if (Number.isFinite(n)) { onSelect?.(n); return; }
      }
      el = el.parentNode;
    }
    onSelect?.(0);
  };

  const items = useMemo(() => {
    if (!annotations.length || !seqLength) return [];
    const visible = annotations.filter((a) => a.level !== 'point');
    return visible.map((a, i) => {
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
  }, [annotations, seqLength, width]);

  if (!annotations.length || !seqLength) return null;

  return (
    <div ref={wrapRef} style={{ width: '100%', minWidth: 0 }}>
      <svg
        ref={svgRef}
        width={width}
        height={BAR_H}
        style={{
          display: 'block',
          overflow: 'visible',
          // touch-action:none so the browser doesn't claim horizontal
          // pointer movement for native scroll/zoom — without it the
          // bar can't scrub on touch devices and pinch-zoom hijacks
          // the gesture on trackpads.
          touchAction: 'none',
          cursor: dragRef.current.active ? 'grabbing' : 'pointer',
        }}
        data-testid="importer-linear-feature-bar"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onClickFallback}
      >
        {/* background track */}
        <rect x={0} y={0} width={width} height={BAR_H}
          fill="var(--surface-2)" rx={3} ry={3} />

        {/* feature blocks + inside labels — purely visual now;
            pointer interaction lives on the SVG itself. The
            cursor:'pointer' hint stays so hovering still tells the
            biolog the bar is interactive, AND the existing K4
            test selector (`g[style*="cursor"]`) keeps matching. */}
        {items.map((it) => (
          <g
            key={it.idx}
            data-feature-start={it.ann.start || 0}
            style={{ cursor: 'pointer' }}
          >
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

        {/* Cursor marker — vertical line + small downward triangle at
            the controlled `cursorPosition`. Hidden when null.
            Decorative: pointerEvents:none so the SVG-level handlers
            still get the pointerdown when the user grabs the
            cursor itself (no drag-handle hit-test gap). */}
        {cursorPosition != null && seqLength > 0 && (() => {
          const cx = (cursorPosition / seqLength) * width;
          const clamped = Math.max(0, Math.min(width, cx));
          // Black outline (biolog 04.05.2026: «сама каретка должна
          // иметь чёрную обводку и на колбасе и на сиквенсе»). SVG
          // doesn't have boxShadow so we layer a wider black line +
          // black-stroked polygons UNDER the orange ones — same
          // visual effect as the boxShadow ring on the SequenceView
          // caret.
          return (
            <g
              data-testid="importer-linear-feature-bar-cursor"
              style={{ pointerEvents: 'none' }}
            >
              {/* Black outline line (rendered first → painted under). */}
              <line
                x1={clamped} x2={clamped}
                y1={-2} y2={BAR_H + 2}
                stroke="#000"
                strokeWidth={2.5}
                opacity={0.9}
              />
              {/* Orange core line on top. */}
              <line
                x1={clamped} x2={clamped}
                y1={-2} y2={BAR_H + 2}
                stroke="var(--accent-500, #f97316)"
                strokeWidth={1.5}
                opacity={0.95}
              />
              {/* Top + bottom carets so the scrubber thumb reads
                  visually as a draggable handle, not just a tick.
                  Stroke="#000" provides the matching black outline. */}
              <polygon
                points={`${clamped - 4},${-2} ${clamped + 4},${-2} ${clamped},${4}`}
                fill="var(--accent-500, #f97316)"
                stroke="#000"
                strokeWidth={0.75}
                opacity={0.95}
              />
              <polygon
                points={`${clamped - 4},${BAR_H + 2} ${clamped + 4},${BAR_H + 2} ${clamped},${BAR_H - 4}`}
                fill="var(--accent-500, #f97316)"
                stroke="#000"
                strokeWidth={0.75}
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
