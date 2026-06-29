/**
 * AnnotationTrack — multi-row stacked feature track (Sprint M-B.3, K3 /
 * DEC-SQV-03).
 *
 * Per-line responsibilities:
 *   - Run lib/annotation-stacking.stackAnnotations() to greedy-pack
 *     regions intersecting this line into <= MAX_VISIBLE_ROWS rows
 *     plus an overflow bin.
 *   - Render a SVG <g> overlay where every row sits at a fixed Y offset
 *     and every region is a coloured rect with optional chevron + label.
 *   - Closes Bug 2 (overlap collapse via latest-wins per-position
 *     annMap[k] = f) by giving each overlap its own row.
 *   - Closes Bug 1 (label дубль per line) by computing the LINE-VISIBLE
 *     center and rendering ONE label per (line, region) pair —
 *     anchored to the feature mid-point clamped to the line, not to
 *     fragmentary sub-spans.
 *
 * Label rendering rules:
 *   - visible width >= label text width   → label INSIDE the rect, white
 *   - visible width >= ~4 chars          → label OUTSIDE on a leader line
 *   - visible width < 4 chars             → no label
 *
 * Overflow indicator: amber pill "+N more" placed on a dedicated row
 * BELOW the visible rows so the biologist learns there's hidden density
 * without losing the visible features.
 */

import { Fragment, memo, useState } from "react";
import { stackAnnotations, MAX_VISIBLE_ROWS } from "../lib/annotation-stacking.js";
import { SBOLIcon } from "../../../sbol-glyphs";
import {
  ROW_HEIGHT, ROW_GAP, LABEL_FONT_SIZE, CHEVRON_PAD, SHORT_VISIBLE_THRESHOLD,
  GLYPH_SIZE, GLYPH_MIN_PX, LEADER_LINE_LENGTH_PX,
} from "./annotation-track-constants.js";
import { ensureColor } from "./annotation-colors.js";
import { isFragmentFeature } from "../../../lib/feature-fragment.js";
import { chevronPath } from "./annotation-geometry.js";
import { buildAnnotationTitle } from "./annotation-title.js";
import { regionKey, labelLengthChars } from "./annotation-layout.js";
import { LabelText } from "./AnnotationLabel.jsx";
import { SubFeatureOverlay } from "./SubFeatureOverlay.jsx";
import { GeneExonRects } from "./GeneExonRects.jsx";
import { AnnotationWrapRows } from "./AnnotationWrapRows.jsx";

/**
 * @param {object} props
 * @param {Array<{ start, end, name?, type?, color?, strand?, id? }>} props.regions
 * @param {number} props.lineStart
 * @param {number} props.lineLen
 * @param {number} props.charPx
 * @param {number} props.labelChars
 * @param {(annotation: object) => void} [props.onAnnotationClick]  display-only
 *   in M-B.3, but the prop is forwarded so M-D wiring is a one-line edit.
 */
