/**
 * sanger-actions.test.js — T10 K3 (§5.1).
 * SET_CLONE_SANGER_STATUS / SET_CLONE_NOTES / SET_CLONE_LABEL on
 * op.materializedClones.
 */
import { describe, it, expect } from 'vitest';
import { operationsReducer } from '../store/skeleton-state-operations';

function st() {
  return {
    containers: [{ id: 'prod', name: 'p' }],
    operations: [{
      id: 'op1',
      kind: 'gibson',
      status: 'executed',
      outputs: ['prod'],
      materializedClones: [
        { cloneId: 'prod', label: 'clone 1', sangerVerified: 'pending', notes: null },
        { cloneId: 'cnt-2', label: 'clone 2', sangerVerified: 'pending', notes: null },
      ],
    }],
    pieces: [],
  };
}
const op = (s) => s.operations.find((o) => o.id === 'op1');
const clone = (s, id) => op(s).materializedClones.find((c) => c.cloneId === id);

describe('T10 K3 — SET_CLONE_SANGER_STATUS', () => {
  it('updates the targeted clone status + info toast', () => {
    const n = operationsReducer(st(), {
      type: 'SET_CLONE_SANGER_STATUS', operationId: 'op1', cloneId: 'cnt-2', status: 'verified',
    });
    expect(clone(n, 'cnt-2').sangerVerified).toBe('verified');
    expect(clone(n, 'prod').sangerVerified).toBe('pending'); // untouched
    expect(n.toast).toBeTruthy();
  });

  it('null is a valid status (Sanger not planned)', () => {
    const n = operationsReducer(st(), {
      type: 'SET_CLONE_SANGER_STATUS', operationId: 'op1', cloneId: 'prod', status: null,
    });
    expect(clone(n, 'prod').sangerVerified).toBeNull();
  });

  it('unknown op or clone → state unchanged', () => {
    const s = st();
    expect(operationsReducer(s, {
      type: 'SET_CLONE_SANGER_STATUS', operationId: 'gone', cloneId: 'prod', status: 'verified',
    })).toBe(s);
    expect(operationsReducer(s, {
      type: 'SET_CLONE_SANGER_STATUS', operationId: 'op1', cloneId: 'gone', status: 'verified',
    })).toBe(s);
  });
});

describe('T10 K3 — SET_CLONE_NOTES', () => {
  it('updates notes', () => {
    const n = operationsReducer(st(), {
      type: 'SET_CLONE_NOTES', operationId: 'op1', cloneId: 'prod', notes: 'mutation at 234',
    });
    expect(clone(n, 'prod').notes).toBe('mutation at 234');
  });

  it('truncates notes longer than 500 chars', () => {
    const long = 'x'.repeat(600);
    const n = operationsReducer(st(), {
      type: 'SET_CLONE_NOTES', operationId: 'op1', cloneId: 'prod', notes: long,
    });
    expect(clone(n, 'prod').notes).toHaveLength(500);
  });
});

describe('T10 K3 — SET_CLONE_LABEL', () => {
  it('renames the clone; blank label ignored', () => {
    let n = operationsReducer(st(), {
      type: 'SET_CLONE_LABEL', operationId: 'op1', cloneId: 'cnt-2', label: 'best colony',
    });
    expect(clone(n, 'cnt-2').label).toBe('best colony');
    const s2 = n;
    n = operationsReducer(n, {
      type: 'SET_CLONE_LABEL', operationId: 'op1', cloneId: 'cnt-2', label: '   ',
    });
    expect(n).toBe(s2); // blank → no-op
  });
});
