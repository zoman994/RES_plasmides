/**
 * skeleton-toast-queue-r12.test.jsx — Toast queue (stacking).
 *
 * R12-2 (15.05.2026 — DEC-OPS-TOAST-QUEUE-01). До этого момента
 * `state.toast` был single slot: второй toast clobber'ил первый.
 * Теперь — queue в `state.toasts`, multiple ops эмитят, ToastBridge
 * flush'ает целиком.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';

describe('R12-2 — toast queue', () => {
  it('Initial state has empty toasts array', () => {
    const s = buildInitialState();
    expect(s.toasts).toEqual([]);
    expect(s.toast).toBeNull();
  });

  it('SHOW_TOAST appends to queue + stamps id/timestamp', () => {
    let s = buildInitialState();
    s = skeletonReducer(s, { type: 'SHOW_TOAST', toast: { kind: 'success', message: 'op done' } });
    expect(s.toast).toBeTruthy();
    expect(s.toast.id).toMatch(/^t-/);
    expect(s.toast.kind).toBe('success');
    expect(s.toasts).toHaveLength(1);
    expect(s.toasts[0].id).toBe(s.toast.id);
  });

  it('Multiple SHOW_TOAST accumulate в queue', () => {
    let s = buildInitialState();
    s = skeletonReducer(s, { type: 'SHOW_TOAST', toast: { kind: 'success', message: 'first' } });
    s = skeletonReducer(s, { type: 'SHOW_TOAST', toast: { kind: 'warning', message: 'second' } });
    s = skeletonReducer(s, { type: 'SHOW_TOAST', toast: { kind: 'info', message: 'third' } });
    expect(s.toasts).toHaveLength(3);
    expect(s.toasts.map((t) => t.message)).toEqual(['first', 'second', 'third']);
    // Latest toast == last in queue.
    expect(s.toast.message).toBe('third');
  });

  it('CLEAR_TOAST (no id) drains entire queue', () => {
    let s = buildInitialState();
    s = skeletonReducer(s, { type: 'SHOW_TOAST', toast: { kind: 'info', message: 'a' } });
    s = skeletonReducer(s, { type: 'SHOW_TOAST', toast: { kind: 'info', message: 'b' } });
    expect(s.toasts).toHaveLength(2);
    s = skeletonReducer(s, { type: 'CLEAR_TOAST' });
    expect(s.toasts).toEqual([]);
    expect(s.toast).toBeNull();
  });

  it('CLEAR_TOAST by id removes specific toast, restores latest', () => {
    let s = buildInitialState();
    s = skeletonReducer(s, { type: 'SHOW_TOAST', toast: { kind: 'info', message: 'first' } });
    const firstId = s.toast.id;
    s = skeletonReducer(s, { type: 'SHOW_TOAST', toast: { kind: 'info', message: 'second' } });
    const secondId = s.toast.id;
    expect(s.toasts).toHaveLength(2);
    // Remove the second; first should remain.
    s = skeletonReducer(s, { type: 'CLEAR_TOAST', toastId: secondId });
    expect(s.toasts).toHaveLength(1);
    expect(s.toast.message).toBe('first');
    // Now remove the first.
    s = skeletonReducer(s, { type: 'CLEAR_TOAST', toastId: firstId });
    expect(s.toasts).toEqual([]);
    expect(s.toast).toBeNull();
  });

  it('Invalid SHOW_TOAST (no message) does not push', () => {
    let s = buildInitialState();
    s = skeletonReducer(s, { type: 'SHOW_TOAST', toast: { kind: 'info' } });
    expect(s.toasts).toEqual([]);
    s = skeletonReducer(s, { type: 'SHOW_TOAST' });
    expect(s.toasts).toEqual([]);
  });

  it('OP_EXECUTE toast пушит на queue (not clobbering)', () => {
    let s = buildInitialState();
    // Push a UI-level toast first.
    s = skeletonReducer(s, { type: 'SHOW_TOAST', toast: { kind: 'info', message: 'user did something' } });
    expect(s.toasts).toHaveLength(1);
    // Now dispatch an OP_EXECUTE that fails (no matching op) — но просто
    // verify что queue не очищается недо-намеренно. Add a fake committed op.
    s = {
      ...s,
      containers: [
        { id: 't1', kind: 'molecule', name: 'tpl',
          sequence: 'AAATTTGGGCCC', topology: { circular: true }, annotations: [], length: 12,
          parentCommitId: null, origin: { kind: 'tree_drag' } },
      ],
      operations: [{
        id: 'op1', kind: 'cut', status: 'committed',
        inputs: ['t1'],
        params: { templateId: 't1', enzymes: ['EcoRI'] },
        position: { x: 0, y: 0 },
      }],
    };
    s = skeletonReducer(s, { type: 'OP_EXECUTE', operationId: 'op1' });
    // EcoRI not in sequence → adapter возвращает error → op status='failed'.
    // Toast добавлен от error → queue теперь имеет 2 elements.
    expect(s.toasts.length).toBeGreaterThanOrEqual(2);
    expect(s.toasts[0].message).toBe('user did something');
  });
});
