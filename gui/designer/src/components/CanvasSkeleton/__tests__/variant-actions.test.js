/**
 * variant-actions.test.js — T9 K5/K6 (§5.3, DEC-T9-03/05/12).
 * CREATE_DESIGN_VARIANT / REMOVE_FROM_VARIANT_GROUP /
 * HIGHLIGHT_VARIANT_GROUP (pieces) + MATERIALIZE_REACTION (operations)
 * + REMOVE_PIECE variant-group disband cascade.
 */
import { describe, it, expect } from 'vitest';
import { piecesReducer, buildInitialPiecesState } from '../store/skeleton-state-pieces';
import { operationsReducer } from '../store/skeleton-state-operations';

const C = { id: 'cZ', name: 'pUC', sequence: 'AAAACCCCGGGGTTTT' };
function basePiece(id) {
  return {
    id, kind: 'sourced', name: id, sourceIds: ['cZ'],
    ranges: [{ sourceId: 'cZ', start: 0, end: 8, orientation: 'forward' }],
    origin: 'selection', acquisitionMethod: 'undefined', acquisitionParams: {},
    color: '#abc', zoneId: 'z1', order: null, variantGroupId: null,
    derivedReactionId: null, frozen: false, createdAt: 1, updatedAt: 1,
  };
}
function st(pieces) {
  return {
    ...buildInitialPiecesState(), containers: [C], operations: [], junctions: [],
    zones: [{ id: 'z1' }], pieces,
  };
}

describe('T9 K5 — CREATE_DESIGN_VARIANT', () => {
  it('source without group → both source + new share a fresh vg-<uuid>', () => {
    const s = st([basePiece('p1')]);
    const n = piecesReducer(s, { type: 'CREATE_DESIGN_VARIANT', sourcePieceId: 'p1' });
    expect(n.pieces).toHaveLength(2);
    const [a, b] = n.pieces;
    expect(a.variantGroupId).toMatch(/^vg-/);
    expect(b.variantGroupId).toBe(a.variantGroupId);
    expect(b.id).not.toBe('p1');
  });

  it('source already in a group → new piece joins the SAME group', () => {
    let s = st([basePiece('p1')]);
    s = piecesReducer(s, { type: 'CREATE_DESIGN_VARIANT', sourcePieceId: 'p1' });
    const vg = s.pieces[0].variantGroupId;
    s = piecesReducer(s, { type: 'CREATE_DESIGN_VARIANT', sourcePieceId: 'p1' });
    expect(s.pieces).toHaveLength(3);
    expect(s.pieces.every((p) => p.variantGroupId === vg)).toBe(true);
  });

  it('overrides apply (name + ranges) on the new variant', () => {
    const s = st([basePiece('p1')]);
    const n = piecesReducer(s, {
      type: 'CREATE_DESIGN_VARIANT',
      sourcePieceId: 'p1',
      overrides: { name: 'alt', ranges: [{ sourceId: 'cZ', start: 2, end: 10, orientation: 'forward' }] },
    });
    const nv = n.pieces[1];
    expect(nv.name).toBe('alt');
    expect(nv.ranges[0]).toMatchObject({ start: 2, end: 10 });
  });

  it('unknown source → state unchanged', () => {
    const s = st([basePiece('p1')]);
    expect(piecesReducer(s, { type: 'CREATE_DESIGN_VARIANT', sourcePieceId: 'gone' })).toBe(s);
  });
});

describe('T9 K5 — REMOVE_FROM_VARIANT_GROUP', () => {
  it('clears the piece; group of 2 → disband (remaining also cleared, DEC-T9-12)', () => {
    let s = st([basePiece('p1')]);
    s = piecesReducer(s, { type: 'CREATE_DESIGN_VARIANT', sourcePieceId: 'p1' });
    const other = s.pieces[1].id;
    s = piecesReducer(s, { type: 'REMOVE_FROM_VARIANT_GROUP', pieceId: 'p1' });
    expect(s.pieces.find((p) => p.id === 'p1').variantGroupId).toBeNull();
    expect(s.pieces.find((p) => p.id === other).variantGroupId).toBeNull();
  });

  it('group of 3 → removing one keeps the group for the other two', () => {
    let s = st([basePiece('p1')]);
    s = piecesReducer(s, { type: 'CREATE_DESIGN_VARIANT', sourcePieceId: 'p1' });
    s = piecesReducer(s, { type: 'CREATE_DESIGN_VARIANT', sourcePieceId: 'p1' });
    const vg = s.pieces[0].variantGroupId;
    s = piecesReducer(s, { type: 'REMOVE_FROM_VARIANT_GROUP', pieceId: 'p1' });
    const stillGrouped = s.pieces.filter((p) => p.variantGroupId === vg);
    expect(stillGrouped).toHaveLength(2);
  });

  it('piece not in a group → no-op', () => {
    const s = st([basePiece('p1')]);
    expect(piecesReducer(s, { type: 'REMOVE_FROM_VARIANT_GROUP', pieceId: 'p1' })).toBe(s);
  });
});

