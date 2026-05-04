/**
 * useAnnotationDrag — Sprint M-X.2 K4 drag-handles for annotation
 * region edges (DEC-ANN-02). Polished post-K10 review:
 *   - listeners attach ONCE on pointerdown via ref (was: re-attached
 *     each pointermove because deps array carried drag state — 60 fps
 *     drag = 60 attach/detach per second);
 *   - returns `liveCoord` so AnnotationTrack can render a live
 *     preview rect at the new edge position during drag;
 *   - returns `tooltip` (`{x, y, label}`) for the toUiCoords readout
 *     that follows the cursor (DEC-ANN-02 explicit requirement).
 *
 * Each region rect in AnnotationTrack now exposes 2 invisible edge
 * overlays (left / right, ~6 px wide, cursor: ew-resize). PointerDown
 * on either edge:
 *   - setPointerCapture so subsequent moves stay routed to this hook.
 *   - Save initial state in a ref (stable across renders).
 *   - Attach document-level pointermove / pointerup ONCE.
 *   - Render preview rect + tooltip.
 *
 * pointerMove → compute new coord from clientX, clamp to
 * [0, seqLength], force NOT to cross anchorCoord. Update ref +
 * setLiveCoord (cheap state — only this hook re-renders, not the
 * 60 sequence lines underneath).
 *
 * pointerUp → onAnnotationEdit({kind:'update', id, patch}) if the
 * coord changed; clear all state.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { LABEL_WIDTH } from '../constants.js';
import { toUiCoords } from '../../../lib/annotation-edit.js';

export function useAnnotationDrag({
  charPx,
  charsPerLine,
  containerRef,
  onAnnotationEdit,
  seqLength,
}) {
  // Visible state — drives preview rect + tooltip rerenders.
  const [drag, setDrag] = useState(null);
  const [tooltip, setTooltip] = useState(null);

  // Internal mutable state — read by document listeners without
  // forcing them to re-attach on every state update.
  const dragRef = useRef(null);

  /** Resolve clientX/Y → absolute sequence position by probing
   *  per-line `<div data-line-start>` rects. Returns null when the
   *  pointer is outside the line gutter. */
  const posFromClientPoint = useCallback((clientX, clientY) => {
    if (!seqLength || !charPx) return null;
    const root = containerRef?.current;
    if (!root) return null;
    const lines = root.querySelectorAll('[data-testid="sequence-view-line"]');
    let target = null;
    for (const el of lines) {
      let r;
      try { r = el.getBoundingClientRect(); } catch { continue; }
      if (clientY >= r.top && clientY <= r.bottom) { target = el; break; }
    }
    if (!target) return null;
    let rect;
    try { rect = target.getBoundingClientRect(); } catch { return null; }
    const lineStart = parseInt(target.dataset.lineStart || '', 10);
    if (Number.isNaN(lineStart)) return null;
    const x = clientX - rect.left;
    const offsetCh = Math.round(x / charPx) - LABEL_WIDTH;
    const cpl = charsPerLine || 80;
    const lineLen = Math.min(cpl, seqLength - lineStart);
    const clamped = Math.max(0, Math.min(lineLen, offsetCh));
    return Math.max(0, Math.min(seqLength, lineStart + clamped));
  }, [charPx, charsPerLine, containerRef, seqLength]);

  // Stable handlers — declared once per hook lifetime via ref'd
  // closures. Document listeners reference these refs directly so
  // attachments survive every state update.
  const onMoveRef = useRef(null);
  const onUpRef = useRef(null);
  const onCancelRef = useRef(null);

  onMoveRef.current = (e) => {
    const cur = dragRef.current;
    if (!cur) return;
    const pos = posFromClientPoint(e.clientX, e.clientY);
    if (pos == null) return;
    let newCoord = pos;
    if (cur.edge === 'left') {
      newCoord = Math.max(0, Math.min(cur.anchorCoord - 1, pos));
    } else {
      newCoord = Math.max(cur.anchorCoord + 1, Math.min(seqLength, pos));
    }
    if (newCoord !== cur.currentCoord) {
      cur.currentCoord = newCoord;
      // Single shallow setState — only this hook's consumers
      // re-render (AnnotationTrack via draggedCurrentCoord prop +
      // tooltip portal).
      setDrag({ ...cur });
    }
    // Tooltip follows the pointer regardless of coord change so the
    // biolog sees current 1-based position (DEC-ANN-02).
    const ui = cur.edge === 'left'
      ? toUiCoords(newCoord, cur.anchorCoord)
      : toUiCoords(cur.anchorCoord, newCoord);
    const label = cur.edge === 'left' ? `start: ${ui.uiStart}` : `end: ${ui.uiEnd}`;
    setTooltip({ x: e.clientX + 12, y: e.clientY + 12, label });
  };

  onUpRef.current = (e) => {
    const cur = dragRef.current;
    if (!cur) return;
    try { e.target?.releasePointerCapture?.(e.pointerId); } catch { /* noop */ }
    const moved = cur.edge === 'left'
      ? cur.currentCoord !== cur.origStart
      : cur.currentCoord !== cur.origEnd;
    if (moved && typeof onAnnotationEdit === 'function') {
      const patch = cur.edge === 'left'
        ? { start: cur.currentCoord }
        : { end: cur.currentCoord };
      onAnnotationEdit({ kind: 'update', id: cur.annotationId, patch });
    }
    dragRef.current = null;
    setDrag(null);
    setTooltip(null);
  };

  onCancelRef.current = () => {
    dragRef.current = null;
    setDrag(null);
    setTooltip(null);
  };

  const onPointerDownEdge = useCallback((e, annotationId, edge, region) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* noop */ }
    const anchorCoord = edge === 'left' ? region.end : region.start;
    const currentCoord = edge === 'left' ? region.start : region.end;
    const next = {
      pointerId: e.pointerId,
      annotationId,
      edge,
      anchorCoord,
      currentCoord,
      origStart: region.start,
      origEnd: region.end,
    };
    dragRef.current = next;
    setDrag(next);
    // Initial tooltip at the pointer.
    const ui = toUiCoords(region.start, region.end);
    setTooltip({
      x: e.clientX + 12,
      y: e.clientY + 12,
      label: edge === 'left' ? `start: ${ui.uiStart}` : `end: ${ui.uiEnd}`,
    });
  }, []);

  // Attach document listeners ONCE (mount → unmount). The listeners
  // dispatch through onMoveRef.current / onUpRef.current so they
  // pick up the latest closure without re-attaching.
  useEffect(() => {
    const onMove = (e) => onMoveRef.current && onMoveRef.current(e);
    const onUp = (e) => onUpRef.current && onUpRef.current(e);
    const onCancel = (e) => onCancelRef.current && onCancelRef.current(e);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
    };
  }, []);

  return {
    isDragging: !!drag,
    draggedAnnotationId: drag?.annotationId || null,
    draggedEdge: drag?.edge || null,
    currentCoord: drag?.currentCoord ?? null,
    anchorCoord: drag?.anchorCoord ?? null,
    tooltip,
    onPointerDownEdge,
  };
}
