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
    const ran = runHotkeyResolver(ev);
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
    const ran = runHotkeyResolver(ev);
    expect(ran).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('4) global-with-project scope is gated by currentProjectId', async () => {
    _setPlatformOverrideForTests('other');
    const handler = vi.fn();
    renderHook(() => useHotkey('save-bodge', handler));

    _setGetContextForTests(() => ({ currentProjectId: null, activeFullscreen: 'start' }));
    const ev1 = makeEvent({ key: 's', ctrl: true });
    expect(runHotkeyResolver(ev1)).toBe(false);
    expect(handler).not.toHaveBeenCalled();

    _setGetContextForTests(() => ({ currentProjectId: 'p-1', activeFullscreen: 'dag' }));
    const ev2 = makeEvent({ key: 's', ctrl: true });
    expect(runHotkeyResolver(ev2)).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('5) skip-in-input by default — handler not invoked when target is <input>', async () => {
    _setPlatformOverrideForTests('other');
    const handler = vi.fn();
    renderHook(() => useHotkey('new-project', handler));
    const input = document.createElement('input');
    document.body.appendChild(input);
    const ev = makeEvent({ key: 'n', ctrl: true, target: input });
    const ran = runHotkeyResolver(ev);
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
    const ran = runHotkeyResolver(ev);
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
    runHotkeyResolver(makeEvent({ key: 'Escape' }));
    expect(closeModal).toHaveBeenCalledTimes(1);

    // case B — no modal, navStack > 1 → handler "pops"
    mode = 'pop';
    runHotkeyResolver(makeEvent({ key: 'Escape' }));
    expect(popFs).toHaveBeenCalledTimes(1);

    // case C — root (start), no-op
    mode = 'noop';
    runHotkeyResolver(makeEvent({ key: 'Escape' }));
    expect(noop).toHaveBeenCalledTimes(1);
  });

  it('HOTKEYS map exposes 15 entries (T7 zone G/S; T10 added toggle-sanger-notebook)', () => {
    expect(Object.keys(HOTKEYS).sort()).toEqual([
      'close-project', 'command-palette', 'escape', 'new-project',
      'open-bodge', 'open-settings', 'pcr-primer-forward', 'pcr-primer-reverse',
      'piece-create', 'project-info', 'save-bodge', 'sequence-search',
      'toggle-sanger-notebook', 'toggle-zone-view-graph', 'toggle-zone-view-sequence',
    ]);
  });

  // FAIL-fix-pass 5 — Ctrl+Shift+P / Ctrl+Shift+F as alternate
  // bindings for browser-overridden primary combos.
  it('command-palette accepts BOTH Ctrl+P (primary) and Ctrl+Shift+P (alternate) on win/linux', () => {
    _setPlatformOverrideForTests('other');
    const handler = vi.fn();
    renderHook(() => useHotkey('command-palette', handler));
    expect(runHotkeyResolver(makeEvent({ key: 'p', ctrl: true }))).toBe(true);
    expect(runHotkeyResolver(makeEvent({ key: 'p', ctrl: true, shift: true }))).toBe(true);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('sequence-search accepts BOTH Ctrl+F (primary) and Ctrl+Shift+F (alternate) on win/linux', () => {
    _setPlatformOverrideForTests('other');
    const handler = vi.fn();
    renderHook(() => useHotkey('sequence-search', handler));
    expect(runHotkeyResolver(makeEvent({ key: 'f', ctrl: true }))).toBe(true);
    expect(runHotkeyResolver(makeEvent({ key: 'f', ctrl: true, shift: true }))).toBe(true);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('formatHotkey returns the PRIMARY combo only (alternates documented in cheatsheet, not inline UI)', () => {
    expect(formatHotkey('command-palette', 'other')).toBe('Ctrl+P');
    expect(formatHotkey('command-palette', 'mac')).toBe('⌘P');
    expect(formatHotkey('sequence-search', 'other')).toBe('Ctrl+F');
  });

  // 11.05.2026 — layout-independent matching via `event.code`.
  // Cyrillic layout: physical P-key fires `event.key === 'з'`,
  // physical F → 'а', physical I → 'ш', physical , → 'б'. Resolver
  // must still fire the right action via `event.code === 'KeyP'/...`.
  it('Ctrl+з (cyrillic layout, physical P) still triggers command-palette via event.code=KeyP', () => {
    _setPlatformOverrideForTests('other');
    const handler = vi.fn();
    renderHook(() => useHotkey('command-palette', handler));
    const ev = makeEvent({ key: 'з', ctrl: true });
    ev.code = 'KeyP';
    expect(runHotkeyResolver(ev)).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+а (cyrillic layout, physical F) still triggers sequence-search via event.code=KeyF', () => {
    _setPlatformOverrideForTests('other');
    const handler = vi.fn();
    renderHook(() => useHotkey('sequence-search', handler));
    const ev = makeEvent({ key: 'а', ctrl: true });
    ev.code = 'KeyF';
    expect(runHotkeyResolver(ev)).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+ы (cyrillic layout, physical S) still triggers save-bodge via event.code=KeyS', () => {
    _setPlatformOverrideForTests('other');
    _setGetContextForTests(() => ({ currentProjectId: 'p-1', activeFullscreen: 'dag' }));
    const handler = vi.fn();
    renderHook(() => useHotkey('save-bodge', handler));
    const ev = makeEvent({ key: 'ы', ctrl: true });
    ev.code = 'KeyS';
    expect(runHotkeyResolver(ev)).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('non-letter combos (Esc, comma) still match via event.key without needing code fallback', () => {
    _setPlatformOverrideForTests('other');
    const handlerEsc = vi.fn();
    const handlerSettings = vi.fn();
    renderHook(() => useHotkey('escape', handlerEsc));
    renderHook(() => useHotkey('open-settings', handlerSettings));
    expect(runHotkeyResolver(makeEvent({ key: 'Escape' }))).toBe(true);
    expect(handlerEsc).toHaveBeenCalled();
    expect(runHotkeyResolver(makeEvent({ key: ',', ctrl: true }))).toBe(true);
    expect(handlerSettings).toHaveBeenCalled();
  });

  it('formatHotkey("project-info") → ⌘I on mac / Ctrl+I elsewhere', () => {
    expect(formatHotkey('project-info', 'mac')).toBe('⌘I');
    expect(formatHotkey('project-info', 'other')).toBe('Ctrl+I');
  });

  it('project-info is gated by currentProjectId (scope global-with-project)', () => {
    _setPlatformOverrideForTests('other');
    const handler = vi.fn();
    renderHook(() => useHotkey('project-info', handler));

    _setGetContextForTests(() => ({ currentProjectId: null, activeFullscreen: 'start' }));
    expect(runHotkeyResolver(makeEvent({ key: 'i', ctrl: true }))).toBe(false);
    expect(handler).not.toHaveBeenCalled();

    _setGetContextForTests(() => ({ currentProjectId: 'p-1', activeFullscreen: 'dag' }));
    expect(runHotkeyResolver(makeEvent({ key: 'i', ctrl: true }))).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('⌘N inside open ProjectInfoModal does not run new-project handler', () => {
    _setPlatformOverrideForTests('other');
    _setGetContextForTests(() => ({
      currentProjectId: 'p-1',
      activeFullscreen: 'dag',
      modals: { projectInfo: true, settings: false },
    }));
    const handler = vi.fn();
    renderHook(() => useHotkey('new-project', handler));
    const ev = makeEvent({ key: 'n', ctrl: true });
    expect(runHotkeyResolver(ev)).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('Escape inside open ProjectInfoModal still runs escape handler', () => {
    _setPlatformOverrideForTests('other');
    _setGetContextForTests(() => ({
      currentProjectId: 'p-1',
      activeFullscreen: 'dag',
      modals: { projectInfo: true, settings: false },
    }));
    const handler = vi.fn();
    renderHook(() => useHotkey('escape', handler));
    const ev = makeEvent({ key: 'Escape' });
    expect(runHotkeyResolver(ev)).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
