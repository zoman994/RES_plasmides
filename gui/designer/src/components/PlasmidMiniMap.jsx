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

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { featureColor, FEATURE_STROKE, FEATURE_COLORS_V2 } from '../feature-palette';
import { getRegions } from '../annotation-model';

const LEADER_LEN = 10;                    // px the leader sticks out past outer radius / above bar
const LABEL_RING = 32;                    // px radial ring reserved for labels (circular ≥180 px)
const COLLISION_RAD = 0.26;               // ≈ 15° — circular labels closer than this get staggered
const COLLISION_PX = 40;                  // px — linear labels with anchors closer get staggered
const HOVER_BRIDGE_MS = 250;              // K5.1 hover-bridge debounce (mouseleave → close)
const GROW_DURATION_MS = 200;             // F4 transform/opacity transition for the grow-overlay
const LABEL_LENGTH_THRESHOLD_BP = 300;    // K6 (V46): every region ≥300 bp gets a label
const LABEL_TYPE_BLACKLIST = new Set([    // GenBank metadata that always covers full plasmid
  'source',
]);

// F4 (Sprint Catalog Polish FIX): paint-order: stroke fill + white halo so
// labels read on any background tile (cards, popover, anything underneath).
// FIX-2 (28.04.2026): K2 restored white-card bg behind the overlay; halo stays
// because labels can sit outside the white card during 1A viewBox expansion.
const OVERLAY_TEXT_STYLE = {
  paintOrder: 'stroke fill',
  stroke: 'white',
  strokeWidth: 3,
  filter: 'drop-shadow(0 0 1px rgba(0, 0, 0, 0.4))',
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
      label: region.name || region.type || 'region',
      color: featureColor(region.type, region.name),
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
      label: region.name || region.type || 'region',
      color: featureColor(region.type, region.name),
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

export default function PlasmidMiniMap({
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
  // 4 px padding so labels never clip. jsdom lacks getBBox → effect no-ops.
  // F1: only in overlay mode — inline mode keeps a fixed `0 0 size size` box
  // so the SVG fits its parent grid cell (the F1 fix for V46-acceptance bug).
  const [vbox, setVbox] = useState({ x: 0, y: 0, w: size, h: size, drawW: size, drawH: size });
  useLayoutEffect(() => {
    if (!isOverlay) {
      // Inline mode: lock viewBox to the host size on every prop change.
      setVbox({ x: 0, y: 0, w: size, h: size, drawW: size, drawH: size });
      return;
    }
    if (!svgRef.current) return;
    if (!labels.length) {
      setVbox({ x: 0, y: 0, w: size, h: size, drawW: size, drawH: size });
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
    if (minX === 0 && minY === 0 && w === size && h === size) return;
    setVbox({ x: minX, y: minY, w, h, drawW: w, drawH: h });
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
    const color = featureColor(region.type, region.name);
    const titleText = `${region.name || region.type || 'region'} · ${start + 1}–${end} bp`;

    if (isCircular) {
      const a1 = (start / totalLen) * 2 * Math.PI - Math.PI / 2;
      const a2 = (end / totalLen) * 2 * Math.PI - Math.PI / 2;
      const x1 = cx + r * Math.cos(a1);
      const y1 = cy + r * Math.sin(a1);
      const x2 = cx + r * Math.cos(a2);
      const y2 = cy + r * Math.sin(a2);
      const large = (a2 - a1) > Math.PI ? 1 : 0;
      paths.push(
        <g
          key={region.id}
          role="img"
          aria-label={titleText}
          style={{ cursor: 'help' }}
          onMouseMove={(e) => showHover(titleText, e)}
          onMouseLeave={clearHover}
        >
          <path
            d={`M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`}
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
  // expansion may grow the inner SVG up to ~280 px, so we leave headroom in
  // the viewport-clamp box.
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
      // Centre the overlay on the source tile, then clamp to viewport.
      left = rect.left + rect.width / 2 - OVERLAY_BOX / 2;
      top = rect.top + rect.height / 2 - OVERLAY_BOX / 2;
      if (left < 8) left = 8;
      if (left + OVERLAY_BOX > window.innerWidth - 8) {
        left = window.innerWidth - OVERLAY_BOX - 8;
      }
      if (top < 8) top = 8;
      if (top + OVERLAY_BOX > window.innerHeight - 8) {
        top = window.innerHeight - OVERLAY_BOX - 8;
      }
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

  return (
    <span
      ref={wrapperRef}
      className={`relative inline-block ${cursorClass}`}
      style={{ width: size, height: size, lineHeight: 0 }}
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
        {isCircular ? (
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={FEATURE_STROKE} strokeWidth={0.5} opacity={0.4} />
        ) : (
          <line x1={4} y1={cy} x2={size - 4} y2={cy} stroke={FEATURE_STROKE} strokeWidth={0.5} opacity={0.4} />
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
              fill={FEATURE_STROKE}
              textAnchor={l.anchor}
              style={isOverlay ? OVERLAY_TEXT_STYLE : undefined}
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
      {/* F4 grow-overlay portal — white card (bg/border/shadow), CSS transform
          animation, sits above catalog content via z-index 100. K2 (FIX-2):
          biolog asked for the white-bg card back; перекрытие соседних карточек
          приемлемо по требованию. */}
      {overlayMounted && typeof document !== 'undefined' && createPortal(
        <span
          className="bg-white shadow-lg border border-gray-200 rounded p-3"
          style={{
            position: 'fixed',
            left: overlayPos.left,
            top: overlayPos.top,
            width: OVERLAY_BOX,
            height: OVERLAY_BOX,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            pointerEvents: 'auto',
            transform: overlayActive ? 'scale(1)' : 'scale(0.5)',
            opacity: overlayActive ? 1 : 0,
            transition: `transform ${GROW_DURATION_MS}ms ease-out, opacity ${GROW_DURATION_MS}ms ease-out`,
            transformOrigin: 'center center',
            boxSizing: 'border-box',
          }}
          data-testid="plasmid-mini-map-overlay"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <PlasmidMiniMap
            length={length}
            topology={topology}
            annotations={annotations}
            size={180}
            mode="overlay"
          />
        </span>,
        document.body,
      )}
    </span>
  );
}
