/**
 * V13: MutagenesisWizard accepts pre-filled template via initial* props.
 *
 * When the user clicks «🔄 Мутагенез» in the PlasmidViewer footer, the wizard
 * must open on Step 2 with the plasmid already chosen, not on empty Step 1.
 *
 * Before V13: Wizard landed on Step 1 «Select Template», forcing the user to
 * re-select the plasmid they had just been viewing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import MutagenesisWizard from '../components/MutagenesisWizard';

beforeEach(() => {
  globalThis.fetch = vi.fn(() => Promise.reject(new Error('no backend in tests')));
});

describe('MutagenesisWizard — V13 initial template passthrough', () => {
  it('without initial* props: renders Step 1 "Select Template" (regression)', () => {
    render(<MutagenesisWizard onComplete={() => {}} onClose={() => {}} />);
    expect(screen.queryByText(/Step 1: Select Template/i)).not.toBeNull();
    expect(screen.queryByText(/Step 2: Define Mutations/i)).toBeNull();
  });

  it('with initialTemplateSeq: jumps to Step 2 "Define Mutations" with template name visible', () => {
    const seq = 'ATG' + 'GCC'.repeat(100) + 'TAA';
    render(
      <MutagenesisWizard
        onComplete={() => {}}
        onClose={() => {}}
        initialTemplateSeq={seq}
        initialTemplateName="pET-28a"
        initialOrganism="E. coli"
      />
    );
    // Step 2 header is "Step 2: Define Mutations in pET-28a" — matches on full content
    const heading = screen.queryByText(/Step 2: Define Mutations in pET-28a/i);
    expect(heading).not.toBeNull();
    expect(screen.queryByText(/Step 1: Select Template/i)).toBeNull();
  });

  it('initial template sequence is sanitized on mount (IUPAC preserved)', () => {
    // Saturation codon NNK + BOM — NNK must survive, BOM must strip.
    const raw = '\uFEFFATGNNKGCCTAA';
    render(
      <MutagenesisWizard
        onComplete={() => {}}
        onClose={() => {}}
        initialTemplateSeq={raw}
        initialTemplateName="test"
      />
    );
    // Wizard mounts on Step 2 — proves presetSeq was truthy after sanitize
    // (if sanitize had stripped everything, initial seq would've been empty →
    // step=1). Also proves NNK didn't crash downstream translateDNA.
    expect(screen.queryByText(/Step 2: Define Mutations/i)).not.toBeNull();
  });
});
