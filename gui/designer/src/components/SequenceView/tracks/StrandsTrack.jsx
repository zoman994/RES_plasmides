/**
 * StrandsTrack — top + bottom strand HTML char-grid (Sprint M-B.3, K2).
 *
 * Top strand: 5'→3' as-is.
 * Bottom strand: 3'→5' (complement applied per nucleotide).
 *
 * Region tint: each nt span carries a low-alpha background colour resolved
 * from per-position annotation map. This is a foundation only — the rich
 * multi-row annotation track lands in K3 (AnnotationTrack).
 *
 * Intron lowercasing: nucleotides inside an intron-level annotation render
 * lowercase + diagonal-hatch background. Detection key:
 *   annotation.type === 'intron' OR annotation.level === 'detail' &&
 *   annotation.kind === 'intron'.
 *
 * Settings consumed:
 *   - showBottomStrand (boolean) — when false, only the top row is rendered.
 *
 * Display-only — strand spans are user-selectable text but expose no event
 * handlers in M-B.3 (selection wiring lives in M-D Container Window).
 */

import { memo } from "react";
import { complement } from "../../../sequence-utils.js";

const ROW_HEIGHT_STRAND = 16;
const STRAND_PADDING_X = 0;

/**
 * Background tint for an annotation hit — semi-transparent colored
 * "container" wrapping the DNA letters (biolog feedback 02.05.2026:
 * «возможно стоит аннотации наносить прям на последовательность ДНК в
 * виде полупрозрачных цветных контейнеров»). Previously rendered at
 * `+ "20"` (~12 %) which was barely visible on dark theme.
 */
function tintFor(ann) {
  if (!ann || !ann.color) return "transparent";
  // ann.color is a hex like #56B4E9; append alpha "33" (~20 %) for the
  // top strand tint. Bottom strand applies "1f" (~12 %). Reduced from
  // 55/33 → 33/1f after biolog: «обводку нуклеотидов немного более
  // прозрачную сделать» — высокая alpha делала фон слишком плотным
  // под белыми DNA-буквами на тёмной теме.
  return ann.color + "33";
}

function tintForBottom(ann) {
  if (!ann || !ann.color) return "transparent";
  return ann.color + "1f";
}

function isIntron(ann) {
  if (!ann) return false;
  if (ann.type === "intron") return true;
  if (ann.level === "detail" && ann.kind === "intron") return true;
  return false;
}

/**
 * @param {object} props
 * @param {number} props.lineStart
 * @param {string} props.seq — uppercase nucleotides for THIS line only
 * @param {Array<object|null>} props.annMap — length === seq.length, each
 *   slot is the topmost annotation covering that position (or null)
 * @param {number} props.labelChars — gutter width in characters
 * @param {boolean} props.showBottomStrand — used when `which` is omitted
 * @param {'top'|'bottom'|'both'} [props.which] — when present, render
 *   that strand explicitly (lets the orchestrator interleave AATrack
 *   rows between top and bottom). Falls back to legacy showBottomStrand
 *   behaviour when omitted, preserving K2 test contracts.
 * @param {string} [props.dataTestid='sequence-view-strands'] — root testid
 * @param {number} [props.charPx] — monospace char width (px). Required
 *   for cut-bar + overhang overlay positioning; defaults to 8 (legacy).
 * @param {Array<{key:string, pos:number}>} [props.cutPositions] —
 *   ABSOLUTE positions where to draw a vertical cut bar BETWEEN chars
 *   on THIS strand (pos = char index in fullSeq just AFTER the cut).
 * @param {Array<{key:string, startPos:number, endPos:number}>} [props.overhangs] —
 *   ABSOLUTE ranges to highlight (light yellow band) on this strand —
 *   the single-strand overhang region between two sticky-end cuts.
 * @param {Array<{key:string, startPos:number, endPos:number}>} [props.bindingHighlights] —
 *   ABSOLUTE ranges to highlight (light orange) — the FULL recognition
 *   site of the currently-selected restriction enzyme (binding zone).
 *   12.05.2026 — Игорь: «при нажатии на сайт рестрикции, он должен
 *   подсвечивать область разреза И область связывания ретсриктазы».
 */
