import { getJSON, setJSON } from '../lib/storage';

export const THEME_STORAGE_KEY = 'bodgegene-theme';
export const AGENT_STORAGE_KEY = 'bodgegene-agent';
export const IMPORTER_MODE_STORAGE_KEY = 'bodgegene-importer-mode';
export const SEQUENCE_VIEW_STORAGE_KEY = 'bodgegene-ui-sequenceview';
export const ANNOTATOR_STORAGE_KEY = 'bodgegene-ui-annotator';

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

export const ANNOTATOR_DEFAULTS = Object.freeze({
  open: false,
  scope: null,
  // Default plugin selection — DEC-PRED-03 priors. ORF + sgRNA
  // scaffold + common-features homology start ON; the noisier PWM
  // detectors stay OFF until the biolog opts in.
  enabledPluginIds: Object.freeze({
    'orf-scan': true,
    'common-features-homology': true,
    'sgrna-scaffold': true,
    'sigma70-promoter': false,
    'stem-loop-terminator': false,
    'blast-ncbi': false,
  }),
  results: Object.freeze({}),
  acceptedRegionIds: Object.freeze({}),
  rejectedRegionIds: Object.freeze({}),
  pendingEdits: Object.freeze({}),
  threshold: 0.7,
  running: Object.freeze({}),
  // Sprint M-X.3 follow-up (05.05.2026, Stage C) — repurposed.
  // Was: 'table' | 'preview' (dual-body shell, gone in Stage B).
  // Now: 'linear' | 'circular' — picks the map view inside
  // PreviewTab. Biolog: «по вкладке можно еще переключиться в окно
  // просмотра кольцевой ерсии плазмиды/фрагмента».
  activeTab: 'linear',
  // Sprint M-X.3 K4 — id of the ghost feature whose drill-in panel
  // is open in the Preview tab. `null` means no panel.
  selectedGhostId: null,
});

const ANNOTATOR_TABS = ['linear', 'circular'];

function sanitizeEnabledPluginIds(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ...ANNOTATOR_DEFAULTS.enabledPluginIds };
  }
  const out = { ...ANNOTATOR_DEFAULTS.enabledPluginIds };
  for (const k of Object.keys(raw)) {
    if (typeof raw[k] === 'boolean') out[k] = raw[k];
  }
  return out;
}

function loadInitialAnnotator() {
  const raw = getJSON(ANNOTATOR_STORAGE_KEY, null);
  if (!raw || typeof raw !== 'object') {
    return {
      ...ANNOTATOR_DEFAULTS,
      enabledPluginIds: { ...ANNOTATOR_DEFAULTS.enabledPluginIds },
      results: {},
      acceptedRegionIds: {},
      rejectedRegionIds: {},
      pendingEdits: {},
      running: {},
    };
  }
  return {
    ...ANNOTATOR_DEFAULTS,
    enabledPluginIds: sanitizeEnabledPluginIds(raw.enabledPluginIds),
    threshold:
      typeof raw.threshold === 'number'
      && Number.isFinite(raw.threshold)
      && raw.threshold >= 0
      && raw.threshold <= 1
        ? raw.threshold
        : ANNOTATOR_DEFAULTS.threshold,
    results: {},
    acceptedRegionIds: {},
    rejectedRegionIds: {},
    pendingEdits: {},
    running: {},
  };
}

function persistAnnotator(value) {
  setJSON(ANNOTATOR_STORAGE_KEY, {
    enabledPluginIds: { ...value.enabledPluginIds },
    threshold: value.threshold,
  });
}

