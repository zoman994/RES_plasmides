/**
 * Integration tests for useFragmentHandlers.handleMutagenesis (Wizard-path).
 * Verifies V4-B + V4-C: strategy result → assembly state with correct primers,
 * protocolSteps, and preservation of non-mutagenesis primers.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStore } from '../store';
import { useFragmentHandlers } from '../hooks/useFragmentHandlers';

const ASM_ID = 'asm_mut_test';

function seedAssembly(existingPrimers = []) {
  useStore.setState({
    projectName: 'test',
    polymerase: 'phusion',
    primerPrefix: 'IS',
    parts: [],
    activeId: ASM_ID,
    assemblies: [{
      id: ASM_ID,
      name: 'mut-test',
      fragments: [],
      junctions: [],
      primers: existingPrimers,
      protocolSteps: [],
      apiWarnings: [],
      calculated: false,
    }],
  });
}

function getAsm() {
  return useStore.getState().assemblies.find(a => a.id === ASM_ID);
}

// ── Fixtures ────────────────────────────────────────────────────

const kldWizardResult = {
  strategy: 'kld',
  fragments: [{ name: 'template', sequence: 'ATG'.repeat(1000), length: 3000,
                needsAmplification: true, type: 'CDS', strand: 1 }],
  junctions: [{ type: 'phosphorylated', overlapLength: 0, containsMutation: true }],
  primers: [
    { name: 'KLD_fwd_E245A', sequence: 'GCGAAACGT', direction: 'forward', length: 9, tmBinding: 55 },
    { name: 'KLD_rev_E245A', sequence: 'ATGCGT', direction: 'reverse', length: 6, tmBinding: 54 },
  ],
  warnings: [],
  mutations: [{ label: 'E245A' }],
  mutantSequence: 'ATG'.repeat(1000),
  templateName: 'AmpR',
  isMutagenesis: true,
};

const twoFragWizardResult = {
  strategy: 'two_fragment',
  fragments: [
    { name: 'frag_1', sequence: 'ATG'.repeat(500), length: 1500, needsAmplification: true, strand: 1 },
    { name: 'frag_2', sequence: 'CCC'.repeat(500), length: 1500, needsAmplification: true, strand: 1 },
  ],
  junctions: [{ type: 'overlap', overlapSequence: 'ACGTACGTACGT', overlapLength: 12,
                containsMutation: true, mutation: { label: 'E100A' } }],
  primers: [],
  warnings: ['Две мутации далеко — two_fragment split'],
  mutations: [{ label: 'E100A' }, { label: 'R400K' }],
  mutantSequence: 'ATG'.repeat(1000),
  templateName: 'AmpR',
  isMutagenesis: true,
};

// ── Tests ───────────────────────────────────────────────────────

describe('handleMutagenesis — Wizard-path', () => {
  beforeEach(() => { seedAssembly(); });

  it('KLD result: writes mutagenesis primers, calculated=true, dpni step present', () => {
    const { result } = renderHook(() => useFragmentHandlers());
    act(() => { result.current.handleMutagenesis(kldWizardResult); });

    const asm = getAsm();
    expect(asm.fragments).toHaveLength(1);
    expect(asm.fragments[0].isMutagenesis).toBe(true);
    expect(asm.primers.filter(p => p.isMutagenesis)).toHaveLength(2);
    expect(asm.primers[0].name).toBe('IS001_mut_fwd_AmpR');
    expect(asm.primers[1].name).toBe('IS002_mut_rev_AmpR');
    expect(asm.calculated).toBe(true);
    expect(asm.protocolSteps.some(s => s.id === 'dpni')).toBe(true);
    expect(asm.protocolSteps.some(s => s.id === 'kld_asm')).toBe(true);
  });

  it('two_fragment result: no mutagenesis primers, calculated=false, overlap_pcr step present', () => {
    const { result } = renderHook(() => useFragmentHandlers());
    act(() => { result.current.handleMutagenesis(twoFragWizardResult); });

    const asm = getAsm();
    expect(asm.fragments).toHaveLength(2);
    expect(asm.junctions).toHaveLength(1);
    expect(asm.junctions[0].containsMutation).toBe(true);
    expect(asm.primers.filter(p => p.isMutagenesis)).toHaveLength(0);
    expect(asm.calculated).toBe(false);
    expect(asm.protocolSteps.some(s => s.id === 'overlap_pcr')).toBe(true);
    expect(asm.protocolSteps.some(s => s.id === 'dpni')).toBe(false);
    expect(asm.apiWarnings).toContain('Две мутации далеко — two_fragment split');
  });

  it('preserves non-mutagenesis primers already in the assembly', () => {
    seedAssembly([
      { name: 'IS000_fwd_other', sequence: 'ACGT', direction: 'forward', isMutagenesis: false },
      { name: 'stale_mut_fwd', sequence: 'TTT', direction: 'forward', isMutagenesis: true },
    ]);
    const { result } = renderHook(() => useFragmentHandlers());
    act(() => { result.current.handleMutagenesis(kldWizardResult); });

    const asm = getAsm();
    expect(asm.primers.some(p => p.name === 'IS000_fwd_other')).toBe(true);
    expect(asm.primers.some(p => p.name === 'stale_mut_fwd')).toBe(false);
    expect(asm.primers.filter(p => p.isMutagenesis)).toHaveLength(2);
  });
});
