import { useState, useMemo } from 'react';
import { FEATURE_COLORS, getFragColor } from '../theme';
import { DOMAIN_COLORS } from '../domain-detection';
import { getPartDescription } from '../part-descriptions';
import { SBOLIcon, GLYPH_KEYS, GLYPH_LABELS } from '../sbol-glyphs';

const TYPE_LABELS = {
  CDS: 'CDS', promoter: 'Промоторы', terminator: 'Терминаторы',
  rep_origin: 'Ориджины', marker: 'Маркеры', signal_peptide: 'Сигналы',
  misc_feature: 'Прочее', regulatory: 'Регуляторные',
  pcr_product: 'ПЦР-продукты', plasmid: 'Плазмиды',
  assembled_product: 'Продукты сборки',
};

const CUSTOM_TYPES_KEY = 'pvcs-custom-part-types';
function loadCustomTypes() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_TYPES_KEY) || '[]'); } catch { return []; }
}
function saveCustomType(value, label, color, glyph) {
  const arr = loadCustomTypes();
  if (arr.some(t => t.value === value)) return;
  arr.push({ value, label, color, glyph: glyph || 'misc_feature' });
  localStorage.setItem(CUSTOM_TYPES_KEY, JSON.stringify(arr));
}
function removeCustomType(value) {
  const arr = loadCustomTypes().filter(t => t.value !== value);
  localStorage.setItem(CUSTOM_TYPES_KEY, JSON.stringify(arr));
}

