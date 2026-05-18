/**
 * assembly-model — pure helpers for the AssemblyDraft entity (A1).
 *
 * Merge decisions in force:
 *  - entity AssemblyDraft, slice state.assemblyDrafts (G1 naming).
 *  - segment.source discriminated union: container | manual | imported (G1).
 *  - segment.sequence CACHED + FROZEN at insert/range/RC (G1 semantics);
 *    computeAssemblySequence concats cached sequences (A1 API surface).
 *  - NO stored offset — boundaries derived cumulatively (derived
 *    consequence of cached-sequence single-source-of-truth).
 *  - A1 gap-as-placeholder folded into the `manual` variant: a manual
 *    segment with empty sequence + explicit length + gapKind/gapLabel.
 *
 * All functions are pure (input → new object), no state side effects.
 */
import { v7 as uuidv7 } from 'uuid';
import { reverseComplement } from '../../../sequence-utils';
import { getNextSegmentColor } from './segment-color-palette';
import { transferAnnotations } from './segment-annotation-transfer';

let _autoName = 0;

export function createDraft(opts = {}) {
  const now = Date.now();
  return {
    id: `asm-${uuidv7()}`,
    name: opts.name || `assembly_${(_autoName += 1)}`,
    createdAt: now,
    updatedAt: now,
    topology: { circular: !!(opts.topology && opts.topology.circular) },
    segments: [],
    notes: opts.notes || '',
    position: opts.position || null,
  };
}

/** Cached length of a segment (real sequence, or placeholder length). */
export function segmentLength(seg) {
  if (!seg) return 0;
  if (typeof seg.sequence === 'string' && seg.sequence.length > 0) return seg.sequence.length;
  return Number.isFinite(seg.length) ? Math.max(0, seg.length) : 0;
}

/**
 * concatSegmentAnnotations — annotations of the realised PRODUCT (the
 * concatenation of all segments). Each segment's already-local
 * annotations (1-based inclusive, from transferAnnotations) shift by
 * the running char offset, mirroring computeAssemblySequence's concat
 * order. Gap / annotation-less segments still advance the offset so
 * later segments land at the right product coordinate (Игорь
 * 17.05.2026: «продукты не наследуют аннотации исходника»).
 */
export function concatSegmentAnnotations(segments) {
  const out = [];
  let offset = 0;
  for (const seg of segments || []) {
    for (const a of (seg && seg.annotations) || []) {
      out.push({ ...a, start: a.start + offset, end: a.end + offset });
    }
    offset += segmentLength(seg);
  }
  return out;
}

export function makeSourcedSegment({ sourceContainer, start, end, rc = false, color }) {
  const lo = Math.max(0, Math.min(start, end));
  const hi = Math.max(start, end);
  const raw = String(sourceContainer?.sequence || '').slice(lo, hi);
  const seq = rc ? reverseComplement(raw) : raw;
  const id = `seg-${uuidv7()}`;
  const transferred = transferAnnotations(
    sourceContainer?.annotations || [], lo, hi, rc, sourceContainer?.id,
  );
  return {
    id,
    source: {
      type: 'container',
      containerId: sourceContainer?.id,
      sourceContainerName: sourceContainer?.name || '',
    },
    start: lo,
    end: hi,
    reverseComplement: !!rc,
    sequence: seq,
    length: seq.length,
    color: color || getNextSegmentColor(0),
    label: undefined,
    annotations: transferred,
  };
}

export function makeManualSegment({ sequence, length, label, gapKind, gapLabel, color } = {}) {
  const hasSeq = typeof sequence === 'string' && sequence.length > 0;
  const id = `seg-${uuidv7()}`;
  return {
    id,
    source: { type: 'manual' },
    reverseComplement: false,
    sequence: hasSeq ? sequence : '',
    length: hasSeq ? sequence.length : (Number.isFinite(length) ? Math.max(0, length) : 0),
    color: color || getNextSegmentColor(0),
    label,
    gapKind: hasSeq ? undefined : (gapKind || 'unknown'),
    gapLabel,
    annotations: [],
  };
}

export function makeImportedSegment({ sequence, sourceLabel, label, color } = {}) {
  const id = `seg-${uuidv7()}`;
  const seq = typeof sequence === 'string' ? sequence : '';
  return {
    id,
    source: { type: 'imported', sourceLabel: sourceLabel || '' },
    reverseComplement: false,
    sequence: seq,
    length: seq.length,
    color: color || getNextSegmentColor(0),
    label,
    annotations: [],
  };
}

