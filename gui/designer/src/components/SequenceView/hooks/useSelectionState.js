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
import { LABEL_WIDTH } from "../constants.js";

export function useSelectionState({
  fullSeq,
  seqLength,
  charsPerLine,
  charPx,
  caretPos,
  caretAnchor,
  selectionMode,
  selectionStrand,
  onCaretChange,
  onSelectRange,
  containerRef,
}) {
  const [contextMenu, setContextMenu] = useState(null);
  const dragRef = useRef({ active: false, pointerId: null });
  const pointerMovedRef = useRef(false);
  const lastPointerCoordsRef = useRef(null);
  const autoScrollRafRef = useRef(null);

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
  const posFromPointerEvent = (e) => {
    if (!seqLength || !charPx) return null;
    let el = e.target;
    while (el && el !== containerRef.current) {
      if (el.dataset && el.dataset.lineStart != null) break;
      el = el.parentElement;
    }
    if (!el || el === containerRef.current) {
      const lines = containerRef.current?.querySelectorAll('[data-testid="sequence-view-line"]');
      if (!lines) return null;
      for (const candidate of lines) {
        let r;
        try { r = candidate.getBoundingClientRect(); } catch { continue; }
        if (e.clientY >= r.top && e.clientY <= r.bottom) {
          el = candidate;
          break;
        }
      }
      if (!el) return null;
    }
    const lineStart = parseInt(el.dataset.lineStart, 10);
    if (Number.isNaN(lineStart)) return null;
    let rect;
    try { rect = el.getBoundingClientRect(); } catch { return null; }
    if (!rect || !rect.width) return null;
    const x = e.clientX - rect.left;
    const offsetCh = Math.round(x / charPx) - LABEL_WIDTH;
    const lineLen = Math.min(charsPerLine || 80, seqLength - lineStart);
    const clamped = Math.max(0, Math.min(lineLen, offsetCh));
    return Math.max(0, Math.min(seqLength - 1, lineStart + clamped));
  };

  // ---------------------------------------------------------------
  // Pointer down — AA cell, annotation rect, or plain caret place
  // ---------------------------------------------------------------
  const onRootPointerDown = (e) => {
    if (e.button != null && e.button !== 0) return; // primary button only

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
    const pos = posFromPointerEvent(e);
    if (pos == null) return;
    dragRef.current = { active: true, pointerId: e.pointerId };
    pointerMovedRef.current = false;
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    onCaretChange(pos, { extendSelection: !!e.shiftKey, needsScroll: false });
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
  const tickAutoScroll = (direction, scroller) => {
    const EDGE_SPEED = 18; // px/frame
    scroller.scrollBy({ top: direction * EDGE_SPEED, behavior: "auto" });
    const last = lastPointerCoordsRef.current;
    if (last && dragRef.current.active) {
      const target = document.elementFromPoint(last.clientX, last.clientY) || last.target;
      const synth = { clientX: last.clientX, clientY: last.clientY, target };
      const pos = posFromPointerEvent(synth);
      if (pos != null && typeof onCaretChange === "function") {
        onCaretChange(pos, { extendSelection: true, needsScroll: false });
      }
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

    const pos = posFromPointerEvent(e);
    if (pos == null) return;
    pointerMovedRef.current = true;
    onCaretChange(pos, { extendSelection: true, needsScroll: false });
  };

  const onRootPointerUp = (e) => {
    if (!dragRef.current.active) return;
    if (dragRef.current.pointerId != null && e.pointerId !== dragRef.current.pointerId) return;
    try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
    dragRef.current = { active: false, pointerId: null };
    stopAutoScroll();
    lastPointerCoordsRef.current = null;
  };

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

  // mode: 'forward' | 'reverse' | 'aa'
  const copySelection = (mode) => {
    const a = (typeof caretAnchor === "number" && Number.isFinite(caretAnchor)) ? caretAnchor : null;
    const f = (typeof caretPos === "number" && Number.isFinite(caretPos)) ? caretPos : null;
    if (a == null || f == null || a === f) return;
    const start = Math.min(a, f);
    const end = Math.max(a, f);
    const slice = (fullSeq || "").slice(start, end);
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
    onRootContextMenu,
    onRootClickFallback,
    copySelection,
  };
}
