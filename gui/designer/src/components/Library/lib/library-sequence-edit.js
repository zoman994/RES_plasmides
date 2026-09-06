/**
 * library-sequence-edit.js — M-X.6 K2 (DEC-MX6-02), segment-aware since
 * ANN-INTEGRITY seam BG-030. Pure helper for character-level sequence edits
 * with indel-aware annotation remap.
 *
 * Op shapes (mirrors useSequenceKeyboard's emit contract):
 *   { kind: 'insert',  pos,   char }
 *   { kind: 'delete',  pos,   length }
 *   { kind: 'replace', start, end,  replacement }   // = delete + insert
 *
 * `applySequenceEditToEntry(entry, op)` returns a NEW
 * `{ sequence, length, annotations }` plus `caretAfter` (position the caller
 * should move the caret to).
 *
 * The remap operates on the CANONICAL segment geometry (`annotation.location`),
 * not on the scalar `start`/`end` projection. A spliced or origin-crossing
 * feature therefore keeps every segment and its traversal order across an
 * insert / delete — the scalar projection is recomputed from the segments so
 * `start`/`end` never drift away from the biology (⚓ DEC-ANN-10 / ANN-0A).
 *
 * Per-segment rules:
 *   • INSERT at pos, length L:
 *       pos <= seg.start            → segment slides right by L
 *       seg.start < pos < seg.end   → segment's end extends by L
 *       pos >= seg.end              → segment unchanged
 *
 *   • DELETE [pos, pos+len):
 *       segment fully inside delete → segment removed
 *       segment fully after delete  → slides left by len
 *       segment partially overlaps  → clipped to the surviving bases
 *     A region whose every segment is removed is dropped; its detail/point
 *     children are cascade-dropped so no `regionId` is left pointing at a
 *     region that no longer exists.
 *
 *   • REPLACE = delete + insert composition (single op for atomicity).
 *
 * Pure function — no Dexie / no React state.
 */

import {
  LOCATION_KINDS,
  makeLocation,
  getSegments,
  locationSpan,
} from '../../../lib/annotation-location';
import {
  dropChildrenOfRemoved,
  ingestAnnotations,
} from '../../../lib/annotation-identity';

/** Per-segment insert remap. */
function insertSegments(segs, pos, length) {
  return segs.map((s) => {
    if (pos <= s.start) return { start: s.start + length, end: s.end + length };
    if (pos < s.end) return { start: s.start, end: s.end + length };
    return { start: s.start, end: s.end };
  });
}

/** Clip one segment against a delete range; returns 0 or 1 segment (new coords). */
function clipDeleteSegment(s, delStart, delEnd, length) {
  if (s.end <= delStart) return [{ start: s.start, end: s.end }]; // fully before
  if (s.start >= delEnd) return [{ start: s.start - length, end: s.end - length }]; // fully after
  const leftStart = s.start;
  const leftEnd = Math.min(s.end, delStart);
  const rightStart = Math.max(s.start, delEnd);
  const rightEnd = s.end;
  const hasLeft = leftEnd > leftStart;
  const hasRight = rightEnd > rightStart;
  if (hasLeft && hasRight) {
    // The surviving left and right parts abut once the right part slides left.
    return [{ start: leftStart, end: rightEnd - length }];
  }
  if (hasLeft) return [{ start: leftStart, end: leftEnd }];
  if (hasRight) return [{ start: rightStart - length, end: rightEnd - length }];
  return []; // segment fully inside the delete range
}

/** Per-segment delete remap. */
function deleteSegments(segs, pos, length) {
  const delStart = pos;
  const delEnd = pos + length;
  const out = [];
  for (const s of segs) {
    for (const part of clipDeleteSegment(s, delStart, delEnd, length)) out.push(part);
  }
  return out;
}

/**
 * Atomic replacement remap. Replacement bases belong to every segment that
 * overlapped the removed interval, while an edit touching a segment only at a
 * half-open boundary remains outside it. A segment fully covered by the old
 * interval is removed rather than resurrected from unrelated replacement DNA.
 */
function replaceSegments(segs, start, end, replacementLength) {
  const removedLength = end - start;
  if (removedLength === 0) return insertSegments(segs, start, replacementLength);
  const delta = replacementLength - removedLength;
  const out = [];
  for (const s of segs) {
    if (s.end <= start) { // wholly before; end === start is outside
      out.push({ start: s.start, end: s.end });
      continue;
    }
    if (s.start >= end) { // wholly after; start === end follows the length delta
      out.push({ start: s.start + delta, end: s.end + delta });
      continue;
    }
    if (start <= s.start && s.end <= end) {
      continue; // the complete old segment was removed
    }
    if (s.start < start && s.end > end) {
      out.push({ start: s.start, end: s.end + delta });
      continue;
    }
    if (start <= s.start && s.start < end && s.end > end) {
      out.push({ start, end: s.end + delta });
      continue;
    }
    if (s.start < start && start < s.end && s.end <= end) {
      out.push({ start: s.start, end: start + replacementLength });
    }
  }
  return out.filter((s) => s.end > s.start);
}

