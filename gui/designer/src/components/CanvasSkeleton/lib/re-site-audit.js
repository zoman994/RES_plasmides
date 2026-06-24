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
import { findSitesInSequence, effectiveEnzymes } from '../../../restriction-db';

export function auditReSites(sequence, enzymes, circular = false) {
  const list = [...new Set((enzymes || []).filter(Boolean))];
  const seq = sequence || '';
  const eff = effectiveEnzymes();
  const len = seq.length || 1;
  // `total` counts DISTINCT cut POSITIONS, not (enzyme × site) pairs: two enzymes
  // whose cut lands on the SAME phosphodiester bond is ONE break, not two (Игорь
  // 22.06: «место реза этих рестриктаз совпадает → на деле 1 разрез»). The cut
  // position is recognition-start + cut[0] — the app-wide V155 convention that
  // flattenSites / reCutLayout already use, so this matches what's displayed.
  const cuts = new Set();
  const perEnzyme = list.map((e) => {
    const sites = findSitesInSequence(e, seq, !!circular);
    const c0 = (eff[e] && Array.isArray(eff[e].cut)) ? eff[e].cut[0] : 0;
    for (const s of sites) cuts.add(((s.position + c0) % len + len) % len);
    return { enzyme: e, count: sites.length };
  });
  const total = cuts.size;
  // A clean 2-cut excision uses two DISTINCT cut positions (one per end). If any
  // single enzyme cuts more than twice, or the chosen enzymes together break the
  // molecule at more than two positions, the digest is not unique.
  const ambiguous = perEnzyme.some((p) => p.count > 2) || total > 2;
  // The enzymes that contribute the ambiguity (cut more than once).
  const offenders = perEnzyme.filter((p) => p.count > 1);
  return { perEnzyme, total, ambiguous, offenders };
}
