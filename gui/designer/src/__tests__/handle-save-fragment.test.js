/**
 * Integration tests for mutagenesis workflow after Sprint X-fix.
 *
 * Sprint X-fix K1/K2/K4: mutations no longer route through handleSaveFragment —
 * they go through applyMutationGit (store reducer) + handleCreateMutagenesisAssembly
 * (explicit "Create assembly" step). The V4-D semantics (KLD / two_fragment /
 * multi_fragment / No-PCR guard / annotation splitting) are preserved, just
 * accessed via the new Git-routed API.
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStore } from '../store';
import { useFragmentHandlers } from '../hooks/useFragmentHandlers';

const ASM_ID = 'asm_save_test';

function seedSingleFragment({ seq = 'ATG'.repeat(1000), needsAmp = true, annotations = [], circular = true } = {}) {
  useStore.setState({
    projectName: 'test',
    polymerase: 'phusion',
    primerPrefix: 'IS',
    editTarget: 0,
    parts: [],
    activeId: ASM_ID,
    assemblies: [{
      id: ASM_ID,
      name: 'save-test',
      circular,
      fragments: [{
        id: 'f1',
        name: 'AmpR',
        sequence: seq,
        length: seq.length,
        needsAmplification: needsAmp,
        annotations,
        type: 'CDS',
        strand: 1,
        mutations: [],
      }],
      junctions: [],
      primers: [],
      protocolSteps: [],
      apiWarnings: [],
      calculated: false,
    }],
  });
}

function getAsm() {
  return useStore.getState().assemblies.find(a => a.id === ASM_ID);
}

describe('mutagenesis paths via Git (Sprint X-fix K1/K2)', () => {
  it('KLD path: single mutation keeps fragment as one, adds 2 mutagenesis primers', () => {
    seedSingleFragment();
    act(() => {
      useStore.getState().applyMutationGit(0, {
        type: 'substitution', dnaPosition: 732, newCodon: 'GCG', label: 'E245A',
      });
    });
    const { result } = renderHook(() => useFragmentHandlers());
    act(() => { result.current.handleCreateMutagenesisAssembly(0); });

    const asm = getAsm();
    expect(asm.fragments).toHaveLength(1);                          // NOT split
    expect(asm.primers.filter(p => p.isMutagenesis)).toHaveLength(2);
    expect(asm.calculated).toBe(true);
    expect(asm.protocolSteps.some(s => s.id === 'dpni')).toBe(true);
    expect(asm.protocolSteps.some(s => s.id === 'kld_asm')).toBe(true);
  });

  it('two_fragment path: two distant mutations split fragment and emit overlap junction', () => {
    seedSingleFragment({ seq: 'ATG' + 'CCC'.repeat(999) });
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
    expect(asm.fragments.length).toBeGreaterThanOrEqual(2);          // split happened
    expect(asm.junctions.length).toBeGreaterThanOrEqual(1);
    expect(asm.junctions[0].type).toBe('overlap');
    expect(asm.junctions[0].containsMutation).toBe(true);
    expect(typeof asm.junctions[0].overlapSequence).toBe('string');
    expect(asm.junctions[0].overlapSequence.length).toBeGreaterThan(0);
    expect(asm.protocolSteps.some(s => s.id === 'overlap_pcr')).toBe(true);
    expect(asm.protocolSteps.some(s => s.id === 'dpni')).toBe(false);
  });

  it('No-PCR guard: split aborted on needsAmplification=false, warning emitted', () => {
    seedSingleFragment({ seq: 'ATG' + 'CCC'.repeat(999), needsAmp: false });
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
    expect(asm.fragments).toHaveLength(1);                          // NOT split
    expect(asm.apiWarnings.some(w => w.includes('без ПЦР'))).toBe(true);
  });

  it('Simple edit (handleSaveFragment bookkeeping): seq updated, no primers added', () => {
    seedSingleFragment();
    const { result } = renderHook(() => useFragmentHandlers());

    const updated = {
      id: 'f1',
      name: 'AmpR',
      sequence: 'GCC'.repeat(1000),
      length: 3000,
      needsAmplification: true,
      strand: 1,
      type: 'CDS',
      annotations: [],
    };
    act(() => { result.current.handleSaveFragment(updated); });

    const asm = getAsm();
    expect(asm.fragments[0].sequence).toBe('GCC'.repeat(1000));
    expect(asm.primers).toHaveLength(0);
    expect(asm.calculated).toBe(false);
  });

  it('V14: linear single mutation → two_fragment split (not KLD)', () => {
    seedSingleFragment({ seq: 'ATG' + 'CCC'.repeat(999), circular: false });
    act(() => {
      useStore.getState().applyMutationGit(0, {
        type: 'substitution', dnaPosition: 102, newCodon: 'GCG', label: 'Q35A',
      });
    });
    const { result } = renderHook(() => useFragmentHandlers());
    act(() => { result.current.handleCreateMutagenesisAssembly(0); });

    const asm = getAsm();
    expect(asm.fragments.length).toBeGreaterThanOrEqual(2);   // split, NOT kld
    expect(asm.junctions.length).toBeGreaterThanOrEqual(1);
    expect(asm.junctions[0].type).toBe('overlap');
    expect(asm.junctions[0].containsMutation).toBe(true);
    expect(asm.protocolSteps.some(s => s.id === 'overlap_pcr')).toBe(true);
    expect(asm.protocolSteps.some(s => s.id === 'dpni')).toBe(false);
  });

  it('Annotations split correctly when fragment splits into 2', () => {
    seedSingleFragment({
      seq: 'ATG' + 'CCC'.repeat(999),
      annotations: [
        { id: 'r1', name: 'promoter', start: 0,    end: 200,  level: 'region', type: 'promoter' },
        { id: 'r2', name: 'terminator', start: 2500, end: 2800, level: 'region', type: 'terminator' },
        { id: 'r3', name: 'straddle', start: 1400, end: 1600, level: 'region', type: 'misc_feature' },
      ],
    });
    act(() => {
      useStore.getState().applyMutationGit(0, {
        type: 'substitution', dnaPosition: 300, newCodon: 'GCG', label: 'E100A',
      });
      useStore.getState().applyMutationGit(0, {
        type: 'substitution', dnaPosition: 2700, newCodon: 'AAA', label: 'R900K',
      });
    });
    const { result } = renderHook(() => useFragmentHandlers());
    act(() => { result.current.handleCreateMutagenesisAssembly(0); });

    const asm = getAsm();
    expect(asm.fragments.length).toBeGreaterThanOrEqual(2);

    const first = asm.fragments[0];
    const last = asm.fragments[asm.fragments.length - 1];
    expect((first.annotations || []).some(a => a.name === 'promoter')).toBe(true);
    expect((last.annotations || []).some(a => a.name === 'terminator')).toBe(true);

    // straddling region → copied into at least one fragment with trimmed flag.
    const straddleFound = asm.fragments.some(f =>
      (f.annotations || []).some(a => a.name === 'straddle' && a.trimmed === true)
    );
    expect(straddleFound).toBe(true);
  });
});
