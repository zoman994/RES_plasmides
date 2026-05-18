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

export function useInspectorSelectionNav({ activeTab, onActiveTabChange, itemKey }) {
  // Pending scroll request from LinearFeatureBar — bar click/drag
  // queues absolute pos, SequenceTab consumes + clears. `tick` bumps
  // even on repeat positions. instant:true → behavior:'auto'.
  const [pendingScroll, setPendingScroll] = useState(null);

  // Cursor marker on the strip — persistent (last set position) even
  // after the scroll is applied + pendingScroll cleared. Lets the
  // biolog visually see where the last navigation landed AND drives
  // the scrubber thumb on the bar (drag updates this state, the bar
  // re-renders the cursor at the new x).
  const [cursorPos, setCursorPos] = useState(null);
  // Selection anchor — the OTHER end of the selection range. When
  // anchor === cursorPos, no selection. When they differ, the range
  // [min(anchor,cursor)..max(anchor,cursor)] is highlighted on the
  // SequenceView and copyable via Ctrl+C (forward strand) /
  // Ctrl+Alt+C (reverse complement). Set/extended by SequenceView's
  // shift-arrow keys; collapsed on plain caret moves.
  const [cursorAnchor, setCursorAnchor] = useState(null);
  // Selection mode — 'aa' when biolog clicked an AA cell to select
  // its underlying triplet, 'dna' otherwise. Drives whether Copy AA
  // (Ctrl+Shift+C / context menu) is reachable: biolog 04.05.2026
  // evening: «"копировать АА" можно только если ты выделяешь
  // непосредственно АА сиквенс».
  const [cursorSelectionMode, setCursorSelectionMode] = useState(null);
  // Strand of the selected CDS feature (1 forward / -1 reverse) —
  // needed by Copy AA to know whether to reverse-complement the
  // slice before translating. lacZα and friends sit on the reverse
  // strand and translating the top-strand slice directly gives
  // gibberish (biolog 04.05.2026 evening lab session).
  const [cursorSelectionStrand, setCursorSelectionStrand] = useState(1);

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
      setCursorSelectionMode('dna');
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

  // Keyboard caret nav inside SequenceView (arrow keys etc.). Same
  // shape as `onBarSettle` but always uses the instant scroll
  // behavior — smooth animation can't keep up with held arrow keys.
  //
  // `opts.extendSelection` — set by SequenceView when biolog held
  // Shift while pressing an arrow / Home / End / PageUp / PageDown.
  // True ⇒ anchor stays where it was, focus moves (extends the
  // selection range). False ⇒ collapse, anchor = focus.
  // `opts.needsScroll === false` — caret stayed on the same line so
  // skip the scrollIntoView call.
  const onCaretChangeFromView = useCallback((pos, opts) => {
    if (typeof pos !== 'number' || !Number.isFinite(pos)) return;
    setCursorPos(pos);
    if (!opts || !opts.extendSelection) {
      setCursorAnchor(pos);
      // Plain caret moves (no shift) collapse selection AND drop
      // back to DNA mode — biolog explicitly leaves AA territory by
      // pressing arrow without shift.
      setCursorSelectionMode('dna');
    }
    // Shift+arrow extends selection AND PRESERVES the current mode:
    // an AA selection stays 'aa' so the blue overlay + Copy AA
    // hotkey remain valid as the user walks codon-by-codon (biolog
    // 04.05.2026 evening: «с зажатым шифтом идёшь по АК … выделяются
    // триплетами»). DNA-mode shift+arrow keeps DNA mode by default
    // (no mode change in this branch).
    if (opts && opts.needsScroll === false) return;
    setPendingScroll({ pos, tick: Date.now(), instant: true });
  }, []);

  // Feature click in the SequenceView (biolog 04.05.2026 evening:
  // «при нажатии на фичу в ВИВЕРЕ должна выделятся вся область
  // фичи»). Set anchor at start, focus (caret) at end so the
  // SelectionOverlay highlights the whole feature region. Queues a
  // smooth scroll to the start so the biolog sees the beginning of
  // the feature even if the click happened on its tail end.
  // Bug-rush #19 (04.05.2026 evening): the «scroll-to-start when
  // biolog clicks a feature» behavior is now opt-out via the
  // sequenceView.scrollOnFeatureClick setting. Read once from the
  // store via getState() inside the callback so the callback
  // doesn't re-create on every store change.
  const onSelectRangeFromView = useCallback((start, end, mode, strand) => {
    if (typeof start !== 'number' || typeof end !== 'number') return;
    if (!Number.isFinite(start) || !Number.isFinite(end)) return;
    if (end <= start) return;
    setCursorAnchor(start);
    setCursorPos(end);
    setCursorSelectionMode(mode === 'aa' ? 'aa' : 'dna');
    setCursorSelectionStrand(strand === -1 ? -1 : 1);
    const scrollOn = useStore.getState().sequenceView?.scrollOnFeatureClick;
    if (scrollOn !== false) {
      setPendingScroll({ pos: start, tick: Date.now(), instant: false });
    }
  }, []);

  const onPendingScrollHandled = useCallback(() => setPendingScroll(null), []);

  // Reset cursor / selection when biolog switches plasmids.
  useEffect(() => {
    setCursorPos(null);
    setCursorAnchor(null);
    setCursorSelectionMode(null);
  }, [itemKey]);

  return {
    pendingScroll,
    cursorPos,
    cursorAnchor,
    cursorSelectionMode,
    cursorSelectionStrand,
    setCursorPos,
    setCursorAnchor,
    onBarSettle,
    onBarScrub,
    onCaretChangeFromView,
    onSelectRangeFromView,
    onPendingScrollHandled,
  };
}
