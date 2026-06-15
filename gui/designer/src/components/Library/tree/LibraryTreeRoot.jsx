/**
 * LibraryTreeRoot — Sprint M-X.8 K4 (DEC-UIRREV-TREE-*).
 *
 * Top-level container for the Library workspace tree. After the
 * Project-Hub refactor:
 *
 *   • LooseZone «⎀ БЕЗ ПРОЕКТА» — always at the top.
 *   • Pinned projects — top-level, each as a ProjectZone with a
 *     ★ marker. Order follows `state.pinnedProjectIds`.
 *   • Current project — top-level if NOT also pinned (avoids
 *     duplication). Always expanded by default.
 *   • Everything else — folded under one collapsible group
 *     `▸ Все проекты (N)` per DEC-UIRREV-TREE-OTHERS-COLLAPSIBLE-GROUP.
 *
 * Expand semantics (post 11.05.2026 visual feedback — supersedes
 * DEC-UIRREV-TREE-CLICK-ACTIVATE):
 *   • Default: only the current project is expanded.
 *   • Click on ANY project header → toggles local expand override.
 *     No activation side-effect — biolog often peeks into a
 *     non-current project to drag a plasmid out, not to switch
 *     context. Activation lives in sidebar PINNED rows +
 *     Command Palette (⌘P).
 *   • Per-project expand override is a Map<projectId, boolean>
 *     that shadows the default. `currentProjectId` change clears
 *     overrides for any non-current project, so other projects
 *     fold back when the user switches via sidebar/palette.
 */
import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { useStore } from '../../../store';
import { STRINGS } from '../../../lib/strings';
import LooseZone from './LooseZone';
import ProjectZone from './ProjectZone';
import TrashZone from './TrashZone';
import { APP_VERSION } from '../../../lib/version';

function discoverProjects(projectsById) {
  // Exclude soft-deleted projects — they live in the Trash zone and
  // must not appear in the regular project listings.
  const list = Object.values(projectsById || {})
    .filter((p) => p && !p._pendingDelete)
    .map((p) => ({
      id: p.id,
      name: p.name || p.id,
    }));
  list.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
  return list;
}

