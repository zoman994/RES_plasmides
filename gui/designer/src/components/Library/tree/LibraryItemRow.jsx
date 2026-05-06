import { memo } from 'react';
import { STRINGS } from '../../../lib/strings';
import PlasmidMiniMap from '../../PlasmidMiniMap';
import { indentForDepth, depthBackground, CHEVRON_GUTTER } from './library-folder-tree';

const S = STRINGS.importer;

/**
 * Library tree row variants — extracted from the pre-K3
 * `Library/catalog/CatalogColumn.jsx` (lines 1336–1525) as part of the
 * M-X.5 K3 decomposition. Pure relocate, no behaviour change.
 *
 *   • LibraryItemRow — the dense per-item row used inside group +
 *     folder lists (with optional drag handle + delete button).
 *   • CatalogCard — the wider card variant used by flat-search results.
 *   • EmptyHint — the «no items» / «нет результатов» italic placeholder.
 *
 * Memo on LibraryItemRow stays. Onclick / onDelete arrow callbacks are
 * recreated by the parent every render but the item object + flags
 * stabilise — so the explicit comparator skips ~700 SnapGene rows
 * during scroll churn.
 */
export const LibraryItemRow = memo(function LibraryItemRow({
  item,
  onClick,
  depth = 1,
  onDelete,
  deleteTitle,
  draggable = false,
  sourceFolder = '',
}) {
  // Pad: when there's a drag handle on the left, the click button starts a
  // bit deeper so handle + content don't overlap. Without handle the row
  // pads from indentForDepth + CHEVRON_GUTTER as before.
  const HANDLE_W = 14;
  const dragEnabled = draggable && !!item.id;
  const padLeft = indentForDepth(depth) + CHEVRON_GUTTER + (dragEnabled ? HANDLE_W : 0);
  const length = item.length || item.sequence?.length || 0;
  return (
    <div
      className="importer-catalog-item-row"
      style={{
        '--depth-bg': depthBackground(depth),
        display: 'flex', alignItems: 'stretch',
        position: 'relative',
        // Per-row scroll perf: each LibraryItemRow carries an SVG mini-map +
        // labels + buttons; with ~700 SnapGene catalog entries open
        // simultaneously, the cumulative paint cost causes scroll
        // micro-jitter (биолог 03.05.2026 evening: «как ускорить
        // скролл левой панели в библиотеке, там тоже подлагивает,
        // хочу плавность»). `content-visibility: auto` lets the
        // browser skip layout + paint of off-screen rows entirely;
        // `contain: paint` localises the paint area for visible
        // ones; `contain-intrinsic-size: auto 28px` keeps scroll
        // height accurate before realisation.
        contentVisibility: 'auto',
        containIntrinsicSize: 'auto 28px',
        contain: 'paint',
      }}
    >
      {dragEnabled && (
        // Dedicated drag handle — Chrome/Vivaldi often refuse to start
        // an HTML5 drag from inside a <button> (mousedown gets captured
        // for the click). A separate draggable element with grip icon
        // gives biolog a clear «hold here to move» affordance.
        <span
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('application/x-bodgegene-item-id', item.id);
            e.dataTransfer.setData('application/x-bodgegene-source-folder', sourceFolder || '');
            e.dataTransfer.effectAllowed = 'move';
          }}
          className="importer-catalog-drag-handle"
          data-testid={`importer-catalog-drag-${item.id}`}
          aria-label={S.catalogDragHandleAria}
          title={S.catalogDragHandleAria}
          style={{
            position: 'absolute',
            left: indentForDepth(depth) + CHEVRON_GUTTER - 2,
            top: 0, bottom: 0,
            width: HANDLE_W,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-tertiary)',
            cursor: 'grab',
            userSelect: 'none',
            fontSize: 10, lineHeight: 1,
          }}
        >⋮⋮</span>
      )}
      <button
        type="button"
        data-testid={`importer-catalog-item-${item.id || item.name}`}
        onClick={onClick}
        className="importer-catalog-item"
        // UX-008 — screen reader friendliness. Without an aria-label the
        // catalog button just announces «button» — useless when there
        // are 700+ rows in the SnapGene tree. The label assembles the
        // visible text bits the sighted user reads off the row.
        aria-label={`${item.name || 'unnamed'}, ${length} bp, ${item.topology || 'circular'}`}
        style={{
          flex: 1,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: `3px 10px 3px ${padLeft}px`,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <PlasmidMiniMap
          length={length}
          topology={item.topology || 'circular'}
          annotations={item.annotations || []}
          size={20}
          mode="inline"
        />
        <span style={{
          flex: 1, fontSize: 11.5, fontWeight: 400,
          color: 'var(--text-secondary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {item.name}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
          {length.toLocaleString()}
        </span>
      </button>
      {onDelete && (
        <button
          type="button"
          className="importer-catalog-delete"
          data-testid={`importer-catalog-delete-item-${item.id || item.name}`}
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title={deleteTitle}
          aria-label={deleteTitle}
          style={{
            padding: '0 8px',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-tertiary)',
            fontSize: 12, lineHeight: 1,
            cursor: 'pointer',
          }}
        >×</button>
      )}
    </div>
  );
}, (prev, next) => (
  // Skip re-render for unchanged catalog items — onClick / onDelete arrows
  // are recreated each parent render but the item object + flags don't
  // shift unless the underlying entry changes. Big perf win for 400-item
  // SnapGene categories where parent state churn (drag highlights, hover
  // bridges) used to bubble through every row.
  prev.item === next.item
  && prev.depth === next.depth
  && prev.draggable === next.draggable
  && prev.sourceFolder === next.sourceFolder
  && (prev.onDelete == null) === (next.onDelete == null)
  && prev.deleteTitle === next.deleteTitle
));

