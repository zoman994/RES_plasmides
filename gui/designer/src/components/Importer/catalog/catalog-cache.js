/**
 * SnapGene catalog fetch cache (M-B.2 K2). Module-level so that opening the
 * Importer twice in one session doesn't re-download the same JSON.
 *
 * MAX_CATALOG_LENGTH = 20000 culls oversize plasmids (corona genome, large
 * viral expression vectors, etc.) — same threshold as v0.5 ImportStartScreen
 * Polish FIX 28.04.2026, kept here verbatim. Out-of-band hits (raised limit)
 * stay viable through a UI toggle in a future Settings sprint.
 *
 * Public API:
 *   fetchIndex()                 → /plasmids-index.json (cached)
 *   fetchCategory(slug)          → /plasmids-data/<slug>.json (filtered + cached)
 *   prefetchAllCategories(index) → flat cache of every catalog category
 *   __resetCachesForTest()       → wipe between test runs
 */

export const MAX_CATALOG_LENGTH = 20000;

let _indexCache = null;
const _categoryCache = {};
let _flatCache = null; // { items: [{...plasmid, _badge, _slug}], builtAt }

export function __resetCachesForTest() {
  _indexCache = null;
  for (const k of Object.keys(_categoryCache)) delete _categoryCache[k];
  _flatCache = null;
}

export async function fetchIndex() {
  if (_indexCache) return _indexCache;
  const res = await fetch('/plasmids-index.json');
  if (!res.ok) throw new Error(`index fetch ${res.status}`);
  _indexCache = await res.json();
  return _indexCache;
}

export async function fetchCategory(slug) {
  if (_categoryCache[slug]) return _categoryCache[slug];
  const res = await fetch(`/plasmids-data/${slug}.json`);
  if (!res.ok) throw new Error(`category fetch ${slug}`);
  const raw = await res.json();
  const filtered = (raw.plasmids || []).filter(
    (p) => (p.length || p.sequence?.length || 0) <= MAX_CATALOG_LENGTH,
  );
  const data = { ...raw, plasmids: filtered };
  _categoryCache[slug] = data;
  return data;
}

export async function prefetchAllCategories(index) {
  if (_flatCache) return _flatCache;
  const cats = index?.categories || [];
  const results = await Promise.all(cats.map(async (c) => {
    try {
      const data = await fetchCategory(c.slug);
      return (data.plasmids || []).map((p) => ({ ...p, _badge: c.name || c.slug, _slug: c.slug }));
    } catch {
      return [];
    }
  }));
  _flatCache = { items: results.flat(), builtAt: Date.now() };
  return _flatCache;
}
