/**
 * pieces-to-dag-preview — live derived source→reaction→fragment graph from pieces
 * (Игорь 22.06.2026 «живой вывод из кусков»).
 */
import { describe, it, expect } from 'vitest';
import { derivePiecesToGraph, opKindForMethod } from '../lib/pieces-to-dag-preview';

const SEQ = 'ATGCATGCATGCATGCATGC'; // 20 bp
const container = (id, name) => ({
  id, kind: 'molecule', name, sequence: SEQ, length: SEQ.length, topology: { circular: true }, annotations: [],
});
const zone = { id: 'z1', name: 'Assembly', topology: { circular: false } };

function stateWith(pieces) {
  return { containers: [container('c1', 'pUC'), container('c2', 'pGEX')], zones: [zone], pieces };
}

const sourcedPiece = (id, sourceId, method, params, createdAt) => ({
  id,
  zoneId: 'z1',
  kind: 'sourced',
  ranges: [{ sourceId, start: 0, end: 10, orientation: 'forward' }],
  acquisitionMethod: method,
  acquisitionParams: params || {},
  createdAt,
});

describe('opKindForMethod', () => {
  it('restriction → cut, everything else → pcr', () => {
    expect(opKindForMethod('restriction')).toBe('cut');
    expect(opKindForMethod('undefined')).toBe('pcr');
    expect(opKindForMethod('numeric')).toBe('pcr');
  });
});

describe('derivePiecesToGraph', () => {
  it('a restriction piece → source → Cut → fragment, wired', () => {
    const state = stateWith([
      sourcedPiece('p1', 'c1', 'restriction', { enzymes: ['EcoRI'], cutSites: [{ position: 5 }] }, 1),
    ]);
    const { containers, operations } = derivePiecesToGraph(state, zone);
    // one source + one fragment
    const src = containers.find((c) => c.id === 'dag-src-c1');
    const frag = containers.find((c) => c.id === 'dag-frag-p1');
    expect(src).toBeTruthy();
    expect(frag).toBeTruthy();
    expect(frag.sequence).toBe(SEQ.slice(0, 10));
    // one cut op wiring source → fragment
    expect(operations).toHaveLength(1);
    const op = operations[0];
    expect(op.kind).toBe('cut');
    expect(op.inputs).toEqual(['dag-src-c1']);
    expect(op.outputs).toEqual(['dag-frag-p1']);
    expect(op.params.enzymes).toEqual(['EcoRI']);
  });

  it('a non-restriction sourced piece → PCR op', () => {
    const state = stateWith([sourcedPiece('p1', 'c1', 'undefined', {}, 1)]);
    const { operations } = derivePiecesToGraph(state, zone);
    expect(operations[0].kind).toBe('pcr');
  });

  it('two pieces sharing one source → source node deduped (1 source, 2 ops, 2 fragments)', () => {
    const state = stateWith([
      sourcedPiece('p1', 'c1', 'restriction', {}, 1),
      sourcedPiece('p2', 'c1', 'restriction', {}, 2),
    ]);
    const { containers, operations } = derivePiecesToGraph(state, zone);
    expect(containers.filter((c) => c.id === 'dag-src-c1')).toHaveLength(1);
    expect(containers.filter((c) => c._role === 'fragment')).toHaveLength(2);
    expect(operations).toHaveLength(2);
    expect(operations.every((o) => o.inputs[0] === 'dag-src-c1')).toBe(true);
  });

  it('a manual/synthesis piece (no source) → standalone fragment, no op', () => {
    const state = stateWith([{
      id: 'pS', zoneId: 'z1', kind: 'synthesis', sequence: 'GGGGCCCC', name: 'synth', createdAt: 1,
    }]);
    const { containers, operations } = derivePiecesToGraph(state, zone);
    expect(operations).toHaveLength(0);
    const frag = containers.find((c) => c.id === 'dag-frag-pS');
    expect(frag).toBeTruthy();
    expect(frag.sequence).toBe('GGGGCCCC');
  });

  it('no zone / no state → empty graph', () => {
    expect(derivePiecesToGraph(null, zone)).toEqual({ containers: [], operations: [] });
    expect(derivePiecesToGraph(stateWith([]), null)).toEqual({ containers: [], operations: [] });
  });
});
