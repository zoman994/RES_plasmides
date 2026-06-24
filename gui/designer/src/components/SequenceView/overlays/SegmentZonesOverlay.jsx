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
  // «Конца должны быть покрыты выделением» (Игорь 22.06): the LINEAR construct's
  // terminal staircase ({left,right} from terminalStagger). An overhang that
  // PROTRUDES OUTWARD (protruding==='bottom' → StrandsTrack draws bases past the
  // duplex edge) used to escape the band; the terminal-most zone now extends by
  // the overhang length so the highlight covers the whole step. protruding==='top'
  // draws no outward bases (recess only) → already covered, left untouched.
  terminalStagger = null,
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
  // «Липкие концы» — chip labels at RE-segment ends. The physical step is drawn
  // by StrandsTrack (terminalStagger); the hatched tail was removed (Игорь 22.06
  // «убрать штриховку — висит и висит»).
  const [chips, setChips] = useState([]);
  // V160 «визуализировать стык» — junction seam where two RE fragments' sticky
  // ends interlock (zones[i].interlock, precomputed upstream).
  const [seamRects, setSeamRects] = useState([]);

  useLayoutEffect(() => {
    if (!Array.isArray(zones) || zones.length === 0) {
      setRects((prev) => (prev.length === 0 ? prev : []));
      setJunctionRects((prev) => (prev.length === 0 ? prev : []));
      setChips((prev) => (prev.length === 0 ? prev : []));
      setSeamRects((prev) => (prev.length === 0 ? prev : []));
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
      // Terminal-staircase coverage: only an outward-protruding overhang
      // (protruding==='bottom') draws bases past the duplex edge, so only it needs
      // the band extended. Mirrors StrandsTrack: right overhang sits at the line's
      // end column (+len); left overhang at max(0, gutter-len). The extension binds
      // to the construct's free ends — the min-start zone (left) / max-end zone
      // (right) — so a one-segment fragment gets both, a multi-segment construct
      // gets only its two outer ends.
      const protrudes = (e) => !!(e && e.protruding === 'bottom' && e.len > 0);
      const leftLen = protrudes(terminalStagger && terminalStagger.left) ? terminalStagger.left.len : 0;
      const rightLen = protrudes(terminalStagger && terminalStagger.right) ? terminalStagger.right.len : 0;
      let globalMinStart = Infinity;
      let globalMaxEnd = -Infinity;
      if (leftLen || rightLen) {
        for (const z of zones) {
          const s = Math.max(0, z.start);
          const e = Math.max(s, z.end);
          if (e <= s) continue;
          if (s < globalMinStart) globalMinStart = s;
          if (e > globalMaxEnd) globalMaxEnd = e;
        }
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
          // Char-column edges (gutter-relative); extend the terminal-most zone's
          // edge on the line that actually carries the construct terminus.
          let leftCol = LABEL_WIDTH + fromCh;
          let rightCol = LABEL_WIDTH + toCh;
          if (rightLen && end === globalMaxEnd && end <= lineStart + cpl) rightCol += rightLen;
          if (leftLen && start === globalMinStart && start >= lineStart) {
            leftCol = Math.max(0, leftCol - leftLen);
          }
          const left = (el.offsetLeft || 0) + leftCol * charPx;
          const width = Math.max(1, (rightCol - leftCol) * charPx);
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

      // «Липкие концы» — for RE-cut zones (z.reOverhangs), draw a staggered tail
      // on the protruding strand at each end + a chip label («5′ AATT»). The
      // overhang is a few bases; render on the line holding the boundary. Where
      // the tail falls outside the segment span (5′ at the right / 3′ at the
      // left) it shows as a short stub past the boundary — the chip carries the
      // exact sequence regardless.
      const cout = [];
      const lineFor = (pos) => {
        for (const el of Array.from(lines)) {
          if ((el.getAttribute('data-wraptail-kind') || 'main') !== 'main') continue;
          const ls = parseInt(el.dataset.lineStart || '', 10);
          if (Number.isNaN(ls)) continue;
          if (pos >= ls && pos <= ls + cpl) return { el, ls };
        }
        return null;
      };
      const strandBox = (el, tag) => {
        const sr = el.querySelector(`[data-testid="sequence-view-strands-${tag}"]`);
        if (!sr) return null;
        return { top: (el.offsetTop || 0) + (sr.offsetTop || 0), height: Math.max(6, sr.offsetHeight || 8) };
      };
      for (let i = 0; i < zones.length; i += 1) {
        const z = zones[i];
        const ovr = z && z.reOverhangs;
        if (!ovr) continue;
        const zStart = Math.max(0, z.start);
        const zEnd = Math.max(zStart, z.end);
        const pushEnd = (boundary, info, side) => {
          if (!info) return;
          const ln = lineFor(boundary);
          if (!ln) return;
          const { el, ls } = ln;
          const bx = (el.offsetLeft || 0) + (LABEL_WIDTH + (boundary - ls)) * charPx;
          const topBox = strandBox(el, 'top');
          cout.push({
            // «название рестриктазы вместо 5′ AGCT» (Игорь 22.06): the chip shows
            // the ENZYME that made this end; the overhang sequence goes to the tooltip.
            key: `${z.zoneId}:chip:${side}`, side,
            label: info.enzyme || info.label || '', overhang: info.label || '',
            x: bx, top: (topBox ? topBox.top : (el.offsetTop || 0)),
          });
        };
        // V160 — at an internal junction the seam fully represents a COMPATIBLE
        // or BLUNT boundary (interlocking bars / clean line), so suppress the
        // per-end chip/tail there. For an INCOMPATIBLE seam keep the V158 chips
        // so both mismatched overhangs stay visible next to the red ✕.
        const covered = (v) => v === 'compatible' || v === 'blunt';
        const rightCovered = z.interlock && covered(z.interlock.verdict);
        const prev = zones[i - 1];
        const leftCovered = prev && prev.interlock && covered(prev.interlock.verdict);
        pushEnd(zStart, leftCovered ? null : ovr.left, 'left');
        pushEnd(zEnd, rightCovered ? null : ovr.right, 'right');
      }
      setChips(cout);

      // V160 — junction SEAM: where THIS zone's right end meets the NEXT zone's
      // left end, draw the two sticky-end steps interlocking on OPPOSITE strands
      // (5′: B-top + A-bottom over the same cols; 3′: A-top + B-bottom) plus a
      // verdict. Compatible → rungs lock the strands; incompatible → red divider;
      // blunt → clean seam. interlock is precomputed upstream (the zones prop
      // carries it) so SequenceView never imports CanvasSkeleton.
      const seout = [];
      for (let i = 0; i < zones.length; i += 1) {
        const il = zones[i] && zones[i].interlock;
        if (!il || il.verdict === 'unknown') continue;
        const p = Math.max(0, zones[i].end);
        const ln = lineFor(p);
        if (!ln) continue;
        const { el, ls } = ln;
        const topBox = strandBox(el, 'top');
        const botBox = strandBox(el, 'bottom');
        const colAt = (c) => (el.offsetLeft || 0) + (LABEL_WIDTH + (c - ls)) * charPx;
        const thisColor = zones[i].color;
        const nextColor = (zones[i + 1] && zones[i + 1].color) || thisColor;
        const fullTop = topBox ? topBox.top : (el.offsetTop || 0);
        const fullBottom = botBox ? botBox.top + botBox.height : fullTop + 12;
        const entry = {
          key: `${zones[i].zoneId}:seam:${ls}`,
          verdict: il.verdict,
          message: il.message || '',
          label: il.overhang || (il.verdict === 'blunt' ? 'тупой' : ''),
          seamX: colAt(p),
          top: fullTop,
          height: Math.max(8, fullBottom - fullTop),
          // RC-B2 — nucleotide readout of the join (+ codon/AA that straddles it).
          seam: zones[i].seam || null,
        };
        // Only a COMPATIBLE sticky junction has a two-strand interlock zone.
        if (il.side && il.length > 0 && topBox && botBox) {
          const L = il.length;
          const z0 = il.side === 'afterP' ? p : p - L;
          const z1 = il.side === 'afterP' ? p + L : p;
          entry.zoneLeft = colAt(z0);
          entry.zoneWidth = Math.max(2, (z1 - z0) * charPx);
          entry.topBar = { top: topBox.top, height: topBox.height, color: il.topOwner === 'this' ? thisColor : nextColor };
          entry.botBar = { top: botBox.top, height: botBox.height, color: il.botOwner === 'this' ? thisColor : nextColor };
        }
        seout.push(entry);
      }
      setSeamRects(seout);
    };

    compute(0);
    return () => {
      cancelled = true;
      if (raf1 && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf1);
      if (raf2 && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf2);
    };
  }, [zones, charPx, charsPerLine, containerRef, terminalStagger, layoutEpoch]);

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
      {chips.map((c) => (
        <div
          key={`chip:${c.key}`}
          data-testid="sequence-view-overhang-chip"
          data-side={c.side}
          title={`${c.label}${c.overhang ? ` · липкий конец ${c.overhang}` : ''}`}
          style={{
            position: 'absolute',
            left: c.x,
            top: Math.max(0, c.top - 15),
            transform: c.side === 'right' ? 'translateX(-100%)' : 'none',
            fontSize: 9,
            lineHeight: '12px',
            fontFamily: 'var(--font-mono, monospace)',
            padding: '0 4px',
            borderRadius: 3,
            whiteSpace: 'nowrap',
            background: 'var(--surface-1, #fff)',
            border: '0.5px solid var(--border-default, #d6d3d1)',
            color: 'var(--text-secondary)',
            pointerEvents: 'none',
            zIndex: 4,
          }}
        >{c.label}</div>
      ))}
      {seamRects.map((s) => {
        const ok = s.verdict === 'compatible';
        const bad = s.verdict === 'incompatible';
        const accent = ok ? '#16a34a' : bad ? '#dc2626' : 'var(--border-strong, #a8a29e)';
        const icon = ok ? '✓' : bad ? '✕' : '';
        return (
          <div key={`seam:${s.key}`}>
            {/* COMPATIBLE — two protruding strands (opposite cols) + rungs that
                "lock" them: the steps of both fragments interlock at the seam. */}
            {s.topBar && (
              <div
                data-testid="sequence-view-seam-strand"
                data-strand="top"
                aria-hidden
                style={{
                  position: 'absolute', left: s.zoneLeft, top: s.topBar.top,
                  width: s.zoneWidth, height: s.topBar.height,
                  background: toRgba(s.topBar.color, 0.6),
                  outline: `1px solid ${toRgba(s.topBar.color, 0.85)}`,
                  pointerEvents: 'none', zIndex: 3,
                }}
              />
            )}
            {s.botBar && (
              <div
                data-testid="sequence-view-seam-strand"
                data-strand="bottom"
                aria-hidden
                style={{
                  position: 'absolute', left: s.zoneLeft, top: s.botBar.top,
                  width: s.zoneWidth, height: s.botBar.height,
                  background: toRgba(s.botBar.color, 0.6),
                  outline: `1px solid ${toRgba(s.botBar.color, 0.85)}`,
                  pointerEvents: 'none', zIndex: 3,
                }}
              />
            )}
            {/* COMPATIBLE — a solid green connector at the seam: the two steps
                are joined (ligated). Mirrors the red divider of the mismatch. */}
            {ok && (
              <div
                data-testid="sequence-view-seam-join"
                aria-hidden
                style={{
                  position: 'absolute', left: s.seamX - 1, top: s.top,
                  width: 2, height: s.height,
                  background: toRgba('#16a34a', 0.9),
                  pointerEvents: 'none', zIndex: 4,
                }}
              />
            )}
            {/* INCOMPATIBLE — the ends don't anneal: a red dashed divider at the
                seam instead of a join. */}
            {bad && (
              <div
                data-testid="sequence-view-seam-divider"
                aria-hidden
                style={{
                  position: 'absolute', left: s.seamX - 1, top: s.top,
                  width: 2, height: s.height,
                  background: 'repeating-linear-gradient(0deg, #dc2626 0 3px, transparent 3px 6px)',
                  pointerEvents: 'none', zIndex: 4,
                }}
              />
            )}
            {/* BLUNT — flush butt-join: one clean seam line. */}
            {s.verdict === 'blunt' && (
              <div
                data-testid="sequence-view-seam-divider"
                aria-hidden
                style={{
                  position: 'absolute', left: s.seamX, top: s.top,
                  width: 1, height: s.height,
                  background: 'var(--border-strong, #a8a29e)',
                  pointerEvents: 'none', zIndex: 3,
                }}
              />
            )}
            {/* Verdict badge below the strands (the diamond/method glyph sits
                above) — ✓/✕/«тупой» + the shared overhang, tooltip = message. */}
            <div
              data-testid="sequence-view-junction-seam"
              data-verdict={s.verdict}
              title={s.message}
              style={{
                position: 'absolute', left: s.seamX, top: s.top + s.height + 2,
                transform: 'translateX(-50%)',
                display: 'flex', alignItems: 'center', gap: 2,
                fontSize: 9, lineHeight: '12px', fontFamily: 'var(--font-mono, monospace)',
                padding: '0 4px', borderRadius: 3, whiteSpace: 'nowrap',
                background: 'var(--surface-1, #fff)',
                border: `0.5px solid ${accent}`,
                color: accent,
                pointerEvents: 'none', zIndex: 4,
              }}
            >
              {icon && <span aria-hidden style={{ fontWeight: 700 }}>{icon}</span>}
              {s.label && <span>{s.label}</span>}
            </div>
            {/* RC-B2 — the nucleotide sequence AT the seam: last bases of the left
                fragment │ first bases of the right, + (when a frame is pinned via
                ⚙ «Рамка считывания») the codon/AA that straddles the join, with a
                red ⚠ STOP if translation hits a premature stop across it. */}
            {s.seam && (s.seam.left || s.seam.right) && (
              <div
                data-testid="sequence-view-seam-seq"
                title={`Стык: …${s.seam.left} │ ${s.seam.right}…${s.seam.codonAtSeam ? ` · рамка: ${s.seam.codonAtSeam.dna} → ${s.seam.codonAtSeam.aa}${s.seam.stopAtSeam ? ' (STOP!)' : ''}` : ''}`}
                style={{
                  position: 'absolute', left: s.seamX, top: s.top + s.height + 16,
                  transform: 'translateX(-50%)',
                  display: 'flex', alignItems: 'center',
                  fontSize: 9, lineHeight: '12px', fontFamily: 'var(--font-mono, monospace)',
                  padding: '0 3px', borderRadius: 3, whiteSpace: 'nowrap',
                  background: 'var(--surface-1, #fff)', border: '0.5px solid var(--border-default, #d6d3d1)',
                  color: 'var(--text-tertiary)', pointerEvents: 'none', zIndex: 4,
                }}
              >
                <span>{s.seam.left}</span>
                <span aria-hidden style={{ color: 'var(--accent-600, #b85c3e)', fontWeight: 700, padding: '0 1px' }}>│</span>
                <span>{s.seam.right}</span>
                {s.seam.codonAtSeam && (
                  s.seam.stopAtSeam ? (
                    <span data-testid="sequence-view-seam-stop" style={{ marginLeft: 4, color: '#dc2626', fontWeight: 700 }}>⚠ STOP</span>
                  ) : (
                    <span data-testid="sequence-view-seam-aa" style={{ marginLeft: 4, color: 'var(--text-secondary)' }}>{s.seam.codonAtSeam.aa}</span>
                  )
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
