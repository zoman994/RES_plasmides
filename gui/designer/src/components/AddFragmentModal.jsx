import { useState, useEffect } from 'react';
import { fetchConstructs, fetchFeatures } from '../api';

const COLORS = {
  CDS: '#F5A623', promoter: '#B0B0B0', terminator: '#CC0000',
  rep_origin: '#FFD700', marker: '#31AF31', misc_feature: '#6699CC',
};

/**
 * Modal for adding fragments from various sources:
 * - Paste custom sequence
 * - From PCR product / composite (tube in freezer)
 * - From existing construct (extract feature or region)
 */
export default function AddFragmentModal({ mode, onAdd, onClose }) {
  // mode: 'sequence' | 'composite' | 'construct'
  const [name, setName] = useState('');
  const [sequence, setSequence] = useState('');
  const [needsPCR, setNeedsPCR] = useState(mode !== 'composite');
  const [type, setType] = useState('misc_feature');
  const [note, setNote] = useState('');

  // Construct extraction state
  const [constructs, setConstructs] = useState([]);
  const [selectedConstruct, setSelectedConstruct] = useState(null);
  const [features, setFeatures] = useState([]);

  // Sub-parts for composite
  const [subParts, setSubParts] = useState([]);

  useEffect(() => {
    if (mode === 'construct') {
      fetchConstructs().then(setConstructs).catch(() => {});
    }
  }, [mode]);

  useEffect(() => {
    if (selectedConstruct) {
      fetchFeatures(selectedConstruct.id).then(setFeatures).catch(() => {});
    }
  }, [selectedConstruct]);

  const clean = s => s.replace(/[^ATCGNatcgn]/g, '').toUpperCase();

  const handleAdd = () => {
    if (!name || (!sequence && mode !== 'construct')) return;
    onAdd({
      name,
      sequence: clean(sequence),
      length: clean(sequence).length,
      type,
      needsAmplification: needsPCR,
      sourceType: mode === 'composite' ? 'composite' : mode === 'construct' ? 'construct_feature' : 'sequence',
      sourceDescription: note,
      subParts: subParts.length > 0 ? subParts : undefined,
      strand: 1,
    });
    onClose();
  };

  const extractFeature = (f) => {
    setName(f.name);
    setSequence(f.sequence || '');
    setType(f.type);
    setNote(`Extracted from ${selectedConstruct?.name}`);
    setNeedsPCR(true);
  };

  const addSubPart = () => {
    setSubParts([...subParts, { name: '', type: 'CDS', start: 0, end: 0 }]);
  };

  const titles = {
    sequence: 'Paste Custom Sequence',
    composite: 'From PCR Product / Tube',
    construct: 'Extract from Construct',
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[520px] max-h-[85vh] overflow-y-auto p-6"
        onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-lg mb-4">{titles[mode]}</h3>

        {/* Name + type */}
        <div className="flex gap-2 mb-3">
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="Fragment name"
            className="flex-1 border rounded p-2 text-sm" />
          <select value={type} onChange={e => setType(e.target.value)}
            className="border rounded p-2 text-sm w-32">
            <option value="CDS">CDS</option>
            <option value="promoter">Promoter</option>
            <option value="terminator">Terminator</option>
            <option value="rep_origin">Origin</option>
            <option value="misc_feature">Other</option>
          </select>
        </div>

        {/* ── Paste sequence ── */}
        {(mode === 'sequence' || mode === 'composite') && (
          <textarea value={sequence} onChange={e => setSequence(e.target.value)}
            placeholder="Paste DNA sequence (ATCG only)..."
            className="w-full border rounded p-2 text-sm font-mono h-24 mb-3" />
        )}

        {/* ── Composite: sub-parts annotation ── */}
        {mode === 'composite' && (
          <div className="p-3 bg-gray-50 rounded mb-3">
            <div className="text-xs text-gray-500 mb-2">
              What's inside this product? (optional, for annotation)
            </div>
            {subParts.map((sp, i) => (
              <div key={i} className="flex gap-1 mb-1 items-center">
                <input value={sp.name} placeholder="Name"
                  onChange={e => {
                    const n = [...subParts]; n[i] = { ...n[i], name: e.target.value };
                    setSubParts(n);
                  }}
                  className="flex-1 border rounded p-1 text-xs" />
                <select value={sp.type}
                  onChange={e => {
                    const n = [...subParts]; n[i] = { ...n[i], type: e.target.value };
                    setSubParts(n);
                  }}
                  className="border rounded p-1 text-xs w-24">
                  <option value="CDS">CDS</option>
                  <option value="promoter">Promoter</option>
                  <option value="terminator">Terminator</option>
                </select>
                <button onClick={() => setSubParts(subParts.filter((_, j) => j !== i))}
                  className="text-red-400 text-xs px-1">&times;</button>
              </div>
            ))}
            <button onClick={addSubPart}
              className="text-xs text-blue-600 mt-1">+ Add sub-part</button>
          </div>
        )}

        {/* ── Extract from construct ── */}
        {mode === 'construct' && (
          <div className="mb-3">
            <select value={selectedConstruct?.id || ''}
              onChange={e => setSelectedConstruct(constructs.find(c => c.id === e.target.value))}
              className="w-full border rounded p-2 text-sm mb-2">
              <option value="">Select construct...</option>
              {constructs.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            {features.length > 0 && (
              <div>
                <div className="text-xs text-gray-500 mb-1">Click a feature to extract:</div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {features.map(f => (
                    <button key={`${f.name}-${f.start}`} onClick={() => extractFeature(f)}
                      className="text-xs px-2 py-1 rounded border transition hover:shadow"
                      style={{
                        background: (COLORS[f.type] || '#6699CC') + '20',
                        borderColor: COLORS[f.type] || '#6699CC',
                      }}>
                      {f.name} ({f.length}bp)
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Manual sequence paste for extracted */}
            {name && (
              <textarea value={sequence} onChange={e => setSequence(e.target.value)}
                placeholder="Sequence (auto-filled from feature, or paste manually)"
                className="w-full border rounded p-2 text-sm font-mono h-16" />
            )}
          </div>
        )}

        {/* Note */}
        <input value={note} onChange={e => setNote(e.target.value)}
          placeholder="Note (e.g. 'tube #47 in freezer box 3')"
          className="w-full border rounded p-2 text-sm mb-3" />

        {/* PCR toggle */}
        <label className="flex items-center gap-2 text-sm mb-4">
          <input type="checkbox" checked={needsPCR}
            onChange={e => setNeedsPCR(e.target.checked)} />
          <span>Needs PCR amplification</span>
          <span className="text-[10px] text-gray-400">
            {needsPCR ? '(primers will be generated)' : '(use directly from tube)'}
          </span>
        </label>

        {/* Sequence stats */}
        {sequence && (
          <div className="text-xs text-gray-500 mb-3">
            {clean(sequence).length} bp
            {subParts.length > 0 && ` \u00b7 ${subParts.length} sub-parts`}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button onClick={handleAdd} disabled={!name || !clean(sequence)}
            className="flex-1 bg-blue-600 text-white rounded py-2 text-sm font-semibold
                       disabled:opacity-40 hover:bg-blue-700 transition">
            Add to assembly
          </button>
          <button onClick={onClose}
            className="px-4 py-2 border rounded text-sm hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
