/**
 * Tests for createMutant store action.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { createFragmentSlice } from '../store/fragmentSlice';

/** Minimal store with only fragmentSlice for isolated testing. */
function createTestStore() {
  return create(immer((set, get) => ({
    ...createFragmentSlice(set, get),
    assemblies: [],
    activeId: null,
  })));
}

const PARENT_SEQ = 'ATGGATGAAGCGTAA'; // M D E A * (5 codons, 15bp)

function makeParent() {
  return {
    id: 'parent_1',
    name: 'AsCpf1',
    type: 'CDS',
    sequence: PARENT_SEQ,
    length: PARENT_SEQ.length,
    domains: [{ name: 'RuvC', start: 0, end: 9 }],
    annotations: [{ name: 'CDS', type: 'CDS', start: 0, end: 15 }],
  };
}

describe('createMutant', () => {
  let store;

  beforeEach(() => {
    store = createTestStore();
    // Seed parent part
    store.getState().addPart(makeParent());
  });

  it('creates mutant Part in the library', () => {
    const mutations = [
      { dnaPosition: 3, type: 'substitution', newCodon: 'GCG', label: 'D2A' },
    ];

    const mutantId = store.getState().createMutant('parent_1', mutations);
    const parts = store.getState().parts;

    expect(parts).toHaveLength(2);
    const mutant = parts.find(p => p.id === mutantId);
    expect(mutant).toBeDefined();
    expect(mutant.name).toBe('AsCpf1(D2A)');
    expect(mutant.source).toBe('mutation');
  });

  it('parentId points to original, original.children contains mutant id', () => {
    const mutations = [
      { dnaPosition: 3, type: 'substitution', newCodon: 'GCG', label: 'D2A' },
    ];

    const mutantId = store.getState().createMutant('parent_1', mutations);
    const parts = store.getState().parts;
    const parent = parts.find(p => p.id === 'parent_1');
    const mutant = parts.find(p => p.id === mutantId);

    expect(mutant.parentId).toBe('parent_1');
    expect(parent.children).toContain(mutantId);
  });

  it('original sequence is not changed', () => {
    const mutations = [
      { dnaPosition: 3, type: 'substitution', newCodon: 'GCG', label: 'D2A' },
    ];

    store.getState().createMutant('parent_1', mutations);
    const parent = store.getState().parts.find(p => p.id === 'parent_1');

    expect(parent.sequence).toBe(PARENT_SEQ);
  });

  it('applies substitution correctly', () => {
    // D at codon 1 (pos 3-5: GAT) → A (GCG)
    const mutations = [
      { dnaPosition: 3, type: 'substitution', newCodon: 'GCG', label: 'D2A' },
    ];

    const mutantId = store.getState().createMutant('parent_1', mutations);
    const mutant = store.getState().parts.find(p => p.id === mutantId);

    expect(mutant.sequence).toBe('ATGGCGGAAGCGTAA');
    expect(mutant.sequence).toHaveLength(PARENT_SEQ.length); // same length
  });

  it('generates name with multiple mutations', () => {
    const mutations = [
      { dnaPosition: 3, type: 'substitution', newCodon: 'GCG', label: 'D2A' },
      { dnaPosition: 9, type: 'substitution', newCodon: 'GCG', label: 'E4A' },
    ];

    const mutantId = store.getState().createMutant('parent_1', mutations);
    const mutant = store.getState().parts.find(p => p.id === mutantId);

    expect(mutant.name).toBe('AsCpf1(D2A,E4A)');
    expect(mutant.derivation).toEqual({
      type: 'mutation',
      mutations: expect.arrayContaining([
        expect.objectContaining({ label: 'D2A' }),
        expect.objectContaining({ label: 'E4A' }),
      ]),
    });
  });

  it('preserves annotations from parent (domains field removed)', () => {
    const mutations = [
      { dnaPosition: 3, type: 'substitution', newCodon: 'GCG', label: 'D2A' },
    ];

    const mutantId = store.getState().createMutant('parent_1', mutations);
    const mutant = store.getState().parts.find(p => p.id === mutantId);

    // domains field no longer exists — annotations carry all information
    expect(mutant.domains).toBeUndefined();
    // Mutant should have annotations (from autoAnnotate or inherited)
    expect(mutant.annotations).toBeDefined();
    expect(mutant.annotations.length).toBeGreaterThan(0);
  });

  it('returns null for missing parent', () => {
    const result = store.getState().createMutant('nonexistent', [
      { dnaPosition: 0, type: 'substitution', newCodon: 'GCG', label: 'X1A' },
    ]);
    expect(result).toBeNull();
  });

  it('returns null for empty mutations', () => {
    const result = store.getState().createMutant('parent_1', []);
    expect(result).toBeNull();
  });
});
