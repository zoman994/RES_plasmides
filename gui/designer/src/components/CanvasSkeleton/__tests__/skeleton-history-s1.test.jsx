/**
 * skeleton-history-s1.test.jsx — Undo/Redo middleware tests.
 *
 * S1 (14.05.2026 — TIER-S). Coverage:
 *   1. UNDO откатывает state на shag назад.
 *   2. REDO возвращает state вперёд.
 *   3. Stack limit (50 actions max).
 *   4. SKIPPED actions (SET_VIEW etc.) не пишутся в history.
 *   5. State-change identity check — no-op action не пишется.
 *   6. Provider integration: actions.undo() / actions.redo() работают.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import {
  buildHistoryReducer,
  wrapInitialState,
  selectPresent,
  selectCanUndo,
  selectCanRedo,
} from '../store/skeleton-history';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';
import {
  SkeletonProvider,
  useSkeletonState,
  useSkeletonActions,
  useSkeletonHistory,
} from '../store/skeleton-context';

afterEach(cleanup);

describe('S1 — buildHistoryReducer', () => {
  const enhanced = buildHistoryReducer(skeletonReducer);

  it('initial wrapped state: present + empty past + empty future', () => {
    const s = wrapInitialState(buildInitialState());
    expect(s.past).toEqual([]);
    expect(s.future).toEqual([]);
    expect(selectCanUndo(s)).toBe(false);
    expect(selectCanRedo(s)).toBe(false);
  });

  it('UNDO откатывает state', () => {
    let h = wrapInitialState(buildInitialState());
    h = enhanced(h, { type: 'OP_ADD', payload: { position: { x: 0, y: 0 } } });
    expect(h.present.operations.length).toBe(1);
    expect(selectCanUndo(h)).toBe(true);
    h = enhanced(h, { type: 'UNDO' });
    expect(h.present.operations.length).toBe(0);
    expect(selectCanUndo(h)).toBe(false);
    expect(selectCanRedo(h)).toBe(true);
  });

  it('REDO применяет undone change', () => {
    let h = wrapInitialState(buildInitialState());
    h = enhanced(h, { type: 'OP_ADD', payload: { position: { x: 0, y: 0 } } });
    h = enhanced(h, { type: 'UNDO' });
    h = enhanced(h, { type: 'REDO' });
    expect(h.present.operations.length).toBe(1);
    expect(selectCanRedo(h)).toBe(false);
  });

  it('new mutating action очищает future', () => {
    let h = wrapInitialState(buildInitialState());
    h = enhanced(h, { type: 'OP_ADD', payload: { position: { x: 0, y: 0 } } });
    h = enhanced(h, { type: 'UNDO' });
    expect(h.future.length).toBe(1);
    h = enhanced(h, { type: 'OP_ADD', payload: { position: { x: 100, y: 100 } } });
    expect(h.future.length).toBe(0);
  });

  it('SET_VIEW не пишется в past (skip list)', () => {
    let h = wrapInitialState(buildInitialState());
    h = enhanced(h, { type: 'SET_VIEW', view: 'graph' });
    expect(h.past.length).toBe(0);
    expect(h.present.view).toBe('graph');
  });

  it('UNDO на empty past — no-op (same ref)', () => {
    const h = wrapInitialState(buildInitialState());
    const h2 = enhanced(h, { type: 'UNDO' });
    expect(h2).toBe(h);
  });

  it('REDO на empty future — no-op (same ref)', () => {
    const h = wrapInitialState(buildInitialState());
    const h2 = enhanced(h, { type: 'REDO' });
    expect(h2).toBe(h);
  });

  it('unchanged state (no-op action) не пишет в history', () => {
    let h = wrapInitialState(buildInitialState());
    // Unknown action → skeletonReducer returns same state.
    h = enhanced(h, { type: 'TOTALLY_UNKNOWN' });
    expect(h.past.length).toBe(0);
  });

  it('stack limit — past не превышает opts.limit', () => {
    const enhanced5 = buildHistoryReducer(skeletonReducer, { limit: 5 });
    let h = wrapInitialState(buildInitialState());
    for (let i = 0; i < 10; i += 1) {
      h = enhanced5(h, { type: 'OP_ADD', payload: { position: { x: i, y: 0 } } });
    }
    expect(h.past.length).toBe(5);
    expect(h.present.operations.length).toBe(10);
  });
});

describe('S1 — Provider integration', () => {
  function wrapper({ children }) {
    return <SkeletonProvider>{children}</SkeletonProvider>;
  }

  it('actions.undo / actions.redo через hook', () => {
    const { result } = renderHook(
      () => ({
        state: useSkeletonState(),
        actions: useSkeletonActions(),
        history: useSkeletonHistory(),
      }),
      { wrapper },
    );
    expect(result.current.history.canUndo).toBe(false);
    act(() => { result.current.actions.opAdd({ position: { x: 100, y: 100 } }); });
    expect(result.current.state.operations.length).toBe(1);
    expect(result.current.history.canUndo).toBe(true);
    act(() => { result.current.actions.undo(); });
    expect(result.current.state.operations.length).toBe(0);
    expect(result.current.history.canRedo).toBe(true);
    act(() => { result.current.actions.redo(); });
    expect(result.current.state.operations.length).toBe(1);
  });

  it('undo after multi-step sequence rewinds one step', () => {
    const { result } = renderHook(
      () => ({ state: useSkeletonState(), actions: useSkeletonActions() }),
      { wrapper },
    );
    act(() => { result.current.actions.opAdd({ position: { x: 0, y: 0 } }); });
    act(() => { result.current.actions.opAdd({ position: { x: 100, y: 0 } }); });
    expect(result.current.state.operations.length).toBe(2);
    act(() => { result.current.actions.undo(); });
    expect(result.current.state.operations.length).toBe(1);
    act(() => { result.current.actions.undo(); });
    expect(result.current.state.operations.length).toBe(0);
  });
});
