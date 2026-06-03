/**
 * AnnotationTrack label/identity helpers — extracted from AnnotationTrack.jsx
 * (decomp P1, size-budget; bodies byte-for-byte unchanged).
 */

/** Stable identity for a region — matches the rect React keys
 *  (`region.id || start:end`). V132: used to dedup the label of an
 *  origin-crossing feature across the real + wrap halves. */
export function regionKey(r) {
  return r.id || (r.start + ":" + r.end);
}

/** Approximate the on-screen width of a label string in characters. */
export function labelLengthChars(name, region) {
  if (!name) return 0;
  const span = region.end - region.start;
  // Append "(span)" for features wider than 12 nt — matches SnapGene.
  // V132: partial names (`*_part_X-Y`) already carry their range, so the
  // track doesn't append «(span)»; don't count it in the width estimate.
  return (span > 12 && !name.includes("_part_")) ? `${name} (${span})`.length : name.length;
}
