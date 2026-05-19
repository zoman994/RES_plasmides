/**
 * zone-assembly-write-adapter — T6 K8+ (DEC-T6-01, R-T6-4).
 *
 * Reducer-level dual-resolution for the assembly-mode write actions:
 * when an ASSEMBLY_* action targets a ZONE id (not a legacy
 * assemblyDrafts id), the segment mutation is translated to piece /
 * zone operations and delegated to `piecesReducer` (single source of
 * truth for piece semantics + T1/T6 invariants). Legacy-draft ids
 * return `undefined` so `assemblyReducer` falls through to its
 * original logic unchanged (transition window).
 *
 * Contract: `segment.id === piece.id` (draftFromZone), so segment ops
 * address pieces directly. Pieces are ordered within a zone by
 * createdAt asc (same as draftFromZone) — REORDER reassigns createdAt.
 */
import { piecesReducer } from '../store/skeleton-state-pieces';
import { computePieceSize } from './piece-model';

const HANDLED = new Set([
  'INSERT_SEGMENT', 'INSERT_MANUAL_SEGMENT', 'INSERT_SNIPPET',
  'INSERT_SYNTHESIS', 'REMOVE_SEGMENT',
  'REORDER_SEGMENTS', 'UPDATE_SEGMENT', 'UPDATE_SEGMENT_RANGE',
  'TOGGLE_SEGMENT_RC', 'RENAME_ASSEMBLY_DRAFT',
  'SET_ASSEMBLY_DRAFT_TOPOLOGY', 'SET_ASSEMBLY_DRAFT_POSITION',
]);

/** Zone piece ids in display order (createdAt asc, stable). */
function orderedZonePieceIds(state, zoneId) {
  return ((state.pieces || [])
    .filter((p) => p.zoneId === zoneId)
    .slice()
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)))
    .map((p) => p.id);
}

/** Reassign createdAt across a zone so `idsInOrder` is the new order. */
function applyZoneOrder(state, zoneId, idsInOrder) {
  const base = Date.now();
  const rank = new Map(idsInOrder.map((id, i) => [id, base + i]));
  const pieces = (state.pieces || []).map((p) => (
    rank.has(p.id) ? { ...p, createdAt: rank.get(p.id), updatedAt: base } : p
  ));
  return { ...state, pieces };
}

function reorderZonePieces(state, zoneId, fromIndex, toIndex) {
  const ids = orderedZonePieceIds(state, zoneId);
  if (fromIndex < 0 || fromIndex >= ids.length) return state;
  const to = Math.max(0, Math.min(toIndex, ids.length - 1));
  const [moved] = ids.splice(fromIndex, 1);
  ids.splice(to, 0, moved);
  return applyZoneOrder(state, zoneId, ids);
}

/** CREATE_PIECE + SET_PIECE_ZONE; on validation failure returns the
 *  (toast-stamped) state so the action is still consumed. */
function createPieceInZone(state, zoneId, pieceData, insertAtIndex) {
  const before = (state.pieces || []).length;
  let s = piecesReducer(state, { type: 'CREATE_PIECE', piece: pieceData });
  if ((s.pieces || []).length === before) return s; // invariant failed
  const newId = s.pieces[s.pieces.length - 1].id;
  s = piecesReducer(s, { type: 'SET_PIECE_ZONE', pieceId: newId, zoneId });
  if (Number.isFinite(insertAtIndex)) {
    const ids = orderedZonePieceIds(s, zoneId); // new piece is last
    const from = ids.indexOf(newId);
    if (from >= 0 && insertAtIndex < ids.length) {
      s = reorderZonePieces(s, zoneId, from, insertAtIndex);
    }
  }
  return s;
}

function findPiece(state, pieceId) {
  return (state.pieces || []).find((p) => p.id === pieceId) || null;
}

/**
 * @returns new state if the action targeted a zone (consumed), else
 *          `undefined` (assemblyReducer handles the legacy draft).
 */
