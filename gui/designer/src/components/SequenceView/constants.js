/**
 * SequenceView shared constants — extracted to a tiny standalone
 * module in the K1 decomposition so sub-components (CaretOverlay,
 * SelectionOverlay, SequenceLine, popups, hooks) can import without
 * pulling on the heavier `index.jsx` orchestrator (and creating
 * circular imports).
 */

// Width (in monospace character cells) reserved at the line's
// left edge for the position number / strand label gutter.
export const LABEL_WIDTH = 8;

// V134 — single source of truth for the annotation types that carry an
// amino-acid translation. Includes `reporter`: the common-features
// detector matches reporters (GFP, mCherry, …) on the protein pathway,
// so the AA display set must too — otherwise reporters detected as
// protein get no AA track. AATrack, aa-opacity and frames-mode all
// import this one set instead of keeping three drifting local copies.
export const TRANSLATABLE_TYPES = new Set(["CDS", "gene", "marker", "reporter"]);

// Stable empty-array reference used when consumer omits `primers`.
// JS default-parameter syntax `primers = []` evaluates the array
// LITERAL on every call, producing a new reference. Each new
// reference makes `<SequenceLine memo>` bail (shallow-equal compare
// fails) and re-render every line — perceptible lag on long
// plasmids when an unrelated parent state shifts.
export const EMPTY_PRIMERS = Object.freeze([]);

// Stable empty-object reference used as the predictions-settings
// default before the K5 store migration. Same memo-bail rationale
// as EMPTY_PRIMERS — without a hoisted constant, the
// `settings.predictions || {}` fallback would emit a fresh `{}` on
// every render and force `runPredictors` useMemo to recompute
// uselessly.
export const EMPTY_PREDICTIONS = Object.freeze({});

// Test-env detector — used both for `tracksReady` initial value (so
// vitest assertions on heavy tracks find them synchronously) and
// for the per-line `content-visibility` opt-out (happy-dom doesn't
// fully implement content-visibility skip-rendering).
export const __IS_TEST_ENV__ =
  typeof import.meta !== "undefined"
  && typeof import.meta.env !== "undefined"
  && import.meta.env.MODE === "test";
