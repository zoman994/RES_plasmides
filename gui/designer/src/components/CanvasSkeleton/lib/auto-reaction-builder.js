/**
 * auto-reaction-builder — T8 K2 (§5.1, DEC-T8-02/03/04/07). Pure
 * builders deriving an UPSTREAM reaction op from a piece's
 * acquisitionMethod. T8 auto-creates only the upstream PCR-like /
 * Cut op; downstream Ligate/Gibson is the T7 implicit junction
 * (DEC-T8-04). No reaction for synthesis / direct / undefined / gap.
 */
import { v7 as uuidv7 } from 'uuid';

export function shouldHaveReaction(piece) {
  if (!piece) return false;
  if (piece.kind === 'gap') return false;
  const m = piece.acquisitionMethod;
  return m !== 'undefined' && m !== 'direct' && m !== 'synthesis' && !!m;
}

export function mapMethodToKind(method) {
  switch (method) {
    case 'pcr': return 'pcr';
    case 'ov-pcr': return 'pcr'; // OV-PCR amplifies via PCR; overlap is the implicit junction
    case 'restriction': return 'cut';
    default: return null;
  }
}

/** Left of the piece (−220x); shift down 80px ×10 on collision; corner fallback. */
export function findInsertPositionForReaction(piecePosition, state) {
  const base = piecePosition || { x: 200, y: 200 };
  let candidate = { x: base.x - 220, y: base.y };
  const positions = Object.values((state && state.positions) || {});
  for (let i = 0; i < 10; i += 1) {
    const collision = positions.some(
      (p) => p && Math.abs(p.x - candidate.x) < 50 && Math.abs(p.y - candidate.y) < 50,
    );
    if (!collision) return candidate;
    candidate = { ...candidate, y: candidate.y + 80 };
  }
  return { x: 50, y: 50 };
}

/** Reaction op for a piece (full op shape, id included). null if not mappable. */
export function buildReactionForPiece(piece, state) {
  const kind = mapMethodToKind(piece && piece.acquisitionMethod);
  if (!kind) return null;

  const piecePos = (state && state.positions && state.positions[piece.id]) || { x: 200, y: 200 };
  const position = findInsertPositionForReaction(piecePos, state);

  const ap = piece.acquisitionParams || {};
  const sourceIds = Array.isArray(piece.sourceIds) ? piece.sourceIds : [];
  const ranges = Array.isArray(piece.ranges) ? piece.ranges : [];
  const params = {};
  if (kind === 'pcr') {
    if (ap.primerPairId) params.primerPairId = ap.primerPairId;
    if (sourceIds.length > 0) params.templateId = sourceIds[0];
    if (ranges.length > 0) {
      params.range = { start: ranges[0].start, end: ranges[0].end };
      // An origin-crossing amplicon is an ordinary PCR whose coordinates wrap.
      // Without this flag the executor would read `end < start` as an error.
      if (ranges[0].wrapsOrigin === true) params.wrapsOrigin = true;
    }
    // PRIMER-LIVE-1 — WHICH landings, and WHAT was on the bench. These travel
    // onto the reaction so it can still say what it was primed with after the
    // pool has moved on, and on a machine whose freezer holds none of it.
    if (Array.isArray(ap.occurrenceKeys)) params.occurrenceKeys = [...ap.occurrenceKeys];
    // The product the biolog approved, and the molecule version it was
    // approved against — both must reach the executor, or it silently
    // re-derives a different answer from whatever the template is now.
    if (typeof ap.productSequence === 'string') params.productSequence = ap.productSequence;
    if (ap.documentIdentity) params.documentIdentity = ap.documentIdentity;
    if (ap.primerSnapshots) {
      params.primerSnapshots = {
        forward: { ...ap.primerSnapshots.forward },
        reverse: { ...ap.primerSnapshots.reverse },
      };
    }
  } else if (kind === 'cut') {
    if (Array.isArray(ap.enzymes) && ap.enzymes.length > 0) {
      [params.enzymeName] = ap.enzymes;
    }
    if (Array.isArray(ap.cutSites) && ap.cutSites[0]) {
      params.position = ap.cutSites[0].position;
    }
  }

  return {
    id: `op-${uuidv7()}`,
    kind,
    status: 'committed', // DEC-T8-02 — biolog already chose the method
    position,
    inputs: sourceIds.slice(), // legacy compat
    inputPieces: [piece.id], // DEC-T8-03 primary T2 field
    zoneId: piece.zoneId || null,
    outputs: [],
    params,
    junctionRefs: [],
    materializedClones: null, // T9 — shape parity with createOperationDraft
    createdAt: new Date().toISOString(),
    executedAt: null,
    error: null,
  };
}

/**
 * applyAutoReactions — T8 K5 finalizer body (DEC-T8-01/06/11/12).
 * Pure, idempotent: one O(N) pass that keeps each piece's
 * derivedReaction in sync with its acquisitionMethod.
 *  - shouldHaveReaction && (no derivedReaction | stale ref | kind no
 *    longer matches the method, DEC-T8-12) → (drop old) + create.
 *  - !shouldHaveReaction && derivedReaction set → remove op + clear.
 * Returns the SAME state ref when nothing changes (loop-safe, R-T8-2).
 */
export function applyAutoReactions(state) {
  if (!state || !Array.isArray(state.pieces)) return state;
  let ops = state.operations || [];
  let positions = state.positions || {};
  let pieces = state.pieces;
  let changed = false;

  const opById = (id) => ops.find((o) => o.id === id) || null;

  const nextPieces = pieces.map((piece) => {
    const want = shouldHaveReaction(piece);
    const existing = piece.derivedReactionId ? opById(piece.derivedReactionId) : null;

    if (want) {
      const expectedKind = mapMethodToKind(piece.acquisitionMethod);
      if (existing && existing.kind === expectedKind) return piece; // in sync
      // stale ref OR method changed (DEC-T8-12) → drop old, recreate.
      if (existing) {
        ops = ops.filter((o) => o.id !== existing.id);
        const { [existing.id]: _drop, ...restPos } = positions;
        positions = restPos;
      }
      const op = buildReactionForPiece(piece, { ...state, operations: ops, positions });
      if (!op) {
        if (piece.derivedReactionId == null) return piece;
        changed = true;
        return { ...piece, derivedReactionId: null };
      }
      ops = [...ops, op];
      positions = { ...positions, [op.id]: op.position };
      changed = true;
      return { ...piece, derivedReactionId: op.id };
    }

    // !want — tear down any derived reaction.
    if (piece.derivedReactionId == null) return piece;
    if (existing) {
      ops = ops.filter((o) => o.id !== existing.id);
      const { [existing.id]: _drop, ...restPos } = positions;
      positions = restPos;
    }
    changed = true;
    return { ...piece, derivedReactionId: null };
  });

  if (!changed) return state;
  return {
    ...state, pieces: nextPieces, operations: ops, positions,
  };
}
