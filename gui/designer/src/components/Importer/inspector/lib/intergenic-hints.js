import { getRegions } from '../../../../annotation-model';

/**
 * Compute intergenic gaps for a parsed item — used by MetaColumn origin-rotate
 * helper to tell the biolog where they can safely re-anchor without splitting
 * a feature. Extracted from v0.5 ImportStartScreen/index.jsx::originHints.
 *
 * Returns a comma-joined `start–end` string of up to 4 gaps ≥30 bp wide,
 * or '' when nothing useful to hint.
 */
export function computeIntergenicHints(parsedItem) {
  if (!parsedItem) return '';
  const seqLen = parsedItem.length || parsedItem.sequence?.length || 0;
  if (!seqLen) return '';
  const regions = getRegions(parsedItem.annotations || [])
    .slice()
    .sort((a, b) => a.start - b.start);
  if (!regions.length) return '';

  const gaps = [];
  let cursor = 0;
  for (const r of regions) {
    if (r.start > cursor + 30) gaps.push(`${cursor + 1}–${r.start}`);
    if (r.end > cursor) cursor = r.end;
  }
  if (seqLen > cursor + 30) gaps.push(`${cursor + 1}–${seqLen}`);
  return gaps.slice(0, 4).join(', ');
}
