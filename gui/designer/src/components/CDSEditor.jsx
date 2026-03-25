import { useState, useMemo } from 'react';
import { translateDNA } from '../codons';
import { autoDetectDomains, DOMAIN_COLORS } from '../domain-detection';

const DOMAIN_TYPES = [
  { value: 'signal', label: 'Сигнальный пептид' },
  { value: 'propeptide', label: 'Пропептид' },
  { value: 'domain', label: 'Домен' },
  { value: 'linker', label: 'Линкер' },
  { value: 'tag', label: 'Тег (His, FLAG...)' },
  { value: 'binding', label: 'Связывающий домен' },
  { value: 'transmembrane', label: 'Трансмембранный' },
  { value: 'custom', label: 'Другое' },
];

export default function CDSEditor({ fragment, onSave, onClose }) {
  const seq = fragment.sequence || '';
  const protein = useMemo(() => translateDNA(seq), [seq]);
  const [domains, setDomains] = useState(fragment.domains || []);
  const [addForm, setAddForm] = useState(null);

  const totalAA = protein.length;

  const handleAutoDetect = () => {
    const detected = autoDetectDomains(seq, fragment.name);
    setDomains(detected);
  };

  const addDomain = () => {
    if (!addForm || !addForm.name || addForm.startAA >= addForm.endAA) return;
    const d = {
      name: addForm.name, type: addForm.type || 'domain',
      startAA: addForm.startAA, endAA: addForm.endAA,
      color: DOMAIN_COLORS[addForm.type] || DOMAIN_COLORS.custom,
    };
    setDomains(prev => [...prev, d].sort((a, b) => a.startAA - b.startAA));
    setAddForm(null);
  };

  const removeDomain = (i) => setDomains(prev => prev.filter((_, idx) => idx !== i));

  const updateDomain = (i, field, value) => {
    setDomains(prev => prev.map((d, idx) => idx === i ? { ...d, [field]: value,
      color: field === 'type' ? (DOMAIN_COLORS[value] || d.color) : d.color } : d));
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[700px] max-h-[85vh] overflow-y-auto p-6"
        onClick={e => e.stopPropagation()}>

        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="font-bold text-lg">{'📐'} Домены CDS: {fragment.name}</h3>
            <div className="text-sm text-gray-500">{seq.length} п.н., {totalAA} а.о.</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">{'✕'}</button>
        </div>

        {/* Domain visualization bar */}
        {domains.length > 0 && (
          <div className="mb-4">
            <div className="flex h-8 rounded overflow-hidden border">
              {domains.map((d, i) => {
                const widthPct = Math.max(2, ((d.endAA - d.startAA + 1) / totalAA) * 100);
                return (
                  <div key={i} style={{ width: `${widthPct}%`, backgroundColor: d.color }}
                    className="flex items-center justify-center text-[8px] text-white font-medium truncate px-0.5 border-r border-white/30"
                    title={`${d.name} (${d.type}): ${d.startAA}–${d.endAA} а.о.`}>
                    {widthPct > 6 ? d.name : ''}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[8px] text-gray-400 mt-0.5">
              <span>1</span>
              <span>{totalAA} а.о.</span>
            </div>
          </div>
        )}

        {/* Protein sequence with domain coloring */}
        <div className="mb-4">
          <div className="text-xs text-gray-500 mb-1">Белковая последовательность:</div>
          <div className="font-mono text-[10px] leading-relaxed bg-gray-50 p-3 rounded max-h-[120px] overflow-y-auto break-all">
            {protein.split('').map((aa, i) => {
              const pos = i + 1;
              const dom = domains.find(d => pos >= d.startAA && pos <= d.endAA);
              return (
                <span key={i} style={{
                  backgroundColor: dom ? dom.color + '30' : 'transparent',
                  borderBottom: dom ? `2px solid ${dom.color}` : 'none',
                }} title={dom ? `${dom.name} (${dom.type}) — позиция ${pos}` : `позиция ${pos}`}>
                  {aa}
                </span>
              );
            })}
          </div>
        </div>

        {/* Domain table */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-600">Домены ({domains.length})</span>
            <div className="flex gap-2">
              <button onClick={handleAutoDetect}
                className="text-[10px] px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100">
                {'🔍'} Авто-детекция
              </button>
              <button onClick={() => setAddForm({ name: '', type: 'domain', startAA: 1, endAA: totalAA })}
                className="text-[10px] px-2 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100">
                + Добавить домен
              </button>
            </div>
          </div>

          {domains.length > 0 && (
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-gray-400 text-[9px] uppercase">
                  <th className="text-left p-1">#</th>
                  <th className="text-left p-1">Имя</th>
                  <th className="text-left p-1">Тип</th>
                  <th className="text-right p-1">Начало</th>
                  <th className="text-right p-1">Конец</th>
                  <th className="text-right p-1">Длина</th>
                  <th className="p-1 w-6"></th>
                </tr>
              </thead>
              <tbody>
                {domains.map((d, i) => (
                  <tr key={i} className="border-t hover:bg-gray-50">
                    <td className="p-1">
                      <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: d.color }} />
                    </td>
                    <td className="p-1">
                      <input value={d.name} onChange={e => updateDomain(i, 'name', e.target.value)}
                        className="text-[11px] border rounded px-1 py-0.5 w-32" />
                    </td>
                    <td className="p-1">
                      <select value={d.type} onChange={e => updateDomain(i, 'type', e.target.value)}
                        className="text-[10px] border rounded px-1 py-0.5">
                        {DOMAIN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </td>
                    <td className="p-1 text-right">
                      <input type="number" value={d.startAA} min={1} max={totalAA}
                        onChange={e => updateDomain(i, 'startAA', +e.target.value)}
                        className="w-14 text-[11px] border rounded px-1 py-0.5 text-right" />
                    </td>
                    <td className="p-1 text-right">
                      <input type="number" value={d.endAA} min={1} max={totalAA}
                        onChange={e => updateDomain(i, 'endAA', +e.target.value)}
                        className="w-14 text-[11px] border rounded px-1 py-0.5 text-right" />
                    </td>
                    <td className="p-1 text-right text-gray-500">{d.endAA - d.startAA + 1} а.о.</td>
                    <td className="p-1">
                      <button onClick={() => removeDomain(i)} className="text-gray-300 hover:text-red-500">{'✕'}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {domains.length === 0 && (
            <div className="text-center text-gray-400 text-xs py-4">
              Нет доменов. Нажмите «Авто-детекция» или добавьте вручную.
            </div>
          )}
        </div>

        {/* Add domain form */}
        {addForm && (
          <div className="border rounded p-3 bg-gray-50 mb-4 space-y-2">
            <div className="grid grid-cols-4 gap-2">
              <input placeholder="Имя домена" value={addForm.name}
                onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                className="text-xs border rounded p-1.5 col-span-2" />
              <select value={addForm.type} onChange={e => setAddForm({ ...addForm, type: e.target.value })}
                className="text-xs border rounded p-1.5">
                {DOMAIN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <div className="flex gap-1">
                <input type="number" placeholder="Нач." value={addForm.startAA} min={1} max={totalAA}
                  onChange={e => setAddForm({ ...addForm, startAA: +e.target.value })}
                  className="text-xs border rounded p-1.5 w-16" />
                <input type="number" placeholder="Кон." value={addForm.endAA} min={1} max={totalAA}
                  onChange={e => setAddForm({ ...addForm, endAA: +e.target.value })}
                  className="text-xs border rounded p-1.5 w-16" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={addDomain}
                className="text-xs px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700">Добавить</button>
              <button onClick={() => setAddForm(null)}
                className="text-xs px-3 py-1 bg-gray-200 rounded hover:bg-gray-300">Отмена</button>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button onClick={() => { onSave(domains); onClose(); }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition">
            {'💾'} Сохранить домены
          </button>
          <button onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition">
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
