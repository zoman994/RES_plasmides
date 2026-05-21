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

      if (elKind === 'main' && !wrapsOrigin) {
        // Plain main row — half-open [lineStart, lineStart+cpl).
        const lineEnd = lineStart + cpl;
        for (const seg of oorSegments) {
          if (lineEnd <= seg.start || lineStart >= seg.end) continue;
          const fromCh = Math.max(0, seg.start - lineStart);
          const toCh = Math.min(cpl, seg.end - lineStart);
          pushRect(el, fromCh, toCh, `oor:m:${lineStart}:${seg.start}-${seg.end}`);
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
      } else if (elKind === 'trailing-wrap') {
        // Trailing-wrap row — показывает [0..cpl) the same way as a
        // duplicate main strip. dataset.lineStart обычно отражает
        // wrap-extended coord (≥ seqLength), но визуально это просто
        // [0..lineLen). Применим маску по реальным positions.
        // SequenceLine.jsx уже даёт opacity:0.6 для wrap-tail, но это
        // распространяется на всю line — для частично-OOR строк
        // (часть в range) нужен наш explicit clip.
        const lineLen = Math.min(cpl, L);
        for (const seg of oorSegments) {
          const intStart = Math.max(0, seg.start);
          const intEnd = Math.min(lineLen, seg.end);
          if (intEnd > intStart) {
            pushRect(el, intStart, intEnd, `oor:tw:${lineStart}:${seg.start}-${seg.end}`);
          }
        }
      } else if (elKind === 'leading-wrap') {
        // Leading-wrap row — показывает positions [L-cpl..L) (хвост
        // последовательности перед origin).
        const lineLen = Math.min(cpl, L);
        const wrapLineStart = Math.max(0, L - lineLen);
        const wrapLineEnd = L;
        for (const seg of oorSegments) {
          if (wrapLineEnd <= seg.start || wrapLineStart >= seg.end) continue;
          const fromCh = Math.max(0, seg.start - wrapLineStart);
          const toCh = Math.min(lineLen, seg.end - wrapLineStart);
          pushRect(el, fromCh, toCh, `oor:lw:${lineStart}:${seg.start}-${seg.end}`);
        }
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
