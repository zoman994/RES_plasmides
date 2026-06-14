/**
 * cut-linear-ends-l11.test.js — audit L11. A LINEAR template digest fell through
 * to the legacy slice path, which produced fragments with NO ends — so a downstream
 * junction between two RE-cut fragments mis-classified as 'overlap' (Gibson) instead
 * of re_ligation. The cut adapter now records the enzyme end on each linear fragment.
 */
import { describe, it, expect } from 'vitest';
import { executeCut } from '../canvas/operations/adapters/cut';
import { detectJunctionKind } from '../canvas/junction-styles';

// One EcoRI site (GAATTC at index 4); cut [1,5] → cut position 5.
const SEQ = 'TTTTGAATTCAAAATTTTCCCCGGGG';

function runCut(circular) {
  const ctx = {
    containers: {
      t: {
        id: 't', name: 'tpl', kind: 'molecule', sequence: SEQ,
        topology: { circular }, annotations: [],
      },
    },
  };
  return executeCut({ id: 'op', params: { templateId: 't', enzymes: ['EcoRI'] } }, ctx);
}

describe('executeCut — linear fragments carry enzyme ends (L11)', () => {
  it('a linear EcoRI cut tags the fragment ends with the enzyme + overhang', () => {
    const res = runCut(false);
    expect(res.outputs.length).toBe(2);
    const cutEnd = res.outputs[0].ends && res.outputs[0].ends.threePrime;
    expect(cutEnd).toBeTruthy();
    expect(cutEnd.enzymeUsed).toBe('EcoRI');
    expect(cutEnd.overhang).toBe('AATT');
    expect(res.outputs[1].ends.fivePrime.enzymeUsed).toBe('EcoRI');
  });

  it('the junction between two EcoRI-cut linear fragments classifies as re_ligation, not overlap', () => {
    const res = runCut(false);
    expect(detectJunctionKind(res.outputs[0], res.outputs[1])).toBe('re_ligation');
  });
});
