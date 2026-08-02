/**
 * search-ranker — WHICH locus is the best one, and in WHAT order the molecules appear (U5.1).
 *
 * The search dropdown is a LOCATOR/RANKER, not an alignment viewer (SPEC §5.3.1): one molecule is
 * one row, showing its best confirmed occurrence and how many other loci exist. This module is the
 * whole decision, and nothing else in it: no JSX, no store, no i18n, no engine. Pure functions over
 * the `SearchResult[]` a session already produced.
 *
 * WHAT IT REPLACES. Two different answers to «which one is best» existed, and neither was the spec:
 *   • `search-result-vm.js` picked `max(float percent)`, first-wins. Two loci at the same percentage
 *     were therefore resolved by ARRAY ORDER — i.e. by the order the scanner happened to emit them,
 *     which is not a rule anyone can defend to a biologist.
 *   • `library-search.js` ordered ROWS by `[dimension, relation, title.toLowerCase()]`, so a 100 %
 *     hit sorted below an 87 % one whenever the title came earlier in the alphabet.
 *
 * Everything decidable here is decided on INTEGERS. A percentage is a rendering; `identityBps`
 * (= floor(10000·M/L)) is the sort key, and the identity ratio inside the comparator is compared by
 * cross multiplication. No float ever decides an ordering.
 *
 * RULE 7 IS DECIDED UPSTREAM, NOT HERE. The §3.2 comparator ends with a lexical tiebreak on the
 * edit script, and U4 forbids shipping scripts past the worker (the compact `SearchHitSummary`
 * carries `location` + `metrics` only). The answer is NOT to invent a replacement rule out of what
 * did survive — strand or start would be a new biological claim: at one locus with identical
 * metrics, `+` = `X=====` against `−` = `=====X`, rule 7 says MINUS (`=` sorts before `X`) while
 * «prefer +» says the other strand. Instead `toSearchHitSummaries` sorts by the full comparator
 * while the scripts still exist, so the ORDER it emits IS rule 7's verdict; `pickBestOccurrence`
 * keeps the earlier element and the winner crosses the boundary without the script. Inside this
 * module a visible tie therefore stays a tie, and between ROWS it falls through to `entityRefKey`
 * exactly as §5.3.1 prescribes.
 */
import { isPhysicalLocus, countPhysicalLoci } from './search-locus-envelope';
// §3.2 over facade-shaped occurrences lives in its own leaf, shared with the sequence trust
// boundary: the validator must re-derive the same rules to refuse a forged `bestIndex`, and two
// copies would eventually disagree about which locus is canonical.
import { compareSummaryOccurrence, pickBestOccurrence, scored } from './search-occurrence-order';

export { compareSummaryOccurrence, pickBestOccurrence };

/**
 * The dimensions that answer a BIOLOGICAL question — `seq:` / `aa:` / `re:` (P1-1). When one of
 * them answered, it owns the locus; see `locusOccurrences`.
 */
const PROVIDER_DIMENSIONS = new Set(['sequence', 'protein', 'enzyme']);

/**
 * The loci of the dimensions `keep` accepts — the window, how many exist, and which one is canonical
 * (P1-2 / P1-3).
 *
 * All three are READ, never re-derived. Each match arrives as a locus envelope whose `locationCount`
 * was measured before that dimension's own cap and whose `bestIndex` was decided where §3.2 rule 7
 * could still run; the compact boundary dropped the edit script, so nothing here could recompute
 * either. Summing counts and carrying the declared winner is the whole job.
 *
 * The winner is taken only from a dimension that DECLARED one. An uncapped provider says −1, which
 * is «no verdict», not «index 0» — those two collapse only if you guess, and guessing is what put a
 * feature span in front of a His-tag.
 */
function occurrencesOf(res, keep) {
  const occurrences = [];
  let total = 0;
  let declaredBest = null;
  for (const m of (res && res.matches) || []) {
    if (!keep(m && m.dimension)) continue;
    const kept = (m && m.occurrences) || [];
    if (declaredBest === null && Number.isInteger(m.bestIndex) && m.bestIndex >= 0 && m.bestIndex < kept.length) {
      declaredBest = kept[m.bestIndex];
    }
    for (const o of kept) if (isPhysicalLocus(o)) occurrences.push(o);
    total += Number.isSafeInteger(m.locationCount) && m.locationCount >= 0
      ? m.locationCount : countPhysicalLoci(kept);
  }
  return { occurrences, total, declaredBest };
}

