/**
 * App.jsx — Root layout component.
 *
 * All state lives in Zustand store (src/store/).
 * Complex handlers extracted to custom hooks (src/hooks/).
 * This file is pure layout + wiring (~430 lines).
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

// ═══ Store ═══
import { useStore, useFragments, useJunctions, usePrimers, useCustomPrimers, undo, redo, pushUndo, useCanUndo, useCanRedo } from './store/index';

// ═══ Hooks (extracted handlers) ═══
import { useGeneratePrimers } from './hooks/useGeneratePrimers';
import { useFragmentHandlers } from './hooks/useFragmentHandlers';
import { resetJunctionForType } from './lib/junction-utils';

// ═══ Components ═══
import PartsPalette from './components/PartsPalette';
import DesignCanvas from './components/DesignCanvas';
import PrimerPanel from './components/PrimerPanel';
import SequenceViewer from './components/SequenceViewer';
import AddFragmentModal from './components/AddFragmentModal';
import RestrictionPanel from './components/RestrictionPanel';
import ProtocolTracker from './components/ProtocolTracker';
import MutagenesisWizard from './components/MutagenesisWizard';
import ReplacePicker from './components/ReplacePicker';
import TagFusionPicker from './components/TagFusionPicker';
import VerificationPanel from './components/VerificationPanel';
import FragmentSplitter from './components/FragmentSplitter';
import AssemblyTabs from './components/AssemblyTabs';
import ProjectBar from './components/ExperimentSelector';
import ExperimentStats from './components/ExperimentStats';
import OligoManager from './components/OligoManager';
import FragmentEditor from './components/FragmentEditor';
import PartsLibrary from './components/PartsLibrary';
import DataManager from './components/DataManager';
import PlasmidViewer from './components/PlasmidViewer';
import PlasmidUseWizard from './components/PlasmidUseWizard';
import ImportDecisionModal from './components/ImportDecisionModal';
import ActionBar from './components/ActionBar';
import CatalogPanel from './components/CatalogPanel';
import PlasmidVersionTree from './components/PlasmidVersionTree';
import ProjectFlowCanvas from './components/flow/ProjectFlowCanvas';
import { designPrimersLocal } from './local-primer-design';
import SubFragmentBar from './components/SubFragmentBar';

// ═══ Utilities ═══
import { fetchParts } from './api';
import { validateConstruct, checkPrimerQuality, pcrProductSize } from './validate';
import { t } from './i18n';
import { GG_ENZYMES } from './golden-gate';
import { estimateEfficiency } from './assembly-utils';
import { handleFileImport } from './file-import';

export default function App() {

  // ═══ Undo/Redo ═══
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'Z' || e.key === 'y')) { e.preventDefault(); redo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === '5') {
        e.preventDefault();
        const v = useStore.getState().projectView;
        useStore.getState().setProjectView(v === 'construct' ? 'flow' : 'construct');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ═══ Store selectors ═══
  const fragments     = useFragments();
  const junctions     = useJunctions();
  const primers       = usePrimers();
  const customPrimers = useCustomPrimers();
  const assemblies    = useStore(s => s.assemblies);
  const activeId      = useStore(s => s.activeId);
  // ═══ Store: state needed for render ═══
  const parts        = useStore(s => s.parts);
  const projectName  = useStore(s => s.projectName);
  const polymerase   = useStore(s => s.polymerase);
  const primerPrefix = useStore(s => s.primerPrefix);
  const ggEnzyme     = useStore(s => s.ggEnzyme);
  const ggSiteCheck = useStore(s => s.ggSiteCheck);
  const loading    = useStore(s => s.loading);
  const modalMode  = useStore(s => s.modalMode);
  const splitTarget = useStore(s => s.splitTarget);
  const showMutagenesis = useStore(s => s.showMutagenesis);
  const mutagenesisTarget = useStore(s => s.mutagenesisTarget);
  const replacingFragment = useStore(s => s.replacingFragment);
  const tagFusionTarget = useStore(s => s.tagFusionTarget);
  const showOligos = useStore(s => s.showOligos);
  const showCatalog = useStore(s => s.showCatalog);
  const showPartsLib = useStore(s => s.showPartsLib);
  const partsLibPartId = useStore(s => s.partsLibPartId);
  const viewerPart = useStore(s => s.viewerPart);
  const wizardPlasmid = useStore(s => s.wizardPlasmid);
  const wizardPresetMode = useStore(s => s.wizardPresetMode);
  const mutagenesisInitialPlasmid = useStore(s => s.mutagenesisInitialPlasmid);
  const importDecisionData = useStore(s => s.importDecisionData);
  const versionTreePartId = useStore(s => s.versionTreePartId);
  const globalCDSPart = useStore(s => s.globalCDSPart);
  const editTarget = useStore(s => s.editTarget);
  const showDataMgr = useStore(s => s.showDataMgr);
  const activeTab  = useStore(s => s.activeTab);
  const warningsOpen = useStore(s => s.warningsOpen);
  const expertMode = useStore(s => s.expertMode);
  const firstLaunch = useStore(s => s.firstLaunch);
  const maxFinalParts = useStore(s => s.maxFinalParts);
  const projectView = useStore(s => s.projectView);
  const setProjectView = useStore(s => s.setProjectView);

  // ═══ Store: actions needed for render ═══
  const { removeFragment, flipFragment, reorderFragments, toggleAmplification,
    updateActive, getActive, addAssembly, removeAssembly, renameAssembly, switchAssembly,
    updateJunction, toggleCircular, setAssemblyType, autoDesignGGOverhangs, setGgEnzyme,
    addCustomPrimer, deleteCustomPrimer, setPolymerase, setPrimerPrefix, setParts,
    addPart, updatePart, toggleExpertMode, setModalMode, setShowMutagenesis,
    setShowOligos, setShowPartsLib, setShowDataMgr, setGlobalCDSPart,
    setEditTarget, setSplitTarget, setActiveTab, setWarningsOpen, setMaxFinalParts,
    setFirstLaunch, incrementInventoryVersion, addFragment,
  } = useStore.getState();

  // ═══ Custom hooks (extracted handlers) ═══
  const generate = useGeneratePrimers();
  const {
    handleFragmentSplit, handleSaveFragment, handleSaveAsVariant,
    handleSwapVariant, handleMutagenesis, handleReusePrimer, toggleFragmentTopology,
    completeAssembly, clearAssembly, addCustomFragment,
    handleCreateMutagenesisAssembly,
  } = useFragmentHandlers();

  // ═══ File drag-and-drop from OS ═══
  const [fileDragOver, setFileDragOver] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const dragCounterRef = useRef(0);

  const handleDragEnter = (e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragCounterRef.current++;
    setFileDragOver(true);
  };
  const handleDragOver = (e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const handleDragLeave = (e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setFileDragOver(false);
    }
  };
  const handleFileDrop = async (e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setFileDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    try {
      const data = await handleFileImport(file);
      useStore.getState().setImportDecision(data);
    } catch (err) {
      alert(`Ошибка импорта: ${err.message}`);
    }
  };

  // ═══ Active assembly shorthand ═══
  const active       = getActive() || { id: 'asm_1', name: 'Сборка 1', fragments: [], junctions: [] };
  const assemblyType = active.assemblyType || 'overlap';
  const protocol     = active.protocol || 'overlap_pcr';
  const circular     = active.circular || false;
  const calculated   = active.calculated || false;
  const apiWarnings  = active.apiWarnings || [];
  const orderSheet   = active.orderSheet || '';
  const primerMatches = active.primerMatches || {};
  const protocolSteps = active.protocolSteps || [];

  // ═══════════ Derived / computed ═══════════
  const allPrimers = useMemo(() => [
    ...primers.map(p => ({ ...p, category: 'assembly' })),
    ...customPrimers.map(p => ({ ...p, category: 'custom' })),
  ], [primers, customPrimers]);

  const constructWarnings = useMemo(() => validateConstruct(fragments), [fragments]);
  const primerQuality = useMemo(() =>
    primers.map(p => ({ name: p.name, warnings: checkPrimerQuality(p) }))
      .filter(pq => pq.warnings.length > 0),
    [primers]);
  const pcrSizes = useMemo(() =>
    fragments.map((f, i) => {
      const leftJ  = i > 0 ? junctions[i - 1] : (circular ? junctions[junctions.length - 1] : null);
      const rightJ = i < junctions.length ? junctions[i] : (circular ? junctions[0] : null);
      return pcrProductSize(f, leftJ, rightJ);
    }),
    [fragments, junctions, circular]);
  const totalBp = fragments.reduce((s, f) => s + (f.sequence || '').length, 0);

  // ═══ Assembly strategy ═══
  const effectiveFinalParts = maxFinalParts === 0
    ? (fragments.length <= 3 ? fragments.length : 3)
    : Math.min(maxFinalParts, fragments.length);
  const efficiency = fragments.length >= 2
    ? estimateEfficiency(effectiveFinalParts, assemblyType === 'golden_gate' ? 'golden_gate' : 'overlap')
    : null;

  // ═══ Load parts on mount (merge API parts with persisted user variants) ═══
  useEffect(() => {
    const mergeParts = (apiParts) => {
      const currentParts = useStore.getState().parts;
      if (!apiParts.length) return; // don't wipe on empty
      const existingIds = new Set(currentParts.map(p => p.id));
      const existingNames = new Set(currentParts.map(p => p.name));
      const newOnly = apiParts.filter(p => !existingIds.has(p.id) && !existingNames.has(p.name));
      if (newOnly.length > 0) {
        useStore.getState().setParts([...currentParts, ...newOnly]);
      }
    };
    fetchParts().then(mergeParts).catch(() => {}); // on error — keep existing parts
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ═══ Auto-design primers (client-side, no API) ═══
  const autoDesigned = useMemo(() => {
    if (fragments.length < 2) return null;
    if (fragments.some(f => f.needsAmplification !== false && !f.sequence)) return null;
    return designPrimersLocal(fragments, junctions, circular, { tmTarget: 60, primerPrefix, polymerase });
  }, [fragments, junctions, circular, primerPrefix, polymerase]);

  useEffect(() => {
    if (autoDesigned && autoDesigned.primers.length > 0) {
      // V4-A guard: if the active assembly already carries mutagenesis primers,
      // do NOT overwrite them with standard overlap-auto-designed ones — keep
      // the KLD/fragment-strategy primers and only refresh warnings/calculated.
      const active = getActive();
      const hasMutPrimers = active?.primers?.some(p => p.isMutagenesis);
      if (hasMutPrimers) {
        updateActive({
          apiWarnings: autoDesigned.warnings,
          calculated: true,
        });
      } else {
        updateActive({
          primers: autoDesigned.primers,
          apiWarnings: autoDesigned.warnings,
          calculated: true,
        });
      }
    } else if (autoDesigned !== undefined) {
      // P1v2 fix: clear stale primers when auto-design returns null/empty (e.g. 1 fragment)
      const active = getActive();
      if (active?.primers?.length > 0 && !active.primers.some(p => p.isMutagenesis)) {
        updateActive({
          primers: [],
          apiWarnings: autoDesigned?.warnings || (fragments.length === 1
            ? ['ℹ️ Один фрагмент — праймеры не нужны. Добавьте второй фрагмент для сборки.']
            : []),
          calculated: false,
        });
      }
    }
  }, [autoDesigned]); // eslint-disable-line react-hooks/exhaustive-deps

  // ═══ Render ═══
  return (
    <DndProvider backend={HTML5Backend}>
      <div className="h-screen flex flex-col" style={{ backgroundColor: '#f8f9fa' }}
        onDragEnter={handleDragEnter} onDragOver={handleDragOver}
        onDragLeave={handleDragLeave} onDrop={handleFileDrop}>

        {/* File drag overlay */}
        {fileDragOver && (
          <div className="fixed inset-0 z-50 bg-blue-500/20 backdrop-blur-sm flex items-center justify-center pointer-events-none">
            <div className="bg-white rounded-2xl shadow-2xl border-2 border-dashed border-blue-400 p-10 flex flex-col items-center gap-3">
              <span className="text-4xl">{'📂'}</span>
              <span className="text-lg font-semibold text-blue-700">Перетащите файл сюда</span>
              <span className="text-sm text-gray-500">.gb · .gbk · .fasta · .dna</span>
            </div>
          </div>
        )}

        {/* Header */}
        <header className="px-6 py-2.5 flex items-center justify-between shrink-0"
          style={{
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(12px) saturate(180%)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          }}>
          <div className="flex items-center gap-3">
            <span className="text-lg">&#x1F9EC;</span>
            <h1 className="text-base font-bold text-white">{t('Construct Designer')}</h1>
            {/* Undo / Redo */}
            <div className="flex items-center gap-0.5 ml-2">
              <button onClick={undo} disabled={!canUndo}
                className={`p-1 rounded transition ${canUndo ? 'hover:bg-white/20 text-gray-300' : 'text-gray-600 cursor-not-allowed'}`}
                title="Отменить (Ctrl+Z)">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 8h8a3 3 0 010 6H8M3 8l3-3M3 8l3 3"/>
                </svg>
              </button>
              <button onClick={redo} disabled={!canRedo}
                className={`p-1 rounded transition ${canRedo ? 'hover:bg-white/20 text-gray-300' : 'text-gray-600 cursor-not-allowed'}`}
                title="Повторить (Ctrl+Shift+Z)">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 8H5a3 3 0 000 6h3M13 8l-3-3M13 8l-3 3"/>
                </svg>
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-px h-4 bg-white/15 mx-1" />
            <button onClick={() => setShowOligos(true)}
              className="text-xs px-2 py-1 rounded bg-white/10 text-gray-300 hover:bg-white/20 transition">
              {'📋'} Олиги
            </button>
            <button onClick={() => setShowPartsLib(true)}
              className="text-xs px-2 py-1 rounded bg-white/10 text-gray-300 hover:bg-white/20 transition">
              {'📦'} Запчасти
            </button>
            <button onClick={() => useStore.getState().setShowCatalog(true)}
              className="text-xs px-2 py-1 rounded bg-white/10 text-gray-300 hover:bg-white/20 transition">
              {'📚'} Каталог
            </button>
            <button onClick={() => setShowDataMgr(true)}
              className="text-xs px-2 py-1 rounded bg-white/10 text-gray-300 hover:bg-white/20 transition"
              title="Экспорт / Импорт данных">
              {'💾'} Данные
            </button>
            <div className="relative">
              <button onClick={() => setShowSettings(s => !s)}
                className="text-xs px-2 py-1 rounded bg-white/10 text-gray-300 hover:bg-white/20 transition flex items-center gap-1">
                ⚙️ Настройки
              </button>
              {showSettings && (
                <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg border p-3 z-50 min-w-[220px] space-y-2">
                  <label className="flex items-center gap-2 text-xs text-gray-700">
                    <span className="w-20">Полимераза:</span>
                    <select value={polymerase} onChange={e => setPolymerase(e.target.value)}
                      className="flex-1 text-xs border rounded px-2 py-1">
                      <option value="phusion">Phusion/Q5</option>
                      <option value="taq">Taq</option>
                      <option value="kod">KOD</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-700">
                    <span className="w-20">Prefix:</span>
                    <input value={primerPrefix} onChange={e => setPrimerPrefix(e.target.value)}
                      className="flex-1 text-xs border rounded px-2 py-1" maxLength={4} />
                  </label>
                </div>
              )}
            </div>
            {fragments.length > 0 && (
              <button onClick={clearAssembly} className="text-xs px-2 py-1 text-red-400 hover:bg-red-500/20 rounded ml-1">
                {t('Clear')}
              </button>
            )}
          </div>
        </header>

        {/* Project selector */}
        <ProjectBar />

        {/* View switcher: Construct / Project Flow */}
        <div className="flex items-center gap-1.5 px-6 py-1 bg-gray-50 border-b shrink-0">
          <button onClick={() => setProjectView('construct')}
            className={`text-xs px-3 py-1 rounded-full font-medium transition ${
              projectView === 'construct' ? 'bg-blue-500 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-100'}`}>
            {'\uD83D\uDCE6'} {t('Construct') || 'Construct'}
          </button>
          <button onClick={() => setProjectView('flow')}
            className={`text-xs px-3 py-1 rounded-full font-medium transition ${
              projectView === 'flow' ? 'bg-blue-500 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-100'}`}>
            {'\uD83D\uDD2C'} {t('Project') || 'Project'}
          </button>
          <span className="text-[9px] text-gray-400 ml-1">Ctrl+5</span>
        </div>

        {/* Breadcrumb: Construct ↔ Flow */}
        {projectView === 'construct' && (
          <div className="flex items-center gap-1.5 px-6 py-0.5 text-[10px] text-gray-400 bg-white border-b">
            <button onClick={() => setProjectView('flow')}
              className="hover:text-blue-500 transition">
              📂 {projectName || 'Проект'}
            </button>
            <span className="text-gray-300">→</span>
            <span className="text-gray-600 font-medium">{active.name || 'Сборка'}</span>
          </div>
        )}

        {/* Assembly tabs (construct view only) */}
        {projectView === 'construct' && <AssemblyTabs
          assemblies={assemblies}
          activeId={activeId}
          onSelect={switchAssembly}
          onAdd={addAssembly}
          onRemove={removeAssembly}
          onRename={renameAssembly}
        />}

        <div className="flex flex-1 overflow-hidden">
          <PartsPalette />
          {projectView === 'flow' ? (
            <ProjectFlowCanvas />
          ) : (
          <div className="flex-1 flex flex-col p-3 gap-2 overflow-y-auto">

            {active.completed && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-3">
                <span className="text-green-600 text-xl">{'✅'}</span>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-green-800">Сборка завершена</div>
                  <div className="text-xs text-green-600">
                    Продукт {'«'}{active.product?.name}{'»'} ({active.product?.length} п.н.)
                    {active.product?.components && ` = ${active.product.components.join(' + ')}`}
                  </div>
                  {active.product?.subFragments && (
                    <SubFragmentBar subFragments={active.product.subFragments} height={10} className="mt-1" />
                  )}
                  <div className="text-[9px] text-gray-500 mt-0.5">
                    {active.product?.subFragments?.map(f => f.name).join(' · ')}
                  </div>
                  {active.product?.assemblyMethod && (
                    <div className="text-[9px] text-green-600 mt-0.5">
                      {active.product.assemblyMethod === 'golden_gate' ? 'Golden Gate' :
                       active.product.assemblyMethod === 'kld' ? 'KLD' :
                       active.product.assemblyMethod === 'gibson' ? 'Gibson' : 'OV-PCR'}
                      {active.product?.protocol === 'complete' ? ' · протокол выполнен' : ''}
                    </div>
                  )}
                </div>
                {active.originalFragments && (
                  <button onClick={() => {
                    if (active.originalFragments && fragments[0]?.subFragments) {
                      updateActive({ fragments: active.originalFragments, junctions: active.originalJunctions || [] });
                    } else {
                      updateActive({ fragments: [active.product], junctions: [] });
                    }
                  }}
                    className="text-[10px] px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200">
                    {fragments[0]?.subFragments ? '🔍 Показать фрагменты' : '📦 Свернуть в продукт'}
                  </button>
                )}
              </div>
            )}

            {constructWarnings.length > 0 && (
              <div>
                <button onClick={() => setWarningsOpen(!warningsOpen)}
                  className="w-full flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 text-left hover:bg-amber-100 transition">
                  <span className="text-xs font-medium text-amber-700">
                    {'⚠'} {constructWarnings.length} замечани{constructWarnings.length === 1 ? 'е' : constructWarnings.length < 5 ? 'я' : 'й'}
                  </span>
                  <span className="text-amber-400 text-sm">{warningsOpen ? '▲' : '▼'}</span>
                </button>
                {warningsOpen && (
                  <div className="bg-amber-50 border border-t-0 border-amber-200 rounded-b-lg px-3 py-2 space-y-1 max-h-48 overflow-y-auto">
                    {constructWarnings.map((w, i) => (
                      <div key={i} className={`text-xs ${w.startsWith('⛔') ? 'text-red-800' : 'text-amber-800'}`}>
                        {w}
                        {w.includes('Golden Gate') && w.startsWith('⛔') && (
                          <button onClick={() => {
                            const newJ = junctions.map(j => ({
                              ...resetJunctionForType(j, 'golden_gate'),
                              enzyme: ggEnzyme,
                            }));
                            updateActive({ junctions: newJ, assemblyType: 'golden_gate', calculated: false });
                            setTimeout(() => autoDesignGGOverhangs(), 100);
                          }}
                            className="ml-2 text-[10px] bg-green-600 text-white px-2 py-0.5 rounded hover:bg-green-700 inline-flex items-center gap-1">
                            {'🔶'} Golden Gate
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <DesignCanvas
              onDrop={addFragment} onRemove={removeFragment}
              onToggleAmplification={toggleAmplification} onJunctionChange={updateJunction}
              onReorder={reorderFragments} onFlip={flipFragment}
              pcrSizes={pcrSizes} onSplitSignal={setSplitTarget}
              onEditFragment={setEditTarget}
              onSwapVariant={handleSwapVariant}
              onToggleCircular={toggleCircular}
              onToggleFragmentTopology={toggleFragmentTopology}
              onAddCustomPrimer={addCustomPrimer} />

            {calculated && primers.length > 0 && !active.completed && (
              <ActionBar
                primerCount={Math.floor(primers.length / 2)}
                primers={primers}
                onExportProtocol={() => setActiveTab('protocol')}
                onExportGenBank={() => exportGenBank(fragments, active.name || 'designed_construct', circular)}
                onOrderOligos={() => setShowOligos(true)}
                onComplete={completeAssembly}
                completed={active.completed}
              />
            )}

            {fragments.length >= 2 && !active.completed && (
              <div className="space-y-2">
                {/* GG internal site warning */}
                {assemblyType === 'golden_gate' && ggSiteCheck && !ggSiteCheck.ok && (
                  <div className="text-[10px] bg-amber-50 border border-amber-200 rounded-lg p-2 flex items-start gap-2">
                    <span className="text-amber-500 shrink-0">{'⚠'}</span>
                    <div>
                      <span className="text-amber-800">{ggSiteCheck.message}</span>
                      {ggSiteCheck.alternatives?.length > 0 && (
                        <div className="mt-1">Рекомендуется: {ggSiteCheck.alternatives.map(a => (
                          <button key={a} onClick={() => { setGgEnzyme(a); setTimeout(autoDesignGGOverhangs, 50); }}
                            className="text-blue-600 hover:underline mr-2 font-medium">{a}</button>
                        ))}</div>
                      )}
                    </div>
                  </div>
                )}
                {/* Assembly strategy selector */}
                {expertMode && fragments.length > 2 && (
                  <div className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg flex-wrap">
                    <span className="text-[11px] text-gray-600">Стратегия:</span>
                    <div className="flex rounded-lg overflow-hidden border border-gray-200">
                      {[
                        { val: 0, label: '🎯 Авто' },
                        { val: fragments.length, label: '🙏 Всё разом' },
                        ...(fragments.length > 3 ? [{ val: 3, label: '3 части' }] : []),
                        ...(fragments.length > 2 ? [{ val: 2, label: '2 части' }] : []),
                      ].map(opt => (
                        <button key={opt.val} onClick={() => setMaxFinalParts(opt.val)}
                          className={`px-3 py-1 text-[10px] transition border-r last:border-r-0 border-gray-200 ${
                            maxFinalParts === opt.val ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {efficiency && (
                      <span className={`text-[10px] font-medium ${
                        efficiency.color === 'green' ? 'text-green-600' :
                        efficiency.color === 'amber' ? 'text-amber-600' : 'text-red-600'}`}>
                        Эфф.: {efficiency.pct}
                      </span>
                    )}
                  </div>
                )}
                {/* Strategy description */}
                {expertMode && fragments.length > 2 && (() => {
                  const jt = junctions.map(j => j.type || 'overlap');
                  const methods = [...new Set(jt)];
                  const isMixed = methods.length > 1;
                  if (isMixed) {
                    const pts = [];
                    if (jt.includes('overlap')) pts.push('Overlap-склеивание');
                    if (jt.includes('golden_gate')) pts.push('Golden Gate');
                    if (jt.includes('re_ligation') || jt.includes('sticky_end')) pts.push('RE/Лигирование');
                    if (jt.includes('kld')) pts.push('KLD');
                    return (
                      <div className="text-[10px] text-gray-500 text-center">
                        {'🔀'} <b>Мультиметодная:</b> {pts.join(' → ')}
                      </div>
                    );
                  }
                  return (
                    <div className="text-[10px] text-gray-500 text-center">
                      {maxFinalParts === 0 && <span>{'🎯'} <b>Авто:</b> {fragments.length <= 3 ? 'Gibson/GG из всех фрагментов разом' : `попарный overlap → финальная сборка из ${effectiveFinalParts} частей`}</span>}
                      {maxFinalParts === fragments.length && <span>{'🙏'} <b>Всё разом:</b> ПЦР всех {fragments.length} фрагментов → сборка из {fragments.length} частей{fragments.length > 4 && <span className="text-amber-600"> (эффективность может быть низкой)</span>}</span>}
                      {maxFinalParts > 0 && maxFinalParts < fragments.length && maxFinalParts === 3 && <span>{'📐'} <b>Через 3:</b> попарный overlap → финальная сборка из 3 частей</span>}
                      {maxFinalParts > 0 && maxFinalParts < fragments.length && maxFinalParts === 2 && <span>{'📐'} <b>Через 2:</b> несколько раундов overlap → финальная сборка из 2 частей</span>}
                      {maxFinalParts > 0 && maxFinalParts < fragments.length && maxFinalParts !== 2 && maxFinalParts !== 3 && maxFinalParts !== fragments.length && <span>{'📐'} Иерархическая сборка → финальный этап из {effectiveFinalParts} частей</span>}
                    </div>
                  );
                })()}
                <div className="flex items-center justify-center gap-3">
                  <button onClick={generate} disabled={loading}
                    className="px-4 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs hover:bg-gray-200 transition disabled:opacity-50 border border-gray-200">
                    {loading ? t('Calculating...') : '🔄 Пересчитать (API)'}
                  </button>
                </div>
              </div>
            )}

            {/* Tabs */}
            {(fragments.length > 0 || primers.length > 0) && (
              <div className="flex gap-1 border-b">
                {fragments.length > 0 && (
                  <button onClick={() => setActiveTab('sequence')}
                    className={`text-xs px-3 py-1.5 border-b-2 font-medium transition ${
                      activeTab === 'sequence' ? 'border-blue-500 text-blue-700' : 'border-transparent text-gray-500'}`}>
                    {'🧬 Последовательность'}
                  </button>
                )}
                {allPrimers.length > 0 && (
                  <button onClick={() => setActiveTab('primers')}
                    className={`text-xs px-3 py-1.5 border-b-2 font-medium transition ${
                      activeTab === 'primers' ? 'border-blue-500 text-blue-700' : 'border-transparent text-gray-500'}`}>
                    {'🧪 Праймеры'} ({allPrimers.length})
                  </button>
                )}
                {expertMode && calculated && protocolSteps.length > 0 && (
                  <button onClick={() => setActiveTab('protocol')}
                    className={`text-xs px-3 py-1.5 border-b-2 font-medium transition ${
                      activeTab === 'protocol' ? 'border-purple-500 text-purple-700' : 'border-transparent text-gray-500'}`}>
                    {'📋 Протокол'} ({protocolSteps.length})
                  </button>
                )}
                {expertMode && calculated && (
                  <button onClick={() => setActiveTab('stats')}
                    className={`text-xs px-3 py-1.5 border-b-2 font-medium transition ${
                      activeTab === 'stats' ? 'border-teal-500 text-teal-700' : 'border-transparent text-gray-500'}`}>
                    {'📊 Статистика'}
                  </button>
                )}
              </div>
            )}

            {activeTab === 'sequence' && fragments.length > 0 && (
              <SequenceViewer fragments={fragments} circular={circular} primers={primers} />
            )}
            {activeTab === 'primers' && primers.length > 0 && (
              <PrimerPanel primers={allPrimers} warnings={[...apiWarnings]}
                orderSheet={orderSheet} primerQuality={primerQuality}
                primerMatches={primerMatches} onReusePrimer={handleReusePrimer}
                onDeletePrimer={(id) => deleteCustomPrimer(id)} />
            )}
            {activeTab === 'protocol' && calculated && (
              <ProtocolTracker fragments={fragments} junctions={junctions} primers={primers} pcrSizes={pcrSizes}
                polymerase={polymerase} protocol={protocol} circular={circular}
                assemblyId={active.id}
                onInventoryUpdate={incrementInventoryVersion} />
            )}
            {activeTab === 'stats' && (
              <ExperimentStats assemblies={assemblies} />
            )}

            {/* Analysis panels */}
            {fragments.length > 0 && (
              <RestrictionPanel sequence={fragments.map(f => f.sequence || '').join('')}
                fragments={fragments} circular={circular} />
            )}
            {fragments.length > 0 && primers.length > 0 && (
              <VerificationPanel fragments={fragments} circular={circular} />
            )}

          </div>
          )}
        </div>
      </div>

      {/* ═══ Modals ═══ */}
      {modalMode && (
        <AddFragmentModal mode={modalMode} onAdd={addCustomFragment} onClose={() => setModalMode(null)} />
      )}
      {(showMutagenesis || mutagenesisTarget !== null) && (
        <MutagenesisWizard
          template={mutagenesisTarget !== null ? fragments[mutagenesisTarget] : undefined}
          initialTemplateSeq={mutagenesisInitialPlasmid?.sequence}
          initialTemplateName={mutagenesisInitialPlasmid?.name}
          initialOrganism={mutagenesisInitialPlasmid?.organism}
          initialCdsStart={mutagenesisInitialPlasmid ? 0 : undefined}
          initialCdsEnd={mutagenesisInitialPlasmid ? (mutagenesisInitialPlasmid.sequence?.length || 0) : undefined}
          onComplete={handleMutagenesis}
          onClose={() => {
            setShowMutagenesis(false);
            useStore.getState().setMutagenesisTarget(null);
            useStore.getState().setMutagenesisInitialPlasmid(null);
          }}
        />
      )}
      {replacingFragment && (
        <ReplacePicker
          fragmentIndex={replacingFragment.index}
          fragmentType={replacingFragment.type}
          onClose={() => useStore.getState().setReplacingFragment(null)}
        />
      )}
      {tagFusionTarget !== null && fragments[tagFusionTarget] && (
        <TagFusionPicker
          fragmentIndex={tagFusionTarget}
          fragment={fragments[tagFusionTarget]}
          onClose={() => useStore.getState().setTagFusionTarget(null)}
        />
      )}
      {splitTarget !== null && fragments[splitTarget] && (
        <FragmentSplitter fragment={fragments[splitTarget]} onSplit={handleFragmentSplit}
          onClose={() => setSplitTarget(null)} partsLibrary={parts} />
      )}
      {editTarget !== null && fragments[editTarget] && (
        <FragmentEditor
          fragment={fragments[editTarget]}
          onSave={handleSaveFragment}
          onClose={() => setEditTarget(null)}
          onColorChange={(color) => {
            updateActive({
              fragments: fragments.map((f, i) => i === editTarget ? { ...f, customColor: color } : f),
            });
          }}
          onSaveAsVariant={handleSaveAsVariant}
          onSavePart={handleSaveAsVariant}
          onCreateAssembly={(idx) => handleCreateMutagenesisAssembly(idx)}
          assemblyCircular={circular}
        />
      )}
      {showPartsLib && (
        <PartsLibrary parts={parts} onClose={() => { setShowPartsLib(false); useStore.getState().setPartsLibPartId(null); }}
          onOpenCDSEditor={(part) => { setGlobalCDSPart(part); setShowPartsLib(false); }}
          onAddToCanvas={(part) => addFragment(part)}
          onUpdatePart={(id, data) => updatePart(id, data)}
          preSelectPartId={partsLibPartId} />
      )}
      {viewerPart && (
        <PlasmidViewer part={viewerPart}
          onClose={() => useStore.getState().setViewerPart(null)}
          onOpenWizard={(part) => {
            useStore.getState().setViewerPart(null);
            useStore.getState().setWizardPlasmid(part);
          }}
        />
      )}
      {wizardPlasmid && (
        <PlasmidUseWizard plasmid={wizardPlasmid} presetMode={wizardPresetMode}
          onClose={() => { useStore.getState().setWizardPlasmid(null); useStore.getState().setWizardPresetMode(null); }} />
      )}
      {importDecisionData && (
        <ImportDecisionModal data={importDecisionData}
          onClose={() => useStore.getState().setImportDecision(null)} />
      )}
      {versionTreePartId && (
        <PlasmidVersionTree partId={versionTreePartId}
          onClose={() => useStore.getState().setVersionTreePartId(null)}
          onViewPart={(p) => { useStore.getState().setVersionTreePartId(null); useStore.getState().setViewerPart(p); }} />
      )}
      {globalCDSPart && (
        <FragmentEditor
          fragment={globalCDSPart}
          onSave={(updated) => {
            updatePart(globalCDSPart.id, updated);
            const idx = fragments.findIndex(f => f.id === globalCDSPart.id || f.name === globalCDSPart.name);
            if (idx >= 0) updateActive({ fragments: fragments.map((f, i) => i === idx ? updated : f), calculated: false, primers: [] });
            setGlobalCDSPart(null);
          }}
          onClose={() => setGlobalCDSPart(null)}
          onColorChange={(color) => {
            const idx = fragments.findIndex(f => f.id === globalCDSPart.id || f.name === globalCDSPart.name);
            if (idx >= 0) updateActive({ fragments: fragments.map((f, i) => i === idx ? { ...f, customColor: color } : f) });
          }}
          assemblyCircular={globalCDSPart.topology === 'circular'}
        />
      )}
      {showDataMgr && (
        <DataManager onClose={() => setShowDataMgr(false)} parts={parts} projectName={projectName} />
      )}
      {showCatalog && (
        <CatalogPanel onClose={() => useStore.getState().setShowCatalog(false)} />
      )}
      {/* First launch welcome */}
      {showOligos && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 bg-black/30"
          onClick={() => setShowOligos(false)}>
          <div className="w-[900px] max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <OligoManager assemblies={assemblies} onClose={() => setShowOligos(false)} />
          </div>
        </div>
      )}
    </DndProvider>
  );
}
