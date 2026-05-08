/**
 * DagPaletteItemRow — palette row for the DAG canvas (M-C.1 K3).
 *
 * Slim variant of LibraryItemRow. The drag handle ⋮⋮ writes the
 * `application/x-bodgegene-dag-add` MIME (the DagCanvas drop target
 * in K2 reads the same MIME). The rest of the row is a click button
 * that fires `onClick(item)` for the PreviewDrawer.
 *
 * Spec said «react-dnd source 'DAG_ADD'» — the codebase uses native
 * HTML5 drag everywhere else (LibraryItemRow.jsx) and has no
 * DndProvider mounted, so we keep the same pattern.
 */
import { memo } from 'react';
import { STRINGS } from '../../../lib/strings';
import PlasmidMiniMap from '../../PlasmidMiniMap';

const S = STRINGS.dag;

const HANDLE_W = 14;
const ROW_H = 32;

function formatLength(item) {
  const len = item.length || item.sequence?.length || 0;
  if (len >= 1000) return `${(len / 1000).toFixed(1)} kb`;
  return `${len} bp`;
}

export const DagPaletteItemRow = memo(function DagPaletteItemRow({
  item,
  draggable = false,
  onClick,
}) {
  const onDragStart = (e) => {
    if (!draggable || !item.id) return;
    if (e.dataTransfer) {
      e.dataTransfer.setData('application/x-bodgegene-dag-add', item.id);
      e.dataTransfer.effectAllowed = 'copy';
    }
  };
  return (
    <div
      data-testid={`dag-palette-row-${item.id || item.name}`}
      onClick={(e) => {
        // Drag handle has its own click semantics (browsers fire click
        // even after dragstart on some platforms) — so guard against
        // bubbling clicks originating inside it.
        if (e.target instanceof HTMLElement && e.target.closest('[data-testid^="dag-palette-drag-handle-"]')) return;
        onClick?.();
      }}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        height: ROW_H,
        cursor: 'pointer',
      }}
    >
      {draggable && (
        <span
          draggable
          onDragStart={onDragStart}
          data-testid={`dag-palette-drag-handle-${item.id}`}
          aria-label={S.paletteDragHandleAria}
          title={S.paletteDragHandleAria}
          style={{
            position: 'absolute',
            left: 4,
            top: 0,
            bottom: 0,
            width: HANDLE_W,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-tertiary)',
            cursor: 'grab',
            userSelect: 'none',
            fontSize: 10,
          }}
        >⋮⋮</span>
      )}
      <button
        type="button"
        onClick={onClick}
        style={{
          flex: 1,
          height: '100%',
          paddingLeft: draggable ? HANDLE_W + 14 : 12,
          paddingRight: 8,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          textAlign: 'left',
        }}
      >
        <span style={{ width: 20, height: 20, lineHeight: 0 }}>
          <PlasmidMiniMap
            length={item.length || item.sequence?.length || 0}
            topology={item.topology}
            annotations={item.annotations || []}
            size={20}
            disableHoverOverlay
          />
        </span>
        <span
          style={{
            flex: 1,
            fontSize: 12,
            color: 'var(--text-primary, #1c1917)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >{item.name || item.id}</span>
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{formatLength(item)}</span>
      </button>
    </div>
  );
});

export default DagPaletteItemRow;
