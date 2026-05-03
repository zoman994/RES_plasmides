/**
 * SequenceView — display-only sequence viewer (Sprint M-B.3, K6 final).
 *
 * Replaces 5 v0.5/v0.6 carryovers (SequenceMapView/SequencePane/
 * SequencePreview/SequenceViewer/PlasmidWorkspace, ~70 KB) with one
 * orchestrator + per-track components in this folder.
 *
 * Render order per line (revised 03.05.2026 evening — DNA-first layout
 * per biolog feedback: «первично будет всё же ДНК, а фичи аннотации и
 * АА под ДНК»):
 *   PrimerTrack          — top, points at DNA below
 *   RestrictionTrack     — top, RE sites mark DNA below
 *   RulerTrack           — top, numbers DNA below
 *   StrandsTrack top     — DNA forward (primary)
 *   StrandsTrack bottom  — DNA reverse (only when settings.showBottomStrand)
 *   AnnotationTrack      — feature bars BELOW DNA (was above pre-03.05.2026)
 *   AATrack forward      — translation, below annotation (always)
 *   AATrack reverse      — only when strategy === 'hybrid'
 *
 * Settings come from `uiSlice.sequenceView` (introduced in K7). When the
 * slice is absent (e.g. older store, isolated tests), defaults apply
 * automatically via `selectSequenceViewSettings`.
 *
 * Layer separation (DEC-SQV-07): NO container imports. Plain `fragments`
 * shape only. M-C wraps this with commit-resolution; this file stays
 * reusable in Importer / Container Window / Mix Workspace.
 */

