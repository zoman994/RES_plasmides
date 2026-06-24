import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { computeResizedSize, useResizableSplit } from '../useResizableSplit';

describe('computeResizedSize', () => {
  it('START pane grows when the pointer moves in the + direction', () => {
    expect(computeResizedSize({ startSize: 300, startCoord: 100, coord: 140, side: 'start' })).toBe(340);
    expect(computeResizedSize({ startSize: 300, startCoord: 100, coord: 70, side: 'start' })).toBe(270);
  });

  it('END pane grows when the pointer moves in the − direction', () => {
    expect(computeResizedSize({ startSize: 300, startCoord: 100, coord: 60, side: 'end' })).toBe(340);
    expect(computeResizedSize({ startSize: 300, startCoord: 100, coord: 130, side: 'end' })).toBe(270);
  });

  it('clamps to [min, max]', () => {
    expect(computeResizedSize({ startSize: 300, startCoord: 100, coord: 1000, side: 'start', max: 500 })).toBe(500);
    expect(computeResizedSize({ startSize: 300, startCoord: 100, coord: -1000, side: 'start', min: 200 })).toBe(200);
  });
});

describe('useResizableSplit', () => {
  beforeEach(() => { try { window.localStorage.clear(); } catch { /* noop */ } });

  it('starts at `initial` and exposes separator props', () => {
    const { result } = renderHook(() => useResizableSplit({ initial: 340, storageKey: 'k1' }));
    expect(result.current.size).toBe(340);
    expect(result.current.separatorProps.role).toBe('separator');
    expect(result.current.separatorProps['aria-orientation']).toBe('vertical'); // axis x → vertical line
  });

  it('keyboard ArrowRight/Left resizes a START pane; double-click/Home resets', () => {
    const { result } = renderHook(() => useResizableSplit({ axis: 'x', side: 'start', initial: 300, min: 100, keepOther: 0, storageKey: 'k2' }));
    act(() => result.current.separatorProps.onKeyDown({ key: 'ArrowRight', preventDefault() {} }));
    expect(result.current.size).toBe(324);
    act(() => result.current.separatorProps.onKeyDown({ key: 'ArrowLeft', preventDefault() {} }));
    expect(result.current.size).toBe(300);
    act(() => result.current.separatorProps.onKeyDown({ key: 'ArrowRight', preventDefault() {} }));
    act(() => result.current.reset());
    expect(result.current.size).toBe(300);
  });

  it('keyboard direction is inverted for an END pane', () => {
    const { result } = renderHook(() => useResizableSplit({ axis: 'x', side: 'end', initial: 300, min: 100, keepOther: 0, storageKey: 'k3' }));
    act(() => result.current.separatorProps.onKeyDown({ key: 'ArrowLeft', preventDefault() {} }));
    expect(result.current.size).toBe(324); // END pane grows leftward
  });

  it('persists the size to localStorage and restores it', () => {
    const { result, unmount } = renderHook(() => useResizableSplit({ initial: 300, min: 100, keepOther: 0, storageKey: 'k4' }));
    act(() => result.current.setSize(420));
    expect(window.localStorage.getItem('k4')).toBe('420');
    unmount();
    const { result: r2 } = renderHook(() => useResizableSplit({ initial: 300, storageKey: 'k4' }));
    expect(r2.current.size).toBe(420); // restored from storage, not `initial`
  });
});
