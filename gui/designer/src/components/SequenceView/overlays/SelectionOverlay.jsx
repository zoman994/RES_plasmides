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
  seqLength = 0,
  // V96 — bumped by SequenceView whenever the lines reflow (two-phase
  // tracksReady flip, wrap-tail, charsPerLine). Re-measures the rects
  // against the final layout without waiting for a caret-moving click.
  layoutEpoch = 0,
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
    const cpl = charsPerLine || 80;
    const lines = root.querySelectorAll('[data-testid="sequence-view-line"]');

    // Round-8 wrap-aware selection: each end of [anchor, caret] may
    // live in extended domain (negative = leading-wrap, > seqLength
    // = trailing-wrap). The selection is one-or-two rect segments
    // each scoped to a specific wrap-tail kind:
    //   - normal (both ends in main): one segment in main band only.
    //   - extended via leading-wrap (one end < 0):
    //         segment 1 in leading-wrap [end+seqLen .. seqLen)
    //         segment 2 in main         [0 .. anchor)
    //   - extended via trailing-wrap (one end > seqLen):
    //         segment 1 in main         [anchor .. seqLen)
    //         segment 2 in trailing-wrap [0 .. end-seqLen)
    // Anchor stays in main band by construction (the resolver gates
    // the initial click). caret may have wrapped in either direction.
    const segments = computeSegments(caretAnchor, caretPos, seqLength);
    const out = [];
    // Round-13: locate the wrap-bridge row (line carrying
    // `data-wraps-origin="true"`) so trailing-wrap segments can
    // also paint inside its wrap-half — that half visually
    // continues the trailing strip across origin and was missed
    // before, leaving a gap in the highlight.
    let bridgeEl = null;
    let bridgeStart = 0;
    let bridgeWrapAt = 0;
    for (const el of lines) {
      if (el.getAttribute('data-wraps-origin') === 'true') {
        bridgeEl = el;
        bridgeStart = parseInt(el.dataset.lineStart || '', 10);
        bridgeWrapAt = parseInt(el.dataset.wrapAt || '', 10);
        break;
      }
    }
    const hasBridge = bridgeEl != null
      && Number.isFinite(bridgeStart)
      && Number.isFinite(bridgeWrapAt);
    for (const seg of segments) {
      // For each segment, restrict the line-iteration to rows of the
      // matching kind — leading-wrap rows for «leading» segments,
      // trailing-wrap rows for «trailing», main rows otherwise.
      const wantKind = seg.kind;
      for (const el of lines) {
        const elKind = el.getAttribute('data-wraptail-kind') || 'main';
        if (elKind !== wantKind) continue;
        const lineStart = parseInt(el.dataset.lineStart || "", 10);
        if (Number.isNaN(lineStart)) continue;
        const lineEnd = lineStart + cpl;
        if (lineEnd <= seg.start || lineStart >= seg.end) continue;
        const fromCh = Math.max(0, seg.start - lineStart);
        const toCh = Math.min(cpl, seg.end - lineStart);
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
      // Round-13: if this is a trailing-wrap segment AND a wrap-
      // bridge row exists, also paint inside the bridge's wrap-half.
      // Bridge wrap-half visually shows plasmid coords [0 .. cpl-wrapAt)
      // at columns [wrapAt .. cpl). Selection rect within bridge wrap-
      // half: fromCh = wrapAt + max(0, seg.start),
      //                  toCh = wrapAt + min(cpl-wrapAt, seg.end).
      if (seg.kind === 'trailing-wrap' && hasBridge && bridgeWrapAt < cpl) {
        const bridgeWrapLen = cpl - bridgeWrapAt;
        const fromInWrap = Math.max(0, seg.start);
        const toInWrap = Math.min(bridgeWrapLen, seg.end);
        if (toInWrap > fromInWrap) {
          const fromCh = bridgeWrapAt + fromInWrap;
          const toCh = bridgeWrapAt + toInWrap;
          const left = (bridgeEl.offsetLeft || 0) + (LABEL_WIDTH + fromCh) * charPx;
          const width = (toCh - fromCh) * charPx;
          const topStrand = bridgeEl.querySelector('[data-testid="sequence-view-strands-top"]');
          let dnaTop;
          let dnaHeight;
          if (topStrand) {
            const bottomStrand = bridgeEl.querySelector('[data-testid="sequence-view-strands-bottom"]');
            dnaTop = bridgeEl.offsetTop + topStrand.offsetTop;
            if (bottomStrand) {
              const bottomY = bridgeEl.offsetTop + bottomStrand.offsetTop + bottomStrand.offsetHeight;
              dnaHeight = bottomY - dnaTop;
            } else {
              dnaHeight = topStrand.offsetHeight;
            }
          } else {
            dnaTop = bridgeEl.offsetTop;
            dnaHeight = Math.max(8, bridgeEl.offsetHeight - 14);
          }
          out.push({
            left, top: dnaTop, width, height: dnaHeight,
            key: `${bridgeStart}:bridge-wrap:dna`,
            kind: 'dna',
          });
        }
      }
    }
    setRects(out);
    return undefined;
  }, [caretPos, caretAnchor, charPx, charsPerLine, containerRef, showBottomStrand, selectionMode, selectionStrand, selectionFrame, seqLength, layoutEpoch]);

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

