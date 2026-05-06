import { useMemo, useRef, useState, useLayoutEffect, useCallback } from 'react';
import { featureColorShaded, FEATURE_STROKE } from '../../../../feature-palette';
import { getTextColor } from '../../../../lib/color-utils';
import { isPredicted } from '../../../../annotation-model';

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
// Sprint M-X.3 follow-up — when several features overlap, only the
// «main» (widest) one keeps its label. Smaller features whose
// exposed strip (= portion not covered by any wider sibling) is
// narrower than this threshold drop the label so the bar reads
// cleanly. Threshold matches the label's actual character footprint
// (~7 px per glyph + 8 px breathing room).
const LABEL_EXPOSED_MIN_PX = 24;
// Sprint M-X.3 follow-up — biolog «надо еще сделать так чтобы
// уменьшались внутренние фичи». Cluster CHILDREN (every cluster
// member except the widest) render with this top + bottom inset so
// they sit nested inside the main rect rather than crammed flush
// against the cluster frame. 3 px on each side keeps the child
// rectangles 16 px tall on the 22 px bar — bumped up from the
// initial 4 px (= 14 px) per biolog «сами блоки чуть увеличить».
const CLUSTER_CHILD_INSET_Y = 3;
// Sprint M-X.3 follow-up — biolog «более прозрачно надо, так как
// мы не видим блоков за ним». The cluster MAIN feature renders at
// this reduced opacity so it acts as a wash backdrop rather than a
// solid block; children stamped on top of it stay clearly visible.
// Confirmed-region default is 0.92, so dropping to 0.55 gives an
// obvious lightening without losing the «this is a feature» cue.
const CLUSTER_MAIN_OPACITY = 0.55;

/**
 * Group items into clusters by transitive pixel overlap. Two items
 * are connected when their pixel ranges overlap (any shared x).
 * Returns an array of clusters, each cluster a list of item indices
 * into the input array.
 *
 * Plain union-find on N items, O(N²) which is plenty for the typical
 * 50–200 feature bar.
 *
 * Used for the unified-frame render: clusters with size ≥ 2 get a
 * single outer stroke in the «main» (widest) member's colour so the
 * bar reads as one grouped entity rather than a smear.
 */
function clusterByOverlap(items) {
  const N = items.length;
  if (N === 0) return [];
  const parent = items.map((_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  const union = (i, j) => {
    const ri = find(i), rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  };
  // 06.05.2026 round-11 (biolog: «рядом стоящие фичи не имеющие
  // перекрытия объединяются одной рамкой»): require a meaningful
  // overlap (at least 1 px) — float-precision touching ends used to
  // cluster two adjacent features into one «общая рамка» when their
  // pixel ranges drifted by ≤ 0.5 px on rendering. Now neighbours
  // that only touch stay independent.
  const OVERLAP_EPSILON = 1; // px
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const a = items[i], b = items[j];
      const aR = a.left + a.width, bR = b.left + b.width;
      // Overlap = positive intersection wider than the epsilon.
      const intersection = Math.min(aR, bR) - Math.max(a.left, b.left);
      if (intersection > OVERLAP_EPSILON) union(i, j);
    }
  }
  const buckets = new Map();
  for (let i = 0; i < N; i++) {
    const r = find(i);
    if (!buckets.has(r)) buckets.set(r, []);
    buckets.get(r).push(i);
  }
  return Array.from(buckets.values());
}

/**
 * For each item in `items`, find its longest CONTIGUOUS exposed
 * sub-segment — pixels where this item is the WIDEST overlapping
 * one. Larger siblings carve out their range; same-width siblings
 * never carve (so two adjacent CDSs of equal width both keep their
 * labels). Returns `[start, end]` for the widest exposed segment
 * (or null when the item is fully covered by a wider one).
 *
 * O(N²) on number of features; the bar typically caps at ~50–200
 * features so this is fine — the heavy lifting in the bar is the
 * SVG renderer, not the geometry math.
 */
