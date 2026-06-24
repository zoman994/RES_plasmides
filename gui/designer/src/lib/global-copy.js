/**
 * global-copy.js — Игорь: «контрол С должно глобально работать везде
 * где можно выделить».
 *
 * The SequenceView Ctrl+C copy used to live on the root <div>'s
 * onKeyDown, so it only fired while that div held focus: select a
 * region, click a side-panel, press Ctrl+C → nothing. This module
 * promotes copy to ONE window capture-phase listener (same shape as
 * `installGlobalCtrlAGuard`) backed by a tiny copy-source registry.
 *
 * Every mounted SequenceView registers a source via
 * `registerCopySource({ getText(mode) })` (see useSelectionState). The
 * window handler copies from the ACTIVE source (the one most recently
 * registered / interacted with), falling through to any other source
 * that has a selection.
 *
 * It must NEVER clobber native copy. The handler defers (no
 * preventDefault, no write) when:
 *   1. focus is in INPUT / TEXTAREA / SELECT / contentEditable —
 *      input selections do NOT appear in window.getSelection(), so we
 *      must hand them to the browser's native input copy;
 *   2. there is a non-empty native DOM selection (plain HTML text);
 *   3. focus is already inside a SequenceView root — its own
 *      onRootKeyDown copies, and we must not double-handle.
 * Only when none of those hold AND an active sequence selection exists
 * do we write it to the clipboard ourselves.
 *
 * Layout-independent: dispatches off `event.code === 'KeyC'` so the
 * Russian layout's «с» on the same physical key still triggers
 * (matches the existing Ctrl+C handler in useSequenceKeyboard).
 */

const SEQUENCE_VIEW_SELECTOR = '[data-testid="sequence-view-root"]';

// Registry. A "source" is `{ getText(mode): string | null }` where
// mode ∈ 'forward' | 'reverse' | 'aa'. Returns the selected text for
// that mode, or null when there is no selection (or the mode does not
// apply — e.g. AA on a non-CDS selection).
const _sources = new Set();
let _active = null;

export function registerCopySource(source) {
  if (!source || typeof source.getText !== 'function') return () => {};
  _sources.add(source);
  _active = source; // newest mount becomes active
  return () => {
    _sources.delete(source);
    if (_active === source) _active = null;
  };
}

export function setActiveCopySource(source) {
  if (source && _sources.has(source)) _active = source;
}

export function _clearCopySourcesForTests() {
  _sources.clear();
  _active = null;
}

// Active source first, then the rest. The first source that yields a
// non-empty string for `mode` wins.
export function getActiveCopyText(mode = 'forward') {
  const order = [];
  if (_active) order.push(_active);
  for (const s of _sources) if (s !== _active) order.push(s);
  for (const s of order) {
    let text = null;
    try { text = s.getText(mode); } catch { text = null; }
    if (text != null && text !== '') return text;
  }
  return null;
}

function isTextInput(target) {
  if (!target || !target.tagName) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

function hasNativeSelection() {
  try {
    if (typeof window === 'undefined' || typeof window.getSelection !== 'function') return false;
    const sel = window.getSelection();
    return !!(sel && String(sel).trim());
  } catch {
    return false;
  }
}

function isInsideSequenceView(target) {
  return !!(target && typeof target.closest === 'function'
    && target.closest(SEQUENCE_VIEW_SELECTOR));
}

export function installGlobalCopyHandler() {
  if (typeof window === 'undefined') return () => {};
  const onKey = (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.code !== 'KeyC') return;
    const t = e.target;
    // (1) editable field → native input copy.
    if (isTextInput(t)) return;
    // (2) plain HTML text selection → native copy.
    if (hasNativeSelection()) return;
    // (3) focus inside a SequenceView → its own handler copies.
    if (isInsideSequenceView(t)) return;
    // (4) copy the active sequence selection, if any.
    const mode = e.shiftKey ? 'aa' : (e.altKey ? 'reverse' : 'forward');
    const text = getActiveCopyText(mode);
    if (text == null) return; // nothing selected — leave default alone
    e.preventDefault();
    try {
      navigator.clipboard?.writeText?.(text);
    } catch {
      /* clipboard unavailable — silently no-op */
    }
  };
  window.addEventListener('keydown', onKey, true);
  return () => window.removeEventListener('keydown', onKey, true);
}