/** Selector returning the annotator slice (or defaults). */
export function selectAnnotator(state) {
  if (!state || !state.annotator) {
    return {
      ...ANNOTATOR_DEFAULTS,
      enabledPluginIds: { ...ANNOTATOR_DEFAULTS.enabledPluginIds },
      results: {},
      acceptedRegionIds: {},
      rejectedRegionIds: {},
      pendingEdits: {},
      running: {},
    };
  }
  return state.annotator;
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
  annotator: loadInitialAnnotator(),
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
        // Sync into Annotator slice so the two threshold sliders
        // stay in lockstep (post-K10 review fix).
        if (sub === 'threshold' && state.annotator) {
          state.annotator.threshold = value;
          persistAnnotator({
            enabledPluginIds: { ...state.annotator.enabledPluginIds },
            threshold: value,
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

  // ───────── Annotator (Sprint M-X.2 K6, DEC-ANN-07) ─────────

  openAnnotator: (scope) => {
    set(state => {
      if (!state.annotator) {
        state.annotator = loadInitialAnnotator();
      }
      const prevScope = state.annotator.scope;
      const sequenceChanged = !!prevScope
        && !!scope
        && prevScope.sequenceId !== scope.sequenceId;
      // When the plasmid changes between Annotator sessions, reset
      // the transient verdict containers so a fresh «accept N» pass
      // doesn't carry over from the previous plasmid (DEC-ANN-07
      // risk #4).
      if (sequenceChanged) {
        state.annotator.results = {};
        state.annotator.acceptedRegionIds = {};
        state.annotator.rejectedRegionIds = {};
        state.annotator.pendingEdits = {};
        state.annotator.running = {};
      }
      state.annotator.open = true;
      state.annotator.scope = scope || null;
    });
  },

  closeAnnotator: () => {
    set(state => {
      if (!state.annotator) return;
      state.annotator.open = false;
      // scope, results, accepted, rejected, pendingEdits — preserved
      // so a re-open within the session restores the work.
    });
  },

  /** Sprint M-X.3 K3 — switch between Annotator's «Table» / «Preview»
   *  tabs. Garbage / unknown tab ids are silently ignored. */
  setAnnotatorActiveTab: (tab) => {
    if (!ANNOTATOR_TABS.includes(tab)) return;
    set(state => {
      if (!state.annotator) state.annotator = loadInitialAnnotator();
      state.annotator.activeTab = tab;
    });
  },

  togglePlugin: (pluginId) => {
    if (typeof pluginId !== 'string' || !pluginId) return;
    set(state => {
      if (!state.annotator) state.annotator = loadInitialAnnotator();
      if (!state.annotator.enabledPluginIds) state.annotator.enabledPluginIds = {};
      const cur = !!state.annotator.enabledPluginIds[pluginId];
      state.annotator.enabledPluginIds[pluginId] = !cur;
      persistAnnotator({
        enabledPluginIds: { ...state.annotator.enabledPluginIds },
        threshold: state.annotator.threshold,
      });
    });
  },

  setAnnotatorThreshold: (value) => {
    const v = Number(value);
    if (!Number.isFinite(v) || v < 0 || v > 1) return;
    set(state => {
      if (!state.annotator) state.annotator = loadInitialAnnotator();
      state.annotator.threshold = v;
      persistAnnotator({
        enabledPluginIds: { ...state.annotator.enabledPluginIds },
        threshold: v,
      });
      // Sync into the SequenceView Settings popover threshold so
      // both surfaces stay in lockstep — biolog 04.05.2026 evening
      // post-K10 review: «два независимых threshold'а UX-confusing»
      // (DEC-ANN-07 risk #6). When uiSlice has both slices loaded
      // (the normal case) we mirror; if sequenceView is missing
      // (test isolation) we just skip.
      if (state.sequenceView && state.sequenceView.predictions) {
        // Settings popover lives in [0.5, 1.0] only — clamp to that
        // range so the popover slider doesn't jump to a value it
        // can't display.
        const popoverV = Math.max(0.5, Math.min(1.0, v));
        state.sequenceView.predictions.threshold = popoverV;
        persistSequenceView({
          ...state.sequenceView,
          visibleFrames: { ...state.sequenceView.visibleFrames },
          predictions: { ...state.sequenceView.predictions },
        });
      }
    });
  },

  setAnnotatorRunning: (pluginId, running) => {
    if (typeof pluginId !== 'string' || !pluginId) return;
    set(state => {
      if (!state.annotator) state.annotator = loadInitialAnnotator();
      if (!state.annotator.running) state.annotator.running = {};
      if (running) state.annotator.running[pluginId] = true;
      else delete state.annotator.running[pluginId];
    });
  },

  setAnnotatorResult: (pluginId, result) => {
    if (typeof pluginId !== 'string' || !pluginId) return;
    set(state => {
      if (!state.annotator) state.annotator = loadInitialAnnotator();
      if (!state.annotator.results) state.annotator.results = {};
      if (state.annotator.running) delete state.annotator.running[pluginId];
      if (result === null) {
        delete state.annotator.results[pluginId];
      } else {
        state.annotator.results[pluginId] = result;
      }
    });
  },

  acceptRegion: (regionId) => {
    if (typeof regionId !== 'string' || !regionId) return;
    set(state => {
      if (!state.annotator) state.annotator = loadInitialAnnotator();
      if (!state.annotator.acceptedRegionIds) state.annotator.acceptedRegionIds = {};
      if (!state.annotator.rejectedRegionIds) state.annotator.rejectedRegionIds = {};
      // Mutually exclusive: accept clears reject.
      delete state.annotator.rejectedRegionIds[regionId];
      state.annotator.acceptedRegionIds[regionId] = true;
      // Sprint M-X.3 K4 — verdict on the currently-drilled-in ghost
      // closes the drill-in panel automatically. Other regions stay
      // unaffected.
      if (state.annotator.selectedGhostId === regionId) {
        state.annotator.selectedGhostId = null;
      }
    });
  },

  /**
   * Sprint M-X.3 follow-up (05.05.2026) — biolog: «добавь возможность
   * одним кликом согласиться со всеми комон фичами которые нашел на
   * L1». Accept many region ids in a single store update.
   *
   * Semantics:
   *   - Pending → accepted.
   *   - Already accepted → no-op.
   *   - Already rejected → SKIPPED (preserves the user's manual
   *     reject; the bulk button is a shortcut for «accept the
   *     unverdicted ones», not a force-override).
   *   - Closes the drill-in panel if the selected ghost is among the
   *     newly-accepted ids.
   *
   * One set() call so subscribers get a single render, not N.
   */
  acceptManyRegions: (regionIds) => {
    if (!Array.isArray(regionIds) || regionIds.length === 0) return;
    set(state => {
      if (!state.annotator) state.annotator = loadInitialAnnotator();
      if (!state.annotator.acceptedRegionIds) state.annotator.acceptedRegionIds = {};
      if (!state.annotator.rejectedRegionIds) state.annotator.rejectedRegionIds = {};
      const accepted = state.annotator.acceptedRegionIds;
      const rejected = state.annotator.rejectedRegionIds;
      for (const id of regionIds) {
        if (typeof id !== 'string' || !id) continue;
        if (rejected[id]) continue; // preserve manual reject
        accepted[id] = true;
      }
      if (state.annotator.selectedGhostId
          && accepted[state.annotator.selectedGhostId]) {
        state.annotator.selectedGhostId = null;
      }
    });
  },

  rejectRegion: (regionId) => {
    if (typeof regionId !== 'string' || !regionId) return;
    set(state => {
      if (!state.annotator) state.annotator = loadInitialAnnotator();
      if (!state.annotator.acceptedRegionIds) state.annotator.acceptedRegionIds = {};
      if (!state.annotator.rejectedRegionIds) state.annotator.rejectedRegionIds = {};
      delete state.annotator.acceptedRegionIds[regionId];
      state.annotator.rejectedRegionIds[regionId] = true;
      if (state.annotator.selectedGhostId === regionId) {
        state.annotator.selectedGhostId = null;
      }
    });
  },

  /** Sprint M-X.3 K4 — drive the drill-in panel for a predicted
   *  region. `null` closes it. */
  setSelectedGhost: (regionId) => {
    set(state => {
      if (!state.annotator) state.annotator = loadInitialAnnotator();
      state.annotator.selectedGhostId =
        typeof regionId === 'string' && regionId ? regionId : null;
    });
  },

  clearRegionVerdict: (regionId) => {
    if (typeof regionId !== 'string' || !regionId) return;
    set(state => {
      if (!state.annotator) return;
      if (state.annotator.acceptedRegionIds) delete state.annotator.acceptedRegionIds[regionId];
      if (state.annotator.rejectedRegionIds) delete state.annotator.rejectedRegionIds[regionId];
    });
  },

  editPendingRegion: (regionId, patch) => {
    if (typeof regionId !== 'string' || !regionId || !patch || typeof patch !== 'object') return;
    set(state => {
      if (!state.annotator) state.annotator = loadInitialAnnotator();
      if (!state.annotator.pendingEdits) state.annotator.pendingEdits = {};
      const cur = state.annotator.pendingEdits[regionId] || {};
      state.annotator.pendingEdits[regionId] = { ...cur, ...patch };
    });
  },

  resetAnnotatorScope: () => {
    set(state => {
      if (!state.annotator) state.annotator = loadInitialAnnotator();
      state.annotator.results = {};
      state.annotator.acceptedRegionIds = {};
      state.annotator.rejectedRegionIds = {};
      state.annotator.pendingEdits = {};
      state.annotator.running = {};
    });
  },
});
