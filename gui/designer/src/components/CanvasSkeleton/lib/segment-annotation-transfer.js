/**
 * Canonical assembly annotation geometry.
 *
 * Source, segment-local and product annotations all use the project contract:
 * 0-based coordinates with an exclusive end, and `location` is authoritative.
 * Every clip / offset / reverse-complement therefore transforms every segment
 * first and derives the scalar compatibility projection afterwards.
 */
import {
  LOCATION_KINDS,
  getSegments,
  locationSpan,
  makeLocation,
} from '../../../lib/annotation-location';
import {
  detachDanglingLinks,
  makeAnnotationId,
} from '../../../lib/annotation-identity';

function locationKind(annotation, segmentCount) {
  if (segmentCount === 1) return LOCATION_KINDS.SINGLE;
  return annotation?.location?.kind === LOCATION_KINDS.ORDER
    ? LOCATION_KINDS.ORDER
    : LOCATION_KINDS.JOIN;
}

function withCanonicalSegments(annotation, segments, strand = annotation?.strand) {
  if (!Array.isArray(segments) || segments.length === 0) return null;
  const location = makeLocation(locationKind(annotation, segments.length), segments);
  const span = locationSpan({ location });
  const next = {
    ...annotation,
    location,
    start: span.start,
    end: span.end,
    strand: strand === -1 ? -1 : 1,
  };
  delete next.segments;
  return next;
}

function normaliseRanges(ranges) {
  const out = [];
  for (const range of ranges || []) {
    const rawStart = Number(range?.start);
    const rawEnd = Number(range?.end);
    if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) continue;
    const start = Math.max(0, Math.min(rawStart, rawEnd));
    const end = Math.max(rawStart, rawEnd);
    if (end <= start) continue;
    out.push({
      start,
      end,
      offset: Number.isFinite(range?.offset) ? Number(range.offset) : 0,
      rc: !!(range?.rc ?? (range?.orientation === 'reverse')),
    });
  }
  return out;
}

function projectSegments(sourceSegments, ranges) {
  const segments = [];
  const orientations = new Set();
  // Source segment order is biological 5′→3′ and stays authoritative under RC.
  for (const source of sourceSegments) {
    for (const range of ranges) {
      const clippedStart = Math.max(source.start, range.start);
      const clippedEnd = Math.min(source.end, range.end);
      if (clippedEnd <= clippedStart) continue;
      const length = range.end - range.start;
      const localStart = clippedStart - range.start;
      const localEnd = clippedEnd - range.start;
      const mapped = range.rc
        ? {
          start: range.offset + length - localEnd,
          end: range.offset + length - localStart,
        }
        : {
          start: range.offset + localStart,
          end: range.offset + localEnd,
        };
      segments.push(mapped);
      orientations.add(range.rc);
    }
  }
  // One annotation cannot honestly carry a single strand when different pieces
  // were stitched in opposite orientations. Refuse that entity fail-closed.
  if (orientations.size > 1) return null;
  return { segments, rc: orientations.has(true) };
}

/**
 * Apply canonical range projection to one annotation while preserving its
 * identity, rich fields and parent link. Unlike persistent transfer this does
 * not mint an id or rewrite provenance; it is the geometry primitive for a
 * read-time trim/stitch/orientation of an already-owned entity.
 */
export function projectAnnotationGeometry(annotation, rawRanges) {
  if (!annotation) return null;
  const ranges = normaliseRanges(rawRanges);
  if (ranges.length === 0) return null;
  const projected = projectSegments(getSegments(annotation), ranges);
  if (!projected || projected.segments.length === 0) return null;
  const strand = Number(annotation.strand) || 1;
  return withCanonicalSegments(
    annotation,
    projected.segments,
    projected.rc ? -strand : strand,
  );
}

export function projectAnnotationsGeometry(annotations, rawRanges) {
  const projected = (annotations || [])
    .map((annotation) => projectAnnotationGeometry(annotation, rawRanges))
    .filter(Boolean);
  return detachDanglingLinks(projected);
}

function freshOpaqueId(reserved) {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const id = makeAnnotationId();
    if (typeof id === 'string' && id.length > 0 && !reserved.has(id)) {
      reserved.add(id);
      return id;
    }
  }
  throw new Error('segment-annotation-transfer: unable to mint a unique annotation id');
}

function allocatedId(reserved, source, index, idFactory) {
  if (typeof idFactory !== 'function') return freshOpaqueId(reserved);
  const base = String(idFactory(source, index, 0) || '');
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const proposed = attempt === 0
      ? base
      : String(idFactory(source, index, attempt) || `${base}:${attempt}`);
    const id = proposed || `annotation:${index}:${attempt}`;
    if (!reserved.has(id)) {
      reserved.add(id);
      return id;
    }
  }
  throw new Error('segment-annotation-transfer: deterministic id collision');
}

