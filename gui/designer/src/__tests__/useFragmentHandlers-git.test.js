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

describe('Sprint X K3 — direct applyMutationGit reducer', () => {
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

// ─── Sprint X-fix K4 — handleSaveFragment is bookkeeping-only ───
describe('Sprint X-fix K4 — handleSaveFragment ignores mutations', () => {
  it('mutation-path removed: updated.mutations is a silent no-op, no Part-child created', () => {
    seedSingleFragment();
    const { result } = renderHook(() => useFragmentHandlers());

    const asmBefore = getAsm();
    const partsBefore = useStore.getState().parts.length;

    // Simulate a caller still shipping mutations (the handler should just write-back).
    const edited = {
      ...asmBefore.fragments[0],
      sequence: asmBefore.fragments[0].sequence,
      mutations: [{ type: 'substitution', label: 'E245A', codonStart: 732, newCodon: 'GCG' }],
    };
    act(() => { result.current.handleSaveFragment(edited); });

    const asm = getAsm();
    // Still one fragment — no split, no Part-child.
    expect(asm.fragments).toHaveLength(1);
    expect(useStore.getState().parts.length).toBe(partsBefore);
    // baseSnapshot NOT auto-bootstrapped (that happens only through Git reducers).
    expect(asm.fragments[0].baseSnapshot).toBeUndefined();
  });
});

// ─── Sprint X-fix K2 — handleCreateMutagenesisAssembly ───
describe('Sprint X-fix K2 — handleCreateMutagenesisAssembly', () => {
  it('single applied substitution commit → KLD strategy, 2 primers, calculated=true', () => {
    seedSingleFragment({ seq: 'ATG'.repeat(1000), circular: true });
    // Create one commit via the Git reducer.
    act(() => {
      useStore.getState().applyMutationGit(0, {
        type: 'substitution', dnaPosition: 3, newCodon: 'GCA', label: 'M2A',
      });
    });

    const { result } = renderHook(() => useFragmentHandlers());
    act(() => { result.current.handleCreateMutagenesisAssembly(0); });

    const asm = getAsm();
    // KLD — fragment count unchanged, primers emitted, calculated flipped to true.
    expect(asm.fragments).toHaveLength(1);
    expect(asm.primers.length).toBeGreaterThan(0);
    expect(asm.calculated).toBe(true);
    // Post-KLD baseSnapshot carries the mutant sequence; commits reset.
    expect(asm.fragments[0].baseSnapshot.sequence).toBe(asm.fragments[0].sequence);
    expect(asm.fragments[0].commits).toEqual([]);
  });

  it('three applied commits spread far apart → split, each sub has baseSnapshot=sub.seq, commits=[]', () => {
    seedSingleFragment({ seq: 'ATG' + 'CCC'.repeat(999), circular: false });
    act(() => {
      useStore.getState().applyMutationGit(0, {
        type: 'substitution', dnaPosition: 300, newCodon: 'GCG', label: 'E100A',
      });
      useStore.getState().applyMutationGit(0, {
        type: 'substitution', dnaPosition: 1200, newCodon: 'AAA', label: 'R400K',
      });
      useStore.getState().applyMutationGit(0, {
        type: 'substitution', dnaPosition: 2400, newCodon: 'GAA', label: 'P800E',
      });
    });

    const { result } = renderHook(() => useFragmentHandlers());
    act(() => { result.current.handleCreateMutagenesisAssembly(0); });

    const asm = getAsm();
    expect(asm.fragments.length).toBeGreaterThanOrEqual(2);
    for (const sub of asm.fragments) {
      expect(sub.baseSnapshot).toBeDefined();
      expect(sub.baseSnapshot.sequence).toBe(sub.sequence);
      expect(sub.commits).toEqual([]);
      expect(sub.splitGroupId).toBeDefined();
    }
  });

  it('no applied commits → no-op (fragments unchanged)', () => {
    seedSingleFragment();
    const before = getAsm().fragments[0];
    const { result } = renderHook(() => useFragmentHandlers());
    act(() => { result.current.handleCreateMutagenesisAssembly(0); });
    const after = getAsm().fragments[0];
    expect(after).toBe(before);
  });
});
