/**
 * useSequenceSelection — shared controlled-selection orchestration for
 * every SequenceView call-site (SPEC_VIEWER_UNIFICATION 21.05.2026).
 *
 * Until now each call-site (RangePickerModal, ContainerEditorSkeleton,
 * AssemblyShellBody, PcrModeShell, Library SingleInspector) hand-rolled
 * its own copy of caretPos/caretAnchor/selectionMode/selectionStrand +
 * onCaretChange / onSelectRange / onRestrictionClick. The copies drifted
 * (drag-grace duplicated, RE behaviour diverged). This hook is the
 * single source of truth for the BASE selection mechanics; CONTEXT is a
 * parameter, never a forked copy.
 *
 * BASE (identical everywhere): caret state, drag-select, drag-grace
 * (250 ms anti-bug — a short fast drag must not collapse the selection
 * on the synthetic trailing click), feature-click select, AA-mode,
 * acquisitionMethod tracking.
 *
 * CONTEXT (parameters, not copies):
 *   - `reBehavior`: RE-site click strategy.
 *       'pair-select' — V88 two-click [cutA,cutB] fragment selection
 *                       (firstRESite pairing, snap on cut coords,
 *                       acquisitionMethod='restriction'). Fires
 *                       `onPairCommit({start,end,...})`.
 *       'cut'         — "cut here" tool. Fires `onCutHere(site, event)`;
 *                       the call-site owns the popover + cut dispatch
 *                       (no skeleton-state import inside the hook).
 *       'off'         — Library / Importer: RE display-only, no-op.
 *   - `onAfterCaret(pos, opts)` / `onAfterSelect({start,end,mode,strand})`
 *     — optional side-effects (e.g. pendingScroll) the call-site adds.
 *   - `resetKey` — caret resets to `initialCaret` when this changes
 *     (item/container switch).
 *
 * The hook OWNS the controlled props SequenceTab consumes; the call-site
 * spreads the returned handlers and feeds its own context props
 * (primers / showSelectionTm / outOfRangeMask source / etc).
 */
import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';

export const DRAG_GRACE_MS = 250;

