/**
 * skeleton-op-execute-k9.test.jsx — OP_EXECUTE + frozen-on-use + Save As fork.
 *
 * Sprint M-CANVAS-OPS K9 (12.05.2026 — DEC-OPS-04/07/08/10).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act, renderHook } from '@testing-library/react';
import {
  buildInitialState,
  skeletonReducer,
} from '../store/skeleton-state';
import {
  executeCut,
  executePCR,
  executeGibson,
  executeGoldenGate,
  executeLigate,
  executeMutagenesis,
  executeOperation,
} from '../canvas/operations/lib-adapters';
import {
  SkeletonProvider,
  useSkeletonActions,
  useSkeletonState,
} from '../store/skeleton-context';
import { useStore, bootstrapStore } from '../../../store';

afterEach(() => {
  cleanup();
  try { useStore.setState({ libraryEntries: {} }); } catch { /* */ }
});
beforeEach(() => {
  try { bootstrapStore(); } catch { /* */ }
});

// Reducer-level helper to seed a fully-prepared operation in committed
// status (kind picked, params filled). Returns [state, opId].
function seedCommittedOp(state, kind, params, inputs = []) {
  let next = skeletonReducer(state, { type: 'OP_ADD', payload: { position: { x: 100, y: 100 }, inputs } });
  const opId = next.operations[next.operations.length - 1].id;
  next = skeletonReducer(next, { type: 'OP_SET_KIND', operationId: opId, kind });
  next = skeletonReducer(next, { type: 'OP_SET_PARAMS', operationId: opId, params });
  return [next, opId];
}

describe('K9 — lib-adapters pure functions', () => {
  it('executeCut on circular template at GAATTC → 1 fragment', () => {
    const tpl = {
      id: 'c-circ', name: 'pUC19', kind: 'molecule',
      sequence: 'ATGCGAATTCATGC', topology: { circular: true },
    };
    const op = { id: 'op-1', kind: 'cut', inputs: ['c-circ'], params: { templateId: 'c-circ', enzymes: ['EcoRI'] }, position: { x: 0, y: 0 } };
    const result = executeCut(op, { containers: { 'c-circ': tpl } });
    expect(result.error).toBeUndefined();
    expect(result.outputs.length).toBe(1); // circular → N=1 cut → 1 fragment
    expect(result.outputs[0].sequence.length).toBeGreaterThan(0);
  });

  it('executeCut on linear template → 2 fragments', () => {
    const tpl = {
      id: 'c-lin', name: 'frag', kind: 'molecule',
      sequence: 'ATGCGAATTCATGC', topology: { circular: false },
    };
    const op = { id: 'op-1', kind: 'cut', inputs: ['c-lin'], params: { templateId: 'c-lin', enzymes: ['EcoRI'] }, position: { x: 0, y: 0 } };
    const result = executeCut(op, { containers: { 'c-lin': tpl } });
    expect(result.outputs.length).toBe(2);
  });

  it('executeCut with no sites → error', () => {
    const tpl = { id: 'c', name: 'x', kind: 'molecule', sequence: 'TTTTTTTT', topology: { circular: true } };
    const op = { id: 'op-1', kind: 'cut', inputs: ['c'], params: { templateId: 'c', enzymes: ['EcoRI'] }, position: { x: 0, y: 0 } };
    expect(executeCut(op, { containers: { c: tpl } }).error).toMatch(/Нет сайтов/);
  });

  it('executePCR returns amplicon + auto-designed primers oligo (R4-BIO-5)', () => {
    const tpl = { id: 'c', name: 'template', kind: 'molecule', sequence: 'ATGCATGCATGCATGCATGCATGCATGCATGC' };
    const op = { id: 'op-1', kind: 'pcr', inputs: ['c'], params: { templateId: 'c' }, position: { x: 0, y: 0 } };
    const result = executePCR(op, { containers: { c: tpl } });
    // R4-BIO-5: auto-design PCR теперь emits amplicon + designed primers oligo.
    expect(result.outputs.length).toBe(2);
    const amplicon = result.outputs.find((o) => o.kind === 'molecule');
    expect(amplicon).toBeTruthy();
    expect(amplicon.sequence).toBe('ATGCATGCATGCATGCATGCATGCATGCATGC');
    expect(amplicon.name).toMatch(/amplicon/);
    const oligo = result.outputs.find((o) => o.kind === 'oligonucleotide');
    expect(oligo).toBeTruthy();
    expect(oligo.payload?.sequences?.length).toBe(2);
  });

  it('executeGibson concatenates fragments in order (V60: overlap-only)', () => {
    const f1 = { id: 'f1', kind: 'molecule', sequence: 'AAAA' };
    const f2 = { id: 'f2', kind: 'molecule', sequence: 'GGGG' };
    const op = { id: 'op-1', kind: 'gibson', inputs: [], params: { fragmentIds: ['f1', 'f2'], circular: true }, position: { x: 0, y: 0 } };
    const result = executeGibson(op, { containers: { f1, f2 } });
    expect(result.outputs.length).toBe(1);
    expect(result.outputs[0].sequence).toBe('AAAAGGGG');
    expect(result.outputs[0].topology.circular).toBe(true);
    expect(result.outputs[0].origin.method).toBe('overlap');
  });

  it('V60 — executeGoldenGate concatenates + tags enzyme', () => {
    const f1 = { id: 'f1', kind: 'molecule', sequence: 'ATCG' };
    const f2 = { id: 'f2', kind: 'molecule', sequence: 'GCAT' };
    const op = { id: 'op-gg', kind: 'golden_gate', inputs: [], params: { fragmentIds: ['f1', 'f2'], enzyme: 'BsaI', circular: true }, position: { x: 0, y: 0 } };
    const result = executeGoldenGate(op, { containers: { f1, f2 } });
    expect(result.outputs.length).toBe(1);
    expect(result.outputs[0].sequence).toBe('ATCGGCAT');
    expect(result.outputs[0].topology.circular).toBe(true);
    expect(result.outputs[0].origin.kind).toBe('op_golden_gate');
    expect(result.outputs[0].origin.enzyme).toBe('BsaI');
    expect(result.outputs[0].origin.method).toBe('goldengate');
  });

  it('executeLigate concatenates and respects circular flag', () => {
    const f1 = { id: 'f1', kind: 'molecule', sequence: 'AT' };
    const f2 = { id: 'f2', kind: 'molecule', sequence: 'GC' };
    const op = { id: 'op-1', kind: 'ligate', inputs: [], params: { fragmentIds: ['f1', 'f2'], ends: 'blunt', circular: false }, position: { x: 0, y: 0 } };
    const result = executeLigate(op, { containers: { f1, f2 } });
    expect(result.outputs[0].sequence).toBe('ATGC');
    expect(result.outputs[0].topology.circular).toBe(false);
  });

  it('executeMutagenesis applies point mutation', () => {
    const tpl = { id: 'c', kind: 'molecule', sequence: 'AAAA' };
    const op = { id: 'op-1', kind: 'mutagenesis', inputs: ['c'], params: { templateId: 'c', mutationType: 'point', mutations: [{ position: 1, from: 'A', to: 'G' }] }, position: { x: 0, y: 0 } };
    const result = executeMutagenesis(op, { containers: { c: tpl } });
    expect(result.outputs[0].sequence).toBe('AGAA');
  });

  it('executeOperation registry rejects unknown kind', () => {
    const op = { id: 'op-?', kind: 'something_weird' };
    expect(executeOperation(op, { containers: {} }).error).toMatch(/Не поддерживается/);
  });
});

