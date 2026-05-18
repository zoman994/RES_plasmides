/**
 * PrimerTrack — primer binding overlay (Sprint M-B.3, K5).
 *
 * Search forward primers on top strand (indexOf bind), reverse primers
 * by reverse-complementing the binding sequence and indexOf'ing on top
 * strand. Deduplicate by (name, start) so a primer cannot get drawn
 * twice on the same line.
 *
 * Redesign 18.05.2026 (Игорь): «форвард и реверс по обе стороны от
 * цепи (обратный внизу); сам праймер — стрелка, последовательность
 * вписана». A primer hit is now drawn as a DIRECTED ARROW (pentagon:
 * 5′ flat tail → 3′ pointed head) with its binding bases inscribed
 * INSIDE the arrow body, grid-aligned to the char columns. Forward
 * arrows point right, reverse point left. `directionFilter` lets the
 * caller render only one strand's primers so SequenceLine can place
 * forward ABOVE the DNA and reverse BELOW it. Clickability /
 * selection model unchanged: `onPrimerClick(primerKey, hit)` +
 * `selectedKeys` are consumer-gated (absent ⇒ decorative,
 * pointer-events:none — full back-compat). The 2-primer flank
 * highlight stays owned by SequenceView (segment-zone overlay).
 */

import { memo } from "react";
import { reverseComplement } from "../../../sequence-utils.js";

const ARROW_H = 14; // arrow body height (fits inscribed mono bases)
const HEAD = 6; // arrowhead tip, extends BEYOND the footprint so the
// inscribed sequence stays exactly grid-aligned over its base columns.
const ROW_STRIDE = ARROW_H + 6; // vertical gap between stacked hits
const FORWARD_COLOR = "#3b82f6";
const REVERSE_COLOR = "#dc2626";

/** Stable per-hit key (matches SequenceView's primer-selection model). */
export function primerHitKey(h) {
  return `${h.name || ""}|${h.direction || ""}|${h.start}`;
}

