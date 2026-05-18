/**
 * skeleton-state-pieces.test.js — T1 K3. The state.pieces sub-reducer
 * (9 actions), buildInitialPiecesState, isPieceAction guard, and the
 * localized error-toast mapping (invariant code → STRINGS).
 *
 * Unit-level (piecesReducer directly) — router wiring is K5, exercised
 * via skeletonReducer in skeleton-state-pieces-integration assertions
 * once integrated.
 */
import { describe, it, expect } from 'vitest';
import {
  buildInitialPiecesState, piecesReducer, isPieceAction,
} from '../store/skeleton-state-pieces';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';
import { PIECE_CAPS } from '../lib/piece-invariants';
import { STRINGS } from '../../../lib/strings';

const C = { id: 'c-1', name: 'pUC', sequence: 'ACGT'.repeat(100), annotations: [] };
const base = (over = {}) => ({
  ...buildInitialPiecesState(),
  containers: [C],
  ...over,
});
const goodPiece = (over = {}) => ({
  name: 'gRNA',
  sourceIds: ['c-1'],
  ranges: [{ sourceId: 'c-1', start: 10, end: 50, orientation: 'forward' }],
  origin: 'selection',
  acquisitionMethod: 'undefined',
  acquisitionParams: {},
  ...over,
});
const create = (st, piece) => piecesReducer(st, { type: 'CREATE_PIECE', piece });

describe('T1 K3 buildInitialPiecesState / isPieceAction', () => {
  it('initial slice is { pieces: [], highlightedVariantGroup: null } (T9 DEC-T9 added the transient highlight)', () => {
    expect(buildInitialPiecesState()).toEqual({ pieces: [], highlightedVariantGroup: null });
  });
  it('isPieceAction guards exactly the 9 piece actions', () => {
    const A = ['CREATE_PIECE', 'UPDATE_PIECE', 'REMOVE_PIECE', 'CLONE_PIECE',
      'SET_PIECE_ACQUISITION_METHOD', 'SET_PIECE_COLOR',
      'SET_PIECE_FUNCTIONAL_LABEL', 'SET_PIECE_ZONE', 'BUMP_PIECE_ORIGIN'];
    A.forEach((t) => expect(isPieceAction(t)).toBe(true));
    expect(A).toHaveLength(9);
    expect(isPieceAction('SET_VIEW')).toBe(false);
    expect(isPieceAction('CREATE_ASSEMBLY_DRAFT')).toBe(false);
  });
  it('non-piece action returns state identity', () => {
    const s = base();
    expect(piecesReducer(s, { type: 'SET_VIEW', view: 'graph' })).toBe(s);
  });
});

