/**
 * DagPalette — left split-pane on the DAG fullscreen (M-C.1 K3).
 *
 * Read-only browse subset of LibraryTree (DEC-MC1-03):
 *   • thisProject : containers already pinned to the active project.
 *   • demo        : 12 curated demo plasmids (basic_cloning_vectors).
 *   • mine        : containers in the user's library.
 *   • snapgene    : SnapGene catalog categories (lazy-loaded on expand).
 *
 * Sticky search at top filters across all groups by name (case-
 * insensitive) AND length-pattern: `>5kb` / `>5000` matches lengths
 * above 5000 bp; `<2k` / `<2000` matches below; `2k-3k` / `2000-3000`
 * matches a closed range.
 *
 * **Без folder tree, folder creation, dropzone, paste textarea, full
 * flat search overlay** — those affordances belong to the Library
 * workspace. The palette is a drag-source + click-to-preview surface.
 *
 * Each row is a `<DagPaletteItemRow>` — its drag handle writes the
 * `application/x-bodgegene-dag-add` MIME (the DagCanvas drop target
 * in K2 reads the same MIME), and a click on the row body fires
 * `onPreview(entry)`.
 *
 * Persistent group-state lives in localStorage under
 * `pvcs-dag-palette-group-{key}` — separate keys from the Library
 * workspace so biolog can have different expanded states.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '../../../store';
import { STRINGS } from '../../../lib/strings';
import { useCatalogSources } from '../../Library/hooks/useLibrarySources';
import DagPaletteItemRow from './DagPaletteItemRow';

const S = STRINGS.dag;

const GROUP_LABELS = {
  thisProject: S.paletteGroupThisProject,
  demo: S.paletteGroupDemo,
  mine: S.paletteGroupMine,
  snapgene: S.paletteGroupSnapgene,
};
const GROUP_ORDER = ['thisProject', 'demo', 'mine', 'snapgene'];
const STORAGE_PREFIX = 'pvcs-dag-palette-group-';

function readGroupOpen(key, fallback) {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw === null) return fallback;
    return raw === '1';
  } catch { return fallback; }
}
function writeGroupOpen(key, open) {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(STORAGE_PREFIX + key, open ? '1' : '0'); } catch { /* quota */ }
}

/**
 * Parse «>5kb», «<2k», «2k-3k», «2000-3000» into a `{min, max}` filter.
 * Returns null if `q` doesn't look like a length pattern.
 */
function parseLengthPattern(q) {
  const norm = q.replace(/\s+/g, '').toLowerCase();
  const numFromUnit = (s) => {
    if (s.endsWith('kb')) return Number.parseFloat(s.slice(0, -2)) * 1000;
    if (s.endsWith('k')) return Number.parseFloat(s.slice(0, -1)) * 1000;
    return Number.parseFloat(s);
  };
  const gt = norm.match(/^>(\d+(?:\.\d+)?(?:k|kb)?)$/);
  if (gt) return { min: numFromUnit(gt[1]) };
  const lt = norm.match(/^<(\d+(?:\.\d+)?(?:k|kb)?)$/);
  if (lt) return { max: numFromUnit(lt[1]) };
  const range = norm.match(/^(\d+(?:\.\d+)?(?:k|kb)?)-(\d+(?:\.\d+)?(?:k|kb)?)$/);
  if (range) return { min: numFromUnit(range[1]), max: numFromUnit(range[2]) };
  return null;
}

function applyFilter(items, query) {
  if (!query) return items;
  const lengthFilter = parseLengthPattern(query);
  if (lengthFilter) {
    return items.filter((it) => {
      const len = it.length || it.sequence?.length || 0;
      if (lengthFilter.min != null && len < lengthFilter.min) return false;
      if (lengthFilter.max != null && len > lengthFilter.max) return false;
      return true;
    });
  }
  const needle = query.toLowerCase();
  return items.filter((it) => (it.name || '').toLowerCase().includes(needle));
}

