/**
 * OutOfRangeMaskOverlay — V87. Translucent gray mask over sequence
 * regions OUTSIDE the active picker range [rangeStart, rangeEnd].
 *
 * Used by RangePickerModal so out-of-range sequence reads as
 * background, mirroring the dim treatment that wrap-tail rows already
 * get (opacity 0.6) — but at character granularity so partial rows
 * (one half selected, other half out-of-range) dim only the relevant
 * slice. Opt-in via `outOfRangeMask={{start, end}}` prop on
 * SequenceView; Library / Importer / Container editor leave it
 * undefined → overlay renders nothing.
 */
import { useLayoutEffect, useState } from 'react';
import { LABEL_WIDTH } from '../constants.js';

export default function OutOfRangeMaskOverlay({
  rangeStart,
  rangeEnd,
  charPx,
  charsPerLine,
  containerRef,
  seqLength,
}) {
  const [rects, setRects] = useState([]);

  useLayoutEffect(() => {
    if (
      !Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd)
      || rangeEnd <= rangeStart
      || !containerRef || !containerRef.current
    ) {
      setRects((prev) => (prev.length === 0 ? prev : []));
      return undefined;
    }
    const root = containerRef.current;
    const lines = root.querySelectorAll('[data-testid="sequence-view-line"]');
    if (lines.length === 0) {
      setRects((prev) => (prev.length === 0 ? prev : []));
      return undefined;
    }
    const cpl = charsPerLine || 80;
    const L = Math.max(0, Number(seqLength) || 0);
    const lo = Math.max(0, Math.min(L, rangeStart));
    const hi = Math.max(0, Math.min(L, rangeEnd));
    // Two out-of-range half-open segments: [0, lo) and [hi, L).
    const oorSegments = [
      { start: 0, end: lo },
      { start: hi, end: L },
    ].filter((s) => s.end > s.start);
    if (oorSegments.length === 0) {
      setRects((prev) => (prev.length === 0 ? prev : []));
      return undefined;
    }
    const out = [];
    for (const el of Array.from(lines)) {
      const elKind = el.getAttribute('data-wraptail-kind') || 'main';
      if (elKind !== 'main') continue;
      const lineStart = parseInt(el.dataset.lineStart || '', 10);
      if (Number.isNaN(lineStart)) continue;
      const lineEnd = lineStart + cpl;
      for (const seg of oorSegments) {
        if (lineEnd <= seg.start || lineStart >= seg.end) continue;
        const fromCh = Math.max(0, seg.start - lineStart);
        const toCh = Math.min(cpl, seg.end - lineStart);
        if (toCh <= fromCh) continue;
        const left = (el.offsetLeft || 0) + (LABEL_WIDTH + fromCh) * charPx;
        const width = (toCh - fromCh) * charPx;
        const top = el.offsetTop || 0;
        const height = Math.max(10, el.offsetHeight || 18);
        out.push({
          key: `oor:${lineStart}:${seg.start}-${seg.end}`,
          left, top, width, height,
        });
      }
    }
    setRects(out);
    return undefined;
  }, [rangeStart, rangeEnd, charPx, charsPerLine, containerRef, seqLength]);

  return (
    <>
      {rects.map((r) => (
        <div
          key={r.key}
          data-testid="sequence-view-oor-mask"
          aria-hidden
          style={{
            position: 'absolute',
            left: r.left,
            top: r.top,
            width: r.width,
            height: r.height,
            background: 'rgba(245,245,244,0.65)',
            pointerEvents: 'none',
            zIndex: 4,
          }}
        />
      ))}
    </>
  );
}
