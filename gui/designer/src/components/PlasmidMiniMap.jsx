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
import { featureColor, featureColorShaded, FEATURE_STROKE, FEATURE_COLORS_V2 } from '../feature-palette';
import { getRegions } from '../annotation-model';

const LEADER_LEN = 10;                    // px the leader sticks out past outer radius / above bar
const LABEL_RING = 32;                    // px radial ring reserved for labels (circular ≥180 px)
const COLLISION_RAD = 0.26;               // ≈ 15° — circular labels closer than this get staggered
const COLLISION_PX = 40;                  // px — linear labels with anchors closer get staggered
const HOVER_BRIDGE_MS = 80;               // K5.1 hover-bridge debounce (mouseleave → close).
                                          // Was 250 ms — biolog asked for «быстрее исчезали при
                                          // убирании курсора»; 80 ms still allows mouse to cross
                                          // the small gap between source tile and overlay portal.
const GROW_DURATION_MS = 140;             // F4 transform/opacity transition for the grow-overlay
                                          // — also tightened (was 200) so dismiss feels snappy.
const LABEL_LENGTH_THRESHOLD_BP = 300;    // K6 (V46): every region ≥300 bp gets a label
const LABEL_MAX_CHARS = 14;               // truncate noun-phrase labels so post-getBBox SVG stays
                                          // close to `size`. SnapGene names like "trpC terminator
                                          // sequence from A. nidulans" otherwise blow vbox.drawW
                                          // past 400 px and overflow the 240 px OverviewTab cell.
const LABEL_TYPE_BLACKLIST = new Set([    // GenBank metadata that always covers full plasmid
  'source',
]);

function truncateLabel(s) {
  if (!s) return '';
  if (s.length <= LABEL_MAX_CHARS) return s;
  return s.slice(0, Math.max(1, LABEL_MAX_CHARS - 1)) + '…';
}

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

function pickRegionsForLabels(regions) {
  return regions
    .filter((r) => {
      const len = (r.end || 0) - (r.start || 0);
      if (len < LABEL_LENGTH_THRESHOLD_BP) return false;
      if (LABEL_TYPE_BLACKLIST.has(r.type)) return false;
      return true;
    })
    .slice()
    .sort((a, b) => (b.end - b.start) - (a.end - a.start));
}

function buildCircularLabels(regions, totalLen, cx, cy, r) {
  const picked = pickRegionsForLabels(regions);
  if (!picked.length) return [];

  const items = picked.map((region) => {
    const start = Math.max(0, region.start);
    const end = Math.max(start, region.end);
    const midFrac = ((start + end) / 2) / Math.max(1, totalLen);
    const ang = midFrac * 2 * Math.PI - Math.PI / 2;
    const innerX = cx + r * Math.cos(ang);
    const innerY = cy + r * Math.sin(ang);
    const outerR = r + LEADER_LEN;
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

function buildLinearLabels(regions, totalLen, size, cy, strokeWidth) {
  const picked = pickRegionsForLabels(regions);
  if (!picked.length) return [];

  const items = picked.map((region) => {
    const start = Math.max(0, region.start);
    const end = Math.max(start, region.end);
    const midFrac = ((start + end) / 2) / Math.max(1, totalLen);
    const innerX = midFrac * (size - 8) + 4;
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

function PlasmidMiniMap({
  length, topology, annotations, size = 64,
  mode = 'inline',
  disableHoverOverlay = false,
}) {
  const isOverlay = mode === 'overlay';
  const isCircular = topology === 'circular';
  const totalLen = Math.max(1, length || 0);
  const regions = getRegions(annotations);

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
  const strokeWidth = Math.max(4, Math.round(size / 13));
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

  const labels = showLabels
    ? (isCircular
        ? buildCircularLabels(regions, totalLen, cx, cy, r)
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
  }, [size, totalLen, isCircular, regions.length, labels.length, isOverlay]);

  const showHover = (titleText, evt) => {
    const host = evt.currentTarget.ownerSVGElement?.parentElement;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    setHovered({ text: titleText, x: evt.clientX - rect.left, y: evt.clientY - rect.top });
  };
  const clearHover = () => setHovered(null);

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
      const span = end - start;
      if (span >= totalLen - 1) {
        paths.push(
          <g
            key={region.id}
            role="img"
            aria-label={titleText}
            style={{ cursor: 'help' }}
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
      const a1 = (start / totalLen) * 2 * Math.PI - Math.PI / 2;
      const a2 = (end / totalLen) * 2 * Math.PI - Math.PI / 2;
      const x1 = cx + r * Math.cos(a1);
      const y1 = cy + r * Math.sin(a1);
      const x2 = cx + r * Math.cos(a2);
      const y2 = cy + r * Math.sin(a2);
      const large = (a2 - a1) > Math.PI ? 1 : 0;
      const arcPath = `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
      paths.push(
        <g
          key={region.id}
          role="img"
          aria-label={titleText}
          style={{ cursor: 'help' }}
          onMouseMove={(e) => showHover(titleText, e)}
          onMouseLeave={clearHover}
        >
          {/*
            * Two-layer stroke (see same pattern in the full-length
            * branch above): wider FEATURE_STROKE arc underneath gives
            * each sector a thin black rim.
            */}
          <path
            d={arcPath}
            stroke={FEATURE_STROKE}
            strokeWidth={strokeWidth + 0.8}
            fill="none"
            strokeLinecap="butt"
          />
          <path
            d={arcPath}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="butt"
          />
        </g>
      );
    } else {
      const x1 = (start / totalLen) * (size - 8) + 4;
      const x2 = (end / totalLen) * (size - 8) + 4;
      paths.push(
        <g
          key={region.id}
          role="img"
          aria-label={titleText}
          style={{ cursor: 'help' }}
          onMouseMove={(e) => showHover(titleText, e)}
          onMouseLeave={clearHover}
        >
          <rect
            x={x1}
            y={cy - strokeWidth / 2}
            width={Math.max(1, x2 - x1)}
            height={strokeWidth}
            fill={color}
            stroke={FEATURE_STROKE}
            strokeWidth={0.7}
          />
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
            strokeWidth={0.5}
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
        {/* Backbone — theme-aware via CSS var. FEATURE_STROKE (#3A2F1F)
            на dark теме слипался с фоном; var(--border-default) видим
            на обеих темах + opacity 0.6 чтобы не доминировать над arcs. */}
        {isCircular ? (
          <circle
            cx={cx} cy={cy} r={r} fill="none"
            style={{ stroke: 'var(--border-default, #d6d3d1)' }}
            strokeWidth={0.5} opacity={0.6}
          />
        ) : (
          <line
            x1={4} y1={cy} x2={size - 4} y2={cy}
            style={{ stroke: 'var(--border-default, #d6d3d1)' }}
            strokeWidth={0.5} opacity={0.6}
          />
        )}
        {paths}
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
));
