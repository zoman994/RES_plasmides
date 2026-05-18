/**
 * skeleton-state-pieces — sub-reducer for state.pieces (T1,
 * DEC-CANVAS-4T-01). Fourth-tier "piece" entity, parallel to
 * containers / operations / junctions / assemblyDrafts. Pure data
 * layer — no UI, no op.params.range migration (T2), no auto-reactions
 * (T8). Follows the DEC-OPS-01 sub-reducer pattern: buildInitialX +
 * xReducer + isXAction Set guard; hard errors → state unchanged + an
 * error toast (the router stamps it).
 */
import { v7 as uuidv7 } from 'uuid';
import { createPiece, clonePiece } from '../lib/piece-model';
import {
  validateCreate, validateUpdate, PIECE_CAPS, ACQUISITION_METHOD_ENUM,
} from '../lib/piece-invariants';
import { STRINGS } from '../../../lib/strings';

const P = STRINGS.canvasSkeleton.pieces;

export function buildInitialPiecesState() {
  // T9 — highlightedVariantGroup is a transient {variantGroupId,until}.
  // Lives on the pieces slice root (no ui slice in CanvasSkeleton —
  // same pattern as T7 zones.focusedZoneId, DEC-T7-10).
  return { pieces: [], highlightedVariantGroup: null };
}

const PIECE_ACTIONS = new Set([
  'CREATE_PIECE', 'UPDATE_PIECE', 'REMOVE_PIECE', 'CLONE_PIECE',
  'SET_PIECE_ACQUISITION_METHOD', 'SET_PIECE_COLOR',
  'SET_PIECE_FUNCTIONAL_LABEL', 'SET_PIECE_ZONE', 'BUMP_PIECE_ORIGIN',
  // T7 — assembled-strip ordering (DEC-T7-04, §5.8).
  'ATTACH_PIECE_TO_ASSEMBLY', 'DETACH_PIECE_FROM_ASSEMBLY',
  'REORDER_PIECES_IN_ZONE',
  // T9 — design variants (DEC-T9-03/12, §5.3).
  'CREATE_DESIGN_VARIANT', 'REMOVE_FROM_VARIANT_GROUP', 'HIGHLIGHT_VARIANT_GROUP',
]);

export function isPieceAction(type) {
  return PIECE_ACTIONS.has(type);
}

/** Invariant `code` → localized toast message (§5.14). */
function localizeError(code, fallback) {
  switch (code) {
    case 'TOO_MANY':
      return P.errorTooMany.replace('{limit}', String(PIECE_CAPS.MAX_PIECES));
    case 'INVALID_RANGE':
      return P.errorInvalidRange;
    case 'CONTAINER_NOT_FOUND':
      return P.errorContainerNotFound;
    case 'TOO_MANY_RANGES':
      return P.errorTooManyRanges.replace('{limit}', String(PIECE_CAPS.MAX_RANGES_PER_PIECE));
    case 'NAME_TOO_LONG':
      return P.errorNameTooLong.replace('{max}', String(PIECE_CAPS.MAX_NAME_LENGTH));
    case 'INVALID_METHOD':
      return P.errorInvalidMethod;
    default:
      // INVALID_ORIGIN (no dedicated string) → invariant english text.
      return fallback || P.errorInvalidRange;
  }
}

function errToast(state, code, fallback) {
  return { ...state, toast: { kind: 'error', message: localizeError(code, fallback) } };
}

/** Find + patch one piece by id; state identity preserved if absent. */
function mapPiece(state, pieces, pieceId, patchFn) {
  const idx = pieces.findIndex((p) => p.id === pieceId);
  if (idx < 0) return state;
  const next = pieces.slice();
  next[idx] = patchFn(pieces[idx]);
  return { ...state, pieces: next };
}

