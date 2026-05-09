/**
 * ProjectZone — Library workspace tree zone «📦 <name>.bodge».
 *
 * One block per project. Driven by `entry.projectId` per the
 * 09.05.2026 minimum-pass refresh:
 *   • Flat list of all entries with this `projectId` (no
 *     internal Containers / Primers / DAG sub-rows yet — they
 *     return when the real project mechanism lands).
 *   • All projects render as «active» variant (no read-only
 *     pill / variant — same reason: read-only `.bodge` import
 *     is a future feature).
 *   • Drop target stays — Loose entries dragged onto an active
 *     project clone via librarySlice.cloneEntryToActiveProject.
 */
import { useState, useCallback, useMemo } from 'react';
import { useStore } from '../../../store';
import LibraryZone from './LibraryZone';
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
}) {
  const projectId = project?.id;
  const entriesById = useStore((s) => s.libraryEntries);
  const cloneEntryToActiveProject = useStore((s) => s.cloneEntryToActiveProject);

  const projectEntries = useMemo(
    () => Object.values(entriesById || {})
      .filter((e) => e && !e._pendingDelete && e.projectId === projectId)
      .sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || '')),
    [entriesById, projectId],
  );
  const filtered = useMemo(
    () => projectEntries.filter((e) => matchesQuery(e, query)),
    [projectEntries, query],
  );

  // K7 drop target: clone Loose entry into this project on drop.
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

  const pill = (
    <span
      style={{
        fontSize: 9.5, padding: '0 6px', borderRadius: 9,
        background: 'var(--accent-50)',
        color: 'var(--accent-text)',
        border: '1px solid var(--accent-300)',
        fontWeight: 500, letterSpacing: 0, textTransform: 'none',
      }}
    >active</span>
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
        title={`${project?.name || project?.id || '—'}.bodge`}
        pill={pill}
        count={filtered.length}
        expanded={expanded}
        onToggle={onToggle}
        testId={`library-zone-project-${projectId}`}
      >
        {filtered.map((entry) => (
          <TreeItemRow
            key={entry.id}
            entry={entry}
            isSelected={entry.id === selectedId}
            onSelect={onSelectEntry}
            indent={1}
            testId={`tree-item-project-${entry.id}`}
          />
        ))}
      </LibraryZone>
    </div>
  );
}
