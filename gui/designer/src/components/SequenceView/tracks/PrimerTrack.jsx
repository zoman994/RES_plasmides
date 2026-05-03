/**
 * PrimerTrack — primer binding overlay (Sprint M-B.3, K5).
 *
 * Search forward primers on top strand (indexOf bind), reverse primers
 * by reverse-complementing the binding sequence and indexOf'ing on top
 * strand. Deduplicate by (name, start) so a primer cannot get drawn
 * twice on the same line.
 *
 * Two visual styles, picked by uiSlice.sequenceView.primerStyle:
 *   - 'filled'  (default): forward = solid blue rect, reverse = solid red.
 *   - 'outline':           outline-only rect, label includes the binding
 *     sequence text.
 *
 * Display-only — no click handlers in M-B.3.
 *
 * If `primers === []` or no hits land on this line, the component
 * returns null (track collapses).
 */

import { memo } from "react";
import { reverseComplement } from "../../../sequence-utils.js";

const ROW_HEIGHT_PRIMER = 12;
const FORWARD_COLOR = "#3b82f6";
const REVERSE_COLOR = "#dc2626";

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
 */
function PrimerTrack({
  primers,
  fullSeq,
  lineStart,
  lineLen,
  charPx,
  labelChars,
  primerStyle,
}) {
  if (!primers || primers.length === 0 || !lineLen || charPx <= 0) return null;

  const allHits = findHits(primers, fullSeq);
  const lineEnd = lineStart + lineLen;
  const lineHits = allHits.filter((h) => intersects(h, lineStart, lineEnd));
  if (lineHits.length === 0) return null;

  const filled = primerStyle !== "outline";
  const widthPx = (labelChars + lineLen) * charPx;

  return (
    <svg
      data-testid="sequence-view-primers"
      data-line-start={lineStart}
      data-primer-style={filled ? "filled" : "outline"}
      data-hit-count={lineHits.length}
      width={widthPx}
      height={lineHits.length * (ROW_HEIGHT_PRIMER + 2)}
      // Decorative — primer arrows + names never user-selectable.
      style={{ display: "block", overflow: "visible", userSelect: "none", WebkitUserSelect: "none" }}
    >
      {lineHits.map((hit, idx) => {
        const isFwd = hit.direction === "forward";
        const visStart = Math.max(hit.start, lineStart);
        const visEnd = Math.min(hit.end, lineEnd);
        const xLeft = (labelChars + (visStart - lineStart)) * charPx;
        const widthRect = (visEnd - visStart) * charPx;
        const yTop = idx * (ROW_HEIGHT_PRIMER + 2);
        const stroke = isFwd ? FORWARD_COLOR : REVERSE_COLOR;
        const fill = filled ? stroke : "none";
        const labelText = filled
          ? `${hit.name || ""} ${hit.tmBinding ? hit.tmBinding + "°" : ""}`.trim()
          : `${hit.name || ""} (${(hit.bindingSequence || hit.sequence || "").toUpperCase()})`;

        return (
          <g
            key={`${hit.name || idx}-${hit.start}`}
            data-testid="sequence-view-primer"
            data-primer-name={hit.name || ""}
            data-primer-direction={hit.direction || ""}
            data-primer-line-start={lineStart}
            transform={`translate(${xLeft}, ${yTop})`}
          >
            <rect
              x={0}
              y={2}
              width={widthRect}
              height={ROW_HEIGHT_PRIMER - 4}
              rx={2}
              fill={fill}
              stroke={stroke}
              strokeWidth={filled ? 0 : 1}
              opacity={filled ? 0.85 : 1}
            />
            {/* direction tip */}
            <path
              d={
                isFwd
                  ? `M${widthRect},${ROW_HEIGHT_PRIMER / 2} L${widthRect - 4},${
                      ROW_HEIGHT_PRIMER / 2 - 3
                    } L${widthRect - 4},${ROW_HEIGHT_PRIMER / 2 + 3} Z`
                  : `M0,${ROW_HEIGHT_PRIMER / 2} L4,${ROW_HEIGHT_PRIMER / 2 - 3} L4,${
                      ROW_HEIGHT_PRIMER / 2 + 3
                    } Z`
              }
              fill={stroke}
            />
            <text
              x={widthRect + 4}
              y={ROW_HEIGHT_PRIMER - 3}
              fontSize={8}
              fill={stroke}
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
