/**
 * re-single-cut — when EXACTLY ONE restriction enzyme is the active digest
 * definition AND it cuts the molecule EXACTLY ONCE, the biolog can linearize the
 * whole plasmid at that site and use the WHOLE linear fragment (Игорь 07.07:
 * «при выборе одного сайта, должна быть возможность использования всего линейного
 * фрагмента»).
 *
 * Before this, the linearize option appeared ONLY when the unique site was CLICKED
 * (firstRESite); picking the same enzyme from the dropdown force-routed to the gel
 * (a single full-length band = a clunky detour). The helper unifies both entry
 * points: click OR dropdown, one unique cut → linearize.
 *
 * A committed PAIR (reParams), ≥2 cuts, or ≥2 picked enzymes → null: a multi-cutter
 * fragments the plasmid, so the biolog MUST pick the band off the gel, and a pair is
 * an excision, not a linearize (bio-invariant: linearizing a multi-cutter is wrong).
 *
 * NB — the returned `position` is provenance ONLY: segmentOverhangs derives a
 * single-cut fragment's overhangs from the ENZYME (both ends carry the same site),
 * not from the position, and the confirm records the whole molecule [0, len]. So a
 * recognition-start position from the unique-cutter scan is a perfectly good record.
 *
 * @param {object}   p
 * @param {{enzyme:string, position:number}|null} p.firstRESite  clicked single site
 * @param {string[]} p.pickedEnzymes  enzymes chosen from the dropdown
 * @param {object|null} p.reParams    a committed two-enzyme excision (→ not single)
 * @param {Array<{enzyme:string, pos:number}>} p.uniqueSites  unique-cutter scan
 * @param {number}   p.cutCount       distinct cut positions of the active enzyme(s)
 * @returns {{enzyme:string, position:number}|null}
 */
export function resolveSingleLinearizeCut({
  firstRESite, pickedEnzymes, reParams, uniqueSites, cutCount,
} = {}) {
  if (reParams) return null; // a committed pair = excision, not a linearize
  if (cutCount !== 1) return null; // 0 cuts = no reaction; ≥2 = fragments → gel
  const picked = Array.isArray(pickedEnzymes) ? pickedEnzymes : [];
  // A clicked single site (no dropdown enzymes overriding it).
  if (firstRESite && picked.length === 0) {
    return { enzyme: firstRESite.enzyme, position: firstRESite.position };
  }
  // A single enzyme picked from the dropdown — resolve its one cut position from the
  // unique-cutter scan (only unique cutters appear there, so membership doubles as a
  // guard: a name that isn't a unique cutter yields null).
  if (picked.length === 1) {
    const name = picked[0];
    const site = (uniqueSites || []).find((u) => u.enzyme === name);
    if (site) return { enzyme: name, position: site.pos };
  }
  return null;
}
