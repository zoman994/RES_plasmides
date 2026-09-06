/**
 * annotation-edit.js — pure helpers for the Sprint M-X.2 annotation
 * editing workflow. Single source of truth for create / delete /
 * update / create-batch operations on `annotations[]` arrays.
 *
 * No React, no DOM, no store reads — entry point for both the
 * SequenceView edit handlers (K3-K5) and the Annotator
 * apply-results flow (K10).
 *
 * Coordinate convention (⚓ DEC-ANN-10):
 *   - Store: 0-based exclusive end (`{ start, end }`, length =
 *     end - start). Same as elsewhere in the codebase post-V50 fix.
 *   - UI: 1-based inclusive end (popups, modals, drag tooltips).
 *
 * `toUiCoords` / `fromUiCoords` convert between the two.
 *
 * Dispatcher `applyAnnotationEdit(annotations, edit)` returns either
 * a new annotations array (kinds: create / delete / update) OR
 * `{ next, skipped }` for kind === 'create-batch' (DEC-ANN-09 dedup
 * counter — bulk Annotator apply needs the count for the «N
 * skipped as duplicates» footer toast).
 */

import {
  LOCATION_KINDS,
  makeLocation,
  getSegments,
  locationSpan,
  locationLength,
  normalizeLocation,
  isPoint,
  isCompound,
  overlapFraction,
  toUiSegments,
  fromUiSegment,
} from './annotation-location';
import {
  createAnnotationIdAllocator,
  ingestAnnotations,
  makeAnnotationId,
  reparent,
} from './annotation-identity';
import { mergeCompatibleAnnotationMetadata } from './annotation-metadata';

/**
 * Build the `{ length, topology }` document descriptor the location gate needs.
 * Callers historically passed only `seqLength`; topology may arrive as a second
 * argument (a string, or a full doc object). Unknown topology stays linear, so
 * an origin crossing is never minted by accident.
 */
function docOf(seqLength, docOrTopology) {
  if (docOrTopology && typeof docOrTopology === 'object') {
    return {
      length: Number.isFinite(docOrTopology.length) ? docOrTopology.length : seqLength,
      topology: docOrTopology.topology,
    };
  }
  return { length: seqLength, topology: docOrTopology };
}

// Re-exported so existing consumers keep their import path while the two
// responsibilities live in separate files (ANN-0A corrective, size budget).
export {
  isDuplicatePrediction,
  mergeStripWithPredicted,
  basePartName,
  reconcileConfirmedWithPartials,
} from './annotation-predicted-merge';
export { overlapFraction };

/**
 * B3 (audit) — feature type → annotation level. Mirrors AnnotationEditor's
 * TYPE_TO_LEVEL so the SequenceView create/edit popups can author all THREE
 * documented levels (region / detail / POINT), not just region. Point types
 * (start/stop codon, restriction site, mutation, variation, primer_bind) used to
 * be importable + renderable but NOT creatable — every create path hardcoded
 * 'region'. Unknown types default to 'region' (the safe legacy default).
 */
const TYPE_LEVEL = {
  // detail
  RBS: 'detail', Kozak: 'detail', polyA_signal: 'detail', signal_peptide: 'detail',
  propeptide: 'detail', tag: 'detail', linker: 'detail', T2A: 'detail', NLS: 'detail',
  intron: 'detail', catalytic: 'detail', binding: 'detail', domain: 'detail',
  cleavage_site: 'detail', active_site: 'detail', core_promoter: 'detail',
  poly_a: 'detail', stem_loop: 'detail',
  // point
  restriction_site: 'point', start_codon: 'point', stop_codon: 'point',
  variation: 'point', primer_bind: 'point', mutation: 'point',
};
export function levelForType(type) {
  return TYPE_LEVEL[type] || 'region';
}

/**
 * Produce a deterministic id for a region annotation. Compatible with
 * the backfill pattern in `annotation-model.getRegions`
 * (`region:<start>:<end>:<type>:<name>`).
 *
 * Predictable across calls — never call it on a region you've just
 * mutated and stash the result; the id should be derived fresh each
 * time the region's coords/type/name change so we don't end up with
 * stale ids in the array. The store doesn't index by id — it's a
 * stable reference for React keys + Annotator accept/reject sets.
 */
