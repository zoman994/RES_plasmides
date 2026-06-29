/**
 * TreeItemRow — Sprint M-X.7a v2 K2.
 *
 * `.item.indent-N` row per Library.html `<div class="item">`.
 * Renders ring SVG (mini topology indicator) + body (name + meta
 * line) + optional origin char on the right.
 *
 * Origin char convention (Library.html):
 *   ↑ file_import / paste / catalog
 *   ✎ manual_edit / manual_create
 *   🔗 cross_project_clone
 *   ✦ project_commit
 *   ❄ lab freezer (lab_pool entries with inLabStock=true)
 *
 * Mini-ring SVG is a lightweight 20×20 stand-in for the full
 * PlasmidMiniMap — at this size the map renders as a coloured
 * ring/strip that conveys topology + a hint of feature density
 * without paying the cost of full track rendering on every tree
 * row. Rich preview lives on hover (M-X.7c polish, deferred).
 */
import { memo, useState, useCallback } from 'react';
import PlasmidMiniMap from '../../PlasmidMiniMap';
import ContextMenu from '../../ContextMenu';
import { useStore } from '../../../store';
import { STRINGS } from '../../../lib/strings';
import { FEATURE_FLAGS } from '../../../lib/feature-flags';
import { downloadEntryAsGenbank } from '../../../lib/export-genbank';
import { Icon } from '../../icons/Icon';

const INDENT_PX = [12, 22, 38, 54, 70];

function indentFor(depth) {
  return INDENT_PX[Math.min(depth, INDENT_PX.length - 1)];
}

const ORIGIN_CHAR = {
  file_import: '↑',
  paste: '↑',
  paste_import: '↑',
  catalog: '↑',
  demo_category: '↑',
  manual_edit: '✎',
  manual_create: '✎',
  library_clone: '↑',
  cross_project_clone: '🔗',
  project_extract: '↗',
  project_commit: '✦',
  version: '↺',
};

const ORIGIN_COLOR = {
  cross_project_clone: 'var(--info-fg)',
  project_extract: 'var(--accent-700)',
  project_commit: 'var(--success-fg)',
  manual_edit: 'var(--accent-700)',
  manual_create: 'var(--accent-700)',
};

function originChar(entry) {
  if (entry?.kind === 'primer' && entry?.zone === 'lab_pool' && entry?.inLabStock === true) return '❄';
  const kind = entry?.origin?.kind;
  return ORIGIN_CHAR[kind] || '·';
}

function originColor(entry) {
  if (entry?.kind === 'primer' && entry?.zone === 'lab_pool' && entry?.inLabStock === true) return 'var(--kld)';
  const kind = entry?.origin?.kind;
  return ORIGIN_COLOR[kind] || 'var(--text-tertiary)';
}

function metaLine(entry) {
  if (!entry) return null;
  if (entry.kind === 'primer') {
    const parts = [];
    const len = entry.payload?.length;
    if (typeof len === 'number') parts.push(`${len} nt`);
    const tm = entry.payload?.tm;
    if (typeof tm === 'number') parts.push(`Tm ${tm.toFixed(1)}`);
    return parts.join(' · ') || null;
  }
  const parts = [];
  const len = entry.payload?.length;
  if (typeof len === 'number') parts.push(`${len.toLocaleString('ru-RU')} bp`);
  const top = entry.payload?.topology;
  if (top) parts.push(top);
  const annCount = Array.isArray(entry.payload?.annotations) ? entry.payload.annotations.length : 0;
  if (annCount > 0) parts.push(`${annCount} features`);
  return parts.join(' · ') || null;
}

