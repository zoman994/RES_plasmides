/**
 * library-sequence-edit.js — M-X.6 K2 (DEC-MX6-02). Pure helper for
 * character-level sequence edits with indel-aware annotation shift.
 *
 * Op shapes (mirrors useSequenceKeyboard's emit contract):
 *   { kind: 'insert',  pos,   char }
 *   { kind: 'delete',  pos,   length }
 *   { kind: 'replace', start, end,  replacement }   // = delete + insert
 *
 * `applySequenceEditToEntry(entry, op)` returns a NEW
 * `{ sequence, length, annotations }` plus `caretAfter` (position
 * the caller should move the caret to). Annotations are shifted
 * indel-aware:
 *
 *   • INSERT at pos:
 *       ann.start >= pos        → start += 1, end += 1
 *       ann.start < pos < ann.end → end += 1 (insertion inside extends)
 *       pos >= ann.end          → no shift
 *
 *   • DELETE [pos, pos+length):
 *       ann fully inside delete range  → drop annotation
 *       ann fully past delete range    → start -= length, end -= length
 *       ann partially overlaps         → clip to remaining bounds
 *
 *   • REPLACE = delete + insert composition (single op for atomicity).
 *
 * Pure function — no Dexie / no React state. Tests for the helper
 * cover the per-kind matrix; slice action is a thin wrapper that
 * recomputes resourceHash + persists.
 */

function shiftForInsert(annotations, pos, length = 1) {
  if (length <= 0) return annotations;
  return annotations.map((ann) => {
    if (!ann) return ann;
    const aStart = Number(ann.start);
    const aEnd = Number(ann.end);
    if (!Number.isFinite(aStart) || !Number.isFinite(aEnd)) return ann;
    if (pos <= aStart) {
      return { ...ann, start: aStart + length, end: aEnd + length };
    }
    if (pos < aEnd) {
      return { ...ann, end: aEnd + length };
    }
    return ann;
  });
}

function shiftForDelete(annotations, pos, length) {
  if (length <= 0) return annotations;
  const delStart = pos;
  const delEnd = pos + length;
  const out = [];
  for (const ann of annotations) {
    if (!ann) continue;
    const aStart = Number(ann.start);
    const aEnd = Number(ann.end);
    if (!Number.isFinite(aStart) || !Number.isFinite(aEnd)) {
      out.push(ann);
      continue;
    }
    // Fully past delete range — shift left.
    if (aStart >= delEnd) {
      out.push({ ...ann, start: aStart - length, end: aEnd - length });
      continue;
    }
    // Fully before delete range — no shift.
    if (aEnd <= delStart) {
      out.push(ann);
      continue;
    }
    // Annotation fully inside delete range — drop.
    if (aStart >= delStart && aEnd <= delEnd) {
      continue;
    }
    // Partial overlap — clip.
    let nStart = aStart;
    let nEnd = aEnd;
    if (aStart < delStart && aEnd > delStart && aEnd <= delEnd) {
      // Right edge gets clipped.
      nEnd = delStart;
    } else if (aStart >= delStart && aStart < delEnd && aEnd > delEnd) {
      // Left edge gets clipped + shift the remaining tail.
      nStart = delStart;
      nEnd = aEnd - length;
    } else if (aStart < delStart && aEnd > delEnd) {
      // Delete sits inside the annotation — shrink by length.
      nEnd = aEnd - length;
    }
    if (nEnd > nStart) {
      out.push({ ...ann, start: nStart, end: nEnd });
    }
  }
  return out;
}

export function applySequenceEditToEntry(entry, op) {
  if (!entry || !op || !op.kind) {
    return { ok: false, reason: 'invalid-args' };
  }
  const payload = entry.payload || {};
  const seq = String(payload.sequence || '');
  const annotations = Array.isArray(payload.annotations) ? payload.annotations : [];

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
      annotations: shiftForInsert(annotations, pos, 1),
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
      annotations: shiftForDelete(annotations, pos, eff),
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
    // Compose: delete [start, end), then insert replacement at start.
    const removed = end - start;
    let nextAnnotations = removed > 0 ? shiftForDelete(annotations, start, removed) : annotations;
    if (replacement.length > 0) {
      nextAnnotations = shiftForInsert(nextAnnotations, start, replacement.length);
    }
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
