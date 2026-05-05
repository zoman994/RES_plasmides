import { useCallback, useState, useEffect, useRef } from 'react';
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
import { applyAnnotationEdit, mergeAnnotations, generateAnnotationId } from '../../../lib/annotation-edit.js';
import { useStore } from '../../../store';
import { selectAnnotator } from '../../../store/uiSlice.js';
import Annotator from '../../Annotator';
import SettingsPopover from '../../SequenceView/SettingsPopover';
import FeatureEditorModal from './FeatureEditorModal';

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
  const [warmedTabs, setWarmedTabs] = useState(() => new Set([activeTab]));

  // Reset warmed set when a different plasmid is selected.
  useEffect(() => {
    setWarmedTabs(new Set([activeTab]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemKey]);

  // Warm whichever tab the user navigates to.
  //   - In production: ACCUMULATE — once a tab is warmed, it stays
  //     mounted in display:none even when the user navigates away.
  //     Subsequent re-visits are instant (just visibility toggle).
  //   - In test mode: REPLACE — `warmedTabs` always equals the
  //     single active tab, mirroring the original V49 lazy-mount
  //     semantics so `lazy-tabs.test.jsx` tests 2/3/4 (which assert
  //     unmount on navigate-away) keep passing.
  useEffect(() => {
    if (__PREWARM_DISABLED__) {
      setWarmedTabs(new Set([activeTab]));
    } else {
      setWarmedTabs(prev => (prev.has(activeTab) ? prev : new Set([...prev, activeTab])));
    }
  }, [activeTab]);

  // Idle pre-warm — production only. Mounts Sequence and Annotations
  // tabs in display:none AFTER first paint so a subsequent tab click
  // toggles visibility instantly instead of triggering a synchronous
  // mount of ~70 k DOM nodes (~1-1.5 s freeze on 8 GB / mid-tier CPU).
  //
  // Chunked: TWO independent effects, each scheduling its OWN
  // requestIdleCallback. Sequence pre-warm fires first (the biolog's
  // most likely next click after Overview); Annotations follows in a
  // separate idle frame so the browser can paint between mounts and
  // doesn't experience back-to-back ~500 ms commits.
  //
  // Cancellation: each effect returns a cleanup that cancels its
  // pending idle callback. When the biolog selects a different
  // plasmid, `itemKey` shifts → the reset effect wipes warmedTabs,
  // both pre-warm effects re-evaluate (cleanup runs, cancelling any
  // in-flight idle callback for the previous plasmid; new effect
  // runs, scheduling pre-warm for the new plasmid). No leaked work.
  //
  // Acceptance criterion (Igor's spec, 04.05.2026 evening): on 8 GB /
  // mid-tier CPU, click on plasmid in catalog → ~1 s overview load →
  // click "Последовательность" → instant (no freeze). Verified on
  // 3xFLAG-dCas9 pCMV-7.1 (8.8 kb) by biolog visual review.

  // Pre-warm Sequence (first chunk).
  useEffect(() => {
    if (__PREWARM_DISABLED__) return undefined;
    if (!itemKey) return undefined;
    if (warmedTabs.has('sequence')) return undefined;
    let cancelled = false;
    const flush = () => {
      if (cancelled) return;
      setWarmedTabs(prev => (prev.has('sequence') ? prev : new Set([...prev, 'sequence'])));
    };
    const useRIC = typeof requestIdleCallback !== 'undefined';
    const handle = useRIC
      ? requestIdleCallback(flush, { timeout: 800 })
      : setTimeout(flush, 250);
    return () => {
      cancelled = true;
      if (useRIC) cancelIdleCallback(handle); else clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemKey, warmedTabs.has('sequence')]);

  // Annotations pre-warm — re-introduced 04.05.2026 evening with
  // the «Аннотации» tab. Same chunked pattern as Sequence above:
  // separate idle frame so the browser can paint between mounts.
  useEffect(() => {
    if (__PREWARM_DISABLED__) return undefined;
    if (!itemKey) return undefined;
    if (warmedTabs.has('annotations')) return undefined;
    let cancelled = false;
    const flush = () => {
      if (cancelled) return;
      setWarmedTabs(prev => (prev.has('annotations') ? prev : new Set([...prev, 'annotations'])));
    };
    const useRIC = typeof requestIdleCallback !== 'undefined';
    const handle = useRIC
      ? requestIdleCallback(flush, { timeout: 1500 })
      : setTimeout(flush, 400);
    return () => {
      cancelled = true;
      if (useRIC) cancelIdleCallback(handle); else clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemKey, warmedTabs.has('annotations')]);

  // Pending scroll request from the LinearFeatureBar (lives at
  // SingleInspector level). When the biolog clicks/drags on the
  // bar from the Overview tab we auto-switch to Sequence and queue
  // the absolute position; SequenceTab consumes the queue via a prop
  // + clears it back to null. `tick` bumps on each new request even
  // if the position repeats — useEffect deps catch the change.
  // `instant: true` asks SequenceView to use behavior:'auto' for
  // responsive live-scrubbing during drag.
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
    if (activeTab !== 'sequence') {
      onActiveTabChange?.('sequence');
    }
    setCursorPos(pos);
    setCursorAnchor(pos);
    setCursorSelectionMode('dna');
    setPendingScroll({ pos, tick: Date.now(), instant: false });
  }, [activeTab, onActiveTabChange]);

  // Live drag scrub — fires every pointermove. Always update the
  // cursor visual; only push a scroll when biolog is already on the
  // Sequence tab (no point auto-switching tabs mid-drag, that would
  // yank context away while they're still aiming). Same selection-
  // collapse rule as onBarSettle.
  const onBarScrub = useCallback((pos) => {
    if (typeof pos !== 'number' || !Number.isFinite(pos)) return;
    setCursorPos(pos);
    setCursorAnchor(pos);
    setCursorSelectionMode('dna');
    if (activeTab === 'sequence') {
      setPendingScroll({ pos, tick: Date.now(), instant: true });
    }
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
  const annotatorOpen = useStore((s) => selectAnnotator(s).open);
  const openAnnotator = useStore((s) => s.openAnnotator);

  const onOpenAnnotator = useCallback((scopeArg) => {
    const sequenceId = item ? (item.id || item._fileName || item.name || 'unknown') : 'unknown';
    const scope = scopeArg && scopeArg.kind === 'region'
      ? { kind: 'region', sequenceId, region: scopeArg.region }
      : { kind: 'full', sequenceId };
    openAnnotator(scope);
  }, [openAnnotator, item]);

  // Bug-rush #5 (04.05.2026 evening): Ctrl+Z / Ctrl+Y for annotation
  // edits. Track a rolling stack of pre-edit snapshots; each edit
  // pushes the BEFORE-state, undo pops it back into editedAnnotations.
  // Redo stack populated only when an undo happens; any fresh edit
  // clears the redo branch (standard editor behavior).
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const UNDO_LIMIT = 50;

  // Reset history when the displayed item changes.
  useEffect(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
  }, [itemKey]);

  // Ref-tracked current annotations so undo/redo callbacks stay
  // stable across renders (otherwise the keydown listener rebinds
  // on every edit).
  const currentAnnotationsRef = useRef([]);
  currentAnnotationsRef.current = Array.isArray(edits?.editedAnnotations)
    ? edits.editedAnnotations
    : (item?.annotations || []);

  const onAnnotationEditFromView = useCallback((edit) => {
    if (!edit || !onUpdateEdits) return;
    try {
      const seqLength = (item?.sequence || '').length;
      const baseAnnotations = Array.isArray(edits?.editedAnnotations)
        ? edits.editedAnnotations
        : (item?.annotations || []);
      const result = applyAnnotationEdit(baseAnnotations, edit, seqLength);
      const next = Array.isArray(result) ? result : result?.next;
      if (Array.isArray(next) && next !== baseAnnotations) {
        // Push the BEFORE state onto the undo stack; clear redo
        // so a new edit branch overrides any future-branch we
        // might have been holding from a sequence of undos.
        undoStackRef.current = [
          ...undoStackRef.current.slice(-UNDO_LIMIT + 1),
          baseAnnotations,
        ];
        redoStackRef.current = [];
        onUpdateEdits({ editedAnnotations: next });
      }
    } catch (err) {
      // Validation errors surface via popup error states; if one
      // makes it here, log to console but don't crash the viewer.
      // eslint-disable-next-line no-console
      console.warn('[SingleInspector] annotation edit failed:', err.message);
    }
  }, [onUpdateEdits, item, edits]);

  // Sprint M-X.3 follow-up — FeatureEditorModal owns single-feature
  // edit (rename / type / coords / strand) AND the Split / Merge /
  // Delete operations. Mounts on dblclick of a feature in the
  // SequenceView. State here = the region currently under edit
  // (`null` means no modal open).
  const [featureUnderEdit, setFeatureUnderEdit] = useState(null);
  const openFeatureEditor = useCallback((region) => {
    setFeatureUnderEdit(region || null);
  }, []);
  const closeFeatureEditor = useCallback(() => {
    setFeatureUnderEdit(null);
  }, []);

  // Apply a non-edit operation (split / merge / delete) directly
  // against `editedAnnotations` and push the BEFORE state onto the
  // undo stack so Ctrl+Z works the same way it does for inline
  // edits.
  const applyOpToAnnotations = useCallback((nextAnnotations) => {
    if (!onUpdateEdits) return;
    const baseAnnotations = Array.isArray(edits?.editedAnnotations)
      ? edits.editedAnnotations
      : (item?.annotations || []);
    if (!Array.isArray(nextAnnotations) || nextAnnotations === baseAnnotations) return;
    undoStackRef.current = [
      ...undoStackRef.current.slice(-UNDO_LIMIT + 1),
      baseAnnotations,
    ];
    redoStackRef.current = [];
    onUpdateEdits({ editedAnnotations: nextAnnotations });
  }, [onUpdateEdits, item, edits]);

  /**
   * Save a feature edit + its sub-feature roster (level: 'detail').
   * Sub-features are managed entirely inside FeatureEditorModal —
   * here we DIFF the new list against existing detail annotations
   * keyed on the parent's region id, then build one composite next-
   * annotations array (parent-updated + sub-features replaced).
   *
   * The whole composite update goes through `applyOpToAnnotations`
   * so Ctrl+Z / Ctrl+Y rolls the parent + sub-features back to the
   * single pre-edit snapshot — biolog gets «one undo per Save»
   * regardless of how many sub-features they tweaked.
   */
  const onFeatureSave = useCallback(({ patch, subFeatures }) => {
    if (!featureUnderEdit) return;
    const baseAnnotations = Array.isArray(edits?.editedAnnotations)
      ? edits.editedAnnotations
      : (item?.annotations || []);
    const parentId = featureUnderEdit.id;

    // Apply parent patch via the same dispatcher to keep validation
    // + id-regen consistent.
    let next;
    try {
      next = applyAnnotationEdit(baseAnnotations, { kind: 'update', id: parentId, patch }, (item?.sequence || '').length);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[SingleInspector] parent update failed:', err.message);
      return;
    }
    const updatedParent = next.find((a) => a.id === (patch.id || parentId)) || next.find((a) => a.start === patch.start && a.end === patch.end);
    const finalParentId = updatedParent ? updatedParent.id : parentId;

    // Replace existing details under this parent with the new roster.
    const withoutOldDetails = next.filter(
      (a) => !(a.level === 'detail' && a.regionId === parentId),
    );
    const newDetails = (subFeatures || [])
      .filter((sf) => Number.isFinite(sf.start) && Number.isFinite(sf.end) && sf.end > sf.start)
      .map((sf) => {
        const det = {
          name: (sf.name || 'sub').trim() || 'sub',
          type: sf.type || 'misc_feature',
          start: Math.max(0, sf.start | 0),
          end: Math.max(1, sf.end | 0),
          strand: sf.strand === -1 ? -1 : 1,
          level: 'detail',
          regionId: finalParentId,
        };
        if (sf.color) det.color = sf.color;
        det.id = sf.id || generateAnnotationId(det);
        return det;
      });
    const composite = [...withoutOldDetails, ...newDetails];
    applyOpToAnnotations(composite);
    closeFeatureEditor();
  }, [featureUnderEdit, item, edits, applyOpToAnnotations, closeFeatureEditor]);

  const onFeatureMerge = useCallback((neighbourId) => {
    if (!featureUnderEdit) return;
    const baseAnnotations = Array.isArray(edits?.editedAnnotations)
      ? edits.editedAnnotations
      : (item?.annotations || []);
    const next = mergeAnnotations(baseAnnotations, featureUnderEdit.id, neighbourId);
    applyOpToAnnotations(next);
  }, [featureUnderEdit, item, edits, applyOpToAnnotations]);

  const onFeatureDelete = useCallback(() => {
    if (!featureUnderEdit) return;
    onAnnotationEditFromView({ kind: 'delete', id: featureUnderEdit.id });
    closeFeatureEditor();
  }, [featureUnderEdit, onAnnotationEditFromView, closeFeatureEditor]);

  const undoAnnotation = useCallback(() => {
    if (!onUpdateEdits) return;
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const prev = stack[stack.length - 1];
    undoStackRef.current = stack.slice(0, -1);
    redoStackRef.current = [...redoStackRef.current, currentAnnotationsRef.current];
    onUpdateEdits({ editedAnnotations: prev });
  }, [onUpdateEdits]);

  const redoAnnotation = useCallback(() => {
    if (!onUpdateEdits) return;
    const stack = redoStackRef.current;
    if (stack.length === 0) return;
    const next = stack[stack.length - 1];
    redoStackRef.current = stack.slice(0, -1);
    undoStackRef.current = [...undoStackRef.current, currentAnnotationsRef.current];
    onUpdateEdits({ editedAnnotations: next });
  }, [onUpdateEdits]);

  // Bind Ctrl+Z (undo) / Ctrl+Y / Ctrl+Shift+Z (redo) at the
  // window level. Layout-independent — uses e.code so the Russian
  // keyboard's Cyrillic «я» / «н» on the same physical keys still
  // fires the hotkeys.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      // Skip when biolog is typing into a form (popup name input,
      // edit modal, inline rename, AnnotationEditor inputs).
      const t = e.target;
      if (t && t.tagName) {
        const tag = t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (t.isContentEditable) return;
      }
      if (e.code === 'KeyZ' && !e.shiftKey) {
        if (undoStackRef.current.length === 0) return;
        e.preventDefault();
        undoAnnotation();
      } else if ((e.code === 'KeyY') || (e.code === 'KeyZ' && e.shiftKey)) {
        if (redoStackRef.current.length === 0) return;
        e.preventDefault();
        redoAnnotation();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undoAnnotation, redoAnnotation]);

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
      <div
        data-testid="importer-single-title"
        style={{
          padding: '6px 14px 4px',
          borderBottom: '0.5px solid var(--border-subtle)',
          background: 'var(--surface-1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <InlineEditableTitle
              value={item.name || item._fileName || ''}
              onCommit={(name) => onRenameItem?.(name)}
            />
          </div>
          {/* Bug-rush #22: ⚙ + READ-ONLY pill relocated here from
              SequenceTab's removed sticky header. Only visible while
              the Sequence tab is active. */}
          {activeTab === 'sequence' && (
            <>
              <button
                ref={seqSettingsTriggerRef}
                type="button"
                aria-haspopup="dialog"
                aria-expanded={seqSettingsOpen ? 'true' : 'false'}
                aria-label={S.sequenceView?.settingsButton || 'Display settings'}
                title={S.sequenceView?.settingsButton || 'Display settings'}
                data-testid="importer-sequence-view-settings-trigger"
                onClick={() => setSeqSettingsOpen((v) => !v)}
                style={{
                  border: '0.5px solid var(--border-default)',
                  background: 'var(--surface-1)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: 12,
                  padding: '2px 6px',
                  borderRadius: 'var(--radius-md)',
                  lineHeight: 1,
                  flexShrink: 0,
                }}
              >⚙</button>
              <span
                style={{
                  padding: '2px 6px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface-2)', color: 'var(--text-secondary)',
                  fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.4,
                  flexShrink: 0,
                }}
              >{S.sequenceReadOnly}</span>
            </>
          )}
          {/* Bug-rush #23 (04.05.2026): live selection counter — bp
              always, aa appended when selection mode is 'aa' (codon-
              aligned). Only renders while a non-collapsed selection
              exists, so the title row stays clean otherwise. */}
          {(() => {
            const a = (typeof cursorAnchor === 'number' && Number.isFinite(cursorAnchor)) ? cursorAnchor : null;
            const f = (typeof cursorPos === 'number' && Number.isFinite(cursorPos)) ? cursorPos : null;
            if (a == null || f == null || a === f) return null;
            const bp = Math.abs(a - f);
            const showAa = cursorSelectionMode === 'aa';
            const aa = showAa ? Math.floor(bp / 3) : 0;
            return (
              <div
                data-testid="importer-selection-counter"
                style={{
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--accent-50, rgba(249, 115, 22, 0.12))',
                  color: 'var(--accent-700, #c2410c)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  fontWeight: 500,
                  flexShrink: 0,
                }}
              >
                {S.selectionCountBp(bp)}{showAa ? ` · ${S.selectionCountAa(aa)}` : ''}
              </div>
            );
          })()}
          <div
            style={{
              fontSize: 11, color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-mono)', flexShrink: 0,
            }}
          >
            {length.toLocaleString()} bp · {topology}
            {regionCount > 0 && ` · ${S.summaryRegionCount(regionCount)}`}
          </div>
        </div>
      </div>

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
      {activeTab !== 'overview' && displayAnnotations.length > 0 && length > 0 && (
        <div
          data-testid="importer-single-feature-strip"
          style={{
            padding: '4px 14px 6px',
            borderBottom: '0.5px solid var(--border-subtle)',
            background: 'var(--surface-1)',
          }}
        >
          <LinearFeatureBar
            annotations={displayAnnotations}
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
          flex: 1, padding: 14, minHeight: 0,
          // overflow-y:scroll (not auto) keeps the scrollbar always
          // visible — width never jumps mid-render. Earlier
          // scrollbar-gutter:stable depended on browser support and
          // applied too late on Vivaldi → SequenceMapView measured full
          // width then re-measured narrow once content overflowed.
          // Constant scrollbar-track width = constant clientWidth.
          overflowY: 'scroll',
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
          <div style={visibilityStyle('overview')}>
            <OverviewTab item={displayItem} />
          </div>
        )}
        {isMounted('sequence') && (
          <div style={visibilityStyle('sequence')}>
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
          <div style={visibilityStyle('annotations')}>
            <AnnotationsTab
              sequence={edits?.editedSequence ?? item.sequence ?? ''}
              annotations={displayAnnotations}
              fileName={item._fileName}
              active={activeTab === 'annotations'}
              onApplyAnnotatorResults={onApplyAnnotatorResults}
              onAnnotationEdit={onAnnotationEditFromView}
              onOpenFeatureEditor={openFeatureEditor}
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
      {/* Modal Annotator — kept for entry points that don't go through
          the AnnotationsTab (e.g. region-scope «Annotate selection» from
          SequenceView's context menu). Suppressed when the user is on
          the annotations tab — that tab embeds the same Annotator
          inline, and double-mounting would create two competing
          subscribers to the shared store slice. */}
      {annotatorOpen && activeTab !== 'annotations' && (
        <Annotator
          sequence={edits?.editedSequence ?? item.sequence}
          annotations={displayAnnotations}
          onApplyAnnotatorResults={onApplyAnnotatorResults}
        />
      )}
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
    </div>
  );
}
