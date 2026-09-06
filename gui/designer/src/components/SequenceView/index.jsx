/**
 * SequenceView — display-only sequence viewer (Sprint M-B.3 K6 final;
 * decomposed in Sprint M-X.2 K1 from a single 78.54 KB file into a
 * thin orchestrator + per-concern modules under this folder).
 *
 * Render order per line (DNA-first layout, biolog feedback 03.05.2026:
 * «первично будет всё же ДНК, а фичи аннотации и АА под ДНК»):
 *   PrimerTrack          — top, points at DNA below
 *   RestrictionTrack     — top, RE sites mark DNA below
 *   RulerTrack           — top, numbers DNA below
 *   StrandsTrack top     — DNA forward (primary)
 *   StrandsTrack bottom  — DNA reverse (only when settings.showBottomStrand)
 *   AnnotationTrack      — feature bars BELOW DNA
 *   AATrack forward      — translation, below annotation (always)
 *   AATrack reverse      — only when strategy === 'hybrid'
 *
 * Layer separation (DEC-SQV-07): NO container imports. Plain
 * `fragments` shape only. M-C wraps this with commit-resolution; this
 * file stays reusable in Importer / Container Window / Mix Workspace.
 *
 * K1 decomposition map (Sprint M-X.2):
 *   constants.js                    — LABEL_WIDTH + EMPTY_* + IS_TEST_ENV
 *   lib/feature-map.js              — buildFeatureMap, mergeWithPredicted,
 *                                      buildLineAnnMap, flattenSites
 *   lib/scroll-handle.js            — findScrollingAncestor, attachScrollHandle
 *   overlays/CaretOverlay.jsx       — caret marker over DNA strand row(s)
 *   overlays/SelectionOverlay.jsx   — orange DNA + blue AA selection rects
 *   popups/SelectionContextMenu.jsx — tri-modal copy menu (DEC-SV-04)
 *   hooks/useSequenceKeyboard.js    — onRootKeyDown (caret + Ctrl+C/Alt+C/
 *                                      Shift+C). K3 will extend with Del/H/E.
 *   hooks/useSelectionState.js      — pointer drag (DNA + AA), context menu
 *                                      state, copy dispatcher, click fallback,
 *                                      edge auto-scroll
 *   SequenceLine.jsx                — memoized per-line subtree
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useStore, selectActiveSetEnzymes } from "../../store";
import { SEQUENCE_VIEW_DEFAULTS } from "../../store/uiSlice.js";
import {
  SEQUENCE_FONT_FAMILY,
  measureCharPx,
  linesFromSeq,
} from "./lib/grid.js";
import {
  shouldEnableWrapTail,
  pickWrapTailLines,
  buildWrapTailLines,
  buildWrapBridgeLine,
  filterAnnotationsForLine,
} from "./lib/wrap-tail.js";
import { detectORFRanges } from "./lib/orf-ranges.js";
import { resolveFramesMode } from "./lib/frames-mode.js";
import { useRowSelectionIsolation } from "./lib/row-selection-isolation.js";
import { scanAllSites, RE_ENZYMES } from "../../restriction-db.js";
import { stickyEnds as computeStickyEnds } from "./lib/selection-ops.js";
import { FEATURE_STROKE } from "../../feature-palette.js";
import { enclosingRegionId } from "../../annotation-model.js";

import {
  LABEL_WIDTH,
  EMPTY_PRIMERS,
  EMPTY_PREDICTIONS,
  __IS_TEST_ENV__,
} from "./constants.js";
import { flattenSites } from "./lib/feature-map.js";
import { buildSequenceDisplayContext } from "./lib/display-context.js";
import { attachScrollHandle, findScrollingAncestor } from "./lib/scroll-handle.js";
import {
  shouldVirtualize, computeDesiredWindow, windowsEqual, isActiveIdx, DEFAULT_OVERSCAN,
  directionalOverscan,
} from "./lib/line-window.js";
import CaretOverlay from "./overlays/CaretOverlay.jsx";
import SelectionOverlay from "./overlays/SelectionOverlay.jsx";
import OriginMarkerOverlay from "./overlays/OriginMarkerOverlay.jsx";
import SearchHitsOverlay from "./overlays/SearchHitsOverlay.jsx";
import SegmentZonesOverlay from "./overlays/SegmentZonesOverlay.jsx";
import { computeSeamRecessBlanks } from "./seam-staircase";
import OutOfRangeMaskOverlay from "./overlays/OutOfRangeMaskOverlay.jsx";
import { flankedSpan } from "./lib/primer-flank.js";
import { projectPrimerPool } from "../../lib/primer-site-projection.js";
import {
  fitPrimerAwareCharsPerLine,
  primerInsertionEdgeGuardChars,
} from "./lib/primer-edge-layout.js";
// PRIMER-LIVE-1 — the selection actions and the anchored primer draft live
// in small owners; this file only routes props into them.
import PrimerSelectionActions from "./PrimerSelectionActions.jsx";
import PrimerFromSelectionModal from "./popups/PrimerFromSelectionModal.jsx";
import PromoteToCommonModal from "./popups/PromoteToCommonModal.jsx";
import { reverseComplement, complement } from "../../sequence-utils.js";
import SelectionContextMenu from "./popups/SelectionContextMenu.jsx";
import { buildSelectionMenuItems } from "./popups/build-selection-menu-items.js";
import SequenceFloatingTooltips from "./overlays/SequenceFloatingTooltips.jsx";
import CreateAnnotationPopup from "./popups/CreateAnnotationPopup.jsx";
import EditAnnotationModal from "./popups/EditAnnotationModal.jsx";
import { useSequenceKeyboard } from "./hooks/useSequenceKeyboard.js";
import { usePieceHotkey } from "./hooks/usePieceHotkey";
import { usePrimerHotkeys } from "./hooks/usePrimerHotkeys";
import { usePrimerEditor } from "./hooks/usePrimerEditor";
import { usePrimerDisclosure } from "./hooks/usePrimerDisclosure";
import { useHotkey } from "../../lib/hotkeys";
import { useSelectionState } from "./hooks/useSelectionState.js";
import { useSelectionContract } from "./hooks/useSelectionContract.js";
import { buildSequencePasteOp } from "./lib/paste-op.js";
import { useSelectionEdit } from "./hooks/useSelectionEdit.js";
import { useAnnotationDrag } from "./hooks/useAnnotationDrag.js";
import { useAnnotationRename } from "./hooks/useAnnotationRename.js";
import InlineRenameInput from "./popups/InlineRenameInput.jsx";
import SequenceLine from "./SequenceLine.jsx";
import PrimerInspectorPanel from "./PrimerInspectorPanel.jsx";

// Stable empty default for the optional `searchHits` prop — keeps
// memo deps cheap (a fresh `[]` per render would invalidate child
// useMemos that depend on the array reference).
const EMPTY_SEARCH_HITS = Object.freeze([]);

export { FEATURE_STROKE, LABEL_WIDTH };

/**
 * Selector — direct slice read so React doesn't see a new object on
 * every render (a wrapping selector that returned `{...}` would feed
 * Zustand a fresh reference each call → "Maximum update depth exceeded"
 * loop in React 19). Falls back to defaults when isolated test
 * harnesses set `state.sequenceView` to undefined.
 */
const sliceSelector = (state) =>
  state && state.sequenceView ? state.sequenceView : SEQUENCE_VIEW_DEFAULTS;

// RC-B1 — stable resolution object for an active reading-frame override (frozen so
// its identity never churns; avoids re-rendering every line/overlay each frame the
// upstream framesResolution recomputes while a frame is pinned). Review nit.
const FRAME_OVERRIDE_RESOLUTION = Object.freeze({ strategy: 'hybrid', dominant: null, coverage: 0 });

