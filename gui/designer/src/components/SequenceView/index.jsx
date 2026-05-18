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
import { useStore } from "../../store";
import { SEQUENCE_VIEW_DEFAULTS } from "../../store/uiSlice.js";
import {
  SEQUENCE_FONT_FAMILY,
  measureCharPx,
  clampCharsPerLine,
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
import { runPredictors } from "../../predicted-detection.js";
import { scanAllSites } from "../../restriction-db.js";
import { FEATURE_STROKE } from "../../feature-palette.js";

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
import OriginMarkerOverlay from "./overlays/OriginMarkerOverlay.jsx";
import SearchHitsOverlay from "./overlays/SearchHitsOverlay.jsx";
import SegmentZonesOverlay from "./overlays/SegmentZonesOverlay.jsx";
import { flankedSpan } from "./lib/primer-flank.js";
import PrimerFromSelectionModal from "./popups/PrimerFromSelectionModal.jsx";
import { reverseComplement } from "../../sequence-utils.js";
import SelectionContextMenu from "./popups/SelectionContextMenu.jsx";
import { buildSelectionMenuItems } from "./popups/build-selection-menu-items.js";
import SequenceFloatingTooltips from "./overlays/SequenceFloatingTooltips.jsx";
// V76 — annealing Tm for the near-cursor selection readout. Reuses the
// v0.5-derived SantaLucia NN model; no new formula.
import { calcTm } from "../../tm-calculator";
import CreateAnnotationPopup from "./popups/CreateAnnotationPopup.jsx";
import EditAnnotationModal from "./popups/EditAnnotationModal.jsx";
import { useSequenceKeyboard } from "./hooks/useSequenceKeyboard.js";
import { usePieceHotkey } from "./hooks/usePieceHotkey";
import { usePrimerHotkeys } from "./hooks/usePrimerHotkeys";
import { useSelectionState } from "./hooks/useSelectionState.js";
import { useSelectionEdit } from "./hooks/useSelectionEdit.js";
import { useAnnotationDrag } from "./hooks/useAnnotationDrag.js";
import { useAnnotationRename } from "./hooks/useAnnotationRename.js";
import InlineRenameInput from "./popups/InlineRenameInput.jsx";
import SequenceLine from "./SequenceLine.jsx";

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
  // 12.05.2026 — clickable RE sites (skeleton container editor).
  // Library/Importer не передают prop → RestrictionTrack остаётся
  // display-only.
  onRestrictionClick,
  restrictionHighlightKey,
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
  // T5 DEC-T5-01 — consumer-gated piece authoring (same pattern as
  // onWritePrimer). Container Editor passes it; other consumers don't.
  onCreatePiece,
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

  // 18.05.2026 (Игорь) — primer redesign: primers are clickable
  // everywhere; selecting TWO highlights the fragment they flank
  // (reuses SegmentZonesOverlay — no new overlay). Keep at most 2
  // (a fwd/rev pair); a 3rd click drops the oldest. Toggle to deselect.
  const [selectedPrimers, setSelectedPrimers] = useState([]); // [{key,hit}]
  const onPrimerClick = useCallback((key, hit) => {
    setSelectedPrimers((prev) => {
      if (prev.some((s) => s.key === key)) return prev.filter((s) => s.key !== key);
      const next = [...prev, { key, hit }];
      return next.length > 2 ? next.slice(next.length - 2) : next;
    });
  }, []);
  const selectedPrimerKeys = useMemo(
    () => selectedPrimers.map((s) => s.key),
    [selectedPrimers],
  );
  const flankZone = useMemo(() => {
    if (selectedPrimers.length !== 2) return null;
    const span = flankedSpan(selectedPrimers[0].hit, selectedPrimers[1].hit);
    if (!span || span.end <= span.start) return null;
    // amber attention fill (design-system: not red/punk).
    return {
      zoneId: "__primer-flank__", start: span.start, end: span.end, color: "#B87A0E",
    };
  }, [selectedPrimers]);

  // 18.05.2026 — «добавить праймер» opens a modal pre-filled from the
  // selection (RC-oriented), editable name/seq/RC, then creates. The
  // right-click "primer" item routes here instead of creating directly.
  const [primerDraft, setPrimerDraft] = useState(null);
  // requestWritePrimer is defined AFTER `fullSeq` (declared below) to
  // avoid a TDZ — see just past the fullSeq/orfRanges memos.

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

  // Primer-from-selection: pre-fill the modal with the selected DNA
  // (RC-oriented for a reverse primer). Declared here — after `fullSeq`.
  const requestWritePrimer = useCallback(({ direction, start, end }) => {
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);
    const slice = String(fullSeq || "").slice(lo, hi).toUpperCase();
    const dir = direction === "reverse" ? "reverse" : "forward";
    setPrimerDraft({
      direction: dir,
      start: lo,
      end: hi,
      sequence: dir === "reverse" ? reverseComplement(slice) : slice,
    });
  }, [fullSeq]);

  // 18.05.2026 (Игорь) — double-click an existing primer opens the
  // SAME modal, seeded from THAT primer (its own ПСО + name + dir),
  // so the biolog can review / tweak it. Submit routes through the
  // existing onWritePrimer path (the single write channel). Gated on
  // onWritePrimer — without it the modal can't render anyway.
  const onPrimerDoubleClick = useCallback((hit) => {
    if (!onWritePrimer || !hit) return;
    const dir = hit.direction === "reverse" ? "reverse" : "forward";
    setPrimerDraft({
      direction: dir,
      start: hit.start,
      end: hit.end,
      sequence: String(hit.sequence || hit.bindingSequence || "").toUpperCase(),
      name: hit.name || "",
    });
  }, [onWritePrimer]);

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
  }, []);

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
    if (!shouldEnableWrapTail({
      circular,
      seqLength: fullSeq.length,
      cpl: charsPerLine,
      viewportHeight,
      lineHeight: mainLineHeight,
    })) {
      return { leading: [], trailing: [] };
    }
    const count = pickWrapTailLines({ totalMainLines: lines.length });
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
  }, [circular, fullSeq, charsPerLine, lines, viewportHeight, mainLineHeight]);
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

  // V76 — annealing Tm of the current DNA selection, shown near the
  // cursor. Opt-in (showSelectionTm), DNA-only (Tm is meaningless for
  // an aa selection), needs a non-empty range + a known pointer pos.
  const selectionTm = (() => {
    if (!showSelectionTm || !tmPt) return null;
    if (selectionMode === 'aa') return null;
    const a = (typeof caretAnchor === 'number' && Number.isFinite(caretAnchor)) ? caretAnchor : null;
    const f = (typeof caretPos === 'number' && Number.isFinite(caretPos)) ? caretPos : null;
    if (a == null || f == null || a === f) return null;
    const lo = Math.max(0, Math.min(a, f));
    const hi = Math.max(a, f);
    const sub = (fullSeq || '').slice(lo, hi);
    if (!sub.length) return null;
    // Игорь 18.05.2026: счётчик нуклеотидов остаётся ВСЕГДА; убирается
    // только Tm вне 1–150 п.о. — праймер длиннее физически невозможен
    // (и считать тяжело на огромных выделениях); <2 — Tm одной базы не
    // определён. tm=null → подсказка показывает только «N bp».
    const tm = (sub.length >= 2 && sub.length <= 150) ? calcTm(sub) : null;
    return { tm, len: sub.length };
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
  usePieceHotkey({ onCreatePiece, caretAnchor, caretPos });
  // 18.05.2026 — Ctrl+R / Ctrl+Alt+R make a fwd/rev primer from the
  // selection in EVERY viewer (same flow as right-click «primer»),
  // not just the assembler (Игорь). Consumer-gated on onWritePrimer.
  usePrimerHotkeys({
    onWritePrimer, requestWritePrimer, caretAnchor, caretPos,
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
    const renderLine = (line, kind, nextKind) => (
      <SequenceLine
        key={`${kind}:${line.start}`}
        line={line}
        kind={kind}
        nextKind={nextKind}
        seqLength={seqLength}
        fullSeq={fullSeq}
        features={features}
        primers={primers}
        onPrimerClick={onPrimerClick}
        onPrimerDoubleClick={onPrimerDoubleClick}
        selectedPrimerKeys={selectedPrimerKeys}
        reSites={reSites}
        charPx={charPx}
        showBottomStrand={settings.showBottomStrand}
        framesMode={settings.framesMode}
        primerStyle={settings.primerStyle}
        reOrientation={settings.reOrientation}
        visibleFrames={settings.visibleFrames}
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
        onRestrictionClick={onRestrictionClick}
        restrictionHighlightKey={restrictionHighlightKey}
        hoveredRestrictionKey={hoveredRestrictionKey}
        onRestrictionHover={setHoveredRestrictionKey}
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
      out.push(renderLine(lines[i], 'main', next));
    }
    for (let i = 0; i < trailing.length; i += 1) {
      // Last trailing line has no following row — keep its divider
      // for the «end of viewport» visual cue.
      const next = i < trailing.length - 1 ? 'trailing-wrap' : 'trailing-wrap';
      out.push(renderLine(trailing[i], 'trailing-wrap', next));
    }
    return out;
  }, [
    measured, lines, wrapTailLines, fullSeq, features, primers, reSites, charPx,
    onPrimerClick, onPrimerDoubleClick, selectedPrimerKeys,
    settings.showBottomStrand, settings.framesMode, settings.primerStyle,
    settings.reOrientation, settings.visibleFrames,
    framesResolution, orfRanges, renderHybrid,
    onAnnotationClick, tracksReady,
    onAnnotationEdgePointerDown, draggedAnnotationId, draggedEdge, draggedCurrentCoord,
    onAnnotationDoubleClick, onAnnotationFeatureDoubleClick,
    // 12.05.2026 — was missing: click on RE site flips
    // restrictionHighlightKey in the editor, but the memo didn't
    // recompute → binding-zone overlay never propagated to
    // SequenceLine → выделение не показывалось. Add both deps.
    onRestrictionClick, restrictionHighlightKey,
    hoveredRestrictionKey,
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
      onPointerMove={(e) => {
        onRootPointerMove(e);
        // V76 — track the cursor so the Tm readout sits next to it.
        if (showSelectionTm) setTmPt({ x: e.clientX, y: e.clientY });
      }}
      onPointerLeave={showSelectionTm ? () => setTmPt(null) : undefined}
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
          flankZone
            ? [...(Array.isArray(pieceZones ?? coloredZones) ? (pieceZones ?? coloredZones) : []), flankZone]
            : (pieceZones ?? coloredZones)
        }
        charPx={charPx}
        charsPerLine={charsPerLine}
        containerRef={containerRef}
        onZoneClick={onZoneClick}
        onZoneHover={onZoneHover}
      />
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
        seqLength={seqLength}
      />
      <SearchHitsOverlay
        hits={searchHits}
        charPx={charPx}
        charsPerLine={charsPerLine}
        containerRef={containerRef}
      />
      <CaretOverlay
        caretPos={caretPos}
        charPx={charPx}
        containerRef={containerRef}
        showBottomStrand={settings.showBottomStrand}
        seqLength={seqLength}
        charsPerLine={charsPerLine}
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
        onClose={() => setContextMenu(null)}
        extraItems={buildSelectionMenuItems({
          contextMenu,
          caretAnchor,
          caretPos,
          annotations,
          setContextMenu,
          onEditKeyDown,
          onAnnotationEdit,
          onOpenAnnotator,
          onBlastSelection,
          onWritePrimer: onWritePrimer ? requestWritePrimer : undefined,
          onCreatePiece,
        })}
      />
      {primerDraft && onWritePrimer && (
        <PrimerFromSelectionModal
          draft={primerDraft}
          onClose={() => setPrimerDraft(null)}
          onCreate={({ name, sequence, direction }) => {
            onWritePrimer({
              direction,
              start: primerDraft.start,
              end: primerDraft.end,
              name,
              sequence,
            });
            setPrimerDraft(null);
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
      <SequenceFloatingTooltips
        dragTooltip={dragTooltip}
        selectionTm={selectionTm}
        tmPt={tmPt}
      />
    </div>
  );
});

export default SequenceView;