export function routeAssemblyWriteToZone(state, action) {
  if (!action || !HANDLED.has(action.type)) return undefined;
  const zoneId = action.draftId;
  const isZone = !!((state && state.zones) || []).find((z) => z.id === zoneId);
  if (!isZone) return undefined;

  switch (action.type) {
    case 'INSERT_SEGMENT': {
      const c = (state.containers || []).find((x) => x.id === action.sourceContainerId);
      if (!c) return state;
      const pieceData = {
        kind: 'sourced',
        name: c.name || 'piece',
        sourceIds: [action.sourceContainerId],
        ranges: [{
          sourceId: action.sourceContainerId,
          start: action.start,
          end: action.end,
          orientation: action.rc ? 'reverse' : 'forward',
        }],
        origin: 'selection',
        acquisitionMethod: 'undefined',
        acquisitionParams: {},
      };
      return createPieceInZone(state, zoneId, pieceData, action.insertAtIndex);
    }

    case 'INSERT_MANUAL_SEGMENT': {
      const hasSeq = typeof action.sequence === 'string' && action.sequence.length > 0;
      const gapLength = hasSeq
        ? action.sequence.length
        : (Number.isFinite(action.length) ? Math.max(0, action.length) : 0);
      const pieceData = {
        kind: 'gap',
        name: action.label || `Гэп ${gapLength} нт`,
        sourceIds: [],
        ranges: [],
        gapLength,
        // V83 — a linker/custom sequence is a KNOWN element: keep it
        // verbatim ('known'); only the «Неизв. длина» tab → poly-N.
        gapHint: hasSeq ? 'known' : (action.gapKind || 'unknown'),
        ...(hasSeq ? { gapSequence: action.sequence } : {}),
        origin: 'manual-gap',
        acquisitionMethod: 'synthesis',
        acquisitionParams: { type: 'manual-gap' },
        functionalLabel: 'gap',
      };
      return createPieceInZone(state, zoneId, pieceData, action.insertAtIndex);
    }

    case 'INSERT_SNIPPET': {
      // SPEC §3.1.B — a snippet is a visual strip block whose sequence
      // is physically embedded into a neighbour primer's 5'-tail; it is
      // NOT its own reaction (embedsInPrimer:true). createPiece (K1)
      // already supports kind='snippet' + sequence/snippetType.
      const seq = typeof action.sequence === 'string' ? action.sequence : '';
      const pieceData = {
        kind: 'snippet',
        name: action.name || action.snippetType || 'обвес',
        sourceIds: [],
        ranges: [],
        sequence: seq,
        snippetType: action.snippetType || null,
        embedsInPrimer: action.embedsInPrimer !== false,
        origin: 'snippet',
        acquisitionMethod: 'synthesis',
        acquisitionParams: { type: 'snippet', snippetType: action.snippetType || null },
        functionalLabel: 'snippet',
      };
      return createPieceInZone(state, zoneId, pieceData, action.insertAtIndex);
    }

    case 'INSERT_SYNTHESIS': {
      // SPEC §3.1.C — own-synthesis ПСО (gBlock). Inline sequence, no
      // source. «save as container» mode is handled caller-side
      // (AssemblyShellBody → ADD_CONTAINER + INSERT_SEGMENT); this is
      // the in-assembly-only branch → kind='synthesis' piece.
      const seq = typeof action.sequence === 'string' ? action.sequence : '';
      const pieceData = {
        kind: 'synthesis',
        name: action.name || 'Синтез',
        sourceIds: [],
        ranges: [],
        sequence: seq,
        origin: 'synthesis',
        acquisitionMethod: 'synthesis',
        acquisitionParams: { type: 'synthesis' },
        functionalLabel: 'synthesis',
      };
      return createPieceInZone(state, zoneId, pieceData, action.insertAtIndex);
    }

    case 'REMOVE_SEGMENT':
      return piecesReducer(state, { type: 'REMOVE_PIECE', pieceId: action.segmentId });

    case 'REORDER_SEGMENTS':
      return reorderZonePieces(state, zoneId, action.fromIndex, action.toIndex);

    case 'UPDATE_SEGMENT': {
      const patch = action.patch || {};
      const piece = findPiece(state, action.segmentId);
      if (!piece) return state;
      // Orphan escape hatch: convert a sourced piece to a gap.
      if (patch.source && patch.source.type === 'manual') {
        return piecesReducer(state, {
          type: 'UPDATE_PIECE',
          pieceId: action.segmentId,
          changes: {
            kind: 'gap',
            sourceIds: [],
            ranges: [],
            gapLength: computePieceSize(piece) || 0,
            gapHint: 'unknown',
            origin: 'manual-gap',
          },
        });
      }
      if (typeof patch.color === 'string') {
        return piecesReducer(state, {
          type: 'SET_PIECE_COLOR', pieceId: action.segmentId, color: patch.color,
        });
      }
      if (typeof patch.label === 'string') {
        return piecesReducer(state, {
          type: 'UPDATE_PIECE', pieceId: action.segmentId, changes: { name: patch.label },
        });
      }
      return state; // unrecognised patch → consumed no-op
    }

    case 'UPDATE_SEGMENT_RANGE': {
      const piece = findPiece(state, action.segmentId);
      const r0 = piece && piece.ranges && piece.ranges[0];
      if (!r0) return state;
      return piecesReducer(state, {
        type: 'UPDATE_PIECE',
        pieceId: action.segmentId,
        changes: { ranges: [{ ...r0, start: Number(action.start), end: Number(action.end) }] },
      });
    }

    case 'TOGGLE_SEGMENT_RC': {
      const piece = findPiece(state, action.segmentId);
      const r0 = piece && piece.ranges && piece.ranges[0];
      if (!r0) return state;
      return piecesReducer(state, {
        type: 'UPDATE_PIECE',
        pieceId: action.segmentId,
        changes: {
          ranges: [{ ...r0, orientation: r0.orientation === 'reverse' ? 'forward' : 'reverse' }],
        },
      });
    }

    case 'RENAME_ASSEMBLY_DRAFT': {
      const now = Date.now();
      return {
        ...state,
        zones: state.zones.map((z) => (
          z.id === zoneId ? { ...z, name: action.name, updatedAt: now } : z
        )),
      };
    }

    case 'SET_ASSEMBLY_DRAFT_POSITION': {
      const pos = action.position;
      if (!pos) return state;
      const now = Date.now();
      return {
        ...state,
        zones: state.zones.map((z) => (
          z.id === zoneId
            ? { ...z, bounds: { ...(z.bounds || {}), x: pos.x, y: pos.y }, updatedAt: now }
            : z
        )),
      };
    }

    // Zones derive topology from the final container (DEC-T6 §5.5);
    // pre-realise there is none → consumed no-op (documented deviation).
    case 'SET_ASSEMBLY_DRAFT_TOPOLOGY':
      return state;

    default:
      return undefined;
  }
}
