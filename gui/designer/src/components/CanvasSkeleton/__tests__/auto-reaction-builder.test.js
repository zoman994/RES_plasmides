/**
 * auto-reaction-builder.test.js — T8 K2 (§5.1, DEC-T8-03/04/07).
 * Pure builders that derive an upstream reaction op from a piece's
 * acquisitionMethod.
 */
import { describe, it, expect } from 'vitest';
import {
  shouldHaveReaction, mapMethodToKind, buildReactionForPiece,
  findInsertPositionForReaction, applyAutoReactions,
} from '../lib/auto-reaction-builder';

const piece = (over = {}) => ({
  id: 'pc1', kind: 'sourced', zoneId: 'zn-1',
  sourceIds: ['c1'], ranges: [{ sourceId: 'c1', start: 4, end: 12, orientation: 'forward' }],
  acquisitionMethod: 'pcr', acquisitionParams: {}, derivedReactionId: null, ...over,
});

describe('T8 K2 — shouldHaveReaction', () => {
  it('true for pcr / ov-pcr / restriction', () => {
    expect(shouldHaveReaction(piece({ acquisitionMethod: 'pcr' }))).toBe(true);
    expect(shouldHaveReaction(piece({ acquisitionMethod: 'ov-pcr' }))).toBe(true);
    expect(shouldHaveReaction(piece({ acquisitionMethod: 'restriction' }))).toBe(true);
  });
  it('false for undefined / direct / synthesis / gap / null', () => {
    expect(shouldHaveReaction(piece({ acquisitionMethod: 'undefined' }))).toBe(false);
    expect(shouldHaveReaction(piece({ acquisitionMethod: 'direct' }))).toBe(false);
    expect(shouldHaveReaction(piece({ acquisitionMethod: 'synthesis' }))).toBe(false);
    expect(shouldHaveReaction(piece({ kind: 'gap', acquisitionMethod: 'pcr' }))).toBe(false);
    expect(shouldHaveReaction(null)).toBe(false);
  });
});

describe('T8 K2 — mapMethodToKind', () => {
  it('pcr→pcr, ov-pcr→pcr, restriction→cut, else null', () => {
    expect(mapMethodToKind('pcr')).toBe('pcr');
    expect(mapMethodToKind('ov-pcr')).toBe('pcr');
    expect(mapMethodToKind('restriction')).toBe('cut');
    expect(mapMethodToKind('synthesis')).toBeNull();
    expect(mapMethodToKind('undefined')).toBeNull();
  });
});

describe('T8 K2 — buildReactionForPiece', () => {
  it('pcr piece → committed pcr op, inputPieces=[piece.id], zoneId carried', () => {
    const st = { positions: { pc1: { x: 500, y: 300 } }, operations: [] };
    const op = buildReactionForPiece(piece({ acquisitionParams: { primerPairId: 'pp1' } }), st);
    expect(op.kind).toBe('pcr');
    expect(op.status).toBe('committed');
    expect(op.inputPieces).toEqual(['pc1']);
    expect(op.inputs).toEqual(['c1']);
    expect(op.zoneId).toBe('zn-1');
    expect(op.params.primerPairId).toBe('pp1');
    expect(op.params.templateId).toBe('c1');
    expect(op.params.range).toEqual({ start: 4, end: 12 });
    expect(op.position.x).toBe(500 - 220);
    expect(typeof op.id).toBe('string');
  });

  it('restriction piece → cut op with enzymeName from acquisitionParams', () => {
    const st = { positions: {}, operations: [] };
    const op = buildReactionForPiece(
      piece({ acquisitionMethod: 'restriction', acquisitionParams: { enzymes: ['EcoRI'] } }),
      st,
    );
    expect(op.kind).toBe('cut');
    expect(op.params.enzymeName).toBe('EcoRI');
  });

  it('non-mappable method → null', () => {
    expect(buildReactionForPiece(piece({ acquisitionMethod: 'synthesis' }), { positions: {} })).toBeNull();
  });
});

describe('T8 K2 — findInsertPositionForReaction', () => {
  it('places 220 left of the piece when free', () => {
    expect(findInsertPositionForReaction({ x: 400, y: 200 }, { positions: {} }))
      .toEqual({ x: 180, y: 200 });
  });
  it('shifts down on collision; falls back to corner after 10 tries', () => {
    const positions = {};
    for (let i = 0; i < 12; i += 1) positions[`o${i}`] = { x: 180, y: 200 + i * 80 };
    const out = findInsertPositionForReaction({ x: 400, y: 200 }, { positions });
    expect(out).toEqual({ x: 50, y: 50 });
  });
});

describe('T8 K5 — applyAutoReactions (pure finalizer body)', () => {
  const base = (over = {}) => ({
    pieces: [piece(over)], operations: [], positions: { pc1: { x: 400, y: 200 } },
  });

  it('creates a reaction + links derivedReactionId', () => {
    const out = applyAutoReactions(base({ acquisitionMethod: 'pcr' }));
    expect(out.operations).toHaveLength(1);
    expect(out.operations[0].kind).toBe('pcr');
    expect(out.pieces[0].derivedReactionId).toBe(out.operations[0].id);
    expect(out.positions[out.operations[0].id]).toBeTruthy();
  });

  it('idempotent — second pass returns the SAME state ref', () => {
    const once = applyAutoReactions(base({ acquisitionMethod: 'pcr' }));
    const twice = applyAutoReactions(once);
    expect(twice).toBe(once);
  });

  it('no reaction for undefined/synthesis/gap → state unchanged ref', () => {
    const s = base({ acquisitionMethod: 'undefined' });
    expect(applyAutoReactions(s)).toBe(s);
  });

  it('method → undefined removes the op + clears derivedReactionId', () => {
    const created = applyAutoReactions(base({ acquisitionMethod: 'pcr' }));
    const flipped = {
      ...created,
      pieces: created.pieces.map((p) => ({ ...p, acquisitionMethod: 'undefined' })),
    };
    const out = applyAutoReactions(flipped);
    expect(out.operations).toHaveLength(0);
    expect(out.pieces[0].derivedReactionId).toBeNull();
  });

  it('method change pcr→restriction swaps the reaction (DEC-T8-12)', () => {
    const created = applyAutoReactions(base({ acquisitionMethod: 'pcr' }));
    const oldId = created.operations[0].id;
    const flipped = {
      ...created,
      pieces: created.pieces.map((p) => ({
        ...p, acquisitionMethod: 'restriction', acquisitionParams: { enzymes: ['EcoRI'] },
      })),
    };
    const out = applyAutoReactions(flipped);
    expect(out.operations).toHaveLength(1);
    expect(out.operations[0].id).not.toBe(oldId);
    expect(out.operations[0].kind).toBe('cut');
    expect(out.pieces[0].derivedReactionId).toBe(out.operations[0].id);
  });

  it('stale derivedReactionId (op gone) → recreated', () => {
    const s = {
      pieces: [piece({ acquisitionMethod: 'pcr', derivedReactionId: 'op-ghost' })],
      operations: [],
      positions: { pc1: { x: 400, y: 200 } },
    };
    const out = applyAutoReactions(s);
    expect(out.operations).toHaveLength(1);
    expect(out.pieces[0].derivedReactionId).toBe(out.operations[0].id);
  });
});
