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
  name = '',
  type = 'misc_feature',
  start,
  end,
  level = 'region',
  strand = 1,
  predicted,
  source,
  confidence,
  signals,
}, seqLength) {
  const v = validateAnnotationCoords(start, end, seqLength);
  if (!v.valid) throw new Error(`createAnnotation: ${v.error}`);
  const ann = {
    id: generateAnnotationId({ start, end, type, name }),
    name,
    type,
    start,
    end,
    strand: strand === -1 ? -1 : 1,
    level,
  };
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
export function deleteAnnotation(annotations, annotationId) {
  if (!Array.isArray(annotations)) return [];
  const next = annotations.filter((a) => a && a.id !== annotationId);
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
export function updateAnnotation(annotations, annotationId, patch, seqLength) {
  if (!Array.isArray(annotations)) return [];
  let found = false;
  const next = annotations.map((a) => {
    if (!a || a.id !== annotationId) return a;
    found = true;
    const merged = { ...a, ...patch };
    const v = validateAnnotationCoords(merged.start, merged.end, seqLength);
    if (!v.valid) throw new Error(`updateAnnotation: ${v.error}`);
    if (merged.strand !== -1) merged.strand = 1;
    // Regenerate id when the identifying fields shifted.
    if (
      patch.start !== undefined
      || patch.end !== undefined
      || patch.type !== undefined
      || patch.name !== undefined
    ) {
      merged.id = generateAnnotationId(merged);
    }
    return merged;
  });
  return found ? next : annotations;
}

/**
 * Compute the overlap fraction of two regions relative to the SHORTER
 * region (avoids the asymmetry where a tiny region inside a huge one
 * would otherwise look like a small overlap %). Used by the
 * create-batch dedup heuristic (DEC-ANN-09).
 */
function overlapFraction(a, b) {
  const lo = Math.max(a.start, b.start);
  const hi = Math.min(a.end, b.end);
  if (hi <= lo) return 0;
  const minLen = Math.min(a.end - a.start, b.end - b.start);
  if (minLen <= 0) return 0;
  return (hi - lo) / minLen;
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
  return { uiStart: start + 1, uiEnd: end };
}

/**
 * 1-based inclusive end (UI input) → 0-based exclusive end (store).
 * Inverse of `toUiCoords`.
 */
export function fromUiCoords(uiStart, uiEnd) {
  return { start: uiStart - 1, end: uiEnd };
}