export function generateAnnotationId({ start, end, type, name }) {
  const t = type || 'unknown';
  const n = name == null ? '' : String(name);
  return `region:${start}:${end}:${t}:${n}`;
}

/**
 * Validate that a (start, end, seqLength) triple describes a valid
 * region. Returns `{ valid: true }` on success, `{ valid: false,
 * error }` with a human-readable Russian error message otherwise.
 *
 * Rules: start >= 0; end > start (no zero-length, no flips);
 *   end <= seqLength.
 */
export function validateAnnotationCoords(start, end, seqLength) {
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return { valid: false, error: 'Координаты должны быть числами' };
  }
  if (start < 0) return { valid: false, error: 'Начало < 0' };
  if (start >= end) return { valid: false, error: 'Начало должно быть меньше конца' };
  if (Number.isFinite(seqLength) && end > seqLength) {
    return { valid: false, error: `Конец > длины последовательности (${seqLength})` };
  }
  return { valid: true };
}

/**
 * Construct a new region annotation. Throws on invalid coords (the
 * caller — popup, modal, batch dispatcher — has already validated and
 * a thrown error here is a programmer mistake, not a user mistake).
 *
 * `level` defaults to 'region' (the only level today's editing
 * surface produces); detail / point editing is out of scope for
 * Sprint M-X.2.
 */
export function createAnnotation(
  payload = {},
  seqLength,
  docOrTopology,
  idFactory = makeAnnotationId,
) {
  const {
    id,
    name = '',
    type = 'misc_feature',
    start,
    end,
    location,
    level = 'region',
    strand = 1,
    regionId,
  } = payload;
  // ANN-0A — a supplied canonical location is authoritative and must NOT be
  // gated behind the scalar validator, which cannot express a compound or
  // origin-crossing range. Only a scalar-only payload goes through the legacy
  // range check first.
  const doc = docOf(seqLength, docOrTopology);
  if (!location) {
    const v = validateAnnotationCoords(start, end, seqLength);
    if (!v.valid) throw new Error(`createAnnotation: ${v.error}`);
  }
  // The coherence gate owns topology: a wrap can only be minted on a circular
  // document, and a location contradicting a supplied scalar is rejected.
  const normalized = normalizeLocation(
    location
      ? { location, ...(start !== undefined ? { start } : {}), ...(end !== undefined ? { end } : {}) }
      : { start, end },
    doc,
  );
  if (level === 'point' && !isPoint(normalized)) {
    throw new Error(
      `createAnnotation: a point annotation must be exactly one base, got ${locationLength(normalized)}`,
    );
  }
  const ann = {
    // Annotation data is an open, lossless record: qualifiers, description,
    // provenance and format-specific fields must survive create/promotion.
    // Canonical identity/geometry fields below deliberately override payload
    // projections; everything else is retained verbatim.
    ...payload,
    location: normalized.location,
    // Preserve an explicit id when given — cross-referencing annotations (a
    // gene + its introns linked by regionId) must keep their ids across the
    // create/create-batch apply, or the regionId link breaks and the intron
    // becomes an orphan (no exon-block render, no AA splice).
    // ANN-INTEGRITY seam 4 — a NEW annotation gets an OPAQUE, collision-safe id
    // (crypto.randomUUID via makeId). A coordinate-derived id is not opaque, and
    // two features sharing coords/type/name would collapse into one identity.
    id: id != null ? id : idFactory(),
    name,
    type,
    // Scalar fields are the projection of the canonical location, never an
    // independent input — so `locationSpan(ann)` always equals {start, end}.
    start: normalized.start,
    end: normalized.end,
    strand: strand === -1 ? -1 : 1,
    level,
  };
  // A canonical location owns the geometry. Never carry a second, potentially
  // stale bare display-shape beside it.
  delete ann.segments;
  // `regionId` is the sole model parent key; legacy `parentId` belongs only to
  // the ingress adapter.
  delete ann.parentId;
  // Link a detail annotation (e.g. a manually-marked intron) to its parent
  // region so the AA track can splice it (getIntronsForRegion link path).
  if (regionId != null) ann.regionId = regionId;
  else delete ann.regionId;
  return ann;
}

