/**
 * LooseZone — Library workspace tree zone «⚐ Коллекция»
 * (the biolog's free workspace).
 *
 * Driven by `entry.projectId === null` per the 09.05.2026
 * minimum-pass refresh. Two structural sub-folders (Контейнеры,
 * Праймеры) are always visible. User-created folders sit inside
 * Контейнеры — created via the «📁+» header button, persisted in
 * `state.looseFolders`, recursive via slash-paths.
 *
 * Folder membership = `entry.folderPath` (canonical, single-value).
 * `entry.tags` is intentionally NOT used for folder placement —
 * tags are free-form descriptive labels (bacterial, AmpR, …) and
 * earlier auto-derivation from tags spawned phantom folders for
 * every starter-set tag.
 */
import { useMemo, useState, useCallback } from 'react';
import { STRINGS } from '../../../lib/strings';
import { useStore } from '../../../store';
import { buildFolderTree } from './library-folder-tree';
import LibraryZone from './LibraryZone';
import TreeFolderRow from './TreeFolderRow';
import TreeItemRow from './TreeItemRow';
import VersionLineageNode from './VersionLineageNode';
import { groupVisibleLineages } from '../lib/version-lineage';
import { Icon } from '../../icons/Icon';

const SHOW_ALL = () => true;
const NO_MATCH_INFO = () => null;

function buildClaimedSet(projectsById, entriesById) {
  const claimed = new Set();
  for (const proj of Object.values(projectsById || {})) {
    if (!proj) continue;
    if (Array.isArray(proj.containerIds)) {
      for (const cid of proj.containerIds) claimed.add(cid);
    }
  }
  for (const e of Object.values(entriesById || {})) {
    if (!e || e._pendingDelete) continue;
    if (e.projectId && projectsById?.[e.projectId]) claimed.add(e.id);
  }
  return claimed;
}

function isLooseEntry(entry, claimed) {
  if (!entry || entry._pendingDelete) return false;
  return !claimed.has(entry.id);
}

function normalizeFolderPath(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return '';
  // Trim each segment so `'Demo / Bacterial'` collapses to `'Demo/Bacterial'`
  // — librarySlice writes the human-spaced form for SnapGene `Demo / X`
  // imports, but the tree keys on the canonical no-space slash form so
  // sibling lookups and parent-prefix expansion line up.
  return raw.split('/').map((s) => s.trim()).filter(Boolean).join('/');
}

function entryFolderPath(entry) {
  return normalizeFolderPath(entry?.folderPath);
}

const BTN_STYLE = {
  fontSize: 11, padding: '1px 5px',
  background: 'transparent',
  border: '1px solid var(--border-subtle)',
  borderRadius: 3, cursor: 'pointer',
  color: 'var(--text-secondary)',
  lineHeight: 1.3,
};

