import { getJSON, setJSON } from '../lib/storage';

export const THEME_STORAGE_KEY = 'bodgegene-theme';
export const AGENT_STORAGE_KEY = 'bodgegene-agent';
export const SEQUENCE_VIEW_STORAGE_KEY = 'bodgegene-ui-sequenceview';
// Annotator state lives in store/annotatorSlice — keys / defaults /
// selector re-exported here for back-compat with existing imports.
import {
  ANNOTATOR_STORAGE_KEY,
  ANNOTATOR_DEFAULTS,
  selectAnnotator,
  createAnnotatorSlice,
} from './annotatorSlice.js';
export { ANNOTATOR_STORAGE_KEY, ANNOTATOR_DEFAULTS, selectAnnotator };

const THEMES = ['light', 'dark'];

// UX-006 — Display & Defaults are user preferences that used to be
// scattered (theme in Topbar only; sequence wrap hardcoded; polymerase
// implicit; primer prefix invisible; annotate-now flag was a per-modal
// checkbox without a project-wide default). All consolidated here.
export const DISPLAY_SETTINGS_STORAGE_KEY = 'bodgegene-display-settings';
const SEQUENCE_WRAPS = [60, 80, 100, 150];
// SPEC_EDITABLE_ASSEMBLY_S1 §5.9 — synthesisLengthThreshold: typed
// inline ДНК ≤ this is a primer-tail snippet, > this is a synthesis
// piece. Biology: standard oligos ~60–100 nt, ultramers ~200 → default
// 80, sane range 40–200. Mirrors assembly-edit-router
// SYNTHESIS_THRESHOLD_DEFAULT (literal kept here to avoid the global
// store importing a CanvasSkeleton lib).
const SYNTHESIS_THRESHOLD_MIN = 40;
const SYNTHESIS_THRESHOLD_MAX = 200;
export const DISPLAY_SETTINGS_DEFAULTS = Object.freeze({
  sequenceWrap: 150,
  annotateOnImport: true,
  synthesisLengthThreshold: 80,
});

function sanitizeDisplaySettings(raw) {
  const out = { ...DISPLAY_SETTINGS_DEFAULTS };
  if (!raw || typeof raw !== 'object') return out;
  if (SEQUENCE_WRAPS.includes(raw.sequenceWrap)) out.sequenceWrap = raw.sequenceWrap;
  if (typeof raw.annotateOnImport === 'boolean') out.annotateOnImport = raw.annotateOnImport;
  const t = Number(raw.synthesisLengthThreshold);
  if (Number.isFinite(t)) {
    out.synthesisLengthThreshold = Math.round(
      Math.max(SYNTHESIS_THRESHOLD_MIN, Math.min(SYNTHESIS_THRESHOLD_MAX, t)),
    );
  }
  return out;
}

function loadInitialDisplaySettings() {
  return sanitizeDisplaySettings(getJSON(DISPLAY_SETTINGS_STORAGE_KEY));
}

// Sprint M-B.3 K7 — user-facing display settings for the new SequenceView.
// Persisted under SEQUENCE_VIEW_STORAGE_KEY so a biolog's choices survive
// reload. Defaults match SnapGene-equivalent rendering (DEC-SQV-06 ⚓
// candidate for promotion if M-D Container Window settings popover repeats
// the pattern).
const FRAMES_MODES = ['auto', 'single', 'all'];
const PRIMER_STYLES = ['filled', 'outline'];
const RE_ORIENTATIONS = ['vertical', 'horizontal'];

// visibleFrames keys — six (frame, strand) pairs in display order.
export const FRAME_KEYS = ['+1', '+2', '+3', '-1', '-2', '-3'];

const DEFAULT_VISIBLE_FRAMES = Object.freeze({
  '+1': true, '+2': true, '+3': true,
  '-1': true, '-2': true, '-3': true,
});

// Sprint M-X.1 K5 — Structural Predictor defaults (DEC-PRED-03 Variant
// B). High-precision detectors (ORF + sgRNA scaffold) ON; PWM-based
// detectors (σ70 promoter, stem-loop terminator) OFF until the biolog
// explicitly opts in (those have low specificity on noisy plasmids).
// `threshold = 0.7` is a generic confidence cutoff applied uniformly
// across detectors (see runPredictors in predicted-detection.js).
export const PREDICTIONS_DEFAULTS = Object.freeze({
  cds: true,
  sgRNA: true,
  promoter: false,
  terminator: false,
  threshold: 0.7,
});