describe('T1 K3 CREATE_PIECE', () => {
  it('appends a stamped piece (pc- id, color, timestamps, null zone/reaction)', () => {
    const s = create(base(), goodPiece());
    expect(s.pieces).toHaveLength(1);
    const p = s.pieces[0];
    expect(p.id).toMatch(/^pc-/);
    expect(p.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(p.zoneId).toBeNull();
    expect(p.derivedReactionId).toBeNull();
    expect(p.createdAt).toBeTypeOf('number');
  });

  it('appends (does not prepend) to keep T4 visual stability', () => {
    let s = create(base(), goodPiece({ name: 'first' }));
    s = create(s, goodPiece({ name: 'second' }));
    expect(s.pieces.map((p) => p.name)).toEqual(['first', 'second']);
  });

  it('unknown container → state unchanged + localized error toast', () => {
    const s0 = base();
    const s = create(s0, goodPiece({ sourceIds: ['nope'], ranges: [{ sourceId: 'nope', start: 0, end: 4, orientation: 'forward' }] }));
    expect(s.pieces).toBe(s0.pieces);
    expect(s.toast).toMatchObject({ kind: 'error', message: STRINGS.canvasSkeleton.pieces.errorContainerNotFound });
  });

  it('over MAX_PIECES → unchanged + errorTooMany toast with the limit', () => {
    const pieces = Array.from({ length: PIECE_CAPS.MAX_PIECES }, (_, i) => ({ id: `pc-${i}` }));
    const s = create(base({ pieces }), goodPiece());
    expect(s.pieces).toHaveLength(PIECE_CAPS.MAX_PIECES);
    expect(s.toast.kind).toBe('error');
    expect(s.toast.message).toContain(String(PIECE_CAPS.MAX_PIECES));
  });
});

describe('T1 K3 UPDATE_PIECE / REMOVE_PIECE', () => {
  it('UPDATE_PIECE merges changes and bumps updatedAt', () => {
    let s = create(base(), goodPiece());
    const id = s.pieces[0].id;
    const created = s.pieces[0].createdAt;
    s = piecesReducer(s, { type: 'UPDATE_PIECE', pieceId: id, changes: { name: 'renamed' } });
    expect(s.pieces[0].name).toBe('renamed');
    expect(s.pieces[0].updatedAt).toBeGreaterThanOrEqual(created);
  });

  it('UPDATE_PIECE invalid range → unchanged + error toast', () => {
    let s = create(base(), goodPiece());
    const before = s.pieces;
    s = piecesReducer(s, {
      type: 'UPDATE_PIECE', pieceId: before[0].id,
      changes: { ranges: [{ sourceId: 'c-1', start: 0, end: 999999, orientation: 'forward' }] },
    });
    expect(s.pieces).toBe(before);
    expect(s.toast.kind).toBe('error');
  });

  it('UPDATE_PIECE recomputes sourceIds from ranges when not supplied', () => {
    let s = create(base({ containers: [C, { id: 'c-2', name: 'x', sequence: 'TTTT' }] }), goodPiece());
    const id = s.pieces[0].id;
    s = piecesReducer(s, {
      type: 'UPDATE_PIECE', pieceId: id,
      changes: { ranges: [{ sourceId: 'c-2', start: 0, end: 3, orientation: 'forward' }] },
    });
    expect(s.pieces[0].sourceIds).toEqual(['c-2']);
  });

  it('UPDATE_PIECE unknown id → state unchanged', () => {
    const s0 = create(base(), goodPiece());
    const s = piecesReducer(s0, { type: 'UPDATE_PIECE', pieceId: 'pc-ghost', changes: { name: 'x' } });
    expect(s).toBe(s0);
  });

  it('REMOVE_PIECE filters by id; missing id → unchanged', () => {
    let s = create(base(), goodPiece());
    const id = s.pieces[0].id;
    const s1 = piecesReducer(s, { type: 'REMOVE_PIECE', pieceId: 'pc-absent' });
    expect(s1).toBe(s);
    s = piecesReducer(s, { type: 'REMOVE_PIECE', pieceId: id });
    expect(s.pieces).toEqual([]);
  });
});

describe('T1 K3 CLONE_PIECE / setters / BUMP_PIECE_ORIGIN', () => {
  it('CLONE_PIECE deep-copies with new id/color, "(копия)" name, null derivedReactionId', () => {
    let s = create(base(), goodPiece({ name: 'orig' }));
    const src = s.pieces[0];
    s = piecesReducer(s, { type: 'CLONE_PIECE', pieceId: src.id });
    expect(s.pieces).toHaveLength(2);
    const clone = s.pieces[1];
    expect(clone.id).not.toBe(src.id);
    expect(clone.name).toBe('orig (копия)');
    expect(clone.derivedReactionId).toBeNull();
  });

  it('CLONE_PIECE unknown id → unchanged', () => {
    const s0 = create(base(), goodPiece());
    expect(piecesReducer(s0, { type: 'CLONE_PIECE', pieceId: 'pc-x' })).toBe(s0);
  });

  it('SET_PIECE_ACQUISITION_METHOD valid → method + params merged', () => {
    let s = create(base(), goodPiece());
    const id = s.pieces[0].id;
    s = piecesReducer(s, {
      type: 'SET_PIECE_ACQUISITION_METHOD', pieceId: id,
      method: 'pcr', params: { primerPairId: { forward: 'pending', reverse: 'pending' } },
    });
    expect(s.pieces[0].acquisitionMethod).toBe('pcr');
    expect(s.pieces[0].acquisitionParams).toMatchObject({ primerPairId: { forward: 'pending' } });
  });

  it('SET_PIECE_ACQUISITION_METHOD bad method → error toast, unchanged', () => {
    let s = create(base(), goodPiece());
    const before = s.pieces;
    s = piecesReducer(s, { type: 'SET_PIECE_ACQUISITION_METHOD', pieceId: before[0].id, method: 'teleport' });
    expect(s.pieces).toBe(before);
    expect(s.toast.kind).toBe('error');
  });

  it('SET_PIECE_COLOR / SET_PIECE_FUNCTIONAL_LABEL / SET_PIECE_ZONE merge the field', () => {
    let s = create(base(), goodPiece());
    const id = s.pieces[0].id;
    s = piecesReducer(s, { type: 'SET_PIECE_COLOR', pieceId: id, color: '#123456' });
    s = piecesReducer(s, { type: 'SET_PIECE_FUNCTIONAL_LABEL', pieceId: id, functionalLabel: 'guide' });
    s = piecesReducer(s, { type: 'SET_PIECE_ZONE', pieceId: id, zoneId: 'z-9' });
    expect(s.pieces[0]).toMatchObject({ color: '#123456', functionalLabel: 'guide', zoneId: 'z-9' });
  });

  it('BUMP_PIECE_ORIGIN changes origin (T2 migration hook)', () => {
    let s = create(base(), goodPiece());
    const id = s.pieces[0].id;
    s = piecesReducer(s, { type: 'BUMP_PIECE_ORIGIN', pieceId: id, origin: 'legacy-migration' });
    expect(s.pieces[0].origin).toBe('legacy-migration');
  });
});

// K5 — router integration via the public skeletonReducer.
describe('T1 K5 router integration', () => {
  function stateWithContainer() {
    const s = buildInitialState();
    return { ...s, containers: [...s.containers, C] };
  }

  it('buildInitialState() includes an empty pieces slice', () => {
    expect(buildInitialState().pieces).toEqual([]);
  });

  it('CREATE_PIECE routes through skeletonReducer (toast stamped by router)', () => {
    const s = skeletonReducer(stateWithContainer(), { type: 'CREATE_PIECE', piece: goodPiece() });
    expect(s.pieces).toHaveLength(1);
    expect(s.pieces[0].id).toMatch(/^pc-/);
  });

  it('CREATE_PIECE error toast is stamped + queued by the router', () => {
    const s = skeletonReducer(stateWithContainer(), {
      type: 'CREATE_PIECE',
      piece: goodPiece({ sourceIds: ['nope'], ranges: [{ sourceId: 'nope', start: 0, end: 4, orientation: 'forward' }] }),
    });
    expect(s.pieces).toEqual([]);
    expect(s.toast).toMatchObject({ kind: 'error', id: expect.any(String) });
    expect(s.toasts.some((t) => t.message === STRINGS.canvasSkeleton.pieces.errorContainerNotFound)).toBe(true);
  });

  it('non-piece action keeps the pieces slice identity (DEC-OPS-01 chain)', () => {
    const s0 = skeletonReducer(stateWithContainer(), { type: 'CREATE_PIECE', piece: goodPiece() });
    const s1 = skeletonReducer(s0, { type: 'SET_VIEW', view: 'graph' });
    expect(s1.pieces).toBe(s0.pieces);
  });

  it('DEC-T1-13 — REPLACE_STATE on a pre-T1 snapshot fills pieces:[] default', () => {
    const snap = {
      containers: [{ id: 'c-1', name: 'X', sequence: 'A', topology: { circular: false }, annotations: [] }],
      operations: [], positions: {}, junctions: [], cascadeIndex: 0,
    };
    const next = skeletonReducer(buildInitialState(), { type: 'REPLACE_STATE', state: snap });
    expect(next.pieces).toEqual([]);
  });

  it('DEC-T1-13 — REPLACE_STATE preserves pieces from a post-T1 snapshot', () => {
    const snap = {
      containers: [{ id: 'c-1', name: 'X', sequence: 'A', topology: { circular: false }, annotations: [] }],
      operations: [], positions: {}, junctions: [], cascadeIndex: 0,
      pieces: [{ id: 'pc-keep', name: 'keep', sourceIds: ['c-1'], ranges: [], origin: 'selection' }],
    };
    const next = skeletonReducer(buildInitialState(), { type: 'REPLACE_STATE', state: snap });
    expect(next.pieces).toEqual(snap.pieces);
  });
});