/**
 * Remove the annotation matching `annotationId`. Returns a new array
 * (does not mutate `annotations`). If the id is not present, returns
 * the original array reference unchanged — caller can detect a no-op
 * by reference equality.
 */
/**
 * Match by stored id OR by the deterministic backfill id for
 * imported annotations that arrived without one. Source files
 * (.dna / .gb / SnapGene catalog) often omit the id field; consumers
 * that read through `getRegions` see the backfilled form
 * (`region:start:end:type:name`) and dispatch edits with THAT id,
 * but the underlying array still has `id: undefined`. Strict
 * `a.id === id` would silently miss them — biolog reported drag-resize
 * worked on freshly-created annotations but не работало на existing
 * imports.
 */
function matchesAnnotationId(a, id) {
  if (!a || !id) return false;
  if (a.id === id) return true;
  if (!a.id && a.level === 'region') {
    return generateAnnotationId(a) === id;
  }
  return false;
}

export function deleteAnnotation(annotations, annotationId) {
  if (!Array.isArray(annotations)) return [];
  const target = annotations.find((a) => matchesAnnotationId(a, annotationId));
  if (!target) return annotations;
  // ANN-INTEGRITY seam 4 — deleting a parent region CASCADES to its children:
  // any detail/point whose `regionId` links to the removed region is removed
  // too, so a delete never leaves a link pointing at a region that is gone.
  const targetId = target.id || generateAnnotationId(target);
  const cascade = target.level === 'region';
  const next = annotations.filter((a) => {
    if (matchesAnnotationId(a, annotationId)) return false;
    if (cascade && a && a.regionId != null && a.regionId === targetId) return false;
    return true;
  });
  return next.length === annotations.length ? annotations : next;
}

/**
 * Update an existing annotation by id. `patch` is shallow-merged onto
 * the existing entry; if it changes coords/type/name, the id is
 * regenerated to match the new shape (so consumers that hash on id
 * stay consistent).
 *
 * Throws on invalid coord patches. Returns a new annotations array.
 * Returns the original reference if the id is not found.
 */
export function updateAnnotation(annotations, annotationId, patch, seqLength, doc) {
  if (!Array.isArray(annotations)) return [];
  let found = false;
  const next = annotations.map((a) => {
    if (!matchesAnnotationId(a, annotationId)) return a;
    found = true;
    const wasCompound = getSegments(a).length > 1;
    const effectivePatch = { ...(patch || {}) };
    // A form serializer commonly emits `location: undefined` for a field the
    // user did not touch. Undefined is absence, not permission to erase the
    // canonical JOIN/ORDER before the metadata merge.
    if (effectivePatch.location === undefined) delete effectivePatch.location;
    const touchesCoords = effectivePatch.start !== undefined || effectivePatch.end !== undefined;
    const hasLocationPatch = Object.prototype.hasOwnProperty.call(effectivePatch, 'location');
    // ANN-0A — a compound / origin-crossing feature has no single scalar range.
    // Accepting a scalar coordinate patch here would silently flatten it into
    // one span and change the biology. Refuse instead; metadata edits (name,
    // colour, type, qualifiers) still pass through and keep every segment.
    if (wasCompound && touchesCoords && !hasLocationPatch) {
      throw new Error(
        'updateAnnotation: cannot apply a scalar coordinate edit to a compound (multi-segment) annotation — edit its segments instead',
      );
    }
    let merged = { ...a, ...effectivePatch };
    const editDoc = docOf(seqLength, doc);
    if (hasLocationPatch) {
      // The segment editor owns canonical geometry. Old/stale scalar values
      // (including scalars echoed in the same UI patch) are projections, never
      // competing inputs. Remove them before the coherence gate, which derives
      // a fresh projection while preserving join/order traversal semantics.
      const locationOnly = { ...merged };
      delete locationOnly.start;
      delete locationOnly.end;
      merged = normalizeLocation(locationOnly, editDoc);
    } else if (wasCompound) {
      // Metadata-only edit: an already canonical location is valid by
      // construction. Preserve it verbatim and only refresh its scalar
      // compatibility projection; re-normalizing here would require topology
      // that old callers did not carry and could flatten/throw on origin wrap.
      if (a.location != null) {
        merged.location = a.location;
        const span = locationSpan({ location: a.location });
        merged.start = span.start;
        merged.end = span.end;
      } else {
        // Legacy compound bare segments still need the canonical ingress gate.
        merged = normalizeLocation(merged, editDoc);
      }
    } else {
      const v = validateAnnotationCoords(merged.start, merged.end, seqLength);
      if (!v.valid) throw new Error(`updateAnnotation: ${v.error}`);
      if (touchesCoords) delete merged.location;
      merged = normalizeLocation(merged, editDoc);
    }
    if (merged.location != null) delete merged.segments;
    if (merged.strand !== -1) merged.strand = 1;
    // ANN-INTEGRITY seam 4 — identity is STABLE. Freeze the effective pre-edit
    // id (an opaque stored id, or the deterministic backfill id a legacy no-id
    // annotation was already known by) and never regenerate it from the new
    // coords / name / type. Consumers keying on id — React keys, the Annotator
    // accept/reject sets, primer source sites and child `regionId` links — keep
    // their reference across a rename / move / type edit, so nothing is orphaned.
    merged.id = a.id || generateAnnotationId(a);
    return merged;
  });
  if (!found) return annotations;
  return next;
}