const PREDICTION_TOGGLE_KEYS = ['cds', 'sgRNA', 'promoter', 'terminator'];

export const SEQUENCE_VIEW_DEFAULTS = Object.freeze({
  showBottomStrand: true,
  // Default 'single' — biolog feedback 02.05.2026: don't dump 6-frame
  // soup by default; user opts into 'auto' / 'all' explicitly through
  // the popover. 'single' renders only the dominant CDS forward frame
  // (or nothing when no annotated CDS / dominant ORF is found).
  framesMode: 'single',
  // RC-B1 (Игорь 24.06) — manual reading-frame override. null = авто (CDS-driven);
  // 0|1|2 = pin AA translation to forward frame +1/+2/+3 across the whole sequence.
  overrideFrame: null,
  autoThreshold: 0.8,
  // Per-frame visibility. Consulted when framesMode resolves to hybrid
  // (i.e. mode='all' OR mode='auto' with coverage <= threshold). Lets
  // a biolog hide e.g. all reverse rows while keeping +1/+2/+3.
  visibleFrames: { ...DEFAULT_VISIBLE_FRAMES },
  primerStyle: 'filled',
  reOrientation: 'vertical',
  predictions: { ...PREDICTIONS_DEFAULTS },
  // Bug-rush #19 (04.05.2026 evening): biolog «при нажатии на фичу
  // идёт телепорт к её началу, это мы сделаем опцией и возможность
  // включить/отключить в настройках». Default true — preserves the
  // existing behavior so the change is opt-out.
  scrollOnFeatureClick: true,
});

function sanitizeVisibleFrames(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_VISIBLE_FRAMES };
  const out = { ...DEFAULT_VISIBLE_FRAMES };
  for (const k of FRAME_KEYS) {
    if (typeof raw[k] === 'boolean') out[k] = raw[k];
  }
  return out;
}

/**
 * Defensive parser for the predictions block — validates each toggle
 * + threshold range. Missing field → fall back to default. Bad payload
 * (string instead of bool, NaN threshold, …) → default. Used both at
 * initial load and at setSequenceViewSetting time.
 */
function sanitizePredictions(raw) {
  if (!raw || typeof raw !== 'object') return { ...PREDICTIONS_DEFAULTS };
  const out = { ...PREDICTIONS_DEFAULTS };
  for (const k of PREDICTION_TOGGLE_KEYS) {
    if (typeof raw[k] === 'boolean') out[k] = raw[k];
  }
  if (
    typeof raw.threshold === 'number'
    && Number.isFinite(raw.threshold)
    && raw.threshold >= 0.5
    && raw.threshold <= 1.0
  ) {
    out.threshold = raw.threshold;
  }
  return out;
}

function loadInitialSequenceView() {
  const raw = getJSON(SEQUENCE_VIEW_STORAGE_KEY, null);
  if (!raw || typeof raw !== 'object') {
    return {
      ...SEQUENCE_VIEW_DEFAULTS,
      visibleFrames: { ...DEFAULT_VISIBLE_FRAMES },
      predictions: { ...PREDICTIONS_DEFAULTS },
    };
  }
  return {
    showBottomStrand:
      typeof raw.showBottomStrand === 'boolean'
        ? raw.showBottomStrand
        : SEQUENCE_VIEW_DEFAULTS.showBottomStrand,
    framesMode: FRAMES_MODES.includes(raw.framesMode)
      ? raw.framesMode
      : SEQUENCE_VIEW_DEFAULTS.framesMode,
    overrideFrame: [0, 1, 2].includes(raw.overrideFrame) ? raw.overrideFrame : null,
    autoThreshold:
      typeof raw.autoThreshold === 'number' && raw.autoThreshold >= 0.5 && raw.autoThreshold <= 0.95
        ? raw.autoThreshold
        : SEQUENCE_VIEW_DEFAULTS.autoThreshold,
    visibleFrames: sanitizeVisibleFrames(raw.visibleFrames),
    primerStyle: PRIMER_STYLES.includes(raw.primerStyle)
      ? raw.primerStyle
      : SEQUENCE_VIEW_DEFAULTS.primerStyle,
    reOrientation: RE_ORIENTATIONS.includes(raw.reOrientation)
      ? raw.reOrientation
      : SEQUENCE_VIEW_DEFAULTS.reOrientation,
    // Sprint M-X.1 K5 — defensive fallback for the new predictions
    // block. Old stored payloads (pre-K5) lack this field; we fill it
    // with PREDICTIONS_DEFAULTS so the consumer never sees undefined.
    predictions: sanitizePredictions(raw.predictions),
    scrollOnFeatureClick:
      typeof raw.scrollOnFeatureClick === 'boolean'
        ? raw.scrollOnFeatureClick
        : SEQUENCE_VIEW_DEFAULTS.scrollOnFeatureClick,
  };
}

