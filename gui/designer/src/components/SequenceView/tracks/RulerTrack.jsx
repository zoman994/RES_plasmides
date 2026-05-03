/**
 * RulerTrack — position scale above each strand line (Sprint M-B.3, K2;
 * tightened on M-B.3 visual review 02.05.2026: numbers and ticks were
 * sharing the same vertical band and visually merged).
 *
 * Layout (top to bottom inside the SVG):
 *   - row 0..LABEL_BAND_HEIGHT-1 : 8 px-tall position numbers, anchored
 *     at their tick column
 *   - row LABEL_BAND_HEIGHT..end : tick marks + baseline
 *
 * Every 10 bp = labelled major tick. Every 5 bp = unlabelled minor.
 * Line-end position renders to the right of the last column.
 *
 * `charPx` is propagated from the parent (lib/grid.js measurement) so
 * the tick at `ci` lands exactly above the i-th nucleotide span.
 *
 * Display-only — no click handlers in M-B.3.
 */

import { memo } from "react";

const TICK_MAJOR_EVERY = 10;
const TICK_MINOR_EVERY = 5;
const LABEL_BAND_HEIGHT = 12; // top band reserved for position numbers
const TICK_BAND_HEIGHT = 8;   // tick column band below labels
const ROW_HEIGHT = LABEL_BAND_HEIGHT + TICK_BAND_HEIGHT;

/**
 * @param {object} props
 * @param {number} props.lineStart — absolute index of the first nucleotide
 * @param {number} props.lineLen — number of nucleotides on this row
 * @param {number} props.charPx — pixel width of one monospace character
 * @param {number} props.labelChars — gutter width in characters
 */
function RulerTrack({ lineStart, lineLen, charPx, labelChars }) {
  if (!lineLen || charPx <= 0) return null;
  const widthPx = (labelChars + lineLen) * charPx;
  const lineEnd = lineStart + lineLen;
  const tickTop = LABEL_BAND_HEIGHT;
  const tickBottom = ROW_HEIGHT - 1;
  const minorTickTop = LABEL_BAND_HEIGHT + 3;

  const ticks = [];
  for (let ci = 0; ci < lineLen; ci++) {
    const absPos = lineStart + ci + 1; // 1-based for biolog convention
    const isMajor = absPos % TICK_MAJOR_EVERY === 0;
    const isMinor = !isMajor && absPos % TICK_MINOR_EVERY === 0;
    if (!isMajor && !isMinor) continue;
    const x = (labelChars + ci + 0.5) * charPx;
    ticks.push(
      <line
        key={`tick-${ci}`}
        x1={x}
        x2={x}
        y1={isMajor ? tickTop : minorTickTop}
        y2={tickBottom}
        stroke={isMajor ? "var(--text-secondary, #4b5563)" : "var(--text-tertiary, #9ca3af)"}
        strokeWidth={isMajor ? 1 : 0.5}
      />,
    );
    if (isMajor) {
      ticks.push(
        <text
          key={`label-${ci}`}
          x={x}
          y={LABEL_BAND_HEIGHT - 3}
          textAnchor="middle"
          fontSize={9}
          fill="var(--text-secondary, #4b5563)"
          style={{ fontFamily: "inherit", userSelect: "none" }}
        >
          {absPos}
        </text>,
      );
    }
  }

  return (
    <svg
      data-testid="sequence-view-ruler"
      data-line-start={lineStart}
      width={widthPx}
      height={ROW_HEIGHT}
      // Decorative track — never user-selectable. Drag-to-select on
      // strands/AA must skip ruler numbers (visual review 03.05.2026
      // evening: «названия аннотации тоже попадают в выделение»).
      style={{ display: "block", overflow: "visible", userSelect: "none", WebkitUserSelect: "none" }}
    >
      {/* baseline */}
      <line
        x1={labelChars * charPx}
        x2={(labelChars + lineLen) * charPx}
        y1={tickBottom}
        y2={tickBottom}
        stroke="var(--border-subtle, #e5e7eb)"
        strokeWidth={0.5}
      />
      {ticks}
      {/*
        * Line-end position number REMOVED in M-B.3 K8 polish round 3
        * (visual review 02.05.2026 «и все же налезает»). With charsPerLine
        * always snapped to a multiple of 10 by clampCharsPerLine, the line
        * end already coincides with a major tick label — drawing a
        * separate "line-end" text on top duplicated the digits and caused
        * overflow past the SVG width. Major ticks alone read cleanly.
        *
        * Use {lineEnd} as a non-rendered intent reference so editor tools
        * keep the variable highlighted as load-bearing.
        */}
      {void lineEnd}
    </svg>
  );
}

// All four props are primitives — default shallow compare reliably
// skips re-render when no input shifts (parent state churn etc.).
export default memo(RulerTrack);
