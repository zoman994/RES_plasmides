import { useState, useEffect, useCallback, useMemo } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import PartsPalette from './components/PartsPalette';
import DesignCanvas from './components/DesignCanvas';
import PrimerPanel from './components/PrimerPanel';
import SequenceViewer from './components/SequenceViewer';
import AddFragmentModal from './components/AddFragmentModal';
import RestrictionPanel from './components/RestrictionPanel';
import MutagenesisWizard from './components/MutagenesisWizard';
import VerificationPanel from './components/VerificationPanel';
import SignalPeptideSplitter from './components/SignalPeptideSplitter';
import { fetchParts, designPrimers } from './api';
import { validateConstruct, checkPrimerQuality, pcrProductSize } from './validate';
import { exportGenBank, exportProtocol, saveToPVCS } from './exports';

const LS_KEY = 'pvcs_designer_state';
let nextId = 1;

export default function App() {
  const [parts, setParts] = useState([]);
  const [fragments, setFragments] = useState([]);
  const [junctions, setJunctions] = useState([]);
  const [assemblyType, setAssemblyType] = useState('overlap'); // 'overlap' | 'golden_gate'
  const [protocol, setProtocol] = useState('overlap_pcr'); // for export: overlap_pcr | gibson | infusion
  const [primers, setPrimers] = useState([]);
  const [apiWarnings, setApiWarnings] = useState([]);
  const [orderSheet, setOrderSheet] = useState('');
  const [circular, setCircular] = useState(false);
  const [calculated, setCalculated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [modalMode, setModalMode] = useState(null);
  const [splitTarget, setSplitTarget] = useState(null);
  const [showMutagenesis, setShowMutagenesis] = useState(false);
  const [polymerase, setPolymerase] = useState('phusion');
  const [primerPrefix, setPrimerPrefix] = useState('IS');

  // Multi-step
  const [steps, setSteps] = useState([]);
  const [activeStep, setActiveStep] = useState(-1); // -1 = main canvas

  // ── Restore from localStorage on mount ──
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) {
        const s = JSON.parse(saved);
        if (s.fragments?.length) { setFragments(s.fragments); nextId = s.fragments.length + 1; }
        if (s.junctions) setJunctions(s.junctions);
        if (s.assemblyType) setAssemblyType(s.assemblyType);
        else if (s.method) setAssemblyType(s.method === 'golden_gate' ? 'golden_gate' : 'overlap');
        if (s.protocol) setProtocol(s.protocol);
        if (s.circular !== undefined) setCircular(s.circular);
      }
    } catch {}
  }, []);

  // ── Save to localStorage on change ──
  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify({ fragments, junctions, assemblyType, protocol, circular }));
  }, [fragments, junctions, assemblyType, protocol, circular]);

  // ── Load parts ──
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

  // ── Construct validation warnings ──
  const constructWarnings = useMemo(() => validateConstruct(fragments), [fragments]);

  // ── Primer quality warnings ──
  const primerQuality = useMemo(() =>
    primers.map(p => ({ name: p.name, warnings: checkPrimerQuality(p) }))
      .filter(pq => pq.warnings.length > 0),
    [primers]);

  // ── PCR product sizes ──
  const pcrSizes = useMemo(() =>
    fragments.map((f, i) => {
      const leftJ = i > 0 ? junctions[i - 1] : (circular ? junctions[junctions.length - 1] : null);
      const rightJ = i < junctions.length ? junctions[i] : (circular ? junctions[0] : null);
      return pcrProductSize(f, leftJ, rightJ);
    }),
    [fragments, junctions, circular]);

  // ── Junction helpers ──
  const mkJunctions = useCallback((frags, asmType = assemblyType, isCirc = circular) => {
    const count = isCirc ? frags.length : Math.max(0, frags.length - 1);
    return Array.from({ length: count }, () => ({
      type: asmType === 'golden_gate' ? 'golden_gate' : 'overlap',
      overlapMode: 'split', overlapLength: 30, tmTarget: 62,
      enzyme: 'BsaI', overhang: '',
    }));
  }, [assemblyType, circular]);

  const addFragment = (part) => {
    const frag = {
      id: `f${nextId++}`, name: part.name, type: part.type,
      sequence: part.sequence || '', length: part.length || 0,
      strand: 1, needsAmplification: true,
    };
    const nf = [...fragments, frag];
    setFragments(nf);
    setCalculated(false);
    setJunctions(j => {
      if (nf.length > 1) {
        return [...j, {
          type: assemblyType === 'golden_gate' ? 'golden_gate' : 'overlap',
          overlapMode: 'split', overlapLength: 30, tmTarget: 62,
          enzyme: 'BsaI', overhang: '',
        }];
      }
      return j;
    });
  };

  const removeFragment = (i) => {
    setFragments(f => f.filter((_, idx) => idx !== i));
    setJunctions(j => mkJunctions(fragments.filter((_, idx) => idx !== i), assemblyType, circular));
    setCalculated(false);
  };

  const toggleCircular = () => {
    const next = !circular;
    setCircular(next);
    setJunctions(mkJunctions(fragments, assemblyType, next));
    setCalculated(false);
  };

  const toggleAmplification = (i) => {
    setFragments(f => f.map((x, idx) => idx === i ? { ...x, needsAmplification: !x.needsAmplification } : x));
  };

  const updateJunction = (i, cfg) => {
    setJunctions(j => j.map((x, idx) => idx === i ? cfg : x));
    setCalculated(false);
  };

  const reorderFragments = (from, to) => {
    const nf = [...fragments];
    const [moved] = nf.splice(from, 1);
    nf.splice(to, 0, moved);
    setFragments(nf);
    setJunctions(mkJunctions(nf, assemblyType, circular));
    setCalculated(false);
  };


  const generate = async () => {
    if (fragments.length < 2) return;
    setLoading(true);
    try {
      const data = await designPrimers(
        fragments.map(f => ({ name: f.name, sequence: f.sequence, needsAmplification: f.needsAmplification })),
        junctions, assemblyType === 'golden_gate' ? 'golden_gate' : 'overlap_pcr', circular, 60,
      );
      // Rename primers with prefix and apply polymerase Tm correction
      const tmAdj = { phusion: 3, kod: 2, taq: -5 }[polymerase] || 0;
      let pidx = 1;
      const renamedPrimers = (data.primers || []).map(p => ({
        ...p,
        name: `${primerPrefix}${String(pidx++).padStart(3, '0')}_${p.name}`,
        tmAdjusted: Math.round((p.tmBinding || 60) + tmAdj),
      }));
      setPrimers(renamedPrimers);
      setApiWarnings(data.warnings || []);
      setOrderSheet(data.orderSheet || '');
      if (data.junctions) {
        setJunctions(prev => prev.map((j, i) => ({
          ...j,
          overlapSequence: data.junctions[i]?.overlapSequence || j.overlapSequence,
          overlapTm: data.junctions[i]?.overlapTm || j.overlapTm,
          overlapGc: data.junctions[i]?.overlapGc || j.overlapGc,
        })));
      }
      setCalculated(true);
    } catch (e) {
      setApiWarnings([`API error: ${e.message}`]);
    }
    setLoading(false);
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
    setFragments(nf);
    setCalculated(false);
    if (nf.length > 1) {
      setJunctions(j => [...j, {
        type: assemblyType === 'golden_gate' ? 'golden_gate' : 'overlap',
        overlapMode: 'split', overlapLength: 30, tmTarget: 62,
        enzyme: 'BsaI', overhang: '',
      }]);
    }
  };

  const handleSignalSplit = (result) => {
    const idx = splitTarget;
    if (idx === null) return;
    const nf = [...fragments];
    if (result.action === 'remove') {
      nf[idx] = { ...nf[idx], name: result.matureName, sequence: result.matureDNA, length: result.matureDNA.length };
    } else if (result.action === 'replace') {
      const sp = { id: `f${nextId++}`, name: result.signalPart.name, type: 'CDS',
        sequence: result.signalPart.sequence || '', length: result.signalPart.length || 0,
        strand: 1, needsAmplification: true };
      nf[idx] = { ...nf[idx], name: result.matureName, sequence: result.matureDNA, length: result.matureDNA.length };
      nf.splice(idx, 0, sp);
    } else if (result.action === 'split_only') {
      const sp = { id: `f${nextId++}`, name: result.signalName, type: 'CDS',
        sequence: result.signalDNA, length: result.signalDNA.length, strand: 1, needsAmplification: true };
      nf[idx] = { ...nf[idx], name: result.matureName, sequence: result.matureDNA, length: result.matureDNA.length };
      nf.splice(idx, 0, sp);
    }
    setFragments(nf);
    setJunctions(mkJunctions(nf, assemblyType, circular));
    setSplitTarget(null);
    setCalculated(false);
  };

  const handleMutagenesis = (result) => {
    const newFrags = result.fragments.map((f, i) => ({
      ...f, id: `mf${nextId++}`, isMutagenesis: true,
    }));
    setFragments(newFrags);
    setJunctions(result.junctions);
    setCalculated(false);
    setPrimers([]);
  };

  const clearAll = () => {
    setFragments([]); setJunctions([]); setPrimers([]);
    setApiWarnings([]); setCalculated(false);
    localStorage.removeItem(LS_KEY);
  };

  const totalBp = fragments.reduce((s, f) => s + (f.sequence || '').length, 0);

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="h-screen flex flex-col">
        <header className="bg-white border-b px-6 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-lg">&#x1F9EC;</span>
            <h1 className="text-lg font-bold text-gray-800">Construct Designer</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Assembly:</span>
            <button onClick={() => { setAssemblyType('overlap'); setJunctions(j => j.map(x => ({ ...x, type: 'overlap' }))); }}
              className={`text-xs px-3 py-1.5 rounded-full font-semibold transition
                ${assemblyType === 'overlap' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              Overlap / Gibson
            </button>
            <button onClick={() => { setAssemblyType('golden_gate'); setJunctions(j => j.map(x => ({ ...x, type: 'golden_gate' }))); }}
              className={`text-xs px-3 py-1.5 rounded-full font-semibold transition
                ${assemblyType === 'golden_gate' ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              Golden Gate
            </button>
            <button onClick={() => setShowMutagenesis(true)}
              className="text-xs px-3 py-1.5 rounded-full font-semibold bg-purple-100 text-purple-700 hover:bg-purple-200 transition">
              {'\uD83D\uDD2C'} Mutagenesis
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
              <button onClick={clearAll} className="text-xs px-2 py-1 text-red-500 hover:bg-red-50 rounded ml-2">
                Clear
              </button>
            )}
          </div>
        </header>

        {/* Multi-step tabs */}
        {steps.length > 0 && (
          <div className="bg-gray-50 border-b px-6 py-1 flex gap-1 items-center">
            <button onClick={() => setActiveStep(-1)}
              className={`text-xs px-3 py-1 rounded-t border-b-2 ${
                activeStep === -1 ? 'border-blue-500 text-blue-700 font-bold' : 'border-transparent text-gray-500'}`}>
              Main ({fragments.length})
            </button>
            {steps.map((s, i) => (
              <button key={i} onClick={() => setActiveStep(i)}
                className={`text-xs px-3 py-1 rounded-t border-b-2 ${
                  activeStep === i ? 'border-blue-500 text-blue-700 font-bold' : 'border-transparent text-gray-500'}`}>
                {s.name} ({s.fragments?.length || 0})
              </button>
            ))}
            <button onClick={() => {
              setSteps([...steps, { name: `Step ${steps.length + 2}`, fragments: [], junctions: [], assemblyType: 'overlap', circular: false }]);
            }} className="text-xs px-2 py-1 text-gray-400 hover:text-blue-600">+ Step</button>
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          <PartsPalette parts={parts} onOpenModal={setModalMode} />
          <div className="flex-1 flex flex-col p-4 gap-3 overflow-y-auto">

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
              onReorder={reorderFragments} calculated={calculated}
              pcrSizes={pcrSizes} onSplitSignal={setSplitTarget}
              primers={primers} />

            {/* Generate + actions */}
            {fragments.length >= 2 && (
              <div className="flex items-center justify-center gap-3">
                <button onClick={generate} disabled={loading}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg
                    font-semibold text-sm hover:bg-blue-700 transition disabled:opacity-50">
                  {loading ? 'Calculating...' : 'Generate Primers'}
                </button>
              </div>
            )}

            {fragments.length > 0 && (
              <SequenceViewer fragments={fragments} circular={circular} primers={primers} />
            )}

            <PrimerPanel primers={primers} warnings={[...apiWarnings]}
              orderSheet={orderSheet} primerQuality={primerQuality} />

            {/* Analysis panels */}
            {fragments.length > 0 && (
              <RestrictionPanel
                sequence={fragments.map(f => f.sequence || '').join('')}
                fragments={fragments} circular={circular} />
            )}
            {fragments.length > 0 && primers.length > 0 && (
              <VerificationPanel fragments={fragments} circular={circular} />
            )}

            {/* Multi-step: add step button */}
            {fragments.length >= 2 && steps.length === 0 && (
              <button onClick={() => setSteps([{ name: 'Step 2', fragments: [], junctions: [], method: 'overlap_pcr', circular: false }])}
                className="text-xs px-4 py-2 border border-dashed rounded-lg hover:bg-blue-50 text-gray-500 w-full text-left">
                + Add assembly step (multi-step: output of this step feeds into next)
              </button>
            )}

            {/* Export buttons */}
            {primers.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => exportGenBank(fragments, 'designed_construct', circular)}
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
        <SignalPeptideSplitter
          fragment={fragments[splitTarget]}
          onSplit={handleSignalSplit}
          onClose={() => setSplitTarget(null)}
          partsLibrary={parts}
        />
      )}
    </DndProvider>
  );
}
