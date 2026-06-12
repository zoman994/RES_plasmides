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
  // V96 — bumped by SequenceView on every line reflow so the colour
  // bands re-measure against the final strand-row layout (the rAF-
  // retry below only covers ~2 frames; the tracksReady flip is later).
  layoutEpoch = 0,
}) {
  const anchorRef = useRef(null);
  const [rects, setRects] = useState([]);
  // JUNCTION step-2 FIX — clickable junction glyphs at each `zone.junctionRight`
  // boundary (the assembly editor enriches coloredZones with it; Library /
  // Importer / PCR leave zones plain → none rendered).
  const [junctionRects, setJunctionRects] = useState([]);

  useLayoutEffect(() => {
    if (!Array.isArray(zones) || zones.length === 0) {
      setRects((prev) => (prev.length === 0 ? prev : []));
      setJunctionRects((prev) => (prev.length === 0 ? prev : []));
      return undefined;
    }
    // Игорь 20.05.2026 — после exit/re-enter ассемблера на mount
    // useLayoutEffect стрелял ДО того как inner SequenceLine успевал
    // отрендерить `[data-testid="sequence-view-strands"]` → fallback
    // на `line.offsetHeight` (= вся high-line высота, включая AA
    // tracks) → backdrop вырастал и накладывался поверх AA рамок.
    // На инкрементальном add фрагментов гонка не воспроизводилась
    // потому что между add'ами успевал зайти второй render cycle.
    // Чиним через rAF-retry: если strand-rows ещё не в DOM, перенесём
    // расчёт на следующий frame, и так до двух попыток.
    let raf1 = 0;
    let raf2 = 0;
    let cancelled = false;

    const compute = (attempt) => {
      if (cancelled) return;
      const root = (containerRef && containerRef.current)
        || (anchorRef.current && anchorRef.current.parentElement)
        || null;
      if (!root) {
        setRects((prev) => (prev.length === 0 ? prev : []));
        setJunctionRects((prev) => (prev.length === 0 ? prev : []));
        return;
      }
      const cpl = charsPerLine || 80;
      const lines = root.querySelectorAll('[data-testid="sequence-view-line"]');
      if (lines.length === 0) {
        if (attempt < 2 && typeof requestAnimationFrame === 'function') {
          raf1 = requestAnimationFrame(() => compute(attempt + 1));
          return;
        }
        setRects((prev) => (prev.length === 0 ? prev : []));
        setJunctionRects((prev) => (prev.length === 0 ? prev : []));
        return;
      }
      // If no line has strand rows yet, defer one frame — backdrop
      // height MUST anchor to strands, not the whole line.
      let anyStrand = false;
      for (const el of lines) {
        if (el.querySelector('[data-testid="sequence-view-strands"]')) {
          anyStrand = true; break;
        }
      }
      if (!anyStrand && attempt < 2 && typeof requestAnimationFrame === 'function') {
        raf2 = requestAnimationFrame(() => compute(attempt + 1));
        return;
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
            fill: z.isOrphan
              ? 'repeating-linear-gradient(45deg,rgba(220,38,38,0.10),rgba(220,38,38,0.10) 6px,rgba(220,38,38,0.20) 6px,rgba(220,38,38,0.20) 12px)'
              : toRgba(z.color, 0.10),
            stroke: z.isOrphan ? 'rgba(220,38,38,0.55)' : toRgba(z.color, 0.5),
            label: z.label || '',
          });
        }
      }
      setRects(out);

      // JUNCTION step-2 FIX — one clickable glyph per internal boundary
      // (zone.junctionRight), placed at the seam (= this zone's end offset)
      // on the line that contains it. Reuses the same line/strand probe.
      const jout = [];
      for (let i = 0; i < zones.length; i += 1) {
        const jr = zones[i] && zones[i].junctionRight;
        if (!jr) continue;
        const p = Math.max(0, zones[i].end);
        for (const el of Array.from(lines)) {
          const elKind = el.getAttribute('data-wraptail-kind') || 'main';
          if (elKind !== 'main') continue;
          const lineStart = parseInt(el.dataset.lineStart || '', 10);
          if (Number.isNaN(lineStart)) continue;
          if (p < lineStart || p >= lineStart + cpl) continue;
          const left = (el.offsetLeft || 0) + (LABEL_WIDTH + (p - lineStart)) * charPx;
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
          jout.push({
            key: `${jr.pairKey}:${lineStart}`, junction: jr, left, top, height,
          });
          break; // a junction is a point → one line only
        }
      }
      setJunctionRects(jout);
    };

    compute(0);
    return () => {
      cancelled = true;
      if (raf1 && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf1);
      if (raf2 && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf2);
    };
  }, [zones, charPx, charsPerLine, containerRef, layoutEpoch]);

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
      {junctionRects.map((j) => {
        // UX slice 1 — a DECIDED junction (a human picked/tuned it) reads as a
        // solid filled diamond; a TENTATIVE one (untouched auto-guess) reads as
        // a hollow dashed diamond in the same method colour — "draft", not
        // "error". So the strip answers "what's confirmed vs still a guess"
        // before the biologist opens any popup.
        const decided = j.junction.state === 'decided';
        const differs = !!j.junction.differsFromAssembly;
        return (
          <button
            key={`junc:${j.key}`}
            type="button"
            className="bg-junction-btn"
            data-testid="sequence-view-junction"
            data-pair-key={j.junction.pairKey}
            data-junction-kind={j.junction.kind}
            data-method={j.junction.method}
            data-junction-state={j.junction.state}
            data-junction-differs={differs ? 'true' : 'false'}
            title={`Стык: ${j.junction.method} · ${decided ? 'выбран' : 'по умолчанию'}${differs ? ' · отличается от сборки' : ''} — нажмите, чтобы настроить`}
            onClick={(e) => onZoneClick && onZoneClick({
              ...j.junction, clientX: e.clientX, clientY: e.clientY,
            })}
            style={{
              position: 'absolute',
              left: j.left - 9,
              top: Math.max(0, j.top - 13),
              width: 18,
              height: j.height + 13,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              pointerEvents: 'auto',
              zIndex: 4,
            }}
          >
            {/* V145 — round button «plate» so the seam glyph reads as a tappable
                junction-settings control (lifts on hover via .bg-junction-chip). */}
            <span
              className="bg-junction-chip"
              aria-hidden
              style={{
                position: 'relative',
                width: 16,
                height: 16,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                background: 'var(--surface-1, #fff)',
                border: `1px solid ${decided ? j.junction.stroke : 'var(--border-subtle, rgba(28,25,23,0.22))'}`,
                boxShadow: '0 1px 2px rgba(28,25,23,0.16)',
              }}
            >
              <span
                data-testid="junction-diamond"
                aria-hidden
                style={{
                  width: 7,
                  height: 7,
                  transform: 'rotate(45deg)',
                  borderRadius: 1,
                  boxSizing: 'border-box',
                  background: decided ? j.junction.fill : 'transparent',
                  border: `1.5px ${decided ? 'solid' : 'dashed'} ${j.junction.stroke}`,
                }}
              />
              {differs && (
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    top: -2,
                    right: -2,
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--accent-500, #b85c3e)',
                    border: '1px solid var(--surface-1, #fff)',
                  }}
                />
              )}
            </span>
            <span
              aria-hidden
              style={{
                flex: 1,
                width: 2,
                minHeight: 4,
                background: j.junction.stroke,
                opacity: decided ? 0.85 : 0.4,
              }}
            />
          </button>
        );
      })}
    </>
  );
}
