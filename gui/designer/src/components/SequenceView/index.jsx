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
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useStore } from "../../store";
import { SEQUENCE_VIEW_DEFAULTS } from "../../store/uiSlice.js";
import {
  SEQUENCE_FONT_FAMILY,
  measureCharPx,
  clampCharsPerLine,
  linesFromSeq,
} from "./lib/grid.js";
import { detectORFRanges } from "./lib/orf-ranges.js";
import { resolveFramesMode } from "./lib/frames-mode.js";
import { useRowSelectionIsolation } from "./lib/row-selection-isolation.js";
import { runPredictors } from "../../predicted-detection.js";
import { scanAllSites } from "../../restriction-db.js";
import { FEATURE_STROKE } from "../../feature-palette.js";
import { generateAnnotationId } from "../../lib/annotation-edit.js";

import {
  LABEL_WIDTH,
  EMPTY_PRIMERS,
  EMPTY_PREDICTIONS,
  __IS_TEST_ENV__,
} from "./constants.js";
import { buildFeatureMap, mergeWithPredicted, flattenSites } from "./lib/feature-map.js";
import { attachScrollHandle } from "./lib/scroll-handle.js";
import CaretOverlay from "./overlays/CaretOverlay.jsx";
import SelectionOverlay from "./overlays/SelectionOverlay.jsx";
import SelectionContextMenu from "./popups/SelectionContextMenu.jsx";
import CreateAnnotationPopup from "./popups/CreateAnnotationPopup.jsx";
import EditAnnotationModal from "./popups/EditAnnotationModal.jsx";
import { useSequenceKeyboard } from "./hooks/useSequenceKeyboard.js";
import { useSelectionState } from "./hooks/useSelectionState.js";
import { useSelectionEdit } from "./hooks/useSelectionEdit.js";
import { useAnnotationDrag } from "./hooks/useAnnotationDrag.js";
import { useAnnotationRename } from "./hooks/useAnnotationRename.js";
import InlineRenameInput from "./popups/InlineRenameInput.jsx";
import SequenceLine from "./SequenceLine.jsx";
import { STRINGS } from "../../lib/strings";

const ANN_EDIT_STRINGS = STRINGS.importer.annotationEdit;

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

