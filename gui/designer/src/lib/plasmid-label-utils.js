/**
 * plasmid-label-utils — shared, coordinate-system-independent logic for
 * picking & truncating feature-arc labels on plasmid mini maps.
 *
 * Extracted verbatim from PlasmidMiniMap.jsx (V66) so the canvas
 * ContainerBlock mini map (MiniPlasmidMap.jsx) reuses the SAME
 * label-selection / truncation rules instead of duplicating them.
 * Geometry/placement stays in each map (different polar conventions).
 */

export const LABEL_LENGTH_THRESHOLD_BP = 300; // every region ≥300 bp gets a label
export const LABEL_RELATIVE_MIN_FRAC = 0.03;  // on small vectors, 3% floor so short
                                              // promoters/terminators are labelled too
export const LABEL_MAX_COUNT = 12;            // cap for huge multi-kb plasmids
export const LABEL_MAX_CHARS = 14;            // truncate long noun-phrase names
export const LABEL_TYPE_BLACKLIST = new Set([ // GenBank metadata covering full plasmid
  'source',
]);

export function truncateLabel(s) {
  if (!s) return '';
  if (s.length <= LABEL_MAX_CHARS) return s;
  return `${s.slice(0, Math.max(1, LABEL_MAX_CHARS - 1))}…`;
}

/**
 * pickRegionsForLabels — filter regions worth a visible label:
 * length ≥ min(300 bp, 3% of total), not in the type blacklist; then
 * the N longest (cap LABEL_MAX_COUNT). Pure, convention-independent.
 */
export function pickRegionsForLabels(regions, totalLen) {
  const safeTotal = Math.max(1, totalLen || 0);
  const threshold = Math.min(
    LABEL_LENGTH_THRESHOLD_BP,
    Math.max(1, Math.floor(safeTotal * LABEL_RELATIVE_MIN_FRAC)),
  );
  return (regions || [])
    .filter((r) => {
      const len = (r.end || 0) - (r.start || 0);
      if (len < threshold) return false;
      if (LABEL_TYPE_BLACKLIST.has(r.type)) return false;
      return true;
    })
    .slice()
    .sort((a, b) => (b.end - b.start) - (a.end - a.start))
    .slice(0, LABEL_MAX_COUNT);
}
