/**
 * global-copy.test.js — Игорь: «контрол С должно глобально работать
 * везде где можно выделить».
 *
 * Until now the SequenceView Ctrl+C copy lived on the root <div>'s
 * onKeyDown, so it only fired while that div held focus. This module
 * promotes copy to a window capture-phase handler backed by a
 * copy-source registry: every mounted SequenceView registers a
 * source, and Ctrl+C copies the active selection regardless of which
 * pane currently holds focus.
 *
 * The handler must NEVER clobber native copy:
 *   - focus in INPUT / TEXTAREA / SELECT / contentEditable → native
 *     input copy wins (input selections do NOT show up in
 *     window.getSelection()).
 *   - a non-empty native DOM selection (plain HTML text) → native
 *     copy wins.
 *   - focus already inside a SequenceView → its own onRootKeyDown
 *     copies (avoid double-handling).
 * Only when none of those hold AND an active sequence selection
 * exists do we copy it ourselves.
 */
import {
  describe, it, expect, beforeEach, afterEach, vi,
} from 'vitest';
import {
  registerCopySource,
  setActiveCopySource,
  getActiveCopyText,
  installGlobalCopyHandler,
  _clearCopySourcesForTests,
} from '../global-copy.js';

const writeText = vi.fn();

beforeEach(() => {
  _clearCopySourcesForTests();
  writeText.mockReset();
  // navigator.clipboard.writeText is the only sink we assert on.
  if (!navigator.clipboard) {
    Object.defineProperty(navigator, 'clipboard', { value: {}, configurable: true });
  }
  navigator.clipboard.writeText = writeText;
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

// A source whose getText returns canned strings per mode.
function fakeSource(map) {
  return { getText: (mode) => (mode in map ? map[mode] : null) };
}

describe('copy-source registry', () => {
  it('registerCopySource makes the source active and getActiveCopyText reads it', () => {
    registerCopySource(fakeSource({ forward: 'ACGT' }));
    expect(getActiveCopyText('forward')).toBe('ACGT');
  });

  it('the most recently registered source becomes active', () => {
    registerCopySource(fakeSource({ forward: 'AAAA' }));
    registerCopySource(fakeSource({ forward: 'TTTT' }));
    expect(getActiveCopyText('forward')).toBe('TTTT');
  });

  it('setActiveCopySource switches which source answers', () => {
    const a = fakeSource({ forward: 'AAAA' });
    const b = fakeSource({ forward: 'TTTT' });
    registerCopySource(a);
    registerCopySource(b); // b active
    setActiveCopySource(a);
    expect(getActiveCopyText('forward')).toBe('AAAA');
  });

  it('falls through to another source when the active one has no selection', () => {
    const empty = fakeSource({ forward: null });
    const full = fakeSource({ forward: 'GGGG' });
    registerCopySource(full);
    registerCopySource(empty); // empty active, but returns null
    expect(getActiveCopyText('forward')).toBe('GGGG');
  });

  it('unregister removes the source', () => {
    const off = registerCopySource(fakeSource({ forward: 'ACGT' }));
    off();
    expect(getActiveCopyText('forward')).toBeNull();
  });

  it('returns null when no source has a selection', () => {
    registerCopySource(fakeSource({ forward: null }));
    expect(getActiveCopyText('forward')).toBeNull();
  });

  it('a throwing active source is skipped, not fatal', () => {
    registerCopySource(fakeSource({ forward: 'OK' }));
    // register a throwing source LAST so it is the active one
    registerCopySource({ getText: () => { throw new Error('boom'); } });
    expect(getActiveCopyText('forward')).toBe('OK');
  });
});

describe('installGlobalCopyHandler', () => {
  let teardown;
  beforeEach(() => { teardown = installGlobalCopyHandler(); });
  afterEach(() => { teardown?.(); });

  function dispatchCopy(target, overrides = {}) {
    const evt = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      code: 'KeyC',
      key: 'c',
      ...overrides,
    });
    target.dispatchEvent(evt);
    return evt;
  }

  it('Ctrl+C on the body copies the active selection (forward)', () => {
    registerCopySource(fakeSource({ forward: 'ATGC' }));
    const evt = dispatchCopy(document.body);
    expect(writeText).toHaveBeenCalledWith('ATGC');
    expect(evt.defaultPrevented).toBe(true);
  });

  it('Ctrl+Alt+C copies the reverse strand', () => {
    registerCopySource(fakeSource({ forward: 'ATGC', reverse: 'GCAT' }));
    dispatchCopy(document.body, { altKey: true });
    expect(writeText).toHaveBeenCalledWith('GCAT');
  });

  it('Ctrl+Shift+C copies amino acids when the source offers them', () => {
    registerCopySource(fakeSource({ forward: 'ATGC', aa: 'M' }));
    dispatchCopy(document.body, { shiftKey: true });
    expect(writeText).toHaveBeenCalledWith('M');
  });

  it('Ctrl+Shift+C is a no-op when the source has no AA (non-CDS selection)', () => {
    registerCopySource(fakeSource({ forward: 'ATGC', aa: null }));
    const evt = dispatchCopy(document.body, { shiftKey: true });
    expect(writeText).not.toHaveBeenCalled();
    expect(evt.defaultPrevented).toBe(false);
  });

  it('layout-independent — fires on physical KeyC even when key is Cyrillic «с»', () => {
    registerCopySource(fakeSource({ forward: 'ATGC' }));
    dispatchCopy(document.body, { key: 'с' });
    expect(writeText).toHaveBeenCalledWith('ATGC');
  });

  it('defers to native input copy when focus is in a text input', () => {
    registerCopySource(fakeSource({ forward: 'ATGC' }));
    const input = document.createElement('input');
    document.body.appendChild(input);
    const evt = dispatchCopy(input);
    expect(writeText).not.toHaveBeenCalled();
    expect(evt.defaultPrevented).toBe(false);
  });

  it('defers to native copy when there is a non-empty DOM selection', () => {
    registerCopySource(fakeSource({ forward: 'ATGC' }));
    vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => 'hello world' });
    const evt = dispatchCopy(document.body);
    expect(writeText).not.toHaveBeenCalled();
    expect(evt.defaultPrevented).toBe(false);
  });

  it('defers to the SequenceView own handler when focus is inside one', () => {
    registerCopySource(fakeSource({ forward: 'ATGC' }));
    const sv = document.createElement('div');
    sv.setAttribute('data-testid', 'sequence-view-root');
    const inner = document.createElement('span');
    sv.appendChild(inner);
    document.body.appendChild(sv);
    const evt = dispatchCopy(inner);
    expect(writeText).not.toHaveBeenCalled();
    expect(evt.defaultPrevented).toBe(false);
  });

  it('no-op (no preventDefault) when nothing is selected anywhere', () => {
    registerCopySource(fakeSource({ forward: null }));
    const evt = dispatchCopy(document.body);
    expect(writeText).not.toHaveBeenCalled();
    expect(evt.defaultPrevented).toBe(false);
  });

  it('ignores plain C (no Ctrl/Cmd)', () => {
    registerCopySource(fakeSource({ forward: 'ATGC' }));
    dispatchCopy(document.body, { ctrlKey: false });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('teardown detaches the listener', () => {
    registerCopySource(fakeSource({ forward: 'ATGC' }));
    teardown();
    teardown = null;
    const evt = dispatchCopy(document.body);
    expect(writeText).not.toHaveBeenCalled();
    expect(evt.defaultPrevented).toBe(false);
  });
});
