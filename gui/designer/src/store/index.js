/**
 * PlasmidVCS Global Store — Zustand with slices pattern.
 *
 * Architecture: 5 domain slices, each in its own file.
 * Middleware stack: devtools → subscribeWithSelector → temporal → immer → persist
 * Undo/redo via zundo (temporal middleware) — Ctrl+Z / Ctrl+Shift+Z
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
import { temporal } from 'zundo';
import { createProjectSlice } from './projectSlice';
import { createFragmentSlice } from './fragmentSlice';
import { createJunctionSlice } from './junctionSlice';
import { createPrimerSlice } from './primerSlice';
import { createUiSlice } from './uiSlice';

const LS_KEY = 'pvcs_designer_state';

// UI fields excluded from undo history (transient state)
const UI_FIELDS = new Set([
  'modalMode', 'showMutagenesis', 'showOligos', 'showPartsLib',
  'showDataMgr', 'editTarget', 'splitTarget', 'activeTab',
  'warningsOpen', 'loading', 'globalCDSPart', 'ggSiteCheck',
  'firstLaunch', 'inventoryVersion',
]);

export const useStore = create(
  devtools(
    subscribeWithSelector(
      temporal(
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

              // ═══ Initialization ═══
              initialized: false,
              initialize: () => {
                set({ initialized: true }, false, 'initialize');
              },
            }),
            {
              name: LS_KEY,
              version: 3,
              partialize: (state) => ({
                projects: state.projects,
                activeProjectId: state.activeProjectId,
                projectName: state.projectName,
                assemblies: state.assemblies,
                activeId: state.activeId,
                polymerase: state.polymerase,
                primerPrefix: state.primerPrefix,
                expertMode: state.expertMode,
                parts: state.parts,
              }),
              migrate: (persisted, version) => {
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
        ),
        {
          // Only track domain state changes, not UI toggles
          partialize: (state) => {
            const tracked = {};
            for (const key of Object.keys(state)) {
              if (!UI_FIELDS.has(key) && typeof state[key] !== 'function') {
                tracked[key] = state[key];
              }
            }
            return tracked;
          },
          limit: 50,
          // Debounce rapid changes (typing, dragging) — 500ms
          handleSet: (handleSet) => {
            let timeout;
            return (state) => {
              clearTimeout(timeout);
              timeout = setTimeout(() => handleSet(state), 500);
            };
          },
        }
      )
    ),
    { name: 'PlasmidVCS' }
  )
);

// ═══ Undo/Redo exports ═══
export const useTemporalStore = useStore.temporal;
export const undo = () => useStore.temporal.getState().undo();
export const redo = () => useStore.temporal.getState().redo();
export const useCanUndo = () => useStore.temporal(s => s.pastStates.length > 0);
export const useCanRedo = () => useStore.temporal(s => s.futureStates.length > 0);

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
