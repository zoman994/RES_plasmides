/**
 * search-result-vm — flatten a SearchResult (+ its SearchDocument) into the exact
 * shape SmartResultRow renders (P2). Keeps the row component presentational and the
 * mapping (which dim is primary, which occurrence is the best, the honest metric
 * string) tested here. Pure.
 */
import {
  metricPercent, formatSeqMetrics, formatProteinMetrics, formatProteinExplain,
  formatEnzymeMetrics, formatEnzymeExplain,
} from './search-result-format';
import { pickBestOccurrence } from './search-ranker';
import { locusSummary } from './search-locus-summary';
import { t } from '../i18n';

/** Locale keys for the reason chip on a non-name match. */
export const REASON_LABELS = Object.freeze({
  tag: 'search.reason.tag',
  feature: 'search.reason.feature',
  type: 'search.reason.type',
  status: 'search.reason.status',
  sequence: 'search.reason.sequence',
  protein: 'search.reason.protein',
  enzyme: 'search.reason.enzyme',
});

// «Best» is a SPEC §3.2 decision, not a local heuristic — see `search-ranker.js`. This used to be
// `max(float percent)`, first-wins, so two loci at the same percentage were resolved by the order
// the scanner happened to emit them (U5.1).
const bestOccurrence = pickBestOccurrence;

/**
 * @param {Object} result — a SearchResult (from runSearch)
 * @param {Object} doc — its SearchDocument
 * @returns {{ id, title, subtitle, nameHighlights, reason, reasonLabel, metrics,
 *   metricsText, strengthPct, locationCount, topology, seq }}
 */
/**
 * Word ONE occurrence — the only place that turns a locus into row text.
 *
 * A protein hit carries `occurrence.protein` and must read in amino-acid terms (never «нт»); an
 * enzyme hit carries `occurrence.enzyme` and reads as a site; everything else is DNA identity.
 * Shared so the ranked and the legacy view model cannot describe the same locus differently.
 */
function describeOccurrence(best) {
  const metrics = best ? best.metrics || null : null;
  let metricsText = '';
  let proteinExplain = '';
  let enzymeExplain = '';
  if (best && best.protein) {
    metricsText = metrics ? formatProteinMetrics(metrics) : '';
    proteinExplain = formatProteinExplain(best.protein);
  } else if (best && best.enzyme) {
    metricsText = metrics ? formatEnzymeMetrics(metrics) : '';
    enzymeExplain = formatEnzymeExplain(best.enzyme);
  } else {
    metricsText = metrics ? formatSeqMetrics(metrics) : '';
  }
  return {
    metrics, metricsText, proteinExplain, enzymeExplain,
    strengthPct: metrics ? metricPercent(metrics) : null,
  };
}

/**
 * The row for a RANKED result (U5.2b). `row` is authoritative: the occurrence it carries is the one
 * `rankSearchRows` sorted the molecule by, chosen with the molecule's effective topology.
 *
 * The view model must NOT decide again. It has no topology here, so on a circle its answer can
 * legitimately differ — a hit ending exactly at the origin ends at 0 for the ranker and at `n` for a
 * meta-less picker — and the row would then be sorted by one locus and open another.
 *
 * @param {{result:object, best:object|null, locationCount:number, entityRef:object}} row
 * @param {Object} doc — the row's SearchDocument
 */
export function rankedResultRowViewModel(row, doc) {
  return buildRowViewModel(row?.result, doc, {
    best: row?.best || null,
    locationCount: Number.isFinite(row?.locationCount) ? row.locationCount : 0,
  });
}

/**
 * The row for an UNRANKED result — tree, picker, and any caller that has no ranked row. It makes
 * the pick itself, scoped to one dimension, and WITHOUT the molecule's topology; that is why the
 * dropdown does not use it (see `rankedResultRowViewModel`).
 */
export function resultRowViewModel(result, doc) {
  const matches = result?.matches || [];
  const seqM = matches.find((m) => m.dimension === 'sequence')
    || matches.find((m) => m.dimension === 'protein')
    || matches.find((m) => m.dimension === 'enzyme');
  return buildRowViewModel(result, doc, seqM
    ? { best: bestOccurrence(seqM.occurrences), locationCount: (seqM.occurrences || []).length }
    : { best: null, locationCount: 0 });
}

/**
 * The ONE row builder. Neutral about WHERE the locus came from: it is handed a `pick` and only
 * describes it. Neither public entry point re-decides inside here, so «the view model does not pick
 * again» is literally true rather than true-after-an-overwrite.
 *
 * @param {{best:object|null, locationCount:number}} pick
 */
function buildRowViewModel(result, doc, pick) {
  const id = result?.entityRef?.id ?? doc?.ref?.id ?? '';
  const title = doc?.title || id;
  const matches = result?.matches || [];

  const nameM = matches.find((m) => m.dimension === 'name');
  const nameHighlights = nameM
    ? nameM.highlights.filter((h) => h.field === 'name').map((h) => ({ start: h.start, end: h.end }))
    : [];

  const primary = result?.primaryMatchId;
  const reason = primary && primary !== 'name' ? primary : null;

  const occurrence = pick?.best || null; // the locus — carries `location` for the P3 jump
  const locationCount = Number.isFinite(pick?.locationCount) ? pick.locationCount : 0;
  const {
    metrics, metricsText, proteinExplain, enzymeExplain, strengthPct,
  } = describeOccurrence(occurrence);
  // U5-A — the ONE locus summary (strand, half-open coordinates incl. BOTH wrap segments, identity
  // from `identityBps`, M/L, X·I·D, gap events AND the physical locus count). Computed HERE, in the
  // pure layer, so the row component only prints it and the in-molecule popover prints the very same
  // object. `locationCount` goes IN rather than being formatted again beside the card: it is the
  // pre-cap count, and a second formatter is exactly how a surface ends up printing the window size.
  const locus = locusSummary(occurrence, { locationCount });

  return {
    id, //                                   RAW entity id (nav / onPick / testId)
    entityKey: result?.entityKey ?? id, //   composite `<kind>:<id>` (§10.4) — React key / dedup
    // The RAW entity ref drives kind-aware ROUTING (§10.4). NO default kind — a result with
    // a lost kind must fail CLOSED (resolveSearchPick → no-op), never be routed as an entry.
    entityRef: result?.entityRef ?? doc?.ref ?? null,
    title,
    refKind: result?.entityRef?.kind ?? doc?.ref?.kind ?? null, // display only (icon); null when kind is lost
    revision: doc?.ref?.revision ?? null, // stale-guard token for the P3 jump
    occurrence, //                          best sequence occurrence (location for the jump)
    subtitle: doc?.subtitle || '',
    nameHighlights,
    reason,
    reasonLabel: reason ? t(REASON_LABELS[reason] || reason) : null,
    metrics,
    locus, //                                null for a metadata / protein / enzyme hit (no alignment)
    metricsText,
    proteinExplain, //                       '' for non-protein hits
    enzymeExplain, //                        '' for non-enzyme hits
    strengthPct,
    locationCount,
    // S3-CLOSE K1 (P1-3): true = a metadata candidate still awaiting its biological confirmation
    // (partial phase). The row must render as VERIFIABLE, not confirmed, and must not be selectable
    // until the strict final either confirms it (false) or removes it.
    providerPending: !!result?.providerPending,
    topology: doc?.topology || doc?.sequence?.topology,
    seq: doc?.sequence?.seq || '',
  };
}