/** Shift one canonical annotation without changing its identity or links. */
export function shiftAnnotation(annotation, offset) {
  const delta = Number(offset) || 0;
  const segments = getSegments(annotation).map((segment) => ({
    start: segment.start + delta,
    end: segment.end + delta,
  }));
  if (segments.length === 0) return annotation;
  return withCanonicalSegments(annotation, segments);
}

export function shiftAnnotations(annotations, offset) {
  return (annotations || []).map((annotation) => shiftAnnotation(annotation, offset));
}

/** Reflect canonical geometry inside a sequence of `length` bases. */
export function reflectAnnotation(annotation, length) {
  const size = Number(length) || 0;
  if (size <= 0) return annotation;
  const segments = getSegments(annotation).map((segment) => ({
    start: size - segment.end,
    end: size - segment.start,
  }));
  if (segments.length === 0) return annotation;
  return withCanonicalSegments(
    annotation,
    segments,
    annotation?.strand === -1 ? 1 : -1,
  );
}

export function reflectAnnotationsCanonical(annotations, length) {
  return (annotations || []).map((annotation) => reflectAnnotation(annotation, length));
}

/**
 * Project source annotations through one or more source ranges into one stitched
 * destination. Each range supplies `{start,end,offset,rc}`. Because all ranges
 * are considered in one pass, an origin-crossing feature remains one entity
 * when a circular slice is represented as `[hi..len] + [0..lo]`.
 *
 * `options.idFactory` is reserved for read-time projections that need stable
 * deterministic namespacing. Persistent transfers omit it and receive fresh
 * opaque IDs.
 */
export function transferAnnotationsForRanges(
  parentAnnotations,
  rawRanges,
  sourceContainerId,
  options = {},
) {
  if (!Array.isArray(parentAnnotations) || parentAnnotations.length === 0) return [];
  const ranges = normaliseRanges(rawRanges);
  if (ranges.length === 0) return [];

  // Ambiguity is a property of the complete source payload, not of whichever
  // duplicate happened to survive clipping into this fragment.
  const sourceRegionCounts = new Map();
  for (const annotation of parentAnnotations) {
    if (annotation?.level === 'region' && annotation.id != null) {
      sourceRegionCounts.set(
        annotation.id,
        (sourceRegionCounts.get(annotation.id) || 0) + 1,
      );
    }
  }

  const copied = [];
  for (let index = 0; index < parentAnnotations.length; index += 1) {
    const source = parentAnnotations[index];
    if (!source) continue;
    const projected = projectSegments(getSegments(source), ranges);
    if (!projected || projected.segments.length === 0) continue;
    const next = withCanonicalSegments(
      {
        ...source,
        origin: {
          type: 'transferred',
          sourceContainerId,
          sourceAnnotationId: source.id,
          ...(source.origin !== undefined ? { sourceOrigin: source.origin } : {}),
        },
      },
      projected.segments,
      projected.rc ? -(Number(source.strand) || 1) : (Number(source.strand) || 1),
    );
    if (next) copied.push({ source, next, index });
  }

  const reserved = new Set(
    parentAnnotations
      .map((annotation) => annotation?.id)
      .filter((id) => typeof id === 'string' && id.length > 0),
  );
  for (const item of copied) {
    item.next.id = allocatedId(reserved, item.source, item.index, options.idFactory);
  }

  const regionRemap = new Map();
  for (const { source, next } of copied) {
    if (
      next.level === 'region'
      && source?.id != null
      && sourceRegionCounts.get(source.id) === 1
    ) {
      regionRemap.set(source.id, next.id);
    }
  }

  return copied.map(({ source, next }) => {
    const sourceParentId = source?.regionId ?? source?.parentId;
    delete next.parentId;
    if (sourceParentId == null) {
      delete next.regionId;
      return next;
    }
    const transferredParentId = regionRemap.get(sourceParentId);
    if (transferredParentId) next.regionId = transferredParentId;
    else delete next.regionId;
    return next;
  });
}

/** Project a single 0-based/end-exclusive source range. */
export function transferAnnotations(
  parentAnnotations,
  rangeStart,
  rangeEnd,
  rc,
  sourceContainerId,
) {
  return transferAnnotationsForRanges(
    parentAnnotations,
    [{ start: rangeStart, end: rangeEnd, offset: 0, rc }],
    sourceContainerId,
  );
}
