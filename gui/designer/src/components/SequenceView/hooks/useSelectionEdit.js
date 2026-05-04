/**
 * useSelectionEdit — Sprint M-X.2 K3 keyboard handlers for editing
 * annotations from inside SequenceView.
 *
 * Three keys:
 *   Del → delete the selected region (DEC-ANN-06).
 *           Selection must EXACTLY equal a region's start..end (the
 *           feature-click path sets selection to whole region). If
 *           the selection doesn't cover a region, Del is a no-op —
 *           we don't delete every region that overlaps the
 *           selection (slippery slope).
 *
 *   H   → open CreateAnnotationPopup with the selection as the
 *           initial coords (DEC-ANN-03). No-op when selection is
 *           empty.
 *
 *   E   → open EditAnnotationModal for the currently-selected
 *           region (DEC-ANN-04). No-op when selection is empty or
 *           doesn't cover a region exactly.
 *
 * Returns:
 *   {
 *     handleKeyDown(e) → boolean          // true if handled
 *     createPopupState                    // { selectionStart, selectionEnd, anchor:{x,y} } | null
 *     closeCreatePopup()
 *     editModalAnnotation                 // annotation | null
 *     closeEditModal()
 *   }
 *
 * Ignores key events when the focused element is an input / textarea
 * / contenteditable — biolog typing into the popup's name field
 * shouldn't trigger Del-as-delete.
 */

import { useCallback, useState } from 'react';

function isFormElement(target) {
  if (!target || !target.tagName) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

/**
 * Find the region whose [start, end) exactly matches the
 * selection range. Returns null if no exact match.
 */
function findRegionExact(annotations, selStart, selEnd) {
  if (!Array.isArray(annotations)) return null;
  for (const a of annotations) {
    if (!a || a.level !== 'region') continue;
    if (a.start === selStart && a.end === selEnd) return a;
  }
  return null;
}

export function useSelectionEdit({
  annotations,
  caretPos,
  caretAnchor,
  onAnnotationEdit,
  containerRef,
}) {
  const [createPopupState, setCreatePopupState] = useState(null);
  const [editModalAnnotation, setEditModalAnnotation] = useState(null);

  const closeCreatePopup = useCallback(() => setCreatePopupState(null), []);
  const closeEditModal = useCallback(() => setEditModalAnnotation(null), []);

  const handleKeyDown = useCallback((e) => {
    if (isFormElement(e.target)) return false;
    if (e.ctrlKey || e.metaKey || e.altKey) return false;

    const a = (typeof caretAnchor === 'number' && Number.isFinite(caretAnchor)) ? caretAnchor : null;
    const f = (typeof caretPos === 'number' && Number.isFinite(caretPos)) ? caretPos : null;
    const hasSelection = a != null && f != null && a !== f;
    if (!hasSelection) return false;
    const selStart = Math.min(a, f);
    const selEnd = Math.max(a, f);

    if (e.key === 'Delete' || e.key === 'Backspace') {
      const region = findRegionExact(annotations, selStart, selEnd);
      if (!region) return false; // selection not aligned to a region — no-op
      e.preventDefault();
      onAnnotationEdit?.({ kind: 'delete', id: region.id });
      return true;
    }

    if (e.key === 'h' || e.key === 'H' || e.key === 'р' || e.key === 'Р') {
      // 'h' / 'H' (Latin) + 'р' / 'Р' (Cyrillic, same physical key
      // on Russian layout) — biolog 04.05.2026: Russian layout
      // means 'h' is рендер'd as Cyrillic «р», so accept both
      // characters for the same hotkey just like Ctrl+C uses
      // e.code. Plain alpha keys give us e.key but not a stable
      // physical mapping when typing without modifiers, so we
      // accept both characters.
      e.preventDefault();
      const root = containerRef?.current;
      // Anchor the popup near the right edge of the selection by
      // probing the per-line caret column for the selection's end.
      // Cheap approximation: use containerRef bounding rect + a
      // fixed offset; the popup re-clamps inside the viewport.
      let anchor = { x: 80, y: 80 };
      try {
        if (root) {
          const r = root.getBoundingClientRect();
          anchor = { x: r.left + 80, y: r.top + 80 };
        }
      } catch { /* noop */ }
      setCreatePopupState({
        selectionStart: selStart,
        selectionEnd: selEnd,
        anchor,
      });
      return true;
    }

    if (e.key === 'e' || e.key === 'E' || e.key === 'у' || e.key === 'У') {
      // 'e' / 'E' Latin + Cyrillic 'у' / 'У' (same physical key on
      // Russian layout). E only triggers when selection covers a
      // region exactly — otherwise nothing to edit.
      const region = findRegionExact(annotations, selStart, selEnd);
      if (!region) return false;
      e.preventDefault();
      setEditModalAnnotation(region);
      return true;
    }

    return false;
  }, [annotations, caretPos, caretAnchor, onAnnotationEdit, containerRef]);

  return {
    handleKeyDown,
    createPopupState,
    closeCreatePopup,
    editModalAnnotation,
    closeEditModal,
  };
}
