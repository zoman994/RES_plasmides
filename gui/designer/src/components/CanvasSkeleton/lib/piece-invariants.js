/**
 * piece-invariants — hard caps + shape validation for the Piece entity
 * (T1 K2, DEC-T1-09/10). Parallels assembly-invariants: every validator
 * is pure and STRINGS-free, returning `{ ok: true }` or
 * `{ ok: false, error: <terse english>, code: <stable enum> }`. The
 * reducer (K3) maps `code` → localized toast via STRINGS.
 */

export const PIECE_CAPS = Object.freeze({
  MAX_PIECES: 500,
  MAX_RANGES_PER_PIECE: 200,
  MIN_RANGE_LENGTH: 1,
  MAX_NAME_LENGTH: 200,
  COLOR_COLLISION_THRESHOLD: 12,
});

export const ORIGIN_ENUM = Object.freeze([
  'selection', 'feature', 'existing-primers', 'new-primers', 'legacy-migration',
  'manual-gap', // T6 DEC-T6-02 — gap pieces
  // M-CANVAS-WORKFLOW-UX (SPEC §6.1) — inline-sequence pieces.
  'snippet', 'synthesis', 'intermediate',
  // PRIMER-LIVE-1 — authored from two primer landings the biolog actually
  // chose on the sequence. Distinct from 'existing-primers', which searches
  // the template for a pair by sequence: this one already knows WHICH sites,
  // and carries them so nothing downstream has to guess again.
  'pcr-occurrences',
]);
const GAP_MAX_LENGTH = 10000;
// Inline-sequence kinds (no source container / ranges; carry `sequence`).
const INLINE_KINDS = new Set(['snippet', 'synthesis', 'intermediate']);
export const ACQUISITION_METHOD_ENUM = Object.freeze([
  'undefined', 'pcr', 'ov-pcr', 'restriction', 'direct', 'synthesis',
]);
const ORIENTATION_ENUM = ['forward', 'reverse'];

const ok = { ok: true };
const fail = (code, error) => ({ ok: false, code, error });

function isInt(n) {
  return typeof n === 'number' && Number.isInteger(n);
}

/**
 * validateRangeOnContainer — a single PieceRange against its source
 * container: 0-based, start < end, ≥ MIN_RANGE_LENGTH, in-bounds,
 * orientation ∈ {forward, reverse}.
 */
export function validateRangeOnContainer(range, container) {
  if (!range || typeof range !== 'object') {
    return fail('INVALID_RANGE', 'range missing');
  }
  const { start, end, orientation } = range;
  if (!isInt(start) || !isInt(end)) {
    return fail('INVALID_RANGE', 'range start/end must be integers');
  }
  if (start < 0) return fail('INVALID_RANGE', 'range start < 0');
  if (start >= end) return fail('INVALID_RANGE', 'range start >= end');
  if ((end - start) < PIECE_CAPS.MIN_RANGE_LENGTH) {
    return fail('INVALID_RANGE', 'range shorter than MIN_RANGE_LENGTH');
  }
  if (!ORIENTATION_ENUM.includes(orientation)) {
    return fail('INVALID_RANGE', 'range orientation must be forward|reverse');
  }
  const seqLen = String(container?.sequence || '').length;
  if (end > seqLen) {
    return fail('INVALID_RANGE', `range end ${end} exceeds source length ${seqLen}`);
  }
  return ok;
}