/**
 * Append a batch of new regions to an existing annotations array.
 * DEC-ANN-09 — for each candidate, if it overlaps >50% with an
 * existing region of the same type, silently skip and bump the
 * skipped counter.
 *
 * Returns `{ next, skipped }`.
 *
 * Each candidate is run through `createAnnotation` (so its id is
 * regenerated and coord validation fires). Same-strand check is NOT
 * applied — biolog 04.05.2026: dedup is type-based, strand differences
 * are intentional (e.g. lacZα reverse-strand CDS is its own region).
 */
export function createBatchAnnotations(
  annotations,
  candidates,
  seqLength,
  docOrTopology,
) {
  const arr = Array.isArray(annotations) ? annotations.slice() : [];
  const incoming = Array.isArray(candidates) ? candidates : [];
  const allocateId = createAnnotationIdAllocator(
    [...arr, ...incoming],
    docOrTopology?.idFactory,
  );
  const existingCount = arr.length;
  let skipped = 0;
  for (const cand of incoming) {
    if (!cand) continue;
    let ann;
    try {
      ann = createAnnotation(cand, seqLength, docOrTopology, allocateId);
    } catch {
      // Bad coords → silent skip (treated as a "duplicate" for the
      // purposes of the footer counter).
      skipped += 1;
      continue;
    }
    const dup = arr.find((a) =>
      a && a.level === 'region'
      && (a.type || '') === (ann.type || '')
      && overlapFraction(a, ann) > 0.5
    );
    if (dup) {
      skipped += 1;
      continue;
    }
    arr.push(ann);
  }
  // Normalize the complete edit payload in ONE pass. That is essential for a
  // cross-level collision where a later region is renamed and a still-later
  // child links to its original explicit id: only the batch has enough context
  // to carry that unambiguous parent link to the renamed region.
  const next = ingestAnnotations(arr);
  return { next, skipped, accepted: next.slice(existingCount) };
}

/**
 * Dispatcher — single entry point used by SequenceView edit hooks and
 * the Annotator apply flow. Throws on unknown `kind`.
 *
 * Returns:
 *   - kind 'create' / 'delete' / 'update' → annotations[]
 *   - kind 'create-batch'                  → { next, skipped, accepted }
 *
 * `seqLength` is required for create / update / create-batch (so coord
 * validation can fire) and ignored by delete.
 */