function StrandsTrack({
  lineStart,
  seq,
  annMap,
  labelChars,
  showBottomStrand,
  which,
  dataTestid = "sequence-view-strands",
  charPx = 8,
  cutPositions,
  overhangs,
  bindingHighlights,
  // «Align to reference» (opt-in): a per-line NAME shown in the top-strand
  // gutter instead of the line-start number, so each row says which sequence
  // the reference is (Игорь: «подписаны на каждой строке своими названиями»).
  // The ruler still carries absolute positions. Undefined for every other
  // consumer → the line-start number renders exactly as before.
  gutterLabel,
  // Terminal sticky-end staircase (Игорь 22.06 «физическая ступенька»): the
  // fragment's overhang at this line's LEFT / RIGHT end (terminalStagger output:
  // { protruding, recessed, len, seq, type } | null). SequenceLine gates these to
  // the FIRST line (left) and LAST line (right). Bottom-strand only. Null elsewhere.
  terminalLeft = null,
  terminalRight = null,
}) {
  if (!seq) return null;
  const annArr = annMap && annMap.length === seq.length ? annMap : new Array(seq.length).fill(null);

  // DOM reduction (perf 03.05.2026 evening: «хочу плавность» / low-spec
  // target). Old implementation rendered ONE `<span>` per nucleotide —
  // 150 nt × 2 strands × 60 lines ≈ 18,000 spans just for the DNA
  // letters, blowing up style-recalc and paint cost on long plasmids.
  // New implementation groups consecutive nucleotides with identical
  // (annotation tint, intron flag) into a single span carrying the
  // shared background style; typical 8 kb plasmid drops from
  // ~18,000 spans to ~500–2,000 (one run per visible feature edge).
  // Visual output identical because monospace + `whiteSpace: pre`
  // means a 20-char span occupies the same horizontal space as 20
  // 1-char spans.
  function buildRuns(chars, isTop) {
    const runs = [];
    let curRun = null;
    for (let ci = 0; ci < chars.length; ci++) {
      const ann = annArr[ci];
      const intron = isIntron(ann);
      const tint = isTop ? tintFor(ann) : tintForBottom(ann);
      const nt = chars[ci];
      const display = intron ? nt.toLowerCase() : nt;
      // Run key combines tint + intron flag — nucleotides only group
      // when they share BOTH so background-image (intron hatching)
      // doesn't bleed onto plain regions.
      if (curRun && curRun.tint === tint && curRun.intron === intron) {
        curRun.text += display;
        curRun.endCi = ci;
      } else {
        curRun = { startCi: ci, endCi: ci, text: display, tint, intron };
        runs.push(curRun);
      }
    }
    return runs;
  }

  const renderStrand = (which) => {
    const isTop = which === "top";
    const chars = isTop ? seq : seq.split("").map((c) => complement(c)).join("");
    const direction = isTop ? "5'→3'" : "3'→5'";
    const runs = buildRuns(chars, isTop);

    // Restriction cut bars + overhang highlights for THIS strand —
    // 12.05.2026 (Игорь): «места разреза дублировать ВНУТРИ сайта
    // рестрикции на цепях ДНК». Absolute overlays positioned over the
    // strand row at exact gap-between-chars x coordinates.
    const lineEnd = lineStart + seq.length;
    const overhangsThisLine = Array.isArray(overhangs) ? overhangs.filter(
      (o) => o.endPos > lineStart && o.startPos < lineEnd,
    ) : [];
    // Strict `< lineEnd` (matches the overhang/binding filters): a cut landing
    // exactly on a line boundary belongs to the NEXT row (column 0), so it must
    // not double-draw at the right edge of this row (review wq20q3xjv).
    const cutsThisLine = Array.isArray(cutPositions) ? cutPositions.filter(
      (c) => c.pos >= lineStart && c.pos < lineEnd,
    ) : [];
    // Binding-area highlights (the FULL recognition site of the clicked
    // enzyme). Rendered FIRST so it sits behind overhang + chars.
    const bindingsThisLine = Array.isArray(bindingHighlights) ? bindingHighlights.filter(
      (b) => b.endPos > lineStart && b.startPos < lineEnd,
    ) : [];

    return (
      <div
        data-testid={`${dataTestid}-${which}`}
        data-line-start={lineStart}
        data-strand={which}
        // Per-track selection scope. Forward-strand rows across all
        // lines share scope `strand-top`, reverse-strand rows share
        // `strand-bottom`. Drag-to-select can extend vertically across
        // line wraps within the same scope; rows in OTHER scopes
        // (annotations, AA, opposite strand) are temporarily marked
        // user-select:none for the duration of the drag and skipped
        // by Selection.toString(). See lib/row-selection-isolation.js.
        data-row-selection-scope={`strand-${which}`}
        style={{
          height: ROW_HEIGHT_STRAND,
          lineHeight: `${ROW_HEIGHT_STRAND}px`,
          whiteSpace: "pre",
          color: isTop ? "var(--text-primary, #111827)" : "var(--text-secondary, #4b5563)",
          position: 'relative',
        }}
        title={direction}
      >
        {/* Binding-area highlight — full recognition site (e.g., 6 bp for
            EcoRI). Bright orange band + visible outline so the «выделение
            рестриктазы» is unmistakable even with the popover open
            12.05.2026 — Игорь: «выделение не показывается» (visibility
            fix: bumped opacity 0.55 → 0.85, added 2px orange outline,
            taller-than-row box for cross-strand framing). */}
        {bindingsThisLine.map((b) => {
          const lo = Math.max(b.startPos, lineStart);
          const hi = Math.min(b.endPos, lineEnd);
          const left = (labelChars + (lo - lineStart)) * charPx;
          const width = (hi - lo) * charPx;
          // 13.05.2026 — softened to «не вырвиглазное». Light cream fill
          // + 1px subdued orange frame; top/bottom strands still join
          // into a single visual box via shared borders.
          return (
            <div
              key={`re-bind-${b.key}`}
              data-testid="sequence-view-strand-binding"
              data-strand={which}
              aria-hidden
              style={{
                position: 'absolute',
                left,
                top: isTop ? -1 : 0,
                width,
                height: ROW_HEIGHT_STRAND + 1,
                background: '#fff7ed',
                opacity: 0.55,
                border: '1px solid #fb923c',
                borderTop: isTop ? '1px solid #fb923c' : 'none',
                borderBottom: isTop ? 'none' : '1px solid #fb923c',
                boxSizing: 'border-box',
                pointerEvents: 'none',
                zIndex: 0,
              }}
            />
          );
        })}
        {/* Overhang highlight band — yellow region of single-strand DNA. */}
        {overhangsThisLine.map((o) => {
          const lo = Math.max(o.startPos, lineStart);
          const hi = Math.min(o.endPos, lineEnd);
          const left = (labelChars + (lo - lineStart)) * charPx;
          const width = (hi - lo) * charPx;
          return (
            <div
              key={`re-oh-${o.key}`}
              data-testid="sequence-view-strand-overhang"
              data-strand={which}
              aria-hidden
              style={{
                position: 'absolute',
                left,
                top: 0,
                width,
                height: ROW_HEIGHT_STRAND,
                background: '#fef3c7',
                opacity: 0.7,
                pointerEvents: 'none',
                zIndex: 1,
              }}
            />
          );
        })}
        {/* Terminal sticky-end staircase (bottom strand only). protruding=top →
            blank the recessed bottom's `len` edge cells so the top bases stand
            alone (the visible step); protruding=bottom → the overhang bases stick
            out single-stranded past the duplex edge. */}
        {!isTop && [['left', terminalLeft], ['right', terminalRight]].map(([endName, st]) => {
          if (!st || !st.len) return null;
          const atRight = endName === 'right';
          if (st.protruding === 'top') {
            const startCol = atRight ? (seq.length - st.len) : 0;
            if (startCol < 0) return null;
            // Recess the bottom strand: blank the `len` edge cells so the top
            // bases stand alone. A neutral hairline marks the step edge (where the
            // bottom strand resumes) — no red (Игорь 22.06 «убрать красное»).
            const stepSide = atRight ? 'borderLeft' : 'borderRight';
            return (
              <div
                key={`term-rec-${endName}`}
                data-testid="sequence-view-terminal-recess"
                data-end={endName}
                aria-hidden
                style={{
                  position: 'absolute', left: (labelChars + startCol) * charPx, top: 0,
                  width: st.len * charPx, height: ROW_HEIGHT_STRAND,
                  background: 'var(--surface-1, #ffffff)',
                  [stepSide]: '1px solid var(--border-default, #d6d3d1)',
                  zIndex: 3, pointerEvents: 'none',
                }}
              />
            );
          }
          // protruding === 'bottom' → overhang bases stick out past the duplex
          // edge as plain single-stranded bases (neutral colour, не красные).
          const left = atRight
            ? (labelChars + seq.length) * charPx
            : Math.max(0, (labelChars - st.len) * charPx);
          return (
            <div
              key={`term-oh-${endName}`}
              data-testid="sequence-view-terminal-overhang"
              data-end={endName}
              title={`${st.type === '3prime' ? '3′' : '5′'} ${st.seq}`}
              style={{
                position: 'absolute', left, top: 0,
                width: st.len * charPx, height: ROW_HEIGHT_STRAND, lineHeight: `${ROW_HEIGHT_STRAND}px`,
                whiteSpace: 'pre', color: 'var(--text-secondary, #4b5563)', fontWeight: 500,
                zIndex: 3, pointerEvents: 'none',
              }}
            >
              {/* The overhang sticks out on the BOTTOM strand, which the viewer
                  draws as the per-nucleotide COMPLEMENT — show the overhang bases
                  complemented so they read consistently (Игорь 22.06), the actual
                  5′/3′ overhang sequence stays in the tooltip. */}
              {st.seq.split('').map((ch) => complement(ch)).join('')}
            </div>
          );
        })}
        {/*
          * No literal space between the gutter span and the nt spans —
          * a `{" "}` here would consume 1 char of horizontal space and
          * push every DNA letter 1 ch to the right of where the SVG
          * tracks (Ruler / Annotation / Primer / RE) expect them, making
          * every overlay look offset by 1 nt. (Visual review 02.05.2026.)
          */}
        <span
          aria-hidden="true"
          style={{ color: "var(--text-tertiary, #9ca3af)", userSelect: "none", paddingLeft: STRAND_PADDING_X }}
        >
          {/*
            * Gutter text formatted as `<right-aligned number><space>`
            * = exactly `labelChars` characters wide. The trailing
            * whitespace gives a 1-ch visual gap between the line
            * number and the first DNA letter — biolog feedback
            * 04.05.2026 evening: «левый столбец с цифрами надо
            * отделить (сейчас они вплотную к генетическому коду)».
            * Total width unchanged so all SVG overlay tracks
            * (Ruler / Annotation / Primer / RE) keep aligning at
            * `labelChars * charPx`.
            */}
          {isTop
            ? (gutterLabel ? "".padStart(labelChars) : `${String(lineStart + 1).padStart(labelChars - 1)} `)
            : "".padStart(labelChars)}
        </span>
        {/* Per-line reference NAME label (align-to-reference). Absolutely
            positioned over the blanked gutter so it can't shift the DNA
            char-grid; truncates with a full-name tooltip. */}
        {isTop && gutterLabel && (
          <span
            data-testid="strand-gutter-label"
            title={gutterLabel}
            style={{
              position: 'absolute', left: 2, top: 0,
              height: ROW_HEIGHT_STRAND, lineHeight: `${ROW_HEIGHT_STRAND}px`,
              maxWidth: Math.max(0, labelChars * charPx - 4),
              fontFamily: 'var(--font-sans, sans-serif)', fontSize: 9,
              color: 'var(--text-tertiary, #78716c)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              pointerEvents: 'none',
            }}
          >
            {gutterLabel}
          </span>
        )}
        {runs.map((run, ri) => {
          const baseStyle = {
            background: run.tint,
          };
          if (run.intron) {
            baseStyle.backgroundImage =
              "repeating-linear-gradient(135deg, rgba(0,0,0,0.06) 0 2px, transparent 2px 4px)";
          }
          return (
            <span
              // eslint-disable-next-line react/no-array-index-key
              key={ri}
              data-testid="sequence-view-nt-run"
              data-pos-start={lineStart + run.startCi}
              data-pos-end={lineStart + run.endCi}
              data-strand={which}
              data-intron={run.intron ? "true" : "false"}
              style={baseStyle}
            >
              {run.text}
            </span>
          );
        })}
        {/* Sticky-end CONNECTOR (top strand only) — a thin line at the boundary
            between the two strand rows, spanning the overhang from the top cut to
            the bottom cut. Together with the per-strand carets it draws the
            staggered cut as a Z-shape (Игорь 22.06: «стрелки соединены линией
            которая между цепей их соединяет»). Lives at the top strand's bottom
            edge so it sits exactly on the inter-strand seam. */}
        {/* Sticky-end CONNECTOR — only when the bottom strand is actually shown
            (else it dangles with no bottom caret to meet; review wq20q3xjv). */}
        {isTop && showBottomStrand !== false && overhangsThisLine.map((o) => {
          const lo = Math.max(o.startPos, lineStart);
          const hi = Math.min(o.endPos, lineEnd);
          const left = (labelChars + (lo - lineStart)) * charPx;
          const width = (hi - lo) * charPx;
          return (
            <div
              key={`re-conn-${o.key}`}
              data-testid="sequence-view-strand-cut-connector"
              aria-hidden
              style={{
                position: 'absolute',
                left,
                top: ROW_HEIGHT_STRAND - 1,
                width,
                height: 2,
                background: '#dc2626',
                pointerEvents: 'none',
                zIndex: 2,
              }}
            />
          );
        })}
        {/* Cut glyphs — SnapGene-style (Игорь 22.06). A thin cut line + a caret
            that POINTS AT its own strand from the OUTER edge: the top strand caret
            ▼ sits at the top pointing down into the top strand, the bottom strand
            caret ▲ sits at the bottom pointing up into the bottom strand (Игорь:
            «стрелки должны указывать на верхнюю и нижнюю цепь, а не между ними»).
            The cut line runs from the caret to the inter-strand seam, where the
            connector joins the staggered top/bottom cuts. Drawn above the chars. */}
        {cutsThisLine.map((c) => {
          const cx = (labelChars + (c.pos - lineStart)) * charPx;
          const local = charPx; // cut line x inside the 2*charPx-wide glyph
          const half = 4;
          const tip = 5;
          const caret = isTop
            ? `${local - half},0 ${local + half},0 ${local},${tip}`
            : `${local - half},${ROW_HEIGHT_STRAND} ${local + half},${ROW_HEIGHT_STRAND} ${local},${ROW_HEIGHT_STRAND - tip}`;
          const lineY1 = isTop ? tip : 0;
          const lineY2 = isTop ? ROW_HEIGHT_STRAND : ROW_HEIGHT_STRAND - tip;
          return (
            <svg
              key={`re-cut-${c.key}`}
              data-testid="sequence-view-strand-cut"
              data-strand={which}
              data-cut-pos={c.pos}
              aria-hidden
              width={charPx * 2}
              height={ROW_HEIGHT_STRAND}
              style={{ position: 'absolute', left: cx - charPx, top: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 2 }}
            >
              <line x1={local} y1={lineY1} x2={local} y2={lineY2} stroke="#dc2626" strokeWidth={1.4} />
              <polygon points={caret} fill="#dc2626" />
            </svg>
          );
        })}
      </div>
    );
  };

  if (which === "top") {
    return (
      <div data-testid={dataTestid} data-line-start={lineStart} data-which="top">
        {renderStrand("top")}
      </div>
    );
  }
  if (which === "bottom") {
    return (
      <div data-testid={dataTestid} data-line-start={lineStart} data-which="bottom">
        {renderStrand("bottom")}
      </div>
    );
  }

  // Legacy "both"-mode (K2 tests): render top + optionally bottom.
  return (
    <div data-testid={dataTestid} data-line-start={lineStart}>
      {renderStrand("top")}
      {showBottomStrand ? renderStrand("bottom") : null}
    </div>
  );
}

// Each line's StrandsTrack receives stable props from the orchestrator
// (line.start / line.seq / annMap / labelChars / showBottomStrand /
// which) — memo skips re-render on parent state churn that doesn't
// touch this line's inputs.
export default memo(StrandsTrack);
