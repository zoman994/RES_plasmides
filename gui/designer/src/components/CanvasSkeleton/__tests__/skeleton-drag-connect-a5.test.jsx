/**
 * skeleton-drag-connect-a5.test.jsx — OP_ADD_INPUT / OP_REMOVE_INPUT.
 *
 * A5 (14.05.2026 — TIER-A). Reducer-level coverage. UI drag-to-connect
 * (Alt+pointer-down) проверяется в integration via fireEvent.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';

describe('A5 — OP_ADD_INPUT / OP_REMOVE_INPUT', () => {
  it('OP_ADD_INPUT добавляет containerId в op.inputs', () => {
    let s = buildInitialState();
    s = skeletonReducer(s, { type: 'OP_ADD', payload: { position: { x: 100, y: 100 } } });
    const opId = s.operations[0].id;
    s = skeletonReducer(s, { type: 'OP_ADD_INPUT', operationId: opId, containerId: 'c-placeholder-1' });
    expect(s.operations[0].inputs).toContain('c-placeholder-1');
  });

  it('OP_ADD_INPUT idempotent (повторный добавление не дублирует)', () => {
    let s = buildInitialState();
    s = skeletonReducer(s, { type: 'OP_ADD', payload: { position: { x: 0, y: 0 } } });
    const opId = s.operations[0].id;
    s = skeletonReducer(s, { type: 'OP_ADD_INPUT', operationId: opId, containerId: 'c1' });
    const s2 = skeletonReducer(s, { type: 'OP_ADD_INPUT', operationId: opId, containerId: 'c1' });
    expect(s2).toBe(s); // identity preserved
    expect(s.operations[0].inputs.filter((i) => i === 'c1').length).toBe(1);
  });

  it('OP_REMOVE_INPUT убирает', () => {
    let s = buildInitialState();
    s = skeletonReducer(s, { type: 'OP_ADD', payload: { position: { x: 0, y: 0 }, inputs: ['c1', 'c2'] } });
    const opId = s.operations[0].id;
    s = skeletonReducer(s, { type: 'OP_REMOVE_INPUT', operationId: opId, containerId: 'c1' });
    expect(s.operations[0].inputs).toEqual(['c2']);
  });

  it('OP_REMOVE_INPUT containerId не найден → identity', () => {
    let s = buildInitialState();
    s = skeletonReducer(s, { type: 'OP_ADD', payload: { position: { x: 0, y: 0 }, inputs: ['c1'] } });
    const opId = s.operations[0].id;
    const s2 = skeletonReducer(s, { type: 'OP_REMOVE_INPUT', operationId: opId, containerId: 'c-nope' });
    expect(s2).toBe(s);
  });

  it('OP_ADD_INPUT unknown op → identity', () => {
    const s = buildInitialState();
    const s2 = skeletonReducer(s, { type: 'OP_ADD_INPUT', operationId: 'op-nope', containerId: 'c1' });
    expect(s2).toBe(s);
  });
});
