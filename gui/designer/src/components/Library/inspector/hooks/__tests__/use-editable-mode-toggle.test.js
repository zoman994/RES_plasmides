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
});
