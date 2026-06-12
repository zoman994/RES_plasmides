/**
 * useCanvasLayoutDrag — pointer-drag + drag-to-connect logic for
 * CanvasLayoutView. Extracted verbatim (size-budget decomposition,
 * 2026-05-16) — behavior-preserving: identical handler bodies + the
 * same useCallback dependency arrays, just relocated into a hook.
 *
 * Owns: dragging / connecting state, lastClickRef / justDraggedRef.
 * Returns the six pointer handlers + the state the render reads
 * (`dragging`, `connecting`, `justDraggedRef`).
 *
 * `containerRef` is created in the component (also used by the tree
 * drop-target + render) and passed in; `zoom` is component state.
 */
import {
  useCallback, useRef, useState, useEffect,
} from 'react';
import { isPlaceholderContainer } from '../fixture-canvas-skeleton';
import {
  edgePanVelocity, viewportToWorld,
  nodeRect, gatherObstacleRects, resolveNodeOverlap, dropLayoutEffects,
} from './canvas-layout';
import { findZoneAtPoint } from './zone-interaction';
import { selectZoneByNodeId } from '../store/selectors-zones';

const DOUBLE_CLICK_MS = 300;

export function useCanvasLayoutDrag({ state, actions, containerRef, zoom }) {
  const [dragging, setDragging] = useState(null); // { id, offsetX, offsetY }
  const lastClickRef = useRef({ id: null, time: 0 });
  // V61 — после drag with movement подавляем синтезированный click,
  // иначе release над ghost'ом открывает picker (не интент).
  const justDraggedRef = useRef(false);
  // A5 — drag-to-connect: { from: containerId, x, y } (viewport coords).
  const [connecting, setConnecting] = useState(null);

  // Infinite-canvas edge auto-pan (Игорь 17.05.2026). Live mirrors so
  // the rAF loop reads current drag/zoom/pointer without stale closure.
  const draggingRef = useRef(null);
  const zoomRef = useRef(zoom);
  const pointerRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef(0);
  draggingRef.current = dragging;
  zoomRef.current = zoom;

  // Scroll-consistent world position of the dragged node from a
  // viewport point. Mirrors the focal-zoom / connect coordinate model
  // (screen = world*zoom - scroll); shared by pointer-move + the
  // auto-pan tick so the block keeps trailing the cursor as the canvas
  // scrolls "дальше и дальше". (jsdom: rect/scroll = 0 → unchanged.)
  const applyDragAt = useCallback((clientX, clientY) => {
    const d = draggingRef.current;
    const el = containerRef.current;
    if (!d || !el) return;
    const rect = el.getBoundingClientRect();
    const z = zoomRef.current || 1;
    // Single screen→world transform (shared with the zone drop
    // hit-test) — then subtract the grab offset (in world units).
    const w = viewportToWorld({
      clientX, clientY, rect, scrollLeft: el.scrollLeft || 0, scrollTop: el.scrollTop || 0, zoom: z,
    });
    const nx = Math.max(0, w.x - d.offsetX / z);
    const ny = Math.max(0, w.y - d.offsetY / z);
    if (d.kind === 'operation') actions.opSetPosition(d.id, { x: nx, y: ny });
    else if (d.kind === 'assembly') actions.setAssemblyDraftPosition(d.id, { x: nx, y: ny });
    else actions.setPosition(d.id, { x: nx, y: ny });
  }, [actions, containerRef]);

  // While a node is dragged, auto-scroll the viewport when the cursor
  // nears an edge and re-apply the position so it keeps moving outward
  // (content extent grows with position → effectively infinite).
  useEffect(() => {
    if (!dragging || dragging.kind === undefined) return undefined;
    if (typeof requestAnimationFrame !== 'function') return undefined;
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const el = containerRef.current;
      if (el && draggingRef.current) {
        const { vx, vy } = edgePanVelocity({
          clientX: pointerRef.current.x,
          clientY: pointerRef.current.y,
          rect: el.getBoundingClientRect(),
        });
        if (vx !== 0 || vy !== 0) {
          el.scrollLeft += vx;
          el.scrollTop += vy;
          applyDragAt(pointerRef.current.x, pointerRef.current.y);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [dragging, applyDragAt, containerRef]);

  const onBlockPointerDown = useCallback((e, containerId) => {
    if (e.button !== 0) return;
    // Audit FIX-6/7: получаем target container для placeholder-гейтов.
    const targetContainer = state.containers.find((c) => c.id === containerId);
    const isPh = targetContainer && isPlaceholderContainer(targetContainer);
    // A5 — Alt+pointer-down on FILLED container → start drag-to-connect.
    // FIX-7: placeholder не имеет sequence, не имеет смысла как input.
    if (e.altKey) {
      e.stopPropagation();
      if (isPh) return;
      setConnecting({ from: containerId, x: e.clientX, y: e.clientY });
      return;
    }
    // A6 — Ctrl/Cmd+click — toggle multi-selection.
    // FIX-6: placeholder не селектится (не используется в batch ops).
    if (e.ctrlKey || e.metaKey) {
      e.stopPropagation();
      if (isPh) return;
      actions.toggleSelection(containerId);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    setDragging({ kind: 'container', id: containerId, offsetX, offsetY, hasMoved: false });
    // Reset drag-supress: новый pointerdown стартует новый цикл.
    justDraggedRef.current = false;
    // A6 — plain click без modifier'ов очищает multi-selection.
    if ((state.selectedContainerIds || []).length > 0) {
      actions.clearSelection();
    }
    actions.setHighlight(containerId);

    // Double-click → editor (skip for placeholders — they have click-
    // picker entry path, not editor).
    const containerObj = state.containers.find((c) => c.id === containerId);
    if (containerObj && !isPlaceholderContainer(containerObj)) {
      const now = Date.now();
      const last = lastClickRef.current;
      if (last.id === containerId && now - last.time < DOUBLE_CLICK_MS) {
        lastClickRef.current = { id: null, time: 0 };
        // K3 GC (DEC-OPS-02): draft sessions retired. Always open
        // view-only editor on dblclick.
        actions.openEditorViewOnly(containerId);
        setDragging(null);
        return;
      }
      lastClickRef.current = { id: containerId, time: now };
    }
  }, [actions, state.containers]);

  const onPointerMove = useCallback((e) => {
    // A5 — update connecting wire endpoint.
    if (connecting) {
      setConnecting({ ...connecting, x: e.clientX, y: e.clientY });
      return;
    }
    if (!dragging || !containerRef.current) return;
    pointerRef.current = { x: e.clientX, y: e.clientY };
    if (!dragging.hasMoved) {
      setDragging({ ...dragging, hasMoved: true });
    }
    // World position (scroll-consistent) + kind dispatch — shared with
    // the edge auto-pan tick so behaviour is identical whether the
    // canvas moved because the cursor moved or because it auto-scrolled.
    applyDragAt(e.clientX, e.clientY);
  }, [dragging, connecting, applyDragAt, containerRef]);

  const onPointerUp = useCallback((e) => {
    // A5 — drop connecting wire on op → opAddInput.
    if (connecting) {
      // Find op-wrap элемент под курсором.
      const el = (typeof document !== 'undefined' && e && Number.isFinite(e.clientX))
        ? document.elementFromPoint(e.clientX, e.clientY)
        : null;
      const opWrap = el?.closest?.('[data-testid^="skeleton-op-wrap-"]');
      const opId = opWrap?.getAttribute('data-testid')?.replace('skeleton-op-wrap-', '');
      if (opId) {
        // R5-12: lifecycle check + toast feedback на frozen ops.
        const targetOp = state.operations.find((o) => o.id === opId);
        if (targetOp && (targetOp.status === 'executed' || targetOp.status === 'failed')) {
          actions.showToast({
            kind: 'warning',
            message: `Op уже ${targetOp.status === 'executed' ? 'выполнен' : 'упал'}. Сбросьте через OP_RESET чтобы менять inputs.`,
          });
        } else {
          actions.opAddInput(opId, connecting.from);
        }
      }
      setConnecting(null);
      return;
    }
    // На pointer-up — обработать drop, если drag перемещал блок.
    // V100 — proximity-junction авто-коннект удалён (мёртвый функционал;
    // связывание контейнеров идёт через zones / редактор сборки).
    if (dragging?.hasMoved) {
      // V61 — mark so synthetic click does not re-trigger picker.
      justDraggedRef.current = true;
      // T4 K8 (DEC-T4-06/13/14) — drop hit-detection into a zone.
      // Additive: containers/operations only (assembly drafts aren't
      // zone nodes). Outer-most zone at the cursor; null = loose.
      let droppedZoneTarget = null;
      if (
        (dragging.kind === 'container' || dragging.kind === 'operation')
        && Array.isArray(state.zones) && containerRef.current
        && e && Number.isFinite(e.clientX)
      ) {
        // TD-ZONE-ATTACH-CONTAINMENT (Игорь 18.05.2026): drop point
        // MUST be scroll-corrected world coords (same transform as
        // applyDragAt / zone.bounds) — omitting scroll mapped a drop
        // on a scrolled canvas to the wrong/no zone.
        const elc = containerRef.current;
        const rect = elc.getBoundingClientRect();
        const pt = viewportToWorld({
          clientX: e.clientX,
          clientY: e.clientY,
          rect,
          scrollLeft: elc.scrollLeft || 0,
          scrollTop: elc.scrollTop || 0,
          zoom,
        });
        const target = findZoneAtPoint(state.zones, pt);
        droppedZoneTarget = target;
        const cur = selectZoneByNodeId(state, dragging.id);
        const tId = target ? target.id : null;
        const cId = cur ? cur.id : null;
        if (tId !== cId) actions.moveNodeToZone(dragging.kind, dragging.id, tId);
        // M-CANVAS-FIX.1 K1 (Игорь §0.5): a drop into / within a zone NO
        // LONGER flips it to laneLayout:'manual'. Canvas is authoritative
        // auto-layout — in-zone nodes aren't hand-arranged; the dropped node
        // is re-laid by the 3-lane finalizer and the frame auto-sizes to
        // contain it (containment via auto-size, not the old manual-grow).
        // `target` kept above only for moveNodeToZone hit-detection.
      }
      // SPEC_CANVAS_NODE_COLLISION — loose-only anti-overlap. In-zone
      // drops are arranged by the zone lane finalizer (and resolve must
      // not push a node back out of the frame it was just dropped in);
      // a loose drop nudges off any overlap. Assembly drafts are never
      // zone nodes → always loose.
      const isLooseDrop = dragging.kind === 'assembly' || droppedZoneTarget == null;
      if (isLooseDrop) {
        let desired = null;
        if (dragging.kind === 'operation') {
          desired = (state.operations || []).find((o) => o.id === dragging.id)?.position;
        } else if (dragging.kind === 'assembly') {
          desired = (state.assemblyDrafts || []).find((d) => d.id === dragging.id)?.position;
        } else {
          desired = state.positions[dragging.id];
        }
        if (desired) {
          const { w, h } = nodeRect(dragging.kind, desired);
          const obstacles = gatherObstacleRects(state, dragging.id);
          const resolved = resolveNodeOverlap(desired, { w, h }, obstacles);
          if (resolved.x !== desired.x || resolved.y !== desired.y) {
            if (dragging.kind === 'operation') actions.opSetPosition(dragging.id, resolved);
            else if (dragging.kind === 'assembly') actions.setAssemblyDraftPosition(dragging.id, resolved);
            else actions.setPosition(dragging.id, resolved);
          }
        }
      }
      // M-CANVAS-FIX.1 K1 — pin only a LOOSE drop. A zoned node stays under
      // auto-layout (pinning it would re-introduce the manual-vs-auto fight
      // that made the canvas «fall apart after first touch»); a loose drop
      // keeps the free-positioning model. Decision centralised + tested in
      // dropLayoutEffects.
      if (dropLayoutEffects({ kind: dragging.kind, droppedZoneTarget }).pin) {
        actions.setNodePinned(dragging.kind, dragging.id, true);
      }
    }
    setDragging(null);
  }, [dragging, state.containers, state.positions, state.zones, state.operations, state.assemblyDrafts, zoom, containerRef, actions, connecting]);

  // V58 (13.05.2026) — drag для operation-ромбов.
  const onOperationPointerDown = useCallback((e, operationId) => {
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    setDragging({ kind: 'operation', id: operationId, offsetX, offsetY, hasMoved: false });
  }, []);

  // A1 K7 — drag for AssemblyDraft blocks (mirrors operation drag).
  const onAssemblyPointerDown = useCallback((e, draftId) => {
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setDragging({
      kind: 'assembly',
      id: draftId,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      hasMoved: false,
    });
  }, []);

  const onCanvasClick = useCallback((e) => {
    if (e.target === containerRef.current) {
      actions.setHighlight(null);
      // Audit FIX-8: click на empty canvas также очищает multi-selection.
      if ((state.selectedContainerIds || []).length > 0) {
        actions.clearSelection();
      }
    }
  }, [actions, state.selectedContainerIds]);

  return {
    dragging,
    connecting,
    justDraggedRef,
    onBlockPointerDown,
    onPointerMove,
    onPointerUp,
    onOperationPointerDown,
    onAssemblyPointerDown,
    onCanvasClick,
  };
}
