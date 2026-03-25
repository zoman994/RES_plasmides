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
import ExperimentSelector from './components/ExperimentSelector';
import ExperimentStats from './components/ExperimentStats';
import OligoManager from './components/OligoManager';
import CDSEditor from './components/CDSEditor';
import PartsLibrary from './components/PartsLibrary';
import { fetchParts, designPrimers } from './api';
import { validateConstruct, checkPrimerQuality, pcrProductSize } from './validate';
import { exportGenBank, exportProtocol, saveToPVCS } from './exports';
import { addToInventory } from './inventory';
import { findAllMatches, addPrimersToRegistry } from './primer-reuse';
import { t } from './i18n';
import { getFragColor, isMarker } from './theme';

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

function newExperiment(id, name) {
  const asmId = `asm_${Date.now()}`;
  return {
    id, name, createdAt: new Date().toISOString(),
    assemblies: [newAssembly(asmId, 'Сборка 1')],
    _firstAsmId: asmId,
  };
}

export default function App() {
  // ═══════════ Global state ═══════════
  const [parts, setParts] = useState([]);
  const [experiments, setExperiments] = useState([{
    id: 'exp_1', name: 'Эксперимент 1', createdAt: new Date().toISOString(),
    assemblies: [newAssembly('asm_1', 'Сборка 1')],
  }]);
  const [activeExpId, setActiveExpId] = useState('exp_1');
  const [activeId, setActiveId] = useState('asm_1');
  const [loading, setLoading] = useState(false);
  const [modalMode, setModalMode] = useState(null);
  const [splitTarget, setSplitTarget] = useState(null);
  const [showMutagenesis, setShowMutagenesis] = useState(false);
  const [showOligos, setShowOligos] = useState(false);
  const [showPartsLib, setShowPartsLib] = useState(false);
  const [globalCDSPart, setGlobalCDSPart] = useState(null);
  const [domainTarget, setDomainTarget] = useState(null);
  const [activeTab, setActiveTab] = useState('canvas');
  const [inventoryVersion, setInventoryVersion] = useState(0);
  const [polymerase, setPolymerase] = useState('phusion');
  const [primerPrefix, setPrimerPrefix] = useState('IS');

  // ═══════════ Derived: experiment → assemblies → active ═══════════
  const activeExp = experiments.find(e => e.id === activeExpId) || experiments[0];
  const assemblies = activeExp?.assemblies || [];
  const active = assemblies.find(a => a.id === activeId) || assemblies[0] || newAssembly('asm_1', 'Сборка 1');
  const { fragments, junctions, assemblyType, protocol, circular, calculated,
          primers, apiWarnings, orderSheet, primerMatches, protocolSteps } = active;

  // ═══════════ Assembly updaters (through experiments) ═══════════
  const setAssemblies = useCallback((updater) => {
    setExperiments(prev => prev.map(e =>
      e.id === activeExpId
        ? { ...e, assemblies: typeof updater === 'function' ? updater(e.assemblies) : updater }
        : e
    ));
  }, [activeExpId]);

  const updateActive = useCallback((updates) => {
    setAssemblies(prev => prev.map(a =>
      a.id === activeId ? { ...a, ...updates } : a
    ));
  }, [activeId, setAssemblies]);

  const updateAssembly = useCallback((id, updates) => {
    setAssemblies(prev => prev.map(a =>
      a.id === id ? { ...a, ...updates } : a
    ));
  }, [setAssemblies]);

  // ═══════════ Restore from localStorage ═══════════
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
      if (saved.experiments?.length) {
        // New experiment format
        setExperiments(saved.experiments);
        setActiveExpId(saved.activeExpId || saved.experiments[0].id);
        const firstExp = saved.experiments.find(e => e.id === (saved.activeExpId || saved.experiments[0].id));
        setActiveId(saved.activeId || firstExp?.assemblies?.[0]?.id || 'asm_1');
        if (saved.polymerase) setPolymerase(saved.polymerase);
        if (saved.primerPrefix) setPrimerPrefix(saved.primerPrefix);
        let maxId = 0;
        saved.experiments.forEach(exp =>
          (exp.assemblies || []).forEach(a =>
            (a.fragments || []).forEach(f => {
              const num = parseInt(String(f.id).replace(/\D/g, ''), 10);
              if (num > maxId) maxId = num;
            })
          )
        );
        nextId = maxId + 1;
      } else if (saved.assemblies?.length) {
        // Migrate: assemblies → wrap in experiment
        setExperiments([{
          id: 'exp_1', name: 'Эксперимент 1', createdAt: new Date().toISOString(),
          assemblies: saved.assemblies,
        }]);
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
        // Migrate old single-assembly format
        const asm = newAssembly('asm_1', 'Сборка 1');
        asm.fragments = saved.fragments;
        if (saved.junctions) asm.junctions = saved.junctions;
        asm.assemblyType = saved.assemblyType || 'overlap';
        if (saved.protocol) asm.protocol = saved.protocol;
        if (saved.circular !== undefined) asm.circular = saved.circular;
        setExperiments([{
          id: 'exp_1', name: 'Эксперимент 1', createdAt: new Date().toISOString(),
          assemblies: [asm],
        }]);
        nextId = saved.fragments.length + 1;
      }
    } catch {}
    setInitialized(true);
  }, []);

  // ═══════════ Save to localStorage (only after init) ═══════════
  useEffect(() => {
    if (!initialized) return;
    localStorage.setItem(LS_KEY, JSON.stringify({
      experiments, activeExpId, activeId, polymerase, primerPrefix,
    }));
  }, [initialized, experiments, activeExpId, activeId, polymerase, primerPrefix]);

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

  // All assemblies across all experiments (for OligoManager)
  const allAssemblies = useMemo(() =>
    experiments.flatMap(e => (e.assemblies || []).map(a => ({ ...a, experimentName: e.name }))),
    [experiments]);

  // ═══════════ Fragment handlers ═══════════
  const addFragment = (part) => {
    const frag = {
      id: `f${nextId++}`, name: part.name, type: part.type,
      sequence: part.sequence || '', length: part.length || 0,
      strand: 1, needsAmplification: part.needsAmplification ?? true,
      sourceAssemblyId: part.sourceAssemblyId,
    };
    const nf = [...fragments, frag];
    const nj = nf.length > 1 ? [...junctions, mkJunction(assemblyType)] : junctions;
    updateActive({ fragments: nf, junctions: nj, calculated: false });
  };

  const removeFragment = (i) => {
    const nf = fragments.filter((_, idx) => idx !== i);
    updateActive({ fragments: nf, junctions: mkJunctions(nf, assemblyType, circular), calculated: false });
  };

  const toggleCircular = () => {
    const next = !circular;
    updateActive({ circular: next, junctions: mkJunctions(fragments, assemblyType, next), calculated: false });
  };

  const toggleAmplification = (i) => {
    updateActive({ fragments: fragments.map((x, idx) => idx === i ? { ...x, needsAmplification: !x.needsAmplification } : x) });
  };

  const updateJunction = (i, cfg) => {
    updateActive({ junctions: junctions.map((x, idx) => idx === i ? cfg : x), calculated: false });
  };

  const flipFragment = (i) => {
    const RC = { A:'T', T:'A', G:'C', C:'G', a:'t', t:'a', g:'c', c:'g', N:'N', n:'n', R:'Y', Y:'R', M:'K', K:'M', S:'S', W:'W' };
    const revComp = s => s.split('').reverse().map(c => RC[c] || c).join('');
    updateActive({
      fragments: fragments.map((x, idx) => idx === i ? { ...x, sequence: revComp(x.sequence || ''), strand: x.strand === -1 ? 1 : -1 } : x),
      calculated: false, primers: [],
    });
  };

  const reorderFragments = (from, to) => {
    const nf = [...fragments]; const [moved] = nf.splice(from, 1); nf.splice(to, 0, moved);
    updateActive({ fragments: nf, junctions: mkJunctions(nf, assemblyType, circular), calculated: false });
  };

  const addCustomFragment = (fragData) => {
    const frag = {
      id: `f${nextId++}`, name: fragData.name, type: fragData.type || 'misc_feature',
      sequence: fragData.sequence || '', length: fragData.length || (fragData.sequence || '').length,
      strand: fragData.strand || 1, needsAmplification: fragData.needsAmplification ?? true,
      sourceType: fragData.sourceType || 'sequence', subParts: fragData.subParts,
    };
    const nf = [...fragments, frag];
    const nj = nf.length > 1 ? [...junctions, mkJunction(assemblyType)] : junctions;
    updateActive({ fragments: nf, junctions: nj, calculated: false });
  };

  // ═══════════ Generate primers ═══════════
  const generate = async () => {
    if (fragments.length < 2) return;
    const asmId = active.id;
    setLoading(true);
    try {
      const data = await designPrimers(
        fragments.map(f => ({ name: f.name, sequence: f.sequence, needsAmplification: f.needsAmplification })),
        junctions, assemblyType === 'golden_gate' ? 'golden_gate' : 'overlap_pcr', circular, 60,
      );
      const tmAdj = { phusion: 3, kod: 2, taq: -5 }[polymerase] || 0;
      let pidx = 1;
      const renamedPrimers = (data.primers || []).map(p => ({
        ...p, name: `${primerPrefix}${String(pidx++).padStart(3, '0')}_${p.name}`,
        tmAdjusted: Math.round((p.tmBinding || 60) + tmAdj),
      }));
      const updatedJunctions = junctions.map((j, i) => ({
        ...j, overlapSequence: data.junctions?.[i]?.overlapSequence || j.overlapSequence,
        overlapTm: data.junctions?.[i]?.overlapTm || j.overlapTm,
        overlapGc: data.junctions?.[i]?.overlapGc || j.overlapGc,
      }));
      const pSteps = [];
      const mix = PCR_MIXES[polymerase] || PCR_MIXES.phusion;
      fragments.forEach((frag, fi) => {
        if (!frag.needsAmplification) return;
        const fwd = renamedPrimers.find(p => p.direction === 'forward' && p.name.includes(frag.name));
        const rev = renamedPrimers.find(p => p.direction === 'reverse' && p.name.includes(frag.name));
        const sz = pcrSizes[fi] || frag.length;
        pSteps.push({ id: `pcr_${fi}`, type: 'pcr', title: `ПЦР ${frag.name}`, subtitle: `${sz} п.н.`, template: frag.name,
          fwdPrimer: fwd?.name, revPrimer: rev?.name, annealTemp: Math.round(Math.min(fwd?.tmBinding || 60, rev?.tmBinding || 60)),
          expectedSize: sz, extensionTime: Math.ceil(sz / 1000) * mix.extRate, mix,
          statuses: [{ label: 'ПЦР', done: false }, { label: 'Гель', done: false }, { label: 'Очистка', done: false }] });
      });
      pSteps.push({ id: 'assembly', type: 'assembly', title: 'Сборка',
        subtitle: (ASM_PROTOCOLS[protocol] || ASM_PROTOCOLS.overlap_pcr).name,
        protocol: ASM_PROTOCOLS[protocol] || ASM_PROTOCOLS.overlap_pcr, expectedSize: totalBp,
        fragments: fragments.filter(f => f.needsAmplification).map(f => f.name),
        statuses: [{ label: 'Сборка', done: false }, { label: 'Гель', done: false }] });
      pSteps.push({ id: 'transform', type: 'transform', title: 'Трансформация',
        statuses: [{ label: 'Трансф.', done: false }, { label: 'Колонии', done: false }] });
      pSteps.push({ id: 'screening', type: 'screening', title: 'Colony PCR', expectedSize: totalBp,
        statuses: [{ label: 'Colony PCR', done: false }, { label: 'Отобраны', done: false }] });
      pSteps.push({ id: 'sequencing', type: 'sequencing', title: 'Секвенирование',
        statuses: [{ label: 'Отправлено', done: false }, { label: 'Подтв.', done: false }] });
      const matches = findAllMatches(renamedPrimers);
      addPrimersToRegistry(renamedPrimers);
      updateAssembly(asmId, { primers: renamedPrimers, apiWarnings: data.warnings || [], orderSheet: data.orderSheet || '',
        primerMatches: matches, junctions: updatedJunctions, calculated: true, protocolSteps: pSteps });
    } catch (e) {
      updateAssembly(asmId, { apiWarnings: [`API error: ${e.message}`] });
    }
    setLoading(false);
  };

  // ═══════════ Fragment split ═══════════
  const handleFragmentSplit = (result) => {
    const idx = splitTarget; if (idx === null) return;
    const nf = [...fragments]; const frag = nf[idx];
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
    updateActive({ fragments: nf, junctions: mkJunctions(nf, assemblyType, circular), calculated: false });
    setSplitTarget(null);
  };

  const handleMutagenesis = (result) => {
    updateActive({ fragments: result.fragments.map(f => ({ ...f, id: `mf${nextId++}`, isMutagenesis: true })),
      junctions: result.junctions, calculated: false, primers: [] });
  };

  const handleReusePrimer = (primerName, existingPrimer) => {
    updateActive({ primers: primers.map(p => p.name === primerName ? { ...p, reused: true, reusedFrom: existingPrimer.name } : p) });
  };

  // ═══════════ Domain editing ═══════════
  const handleSaveDomains = (domains) => {
    if (domainTarget === null) return;
    updateActive({
      fragments: fragments.map((f, idx) => idx === domainTarget ? { ...f, domains } : f),
    });
    setDomainTarget(null);
  };

  // ═══════════ Assembly management ═══════════
  const addAssembly = () => {
    const id = `asm_${Date.now()}`;
    const num = assemblies.length + 1;
    setAssemblies(prev => [...prev, newAssembly(id, `Сборка ${num}`)]);
    setActiveId(id); setSplitTarget(null); setShowMutagenesis(false);
  };

  const removeAssembly = (id) => {
    if (assemblies.length <= 1) return;
    const remaining = assemblies.filter(a => a.id !== id);
    setAssemblies(remaining);
    if (activeId === id) setActiveId(remaining[0].id);
  };

  const renameAssembly = (id, name) => { updateAssembly(id, { name }); };

  const switchAssembly = (id) => { setActiveId(id); setSplitTarget(null); setShowMutagenesis(false); };

  const setAssemblyType_ = (type) => {
    updateActive({ assemblyType: type, junctions: junctions.map(j => ({ ...j, type: type === 'golden_gate' ? 'golden_gate' : 'overlap' })) });
  };

  const completeAssembly = () => {
    const fullSeq = fragments.map(f => f.sequence || '').join('');
    const totalLen = fullSeq.length;
    const productType = circular ? 'plasmid' : 'pcr_product';

    // Build sub-fragments for striped visualization
    const subFragments = fragments.map(f => ({
      name: f.name, type: f.type, length: f.length,
      color: isMarker(f.name) ? '#F0E442' : getFragColor(f.type, fragments.indexOf(f)),
      pct: (f.length / totalLen) * 100,
    }));

    const mergedProduct = {
      id: `product_${Date.now()}`, name: active.name,
      type: productType, sequence: fullSeq, length: totalLen,
      strand: 1, needsAmplification: false,
      subFragments,
      sourceType: 'assembly', sourceAssemblyId: active.id,
      components: fragments.map(f => f.name),
      completedAt: new Date().toISOString(),
    };

    // Save to inventory
    addToInventory({ ...mergedProduct, verified: circular });
    // Save to parts library
    setParts(prev => {
      if (prev.some(p => p.name === active.name && p.sourceAssemblyId === active.id)) return prev;
      return [...prev, mergedProduct];
    });

    // Replace canvas: keep originals, show merged product
    updateActive({
      completed: true,
      product: mergedProduct,
      originalFragments: fragments,
      originalJunctions: junctions,
      fragments: [mergedProduct],
      junctions: [],
    });
    setInventoryVersion(v => v + 1);
  };

  const clearAssembly = () => {
    updateActive({ fragments: [], junctions: [], primers: [], apiWarnings: [], orderSheet: '',
      calculated: false, protocolSteps: [], completed: false, product: null });
  };

  // ═══════════ Experiment management ═══════════
  const createExperiment = () => {
    const name = prompt('Название эксперимента:', `Эксперимент ${experiments.length + 1}`);
    if (!name) return;
    const exp = newExperiment(`exp_${Date.now()}`, name);
    setExperiments(prev => [...prev, exp]);
    setActiveExpId(exp.id);
    setActiveId(exp._firstAsmId);
  };

  const switchExperiment = (expId) => {
    const exp = experiments.find(e => e.id === expId);
    setActiveExpId(expId);
    if (exp?.assemblies?.length) setActiveId(exp.assemblies[0].id);
    setSplitTarget(null); setShowMutagenesis(false);
  };

  // ═══════════ Render ═══════════
  return (
    <DndProvider backend={HTML5Backend}>
      <div className="h-screen flex flex-col">
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
            <span className="text-xs text-gray-400">{t('Assembly:')}</span>
            <button onClick={() => setAssemblyType_('overlap')}
              className={`text-xs px-3 py-1.5 rounded-full font-semibold transition
                ${assemblyType === 'overlap' ? 'bg-blue-500 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}>
              Overlap / Gibson
            </button>
            <button onClick={() => setAssemblyType_('golden_gate')}
              className={`text-xs px-3 py-1.5 rounded-full font-semibold transition
                ${assemblyType === 'golden_gate' ? 'bg-amber-500 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}>
              Golden Gate
            </button>
            <button onClick={() => setShowMutagenesis(true)}
              className="text-xs px-3 py-1.5 rounded-full font-semibold bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 transition">
              {'🔬'} {t('Mutagenesis')}
            </button>
            <div className="w-px h-4 bg-white/15 mx-1" />
            <button onClick={() => setShowOligos(true)}
              className="text-xs px-2 py-1 rounded bg-white/10 text-gray-300 hover:bg-white/20 transition">
              {'📋'} Олиги
            </button>
            <button onClick={() => setShowPartsLib(true)}
              className="text-xs px-2 py-1 rounded bg-white/10 text-gray-300 hover:bg-white/20 transition">
              {'📦'} Запчасти
            </button>
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
            {fragments.length > 0 && (
              <button onClick={clearAssembly} className="text-xs px-2 py-1 text-red-400 hover:bg-red-500/20 rounded ml-1">
                {t('Clear')}
              </button>
            )}
          </div>
        </header>

        {/* Experiment selector */}
        <ExperimentSelector
          experiments={experiments}
          activeExpId={activeExpId}
          onSelect={switchExperiment}
          onCreate={createExperiment}
        />

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
          <PartsPalette parts={parts} onOpenModal={setModalMode} onOpenLibrary={() => setShowPartsLib(true)} inventoryVersion={inventoryVersion} />
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
                      // Expand: restore original fragments
                      updateActive({ fragments: active.originalFragments, junctions: active.originalJunctions || [] });
                    } else {
                      // Collapse: back to merged product
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
              onEditDomains={setDomainTarget} primers={primers} />

            {fragments.length >= 2 && !active.completed && (
              <div className="flex items-center justify-center gap-3">
                <button onClick={generate} disabled={loading}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 transition disabled:opacity-50">
                  {loading ? t('Calculating...') : t('Generate Primers')}
                </button>
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
                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition w-full">
                    {'✅'} Сборка завершена {'—'} создать продукт
                  </button>
                )}
              </>
            )}
            {activeTab === 'stats' && (
              <ExperimentStats assemblies={allAssemblies} />
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
      {domainTarget !== null && fragments[domainTarget]?.type === 'CDS' && (
        <CDSEditor
          fragment={fragments[domainTarget]}
          onSave={handleSaveDomains}
          onClose={() => setDomainTarget(null)}
        />
      )}
      {showPartsLib && (
        <PartsLibrary parts={parts} onClose={() => setShowPartsLib(false)}
          onOpenCDSEditor={(part) => { setGlobalCDSPart(part); setShowPartsLib(false); }}
          onAddToCanvas={(part) => addFragment(part)}
          onUpdatePart={(id, data) => {
            setParts(prev => prev.map(p => p.id === id ? { ...p, ...data } : p));
          }} />
      )}
      {globalCDSPart && (
        <CDSEditor
          fragment={globalCDSPart}
          onSave={(domains) => {
            // Update part in parts library
            setParts(prev => prev.map(p => p.id === globalCDSPart.id ? { ...p, domains } : p));
            // Update on canvas if present
            const idx = fragments.findIndex(f => f.id === globalCDSPart.id || f.name === globalCDSPart.name);
            if (idx >= 0) updateActive({ fragments: fragments.map((f, i) => i === idx ? { ...f, domains } : f) });
            setGlobalCDSPart(null);
          }}
          onClose={() => setGlobalCDSPart(null)}
        />
      )}
      {showOligos && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 bg-black/30"
          onClick={() => setShowOligos(false)}>
          <div className="w-[900px] max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <OligoManager assemblies={allAssemblies} onClose={() => setShowOligos(false)} />
          </div>
        </div>
      )}
    </DndProvider>
  );
}
