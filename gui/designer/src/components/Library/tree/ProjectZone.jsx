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
  // M-X.8 K4 — pin marker (DEC-UIRREV-TREE-PIN-MARKER). When
  // truthy, a ★ glyph renders next to the project title to give
  // a visual link with the sidebar PINNED section.
  pinned = false,
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

  // Sub-folder open state: Контейнеры open by default
  const [openFolders, setOpenFolders] = useState(() => new Set(['containers']));
  const toggleFolder = useCallback((key) => {
    setOpenFolders((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
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
    e.stopPropagation();
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

  // Manage the project from the tree (project hub): pin, activate, open in Flow.
  // Header CLICK stays expand-only (deliberate, guarded by tests) — these are
  // explicit buttons, each stopPropagation so they don't toggle expand.
  const pinProject = useStore((s) => s.pinProject);
  const unpinProject = useStore((s) => s.unpinProject);
  const activateProject = useStore((s) => s.activateProject);
  const setActiveWorkspace = useStore((s) => s.setActiveWorkspace);
  const onTogglePin = useCallback((e) => {
    e.stopPropagation();
    if (!projectId) return;
    if (pinned) { unpinProject?.(projectId); return; }
    const r = pinProject?.(projectId);
    if (r === 'cap') showToast?.('Закрепить можно не больше 15 проектов', 'warning');
  }, [projectId, pinned, pinProject, unpinProject, showToast]);
  const onActivate = useCallback((e) => {
    e.stopPropagation();
    if (projectId) activateProject?.(projectId);
  }, [projectId, activateProject]);
  const onOpenInFlow = useCallback((e) => {
    e.stopPropagation();
    if (!projectId) return;
    activateProject?.(projectId);
    setActiveWorkspace?.('flow');
  }, [projectId, activateProject, setActiveWorkspace]);

  const btnStyle = {
    fontSize: 11, padding: '1px 5px',
    background: 'transparent',
    border: '1px solid var(--border-subtle)',
    borderRadius: 3, cursor: 'pointer',
    color: 'var(--text-secondary)',
    lineHeight: 1.3,
  };

  const headerAction = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <button
        type="button"
        data-testid={`project-zone-pin-${projectId}`}
        title={pinned ? 'Открепить' : 'Закрепить проект'}
        onClick={onTogglePin}
        style={{ ...btnStyle, color: pinned ? 'var(--accent-700, #c2410c)' : 'var(--text-secondary)' }}
      >{pinned ? '★' : '☆'}</button>
      {!isActiveProject && (
        <button
          type="button"
          data-testid={`project-zone-activate-${projectId}`}
          title="Сделать текущим проектом"
          onClick={onActivate}
          style={btnStyle}
        >📂</button>
      )}
      <button
        type="button"
        data-testid={`project-zone-open-flow-${projectId}`}
        title="Открыть в потоке (DAG)"
        onClick={onOpenInFlow}
        style={btnStyle}
      >→</button>
      {onExportProject && (
        <button
          type="button"
          data-testid={`project-zone-export-${projectId}`}
          title="Экспорт проекта (.zip из .gb файлов)"
          onClick={(e) => { e.stopPropagation(); onExportProject(projectId); }}
          style={btnStyle}
        >⤓</button>
      )}
      <button
        type="button"
        data-testid={`project-zone-delete-${projectId}`}
        title={trashStrings.projectDeleteTooltip || 'Удалить проект в Корзину'}
        onClick={onDeleteProject}
        style={{ ...btnStyle, color: 'rgb(220, 38, 38)' }}
      >🗑</button>
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
        icon="📦"
        title={(() => {
          // FAIL-fix-pass 3 — drop both `.bodge` filename suffix and
          // the implicit UPPERCASE styling (handled in LibraryZone
          // by `variant === 'active'`). Star rendered as a separate
          // span so test selectors keep working.
          const raw = project?.name || project?.id || '—';
          const clean = raw.replace(/\.bodge$/i, '');
          return pinned
            ? <><span data-testid={`project-zone-pin-star-${projectId}`}>★ </span>{clean}</>
            : clean;
        })()}
        pill={pill}
        count={totalFiltered}
        expanded={expanded}
        onToggle={onToggle}
        headerAction={headerAction}
        testId={`library-zone-project-${projectId}`}
      >
        {/* ── Контейнеры ───────────────────────────────────── */}
        <TreeFolderRow
          name={ws.containersFolder || 'Контейнеры'}
          icon="📋"
          count={filteredContainers.length}
          expanded={openFolders.has('containers')}
          indent={1}
          onToggle={() => toggleFolder('containers')}
          testId={`tree-folder-containers-${projectId}`}
        />
        {openFolders.has('containers') && filteredContainers.map((entry) => (
          <TreeItemRow
            key={entry.id}
            entry={entry}
            isSelected={entry.id === selectedId}
            onSelect={onSelectEntry}
            indent={2}
            // 12.05.2026 — entries в проекте должны быть draggable
            // (canvas-skeleton drop-target, cross-project clone в
            // Library — обе фичи требуют drag). LooseZone уже
            // включает это; ProjectZone было оставлено по умолчанию
            // false — bug.
            draggable
            testId={`tree-item-project-${entry.id}`}
          />
        ))}

        {/* M-X.7c K4: DAG sub-folder removed
            (DEC-UIRREV-DAG-NOT-FOLDER-01) — DAG is a render mode
            of the right panel, not a folder of records. */}

        {/* ── Праймеры ─────────────────────────────────────── */}
        <TreeFolderRow
          name={ws.primersFolder || 'Праймеры'}
          icon="🧬"
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
    </div>
  );
}
