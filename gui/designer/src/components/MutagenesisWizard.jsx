import { useState, useEffect, useMemo } from 'react';
import { translateDNA, getCodonsForAA, AA_NAMES, ORGANISMS, translateCodon } from '../codons';
import { computeMutagenesisStrategy, chooseStrategy, validateMutations } from '../mutagenesis';
import { fetchConstructs, fetchFeatures } from '../api';

const STRAT_LABELS = { kld: 'KLD (back-to-back primers)', two_fragment: '2-fragment overlap PCR', multi_fragment: 'Multi-fragment overlap PCR' };

export default function MutagenesisWizard({ onComplete, onClose }) {
  const [step, setStep] = useState(1);
  const [templateSeq, setTemplateSeq] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [organism, setOrganism] = useState('E. coli');
  const [cdsStart, setCdsStart] = useState(0);
  const [cdsEnd, setCdsEnd] = useState(0);
  const [mutations, setMutations] = useState([]);
  const [strategy, setStrategy] = useState(null);

  // Construct loading
  const [constructs, setConstructs] = useState([]);
  const [features, setFeatures] = useState([]);
  const [selConstruct, setSelConstruct] = useState(null);

  useEffect(() => { fetchConstructs().then(setConstructs).catch(() => {}); }, []);
  useEffect(() => {
    if (selConstruct) fetchFeatures(selConstruct.id).then(setFeatures).catch(() => {});
  }, [selConstruct]);

  const protein = useMemo(() => {
    if (!templateSeq || cdsEnd <= cdsStart) return '';
    return translateDNA(templateSeq.slice(cdsStart, cdsEnd));
  }, [templateSeq, cdsStart, cdsEnd]);

  const validationWarnings = useMemo(() =>
    mutations.length > 0 ? validateMutations(templateSeq, mutations, cdsStart) : [],
    [templateSeq, mutations, cdsStart]);

  const addMutation = () => {
    setMutations([...mutations, {
      id: Date.now(), type: 'substitution', aaPosition: 1,
      currentAA: protein[0] || '?', newAA: 'A', newCodon: '',
      dnaPosition: cdsStart, label: '', deleteLength: 3, insertSequence: '',
    }]);
  };

  const updateMut = (idx, field, val) => {
    const ms = [...mutations];
    ms[idx] = { ...ms[idx], [field]: val };
    // Auto-compute derived fields
    const m = ms[idx];
    if (field === 'aaPosition' || field === 'type') {
      m.dnaPosition = cdsStart + ((m.aaPosition - 1) * 3);
      if (m.aaPosition <= protein.length) m.currentAA = protein[m.aaPosition - 1];
    }
    if (field === 'newAA') {
      m.newCodon = getCodonsForAA(val, organism)[0]?.codon || 'NNN';
    }
    m.label = m.type === 'substitution' ? `${m.currentAA}${m.aaPosition}${m.newAA}`
      : m.type === 'deletion' ? `\u0394${m.aaPosition}-${m.aaPosition + Math.floor((m.deleteLength || 3) / 3)}`
      : `ins${m.aaPosition}`;
    ms[idx] = m;
    setMutations(ms);
  };

  const compute = () => {
    if (!templateSeq || mutations.length === 0) return;
    const result = computeMutagenesisStrategy(templateSeq, mutations, {
      featureStart: cdsStart, featureEnd: cdsEnd,
    });
    setStrategy(result);
    setStep(3);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[700px] max-h-[85vh] overflow-y-auto p-6"
        onClick={e => e.stopPropagation()}>

        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">{'\uD83D\uDD2C'} Mutagenesis Wizard</h2>
          <div className="flex gap-1">
            {[1, 2, 3].map(s => (
              <div key={s} className={`w-8 h-1.5 rounded ${s <= step ? 'bg-purple-500' : 'bg-gray-200'}`} />
            ))}
          </div>
        </div>

        {/* ── Step 1: Template ── */}
        {step === 1 && (<>
          <h3 className="text-sm font-semibold mb-3">Step 1: Select Template</h3>

          <div className="flex gap-2 mb-3">
            <select value={selConstruct?.id || ''} onChange={e => setSelConstruct(constructs.find(c => c.id === e.target.value))}
              className="flex-1 border rounded p-2 text-sm">
              <option value="">Select from database...</option>
              {constructs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={organism} onChange={e => setOrganism(e.target.value)} className="border rounded p-2 text-sm w-32">
              {ORGANISMS.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>

          {features.length > 0 && (
            <div className="mb-3">
              <div className="text-xs text-gray-500 mb-1">Select CDS to mutate:</div>
              <div className="flex flex-wrap gap-1">
                {features.filter(f => f.type === 'CDS').map(f => (
                  <button key={f.name} onClick={() => {
                    setTemplateName(f.name);
                    setTemplateSeq(f.sequence || '');
                    setCdsStart(0); setCdsEnd((f.sequence || '').length);
                  }}
                    className={`text-xs px-2 py-1 rounded border ${
                      templateName === f.name ? 'bg-purple-100 border-purple-400' : 'border-gray-200'}`}>
                    {f.name} ({f.length}bp)
                  </button>
                ))}
              </div>
            </div>
          )}

          <textarea value={templateSeq} onChange={e => {
            const s = e.target.value.replace(/[^ATCGatcg]/g, '').toUpperCase();
            setTemplateSeq(s); setCdsStart(0); setCdsEnd(s.length);
          }}
            placeholder="Or paste template DNA sequence..."
            className="w-full border rounded p-2 text-sm font-mono h-20 mb-3" />

          {templateSeq && (
            <div className="text-xs text-gray-500 mb-3">
              {templateSeq.length} bp | {protein.length} aa | Organism: {organism}
            </div>
          )}

          <button onClick={() => { if (templateSeq) setStep(2); }} disabled={!templateSeq}
            className="w-full bg-purple-600 text-white rounded py-2 text-sm font-semibold disabled:opacity-40">
            Next: Define Mutations {'\u2192'}
          </button>
        </>)}

        {/* ── Step 2: Define Mutations ── */}
        {step === 2 && (<>
          <h3 className="text-sm font-semibold mb-3">Step 2: Define Mutations in {templateName || 'template'}</h3>

          {/* Gene map */}
          <div className="bg-gray-50 rounded p-2 mb-3 font-mono text-[10px]">
            <div className="flex items-center">
              <span className="text-gray-400 mr-1">1</span>
              <div className="flex-1 h-3 bg-orange-200 rounded relative">
                {mutations.map((m, i) => {
                  const pct = ((m.aaPosition - 1) / Math.max(protein.length, 1)) * 100;
                  return <div key={i} className="absolute top-0 w-0.5 h-full bg-red-500"
                    style={{ left: `${pct}%` }} title={m.label} />;
                })}
              </div>
              <span className="text-gray-400 ml-1">{protein.length}</span>
            </div>
            <div className="flex justify-between text-gray-400 mt-0.5">
              <span>N-term</span><span>{templateName}</span><span>C-term</span>
            </div>
          </div>

          {/* Mutation table */}
          {mutations.map((m, i) => (
            <div key={m.id} className="border rounded p-3 mb-2 bg-white">
              <div className="flex gap-2 items-start">
                <select value={m.type} onChange={e => updateMut(i, 'type', e.target.value)}
                  className="border rounded p-1 text-xs w-28">
                  <option value="substitution">Substitution</option>
                  <option value="deletion">Deletion</option>
                  <option value="insertion">Insertion</option>
                </select>

                {m.type === 'substitution' && (<>
                  <div className="text-xs">
                    <label className="text-gray-500 block">Position</label>
                    <input type="number" value={m.aaPosition} min={1} max={protein.length}
                      onChange={e => updateMut(i, 'aaPosition', +e.target.value)}
                      className="w-16 border rounded p-1" />
                  </div>
                  <div className="text-xs text-center">
                    <label className="text-gray-500 block">Current</label>
                    <span className="font-bold text-lg">{m.currentAA}</span>
                    <span className="text-gray-400 ml-1">{AA_NAMES[m.currentAA]}</span>
                  </div>
                  <span className="text-lg mt-3">{'\u2192'}</span>
                  <div className="text-xs">
                    <label className="text-gray-500 block">New AA</label>
                    <select value={m.newAA} onChange={e => updateMut(i, 'newAA', e.target.value)}
                      className="border rounded p-1">
                      {Object.entries(AA_NAMES).filter(([k]) => k !== '*').map(([k, v]) => (
                        <option key={k} value={k}>{k} ({v})</option>
                      ))}
                    </select>
                  </div>
                  <div className="text-xs">
                    <label className="text-gray-500 block">Codon</label>
                    <select value={m.newCodon} onChange={e => updateMut(i, 'newCodon', e.target.value)}
                      className="border rounded p-1 font-mono">
                      {getCodonsForAA(m.newAA, organism).map(c => (
                        <option key={c.codon} value={c.codon}>{c.codon} ({c.frequency}/1000)</option>
                      ))}
                    </select>
                  </div>
                </>)}

                {m.type === 'deletion' && (<>
                  <div className="text-xs">
                    <label className="text-gray-500 block">From aa</label>
                    <input type="number" value={m.aaPosition} min={1} max={protein.length}
                      onChange={e => updateMut(i, 'aaPosition', +e.target.value)}
                      className="w-16 border rounded p-1" />
                  </div>
                  <div className="text-xs">
                    <label className="text-gray-500 block">Delete bp</label>
                    <input type="number" value={m.deleteLength} min={1}
                      onChange={e => updateMut(i, 'deleteLength', +e.target.value)}
                      className="w-16 border rounded p-1" />
                  </div>
                </>)}

                {m.type === 'insertion' && (<>
                  <div className="text-xs">
                    <label className="text-gray-500 block">After aa</label>
                    <input type="number" value={m.aaPosition} min={1} max={protein.length}
                      onChange={e => updateMut(i, 'aaPosition', +e.target.value)}
                      className="w-16 border rounded p-1" />
                  </div>
                  <div className="text-xs flex-1">
                    <label className="text-gray-500 block">Insert DNA</label>
                    <input value={m.insertSequence} placeholder="CACCATCACCATCACCAT (6xHis)"
                      onChange={e => updateMut(i, 'insertSequence', e.target.value.toUpperCase().replace(/[^ATCG]/g, ''))}
                      className="w-full border rounded p-1 font-mono" />
                  </div>
                </>)}

                <button onClick={() => setMutations(mutations.filter((_, j) => j !== i))}
                  className="text-red-400 text-xs mt-4">{'\u2716'}</button>
              </div>
              {m.label && <div className="text-xs text-purple-600 font-semibold mt-1">{m.label}</div>}
            </div>
          ))}

          <button onClick={addMutation} className="text-xs text-purple-600 mb-3">+ Add mutation</button>

          {/* Strategy preview */}
          {mutations.length > 0 && (
            <div className="bg-purple-50 rounded p-2 mb-3 text-xs">
              <strong>Strategy:</strong> {STRAT_LABELS[chooseStrategy(mutations)]}
              {validationWarnings.map((w, i) => <div key={i} className="text-amber-700 mt-1">{w}</div>)}
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => setStep(1)} className="flex-1 border rounded py-2 text-sm">{'\u2190'} Back</button>
            <button onClick={compute} disabled={mutations.length === 0}
              className="flex-1 bg-purple-600 text-white rounded py-2 text-sm font-semibold disabled:opacity-40">
              Compute Strategy {'\u2192'}
            </button>
          </div>
        </>)}

        {/* ── Step 3: Review + Apply ── */}
        {step === 3 && strategy && (<>
          <h3 className="text-sm font-semibold mb-3">Step 3: Review Strategy</h3>

          <div className="bg-purple-50 border border-purple-200 rounded p-3 mb-3">
            <div className="text-sm font-bold text-purple-800 mb-1">{STRAT_LABELS[strategy.strategy]}</div>
            <div className="text-xs text-purple-700">
              {strategy.fragments.length} fragment(s) | {strategy.mutations.length} mutation(s)
            </div>
            <div className="text-xs text-gray-600 mt-1">{strategy.protocol}</div>
          </div>

          {/* Fragments */}
          <div className="mb-3">
            <div className="text-xs font-semibold text-gray-600 mb-1">Fragments:</div>
            {strategy.fragments.map((f, i) => (
              <div key={i} className="text-xs bg-white border rounded p-2 mb-1">
                <strong>{f.name}</strong> \u2014 {f.length} bp
                {f.needsAmplification ? ' (PCR from template)' : ''}
              </div>
            ))}
          </div>

          {/* Junctions with mutations */}
          {strategy.junctions.filter(j => j.containsMutation).map((j, i) => (
            <div key={i} className="text-xs bg-purple-50 border border-purple-200 rounded p-2 mb-1">
              <span className="text-purple-700 font-bold">{j.mutationLabel || j.mutation?.label}</span>
              {j.overlapSequence && <span className="font-mono ml-2 text-[10px]">{j.overlapSequence}</span>}
            </div>
          ))}

          {/* Warnings */}
          {strategy.warnings.map((w, i) => (
            <div key={i} className="text-xs text-amber-700 bg-amber-50 rounded p-2 mb-1">{w}</div>
          ))}

          <div className="flex gap-2 mt-4">
            <button onClick={() => setStep(2)} className="flex-1 border rounded py-2 text-sm">{'\u2190'} Back</button>
            <button onClick={() => {
              onComplete({
                fragments: strategy.fragments.map((f, i) => ({
                  ...f, id: `mut_${i}`, isMutagenesis: true,
                })),
                junctions: strategy.junctions,
                isMutagenesis: true,
                mutantSequence: strategy.mutantSequence,
                mutations: strategy.mutations,
              });
              onClose();
            }}
              className="flex-1 bg-purple-600 text-white rounded py-2 text-sm font-semibold">
              {'\u2705'} Apply to Canvas
            </button>
          </div>
        </>)}
      </div>
    </div>
  );
}
