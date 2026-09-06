import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  HOTKEYS, formatHotkey, useHotkey, runHotkeyResolver,
  registerHandler, _setPlatformOverrideForTests, _clearHandlersForTests,
  _setGetContextForTests, _getHandlersForTests,
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
    document
      .querySelectorAll('[data-block-global-hotkeys], [data-block-global-escape]')
      .forEach((element) => element.remove());
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

  // The registry is deliberately closed: a new key is an explicit decision,
  // not something a feature slips in. PRIMER-LIVE-1 added exactly one —
  // `primer-edit` (bare E) — so this list grew from 15 to 16.
  it('HOTKEYS map exposes 16 entries (T7 zone G/S; T10 toggle-sanger-notebook; PRIMER-LIVE-1 primer-edit)', () => {
    expect(Object.keys(HOTKEYS).sort()).toEqual([
      'close-project', 'command-palette', 'escape', 'new-project',
      'open-bodge', 'open-settings', 'pcr-primer-forward', 'pcr-primer-reverse',
      'piece-create', 'primer-edit', 'project-info', 'save-bodge', 'sequence-search',
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

  it('an opt-in modal boundary blocks every global hotkey before handlers', () => {
    _setPlatformOverrideForTests('other');
    const handler = vi.fn();
    renderHook(() => useHotkey('command-palette', handler));
    const modal = document.createElement('section');
    modal.setAttribute('data-block-global-hotkeys', 'true');
    const button = document.createElement('button');
    modal.appendChild(button);
    document.body.appendChild(modal);

    const event = makeEvent({ key: 'p', ctrl: true, target: button });
    expect(runHotkeyResolver(event)).toBe(false);
    expect(event.defaultPrevented).toBe(true);
    expect(handler).not.toHaveBeenCalled();
    modal.remove();
  });

  it('an escape-only boundary shields disclosure Escape but leaves E and Ctrl+S available', () => {
    _setPlatformOverrideForTests('other');
    _setGetContextForTests(() => ({ currentProjectId: 'p-1', activeFullscreen: 'assembly' }));
    const escape = vi.fn();
    const edit = vi.fn();
    const save = vi.fn();
    renderHook(() => useHotkey('escape', escape));
    renderHook(() => useHotkey('primer-edit', edit));
    renderHook(() => useHotkey('save-bodge', save));
    const boundary = document.createElement('section');
    boundary.setAttribute('data-block-global-escape', 'true');
    const target = document.createElement('button');
    boundary.appendChild(target);
    document.body.appendChild(boundary);

    expect(runHotkeyResolver(makeEvent({ key: 'Escape', target }))).toBe(false);
    expect(escape).not.toHaveBeenCalled();
    expect(runHotkeyResolver(makeEvent({ key: 'e', target }))).toBe(true);
    expect(edit).toHaveBeenCalledTimes(1);
    expect(runHotkeyResolver(makeEvent({ key: 's', ctrl: true, target }))).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    boundary.remove();
  });

  it('an active escape-only boundary shields Escape after focus moves elsewhere', () => {
    _setPlatformOverrideForTests('other');
    const escape = vi.fn();
    renderHook(() => useHotkey('escape', escape));
    const boundary = document.createElement('section');
    boundary.setAttribute('data-block-global-escape', 'true');
    const outside = document.createElement('button');
    document.body.append(boundary, outside);

    expect(runHotkeyResolver(makeEvent({ key: 'Escape', target: outside }))).toBe(false);
    expect(escape).not.toHaveBeenCalled();
    boundary.remove();
    outside.remove();
  });

  it('an open opt-in modal blocks global hotkeys even when focus is outside its boundary', () => {
    _setPlatformOverrideForTests('other');
    const handler = vi.fn();
    renderHook(() => useHotkey('escape', handler));
    const modal = document.createElement('section');
    modal.setAttribute('data-modal-open', '');
    modal.setAttribute('data-block-global-hotkeys', 'true');
    const escapedFocus = document.createElement('button');
    document.body.append(modal, escapedFocus);

    const event = makeEvent({ key: 'Escape', target: escapedFocus });
    expect(runHotkeyResolver(event)).toBe(false);
    // The resolver blocks the underlying app action; the modal's own
    // topmost boundary consumes plain Escape later in bubble phase.
    expect(event.defaultPrevented).toBe(false);
    expect(handler).not.toHaveBeenCalled();
    modal.remove();
    escapedFocus.remove();
  });

  it('a modal suppresses browser default only for an app-owned chord', () => {
    _setPlatformOverrideForTests('other');
    const modal = document.createElement('section');
    modal.setAttribute('data-modal-open', '');
    modal.setAttribute('data-block-global-hotkeys', 'true');
    document.body.appendChild(modal);

    const reload = makeEvent({ key: 'r', ctrl: true, target: document.body });
    expect(runHotkeyResolver(reload)).toBe(false);
    expect(reload.defaultPrevented).toBe(true);

    const copy = makeEvent({ key: 'c', ctrl: true, target: document.body });
    expect(runHotkeyResolver(copy)).toBe(false);
    expect(copy.defaultPrevented).toBe(false);
    modal.remove();
  });

  it('handler registrations are LIFO and removing the top restores the previous handler', () => {
    _setPlatformOverrideForTests('other');
    const underlying = vi.fn();
    const overlay = vi.fn();
    const unregisterUnderlying = registerHandler('pcr-primer-forward', underlying);
    const unregisterOverlay = registerHandler('pcr-primer-forward', overlay);

    expect(_getHandlersForTests().get('pcr-primer-forward')).toEqual([underlying, overlay]);
    expect(runHotkeyResolver(makeEvent({ key: 'r', ctrl: true }))).toBe(true);
    expect(overlay).toHaveBeenCalledTimes(1);
    expect(underlying).not.toHaveBeenCalled();

    unregisterOverlay();
    expect(_getHandlersForTests().get('pcr-primer-forward')).toEqual([underlying]);
    expect(runHotkeyResolver(makeEvent({ key: 'r', ctrl: true }))).toBe(true);
    expect(underlying).toHaveBeenCalledTimes(1);
    unregisterUnderlying();
  });

  it('exact unregister removes a non-top registration, including duplicate functions', () => {
    const shared = vi.fn();
    const top = vi.fn();
    const unregisterFirst = registerHandler('escape', shared);
    const unregisterDuplicate = registerHandler('escape', shared);
    const unregisterTop = registerHandler('escape', top);

    unregisterDuplicate();
    expect(_getHandlersForTests().get('escape')).toEqual([shared, top]);
    expect(runHotkeyResolver(makeEvent({ key: 'Escape' }))).toBe(true);
    expect(top).toHaveBeenCalledTimes(1);

    unregisterTop();
    expect(runHotkeyResolver(makeEvent({ key: 'Escape' }))).toBe(true);
    expect(shared).toHaveBeenCalledTimes(1);
    unregisterFirst();
    expect(_getHandlersForTests().has('escape')).toBe(false);
  });

  it('outside a modal, handlerless Ctrl+R remains available to the browser', () => {
    _setPlatformOverrideForTests('other');
    const event = makeEvent({ key: 'r', ctrl: true });
    expect(runHotkeyResolver(event)).toBe(false);
    expect(event.defaultPrevented).toBe(false);
  });

  it('an expanded primer in viewer A does not steal Escape targeted inside viewer B', () => {
    _setPlatformOverrideForTests('other');
    const escape = vi.fn();
    renderHook(() => useHotkey('escape', escape));

    const viewerA = document.createElement('section');
    viewerA.setAttribute('data-testid', 'sequence-view-root');
    const disclosureA = document.createElement('div');
    disclosureA.setAttribute('data-block-global-escape', 'true');
    viewerA.appendChild(disclosureA);
    const viewerB = document.createElement('section');
    viewerB.setAttribute('data-testid', 'sequence-view-root');
    const targetB = document.createElement('button');
    viewerB.appendChild(targetB);
    document.body.append(viewerA, viewerB);

    expect(runHotkeyResolver(makeEvent({ key: 'Escape', target: targetB }))).toBe(true);
    expect(escape).toHaveBeenCalledTimes(1);
    viewerA.remove();
    viewerB.remove();
  });

  // PRIMER-LIVE-1 — «E» edits the selected primer occurrence, the keyboard
  // twin of double-click. It is the standard edit key in this project's
  // layout, so it is registered centrally rather than as a local listener
  // inside one viewer.
  it('bare E is registered as the edit key and runs its handler', () => {
    _setPlatformOverrideForTests('other');
    expect(HOTKEYS['primer-edit']).toBeTruthy();
    expect(formatHotkey('primer-edit', 'other')).toBe('E');
    const handler = vi.fn();
    renderHook(() => useHotkey('primer-edit', handler));
    const ev = makeEvent({ key: 'e' });
    expect(runHotkeyResolver(ev)).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('E does not fire while the biolog is typing a name', () => {
    _setPlatformOverrideForTests('other');
    const handler = vi.fn();
    renderHook(() => useHotkey('primer-edit', handler));
    const input = document.createElement('input');
    document.body.appendChild(input);
    const ev = makeEvent({ key: 'e', target: input });
    expect(runHotkeyResolver(ev)).toBe(false);
    expect(handler).not.toHaveBeenCalled();
    input.remove();
  });

  it('E does not cross-match a modified chord', () => {
    _setPlatformOverrideForTests('other');
    const handler = vi.fn();
    renderHook(() => useHotkey('primer-edit', handler));
    expect(runHotkeyResolver(makeEvent({ key: 'e', ctrl: true }))).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });
});
