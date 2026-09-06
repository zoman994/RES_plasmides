import { useCallback, useEffect, useRef } from 'react';

const UNDO_LIMIT = 50;

/**
 * Annotation undo/redo for SingleInspector.
 *
 * Track a rolling stack of pre-edit snapshots. Annotation-only callers push
 * just annotations; molecule edits push sequence + annotations + topology +
 * editLog as one coherent buffer. Undo restores through `onUpdateEdits`. Redo
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
 *   - currentAnnotations/currentSequence/currentTopology/currentEditLog:
 *                    the live buffer used to capture the inverse snapshot
 *   - onUpdateEdits: callback that accepts a transient-buffer patch
 *
 * Returns: { pushSnapshot, undo, redo, hasUndo, hasRedo }.
 */
export function useAnnotationUndoRedo({
  itemKey,
  currentAnnotations,
  currentSequence,
  currentTopology,
  currentEditLog,
  onUpdateEdits,
}) {
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  // Track the live buffer so undo/redo can capture the exact counter-snapshot.
  const currentRef = useRef({
    annotations: currentAnnotations,
    sequence: currentSequence,
    topology: currentTopology,
    editLog: currentEditLog,
  });
  currentRef.current = {
    annotations: currentAnnotations,
    sequence: currentSequence,
    topology: currentTopology,
    editLog: currentEditLog,
  };

  useEffect(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
  }, [itemKey]);

  // `beforeSequence` marks a coherent molecule snapshot. Annotation-only
  // callers omit it, so sequence/topology/provenance remain untouched.
  const pushSnapshot = useCallback((before, beforeSequence, beforeTopology, beforeEditLog) => {
    if (!Array.isArray(before)) return;
    const coherent = beforeSequence !== undefined;
    undoStackRef.current = [
      ...undoStackRef.current.slice(-UNDO_LIMIT + 1),
      {
        annotations: before,
        coherent,
        ...(coherent ? {
          sequence: beforeSequence,
          topology: beforeTopology,
          editLog: beforeEditLog,
        } : {}),
      },
    ];
    redoStackRef.current = [];
  }, []);

  const restore = useCallback((snap) => {
    if (!onUpdateEdits || !snap) return;
    onUpdateEdits({
      editedAnnotations: snap.annotations,
      ...(snap.sequence !== undefined ? { editedSequence: snap.sequence } : {}),
      ...(snap.topology !== undefined ? { editedTopology: snap.topology } : {}),
      ...(snap.editLog !== undefined ? { editLog: snap.editLog } : {}),
    });
  }, [onUpdateEdits]);

  const counterSnapshot = useCallback((template) => ({
    annotations: currentRef.current.annotations,
    coherent: !!template.coherent,
    ...(template.coherent ? {
      sequence: currentRef.current.sequence,
      topology: currentRef.current.topology,
      editLog: currentRef.current.editLog,
    } : {}),
  }), []);

  const undo = useCallback(() => {
    if (!onUpdateEdits) return;
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const prev = stack[stack.length - 1];
    undoStackRef.current = stack.slice(0, -1);
    redoStackRef.current = [...redoStackRef.current, counterSnapshot(prev)];
    restore(prev);
  }, [counterSnapshot, onUpdateEdits, restore]);

  const redo = useCallback(() => {
    if (!onUpdateEdits) return;
    const stack = redoStackRef.current;
    if (stack.length === 0) return;
    const next = stack[stack.length - 1];
    redoStackRef.current = stack.slice(0, -1);
    undoStackRef.current = [...undoStackRef.current, counterSnapshot(next)];
    restore(next);
  }, [counterSnapshot, onUpdateEdits, restore]);

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
