/**
 * homologs — rank library entries by sequence homology to a reference, for the
 * align workspace's «Найти похожие» suggestion (Игорь: при одном выбранном
 * сиквенсе предложить самые гомологичные из библиотеки). Thin wrapper over the
 * existing `searchLibrary` (lib/sequence-search.js) — one best hit per entry,
 * ranked by query-identity.
 */
import { searchLibrary } from '../sequence-search';
import { buildMinimizerIndex, rankByMinimizers } from '../minimizer-index';

/**
 * @param {string} refSeq — reference nucleotide sequence (query).
 * @param {Array<{id:string,name?:string,sequence:string}>} entries — library entries.
 * @param {{excludeId?:string, limit?:number, minIdentity?:number}} [opts]
 * @returns {Array<{entryId:string, name?:string, identity:number}>} sorted by
 *          identity (0..1) descending, best hit per entry, capped to `limit`.
 */
export function rankHomologs(refSeq, entries, opts = {}) {
  const {
    excludeId = null, limit = 8, minIdentity = 0,
    // Permissive gate so partial homologs surface (the point of the feature);
    // `searchLibrary`'s default threshold is tuned for exact-ish lookups.
    searchThreshold = 0.5,
  } = opts;
  const seq = typeof refSeq === 'string' ? refSeq.trim() : '';
  if (seq.length < 8 || !Array.isArray(entries)) return [];

  const candidates = entries
    .filter((e) => e && e.id !== excludeId && typeof e.sequence === 'string' && e.sequence.length >= 8)
    .map((e) => ({ id: e.id, sequence: e.sequence }));
  if (candidates.length === 0) return [];

  // For LARGE libraries, pre-filter with the minimizer index (§A6) so the
  // expensive seed-and-extend only runs on the top sketch-overlap candidates.
  // Small libraries skip this (exact, unchanged behaviour). A generous keep
  // (≥32 or 4× limit) means true homologs survive the sketch.
  const prefilterThreshold = opts.prefilterThreshold ?? 40;
  let searchable = candidates;
  if (opts.prefilter !== false && candidates.length > prefilterThreshold) {
    const index = buildMinimizerIndex(candidates, { k: 12, w: 8 });
    const top = rankByMinimizers(index, seq, { excludeId, limit: Math.max(32, limit * 4) });
    const keep = new Set(top.map((t) => t.entryId));
    if (keep.size) searchable = candidates.filter((c) => keep.has(c.id));
  }

  const hits = searchLibrary(seq, searchable, { identityThreshold: searchThreshold }) || [];
  // keep the strongest hit per entry (queryIdentity preferred — it's normalised
  // to the query length, the right «how much of my reference matched» metric).
  const best = new Map();
  for (const h of hits) {
    const id = h.entryId;
    if (id == null) continue;
    const idn = h.queryIdentity != null ? h.queryIdentity : (h.identity || 0);
    if (!best.has(id) || idn > best.get(id)) best.set(id, idn);
  }

  const nameById = new Map(entries.map((e) => [e.id, e.name]));
  return [...best.entries()]
    .map(([entryId, identity]) => ({ entryId, name: nameById.get(entryId), identity }))
    .filter((r) => r.identity >= minIdentity)
    .sort((a, b) => b.identity - a.identity || String(a.name || '').localeCompare(String(b.name || '')))
    .slice(0, Math.max(0, limit));
}
