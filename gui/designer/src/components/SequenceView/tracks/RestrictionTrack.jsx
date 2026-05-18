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

import { memo, useState } from "react";
import { createPortal } from "react-dom";
import { RE_ENZYMES } from "../../../restriction-db";

const ROW_HEIGHT_RE = 18;
const CUT_BAR_HEIGHT = 6;
const VERTICAL_LABEL_HEIGHT = 36;
// Minimum horizontal pixels between consecutive label slots.
// Vertical labels are rotated 90° — каждый занимает ~9 px горизонтально;
// 14 px дает читаемый зазор ≥5 px. Horizontal labels — текст «EcoRI»
// шириной ~25 px → нужен min-gap ≥28 чтобы не сливались.
const VERTICAL_LABEL_MIN_GAP = 14;
const HORIZONTAL_LABEL_MIN_GAP = 28;
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
 * computeLabelSlots — place labels left-to-right honouring minGap.
 * Each slot returns {site, naturalX (cut tick), slotX (label x),
 * offset (slotX − naturalX, may be 0), key}.
 *
 * Cascade-shifting: if previous slot + minGap > current natural,
 * current shifts right. Subsequent labels chain from the shifted
 * slot, so a dense cluster of N sites can push the Nth label far
 * right of its actual cut position (leader-line shows the link).
 */
