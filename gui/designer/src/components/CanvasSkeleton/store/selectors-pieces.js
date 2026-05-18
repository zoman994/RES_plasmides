/**
 * selectors-pieces — pure derived reads over state.pieces (T1 K4).
 * Parallels selectors-assembly. selectPieceSequence merges the piece's
 * ranges off their source containers (RC on reverse-orientation ranges).
 */
import { reverseComplement } from '../../../sequence-utils';
import { draftFromZone } from '../lib/zone-pieces-to-dag';
import { selectCrossZoneSourcesForZone } from '../lib/zone-link-resolver';
import {
  selectVariantGroup, selectMaterializedClones,
  selectVariantKindForFinals, variantGroupLabel,
} from '../lib/variant-resolver';

// T8 K4 (DEC-T8-08) — re-export so UI imports stay on selectors-pieces.
export { selectCrossZoneSourcesForZone };
// T9 K8 (§5.4) — variant selectors re-exported through selectors-pieces.
export {
  selectVariantGroup, selectMaterializedClones,
  selectVariantKindForFinals, variantGroupLabel,
};

/** T8 K4 (§5.8) — ops that are a piece's derivedReaction. */
export function selectAutoCreatedReactions(state) {
  const ids = new Set(
    ((state && state.pieces) || [])
      .filter((p) => p.derivedReactionId)
      .map((p) => p.derivedReactionId),
  );
  return ((state && state.operations) || []).filter((op) => ids.has(op.id));
}

export function selectAllPieces(state) {
  return (state && state.pieces) || [];
}

export function selectPieceById(state, pieceId) {
  return selectAllPieces(state).find((p) => p.id === pieceId) || null;
}

/** T1: zoneId is always null until T3 sets it. */
export function selectPiecesByZoneId(state, zoneId) {
  return selectAllPieces(state).filter((p) => p.zoneId === zoneId);
}

/**
 * selectPieceSequence — concat of each range sliced off its source
 * container (RC when orientation === 'reverse'). Returns null if the
 * piece or any source container is missing; '' for a piece with no
 * ranges.
 */
export function selectPieceSequence(state, pieceId) {
  const piece = selectPieceById(state, pieceId);
  if (!piece) return null;
  // T2 R-T2-6: a frozen piece returns its snapshot, not a live recompute
  // (source container may have changed after the op was executed).
  if (piece.frozen && piece.frozenSequence != null) return piece.frozenSequence;
  const containers = (state && state.containers) || [];
  const ranges = Array.isArray(piece.ranges) ? piece.ranges : [];
  let out = '';
  for (const r of ranges) {
    const container = containers.find((c) => c.id === r.sourceId);
    if (!container) return null;
    const sub = String(container.sequence || '').slice(r.start, r.end);
    out += r.orientation === 'reverse' ? reverseComplement(sub) : sub;
  }
  return out;
}

export function selectPiecesUsingContainer(state, containerId) {
  return selectAllPieces(state).filter(
    (p) => Array.isArray(p.sourceIds) && p.sourceIds.includes(containerId),
  );
}

export function selectPiecesByOrigin(state, origin) {
  return selectAllPieces(state).filter((p) => p.origin === origin);
}

/**
 * T10 K4 (§5.2) — materialized clones in a zone, grouped by parent op
 * (each clone enriched with its container). Only ops in the zone that
 * carry materializedClones are included.
 */
export function selectClonesInZone(state, zoneId) {
  const containers = (state && state.containers) || [];
  return ((state && state.operations) || [])
    .filter((op) => op.zoneId === zoneId && Array.isArray(op.materializedClones))
    .map((op) => ({
      op,
      clones: op.materializedClones.map((c) => ({
        ...c,
        container: containers.find((ctn) => ctn.id === c.cloneId),
      })),
    }));
}

/** T10 K4 — { groupedByOp, counts:{pending,verified,failed,unplanned} }. */
export function selectSangerSummaryForZone(state, zoneId) {
  const groupedByOp = selectClonesInZone(state, zoneId);
  const counts = {
    pending: 0, verified: 0, failed: 0, unplanned: 0,
  };
  for (const { clones } of groupedByOp) {
    for (const c of clones) {
      if (c.sangerVerified === 'pending') counts.pending += 1;
      else if (c.sangerVerified === 'verified') counts.verified += 1;
      else if (c.sangerVerified === 'failed') counts.failed += 1;
      else counts.unplanned += 1;
    }
  }
  return { groupedByOp, counts };
}

/** T2 K10 — pieces referenced by an operation's inputPieces. */
export function selectPiecesForOperation(state, opId) {
  const op = ((state && state.operations) || []).find((o) => o.id === opId);
  if (!op || !Array.isArray(op.inputPieces)) return [];
  const pieces = selectAllPieces(state);
  return op.inputPieces
    .map((pid) => pieces.find((p) => p.id === pid))
    .filter(Boolean);
}

/** T2 K10 — operations referencing a piece (T8 cascade / UI). */
export function selectOperationsUsingPiece(state, pieceId) {
  return ((state && state.operations) || []).filter(
    (op) => Array.isArray(op.inputPieces) && op.inputPieces.includes(pieceId),
  );
}

/**
 * T6 K7 (DEC-T6-07) — a zone projected as an assembly-draft-like object
 * so the existing assembly-mode UI (segmentBoundaries /
 * computeAssemblySequence / SegmentList / SegmentDetailPanel) renders a
 * zone's pieces with no shape rewrite. Reuses the K5 `draftFromZone`
 * bridge (pieces ordered by createdAt, sequences reconstructed, RC on
 * reverse, missing source → source.unavailable, gap → manual no-seq).
 * Returns null if the zone is absent (caller falls back to the legacy
 * assemblyDrafts path during the T6 transition window).
 */
export function selectZoneAsDraftLike(state, zoneId) {
  const zone = ((state && state.zones) || []).find((z) => z.id === zoneId);
  if (!zone) return null;
  return draftFromZone(state, zone);
}

/**
 * T6 K7/K8 — dual-resolve a target id used by the assembly-mode shell &
 * its panels. A zone id → `{ draft: <zone-projected>, zoneMode: true }`;
 * otherwise the legacy assemblyDrafts slice (transition window). Plain
 * selector so both `useAssemblyTarget` and SegmentDetailPanel share one
 * resolution path.
 */
export function selectAssemblyTarget(state, targetId) {
  if (!targetId) return { draft: null, zoneMode: false };
  const zoneDraft = selectZoneAsDraftLike(state, targetId);
  if (zoneDraft) return { draft: zoneDraft, zoneMode: true };
  const legacy = ((state && state.assemblyDrafts) || []).find((d) => d.id === targetId) || null;
  return { draft: legacy, zoneMode: false };
}