function persistSequenceView(value) {
  setJSON(SEQUENCE_VIEW_STORAGE_KEY, value);
}

/** Selector returning the sequenceView slice (or defaults). */
export function selectSequenceViewSettings(state) {
  if (!state || !state.sequenceView) return { ...SEQUENCE_VIEW_DEFAULTS };
  return state.sequenceView;
}

function loadInitialTheme() {
  const t = getJSON(THEME_STORAGE_KEY, null);
  if (THEMES.includes(t)) return t;
  return 'light';
}

function loadInitialAgent() {
  const a = getJSON(AGENT_STORAGE_KEY, null);
  if (a && typeof a === 'object') return { name: a.name || '', email: a.email || '' };
  return { name: '', email: '' };
}

export function applyThemeToDOM(theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (root) root.dataset.theme = theme;
  const ssRoot = document.getElementById('ss-root');
  if (ssRoot) ssRoot.dataset.theme = theme;
}

// ───────── Annotator (Sprint M-X.2 K6, DEC-ANN-07) ─────────
//
// Fullscreen annotation orchestrator state. Persists ONLY the
// `enabledPluginIds` map + `threshold` between sessions; results /
// accepted / rejected / pendingEdits live for the duration of the
// open + close cycle. When the biolog opens the Annotator on a new
// plasmid, transient state is reset (DEC-ANN-07 §risk #4).
//
// Plain-object record shape — Zustand+Immer doesn't play well with
// Set / Map, so the dedup containers are `Record<id, true>`.

// Annotator state + actions live in store/annotatorSlice.js — see
// the createAnnotatorSlice spread inside createUiSlice below.

const TOAST_CAPACITY = 3;
const TOAST_DEFAULT_DISMISS_MS = 3500;

