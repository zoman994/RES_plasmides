/**
 * annotation-location.js — the single owner of annotation coordinates (ANN-0A).
 *
 * Every annotation in BodgeGene carries a canonical `location`:
 *
 *   { kind: 'single' | 'join' | 'order', segments: [{ start, end }, …] }
 *
 * Segment invariants (⚓ DEC-ANN-10, extended by ANN-0A):
 *   - 0-based, end-exclusive `[start, end)`; length = end - start;
 *   - `start` / `end` are safe integers, `0 <= start < end <= sequenceLength`;
 *   - reverse strand does NOT flip coordinates — `strand` is stored separately;
 *   - a point is a segment of exactly one base: `[p, p + 1)`;
 *   - segments are listed in 5′→3′ traversal order over forward coordinates;
 *   - a circular origin crossing is the ONE permitted high→low transition,
 *     e.g. `[4900,5000)` → `[0,30)`.
 *
 * `sequenceLength` and `topology` belong to the DOCUMENT, never to the
 * annotation, and are passed in as `doc = { length, topology }`.
 * `wrapsOrigin` is therefore DERIVED from topology + segments and is never
 * stored as an independent truth.
 *
 * `annotation.start` / `annotation.end` survive only as a deterministic
 * compatibility PROJECTION of the canonical location, so pre-existing scalar
 * consumers (assembly, search, restriction) keep working unchanged. It is not
 * the location: compound-aware consumers must read `getSegments()`. For a
 * wrapping location the projection is `{ first.start, last.end }`, which yields
 * `end <= start` — the wrap sentinel the circular map already understands.
 * `normalizeLocation` is the one gate that keeps projection and location coherent.
 *
 * Conversion happens exactly ONCE per boundary:
 *   file → canonical   `parseGenBankLocation`
 *   canonical → file   `formatGenBankLocation`
 *   canonical → UI     `toUiSegments` / `formatUiRange`
 * No `+1` / `-1` may be written by hand in a parser, exporter, modal or renderer.
 */

export const LOCATION_KINDS = Object.freeze({
  SINGLE: 'single',
  JOIN: 'join',
  ORDER: 'order',
});

const KIND_VALUES = new Set(Object.values(LOCATION_KINDS));

/** En dash — the UI range separator biologists read (`146–469`). */
const UI_DASH = '–';

function isIndex(n) {
  return Number.isSafeInteger(n) && n >= 0;
}

/**
 * Validate + freeze one canonical location. Document-independent: bounds
 * against `sequenceLength` and the circular-topology check belong to
 * `normalizeLocation`, which is the only function that sees the document.
 *
 * @param {string} kind — LOCATION_KINDS value
 * @param {Array<{start:number,end:number}>} segments — traversal order
 * @returns {{kind:string, segments:Array<{start:number,end:number}>}}
 */
export function makeLocation(kind, segments) {
  if (!KIND_VALUES.has(kind)) {
    throw new Error(`annotation-location: unknown location kind '${kind}'`);
  }
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new Error('annotation-location: location needs at least one segment');
  }
  if (kind === LOCATION_KINDS.SINGLE && segments.length !== 1) {
    throw new Error(
      `annotation-location: 'single' takes exactly one segment, got ${segments.length}`,
    );
  }
  const out = segments.map((seg, i) => {
    const start = seg == null ? NaN : Number(seg.start);
    const end = seg == null ? NaN : Number(seg.end);
    if (!isIndex(start) || !isIndex(end)) {
      throw new Error(
        `annotation-location: segment ${i} has non-integer coordinates (${seg?.start}, ${seg?.end})`,
      );
    }
    if (end <= start) {
      throw new Error(
        `annotation-location: segment ${i} is empty or reversed [${start}, ${end})`,
      );
    }
    return Object.freeze({ start, end });
  });

  // At most one high→low transition — the single permitted origin crossing.
  let descents = 0;
  for (let i = 1; i < out.length; i++) {
    if (out[i].start < out[i - 1].start) descents += 1;
  }
  if (descents > 1) {
    throw new Error(
      `annotation-location: ${descents} high→low transitions; at most one origin crossing is allowed`,
    );
  }
  return Object.freeze({ kind, segments: Object.freeze(out) });
}

/**
 * Every segment of `ann`, in traversal order. Reads, in order of authority:
 * a canonical `location`, a bare `segments` array (the display shape produced
 * by feature-map, already shifted into absolute coordinates), then a legacy
 * `start`/`end` scalar.
 */
