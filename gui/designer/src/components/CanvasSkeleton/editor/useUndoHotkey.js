/**
 * useUndoHotkey — Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z for the canvas editor
 * (Игорь — «Ctrl+Z должен работать везде»). The skeleton-history engine
 * already exists (DEC-CANVAS-ASM-UX-13) but was reachable only via the toolbar
 * ↶/↷ buttons; this binds the keyboard to it.
 *
 * Mounted once inside EditorWindowShell, so it is live only while the editor is
 * open. Gated like useTabHotkey: ignored when focus is in an editable field, or
 * when a modal is open ([data-modal-open]). Layout-independent (`e.code` so the
 * Cyrillic keys on the same physical buttons still fire). Only preventDefault +
 * act when there is actually something to undo/redo.
 */
import { useEffect } from 'react';

function isEditableTarget(t) {
  if (!t || !t.tagName) return false;
  const tag = t.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (t.isContentEditable) return true;
  return false;
}

export default function useUndoHotkey({ onUndo, onRedo, canUndo, canRedo }) {
  useEffect(() => {
    function onKeyDown(e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (isEditableTarget(e.target)) return;
      if (typeof document !== 'undefined' && document.querySelector('[data-modal-open]')) return;
      if (e.code === 'KeyZ' && !e.shiftKey) {
        if (!canUndo) return;
        e.preventDefault();
        onUndo?.();
      } else if (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey)) {
        if (!canRedo) return;
        e.preventDefault();
        onRedo?.();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onUndo, onRedo, canUndo, canRedo]);
}