export function CatalogCard({ item, onClick }) {
  const length = item.length || item.sequence?.length || 0;
  return (
    <button
      type="button"
      data-testid={`importer-catalog-card-${item.id || item.name}`}
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex', alignItems: 'flex-start', gap: 8,
        padding: '6px 8px', marginBottom: 4,
        background: 'var(--surface-1)',
        border: '0.5px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <PlasmidMiniMap
        length={length}
        topology={item.topology || 'circular'}
        annotations={item.annotations || []}
        size={40}
        mode="inline"
        name={item.name}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.name}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {(item.description || '').replace(/<[^>]*>/g, '').trim() || item._badge}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', display: 'flex', gap: 8, marginTop: 2 }}>
          <span style={{ fontFamily: 'var(--font-mono)' }}>{length.toLocaleString()} bp</span>
          {item._badge && (
            <span style={{ padding: '0 6px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)' }}>{item._badge}</span>
          )}
        </div>
      </div>
    </button>
  );
}

export function EmptyHint({ label, testId, depth = 0 }) {
  // Match LibraryItemRow's CHEVRON_GUTTER offset when used inside a list,
  // so the hint sits under the parent's text column rather than its chevron.
  const padLeft = depth > 0 ? indentForDepth(depth) + CHEVRON_GUTTER : indentForDepth(depth);
  return (
    <div
      data-testid={testId}
      style={{
        padding: `4px 10px 4px ${padLeft}px`,
        background: depthBackground(depth),
        fontSize: 11, color: 'var(--text-tertiary)', fontStyle: 'italic',
      }}
    >{label}</div>
  );
}

export const newFolderInputStyle = {
  width: 'calc(100% - 24px)',
  margin: '4px 10px 4px 24px',
  padding: '3px 8px',
  fontSize: 12,
  color: 'var(--text-primary)',
  background: 'var(--surface-1)',
  border: '0.5px solid var(--accent-500)',
  borderRadius: 'var(--radius-md)',
  outline: 'none',
};
