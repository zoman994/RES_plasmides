/**
 * useAnnotationDrag — Sprint M-X.2 K4 drag-handles for annotation
 * region edges (DEC-ANN-02).
 *
 * Each region rect in AnnotationTrack now exposes 2 invisible edge
 * overlays (left / right, ~6 px wide, cursor: ew-resize). PointerDown
 * on either edge:
 *   - setPointerCapture so subsequent moves stay routed to this hook.
 *   - Save initial state (annotationId, edge, anchorCoord = the OTHER
 *     edge of the region, currentCoord = same as anchor at start).
 *   - Show a tooltip with toUiCoords label.
 *
 * pointerMove → compute new currentCoord from clientX, clamped to
 * [0, seqLength] and forced to NOT cross anchorCoord (no flip).
 * State updated locally — does NOT call onAnnotationEdit yet.
 *
 * pointerUp → onAnnotationEdit({kind: 'update', id, patch: {start|end}})
 * if the coord changed; otherwise no-op.
 *
 * Returns:
 *   {
 *     isDragging, draggedAnnotationId, draggedEdge, currentCoord,
 *     onPointerDownEdge(e, annotationId, edge, region),
 *   }
 *
 * The hook attaches its own move / up listeners on `document` (not
 * `containerRef.current`) so the drag survives the pointer leaving
 * the SVG even without setPointerCapture (some browsers detach
 * capture early when the captured element is inside an SVG with
 * pointer-events:none on intermediate ancestors).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { LABEL_WIDTH } from '../constants.js';

export function useAnnotationDrag({
  charPx,
  charsPerLine,
  containerRef,
  onAnnotationEdit,
  seqLength,
}) {
  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);

  // Keep the latest drag state in a ref for the document listeners
  // (which close over the initial value otherwise).
  useEffect(() => { dragRef.current = drag; }, [drag]);

  /** Convert a clientX to absolute sequence position by probing the
   *  per-line `<div data-line-start>` rects. Returns null when
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

  const onPointerDownEdge = useCallback((e, annotationId, edge, region) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* noop */ }
    const anchorCoord = edge === 'left' ? region.end : region.start;
    const currentCoord = edge === 'left' ? region.start : region.end;
    setDrag({
      pointerId: e.pointerId,
      annotationId,
      edge,
      anchorCoord,
      currentCoord,
      origStart: region.start,
      origEnd: region.end,
    });
  }, []);

  // Document listeners — attached only while dragging so we don't
  // pay the cost on idle viewers.
  useEffect(() => {
    if (!drag) return undefined;
    const onMove = (e) => {
      const cur = dragRef.current;
      if (!cur) return;
      const pos = posFromClientPoint(e.clientX, e.clientY);
      if (pos == null) return;
      // Prevent flip: edge can't cross the OTHER edge.
      let newCoord = pos;
      if (cur.edge === 'left') {
        // Left edge can't reach or pass the right edge.
        newCoord = Math.max(0, Math.min(cur.anchorCoord - 1, pos));
      } else {
        // Right edge can't reach or pass the left edge.
        newCoord = Math.max(cur.anchorCoord + 1, Math.min(seqLength, pos));
      }
      if (newCoord === cur.currentCoord) return;
      setDrag({ ...cur, currentCoord: newCoord });
    };
    const onUp = (e) => {
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
      setDrag(null);
    };
    const onCancel = () => setDrag(null);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
    };
  }, [drag, posFromClientPoint, onAnnotationEdit, seqLength]);

  return {
    isDragging: !!drag,
    draggedAnnotationId: drag?.annotationId || null,
    draggedEdge: drag?.edge || null,
    currentCoord: drag?.currentCoord ?? null,
    anchorCoord: drag?.anchorCoord ?? null,
    onPointerDownEdge,
  };
}
