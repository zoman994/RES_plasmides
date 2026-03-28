/**
 * UI Slice — modals, tabs, expert mode, transient UI state.
 * This state is NOT persisted (except expertMode).
 */

export const createUiSlice = (set) => ({
  // ═══ Modal/panel visibility ═══
  modalMode: null,          // AddFragmentModal mode
  showMutagenesis: false,
  showOligos: false,
  showPartsLib: false,
  showDataMgr: false,
  globalCDSPart: null,      // Part being edited in global editor

  // ═══ Canvas / editing state ═══
  editTarget: null,         // index of fragment being edited
  splitTarget: null,        // index of fragment being split
  activeTab: 'canvas',      // 'canvas' | 'sequence' | 'primers' | 'protocol' | 'stats'
  warningsOpen: false,

  // ═══ Expert mode ═══
  expertMode: localStorage.getItem('pvcs-expert-mode') === 'true',
  firstLaunch: !localStorage.getItem('pvcs-expert-mode') && !localStorage.getItem('pvcs_designer_state'),

  // ═══ Assembly strategy ═══
  maxFinalParts: 0,         // 0 = auto
  inventoryVersion: 0,

  // ═══ UI actions ═══
  setModalMode: (mode) => set({ modalMode: mode }, false, 'setModalMode'),
  setShowMutagenesis: (v) => set({ showMutagenesis: v }, false, 'setShowMutagenesis'),
  setShowOligos: (v) => set({ showOligos: v }, false, 'setShowOligos'),
  setShowPartsLib: (v) => set({ showPartsLib: v }, false, 'setShowPartsLib'),
  setShowDataMgr: (v) => set({ showDataMgr: v }, false, 'setShowDataMgr'),
  setGlobalCDSPart: (part) => set({ globalCDSPart: part }, false, 'setGlobalCDSPart'),
  setEditTarget: (idx) => set({ editTarget: idx }, false, 'setEditTarget'),
  setSplitTarget: (idx) => set({ splitTarget: idx }, false, 'setSplitTarget'),
  setActiveTab: (tab) => set({ activeTab: tab }, false, 'setActiveTab'),
  setWarningsOpen: (v) => set({ warningsOpen: v }, false, 'setWarningsOpen'),
  setMaxFinalParts: (v) => set({ maxFinalParts: v }, false, 'setMaxFinalParts'),
  incrementInventoryVersion: () => set(state => { state.inventoryVersion++; }, false, 'incrementInventoryVersion'),
  setFirstLaunch: (v) => set({ firstLaunch: v }, false, 'setFirstLaunch'),

  toggleExpertMode: () => {
    set(state => {
      state.expertMode = !state.expertMode;
      localStorage.setItem('pvcs-expert-mode', String(state.expertMode));
    }, false, 'toggleExpertMode');
  },
});