const SequenceView = forwardRef(function SequenceView({
  fragments,
  circular = false,
  // ANN-0L C2 — which molecule, and which version of it, this view is showing.
  // A primer's source site is only evidence about the document it was declared
  // against; without these the track cannot tell, and fails closed.
  entryId = null,
  documentHash = null,
  topology,
  // Terminal sticky-end staircase (Игорь 22.06 «физическая ступенька»):
  // { left, right } from terminalStagger(segment, RE_ENZYMES). Null → no staircase.
  terminalStagger = null,
  // RC-CLOSE-GATE — the ring-closing junction { interlock, kind, selfClosure?, … }
  // for a CIRCULAR assembly; forwarded to SegmentZonesOverlay which draws the
  // closure verdict at the construct terminus. Null → nothing (back-compat).
  closureSeam = null,
  primers = EMPTY_PRIMERS,
  // eslint-disable-next-line no-unused-vars
  readOnly = true,
  onSelect,
  onAnnotationClick,
  // V181 / UX-2 — id of the feature selected elsewhere (plasmid map / inspector);
  // the matching annotation row highlights so selection syncs map↔sequence.
  selectedRegionId = null,
  onVisibleRangeChange,
  // eslint-disable-next-line no-unused-vars
  onMutate,
  // eslint-disable-next-line no-unused-vars
  onAddPrimer,
  // 12.05.2026 — clickable RE sites (skeleton container editor).
  // Library/Importer не передают prop → RestrictionTrack остаётся
  // display-only.
  onRestrictionClick,
  restrictionHighlightKey,
  // RS-PICK4 (Игорь 22.06: «выбор набора должен менять кол-во сайтов на
  // последовательности»). Opt-in enzyme ALLOW-LIST: when an array, it OVERRIDES
  // the store cut-count/active-set filter and shows exactly these enzymes' sites
  // (always on, like the map's digest mode). The assembly picker passes its
  // mapEnzymeFilter so the набор/picked/unique selection drives the sequence too.
  // undefined → store-driven behaviour (every other consumer unchanged).
  reEnzymesFilter = undefined,
  // Backbone-invert OVERRIDE (assembly picker): when a boolean, it CONTROLS the
  // selection-complement highlight, superseding the hook's internal `inverted`
  // (the right-click «Инвертировать выделение»). Aliased to avoid colliding with
  // that hook value. undefined → hook-driven (every other consumer unchanged).
  inverted: invertedProp = undefined,
  caretPos = null,
  caretAnchor = null,
  selectionMode = null,
  // V76 — opt-in near-cursor annealing-Tm readout for DNA selections
  // (PCR viewer enables it; Library/Importer leave it off).
  showSelectionTm = false,
  selectionStrand = 1,
  onCaretChange,
  onSelectRange,
  // M-X.6 K2 — DEC-MX6-02 char-apply gate. See useSequenceKeyboard.
  editable = false,
  onSequenceEdit,
  // Sprint M-X.2 K3 — annotation edit operations. Parent wires
  // `onAnnotationEdit({kind, id?, patch?, payload?})` into its
  // `onUpdateEdits({editedAnnotations})` flow. `onOpenAnnotator`
  // opens the fullscreen Annotator (K8) scoped to a region.
  onAnnotationEdit,
  onOpenAnnotator,
  // Sprint M-X.3 follow-up — double-click on a feature now routes
  // to a dedicated FeatureEditorModal (rename / type / coords /
  // strand / split / merge / introns) instead of opening the
  // fullscreen Annotator. Falls back to `onOpenAnnotator` only
  // when this prop is missing (legacy callers preserved).
  onOpenFeatureEditor,
  // Sprint M-X.3 follow-up — biolog: «выдлять последовательность - а
  // дальше уже эту последоватность дать возможность бластить».
  // Wired by the embedded Annotator's PreviewTab to dispatch a
  // region-scoped Level-3 BLAST run.
  onBlastSelection,
  // V74 — PCR viewer: when wired, the right-click selection menu gains
  // «Прямой праймер» / «Обратный праймер». Called with
  // { direction:'forward'|'reverse', start, end }. Consumer-gated, same
  // as onBlastSelection — Library/Importer leave it undefined.
  onWritePrimer,
  // PRIMER-LIVE-1 — pass-through only. `labPrimers` are the personal
  // inventory records the host hydrated; `onCreatePcrProduct` is the single
  // action for two chosen landings, routed to the host's existing piece path.
  labPrimers = EMPTY_PRIMERS,
  onReuseLabPrimer,
  onCreatePcrProduct,
  onAAClick = null,
  // Assembly editor — Del on a SELECTED primer deletes it (consumer-gated,
  // same pattern as onWritePrimer). Called with the primer hit; the assembler
  // resolves hit.id → removeAssemblyPrimer. Library/Importer leave it
  // undefined → Del on a selected primer is swallowed (read-only), never
  // touching the nucleotide.
  onDeletePrimer,
  // T5 DEC-T5-01 — consumer-gated piece authoring (same pattern as
  // onWritePrimer). Container Editor passes it; other consumers don't.
  onCreatePiece,
  // SPEC_COMMON_FEATURES DEC-CF-05 — consumer-gated «Add to common features»
  // (same pattern as onWritePrimer). Undefined ⇒ no menu item / no modal.
  onPromoteToCommon,
  // FEAT-EXTRACT — consumer-gated «extract feature → Library entry». Passed
  // straight to the selection menu; the host does the splice + entry creation.
  onExtractFeature,
  checkCommonDuplicate,
  // M-X.9 K2 follow-up (TD-SEARCH-OVERLAY-RECTS) — Ctrl+F search
  // hits to render as overlay rects + mismatch ticks. Each hit:
  //   { targetStart, targetEnd, queryIdentity, mismatchPositions[], strand }
  // Empty array = no overlays. Caller (SequenceTab) reads from
  // `state.searchHits` and filters by entryId.
  searchHits = EMPTY_SEARCH_HITS,
  // A2 / G2 (DEC-CANVAS-ASM-14) — opt-in coloured segment backdrop for
  // the assembly editor. `coloredZones: [{zoneId,start,end,color,
  // label?,isOrphan?}]`. onZoneClick/onZoneHover delegate to the shell
  // (open SegmentDetailPanel). Library / Importer / PCR leave undefined
  // → SegmentZonesOverlay renders null (back-compat).
  coloredZones,
  // T6 K13 (DEC-T6 §5.7) — 4-tier vocabulary alias for `coloredZones`.
  // Assembly / sequence mode passes `pieceZones`; legacy callers
  // (Library / Importer / PCR) keep passing `coloredZones`. Resolution:
  // `pieceZones ?? coloredZones` (R-T6-6 back-compat).
  pieceZones,
  onZoneClick,
  onZoneHover,
  // V87 — out-of-range mask for the RangePickerModal viewer:
  // {start, end} dims everything in main band OUTSIDE [start, end] so
  // the selected slice reads as foreground. Library / Importer / PCR
  // leave it undefined → overlay renders nothing (back-compat).
  outOfRangeMask = null,
  // «Align to reference» (opt-in). `alignmentRead` = adapter output from
  // lib/alignment/align-to-reference.js → read drawn as a track beneath the
  // reference; `chromatogram` → Sanger trace below the read. Both undefined for
  // every existing consumer → no behaviour change.
  alignmentRead = null,
  // Multi-read stack (P6): array of read rows incl. an optional consensus row.
  alignmentReads = null,
  chromatogram = null,
  chromatogramMaxVal = 1,
  // «Align to reference» display knobs (opt-in). `showBottomStrand` OVERRIDES
  // the user setting when defined — the align view passes `false` to drop the
  // complementary strand (the read, not the reverse strand, is what matters).
  // Left undefined by every other consumer → the store setting wins, no change.
  // `alignmentColorMode` ('plain'|'nucleotide') colours the aligned read bases.
  showBottomStrand: showBottomStrandProp = undefined,
  alignmentColorMode = 'plain',
  // Per-line align labels (opt-in): reference name in the top-strand gutter,
  // read name in the read-track gutter.
  alignmentReferenceName = undefined,
  alignmentReadName = undefined,
  // AA-effect badges per ref position (align CDS mismatches): {pos -> {effect}}.
  aaEffects = undefined,
  // P3 — «accept read base» (pairwise): onAcceptBase(refPos, readBase).
  onAcceptBase = null,
  // Layer toggles (opt-in, default visible). Align view drives these from its
  // toolbar; every other consumer keeps the current behaviour.
  showAnnotations = true,
  showAATrack = true,
  // Hosts that show this molecule in two simultaneous SequenceLine consumers
  // may provide the already-computed display features. This keeps predicted
  // and confident annotations identical and avoids running predictors twice.
  displayFeatures = null,
}, ref) {
  const containerRef = useRef(null);
  const [charPx, setCharPx] = useState(7.2);
  const [charsPerLine, setCharsPerLine] = useState(80);
  // Sprint M-X.3 K5 — viewport height + measured main-line height
  // drive `shouldEnableWrapTail`. Updated alongside charPx in the
  // ResizeObserver below. Defaults are pessimistic so wrap-tail
  // turns ON on first paint for circular plasmids ≥3 lines (matches
  // K2 baseline behaviour); the auto-disable kicks in once the real
  // measurements come back.
  const [viewportHeight, setViewportHeight] = useState(800);
  const [mainLineHeight, setMainLineHeight] = useState(120);
  // `measured` gate — see Sprint M-B.3 K7 notes: container mounts
  // immediately so ResizeObserver can observe, but lines don't render
  // until the first valid width measurement comes back. Pre-warm
  // scenario (SingleInspector mounts SequenceView in `display:none`
  // for idle pre-warm) returns clientWidth=0 → wait for the
  // ResizeObserver → no narrow-then-wide flash on tab activation.
  const [measured, setMeasured] = useState(false);

  // V96 — layout epoch. Bumped whenever the rendered lines reflow:
  // the two-phase `tracksReady` flip grows line height (annotation +
  // AA tracks mount), and charsPerLine / wrap-tail changes shift rows.
  // Threaded into every geometry-measuring overlay (Selection, OOR,
  // Caret, SearchHits, SegmentZones) so each re-measures against the
  // FINAL layout without needing a click to move the caret. Effect
  // that increments it sits just past the `linesJsx` memo below.
  const [layoutEpoch, setLayoutEpoch] = useState(0);

  // Per-row selection scoping — drag-to-select stays inside ONE row
  // at a time, so the user can copy e.g. just the reverse strand or
  // just one AA frame.
  useRowSelectionIsolation(containerRef);

  // Imperative scroll-to-position handle (Importer-merge-tabs K1).
  // Queue + drain pattern handles requests that arrive BEFORE lines
  // have mounted (biolog clicks LinearFeatureBar while still on the
  // Overview tab → SequenceTab pre-warm not mounted yet).
  const pendingScrollPosRef = useRef(null);
  const pendingScrollOptsRef = useRef(null);
  const performScrollRef = useRef(null);
  performScrollRef.current = useMemo(() => {
    const factory = attachScrollHandle(ref, containerRef);
    return factory().scrollToPosition;
  }, [ref]);
  useImperativeHandle(ref, () => ({
    scrollToPosition(absolutePos, opts) {
      const root = containerRef.current;
      const haveLines = !!(root && root.querySelector(
        '[data-testid="sequence-view-line"]',
      ));
      if (!haveLines) {
        pendingScrollPosRef.current = absolutePos;
        pendingScrollOptsRef.current = opts || null;
        return;
      }
      performScrollRef.current?.(absolutePos, opts);
      pendingScrollPosRef.current = null;
      pendingScrollOptsRef.current = null;
    },
  }), []);
  useEffect(() => {
    if (!measured) return;
    if (pendingScrollPosRef.current == null) return;
    const id = requestAnimationFrame(() => {
      if (pendingScrollPosRef.current == null) return;
      performScrollRef.current?.(pendingScrollPosRef.current, pendingScrollOptsRef.current);
      pendingScrollPosRef.current = null;
      pendingScrollOptsRef.current = null;
    });
    return () => cancelAnimationFrame(id);
  }, [measured]);

  // Two-phase render to keep first paint cheap on slow hardware.
  // Lines render with cheap orientation-critical tracks first (ruler
  // + DNA strands); heavier tracks fill in on the next idle frame.
  // Tests bypass via __IS_TEST_ENV__ so existing assertions on
  // annotation / AA tracks find them synchronously after `render()`.
  const [tracksReady, setTracksReady] = useState(__IS_TEST_ENV__);
  // V76 — last pointer position for the near-cursor Tm readout.
  const [tmPt, setTmPt] = useState(null);
  // 13.05.2026 — hover-only strand cut overlay. RestrictionTrack
  // notifies us on enter/leave; SequenceLine.reCutLayout gates strand
  // bars + overhang by this key.
  const [hoveredRestrictionKey, setHoveredRestrictionKey] = useState(null);

  const [promoteDraft, setPromoteDraft] = useState(null);

  useEffect(() => {
    if (tracksReady) return undefined;
    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(
        () => setTracksReady(true),
        { timeout: 250 },
      );
      return () => cancelIdleCallback(id);
    }
    const t = setTimeout(() => setTracksReady(true), 0);
    return () => clearTimeout(t);
  }, [tracksReady]);

  const settings = useStore(sliceSelector);
  // Effective bottom-strand visibility: the opt-in prop override wins when
  // defined (align view → false), otherwise the user setting drives it.
  const effShowBottomStrand = showBottomStrandProp == null
    ? settings.showBottomStrand
    : showBottomStrandProp;
  const showReSites = useStore((s) => s.showReSites);
  const reFilter = useStore((s) => s.reFilter);
  const reMinSiteLen = useStore((s) => s.reMinSiteLen);
  // RS-C4 — the «active set» enzyme allow-list (null = no active set). Restricts
  // which enzymes' sites are visible, applied on TOP of the cut-count filter.
  const activeSetEnzymes = useStore(selectActiveSetEnzymes);

  const predictionsSettings = settings.predictions || EMPTY_PREDICTIONS;
  // M-X.1 K3 — predicted regions stay transient. When an embedding host has
  // already computed the shared display set, the helper keeps that exact array
  // and skips a second predictor run.
  const { fullSeq, features } = useMemo(
    () => buildSequenceDisplayContext(fragments, predictionsSettings, displayFeatures),
    [fragments, predictionsSettings, displayFeatures],
  );
  const projectedPrimerOccurrences = useMemo(
    () => (fullSeq && Array.isArray(primers) && primers.length ? projectPrimerPool(primers, {
      template: fullSeq,
      entryId,
      documentHash,
      topology: topology || (circular ? 'circular' : 'linear'),
    }) : []),
    [primers, fullSeq, entryId, documentHash, topology, circular],
  );
  const primerEdgeGuardChars = primerInsertionEdgeGuardChars(projectedPrimerOccurrences);

  // P16 — pair selection and one expanded subject share one pure transition
  // owner. Document identity is part of that state, so a reused SequenceView
  // cannot edit/delete a hit retained from the previous library entry.
  const primerDisclosureScope = `${entryId ?? fragments?.[0]?.id ?? ''}|${documentHash ?? ''}|${
    circular ? 'circular' : 'linear'
  }`;
  const {
    selectedPrimers,
    selectedPrimerKeys,
    activePrimer,
    expandedPrimerKey,
    onPrimerClick,
    onDisclosureKeyDown,
    clearPrimerSelection,
  } = usePrimerDisclosure(primerDisclosureScope);

  const orfRanges = useMemo(() => detectORFRanges(fullSeq, 20), [fullSeq]);

  const {
    primerDraft,
    requestWritePrimer,
    buildPrimerDraft,
    selectedOccurrences,
    primersById,
    onReuseLabPrimerWithDocument,
    onPrimerDoubleClick,
    closePrimerDraft,
    submitPrimerDraft,
  } = usePrimerEditor({
    fullSeq,
    circular,
    entryId,
    documentHash,
    primers,
    selectedPrimers,
    onWritePrimer,
    onReuseLabPrimer,
  });

  const activeOccurrenceKey = activePrimer?.hit?._occKey || activePrimer?.key || null;
  const activeOccurrence = activeOccurrenceKey
    ? (selectedOccurrences.find((occurrence) => occurrence.key === activeOccurrenceKey) || null)
    : null;
  const activeOccurrenceIsLive = activeOccurrence != null && activeOccurrence.stale !== true;
  const activePrimerRecord = activePrimer && activeOccurrenceIsLive
    ? (primersById[activeOccurrence.primerId || activePrimer.hit?.id] || activePrimer.hit)
    : null;

  useEffect(() => {
    if (activePrimer && !activeOccurrenceIsLive) clearPrimerSelection();
  }, [activeOccurrenceIsLive, activePrimer, clearPrimerSelection]);

  // DEC-CF-05 — menu → draft. Bake region strand into the draft sequence
  // (coding 5'→3') so the hook translates protein in frame 0.
  const requestPromoteToCommon = useCallback(({ region, start, end }) => {
    if (!onPromoteToCommon || start == null || end == null) return;
    const slice = fullSeq.slice(start, end);
    const coding = region?.strand === -1 ? reverseComplement(slice) : slice;
    setPromoteDraft({
      name: region?.name || "",
      type: region?.type || "misc_feature",
      sequence: coding.toUpperCase(),
    });
  }, [onPromoteToCommon, fullSeq]);

  const framesResolution = useMemo(
    () =>
      resolveFramesMode(
        settings.framesMode,
        settings.autoThreshold,
        features,
        fullSeq.length,
        orfRanges,
      ),
    [settings.framesMode, settings.autoThreshold, features, fullSeq.length, orfRanges],
  );

  // RS-PICK4 — a stable key so the memo doesn't churn on the prop array identity.
  // Empty array → null (no override → store-driven), mirroring PlasmidMapV2 so the
  // map and the sequence stay consistent.
  const reEnzKey = Array.isArray(reEnzymesFilter) && reEnzymesFilter.length
    ? reEnzymesFilter.slice().sort().join('|') : null;
  const reSites = useMemo(() => {
    const override = reEnzKey != null;
    // Override (allow-list) shows its enzymes' sites regardless of the global
    // toggle; otherwise honour showReSites + the cut-count / active-set filter.
    if (!fullSeq || (!override && !showReSites)) return [];
    const scan = scanAllSites(fullSeq, { circular, minSiteLen: reMinSiteLen || 6 });
    if (override) {
      return flattenSites(scan, { enzymes: reEnzKey.split('|') });
    }
    return flattenSites(scan, { mode: reFilter, enzymes: activeSetEnzymes });
  }, [showReSites, fullSeq, circular, reMinSiteLen, reFilter, activeSetEnzymes, reEnzKey]);
  // The primer editor's template preview is contextual evidence, not the
  // optional global RE track. Compute it only while that editor is open, but
  // keep the same allow-list / cut-count semantics even when showReSites=false.
  const primerTemplateReSites = useMemo(() => {
    if (!primerDraft || !fullSeq) return [];
    const scan = scanAllSites(fullSeq, { circular, minSiteLen: reMinSiteLen || 6 });
    if (reEnzKey != null) {
      return flattenSites(scan, { enzymes: reEnzKey.split('|') });
    }
    return flattenSites(scan, { mode: reFilter, enzymes: activeSetEnzymes });
  }, [primerDraft, fullSeq, circular, reMinSiteLen, reFilter, activeSetEnzymes, reEnzKey]);

  // «Липкие концы» — when the current selection's ends land on restriction cuts
  // (reSites[].position is the top-strand cut), derive the per-end overhang so
  // SelectionOverlay can stagger the two strands. null when neither end is a cut.
  const stickyEndsInfo = useMemo(() => computeStickyEnds({
    selStart: Math.min(caretAnchor, caretPos),
    selEnd: Math.max(caretAnchor, caretPos),
    sites: reSites,
    enzymes: RE_ENZYMES,
  }), [caretAnchor, caretPos, reSites]);

  // Container measurement — useLayoutEffect (not useEffect) so the
  // remeasure happens BEFORE the first paint. Switching to
  // useEffect produced a narrow-then-wide flash on tab activation
  // (биолог 03.05.2026: «когда заходишь в сиквенс вью то сразу
  // происходит рендер сначала в узком формате…»).
  // UX-006 wire-up — Settings → Display & Defaults exposes a
  // user-tunable upper bound on row width. ResizeObserver still drives
  // auto-fit so a narrow viewport never overflows; the user knob just
  // says «but don't go wider than N». Read inside the layout effect
  // so a Settings change recomputes on next observer tick.
  const wrapPreferenceRef = useRef(150);
  const wrapPreference = useStore((s) => (
    s.displaySettings && Number.isFinite(s.displaySettings.sequenceWrap)
      ? s.displaySettings.sequenceWrap
      : 150
  ));
  useEffect(() => { wrapPreferenceRef.current = wrapPreference; }, [wrapPreference]);
  // Re-clamp current charsPerLine if the user shrinks the preference
  // mid-session (no remount / resize event needed).
  useEffect(() => {
    setCharsPerLine((prev) => Math.min(prev, wrapPreference));
  }, [wrapPreference]);

  useLayoutEffect(() => {
    const host = containerRef.current;
    if (!host) return;
    const remeasure = () => {
      const chW = measureCharPx(host);
      if (!chW) return;
      const available = host.clientWidth - 24;
      if (available <= 0) return; // host hidden / collapsed — wait for ResizeObserver
      const cap = wrapPreferenceRef.current || 150;
      const nextCpl = fitPrimerAwareCharsPerLine({
        availableChars: Math.floor(available / chW),
        labelChars: LABEL_WIDTH,
        edgeGuardChars: primerEdgeGuardChars,
        preference: cap,
      });
      // Sprint M-X.3 follow-up (05.05.2026) — biolog: «грузит процессор
      // на 30-60% даже просто в открытой вкладке без работы». The
      // ResizeObserver fires on every layout pass; without an equality
      // guard here, sub-pixel container width oscillation (scrollbar
      // appearing, theme repaint, animated sibling) re-runs setCharPx
      // / setCharsPerLine on every frame, which re-runs the whole
      // lines memo + downstream feature stacker. Functional setter
      // form lets React skip the update when the value is unchanged.
      setCharPx((prev) => (prev === chW ? prev : chW));
      setCharsPerLine((prev) => (prev === nextCpl ? prev : nextCpl));
      setMeasured((prev) => (prev ? prev : true));
      // K5 — viewport + line height for wrap-tail auto-disable.
      // Read host.clientHeight (visible area) and try to measure
      // a real main-line height by probing the first
      // [data-wraptail-kind="main"] line; fall back to the
      // pessimistic default if no line is in the DOM yet.
      const vh = host.clientHeight;
      if (Number.isFinite(vh) && vh > 0) {
        setViewportHeight((prev) => (prev === vh ? prev : vh));
      }
      const firstMain = host.querySelector(
        '[data-testid="sequence-view-line"][data-wraptail-kind="main"]',
      );
      if (firstMain) {
        const lh = firstMain.offsetHeight;
        if (Number.isFinite(lh) && lh > 0) {
          setMainLineHeight((prev) => (prev === lh ? prev : lh));
        }
      }
    };
    remeasure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(remeasure);
    ro.observe(host);
    return () => ro.disconnect();
  }, [primerEdgeGuardChars]);

  const baseLines = useMemo(
    () => linesFromSeq(fullSeq, charsPerLine),
    [fullSeq, charsPerLine],
  );
  // Round-10 (06.05.2026): when circular and last line is partial,
  // replace it with a wrap-bridge line that extends to a full cpl
  // by appending chars from the plasmid start. The bridge carries
  // wrapAt + wrapsOrigin so tracks + the inline origin divider can
  // adapt. Linear / full-cpl-last falls through unchanged.
  const lines = useMemo(() => {
    if (!circular) return baseLines;
    const bridge = buildWrapBridgeLine({ fullSeq, cpl: charsPerLine, circular });
    if (!bridge) return baseLines;
    if (baseLines.length === 0) return baseLines;
    const out = baseLines.slice(0, -1);
    out.push(bridge);
    return out;
  }, [baseLines, circular, fullSeq, charsPerLine]);

  // Sprint M-X.3 K5 — wrap-tail lines with viewport-aware auto-disable.
  // shouldEnableWrapTail returns false when (plasmid + 3 reserve
  // lines) fits the current viewport — biolog already sees the
  // whole plasmid, no need to dim-duplicate context. Linear
  // topology, short plasmids (<3 main lines), and tiny seq lengths
  // also disable. Origin marker still renders for any circular
  // topology (handled by OriginMarkerOverlay independently).
  const wrapTailLines = useMemo(() => {
    if (!circular || !fullSeq) return { leading: [], trailing: [] };
    // V102 (23.05) — wrap-tail is always on for circular plasmids (the
    // origin-crossing gate was reverted: it killed the feature for
    // ordinary plasmids and, being tied to the live selection, made
    // wrap-tail flicker during drag). Preview volume is a fixed ≈200 bp
    // (whole lines) per side, independent of plasmid length.
    if (!shouldEnableWrapTail({
      circular,
      seqLength: fullSeq.length,
      cpl: charsPerLine,
      viewportHeight,
      lineHeight: mainLineHeight,
    })) {
      return { leading: [], trailing: [] };
    }
    const count = pickWrapTailLines({ cpl: charsPerLine });
    if (count === 0) return { leading: [], trailing: [] };
    // Round-13: trailing rows start where the bridge wrap-half ends,
    // not at 0. Bridge already shows the first (cpl - wrapAt) chars
    // past origin; trailing[0] picks up at that position so there's
    // no duplication and selection paints continuously.
    const bridge = lines[lines.length - 1];
    const bridgeWrapped = (bridge && bridge.wrapsOrigin)
      ? Math.max(0, charsPerLine - bridge.wrapAt)
      : 0;
    return buildWrapTailLines({
      fullSeq,
      cpl: charsPerLine,
      leadingCount: count,
      trailingCount: count,
      trailingStart: bridgeWrapped,
    });
    // V102 (23.05) — wrap-tail no longer depends on features/primers/
    // selection: it's always on for circular plasmids, fixed volume. Deps
    // are only what the line math actually reads (topology, sequence,
    // wrap width, the bridge line).
  }, [circular, fullSeq, charsPerLine, lines, viewportHeight, mainLineHeight]);

  // ---- Virtualization (perf, 19.06.2026 — Игорь «выравниватель всё ещё
  // медленный» on >5 kb references). Only mount line indices near the
  // viewport; render the rest as fixed-height placeholders (SequenceLine
  // active={false}). Disabled in test env so all existing fixtures keep the
  // eager DOM (happy-dom doesn't measure layout anyway → the rect-driven
  // window can't be exercised there; correctness is covered by the pure
  // line-window unit tests + the SequenceLine placeholder test + browser
  // verification, the same approach as PERF-4/PERF-8). Size-gated so only
  // large sequences (the slow case) ever leave the eager path.
  const virtualize = !__IS_TEST_ENV__ && shouldVirtualize(lines.length);
  const [lineWindow, setLineWindow] = useState(null);
  const lineWindowRef = useRef(null);
  lineWindowRef.current = lineWindow;
  // Per-line measured heights (idx → border-box px), recorded as real lines
  // pass through the window. A placeholder for a measured line reuses ITS own
  // height, so total scrollHeight is invariant when a line flips real↔placeholder
  // — kills the end-of-scroll up/down jitter (heights vary: annotation/AA/read
  // tracks make some lines taller than a single `mainLineHeight` estimate).
  const lineHeightsRef = useRef(new Map());
  // Last measured firstVisibleIdx — for scroll velocity (lines/tick) → directional overscan.
  const lastFirstVisibleRef = useRef(NaN);

  // First-paint window (before the scroll driver has measured): a head band
  // sized to the viewport, so the very first render is already narrow — the
  // «появление» win doesn't wait a frame for the driver.
  const effectiveWindow = useMemo(() => {
    if (!virtualize) return null;
    if (lineWindow) return lineWindow;
    const lh = mainLineHeight > 0 ? mainLineHeight : 120;
    const vh = viewportHeight > 0 ? viewportHeight : 800;
    return computeDesiredWindow({
      count: lines.length,
      firstVisibleIdx: 0,
      lastVisibleIdx: Math.max(0, Math.ceil(vh / lh)),
      overscan: DEFAULT_OVERSCAN,
    });
  }, [virtualize, lineWindow, lines.length, viewportHeight, mainLineHeight]);

  const placeholderHeight = mainLineHeight > 0 ? mainLineHeight : 120;

  // Measure which rendered MAIN lines sit in the scroller viewport and
  // extrapolate the visible index band linearly from the nearest rendered
  // anchor (robust to the band being partly/fully off-screen after a jump —
  // converges in 1–2 ticks). Same scroller-resolution + rect approach as
  // AlignReferenceView.computeVisible.
  const recomputeWindow = useCallback(() => {
    if (!shouldVirtualize(lines.length)) {
      if (lineWindowRef.current !== null) setLineWindow(null);
      return;
    }
    const root = containerRef.current;
    if (!root) return;
    const scroller = (root.scrollHeight > root.clientHeight + 1)
      ? root : findScrollingAncestor(root);
    let vTop; let vBottom;
    try {
      if (scroller && scroller.getBoundingClientRect
        && scroller !== document.documentElement && scroller !== document.body) {
        const r = scroller.getBoundingClientRect();
        vTop = r.top; vBottom = r.bottom;
      } else { vTop = 0; vBottom = window.innerHeight || 0; }
    } catch { vTop = 0; vBottom = window.innerHeight || 0; }
    const lineH = mainLineHeight > 0 ? mainLineHeight : 120;
    const els = root.querySelectorAll(
      '[data-testid="sequence-view-line"][data-wraptail-kind="main"]',
    );
    let anchorIdx = null; let anchorTop = null;
    for (const el of els) {
      const idx = parseInt(el.dataset.lineIdx || '', 10);
      if (Number.isNaN(idx)) continue;
      let r; try { r = el.getBoundingClientRect(); } catch { continue; }
      // Remember each REAL line's height so its placeholder reuses it (stable
      // scrollHeight → no jitter). Skip placeholders (their height is the
      // estimate we're trying to replace).
      if (el.dataset.placeholder !== 'true' && r.height > 0) {
        lineHeightsRef.current.set(idx, r.height);
      }
      if (anchorIdx === null || Math.abs(r.top - vTop) < Math.abs(anchorTop - vTop)) {
        anchorIdx = idx; anchorTop = r.top;
      }
    }
    let firstVisibleIdx = NaN; let lastVisibleIdx = NaN;
    if (anchorIdx !== null) {
      firstVisibleIdx = anchorIdx + Math.floor((vTop - anchorTop) / lineH);
      lastVisibleIdx = anchorIdx + Math.ceil((vBottom - anchorTop) / lineH);
    }
    // Scroll velocity (lines moved since the previous tick) → lead the travel
    // direction so a fast wheel / middle-button drag pre-mounts ahead and never
    // flashes a blank placeholder.
    const prevFv = lastFirstVisibleRef.current;
    const deltaLines = (Number.isFinite(prevFv) && Number.isFinite(firstVisibleIdx))
      ? (firstVisibleIdx - prevFv) : 0;
    if (Number.isFinite(firstVisibleIdx)) lastFirstVisibleRef.current = firstVisibleIdx;
    const { overscanBefore, overscanAfter } = directionalOverscan({
      deltaLines, base: DEFAULT_OVERSCAN, max: DEFAULT_OVERSCAN * 3,
    });
    const next = computeDesiredWindow({
      count: lines.length, firstVisibleIdx, lastVisibleIdx, overscanBefore, overscanAfter,
    });
    if (!windowsEqual(lineWindowRef.current, next)) setLineWindow(next);
  }, [lines.length, mainLineHeight]);

  // Drive the window: initial measure + on scroll/resize of the real scroller.
  useEffect(() => {
    if (!virtualize) {
      if (lineWindowRef.current !== null) setLineWindow(null);
      return undefined;
    }
    const raf = requestAnimationFrame(recomputeWindow);
    const root = containerRef.current;
    const scroller = root
      ? ((root.scrollHeight > root.clientHeight + 1) ? root : findScrollingAncestor(root))
      : null;
    const target = (scroller && scroller !== document.documentElement && scroller !== document.body)
      ? scroller : window;
    let pending = false;
    const onScroll = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; recomputeWindow(); });
    };
    target.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      target.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [virtualize, recomputeWindow, measured, charsPerLine]);

  // Re-check coverage after each window change (converges after a jump: once
  // the visible band is fully mounted, computeDesiredWindow returns the same
  // window → windowsEqual → no setState → the loop stops).
  useEffect(() => {
    if (!virtualize) return undefined;
    const id = requestAnimationFrame(recomputeWindow);
    return () => cancelAnimationFrame(id);
  }, [lineWindow, virtualize, recomputeWindow]);

  // Hoist filterAnnotationsForLine reference (reserved for a future
  // pre-filter optimisation in AnnotationTrack — for now per-line
  // tracks already clip features by lineStart/lineLen internally).
  void filterAnnotationsForLine;

  // Forward-declare some unused (M-D reserved) callbacks so React
  // doesn't warn — they're props the consumer can wire later.
  void onSelect;
  void onAnnotationClick;
  void onVisibleRangeChange;

  const seqLength = (fragments && fragments[0] && fragments[0].sequence)
    ? fragments[0].sequence.length
    : 0;

  // PRIMER-LIVE-1 — on a ring the amplicon may cross the origin, and a naive
  // min..max bracket would paint everything the product is NOT. The span owner
  // returns the real segments; each becomes its own zone so the arc is drawn
  // where the product actually is.
  const flankZones = useMemo(() => {
    if (selectedPrimers.length !== 2) return null;
    const span = flankedSpan(
      selectedPrimers[0].hit,
      selectedPrimers[1].hit,
      { circular, seqLength },
    );
    if (!span) return null;
    const segs = span.segments || [{ start: span.start, end: span.end }];
    const usable = segs.filter((sg) => sg.end > sg.start);
    if (usable.length === 0) return null;
    // amber attention fill (design-system: not red/punk).
    return usable.map((sg, i) => ({
      zoneId: `__primer-flank__${i}`, start: sg.start, end: sg.end, color: "#B87A0E",
    }));
  }, [selectedPrimers, circular, seqLength]);

  // «Тянуть до конца» (Игорь 22.06): a LINEAR fragment's terminal overhang that
  // PROTRUDES on the bottom strand (protruding==='bottom') sits OUTSIDE fullSeq,
  // so the caret can't reach it. Derive the protruding lengths + displayed bases
  // (bottom strand = per-nt complement, matching StrandsTrack) so the selection
  // can extend over the overhang and copy it. Null for circular / blunt / no cut.
  const terminalSelect = useMemo(() => {
    if (!terminalStagger || circular) return null;
    const out = (end) => (end && end.protruding === 'bottom' && end.len > 0 ? end : null);
    const r = out(terminalStagger.right);
    const l = out(terminalStagger.left);
    if (!r && !l) return null;
    const disp = (e) => (e ? e.seq.split('').map((ch) => complement(ch)).join('') : '');
    return {
      rightLen: r ? r.len : 0,
      leftLen: l ? l.len : 0,
      rightBases: disp(r),
      leftBases: disp(l),
    };
  }, [terminalStagger, circular]);

  const selectionContract = useSelectionContract({
    fullSeq,
    seqLength,
    circular,
    caretAnchor,
    caretPos,
    selectionMode,
    selectionStrand,
    showSelectionTm,
    tmPoint: tmPt,
  });
  const safeActionAnchor = selectionContract.safeAnchor;
  const safeActionFocus = selectionContract.safeFocus;
  const menuAnchor = selectionContract.usesWrapContext && selectionContract.range
    ? selectionContract.range.start : caretAnchor;
  const menuFocus = selectionContract.usesWrapContext && selectionContract.range
    ? selectionContract.range.end : caretPos;

  // Selection state hook — owns the contextMenu state, drag refs,
  // pointer handlers, copy dispatcher, click fallback. Returns a
  // bundle of callbacks the JSX wires onto the root <div>.
  const {
    contextMenu,
    setContextMenu,
    onRootPointerDown,
    onRootPointerMove,
    onRootPointerUp,
    onRootPointerCancel,
    onRootContextMenu,
    onRootClickFallback,
    copySelection,
    inverted,
    toggleInverted,
  } = useSelectionState({
    fullSeq,
    seqLength,
    charsPerLine,
    charPx,
    caretPos,
    caretAnchor,
    selectionMode,
    selectionStrand,
    circular,
    terminalSelect,
    onCaretChange,
    onSelectRange,
    containerRef,
  });
  // Controlled override (assembly picker's «Инвертировать (бэкбон)» button) wins
  // over the hook's internal right-click invert.
  const effInverted = invertedProp != null ? invertedProp : inverted;

  const keyboardHandler = useSequenceKeyboard({
    fullSeq,
    seqLength,
    charsPerLine,
    caretPos,
    caretAnchor,
    selectionMode,
    selectionStrand,
    onCaretChange,
    // M-X.6 K2/K3 — char-apply + circular keyboard nav (DEC-MX6-02/03).
    editable,
    topology: circular ? 'circular' : 'linear',
    onSequenceEdit,
    // Sprint M-X.3 follow-up — Ctrl+A / Ctrl+Alt+A select-all
    // hotkeys delegate to the same onSelectRange that mouse drag
    // already drives, so the parent's selection state machine
    // (caretAnchor / caretPos / selectionStrand) ends up in the
    // exact same shape as a manual select-all drag.
    onSelectRange,
  });

  // T5 K3 — «P» marks the selection as a piece (consumer-gated;
  // no-op when onCreatePiece is absent or there is no selection).
  usePieceHotkey({ onCreatePiece, caretAnchor: safeActionAnchor, caretPos: safeActionFocus });
  // 18.05.2026 — Ctrl+R / Ctrl+Alt+R make a fwd/rev primer from the
  // selection in EVERY viewer (same flow as right-click «primer»),
  // not just the assembler (Игорь). Consumer-gated on onWritePrimer.
  usePrimerHotkeys({
    onWritePrimer,
    buildPrimerDraft,
    caretAnchor,
    caretPos,
    selectionRange: selectionContract.primerRange,
  });
  // PRIMER-LIVE-1 / P16 — «E» edits the active occurrence. A PCR partner is
  // context for a reaction, not a second edit subject.
  const editSelectedPrimer = useCallback(() => {
    if (!onWritePrimer) return;
    if (!activePrimer || !activeOccurrenceIsLive) return;
    onPrimerDoubleClick(activePrimer.hit);
  }, [activeOccurrenceIsLive, activePrimer, onWritePrimer, onPrimerDoubleClick]);
  useHotkey("primer-edit", editSelectedPrimer);

  // K3 — Del / H / E edit handlers + popup state. Mounts above the
  // keyboard navigation handler so edit-keys claim the event first.
  const annotations = useMemo(() => {
    // Flatten all fragments' annotations (consumers in Importer mode
    // pass a single fragment; Container Window M-D will pass many).
    if (!Array.isArray(fragments)) return [];
    const flat = [];
    fragments.forEach((f) => {
      if (f && Array.isArray(f.annotations)) flat.push(...f.annotations);
    });
    return flat;
  }, [fragments]);
  const {
    handleKeyDown: onEditKeyDown,
    createPopupState,
    closeCreatePopup,
    editModalAnnotation,
    closeEditModal,
  } = useSelectionEdit({
    annotations,
    caretPos: safeActionFocus,
    caretAnchor: safeActionAnchor,
    onAnnotationEdit,
    onCaretChange,
    containerRef,
  });

  // Invariant (Игорь 24.05.2026): a SELECTED primer claims Del/Backspace —
  // they delete the primer, NEVER the nucleotide under the caret. Runs FIRST
  // in onRootKeyDown so the annotation/sequence edit path never sees the key.
  // When onDeletePrimer is absent (read-only Library viewers) the event is
  // still swallowed → no deletion, the sequence stays untouched.
  const onPrimerDeleteKeyDown = (e) => {
    if (!activePrimer || !activeOccurrenceIsLive) return false;
    if (e.key !== 'Delete' && e.key !== 'Backspace') return false;
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    // don't hijack typing in fields (rename inputs, modal forms)
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'
      || t.tagName === 'SELECT' || t.isContentEditable)) return false;
    e.preventDefault();
    e.stopPropagation();
    if (typeof onDeletePrimer === 'function') {
      onDeletePrimer(activePrimer.hit);
      clearPrimerSelection();
    }
    return true;
  };

  const onRootKeyDown = (e) => {
    if (onDisclosureKeyDown(e)) return;
    if (onPrimerDeleteKeyDown(e)) return;
    if (onEditKeyDown(e)) return;
    keyboardHandler(e);
  };

  // 17.06.2026 (Игорь «вставка последовательности не работает») — paste a
  // block of bases at the caret / over the selection. Emits a multi-char
  // `replace` op (the same shape applySequenceEditToEntry + the assembly
  // router already handle), so paste rides the SAME edit path as typing.
  // No-op when the viewer isn't editable or the consumer doesn't accept
  // sequence edits (read-only viewers paste nothing).
  const onRootPaste = (e) => {
    if (!editable || typeof onSequenceEdit !== 'function') return;
    let raw = '';
    try { raw = (e.clipboardData && e.clipboardData.getData('text')) || ''; } catch { raw = ''; }
    if (selectionContract.wrapsOrigin) {
      e.preventDefault();
      return;
    }
    const op = buildSequencePasteOp(raw, safeActionAnchor, safeActionFocus);
    if (!op) return;
    e.preventDefault();
    onSequenceEdit(op);
  };

  // K4 — drag-handles on region edges. PointerDown on a left/right
  // edge starts a document-level drag that updates a local coord
  // ref; pointerUp dispatches an `update` annotation edit. Only
  // wired into the AnnotationTrack when the consumer supplied
  // `onAnnotationEdit` — read-only viewers (no parent handler) skip
  // the edge overlays entirely.
  const annDrag = useAnnotationDrag({
    charPx,
    charsPerLine,
    containerRef,
    onAnnotationEdit,
    onCaretChange,
    seqLength,
  });
  // 06.05.2026 PERF-1 — stabilise prop identity for handlers passed
  // into <SequenceLine>. SequenceLine is React.memo'd over ~60 lines;
  // a fresh closure per render breaks shallow-equal and triggers
  // a full ~70k-DOM-node re-render on every parent state change
  // (cursor step, drag-scrub tick, idle-prewarm flip). useCallback
  // pins identity so memo skips lines whose own inputs are unchanged.
  const dragOnPointerDownEdge = annDrag.onPointerDownEdge;
  const onAnnotationEdgePointerDown = useMemo(
    () => (onAnnotationEdit ? dragOnPointerDownEdge : null),
    [onAnnotationEdit, dragOnPointerDownEdge],
  );
  const draggedAnnotationId = annDrag.draggedAnnotationId;
  const draggedEdge = annDrag.draggedEdge;
  const draggedCurrentCoord = annDrag.currentCoord;
  const dragTooltip = annDrag.tooltip;

  // K5 — inline rename on double-click. Only wired when consumer
  // supplied onAnnotationEdit; otherwise the doubleclick handler
  // is null and AnnotationTrack ignores the event.
  const renameApi = useAnnotationRename({ onAnnotationEdit });
  const renameStart = renameApi.startRename;
  const onAnnotationDoubleClick = useMemo(
    () => (onAnnotationEdit ? renameStart : null),
    [onAnnotationEdit, renameStart],
  );
  // Sprint M-X.3 follow-up — double-click on the FEATURE BAR now
  // opens the per-feature edit modal (FeatureEditorModal). Falls
  // back to the previous «open Annotator scoped to region» flow
  // only when no editor callback is wired (legacy embed sites).
  // PERF-1: useCallback so the closure identity is stable across
  // renders even when parent re-renders for unrelated reasons.
  const onAnnotationFeatureDoubleClick = useCallback(
    (region) => {
      if (onOpenFeatureEditor) {
        onOpenFeatureEditor(region);
        return;
      }
      if (onOpenAnnotator) {
        onOpenAnnotator({
          kind: 'region',
          region: { start: region.start, end: region.end },
        });
      }
    },
    [onOpenFeatureEditor, onOpenAnnotator],
  );
  // Probe the dragged-or-renamed region's DOM rect for input
  // positioning. Layout effect would be cleaner but this is
  // single-shot per rename — re-running on every render only when
  // the renaming target changes is fine.
  const renameInputPosition = useMemo(() => {
    if (!renameApi.renaming || !containerRef.current) return null;
    // Bug-rush #7: scope by both region id AND originating line so
    // multi-line features (the same id repeats on N rows) open the
    // rename input on the line biolog actually double-clicked.
    const idEsc = renameApi.renaming.id.replace(/"/g, '\\"');
    const lineStart = renameApi.renaming.lineStart;
    let sel = `[data-testid="sequence-view-annotation"][data-region-id="${idEsc}"]`;
    if (Number.isFinite(lineStart)) {
      sel += `[data-region-line-start="${lineStart}"]`;
    }
    let target;
    try { target = containerRef.current.querySelector(sel); } catch { return null; }
    // Fallback: if the line-scoped selector misses (e.g. test fixture
    // without data-region-line-start), drop back to id-only.
    if (!target && Number.isFinite(lineStart)) {
      const fb = `[data-testid="sequence-view-annotation"][data-region-id="${idEsc}"]`;
      try { target = containerRef.current.querySelector(fb); } catch { /* noop */ }
    }
    if (!target) return null;
    const rectEl = target.querySelector('rect');
    if (!rectEl) return null;
    let r;
    try { r = rectEl.getBoundingClientRect(); } catch { return null; }
    let rootRect;
    try { rootRect = containerRef.current.getBoundingClientRect(); } catch { return null; }
    return {
      left: r.left - rootRect.left + containerRef.current.scrollLeft,
      top: r.top - rootRect.top + containerRef.current.scrollTop,
      width: r.width,
      height: r.height,
    };
  }, [renameApi.renaming]);

  // Hoisted derived constant + memoized lines JSX subtree. Both must
  // run before the early `if (!fullSeq) return` so the hook order
  // (useMemo) stays stable across the empty/non-empty transition.
  const renderHybrid = framesResolution.strategy === "hybrid";
  // RC-B1 (Игорь 24.06) — manual reading-frame override. When the user pins a
  // forward frame (settings.overrideFrame ∈ 0|1|2) we drive the EXISTING hybrid AA
  // path to render exactly that one forward row at full opacity, regardless of CDS
  // detection: strategy 'hybrid' + framesMode 'all' (opacity 1) + visibleFrames =
  // only the chosen +N. null → untouched (auto, CDS-driven).
  const overrideFrame = settings.overrideFrame;
  const hasFrameOverride = overrideFrame === 0 || overrideFrame === 1 || overrideFrame === 2;
  const effFramesMode = hasFrameOverride ? "all" : settings.framesMode;
  const effRenderHybrid = hasFrameOverride ? true : renderHybrid;
  // Stable refs both ways: a frozen module const under override, the (already
  // memoized) framesResolution otherwise → no spurious line/overlay re-renders.
  const effFramesResolution = hasFrameOverride ? FRAME_OVERRIDE_RESOLUTION : framesResolution;
  const effVisibleFrames = useMemo(
    () => (hasFrameOverride
      ? { "+1": overrideFrame === 0, "+2": overrideFrame === 1, "+3": overrideFrame === 2, "-1": false, "-2": false, "-3": false }
      : settings.visibleFrames),
    [hasFrameOverride, overrideFrame, settings.visibleFrames],
  );
  // RC-SEP-SEAM (Игорь 26.06 «просто буквы убрать») — recessed-strand blanks for
  // incompatible restriction overhangs, so the join reads as a single-stranded staircase
  // (the recessed base is physically not drawn, the zone band stays). Pure (positions only).
  const recessBlanks = useMemo(
    () => computeSeamRecessBlanks(pieceZones ?? coloredZones, closureSeam),
    [pieceZones, coloredZones, closureSeam],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const linesJsx = useMemo(() => {
    if (!fullSeq) return null;
    if (!measured && !__IS_TEST_ENV__) return null;
    // Sprint M-X.3 K2 — wrap-tail leading + main + trailing.
    // Each wrap-tail line is a SequenceLine with `kind` set so the
    // wrapper applies opacity 0.5 + pointer-events:none + a
    // data-wraptail-kind attribute. Tracks (annotations / primers /
    // RE / AA) per-line filter by lineStart + lineLen internally,
    // so we pass the full arrays as for main lines. Keys must
    // include `kind` because leading-wrap and main may share a
    // line.start (degenerate case if main and trailing start
    // overlap); the prefix prevents a React duplicate-key warning.
    const renderLine = (line, kind, nextKind, lineIndex) => (
      <SequenceLine
          entryId={entryId}
          documentHash={documentHash}
          topology={topology}
        key={`${kind}:${line.start}`}
        line={line}
        kind={kind}
        nextKind={nextKind}
        // Virtualization: only MAIN lines window (leading/trailing wrap-tail
        // rows are a small fixed band at the edges — always mounted).
        active={(kind === 'main' && virtualize) ? isActiveIdx(lineIndex, effectiveWindow) : true}
        lineIndex={kind === 'main' ? lineIndex : undefined}
        // Per-line remembered height (measured while real) keeps this slot's
        // footprint identical when it flips to a placeholder → invariant
        // scrollHeight, no jitter. Falls back to the single estimate for lines
        // never yet rendered real (fast scroll past them).
        placeholderHeight={(kind === 'main' && lineHeightsRef.current.get(lineIndex)) || placeholderHeight}
        seqLength={seqLength}
        circular={circular}
        terminalStagger={terminalStagger}
        recessBlanks={recessBlanks}
        fullSeq={fullSeq}
        features={features}
        primers={primers}
        primerOccurrences={projectedPrimerOccurrences}
        primerEdgeGuardPx={primerEdgeGuardChars * charPx}
        onPrimerClick={onPrimerClick}
        onPrimerDoubleClick={onPrimerDoubleClick}
        selectedPrimerKeys={selectedPrimerKeys}
        expandedPrimerKey={expandedPrimerKey}
        reSites={reSites}
        charPx={charPx}
        showBottomStrand={effShowBottomStrand}
        framesMode={effFramesMode}
        primerStyle={settings.primerStyle}
        reOrientation={settings.reOrientation}
        visibleFrames={effVisibleFrames}
        framesResolution={effFramesResolution}
        orfRanges={orfRanges}
        renderHybrid={effRenderHybrid}
        onAnnotationClick={onAnnotationClick}
        selectedRegionId={selectedRegionId}
        tracksReady={tracksReady}
        onAnnotationEdgePointerDown={onAnnotationEdgePointerDown}
        draggedAnnotationId={draggedAnnotationId}
        draggedEdge={draggedEdge}
        draggedCurrentCoord={draggedCurrentCoord}
        onAnnotationDoubleClick={onAnnotationDoubleClick}
        onAnnotationFeatureDoubleClick={onAnnotationFeatureDoubleClick}
        onRestrictionClick={onRestrictionClick}
        restrictionHighlightKey={restrictionHighlightKey}
        hoveredRestrictionKey={hoveredRestrictionKey}
        onRestrictionHover={setHoveredRestrictionKey}
        alignmentRead={alignmentRead}
        alignmentReads={alignmentReads}
        chromatogram={chromatogram}
        chromatogramMaxVal={chromatogramMaxVal}
        alignmentColorMode={alignmentColorMode}
        referenceGutterLabel={alignmentReferenceName}
        alignmentReadName={alignmentReadName}
        aaEffects={aaEffects}
        onAcceptBase={onAcceptBase}
        showAnnotations={showAnnotations}
        showAATrack={showAATrack}
        onAAClick={onAAClick}
      />
    );
    const out = [];
    // Round-9: each line knows the kind of the NEXT line so the wrap-
    // tail / main boundary can collapse its divider (origin marker
    // takes over visually). Build the kind sequence in the right
    // order — leading first, then main, then trailing.
    const leading = wrapTailLines.leading;
    const trailing = wrapTailLines.trailing;
    for (let i = 0; i < leading.length; i += 1) {
      const next = i < leading.length - 1
        ? 'leading-wrap'
        : (lines.length > 0 ? 'main' : (trailing.length > 0 ? 'trailing-wrap' : 'main'));
      out.push(renderLine(leading[i], 'leading-wrap', next));
    }
    for (let i = 0; i < lines.length; i += 1) {
      const next = i < lines.length - 1
        ? 'main'
        : (trailing.length > 0 ? 'trailing-wrap' : 'main');
      out.push(renderLine(lines[i], 'main', next, i));
    }
    for (let i = 0; i < trailing.length; i += 1) {
      // Last trailing line has no following row — keep its divider
      // for the «end of viewport» visual cue.
      const next = i < trailing.length - 1 ? 'trailing-wrap' : 'trailing-wrap';
      out.push(renderLine(trailing[i], 'trailing-wrap', next));
    }
    return out;
  }, [
    measured, lines, wrapTailLines, fullSeq, circular, features, primers,
    projectedPrimerOccurrences, primerEdgeGuardChars, reSites, charPx,
    onPrimerClick, onPrimerDoubleClick, selectedPrimerKeys, expandedPrimerKey,
    effShowBottomStrand, effFramesMode, settings.primerStyle,
    settings.reOrientation, effVisibleFrames,
    effFramesResolution, orfRanges, effRenderHybrid,
    onAnnotationClick, selectedRegionId, tracksReady,
    // Align-to-reference inputs — without these the read/chromatogram track
    // would go stale when the result changes but the reference stays the same.
    alignmentRead, alignmentReads, chromatogram, chromatogramMaxVal, alignmentColorMode,
    alignmentReferenceName, alignmentReadName, aaEffects, onAcceptBase, showAnnotations, showAATrack,
    onAAClick,
    onAnnotationEdgePointerDown, draggedAnnotationId, draggedEdge, draggedCurrentCoord,
    onAnnotationDoubleClick, onAnnotationFeatureDoubleClick,
    // 12.05.2026 — was missing: click on RE site flips
    // restrictionHighlightKey in the editor, but the memo didn't
    // recompute → binding-zone overlay never propagated to
    // SequenceLine → выделение не показывалось. Add both deps.
    onRestrictionClick, restrictionHighlightKey,
    hoveredRestrictionKey,
    // Virtualization (19.06.2026): rebuild the lines when the active window
    // shifts (scroll) so off-screen indices flip to placeholders and back.
    // layoutEpoch bumps off this rebuild → overlays re-measure against the
    // new DOM. placeholderHeight tracks mainLineHeight.
    virtualize, effectiveWindow, placeholderHeight,
    recessBlanks,
  ]);

  // V96 — bump the layout epoch after every `linesJsx` rebuild. The
  // memo's reference changes on EXACTLY the inputs that reflow the
  // strand rows (measured, tracksReady, charPx, charsPerLine,
  // wrapTailLines, features, …) — all already in its deps — so this
  // fires precisely when the overlays must re-measure. `linesJsx` is
  // NOT a function of `layoutEpoch`, so bumping it can't re-run this
  // effect → no loop. useLayoutEffect (not useEffect) re-measures
  // before paint, so there's no frame on the stale phase-1 geometry.
  useLayoutEffect(() => {
    setLayoutEpoch((e) => e + 1);
  }, [linesJsx]);

  if (!fullSeq) {
    return (
      <div
        ref={containerRef}
        data-testid="sequence-view-root"
        data-empty="true"
        style={{
          padding: 12,
          fontSize: 11,
          color: "var(--text-tertiary)",
          textAlign: "center",
        }}
      >
        Нет последовательности
      </div>
    );
  }

  return (
    <div
      className="sequence-view-shell"
      data-testid="sequence-view-shell"
      data-block-global-escape={expandedPrimerKey != null ? 'true' : undefined}
      onKeyDown={onDisclosureKeyDown}
    >
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onRootKeyDown}
      onPaste={onRootPaste}
      onPointerDown={onRootPointerDown}
      onPointerMove={(e) => {
        onRootPointerMove(e);
        // V76 — track the cursor so the Tm readout sits next to it.
        if (showSelectionTm) setTmPt({ x: e.clientX, y: e.clientY });
      }}
      onPointerLeave={showSelectionTm ? () => setTmPt(null) : undefined}
      onPointerUp={onRootPointerUp}
      onPointerCancel={onRootPointerCancel}
      onClick={onRootClickFallback}
      onContextMenu={onRootContextMenu}
      data-testid="sequence-view-root"
      data-circular={circular ? "true" : "false"}
      data-chars-per-line={charsPerLine}
      data-line-count={lines.length}
      data-show-bottom-strand={effShowBottomStrand ? "true" : "false"}
      data-frames-mode={settings.framesMode}
      data-frames-strategy={framesResolution.strategy}
      data-primer-style={settings.primerStyle}
      data-re-orientation={settings.reOrientation}
      style={{
        flex: "1 1 auto",
        minWidth: 0,
        overflowX: "auto",
        overflowY: "auto",
        // Keep room for the scrollbar even when the content is short
        // — avoids the layout reshuffle (and accompanying ~1-frame
        // jitter) when the scrollbar appears/disappears.
        scrollbarGutter: "stable",
        outline: "none",
        fontFamily: SEQUENCE_FONT_FAMILY,
        fontSize: 11,
        lineHeight: 1.4,
        padding: "0 12px",
        // Bug-rush #21: dedicated canvas surface so dark theme has
        // a lighter «paper» behind the DNA letters / feature bars.
        // Light theme keeps it white via the same token.
        background: "var(--sequence-canvas-bg, var(--surface-1, #fff))",
        // position:relative — caret + selection overlays anchor here.
        position: "relative",
        // user-select:none — biolog 04.05.2026: «можем отключить
        // нативное выделение? которое чёрным выделяет как обычный
        // текст». We render our own translucent orange overlay; the
        // browser's native blue/dark text selection on top looked
        // like a double highlight.
        userSelect: "none",
        WebkitUserSelect: "none",
        // overflow-anchor:none — disables Chromium scroll anchoring
        // overhead per scroll frame on long plasmids.
        overflowAnchor: "none",
      }}
    >
      {linesJsx}
      <SegmentZonesOverlay
        zones={
          flankZones
            ? [...(Array.isArray(pieceZones ?? coloredZones) ? (pieceZones ?? coloredZones) : []), ...flankZones]
            : (pieceZones ?? coloredZones)
        }
        charPx={charPx}
        charsPerLine={charsPerLine}
        containerRef={containerRef}
        onZoneClick={onZoneClick}
        onZoneHover={onZoneHover}
        terminalStagger={terminalStagger}
        closureSeam={closureSeam}
        layoutEpoch={layoutEpoch}
      />
      {outOfRangeMask && Number.isFinite(outOfRangeMask.start)
        && Number.isFinite(outOfRangeMask.end)
        && outOfRangeMask.end > outOfRangeMask.start && (
        <OutOfRangeMaskOverlay
          rangeStart={outOfRangeMask.start}
          rangeEnd={outOfRangeMask.end}
          charPx={charPx}
          charsPerLine={charsPerLine}
          containerRef={containerRef}
          seqLength={seqLength}
          layoutEpoch={layoutEpoch}
        />
      )}
      <SelectionOverlay
        caretPos={caretPos}
        caretAnchor={caretAnchor}
        charPx={charPx}
        charsPerLine={charsPerLine}
        containerRef={containerRef}
        showBottomStrand={effShowBottomStrand}
        selectionMode={selectionMode}
        selectionStrand={selectionStrand}
        selectionFrame={selectionContract.selectionFrame}
        seqLength={seqLength}
        layoutEpoch={layoutEpoch}
        inverted={effInverted}
        stickyEnds={stickyEndsInfo}
        terminalSelect={terminalSelect}
      />
      <SearchHitsOverlay
        hits={searchHits}
        charPx={charPx}
        charsPerLine={charsPerLine}
        containerRef={containerRef}
        layoutEpoch={layoutEpoch}
      />
      <CaretOverlay
        caretPos={caretPos}
        charPx={charPx}
        containerRef={containerRef}
        showBottomStrand={effShowBottomStrand}
        seqLength={seqLength}
        charsPerLine={charsPerLine}
        layoutEpoch={layoutEpoch}
        // Caret gives way while a primer is selected — Del then targets the
        // primer, and a blinking caret over a selected primer reads wrong.
        // V143 (Игорь 12.06): ONLY in a read-only viewer. In an EDITABLE view
        // (the assembly editor) the user is typing into the sequence, so the
        // caret must stay visible even with a primer selected («курсор исчезает»
        // otherwise). Del still targets the primer — its keydown guard keys off
        // selectedPrimers, not the caret — so deletion is unaffected.
        hidden={!editable && selectedPrimers.length > 0}
      />
      <OriginMarkerOverlay
        circular={circular}
        // Round-10 (06.05.2026): trailing wrap-tail folded inline into
        // a wrap-bridge line — no separate trailing strip → no bottom
        // marker. The vertical divider rendered INSIDE the bridge
        // line by SequenceLine is the trailing-side origin cue now.
        hasTrailingWrap={false}
        containerRef={containerRef}
      />
      <SelectionContextMenu
        contextMenu={contextMenu}
        selectionMode={selectionMode}
        onCopy={copySelection}
        onInvert={selectionContract.usesWrapContext ? undefined : toggleInverted}
        inverted={effInverted}
        onClose={() => setContextMenu(null)}
        extraItems={buildSelectionMenuItems({
          contextMenu,
          caretAnchor: menuAnchor,
          caretPos: menuFocus,
          annotations,
          setContextMenu,
          onEditKeyDown,
          onAnnotationEdit,
          onOpenAnnotator,
          onBlastSelection,
          onWritePrimer: onWritePrimer ? requestWritePrimer : undefined,
          onCreatePiece,
          onPromoteToCommon: onPromoteToCommon ? requestPromoteToCommon : undefined,
          onExtractFeature,
          selectionRange: selectionContract.range,
        })}
      />
      {/* PRIMER-LIVE-1 — lab matches for the live selection and the single
          «create the product» action for two chosen landings. Consumer-gated:
          a host that wires neither renders nothing extra. */}
      {(onCreatePcrProduct || (labPrimers && labPrimers.length > 0)) && (
        <div
          data-testid="sequence-view-primer-actions"
          style={{ position: "absolute", right: 12, bottom: 12, zIndex: 22, maxWidth: 420 }}
        >
          <PrimerSelectionActions
            template={fullSeq}
            topology={circular ? "circular" : "linear"}
            selection={selectionContract.primerRange}
            occurrences={selectedOccurrences}
            primersById={primersById}
            labRecords={labPrimers}
            onReuseLabPrimer={onReuseLabPrimerWithDocument}
            onCreatePcrProduct={onCreatePcrProduct}
          />
        </div>
      )}
      {primerDraft && onWritePrimer && (
        <PrimerFromSelectionModal
          draft={primerDraft}
          anchorSites={primerDraft.anchorSites}
          template={fullSeq}
          topology={circular ? "circular" : "linear"}
          entryId={entryId}
          documentHash={documentHash}
          features={features}
          templateReSites={primerTemplateReSites}
          viewSettings={{
            showBottomStrand: effShowBottomStrand,
            primerStyle: settings.primerStyle,
            reOrientation: settings.reOrientation,
            showAATrack,
            framesMode: effFramesMode,
            visibleFrames: effVisibleFrames,
            framesResolution: effFramesResolution,
            orfRanges,
            renderHybrid: effRenderHybrid,
          }}
          onClose={closePrimerDraft}
          onCreate={submitPrimerDraft}
        />
      )}
      {promoteDraft && onPromoteToCommon && (
        <PromoteToCommonModal
          draft={promoteDraft}
          checkCommonDuplicate={checkCommonDuplicate}
          onClose={() => setPromoteDraft(null)}
          onCreate={async (payload) => {
            const res = await onPromoteToCommon(payload);
            // Close on success; keep open on a blocked dup (banner shows).
            if (res?.ok !== false) setPromoteDraft(null);
            return res;
          }}
        />
      )}
      {createPopupState && (
        <CreateAnnotationPopup
          position={createPopupState.anchor}
          selectionStart={createPopupState.selectionStart}
          selectionEnd={createPopupState.selectionEnd}
          seqLength={seqLength}
          onCancel={closeCreatePopup}
          onCreate={(payload) => {
            // UX-9 — auto-link a new SUB-feature (detail/point: domain, motif,
            // mutation, site) to the gene that encloses it, via `regionId` (the
            // model-standard parent link → getDetails / exon-split / V180 cascade).
            // A region-level feature, an unparented span, or an explicit regionId
            // is left untouched.
            let p = payload;
            if (payload && payload.level && payload.level !== "region" && payload.regionId == null) {
              const parent = enclosingRegionId(annotations, payload.start, payload.end);
              if (parent != null) p = { ...payload, regionId: parent };
            }
            onAnnotationEdit?.({ kind: "create", payload: p });
            closeCreatePopup();
          }}
          onOpenAnnotator={({ start, end }) => {
            onOpenAnnotator?.({ kind: "region", region: { start, end } });
            closeCreatePopup();
          }}
        />
      )}
      {editModalAnnotation && (
        <EditAnnotationModal
          annotation={editModalAnnotation}
          seqLength={seqLength}
          onCancel={closeEditModal}
          onApply={({ id, patch }) => {
            onAnnotationEdit?.({ kind: "update", id, patch });
            closeEditModal();
          }}
        />
      )}
      {renameApi.renaming && renameInputPosition && (
        <InlineRenameInput
          initialName={renameApi.renaming.name}
          position={renameInputPosition}
          onSave={renameApi.saveRename}
          onCancel={renameApi.cancelRename}
        />
      )}
      <SequenceFloatingTooltips
        dragTooltip={dragTooltip}
        selectionTm={selectionContract.selectionTm}
        tmPt={tmPt}
      />
    </div>
      <div className="primer-inspector-slot" data-testid="primer-inspector-slot">
        {expandedPrimerKey != null && activePrimer && activeOccurrenceIsLive && (
          <PrimerInspectorPanel
            selection={activePrimer}
            occurrence={activeOccurrence}
            primer={activePrimerRecord}
            onEdit={onWritePrimer ? onPrimerDoubleClick : undefined}
          />
        )}
      </div>
    </div>
  );
});

export default SequenceView;
