import { reverseComplement } from '../../../sequence-utils';

/** Project primer-oriented M/X/I/D onto top-strand SVG columns. */
export function alignmentDisplay(occurrence) {
  const alignment = occurrence?.alignment;
  if (!alignment || !Array.isArray(alignment.runs)) return null;
  const targetLength = occurrence.segments.reduce(
    (sum, segment) => sum + segment.end - segment.start,
    0,
  );
  if (alignment.target.length !== targetLength) return null;
  const reverse = occurrence.strand === -1;
  const glyphs = new Array(targetLength);
  const insertions = [];

  for (const run of alignment.runs) {
    if (run.op === 'I') {
      const queryBases = alignment.query.slice(run.queryStart, run.queryEnd);
      insertions.push({
        boundary: reverse ? targetLength - run.targetStart : run.targetStart,
        bases: reverse ? reverseComplement(queryBases) : queryBases,
      });
      continue;
    }
    for (let targetOffset = run.targetStart; targetOffset < run.targetEnd; targetOffset += 1) {
      const topOffset = reverse ? targetLength - 1 - targetOffset : targetOffset;
      const queryOffset = run.queryStart + (targetOffset - run.targetStart);
      const queryBase = run.op === 'D' ? '' : alignment.query[queryOffset];
      glyphs[topOffset] = {
        op: run.op,
        base: reverse && run.op !== 'D' ? reverseComplement(queryBase) : queryBase,
      };
    }
  }
  return { glyphs, insertions };
}

/** Slice one logical aligned landing into the current physical site segment. */
export function alignmentDisplayForSegment(aligned, offset, segmentLength, isLast) {
  if (!aligned) return { glyphs: null, insertions: [] };
  const end = offset + segmentLength;
  return {
    glyphs: aligned.glyphs.slice(offset, end),
    insertions: aligned.insertions
      .filter(({ boundary }) => boundary >= offset && (boundary < end || (isLast && boundary === end)))
      .map((insertion) => ({ ...insertion, boundary: insertion.boundary - offset })),
  };
}
