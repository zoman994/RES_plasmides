/**
 * PlasmidVCS Global Store — Zustand with slices pattern.
 *
 * Performance optimizations:
 * - Debounced undo snapshots (shallow copy, deep clone only on undo/redo)
 * - Stable selectors with shallow equality (no new array refs)
 * - Throttled localStorage persistence (max 1 write/sec)
 * - devtools disabled in production
 */
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { devtools, persist, subscribeWithSelector } from 'zustand/middleware';
import { shallow } from 'zustand/shallow';
import { createProjectSlice } from './projectSlice';
import { createFragmentSlice } from './fragmentSlice';
import { createJunctionSlice } from './junctionSlice';
import { createPrimerSlice } from './primerSlice';
import { createUiSlice } from './uiSlice';

const LS_KEY = 'pvcs_designer_state';

// ═══ Undo: snapshot keys (domain state only) ═══
const SNAPSHOT_KEYS = [
  'projects', 'activeProjectId', 'projectName', 'assemblies', 'activeId',
  'polymerase', 'primerPrefix', 'parts', 'ggEnzyme',
];

// Shallow snapshot — fast (no JSON stringify on push)
function shallowSnapshot(state) {
  const snap = {};
  for (const k of SNAPSHOT_KEYS) snap[k] = state[k];
  return snap;
}

// Deep clone — only when actually restoring (undo/redo)
function deepCloneSnapshot(snap) {
  return JSON.parse(JSON.stringify(snap));
}

// ═══ State creator ═══
let _pushTimeout = null;

const stateCreator = (set, get) => ({
  ...createProjectSlice(set, get),
  ...createFragmentSlice(set, get),
  ...createJunctionSlice(set, get),
  ...createPrimerSlice(set, get),
  ...createUiSlice(set, get),

  getActive: () => {
    const { assemblies, activeId } = get();
    return assemblies.find(a => a.id === activeId) || assemblies[0] || null;
  },
  updateActive: (updates) => {
    set(state => {
      const idx = state.assemblies.findIndex(a => a.id === state.activeId);
      if (idx >= 0) Object.assign(state.assemblies[idx], updates);
    }, false, 'updateActive');
  },
  initialized: false,
  initialize: () => set({ initialized: true }, false, 'initialize'),

  // ═══ Undo / Redo (debounced, shallow push, deep clone on restore) ═══
  _undoStack: [],
  _redoStack: [],
  _undoPaused: false,

  pushUndo: () => {
    if (get()._undoPaused) return;
    clearTimeout(_pushTimeout);
    _pushTimeout = setTimeout(() => {
      const snap = shallowSnapshot(get());
      set(state => {
        state._undoStack.push(snap);
        if (state._undoStack.length > 50) state._undoStack.shift();
        state._redoStack = [];
      }, false, 'pushUndo');
    }, 300);
  },

  undo: () => {
    const { _undoStack } = get();
    if (_undoStack.length === 0) return;
    const current = deepCloneSnapshot(shallowSnapshot(get()));
    const prev = _undoStack[_undoStack.length - 1];
    set(state => {
      state._undoStack.pop();
      state._redoStack.push(current);
      const restored = deepCloneSnapshot(prev);
      for (const k of SNAPSHOT_KEYS) state[k] = restored[k];
    }, false, 'undo');
  },

  redo: () => {
    const { _redoStack } = get();
    if (_redoStack.length === 0) return;
    const current = deepCloneSnapshot(shallowSnapshot(get()));
    const next = _redoStack[_redoStack.length - 1];
    set(state => {
      state._redoStack.pop();
      state._undoStack.push(current);
      const restored = deepCloneSnapshot(next);
      for (const k of SNAPSHOT_KEYS) state[k] = restored[k];
    }, false, 'redo');
  },

  pauseUndo: () => set({ _undoPaused: true }, false, 'pauseUndo'),
  resumeUndo: () => set({ _undoPaused: false }, false, 'resumeUndo'),
});

// ═══ Persist config with throttled writes ═══
const throttledStorage = {
  getItem: (name) => { const s = localStorage.getItem(name); return s ? JSON.parse(s) : null; },
  setItem: (() => {
    let timeout;
    return (name, value) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => localStorage.setItem(name, JSON.stringify(value)), 1000);
    };
  })(),
  removeItem: (name) => localStorage.removeItem(name),
};

const persistConfig = {
  name: LS_KEY,
  version: 3,
  storage: throttledStorage,
  partialize: (state) => ({
    projects: state.projects, activeProjectId: state.activeProjectId,
    projectName: state.projectName, assemblies: state.assemblies,
    activeId: state.activeId, polymerase: state.polymerase,
    primerPrefix: state.primerPrefix, expertMode: state.expertMode,
    parts: state.parts,
  }),
  migrate: (persisted, version) => {
    if (version < 3 && persisted && !persisted.projects) {
      const pName = persisted.projectName || 'Проект 1';
      const asms = persisted.assemblies || [];
      return { ...persisted, projects: [{ id: 'proj_1', name: pName, assemblies: asms, activeId: asms[0]?.id || 'asm_1' }], activeProjectId: 'proj_1' };
    }
    return persisted;
  },
  onRehydrateStorage: () => (state) => { if (state) state.initialized = true; },
};

// ═══ Create store — devtools only in development ═══
const withMiddleware = import.meta.env.DEV
  ? (fn) => devtools(subscribeWithSelector(immer(persist(fn, persistConfig))), { name: 'PlasmidVCS' })
  : (fn) => subscribeWithSelector(immer(persist(fn, persistConfig)));

export const useStore = create(withMiddleware(stateCreator));

// ═══ Exports ═══
export const undo = () => useStore.getState().undo();
export const redo = () => useStore.getState().redo();
export const pushUndo = () => useStore.getState().pushUndo();
export const useCanUndo = () => useStore(s => s._undoStack.length > 0);
export const useCanRedo = () => useStore(s => s._redoStack.length > 0);

// ═══ Stable selectors (shallow equality, no new refs) ═══
const EMPTY = [];

export const useFragments = () => useStore(
  s => { const asm = s.assemblies.find(a => a.id === s.activeId); return asm?.fragments || EMPTY; },
  shallow
);
export const useJunctions = () => useStore(
  s => { const asm = s.assemblies.find(a => a.id === s.activeId); return asm?.junctions || EMPTY; },
  shallow
);
export const usePrimers = () => useStore(
  s => { const asm = s.assemblies.find(a => a.id === s.activeId); return asm?.primers || EMPTY; },
  shallow
);
export const useCustomPrimers = () => useStore(
  s => { const asm = s.assemblies.find(a => a.id === s.activeId); return asm?.customPrimers || EMPTY; },
  shallow
);
export const usePrefixSums = () => useStore(s => {
  const asm = s.assemblies.find(a => a.id === s.activeId);
  const frags = asm?.fragments || EMPTY;
  const offsets = [0];
  for (let i = 0; i < frags.length; i++) offsets[i + 1] = offsets[i] + (frags[i].length || 0);
  return offsets;
});
