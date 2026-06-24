/**
 * gene-exon-spans — pure geometry for the «вариант A» intron rendering: a
 * gene/CDS bar is drawn as exon BLOCKS (solid) separated by dashed intron
 * connectors. Given the gene's visible window on a line and its intron spans,
 * `exonSegments` returns the exon (gap) intervals in absolute coordinates,
 * clipped to the window and with overlapping introns merged.
 *
 * @param {number} visStart — gene's visible start on the line (absolute)
 * @param {number} visEnd — gene's visible end on the line (absolute, exclusive)
 * @param {Array<[number,number]>} intronSpans — absolute [start,end) intron intervals
 * @returns {Array<[number,number]>} exon intervals (absolute), left→right
 */
export function exonSegments(visStart, visEnd, intronSpans) {
  if (!(visEnd > visStart)) return [];
  const clipped = (intronSpans || [])
    .map((s) => [Math.max(visStart, s[0]), Math.min(visEnd, s[1])])
    .filter((s) => s[1] > s[0])
    .sort((a, b) => a[0] - b[0]);
  // merge overlapping / touching introns
  const merged = [];
  for (const s of clipped) {
    const last = merged[merged.length - 1];
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else merged.push([s[0], s[1]]);
  }
  const exons = [];
  let pos = visStart;
  for (const [s, e] of merged) {
    if (s > pos) exons.push([pos, s]);
    pos = Math.max(pos, e);
  }
  if (pos < visEnd) exons.push([pos, visEnd]);
  return exons;
}
