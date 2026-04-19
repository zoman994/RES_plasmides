/**
 * Junction state utilities.
 */

/**
 * Reset junction fields to only those relevant for `newType`.
 * Preserves id and overlap geometry (overlapLength/overlapMode/autoMode/calcMode/tmTarget);
 * drops enzyme/overhang fields from the prior type so they cannot leak into rendering
 * or primer design after a type switch.
 *
 * Rules:
 *  - golden_gate       → enzyme='BsaI' default, overhang=''
 *  - ligation/re_ligation → reEnzyme preserved (if any); enzyme mirrored from reEnzyme
 *    (JunctionDNA reads j.enzyme — keep in sync)
 *  - overlap/kld/phosphorylated → no enzyme/overhang fields at all
 *
 * @param {Object} j — current junction
 * @param {string} newType — target type
 * @returns {Object} — new junction object (does not mutate input)
 */
export function resetJunctionForType(j, newType) {
  const base = {
    id: j.id,
    overlapLength: j.overlapLength,
    overlapMode: j.overlapMode,
    autoMode: j.autoMode,
    calcMode: j.calcMode,
    tmTarget: j.tmTarget,
    type: newType,
  };

  if (newType === 'golden_gate') {
    return { ...base, enzyme: 'BsaI', overhang: '' };
  }
  if (newType === 'ligation' || newType === 're_ligation') {
    const re = j.reEnzyme || '';
    return { ...base, reEnzyme: re, enzyme: re };
  }
  // overlap / kld / phosphorylated — no enzyme/overhang fields
  return base;
}
