/**
 * Annotator slice (Sprint M-X.2-FIX_ARCH_CLEANUP K5).
 *
 * Extracted from uiSlice.js to keep that file under the 25 KB hard
 * budget per CLAUDE.md §7. The slice is still merged into the
 * monolithic Zustand store via createAnnotatorSlice — Immer
 * mutations operate on the full state object so cross-slice
 * synchronisation (e.g. mirroring threshold into sequenceView) keeps
 * working without an event bus.
 */

import { getJSON, setJSON } from '../lib/storage';
import {
  documentSignature,
  makeRunKey,
  isStaleReply,
  nextJob,
} from '../lib/annotator-run-identity';

// SequenceView persistence is owned by uiSlice; we mirror the
// threshold via raw setJSON to avoid a circular import. Same key
// SEQUENCE_VIEW_STORAGE_KEY uiSlice uses.
const SEQUENCE_VIEW_STORAGE_KEY = 'bodgegene-ui-sequenceview';

function persistSequenceViewMirror(value) {
  setJSON(SEQUENCE_VIEW_STORAGE_KEY, {
    showBottomStrand: !!value.showBottomStrand,
    framesMode: value.framesMode,
    autoThreshold: value.autoThreshold,
    primerStyle: value.primerStyle,
    reOrientation: value.reOrientation,
    visibleFrames: { ...value.visibleFrames },
    predictions: { ...value.predictions },
  });
}

export const ANNOTATOR_STORAGE_KEY = 'bodgegene-ui-annotator';

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
  // Sprint M-X.3 Stage C — repurposed activeTab. Was the dual-body
  // shell ('table' | 'preview'); now the map-view sub-tab inside
  // PreviewTab ('linear' | 'circular').
  activeTab: 'linear',
  // Sprint M-X.3 follow-up — duplicate-suppression toggle. When
  // false (default) predicted regions overlapping same-type
  // confirmed annotations are hidden from PreviewTab + LevelPanel.
  showDuplicates: false,
  // Drill-in panel state — id of the ghost feature whose detail
  // panel is open in the Preview tab (null = no panel).
  selectedGhostId: null,
  // ANN-INTEGRITY seam 7 — job identity. `jobSeq` is a monotonic counter; a job
  // captures its run key at launch and a reply tagged with a superseded key is
  // dropped (document/scope/topology changed, or a newer job started).
  jobSeq: 0,
  activeRunKey: null,
  activeRunKeys: Object.freeze({}),
  runContexts: Object.freeze({}),
  resultRunKeys: Object.freeze({}),
  currentDocumentSignature: null,
  executedRunKey: null,
  executedScope: null,
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

export function loadInitialAnnotator() {
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
      activeRunKeys: {},
      runContexts: {},
      resultRunKeys: {},
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
    showDuplicates:
      typeof raw.showDuplicates === 'boolean'
        ? raw.showDuplicates
        : ANNOTATOR_DEFAULTS.showDuplicates,
    results: {},
    acceptedRegionIds: {},
    rejectedRegionIds: {},
    pendingEdits: {},
    running: {},
    activeRunKeys: {},
    runContexts: {},
    resultRunKeys: {},
  };
}

function copyScope(scope) {
  if (!scope || typeof scope !== 'object') return null;
  return {
    ...scope,
    ...(scope.region && typeof scope.region === 'object'
      ? { region: { ...scope.region } }
      : {}),
  };
}

function clearTransientForDocument(annotator, documentKey) {
  annotator.results = {};
  annotator.resultRunKeys = {};
  annotator.acceptedRegionIds = {};
  annotator.rejectedRegionIds = {};
  annotator.pendingEdits = {};
  annotator.running = {};
  annotator.activeRunKeys = {};
  annotator.activeRunKey = null;
  annotator.runContexts = {};
  annotator.executedRunKey = null;
  annotator.executedScope = null;
  annotator.currentDocumentSignature = documentKey;
}

function regionIdentity(region) {
  if (!region || typeof region !== 'object') return null;
  return region.id
    || `${region.start}:${region.end}:${region.type || ''}:${region.name || ''}`;
}

function clearPluginTransient(annotator, pluginId) {
  const previous = annotator.results?.[pluginId];
  for (const region of previous?.regions || []) {
    const id = regionIdentity(region);
    if (!id) continue;
    if (annotator.acceptedRegionIds) delete annotator.acceptedRegionIds[id];
    if (annotator.rejectedRegionIds) delete annotator.rejectedRegionIds[id];
    if (annotator.pendingEdits) delete annotator.pendingEdits[id];
  }
  if (annotator.results) delete annotator.results[pluginId];
  if (annotator.resultRunKeys) delete annotator.resultRunKeys[pluginId];
  if (annotator.running) delete annotator.running[pluginId];
}