function widestExposedSegment(item, items) {
  let segments = [[item.left, item.left + item.width]];
  for (const other of items) {
    if (other === item) continue;
    if (other.width <= item.width) continue; // same or narrower → never carves
    const oStart = other.left;
    const oEnd = other.left + other.width;
    const next = [];
    for (const [s, e] of segments) {
      if (oEnd <= s || oStart >= e) {
        next.push([s, e]);
      } else {
        if (oStart > s) next.push([s, oStart]);
        if (oEnd < e) next.push([oEnd, e]);
      }
    }
    segments = next;
    if (segments.length === 0) return null;
  }
  if (segments.length === 0) return null;
  let best = segments[0];
  for (const seg of segments) {
    if (seg[1] - seg[0] > best[1] - best[0]) best = seg;
  }
  return best;
}
// Leader-label constants removed (compact mode 04.05.2026): LEADER_LEN /
// LABEL_H / LABEL_GAP_PX / DENSITY_WINDOW_PX / ANGLED_SHIFT_PX /
// ANGLED_THRESHOLD. Bar no longer renders outside leader labels.

// Bug-rush #4 (04.05.2026 evening, second take): switched to
// `featureColorShaded` so the bar's coloured rect lands on the
// SAME shade as the matching arc in PlasmidMiniMap and the matching
// rect in SequenceView's AnnotationTrack — biolog «все цвета должны
// быть одинаковые между элементами». Pre-fix the bar used the
// type-level base hex (no per-name variation), so AmpR / KanR /
// HygR all collapsed into one resistance shade in the bar but
// rendered distinct in the arcs — visually inconsistent.
function annColorPalette(ann) {
  return featureColorShaded(ann?.type, ann?.name);
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
      // Equality guard — without it, sub-pixel layout thrash re-runs
      // every region-stack memo at 60 fps (idle CPU hog source).
      if (w > 0) setWidth((prev) => (prev === w ? prev : w));
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
    const base = visible.map((a, i) => {
      const startFrac = (a.start || 0) / seqLength;
      const widthFrac = Math.max(0, ((a.end || 0) - (a.start || 0))) / seqLength;
      const left = startFrac * width;
      const w = Math.max(2, widthFrac * width);
      const widthPct = widthFrac * 100;
      const color = annColorPalette(a);
      // Sprint M-X.3 K5 — predicted features render as ghosts on the
      // bar (transparent fill + dashed stroke) so the «колбаса» stays
      // consistent with AnnotationTrack's per-line ghost styling
      // (DEC-PRED-05). Confidence-bearing predictions still keep the
      // type-coloured stroke so the bar remains the colour-keyed
      // overview biolog already trusts.
      const predicted = isPredicted(a);
      return {
        idx: i, ann: a,
        left, width: w, widthPct,
        color, predicted,
        opacity: predicted
          ? (a.level === 'region' ? 0.78 : 0.62) // softer for ghosts
          : (a.level === 'region' ? 0.92 : 0.7),
      };
    });
    // Sprint M-X.3 follow-up — biolog «когда много фичей
    // накладываются друг на друга получается каша. Можно выводить
    // только название основной фичи поверх?». Compute each item's
    // widest exposed segment (= where this item is the «main» / widest
    // covering one). Label renders ONLY if:
    //   1. The feature itself is wide enough overall (legacy
    //      6.5 % gate so 1-bp markers still don't try labels).
    //   2. The exposed segment is wide enough to fit a few glyphs
    //      (LABEL_EXPOSED_MIN_PX).
    // The label x-position uses the exposed segment's centre, not
    // the rect's centre, so a half-eclipsed feature labels its
    // visible half rather than centring under a wider sibling.
    // Cluster membership flags. Same union-find pass that drives
    // the cluster-frame layer below; we re-use the result here to
    // tag each item with `isClusterChild` (= part of a cluster of
    // size ≥ 2 AND not its widest member). Children render INSET
    // so they sit visually nested inside the main rect.
    const clusters = clusterByOverlap(base);
    const memberFlags = base.map(() => ({ inCluster: false, isMain: false }));
    for (const idxs of clusters) {
      if (idxs.length < 2) continue;
      let mainIdx = idxs[0];
      for (const i of idxs) {
        if (base[i].width > base[mainIdx].width) mainIdx = i;
        memberFlags[i].inCluster = true;
      }
      memberFlags[mainIdx].isMain = true;
    }

    return base.map((it, i) => {
      const exposed = widestExposedSegment(it, base);
      const exposedW = exposed ? exposed[1] - exposed[0] : 0;
      const labelInside = it.widthPct >= IN_LABEL_THRESHOLD_PCT
        && exposedW >= LABEL_EXPOSED_MIN_PX;
      const isClusterChild = memberFlags[i].inCluster && !memberFlags[i].isMain;
      const isClusterMain = memberFlags[i].inCluster && memberFlags[i].isMain;
      const yTop = isClusterChild ? CLUSTER_CHILD_INSET_Y : 0;
      const rectH = isClusterChild ? BAR_H - 2 * CLUSTER_CHILD_INSET_Y : BAR_H;
      // Cluster main acts as a backdrop — drop opacity so the
      // smaller features stamped on top of it stay clearly visible
      // (biolog «более прозрачно надо»).
      const opacity = isClusterMain ? CLUSTER_MAIN_OPACITY : it.opacity;
      return {
        ...it,
        opacity,
        labelInside,
        labelX: exposed ? (exposed[0] + exposed[1]) / 2 : (it.left + it.width / 2),
        labelMaxChars: exposed ? Math.floor(exposedW / 7) : Math.floor(it.width / 7),
        isClusterChild,
        isClusterMain,
        yTop,
        rectH,
      };
    });
  }, [annotations, seqLength, width]);

  /** Sprint M-X.3 follow-up — unified cluster frames. Each cluster
   *  with ≥ 2 features gets one outline rect in the WIDEST member's
   *  palette colour so overlapping features read as one grouped
   *  visual entity. Singletons (size === 1) get nothing — their own
   *  rect is the visual. */
  const clusterFrames = useMemo(() => {
    if (items.length < 2) return [];
    const clusters = clusterByOverlap(items);
    const frames = [];
    for (const idxs of clusters) {
      if (idxs.length < 2) continue;
      let left = Infinity, right = -Infinity;
      let widest = items[idxs[0]];
      for (const i of idxs) {
        const it = items[i];
        if (it.left < left) left = it.left;
        if (it.left + it.width > right) right = it.left + it.width;
        if (it.width > widest.width) widest = it;
      }
      frames.push({
        key: `cluster-${idxs.join('-')}`,
        x: left,
        width: right - left,
        color: widest.color,
        predicted: widest.predicted,
      });
    }
    return frames;
  }, [items]);

  // Memoized features layer — the rendered React element tree for
  // the rect/label per feature. Cursor position is NOT in deps, so
  // when only `cursorPosition` changes (every drag-scrub or arrow
  // keystroke) React reuses this exact element tree and skips
  // reconciliation of the ~50-200 feature <g>'s entirely. Per-frame
  // cost during a held drag drops to just the cursor <line> +
  // <polygon> updates.
  const featuresLayer = useMemo(() => items.map((it) => (
    <g
      key={it.idx}
      data-feature-start={it.ann.start || 0}
      data-feature-predicted={it.predicted ? 'true' : undefined}
      style={{ cursor: 'pointer' }}
    >
      <title>{`${it.predicted ? '~' : ''}${it.ann.name || it.ann.type}: ${(it.ann.start || 0) + 1}..${it.ann.end || 0}`}</title>
      <rect
        x={it.left}
        y={it.yTop}
        width={it.width}
        height={it.rectH}
        // Predicted: transparent fill, type-colour dashed stroke,
        // matches AnnotationTrack ghost styling (DEC-PRED-05).
        fill={it.predicted ? 'transparent' : it.color}
        opacity={it.opacity}
        stroke={it.predicted ? it.color : FEATURE_STROKE}
        strokeWidth={it.predicted ? 1 : 0.5}
        strokeDasharray={it.predicted ? '3,2' : undefined}
        rx={2}
        ry={2}
      />
      {it.labelInside && !it.ann._suppressLabel && (
        <text
          // Centre on the EXPOSED strip, not the rect centre — when
          // a wider sibling carves part of the feature, the label
          // sits on the visible half (or skips entirely if no strip
          // is wide enough — `it.labelInside` already checked that).
          x={it.labelX}
          y={it.yTop + it.rectH / 2 + 3}
          textAnchor="middle"
          fontSize={10}
          fontWeight={500}
          fontStyle={it.predicted ? 'italic' : 'normal'}
          // Ghost text rides on top of transparent fill, so the dark
          // theme's --text-primary on the parent surface is the
          // right contrast — getTextColor would key off the rect
          // fill which is now empty.
          fill={it.predicted ? 'var(--text-primary, #111)' : getTextColor(it.color)}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >{truncate(`${it.predicted ? '~' : ''}${it.ann.name || it.ann.type}`, it.labelMaxChars)}</text>
      )}
    </g>
  )), [items]);

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

        {/* feature blocks + inside labels — memoized via featuresLayer
            so the SVG reconciler reuses the same React elements when
            only `cursorPosition` changes. Pointer interaction lives
            on the SVG itself; the per-feature cursor:'pointer' hint
            keeps hovering interactive AND the existing K4 test
            selector (`g[style*="cursor"]`) keeps matching. */}
        {featuresLayer}

        {/* Sprint M-X.3 follow-up — unified cluster frames overlay
            on top of feature rects. Each cluster with ≥ 2 members
            renders one outline in the widest member's palette colour
            so overlapping features read as one grouped entity per
            biolog «надо добавить все же единую рамку, в цвет
            основной фичи». Decorative — pointerEvents:none so the
            SVG-level scrubber still claims pointerdown.

            Each cluster gets a TWO-rect treatment per biolog «и
            вокруг этой общей рамки черную обводку»:
              1. Outer halo — stroke=var(--text-primary) (theme-aware
                 «black» that flips to light grey in dark mode), thin,
                 sits 1 px outside the coloured frame so the cluster
                 boundary reads as a hard contour even when the main
                 feature's palette colour is pale against the bar
                 surface.
              2. Inner coloured frame — stroke=mainColor, current. */}
        {clusterFrames.map((f) => (
          <g key={f.key} style={{ pointerEvents: 'none' }}>
            {/* Sprint M-X.3 follow-up — biolog «обводку общую
                сделать чуть меньше сейчас толстая». Both rings slimmed:
                  outer halo:  0.6 → 0.4 px,  inset 1.0 → 0.5 px
                  inner frame: 1.6 → 1.0 px
                Cluster boundary still reads as a hard contour but
                doesn't visually dominate the smaller features inside. */}
            <rect
              data-cluster-outline="true"
              x={f.x - 0.5}
              y={-0.5}
              width={f.width + 1}
              height={BAR_H + 1}
              rx={3}
              ry={3}
              fill="none"
              stroke="var(--text-primary, #1c1917)"
              strokeWidth={0.4}
              opacity={0.85}
            />
            <rect
              data-cluster-frame="true"
              x={f.x}
              y={0}
              width={f.width}
              height={BAR_H}
              rx={2.5}
              ry={2.5}
              fill="none"
              stroke={f.color}
              strokeWidth={1.0}
              strokeDasharray={f.predicted ? '3,2' : undefined}
              opacity={0.95}
            />
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
