/**
 * cut-linear-ends-l11.test.js — audit L11. A LINEAR template digest fell through
 * to the legacy slice path, which produced fragments with NO ends — so a downstream
 * junction between two RE-cut fragments mis-classified as 'overlap' (Gibson) instead
 * of re_ligation. The cut adapter now records the enzyme end on each linear fragment.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { executeCut } from '../canvas/operations/adapters/cut';
import { detectJunctionKind } from '../canvas/junction-styles';
import { setCustomEnzymeRegistry } from '../../../restriction-db';
import { makeLocation, normalizeLocation } from '../../../lib/annotation-location';

// One EcoRI site (GAATTC at index 4); cut [1,5] → cut position 5.
const SEQ = 'TTTTGAATTCAAAATTTTCCCCGGGG';

afterEach(() => setCustomEnzymeRegistry({}));

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

  it('uses the actual reverse-site cut and overhang for a custom enzyme', () => {
    setCustomEnzymeRegistry({
      RevI: { site: 'AACGTC', cut: [1, 3], end: '5prime', overhang: 'AC' },
    });
    const ctx = {
      containers: {
        t: {
          id: 't', name: 'reverse', kind: 'molecule', sequence: 'TTTTGACGTTTT',
          topology: { circular: false }, annotations: [],
        },
      },
    };

    const res = executeCut({
      id: 'op-reverse', params: { templateId: 't', enzymes: ['RevI'] },
    }, ctx);

    expect(res.outputs.map((output) => output.sequence.length)).toEqual([7, 5]);
    expect(res.outputs[0].ends.threePrime).toMatchObject({
      enzymeUsed: 'RevI', overhang: 'GT', type: '5overhang',
    });
    expect(res.outputs[1].ends.fivePrime).toMatchObject({
      enzymeUsed: 'RevI', overhang: 'GT', type: '5overhang',
    });
  });

  it('preserves a canonical 3-prime end in the linear adapter path', () => {
    const sequence = 'TTTTCTGCAGTTTT';
    const ctx = {
      containers: {
        t: {
          id: 't', name: 'pst', kind: 'molecule', sequence,
          topology: { circular: false }, annotations: [],
        },
      },
    };

    const res = executeCut({
      id: 'op-pst', params: { templateId: 't', enzymes: ['PstI'] },
    }, ctx);

    expect(res.outputs[0].ends.threePrime).toMatchObject({
      enzymeUsed: 'PstI', overhang: 'TGCA', type: '3overhang',
    });
    expect(res.outputs[1].ends.fivePrime).toMatchObject({
      enzymeUsed: 'PstI', overhang: 'TGCA', type: '3overhang',
    });
  });

  it('clips canonical location together with scalar coordinates on both linear products', () => {
    const annotation = {
      id: 'cross', level: 'region', strand: 1, start: 2, end: 9,
      location: makeLocation('single', [{ start: 2, end: 9 }]),
    };
    const ctx = {
      containers: {
        t: {
          id: 't', name: 'tpl', kind: 'molecule', sequence: SEQ,
          topology: { circular: false }, annotations: [annotation],
        },
      },
    };

    const res = executeCut({
      id: 'op-location', params: { templateId: 't', enzymes: ['EcoRI'] },
    }, ctx);

    expect(res.outputs[0].annotations[0]).toMatchObject({
      id: 'cross', start: 2, end: 5,
      location: { kind: 'single', segments: [{ start: 2, end: 5 }] },
    });
    expect(res.outputs[1].annotations[0]).toMatchObject({
      id: 'cross', start: 0, end: 4,
      location: { kind: 'single', segments: [{ start: 0, end: 4 }] },
    });
  });

  it('orders a cut-through origin compound in the circular multi-enzyme path', () => {
    setCustomEnzymeRegistry({
      WrapI: { site: 'AACGTC', cut: [1, 3], end: '5prime', overhang: 'AC' },
      AbsentI: { site: 'GGGGGG', cut: [3, 3], end: 'blunt', overhang: null },
      AbsentII: { site: 'CCCCCC', cut: [3, 3], end: 'blunt', overhang: null },
    });
    const sequence = 'CGTCTTTTAA';
    const originAnnotation = {
      id: 'origin', level: 'region', strand: 1, start: 8, end: 2,
      location: makeLocation('order', [
        { start: 8, end: 10 },
        { start: 0, end: 2 },
      ]),
    };
    const ctx = {
      containers: {
        t: {
          id: 't', name: 'wrap', kind: 'molecule', sequence,
          topology: { circular: true }, annotations: [originAnnotation],
        },
      },
    };

    const res = executeCut({
      id: 'op-wrap',
      params: { templateId: 't', enzymes: ['WrapI', 'AbsentI', 'AbsentII'] },
    }, ctx);

    expect(res.error).toBeUndefined();
    expect(res.outputs).toHaveLength(1);
    expect(res.outputs[0].sequence).toBe(sequence.slice(9) + sequence.slice(0, 9));
    expect(res.outputs[0].annotations).toEqual([
      expect.objectContaining({
        id: 'origin', start: 0, end: 10,
        location: {
          kind: 'order',
          segments: [
            { start: 0, end: 1 },
            { start: 1, end: 3 },
            { start: 9, end: 10 },
          ],
        },
      }),
    ]);
    expect(() => normalizeLocation(res.outputs[0].annotations[0], {
      length: sequence.length, topology: 'linear',
    })).not.toThrow();
    expect(res.outputs[0].ends.fivePrime).toMatchObject({ enzymeUsed: 'WrapI', overhang: 'AC' });
    expect(res.outputs[0].ends.threePrime).toMatchObject({ enzymeUsed: 'WrapI', overhang: 'AC' });
  });
});