function persistAnnotator(value) {
  setJSON(ANNOTATOR_STORAGE_KEY, {
    enabledPluginIds: { ...value.enabledPluginIds },
    threshold: value.threshold,
    showDuplicates: !!value.showDuplicates,
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

export function createAnnotatorSlice(set) {
  return {
    annotator: loadInitialAnnotator(),

    openAnnotator: (scope) => {
      set((state) => {
        if (!state.annotator) state.annotator = loadInitialAnnotator();
        // `scope.sequenceId` is a UI routing alias (callers historically mix a
        // file name and an entry id), not document identity. Canonical
        // entryId/docEpoch/topology/scope invalidation is owned exclusively by
        // syncAnnotatorContext/beginAnnotatorJob below.
        state.annotator.open = true;
        state.annotator.scope = scope || null;
      });
    },

    closeAnnotator: () => {
      set((state) => {
        if (!state.annotator) return;
        state.annotator.open = false;
        // scope, results, accepted, rejected, pendingEdits — preserved
        // so a re-open within the session restores the work.
      });
    },

    setAnnotatorActiveTab: (tab) => {
      if (!ANNOTATOR_TABS.includes(tab)) return;
      set((state) => {
        if (!state.annotator) state.annotator = loadInitialAnnotator();
        state.annotator.activeTab = tab;
      });
    },

    togglePlugin: (pluginId) => {
      if (typeof pluginId !== 'string' || !pluginId) return;
      set((state) => {
        if (!state.annotator) state.annotator = loadInitialAnnotator();
        if (!state.annotator.enabledPluginIds) state.annotator.enabledPluginIds = {};
        const cur = !!state.annotator.enabledPluginIds[pluginId];
        state.annotator.enabledPluginIds[pluginId] = !cur;
        persistAnnotator({
          enabledPluginIds: { ...state.annotator.enabledPluginIds },
          threshold: state.annotator.threshold,
          showDuplicates: !!state.annotator.showDuplicates,
        });
      });
    },

    setAnnotatorThreshold: (value) => {
      const v = Number(value);
      if (!Number.isFinite(v) || v < 0 || v > 1) return;
      set((state) => {
        if (!state.annotator) state.annotator = loadInitialAnnotator();
        state.annotator.threshold = v;
        persistAnnotator({
          enabledPluginIds: { ...state.annotator.enabledPluginIds },
          threshold: v,
          showDuplicates: !!state.annotator.showDuplicates,
        });
        // Mirror into the SequenceView Settings popover threshold so
        // both surfaces stay in lockstep. Settings popover lives in
        // [0.5, 1.0] only — clamp.
        if (state.sequenceView && state.sequenceView.predictions) {
          const popoverV = Math.max(0.5, Math.min(1.0, v));
          state.sequenceView.predictions.threshold = popoverV;
          persistSequenceViewMirror(state.sequenceView);
        }
      });
    },

    setAnnotatorShowDuplicates: (value) => {
      const v = !!value;
      set((state) => {
        if (!state.annotator) state.annotator = loadInitialAnnotator();
        state.annotator.showDuplicates = v;
        persistAnnotator({
          enabledPluginIds: { ...state.annotator.enabledPluginIds },
          threshold: state.annotator.threshold,
          showDuplicates: v,
        });
      });
    },

    setAnnotatorRunning: (pluginId, running, runKey) => {
      if (typeof pluginId !== 'string' || !pluginId) return;
      set((state) => {
        if (!state.annotator) state.annotator = loadInitialAnnotator();
        if (!state.annotator.running) state.annotator.running = {};
        if (!state.annotator.activeRunKeys) state.annotator.activeRunKeys = {};
        if (isStaleReply(state.annotator.activeRunKeys[pluginId], runKey)) return;
        if (running) state.annotator.running[pluginId] = runKey;
        else if (state.annotator.running[pluginId] === runKey) delete state.annotator.running[pluginId];
      });
    },

    syncAnnotatorContext: (docContext) => {
      const documentKey = documentSignature(docContext || {});
      set((state) => {
        if (!state.annotator) state.annotator = loadInitialAnnotator();
        if (state.annotator.currentDocumentSignature === documentKey) return;
        clearTransientForDocument(state.annotator, documentKey);
      });
    },

    /**
     * ANN-INTEGRITY seam 7 — begin a predictor job against a document context
     * `{ entryId, docEpoch, topology, scope }`. Bumps the monotonic job counter,
     * computes the run key that binds entry + epoch + topology + frozen scope +
     * job, records it as the active key, and returns it so the caller can tag
     * the async callback for the stale-drop check in `setAnnotatorResult`.
     */
    beginAnnotatorJob: (docContext, pluginIds = []) => {
      let key = null;
      set((state) => {
        if (!state.annotator) state.annotator = loadInitialAnnotator();
        const context = docContext || {};
        const documentKey = documentSignature(context);
        if (state.annotator.currentDocumentSignature !== documentKey) {
          clearTransientForDocument(state.annotator, documentKey);
        }
        state.annotator.jobSeq = nextJob(state.annotator.jobSeq);
        const frozenContext = {
          entryId: context.entryId ?? null,
          docEpoch: context.docEpoch ?? null,
          topology: context.topology || 'linear',
          scope: copyScope(context.scope),
          jobSeq: state.annotator.jobSeq,
        };
        key = makeRunKey(frozenContext);
        state.annotator.activeRunKey = key;
        if (!state.annotator.activeRunKeys) state.annotator.activeRunKeys = {};
        if (!state.annotator.runContexts) state.annotator.runContexts = {};
        if (!state.annotator.running) state.annotator.running = {};
        state.annotator.runContexts[key] = frozenContext;
        for (const pluginId of pluginIds) {
          if (typeof pluginId !== 'string' || !pluginId) continue;
          clearPluginTransient(state.annotator, pluginId);
          state.annotator.activeRunKeys[pluginId] = key;
          state.annotator.running[pluginId] = key;
        }
      });
      return key;
    },

    setAnnotatorResult: (pluginId, result, runKey) => {
      if (typeof pluginId !== 'string' || !pluginId) return;
      set((state) => {
        if (!state.annotator) state.annotator = loadInitialAnnotator();
        if (!state.annotator.activeRunKeys) state.annotator.activeRunKeys = {};
        if (isStaleReply(state.annotator.activeRunKeys[pluginId], runKey)) return;
        if (!state.annotator.results) state.annotator.results = {};
        if (!state.annotator.resultRunKeys) state.annotator.resultRunKeys = {};
        if (state.annotator.running?.[pluginId] === runKey) delete state.annotator.running[pluginId];
        if (result === null) {
          delete state.annotator.results[pluginId];
          delete state.annotator.resultRunKeys[pluginId];
        } else {
          state.annotator.results[pluginId] = result;
          state.annotator.resultRunKeys[pluginId] = runKey;
          const context = state.annotator.runContexts?.[runKey];
          state.annotator.executedRunKey = runKey;
          state.annotator.executedScope = copyScope(context?.scope);
        }
      });
    },

    acceptRegion: (regionId) => {
      if (typeof regionId !== 'string' || !regionId) return;
      set((state) => {
        if (!state.annotator) state.annotator = loadInitialAnnotator();
        if (!state.annotator.acceptedRegionIds) state.annotator.acceptedRegionIds = {};
        if (!state.annotator.rejectedRegionIds) state.annotator.rejectedRegionIds = {};
        delete state.annotator.rejectedRegionIds[regionId];
        state.annotator.acceptedRegionIds[regionId] = true;
        if (state.annotator.selectedGhostId === regionId) {
          state.annotator.selectedGhostId = null;
        }
      });
    },

    /**
     * Bulk-accept many region ids in a single store update.
     *
     * - Pending → accepted.
     * - Already accepted → no-op.
     * - Already rejected → SKIPPED (preserves the user's manual
     *   reject; the bulk button is a shortcut for «accept the
     *   unverdicted ones», not a force-override).
     * - Closes the drill-in panel if the selected ghost is among the
     *   newly-accepted ids.
     */
    acceptManyRegions: (regionIds) => {
      if (!Array.isArray(regionIds) || regionIds.length === 0) return;
      set((state) => {
        if (!state.annotator) state.annotator = loadInitialAnnotator();
        if (!state.annotator.acceptedRegionIds) state.annotator.acceptedRegionIds = {};
        if (!state.annotator.rejectedRegionIds) state.annotator.rejectedRegionIds = {};
        const accepted = state.annotator.acceptedRegionIds;
        const rejected = state.annotator.rejectedRegionIds;
        for (const id of regionIds) {
          if (typeof id !== 'string' || !id) continue;
          if (rejected[id]) continue;
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
      set((state) => {
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

    setSelectedGhost: (regionId) => {
      set((state) => {
        if (!state.annotator) state.annotator = loadInitialAnnotator();
        state.annotator.selectedGhostId =
          typeof regionId === 'string' && regionId ? regionId : null;
      });
    },

    clearRegionVerdict: (regionId) => {
      if (typeof regionId !== 'string' || !regionId) return;
      set((state) => {
        if (!state.annotator) return;
        if (state.annotator.acceptedRegionIds) delete state.annotator.acceptedRegionIds[regionId];
        if (state.annotator.rejectedRegionIds) delete state.annotator.rejectedRegionIds[regionId];
      });
    },

    editPendingRegion: (regionId, patch) => {
      if (typeof regionId !== 'string' || !regionId || !patch || typeof patch !== 'object') return;
      set((state) => {
        if (!state.annotator) state.annotator = loadInitialAnnotator();
        if (!state.annotator.pendingEdits) state.annotator.pendingEdits = {};
        const cur = state.annotator.pendingEdits[regionId] || {};
        state.annotator.pendingEdits[regionId] = { ...cur, ...patch };
      });
    },

    resetAnnotatorScope: () => {
      set((state) => {
        if (!state.annotator) state.annotator = loadInitialAnnotator();
        state.annotator.results = {};
        state.annotator.acceptedRegionIds = {};
        state.annotator.rejectedRegionIds = {};
        state.annotator.pendingEdits = {};
        state.annotator.running = {};
        state.annotator.activeRunKeys = {};
        state.annotator.activeRunKey = null;
        state.annotator.runContexts = {};
        state.annotator.resultRunKeys = {};
        state.annotator.executedRunKey = null;
        state.annotator.executedScope = null;
      });
    },
  };
}
