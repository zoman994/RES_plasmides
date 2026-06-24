/**
 * AATrack — amino-acid translation row(s) for the SequenceView (Sprint
 * M-B.3, K4 / DEC-SQV-02).
 *
 * Two render strategies, picked by lib/frames-mode.resolveFramesMode():
 *   - strategy === 'single':
 *       Render exactly ONE forward row, only between dominantCDS.start
 *       and dominantCDS.end. Frame = dominantCDS.start % 3.
 *   - strategy === 'hybrid':
 *       Render all six rows (3 frames × 2 strands) over the full line.
 *       Per-AA opacity comes from lib/aa-opacity.computeAAOpacity:
 *         framesMode === 'all'  → 1.0 everywhere
 *         framesMode === 'auto' → 1.0 inside any ORF on (frame, strand),
 *                                  else 0.35 (faded)
 *
 * Colour rules (match the M-B.2 carryover):
 *   - first M of an ORF → bold green
 *   - * (stop)          → bold red
 *   - anything else     → muted purple / grey
 *
 * Display-only — no click handlers in M-B.3. M-D Container Window edit
 * surface will receive an `onAAClick` prop later.
 */

import { memo } from "react";
import { walkCodonsCached } from "../lib/codon-walker.js";
import { buildCdsAARows } from "../lib/aa-rows.js";
import { computeAAOpacity, frameHasSignal, regionFrame } from "../lib/aa-opacity.js";
import { TRANSLATABLE_TYPES } from "../constants.js";

const ROW_HEIGHT = 12;

// The 'single'-strategy AA row builder (buildCdsAARows + walkRangeIntoRows +
// ROW_ORDER) was extracted to ../lib/aa-rows.js in the splice sprint
// (TD-SIZE-AATRACK) and made splice-aware there. AATrack now only renders the
// rows it returns. The 'hybrid' (6-frame exploration) path below still walks
// codons directly via walkCodonsCached.

function aaColor(aa, isStart) {
  if (aa === "*") return "#dc2626";
  if (aa === "M" && isStart) return "#16a34a";
  // Default AA letter — was `#7c3aed` (saturated violet) which on
  // dark theme looked odd next to the muted DNA strand text (biolog:
  // «фиолетовый на чёрном смотрится странно»). Theme-aware
  // `var(--text-secondary)` resolves to a mid-grey on both themes,
  // sitting comfortably between the bright start-M (green) and
  // stop-* (red) accents — translation reads as a calm secondary
  // layer instead of demanding equal attention with the DNA letters.
  return "var(--text-secondary, #4b5563)";
}

function fontWeightFor(aa, isStart) {
  if (aa === "*" || (aa === "M" && isStart)) return 700;
  return 500;
}

/**
 * Background highlight for special AA cells — visually separates
 * frame boundaries from regular protein letters when the biolog
 * scans long CDS regions (visual review 04.05.2026 evening on
 * pKaede-S1: «стоп кодон обозначать в конце рамки»).
 *
 *   - stop codon (`*`)  → light red tag, makes frame end pop
 *   - first M (start)   → light green tag, makes frame start pop
 *   - default           → no background (regular protein letter)
 *
 * Returns a partial CSS style object suitable for spreading into
 * the cell's inline style. `null` for cells that don't get a tag.
 */
function aaCellHighlight(c) {
  if (!c) return null;
  if (c.isStop) {
    return {
      background: "#fee2e2",
      borderRadius: "2px",
    };
  }
  if (c.isStart) {
    return {
      background: "#dcfce7",
      borderRadius: "2px",
    };
  }
  return null;
}

function hybridRows({ strandFilter, visibleFrames }) {
  let rows = [
    { frame: 0, strand: 1, label: "+1" },
    { frame: 1, strand: 1, label: "+2" },
    { frame: 2, strand: 1, label: "+3" },
    { frame: 0, strand: -1, label: "-1" },
    { frame: 1, strand: -1, label: "-2" },
    { frame: 2, strand: -1, label: "-3" },
  ];
  if (visibleFrames && typeof visibleFrames === "object") {
    rows = rows.filter((r) => visibleFrames[r.label] !== false);
  }
  if (strandFilter === "forward") return rows.filter((r) => r.strand === 1);
  if (strandFilter === "reverse") return rows.filter((r) => r.strand === -1);
  return rows;
}

