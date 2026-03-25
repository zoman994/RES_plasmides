import { useState, useEffect, useMemo } from 'react';

const OLIGO_KEY = 'pvcs-oligo-registry';
const STATUSES = [
  { value: 'pending', label: '⏳ Не заказан', color: 'text-gray-500' },
  { value: 'ordered', label: '📦 Заказан', color: 'text-blue-600' },
  { value: 'shipping', label: '🚚 В доставке', color: 'text-amber-600' },
  { value: 'received', label: '✅ Получен', color: 'text-green-600' },
  { value: 'bad', label: '❌ Плохой', color: 'text-red-600' },
];

function calcTm(seq) {
  const s = (seq || '').toUpperCase();
  if (s.length < 6) return 0;
  const gc = (s.match(/[GC]/g) || []).length;
  if (s.length < 14) return 2 * (s.length - gc) + 4 * gc;
  return Math.round(64.9 + 41 * (gc - 16.4) / s.length);
}

function calcGC(seq) {
  const s = (seq || '').toUpperCase();
  if (!s.length) return 0;
  return Math.round((s.match(/[GC]/g) || []).length / s.length * 100);
}

function loadRegistry() {
  try { return JSON.parse(localStorage.getItem(OLIGO_KEY) || '[]'); } catch { return []; }
}

function saveRegistry(oligos) {
  localStorage.setItem(OLIGO_KEY, JSON.stringify(oligos));
}