import {
  forwardRef,
  memo,
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
import { detectORFRanges } from "./lib/orf-ranges.js";
import { resolveFramesMode } from "./lib/frames-mode.js";
import { useRowSelectionIsolation } from "./lib/row-selection-isolation.js";
import { runPredictors } from "../../predicted-detection.js";
import { reverseComplement } from "../../sequence-utils";
import { getRegions } from "../../annotation-model.js";
import { featureColorShaded, FEATURE_STROKE } from "../../feature-palette.js";
import { scanAllSites, RE_ENZYMES } from "../../restriction-db.js";

export { FEATURE_STROKE };

import RulerTrack from "./tracks/RulerTrack.jsx";
import StrandsTrack from "./tracks/StrandsTrack.jsx";
import AnnotationTrack from "./tracks/AnnotationTrack.jsx";
import AATrack from "./tracks/AATrack.jsx";
import PrimerTrack from "./tracks/PrimerTrack.jsx";
import RestrictionTrack from "./tracks/RestrictionTrack.jsx";

export const LABEL_WIDTH = 8;

// Stable empty-array reference used when consumer omits `primers`.
// JS default-parameter syntax `primers = []` evaluates the array
// LITERAL on every call, producing a new reference. Each new
// reference makes `<SequenceLine memo>` bail (shallow-equal compare
// fails) and re-render every line — perceptible lag on long
// plasmids when an unrelated parent state shifts. Hoisting to a
// module constant gives every default-call the SAME array instance.
const EMPTY_PRIMERS = Object.freeze([]);

// Stable empty-object reference used as the predictions-settings
// default before the K5 store migration. Same memo-bail rationale as
// EMPTY_PRIMERS — without a hoisted constant, the `settings.predictions
// || {}` fallback would emit a fresh `{}` on every render and force
// `runPredictors` useMemo to recompute uselessly.
const EMPTY_PREDICTIONS = Object.freeze({});

// Test-env detector — used both for `tracksReady` initial value (so
// vitest assertions on heavy tracks find them synchronously) and for
// the per-line `content-visibility` opt-out (happy-dom doesn't fully
// implement content-visibility skip-rendering, which historically
// drifted timing of `primer-wizard.test.jsx` and friends — see V49
// regression notes).
const __IS_TEST_ENV__ =
  typeof import.meta !== "undefined"
  && typeof import.meta.env !== "undefined"
  && import.meta.env.MODE === "test";

/**
 * Selector — direct slice read so React doesn't see a new object on
 * every render (a wrapping selector that returned `{...}` would feed
 * Zustand a fresh reference each call → "Maximum update depth exceeded"
 * loop in React 19). The slice is initialised by uiSlice.loadInitialSequenceView()
 * which already validates every field; we only need to fall back when
 * isolated test harnesses set `state.sequenceView` to undefined.
 */
const sliceSelector = (state) =>
  state && state.sequenceView ? state.sequenceView : SEQUENCE_VIEW_DEFAULTS;

/**
 * Build the construct-level features + per-position annotation map.
 *
 * Colour palette comes from `feature-palette.featureColorShaded(type, name)`
 * — same source as the circular PlasmidMap (DEC-DS-02 ⚓), so the same
 * GAL1 promoter / AmpR / etc. read the SAME shade in both views. Using
 * `theme.FEATURE_COLORS` (v0.5 carryover) made the SequenceView clash
 * against the PlasmidMap colours during M-B.3 visual review.
 */
function buildFeatureMap(fragments) {
  let seq = "";
  const feats = [];
  if (!Array.isArray(fragments)) return { fullSeq: "", features: [] };
  fragments.forEach((f, i) => {
    if (!f) return;
    const fragStart = seq.length;
    seq += f.sequence || "";
    const fragEnd = seq.length;
    const fragColor = f.customColor || featureColorShaded(f.type, f.name);
    const regions = getRegions(f.annotations);
    if (regions.length > 1) {
      regions.forEach((r, ri) => {
        feats.push({
          id: `${f.id || i}_r${ri}`,
          name: r.name,
          type: r.type,
          start: fragStart + r.start,
          end: fragStart + r.end,
          color: featureColorShaded(r.type, r.name),
          strand: r.strand || f.strand || 1,
          level: "region",
          kind: r.kind,
          // Sprint M-X.1 K4 — propagate predicted fields if the source
          // annotation already carries them (e.g. user-stored predicted
          // ORF accepted as confident in M-X.2). For confident hits
          // these are simply undefined → AnnotationTrack falls back to
          // the filled-solid path.
          predicted: r.predicted,
          source: r.source,
          confidence: r.confidence,
          signals: r.signals,
        });
      });
    } else {
      feats.push({
        id: f.id || i,
        name: f.name,
        type: f.type,
        start: fragStart,
        end: fragEnd,
        color: fragColor,
        strand: f.strand || 1,
        level: "region",
      });
    }
  });
  return { fullSeq: seq, features: feats };
}

/**
 * Merge confident features (from `buildFeatureMap`) with the predicted
 * regions returned by `runPredictors()`. Predicted regions get a
 * resolved `color` via `featureColorShaded()` so the AnnotationTrack
 * dashed-stroke render (K4) picks the same hue as the confident
 * feature would have — visual consistency.
 *
 * Single source of truth for downstream tracks: AnnotationTrack +
 * StrandsTrack tint + AATrack receive ONE merged `features` array.
 */
function mergeWithPredicted(features, predictedRegions) {
  if (!Array.isArray(predictedRegions) || predictedRegions.length === 0) {
    return features;
  }
  const decorated = predictedRegions.map((r, i) => ({
    id: r.id || `pred_${i}`,
    name: r.name,
    type: r.type,
    start: r.start,
    end: r.end,
    color: featureColorShaded(r.type, r.name),
    strand: r.strand || 1,
    level: "region",
    kind: r.kind,
    predicted: true,
    source: r.source,
    confidence: r.confidence,
    signals: r.signals,
  }));
  return features.concat(decorated);
}

/**
 * For a given line, build the per-position annotation map (length === lineLen)
 * — one slot per nt holding the topmost feature at that position. Used by
 * StrandsTrack for tint and intron lowercase.
 */
function buildLineAnnMap(features, lineStart, lineLen) {
  const map = new Array(lineLen).fill(null);
  if (!features || features.length === 0) return map;
  const lineEnd = lineStart + lineLen;
  for (const f of features) {
    if (f.end <= lineStart || f.start >= lineEnd) continue;
    const from = Math.max(0, f.start - lineStart);
    const to = Math.min(lineLen, f.end - lineStart);
    for (let k = from; k < to; k++) {
      // Latest-wins is OK here because the StrandsTrack tint is
      // intentionally a low-alpha hint; the real multi-row track lives
      // in AnnotationTrack and uses the unmutated regions list.
      map[k] = f;
    }
  }
  return map;
}

/**
 * Convert v0.5 scanAllSites output into a flat per-cut-position array
 * the RestrictionTrack can consume.
 */
function flattenSites(scanResult, filterMode) {
  if (!Array.isArray(scanResult)) return [];
  const rows =
    filterMode === "unique"
      ? scanResult.filter((re) => re.isUnique)
      : filterMode === "double"
        ? scanResult.filter((re) => re.cutCount <= 2)
        : scanResult;
  const out = [];
  for (const re of rows) {
    const cutOffset = (RE_ENZYMES[re.enzyme] && RE_ENZYMES[re.enzyme].cut[0]) || 0;
    for (const pos of re.positions) {
      out.push({
        enzyme: re.enzyme,
        position: pos.position + cutOffset,
      });
    }
  }
  return out;
}

/**
 * SequenceView — display-only.
 *
 * @param {object} props
 * @param {Array<{ id?, sequence, annotations?, type?, name?, strand?, customColor? }>} props.fragments
 * @param {boolean} [props.circular=false]
 * @param {Array<object>} [props.primers=[]]
 * @param {boolean} [props.readOnly=true]   reserved for M-D
 * @param {(start: number, end: number) => void} [props.onSelect]
 * @param {(annotation: object) => void} [props.onAnnotationClick]
 * @param {(op: object) => void} [props.onMutate]
 * @param {(primer: object) => void} [props.onAddPrimer]
 * @param {(site: object) => void} [props.onRestrictionClick]
 */
// forwardRef so consumers (Importer-merge-tabs K4: SequenceTab + the
// LinearFeatureBar «колбаса» below it) can imperatively scroll the
// viewer to a specific absolute sequence position. The annotator (a
// future separate module — sprint «не смешивай» / 04.05.2026) will
// reuse the same imperative handle for jumping to highlighted hits.
//
// `onVisibleRangeChange({ start, end })` (Importer-merge-tabs cursor
// follow-up, 04.05.2026): consumer is notified of the
// currently-on-screen absolute sequence span as the user scrolls.
// LinearFeatureBar uses this to render a draggable viewport-window
// indicator that mirrors what the biolog is looking at.
const SequenceView = forwardRef(function SequenceView({
  fragments,
  circular = false,
  primers = EMPTY_PRIMERS,
  // Reserved props — wired to no behaviour in M-B.3 (display-only).
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
  // Keyboard caret (Importer drag-scrubber follow-up, 04.05.2026 —
  // биолог: «курсор должен жить и на сиквенс вью. чтобы я мог
  // спокойно выделять текст с помощью клавиатуры»). `caretPos` is
  // controlled by the parent (synced with the LinearFeatureBar);
  // arrow keys + Home/End/PageUp/Down call
  // `onCaretChange(newPos, { extendSelection, needsScroll })` so the
  // parent can mirror the move and queue an instant scroll.
  // `caretAnchor` is the OTHER end of the selection range; when it
  // differs from caretPos, [min..max+1] is highlighted. Plain arrows
  // collapse it (anchor = focus). null = no caret.
  caretPos = null,
  caretAnchor = null,
  onCaretChange,
}, ref) {
  const containerRef = useRef(null);
  const [charPx, setCharPx] = useState(7.2);
  const [charsPerLine, setCharsPerLine] = useState(80);
  // `measured` gate — the container starts mounted (so ResizeObserver
  // can attach + observe), but actual lines don't render until the
  // first valid width measurement comes back. Pre-warm scenario is
  // the prime offender: SingleInspector mounts SequenceView inside a
  // `display: none` div for idle pre-warm; clientWidth is 0 there, so
  // useLayoutEffect's remeasure bails. The ResizeObserver then fires
  // ASYNCHRONOUSLY when the user clicks the tab and display flips to
  // `block`. Between display:block and the re-render that lands the
  // measurement, the user used to see the old default (80
  // chars/line) → narrow render flash → ~0.5 s later snap-to-wide
  // (биолог: «сначала в узком формате... потом приходит в норму»).
  // The gate trades that flash for a brief blank container, which
  // reads as a clean "still loading" instead of "broken layout".
  const [measured, setMeasured] = useState(false);

  // Per-row selection scoping (DNA-first layout follow-up,
  // 03.05.2026): drag-to-select stays inside ONE row at a time, so the
  // user can copy e.g. just the reverse strand or just one AA frame
  // without picking up neighbours. See lib/row-selection-isolation.js.
  useRowSelectionIsolation(containerRef);

  // Imperative scroll-to-position handle (Importer-merge-tabs K1).
  // The bare implementation lives in `attachScrollHandle` (module
  // scope) but we wrap it here so a request that arrives BEFORE the
  // viewer has measured its container (and therefore before lines
  // have rendered) is queued and re-applied once `measured` flips.
  // Without the queue, biolog clicks a feature on the SingleInspector
  // strip while still on Overview tab → SequenceTab pre-warm not
  // mounted → ref.scrollToPosition runs, finds 0 lines, no-op.
  const pendingScrollPosRef = useRef(null);
  const pendingScrollOptsRef = useRef(null);
  const performScrollRef = useRef(null);
  performScrollRef.current = useMemo(() => {
    const factory = attachScrollHandle(ref, containerRef);
    return factory().scrollToPosition;
  }, [ref]);
  useImperativeHandle(ref, () => ({
    // `opts.behavior` controls smooth-vs-instant scroll. Live-drag
    // scrubbing on the LinearFeatureBar passes 'auto' so the viewer
    // tracks the pointer in real time; click / settle uses the
    // default 'smooth' so the final landing has motion the eye can
    // follow.
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
  // Drain the queue once lines actually appear (after the
  // measure-gate flips and React commits the line list).
  useEffect(() => {
    if (!measured) return;
    if (pendingScrollPosRef.current == null) return;
    // Wait one frame so the lines DOM is materialised before the
    // scroll math reads offsetTop.
    const id = requestAnimationFrame(() => {
      if (pendingScrollPosRef.current == null) return;
      performScrollRef.current?.(pendingScrollPosRef.current, pendingScrollOptsRef.current);
      pendingScrollPosRef.current = null;
      pendingScrollOptsRef.current = null;
    });
    return () => cancelAnimationFrame(id);
  }, [measured]);

  // Two-phase render to keep first paint cheap on slow hardware.
  // Initial mount on a 8 GB / mid-tier CPU laptop (typical academic
  // workstation) was freezing for ~1-1.5 s on a 8.8 kb plasmid because
  // ALL tracks (DNA strands + ruler + annotations + AA + primers + RE)
  // rendered synchronously — ~480 components × ~3 ms = ~1.5 s blocked
  // main thread. Quick win (perf review 04.05.2026 PM): render only
  // the cheap, orientation-critical tracks (strands + ruler) on the
  // first paint; defer annotation / AA / primer / restriction tracks
  // to the next idle frame via requestIdleCallback. The biolog sees
  // DNA + position numbers within ~200 ms even on slow hardware,
  // tracks "fill in" ~150-300 ms later. Real cost unchanged, perceived
  // perf dramatically better — first paint is no longer blocked.
  //
  // Tests bypass the defer (import.meta.env.MODE === 'test') so the
  // existing assertions on annotation / AA tracks still find them
  // synchronously after `render()` without needing `await waitFor`.
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
    // Fallback (Safari < 16.4, JSDom): a 0-ms timeout still yields to
    // the browser between first paint and the deferred render.
    const t = setTimeout(() => setTracksReady(true), 0);
    return () => clearTimeout(t);
  }, [tracksReady]);

  const settings = useStore(sliceSelector);

  // V0.5 RE state — `useStore(s => s.showReSites)` returns undefined on v0.6
  // and the track silently collapses. No mount gate needed.
  const showReSites = useStore((s) => s.showReSites);
  const reFilter = useStore((s) => s.reFilter);
  const reMinSiteLen = useStore((s) => s.reMinSiteLen);

  const { fullSeq, features: confidentFeatures } = useMemo(
    () => buildFeatureMap(fragments),
    [fragments],
  );

  // Sprint M-X.1 K3 — Structural Predictor consumer integration
  // (DEC-PRED-06). Predicted regions are TRANSIENT: computed here on
  // every (fullSeq, settings.predictions, confidentFeatures) shift,
  // not persisted into baseSnapshot. settings.predictions defaults to
  // an empty object on stores that haven't been migrated to the K5
  // shape yet — runPredictors then runs no detectors (`cds=false`,
  // `promoter=false`, …) and returns []. Once the user toggles
  // anything in SettingsPopover (K5), this useMemo re-runs reactively
  // and the AnnotationTrack picks the new regions up via the merged
  // `features` prop.
  const predictionsSettings = settings.predictions || EMPTY_PREDICTIONS;
  const predictedRegions = useMemo(
    () => runPredictors(fullSeq, predictionsSettings, confidentFeatures),
    [fullSeq, predictionsSettings, confidentFeatures],
  );

  const features = useMemo(
    () => mergeWithPredicted(confidentFeatures, predictedRegions),
    [confidentFeatures, predictedRegions],
  );

  // Detect ORFs once per fullSeq for the Smart-6-frame trinity.
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
  // remeasure happens BEFORE the first paint instead of after. With
  // useEffect, the first painted frame had the default `charsPerLine
  // = 80` value (narrow), then ~1 frame later React committed the
  // real measurement and the layout snapped wider — biolog 03.05.2026
  // evening: «когда заходишь в сиквенс вью то сразу происходит рендер
  // сначала в узком формате (как будто в пол экрана сиквенс
  // рендерится) а потом приходит в норму — занимает примерно пол
  // секунды». Switching to useLayoutEffect closes that gap to zero.
  useLayoutEffect(() => {
    const host = containerRef.current;
    if (!host) return;

    const remeasure = () => {
      const chW = measureCharPx(host);
      if (!chW) return;
      const available = host.clientWidth - 24;
      if (available <= 0) return; // host hidden / collapsed — wait for ResizeObserver
      const fitChars = Math.floor(available / chW) - LABEL_WIDTH;
      setCharPx(chW);
      setCharsPerLine(clampCharsPerLine(fitChars));
      setMeasured(true);
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

  // Forward selection callbacks (no-op in M-B.3 because there is no
  // selection state yet — wired for M-D Container Window).
  void onSelect;
  void onAnnotationClick;

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

  const renderHybrid = framesResolution.strategy === "hybrid";

  // Keyboard caret nav — fires when the SequenceView root has focus.
  // Maps Arrow / Home / End / PageUp / PageDown to a new absolute
  // sequence position and hands it to the parent via onCaretChange,
  // which is responsible for the actual state update + instant
  // scroll (see SingleInspector.onCaretChangeFromView). If the parent
  // hasn't supplied a caret yet (`caretPos == null`), the first key
  // press initialises to position 0 — biolog's «if I tab into the
  // sequence and start pressing arrows, just put the caret at the
  // start so I can drive from there».
  const seqLength = (fragments && fragments[0] && fragments[0].sequence)
    ? fragments[0].sequence.length
    : 0;
  const onRootKeyDown = (e) => {
    if (!seqLength) return;
    // Copy hotkeys — biolog 04.05.2026: «обычный Ctrl+C копирует
    // прямую цепь, Ctrl+Alt+C копирует обратную». Reverse strand =
    // reverse complement, so the user can paste it 5'→3' into other
    // tools without manually flipping.
    //
    // KEY DETECTION: use `e.code === "KeyC"` (layout-independent
    // physical key) instead of `e.key === "c"`. On a Russian
    // keyboard layout, the same physical C key emits `e.key === "с"`
    // (Cyrillic ес) — the check on `"c"` would silently fail and
    // biolog reported «Ctrl+C не работает» (04.05.2026 evening).
    if ((e.ctrlKey || e.metaKey) && e.code === "KeyC") {
      const a = (typeof caretAnchor === "number" && Number.isFinite(caretAnchor)) ? caretAnchor : null;
      const f = (typeof caretPos === "number" && Number.isFinite(caretPos)) ? caretPos : null;
      if (a == null || f == null || a === f) return; // no selection — let browser handle native copy
      const start = Math.min(a, f);
      const end = Math.max(a, f) + 1; // half-open → include the focus letter
      const slice = (fullSeq || "").slice(start, end);
      if (!slice) return;
      e.preventDefault();
      const text = e.altKey ? reverseComplement(slice) : slice;
      try {
        navigator.clipboard?.writeText?.(text);
      } catch { /* clipboard unavailable — silently no-op */ }
      return;
    }

    if (typeof onCaretChange !== "function") return;
    const cur = (typeof caretPos === "number" && Number.isFinite(caretPos))
      ? caretPos
      : 0;
    const cpl = charsPerLine || 80;
    let next = cur;
    switch (e.key) {
      case "ArrowLeft":  next = cur - 1; break;
      case "ArrowRight": next = cur + 1; break;
      case "ArrowUp":    next = cur - cpl; break;
      case "ArrowDown":  next = cur + cpl; break;
      case "Home":       next = Math.floor(cur / cpl) * cpl; break;
      case "End":        next = Math.floor(cur / cpl) * cpl + (cpl - 1); break;
      case "PageUp":     next = cur - cpl * 10; break;
      case "PageDown":   next = cur + cpl * 10; break;
      default: return;
    }
    next = Math.max(0, Math.min(seqLength - 1, next));
    if (next === cur && caretPos != null) return;
    e.preventDefault();
    // `needsScroll` — only ask the parent to scroll when the caret
    // crosses a line boundary. For held ArrowLeft/Right the caret
    // stays on the same line ~150-300 keystrokes long; skipping
    // scrollIntoView for those (~99 % of the time) lifts a per-frame
    // browser layout call out of the hot path. Up/Down/Home/End/PgUp/
    // PgDn always change lines, so they keep their scroll request.
    const oldLine = Math.floor(cur / cpl);
    const newLine = Math.floor(next / cpl);
    onCaretChange(next, {
      needsScroll: oldLine !== newLine,
      extendSelection: !!e.shiftKey,
    });
  };

  // Memoize the entire lines JSX subtree. caretPos is INTENTIONALLY
  // not in deps — the caret renders as a separate CaretOverlay layer
  // and doesn't touch the lines array. So when only caretPos changes
  // (every arrow keystroke), React reuses the memoized React element
  // tree and skips reconciliation of all ~60 SequenceLine children
  // entirely. Combined with `needsScroll: oldLine === newLine ⇒ false`,
  // a held ←/→ does effectively zero React work per keystroke — only
  // the small CaretOverlay div re-renders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const linesJsx = useMemo(() => {
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
      />
    ));
  }, [
    measured, lines, fullSeq, features, primers, reSites, charPx,
    settings, framesResolution, orfRanges, renderHybrid,
    onAnnotationClick, tracksReady,
  ]);

  // Mouse drag selection — biolog 04.05.2026: «давай чтобы каретка
  // двигалась за мышью при выделении». PointerDown anywhere on the
  // sequence sets the caret + collapses any prior selection;
  // PointerMove (with the button held) extends the selection by
  // moving focus while keeping the anchor pinned at the down-point.
  // PointerUp ends the drag.
  //
  // We don't preventDefault on pointerdown — native text selection
  // still works alongside, so the existing per-row selection
  // isolation (StrandsTrack drag-to-copy) keeps functioning if biolog
  // prefers browser-native copy instead of Ctrl+C. The orange overlay
  // + the native selection are both visible; the browser uses native
  // selection for unmodified Ctrl+C, our hotkey handler reads our
  // own anchor/focus state for strand-aware copy.
  const dragRef = useRef({ active: false, pointerId: null });
  // `pointerMovedRef` — set to true the first time pointermove fires
  // during a drag. Used by onClickFallback to skip the
  // collapse-on-click when the click is actually the tail of a real
  // drag-select. Without it, biolog reported «когда тянешь мышкой и
  // отпускаешь, то выделение пропадает» (04.05.2026 evening) —
  // pointerup fires with the selection in place, then the browser
  // synthesises a click event which our fallback was treating as a
  // fresh click and collapsing the selection.
  const pointerMovedRef = useRef(false);
  const posFromPointerEvent = (e) => {
    if (!seqLength || !charPx) return null;
    let el = e.target;
    while (el && el !== containerRef.current) {
      if (el.dataset && el.dataset.lineStart != null) break;
      el = el.parentElement;
    }
    // Pointer can drag off into the gutter / padding — fall back to
    // the line under the cursor's Y by scanning all lines.
    if (!el || el === containerRef.current) {
      const lines = containerRef.current?.querySelectorAll('[data-testid="sequence-view-line"]');
      if (!lines) return null;
      for (const candidate of lines) {
        let r;
        try { r = candidate.getBoundingClientRect(); } catch { continue; }
        if (e.clientY >= r.top && e.clientY <= r.bottom) {
          el = candidate;
          break;
        }
      }
      if (!el) return null;
    }
    const lineStart = parseInt(el.dataset.lineStart, 10);
    if (Number.isNaN(lineStart)) return null;
    let rect;
    try { rect = el.getBoundingClientRect(); } catch { return null; }
    if (!rect || !rect.width) return null;
    const x = e.clientX - rect.left;
    const offsetCh = Math.round(x / charPx) - LABEL_WIDTH;
    const lineLen = Math.min(charsPerLine || 80, seqLength - lineStart);
    const clamped = Math.max(0, Math.min(lineLen, offsetCh));
    return Math.max(0, Math.min(seqLength - 1, lineStart + clamped));
  };

  const onRootPointerDown = (e) => {
    if (typeof onCaretChange !== "function") return;
    if (e.button != null && e.button !== 0) return; // primary button only
    const pos = posFromPointerEvent(e);
    if (pos == null) return;
    dragRef.current = { active: true, pointerId: e.pointerId };
    pointerMovedRef.current = false;
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    // Collapse selection on press, then extend with subsequent moves.
    onCaretChange(pos, { extendSelection: false, needsScroll: false });
    // Refocus so subsequent arrow keys + Ctrl+C land on onKeyDown.
    try { containerRef.current?.focus({ preventScroll: true }); } catch { /* noop */ }
    // preventDefault stops the browser from initiating its own native
    // text-selection drag on top of ours (biolog 04.05.2026: «можем
    // отключить нативное выделение? которое чёрным выделяет как
    // обычный текст»). We render our own translucent orange overlay,
    // so we don't want the browser drawing its blue/dark selection
    // over the same range.
    e.preventDefault();
  };

  const onRootPointerMove = (e) => {
    if (!dragRef.current.active) return;
    if (dragRef.current.pointerId != null && e.pointerId !== dragRef.current.pointerId) return;
    const pos = posFromPointerEvent(e);
    if (pos == null) return;
    pointerMovedRef.current = true;
    // extendSelection:true → anchor stays at pointerdown spot, focus
    // (= caretPos) tracks the pointer. needsScroll:false during the
    // active drag — held down the cursor stays on screen by virtue
    // of the user actively pointing at it, no auto-scroll needed
    // (and auto-scrolling mid-drag would re-trigger pointermove
    // and feedback-loop the selection).
    onCaretChange(pos, { extendSelection: true, needsScroll: false });
  };

  const onRootPointerUp = (e) => {
    if (!dragRef.current.active) return;
    if (dragRef.current.pointerId != null && e.pointerId !== dragRef.current.pointerId) return;
    try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
    dragRef.current = { active: false, pointerId: null };
    // pointerMovedRef stays set until the synthetic click event that
    // follows pointerup; onClickFallback reads it and resets it.
  };

  // Click fallback for synthetic-event environments (happy-dom test
  // fixtures) and assistive tech that fires click without
  // pointerdown/up. Positions the caret at the click point + does
  // NOT extend selection. Skips when a real pointer drag just ended
  // (pointerMovedRef === true) so the selection survives the
  // synthetic mouseup→click that the browser fires after a drag.
  const onRootClickFallback = (e) => {
    if (typeof onCaretChange !== "function") return;
    if (dragRef.current.active) return;
    if (pointerMovedRef.current) {
      pointerMovedRef.current = false;
      return;
    }
    const pos = posFromPointerEvent(e);
    if (pos == null) return;
    onCaretChange(pos, { extendSelection: false });
    try { containerRef.current?.focus({ preventScroll: true }); } catch { /* noop */ }
  };

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
        // position:relative so the absolutely-positioned CaretOverlay
        // child resolves its top/left against this scroll container.
        // Without it the caret would anchor to a more distant
        // ancestor (body) and drift on scroll / resize.
        position: "relative",
        // user-select:none — biolog 04.05.2026: «можем отключить
        // нативное выделение? которое чёрным выделяет как обычный
        // текст». We have our own translucent orange overlay; the
        // browser's native blue/dark text selection drawing on top
        // looked like a double highlight. Pointer-driven custom
        // selection (anchor + focus) drives the only highlight now.
        // The legacy per-row `useRowSelectionIsolation` mechanism
        // was tuned to the native selection model; with this
        // disabled, copy-via-browser through native Ctrl+C is also
        // off — biolog uses our Ctrl+C / Ctrl+Alt+C hotkey instead
        // for strand-aware copy.
        userSelect: "none",
        WebkitUserSelect: "none",
        // `overflow-anchor: none` disables Chromium's scroll anchoring
        // calculations (which try to keep the user's scroll position
        // stable when content shifts above the viewport). For a
        // sequence-view that doesn't reflow during scroll, the anchor
        // computation is pure overhead per scroll frame — observable
        // as micro-jitter on long plasmids.
        overflowAnchor: "none",
      }}
    >
      {/*
        * Don't render any lines until the first valid measurement
        * comes back — see `measured` state comment above. In test
        * environments (where layout queries return synthetic values
        * and ResizeObserver may not fire), `__IS_TEST_ENV__` short-
        * circuits the gate so existing assertions on rendered lines
        * keep finding them after `render()`.
        */}
      {linesJsx}
      {/* Caret overlay — absolutely positioned, scrolls with content
          (parent has position:relative). Lives OUTSIDE the lines map
          so caretPos changes don't blow the SequenceLine memo cache
          (biolog 04.05.2026: «при перемещении каретки лагает … такое
          ощущение что рендер каждый раз плазмиды заново при движении
          каретки»). Pure DOM measure on caretPos / charPx flip; no
          line re-renders. */}
      <SelectionOverlay
        caretPos={caretPos}
        caretAnchor={caretAnchor}
        charPx={charPx}
        charsPerLine={charsPerLine}
        containerRef={containerRef}
        showBottomStrand={settings.showBottomStrand}
      />
      <CaretOverlay
        caretPos={caretPos}
        charPx={charPx}
        containerRef={containerRef}
        showBottomStrand={settings.showBottomStrand}
      />
    </div>
  );
});