export default function LibraryTreeRoot({
  query = '',
  onQueryChange,
  // Bumped by «Все проекты» / ⌘P (focusSearch context) → focus the search input.
  autoFocusSearchTick = 0,
  // Create a new project from the left panel (projects live in the Library).
  onCreateProject,
  selectedId = null,
  onSelectEntry,
  onAddClick,
  onAddToLoose,
  onAddStarterSet,
  onExportProject,
  // SPEC_COMMON_FEATURES DEC-CF-06 — «Common-фичи» section node (not an
  // entries zone). Selecting it swaps the right panel to CommonFeaturesPanel.
  onSelectCommonSection,
  commonSectionActive = false,
}) {
  const ws = STRINGS.libraryWorkspace || {};
  const ph = STRINGS.projectHub || {};
  const currentProjectId = useStore((s) => s.currentProjectId);
  const entriesById = useStore((s) => s.libraryEntries);
  const projectsById = useStore((s) => s.projects);
  const pinnedProjectIds = useStore((s) => s.pinnedProjectIds);
  const allProjects = useMemo(() => discoverProjects(projectsById), [projectsById]);
  const totalEntries = useMemo(
    () => Object.values(entriesById || {}).filter((e) => e && !e._pendingDelete).length,
    [entriesById],
  );

  // Per-project expand override. Default visibility follows
  // `currentProjectId` (only current is expanded). User-flipped
  // state for the current project lives here; non-current projects
  // are collapsed unless they get activated (which then puts them
  // in the «current» bucket and they expand by default).
  const [expandedOverride, setExpandedOverride] = useState({});

  // Focus the search input when «Все проекты» / ⌘P routes here (tick bumps).
  const searchInputRef = useRef(null);
  useEffect(() => {
    if (autoFocusSearchTick > 0) {
      searchInputRef.current?.focus();
      searchInputRef.current?.select?.();
    }
  }, [autoFocusSearchTick]);
  // Reset overrides for non-current projects whenever current
  // changes — siblings collapse cleanly.
  useEffect(() => {
    setExpandedOverride((prev) => {
      const keep = {};
      if (currentProjectId && prev[currentProjectId] !== undefined) {
        keep[currentProjectId] = prev[currentProjectId];
      }
      return keep;
    });
  }, [currentProjectId]);

  const isExpanded = useCallback((id) => {
    if (Object.prototype.hasOwnProperty.call(expandedOverride, id)) {
      return expandedOverride[id];
    }
    return id === currentProjectId;
  }, [expandedOverride, currentProjectId]);

  // Igor 15.06.2026 «нормальная логика»: click a project → it becomes ACTIVE
  // (the active one is just highlighted in place — no more pulling it to a
  // special top slot, which made projects seem to jump / disappear). Clicking
  // the already-active project toggles its expand so you can collapse it.
  const activateProjectAction = useStore((s) => s.activateProject);
  const onProjectHeaderClick = useCallback((id) => {
    if (id !== currentProjectId) {
      activateProjectAction?.(id); // becomes current → auto-expands via isExpanded
    } else {
      setExpandedOverride((prev) => ({ ...prev, [id]: !isExpanded(id) }));
    }
  }, [currentProjectId, activateProjectAction, isExpanded]);

  // Loose zone collapse — local state, separate from project tree.
  const [looseExpanded, setLooseExpanded] = useState(true);
  const onLooseToggle = useCallback(() => setLooseExpanded((v) => !v), []);

  // FAIL-fix-pass 2 — current project is ALWAYS the first zone
  // after LooseZone, regardless of its pinned-status. The pinned
  // list (excluding current if it was pinned) follows. Everything
  // else (un-pinned non-current) lands inside the collapsible
  // «Все проекты (N)» group.
  const pinSet = useMemo(() => new Set(pinnedProjectIds || []), [pinnedProjectIds]);

  // Project-name search (so «Все проекты»/⌘P → focus search can quick-find a
  // project, not just entries). When a query is set, a project is visible if
  // its NAME matches OR it contains a matching entry (preserves entry-search).
  // null = no query → show all projects.
  const queryNorm = (query || '').trim().toLowerCase();
  const visibleProjectIds = useMemo(() => {
    if (!queryNorm) return null;
    const entries = Object.values(entriesById || {}).filter((e) => e && !e._pendingDelete);
    const withMatchingEntry = new Set();
    for (const e of entries) {
      if (!(e.name || '').toLowerCase().includes(queryNorm)) continue;
      if (e.projectId) withMatchingEntry.add(e.projectId);
    }
    const out = new Set();
    for (const p of allProjects) {
      if ((p.name || '').toLowerCase().includes(queryNorm) || withMatchingEntry.has(p.id)) { out.add(p.id); continue; }
      // containerIds membership (entry linked to project without projectId field)
      const cids = p.containerIds || [];
      for (const cid of cids) {
        const e = entriesById?.[cid];
        if (e && !e._pendingDelete && (e.name || '').toLowerCase().includes(queryNorm)) { out.add(p.id); break; }
      }
    }
    return out;
  }, [queryNorm, entriesById, allProjects]);

  // One stable, flat project list (Igor «нормальная логика», 15.06.2026):
  // pinned first, then the rest by creation time so a NEW project lands at the
  // bottom. The active project is highlighted IN PLACE — no separate top slot,
  // no collapsed «Все проекты» group hiding the rest (that pull-to-top + hide
  // is what made projects seem to jump / disappear / reappear after reload).
  // Soft-deleted live in Trash; a query filters by project name or a matching
  // entry (visibleProjectIds).
  const projectList = useMemo(() => {
    const all = allProjects
      .map((p) => projectsById?.[p.id])
      .filter((p) => p && !p._pendingDelete && (!visibleProjectIds || visibleProjectIds.has(p.id)));
    const pinRank = new Map((pinnedProjectIds || []).map((id, i) => [id, i]));
    return all.slice().sort((a, b) => {
      const ap = pinRank.has(a.id); const bp = pinRank.has(b.id);
      if (ap && bp) return pinRank.get(a.id) - pinRank.get(b.id);
      if (ap !== bp) return ap ? -1 : 1;
      return (a.createdAt || '').localeCompare(b.createdAt || ''); // new at bottom
    });
  }, [allProjects, projectsById, visibleProjectIds, pinnedProjectIds]);

  const onInput = useCallback((e) => {
    onQueryChange?.(e.target.value || '');
  }, [onQueryChange]);

  // Trash zone toggle — collapsed by default, expands on user click.
  const [trashExpanded, setTrashExpanded] = useState(false);
  const toggleTrash = useCallback(() => setTrashExpanded((v) => !v), []);

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
          {typeof onCreateProject === 'function' && (
            <button
              type="button"
              data-testid="tree-add-project-btn"
              title="Создать новый проект"
              onClick={() => onCreateProject()}
              style={{
                fontSize: 12, fontWeight: 500,
                padding: '5px 10px',
                background: 'transparent',
                color: 'var(--accent-700, #c2410c)',
                border: '1px solid var(--accent-500)',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >{ph.treeCreateProject || '+ Проект'}</button>
          )}
          <div style={{ flex: 1 }} />
          <button
            type="button"
            title="Сортировка — в разработке"
            data-testid="tree-sort"
            aria-disabled="true"
            style={{
              fontSize: 12, padding: '4px 6px',
              background: 'transparent',
              color: 'var(--text-tertiary)',
              border: '1px solid transparent',
              cursor: 'default',
              opacity: 0.5,
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
            ref={searchInputRef}
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
        {/* Igor «нормальная логика» (15.06.2026): ⎀ free desk on top, then ONE
            flat project list below — pinned first, newest at the bottom. The
            active project is highlighted IN PLACE (no top-slot pull-out, no
            collapsed «Все проекты» group). Clicking a project activates it. */}
        <LooseZone
          query={query}
          selectedId={selectedId}
          onSelectEntry={onSelectEntry}
          expanded={looseExpanded}
          onToggle={onLooseToggle}
          onAddToLoose={onAddToLoose}
          onAddStarterSet={onAddStarterSet}
        />
        {projectList.map((p) => (
          <ProjectZone
            key={p.id}
            project={p}
            pinned={pinSet.has(p.id)}
            query={query}
            selectedId={selectedId}
            onSelectEntry={onSelectEntry}
            expanded={isExpanded(p.id)}
            onToggle={() => onProjectHeaderClick(p.id)}
            onExportProject={onExportProject}
          />
        ))}
        {/* SPEC_COMMON_FEATURES DEC-CF-06 — section node (not a zone). Click
            swaps the right panel to the common-features browser/editor. */}
        <button
          type="button"
          data-testid="tree-common-features"
          aria-pressed={commonSectionActive}
          onClick={() => onSelectCommonSection?.()}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '8px 12px', border: 'none', cursor: 'pointer', textAlign: 'left',
            fontSize: 12.5,
            background: commonSectionActive ? 'var(--accent-wash, rgba(184,92,62,0.12))' : 'transparent',
            color: commonSectionActive ? 'var(--accent-700, #8a3a22)' : 'var(--text-primary)',
            fontWeight: commonSectionActive ? 600 : 400,
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          <span aria-hidden>🧬</span>
          <span>{STRINGS.commonFeatures.treeNodeLabel}</span>
        </button>
        <TrashZone expanded={trashExpanded} onToggle={toggleTrash} />
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
