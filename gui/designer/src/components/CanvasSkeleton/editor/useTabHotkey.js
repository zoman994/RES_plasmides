/**
 * useTabHotkey — TAB / Shift+TAB editor-tab switching.
 *
 * F1 M-CANVAS-WINDOW (DEC-CANVAS-WIN-07). Mounted once inside
 * EditorWindowShell, so it is live only while the editor is open.
 * Gated like DeleteKeyHandler: ignored when focus is in an editable
 * target, or when a modal is open ([data-modal-open] — best-effort).
 */
import { useEffect } from 'react';

function isEditableTarget(t) {
  if (!t || !t.tagName) return false;
  const tag = t.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (t.isContentEditable) return true;
  return false;
}

export default function useTabHotkey({ onNext, onPrev }) {
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== 'Tab') return;
      if (isEditableTarget(e.target)) return;
      if (
        typeof document !== 'undefined'
        && document.querySelector('[data-modal-open]')
      ) {
        return;
      }
      e.preventDefault();
      if (e.shiftKey) onPrev?.();
      else onNext?.();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onNext, onPrev]);
}
