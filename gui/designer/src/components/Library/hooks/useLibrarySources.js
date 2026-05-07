import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../../store';
import { fetchIndex, fetchCategory, prefetchAllCategories } from '../lib/catalog-cache';

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

  // Snappier category opening (biolog: «когда там 300+ плазмид,
  // открывается с явной задержкой»). Two improvements over the old
  // one-shot setState:
  //
  //   1. CHUNKED SET — instead of dropping all ~300 items into state
  //      at once (which forces React to mount ~300 ItemRow nodes +
  //      their PlasmidMiniMap SVGs in one frame), we land the first
  //      INITIAL_CHUNK rows immediately and append the rest via
  //      requestIdleCallback / setTimeout fallback. The list visibly
  //      grows over ~2 frames but the user sees the first dozen rows
  //      and a usable scroll surface in <50 ms.
  //
  //   2. PREFETCH — `prefetchSnapgeneCategory(slug)` exposes the
  //      fetch-only path (no setState). CatalogColumn calls it on
  //      mouse-enter of a category header, so by the time the user
  //      actually clicks, the JSON is already in the catalog-cache
  //      and `loadSnapgeneCategory` only pays the chunked-render cost.
  // Smaller first chunk so the click → first-paint is sub-frame even
  // when the JSON parse just finished. Subsequent chunks are larger
  // because by then the user is already scrolling and we want the
  // tail to land quickly.
  const INITIAL_CHUNK = 20;
  const NEXT_CHUNK = 60;
  const idleSchedule = (cb) => {
    if (typeof requestIdleCallback === 'function') return requestIdleCallback(cb, { timeout: 100 });
    return setTimeout(cb, 0);
  };

  const prefetchSnapgeneCategory = (slug) => {
    if (!slug) return;
    if (snapgeneCategoryItems[slug] !== undefined) return;
    // Fire-and-forget — the catalog-cache layer dedups concurrent
    // fetches, so multiple hovers don't multiply network hits.
    fetchCategory(slug).catch(() => { /* ignore — load will retry */ });
  };

  const loadSnapgeneCategory = (slug) => {
    if (snapgeneCategoryItems[slug] !== undefined) return;
    fetchCategory(slug).then((cat) => {
      const all = (cat.plasmids || []).map((p) => ({
        ...p, _badge: cat.name || slug, _source: 'snapgene', _slug: slug,
      }));
      if (all.length === 0) {
        setSnapgeneCategoryItems((prev) => ({ ...prev, [slug]: [] }));
        return;
      }
      // First chunk — synchronous, so the first paint shows real
      // rows instead of an empty group.
      const first = all.slice(0, INITIAL_CHUNK);
      setSnapgeneCategoryItems((prev) => ({ ...prev, [slug]: first }));
      if (all.length <= INITIAL_CHUNK) return;
      // Remaining chunks — landed during idle frames so the user can
      // already scroll / interact while the rest fills in.
      let cursor = INITIAL_CHUNK;
      const tick = () => {
        const end = Math.min(all.length, cursor + NEXT_CHUNK);
        const next = all.slice(0, end);
        setSnapgeneCategoryItems((prev) => ({ ...prev, [slug]: next }));
        cursor = end;
        if (cursor < all.length) idleSchedule(tick);
      };
      idleSchedule(tick);
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
    prefetchSnapgeneCategory,
    snapgeneCategories,
    snapgeneCategoryItems,
    loadSnapgeneCategory,
    snapgeneFlat,
    ensureSnapgeneFlat,
    indexReady: !!index,
    libraryHydrated: !!_libraryHydrated,
  };
}

// Reverted 2026-05-06 from a WeakMap ITEM_CACHE keyed on entry identity.
// The cache was correct in theory (Immer/Zustand swap the whole entry
// reference when its content changes, so cached builds for unchanged
// entries should reuse) but biolog reported that newly imported items
// stopped appearing in «Моя библиотека» after the cache landed —
// pointing at a real-world reference-equality edge I couldn't pin down
// in the time-to-fix budget. Building a fresh item per call is cheap
// (a small object literal) and the catalog row count caps in the low
// thousands. ItemRow's `React.memo` still helps via shallow prop diffs.
function libraryEntryToCatalogItem(entry, source) {
  return buildCatalogItem(entry, source);
}

function buildCatalogItem(entry, source) {
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
