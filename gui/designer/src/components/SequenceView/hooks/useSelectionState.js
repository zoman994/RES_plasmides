/**
 * useSelectionState — encapsulates SequenceView's pointer-driven
 * selection (DNA drag, AA-cell drag, annotation-rect click,
 * right-click context menu, click fallback, edge auto-scroll, copy
 * dispatcher) in one hook.
 *
 * Returns a bundle of refs, callbacks, and the contextMenu state —
 * the orchestrator wires them onto the SequenceView root <div> and
 * renders <SelectionContextMenu> with the menu state.
 *
 * Internal state / refs (all hoisted before any early-return in
 * `index.jsx` — Rules-of-Hooks fix from 04.05.2026 evening):
 *   - contextMenu: { x, y } | null
 *   - dragRef:        { active, pointerId, mode?, anchorMid?, strand? }
 *   - pointerMovedRef: boolean — gates the synthetic click that
 *     follows pointerup on a drag (without it dragged-out
 *     selections collapse on the trailing click).
 *   - lastPointerCoordsRef: { clientX, clientY, target } — driven
 *     by pointermove for the edge auto-scroll RAF tick.
 *   - autoScrollRafRef: rAF id for the running auto-scroll loop.
 *
 * Why a single hook (instead of separate useDrag / useAutoScroll /
 * useContextMenu): the four pieces share `dragRef.current.active`
 * + `pointerMovedRef.current` reads/writes across pointerdown,
 * pointermove, pointerup, click. Splitting would force a public
 * shared-ref API and obscure the lifecycle. K1 keeps the lifetime
 * intact; K3 will extend the AA-cell branch with the `H` / `E`
 * popups but leave the rest unchanged.
 *
 * Sprint M-X.2 K1 decomposition. Behavior strictly identical to the
 * inline code — no logic changes, only relocation.
 */

import { useEffect, useRef, useState } from "react";
import { reverseComplement } from "../../../sequence-utils";
import { translateDNA } from "../../../codons";
import { findScrollingAncestor } from "../lib/scroll-handle.js";
import { invertedSlice } from "../lib/selection-ops.js";
import { LABEL_WIDTH } from "../constants.js";
import { registerCopySource, setActiveCopySource } from "../../../lib/global-copy.js";
import {
  canonicalSequenceCaret,
  selectionSlice,
  terminalCaretBounds,
} from "../lib/selection-range.js";

export { selectionSlice, terminalCaretBounds } from "../lib/selection-range.js";

function findSequenceLineElement(node, stopAt) {
  let el = node;
  while (el && el !== stopAt) {
    const testId = el.getAttribute?.('data-testid');
    const hasLineMetadata = el.dataset?.lineStart != null
      && (el.dataset.wraptailKind != null || el.dataset.wrapsOrigin != null);
    if (testId === 'sequence-view-line' || hasLineMetadata) return el;
    el = el.parentElement;
  }
  return null;
}

