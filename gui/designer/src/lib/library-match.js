/**
 * library-match — pure library-entry matchers, the single source of truth for
 * «search the library by name OR by DNA-subsequence» + topology filtering.
 *
 * Extracted from LibrarySearchBar so lightweight consumers (e.g. the alignment
 * input panel) can reuse the SAME matching logic without importing the heavy
 * picker component (MiniPlasmidMap / tree-drag / picker-prefs). LibrarySearchBar
 * re-exports these for back-compat.
 */

export function matchesQuery(entry, q) {
  if (!q) return true;
  const qLower = q.toLowerCase();
  if (String(entry.name || '').toLowerCase().includes(qLower)) return true;
  const seq = String(entry.payload?.sequence || entry.sequence || '').toUpperCase();
  if (seq && seq.includes(q.toUpperCase())) return true;
  return false;
}

export function matchesType(entry, type) {
  if (!type || type === 'all') return true;
  const t = entry.payload?.topology
    || (entry.topology?.circular ? 'circular' : entry.topology);
  if (type === 'circular') return t === 'circular';
  if (type === 'linear') return t !== 'circular' && entry.kind !== 'oligonucleotide';
  if (type === 'primer') return entry.kind === 'oligonucleotide' || /primer/i.test(entry.name || '');
  return true;
}

/**
 * Entry-centric library grouping: split LibraryEntries into project /
 * collection / other-projects buckets (current-project entries INCLUDED).
 *
 * @param {Function} [matcher] — optional `(entry) => boolean` query predicate. When
 * given it REPLACES the built-in name/ATGC `matchesQuery` (the topology `typeFilter`
 * still applies on top). The assembly/canvas picker injects the smart metadata
 * matcher (`makeEntryMatcher`: name/tag/type/status/feature/qualifiers) here; a bare
 * call (e.g. the alignment panel) keeps the lightweight name+sequence behaviour.
 */
export function groupLibraryEntries({
  libraryEntries, currentProjectId, query, typeFilter, matcher,
}) {
  const matchQ = typeof matcher === 'function' ? matcher : (e) => matchesQuery(e, query);
  const all = (libraryEntries && typeof libraryEntries === 'object'
    ? Object.values(libraryEntries) : [])
    .filter((e) => e && !e._pendingDelete)
    .filter((e) => matchQ(e) && matchesType(e, typeFilter));
  const byName = (a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id));
  return {
    project: all.filter((e) => currentProjectId && e.projectId === currentProjectId).sort(byName),
    loose: all.filter((e) => !e.projectId).sort(byName),
    other: all.filter((e) => e.projectId && e.projectId !== currentProjectId).sort(byName),
  };
}