export function useSequenceSelection({
  initialCaret = null,
  resetKey = null,
  dragGraceMs = DRAG_GRACE_MS,
  reBehavior = 'off',
  reEnzymes = null,
  onPairCommit = null,
  onCutHere = null,
  onAfterCaret = null,
  onAfterSelect = null,
} = {}) {
  const [caretPos, setCaretPos] = useState(initialCaret);
  const [caretAnchor, setCaretAnchor] = useState(initialCaret);
  const [selectionMode, setSelectionMode] = useState('dna');
  const [selectionStrand, setSelectionStrand] = useState(1);
  const [acquisitionMethod, setAcquisitionMethod] = useState('undefined');

  // drag-grace: a short fast drag may not fire pointermove, so
  // pointerMovedRef in SequenceView.useSelectionState never flips true
  // → the trailing synthetic click reaches onCaretChange with
  // extendSelection:false and collapses the freshly-made selection.
  // We ignore non-extend caretChange for `dragGraceMs` after the last
  // extend.
  const lastExtendAtRef = useRef(0);

  // RE pair-select (V88) — ref so the handler always reads fresh value
  // regardless of SequenceLine.React.memo glue staleness; state for the
  // UI hint mirror.
  const firstRESiteRef = useRef(null);
  const [firstRESite, setFirstRESiteState] = useState(null);
  const setFirstRESite = useCallback((next) => {
    firstRESiteRef.current = next;
    setFirstRESiteState(next);
  }, []);
  // A30 (audit) — clear a pending first-RE-click so a non-RE override (feature
  // pick / numeric edit / RC toggle) doesn't leave the «кликни второй RE» hint stuck.
  const clearFirstRESite = useCallback(() => setFirstRESite(null), [setFirstRESite]);

  // Reset caret on item switch. initialCaret intentionally excluded
  // from deps — only resetKey drives the reset (matches the existing
  // per-call-site `useEffect(..., [itemKey])`).
  useEffect(() => {
    setCaretPos(initialCaret);
    setCaretAnchor(initialCaret);
    setSelectionMode('dna');
    setAcquisitionMethod('undefined');
    firstRESiteRef.current = null;
    setFirstRESiteState(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const onCaretChange = useCallback((pos, opts) => {
    if (typeof pos !== 'number' || !Number.isFinite(pos)) return;
    const isExtending = !!(opts && opts.extendSelection);
    if (!isExtending) {
      const sinceExtend = Date.now() - lastExtendAtRef.current;
      if (sinceExtend < dragGraceMs) return;
    }
    setCaretPos(pos);
    if (isExtending) {
      lastExtendAtRef.current = Date.now();
    } else {
      setCaretAnchor(pos);
      setSelectionMode('dna');
    }
    firstRESiteRef.current = null;
    setFirstRESiteState(null);
    setAcquisitionMethod('cursor');
    onAfterCaret?.(pos, opts);
  }, [dragGraceMs, onAfterCaret]);

  const onSelectRange = useCallback((start, end, mode, strand) => {
    if (typeof start !== 'number' || typeof end !== 'number') return;
    if (!Number.isFinite(start) || !Number.isFinite(end)) return;
    if (end <= start) return;
    setCaretAnchor(start);
    setCaretPos(end);
    setSelectionMode(mode === 'aa' ? 'aa' : 'dna');
    setSelectionStrand(strand === -1 ? -1 : 1);
    firstRESiteRef.current = null;
    setFirstRESiteState(null);
    setAcquisitionMethod('cursor');
    onAfterSelect?.({ start, end, mode, strand });
  }, [onAfterSelect]);

  const onRestrictionClick = useCallback((site, e) => {
    if (reBehavior === 'cut') {
      onCutHere?.(site, e);
      return;
    }
    if (reBehavior !== 'pair-select') return; // 'off' — display-only
    if (!site || typeof site.position !== 'number') return;
    const stored = firstRESiteRef.current;
    if (stored && stored.position !== site.position) {
      // V155 — `site.position` is ALREADY the top-strand cut (flattenSites adds
      // cut[0]), so the fragment between the two cuts is just [posA, posB]. The
      // old `+ cut[0]` double-offset placed the selection (and the inserted
      // fragment) one base PAST the cut.
      const lo = Math.min(stored.position, site.position);
      const hi = Math.max(stored.position, site.position);
      setCaretAnchor(lo);
      setCaretPos(hi);
      firstRESiteRef.current = null;
      setFirstRESiteState(null);
      setAcquisitionMethod('restriction');
      onPairCommit?.({
        start: lo,
        end: hi,
        firstEnzyme: stored.enzyme,
        firstPosition: stored.position,
        secondEnzyme: site.enzyme,
        secondPosition: site.position,
      });
      return;
    }
    // First click — mark the CUT + highlight the recognition site, WITHOUT
    // making a sequence selection (Игорь 21.06: clicking an RE shows the cut /
    // recognition site, it is NOT a range select). The cut bar is drawn by the
    // reSites overlay + the highlight; the fragment comes from the 2nd click or
    // the digest gel.
    firstRESiteRef.current = site;
    setFirstRESiteState(site);
    setAcquisitionMethod('restriction');
  }, [reBehavior, onCutHere, onPairCommit]);

  // Derived half-open selection [min, max]. null when no selection.
  const selStart = (Number.isFinite(caretAnchor) && Number.isFinite(caretPos))
    ? Math.min(caretAnchor, caretPos) : null;
  const selEnd = (Number.isFinite(caretAnchor) && Number.isFinite(caretPos))
    ? Math.max(caretAnchor, caretPos) : null;
  const hasSelection = selStart != null && selEnd != null && selEnd > selStart;

  // Convenience bundle to spread onto SequenceTab (controlled props +
  // handlers). Call-site adds its own context props alongside.
  const viewerProps = useMemo(() => ({
    caretPos,
    caretAnchor,
    selectionMode,
    selectionStrand,
    onCaretChange,
    onSelectRange,
  }), [caretPos, caretAnchor, selectionMode, selectionStrand, onCaretChange, onSelectRange]);

  return {
    caretPos,
    caretAnchor,
    selectionMode,
    selectionStrand,
    acquisitionMethod,
    firstRESite,
    clearFirstRESite,
    selStart,
    selEnd,
    hasSelection,
    setCaretPos,
    setCaretAnchor,
    setSelectionMode,
    setSelectionStrand,
    setAcquisitionMethod,
    onCaretChange,
    onSelectRange,
    onRestrictionClick,
    viewerProps,
  };
}