export function useSelectionState({
  fullSeq,
  seqLength,
  charsPerLine,
  charPx,
  caretPos,
  caretAnchor,
  selectionMode,
  selectionStrand,
  circular = false,
  // «Тянуть до конца» (Игорь 22.06): { rightLen, leftLen, rightBases, leftBases }
  // for a LINEAR fragment whose terminal overhang protrudes on the bottom strand
  // past the duplex. Lets the caret reach the overhang + copy it. Null otherwise.
  terminalSelect = null,
  onCaretChange,
  onSelectRange,
  containerRef,
}) {
  const [contextMenu, setContextMenu] = useState(null);
  const dragRef = useRef({ active: false, pointerId: null });
  const pointerMovedRef = useRef(false);
  const lastPointerCoordsRef = useRef(null);
  const autoScrollRafRef = useRef(null);

  // «Инвертировать выделение» — flips what is painted/copied to the COMPLEMENT
  // of [anchor,focus]. Reset on every selection change so a new pick starts
  // un-inverted; toggling is a no-op without a selection.
  const [inverted, setInverted] = useState(false);
  const hasSel = Number.isFinite(caretAnchor) && Number.isFinite(caretPos) && caretAnchor !== caretPos;
  const toggleInverted = () => setInverted((v) => (hasSel ? !v : false));
  useEffect(() => { setInverted(false); }, [caretAnchor, caretPos]);

  // Close the context menu on any pointer-down outside it.
  useEffect(() => {
    if (!contextMenu) return undefined;
    const close = () => setContextMenu(null);
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

  // HOOK-11 — clean up the auto-scroll RAF chain on unmount. The
  // recursive `tickAutoScroll` only stops on `pointerup` / a 0-direction
  // probe; if the SequenceView unmounts mid-drag (modal close, route
  // change, parent re-mount) `pointerup` never fires on the lost root,
  // so the RAF chain keeps calling `scroller.scrollBy` and
  // `onCaretChange` against an unmounted component → setState warnings
  // + leaked closures. This guards against that case.
  useEffect(() => () => {
    if (autoScrollRafRef.current != null) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
  }, []);

  // ---------------------------------------------------------------
  // Pointer → seq position resolver
  // ---------------------------------------------------------------
  // Round 8 (06.05.2026 biolog): «не выделяется последняя буква» +
  // «хотелось бы перенести выделение на призрачный участок сверху и
  // снизу — фича может быть на обоих концах».
  //
  // Three behaviours combined here:
  //   1) Last-char inclusion. Old code clamped to `seqLength - 1`, so
  //      selection [start, end) could never reach the final nt. Now
  //      caret can land at `seqLength` (= «after the last nt»), and
  //      a drag uses Math.ceil so partial cover counts as included.
  //   2) Wrap-tail rows are LIVE during a drag (not on plain click).
  //      A pointermove that lands on a leading-wrap row reports caret
  //      in the EXTENDED domain (negative coord = «before position 0
  //      via the wrap»). A pointermove on a trailing-wrap row reports
  //      caret > seqLength. Anchor stays where biolog initially
  //      pressed (always in main band — pointer-events: none on
  //      wrap-tail keeps initial click in main).
  //   3) Click on wrap-tail row remains no-op (returns null) so the
  //      caret never «teleports» into the dim context strip.
  //
  // Extended caret domain: caret ∈ (-seqLength, 2 × seqLength).
  // Negative = wrapped from leading-wrap; > seqLength = wrapped via
  // trailing-wrap. Selection rendering + copy slice the modular range
  // accordingly.
  const posFromPointerEvent = (e, opts = {}) => {
    if (!seqLength || !charPx) return null;
    // Ruler/strand/track descendants also expose data-line-start, but circular
    // wrap metadata belongs to the outer sequence-view-line. Resolve that
    // owner or a nested leading run is mistaken for an ordinary main row.
    let el = findSequenceLineElement(e.target, containerRef.current);
    // Drag fast path: setPointerCapture rebinds `e.target` to the root, so the
    // walk above fails on EVERY pointermove → without this we'd scan every
    // line's getBoundingClientRect below (O(lines) forced layout per move at
    // ~60 Hz = «выделение глючит»). A single hit-test at the pointer finds the
    // line directly; the wrap-tail/main gating downstream is unchanged. Same
    // technique already used by the AA-drag + auto-scroll branches.
    if ((!el || el === containerRef.current)
        && typeof document !== 'undefined' && typeof document.elementFromPoint === 'function'
        && Number.isFinite(e.clientX) && Number.isFinite(e.clientY)) {
      let hit = document.elementFromPoint(e.clientX, e.clientY);
      el = findSequenceLineElement(hit, containerRef.current);
    }
    // Fallback: y-bounded line search. During a drag, INCLUDE
    // wrap-tail rows so the extended-domain caret can engage.
    if (!el || el === containerRef.current) {
      const lines = containerRef.current?.querySelectorAll('[data-testid="sequence-view-line"]');
      if (!lines) return null;
      for (const candidate of lines) {
        const k = candidate.getAttribute('data-wraptail-kind');
        // Skip wrap-tail on plain click; engage on drag.
        if (!opts.extending && !opts.allowWrapAnchor && k && k !== 'main') continue;
        let r;
        try { r = candidate.getBoundingClientRect(); } catch { continue; }
        if (e.clientY >= r.top && e.clientY <= r.bottom) {
          el = candidate;
          break;
        }
      }
      if (!el) return null;
    }
    const kind = (el.getAttribute && el.getAttribute('data-wraptail-kind')) || 'main';
    // Plain click on wrap-tail remains a no-op. Pointerdown may explicitly
    // resolve it as a PENDING drag anchor; it is committed only after motion.
    if (!opts.extending && !opts.allowWrapAnchor && kind !== 'main') return null;
    const lineStart = parseInt(el.dataset.lineStart, 10);
    if (Number.isNaN(lineStart)) return null;
    // Round-14: bridge line carries data-wraps-origin + data-wrap-at.
    // Pointer in its WRAP-HALF (offsetCh >= wrapAt) needs to emit an
    // extended-domain caret (> seqLength), same as a true trailing-
    // wrap row — biolog «одна буква в призраке не выделяется» came
    // from bridge wrap-half clamping caret to seqLength when the
    // pointer was actually past origin.
    const wrapsOrigin = el.getAttribute && el.getAttribute('data-wraps-origin') === 'true';
    const bridgeWrapAt = wrapsOrigin
      ? parseInt(el.dataset.wrapAt || '0', 10)
      : 0;
    let rect;
    try { rect = el.getBoundingClientRect(); } catch { return null; }
    if (!rect || !rect.width) return null;
    const x = e.clientX - rect.left;
    const rawOffset = x / charPx - LABEL_WIDTH;
    // Round-15b (06.05.2026 «всё равно есть буква»): direction-aware
    // rounding by ROW KIND, not numeric anchor comparison. Numeric
    // compare misfires on wrap-aware drag — leading-wrap row coords
    // (e.g. 4668) are numerically GREATER than a main anchor (e.g. 100)
    // even though the drag direction is conceptually LEFTWARD through
    // origin.
    //
    //   - main row: compare provisional vs anchor (true L/R direction).
    //   - leading-wrap row: drag walks LEFT from main:first through
    //     origin → use floor so the hovered cell stays inside the
    //     [c+seqLen, seqLen) leading segment.
    //   - trailing-wrap row OR bridge wrap-half: drag walks RIGHT from
    //     main:last through origin → ceil so the hovered cell stays
    //     inside [0, c-seqLen) trailing segment.
    let offsetCh;
    if (opts.extending) {
      if (kind === 'leading-wrap') {
        offsetCh = Math.floor(rawOffset);
      } else if (kind === 'trailing-wrap') {
        offsetCh = Math.ceil(rawOffset);
      } else if (wrapsOrigin && rawOffset > bridgeWrapAt) {
        offsetCh = Math.ceil(rawOffset);
      } else {
        // main row drag — anchor compare
        const provisional = lineStart + rawOffset;
        const anchorPos = Number.isFinite(opts.anchor) ? opts.anchor : null;
        if (anchorPos != null && provisional < anchorPos) {
          offsetCh = Math.floor(rawOffset);
        } else {
          offsetCh = Math.ceil(rawOffset);
        }
      }
    } else {
      offsetCh = Math.round(rawOffset);
    }
    // Bridge wrap-half engagement: pointer at column >= wrapAt is
    // POST-origin. Map to (offsetCh - wrapAt) plasmid coord +
    // seqLength to put the caret in the extended-trailing domain.
    if (wrapsOrigin && Number.isFinite(bridgeWrapAt) && bridgeWrapAt > 0
        && offsetCh > bridgeWrapAt) {
      const cpl = charsPerLine || 80;
      const wrapPos = Math.max(0, Math.min(cpl - bridgeWrapAt, offsetCh - bridgeWrapAt));
      // The bridge's duplicated half is a ghost row even though its DOM kind
      // is `main`. It may seed/extend a drag, but a plain click must not leave
      // the controlled caret outside [0, seqLength].
      if (!opts.extending && !opts.allowWrapAnchor) return null;
      return wrapPos + seqLength;
    }
    const lineLen = Math.min(charsPerLine || 80, seqLength - lineStart);
    // «Тянуть до конца» (Игорь): on a LINEAR fragment let the caret cross the
    // duplex edge into the protruding terminal overhang — right end up to
    // seqLength+rightLen on the LAST line, left end down to -leftLen on the FIRST.
    // terminalSelect is null for circular / blunt → rExtra/lExtra collapse to 0
    // and the clamp is byte-identical to the old [0, lineLen] / [0, seqLength].
    const rExtra = (terminalSelect && (lineStart + lineLen >= seqLength)) ? (terminalSelect.rightLen || 0) : 0;
    const lExtra = (terminalSelect && lineStart === 0) ? (terminalSelect.leftLen || 0) : 0;
    const clamped = Math.max(-lExtra, Math.min(lineLen + rExtra, offsetCh));
    const realPos = lineStart + clamped;
    // Wrap-aware emission: leading-wrap → negative coord, trailing-
    // wrap → > seqLength. Main → in [-leftLen, seqLength+rightLen].
    if (kind === 'leading-wrap') {
      return realPos - seqLength; // e.g. 4900 → -48 on 4948 bp
    }
    if (kind === 'trailing-wrap') {
      return realPos + seqLength; // e.g. 100 → 5048 on 4948 bp
    }
    const { min: tMin, max: tMax } = terminalCaretBounds(seqLength, terminalSelect);
    return Math.max(tMin, Math.min(tMax, realPos));
  };

  // ---------------------------------------------------------------
  // Pointer down — AA cell, annotation rect, or plain caret place
  // ---------------------------------------------------------------
  const onRootPointerDown = (e) => {
    if (e.button != null && e.button !== 0) return; // primary button only

    // Mark THIS view as the active copy source — a global Ctrl+C now
    // copies the selection the biolog last touched, even after focus
    // moves to a side-panel.
    setActiveCopySource(copySourceRef.current);

    // 13.05.2026 — Restriction-site click? Bail out so we don't
    // preventDefault (which kills the synthesised click on the
    // `<g sequence-view-re-site>`). RestrictionTrack handles its own
    // mousedown/click; root caret-placement не должен встревать.
    {
      let reEl = e.target;
      while (reEl && reEl !== containerRef.current) {
        if (reEl.getAttribute
            && reEl.getAttribute('data-testid') === 'sequence-view-re-site') break;
        reEl = reEl.parentElement;
      }
      if (reEl && reEl !== containerRef.current) {
        return;
      }
    }

    // A logical primer occurrence may be split into a binding group and a
    // separately wrapped 5′ tail. Both expose the same canonical marker, so
    // neither press becomes DNA caret placement / pointer capture.
    // caret-placement / setPointerCapture / preventDefault don't STEAL
    // the click+dblclick from the primer's own <g> handlers. Без этого
    // pointer-capture на root уводит click мимо праймера (Игорь «клик
    // по праймеру не работает» — проявилось когда стрелки переехали
    // вплотную к цепи и стали попадать в posFromPointerEvent).
    {
      let pEl = e.target;
      while (pEl && pEl !== containerRef.current) {
        if (pEl.getAttribute
            && pEl.getAttribute('data-primer-interactive') === 'true') break;
        pEl = pEl.parentElement;
      }
      if (pEl && pEl !== containerRef.current) {
        return;
      }
    }

    // 05.06.2026 — strip-junction glyph click? Bail (same class as RE-site /
    // primer above). The glyph is a <button data-testid="sequence-view-junction">
    // in SegmentZonesOverlay with its own onClick (→ OPEN_JUNCTION_METHOD_PICKER);
    // it stops onClick but NOT onPointerDown, so without this bail root
    // setPointerCapture steals pointerup → the button's click never fires (Игорь
    // «стык появился, но не кликабелен», JUNCTION step-2 visual acceptance #2).
    {
      let jEl = e.target;
      while (jEl && jEl !== containerRef.current) {
        if (jEl.getAttribute
            && jEl.getAttribute('data-testid') === 'sequence-view-junction') break;
        jEl = jEl.parentElement;
      }
      if (jEl && jEl !== containerRef.current) {
        return;
      }
    }

    // AA cell? Select the underlying triplet, start an AA-drag.
    if (typeof onSelectRange === "function") {
      let aaEl = e.target;
      while (aaEl && aaEl !== containerRef.current) {
        if (aaEl.dataset && aaEl.dataset.aaPos != null) break;
        aaEl = aaEl.parentElement;
      }
      if (aaEl && aaEl !== containerRef.current && aaEl.dataset && aaEl.dataset.aaPos != null) {
        const aaMid = parseInt(aaEl.dataset.aaPos, 10);
        if (Number.isFinite(aaMid)) {
          e.preventDefault();
          const aaStrand = parseInt(aaEl.dataset.aaStrand || "", 10) === -1 ? -1 : 1;
          const start = Math.max(0, aaMid - 1);
          const end = Math.min(seqLength, aaMid + 2);
          onSelectRange(start, end, "aa", aaStrand);
          dragRef.current = {
            active: true,
            pointerId: e.pointerId,
            mode: "aa",
            anchorMid: aaMid,
            strand: aaStrand,
          };
          pointerMovedRef.current = true;
          try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
          try { containerRef.current?.focus({ preventScroll: true }); } catch { /* noop */ }
          return;
        }
      }
    }

    // Annotation rect? Select the WHOLE feature.
    if (typeof onSelectRange === "function") {
      let el = e.target;
      while (el && el !== containerRef.current) {
        if (
          el.getAttribute
          && el.getAttribute("data-testid") === "sequence-view-annotation"
        ) break;
        el = el.parentElement;
      }
      if (el && el !== containerRef.current && el.dataset
          && el.dataset.regionStart != null && el.dataset.regionEnd != null) {
        const rs = parseInt(el.dataset.regionStart, 10);
        const re = parseInt(el.dataset.regionEnd, 10);
        if (Number.isFinite(rs) && Number.isFinite(re) && re > rs) {
          e.preventDefault();
          const t = String(el.dataset.regionType || "").toLowerCase();
          const isCdsLike = t === "cds" || t === "gene" || t === "marker" || t === "reporter";
          const strand = parseInt(el.dataset.regionStrand || "", 10) === -1 ? -1 : 1;
          onSelectRange(rs, re, isCdsLike ? "aa" : "dna", strand);
          try { containerRef.current?.focus({ preventScroll: true }); } catch { /* noop */ }
          pointerMovedRef.current = true;
          return;
        }
      }
    }

    if (typeof onCaretChange !== "function") return;
    const pos = posFromPointerEvent(e, { allowWrapAnchor: circular });
    if (pos == null) return;
    const pendingWrapAnchor = circular && (pos < 0 || pos > seqLength);
    const continuingSelection = !!e.shiftKey && Number.isFinite(caretAnchor);
    dragRef.current = {
      active: true,
      pointerId: e.pointerId,
      // Shift-drag moves the focus of the controlled selection. Its anchor is
      // the existing anchor, not the point where the second gesture began.
      anchorPos: continuingSelection ? caretAnchor : pos,
      lastPos: pos,
      anchorCommitted: continuingSelection || !pendingWrapAnchor,
    };
    pointerMovedRef.current = false;
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    if (!pendingWrapAnchor) {
      onCaretChange(pos, { extendSelection: !!e.shiftKey, needsScroll: false });
    }
    try { containerRef.current?.focus({ preventScroll: true }); } catch { /* noop */ }
    e.preventDefault();
  };

  // ---------------------------------------------------------------
  // Edge auto-scroll while the pointer sits within EDGE_THRESHOLD
  // ---------------------------------------------------------------
  const stopAutoScroll = () => {
    if (autoScrollRafRef.current != null) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
  };
  const extendDnaDragTo = (rawPos) => {
    const drag = dragRef.current;
    if (!drag.active || drag.mode === 'aa' || !Number.isFinite(rawPos)) return;
    const anchor = Number.isFinite(drag.anchorPos) ? drag.anchorPos : caretAnchor;
    let pos = rawPos;
    // One physical gesture may traverse the ring once, never select the same
    // nucleotide twice through duplicated context rows.
    if (circular && Number.isFinite(anchor) && seqLength > 0) {
      pos = Math.max(anchor - seqLength, Math.min(anchor + seqLength, pos));
    }
    if (pos === drag.lastPos) return;
    if (!drag.anchorCommitted) {
      onCaretChange(anchor, {
        extendSelection: false,
        needsScroll: false,
        forceAnchor: true,
      });
      drag.anchorCommitted = true;
    }
    drag.lastPos = pos;
    pointerMovedRef.current = true;
    onCaretChange(pos, { extendSelection: true, needsScroll: false });
  };
  const tickAutoScroll = (direction, scroller) => {
    const EDGE_SPEED = 18; // px/frame
    scroller.scrollBy({ top: direction * EDGE_SPEED, behavior: "auto" });
    const last = lastPointerCoordsRef.current;
    if (last && dragRef.current.active) {
      const target = document.elementFromPoint(last.clientX, last.clientY) || last.target;
      const synth = { clientX: last.clientX, clientY: last.clientY, target };
      const anchor = dragRef.current.anchorPos;
      const pos = posFromPointerEvent(synth, { extending: true, anchor });
      if (pos != null && typeof onCaretChange === "function") extendDnaDragTo(pos);
    }
    autoScrollRafRef.current = requestAnimationFrame(() => tickAutoScroll(direction, scroller));
  };
  const updateAutoScroll = (clientY) => {
    if (!dragRef.current.active) { stopAutoScroll(); return; }
    const scroller = findScrollingAncestor(containerRef.current);
    if (!scroller) { stopAutoScroll(); return; }
    let rect;
    try { rect = scroller.getBoundingClientRect(); } catch { stopAutoScroll(); return; }
    const EDGE_THRESHOLD = 28;
    let direction = 0;
    if (clientY < rect.top + EDGE_THRESHOLD) direction = -1;
    else if (clientY > rect.bottom - EDGE_THRESHOLD) direction = +1;
    if (direction === 0) { stopAutoScroll(); return; }
    if (autoScrollRafRef.current != null) return; // already ticking
    autoScrollRafRef.current = requestAnimationFrame(() => tickAutoScroll(direction, scroller));
  };

  // ---------------------------------------------------------------
  // Pointer move — DNA drag (caret extend) OR AA-drag (codon-aligned)
  // ---------------------------------------------------------------
  const onRootPointerMove = (e) => {
    if (!dragRef.current.active) return;
    if (dragRef.current.pointerId != null && e.pointerId !== dragRef.current.pointerId) return;
    lastPointerCoordsRef.current = { clientX: e.clientX, clientY: e.clientY, target: e.target };
    updateAutoScroll(e.clientY);

    if (dragRef.current.mode === "aa" && typeof onSelectRange === "function") {
      // setPointerCapture rebinds e.target → query real DOM stack.
      const hit = (typeof document !== "undefined" && typeof document.elementFromPoint === "function")
        ? document.elementFromPoint(e.clientX, e.clientY)
        : e.target;
      let aaEl = hit;
      while (aaEl && aaEl !== containerRef.current) {
        if (aaEl.dataset && aaEl.dataset.aaPos != null) break;
        aaEl = aaEl.parentElement;
      }
      if (aaEl && aaEl !== containerRef.current && aaEl.dataset && aaEl.dataset.aaPos != null) {
        const curMid = parseInt(aaEl.dataset.aaPos, 10);
        if (Number.isFinite(curMid)) {
          const a = dragRef.current.anchorMid;
          const lo = Math.min(a, curMid) - 1;
          const hi = Math.max(a, curMid) + 2;
          const start = Math.max(0, lo);
          const end = Math.min(seqLength, hi);
          pointerMovedRef.current = true;
          onSelectRange(start, end, "aa", dragRef.current.strand || 1);
        }
      }
      return;
    }

    const anchor = dragRef.current.anchorPos;
    const pos = posFromPointerEvent(e, { extending: true, anchor });
    if (pos == null) return;
    extendDnaDragTo(pos);
  };

  const finishPointerGesture = (e, commitFinal) => {
    if (!dragRef.current.active) return;
    if (dragRef.current.pointerId != null && e.pointerId !== dragRef.current.pointerId) return;
    const drag = dragRef.current;
    if (commitFinal && drag.mode !== 'aa') {
      const anchor = drag.anchorPos;
      // A pending ghost anchor is still a plain click until real motion has
      // committed it. Resolve that pointerup with click rounding; using drag
      // ceil/floor here can turn the exact same fractional screen coordinate
      // into an adjacent base and fabricate a 1-bp selection on the bridge.
      const extending = drag.anchorCommitted || pointerMovedRef.current;
      const pos = posFromPointerEvent(e, {
        extending,
        allowWrapAnchor: circular && !extending,
        anchor,
      });
      if (pos != null) {
        extendDnaDragTo(pos);
        // Returning exactly to a ghost anchor collapses the selection. Keep
        // the visible drag semantics, but never leave a negative/>N caret for
        // sequence writers after the gesture has ended.
        if (drag.anchorCommitted && pos === anchor && (pos < 0 || pos > seqLength)) {
          onCaretChange(canonicalSequenceCaret(pos, seqLength, true), {
            extendSelection: false,
            needsScroll: false,
            forceAnchor: true,
          });
        }
      }
    }
    try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
    dragRef.current = { active: false, pointerId: null };
    stopAutoScroll();
    lastPointerCoordsRef.current = null;
  };
  const onRootPointerUp = (e) => finishPointerGesture(e, true);
  const onRootPointerCancel = (e) => finishPointerGesture(e, false);

  // ---------------------------------------------------------------
  // Right-click → context menu over the active selection
  // ---------------------------------------------------------------
  const onRootContextMenu = (e) => {
    const a = (typeof caretAnchor === "number" && Number.isFinite(caretAnchor)) ? caretAnchor : null;
    const f = (typeof caretPos === "number" && Number.isFinite(caretPos)) ? caretPos : null;
    if (a == null || f == null || a === f) return; // no selection — let native menu show
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  // mode: 'forward' | 'reverse' | 'aa'. Context-menu copy: the AA item
  // is UI-gated (disabled unless selectionMode === 'aa'), so this path
  // translates whatever is selected without a mode guard.
  const copySelection = (mode) => {
    const slice = inverted
      ? invertedSlice(fullSeq, Math.min(caretAnchor, caretPos), Math.max(caretAnchor, caretPos), seqLength, circular)
      : selectionSlice({ fullSeq, anchor: caretAnchor, focus: caretPos, seqLength, terminalSelect });
    if (!slice) return;
    let text = slice;
    if (mode === "reverse") text = reverseComplement(slice);
    else if (mode === "aa") {
      const dna = selectionStrand === -1 ? reverseComplement(slice) : slice;
      text = translateDNA(dna);
    }
    try {
      navigator.clipboard?.writeText?.(text);
    } catch { /* clipboard unavailable — silently no-op */ }
  };

  // ---------------------------------------------------------------
  // Global Ctrl+C copy-source registration (Игорь «контрол С должно
  // глобально работать везде где можно выделить»).
  // ---------------------------------------------------------------
  // The window-level handler in lib/global-copy.js copies the ACTIVE
  // source's selection regardless of focus. We register ONE stable
  // source object whose getText reads the latest selection through a
  // ref (so the registry always sees fresh caret coords without
  // re-registering every render). Unlike the context-menu copy, the
  // AA mode here is guarded to selectionMode === 'aa' — matching the
  // Ctrl+Shift+C contract in useSequenceKeyboard (no-op on non-CDS).
  const latestRef = useRef(null);
  latestRef.current = {
    fullSeq, caretAnchor, caretPos, seqLength, selectionMode, selectionStrand, inverted, circular, terminalSelect,
  };
  const copySourceRef = useRef(null);
  if (copySourceRef.current == null) {
    copySourceRef.current = {
      getText(mode) {
        const s = latestRef.current || {};
        const slice = s.inverted
          ? invertedSlice(s.fullSeq, Math.min(s.caretAnchor, s.caretPos), Math.max(s.caretAnchor, s.caretPos), s.seqLength, s.circular)
          : selectionSlice({
            fullSeq: s.fullSeq, anchor: s.caretAnchor, focus: s.caretPos, seqLength: s.seqLength,
            terminalSelect: s.terminalSelect,
          });
        if (!slice) return null;
        if (mode === "reverse") return reverseComplement(slice);
        if (mode === "aa") {
          if (s.selectionMode !== "aa") return null; // non-CDS selection — no AA copy
          const dna = s.selectionStrand === -1 ? reverseComplement(slice) : slice;
          return translateDNA(dna);
        }
        return slice;
      },
    };
  }
  useEffect(() => registerCopySource(copySourceRef.current), []);

  // Click fallback for synthetic-event environments + assistive tech
  const onRootClickFallback = (e) => {
    if (typeof onCaretChange !== "function") return;
    if (dragRef.current.active) return;
    if (pointerMovedRef.current) {
      pointerMovedRef.current = false;
      return;
    }
    const pos = posFromPointerEvent(e);
    if (pos == null) return;
    onCaretChange(pos, { extendSelection: !!e.shiftKey });
    try { containerRef.current?.focus({ preventScroll: true }); } catch { /* noop */ }
  };

  return {
    contextMenu,
    setContextMenu,
    onRootPointerDown,
    onRootPointerMove,
    onRootPointerUp,
    onRootPointerCancel,
    onRootContextMenu,
    onRootClickFallback,
    copySelection,
    inverted,
    toggleInverted,
  };
}