/**
 * Rebuild one annotation from its remapped segments. Returns the new annotation,
 * or `null` when every segment was removed (the feature no longer exists).
 * A scalar-only annotation that stays single-segment keeps its scalar-only
 * shape (no `location` field is invented) so untouched callers see no change.
 */
function rebuildAnnotation(ann, newSegs) {
  if (newSegs.length === 0) return null;
  const hadLocation = !!(ann.location
    || (Array.isArray(ann.segments) && ann.segments.length > 0));
  if (!hadLocation && newSegs.length === 1) {
    return { ...ann, start: newSegs[0].start, end: newSegs[0].end };
  }
  const kind = newSegs.length === 1
    ? LOCATION_KINDS.SINGLE
    : (ann.location?.kind === LOCATION_KINDS.ORDER ? LOCATION_KINDS.ORDER : LOCATION_KINDS.JOIN);
  let location;
  try {
    location = makeLocation(kind, newSegs);
  } catch {
    // Unrepresentable geometry (e.g. more than one origin crossing produced by
    // the remap) — fail closed and drop the feature rather than corrupt it.
    return null;
  }
  const span = locationSpan({ location });
  const next = { ...ann, location, start: span.start, end: span.end };
  delete next.segments; // never leave a stale display-shape alongside the canonical location
  return next;
}

/**
 * Apply a per-segment mapper to every annotation and cascade-drop the children
 * of any region that disappeared. Returns the new annotations array.
 */
function remapAnnotations(annotations, mapSegs) {
  const survivors = [];
  const removedRegionIds = new Set();
  for (const ann of annotations) {
    if (!ann) continue;
    const segs = getSegments(ann);
    if (segs.length === 0) { survivors.push(ann); continue; }
    const rebuilt = rebuildAnnotation(ann, mapSegs(segs));
    if (rebuilt) {
      survivors.push(rebuilt);
    } else if (ann.level === 'region' && ann.id != null) {
      removedRegionIds.add(ann.id);
    }
  }
  return dropChildrenOfRemoved(survivors, removedRegionIds);
}

export function applySequenceEditToEntry(entry, op) {
  if (!entry || !op || !op.kind) {
    return { ok: false, reason: 'invalid-args' };
  }
  const payload = entry.payload || {};
  const seq = String(payload.sequence || '');
  const rawAnnotations = Array.isArray(payload.annotations) ? payload.annotations : [];
  let annotations;
  try {
    // Legacy buffers can still contain id-less entries. Normalize identity and
    // parent links before geometry changes so a fully removed parent can be
    // recorded and cascaded even when its child partially survives the delete.
    annotations = ingestAnnotations(rawAnnotations);
  } catch (error) {
    return { ok: false, reason: 'invalid-annotations', error: error?.message };
  }

  if (op.kind === 'insert') {
    const pos = Number(op.pos);
    const ch = typeof op.char === 'string' ? op.char : '';
    if (!Number.isFinite(pos) || pos < 0 || pos > seq.length || ch.length !== 1) {
      return { ok: false, reason: 'invalid-args' };
    }
    const next = seq.slice(0, pos) + ch + seq.slice(pos);
    return {
      ok: true,
      sequence: next,
      length: next.length,
      annotations: remapAnnotations(annotations, (segs) => insertSegments(segs, pos, 1)),
      caretAfter: pos + 1,
    };
  }

  if (op.kind === 'delete') {
    const pos = Number(op.pos);
    const length = Number(op.length);
    if (!Number.isFinite(pos) || pos < 0 || pos >= seq.length || !Number.isFinite(length) || length <= 0) {
      return { ok: false, reason: 'invalid-args' };
    }
    const eff = Math.min(length, seq.length - pos);
    const next = seq.slice(0, pos) + seq.slice(pos + eff);
    return {
      ok: true,
      sequence: next,
      length: next.length,
      annotations: remapAnnotations(annotations, (segs) => deleteSegments(segs, pos, eff)),
      caretAfter: pos,
    };
  }

  if (op.kind === 'replace') {
    const start = Number(op.start);
    const end = Number(op.end);
    const replacement = typeof op.replacement === 'string' ? op.replacement : '';
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > seq.length || end < start) {
      return { ok: false, reason: 'invalid-args' };
    }
    const removed = end - start;
    const nextAnnotations = (removed > 0 || replacement.length > 0)
      ? remapAnnotations(
        annotations,
        (segs) => replaceSegments(segs, start, end, replacement.length),
      )
      : annotations;
    const next = seq.slice(0, start) + replacement + seq.slice(end);
    return {
      ok: true,
      sequence: next,
      length: next.length,
      annotations: nextAnnotations,
      caretAfter: start + replacement.length,
    };
  }

  return { ok: false, reason: 'unknown-kind' };
}
