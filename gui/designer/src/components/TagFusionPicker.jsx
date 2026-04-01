/**
 * TagFusionPicker — add protein tags, fusion partners, or linkers to a CDS fragment.
 */
import { useState } from 'react';
import { useStore } from '../store';

const TAG_PRESETS = [
  // C-terminal tags
  { name: 'His6-tag', sequence: 'CACCACCACCACCACCAC', position: 'C-term', type: 'tag' },
  { name: 'FLAG-tag', sequence: 'GACTACAAGGACGACGATGACAAG', position: 'C-term', type: 'tag' },
  { name: 'Strep-tag II', sequence: 'TGGAGCCACCCGCAGTTCGAGAAG', position: 'C-term', type: 'tag' },
  { name: 'V5-tag', sequence: 'GGTAAGCCTATCCCTAACCCTCTCCTCGGTCTCGATTCTACG', position: 'C-term', type: 'tag' },
  { name: 'Myc-tag', sequence: 'GAACAAAAACTCATCTCAGAAGAGGATCTG', position: 'C-term', type: 'tag' },
  { name: 'HA-tag', sequence: 'TACCCATACGATGTTCCAGATTACGCT', position: 'C-term', type: 'tag' },

  // N-terminal tags
  { name: 'His6-tag (N)', sequence: 'CACCACCACCACCACCAC', position: 'N-term', type: 'tag' },

  // Cleavage sites
  { name: 'TEV site', sequence: 'GAAAACCTGTATTTTCAGAGC', position: 'linker', type: 'cleavage_site' },
  { name: 'Thrombin site', sequence: 'CTGGTGCCGCGCGGCAGC', position: 'linker', type: 'cleavage_site' },

  // Linkers
  { name: '(G4S)x3', sequence: 'GGTGGCGGTGGCTCGGGCGGTGGTGGGTCGGGTGGCGGCGGATCG', position: 'linker', type: 'linker' },
  { name: '(G4S)x1', sequence: 'GGTGGCGGTGGCTCG', position: 'linker', type: 'linker' },
];

export default function TagFusionPicker({ fragmentIndex, fragment, onClose }) {
  const [position, setPosition] = useState('C-term');
  const updateActive = useStore(s => s.updateActive);
  const fragments = useStore(s => {
    const asm = s.assemblies.find(a => a.id === s.activeId);
    return asm?.fragments || [];
  });

  const presets = TAG_PRESETS.filter(t =>
    position === 'N-term' ? t.position !== 'C-term' : t.position !== 'N-term'
  );

  const handleApply = (tag) => {
    useStore.getState().pushUndo?.();
    const frag = fragments[fragmentIndex];
    if (!frag) return;

    let newSeq, newAnns;
    const tagLen = tag.sequence.length;

    if (position === 'N-term') {
      // Insert at start (after ATG if present)
      const insertPos = frag.sequence?.slice(0, 3).toUpperCase() === 'ATG' ? 3 : 0;
      newSeq = frag.sequence.slice(0, insertPos) + tag.sequence + frag.sequence.slice(insertPos);
      // Shift all existing annotations by tagLen
      newAnns = (frag.annotations || []).map(a => ({
        ...a,
        start: a.start >= insertPos ? a.start + tagLen : a.start,
        end: a.end > insertPos ? a.end + tagLen : a.end,
      }));
      // Add tag annotation
      newAnns.push({
        name: tag.name, type: tag.type, start: insertPos, end: insertPos + tagLen,
        level: 'detail', auto: false, source: 'manual',
      });
    } else {
      // Insert before stop codon (last 3 nt if it's a stop)
      const seq = frag.sequence || '';
      const STOPS = ['TAA', 'TAG', 'TGA'];
      const lastCodon = seq.slice(-3).toUpperCase();
      const insertPos = STOPS.includes(lastCodon) ? seq.length - 3 : seq.length;
      newSeq = seq.slice(0, insertPos) + tag.sequence + seq.slice(insertPos);
      newAnns = (frag.annotations || []).map(a => ({
        ...a,
        end: a.end > insertPos ? a.end + tagLen : a.end,
      }));
      newAnns.push({
        name: tag.name, type: tag.type, start: insertPos, end: insertPos + tagLen,
        level: 'detail', auto: false, source: 'manual',
      });
    }

    updateActive({
      fragments: fragments.map((f, i) => i === fragmentIndex
        ? { ...f, sequence: newSeq, length: newSeq.length, annotations: newAnns }
        : f),
      calculated: false,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[380px] max-h-[70vh] overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b">
          <h3 className="font-bold text-sm">Добавить тег / fusion</h3>
          <div className="text-[10px] text-gray-500 mt-1">{fragment.name} ({fragment.type})</div>
          <div className="flex gap-1 mt-2">
            <button onClick={() => setPosition('C-term')}
              className={`text-xs px-3 py-1 rounded-full ${position === 'C-term' ? 'bg-blue-100 text-blue-700 font-semibold' : 'bg-gray-100'}`}>
              C-конец
            </button>
            <button onClick={() => setPosition('N-term')}
              className={`text-xs px-3 py-1 rounded-full ${position === 'N-term' ? 'bg-blue-100 text-blue-700 font-semibold' : 'bg-gray-100'}`}>
              N-конец
            </button>
          </div>
        </div>
        <div className="overflow-y-auto max-h-[45vh] p-2 space-y-0.5">
          {presets.map((t, i) => (
            <button key={i} onClick={() => handleApply(t)}
              className="w-full text-left px-3 py-2 rounded hover:bg-blue-50 transition">
              <div className="text-xs font-medium">{t.name}</div>
              <div className="text-[9px] text-gray-400 font-mono truncate">{t.sequence.slice(0, 30)}...</div>
              <div className="text-[9px] text-gray-400">{t.type} · {t.sequence.length} п.н.</div>
            </button>
          ))}
        </div>
        <div className="p-3 border-t">
          <button onClick={onClose} className="text-xs text-gray-500 hover:text-gray-700">Отмена</button>
        </div>
      </div>
    </div>
  );
}
