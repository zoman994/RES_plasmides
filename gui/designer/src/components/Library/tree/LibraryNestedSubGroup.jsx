import { useEffect, useRef, useState } from 'react';
import { STRINGS } from '../../../lib/strings';
import { indentForDepth, depthBackground } from './library-folder-tree';
import { LibraryItemRow, EmptyHint } from './LibraryItemRow';

const S = STRINGS.importer;

/**
 * Library tree mid-level components — extracted from the pre-K3
 * `Library/catalog/CatalogColumn.jsx` (lines 1074–1335). Pure relocate:
 *
 *   • LibraryNestedSubGroup — recursive folder header inside the «Mine»
 *     branch (and SnapGene categories): chevron + label + drag-drop
 *     drop-zone + ＋/⤓/× action buttons. Children rendered when open.
 *   • SnapgeneCategoryRow — debounced hover-prefetch wrapper around
 *     LibraryNestedSubGroup for the SnapGene catalog (250 ms hover
 *     delay so cursor sweeps don't fire 30 fetches).
 *   • InlineItemList — renders the WHOLE list of items inside an open
 *     parent (no «show all» toggle); silently null while loading.
 *
 * No behaviour change.
 */
export function LibraryNestedSubGroup({
  testId, label, count, open, onToggle, children, depth = 1,
  onAddChild, addChildTitle, addChildTestId,
  onAddFile, addFileTitle, addFileTestId,
  onFolderDrop, folderDropHint,
  onItemDrop, // (itemId, sourceFolder) — internal drag of a library entry
  onDelete, deleteTitle, deleteTestId,
}) {
  const [dragOver, setDragOver] = useState(false);
  // dragenter/leave fire for every nested child element (chevron, label,
  // ＋ icon, ⤓ icon, …). Without depth counting, leave→child looks like
  // leave→row and the highlight flickers off. Track enter/leave depth so
  // dragOver stays true the entire time the cursor is anywhere inside the
  // row's bounding box.
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
    <>
      <div
        className="importer-catalog-nested-row"
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
            ? 'var(--accent-50, color-mix(in srgb, var(--accent-500) 18%, transparent))'
            : depthBackground(depth),
          outline: dragOver ? '1px dashed var(--accent-500)' : 'none',
          outlineOffset: '-1px',
        }}
      >
        <button
          type="button"
          onClick={onToggle}
          data-testid={testId}
          aria-expanded={open}
          aria-label={`${label} folder, ${count ?? 0} items, ${open ? 'expanded' : 'collapsed'}`}
          style={{
            flex: 1,
            display: 'flex', alignItems: 'center', gap: 6,
            padding: `4px 10px 4px ${indentForDepth(depth)}px`,
            fontSize: 12,
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span style={{ width: 10, color: 'var(--text-tertiary)' }} aria-hidden="true">{open ? '▾' : '▸'}</span>
          <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
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
        {onDelete && (
          <button
            type="button"
            className="importer-catalog-delete"
            data-testid={deleteTestId}
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
      {open && children}
    </>
  );
}

/** Inline item list — renders the WHOLE list when its parent group is
 *  expanded (no «Показать все/меньше» toggle). `depth` (1-based) controls
 *  the per-item left indent via indentForDepth(). While items are still
 *  fetching we render nothing — biolog asked for «загрузка…» to be removed
 *  because it appeared at column-zero indent and looked like a misplaced
 *  section header rather than a child of the just-opened sub-group. */
export function InlineItemList({
  items, loading, emptyLabel, emptyTestId,
  loadingTestId, // eslint-disable-line no-unused-vars -- legacy callers still pass it
  onSelectItem, depth = 1,
  onDeleteItem, // optional — only Mine entries get «×» delete handler
  draggableItems = false, // Mine only — items can be dragged to other folders
  sourceFolder = '',     // path of the parent folder these items live in
  onQuickAdd, quickAddTitle, // M-X.5 K8 — forward to LibraryItemRow
}) {
  // Reverted 2026-05-06 — earlier in this session I tried surfacing 4
  // pulsing skeleton rows during loading as «click-ack feedback». User
  // pushed back («зачем ты сделал визуализацию загрузки?»): the
  // skeletons look like fake/empty rows rather than a load signal,
  // and they show longer than the actual fetch (so they read as «the
  // app is broken» more than «items are coming»). Going back to a
  // silent null while loading.
  if (loading) return null;
  if (!items || items.length === 0) {
    return emptyLabel
      ? <EmptyHint label={emptyLabel} testId={emptyTestId} depth={depth} />
      : null;
  }
  return (
    <>
      {items.map((it) => (
        <LibraryItemRow
          key={it.id || `${it._slug || it._source}:${it.name}`}
          item={it}
          onClick={() => onSelectItem?.(it)}
          depth={depth}
          onDelete={onDeleteItem ? () => onDeleteItem(it) : null}
          deleteTitle={onDeleteItem ? S.catalogDeleteContainer(it.name || it.id) : undefined}
          draggable={draggableItems}
          sourceFolder={sourceFolder}
          onQuickAdd={onQuickAdd}
          quickAddTitle={quickAddTitle}
        />
      ))}
    </>
  );
}

// Single SnapGene category row with **debounced** hover-prefetch.
//
// Why debounce: a flat onMouseEnter prefetch caused the «first clicks
// feel ignored» symptom — when biolog ran the cursor through 30
// categories quickly, 30 fetch calls fired and each `response.json()`
// parse blocked main thread for a few hundred ms. Now we only kick
// the prefetch if the cursor actually lingers ≥250 ms.
export function SnapgeneCategoryRow({
  category, open, items, isLoading, onToggle, onPrefetch, onSelectItem,
}) {
  const hoverTimer = useRef(null);
  const cancelHoverPrefetch = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };
  const armHoverPrefetch = () => {
    if (!onPrefetch || items !== undefined) return;
    cancelHoverPrefetch();
    hoverTimer.current = setTimeout(() => {
      onPrefetch(category.slug);
      hoverTimer.current = null;
    }, 250);
  };
  useEffect(() => () => cancelHoverPrefetch(), []);

  return (
    <div onMouseEnter={armHoverPrefetch} onMouseLeave={cancelHoverPrefetch} onFocus={armHoverPrefetch}>
      <LibraryNestedSubGroup
        testId={`importer-catalog-snapgene-${category.slug}`}
        label={category.name}
        count={category.count}
        open={open}
        onToggle={onToggle}
        depth={1}
      >
        <InlineItemList
          items={items || []}
          loading={isLoading}
          emptyLabel={S.catalogEmptyGroup}
          loadingTestId={`catalog-snapgene-loading-${category.slug}`}
          onSelectItem={onSelectItem}
          depth={2}
        />
      </LibraryNestedSubGroup>
    </div>
  );
}
