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
 *
 * K2.1 amendment (Игорь 20.05.2026):
 *   §3.2.1 visual parity — entries rendered с `MiniPlasmidMap`
 *   thumbnail (32 px) слева, не plain text. Primers → fallback icon.
 *   §3.2.2 collapsed by default — категории показываются как headers
 *   с count'ом, content скрыт. Click на header → expand. Typing с
 *   matches → auto-expand категорий c матчами. Empty category (count
 *   0) → disabled gray header, не expandable.
 */
import {
  useState, useMemo, useEffect, useRef, useCallback,
} from 'react';
import { TREE_DRAG_MIME } from './use-tree-drop-target';
import MiniPlasmidMap from './MiniPlasmidMap';

const ALL_SECTION_IDS = ['library', 'in-project', 'zones', 'primers'];

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
  // K2.1 §3.2.2 — collapsed by default. Биолог open'ит интересную
  // категорию click'ом на header; typing auto-expand'ит matched.
  const [expanded, setExpanded] = useState(() => new Set());
  const wrapRef = useRef(null);

  const grouped = useMemo(
    () => groupResults({ libraryEntries, containers, zones, primers, currentProjectId, query }),
    [libraryEntries, containers, zones, primers, currentProjectId, query],
  );

  const sectionCounts = useMemo(() => ({
    library: grouped.fromLibrary.length,
    'in-project': grouped.inProject.length,
    zones: grouped.assemblies.length,
    primers: grouped.primers.length,
  }), [grouped]);

  // Auto-expand: typing query and matches появились → раскрыть категории
  // с матчами. Empty query → reset обратно в collapsed (default state).
  const trimmedQuery = (query || '').trim();
  useEffect(() => {
    if (!trimmedQuery) {
      // Default state — all sections collapsed.
      setExpanded(new Set());
      return;
    }
    const next = new Set();
    for (const id of ALL_SECTION_IDS) {
      if (sectionCounts[id] > 0) next.add(id);
    }
    setExpanded(next);
  }, [trimmedQuery, sectionCounts.library, sectionCounts['in-project'], sectionCounts.zones, sectionCounts.primers]);

  // Click-outside / Esc close.
  useEffect(() => {
    if (!isOpen) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setIsOpen(false);
        // K2.1 §3.2.2 — close reset collapsed state так что repeat
        // open даёт default (collapsed) view.
        setExpanded(new Set());
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setExpanded(new Set());
      }
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  const handlePick = useCallback((entryDescriptor) => {
    setIsOpen(false);
    setExpanded(new Set());
    onSelectEntry?.(entryDescriptor);
  }, [onSelectEntry]);

  const toggleSection = useCallback((sectionId) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(sectionId)) n.delete(sectionId);
      else n.add(sectionId);
      return n;
    });
  }, []);

  const totalCount = sectionCounts.library + sectionCounts['in-project']
    + sectionCounts.zones + sectionCounts.primers;

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
              {trimmedQuery
                ? 'Ничего не найдено.'
                : 'Начните вводить — найду плазмиду в библиотеке или в проекте.'}
            </div>
          )}
          <Section
            id="library"
            title="Из библиотеки (не привязано)"
            entries={grouped.fromLibrary}
            kind="library"
            onPick={handlePick}
            expanded={expanded.has('library')}
            onToggle={() => toggleSection('library')}
            testId={`${testId}-section-library`}
          />
          <Section
            id="in-project"
            title="В этом проекте"
            entries={grouped.inProject}
            kind="container"
            onPick={handlePick}
            expanded={expanded.has('in-project')}
            onToggle={() => toggleSection('in-project')}
            testId={`${testId}-section-in-project`}
          />
          <Section
            id="zones"
            title="Сборки"
            entries={grouped.assemblies}
            kind="zone"
            onPick={handlePick}
            expanded={expanded.has('zones')}
            onToggle={() => toggleSection('zones')}
            testId={`${testId}-section-zones`}
          />
          <Section
            id="primers"
            title="Праймеры"
            entries={grouped.primers}
            kind="primer"
            onPick={handlePick}
            expanded={expanded.has('primers')}
            onToggle={() => toggleSection('primers')}
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

/**
 * Resolve display metadata for an entry across all four shapes
 * (library entry / container / zone / primer).
 *
 * Returns { length, topology, annotations, name } — used by both the
 * MiniPlasmidMap thumbnail and the metadata text.
 */
function entryDisplay(entry, kind) {
  if (!entry) return { length: 0, topology: 'linear', annotations: [], name: '?' };
  const name = entry.name || '(без имени)';
  if (kind === 'library') {
    const p = entry.payload || {};
    return {
      name,
      length: p.length || (p.sequence ? p.sequence.length : 0),
      topology: p.topology || 'linear',
      annotations: Array.isArray(p.annotations) ? p.annotations : [],
    };
  }
  if (kind === 'container') {
    return {
      name,
      length: (entry.sequence ? entry.sequence.length : entry.length) || 0,
      topology: entry.topology?.circular ? 'circular' : (entry.topology || 'linear'),
      annotations: Array.isArray(entry.annotations) ? entry.annotations : [],
    };
  }
  if (kind === 'zone') {
    return { name, length: 0, topology: 'linear', annotations: [] };
  }
  // primer
  return {
    name,
    length: (entry.sequence || '').length,
    topology: 'linear',
    annotations: [],
  };
}

