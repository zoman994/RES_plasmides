/**
 * Derive the biological 5′ split of a physical primer at a confirmed source
 * landing. Record fields are authoring metadata; only the full oligo, current
 * template and pinned 3′ endpoint decide what is paired.
 */

import { reverseComplement } from '../sequence-utils';
import {
  alignPrimerBindingLocallyAtThreePrimeEnd,
} from './primer-binding-alignment';

function segmentPositions(segments) {
  const positions = [];
  for (const segment of segments || []) {
    for (let position = segment.start; position < segment.end; position += 1) {
      positions.push(position);
    }
  }
  return positions;
}

function positionsToSegments(positions) {
  if (!positions.length) return [];
  const segments = [];
  let start = positions[0];
  let previous = positions[0];
  for (let index = 1; index < positions.length; index += 1) {
    const position = positions[index];
    if (position === previous + 1) {
      previous = position;
      continue;
    }
    segments.push({ start, end: previous + 1 });
    start = position;
    previous = position;
  }
  segments.push({ start, end: previous + 1 });
  return segments;
}

function leadingInsertionLength(alignment) {
  const first = alignment?.runs?.[0];
  if (!first || first.op !== 'I' || first.queryStart !== 0
    || first.targetStart !== 0 || first.targetEnd !== 0) return 0;
  return first.queryEnd;
}

function normalizePosition(position, length) {
  return ((position % length) + length) % length;
}

function adjacentPosition(position, strand, length, circular) {
  const raw = position + (strand === -1 ? 1 : -1);
  if (!circular && (raw < 0 || raw >= length)) return null;
  return circular ? normalizePosition(raw, length) : raw;
}

function primerOrientedBase(template, position, strand) {
  const base = template[position] || '';
  return strand === -1 ? reverseComplement(base) : base;
}

function primerOrientedPositions(segments, strand) {
  const positions = segmentPositions(segments);
  return strand === -1 ? positions.reverse() : positions;
}

function fivePrimeTemplateContext({ candidateLength, segments, strand, template, circular }) {
  const core = primerOrientedPositions(segments, strand);
  if (!core.length) return null;
  const occupied = new Set(core);
  const nearToFar = [];
  let cursor = core[0];

  // With +2/−3 and affine gaps −6/−1, every positive local alignment has a
  // target span shorter than 3× its query span. This finite bound preserves
  // long internal D runs without scanning an entire molecule per primer; the
  // occupied-set gate still prevents a second lap on circular DNA.
  for (let offset = 0; offset < candidateLength * 3; offset += 1) {
    const position = adjacentPosition(cursor, strand, template.length, circular);
    if (position == null || occupied.has(position)) break;
    occupied.add(position);
    nearToFar.push(position);
    cursor = position;
  }

  const positions = nearToFar.reverse();
  return {
    core,
    positions,
    target: positions
      .map((position) => primerOrientedBase(template, position, strand))
      .join(''),
  };
}

function focusLocalAlignment(alignment) {
  const queryStart = alignment.querySpan.start;
  const targetStart = alignment.targetSpan.start;
  const query = alignment.query.slice(queryStart, alignment.querySpan.end);
  const target = alignment.target.slice(targetStart, alignment.targetSpan.end);
  return {
    ...alignment,
    query,
    target,
    runs: alignment.runs.map((run) => ({
      ...run,
      queryStart: run.queryStart - queryStart,
      queryEnd: run.queryEnd - queryStart,
      targetStart: run.targetStart - targetStart,
      targetEnd: run.targetEnd - targetStart,
    })),
    querySpan: { start: 0, end: query.length },
    targetSpan: { start: 0, end: target.length },
  };
}

function matchedPrefixLength(alignment, limit) {
  let count = 0;
  for (const run of alignment.runs || []) {
    if (run.op !== 'M' || run.queryStart >= limit) continue;
    count += Math.max(0, Math.min(run.queryEnd, limit) - run.queryStart);
  }
  return count;
}

function withoutLeadingInsertion(alignment, length) {
  if (!length) return alignment;
  const [leading, ...rest] = alignment.runs || [];
  if (!leading || leading.op !== 'I' || leading.queryStart !== 0
    || leading.queryEnd !== length || leading.targetStart !== 0
    || leading.targetEnd !== 0) return null;
  const counts = { ...alignment.counts, I: alignment.counts.I - length };
  return {
    ...alignment,
    query: alignment.query.slice(length),
    runs: rest.map((run) => ({
      ...run,
      queryStart: run.queryStart - length,
      queryEnd: run.queryEnd - length,
    })),
    counts,
    editDistance: alignment.editDistance - length,
    hasGap: counts.I > 0 || counts.D > 0,
  };
}

