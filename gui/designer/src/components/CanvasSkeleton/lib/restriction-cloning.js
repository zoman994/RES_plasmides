/**
 * restriction-cloning — S3 (V163). Pure. Surfaces the restriction-ligation
 * chemistry of an assembly's RE-cut fragments, derived (no schema, no stored
 * state) from each segment's two enzymes + their overhangs:
 *
 *  1. DIRECTIONALITY / SELF-LIGATION (NEB two-mechanism background model):
 *     a fragment whose two ends carry DIFFERENT overhangs ligates directionally
 *     and the vector can't recircularise; SAME overhangs → non-directional →
 *     self-ligation risk → dephosphorylate the vector (Quick CIP / rSAP /
 *     Antarctic). This mirrors digest()'s isDirectional/selfLigationRisk
 *     (restriction-db.js) exactly: sameOverhang = same seq AND same polarity.
 *  2. DOUBLE-DIGEST STAGING: two different enzymes that don't share buffer +
 *     temperature can't co-digest → sequential. Reuses checkDoubleDigest.
 *
 * Read-only: never touches stored ranges / tails / the product (bio-safe).
 */
import { segmentOverhangs } from './segment-overhangs.js';
import { checkDoubleDigest, scanAllSites, getCompatible, generateRETail, effectiveEnzymes } from '../../../restriction-db.js';

/**
 * The restriction-cloning plan for ONE RE-cut segment. null for non-restriction.
 * @returns {{
 *   enzymes: [string, string],
 *   doubleDigest: { simultaneous:boolean, sequential:boolean, warnings:string[] } | null,
 *   directional: boolean,
 *   selfLigationRisk: boolean,
 *   recommendDephosphorylation: boolean,
 *   message: string|null,
 * } | null}
 */
export function segmentRestrictionPlan(segment, reEnzymes) {
  const oh = segmentOverhangs(segment, reEnzymes);
  if (!oh || !oh.left || !oh.right) return null;
  const e1 = oh.left.enzyme;
  const e2 = oh.right.enzyme;

  // Two DISTINCT enzymes → check they can be co-digested (same buffer + temp).
  const dd = (e1 && e2 && e1 !== e2) ? checkDoubleDigest(e1, e2) : null;

  // Directional ⟺ the two cohesive ends differ (seq OR polarity). Same overhang
  // (incl. two blunt ends) → non-directional → the backbone can self-ligate.
  const directional = (oh.left.seq !== oh.right.seq) || (oh.left.type !== oh.right.type);
  const selfLigationRisk = !directional;

  let message = null;
  if (dd && !dd.simultaneous) {
    message = `Разные условия дайджеста (${e1} / ${e2}) — режьте последовательно`;
  } else if (selfLigationRisk) {
    message = 'Одинаковые концы — риск самолигирования: дефосфорилируйте вектор (Quick CIP / rSAP)';
  }

  return {
    enzymes: [e1, e2],
    doubleDigest: dd ? { simultaneous: dd.simultaneous, sequential: !dd.simultaneous, warnings: dd.warnings } : null,
    directional,
    selfLigationRisk,
    recommendDephosphorylation: selfLigationRisk,
    message,
  };
}

/**
 * Roll up every RE-cut segment's plan into one assembly summary (shape parallel
 * to assemblyEndChemistry / assemblyReadiness). Pure.
 * @returns {{ sequentialDigestCount:number, dephosphorylationCount:number,
 *   perSegment:Object, message:string|null }}
 */
export function assemblyRestrictionCloning(segments, reEnzymes) {
  const segs = Array.isArray(segments) ? segments : [];
  const perSegment = {};
  let sequentialDigestCount = 0;
  let dephosphorylationCount = 0;

  for (const s of segs) {
    const plan = segmentRestrictionPlan(s, reEnzymes);
    if (!plan || !s) continue;
    perSegment[s.id] = plan;
    if (plan.doubleDigest && plan.doubleDigest.sequential) sequentialDigestCount += 1;
    if (plan.recommendDephosphorylation) dephosphorylationCount += 1;
  }

  const parts = [];
  if (sequentialDigestCount > 0) parts.push(`${sequentialDigestCount}: последовательный дайджест`);
  if (dephosphorylationCount > 0) parts.push(`${dephosphorylationCount}: дефосфорилировать вектор (CIP/rSAP)`);
  return {
    sequentialDigestCount,
    dephosphorylationCount,
    perSegment,
    message: parts.length ? parts.join(' · ') : null,
  };
}

