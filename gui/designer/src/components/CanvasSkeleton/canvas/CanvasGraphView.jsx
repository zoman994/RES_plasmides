/**
 * CanvasGraphView — Graph view с auto-layout (DAG read-only viz).
 *
 * Harvest из Dag/DagCanvas.jsx pattern: dagre LR через
 * `lib/dag-layout::computeAutoLayout`. ReactFlow НЕ используется
 * здесь напрямую (skeleton-у достаточно SVG + absolute divs); это
 * упрощает Pre-baked + auto-relayout каждый раз при mount.
 *
 * Bipartite: ContainerBlock (squares/circles) + OperationNode (ромбы).
 * Edges — SVG path L-shape connectors (без overlap resolution; для
 * skeleton-у достаточно).
 */
import { useMemo, useCallback, useState } from 'react';
import { useSkeletonState, useSkeletonActions } from '../store/skeleton-context';
import { useStore } from '../../../store';
import ContainerBlock from './ContainerBlock';
import OperationNode from './OperationNode';
import {
  buildGraphNodesEdges,
  computeGraphPositions,
  getBlockSize,
  OPERATION_NODE_W,
  OPERATION_NODE_H,
  edgeAnchors,
} from './canvas-layout';
import { useTreeDropTarget, TREE_DRAG_MIME } from './use-tree-drop-target';
import { isPlaceholderContainer } from '../fixture-canvas-skeleton';
import PlaceholderTreePicker from './PlaceholderTreePicker';
import OpKindPicker from './operations/OpKindPicker';
import OpPopupRouter from './operations/OpPopupRouter';

