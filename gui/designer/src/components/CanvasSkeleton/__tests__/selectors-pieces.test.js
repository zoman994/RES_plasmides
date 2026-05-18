/**
 * selectors-pieces.test.js — T1 K4. Pure derived reads over
 * state.pieces (selectAllPieces / selectPieceById / selectPiecesByZoneId
 * / selectPieceSequence / selectPiecesUsingContainer /
 * selectPiecesByOrigin).
 */
import { describe, it, expect } from 'vitest';
import {
  buildInitialPiecesState, piecesReducer,
} from '../store/skeleton-state-pieces';
import {
  selectAllPieces, selectPieceById, selectPiecesByZoneId,
  selectPieceSequence, selectPiecesUsingContainer, selectPiecesByOrigin,
  selectPiecesForOperation, selectOperationsUsingPiece,
} from '../store/selectors-pieces';

const C = { id: 'c-1', name: 'pUC', sequence: 'AAAACCCCGGGGTTTT', annotations: [] };
const D = { id: 'c-2', name: 'frag', sequence: 'GGGGAAAA', annotations: [] };

function stateWithPieces() {
  let s = { ...buildInitialPiecesState(), containers: [C, D] };
  s = piecesReducer(s, {
    type: 'CREATE_PIECE',
    piece: {
      name: 'fwd', sourceIds: ['c-1'],
      ranges: [{ sourceId: 'c-1', start: 4, end: 8, orientation: 'forward' }],
      origin: 'selection', acquisitionMethod: 'undefined', acquisitionParams: {},
    },
  });
  s = piecesReducer(s, {
    type: 'CREATE_PIECE',
    piece: {
      name: 'rev', sourceIds: ['c-1'],
      ranges: [{ sourceId: 'c-1', start: 0, end: 4, orientation: 'reverse' }],
      origin: 'feature', acquisitionMethod: 'undefined', acquisitionParams: {},
    },
  });
  s = piecesReducer(s, {
    type: 'CREATE_PIECE',
    piece: {
      name: 'ov', sourceIds: ['c-1', 'c-2'],
      ranges: [
        { sourceId: 'c-1', start: 0, end: 4, orientation: 'forward' }, // AAAA
        { sourceId: 'c-2', start: 0, end: 4, orientation: 'forward' }, // GGGG
      ],
      origin: 'selection', acquisitionMethod: 'undefined', acquisitionParams: {},
    },
  });
  return s;
}

describe('T1 K4 selectors-pieces', () => {
  it('selectAllPieces returns the slice (or [] when absent)', () => {
    expect(selectAllPieces(stateWithPieces())).toHaveLength(3);
    expect(selectAllPieces({})).toEqual([]);
  });

  it('selectPieceById returns the piece or null', () => {
    const s = stateWithPieces();
    const id = s.pieces[0].id;
    expect(selectPieceById(s, id).name).toBe('fwd');
    expect(selectPieceById(s, 'pc-nope')).toBeNull();
  });

  it('selectPiecesByZoneId filters by zoneId (T1: all null until SET_PIECE_ZONE)', () => {
    let s = stateWithPieces();
    expect(selectPiecesByZoneId(s, 'z-1')).toEqual([]);
    const id = s.pieces[0].id;
    s = piecesReducer(s, { type: 'SET_PIECE_ZONE', pieceId: id, zoneId: 'z-1' });
    expect(selectPiecesByZoneId(s, 'z-1').map((p) => p.id)).toEqual([id]);
  });

  it('selectPieceSequence concats forward slice', () => {
    const s = stateWithPieces();
    expect(selectPieceSequence(s, s.pieces[0].id)).toBe('CCCC'); // [4,8) of pUC
  });

  it('selectPieceSequence reverse-complements a reverse range', () => {
    const s = stateWithPieces();
    expect(selectPieceSequence(s, s.pieces[1].id)).toBe('TTTT'); // RC of AAAA
  });

  it('selectPieceSequence concats multi-source ranges', () => {
    const s = stateWithPieces();
    expect(selectPieceSequence(s, s.pieces[2].id)).toBe('AAAAGGGG');
  });

  it('selectPieceSequence → null for missing piece or missing source container', () => {
    const s = stateWithPieces();
    expect(selectPieceSequence(s, 'pc-ghost')).toBeNull();
    const orphan = { ...buildInitialPiecesState(), containers: [], pieces: [
      { id: 'pc-x', sourceIds: ['gone'], ranges: [{ sourceId: 'gone', start: 0, end: 4, orientation: 'forward' }] },
    ] };
    expect(selectPieceSequence(orphan, 'pc-x')).toBeNull();
  });

  it('selectPiecesUsingContainer finds pieces referencing a container', () => {
    const s = stateWithPieces();
    expect(selectPiecesUsingContainer(s, 'c-1').map((p) => p.name).sort())
      .toEqual(['fwd', 'ov', 'rev']);
    expect(selectPiecesUsingContainer(s, 'c-2').map((p) => p.name)).toEqual(['ov']);
    expect(selectPiecesUsingContainer(s, 'c-none')).toEqual([]);
  });

  it('selectPiecesByOrigin filters by origin', () => {
    const s = stateWithPieces();
    expect(selectPiecesByOrigin(s, 'selection').map((p) => p.name)).toEqual(['fwd', 'ov']);
    expect(selectPiecesByOrigin(s, 'feature').map((p) => p.name)).toEqual(['rev']);
    expect(selectPiecesByOrigin(s, 'legacy-migration')).toEqual([]);
  });
});

describe('T2 K10 op↔piece selectors', () => {
  const st = {
    pieces: [{ id: 'pc-1' }, { id: 'pc-2' }, { id: 'pc-3' }],
    operations: [
      { id: 'op-a', inputPieces: ['pc-1', 'pc-2'] },
      { id: 'op-b', inputPieces: ['pc-2'] },
      { id: 'op-c', inputPieces: [] },
      { id: 'op-d' }, // no inputPieces field
    ],
  };

  it('selectPiecesForOperation maps op.inputPieces → pieces', () => {
    expect(selectPiecesForOperation(st, 'op-a').map((p) => p.id)).toEqual(['pc-1', 'pc-2']);
    expect(selectPiecesForOperation(st, 'op-c')).toEqual([]);
    expect(selectPiecesForOperation(st, 'op-d')).toEqual([]);
    expect(selectPiecesForOperation(st, 'op-missing')).toEqual([]);
  });

  it('selectOperationsUsingPiece finds every op referencing a piece', () => {
    expect(selectOperationsUsingPiece(st, 'pc-2').map((o) => o.id)).toEqual(['op-a', 'op-b']);
    expect(selectOperationsUsingPiece(st, 'pc-1').map((o) => o.id)).toEqual(['op-a']);
    expect(selectOperationsUsingPiece(st, 'pc-3')).toEqual([]);
  });
});
