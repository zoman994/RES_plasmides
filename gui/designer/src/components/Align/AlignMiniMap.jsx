/**
 * AlignMiniMap — linear overview strip for the alignment view (PlasmidMiniMap is
 * circular-only, so this is its own component). Shows the whole reference
 * 0..len with feature ticks + the aligned-read span, plus a draggable viewport
 * «carriage» (Игорь: «ездящая каретка по миникарте для быстрой навигации»):
 *   • click anywhere on the strip → jump the SequenceView to that position;
 *   • drag the carriage → scrub-scroll the SequenceView continuously.
 *
 * Pure geometry lives in align-minimap-geometry.js. Width is measured from the
 * container (overridable via the `width` prop for tests).
 */
import { useEffect, useRef, useState } from 'react';
import { getRegions } from '../../annotation-model';
import { featureColor } from '../../feature-palette';
import { posToX, xToPos, carriageRect } from './align-minimap-geometry';

const PAD = 4;
const H = 34;
const STRIP_Y = 6;
const STRIP_H = 14;

export default function AlignMiniMap({
  seqLen,
  annotations = [],
  readSpan = null,
  visibleRange = null,
  onScrubTo,
  width: widthProp,
}) {
  const hostRef = useRef(null);
  const [measured, setMeasured] = useState(600);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (widthProp) return undefined;
    const host = hostRef.current;
    if (!host) return undefined;
    const update = () => { const w = host.clientWidth; if (w > 0) setMeasured(w); };
    update();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(update);
    ro.observe(host);
    return () => ro.disconnect();
  }, [widthProp]);

  const width = widthProp || measured;
  if (!seqLen || seqLen <= 0) return null;

  const regions = getRegions(annotations);

  const posFromClientX = (clientX) => {
    const host = hostRef.current;
    let left = 0;
    try { left = host ? host.getBoundingClientRect().left : 0; } catch { left = 0; }
    return xToPos(clientX - left, seqLen, width, PAD);
  };

  const onStripClick = (e) => {
    if (draggingRef.current) return;
    onScrubTo?.(posFromClientX(e.clientX));
  };

  const onCarriagePointerDown = (e) => {
    e.stopPropagation();
    draggingRef.current = true;
    try { e.target.setPointerCapture?.(e.pointerId); } catch { /* noop */ }
  };
  const onCarriagePointerMove = (e) => {
    if (!draggingRef.current) return;
    onScrubTo?.(posFromClientX(e.clientX));
  };
  const onCarriagePointerUp = (e) => {
    draggingRef.current = false;
    try { e.target.releasePointerCapture?.(e.pointerId); } catch { /* noop */ }
  };

  const carriage = visibleRange
    ? carriageRect(visibleRange.start, visibleRange.end, seqLen, width, PAD)
    : null;

  return (
    <div ref={hostRef} data-testid="align-minimap" style={{ width: '100%', userSelect: 'none' }}>
      <svg width={width} height={H} style={{ display: 'block', overflow: 'visible' }}>
        {/* reference strip — click to jump */}
        <rect
          data-testid="align-minimap-strip"
          x={PAD} y={STRIP_Y} width={Math.max(0, width - 2 * PAD)} height={STRIP_H} rx="3"
          fill="var(--surface-sunken, #f5f5f4)" stroke="var(--border-subtle, #e7e5e4)"
          style={{ cursor: 'pointer' }}
          onClick={onStripClick}
        />

        {/* feature ticks */}
        {regions.map((r) => {
          const x = posToX(r.start, seqLen, width, PAD);
          const w = Math.max(1.5, posToX(r.end, seqLen, width, PAD) - x);
          return (
            <rect
              key={r.id}
              data-testid="align-minimap-feature"
              x={x} y={STRIP_Y + 2} width={w} height={STRIP_H - 4} rx="1.5"
              fill={featureColor(r.type, r.name)} opacity="0.85"
              pointerEvents="none"
            >
              <title>{r.name || r.type}</title>
            </rect>
          );
        })}

        {/* aligned-read span band (under the strip) */}
        {readSpan && readSpan.end > readSpan.start && (() => {
          const x = posToX(readSpan.start, seqLen, width, PAD);
          const w = Math.max(2, posToX(readSpan.end, seqLen, width, PAD) - x);
          return (
            <g data-testid="align-minimap-readspan">
              <rect x={x} y={STRIP_Y + STRIP_H + 3} width={w} height={5} rx="2.5"
                fill="var(--accent-500, #f59e0b)" opacity="0.9" pointerEvents="none" />
            </g>
          );
        })()}

        {/* viewport carriage — drag to scrub */}
        {carriage && (
          <rect
            data-testid="align-minimap-carriage"
            x={carriage.x} y={STRIP_Y - 2} width={carriage.width} height={STRIP_H + 4} rx="3"
            fill="var(--accent-500, #f59e0b)" fillOpacity="0.18"
            stroke="var(--accent-700, #b45309)" strokeWidth="1.5"
            style={{ cursor: 'grab' }}
            onPointerDown={onCarriagePointerDown}
            onPointerMove={onCarriagePointerMove}
            onPointerUp={onCarriagePointerUp}
          />
        )}
      </svg>
    </div>
  );
}
