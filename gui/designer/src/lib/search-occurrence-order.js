/**
 * search-occurrence-order — the §3.2 comparator over FACADE-shaped occurrences.
 *
 * Extracted from `search-ranker.js` (P1-2/P1-3) so the trust boundary and the ranker share ONE
 * definition of «which locus is canonical». The boundary has to re-derive the rules it can check in
 * order to refuse a forged `bestIndex`; the ranker uses them to pick a winner when nobody declared
 * one. Two copies of §3.2 would eventually disagree, and the disagreement would surface as a row
 * that opens a different locus than the one the engine certified — which is the whole class of
 * defect this work exists to close. The dependency also had to point this way round: a validator
 * that imported the ranker would make the boundary depend on a consumer.
 *
 * Everything decidable here is decided on INTEGERS — `identityBps` and cross-multiplied ratios. No
 * float ever decides an ordering.
 *
 * Pure leaf: one import, the kernel's own comparator, so a second drifting definition cannot exist.
 */
import { compareOccurrence } from './dna-gapped-occurrence';

/**
 * PHYSICAL end of a summary occurrence — the normative `physicalEndpoint` of SPEC §3.2.1, computed
 * on the facade shape.
 *
 * Two things it has to get right:
 *   • a hit that CROSSES the origin arrives as two ordered segments (`[4980,5000) + [0,30)`), and
 *     its physical end is 30, not 5000. Reading `segments[0].end` orders every wrapped hit as
 *     though it sat at the far end of the molecule.
 *   • on a circle the endpoint is taken modulo the molecule: a hit ending exactly AT the origin and
 *     a full-circle hit both end at **0**, not at `n`. That cannot be derived from the segments —
 *     the segment end IS `n`, and `n` is not in the payload — so the topology and the length travel
 *     with the comparison (U5.1.1). Without them the two degenerate cases are invisible, which is
 *     why `meta` is worth passing wherever the caller knows the molecule.
 *
 * @param {{circular?:boolean, sequenceLength?:number}} [meta]
 */
export function physicalEnd(o, meta) {
  const segs = o && o.location && o.location.segments;
  if (!Array.isArray(segs) || segs.length === 0) return 0;
  const last = segs[segs.length - 1];
  const raw = Number.isFinite(last && last.end) ? last.end : 0;
  const n = meta && meta.sequenceLength;
  if (!(meta && meta.circular) || !Number.isFinite(n) || n <= 0) return raw;
  return ((raw % n) + n) % n;
}

/** Has this occurrence the numbers the comparator needs at all? (protein/enzyme dims may not.) */
export function scored(o) {
  return !!(o && o.metrics && Number.isFinite(o.metrics.alignmentLength) && o.metrics.alignmentLength > 0);
}

/**
 * The §3.2 comparator over FACADE-shaped occurrences. Lower is better; `<0` ⇒ `a` wins.
 *
 * Delegates to the ONE implementation in `dna-gapped-occurrence.js` — the same code the kernel uses
 * for endpoint-shadow pruning — so a second, drifting definition of «canonical» cannot exist. Only
 * the two inputs the summary shape has to supply differ: each occurrence's own physical end
 * (rule 6), and a `script` that is absent on both sides (rule 7, see below).
 *
 * A metric-less occurrence loses to any scored one and ties with another metric-less one; it is
 * never compared numerically, because there is nothing to compare.
 */
export function compareSummaryOccurrence(a, b, metaA, metaB) {
  const sa = scored(a); const sb = scored(b);
  if (sa !== sb) return sa ? -1 : 1;
  if (!sa) return 0;
  // Each side is normalized against ITS OWN molecule. Comparing two ROWS means comparing loci on
  // two different plasmids, and a circular endpoint only means anything modulo the length of the
  // molecule it sits on — one shared `meta` silently applied A's topology to B (U5.1.1 corrective).
  return compareOccurrence(a, b, physicalEnd(a, metaA), physicalEnd(b, metaB === undefined ? metaA : metaB));
  // NOTHING BELOW RULE 7, deliberately. A visible tie stays a tie: the summary carries no script,
  // and a tiebreak invented from what it does carry would be a NEW biological rule rather than a
  // continuation of §3.2. Concretely — one locus, identical metrics, `+` = `X=====` and
  // `−` = `=====X`: rule 7 picks the MINUS strand (5′→3′, `=` sorts before `X`), while ranking `+`
  // first would hand the biologist the other strand. Rule 7's verdict crosses the boundary as the
  // engine's declared `bestIndex`, which is why this comparator may only ever REFUSE a declared
  // winner that loses on rules 1–6 — never overrule one that merely ties.
}

/**
 * The best occurrence of a molecule under SPEC §3.2 — percentage FIRST, then the canonical
 * tiebreak, and never the array position.
 *
 * @param {Array<{location:object, metrics?:object}>} occurrences
 * @param {{circular?:boolean, sequenceLength?:number}} [meta] the molecule these loci sit on —
 *   needed only for the two circular endpoint cases `physicalEnd` documents.
 * @returns {object|null} one of the given occurrences (same reference), or null for an empty list
 */
export function pickBestOccurrence(occurrences, meta) {
  if (!Array.isArray(occurrences) || occurrences.length === 0) return null;
  let best = occurrences[0];
  for (let i = 1; i < occurrences.length; i += 1) {
    if (compareSummaryOccurrence(occurrences[i], best, meta) < 0) best = occurrences[i];
  }
  return best;
}
