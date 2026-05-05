import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../../store';
import { fetchIndex, fetchCategory, prefetchAllCategories } from './catalog-cache';

/**
 * useCatalogSources — assembles the four CatalogColumn sources (M-B.2 K2,
 * DEC-IMP-14).
 *
 *   thisProject : containers pinned to currentProject.containerIds (passive view).
 *   demo        : basic_cloning_vectors slice 0–12 (lazy-loaded on first render).
 *   mine        : Library entries (containers); sub-grouped by entry.tags per
 *                 §10.1 default approval (flat fallback when tags empty).
 *   snapgene    : catalog index → categories[] with lazy fetchCategory on expand.
 *
 * The hook returns plain data; rendering decisions (collapse state, drill-down
 * cards) live in CatalogColumn.
 */
export function useCatalogSources() {
  const libraryEntries = useStore((s) => s.libraryEntries);
  const projects = useStore((s) => s.projects);
  const currentProjectId = useStore((s) => s.currentProjectId);
  const _libraryHydrated = useStore((s) => s._libraryHydrated);

  const [index, setIndex] = useState(null);
  const [demoItems, setDemoItems] = useState(null);
  const [snapgeneFlat, setSnapgeneFlat] = useState(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [snapgeneCategoryItems, setSnapgeneCategoryItems] = useState({});

  useEffect(() => {
    let alive = true;
    fetchIndex()
      .then((idx) => { if (alive) setIndex(idx); })
      .catch(() => { /* index optional in tests */ });
    return () => { alive = false; };
  }, []);

  // Lazy demo load (kicks once mountable; non-blocking).
  useEffect(() => {
    if (demoItems != null) return;
    let alive = true;
    setDemoLoading(true);
    fetchCategory('basic_cloning_vectors')
      .then((cat) => {
        if (!alive) return;
        const items = (cat.plasmids || []).slice(0, 12).map((p) => ({
          ...p, _badge: 'demo', _source: 'demo',
        }));
        setDemoItems(items);
      })
      .catch(() => alive && setDemoItems([]))
      .finally(() => alive && setDemoLoading(false));
    return () => { alive = false; };
  }, [demoItems]);

  const thisProject = useMemo(() => {
    if (!currentProjectId) return [];
    const proj = projects[currentProjectId];
    if (!proj || !Array.isArray(proj.containerIds)) return [];
    return proj.containerIds
      .map((id) => libraryEntries[id])
      .filter(Boolean)
      .filter((e) => e.kind === 'container' && e._pendingDelete !== true)
      .map((e) => libraryEntryToCatalogItem(e, 'project'));
  }, [currentProjectId, projects, libraryEntries]);

  const mine = useMemo(() => {
    return Object.values(libraryEntries || {})
      .filter((e) => e && e.kind === 'container' && e._pendingDelete !== true)
      .sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''))
      .map((e) => libraryEntryToCatalogItem(e, 'mine'));
  }, [libraryEntries]);

  /**
   * Sub-group `mine` by `folderPath` — each entry sits in exactly one
   * folder bucket (top of «Mine» when folderPath is empty). Tags are
   * NOT used for grouping any more (biolog: «такги просто атрибут
   * который мы можем использовать потом для поиска но папки с
   * названиями тагов не создавать»). Empty top-level placement uses
   * the synthetic '' key.
   */
  const mineGroups = useMemo(() => {
    if (mine.length === 0) return [];
    const buckets = new Map();
    for (const it of mine) {
      const path = typeof it._folderPath === 'string' ? it._folderPath : '';
      if (!buckets.has(path)) buckets.set(path, []);
      buckets.get(path).push(it);
    }
    return Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([tag, items]) => ({ tag, items }));
  }, [mine]);

  const snapgeneCategories = index?.categories || [];

  // Helper: ensure category items are loaded on demand.
  const loadSnapgeneCategory = (slug) => {
    if (snapgeneCategoryItems[slug] !== undefined) return;
    fetchCategory(slug).then((cat) => {
      const items = (cat.plasmids || []).map((p) => ({
        ...p, _badge: cat.name || slug, _source: 'snapgene', _slug: slug,
      }));
      setSnapgeneCategoryItems((prev) => ({ ...prev, [slug]: items }));
    }).catch(() => {
      setSnapgeneCategoryItems((prev) => ({ ...prev, [slug]: [] }));
    });
  };

  // Cross-category prefetch for flat search.
  const ensureSnapgeneFlat = () => {
    if (snapgeneFlat || !index) return;
    prefetchAllCategories(index).then((c) => {
      setSnapgeneFlat(c.items.map((p) => ({ ...p, _source: 'snapgene' })));
    }).catch(() => { /* keep null; flat-search will operate on whatever's loaded */ });
  };

  return {
    thisProject,
    demo: demoItems || [],
    demoLoading,
    mine,
    mineGroups,
    snapgeneCategories,
    snapgeneCategoryItems,
    loadSnapgeneCategory,
    snapgeneFlat,
    ensureSnapgeneFlat,
    indexReady: !!index,
    libraryHydrated: !!_libraryHydrated,
  };
}

function libraryEntryToCatalogItem(entry, source) {
  return {
    id: entry.id,
    name: entry.name,
    description: entry.payload?.description || '',
    length: entry.payload?.length || entry.payload?.sequence?.length || 0,
    topology: entry.payload?.topology || 'linear',
    annotations: entry.payload?.annotations || [],
    sequence: entry.payload?.sequence || '',
    organism: entry.payload?.organism || '',
    _tags: Array.isArray(entry.tags) ? entry.tags : [],
    _folderPath: typeof entry.folderPath === 'string' ? entry.folderPath : '',
    _badge: source === 'mine' ? 'mine' : source === 'project' ? 'project' : source,
    _source: source,
  };
}