function touch(draft, segments) {
  return { ...draft, segments, updatedAt: Date.now() };
}

export function addSegment(draft, segment, insertAtIndex) {
  const segs = draft.segments.slice();
  const idx = Number.isFinite(insertAtIndex)
    ? Math.max(0, Math.min(insertAtIndex, segs.length))
    : segs.length;
  // colour by final position so the palette stays varied
  const placed = { ...segment, color: segment.color || getNextSegmentColor(idx) };
  segs.splice(idx, 0, placed);
  return touch(draft, segs);
}

export function removeSegment(draft, segmentId) {
  return touch(draft, draft.segments.filter((s) => s.id !== segmentId));
}

export function moveSegment(draft, segmentId, newIndex) {
  const segs = draft.segments.slice();
  const from = segs.findIndex((s) => s.id === segmentId);
  if (from < 0) return draft;
  const [s] = segs.splice(from, 1);
  segs.splice(Math.max(0, Math.min(newIndex, segs.length)), 0, s);
  return touch(draft, segs);
}

export function updateSegment(draft, segmentId, patch) {
  const segs = draft.segments.map((s) => {
    if (s.id !== segmentId) return s;
    const next = { ...s, ...patch };
    if (typeof patch.sequence === 'string') next.length = patch.sequence.length;
    return next;
  });
  return touch(draft, segs);
}

export function splitSegment(draft, segmentId, atOffsetWithinSegment) {
  const idx = draft.segments.findIndex((s) => s.id === segmentId);
  if (idx < 0) return draft;
  const seg = draft.segments[idx];
  const len = segmentLength(seg);
  const at = Math.max(1, Math.min(atOffsetWithinSegment, len - 1));
  const leftSeq = (seg.sequence || '').slice(0, at);
  const rightSeq = (seg.sequence || '').slice(at);
  const left = {
    ...seg, id: `seg-${uuidv7()}`, sequence: leftSeq, length: leftSeq.length,
  };
  const right = {
    ...seg, id: `seg-${uuidv7()}`, sequence: rightSeq, length: rightSeq.length,
  };
  // For container source, recompute sub-ranges (forward: contiguous;
  // rc: cached seq is already RC'd so the source range mirrors).
  if (seg.source?.type === 'container' && Number.isFinite(seg.start)) {
    if (seg.reverseComplement) {
      left.start = seg.end - at; left.end = seg.end;
      right.start = seg.start; right.end = seg.end - at;
    } else {
      left.start = seg.start; left.end = seg.start + at;
      right.start = seg.start + at; right.end = seg.end;
    }
  }
  const segs = draft.segments.slice();
  segs.splice(idx, 1, left, right);
  return touch(draft, segs);
}

/**
 * Derived segment boundaries on the assembly (cumulative). No stored
 * offset — the ordered segments + their cached lengths ARE the offsets.
 */
export function segmentBoundaries(draft) {
  let cur = 0;
  const boundaries = (draft?.segments || []).map((s, i) => {
    const l = segmentLength(s);
    const b = {
      segmentId: s.id,
      segmentIndex: i,
      startOnAssembly: cur,
      endOnAssembly: cur + l,
      color: s.color,
      label: s.label,
      source: s.source,
    };
    cur += l;
    return b;
  });
  return { boundaries, totalLength: cur };
}

/**
 * computeAssemblySequence — concat of cached segment sequences (frozen
 * semantics). Unknown placeholder (manual, empty seq, explicit length)
 * → 'N'×length. Container-sourced whose source was removed keeps its
 * cached sequence but is reported in `orphans` (keep-with-warning).
 */
export function computeAssemblySequence(draft) {
  const orphans = [];
  const parts = [];
  const segmentMap = [];
  let cur = 0;
  for (let i = 0; i < (draft?.segments || []).length; i += 1) {
    const s = draft.segments[i];
    let seq;
    if (typeof s.sequence === 'string' && s.sequence.length > 0) {
      seq = s.sequence;
    } else {
      seq = 'N'.repeat(segmentLength(s));
    }
    if (s.source?.type === 'container' && s.source.unavailable) {
      orphans.push({ segmentId: s.id, reason: 'source-unavailable' });
    }
    parts.push(seq);
    segmentMap.push({
      segmentId: s.id, segmentIndex: i,
      offsetStart: cur, offsetEnd: cur + seq.length,
      color: s.color, label: s.label, source: s.source,
    });
    cur += seq.length;
  }
  return {
    sequence: parts.join(''),
    segmentMap,
    topology: draft?.topology || { circular: false },
    orphans,
  };
}
