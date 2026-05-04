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

import { memo, useState } from "react";
import { stackAnnotations, MAX_VISIBLE_ROWS } from "../lib/annotation-stacking.js";

const ROW_HEIGHT = 14;
const ROW_GAP = 2;
const LABEL_FONT_SIZE = 9;
const CHEVRON_PAD = 2;
const SHORT_VISIBLE_THRESHOLD = 4; // chars
// Shortened from 14 → 8 px (biolog visual review 03.05.2026 evening,
// pBR322 lac operator/promoter pair: «ещё есть куда приближать»). The
// leader still reads clearly as a tick connecting the rect to its
// label, but the constant LEADER_RESERVED below the rect — required for
// inter-line consistency so longest-feature row stays at a stable
// distance from DNA — drops from 25 to 19 px. Combined with
// STRAND_GAP 5 → 1, the annotation→DNA gap shrinks ~8 px without
// sacrificing the constant-height invariant (LEADER_RESERVED is still
// reserved on every line regardless of whether THIS line uses a leader,
// so AmpR / lacZα don't jump line-to-line).
const LEADER_LINE_LENGTH_PX = 8;

/** Approximate the on-screen width of a label string in characters. */
function labelLengthChars(name, region) {
  if (!name) return 0;
  const span = region.end - region.start;
  // Append "(span)" for features wider than 12 nt — matches SnapGene.
  return span > 12 ? `${name} (${span})`.length : name.length;
}

function chevronPath(strand, x, y, height) {
  const tip = strand === -1 ? x : x; // overridden by caller's translate
  const half = height / 2;
  if (strand === -1) {
    return `M${tip + 6},${y} L${tip},${y + half} L${tip + 6},${y + height}`;
  }
  return `M${tip - 6},${y} L${tip},${y + half} L${tip - 6},${y + height}`;
}

function ensureColor(color) {
  if (typeof color === "string" && color.startsWith("#")) return color;
  return "#9ca3af"; // misc_feature fallback
}

/**
 * Darken a `#rrggbb` colour by mixing it toward black at `ratio`
 * (0 = unchanged, 1 = black). Used on the annotation rect so feature
 * colours read as muted "tonal cards" against the dark-theme
 * background instead of glaring saturated bars. Biolog visual review
 * 03.05.2026 evening: исходные цвета палитры (выбраны под светлую
 * тему) на тёмной теме выглядели слишком светлыми; первая попытка
 * lighten(+30 %) сделала их ещё светлее — биолог: «давай мы сделаем
 * так чтобы сами фичи были на пол тона тон темнее, они слишком
 * светлые для темной темы». Текущее значение 0.25 = ~четверть тона
 * к чёрному.
 */
