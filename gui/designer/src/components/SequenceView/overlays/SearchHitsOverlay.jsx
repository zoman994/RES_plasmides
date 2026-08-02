/**
 * SearchHitsOverlay — paints translucent bands over the DNA strands for every search hit.
 *
 * TWO input shapes, normalized to «bands» before painting:
 *   • CANONICAL occurrence (the in-molecule popover → `searchHits` → SequenceTab): carries
 *     `location.segments` (0-based half-open; TWO of them for an origin wrap), `location.strand`
 *     (`'+'` / `'-'` / `'both'`) and `metrics.identityBps`. Each segment becomes a band; the strand
 *     decides which row it paints — `+` the top strand, `-` the bottom, `both` PAINTS BOTH. No
 *     mismatch ticks (the finalized metrics carry none).
 *   • LEGACY FLAT hit (AlignReferenceView): `{ targetStart, targetEnd, queryIdentity|identity,
 *     strand: ±1, mismatchPositions }`. One band, one row, with red mismatch boxes. Kept unchanged
 *     so the reference view (and its ticks) is untouched by the occurrence migration.
 *
 * Colour bucket by identity:
 *   ≥90% green · 80-89% amber · 70-79% orange · <70% grey (rare — slider relaxed).
 *
 * Wrap-tail LINES (`data-wraptail-kind` ≠ 'main') are still not painted; a circular occurrence draws
 * both its segments on their respective MAIN lines instead.
 */
import { useLayoutEffect, useState } from 'react';
import { LABEL_WIDTH } from '../constants.js';

const BUCKET_FILL = {
  high:   'rgba(22,  163, 74,  0.22)',  // green-600
  mid:    'rgba(217, 119, 6,   0.22)',  // amber-600
  orange: 'rgba(234, 88,  12,  0.22)',  // orange-600
  low:    'rgba(120, 113, 108, 0.18)',  // stone-500 (grey)
};
const BUCKET_OUTLINE = {
  high:   'rgba(22,  163, 74,  0.65)',
  mid:    'rgba(217, 119, 6,   0.65)',
  orange: 'rgba(234, 88,  12,  0.65)',
  low:    'rgba(120, 113, 108, 0.55)',
};

function bucketFor(identity) {
  if (identity >= 0.9) return 'high';
  if (identity >= 0.8) return 'mid';
  if (identity >= 0.7) return 'orange';
  return 'low';
}

/**
 * Flatten ONE hit (either shape) into paintable bands: `{ start, end, identity, target, ticks }`
 * where `target` ∈ 'top' | 'bottom' | 'both'. A canonical occurrence yields one band PER segment;
 * a legacy flat hit yields exactly one.
 */
function bandsForHit(hit) {
  const out = [];
  if (hit && hit.location && Array.isArray(hit.location.segments)) {
    const bps = hit.metrics && hit.metrics.identityBps;
    const identity = Number.isFinite(bps) ? bps / 10000 : 0;
    const s = hit.location.strand;
    const target = s === 'both' ? 'both' : ((s === '-' || s === -1) ? 'bottom' : 'top');
    for (const seg of hit.location.segments) {
      if (!seg) continue;
      const start = Math.max(0, seg.start);
      const end = Math.max(start, seg.end);
      if (end > start) out.push({ start, end, identity, target, ticks: [] });
    }
  } else if (hit && Number.isFinite(hit.targetStart)) {
    const start = Math.max(0, hit.targetStart);
    const end = Math.max(start, hit.targetEnd);
    if (end > start) {
      const identity = hit.queryIdentity ?? hit.identity ?? 0;
      const target = hit.strand === -1 ? 'bottom' : 'top';
      out.push({ start, end, identity, target, ticks: Array.isArray(hit.mismatchPositions) ? hit.mismatchPositions : [] });
    }
  }
  return out;
}

