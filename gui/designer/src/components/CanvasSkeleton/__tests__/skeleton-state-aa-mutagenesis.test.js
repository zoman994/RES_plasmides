import { describe, expect, it } from 'vitest';
import { buildInitialState, skeletonReducer } from '../store/skeleton-state';

const sourcePiece = {
  id: 'piece-parent', kind: 'sourced', name: 'parent', sourceIds: ['container-1'],
  ranges: [{ sourceId: 'container-1', start: 0, end: 30, orientation: 'forward' }],
  mutations: [], zoneId: 'draft-1', order: 0, createdAt: 1, updatedAt: 1,
};

function state() {
  return {
    ...buildInitialState(),
    pieces: [sourcePiece],
    zones: [{ id: 'draft-1', name: 'draft' }],
    operations: [],
    assemblyDraftPrimers: { 'draft-1': [] },
  };
}

function payload(over = {}) {
  const mutation = {
    kind: 'aa-substitution', regionId: 'cds-1', aaIndex: 1, strand: 1,
    fromAA: 'K', toAA: 'E', fromCodon: 'AAA', toCodon: 'GAA',
    genomicPositions: [0, 1, 2],
  };
  const pairId = 'pair-aa-1';
  const variant = {
    ...sourcePiece, id: 'piece-variant', name: 'parent K1E', zoneId: null, order: null,
    variantOf: sourcePiece.id, mutations: [{ position: 0, fromBase: 'A', toBase: 'G' }],
    aaMutation: mutation,
  };
  const reaction = {
    id: 'reaction-aa-1', kind: 'mutagenesis', status: 'committed',
    inputs: [sourcePiece.id], outputs: [variant.id], zoneId: 'draft-1',
    params: { mechanism: 'kld', sourcePieceId: sourcePiece.id, variantPieceId: variant.id, mutation },
  };
  const primer = (id, direction) => ({
    id, draftId: 'draft-1', pairId, reactionId: reaction.id, direction,
    sequence: direction === 'forward' ? 'GAATTTTTTTTTTTTTTTTTT' : 'CCCCCCCCCCCCCCCCCCCC',
    tail: '',
    bindingSequence: direction === 'forward' ? 'GAATTTTTTTTTTTTTTTTTT' : 'CCCCCCCCCCCCCCCCCCCC',
    bindingModel: 'aligned-v1',
    sites: [{ id: `${id}-site`, strand: direction === 'forward' ? 1 : -1 }],
    source: { kind: 'aa-mutagenesis', sourcePieceId: sourcePiece.id, variantPieceId: variant.id, reactionId: reaction.id },
  });
  return {
    draftId: 'draft-1', sourcePieceId: sourcePiece.id, mutation, variant, reaction,
    primers: [primer('primer-f', 'forward'), primer('primer-r', 'reverse')],
    ...over,
  };
}

describe('COMMIT_AA_MUTAGENESIS — one atomic state transition', () => {
  it('adds one variant, one reaction and exactly one canonical pair while parent stays unchanged', () => {
    const before = state();
    const parentSnapshot = structuredClone(before.pieces[0]);
    const next = skeletonReducer(before, { type: 'COMMIT_AA_MUTAGENESIS', payload: payload() });

    expect(next).not.toBe(before);
    expect(next.pieces).toHaveLength(2);
    expect(next.pieces[0]).toEqual(parentSnapshot);
    expect(next.pieces[1]).toMatchObject({ id: 'piece-variant', variantOf: 'piece-parent' });
    expect(next.operations).toHaveLength(1);
    expect(next.operations[0]).toMatchObject({ id: 'reaction-aa-1', kind: 'mutagenesis' });
    expect(next.assemblyDraftPrimers['draft-1']).toHaveLength(2);
    expect(next.assemblyDraftPrimers['draft-1'].map((p) => p.direction).sort())
      .toEqual(['forward', 'reverse']);
    expect(new Set(next.assemblyDraftPrimers['draft-1'].map((p) => p.pairId)).size).toBe(1);
    expect(next.assemblyDraftPrimers['draft-1'].every((p) => p.bindingModel === 'aligned-v1')).toBe(true);
  });

  it('rejects a one-primer or three-primer transaction without changing state', () => {
    const before = state();
    expect(skeletonReducer(before, {
      type: 'COMMIT_AA_MUTAGENESIS', payload: payload({ primers: payload().primers.slice(0, 1) }),
    })).toBe(before);
    expect(skeletonReducer(before, {
      type: 'COMMIT_AA_MUTAGENESIS', payload: payload({ primers: [...payload().primers, payload().primers[0]] }),
    })).toBe(before);
  });

  it('rejects the whole transaction when exactly one primer is missing the shared pairId', () => {
    const before = state();
    const tx = payload();
    const primers = tx.primers.map((primer, index) => (
      index === 0 ? { ...primer, pairId: null } : primer
    ));

    expect(skeletonReducer(before, {
      type: 'COMMIT_AA_MUTAGENESIS', payload: { ...tx, primers },
    })).toBe(before);
  });

  it('rejects duplicate ids or mismatched source/variant references atomically', () => {
    const before = state();
    expect(skeletonReducer(before, {
      type: 'COMMIT_AA_MUTAGENESIS', payload: payload({ variant: { ...payload().variant, id: sourcePiece.id } }),
    })).toBe(before);
    expect(skeletonReducer(before, {
      type: 'COMMIT_AA_MUTAGENESIS',
      payload: payload({ reaction: { ...payload().reaction, outputs: ['wrong-variant'] } }),
    })).toBe(before);
  });
});
