/**
 * ProjectZone — Library workspace tree zone «📦 <name>.bodge».
 *
 * Shows two always-visible structural sub-folders matching the
 * .bodge container shape (M-C.1, post M-X.7c K4):
 *   • 📋 Контейнеры — all entries with kind='container'
 *   • 🧬 Праймеры   — all entries with kind='primer'
 *
 * The DAG sub-folder was removed in M-X.7c K4 per
 * DEC-UIRREV-DAG-NOT-FOLDER-01 — DAG is a render mode of the
 * right panel, not a folder of records. Containers open by default;
 * Праймеры start collapsed.
 *
 * The «active» pill renders ONLY when this project's id matches
 * `state.currentProjectId` (DEC-UIRREV-ACTIVE-SINGLE-01). Inactive
 * projects show no badge.
 */
import { useState, useCallback, useMemo } from 'react';
import { useStore } from '../../../store';
import { STRINGS } from '../../../lib/strings';
import LibraryZone from './LibraryZone';
import TreeFolderRow from './TreeFolderRow';
import TreeItemRow from './TreeItemRow';
import VersionLineageNode from './VersionLineageNode';
import { groupVisibleLineages } from '../lib/version-lineage';
import ContextMenu from '../../ContextMenu';
import { FEATURE_FLAGS } from '../../../lib/feature-flags';
import { Icon } from '../../icons/Icon';

function matchesQuery(entry, q) {
  if (!q) return true;
  return (entry?.name || '').toLowerCase().includes(q.toLowerCase());
}

