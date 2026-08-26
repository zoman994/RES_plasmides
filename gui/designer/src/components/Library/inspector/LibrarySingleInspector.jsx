import { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { STRINGS } from '../../../lib/strings';
import InlineEditableTitle from './InlineEditableTitle';
import ProteinEffectBadge from './ProteinEffectBadge';
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
import { getRegions } from '../../../annotation-model';
import { extractFeatureSequences } from '../../../lib/feature-extract';
import { buildLibraryEntry } from '../lib/build-library-entry';
import { findDominatedRegions } from '../../../lib/plasmid-mini-map-geometry';
import {
  applyAnnotationEdit,
  mergeAnnotations,
  generateAnnotationId,
  mergeStripWithPredicted,
} from '../../../lib/annotation-edit.js';
import { useStore } from '../../../store';
import { useSequenceNavConsumer } from './hooks/useSequenceNavConsumer';
import { selectAnnotator } from '../../../store/uiSlice.js';
// selectAnnotator import removed — the modal-Annotator mount was the
// only consumer here, and that mount is gone (Annotations tab embeds
// the Annotator inline now).
// Annotator import removed — the modal mount is gone. Annotations
// tab embeds the same component via AnnotationsTab.
import SettingsPopover from '../../SequenceView/SettingsPopover';
import FeatureEditorModal from './FeatureEditorModal';
import LibraryInspectorTitleRow from './LibraryInspectorTitleRow';
import { useIdlePrewarm } from './hooks/useIdlePrewarm';
import { useAnnotationUndoRedo } from './hooks/useAnnotationUndoRedo';
import { useFeatureEditorFlow } from './hooks/useFeatureEditorFlow';
import { useLibrarySaveFlow } from './hooks/useLibrarySaveFlow';
// 17.06.2026 (Игорь «убрать рид-онли/эдитэйбл, по умолчанию редактируемой,
// форма сохранения как в выравнивании»): the Library sequence is now
// editable by default and edits go to a TRANSIENT working buffer
// (edits.editedSequence/editedAnnotations/editLog) via the SAME pure
// indel-aware helper + provenance engine the aligner uses; an explicit
// «Сохранить версию» commits a new branch (createManualEditBranch).
import { applySequenceEditToEntry } from '../lib/library-sequence-edit';
import { enrichEditDescriptor, mergeCorrection } from '../../../lib/alignment/describe-edit';
import { rotateOriginToPosition } from '../../../rotate-origin';
import { useEntryPrimers } from './hooks/useEntryPrimers';
import { useInspectorSelectionNav } from './hooks/useInspectorSelectionNav';
import { usePromoteToCommon } from '../../SequenceView/hooks/usePromoteToCommon';

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
  // LibraryWorkspace persists silently and passes false to hide explicit
  // «Перезаписать» / «Сохранить как версию» controls (they'd misleadingly flag
  // «несохранено» right after a silent save).
  showSaveActions = true,
  // Direct-persist editors in the Overview tab. Absent ⇒ read-only.
  onUpdateTags,
  onUpdateTopology,
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
  // Idle pre-warm: mount heavy tabs in background (display:none) via
  // requestIdleCallback so subsequent tab click is instant. Resets on
  // plasmid switch. V49 50-sec-hang guard preserved (test mode = OFF).
  const itemKey = item ? (item.id || item._fileName || item.name || '') : null;
  const warmedTabs = useIdlePrewarm({ itemKey, activeTab, testMode: __PREWARM_DISABLED__ });

  // Caret / selection / LinearFeatureBar navigation — extracted to
  // hooks/useInspectorSelectionNav (decomposition 18.05.2026; the file
  // hit 39.34/40 KB hard). Pure move — behaviour unchanged.
  const {
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
    scrollToPos,
  } = useInspectorSelectionNav({ activeTab, onActiveTabChange, itemKey });

  // V181 / UX-2 — shared feature selection across the Overview (map) and
  // Sequence tabs. Clicking a feature on the map / list sets this; the map
  // highlights it AND, after navigating, the sequence track highlights the
  // same feature (the tabs aren't co-visible, so this is the cross-tab sync).
  const [selectedRegionId, setSelectedRegionId] = useState(null);
  // Drop a stale highlight when the inspected entry changes.
  useEffect(() => { setSelectedRegionId(null); }, [itemKey]);

  // Overview feature click → jump to the Sequence tab + scroll to the
  // feature start (reuses the strip-nav primitive). Works in both hosts.
  const onNavigateToFeature = useCallback((region) => {
    if (region && Number.isFinite(region.start)) onBarSettle(region.start);
    setSelectedRegionId(region?.id ?? null);
  }, [onBarSettle]);

  // P3 / U5-A — consume a parked sequence-nav request once THIS entry is mounted: select the locus,
  // force-scroll to it, and — when a single caret cannot express it (origin wrap, `both` strand) —
  // keep the canonical occurrence as the jump's OWN highlight. `navHits` is that highlight; it is
  // NOT the Ctrl+F `searchHits` slice, and SequenceTab paints both. Extracted to its own hook (this
  // file reached the 40 KB hard budget); the ownership contract lives in `useSequenceNavConsumer`.
  const { navHits } = useSequenceNavConsumer({
    item, edits, activeTab, onActiveTabChange, onSelectRangeFromView, scrollToPos,
  });
  // Editable by default (Игорь 17.06.2026 — «рид-онли/эдитэйбл убрать,
  // сделать редактируемой»). The read-only/editable pill (DEC-LIB-16 ⚓)
  // and the read-only banner (DEC-MX7A-V2-05) are gone; every plasmid is
  // editable, edits stay TRANSIENT until «Сохранить версию» (see below).
  const editable = true;

  // 18.05.2026 — primer redesign on every SequenceView, Library
  // included. Primers persist to the unified pool, entry-scoped.
  const {
    primers: entryPrimers,
    // PRIMER-LIVE-1 — the freezer, and the two actions that touch it. Without
    // these reaching the viewer the «already in the lab» answer had nothing to
    // answer from, and reuse had nothing to call.
    labPrimers: entryLabPrimers,
    onWritePrimer: onWriteEntryPrimer,
    onDeletePrimer: onDeleteEntryPrimer,
    onReuseLabPrimer: onReuseEntryLabPrimer,
  } = useEntryPrimers(item);

  // ANN-0L C2 — which document the viewers are showing. A primer's source site
  // is evidence about ONE version of ONE molecule, so the viewer needs both the
  // entry and its current content identity to decide whether the coordinates
  // still describe what is on screen. While an unsaved edit buffer is in play
  // there is no saved identity to verify against, so the hash is deliberately
  // null and every targeted source site fails closed rather than showing a
  // position that may already have moved.
  const viewerEntryId = item?._libraryEntryId || item?.id || null;
  const viewerDocumentHash = edits?.editedSequence != null
    ? null
    : (item?.resourceHash || item?.payload?.resourceHash || null);
  // SPEC_COMMON_FEATURES DEC-CF-05 — «Add to common features» in the Library
  // inspector (an IN viewer). The hook reads the overlay slice; the consumer
  // gate (passing these to SequenceTab) keeps it out of the OUT viewers.
  const { onPromoteToCommon, checkCommonDuplicate } = usePromoteToCommon();

  // Save flow (now version-only, with the edited SEQUENCE). Surfaces the
  // «что изменено» summary (from edits.editLog) + the «Сохранить версию»
  // form (name + changes + reason) — same shape as the aligner.
  const saveFlow = useLibrarySaveFlow({ item, edits, onUpdateEdits });
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

  // M-X.6 K12.4 (TD-LIB-K4-AUTO-TRIGGER) — auto-trigger L1 on first
  // open of an entry imported with `ext.annotationChoice === 'auto'`
  // (preserved for compatible imported entries). Plan: run once per
  // entry — `ext.autoRun.done` flag prevents re-triggering on
  // subsequent opens. Switches to the Annotations tab so biolog sees
  // the L1 progress; embedded Annotator's auto-run pipeline picks up
  // the new scope on its own.
  const markAutoRunDone = useStore((s) => s.markLibraryEntryAutoRunDone);
  useEffect(() => {
    const libId = item?._libraryEntryId;
    if (!libId) return;
    const entry = useStore.getState().libraryEntries?.[libId];
    if (!entry) return;
    const ext = entry.ext || {};
    if (ext.annotationChoice !== 'auto') return;
    if (ext.autoRun?.done) return;
    // Open Annotator + mark done. Fire-and-forget — embedded
    // Annotator handles the actual L1 run via runAnnotatorPipeline.
    onOpenAnnotator({ kind: 'full' });
    if (typeof markAutoRunDone === 'function') {
      markAutoRunDone(libId);
    }
    // We intentionally depend only on item identity — re-running the
    // effect on store changes would loop with the slice action mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?._libraryEntryId]);

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
    currentSequence: edits?.editedSequence ?? item?.sequence,
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

  // 17.06.2026 — nucleotide edit → TRANSIENT working buffer (NOT autosaved,
  // NO branch-confirm). Mirrors the aligner: apply the op to {editedSequence
  // ?? source, editedAnnotations ?? source} via the shared pure helper,
  // accumulate a «что изменено» log (same describe-edit engine), and buffer
  // it via onUpdateEdits. The source library entry is untouched until the
  // biolog clicks «Сохранить версию». Caret follows the edit.
  const onSequenceEditFromView = useCallback((op) => {
    if (!op || typeof onUpdateEdits !== 'function') return;
    const curItem = itemRef.current;
    const curEdits = editsRef.current;
    const baseSeq = (curEdits?.editedSequence != null) ? curEdits.editedSequence : (curItem?.sequence || '');
    const baseAnns = Array.isArray(curEdits?.editedAnnotations)
      ? curEdits.editedAnnotations
      : (curItem?.annotations || []);
    const res = applySequenceEditToEntry({ payload: { sequence: baseSeq, annotations: baseAnns } }, op);
    if (!res.ok) return;
    // Undo snapshot BEFORE the edit (annotations + sequence), so Ctrl+Z
    // restores both through the unified stack.
    pushSnapshot(baseAnns, baseSeq);
    const nextLog = mergeCorrection(
      Array.isArray(curEdits?.editLog) ? curEdits.editLog : [],
      enrichEditDescriptor(op, baseSeq),
    );
    onUpdateEdits({
      editedSequence: res.sequence,
      editedAnnotations: res.annotations,
      editLog: nextLog,
    });
    if (Number.isFinite(res.caretAfter)) {
      setCursorPos(res.caretAfter);
      setCursorAnchor(res.caretAfter);
    }
  }, [onUpdateEdits, pushSnapshot, setCursorPos, setCursorAnchor]);

  // «Ноль-точка» (origin) — rotate the circular plasmid so the chosen 1-based
  // base becomes position 1 (Игорь: «выбор топологии должен давать выбрать
  // ноль-точку» — было, пропало при чистке). Physically rotates the sequence +
  // remaps annotations (shared rotate-origin engine), lands in the SAME
  // transient buffer + version-save path as a nucleotide edit. Source untouched.
  const onApplyOrigin = useCallback((pos1) => {
    if (typeof onUpdateEdits !== 'function') return;
    const curItem = itemRef.current;
    const curEdits = editsRef.current;
    const baseSeq = (curEdits?.editedSequence != null) ? curEdits.editedSequence : (curItem?.sequence || '');
    const baseAnns = Array.isArray(curEdits?.editedAnnotations)
      ? curEdits.editedAnnotations
      : (curItem?.annotations || []);
    const len = baseSeq.length;
    if (!len || !(pos1 > 1 && pos1 <= len)) return;
    const out = rotateOriginToPosition(baseSeq, baseAnns, pos1, { topology: 'circular' });
    pushSnapshot(baseAnns, baseSeq);
    const nextLog = mergeCorrection(
      Array.isArray(curEdits?.editLog) ? curEdits.editLog : [],
      { kind: 'origin', position: pos1 },
    );
    onUpdateEdits({ editedSequence: out.sequence, editedAnnotations: out.annotations, editLog: nextLog });
    setCursorPos(0);
    setCursorAnchor(0);
  }, [onUpdateEdits, pushSnapshot, setCursorPos, setCursorAnchor]);

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
        // Snapshot the pre-batch state so Ctrl+Z can undo an annotator batch
        // (was the остаток of «Ctrl+Z этап 2» — annotator-batch had no snapshot).
        pushSnapshot(baseAnnotations);
        onUpdateEdits({ editedAnnotations: next });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[SingleInspector] annotator apply failed:', err.message);
    }
    closeAnnotator?.();
  }, [onUpdateEdits, item, edits, closeAnnotator, pushSnapshot]);

  // «Убрать дубли» (Игорь 17.06) — remove redundant overlapping annotations
  // from the DATA (same rule the map uses to hide them): a generic feature
  // covered ~identically by a higher-priority one (e.g. bla(M) marker under the
  // AmpR CDS). Annotation-only edit → autosaved in place (not versioned),
  // Ctrl+Z-undoable via the snapshot. No-op when nothing is dominated.
  const dominatedAnnotationIds = useMemo(() => {
    const base = Array.isArray(edits?.editedAnnotations)
      ? edits.editedAnnotations
      : (item?.annotations || []);
    return new Set(findDominatedRegions(getRegions(base)).map((r) => r.id));
  }, [edits?.editedAnnotations, item?.annotations]);
  const onRemoveDuplicates = useCallback(() => {
    if (!onUpdateEdits || dominatedAnnotationIds.size === 0) return;
    const base = Array.isArray(edits?.editedAnnotations)
      ? edits.editedAnnotations
      : (item?.annotations || []);
    const next = base.filter((a) => !dominatedAnnotationIds.has(a.id));
    if (next.length !== base.length) {
      pushSnapshot(base);
      onUpdateEdits({ editedAnnotations: next });
    }
  }, [onUpdateEdits, item, edits, dominatedAnnotationIds, pushSnapshot]);

  if (!item) return null;
  const length = item.length || item.sequence?.length || 0;
  const topology = item.topology || 'linear';
  const regionCount = getRegions(item.annotations || []).length;
  // C14 (audit) — Library entries never carry commits[], so the History tab was
  // always hidden + its branch unreachable (commit history lives in the container
  // editor). Removed here; the tab stays in ContainerEditorSkeleton where it works.
  // Use edited annotations if present (live edit), otherwise fall back to file's.
  const displayAnnotations = Array.isArray(edits?.editedAnnotations)
    ? edits.editedAnnotations
    : (item.annotations || []);
  const displayItem = { ...item, annotations: displayAnnotations };

  // FEAT-EXTRACT — «Извлечь в библиотеку»: splice the region out of its genomic
  // context (introns removed, strand-aware) → mature cDNA → a fresh loose Library
  // entry. The daily clone-a-CDS-from-a-multi-intron-locus move. Protein is left
  // for a follow-up (depends on per-CDS genetic-code = FEAT-TRANSL-TABLE).
  const onExtractFeature = useCallback(({ region }) => {
    if (!region) return;
    const seq = edits?.editedSequence ?? item?.sequence ?? '';
    const r = extractFeatureSequences(seq, region, displayAnnotations);
    if (!r || !r.cdna) return;
    const entry = buildLibraryEntry(
      {
        sequence: r.cdna,
        topology: 'linear',
        description: `cDNA · извлечено из ${item?.name || 'фрагмента'}${r.intronsRemoved ? ` (убрано интронов: ${r.intronsRemoved})` : ''}`,
      },
      r.cdnaName,
      null,
    );
    useStore.getState().addLibraryEntry(entry);
  }, [edits, item, displayAnnotations]);

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
        saveFlow={showSaveActions ? saveFlow : undefined}
        cursorPos={cursorPos}
        cursorAnchor={cursorAnchor}
        cursorSelectionMode={cursorSelectionMode}
      />
      {/* UX-6 — live protein-effect verdict of a pending sequence edit
          (silent ✓ / missense / truncation / frameshift ⚠), evaluated on the
          ORIGINAL CDS coords. Renders null when there's no edit / no CDS. */}
      {showSaveActions && (
        <div style={{ padding: '0 12px', marginTop: -2 }}>
          <ProteinEffectBadge
            originalSequence={item.sequence}
            editedSequence={edits?.editedSequence}
            annotations={item.annotations}
          />
        </div>
      )}
      {/* M-X.6 K0 — title row JSX moved into LibraryInspectorTitleRow.
          Legacy inline structure dropped below; the comment block
          above used to wrap the visible markup. */}

      <TabBar
        activeTab={activeTab}
        onChange={onActiveTabChange}
        showHistory={false}
        showAnnotations={false}
        annotatorActive={activeTab === 'annotations'}
        onToggleAnnotator={() => onActiveTabChange?.(
          activeTab === 'annotations' ? 'sequence' : 'annotations',
        )}
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
            <OverviewTab
              item={displayItem}
              onUpdateTags={onUpdateTags}
              onUpdateTopology={onUpdateTopology}
              onNavigateToFeature={onNavigateToFeature}
              selectedRegionId={selectedRegionId}
              onApplyOrigin={onApplyOrigin}
              primers={entryPrimers}
            />
          </div>
        )}
        {isMounted('sequence') && (
          <div
            className="importer-tab-pane"
            data-tab-active={activeTab === 'sequence' ? 'true' : 'false'}
            style={visibilityStyle('sequence')}
          >
            <SequenceTab
              entryId={item.id}
              navHits={navHits}
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
              selectedRegionId={selectedRegionId}
              onAnnotationClick={(region) => setSelectedRegionId(region?.id ?? null)}
              editable={editable}
              onSequenceEdit={onSequenceEditFromView}
              primers={entryPrimers}
              entryId={viewerEntryId}
              documentHash={viewerDocumentHash}
              labPrimers={entryLabPrimers}
              onReuseLabPrimer={onReuseEntryLabPrimer}
              onWritePrimer={onWriteEntryPrimer}
              onDeletePrimer={onDeleteEntryPrimer}
              onPromoteToCommon={onPromoteToCommon}
              checkCommonDuplicate={checkCommonDuplicate}
              onExtractFeature={onExtractFeature}
              showSelectionTm
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
              duplicateCount={dominatedAnnotationIds.size}
              onRemoveDuplicates={onRemoveDuplicates}
              // 2026-05-06 — biolog: «навигация по колбасе аннотатора
              // не даёт навигацию в аннотаторе». Wire the same
              // pendingScroll signal that SequenceTab consumes so the
              // bar's click/drag scrolls the Annotator's preview view
              // when the user is on the Annotations tab.
              pendingScroll={activeTab === 'annotations' ? pendingScroll : null}
              onPendingScrollHandled={onPendingScrollHandled}
              primers={entryPrimers}
              entryId={viewerEntryId}
              documentHash={viewerDocumentHash}
              labPrimers={entryLabPrimers}
              onReuseLabPrimer={onReuseEntryLabPrimer}
              onWritePrimer={onWriteEntryPrimer}
              onDeletePrimer={onDeleteEntryPrimer}
            />
          </div>
        )}
      </div>
      {/*
        Sprint M-X.2 K9 — Annotator fullscreen overlay. Mounted
        INSIDE the inspector for direct access to the displayed
        item's sequence + annotations + onUpdateEdits flow.

        The Annotator stays mounted inside the inspector for direct
        access to the active sequence, annotations, and edit callbacks.
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
    </div>
  );
}
