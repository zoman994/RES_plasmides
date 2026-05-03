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
 */
function StrandsTrack({
  lineStart,
  seq,
  annMap,
  labelChars,
  showBottomStrand,
  which,
  dataTestid = "sequence-view-strands",
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
        }}
        title={direction}
      >
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
            ? `${String(lineStart + 1).padStart(labelChars - 1)} `
            : "".padStart(labelChars)}
        </span>
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
