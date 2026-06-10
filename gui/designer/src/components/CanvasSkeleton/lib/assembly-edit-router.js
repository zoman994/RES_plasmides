/**
 * assembly-edit-router — pure translation of an `onSequenceEdit`-op
 * (expressed in ASSEMBLY coordinates) into piece operation(s)
 * (SPEC_EDITABLE_ASSEMBLY_S1 §5.2–5.5 + S2 §5.1–5.7). No dispatch, no
 * store — the shell handler (AssemblyShellBody) applies the result.
 *
 * Input op (emitted by useSequenceKeyboard in editable mode):
 *   { kind:'insert',  pos, char }
 *   { kind:'delete',  pos, length }
 *   { kind:'replace', start, end, replacement }
 *
 * `draft`      — the assembly draft-like (draftFromZone shape). Each
 *                segment carries `pieceKind`, a cached `sequence` /
 *                `length`, and for sourced pieces `start`/`end`/
 *                `reverseComplement` + `source.containerId`.
 * `boundaries` — segmentBoundaries(draft).boundaries (startOnAssembly /
 *                endOnAssembly / segmentIndex per segment).
 *
 * Result is exactly one of:
 *   { kind:'update-inline', pieceId, targetKind, sequence, kindFlip? }  (S1)
 *   { kind:'remove-block',  pieceId }                                   (S1)
 *   { kind:'new-block',     insertAtIndex, char }                       (S1)
 *   { kind:'split-insert',  pieceId, atOffset, char, insertAtIndex }    (S2)
 *   { kind:'mutate',        pieceId, mutations:[…] }                    (S2)
 *   { kind:'trim',          pieceId, range }                            (S2)
 *   { kind:'split-delete',  pieceId, atOffset, deleteLen,
 *                           insertSeq?, insertAtIndex? }                (S2)
 *   { kind:'plan',          steps:[…] }                                 (S2)
 *   { kind:'noop',          reason }
 *
 * Position model (left-biased, satisfies the S1 "ATG → one block"
 * requirement): an inline piece OWNS an insert position `pos` when
 * `start < pos <= end`. A sourced-piece interior insert now SPLITS the
 * piece (S2). A clean boundary / assembly edge → new block.
 */

export const SYNTHESIS_THRESHOLD_DEFAULT = 80;

/**
 * computeSeqDelta — the signed length change an edit op makes to the
 * assembled sequence, with the position it happens at
 * (SPEC_EDITABLE_ASSEMBLY_S3 §5.2). A pure function of the op only (the
 * routing result never alters it), so the shell handler calls it
 * directly to drive SHIFT_ASSEMBLY_PRIMERS. `delta:0` for an
 * equal-length substitution (coords stay, in-region primers go stale).
 */
export function computeSeqDelta(op) {
  if (!op || typeof op !== 'object') return null;
  if (op.kind === 'insert') return { atPos: op.pos, delta: 1 };
  if (op.kind === 'delete') {
    return { atPos: op.pos, delta: -(Number.isFinite(op.length) ? op.length : 1) };
  }
  if (op.kind === 'replace') {
    const repl = typeof op.replacement === 'string' ? op.replacement.length : 0;
    return { atPos: op.start, delta: repl - (op.end - op.start) };
  }
  return null;
}

// Kinds whose own sequence can be edited in place. The op-group-derived
// 'intermediate' is reconstructed by the finalizer → not editable here.
const INLINE_EDITABLE = new Set(['snippet', 'synthesis', 'gap']);

function segForBoundary(draft, b) {
  return ((draft && draft.segments) || [])[b.segmentIndex] || null;
}

function editableKindOf(seg) {
  const k = seg && seg.pieceKind;
  return INLINE_EDITABLE.has(k) ? k : null;
}

function inlineSequenceOf(seg) {
  if (!seg) return '';
  if (typeof seg.sequence === 'string' && seg.sequence.length > 0) return seg.sequence;
  if (seg.pieceKind === 'gap') return 'N'.repeat(Math.max(0, Number(seg.length) || 0));
  return '';
}

/** Source range of a sourced draft segment ({sourceId,start,end,orientation}). */
function segRange(seg) {
  return {
    sourceId: seg.source && seg.source.containerId,
    start: seg.start,
    end: seg.end,
    orientation: seg.reverseComplement ? 'reverse' : 'forward',
  };
}

/** rc-aware narrowing of a source range by `dropLeft` (assembled-left) /
 *  `dropRight` (assembled-right) nucleotides. */
function trimRange(r, dropLeft, dropRight) {
  if (r.orientation === 'reverse') {
    return { ...r, start: r.start + dropRight, end: r.end - dropLeft };
  }
  return { ...r, start: r.start + dropLeft, end: r.end - dropRight };
}

function resolveThreshold(opts) {
  const t = opts && opts.threshold;
  return Number.isFinite(t) ? t : SYNTHESIS_THRESHOLD_DEFAULT;
}

