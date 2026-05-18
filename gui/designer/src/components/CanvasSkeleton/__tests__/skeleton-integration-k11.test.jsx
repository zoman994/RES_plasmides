/**
 * skeleton-integration-k11.test.jsx — end-to-end Operation chain + perf smoke.
 *
 * Sprint M-CANVAS-OPS K11 (12.05.2026). Coverage:
 *   1. E2E PCR amplicon creation on pUC19-like template.
 *   2. E2E Cut → N fragments + frozen template.
 *   3. E2E Gibson on 2 PCR products → circular assembly.
 *   4. Perf smoke: 50 containers + 20 operations не лагает.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import {
  buildInitialState,
  skeletonReducer,
} from '../store/skeleton-state';
import { useStore, bootstrapStore } from '../../../store';

afterEach(() => {
  cleanup();
  try { useStore.setState({ libraryEntries: {} }); } catch { /* */ }
});
beforeEach(() => {
  try { bootstrapStore(); } catch { /* */ }
});

// Realistic-ish pUC19 fragment (just first ~400 bp with EcoRI + HindIII sites).
const PUC19_LIKE =
  'TCGCGCGTTTCGGTGATGACGGTGAAAACCTCTGACACATGCAGCTCCCGGAGACGGTCACAGCTTGTCT'
  + 'GTAAGCGGATGCCGGGAGCAGACAAGCCCGTCAGGGCGCGTCAGCGGGTGTTGGCGGGTGTCGGGGCTGG'
  + 'CTTAACTATGCGGCATCAGAGCAGATTGTACTGAGAGTGCACCATATGCGGTGTGAAATACCGCACAGAT'
  + 'GCGTAAGGAGAAAATACCGCATCAGGCGCCATTCGCCATTCAGGCTGCGCAACTGTTGGGAAGGGCGATC'
  + 'GGTGCGGGCCTCTTCGCTATTACGCCAGCTGGCGAAAGGGGGATGTGCTGCAAGGCGATTAAGTTGGGTA'
  + 'ACGCCAGGGTTTTCCCAGTCACGACGTTGTAAAACGACGGCCAGTGAATTCGAGCTCGGTACCCGGGGAT';

function seedTemplate(state, c) {
  return {
    ...state,
    containers: [...state.containers, c],
    positions: { ...state.positions, [c.id]: { x: 80, y: 80 } },
  };
}

function commitOp(state, kind, params, inputs = []) {
  let next = skeletonReducer(state, { type: 'OP_ADD', payload: { position: { x: 220, y: 200 }, inputs } });
  const opId = next.operations[next.operations.length - 1].id;
  next = skeletonReducer(next, { type: 'OP_SET_KIND', operationId: opId, kind });
  next = skeletonReducer(next, { type: 'OP_SET_PARAMS', operationId: opId, params });
  return [next, opId];
}

