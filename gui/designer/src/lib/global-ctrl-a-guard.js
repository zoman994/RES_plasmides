/**
 * global-ctrl-a-guard.js — Sprint M-X.3 follow-up.
 *
 * Biolog: «можно запретить Ctrl+A везде кроме окна вивера? иногда
 * бывает что выделяю «всё вокруг»». Browser-native Ctrl+A on a
 * BodgeGene canvas / catalog / project shell selects whatever
 * happens to be focused — random page text, list rows, the empty
 * background — leading to a confusing «everything around» visible
 * selection.
 *
 * Install ONE capture-phase listener on `window` that intercepts
 * Ctrl+A / Cmd+A and calls preventDefault EVERYWHERE EXCEPT:
 *   1. inside the SequenceView root (its own keyboard handler
 *      selects the forward strand and we don't want to fight it)
 *   2. inside text inputs / textareas / contentEditable (native
 *      «select all in this input» is the expected behaviour)
 *
 * Layout-independent: dispatches off `event.code === 'KeyA'` so the
 * Russian layout's «ф» on the same physical key still triggers
 * the guard.
 *
 * Returns a teardown function so callers (App.jsx) can detach in
 * unmount cleanup or hot-reload.
 */

const SEQUENCE_VIEW_SELECTOR = '[data-testid="sequence-view-root"]';

function isInsideSequenceView(target) {
  return !!(target && typeof target.closest === 'function'
    && target.closest(SEQUENCE_VIEW_SELECTOR));
}

function isTextInput(target) {
  if (!target || !target.tagName) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  // `isContentEditable` is the cheapest accurate check for
  // contenteditable elements (also true on inherited contexts).
  if (target.isContentEditable) return true;
  return false;
}

export function installGlobalCtrlAGuard() {
  if (typeof window === 'undefined') return () => {};
  const onKey = (e) => {
    // Only intercept Ctrl/Cmd + A.
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.code !== 'KeyA') return;
    const t = e.target;
    if (isInsideSequenceView(t)) return;
    if (isTextInput(t)) return;
    e.preventDefault();
  };
  window.addEventListener('keydown', onKey, true);
  return () => window.removeEventListener('keydown', onKey, true);
}
