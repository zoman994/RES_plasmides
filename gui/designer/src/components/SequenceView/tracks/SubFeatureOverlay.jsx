/**
 * SubFeatureOverlay — Variant A sub-feature (level:'detail') overlay,
 * extracted verbatim from AnnotationTrack.jsx (decomp P1; body byte-for-byte).
 *
 * Biolog «нужно так чтобы однозначно было видно что это сплит фича... давай А
 * реализуем». Children with `parentId === region.id` render as inset rects ON
 * TOP of the parent rect (sharing its row), at smaller height so the parent's
 * colour shows around them. Rendered INSIDE the parent <g> (local coords).
 */
import { ROW_HEIGHT } from './annotation-track-constants.js';
import { ensureColor } from './annotation-colors.js';

export function SubFeatureOverlay({
  region,
  detailsByParent,
  charPx,
  lineStart,
  lineEnd,
  onAnnotationClick,
  onAnnotationFeatureDoubleClick,
}) {
  // Introns are drawn by GeneExonRects as exon blocks + dashed connectors
  // («вариант A»), so skip them here — other detail children (domains, tags,
  // signal peptides) still render as inset blocks.
  const kids = (detailsByParent.get(region.id) || []).filter((k) => k && k.type !== 'intron');
  if (kids.length === 0) return null;
  const SUB_INSET = 3;
  const subY = SUB_INSET;
  const subH = ROW_HEIGHT - 2 * SUB_INSET;
  // Tiny font for kid labels — they sit inside an 8 px
  // tall rect, so the label has to be smaller than the
  // parent's 9 px LABEL_FONT_SIZE.
  const KID_FONT = 7;
  const KID_CHAR_W = 4; // approx 7 px sans-serif glyph width
  // Parent <g> is translated so local x=0 maps to the
  // parent's visible-on-line LEFT edge, i.e. coord
  // `max(region.start, lineStart)`. Kid local coords
  // must use the same origin or the inset rect lands
  // off-by-the-clipped-prefix on wrapped lines.
  const parentVisStart = Math.max(region.start, lineStart);
  return kids.map((kid) => {
    const kidVisStart = Math.max(kid.start, lineStart);
    const kidVisEnd = Math.min(kid.end, lineEnd);
    const kidVisLen = Math.max(0, kidVisEnd - kidVisStart);
    if (kidVisLen === 0) return null;
    const kidX = (kidVisStart - parentVisStart) * charPx;
    const kidW = kidVisLen * charPx;
    const kidColor = ensureColor(kid.color);
    const kidName = kid.name || kid.type || '';
    // Show kid label when there's enough room for at
    // least a couple of glyphs; truncate to fit.
    const maxKidChars = Math.max(0, Math.floor((kidW - 4) / KID_CHAR_W));
    const kidLabel = (kidName.length > maxKidChars && maxKidChars > 1)
      ? kidName.slice(0, Math.max(1, maxKidChars - 1)) + '…'
      : kidName;
    // Hide the label on very narrow rects — even a
    // single-char name reads like noise below ~18 px
    // of visible width.
    const KID_LABEL_MIN_PX = 18;
    const showKidLabel = kidName.length > 0
      && kidW >= KID_LABEL_MIN_PX
      && maxKidChars >= 2;
    return (
      <g key={`sub-${kid.id}`}>
        <rect
          data-testid="annotation-subfeature-rect"
          data-region-id={kid.id || ''}
          data-region-level="detail"
          data-parent-id={kid.parentId || ''}
          data-region-name={kid.name || ''}
          x={kidX}
          y={subY}
          width={kidW}
          height={subH}
          rx={1.5}
          fill={kidColor}
          fillOpacity={0.85}
          stroke="var(--text-secondary, #3A2F1F)"
          strokeWidth={0.5}
          onClick={(e) => {
            if (typeof onAnnotationClick !== 'function') return;
            e.stopPropagation();
            onAnnotationClick(kid);
          }}
          onDoubleClick={(e) => {
            if (typeof onAnnotationFeatureDoubleClick !== 'function') return;
            e.stopPropagation();
            e.preventDefault();
            onAnnotationFeatureDoubleClick(kid);
          }}
        />
        {showKidLabel ? (
          <text
            data-testid="annotation-subfeature-label"
            data-region-name={kid.name || ''}
            x={kidX + kidW / 2}
            y={subY + subH / 2 + KID_FONT / 2 - 1.5}
            textAnchor="middle"
            fontSize={KID_FONT}
            fill="#ffffff"
            stroke="#000000"
            strokeWidth={1.0}
            style={{
              pointerEvents: 'none',
              userSelect: 'none',
              fontFamily: 'inherit',
              paintOrder: 'stroke fill',
            }}
          >{kidLabel}</text>
        ) : null}
      </g>
    );
  });
}