function MiniIcon({ entry, color = 'var(--text-secondary)' }) {
  // Per 09.05.2026 «Library == DAG palette» refresh: render the
  // real PlasmidMiniMap (same component DagPalette uses) instead
  // of the K2 placeholder Ring SVG. At size=20 the map renders as
  // a coloured ring + feature arcs, which conveys topology +
  // feature density at a glance — biolog reported the previous
  // ring-only icon was unreadable as a plasmid.
  //
  // Primers + linear-without-features fall back to a tiny strand
  // line (no point in PlasmidMiniMap for a 4 nt primer).
  const top = entry?.payload?.topology;
  const annotations = entry?.payload?.annotations;
  if (entry?.kind === 'primer' || (top === 'linear' && (!annotations || annotations.length === 0))) {
    return (
      <svg width={20} height={20} viewBox="0 0 20 20" aria-hidden focusable="false">
        <line x1="2" y1="10" x2="18" y2="10" stroke={color} strokeWidth="1.6" />
      </svg>
    );
  }
  return (
    <PlasmidMiniMap
      length={entry?.payload?.length || (entry?.payload?.sequence?.length || 0)}
      topology={top || 'circular'}
      annotations={annotations || []}
      size={20}
      disableHoverOverlay
    />
  );
}

export const TreeItemRow = memo(function TreeItemRow({
  entry,
  isSelected = false,
  onSelect,
  indent = 2,
  testId,
  // M-X.7a v2 K7: native HTML5 drag-drop. Loose-zone rows get
  // `draggable=true` so biolog can drop them onto an active
  // ProjectZone for a clone (DEC-MX7A-V2-10 minimum). Read-only
  // zones stay non-draggable — biolog can copy them via the
  // action-row's «Скопировать в активный» button instead.
  draggable = false,
  // Optional small chip(s) rendered right after the mini-ring (used by
  // VersionLineageNode for the «v3» / «⑂ ветка» / status markers on a
  // collapsed version stack). Plain node, no layout assumptions.
  badge = null,
}) {
  // M-X.7c K5 — hover-revealed «+» quick-add per
  // DEC-UIRREV-QUICKADD-HOVER-01. Visible only when an active
  // project exists AND this entry is not already part of it.
  const [hovered, setHovered] = useState(false);
  const currentProjectId = useStore((s) => s.currentProjectId);
  const cloneEntryToActiveProject = useStore((s) => s.cloneEntryToActiveProject);
  const showToast = useStore((s) => s.showToast);
  const projects = useStore((s) => s.projects);
  // Quick-delete moves the entry into the Trash zone (sets
  // `_pendingDelete: true`). The undo toast lets the user revert in
  // one click; otherwise the entry stays in Trash until the user
  // explicitly purges it via the TrashZone surface. No auto-commit
  // on toast dismiss — items must survive a tab close so they can be
  // recovered from the Trash zone.
  const markPendingDelete = useStore((s) => s.markLibraryEntryPendingDelete);
  const unmarkPendingDelete = useStore((s) => s.unmarkLibraryEntryPendingDelete);
  // Phase 4 (правый клик): дополнительные действия записи для контекстного меню.
  const extractEntryToLoose = useStore((s) => s.extractEntryToLoose);
  const renameLibraryEntry = useStore((s) => s.renameLibraryEntry);
  const [ctxMenu, setCtxMenu] = useState(null); // { x, y } | null
  const showQuickAdd = !!currentProjectId
    && !!entry
    && entry.kind !== 'primer' /* primers come later via specific flow */
    && entry.projectId !== currentProjectId;
  // Clone to active project — core (no event), shared by the hover «+»
  // button and the right-click menu (фаза 4).
  const doClone = useCallback(async () => {
    if (!entry?.id || !cloneEntryToActiveProject) return;
    try {
      let res = await cloneEntryToActiveProject(entry.id);
      // V52 — entry already in the active project: confirm before
      // adding a second copy (default = Нет, no silent duplicate).
      if (res && res.ok === false && res.reason === 'duplicate') {
        const dupName = res.name || entry.name || entry.id;
        const ask = (typeof window !== 'undefined' && typeof window.confirm === 'function')
          ? window.confirm(`«${dupName}» уже есть в этом проекте. Добавить ещё одну копию?`)
          : false;
        if (!ask) {
          showToast?.(`«${dupName}» уже в проекте — не добавлено`, 'info');
          return;
        }
        res = await cloneEntryToActiveProject(entry.id, { force: true });
        if (!res || res.ok === false) {
          showToast?.('Не удалось добавить копию', 'error');
          return;
        }
      }
      const projName = projects?.[currentProjectId]?.name || currentProjectId;
      const toastFn = STRINGS.libraryWorkspace?.treeRow?.quickAddDoneToast;
      const msg = typeof toastFn === 'function'
        ? toastFn(entry.name || entry.id, projName)
        : `${entry.name || entry.id} добавлен в ${projName}`;
      showToast?.(msg, 'success');
    } catch (err) {
      showToast?.(err?.message || 'Ошибка', 'error');
    }
  }, [entry, cloneEntryToActiveProject, currentProjectId, projects, showToast]);
  const onQuickAdd = useCallback((e) => { e.stopPropagation(); doClone(); }, [doClone]);

  const doDelete = useCallback(async () => {
    if (!entry?.id || !markPendingDelete) return;
    const name = entry.name || entry.id;
    try {
      await markPendingDelete(entry.id);
      const toastFn = STRINGS.libraryWorkspace?.treeRow?.quickDeleteDoneToast;
      const msg = typeof toastFn === 'function' ? toastFn(name) : `Удалено: ${name} (в Корзине)`;
      showToast?.(msg, 'info', { onUndo: () => unmarkPendingDelete?.(entry.id) });
    } catch (err) {
      showToast?.(err?.message || 'Ошибка', 'error');
    }
  }, [entry, markPendingDelete, unmarkPendingDelete, showToast]);
  const onQuickDelete = useCallback((e) => { e.stopPropagation(); doDelete(); }, [doDelete]);

  // Right-click menu actions (фаза 4).
  const doRename = useCallback(async () => {
    if (!entry?.id || !renameLibraryEntry) return;
    const next = (typeof window !== 'undefined' && typeof window.prompt === 'function')
      ? window.prompt('Новое имя записи:', entry.name || '')
      : null;
    if (next == null) return;
    const trimmed = String(next).trim();
    if (!trimmed || trimmed === entry.name) return;
    try {
      await renameLibraryEntry(entry.id, trimmed);
      showToast?.(`Переименовано: ${trimmed}`, 'success');
    } catch (err) {
      showToast?.(err?.message || 'Ошибка', 'error');
    }
  }, [entry, renameLibraryEntry, showToast]);

  const doExtract = useCallback(async () => {
    if (!entry?.id || !extractEntryToLoose) return;
    try {
      const res = await extractEntryToLoose(entry.id);
      if (res && res.ok === false) { showToast?.('Не удалось извлечь', 'info'); return; }
      showToast?.(`Извлечено в «Без проекта»: ${entry.name || entry.id}`, 'success');
    } catch (err) {
      showToast?.(err?.message || 'Ошибка', 'error');
    }
  }, [entry, extractEntryToLoose, showToast]);

  const doExport = useCallback(() => {
    try {
      const ok = downloadEntryAsGenbank(entry);
      showToast?.(ok ? `Экспортировано: ${entry.name || entry.id}.gb` : 'Не удалось экспортировать', ok ? 'success' : 'error');
    } catch (err) {
      showToast?.(err?.message || 'Ошибка', 'error');
    }
  }, [entry, showToast]);

  const onContextMenu = useCallback((e) => {
    if (!FEATURE_FLAGS.libraryTreeContextMenu) return;
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  if (!entry) return null;
  const meta = metaLine(entry);
  const oc = originChar(entry);
  const ocColor = originColor(entry);
  const ringColor = isSelected ? 'var(--accent-700)' : 'var(--text-secondary)';
  const inProject = !!entry.projectId;
  const isPrimer = entry.kind === 'primer';
  const canCopy = !!currentProjectId && !isPrimer && entry.projectId !== currentProjectId;
  const ctxItems = [
    { label: 'Переименовать', icon: '✎', onClick: doRename },
    { label: 'Скопировать в активный проект', icon: '＋', onClick: doClone, disabled: !canCopy },
    { label: 'Извлечь в «Без проекта»', icon: '↗', onClick: doExtract, disabled: !inProject },
    { label: 'Экспортировать .gb', icon: '⤓', onClick: doExport, disabled: isPrimer },
    { divider: true },
    { label: 'Удалить в Корзину', icon: '🗑', onClick: doDelete, danger: true },
  ];
  return (
    <>
    <div
      data-testid={testId || `tree-item-${entry.id}`}
      data-selected={isSelected ? 'true' : 'false'}
      role="button"
      tabIndex={0}
      draggable={draggable}
      onDragStart={(e) => {
        if (!draggable) return;
        try {
          e.dataTransfer.setData('application/x-bodge-entry-id', entry.id);
          e.dataTransfer.setData('text/plain', entry.name || entry.id);
          e.dataTransfer.effectAllowed = 'copyMove';
        } catch { /* jsdom / happy-dom may throw */ }
      }}
      onClick={() => onSelect?.(entry)}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSelect?.(entry); } }}
      onMouseEnter={(e) => {
        setHovered(true);
        if (!isSelected) e.currentTarget.style.background = 'var(--surface-2)';
      }}
      onMouseLeave={(e) => {
        setHovered(false);
        if (!isSelected) e.currentTarget.style.background = 'transparent';
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 12px',
        paddingLeft: indentFor(indent),
        cursor: 'pointer',
        userSelect: 'none',
        background: isSelected ? 'var(--accent-50)' : 'transparent',
        borderLeft: isSelected
          ? '2px solid var(--accent-500)'
          : '2px solid transparent',
      }}
    >
      <span style={{ flexShrink: 0, lineHeight: 0, width: 20, height: 20 }}>
        <MiniIcon entry={entry} color={ringColor} />
      </span>
      {badge && (
        <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 3 }}>{badge}</span>
      )}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <div
          style={{
            fontSize: 12.5,
            color: 'var(--text-primary)',
            fontWeight: isSelected ? 500 : 400,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >{entry.name || entry.id}</div>
        {meta && (
          <div
            data-testid={`${testId || `tree-item-${entry.id}`}-meta`}
            style={{
              fontSize: 10.5,
              color: 'var(--text-tertiary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >{meta}</div>
        )}
      </div>
      {showQuickAdd && (
        <button
          type="button"
          data-testid={`${testId || `tree-item-${entry.id}`}-quickadd`}
          title={STRINGS.libraryWorkspace?.treeRow?.quickAddTooltip || 'Добавить в активный проект'}
          onClick={onQuickAdd}
          style={{
            opacity: hovered ? 1 : 0,
            transition: 'opacity 120ms ease-out',
            background: 'transparent',
            border: '1px solid var(--border-subtle)',
            borderRadius: 3,
            padding: '0 5px',
            fontSize: 12,
            lineHeight: '16px',
            color: 'var(--accent-700)',
            cursor: 'pointer',
            flexShrink: 0,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
        ><Icon name="plus" size={13} /></button>
      )}
      {/* Hover-revealed quick-delete. Soft-delete with 5-sec undo
          window via the toast — biolog can recover with one click
          if it was a misclick. */}
      <button
        type="button"
        data-testid={`${testId || `tree-item-${entry.id}`}-quickdelete`}
        title={STRINGS.libraryWorkspace?.treeRow?.quickDeleteTooltip || 'Удалить в Корзину'}
        onClick={onQuickDelete}
        style={{
          opacity: hovered ? 1 : 0,
          transition: 'opacity 120ms ease-out',
          background: 'transparent',
          border: '1px solid var(--border-subtle)',
          borderRadius: 3,
          padding: '0 5px',
          fontSize: 11,
          lineHeight: '16px',
          color: 'rgb(220, 38, 38)',
          cursor: 'pointer',
          flexShrink: 0,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}
      ><Icon name="trash" size={13} /></button>
      <span
        data-testid={`${testId || `tree-item-${entry.id}`}-origin`}
        title={entry?.origin?.kind || ''}
        style={{ fontSize: 12, flexShrink: 0, color: ocColor }}
      >{oc}</span>
    </div>
    {FEATURE_FLAGS.libraryTreeContextMenu && ctxMenu && (
      <ContextMenu items={ctxItems} position={ctxMenu} onClose={() => setCtxMenu(null)} />
    )}
    </>
  );
});

export default TreeItemRow;
