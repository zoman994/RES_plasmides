/**
 * Adapter: a pairwise alignment result (from `align-pairwise.js`) → data keyed
 * to REFERENCE coordinates, so the read can be drawn as a track beneath the
 * reference rendered by the shared `SequenceView` (which owns annotations,
 * features, ruler, selection). Pure.
 *
 * The reference (sequence A) is the contiguous SequenceView sequence. The read
 * (sequence B) maps onto its columns:
 *   - match / mismatch → read base at that reference position
 *   - gapB (ref base, no read base) → deletion, shown as «-»
 *   - gapA (read base, no ref base) → insertion, collected as a run anchored
 *     AFTER the preceding reference position (drawn as a between-column marker)
 */
export function buildAlignToReference(result) {
  const cols = result?.columns || [];
  const start = result?.aStart ?? 0;
  const readByRefPos = {};
  const insertions = [];
  const mismatchRefPositions = [];
  let lastRefPos = start - 1;
  let aEnd = start;
  let curIns = null;

  for (const c of cols) {
    if (c.status === 'gapA') {
      // read base with no reference column → insertion run
      if (!curIns) { curIns = { afterRefPos: lastRefPos, bases: '', biStart: c.bi }; insertions.push(curIns); }
      curIns.bases += c.b;
      continue;
    }
    curIns = null;
    const refPos = c.ai;
    readByRefPos[refPos] = {
      base: c.status === 'gapB' ? '-' : c.b,
      status: c.status,
      bi: c.status === 'gapB' ? null : c.bi,
    };
    if (c.status === 'mismatch') mismatchRefPositions.push(refPos);
    lastRefPos = refPos;
    aEnd = refPos;
  }

  return {
    readByRefPos,
    insertions,
    mismatchRefPositions,
    span: { start, end: aEnd },
    identity: result?.identity ?? 0,
  };
}
