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
import { generateAnnotationId } from '../../../lib/annotation-edit.js';

/**
 * Bug-rush #6 (04.05.2026 evening): imported annotations parsed from
 * .dna / .gb / SnapGene catalog often arrive without an `id` field.
 * Their region.id at dispatch time is `undefined`, which collapses
 * `matchesAnnotationId` to false → delete / update silently
 * skipped. Resolve a stable id at the dispatch site so the receiver
 * always has something to match against.
 */
function resolveRegionId(region) {
  if (!region) return null;
  if (region.id) return region.id;
  return generateAnnotationId(region);
}

/**
 * Resolve a viewport-coords anchor for the CreateAnnotationPopup
 * near the right edge of the selection's end line. We probe each
 * mounted SequenceLine for `data-line-start` and pick the one
 * containing `selEnd`; the popup is anchored at the line's right
 * edge plus a small offset, with a fallback to the viewer's top-
 * left corner if no line matches (empty viewer / not measured yet).
 *
 * Sprint M-X.2 K9-fix (04.05.2026 evening review): the original
 * implementation hard-coded `containerRef.left + 80, top + 80`,
 * which rendered the popup in the viewer's top-left regardless of
 * where the biolog made the selection — confusing because the
 * popup didn't appear near where the eye was.
 */
export function computePopupAnchor(root, selEnd) {
  if (!root) return { x: 80, y: 80 };
  let rect;
  try { rect = root.getBoundingClientRect(); } catch { return { x: 80, y: 80 }; }
  const fallback = { x: rect.left + 80, y: rect.top + 80 };
  if (typeof selEnd !== 'number' || !Number.isFinite(selEnd)) return fallback;
  const lines = root.querySelectorAll('[data-testid="sequence-view-line"]');
  if (!lines || lines.length === 0) return fallback;
  let target = null;
  let lastStart = -1;
  for (const el of lines) {
    const start = parseInt(el.dataset.lineStart || '', 10);
    if (Number.isNaN(start)) continue;
    if (start <= selEnd && start > lastStart) {
      lastStart = start;
      target = el;
    }
  }
  if (!target) return fallback;
  let lineRect;
  try { lineRect = target.getBoundingClientRect(); } catch { return fallback; }
  // Anchor at the line's right edge plus a small horizontal gap so
  // the popup doesn't overlap the DNA letters; vertically centred
  // on the line so the form sits next to the selection.
  return {
    x: lineRect.right + 8,
    y: lineRect.top,
  };
}

function isFormElement(target) {
  if (!target || !target.tagName) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

/**
 * Find the region the current selection refers to. Two-pass:
 *   1. Exact match (selStart === region.start && selEnd === region.end) —
 *      the canonical case from a feature click.
 *   2. Selection that fully covers a region (selStart ≤ region.start
 *      AND selEnd ≥ region.end). Tolerates the «shift+arrow nudged
 *      the selection by 1 nt» scenario without slipping into the
 *      slippery-slope «delete every region inside the selection».
 *
 * If the second pass finds multiple covered regions, the smallest
 * is returned (least surprising — biolog probably aimed at the
 * tight feature, not its parent operon).
 *
 * Sprint M-X.2 K9-fix (post-K10 review): pre-fix required EXACT
 * coord equality, so a Del after shift+arrow extending the
 * selection by 1 nt was a no-op — biolog: «Del не работает».
 */
function findRegionForSelection(annotations, selStart, selEnd) {
  if (!Array.isArray(annotations)) return null;
  // Exact match first — most common case.
  for (const a of annotations) {
    if (!a || a.level !== 'region') continue;
    if (a.start === selStart && a.end === selEnd) return a;
  }
  // Cover match — pick the smallest covered region.
  let best = null;
  let bestLen = Infinity;
  for (const a of annotations) {
    if (!a || a.level !== 'region') continue;
    if (selStart <= a.start && selEnd >= a.end) {
      const len = a.end - a.start;
      if (len < bestLen) { best = a; bestLen = len; }
    }
  }
  return best;
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
      const region = findRegionForSelection(annotations, selStart, selEnd);
      if (!region) return false; // selection not aligned to a region — no-op
      e.preventDefault();
      onAnnotationEdit?.({ kind: 'delete', id: resolveRegionId(region) });
      return true;
    }

    if (e.key === 'h' || e.key === 'H' || e.key === 'р' || e.key === 'Р') {
      // 'h' / 'H' (Latin) + 'р' / 'Р' (Cyrillic, same physical key
      // on Russian layout). Plain alpha keys give us e.key but not
      // a stable physical mapping without modifiers — accept both.
      e.preventDefault();
      // _ctxAnchor — synthesised when the create command comes
      // from the right-click context menu (so the popup opens at
      // the click location, not the line edge).
      const anchor = e._ctxAnchor
        ? e._ctxAnchor
        : computePopupAnchor(containerRef?.current, selEnd);
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
      const region = findRegionForSelection(annotations, selStart, selEnd);
      if (!region) return false;
      e.preventDefault();
      // Stamp a resolved id so EditAnnotationModal -> applyAnnotationEdit
      // 'update' dispatch lands on the right annotation even when the
      // import omitted the id (bug-rush #6).
      setEditModalAnnotation({ ...region, id: resolveRegionId(region) });
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