/**
 * RC-A1 — «продолжить теми же рестриктазами». Given the enzymes that cut the
 * PREVIOUS fragment and the source sequence of the fragment being added, decide
 * how to keep enzyme continuity for the new seam. Pure; RE_ENZYMES only (the
 * classical Type II db — never Golden Gate / Type IIS, per bio-invariants).
 *
 * Buckets per previous enzyme:
 *   • sameUsable      — the SAME enzyme is a UNIQUE cutter of the next fragment
 *                       (cuts once → clean cohesive end, the preferred continuation).
 *   • compatibleUsable— the same enzyme is absent, but a compatible-overhang
 *                       UNIQUE cutter (same sticky end, ligatable) DOES cut → offer it.
 *                       Blunt prev enzymes match ANY blunt unique cutter present
 *                       (all blunt ends are mutually ligatable).
 *   • sameMultiCut    — the same enzyme cuts the next fragment but >1× → it can't
 *                       define a clean end (shreds the fragment); surfaced as an
 *                       amber «needs gel», NOT a green continuation. Review RC-A1.
 *   • absent          — none of the above → add the site with a primer RE-tail
 *                       (generateRETail) so the fragment can still be ligated.
 *
 * Uniqueness gate (RC-A1 review): an enzyme with internal recognition sites is
 * biologically unusable for directional ligation, so it must NOT be green-lit.
 * Scanning goes through scanAllSites (≥6 bp recognition, skips Dpn/Mbo 4-cutters)
 * so the suggestions match the picker's own «unique cutters» universe.
 *
 * @param {{ prevEnzymes?: string[], nextSeq?: string, circular?: boolean }} args
 * @returns {{
 *   hasAnyPrev: boolean,
 *   sameUsable: Array<{enzyme, cutCount, isUnique, positions, overhang, end}>,
 *   compatibleUsable: Array<{enzyme, compatibleWith, cutCount, isUnique, positions, overhang, end}>,
 *   sameMultiCut: Array<{enzyme, cutCount}>,
 *   absent: Array<{enzyme, tail}>,
 * }}
 */
export function suggestEnzymesForNextFragment({ prevEnzymes, nextSeq, circular = false } = {}) {
  const prev = Array.from(new Set((Array.isArray(prevEnzymes) ? prevEnzymes : []).filter(Boolean)));
  const out = { hasAnyPrev: prev.length > 0, sameUsable: [], compatibleUsable: [], sameMultiCut: [], absent: [] };
  if (!prev.length || !nextSeq || typeof nextSeq !== 'string') return out;

  const enzymesDict = effectiveEnzymes();
  const scan = scanAllSites(nextSeq, { circular });
  const scanMap = new Map();
  for (const s of scan) scanMap.set(s.enzyme, s);

  const entry = (s, extra = {}) => ({
    enzyme: s.enzyme,
    cutCount: s.cutCount,
    isUnique: s.isUnique,
    positions: s.positions,
    overhang: s.overhang,
    end: s.end,
    ...extra,
  });

  const seenCompat = new Set();
  // RC-BIO-1 — which prior enzymes the next fragment CAN match (same or compatible).
  const coveredPrev = new Set();
  for (const E of prev) {
    const hit = scanMap.get(E);
    if (hit) {
      // Only a UNIQUE cut is a clean continuation; a multi-cutter needs a gel.
      if (hit.isUnique) { out.sameUsable.push(entry(hit)); coveredPrev.add(E); }
      else out.sameMultiCut.push({ enzyme: E, cutCount: hit.cutCount });
      continue;
    }
    // Same enzyme absent → a compatible-overhang UNIQUE cutter that cuts here.
    // Blunt prev → any blunt unique cutter qualifies (getCompatible returns [] for
    // blunt, but all blunt ends are mutually ligatable).
    const isBlunt = !!(enzymesDict[E] && enzymesDict[E].end === 'blunt');
    const candidates = isBlunt
      ? scan.filter((s) => s.end === 'blunt' && s.isUnique).map((s) => s.enzyme)
      : getCompatible(E);
    let foundCompat = false;
    for (const C of candidates) {
      if (prev.includes(C) || seenCompat.has(C)) continue;
      const ch = scanMap.get(C);
      if (ch && ch.isUnique) {
        out.compatibleUsable.push(entry(ch, { compatibleWith: E }));
        seenCompat.add(C);
        foundCompat = true;
      }
    }
    if (foundCompat) coveredPrev.add(E);
    else out.absent.push({ enzyme: E, tail: generateRETail(E) });
  }

  // RC-BIO-1 — DIRECTIONALITY. The previous fragment was cut DIRECTIONALLY when its
  // enzymes give ≥2 DISTINCT overhangs (a different cohesive end at each flank). If
  // the next fragment can match only SOME of those ends, digesting it with the
  // available subset leaves the SAME overhang on both ends → non-directional → the
  // vector self-religates (must dephosphorylate) and the insert drops in either
  // orientation. Flag it so the banner can't green-light a partial pair silently.
  const overhangKey = (E) => {
    const info = enzymesDict[E];
    return info ? `${info.overhang || ''}|${info.end || ''}` : `?${E}`;
  };
  const prevDistinctOverhangs = new Set(prev.map(overhangKey));
  out.prevEnzymes = prev;
  out.uncovered = prev.filter((E) => !coveredPrev.has(E));
  out.directionalRisk = prevDistinctOverhangs.size >= 2 && out.uncovered.length > 0;

  return out;
}
