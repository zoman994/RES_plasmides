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
export function createAnnotation({
  id,
  name = '',
  type = 'misc_feature',
  start,
  end,
  location,
  level = 'region',
  strand = 1,
  regionId,
  predicted,
  source,
  confidence,
  signals,
}, seqLength, docOrTopology) {
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
    location: normalized.location,
    // Preserve an explicit id when given — cross-referencing annotations (a
    // gene + its introns linked by regionId) must keep their ids across the
    // create/create-batch apply, or the regionId link breaks and the intron
    // becomes an orphan (no exon-block render, no AA splice). Fall back to the
    // deterministic backfill id only when none is supplied.
    id: id != null
      ? id
      : generateAnnotationId({ start: normalized.start, end: normalized.end, type, name }),
    name,
    type,
    // Scalar fields are the projection of the canonical location, never an
    // independent input — so `locationSpan(ann)` always equals {start, end}.
    start: normalized.start,
    end: normalized.end,
    strand: strand === -1 ? -1 : 1,
    level,
  };
  // Link a detail annotation (e.g. a manually-marked intron) to its parent
  // region so the AA track can splice it (getIntronsForRegion link path).
  if (regionId != null) ann.regionId = regionId;
  // Forward predictor metadata so accepted Annotator hits keep their
  // origin trail when applied as confident regions. Skip noise — drop
  // empty arrays / nullish values so the annotation stays clean.
  if (predicted) ann.predicted = true;
  if (source) ann.source = source;
  if (Number.isFinite(confidence)) ann.confidence = confidence;
  if (Array.isArray(signals) && signals.length > 0) ann.signals = signals;
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
  const next = annotations.filter((a) => !matchesAnnotationId(a, annotationId));
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
  // Track an id shift on the edited annotation so detail/point children that
  // link to it via `regionId` can be re-pointed (V180 — otherwise editing a
  // gene's coords/name/type silently orphaned its introns/domains).
  let idShift = null;
  const next = annotations.map((a) => {
    if (!matchesAnnotationId(a, annotationId)) return a;
    found = true;
    const isCompound = getSegments(a).length > 1;
    const touchesCoords = patch.start !== undefined || patch.end !== undefined;
    // ANN-0A — a compound / origin-crossing feature has no single scalar range.
    // Accepting a scalar coordinate patch here would silently flatten it into
    // one span and change the biology. Refuse instead; metadata edits (name,
    // colour, type, qualifiers) still pass through and keep every segment.
    if (isCompound && touchesCoords && patch.location === undefined) {
      throw new Error(
        'updateAnnotation: cannot apply a scalar coordinate edit to a compound (multi-segment) annotation — edit its segments instead',
      );
    }
    const merged = { ...a, ...patch };
    if (isCompound && !touchesCoords) {
      // Keep the projection coherent with the untouched canonical location.
      const span = locationSpan(merged);
      merged.start = span.start;
      merged.end = span.end;
    } else {
      const v = validateAnnotationCoords(merged.start, merged.end, seqLength);
      if (!v.valid) throw new Error(`updateAnnotation: ${v.error}`);
      if (touchesCoords || merged.location === undefined) {
        merged.location = normalizeLocation(
          { start: merged.start, end: merged.end },
          doc ?? seqLength,
        ).location;
      }
    }
    if (merged.strand !== -1) merged.strand = 1;
    const prevId = a.id || generateAnnotationId(a); // effective id BEFORE the edit
    // Regenerate id when the identifying fields shifted, OR when
    // the annotation came in without one (now we stamp the
    // deterministic backfill so subsequent edits round-trip cleanly).
    if (
      !a.id
      || patch.start !== undefined
      || patch.end !== undefined
      || patch.type !== undefined
      || patch.name !== undefined
    ) {
      merged.id = generateAnnotationId(merged);
    }
    if (merged.id !== prevId) idShift = { from: prevId, to: merged.id };
    return merged;
  });
  if (!found) return annotations;
  // Cascade the id shift onto children: any annotation whose `regionId` pointed
  // at the old id is re-linked to the new id. A no-op when nothing changed or
  // the edited annotation has no children (only regions are parents).
  if (idShift && idShift.from !== idShift.to) {
    return next.map((a) =>
      (a && a.regionId === idShift.from ? { ...a, regionId: idShift.to } : a));
  }
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
export function createBatchAnnotations(annotations, candidates, seqLength) {
  const arr = Array.isArray(annotations) ? annotations.slice() : [];
  let skipped = 0;
  const accepted = [];
  for (const cand of (candidates || [])) {
    if (!cand) continue;
    let ann;
    try {
      ann = createAnnotation(cand, seqLength);
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
    accepted.push(ann);
    arr.push(ann);
  }
  return { next: arr, skipped, accepted };
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
export function applyAnnotationEdit(annotations, edit, seqLength) {
  if (!edit || typeof edit !== 'object') {
    throw new Error('applyAnnotationEdit: edit must be an object');
  }
  switch (edit.kind) {
    case 'create': {
      const ann = createAnnotation(edit.payload || {}, seqLength);
      return [...(annotations || []), ann];
    }
    case 'delete':
      return deleteAnnotation(annotations, edit.id);
    case 'update':
      return updateAnnotation(annotations, edit.id, edit.patch || {}, seqLength);
    case 'create-batch':
      return createBatchAnnotations(annotations, edit.payload || [], seqLength);
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
    }, doc);
    child.id = generateAnnotationId(child);
    children.push(child);
  }
  const next = [...annotations];
  next.splice(idx, 1, ...children);
  return next;
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
  const start = Math.min(a.start || 0, b.start || 0);
  const end = Math.max(a.end || 0, b.end || 0);
  // Build a NEW location for the union — inheriting the dominant feature's
  // location would keep the merged result claiming only the dominant's span.
  const merged = normalizeLocation({
    ...dominant,
    location: makeLocation(LOCATION_KINDS.SINGLE, [{ start, end }]),
    start,
    end,
  }, docOf(undefined, docOrTopology));
  merged.id = generateAnnotationId(merged);
  const aId = a.id || generateAnnotationId(a);
  const bId = b.id || generateAnnotationId(b);
  return list
    .filter((x) => {
      const xid = x.id || generateAnnotationId(x);
      return xid !== aId && xid !== bId;
    })
    .concat(merged);
}
