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
import TreeFolderRow from './TreeFolderRow';
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

  const onProjectHeaderClick = useCallback((id) => {
    // Tree-header click = expand-only. Activation is intentionally
    // decoupled (post 11.05.2026 visual feedback): biolog often
    // wants to peek into a non-current project to drag a plasmid
    // out, not to switch context. Activation lives in sidebar
    // PINNED rows + Command Palette (⌘P).
    setExpandedOverride((prev) => ({ ...prev, [id]: !isExpanded(id) }));
  }, [isExpanded]);

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

  const groups = useMemo(() => {
    // V115 — soft-deleted projects (_pendingDelete) live in the Trash zone,
    // never the tree. `discoverProjects` (→ `others`) already filters them;
    // the `current` and `pinnedRest` branches must do the same, else a
    // pinned/current project stays visible after the 🗑 button.
    const visible = (p) => !visibleProjectIds || visibleProjectIds.has(p.id);
    const currentRaw = currentProjectId ? (projectsById?.[currentProjectId] || null) : null;
    let current = currentRaw && currentRaw._pendingDelete ? null : currentRaw;
    if (current && !visible(current)) current = null; // hidden by an active query
    const pinnedRest = [];
    for (const id of (pinnedProjectIds || [])) {
      if (id === currentProjectId) continue; // current goes to its own slot
      const p = projectsById?.[id];
      if (p && !p._pendingDelete && visible(p)) pinnedRest.push(p);
    }
    const others = [];
    for (const p of allProjects) {
      if (p.id === currentProjectId) continue;
      if (pinSet.has(p.id)) continue;
      if (!visible(p)) continue;
      others.push(p);
    }
    return { current, pinnedRest, others };
  }, [allProjects, pinSet, currentProjectId, projectsById, pinnedProjectIds, visibleProjectIds]);

  const onInput = useCallback((e) => {
    onQueryChange?.(e.target.value || '');
  }, [onQueryChange]);

  // «Все проекты (N)» group toggle — local state, default collapsed.
  const [othersExpanded, setOthersExpanded] = useState(false);
  const toggleOthers = useCallback(() => setOthersExpanded((v) => !v), []);

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
        {/*
          * Order (post 11.05.2026 visual feedback):
          *   1. Current project (top — primary attention)
          *   2. ⎀ БЕЗ ПРОЕКТА «стол биолога»
          *   3. Pinned (excluding current)
          *   4. «Все проекты (N)» collapsible group
          * The free desk sits UNDER the current project so the
          * primary workspace is the first thing biolog scans —
          * loose entries are a secondary collection to pull from.
          */}
        {groups.current && (
          <ProjectZone
            key={groups.current.id}
            project={groups.current}
            pinned={pinSet.has(groups.current.id)}
            query={query}
            selectedId={selectedId}
            onSelectEntry={onSelectEntry}
            expanded={isExpanded(groups.current.id)}
            onToggle={() => onProjectHeaderClick(groups.current.id)}
            onExportProject={onExportProject}
          />
        )}
        <LooseZone
          query={query}
          selectedId={selectedId}
          onSelectEntry={onSelectEntry}
          expanded={looseExpanded}
          onToggle={onLooseToggle}
          onAddToLoose={onAddToLoose}
          onAddStarterSet={onAddStarterSet}
        />
        {groups.pinnedRest.map((p) => (
          <ProjectZone
            key={p.id}
            project={p}
            pinned
            query={query}
            selectedId={selectedId}
            onSelectEntry={onSelectEntry}
            expanded={isExpanded(p.id)}
            onToggle={() => onProjectHeaderClick(p.id)}
            onExportProject={onExportProject}
          />
        ))}
        {groups.others.length > 0 && (
          <>
            <TreeFolderRow
              name={(ph.treeAllProjectsCollapsed || ((n) => `Все проекты (${n})`))(groups.others.length)}
              icon="📚"
              count={null}
              expanded={othersExpanded || !!queryNorm}
              indent={0}
              onToggle={toggleOthers}
              testId="tree-all-projects-group"
            />
            {(othersExpanded || !!queryNorm) && groups.others.map((p) => (
              <ProjectZone
                key={p.id}
                project={p}
                query={query}
                selectedId={selectedId}
                onSelectEntry={onSelectEntry}
                expanded={isExpanded(p.id)}
                onToggle={() => onProjectHeaderClick(p.id)}
                onExportProject={onExportProject}
              />
            ))}
          </>
        )}
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
