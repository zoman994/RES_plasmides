/**
 * RestrictionTrack — restriction-site labels above the ruler.
 *
 * 13.05.2026 — Игорь UX-pass:
 *   - Labels в чёрном (#111827), не красном.
 *   - При толпе сайтов label получает горизонтальный offset + leader-line
 *     с локтем сбоку, чтобы name не наезжал на соседний name.
 *   - Подпись центрирована относительно cut tick (rotation pivot
 *     смещён на capHeight/2 — иначе вертикальный rotated label «уходит»
 *     влево от cut).
 *   - Strand cut-bar overlay (bindings + cuts + overhang) появляется
 *     ТОЛЬКО при hover (раньше был always-on). Hover state поднят
 *     наверх через onHoverChange callback → parent → SequenceLine
 *     reCutLayout.
 *   - Click highlight (yellow band + wedges) остаётся (DEC).
 *
 * `onHoverChange(key|null)` — emits `${enzyme}-${position}` либо null
 * когда курсор покидает site. Parent agregates → strand overlay рисуется
 * для hover-сайта + click-сайта.
 */

import { memo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RE_ENZYMES } from "../../../restriction-db";
import { lanePack, laneCount } from "../../../lib/linear-map";

const ROW_HEIGHT_RE = 18;
const CUT_BAR_HEIGHT = 6;
const VERTICAL_LABEL_HEIGHT = 36;
// Horizontal-label vertical staggering (Игорь 22.06 «разнести по высоте»):
// packing and hit targets share one footprint so painted labels and pointer
// areas cannot overlap while appearing to occupy the same lane.
const LABEL_CHAR_W = 5.6;
const LABEL_HIT_MIN_LONG = 20;
const LABEL_HIT_INLINE_PAD = 4;
const LABEL_HIT_CROSS = 16;
const LABEL_COLLISION_GAP = 4;
const LANE_STEP = LABEL_HIT_CROSS + 2;
const VERTICAL_LANE_GAP = 2;
const LABEL_EDGE_PAD = 2;
const CUT_HIT_HALF_WIDTH = 5;
const CUT_HIT_ABOVE = 8;
const LEADER_HIT_WIDTH = 8;
const LEADER_BRANCH_OFFSET = 8;
const LEADER_BRANCH_STEP = 12;
// Approximate cap-height for the 9px font used by the labels — used to
// re-centre the rotated text horizontally so visual middle of the
// label sits on the cut tick (instead of drifting left).
const LABEL_FONT = 9;
const LABEL_CENTER_OFFSET = LABEL_FONT / 2 - 0.5;

// B9 (14.05.2026) — palette deterministically maps enzyme name → color.
// 12 distinct hues; больше ферментов — рециркулируем.
const ENZYME_COLORS = [
  '#0284c7', // sky-blue
  '#dc2626', // red
  '#16a34a', // green
  '#d97706', // amber
  '#7c3aed', // violet
  '#db2777', // pink
  '#0891b2', // cyan
  '#65a30d', // lime
  '#ca8a04', // yellow
  '#9333ea', // purple
  '#0d9488', // teal
  '#e11d48', // rose
];
function colorForEnzyme(name) {
  if (!name) return '#111827';
  let h = 0;
  for (let i = 0; i < name.length; i += 1) {
    h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  }
  return ENZYME_COLORS[Math.abs(h) % ENZYME_COLORS.length];
}

const COMPLEMENT = {
  A: 'T', T: 'A', G: 'C', C: 'G',
  R: 'Y', Y: 'R', M: 'K', K: 'M', S: 'S', W: 'W',
  H: 'D', B: 'V', V: 'B', D: 'H', N: 'N',
};
function complementOf(seq) {
  return seq.split('').map((b) => COMPLEMENT[b.toUpperCase()] || b).join('');
}
const DEGENERATE_RE = /[RYMKSWHBVDN]/i;

function siteKey(site) {
  return `${site.enzyme}-${site.position}`;
}

function compareLineSites(a, b) {
  return a.renderCi - b.renderCi
    || String(a.site.enzyme || '').localeCompare(String(b.site.enzyme || ''))
    || a.site.position - b.site.position;
}

