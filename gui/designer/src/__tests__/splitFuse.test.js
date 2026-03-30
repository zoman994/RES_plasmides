/**
 * Tests for splitPart and fuseParts store actions.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { createFragmentSlice } from '../store/fragmentSlice';

function createTestStore() {
  return create(immer((set, get) => ({
    ...createFragmentSlice(set, get),
    assemblies: [],
    activeId: null,
  })));
}

// 18 bp = 6 codons: ATG GAT GAA GCG AAA TAA
const SEQ = 'ATGGATGAAGCGAAATAA';

function seedPart(store, overrides = {}) {
  store.getState().addPart({
    id: 'p1',
    name: 'GeneX',
    type: 'CDS',
    sequence: SEQ,
    length: SEQ.length,
    domains: [
      { name: 'DomA', start: 0, end: 9 },   // first 9 bp
      { name: 'DomB', start: 9, end: 18 },  // last 9 bp
    ],
    annotations: [
      { name: 'Full CDS', type: 'CDS', start: 0, end: 18 },
      { name: 'Tag', type: 'tag', start: 12, end: 18 },
    ],
    ...overrides,
  });
}

// ─── splitPart ────────────────────────────────────────────

describe('splitPart', () => {
  let store;
  beforeEach(() => { store = createTestStore(); seedPart(store); });

  it('creates two parts with correct lengths', () => {
    const [id1, id2] = store.getState().splitPart('p1', 9);
    const parts = store.getState().parts;
    const part1 = parts.find(p => p.id === id1);
    const part2 = parts.find(p => p.id === id2);

    expect(parts).toHaveLength(3); // original + 2
    expect(part1.sequence).toBe('ATGGATGAA');
    expect(part2.sequence).toBe('GCGAAATAA');
    expect(part1.sequence.length + part2.sequence.length).toBe(SEQ.length);
  });

  it('both children have parentId pointing to original', () => {
    const [id1, id2] = store.getState().splitPart('p1', 9);
    const parts = store.getState().parts;

    expect(parts.find(p => p.id === id1).parentId).toBe('p1');
    expect(parts.find(p => p.id === id2).parentId).toBe('p1');
  });

  it('original.children contains both new ids', () => {
    const [id1, id2] = store.getState().splitPart('p1', 9);
    const parent = store.getState().parts.find(p => p.id === 'p1');

    expect(parent.children).toContain(id1);
    expect(parent.children).toContain(id2);
  });

  it('original sequence is not changed', () => {
    store.getState().splitPart('p1', 9);
    const parent = store.getState().parts.find(p => p.id === 'p1');
    expect(parent.sequence).toBe(SEQ);
  });

  it('distributes domains correctly at split point', () => {
    // Split at 9: DomA(0-9) fully in part1, DomB(9-18) fully in part2
    const [id1, id2] = store.getState().splitPart('p1', 9);
    const part1 = store.getState().parts.find(p => p.id === id1);
    const part2 = store.getState().parts.find(p => p.id === id2);

    expect(part1.domains).toEqual([{ name: 'DomA', start: 0, end: 9 }]);
    expect(part2.domains).toEqual([{ name: 'DomB', start: 0, end: 9 }]);
  });

  it('clamps domain spanning the split point into both halves', () => {
    // Add a domain that spans the split: 3..15
    store.getState().updatePart('p1', {
      domains: [{ name: 'Wide', start: 3, end: 15 }],
    });
    const [id1, id2] = store.getState().splitPart('p1', 9);
    const part1 = store.getState().parts.find(p => p.id === id1);
    const part2 = store.getState().parts.find(p => p.id === id2);

    // part1 gets 3..9 (clamped), part2 gets 0..6 (shifted)
    expect(part1.domains).toEqual([{ name: 'Wide', start: 3, end: 9 }]);
    expect(part2.domains).toEqual([{ name: 'Wide', start: 0, end: 6 }]);
  });

  it('distributes annotations with correct coordinates', () => {
    // Split at 9: "Full CDS"(0-18) spans both, "Tag"(12-18) only in part2
    const [id1, id2] = store.getState().splitPart('p1', 9);
    const part1 = store.getState().parts.find(p => p.id === id1);
    const part2 = store.getState().parts.find(p => p.id === id2);

    // part1 annotations: Full CDS clamped to 0-9
    expect(part1.annotations).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Full CDS', start: 0, end: 9 })]),
    );
    // part2 annotations: Full CDS shifted to 0-9, Tag shifted to 3-9
    expect(part2.annotations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Full CDS', start: 0, end: 9 }),
        expect.objectContaining({ name: 'Tag', start: 3, end: 9 }),
      ]),
    );
  });

  it('sets derivation.type = "split" with position', () => {
    const [id1, id2] = store.getState().splitPart('p1', 9);
    const part1 = store.getState().parts.find(p => p.id === id1);
    const part2 = store.getState().parts.find(p => p.id === id2);

    expect(part1.derivation).toEqual({ type: 'split', position: 9, index: 0 });
    expect(part2.derivation).toEqual({ type: 'split', position: 9, index: 1 });
  });

  it('returns null for position at 0 or beyond length', () => {
    expect(store.getState().splitPart('p1', 0)).toBeNull();
    expect(store.getState().splitPart('p1', SEQ.length)).toBeNull();
    expect(store.getState().splitPart('p1', -1)).toBeNull();
  });

  it('returns null for non-existent part', () => {
    expect(store.getState().splitPart('nope', 5)).toBeNull();
  });
});

// ─── fuseParts ────────────────────────────────────────────

describe('fuseParts', () => {
  let store;
  beforeEach(() => {
    store = createTestStore();
    store.getState().addPart({
      id: 'a', name: 'PartA', type: 'CDS',
      sequence: 'ATGATG', length: 6,
      domains: [{ name: 'DA', start: 0, end: 6 }],
      annotations: [{ name: 'AnnA', type: 'CDS', start: 0, end: 6 }],
    });
    store.getState().addPart({
      id: 'b', name: 'PartB', type: 'CDS',
      sequence: 'GCGTAA', length: 6,
      domains: [{ name: 'DB', start: 0, end: 6 }],
      annotations: [{ name: 'AnnB', type: 'tag', start: 0, end: 6 }],
    });
  });

  it('creates fused part with combined sequence', () => {
    const fusedId = store.getState().fuseParts('a', 'b', 'Fusion1');
    const fused = store.getState().parts.find(p => p.id === fusedId);

    expect(fused.sequence).toBe('ATGATGGCGTAA');
    expect(fused.length).toBe(12);
    expect(fused.name).toBe('Fusion1');
  });

  it('uses default name when none provided', () => {
    const fusedId = store.getState().fuseParts('a', 'b');
    const fused = store.getState().parts.find(p => p.id === fusedId);
    expect(fused.name).toBe('PartA-PartB');
  });

  it('parentIds points to both originals', () => {
    const fusedId = store.getState().fuseParts('a', 'b', 'F');
    const fused = store.getState().parts.find(p => p.id === fusedId);

    expect(fused.parentIds).toEqual(['a', 'b']);
  });

  it('appears in children of BOTH parents', () => {
    const fusedId = store.getState().fuseParts('a', 'b', 'F');
    const partA = store.getState().parts.find(p => p.id === 'a');
    const partB = store.getState().parts.find(p => p.id === 'b');

    expect(partA.children).toContain(fusedId);
    expect(partB.children).toContain(fusedId);
  });

  it('shifts part2 annotations by junction position', () => {
    const fusedId = store.getState().fuseParts('a', 'b', 'F');
    const fused = store.getState().parts.find(p => p.id === fusedId);

    // AnnA stays 0-6, AnnB shifts to 6-12
    expect(fused.annotations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'AnnA', start: 0, end: 6 }),
        expect.objectContaining({ name: 'AnnB', start: 6, end: 12 }),
      ]),
    );
  });

  it('shifts part2 domains by junction position', () => {
    const fusedId = store.getState().fuseParts('a', 'b', 'F');
    const fused = store.getState().parts.find(p => p.id === fusedId);

    expect(fused.domains).toEqual([
      { name: 'DA', start: 0, end: 6 },
      { name: 'DB', start: 6, end: 12 },
    ]);
  });

  it('sets derivation with fusion type and junctionPosition', () => {
    const fusedId = store.getState().fuseParts('a', 'b', 'F');
    const fused = store.getState().parts.find(p => p.id === fusedId);

    expect(fused.derivation).toEqual({ type: 'fusion', junctionPosition: 6 });
  });

  it('returns null for missing part', () => {
    expect(store.getState().fuseParts('a', 'nope', 'F')).toBeNull();
    expect(store.getState().fuseParts('nope', 'b', 'F')).toBeNull();
  });
});
