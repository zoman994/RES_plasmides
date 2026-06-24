import { useEffect } from 'react';
import { useStore } from '../../../store';

/**
 * Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z for the align reference editor (Игорь —
 * «Ctrl+Z должен работать везде»). Window-level, layout-independent (`e.code`
 * so the Cyrillic keys on the same physical buttons still fire). Bails when
 * focus sits in a real text field (INPUT/TEXTAREA/SELECT/contentEditable) so
 * those keep their native undo. The align SequenceView grid is a plain
 * focusable <div> (tabIndex), so editing there still routes here.
 *
 * Only mounts with AlignResultView (the align workspace is active), so it can't
 * clash with the Library annotation undo hook — they live in different views.
 */
export function useAlignUndoRedo() {
  const undoAlignEdit = useStore((s) => s.undoAlignEdit);
  const redoAlignEdit = useStore((s) => s.redoAlignEdit);

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = e.target;
      if (t && t.tagName) {
        const tag = t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (t.isContentEditable) return;
      }
      const st = useStore.getState().align;
      if (e.code === 'KeyZ' && !e.shiftKey) {
        if (!st.editPast.length) return;
        e.preventDefault();
        undoAlignEdit();
      } else if (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey)) {
        if (!st.editFuture.length) return;
        e.preventDefault();
        redoAlignEdit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undoAlignEdit, redoAlignEdit]);
}
