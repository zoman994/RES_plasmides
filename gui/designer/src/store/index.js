/**
 * PlasmidVCS Global Store — Zustand with slices pattern.
 *
 * Architecture: 5 domain slices, each in its own file.
 * All state updates use Immer for immutable updates with mutable syntax.
 * Components subscribe via selectors: useStore(s => s.fragments)
 *
 * Slices:
 *   projectSlice  — projects, assemblies, active selection
 *   fragmentSlice — fragments on canvas, add/remove/reorder/flip/split
 *   junctionSlice — junctions between fragments, GG overhangs
 *   primerSlice   — assembly/custom primers, generate, KLD
 *   uiSlice       — modals, tabs, expert mode, warnings
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

export const useStore = create(
  devtools(
    subscribeWithSelector(
      immer(
        persist(
          (set, get, api) => ({
            // ═══ Domain slices ═══
            ...createProjectSlice(set, get, api),
            ...createFragmentSlice(set, get, api),
            ...createJunctionSlice(set, get, api),
            ...createPrimerSlice(set, get, api),
            ...createUiSlice(set, get, api),

            // ═══ Computed: active assembly shorthand ═══
            /** Returns the currently active assembly object. */
            getActive: () => {
              const { assemblies, activeId } = get();
              return assemblies.find(a => a.id === activeId) || assemblies[0] || null;
            },

            /** Update fields on the active assembly (convenience). */
            updateActive: (updates) => {
              set(state => {
                const idx = state.assemblies.findIndex(a => a.id === state.activeId);
                if (idx >= 0) Object.assign(state.assemblies[idx], updates);
              }, false, 'updateActive');
            },

            // ═══ Initialization from localStorage (migration) ═══
            initialized: false,
            initialize: () => {
              // Handled by persist middleware + onRehydrateStorage
              set({ initialized: true }, false, 'initialize');
            },
          }),
          {
            name: LS_KEY,
            version: 3,
            partialize: (state) => ({
              // Persist domain data, NOT ui transient state
              projects: state.projects,
              activeProjectId: state.activeProjectId,
              projectName: state.projectName,
              assemblies: state.assemblies,
              activeId: state.activeId,
              polymerase: state.polymerase,
              primerPrefix: state.primerPrefix,
              expertMode: state.expertMode,
              parts: state.parts, // user variants/mutants must persist
            }),
            migrate: (persisted, version) => {
              // Migration from old flat format to v3
              if (version < 3 && persisted && !persisted.projects) {
                const old = persisted;
                const pName = old.projectName || 'Проект 1';
                const asms = old.assemblies || [];
                const aId = old.activeId || asms[0]?.id || 'asm_1';
                return {
                  ...old,
                  projects: [{ id: 'proj_1', name: pName, assemblies: asms, activeId: aId }],
                  activeProjectId: 'proj_1',
                };
              }
              return persisted;
            },
            onRehydrateStorage: () => (state) => {
              if (state) state.initialized = true;
            },
          }
        )
      )
    ),
    { name: 'PlasmidVCS' }
  )
);

// ═══ Derived selectors (memoized via Zustand's shallow equality) ═══

/** Select fragments from active assembly. */
export const useFragments = () => useStore(s => {
  const asm = s.assemblies.find(a => a.id === s.activeId);
  return asm?.fragments || [];
});

/** Select junctions from active assembly. */
export const useJunctions = () => useStore(s => {
  const asm = s.assemblies.find(a => a.id === s.activeId);
  return asm?.junctions || [];
});

/** Select assembly primers. */
export const usePrimers = () => useStore(s => {
  const asm = s.assemblies.find(a => a.id === s.activeId);
  return asm?.primers || [];
});

/** Select custom primers. */
export const useCustomPrimers = () => useStore(s => {
  const asm = s.assemblies.find(a => a.id === s.activeId);
  return asm?.customPrimers || [];
});

/** Prefix sum array for absolute position calculation. O(n) build, O(1) lookup. */
export const usePrefixSums = () => useStore(s => {
  const asm = s.assemblies.find(a => a.id === s.activeId);
  const frags = asm?.fragments || [];
  const offsets = [0];
  for (let i = 0; i < frags.length; i++) {
    offsets[i + 1] = offsets[i] + (frags[i].length || 0);
  }
  return offsets;
});
