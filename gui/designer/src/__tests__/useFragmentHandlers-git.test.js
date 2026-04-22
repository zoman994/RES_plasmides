/**
 * Sprint X K3 — handleSaveFragment bootstraps Plasmid-Git state on all
 * mutation-paths (KLD + split). Direct applyMutationGit on vanilla fragment
 * also verified end-to-end through the real store.
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStore } from '../store';
import { useFragmentHandlers } from '../hooks/useFragmentHandlers';

const ASM_ID = 'asm_git_test';

function seedSingleFragment({ seq = 'ATG'.repeat(1000), circular = true, needsAmp = true, annotations = [] } = {}) {
  useStore.setState({
    projectName: 'test', polymerase: 'phusion', primerPrefix: 'IS',
    editTarget: 0, parts: [], activeId: ASM_ID,
    assemblies: [{
      id: ASM_ID, name: 'git-test', circular,
      fragments: [{
        id: 'f1', name: 'AmpR', sequence: seq, length: seq.length,
        needsAmplification: needsAmp, annotations, type: 'CDS', strand: 1, mutations: [],
      }],
      junctions: [], primers: [], protocolSteps: [], apiWarnings: [], calculated: false,
    }],
  });
}

function getAsm() {
  return useStore.getState().assemblies.find(a => a.id === ASM_ID);
}

describe('Sprint X K3 — handleSaveFragment bootstraps Plasmid-Git', () => {
  it('KLD path: post-save fragment has baseSnapshot = mutant sequence, commits = []', () => {
    seedSingleFragment();
    const { result } = renderHook(() => useFragmentHandlers());

    const mutantSeq = 'ATG'.repeat(1000);
    const updated = {
      id: 'f1', name: 'AmpR(E245A)', sequence: mutantSeq, length: 3000,
      needsAmplification: true, annotations: [], strand: 1, type: 'CDS',
      mutations: [{ type: 'substitution', label: 'E245A', codonStart: 732, newCodon: 'GCG' }],
    };
    act(() => { result.current.handleSaveFragment(updated); });

    const asm = getAsm();
    expect(asm.fragments).toHaveLength(1);
    const f = asm.fragments[0];
    expect(f.baseSnapshot).toBeDefined();
    expect(f.baseSnapshot.sequence).toBe(mutantSeq);
    expect(f.commits).toEqual([]);
  });

  it('split path: each sub has baseSnapshot matching sf.sequence, commits = []', () => {
    seedSingleFragment({ seq: 'ATG' + 'CCC'.repeat(999) });
    const { result } = renderHook(() => useFragmentHandlers());

    const updated = {
      id: 'f1', name: 'AmpR(E100A,R400K)',
      sequence: 'ATG' + 'CCC'.repeat(999), length: 3000,
      needsAmplification: true, annotations: [], strand: 1, type: 'CDS',
      mutations: [
        { type: 'substitution', label: 'E100A', codonStart: 300, newCodon: 'GCG' },
        { type: 'substitution', label: 'R400K', codonStart: 1200, newCodon: 'AAA' },
      ],
    };
    act(() => { result.current.handleSaveFragment(updated); });

    const asm = getAsm();
    expect(asm.fragments.length).toBeGreaterThanOrEqual(2);
    for (const sub of asm.fragments) {
      expect(sub.baseSnapshot).toBeDefined();
      expect(sub.baseSnapshot.sequence).toBe(sub.sequence);
      expect(sub.commits).toEqual([]);
    }
  });

  it('direct applyMutationGit on vanilla fragment → bootstrap + 1 commit', () => {
    seedSingleFragment();
    act(() => { useStore.getState().applyMutationGit(0, {
      type: 'substitution', dnaPosition: 3, newCodon: 'GCA', label: 'M2A',
    }); });
    const f = getAsm().fragments[0];
    expect(f.baseSnapshot).toBeDefined();
    expect(f.commits).toHaveLength(1);
    expect(f.commits[0].applied).toBe(true);
    expect(f.sequence.slice(3, 6)).toBe('GCA');
  });

  it('two substitutions on same codon via applyMutationGit → auto-override (prior disabled)', () => {
    seedSingleFragment();
    act(() => {
      useStore.getState().applyMutationGit(0, {
        type: 'substitution', dnaPosition: 3, newCodon: 'GCA', label: 'M2A',
      });
      useStore.getState().applyMutationGit(0, {
        type: 'substitution', dnaPosition: 3, newCodon: 'GAA', label: 'M2E',
      });
    });
    const f = getAsm().fragments[0];
    expect(f.commits).toHaveLength(2);
    const applied = f.commits.filter(c => c.applied);
    expect(applied).toHaveLength(1);
    expect(applied[0].label).toBe('M2E');
    expect(f.sequence.slice(3, 6)).toBe('GAA');
  });
});