/** Drop pieceIds from every op.inputPieces (op survives, DEC-T2-10). */
function stripPiecesFromOps(operations, idSet) {
  if (!Array.isArray(operations) || idSet.size === 0) return operations;
  let changed = false;
  const next = operations.map((op) => {
    const ip = Array.isArray(op.inputPieces) ? op.inputPieces : null;
    if (!ip || !ip.some((pid) => idSet.has(pid))) return op;
    changed = true;
    return { ...op, inputPieces: ip.filter((pid) => !idSet.has(pid)) };
  });
  return changed ? next : operations;
}

/** T7 — attached pieces in a zone, current strip order (DEC-T7-04). */
function attachedInZone(pieces, zoneId) {
  return pieces
    .filter((p) => p.zoneId === zoneId
      && typeof p.order === 'number' && Number.isFinite(p.order))
    .slice()
    .sort((a, b) => (a.order - b.order) || ((a.createdAt || 0) - (b.createdAt || 0)));
}

/** Write a contiguous 0..n-1 order onto `orderedIds`; others untouched. */
function packOrders(state, orderedIds) {
  const rank = new Map(orderedIds.map((id, i) => [id, i]));
  const now = Date.now();
  return {
    ...state,
    pieces: state.pieces.map((p) => (
      rank.has(p.id) ? { ...p, order: rank.get(p.id), updatedAt: now } : p
    )),
  };
}

/** T9 DEC-T9-12 — a variant group with ≤1 member disbands: clear the
 *  lone survivor's variantGroupId. Returns the (possibly new) array. */
function disbandOrphanGroup(pieces, groupId) {
  if (!groupId) return pieces;
  const members = pieces.filter((p) => p.variantGroupId === groupId);
  if (members.length > 1) return pieces;
  return pieces.map((p) => (
    p.variantGroupId === groupId ? { ...p, variantGroupId: null, updatedAt: Date.now() } : p
  ));
}