function _newToastId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const createUiSlice = (set, get) => ({
  ...createAnnotatorSlice(set),
  theme: loadInitialTheme(),
  agent: loadInitialAgent(),
  sequenceView: loadInitialSequenceView(),
  // UX-006 — user-tunable Display & Defaults (theme stays separate so
  // the Topbar quick-toggle can keep flipping it without going through
  // the modal). Persisted under DISPLAY_SETTINGS_STORAGE_KEY.
  displaySettings: loadInitialDisplaySettings(),
  modals: { settings: false, projectInfo: false, sequenceSearch: false },
  // M-X.9 K2 follow-up — current Ctrl+F search hits, scoped to one
  // entry. SequenceSearchPopover writes here on each query update;
  // SequenceTab reads + paints overlay rects when entryId matches.
  searchHits: { entryId: null, query: '', hits: [] },
  // P3 — cross-mount «jump to a sequence hit» request. The inspector's caret is
  // LOCAL state that resets when the entry switches, so a jump fired from the
  // SmartSearchBar dropdown (which selects a DIFFERENT entry first) can't be set
  // synchronously — it's parked here and consumed once the target entry mounts.
  // `revision` guards against a stale jump if the sequence changed meanwhile.
  navRequest: null,
  toasts: [],
  canInstallPwa: false,
  // In-app prompt dialog — drop-in replacement for `window.prompt`, which is a
  // no-op in the packaged Electron app (BUGS V191/V192). `requestPrompt(opts)`
  // opens <PromptModal> and resolves with the entered string (or null on
  // cancel). Mirrors the toast pattern (callback stored in state).
  prompt: null,

  setDisplaySetting: (patch) => {
    if (!patch || typeof patch !== 'object') return;
    set((state) => {
      const merged = sanitizeDisplaySettings({
        ...state.displaySettings,
        ...patch,
      });
      state.displaySettings = merged;
      setJSON(DISPLAY_SETTINGS_STORAGE_KEY, merged);
    });
  },

  setTheme: (theme) => {
    if (!THEMES.includes(theme)) return;
    set(state => { state.theme = theme; });
    setJSON(THEME_STORAGE_KEY, theme);
    applyThemeToDOM(theme);
  },

  setAgent: (agent) => {
    const safe = { name: agent?.name || '', email: agent?.email || '' };
    set(state => { state.agent = safe; });
    setJSON(AGENT_STORAGE_KEY, safe);
  },

  openSettings: () => set(state => { state.modals.settings = true; }),
  closeSettings: () => set(state => { state.modals.settings = false; }),

  openProjectInfo: () => set(state => { state.modals.projectInfo = true; }),
  closeProjectInfo: () => set(state => { state.modals.projectInfo = false; }),

  // M-X.9 K2 — SequenceSearchPopover (Ctrl+F).
  openSequenceSearch: () => set(state => { state.modals.sequenceSearch = true; }),
  closeSequenceSearch: () => set(state => { state.modals.sequenceSearch = false; }),

  // M-X.9 K2 follow-up (TD-SEARCH-OVERLAY-RECTS) — publish current
  // hits so SequenceTab/SequenceView can render overlay rects.
  setSearchHits: (entryId, query, hits) => set((state) => {
    state.searchHits = {
      entryId: entryId || null,
      query: typeof query === 'string' ? query : '',
      hits: Array.isArray(hits) ? hits : [],
    };
  }),
  clearSearchHits: () => set((state) => {
    state.searchHits = { entryId: null, query: '', hits: [] };
  }),

  // P3 — request a jump to a sequence occurrence on `entryId`. `target` carries
  // `segments[]` (0-based half-open), `strand`, optional `revision` (stale guard),
  // and `caret` ({start,end}) for the range highlight. Consumed + cleared by the
  // inspector after the entry mounts (or dropped if the revision no longer matches).
  requestSequenceNav: (entryId, target) => set((state) => {
    if (!entryId || !target) { state.navRequest = null; return; }
    const strand = target.strand === -1 || target.strand === '-' ? -1 : 1;
    state.navRequest = {
      entryId,
      segments: Array.isArray(target.segments) ? target.segments : [],
      caret: target.caret || null,
      strand,
      revision: target.revision ?? null,
      kind: target.kind || 'sequence',
      status: 'pending',
    };
  }),
  // Ack — completes / fails / cancels a nav request (all just clear the channel).
  clearSequenceNav: () => set((state) => { state.navRequest = null; }),

  showToast: (msg, kind = 'info', options = {}) => {
    const id = _newToastId();
    const entry = {
      id,
      msg,
      kind,
      createdAt: Date.now(),
      onUndo: typeof options?.onUndo === 'function' ? options.onUndo : null,
      actionLabel: typeof options?.actionLabel === 'string' ? options.actionLabel : null,
      onAutoDismiss: typeof options?.onAutoDismiss === 'function' ? options.onAutoDismiss : null,
      autoDismissMs: typeof options?.autoDismissMs === 'number' ? options.autoDismissMs : TOAST_DEFAULT_DISMISS_MS,
    };
    set(state => {
      while (state.toasts.length >= TOAST_CAPACITY) state.toasts.shift();
      state.toasts.push(entry);
    });
    return id;
  },
  clearToast: (id) => set(state => {
    if (id === undefined || id === null) {
      state.toasts = [];
    } else {
      state.toasts = state.toasts.filter(t => t.id !== id);
    }
  }),

  setCanInstallPwa: (v) => set(state => { state.canInstallPwa = !!v; }),

  // Open the in-app prompt dialog; returns a Promise that resolves with the
  // entered string, or null if the user cancels (Escape / overlay / Отмена).
  requestPrompt: (opts = {}) => new Promise((resolve) => {
    set((state) => {
      state.prompt = {
        title: typeof opts.title === 'string' ? opts.title : '',
        message: typeof opts.message === 'string' ? opts.message : '',
        defaultValue: opts.defaultValue == null ? '' : String(opts.defaultValue),
        placeholder: typeof opts.placeholder === 'string' ? opts.placeholder : '',
        confirmLabel: typeof opts.confirmLabel === 'string' ? opts.confirmLabel : 'OK',
        cancelLabel: typeof opts.cancelLabel === 'string' ? opts.cancelLabel : 'Отмена',
        multiline: !!opts.multiline,
        _resolve: resolve,
      };
    });
  }),
  // Resolve the pending prompt (value = entered string, or null to cancel).
  resolvePrompt: (value = null) => {
    const pending = get().prompt;
    set((state) => { state.prompt = null; });
    if (pending && typeof pending._resolve === 'function') {
      pending._resolve(value == null ? null : value);
    }
  },

  // ───────── SequenceView settings (Sprint M-B.3 K7) ─────────
  setSequenceViewSetting: (key, value) => {
    // Sprint M-X.1 K5 — nested `predictions.X` keys for the new
    // structural-predictor settings. The dotted key syntax keeps the
    // setter call sites simple (one helper, one entry point) without
    // requiring callers to spread the predictions object themselves.
    if (typeof key === 'string' && key.startsWith('predictions.')) {
      const sub = key.slice('predictions.'.length);
      if (PREDICTION_TOGGLE_KEYS.includes(sub)) {
        if (typeof value !== 'boolean') return;
      } else if (sub === 'threshold') {
        const v = Number(value);
        if (!Number.isFinite(v) || v < 0.5 || v > 1.0) return;
        value = v;
      } else {
        return; // unknown sub-key
      }
      set(state => {
        if (!state.sequenceView) {
          state.sequenceView = {
            ...SEQUENCE_VIEW_DEFAULTS,
            visibleFrames: { ...DEFAULT_VISIBLE_FRAMES },
            predictions: { ...PREDICTIONS_DEFAULTS },
          };
        }
        if (!state.sequenceView.predictions) {
          state.sequenceView.predictions = { ...PREDICTIONS_DEFAULTS };
        }
        state.sequenceView.predictions[sub] = value;
        persistSequenceView({
          ...state.sequenceView,
          visibleFrames: { ...state.sequenceView.visibleFrames },
          predictions: { ...state.sequenceView.predictions },
        });
        // Sync into Annotator slice so the two threshold sliders
        // stay in lockstep (post-K10 review fix). Persistence
        // mirrors annotatorSlice's persistAnnotator format —
        // factored inline here to avoid a circular import.
        if (sub === 'threshold' && state.annotator) {
          state.annotator.threshold = value;
          setJSON(ANNOTATOR_STORAGE_KEY, {
            enabledPluginIds: { ...state.annotator.enabledPluginIds },
            threshold: value,
            showDuplicates: !!state.annotator.showDuplicates,
          });
        }
      });
      return;
    }

    if (key === 'framesMode' && !FRAMES_MODES.includes(value)) return;
    if (key === 'primerStyle' && !PRIMER_STYLES.includes(value)) return;
    if (key === 'reOrientation' && !RE_ORIENTATIONS.includes(value)) return;
    if (key === 'showBottomStrand' && typeof value !== 'boolean') return;
    if (key === 'scrollOnFeatureClick' && typeof value !== 'boolean') return;
    if (key === 'overrideFrame' && !(value === null || value === 0 || value === 1 || value === 2)) return;
    if (key === 'autoThreshold') {
      const v = Number(value);
      if (!Number.isFinite(v) || v < 0.5 || v > 0.95) return;
      value = v;
    }
    if (key === 'visibleFrames') {
      value = sanitizeVisibleFrames(value);
    }
    if (key === 'predictions') {
      value = sanitizePredictions(value);
    }
    set(state => {
      if (!state.sequenceView) {
        state.sequenceView = {
          ...SEQUENCE_VIEW_DEFAULTS,
          visibleFrames: { ...DEFAULT_VISIBLE_FRAMES },
          predictions: { ...PREDICTIONS_DEFAULTS },
        };
      }
      state.sequenceView[key] = value;
      persistSequenceView({
        ...state.sequenceView,
        visibleFrames: { ...state.sequenceView.visibleFrames },
        predictions: { ...state.sequenceView.predictions },
      });
    });
  },
  setVisibleFrame: (frameKey, visible) => {
    if (!FRAME_KEYS.includes(frameKey)) return;
    set(state => {
      if (!state.sequenceView) state.sequenceView = { ...SEQUENCE_VIEW_DEFAULTS, visibleFrames: { ...DEFAULT_VISIBLE_FRAMES } };
      if (!state.sequenceView.visibleFrames) {
        state.sequenceView.visibleFrames = { ...DEFAULT_VISIBLE_FRAMES };
      }
      state.sequenceView.visibleFrames[frameKey] = !!visible;
      persistSequenceView({
        ...state.sequenceView,
        visibleFrames: { ...state.sequenceView.visibleFrames },
      });
    });
  },
  resetSequenceViewSettings: () => {
    set(state => {
      state.sequenceView = {
        ...SEQUENCE_VIEW_DEFAULTS,
        visibleFrames: { ...DEFAULT_VISIBLE_FRAMES },
        predictions: { ...PREDICTIONS_DEFAULTS },
      };
      persistSequenceView({
        ...state.sequenceView,
        visibleFrames: { ...state.sequenceView.visibleFrames },
        predictions: { ...state.sequenceView.predictions },
      });
    });
  },

});
