/**
 * skeleton-state-operations-pieces.test.js — T2 K4/K5.
 * createOperationDraft.inputPieces default + OP_SET_INPUT_PIECES +
 * OP_REMOVE_INPUT_PIECE, via the public skeletonReducer.
 */
import { describe, it, expect } from 'vitest';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';
import { createOperationDraft } from '../store/skeleton-state-operations';

const C = { id: 'c-1', name: 'pUC', sequence: 'ACGT'.repeat(50), annotations: [] };

function stateWithTwoPieces() {
  let s = buildInitialState();
  s = { ...s, containers: [...s.containers, C] };
  const piece = (name) => ({
    name, sourceIds: ['c-1'],
    ranges: [{ sourceId: 'c-1', start: 0, end: 10, orientation: 'forward' }],
    origin: 'selection', acquisitionMethod: 'undefined', acquisitionParams: {},
  });
  s = skeletonReducer(s, { type: 'CREATE_PIECE', piece: piece('p1') });
  s = skeletonReducer(s, { type: 'CREATE_PIECE', piece: piece('p2') });
  return s;
}

describe('T2 K4 createOperationDraft.inputPieces', () => {
  it('defaults inputPieces:[] (back-compat — existing callers unaffected)', () => {
    expect(createOperationDraft().inputPieces).toEqual([]);
    expect(createOperationDraft({ kind: 'pcr', inputs: ['c-1'] }).inputPieces).toEqual([]);
  });
  it('OP_ADD seeds an op with inputPieces:[]', () => {
    const s = skeletonReducer(buildInitialState(), { type: 'OP_ADD', payload: { kind: 'pcr' } });
    expect(s.operations[0].inputPieces).toEqual([]);
  });
});

describe('T2 K5 OP_SET_INPUT_PIECES / OP_REMOVE_INPUT_PIECE', () => {
  function withOp(kind = 'pcr') {
    let s = stateWithTwoPieces();
    s = skeletonReducer(s, { type: 'OP_ADD', payload: { id: 'op-1', kind, commit: true } });
    return s;
  }

  it('sets inputPieces when all pieceIds exist and arity matches (pcr → 1)', () => {
    let s = withOp('pcr');
    const pid = s.pieces[0].id;
    s = skeletonReducer(s, { type: 'OP_SET_INPUT_PIECES', operationId: 'op-1', pieceIds: [pid] });
    expect(s.operations[0].inputPieces).toEqual([pid]);
  });

  it('gibson requires ≥2 pieces; 1 is rejected (state identity)', () => {
    let s = withOp('gibson');
    const before = s.operations;
    s = skeletonReducer(s, { type: 'OP_SET_INPUT_PIECES', operationId: 'op-1', pieceIds: [s.pieces[0].id] });
    expect(s.operations).toBe(before);
    s = skeletonReducer(s, {
      type: 'OP_SET_INPUT_PIECES', operationId: 'op-1',
      pieceIds: [s.pieces[0].id, s.pieces[1].id],
    });
    expect(s.operations[0].inputPieces).toHaveLength(2);
  });

  it('pcr rejects 2 pieces (single-template arity)', () => {
    let s = withOp('pcr');
    const before = s.operations;
    s = skeletonReducer(s, {
      type: 'OP_SET_INPUT_PIECES', operationId: 'op-1',
      pieceIds: [s.pieces[0].id, s.pieces[1].id],
    });
    expect(s.operations).toBe(before);
  });

  it('KLD is single-template: accepts 1 piece, rejects 2 (audit kld AM-2)', () => {
    let s = withOp('kld');
    s = skeletonReducer(s, { type: 'OP_SET_INPUT_PIECES', operationId: 'op-1', pieceIds: [s.pieces[0].id] });
    expect(s.operations[0].inputPieces).toEqual([s.pieces[0].id]);
    const before = s.operations;
    s = skeletonReducer(s, {
      type: 'OP_SET_INPUT_PIECES', operationId: 'op-1',
      pieceIds: [s.pieces[0].id, s.pieces[1].id],
    });
    expect(s.operations).toBe(before); // 2-template KLD rejected
  });

  it('CREATE_OP_GROUP rejects a multi-fragment KLD group (audit kld AM-1/AM-3)', () => {
    let s = stateWithTwoPieces();
    s = skeletonReducer(s, { type: 'CREATE_ZONE', zone: { id: 'zk', name: 'Z', bounds: { x: 0, y: 0, width: 600, height: 400 } } });
    // put both pieces in the zone
    const ids = s.pieces.map((p) => p.id);
    s = skeletonReducer(s, { type: 'MOVE_NODE_TO_ZONE', nodeType: 'piece', nodeId: ids[0], targetZoneId: 'zk' });
    s = skeletonReducer(s, { type: 'MOVE_NODE_TO_ZONE', nodeType: 'piece', nodeId: ids[1], targetZoneId: 'zk' });
    const before = s.operations;
    s = skeletonReducer(s, { type: 'CREATE_OP_GROUP', zoneId: 'zk', kind: 'kld', name: '', pieceIds: ids });
    expect(s.operations).toBe(before); // no kld op-group created
  });

  it('rejects an unknown pieceId (state identity)', () => {
    let s = withOp('pcr');
    const before = s.operations;
    s = skeletonReducer(s, { type: 'OP_SET_INPUT_PIECES', operationId: 'op-1', pieceIds: ['pc-ghost'] });
    expect(s.operations).toBe(before);
  });

  it('unknown operationId → state identity', () => {
    const s0 = withOp('pcr');
    const s = skeletonReducer(s0, { type: 'OP_SET_INPUT_PIECES', operationId: 'op-x', pieceIds: [s0.pieces[0].id] });
    expect(s).toBe(s0);
  });

  it('OP_REMOVE_INPUT_PIECE strips one pieceId, keeping the rest', () => {
    let s = withOp('gibson');
    const [a, b] = [s.pieces[0].id, s.pieces[1].id];
    s = skeletonReducer(s, { type: 'OP_SET_INPUT_PIECES', operationId: 'op-1', pieceIds: [a, b] });
    s = skeletonReducer(s, { type: 'OP_REMOVE_INPUT_PIECE', operationId: 'op-1', pieceId: a });
    expect(s.operations[0].inputPieces).toEqual([b]);
  });
});
