/**
 * LibraryTreeRoot — Sprint M-X.7a v2 K2.
 *
 * Top-level container for the Library workspace tree per
 * Library.html `<aside class="lib-tree">`. Mounts:
 *   • `.tree-head` — `+ Добавить` button + collapse-all + sort
 *     icon + filter input (DEC-MX7A-V2-11 mirrors topbar search).
 *   • `.tree-body` — three zones (LooseZone + ProjectZone(s) +
 *     LabPoolZone). Active project pinned first (under Loose) per
 *     mockup; read-only projects after, Lab pool last.
 *   • `.tree-foot` — version + entry count.
 *
 * Selection state owned by caller (passed via props). The tree
 * itself does not write to libSelection — `onSelectEntry` is the
 * callback consumed by LibraryWorkspace (K4).
 */
import { useMemo, useCallback } from 'react';
import { useStore } from '../../../store';
import { STRINGS } from '../../../lib/strings';
import LooseZone from './LooseZone';
import ProjectZone from './ProjectZone';
import { APP_VERSION } from '../../../lib/version';

function discoverProjects(entriesById, projectsById, currentProjectId) {
  // Project zones come from two sources unioned:
  //   • the live projectSlice map (`state.projects`) so empty
  //     projects still render
  //   • distinct `entry.projectId` referenced from libraryEntries
  //     (covers entries whose project metadata isn't in projectSlice
  //     yet — happens during transition from the old Importer flow)
  // Active project pinned first; rest sorted by name then id.
  const ids = new Set();
  for (const id of Object.keys(projectsById || {})) ids.add(id);
  for (const e of Object.values(entriesById || {})) {
    if (!e || e._pendingDelete) continue;
    if (e.projectId) ids.add(e.projectId);
  }
  const list = Array.from(ids).map((id) => ({
    id,
    name: projectsById?.[id]?.name || id,
  }));
  list.sort((a, b) => {
    if (a.id === currentProjectId) return -1;
    if (b.id === currentProjectId) return 1;
    return (a.name || a.id).localeCompare(b.name || b.id);
  });
  return list;
}

export default function LibraryTreeRoot({
  query = '',
  onQueryChange,
  selectedId = null,
  onSelectEntry,
  onAddClick,
}) {
  const ws = STRINGS.libraryWorkspace || {};
  const currentProjectId = useStore((s) => s.currentProjectId);
  const entriesById = useStore((s) => s.libraryEntries);
  const projectsById = useStore((s) => s.projects);
  const projects = useMemo(
    () => discoverProjects(entriesById, projectsById, currentProjectId),
    [entriesById, projectsById, currentProjectId],
  );
  const totalEntries = useMemo(
    () => Object.values(entriesById || {}).filter((e) => e && !e._pendingDelete).length,
    [entriesById],
  );

  const onInput = useCallback((e) => {
    onQueryChange?.(e.target.value || '');
  }, [onQueryChange]);

  return (
    <aside
      data-testid="library-tree-root"
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        height: '100%',
        background: 'var(--surface-1)',
        borderRight: '1px solid var(--border-subtle)',
      }}
    >
      <div
        data-testid="tree-head"
        style={{
          padding: '10px 12px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            data-testid="tree-add-btn"
            onClick={() => onAddClick?.()}
            style={{
              fontSize: 12, fontWeight: 500,
              padding: '5px 10px',
              background: 'var(--accent-500)',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >{ws.addBtn || '+ Добавить'}</button>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            title="Свернуть всё"
            data-testid="tree-collapse-all"
            style={{
              fontSize: 12, padding: '4px 6px',
              background: 'transparent',
              color: 'var(--text-secondary)',
              border: '1px solid transparent',
              cursor: 'pointer',
            }}
            disabled
          >⊟</button>
          <button
            type="button"
            title="Сортировка"
            data-testid="tree-sort"
            style={{
              fontSize: 12, padding: '4px 6px',
              background: 'transparent',
              color: 'var(--text-secondary)',
              border: '1px solid transparent',
              cursor: 'pointer',
            }}
            disabled
          >⇅</button>
        </div>
        <div style={{ position: 'relative' }}>
          <span style={{
            position: 'absolute', left: 8, top: 7,
            color: 'var(--text-tertiary)', fontSize: 12,
          }}>⌕</span>
          <input
            type="text"
            data-testid="tree-search"
            placeholder={ws.treeFilterPlaceholder || 'Фильтр в дереве…'}
            value={query}
            onChange={onInput}
            style={{
              width: '100%', height: 28, padding: '0 8px 0 26px',
              fontSize: 12, lineHeight: '28px',
              background: 'var(--surface-2)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 4,
              outline: 'none',
            }}
          />
        </div>
      </div>

      <div
        data-testid="tree-body"
        style={{
          flex: 1,
          overflowY: 'auto',
          minHeight: 0,
        }}
      >
        <LooseZone
          query={query}
          selectedId={selectedId}
          onSelectEntry={onSelectEntry}
        />
        {projects.map((p) => (
          <ProjectZone
            key={p.id}
            project={p}
            query={query}
            selectedId={selectedId}
            onSelectEntry={onSelectEntry}
          />
        ))}
      </div>

      <div
        data-testid="tree-foot"
        style={{
          padding: '8px 12px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 11,
          color: 'var(--text-tertiary)',
          flexShrink: 0,
        }}
      >
        <span>BodgeGene v{APP_VERSION}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>
          {totalEntries} entries
        </span>
      </div>
    </aside>
  );
}
