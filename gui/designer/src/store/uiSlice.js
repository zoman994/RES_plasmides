import { getJSON, setJSON } from '../lib/storage';

export const THEME_STORAGE_KEY = 'bodgegene-theme';
export const AGENT_STORAGE_KEY = 'bodgegene-agent';
export const IMPORTER_MODE_STORAGE_KEY = 'bodgegene-importer-mode';
export const SEQUENCE_VIEW_STORAGE_KEY = 'bodgegene-ui-sequenceview';

const THEMES = ['light', 'dark'];
const IMPORTER_MODES = ['advanced', 'simple'];

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
  autoThreshold: 0.8,
  // Per-frame visibility. Consulted when framesMode resolves to hybrid
  // (i.e. mode='all' OR mode='auto' with coverage <= threshold). Lets
  // a biolog hide e.g. all reverse rows while keeping +1/+2/+3.
  visibleFrames: { ...DEFAULT_VISIBLE_FRAMES },
  primerStyle: 'filled',
  reOrientation: 'vertical',
  predictions: { ...PREDICTIONS_DEFAULTS },
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

function loadInitialImporterMode() {
  const m = getJSON(IMPORTER_MODE_STORAGE_KEY, null);
  if (IMPORTER_MODES.includes(m)) return m;
  return 'advanced';
}

export function applyThemeToDOM(theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (root) root.dataset.theme = theme;
  const ssRoot = document.getElementById('ss-root');
  if (ssRoot) ssRoot.dataset.theme = theme;
}

const TOAST_CAPACITY = 3;
const TOAST_DEFAULT_DISMISS_MS = 3500;

function _newToastId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const createUiSlice = (set) => ({
  theme: loadInitialTheme(),
  agent: loadInitialAgent(),
  importerMode: loadInitialImporterMode(),
  sequenceView: loadInitialSequenceView(),
  modals: { settings: false, projectInfo: false },
  toasts: [],
  canInstallPwa: false,

  setImporterMode: (mode) => {
    if (!IMPORTER_MODES.includes(mode)) return;
    set(state => { state.importerMode = mode; });
    setJSON(IMPORTER_MODE_STORAGE_KEY, mode);
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

  showToast: (msg, kind = 'info', options = {}) => {
    const id = _newToastId();
    const entry = {
      id,
      msg,
      kind,
      createdAt: Date.now(),
      onUndo: typeof options?.onUndo === 'function' ? options.onUndo : null,
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
      });
      return;
    }

    if (key === 'framesMode' && !FRAMES_MODES.includes(value)) return;
    if (key === 'primerStyle' && !PRIMER_STYLES.includes(value)) return;
    if (key === 'reOrientation' && !RE_ORIENTATIONS.includes(value)) return;
    if (key === 'showBottomStrand' && typeof value !== 'boolean') return;
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
