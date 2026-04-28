/**
 * UI Slice — modals, tabs, expert mode, transient UI state.
 * This state is NOT persisted (except expertMode).
 */

export const createUiSlice = (set) => ({
  // ═══ Modal/panel visibility ═══
  modalMode: null,          // AddFragmentModal mode
  showMutagenesis: false,     // deprecated — use mutagenesisTarget
  mutagenesisTarget: null,    // index | null — fragment for mutagenesis wizard
  replacingFragment: null,    // { index, type } | null — fragment being replaced
  tagFusionTarget: null,      // index | null — fragment for tag/fusion picker
  showOligos: false,
  showPartsLib: false,
  partsLibPartId: null,       // pre-select this Part when opening PartsLibrary
  showDataMgr: false,
  // ImportStartScreen modal — single entry point for file import + catalog
  importStartOpen: false,
  importStartFiles: null,            // File[] | null — preset-files for new modal
  importStartCatalogMode: false,    // open with catalog expanded
  globalCDSPart: null,      // Part being edited in global editor
  viewerPart: null,         // Part shown in PlasmidViewer modal
  wizardPlasmid: null,      // Part shown in PlasmidUseWizard modal
  wizardPresetMode: null,   // 'restriction_cloning' | 'use_whole' | 'mutate' | 'disassemble' | null
  mutagenesisInitialPlasmid: null,  // Part passed to MutagenesisWizard from PlasmidViewer (V13)
  versionTreePartId: null,  // Part ID for PlasmidVersionTree modal

  // ═══ Canvas / editing state ═══
  editTarget: null,         // index of fragment being edited
  splitTarget: null,        // index of fragment being split
  activeTab: 'canvas',      // 'canvas' | 'sequence' | 'primers' | 'protocol' | 'stats'
  warningsOpen: false,

  // ═══ Expert mode ═══
  expertMode: true,
  firstLaunch: false,

  // ═══ Import preferences ═══
  // F5 — when false, parsedItem.annotations stays as-is from the parser
  // (no enrichWithCommonFeatures + autoAnnotate detail enrichment).
  // Persisted in localStorage under `pvcs-auto-annotate-on-import`.
  autoAnnotateOnImport: (() => {
    try {
      const v = localStorage.getItem('pvcs-auto-annotate-on-import');
      return v === null ? true : v === 'true';
    } catch { return true; }
  })(),

  // ═══ File import ═══
  importedData: null,       // Pre-fill data for AddFragmentModal from file import

  // ═══ Canvas ↔ palette navigation ═══
  highlightedPartId: null,  // Part ID highlighted in both canvas and palette

  // ═══ Fragment multi-select for merging ═══
  selectedFragIndices: [],  // number[] — indices of selected fragments on canvas

  // ═══ RE site visualization ═══
  showReSites: false,
  reFilter: 'unique',          // 'unique' | 'double' | 'all'
  reMinSiteLen: 6,
  reHighlightEnzyme: null,     // string — highlighted on map

  // ═══ Assembly strategy ═══
  maxFinalParts: 0,         // 0 = auto
  inventoryVersion: 0,

  // ═══ UI actions ═══
  setModalMode: (mode) => set({ modalMode: mode }, false, 'setModalMode'),
  setShowMutagenesis: (v) => set({ showMutagenesis: v }, false, 'setShowMutagenesis'),
  setMutagenesisTarget: (idx) => set({ mutagenesisTarget: idx }, false, 'setMutagenesisTarget'),
  setReplacingFragment: (data) => set({ replacingFragment: data }, false, 'setReplacingFragment'),
  setTagFusionTarget: (idx) => set({ tagFusionTarget: idx }, false, 'setTagFusionTarget'),
  setShowOligos: (v) => set({ showOligos: v }, false, 'setShowOligos'),
  setShowPartsLib: (v) => set({ showPartsLib: v }, false, 'setShowPartsLib'),
  setPartsLibPartId: (id) => set({ partsLibPartId: id }, false, 'setPartsLibPartId'),
  setShowDataMgr: (v) => set({ showDataMgr: v }, false, 'setShowDataMgr'),
  setImportStartOpen: (v) => set({ importStartOpen: v }, false, 'setImportStartOpen'),
  setImportStartFiles: (files) => set({ importStartFiles: files }, false, 'setImportStartFiles'),
  setImportStartCatalogMode: (v) => set({ importStartCatalogMode: v }, false, 'setImportStartCatalogMode'),
  // catalogMode: deprecated since Sprint Catalog Polish K4 (V45) — left col is
  // always catalog tree by default; param accepted for backward-compat tests.
  openImportStartScreen: ({ files = null, catalogMode = false } = {}) => set({
    importStartOpen: true,
    importStartFiles: files,
    importStartCatalogMode: catalogMode,
  }, false, 'openImportStartScreen'),
  closeImportStartScreen: () => set({
    importStartOpen: false,
    importStartFiles: null,
    importStartCatalogMode: false,
  }, false, 'closeImportStartScreen'),
  setGlobalCDSPart: (part) => set({ globalCDSPart: part }, false, 'setGlobalCDSPart'),
  setViewerPart: (part) => set({ viewerPart: part }, false, 'setViewerPart'),
  setWizardPlasmid: (part) => set({ wizardPlasmid: part }, false, 'setWizardPlasmid'),
  setWizardPresetMode: (mode) => set({ wizardPresetMode: mode }, false, 'setWizardPresetMode'),
  setMutagenesisInitialPlasmid: (part) => set({ mutagenesisInitialPlasmid: part }, false, 'setMutagenesisInitialPlasmid'),
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
  setShowReSites: (v) => set({ showReSites: v }, false, 'setShowReSites'),
  setReFilter: (f) => set({ reFilter: f }, false, 'setReFilter'),
  setReMinSiteLen: (n) => set({ reMinSiteLen: n }, false, 'setReMinSiteLen'),
  setReHighlightEnzyme: (e) => set({ reHighlightEnzyme: e }, false, 'setReHighlightEnzyme'),
  setMaxFinalParts: (v) => set({ maxFinalParts: v }, false, 'setMaxFinalParts'),
  incrementInventoryVersion: () => set(state => { state.inventoryVersion++; }, false, 'incrementInventoryVersion'),
  setFirstLaunch: (v) => set({ firstLaunch: v }, false, 'setFirstLaunch'),

  toggleExpertMode: () => {
    set(state => {
      state.expertMode = !state.expertMode;
      localStorage.setItem('pvcs-expert-mode', String(state.expertMode));
    }, false, 'toggleExpertMode');
  },

  setAutoAnnotateOnImport: (v) => {
    set(state => {
      state.autoAnnotateOnImport = !!v;
      try { localStorage.setItem('pvcs-auto-annotate-on-import', String(!!v)); } catch { /* ignore */ }
    }, false, 'setAutoAnnotateOnImport');
  },
});