/**
 * Imperative `scrollToPosition` handle. Importer-merge-tabs K1.
 * Resolves the line containing `absolutePos` via the per-line
 * `data-line-start` attribute (no React state required), scrolls
 * its element into view, and flashes a brief highlight class so
 * the biolog notices the jump. Used by the LinearFeatureBar
 * «колбаса» click handler in SequenceTab (K4) and by the future
 * Annotator hit-list. Uses `containerRef` already set up for the
 * scroll container.
 *
 * Wrapped in `useImperativeHandle` and bound to `containerRef`
 * via the closure — the handle is recreated only when the
 * containerRef itself changes (i.e. effectively never). The
 * scrollToPosition call itself does no React work — pure DOM.
 */
function attachScrollHandle(ref, containerRef) {
  return () => ({
    scrollToPosition(absolutePos, opts) {
      const root = containerRef.current;
      if (!root) return;
      const lines = root.querySelectorAll(
        '[data-testid="sequence-view-line"]',
      );
      if (lines.length === 0) return;
      let target = null;
      for (const el of lines) {
        const start = parseInt(el.dataset.lineStart || "", 10);
        if (Number.isNaN(start)) continue;
        if (start > absolutePos) break;
        target = el;
      }
      if (!target) return;
      // Scroll the line into view. We can't always assume `root`
      // (SequenceView's own containerRef) is the actual scrolling
      // ancestor — when SequenceView lives inside a parent that owns
      // the scrollbar (like Importer's `importer-single-tab-content`
      // with `overflowY: scroll`), our own div has no internal
      // overflow and `root.scrollTop = N` is a no-op (biolog
      // 04.05.2026 evening: «всеравно не телепортирует на нужный
      // участок сиквенса»). `Element.scrollIntoView` walks up to the
      // nearest scrollable ancestor automatically, so it works
      // regardless of where the scroll container actually lives. We
      // pass `block: 'center'` so the highlighted line shows up in
      // the middle of the viewport — biolog still has context above
      // and below the jump target.
      const behavior = (opts && opts.behavior) || "smooth";
      try {
        if (typeof target.scrollIntoView === "function") {
          target.scrollIntoView({ behavior, block: "center" });
        } else {
          // Fallback for environments without scrollIntoView (rare —
          // covered by jsdom/happy-dom shims). Best-effort scrollTop
          // assumes `root` is the scroller, same as before.
          const containerRect = root.getBoundingClientRect();
          const targetRect = target.getBoundingClientRect();
          const offset = targetRect.top - containerRect.top + root.scrollTop;
          root.scrollTop = offset;
        }
      } catch {
        // happy-dom + some jsdom builds throw on getBoundingClientRect
        // when the element isn't laid out — accept the no-op, the
        // caret marker still tells the biolog where the jump landed.
      }
      // Flash highlight removed (biolog 04.05.2026: «убери золотистую
      // рамку на ОРФ при жимканье»). The caret + smooth scroll already
      // signal the jump; the gold flash was double-redundant feedback.
    },
  });
}