export default function DagPalette({ onPreview }) {
  const sources = useCatalogSources();
  const libraryEntries = useStore((s) => s.libraryEntries);
  const [query, setQuery] = useState('');
  const [openGroups, setOpenGroups] = useState({
    thisProject: readGroupOpen('thisProject', true),
    demo: readGroupOpen('demo', false),
    mine: readGroupOpen('mine', true),
    snapgene: readGroupOpen('snapgene', false),
  });

  const toggleGroup = useCallback((key) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      writeGroupOpen(key, next[key]);
      return next;
    });
  }, []);

  // Resolve a row's draggable libraryEntryId and a presentable name.
  // For 'mine' / 'thisProject' the row carries the real id; for
  // 'demo' / 'snapgene' the catalog item id is synthetic until biolog
  // explicitly adds the plasmid through the Library workspace, so the
  // palette skips drag for those groups (preview still works — biolog
  // sees the topology + features and decides whether to import).
  const itemsByGroup = useMemo(() => {
    const out = {
      thisProject: applyFilter(sources.thisProject, query),
      demo: applyFilter(sources.demo, query),
      mine: applyFilter(sources.mine, query),
      snapgene: [], // Snapgene loaded lazily per category (below).
    };
    return out;
  }, [sources, query]);

  // Reuse existing libraryEntries map for the preview-on-click payload —
  // catalog items carry a slimmer shape than full LibraryEntry, but for
  // mine/thisProject rows the full entry is one lookup away.
  const onRowClick = useCallback((catalogItem) => {
    if (!onPreview) return;
    if (catalogItem._source === 'mine' || catalogItem._source === 'project') {
      const full = libraryEntries[catalogItem.id];
      if (full) {
        onPreview(full);
        return;
      }
    }
    // Demo / snapgene rows: synthesise a minimal entry shape so the
    // drawer renders without a libraryEntries lookup.
    onPreview({
      id: catalogItem.id,
      name: catalogItem.name,
      payload: {
        sequence: catalogItem.sequence || '',
        length: catalogItem.length || (catalogItem.sequence?.length || 0),
        topology: catalogItem.topology || 'circular',
        annotations: catalogItem.annotations || [],
      },
      _source: catalogItem._source,
    });
  }, [onPreview, libraryEntries]);

  return (
    <div
      data-testid="dag-palette"
      style={{
        width: 280,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface-1, #ffffff)',
        borderRight: '0.5px solid var(--border-default, #d6d3d1)',
        minHeight: 0,
      }}
    >
      <div
        style={{
          padding: 8,
          position: 'sticky',
          top: 0,
          background: 'var(--surface-1, #ffffff)',
          zIndex: 2,
          borderBottom: '0.5px solid var(--border-subtle, #e7e5e4)',
        }}
      >
        <input
          type="text"
          data-testid="dag-palette-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={S.paletteSearchPlaceholder}
          style={{
            width: '100%',
            padding: '6px 8px',
            fontSize: 12,
            border: '0.5px solid var(--border-default, #d6d3d1)',
            borderRadius: 'var(--radius-md, 8px)',
            background: 'var(--surface-1, #ffffff)',
            color: 'var(--text-primary, #1c1917)',
            outline: 'none',
          }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {GROUP_ORDER.map((groupKey) => {
          const items = itemsByGroup[groupKey] || [];
          const isOpen = openGroups[groupKey];
          const isSnapgene = groupKey === 'snapgene';
          const draggable = groupKey === 'mine' || groupKey === 'thisProject';
          return (
            <div key={groupKey}>
              <button
                type="button"
                data-testid={`dag-palette-group-${groupKey}`}
                data-group-key={groupKey}
                data-open={isOpen ? 'true' : 'false'}
                onClick={() => toggleGroup(groupKey)}
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: 'var(--text-secondary, #57534e)',
                  background: 'var(--surface-2, #fafaf9)',
                  border: 'none',
                  borderTop: '0.5px solid var(--border-subtle, #e7e5e4)',
                  borderBottom: '0.5px solid var(--border-subtle, #e7e5e4)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{ width: 10, color: 'var(--text-tertiary)' }}>{isOpen ? '▾' : '▸'}</span>
                <span style={{ flex: 1 }}>{GROUP_LABELS[groupKey]}</span>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                  {isSnapgene ? S.paletteCategoryCount(sources.snapgeneCategories.length) : items.length}
                </span>
              </button>
              {isOpen && !isSnapgene && (
                <div>
                  {items.length === 0 && (
                    <div
                      data-testid={`dag-palette-empty-${groupKey}`}
                      style={{
                        padding: '6px 12px',
                        fontSize: 11,
                        color: 'var(--text-tertiary, #a8a29e)',
                        fontStyle: 'italic',
                      }}
                    >{S.paletteEmpty}</div>
                  )}
                  {items.map((item) => (
                    <DagPaletteItemRow
                      key={item.id || item.name}
                      item={item}
                      draggable={draggable}
                      onClick={() => onRowClick(item)}
                    />
                  ))}
                </div>
              )}
              {isOpen && isSnapgene && (
                <SnapgeneCategoriesView
                  query={query}
                  sources={sources}
                  onRowClick={onRowClick}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Snapgene group renders categories as collapsible sub-headers; on
 * expand the hook lazy-loads the category JSON. Search applies
 * post-load — items not matching are filtered out, but a category
 * with zero matches still shows so biolog knows it has been searched.
 */
function SnapgeneCategoriesView({ query, sources, onRowClick }) {
  const [expanded, setExpanded] = useState({});
  const onCategoryToggle = (slug) => {
    setExpanded((prev) => {
      const next = { ...prev, [slug]: !prev[slug] };
      if (next[slug] && sources.snapgeneCategoryItems[slug] === undefined) {
        sources.loadSnapgeneCategory(slug);
      }
      return next;
    });
  };
  return (
    <div>
      {sources.snapgeneCategories.map((cat) => {
        const isOpen = !!expanded[cat.slug];
        const items = sources.snapgeneCategoryItems[cat.slug];
        const filtered = items ? applyFilter(items, query) : null;
        return (
          <div key={cat.slug}>
            <button
              type="button"
              data-testid={`dag-palette-snapgene-cat-${cat.slug}`}
              onMouseEnter={() => sources.prefetchSnapgeneCategory(cat.slug)}
              onClick={() => onCategoryToggle(cat.slug)}
              style={{
                width: '100%',
                padding: '4px 24px',
                fontSize: 11,
                color: 'var(--text-secondary)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                gap: 6,
              }}
            >
              <span style={{ width: 10 }}>{isOpen ? '▾' : '▸'}</span>
              <span style={{ flex: 1 }}>{cat.name || cat.slug}</span>
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{cat.count}</span>
            </button>
            {isOpen && filtered && filtered.map((item) => (
              <DagPaletteItemRow
                key={item.id || item.name}
                item={item}
                draggable={false}
                onClick={() => onRowClick(item)}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