/**
 * Round-8 wrap-aware segments. Translates an extended-domain
 * (anchor, caret) pair into 1 or 2 rendering segments:
 *   { kind, start, end }
 * where `kind ∈ {'main','leading-wrap','trailing-wrap'}` selects
 * which DOM rows to overlay and `[start, end)` are the absolute
 * plasmid coords inside that kind's coordinate frame.
 *
 * Rules:
 *   - both ends in [0, seqLen]: single main segment.
 *   - one end < 0 (came from leading-wrap drag): two segments —
 *       leading-wrap [end+seqLen, seqLen)  +  main [0, anchor]
 *     (covers the «end of plasmid» context strip + the start of
 *     main, i.e. visually two strips around the top origin marker.)
 *   - one end > seqLen (trailing-wrap drag): two segments —
 *       main [anchor, seqLen)  +  trailing-wrap [0, end-seqLen)
 *     (covers main:last + first strip after bottom origin marker.)
 *
 * Anchor is assumed to live in main band (resolver pins it). Both
 * cases above are symmetric — swap anchor/caret as needed.
 */
function computeSegments(anchor, caret, seqLength) {
  const a = anchor;
  const c = caret;
  if (!Number.isFinite(seqLength) || seqLength <= 0) {
    const start = Math.min(a, c);
    const end = Math.max(a, c);
    if (start === end) return [];
    return [{ kind: 'main', start, end }];
  }
  // Caret wrapped via leading-wrap: caret < 0.
  if (c < 0) {
    return [
      { kind: 'leading-wrap', start: c + seqLength, end: seqLength },
      { kind: 'main', start: 0, end: a },
    ].filter((s) => s.end > s.start);
  }
  // Anchor wrapped via leading-wrap (rare — biolog clicked into
  // wrap-tail first; resolver normally prevents this but symmetry).
  if (a < 0) {
    return [
      { kind: 'leading-wrap', start: a + seqLength, end: seqLength },
      { kind: 'main', start: 0, end: c },
    ].filter((s) => s.end > s.start);
  }
  // Caret wrapped via trailing-wrap: caret > seqLength.
  if (c > seqLength) {
    return [
      { kind: 'main', start: a, end: seqLength },
      { kind: 'trailing-wrap', start: 0, end: c - seqLength },
    ].filter((s) => s.end > s.start);
  }
  if (a > seqLength) {
    return [
      { kind: 'main', start: c, end: seqLength },
      { kind: 'trailing-wrap', start: 0, end: a - seqLength },
    ].filter((s) => s.end > s.start);
  }
  // Normal: both in main, single segment.
  const start = Math.min(a, c);
  const end = Math.max(a, c);
  if (start === end) return [];
  return [{ kind: 'main', start, end }];
}
