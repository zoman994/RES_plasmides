/**
 * draftfromzone-mutations-s2.test.js — SPEC_EDITABLE_ASSEMBLY_S2 §5.4.
 *
 * draftFromZone applies a sourced piece's mutations to its (post-rc)
 * sequence, so the assembled view renders the mutated base instead of
 * the wild-type one. Mutations are orthogonal to gap / annotation logic.
 */
import { describe, it, expect } from 'vitest';
import { draftFromZone } from '../lib/zone-pieces-to-dag';

const zone = { id: 'zZ', name: 'Z', topology: { circular: false } };
function stateWith(piece) {
  return {
    containers: [{ id: 'cZ', name: 'c', sequence: 'AAAACCCC', annotations: [] }],
    pieces: [piece],
  };
}
const sourced = (over) => ({
  id: 'p1',
  kind: 'sourced',
  name: 'p',
  zoneId: 'zZ',
  sourceIds: ['cZ'],
  ranges: [{
    sourceId: 'cZ', start: 0, end: 8, orientation: over.orientation || 'forward',
  }],
  mutations: over.mutations || [],
  color: '#888888',
  createdAt: 1,
});

describe('draftFromZone — sourced piece mutations', () => {
  it('applies a forward mutation to the assembled-view sequence', () => {
    const d = draftFromZone(stateWith(sourced({ mutations: [{ position: 1, toBase: 'G' }] })), zone);
    expect(d.segments[0].sequence).toBe('AGAACCCC'); // pos 1 A→G
  });

  it('applies a mutation in top-strand coords for a reverse range', () => {
    // raw AAAACCCC, reverse → GGGGTTTT; mutate top-strand pos 0 G→A
    const d = draftFromZone(stateWith(sourced({ orientation: 'reverse', mutations: [{ position: 0, toBase: 'A' }] })), zone);
    expect(d.segments[0].sequence).toBe('AGGGTTTT');
  });

  it('leaves the sequence wild-type when there are no mutations', () => {
    const d = draftFromZone(stateWith(sourced({ mutations: [] })), zone);
    expect(d.segments[0].sequence).toBe('AAAACCCC');
  });
});