/**
 * @param {object} props
 * @param {string} props.fullSeq
 * @param {number} props.lineStart
 * @param {number} props.lineLen
 * @param {number} props.labelChars
 * @param {'single'|'hybrid'} props.strategy
 * @param {'auto'|'single'|'all'} props.framesMode
 * @param {Array<object>} props.orfRanges
 * @param {object|null} props.dominantCDS
 */
function AATrack({
  fullSeq,
  lineStart,
  lineLen,
  labelChars,
  strategy,
  framesMode,
  orfRanges,
  dominantCDS,
  strandFilter,
  visibleFrames,
  regions,
  // «Ген разрезан — тянуть AA до реза»: { left, right } booleans for terminal
  // sticky-end cuts → the terminal gene's translation extends to the cut.
  terminalCut,
}) {
  if (!fullSeq || !lineLen) return null;

  // ─── 'single' strategy: one row per (strand, frame) where annotated
  // CDSes live. Empty rows are dropped at the build layer so a typical
  // single-CDS plasmid gets exactly ONE row. Multi-CDS plasmids whose
  // CDSes share the same frame still collapse into a single row; only
  // CDSes that genuinely live in different frames spread across rows.
  if (strategy === "single") {
    // The orchestrator mounts AATrack twice (forward + reverse). In
    // single mode we draw EVERY row in the forward mount and skip the
    // reverse mount entirely — this keeps the row order canonical
    // (+1, +2, +3, -1, -2, -3) and avoids duplicate -1 rendering.
    if (strandFilter === "reverse") return null;
    const cdsRows = buildCdsAARows(fullSeq, regions, orfRanges, { terminalCut });
    if (cdsRows.length === 0) return null;

    // Per-line row filtering (biolog visual review 03.05.2026 evening on
    // pBR322 ori at 1501-1660: «лучше будет убирать показ рамок считывания
    // в которых на строке нет АА. иначе очень пусто выглядит»). Without
    // this, every line shows ALL six (±frame) rows from buildCdsAARows
    // even if e.g. ori on this particular line only has codons in `+2`,
    // leaving `+1 / +3 / -1 / -2 / -3` as bare gutter labels with no AA
    // characters to their right. Filter to rows whose codon map has at
    // least one position inside [lineStart, lineEnd) so each line only
    // shows the frames that actually translate something here.
    const lineEndAbs = lineStart + lineLen;
    const visibleCdsRows = cdsRows.filter((row) => {
      for (const pos of row.map.keys()) {
        if (pos >= lineStart && pos < lineEndAbs) return true;
      }
      return false;
    });
    if (visibleCdsRows.length === 0) return null;

    // Lookup table for region annotation colour — used to tint the
    // continuous reading-frame "container" so that the AA row visually
    // rhymes with the annotation track above it (visual review
    // 04.05.2026 evening: «выделение круглым боксом всю рамку
    // считывания, или как-то ещё над дизайном поработал»). Each CDS
    // run gets a low-alpha tint of its annotation colour, with
    // rounded ends marking the M start (left edge) and the * stop
    // (right edge). Mid cells stay flat-edged so multi-line CDSes
    // continue seamlessly across line breaks.
    const regionColors = new Map();
    const regionById = new Map();
    for (const r of regions || []) {
      if (r && r.id) {
        if (r.color) regionColors.set(r.id, r.color);
        regionById.set(r.id, r);
      }
    }

    // AA index for a codon — biolog 04.05.2026 evening: «у каждой
    // аминокислоты должно быть номер». Forward CDS: AA #N's codon
    // middle = region.start + 1 + 3*(N-1). Reverse CDS: AA #N's
    // middle = region.end - 2 - 3*(N-1). Returns null when the
    // codon's region isn't in the regions map (auto-detected ORFs
    // without a registered region — leave them unnumbered).
    const aaNumberFor = (codon, absMid) => {
      // Spliced rows carry their mature-mRNA index directly — linear genomic
      // arithmetic doesn't hold once introns are removed, so it wins.
      if (codon.aaIndex != null) return codon.aaIndex;
      const region = regionById.get(codon.regionId);
      if (!region) return null;
      const isReverse = (codon.strand === -1) || (region.strand === -1);
      const idx = isReverse
        ? Math.floor((region.end + 1 - absMid) / 3)
        : Math.floor((absMid - region.start + 2) / 3);
      return Number.isFinite(idx) && idx >= 1 ? idx : null;
    };

    return (
      <div
        data-testid="sequence-view-aa"
        data-line-start={lineStart}
        data-strategy="single"
        data-row-count={visibleCdsRows.length}
        // Zero top margin — the numbering row's own height already
        // provides visual separation from the annotation track
        // above. Earlier 1 px combined with numbering's height felt
        // like the AA section "floated" too far below DNA.
        style={{ marginTop: 0 }}
      >
        {visibleCdsRows.map((row) => {
          // Compute per-region run bounds on THIS line: smallest codon
          // start column and largest codon end column for each regionId
          // present in row.map. A single CDS spanning multiple lines
          // gets only the part that intersects the current line — the
          // run on the next line is a separate run, with its own
          // rounded-left / rounded-right rendering.
          const regionBounds = new Map();
          for (const [absPos, c] of row.map) {
            const ciMid = absPos - lineStart;
            const startCi = Math.max(0, ciMid - 1);
            const endCi = Math.min(lineLen - 1, ciMid + 1);
            const rid = c.regionId || "_";
            const existing = regionBounds.get(rid);
            if (!existing) {
              regionBounds.set(rid, { startCi, endCi });
            } else {
              if (startCi < existing.startCi) existing.startCi = startCi;
              if (endCi > existing.endCi) existing.endCi = endCi;
            }
          }

          // Find the codon (and column role) that covers a given column ci.
          //   role 'mid'   → ci is the codon middle (the cell that holds the AA char)
          //   role 'start' → ci is the codon's left edge (left of the AA char)
          //   role 'end'   → ci is the codon's right edge (right of the AA char)
          // Cells that aren't part of any codon return null and render as plain blanks.
          const findCovering = (ci) => {
            // Probe the three positions whose codon could span ci.
            for (const offset of [0, 1, -1]) {
              const absMid = lineStart + ci + offset;
              if (row.map.has(absMid)) {
                const role = offset === 0 ? "mid" : offset === 1 ? "start" : "end";
                return { codon: row.map.get(absMid), role };
              }
            }
            return null;
          };

          // Per-row AA numbering ruler (biolog 04.05.2026 evening:
          // «у каждой аминокислоты должно быть номер»). Rendered
          // ABOVE the AA row, between the annotation track and the
          // AA letters. Every codon mid cell prints its AA index
          // centered horizontally on the codon (translateX(-50%) so
          // 2-3 digit numbers stay symmetric over the AA letter).
          // fontSize 8 fits comfortably inside the codon's 3 ch
          // width without touching the neighbouring codon's number.
          // height 11 + marginBottom 2 give a clean ~3 px gap before
          // the AA letters so numbers don't visually overlap.
          // CRITICAL: outer cell stays at parent fontSize so its
          // `width: 1ch` resolves to the SAME pixel value as every
          // other 1 ch cell (gutter, AA letter, empty filler). Earlier
          // I set fontSize: 7 on the outer cell — that shrunk 1 ch
          // to ~4.5 px while AA cells were ~6.5 px, so the numbering
          // row drifted left as columns accumulated and numbers no
          // longer landed above their letters (biolog 04.05.2026
          // evening: «нумерация АА все ещё кривая, сдвиг»). The 7 px
          // text size now lives on an INNER span — it shrinks the
          // glyphs without disturbing the cell width.
          const aaNumberingCells = Array.from({ length: lineLen }, (_, ci) => {
            const cover = findCovering(ci);
            if (!cover || cover.role !== "mid") {
              return (
                <span key={ci} style={{ display: "inline-block", width: "1ch", verticalAlign: "top" }}>{" "}</span>
              );
            }
            const absMid = lineStart + ci;
            const aaIdx = aaNumberFor(cover.codon, absMid);
            if (aaIdx == null) {
              return (
                <span key={ci} style={{ display: "inline-block", width: "1ch", verticalAlign: "top" }}>{" "}</span>
              );
            }
            return (
              <span
                key={ci}
                data-testid="sequence-view-aa-number"
                data-aa-number={aaIdx}
                style={{
                  // Outer cell at parent fontSize so 1 ch matches
                  // the AA row column grid. textAlign: center
                  // distributes overflow symmetrically (the inner
                  // glyphs at fontSize 7 spill equally left and
                  // right of the codon middle). overflow: visible
                  // allows the spill horizontally; verticalAlign:
                  // top keeps the cell aligned to the top of the
                  // line box so the inner text doesn't drift down
                  // into the AA letters below (biolog 04.05.2026
                  // evening: «опять наехало на АА сиквенс» — was
                  // happening because absolute-positioned inner
                  // span collapsed the cell to zero height).
                  display: "inline-block",
                  width: "1ch",
                  textAlign: "center",
                  overflow: "visible",
                  verticalAlign: "top",
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  style={{
                    fontSize: 7,
                    lineHeight: "8px",
                    color: "var(--text-tertiary, #9ca3af)",
                    pointerEvents: "none",
                  }}
                >{aaIdx}</span>
              </span>
            );
          });

          return (
            <div key={row.rowKey + ":wrap"}>
            <div
              data-testid="sequence-view-aa-numbering"
              data-aa-numbering-row={row.label}
              style={{
                // Symmetric 2 px buffer above + below the 8 px text
                // band so the gap from annotation rect → numbers
                // visually equals the gap from numbers → AA letters
                // (biolog 04.05.2026 evening: «отступ от ДНК до
                // номеров и от номеров до АА цепи неравномерный»).
                height: 8,
                lineHeight: "8px",
                whiteSpace: "pre",
                marginTop: 2,
                marginBottom: 2,
                userSelect: "none",
                WebkitUserSelect: "none",
              }}
            >
              <span aria-hidden="true">{`${"".padStart(labelChars - 1)} `}</span>
              {aaNumberingCells}
            </div>
            <div
              data-testid="sequence-view-aa-row"
              data-aa-strand={row.strand}
              data-aa-frame={row.frame}
              data-aa-label={row.label}
              // Per-track selection scope. AA rows across all lines
              // sharing the same (strand, frame) participate in the
              // same scope id `aa-${strand}-${frame}`, so drag can
              // extend vertically along one frame's translation
              // across line wraps. See lib/row-selection-isolation.js.
              data-row-selection-scope={`aa-${row.strand}-${row.frame}`}
              style={{
                height: ROW_HEIGHT,
                lineHeight: `${ROW_HEIGHT}px`,
                whiteSpace: "pre",
                // CRITICAL: must NOT override fontSize from the parent
                // SequenceView wrapper. `1ch` resolves against the
                // CURRENT font size, so changing fontSize here would
                // shrink/widen every AA cell relative to the DNA
                // strand cell — accumulated drift across N codons
                // makes the AA row visually slip out of column with
                // its codons (visual review 04.05.2026 evening on
                // 3xFLAG-dCas9 pCMV-7.1: AA frame +2 ended ~50 px
                // before DNA position 5100 over 50 codons due to
                // fontSize:9 vs strand fontSize:11 mismatch). All
                // tracks now inherit fontSize from SequenceView root
                // (currently 11 px) so 1ch is consistent end-to-end.
                color: "var(--text-tertiary, #9ca3af)",
              }}
            >
              <span aria-hidden="true" style={{ userSelect: "none" }}>
                {/* Match StrandsTrack gutter — right-align label in
                  * labelChars-1 chars + 1 trailing space → 1-ch gap
                  * between gutter and AA cells (visual review
                  * 04.05.2026 evening, gutter spacing). */}
                {`${row.label.padStart(labelChars - 1)} `}
              </span>
              {Array.from({ length: lineLen }, (_, ci) => {
                const cover = findCovering(ci);
                if (!cover) {
                  // Empty filler cell — never copyable. Drag-to-copy
                  // on an AA row should yield contiguous AA letters
                  // with no spaces (biolog: «когда копируем, то не
                  // должно копироваться с пробелами»).
                  return (
                    <span
                      key={ci}
                      style={{
                        display: "inline-block",
                        width: "1ch",
                        userSelect: "none",
                        WebkitUserSelect: "none",
                      }}
                    >
                      {" "}
                    </span>
                  );
                }
                const { codon: c, role } = cover;
                const rid = c.regionId || "_";
                const bounds = regionBounds.get(rid);
                const isLeftEdge = !!bounds && ci === bounds.startCi;
                const isRightEdge = !!bounds && ci === bounds.endCi;
                // Annotation colour from the regions list (matches the
                // hue used by the annotation track) at low alpha; falls
                // back to a neutral lavender when no colour is known.
                const baseColor = regionColors.get(rid) || "#a78bfa";
                // Mid cells get the colour. Start/end cells (gaps
                // between codons inside a contiguous CDS) get the same
                // colour at the same alpha so the run reads continuous;
                // there are no gaps within a CDS in any event because
                // codons in one frame are perfectly contiguous (3-nt
                // each). isStart / isStop override mid-cell colour for
                // emphasis at the frame boundaries.
                let bg;
                if (role === "mid" && c.isStop) bg = "#fee2e2";
                else if (role === "mid" && c.isStart) bg = "#dcfce7";
                else bg = baseColor + "33"; // ~20% alpha
                const cellStyle = {
                  display: "inline-block",
                  width: "1ch",
                  textAlign: "center",
                  background: bg,
                  borderTopLeftRadius: isLeftEdge ? "5px" : "0",
                  borderBottomLeftRadius: isLeftEdge ? "5px" : "0",
                  borderTopRightRadius: isRightEdge ? "5px" : "0",
                  borderBottomRightRadius: isRightEdge ? "5px" : "0",
                };
                if (role === "mid") {
                  return (
                    <span
                      key={ci}
                      data-testid="sequence-view-aa-char"
                      data-aa={c.aa}
                      data-aa-pos={lineStart + ci}
                      data-aa-opacity={1}
                      data-aa-strand={c.strand || 1}
                      data-aa-region={c.regionId || ""}
                      title={`${c.aa} (${c.codon}) pos ${lineStart + ci + 1} ${c.strand === -1 ? "rev" : "fwd"}${c.isStop ? " · STOP" : c.isStart ? " · START" : ""}`}
                      style={{
                        ...cellStyle,
                        color: aaColor(c.aa, c.isStart),
                        fontWeight: fontWeightFor(c.aa, c.isStart),
                        opacity: 1,
                      }}
                    >
                      {c.aa}
                    </span>
                  );
                }
                // role === 'start' or 'end' — non-middle cell of the codon.
                // Render an empty cell that carries the run's background +
                // edge rounding so the visual bar is continuous. NOT
                // copyable — only the mid cell (the AA char itself) is
                // pulled into clipboard, so dragging across N codons
                // produces N AA letters with no whitespace gaps.
                //
                // data-aa-pos points at the codon MIDDLE so a click on
                // the side cell selects the same triplet as a click
                // on the AA letter itself (biolog 04.05.2026 evening:
                // «при нажатии на АА надо нажать на саму букву, если
                // рядом то не обрабатывается. давай сделаем так чтобы
                // и пробелы с боков от буквы давали тот же эффект»).
                // role 'start' → mid is at ci+1; role 'end' → mid at ci-1.
                const sideMidAbs = role === "start" ? (lineStart + ci + 1) : (lineStart + ci - 1);
                return (
                  <span
                    key={ci}
                    data-testid="sequence-view-aa-side"
                    data-aa-pos={sideMidAbs}
                    data-aa-strand={c.strand || 1}
                    data-aa-region-fill={c.regionId || ""}
                    style={{ ...cellStyle, userSelect: "none", WebkitUserSelect: "none" }}
                  >
                    {" "}
                  </span>
                );
              })}
            </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ─── 'hybrid' strategy: 3+3 frames with opacity per orf-ranges ────────
  let rows = hybridRows({ strandFilter, visibleFrames });
  // Auto-mode row pruning (биолог 03.05.2026 evening: «когда включена
  // автодетекция КДС надо убирать рамки автоматически в которых ничего
  // нет»). In `framesMode='auto'`, drop rows whose (frame, strand) has
  // neither a detected ORF nor an annotated CDS — those rows would
  // render as nothing but faded grey letters and just add noise. The
  // 'all' mode keeps every row regardless (user wants to see them).
  if (framesMode === "auto") {
    rows = rows.filter((row) =>
      frameHasSignal({
        frame: row.frame,
        strand: row.strand,
        orfRanges,
        regions,
        seq: fullSeq,
      }),
    );
  }
  if (rows.length === 0) return null;
  const lineEnd = lineStart + lineLen;

  return (
    <div
      data-testid="sequence-view-aa"
      data-line-start={lineStart}
      data-strategy={strategy}
      data-row-count={rows.length}
      // 1 px — see comment on the matching marginTop in the single-
      // strategy branch above. Symmetric with the all-frames render
      // path so the gap is identical regardless of strategy.
      style={{ marginTop: 1 }}
    >
      {rows.map((row) => {
        // PERF-01 — fetch codons + byPosition map from the module-level
        // cache. With ~60 SequenceLine instances each rendering up to 6
        // (frame, strand) rows, the previous spelling re-translated the
        // entire plasmid 360× per render. Now: 1× per (sequence, frame,
        // strand) tuple, shared across every line.
        const { codons, byPosition } = walkCodonsCached(fullSeq, row.frame, row.strand);
        const onLine = codons.filter(
          (c) => c.position >= lineStart && c.position < lineEnd,
        );
        // Bug-rush #16 (04.05.2026 evening): per-line auto-hide
        // for empty rows. Biolog: «при включенном АА режиме
        // хотелось бы чтобы рамки с нумерацией не показывались
        // автоматически если на них нет АА». A row with zero
        // codons on this line was rendering as just the «+1 / +2
        // / -2 …» label gutter, taking ~10 px of vertical space
        // for nothing. Skip the row entirely when nothing lands
        // on this specific line — neighbours collapse up.
        if (onLine.length === 0) return null;
        // Bug-rush #16 follow-up («не вижу отличий»): in
        // framesMode='auto' / 'hybrid' the codons exist but have
        // opacity 0 outside the dominant CDS — visually empty
        // gutter row. Probe each codon's computed opacity; skip
        // the row if every cell is invisible.
        // PERF-01 — compute the matching CDS regions for THIS row
        // ONCE (was twice — `rowCdsRegionsForOpacity` then
        // `rowCdsRegions`, identical). Used by both the visibility
        // probe and the per-cell opacity / colour tint below.
        const rowCdsRegions = (regions || []).filter((r) => {
          if (!r || !TRANSLATABLE_TYPES.has(r.type)) return false;
          const rs = r.strand === -1 ? -1 : 1;
          if (rs !== row.strand) return false;
          return regionFrame(r, fullSeq) === row.frame;
        });
        const anyVisible = onLine.some((c) => {
          const op = computeAAOpacity({
            position: c.position,
            frame: row.frame,
            strand: row.strand,
            strategy,
            framesMode,
            orfRanges,
            dominantCDS,
            inAnnotatedCDS: rowCdsRegions.some(
              (r) => c.position >= r.start && c.position < r.end,
            ),
          });
          return op > 0;
        });
        if (!anyVisible) return null;
        return (
          <div
            key={`f${row.frame}s${row.strand}`}
            data-testid="sequence-view-aa-row"
            data-aa-frame={row.frame}
            data-aa-strand={row.strand}
            data-aa-label={row.label}
            // Per-track selection scope (hybrid strategy) — see
            // comment on the equivalent attribute in the
            // single-strategy branch above.
            data-row-selection-scope={`aa-${row.strand}-${row.frame}`}
            style={{
              height: ROW_HEIGHT,
              lineHeight: `${ROW_HEIGHT}px`,
              whiteSpace: "pre",
              // CRITICAL: must NOT override fontSize from the parent
              // SequenceView wrapper. `1ch` resolves against the
              // CURRENT font size, so changing fontSize here would
              // shrink/widen every AA cell relative to the DNA
              // strand cell — accumulated drift across N codons
              // makes the AA row visually slip out of column with
              // its codons (visual review 04.05.2026 evening on
              // 3xFLAG-dCas9 pCMV-7.1: AA frame +2 ended ~50 px
              // before DNA position 5100 over 50 codons due to
              // fontSize:9 vs strand fontSize:11 mismatch). All
              // tracks now inherit fontSize from SequenceView root
              // (currently 11 px) so 1ch is consistent end-to-end.
              color: "var(--text-tertiary, #9ca3af)",
            }}
          >
            <span aria-hidden="true" style={{ userSelect: "none" }}>
              {/* Match the single-strategy gutter: right-align label
                  in `labelChars - 1` chars + 1 trailing space → 1-ch
                  visual gap between «+1 / -2 / …» label and the AA
                  letters. Без trailing space лейбл сливался с
                  ближайшей AA-буквой (биолог 03.05.2026 evening:
                  «отступ от -1 -2 и тд нужен, сейчас сливаются с
                  АА»). */}
              {`${row.label.padStart(labelChars - 1)} `}
            </span>
            {Array.from({ length: lineLen }, (_, ci) => {
              const absPos = lineStart + ci;
              // O(1) lookup via the cached `byPosition` map — was
              // O(lineLen) `Array.find` per cell, i.e. O(lineLen²) per
              // row before. byPosition is shared across all lines that
              // render the same (frame, strand).
              const codon = byPosition.get(absPos);
              if (!codon) {
                // Filler between codon midpoints — never copyable
                // but Bug-rush #20 (04.05.2026 evening): biolog «при
                // попытке выделить АА если курсор тыкнул на пробел
                // рядом с буквой то не всегда появляется выделение
                // этой АК и нельзя тащить дальше». Stamp the
                // adjacent codon's middle position on the filler
                // cell so a click on the empty space immediately to
                // the left or right of the AA letter still selects
                // the same triplet.
                const adjacent = byPosition.get(absPos - 1) || byPosition.get(absPos + 1);
                const fillerCds = rowCdsRegions.find(
                  (r) => absPos >= r.start && absPos < r.end,
                );
                const fillerBg = fillerCds && fillerCds.color
                  ? fillerCds.color + "22"
                  : null;
                return (
                  <span
                    key={ci}
                    data-aa-pos={adjacent ? adjacent.position : undefined}
                    data-aa-strand={adjacent ? row.strand : undefined}
                    data-aa-frame={adjacent ? row.frame : undefined}
                    style={{
                      display: "inline-block",
                      width: "1ch",
                      userSelect: "none",
                      WebkitUserSelect: "none",
                      background: fillerBg || undefined,
                      cursor: adjacent ? "pointer" : undefined,
                    }}
                  >
                    {" "}
                  </span>
                );
              }
              const opacity = computeAAOpacity({
                position: absPos,
                frame: row.frame,
                strand: row.strand,
                strategy,
                framesMode,
                orfRanges,
                dominantCDS,
                // Annotated CDS / gene / marker → opacity 1 even
                // when ORF detection missed them (биолог:
                // «совпадает с размеченным CDS — должна тоже
                // подсвечиваться»).
                regions,
                seq: fullSeq,
              });
              if (opacity === 0) {
                // Faded-out cell — never copyable (same reason).
                return (
                  <span
                    key={ci}
                    style={{
                      display: "inline-block",
                      width: "1ch",
                      userSelect: "none",
                      WebkitUserSelect: "none",
                    }}
                  >
                    {" "}
                  </span>
                );
              }
              // Find an annotated CDS that covers this position in
              // the matching (frame, strand) — used for the
              // background tint and as the title-bar feature name.
              const cdsHit = rowCdsRegions.find(
                (r) => absPos >= r.start && absPos < r.end,
              );
              // Compose the cell background. Stop/start codons keep
              // their explicit highlight (red/green tag). Otherwise
              // — if we're inside an annotated CDS at full opacity,
              // tint with the feature colour at ~13 % alpha so the
              // row reads as «this AA belongs to ccdB» without
              // overpowering the actual amino-acid letter.
              let cellBg = null;
              if (opacity === 1) {
                if (codon.isStop) cellBg = "#fee2e2";
                else if (codon.isStart) cellBg = "#dcfce7";
                else if (cdsHit && cdsHit.color) cellBg = cdsHit.color + "22";
              }
              return (
                <span
                  key={ci}
                  data-testid="sequence-view-aa-char"
                  data-aa={codon.aa}
                  data-aa-pos={absPos}
                  data-aa-opacity={opacity}
                  data-aa-frame={row.frame}
                  data-aa-strand={row.strand}
                  data-aa-region={cdsHit?.id || ""}
                  title={`${codon.aa} (${codon.codon}) frame ${row.label} pos ${absPos + 1}${codon.isStop ? " · STOP" : codon.isStart ? " · START" : cdsHit ? ` · ${cdsHit.name || cdsHit.type}` : ""}`}
                  style={{
                    display: "inline-block",
                    width: "1ch",
                    textAlign: "center",
                    color: aaColor(codon.aa, codon.isStart),
                    fontWeight: fontWeightFor(codon.aa, codon.isStart),
                    opacity,
                    background: cellBg || undefined,
                    // Round only for isolated stop/start tags. CDS-tint
                    // cells stay flat so adjacent filler cells (start/
                    // end positions of the same codon, also tinted)
                    // merge into one continuous coloured band — биолог
                    // wanted the entire CDS sequence painted, not
                    // bubbles around individual letters.
                    borderRadius:
                      codon.isStop || codon.isStart ? "2px" : undefined,
                  }}
                >
                  {codon.aa}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// Memoize so the heavy buildCdsAARows / walkCodons work doesn't redo
// on every parent rerender — orchestrator passes stable references
// for fullSeq / regions / orfRanges / settings, so default shallow
// compare bails most parent rerenders.
export default memo(AATrack);
