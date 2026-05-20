/**
 * LibrarySearchBar — top-of-canvas search input + dropdown replacing
 * the removed LibraryTreeHost (PC-K1).
 *
 * Spec §3 (PROJECT_CANVAS_CLEANUP K2/K3). Full-width input above the
 * canvas; on focus opens a dropdown with four sections:
 *   - Из библиотеки (не привязано) — LibraryEntries without projectId
 *     OR belonging to other projects.
 *   - В этом проекте — containers / pieces / etc. for the current project.
 *   - Сборки — zones in this project.
 *   - Праймеры — primer pool entries.
 *
 * Click on an entry triggers onSelectEntry({kind, id}) — caller wires
 * to add-to-canvas / focus / etc. Esc / outside-click closes the
 * dropdown but keeps the input visible.
 *
 * Search is substring-match (case-insensitive) over `name`. Drag-out
 * preserves the existing tree-drag MIME so the canvas drop handler in
 * CanvasLayoutView accepts it unchanged.
 */
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { TREE_DRAG_MIME } from './use-tree-drop-target';

export default function LibrarySearchBar({
  libraryEntries,
  containers,
  zones,
  primers,
  currentProjectId,
  onSelectEntry,
  testId = 'canvas-library-search-bar',
}) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const wrapRef = useRef(null);

  const grouped = useMemo(
    () => groupResults({ libraryEntries, containers, zones, primers, currentProjectId, query }),
    [libraryEntries, containers, zones, primers, currentProjectId, query],
  );

  // Click-outside / Esc close.
  useEffect(() => {
    if (!isOpen) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setIsOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setIsOpen(false); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  const handlePick = useCallback((entryDescriptor) => {
    setIsOpen(false);
    onSelectEntry?.(entryDescriptor);
  }, [onSelectEntry]);

  const totalCount = grouped.fromLibrary.length + grouped.inProject.length
    + grouped.assemblies.length + grouped.primers.length;

  return (
    <div ref={wrapRef} data-testid={testId} style={styles.wrap}>
      <input
        type="search"
        data-testid={`${testId}-input`}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
        onFocus={() => setIsOpen(true)}
        placeholder="🔍 Поиск в библиотеке (плазмиды, праймеры, сборки)"
        style={styles.input}
      />
      {isOpen && (
        <div
          data-testid={`${testId}-dropdown`}
          style={styles.dropdown}
        >
          {totalCount === 0 && (
            <div data-testid={`${testId}-empty`} style={styles.empty}>
              {query.trim()
                ? 'Ничего не найдено.'
                : 'Начните вводить — найду плазмиду в библиотеке или в проекте.'}
            </div>
          )}
          <Section
            title="Из библиотеки (не привязано)"
            entries={grouped.fromLibrary}
            kind="library"
            onPick={handlePick}
            testId={`${testId}-section-library`}
          />
          <Section
            title="В этом проекте"
            entries={grouped.inProject}
            kind="container"
            onPick={handlePick}
            testId={`${testId}-section-in-project`}
          />
          <Section
            title="Сборки"
            entries={grouped.assemblies}
            kind="zone"
            onPick={handlePick}
            testId={`${testId}-section-zones`}
          />
          <Section
            title="Праймеры"
            entries={grouped.primers}
            kind="primer"
            onPick={handlePick}
            testId={`${testId}-section-primers`}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Pure: split inputs into four buckets and apply substring filter.
 * Exported for unit tests.
 */
export function groupResults({
  libraryEntries, containers, zones, primers, currentProjectId, query,
}) {
  const q = (query || '').trim().toLowerCase();
  const match = (name) => !q || String(name || '').toLowerCase().includes(q);

  const libraryArr = libraryEntries && typeof libraryEntries === 'object'
    ? Object.values(libraryEntries)
    : [];
  const containerArr = Array.isArray(containers) ? containers : [];
  const zoneArr = Array.isArray(zones) ? zones : [];
  const primerArr = Array.isArray(primers) ? primers : [];

  const fromLibrary = libraryArr
    .filter(Boolean)
    .filter((e) => (!e.projectId || e.projectId !== currentProjectId))
    .filter((e) => match(e.name))
    .slice(0, 50);

  const inProject = containerArr
    .filter(Boolean)
    .filter((c) => match(c.name))
    .slice(0, 50);

  const assemblies = zoneArr
    .filter(Boolean)
    .filter((z) => match(z.name))
    .slice(0, 30);

  const primersOut = primerArr
    .filter(Boolean)
    .filter((p) => p?.kind !== 'pair')
    .filter((p) => match(p.name || p.sequence))
    .slice(0, 30);

  return {
    fromLibrary, inProject, assemblies, primers: primersOut,
  };
}

function Section({ title, entries, kind, onPick, testId }) {
  if (!entries || entries.length === 0) return null;
  return (
    <div data-testid={testId} style={styles.section}>
      <div style={styles.sectionTitle}>── {title} · {entries.length} ──</div>
      {entries.map((e) => (
        <button
          key={e.id}
          type="button"
          data-testid={`${testId}-item-${e.id}`}
          onClick={() => onPick({ kind, id: e.id, entry: e })}
          draggable={kind === 'library'}
          onDragStart={(ev) => {
            if (kind !== 'library') return;
            try {
              // Preserve the existing tree-drag MIME so the canvas drop
              // handler in CanvasLayoutView (use-tree-drop-target) accepts
              // it the same way it used to from LibraryTreeHost.
              ev.dataTransfer.setData(TREE_DRAG_MIME, e.id);
              ev.dataTransfer.setData('text/plain', e.id);
              ev.dataTransfer.effectAllowed = 'copy';
            } catch { /* jsdom dataTransfer */ }
          }}
          style={styles.row}
        >
          <span style={styles.rowName}>{e.name || '(без имени)'}</span>
          {e.payload?.length || e.length || (e.sequence?.length) ? (
            <span style={styles.rowMeta}>
              {e.payload?.length || e.length || e.sequence?.length} bp
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

const styles = {
  wrap: {
    position: 'relative',
    padding: '8px 12px',
    background: 'var(--surface-2)',
    borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
  },
  input: {
    width: '100%',
    padding: '8px 12px',
    fontSize: 12.5,
    border: '1px solid var(--border-subtle)',
    borderRadius: 6,
    background: 'var(--surface-1)',
    color: 'var(--text-primary)',
    outline: 'none',
    boxSizing: 'border-box',
  },
  dropdown: {
    position: 'absolute',
    top: 'calc(100% - 1px)',
    left: 12,
    right: 12,
    zIndex: 60,
    maxHeight: 360,
    overflowY: 'auto',
    background: 'var(--surface-1)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 6,
    boxShadow: '0 6px 18px rgba(28,25,23,0.18)',
    padding: 8,
  },
  empty: { padding: 12, fontSize: 11.5, color: 'var(--text-tertiary)' },
  section: { marginBottom: 6 },
  sectionTitle: {
    fontSize: 10.5, fontWeight: 600,
    color: 'var(--text-tertiary)',
    textTransform: 'uppercase', letterSpacing: 0.4,
    padding: '4px 4px',
  },
  row: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    width: '100%', padding: '6px 8px',
    background: 'var(--surface-2)', color: 'var(--text-primary)',
    border: '1px solid var(--border-subtle)', borderRadius: 4,
    cursor: 'pointer', marginBottom: 2, textAlign: 'left', fontSize: 12,
  },
  rowName: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rowMeta: { color: 'var(--text-tertiary)', fontSize: 11, marginLeft: 8 },
};