describe('K11 — E2E single operations on pUC19', () => {
  it('PCR: amplicon created, template frozen, executed status', () => {
    const tpl = {
      id: 'puc-1', name: 'pUC19', kind: 'molecule',
      sequence: PUC19_LIKE,
      topology: { circular: true },
      annotations: [],
    };
    let state = seedTemplate(buildInitialState(), tpl);
    const [s1, opId] = commitOp(state, 'pcr', { templateId: 'puc-1' }, ['puc-1']);
    const s2 = skeletonReducer(s1, { type: 'OP_EXECUTE', operationId: opId });
    const op = s2.operations.find((o) => o.id === opId);
    expect(op.status).toBe('executed');
    // R4-BIO-5: auto-design PCR emits amplicon + primers oligo.
    expect(op.outputs.length).toBe(2);
    const amplicon = s2.containers.find(
      (c) => op.outputs.includes(c.id) && c.kind === 'molecule',
    );
    expect(amplicon).toBeTruthy();
    expect(amplicon.sequence).toBe(PUC19_LIKE);
    const frozenTpl = s2.containers.find((c) => c.id === 'puc-1');
    expect(frozenTpl.frozen).toBe(true);
  });

  it('Cut: circular pUC19-like with EcoRI → 1 fragment + GAATTC found', () => {
    const tpl = {
      id: 'puc-2', name: 'pUC19', kind: 'molecule',
      sequence: PUC19_LIKE,
      topology: { circular: true },
    };
    let state = seedTemplate(buildInitialState(), tpl);
    const [s1, opId] = commitOp(state, 'cut', { templateId: 'puc-2', enzymes: ['EcoRI'] }, ['puc-2']);
    const s2 = skeletonReducer(s1, { type: 'OP_EXECUTE', operationId: opId });
    const op = s2.operations.find((o) => o.id === opId);
    expect(op.status).toBe('executed');
    // EcoRI = GAATTC. PUC19_LIKE contains GAATTC once → 1 fragment on circular.
    expect(op.outputs.length).toBe(1);
  });

  it('Gibson chain: PCR + PCR → Gibson → circular assembly', () => {
    const tpl1 = { id: 'src-a', name: 'A', kind: 'molecule', sequence: 'AAAAAAAAAA' };
    const tpl2 = { id: 'src-b', name: 'B', kind: 'molecule', sequence: 'GGGGGGGGGG' };
    let state = seedTemplate(buildInitialState(), tpl1);
    state = seedTemplate(state, tpl2);
    // PCR A.
    let [s, opIdA] = commitOp(state, 'pcr', { templateId: 'src-a' }, ['src-a']);
    s = skeletonReducer(s, { type: 'OP_EXECUTE', operationId: opIdA });
    const ampA = s.operations.find((o) => o.id === opIdA).outputs[0];
    // PCR B.
    let opIdB;
    [s, opIdB] = commitOp(s, 'pcr', { templateId: 'src-b' }, ['src-b']);
    s = skeletonReducer(s, { type: 'OP_EXECUTE', operationId: opIdB });
    const ampB = s.operations.find((o) => o.id === opIdB).outputs[0];
    // Gibson on amplicons.
    let opIdG;
    [s, opIdG] = commitOp(s, 'gibson', { fragmentIds: [ampA, ampB], method: 'overlap', circular: true }, [ampA, ampB]);
    s = skeletonReducer(s, { type: 'OP_EXECUTE', operationId: opIdG });
    const opG = s.operations.find((o) => o.id === opIdG);
    expect(opG.status).toBe('executed');
    expect(opG.outputs.length).toBe(1);
    const assembly = s.containers.find((c) => c.id === opG.outputs[0]);
    expect(assembly.sequence).toBe('AAAAAAAAAAGGGGGGGGGG');
    expect(assembly.topology.circular).toBe(true);
  });

  it('REMOVE_CONTAINER on operation input — operation gets cleaned up', () => {
    const tpl = { id: 'doomed', kind: 'molecule', sequence: 'ATGC' };
    let state = seedTemplate(buildInitialState(), tpl);
    const [s1, opId] = commitOp(state, 'pcr', { templateId: 'doomed' }, ['doomed']);
    // Remove the template — operation should also disappear.
    const s2 = skeletonReducer(s1, { type: 'REMOVE_CONTAINER', containerId: 'doomed' });
    expect(s2.containers.find((c) => c.id === 'doomed')).toBeUndefined();
    expect(s2.operations.find((o) => o.id === opId)).toBeUndefined();
  });
});

describe('K11 — Perf smoke (50 containers + 20 ops)', () => {
  it('builds 50 containers + 20 operations in <500ms', () => {
    const t0 = performance.now();
    let state = buildInitialState();
    // Seed 50 containers.
    for (let i = 0; i < 50; i += 1) {
      const c = {
        id: `c-${i}`,
        name: `C${i}`,
        kind: 'molecule',
        sequence: 'ATGC'.repeat(50 + i),
        topology: { circular: i % 2 === 0 },
      };
      state = seedTemplate(state, c);
    }
    expect(state.containers.length).toBeGreaterThanOrEqual(50);
    // Seed 20 operations referencing first 20 containers.
    for (let i = 0; i < 20; i += 1) {
      state = skeletonReducer(state, {
        type: 'OP_ADD',
        payload: { position: { x: 100 + i * 20, y: 200 }, inputs: [`c-${i}`] },
      });
    }
    expect(state.operations.length).toBe(20);
    // Dispatch reposition on each container — typical drag flow.
    for (let i = 0; i < 50; i += 1) {
      state = skeletonReducer(state, {
        type: 'SET_POSITION',
        containerId: `c-${i}`,
        position: { x: i * 10, y: i * 10 },
      });
    }
    const t1 = performance.now();
    expect(t1 - t0).toBeLessThan(500);
  });

  it('OP_REMOVE on 20 operations completes <100ms', () => {
    let state = buildInitialState();
    const opIds = [];
    for (let i = 0; i < 20; i += 1) {
      const c = { id: `c-${i}`, kind: 'molecule', sequence: 'AAAA' };
      state = seedTemplate(state, c);
      state = skeletonReducer(state, { type: 'OP_ADD', payload: { position: { x: 0, y: 0 }, inputs: [`c-${i}`] } });
      opIds.push(state.operations[state.operations.length - 1].id);
    }
    const t0 = performance.now();
    for (const id of opIds) {
      state = skeletonReducer(state, { type: 'OP_REMOVE', operationId: id });
    }
    const t1 = performance.now();
    expect(state.operations.length).toBe(0);
    expect(t1 - t0).toBeLessThan(100);
  });
});
