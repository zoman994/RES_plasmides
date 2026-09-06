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
import { complementSegments, invertedStickyStrandRanges } from "../lib/selection-ops.js";
import { selectionDisplaySegments } from "../lib/selection-range.js";

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
  // «Инвертировать выделение» — paint the COMPLEMENT of [anchor,focus]
  // (everything except the selection) as two main segments.
  inverted = false,
  // «Липкие концы» — { leftDelta, rightDelta, … } when the selection ends sit
  // on restriction cuts; the bottom strand highlight is offset by the overhang
  // so the staggered cut is visible.
  stickyEnds = null,
  // «Тянуть до конца» (Игорь 22.06): { rightLen, leftLen, … } for a LINEAR
  // fragment whose terminal overhang protrudes past the duplex. When the
  // selection reaches into it, an extra rect covers the overhang columns so the
  // band continues to the visual end. Null otherwise.
  terminalSelect = null,
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

    // STICKY ENDS — selection ends on restriction cuts → the two strands are
    // cut staggered by the overhang. Paint the top + bottom strand highlights
    // SEPARATELY, the bottom offset by the per-end delta, so the «ступенька»
    // (sticky end) shows. Translucency makes the double-stranded core read
    // darker than the single-stranded overhang slivers. Non-wrapped DNA with a
    // bottom strand only; blunt (0/0) falls through to the combined rect.
    const sLo = Math.min(caretAnchor, caretPos);
    const sHi = Math.max(caretAnchor, caretPos);
    const stickyActive = stickyEnds && !inverted && selectionMode === 'dna'
      && showBottomStrand && (stickyEnds.leftDelta || stickyEnds.rightDelta)
      && sLo >= 0 && sHi <= seqLength;
    if (stickyActive) {
      const ranges = { top: [sLo, sHi], bottom: [sLo + stickyEnds.leftDelta, sHi + stickyEnds.rightDelta] };
      const out = [];
      const pushStrand = (el, strandEl, range, tag) => {
        if (!strandEl) return;
        const lineStart = parseInt(el.dataset.lineStart || '', 10);
        if (Number.isNaN(lineStart)) return;
        const lineEnd = lineStart + cpl;
        const segStart = Math.max(range[0], lineStart);
        const segEnd = Math.min(range[1], lineEnd);
        if (segEnd <= segStart) return;
        const left = (el.offsetLeft || 0) + (LABEL_WIDTH + (segStart - lineStart)) * charPx;
        const width = (segEnd - segStart) * charPx;
        const top = el.offsetTop + strandEl.offsetTop;
        out.push({ left, top, width, height: strandEl.offsetHeight, key: `${lineStart}:${tag}`, kind: 'dna', strand: tag });
      };
      for (const el of lines) {
        if ((el.getAttribute('data-wraptail-kind') || 'main') !== 'main') continue;
        pushStrand(el, el.querySelector('[data-testid="sequence-view-strands-top"]'), ranges.top, 'top');
        pushStrand(el, el.querySelector('[data-testid="sequence-view-strands-bottom"]'), ranges.bottom, 'bottom');
      }
      setRects(out);
      return undefined;
    }

    // STICKY ENDS + INVERT (Игорь 07.07 «при инверсии обжирает липкие концы») — when
    // the biolog inverts a two-cut selection to take the BACKBONE, the excised piece's
    // staircase (above) is gated off by `!inverted`, so the ends looked eaten. Paint the
    // backbone's OWN staircase instead: its top strand wraps the origin
    // ([sHi,len]+[0,sLo]) and its bottom is staggered by each cut's delta at the SAME
    // columns (invertedStickyStrandRanges). The excised INSERT is veiled STRAND-AWARE
    // (top [sLo,sHi] / bottom [sLo+leftDelta,sHi+rightDelta]) — never as a full rectangle,
    // else the veil would re-hide the backbone's overhang sliver protruding into it.
    const stickyInverted = stickyEnds && inverted && selectionMode === 'dna'
      && showBottomStrand && (stickyEnds.leftDelta || stickyEnds.rightDelta)
      && sLo >= 0 && sHi <= seqLength && Number.isFinite(seqLength) && seqLength > 0;
    if (stickyInverted) {
      const clampR = ([a, b]) => [Math.max(0, Math.min(seqLength, a)), Math.max(0, Math.min(seqLength, b))];
      const bb = invertedStickyStrandRanges({
        sLo, sHi, leftDelta: stickyEnds.leftDelta, rightDelta: stickyEnds.rightDelta, seqLength,
      });
      // The excised insert's own strands (the SAME geometry the non-inverted staircase
      // draws) — veiled so the taken backbone reads as the foreground.
      const insTop = [clampR([sLo, sHi])].filter(([a, b]) => b > a);
      const insBot = [clampR([sLo + stickyEnds.leftDelta, sHi + stickyEnds.rightDelta])].filter(([a, b]) => b > a);
      const out = [];
      const pushStrand = (el, strandEl, range, tag, dim) => {
        if (!strandEl) return;
        const lineStart = parseInt(el.dataset.lineStart || '', 10);
        if (Number.isNaN(lineStart)) return;
        const lineEnd = lineStart + cpl;
        const segStart = Math.max(range[0], lineStart);
        const segEnd = Math.min(range[1], lineEnd);
        if (segEnd <= segStart) return;
        const left = (el.offsetLeft || 0) + (LABEL_WIDTH + (segStart - lineStart)) * charPx;
        const width = (segEnd - segStart) * charPx;
        const top = el.offsetTop + strandEl.offsetTop;
        out.push({
          left, top, width, height: strandEl.offsetHeight, key: `${lineStart}:${tag}:${dim ? 'dim' : 'inv'}`, kind: 'dna', strand: tag, dim: !!dim,
        });
      };
      for (const el of lines) {
        if ((el.getAttribute('data-wraptail-kind') || 'main') !== 'main') continue;
        const topEl = el.querySelector('[data-testid="sequence-view-strands-top"]');
        const botEl = el.querySelector('[data-testid="sequence-view-strands-bottom"]');
        for (const r of bb.top) pushStrand(el, topEl, r, 'top', false);
        for (const r of bb.bottom) pushStrand(el, botEl, r, 'bottom', false);
        for (const r of insTop) pushStrand(el, topEl, r, 'top', true);
        for (const r of insBot) pushStrand(el, botEl, r, 'bottom', true);
      }
      setRects(out);
      return undefined;
    }

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
    // Either endpoint may live in a duplicated context row. The shared
    // selection contract projects only the visible portion into each band.
    // Inverted = «выделить ВСЁ, кроме выделенного руками куска» (Игорь 22.06): the
    // COMPLEMENT becomes the orange selection, and the hand-picked piece [lo,hi] is
    // de-selected and rendered as a dim SHADE so it reads as the excluded part.
    // Normal = just the [lo,hi] selection, orange.
    const segments = inverted
      ? [
        ...complementSegments(sLo, sHi, seqLength).map((s) => ({ ...s, dim: false })),
        ...selectionDisplaySegments(caretAnchor, caretPos, seqLength).map((s) => ({ ...s, dim: true })),
      ]
      : selectionDisplaySegments(caretAnchor, caretPos, seqLength);
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
      out.push({ left, top: dnaTop, width, height: dnaHeight, key: `${lineStart}:dna${seg.dim ? ':dim' : ''}`, kind: "dna", dim: !!seg.dim });

      // AA letter blocks (blue) — only when biolog explicitly selected
      // a CDS feature / dragged AA cells. Bug-rush #8 (04.05.2026):
      // strand alone wasn't enough — when forward frames +1 / +2 / +3
      // all rendered, the strand filter let through every forward row
      // even though the CDS only occupies ONE reading frame. Now we
      // also match by `data-aa-frame` so exactly one row glows blue.
      if (selectionMode === "aa" && !inverted) {
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

    // «Тянуть до конца» (Игорь 22.06): an additive rect over the protruding
    // terminal overhang when the selection reaches past the duplex. DNA mode only
    // (the overhang is single-stranded, no AA). Column math mirrors StrandsTrack:
    // the right overhang sits at [LABEL_WIDTH + lineLen ..], the left in the gutter.
    if (terminalSelect && selectionMode !== 'aa' && !inverted) {
      const spans = terminalOverhangSpans(caretAnchor, caretPos, seqLength, terminalSelect);
      for (const sp of spans) {
        let target = null;
        for (const el of lines) {
          if ((el.getAttribute('data-wraptail-kind') || 'main') !== 'main') continue;
          const ls = parseInt(el.dataset.lineStart || '', 10);
          if (Number.isNaN(ls)) continue;
          const ll = Math.min(cpl, seqLength - ls);
          if (sp.end === 'right' && ls + ll >= seqLength) target = { el, ll };
          if (sp.end === 'left' && ls === 0) { target = { el, ll }; break; }
        }
        if (!target) continue;
        const { el, ll } = target;
        const topStrand = el.querySelector('[data-testid="sequence-view-strands-top"]');
        let dnaTop;
        let dnaHeight;
        if (topStrand) {
          const bottomStrand = el.querySelector('[data-testid="sequence-view-strands-bottom"]');
          dnaTop = el.offsetTop + topStrand.offsetTop;
          dnaHeight = bottomStrand
            ? (el.offsetTop + bottomStrand.offsetTop + bottomStrand.offsetHeight) - dnaTop
            : topStrand.offsetHeight;
        } else {
          dnaTop = el.offsetTop;
          dnaHeight = Math.max(8, el.offsetHeight - 14);
        }
        let leftCol;
        let widthCols;
        if (sp.end === 'right') {
          leftCol = LABEL_WIDTH + ll;
          widthCols = sp.len;
        } else {
          leftCol = Math.max(0, LABEL_WIDTH - sp.len);
          widthCols = Math.min(sp.len, LABEL_WIDTH);
        }
        out.push({
          left: (el.offsetLeft || 0) + leftCol * charPx,
          top: dnaTop,
          width: widthCols * charPx,
          height: dnaHeight,
          key: `term-${sp.end}`,
          kind: 'dna',
          terminalEnd: sp.end,
        });
      }
    }
    setRects(out);
    return undefined;
  }, [caretPos, caretAnchor, charPx, charsPerLine, containerRef, showBottomStrand, selectionMode, selectionStrand, selectionFrame, seqLength, layoutEpoch, inverted, stickyEnds, terminalSelect]);

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
            data-strand={r.strand || undefined}
            data-terminal-end={r.terminalEnd || undefined}
            data-inverted={r.dim ? "true" : undefined}
            style={{
              position: "absolute",
              left: r.left,
              top: r.top,
              width: r.width,
              height: r.height,
              // `dim` rects = the hand-picked piece EXCLUDED by an inverted
              // selection — the SAME light veil the out-of-range mask uses for the
              // un-selected area in a normal selection (Игорь 23.06: «думал, оно
              // будет белым затеняться, как невыбранная область»). Everything else
              // is the normal selection band: orange (DNA) / blue (AA).
              background: r.dim
                ? "rgba(245, 245, 244, 0.65)"  // matches OutOfRangeMaskOverlay
                : isAa
                  ? "rgba(59, 130, 246, 0.22)" // blue-500 @ 22%
                  : "rgba(249, 115, 22, 0.22)", // orange-500 @ 22%
              outline: r.dim ? "none" : "0.5px solid rgba(0, 0, 0, 0.35)",
              pointerEvents: "none",
              zIndex: r.dim ? 5 : 4,
            }}
          />
        );
      })}
    </>
  );
}
/**
 * terminalOverhangSpans — which protruding terminal overhangs the selection
 * [anchor,caret] reaches into, and how many columns of each. Right when the
 * selection's max > seqLength, left when its min < 0. Pure; returns [] when
 * terminalSelect is null or the selection stays within the duplex.
 */
export function terminalOverhangSpans(anchor, caret, seqLength, terminalSelect) {
  if (!terminalSelect || !Number.isFinite(anchor) || !Number.isFinite(caret)) return [];
  const lo = Math.min(anchor, caret);
  const hi = Math.max(anchor, caret);
  const rLen = terminalSelect.rightLen || 0;
  const lLen = terminalSelect.leftLen || 0;
  const spans = [];
  if (rLen && hi > seqLength) spans.push({ end: 'right', len: Math.min(rLen, hi - seqLength) });
  if (lLen && lo < 0) spans.push({ end: 'left', len: Math.min(lLen, -lo) });
  return spans;
}