function HoverTooltip({ site, count, anchorX, anchorY }) {
  if (typeof document === 'undefined') return null;
  const enz = RE_ENZYMES[site.enzyme];
  if (!enz) return null;

  const recogTop = enz.site.toUpperCase();
  const recogBot = complementOf(recogTop);
  const cutFwd = enz.cut[0];
  const cutRev = enz.cut[1];
  const isSticky = enz.end !== 'blunt';
  const degenerate = DEGENERATE_RE.test(recogTop);
  const showWarning = isSticky && degenerate;
  const cutKind = !isSticky ? 'blunt' : (cutFwd < cutRev ? '5overhang' : '3overhang');

  const seqCharPx = 11;
  const lineH = 14;
  const interStrandGap = 4;
  const cutPad = 4;
  const seqLeft = 4;
  const svgWidth = recogTop.length * seqCharPx + seqLeft * 2;
  const topRowY = cutPad;
  const topTextBaseY = topRowY + 11;
  const botRowY = topRowY + lineH + interStrandGap;
  const botTextBaseY = botRowY + 11;
  const svgHeight = botRowY + lineH + cutPad;
  const charCenterX = (i) => seqLeft + i * seqCharPx + seqCharPx / 2;
  const gapXTop = seqLeft + cutFwd * seqCharPx;
  const gapXBot = seqLeft + cutRev * seqCharPx;

  const topCutY1 = topRowY - cutPad;
  const topCutY2 = topRowY + lineH + 1;
  const botCutY1 = botRowY - 1;
  const botCutY2 = botRowY + lineH + cutPad;

  const overhangX = Math.min(gapXTop, gapXBot);
  const overhangW = Math.abs(gapXBot - gapXTop);
  const overhangY = topRowY - 1;
  const overhangH = (botRowY + lineH) - overhangY + 1;
  const showOverhang = isSticky && overhangW > 0;

  return createPortal(
    <div
      data-testid="sequence-view-re-tooltip"
      data-enzyme={site.enzyme}
      style={{
        position: 'fixed',
        left: `${anchorX}px`,
        top: `${anchorY}px`,
        transform: 'translate(-50%, calc(-100% - 8px))',
        background: '#fefce8',
        border: '1px solid #d97706',
        borderRadius: '4px',
        padding: '8px 12px',
        fontSize: '11px',
        color: '#7f1d1d',
        boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
        pointerEvents: 'none',
        zIndex: 9999,
        fontFamily: 'inherit',
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
        <div style={{ minWidth: '72px' }}>
          <div data-testid="sequence-view-re-tooltip-name" style={{ fontWeight: 600 }}>
            {site.enzyme} ({site.position + 1})
          </div>
          <div data-testid="sequence-view-re-tooltip-count" style={{ fontSize: '10px', marginTop: '2px' }}>
            {count} site{count === 1 ? '' : 's'}
          </div>
        </div>
        <svg width={svgWidth} height={svgHeight} style={{ display: 'block', overflow: 'visible' }}>
          {showOverhang && (
            <rect
              data-testid="sequence-view-re-tooltip-overhang"
              x={overhangX} y={overhangY}
              width={overhangW} height={overhangH}
              fill="#fef3c7" opacity={0.85}
            />
          )}
          <g data-testid="sequence-view-re-tooltip-top">
            {recogTop.split('').map((ch, i) => (
              <text
                key={`t-${i}`}
                x={charCenterX(i)} y={topTextBaseY}
                fontSize={12} fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fill="#111827" textAnchor="middle"
              >{ch}</text>
            ))}
          </g>
          <g data-testid="sequence-view-re-tooltip-bottom">
            {recogBot.split('').map((ch, i) => (
              <text
                key={`b-${i}`}
                x={charCenterX(i)} y={botTextBaseY}
                fontSize={12} fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fill="#111827" textAnchor="middle"
              >{ch}</text>
            ))}
          </g>
          <g data-testid="sequence-view-re-tooltip-cut" data-kind={cutKind}>
            <line
              data-testid="sequence-view-re-tooltip-cut-top"
              x1={gapXTop} y1={topCutY1}
              x2={gapXTop} y2={topCutY2}
              stroke="#dc2626" strokeWidth={1.8} strokeLinecap="round"
            />
            <line
              data-testid="sequence-view-re-tooltip-cut-bottom"
              x1={gapXBot} y1={botCutY1}
              x2={gapXBot} y2={botCutY2}
              stroke="#dc2626" strokeWidth={1.8} strokeLinecap="round"
            />
          </g>
        </svg>
      </div>
      {showWarning && (
        <div
          data-testid="sequence-view-re-tooltip-warning"
          style={{
            fontSize: '10px', marginTop: '6px',
            maxWidth: '260px', lineHeight: 1.3, whiteSpace: 'normal',
          }}
        >
          Sticky ends from different {site.enzyme} sites may not be compatible.
        </div>
      )}
    </div>,
    document.body,
  );
}

/**
 * computeLabelLanes — collision-aware vertical stacking. Each label stays at
 * its cut tick (no sideways cascade); overlapping labels are distributed into
 * lanes (lane 0 = nearest the cut ticks, higher lanes stack upward). Rotated
 * labels reserve their narrow painted width, horizontal labels reserve their
 * full text width.
 * Returns {site, naturalX, lane, key} per site (input order preserved).
 */
function computeLabelLanes(lineSites, charPx, labelChars, isVertical, widthPx) {
  const items = lineSites.map((item) => {
    const naturalX = (labelChars + item.renderCi + 0.5) * charPx;
    const textExtent = item.site.enzyme.length * LABEL_CHAR_W;
    const longPad = isVertical ? 2 : LABEL_HIT_INLINE_PAD;
    const longHit = Math.max(LABEL_HIT_MIN_LONG, textExtent + longPad * 2);
    const slotX = isVertical
      ? naturalX
      : Math.min(
        widthPx - LABEL_EDGE_PAD - longHit / 2,
        Math.max(LABEL_EDGE_PAD + longHit / 2, naturalX),
      );
    const packWidth = (isVertical ? LABEL_HIT_CROSS : longHit) + LABEL_COLLISION_GAP;
    return {
      site: item.site,
      naturalX,
      slotX,
      offset: slotX - naturalX,
      textExtent,
      longHit,
      packWidth,
      key: siteKey(item.site),
    };
  });
  const lanes = lanePack(items.map((it) => ({
    start: it.slotX - it.packWidth / 2,
    end: it.slotX + it.packWidth / 2,
  })));
  return items.map((it, i) => ({ ...it, lane: lanes[i] }));
}

/**
 * One physical cut coordinate gets one click target. Neighbouring coordinates
 * share their midpoint boundary, so even cuts closer than the usual 10px hit
 * width remain unambiguous. Individual enzyme labels stay independently
 * clickable when several enzymes cut at the same coordinate.
 */
function computeCutHitTargets(slots, widthPx) {
  const uniqueCuts = [];
  slots.forEach((slot, slotIndex) => {
    const previous = uniqueCuts.at(-1);
    if (!previous || Math.abs(previous.x - slot.naturalX) > 0.001) {
      uniqueCuts.push({ x: slot.naturalX, slotIndex });
    }
  });

  return new Map(uniqueCuts.map((cut, index) => {
    const previousX = uniqueCuts[index - 1]?.x;
    const nextX = uniqueCuts[index + 1]?.x;
    const left = Math.max(
      0,
      cut.x - CUT_HIT_HALF_WIDTH,
      previousX == null ? -Infinity : (previousX + cut.x) / 2,
    );
    const right = Math.min(
      widthPx,
      cut.x + CUT_HIT_HALF_WIDTH,
      nextX == null ? Infinity : (cut.x + nextX) / 2,
    );
    return [cut.slotIndex, { x: left, width: Math.max(1, right - left) }];
  }));
}

/**
 * @param {object} props
 * @param {Array<{ enzyme: string, position: number }>} props.sites
 * @param {number} props.lineStart
 * @param {number} props.lineLen
 * @param {number} props.charPx
 * @param {number} props.labelChars
 * @param {'vertical'|'horizontal'} props.reOrientation
 * @param {(site: object) => void} [props.onSiteClick]
 * @param {string} [props.highlightedKey] — click highlight (yellow band + wedges)
 * @param {string} [props.hoveredKey] — hover highlight (from parent)
 * @param {(key: string|null) => void} [props.onHoverChange]
 */
function RestrictionTrack({
  sites,
  lineStart,
  lineLen,
  charPx,
  labelChars,
  reOrientation,
  onSiteClick,
  highlightedKey,
  hoveredKey,
  onHoverChange,
  // V102 §5.3 — wrap-bridge awareness. Defaults keep non-bridge rows
  // exactly as before; on a bridge row sites at the start of the plasmid
  // (wrap-half) render in columns [wrapAt, lineLen).
  wrapsOrigin,
  wrapAt,
  seqLength,
}) {
  const [hoverAnchor, setHoverAnchor] = useState(null); // { key, x, y } viewport
  // V97 — one ref per track instance dedupes the mousedown→click pair.
  // A single gesture's mousedown + click always land on the SAME <g>,
  // so a shared flag across all sites in this instance is sufficient.
  const mouseHandledRef = useRef(false);

  if (!Array.isArray(sites) || sites.length === 0 || !lineLen || charPx <= 0) {
    return null;
  }

  const lineEnd = lineStart + lineLen;
  // V102 §5.3 — on a wrap-bridge row, sites come from two plasmid ranges
  // rendered in one row: real end [lineStart, seqLength) in columns
  // [0, wrapAt); plasmid start [0, wrapWidthChars) in columns
  // [wrapAt, lineLen). Each {site, renderCi} pair carries the render
  // column; the original site object is never mutated (onSiteClick clean).
  const hasWrap = wrapsOrigin === true
    && Number.isFinite(wrapAt) && wrapAt > 0
    && Number.isFinite(seqLength) && seqLength > 0
    && wrapAt < lineLen;
  const wrapWidthChars = hasWrap ? lineLen - wrapAt : 0;
  const realEnd = hasWrap ? Math.min(lineEnd, seqLength) : lineEnd;
  // Each entry is a {site, renderCi} pair — `site` is the caller's
  // ORIGINAL object (never spread/mutated, so onSiteClick stays clean),
  // `renderCi` is the slot's render column. Sorted by renderCi so the
  // label-slot cascade flows left→right across both segments.
  let lineSites;
  if (hasWrap) {
    const real = sites
      .filter((s) => s.position >= lineStart && s.position < realEnd)
      .map((s) => ({ site: s, renderCi: s.position - lineStart }));
    const wrap = sites
      .filter((s) => s.position >= 0 && s.position < wrapWidthChars)
      .map((s) => ({ site: s, renderCi: wrapAt + s.position }));
    lineSites = real.concat(wrap).sort(compareLineSites);
  } else {
    lineSites = sites
      .filter((s) => s.position >= lineStart && s.position < lineEnd)
      .map((s) => ({ site: s, renderCi: s.position - lineStart }))
      .sort(compareLineSites);
  }
  if (lineSites.length === 0) return null;

  const isVertical = reOrientation === "vertical";
  const baseWidthPx = (labelChars + lineLen) * charPx + 60;
  const longestHorizontalHit = isVertical
    ? 0
    : Math.max(...lineSites.map(({ site }) => (
      Math.max(LABEL_HIT_MIN_LONG, site.enzyme.length * LABEL_CHAR_W + LABEL_HIT_INLINE_PAD * 2)
    )));
  const widthPx = Math.max(baseWidthPx, longestHorizontalHit + LABEL_EDGE_PAD * 2);
  const clickable = typeof onSiteClick === 'function';

  // Both orientations stay anchored to the biological cut coordinate and use
  // vertical lanes for collisions. This prevents a dense vertical-label series
  // from cascading hundreds of pixels to the right of its line.
  const laneSlots = computeLabelLanes(lineSites, charPx, labelChars, isVertical, widthPx);
  const nLanes = laneCount(laneSlots.map((s) => s.lane));
  const slots = laneSlots;
  const verticalLaneHeights = isVertical
    ? Array.from({ length: nLanes }, (_, lane) => Math.max(
      VERTICAL_LABEL_HEIGHT,
      ...slots
        .filter((slot) => slot.lane === lane)
        .map((slot) => slot.longHit + VERTICAL_LANE_GAP),
    ))
    : [];
  const verticalLaneOffsets = [];
  verticalLaneHeights.reduce((offset, height, lane) => {
    verticalLaneOffsets[lane] = offset;
    return offset + height;
  }, 0);
  // Lane block sits ABOVE the cut ticks; the SVG grows with the lane count so a
  // dense cluster never clips (no fixed 2-row height).
  const labelsBlockH = isVertical
    ? verticalLaneHeights.reduce((sum, height) => sum + height, 0)
    : nLanes * LANE_STEP;
  const cutBaseY = isVertical ? labelsBlockH : labelsBlockH + 2;
  const totalHeight = isVertical
    ? labelsBlockH + ROW_HEIGHT_RE
    : labelsBlockH + CUT_BAR_HEIGHT + 6;
  const cutHitTargets = computeCutHitTargets(slots, widthPx);

  const renderSlots = slots.map((slot, slotIndex) => {
    const labelY = isVertical
      ? labelsBlockH - verticalLaneOffsets[slot.lane] - 2
      : (nLanes - 1 - slot.lane) * LANE_STEP + (LANE_STEP - 3);
    const cutY = cutBaseY;
    const isHi = highlightedKey === slot.key;
    const isHover = hoveredKey === slot.key;
    const emph = isHover || isHi;
    const pivotX = isVertical ? slot.slotX + LABEL_CENTER_OFFSET : slot.slotX;
    const leaderStartX = pivotX;
    const leaderStartY = labelY + (isVertical ? 1 : 2);
    const hasLeader = isVertical
      ? slot.lane > 0
      : slot.lane > 0 || Math.abs(slot.offset) > 0.001;
    const branchDirection = slot.lane % 2 === 0 ? 1 : -1;
    const branchDistance = LEADER_BRANCH_OFFSET
      + Math.floor(Math.max(0, slot.lane - 1) / 2) * LEADER_BRANCH_STEP;
    const branchX = slot.lane > 0
      ? (isVertical ? slot.naturalX : slot.slotX) + branchDirection * branchDistance
      : slot.slotX;
    const leaderHitEndY = Math.max(leaderStartY, cutY - CUT_HIT_ABOVE);
    const leaderHasInteractiveBranch = hasLeader && leaderHitEndY > leaderStartY;
    const leaderPath = leaderHasInteractiveBranch
      ? `M ${leaderStartX} ${leaderStartY} L ${branchX} ${leaderStartY} L ${branchX} ${leaderHitEndY} L ${slot.naturalX} ${cutY}`
      : `M ${leaderStartX} ${leaderStartY} L ${slot.naturalX} ${cutY}`;

    return {
      ...slot,
      labelY,
      cutY,
      isHi,
      isHover,
      emph,
      pivotX,
      hasLeader,
      leaderPath,
      leaderHitPath: leaderHasInteractiveBranch
        ? `M ${leaderStartX} ${leaderStartY} L ${branchX} ${leaderStartY} L ${branchX} ${leaderHitEndY}`
        : null,
      cutHit: cutHitTargets.get(slotIndex),
    };
  });
  const leaderSlots = [
    ...renderSlots.filter((slot) => slot.hasLeader && !slot.emph),
    ...renderSlots.filter((slot) => slot.hasLeader && slot.emph),
  ];
  const leaderHitSlots = leaderSlots.filter((slot) => slot.leaderHitPath);
  const cutHitSlots = renderSlots.filter((slot) => slot.cutHit);

  // Tooltip anchored to the hovered site's cut tick.
  const tooltipSlot = hoverAnchor
    ? slots.find((sl) => sl.key === hoverAnchor.key)
    : null;
  const tooltipSite = tooltipSlot?.site || null;
  const tooltipCount = tooltipSite
    ? sites.reduce((n, s) => n + (s.enzyme === tooltipSite.enzyme ? 1 : 0), 0)
    : 0;

  const interactionPropsFor = ({ site, key }) => ({
    onMouseDown: clickable ? (event) => {
      if (event.button !== 0) return;
      mouseHandledRef.current = true;
      event.stopPropagation();
      event.preventDefault();
      onSiteClick(site, event);
    } : undefined,
    onPointerDown: clickable ? (event) => {
      event.stopPropagation();
    } : undefined,
    onClick: clickable ? (event) => {
      event.stopPropagation();
      if (mouseHandledRef.current) {
        mouseHandledRef.current = false;
        return;
      }
      onSiteClick(site, event);
    } : undefined,
    onMouseEnter: (event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      setHoverAnchor({ key, x: rect.left + rect.width / 2, y: rect.top });
      if (typeof onHoverChange === 'function') onHoverChange(key);
    },
    onMouseLeave: () => {
      setHoverAnchor((hover) => (hover && hover.key === key ? null : hover));
      if (typeof onHoverChange === 'function') onHoverChange(null);
    },
    style: { cursor: clickable ? 'pointer' : 'default' },
  });

  return (
    <>
      <svg
        data-testid="sequence-view-restriction"
        data-line-start={lineStart}
        data-orientation={isVertical ? "vertical" : "horizontal"}
        data-site-count={lineSites.length}
        width={widthPx}
        height={totalHeight}
        style={{ display: "block", overflow: "visible", userSelect: "none", WebkitUserSelect: "none" }}
      >
        {/* Paint every leader first. Later site groups can never draw a line
            across an earlier label, and the emphasized leader is last inside
            this background layer so hover remains visible. */}
        <g data-testid="sequence-view-re-leaders" pointerEvents="none">
          {leaderSlots.map((slot) => (
            <path
              key={`leader-${slot.key}-${slot.lane}-${slot.naturalX}`}
              data-testid="sequence-view-re-leader"
              data-enzyme={slot.site.enzyme}
              d={slot.leaderPath}
              fill="none"
              stroke={slot.emph ? '#d97706' : (isVertical ? '#9ca3af' : '#cbd5e1')}
              strokeWidth={slot.emph ? (isVertical ? 1.4 : 1.3) : (isVertical ? 0.9 : 0.8)}
              strokeDasharray={slot.emph ? 'none' : '2 2'}
            />
          ))}
        </g>

        {/* Invisible wide corridors preserve click/hover on the thin leaders.
            They sit behind all labels and cut targets, so a crossing leader
            cannot steal another site's readable target. */}
        <g data-testid="sequence-view-re-leader-hits">
          {leaderHitSlots.map((slot) => (
            <path
              key={`leader-hit-${slot.key}-${slot.lane}-${slot.naturalX}`}
              data-testid="sequence-view-re-leader-hit"
              data-enzyme={slot.site.enzyme}
              d={slot.leaderHitPath}
              fill="none"
              stroke="transparent"
              strokeWidth={LEADER_HIT_WIDTH}
              pointerEvents="stroke"
              {...interactionPropsFor(slot)}
            />
          ))}
        </g>

        {/* The shared approach to one physical cut belongs to one target. Cuts
            closer than 10px split their width at the midpoint. This layer is
            still behind labels, so the readable name always wins a crossing. */}
        <g data-testid="sequence-view-re-cut-hits">
          {cutHitSlots.map((slot) => (
            <rect
              key={`cut-hit-${slot.key}-${slot.naturalX}`}
              data-testid="sequence-view-re-cut-hit"
              data-enzyme={slot.site.enzyme}
              x={slot.cutHit.x}
              y={slot.cutY - CUT_HIT_ABOVE}
              width={slot.cutHit.width}
              height={CUT_HIT_ABOVE + CUT_BAR_HEIGHT + 4}
              fill="transparent"
              pointerEvents="all"
              {...interactionPropsFor(slot)}
            />
          ))}
        </g>

        {renderSlots.map((slot) => {
          const {
            site: s,
            naturalX,
            slotX,
            offset,
            lane,
            key,
            longHit,
            labelY,
            cutY,
            isHi,
            isHover,
            emph,
            pivotX,
          } = slot;

          return (
            <g
              key={key}
              data-testid="sequence-view-re-site"
              data-enzyme={s.enzyme}
              data-position={s.position}
              data-lane={lane}
              data-highlighted={isHi ? 'true' : 'false'}
              data-hovered={isHover ? 'true' : 'false'}
              data-cluster-offset={Math.abs(offset) > 0.001 ? 'true' : 'false'}
              {...interactionPropsFor(slot)}
            >
              {/* Label — rotated labels remain on their biological cut; a
                  horizontal edge label may shift only enough to stay visible,
                  with its leader retaining the exact coordinate. */}
              <text
                x={pivotX}
                y={labelY}
                fontSize={LABEL_FONT}
                fill={emph ? '#d97706' : colorForEnzyme(s.enzyme)}
                fontWeight={emph ? 600 : 500}
                textAnchor={isVertical ? "start" : "middle"}
                transform={isVertical ? `rotate(-90 ${pivotX} ${labelY})` : undefined}
                style={{ fontFamily: "inherit", userSelect: "none", pointerEvents: 'none' }}
              >
                {s.enzyme}
              </text>

              {/* Cut tick — short vertical at the exact cut coordinate. */}
              <line
                data-testid="sequence-view-re-cut-tick"
                x1={naturalX}
                x2={naturalX}
                y1={cutY}
                y2={cutY + CUT_BAR_HEIGHT}
                stroke={isHover ? '#d97706' : colorForEnzyme(s.enzyme)}
                strokeWidth={isHover ? 1.5 : 1}
                pointerEvents="none"
              />

              <rect
                data-testid="sequence-view-re-label-hit"
                x={isVertical ? slotX - LABEL_HIT_CROSS / 2 : slotX - longHit / 2}
                y={isVertical ? labelY - longHit + 2 : labelY - LABEL_HIT_CROSS + 4}
                width={isVertical ? LABEL_HIT_CROSS : longHit}
                height={isVertical ? longHit : LABEL_HIT_CROSS}
                fill="transparent"
                pointerEvents="all"
              />

            </g>
          );
        })}
      </svg>
      {tooltipSite && hoverAnchor && (
        <HoverTooltip
          site={tooltipSite}
          count={tooltipCount}
          anchorX={hoverAnchor.x}
          anchorY={hoverAnchor.y}
        />
      )}
    </>
  );
}

export default memo(RestrictionTrack);
