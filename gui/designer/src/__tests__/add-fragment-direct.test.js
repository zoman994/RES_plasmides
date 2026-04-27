/**
 * Kfix-2 — addFragmentDirect bypasses the PlasmidUseWizard hijack.
 *
 * The legacy addFragment() routes circular plasmids with ≥2 regions into
 * PlasmidUseWizard (legitimate flow for palette-drag of full plasmids).
 * ImportStartScreen "На канвас" must add the part as a plain fragment
 * without spawning a wizard — Kfix-2 introduces addFragmentDirect for this.
 *
 * Regression: addFragment for the same plasmid still opens the wizard,
 * so PartBlock/PartsLibrary/context-menu entry points keep working.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';

const ANNOTATED_PLASMID = {
  id: 'pUC_test',
  name: 'pUC19',
  type: 'plasmid',
  topology: 'circular',
  sequence: 'ATGCATGCATGC',
  length: 12,
  annotations: [
    { id: 'r1', start: 0, end: 4, level: 'region', type: 'CDS', name: 'lacZα' },
    { id: 'r2', start: 5, end: 11, level: 'region', type: 'CDS', name: 'AmpR' },
  ],
};

beforeEach(() => {
  useStore.setState({
    parts: [],
    wizardPlasmid: null,
    assemblies: [
      { id: 'asm_test', name: 'Сборка 1', fragments: [], junctions: [], primers: [], calculated: false },
    ],
    activeId: 'asm_test',
  });
});

describe('addFragmentDirect — Kfix-2 bypass', () => {
  it('adds annotated circular plasmid directly as a fragment, no wizard', () => {
    const { addFragmentDirect } = useStore.getState();
    addFragmentDirect(ANNOTATED_PLASMID);
    const s = useStore.getState();
    const asm = s.assemblies.find(a => a.id === 'asm_test');
    expect(asm.fragments).toHaveLength(1);
    expect(asm.fragments[0].name).toBe('pUC19');
    expect(s.wizardPlasmid).toBeNull();
  });
});

describe('addFragment — regression: wizard hijack still active for circular ≥2 regions', () => {
  it('annotated circular plasmid still opens PlasmidUseWizard via addFragment', () => {
    const { addFragment } = useStore.getState();
    addFragment(ANNOTATED_PLASMID);
    const s = useStore.getState();
    const asm = s.assemblies.find(a => a.id === 'asm_test');
    expect(asm.fragments).toHaveLength(0); // hijack short-circuits before push
    expect(s.wizardPlasmid).toEqual(ANNOTATED_PLASMID);
  });

  it('linear part bypasses hijack via addFragment (no wizard)', () => {
    const linearPart = { ...ANNOTATED_PLASMID, topology: 'linear' };
    const { addFragment } = useStore.getState();
    addFragment(linearPart);
    const s = useStore.getState();
    const asm = s.assemblies.find(a => a.id === 'asm_test');
    expect(asm.fragments).toHaveLength(1);
    expect(s.wizardPlasmid).toBeNull();
  });
});
