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
      // SEQ-VIS-1 — a feature name is interface text, not DNA. It inherited the
      // sequence pane's mono font and was painted white with a 1.5 px black
      // stroke; at 1280x720 / DPR 1 that halo is thicker than the strokes of a
      // 9 px glyph, so the name reads as ripple. The theme's own text colour
      // over a separator the width of the canvas background lifts the letters
      // off the coloured rect without becoming an outline of its own, and it
      // follows light/dark instead of assuming a white page.
      fill="var(--text-primary)"
      stroke="var(--sequence-canvas-bg)"
      strokeWidth={0.5}
      style={{
        pointerEvents: 'auto',
        cursor: 'text',
        fontFamily: 'var(--font-ui)',
        fontWeight: 500,
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
