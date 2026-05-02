/**
 * Length-pattern parser for CatalogColumn search input (M-B.2 K2).
 * Ported 1:1 from v0.5 ImportStartScreen/CatalogPanel.jsx exports.
 *
 * Recognises:
 *   `>5kb`  / `> 5 kb`  / `>5к`  → { min: 5000 }
 *   `<2k`   / `< 2 kb`           → { max: 2000 }
 *   `2k-3k` / `2 kb – 3 kb`      → { min: 2000, max: 3000 }
 * Bare digits (`100`) match plain text instead of length.
 */
const LENGTH_RE_GT = /^>\s*(\d+)\s*(k|kb|кб)?$/i;
const LENGTH_RE_LT = /^<\s*(\d+)\s*(k|kb|кб)?$/i;
const LENGTH_RE_RANGE = /^\s*(\d+)\s*(k|kb|кб)?\s*[-–]\s*(\d+)\s*(k|kb|кб)?\s*$/i;

export function parseLengthPattern(query) {
  if (!query) return null;
  const q = query.trim();
  let m = q.match(LENGTH_RE_GT);
  if (m) return { min: Number(m[1]) * (m[2] ? 1000 : 1) };
  m = q.match(LENGTH_RE_LT);
  if (m) return { max: Number(m[1]) * (m[2] ? 1000 : 1) };
  m = q.match(LENGTH_RE_RANGE);
  if (m) return {
    min: Number(m[1]) * (m[2] ? 1000 : 1),
    max: Number(m[3]) * (m[4] ? 1000 : 1),
  };
  return null;
}

/**
 * Apply CatalogColumn search filter to a flat item list. Length pattern wins
 * over text match when the query matches one of the recognised forms.
 */
export function applyCatalogFilter(items, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return items;
  const lp = parseLengthPattern(query);
  if (lp) {
    return items.filter((it) => {
      const len = it.length || it.sequence?.length || 0;
      if (lp.min != null && len < lp.min) return false;
      if (lp.max != null && len > lp.max) return false;
      return true;
    });
  }
  return items.filter((it) =>
    (it.name || '').toLowerCase().includes(q) ||
    (it.description || '').toLowerCase().includes(q),
  );
}
