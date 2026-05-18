/**
 * SegmentZonesOverlay — translucent coloured backdrop per assembly
 * segment (A2 / G2 DEC-CANVAS-ASM-14). Opt-in: only the assembly
 * editor passes `coloredZones`; Library / Importer / PCR mode leave it
 * undefined so this renders nothing (back-compat).
 *
 * Mirrors SearchHitsOverlay's line-probe coordinate math (offsetLeft +
 * (LABEL_WIDTH + ch) * charPx). The colour band is pointer-events:none
 * so it never blocks caret / drag-select; a thin top "handle" strip is
 * pointer-events:auto and delegates click / hover to the consumer
 * (opens SegmentDetailPanel in AssemblyModeShell).
 *
 * Anchors off its OWN rendered node (`anchorRef`) instead of the parent
 * `containerRef` — a component's own host-element ref is attached
 * before its own layout effect, whereas a parent ref passed down can
 * still be null on the first layout pass (overlay then never recomputes
 * because SequenceView does not always re-render). `containerRef` is
 * still accepted as a primary lookup when available.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { LABEL_WIDTH } from '../constants.js';

const HANDLE_H = 5;

function toRgba(hex, alpha) {
  const s = String(hex || '').replace('#', '');
  if (s.length !== 6) return `rgba(120,113,108,${alpha})`;
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return `rgba(120,113,108,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function SegmentZonesOverlay({
  zones,
  charPx,
  charsPerLine,
  containerRef,
  onZoneClick,
  onZoneHover,
}) {
  const anchorRef = useRef(null);
  const [rects, setRects] = useState([]);

  useLayoutEffect(() => {
    if (!Array.isArray(zones) || zones.length === 0) {
      setRects((prev) => (prev.length === 0 ? prev : []));
      return undefined;
    }
    const root = (containerRef && containerRef.current)
      || (anchorRef.current && anchorRef.current.parentElement)
      || null;
    if (!root) {
      setRects((prev) => (prev.length === 0 ? prev : []));
      return undefined;
    }
    const cpl = charsPerLine || 80;
    const lines = root.querySelectorAll('[data-testid="sequence-view-line"]');
    if (lines.length === 0) {
      setRects((prev) => (prev.length === 0 ? prev : []));
      return undefined;
    }
    const out = [];
    for (let i = 0; i < zones.length; i += 1) {
      const z = zones[i];
      const start = Math.max(0, z.start);
      const end = Math.max(start, z.end);
      if (end <= start) continue;
      for (const el of Array.from(lines)) {
        const elKind = el.getAttribute('data-wraptail-kind') || 'main';
        if (elKind !== 'main') continue;
        const lineStart = parseInt(el.dataset.lineStart || '', 10);
        if (Number.isNaN(lineStart)) continue;
        const lineEnd = lineStart + cpl;
        if (lineEnd <= start || lineStart >= end) continue;
        const fromCh = Math.max(0, start - lineStart);
        const toCh = Math.min(cpl, end - lineStart);
        const left = (el.offsetLeft || 0) + (LABEL_WIDTH + fromCh) * charPx;
        const width = Math.max(1, (toCh - fromCh) * charPx);
        // Anchor the band to the DNA STRAND rows, not the whole line.
        // Игорь 18.05.2026: после редизайна праймеров (forward над
        // цепью, reverse под) line.offsetHeight скачет от наличия
        // праймеров → полоса окраски «сдвигалась». Strand-row span
        // стабилен независимо от primer/ruler/annotation/AA треков.
        const lineTop = el.offsetTop || 0;
        let top = lineTop;
        let height = Math.max(10, el.offsetHeight || 18);
        const strandEls = el.querySelectorAll('[data-testid="sequence-view-strands"]');
        if (strandEls.length > 0) {
          const first = strandEls[0];
          const last = strandEls[strandEls.length - 1];
          const sTop = first.offsetTop || 0;
          const sBottom = (last.offsetTop || 0) + (last.offsetHeight || 0);
          top = lineTop + sTop;
          height = Math.max(10, sBottom - sTop);
        }
        out.push({
          key: `${z.zoneId}:${lineStart}`,
          zoneId: z.zoneId,
          left,
          top,
          width,
          height,
          // Softer backdrop (Игорь 17.05.2026 «слишком яркое
          // выделение фрагментов») — fill stays readable behind the
          // DNA + primer track; the accent is a thin BOTTOM underline,
          // not a bright top strip in the primer lane.
          fill: z.isOrphan
            ? 'repeating-linear-gradient(45deg,rgba(220,38,38,0.10),rgba(220,38,38,0.10) 6px,rgba(220,38,38,0.20) 6px,rgba(220,38,38,0.20) 12px)'
            : toRgba(z.color, 0.10),
          stroke: z.isOrphan ? 'rgba(220,38,38,0.55)' : toRgba(z.color, 0.5),
          label: z.label || '',
        });
      }
    }
    setRects(out);
    return undefined;
  }, [zones, charPx, charsPerLine, containerRef]);

  return (
    <>
      <i
        ref={anchorRef}
        data-testid="sequence-view-zones-anchor"
        aria-hidden
        style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}
      />
      {rects.map((r) => (
        <div key={`band:${r.key}`}>
          <div
            data-testid="sequence-view-zone"
            data-zone-id={r.zoneId}
            title={r.label}
            style={{
              position: 'absolute',
              left: r.left,
              top: r.top,
              width: r.width,
              height: r.height,
              background: r.fill,
              // Accent underline at the BOTTOM — keeps the primer track
              // (first track, line top) clear of the segment strip.
              borderBottom: `2px solid ${r.stroke}`,
              pointerEvents: 'none',
              zIndex: 1,
            }}
          />
          <div
            data-testid="sequence-view-zone-handle"
            data-zone-id={r.zoneId}
            role="button"
            tabIndex={-1}
            title={r.label}
            onClick={() => onZoneClick && onZoneClick(r.zoneId)}
            onMouseEnter={() => onZoneHover && onZoneHover(r.zoneId)}
            onMouseLeave={() => onZoneHover && onZoneHover(null)}
            style={{
              position: 'absolute',
              left: r.left,
              top: Math.max(r.top, r.top + r.height - HANDLE_H),
              width: r.width,
              height: HANDLE_H,
              background: r.stroke,
              cursor: 'pointer',
              pointerEvents: 'auto',
              zIndex: 2,
            }}
          />
        </div>
      ))}
    </>
  );
}
