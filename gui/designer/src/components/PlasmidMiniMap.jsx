/**
 * PlasmidMiniMap — small SVG indicator of a plasmid's region annotations.
 *
 * Used by ImportStartScreen MetaColumn (160 px), MultiInspector rows (40 px),
 * SessionSummary (32 px) and CatalogPanel cards (48 px). Read-only — no RE
 * sites, no selected state. Empty annotations → one solid linker arc/bar
 * (signals "structure not recognized, annotate or accept as-is").
 *
 * Cycles through `featureColor()` (feature-palette.js) so colors stay in sync
 * with PlasmidMap and SequencePane region rendering.
 *
 * Sprint Catalog Polish FIX F1 (28.04.2026): two-mode contract.
 *   - `mode='inline'` (default): no leader-labels regardless of size, viewBox
 *     stays `0 0 size size`, SVG `overflow: hidden`. Sized to fit a fixed
 *     container (catalog cards, MetaColumn 160 px box, SessionSummary rows).
 *   - `mode='overlay'`: leader-labels enabled at `size >= 100` per V46 K6
 *     rules (`length ≥ 300 bp`, blacklist `source`, no cap), viewBox expands
 *     post-render via `getBBox` (variant 1A), SVG `overflow: visible`. F4 hover
 *     overlay renders an inner `mode='overlay'` instance so the user sees
 *     leader-labels without disturbing the inline tile.
 *
 * FIX-2 follow-up (28.04.2026): the plasmid-name <text> previously rendered
 * under the arc (F4) is gone — name lives in the modal title row, repeating it
 * inside the mini-map was redundant and pushed the SVG bbox past the right
 * column. `disableHoverOverlay` opts a consumer out of the F4 hover-grow
 * (used by SingleInspector right column to stay fully static).
 *
 * V37: arc <g> wrappers carry `aria-label` for screen readers; `<title>`
 * elements removed (caused native ~700 ms tooltip racing the React tooltip).
 * V38/K5.1: compact (size ≤ 90) hover opens the 180 px popover with a
 * 250 ms hover-bridge debounce.
 */

import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { featureColorShaded, FEATURE_STROKE, FEATURE_COLORS_V2 } from '../feature-palette';
import { getRegions } from '../annotation-model';
import { truncateLabel } from '../lib/plasmid-label-utils';
import {
  niceTickStep, rulerTicks, bpFromVector,
} from '../lib/plasmid-ruler';
import {
  LEADER_LEN, bpToLinearX, circularFeatureArc, circularTick, originMarkerGeom,
  circularArrowShape, linearArrowShape, featureGetsArrow,
  buildCircularLabels, buildLinearLabels, dedupeDominatedRegions,
} from '../lib/plasmid-mini-map-geometry';

const LABEL_RING = 32;                    // px radial ring reserved for labels (circular ≥180 px)
const HOVER_BRIDGE_MS = 80;               // K5.1 hover-bridge debounce (mouseleave → close).
                                          // Was 250 ms — biolog asked for «быстрее исчезали при
                                          // убирании курсора»; 80 ms still allows mouse to cross
                                          // the small gap between source tile and overlay portal.
const GROW_DURATION_MS = 140;             // F4 transform/opacity transition for the grow-overlay
                                          // — also tightened (was 200) so dismiss feels snappy.
// V66 + 17.06.2026 size-budget decomp: label-selection rules live in
// `lib/plasmid-label-utils.js`; all pure mini-map geometry (arrow shapes, arc /
// sector math, ruler ticks, label placement) lives in
// `lib/plasmid-mini-map-geometry.js`. Only JSX + wiring remain here.

// Theme-aware label rendering: halo matches surface so it «punches» the
// background cleanly on both light (white halo on white card) and dark
// (#171717 halo on dark card) without leaving a dirty grey ring. No
// drop-shadow — was adding extra noise on dark theme.
const OVERLAY_TEXT_STYLE = {
  paintOrder: 'stroke fill',
  stroke: 'var(--surface-1, #fff)',
  strokeWidth: 3,
  fill: 'var(--text-primary, #1c1917)',
};

