/**
 * Pure statistics over an alignment's per-column classification.
 *
 * `columns` is the array produced by `align-pairwise.js`; each entry has a
 * `status` of 'match' | 'mismatch' | 'gapA' | 'gapB'. Identity is computed over
 * the FULL alignment length (matches / columns) — including gaps. This stays
 * honest for unrelated sequences: a tiny coincidental match region inside a
 * gap-dominated alignment must NOT read as ~100%. (Terminal reference overhangs
 * never reach `columns` — semiglobal traceback already trims them — so there is
 * nothing to discount here.)
 */

export function computeAlignmentStats(columns) {
  const n = columns.length;
  let matches = 0;
  let mismatches = 0;
  let gaps = 0;
  for (let i = 0; i < n; i++) {
    const s = columns[i].status;
    if (s === 'match') matches += 1;
    else if (s === 'mismatch') mismatches += 1;
    else gaps += 1;
  }
  const identity = n > 0 ? (matches / n) * 100 : 0;
  return { matches, mismatches, gaps, alignedLength: n, coreLength: n, identity };
}
