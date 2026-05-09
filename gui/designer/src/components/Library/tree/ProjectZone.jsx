/**
 * ProjectZone — Sprint M-X.7a v2 K2.
 *
 * `📦 *.bodge` zone per Library.html ZONE 2a (active) / 2b
 * (read-only).
 *
 * Sub-rows (per Library.html `.subrow.dag`):
 *   • DAG row — click switches workspace to 'flow' for this
 *     projectId via DEC-MX7A-V2-09.
 *   • 📥 Контейнеры folder — entries from selectContainersByProject.
 *   • 🧬 Праймеры folder — entries from selectPrimersByProject.
 *
 * Variant pill:
 *   • active → `<span class="pill accent">active</span>`
 *   • readonly → `<span class="pill ro">🔒 read-only</span>`
 */
import { useState, useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../../../store';
import { STRINGS } from '../../../lib/strings';
import {
  selectContainersByProject,
  selectPrimersByProject,
} from '../../../store/librarySlice';
import LibraryZone from './LibraryZone';
import TreeFolderRow from './TreeFolderRow';
import TreeItemRow from './TreeItemRow';

function matchesQuery(entry, q) {
  if (!q) return true;
  return (entry?.name || '').toLowerCase().includes(q.toLowerCase());
}

export default function ProjectZone({
  project,
  isReadOnly = false,
  query = '',
  selectedId = null,
  onSelectEntry,
  expanded = true,
  onToggle,
}) {
  const projectId = project?.id;
  const setActiveWorkspace = useStore((s) => s.setActiveWorkspace);
  const containers = useStore(useShallow((s) => selectContainersByProject(s, projectId)));
  const primers = useStore(useShallow((s) => selectPrimersByProject(s, projectId)));
  const [containersOpen, setContainersOpen] = useState(true);
  const [primersOpen, setPrimersOpen] = useState(true);

  const filteredContainers = useMemo(
    () => containers.filter((e) => matchesQuery(e, query)),
    [containers, query],
  );
  const filteredPrimers = useMemo(
    () => primers.filter((e) => matchesQuery(e, query)),
    [primers, query],
  );
  const total = filteredContainers.length + filteredPrimers.length;
  const ws = STRINGS.libraryWorkspace || {};
  const variant = isReadOnly ? 'readonly' : 'active';

  const onDagClick = useCallback(() => {
    if (!projectId) return;
    setActiveWorkspace?.('flow', { projectId });
  }, [projectId, setActiveWorkspace]);

  // M-X.7a v2 K7: native HTML5 drop target. Loose entries dropped
  // onto an active project zone clone into that project via
  // librarySlice.cloneEntryToActiveProject. Read-only zones are
  // not drop targets — biolog uses the action-row instead.
  const cloneEntryToActiveProject = useStore((s) => s.cloneEntryToActiveProject);
  const [dropActive, setDropActive] = useState(false);
  const onDragOver = useCallback((e) => {
    if (isReadOnly) return;
    e.preventDefault();
    try { e.dataTransfer.dropEffect = 'copy'; } catch { /* ignore */ }
    setDropActive(true);
  }, [isReadOnly]);
  const onDragLeave = useCallback(() => setDropActive(false), []);
  const onDrop = useCallback((e) => {
    if (isReadOnly) return;
    e.preventDefault();
    setDropActive(false);
    let id = '';
    try { id = e.dataTransfer.getData('application/x-bodge-entry-id'); } catch { /* ignore */ }
    if (!id) return;
    cloneEntryToActiveProject?.(id);
  }, [isReadOnly, cloneEntryToActiveProject]);

  const pill = isReadOnly ? (
    <span
      style={{
        fontSize: 9.5, padding: '0 6px', borderRadius: 9,
        background: 'var(--surface-2)',
        color: 'var(--text-secondary)',
        border: '1px solid var(--border-default)',
        fontWeight: 500, letterSpacing: 0, textTransform: 'none',
      }}
    >🔒 read-only</span>
  ) : (
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
      variant={variant}
      icon="📦"
      title={`${project?.name || project?.id || '—'}.bodge`}
      pill={pill}
      count={total}
      expanded={expanded}
      onToggle={onToggle}
      testId={`library-zone-project-${projectId}`}
    >
      <div
        data-testid={`tree-subrow-dag-${projectId}`}
        role="button"
        tabIndex={0}
        onClick={onDagClick}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onDagClick(); } }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 12px',
          paddingLeft: 22,
          cursor: 'pointer',
          userSelect: 'none',
          fontSize: 12,
          color: 'var(--text-secondary)',
        }}
      >
        <span style={{ width: 10 }} />
        <span style={{ fontSize: 13 }}>🔀</span>
        <span>{ws.dagSubrow || 'DAG'}</span>
        <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>
          {isReadOnly ? 'read-only view' : '—'}
        </span>
      </div>

      <TreeFolderRow
        name={ws.containersFolder || 'Контейнеры'}
        icon="📥"
        count={filteredContainers.length}
        expanded={containersOpen}
        indent={1}
        onToggle={() => setContainersOpen((v) => !v)}
        testId={`tree-folder-containers-${projectId}`}
      />
      {containersOpen && filteredContainers.map((entry) => (
        <TreeItemRow
          key={entry.id}
          entry={entry}
          isSelected={entry.id === selectedId}
          onSelect={onSelectEntry}
          indent={2}
          testId={`tree-item-project-${entry.id}`}
        />
      ))}

      <TreeFolderRow
        name={ws.primersFolder || 'Праймеры'}
        icon="🧬"
        count={filteredPrimers.length}
        expanded={primersOpen}
        indent={1}
        onToggle={() => setPrimersOpen((v) => !v)}
        testId={`tree-folder-primers-${projectId}`}
      />
      {primersOpen && filteredPrimers.map((entry) => (
        <TreeItemRow
          key={entry.id}
          entry={entry}
          isSelected={entry.id === selectedId}
          onSelect={onSelectEntry}
          indent={2}
          testId={`tree-item-project-${entry.id}`}
        />
      ))}
    </LibraryZone>
    </div>
  );
}
