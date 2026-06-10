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

import { memo, Fragment } from "react";
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
 * V102 §5.2 — clip a hit to a plasmid range [lo, hi) rendered starting at
 * render column `colBase`, tagging the segment. `_visStart`/`_visEnd` are
 * ABSOLUTE plasmid coords (for `upper.slice`); `_colStart` is the render
 * column. real segment: lo=lineStart, colBase=0 → _colStart = start −
 * lineStart (legacy). wrap segment: lo=0, colBase=wrapAt → _colStart =
 * wrapAt + start (start-of-plasmid shifted past the ▶1 divider).
 */
function clipHit(h, lo, hi, colBase, seg) {
  const visStart = Math.max(h.start, lo);
  const visEnd = Math.min(h.end, hi);
  return {
    ...h, _seg: seg, _visStart: visStart, _visEnd: visEnd, _colStart: colBase + (visStart - lo),
  };
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
  // V102 §5.2 — wrap-bridge awareness. Defaults keep non-bridge rows
  // exactly as before; on a bridge row a primer binding at the start of
  // the plasmid (or crossing the origin) renders in the wrap-half.
  wrapsOrigin,
  wrapAt,
  seqLength,
}) {
  if (!primers || primers.length === 0 || !lineLen || charPx <= 0) return null;

  const allHits = findHits(primers, fullSeq);
  const lineEnd = lineStart + lineLen;
  const seqLen = (fullSeq || "").length;
  const hasWrap = wrapsOrigin === true
    && Number.isFinite(wrapAt) && wrapAt > 0
    && Number.isFinite(seqLength) && seqLength > 0
    && wrapAt < lineLen;
  const wrapWidthChars = hasWrap ? lineLen - wrapAt : 0;
  const realEnd = hasWrap ? Math.min(lineEnd, seqLength) : lineEnd;
  let lineHits;
  if (hasWrap) {
    // Real end [lineStart, seqLength) in columns [0, wrapAt); plasmid
    // start [0, wrapWidthChars) in columns [wrapAt, lineLen). A primer
    // through the origin produces BOTH (two arrows — it «continues» past
    // the ▶1 divider, which is the point of wrap-tail).
    const real = allHits
      .filter((h) => intersects(h, lineStart, realEnd))
      .map((h) => clipHit(h, lineStart, realEnd, 0, "real"));
    const wrap = allHits
      .filter((h) => intersects(h, 0, wrapWidthChars))
      .map((h) => clipHit(h, 0, wrapWidthChars, wrapAt, "wrap"));
    lineHits = real.concat(wrap);
  } else {
    // V-tailwrap (24.05.2026) — a primer's 5′-tail occupies the columns just
    // 5′ of its binding; on a wrapped layout those columns can fall on the
    // ADJACENT line. Include a hit when its binding OR its on-sequence tail
    // span touches this line, so the tail can render on the line that holds
    // it (the binding clip below stays empty for a tail-only row → no arrow).
    lineHits = allHits
      .filter((h) => {
        const tl = typeof h.tail === "string" ? h.tail.length : 0;
        const fwd = h.direction !== "reverse";
        const lo = fwd ? Math.max(0, h.start - tl) : h.start;
        const hi = fwd ? h.end : Math.min(seqLen, h.end + tl);
        return lo < lineEnd && hi > lineStart;
      })
      .map((h) => clipHit(h, lineStart, lineEnd, 0, "real"));
  }
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
        // V102 §5.2 — coords precomputed by clipHit: absolute clip for
        // base letters + render column for the segment (real or wrap).
        const visStart = hit._visStart;
        const visEnd = hit._visEnd;
        // A hit can be on this line for its TAIL alone (V-tailwrap filter) —
        // then the binding clip is empty and we draw NO arrow, only the tail.
        const bindingVisible = visEnd > visStart;
        const xLeft = (labelChars + hit._colStart) * charPx;
        const W = Math.max(1, (visEnd - visStart) * charPx);
        const yTop = idx * ROW_STRIDE;
        const color = isFwd ? FORWARD_COLOR : REVERSE_COLOR;
        const key = primerHitKey(hit);
        const selected = selSet.has(key);
        // Pentagon arrow: flat 5′ tail, pointed 3′ head. The head marks the
        // 3′-END — forward: hit.end; reverse: hit.start. When a binding is
        // split across a line-wrap (clipHit → two lineHits fragments), only
        // the fragment that actually CONTAINS the 3′-end gets the point; the
        // fragment at the wrap edge gets a blunt край, so the wrapped primer
        // reads as ONE continuous figure, not two arrows (Игорь 24.05.2026).
        // Unbroken binding → _visEnd===end && _visStart===start → head as
        // before. Absolute _visEnd/_visStart vs end/start is correct on
        // wrap-bridge (circular) rows too — no special case needed.
        const headHere = isFwd ? hit._visEnd === hit.end : hit._visStart === hit.start;
        // The HEAD overhang (hit-target / selection-halo) belongs only to the
        // side that actually has the point — on a blunt wrap-edge fragment it
        // would otherwise stick ~6 px past the край. 5′/tail side and
        // groupTailW are untouched (they're not about the head).
        const headExt = headHere ? HEAD : 0;
        const arrowPath = headHere
          ? (isFwd
            ? `M0,0 L${W},0 L${W + HEAD},${ARROW_H / 2} L${W},${ARROW_H} L0,${ARROW_H} Z`
            : `M${W},0 L0,0 L${-HEAD},${ARROW_H / 2} L0,${ARROW_H} L${W},${ARROW_H} Z`)
          : `M0,0 L${W},0 L${W},${ARROW_H} L0,${ARROW_H} Z`;
        const fill = filled ? color : "none";
        const labelText = filled
          ? `${hit.name || ""} ${hit.tmBinding ? hit.tmBinding + "°" : ""}`.trim()
          : `${hit.name || ""} (${(hit.bindingSequence || hit.sequence || "").toUpperCase()})`;
        const bases = showLetters ? upper.slice(visStart, visEnd) : "";
        // Overlap 5'-overhang. When present, drawn as a semi-transparent
        // segment that occupies the `tail.length` char columns immediately
        // 5′ of the binding (forward: left; reverse: right) so two internal
        // overlap-PCR primers visibly cross the boundary. Empty/absent →
        // nothing extra, identical to the prior render.
        const tail = typeof hit.tail === "string" ? hit.tail : "";
        const tailLen = tail.length;
        const hasTail = tailLen > 0;
        const tailW = tailLen * charPx;
        // V-tailwrap (24.05.2026, Игорь «хвосты праймеров не переносятся на
        // другую строку») — those tail columns can land on a NEIGHBOURING
        // wrapped line. Draw the tail INLINE (glued to the binding arrow, as
        // before) only when it fits wholly on the binding's own line, or
        // sticks past an absolute plasmid end into the margin. Otherwise emit
        // a SEPARATE, per-line-clipped tail segment (`sepTail`) on whichever
        // line actually holds its columns. On a circular wrap-bridge row we
        // keep the original draw-at-the-5′-fragment behaviour untouched.
        let inlineTail;
        let sepTail = null;
        if (hasWrap) {
          inlineTail = hasTail && (isFwd ? hit._visStart === hit.start : hit._visEnd === hit.end);
        } else {
          const fivePrimeOnLine = isFwd
            ? (hit.start >= lineStart && hit.start < lineEnd)
            : (hit.end > lineStart && hit.end <= lineEnd);
          const tailFits = isFwd
            ? ((hit.start - tailLen) >= lineStart || lineStart === 0)
            : ((hit.end + tailLen) <= lineEnd || lineEnd === seqLen);
          inlineTail = hasTail && bindingVisible && fivePrimeOnLine && tailFits;
          if (hasTail && !inlineTail) {
            const tLo = isFwd ? Math.max(0, hit.start - tailLen) : hit.end;
            const tHi = isFwd ? hit.start : Math.min(seqLen, hit.end + tailLen);
            const vLo = Math.max(tLo, lineStart);
            const vHi = Math.min(tHi, lineEnd);
            if (vHi > vLo) {
              // tail char i sits at column (start − tailLen + i) forward /
              // (end + i) reverse → slice the bases visible on THIS line.
              const from = isFwd ? vLo - (hit.start - tailLen) : vLo - hit.end;
              const to = isFwd ? vHi - (hit.start - tailLen) : vHi - hit.end;
              sepTail = {
                x: (labelChars + (vLo - lineStart)) * charPx,
                w: (vHi - vLo) * charPx,
                bases: showLetters ? tail.slice(from, to) : "",
              };
            }
          }
        }
        // Only widen the binding's hit-target / halo by the tail when the
        // tail is actually drawn INSIDE this binding group.
        const groupTailW = inlineTail ? tailW : 0;
        // Name label sits at the far end on the RIGHT. Forward: right of the
        // arrowhead (its tail is on the LEFT, no clash). Reverse: an inline
        // 5'-tail sits on the RIGHT [W, W+tailW] — so the label must clear it.
        const labelX = isFwd
          ? W + HEAD + 4
          : (inlineTail ? W + tailW + 4 : W + 4);

        return (
          <Fragment key={`${hit.name || idx}-${hit.start}-${hit._seg}`}>
            {bindingVisible && (
              <g
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
                    x={isFwd ? -HEAD - 2 - groupTailW : -headExt - 2}
                    y={-2}
                    width={W + HEAD + headExt + 4 + groupTailW}
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
                      x={isFwd ? -HEAD - 4 - groupTailW : -headExt - 4}
                      y={-4}
                      width={W + HEAD + headExt + 8 + groupTailW}
                      height={ARROW_H + 8}
                      rx={5}
                      fill={color}
                      opacity={0.18}
                    />
                    <rect
                      x={isFwd ? -HEAD - 2 - groupTailW : -headExt - 2}
                      y={-2}
                      width={W + HEAD + headExt + 4 + groupTailW}
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
                {/* Inline overlap-tail — not on the template, so styled apart
                    from the solid binding arrow: same colour, low fill-opacity
                    + a thin outline, no arrowhead. Forward: left of binding
                    (5′); reverse: right of binding (5′). */}
                {inlineTail && (
                  <rect
                    data-testid="sequence-view-primer-tail"
                    data-primer-tail-direction={isFwd ? "forward" : "reverse"}
                    x={isFwd ? -tailW : W}
                    y={0}
                    width={tailW}
                    height={ARROW_H}
                    fill={color}
                    fillOpacity={0.35}
                    stroke={color}
                    strokeWidth={0.5}
                  />
                )}
                {inlineTail && showLetters && (
                  <text
                    data-testid="sequence-view-primer-tail-bases"
                    x={isFwd ? -tailW : W}
                    y={ARROW_H / 2}
                    fontSize={baseFont}
                    fontWeight={600}
                    fill={color}
                    textAnchor="start"
                    dominantBaseline="central"
                    style={{
                      fontFamily: "var(--font-mono, ui-monospace, monospace)",
                      letterSpacing: 0,
                    }}
                    textLength={tailW}
                    lengthAdjust="spacingAndGlyphs"
                  >
                    {tail}
                  </text>
                )}
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
                  data-testid="sequence-view-primer-label"
                  x={labelX}
                  y={ARROW_H / 2}
                  fontSize={8}
                  fill={color}
                  dominantBaseline="central"
                  style={{ fontFamily: "inherit" }}
                >
                  {labelText}
                </text>
              </g>
            )}
            {/* Wrapped 5′-tail — the portion of the overhang whose columns
                fall on THIS line while the binding's 5′-end is elsewhere.
                Positioned at its own char columns so it reads continuous with
                the binding across the line break. */}
            {sepTail && (
              <g
                data-testid="sequence-view-primer-tail-wrap"
                data-primer-name={hit.name || ""}
                data-primer-direction={hit.direction || ""}
                data-primer-line-start={lineStart}
                data-primer-key={key}
                transform={`translate(${sepTail.x}, ${yTop})`}
                onClick={hasClick ? (e) => { e.stopPropagation(); onPrimerClick(key, hit); } : undefined}
                onDoubleClick={hasDbl ? (e) => { e.stopPropagation(); onPrimerDoubleClick(hit); } : undefined}
                style={clickable ? { cursor: "pointer", pointerEvents: "auto" } : undefined}
              >
                {selected && (
                  <rect
                    x={-2}
                    y={-2}
                    width={sepTail.w + 4}
                    height={ARROW_H + 4}
                    rx={4}
                    fill="none"
                    stroke={color}
                    strokeWidth={2.5}
                  />
                )}
                <rect
                  data-testid="sequence-view-primer-tail"
                  data-primer-tail-direction={isFwd ? "forward" : "reverse"}
                  x={0}
                  y={0}
                  width={sepTail.w}
                  height={ARROW_H}
                  fill={color}
                  fillOpacity={0.35}
                  stroke={color}
                  strokeWidth={0.5}
                />
                {sepTail.bases && (
                  <text
                    data-testid="sequence-view-primer-tail-bases"
                    x={0}
                    y={ARROW_H / 2}
                    fontSize={baseFont}
                    fontWeight={600}
                    fill={color}
                    textAnchor="start"
                    dominantBaseline="central"
                    style={{
                      fontFamily: "var(--font-mono, ui-monospace, monospace)",
                      letterSpacing: 0,
                    }}
                    textLength={sepTail.w}
                    lengthAdjust="spacingAndGlyphs"
                  >
                    {sepTail.bases}
                  </text>
                )}
              </g>
            )}
          </Fragment>
        );
      })}
    </svg>
  );
}

export default memo(PrimerTrack);