/** Merge assembly primers into oligo registry (no duplicates by sequence). */
function mergeWithPrimers(registry, assemblies) {
  const merged = [...registry];
  const seqSet = new Set(merged.map(o => o.sequence));

  assemblies.forEach(asm => {
    (asm.primers || []).forEach(p => {
      if (seqSet.has(p.sequence)) return;
      seqSet.add(p.sequence);
      merged.push({
        id: `ol_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: p.name,
        sequence: p.sequence || '',
        length: p.length || (p.sequence || '').length,
        tm: p.tmBinding || calcTm(p.bindingSequence || p.sequence || ''),
        gc: p.gcPercent || calcGC(p.sequence || ''),
        direction: p.direction || 'custom',
        status: 'pending',
        orderDate: null, supplier: '', purification: 'Desalt', scale: '25nmol',
        assemblyId: asm.id, constructName: asm.name,
        notes: '', createdAt: new Date().toISOString(), updatedAt: null,
      });
    });
  });
  return merged;
}

export default function OligoManager({ assemblies, onClose }) {
  const [oligos, setOligos] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newOligo, setNewOligo] = useState({ name: '', sequence: '', notes: '' });
  const [selected, setSelected] = useState(new Set());

  // Load and merge on mount
  useEffect(() => {
    const reg = loadRegistry();
    const merged = mergeWithPrimers(reg, assemblies);
    setOligos(merged);
    saveRegistry(merged);
  }, [assemblies]);

  const save = (updated) => { setOligos(updated); saveRegistry(updated); };

  const updateOligo = (id, data) => {
    save(oligos.map(o => o.id === id ? { ...o, ...data, updatedAt: new Date().toISOString() } : o));
  };

  const addOligo = () => {
    if (!newOligo.name || !newOligo.sequence) return;
    const seq = newOligo.sequence.replace(/\s/g, '');
    const o = {
      id: `ol_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: newOligo.name, sequence: seq,
      length: seq.length, tm: calcTm(seq), gc: calcGC(seq),
      direction: 'custom', status: 'pending',
      orderDate: null, supplier: '', purification: 'Desalt', scale: '25nmol',
      assemblyId: null, constructName: 'Ручной',
      notes: newOligo.notes, createdAt: new Date().toISOString(), updatedAt: null,
    };
    save([...oligos, o]);
    setNewOligo({ name: '', sequence: '', notes: '' });
    setShowAdd(false);
  };

  const deleteOligo = (id) => { save(oligos.filter(o => o.id !== id)); };

  const bulkSetStatus = (status) => {
    const now = new Date().toISOString();
    save(oligos.map(o => selected.has(o.id)
      ? { ...o, status, orderDate: status === 'ordered' ? now.slice(0, 10) : o.orderDate, updatedAt: now }
      : o));
    setSelected(new Set());
  };

  const copyForOrder = () => {
    const toCopy = oligos.filter(o => selected.size > 0 ? selected.has(o.id) : o.status === 'pending');
    const tsv = toCopy.map(o => `${o.name}\t${o.sequence}\t${o.scale}\t${o.purification}`).join('\n');
    navigator.clipboard.writeText(tsv);
  };

  // Filtering
  const filtered = useMemo(() => {
    let list = oligos;
    if (filter !== 'all') list = list.filter(o => o.status === filter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(o => o.name.toLowerCase().includes(q) || o.sequence.toLowerCase().includes(q));
    }
    return list;
  }, [oligos, filter, search]);

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const statusBadge = (status) => {
    const s = STATUSES.find(x => x.value === status) || STATUSES[0];
    return <span className={`text-[10px] ${s.color}`}>{s.label}</span>;
  };

  return (
    <div className="border rounded-lg bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-700">{'🧬'} Реестр олигонуклеотидов ({oligos.length})</h3>
        <div className="flex gap-2">
          <button onClick={() => setShowAdd(!showAdd)}
            className="text-xs px-3 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100">
            + Добавить
          </button>
          {onClose && (
            <button onClick={onClose} className="text-xs px-2 py-1 text-gray-400 hover:text-gray-600">{'✕'}</button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 items-center flex-wrap">
        <input type="text" placeholder="Поиск по имени/последовательности..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="text-xs border rounded px-2 py-1 w-64" />
        <div className="flex gap-1">
          {[{ v: 'all', l: 'Все' }, ...STATUSES.map(s => ({ v: s.value, l: s.label }))].map(f => (
            <button key={f.v} onClick={() => setFilter(f.v)}
              className={`text-[10px] px-2 py-0.5 rounded-full border ${
                filter === f.v ? 'bg-blue-50 border-blue-400 text-blue-700' : 'border-gray-200 text-gray-500'}`}>
              {f.l}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex gap-2 items-center bg-blue-50 rounded p-2">
          <span className="text-xs text-blue-700 font-semibold">Выбрано: {selected.size}</span>
          <button onClick={() => bulkSetStatus('ordered')}
            className="text-[10px] px-2 py-0.5 bg-blue-600 text-white rounded">📦 Отметить заказанными</button>
          <button onClick={() => bulkSetStatus('received')}
            className="text-[10px] px-2 py-0.5 bg-green-600 text-white rounded">✅ Получены</button>
          <button onClick={copyForOrder}
            className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-700 rounded">📋 Скопировать TSV</button>
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="border rounded p-3 bg-gray-50 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <input placeholder="Имя (IS051_fwd...)" value={newOligo.name}
              onChange={e => setNewOligo({ ...newOligo, name: e.target.value })}
              className="text-xs border rounded p-1.5" />
            <input placeholder="Последовательность" value={newOligo.sequence}
              onChange={e => setNewOligo({ ...newOligo, sequence: e.target.value })}
              className="text-xs border rounded p-1.5 font-mono" />
            <input placeholder="Примечание" value={newOligo.notes}
              onChange={e => setNewOligo({ ...newOligo, notes: e.target.value })}
              className="text-xs border rounded p-1.5" />
          </div>
          {newOligo.sequence && (
            <div className="text-[10px] text-gray-500">
              {newOligo.sequence.replace(/\s/g, '').length} нт · Tm ~{calcTm(newOligo.sequence)}°C · GC {calcGC(newOligo.sequence)}%
            </div>
          )}
          <button onClick={addOligo}
            className="text-xs px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700">
            Добавить в реестр
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-400 uppercase text-[9px] tracking-wider">
              <th className="p-1 w-6">
                <input type="checkbox"
                  checked={selected.size === filtered.length && filtered.length > 0}
                  onChange={() => {
                    if (selected.size === filtered.length) setSelected(new Set());
                    else setSelected(new Set(filtered.map(o => o.id)));
                  }} />
              </th>
              <th className="text-left p-1">Имя</th>
              <th className="text-left p-1">Последовательность</th>
              <th className="text-right p-1">Длина</th>
              <th className="text-right p-1">Tm</th>
              <th className="text-right p-1">GC%</th>
              <th className="text-left p-1">Статус</th>
              <th className="text-left p-1">Сборка</th>
              <th className="text-left p-1">Заказ</th>
              <th className="p-1 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(o => (
              <tr key={o.id} className={`border-t hover:bg-gray-50 ${selected.has(o.id) ? 'bg-blue-50' : ''}`}>
                <td className="p-1">
                  <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleSelect(o.id)} />
                </td>
                <td className="p-1 font-semibold whitespace-nowrap">
                  {editingId === o.id ? (
                    <input value={o.name} onChange={e => updateOligo(o.id, { name: e.target.value })}
                      onBlur={() => setEditingId(null)} autoFocus
                      className="text-xs border rounded px-1 py-0.5 w-32" />
                  ) : (
                    <span onDoubleClick={() => setEditingId(o.id)} title="Двойной клик для редактирования">
                      {o.name}
                    </span>
                  )}
                </td>
                <td className="p-1 font-mono text-[9px] max-w-[200px] truncate" title={o.sequence}>
                  {o.sequence}
                </td>
                <td className="p-1 text-right">{o.length}</td>
                <td className="p-1 text-right">{o.tm}°</td>
                <td className="p-1 text-right">{o.gc}%</td>
                <td className="p-1">
                  <select value={o.status} onChange={e => updateOligo(o.id, { status: e.target.value })}
                    className="text-[10px] border rounded px-1 py-0.5">
                    {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </td>
                <td className="p-1 text-[10px] text-gray-500 truncate max-w-[100px]" title={o.constructName}>
                  {o.constructName || '—'}
                </td>
                <td className="p-1 text-[10px] text-gray-400">
                  {o.status === 'ordered' || o.status === 'received' ? (
                    <input type="date" value={o.orderDate || ''} onChange={e => updateOligo(o.id, { orderDate: e.target.value })}
                      className="text-[10px] border rounded px-1 py-0.5 w-28" />
                  ) : '—'}
                </td>
                <td className="p-1">
                  <button onClick={() => deleteOligo(o.id)}
                    className="text-gray-300 hover:text-red-500 text-xs">{'✕'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center text-gray-400 text-xs py-4">Нет олигонуклеотидов</div>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex gap-2">
        <button onClick={copyForOrder}
          className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 rounded hover:bg-blue-100">
          📋 Скопировать для заказа (TSV)
        </button>
        <button onClick={() => {
          const csv = ['Имя,Последовательность,Длина,Tm,GC%,Статус,Заказ,Поставщик,Примечание',
            ...oligos.map(o => `${o.name},${o.sequence},${o.length},${o.tm},${o.gc},${o.status},${o.orderDate || ''},${o.supplier || ''},${o.notes || ''}`)
          ].join('\n');
          const blob = new Blob([csv], { type: 'text-csv' });
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
          a.download = 'oligo_registry.csv'; a.click();
        }}
          className="text-xs px-3 py-1.5 bg-gray-50 text-gray-600 rounded hover:bg-gray-100">
          📊 Экспорт CSV
        </button>
      </div>
    </div>
  );
}
