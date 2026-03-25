import { useState, useEffect, useCallback, useMemo } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import PartsPalette from './components/PartsPalette';
import DesignCanvas from './components/DesignCanvas';
import PrimerPanel from './components/PrimerPanel';
import SequenceViewer from './components/SequenceViewer';
import AddFragmentModal from './components/AddFragmentModal';
import RestrictionPanel from './components/RestrictionPanel';
import ProtocolTracker from './components/ProtocolTracker';
import { PCR_MIXES, ASSEMBLY_PROTOCOLS as ASM_PROTOCOLS } from './protocol-data';
import MutagenesisWizard from './components/MutagenesisWizard';
import VerificationPanel from './components/VerificationPanel';
import FragmentSplitter from './components/FragmentSplitter';
import AssemblyTabs from './components/AssemblyTabs';
import ExperimentStats from './components/ExperimentStats';
import { fetchParts, designPrimers } from './api';
import { validateConstruct, checkPrimerQuality, pcrProductSize } from './validate';
import { exportGenBank, exportProtocol, saveToPVCS } from './exports';
import { addToInventory } from './inventory';
import { findAllMatches, addPrimersToRegistry } from './primer-reuse';
import { t } from './i18n';

const LS_KEY = 'pvcs_designer_state';
let nextId = 1;

function mkJunction(asmType) {
  return {
    type: asmType === 'golden_gate' ? 'golden_gate' : 'overlap',
    overlapMode: 'split', overlapLength: 30, tmTarget: 62,
    enzyme: 'BsaI', overhang: '',
  };
}

function mkJunctions(frags, asmType, isCirc) {
  const count = isCirc ? frags.length : Math.max(0, frags.length - 1);
  return Array.from({ length: count }, () => mkJunction(asmType));
}

function newAssembly(id, name) {
  return {
    id, name,
    fragments: [], junctions: [],
    assemblyType: 'overlap', protocol: 'overlap_pcr',
    circular: false, calculated: false,
    primers: [], apiWarnings: [], orderSheet: '', primerMatches: {},
    protocolSteps: [],
    completed: false, product: null,
  };
}

