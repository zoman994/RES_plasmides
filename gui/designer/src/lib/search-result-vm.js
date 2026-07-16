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

function bestOccurrence(occurrences) {
  let best = null;
  for (const o of occurrences || []) {
    const p = metricPercent(o.metrics);
    if (best === null || (p ?? -1) > (metricPercent(best.metrics) ?? -1)) best = o;
  }
  return best;
}

/**
 * @param {Object} result — a SearchResult (from runSearch)
 * @param {Object} doc — its SearchDocument
 * @returns {{ id, title, subtitle, nameHighlights, reason, reasonLabel, metrics,
 *   metricsText, strengthPct, locationCount, topology, seq }}
 */
export function resultRowViewModel(result, doc) {
  const id = result?.entityRef?.id ?? doc?.ref?.id ?? '';
  const title = doc?.title || id;
  const matches = result?.matches || [];

  const nameM = matches.find((m) => m.dimension === 'name');
  const nameHighlights = nameM
    ? nameM.highlights.filter((h) => h.field === 'name').map((h) => ({ start: h.start, end: h.end }))
    : [];

  const primary = result?.primaryMatchId;
  const reason = primary && primary !== 'name' ? primary : null;

  const seqM = matches.find((m) => m.dimension === 'sequence')
    || matches.find((m) => m.dimension === 'protein')
    || matches.find((m) => m.dimension === 'enzyme');
  let metrics = null;
  let metricsText = '';
  let strengthPct = null;
  let locationCount = 0;
  let occurrence = null; // best occurrence — carries location for the P3 jump
  let proteinExplain = ''; // the flagship "how it was derived" line (aa: hits only)
  let enzymeExplain = ''; // the enzyme explanation line (re: hits only)
  if (seqM) {
    locationCount = (seqM.occurrences || []).length;
    const best = bestOccurrence(seqM.occurrences);
    occurrence = best || null;
    metrics = best ? best.metrics : null;
    // A protein hit carries `occurrence.protein` — word it in amino-acid terms
    // (never «нт»); an enzyme hit carries `occurrence.enzyme` — word it as a site.
    if (best && best.protein) {
      metricsText = metrics ? formatProteinMetrics(metrics) : '';
      proteinExplain = formatProteinExplain(best.protein);
    } else if (best && best.enzyme) {
      metricsText = metrics ? formatEnzymeMetrics(metrics) : '';
      enzymeExplain = formatEnzymeExplain(best.enzyme);
    } else {
      metricsText = metrics ? formatSeqMetrics(metrics) : '';
    }
    strengthPct = metrics ? metricPercent(metrics) : null;
  }

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
