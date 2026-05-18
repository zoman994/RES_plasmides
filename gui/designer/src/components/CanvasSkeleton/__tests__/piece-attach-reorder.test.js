/**
 * piece-attach-reorder.test.js — T7 K4 (DEC-T7-04, §5.8).
 *
 * ATTACH_PIECE_TO_ASSEMBLY / DETACH_PIECE_FROM_ASSEMBLY /
 * REORDER_PIECES_IN_ZONE — piece.order maintenance with contiguous
 * 0-indexed packing (no gaps, no duplicates — R-T7-3).
 */
import { describe, it, expect } from 'vitest';
import { piecesReducer } from '../store/skeleton-state-pieces';
import { selectAttachedPieces } from '../canvas/zone-sequence-mode/zone-mode-state';

function piece(id, zoneId, order, createdAt) {
  return {
    id, zoneId, kind: 'sourced', name: id,
    sourceIds: ['c'], ranges: [{ sourceId: 'c', start: 0, end: 4, orientation: 'forward' }],
    origin: 'selection', acquisitionMethod: 'undefined', acquisitionParams: {},
    color: '#abc', order, derivedReactionId: null, frozen: false,
    createdAt, updatedAt: createdAt,
  };
}
function st(pieces) {
  return {
    containers: [{ id: 'c', name: 'c', sequence: 'ACGTACGT' }],
    operations: [], junctions: [], zones: [{ id: 'zn-1' }, { id: 'zn-2' }], pieces,
  };
}
const orderIds = (s, z) => selectAttachedPieces(s, z).map((p) => p.id);

describe('T7 K4 — ATTACH_PIECE_TO_ASSEMBLY', () => {
  it('palette piece → attached at order, others shift, contiguous 0..n-1', () => {
    const s = st([
      piece('a', 'zn-1', 0, 1),
      piece('b', 'zn-1', 1, 2),
      piece('free', 'zn-1', null, 3),
    ]);
    const n = piecesReducer(s, {
      type: 'ATTACH_PIECE_TO_ASSEMBLY', pieceId: 'free', zoneId: 'zn-1', order: 1,
    });
    expect(orderIds(n, 'zn-1')).toEqual(['a', 'free', 'b']);
    expect(n.pieces.find((p) => p.id === 'a').order).toBe(0);
    expect(n.pieces.find((p) => p.id === 'free').order).toBe(1);
    expect(n.pieces.find((p) => p.id === 'b').order).toBe(2);
  });

  it('attach a zoneless piece also sets its zoneId', () => {
    const s = st([piece('x', null, null, 1)]);
    const n = piecesReducer(s, {
      type: 'ATTACH_PIECE_TO_ASSEMBLY', pieceId: 'x', zoneId: 'zn-1', order: 0,
    });
    const px = n.pieces.find((p) => p.id === 'x');
    expect(px.zoneId).toBe('zn-1');
    expect(px.order).toBe(0);
  });

  it('order beyond the end clamps to append', () => {
    const s = st([piece('a', 'zn-1', 0, 1), piece('free', 'zn-1', null, 2)]);
    const n = piecesReducer(s, {
      type: 'ATTACH_PIECE_TO_ASSEMBLY', pieceId: 'free', zoneId: 'zn-1', order: 99,
    });
    expect(orderIds(n, 'zn-1')).toEqual(['a', 'free']);
  });

  it('unknown piece → state unchanged', () => {
    const s = st([piece('a', 'zn-1', 0, 1)]);
    expect(piecesReducer(s, {
      type: 'ATTACH_PIECE_TO_ASSEMBLY', pieceId: 'nope', zoneId: 'zn-1', order: 0,
    })).toBe(s);
  });

  it('does not disturb a different zone', () => {
    const s = st([piece('a', 'zn-1', 0, 1), piece('z', 'zn-2', 0, 2), piece('f', 'zn-1', null, 3)]);
    const n = piecesReducer(s, {
      type: 'ATTACH_PIECE_TO_ASSEMBLY', pieceId: 'f', zoneId: 'zn-1', order: 0,
    });
    expect(n.pieces.find((p) => p.id === 'z').order).toBe(0); // zn-2 untouched
    expect(orderIds(n, 'zn-1')).toEqual(['f', 'a']);
  });
});

describe('T7 K4 — DETACH_PIECE_FROM_ASSEMBLY', () => {
  it('detaches and re-packs the remaining order contiguously', () => {
    const s = st([
      piece('a', 'zn-1', 0, 1), piece('b', 'zn-1', 1, 2), piece('c', 'zn-1', 2, 3),
    ]);
    const n = piecesReducer(s, { type: 'DETACH_PIECE_FROM_ASSEMBLY', pieceId: 'b' });
    expect(n.pieces.find((p) => p.id === 'b').order).toBeNull();
    expect(orderIds(n, 'zn-1')).toEqual(['a', 'c']);
    expect(n.pieces.find((p) => p.id === 'c').order).toBe(1);
  });

  it('detaching an already-free piece is a no-op', () => {
    const s = st([piece('a', 'zn-1', 0, 1), piece('free', 'zn-1', null, 2)]);
    expect(piecesReducer(s, { type: 'DETACH_PIECE_FROM_ASSEMBLY', pieceId: 'free' })).toBe(s);
  });
});

describe('T7 K4 — REORDER_PIECES_IN_ZONE', () => {
  it('reassigns order by the given id list', () => {
    const s = st([
      piece('a', 'zn-1', 0, 1), piece('b', 'zn-1', 1, 2), piece('c', 'zn-1', 2, 3),
    ]);
    const n = piecesReducer(s, {
      type: 'REORDER_PIECES_IN_ZONE', zoneId: 'zn-1', newOrderIds: ['c', 'a', 'b'],
    });
    expect(orderIds(n, 'zn-1')).toEqual(['c', 'a', 'b']);
    expect(n.pieces.find((p) => p.id === 'c').order).toBe(0);
  });

  it('invalid id (not attached in zone) → state unchanged', () => {
    const s = st([piece('a', 'zn-1', 0, 1), piece('free', 'zn-1', null, 2)]);
    expect(piecesReducer(s, {
      type: 'REORDER_PIECES_IN_ZONE', zoneId: 'zn-1', newOrderIds: ['a', 'free'],
    })).toBe(s);
  });
});