export default function CanvasGraphView() {
  const state = useSkeletonState();
  const actions = useSkeletonActions();

  const [blockDragOver, setBlockDragOver] = useState(null);
  const [pickerForId, setPickerForId] = useState(null);
  // K5 — open picker/popup local state for V2 operations.
  const [openPicker, setOpenPicker] = useState(null);
  const [openPopup, setOpenPopup] = useState(null);
  const [opContextMenu, setOpContextMenu] = useState(null);

  // Drag-from-Library-Tree drop target (NOTES §2). Position seeded
  // here is the cursor drop point — auto-layout recomputes later
  // (computeGraphPositions ignores manual positions for Graph view).
  const { dragOver, dropHandlers, ref: dropRef } = useTreeDropTarget();

  const hasEntryMime = (e) => {
    if (!e?.dataTransfer) return false;
    return Array.from(e.dataTransfer.types || []).includes(TREE_DRAG_MIME);
  };
  const onBlockDragOver = useCallback((e) => {
    if (!hasEntryMime(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);
  const onBlockDragEnter = useCallback((e, containerId) => {
    if (!hasEntryMime(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setBlockDragOver({ containerId });
  }, []);
  const onBlockDragLeave = useCallback((e) => {
    if (!hasEntryMime(e)) return;
    e.stopPropagation();
    setBlockDragOver(null);
  }, []);
  const onBlockDrop = useCallback((e, containerId) => {
    if (!hasEntryMime(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setBlockDragOver(null);
    const entryId = e.dataTransfer.getData(TREE_DRAG_MIME);
    if (!entryId) return;
    const entry = useStore.getState().libraryEntries?.[entryId];
    if (!entry) return;
    actions.fillPlaceholder(containerId, entry);
  }, [actions]);

  const onPlaceholderClick = useCallback((containerId) => {
    setPickerForId(containerId);
    actions.setHighlight(containerId);
  }, [actions]);
  const onPickerPick = useCallback((entry) => {
    if (!pickerForId || !entry) return;
    actions.fillPlaceholder(pickerForId, entry);
    setPickerForId(null);
  }, [actions, pickerForId]);
  const onPickerCancel = useCallback(() => setPickerForId(null), []);

  const { nodes, edges } = useMemo(
    () => buildGraphNodesEdges(state.containers, state.commits, state.operations),
    [state.containers, state.commits, state.operations],
  );

  const positions = useMemo(
    () => computeGraphPositions(state.containers, state.commits, state.operations),
    [state.containers, state.commits, state.operations],
  );

  const onOpenEditor = useCallback((containerId) => {
    // K3 GC (DEC-OPS-02): draft sessions retired. Always open
    // view-only editor.
    actions.openEditorViewOnly(containerId);
  }, [actions]);

  // K5/K6 — OperationNode click/right-click. Behaviour mirrors LayoutView.
  const onOperationClick = useCallback((op, e) => {
    if (!op) return;
    const x = e?.clientX ?? 100;
    const y = e?.clientY ?? 100;
    if (op.kind === null || op.kind === undefined) {
      setOpenPicker({ operationId: op.id, x, y });
      setOpenPopup(null);
    } else {
      setOpenPopup({ operationId: op.id, x, y });
      setOpenPicker(null);
    }
    setOpContextMenu(null);
  }, []);
  const onOperationContextMenu = useCallback((op, e) => {
    if (!op) return;
    setOpContextMenu({
      operationId: op.id,
      x: e.clientX,
      y: e.clientY,
    });
  }, []);
  const onOpContextDelete = useCallback(() => {
    if (!opContextMenu?.operationId) return;
    actions.opRemove(opContextMenu.operationId);
    setOpContextMenu(null);
  }, [actions, opContextMenu]);
  const onOpContextDismiss = useCallback(() => setOpContextMenu(null), []);

  const pickerOp = openPicker
    ? state.operations.find((o) => o.id === openPicker.operationId) || null
    : null;
  const popupOp = openPopup
    ? state.operations.find((o) => o.id === openPopup.operationId) || null
    : null;

  const onPickerPickKind = useCallback((kind) => {
    if (!openPicker?.operationId) return;
    actions.opSetKind(openPicker.operationId, kind);
    setOpenPopup({ operationId: openPicker.operationId, x: openPicker.x, y: openPicker.y });
    setOpenPicker(null);
  }, [actions, openPicker]);
  const onPickerCancelOp = useCallback(() => setOpenPicker(null), []);
  const onPopupCancel = useCallback(() => setOpenPopup(null), []);
  const onPopupExecute = useCallback((operationId, paramsPatch) => {
    if (paramsPatch && Object.keys(paramsPatch).length > 0) {
      actions.opSetParams(operationId, paramsPatch);
    }
    actions.opExecute(operationId);
    setOpenPopup(null);
  }, [actions]);

  // Compute canvas bounds for the SVG layer.
  const bounds = useMemo(() => {
    let maxX = 800;
    let maxY = 600;
    for (const n of nodes) {
      const pos = positions[n.id] || { x: 0, y: 0 };
      const size = n.data.kind === 'container'
        ? getBlockSize(n.data.container)
        : { width: OPERATION_NODE_W, height: OPERATION_NODE_H };
      maxX = Math.max(maxX, pos.x + size.width + 80);
      maxY = Math.max(maxY, pos.y + size.height + 80);
    }
    return { width: maxX, height: maxY };
  }, [nodes, positions]);

  return (
    <div
      ref={dropRef}
      data-testid="skeleton-canvas-graph"
      data-drag-over={dragOver ? 'true' : 'false'}
      onDragOver={dropHandlers.onDragOver}
      onDragEnter={dropHandlers.onDragEnter}
      onDragLeave={dropHandlers.onDragLeave}
      onDrop={dropHandlers.onDrop}
      style={{
        flex: 1,
        minHeight: 0,
        position: 'relative',
        background: 'var(--surface-base, #fafaf9)',
        overflow: 'auto',
        backgroundImage:
          'linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)',
        backgroundSize: '20px 20px',
        boxShadow: dragOver ? 'inset 0 0 0 2px var(--accent-500, #d97706)' : 'none',
        transition: 'box-shadow 80ms ease',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: bounds.width,
          height: bounds.height,
        }}
      >
        {/* Edges SVG layer */}
        <svg
          width={bounds.width}
          height={bounds.height}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        >
          {edges.map((e) => {
            const a = positions[e.from];
            const b = positions[e.to];
            if (!a || !b) return null;
            const fromNode = nodes.find((n) => n.id === e.from);
            const toNode = nodes.find((n) => n.id === e.to);
            if (!fromNode || !toNode) return null;
            const fromSize = fromNode.kind === 'container'
              ? getBlockSize(fromNode.data.container)
              : { width: OPERATION_NODE_W, height: OPERATION_NODE_H };
            const toSize = toNode.kind === 'container'
              ? getBlockSize(toNode.data.container)
              : { width: OPERATION_NODE_W, height: OPERATION_NODE_H };
            const ea = edgeAnchors(
              { x: a.x, y: a.y, w: fromSize.width, h: fromSize.height },
              { x: b.x, y: b.y, w: toSize.width, h: toSize.height },
            );
            return (
              <path
                key={e.id}
                d={ea.d}
                stroke="var(--text-tertiary, #a8a29e)"
                strokeWidth={1.5}
                fill="none"
                markerEnd="url(#skeleton-arrow)"
              />
            );
          })}
          <defs>
            <marker
              id="skeleton-arrow"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L0,6 L9,3 z" fill="var(--text-tertiary, #a8a29e)" />
            </marker>
          </defs>
        </svg>

        {/* Nodes */}
        {nodes.map((n) => {
          const pos = positions[n.id] || { x: 0, y: 0 };
          if (n.data.kind === 'container') {
            const highlighted = state.highlightedContainerId === n.id;
            const isPh = isPlaceholderContainer(n.data.container);
            const blockOver = blockDragOver?.containerId === n.id;
            return (
              <div
                key={n.id}
                style={{ position: 'absolute', left: pos.x, top: pos.y, zIndex: 2 }}
                onDoubleClick={() => { if (!isPh) onOpenEditor(n.id); }}
                onClick={() => actions.setHighlight(n.id)}
                onDragOver={isPh ? onBlockDragOver : undefined}
                onDragEnter={isPh ? (e) => onBlockDragEnter(e, n.id) : undefined}
                onDragLeave={isPh ? onBlockDragLeave : undefined}
                onDrop={isPh ? (e) => onBlockDrop(e, n.id) : undefined}
              >
                <ContainerBlock
                  container={n.data.container}
                  highlighted={highlighted}
                  dragOver={blockOver}
                  onPlaceholderClick={() => onPlaceholderClick(n.id)}
                />
              </div>
            );
          }
          // operation node — V2 (state.operations) or legacy V1 (commits)
          const opData = n.data.operation || null;
          const commitData = n.data.commit || null;
          return (
            <div
              key={n.id}
              style={{ position: 'absolute', left: pos.x, top: pos.y, zIndex: 2 }}
            >
              <OperationNode
                operation={opData}
                commit={commitData}
                onClick={opData ? onOperationClick : undefined}
                onContextMenu={opData ? onOperationContextMenu : undefined}
              />
            </div>
          );
        })}
      </div>

      {/* K5 — Op context menu */}
      {opContextMenu && (
        <div
          data-testid="skeleton-op-context-menu"
          data-operation-id={opContextMenu.operationId}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: opContextMenu.x,
            top: opContextMenu.y,
            zIndex: 50,
            background: 'var(--surface-1, #fff)',
            border: '1px solid var(--border-default, #d6d3d1)',
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            minWidth: 140,
            padding: 4,
            fontSize: 13,
          }}
        >
          <button
            type="button"
            data-testid="skeleton-op-context-delete"
            onClick={onOpContextDelete}
            style={{
              display: 'block', width: '100%', padding: '6px 10px',
              textAlign: 'left', background: 'transparent', border: 'none',
              cursor: 'pointer', color: 'var(--text-primary)',
            }}
          >Удалить</button>
          <button
            type="button"
            data-testid="skeleton-op-context-rerun"
            disabled
            style={{
              display: 'block', width: '100%', padding: '6px 10px',
              textAlign: 'left', background: 'transparent', border: 'none',
              cursor: 'not-allowed', color: 'var(--text-tertiary)',
            }}
            title="Re-execute — K9"
          >Перезапустить…</button>
          <button
            type="button"
            data-testid="skeleton-op-context-dismiss"
            onClick={onOpContextDismiss}
            style={{
              display: 'block', width: '100%', padding: '6px 10px',
              textAlign: 'left', background: 'transparent', border: 'none',
              cursor: 'pointer', color: 'var(--text-secondary)',
            }}
          >Отмена</button>
        </div>
      )}

      {/* K6 — OpKindPicker (draft) + OpPopupRouter (committed+). */}
      {openPicker && pickerOp && (
        <>
          <div
            data-testid="skeleton-op-kind-picker-mount"
            data-operation-id={openPicker.operationId}
            style={{ display: 'none' }}
            aria-hidden="true"
          />
          <OpKindPicker
            operation={pickerOp}
            position={{ x: openPicker.x, y: openPicker.y }}
            onPick={onPickerPickKind}
            onCancel={onPickerCancelOp}
          />
        </>
      )}
      {openPopup && popupOp && (
        <>
          <div
            data-testid="skeleton-op-popup-mount"
            data-operation-id={openPopup.operationId}
            style={{ display: 'none' }}
            aria-hidden="true"
          />
          <OpPopupRouter
            operation={popupOp}
            position={{ x: openPopup.x, y: openPopup.y }}
            containers={state.containers}
            onCancel={onPopupCancel}
            onExecute={onPopupExecute}
          />
        </>
      )}

      {pickerForId && (
        <PlaceholderTreePicker
          onPick={onPickerPick}
          onCancel={onPickerCancel}
        />
      )}
    </div>
  );
}