describe('K9 — OP_EXECUTE atomic transition', () => {
  it('Cut on existing canvas container: status executed, outputs appended', () => {
    const s0 = buildInitialState();
    // Inject a real linear template with EcoRI site.
    const tpl = {
      id: 'c-test', name: 'test', kind: 'molecule',
      sequence: 'ATGCGAATTCATGCGAATTCAAA',
      topology: { circular: false },
      annotations: [],
    };
    const stateWithTpl = {
      ...s0,
      containers: [...s0.containers, tpl],
      positions: { ...s0.positions, 'c-test': { x: 50, y: 50 } },
    };
    const [s1, opId] = seedCommittedOp(stateWithTpl, 'cut', { templateId: 'c-test', enzymes: ['EcoRI'] }, ['c-test']);
    const s2 = skeletonReducer(s1, { type: 'OP_EXECUTE', operationId: opId });
    const op = s2.operations.find((o) => o.id === opId);
    expect(op.status).toBe('executed');
    expect(op.executedAt).toBeTruthy();
    expect(op.outputs.length).toBeGreaterThan(0);
    // Output containers exist on canvas.
    for (const outId of op.outputs) {
      expect(s2.containers.find((c) => c.id === outId)).toBeTruthy();
    }
  });

  it('frozen=true is set on input containers after execute', () => {
    const s0 = buildInitialState();
    const tpl = { id: 'c-test', name: 'X', kind: 'molecule', sequence: 'ATGCATGCATGCATGCAT' };
    const seeded = { ...s0, containers: [...s0.containers, tpl] };
    const [s1, opId] = seedCommittedOp(seeded, 'pcr', { templateId: 'c-test' }, ['c-test']);
    const sExec = skeletonReducer(s1, { type: 'OP_EXECUTE', operationId: opId });
    const inputContainer = sExec.containers.find((c) => c.id === 'c-test');
    expect(inputContainer.frozen).toBe(true);
  });

  it('OP_EXECUTE on adapter error → status=failed + error stored', () => {
    const s0 = buildInitialState();
    const tpl = { id: 'c-empty', kind: 'molecule', sequence: 'TTTTTTT', topology: { circular: true } };
    const seeded = { ...s0, containers: [...s0.containers, tpl] };
    const [s1, opId] = seedCommittedOp(seeded, 'cut', { templateId: 'c-empty', enzymes: ['EcoRI'] }, ['c-empty']);
    const sExec = skeletonReducer(s1, { type: 'OP_EXECUTE', operationId: opId });
    const op = sExec.operations.find((o) => o.id === opId);
    expect(op.status).toBe('failed');
    expect(op.error).toMatch(/Нет сайтов/);
  });

  it('OP_RESET transitions failed → committed; OP_EXECUTE может retry', () => {
    const s0 = buildInitialState();
    const tpl = { id: 'c', kind: 'molecule', sequence: 'TTTTTT', topology: { circular: true } };
    const seeded = { ...s0, containers: [...s0.containers, tpl] };
    const [s1, opId] = seedCommittedOp(seeded, 'cut', { templateId: 'c', enzymes: ['EcoRI'] }, ['c']);
    let sExec = skeletonReducer(s1, { type: 'OP_EXECUTE', operationId: opId });
    expect(sExec.operations.find((o) => o.id === opId).status).toBe('failed');
    // Reset.
    sExec = skeletonReducer(sExec, { type: 'OP_RESET', operationId: opId });
    expect(sExec.operations.find((o) => o.id === opId).status).toBe('committed');
    // Update params: switch to enzyme that will succeed.
    // Since pUC19-like seq has no GAATTC, replace template via OP_SET_PARAMS
    // pointing to a sequence with GAATTC.
    sExec = {
      ...sExec,
      containers: [
        ...sExec.containers.filter((c) => c.id !== 'c'),
        { id: 'c', kind: 'molecule', sequence: 'ATGGAATTCATG', topology: { circular: true } },
      ],
    };
    sExec = skeletonReducer(sExec, { type: 'OP_EXECUTE', operationId: opId });
    expect(sExec.operations.find((o) => o.id === opId).status).toBe('executed');
  });

  it('OP_EXECUTE on already-executed op → state unchanged (lifecycle guard)', () => {
    const s0 = buildInitialState();
    const tpl = { id: 'c', kind: 'molecule', sequence: 'ATGCATGCATGCATGCAT' };
    const seeded = { ...s0, containers: [...s0.containers, tpl] };
    const [s1, opId] = seedCommittedOp(seeded, 'pcr', { templateId: 'c' }, ['c']);
    const s2 = skeletonReducer(s1, { type: 'OP_EXECUTE', operationId: opId });
    expect(s2.operations.find((o) => o.id === opId).status).toBe('executed');
    // Repeat — guard blocks (returns same state).
    const s3 = skeletonReducer(s2, { type: 'OP_EXECUTE', operationId: opId });
    expect(s3).toBe(s2);
  });
});