export function applyAnnotationEdit(annotations, edit, seqLength, docOrTopology) {
  if (!edit || typeof edit !== 'object') {
    throw new Error('applyAnnotationEdit: edit must be an object');
  }
  switch (edit.kind) {
    case 'create': {
      const base = Array.isArray(annotations) ? annotations : [];
      const payload = edit.payload || {};
      const allocateId = createAnnotationIdAllocator(
        [...base, payload],
        docOrTopology?.idFactory,
      );
      const ann = createAnnotation(payload, seqLength, docOrTopology, allocateId);
      return ingestAnnotations([...base, ann]);
    }
    case 'delete':
      return deleteAnnotation(annotations, edit.id);
    case 'update':
      return updateAnnotation(
        annotations,
        edit.id,
        edit.patch || {},
        seqLength,
        docOrTopology,
      );
    case 'create-batch':
      return createBatchAnnotations(
        annotations,
        edit.payload || [],
        seqLength,
        docOrTopology,
      );
    default:
      throw new Error(`applyAnnotationEdit: unknown kind '${edit.kind}'`);
  }
}

/**
 * 0-based exclusive end → 1-based inclusive end (UI display).
 * Example: store {start:145, end:469} → UI {uiStart:146, uiEnd:469}
 * (lacZα CDS spans nucleotides 146..469 to a biologist's eye).
 */
export function toUiCoords(start, end) {
  const [seg] = toUiSegments({ start, end });
  return seg || { uiStart: start + 1, uiEnd: end };
}

/**
 * 1-based inclusive end (UI input) → 0-based exclusive end (store).
 * Inverse of `toUiCoords`.
 */
export function fromUiCoords(uiStart, uiEnd) {
  return fromUiSegment(uiStart, uiEnd);
}

/**
 * Sprint M-X.3 follow-up — split a single feature into N equal-
 * length child features. Used by FeatureEditorModal's «Split into
 * 2 / 3 / 4» buttons.
 *
 *   in:  [{ id: 'r1', start: 100, end: 1000, name: 'lacZα', type: 'CDS' }]
 *   call: splitAnnotation(in, 'r1', 3, seqLen)
 *   out: [
 *     { id: …, start: 100,  end: 400,  name: 'lacZα-1', type: 'CDS' },
 *     { id: …, start: 400,  end: 700,  name: 'lacZα-2', type: 'CDS' },
 *     { id: …, start: 700,  end: 1000, name: 'lacZα-3', type: 'CDS' },
 *   ]
 *
 * Children inherit `type` / `strand` / `level` from the parent.
 * Coordinates are computed via integer slicing — the LAST child
 * picks up any remainder so total length is preserved exactly.
 *
 * Throws on N <= 1, on (end - start) < N, and on coords that
 * `validateAnnotationCoords` rejects post-split.
 *
 * Unknown id → no-op (returns input array unchanged).
 */
export function splitAnnotation(annotations, annotationId, n, seqLength, docOrTopology) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 2) {
    throw new Error(`splitAnnotation: n must be ≥ 2, got ${n}`);
  }
  const idx = (annotations || []).findIndex((a) => matchesAnnotationId(a, annotationId));
  if (idx < 0) return annotations || [];
  const parent = annotations[idx];
  // ANN-0A — splitting a compound feature needs a segment editor that does not
  // exist yet. Refuse loudly rather than slicing its bounding span, which would
  // silently rewrite the biology.
  if (isCompound(parent)) {
    throw new Error(
      'splitAnnotation: cannot split a compound (multi-segment) annotation — segment editing is not available yet',
    );
  }
  const doc = docOf(seqLength, docOrTopology);
  const total = (parent.end || 0) - (parent.start || 0);
  if (total < n) {
    throw new Error(`splitAnnotation: feature length ${total} too short for ${n}-way split`);
  }
  const chunk = Math.floor(total / n);
  const children = [];
  const allocateId = createAnnotationIdAllocator(
    annotations,
    docOrTopology?.idFactory,
  );
  for (let i = 0; i < n; i++) {
    const cs = (parent.start || 0) + i * chunk;
    const ce = i === n - 1 ? (parent.end || 0) : cs + chunk;
    if (typeof seqLength === 'number') validateAnnotationCoords(cs, ce, seqLength);
    const name = parent.name ? `${parent.name}-${i + 1}` : `(unnamed)-${i + 1}`;
    // Each child gets its OWN single-segment location — inheriting the parent's
    // would leave every child claiming the parent's full span.
    const child = normalizeLocation({
      ...parent,
      location: makeLocation(LOCATION_KINDS.SINGLE, [{ start: cs, end: ce }]),
      start: cs,
      end: ce,
      name,
      level: 'region',
    }, doc);
    child.id = allocateId();
    children.push(child);
  }
  const next = [...annotations];
  next.splice(idx, 1, ...children);
  // Children fully contained by exactly one sibling follow that sibling. A
  // child crossing the split boundary (or otherwise matching zero/multiple
  // siblings) is detached fail-safe: never guess, never leave a dangling link.
  const parentId = parent.id || generateAnnotationId(parent);
  return next.map((a) => {
    if (!a || a.regionId !== parentId) return a;
    const childSegments = getSegments(a);
    const owners = children.filter((candidate) => childSegments.length > 0
      && childSegments.every(
        (segment) => segment.start >= candidate.start && segment.end <= candidate.end,
      ));
    if (owners.length === 1) return { ...a, regionId: owners[0].id };
    const { regionId, ...detached } = a; // eslint-disable-line no-unused-vars
    return detached;
  });
}

