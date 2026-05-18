/**
 * TrashZone — Library workspace tree zone «🗑 Корзина».
 *
 * Собирает все soft-deleted записи (LibraryEntry с `_pendingDelete:
 * true`) и проекты (`projects[id]._pendingDelete === true`) в одну
 * зону внизу tree. Биолог удалил случайно → находит здесь.
 *
 * Поведение:
 *   • Раздел всегда виден, чтобы юзер знал, куда уходят удалённые.
 *   • Header показывает количество (entries + projects).
 *   • Внутри две группы: «Контейнеры» и «Проекты» (рендерятся только
 *     при наличии содержимого).
 *   • На каждой строке две inline-кнопки:
 *       «↺ Восстановить» — unmark соответствующего слайса
 *       «✕ Удалить навсегда» — commit (физическое удаление из Dexie)
 *   • Кнопка в шапке «Очистить корзину» коммитит всё разом (через
 *     window.confirm).
 *   • При пустой корзине тело показывает «Корзина пуста».
 *
 * Контракт: TrashZone сам читает store, родитель не передаёт списки.
 */
import { useMemo, useCallback } from 'react';
import { useStore } from '../../../store';
import { STRINGS } from '../../../lib/strings';
import LibraryZone from './LibraryZone';
import TreeFolderRow from './TreeFolderRow';

const BTN_STYLE = {
  fontSize: 11, padding: '1px 6px',
  background: 'transparent',
  border: '1px solid var(--border-subtle)',
  borderRadius: 3, cursor: 'pointer',
  color: 'var(--text-secondary)',
  lineHeight: 1.3,
  marginLeft: 4,
};

const PURGE_BTN_STYLE = {
  ...BTN_STYLE,
  color: 'rgb(220, 38, 38)',
};

function TrashRow({ name, sub, kind, id, onRestore, onPurge, indent = 2 }) {
  const ws = STRINGS.libraryWorkspace || {};
  const trash = ws.trash || {};
  return (
    <div
      data-testid={`trash-row-${kind}-${id}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 12px',
        paddingLeft: indent === 1 ? 22 : 38,
        userSelect: 'none',
        borderLeft: '2px solid transparent',
      }}
    >
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <div
          style={{
            fontSize: 12.5,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >{name}</div>
        {sub && (
          <div
            style={{
              fontSize: 10.5,
              color: 'var(--text-tertiary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >{sub}</div>
        )}
      </div>
      <button
        type="button"
        data-testid={`trash-restore-${kind}-${id}`}
        title={trash.restoreTooltip || 'Восстановить'}
        onClick={(e) => { e.stopPropagation(); onRestore?.(); }}
        style={BTN_STYLE}
      >↺</button>
      <button
        type="button"
        data-testid={`trash-purge-${kind}-${id}`}
        title={trash.purgeTooltip || 'Удалить навсегда'}
        onClick={(e) => { e.stopPropagation(); onPurge?.(); }}
        style={PURGE_BTN_STYLE}
      >✕</button>
    </div>
  );
}

export default function TrashZone({ expanded = false, onToggle }) {
  const ws = STRINGS.libraryWorkspace || {};
  const trash = ws.trash || {};
  const entriesById = useStore((s) => s.libraryEntries);
  const projectsById = useStore((s) => s.projects);
  const showToast = useStore((s) => s.showToast);
  const unmarkEntry = useStore((s) => s.unmarkLibraryEntryPendingDelete);
  const commitEntry = useStore((s) => s.commitLibraryEntryPendingDelete);
  const unmarkProject = useStore((s) => s.unmarkPendingDelete);
  const commitProject = useStore((s) => s.commitPendingDelete);

  const trashedEntries = useMemo(
    () => Object.values(entriesById || {})
      .filter((e) => e && e._pendingDelete === true)
      .sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || '')),
    [entriesById],
  );
  const trashedProjects = useMemo(
    () => Object.values(projectsById || {})
      .filter((p) => p && p._pendingDelete === true)
      .sort((a, b) => (a.name || a.id || '').localeCompare(b.name || b.id || '')),
    [projectsById],
  );

  const total = trashedEntries.length + trashedProjects.length;

  const onEmptyAll = useCallback(async () => {
    if (total === 0) return;
    const msgFn = trash.confirmEmptyAll || ((n) => `Удалить ${n} элемент(а/ов) навсегда? Действие нельзя отменить.`);
    const ok = typeof window !== 'undefined' && typeof window.confirm === 'function'
      ? window.confirm(msgFn(total))
      : true;
    if (!ok) return;
    // Snapshot before mutating — commit triggers state reactions that
    // would otherwise cause the source arrays to mutate mid-iteration.
    const entryIds = trashedEntries.map((e) => e.id);
    const projectIds = trashedProjects.map((p) => p.id);
    for (const id of entryIds) await commitEntry?.(id);
    for (const id of projectIds) await commitProject?.(id);
    showToast?.(trash.emptiedToast || 'Корзина очищена', 'success');
  }, [total, trashedEntries, trashedProjects, commitEntry, commitProject, showToast, trash]);

  const headerAction = total > 0 ? (
    <button
      type="button"
      data-testid="trash-empty-all-btn"
      title={trash.emptyAllTooltip || 'Очистить корзину'}
      onClick={onEmptyAll}
      style={BTN_STYLE}
    >{trash.emptyAllLabel || 'Очистить'}</button>
  ) : null;

  return (
    <LibraryZone
      variant="readonly"
      icon="🗑"
      title={trash.title || 'КОРЗИНА'}
      sub={trash.sub || 'удалено, можно восстановить'}
      count={total}
      expanded={expanded}
      onToggle={onToggle}
      headerAction={headerAction}
      testId="library-zone-trash"
    >
      {total === 0 && (
        <div
          data-testid="trash-empty-hint"
          style={{
            padding: '6px 12px 8px 38px',
            fontSize: 11.5,
            color: 'var(--text-tertiary)',
            fontStyle: 'italic',
          }}
        >{trash.emptyHint || 'Корзина пуста.'}</div>
      )}

      {trashedEntries.length > 0 && (
        <>
          <TreeFolderRow
            name={trash.entriesFolder || 'Контейнеры'}
            icon="📋"
            count={trashedEntries.length}
            expanded
            indent={1}
            onToggle={() => {}}
            testId="tree-folder-trash-entries"
          />
          {trashedEntries.map((e) => (
            <TrashRow
              key={e.id}
              kind="entry"
              id={e.id}
              name={e.name || e.id}
              sub={e.payload?.length
                ? `${(e.payload.length || 0).toLocaleString('ru-RU')} bp`
                : null}
              indent={2}
              onRestore={() => unmarkEntry?.(e.id)}
              onPurge={() => commitEntry?.(e.id)}
            />
          ))}
        </>
      )}

      {trashedProjects.length > 0 && (
        <>
          <TreeFolderRow
            name={trash.projectsFolder || 'Проекты'}
            icon="📦"
            count={trashedProjects.length}
            expanded
            indent={1}
            onToggle={() => {}}
            testId="tree-folder-trash-projects"
          />
          {trashedProjects.map((p) => (
            <TrashRow
              key={p.id}
              kind="project"
              id={p.id}
              name={(p.name || p.id || '—').replace(/\.bodge$/i, '')}
              sub={trash.projectSubLabel || '.bodge проект'}
              indent={2}
              onRestore={() => unmarkProject?.(p.id)}
              onPurge={() => commitProject?.(p.id)}
            />
          ))}
        </>
      )}
    </LibraryZone>
  );
}