describe('T9 K5 — HIGHLIGHT_VARIANT_GROUP', () => {
  it('sets highlightedVariantGroup; durationMs 0 clears', () => {
    let s = st([basePiece('p1')]);
    s = piecesReducer(s, { type: 'HIGHLIGHT_VARIANT_GROUP', variantGroupId: 'vg-x', durationMs: 2000 });
    expect(s.highlightedVariantGroup.variantGroupId).toBe('vg-x');
    expect(s.highlightedVariantGroup.until).toBeGreaterThan(Date.now());
    s = piecesReducer(s, { type: 'HIGHLIGHT_VARIANT_GROUP', variantGroupId: 'vg-x', durationMs: 0 });
    expect(s.highlightedVariantGroup).toBeNull();
  });
});

describe('T9 K6 — REMOVE_PIECE variant-group disband cascade', () => {
  it('removing a member that leaves 1 → remaining piece variantGroupId cleared', () => {
    let s = st([basePiece('p1')]);
    s = piecesReducer(s, { type: 'CREATE_DESIGN_VARIANT', sourcePieceId: 'p1' });
    const other = s.pieces[1].id;
    s = piecesReducer(s, { type: 'REMOVE_PIECE', pieceId: 'p1' });
    expect(s.pieces.find((p) => p.id === other).variantGroupId).toBeNull();
  });

  it('removing a member that leaves ≥2 → group preserved', () => {
    let s = st([basePiece('p1')]);
    s = piecesReducer(s, { type: 'CREATE_DESIGN_VARIANT', sourcePieceId: 'p1' });
    s = piecesReducer(s, { type: 'CREATE_DESIGN_VARIANT', sourcePieceId: 'p1' });
    const vg = s.pieces[0].variantGroupId;
    s = piecesReducer(s, { type: 'REMOVE_PIECE', pieceId: 'p1' });
    expect(s.pieces.filter((p) => p.variantGroupId === vg)).toHaveLength(2);
  });
});

describe('T9 K5 — MATERIALIZE_REACTION', () => {
  function execOpState() {
    return {
      containers: [{ id: 'prod', name: 'gibson-product', sequence: 'ACGTACGT', annotations: [] }],
      operations: [{
        id: 'op1', kind: 'gibson', status: 'executed',
        outputs: ['prod'], inputPieces: [], materializedClones: null,
      }],
      positions: { prod: { x: 400, y: 200 } },
      pieces: [],
    };
  }

  it('4 clones → op.materializedClones len 4, 3 new clone containers', () => {
    const s = execOpState();
    const n = operationsReducer(s, {
      type: 'MATERIALIZE_REACTION',
      operationId: 'op1',
      clones: [{ label: 'c1' }, { label: 'c2' }, { label: 'c3' }, { label: 'c4' }],
    });
    const op = n.operations.find((o) => o.id === 'op1');
    expect(op.materializedClones).toHaveLength(4);
    expect(op.materializedClones[0].cloneId).toBe('prod'); // original = clone 1
    expect(op.materializedClones.every((c) => c.sangerVerified === 'pending')).toBe(true);
    expect(n.containers).toHaveLength(4); // prod + 3 new
    // new clone containers carry the original sequence
    const news = n.containers.filter((c) => c.id !== 'prod');
    expect(news.every((c) => c.sequence === 'ACGTACGT')).toBe(true);
    expect(op.outputs).toEqual(['prod']); // outputs untouched
  });

  it('op not executed → state unchanged (R-T9-2 strict)', () => {
    const s = execOpState();
    s.operations[0].status = 'committed';
    expect(operationsReducer(s, {
      type: 'MATERIALIZE_REACTION', operationId: 'op1', clones: [{ label: 'c1' }],
    })).toBe(s);
  });

  it('unknown op → state unchanged', () => {
    const s = execOpState();
    expect(operationsReducer(s, {
      type: 'MATERIALIZE_REACTION', operationId: 'nope', clones: [{ label: 'c1' }],
    })).toBe(s);
  });
});
