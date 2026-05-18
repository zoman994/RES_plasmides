/**
 * auto-reaction-finalizer.test.js — T8 K5/K6 (§5.3/§5.4).
 * End-to-end through skeletonReducer: the finalizer keeps each piece's
 * derived reaction in sync; OP_REMOVE cascades the dangling ref.
 */
import { describe, it, expect } from 'vitest';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';

const C = {
  id: 'cZ', name: 'pUC', kind: 'molecule', zoneId: null,
  sequence: 'AAAACCCCGGGGTTTTAAAACCCC', annotations: [],
};

function withPiece() {
  let s = buildInitialState({ forceEmptyZones: true });
  s = { ...s, containers: [...s.containers, C] };
  s = skeletonReducer(s, {
    type: 'CREATE_PIECE',
    piece: {
      kind: 'sourced', name: 'pcA', sourceIds: ['cZ'],
      ranges: [{ sourceId: 'cZ', start: 0, end: 8, orientation: 'forward' }],
      origin: 'selection', acquisitionMethod: 'undefined', acquisitionParams: {},
    },
  });
  const pid = s.pieces[s.pieces.length - 1].id;
  return { s, pid };
}
const opsCount = (s) => s.operations.length;
const findPiece = (s, id) => s.pieces.find((p) => p.id === id);

describe('T8 K5 — auto-create / auto-remove finalizer', () => {
  it('SET_PIECE_ACQUISITION_METHOD=pcr → reaction op created + derivedReactionId set', () => {
    const { s, pid } = withPiece();
    const before = opsCount(s);
    const n = skeletonReducer(s, {
      type: 'SET_PIECE_ACQUISITION_METHOD', pieceId: pid, method: 'pcr', params: {},
    });
    expect(opsCount(n)).toBe(before + 1);
    const op = n.operations[n.operations.length - 1];
    expect(op.kind).toBe('pcr');
    expect(op.inputPieces).toEqual([pid]);
    expect(findPiece(n, pid).derivedReactionId).toBe(op.id);
  });

  it('method → undefined removes the derived op + clears the ref', () => {
    let { s, pid } = withPiece();
    s = skeletonReducer(s, {
      type: 'SET_PIECE_ACQUISITION_METHOD', pieceId: pid, method: 'pcr', params: {},
    });
    const withOp = opsCount(s);
    s = skeletonReducer(s, {
      type: 'SET_PIECE_ACQUISITION_METHOD', pieceId: pid, method: 'undefined', params: {},
    });
    expect(opsCount(s)).toBe(withOp - 1);
    expect(findPiece(s, pid).derivedReactionId).toBeNull();
  });

  it('pcr → restriction swaps the reaction (old gone, cut created)', () => {
    let { s, pid } = withPiece();
    s = skeletonReducer(s, {
      type: 'SET_PIECE_ACQUISITION_METHOD', pieceId: pid, method: 'pcr', params: {},
    });
    const oldId = findPiece(s, pid).derivedReactionId;
    s = skeletonReducer(s, {
      type: 'SET_PIECE_ACQUISITION_METHOD',
      pieceId: pid,
      method: 'restriction',
      params: { enzymes: ['EcoRI'] },
    });
    const newId = findPiece(s, pid).derivedReactionId;
    expect(newId).not.toBe(oldId);
    expect(s.operations.find((o) => o.id === oldId)).toBeUndefined();
    expect(s.operations.find((o) => o.id === newId).kind).toBe('cut');
  });

  it('gap piece never gets an auto-reaction', () => {
    let s = buildInitialState({ forceEmptyZones: true });
    const before = opsCount(s);
    s = skeletonReducer(s, {
      type: 'CREATE_PIECE',
      piece: {
        kind: 'gap', name: 'Гэп', sourceIds: [], ranges: [],
        gapLength: 20, gapHint: 'unknown', origin: 'manual-gap',
        acquisitionMethod: 'synthesis', acquisitionParams: {}, functionalLabel: 'gap',
      },
    });
    expect(opsCount(s)).toBe(before);
  });

  it('REMOVE_PIECE drops the piece and the finalizer prunes its reaction', () => {
    let { s, pid } = withPiece();
    s = skeletonReducer(s, {
      type: 'SET_PIECE_ACQUISITION_METHOD', pieceId: pid, method: 'pcr', params: {},
    });
    expect(opsCount(s)).toBe(1);
    s = skeletonReducer(s, { type: 'REMOVE_PIECE', pieceId: pid });
    expect(s.pieces.find((p) => p.id === pid)).toBeUndefined();
    // op survives (DEC-T2-10 op-not-deleted) but no piece references it.
    expect(s.pieces.some((p) => p.derivedReactionId)).toBe(false);
  });

  it('idempotent — re-dispatching a no-op action does not duplicate reactions', () => {
    let { s, pid } = withPiece();
    s = skeletonReducer(s, {
      type: 'SET_PIECE_ACQUISITION_METHOD', pieceId: pid, method: 'pcr', params: {},
    });
    const after1 = opsCount(s);
    s = skeletonReducer(s, { type: 'NOOP_ACTION_XYZ' });
    expect(opsCount(s)).toBe(after1);
  });
});

describe('T8 K6 — OP_REMOVE cascade clears derivedReactionId', () => {
  it('removing the op nulls the back-ref synchronously', () => {
    let { s, pid } = withPiece();
    s = skeletonReducer(s, {
      type: 'SET_PIECE_ACQUISITION_METHOD', pieceId: pid, method: 'pcr', params: {},
    });
    const opId = findPiece(s, pid).derivedReactionId;
    expect(opId).toBeTruthy();
    s = skeletonReducer(s, { type: 'OP_REMOVE', operationId: opId });
    // Cascade cleared it; the finalizer then re-creates (method still pcr,
    // R-T8-3 expected) — so derivedReactionId is a fresh id, not the old.
    const fresh = findPiece(s, pid).derivedReactionId;
    expect(fresh).not.toBe(opId);
    expect(s.operations.find((o) => o.id === opId)).toBeUndefined();
  });
});