describe('K9 — OP_REMOVE unfreeze', () => {
  it('OP_REMOVE unfreezes inputs if no other op references them', () => {
    const s0 = buildInitialState();
    const tpl = { id: 'c', kind: 'molecule', sequence: 'ATGCATGCATGCATGCAT' };
    const seeded = { ...s0, containers: [...s0.containers, tpl] };
    const [s1, opId] = seedCommittedOp(seeded, 'pcr', { templateId: 'c' }, ['c']);
    const sExec = skeletonReducer(s1, { type: 'OP_EXECUTE', operationId: opId });
    expect(sExec.containers.find((c) => c.id === 'c').frozen).toBe(true);
    const sRem = skeletonReducer(sExec, { type: 'OP_REMOVE', operationId: opId });
    expect(sRem.containers.find((c) => c.id === 'c').frozen).toBe(false);
    expect(sRem.operations.find((o) => o.id === opId)).toBeUndefined();
  });

  it('OP_REMOVE keeps frozen if another op references the same input', () => {
    const s0 = buildInitialState();
    const tpl = { id: 'c', kind: 'molecule', sequence: 'ATGCATGCATGCATGCAT' };
    const seeded = { ...s0, containers: [...s0.containers, tpl] };
    // Op A uses c.
    const [s1, opIdA] = seedCommittedOp(seeded, 'pcr', { templateId: 'c' }, ['c']);
    const sExecA = skeletonReducer(s1, { type: 'OP_EXECUTE', operationId: opIdA });
    // Op B also uses c (still committed, not yet executed — but inputs reference still counts).
    const [s2, opIdB] = seedCommittedOp(sExecA, 'pcr', { templateId: 'c' }, ['c']);
    expect(s2.containers.find((c) => c.id === 'c').frozen).toBe(true);
    // Remove op A.
    const sAfterRem = skeletonReducer(s2, { type: 'OP_REMOVE', operationId: opIdA });
    // c still frozen because op B inputs still reference it.
    expect(sAfterRem.containers.find((c) => c.id === 'c').frozen).toBe(true);
    // Now remove op B too → unfreeze.
    const sAfterRem2 = skeletonReducer(sAfterRem, { type: 'OP_REMOVE', operationId: opIdB });
    expect(sAfterRem2.containers.find((c) => c.id === 'c').frozen).toBe(false);
  });
});

