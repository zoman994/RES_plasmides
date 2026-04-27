/**
 * PlasmidMiniMap — small SVG indicator of a plasmid's region annotations.
 *
 * Used by ImportStartScreen MetaColumn (180 px), MultiFileList (46 px) and
 * CatalogTree cards (64 px). Read-only — no labels, no RE sites, no hover
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
 *     native ~700 ms SVG <title> popup. <title> stays in DOM for SR a11y.
 *   - Leader-line labels for size === 180 on regions ≥ 10 % circumference,
 *     top-8 by length, simple collision-staggering for close angles.
 *   - For sizes ≤ 90 (CatalogTree, MultiFileList) — click opens a 180 px
 *     popover overlay with full labels.
 */

import { useState } from 'react';
import { featureColor, FEATURE_STROKE, FEATURE_COLORS_V2 } from '../feature-palette';
import { getRegions } from '../annotation-model';

const LEADER_LEN = 10;         // px the leader sticks out past outer radius
const LABEL_RING = 32;         // px radial ring reserved for labels (180 px mode)
const LABEL_THRESHOLD = 0.10;  // 10 % of circumference
const MAX_LABELS = 8;
const COLLISION_RAD = 0.26;    // ≈ 15° — labels closer than this get staggered

function buildLabels(regions, totalLen, cx, cy, r) {
  if (!regions.length) return [];
  const candidates = regions
    .map((reg) => {
      const span = Math.max(0, reg.end - reg.start);
      return { region: reg, span, frac: span / Math.max(1, totalLen) };
    })
    .filter((c) => c.frac >= LABEL_THRESHOLD)
    .sort((a, b) => b.span - a.span)
    .slice(0, MAX_LABELS);
  if (!candidates.length) return [];

  const items = candidates.map((c) => {
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
          style={{ cursor: 'help' }}
          onMouseMove={(e) => showHover(titleText, e)}
          onMouseLeave={clearHover}
        >
          <title>{titleText}</title>
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
          style={{ cursor: 'help' }}
          onMouseMove={(e) => showHover(titleText, e)}
          onMouseLeave={clearHover}
        >
          <title>{titleText}</title>
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
    if (isCircular) {
      paths.push(
        <g
          key="empty-linker"
          style={{ cursor: 'help' }}
          onMouseMove={(e) => showHover(`${totalLen} bp · без аннотаций`, e)}
          onMouseLeave={clearHover}
        >
          <title>{`${totalLen} bp · без аннотаций`}</title>
          <circle cx={cx} cy={cy} r={r} stroke={linkerColor} strokeWidth={strokeWidth} fill="none" />
        </g>
      );
    } else {
      paths.push(
        <g
          key="empty-linker"
          style={{ cursor: 'help' }}
          onMouseMove={(e) => showHover(`${totalLen} bp · без аннотаций`, e)}
          onMouseLeave={clearHover}
        >
          <title>{`${totalLen} bp · без аннотаций`}</title>
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

  // Compact size → click opens a 180 px popover with labels.
  const isCompact = size <= 90;
  const cursorClass = isCompact ? 'cursor-zoom-in' : '';

  return (
    <span
      className={`relative inline-block ${cursorClass}`}
      style={{ width: size, height: size, lineHeight: 0 }}
      data-testid="plasmid-mini-map"
    >
      <svg
        className="mini-map"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={isCircular ? `circular ${totalLen} bp` : `linear ${totalLen} bp`}
        style={{ overflow: 'visible' }}
        onClick={isCompact ? (e) => { e.stopPropagation(); setPopoverOpen(true); } : undefined}
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
          className="absolute pointer-events-none rounded text-white text-[11px] px-2 py-0.5 whitespace-nowrap"
          style={{
            background: '#1a1a1a',
            left: hovered.x + 8,
            top: hovered.y + 8,
            zIndex: 60,
          }}
          data-testid="plasmid-mini-map-tooltip"
        >
          {hovered.text}
        </span>
      )}
      {popoverOpen && (
        <span
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => { e.stopPropagation(); setPopoverOpen(false); }}
          data-testid="plasmid-mini-map-popover"
        >
          <span
            className="bg-white rounded-lg shadow-xl border border-gray-200 p-4 flex flex-col items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <PlasmidMiniMap
              length={length}
              topology={topology}
              annotations={annotations}
              size={180}
            />
            <button
              className="text-[11px] text-gray-500 hover:text-gray-700 self-end"
              onClick={(e) => { e.stopPropagation(); setPopoverOpen(false); }}
              aria-label="Закрыть"
            >
              ✕ закрыть
            </button>
          </span>
        </span>
      )}
    </span>
  );
}
