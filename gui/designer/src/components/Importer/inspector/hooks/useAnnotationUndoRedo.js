import { useCallback, useEffect, useRef } from 'react';

const UNDO_LIMIT = 50;

/**
 * Annotation undo/redo for SingleInspector.
 *
 * Track a rolling stack of pre-edit annotation snapshots. Each edit
 * pushes the BEFORE-state via `pushSnapshot(before)`; undo pops it
 * back into editedAnnotations through `onUpdateEdits`. The redo
 * stack is populated only when an undo happens; any fresh edit
 * (i.e. a new pushSnapshot call) clears the redo branch — standard
 * editor behaviour.
 *
 * History resets when `itemKey` changes (different plasmid).
 *
 * Bind Ctrl+Z (undo) / Ctrl+Y / Ctrl+Shift+Z (redo) at the window
 * level. Layout-independent (uses e.code so the Russian keyboard's
 * Cyrillic on the same physical keys still fires the hotkeys).
 *
 * Inputs:
 *   - itemKey:       string-ish, identifies the active plasmid
 *   - currentAnnotations: array reflecting the live annotations now
 *                    (so redo can push the «current state» onto the
 *                    redo stack before applying the previous one)
 *   - onUpdateEdits: callback that accepts `{ editedAnnotations }`
 *
 * Returns: { pushSnapshot, undo, redo, hasUndo, hasRedo }.
 */
export function useAnnotationUndoRedo({ itemKey, currentAnnotations, onUpdateEdits }) {
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const currentRef = useRef(currentAnnotations);
  currentRef.current = currentAnnotations;

  useEffect(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
  }, [itemKey]);

  const pushSnapshot = useCallback((before) => {
    if (!Array.isArray(before)) return;
    undoStackRef.current = [
      ...undoStackRef.current.slice(-UNDO_LIMIT + 1),
      before,
    ];
    redoStackRef.current = [];
  }, []);

  const undo = useCallback(() => {
    if (!onUpdateEdits) return;
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const prev = stack[stack.length - 1];
    undoStackRef.current = stack.slice(0, -1);
    redoStackRef.current = [...redoStackRef.current, currentRef.current];
    onUpdateEdits({ editedAnnotations: prev });
  }, [onUpdateEdits]);

  const redo = useCallback(() => {
    if (!onUpdateEdits) return;
    const stack = redoStackRef.current;
    if (stack.length === 0) return;
    const next = stack[stack.length - 1];
    redoStackRef.current = stack.slice(0, -1);
    undoStackRef.current = [...undoStackRef.current, currentRef.current];
    onUpdateEdits({ editedAnnotations: next });
  }, [onUpdateEdits]);

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = e.target;
      if (t && t.tagName) {
        const tag = t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (t.isContentEditable) return;
      }
      if (e.code === 'KeyZ' && !e.shiftKey) {
        if (undoStackRef.current.length === 0) return;
        e.preventDefault();
        undo();
      } else if ((e.code === 'KeyY') || (e.code === 'KeyZ' && e.shiftKey)) {
        if (redoStackRef.current.length === 0) return;
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  return { pushSnapshot, undo, redo };
}
