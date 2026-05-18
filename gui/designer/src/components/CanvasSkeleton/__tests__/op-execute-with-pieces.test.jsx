/**
 * op-execute-with-pieces.test.jsx — T2 K9. handleOpExecute freezes the
 * op's input pieces (DEC-T2-13) and snapshots their sequence
 * (R-T2-6); selectPieceSequence then returns the frozen snapshot even
 * if the source container later changes.
 */
import { describe, it, expect } from 'vitest';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';
import { selectPieceSequence, selectPieceById } from '../store/selectors-pieces';

const TPL = { id: 'c-tpl', name: 'pUC', sequence: 'ATGCATGCATGCATGCATGC', topology: { circular: false }, annotations: [] };

function committedPcrWithPiece() {
  let s = buildInitialState();
  s = { ...s, containers: [...s.containers, TPL] };
  s = skeletonReducer(s, {
    type: 'CREATE_PIECE',
    piece: {
      name: 'tpl-pc', sourceIds: ['c-tpl'],
      ranges: [{ sourceId: 'c-tpl', start: 0, end: 20, orientation: 'forward' }],
      origin: 'selection', acquisitionMethod: 'undefined', acquisitionParams: {},
    },
  });
  const pid = s.pieces[0].id;
  s = skeletonReducer(s, { type: 'OP_ADD', payload: { id: 'op-1', kind: 'pcr', commit: true } });
  s = skeletonReducer(s, { type: 'OP_SET_INPUT_PIECES', operationId: 'op-1', pieceIds: [pid] });
  return { s, pid };
}

describe('T2 K9 freeze pieces on OP_EXECUTE', () => {
  it('input pieces become frozen with a frozenSequence snapshot', () => {
    const { s, pid } = committedPcrWithPiece();
    const after = skeletonReducer(s, { type: 'OP_EXECUTE', operationId: 'op-1' });
    expect(after.operations[0].status).toBe('executed');
    const pc = selectPieceById(after, pid);
    expect(pc.frozen).toBe(true);
    expect(pc.frozenSequence).toBe(TPL.sequence); // full-range snapshot
  });

  it('non-input pieces are not frozen', () => {
    let { s } = committedPcrWithPiece();
    s = skeletonReducer(s, {
      type: 'CREATE_PIECE',
      piece: {
        name: 'other', sourceIds: ['c-tpl'],
        ranges: [{ sourceId: 'c-tpl', start: 0, end: 4, orientation: 'forward' }],
        origin: 'selection', acquisitionMethod: 'undefined', acquisitionParams: {},
      },
    });
    const otherId = s.pieces[1].id;
    const after = skeletonReducer(s, { type: 'OP_EXECUTE', operationId: 'op-1' });
    expect(selectPieceById(after, otherId).frozen).toBe(false);
  });
});

describe('T2 K9 selectPieceSequence frozen-aware (R-T2-6)', () => {
  it('returns frozenSequence over live compute when frozen', () => {
    const state = {
      containers: [{ id: 'c-1', sequence: 'AAAACCCC' }],
      pieces: [{
        id: 'pc-f', sourceIds: ['c-1'], frozen: true, frozenSequence: 'FROZEN',
        ranges: [{ sourceId: 'c-1', start: 0, end: 4, orientation: 'forward' }],
      }],
    };
    expect(selectPieceSequence(state, 'pc-f')).toBe('FROZEN');
  });
  it('live-computes when not frozen (T1 behaviour preserved)', () => {
    const state = {
      containers: [{ id: 'c-1', sequence: 'AAAACCCC' }],
      pieces: [{
        id: 'pc-l', sourceIds: ['c-1'], frozen: false,
        ranges: [{ sourceId: 'c-1', start: 0, end: 4, orientation: 'forward' }],
      }],
    };
    expect(selectPieceSequence(state, 'pc-l')).toBe('AAAA');
  });
});