function EntryThumbnail({ display, kind }) {
  // Primers → small icon (no map). Zones → 🧬 in circle placeholder.
  if (kind === 'primer') {
    return (
      <div
        data-testid="library-search-thumb-primer"
        style={styles.thumbPlaceholder}
        aria-hidden
      >🧬</div>
    );
  }
  if (kind === 'zone') {
    return (
      <div
        data-testid="library-search-thumb-zone"
        style={styles.thumbPlaceholder}
        aria-hidden
      >🧱</div>
    );
  }
  // library + container — MiniPlasmidMap at 32 px. showLabels=false:
  // на таком размере leader-line подписи фич нечитаемы и обрезаются;
  // имя + счётчик фич живут в тексте строки рядом.
  return (
    <MiniPlasmidMap
      testId="library-search-thumb-map"
      length={Math.max(1, display.length)}
      annotations={display.annotations}
      circular={display.topology === 'circular'}
      width={32}
      height={32}
      showLabels={false}
    />
  );
}

function Section({
  id, title, entries, kind, onPick, testId, expanded, onToggle,
}) {
  const count = entries ? entries.length : 0;
  const disabled = count === 0;
  // K2.1 §3.2.2 — empty category — header показан, но disabled (gray)
  // и не expandable. Не возвращаем null чтобы testId оставался для
  // existing tests; контент просто не рендерится.
  const isOpen = expanded && !disabled;

  return (
    <div data-testid={testId} data-expanded={isOpen ? 'true' : 'false'} style={styles.section}>
      <button
        type="button"
        data-testid={`${testId}-header`}
        onClick={disabled ? undefined : onToggle}
        disabled={disabled}
        style={{
          ...styles.sectionHeader,
          cursor: disabled ? 'default' : 'pointer',
          color: disabled ? 'var(--text-tertiary)' : 'var(--text-secondary)',
          opacity: disabled ? 0.55 : 1,
        }}
      >
        <span style={styles.sectionChevron} aria-hidden>
          {disabled ? '·' : (isOpen ? '▼' : '▶')}
        </span>
        <span style={{ flex: 1 }}>{title}</span>
        <span style={styles.sectionCount}>· {count}</span>
      </button>
      {isOpen && entries.map((e) => {
        const display = entryDisplay(e, kind);
        return (
          <button
            key={e.id}
            type="button"
            data-testid={`${testId}-item-${e.id}`}
            onClick={() => onPick({ kind, id: e.id, entry: e })}
            draggable={kind === 'library'}
            onDragStart={(ev) => {
              if (kind !== 'library') return;
              try {
                ev.dataTransfer.setData(TREE_DRAG_MIME, e.id);
                ev.dataTransfer.setData('text/plain', e.id);
                ev.dataTransfer.effectAllowed = 'copy';
              } catch { /* jsdom dataTransfer */ }
            }}
            style={styles.row}
          >
            <span style={styles.rowThumb}>
              <EntryThumbnail display={display} kind={kind} />
            </span>
            <span style={styles.rowMain}>
              <span style={styles.rowName}>{display.name}</span>
              <span style={styles.rowMeta}>
                {display.length > 0 ? `${display.length} bp` : '—'}
                {display.topology !== 'linear' && ` · ${display.topology}`}
                {display.annotations.length > 0 && ` · ${display.annotations.length} features`}
              </span>
            </span>
          </button>
        );
      })}
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
    maxHeight: 460,
    overflowY: 'auto',
    background: 'var(--surface-1)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 6,
    boxShadow: '0 6px 18px rgba(28,25,23,0.18)',
    padding: 6,
  },
  empty: { padding: 12, fontSize: 11.5, color: 'var(--text-tertiary)' },
  section: { marginBottom: 4 },
  sectionHeader: {
    display: 'flex', alignItems: 'center', gap: 6,
    width: '100%', padding: '6px 8px',
    background: 'var(--surface-2)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 4,
    fontSize: 10.5, fontWeight: 600,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    textAlign: 'left',
  },
  sectionChevron: {
    fontSize: 9, color: 'var(--text-tertiary)', minWidth: 10,
  },
  sectionCount: {
    fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 500,
    marginLeft: 4,
  },
  row: {
    display: 'flex', alignItems: 'center', gap: 8,
    width: '100%', padding: '6px 8px',
    background: 'var(--surface-1)', color: 'var(--text-primary)',
    border: '1px solid var(--border-subtle)', borderRadius: 4,
    cursor: 'pointer', marginTop: 3, textAlign: 'left', fontSize: 12,
  },
  rowThumb: {
    flexShrink: 0, width: 32, height: 32,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    // V85 r2 — MiniPlasmidMap теперь рендерится с showLabels=false,
    // так что leader-line подписи не выходят за SVG. overflow:hidden
    // больше не нужен (нечему обрезаться) — оставляем чистое кольцо.
  },
  rowMain: {
    flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1,
  },
  rowName: {
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    fontWeight: 600, fontSize: 12,
  },
  rowMeta: {
    color: 'var(--text-tertiary)', fontSize: 10.5,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  thumbPlaceholder: {
    width: 32, height: 32,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--surface-2)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '50%',
    fontSize: 14,
  },
};
