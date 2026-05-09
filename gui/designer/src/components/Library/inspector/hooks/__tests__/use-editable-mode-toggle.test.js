/**
 * use-editable-mode-toggle.test.js — M-X.6 K0 unit coverage for the
 * editable pill state hook (DEC-MX6-01).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useEditableModeToggle } from '../useEditableModeToggle';

afterEach(cleanup);

describe('useEditableModeToggle', () => {
  it('starts read-only by default', () => {
    const { result } = renderHook(() => useEditableModeToggle({ id: 'x' }));
    expect(result.current.editable).toBe(false);
  });

  it('toggle flips state', () => {
    const { result } = renderHook(() => useEditableModeToggle({ id: 'x' }));
    act(() => result.current.toggle());
    expect(result.current.editable).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.editable).toBe(false);
  });

  it('disable forces read-only', () => {
    const { result } = renderHook(() => useEditableModeToggle({ id: 'x' }));
    act(() => result.current.toggle());
    expect(result.current.editable).toBe(true);
    act(() => result.current.disable());
    expect(result.current.editable).toBe(false);
  });

  it('resets to read-only when item.id changes (plasmid switch)', () => {
    let item = { id: 'a' };
    const { result, rerender } = renderHook(({ it }) => useEditableModeToggle(it), {
      initialProps: { it: item },
    });
    act(() => result.current.toggle());
    expect(result.current.editable).toBe(true);
    item = { id: 'b' };
    rerender({ it: item });
    expect(result.current.editable).toBe(false);
  });

  // M-X.7a v2 K3 R1: zone-aware initial state + toggle guard.
  it('exposes isReadOnlyZone derived from item.zone', () => {
    const { result } = renderHook(() => useEditableModeToggle({ id: 'x', zone: 'readonly_bodge' }));
    expect(result.current.isReadOnlyZone).toBe(true);
    expect(result.current.editable).toBe(false);
  });

  it('isReadOnlyZone is false for loose / active_bodge / lab_pool / undefined zones', () => {
    for (const zone of ['loose', 'active_bodge', 'lab_pool', undefined]) {
      const { result } = renderHook(() => useEditableModeToggle({ id: 'x', zone }));
      expect(result.current.isReadOnlyZone).toBe(false);
    }
  });

  it('toggle is a no-op for readonly_bodge (manual-edit branch path required)', () => {
    const { result } = renderHook(() => useEditableModeToggle({ id: 'x', zone: 'readonly_bodge' }));
    act(() => result.current.toggle());
    expect(result.current.editable).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.editable).toBe(false);
  });
});