function applyToInline(seg, nextSeq, threshold) {
  if (nextSeq.length === 0) return { kind: 'remove-block', pieceId: seg.id };
  const targetKind = seg.pieceKind;
  const res = {
    kind: 'update-inline', pieceId: seg.id, targetKind, sequence: nextSeq,
  };
  if (targetKind === 'snippet' && nextSeq.length > threshold) res.kindFlip = 'synthesis';
  else if (targetKind === 'synthesis' && nextSeq.length <= threshold) res.kindFlip = 'snippet';
  return res;
}

function resolveInsert(draft, boundaries, pos, char, threshold) {
  // Owner of the LEFT side of `pos`: start < pos <= end (unique).
  let owner = null;
  for (const b of boundaries) {
    if (b.startOnAssembly < pos && pos <= b.endOnAssembly) { owner = b; break; }
  }
  if (!owner) {
    const idx = pos <= 0 ? 0 : boundaries.length;
    return { kind: 'new-block', insertAtIndex: idx, char };
  }
  const seg = segForBoundary(draft, owner);
  const k = editableKindOf(seg);
  if (k) {
    const cur = inlineSequenceOf(seg);
    const off = pos - owner.startOnAssembly;
    const nextSeq = cur.slice(0, off) + char + cur.slice(off);
    return applyToInline(seg, nextSeq, threshold);
  }
  // Sourced (or intermediate) piece.
  if (pos === owner.endOnAssembly) {
    return { kind: 'new-block', insertAtIndex: owner.segmentIndex + 1, char };
  }
  // Intermediate piece interior — not editable in this wave.
  if (seg && seg.pieceKind === 'intermediate') {
    return { kind: 'noop', reason: 'intermediate-interior' };
  }
  // S2 §5.1/§3 — insert strictly inside a sourced piece → split + block.
  return {
    kind: 'split-insert',
    pieceId: seg.id,
    atOffset: pos - owner.startOnAssembly,
    char,
    insertAtIndex: owner.segmentIndex + 1,
  };
}

/** Substitution diff inside one sourced piece (equal-length replace). */
function buildMutations(seg, localStart, replacement) {
  const cur = typeof seg.sequence === 'string' ? seg.sequence : '';
  const mutations = [];
  for (let i = 0; i < replacement.length; i += 1) {
    const from = cur[localStart + i] || '';
    const to = replacement[i].toUpperCase();
    if (from.toUpperCase() !== to) {
      mutations.push({
        position: localStart + i, fromBase: from.toUpperCase(), toBase: to, kind: 'silent', notes: 'editable-view',
      });
    }
  }
  return mutations;
}

/** A single sourced piece edit (delete / different-length replace). */
function resolveSingleSourced(seg, b, start, end, replacement) {
  const pieceLen = b.endOnAssembly - b.startOnAssembly;
  const localStart = start - b.startOnAssembly;
  const localEnd = end - b.startOnAssembly;
  const rangeLen = end - start;
  const r = segRange(seg);
  const insertSeq = replacement || '';

  // Equal-length replace → substitution (mutations[]). Non-empty only.
  if (insertSeq.length === rangeLen && insertSeq.length > 0) {
    return { kind: 'mutate', pieceId: seg.id, mutations: buildMutations(seg, localStart, insertSeq) };
  }

  // Whole piece selected.
  if (localStart === 0 && localEnd === pieceLen) {
    if (!insertSeq) return { kind: 'remove-block', pieceId: seg.id };
    return {
      kind: 'plan',
      steps: [
        { op: 'remove', pieceId: seg.id },
        { op: 'insert-snippet', insertAtIndex: b.segmentIndex, sequence: insertSeq },
      ],
    };
  }
  // Left edge → trim the left side.
  if (localStart === 0) {
    const trimmed = { kind: 'trim', pieceId: seg.id, range: trimRange(r, rangeLen, 0) };
    if (!insertSeq) return trimmed;
    return { kind: 'plan', steps: [trimmed, { op: 'insert-snippet', insertAtIndex: b.segmentIndex, sequence: insertSeq }] };
  }
  // Right edge → trim the right side.
  if (localEnd === pieceLen) {
    const trimmed = { kind: 'trim', pieceId: seg.id, range: trimRange(r, 0, rangeLen) };
    if (!insertSeq) return trimmed;
    return { kind: 'plan', steps: [trimmed, { op: 'insert-snippet', insertAtIndex: b.segmentIndex + 1, sequence: insertSeq }] };
  }
  // Mid → split + drop the right half's leading nt; optional inserted block.
  return {
    kind: 'split-delete',
    pieceId: seg.id,
    atOffset: localStart,
    deleteLen: rangeLen,
    ...(insertSeq ? { insertSeq, insertAtIndex: b.segmentIndex + 1 } : {}),
  };
}