export default function SearchHitsOverlay({
  hits,
  charPx,
  charsPerLine,
  containerRef,
  // V96 — bumped by SequenceView on every line reflow so hit rects re-measure against the final
  // layout without a caret-moving click.
  layoutEpoch = 0,
}) {
  const [paint, setPaint] = useState({ rects: [], ticks: [] });

  useLayoutEffect(() => {
    if (!Array.isArray(hits) || hits.length === 0) {
      setPaint((prev) => (prev.rects.length === 0 && prev.ticks.length === 0 ? prev : { rects: [], ticks: [] }));
      return undefined;
    }
    const root = containerRef.current;
    if (!root) return undefined;
    const cpl = charsPerLine || 80;
    const lines = root.querySelectorAll('[data-testid="sequence-view-line"]');
    if (lines.length === 0) {
      setPaint({ rects: [], ticks: [] });
      return undefined;
    }

    const bands = [];
    for (let i = 0; i < hits.length; i++) {
      for (const b of bandsForHit(hits[i])) bands.push(b);
    }

    const rects = [];
    const ticks = [];
    for (let bi = 0; bi < bands.length; bi++) {
      const band = bands[bi];
      const bucket = bucketFor(band.identity);
      const fill = BUCKET_FILL[bucket];
      const outline = BUCKET_OUTLINE[bucket];

      for (const el of lines) {
        const elKind = el.getAttribute('data-wraptail-kind') || 'main';
        if (elKind !== 'main') continue; // wrap-tail bands not painted (yet)
        const lineStart = parseInt(el.dataset.lineStart || '', 10);
        if (Number.isNaN(lineStart)) continue;
        const lineEnd = lineStart + cpl;
        if (lineEnd <= band.start || lineStart >= band.end) continue;
        const fromCh = Math.max(0, band.start - lineStart);
        const toCh = Math.min(cpl, band.end - lineStart);
        const left = (el.offsetLeft || 0) + (LABEL_WIDTH + fromCh) * charPx;
        const width = (toCh - fromCh) * charPx;

        // 11.05.2026 — strand-aware band. `+` paints the TOP strand row, `-` the BOTTOM; `both`
        // paints BOTH. Falls back to spanning the line when only one strand row is rendered.
        const topStrand = el.querySelector('[data-testid="sequence-view-strands-top"]');
        const bottomStrand = el.querySelector('[data-testid="sequence-view-strands-bottom"]');
        const rows = [];
        if (!topStrand && !bottomStrand) {
          rows.push([band.target === 'bottom' ? 'rev' : 'fwd', null]);
        } else if (band.target === 'both') {
          if (topStrand) rows.push(['fwd', topStrand]);
          if (bottomStrand) rows.push(['rev', bottomStrand]);
        } else if (band.target === 'bottom') {
          rows.push(['rev', bottomStrand || topStrand]);
        } else {
          rows.push(['fwd', topStrand || bottomStrand]);
        }

        let firstTop = null;
        let firstHeight = null;
        for (let ri = 0; ri < rows.length; ri++) {
          const [dir, strandEl] = rows[ri];
          let dnaTop;
          let dnaHeight;
          if (strandEl) {
            dnaTop = el.offsetTop + strandEl.offsetTop;
            dnaHeight = strandEl.offsetHeight;
          } else {
            dnaTop = el.offsetTop;
            dnaHeight = Math.max(8, el.offsetHeight - 14);
          }
          rects.push({
            key: `hit:${bi}:${dir}:${lineStart}`,
            left, top: dnaTop, width, height: dnaHeight, fill, outline,
            strand: dir === 'rev' ? -1 : 1,
          });
          if (ri === 0) { firstTop = dnaTop; firstHeight = dnaHeight; }
        }

        // Mismatch ticks (flat only — canonical carries none) on the first painted row.
        if (band.ticks.length && firstTop !== null) {
          for (let m = 0; m < band.ticks.length; m++) {
            const mp = band.ticks[m];
            if (mp < lineStart || mp >= lineEnd) continue;
            const mLeft = (el.offsetLeft || 0) + (LABEL_WIDTH + (mp - lineStart)) * charPx;
            ticks.push({
              key: `mm:${bi}:${mp}:${lineStart}`,
              left: mLeft, top: firstTop, height: firstHeight,
              width: charPx, // full cell — covers the mismatched letter
            });
          }
        }
      }
    }
    setPaint({ rects, ticks });
    return undefined;
  }, [hits, charPx, charsPerLine, containerRef, layoutEpoch]);

  if (paint.rects.length === 0) return null;
  return (
    <>
      {paint.rects.map((r) => (
        <div
          key={r.key}
          data-testid={`sequence-view-search-hit-${r.strand === -1 ? 'rev' : 'fwd'}`}
          style={{
            position: 'absolute',
            left: r.left, top: r.top, width: r.width, height: r.height,
            background: r.fill,
            outline: `1px solid ${r.outline}`,
            pointerEvents: 'none',
            zIndex: 3,
          }}
        />
      ))}
      {paint.ticks.map((tk) => (
        <div
          key={tk.key}
          data-testid="sequence-view-search-mismatch-tick"
          style={{
            position: 'absolute',
            left: tk.left, top: tk.top, width: tk.width || 7.2, height: tk.height,
            background: 'rgba(220, 38, 38, 0.45)', // red-600 @ 45%
            outline: '1px solid rgba(220, 38, 38, 0.85)',
            pointerEvents: 'none',
            zIndex: 4,
          }}
        />
      ))}
    </>
  );
}