/**
 * Sprint M-X.3 follow-up — merge two ADJACENT features into one
 * union range. Used by FeatureEditorModal's merge picker.
 *
 * «Adjacent» means they touch on a boundary: one's `end` equals the
 * other's `start`. Non-adjacent merges are refused — returns input
 * unchanged so the caller can show «no adjacent neighbour» in the
 * UI without a separate guard.
 *
 * Result keeps the LARGER feature's `name` / `type` / `strand` /
 * `level` (so a tiny RBS merging into a long CDS reads as a longer
 * CDS, not as a stretched RBS — biolog UX call).
 *
 * Order of `idA` / `idB` doesn't matter.
 */
export function mergeAnnotations(annotations, idA, idB, docOrTopology) {
  const list = annotations || [];
  const a = list.find((x) => matchesAnnotationId(x, idA));
  const b = list.find((x) => matchesAnnotationId(x, idB));
  if (!a || !b) return list;
  // ANN-0A — merging a compound feature would need segment-level union logic;
  // refuse rather than collapse it to a bounding span.
  if (isCompound(a) || isCompound(b)) {
    throw new Error(
      'mergeAnnotations: cannot merge a compound (multi-segment) annotation — segment editing is not available yet',
    );
  }
  const adjacent = a.end === b.start || b.end === a.start;
  if (!adjacent) return list;
  const lenA = (a.end || 0) - (a.start || 0);
  const lenB = (b.end || 0) - (b.start || 0);
  const dominant = lenA >= lenB ? a : b;
  const other = dominant === a ? b : a;
  const start = Math.min(a.start || 0, b.start || 0);
  const end = Math.max(a.end || 0, b.end || 0);
  // Build a NEW location for the union — inheriting the dominant feature's
  // location would keep the merged result claiming only the dominant's span.
  const merged = normalizeLocation({
    ...mergeCompatibleAnnotationMetadata(dominant, other),
    location: makeLocation(LOCATION_KINDS.SINGLE, [{ start, end }]),
    start,
    end,
  }, docOf(undefined, docOrTopology));
  const allocateId = createAnnotationIdAllocator(
    list,
    docOrTopology?.idFactory,
  );
  merged.id = allocateId();
  const aId = a.id || generateAnnotationId(a);
  const bId = b.id || generateAnnotationId(b);
  const withoutSources = list
    .filter((x) => {
      const xid = x.id || generateAnnotationId(x);
      return xid !== aId && xid !== bId;
    })
    .concat(merged);
  // ANN-INTEGRITY seam 4 — the two source regions become ONE, so their children
  // legitimately belong to the merged region: re-point every regionId link
  // instead of orphaning the sub-features.
  return reparent(reparent(withoutSources, aId, merged.id), bId, merged.id);
}
