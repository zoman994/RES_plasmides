import { useRef, useState } from 'react';

/**
 * LibraryGroupHeader — top-level collapsible group header for the
 * Library tree (Mine / This project / Demo / SnapGene catalog).
 * Extracted from the pre-K3 `Library/catalog/CatalogColumn.jsx`
 * (lines 918–1065) without behaviour changes.
 *
 * Differences from `LibraryNestedSubGroup`: dense uppercase pill style,
 * top-of-section background tint, no per-row depth tint (sub-groups
 * own their own depth banding), no delete affordance.
 */
export function LibraryGroupHeader({
  groupKey, label, count, open, onToggle,
  onAddChild, addChildTitle, addChildTestId,
  onAddFile, addFileTitle, addFileTestId,
  onFolderDrop, folderDropHint,
  onItemDrop, // internal item drag → ungroup (move out of any folder)
}) {
  const [dragOver, setDragOver] = useState(false);
  // Same enter/leave depth-counter pattern as LibraryNestedSubGroup so the
  // row highlight doesn't flicker when the cursor crosses inner buttons
  // (chevron, ＋, ⤓).
  const dragDepth = useRef(0);
  const fileDropEnabled = typeof onFolderDrop === 'function';
  const itemDropEnabled = typeof onItemDrop === 'function';
  const dropEnabled = fileDropEnabled || itemDropEnabled;
  const acceptsTypes = (e) => {
    const types = Array.from(e.dataTransfer?.types || []);
    return (fileDropEnabled && types.includes('Files'))
      || (itemDropEnabled && types.includes('application/x-bodgegene-item-id'));
  };
  return (
    <div
      className="importer-catalog-group-header"
      data-folder-drop-hover={dragOver ? 'true' : undefined}
      title={dropEnabled && dragOver ? folderDropHint : undefined}
      onDragEnter={dropEnabled ? (e) => {
        if (!acceptsTypes(e)) return;
        e.preventDefault();
        dragDepth.current += 1;
        if (dragDepth.current === 1) setDragOver(true);
      } : undefined}
      onDragOver={dropEnabled ? (e) => {
        if (!acceptsTypes(e)) return;
        e.preventDefault();
        const types = Array.from(e.dataTransfer?.types || []);
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = types.includes('application/x-bodgegene-item-id') ? 'move' : 'copy';
        }
      } : undefined}
      onDragLeave={dropEnabled ? () => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragOver(false);
      } : undefined}
      onDrop={dropEnabled ? (e) => {
        if (!acceptsTypes(e)) return;
        e.preventDefault();
        e.stopPropagation();
        dragDepth.current = 0;
        setDragOver(false);
        const types = Array.from(e.dataTransfer?.types || []);
        if (itemDropEnabled && types.includes('application/x-bodgegene-item-id')) {
          const itemId = e.dataTransfer.getData('application/x-bodgegene-item-id');
          const sourceFolder = e.dataTransfer.getData('application/x-bodgegene-source-folder') || '';
          if (itemId) onItemDrop(itemId, sourceFolder);
          return;
        }
        if (fileDropEnabled && types.includes('Files')) {
          const files = Array.from(e.dataTransfer.files || []);
          if (files.length > 0) onFolderDrop(files);
        }
      } : undefined}
      style={{
        display: 'flex', alignItems: 'stretch',
        background: dragOver
          ? 'color-mix(in srgb, var(--accent-500) 18%, transparent)'
          : 'var(--surface-2, #f5f5f4)',
        borderBottom: '0.5px solid var(--border-subtle)',
        outline: dragOver ? '1px dashed var(--accent-500)' : 'none',
        outlineOffset: '-1px',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        data-testid={`importer-catalog-group-${groupKey}`}
        aria-expanded={open}
        // UX-008 — without an aria-label the group header just announces
        // «expanded button»; this gives the SR user the actual group
        // name + item count + state. Matches the visual sighted users see.
        aria-label={`${label}, ${count ?? 0} items, ${open ? 'expanded' : 'collapsed'}`}
        style={{
          flex: 1,
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 12px',
          fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4,
          color: 'var(--text-secondary)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          fontWeight: 500,
        }}
      >
        <span
          aria-hidden="true"
          className="importer-catalog-chevron"
          data-open={open ? 'true' : 'false'}
          style={{
            width: 10, color: 'var(--text-tertiary)',
            display: 'inline-block',
            transition: 'transform 140ms ease-out',
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
          }}
        >▾</span>
        <span style={{ flex: 1 }}>{label}</span>
        {typeof count === 'number' && (
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{count}</span>
        )}
      </button>
      {onAddFile && (
        <button
          type="button"
          className="importer-catalog-add-file"
          data-testid={addFileTestId}
          onClick={(e) => { e.stopPropagation(); onAddFile(); }}
          title={addFileTitle}
          aria-label={addFileTitle}
          style={{
            padding: '0 6px',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-tertiary)',
            fontSize: 12, lineHeight: 1,
            cursor: 'pointer',
          }}
        >⤓</button>
      )}
      {onAddChild && (
        <button
          type="button"
          className="importer-catalog-add-child"
          data-testid={addChildTestId}
          onClick={(e) => { e.stopPropagation(); onAddChild(); }}
          title={addChildTitle}
          aria-label={addChildTitle}
          style={{
            padding: '0 10px',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-tertiary)',
            fontSize: 14, lineHeight: 1,
            cursor: 'pointer',
          }}
        >＋</button>
      )}
    </div>
  );
}
