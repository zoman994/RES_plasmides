/**
 * skeleton-operations-k4.test.jsx — K4 Operation data shape coverage.
 *
 * Sprint M-CANVAS-OPS K4 (12.05.2026 — DEC-OPS-03 / DEC-OPS-04).
 * Validates:
 *   1. OP_ADD creates a draft operation with full Operation shape.
 *   2. OP_REMOVE drops by id.
 *   3. OP_SET_POSITION applies + identity-preserves on no-op.
 *   4. OP_SET_KIND transitions draft → committed.
 *   5. OP_SET_PARAMS merges into params.
 *   6. OP_RESET transitions failed → committed (clears error).
 *   7. REMOVE_CONTAINER (cross-domain) drops ops referencing the id.
 *   8. useOperations / useOperationById hooks return the right shape.
 *   9. Lifecycle guards: OP_SET_KIND on non-draft is a no-op;
 *      OP_RESET on non-failed is a no-op.
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  buildInitialState,
  skeletonReducer,
} from '../store/skeleton-state';
import {
  buildInitialOperationsState,
  operationsReducer,
  createOperationDraft,
} from '../store/skeleton-state-operations';
import {
  SkeletonProvider,
  useOperations,
  useOperationById,
  useSkeletonActions,
} from '../store/skeleton-context';

// Helper — add op directly via reducer and return [state, opId].
function addOp(state, payload = { position: { x: 100, y: 100 } }) {
  const next = operationsReducer(state, { type: 'OP_ADD', payload });
  return [next, next.operations[next.operations.length - 1].id];
}

describe('K4 — createOperationDraft helper', () => {
  it('returns a draft operation with the full shape', () => {
    const op = createOperationDraft({ position: { x: 50, y: 60 } });
    expect(op.id).toBeTruthy();
    expect(op.kind).toBeNull();
    expect(op.status).toBe('draft');
    expect(op.position).toEqual({ x: 50, y: 60 });
    expect(op.inputs).toEqual([]);
    expect(op.outputs).toEqual([]);
    expect(op.params).toEqual({});
    expect(op.junctionRefs).toEqual([]);
    expect(typeof op.createdAt).toBe('string');
    expect(op.executedAt).toBeNull();
    expect(op.error).toBeNull();
  });

  it('inputs + junctionRef seed correctly from payload', () => {
    const op = createOperationDraft({
      position: { x: 0, y: 0 },
      inputs: ['c-1', 'c-2'],
      junctionRef: 'j-9',
    });
    expect(op.inputs).toEqual(['c-1', 'c-2']);
    expect(op.junctionRefs).toEqual(['j-9']);
  });

  it('pre-supplied kind stays in draft until OP_SET_KIND fires', () => {
    const op = createOperationDraft({ position: { x: 0, y: 0 }, kind: 'pcr' });
    expect(op.kind).toBe('pcr');
    expect(op.status).toBe('draft');
  });
});

describe('K4 — OP_ADD', () => {
  it('appends a draft op to state.operations', () => {
    const s0 = buildInitialState();
    expect(s0.operations).toEqual([]);
    const s1 = skeletonReducer(s0, {
      type: 'OP_ADD',
      payload: { position: { x: 200, y: 300 } },
    });
    expect(s1.operations.length).toBe(1);
    const op = s1.operations[0];
    expect(op.status).toBe('draft');
    expect(op.kind).toBeNull();
    expect(op.position).toEqual({ x: 200, y: 300 });
  });

  it('OP_ADD twice creates two distinct ops with unique ids', () => {
    let s = buildInitialOperationsState();
    s = operationsReducer(s, { type: 'OP_ADD', payload: { position: { x: 10, y: 10 } } });
    s = operationsReducer(s, { type: 'OP_ADD', payload: { position: { x: 20, y: 20 } } });
    expect(s.operations.length).toBe(2);
    expect(s.operations[0].id).not.toBe(s.operations[1].id);
  });
});

describe('K4 — OP_REMOVE', () => {
  it('drops the operation by id', () => {
    let s = buildInitialOperationsState();
    s = operationsReducer(s, { type: 'OP_ADD', payload: { position: { x: 0, y: 0 } } });
    const id = s.operations[0].id;
    expect(s.operations.length).toBe(1);
    s = operationsReducer(s, { type: 'OP_REMOVE', operationId: id });
    expect(s.operations.length).toBe(0);
  });

  it('unknown id → identity preserved', () => {
    const s0 = buildInitialOperationsState();
    const s1 = operationsReducer(s0, { type: 'OP_REMOVE', operationId: 'nope' });
    expect(s1).toBe(s0);
  });
});

describe('K4 — OP_SET_POSITION', () => {
  it('updates the operation position', () => {
    const [s0, id] = addOp(buildInitialOperationsState());
    const s1 = operationsReducer(s0, {
      type: 'OP_SET_POSITION',
      operationId: id,
      position: { x: 999, y: 888 },
    });
    expect(s1.operations[0].position).toEqual({ x: 999, y: 888 });
  });

  it('same position → identity preserved (memo-friendly)', () => {
    const [s0, id] = addOp(buildInitialOperationsState(), { position: { x: 5, y: 5 } });
    const s1 = operationsReducer(s0, {
      type: 'OP_SET_POSITION',
      operationId: id,
      position: { x: 5, y: 5 },
    });
    expect(s1).toBe(s0);
  });

  it('unknown id → identity preserved', () => {
    const [s0] = addOp(buildInitialOperationsState());
    const s1 = operationsReducer(s0, {
      type: 'OP_SET_POSITION',
      operationId: 'nope',
      position: { x: 1, y: 1 },
    });
    expect(s1).toBe(s0);
  });
});

describe('K4 — OP_SET_KIND lifecycle gate', () => {
  it('draft → committed when kind picked', () => {
    const [s0, id] = addOp(buildInitialOperationsState());
    expect(s0.operations[0].status).toBe('draft');
    const s1 = operationsReducer(s0, { type: 'OP_SET_KIND', operationId: id, kind: 'pcr' });
    expect(s1.operations[0].status).toBe('committed');
    expect(s1.operations[0].kind).toBe('pcr');
  });

  it('re-picking kind on committed op → identity preserved (guard)', () => {
    let s = buildInitialOperationsState();
    s = operationsReducer(s, { type: 'OP_ADD', payload: { position: { x: 0, y: 0 } } });
    const id = s.operations[0].id;
    s = operationsReducer(s, { type: 'OP_SET_KIND', operationId: id, kind: 'pcr' });
    expect(s.operations[0].status).toBe('committed');
    const s2 = operationsReducer(s, { type: 'OP_SET_KIND', operationId: id, kind: 'cut' });
    expect(s2).toBe(s);
  });

  it('missing kind → identity preserved (no half-transitions)', () => {
    const [s0, id] = addOp(buildInitialOperationsState());
    const s1 = operationsReducer(s0, { type: 'OP_SET_KIND', operationId: id, kind: null });
    expect(s1).toBe(s0);
  });
});

describe('K4 — OP_SET_PARAMS', () => {
  it('merges patch into op.params', () => {
    const [s0, id] = addOp(buildInitialOperationsState());
    const s1 = operationsReducer(s0, {
      type: 'OP_SET_PARAMS',
      operationId: id,
      params: { annealingC: 55 },
    });
    expect(s1.operations[0].params).toEqual({ annealingC: 55 });
    const s2 = operationsReducer(s1, {
      type: 'OP_SET_PARAMS',
      operationId: id,
      params: { extensionSec: 30 },
    });
    expect(s2.operations[0].params).toEqual({ annealingC: 55, extensionSec: 30 });
  });

  it('patch overwrites overlapping keys', () => {
    const [s0, id] = addOp(buildInitialOperationsState());
    let s = operationsReducer(s0, {
      type: 'OP_SET_PARAMS',
      operationId: id,
      params: { x: 1 },
    });
    s = operationsReducer(s, {
      type: 'OP_SET_PARAMS',
      operationId: id,
      params: { x: 2 },
    });
    expect(s.operations[0].params).toEqual({ x: 2 });
  });

  it('null patch → identity preserved', () => {
    const [s0, id] = addOp(buildInitialOperationsState());
    const s1 = operationsReducer(s0, { type: 'OP_SET_PARAMS', operationId: id, params: null });
    expect(s1).toBe(s0);
  });
});

describe('K4 — OP_RESET lifecycle gate', () => {
  it('failed → committed (clears error)', () => {
    const [s0, id] = addOp(buildInitialOperationsState());
    // Force op into failed state directly — K9 will introduce
    // OP_EXECUTE; for K4 we synthesize the state.
    const failed = {
      ...s0,
      operations: [{ ...s0.operations[0], status: 'failed', error: 'boom' }],
    };
    const s1 = operationsReducer(failed, { type: 'OP_RESET', operationId: id });
    expect(s1.operations[0].status).toBe('committed');
    expect(s1.operations[0].error).toBeNull();
  });

  it('committed (non-failed) → identity preserved', () => {
    const [s0, id] = addOp(buildInitialOperationsState());
    const sCommitted = operationsReducer(s0, { type: 'OP_SET_KIND', operationId: id, kind: 'pcr' });
    const s1 = operationsReducer(sCommitted, { type: 'OP_RESET', operationId: id });
    expect(s1).toBe(sCommitted);
  });
});

describe('K4 — REMOVE_CONTAINER cross-domain cleanup', () => {
  it('drops operations referencing the removed container as input', () => {
    const s0 = buildInitialState();
    const containerId = s0.containers[0].id;
    // Seed an op that references this container as input.
    const sWithOp = skeletonReducer(s0, {
      type: 'OP_ADD',
      payload: { position: { x: 0, y: 0 }, inputs: [containerId] },
    });
    expect(sWithOp.operations.length).toBe(1);
    // Remove the container — both canvas + operations must update.
    const sRemoved = skeletonReducer(sWithOp, { type: 'REMOVE_CONTAINER', containerId });
    expect(sRemoved.containers.find((c) => c.id === containerId)).toBeUndefined();
    expect(sRemoved.operations.length).toBe(0);
  });

  it('drops operations referencing the removed container as output', () => {
    const s0 = buildInitialOperationsState();
    // Inject an op whose outputs contain the container id.
    const op = createOperationDraft({ position: { x: 0, y: 0 } });
    op.outputs = ['c-out-1'];
    const s1 = { ...s0, operations: [op] };
    const s2 = operationsReducer(s1, { type: 'REMOVE_CONTAINER', containerId: 'c-out-1' });
    expect(s2.operations.length).toBe(0);
  });

  it('preserves operations that do not reference the removed container', () => {
    const s0 = buildInitialOperationsState();
    const op = createOperationDraft({ position: { x: 0, y: 0 }, inputs: ['c-other'] });
    const s1 = { ...s0, operations: [op] };
    const s2 = operationsReducer(s1, { type: 'REMOVE_CONTAINER', containerId: 'c-not-referenced' });
    expect(s2).toBe(s1);
    expect(s2.operations.length).toBe(1);
  });

  it('no ops referencing → identity preserved (router chain stays ===)', () => {
    const s0 = buildInitialState();
    const s1 = skeletonReducer(s0, { type: 'REMOVE_CONTAINER', containerId: 'nonexistent-id' });
    expect(s1).toBe(s0);
  });
});

describe('K4 — hooks (useOperations / useOperationById)', () => {
  function wrapper({ children }) {
    return <SkeletonProvider>{children}</SkeletonProvider>;
  }

  it('useOperations returns empty array at mount', () => {
    const { result } = renderHook(() => useOperations(), { wrapper });
    expect(result.current).toEqual([]);
  });

  it('useOperations + opAdd action: hook reflects new op', () => {
    const { result, rerender } = renderHook(
      () => ({ ops: useOperations(), actions: useSkeletonActions() }),
      { wrapper },
    );
    expect(result.current.ops).toEqual([]);
    result.current.actions.opAdd({ position: { x: 100, y: 200 } });
    rerender();
    expect(result.current.ops.length).toBe(1);
    expect(result.current.ops[0].position).toEqual({ x: 100, y: 200 });
    expect(result.current.ops[0].status).toBe('draft');
  });

  it('useOperationById returns the correct op + null for unknown id', () => {
    const { result, rerender } = renderHook(
      () => {
        const ops = useOperations();
        const actions = useSkeletonActions();
        const firstId = ops[0]?.id || null;
        const op = useOperationById(firstId);
        const missing = useOperationById('does-not-exist');
        return { ops, actions, op, missing };
      },
      { wrapper },
    );
    expect(result.current.op).toBeNull();
    expect(result.current.missing).toBeNull();
    result.current.actions.opAdd({ position: { x: 0, y: 0 } });
    rerender();
    expect(result.current.op).toBeTruthy();
    expect(result.current.op.id).toBe(result.current.ops[0].id);
    expect(result.current.missing).toBeNull();
  });

  it('opSetKind via actions transitions draft → committed', () => {
    const { result, rerender } = renderHook(
      () => ({ ops: useOperations(), actions: useSkeletonActions() }),
      { wrapper },
    );
    result.current.actions.opAdd({ position: { x: 0, y: 0 } });
    rerender();
    const id = result.current.ops[0].id;
    expect(result.current.ops[0].status).toBe('draft');
    result.current.actions.opSetKind(id, 'gibson');
    rerender();
    expect(result.current.ops[0].status).toBe('committed');
    expect(result.current.ops[0].kind).toBe('gibson');
  });
});
