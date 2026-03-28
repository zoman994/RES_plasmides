import { useDrag } from 'react-dnd';
import { useState, useMemo } from 'react';
import { FEATURE_COLORS, getColor } from '../theme';
import { t } from '../i18n';
import { getPCRProducts, getVerifiedPlasmids } from '../inventory';
import { getPartDescription } from '../part-descriptions';
import { SBOLIcon } from '../sbol-glyphs';
import { getCollections, createCollection, addToCollection, removeFromCollection } from '../collections';
import { useStore } from '../store';

/** Wrapper that makes children draggable as a PART to canvas. */
function DraggableHandle({ part, children }) {
  const [{ isDragging }, drag] = useDrag({
    type: 'PART', item: { part },
    collect: m => ({ isDragging: m.isDragging() }),
  });
  return (
    <span ref={drag} style={{ opacity: isDragging ? 0.4 : 1 }} className="cursor-grab">
      {children}
    </span>
  );
}

const STUDENT_TYPES = new Set(['CDS', 'gene', 'promoter', 'terminator', 'marker', 'rep_origin']);

export default function PartsPalette() {
  // ═══ Store selectors (granular) ═══
  const parts            = useStore(s => s.parts);
  const expertMode       = useStore(s => s.expertMode);
  const assemblies       = useStore(s => s.assemblies);
  const inventoryVersion = useStore(s => s.inventoryVersion);

  // ═══ Store actions ═══
  const setModalMode     = useStore(s => s.setModalMode);
  const setShowPartsLib  = useStore(s => s.setShowPartsLib);
  const toggleExpertMode = useStore(s => s.toggleExpertMode);
  const addFragment      = useStore(s => s.addFragment);
  const setGlobalCDSPart = useStore(s => s.setGlobalCDSPart);

  const [search, setSearch] = useState('');
  const [activeCollId, setActiveCollId] = useState(null);
  const [collVer, setCollVer] = useState(0);
  const [expandedId, setExpandedId] = useState(null);

  const collections = useMemo(() => getCollections(), [collVer]);

  const filtered = useMemo(() => {
    let list = parts;
    if (activeCollId) {
      const coll = collections.find(c => c.id === activeCollId);
      if (coll) list = parts.filter(p => coll.partIds.includes(p.id));
    }
    if (search) list = list.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [parts, activeCollId, collections, search]);

  const grouped = {};
  filtered.forEach(p => { (grouped[p.type] = grouped[p.type] || []).push(p); });

  const pcrProducts = useMemo(() => getPCRProducts(), [inventoryVersion]);
  const plasmids = useMemo(() => getVerifiedPlasmids(), [inventoryVersion]);

  const handleCreateColl = () => {
    const name = prompt('Название коллекции:', `Проект ${collections.length + 1}`);
    if (!name) return;
    const c = createCollection(name);
    setActiveCollId(c.id);
    setCollVer(v => v + 1);
  };

  const handleAddToColl = (partId) => {
    if (!activeCollId) return;
    addToCollection(activeCollId, partId);
    setCollVer(v => v + 1);
  };

  const handleRemoveFromColl = (collId, partId) => {
    removeFromCollection(collId, partId);
    setCollVer(v => v + 1);
  };

  return (
    <div className="w-52 border-r border-gray-200 p-3 overflow-y-auto shrink-0 flex flex-col" style={{ backgroundColor: '#fdfdfe' }}>
      <h3 className="text-sm font-bold text-gray-700 mb-2">{t('Parts Library')}</h3>

      {/* Collection selector */}
      <div className="flex items-center gap-1 mb-2">
        <select value={activeCollId || ''} onChange={e => setActiveCollId(e.target.value || null)}
          className="flex-1 text-[10px] border rounded px-1.5 py-1 bg-white">
          <option value="">Все запчасти</option>
          {collections.map(c => <option key={c.id} value={c.id}>{'📁'} {c.name} ({c.partIds.length})</option>)}
        </select>
        <button onClick={handleCreateColl} className="text-[10px] px-1.5 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100" title="Новая коллекция">+</button>
      </div>

      <input type="text" placeholder={t('Search...')} value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full text-xs p-1.5 border rounded mb-3 outline-none focus:border-blue-400" />

      <div className="flex-1 overflow-y-auto">
        {Object.entries(grouped).filter(([type]) => expertMode || STUDENT_TYPES.has(type)).map(([type, items]) => (
          <div key={type}>
            <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-3 mb-1 font-semibold">
              {t(type)}
            </div>
            {items.filter(p => !p.parentId).map(p => {
              const children = parts.filter(c => c.parentId === p.id);
              const usedIn = assemblies.filter(a => (a.fragments || []).some(f => f.name === p.name || f.partId === p.id));
              const isExpanded = expandedId === p.id;
              const color = getColor(p);
              return (
              <div key={p.id}>
                {/* Part row — click to expand, drag to add */}
                <div className="flex items-center gap-1.5 px-2 py-1.5 mb-0.5 rounded cursor-pointer
                  bg-white border border-gray-100 hover:border-gray-300 hover:shadow-sm transition group/item"
                  onClick={() => setExpandedId(isExpanded ? null : p.id)}>
                  <DraggableHandle part={p}>
                    <SBOLIcon type={p.type} size={14} color={color} />
                  </DraggableHandle>
                  <span className="text-xs font-medium truncate flex-1">{p.name}</span>
                  <span className="text-[10px] text-gray-400">{p.length}</span>
                  {children.length > 0 && (
                    <span className="w-4 h-4 rounded-full bg-purple-100 text-purple-700 text-[8px] font-bold flex items-center justify-center">{children.length}</span>
                  )}
                  {usedIn.length > 0 && (
                    <span className="w-2 h-2 rounded-full bg-blue-400" title={`В ${usedIn.length} сборках`} />
                  )}
                  <span className={`text-[9px] text-gray-300 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>{'▶'}</span>
                </div>

                {/* Expanded card */}
                {isExpanded && (
                  <div className="ml-1 mr-0.5 mb-2 bg-gray-50 rounded-lg border border-gray-100 p-2 text-[10px]">
                    <div className="text-gray-500 mb-1.5">
                      {p.type} · {p.length} п.н.{p.organism ? ` · ${p.organism}` : ''}
                    </div>

                    {/* Variants */}
                    {children.length > 0 && (
                      <div className="mb-2">
                        <div className="text-[9px] font-semibold text-purple-600 mb-0.5 uppercase tracking-wider">Варианты ({children.length})</div>
                        {children.map(ch => (
                          <DraggableHandle key={ch.id} part={ch}>
                            <div className="flex items-center justify-between py-0.5 pl-2 border-l-2 border-purple-200 hover:bg-purple-50 rounded-r cursor-pointer"
                              onClick={e => { e.stopPropagation(); addFragment?.(ch); }}>
                              <span className="truncate">{ch.name} <span className="text-gray-400">{ch.length}</span></span>
                              <div className="flex items-center gap-0.5 shrink-0">
                                {ch.modification && <span className="text-[8px] text-purple-500 truncate max-w-[60px]">{ch.modification.description}</span>}
                                {ch.testResults?.[0] && (
                                  <span className={`text-[8px] px-1 rounded-full ${
                                    ch.testResults[0].result === 'active' ? 'bg-green-100 text-green-700' :
                                    ch.testResults[0].result === 'inactive' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                                    {ch.testResults[0].result === 'active' ? '✓' : ch.testResults[0].result === 'inactive' ? '✗' : '?'}
                                  </span>
                                )}
                              </div>
                            </div>
                          </DraggableHandle>
                        ))}
                      </div>
                    )}

                    {/* Used in assemblies */}
                    {usedIn.length > 0 && (
                      <div className="mb-2">
                        <div className="text-[9px] font-semibold text-blue-600 mb-0.5 uppercase tracking-wider">Используется ({usedIn.length})</div>
                        {usedIn.map(asm => (
                          <div key={asm.id} className="flex items-center justify-between py-0.5 pl-2 border-l-2 border-blue-200 text-gray-600">
                            <span className="truncate">{asm.name} <span className="text-gray-400">{(asm.fragments || []).length} фр.</span></span>
                            <span className={`text-[8px] px-1 rounded-full ${asm.completed ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                              {asm.completed ? '✓' : '⏳'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-1 pt-1 border-t border-gray-200">
                      <button onClick={e => { e.stopPropagation(); addFragment?.(p); }}
                        className="text-[9px] bg-blue-500 text-white px-2 py-0.5 rounded hover:bg-blue-600">+ Canvas</button>
                      <button onClick={e => { e.stopPropagation(); setGlobalCDSPart(p); }}
                        className="text-[9px] border border-gray-300 px-2 py-0.5 rounded hover:bg-gray-100">{'✏️'}</button>
                    </div>
                  </div>
                )}
              </div>
            );})}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-xs text-gray-400 text-center mt-6">
            {activeCollId ? 'Коллекция пуста — добавьте запчасти' : 'Ничего не найдено'}
          </div>
        )}
        {!expertMode && Object.keys(grouped).some(t => !STUDENT_TYPES.has(t)) && (
          <div className="text-[9px] text-gray-400 mt-3 px-1 py-2 bg-gray-50 rounded">
            {'🎓'} Базовые элементы.{' '}
            <button onClick={toggleExpertMode} className="text-purple-500 hover:underline">
              Показать все →
            </button>
          </div>
        )}
      </div>

      {/* Inventory */}
      {!activeCollId && pcrProducts.length > 0 && (
        <div>
          <div className="text-[10px] text-amber-600 uppercase tracking-wider font-semibold mt-4 mb-1">
            {'🧪'} ПЦР-продукты
          </div>
          {pcrProducts.map(item => (
            <DraggablePart key={item.id} part={{
              id: item.id, name: item.name, type: 'pcr_product',
              sequence: item.sequence, length: item.length,
              needsAmplification: false, sourceAssemblyId: item.sourceAssemblyId,
            }} />
          ))}
        </div>
      )}
      {!activeCollId && plasmids.length > 0 && (
        <div>
          <div className="text-[10px] text-purple-600 uppercase tracking-wider font-semibold mt-4 mb-1">
            {'💊'} Плазмиды
          </div>
          {plasmids.map(item => (
            <DraggablePart key={item.id} part={{
              id: item.id, name: item.name, type: 'plasmid',
              sequence: item.sequence, length: item.length,
              needsAmplification: false, sourceAssemblyId: item.sourceAssemblyId,
            }} />
          ))}
        </div>
      )}

      {/* Bottom links */}
      <div className="mt-3 pt-3 border-t space-y-1">
        <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1 font-semibold">
          {t('Custom sources')}
        </div>
        <button onClick={() => setModalMode('composite')}
          className="w-full text-left text-xs p-2 rounded border border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 transition">
          {'🧪'} {t('From PCR product / tube')}
        </button>
        <button onClick={() => setModalMode('construct')}
          className="w-full text-left text-xs p-2 rounded border border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 transition">
          {'📋'} {t('From existing construct')}
        </button>
        <button onClick={() => setModalMode('sequence')}
          className="w-full text-left text-xs p-2 rounded border border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 transition">
          {'✏️'} {t('Paste custom sequence')}
        </button>
        <button onClick={() => setShowPartsLib(true)}
          className="w-full text-center text-[10px] text-blue-600 hover:underline mt-2">
          {'📦'} Полная библиотека →
        </button>
      </div>
    </div>
  );
}
