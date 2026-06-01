/**
 * feature-dedup — promote-time duplicate check for common features
 * (SPEC_COMMON_FEATURES DEC-CF-04). Split out of feature-match-core
 * (Игорь 01.06.2026): the extracted engine was already 25.3 KB, at the .js
 * hard budget, so this dedup helper lives next to it and IMPORTS its
 * primitives (`dnaIdentity`, `PROTEIN_PATHWAY_TYPES`) — «дедуп = детекция»
 * still holds by construction: one scoring fn, the same protein-pathway
 * gating and RC-awareness the detector uses, no second identity machine.
 */
import { reverseComplement as revComp } from '../sequence-utils';
import { dnaIdentity, PROTEIN_PATHWAY_TYPES } from './feature-match-core';

// Mirror of detectCommonFeatures' gates: 0.96 default DNA identity
// (options.identityThreshold) and the 0.90 protein fuzzy floor; the
// protein-pathway entry gate is `feat.protein.length >= 10` + type ∈
// PROTEIN_PATHWAY_TYPES (identical to the detector's CDS branch).
export const PROTEIN_FUZZY_THRESHOLD = 0.90;
const MIN_PROTEIN_LEN = 10;

function isProteinPathway(f) {
  return !!(f && PROTEIN_PATHWAY_TYPES.has(f.type)
    && typeof f.protein === 'string' && f.protein.length >= MIN_PROTEIN_LEN);
}

function normName(n) {
  return String(n || '').trim().toLowerCase();
}

function nameCollides(a, b) {
  const na = normName(a?.name);
  return !!na && na === normName(b?.name);
}

/**
 * Does `candidate` already exist as `existing` in the common-feature DB?
 * Identity convention mirrors the detector (DEC-CF-04):
 *   - both protein-pathway (+ protein ≥10 aa) → protein identity ≥0.90 → by:'protein'
 *   - else → DNA identity on BOTH strands (RC-aware) ≥ threshold → by:'dna'
 *   - PSO mismatch but matching name → by:'name', matches:false (warning signal)
 *
 * @param {object} candidate — { name, type, sequence?, protein? }
 * @param {object} existing  — same shape (a merged-DB feature)
 * @param {{threshold?:number}} [opts] — DNA identity threshold (default 0.96)
 * @returns {{matches:boolean, identity:number, by:'dna'|'protein'|'name'|'none'}}
 */
export function featureMatchesExisting(candidate, existing, { threshold = 0.96 } = {}) {
  if (!candidate || !existing) return { matches: false, identity: 0, by: 'none' };

  // Protein pathway: compare the two oriented proteins directly. Both are
  // the feature's own translation (same frame), so no 6-frame search is
  // needed for a pair — just the same exact/fuzzy convention the detector
  // applies after it locates the frame.
  if (isProteinPathway(candidate) && isProteinPathway(existing)) {
    const id = candidate.protein === existing.protein
      ? 1
      : dnaIdentity(candidate.protein, existing.protein);
    if (id >= PROTEIN_FUZZY_THRESHOLD) return { matches: true, identity: id, by: 'protein' };
    if (nameCollides(candidate, existing)) return { matches: false, identity: id, by: 'name' };
    return { matches: false, identity: id, by: 'protein' };
  }

  // DNA pathway: ≥threshold identity on either strand (RC-aware), same as
  // the detector's non-CDS [seq, rc] scan.
  const cs = String(candidate.sequence || '').toUpperCase();
  const es = String(existing.sequence || '').toUpperCase();
  if (cs && es) {
    const id = Math.max(dnaIdentity(cs, es), dnaIdentity(cs, revComp(es)));
    if (id >= threshold) return { matches: true, identity: id, by: 'dna' };
    if (nameCollides(candidate, existing)) return { matches: false, identity: id, by: 'name' };
    return { matches: false, identity: id, by: 'dna' };
  }

  // No comparable PSO on either side — fall back to name only.
  if (nameCollides(candidate, existing)) return { matches: false, identity: 0, by: 'name' };
  return { matches: false, identity: 0, by: 'none' };
}

/**
 * Aggregate `featureMatchesExisting` over the merged DB. Returns the first
 * true PSO-duplicate (block) or, failing that, the first name-collision
 * (warning). Used by the slice's promote action and the modal pre-check so
 * both share the dedup verdict.
 *
 * @returns {{ duplicate:boolean, match:object|null, by:string|null, against:object|null }}
 */
export function checkDuplicateAgainst(candidate, mergedList, opts = {}) {
  let nameHit = null;
  for (const existing of (mergedList || [])) {
    const r = featureMatchesExisting(candidate, existing, opts);
    if (r.matches) return { duplicate: true, match: r, by: r.by, against: existing };
    if (r.by === 'name' && !nameHit) nameHit = { match: r, against: existing };
  }
  if (nameHit) {
    return { duplicate: false, match: nameHit.match, by: 'name', against: nameHit.against };
  }
  return { duplicate: false, match: null, by: null, against: null };
}
