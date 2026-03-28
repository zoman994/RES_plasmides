/**
 * App.jsx — Root layout component.
 *
 * All state lives in Zustand store (src/store/).
 * Complex handlers extracted to custom hooks (src/hooks/).
 * This file is pure layout + wiring (~430 lines).
 */
import { useEffect, useMemo } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

// ═══ Store ═══
import { useStore, useFragments, useJunctions, usePrimers, useCustomPrimers } from './store/index';

// ═══ Hooks (extracted handlers) ═══
import { useGeneratePrimers } from './hooks/useGeneratePrimers';
import { useFragmentHandlers } from './hooks/useFragmentHandlers';

// ═══ Components ═══
import PartsPalette from './components/PartsPalette';
import DesignCanvas from './components/DesignCanvas';
import PrimerPanel from './components/PrimerPanel';
import SequenceViewer from './components/SequenceViewer';
import AddFragmentModal from './components/AddFragmentModal';
import RestrictionPanel from './components/RestrictionPanel';
import ProtocolTracker from './components/ProtocolTracker';
import MutagenesisWizard from './components/MutagenesisWizard';
import VerificationPanel from './components/VerificationPanel';
import FragmentSplitter from './components/FragmentSplitter';
import AssemblyTabs from './components/AssemblyTabs';
import ProjectBar from './components/ExperimentSelector';
import ExperimentStats from './components/ExperimentStats';
import OligoManager from './components/OligoManager';
import FragmentEditor from './components/FragmentEditor';
import PartsLibrary from './components/PartsLibrary';
import DataManager from './components/DataManager';

// ═══ Utilities ═══
import { fetchParts } from './api';
import { validateConstruct, checkPrimerQuality, pcrProductSize } from './validate';
import { t } from './i18n';
import { GG_ENZYMES } from './golden-gate';
import { estimateEfficiency } from './assembly-utils';