export default function PartsLibrary({ parts, onClose, onOpenCDSEditor, onAddToCanvas, onUpdatePart }) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [expanded, setExpanded] = useState(new Set());
  const [editingDesc, setEditingDesc] = useState(false);
  const [descText, setDescText] = useState('');
  const [customTypes, setCustomTypes] = useState(() => loadCustomTypes());
  const [showNewType, setShowNewType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeColor, setNewTypeColor] = useState('#6929c4');
  const [newTypeGlyph, setNewTypeGlyph] = useState('misc_feature');

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

  const builtinTypes = Object.keys(FEATURE_COLORS);
  const allTypeLabels = { ...TYPE_LABELS };
  const allTypeColors = { ...FEATURE_COLORS };
  customTypes.forEach(ct => { allTypeLabels[ct.value] = ct.label; allTypeColors[ct.value] = ct.color; });

  const handleAddType = () => {
    const name = newTypeName.trim();
    if (!name) return;
    const value = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-zа-яё0-9_]/gi, '');
    if (!value || allTypeLabels[value]) return;
    saveCustomType(value, name, newTypeColor, newTypeGlyph);
    setCustomTypes(loadCustomTypes());
    setShowNewType(false);
    setNewTypeName('');
    setTypeFilter(value);
  };

  const handleRemoveType = (value) => {
    removeCustomType(value);
    setCustomTypes(loadCustomTypes());
    if (typeFilter === value) setTypeFilter('all');
  };

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
          <div className="flex gap-1 flex-wrap items-center">
            <button onClick={() => setTypeFilter('all')}
              className={`text-[10px] px-2 py-0.5 rounded-full border ${typeFilter === 'all' ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200'}`}>
              Все
            </button>
            {builtinTypes.map(tp => (
              <button key={tp} onClick={() => setTypeFilter(tp)}
                className={`text-[10px] px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${typeFilter === tp ? 'text-white' : 'border-gray-200'}`}
                style={typeFilter === tp ? { backgroundColor: FEATURE_COLORS[tp], borderColor: FEATURE_COLORS[tp] } : {}}>
                <SBOLIcon type={tp} size={10} color={typeFilter === tp ? '#fff' : FEATURE_COLORS[tp]} />
                {TYPE_LABELS[tp] || tp}
              </button>
            ))}
            {customTypes.map(ct => (
              <span key={ct.value} className="inline-flex items-center gap-0.5">
                <button onClick={() => setTypeFilter(ct.value)}
                  className={`text-[10px] px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${typeFilter === ct.value ? 'text-white' : 'border-gray-200'}`}
                  style={typeFilter === ct.value ? { backgroundColor: ct.color, borderColor: ct.color } : {}}>
                  <SBOLIcon type={ct.glyph || 'misc_feature'} size={10} color={typeFilter === ct.value ? '#fff' : ct.color} />
                  {ct.label}
                </button>
                <button onClick={() => handleRemoveType(ct.value)}
                  className="text-[9px] text-gray-300 hover:text-red-500" title="Удалить раздел">{'×'}</button>
              </span>
            ))}
            <button onClick={() => setShowNewType(v => !v)}
              className="text-[10px] px-2 py-0.5 rounded-full border border-dashed border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400"
              title="Создать раздел">+</button>
          </div>
          {showNewType && (
            <div className="bg-gray-50 rounded-lg p-2 space-y-2">
              <div className="flex items-center gap-2">
                <input type="color" value={newTypeColor} onChange={e => setNewTypeColor(e.target.value)}
                  className="w-5 h-5 border-0 p-0 rounded cursor-pointer" title="Цвет" />
                <input type="text" value={newTypeName} onChange={e => setNewTypeName(e.target.value)}
                  placeholder="Название раздела..." className="text-xs border rounded px-2 py-1 flex-1"
                  onKeyDown={e => { if (e.key === 'Enter') handleAddType(); if (e.key === 'Escape') setShowNewType(false); }}
                  autoFocus />
                <button onClick={handleAddType}
                  className="text-[10px] px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">Создать</button>
                <button onClick={() => setShowNewType(false)}
                  className="text-[10px] text-gray-400 hover:text-gray-600">Отмена</button>
              </div>
              <div>
                <span className="text-[9px] text-gray-400 mb-1 block">Глиф (SBOL Visual):</span>
                <div className="flex flex-wrap gap-0.5">
                {GLYPH_KEYS.map(gk => (
                  <button key={gk} type="button" onClick={() => setNewTypeGlyph(gk)}
                    className={`p-1 rounded ${newTypeGlyph === gk ? 'bg-blue-100 ring-2 ring-blue-400' : 'hover:bg-gray-200'}`}
                    title={GLYPH_LABELS[gk]}>
                    <SBOLIcon type={gk} size={14} color={newTypeGlyph === gk ? newTypeColor : '#666'} />
                  </button>
                ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Main: list + detail */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: parts list */}
          <div className="w-[320px] border-r overflow-y-auto p-3">
            {Object.entries(grouped).map(([type, items]) => (
              <div key={type} className="mb-3">
                <div className="text-[9px] uppercase text-gray-400 tracking-wider font-semibold mb-1">
                  {allTypeLabels[type] || type}
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
                        <span className="shrink-0">
                          <SBOLIcon type={p.type} size={14} color={allTypeColors[p.type] || '#999'} />
                        </span>
                        <span className="flex-1 truncate font-medium">{p.name}</span>
                        <span className="text-[10px] text-gray-400">{p.length}</span>
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
                  <div className="flex items-center gap-2">
                    <SBOLIcon type={selected.type} size={22} color={allTypeColors[selected.type] || '#999'} />
                    <h4 className="text-base font-semibold">{selected.name}</h4>
                  </div>
                  <div className="flex gap-3 text-[11px] text-gray-500 mt-1">
                    <span className="px-1.5 py-0.5 rounded text-white text-[10px] inline-flex items-center gap-1"
                      style={{ background: allTypeColors[selected.type] || '#999' }}>
                      <SBOLIcon type={selected.type} size={10} color="#fff" />
                      {allTypeLabels[selected.type] || selected.type}
                    </span>
                    <span>{selected.length} п.н.{selected.type === 'CDS' ? ` (${Math.floor(selected.length / 3)} а.о.)` : ''}</span>
                    {selected.organism && <span>{selected.organism}</span>}
                  </div>
                </div>

                {/* Description (editable) */}
                {editingDesc ? (
                  <div>
                    <textarea value={descText} onChange={e => setDescText(e.target.value)}
                      className="w-full border rounded p-2 text-[11px] min-h-[60px] outline-none focus:border-blue-400 resize-y"
                      placeholder="Описание: функция, условия, хозяин, особенности..."
                      autoFocus />
                    <div className="flex gap-2 mt-1">
                      <button onClick={() => { onUpdatePart?.(selected.id, { description: descText }); setEditingDesc(false); }}
                        className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded">{'💾'} Сохранить</button>
                      <button onClick={() => setEditingDesc(false)}
                        className="text-[10px] text-gray-500 px-2 py-0.5">Отмена</button>
                    </div>
                  </div>
                ) : (
                  <div onClick={() => { setEditingDesc(true); setDescText(selected.description || getPartDescription(selected.name, selected.type).long || ''); }}
                    className="text-[11px] text-gray-600 bg-gray-50 rounded p-2 cursor-pointer hover:bg-gray-100 border border-transparent hover:border-gray-200 min-h-[40px]"
                    title="Нажмите чтобы редактировать">
                    {selected.description || getPartDescription(selected.name, selected.type).long || (
                      <span className="text-gray-400 italic">Нажмите чтобы добавить описание...</span>
                    )}
                    {(() => {
                      const desc = getPartDescription(selected.name, selected.type);
                      return desc.hostRange ? <div className="text-gray-400 mt-1">Хозяин: {desc.hostRange}</div> : null;
                    })()}
                  </div>
                )}

                {/* Variant info */}
                {selected.parentId && (
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 text-[10px]">
                      Вариант
                    </span>
                    {selected.modification && (
                      <span className="text-gray-500">{selected.modification.description}</span>
                    )}
                    <button onClick={() => { const p = parts.find(x => x.id === selected.parentId); if (p) setSelectedId(p.id); }}
                      className="text-[10px] text-blue-600 hover:underline ml-auto">
                      Родитель
                    </button>
                  </div>
                )}

                {/* Test results */}
                {selected.testResults?.length > 0 && (
                  <div>
                    <div className="text-[10px] text-gray-500 mb-1">Результаты тестов:</div>
                    <div className="space-y-1">
                      {selected.testResults.map((tr, ti) => (
                        <div key={ti} className="flex items-center gap-2 text-[11px] bg-gray-50 rounded p-1.5">
                          <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium ${
                            tr.result === 'active' ? 'bg-green-100 text-green-700' :
                            tr.result === 'inactive' ? 'bg-red-100 text-red-700' :
                            tr.result === 'enhanced' ? 'bg-blue-100 text-blue-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>
                            {tr.result === 'active' ? 'Активен' : tr.result === 'inactive' ? 'Неактивен' :
                             tr.result === 'enhanced' ? 'Усилен' : 'Снижен'}
                          </span>
                          {tr.activity != null && <span className="text-gray-600">{Math.round(tr.activity * 100)}%</span>}
                          {tr.notes && <span className="text-gray-400 truncate">{tr.notes}</span>}
                          <span className="text-[9px] text-gray-300 ml-auto">{tr.date?.slice(0, 10)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

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

                {/* Components (for assembled products) */}
                {selected.components?.length > 0 && (
                  <div>
                    <div className="text-[10px] text-gray-500 mb-1">Собран из:</div>
                    <div className="flex gap-1 flex-wrap">
                      {selected.components.map((c, i) => (
                        <span key={i} className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                          {c}
                        </span>
                      ))}
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