/**
 * CaretOverlay — single absolutely-positioned div drawn over the
 * lines in the scroll container. Lives outside the SequenceLine
 * memoization so caret movement re-renders only THIS component, not
 * the ~60 lines of a typical 8.8 kb plasmid (biolog 04.05.2026:
 * «при перемещении каретки очень лагает … ощущение что рендер каждый
 * раз плазмиды заново при движении каретки»). On caretPos / charPx
 * change a useLayoutEffect probes the DOM for the line containing the
 * caret, reads its offsetTop + offsetHeight, and writes a small
 * box state; React re-renders the overlay div only.
 *
 * Visual: 1.5 px wide accent fill, 0.5 px black box-shadow ring so
 * the caret reads on top of any feature tint underneath (biolog same
 * session: «сама картека должна иметь чёрную обводку и на колбасе и
 * на сиквенсе»). Spans the full line height minus the dashed-divider
 * gap (14 px) so it ties together ruler + DNA + annotation + AA
 * tracks at the column.
 */
/**
 * SelectionOverlay — paints a translucent rectangle on every line
 * that intersects the [min(anchor,focus) .. max(anchor,focus)+1]
 * range. Like CaretOverlay, lives outside the SequenceLine memo
 * cache so extending a selection with shift-arrow doesn't re-render
 * any line. Same sizing logic as CaretOverlay (DNA strand row(s)
 * only; collapses to one row when bottom strand is hidden), giving
 * the highlight a tight visual link to the strand the user is
 * selecting.
 */
