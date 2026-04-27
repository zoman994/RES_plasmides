/**
 * SessionSummary entry helpers (ImportStartScreen single-file mode).
 *
 * V41 mini-fix-2 — repeat clicks on `Аннотировать` for the same fragment
 * spammed the session log with `+0 регионов` rows even when no new regions
 * were found. `appendSessionEntry` dedupes annotate-action entries by name:
 *   - regionsAdded === 0 → keep the prior entry, drop the new one
 *   - regionsAdded > 0  → replace the prior entry with the fresh delta
 * canvas / library entries pass through unchanged.
 */
export function appendSessionEntry(prev, entry) {
  if (entry.action === 'annotate') {
    const idx = prev.findIndex(
      (p) => p.action === 'annotate' && p.name === entry.name,
    );
    if (idx >= 0) {
      if ((entry.regionsAdded ?? 0) === 0) return prev;
      const next = prev.slice();
      next[idx] = entry;
      return next;
    }
  }
  return [...prev, entry];
}