function validateShape(state, piece) {
  const containers = (state && state.containers) || [];
  const name = piece && piece.name;
  if (typeof name === 'string' && name.length > PIECE_CAPS.MAX_NAME_LENGTH) {
    return fail('NAME_TOO_LONG', `name length ${name.length} > ${PIECE_CAPS.MAX_NAME_LENGTH}`);
  }

  // T7 DEC-T7-04 — order is a nullable non-negative integer (assembled
  // strip index). null/undefined = unattached (palette).
  const ord = piece && piece.order;
  if (ord !== null && ord !== undefined && (!isInt(ord) || ord < 0)) {
    return fail('INVALID_RANGE', `order must be null or a non-negative integer (got ${ord})`);
  }

  // T9 DEC-T9-02 — variantGroupId is a nullable string ('vg-<uuid>').
  const vg = piece && piece.variantGroupId;
  if (vg !== null && vg !== undefined && typeof vg !== 'string') {
    return fail('INVALID_RANGE', 'variantGroupId must be null or a string');
  }

  // T6 DEC-T6-02/10 — gap piece: no source/ranges; gapLength 0..10000.
  if (piece && piece.kind === 'gap') {
    if (!ORIGIN_ENUM.includes(piece.origin)) {
      return fail('INVALID_ORIGIN', `origin "${piece.origin}" not in enum`);
    }
    const g = piece.gapLength;
    if (!isInt(g) || g < 0 || g > GAP_MAX_LENGTH) {
      return fail('INVALID_RANGE', `gapLength must be an integer 0..${GAP_MAX_LENGTH}`);
    }
    // V83 — optional known sequence; when present it IS the gap, so the
    // declared length must match it. Absence = unknown-length placeholder.
    const gs = piece.gapSequence;
    if (gs !== undefined && gs !== null) {
      if (typeof gs !== 'string' || gs.length === 0) {
        return fail('INVALID_RANGE', 'gapSequence must be a non-empty string when present');
      }
      if (gs.length !== g) {
        return fail('INVALID_RANGE', 'gapLength must equal gapSequence.length');
      }
    }
    return ok;
  }

  // M-CANVAS-WORKFLOW-UX (SPEC §6.1) — snippet / synthesis /
  // intermediate: inline `sequence`, no source container or ranges.
  // (intermediate may be empty pre-finalize; snippet/synthesis carry a
  // real sequence — capped like a gap.)
  if (piece && INLINE_KINDS.has(piece.kind)) {
    if (!ORIGIN_ENUM.includes(piece.origin)) {
      return fail('INVALID_ORIGIN', `origin "${piece.origin}" not in enum`);
    }
    const seq = piece.sequence;
    if (typeof seq !== 'string') {
      return fail('INVALID_RANGE', `${piece.kind} piece requires a string sequence`);
    }
    if (seq.length > GAP_MAX_LENGTH) {
      return fail('INVALID_RANGE', `sequence length ${seq.length} > ${GAP_MAX_LENGTH}`);
    }
    if (piece.kind !== 'intermediate' && seq.length === 0) {
      return fail('INVALID_RANGE', `${piece.kind} piece requires a non-empty sequence`);
    }
    return ok;
  }

  const sourceIds = piece && piece.sourceIds;
  const ranges = piece && piece.ranges;
  if (!Array.isArray(sourceIds) || !Array.isArray(ranges)) {
    return fail('INVALID_RANGE', 'sourceIds / ranges must be arrays');
  }
  if (sourceIds.length < 1) {
    return fail('INVALID_RANGE', 'sourceIds must have at least one entry');
  }
  if (sourceIds.length !== ranges.length) {
    return fail('INVALID_RANGE', 'sourceIds.length must equal ranges.length');
  }
  if (ranges.length > PIECE_CAPS.MAX_RANGES_PER_PIECE) {
    return fail('TOO_MANY_RANGES', `ranges ${ranges.length} > ${PIECE_CAPS.MAX_RANGES_PER_PIECE}`);
  }

  if (!ORIGIN_ENUM.includes(piece.origin)) {
    return fail('INVALID_ORIGIN', `origin "${piece.origin}" not in enum`);
  }
  if (!ACQUISITION_METHOD_ENUM.includes(piece.acquisitionMethod)) {
    return fail('INVALID_METHOD', `acquisitionMethod "${piece.acquisitionMethod}" not in enum`);
  }
  // Spec §5.7 vs §5.3: 'direct' is a real method whose params are
  // legitimately {} (source = the piece as-is). Only param-bearing
  // methods (pcr / ov-pcr / restriction / synthesis) require non-empty
  // acquisitionParams.
  if (piece.acquisitionMethod !== 'undefined' && piece.acquisitionMethod !== 'direct') {
    const p = piece.acquisitionParams;
    if (!p || typeof p !== 'object' || Object.keys(p).length === 0) {
      return fail('INVALID_METHOD', `acquisitionParams required for method "${piece.acquisitionMethod}"`);
    }
  }

  for (let i = 0; i < sourceIds.length; i += 1) {
    const cid = sourceIds[i];
    const container = containers.find((c) => c.id === cid);
    if (!container) {
      return fail('CONTAINER_NOT_FOUND', `source container "${cid}" not found`);
    }
    const r = validateRangeOnContainer(ranges[i], container);
    if (!r.ok) return r;
  }
  return ok;
}

/** validateCreate — hard cap + full shape (§5.3). */
export function validateCreate(state, rawPiece) {
  const pieces = (state && state.pieces) || [];
  if (pieces.length >= PIECE_CAPS.MAX_PIECES) {
    return fail('TOO_MANY', `piece count ${pieces.length} >= ${PIECE_CAPS.MAX_PIECES}`);
  }
  return validateShape(state, rawPiece || {});
}

/** validateUpdate — same shape checks on the merged piece (§5.4). */
export function validateUpdate(state, existingPiece, changes) {
  const merged = { ...(existingPiece || {}), ...(changes || {}) };
  return validateShape(state, merged);
}
