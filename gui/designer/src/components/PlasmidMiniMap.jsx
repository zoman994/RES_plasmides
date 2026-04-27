/**
 * PlasmidMiniMap — small SVG indicator of a plasmid's region annotations.
 *
 * Used by ImportStartScreen MetaColumn (180 px), MultiInspector rows (40 px)
 * and CatalogPanel cards (48 px). Read-only — no labels, no RE sites, no hover
 * scale, no selected state. Empty annotations → one solid linker arc/bar
 * (signals "structure not recognized, annotate or accept as-is").
 *
 * Cycles through `featureColor()` (feature-palette.js) so colors stay in
 * sync with PlasmidMap and SequencePane region rendering.
 *
 * Kfix-4:
 *   - viewBox padding under stroke (r ≤ (size − strokeWidth − 2) / 2) so
 *     thick arcs don't clip at the SVG boundary.
 *   - Custom React-state tooltip (`<div>` overlay, instant) — replaces
 *     native ~700 ms SVG <title> popup. Each arc <g> carries an
 *     `aria-label` (V37 mini-fix) so screen readers still announce the
 *     region name without browsers rendering a competing native tooltip.
 *   - Leader-line labels for size === 180 on regions ≥ 10 % circumference,
 *     top-8 by length, simple collision-staggering for close angles.
 *   - For sizes ≤ 90 (CatalogPanel cards, MultiInspector rows) — hover opens
 *     a 180 px popover overlay with full labels (V38 mini-fix-2: was
 *     click-based; IS-Final K5.1 added 250 ms hover-bridge debounce).
 */

import { useEffect, useRef, useState } from 'react';
import { featureColor, FEATURE_STROKE, FEATURE_COLORS_V2 } from '../feature-palette';
import { getRegions } from '../annotation-model';
import { isResistanceMarker } from './ImportStartScreen/FileSummaryCard';

const LEADER_LEN = 10;         // px the leader sticks out past outer radius
const LABEL_RING = 32;         // px radial ring reserved for labels (180 px mode)
const LABEL_THRESHOLD = 0.03;  // K5.2: 3 % (was 10 %)
const MAX_LABELS = 8;
const COLLISION_RAD = 0.26;    // ≈ 15° — labels closer than this get staggered
const HOVER_BRIDGE_MS = 250;   // K5.1 hover-bridge debounce

// K5.2 priority class regex (mirror FileSummaryCard ORIGIN_NAME_RE / TAG_NAME_RE
// without re-exporting; small surface kept private).
const ORIGIN_NAME_RE = /^(ori|pUC ori|f1 ori|ColE1|p15A|2[μu]|ARS|CEN|pMB1|R6K|pBR322 ori)/i;
const TAG_NAME_RE = /^(His[6-9]?|FLAG|HA|c?-?Myc|GFP|EGFP|mCherry|mTagBFP|T7-?tag|Strep-?II?|S-?tag|V5|VP(16|64|160))/i;

function isOrigin(r) {
  return r?.type === 'rep_origin' || ORIGIN_NAME_RE.test(r?.name || '');
}
function isPromoter(r) {
  return r?.type === 'promoter';
}
function isTag(r) {
  return r?.type === 'tag' || TAG_NAME_RE.test(r?.name || '');
}