/** Spanning delete / replace across ≥2 pieces → a step plan. */
function buildSpanningPlan(draft, boundaries, overlapped, start, end, replacement) {
  const steps = [];
  for (const b of overlapped) {
    const seg = segForBoundary(draft, b);
    const pieceLen = b.endOnAssembly - b.startOnAssembly;
    const ovStart = Math.max(start, b.startOnAssembly);
    const ovEnd = Math.min(end, b.endOnAssembly);
    const localStart = ovStart - b.startOnAssembly;
    const localEnd = ovEnd - b.startOnAssembly;
    if (localStart === 0 && localEnd === pieceLen) {
      steps.push({ op: 'remove', pieceId: seg.id });
      continue;
    }
    const k = editableKindOf(seg);
    if (k) {
      const cur = inlineSequenceOf(seg);
      const nextSeq = cur.slice(0, localStart) + cur.slice(localEnd);
      if (nextSeq.length === 0) steps.push({ op: 'remove', pieceId: seg.id });
      else steps.push({ op: 'splice-inline', pieceId: seg.id, sequence: nextSeq, targetKind: seg.pieceKind });
      continue;
    }
    // Sourced partial — in a span the overlap is always at a piece edge.
    const r = segRange(seg);
    if (localStart === 0) {
      steps.push({ op: 'trim', pieceId: seg.id, range: trimRange(r, localEnd, 0) });
    } else if (localEnd === pieceLen) {
      steps.push({ op: 'trim', pieceId: seg.id, range: trimRange(r, 0, pieceLen - localStart) });
    } // interior partial cannot occur in a multi-piece span
  }
  if (replacement) {
    // Insert the replacement as a new block at the seam (after the piece
    // owning the left side of `start`; index 0 at the assembly start).
    let leftOwner = null;
    for (const b of boundaries) {
      if (b.startOnAssembly < start && start <= b.endOnAssembly) { leftOwner = b; break; }
    }
    const insertAtIndex = leftOwner ? leftOwner.segmentIndex + 1 : 0;
    steps.push({ op: 'insert-snippet', insertAtIndex, sequence: replacement });
  }
  return { kind: 'plan', steps };
}

function resolveRange(draft, boundaries, start, end, replacement, threshold) {
  const overlapped = boundaries.filter(
    (b) => Math.max(start, b.startOnAssembly) < Math.min(end, b.endOnAssembly),
  );
  if (overlapped.length === 0) return { kind: 'noop', reason: 'out-of-range' };

  if (overlapped.length === 1) {
    const b = overlapped[0];
    const seg = segForBoundary(draft, b);
    const k = editableKindOf(seg);
    if (k) {
      const cur = inlineSequenceOf(seg);
      const lo = start - b.startOnAssembly;
      const hi = end - b.startOnAssembly;
      const nextSeq = cur.slice(0, lo) + (replacement || '') + cur.slice(hi);
      return applyToInline(seg, nextSeq, threshold);
    }
    if (seg && seg.pieceKind === 'intermediate') {
      return { kind: 'noop', reason: 'intermediate-interior' };
    }
    return resolveSingleSourced(seg, b, start, end, replacement || '');
  }
  return buildSpanningPlan(draft, boundaries, overlapped, start, end, replacement || '');
}

export function routeAssemblyEdit(op, draft, boundaries, opts = {}) {
  const threshold = resolveThreshold(opts);
  const bs = Array.isArray(boundaries) ? boundaries : [];
  if (!op || typeof op !== 'object') return { kind: 'noop', reason: 'no-op' };

  if (op.kind === 'insert') {
    if (typeof op.pos !== 'number' || !Number.isFinite(op.pos)) return { kind: 'noop', reason: 'bad-insert' };
    if (typeof op.char !== 'string' || op.char.length === 0) return { kind: 'noop', reason: 'bad-insert' };
    return resolveInsert(draft, bs, op.pos, op.char, threshold);
  }
  if (op.kind === 'delete') {
    if (typeof op.pos !== 'number' || !Number.isFinite(op.pos)) return { kind: 'noop', reason: 'bad-delete' };
    const len = Number.isFinite(op.length) ? op.length : 1;
    if (len <= 0) return { kind: 'noop', reason: 'bad-delete' };
    return resolveRange(draft, bs, op.pos, op.pos + len, '', threshold);
  }
  if (op.kind === 'replace') {
    if (typeof op.start !== 'number' || typeof op.end !== 'number') return { kind: 'noop', reason: 'bad-replace' };
    if (!Number.isFinite(op.start) || !Number.isFinite(op.end) || op.end <= op.start) {
      return { kind: 'noop', reason: 'bad-replace' };
    }
    const replacement = typeof op.replacement === 'string' ? op.replacement : '';
    return resolveRange(draft, bs, op.start, op.end, replacement, threshold);
  }
  return { kind: 'noop', reason: 'unknown-kind' };
}