function findHits(primers, fullSeq) {
  if (!Array.isArray(primers) || primers.length === 0 || !fullSeq) return [];
  const seqUpper = fullSeq.toUpperCase();
  const hits = [];
  const seen = new Set();

  for (const p of primers) {
    const bind = (p.bindingSequence || p.sequence || "").toUpperCase();
    if (!bind || bind.length < 10) continue;

    const search = p.direction === "reverse" ? reverseComplement(bind) : bind;
    let idx = seqUpper.indexOf(search);
    while (idx >= 0) {
      const key = `${p.name || ""}_${idx}_${p.direction || ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        hits.push({
          ...p,
          start: idx,
          end: idx + search.length,
        });
      }
      idx = seqUpper.indexOf(search, idx + 1);
    }
  }
  return hits;
}

function intersects(a, b1, b2) {
  return a.start < b2 && a.end > b1;
}

/**
 * @param {object} props
 * @param {Array<{ name?, sequence?, bindingSequence?, direction, tmBinding? }>} props.primers
 * @param {string} props.fullSeq
 * @param {number} props.lineStart
 * @param {number} props.lineLen
 * @param {number} props.charPx
 * @param {number} props.labelChars
 * @param {'filled'|'outline'} props.primerStyle
 * @param {'forward'|'reverse'} [props.directionFilter] render one strand only
 * @param {(key:string, hit:object)=>void} [props.onPrimerClick] consumer-gated
 * @param {(hit:object)=>void} [props.onPrimerDoubleClick] consumer-gated
 * @param {string[]} [props.selectedPrimerKeys]
 */
function PrimerTrack({
  primers,
  fullSeq,
  lineStart,
  lineLen,
  charPx,
  labelChars,
  primerStyle,
  directionFilter,
  onPrimerClick,
  onPrimerDoubleClick,
  selectedPrimerKeys,
}) {
  if (!primers || primers.length === 0 || !lineLen || charPx <= 0) return null;

  const allHits = findHits(primers, fullSeq);
  const lineEnd = lineStart + lineLen;
  let lineHits = allHits.filter((h) => intersects(h, lineStart, lineEnd));
  if (directionFilter === "forward" || directionFilter === "reverse") {
    lineHits = lineHits.filter((h) => (h.direction === "reverse" ? "reverse" : "forward") === directionFilter);
  }
  if (lineHits.length === 0) return null;

  const filled = primerStyle !== "outline";
  const widthPx = (labelChars + lineLen) * charPx;
  const hasClick = typeof onPrimerClick === "function";
  const hasDbl = typeof onPrimerDoubleClick === "function";
  const clickable = hasClick || hasDbl;
  const selSet = new Set(selectedPrimerKeys || []);
  // Per-base letters only when there's room (avoid clutter at tiny zoom).
  const showLetters = charPx >= 5;
  const upper = (fullSeq || "").toUpperCase();
  const baseFont = Math.min(11, Math.max(7, charPx * 0.82));

  return (
    <svg
      data-testid="sequence-view-primers"
      data-line-start={lineStart}
      data-primer-style={filled ? "filled" : "outline"}
      data-primer-direction-filter={directionFilter || "all"}
      data-hit-count={lineHits.length}
      width={widthPx}
      height={lineHits.length * ROW_STRIDE}
      style={{
        display: "block",
        overflow: "visible",
        userSelect: "none",
        WebkitUserSelect: "none",
        // Decorative by default; only the clickable hits opt back in.
        pointerEvents: "none",
      }}
    >
      {lineHits.map((hit, idx) => {
        const isFwd = hit.direction !== "reverse";
        const visStart = Math.max(hit.start, lineStart);
        const visEnd = Math.min(hit.end, lineEnd);
        const xLeft = (labelChars + (visStart - lineStart)) * charPx;
        const W = Math.max(1, (visEnd - visStart) * charPx);
        const yTop = idx * ROW_STRIDE;
        const color = isFwd ? FORWARD_COLOR : REVERSE_COLOR;
        const key = primerHitKey(hit);
        const selected = selSet.has(key);
        // Pentagon arrow: flat 5′ tail, pointed 3′ head. Forward points
        // right (head at W+HEAD); reverse points left (head at -HEAD).
        const arrowPath = isFwd
          ? `M0,0 L${W},0 L${W + HEAD},${ARROW_H / 2} L${W},${ARROW_H} L0,${ARROW_H} Z`
          : `M${W},0 L0,0 L${-HEAD},${ARROW_H / 2} L0,${ARROW_H} L${W},${ARROW_H} Z`;
        const fill = filled ? color : "none";
        const labelText = filled
          ? `${hit.name || ""} ${hit.tmBinding ? hit.tmBinding + "°" : ""}`.trim()
          : `${hit.name || ""} (${(hit.bindingSequence || hit.sequence || "").toUpperCase()})`;
        const bases = showLetters ? upper.slice(visStart, visEnd) : "";

        return (
          <g
            key={`${hit.name || idx}-${hit.start}`}
            data-testid="sequence-view-primer"
            data-primer-name={hit.name || ""}
            data-primer-direction={hit.direction || ""}
            data-primer-line-start={lineStart}
            data-primer-key={key}
            data-selected={selected ? "true" : "false"}
            transform={`translate(${xLeft}, ${yTop})`}
            onClick={hasClick ? (e) => { e.stopPropagation(); onPrimerClick(key, hit); } : undefined}
            onDoubleClick={hasDbl ? (e) => { e.stopPropagation(); onPrimerDoubleClick(hit); } : undefined}
            style={clickable ? { cursor: "pointer", pointerEvents: "auto" } : undefined}
          >
            {/* Invisible full-area hit target (Игорь 18.05.2026 «клики
                на праймерах не работают»): an arrow <path fill="none">
                in OUTLINE style only hit-tests on its hairline stroke,
                and the inscribed bases text shouldn't swallow clicks —
                a transparent rect (fill:transparent IS hit-tested,
                unlike fill:none) makes the whole primer box clickable
                for both single- and double-click, any primerStyle. */}
            {clickable && (
              <rect
                data-primer-hit="true"
                x={-HEAD - 2}
                y={-2}
                width={W + 2 * HEAD + 4}
                height={ARROW_H + 4}
                fill="transparent"
              />
            )}
            {/* Selected: a soft colour halo + a bold ring so a clicked
                primer reads UNMISTAKABLY (Игорь 18.05.2026 — «при
                клике должен явно выделяться»). */}
            {selected && (
              <>
                <rect
                  data-primer-selection-halo="true"
                  x={-HEAD - 4}
                  y={-4}
                  width={W + 2 * HEAD + 8}
                  height={ARROW_H + 8}
                  rx={5}
                  fill={color}
                  opacity={0.18}
                />
                <rect
                  x={-HEAD - 2}
                  y={-2}
                  width={W + 2 * HEAD + 4}
                  height={ARROW_H + 4}
                  rx={4}
                  fill="none"
                  stroke={color}
                  strokeWidth={2.5}
                  opacity={1}
                />
              </>
            )}
            <path
              data-primer-arrow={isFwd ? "forward" : "reverse"}
              d={arrowPath}
              fill={fill}
              stroke={color}
              strokeWidth={filled ? (selected ? 1.5 : 0.5) : (selected ? 2 : 1)}
              opacity={filled ? (selected ? 1 : 0.95) : 1}
            />
            {/* binding bases inscribed INSIDE the arrow, grid-aligned
                to the char columns (Игорь 18.05 — «последовательность
                должна быть вписана»). */}
            {bases && (
              <text
                data-testid="sequence-view-primer-bases"
                x={0}
                y={ARROW_H / 2}
                fontSize={baseFont}
                fontWeight={600}
                fill={filled ? "#fff" : color}
                textAnchor="start"
                dominantBaseline="central"
                style={{
                  fontFamily: "var(--font-mono, ui-monospace, monospace)",
                  letterSpacing: 0,
                }}
                textLength={W}
                lengthAdjust="spacingAndGlyphs"
              >
                {bases}
              </text>
            )}
            <text
              x={isFwd ? W + HEAD + 4 : W + 4}
              y={ARROW_H / 2}
              fontSize={8}
              fill={color}
              dominantBaseline="central"
              style={{ fontFamily: "inherit" }}
            >
              {labelText}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default memo(PrimerTrack);