export default function App() {
  // ═══════════ Global state ═══════════
  const [parts, setParts] = useState([]);
  const [assemblies, setAssemblies] = useState([newAssembly('asm_1', 'Сборка 1')]);
  const [activeId, setActiveId] = useState('asm_1');
  const [loading, setLoading] = useState(false);
  const [modalMode, setModalMode] = useState(null);
  const [splitTarget, setSplitTarget] = useState(null);
  const [showMutagenesis, setShowMutagenesis] = useState(false);
  const [activeTab, setActiveTab] = useState('canvas');
  const [inventoryVersion, setInventoryVersion] = useState(0);
  const [polymerase, setPolymerase] = useState('phusion');
  const [primerPrefix, setPrimerPrefix] = useState('IS');

  // ═══════════ Active assembly (derived) ═══════════
  const active = assemblies.find(a => a.id === activeId) || assemblies[0];
  const { fragments, junctions, assemblyType, protocol, circular, calculated,
          primers, apiWarnings, orderSheet, primerMatches, protocolSteps } = active;

  // ═══════════ Update helpers ═══════════
  const updateActive = useCallback((updates) => {
    setAssemblies(prev => prev.map(a =>
      a.id === activeId ? { ...a, ...updates } : a
    ));
  }, [activeId]);

  const updateAssembly = useCallback((id, updates) => {
    setAssemblies(prev => prev.map(a =>
      a.id === id ? { ...a, ...updates } : a
    ));
  }, []);

  // ═══════════ Restore from localStorage ═══════════
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
      if (saved.assemblies?.length) {
        setAssemblies(saved.assemblies);
        setActiveId(saved.activeId || saved.assemblies[0].id);
        if (saved.polymerase) setPolymerase(saved.polymerase);
        if (saved.primerPrefix) setPrimerPrefix(saved.primerPrefix);
        let maxId = 0;
        saved.assemblies.forEach(a =>
          (a.fragments || []).forEach(f => {
            const num = parseInt(String(f.id).replace(/\D/g, ''), 10);
            if (num > maxId) maxId = num;
          })
        );
        nextId = maxId + 1;
      } else if (saved.fragments?.length) {
        const asm = newAssembly('asm_1', 'Сборка 1');
        asm.fragments = saved.fragments;
        if (saved.junctions) asm.junctions = saved.junctions;
        asm.assemblyType = saved.assemblyType ||
          (saved.method === 'golden_gate' ? 'golden_gate' : 'overlap');
        if (saved.protocol) asm.protocol = saved.protocol;
        if (saved.circular !== undefined) asm.circular = saved.circular;
        setAssemblies([asm]);
        nextId = saved.fragments.length + 1;
      }
    } catch {}
    setInitialized(true);
  }, []);

  // ═══════════ Save to localStorage (only after init) ═══════════
  useEffect(() => {
    if (!initialized) return;
    localStorage.setItem(LS_KEY, JSON.stringify({
      assemblies, activeId, polymerase, primerPrefix,
    }));
  }, [initialized, assemblies, activeId, polymerase, primerPrefix]);

  // ═══════════ Load parts ═══════════
  useEffect(() => {
    fetchParts().then(setParts).catch(() => {
      setParts([
        { id: 'd1', name: 'PglaA', type: 'promoter', sequence: 'ATCG'.repeat(212), length: 850 },
        { id: 'd2', name: 'XynTL', type: 'CDS', sequence: 'ATGC'.repeat(225), length: 900 },
        { id: 'd3', name: 'TtrpC', type: 'terminator', sequence: 'GCTA'.repeat(185), length: 740 },
        { id: 'd4', name: 'HygR', type: 'CDS', sequence: 'ATCG'.repeat(256), length: 1026 },
        { id: 'd5', name: 'PgpdA', type: 'promoter', sequence: 'GCGC'.repeat(135), length: 540 },
        { id: 'd6', name: 'pyrG', type: 'CDS', sequence: 'TAGC'.repeat(241), length: 966 },
      ]);
    });
  }, []);

  // ═══════════ Computed from active assembly ═══════════
  const constructWarnings = useMemo(() => validateConstruct(fragments), [fragments]);
  const primerQuality = useMemo(() =>
    primers.map(p => ({ name: p.name, warnings: checkPrimerQuality(p) }))
      .filter(pq => pq.warnings.length > 0),
    [primers]);
  const pcrSizes = useMemo(() =>
    fragments.map((f, i) => {
      const leftJ = i > 0 ? junctions[i - 1] : (circular ? junctions[junctions.length - 1] : null);
      const rightJ = i < junctions.length ? junctions[i] : (circular ? junctions[0] : null);
      return pcrProductSize(f, leftJ, rightJ);
    }),
    [fragments, junctions, circular]);
  const totalBp = fragments.reduce((s, f) => s + (f.sequence || '').length, 0);

  // ═══════════ Fragment handlers ═══════════
  const addFragment = (part) => {
    const frag = {
      id: `f${nextId++}`, name: part.name, type: part.type,
      sequence: part.sequence || '', length: part.length || 0,
      strand: 1, needsAmplification: part.needsAmplification ?? true,
      sourceAssemblyId: part.sourceAssemblyId,
    };
    const nf = [...fragments, frag];
    const nj = nf.length > 1
      ? [...junctions, mkJunction(assemblyType)]
      : junctions;
    updateActive({ fragments: nf, junctions: nj, calculated: false });
  };

  const removeFragment = (i) => {
    const nf = fragments.filter((_, idx) => idx !== i);
    updateActive({
      fragments: nf,
      junctions: mkJunctions(nf, assemblyType, circular),
      calculated: false,
    });
  };

  const toggleCircular = () => {
    const next = !circular;
    updateActive({
      circular: next,
      junctions: mkJunctions(fragments, assemblyType, next),
      calculated: false,
    });
  };

  const toggleAmplification = (i) => {
    updateActive({
      fragments: fragments.map((x, idx) =>
        idx === i ? { ...x, needsAmplification: !x.needsAmplification } : x
      ),
    });
  };

  const updateJunction = (i, cfg) => {
    updateActive({
      junctions: junctions.map((x, idx) => idx === i ? cfg : x),
      calculated: false,
    });
  };

  const flipFragment = (i) => {
    const RC = { A:'T', T:'A', G:'C', C:'G', a:'t', t:'a', g:'c', c:'g',
      N:'N', n:'n', R:'Y', Y:'R', M:'K', K:'M', S:'S', W:'W' };
    const revComp = s => s.split('').reverse().map(c => RC[c] || c).join('');
    updateActive({
      fragments: fragments.map((x, idx) =>
        idx === i ? { ...x, sequence: revComp(x.sequence || ''), strand: x.strand === -1 ? 1 : -1 } : x
      ),
      calculated: false, primers: [],
    });
  };

  const reorderFragments = (from, to) => {
    const nf = [...fragments];
    const [moved] = nf.splice(from, 1);
    nf.splice(to, 0, moved);
    updateActive({
      fragments: nf,
      junctions: mkJunctions(nf, assemblyType, circular),
      calculated: false,
    });
  };

  const addCustomFragment = (fragData) => {
    const frag = {
      id: `f${nextId++}`,
      name: fragData.name,
      type: fragData.type || 'misc_feature',
      sequence: fragData.sequence || '',
      length: fragData.length || (fragData.sequence || '').length,
      strand: fragData.strand || 1,
      needsAmplification: fragData.needsAmplification ?? true,
      sourceType: fragData.sourceType || 'sequence',
      subParts: fragData.subParts,
    };
    const nf = [...fragments, frag];
    const nj = nf.length > 1
      ? [...junctions, mkJunction(assemblyType)]
      : junctions;
    updateActive({ fragments: nf, junctions: nj, calculated: false });
  };

  // ═══════════ Generate primers ═══════════
  const generate = async () => {
    if (fragments.length < 2) return;
    const asmId = active.id; // capture for async safety
    setLoading(true);
    try {
      const data = await designPrimers(
        fragments.map(f => ({ name: f.name, sequence: f.sequence, needsAmplification: f.needsAmplification })),
        junctions, assemblyType === 'golden_gate' ? 'golden_gate' : 'overlap_pcr', circular, 60,
      );
      const tmAdj = { phusion: 3, kod: 2, taq: -5 }[polymerase] || 0;
      let pidx = 1;
      const renamedPrimers = (data.primers || []).map(p => ({
        ...p,
        name: `${primerPrefix}${String(pidx++).padStart(3, '0')}_${p.name}`,
        tmAdjusted: Math.round((p.tmBinding || 60) + tmAdj),
      }));

      const updatedJunctions = junctions.map((j, i) => ({
        ...j,
        overlapSequence: data.junctions?.[i]?.overlapSequence || j.overlapSequence,
        overlapTm: data.junctions?.[i]?.overlapTm || j.overlapTm,
        overlapGc: data.junctions?.[i]?.overlapGc || j.overlapGc,
      }));

      // Protocol steps
      const pSteps = [];
      const mix = PCR_MIXES[polymerase] || PCR_MIXES.phusion;
      fragments.forEach((frag, fi) => {
        if (!frag.needsAmplification) return;
        const fwd = renamedPrimers.find(p => p.direction === 'forward' && p.name.includes(frag.name));
        const rev = renamedPrimers.find(p => p.direction === 'reverse' && p.name.includes(frag.name));
        const sz = pcrSizes[fi] || frag.length;
        pSteps.push({
          id: `pcr_${fi}`, type: 'pcr', title: `ПЦР ${frag.name}`,
          subtitle: `${sz} п.н.`, template: frag.name,
          fwdPrimer: fwd?.name, revPrimer: rev?.name,
          annealTemp: Math.round(Math.min(fwd?.tmBinding || 60, rev?.tmBinding || 60)),
          expectedSize: sz, extensionTime: Math.ceil(sz / 1000) * mix.extRate, mix,
          statuses: [{ label: 'ПЦР', done: false }, { label: 'Гель', done: false }, { label: 'Очистка', done: false }],
        });
      });
      pSteps.push({
        id: 'assembly', type: 'assembly', title: 'Сборка',
        subtitle: (ASM_PROTOCOLS[protocol] || ASM_PROTOCOLS.overlap_pcr).name,
        protocol: ASM_PROTOCOLS[protocol] || ASM_PROTOCOLS.overlap_pcr,
        expectedSize: totalBp,
        fragments: fragments.filter(f => f.needsAmplification).map(f => f.name),
        statuses: [{ label: 'Сборка', done: false }, { label: 'Гель', done: false }],
      });
      pSteps.push({ id: 'transform', type: 'transform', title: 'Трансформация',
        statuses: [{ label: 'Трансф.', done: false }, { label: 'Колонии', done: false }] });
      pSteps.push({ id: 'screening', type: 'screening', title: 'Colony PCR', expectedSize: totalBp,
        statuses: [{ label: 'Colony PCR', done: false }, { label: 'Отобраны', done: false }] });
      pSteps.push({ id: 'sequencing', type: 'sequencing', title: 'Секвенирование',
        statuses: [{ label: 'Отправлено', done: false }, { label: 'Подтв.', done: false }] });

      // Find reusable primers from registry
      const matches = findAllMatches(renamedPrimers);

      // Save new primers to registry for future reuse
      addPrimersToRegistry(renamedPrimers);

      updateAssembly(asmId, {
        primers: renamedPrimers,
        apiWarnings: data.warnings || [],
        orderSheet: data.orderSheet || '',
        primerMatches: matches,
        junctions: updatedJunctions,
        calculated: true,
        protocolSteps: pSteps,
      });
    } catch (e) {
      updateAssembly(asmId, { apiWarnings: [`API error: ${e.message}`] });
    }
    setLoading(false);
  };

  // ═══════════ Fragment split ═══════════
  const handleFragmentSplit = (result) => {
    const idx = splitTarget;
    if (idx === null) return;
    const nf = [...fragments];
    const frag = nf[idx];
    if (result.action === 'split') {
      const p1 = { id: `f${nextId++}`, name: result.part1Name, type: frag.type,
        sequence: result.part1DNA, length: result.part1DNA.length, strand: 1, needsAmplification: true };
      nf[idx] = { ...frag, name: result.part2Name, sequence: result.part2DNA, length: result.part2DNA.length };
      nf.splice(idx, 0, p1);
    } else if (result.action === 'remove_part1') {
      nf[idx] = { ...frag, sequence: result.sequence, length: result.sequence.length };
    } else if (result.action === 'remove_part2') {
      nf[idx] = { ...frag, sequence: result.sequence, length: result.sequence.length };
    } else if (result.action === 'replace_part1') {
      const rep = { id: `f${nextId++}`, name: result.replacementName, type: result.replacementType || frag.type,
        sequence: result.replacementSeq, length: result.replacementSeq.length, strand: 1, needsAmplification: true };
      nf[idx] = { ...frag, name: result.part2Name, sequence: result.part2DNA, length: result.part2DNA.length };
      nf.splice(idx, 0, rep);
    }
    updateActive({
      fragments: nf,
      junctions: mkJunctions(nf, assemblyType, circular),
      calculated: false,
    });
    setSplitTarget(null);
  };

  // ═══════════ Mutagenesis ═══════════
  const handleMutagenesis = (result) => {
    const newFrags = result.fragments.map((f) => ({
      ...f, id: `mf${nextId++}`, isMutagenesis: true,
    }));
    updateActive({
      fragments: newFrags,
      junctions: result.junctions,
      calculated: false,
      primers: [],
    });
  };

  // ═══════════ Primer reuse ═══════════
  const handleReusePrimer = (primerName, existingPrimer) => {
    updateActive({
      primers: primers.map(p =>
        p.name === primerName
          ? { ...p, reused: true, reusedFrom: existingPrimer.name }
          : p
      ),
    });
  };

  // ═══════════ Assembly management ═══════════
  const addAssembly = () => {
    const id = `asm_${Date.now()}`;
    const num = assemblies.length + 1;
    setAssemblies(prev => [...prev, newAssembly(id, `Сборка ${num}`)]);
    setActiveId(id);
    setSplitTarget(null);
    setShowMutagenesis(false);
  };

  const removeAssembly = (id) => {
    if (assemblies.length <= 1) return;
    const remaining = assemblies.filter(a => a.id !== id);
    setAssemblies(remaining);
    if (activeId === id) setActiveId(remaining[0].id);
  };

  const renameAssembly = (id, name) => {
    updateAssembly(id, { name });
  };

  const switchAssembly = (id) => {
    setActiveId(id);
    setSplitTarget(null);
    setShowMutagenesis(false);
  };

  const setAssemblyType_ = (type) => {
    updateActive({
      assemblyType: type,
      junctions: junctions.map(j => ({ ...j, type: type === 'golden_gate' ? 'golden_gate' : 'overlap' })),
    });
  };

  const completeAssembly = () => {
    const fullSeq = fragments.map(f => f.sequence || '').join('');
    const product = {
      name: active.name,
      sequence: fullSeq,
      length: fullSeq.length,
      type: circular ? 'plasmid' : 'pcr_product',
      verified: circular,
      sourceAssemblyId: active.id,
    };
    addToInventory(product);
    updateActive({ completed: true, product });
    setInventoryVersion(v => v + 1);
  };

  const clearAssembly = () => {
    updateActive({
      fragments: [], junctions: [], primers: [],
      apiWarnings: [], orderSheet: '', calculated: false,
      protocolSteps: [], completed: false, product: null,
    });
  };

  // ═══════════ Render ═══════════
  return (
    <DndProvider backend={HTML5Backend}>
      <div className="h-screen flex flex-col">
        {/* Header */}
        <header className="bg-white border-b px-6 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-lg">&#x1F9EC;</span>
            <h1 className="text-lg font-bold text-gray-800">{t('Construct Designer')}</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">{t('Assembly:')}</span>
            <button onClick={() => setAssemblyType_('overlap')}
              className={`text-xs px-3 py-1.5 rounded-full font-semibold transition
                ${assemblyType === 'overlap' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              Overlap / Gibson
            </button>
            <button onClick={() => setAssemblyType_('golden_gate')}
              className={`text-xs px-3 py-1.5 rounded-full font-semibold transition
                ${assemblyType === 'golden_gate' ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              Golden Gate
            </button>
            <button onClick={() => setShowMutagenesis(true)}
              className="text-xs px-3 py-1.5 rounded-full font-semibold bg-purple-100 text-purple-700 hover:bg-purple-200 transition">
              {'🔬'} {t('Mutagenesis')}
            </button>
            <select value={polymerase} onChange={e => setPolymerase(e.target.value)}
              className="text-xs border rounded px-2 py-1 ml-2">
              <option value="phusion">Phusion/Q5</option>
              <option value="taq">Taq</option>
              <option value="kod">KOD</option>
            </select>
            <div className="flex items-center gap-1 ml-2 text-xs text-gray-500">
              <span>Prefix:</span>
              <input value={primerPrefix} onChange={e => setPrimerPrefix(e.target.value)}
                className="w-10 border rounded px-1 py-0.5 text-xs" maxLength={4} />
            </div>
            {fragments.length > 0 && (
              <button onClick={clearAssembly} className="text-xs px-2 py-1 text-red-500 hover:bg-red-50 rounded ml-2">
                {t('Clear')}
              </button>
            )}
          </div>
        </header>

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
          <PartsPalette parts={parts} onOpenModal={setModalMode} inventoryVersion={inventoryVersion} />
          <div className="flex-1 flex flex-col p-4 gap-3 overflow-y-auto">

            {/* Completed badge */}
            {active.completed && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-3">
                <span className="text-green-600 text-xl">{'✅'}</span>
                <div>
                  <div className="text-sm font-semibold text-green-800">Сборка завершена</div>
                  <div className="text-xs text-green-600">
                    Продукт {'«'}{active.product?.name}{'»'} ({active.product?.length} п.н.) доступен в палитре для следующей сборки
                  </div>
                </div>
              </div>
            )}

            {/* Construct validation warnings */}
            {constructWarnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
                {constructWarnings.map((w, i) => (
                  <div key={i} className="text-xs text-amber-700">{w}</div>
                ))}
              </div>
            )}

            <DesignCanvas fragments={fragments} junctions={junctions}
              circular={circular} onToggleCircular={toggleCircular}
              onDrop={addFragment} onRemove={removeFragment}
              onToggleAmplification={toggleAmplification} onJunctionChange={updateJunction}
              onReorder={reorderFragments} onFlip={flipFragment} calculated={calculated}
              pcrSizes={pcrSizes} onSplitSignal={setSplitTarget}
              primers={primers} />

            {/* Generate + actions */}
            {fragments.length >= 2 && !active.completed && (
              <div className="flex items-center justify-center gap-3">
                <button onClick={generate} disabled={loading}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg
                    font-semibold text-sm hover:bg-blue-700 transition disabled:opacity-50">
                  {loading ? t('Calculating...') : t('Generate Primers')}
                </button>
              </div>
            )}

            {/* Tabs: Sequence / Primers / Protocol */}
            {(fragments.length > 0 || primers.length > 0) && (
              <div className="flex gap-1 border-b">
                {fragments.length > 0 && (
                  <button onClick={() => setActiveTab('sequence')}
                    className={`text-xs px-3 py-1.5 border-b-2 font-medium transition ${
                      activeTab === 'sequence' ? 'border-blue-500 text-blue-700' : 'border-transparent text-gray-500'}`}>
                    {'🧬 Последовательность'}
                  </button>
                )}
                {primers.length > 0 && (
                  <button onClick={() => setActiveTab('primers')}
                    className={`text-xs px-3 py-1.5 border-b-2 font-medium transition ${
                      activeTab === 'primers' ? 'border-blue-500 text-blue-700' : 'border-transparent text-gray-500'}`}>
                    {'🧪 Праймеры'} ({primers.length})
                  </button>
                )}
                {calculated && protocolSteps.length > 0 && (
                  <button onClick={() => setActiveTab('protocol')}
                    className={`text-xs px-3 py-1.5 border-b-2 font-medium transition ${
                      activeTab === 'protocol' ? 'border-purple-500 text-purple-700' : 'border-transparent text-gray-500'}`}>
                    {'📋 Протокол'} ({protocolSteps.length})
                  </button>
                )}
                {calculated && (
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
              <PrimerPanel primers={primers} warnings={[...apiWarnings]}
                orderSheet={orderSheet} primerQuality={primerQuality}
                primerMatches={primerMatches} onReusePrimer={handleReusePrimer} />
            )}

            {activeTab === 'protocol' && calculated && (
              <>
                <ProtocolTracker fragments={fragments} primers={primers} pcrSizes={pcrSizes}
                  polymerase={polymerase} protocol={protocol} circular={circular}
                  assemblyId={active.id}
                  onInventoryUpdate={() => setInventoryVersion(v => v + 1)} />
                {!active.completed && (
                  <button onClick={completeAssembly}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm
                      font-semibold hover:bg-green-700 transition w-full">
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
              <RestrictionPanel
                sequence={fragments.map(f => f.sequence || '').join('')}
                fragments={fragments} circular={circular} />
            )}
            {fragments.length > 0 && primers.length > 0 && (
              <VerificationPanel fragments={fragments} circular={circular} />
            )}

            {/* Export buttons */}
            {primers.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => exportGenBank(fragments, active.name || 'designed_construct', circular)}
                  className="text-xs px-3 py-1.5 bg-green-50 text-green-700 rounded hover:bg-green-100 border border-green-200">
                  Export GenBank (.gb)
                </button>
                <button onClick={() => exportProtocol(fragments, junctions, primers, protocol, circular)}
                  className="text-xs px-3 py-1.5 bg-purple-50 text-purple-700 rounded hover:bg-purple-100 border border-purple-200">
                  Export Protocol (.txt)
                </button>
                <button onClick={async () => {
                  const r = await saveToPVCS(fragments, junctions, primers, protocol, circular);
                  if (r.success) alert('Saved to PlasmidVCS!');
                  else alert(`Failed: ${r.error}`);
                }}
                  className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 border border-blue-200">
                  Save to PlasmidVCS
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {modalMode && (
        <AddFragmentModal mode={modalMode} onAdd={addCustomFragment} onClose={() => setModalMode(null)} />
      )}
      {showMutagenesis && (
        <MutagenesisWizard onComplete={handleMutagenesis} onClose={() => setShowMutagenesis(false)} />
      )}
      {splitTarget !== null && fragments[splitTarget] && (
        <FragmentSplitter
          fragment={fragments[splitTarget]}
          onSplit={handleFragmentSplit}
          onClose={() => setSplitTarget(null)}
          partsLibrary={parts}
        />
      )}
    </DndProvider>
  );
}
