/**
 * global-ctrl-a-guard.test.js — Sprint M-X.3 follow-up.
 *
 * Biolog: «можно запретить Ctrl+A везде кроме окна вивера? иногда
 * бывает что выделяю «всё вокруг»». The browser's native
 * Ctrl+A "Select All" dumps the user's keystroke into whatever
 * happens to be focused — random page text, the catalog list, the
 * project shell — leading to a confusing visible selection. We
 * install a global capture-phase guard that:
 *   - lets Ctrl+A through inside SequenceView (its own handler
 *     selects the forward strand)
 *   - lets Ctrl+A through inside text inputs (native «select all
 *     within input» is the expected behaviour)
 *   - calls preventDefault() everywhere else
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { installGlobalCtrlAGuard } from '../global-ctrl-a-guard.js';

let teardown = null;

afterEach(() => {
  if (typeof teardown === 'function') teardown();
  teardown = null;
  document.body.innerHTML = '';
});

function fireCtrlA(target) {
  const e = new KeyboardEvent('keydown', {
    key: 'a', code: 'KeyA', ctrlKey: true, bubbles: true, cancelable: true,
  });
  // dispatchEvent won't update `event.target` to a child element on
  // happy-dom unless the element is in the document; tests put it
  // in document.body before firing.
  target.dispatchEvent(e);
  return e;
}

describe('installGlobalCtrlAGuard', () => {
  beforeEach(() => {
    teardown = installGlobalCtrlAGuard();
  });

  it('Ctrl+A on bare body: preventDefault is called', () => {
    const e = fireCtrlA(document.body);
    expect(e.defaultPrevented).toBe(true);
  });

  it('Ctrl+A inside an INPUT element: preventDefault is NOT called', () => {
    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);
    const e = fireCtrlA(input);
    expect(e.defaultPrevented).toBe(false);
  });

  it('Ctrl+A inside a TEXTAREA: preventDefault is NOT called', () => {
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    const e = fireCtrlA(ta);
    expect(e.defaultPrevented).toBe(false);
  });

  it('Ctrl+A on a contentEditable element: preventDefault is NOT called', () => {
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    document.body.appendChild(div);
    const e = fireCtrlA(div);
    expect(e.defaultPrevented).toBe(false);
  });

  it('Ctrl+A inside the SequenceView root: preventDefault is NOT called (SV handler takes over)', () => {
    const sv = document.createElement('div');
    sv.setAttribute('data-testid', 'sequence-view-root');
    const inner = document.createElement('span');
    sv.appendChild(inner);
    document.body.appendChild(sv);
    const e = fireCtrlA(inner);
    expect(e.defaultPrevented).toBe(false);
  });

  it('Cmd+A (Mac, metaKey) follows the same rules: blocked outside SV', () => {
    const e = new KeyboardEvent('keydown', {
      key: 'a', code: 'KeyA', metaKey: true, bubbles: true, cancelable: true,
    });
    document.body.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it('Layout-independent: physical KeyA + Cyrillic «ф» key still triggers the guard', () => {
    const e = new KeyboardEvent('keydown', {
      key: 'ф', code: 'KeyA', ctrlKey: true, bubbles: true, cancelable: true,
    });
    document.body.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it('Plain «A» (no modifier) is left alone — typing the letter must work', () => {
    const e = new KeyboardEvent('keydown', {
      key: 'a', code: 'KeyA', bubbles: true, cancelable: true,
    });
    document.body.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });

  it('Other Ctrl+letter combos are untouched (e.g. Ctrl+C)', () => {
    const e = new KeyboardEvent('keydown', {
      key: 'c', code: 'KeyC', ctrlKey: true, bubbles: true, cancelable: true,
    });
    document.body.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });

  it('teardown removes the listener — Ctrl+A on body no longer prevented', () => {
    teardown();
    teardown = null;
    const e = fireCtrlA(document.body);
    expect(e.defaultPrevented).toBe(false);
  });
});
