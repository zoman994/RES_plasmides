import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  HOTKEYS, formatHotkey, useHotkey, runHotkeyResolver,
  _setPlatformOverrideForTests, _clearHandlersForTests, _setGetContextForTests, _getHandlersForTests,
} from '../hotkeys';

function makeEvent({ key, meta = false, ctrl = false, alt = false, shift = false, target } = {}) {
  let prevented = false;
  return {
    key,
    metaKey: meta,
    ctrlKey: ctrl,
    altKey: alt,
    shiftKey: shift,
    target: target || document.body,
    preventDefault() { prevented = true; },
    get defaultPrevented() { return prevented; },
  };
}

describe('K4 — hotkey infrastructure', () => {
  beforeEach(() => {
    _clearHandlersForTests();
    _setPlatformOverrideForTests(null);
    _setGetContextForTests(() => ({ currentProjectId: null, activeFullscreen: 'start' }));
  });
  afterEach(() => {
    _clearHandlersForTests();
    _setPlatformOverrideForTests(null);
    _setGetContextForTests(null);
  });

  it('1) formatHotkey returns mac/win-linux display strings', () => {
    expect(formatHotkey('save-bodge', 'mac')).toBe('⌘S');
    expect(formatHotkey('save-bodge', 'other')).toBe('Ctrl+S');
    expect(formatHotkey('open-settings', 'mac')).toBe('⌘,');
    expect(formatHotkey('open-settings', 'other')).toBe('Ctrl+,');
    expect(formatHotkey('escape', 'mac')).toBe('Esc');
    expect(formatHotkey('escape', 'other')).toBe('Esc');
    expect(formatHotkey('does-not-exist')).toBe('');
  });

  it('2) useHotkey registers a handler that runs on matching keydown', async () => {
    _setPlatformOverrideForTests('other');
    const handler = vi.fn();
    renderHook(() => useHotkey('new-project', handler));
    expect(_getHandlersForTests().has('new-project')).toBe(true);
    const ev = makeEvent({ key: 'n', ctrl: true });
    const ran = await runHotkeyResolver(ev);
    expect(ran).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('3) cleanup on unmount — handler not invoked after unmount', async () => {
    _setPlatformOverrideForTests('other');
    const handler = vi.fn();
    const { unmount } = renderHook(() => useHotkey('new-project', handler));
    unmount();
    expect(_getHandlersForTests().has('new-project')).toBe(false);
    const ev = makeEvent({ key: 'n', ctrl: true });
    const ran = await runHotkeyResolver(ev);
    expect(ran).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('4) global-with-project scope is gated by currentProjectId', async () => {
    _setPlatformOverrideForTests('other');
    const handler = vi.fn();
    renderHook(() => useHotkey('save-bodge', handler));

    _setGetContextForTests(() => ({ currentProjectId: null, activeFullscreen: 'start' }));
    const ev1 = makeEvent({ key: 's', ctrl: true });
    expect(await runHotkeyResolver(ev1)).toBe(false);
    expect(handler).not.toHaveBeenCalled();

    _setGetContextForTests(() => ({ currentProjectId: 'p-1', activeFullscreen: 'dag' }));
    const ev2 = makeEvent({ key: 's', ctrl: true });
    expect(await runHotkeyResolver(ev2)).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('5) skip-in-input by default — handler not invoked when target is <input>', async () => {
    _setPlatformOverrideForTests('other');
    const handler = vi.fn();
    renderHook(() => useHotkey('new-project', handler));
    const input = document.createElement('input');
    document.body.appendChild(input);
    const ev = makeEvent({ key: 'n', ctrl: true, target: input });
    const ran = await runHotkeyResolver(ev);
    document.body.removeChild(input);
    expect(ran).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('6) save-bodge has allowInInput=true → fires even when focus is in <input>', async () => {
    _setPlatformOverrideForTests('other');
    _setGetContextForTests(() => ({ currentProjectId: 'p-1', activeFullscreen: 'dag' }));
    const handler = vi.fn();
    renderHook(() => useHotkey('save-bodge', handler));
    const input = document.createElement('input');
    document.body.appendChild(input);
    const ev = makeEvent({ key: 's', ctrl: true, target: input });
    const ran = await runHotkeyResolver(ev);
    document.body.removeChild(input);
    expect(ran).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('7) Esc context-aware: handler decides — closes modal or pops, no-op on root', async () => {
    _setPlatformOverrideForTests('other');
    let mode = 'modal';
    const closeModal = vi.fn();
    const popFs = vi.fn();
    const noop = vi.fn();
    const handler = vi.fn(() => {
      if (mode === 'modal') closeModal();
      else if (mode === 'pop') popFs();
      else noop();
    });
    renderHook(() => useHotkey('escape', handler));

    // case A — modal open
    _setGetContextForTests(() => ({ currentProjectId: null, activeFullscreen: 'start' }));
    await runHotkeyResolver(makeEvent({ key: 'Escape' }));
    expect(closeModal).toHaveBeenCalledTimes(1);

    // case B — no modal, navStack > 1 → handler "pops"
    mode = 'pop';
    await runHotkeyResolver(makeEvent({ key: 'Escape' }));
    expect(popFs).toHaveBeenCalledTimes(1);

    // case C — root (start), no-op
    mode = 'noop';
    await runHotkeyResolver(makeEvent({ key: 'Escape' }));
    expect(noop).toHaveBeenCalledTimes(1);
  });

  it('HOTKEYS map exposes 6 M-A entries', () => {
    expect(Object.keys(HOTKEYS).sort()).toEqual([
      'close-project', 'escape', 'new-project',
      'open-bodge', 'open-settings', 'save-bodge',
    ]);
  });
});