describe('K9 — OP_FORK_CONTAINER', () => {
  it('creates new container with frozen=false and inherits pending edits', () => {
    const s0 = buildInitialState();
    const tpl = { id: 'c-frozen', kind: 'molecule', name: 'orig', sequence: 'ATGC', frozen: true };
    const seeded = { ...s0, containers: [...s0.containers, tpl] };
    const sPending = skeletonReducer(seeded, {
      type: 'SET_PENDING_EDITS',
      containerId: 'c-frozen',
      patch: { editedSequence: 'ATGCATGC', editedName: 'pending-name' },
    });
    const sFork = skeletonReducer(sPending, {
      type: 'OP_FORK_CONTAINER',
      containerId: 'c-frozen',
      newName: 'custom-fork',
      applyPendingEdits: true,
    });
    // Original still exists + still frozen.
    const orig = sFork.containers.find((c) => c.id === 'c-frozen');
    expect(orig.frozen).toBe(true);
    expect(orig.sequence).toBe('ATGC');
    // Fork has pending edits applied + frozen=false.
    const fork = sFork.containers.find((c) => c.name === 'custom-fork');
    expect(fork).toBeTruthy();
    expect(fork.frozen).toBe(false);
    expect(fork.sequence).toBe('ATGCATGC');
    expect(fork.id).not.toBe('c-frozen');
    expect(sFork.toast?.kind).toBe('success');
  });

  it('Save As fork without name uses default suffix', () => {
    const s0 = buildInitialState();
    const tpl = { id: 'c1', kind: 'molecule', name: 'A', sequence: 'GG', frozen: true };
    const seeded = { ...s0, containers: [...s0.containers, tpl] };
    const sFork = skeletonReducer(seeded, { type: 'OP_FORK_CONTAINER', containerId: 'c1' });
    const fork = sFork.containers.find((c) => c.id !== 'c1' && c.name.startsWith('A'));
    expect(fork).toBeTruthy();
    expect(fork.name).toMatch(/fork/);
  });
});

describe('K9 — Editor banner via hook', () => {
  function wrapper({ children }) { return <SkeletonProvider>{children}</SkeletonProvider>; }

  it('useSkeletonState.containers reflects frozen=true after OP_EXECUTE through actions', () => {
    const { result, rerender } = renderHook(
      () => ({ state: useSkeletonState(), actions: useSkeletonActions() }),
      { wrapper },
    );
    // Inject a template container into state by dispatching a fake
    // ADD via reducer-style — actions.addContainerFromEntry expects
    // a LibraryEntry. Easier: dispatch via state.operations + cross-domain
    // path uses an existing fixture container.
    const containerId = result.current.state.containers[0]?.id;
    if (!containerId) return; // fixture missing — skip
    // Fill the placeholder so it has sequence.
    act(() => {
      result.current.actions.fillPlaceholder(containerId, {
        id: 'lib-1',
        name: 'pUC-test',
        payload: {
          sequence: 'ATGCGAATTCATGC',
          topology: 'linear',
          annotations: [],
        },
      });
    });
    rerender();
    // Add + commit + execute a PCR on this filled container.
    act(() => { result.current.actions.opAdd({ position: { x: 0, y: 0 }, inputs: [containerId] }); });
    rerender();
    const opId = result.current.state.operations[0].id;
    act(() => { result.current.actions.opSetKind(opId, 'pcr'); });
    rerender();
    act(() => { result.current.actions.opSetParams(opId, { templateId: containerId }); });
    rerender();
    act(() => { result.current.actions.opExecute(opId); });
    rerender();
    const frozen = result.current.state.containers.find((c) => c.id === containerId);
    expect(frozen.frozen).toBe(true);
    // Outputs added. R4-BIO-5: PCR теперь emits amplicon + primers oligo (2 outputs).
    const op = result.current.state.operations.find((o) => o.id === opId);
    expect(op.status).toBe('executed');
    expect(op.outputs.length).toBe(2);
  });
});