function SelectionOverlay({
  caretPos, caretAnchor, charPx, charsPerLine, containerRef, showBottomStrand,
}) {
  const [rects, setRects] = useState([]);
  useLayoutEffect(() => {
    if (
      caretPos == null || !Number.isFinite(caretPos)
      || caretAnchor == null || !Number.isFinite(caretAnchor)
      || caretAnchor === caretPos
    ) {
      setRects((prev) => (prev.length === 0 ? prev : []));
      return undefined;
    }
    const root = containerRef.current;
    if (!root) return undefined;
    const start = Math.min(caretAnchor, caretPos);
    const end = Math.max(caretAnchor, caretPos) + 1; // half-open
    const cpl = charsPerLine || 80;
    const lines = root.querySelectorAll('[data-testid="sequence-view-line"]');
    const out = [];
    for (const el of lines) {
      const lineStart = parseInt(el.dataset.lineStart || "", 10);
      if (Number.isNaN(lineStart)) continue;
      const lineEnd = lineStart + cpl;
      if (lineEnd <= start || lineStart >= end) continue;
      const fromCh = Math.max(0, start - lineStart);
      const toCh = Math.min(cpl, end - lineStart);
      const topStrand = el.querySelector('[data-testid="sequence-view-strands-top"]');
      let top;
      let height;
      if (topStrand) {
        const bottomStrand = el.querySelector('[data-testid="sequence-view-strands-bottom"]');
        top = el.offsetTop + topStrand.offsetTop;
        if (bottomStrand) {
          const bottomY = el.offsetTop + bottomStrand.offsetTop + bottomStrand.offsetHeight;
          height = bottomY - top;
        } else {
          height = topStrand.offsetHeight;
        }
      } else {
        top = el.offsetTop;
        height = Math.max(8, el.offsetHeight - 14);
      }
      const left = (el.offsetLeft || 0) + (LABEL_WIDTH + fromCh) * charPx;
      const width = (toCh - fromCh) * charPx;
      out.push({ left, top, width, height, key: lineStart });
    }
    setRects(out);
    return undefined;
  }, [caretPos, caretAnchor, charPx, charsPerLine, containerRef, showBottomStrand]);

  if (rects.length === 0) return null;
  return (
    <>
      {rects.map((r) => (
        <div
          key={r.key}
          data-testid="sequence-view-selection"
          style={{
            position: "absolute",
            left: r.left,
            top: r.top,
            width: r.width,
            height: r.height,
            background: "rgba(249, 115, 22, 0.22)",
            outline: "0.5px solid rgba(0, 0, 0, 0.35)",
            pointerEvents: "none",
            zIndex: 4, // below caret (zIndex 5)
          }}
        />
      ))}
    </>
  );
}

