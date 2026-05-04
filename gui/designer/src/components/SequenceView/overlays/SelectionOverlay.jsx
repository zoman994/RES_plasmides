/**
 * SelectionOverlay — paints a translucent rectangle on every line
 * that intersects the [min(anchor,focus) .. max(anchor,focus)] range.
 * Lives outside the SequenceLine memo cache so extending a selection
 * with shift-arrow doesn't re-render any line.
 *
 * Two parallel rects per line:
 *   - Orange band over the DNA strand row(s) — always shown.
 *   - Blue band over each AA letter row — ONLY when the selection was
 *     made via an AA codon click / drag (selectionMode === 'aa'). A
 *     plain DNA drag leaves AA rows un-highlighted (biolog 04.05.2026
 *     evening: «когда мы явно выделяем ДНК то на АК не должно
 *     появляться выделения»).
 *
 * Half-open range convention: caret at position N renders at the
 * LEFT edge of letter[N], so the selection rect ends at the LEFT
 * edge of letter[end] — no `+1`. The earlier `+1` overshot by one
 * cell at the focus end (biolog 04.05.2026: «каретка и выделение не
 * совпадает в конце»).
 *
 * Extracted from `SequenceView/index.jsx` in Sprint M-X.2 K1
 * decomposition.
 */

import { useLayoutEffect, useState } from "react";
import { LABEL_WIDTH } from "../constants.js";

export default function SelectionOverlay({
  caretPos,
  caretAnchor,
  charPx,
  charsPerLine,
  containerRef,
  showBottomStrand,
  selectionMode,
  selectionStrand,
  selectionFrame,
}) {
  const [rects, setRects] = useState([]);
  useLayoutEffect(() => {
    if (
      caretPos == null || !Number.isFinite(caretPos)
      || caretAnchor == null || !Number.isFinite(caretAnchor)
      || caretAnchor === caretPos
    ) {
      setRects((prev) => (prev.length === 0 ? prev : []));
      return undefined;
    }
    const root = containerRef.current;
    if (!root) return undefined;
    const start = Math.min(caretAnchor, caretPos);
    const end = Math.max(caretAnchor, caretPos);
    const cpl = charsPerLine || 80;
    const lines = root.querySelectorAll('[data-testid="sequence-view-line"]');
    const out = [];
    for (const el of lines) {
      const lineStart = parseInt(el.dataset.lineStart || "", 10);
      if (Number.isNaN(lineStart)) continue;
      const lineEnd = lineStart + cpl;
      if (lineEnd <= start || lineStart >= end) continue;
      const fromCh = Math.max(0, start - lineStart);
      const toCh = Math.min(cpl, end - lineStart);
      const left = (el.offsetLeft || 0) + (LABEL_WIDTH + fromCh) * charPx;
      const width = (toCh - fromCh) * charPx;

      // DNA strand block (orange) — top strand → bottom strand band.
      const topStrand = el.querySelector('[data-testid="sequence-view-strands-top"]');
      let dnaTop;
      let dnaHeight;
      if (topStrand) {
        const bottomStrand = el.querySelector('[data-testid="sequence-view-strands-bottom"]');
        dnaTop = el.offsetTop + topStrand.offsetTop;
        if (bottomStrand) {
          const bottomY = el.offsetTop + bottomStrand.offsetTop + bottomStrand.offsetHeight;
          dnaHeight = bottomY - dnaTop;
        } else {
          dnaHeight = topStrand.offsetHeight;
        }
      } else {
        dnaTop = el.offsetTop;
        dnaHeight = Math.max(8, el.offsetHeight - 14);
      }
      out.push({ left, top: dnaTop, width, height: dnaHeight, key: `${lineStart}:dna`, kind: "dna" });

      // AA letter blocks (blue) — only when biolog explicitly selected
      // a CDS feature / dragged AA cells. Bug-rush #8 (04.05.2026):
      // strand alone wasn't enough — when forward frames +1 / +2 / +3
      // all rendered, the strand filter let through every forward row
      // even though the CDS only occupies ONE reading frame. Now we
      // also match by `data-aa-frame` so exactly one row glows blue.
      if (selectionMode === "aa") {
        const targetStrand = selectionStrand === -1 ? -1 : 1;
        const aaRows = el.querySelectorAll('[data-testid="sequence-view-aa-row"]');
        for (const aaRow of aaRows) {
          const rowStrand = parseInt(aaRow.dataset.aaStrand || "", 10) === -1 ? -1 : 1;
          if (rowStrand !== targetStrand) continue;
          if (Number.isFinite(selectionFrame)) {
            const rowFrame = parseInt(aaRow.dataset.aaFrame || "", 10);
            if (rowFrame !== selectionFrame) continue;
          }
          const aaTop = el.offsetTop + aaRow.offsetTop;
          const aaHeight = aaRow.offsetHeight;
          out.push({
            left,
            top: aaTop,
            width,
            height: aaHeight,
            key: `${lineStart}:aa:${aaRow.dataset.aaLabel || aaRow.dataset.aaFrame || aaRows.length}-${aaTop}`,
            kind: "aa",
          });
        }
      }
    }
    setRects(out);
    return undefined;
  }, [caretPos, caretAnchor, charPx, charsPerLine, containerRef, showBottomStrand, selectionMode, selectionStrand, selectionFrame]);

  if (rects.length === 0) return null;
  return (
    <>
      {rects.map((r) => {
        const isAa = r.kind === "aa";
        return (
          <div
            key={r.key}
            data-testid={isAa ? "sequence-view-selection-aa" : "sequence-view-selection"}
            data-selection-kind={r.kind}
            style={{
              position: "absolute",
              left: r.left,
              top: r.top,
              width: r.width,
              height: r.height,
              background: isAa
                ? "rgba(59, 130, 246, 0.22)"   // blue-500 @ 22%
                : "rgba(249, 115, 22, 0.22)",  // orange-500 @ 22%
              outline: "0.5px solid rgba(0, 0, 0, 0.35)",
              pointerEvents: "none",
              zIndex: 4,
            }}
          />
        );
      })}
    </>
  );
}
