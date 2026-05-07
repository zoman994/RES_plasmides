import { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { STRINGS } from '../../../lib/strings';
import InlineEditableTitle from './InlineEditableTitle';
import TabBar from './tabs/TabBar';
import OverviewTab from './tabs/OverviewTab';
import SequenceTab from './tabs/SequenceTab';
import LinearFeatureBar from './tabs/LinearFeatureBar';
// AnnotationsTab re-introduced in Sprint M-X.2 K9-fix as the
// full-plasmid Annotator entry point. The tab still renders the
// legacy table-style AnnotationEditor (so biolog can scan / sort
// existing annotations), but the dominant CTA is the «🔍 Аннотатор»
// button which opens the fullscreen orchestrator (DEC-ANN-03).
// LinearFeatureBar stays at SingleInspector level — always visible,
// regardless of active tab; clicking a feature auto-switches to
// Sequence and scrolls.
import AnnotationsTab from './tabs/AnnotationsTab';
import HistoryTab from './tabs/HistoryTab';
import { getRegions } from '../../../annotation-model';
import {
  applyAnnotationEdit,
  mergeAnnotations,
  generateAnnotationId,
  mergeStripWithPredicted,
} from '../../../lib/annotation-edit.js';
import { useStore } from '../../../store';
import { selectAnnotator } from '../../../store/uiSlice.js';
// selectAnnotator import removed — the modal-Annotator mount was the
// only consumer here, and that mount is gone (Annotations tab embeds
// the Annotator inline now).
// Annotator import removed — the modal mount is gone. Annotations
// tab embeds the same component via AnnotationsTab.
import SettingsPopover from '../../SequenceView/SettingsPopover';
import FeatureEditorModal from './FeatureEditorModal';
import LibrarySaveActions from './LibrarySaveActions';
import LibraryInspectorTitleRow from './LibraryInspectorTitleRow';
import ManualEditConfirmModal from './ManualEditConfirmModal';
import { useIdlePrewarm } from './hooks/useIdlePrewarm';
import { useAnnotationUndoRedo } from './hooks/useAnnotationUndoRedo';
import { useFeatureEditorFlow } from './hooks/useFeatureEditorFlow';
import { useEditableModeToggle } from './hooks/useEditableModeToggle';
import { useManualEditBranching } from './hooks/useManualEditBranching';
import { useLibrarySaveFlow } from './hooks/useLibrarySaveFlow';

const S = STRINGS.importer;

// Idle pre-warm bypass for the V49 lazy-tabs vitest assertions.
// In production / dev (MODE !== 'test') the inspector mounts heavy
// tabs in the background via requestIdleCallback so the user's tab
// click is instant. In test mode pre-warm is OFF — `lazy-tabs.test.jsx`
// asserts that Sequence / Annotations panels are NOT in the DOM on
// initial overview view (V49 50-sec hang regression guard).
const __PREWARM_DISABLED__ =
  typeof import.meta !== 'undefined'
  && typeof import.meta.env !== 'undefined'
  && import.meta.env.MODE === 'test';

/**
 * SingleInspector — wrapper for the active parsedItem (M-B.2 K3).
 *
 * Layout:
 *   [title row — InlineEditableTitle + subtitle (length · topology · regions)]
 *   [TabBar — Обзор · Последовательность · Аннотации (· История conditional)]
 *   [active tab content — OverviewTab eager; SequenceTab + AnnotationsTab
 *    + HistoryTab land in K4 with lazy mount that fixes V49 50-sec hang]
 *
 * MetaColumn renders sibling-of-this in Importer/index.jsx (the 4-region
 * layout has CatalogColumn / Inspector / MetaColumn — Inspector wraps title
 * + tabs only).
 */
export default function SingleInspector({
  item,
  flags,
  edits,
  activeTab,
  onActiveTabChange,
  onUpdateFlags, // eslint-disable-line no-unused-vars -- reserved for future Annotator hand-off
  onUpdateEdits,
  onAppendAdded, // eslint-disable-line no-unused-vars
  onRenameItem,
  // eslint-disable-next-line no-unused-vars -- ditto
  onRunAutoAnnotate,
}) {
  // Annotator state for the navigation-strip ghost overlay. Single
  // shallow-equality subscription instead of five separate ones — five
  // calls each compared with `Object.is` against their previous result
  // every store tick was real overhead; this collapses to one shallow
  // compare over the five fields we actually need.
  const {
    results: annotatorResults,
    threshold: annotatorThreshold,
    acceptedRegionIds: annotatorAccepted,
    rejectedRegionIds: annotatorRejected,
    showDuplicates: annotatorShowDuplicates,
  } = useStore(useShallow((s) => {
    const a = selectAnnotator(s);
    return {
      results: a.results,
      threshold: a.threshold,
      acceptedRegionIds: a.acceptedRegionIds,
      rejectedRegionIds: a.rejectedRegionIds,
      showDuplicates: a.showDuplicates,
    };
  }));
  // Idle pre-warm: when biolog clicks a plasmid in the catalog list,
  // mount Sequence + Annotations tabs in the background (display:none)
  // so a subsequent tab click is instant. Without this, the tab click
  // triggers a synchronous mount of ~70k DOM nodes (~1-1.5 s freeze
  // on 8 GB / mid-tier CPU). The pre-warm fires AFTER first paint via
  // requestIdleCallback, so it doesn't block the initial overview
  // render — V49 50-sec-hang guarantee preserved on slow hardware
  // (heavy work happens in background, not in the main thread of the
  // open click). Biolog feedback 04.05.2026 evening: «можно сделать
  // так чтобы плазмида сразу рендерилась когда на неё нажали в списке?
  // пока человек дотянется до вкладки и нажмёт на аннотацию /
  // последовательность — всё уже будет отрендерено».
  //
  // Reset on plasmid switch (item._fileName / item.id) so the new
  // plasmid starts pre-warm from scratch and doesn't carry over the
  // previous plasmid's tab content.
  const itemKey = item ? (item.id || item._fileName || item.name || '') : null;
  const warmedTabs = useIdlePrewarm({ itemKey, activeTab, testMode: __PREWARM_DISABLED__ });

  // Pending scroll request from the LinearFeatureBar (lives at
  // SingleInspector level). When the biolog clicks/drags on the
  // bar from the Overview tab we auto-switch to Sequence and queue
  // the absolute position; SequenceTab consumes the queue via a prop
  // + clears it back to null. `tick` bumps on each new request even
  // if the position repeats — useEffect deps catch the change.
  // `instant: true` asks SequenceView to use behavior:'auto' for
  // responsive live-scrubbing during drag.
  const [pendingScroll, setPendingScroll] = useState(null);
  // M-X.5 K6 — Read-only/Editable toggle (DEC-LIB-16 ⚓). Default
  // false: SequenceView refuses character keystrokes via the
  // useManualEditDetection hook below. Click the READ-ONLY pill in
  // the title row → flips to true → amber accent + pulsing dot. K10
  // (manual edit branching) listens to this state to decide whether
  // to capture sequence-mutating keystrokes. Reset to read-only when
  // switching plasmids (item id changes) so each open starts safe.
  // M-X.6 K0 — extracted via useEditableModeToggle (DEC-MX6-01).
  // K6 read-only/editable pill state (DEC-LIB-16 ⚓), auto-resets
  // on plasmid switch.
  const { editable, toggle: toggleEditable, disable: disableEditable } = useEditableModeToggle(item);

  // M-X.6 K0 — extracted via useManualEditBranching (DEC-MX6-01).
  // K10 manual-edit branching (DEC-LIB-12 ⚓): listens window-level
  // keydown when armed, opens ManualEditConfirmModal on first
  // sequence-mutating keystroke, confirm → createManualEditBranch.
  //
  // Caveat (M-X.6 K2 follow-up): branch is created with sequence
  // IDENTICAL to parent. Real character-level apply (insert /
  // Backspace / Delete with indel-aware annotation shift) lands in
  // K2 via the `onSequenceEdit` composite handler. Annotation
  // editing on the branch already works through FeatureEditorModal
  // / drag edges / hotkeys.
  const clearPendingEdits = useCallback(() => {
    if (typeof onUpdateEdits === 'function') {
      onUpdateEdits({ editedAnnotations: undefined });
    }
  }, [onUpdateEdits]);

  // M-X.6 K0 — extracted via useLibrarySaveFlow (DEC-MX6-01).
  // Packages the K7 save buttons' props (DEC-LIB-13 ⚓): «Перезаписать»
  // (overwrite + version bump) и «Сохранить как версию» (copy-on-write
  // с parent reference). Both `onAfterOverwrite` / `onAfterSaveAsVersion`
  // clear the inspector's pending edits so the buttons disable until
  // the next annotation change.
  const saveFlow = useLibrarySaveFlow({ item, edits, onUpdateEdits });
  const {
    pending: manualEditPending,
    busy: manualEditBusy,
    cancel: cancelManualEdit,
    confirm: confirmManualEdit,
  } = useManualEditBranching({
    item,
    edits,
    activeTab,
    editable,
    onClearEdits: clearPendingEdits,
    onDisableEditable: disableEditable,
  });
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

  // Sprint M-X.2 K3 — edit operations from inside SequenceView. The
  // viewer dispatches `onAnnotationEdit({kind, id?, patch?, payload?})`
  // for Del / H / E + drag-handles + inline rename; we pipe that
  // through `applyAnnotationEdit` and forward the new array via the
  // existing `onUpdateEdits({editedAnnotations})` flow.
  // Sprint M-X.2 K9 — Annotator entry points. SingleInspector is
  // the natural mount point for the fullscreen Annotator: it owns
  // the item / edits / onUpdateEdits trio that the Save flow
  // needs, so the round-trip (open → run → accept → save) stays
  // inside one component without prop-drilling through App.
  const openAnnotator = useStore((s) => s.openAnnotator);

  // Region-scope entry points (SequenceView right-click "Annotate
  // selection...") set scope and switch the active tab to
  // 'annotations'. The embedded Annotator there picks up the new
  // scope and runs L1 against it. The legacy modal Annotator path
  // is gone: it used to flicker on top of the Sequence tab whenever
  // the user left the Annotations tab with `annotator.open` still
  // true, since the modal mount only checked the open flag.
  const onOpenAnnotator = useCallback((scopeArg) => {
    const sequenceId = item ? (item.id || item._fileName || item.name || 'unknown') : 'unknown';
    const scope = scopeArg && scopeArg.kind === 'region'
      ? { kind: 'region', sequenceId, region: scopeArg.region }
      : { kind: 'full', sequenceId };
    openAnnotator(scope);
    onActiveTabChange?.('annotations');
  }, [openAnnotator, item, onActiveTabChange]);

  // Bug-rush #5 (04.05.2026 evening): Ctrl+Z / Ctrl+Y for annotation
  // edits. Track a rolling stack of pre-edit snapshots; each edit
  // pushes the BEFORE-state, undo pops it back into editedAnnotations.
  // Redo stack populated only when an undo happens; any fresh edit
  // clears the redo branch (standard editor behavior).
  // Annotation undo/redo stack — see hooks/useAnnotationUndoRedo.
  const currentAnnotationsForUndo = Array.isArray(edits?.editedAnnotations)
    ? edits.editedAnnotations
    : (item?.annotations || []);
  const { pushSnapshot, undo: undoAnnotation, redo: redoAnnotation } = useAnnotationUndoRedo({
    itemKey,
    currentAnnotations: currentAnnotationsForUndo,
    onUpdateEdits,
  });

  // HOOK-06 — keep these callbacks identity-stable across renders.
  // The previous spelling listed `item` and `edits` in deps, so the
  // callback re-created every time biolog typed into the title input
  // or any other state nudged SingleInspector. SequenceView forwards
  // these callbacks into useSelectionEdit / useAnnotationDrag /
  // useAnnotationRename hook deps, which then teared down + reinstalled
  // document-level pointer listeners mid-drag — felt like dropping the
  // cursor while moving a feature edge.
  //
  // Pattern: keep the latest values in refs (synced via useEffect),
  // read from refs inside the callback, and depend only on
  // `onUpdateEdits` + the stable `pushSnapshot`. Callback identity is
  // now stable for the lifetime of `onUpdateEdits`.
  const itemRef = useRef(item);
  const editsRef = useRef(edits);
  useEffect(() => { itemRef.current = item; }, [item]);
  useEffect(() => { editsRef.current = edits; }, [edits]);

  const onAnnotationEditFromView = useCallback((edit) => {
    if (!edit || !onUpdateEdits) return;
    try {
      const curItem = itemRef.current;
      const curEdits = editsRef.current;
      const seqLength = (curItem?.sequence || '').length;
      const baseAnnotations = Array.isArray(curEdits?.editedAnnotations)
        ? curEdits.editedAnnotations
        : (curItem?.annotations || []);
      const result = applyAnnotationEdit(baseAnnotations, edit, seqLength);
      const next = Array.isArray(result) ? result : result?.next;
      if (Array.isArray(next) && next !== baseAnnotations) {
        pushSnapshot(baseAnnotations);
        onUpdateEdits({ editedAnnotations: next });
      }
    } catch (err) {
      // Validation errors surface via popup error states; if one
      // makes it here, log to console but don't crash the viewer.
      // eslint-disable-next-line no-console
      console.warn('[SingleInspector] annotation edit failed:', err.message);
    }
  }, [onUpdateEdits, pushSnapshot]);

  // Apply a non-edit operation (split / merge / delete) directly
  // against `editedAnnotations` and push the BEFORE state onto the
  // undo stack so Ctrl+Z works the same way it does for inline
  // edits. Same ref-pattern as above — stable identity.
  const applyOpToAnnotations = useCallback((nextAnnotations) => {
    if (!onUpdateEdits) return;
    const curItem = itemRef.current;
    const curEdits = editsRef.current;
    const baseAnnotations = Array.isArray(curEdits?.editedAnnotations)
      ? curEdits.editedAnnotations
      : (curItem?.annotations || []);
    if (!Array.isArray(nextAnnotations) || nextAnnotations === baseAnnotations) return;
    pushSnapshot(baseAnnotations);
    onUpdateEdits({ editedAnnotations: nextAnnotations });
  }, [onUpdateEdits, pushSnapshot]);

  // FeatureEditorModal flow — see hooks/useFeatureEditorFlow.
  const {
    featureUnderEdit,
    openFeatureEditor,
    closeFeatureEditor,
    onFeatureSave,
    onFeatureMerge,
    onFeatureDelete,
  } = useFeatureEditorFlow({
    item,
    edits,
    applyOp: applyOpToAnnotations,
    dispatchEdit: onAnnotationEditFromView,
  });

  // Reset cursor / selection when biolog switches plasmids.
  useEffect(() => {
    setCursorPos(null);
    setCursorAnchor(null);
    setCursorSelectionMode(null);
  }, [itemKey]);

  // Bug-rush #22 — SequenceView settings popover state hoisted from
  // SequenceTab to SingleInspector so the ⚙ trigger can live next
  // to the plasmid title regardless of active tab. Closed on plasmid
  // switch and on tab change away from 'sequence'.
  const [seqSettingsOpen, setSeqSettingsOpen] = useState(false);
  const seqSettingsTriggerRef = useRef(null);
  useEffect(() => { setSeqSettingsOpen(false); }, [itemKey]);
  useEffect(() => {
    if (activeTab !== 'sequence') setSeqSettingsOpen(false);
  }, [activeTab]);

  // Sprint M-X.2 K10 — Annotator save flow. Accepted regions land
  // here as a flat array; we pipe through `applyAnnotationEdit`
  // with kind='create-batch' (DEC-ANN-09 dedup) into the existing
  // perFileEdits.editedAnnotations channel. Closes the Annotator
  // on success.
  const closeAnnotator = useStore((s) => s.closeAnnotator);
  const onApplyAnnotatorResults = useCallback((acceptedRegions) => {
    if (!Array.isArray(acceptedRegions) || acceptedRegions.length === 0) {
      closeAnnotator?.();
      return;
    }
    if (!onUpdateEdits) { closeAnnotator?.(); return; }
    try {
      const seqLength = (item?.sequence || '').length;
      const baseAnnotations = Array.isArray(edits?.editedAnnotations)
        ? edits.editedAnnotations
        : (item?.annotations || []);
      const result = applyAnnotationEdit(
        baseAnnotations,
        { kind: 'create-batch', payload: acceptedRegions },
        seqLength,
      );
      const next = result?.next;
      if (Array.isArray(next)) {
        onUpdateEdits({ editedAnnotations: next });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[SingleInspector] annotator apply failed:', err.message);
    }
    closeAnnotator?.();
  }, [onUpdateEdits, item, edits, closeAnnotator]);

  if (!item) return null;
  const length = item.length || item.sequence?.length || 0;
  const topology = item.topology || 'linear';
  const regionCount = getRegions(item.annotations || []).length;
  const showHistory = Array.isArray(item.commits) && item.commits.length > 0;
  // Use edited annotations if present (live edit), otherwise fall back to file's.
  const displayAnnotations = Array.isArray(edits?.editedAnnotations)
    ? edits.editedAnnotations
    : (item.annotations || []);
  const displayItem = { ...item, annotations: displayAnnotations };

  // When the user is on the Annotations tab, also project the
  // Annotator's predicted regions onto the navigation strip so the
  // ghost features biolog sees on the map are visible on the «колбаса»
  // too. Confirmed regions render solid; predicted ones inherit the
  // dashed/transparent style LinearFeatureBar already implements.
  // Memoised: every type-edit upstream creates a fresh `displayAnnotations`
  // reference (it's a render-time merge), but the merge itself is the
  // expensive part — useMemo guards against re-running it when only an
  // unrelated piece of state ticks.
  // While the Annotator is open (activeTab === 'annotations'), surface
  // ALL predicted regions on the strip — including ones that overlap a
  // confirmed feature of the same type. 2026-05-06 biolog: «ОРФ на
  // колбасе аннотатора не показываются (а вот предсказанные промоторы
  // например показываются)». ORF detector emits `type: 'CDS'`, which
  // matches existing `CDS` annotations under the duplicate rule and
  // got silently dropped. In the Annotator the user actively wants to
  // SEE the ghosts (that's the point), so we force showDuplicates=true
  // for the strip merge regardless of the global toggle. The toggle in
  // the Annotator header still controls per-row list filtering.
  const stripAnnotations = useMemo(() => (
    activeTab === 'annotations'
      ? mergeStripWithPredicted(
          displayAnnotations,
          annotatorResults,
          annotatorThreshold,
          annotatorAccepted,
          annotatorRejected,
          true, // showDuplicates — see comment above
        )
      : displayAnnotations
  ), [activeTab, displayAnnotations, annotatorResults, annotatorThreshold,
      annotatorAccepted, annotatorRejected]);

  // Helper: is a tab pre-warmed (= mounted)? In test mode only the
  // active tab is ever warmed (preserves V49 lazy-tabs assertions).
  const isMounted = (tab) => warmedTabs.has(tab);
  const visibilityStyle = (tab) => ({
    display: activeTab === tab ? 'block' : 'none',
  });

  return (
    <div
      data-testid="importer-single-inspector"
      data-current-file={item._fileName}
      style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
    >
      {/*
        * Header (04.05.2026 reshuffle):
        *   - Title row at the very top (plasmid name + length /
        *     topology / region-count subtitle).
        *   - TagsEditor moved out → MetaColumn right rail.
        *   - LinearFeatureBar «колбаса» moved here from
        *     SequenceTab's bottom — always visible regardless of
        *     active tab. Click on a feature auto-switches to the
        *     Sequence tab and scrolls SequenceView to its start.
        */}
      <LibraryInspectorTitleRow
        item={item}
        activeTab={activeTab}
        length={length}
        topology={topology}
        regionCount={regionCount}
        onRenameItem={onRenameItem}
        seqSettingsTriggerRef={seqSettingsTriggerRef}
        seqSettingsOpen={seqSettingsOpen}
        onToggleSeqSettings={() => setSeqSettingsOpen((v) => !v)}
        editable={editable}
        toggleEditable={toggleEditable}
        saveFlow={saveFlow}
        cursorPos={cursorPos}
        cursorAnchor={cursorAnchor}
        cursorSelectionMode={cursorSelectionMode}
      />
      {/* M-X.6 K0 — title row JSX moved into LibraryInspectorTitleRow.
          Legacy inline structure dropped below; the comment block
          above used to wrap the visible markup. */}

      <TabBar
        activeTab={activeTab}
        onChange={onActiveTabChange}
        showHistory={showHistory}
      />

      {/* Compact feature strip — moved below TabBar 04.05.2026 evening
          (биолог: «колбаса должна под вкладками появляться»). Hidden
          on the Overview tab — Overview already has the PlasmidMiniMap
          + categorised sections, the strip would duplicate the
          visualisation there. Click = jump-to-feature in Sequence tab.
          A small caret cursor below the bar tracks the
          most-recently-targeted feature so the biolog sees where the
          last click landed. */}
      {/* Round-17 (06.05.2026 biolog: «колбаса пропала... Аннотации
          у него нет, но колбаса и пустая с гост фичами должна
          быть»). Strip used to gate on `displayAnnotations.length > 0`,
          so a plasmid with zero confirmed annotations rendered no
          bar at all. But Annotator's predicted (ghost) features
          merge into `stripAnnotations` on the Annotations tab — and
          even on the Sequence tab, the empty plasmid outline is
          still useful as a navigation surface. Show the bar
          whenever a plasmid is loaded (length > 0); empty
          annotations array just yields a clean plasmid bar. */}
      {activeTab !== 'overview' && length > 0 && (
        <div
          data-testid="importer-single-feature-strip"
          style={{
            padding: '4px 14px 6px',
            borderBottom: '0.5px solid var(--border-subtle)',
            background: 'var(--surface-1)',
          }}
        >
          <LinearFeatureBar
            annotations={stripAnnotations}
            seqLength={length}
            onSelect={onBarSettle}
            onScrub={onBarScrub}
            cursorPosition={cursorPos}
          />
        </div>
      )}

      <div
        data-testid="importer-single-tab-content"
        style={{
          flex: 1, minHeight: 0,
          // Annotations tab has its own two-pane layout (map +
          // LevelPanel) that needs to fit the viewport with its own
          // internal scroll regions — outer scroll would float
          // LevelPanel off-screen as the user scrolls the sequence
          // (biolog: «окно с аннотациями остается ввеху а сиквенс
          // листается вниз. по итогу не могу принять»). Other tabs
          // keep the constant scrollbar-track width to avoid the
          // SequenceMapView re-measure flicker noted earlier.
          overflowY: activeTab === 'annotations' ? 'hidden' : 'scroll',
          padding: activeTab === 'annotations' ? 0 : 14,
          display: activeTab === 'annotations' ? 'flex' : 'block',
          flexDirection: activeTab === 'annotations' ? 'column' : undefined,
        }}
      >
        {/* Tab panels: warm-then-hide. Each tab mounts when it enters
            `warmedTabs`. In production, the active tab is in there
            from the start; Sequence + Annotations join it after first
            paint via a requestIdleCallback in the effect above. Once
            mounted, a tab toggles between display:block (active) and
            display:none (background) — no remount, no destroy, instant
            switch. In test mode (__PREWARM_DISABLED__) only the active
            tab is ever warmed — preserves the V49 lazy-tabs guarantee
            asserted by `lazy-tabs.test.jsx::default-overview-no-annotation-editor`.
            History tab stays strictly conditional (it only mounts when
            commits exist AND the user navigates to it — not pre-warmed). */}
        {isMounted('overview') && (
          <div
            className="importer-tab-pane"
            data-tab-active={activeTab === 'overview' ? 'true' : 'false'}
            style={visibilityStyle('overview')}
          >
            <OverviewTab item={displayItem} />
          </div>
        )}
        {isMounted('sequence') && (
          <div
            className="importer-tab-pane"
            data-tab-active={activeTab === 'sequence' ? 'true' : 'false'}
            style={visibilityStyle('sequence')}
          >
            <SequenceTab
              sequence={edits?.editedSequence ?? item.sequence}
              annotations={displayAnnotations}
              topology={(edits?.editedTopology ?? item.topology) || 'linear'}
              name={item.name || item._fileName}
              fileKey={item._fileName}
              onUpdateEdits={onUpdateEdits}
              pendingScroll={pendingScroll}
              onPendingScrollHandled={onPendingScrollHandled}
              caretPos={cursorPos}
              caretAnchor={cursorAnchor}
              selectionMode={cursorSelectionMode}
              selectionStrand={cursorSelectionStrand}
              onCaretChange={onCaretChangeFromView}
              onSelectRange={onSelectRangeFromView}
              onAnnotationEdit={onAnnotationEditFromView}
              onOpenAnnotator={onOpenAnnotator}
              onOpenFeatureEditor={openFeatureEditor}
            />
          </div>
        )}
        {isMounted('annotations') && (
          <div
            className="importer-tab-pane"
            data-tab-active={activeTab === 'annotations' ? 'true' : 'false'}
            style={{
              // Annotations-tab wrap fills the entire tab-content
              // height with a flex column so AnnotationsTab can
              // proceed to lay out the embedded Annotator's two
              // panes (map + LevelPanel) at full height. Other tabs
              // keep the simple block visibility toggle.
              display: activeTab === 'annotations' ? 'flex' : 'none',
              flex: activeTab === 'annotations' ? 1 : undefined,
              flexDirection: 'column',
              minHeight: 0,
            }}>
            <AnnotationsTab
              sequence={edits?.editedSequence ?? item.sequence ?? ''}
              annotations={displayAnnotations}
              fileName={item._fileName}
              active={activeTab === 'annotations'}
              onApplyAnnotatorResults={onApplyAnnotatorResults}
              onAnnotationEdit={onAnnotationEditFromView}
              onOpenFeatureEditor={openFeatureEditor}
              // 2026-05-06 — biolog: «навигация по колбасе аннотатора
              // не даёт навигацию в аннотаторе». Wire the same
              // pendingScroll signal that SequenceTab consumes so the
              // bar's click/drag scrolls the Annotator's preview view
              // when the user is on the Annotations tab.
              pendingScroll={activeTab === 'annotations' ? pendingScroll : null}
              onPendingScrollHandled={onPendingScrollHandled}
            />
          </div>
        )}
        {activeTab === 'history' && showHistory && (
          <HistoryTab commits={item.commits || []} />
        )}
      </div>
      {/*
        Sprint M-X.2 K9 — Annotator fullscreen overlay. Mounted
        INSIDE the inspector for direct access to the displayed
        item's sequence + annotations + onUpdateEdits flow.

        TD-ANNOTATOR-MOUNT (post-K10 review): the spec K8 step
        called for «Root mount в App.jsx» so the Annotator can be
        re-used from the future M-D Container Window without
        Importer in the path. Lifting requires either Context or
        a store-level «active target» registration; deferred to
        M-D Container Window kickoff so we can pick the right
        boundary once the second consumer exists. Until then this
        mount works fine for the Importer pathway (the only one
        biolog reaches today).
      */}
      {/* Modal Annotator removed: the embedded Annotator inside the
          Annotations tab is the only entry surface now. Region-scope
          right-clicks from the Sequence tab navigate to that tab via
          onOpenAnnotator, which sets the scope and switches activeTab
          to 'annotations' — no more modal flicker on tab switches. */}
      {seqSettingsOpen && (
        <SettingsPopover
          open={seqSettingsOpen}
          onClose={() => setSeqSettingsOpen(false)}
          triggerRef={seqSettingsTriggerRef}
        />
      )}
      {/* Sprint M-X.3 follow-up — single-feature edit modal, opened
          by dblclick on a feature in the SequenceView. Owns rename
          / type / coords / strand / split / merge / delete; intron
          markup is a stub here. */}
      <FeatureEditorModal
        feature={featureUnderEdit}
        seqLength={length}
        neighbours={displayAnnotations}
        onSave={onFeatureSave}
        onMerge={onFeatureMerge}
        onDelete={onFeatureDelete}
        onClose={closeFeatureEditor}
      />

      {/* M-X.5 K10 — Manual edit confirm. Surfaced once per mount when
          biolog fires the first sequence-mutating keystroke in
          EDITABLE mode. Confirm → createManualEditBranch; Cancel →
          stay on parent. Q3 plan: per-mount scope. */}
      <ManualEditConfirmModal
        open={!!manualEditPending}
        parentName={item?.name || ''}
        onCancel={cancelManualEdit}
        onConfirm={confirmManualEdit}
        busy={manualEditBusy}
      />
    </div>
  );
}
