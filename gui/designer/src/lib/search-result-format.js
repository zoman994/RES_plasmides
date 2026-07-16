/**
 * search-result-format — honest, human metric strings for a sequence hit (P2).
 *
 * The whole point of the bio-meaning search is trustworthy numbers. For a concrete
 * query we report IDENTITY; for a degenerate (IUPAC) query identity is undefined, so
 * we report COMPATIBILITY and spell out how many bases matched literally vs only via
 * an ambiguity code — never dressing an ambiguous hit up as «100% identity». Pure.
 */
import { t, tf } from '../i18n';

/** The strength number to colour by: identity if known, else compatibility. */
export function metricPercent(m) {
  if (!m) return null;
  return m.identity == null ? (m.compatibility ?? null) : m.identity;
}

/**
 * @param {Object} m — SeqMetrics
 * @returns {string} e.g. «90% идентичность · 18/20 точных · 2 несовп.» or
 *   «100% совместимость · 14/20 точных · 6 неоднозн.»
 */
export function formatSeqMetrics(m) {
  if (!m) return '';
  const len = m.length || 0;
  const parts = [];
  if (m.identity != null) {
    parts.push(tf('search.metric.identity', { pct: Math.round(m.identity * 100) }));
    if (m.mismatches) {
      parts.push(
        tf('search.metric.exact', { exact: m.exactMatches, length: len }),
        tf('search.metric.mismatches', { count: m.mismatches }),
      );
    } else parts.push(tf('search.metric.nucleotides', { length: len }));
    if (m.indels) parts.push(tf('search.metric.indels', { count: m.indels }));
  } else {
    parts.push(tf('search.metric.compatibility', { pct: Math.round((m.compatibility ?? 0) * 100) }));
    parts.push(tf('search.metric.exact', { exact: m.exactMatches, length: len }));
    if (m.uncertainMatches) parts.push(tf('search.metric.ambiguous', { count: m.uncertainMatches }));
    if (m.mismatches) parts.push(tf('search.metric.mismatches', { count: m.mismatches }));
  }
  return parts.join(' · ');
}

/**
 * Protein-worded headline for an aa: hit — counts AMINO ACIDS, never «нт». A
 * protein hit is exact aa identity (synonymous DNA differences don't matter), so
 * the honest number is aa-space, not nucleotide.
 * @param {Object} m — SeqMetrics (aa-space)
 */
export function formatProteinMetrics(m) {
  if (!m) return '';
  const len = m.length || 0;
  const pct = Math.round(((m.identity ?? m.compatibility) ?? 0) * 100);
  const parts = [tf('search.metric.proteinMatch', { pct }), `${len} aa`];
  if (m.uncertainMatches) parts.push(`${m.uncertainMatches}×X`);
  return parts.join(' · ');
}

function exonWord(n) {
  const a = Math.abs(n) % 100;
  const b = n % 10;
  if (a >= 11 && a <= 14) return t('search.protein.exon.many');
  if (b === 1) return t('search.protein.exon.one');
  if (b >= 2 && b <= 4) return t('search.protein.exon.few');
  return t('search.protein.exon.many');
}

/**
 * The explainability line — the flagship differentiator. Spells out WHERE the
 * peptide is and HOW it was derived so the biolog can trust the hit:
 * «glaA · обратная цепь · 117–146 aa · рамка 1 · 3 экзона · интрон исключён».
 * @param {Object} p — occurrence.protein metadata from protein-match
 */
export function formatProteinExplain(p) {
  if (!p) return '';
  const parts = [];
  if (p.cdsName) parts.push(p.cdsName);
  parts.push(t(p.strand === -1 ? 'search.protein.reverseStrand' : 'search.protein.forwardStrand'));
  if (p.aaStart != null && p.aaEnd != null) parts.push(`${p.aaStart}–${p.aaEnd} aa`);
  parts.push(tf('search.protein.frame', { frame: (p.frame ?? 0) + 1 }));
  if (p.exonCount > 1) parts.push(`${p.exonCount} ${exonWord(p.exonCount)}`);
  if (p.intronExcluded) parts.push(t('search.protein.intronExcluded'));
  if (p.nonStandardCode) parts.push(tf('search.protein.geneticCode', { code: p.geneticCode }));
  return parts.join(' · ');
}

/** Short honesty tag for an enzyme hit — IUPAC sites are compatibility, not identity. */
export function formatEnzymeMetrics(m) {
  if (!m) return '';
  return m.identity == null ? t('search.enzyme.iupacSite') : '';
}

/**
 * The enzyme explanation line (P5): name · recognition site · overhang/end · Type IIS.
 * «EcoRI · GAATTC · 5′-выступ AATT» / «EcoRV · GATATC · тупой конец» / «BsaI · GGTCTC · Type IIS».
 * @param {Object} e — occurrence.enzyme metadata from re-match
 */
export function formatEnzymeExplain(e) {
  if (!e) return '';
  const parts = [];
  if (e.name) parts.push(e.name);
  if (e.site) parts.push(e.site);
  if (e.typeIIS) {
    parts.push('Type IIS');
  } else if (e.end === '5prime' && e.overhang) {
    parts.push(tf('search.enzyme.overhang5', { overhang: e.overhang }));
  } else if (e.end === '3prime' && e.overhang) {
    parts.push(tf('search.enzyme.overhang3', { overhang: e.overhang }));
  } else if (e.end === 'blunt') {
    parts.push(t('search.enzyme.blunt'));
  }
  return parts.join(' · ');
}
