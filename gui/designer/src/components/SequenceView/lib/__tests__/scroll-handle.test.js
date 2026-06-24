import { describe, it, expect, afterEach } from 'vitest';
import { findScrollingAncestor } from '../scroll-handle.js';

// Make an element report itself as a real scroller: overflowY:auto AND
// scrollHeight > clientHeight (happy-dom returns 0 for both by default).
function scrollable(el, scrollH, clientH) {
  el.style.overflowY = 'auto';
  Object.defineProperty(el, 'scrollHeight', { value: scrollH, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: clientH, configurable: true });
  return el;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('findScrollingAncestor — considers the element itself (V153 drag auto-scroll)', () => {
  it('returns the element when IT owns the scrollbar (SequenceView root has overflowY:auto)', () => {
    // Regression: the old walk started at el.parentElement, skipping the
    // SequenceView root which IS the scroller → auto-scroll targeted the wrong
    // element and the selection "упиралось в низ".
    const parent = document.createElement('div');
    const root = document.createElement('div');
    parent.appendChild(root);
    document.body.appendChild(parent);
    scrollable(root, 500, 200);
    expect(findScrollingAncestor(root)).toBe(root);
  });

  it('falls through to a scrollable ANCESTOR when the element itself does not scroll (Importer host)', () => {
    const scrollParent = scrollable(document.createElement('div'), 800, 300);
    const root = document.createElement('div');
    scrollable(root, 100, 100); // overflowY:auto but content fits → not the scroller
    scrollParent.appendChild(root);
    document.body.appendChild(scrollParent);
    expect(findScrollingAncestor(root)).toBe(scrollParent);
  });

  it('falls back to the document scroller when nothing in the chain scrolls', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const r = findScrollingAncestor(root);
    expect(r === document.scrollingElement || r === document.documentElement).toBe(true);
  });
});