export function getSegments(ann) {
  if (!ann) return [];
  const loc = ann.location;
  if (loc && Array.isArray(loc.segments) && loc.segments.length) {
    return loc.segments.map((s) => ({ start: s.start, end: s.end }));
  }
  if (Array.isArray(ann.segments) && ann.segments.length) {
    return ann.segments.map((s) => ({ start: s.start, end: s.end }));
  }
  const start = Number(ann.start);
  const end = Number(ann.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
  return [{ start, end }];
}

/** Biological length — the SUM of segment lengths, never the bounding span. */
export function locationLength(ann) {
  return getSegments(ann).reduce((sum, s) => sum + (s.end - s.start), 0);
}

/**
 * The scalar compatibility projection. Deterministic from the segments:
 * bounding span normally, `{ first.start, last.end }` when the location wraps
 * the origin (so `end <= start` flags the wrap to legacy consumers).
 */
export function locationSpan(ann) {
  const segs = getSegments(ann);
  if (segs.length === 0) return { start: 0, end: 0 };
  if (segs.length === 1) return { start: segs[0].start, end: segs[0].end };
  if (hasDescent(segs)) {
    return { start: segs[0].start, end: segs[segs.length - 1].end };
  }
  return {
    start: Math.min(...segs.map((s) => s.start)),
    end: Math.max(...segs.map((s) => s.end)),
  };
}

function hasDescent(segs) {
  for (let i = 1; i < segs.length; i++) {
    if (segs[i].start < segs[i - 1].start) return true;
  }
  return false;
}

/**
 * Derived — true iff the segments cross the origin on a CIRCULAR document.
 * Never read from a stored flag.
 */
export function wrapsOrigin(ann, doc) {
  const segs = getSegments(ann);
  if (segs.length < 2) return false;
  if (!hasDescent(segs)) return false;
  return normalizeTopology(doc) === 'circular';
}

/** A point is exactly one base wide. Geometric, independent of `level`. */
export function isPoint(ann) {
  const segs = getSegments(ann);
  return segs.length === 1 && segs[0].end - segs[0].start === 1;
}

/**
 * True when the location has more than one segment.
 *
 * Allocation-free on purpose — this runs per region per rendered line in the
 * SequenceView, so it must not build a segment array just to read a length.
 */
export function isCompound(ann) {
  if (!ann) return false;
  const loc = ann.location;
  if (loc && Array.isArray(loc.segments)) return loc.segments.length > 1;
  if (Array.isArray(ann.segments)) return ann.segments.length > 1;
  return false;
}

/**
 * Explode an annotation into the visual parts a scalar renderer can draw,
 * WITHOUT losing the fact that they are one feature.
 *
 * Every part carries the same `id` (so selection and click stay per-feature)
 * plus `logical` — the untouched annotation a click handler must report. A part
 * deliberately drops `location` / `segments`, because a part is not the whole
 * location and no consumer may mistake it for one.
 *
 * `isLabelPart` marks the widest part, so a compound feature is labelled once
 * instead of once per segment.
 *
 * A single-segment annotation yields exactly one part, so callers can use this
 * unconditionally.
 */
export function toRenderParts(ann) {
  // Fast path — a simple annotation is already its own single part. Returning
  // the input untouched keeps this free on the per-line render path, where the
  // overwhelming majority of features are scalar.
  if (!isCompound(ann)) return [ann];

  const segs = getSegments(ann);
  let widest = 0;
  for (let i = 1; i < segs.length; i++) {
    if (segs[i].end - segs[i].start > segs[widest].end - segs[widest].start) widest = i;
  }
  return segs.map((s, i) => {
    // Built field-by-field rather than spread-then-`delete`: `delete` forces V8
    // to abandon the object's hidden class, which is measurable when this runs
    // for every feature on every rendered line.
    const part = {};
    for (const k in ann) {
      if (k !== 'location' && k !== 'segments') part[k] = ann[k];
    }
    part.start = s.start;
    part.end = s.end;
    part.segmentIndex = i;
    part.segmentCount = segs.length;
    part.isCompoundPart = true;
    part.isLabelPart = i === widest;
    part.partKey = `${ann.id ?? `${s.start}:${s.end}`}#${i}`;
    // A part is NOT the whole location — consumers get the real annotation here.
    part.logical = ann;
    return part;
  });
}

/** Expand an array of annotations into render parts, preserving input order. */
export function toRenderPartsAll(annotations) {
  const out = [];
  for (const ann of annotations || []) {
    if (!ann) continue;
    for (const part of toRenderParts(ann)) out.push(part);
  }
  return out;
}

/** True iff `pos` (0-based) falls inside any segment. */
export function locationContains(ann, pos) {
  const p = Number(pos);
  if (!Number.isFinite(p)) return false;
  return getSegments(ann).some((s) => p >= s.start && p < s.end);
}

/** True iff `outer` covers every segment of `inner` (segment-aware containment). */
export function locationCovers(outer, inner) {
  const outerSegs = getSegments(outer);
  const innerSegs = getSegments(inner);
  if (!outerSegs.length || !innerSegs.length) return false;
  return innerSegs.every((i) =>
    outerSegs.some((o) => i.start >= o.start && i.end <= o.end));
}

/** True iff any segment of `a` overlaps any segment of `b`. */
export function locationsOverlap(a, b) {
  const as = getSegments(a);
  const bs = getSegments(b);
  return as.some((x) => bs.some((y) => x.start < y.end && y.start < x.end));
}

/**
 * Overlap of two ranges as a fraction of the SHORTER one — so a tiny feature
 * fully inside a huge one reads as complete overlap rather than a sliver.
 * Scalar by design: the dedup heuristics that use it compare bounding spans.
 * Relocated here from `annotation-edit` so the editing and prediction-merge
 * modules can share it without importing each other.
 */
export function overlapFraction(a, b) {
  const lo = Math.max(a.start, b.start);
  const hi = Math.min(a.end, b.end);
  if (hi <= lo) return 0;
  const minLen = Math.min(a.end - a.start, b.end - b.start);
  if (minLen <= 0) return 0;
  return (hi - lo) / minLen;
}

/** Total overlapping bases between two locations, segment by segment. */
export function overlapBases(a, b) {
  const as = getSegments(a);
  const bs = getSegments(b);
  let total = 0;
  for (const x of as) {
    for (const y of bs) {
      const lo = Math.max(x.start, y.start);
      const hi = Math.min(x.end, y.end);
      if (hi > lo) total += hi - lo;
    }
  }
  return total;
}

function normalizeTopology(doc) {
  const t = typeof doc === 'string' ? doc : doc?.topology;
  return t === 'circular' ? 'circular' : 'linear';
}

function docLength(doc) {
  const n = typeof doc === 'number' ? doc : Number(doc?.length);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

/**
 * The one coherence gate. Returns an annotation carrying a valid canonical
 * `location` plus its scalar projection.
 *
 * Contract:
 *   - never mutates the input (a frozen legacy annotation is safe to pass);
 *   - never touches `id` and never invents one;
 *   - rejects incoherent dual representation (`location` disagreeing with
 *     an explicitly supplied `start`/`end`);
 *   - rejects malformed data instead of repairing it by guesswork
 *     (no end/start swap, no clamping to the sequence);
 *   - idempotent.
 *
 * @param {Object} ann
 * @param {{length?:number, topology?:string}|number|string} doc
 */
export function normalizeLocation(ann, doc) {
  if (!ann || typeof ann !== 'object') {
    throw new Error('annotation-location: annotation must be an object');
  }
  const len = docLength(doc);
  const circular = normalizeTopology(doc) === 'circular';

  let location;
  if (ann.location) {
    const raw = ann.location;
    location = makeLocation(raw.kind, raw.segments);
  } else {
    const start = Number(ann.start);
    const end = Number(ann.end);
    if (!isIndex(start) || !isIndex(end)) {
      throw new Error(
        `annotation-location: annotation '${ann.id ?? ann.name ?? '?'}' has non-integer coordinates (${ann.start}, ${ann.end})`,
      );
    }
    if (end <= start) {
      // A reversed scalar range is ambiguous: it could be a typo or an intended
      // origin crossing. Guessing either way silently changes biology.
      throw new Error(
        `annotation-location: annotation '${ann.id ?? ann.name ?? '?'}' has a reversed or empty range [${start}, ${end}); an origin crossing must be expressed as an explicit compound location`,
      );
    }
    location = makeLocation(LOCATION_KINDS.SINGLE, [{ start, end }]);
  }

  const segs = location.segments;
  if (len != null) {
    for (const s of segs) {
      if (s.end > len) {
        throw new Error(
          `annotation-location: segment [${s.start}, ${s.end}) exceeds sequence length ${len}`,
        );
      }
    }
  }

  if (hasDescent(segs) && !circular) {
    throw new Error(
      'annotation-location: an origin-crossing location requires a circular topology',
    );
  }

  const span = locationSpan({ location });

  // Incoherent dual representation — an explicit scalar that does not match the
  // projection of the canonical location. Only reject when BOTH were supplied.
  if (ann.location && (ann.start !== undefined || ann.end !== undefined)) {
    const givenStart = Number(ann.start);
    const givenEnd = Number(ann.end);
    if (givenStart !== span.start || givenEnd !== span.end) {
      throw new Error(
        `annotation-location: incoherent location — stored projection (${ann.start}, ${ann.end}) disagrees with the canonical segments (${span.start}, ${span.end})`,
      );
    }
  }

  if (ann.location === location && ann.start === span.start && ann.end === span.end) {
    return ann;
  }
  return { ...ann, location, start: span.start, end: span.end };
}

/** Normalize a whole array; `onError` decides the fate of a rejected entry. */
export function normalizeLocations(annotations, doc, onError) {
  const out = [];
  for (const ann of annotations || []) {
    if (!ann) continue;
    try {
      out.push(normalizeLocation(ann, doc));
    } catch (err) {
      if (typeof onError === 'function') onError(err, ann);
      else throw err;
    }
  }
  return out;
}

// ═══ UI boundary — 1-based inclusive, the only place `+1` is written ═══

/** Canonical segments → the 1-based inclusive ranges a biologist reads. */
export function toUiSegments(ann) {
  return getSegments(ann).map((s) => ({ uiStart: s.start + 1, uiEnd: s.end }));
}

/** 1-based inclusive UI input → one canonical segment. */
export function fromUiSegment(uiStart, uiEnd) {
  return { start: Number(uiStart) - 1, end: Number(uiEnd) };
}

/**
 * Human-readable range. A point renders as a single position (`5`), a compound
 * location as comma-separated ranges — a wrap is never collapsed into one span.
 */
export function formatUiRange(ann) {
  const ui = toUiSegments(ann);
  if (ui.length === 0) return '';
  return ui
    .map((s) => (s.uiStart === s.uiEnd ? `${s.uiStart}` : `${s.uiStart}${UI_DASH}${s.uiEnd}`))
    .join(', ');
}

// ═══ GenBank boundary — the only place the INSDC grammar is read or written ═══

function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of body) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** One INSDC range (`1..10`, `5`, `<1..>10`) → a canonical segment. */
function parseRange(text) {
  let inner = String(text).trim();
  if (inner.startsWith('complement(') && inner.endsWith(')')) {
    inner = inner.slice(11, -1).trim();
  }
  inner = inner.replace(/[<>]/g, '');
  if (inner.includes('..')) {
    const [a, b] = inner.split('..');
    const start = parseInt(a, 10) - 1;
    const end = parseInt(b, 10);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      throw new Error(`annotation-location: unparsable GenBank range '${text}'`);
    }
    return { start, end };
  }
  const pos = parseInt(inner, 10);
  if (!Number.isFinite(pos)) {
    throw new Error(`annotation-location: unparsable GenBank position '${text}'`);
  }
  // A bare position is a single base: 1-based `p` → `[p-1, p)`.
  return { start: pos - 1, end: pos };
}

