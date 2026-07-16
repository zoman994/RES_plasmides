/**
 * K1.3 — useSearchComboboxNavigation: the headless keyboard + composition core.
 * It owns transient UI state only (activeKey by STABLE key, isComposing) and
 * emits the ARIA-navigation contract. No rendering, no store. The IME guard
 * uses BOTH a ref (compositionstart/end) AND event.nativeEvent.isComposing, and
 * the `:` case verifies the ABSENCE of the surface seam callback (not a vacuum).
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSearchComboboxNavigation } from '../useSearchComboboxNavigation';

const ITEMS = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const ev = (key, extra = {}) => ({ key, preventDefault: vi.fn(), stopPropagation: vi.fn(), nativeEvent: extra.nativeEvent || {}, ...extra });

function setup(props = {}) {
  const onOpenChange = vi.fn();
  const onSelect = vi.fn();
  const onUnhandledKeyDown = vi.fn();
  const hook = renderHook(
    (p) => useSearchComboboxNavigation({ items: ITEMS, onOpenChange, onSelect, onUnhandledKeyDown, ...p }),
    { initialProps: props },
  );
  return { ...hook, onOpenChange, onSelect, onUnhandledKeyDown };
}

describe('opening from a closed popup', () => {
  it('ArrowDown opens and activates the first option', () => {
    const { result, onOpenChange } = setup({ open: false });
    const e = ev('ArrowDown');
    act(() => result.current.onKeyDown(e));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(result.current.activeKey).toBe('a');
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it('ArrowUp opens and activates the last option', () => {
    const { result, onOpenChange } = setup({ open: false });
    act(() => result.current.onKeyDown(ev('ArrowUp')));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(result.current.activeKey).toBe('c');
  });
});

describe('moving within an open popup (clamped, no wrap)', () => {
  it('ArrowDown advances and clamps at the last option', () => {
    const { result, rerender } = setup({ open: true });
    act(() => result.current.onKeyDown(ev('ArrowDown'))); // → a
    expect(result.current.activeKey).toBe('a');
    act(() => result.current.onKeyDown(ev('ArrowDown'))); // → b
    act(() => result.current.onKeyDown(ev('ArrowDown'))); // → c
    act(() => result.current.onKeyDown(ev('ArrowDown'))); // stays c (clamp)
    expect(result.current.activeKey).toBe('c');
    rerender({ open: true }); // no-op, keep contract stable
  });

  it('ArrowUp retreats and clamps at the first option', () => {
    const { result } = setup({ open: true });
    act(() => result.current.onKeyDown(ev('ArrowUp'))); // opens-behaviour n/a: already open → last? no: active -1 → last
    expect(result.current.activeKey).toBe('c');
    act(() => result.current.onKeyDown(ev('ArrowUp'))); // → b
    act(() => result.current.onKeyDown(ev('ArrowUp'))); // → a
    act(() => result.current.onKeyDown(ev('ArrowUp'))); // stays a (clamp)
    expect(result.current.activeKey).toBe('a');
  });

  it('Home/End jump to first/last only when open', () => {
    const { result } = setup({ open: true });
    const end = ev('End');
    act(() => result.current.onKeyDown(end));
    expect(result.current.activeKey).toBe('c');
    expect(end.preventDefault).toHaveBeenCalled();
    const home = ev('Home');
    act(() => result.current.onKeyDown(home));
    expect(result.current.activeKey).toBe('a');
  });

  it('Home/End when closed do NOT activate and do NOT preventDefault (input caret keeps them)', () => {
    const { result, onOpenChange } = setup({ open: false });
    const home = ev('Home');
    act(() => result.current.onKeyDown(home));
    expect(result.current.activeKey).toBeNull();
    expect(home.preventDefault).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe('Enter selects only an existing active option', () => {
  it('open + active → onSelect(item, index), preventDefault', () => {
    const { result, onSelect } = setup({ open: true });
    act(() => result.current.onKeyDown(ev('ArrowDown'))); // active a
    const enter = ev('Enter');
    act(() => result.current.onKeyDown(enter));
    expect(onSelect).toHaveBeenCalledWith(ITEMS[0], 0);
    expect(enter.preventDefault).toHaveBeenCalled();
  });

  it('open + no active → does not select, defers to the surface seam', () => {
    const { result, onSelect, onUnhandledKeyDown } = setup({ open: true });
    const enter = ev('Enter');
    act(() => result.current.onKeyDown(enter));
    expect(onSelect).not.toHaveBeenCalled();
    expect(onUnhandledKeyDown).toHaveBeenCalledWith(enter);
  });

  it('closed → Enter never selects', () => {
    const { result, onSelect } = setup({ open: false });
    act(() => result.current.onKeyDown(ev('Enter')));
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('Escape and Tab', () => {
  it('Escape only closes the popup (value untouched) and clears active', () => {
    const { result, onOpenChange } = setup({ open: true });
    act(() => result.current.onKeyDown(ev('ArrowDown')));
    const esc = ev('Escape');
    act(() => result.current.onKeyDown(esc));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(result.current.activeKey).toBeNull();
    expect(esc.preventDefault).toHaveBeenCalled();
  });

  it('Escape when closed defers to the seam and does not toggle open', () => {
    const { result, onOpenChange, onUnhandledKeyDown } = setup({ open: false });
    const esc = ev('Escape');
    act(() => result.current.onKeyDown(esc));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onUnhandledKeyDown).toHaveBeenCalledWith(esc);
  });

  it('Escape (open) stops propagation so it does not ALSO close a parent modal', () => {
    const { result } = setup({ open: true });
    const esc = ev('Escape');
    act(() => result.current.onKeyDown(esc));
    expect(esc.stopPropagation).toHaveBeenCalled();
  });

  it('Tab closes the popup WITHOUT preventDefault (focus must move away)', () => {
    const { result, onOpenChange } = setup({ open: true });
    const tab = ev('Tab');
    act(() => result.current.onKeyDown(tab));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(tab.preventDefault).not.toHaveBeenCalled();
  });
});

describe('IME guard (ref + nativeEvent.isComposing)', () => {
  it('a colon typed outside composition reaches the surface seam', () => {
    const { result, onUnhandledKeyDown } = setup({ open: false });
    const colon = ev(':');
    act(() => result.current.onKeyDown(colon));
    expect(onUnhandledKeyDown).toHaveBeenCalledWith(colon);
  });

  it('a colon typed DURING composition (ref path) does NOT reach the seam', () => {
    const { result, onUnhandledKeyDown } = setup({ open: false });
    act(() => result.current.compositionHandlers.onCompositionStart());
    act(() => result.current.onKeyDown(ev(':')));
    expect(onUnhandledKeyDown).not.toHaveBeenCalled();
  });

  it('Enter during composition (nativeEvent.isComposing) does not select nor hit the seam', () => {
    const { result, onSelect, onUnhandledKeyDown } = setup({ open: true });
    act(() => result.current.onKeyDown(ev('ArrowDown'))); // active a
    const enter = ev('Enter', { nativeEvent: { isComposing: true } });
    act(() => result.current.onKeyDown(enter));
    expect(onSelect).not.toHaveBeenCalled();
    expect(onUnhandledKeyDown).not.toHaveBeenCalled();
    expect(enter.preventDefault).not.toHaveBeenCalled();
  });

  it('once composition ends, Enter selects again', () => {
    const { result, onSelect } = setup({ open: true });
    act(() => result.current.onKeyDown(ev('ArrowDown'))); // active a
    act(() => result.current.compositionHandlers.onCompositionStart());
    act(() => result.current.compositionHandlers.onCompositionEnd());
    act(() => result.current.onKeyDown(ev('Enter')));
    expect(onSelect).toHaveBeenCalledWith(ITEMS[0], 0);
  });
});

describe('active identity survives reorder; leaving the list resets safely', () => {
  it('a partial→final reorder within ONE session keeps the active entity by key (index follows)', () => {
    const { result, rerender } = setup({ open: true, items: ITEMS, sessionKey: 'q1' });
    act(() => result.current.onKeyDown(ev('ArrowDown'))); // active 'a' at index 0
    expect(result.current.activeIndex).toBe(0);
    rerender({ open: true, items: [{ id: 'c' }, { id: 'a' }, { id: 'b' }], sessionKey: 'q1' });
    expect(result.current.activeKey).toBe('a');
    expect(result.current.activeIndex).toBe(1); // moved, not dangling
  });

  it('a NEW query (sessionKey change) resets active — a reappearing entity does NOT re-activate', () => {
    const { result, rerender } = setup({ open: true, items: ITEMS, sessionKey: 'q1' });
    act(() => result.current.onKeyDown(ev('ArrowDown'))); // active 'a' in query q1
    expect(result.current.activeKey).toBe('a');
    rerender({ open: true, items: ITEMS, sessionKey: 'q2' }); // new query — 'a' still present
    expect(result.current.activeKey).toBeNull(); // active did not cross the query boundary
    expect(result.current.activeIndex).toBe(-1);
  });

  it('removing the active entity resets active state (index -1, key nulled by effect)', () => {
    const { result, rerender, onSelect } = setup({ open: true, items: ITEMS });
    act(() => result.current.onKeyDown(ev('ArrowDown'))); // active 'a'
    rerender({ open: true, items: [{ id: 'b' }, { id: 'c' }] }); // 'a' gone
    expect(result.current.activeIndex).toBe(-1);
    expect(result.current.activeKey).toBeNull();
    act(() => result.current.onKeyDown(ev('Enter'))); // nothing active → no select
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('disabled', () => {
  it('swallows navigation entirely — no open, no active, no preventDefault', () => {
    const { result, onOpenChange } = setup({ open: false, disabled: true });
    const e = ev('ArrowDown');
    act(() => result.current.onKeyDown(e));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(result.current.activeKey).toBeNull();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it('disabling RESETS the active option so re-enabling never resurrects it', () => {
    const { result, rerender } = setup({ open: true, items: ITEMS });
    act(() => result.current.onKeyDown(ev('ArrowDown'))); // active 'a'
    expect(result.current.activeKey).toBe('a');
    rerender({ open: true, items: ITEMS, disabled: true });
    expect(result.current.activeKey).toBeNull(); // active cleared on disable
    rerender({ open: true, items: ITEMS, disabled: false });
    expect(result.current.activeKey).toBeNull(); // stays cleared after re-enable
  });
});
