/**
 * Circular classical Type II digest driven by canonical occurrences.
 * Pure: the caller supplies the effective RE catalog.
 */
import { restrictionBreakKey, scanOccurrences } from './restriction-occurrence';
import {
  LOCATION_KINDS, getSegments, locationSpan, makeLocation,
} from './annotation-location';
import { detachDanglingLinks } from './annotation-identity';

function normalizeDestinationSegments(annotation, segments) {
  const ordered = segments.map((segment) => ({ ...segment }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  if (annotation.location?.kind === LOCATION_KINDS.ORDER) {
    return ordered.map(({ start, end }) => ({ start, end }));
  }
  const merged = [];
  for (const segment of ordered) {
    const previous = merged[merged.length - 1];
    const crossesSourceOrigin = previous?.sourceSeam
      && previous.sourceSeam === segment.sourceSeam;
    if (crossesSourceOrigin && segment.start <= previous.end) {
      previous.end = Math.max(previous.end, segment.end);
    } else {
      merged.push(segment);
    }
  }
  return merged.map(({ start, end }) => ({ start, end }));
}

function endFromOccurrence(name, occurrence) {
  const type = occurrence?.overhang?.type;
  const overhangType = type === '5overhang'
    ? '5prime'
    : type === '3overhang' ? '3prime' : 'blunt';
  return {
    overhang: overhangType === 'blunt' ? null : occurrence.overhang.seq,
    overhangType,
    enzymeUsed: name,
  };
}

function sourceSegments(annotation, sequenceLength) {
  const out = [];
  const rawSegments = getSegments(annotation);
  for (let index = 0; index < rawSegments.length; index += 1) {
    const segment = rawSegments[index];
    const start = Number(segment.start);
    const end = Number(segment.end);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) continue;
    if (end > start) {
      let sourceSeam = null;
      if (end === sequenceLength && start > 0
        && Number(rawSegments[index + 1]?.start) === 0) {
        sourceSeam = `${index}:${index + 1}`;
      } else if (start === 0
        && Number(rawSegments[index - 1]?.end) === sequenceLength
        && Number(rawSegments[index - 1]?.start) > 0) {
        sourceSeam = `${index - 1}:${index}`;
      }
      out.push({ start, end, sourceSeam });
    } else if (start >= 0 && start < sequenceLength && end >= 0 && end <= sequenceLength) {
      // Legacy circular scalar projection (`end <= start`) at the source boundary.
      const sourceSeam = `legacy:${index}`;
      if (start < sequenceLength) out.push({ start, end: sequenceLength, sourceSeam });
      if (end > 0) out.push({ start: 0, end, sourceSeam });
    }
  }
  return out;
}

function projectAnnotations(annotations, ranges, sequenceLength) {
  const out = [];
  for (const annotation of (annotations || [])) {
    const segments = sourceSegments(annotation, sequenceLength);
    const projectRange = (range) => {
      const projectedSegments = [];
      for (const segment of segments) {
        const start = Math.max(segment.start, range.start);
        const end = Math.min(segment.end, range.end);
        if (start < end) {
          projectedSegments.push({
            start: start - range.start + range.offset,
            end: end - range.start + range.offset,
            sourceSeam: segment.sourceSeam,
          });
        }
      }
      return projectedSegments;
    };
    const append = (projectedSegments) => {
      if (projectedSegments.length === 0) return;
      const normalizedSegments = normalizeDestinationSegments(annotation, projectedSegments);
      const originalKind = annotation.location?.kind;
      const kind = normalizedSegments.length === 1
        ? 'single'
        : originalKind === 'order' ? 'order' : 'join';
      const location = makeLocation(kind, normalizedSegments);
      const span = locationSpan({ location });
      const projected = { ...annotation, location, start: span.start, end: span.end };
      delete projected.segments;
      out.push(projected);
    };

    // An existing compound feature is one owned entity even when its source
    // segments land in different rotation ranges. Simple features intersected
    // by the actual digest boundary keep the established split-record contract.
    if (segments.length > 1) {
      append(ranges.flatMap(projectRange));
    } else {
      for (const range of ranges) append(projectRange(range));
    }
  }
  return detachDanglingLinks(out);
}

function enzymeEvidence(cut) {
  return {
    name: cut.name,
    position: cut.occurrence.recognition.start,
    occurrence: cut.occurrence,
    ...cut.info,
  };
}

function linearize(sequence, annotations, cut) {
  const sequenceLength = sequence.length;
  const cutPosition = cut.occurrence.topCut;
  const end = endFromOccurrence(cut.name, cut.occurrence);
  return {
    type: 'linearize',
    backbone: {
      sequence: sequence.slice(cutPosition) + sequence.slice(0, cutPosition),
      annotations: projectAnnotations(annotations, [
        { start: cutPosition, end: sequenceLength, offset: 0 },
        { start: 0, end: cutPosition, offset: sequenceLength - cutPosition },
      ], sequenceLength),
      length: sequenceLength,
      leftEnd: end,
      rightEnd: { ...end },
    },
    excised: null,
    enzymes: [enzymeEvidence(cut)],
    isDirectional: false,
    selfLigationRisk: true,
  };
}

function excise(sequence, annotations, first, second) {
  const sequenceLength = sequence.length;
  let left = first;
  let right = second;
  if (left.occurrence.topCut > right.occurrence.topCut) [left, right] = [right, left];
  const firstCut = left.occurrence.topCut;
  const secondCut = right.occurrence.topCut;
  const leftEnd = endFromOccurrence(left.name, left.occurrence);
  const rightEnd = endFromOccurrence(right.name, right.occurrence);
  const isDirectional = leftEnd.overhang !== rightEnd.overhang
    || leftEnd.overhangType !== rightEnd.overhangType;

  return {
    type: 'excise',
    backbone: {
      sequence: sequence.slice(secondCut) + sequence.slice(0, firstCut),
      annotations: projectAnnotations(annotations, [
        { start: secondCut, end: sequenceLength, offset: 0 },
        { start: 0, end: firstCut, offset: sequenceLength - secondCut },
      ], sequenceLength),
      length: sequenceLength - (secondCut - firstCut),
      leftEnd: rightEnd,
      rightEnd: leftEnd,
    },
    excised: {
      sequence: sequence.slice(firstCut, secondCut),
      length: secondCut - firstCut,
      annotations: projectAnnotations(annotations, [
        { start: firstCut, end: secondCut, offset: 0 },
      ], sequenceLength),
      leftEnd,
      rightEnd,
    },
    enzymes: [enzymeEvidence(left), enzymeEvidence(right)],
    isDirectional,
    selfLigationRisk: !isDirectional,
  };
}

function cutsFor(name, sequence, enzymes) {
  const info = enzymes && enzymes[name];
  if (!info) return { unknown: true, cuts: [] };
  const occurrences = scanOccurrences(sequence, {
    circular: true,
    enzymes,
    names: [name],
  });
  const strandUnique = [];
  for (const occurrence of occurrences) {
    const opposite = strandUnique.find((candidate) => (
      candidate.recognition.start === occurrence.recognition.start
      && candidate.strand !== occurrence.strand
    ));
    if (opposite) {
      const sameGeometry = restrictionBreakKey(opposite) === restrictionBreakKey(occurrence);
      if (!sameGeometry) {
        return {
          error: `${name} has ambiguous opposite-strand occurrence at ${occurrence.recognition.start}`,
          cuts: [],
        };
      }
      continue;
    }
    strandUnique.push(occurrence);
  }
  const unique = [];
  for (const occurrence of strandUnique) {
    const coincident = unique.find((candidate) => candidate.topCut === occurrence.topCut);
    if (!coincident) {
      unique.push(occurrence);
      continue;
    }
    const coincidentKey = restrictionBreakKey(coincident);
    const occurrenceKey = restrictionBreakKey(occurrence);
    if (!coincidentKey || coincidentKey !== occurrenceKey) {
      return {
        error: `${name} has conflicting cut geometry at ${occurrence.topCut}`,
        cuts: [],
      };
    }
  }
  return { cuts: unique.map((occurrence) => ({ name, info, occurrence })) };
}

export function digestCircular(sequence, annotations, enzyme1, enzyme2, enzymes) {
  const firstResult = cutsFor(enzyme1, sequence, enzymes);
  if (firstResult.unknown) return { error: `Unknown enzyme: ${enzyme1}` };
  if (firstResult.error) return { error: firstResult.error };
  const first = firstResult.cuts;

  if (enzyme2 && enzyme2 !== enzyme1) {
    const secondResult = cutsFor(enzyme2, sequence, enzymes);
    if (secondResult.unknown) return { error: `Unknown enzyme: ${enzyme2}` };
    if (secondResult.error) return { error: secondResult.error };
    const second = secondResult.cuts;
    if (first.length !== 1) {
      return { error: `${enzyme1} cuts ${first.length} times (need exactly 1)` };
    }
    if (second.length !== 1) {
      return { error: `${enzyme2} cuts ${second.length} times (need exactly 1)` };
    }
    if (first[0].occurrence.topCut === second[0].occurrence.topCut) {
      const sameBreak = restrictionBreakKey(first[0].occurrence)
        === restrictionBreakKey(second[0].occurrence);
      return {
        error: sameBreak
          ? `${enzyme1} and ${enzyme2} resolve to the same physical cut; two distinct cuts are required`
          : `Conflicting cut geometry at ${first[0].occurrence.topCut}: ${enzyme1} and ${enzyme2}`,
      };
    }
    return excise(sequence, annotations, first[0], second[0]);
  }

  if (first.length === 0) return { error: `${enzyme1} cuts 0 times in this sequence` };
  if (first.length === 1) return linearize(sequence, annotations, first[0]);
  if (first.length === 2) return excise(sequence, annotations, first[0], first[1]);
  return { error: `${enzyme1} cuts ${first.length} times (need 1 or 2)` };
}