/**
 * GenBank location string → `{ location, strand }`. This is the ONLY `-1`
 * applied on the file→store boundary for the GenBank family (plain `.gb`
 * import, `.bodge` container, SnapGene projection).
 *
 * @param {string} text — e.g. `join(4901..5000,1..30)`
 * @param {{length?:number, topology?:string}} [doc]
 */
export function parseGenBankLocation(text, doc) {
  let inner = String(text || '').trim();
  let strand = 1;
  if (inner.startsWith('complement(') && inner.endsWith(')')) {
    strand = -1;
    inner = inner.slice(11, -1).trim();
  }

  let kind = LOCATION_KINDS.SINGLE;
  let segments;
  if (inner.startsWith('join(') && inner.endsWith(')')) {
    kind = LOCATION_KINDS.JOIN;
    segments = splitTopLevel(inner.slice(5, -1)).map(parseRange);
  } else if (inner.startsWith('order(') && inner.endsWith(')')) {
    kind = LOCATION_KINDS.ORDER;
    segments = splitTopLevel(inner.slice(6, -1)).map(parseRange);
  } else {
    segments = [parseRange(inner)];
  }
  // A one-part join/order is semantically a plain span.
  if (kind !== LOCATION_KINDS.SINGLE && segments.length === 1) {
    kind = LOCATION_KINDS.SINGLE;
  }

  const location = makeLocation(kind, segments);
  const len = docLength(doc);
  if (len != null) {
    for (const s of location.segments) {
      if (s.end > len) {
        throw new Error(
          `annotation-location: '${text}' exceeds sequence length ${len}`,
        );
      }
    }
  }
  return { location, strand };
}

/**
 * Canonical location → GenBank location string. The ONLY `+1` applied on the
 * store→file boundary. Segments stay in forward-coordinate traversal order,
 * matching what `parseGenBankLocation` reads back.
 */
export function formatGenBankLocation(ann) {
  const segs = getSegments(ann);
  if (segs.length === 0) return '';
  // Degenerate legacy input (missing / reversed / non-integer coordinates) has
  // no honest GenBank rendering — the caller drops the feature rather than
  // emitting an invented span such as `1..0`.
  if (segs.some((s) => !isIndex(s.start) || !isIndex(s.end) || s.end <= s.start)) return '';
  const kind = ann?.location?.kind || LOCATION_KINDS.SINGLE;
  const ranges = segs.map((s) => `${s.start + 1}..${s.end}`);
  let span;
  if (segs.length === 1) {
    span = ranges[0];
  } else {
    span = `${kind === LOCATION_KINDS.ORDER ? 'order' : 'join'}(${ranges.join(',')})`;
  }
  return ann?.strand === -1 ? `complement(${span})` : span;
}
