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

export default function CaretOverlay({ caretPos, charPx, containerRef, showBottomStrand }) {
  const [box, setBox] = useState(null);
  useLayoutEffect(() => {
    if (caretPos == null || !Number.isFinite(caretPos)) {
      setBox((prev) => (prev === null ? prev : null));
      return undefined;
    }
    const root = containerRef.current;
    if (!root) return undefined;
    const lines = root.querySelectorAll('[data-testid="sequence-view-line"]');
    if (lines.length === 0) return undefined;
    let target = null;
    for (const el of lines) {
      const start = parseInt(el.dataset.lineStart || "", 10);
      if (Number.isNaN(start)) continue;
      if (start > caretPos) break;
      target = el;
    }
    if (!target) return undefined;
    const lineStart = parseInt(target.dataset.lineStart, 10);
    const offsetCh = caretPos - lineStart;
    const left = (target.offsetLeft || 0) + (LABEL_WIDTH + offsetCh) * charPx;
    const topStrand = target.querySelector('[data-testid="sequence-view-strands-top"]');
    let top;
    let height;
    if (topStrand) {
      const bottomStrand = target.querySelector('[data-testid="sequence-view-strands-bottom"]');
      top = target.offsetTop + topStrand.offsetTop;
      if (bottomStrand) {
        const bottomY = target.offsetTop + bottomStrand.offsetTop + bottomStrand.offsetHeight;
        height = bottomY - top;
      } else {
        height = topStrand.offsetHeight;
      }
    } else {
      top = target.offsetTop;
      height = Math.max(8, target.offsetHeight - 14);
    }
    setBox({ left, top, height });
    return undefined;
  }, [caretPos, charPx, containerRef, showBottomStrand]);

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