export default function App() {

  // ═══════════ Store: domain state ═══════════
  // ═══ Store selectors ═══
  const fragments     = useFragments();
  const junctions     = useJunctions();
  const primers       = usePrimers();
  const customPrimers = useCustomPrimers();
  const assemblies    = useStore(s => s.assemblies);
  const activeId      = useStore(s => s.activeId);
  // ═══ Store: state needed for render ═══
  const parts      = useStore(s => s.parts);
  const polymerase = useStore(s => s.polymerase);
  const ggEnzyme   = useStore(s => s.ggEnzyme);
  const ggSiteCheck = useStore(s => s.ggSiteCheck);
  const loading    = useStore(s => s.loading);
  const modalMode  = useStore(s => s.modalMode);
  const splitTarget = useStore(s => s.splitTarget);
  const showMutagenesis = useStore(s => s.showMutagenesis);
  const showOligos = useStore(s => s.showOligos);
  const showPartsLib = useStore(s => s.showPartsLib);
  const globalCDSPart = useStore(s => s.globalCDSPart);
  const editTarget = useStore(s => s.editTarget);
  const showDataMgr = useStore(s => s.showDataMgr);
  const activeTab  = useStore(s => s.activeTab);
  const warningsOpen = useStore(s => s.warningsOpen);
  const expertMode = useStore(s => s.expertMode);
  const firstLaunch = useStore(s => s.firstLaunch);
  const maxFinalParts = useStore(s => s.maxFinalParts);

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
    handleSwapVariant, handleMutagenesis, handleReusePrimer,
    completeAssembly, clearAssembly, addCustomFragment,
  } = useFragmentHandlers();

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
      const existingIds = new Set(parts.map(p => p.id));
      // User-created variants (parentId set, or source=mutagenesis) must be preserved
      const userParts = parts.filter(p => p.parentId || p.source === 'mutagenesis');
      // API parts: add only if not already present
      const newApiParts = apiParts.filter(p => !existingIds.has(p.id));
      // Merge: API base parts + user variants
      const baseParts = apiParts.filter(p => existingIds.has(p.id) ? false : true);
      setParts([...baseParts, ...userParts]);
    };
    const fallback = [
      { id: 'd1', name: 'PglaA', type: 'promoter', sequence: 'ATCG'.repeat(212), length: 850 },
      { id: 'd2', name: 'XynTL', type: 'CDS', sequence: 'ATGC'.repeat(225), length: 900 },
      { id: 'd3', name: 'TtrpC', type: 'terminator', sequence: 'GCTA'.repeat(185), length: 740 },
      { id: 'd4', name: 'HygR', type: 'CDS', sequence: 'ATCG'.repeat(256), length: 1026 },
      { id: 'd5', name: 'PgpdA', type: 'promoter', sequence: 'GCGC'.repeat(135), length: 540 },
      { id: 'd6', name: 'pyrG', type: 'CDS', sequence: 'TAGC'.repeat(241), length: 966 },
    ];
    fetchParts().then(mergeParts).catch(() => mergeParts(fallback));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  // ═══ Render ═══
  return (
    <DndProvider backend={HTML5Backend}>
      <div className="h-screen flex flex-col" style={{ backgroundColor: '#f8f9fa' }}>
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
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleExpertMode}
              className={`flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-medium transition border ${
                expertMode ? 'bg-purple-500/20 border-purple-400/30 text-purple-300' : 'bg-green-500/20 border-green-400/30 text-green-300'}`}>
              {expertMode ? '🔬 Эксперт' : '🎓 Студент'}
            </button>
            <div className="w-px h-4 bg-white/15 mx-1" />
            <span className="text-xs text-gray-400">Метод:</span>
            <button onClick={() => setAssemblyType('overlap')}
              className={`text-xs px-3 py-1.5 rounded-full font-semibold transition
                ${assemblyType === 'overlap' ? 'bg-blue-500 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}>
              Overlap / Gibson
            </button>
            {expertMode && (
              <button onClick={() => setAssemblyType('golden_gate')}
                className={`text-xs px-3 py-1.5 rounded-full font-semibold transition
                  ${assemblyType === 'golden_gate' ? 'bg-amber-500 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}>
                Golden Gate
              </button>
            )}
            {expertMode && assemblyType === 'golden_gate' && (
              <select value={ggEnzyme} onChange={e => { setGgEnzyme(e.target.value); setTimeout(autoDesignGGOverhangs, 50); }}
                className="text-[10px] bg-white/10 text-gray-300 border-0 rounded px-2 py-1">
                {Object.entries(GG_ENZYMES).map(([k, e]) => (
                  <option key={k} value={k}>{e.name}{e.alias ? `/${e.alias}` : ''} ({e.overhangLength}nt)</option>
                ))}
              </select>
            )}
            {expertMode && (
              <button onClick={() => setShowMutagenesis(true)}
                className="text-xs px-3 py-1.5 rounded-full font-semibold bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 transition">
                {'🔬'} {t('Mutagenesis')}
              </button>
            )}
            <div className="w-px h-4 bg-white/15 mx-1" />
            {expertMode && (
              <button onClick={() => setShowOligos(true)}
                className="text-xs px-2 py-1 rounded bg-white/10 text-gray-300 hover:bg-white/20 transition">
                {'📋'} Олиги
              </button>
            )}
            <button onClick={() => setShowPartsLib(true)}
              className="text-xs px-2 py-1 rounded bg-white/10 text-gray-300 hover:bg-white/20 transition">
              {'📦'} Запчасти
            </button>
            <button onClick={() => setShowDataMgr(true)}
              className="text-xs px-2 py-1 rounded bg-white/10 text-gray-300 hover:bg-white/20 transition"
              title="Экспорт / Импорт данных">
              {'💾'} Данные
            </button>
            {expertMode && (<>
              <div className="w-px h-4 bg-white/15 mx-1" />
              <select value={polymerase} onChange={e => setPolymerase(e.target.value)}
                className="text-xs bg-white/10 text-gray-300 border-0 rounded px-2 py-1">
                <option value="phusion">Phusion/Q5</option>
                <option value="taq">Taq</option>
                <option value="kod">KOD</option>
              </select>
              <div className="flex items-center gap-1 ml-1 text-xs text-gray-400">
                <span>Prefix:</span>
                <input value={primerPrefix} onChange={e => setPrimerPrefix(e.target.value)}
                  className="w-10 bg-white/10 text-gray-300 border-0 rounded px-1 py-0.5 text-xs" maxLength={4} />
              </div>
            </>)}
            {fragments.length > 0 && (
              <button onClick={clearAssembly} className="text-xs px-2 py-1 text-red-400 hover:bg-red-500/20 rounded ml-1">
                {t('Clear')}
              </button>
            )}
          </div>
        </header>

        {/* Project selector */}
        <ProjectBar />

        {/* Assembly tabs */}
        <AssemblyTabs
          assemblies={assemblies}
          activeId={activeId}
          onSelect={switchAssembly}
          onAdd={addAssembly}
          onRemove={removeAssembly}
          onRename={renameAssembly}
        />

        <div className="flex flex-1 overflow-hidden">
          <PartsPalette />
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
                            const newJ = junctions.map(j => ({ ...j, type: 'golden_gate', enzyme: ggEnzyme }));
                            updateActive({ junctions: newJ, assemblyType: 'golden_gate', calculated: false, primers: [] });
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
              onAddCustomPrimer={addCustomPrimer} />

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
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 transition disabled:opacity-50">
                    {loading ? t('Calculating...') : t('Generate Primers')}
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
              <>
                <ProtocolTracker fragments={fragments} junctions={junctions} primers={primers} pcrSizes={pcrSizes}
                  polymerase={polymerase} protocol={protocol} circular={circular}
                  assemblyId={active.id}
                  onInventoryUpdate={incrementInventoryVersion} />
                {!active.completed && (
                  <button onClick={completeAssembly}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition w-full">
                    {'✅'} Сборка завершена {'—'} создать продукт
                  </button>
                )}
              </>
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

            {primers.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => exportGenBank(fragments, active.name || 'designed_construct', circular)}
                  className="text-xs px-3 py-1.5 bg-green-50 text-green-700 rounded hover:bg-green-100 border border-green-200">
                  {t('Export GenBank')} (.gb)
                </button>
                <button onClick={() => exportProtocol(fragments, junctions, primers, protocol, circular)}
                  className="text-xs px-3 py-1.5 bg-purple-50 text-purple-700 rounded hover:bg-purple-100 border border-purple-200">
                  {t('Export Protocol')} (.txt)
                </button>
                <button onClick={async () => {
                  const r = await saveToPVCS(fragments, junctions, primers, protocol, circular);
                  if (r.success) alert('Сохранено в PlasmidVCS!'); else alert(`Ошибка: ${r.error}`);
                }}
                  className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 border border-blue-200">
                  {t('Save to PlasmidVCS')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ Modals ═══ */}
      {modalMode && (
        <AddFragmentModal mode={modalMode} onAdd={addCustomFragment} onClose={() => setModalMode(null)} />
      )}
      {showMutagenesis && (
        <MutagenesisWizard onComplete={handleMutagenesis} onClose={() => setShowMutagenesis(false)} />
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
        />
      )}
      {showPartsLib && (
        <PartsLibrary parts={parts} onClose={() => setShowPartsLib(false)}
          onOpenCDSEditor={(part) => { setGlobalCDSPart(part); setShowPartsLib(false); }}
          onAddToCanvas={(part) => addFragment(part)}
          onUpdatePart={(id, data) => updatePart(id, data)} />
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
        />
      )}
      {showDataMgr && (
        <DataManager onClose={() => setShowDataMgr(false)} parts={parts} projectName={projectName} />
      )}
      {/* First launch welcome */}
      {firstLaunch && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md text-center">
            <h2 className="text-lg font-bold mb-2">Добро пожаловать в PlasmidVCS!</h2>
            <p className="text-sm text-gray-600 mb-6">Выберите режим работы:</p>
            <div className="flex gap-4">
              <button onClick={() => { if (expertMode) toggleExpertMode(); setFirstLaunch(false); }}
                className="flex-1 p-4 rounded-xl border-2 border-green-200 hover:bg-green-50 transition">
                <div className="text-2xl mb-2">{'🎓'}</div>
                <div className="font-semibold">Студент</div>
                <div className="text-[11px] text-gray-500 mt-1">Простой интерфейс для обучения клонированию</div>
              </button>
              <button onClick={() => { if (!expertMode) toggleExpertMode(); setFirstLaunch(false); }}
                className="flex-1 p-4 rounded-xl border-2 border-purple-200 hover:bg-purple-50 transition">
                <div className="text-2xl mb-2">{'🔬'}</div>
                <div className="font-semibold">Эксперт</div>
                <div className="text-[11px] text-gray-500 mt-1">Все инструменты: мутагенез, Golden Gate, протоколы</div>
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-4">Можно переключить в любой момент в шапке программы</p>
          </div>
        </div>
      )}
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
