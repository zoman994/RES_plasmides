/**
 * ReplacePicker — mini-modal to replace a fragment with one from the parts library.
 * Filters by type (promoter → promoters, CDS → CDS/gene, etc).
 */
import { useState } from 'react';
import { useStore } from '../store';
import { SBOLIcon } from '../sbol-glyphs';
import { getFragColor } from '../theme';

const TYPE_FILTER = {
  promoter: ['promoter'],
  terminator: ['terminator'],
  CDS: ['CDS', 'gene'],
  gene: ['CDS', 'gene'],
  marker: ['CDS', 'gene', 'marker'],
  rep_origin: ['rep_origin'],
};

export default function ReplacePicker({ fragmentIndex, fragmentType, onClose }) {
  const parts = useStore(s => s.parts);
  const replaceFragment = useStore(s => s.replaceFragment);
  const [search, setSearch] = useState('');

  const typeFilter = TYPE_FILTER[fragmentType] || [];
  const filtered = parts.filter(p =>
    p.sequence &&
    (typeFilter.length === 0 || typeFilter.includes(p.type)) &&
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleReplace = (part) => {
    replaceFragment(fragmentIndex, part);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[400px] max-h-[70vh] overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b">
          <h3 className="font-bold text-sm">Заменить фрагмент</h3>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full border rounded px-3 py-1.5 text-sm mt-2"
            placeholder={`Поиск ${fragmentType || 'всех'}...`}
            autoFocus />
        </div>
        <div className="overflow-y-auto max-h-[50vh] p-2 space-y-0.5">
          {filtered.length === 0 && (
            <div className="text-sm text-gray-400 text-center py-4">Нет подходящих</div>
          )}
          {filtered.map(p => (
            <button key={p.id} onClick={() => handleReplace(p)}
              className="w-full text-left px-3 py-2 rounded hover:bg-blue-50 transition flex items-center gap-2">
              <SBOLIcon type={p.type} size={14} color={getFragColor(p.type, 0)} />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium truncate">{p.name}</div>
                <div className="text-[9px] text-gray-400">{p.type} · {p.length || 0} п.н.</div>
              </div>
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