export default function LooseZone({
  // REV#2 Stage 3 K5 — visibility and explanations come only from LibraryTreeRoot's one session.
  // Standalone rendering is an unfiltered zone; it never spins up a second search engine.
  matchEntry = SHOW_ALL,
  getMatchInfo = NO_MATCH_INFO,
  selectedId = null,
  onSelectEntry,
  expanded = true,
  onToggle,
  onAddToLoose,
  onAddStarterSet,
}) {
  const ws = STRINGS.libraryWorkspace || {};
  const entriesById = useStore((s) => s.libraryEntries);
  const projectsById = useStore((s) => s.projects);
  const looseFolders = useStore((s) => s.looseFolders);
  const createLooseFolder = useStore((s) => s.createLooseFolder);

  const claimed = useMemo(
    () => buildClaimedSet(projectsById, entriesById),
    [projectsById, entriesById],
  );
  const looseEntries = useMemo(
    () => Object.values(entriesById || {}).filter((e) => isLooseEntry(e, claimed)),
    [entriesById, claimed],
  );
  const filtered = useMemo(
    () => looseEntries.filter(matchEntry),
    [looseEntries, matchEntry],
  );

  const containerEntries = useMemo(
    () => filtered.filter((e) => e.kind === 'container' || !e.kind),
    [filtered],
  );
  const primerEntries = useMemo(
    () => filtered.filter((e) => e.kind === 'primer'),
    [filtered],
  );

  // Folders come from two sources:
  //   1. `state.looseFolders` — explicit user creations (📁+ button)
  //   2. live `entry.folderPath` values — auto-materialised so entries
  //      imported with a folder hint (SnapGene catalog `Demo / X`,
  //      .bodge restore, etc.) actually surface in the tree instead
  //      of vanishing because no matching folder exists. Tags are
  //      NOT used here (they're descriptive labels — see header doc).
  // Parent prefixes pre-emitted so `A/B` implicitly materialises `A`.
  const folderPaths = useMemo(() => {
    const set = new Set();
    const addPath = (p) => {
      const norm = normalizeFolderPath(p);
      if (!norm) return;
      const parts = norm.split('/');
      for (let i = 1; i <= parts.length; i++) {
        set.add(parts.slice(0, i).join('/'));
      }
    };
    for (const p of (looseFolders || [])) addPath(p);
    for (const e of containerEntries) addPath(entryFolderPath(e));
    return Array.from(set);
  }, [looseFolders, containerEntries]);
  const folderForest = useMemo(() => buildFolderTree(folderPaths), [folderPaths]);

  // Entry → folder mapping is the canonical `entry.folderPath`.
  const entriesByPath = useMemo(() => {
    const map = new Map();
    for (const e of containerEntries) {
      const path = entryFolderPath(e);
      if (!path) continue;
      if (!map.has(path)) map.set(path, []);
      map.get(path).push(e);
    }
    return map;
  }, [containerEntries]);

  const rootlessContainers = useMemo(
    () => containerEntries.filter((e) => !entryFolderPath(e)),
    [containerEntries],
  );

  const [openFolders, setOpenFolders] = useState(() => new Set(['containers']));
  const toggleFolder = useCallback((key) => {
    setOpenFolders((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // Per-lineage expand state — collapse chained versions/branches of one
  // molecule under a single node instead of N flat rows.
  const [expandedLineages, setExpandedLineages] = useState(() => new Set());
  const toggleLineage = useCallback((id) => {
    setExpandedLineages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Render a flat container list with version lineages collapsed: a >1-member
  // lineage → one VersionLineageNode; a singleton → a plain TreeItemRow.
  const renderContainers = useCallback((entries, indent) => (
    groupVisibleLineages(entriesById, entries).map((g) => (
      g.count > 1 ? (
        <VersionLineageNode
          key={g.rootId}
          group={g}
          selectedId={selectedId}
          onSelectEntry={onSelectEntry}
          expanded={expandedLineages.has(g.rootId)}
          onToggle={() => toggleLineage(g.rootId)}
          indent={indent}
          getMatchInfo={getMatchInfo}
          testId={`version-lineage-${g.rootId}`}
        />
      ) : (
        <TreeItemRow
          key={g.headEntry.id}
          entry={g.headEntry}
          isSelected={g.headEntry.id === selectedId}
          onSelect={onSelectEntry}
          indent={indent}
          matchInfo={getMatchInfo(g.headEntry)}
          testId={`tree-item-loose-${g.headEntry.id}`}
          draggable
        />
      )
    ))
  ), [entriesById, selectedId, onSelectEntry, expandedLineages, toggleLineage, getMatchInfo]);

  // Inline folder creation — `window.prompt` is a no-op in the packaged
  // Electron app (returns null), so the «📁+» button used to do nothing.
  // Replaced with an inline input row that works in browser AND Electron.
  const [creatingFolder, setCreatingFolder] = useState(false);
  const handleCreateFolder = useCallback(() => {
    setOpenFolders((prev) => {
      const next = new Set(prev);
      next.add('containers');
      return next;
    });
    setCreatingFolder(true);
  }, []);
  const commitNewFolder = useCallback((raw) => {
    const safe = String(raw || '').trim().replace(/[/:]/g, '-').trim();
    setCreatingFolder(false);
    if (!safe || !createLooseFolder) return;
    createLooseFolder(safe);
    setOpenFolders((prev) => {
      const next = new Set(prev);
      next.add('containers');
      next.add(`folder:${safe}`);
      return next;
    });
  }, [createLooseFolder]);

  const headerAction = (onAddToLoose || createLooseFolder) ? (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {createLooseFolder && (
        <button
          type="button"
          data-testid="loose-zone-add-folder-btn"
          title="Создать папку"
          onClick={handleCreateFolder}
          style={{ ...BTN_STYLE, display: 'inline-flex', alignItems: 'center', gap: 1 }}
        ><Icon name="folder" size={12} /><Icon name="plus" size={9} /></button>
      )}
      {onAddToLoose && (
        <button
          type="button"
          data-testid="loose-zone-add-btn"
          title="Добавить в коллекцию"
          onClick={onAddToLoose}
          style={{ ...BTN_STYLE, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        ><Icon name="plus" size={13} /></button>
      )}
    </span>
  ) : null;

  const renderFolderNode = (node, depth) => {
    const items = entriesByPath.get(node.path) || [];
    const folderKey = `folder:${node.path}`;
    const isOpen = openFolders.has(folderKey);
    const childCount = node.children?.length || 0;
    const totalCount = items.length + childCount;
    return (
      <div key={node.path}>
        <TreeFolderRow
          name={node.name}
          icon={<Icon name="folder" size={13} />}
          count={totalCount}
          expanded={isOpen}
          indent={depth}
          onToggle={() => toggleFolder(folderKey)}
          testId={`tree-folder-loose-user-${node.path}`}
        />
        {isOpen && (
          <>
            {(node.children || []).map((child) => renderFolderNode(child, depth + 1))}
            {renderContainers(items, depth + 1)}
          </>
        )}
      </div>
    );
  };

  return (
    <LibraryZone
      variant="loose"
      icon={<Icon name="folder" size={13} />}
      title={ws.zoneLooseTitleNoProject || 'БЕЗ ПРОЕКТА'}
      sub={ws.zoneLooseSubFreeDesk || 'свободный стол биолога'}
      count={filtered.length}
      expanded={expanded}
      onToggle={onToggle}
      headerAction={headerAction}
      testId="library-zone-loose"
    >
      <TreeFolderRow
        name="Контейнеры"
        icon={<Icon name="list" size={13} />}
        count={containerEntries.length}
        expanded={openFolders.has('containers')}
        indent={1}
        onToggle={() => toggleFolder('containers')}
        testId="tree-folder-loose-containers"
      />
      {openFolders.has('containers') && (
        <>
          {creatingFolder && (
            <div style={{ padding: '4px 12px 4px 38px' }}>
              <input
                type="text"
                autoFocus
                data-testid="loose-zone-new-folder-input"
                placeholder="Имя папки + Enter…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitNewFolder(e.currentTarget.value); }
                  else if (e.key === 'Escape') { e.preventDefault(); setCreatingFolder(false); }
                }}
                onBlur={() => setCreatingFolder(false)}
                style={{
                  width: '100%', boxSizing: 'border-box', fontSize: 12,
                  padding: '3px 6px', borderRadius: 3,
                  border: '1px solid var(--accent-500)',
                  background: 'var(--surface-1)', color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
            </div>
          )}
          {folderForest.map((node) => renderFolderNode(node, 2))}
          {renderContainers(rootlessContainers, 2)}
          {containerEntries.length === 0 && folderForest.length === 0 && onAddStarterSet && (
            <div style={{ padding: '6px 12px 6px 38px' }}>
              <button
                type="button"
                data-testid="loose-zone-starter-btn"
                onClick={onAddStarterSet}
                style={{
                  fontSize: 11, padding: '4px 8px',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 3, cursor: 'pointer',
                  color: 'var(--text-secondary)',
                }}
              >+ Базовый набор</button>
            </div>
          )}
        </>
      )}

      <TreeFolderRow
        name="Праймеры"
        icon={<Icon name="primer" size={13} />}
        count={primerEntries.length}
        expanded={openFolders.has('primers')}
        indent={1}
        onToggle={() => toggleFolder('primers')}
        testId="tree-folder-loose-primers"
      />
      {openFolders.has('primers') && primerEntries.map((entry) => (
        <TreeItemRow
          key={entry.id}
          entry={entry}
          isSelected={entry.id === selectedId}
          onSelect={onSelectEntry}
          indent={2}
          matchInfo={getMatchInfo(entry)}
          testId={`tree-item-loose-${entry.id}`}
          draggable
        />
      ))}
    </LibraryZone>
  );
}
