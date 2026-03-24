import { useState, useEffect, useCallback } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import PartsPalette from './components/PartsPalette';
import DesignCanvas from './components/DesignCanvas';
import PrimerPanel from './components/PrimerPanel';
import SequenceViewer from './components/SequenceViewer';
import { fetchParts, designPrimers } from './api';

const METHODS = [
  { id: 'overlap_pcr', label: 'Overlap PCR', olLen: 30, tm: 62 },
  { id: 'gibson', label: 'Gibson', olLen: 35, tm: 55 },
  { id: 'golden_gate', label: 'Golden Gate', olLen: 0, tm: 0 },
];

let nextId = 1;

export default function App() {
  const [parts, setParts] = useState([]);
  const [fragments, setFragments] = useState([]);
  const [junctions, setJunctions] = useState([]);
  const [method, setMethod] = useState('overlap_pcr');
  const [primers, setPrimers] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [orderSheet, setOrderSheet] = useState('');
  const [circular, setCircular] = useState(false);
  const [calculated, setCalculated] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchParts().then(setParts).catch(() => {
      setParts([
        { id: 'd1', name: 'PglaA', type: 'promoter', sequence: 'ATCG'.repeat(212), length: 850, organism: 'A. niger' },
        { id: 'd2', name: 'XynTL', type: 'CDS', sequence: 'ATGC'.repeat(225), length: 900, organism: 'T. lanuginosus' },
        { id: 'd3', name: 'TtrpC', type: 'terminator', sequence: 'GCTA'.repeat(185), length: 740, organism: 'A. nidulans' },
        { id: 'd4', name: 'HygR', type: 'CDS', sequence: 'ATCG'.repeat(256), length: 1026, organism: 'E. coli' },
        { id: 'd5', name: 'PgpdA', type: 'promoter', sequence: 'GCGC'.repeat(135), length: 540, organism: 'A. nidulans' },
        { id: 'd6', name: 'pyrG', type: 'CDS', sequence: 'TAGC'.repeat(241), length: 966, organism: 'A. fumigatus' },
      ]);
    });
  }, []);

  const mkJunctions = useCallback((frags, m, isCirc = circular) => {
    const info = METHODS.find(x => x.id === m) || METHODS[0];
    const count = isCirc ? frags.length : Math.max(0, frags.length - 1);
    return Array.from({ length: count }, (_, i) => ({
      type: m === 'golden_gate' ? 'golden_gate' : 'overlap',
      overlapMode: 'split',
      overlapLength: info.olLen,
      tmTarget: info.tm,
      enzyme: 'BsaI',
      overhang: '',
    }));
  }, []);

  const addFragment = (part) => {
    const frag = {
      id: `f${nextId++}`, name: part.name, type: part.type,
      sequence: part.sequence || '', length: part.length || 0,
      strand: 1, needsAmplification: true,
    };
    const nf = [...fragments, frag];
    setFragments(nf);
    setJunctions(j => {
      const nj = [...j];
      if (nf.length > 1) {
        const info = METHODS.find(x => x.id === method) || METHODS[0];
        nj.push({
          type: method === 'golden_gate' ? 'golden_gate' : 'overlap',
          overlapMode: 'split', overlapLength: info.olLen, tmTarget: info.tm,
          enzyme: 'BsaI', overhang: '',
        });
      }
      return nj;
    });
  };

  const removeFragment = (index) => {
    const nf = fragments.filter((_, i) => i !== index);
    setFragments(nf);
    setJunctions(mkJunctions(nf, method, circular));
  };

  const toggleCircular = () => {
    const next = !circular;
    setCircular(next);
    setJunctions(mkJunctions(fragments, method, next));
  };

  const toggleAmplification = (index) => {
    const nf = [...fragments];
    nf[index] = { ...nf[index], needsAmplification: !nf[index].needsAmplification };
    setFragments(nf);
  };

  const updateJunction = (index, config) => {
    const nj = [...junctions]; nj[index] = config; setJunctions(nj);
  };

  const reorderFragments = (fromIndex, toIndex) => {
    const nf = [...fragments];
    const [moved] = nf.splice(fromIndex, 1);
    nf.splice(toIndex, 0, moved);
    setFragments(nf);
    setJunctions(mkJunctions(nf, method, circular));
  };

  const changeMethod = (m) => {
    setMethod(m);
    setJunctions(prev => {
      const info = METHODS.find(x => x.id === m);
      return prev.map(j => ({
        ...j, type: m === 'golden_gate' ? 'golden_gate' : 'overlap',
        overlapLength: info.olLen || j.overlapLength, tmTarget: info.tm || j.tmTarget,
      }));
    });
  };

  const generate = async () => {
    if (fragments.length < 2) return;
    setLoading(true);
    try {
      const data = await designPrimers(
        fragments.map(f => ({ name: f.name, sequence: f.sequence, needsAmplification: f.needsAmplification })),
        junctions, method, circular, 60,
      );
      setPrimers(data.primers || []);
      setWarnings(data.warnings || []);
      setOrderSheet(data.orderSheet || '');
      // Merge junction overlap data from API response
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
      setWarnings([`API error: ${e.message}`]);
    }
    setLoading(false);
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="h-screen flex flex-col">
        <header className="bg-white border-b px-6 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-lg">&#x1F9EC;</span>
            <h1 className="text-lg font-bold text-gray-800">Construct Designer</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 mr-1">Method:</span>
            {METHODS.map(m => (
              <button key={m.id} onClick={() => changeMethod(m.id)}
                className={`text-xs px-3 py-1.5 rounded-full font-semibold transition
                  ${method === m.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {m.label}
              </button>
            ))}
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <PartsPalette parts={parts} />
          <div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto">
            <DesignCanvas fragments={fragments} junctions={junctions}
              circular={circular} onToggleCircular={toggleCircular}
              onDrop={addFragment} onRemove={removeFragment}
              onToggleAmplification={toggleAmplification} onJunctionChange={updateJunction}
              onReorder={reorderFragments} calculated={calculated} />

            {fragments.length >= 2 && (
              <button onClick={generate} disabled={loading}
                className="self-center px-6 py-2 bg-blue-600 text-white rounded-lg
                  font-semibold text-sm hover:bg-blue-700 transition disabled:opacity-50">
                {loading ? 'Calculating...' : 'Generate Primers'}
              </button>
            )}

            {fragments.length > 0 && (
              <SequenceViewer fragments={fragments} circular={circular} primers={primers} />
            )}

            <PrimerPanel primers={primers} warnings={warnings} orderSheet={orderSheet} />
          </div>
        </div>
      </div>
    </DndProvider>
  );
}
