/**
 * PlasmidVCS Global Store — Zustand with slices pattern.
 *
 * Architecture: 5 domain slices, each in its own file.
 * Middleware stack: devtools → subscribeWithSelector → immer → persist
 * Undo/redo: manual snapshot stack (simple, no external deps).
 */
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { devtools, persist, subscribeWithSelector } from 'zustand/middleware';
import { createProjectSlice } from './projectSlice';
import { createFragmentSlice } from './fragmentSlice';
import { createJunctionSlice } from './junctionSlice';
import { createPrimerSlice } from './primerSlice';
import { createUiSlice } from './uiSlice';

const LS_KEY = 'pvcs_designer_state';

// Fields to snapshot for undo (domain state only, not UI)
const SNAPSHOT_KEYS = [
  'projects', 'activeProjectId', 'projectName', 'assemblies', 'activeId',
  'polymerase', 'primerPrefix', 'parts', 'ggEnzyme',
];

function takeSnapshot(state) {
  const snap = {};
  for (const k of SNAPSHOT_KEYS) snap[k] = JSON.parse(JSON.stringify(state[k] ?? null));
  return snap;
}

// State creator
const stateCreator = (set, get, api) => ({
  ...createProjectSlice(set, get, api),
  ...createFragmentSlice(set, get, api),
  ...createJunctionSlice(set, get, api),
  ...createPrimerSlice(set, get, api),
  ...createUiSlice(set, get, api),

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

  // ═══ Undo / Redo ═══
  _undoStack: [],
  _redoStack: [],
  _undoPaused: false,

  /** Save current state to undo stack (call before destructive actions). */
  pushUndo: () => {
    if (get()._undoPaused) return;
    const snap = takeSnapshot(get());
    set(state => {
      state._undoStack.push(snap);
      if (state._undoStack.length > 50) state._undoStack.shift();
      state._redoStack = [];
    }, false, 'pushUndo');
  },

  undo: () => {
    const { _undoStack } = get();
    if (_undoStack.length === 0) return;
    const snap = takeSnapshot(get()); // save current for redo
    const prev = _undoStack[_undoStack.length - 1];
    set(state => {
      state._undoStack.pop();
      state._redoStack.push(snap);
      for (const k of SNAPSHOT_KEYS) state[k] = prev[k];
    }, false, 'undo');
  },

  redo: () => {
    const { _redoStack } = get();
    if (_redoStack.length === 0) return;
    const snap = takeSnapshot(get());
    const next = _redoStack[_redoStack.length - 1];
    set(state => {
      state._redoStack.pop();
      state._undoStack.push(snap);
      for (const k of SNAPSHOT_KEYS) state[k] = next[k];
    }, false, 'redo');
  },

  pauseUndo: () => set({ _undoPaused: true }, false, 'pauseUndo'),
  resumeUndo: () => set({ _undoPaused: false }, false, 'resumeUndo'),
});

// Persist config
const persistConfig = {
  name: LS_KEY,
  version: 3,
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

export const useStore = create(
  devtools(
    subscribeWithSelector(
      immer(
        persist(stateCreator, persistConfig)
      )
    ),
    { name: 'PlasmidVCS' }
  )
);

// ═══ Undo/Redo exports ═══
export const undo = () => useStore.getState().undo();
export const redo = () => useStore.getState().redo();
export const pushUndo = () => useStore.getState().pushUndo();
export const useCanUndo = () => useStore(s => s._undoStack.length > 0);
export const useCanRedo = () => useStore(s => s._redoStack.length > 0);

// ═══ Derived selectors ═══

export const useFragments = () => useStore(s => {
  const asm = s.assemblies.find(a => a.id === s.activeId);
  return asm?.fragments || [];
});

export const useJunctions = () => useStore(s => {
  const asm = s.assemblies.find(a => a.id === s.activeId);
  return asm?.junctions || [];
});

export const usePrimers = () => useStore(s => {
  const asm = s.assemblies.find(a => a.id === s.activeId);
  return asm?.primers || [];
});

export const useCustomPrimers = () => useStore(s => {
  const asm = s.assemblies.find(a => a.id === s.activeId);
  return asm?.customPrimers || [];
});

export const usePrefixSums = () => useStore(s => {
  const asm = s.assemblies.find(a => a.id === s.activeId);
  const frags = asm?.fragments || [];
  const offsets = [0];
  for (let i = 0; i < frags.length; i++) {
    offsets[i + 1] = offsets[i] + (frags[i].length || 0);
  }
  return offsets;
});
