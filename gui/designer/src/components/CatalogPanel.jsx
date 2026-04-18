import { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';

export default function CatalogPanel({ onClose }) {
  const addPart = useStore(s => s.addPart);
  const setViewerPart = useStore(s => s.setViewerPart);
  const setWizardPlasmid = useStore(s => s.setWizardPlasmid);

  const [index, setIndex] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [selected, setSelected] = useState(null); // plasmid from index
  const [fullData, setFullData] = useState(null); // full plasmid with sequence
  const [loadingFull, setLoadingFull] = useState(false);

  // Cache loaded category data
  const catCache = useRef({});

  // Load index on mount
  useEffect(() => {
    fetch('/plasmids-index.json')
      .then(r => r.json())
      .then(data => { setIndex(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Load full plasmid data when selected
  useEffect(() => {
    if (!selected) { setFullData(null); return; }
    const cat = selected.category;
    if (catCache.current[cat]) {
      const found = catCache.current[cat].plasmids.find(p => p.id === selected.id);
      setFullData(found || null);
      return;
    }
    setLoadingFull(true);
    fetch(`/plasmids-data/${cat}.json`)
      .then(r => r.json())
      .then(data => {
        catCache.current[cat] = data;
        const found = data.plasmids.find(p => p.id === selected.id);
        setFullData(found || null);
        setLoadingFull(false);
      })
      .catch(() => setLoadingFull(false));
  }, [selected]);

  const makePart = (p) => ({
    id: `catalog_${Date.now()}_${p.id}`,
    name: p.name,
    type: p.topology === 'circular' ? 'plasmid' : 'misc_feature',
    sequence: p.sequence,
    length: p.length || p.sequence?.length || 0,
    annotations: p.annotations || [],
    topology: p.topology,
    source: 'catalog',
    status: 'draft',
  });

  const handleAdd = () => {
    if (!fullData) return;
    const part = makePart(fullData);
    addPart(part);
    setSelected(null);
  };

  const handleView = () => {
    if (!fullData) return;
    const part = makePart(fullData);
    addPart(part);
    setViewerPart(part);
    onClose();
  };

  const handleClone = () => {
    if (!fullData) return;
    const part = makePart(fullData);
    addPart(part);
    useStore.getState().setWizardPresetMode('restriction_cloning');
    setWizardPlasmid(part);
    onClose();
  };

  const handleBackbone = () => {
    if (!fullData) return;
    const part = makePart(fullData);
    addPart(part);
    useStore.getState().setWizardPresetMode('use_whole');
    setWizardPlasmid(part);
    onClose();
  };

  // Filter plasmids
  const filtered = index?.plasmids?.filter(p => {
    if (catFilter && p.category !== catFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return p.name.toLowerCase().includes(q) ||
        p.features.some(f => f.toLowerCase().includes(q)) ||
        (p.description || '').toLowerCase().includes(q);
    }
    return true;
  }) || [];

  // Group by category for display
  const grouped = {};
  for (const p of filtered.slice(0, 200)) {
    if (!grouped[p.category]) grouped[p.category] = [];
    grouped[p.category].push(p);
  }

  const catName = (slug) => index?.categories?.find(c => c.slug === slug)?.name || slug;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-6 bg-black/40" onClick={onClose}>
      <div className="w-[700px] max-h-[85vh] bg-white rounded-xl shadow-2xl border overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 py-3 border-b shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-gray-700">📚 SnapGene Каталог</h2>
              <div className="text-[10px] text-gray-400">
                {index ? `${index.total} плазмид · ${index.categories.length} категорий` : 'Загрузка...'}
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
          </div>

          {/* Search + filter */}
          {index && (
            <div className="flex gap-2 mt-2">
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Поиск по имени, feature..."
                className="flex-1 text-xs border rounded px-2 py-1.5" autoFocus />
              <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
                className="text-xs border rounded px-2 py-1.5 max-w-[180px]">
                <option value="">Все категории</option>
                {index.categories.map(c => (
                  <option key={c.slug} value={c.slug}>{c.name} ({c.count})</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400 text-sm">Загрузка каталога...</div>
          ) : selected ? (
            /* Detail view */
            <div className="p-5 space-y-3">
              <button onClick={() => setSelected(null)}
                className="text-xs text-blue-500 hover:text-blue-700">← Назад к списку</button>
              <div>
                <div className="text-sm font-bold text-gray-800">{selected.name}</div>
                <div className="text-[10px] text-gray-400">
                  {selected.length?.toLocaleString()} п.н. · {fullData?.topology || selected.topology || (selected.length < 1000 ? 'linear' : 'circular')} · {selected.organism}
                </div>
                {selected.description && (
                  <div className="text-xs text-gray-500 mt-1">{selected.description.replace(/<[^>]*>/g, '').trim()}</div>
                )}
              </div>
              <div className="text-xs text-gray-500">
                Features: {selected.features?.join(', ') || 'нет'}
              </div>

              {loadingFull ? (
                <div className="text-xs text-gray-400 py-2">Загрузка последовательности...</div>
              ) : fullData ? (
                <div className="space-y-2 pt-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={handleAdd}
                      className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50/50 text-left text-xs group">
                      <span>📦</span>
                      <div>
                        <div className="font-medium text-gray-700 group-hover:text-blue-700">В библиотеку</div>
                        <div className="text-[9px] text-gray-400">draft, решить потом</div>
                      </div>
                    </button>
                    <button onClick={handleView}
                      className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50/50 text-left text-xs group">
                      <span>👁</span>
                      <div>
                        <div className="font-medium text-gray-700 group-hover:text-blue-700">Просмотреть</div>
                        <div className="text-[9px] text-gray-400">карта + аннотации</div>
                      </div>
                    </button>
                    {(fullData?.topology || selected.topology) === 'circular' && (
                      <>
                        <button onClick={handleClone}
                          className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50/50 text-left text-xs group">
                          <span>🔪</span>
                          <div>
                            <div className="font-medium text-gray-700 group-hover:text-blue-700">Клонировать</div>
                            <div className="text-[9px] text-gray-400">restriction cloning</div>
                          </div>
                        </button>
                        <button onClick={handleBackbone}
                          className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50/50 text-left text-xs group">
                          <span>⚗️</span>
                          <div>
                            <div className="font-medium text-gray-700 group-hover:text-blue-700">Как backbone</div>
                            <div className="text-[9px] text-gray-400">Gibson / GG сборка</div>
                          </div>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            /* List view */
            <div className="divide-y">
              {Object.entries(grouped).map(([cat, plasmids]) => (
                <div key={cat} className="py-2">
                  <div className="px-4 py-1 text-[10px] font-semibold text-gray-500 uppercase tracking-wide bg-gray-50">
                    {catName(cat)} ({plasmids.length}{filtered.length > 200 && plasmids === grouped[Object.keys(grouped)[Object.keys(grouped).length - 1]] ? '+' : ''})
                  </div>
                  {plasmids.map(p => (
                    <button key={p.id} onClick={() => setSelected(p)}
                      className="w-full flex items-center gap-3 px-4 py-1.5 hover:bg-blue-50 text-left transition">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-700 truncate">{p.name}</div>
                        <div className="text-[9px] text-gray-400 truncate">
                          {p.features?.slice(0, 3).join(', ')}
                        </div>
                      </div>
                      <div className="text-[9px] text-gray-400 shrink-0 text-right">
                        <div>{p.length?.toLocaleString()} bp</div>
                        <div>{p.topology} · {p.organism}</div>
                      </div>
                    </button>
                  ))}
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="py-8 text-center text-gray-400 text-xs">Ничего не найдено</div>
              )}
              {filtered.length > 200 && (
                <div className="py-2 text-center text-[10px] text-gray-400">
                  Показаны первые 200 из {filtered.length}. Уточните поиск.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2 border-t text-[9px] text-gray-300 shrink-0">
          Attribution: snapgene.com/resources — free for academic use
        </div>
      </div>
    </div>
  );
}
