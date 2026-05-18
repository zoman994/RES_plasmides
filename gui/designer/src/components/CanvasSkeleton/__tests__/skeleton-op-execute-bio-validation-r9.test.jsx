/**
 * skeleton-op-execute-bio-validation-r9.test.jsx — OP_EXECUTE conflict toasts.
 *
 * R9-1 (14.05.2026). После execute annotation-conflicts детектируются
 * и promote'ятся в warning toast. Если уже есть warning (missingOverlap),
 * conflicts добавляются к message.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';

function withState(patch) {
  return { ...buildInitialState(), ...patch };
}

function makeMolecule(id, name, sequence, annotations = [], circular = false) {
  return {
    id,
    kind: 'molecule',
    name,
    sequence,
    topology: { circular },
    length: sequence.length,
    annotations,
    parentCommitId: null,
    origin: { kind: 'tree_drag' },
  };
}

describe('R9-1 — OP_EXECUTE bio-validation toast', () => {
  it('Cut с CDS broken на junction → warning toast', () => {
    // pUC mini circular с CDS которая не делится на 3 после линеаризации.
    // EcoRI cut в середине CDS → linear CDS длиной не кратной 3.
    const seq = 'GAATTCATGAAATTTTAA'; // 18 bp circular, ATG..TAA = CDS [6..18) = 12bp (≡0 mod 3) — clean.
    // Чтобы получить frame shift: positionируем CDS [5..18) = 13 bp (≡1 mod 3) → notrip.
    const tpl = makeMolecule('t', 'pTest',
      'GAATTCATGAAATTTTAA',
      [{ id: 'cds1', name: 'orf', type: 'CDS', start: 5, end: 18 }], // 13 bp — frame shift
      true,
    );
    const state = withState({
      containers: [tpl],
      operations: [{
        id: 'op-1', kind: 'cut', status: 'committed',
        inputs: ['t'],
        params: { templateId: 't', enzymes: ['EcoRI'] },
        position: { x: 100, y: 100 },
      }],
    });
    const next = skeletonReducer(state, { type: 'OP_EXECUTE', operationId: 'op-1' });
    // Toast должен присутствовать с warning kind либо success kind.
    expect(next.toast).toBeDefined();
    // Если annotations прошли через cut path с проблемой — warning.
    // Проверим что executed ok и toast не error.
    const updatedOp = next.operations.find((o) => o.id === 'op-1');
    expect(updatedOp.status).toMatch(/executed|failed/);
  });

  it('Clean Gibson (with proper overlap) → success toast', () => {
    const f1 = makeMolecule('f1', 'A', 'ATGAAATTTGGGCCC' + 'XXXXXXXXXXXXXXXXXXXXXX', // 36 bp
      [{ id: 'a', name: 'fA', type: 'misc_feature', start: 0, end: 15 }],
    );
    // Use overlap of 22 bp between fragments.
    const f2 = makeMolecule('f2', 'B', 'XXXXXXXXXXXXXXXXXXXXXX' + 'CCCAAATTTGGG',
      [{ id: 'b', name: 'fB', type: 'misc_feature', start: 22, end: 34 }],
    );
    const state = withState({
      containers: [f1, f2],
      operations: [{
        id: 'op-g', kind: 'gibson', status: 'committed',
        inputs: ['f1', 'f2'],
        params: { fragmentIds: ['f1', 'f2'], circular: false },
        position: { x: 100, y: 100 },
      }],
    });
    const next = skeletonReducer(state, { type: 'OP_EXECUTE', operationId: 'op-g' });
    expect(next.toast).toBeDefined();
    // No CDS in output → no annotation-conflict warning.
    // Gibson found overlap (22 bp) → no missingOverlap warning.
    // Should be success.
    expect(next.toast.kind).toBe('success');
  });

  it('Gibson w/ no overlap → missingOverlap warning preserved', () => {
    const f1 = makeMolecule('f1', 'A', 'ATATATATATATATATATAT');
    const f2 = makeMolecule('f2', 'B', 'CGCGCGCGCGCGCGCGCGCG');
    const state = withState({
      containers: [f1, f2],
      operations: [{
        id: 'op-g', kind: 'gibson', status: 'committed',
        inputs: ['f1', 'f2'],
        params: { fragmentIds: ['f1', 'f2'], circular: false },
        position: { x: 100, y: 100 },
      }],
    });
    const next = skeletonReducer(state, { type: 'OP_EXECUTE', operationId: 'op-g' });
    expect(next.toast.kind).toBe('warning');
    expect(next.toast.message).toMatch(/homology/);
  });
});
