/**
 * skeleton-state-pieces-cascade.test.js — T2 K6.
 * REMOVE_PIECE → strip from op.inputPieces (op survives, DEC-T2-10).
 * REMOVE_CONTAINER → piece source cascade (DEC-T2-11).
 * OP_RESET → unfreeze the op's input pieces (DEC-T2-13 recovery).
 */
import { describe, it, expect } from 'vitest';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';

const C1 = { id: 'c-1', name: 'A', sequence: 'AAAACCCCGGGGTTTT', annotations: [] };
const C2 = { id: 'c-2', name: 'B', sequence: 'TTTTGGGGCCCCAAAA', annotations: [] };

function base(containers = [C1]) {
  const s = buildInitialState();
  return { ...s, containers: [...s.containers, ...containers] };
}
const single = (cid, name = 'p') => ({
  name, sourceIds: [cid],
  ranges: [{ sourceId: cid, start: 0, end: 8, orientation: 'forward' }],
  origin: 'selection', acquisitionMethod: 'undefined', acquisitionParams: {},
});

describe('T2 K6 REMOVE_PIECE cascade into operations', () => {
  it('removes the piece and strips it from op.inputPieces; op survives', () => {
    let s = base();
    s = skeletonReducer(s, { type: 'CREATE_PIECE', piece: single('c-1') });
    const pid = s.pieces[0].id;
    s = skeletonReducer(s, { type: 'OP_ADD', payload: { id: 'op-1', kind: 'pcr', commit: true } });
    s = skeletonReducer(s, { type: 'OP_SET_INPUT_PIECES', operationId: 'op-1', pieceIds: [pid] });
    expect(s.operations[0].inputPieces).toEqual([pid]);
    s = skeletonReducer(s, { type: 'REMOVE_PIECE', pieceId: pid });
    expect(s.pieces).toEqual([]);
    expect(s.operations).toHaveLength(1); // op NOT cascade-deleted
    expect(s.operations[0].inputPieces).toEqual([]);
  });
});

describe('T2 K6 REMOVE_CONTAINER cascade into pieces', () => {
  it('single-source piece on the removed container → piece removed + stripped from ops', () => {
    let s = base();
    s = skeletonReducer(s, { type: 'CREATE_PIECE', piece: single('c-1') });
    const pid = s.pieces[0].id;
    s = skeletonReducer(s, { type: 'OP_ADD', payload: { id: 'op-1', kind: 'pcr', commit: true } });
    s = skeletonReducer(s, { type: 'OP_SET_INPUT_PIECES', operationId: 'op-1', pieceIds: [pid] });
    s = skeletonReducer(s, { type: 'REMOVE_CONTAINER', containerId: 'c-1' });
    expect(s.pieces).toEqual([]);
    expect(s.operations[0].inputPieces).toEqual([]);
  });

  it('multi-source piece → only the removed sourceId + its range drop, piece survives', () => {
    let s = base([C1, C2]);
    s = skeletonReducer(s, {
      type: 'CREATE_PIECE',
      piece: {
        name: 'ov', sourceIds: ['c-1', 'c-2'],
        ranges: [
          { sourceId: 'c-1', start: 0, end: 4, orientation: 'forward' },
          { sourceId: 'c-2', start: 0, end: 4, orientation: 'forward' },
        ],
        origin: 'selection', acquisitionMethod: 'undefined', acquisitionParams: {},
      },
    });
    s = skeletonReducer(s, { type: 'REMOVE_CONTAINER', containerId: 'c-1' });
    expect(s.pieces).toHaveLength(1);
    expect(s.pieces[0].sourceIds).toEqual(['c-2']);
    expect(s.pieces[0].ranges).toEqual([{ sourceId: 'c-2', start: 0, end: 4, orientation: 'forward' }]);
  });

  it('container used by no piece → pieces slice identity preserved', () => {
    let s = base([C1, C2]);
    s = skeletonReducer(s, { type: 'CREATE_PIECE', piece: single('c-1') });
    const piecesRef = s.pieces;
    s = skeletonReducer(s, { type: 'REMOVE_CONTAINER', containerId: 'c-2' });
    expect(s.pieces).toBe(piecesRef);
  });
});

describe('T2 K6 OP_RESET unfreezes input pieces (DEC-T2-13 recovery)', () => {
  it('failed→committed clears frozen + frozenSequence on op.inputPieces', () => {
    let s = base();
    s = skeletonReducer(s, { type: 'CREATE_PIECE', piece: single('c-1') });
    const pid = s.pieces[0].id;
    // Hand-build a failed op + a frozen piece (freeze path itself is K9).
    s = {
      ...s,
      operations: [{
        id: 'op-1', kind: 'pcr', status: 'failed', position: { x: 0, y: 0 },
        inputs: [], inputPieces: [pid], outputs: [], params: {},
        junctionRefs: [], createdAt: '', executedAt: null, error: 'boom',
      }],
      pieces: s.pieces.map((p) => ({ ...p, frozen: true, frozenSequence: 'AAAACCCC' })),
    };
    s = skeletonReducer(s, { type: 'OP_RESET', operationId: 'op-1' });
    expect(s.operations[0].status).toBe('committed');
    expect(s.pieces[0].frozen).toBe(false);
    expect(s.pieces[0].frozenSequence == null).toBe(true);
  });
});
