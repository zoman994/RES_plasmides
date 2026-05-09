/**
 * LabPoolZone — Sprint M-X.7a v2 K2.
 *
 * `🧬 Лабораторный пул · primer'ы в морозильнике` zone per
 * Library.html ZONE 3. Splits into:
 *   • ❄ В лаборатории — primers with `inLabStock=true` (physically
 *     in the freezer). Origin char on row = ❄.
 *   • 📚 Из чужих проектов — primers with zone='lab_pool' but
 *     `inLabStock=false` (cross-project provenance, available for
 *     reuse).
 */
import { useState, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../../../store';
import { STRINGS } from '../../../lib/strings';
import { selectLabPoolStructure } from '../../../store/librarySlice';
import LibraryZone from './LibraryZone';
import TreeFolderRow from './TreeFolderRow';
import TreeItemRow from './TreeItemRow';

function matchesQuery(entry, q) {
  if (!q) return true;
  return (entry?.name || '').toLowerCase().includes(q.toLowerCase());
}

export default function LabPoolZone({
  query = '',
  selectedId = null,
  onSelectEntry,
  expanded = true,
  onToggle,
}) {
  // selectLabPoolStructure returns `{inLab, crossProject}` — fresh
  // wrapper object each call, useShallow can't compare. Compute via
  // useMemo over the primitive entries ref instead.
  const entriesById = useStore((s) => s.libraryEntries);
  const split = useMemo(
    () => selectLabPoolStructure({ libraryEntries: entriesById }),
    [entriesById],
  );
  const [labOpen, setLabOpen] = useState(true);
  const [crossOpen, setCrossOpen] = useState(false);

  const lab = useMemo(
    () => (split?.inLab || []).filter((e) => matchesQuery(e, query)),
    [split, query],
  );
  const cross = useMemo(
    () => (split?.crossProject || []).filter((e) => matchesQuery(e, query)),
    [split, query],
  );
  const total = lab.length + cross.length;
  const ws = STRINGS.libraryWorkspace || {};

  return (
    <LibraryZone
      variant="lab"
      icon="🧬"
      title={ws.zoneLabTitle || 'Лабораторный пул'}
      sub={ws.zoneLabSub || 'primer\'ы в морозильнике'}
      count={total}
      expanded={expanded}
      onToggle={onToggle}
      testId="library-zone-lab"
    >
      <TreeFolderRow
        name={ws.inLab || 'В лаборатории'}
        icon="❄"
        count={lab.length}
        expanded={labOpen}
        indent={1}
        onToggle={() => setLabOpen((v) => !v)}
        testId="tree-folder-lab-inlab"
        textColor="var(--text-secondary)"
      />
      {labOpen && lab.map((entry) => (
        <TreeItemRow
          key={entry.id}
          entry={entry}
          isSelected={entry.id === selectedId}
          onSelect={onSelectEntry}
          indent={2}
          testId={`tree-item-lab-${entry.id}`}
        />
      ))}

      <TreeFolderRow
        name={ws.crossProject || 'Из чужих проектов'}
        icon="📚"
        count={cross.length}
        expanded={crossOpen}
        indent={1}
        onToggle={() => setCrossOpen((v) => !v)}
        testId="tree-folder-lab-cross"
      />
      {crossOpen && cross.map((entry) => (
        <TreeItemRow
          key={entry.id}
          entry={entry}
          isSelected={entry.id === selectedId}
          onSelect={onSelectEntry}
          indent={2}
          testId={`tree-item-lab-${entry.id}`}
        />
      ))}
    </LibraryZone>
  );
}
