/**
 * end-chemistry — S2 (V162). Pure. Two things, both DERIVED (no schema, no stored
 * state): (1) the native 5′-phosphate state of a fragment's ends, keyed on HOW it
 * was physically obtained; (2) the per-junction END PLAN — what each primer tail
 * must carry and whether the seam needs exogenous phosphorylation.
 *
 * Load-bearing invariant (NEB cloning canon): a restriction cut ALWAYS leaves a
 * 5′-phosphate; PCR products (from standard primers) and synthesised / raw
 * cursor-selected dsDNA ship 5′-OH. Ligation needs a 5′-phosphate to seal — so a
 * blunt/KLD ligation of two 5′-OH ends can't close without T4 PNK, whereas any
 * restriction end already carries its phosphate.
 *
 * NOTE: tails are ALREADY built by the junction layer (primer-derive keys on the
 * junction method, not the fragment's acquisitionMethod), so this module does NOT
 * re-derive tails — it only DESCRIBES what each end needs, to surface it. It never
 * touches stored ranges / tail strings / the product sequence (bio-invariants).
 */
import { pairKeyFor } from './junction-derive.js';

// Junction methods/kinds grouped by how they treat the fragment ends.
const OVERLAP_METHODS = new Set(['overlap_pcr', 'gibson', 'overlap']);
const RESTRICTION_METHODS = new Set(['restriction', 're_ligation']);
// Blunt-family ligations join the ends AS-IS, so they need a 5′-phosphate present.
const BLUNT_LIGATION_METHODS = new Set(['kld', 'ligation', 'direct_ligation', 'direct', 'blunt']);

const PROTECTIVE_DEFAULT = 6; // NEB fallback when an enzyme has no measured minFlanking

/**
 * Does this fragment carry a NATIVE 5′-phosphate on its ends? Keyed on the
 * acquisition method: restriction cut → yes; pcr / ov-pcr / synthesis / cursor
 * (undefined) / anything else → no (5′-OH).
 * @param {{acquisitionMethod?: string}|null} segment
 * @returns {boolean}
 */
export function fragmentFivePrimePhosphate(segment) {
  return !!segment && segment.acquisitionMethod === 'restriction';
}

function minFlankingOf(enzyme, reEnzymes) {
  const e = enzyme && reEnzymes && reEnzymes[enzyme];
  return e && Number.isFinite(e.minFlanking) ? e.minFlanking : PROTECTIVE_DEFAULT;
}

/**
 * The end plan for ONE seam joining `leftSeg`'s RIGHT end to `rightSeg`'s LEFT end
 * via `method` (+ `enzyme` for RE/GG). Returns both sides plus a junction-level
 * phosphorylation verdict.
 *
 * Phosphorylation is a JUNCTION property (NEB "≥1 phosphate to ligate"): a
 * blunt-family seam where BOTH ends ship 5′-OH cannot seal → flag T4 PNK. A
 * restriction/overlap/GG seam never needs it (RE cut makes the phosphate; overlap/
 * GG ends are reworked, not ligated raw).
 *
 * @returns {{
 *   left: EndSidePlan, right: EndSidePlan,
 *   needsPhosphorylation: boolean, ready: boolean, message: string|null,
 * }}
 * where EndSidePlan = { needsTail:'overlap'|'re-site'|'gg-site'|null, has5P:boolean,
 *                       protectiveBases:number, ready:boolean }
 */