/**
 * The PLACES on this molecule that answer the query (P1-1).
 *
 * A mixed query — `ampR aa:HHHHHH`, `lacZalpha re:EcoRI` — makes two different dimensions produce
 * coordinates: the feature the term matched, and the locus the provider found. Pooling them was
 * wrong in both directions:
 *   • WHICH ONE OPENS. `protein-match` / `re-match` build SeqMetrics-shaped metrics with no
 *     `alignmentLength`, so §3.2 sees them as unscored — exactly like a feature span. Unscored ties
 *     unscored, `pickBestOccurrence` keeps the earlier element, and the metadata dimensions are
 *     filled by `matchTerm` BEFORE the providers are injected. So the feature always won, and the
 *     biologist who asked where the His-tag sits was handed the whole ampR CDS instead.
 *   • HOW MANY. The feature span was counted as one more place on the DNA: the row claimed two
 *     locations for one His-tag, and two sites for one EcoRI site.
 *
 * So: if a biological provider answered, it OWNS both. The feature stays a fallback — a plain
 * `lacZalpha` query, with nobody biological to answer, must still open lacZ.
 */
function locusOccurrences(res) {
  const provider = occurrencesOf(res, (d) => PROVIDER_DIMENSIONS.has(d));
  if (provider.occurrences.length) return provider;
  return occurrencesOf(res, (d) => !PROVIDER_DIMENSIONS.has(d));
}

/**
 * Rank one session's results into rows: one molecule, one row (SPEC §5.3.1).
 *
 * Order:
 *   1. CONFIRMED rows before pending ones. A metadata candidate still awaiting its biological
 *      check must never outrank a confirmed hit, however good its provisional numbers look —
 *      «100 %, probably» above «81 %, verified» would be a lie in the biologist's favour.
 *   2. within a group, `identityBps` descending (integer);
 *   3. then the full §3.2 comparator on the two BEST occurrences;
 *   4. then `entityRefKey` ascending — a stable name, so the list never reshuffles between two
 *      renders of the same session.
 * A row with no occurrences at all (a pure name/tag hit) has no identity and sorts after every
 * row that has one, but it is NOT dropped: the molecule genuinely matched.
 *
 * Pure: the input array and every result in it are left untouched, and each row's `best` is a
 * REFERENCE to the caller's occurrence, not a copy.
 *
 * @param {Array<object>} results — `SearchSession.results`
 * @param {{docMeta?: Map<string, {length?:number, circular?:boolean}>}} [opts] — per-entity
 *   molecule facts, keyed by `entityKey`. The SAME shape the worker client already builds with
 *   `toDocMeta`, so a caller that has one can hand it straight over. Supplying it is what makes the
 *   two circular endpoint cases decidable (see `physicalEnd`); without it every other rule still
 *   applies, and only a hit ending exactly on the origin can be mis-ordered.
 * @returns {Array<{entityKey:string, entityRef:object, best:object|null, locationCount:number,
 *   identityBps:number|null, confirmed:boolean, result:object}>}
 */
export function rankSearchRows(results, opts = {}) {
  if (!Array.isArray(results) || results.length === 0) return [];
  const docMeta = opts.docMeta instanceof Map ? opts.docMeta : null;
  const metaFor = (key) => {
    const m = docMeta && docMeta.get(key);
    return m ? { circular: m.circular, sequenceLength: m.length } : undefined;
  };
  const rows = results.map((res) => {
    // `best` is the best PLACE on the molecule, so only physical occurrences can win it. A metadata
    // match (a name hit, an enzyme card) carries no coordinates — handing one to the jump would send
    // the biologist to a locus that does not exist. No physical occurrence ⇒ no locus ⇒ null.
    // Which dimension may supply them at all is `locusOccurrences`'s decision (P1-1); how many of
    // them the caps let through, versus how many exist, is its `total` (P1-2).
    const { occurrences: occs, total, declaredBest } = locusOccurrences(res);
    // A DECLARED winner wins outright: it was chosen where the edit script still existed, so it
    // carries §3.2 rule 7 — which `pickBestOccurrence` cannot see and can therefore only get right
    // by luck. Re-deciding here would silently overrule the one place that had the evidence.
    // Falling back is for uncapped providers and the metadata fallback, which declare nothing.
    const best = declaredBest || pickBestOccurrence(occs, metaFor(res.entityKey));
    return {
      entityKey: res.entityKey,
      entityRef: res.entityRef,
      best,
      locationCount: total,
      identityBps: scored(best) ? best.metrics.identityBps : null,
      meta: metaFor(res.entityKey),
      confirmed: !res.providerPending,
      result: res,
    };
  });
  rows.sort((a, b) => {
    if (a.confirmed !== b.confirmed) return a.confirmed ? -1 : 1;
    const ia = a.identityBps; const ib = b.identityBps;
    if (ia === null || ib === null) {
      if (ia !== ib) return ia === null ? 1 : -1;
    } else if (ia !== ib) {
      return ib - ia;
    }
    const byOcc = a.best && b.best ? compareSummaryOccurrence(a.best, b.best, a.meta, b.meta) : 0;
    if (byOcc !== 0) return byOcc;
    return String(a.entityKey) < String(b.entityKey) ? -1 : String(a.entityKey) > String(b.entityKey) ? 1 : 0;
  });
  return rows;
}