function darkenColor(hex, ratio) {
  if (typeof hex !== "string" || hex.length !== 7 || hex[0] !== "#") return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return hex;
  const dr = Math.round(r * (1 - ratio));
  const dg = Math.round(g * (1 - ratio));
  const db = Math.round(b * (1 - ratio));
  return `#${dr.toString(16).padStart(2, "0")}${dg.toString(16).padStart(2, "0")}${db.toString(16).padStart(2, "0")}`;
}

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
  // eslint-disable-next-line no-unused-vars
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
  const stack = stackAnnotations(regions, lineStart, lineEnd);
  if (stack.rows.length === 0 && stack.overflowCount === 0) return null;

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
  const rowsCount = stack.rows.length;
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
          const baseColor = ensureColor(region.color);
          // Bug-rush #4 (04.05.2026 evening, second take): biolog
          // «фичи должны быть именно более прозрачные а не другого
          // цвета». Drop the darken/saturation tweaks entirely —
          // fill stays the palette base, fillOpacity controls
          // perceived «paleness» so the colour family across
          // LinearFeatureBar / PlasmidMiniMap / AnnotationTrack
          // stays in lock-step (single palette source of truth).
          const fill = isPredicted ? 'transparent' : baseColor;
          const rectFillOpacity = isPredicted ? 1 : 0.55;
          const rectStroke = isPredicted
            ? baseColor
            : 'var(--text-secondary, #3A2F1F)';
          const rectStrokeWidth = isPredicted ? 1 : 0.6;
          const rectStrokeDash = isPredicted ? '3,2' : undefined;
          const baseName = region.name || "feature";
          const labelText =
            (region.end - region.start) > 12
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
          const showLabelInside = fitsInside && !tooNarrow;
          const showLeader = !fitsInside && !tooNarrow;
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

          return (
            <g
              key={`${region.id || region.start + ":" + region.end}-r${rowIdx}`}
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
              data-predicted={isPredicted ? "true" : undefined}
              data-region-source={region.source || undefined}
              data-dragged={isBeingDragged ? "true" : undefined}
              transform={`translate(${xLeft}, ${yTop})`}
              style={{ cursor: "pointer", opacity: isBeingDragged ? 0.4 : 1 }}
            >
              <rect
                x={0}
                y={0}
                width={widthRect}
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
                onDoubleClick={(e) => {
                  if (typeof onAnnotationFeatureDoubleClick !== 'function') return;
                  e.stopPropagation();
                  e.preventDefault();
                  onAnnotationFeatureDoubleClick(region);
                }}
              />
              {drawChevron ? (
                <path
                  d={chevronPath(strand, strand === -1 ? 0 : widthRect, 0, ROW_HEIGHT)}
                  fill={fill}
                  fillOpacity={rectFillOpacity}
                  stroke={rectStroke}
                  strokeWidth={rectStrokeWidth}
                  strokeDasharray={rectStrokeDash}
                  onDoubleClick={(e) => {
                    if (typeof onAnnotationFeatureDoubleClick !== 'function') return;
                    e.stopPropagation();
                    e.preventDefault();
                    onAnnotationFeatureDoubleClick(region);
                  }}
                />
              ) : null}
              {showLabelInside ? (
                <text
                  data-testid="sequence-view-annotation-label"
                  data-label-mode="inside"
                  data-label-feature={region.name || ""}
                  data-label-predicted={isPredicted ? "true" : undefined}
                  x={widthRect / 2}
                  y={ROW_HEIGHT / 2 + LABEL_FONT_SIZE / 2 - 1}
                  textAnchor="middle"
                  fontSize={LABEL_FONT_SIZE}
                  fontStyle={labelFontStyle}
                  // Halo tuned across iterations:
                  //   2.5 px solid + bold → биолог: «слишком пухлый»
                  //   0.7 px translucent → «всё равно плохо читаются»
                  //   1.5 px solid black + default weight (current) —
                  //   плотный читаемый контур без эффекта «жирного
                  //   шрифта». ≈0.75 px видимый outline после того
                  //   как белый fill закрывает центр.
                  fill="#ffffff"
                  stroke="#000000"
                  strokeWidth={1.5}
                  // pointerEvents: 'auto' — bug-rush #3: dblclick on
                  // the label triggers rename (different from dblclick
                  // on the rect, which opens the Annotator).
                  style={{
                    pointerEvents: "auto",
                    cursor: "text",
                    fontFamily: "inherit",
                    fontStyle: labelFontStyle,
                    paintOrder: "stroke fill",
                  }}
                  onDoubleClick={(e) => {
                    if (typeof onAnnotationDoubleClick !== 'function') return;
                    e.stopPropagation();
                    e.preventDefault();
                    // Bug-rush #7: pass the line's lineStart so the
                    // orchestrator can position the rename input on
                    // the same row where biolog actually clicked,
                    // not just the first line of a multi-line feature.
                    onAnnotationDoubleClick(region, lineStart);
                  }}
                >
                  {displayLabel}
                </text>
              ) : null}
              {previewRect ? (
                <rect
                  data-testid="sequence-view-annotation-preview"
                  data-region-edge={draggedEdge}
                  x={previewRect.x}
                  y={0}
                  width={previewRect.width}
                  height={ROW_HEIGHT}
                  rx={2}
                  fill="rgba(249, 115, 22, 0.18)"
                  stroke="var(--accent-500, #f97316)"
                  strokeWidth={1}
                  strokeDasharray="3,2"
                  style={{ pointerEvents: "none" }}
                />
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
          );
        }),
      )}

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