export default function ProjectZone({
  project,
  query = '',
  selectedId = null,
  onSelectEntry,
  expanded = true,
  onToggle,
  onExportProject,
}) {
  const ws = STRINGS.libraryWorkspace || {};
  const projectId = project?.id;
  const entriesById = useStore((s) => s.libraryEntries);
  const projectsById = useStore((s) => s.projects);
  const currentProjectId = useStore((s) => s.currentProjectId);
  const cloneEntryToActiveProject = useStore((s) => s.cloneEntryToActiveProject);
  const isActiveProject = !!projectId && currentProjectId === projectId;

  const projectEntries = useMemo(() => {
    const containerIds = new Set(projectsById?.[projectId]?.containerIds || []);
    return Object.values(entriesById || {})
      .filter((e) => e && !e._pendingDelete
        && (e.projectId === projectId || containerIds.has(e.id)))
      .sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
  }, [entriesById, projectsById, projectId]);

  const containerEntries = useMemo(
    () => projectEntries.filter((e) => e.kind === 'container' || !e.kind),
    [projectEntries],
  );
  const primerEntries = useMemo(
    () => projectEntries.filter((e) => e.kind === 'primer'),
    [projectEntries],
  );

  const filteredContainers = useMemo(
    () => containerEntries.filter((e) => matchesQuery(e, query)),
    [containerEntries, query],
  );
  const filteredPrimers = useMemo(
    () => primerEntries.filter((e) => matchesQuery(e, query)),
    [primerEntries, query],
  );

  // Collapse version lineages: chained edits/versions of one molecule render
  // as ONE node (head + count), not N flat sibling rows (главная боль —
  // версии плодятся в библиотеке). Singletons fall through to a plain row.
  const containerGroups = useMemo(
    () => groupVisibleLineages(entriesById, filteredContainers),
    [entriesById, filteredContainers],
  );

  // Sub-folder open state: Контейнеры open by default
  const [openFolders, setOpenFolders] = useState(() => new Set(['containers']));
  const toggleFolder = useCallback((key) => {
    setOpenFolders((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // Per-lineage expand state (which collapsed version-stacks are open).
  const [expandedLineages, setExpandedLineages] = useState(() => new Set());
  const toggleLineage = useCallback((id) => {
    setExpandedLineages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // K7 drop target
  const [dropActive, setDropActive] = useState(false);
  const onDragOver = useCallback((e) => {
    e.preventDefault();
    try { e.dataTransfer.dropEffect = 'copy'; } catch { /* ignore */ }
    setDropActive(true);
  }, []);
  const onDragLeave = useCallback(() => setDropActive(false), []);
  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDropActive(false);
    let id = '';
    try { id = e.dataTransfer.getData('application/x-bodge-entry-id'); } catch { /* ignore */ }
    if (!id) return;
    cloneEntryToActiveProject?.(id);
  }, [cloneEntryToActiveProject]);

  // M-X.7c K4: «active» pill renders only on the single active
  // project per DEC-UIRREV-ACTIVE-SINGLE-01. Other .bodge zones
  // show no badge.
  const pill = isActiveProject ? (
    <span
      style={{
        fontSize: 9.5, padding: '0 6px', borderRadius: 9,
        background: 'var(--accent-50)',
        color: 'var(--accent-text)',
        border: '1px solid var(--accent-300)',
        fontWeight: 500, letterSpacing: 0, textTransform: 'none',
      }}
    >active</span>
  ) : null;

  const totalFiltered = filteredContainers.length + filteredPrimers.length;

  // Soft-delete the project — flips `_pendingDelete` on the
  // projectSlice, project disappears from the regular tree, and
  // surfaces in the Trash zone where it can be restored or purged.
  const markProjectPendingDelete = useStore((s) => s.markPendingDelete);
  const unmarkProjectPendingDelete = useStore((s) => s.unmarkPendingDelete);
  const showToast = useStore((s) => s.showToast);
  const trashStrings = STRINGS.libraryWorkspace?.trash || {};
  const onDeleteProject = useCallback(async (e) => {
    e?.stopPropagation();
    if (!projectId || !markProjectPendingDelete) return;
    const name = project?.name || projectId;
    try {
      await markProjectPendingDelete(projectId);
      const toastFn = trashStrings.projectDeleteToast;
      const msg = typeof toastFn === 'function'
        ? toastFn(name)
        : `Удалён проект: ${name} (в Корзине)`;
      showToast?.(msg, 'info', {
        onUndo: () => unmarkProjectPendingDelete?.(projectId),
      });
    } catch (err) {
      showToast?.(err?.message || 'Ошибка', 'error');
    }
  }, [projectId, project, markProjectPendingDelete, unmarkProjectPendingDelete, showToast, trashStrings]);

  // Manage the project from the tree (project hub): activate = make current.
  // Header CLICK already activates a non-current project (LibraryTreeRoot), so
  // the menu item is a discoverable, explicit duplicate. ★ pin removed (Игорь
  // 20.06: «звёздочки нафиг не нужны»).
  const activateProject = useStore((s) => s.activateProject);
  const onActivate = useCallback((e) => {
    e?.stopPropagation();
    if (projectId) activateProject?.(projectId);
  }, [projectId, activateProject]);

  // Right-click context menu (Игорь 20.06: «выгрузить / удалить / сделать
  // текущим — по правой кнопке мыши»). Gated by libraryTreeContextMenu like
  // TreeItemRow; the flag-off path keeps inline header buttons (rollback).
  const [ctxMenu, setCtxMenu] = useState(null);
  const onHeaderContextMenu = useCallback((e) => {
    if (!FEATURE_FLAGS.libraryTreeContextMenu) return;
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);
  const ctxItems = useMemo(() => {
    const items = [];
    if (!isActiveProject) items.push({ label: 'Сделать текущим проектом', icon: 'folder', onClick: () => onActivate() });
    if (onExportProject) items.push({ label: 'Выгрузить проект', icon: 'export', onClick: () => onExportProject(projectId) });
    if (items.length) items.push({ divider: true });
    items.push({ label: 'Удалить проект', icon: 'trash', onClick: () => onDeleteProject(), danger: true });
    return items;
  }, [isActiveProject, onExportProject, projectId, onActivate, onDeleteProject]);

  const btnStyle = {
    fontSize: 11, padding: '1px 5px',
    background: 'transparent',
    border: '1px solid var(--border-subtle)',
    borderRadius: 3, cursor: 'pointer',
    color: 'var(--text-secondary)',
    lineHeight: 1.3,
  };

  // With the context menu ON (default) the header carries NO inline buttons —
  // activate / export / delete live in the right-click menu, ★ pin is gone.
  // Flag-OFF restores inline buttons (minus the star) as a rollback path.
  const headerAction = FEATURE_FLAGS.libraryTreeContextMenu ? null : (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {!isActiveProject && (
        <button
          type="button"
          data-testid={`project-zone-activate-${projectId}`}
          title="Сделать текущим проектом"
          onClick={onActivate}
          style={{ ...btnStyle, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        ><Icon name="folder" size={13} /></button>
      )}
      {onExportProject && (
        <button
          type="button"
          data-testid={`project-zone-export-${projectId}`}
          title="Выгрузить проект"
          onClick={(e) => { e.stopPropagation(); onExportProject(projectId); }}
          style={{ ...btnStyle, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        ><Icon name="export" size={13} /></button>
      )}
      <button
        type="button"
        data-testid={`project-zone-delete-${projectId}`}
        title={trashStrings.projectDeleteTooltip || 'Удалить проект в Корзину'}
        onClick={onDeleteProject}
        style={{ ...btnStyle, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'rgb(220, 38, 38)' }}
      ><Icon name="trash" size={13} /></button>
    </span>
  );

  return (
    <div
      data-testid={`tree-zone-drop-${projectId}`}
      data-drop-active={dropActive ? 'true' : 'false'}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        background: dropActive ? 'var(--accent-50)' : 'transparent',
        transition: 'background 80ms',
      }}
    >
      <LibraryZone
        variant="active"
        icon={<Icon name="folder" size={13} />}
        title={(() => {
          // Drop the `.bodge` filename suffix (UPPERCASE styling handled in
          // LibraryZone by `variant === 'active'`). ★ pin glyph removed 20.06.
          const raw = project?.name || project?.id || '—';
          return raw.replace(/\.bodge$/i, '');
        })()}
        pill={pill}
        count={totalFiltered}
        expanded={expanded}
        onToggle={onToggle}
        onHeaderContextMenu={onHeaderContextMenu}
        headerAction={headerAction}
        testId={`library-zone-project-${projectId}`}
      >
        {/* ── Контейнеры ───────────────────────────────────── */}
        <TreeFolderRow
          name={ws.containersFolder || 'Контейнеры'}
          icon={<Icon name="list" size={13} />}
          count={filteredContainers.length}
          expanded={openFolders.has('containers')}
          indent={1}
          onToggle={() => toggleFolder('containers')}
          testId={`tree-folder-containers-${projectId}`}
        />
        {openFolders.has('containers') && containerGroups.map((g) => (
          g.count > 1 ? (
            <VersionLineageNode
              key={g.rootId}
              group={g}
              selectedId={selectedId}
              onSelectEntry={onSelectEntry}
              expanded={expandedLineages.has(g.rootId)}
              onToggle={() => toggleLineage(g.rootId)}
              indent={2}
              testId={`version-lineage-${g.rootId}`}
            />
          ) : (
            <TreeItemRow
              key={g.headEntry.id}
              entry={g.headEntry}
              isSelected={g.headEntry.id === selectedId}
              onSelect={onSelectEntry}
              indent={2}
              // 12.05.2026 — entries в проекте должны быть draggable
              // (canvas-skeleton drop-target, cross-project clone в
              // Library — обе фичи требуют drag). LooseZone уже
              // включает это; ProjectZone было оставлено по умолчанию
              // false — bug.
              draggable
              testId={`tree-item-project-${g.headEntry.id}`}
            />
          )
        ))}

        {/* M-X.7c K4: DAG sub-folder removed
            (DEC-UIRREV-DAG-NOT-FOLDER-01) — DAG is a render mode
            of the right panel, not a folder of records. */}

        {/* ── Праймеры ─────────────────────────────────────── */}
        <TreeFolderRow
          name={ws.primersFolder || 'Праймеры'}
          icon={<Icon name="primer" size={13} />}
          count={filteredPrimers.length}
          expanded={openFolders.has('primers')}
          indent={1}
          onToggle={() => toggleFolder('primers')}
          testId={`tree-folder-primers-${projectId}`}
        />
        {openFolders.has('primers') && filteredPrimers.map((entry) => (
          <TreeItemRow
            key={entry.id}
            entry={entry}
            isSelected={entry.id === selectedId}
            onSelect={onSelectEntry}
            indent={2}
            draggable
            testId={`tree-item-project-${entry.id}`}
          />
        ))}
      </LibraryZone>
      {ctxMenu && (
        <ContextMenu items={ctxItems} position={ctxMenu} onClose={() => setCtxMenu(null)} />
      )}
    </div>
  );
}
