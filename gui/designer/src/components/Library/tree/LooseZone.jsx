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
import { Icon } from '../../icons/Icon';

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

function matchesQuery(entry, q) {
  if (!q) return true;
  return (entry?.name || '').toLowerCase().includes(q.toLowerCase());
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
  query = '',
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
    () => looseEntries.filter((e) => matchesQuery(e, query)),
    [looseEntries, query],
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

  const handleCreateFolder = useCallback(() => {
    if (typeof window === 'undefined' || !createLooseFolder) return;
    const raw = window.prompt('Имя новой папки:');
    if (!raw) return;
    const safe = raw.trim().replace(/\//g, '-').replace(/:/g, '-');
    if (!safe) return;
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
            {items.map((entry) => (
              <TreeItemRow
                key={entry.id}
                entry={entry}
                isSelected={entry.id === selectedId}
                onSelect={onSelectEntry}
                indent={depth + 1}
                testId={`tree-item-loose-${entry.id}`}
                draggable
              />
            ))}
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
          {folderForest.map((node) => renderFolderNode(node, 2))}
          {rootlessContainers.map((entry) => (
            <TreeItemRow
              key={entry.id}
              entry={entry}
              isSelected={entry.id === selectedId}
              onSelect={onSelectEntry}
              indent={2}
              testId={`tree-item-loose-${entry.id}`}
              draggable
            />
          ))}
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
          testId={`tree-item-loose-${entry.id}`}
          draggable
        />
      ))}
    </LibraryZone>
  );
}
