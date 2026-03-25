import { useState, useMemo } from 'react';
import { FEATURE_COLORS, getFragColor } from '../theme';
import { DOMAIN_COLORS } from '../domain-detection';
import { getPartDescription } from '../part-descriptions';

const TYPE_LABELS = {
  CDS: 'CDS', promoter: 'Промоторы', terminator: 'Терминаторы',
  rep_origin: 'Ориджины', marker: 'Маркеры', signal_peptide: 'Сигналы',
  misc_feature: 'Прочее', regulatory: 'Регуляторные',
};

export default function PartsLibrary({ parts, onClose, onOpenCDSEditor, onAddToCanvas }) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [expanded, setExpanded] = useState(new Set());

  // Group and filter
  const filtered = useMemo(() => {
    let list = parts;
    if (typeFilter !== 'all') list = list.filter(p => p.type === typeFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || (p.sequence || '').toLowerCase().includes(q));
    }
    return list;
  }, [parts, typeFilter, search]);

  // Build variant tree: parts with parentId are children
  const { roots, childMap } = useMemo(() => {
    const cm = {};
    const rootList = [];
    filtered.forEach(p => {
      if (p.parentId) {
        (cm[p.parentId] = cm[p.parentId] || []).push(p);
      } else {
        rootList.push(p);
      }
    });
    return { roots: rootList, childMap: cm };
  }, [filtered]);

  // Group by type
  const grouped = useMemo(() => {
    const g = {};
    roots.forEach(p => { (g[p.type] = g[p.type] || []).push(p); });
    return g;
  }, [roots]);

  const selected = parts.find(p => p.id === selectedId);
  const toggleExpand = (id) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const types = Object.keys(FEATURE_COLORS);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 bg-black/30"
      onClick={onClose}>
      <div className="w-[850px] max-h-[85vh] bg-white rounded-xl shadow-2xl border overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
          <h3 className="text-sm font-bold text-gray-700">{'📦'} Библиотека запчастей ({parts.length})</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">{'✕'}</button>
        </div>

        {/* Filters */}
        <div className="px-5 py-2 border-b space-y-2 shrink-0">
          <input type="text" placeholder="Поиск по имени или последовательности..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full text-xs border rounded px-3 py-1.5" />
          <div className="flex gap-1 flex-wrap">
            <button onClick={() => setTypeFilter('all')}
              className={`text-[10px] px-2 py-0.5 rounded-full border ${typeFilter === 'all' ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200'}`}>
              Все
            </button>
            {types.map(tp => (
              <button key={tp} onClick={() => setTypeFilter(tp)}
                className={`text-[10px] px-2 py-0.5 rounded-full border ${typeFilter === tp ? 'text-white' : 'border-gray-200'}`}
                style={typeFilter === tp ? { backgroundColor: FEATURE_COLORS[tp], borderColor: FEATURE_COLORS[tp] } : {}}>
                {TYPE_LABELS[tp] || tp}
              </button>
            ))}
          </div>
        </div>

        {/* Main: list + detail */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: parts list */}
          <div className="w-[320px] border-r overflow-y-auto p-3">
            {Object.entries(grouped).map(([type, items]) => (
              <div key={type} className="mb-3">
                <div className="text-[9px] uppercase text-gray-400 tracking-wider font-semibold mb-1">
                  {TYPE_LABELS[type] || type}
                </div>
                {items.map(p => {
                  const children = childMap[p.id] || [];
                  const hasChildren = children.length > 0;
                  const isExpanded = expanded.has(p.id);
                  return (
                    <div key={p.id}>
                      <div onClick={() => setSelectedId(p.id)}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs
                          ${selectedId === p.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'}`}>
                        {hasChildren && (
                          <span onClick={e => { e.stopPropagation(); toggleExpand(p.id); }}
                            className="text-[10px] text-gray-400 w-3 cursor-pointer">{isExpanded ? '▼' : '▶'}</span>
                        )}
                        {!hasChildren && <span className="w-3" />}
                        <span className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: FEATURE_COLORS[p.type] || '#999' }} />
                        <span className="flex-1 truncate font-medium">{p.name}</span>
                        <span className="text-[10px] text-gray-400">{p.length >= 1000 ? `${(p.length / 1000).toFixed(1)}k` : p.length}</span>
                      </div>
                      {/* Children (variants) */}
                      {hasChildren && isExpanded && children.map(ch => (
                        <div key={ch.id} onClick={() => setSelectedId(ch.id)}
                          className={`flex items-center gap-2 pl-8 pr-2 py-1 rounded cursor-pointer text-[11px]
                            ${selectedId === ch.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-600'}`}>
                          <span className="text-gray-300">├─</span>
                          <span className="truncate">{ch.name}</span>
                          <span className="text-[10px] text-gray-400 ml-auto">{ch.length}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="text-center text-gray-400 text-xs py-8">Нет запчастей</div>
            )}
          </div>

          {/* Right: detail panel */}
          <div className="flex-1 overflow-y-auto p-4">
            {selected ? (
              <div className="space-y-3">
                <div>
                  <h4 className="text-base font-semibold">{selected.name}</h4>
                  <div className="flex gap-3 text-[11px] text-gray-500 mt-1">
                    <span className="px-1.5 py-0.5 rounded text-white text-[10px]"
                      style={{ background: FEATURE_COLORS[selected.type] || '#999' }}>
                      {TYPE_LABELS[selected.type] || selected.type}
                    </span>
                    <span>{selected.length} п.н.{selected.type === 'CDS' ? ` (${Math.floor(selected.length / 3)} а.о.)` : ''}</span>
                    {selected.organism && <span>{selected.organism}</span>}
                  </div>
                </div>

                {/* Description */}
                {(() => {
                  const desc = getPartDescription(selected.name, selected.type);
                  return desc.long ? (
                    <div className="text-[11px] text-gray-600 bg-gray-50 rounded p-2 space-y-1">
                      <div>{desc.long}</div>
                      {desc.hostRange && <div className="text-gray-400">Хозяин: {desc.hostRange}</div>}
                      {desc.note && <div className="text-amber-600">{'⚠'} {desc.note}</div>}
                    </div>
                  ) : null;
                })()}

                {/* Domain bar */}
                {selected.domains?.length > 0 && (
                  <div>
                    <div className="text-[10px] text-gray-500 mb-1">Домены:</div>
                    <div className="flex h-6 rounded overflow-hidden border">
                      {selected.domains.map((d, i) => {
                        const totalAA = Math.ceil(selected.length / 3);
                        const w = Math.max(3, ((d.endAA - d.startAA + 1) / (totalAA || 1)) * 100);
                        return (
                          <div key={i} style={{ width: `${w}%`, backgroundColor: d.color || DOMAIN_COLORS[d.type] }}
                            className="flex items-center justify-center text-[7px] text-white font-medium truncate px-0.5 border-r border-white/30 last:border-0"
                            title={`${d.name}: ${d.startAA}–${d.endAA} а.о.`}>
                            {w > 8 ? d.name : ''}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Sequence preview */}
                <div>
                  <div className="text-[10px] text-gray-500 mb-1">Последовательность:</div>
                  <div className="font-mono text-[10px] bg-gray-50 rounded p-2 max-h-[80px] overflow-y-auto break-all text-gray-600">
                    {(selected.sequence || '').slice(0, 200)}
                    {(selected.sequence || '').length > 200 && <span className="text-gray-400">...</span>}
                  </div>
                  <button onClick={() => navigator.clipboard.writeText(selected.sequence || '')}
                    className="text-[10px] text-blue-600 hover:underline mt-1">{'📋'} Скопировать</button>
                </div>

                {/* Actions */}
                <div className="flex gap-2 flex-wrap pt-2 border-t">
                  {selected.type === 'CDS' && onOpenCDSEditor && (
                    <button onClick={() => onOpenCDSEditor(selected)}
                      className="text-xs px-3 py-1.5 bg-teal-50 text-teal-700 rounded hover:bg-teal-100 border border-teal-200">
                      {'📐'} Редактор доменов
                    </button>
                  )}
                  {onAddToCanvas && (
                    <button onClick={() => { onAddToCanvas(selected); onClose(); }}
                      className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 border border-blue-200">
                      {'📤'} На canvas
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-400 text-sm py-12">
                Выберите запчасть из списка
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
