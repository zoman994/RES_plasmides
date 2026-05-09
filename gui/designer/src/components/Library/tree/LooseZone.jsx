/**
 * LooseZone — Sprint M-X.7a v2 K2.
 *
 * `⚐ Без проекта · свободная зона` zone per Library.html ZONE 1.
 * Renders folder forest derived from loose-entry slash-path tags +
 * explicit `looseFolders` (createLooseFolder records empty folder
 * placeholders). Items at root or inside folders all render
 * through TreeItemRow.
 *
 * Folder expansion is local component state — folder tree shape
 * comes from `selectLooseTreeStructure(state)` (memoised forest).
 */
import { useMemo, useState, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { STRINGS } from '../../../lib/strings';
import { useStore } from '../../../store';
import { selectEntriesByZone, selectLooseTreeStructure } from '../../../store/librarySlice';
import LibraryZone from './LibraryZone';
import TreeFolderRow from './TreeFolderRow';
import TreeItemRow from './TreeItemRow';

function entriesUnderPath(entries, path) {
  return entries.filter((e) => Array.isArray(e.tags) && e.tags.includes(path));
}

function rootEntries(entries) {
  return entries.filter((e) => {
    if (!Array.isArray(e.tags)) return true;
    return !e.tags.some((t) => typeof t === 'string' && !t.includes(':'));
  });
}

function matchesQuery(entry, q) {
  if (!q) return true;
  const name = (entry?.name || '').toLowerCase();
  return name.includes(q.toLowerCase());
}

export default function LooseZone({
  query = '',
  selectedId = null,
  onSelectEntry,
  expanded = true,
  onToggle,
}) {
  // Subscribe to primitive refs only — selectLooseTreeStructure
  // builds fresh `{name, path, children}` nodes every call which
  // breaks shallow-equality and causes useStore to infinite-loop.
  const entriesById = useStore((s) => s.libraryEntries);
  const looseFolders = useStore((s) => s.looseFolders);
  const tree = useMemo(
    () => selectLooseTreeStructure({ libraryEntries: entriesById, looseFolders }),
    [entriesById, looseFolders],
  );
  const entries = useStore(useShallow((s) => selectEntriesByZone(s, 'loose')));
  const filtered = useMemo(
    () => entries.filter((e) => matchesQuery(e, query)),
    [entries, query],
  );
  const [openFolders, setOpenFolders] = useState(() => new Set());
  const toggleFolder = useCallback((path) => {
    setOpenFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }, []);

  const total = filtered.length;
  const looseStrings = STRINGS.libraryWorkspace || {};

  const renderFolderNode = (node, depth) => {
    const folderItems = entriesUnderPath(filtered, node.path);
    const isOpen = openFolders.has(node.path);
    const folderCount = folderItems.length
      + (Array.isArray(node.children) ? node.children.length : 0);
    return (
      <div key={node.path}>
        <TreeFolderRow
          name={node.name}
          icon="📁"
          count={folderCount}
          expanded={isOpen}
          indent={depth}
          onToggle={() => toggleFolder(node.path)}
          testId={`tree-folder-loose-${node.path}`}
        />
        {isOpen && (
          <>
            {(node.children || []).map((child) => renderFolderNode(child, depth + 1))}
            {folderItems.map((entry) => (
              <TreeItemRow
                key={entry.id}
                entry={entry}
                isSelected={entry.id === selectedId}
                onSelect={onSelectEntry}
                indent={depth + 1}
                testId={`tree-item-loose-${entry.id}`}
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
      icon="⚐"
      title={looseStrings.zoneLooseTitle || 'Без проекта'}
      sub={looseStrings.zoneLooseSub || 'свободная зона'}
      count={total}
      expanded={expanded}
      onToggle={onToggle}
      testId="library-zone-loose"
    >
      {tree.map((node) => renderFolderNode(node, 1))}
      {rootEntries(filtered).map((entry) => (
        <TreeItemRow
          key={entry.id}
          entry={entry}
          isSelected={entry.id === selectedId}
          onSelect={onSelectEntry}
          indent={1}
          testId={`tree-item-loose-${entry.id}`}
        />
      ))}
    </LibraryZone>
  );
}
