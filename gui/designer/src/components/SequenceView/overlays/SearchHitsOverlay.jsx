/**
 * SearchHitsOverlay — paints translucent rectangles over the DNA
 * strand for every search hit (M-X.9 K2 follow-up,
 * TD-SEARCH-OVERLAY-RECTS).
 *
 * Hits come from `state.searchHits` (uiSlice). Bucketed by
 * `queryIdentity` per FAIL-fix-pass 6:
 *   • ≥90% green
 *   • 80-89% amber
 *   • 70-79% orange
 *   • <70% grey (rare — slider relaxed)
 *
 * Mismatch positions (`hit.mismatchPositions`, absolute target
 * coordinates) get a thin red vertical tick on the strand band.
 *
 * Wrap-tail bands are NOT painted yet — for circular plasmids the
 * rect appears only on the «main» row. Bridge / wrap-tail support
 * is a follow-up if biolog asks for it.
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

export default function SearchHitsOverlay({
  hits,
  charPx,
  charsPerLine,
  containerRef,
  // V96 — bumped by SequenceView on every line reflow so hit rects
  // re-measure against the final layout without a caret-moving click.
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

    const rects = [];
    const ticks = [];
    for (let i = 0; i < hits.length; i++) {
      const hit = hits[i];
      const start = Math.max(0, hit.targetStart);
      const end = Math.max(start, hit.targetEnd);
      if (end <= start) continue;
      const bucket = bucketFor(hit.queryIdentity ?? hit.identity ?? 0);
      const fill = BUCKET_FILL[bucket];
      const outline = BUCKET_OUTLINE[bucket];

      for (const el of lines) {
        const elKind = el.getAttribute('data-wraptail-kind') || 'main';
        if (elKind !== 'main') continue; // wrap-tail bands not painted (yet)
        const lineStart = parseInt(el.dataset.lineStart || '', 10);
        if (Number.isNaN(lineStart)) continue;
        const lineEnd = lineStart + cpl;
        if (lineEnd <= start || lineStart >= end) continue;
        const fromCh = Math.max(0, start - lineStart);
        const toCh = Math.min(cpl, end - lineStart);
        const left = (el.offsetLeft || 0) + (LABEL_WIDTH + fromCh) * charPx;
        const width = (toCh - fromCh) * charPx;

        // 11.05.2026 — strand-aware band. Forward hit (strand=+1)
        // paints over the TOP strand row only; reverse hit
        // (strand=-1) paints over the BOTTOM strand row only.
        // Matches the SnapGene / Benchling convention so biolog
        // can see at a glance which strand carries the match.
        // Falls back to spanning both strands when only one strand
        // row is available (linear single-strand renderer).
        const topStrand = el.querySelector('[data-testid="sequence-view-strands-top"]');
        const bottomStrand = el.querySelector('[data-testid="sequence-view-strands-bottom"]');
        let dnaTop;
        let dnaHeight;
        if (hit.strand === -1 && bottomStrand) {
          dnaTop = el.offsetTop + bottomStrand.offsetTop;
          dnaHeight = bottomStrand.offsetHeight;
        } else if (topStrand) {
          dnaTop = el.offsetTop + topStrand.offsetTop;
          dnaHeight = topStrand.offsetHeight;
        } else if (bottomStrand) {
          dnaTop = el.offsetTop + bottomStrand.offsetTop;
          dnaHeight = bottomStrand.offsetHeight;
        } else {
          dnaTop = el.offsetTop;
          dnaHeight = Math.max(8, el.offsetHeight - 14);
        }
        rects.push({
          key: `hit:${i}:${lineStart}`,
          left, top: dnaTop, width, height: dnaHeight,
          fill, outline,
          strand: hit.strand,
        });

        // Mismatch ticks within this line.
        if (Array.isArray(hit.mismatchPositions)) {
          for (let m = 0; m < hit.mismatchPositions.length; m++) {
            const mp = hit.mismatchPositions[m];
            if (mp < lineStart || mp >= lineEnd) continue;
            const mLeft = (el.offsetLeft || 0) + (LABEL_WIDTH + (mp - lineStart)) * charPx;
            ticks.push({
              key: `mm:${i}:${mp}`,
              left: mLeft, top: dnaTop, height: dnaHeight,
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
      {paint.ticks.map((t) => (
        <div
          key={t.key}
          data-testid="sequence-view-search-mismatch-tick"
          style={{
            position: 'absolute',
            // 11.05.2026 — full-cell-wide red box (was a 2 px tick).
            // Biolog needs to see WHICH nucleotide is the mismatch
            // at a glance; a thin line was easy to miss against the
            // green hit-band. Translucent so the underlying letter
            // still reads through.
            left: t.left, top: t.top, width: t.width || 7.2, height: t.height,
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
