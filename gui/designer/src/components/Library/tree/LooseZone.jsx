/**
 * LooseZone — Library workspace tree zone «⚐ БЕЗ ПРОЕКТА»
 * (the biolog's free workspace).
 *
 * Driven by `entry.projectId === null` per the 09.05.2026
 * minimum-pass refresh: zone derivation moved off the `entry.zone`
 * field (which stays in the data shape but is ignored at the
 * visual layer per CURRENT_TASK.md). Folder forest still derives
 * from slash-path tags + the explicit `looseFolders` list.
 */
import { useMemo, useState, useCallback } from 'react';
import { STRINGS } from '../../../lib/strings';
import { useStore } from '../../../store';
import { buildFolderTree } from './library-folder-tree';
import LibraryZone from './LibraryZone';
import TreeFolderRow from './TreeFolderRow';
import TreeItemRow from './TreeItemRow';

function buildClaimedSet(projectsById, entriesById) {
  // An entry is «claimed» by a project if either:
  //   (a) entry.projectId matches an existing project id, OR
  //   (b) the entry id appears in some project's containerIds array
  //       (legacy import flow linked containers via project.containerIds
  //       without setting entry.projectId).
  // Entries NOT claimed by any project surface in the Loose zone —
  // covers orphan-projectId rows whose project was deleted, plus
  // legacy-import entries whose own projectId field stayed null
  // while the project's containerIds array referenced them.
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

function buildLooseTree(entries, looseFolders) {
  // Union of folder paths derived from loose tags + explicit
  // looseFolders, with all parent prefixes pre-emitted so
  // `Backbones/CRISPR` implicitly creates the `Backbones` parent
  // node even when no entry sits directly on it.
  const fromTags = new Set();
  for (const e of entries) {
    if (!Array.isArray(e.tags)) continue;
    for (const t of e.tags) {
      if (typeof t === 'string' && !t.includes(':')) fromTags.add(t);
    }
  }
  for (const p of (looseFolders || [])) fromTags.add(p);
  const withParents = new Set();
  for (const p of fromTags) {
    const parts = p.split('/').filter(Boolean);
    for (let i = 1; i <= parts.length; i++) {
      withParents.add(parts.slice(0, i).join('/'));
    }
  }
  return buildFolderTree(Array.from(withParents));
}

export default function LooseZone({
  query = '',
  selectedId = null,
  onSelectEntry,
  expanded = true,
  onToggle,
}) {
  const ws = STRINGS.libraryWorkspace || {};
  const entriesById = useStore((s) => s.libraryEntries);
  const projectsById = useStore((s) => s.projects);
  const looseFolders = useStore((s) => s.looseFolders);

  const claimed = useMemo(
    () => buildClaimedSet(projectsById, entriesById),
    [projectsById, entriesById],
  );
  const looseEntries = useMemo(
    () => Object.values(entriesById || {}).filter((e) => isLooseEntry(e, claimed)),
    [entriesById, claimed],
  );
  const tree = useMemo(
    () => buildLooseTree(looseEntries, looseFolders),
    [looseEntries, looseFolders],
  );
  const filtered = useMemo(
    () => looseEntries.filter((e) => matchesQuery(e, query)),
    [looseEntries, query],
  );

  const [openFolders, setOpenFolders] = useState(() => new Set());
  const toggleFolder = useCallback((path) => {
    setOpenFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }, []);

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
      icon="⚐"
      title={ws.zoneLooseTitle || 'Без проекта'}
      sub={ws.zoneLooseSub || 'свободная зона'}
      count={filtered.length}
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
          draggable
        />
      ))}
    </LibraryZone>
  );
}