export function junctionEndPlan(leftSeg, rightSeg, method, enzyme, reEnzymes) {
  const m = String(method || '');
  const isOverlap = OVERLAP_METHODS.has(m);
  const isRestriction = RESTRICTION_METHODS.has(m);
  const isGG = m === 'golden_gate';
  const isBlunt = BLUNT_LIGATION_METHODS.has(m);
  const protective = isRestriction ? minFlankingOf(enzyme, reEnzymes) : 0;
  const enzymeNeeded = isRestriction || isGG;

  const sidePlan = (seg) => {
    let needsTail = null;
    if (isOverlap) needsTail = 'overlap';
    else if (isRestriction) needsTail = 're-site';
    else if (isGG) needsTail = 'gg-site';
    return {
      needsTail,
      has5P: fragmentFivePrimePhosphate(seg),
      protectiveBases: needsTail === 're-site' ? protective : 0,
      ready: enzymeNeeded ? !!enzyme : true,
    };
  };

  const left = sidePlan(leftSeg);
  const right = sidePlan(rightSeg);
  const needsPhosphorylation = isBlunt && !left.has5P && !right.has5P;
  const ready = left.ready && right.ready;

  let message = null;
  if (needsPhosphorylation) {
    message = 'Оба конца 5′-OH — фосфорилируйте хотя бы один (T4 PNK) перед лигированием';
  } else if (!ready) {
    message = isGG ? 'Выберите фермент Golden Gate' : 'Выберите фермент рестрикции';
  }
  return { left, right, needsPhosphorylation, ready, message };
}

/**
 * Roll the per-junction end plans across a whole assembly draft into one summary,
 * shaped to merge with assemblyReadiness. `perSegment[id] = { left, right }` gives
 * each fragment's two facing ends (left = the previous seam's right side, right =
 * the next seam's left side) so a row can badge them. Pure.
 *
 * @returns {{ needsPhosphorylationCount:number, unresolvedTailCount:number,
 *   perSegment:Object, message:string|null }}
 */
export function assemblyEndChemistry(segments, zoneJunctions = {}, assemblyMethod = null, reEnzymes = {}, closure = null) {
  const segs = Array.isArray(segments) ? segments : [];
  const perSegment = {};
  let needsPhosphorylationCount = 0;
  let unresolvedTailCount = 0;

  const ensure = (id) => { if (!perSegment[id]) perSegment[id] = { left: null, right: null }; };
  const applySeam = (a, b, method, enzyme) => {
    const plan = junctionEndPlan(a, b, method, enzyme, reEnzymes);
    if (plan.needsPhosphorylation) needsPhosphorylationCount += 1;
    if (!plan.ready) unresolvedTailCount += 1;
    ensure(a.id); ensure(b.id);
    perSegment[a.id].right = { ...plan.left, junctionMethod: method, needsPhosphorylation: plan.needsPhosphorylation };
    perSegment[b.id].left = { ...plan.right, junctionMethod: method, needsPhosphorylation: plan.needsPhosphorylation };
  };

  for (let i = 0; i < segs.length - 1; i += 1) {
    const a = segs[i];
    const b = segs[i + 1];
    if (!a || !b) continue;
    const cfg = (zoneJunctions && zoneJunctions[pairKeyFor(a.id, b.id)]) || {};
    applySeam(a, b, cfg.method || assemblyMethod || 'overlap_pcr', cfg.enzyme || null);
  }

  // CH-3 — the ring-closure (last→first) / single-fragment self-closure seam was
  // NEVER evaluated (the loop stops at segs.length-1), so a blunt/KLD-closed ring
  // undercounted 5′-OH junctions by one (and a lone self-closing PCR fragment by
  // all of them → the T4-PNK phosphorylation warning silently never fired). When
  // the caller marks the assembly circular (`closure` truthy), evaluate it too.
  // `closure` = { method?, enzyme? } | truthy; falls back to the closure-pair
  // junction config, then assemblyMethod. Linear assemblies pass null → unchanged.
  if (closure && segs.length >= 1) {
    const first = segs[0];
    const last = segs[segs.length - 1];
    if (first && last) {
      const cfg = (zoneJunctions && zoneJunctions[pairKeyFor(last.id, first.id)]) || {};
      const c = (typeof closure === 'object') ? closure : {};
      applySeam(last, first, c.method || cfg.method || assemblyMethod || 'overlap_pcr', c.enzyme || cfg.enzyme || null);
    }
  }

  let message = null;
  if (needsPhosphorylationCount > 0) {
    message = `${needsPhosphorylationCount} стык(ов) 5′-OH — нужно фосфорилирование (T4 PNK)`;
  } else if (unresolvedTailCount > 0) {
    message = `${unresolvedTailCount} стык(ов) без выбранного фермента`;
  }
  return {
    needsPhosphorylationCount, unresolvedTailCount, perSegment, message,
  };
}