const SequenceView = forwardRef(function SequenceView({
  fragments,
  circular = false,
  primers = EMPTY_PRIMERS,
  // eslint-disable-next-line no-unused-vars
  readOnly = true,
  onSelect,
  onAnnotationClick,
  onVisibleRangeChange,
  // eslint-disable-next-line no-unused-vars
  onMutate,
  // eslint-disable-next-line no-unused-vars
  onAddPrimer,
  // eslint-disable-next-line no-unused-vars
  onRestrictionClick,
  caretPos = null,
  caretAnchor = null,
  selectionMode = null,
  selectionStrand = 1,
  onCaretChange,
  onSelectRange,
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
}, ref) {
  const containerRef = useRef(null);
  const [charPx, setCharPx] = useState(7.2);
  const [charsPerLine, setCharsPerLine] = useState(80);
  // `measured` gate — see Sprint M-B.3 K7 notes: container mounts
  // immediately so ResizeObserver can observe, but lines don't render
  // until the first valid width measurement comes back. Pre-warm
  // scenario (SingleInspector mounts SequenceView in `display:none`
  // for idle pre-warm) returns clientWidth=0 → wait for the
  // ResizeObserver → no narrow-then-wide flash on tab activation.
  const [measured, setMeasured] = useState(false);

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
  const showReSites = useStore((s) => s.showReSites);
  const reFilter = useStore((s) => s.reFilter);
  const reMinSiteLen = useStore((s) => s.reMinSiteLen);

  const { fullSeq, features: confidentFeatures } = useMemo(
    () => buildFeatureMap(fragments),
    [fragments],
  );

  // M-X.1 K3 — Structural Predictor consumer integration (DEC-PRED-06).
  // Predicted regions are TRANSIENT: computed here on every (fullSeq,
  // settings.predictions, confidentFeatures) shift, not persisted into
  // baseSnapshot.
  const predictionsSettings = settings.predictions || EMPTY_PREDICTIONS;
  const predictedRegions = useMemo(
    () => runPredictors(fullSeq, predictionsSettings, confidentFeatures),
    [fullSeq, predictionsSettings, confidentFeatures],
  );

  const features = useMemo(
    () => mergeWithPredicted(confidentFeatures, predictedRegions),
    [confidentFeatures, predictedRegions],
  );

  const orfRanges = useMemo(() => detectORFRanges(fullSeq, 20), [fullSeq]);

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

  const reSites = useMemo(() => {
    if (!showReSites || !fullSeq) return [];
    const scan = scanAllSites(fullSeq, { circular, minSiteLen: reMinSiteLen || 6 });
    return flattenSites(scan, reFilter);
  }, [showReSites, fullSeq, circular, reMinSiteLen, reFilter]);

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
      const fitChars = Math.floor(available / chW) - LABEL_WIDTH;
      const cap = wrapPreferenceRef.current || 150;
      const nextCpl = Math.min(clampCharsPerLine(fitChars), cap);
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
    };
    remeasure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(remeasure);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  const lines = useMemo(
    () => linesFromSeq(fullSeq, charsPerLine),
    [fullSeq, charsPerLine],
  );

  // Forward-declare some unused (M-D reserved) callbacks so React
  // doesn't warn — they're props the consumer can wire later.
  void onSelect;
  void onAnnotationClick;
  void onVisibleRangeChange;

  const seqLength = (fragments && fragments[0] && fragments[0].sequence)
    ? fragments[0].sequence.length
    : 0;

  // Bug-rush #8 (04.05.2026 evening): when the AA selection is
  // active, derive the reading frame from (selection range, strand)
  // so SelectionOverlay can pick exactly ONE matching aa-row to
  // light blue. Forward strand: frame = selStart % 3 (matches
  // AATrack's `frame: 0/1/2` mapping for labels +1/+2/+3). Reverse
  // strand: frame = (seqLen − selEnd) % 3 (V50 walkCodons
  // antisense convention). null when selection is empty / DNA-only.
  const selectionAaFrame = (() => {
    if (selectionMode !== 'aa') return null;
    const a = (typeof caretAnchor === 'number' && Number.isFinite(caretAnchor)) ? caretAnchor : null;
    const f = (typeof caretPos === 'number' && Number.isFinite(caretPos)) ? caretPos : null;
    if (a == null || f == null || a === f) return null;
    const start = Math.min(a, f);
    const end = Math.max(a, f);
    if (selectionStrand === -1) {
      return ((seqLength - end) % 3 + 3) % 3;
    }
    return ((start % 3) + 3) % 3;
  })();

  // Selection state hook — owns the contextMenu state, drag refs,
  // pointer handlers, copy dispatcher, click fallback. Returns a
  // bundle of callbacks the JSX wires onto the root <div>.
  const {
    contextMenu,
    setContextMenu,
    onRootPointerDown,
    onRootPointerMove,
    onRootPointerUp,
    onRootContextMenu,
    onRootClickFallback,
    copySelection,
  } = useSelectionState({
    fullSeq,
    seqLength,
    charsPerLine,
    charPx,
    caretPos,
    caretAnchor,
    selectionMode,
    selectionStrand,
    onCaretChange,
    onSelectRange,
    containerRef,
  });

  const keyboardHandler = useSequenceKeyboard({
    fullSeq,
    seqLength,
    charsPerLine,
    caretPos,
    caretAnchor,
    selectionMode,
    selectionStrand,
    onCaretChange,
    // Sprint M-X.3 follow-up — Ctrl+A / Ctrl+Alt+A select-all
    // hotkeys delegate to the same onSelectRange that mouse drag
    // already drives, so the parent's selection state machine
    // (caretAnchor / caretPos / selectionStrand) ends up in the
    // exact same shape as a manual select-all drag.
    onSelectRange,
  });

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
    caretPos,
    caretAnchor,
    onAnnotationEdit,
    onCaretChange,
    containerRef,
  });

  const onRootKeyDown = (e) => {
    if (onEditKeyDown(e)) return;
    keyboardHandler(e);
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
  const onAnnotationEdgePointerDown = onAnnotationEdit ? annDrag.onPointerDownEdge : null;
  const draggedAnnotationId = annDrag.draggedAnnotationId;
  const draggedEdge = annDrag.draggedEdge;
  const draggedCurrentCoord = annDrag.currentCoord;
  const dragTooltip = annDrag.tooltip;

  // K5 — inline rename on double-click. Only wired when consumer
  // supplied onAnnotationEdit; otherwise the doubleclick handler
  // is null and AnnotationTrack ignores the event.
  const renameApi = useAnnotationRename({ onAnnotationEdit });
  const onAnnotationDoubleClick = onAnnotationEdit ? renameApi.startRename : null;
  // Sprint M-X.3 follow-up — double-click on the FEATURE BAR now
  // opens the per-feature edit modal (FeatureEditorModal). Falls
  // back to the previous «open Annotator scoped to region» flow
  // only when no editor callback is wired (legacy embed sites).
  // Distinct from the label dblclick (rename).
  const onAnnotationFeatureDoubleClick = onOpenFeatureEditor
    ? (region) => onOpenFeatureEditor(region)
    : (onOpenAnnotator
      ? (region) => onOpenAnnotator({
        kind: 'region',
        region: { start: region.start, end: region.end },
      })
      : null);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const linesJsx = useMemo(() => {
    if (!fullSeq) return null;
    if (!measured && !__IS_TEST_ENV__) return null;
    return lines.map((line) => (
      <SequenceLine
        key={line.start}
        line={line}
        fullSeq={fullSeq}
        features={features}
        primers={primers}
        reSites={reSites}
        charPx={charPx}
        settings={settings}
        framesResolution={framesResolution}
        orfRanges={orfRanges}
        renderHybrid={renderHybrid}
        onAnnotationClick={onAnnotationClick}
        tracksReady={tracksReady}
        onAnnotationEdgePointerDown={onAnnotationEdgePointerDown}
        draggedAnnotationId={draggedAnnotationId}
        draggedEdge={draggedEdge}
        draggedCurrentCoord={draggedCurrentCoord}
        onAnnotationDoubleClick={onAnnotationDoubleClick}
        onAnnotationFeatureDoubleClick={onAnnotationFeatureDoubleClick}
      />
    ));
  }, [
    measured, lines, fullSeq, features, primers, reSites, charPx,
    settings, framesResolution, orfRanges, renderHybrid,
    onAnnotationClick, tracksReady,
    onAnnotationEdgePointerDown, draggedAnnotationId, draggedEdge, draggedCurrentCoord,
    onAnnotationDoubleClick, onAnnotationFeatureDoubleClick,
  ]);

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
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onRootKeyDown}
      onPointerDown={onRootPointerDown}
      onPointerMove={onRootPointerMove}
      onPointerUp={onRootPointerUp}
      onPointerCancel={onRootPointerUp}
      onClick={onRootClickFallback}
      onContextMenu={onRootContextMenu}
      data-testid="sequence-view-root"
      data-circular={circular ? "true" : "false"}
      data-chars-per-line={charsPerLine}
      data-line-count={lines.length}
      data-show-bottom-strand={settings.showBottomStrand ? "true" : "false"}
      data-frames-mode={settings.framesMode}
      data-frames-strategy={framesResolution.strategy}
      data-primer-style={settings.primerStyle}
      data-re-orientation={settings.reOrientation}
      style={{
        flex: "1 1 auto",
        minWidth: 0,
        overflowX: "hidden",
        overflowY: "auto",
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
      <SelectionOverlay
        caretPos={caretPos}
        caretAnchor={caretAnchor}
        charPx={charPx}
        charsPerLine={charsPerLine}
        containerRef={containerRef}
        showBottomStrand={settings.showBottomStrand}
        selectionMode={selectionMode}
        selectionStrand={selectionStrand}
        selectionFrame={selectionAaFrame}
      />
      <CaretOverlay
        caretPos={caretPos}
        charPx={charPx}
        containerRef={containerRef}
        showBottomStrand={settings.showBottomStrand}
      />
      <SelectionContextMenu
        contextMenu={contextMenu}
        selectionMode={selectionMode}
        onCopy={copySelection}
        onClose={() => setContextMenu(null)}
        extraItems={(() => {
          // Build extra context-menu items lazily so we don't
          // re-allocate on every render. K3 wires «Создать
          // аннотацию» / «Удалить аннотацию» / «Редактировать»
          // here — biolog can right-click on a selection and reach
          // the same edit ops as the H / Del / E hotkeys. K9 will
          // append «Аннотировать выделение...» as a separator-
          // delimited group.
          if (!contextMenu) return null;
          const a = (typeof caretAnchor === "number" && Number.isFinite(caretAnchor)) ? caretAnchor : null;
          const f = (typeof caretPos === "number" && Number.isFinite(caretPos)) ? caretPos : null;
          if (a == null || f == null || a === f) return null;
          const selStart = Math.min(a, f);
          const selEnd = Math.max(a, f);
          const matchedRegion = annotations.find(
            (x) => x && x.level === "region" && x.start === selStart && x.end === selEnd,
          );
          const items = [];
          items.push({
            key: "create",
            label: ANN_EDIT_STRINGS.contextMenuCreateRegion,
            onClick: () => {
              const menuX = contextMenu.x;
              const menuY = contextMenu.y;
              setContextMenu(null);
              // Open the create popup at the menu's last position
              // (where the biolog right-clicked) instead of
              // synthesizing an H-key dispatch — that route would
              // anchor the popup near the line's right edge,
              // which is far from where the cursor was. Direct
              // call into useSelectionEdit's setter would be
              // cleaner; until that surface is exposed, the H
              // pathway falls back to the line-edge anchor which
              // is still better than the corner.
              onEditKeyDown({
                key: "h",
                preventDefault: () => {},
                _ctxAnchor: { x: menuX, y: menuY },
              });
            },
          });
          if (matchedRegion) {
            items.push({
              key: "edit",
              label: ANN_EDIT_STRINGS.contextMenuEditRegion,
              onClick: () => {
                setContextMenu(null);
                onEditKeyDown({ key: "e", preventDefault: () => {} });
              },
            });
            items.push({
              key: "delete",
              label: ANN_EDIT_STRINGS.contextMenuDeleteRegion,
              onClick: () => {
                setContextMenu(null);
                // Bug-rush #6 — imported annotations may have no id;
                // resolve to the deterministic backfill so the
                // dispatch lands on the right entry.
                const id = matchedRegion.id || generateAnnotationId(matchedRegion);
                onAnnotationEdit?.({ kind: "delete", id });
              },
            });
          }
          // K9 — «Аннотировать выделение...» entry. Opens the
          // fullscreen Annotator with a region-scoped run on the
          // current selection. Requires onOpenAnnotator to be
          // wired by the consumer.
          if (typeof onOpenAnnotator === "function") {
            items.push({
              key: "annotate",
              label: ANN_EDIT_STRINGS.contextMenuAnnotate,
              onClick: () => {
                setContextMenu(null);
                onOpenAnnotator({ kind: "region", region: { start: selStart, end: selEnd } });
              },
            });
          }
          // Sprint M-X.3 follow-up — biolog: «выдлять последовательность
          // - а дальше уже эту последоватность дать возможность
          // бластить». Embedded Annotator wires this to Level-3 BLAST
          // with a region override; SingleInspector outside the
          // Annotator leaves it unwired.
          if (typeof onBlastSelection === "function") {
            items.push({
              key: "blast",
              label: ANN_EDIT_STRINGS.contextMenuBlast,
              onClick: () => {
                setContextMenu(null);
                onBlastSelection({ start: selStart, end: selEnd });
              },
            });
          }
          return items;
        })()}
      />
      {createPopupState && (
        <CreateAnnotationPopup
          position={createPopupState.anchor}
          selectionStart={createPopupState.selectionStart}
          selectionEnd={createPopupState.selectionEnd}
          seqLength={seqLength}
          onCancel={closeCreatePopup}
          onCreate={(payload) => {
            onAnnotationEdit?.({ kind: "create", payload });
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
      {dragTooltip ? (
        <div
          data-testid="sequence-view-drag-tooltip"
          style={{
            position: "fixed",
            left: dragTooltip.x,
            top: dragTooltip.y,
            background: "var(--surface-1, #fff)",
            border: "0.5px solid var(--accent-500, #f97316)",
            borderRadius: "var(--radius-sm, 3px)",
            padding: "2px 6px",
            fontSize: 10,
            fontFamily: "var(--font-mono, monospace)",
            color: "var(--text-primary, #111)",
            boxShadow: "0 2px 6px rgba(0,0,0,0.18)",
            pointerEvents: "none",
            zIndex: 50,
          }}
        >{dragTooltip.label}</div>
      ) : null}
    </div>
  );
});

export default SequenceView;
