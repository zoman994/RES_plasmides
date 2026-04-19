import { describe, it, expect } from 'vitest';
import { buildMutagenesisPayload } from '../lib/mutagenesis-payload';

// ── KLD fixtures ─────────────────────────────────────────────────

const kldResult = {
  strategy: 'kld',
  fragments: [{ name: 'template', sequence: 'ATG'.repeat(1000), length: 3000 }],
  junctions: [{ type: 'phosphorylated' }],
  primers: [
    { name: 'KLD_fwd_E245A', sequence: 'GCGAAACGT', direction: 'forward', length: 9, tmBinding: 55 },
    { name: 'KLD_rev_E245A', sequence: 'ATGCGT', direction: 'reverse', length: 6, tmBinding: 54 },
  ],
  mutations: [{ label: 'E245A' }],
  mutantSequence: 'ATG'.repeat(1000),
};

// ── two_fragment fixtures ────────────────────────────────────────

const twoFragResult = {
  strategy: 'two_fragment',
  fragments: [
    { name: 'frag_1', length: 1500 },
    { name: 'frag_2', length: 1500 },
  ],
  junctions: [{ type: 'overlap', overlapSequence: 'ACGTACGTACGT', containsMutation: true }],
  primers: [],
  mutations: [{ label: 'E100A' }, { label: 'R400K' }],
};

// ── Group A: KLD ─────────────────────────────────────────────────

describe('buildMutagenesisPayload — KLD', () => {
  it('names primers with project prefix', () => {
    const { primers } = buildMutagenesisPayload(kldResult, {
      primerPrefix: 'IS', polymerase: 'phusion', existingPrimers: [], templateName: 'AmpR',
    });
    expect(primers).toHaveLength(2);
    expect(primers[0].name).toBe('IS001_mut_fwd_AmpR');
    expect(primers[1].name).toBe('IS002_mut_rev_AmpR');
    expect(primers[0].isMutagenesis).toBe(true);
    expect(primers[0].mutation).toBe('E245A');
  });

  it('preserves non-mutagenesis primers from existing, drops stale mutagenesis ones', () => {
    const existing = [
      { name: 'IS000_fwd_insert', isMutagenesis: false },
      { name: 'old_mut_fwd', isMutagenesis: true },
    ];
    const { primers } = buildMutagenesisPayload(kldResult, {
      primerPrefix: 'IS', polymerase: 'phusion', existingPrimers: existing, templateName: 'AmpR',
    });
    expect(primers.some(p => p.name === 'IS000_fwd_insert')).toBe(true);
    expect(primers.some(p => p.name === 'old_mut_fwd')).toBe(false);
    expect(primers.filter(p => p.isMutagenesis)).toHaveLength(2);
  });

  it('builds KLD protocol with pcr + dpni + kld_asm + transform + screening + sequencing', () => {
    const { protocolSteps } = buildMutagenesisPayload(kldResult, {
      primerPrefix: 'IS', polymerase: 'phusion', existingPrimers: [], templateName: 'AmpR',
    });
    expect(protocolSteps).toHaveLength(6);
    expect(protocolSteps.find(s => s.id === 'kld_pcr')).toBeDefined();
    expect(protocolSteps.find(s => s.id === 'dpni')).toBeDefined();
    expect(protocolSteps.find(s => s.id === 'kld_asm')).toBeDefined();
    expect(protocolSteps.find(s => s.id === 'transform')).toBeDefined();
    expect(protocolSteps.find(s => s.id === 'screening')).toBeDefined();
    expect(protocolSteps.find(s => s.id === 'sequencing')).toBeDefined();
  });
});

// ── Group B: two_fragment / multi_fragment ───────────────────────

describe('buildMutagenesisPayload — two_fragment / multi_fragment', () => {
  it('returns empty mutagenesis primers (auto-design will fill)', () => {
    const { primers } = buildMutagenesisPayload(twoFragResult, {
      primerPrefix: 'IS', polymerase: 'phusion', existingPrimers: [], templateName: 'AmpR',
    });
    expect(primers.filter(p => p.isMutagenesis)).toHaveLength(0);
  });

  it('preserves non-mutagenesis primers even when strategy has empty primers', () => {
    const existing = [{ name: 'IS000_fwd_other', isMutagenesis: false }];
    const { primers } = buildMutagenesisPayload(twoFragResult, {
      primerPrefix: 'IS', polymerase: 'phusion', existingPrimers: existing, templateName: 'AmpR',
    });
    expect(primers).toHaveLength(1);
    expect(primers[0].name).toBe('IS000_fwd_other');
  });

  it('builds overlap PCR protocol (no DpnI, no kld_asm)', () => {
    const { protocolSteps } = buildMutagenesisPayload(twoFragResult, {
      primerPrefix: 'IS', polymerase: 'phusion', existingPrimers: [], templateName: 'AmpR',
    });
    expect(protocolSteps.some(s => s.id === 'pcr_parts')).toBe(true);
    expect(protocolSteps.some(s => s.id === 'overlap_pcr')).toBe(true);
    expect(protocolSteps.some(s => s.id === 'dpni')).toBe(false);
    expect(protocolSteps.some(s => s.id === 'kld_asm')).toBe(false);
  });
});
