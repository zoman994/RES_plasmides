/**
 * K11 (Sprint 1.7) — split-group full-view data propagation.
 *
 * After a two_fragment / multi_fragment mutagenesis split, each sub-fragment
 * carries splitGroupFullSequence / splitGroupFullLength / splitGroupFullParentMutations
 * so FragmentEditor can render the virtual full-gene view. KLD — single fragment,
 * no group metadata.
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStore } from '../store';
import { useFragmentHandlers } from '../hooks/useFragmentHandlers';

const ASM_ID = 'asm_fullview_test';

function seedFragment({ seq, needsAmp = true, circular = true }) {
  useStore.setState({
    projectName: 'test', polymerase: 'phusion', primerPrefix: 'IS',
    editTarget: 0, parts: [],
    activeId: ASM_ID,
    assemblies: [{
      id: ASM_ID, name: 'fv-test', circular,
      fragments: [{
        id: 'f1', name: 'HygroR', sequence: seq, length: seq.length,
        needsAmplification: needsAmp, annotations: [],
        type: 'CDS', strand: 1, mutations: [],
      }],
      junctions: [], primers: [], protocolSteps: [], apiWarnings: [],
      calculated: false,
    }],
  });
}

function getAsm() { return useStore.getState().assemblies.find(a => a.id === ASM_ID); }

describe('K11 — split-group full view data propagation', () => {
  it('handleCreateMutagenesisAssembly split → each sub carries splitGroupFullSequence and full mutation list', () => {
    // Sprint X-fix K2 — split is driven by applied commits + explicit handler.
    seedFragment({ seq: 'ATG' + 'CCC'.repeat(999) });
    act(() => {
      useStore.getState().applyMutationGit(0, {
        type: 'substitution', dnaPosition: 300, newCodon: 'GCG', label: 'E100A',
      });
      useStore.getState().applyMutationGit(0, {
        type: 'substitution', dnaPosition: 1200, newCodon: 'AAA', label: 'R400K',
      });
    });
    const { result } = renderHook(() => useFragmentHandlers());
    act(() => { result.current.handleCreateMutagenesisAssembly(0); });

    const asm = getAsm();
    expect(asm.fragments.length).toBeGreaterThanOrEqual(2);
    for (const sub of asm.fragments) {
      expect(typeof sub.splitGroupFullSequence).toBe('string');
      expect(sub.splitGroupFullSequence.length).toBeGreaterThan(0);
      expect(sub.splitGroupFullLength).toBe(sub.splitGroupFullSequence.length);
      expect(Array.isArray(sub.splitGroupFullParentMutations)).toBe(true);
      expect(sub.splitGroupFullParentMutations.length).toBe(2);
    }
    expect(asm.fragments[0].splitGroupFullSequence).toBe(asm.fragments[1].splitGroupFullSequence);
  });

  it('handleMutagenesis (Wizard path) with split strategy → same propagation', () => {
    // Seed a single fragment; we wire handleMutagenesis directly with a crafted result.
    seedFragment({ seq: 'ATG' + 'CCC'.repeat(999) });
    const { result } = renderHook(() => useFragmentHandlers());

    const fakeResult = {
      strategy: 'two_fragment',
      fragments: [
        { id: 'a', name: 'HygroR_1', sequence: 'ATG' + 'CCC'.repeat(199), length: 600, type: 'CDS', strand: 1, needsAmplification: true, templateStart: 0, templateEnd: 600 },
        { id: 'b', name: 'HygroR_2', sequence: 'CCC'.repeat(800), length: 2400, type: 'CDS', strand: 1, needsAmplification: true, templateStart: 600, templateEnd: 3000 },
      ],
      junctions: [{ type: 'overlap', overlapMode: 'split', overlapLength: 30, containsMutation: true, overlapSequence: 'ACGT'.repeat(7) + 'AC' }],
      primers: [],
      mutations: [{ type: 'substitution', label: 'E100A', dnaPosition: 300, newCodon: 'GCG' }],
      mutantSequence: 'ATG' + 'CCC'.repeat(999),
      templateName: 'HygroR',
      warnings: [],
    };

    act(() => { result.current.handleMutagenesis(fakeResult); });

    const asm = getAsm();
    expect(asm.fragments).toHaveLength(2);
    for (const sub of asm.fragments) {
      expect(sub.splitGroupFullSequence).toBe(fakeResult.mutantSequence);
      expect(sub.splitGroupFullLength).toBe(fakeResult.mutantSequence.length);
      expect(sub.splitGroupFullParentMutations).toEqual(fakeResult.mutations);
    }
  });

  it('KLD path (single fragment via handleCreateMutagenesisAssembly) does NOT add splitGroupFullSequence', () => {
    seedFragment({ seq: 'ATG'.repeat(1000) });
    act(() => {
      useStore.getState().applyMutationGit(0, {
        type: 'substitution', dnaPosition: 732, newCodon: 'GCG', label: 'E245A',
      });
    });
    const { result } = renderHook(() => useFragmentHandlers());
    act(() => { result.current.handleCreateMutagenesisAssembly(0); });

    const asm = getAsm();
    expect(asm.fragments).toHaveLength(1); // KLD does not split
    expect(asm.fragments[0].splitGroupFullSequence).toBeUndefined();
    expect(asm.fragments[0].splitGroupFullLength).toBeUndefined();
  });
});