function PlasmidMiniMap({
  length, topology, annotations, size = 64,
  mode = 'inline',
  disableHoverOverlay = false,
  // Optional: click a feature sector/bar → onFeatureClick(region). When
  // provided the cursor becomes a pointer (clickable affordance) instead of
  // 'help'. Consumers that don't pass it stay hover-only (back-compat).
  onFeatureClick,
  // 17.06.2026 (Игорь — SnapGene-style overview) — all opt-in, circular only,
  // off by default so the 400× catalog tiles stay cheap + unchanged:
  //   • showRuler       — bp ruler ticks + labels around the outside;
  //   • showDirections  — strand arrowheads on directional feature arcs;
  //   • onPositionClick(bp1) — click empty ring → 1-based bp (set origin);
  //   • originMarkerBp  — draw a candidate-origin marker at this 1-based bp;
  //   • centerLabel     — { name, bp } drawn in the centre (SnapGene look).
  showRuler = false,
  showDirections = false,
  onPositionClick,
  originMarkerBp = null,
  centerLabel = null,
  // 17.06.2026 (Игорь — «ноль всегда сверху, вращается сама плазмида»). When
  // set, the plasmid CONTENT (features + ruler + feature labels) is rotated by
  // this many degrees while the top zero-notch + centre label stay fixed. The
  // OverviewTab rotation control feeds this so the base under the fixed top
  // notch is the candidate origin — no click-on-map (avoids misclicks).
  rotationDeg = 0,
}) {
  const isOverlay = mode === 'overlay';
  const isCircular = topology === 'circular';
  const totalLen = Math.max(1, length || 0);
  // De-duplicate overlapping near-identical annotations (e.g. AmpR `CDS` +
  // bla(M) `marker` on the same locus) so the map draws one shape per locus —
  // the redundant generic band/label is dropped (Игорь 17.06). Conservative:
  // only a strictly higher-priority feature of ~the same span dominates.
  const regions = dedupeDominatedRegions(getRegions(annotations));

  const [hovered, setHovered] = useState(null);
  // F4 grow-overlay state machine:
  //   overlayMounted=false → portal not rendered.
  //   overlayMounted=true && overlayActive=false → mounted at scale(0.5)/opacity(0).
  //   overlayMounted=true && overlayActive=true  → CSS transitions to scale(1)/opacity(1).
  //   On schedule-close: active flips back to false (transitions out), then mount=false
  //   after GROW_DURATION_MS so the DOM unmounts cleanly.
  const [overlayMounted, setOverlayMounted] = useState(false);
  const [overlayActive, setOverlayActive] = useState(false);
  const [overlayPos, setOverlayPos] = useState({ left: 0, top: 0 });
  const wrapperRef = useRef(null);
  const closeTimer = useRef(null);
  const unmountTimer = useRef(null);
  const svgRef = useRef(null);

  // Cleanup all pending timers on unmount.
  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (unmountTimer.current) clearTimeout(unmountTimer.current);
  }, []);

  const cx = size / 2;
  const cy = size / 2;
  // Kfix-4 viewBox padding: r leaves enough room for stroke + 1 px AA halo.
  // Overview mode (ruler / direction arrows) uses a thinner band so
  // multi-feature constructs don't look crowded (Игорь 17.06 — «дуги и стрелки
  // поменьше и потоньше»). Catalog tiles (no ruler/arrows) keep size/13.
  const overviewMode = showRuler || showDirections;
  const strokeWidth = overviewMode
    ? Math.max(3, Math.round(size / 18))
    : Math.max(4, Math.round(size / 13));
  // F1 (Sprint Catalog Polish FIX): inline mode never renders leader-labels —
  // they belong in the overlay (F4) so the inline tile stays inside its 200 px
  // grid cell on SARS-Genome / pCAMBIA1381Xb without overflow into Topology.
  const showLabels = isOverlay && size >= 100;
  // Reserve inner ring for labels at ≥180 px circular so leader + text fit
  // inside the SVG before any post-render expansion. For linear we don't
  // reserve — the bar stays full width.
  const baseR = (size - strokeWidth - 2) / 2;
  const r = (showLabels && isCircular && size >= 180)
    ? Math.max(20, baseR - LABEL_RING)
    : baseR;

  // Push feature leader-labels OUT past the bp ruler so the two don't overlap
  // (Игорь — «подписи вынести подальше»). When the ruler is drawn it occupies
  // ~stroke/2 + tick(5) + bp-text(~9) outside the band; the feature leaders
  // start beyond that.
  const labelLeader = (showRuler && isCircular)
    ? Math.round(strokeWidth / 2) + 5 + 18
    : LEADER_LEN;
  // Rotate the plasmid content (circular only) by baking the angle into the
  // geometry — NOT a CSS transform. Features/ruler/labels spin to follow the
  // rotation, but the label + bp-number TEXT stays horizontal (a CSS rotate
  // would flip them upside-down) and the zero-notch + centre label stay fixed
  // at the top (Игорь — «ноль сверху, вращается плазмида»; fix for «надписи не
  // двигались / окно дёргалось»). 0 → all other consumers unchanged.
  const rotationRad = (isCircular && rotationDeg) ? (rotationDeg * Math.PI) / 180 : 0;
  const labels = showLabels
    ? (isCircular
        ? buildCircularLabels(regions, totalLen, cx, cy, r, labelLeader, rotationRad)
        : buildLinearLabels(regions, totalLen, size, cy, strokeWidth))
    : [];

  // V46 viewBox post-render expansion (variant 1A): if real bbox of SVG content
  // overflows the initial 0,0,size,size box, widen viewBox + width/height with
  // 4 px padding so labels never clip. Only the OVERLAY mode runs getBBox —
  // inline mode (catalog tree, 400× per opened SnapGene category) computes
  // vbox synchronously from `size` so we skip an unconditional setState that
  // forced 400 extra renders right after mount. Perf: ~30% faster expand of
  // large categories.
  const defaultVbox = { x: 0, y: 0, w: size, h: size, drawW: size, drawH: size };
  const [overlayVbox, setOverlayVbox] = useState(null);
  const vbox = isOverlay && overlayVbox ? overlayVbox : defaultVbox;
  useLayoutEffect(() => {
    if (!isOverlay) return;
    if (!svgRef.current) return;
    if (!labels.length) {
      setOverlayVbox(null);
      return;
    }
    let bbox;
    try {
      bbox = svgRef.current.getBBox();
    } catch {
      return; // jsdom or detached — keep default
    }
    if (!bbox || !Number.isFinite(bbox.width) || !Number.isFinite(bbox.height)) return;
    // jsdom returns a zero-sized bbox (no real layout) — skip expansion so the
    // default 0,0,size,size viewBox is kept in tests; real browsers always
    // produce non-zero bbox once paths render.
    if (bbox.width === 0 && bbox.height === 0) return;
    const PAD = 4;
    const minX = Math.min(0, Math.floor(bbox.x - PAD));
    const minY = Math.min(0, Math.floor(bbox.y - PAD));
    const maxX = Math.max(size, Math.ceil(bbox.x + bbox.width + PAD));
    const maxY = Math.max(size, Math.ceil(bbox.y + bbox.height + PAD));
    const w = maxX - minX;
    const h = maxY - minY;
    if (minX === 0 && minY === 0 && w === size && h === size) {
      setOverlayVbox(null);
      return;
    }
    setOverlayVbox({ x: minX, y: minY, w, h, drawW: w, drawH: h });
    // NB: rotationDeg is deliberately NOT a dep — re-measuring the bbox while
    // the user spins the plasmid made the SVG (and the whole panel) resize on
    // every tick (Игорь — «постоянно меняется размер окна»). The bbox is fixed
    // at the un-rotated extent; overlay mode's overflow:visible shows any
    // rotated labels that poke past it without changing the box size.
    // NB: depend on centerLabel's PRIMITIVE fields, not the object — consumers
    // (OverviewTab) pass a fresh {name,bp} literal every render, so depending on
    // the object identity re-ran getBBox on every rotation tick → the panel
    // resized constantly (Игорь «окно всё ещё изменяется»).
  }, [size, totalLen, isCircular, regions.length, labels.length, isOverlay,
      showRuler, showDirections, originMarkerBp, centerLabel?.name, centerLabel?.bp]);

  const showHover = (titleText, evt) => {
    const host = evt.currentTarget.ownerSVGElement?.parentElement;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    setHovered({ text: titleText, x: evt.clientX - rect.left, y: evt.clientY - rect.top });
  };
  const clearHover = () => setHovered(null);

  // Feature click affordance (opt-in). Returns a handler or undefined so the
  // <g> stays inert (hover-only) when no consumer wired onFeatureClick.
  const featureInteractive = typeof onFeatureClick === 'function';
  const featCursor = featureInteractive ? 'pointer' : 'help';
  const onFeatClick = (region) => (featureInteractive
    ? (e) => { e.stopPropagation(); onFeatureClick(region); }
    : undefined);

  // ── SnapGene-style extras (opt-in; ruler + arrows now BOTH topologies) ──
  const rulerEnabled = showRuler && totalLen > 0;
  const rOuterBand = r + strokeWidth / 2; // outer pixel edge of the circular band
  const tickStep = rulerEnabled ? niceTickStep(totalLen) : 0;
  const majorTicks = rulerEnabled ? rulerTicks(totalLen, tickStep) : [];
  const minorStep = tickStep ? Math.round(tickStep / 5) : 0;
  const minorTicks = (rulerEnabled && minorStep >= 1)
    ? rulerTicks(totalLen, minorStep).filter((p) => p % tickStep !== 0)
    : [];
  // Push the ruler out past the block-arrow shoulders so ticks don't collide
  // with arrowheads (shoulders reach rOut + strokeWidth × ARROW_SHOULDER_K).
  const tickInner = rOuterBand + 2 + (showDirections ? strokeWidth * 0.45 : 0);
  const majorLen = 5;
  const minorLen = 2.5;
  // Linear ruler lives below the bar.
  const linTickTop = cy + strokeWidth / 2 + 2;
  const linX = (p) => bpToLinearX(p, totalLen, size);
  // Thin the linear bp-LABELS so the digits don't collide (Игорь — «в линейной
  // форме цифры линейки налезают»). On the narrow bar ~10 ticks pack 4-digit
  // numbers tighter than they are wide; the circle has room, the bar doesn't.
  // Keep every tick MARK, but label only every Nth — N chosen so the gap ≥ the
  // widest label. Labels land on round multiples of the tick step (not the raw
  // greedy left scan) so the numbers stay tidy (…,1000,2000,…).
  const linLabelStep = (() => {
    if (isCircular || !rulerEnabled || !tickStep) return tickStep;
    const pxPerTick = Math.abs(linX(tickStep) - linX(0));
    const minGapPx = String(totalLen).length * 5 + 8; // ~5 px/digit @ fontSize 8 + pad
    const every = pxPerTick > 0 ? Math.max(1, Math.ceil(minGapPx / pxPerTick)) : 1;
    return tickStep * every;
  })();


  // Click empty ring → 1-based bp (set origin). The capture ring sits BELOW
  // the feature arcs (which stopPropagation), so a feature click navigates and
  // an empty-ring click marks the origin.
  const onRingClick = (e) => {
    if (typeof onPositionClick !== 'function') return;
    const svg = e.currentTarget.ownerSVGElement || e.currentTarget;
    let ux = null;
    let uy = null;
    try {
      const ctm = svg.getScreenCTM && svg.getScreenCTM();
      if (ctm) {
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const u = pt.matrixTransform(ctm.inverse());
        ux = u.x;
        uy = u.y;
      }
    } catch { /* jsdom — no CTM */ }
    if (ux == null) {
      const rect = svg.getBoundingClientRect ? svg.getBoundingClientRect() : null;
      if (!rect || !rect.width) return;
      ux = ((e.clientX - rect.left) / rect.width) * vbox.w + vbox.x;
      uy = ((e.clientY - rect.top) / rect.height) * vbox.h + vbox.y;
    }
    onPositionClick(bpFromVector(ux - cx, uy - cy, totalLen));
  };

  const paths = [];
  for (const region of regions) {
    const start = Math.max(0, Math.min(totalLen, region.start || 0));
    const end = Math.max(0, Math.min(totalLen, region.end || 0));
    if (end <= start) continue;
    const color = featureColorShaded(region.type, region.name);
    const titleText = `${region.name || region.type || 'region'} · ${start + 1}–${end} bp`;

    if (isCircular) {
      // Full-length annotation (e.g. dTomato 702 bp inside a 702 bp
      // circular plasmid, where the imported file's only feature spans
      // the whole backbone). With the standard arc math, a1 and a2
      // collapse to the SAME point at the top of the circle and the
      // SVG `<path A …>` becomes degenerate — Chrome rendered it as a
      // tiny green slice on the right edge of the ring (biolog visual
      // review 03.05.2026 evening on 702 bp dTomato CDS). Fix: when
      // the visible span equals the total length, fall back to a full
      // <circle> stroke. Approximate match (`>= totalLen - 1`) covers
      // off-by-1 imports where end is `totalLen-1` after coordinate
      // normalisation in pvcs.snapgene_parser.
      const arc = circularFeatureArc(start, end, totalLen, cx, cy, r, rotationRad);
      if (arc.fullCircle) {
        paths.push(
          <g
            key={region.id}
            role="img"
            aria-label={titleText}
            data-region-start={region.start}
            style={{ cursor: featCursor }}
            onClick={onFeatClick(region)}
            onMouseMove={(e) => showHover(titleText, e)}
            onMouseLeave={clearHover}
          >
            {/*
              * Two-layer stroke: a slightly wider FEATURE_STROKE
              * (#3A2F1F) circle UNDER the coloured one — restores
              * the black sector outline biolog liked («куда то
              * обводка делась у минимапов, верни чёрную обводку
              * секторов оно было красиво»). 0.8 px wider gives a
              * ~0.4 px visible black rim on each side of the
              * coloured band.
              */}
            <circle
              cx={cx} cy={cy} r={r}
              stroke={FEATURE_STROKE}
              strokeWidth={strokeWidth + 0.8}
              fill="none"
            />
            <circle
              cx={cx} cy={cy} r={r}
              stroke={color}
              strokeWidth={strokeWidth}
              fill="none"
            />
          </g>
        );
        continue;
      }
      const { a1, a2, arcPath } = arc;
      // Two-layer band (black rim + colour) — the body for every
      // non-directional feature AND the short-feature arrow fallback.
      const band = (
        <>
          <path d={arcPath} stroke={FEATURE_STROKE} strokeWidth={strokeWidth + 0.8} fill="none" strokeLinecap="butt" />
          <path d={arcPath} stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="butt" />
        </>
      );
      let inner = band;
      if (showDirections && featureGetsArrow(region)) {
        const shape = circularArrowShape(cx, cy, r, strokeWidth, a1, a2, region.strand === -1 ? -1 : 1);
        inner = shape.kind === 'block'
          // Block arrow = one integrated filled shape (body + shouldered head).
          ? (
            <path
              data-testid="plasmid-dir-arrow"
              d={shape.d}
              fill={color}
              stroke={FEATURE_STROKE}
              strokeWidth={0.6}
              strokeLinejoin="round"
            />
          )
          // Too short for a head → plain band + narrow flush triangle.
          : (
            <>
              {band}
              <polygon
                data-testid="plasmid-dir-arrow"
                points={shape.points}
                fill={color}
                stroke={FEATURE_STROKE}
                strokeWidth={0.5}
                strokeLinejoin="round"
              />
            </>
          );
      }
      paths.push(
        <g
          key={region.id}
          role="img"
          aria-label={titleText}
          data-region-start={region.start}
          style={{ cursor: featCursor }}
          onClick={onFeatClick(region)}
          onMouseMove={(e) => showHover(titleText, e)}
          onMouseLeave={clearHover}
        >
          {inner}
        </g>
      );
    } else {
      const x1 = bpToLinearX(start, totalLen, size);
      const x2 = bpToLinearX(end, totalLen, size);
      const bar = (
        <rect
          x={x1}
          y={cy - strokeWidth / 2}
          width={Math.max(1, x2 - x1)}
          height={strokeWidth}
          fill={color}
          stroke={FEATURE_STROKE}
          strokeWidth={0.25}
        />
      );
      let inner = bar;
      if (showDirections && featureGetsArrow(region)) {
        const shape = linearArrowShape(x1, x2, cy, strokeWidth, region.strand === -1 ? -1 : 1);
        inner = shape.kind === 'block'
          ? (
            <polygon
              data-testid="plasmid-dir-arrow"
              points={shape.points}
              fill={color}
              stroke={FEATURE_STROKE}
              strokeWidth={0.4}
              strokeLinejoin="round"
            />
          )
          : (
            <>
              {bar}
              <polygon
                data-testid="plasmid-dir-arrow"
                points={shape.points}
                fill={color}
                stroke={FEATURE_STROKE}
                strokeWidth={0.4}
                strokeLinejoin="round"
              />
            </>
          );
      }
      paths.push(
        <g
          key={region.id}
          role="img"
          aria-label={titleText}
          data-region-start={region.start}
          style={{ cursor: featCursor }}
          onClick={onFeatClick(region)}
          onMouseMove={(e) => showHover(titleText, e)}
          onMouseLeave={clearHover}
        >
          {inner}
        </g>
      );
    }
  }

  if (paths.length === 0) {
    const linkerColor = FEATURE_COLORS_V2.linker;
    const emptyLabel = `${totalLen} bp · без аннотаций`;
    if (isCircular) {
      paths.push(
        <g
          key="empty-linker"
          role="img"
          aria-label={emptyLabel}
          style={{ cursor: 'help' }}
          onMouseMove={(e) => showHover(emptyLabel, e)}
          onMouseLeave={clearHover}
        >
          <circle cx={cx} cy={cy} r={r} stroke={linkerColor} strokeWidth={strokeWidth} fill="none" />
        </g>
      );
    } else {
      paths.push(
        <g
          key="empty-linker"
          role="img"
          aria-label={emptyLabel}
          style={{ cursor: 'help' }}
          onMouseMove={(e) => showHover(emptyLabel, e)}
          onMouseLeave={clearHover}
        >
          <rect
            x={4}
            y={cy - strokeWidth / 2}
            width={size - 8}
            height={strokeWidth}
            fill={linkerColor}
            stroke={FEATURE_STROKE}
            strokeWidth={0.25}
          />
        </g>
      );
    }
  }

  // F4 (Sprint Catalog Polish FIX): hover on any mode='inline' tile (compact
  // 32-48 px cards AND 160 px MetaColumn) opens a grow-overlay through React
  // portal. mode='overlay' instances never re-open — that's the recursive
  // guard so the inner overlay-PlasmidMiniMap doesn't spawn another.
  // FIX-2 follow-up (28.04.2026): consumers can pass `disableHoverOverlay` to
  // keep the inline tile fully static (e.g. SingleInspector right column).
  const overlayEnabled = !isOverlay && !disableHoverOverlay;
  const cursorClass = overlayEnabled ? 'cursor-zoom-in' : '';

  // 180 px overlay (matches inner PlasmidMiniMap size). After F4 viewBox
  // expansion the SVG can grow up to ~280 px, so this is the worst-case
  // budget for clamping the overlay center against the viewport edges.
  // Actual overlay box is sized to content (`w-fit` style) — translate(-50%)
  // re-centres it on the source tile regardless of real dimensions.
  const OVERLAY_BOX = 280;
  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    if (unmountTimer.current) {
      clearTimeout(unmountTimer.current);
      unmountTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      // Phase 1: transition out (scale → 0.5, opacity → 0). DOM still mounted.
      setOverlayActive(false);
      // Phase 2: unmount after the CSS transition finishes.
      unmountTimer.current = setTimeout(() => {
        setOverlayMounted(false);
        unmountTimer.current = null;
      }, GROW_DURATION_MS);
      closeTimer.current = null;
    }, HOVER_BRIDGE_MS);
  };
  const openOverlay = () => {
    if (!overlayEnabled) return;
    cancelClose();
    const el = wrapperRef.current;
    let left = 0;
    let top = 0;
    if (el) {
      const rect = el.getBoundingClientRect();
      // Position the overlay to the RIGHT of the source tile (biolog asked
      // «сместить вправо чтобы другие значки были видны»). overlayPos stores
      // the overlay CENTER (CSS `translate(-50%, -50%)` re-centres). If
      // there isn't enough room on the right, fall back to the left side;
      // last resort — clamp to viewport so the overlay never escapes.
      const halfBox = OVERLAY_BOX / 2;
      const GAP = 8;
      const minLeft = halfBox + GAP;
      const maxLeft = (typeof window !== 'undefined' ? window.innerWidth : 1024) - halfBox - GAP;
      const rightSide = rect.right + GAP + halfBox;
      const leftSide = rect.left - GAP - halfBox;
      if (rightSide <= maxLeft) left = rightSide;
      else if (leftSide >= minLeft) left = leftSide;
      else left = Math.max(minLeft, Math.min(maxLeft, rect.left + rect.width / 2));
      top = rect.top + rect.height / 2;
      const minTop = halfBox + GAP;
      const maxTop = (typeof window !== 'undefined' ? window.innerHeight : 768) - halfBox - GAP;
      top = Math.max(minTop, Math.min(maxTop, top));
    }
    setOverlayPos({ left, top });
    if (!overlayMounted) {
      // First mount — initial style is scale(0.5)/opacity(0); rAF flips to active.
      setOverlayMounted(true);
      setOverlayActive(false);
      requestAnimationFrame(() => setOverlayActive(true));
    } else {
      setOverlayActive(true);
    }
  };

  // Inline-mode tile sits in a fixed-size grid cell (catalog cards, multi
  // rows) — wrapper width must equal `size` so the surrounding layout doesn't
  // shift after annotations load. Overlay mode (SingleInspector full-width
  // row, F4 hover portal) lets the wrapper grow with `vbox.drawW/drawH` so
  // the parent container (`bg-amber-…`) tightly wraps the SVG + leader-labels
  // — without this, the SVG visually pokes outside its wrapper and parents
  // either look too small or stretch to fill cross-axis.
  const wrapperWidth = isOverlay ? vbox.drawW : size;
  const wrapperHeight = isOverlay ? vbox.drawH : size;

  // Inline tile chip-frame REMOVED on biolog feedback 02.05.2026:
  // «круглую обводку вокруг значков плазмид убрать на панеле слева. они
  // должны в своих прозрачных микроконтейнерах быть без обводки.»
  // The catalog list looks cleaner with bare icons floating on the row
  // background — the inner SVG backbone (<circle stroke="var(--border-default)"
  // opacity=0.6 strokeWidth=0.5>) already gives the necessary plasmid
  // silhouette without an extra container ring.
  return (
    <span
      ref={wrapperRef}
      className={`relative inline-block ${cursorClass}`}
      style={{
        width: wrapperWidth,
        height: wrapperHeight,
        lineHeight: 0,
        background: 'transparent',
      }}
      data-testid="plasmid-mini-map"
      onMouseEnter={overlayEnabled ? openOverlay : undefined}
      onMouseLeave={overlayEnabled ? scheduleClose : undefined}
    >
      <svg
        ref={svgRef}
        className="mini-map"
        width={vbox.drawW}
        height={vbox.drawH}
        viewBox={`${vbox.x} ${vbox.y} ${vbox.w} ${vbox.h}`}
        role="img"
        aria-label={isCircular ? `circular ${totalLen} bp` : `linear ${totalLen} bp`}
        style={{
          overflow: isOverlay ? 'visible' : 'hidden',
        }}
      >
        {/* Sprint M-X.3 follow-up — track band beneath the feature
            arcs. Biolog «хочу чтобы межгенные участки были видны
            более чётко, может добавить просто белую арку?». Without
            this band the gaps between features rendered as just the
            thin backbone hairline — visually they read as «empty
            space» rather than «non-coding region». The big
            PlasmidMap (canvas) already has the same band; this
            brings the mini map in line.

            Stroke = surface-1 (white in light, dark grey in dark)
            so the track contrasts against the surface-2 / page
            background while leaving the feature arcs as the dominant
            colour layer. strokeWidth matches the feature width so
            arcs sit flush inside the track. */}
        {isCircular ? (
          <circle
            data-testid="plasmid-track-band"
            cx={cx} cy={cy} r={r} fill="none"
            stroke="var(--surface-1, #ffffff)"
            strokeWidth={strokeWidth}
          />
        ) : (
          <line
            data-testid="plasmid-track-band"
            x1={4} y1={cy} x2={size - 4} y2={cy}
            fill="none"
            stroke="var(--surface-1, #ffffff)"
            strokeWidth={strokeWidth}
          />
        )}
        {/* Sprint M-X.3 follow-up — biolog «чёрную обводку им дай.
            Её не хватает». Two thin dark rims bound the track band's
            inner + outer edges so the channel reads as a defined
            silhouette rather than a soft blob. Rims sit at
            ±strokeWidth/2 from the band centre — exactly the band's
            outer pixel boundary. */}
        {isCircular ? (
          <>
            <circle
              data-testid="plasmid-track-rim"
              cx={cx} cy={cy} r={r - strokeWidth / 2}
              fill="none"
              stroke="var(--text-primary, #1c1917)"
              strokeWidth={0.6}
              opacity={0.85}
            />
            <circle
              data-testid="plasmid-track-rim"
              cx={cx} cy={cy} r={r + strokeWidth / 2}
              fill="none"
              stroke="var(--text-primary, #1c1917)"
              strokeWidth={0.6}
              opacity={0.85}
            />
          </>
        ) : (
          <>
            <line
              data-testid="plasmid-track-rim"
              x1={4} y1={cy - strokeWidth / 2}
              x2={size - 4} y2={cy - strokeWidth / 2}
              stroke="var(--text-primary, #1c1917)"
              strokeWidth={0.6}
              opacity={0.85}
            />
            <line
              data-testid="plasmid-track-rim"
              x1={4} y1={cy + strokeWidth / 2}
              x2={size - 4} y2={cy + strokeWidth / 2}
              stroke="var(--text-primary, #1c1917)"
              strokeWidth={0.6}
              opacity={0.85}
            />
          </>
        )}
        {paths}
        {/* Click-capture ring (set origin). Sits ON TOP of the feature arcs so
            a click ANYWHERE on the ring (feature or gap) marks the origin
            (Игорь — «отметить кликом»). Transparent wide stroke, pointer-events
            on the stroke band only; the visual decorations below it are
            pointer-events:none so they render on top yet never block the click. */}
        {isCircular && typeof onPositionClick === 'function' && (
          <circle
            data-testid="plasmid-origin-capture"
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke="transparent"
            strokeWidth={strokeWidth + 16}
            style={{ cursor: 'crosshair', pointerEvents: 'stroke' }}
            onClick={onRingClick}
          >
            <title>Кликните, чтобы отметить начало отсчёта</title>
          </circle>
        )}
        {/* Direction arrows are now integrated INTO each directional feature
            shape (вариант A «блок-стрелка», Игорь 17.06) — drawn in the `paths`
            loop above as one filled body+head, with a narrow-triangle fallback
            for short features. No separate overlay layer. */}
        {/* bp ruler — circular (angular ticks + labels just outside the ring).
            rotationRad rotates the tick ANGLES so they follow the spinning
            plasmid while the bp-number text stays horizontal. */}
        {isCircular && minorTicks.map((p) => {
          const t = circularTick(p, totalLen, cx, cy, tickInner, minorLen, null, rotationRad);
          return (
            <line
              key={`mt-${p}`}
              x1={t.x1.toFixed(2)} y1={t.y1.toFixed(2)}
              x2={t.x2.toFixed(2)} y2={t.y2.toFixed(2)}
              stroke="var(--text-tertiary, #78716c)" strokeWidth={0.6} style={{ pointerEvents: 'none' }}
            />
          );
        })}
        {isCircular && majorTicks.map((p) => {
          // Label radius pushed further out (Игорь — «подписи вынести подальше»).
          const t = circularTick(p, totalLen, cx, cy, tickInner, majorLen, tickInner + majorLen + 6, rotationRad);
          return (
            <g key={`Mt-${p}`} style={{ pointerEvents: 'none' }}>
              <line x1={t.x1.toFixed(2)} y1={t.y1.toFixed(2)} x2={t.x2.toFixed(2)} y2={t.y2.toFixed(2)} stroke="var(--text-secondary, #57534e)" strokeWidth={0.9} />
              {p > 0 && (
                <text
                  x={t.lx.toFixed(2)} y={(t.ly + 3).toFixed(2)} fontSize="8"
                  fontFamily="var(--font-mono, ui-monospace, monospace)" textAnchor={t.anchor}
                  style={isOverlay ? OVERLAY_TEXT_STYLE : { fill: 'var(--text-tertiary, #78716c)' }}
                >{p}</text>
              )}
            </g>
          );
        })}
        {/* bp ruler — linear (ticks + labels below the bar). Игорь — «линейку
            размеров и на линейную топологию». */}
        {!isCircular && rulerEnabled && (
          <g style={{ pointerEvents: 'none' }} data-testid="plasmid-ruler-linear">
            {minorTicks.map((p) => (
              <line
                key={`lmt-${p}`}
                x1={linX(p).toFixed(2)} y1={linTickTop.toFixed(2)}
                x2={linX(p).toFixed(2)} y2={(linTickTop + minorLen).toFixed(2)}
                stroke="var(--text-tertiary, #78716c)" strokeWidth={0.6}
              />
            ))}
            {majorTicks.map((p) => (
              <g key={`lMt-${p}`}>
                <line
                  x1={linX(p).toFixed(2)} y1={linTickTop.toFixed(2)}
                  x2={linX(p).toFixed(2)} y2={(linTickTop + majorLen).toFixed(2)}
                  stroke="var(--text-secondary, #57534e)" strokeWidth={0.9}
                />
                {p > 0 && p % linLabelStep === 0 && (
                  <text
                    x={linX(p).toFixed(2)} y={(linTickTop + majorLen + 9).toFixed(2)} fontSize="8"
                    fontFamily="var(--font-mono, ui-monospace, monospace)" textAnchor="middle"
                    style={isOverlay ? OVERLAY_TEXT_STYLE : { fill: 'var(--text-tertiary, #78716c)' }}
                  >{p}</text>
                )}
              </g>
            ))}
          </g>
        )}
        {/* Fixed ZERO marker — always at the top (12 o'clock), OUTSIDE the
            rotation group. The plasmid spins under it; the base landing here is
            position 1 (Игорь — «ноль всегда сверху»). Accent triangle + notch
            so it reads as the origin pointer, not just a tick. */}
        {isCircular && showRuler && (
          <g style={{ pointerEvents: 'none' }} data-testid="plasmid-origin-top">
            <line
              x1={cx} y1={(cy - (r - strokeWidth / 2)).toFixed(2)}
              x2={cx} y2={(cy - (rOuterBand + majorLen + 1)).toFixed(2)}
              stroke="var(--accent-600, #c2410c)" strokeWidth={1.4}
            />
            <polygon
              points={`${cx - 3.4},${(cy - (rOuterBand + majorLen + 1)).toFixed(2)} ${cx + 3.4},${(cy - (rOuterBand + majorLen + 1)).toFixed(2)} ${cx},${(cy - (rOuterBand + majorLen - 4)).toFixed(2)}`}
              fill="var(--accent-600, #c2410c)"
            />
          </g>
        )}
        {isCircular && Number.isFinite(originMarkerBp) && originMarkerBp > 1 && (() => {
          const m = originMarkerGeom(originMarkerBp, totalLen, cx, cy, r, strokeWidth, rOuterBand, majorLen);
          return (
            <g style={{ pointerEvents: 'none' }} data-testid="plasmid-origin-marker">
              <line
                x1={m.ix.toFixed(2)} y1={m.iy.toFixed(2)}
                x2={m.ox.toFixed(2)} y2={m.oy.toFixed(2)}
                stroke="var(--accent-700, #b45309)" strokeWidth={1.6}
              />
              <text
                x={m.lx.toFixed(2)} y={(m.ly + 3).toFixed(2)} fontSize="8.5" textAnchor={m.anchor}
                fontFamily="system-ui, sans-serif"
                style={{ ...(isOverlay ? OVERLAY_TEXT_STYLE : {}), fill: 'var(--accent-700, #b45309)', fontWeight: 600 }}
              >▸ начало {originMarkerBp}</text>
            </g>
          );
        })()}
        {/* Centre label (name + bp) — SnapGene look. */}
        {isCircular && centerLabel && (
          <g style={{ pointerEvents: 'none' }} data-testid="plasmid-center-label">
            <text x={cx} y={cy - 2} fontSize="11" fontWeight="600" textAnchor="middle"
              fontFamily="system-ui, sans-serif" fill="var(--text-secondary, #57534e)">
              {truncateLabel(centerLabel.name || '')}
            </text>
            {centerLabel.bp != null && (
              <text x={cx} y={cy + 11} fontSize="9" textAnchor="middle"
                fontFamily="var(--font-mono, monospace)" fill="var(--text-tertiary, #78716c)">
                {centerLabel.bp} bp
              </text>
            )}
          </g>
        )}
        {labels.map((l) => (
          <g key={`label-${l.key}`} style={{ pointerEvents: 'none' }}>
            <line
              x1={l.innerX} y1={l.innerY}
              x2={l.outerX} y2={l.outerY}
              stroke={l.color} strokeWidth={1} opacity={0.85}
            />
            <text
              x={l.textX} y={l.textY}
              fontSize="9"
              fontFamily="system-ui, sans-serif"
              textAnchor={l.anchor}
              style={isOverlay
                ? OVERLAY_TEXT_STYLE
                : { fill: 'var(--text-primary, #1c1917)' }}
            >
              {l.label}
            </text>
          </g>
        ))}
      </svg>
      {hovered && (
        <span
          className="absolute pointer-events-none rounded text-white text-[11px] leading-[1.4] px-2 py-1 whitespace-nowrap"
          style={{
            background: '#1a1a1a',
            left: hovered.x + 8,
            top: hovered.y + 8,
            zIndex: 60,
            display: 'inline-block',
          }}
          data-testid="plasmid-mini-map-tooltip"
        >
          {hovered.text}
        </span>
      )}
      {/* F4 grow-overlay portal — theme-aware card (was hardcoded
          bg-white/border-gray-200; биолог жаловался на белое поле на dark
          теме). Inner mini-map at size=144 (~20% smaller than прежние 180)
          per «вылетающую плазмиду уменьшить процентов на 20». */}
      {overlayMounted && typeof document !== 'undefined' && createPortal(
        // Re-apply data-theme on the portal node so CSS variables (surface-1,
        // border-default, text-primary, …) cascade into it. Portals mount at
        // document.body, while data-theme lives on document.documentElement;
        // inheritance normally works, but Vivaldi + Tailwind 4 occasionally
        // resolves CSS vars from the document defaults instead of the dark
        // palette, leaving the overlay card visibly white on dark background.
        <span
          data-theme={typeof document !== 'undefined' ? document.documentElement?.dataset?.theme : undefined}
          style={{
            position: 'fixed',
            left: overlayPos.left,
            top: overlayPos.top,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            pointerEvents: 'auto',
            padding: 12,
            borderRadius: 'var(--radius-md, 6px)',
            background: 'var(--surface-1, #fff)',
            border: '0.5px solid var(--border-default, #d6d3d1)',
            boxShadow: '0 6px 20px rgba(0, 0, 0, 0.28)',
            transform: overlayActive
              ? 'translate(-50%, -50%) scale(1)'
              : 'translate(-50%, -50%) scale(0.5)',
            opacity: overlayActive ? 1 : 0,
            transition: `transform ${GROW_DURATION_MS}ms ease-out, opacity ${GROW_DURATION_MS}ms ease-out`,
            transformOrigin: 'center center',
            boxSizing: 'border-box',
            lineHeight: 0,
          }}
          data-testid="plasmid-mini-map-overlay"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <PlasmidMiniMap
            length={length}
            topology={topology}
            annotations={annotations}
            size={144}
            mode="overlay"
          />
        </span>,
        document.body,
      )}
    </span>
  );
}

// Memo with shallow comparator: skip re-render if these primitives + the
// annotations array reference are unchanged. Catalog data sources (Mine /
// SnapGene / Demo) keep stable annotation refs across catalog re-renders,
// so 400-item lists no longer rebuild every map on parent state churn
// (drag highlight, hover bridges, etc.).
export default memo(PlasmidMiniMap, (prev, next) => (
  prev.length === next.length
  && prev.topology === next.topology
  && prev.size === next.size
  && prev.mode === next.mode
  && prev.disableHoverOverlay === next.disableHoverOverlay
  && prev.annotations === next.annotations
  // SnapGene-overview opt-ins (functions intentionally not compared — same as
  // onFeatureClick; the primitive originMarkerBp drives the click re-render).
  && prev.showRuler === next.showRuler
  && prev.showDirections === next.showDirections
  && prev.rotationDeg === next.rotationDeg
  && prev.originMarkerBp === next.originMarkerBp
  && (prev.centerLabel?.name === next.centerLabel?.name)
  && (prev.centerLabel?.bp === next.centerLabel?.bp)
));
