/**
 * use-tree-drop-target — HTML5 drop target hook для Canvas views.
 *
 * Слушает MIME `application/x-bodge-entry-id` который выставляет
 * `Library/tree/TreeItemRow` на onDragStart. На drop:
 *   1. Извлекает entryId из dataTransfer.
 *   2. Достаёт LibraryEntry из global librarySlice (read-only —
 *      DEC-SKELETON-01 не нарушается).
 *   3. Рассчитывает position относительно canvas root (clientX/Y -
 *      bounding rect.left/top).
 *   4. Диспатчит ADD_CONTAINER_FROM_ENTRY.
 *
 * Возвращает:
 *   { dropHandlers, dragOver, ref }
 *   - dropHandlers: spread на canvas root — { onDragOver, onDragEnter,
 *     onDragLeave, onDrop }.
 *   - dragOver: boolean — true пока курсор над canvas с правильным MIME
 *     (для визуального highlight).
 *   - ref: ref на корневой div для измерения rect.
 */
import { useCallback, useRef, useState } from 'react';
import { useStore } from '../../../store';
import { useSkeletonActions, useSkeletonState } from '../store/skeleton-context';
import { nodeRect, gatherObstacleRects, resolveNodeOverlap } from './canvas-layout';

export const TREE_DRAG_MIME = 'application/x-bodge-entry-id';

export function useTreeDropTarget(externalRef) {
  const actions = useSkeletonActions();
  // SPEC_CANVAS_NODE_COLLISION — fresh skeleton state for the drop
  // callback (collision-resolve reads current obstacle bboxes).
  const skeletonState = useSkeletonState();
  const stateRef = useRef(skeletonState);
  stateRef.current = skeletonState;
  const internalRef = useRef(null);
  const containerRef = externalRef || internalRef;
  const [dragOver, setDragOver] = useState(false);
  // dragLeave fires when entering a child element; track depth so
  // hover indicator doesn't flicker as cursor crosses block borders.
  const dragDepthRef = useRef(0);

  const hasEntryMime = (e) => {
    if (!e?.dataTransfer) return false;
    const types = Array.from(e.dataTransfer.types || []);
    return types.includes(TREE_DRAG_MIME);
  };

  const onDragOver = useCallback((e) => {
    if (!hasEntryMime(e)) return;
    e.preventDefault(); // discloses willingness to accept drop
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDragEnter = useCallback((e) => {
    if (!hasEntryMime(e)) return;
    dragDepthRef.current += 1;
    if (dragDepthRef.current === 1) setDragOver(true);
  }, []);

  const onDragLeave = useCallback((e) => {
    if (!hasEntryMime(e)) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragOver(false);
  }, []);

  const onDrop = useCallback((e) => {
    if (!hasEntryMime(e)) return;
    e.preventDefault();
    dragDepthRef.current = 0;
    setDragOver(false);

    const entryId = e.dataTransfer.getData(TREE_DRAG_MIME);
    if (!entryId) return;

    // Read-only out-of-band fetch from global store. NOT a write —
    // DEC-SKELETON-01 isolation preserved.
    const entry = useStore.getState().libraryEntries?.[entryId];
    if (!entry) return;

    // Translate screen coords → canvas-local coords. Layout view uses
    // absolute positioning relative to its scrollable root; Graph view
    // computes its own positions via dagre but seeds initial state
    // here. Both consume the same {x,y}.
    let position = null;
    const rootEl = containerRef.current;
    if (rootEl) {
      const rect = rootEl.getBoundingClientRect();
      const x = e.clientX - rect.left + rootEl.scrollLeft - 110; // center block (~half-width)
      const y = e.clientY - rect.top + rootEl.scrollTop - 60;
      position = {
        x: Number.isFinite(x) ? x : 80,
        y: Number.isFinite(y) ? y : 80,
      };
    }

    // SPEC_CANVAS_NODE_COLLISION — nudge the drop off any loose node it
    // would land on (clamped ≥ 0, deterministic ring search).
    if (position) {
      const { w, h } = nodeRect('container', position);
      const obstacles = gatherObstacleRects(stateRef.current, null);
      position = resolveNodeOverlap(position, { w, h }, obstacles);
    }

    actions.addContainerFromEntry(entry, position);
  }, [actions]);

  return {
    ref: containerRef,
    dragOver,
    dropHandlers: { onDragOver, onDragEnter, onDragLeave, onDrop },
  };
}
