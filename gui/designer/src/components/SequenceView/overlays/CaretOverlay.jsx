/**
 * CaretOverlay — single absolutely-positioned div drawn over the
 * lines in the scroll container. Lives outside the SequenceLine
 * memoization so caret movement re-renders only THIS component, not
 * the ~60 lines of a typical 8.8 kb plasmid (biolog 04.05.2026:
 * «при перемещении каретки очень лагает … ощущение что рендер каждый
 * раз плазмиды заново при движении каретки»). On caretPos / charPx
 * change a useLayoutEffect probes the DOM for the line containing the
 * caret, reads its offsetTop + offsetHeight, and writes a small
 * box state; React re-renders the overlay div only.
 *
 * Visual: 1.5 px wide accent fill, 0.5 px black box-shadow ring so
 * the caret reads on top of any feature tint underneath (biolog same
 * session: «сама каретка должна иметь чёрную обводку и на колбасе и
 * на сиквенсе»). Spans only the DNA strand row(s); collapses to one
 * row when the bottom strand is hidden.
 *
 * Extracted from `SequenceView/index.jsx` in Sprint M-X.2 K1
 * decomposition. `LABEL_WIDTH` is intentionally re-imported from the
 * same module so the value stays in lockstep with the rest of the
 * viewer.
 */

import { useLayoutEffect, useState } from "react";
import { LABEL_WIDTH } from "../constants.js";

export default function CaretOverlay({ caretPos, charPx, containerRef, showBottomStrand, seqLength = 0, charsPerLine = 0, layoutEpoch = 0, hidden = false }) {
  const [box, setBox] = useState(null);
  useLayoutEffect(() => {
    if (caretPos == null || !Number.isFinite(caretPos)) {
      setBox((prev) => (prev === null ? prev : null));
      return undefined;
    }
    const root = containerRef.current;
    if (!root) return undefined;
    const allLines = root.querySelectorAll('[data-testid="sequence-view-line"]');
    if (allLines.length === 0) return undefined;

    // Reusable strand-band math — pulled into a helper so the bridge
    // branch and the main/leading/trailing branches share the same
    // top/height resolution.
    const measureStrandBand = (el) => {
      const topStrand = el.querySelector('[data-testid="sequence-view-strands-top"]');
      let top;
      let height;
      if (topStrand) {
        const bottomStrand = el.querySelector('[data-testid="sequence-view-strands-bottom"]');
        top = el.offsetTop + topStrand.offsetTop;
        if (bottomStrand) {
          const bottomY = el.offsetTop + bottomStrand.offsetTop + bottomStrand.offsetHeight;
          height = bottomY - top;
        } else {
          height = topStrand.offsetHeight;
        }
      } else {
        top = el.offsetTop;
        height = Math.max(8, el.offsetHeight - 14);
      }
      return { top, height };
    };

    // M-X.5 hotfix (07.05.2026) — bridge wrap-half caret rendering.
    // Round-10 (06.05.2026) folded the trailing wrap-tail into the
    // last main row (the «bridge» line carrying `data-wraps-origin
    // = "true"` + `data-wrap-at = N`). SelectionOverlay round-13
    // already paints inside this bridge wrap-half, but CaretOverlay
    // was still looking for vanished trailing-wrap rows for any
    // caretPos > seqLength → caret stayed invisible / stuck on the
    // last main position. Mirror SelectionOverlay's lookup pattern
    // here: when the extended-domain caret falls into the bridge
    // wrap-half range, render directly on the bridge row at column
    // wrapAt + (caretPos - seqLength). The legacy trailing-wrap
    // path remains as a fallback (round-12 restored those rows
    // BELOW the bridge for drag-selection — the caret should still
    // track there if the wrap offset exceeds the bridge wrap-half
    // length).
    if (Number.isFinite(seqLength) && seqLength > 0 && caretPos > seqLength && charsPerLine > 0) {
      let bridgeEl = null;
      let bridgeWrapAt = 0;
      for (const el of allLines) {
        if (el.getAttribute('data-wraps-origin') === 'true') {
          bridgeEl = el;
          bridgeWrapAt = parseInt(el.dataset.wrapAt || '', 10);
          break;
        }
      }
      if (bridgeEl && Number.isFinite(bridgeWrapAt) && bridgeWrapAt >= 0 && bridgeWrapAt < charsPerLine) {
        const wrapOffset = caretPos - seqLength;
        const wrapHalfLen = charsPerLine - bridgeWrapAt;
        if (wrapOffset >= 0 && wrapOffset <= wrapHalfLen) {
          const offsetCh = bridgeWrapAt + wrapOffset;
          const left = (bridgeEl.offsetLeft || 0) + (LABEL_WIDTH + offsetCh) * charPx;
          const { top, height } = measureStrandBand(bridgeEl);
          setBox({ left, top, height });
          return undefined;
        }
      }
    }

    // Round-8 wrap-aware caret: extended-domain caretPos can be < 0
    // (came from leading-wrap row) or > seqLength (trailing-wrap).
    // Render in the matching wrap-tail row; otherwise stick to main.
    let kindFilter = 'main';
    let realPos = caretPos;
    if (Number.isFinite(seqLength) && seqLength > 0) {
      if (caretPos < 0) {
        kindFilter = 'leading-wrap';
        realPos = caretPos + seqLength;
      } else if (caretPos > seqLength) {
        kindFilter = 'trailing-wrap';
        realPos = caretPos - seqLength;
      }
    }
    const lines = [];
    for (const el of allLines) {
      const k = el.getAttribute('data-wraptail-kind') || 'main';
      if (k === kindFilter || (kindFilter === 'main' && !el.hasAttribute('data-wraptail-kind'))) {
        lines.push(el);
      }
    }
    if (lines.length === 0) return undefined;
    let target = null;
    for (const el of lines) {
      const start = parseInt(el.dataset.lineStart || "", 10);
      if (Number.isNaN(start)) continue;
      if (start > realPos) break;
      target = el;
    }
    if (!target) return undefined;
    const lineStart = parseInt(target.dataset.lineStart, 10);
    const offsetCh = realPos - lineStart;
    const left = (target.offsetLeft || 0) + (LABEL_WIDTH + offsetCh) * charPx;
    const { top, height } = measureStrandBand(target);
    setBox({ left, top, height });
    return undefined;
  }, [caretPos, charPx, containerRef, showBottomStrand, seqLength, charsPerLine, layoutEpoch]);

  // Hide while a primer is selected (Del targets the primer, not the caret).
  // Placed AFTER the hooks (the effect keeps `box` measured) so un-hiding
  // restores the caret without a re-measure pass.
  if (hidden) return null;
  if (!box) return null;
  // 2026-05-06 — biolog: «хочу чтобы каретка курсора двигалась не
  // рывками а как бы быстро проходила визуально через каждый
  // нуклеотид». Translate via `transform` instead of `left`/`top`
  // so the position update can be GPU-composited; pair with a short
  // 80 ms linear transition. On a fast drag through the strip the
  // caret glides instead of jumping. honoured `prefers-reduced-motion`
  // through CSS class below — no animation when user opted out.
  return (
    <div
      data-testid="sequence-view-caret"
      data-caret-pos={caretPos}
      className="sequence-view-caret-anim"
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        height: box.height,
        width: 1.5,
        transform: `translate3d(${box.left}px, ${box.top}px, 0)`,
        background: "var(--accent-500, #f97316)",
        boxShadow: "0 0 0 0.5px #000",
        pointerEvents: "none",
        zIndex: 5,
        willChange: "transform",
      }}
    />
  );
}