function buildLabels(regions, totalLen, cx, cy, r) {
  if (!regions.length) return [];
  // K5.2 priority pass: resistance / origin / promoter / tag pulled with hard
  // caps regardless of length. Then fallback fill by length down to 3 %.
  const used = new Set();
  const picks = [];
  const HARD_CAP = { resistance: 5, origin: 3, promoter: 3, tag: 2 };
  const passes = [
    { name: 'resistance', match: isResistanceMarker, cap: HARD_CAP.resistance },
    { name: 'origin', match: isOrigin, cap: HARD_CAP.origin },
    { name: 'promoter', match: isPromoter, cap: HARD_CAP.promoter },
    { name: 'tag', match: isTag, cap: HARD_CAP.tag },
  ];
  for (const pass of passes) {
    if (picks.length >= MAX_LABELS) break;
    const matched = regions
      .filter((rr) => !used.has(rr.id) && pass.match(rr))
      .sort((a, b) => (b.end - b.start) - (a.end - a.start));
    const hits = matched.slice(0, pass.cap);
    for (const h of hits) {
      if (picks.length >= MAX_LABELS) break;
      picks.push({ region: h, span: h.end - h.start, frac: (h.end - h.start) / Math.max(1, totalLen) });
      used.add(h.id);
    }
    // Hard-cap is *hard*: class members beyond the cap are still excluded from
    // the fallback pass (so fallback can't sneak a 4th promoter past cap=3).
    for (const m of matched.slice(pass.cap)) used.add(m.id);
  }
  // Fallback fill: regions not yet picked, threshold 3 %.
  if (picks.length < MAX_LABELS) {
    const remaining = regions
      .filter((rr) => !used.has(rr.id))
      .map((rr) => ({ region: rr, span: rr.end - rr.start, frac: (rr.end - rr.start) / Math.max(1, totalLen) }))
      .filter((c) => c.frac >= LABEL_THRESHOLD)
      .sort((a, b) => b.span - a.span)
      .slice(0, MAX_LABELS - picks.length);
    for (const c of remaining) picks.push(c);
  }

  if (!picks.length) return [];

  const items = picks.map((c) => {
    const start = Math.max(0, c.region.start);
    const end = Math.max(start, c.region.end);
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
      key: c.region.id,
      ang,
      label: c.region.name || c.region.type || 'region',
      color: featureColor(c.region.type, c.region.name),
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

export default function PlasmidMiniMap({ length, topology, annotations, size = 64 }) {
  const isCircular = topology === 'circular';
  const totalLen = Math.max(1, length || 0);
  const regions = getRegions(annotations);

  const [hovered, setHovered] = useState(null); // { text, x, y } in container coords
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [popoverPos, setPopoverPos] = useState({ left: 0, top: 0 });
  const wrapperRef = useRef(null);
  const closeTimer = useRef(null);

  // K5.1 cleanup on unmount.
  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const cx = size / 2;
  const cy = size / 2;
  // Kfix-4 viewBox padding: r leaves enough room for stroke + 1 px AA halo.
  const strokeWidth = Math.max(4, Math.round(size / 13));
  const showLabels = size >= 180 && isCircular;
  // Reserve inner ring for labels at 180 px so leader + text fit inside SVG.
  const baseR = (size - strokeWidth - 2) / 2;
  const r = showLabels ? Math.max(20, baseR - LABEL_RING) : baseR;

  const labels = showLabels ? buildLabels(regions, totalLen, cx, cy, r) : [];

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

  // Compact size → hover opens a 180 px popover with labels (V38 mini-fix-2).
  const isCompact = size <= 90;
  const cursorClass = isCompact ? 'cursor-zoom-in' : '';

  // V38: clamp popover within viewport. Default placement: to the right of
  // the trigger, vertically centered; flip leftward / pin to viewport edges
  // when the trigger sits near a card boundary. position: fixed avoids
  // overflow:hidden clipping by ancestor cards.
  const POPOVER_BOX = 220;
  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      setPopoverOpen(false);
      closeTimer.current = null;
    }, HOVER_BRIDGE_MS);
  };
  const openPopover = () => {
    cancelClose();
    const el = wrapperRef.current;
    if (!el) {
      setPopoverOpen(true);
      return;
    }
    const rect = el.getBoundingClientRect();
    let left = rect.right + 8;
    if (left + POPOVER_BOX > window.innerWidth - 8) {
      left = rect.left - POPOVER_BOX - 8;
    }
    if (left < 8) left = 8;
    let top = rect.top + rect.height / 2 - POPOVER_BOX / 2;
    if (top < 8) top = 8;
    if (top + POPOVER_BOX > window.innerHeight - 8) {
      top = window.innerHeight - POPOVER_BOX - 8;
    }
    setPopoverPos({ left, top });
    setPopoverOpen(true);
  };

  return (
    <span
      ref={wrapperRef}
      className={`relative inline-block ${cursorClass}`}
      style={{ width: size, height: size, lineHeight: 0 }}
      data-testid="plasmid-mini-map"
      onMouseEnter={isCompact ? openPopover : undefined}
      onMouseLeave={isCompact ? scheduleClose : undefined}
    >
      <svg
        className="mini-map"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={isCircular ? `circular ${totalLen} bp` : `linear ${totalLen} bp`}
        style={{ overflow: 'visible' }}
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
      {popoverOpen && (
        <span
          className="bg-white rounded-lg shadow-xl border border-gray-200 p-3 flex items-center justify-center"
          style={{
            position: 'fixed',
            left: popoverPos.left,
            top: popoverPos.top,
            zIndex: 50,
          }}
          data-testid="plasmid-mini-map-popover"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <PlasmidMiniMap
            length={length}
            topology={topology}
            annotations={annotations}
            size={180}
          />
        </span>
      )}
    </span>
  );
}