function mergeRuns(runs) {
  const merged = [];
  for (const run of runs) {
    const previous = merged[merged.length - 1];
    if (previous && previous.op === run.op
      && previous.queryEnd === run.queryStart
      && previous.targetEnd === run.targetStart) {
      previous.queryEnd = run.queryEnd;
      previous.targetEnd = run.targetEnd;
    } else {
      merged.push({ ...run });
    }
  }
  return merged;
}

function combineAlignments(prefix, core) {
  if (!prefix) {
    return {
      ...core,
      querySpan: { start: 0, end: core.query.length },
      targetSpan: { start: 0, end: core.target.length },
    };
  }
  const queryOffset = prefix.query.length;
  const targetOffset = prefix.target.length;
  const coreRuns = core.runs.map((run) => ({
    ...run,
    queryStart: run.queryStart + queryOffset,
    queryEnd: run.queryEnd + queryOffset,
    targetStart: run.targetStart + targetOffset,
    targetEnd: run.targetEnd + targetOffset,
  }));
  const counts = {
    M: prefix.counts.M + core.counts.M,
    X: prefix.counts.X + core.counts.X,
    I: prefix.counts.I + core.counts.I,
    D: prefix.counts.D + core.counts.D,
  };
  const query = `${prefix.query}${core.query}`;
  const target = `${prefix.target}${core.target}`;
  const runs = mergeRuns([...prefix.runs, ...coreRuns]);
  const terminal = runs[runs.length - 1] || null;
  return {
    query,
    target,
    runs,
    counts,
    editDistance: prefix.editDistance + core.editDistance,
    hasGap: counts.I > 0 || counts.D > 0,
    querySpan: { start: 0, end: query.length },
    targetSpan: { start: 0, end: target.length },
    threePrimeGap: terminal?.op === 'I',
    threePrimeMatchLength: terminal?.op === 'M'
      ? terminal.queryEnd - terminal.queryStart
      : 0,
  };
}

/**
 * @param {object} args
 * @param {string} args.sequence normalized full physical oligo, 5′→3′
 * @param {object} args.alignment full-oligo alignment to the focused source footprint
 * @param {Array<{start:number,end:number}>} args.segments focused source footprint
 * @param {1|-1} args.strand
 * @param {string} args.template normalized current molecule
 * @param {boolean} args.circular
 * @returns {object|null} effective occurrence data, or null if the source
 * geometry cannot support a coherent biological projection
 */
export function deriveFivePrimeLanding({
  sequence, alignment, segments, strand, template, circular = false,
}) {
  if (!sequence || !alignment || (strand !== 1 && strand !== -1) || !template) return null;
  const candidateLength = leadingInsertionLength(alignment);
  const coreAlignment = withoutLeadingInsertion(alignment, candidateLength);
  if (!coreAlignment?.query || coreAlignment.targetSpan?.start !== 0
    || coreAlignment.targetSpan?.end !== coreAlignment.target.length) return null;

  const context = fivePrimeTemplateContext({
    candidateLength, segments, strand, template, circular,
  });
  if (!context || context.core.length !== coreAlignment.target.length) return null;

  const candidate = sequence.slice(0, candidateLength);
  const local = candidate && context.target
    ? alignPrimerBindingLocallyAtThreePrimeEnd(candidate, context.target, {
      // This endpoint is the seam before the mandatory source core, not the
      // physical primer 3′ end. A terminal prefix-D becomes a valid internal D
      // once the core alignment is appended.
      allowTerminalTargetDeletion: true,
    })
    : null;
  const prefixAlignment = local ? focusLocalAlignment(local) : null;
  const tailLength = local?.querySpan.start ?? candidateLength;
  const selectedPositions = local
    ? context.positions.slice(local.targetSpan.start, local.targetSpan.end)
    : [];
  const effectiveAlignment = combineAlignments(prefixAlignment, coreAlignment);
  const effectiveBinding = effectiveAlignment.query;
  const tail = sequence.slice(0, tailLength);
  if (!effectiveBinding || `${tail}${effectiveBinding}` !== sequence) return null;

  const orientedPositions = selectedPositions.concat(context.core);
  const forwardPositions = strand === -1
    ? orientedPositions.reverse()
    : orientedPositions;
  const effectiveSegments = positionsToSegments(forwardPositions);
  if (!effectiveSegments.length) return null;

  // Keep the historical metric narrow: count only newly recovered exact M
  // bases that were leading query-only bases against the original core. An
  // internal I/X is part of the landing, but is not itself complementary.
  const confirmedSuffixLength = prefixAlignment
    ? matchedPrefixLength(prefixAlignment, prefixAlignment.query.length)
    : 0;

  return {
    segments: effectiveSegments,
    tail: tail || null,
    annealedSequence: effectiveBinding,
    alignment: effectiveAlignment,
    unpairedPrefixLength: tail.length,
    confirmedFivePrimeSuffixLength: confirmedSuffixLength,
  };
}
