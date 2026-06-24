/**
 * re-site-filter.js (RS-B1) — the SINGLE RE-site visibility filter shared by the
 * circular map (PlasmidMapV2) and the linear SequenceView, so the two views can
 * never drift. Operates on scanAllSites' grouped result
 * ([{ enzyme, cutCount, isUnique, positions, ... }]) and returns the kept subset.
 *
 * Knobs:
 *   - enzymes (allow-list): keep only these enzymes — the digest filter and the
 *     «active set» (RS-C4). Empty/absent ⇒ no allow-list.
 *   - mode: cut-count visibility — 'all' | 'unique' (1 cut) | 'double' (≤2) |
 *     'ncut' (exactly `cutCount`).
 * Allow-list and mode COMPOSE (allow-list first, then cut-count).
 */
export function filterReSites(scanResults, { mode = 'all', cutCount = null, enzymes = null } = {}) {
  let out = Array.isArray(scanResults) ? scanResults : [];
  if (Array.isArray(enzymes) && enzymes.length > 0) {
    const set = new Set(enzymes);
    out = out.filter((s) => set.has(s.enzyme));
  }
  if (mode === 'unique') out = out.filter((s) => s.cutCount === 1);
  else if (mode === 'double') out = out.filter((s) => s.cutCount <= 2);
  else if (mode === 'cut2') out = out.filter((s) => s.cutCount === 2);
  else if (mode === 'ncut' && Number.isFinite(cutCount)) out = out.filter((s) => s.cutCount === cutCount);
  // 'all' / unknown → no cut-count filter
  return out;
}
