/**
 * AnnotationLabel (LabelText) — extracted from AnnotationTrack.jsx
 * (decomp P1, size-budget; body byte-for-byte unchanged).
 *
 * Sprint M-X.3 follow-up — small inline label with the same halo
 * + dblclick-rename hookup the legacy centred render had, but
 * `text-anchor="start"` so the caller can pin the label x to the
 * glyph's right edge (paired centring of glyph + name as one unit).
 */
import { ROW_HEIGHT, LABEL_FONT_SIZE } from './annotation-track-constants.js';

export function LabelText({
  x,
  region,
  displayLabel,
  isPredicted, // eslint-disable-line no-unused-vars -- reserved for future fill tweaks
  labelFontStyle,
  lineStart,
  onAnnotationDoubleClick,
}) {
  return (
    <text
      data-testid="sequence-view-annotation-label"
      data-label-mode="inside"
      data-label-feature={region.name || ''}
      data-label-predicted={isPredicted ? 'true' : undefined}
      x={x}
      y={ROW_HEIGHT / 2 + LABEL_FONT_SIZE / 2 - 1}
      textAnchor="start"
      fontSize={LABEL_FONT_SIZE}
      fontStyle={labelFontStyle}
      fill="#ffffff"
      stroke="#000000"
      strokeWidth={1.5}
      style={{
        pointerEvents: 'auto',
        cursor: 'text',
        fontFamily: 'inherit',
        fontStyle: labelFontStyle,
        paintOrder: 'stroke fill',
      }}
      onDoubleClick={(e) => {
        if (typeof onAnnotationDoubleClick !== 'function') return;
        e.stopPropagation();
        e.preventDefault();
        onAnnotationDoubleClick(region, lineStart);
      }}
    >
      {displayLabel}
    </text>
  );
}