export function piecesReducer(state, action) {
  // ── Cross-domain prelude (parallels assemblyReducer's REMOVE_CONTAINER
  // handling — runs before the isPieceAction guard) ──────────────────

  // T2 DEC-T2-11 — container removed: drop it from piece.sourceIds /
  // ranges; a piece left with no sources is deleted (+ stripped from
  // ops, T1 invariant sourceIds≥1 upheld).
  if (action.type === 'REMOVE_CONTAINER') {
    const cid = action.containerId;
    const cur = state.pieces || [];
    if (!cid || cur.length === 0) return state;
    const removedIds = new Set();
    let touched = false;
    const nextPieces = [];
    for (const p of cur) {
      const src = Array.isArray(p.sourceIds) ? p.sourceIds : [];
      if (!src.includes(cid)) { nextPieces.push(p); continue; }
      touched = true;
      const ranges = Array.isArray(p.ranges) ? p.ranges : [];
      const keptSrc = [];
      const keptRanges = [];
      for (let i = 0; i < src.length; i += 1) {
        if (src[i] === cid) continue;
        keptSrc.push(src[i]);
        if (i < ranges.length) keptRanges.push(ranges[i]);
      }
      if (keptSrc.length === 0) {
        removedIds.add(p.id); // piece fully orphaned → delete
      } else {
        nextPieces.push({ ...p, sourceIds: keptSrc, ranges: keptRanges, updatedAt: Date.now() });
      }
    }
    if (!touched) return state;
    const nextOps = stripPiecesFromOps(state.operations, removedIds);
    return { ...state, pieces: nextPieces, operations: nextOps };
  }

  // T2 DEC-T2-13 recovery — OP_RESET (failed→committed, applied by
  // operationsReducer earlier in the chain) thaws that op's pieces.
  if (action.type === 'OP_RESET') {
    const op = (state.operations || []).find((o) => o.id === action.operationId);
    const ip = op && Array.isArray(op.inputPieces) ? op.inputPieces : [];
    if (ip.length === 0) return state;
    const idSet = new Set(ip);
    let changed = false;
    const nextPieces = (state.pieces || []).map((p) => {
      if (!idSet.has(p.id) || (!p.frozen && p.frozenSequence == null)) return p;
      changed = true;
      const { frozenSequence, ...rest } = p;
      return { ...rest, frozen: false };
    });
    return changed ? { ...state, pieces: nextPieces } : state;
  }

  if (!isPieceAction(action.type)) return state;
  const pieces = state.pieces || [];

  switch (action.type) {
    case 'CREATE_PIECE': {
      const v = validateCreate(state, action.piece);
      if (!v.ok) return errToast(state, v.code, v.error);
      const piece = createPiece(action.piece, pieces);
      return { ...state, pieces: [...pieces, piece] };
    }

    case 'UPDATE_PIECE': {
      const idx = pieces.findIndex((p) => p.id === action.pieceId);
      if (idx < 0) return state;
      const existing = pieces[idx];
      const changes = action.changes || {};
      // §5.4: ranges changed without explicit sourceIds → recompute
      // sourceIds parallel to the new ranges before validating.
      const effective = (Array.isArray(changes.ranges) && !changes.sourceIds)
        ? { ...changes, sourceIds: changes.ranges.map((r) => r && r.sourceId) }
        : changes;
      const v = validateUpdate(state, existing, effective);
      if (!v.ok) return errToast(state, v.code, v.error);
      const next = pieces.slice();
      next[idx] = { ...existing, ...effective, updatedAt: Date.now() };
      return { ...state, pieces: next };
    }

    case 'REMOVE_PIECE': {
      const removed = pieces.find((p) => p.id === action.pieceId);
      const next0 = pieces.filter((p) => p.id !== action.pieceId);
      if (next0.length === pieces.length) return state;
      // T9 DEC-T9-12 — if the removed piece was in a variant group and
      // ≤1 member is left, the group disbands (clear the survivor).
      const next = disbandOrphanGroup(next0, removed && removed.variantGroupId);
      // DEC-T2-10 — strip from op.inputPieces; the op itself survives.
      const nextOps = stripPiecesFromOps(state.operations, new Set([action.pieceId]));
      return { ...state, pieces: next, operations: nextOps };
    }

    case 'CLONE_PIECE': {
      const src = pieces.find((p) => p.id === action.pieceId);
      if (!src) return state;
      if (pieces.length >= PIECE_CAPS.MAX_PIECES) {
        return errToast(state, 'TOO_MANY');
      }
      const clone = clonePiece(src, action.overrides || {});
      return { ...state, pieces: [...pieces, clone] };
    }

    case 'SET_PIECE_ACQUISITION_METHOD': {
      const exists = pieces.some((p) => p.id === action.pieceId);
      if (!exists) return state;
      const method = action.method;
      if (!ACQUISITION_METHOD_ENUM.includes(method)) {
        return errToast(state, 'INVALID_METHOD');
      }
      const params = action.params || {};
      return mapPiece(state, pieces, action.pieceId, (p) => ({
        ...p,
        acquisitionMethod: method,
        acquisitionParams: params,
        // T8 DEC-T8-06 — the auto-reaction finalizer is the SINGLE owner
        // of derivedReactionId lifecycle. Keep the link intact here so
        // the finalizer can see `!shouldHaveReaction && derivedReactionId`
        // and remove the orphaned op + clear the ref atomically. (Pre-T8
        // this nulled it eagerly, which severed the link and leaked ops.)
        derivedReactionId: p.derivedReactionId,
        updatedAt: Date.now(),
      }));
    }

    case 'SET_PIECE_COLOR':
      return mapPiece(state, pieces, action.pieceId,
        (p) => ({ ...p, color: action.color, updatedAt: Date.now() }));

    case 'SET_PIECE_FUNCTIONAL_LABEL':
      return mapPiece(state, pieces, action.pieceId,
        (p) => ({ ...p, functionalLabel: action.functionalLabel, updatedAt: Date.now() }));

    case 'SET_PIECE_ZONE':
      return mapPiece(state, pieces, action.pieceId,
        (p) => ({ ...p, zoneId: action.zoneId, updatedAt: Date.now() }));

    case 'BUMP_PIECE_ORIGIN':
      return mapPiece(state, pieces, action.pieceId,
        (p) => ({ ...p, origin: action.origin, updatedAt: Date.now() }));

    // ── T7 assembled-strip ordering (§5.8) ──────────────────────────
    case 'ATTACH_PIECE_TO_ASSEMBLY': {
      const piece = pieces.find((p) => p.id === action.pieceId);
      if (!piece) return state;
      const zoneId = action.zoneId;
      // A zoneless piece adopts the zone; insert into its attached list
      // (excluding itself) at the clamped position, then re-pack.
      const others = attachedInZone(pieces, zoneId)
        .filter((p) => p.id !== action.pieceId)
        .map((p) => p.id);
      const at = Math.max(0, Math.min(Number(action.order) || 0, others.length));
      others.splice(at, 0, action.pieceId);
      const withZone = (piece.zoneId === zoneId)
        ? state
        : {
          ...state,
          pieces: pieces.map((p) => (
            p.id === action.pieceId ? { ...p, zoneId } : p
          )),
        };
      return packOrders(withZone, others);
    }

    case 'DETACH_PIECE_FROM_ASSEMBLY': {
      const piece = pieces.find((p) => p.id === action.pieceId);
      if (!piece || piece.order === null || piece.order === undefined) return state;
      const remaining = attachedInZone(pieces, piece.zoneId)
        .filter((p) => p.id !== action.pieceId)
        .map((p) => p.id);
      const cleared = {
        ...state,
        pieces: pieces.map((p) => (
          p.id === action.pieceId ? { ...p, order: null, updatedAt: Date.now() } : p
        )),
      };
      return packOrders(cleared, remaining);
    }

    // ── T9 design variants (§5.3) ───────────────────────────────────
    case 'CREATE_DESIGN_VARIANT': {
      const src = pieces.find((p) => p.id === action.sourcePieceId);
      if (!src) return state;
      if (pieces.length >= PIECE_CAPS.MAX_PIECES) return errToast(state, 'TOO_MANY');
      const groupId = src.variantGroupId || `vg-${uuidv7()}`;
      const ov = action.overrides || {};
      const variant = clonePiece(src, {
        variantGroupId: groupId,
        ...(ov.name != null ? { name: ov.name } : {}),
      });
      if (Array.isArray(ov.ranges)) {
        variant.ranges = ov.ranges.map((r) => ({ ...r }));
        variant.sourceIds = ov.ranges.map((r) => r.sourceId);
      }
      if (ov.acquisitionParams) variant.acquisitionParams = { ...ov.acquisitionParams };
      const v = validateCreate({ ...state, pieces }, variant);
      if (!v.ok) return errToast(state, v.code, v.error);
      const withGroup = pieces.map((p) => (
        p.id === src.id && p.variantGroupId !== groupId
          ? { ...p, variantGroupId: groupId, updatedAt: Date.now() }
          : p
      ));
      return { ...state, pieces: [...withGroup, variant] };
    }

    case 'REMOVE_FROM_VARIANT_GROUP': {
      const piece = pieces.find((p) => p.id === action.pieceId);
      if (!piece || !piece.variantGroupId) return state;
      const gid = piece.variantGroupId;
      const cleared = pieces.map((p) => (
        p.id === action.pieceId ? { ...p, variantGroupId: null, updatedAt: Date.now() } : p
      ));
      return { ...state, pieces: disbandOrphanGroup(cleared, gid) };
    }

    case 'HIGHLIGHT_VARIANT_GROUP': {
      const ms = Number(action.durationMs) || 0;
      return {
        ...state,
        highlightedVariantGroup: ms > 0
          ? { variantGroupId: action.variantGroupId, until: Date.now() + ms }
          : null,
      };
    }

    case 'REORDER_PIECES_IN_ZONE': {
      const ids = Array.isArray(action.newOrderIds) ? action.newOrderIds : [];
      const attachedIds = new Set(attachedInZone(pieces, action.zoneId).map((p) => p.id));
      // Every id must be a currently-attached piece in this zone (R-T7-3).
      if (ids.length !== attachedIds.size
        || !ids.every((id) => attachedIds.has(id))) {
        return state;
      }
      return packOrders(state, ids);
    }

    default:
      return state;
  }
}