function CaretOverlay({ caretPos, charPx, containerRef, showBottomStrand }) {
  const [box, setBox] = useState(null);
  useLayoutEffect(() => {
    if (caretPos == null || !Number.isFinite(caretPos)) {
      setBox((prev) => (prev === null ? prev : null));
      return undefined;
    }
    const root = containerRef.current;
    if (!root) return undefined;
    const lines = root.querySelectorAll('[data-testid="sequence-view-line"]');
    if (lines.length === 0) return undefined;
    let target = null;
    for (const el of lines) {
      const start = parseInt(el.dataset.lineStart || "", 10);
      if (Number.isNaN(start)) continue;
      if (start > caretPos) break;
      target = el;
    }
    if (!target) return undefined;
    const lineStart = parseInt(target.dataset.lineStart, 10);
    const offsetCh = caretPos - lineStart;
    const left = (target.offsetLeft || 0) + (LABEL_WIDTH + offsetCh) * charPx;
    // Caret spans only the DNA strand row(s) (biolog 04.05.2026:
    // «давай каретку сделаем не такую огромную. пусть она исключительно
    // по двум строкам ёлозит — по цепи ДНК. при переключении на 1
    // цепь она ещё уменьшаться должна»). Find the top strand element
    // → caret starts at its top. If the bottom strand is visible (two-
    // strand mode), caret extends to the bottom of the bottom strand.
    // If only the top strand is rendered (showBottomStrand=false),
    // caret height collapses to one row.
    const topStrand = target.querySelector('[data-testid="sequence-view-strands-top"]');
    let top;
    let height;
    if (topStrand) {
      const bottomStrand = target.querySelector('[data-testid="sequence-view-strands-bottom"]');
      top = target.offsetTop + topStrand.offsetTop;
      if (bottomStrand) {
        const bottomY = target.offsetTop + bottomStrand.offsetTop + bottomStrand.offsetHeight;
        height = bottomY - top;
      } else {
        height = topStrand.offsetHeight;
      }
    } else {
      // Strand DOM not yet mounted — fall back to the whole line
      // minus the divider gap so the caret is at least visible.
      top = target.offsetTop;
      height = Math.max(8, target.offsetHeight - 14);
    }
    setBox({ left, top, height });
    return undefined;
  }, [caretPos, charPx, containerRef, showBottomStrand]);

  if (!box) return null;
  return (
    <div
      data-testid="sequence-view-caret"
      data-caret-pos={caretPos}
      style={{
        position: "absolute",
        left: box.left,
        top: box.top,
        height: box.height,
        width: 1.5,
        background: "var(--accent-500, #f97316)",
        // 0.5 px black ring all the way around. boxShadow with no
        // offset / no blur and a positive spread = pure outline.
        boxShadow: "0 0 0 0.5px #000",
        pointerEvents: "none",
        zIndex: 5,
      }}
    />
  );
}