function AnnotationTrack({
  regions,
  lineStart,
  lineLen,
  charPx,
  labelChars,
  // Sprint M-X.3 K4 — single-click on a feature rect / chevron
  // fires `onAnnotationClick(region)`. Consumers (Annotator's
  // PreviewTab) can use this to open a drill-in panel on ghost
  // (predicted) features. The previous double-click handler
  // (`onAnnotationFeatureDoubleClick` → opens the Annotator) wins
  // when both fire — the `onClick` runs first, but the consumer
  // is expected to be idempotent. K4 PreviewTab explicitly only
  // reacts to predicted features so a confirmed-feature click
  // can't fight the double-click semantics.
  onAnnotationClick,
  // Sprint M-X.2 K4 — drag-handles for region edges. Optional;
  // when omitted (legacy callers), edge overlays don't render.
  onPointerDownEdge,
  draggedAnnotationId,
  draggedEdge,
  draggedCurrentCoord,
  // Sprint M-X.2 K5 — inline rename on double-click of the LABEL.
  onAnnotationDoubleClick,
  // Sprint M-X.2 bug-rush #3 (04.05.2026 evening): double-click on
  // the FEATURE BAR (rect / chevron) opens the Annotator scoped to
  // the region — biolog wants the bar itself to be the «explore»
  // surface, label stays the «rename» surface.
  onAnnotationFeatureDoubleClick,
  // M-X.5 hotfix (07.05.2026) — bridge-line wrap awareness. Round-10
  // (06.05.2026) introduced the inline wrap-bridge: the last main row
  // of a circular plasmid is physically extended past the origin with
  // wrap chars from plasmid start. SequenceLine passes `wrapsOrigin =
  // true`, `wrapAt = N` (column where the orange origin divider sits;
  // chars 0..wrapAt are the real end of the plasmid, chars wrapAt..cpl
  // are the wrap-half showing chars 0..(cpl-wrapAt) from plasmid
  // start), and `seqLength` (full plasmid length, used to clamp the
  // real-segment's effective lineEnd at seqLength so an annotation
  // ending exactly at seqLen doesn't bleed past the divider).
  //
  // Without these props, an annotation that covers the origin (e.g. a
  // whole-plasmid feature 0..seqLength) only renders in the
  // real-segment — biolog reports a gap right after the orange
  // divider where the wrap-half should also paint. With them, every
  // region overlapping `[0, lineLen-wrapAt)` gets a SECOND rect at
  // x = (labelChars + wrapAt + max(start,0)) × charPx so the
  // annotation reads as one continuous bar split by the origin
  // divider.
  //
  // Backward-compatible: when omitted (regular non-bridge rows /
  // legacy callers), behaviour is exactly as before.
  wrapsOrigin = false,
  wrapAt,
  seqLength,
  // V181 / UX-2 — the region id currently selected (e.g. on the plasmid map).
  // The matching feature row lights up so selection syncs map↔sequence.
  selectedRegionId = null,
}) {
  // Bug-rush #9 (04.05.2026 evening): hover state on the resize
  // handles. Lets the rect get a visible accent line when biolog
  // brushes the edge — answer to «как-то трансформировать кончики
  // чтобы явно было видно при наведении курсора на кончик».
  // Per-line state — AnnotationTrack is already memoised per line
  // so a hover only re-renders this single line.
  const [hover, setHover] = useState(null); // { id, edge } | null

  if (!regions || regions.length === 0 || lineLen === 0 || charPx <= 0) return null;

  const lineEnd = lineStart + lineLen;
  // Sprint M-X.3 follow-up — Variant A. Sub-features (level: 'detail')
  // do NOT participate in the stacker — they overlay their parent's
  // row at smaller height so biolog reads them as «inside this
  // feature». Filter them out of the stacker input and group them
  // by parentId so each parent rect can later render its kids on
  // top with INSET coords.
  const parentRegions = [];
  const detailsByParent = new Map();
  for (const r of regions) {
    if (r.level === 'detail' && r.parentId) {
      const list = detailsByParent.get(r.parentId) || [];
      list.push(r);
      detailsByParent.set(r.parentId, list);
    } else {
      parentRegions.push(r);
    }
  }
  // V102 §5.1 — on a wrap-bridge row, annotations come from two plasmid
  // ranges shown in ONE row: the real end [lineStart, seqLength) in
  // columns [0, wrapAt), and the plasmid start [0, wrapWidthChars) in
  // columns [wrapAt, lineLen). Each range gets an INDEPENDENT stack so a
  // feature that lives only at the plasmid start (e.g. MCS) — which never
  // overlaps the real range — still renders on the wrap-half. Replaces
  // the old per-real-region `wrapSegmentInfo` hack that missed those.
  const hasWrap = wrapsOrigin === true
    && Number.isFinite(wrapAt) && wrapAt > 0
    && Number.isFinite(seqLength) && seqLength > 0
    && wrapAt < lineLen;
  const wrapWidthChars = hasWrap ? lineLen - wrapAt : 0;
  const realLineEnd = hasWrap ? Math.min(lineEnd, seqLength) : lineEnd;
  const stack = stackAnnotations(parentRegions, lineStart, realLineEnd);
  const wrapStack = hasWrap ? stackAnnotations(parentRegions, 0, wrapWidthChars) : null;
  // V132 — an origin-crossing feature renders in BOTH the real stack
  // (cols [0, wrapAt)) and the wrap stack (cols [wrapAt, lineLen)); near
  // the ▶1 divider both halves clamp their full label to the seam and
  // overlap («скомкано»). Pick ONE half (the wider visible one) to carry
  // the label; the other keeps rect/glyph/chevron but drops text + leader.
  // Features visible in only one half aren't in the map → labelled as usual.
  const labelOnHalf = new Map();
  if (hasWrap) {
    for (const region of parentRegions) {
      const realVis = Math.max(0, Math.min(region.end, realLineEnd) - Math.max(region.start, lineStart));
      const wrapVis = Math.max(0, Math.min(region.end, wrapWidthChars) - Math.max(region.start, 0));
      if (realVis > 0 && wrapVis > 0) {
        labelOnHalf.set(regionKey(region), realVis >= wrapVis ? "real" : "wrap");
      }
    }
  }
  if (stack.rows.length === 0 && stack.overflowCount === 0
    && (!wrapStack || wrapStack.rows.length === 0)) return null;

  // Reserve constant vertical space at the bottom of every annotation
  // SVG for two things, regardless of whether the current line uses
  // them or not:
  //
  //   LEADER_RESERVED — room for leader-line labels of short features
  //   (label rendered BELOW the rect via a downward tick + external
  //   text). Leaders are line-local — some lines have them, some
  //   don't. We used to reserve this space CONDITIONALLY (only when
  //   any region on this particular line used a leader), which made
  //   the gap between the bottom-most annotation row and the DNA
  //   strand visually JUMP between lines: lines with a short feature
  //   → ~30 px gap below the broad CDS bar; lines with only the
  //   broad CDS → ~5 px gap. Biolog read this as "lacZα то прилипает
  //   to sequence, то поднимается" (visual review 04.05.2026
  //   evening on pBluescript II KS+).
  //
  //   STRAND_GAP — 2-3 mm breathing room before DNA letters
  //   (constant since the previous round).
  //
  // Total bottom reserve is always LEADER_RESERVED + STRAND_GAP, so
  // every line with the same row count has IDENTICAL total height.
  // The longest feature (lacZα / AmpR / etc) — pushed to the bottom
  // row by the post-pack length-asc reorder in lib/annotation-stacking
  // — therefore sits at a CONSISTENT distance above the DNA strand
  // across the whole plasmid. The trade-off is ~25 px of unused
  // vertical space on lines without any short / leader-using
  // features; that's fine, predictable layout > tightest packing.
  // Was `LEADER_LINE_LENGTH_PX + LABEL_FONT_SIZE + 2` = 19, computed as
  // "leader length + full label cap-to-baseline-to-descender height".
  // That double-counted: the label's baseline sits at
  // `ROW_HEIGHT + LEADER_LINE_LENGTH_PX` (so 8 px below the rect with
  // current values) and the visible descender ends ~2 px below the
  // baseline. The full LABEL_FONT_SIZE (9) was accounted for as if the
  // label rendered ABOVE the baseline, leaving ~9 px of empty space
  // between the label's visible bottom and the DNA strand. Biolog
  // feedback 03.05.2026 evening: «приблизить ДНК последовательность к
  // надписи». New formula = leader length + 2 px descender + 2 px pad
  // = 12 px below the rect — covers the label's visible extent with a
  // hairline buffer, removes the phantom 9 px gap.
  const LEADER_RESERVED = LEADER_LINE_LENGTH_PX + 4;
  // 1 px breathing room before DNA letters. Combined with the tightened
  // LEADER_RESERVED, the leader-label now sits ~3 px above the DNA
  // strand instead of ~12.
  const STRAND_GAP = 1;
  const rowsCount = Math.max(stack.rows.length, wrapStack ? wrapStack.rows.length : 0);
  const totalHeight =
    rowsCount * (ROW_HEIGHT + ROW_GAP)
    + (stack.overflowCount > 0 ? ROW_HEIGHT : 0)
    + LEADER_RESERVED
    + STRAND_GAP;
  const widthPx = (labelChars + lineLen) * charPx;

  return (
    <svg
      data-testid="sequence-view-annotations"
      data-line-start={lineStart}
      data-row-count={rowsCount}
      data-overflow-count={stack.overflowCount}
      width={widthPx}
      height={totalHeight}
      // 4 px breathing room from the DNA strand above (DNA-first layout
      // 03.05.2026 evening). Annotation rect now sits BELOW DNA — without
      // this margin the rect's top edge would touch the DNA descenders.
      // userSelect:none — feature labels are decorative; drag-to-select
      // on strands/AA must skip annotation names (biolog: «названия
      // аннотации тоже попадают в выделение»).
      style={{
        display: "block",
        overflow: "visible",
        marginTop: 4,
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {stack.rows.map((row, rowIdx) =>
        row.map((region) => {
          const visStart = Math.max(region.start, lineStart);
          const visEnd = Math.min(region.end, lineEnd);
          const visLen = Math.max(0, visEnd - visStart);
          if (visLen === 0) return null;

          const xLeft = (labelChars + (visStart - lineStart)) * charPx;
          const widthRect = visLen * charPx;
          const yTop = rowIdx * (ROW_HEIGHT + ROW_GAP);

          // Sprint M-X.1 K4 — predicted vs confident rendering split.
          // Predicted regions (predicted-detection.js K2 + consumer
          // merge K3) render unfilled+dashed with italic + tilde-prefixed
          // labels per pLannotate convention (DEC-PRED-05). Confident
          // regions keep the existing solid+darkened look.
          const isPredicted = region.predicted === true;
          // V181 / UX-2 — is this the region selected elsewhere (map / inspector)?
          const isSelected = selectedRegionId != null && region.id != null
            && region.id === selectedRegionId;
          const baseColor = ensureColor(region.color);
          // Bug-rush #4 (04.05.2026 evening, second take): biolog
          // «фичи должны быть именно более прозрачные а не другого
          // цвета». Drop the darken/saturation tweaks entirely —
          // fill stays the palette base, fillOpacity controls
          // perceived «paleness» so the colour family across
          // LinearFeatureBar / PlasmidMiniMap / AnnotationTrack
          // stays in lock-step (single palette source of truth).
          // UX-4 — a confirmed but INCOMPLETE feature (a fragment of its
          // reference: `_part_` name / coverage<95% / partial flag) renders
          // pLannotate-style: white fill + coloured outline, so a truncated
          // AmpR reads as «обрезок», not a whole gene. Distinct from predicted
          // (dashed) and selected (accent).
          const isFragment = !isPredicted && isFragmentFeature(region);
          const fill = isPredicted ? 'transparent' : (isFragment ? 'var(--surface-1, #fff)' : baseColor);
          const rectFillOpacity = (isPredicted || isFragment) ? 1 : 0.55;
          const rectStroke = isSelected
            ? 'var(--accent-500, #f59e0b)'
            : ((isPredicted || isFragment) ? baseColor : 'var(--text-secondary, #3A2F1F)');
          const rectStrokeWidth = isSelected ? 1.8 : (isPredicted ? 1 : (isFragment ? 1.1 : 0.6));
          const rectStrokeDash = isPredicted ? '3,2' : undefined;
          const baseName = region.name || "feature";
          const labelText =
            ((region.end - region.start) > 12 && !baseName.includes("_part_"))
              ? `${baseName} (${region.end - region.start})`
              : baseName;
          // Tilde-prefixed italic label for predicted regions
          // (DEC-PRED-05 / pLannotate convention). Confident regions
          // keep their plain label.
          const displayLabel = isPredicted ? `~${labelText}` : labelText;
          const labelFontStyle = isPredicted ? "italic" : "normal";
          const labelChWidth = labelLengthChars(region.name, region);
          // Convert label char width to px-equivalent for fit comparison.
          const labelPx = labelChWidth * charPx;
          const fitsInside = labelPx <= widthRect - 4;
          const tooNarrow = visLen < SHORT_VISIBLE_THRESHOLD;
          // V132 — origin-crossing feature: drop this (narrower) half's label
          // when it was assigned to the other half. Rect/glyph/chevron stay.
          const labelSuppressed = hasWrap && labelOnHalf.get(regionKey(region)) === "wrap";
          const showLabelInside = fitsInside && !tooNarrow && !labelSuppressed;
          const showLeader = !fitsInside && !tooNarrow && !labelSuppressed;
          const strand = region.strand === -1 ? -1 : 1;
          const startsHere = region.start >= lineStart;
          const endsHere = region.end <= lineEnd;

          // Right-edge chevron for strand=+1, left-edge for strand=-1, drawn
          // ONLY on the line that contains the feature's far end. Continuation
          // lines render flat caps so multi-line features read as one.
          const drawChevron =
            (strand === 1 && endsHere) || (strand === -1 && startsHere);

          // Drag-handle overlay state — when this region is being
          // dragged, render a translucent live-preview rect at the
          // NEW coords (bottom orange outline). Original rect stays
          // dim (opacity 0.4) so biolog sees both before/after.
          const isBeingDragged = region.id && draggedAnnotationId === region.id;
          const showLeftHandle = startsHere && typeof onPointerDownEdge === 'function';
          const showRightHandle = endsHere && typeof onPointerDownEdge === 'function';
          // Bug-rush #9: 8 px wide so it's easier to grab on a
          // touchpad. Placed INWARD from the rect's edge (was
          // centered on the boundary), so adjacent features at a
          // shared seam don't end up with overlapping hitboxes —
          // biolog: «на стыке фичей можно схватить только одну
          // фичу и тянуть, вторую не получается».
          const HANDLE_WIDTH = 8;
          const isHoverLeft = hover && hover.id === region.id && hover.edge === 'left';
          const isHoverRight = hover && hover.id === region.id && hover.edge === 'right';

          // Live preview rect: while dragging, project the moving
          // edge onto the current line and draw a faint accent outline
          // showing where the new region would be after pointerup.
          let previewRect = null;
          if (
            isBeingDragged
            && Number.isFinite(draggedCurrentCoord)
            && draggedEdge === 'left'
          ) {
            const newStart = draggedCurrentCoord;
            const fromAbs = Math.max(newStart, lineStart);
            const toAbs = Math.min(region.end, lineEnd);
            if (toAbs > fromAbs) {
              previewRect = {
                x: (fromAbs - lineStart) * charPx, // relative to <g> translate
                width: (toAbs - fromAbs) * charPx,
              };
            }
          } else if (
            isBeingDragged
            && Number.isFinite(draggedCurrentCoord)
            && draggedEdge === 'right'
          ) {
            const newEnd = draggedCurrentCoord;
            const fromAbs = Math.max(region.start, lineStart);
            const toAbs = Math.min(newEnd, lineEnd);
            if (toAbs > fromAbs) {
              previewRect = {
                x: (fromAbs - lineStart) * charPx,
                width: (toAbs - fromAbs) * charPx,
              };
            }
          }
          // Convert the relative offset into the SAME `<g>`'s
          // local coords by subtracting the rect's xLeft origin
          // (the <g> is translated by xLeft already).
          if (previewRect) {
            previewRect.x = previewRect.x - (visStart - lineStart) * charPx;
          }

          // V102 §5.1 — the wrap-half is now rendered by a SEPARATE
          // wrap-stack map below (not a per-real-region segment), so this
          // real-segment render only paints the real half + its own label.

          // «Вариант A» — a gene/CDS that has intron children renders as exon
          // blocks + dashed intron connectors (GeneExonRects) instead of one
          // solid rect; the intron is a `detail` under the gene (3-level model).
          const geneIntronKids = (detailsByParent.get(region.id) || []).filter(
            (k) => k && k.type === 'intron',
          );

          return (
            <Fragment key={`${region.id || region.start + ":" + region.end}-r${rowIdx}`}>
            <g
              data-testid="sequence-view-annotation"
              data-region-id={region.id || ""}
              data-region-name={region.name || ""}
              data-region-row={rowIdx}
              data-region-line-start={lineStart}
              // data-region-start / -end carry the feature's absolute
              // sequence positions so the SequenceView root can pick
              // them up on pointerdown without needing a JS lookup
              // by id (biolog 04.05.2026 evening: «при нажатии на
              // фичу в вивере должна выделятся вся область фичи»).
              data-region-start={region.start}
              data-region-end={region.end}
              data-region-type={region.type || ""}
              data-region-strand={region.strand === -1 ? -1 : 1}
              data-selected={isSelected ? "true" : undefined}
              data-fragment={isFragment ? "true" : undefined}
              data-predicted={isPredicted ? "true" : undefined}
              data-region-source={region.source || undefined}
              data-dragged={isBeingDragged ? "true" : undefined}
              transform={`translate(${xLeft}, ${yTop})`}
              style={{ cursor: "pointer", opacity: isBeingDragged ? 0.4 : 1 }}
            >
              {/* gap-research — qualifier hover tooltip in the SEQUENCE pane (was
                  only on the maps' hover card). First child of the feature <g> so
                  it covers both the exon-split and plain branches below. */}
              <title>{buildAnnotationTitle(region)}</title>
              {geneIntronKids.length > 0 ? (
                <GeneExonRects
                  region={region}
                  intronKids={geneIntronKids}
                  charPx={charPx}
                  lineStart={lineStart}
                  lineEnd={lineEnd}
                  fill={fill}
                  fillOpacity={rectFillOpacity}
                  stroke={rectStroke}
                  strokeWidth={rectStrokeWidth}
                  strokeDash={rectStrokeDash}
                  onAnnotationClick={onAnnotationClick}
                  onAnnotationFeatureDoubleClick={onAnnotationFeatureDoubleClick}
                />
              ) : (
              <rect
                data-region-id={region.id || ''}
                data-region-predicted={isPredicted ? 'true' : undefined}
                x={0}
                y={0}
                // Round-9/11 (06.05.2026 biolog: «рядом стоящие фичи
                // не имеющие перекрытия объединяются одной рамкой»):
                // adjacent features packed on the same stacking row
                // used to render with strokes touching, reading as a
                // single bounded frame. Subtract 2 px from the right
                // edge so the gap is visible at 1× scale on a
                // typical monitor.
                width={Math.max(1, widthRect - 2)}
                height={ROW_HEIGHT}
                rx={2}
                fill={fill}
                fillOpacity={rectFillOpacity}
                // Confident: theme-aware stroke (var(--text-secondary)),
                // 0.6 px (biolog visual review M-B.3 polish). Predicted:
                // feature-coloured stroke, 1 px, dashed pattern (3,2)
                // per DEC-PRED-05 / pLannotate convention.
                stroke={rectStroke}
                strokeWidth={rectStrokeWidth}
                strokeDasharray={rectStrokeDash}
                onClick={(e) => {
                  if (typeof onAnnotationClick !== 'function') return;
                  e.stopPropagation();
                  onAnnotationClick(region);
                }}
                onDoubleClick={(e) => {
                  if (typeof onAnnotationFeatureDoubleClick !== 'function') return;
                  e.stopPropagation();
                  e.preventDefault();
                  onAnnotationFeatureDoubleClick(region);
                }}
              />
              )}
              {drawChevron ? (
                <path
                  d={chevronPath(strand, strand === -1 ? 0 : widthRect, 0, ROW_HEIGHT)}
                  fill={fill}
                  fillOpacity={rectFillOpacity}
                  stroke={rectStroke}
                  strokeWidth={rectStrokeWidth}
                  strokeDasharray={rectStrokeDash}
                  onClick={(e) => {
                    if (typeof onAnnotationClick !== 'function') return;
                    e.stopPropagation();
                    onAnnotationClick(region);
                  }}
                  onDoubleClick={(e) => {
                    if (typeof onAnnotationFeatureDoubleClick !== 'function') return;
                    e.stopPropagation();
                    e.preventDefault();
                    onAnnotationFeatureDoubleClick(region);
                  }}
                />
              ) : null}
              {/* Sprint M-X.3 follow-up — Variant A sub-feature
                  overlays. Biolog «нужно так чтобы однозначно было
                  видно что это сплит фича... давай А реализуем».
                  Children with `parentId === region.id` render as
                  inset rects ON TOP of the parent rect (sharing its
                  row), at smaller height so the parent's colour
                  shows around them. Labels render after, so the
                  parent name still reads through.

                  Each child uses its OWN palette colour (so biolog
                  can mark exon/intron/signal_peptide visually
                  distinct from the parent CDS). Inset 3 px top +
                  bottom keeps a 1.5 px frame of parent colour at
                  every edge. */}
              <SubFeatureOverlay
                region={region}
                detailsByParent={detailsByParent}
                charPx={charPx}
                lineStart={lineStart}
                lineEnd={lineEnd}
                onAnnotationClick={onAnnotationClick}
                onAnnotationFeatureDoubleClick={onAnnotationFeatureDoubleClick}
              />
              {/* Sprint M-X.3 follow-up — SBOL glyph + label as one
                  centred unit. Biolog «глифы давай у названия, как
                  будто бы так будет лучше» — pre-fix the glyph was
                  pinned at fixed x=2 and the label was centred
                  separately, so on a wide rect the two ended up
                  visually disconnected. Now we estimate the label
                  text width, pack glyph + gap + text into one
                  «content» strip, centre that strip in the rect
                  (with a 2 px floor so a narrow rect still leaves
                  the glyph a slot), and anchor the text at the
                  glyph's right edge.

                  Reverse-strand features (`strand === -1`) get a
                  scale(-1, 1) flip so the SBOL directional glyphs
                  (CDS arrow, promoter L-arrow, terminator T) point
                  AWAY from the start codon side. Translate-then-
                  scale puts the post-flip rect at the same x as
                  the unflipped one. */}
              {(() => {
                const showGlyph = widthRect >= GLYPH_MIN_PX;
                if (!showGlyph && !showLabelInside) return null;
                const APPROX_CHAR_PX = 5.5; // sans-serif at fontSize 9
                const GLYPH_GAP = 3;
                const labelTextWidth = showLabelInside
                  ? displayLabel.length * APPROX_CHAR_PX
                  : 0;
                const contentWidth = (showGlyph ? GLYPH_SIZE : 0)
                  + (showGlyph && showLabelInside ? GLYPH_GAP : 0)
                  + labelTextWidth;
                const contentLeft = Math.max(2, (widthRect - contentWidth) / 2);
                const glyphY = (ROW_HEIGHT - GLYPH_SIZE) / 2;
                const isReverse = region.strand === -1;
                const glyphX = contentLeft;
                const labelStartX = showGlyph
                  ? glyphX + GLYPH_SIZE + GLYPH_GAP
                  : contentLeft;
                const glyphTransform = isReverse
                  ? `translate(${glyphX + GLYPH_SIZE}, ${glyphY}) scale(-1, 1)`
                  : `translate(${glyphX}, ${glyphY})`;
                return (
                  <>
                    {showGlyph ? (
                      <g
                        data-testid="annotation-feature-glyph"
                        data-glyph-type={region.type || ''}
                        data-glyph-strand={isReverse ? '-1' : '1'}
                        transform={glyphTransform}
                        style={{ pointerEvents: 'none' }}
                      >
                        <SBOLIcon
                          type={region.type}
                          size={GLYPH_SIZE}
                          color={isPredicted ? baseColor : 'var(--text-primary, #1c1917)'}
                        />
                      </g>
                    ) : null}
                    {showLabelInside ? (
                      <LabelText
                        x={labelStartX}
                        region={region}
                        displayLabel={displayLabel}
                        isPredicted={isPredicted}
                        labelFontStyle={labelFontStyle}
                        lineStart={lineStart}
                        onAnnotationDoubleClick={onAnnotationDoubleClick}
                      />
                    ) : null}
                  </>
                );
              })()}
              {previewRect ? (
                <>
                  {/* Bug-rush #11 (04.05.2026 evening): bump the
                      preview rect's saturation — biolog: «когда тянешь
                      фичу и растягиваешь или сжимаешь то не видно
                      докуда, слишком блёкло». Higher fill alpha + a
                      solid (not dashed) outline + a 2 px solid bar at
                      the moving edge so the new boundary jumps out. */}
                  <rect
                    data-testid="sequence-view-annotation-preview"
                    data-region-edge={draggedEdge}
                    x={previewRect.x}
                    y={0}
                    width={previewRect.width}
                    height={ROW_HEIGHT}
                    rx={2}
                    fill="rgba(249, 115, 22, 0.42)"
                    stroke="var(--accent-500, #f97316)"
                    strokeWidth={1.4}
                    style={{ pointerEvents: "none" }}
                  />
                  {/* Edge marker — solid orange bar at the moving
                      coord so the position is unmistakable. */}
                  <rect
                    data-testid="sequence-view-annotation-preview-edge"
                    data-region-edge={draggedEdge}
                    x={draggedEdge === 'left' ? previewRect.x : previewRect.x + previewRect.width - 2}
                    y={-2}
                    width={2}
                    height={ROW_HEIGHT + 4}
                    fill="var(--accent-500, #f97316)"
                    style={{ pointerEvents: "none" }}
                  />
                </>
              ) : null}
              {showLeftHandle ? (
                <>
                  <rect
                    data-testid="sequence-view-annotation-edge"
                    data-region-edge="left"
                    data-region-id={region.id || ""}
                    data-region-line-start={lineStart}
                    x={0}
                    y={-2}
                    width={HANDLE_WIDTH}
                    height={ROW_HEIGHT + 4}
                    fill="transparent"
                    style={{ cursor: "ew-resize", pointerEvents: "all" }}
                    onPointerDown={(e) => onPointerDownEdge(e, region.id, 'left', region)}
                    onPointerEnter={() => setHover({ id: region.id, edge: 'left' })}
                    onPointerLeave={() => setHover(null)}
                  />
                  {isHoverLeft ? (
                    <rect
                      data-testid="sequence-view-annotation-edge-indicator"
                      data-region-edge="left"
                      x={0}
                      y={-2}
                      width={2.5}
                      height={ROW_HEIGHT + 4}
                      fill="var(--accent-500, #f97316)"
                      style={{ pointerEvents: "none" }}
                    />
                  ) : null}
                </>
              ) : null}
              {showRightHandle ? (
                <>
                  <rect
                    data-testid="sequence-view-annotation-edge"
                    data-region-edge="right"
                    data-region-id={region.id || ""}
                    data-region-line-start={lineStart}
                    x={widthRect - HANDLE_WIDTH}
                    y={-2}
                    width={HANDLE_WIDTH}
                    height={ROW_HEIGHT + 4}
                    fill="transparent"
                    style={{ cursor: "ew-resize", pointerEvents: "all" }}
                    onPointerDown={(e) => onPointerDownEdge(e, region.id, 'right', region)}
                    onPointerEnter={() => setHover({ id: region.id, edge: 'right' })}
                    onPointerLeave={() => setHover(null)}
                  />
                  {isHoverRight ? (
                    <rect
                      data-testid="sequence-view-annotation-edge-indicator"
                      data-region-edge="right"
                      x={widthRect - 2.5}
                      y={-2}
                      width={2.5}
                      height={ROW_HEIGHT + 4}
                      fill="var(--accent-500, #f97316)"
                      style={{ pointerEvents: "none" }}
                    />
                  ) : null}
                </>
              ) : null}
              {showLeader ? (
                <g data-testid="sequence-view-annotation-leader" data-label-mode="leader">
                  <line
                    x1={widthRect / 2}
                    x2={widthRect / 2}
                    y1={ROW_HEIGHT}
                    y2={ROW_HEIGHT + LEADER_LINE_LENGTH_PX - 4}
                    stroke="#3A2F1F"
                    strokeOpacity={0.6}
                    strokeWidth={0.5}
                  />
                  <text
                    data-testid="sequence-view-annotation-label"
                    data-label-mode="leader"
                    data-label-feature={region.name || ""}
                    data-label-predicted={isPredicted ? "true" : undefined}
                    x={widthRect / 2 + CHEVRON_PAD}
                    y={ROW_HEIGHT + LEADER_LINE_LENGTH_PX}
                    textAnchor="start"
                    fontSize={LABEL_FONT_SIZE}
                    fontStyle={labelFontStyle}
                    fill="var(--text-secondary, #4b5563)"
                    style={{ fontFamily: "inherit", fontStyle: labelFontStyle, cursor: "text" }}
                    onDoubleClick={(e) => {
                      if (typeof onAnnotationDoubleClick !== 'function') return;
                      e.stopPropagation();
                      e.preventDefault();
                      onAnnotationDoubleClick(region);
                    }}
                  >
                    {displayLabel}
                  </text>
                </g>
              ) : null}
            </g>
            {/* V102 §5.1 — the wrap-half is rendered by the dedicated
                wrap-stack map below (was a per-real-region segment). */}
            </Fragment>
          );
        }),
      )}

      {/* V102 §5.1 — wrap-half stack (extracted → AnnotationWrapRows). */}
      <AnnotationWrapRows
        wrapStack={wrapStack}
        wrapAt={wrapAt}
        wrapWidthChars={wrapWidthChars}
        labelChars={labelChars}
        charPx={charPx}
        lineStart={lineStart}
        labelOnHalf={labelOnHalf}
        onAnnotationClick={onAnnotationClick}
        onAnnotationFeatureDoubleClick={onAnnotationFeatureDoubleClick}
      />

      {stack.overflowCount > 0 ? (
        <g
          data-testid="sequence-view-annotation-overflow"
          data-overflow-count={stack.overflowCount}
          transform={`translate(${labelChars * charPx}, ${rowsCount * (ROW_HEIGHT + ROW_GAP)})`}
        >
          <rect
            x={0}
            y={0}
            width={Math.min(widthPx - labelChars * charPx, 80)}
            height={ROW_HEIGHT}
            rx={ROW_HEIGHT / 2}
            fill="#fef3c7"
            stroke="#f59e0b"
            strokeWidth={0.5}
          />
          <text
            x={6}
            y={ROW_HEIGHT - 4}
            fontSize={LABEL_FONT_SIZE}
            fill="#92400e"
            style={{ fontFamily: "inherit" }}
          >
            {`+${stack.overflowCount} more`}
          </text>
        </g>
      ) : null}
    </svg>
  );
}

// Memo so unrelated parent state churn (settings popover toggle,
// theme switch, sticky header recompute, etc.) doesn't trigger a
// rerender on lines whose annotation inputs haven't shifted. The
// orchestrator passes stable refs (regions / labelChars / charPx /
// lineStart / lineLen) via useMemo; default shallow compare is
// sufficient.
const MemoAnnotationTrack = memo(AnnotationTrack);
export default MemoAnnotationTrack;
export { MAX_VISIBLE_ROWS };

