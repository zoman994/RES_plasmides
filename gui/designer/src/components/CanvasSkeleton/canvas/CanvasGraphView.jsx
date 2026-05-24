/**
 * CanvasGraphView — Graph view с auto-layout (DAG read-only viz).
 *
 * Harvest из Dag/DagCanvas.jsx pattern: dagre LR через
 * `lib/dag-layout::computeAutoLayout`. ReactFlow НЕ используется
 * здесь напрямую (skeleton-у достаточно SVG + absolute divs).
 *
 * Bipartite: ContainerBlock (squares/circles) + OperationNode (ромбы).
 * V114 K1: the graph core (SVG edges + node render) is now `ZoneGraphContent`
 * — extracted so the zone Layout graph-mode reuses the exact same renderer.
 * This component keeps the canvas-specific shell: drag-from-tree drop target,
 * op click/context-menu, OpKindPicker/OpPopupRouter, PlaceholderTreePicker.
 */
import { useCallback, useState } from 'react';
import { useSkeletonState, useSkeletonActions } from '../store/skeleton-context';
import ZoneGraphContent from './ZoneGraphContent';
import { useTreeDropTarget } from './use-tree-drop-target';
import PlaceholderTreePicker from './PlaceholderTreePicker';
import OpKindPicker from './operations/OpKindPicker';
import OpPopupRouter from './operations/OpPopupRouter';

export default function CanvasGraphView() {
  const state = useSkeletonState();
  const actions = useSkeletonActions();

  const [pickerForId, setPickerForId] = useState(null);
  // K5 — open picker/popup local state for V2 operations.
  const [openPicker, setOpenPicker] = useState(null);
  const [openPopup, setOpenPopup] = useState(null);
  const [opContextMenu, setOpContextMenu] = useState(null);

  // Drag-from-Library-Tree drop target (NOTES §2). Canvas-level: a drop
  // anywhere on the graph creates a container (auto-layout repositions).
  const { dragOver, dropHandlers, ref: dropRef } = useTreeDropTarget();

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

  const onOpenEditor = useCallback((containerId) => {
    // K3 GC (DEC-OPS-02): draft sessions retired. Always open
    // view-only editor.
    actions.openEditorViewOnly(containerId);
  }, [actions]);

  const onContainerClick = useCallback((id) => actions.setHighlight(id), [actions]);

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
      <ZoneGraphContent
        containers={state.containers}
        operations={state.operations}
        highlightedId={state.highlightedContainerId}
        onContainerClick={onContainerClick}
        onContainerDoubleClick={onOpenEditor}
        onOperationClick={onOperationClick}
        onOperationContextMenu={onOperationContextMenu}
        onPlaceholderClick={onPlaceholderClick}
      />

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
