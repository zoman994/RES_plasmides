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
  // V96 — bumped by SequenceView on every line reflow so the mask
  // re-measures against the final layout (this overlay is otherwise
  // immune to caret-driven recompute — it never reads caretPos).
  layoutEpoch = 0,
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
    // Helper — превращает [colFrom, colTo) внутри строки в absolute rect.
    const pushRect = (el, colFrom, colTo, key) => {
      if (colTo <= colFrom) return;
      const left = (el.offsetLeft || 0) + (LABEL_WIDTH + colFrom) * charPx;
      const width = (colTo - colFrom) * charPx;
      const top = el.offsetTop || 0;
      const height = Math.max(10, el.offsetHeight || 18);
      out.push({ key, left, top, width, height });
    };

    for (const el of Array.from(lines)) {
      const elKind = el.getAttribute('data-wraptail-kind') || 'main';
      const wrapsOrigin = el.getAttribute('data-wraps-origin') === 'true';
      const bridgeWrapAt = wrapsOrigin
        ? parseInt(el.dataset.wrapAt || '0', 10)
        : 0;
      const lineStart = parseInt(el.dataset.lineStart || '', 10);
      if (Number.isNaN(lineStart)) continue;

      if (!wrapsOrigin) {
        // V98 — main + trailing-wrap + leading-wrap all carry REAL
        // absolute coords in `data-line-start` (buildWrapTailLines), so
        // they mask identically: intersect OOR segments with
        // [lineStart, lineStart+lineLen), column = pos − lineStart.
        // (Pre-V98 the wrap-tail branches ignored data-line-start and
        // hardcoded [0,lineLen)/[L−lineLen,L) → mask landed on the wrong
        // columns and missed the text on rows after the origin. The
        // bridge `wrapsOrigin` row stays a SEPARATE branch below — it
        // has two coordinate halves, not one [lineStart, …) span.)
        const lineLen = Math.min(cpl, L - lineStart);
        if (lineLen > 0) {
          const lineEnd = lineStart + lineLen;
          for (const seg of oorSegments) {
            if (lineEnd <= seg.start || lineStart >= seg.end) continue;
            const fromCh = Math.max(0, seg.start - lineStart);
            const toCh = Math.min(lineLen, seg.end - lineStart);
            pushRect(el, fromCh, toCh, `oor:${elKind}:${lineStart}:${seg.start}-${seg.end}`);
          }
        }
      } else if (wrapsOrigin && Number.isFinite(bridgeWrapAt)) {
        // V87 r2 — bridge row: левая половина [0..wrapAt) показывает
        // positions [lineStart..lineStart+wrapAt), правая [wrapAt..cpl)
        // показывает positions [0..cpl-wrapAt) (wrap через origin).
        // Маскируем обе половины по соответствующим segments.
        const mainEnd = lineStart + bridgeWrapAt;
        for (const seg of oorSegments) {
          // Left half (main band).
          if (mainEnd > seg.start && lineStart < seg.end) {
            const fromCh = Math.max(0, seg.start - lineStart);
            const toCh = Math.min(bridgeWrapAt, seg.end - lineStart);
            pushRect(el, fromCh, toCh, `oor:bL:${lineStart}:${seg.start}-${seg.end}`);
          }
          // Right (wrap) half — отображает [0..wrapLen) в колонках [wrapAt..cpl).
          const wrapLen = Math.max(0, cpl - bridgeWrapAt);
          const wrapPosEnd = wrapLen;
          // OOR intersection with [0, wrapLen) — direct interval intersect.
          const intStart = Math.max(0, seg.start);
          const intEnd = Math.min(wrapPosEnd, seg.end);
          if (intEnd > intStart) {
            const fromCh = bridgeWrapAt + intStart;
            const toCh = bridgeWrapAt + intEnd;
            pushRect(el, fromCh, toCh, `oor:bR:${lineStart}:${seg.start}-${seg.end}`);
          }
        }
      }
    }
    setRects(out);
    return undefined;
  }, [rangeStart, rangeEnd, charPx, charsPerLine, containerRef, seqLength, layoutEpoch]);

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
