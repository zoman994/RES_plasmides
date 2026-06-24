/**
 * GeneExonRects — «вариант A» rendering of a gene/CDS that carries introns
 * (Игорь, выбор по макету): the bar is drawn as exon BLOCKS (solid, broken
 * fill) joined by flat DASHED intron connectors, instead of one continuous
 * rect. Rendered INSIDE the parent <g> (local coords, same origin as the rect
 * it replaces). Both the exon blocks and the intron connectors are clickable.
 *
 * Geometry is pure (`exonSegments`); this is a thin SVG renderer. Introns come
 * in as detail children (level:'detail', type:'intron', parentId===region.id),
 * so the intron is a `detail` under the gene — fitting the 3-level model.
 */
import { ROW_HEIGHT } from './annotation-track-constants.js';
import { exonSegments } from './gene-exon-spans.js';

export function GeneExonRects({
  region,
  intronKids,
  charPx,
  lineStart,
  lineEnd,
  fill,
  fillOpacity,
  stroke,
  strokeWidth,
  strokeDash,
  onAnnotationClick,
  onAnnotationFeatureDoubleClick,
}) {
  const visStart = Math.max(region.start, lineStart);
  const visEnd = Math.min(region.end, lineEnd);
  if (!(visEnd > visStart) || charPx <= 0) return null;

  const intronSpans = (intronKids || []).map((k) => [k.start, k.end]);
  const exons = exonSegments(visStart, visEnd, intronSpans);

  const clickHandlers = (target) => ({
    onClick: (e) => {
      if (typeof onAnnotationClick !== 'function') return;
      e.stopPropagation();
      onAnnotationClick(target);
    },
    onDoubleClick: (e) => {
      if (typeof onAnnotationFeatureDoubleClick !== 'function') return;
      e.stopPropagation();
      e.preventDefault();
      onAnnotationFeatureDoubleClick(target);
    },
  });

  const midY = ROW_HEIGHT / 2;

  return (
    <g data-testid="annotation-gene-exons">
      {/* exon blocks — solid, clicking selects the whole gene */}
      {exons.map(([s, e], i) => {
        const x = (s - visStart) * charPx;
        const w = Math.max(1, (e - s) * charPx);
        return (
          <rect
            key={`exon-${i}`}
            data-testid="annotation-exon-rect"
            data-region-id={region.id || ''}
            x={x}
            y={0}
            width={w}
            height={ROW_HEIGHT}
            rx={2}
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={strokeDash}
            {...clickHandlers(region)}
          />
        );
      })}
      {/* intron connectors — flat dashed line in the gap, clicking selects the intron */}
      {(intronKids || []).map((kid) => {
        const ks = Math.max(kid.start, lineStart);
        const ke = Math.min(kid.end, lineEnd);
        if (!(ke > ks)) return null;
        const x1 = (ks - visStart) * charPx;
        const x2 = (ke - visStart) * charPx;
        return (
          <g key={`intron-${kid.id || ks}`} {...clickHandlers(kid)} style={{ cursor: 'pointer' }}>
            {/* transparent hit area so the thin line is easy to click */}
            <rect
              data-testid="annotation-intron-hit"
              data-region-id={kid.id || ''}
              data-region-level="detail"
              x={x1}
              y={0}
              width={Math.max(1, x2 - x1)}
              height={ROW_HEIGHT}
              fill="transparent"
            />
            <line
              data-testid="annotation-intron-connector"
              data-region-id={kid.id || ''}
              x1={x1}
              y1={midY}
              x2={x2}
              y2={midY}
              stroke="var(--text-tertiary, #9ca3af)"
              strokeWidth={1.5}
              strokeDasharray="3 2"
              pointerEvents="none"
            />
          </g>
        );
      })}
    </g>
  );
}
