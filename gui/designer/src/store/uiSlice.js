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
  partsLibPartId: null,       // pre-select this Part when opening PartsLibrary
  showDataMgr: false,
  globalCDSPart: null,      // Part being edited in global editor
  viewerPart: null,         // Part shown in PlasmidViewer modal
  wizardPlasmid: null,      // Part shown in PlasmidUseWizard modal
  versionTreePartId: null,  // Part ID for PlasmidVersionTree modal

  // ═══ Canvas / editing state ═══
  editTarget: null,         // index of fragment being edited
  splitTarget: null,        // index of fragment being split
  activeTab: 'canvas',      // 'canvas' | 'sequence' | 'primers' | 'protocol' | 'stats'
  warningsOpen: false,

  // ═══ Expert mode ═══
  expertMode: true,
  firstLaunch: false,

  // ═══ File import ═══
  importedData: null,       // Pre-fill data for AddFragmentModal from file import

  // ═══ Canvas ↔ palette navigation ═══
  highlightedPartId: null,  // Part ID highlighted in both canvas and palette

  // ═══ Fragment multi-select for merging ═══
  selectedFragIndices: [],  // number[] — indices of selected fragments on canvas

  // ═══ Assembly strategy ═══
  maxFinalParts: 0,         // 0 = auto
  inventoryVersion: 0,

  // ═══ UI actions ═══
  setModalMode: (mode) => set({ modalMode: mode }, false, 'setModalMode'),
  setShowMutagenesis: (v) => set({ showMutagenesis: v }, false, 'setShowMutagenesis'),
  setShowOligos: (v) => set({ showOligos: v }, false, 'setShowOligos'),
  setShowPartsLib: (v) => set({ showPartsLib: v }, false, 'setShowPartsLib'),
  setPartsLibPartId: (id) => set({ partsLibPartId: id }, false, 'setPartsLibPartId'),
  setShowDataMgr: (v) => set({ showDataMgr: v }, false, 'setShowDataMgr'),
  setGlobalCDSPart: (part) => set({ globalCDSPart: part }, false, 'setGlobalCDSPart'),
  setViewerPart: (part) => set({ viewerPart: part }, false, 'setViewerPart'),
  setWizardPlasmid: (part) => set({ wizardPlasmid: part }, false, 'setWizardPlasmid'),
  setVersionTreePartId: (id) => set({ versionTreePartId: id }, false, 'setVersionTreePartId'),
  setEditTarget: (idx) => set({ editTarget: idx }, false, 'setEditTarget'),
  setSplitTarget: (idx) => set({ splitTarget: idx }, false, 'setSplitTarget'),
  setActiveTab: (tab) => set({ activeTab: tab }, false, 'setActiveTab'),
  setWarningsOpen: (v) => set({ warningsOpen: v }, false, 'setWarningsOpen'),
  setImportedData: (data) => set({ importedData: data }, false, 'setImportedData'),
  setHighlightedPartId: (id) => set({ highlightedPartId: id }, false, 'setHighlightedPartId'),

  toggleFragSelection: (index) => set(state => {
    const idx = state.selectedFragIndices.indexOf(index);
    if (idx >= 0) {
      state.selectedFragIndices.splice(idx, 1);
    } else {
      state.selectedFragIndices.push(index);
      state.selectedFragIndices.sort((a, b) => a - b);
    }
  }, false, 'toggleFragSelection'),

  clearFragSelection: () => set({ selectedFragIndices: [] }, false, 'clearFragSelection'),

  selectFragRange: (from, to) => set(state => {
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    state.selectedFragIndices = [];
    for (let i = lo; i <= hi; i++) state.selectedFragIndices.push(i);
  }, false, 'selectFragRange'),
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