/**
 * SequenceLine — single line of the sequence view (one DNA chunk plus
 * all its track overlays). Wrapped in `React.memo` so a line whose
 * inputs don't change between renders skips its sub-tree entirely.
 *
 * Why this exists (perf review 04.05.2026 evening): on a typical 8.8 kb
 * plasmid at 150 chars / line we render ~60 lines × 8 tracks × ~150
 * inline-block spans ≈ 70 000 DOM nodes. Without memo, ANY parent
 * state change (settings popover open / close, theme toggle, an
 * unrelated zustand subscription elsewhere) re-renders all 70 000
 * nodes. With memo + the orchestrator passing stable refs (primers /
 * reSites / features / orfRanges / settings via useMemo + zustand
 * slice subscription), unchanged lines bail at the React level — only
 * the lines whose props actually shifted (rare) re-render.
 *
 * Also: each line div now has `contain: paint` so the browser can
 * paint each line in its own layer and skip re-painting siblings on
 * scroll (which is the dominant cost on long plasmids).
 *
 * `annMap` (per-position annotation lookup for the strand tint) is
 * memoized inside the line so it's recomputed only when (features,
 * line.start, line.seq.length) shift.
 */
const SequenceLine = memo(function SequenceLine({
  line,
  fullSeq,
  features,
  primers,
  reSites,
  charPx,
  settings,
  framesResolution,
  orfRanges,
  renderHybrid,
  onAnnotationClick,
  tracksReady,
}) {
  const annMap = useMemo(
    () => buildLineAnnMap(features, line.start, line.seq.length),
    [features, line.start, line.seq.length],
  );

  return (
    <div
      data-testid="sequence-view-line"
      data-line-start={line.start}
      data-tracks-ready={tracksReady ? "true" : "false"}
      style={{
        // Block hierarchy: each line = ruler + DNA + annotation + AA is
        // ONE logical unit. Inter-block separator (paddingBottom 14 +
        // 1 px dashed divider + marginBottom 14 → ≈28 px gap) tells
        // the biolog where one DNA segment ends and the next begins —
        // without it, ruler of line N+1 looked like it belonged to AA
        // of line N (visual review 03.05.2026 evening on
        // pBR322-GST-fusion 4.9 kb).
        marginBottom: 14,
        paddingBottom: 14,
        // 1 px dashed `--border-default` — was 0.5 px `--border-subtle`,
        // biolog visual review 03.05.2026 evening: «бледный пунктир,
        // чуть ярче». Still subtle enough to read as a line-block
        // separator, not a hard rule.
        borderBottom: "1px dashed var(--border-default, #c9c5c1)",
        // Browser-level paint isolation: scroll-induced repaints stay
        // inside this line's box, neighbours don't repaint. ~5-10×
        // scroll smoothness on long plasmids per Chrome dev-tools
        // performance profile (perf review 04.05.2026).
        contain: "paint",
        // `content-visibility: auto` — the big scroll-perf win
        // (биолог 03.05.2026 evening: «когда скроллишь
        // последовательности есть микрофризы»). The browser SKIPS
        // layout + paint of off-screen lines entirely (intersecting
        // viewport ± a generous overflow margin), keeping only the
        // reserved height (`contain-intrinsic-size`). Effectively
        // virtualization-without-React-rewrite. Initial first paint
        // is also faster because lines below the fold defer their
        // expensive work.
        //
        // Trade-offs:
        //   • Find-in-page may not surface text inside skipped lines
        //     until they're scrolled into view — acceptable for a
        //     read-only sequence display where the biolog navigates
        //     by position number, not browser find.
        //   • happy-dom doesn't fully implement skip-rendering —
        //     historically caused timing drift in `primer-wizard.test`
        //     and similar. Gated via `__IS_TEST_ENV__` so tests keep
        //     their fully-mounted DOM tree.
        //
        // `220px` is a rough average line height (ruler + DNA top +
        // bottom + annotation rect + 2 AA rows + dashed divider gap)
        // so the scroll bar's overall height stays close to the real
        // value before lines are realised. Mis-estimation only
        // affects scrollbar accuracy, not correctness.
        contentVisibility: __IS_TEST_ENV__ ? "visible" : "auto",
        containIntrinsicSize: "auto 220px",
      }}
    >
      {/*
        * Two-phase render. First paint shows only the cheap,
        * orientation-critical tracks (ruler + DNA strands). Heavier
        * tracks (annotations, AA, primer, restriction) render after
        * `tracksReady` flips via requestIdleCallback at the parent —
        * keeps initial mount fast on 8 GB / mid-tier CPU machines
        * where the synchronous full mount was freezing for ~1-1.5 s
        * on an 8.8 kb plasmid.
        */}
      {tracksReady ? (
        <PrimerTrack
          primers={primers}
          fullSeq={fullSeq}
          lineStart={line.start}
          lineLen={line.seq.length}
          charPx={charPx}
          labelChars={LABEL_WIDTH}
          primerStyle={settings.primerStyle}
        />
      ) : null}
      {tracksReady ? (
        <RestrictionTrack
          sites={reSites}
          lineStart={line.start}
          lineLen={line.seq.length}
          charPx={charPx}
          labelChars={LABEL_WIDTH}
          reOrientation={settings.reOrientation}
        />
      ) : null}
      <RulerTrack
        lineStart={line.start}
        lineLen={line.seq.length}
        charPx={charPx}
        labelChars={LABEL_WIDTH}
      />
      {/*
        * DNA-first layout (03.05.2026): both DNA strands render
        * IMMEDIATELY after the ruler so the biolog's eye lands on
        * nucleotide letters first. The dsDNA pair stays glued (top
        * + bottom adjacent) — biolog feedback 02.05.2026: «dsDNA
        * pair — primary visual unit, splitting it around AA chars
        * made the helix hard to read». Annotations + AA render
        * BELOW the DNA strands.
        */}
      <StrandsTrack
        lineStart={line.start}
        seq={line.seq}
        annMap={annMap}
        labelChars={LABEL_WIDTH}
        showBottomStrand={settings.showBottomStrand}
        which="top"
      />
      {settings.showBottomStrand && (
        <StrandsTrack
          lineStart={line.start}
          seq={line.seq}
          annMap={annMap}
          labelChars={LABEL_WIDTH}
          showBottomStrand
          which="bottom"
        />
      )}
      {tracksReady ? (
        <AnnotationTrack
          regions={features}
          lineStart={line.start}
          lineLen={line.seq.length}
          charPx={charPx}
          labelChars={LABEL_WIDTH}
          onAnnotationClick={onAnnotationClick}
        />
      ) : null}
      {tracksReady ? (
        <AATrack
          fullSeq={fullSeq}
          lineStart={line.start}
          lineLen={line.seq.length}
          labelChars={LABEL_WIDTH}
          strategy={framesResolution.strategy}
          framesMode={settings.framesMode}
          orfRanges={orfRanges}
          dominantCDS={framesResolution.dominant}
          regions={features}
          strandFilter="forward"
          visibleFrames={settings.visibleFrames}
        />
      ) : null}
      {tracksReady && renderHybrid ? (
        <AATrack
          fullSeq={fullSeq}
          lineStart={line.start}
          lineLen={line.seq.length}
          labelChars={LABEL_WIDTH}
          strategy={framesResolution.strategy}
          framesMode={settings.framesMode}
          orfRanges={orfRanges}
          dominantCDS={framesResolution.dominant}
          regions={features}
          strandFilter="reverse"
          visibleFrames={settings.visibleFrames}
        />
      ) : null}
    </div>
  );
});

export default SequenceView;
