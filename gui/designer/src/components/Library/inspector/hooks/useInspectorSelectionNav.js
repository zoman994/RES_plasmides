/**
 * useInspectorSelectionNav — caret / selection / LinearFeatureBar
 * navigation extracted VERBATIM from LibrarySingleInspector
 * (decomposition 18.05.2026 — the file reached 39.34 / 40 KB hard;
 * Игорь: «декомпозируй его»). Behaviour is unchanged: this is a pure
 * move so the inspector stays under the size budget. The full Vitest
 * suite is the regression guard for this refactor.
 *
 * Owns: cursorPos/Anchor/SelectionMode/SelectionStrand + pendingScroll,
 * the rAF-coalesced drag-scrub (PERF-3) with the `caret-gliding` body
 * class, and the bar-settle / bar-scrub / caret / feature-select
 * callbacks. Resets the cursor on item switch.
 */
import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import { useStore } from '../../../../store';
import { useSequenceSelection } from '../../../../hooks/useSequenceSelection';

export function useInspectorSelectionNav({ activeTab, onActiveTabChange, itemKey }) {
  // SPEC_VIEWER_UNIFICATION — core controlled selection (caret/anchor/
  // mode/strand + onCaretChange w/ drag-grace + onSelectRange) now
  // delegates to the shared hook. Library-specific bits stay here:
  // LinearFeatureBar scrub (onBarSettle/onBarScrub), pendingScroll,
  // and the scrollOnFeatureClick gate (fed via onAfterCaret/Select).
  const sel = useSequenceSelection({
    initialCaret: null,
    resetKey: itemKey,
    reBehavior: 'off',
    onAfterCaret: (pos, opts) => {
      if (opts && opts.needsScroll === false) return;
      setPendingScroll({ pos, tick: Date.now(), instant: true });
    },
    onAfterSelect: ({ start }) => {
      const scrollOn = useStore.getState().sequenceView?.scrollOnFeatureClick;
      if (scrollOn !== false) {
        setPendingScroll({ pos: start, tick: Date.now(), instant: false });
      }
    },
  });
  const setCursorPos = sel.setCaretPos;
  const setCursorAnchor = sel.setCaretAnchor;
  // Pending scroll request from LinearFeatureBar — bar click/drag
  // queues absolute pos, SequenceTab consumes + clears. `tick` bumps
  // even on repeat positions. instant:true → behavior:'auto'.
  const [pendingScroll, setPendingScroll] = useState(null);

  // Caret / selection state now lives in the shared hook (`sel`):
  //   cursorPos        = sel.caretPos
  //   cursorAnchor     = sel.caretAnchor
  //   cursorSelectionMode   = sel.selectionMode
  //   cursorSelectionStrand = sel.selectionStrand
  const setCursorSelectionMode = sel.setSelectionMode;

  // Click / pointer-up settle from the bar — final position. Switch
  // to Sequence tab if biolog initiated from Overview, then queue
  // a smooth scroll to land the viewer there. Bar interactions
  // ALWAYS collapse selection (anchor = focus = pos) — biolog hasn't
  // asked for shift-click on the bar so we keep its UX simple.
  const onBarSettle = useCallback((pos) => {
    if (typeof pos !== 'number' || !Number.isFinite(pos)) return;
    // 2026-05-06 — biolog: «при нажатии на колбасу в аннотаторе стало
    // отправлять сразу обратно на сиквенс вью». Tab strip click used
    // to force-switch to Sequence regardless of context. Now: jumping
    // back to Sequence happens only from Overview / History (where
    // there's no inline sequence view). The Annotations tab embeds
    // its own sequence preview, so we keep biolog there and let
    // PreviewTab consume the same `cursorPos` to highlight the click.
    if (activeTab !== 'sequence' && activeTab !== 'annotations') {
      onActiveTabChange?.('sequence');
    }
    setCursorPos(pos);
    setCursorAnchor(pos);
    setCursorSelectionMode('dna');
    setPendingScroll({ pos, tick: Date.now(), instant: false });
  }, [activeTab, onActiveTabChange]);

  // Live drag scrub — fires every pointermove (≥100/sec on a
  // touchpad). PERF-3 (06.05.2026 biolog feedback): without
  // coalescing, every move kicks 4 setState calls + a full
  // SequenceView re-render. rAF-coalesce reduces it to one batch
  // per animation frame: the latest pos goes into a ref, an rAF
  // tick reads + flushes once. Cursor updates and pendingScroll
  // both stay sub-frame; the visible jitter biolog reports goes
  // away because we no longer ship 6+ React passes per frame.
  const scrubFrameRef = useRef(null);
  const scrubLatestRef = useRef(null);
  // 06.05.2026 round 5 — body.caret-gliding gates the caret CSS
  // transition. Set on each scrub-rAF tick, cleared 120 ms after
  // the last tick (`scrubGlideTimerRef`). Keyboard nav and clicks
  // bypass this path entirely so the caret stays instant for
  // discrete movements; only continuous drag-scrub gets the glide.
  const scrubGlideTimerRef = useRef(null);
  useEffect(() => () => {
    if (scrubFrameRef.current != null) {
      cancelAnimationFrame(scrubFrameRef.current);
      scrubFrameRef.current = null;
    }
    if (scrubGlideTimerRef.current != null) {
      clearTimeout(scrubGlideTimerRef.current);
      scrubGlideTimerRef.current = null;
    }
    if (typeof document !== 'undefined') {
      document.body.classList.remove('caret-gliding');
    }
  }, []);
  const onBarScrub = useCallback((pos) => {
    if (typeof pos !== 'number' || !Number.isFinite(pos)) return;
    scrubLatestRef.current = pos;
    if (scrubFrameRef.current != null) return; // already scheduled
    scrubFrameRef.current = requestAnimationFrame(() => {
      scrubFrameRef.current = null;
      const next = scrubLatestRef.current;
      if (next == null) return;
      setCursorPos(next);
      setCursorAnchor(next);
      sel.setSelectionMode('dna');
      if (activeTab === 'sequence' || activeTab === 'annotations') {
        setPendingScroll({ pos: next, tick: Date.now(), instant: true });
      }
      // Engage caret glide for the duration of this scrub burst.
      if (typeof document !== 'undefined') {
        document.body.classList.add('caret-gliding');
        if (scrubGlideTimerRef.current != null) clearTimeout(scrubGlideTimerRef.current);
        scrubGlideTimerRef.current = setTimeout(() => {
          document.body.classList.remove('caret-gliding');
          scrubGlideTimerRef.current = null;
        }, 120);
      }
    });
  }, [activeTab]);

  // Keyboard caret nav + feature-click select now come from the shared
  // hook (`sel.onCaretChange` / `sel.onSelectRange`). The hook builds
  // in drag-grace + AA-mode handling; the pendingScroll / scroll-on-
  // feature-click side-effects are fed via the onAfterCaret /
  // onAfterSelect callbacks passed at the top of this hook.
  const onCaretChangeFromView = sel.onCaretChange;
  const onSelectRangeFromView = sel.onSelectRange;

  const onPendingScrollHandled = useCallback(() => setPendingScroll(null), []);

  // Force a scroll to `pos` regardless of the `scrollOnFeatureClick` gate — used by
  // the global-search JUMP (which must always land the viewer on the hit), separate
  // from the feature-click scroll which honours the setting.
  const scrollToPos = useCallback((pos, opts) => {
    if (typeof pos === 'number' && Number.isFinite(pos)) {
      setPendingScroll({ pos, tick: Date.now(), instant: !!(opts && opts.instant) });
    }
  }, []);

  // Caret reset on plasmid switch is handled by the shared hook
  // (resetKey={itemKey}); pendingScroll reset stays local.
  useEffect(() => {
    setPendingScroll(null);
  }, [itemKey]);

  return {
    pendingScroll,
    cursorPos: sel.caretPos,
    cursorAnchor: sel.caretAnchor,
    cursorSelectionMode: sel.selectionMode,
    cursorSelectionStrand: sel.selectionStrand,
    setCursorPos,
    setCursorAnchor,
    onBarSettle,
    onBarScrub,
    onCaretChangeFromView,
    onSelectRangeFromView,
    onPendingScrollHandled,
    scrollToPos,
  };
}