function computeLabelSlots(lineSites, lineStart, charPx, labelChars, minGap) {
  const out = [];
  let prevSlot = -Infinity;
  for (const s of lineSites) {
    const ci = s.position - lineStart;
    const naturalX = (labelChars + ci + 0.5) * charPx;
    let slotX = naturalX;
    if (naturalX < prevSlot + minGap) {
      slotX = prevSlot + minGap;
    }
    prevSlot = slotX;
    out.push({
      site: s,
      naturalX,
      slotX,
      offset: slotX - naturalX,
      key: siteKey(s),
    });
  }
  return out;
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
}) {
  const [hoverAnchor, setHoverAnchor] = useState(null); // { key, x, y } viewport

  if (!Array.isArray(sites) || sites.length === 0 || !lineLen || charPx <= 0) {
    return null;
  }

  const lineEnd = lineStart + lineLen;
  const lineSites = sites
    .filter((s) => s.position >= lineStart && s.position < lineEnd)
    .sort((a, b) => a.position - b.position);
  if (lineSites.length === 0) return null;

  const isVertical = reOrientation !== "horizontal";
  const widthPx = (labelChars + lineLen) * charPx + 60; // +60 для leader bend
  const totalHeight = isVertical ? VERTICAL_LABEL_HEIGHT + ROW_HEIGHT_RE : ROW_HEIGHT_RE * 2;
  const clickable = typeof onSiteClick === 'function';

  const minGap = isVertical ? VERTICAL_LABEL_MIN_GAP : HORIZONTAL_LABEL_MIN_GAP;
  const slots = computeLabelSlots(lineSites, lineStart, charPx, labelChars, minGap);

  // Tooltip anchored to the hovered site's cut tick.
  const tooltipSlot = hoverAnchor
    ? slots.find((sl) => sl.key === hoverAnchor.key)
    : null;
  const tooltipSite = tooltipSlot?.site || null;
  const tooltipCount = tooltipSite
    ? sites.reduce((n, s) => n + (s.enzyme === tooltipSite.enzyme ? 1 : 0), 0)
    : 0;

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
        {slots.map((sl) => {
          const { site: s, naturalX, slotX, offset, key } = sl;
          const labelY = isVertical ? VERTICAL_LABEL_HEIGHT - 2 : ROW_HEIGHT_RE - 4;
          const cutY = isVertical ? VERTICAL_LABEL_HEIGHT : ROW_HEIGHT_RE;
          const isHi = highlightedKey === key;
          const isHover = hoveredKey === key;
          const pivotX = isVertical ? slotX + LABEL_CENTER_OFFSET : slotX;

          return (
            <g
              key={key}
              data-testid="sequence-view-re-site"
              data-enzyme={s.enzyme}
              data-position={s.position}
              data-highlighted={isHi ? 'true' : 'false'}
              data-hovered={isHover ? 'true' : 'false'}
              data-cluster-offset={offset > 0 ? 'true' : 'false'}
              // 13.05.2026 r2 — root's onRootPointerDown calls
                // e.preventDefault() для caret placement which kills
                // the synthesized click. stopPropagation alone не помогает
                // в production browser (вероятно SVG g не получает
                // click event reliably когда родительский handler уже
                // обработал pointerdown). Решение: фиксируем выделение
                // НА mousedown — собственный handler, который сразу
                // вызывает onSiteClick + preventDefault, чтобы parent
                // pointerdown не сработал.
              onMouseDown={clickable ? (e) => {
                if (e.button !== 0) return; // primary button only
                e.stopPropagation();
                e.preventDefault();
                onSiteClick(s, e);
              } : undefined}
              onPointerDown={clickable ? (e) => {
                e.stopPropagation();
              } : undefined}
              // Тест-окружение использует fireEvent.click, который не
              // эмитит mousedown — оставляем onClick fallback. В реальном
              // браузере click не выстрелит (preventDefault на mousedown
              // отменяет его), так что onSiteClick вызовется только
              // из mousedown.
              onClick={clickable ? (e) => {
                e.stopPropagation();
                onSiteClick(s, e);
              } : undefined}
              onMouseEnter={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setHoverAnchor({ key, x: r.left + r.width / 2, y: r.top });
                if (typeof onHoverChange === 'function') onHoverChange(key);
              }}
              onMouseLeave={() => {
                setHoverAnchor((h) => (h && h.key === key ? null : h));
                if (typeof onHoverChange === 'function') onHoverChange(null);
              }}
              style={{ cursor: clickable ? 'pointer' : 'default' }}
            >
              {/* Click highlight — subtle, не «вырвиглазное» (13.05.2026
                  итерация UX): тонкая обводка вокруг столбца cut tick,
                  лёгкая yellow заливка, маленькие маркеры без outline. */}
              {clickable && isHi && (
                <g data-testid="sequence-view-re-highlight">
                  <rect
                    x={naturalX - (charPx * 0.9 + 0.5)}
                    y={labelY - 12}
                    width={charPx * 1.8 + 1}
                    height={totalHeight - (labelY - 12) + 3}
                    fill="#fef3c7"
                    fillOpacity={0.35}
                    stroke="#d97706"
                    strokeWidth={1.2}
                    strokeOpacity={0.8}
                    rx={2}
                    ry={2}
                  />
                  <polygon
                    points={`${naturalX - 4},${labelY - 12} ${naturalX + 4},${labelY - 12} ${naturalX},${labelY - 5}`}
                    fill="#d97706"
                    fillOpacity={0.85}
                  />
                  <polygon
                    points={`${naturalX - 4},${totalHeight + 3} ${naturalX + 4},${totalHeight + 3} ${naturalX},${totalHeight - 4}`}
                    fill="#d97706"
                    fillOpacity={0.85}
                  />
                </g>
              )}

              {/* Leader line when label slot has been pushed off cut
                  position. L-shape: cut tick → up to label-base level →
                  over to slot. Same path формула для vertical и
                  horizontal — отличается только labelY и pivotX. */}
              {offset > 0 && (
                <path
                  data-testid="sequence-view-re-leader"
                  d={`M ${naturalX} ${cutY} L ${naturalX} ${labelY + 1} L ${pivotX} ${labelY + 1}`}
                  fill="none"
                  stroke={isHover ? '#d97706' : '#9ca3af'}
                  strokeWidth={isHover ? 1.4 : 0.9}
                  strokeDasharray={isHover ? 'none' : '2 2'}
                />
              )}

              {/* Label — pivoted at (pivotX, labelY) so rotated text sits
                  visually centered on the cut tick (or on the slot offset
                  for clustered sites). B9: color-coded by enzyme name. */}
              <text
                x={pivotX}
                y={labelY}
                fontSize={LABEL_FONT}
                fill={isHover ? '#d97706' : colorForEnzyme(s.enzyme)}
                fontWeight={isHover ? 600 : 500}
                textAnchor={isVertical ? "start" : "middle"}
                transform={isVertical ? `rotate(-90 ${pivotX} ${labelY})` : undefined}
                style={{ fontFamily: "inherit", userSelect: "none", pointerEvents: 'all' }}
              >
                {s.enzyme}
              </text>

              {/* Cut tick — short vertical at the REAL cut position. B9: enzyme color. */}
              <line
                x1={naturalX}
                x2={naturalX}
                y1={cutY}
                y2={cutY + CUT_BAR_HEIGHT}
                stroke={isHover ? '#d97706' : colorForEnzyme(s.enzyme)}
                strokeWidth={isHover ? 1.5 : 1}
              />

              {/* Hit target #1 — LABEL zone. Vertical labels занимают
                  ~10px горизонтально × ~32px вертикально от pivotX up;
                  horizontal labels — full text width × ~14px tall. */}
              <rect
                x={isVertical ? pivotX - 6 : pivotX - (s.enzyme.length * 3 + 6)}
                y={isVertical ? labelY - 32 : labelY - 12}
                width={isVertical ? 12 : (s.enzyme.length * 6 + 12)}
                height={isVertical ? 36 : 16}
                fill="transparent"
                pointerEvents="all"
              />

              {/* Hit target #2 — CUT TICK zone (small column at the
                  real cut position). */}
              <rect
                x={naturalX - 5}
                y={cutY - 2}
                width={10}
                height={CUT_BAR_HEIGHT + 6}
                fill="transparent"
                pointerEvents="all"
              />

              {/* Hit target #3 — LEADER zone (когда label сдвинут
                  относительно cut). Тонкий L-образный bbox чтобы клик
                  по выноске тоже работал. */}
              {offset > 0 && (
                <rect
                  x={Math.min(naturalX, pivotX) - 2}
                  y={isVertical ? labelY - 2 : labelY}
                  width={Math.abs(pivotX - naturalX) + 4}
                  height={isVertical ? cutY - labelY + 4 : cutY - labelY + 2}
                  fill="transparent"
                  pointerEvents="all"
                />
              )}
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
