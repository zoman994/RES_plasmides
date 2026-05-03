/**
 * lib/row-selection-isolation.js — per-track text-selection scoping for
 * the SequenceView strand + AA tracks (DNA-first layout follow-up,
 * 03.05.2026 evening; revised twice based on biolog feedback the same
 * evening).
 *
 * Goal: drag-to-select stays inside ONE conceptual track (e.g. forward
 * strand, reverse strand, or one specific AA frame) but EXTENDS across
 * line wraps. Dragging from forward strand at line 5 down to forward
 * strand at line 7 should produce a continuous forward-strand
 * selection, skipping the reverse strand / annotation / AA tracks of
 * intermediate lines.
 *
 * Why it works without redrawing the selection: browsers honour
 * `user-select: none` when computing the SELECTED TEXT via
 * `Selection.toString()` — text inside `none` elements is excluded
 * from the copy buffer (and Chromium visually skips the highlight on
 * those elements during drag). So if we mark every row OUTSIDE the
 * active scope as unselectable during the drag, the native selection
 * API does the rest: the user can drag freely vertically, but the
 * visual highlight + clipboard pull only the matching-scope text —
 * wrapped across lines.
 *
 * Iteration history (one evening):
 *   1) Range-clamping per row → too tight, drag couldn't extend down.
 *   2) Toggle user-select on others, restore on mouseup → on mouseup
 *      the browser RE-RENDERS the selection visualization with all
 *      rows unblocked, suddenly highlighting the whole intervening
 *      region. Biolog: «после того как отпускаешь кнопку выделяются
 *      всё равно все строки (но пока тянешь все ок)».
 *   3) (current) Toggle user-select on others, KEEP it after mouseup.
 *      Restoration only happens on the next mousedown — either inside
 *      a different scope (re-toggle for the new active scope) or
 *      outside any scope (full restore). The visual selection from
 *      the previous drag stays clean indefinitely until a fresh
 *      mousedown.
 *
 * Why dynamic JS rather than static CSS: scopes are per-frame /
 * per-strand and there's a combinatorial number of them; embedding
 * `[data-active-scope="aa-1-0"] [data-row-selection-scope]:not(...)`
 * for every (strand, frame) pair is brittle, and CSS `attr()` in
 * selectors isn't shipped. Inline-style toggling on `mousedown` is
 * the simplest portable form.
 *
 * Decorative tracks (RulerTrack, AnnotationTrack, PrimerTrack,
 * RestrictionTrack) carry their OWN permanent
 * `userSelect: 'none'` — their content (position numbers, feature
 * names, primer arrows, enzyme labels) is never copyable. The hook
 * only handles INTER-track selection isolation between the
 * selectable tracks (forward strand, reverse strand, AA frames).
 *
 * Usage:
 *
 *   const containerRef = useRef(null);
 *   useRowSelectionIsolation(containerRef);
 *   ...
 *   <div ref={containerRef}>
 *     <div data-row-selection-scope="strand-top">{forward strand row}</div>
 *     <div data-row-selection-scope="strand-bottom">{reverse strand row}</div>
 *     <div data-row-selection-scope="aa-1-0">{AA frame +1 row}</div>
 *     ...
 *   </div>
 */

import { useEffect } from "react";

export function useRowSelectionIsolation(containerRef) {
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return undefined;
    if (typeof window === "undefined") return undefined;

    // Tracks the CURRENT active scope (e.g. "strand-top") and the list
    // of rows whose inline `userSelect` we modified. Persists ACROSS
    // mouseup — the visual selection from the previous drag stays
    // intact until the user starts a new mousedown.
    let activeScope = null;
    let restoreList = [];

    const restoreAll = () => {
      for (const [el, prev, prevWebkit] of restoreList) {
        el.style.userSelect = prev;
        el.style.webkitUserSelect = prevWebkit;
      }
      restoreList = [];
      activeScope = null;
    };

    const applyScope = (scope) => {
      if (activeScope === scope && restoreList.length > 0) {
        // Same scope as currently applied — nothing to do; the
        // existing inline-styles are still correct.
        return;
      }
      // Different scope (or first apply) — restore previous, then
      // apply the new one fresh.
      restoreAll();
      const all = root.querySelectorAll("[data-row-selection-scope]");
      const changed = [];
      for (const other of all) {
        if (other.getAttribute("data-row-selection-scope") === scope) continue;
        changed.push([other, other.style.userSelect, other.style.webkitUserSelect]);
        other.style.userSelect = "none";
        // WebkitUserSelect mirror — older Chromium / Safari builds
        // still consult the prefixed property for the "skip on copy"
        // behaviour, even though the unprefixed standard is shipped.
        other.style.webkitUserSelect = "none";
      }
      activeScope = scope;
      restoreList = changed;
    };

    const onMouseDown = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        restoreAll();
        return;
      }
      const row = target.closest("[data-row-selection-scope]");
      if (!row || !root.contains(row)) {
        // Mousedown OUTSIDE any scoped row — user is starting a new
        // interaction (clicking on an annotation, an empty area,
        // dismissing the previous selection, etc.). Restore default
        // user-select on every previously-blocked row so the next
        // drag (in any scope) starts from a clean slate.
        restoreAll();
        return;
      }
      const scope = row.getAttribute("data-row-selection-scope");
      if (!scope) {
        restoreAll();
        return;
      }
      applyScope(scope);
    };

    root.addEventListener("mousedown", onMouseDown);

    return () => {
      restoreAll();
      root.removeEventListener("mousedown", onMouseDown);
    };
  }, [containerRef]);
}
