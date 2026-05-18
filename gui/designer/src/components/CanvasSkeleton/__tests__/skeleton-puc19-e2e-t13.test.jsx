/**
 * skeleton-puc19-e2e-t13.test.jsx — Realistic pUC19 e2e protocol через
 * полный action chain (S2 adapters + finalizers).
 *
 * T13 (14.05.2026 — TIER-T). Сценарий:
 *   1. Импорт pUC19 в canvas (ADD_CONTAINER_FROM_ENTRY).
 *   2. Cut с EcoRI → backbone fragment.
 *   3. PCR insert (auto-design).
 *   4. Gibson assembly backbone + insert.
 * Все шаги через skeletonReducer; финальный state имеет valid containers.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';

// pUC19 mini fragment — 200 bp с EcoRI/HindIII MCS.
const PUC19_MINI =
  'TCGCGCGTTTCGGTGATGACGGTGAAAACCTCTGACACATGCAGCTCCCGGAGACGGTCACAGCTTGTCT'
  + 'GTAAGCGGATGCCGGGAGCAGACAAGCCCGTCAGGGCGCGTCAGCGGGTGTTGGCGGGTGTCGGGGCTGG'
  + 'CTTAACTATGCGGCATCAGAGCAGATTGAATTCAGAAGCTTGCATGCCTGCAGGTCGACTCTAGAGGAT';

const INSERT = 'ATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCAT'; // 42 bp

describe('T13 — pUC19 e2e protocol', () => {
  it('full chain: import → cut → PCR amplicon → Gibson assembly', () => {
    let s = buildInitialState();

    // Step 1: import pUC19 into canvas.
    s = skeletonReducer(s, {
      type: 'ADD_CONTAINER_FROM_ENTRY',
      entry: {
        id: 'lib-puc19',
        name: 'pUC19',
        payload: {
          sequence: PUC19_MINI,
          topology: 'circular',
          length: PUC19_MINI.length,
        },
      },
      position: { x: 100, y: 100 },
    });
    const pucContainer = s.containers.find((c) => c.name === 'pUC19');
    expect(pucContainer).toBeTruthy();
    expect(pucContainer.sequence).toBe(PUC19_MINI);
    expect(pucContainer.topology.circular).toBe(true);

    // Step 2: import insert as second container.
    s = skeletonReducer(s, {
      type: 'ADD_CONTAINER_FROM_ENTRY',
      entry: {
        id: 'lib-insert',
        name: 'insert',
        payload: { sequence: INSERT, topology: 'linear', length: INSERT.length },
      },
      position: { x: 400, y: 100 },
    });
    const insertC = s.containers.find((c) => c.name === 'insert');
    expect(insertC).toBeTruthy();

    // Step 3: Cut pUC19 with EcoRI → linearized backbone.
    s = skeletonReducer(s, {
      type: 'OP_ADD',
      payload: { position: { x: 250, y: 250 }, inputs: [pucContainer.id] },
    });
    const cutOpId = s.operations[s.operations.length - 1].id;
    s = skeletonReducer(s, { type: 'OP_SET_KIND', operationId: cutOpId, kind: 'cut' });
    s = skeletonReducer(s, {
      type: 'OP_SET_PARAMS', operationId: cutOpId,
      params: { templateId: pucContainer.id, enzymes: ['EcoRI'] },
    });
    s = skeletonReducer(s, { type: 'OP_EXECUTE', operationId: cutOpId });
    const cutOp = s.operations.find((o) => o.id === cutOpId);
    expect(cutOp.status).toBe('executed');
    expect(cutOp.outputs.length).toBeGreaterThan(0);
    const backboneId = cutOp.outputs[0];
    const backbone = s.containers.find((c) => c.id === backboneId);
    expect(backbone).toBeTruthy();
    expect(backbone.topology.circular).toBe(false);
    expect(backbone.ends).toBeTruthy(); // EcoRI sticky ends.

    // Step 4: PCR insert (auto-design, no primers).
    s = skeletonReducer(s, {
      type: 'OP_ADD',
      payload: { position: { x: 400, y: 250 }, inputs: [insertC.id] },
    });
    const pcrOpId = s.operations[s.operations.length - 1].id;
    s = skeletonReducer(s, { type: 'OP_SET_KIND', operationId: pcrOpId, kind: 'pcr' });
    s = skeletonReducer(s, {
      type: 'OP_SET_PARAMS', operationId: pcrOpId,
      params: { templateId: insertC.id, autoDesign: true },
    });
    s = skeletonReducer(s, { type: 'OP_EXECUTE', operationId: pcrOpId });
    const pcrOp = s.operations.find((o) => o.id === pcrOpId);
    expect(pcrOp.status).toBe('executed');
    // R4-BIO-5: PCR auto-design emits amplicon + primers oligo (2 outputs).
    // Find the molecule output (amplicon), не oligonucleotide.
    const ampliconId = pcrOp.outputs.find((oid) => {
      const c = s.containers.find((x) => x.id === oid);
      return c && c.kind === 'molecule';
    });
    expect(ampliconId).toBeTruthy();
    const amplicon = s.containers.find((c) => c.id === ampliconId);
    expect(amplicon.sequence).toBe(INSERT);

    // Step 5: Gibson assembly backbone + amplicon.
    s = skeletonReducer(s, {
      type: 'OP_ADD',
      payload: { position: { x: 600, y: 250 }, inputs: [backboneId, ampliconId] },
    });
    const gibsonOpId = s.operations[s.operations.length - 1].id;
    s = skeletonReducer(s, { type: 'OP_SET_KIND', operationId: gibsonOpId, kind: 'gibson' });
    s = skeletonReducer(s, {
      type: 'OP_SET_PARAMS', operationId: gibsonOpId,
      params: { fragmentIds: [backboneId, ampliconId], circular: true },
    });
    s = skeletonReducer(s, { type: 'OP_EXECUTE', operationId: gibsonOpId });
    const gibsonOp = s.operations.find((o) => o.id === gibsonOpId);
    expect(gibsonOp.status).toBe('executed');
    const assemblyId = gibsonOp.outputs[0];
    const assembly = s.containers.find((c) => c.id === assemblyId);
    expect(assembly).toBeTruthy();
    expect(assembly.topology.circular).toBe(true);
    // Assembly = concat backbone + insert (минус overlap'ы, если есть).
    expect(assembly.sequence.length).toBeGreaterThanOrEqual(backbone.sequence.length);

    // Step 6 (verify): final canvas has expected containers + 3 ops.
    expect(s.operations.length).toBe(3);
    const allExecuted = s.operations.every((o) => o.status === 'executed');
    expect(allExecuted).toBe(true);
    // Inputs frozen.
    expect(s.containers.find((c) => c.id === pucContainer.id).frozen).toBe(true);
    expect(s.containers.find((c) => c.id === insertC.id).frozen).toBe(true);
    // backbone и amplicon — это input'ы Gibson op. Re-fetch из state.
    expect(s.containers.find((c) => c.id === backboneId).frozen).toBe(true);
    expect(s.containers.find((c) => c.id === ampliconId).frozen).toBe(true);
  });
});
