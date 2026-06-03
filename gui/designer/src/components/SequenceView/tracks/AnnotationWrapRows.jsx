/**
 * AnnotationWrapRows — V102 §5.1 wrap-half stack, extracted verbatim from
 * AnnotationTrack.jsx (decomp P1; body byte-for-byte unchanged).
 *
 * The plasmid START [0, wrapWidthChars) is shown again in columns
 * [wrapAt, lineLen) and gets its OWN independent stack, so a feature living
 * only at the start (e.g. an MCS) — never intersecting the real range — still
 * renders. Origin-crossing features stack independently here and in the real
 * stack (rare; acceptable). Wrap segment = rect + chevron + inside-label
 * (sub-features / handles / rename stay on the real half).
 */
import { ROW_HEIGHT, ROW_GAP, SHORT_VISIBLE_THRESHOLD } from './annotation-track-constants.js';
import { ensureColor } from './annotation-colors.js';
import { chevronPath } from './annotation-geometry.js';
import { regionKey, labelLengthChars } from './annotation-layout.js';
import { LabelText } from './AnnotationLabel.jsx';

export function AnnotationWrapRows({
  wrapStack,
  wrapAt,
  wrapWidthChars,
  labelChars,
  charPx,
  lineStart,
  labelOnHalf,
  onAnnotationClick,
  onAnnotationFeatureDoubleClick,
}) {
  if (!wrapStack) return null;
  return wrapStack.rows.map((row, rowIdx) =>
    row.map((region) => {
      const wVisStart = Math.max(region.start, 0);
      const wVisEnd = Math.min(region.end, wrapWidthChars);
      const wVisLen = Math.max(0, wVisEnd - wVisStart);
      if (wVisLen === 0) return null;

      const xLeft = (labelChars + wrapAt + wVisStart) * charPx;
      const widthRect = wVisLen * charPx;
      const yTop = rowIdx * (ROW_HEIGHT + ROW_GAP);

      const isPredicted = region.predicted === true;
      const baseColor = ensureColor(region.color);
      const fill = isPredicted ? "transparent" : baseColor;
      const rectFillOpacity = isPredicted ? 1 : 0.55;
      const rectStroke = isPredicted
        ? baseColor
        : "var(--text-secondary, #3A2F1F)";
      const rectStrokeWidth = isPredicted ? 1 : 0.6;
      const rectStrokeDash = isPredicted ? "3,2" : undefined;
      const baseName = region.name || "feature";
      const labelText =
        (region.end - region.start > 12 && !baseName.includes("_part_"))
          ? `${baseName} (${region.end - region.start})`
          : baseName;
      const displayLabel = isPredicted ? `~${labelText}` : labelText;
      const labelFontStyle = isPredicted ? "italic" : "normal";
      const labelPx = labelLengthChars(region.name, region) * charPx;
      const fitsInside = labelPx <= widthRect - 4;
      const tooNarrow = wVisLen < SHORT_VISIBLE_THRESHOLD;
      // V132 — suppress the wrap-half label when the origin-crossing
      // feature's label was assigned to the (wider) real half.
      const labelSuppressed = labelOnHalf.get(regionKey(region)) === "real";
      const showLabelInside = fitsInside && !tooNarrow && !labelSuppressed;
      const strand = region.strand === -1 ? -1 : 1;
      // Chevron on the wrap segment: +1 strand draws it only when
      // the feature's far end (region.end) lands within the wrap
      // window; -1 strand draws it only when the feature's start
      // is the visible left edge here (mirrors the retired
      // `wrapSegmentInfo.drawChevron` rule).
      const drawChevron =
        (strand === 1 && region.end <= wrapWidthChars) ||
        (strand === -1 && wVisStart === region.start);

      return (
        <g
          key={`${region.id || region.start + ":" + region.end}-w${rowIdx}`}
          data-testid="sequence-view-annotation"
          data-region-segment="wrap"
          data-region-id={region.id || ""}
          data-region-name={region.name || ""}
          data-region-row={rowIdx}
          data-region-start={region.start}
          data-region-end={region.end}
          data-region-type={region.type || ""}
          data-region-strand={strand}
          data-predicted={isPredicted ? "true" : undefined}
          transform={`translate(${xLeft}, ${yTop})`}
          style={{ cursor: "pointer" }}
        >
          <rect
            data-region-id={region.id || ""}
            data-region-predicted={isPredicted ? "true" : undefined}
            x={0}
            y={0}
            width={Math.max(1, widthRect - 2)}
            height={ROW_HEIGHT}
            rx={2}
            fill={fill}
            fillOpacity={rectFillOpacity}
            stroke={rectStroke}
            strokeWidth={rectStrokeWidth}
            strokeDasharray={rectStrokeDash}
            onClick={(e) => {
              if (typeof onAnnotationClick !== "function") return;
              e.stopPropagation();
              onAnnotationClick(region);
            }}
            onDoubleClick={(e) => {
              if (typeof onAnnotationFeatureDoubleClick !== "function") return;
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
            />
          ) : null}
          {showLabelInside ? (
            <LabelText
              x={Math.max(2, (widthRect - labelPx) / 2)}
              region={region}
              displayLabel={displayLabel}
              isPredicted={isPredicted}
              labelFontStyle={labelFontStyle}
              lineStart={lineStart}
            />
          ) : null}
        </g>
      );
    }),
  );
}
