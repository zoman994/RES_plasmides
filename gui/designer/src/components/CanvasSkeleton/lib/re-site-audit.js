/**
 * re-site-audit — uniqueness check for the RE enzymes chosen in the picker
 * (Игорь visual-acceptance 21.06.2026: «не хватает проверки уникальности
 * сайтов, если сайтов больше двух — предупреждать»).
 *
 * A clean double digest needs each chosen enzyme to cut exactly where the
 * fragment ends are and NOWHERE else. Extra sites of a chosen enzyme make
 * the excised fragment ambiguous (you'd get >2 pieces), so the picker warns.
 * Circular-aware (origin-straddling sites count once via findSitesInSequence).
 */
import { effectiveEnzymes } from '../../../restriction-db';
import { restrictionBreakKey, scanOccurrences } from '../../../lib/restriction-occurrence';

export function auditReSites(sequence, enzymes, circular = false, reEnzymes = null) {
  const list = [...new Set((enzymes || []).filter(Boolean))];
  const seq = sequence || '';
  const catalog = reEnzymes || effectiveEnzymes();
  // `total` counts DISTINCT cut POSITIONS, not (enzyme × site) pairs: two enzymes
  // whose cut lands on the SAME phosphodiester bond is ONE break, not two (Игорь
  // 22.06: «место реза этих рестриктаз совпадает → на деле 1 разрез»). Use the
  // canonical occurrence's physical top-strand cut, matching the displayed and
  // downstream digest coordinates for either strand and circular boundaries.
  const occurrences = scanOccurrences(seq, {
    circular: !!circular,
    enzymes: catalog,
    names: list,
  });
  const perEnzyme = list.map((enzyme) => ({
    enzyme,
    count: occurrences.filter((occurrence) => occurrence.enzyme === enzyme).length,
  }));
  const cuts = new Map();
  for (const occurrence of occurrences) {
    if (!Number.isFinite(occurrence.topCut)) continue;
    const atPosition = cuts.get(occurrence.topCut) || [];
    atPosition.push(occurrence);
    cuts.set(occurrence.topCut, atPosition);
  }
  const geometryConflicts = [];
  for (const [position, atPosition] of cuts) {
    const geometries = new Set(atPosition.map(restrictionBreakKey));
    if (geometries.size > 1) {
      geometryConflicts.push({
        position,
        enzymes: [...new Set(atPosition.map((occurrence) => occurrence.enzyme))],
      });
    }
  }
  const total = cuts.size;
  // A clean 2-cut excision uses two DISTINCT cut positions (one per end). If any
  // single enzyme cuts more than twice, or the chosen enzymes together break the
  // molecule at more than two positions, the digest is not unique.
  const ambiguous = perEnzyme.some((p) => p.count > 2)
    || total > 2
    || geometryConflicts.length > 0;
  // The enzymes that contribute the ambiguity (cut more than once).
  const conflictingEnzymes = new Set(geometryConflicts.flatMap((conflict) => conflict.enzymes));
  const offenders = perEnzyme.filter((p) => p.count > 1 || conflictingEnzymes.has(p.enzyme));
  return {
    perEnzyme, total, ambiguous, offenders, geometryConflicts,
  };
}
